# -*- coding: utf-8 -*-
"""将多个解包后的 PPTX 目录中的幻灯片合并到一个基准 PPTX 目录中。

支持统一使用基准 PPT 的配色方案（theme / slideMaster / slideLayout）。

Usage: python merge_slides.py <base_dir> --source <source_dir1> [source_dir2 ...] [options]

Options:
    --source <dirs>       一个或多个待合并的解包 PPTX 目录（必选）
    --adopt-theme         将 source 幻灯片的 layout 映射为 base 中最匹配的 layout
    --insert-at <pos>     插入位置: end (默认), start, 或具体的幻灯片编号
    --dry-run             仅预览将要执行的操作，不实际修改

Examples:
    # 合并两个 PPT 到 base，统一使用 base 的主题配色
    python merge_slides.py unpacked_a/ --source unpacked_b/ unpacked_c/ --adopt-theme

    # 合并到开头
    python merge_slides.py unpacked_a/ --source unpacked_b/ --insert-at start

    # 插入到第 3 张幻灯片之后
    python merge_slides.py unpacked_a/ --source unpacked_b/ --insert-at 3

    # 预览操作
    python merge_slides.py unpacked_a/ --source unpacked_b/ --adopt-theme --dry-run

合并流程:
    1. 从 source 复制 slide XML 到 base，重新编号
    2. 从 source 复制 media 文件到 base，文件重命名避免冲突
    3. 为每个新 slide 创建 .rels 文件，更新 media 引用和 layout 映射
    4. 更新 presentation.xml 的 <p:sldIdLst> 和 presentation.xml.rels
    5. 更新 [Content_Types].xml 注册新文件
"""

import argparse
import hashlib
import io
import os
import re
import shutil
import sys
from pathlib import Path

# Windows 终端默认编码可能不是 UTF-8，强制设置以避免中文路径乱码
if os.name == "nt" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import defusedxml.minidom


# ============================================================
# 常量
# ============================================================

# Relationship 类型常量
REL_TYPE_SLIDE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
)
REL_TYPE_SLIDE_LAYOUT = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
)
REL_TYPE_SLIDE_MASTER = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
)
REL_TYPE_NOTES_SLIDE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
)

# 需要从 source 复制的资源目录
RESOURCE_DIRS = ["media", "embeddings", "charts", "diagrams", "drawings", "ink"]

# Content Type 映射
CONTENT_TYPES = {
    ".xml": "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".emf": "image/x-emf",
    ".wmf": "image/x-wmf",
    ".svg": "image/svg+xml",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/avi",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".wma": "audio/x-ms-wma",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


# ============================================================
# 工具函数
# ============================================================

def parse_dom(file_path: Path) -> object:
    """解析 XML 文件为 DOM 对象。

    :param file_path: XML 文件路径
    :return: DOM 文档对象
    """
    return defusedxml.minidom.parse(str(file_path))


def get_file_hash(file_path: Path) -> str:
    """计算文件的 MD5 哈希值，用于去重。

    :param file_path: 文件路径
    :return: 十六进制哈希字符串
    """
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def get_next_slide_number(slides_dir: Path) -> int:
    """获取下一个可用的幻灯片编号。

    :param slides_dir: slides 目录路径
    :return: 下一个可用编号
    """
    existing = []
    for f in slides_dir.glob("slide*.xml"):
        match = re.match(r"slide(\d+)\.xml", f.name)
        if match:
            existing.append(int(match.group(1)))
    return max(existing) + 1 if existing else 1


# ============================================================
# Layout 分析与匹配
# ============================================================

def get_layout_placeholders(layout_path: Path) -> list[dict]:
    """从 slideLayout XML 中提取占位符信息。

    :param layout_path: slideLayout 文件路径
    :return: 占位符信息列表 [{"type": ..., "idx": ...}, ...]
    """
    placeholders = []
    dom = parse_dom(layout_path)
    for sp in dom.getElementsByTagName("p:sp"):
        nv_sp_pr_list = sp.getElementsByTagName("p:nvSpPr")
        if not nv_sp_pr_list:
            continue
        nv_pr_list = nv_sp_pr_list[0].getElementsByTagName("p:nvPr")
        if not nv_pr_list:
            continue
        ph_list = nv_pr_list[0].getElementsByTagName("p:ph")
        if not ph_list:
            continue
        ph = ph_list[0]
        ph_type = ph.getAttribute("type") or "body"
        ph_idx = ph.getAttribute("idx") or "0"
        placeholders.append({"type": ph_type, "idx": ph_idx})
    return placeholders


def get_layout_name(layout_path: Path) -> str:
    """从 slideLayout XML 中提取布局名称。

    :param layout_path: slideLayout 文件路径
    :return: 布局名称
    """
    dom = parse_dom(layout_path)
    cslts = dom.getElementsByTagName("p:cSld")
    if cslts:
        name = cslts[0].getAttribute("name")
        if name:
            return name
    return layout_path.stem


def analyze_layouts(layouts_dir: Path) -> list[dict]:
    """分析目录下所有 slideLayout 的占位符结构。

    :param layouts_dir: slideLayouts 目录路径
    :return: 布局信息列表
    """
    layouts = []
    if not layouts_dir.exists():
        return layouts
    for layout_file in sorted(layouts_dir.glob("slideLayout*.xml")):
        placeholders = get_layout_placeholders(layout_file)
        name = get_layout_name(layout_file)
        layouts.append({
            "file": layout_file.name,
            "name": name,
            "placeholders": placeholders,
            "ph_types": sorted(ph["type"] for ph in placeholders),
        })
    return layouts


def find_best_matching_layout(
    source_layout_info: dict,
    base_layouts: list[dict],
) -> str | None:
    """在 base 的 layouts 中找到与 source layout 最匹配的。

    匹配策略:
    1. 优先匹配名称完全相同的
    2. 其次匹配占位符类型组合完全相同的
    3. 最后按占位符类型重叠度排序

    :param source_layout_info: source 的布局信息
    :param base_layouts: base 的所有布局信息
    :return: 最佳匹配的 base layout 文件名，找不到返回 None
    """
    if not base_layouts:
        return None

    source_name = source_layout_info["name"]
    source_ph_types = source_layout_info["ph_types"]

    # 策略 1: 名称完全匹配
    for layout in base_layouts:
        if layout["name"] == source_name:
            return layout["file"]

    # 策略 2: 占位符类型组合完全匹配
    for layout in base_layouts:
        if layout["ph_types"] == source_ph_types:
            return layout["file"]

    # 策略 3: 按占位符类型重叠度排序
    best_match = None
    best_score = -1
    for layout in base_layouts:
        base_set = set(layout["ph_types"])
        source_set = set(source_ph_types)
        overlap = len(base_set & source_set)
        total = max(len(base_set | source_set), 1)
        score = overlap / total
        if score > best_score:
            best_score = score
            best_match = layout["file"]

    return best_match


# ============================================================
# Source 幻灯片信息收集
# ============================================================

def get_source_slide_files(source_dir: Path) -> list[Path]:
    """获取 source 中的所有幻灯片文件，按编号排序。

    :param source_dir: source 解包目录
    :return: 排序后的幻灯片文件路径列表
    """
    slides_dir = source_dir / "ppt" / "slides"
    if not slides_dir.exists():
        return []

    # 获取 presentation.xml 中引用的幻灯片（按顺序）
    pres_path = source_dir / "ppt" / "presentation.xml"
    pres_rels_path = source_dir / "ppt" / "_rels" / "presentation.xml.rels"

    if pres_path.exists() and pres_rels_path.exists():
        ordered_slides = _get_ordered_slides(pres_path, pres_rels_path)
        result = []
        for slide_name in ordered_slides:
            slide_path = slides_dir / slide_name
            if slide_path.exists():
                result.append(slide_path)
        return result

    # 回退: 按编号排序
    return sorted(
        slides_dir.glob("slide*.xml"),
        key=lambda f: int(m.group(1)) if (m := re.match(r"slide(\d+)\.xml", f.name)) else 0,
    )


def _get_ordered_slides(pres_path: Path, pres_rels_path: Path) -> list[str]:
    """从 presentation.xml 获取幻灯片的展示顺序。

    :param pres_path: presentation.xml 路径
    :param pres_rels_path: presentation.xml.rels 路径
    :return: 按顺序排列的幻灯片文件名列表
    """
    # 解析 rels 获取 rId -> slide 映射
    rels_dom = parse_dom(pres_rels_path)
    rid_to_slide = {}
    for rel in rels_dom.getElementsByTagName("Relationship"):
        rid = rel.getAttribute("Id")
        target = rel.getAttribute("Target")
        rel_type = rel.getAttribute("Type")
        if "slide" in rel_type.lower() and target.startswith("slides/"):
            rid_to_slide[rid] = target.replace("slides/", "")

    # 按 sldIdLst 中的顺序返回
    pres_content = pres_path.read_text(encoding="utf-8")
    ordered_rids = re.findall(r'<p:sldId[^>]*r:id="([^"]+)"', pres_content)

    result = []
    for rid in ordered_rids:
        if rid in rid_to_slide:
            result.append(rid_to_slide[rid])
    return result


def get_slide_layout_file(source_dir: Path, slide_name: str) -> str | None:
    """获取一个 slide 对应的 slideLayout 文件名。

    :param source_dir: 解包目录
    :param slide_name: 幻灯片文件名
    :return: slideLayout 文件名（如 "slideLayout2.xml"），找不到返回 None
    """
    rels_path = source_dir / "ppt" / "slides" / "_rels" / f"{slide_name}.rels"
    if not rels_path.exists():
        return None

    dom = parse_dom(rels_path)
    for rel in dom.getElementsByTagName("Relationship"):
        rel_type = rel.getAttribute("Type")
        if "slideLayout" in rel_type:
            target = rel.getAttribute("Target")
            # target 通常是 "../slideLayouts/slideLayoutN.xml"
            return Path(target).name
    return None


def get_slide_referenced_resources(
    source_dir: Path,
    slide_name: str,
) -> list[dict]:
    """获取一个 slide 引用的所有资源文件（media、chart 等）。

    :param source_dir: source 解包目录
    :param slide_name: 幻灯片文件名
    :return: 资源信息列表 [{"rid": ..., "target": ..., "type": ..., "abs_path": ...}, ...]
    """
    rels_path = source_dir / "ppt" / "slides" / "_rels" / f"{slide_name}.rels"
    if not rels_path.exists():
        return []

    resources = []
    dom = parse_dom(rels_path)
    for rel in dom.getElementsByTagName("Relationship"):
        rid = rel.getAttribute("Id")
        target = rel.getAttribute("Target")
        rel_type = rel.getAttribute("Type")

        # 跳过 slideLayout 和 notesSlide
        if "slideLayout" in rel_type or "notesSlide" in rel_type:
            continue

        # 计算绝对路径
        abs_path = (rels_path.parent.parent / target).resolve()
        resources.append({
            "rid": rid,
            "target": target,
            "type": rel_type,
            "abs_path": abs_path,
        })
    return resources


# ============================================================
# 资源复制与去重
# ============================================================

def copy_media_with_dedup(
    source_file: Path,
    base_dir: Path,
    media_hash_map: dict,
) -> str:
    """将资源文件复制到 base，去重（相同内容不重复复制）。

    :param source_file: source 中的资源文件路径
    :param base_dir: base 解包目录
    :param media_hash_map: 已有文件的哈希映射 {hash: "relative/path"}
    :return: 复制后在 base 中的相对路径（相对于 ppt/slides/）
    """
    if not source_file.exists():
        return ""

    file_hash = get_file_hash(source_file)

    # 如果内容相同的文件已存在，直接复用
    if file_hash in media_hash_map:
        return media_hash_map[file_hash]

    # 确定目标目录
    # 从 source_file 的路径推断它属于哪个资源目录
    rel_to_ppt = None
    try:
        # 尝试获取相对于 ppt 目录的路径
        for parent in source_file.parents:
            if parent.name == "ppt":
                rel_to_ppt = source_file.relative_to(parent)
                break
    except ValueError:
        pass

    if rel_to_ppt is None:
        # 默认放到 media 目录
        rel_to_ppt = Path("media") / source_file.name

    # 确定资源子目录
    sub_dir = rel_to_ppt.parts[0]  # 如 "media", "charts", "embeddings"
    dest_dir = base_dir / "ppt" / sub_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    # 处理文件名冲突
    dest_file = dest_dir / source_file.name
    if dest_file.exists():
        existing_hash = get_file_hash(dest_file)
        if existing_hash == file_hash:
            # 同名同内容，直接复用
            target_rel = f"../{sub_dir}/{dest_file.name}"
            media_hash_map[file_hash] = target_rel
            return target_rel

        # 同名不同内容，重命名
        stem = source_file.stem
        suffix = source_file.suffix
        counter = 2
        while True:
            new_name = f"{stem}_{counter}{suffix}"
            dest_file = dest_dir / new_name
            if not dest_file.exists():
                break
            counter += 1

    # 复制文件
    shutil.copy2(source_file, dest_file)
    target_rel = f"../{sub_dir}/{dest_file.name}"
    media_hash_map[file_hash] = target_rel
    return target_rel


# ============================================================
# 核心合并逻辑
# ============================================================

def merge_single_source(
    base_dir: Path,
    source_dir: Path,
    adopt_theme: bool,
    base_layouts: list[dict],
    source_layouts: list[dict],
    media_hash_map: dict,
    insert_position: str | int,
    dry_run: bool,
) -> list[str]:
    """将一个 source 的所有幻灯片合并到 base 中。

    :param base_dir: base 解包目录
    :param source_dir: source 解包目录
    :param adopt_theme: 是否统一使用 base 的主题
    :param base_layouts: base 的布局信息
    :param source_layouts: source 的布局信息
    :param media_hash_map: 共享的媒体文件哈希映射
    :param insert_position: 插入位置
    :param dry_run: 是否仅预览
    :return: 操作日志列表
    """
    logs = []
    source_slides = get_source_slide_files(source_dir)

    if not source_slides:
        logs.append(f"  [!] {source_dir} 中没有找到幻灯片")
        return logs

    logs.append(f"  找到 {len(source_slides)} 张幻灯片待合并")

    base_slides_dir = base_dir / "ppt" / "slides"
    base_slides_rels_dir = base_slides_dir / "_rels"
    base_slides_rels_dir.mkdir(parents=True, exist_ok=True)

    # 构建 layout 映射（source layout -> base layout）
    layout_mapping = {}
    if adopt_theme:
        source_layout_map = {info["file"]: info for info in source_layouts}
        for src_info in source_layouts:
            best = find_best_matching_layout(src_info, base_layouts)
            if best:
                layout_mapping[src_info["file"]] = best
                logs.append(
                    f"  [L] Layout 映射: {src_info['file']} ({src_info['name']}) "
                    f"-> {best}"
                )
            else:
                logs.append(
                    f"  [!] 未找到匹配: {src_info['file']} ({src_info['name']})，"
                    f"将使用 base 第一个 layout"
                )
                if base_layouts:
                    layout_mapping[src_info["file"]] = base_layouts[0]["file"]

    # 收集新增的幻灯片信息，用于更新 presentation.xml
    new_slides = []

    for slide_path in source_slides:
        slide_name = slide_path.name
        next_num = get_next_slide_number(base_slides_dir)
        new_slide_name = f"slide{next_num}.xml"

        logs.append(f"\n  [+] {slide_name} -> {new_slide_name}")

        # 1. 获取 source slide 引用的资源
        resources = get_slide_referenced_resources(source_dir, slide_name)
        resource_rid_mapping = {}  # 旧 rId -> 新 target 路径

        for res in resources:
            if res["abs_path"].exists():
                new_target = copy_media_with_dedup(
                    res["abs_path"], base_dir, media_hash_map,
                )
                resource_rid_mapping[res["rid"]] = {
                    "target": new_target,
                    "type": res["type"],
                }
                if not dry_run:
                    logs.append(
                        f"    [R] 资源: {Path(res['target']).name} -> {Path(new_target).name}"
                    )
            else:
                logs.append(f"    [!] 资源文件不存在: {res['abs_path']}")

        # 2. 确定 layout 映射
        source_layout_file = get_slide_layout_file(source_dir, slide_name)
        target_layout_file = source_layout_file  # 默认保持原样

        if adopt_theme and source_layout_file:
            if source_layout_file in layout_mapping:
                target_layout_file = layout_mapping[source_layout_file]
                logs.append(
                    f"    [T] Layout: {source_layout_file} -> {target_layout_file}"
                )
            else:
                # 如果没有映射，使用 base 第一个 layout
                if base_layouts:
                    target_layout_file = base_layouts[0]["file"]
                    logs.append(
                        f"    [T] Layout: {source_layout_file} -> {target_layout_file} (默认)"
                    )

        if dry_run:
            new_slides.append(new_slide_name)
            continue

        # 3. 复制 slide XML
        dest_slide_path = base_slides_dir / new_slide_name
        shutil.copy2(slide_path, dest_slide_path)

        # 4. 创建新的 .rels 文件
        _create_slide_rels(
            base_slides_rels_dir,
            new_slide_name,
            target_layout_file,
            resource_rid_mapping,
        )

        # 5. 更新 slide XML 中的内部引用（如果 rId 有变化）
        _update_slide_internal_refs(
            dest_slide_path,
            resource_rid_mapping,
            source_dir,
            slide_name,
        )

        new_slides.append(new_slide_name)

    if not dry_run and new_slides:
        # 6. 更新 presentation.xml 和 presentation.xml.rels
        _update_presentation(base_dir, new_slides, insert_position)

        # 7. 更新 [Content_Types].xml
        _update_content_types(base_dir, new_slides, media_hash_map)

    return logs


def _create_slide_rels(
    rels_dir: Path,
    slide_name: str,
    layout_file: str | None,
    resource_rid_mapping: dict,
) -> None:
    """为新幻灯片创建 .rels 文件。

    :param rels_dir: slides/_rels 目录路径
    :param slide_name: 新幻灯片文件名
    :param layout_file: 目标 slideLayout 文件名
    :param resource_rid_mapping: {旧rId: {"target": ..., "type": ...}}
    """
    rels_path = rels_dir / f"{slide_name}.rels"

    # 构建 Relationship 元素
    relationships = []
    rid_counter = 1

    # 第一个关系: slideLayout
    if layout_file:
        relationships.append(
            f'  <Relationship Id="rId{rid_counter}" '
            f'Type="{REL_TYPE_SLIDE_LAYOUT}" '
            f'Target="../slideLayouts/{layout_file}"/>'
        )
        rid_counter += 1

    # 其余关系: 资源文件
    for __, res_info in resource_rid_mapping.items():
        relationships.append(
            f'  <Relationship Id="rId{rid_counter}" '
            f'Type="{res_info["type"]}" '
            f'Target="{res_info["target"]}"/>'
        )
        rid_counter += 1

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns='
        '"http://schemas.openxmlformats.org/package/2006/relationships">\n'
        + "\n".join(relationships) + "\n"
        '</Relationships>'
    )
    rels_path.write_text(rels_xml, encoding="utf-8")


def _update_slide_internal_refs(
    slide_path: Path,
    resource_rid_mapping: dict,
    source_dir: Path,
    source_slide_name: str,
) -> None:
    """更新 slide XML 中的 r:id 引用，使其指向新的 rId。

    :param slide_path: 新 slide 文件路径
    :param resource_rid_mapping: {旧rId: {"target": ..., "type": ...}}
    :param source_dir: source 解包目录
    :param source_slide_name: source 中的原始 slide 文件名
    """
    if not resource_rid_mapping:
        return

    # 构建旧 rId -> 新 rId 的映射
    # 新 rels 文件中：rId1 是 layout，rId2 开始是资源
    old_rid_to_new_rid = {}
    new_rid_counter = 2  # rId1 留给 layout
    for old_rid in resource_rid_mapping:
        old_rid_to_new_rid[old_rid] = f"rId{new_rid_counter}"
        new_rid_counter += 1

    # 替换 slide XML 中的 rId 引用
    content = slide_path.read_text(encoding="utf-8")
    for old_rid, new_rid in old_rid_to_new_rid.items():
        # 精确匹配 r:id="rIdN"、r:embed="rIdN"、r:link="rIdN" 等
        content = re.sub(
            rf'(r:(?:id|embed|link)="){re.escape(old_rid)}(")',
            rf'\g<1>{new_rid}\2',
            content,
        )
    slide_path.write_text(content, encoding="utf-8")


def _update_presentation(
    base_dir: Path,
    new_slides: list[str],
    insert_position: str | int,
) -> None:
    """更新 presentation.xml 和 presentation.xml.rels。

    使用字符串操作替代 DOM 操作，避免 minidom 对 r:id 等命名空间前缀
    属性的序列化问题。

    :param base_dir: base 解包目录
    :param new_slides: 新增的幻灯片文件名列表
    :param insert_position: 插入位置
    """
    pres_path = base_dir / "ppt" / "presentation.xml"
    pres_rels_path = base_dir / "ppt" / "_rels" / "presentation.xml.rels"

    # 1. 更新 presentation.xml.rels：添加新 slide 的 Relationship
    rels_content = pres_rels_path.read_text(encoding="utf-8")
    rids = [int(m) for m in re.findall(r'Id="rId(\d+)"', rels_content)]
    max_rid = max(rids) if rids else 0
    new_slide_rids = {}

    new_rel_lines = []
    for slide_name in new_slides:
        max_rid += 1
        rid = f"rId{max_rid}"
        new_slide_rids[slide_name] = rid
        new_rel_lines.append(
            f'<Relationship Id="{rid}" '
            f'Type="{REL_TYPE_SLIDE}" '
            f'Target="slides/{slide_name}"/>'
        )

    # 在 </Relationships> 之前插入新 Relationship
    if new_rel_lines:
        insert_str = "\n".join(f"  {line}" for line in new_rel_lines)
        rels_content = rels_content.replace(
            "</Relationships>",
            f"{insert_str}\n</Relationships>",
        )
        pres_rels_path.write_text(rels_content, encoding="utf-8")

    # 2. 更新 presentation.xml：在 <p:sldIdLst> 中添加 <p:sldId>
    pres_content = pres_path.read_text(encoding="utf-8")

    # 获取当前最大的 slide ID
    slide_ids = [int(m) for m in re.findall(r'<p:sldId[^>]*id="(\d+)"', pres_content)]
    next_slide_id = max(slide_ids) + 1 if slide_ids else 256
    next_slide_id = max(next_slide_id, 256)

    # 构建新的 sldId 元素字符串
    new_sld_id_strs = []
    for slide_name in new_slides:
        rid = new_slide_rids[slide_name]
        new_sld_id_strs.append(
            f'<p:sldId id="{next_slide_id}" r:id="{rid}"/>'
        )
        next_slide_id += 1

    sld_id_block = "".join(new_sld_id_strs)

    # 检查 <p:sldIdLst> 是否存在
    if "<p:sldIdLst" not in pres_content:
        # 在 </p:sldMasterIdLst> 之后插入 <p:sldIdLst>
        sld_id_lst_xml = f"<p:sldIdLst>{sld_id_block}</p:sldIdLst>"
        pres_content = pres_content.replace(
            "</p:sldMasterIdLst>",
            f"</p:sldMasterIdLst>{sld_id_lst_xml}",
        )
    elif insert_position == "start":
        # 插入到 <p:sldIdLst> 的开头
        pres_content = re.sub(
            r'(<p:sldIdLst[^>]*>)',
            rf'\1{sld_id_block}',
            pres_content,
        )
    elif insert_position == "end":
        # 追加到 </p:sldIdLst> 之前
        pres_content = pres_content.replace(
            "</p:sldIdLst>",
            f"{sld_id_block}</p:sldIdLst>",
        )
    elif isinstance(insert_position, int):
        # 插入到指定位置之后
        sld_id_matches = list(re.finditer(
            r'<p:sldId[^/]*/>', pres_content,
        ))
        pos = min(insert_position, len(sld_id_matches))
        if pos > 0 and sld_id_matches:
            insert_idx = min(pos, len(sld_id_matches))
            insert_at = sld_id_matches[insert_idx - 1].end()
            pres_content = (
                pres_content[:insert_at]
                + sld_id_block
                + pres_content[insert_at:]
            )
        else:
            pres_content = pres_content.replace(
                "</p:sldIdLst>",
                f"{sld_id_block}</p:sldIdLst>",
            )
    else:
        # 默认追加到 </p:sldIdLst> 之前
        pres_content = pres_content.replace(
            "</p:sldIdLst>",
            f"{sld_id_block}</p:sldIdLst>",
        )

    pres_path.write_text(pres_content, encoding="utf-8")


def _update_content_types(
    base_dir: Path,
    new_slides: list[str],
    media_hash_map: dict,
) -> None:
    """更新 [Content_Types].xml，注册新的幻灯片和媒体文件。

    使用字符串操作替代 DOM 操作，保持与其他脚本一致。

    :param base_dir: base 解包目录
    :param new_slides: 新增的幻灯片文件名列表
    :param media_hash_map: 媒体文件哈希映射
    """
    ct_path = base_dir / "[Content_Types].xml"
    if not ct_path.exists():
        return

    content = ct_path.read_text(encoding="utf-8")

    # 注册新 slide
    new_overrides = []
    for slide_name in new_slides:
        part_name = f"/ppt/slides/{slide_name}"
        if part_name not in content:
            new_overrides.append(
                f'<Override PartName="{part_name}" '
                f'ContentType="application/vnd.openxmlformats-officedocument'
                f'.presentationml.slide+xml"/>'
            )

    # 确保所有媒体文件扩展名都有 Default 类型注册
    new_defaults = []
    media_dir = base_dir / "ppt" / "media"
    if media_dir.exists():
        # 提取已注册的扩展名
        existing_exts = set(re.findall(r'Extension="([^"]+)"', content))
        for media_file in media_dir.iterdir():
            if not media_file.is_file():
                continue
            ext = media_file.suffix.lower().lstrip(".")
            if ext and ext not in existing_exts:
                ct = CONTENT_TYPES.get(f".{ext}")
                if ct:
                    new_defaults.append(
                        f'<Default Extension="{ext}" ContentType="{ct}"/>'
                    )
                    existing_exts.add(ext)

    # 在 </Types> 之前插入
    insert_parts = new_defaults + new_overrides
    if insert_parts:
        insert_str = "\n".join(f"  {part}" for part in insert_parts)
        content = content.replace(
            "</Types>",
            f"{insert_str}\n</Types>",
        )
        ct_path.write_text(content, encoding="utf-8")


# ============================================================
# 主入口
# ============================================================

def merge_presentations(
    base_dir: Path,
    source_dirs: list[Path],
    adopt_theme: bool = False,
    insert_position: str | int = "end",
    dry_run: bool = False,
) -> None:
    """合并多个解包后的 PPTX 到一个基准目录。

    :param base_dir: base 解包目录
    :param source_dirs: source 解包目录列表
    :param adopt_theme: 是否统一使用 base 的 theme
    :param insert_position: 插入位置: "start", "end", 或数字
    :param dry_run: 仅预览
    """
    mode = "[DRY RUN] " if dry_run else ""
    print(f"{mode}=== PPT 合并工具 ===")
    print(f"基准目录: {base_dir}")
    print(f"待合并:  {', '.join(str(d) for d in source_dirs)}")
    print(f"统一主题: {'是' if adopt_theme else '否'}")
    print(f"插入位置: {insert_position}")
    print()

    # 分析 base 的 layout 结构
    base_layouts_dir = base_dir / "ppt" / "slideLayouts"
    base_layouts = analyze_layouts(base_layouts_dir)
    if adopt_theme:
        print(f"[L] Base 有 {len(base_layouts)} 个 Layout:")
        for layout in base_layouts:
            ph_desc = ", ".join(layout["ph_types"]) if layout["ph_types"] else "无占位符"
            print(f"   {layout['file']}: {layout['name']} [{ph_desc}]")
        print()

    # 构建 base 已有 media 的哈希映射（用于去重）
    media_hash_map = {}
    base_media_dir = base_dir / "ppt" / "media"
    if base_media_dir.exists():
        for media_file in base_media_dir.iterdir():
            if media_file.is_file():
                file_hash = get_file_hash(media_file)
                media_hash_map[file_hash] = f"../media/{media_file.name}"

    # 逐个合并 source
    total_added = 0
    for source_dir in source_dirs:
        print(f"{'-' * 50}")
        print(f"[>] 合并来源: {source_dir}")

        if not source_dir.exists():
            print(f"  [X] 目录不存在: {source_dir}")
            continue

        source_layouts_dir = source_dir / "ppt" / "slideLayouts"
        source_layouts = analyze_layouts(source_layouts_dir)

        logs = merge_single_source(
            base_dir=base_dir,
            source_dir=source_dir,
            adopt_theme=adopt_theme,
            base_layouts=base_layouts,
            source_layouts=source_layouts,
            media_hash_map=media_hash_map,
            insert_position=insert_position,
            dry_run=dry_run,
        )
        for log in logs:
            print(log)

        # 统计新增数量
        source_slides = get_source_slide_files(source_dir)
        total_added += len(source_slides)

    print(f"\n{'-' * 50}")
    print(f"{mode}[OK] 合并完成！共新增 {total_added} 张幻灯片")

    if dry_run:
        print("\n[!] 这是预览模式，未实际修改任何文件。去掉 --dry-run 参数以执行实际合并。")


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    :return: 解析后的参数对象
    """
    parser = argparse.ArgumentParser(
        description="将多个解包后的 PPTX 合并到一个基准目录",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python merge_slides.py unpacked_a/ --source unpacked_b/ unpacked_c/ --adopt-theme
  python merge_slides.py unpacked_a/ --source unpacked_b/ --insert-at start
  python merge_slides.py unpacked_a/ --source unpacked_b/ --insert-at 3
  python merge_slides.py unpacked_a/ --source unpacked_b/ --adopt-theme --dry-run
        """,
    )
    parser.add_argument(
        "base_dir",
        type=Path,
        help="基准 PPTX 的解包目录（使用它的配色方案和主题）",
    )
    parser.add_argument(
        "--source",
        type=Path,
        nargs="+",
        required=True,
        help="一个或多个待合并的解包 PPTX 目录",
    )
    parser.add_argument(
        "--adopt-theme",
        action="store_true",
        help="将 source 幻灯片的 layout 映射为 base 中最匹配的 layout，统一配色方案",
    )
    parser.add_argument(
        "--insert-at",
        type=str,
        default="end",
        help="插入位置: end (默认), start, 或具体的幻灯片编号",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅预览将要执行的操作，不实际修改文件",
    )
    return parser.parse_args()


if __name__ == "__main__":
    # Windows 终端默认使用 GBK 编码，遇到无法编码的字符时用 '?' 替代
    import io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    elif sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding=sys.stdout.encoding, errors="replace",
        )
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding=sys.stderr.encoding, errors="replace",
        )

    args = parse_args()

    if not args.base_dir.exists():
        print(f"Error: 基准目录不存在: {args.base_dir}", file=sys.stderr)
        sys.exit(1)

    for source in args.source:
        if not source.exists():
            print(f"Error: Source 目录不存在: {source}", file=sys.stderr)
            sys.exit(1)

    # 解析 insert_position
    insert_pos: str | int = args.insert_at
    if insert_pos not in ("start", "end"):
        try:
            insert_pos = int(insert_pos)
            if insert_pos < 1:
                print("Error: --insert-at 的数字必须 >= 1", file=sys.stderr)
                sys.exit(1)
        except ValueError:
            print(
                f"Error: --insert-at 的值无效: '{args.insert_at}'，"
                f"可选: start, end, 或正整数",
                file=sys.stderr,
            )
            sys.exit(1)

    merge_presentations(
        base_dir=args.base_dir,
        source_dirs=args.source,
        adopt_theme=args.adopt_theme,
        insert_position=insert_pos,
        dry_run=args.dry_run,
    )
