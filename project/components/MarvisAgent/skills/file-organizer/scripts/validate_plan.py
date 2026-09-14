"""
validate_plan.py — 蓝图校验脚本
校验 Agent 生成的蓝图 JSON 的正确性（文件/文件夹存在、JSON 可解析、字段完整、
source_dirs 覆盖率 100%、空洞层级扁平化），并在校验通过后向蓝图追加签名字段，
供 execute_moves.py 启动时强制校验。

用法：
    python validate_plan.py --plan <蓝图 JSON 路径> [--scan-result <扫描结果 JSON 路径>]
                            [--no-flatten] [--no-sign] [--use-content-index]
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import sys

# Windows 控制台默认 GBK 会让中文/emoji 输出失败，强制使用 UTF-8 避免子进程读取乱码
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

# 应用快捷方式扩展名（与 scan_files.py 保持一致）
_SKIP_EXTENSIONS = {".lnk", ".url", ".webloc", ".desktop"}

# 蓝图签名版本号；execute_moves.py 启动时会强制校验
_SIGNATURE_VERSION = "1.0"

# 蓝图签名有效期（小时）；超过此时长 execute_moves.py 将拒绝执行
_SIGNATURE_TTL_HOURS = 24

# 五大必要字段
_REQUIRED_FIELDS = ("source_root", "target_root", "move", "new_dirs", "skipped")

# move 数组中允许的字段
_ALLOWED_MOVE_FIELDS = {"source", "target"}

# skipped 数组中允许的字段
_ALLOWED_SKIPPED_FIELDS = {"path", "reason"}


def _compute_scan_result_hash(scan_result_path: str | None) -> str | None:
    """
    计算扫描结果 JSON 文件的 sha256 哈希，用于蓝图签名绑定扫描结果。

    若 scan_result_path 为空或文件不存在，返回 None。
    """
    if not scan_result_path or not os.path.isfile(scan_result_path):
        return None
    sha = hashlib.sha256()
    try:
        with open(scan_result_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha.update(chunk)
    except OSError:
        return None
    return sha.hexdigest()


def _flatten_singleton_layers(plan: dict) -> tuple[int, list[str]]:
    """
    扁平化蓝图中"目录 A 下仅含单子目录 A1 且 A 下无任何 move 散文件"的空洞层级。

    将 move 项的 target 路径中的 ``A/A1/...`` 改写为 ``A/...``，并从 new_dirs
    中移除被扁平化掉的中间层级。

    Returns:
        (扁平化次数, 扁平化明细列表) — 明细形如 ``"A/A1 → A"``，便于 stdout 汇报。
    """
    move_list = plan.get("move", [])
    new_dirs: list[str] = list(plan.get("new_dirs", []))

    # 仅作用于"蓝图新建的目录层级"，避免误改用户原有结构
    # 步骤 1：统计每个目录下的直接子节点（散文件 + 直接子目录）
    new_dirs_set = {d.rstrip("/") for d in new_dirs}

    # 步骤 2：基于 new_dirs 集合，找出"父目录 A → 唯一子目录 A1"的关系
    # 例如 new_dirs = ["工作", "工作/Tencent", "工作/Tencent/CSIG"]
    # 则 工作 → Tencent（若工作下无散文件且只有 Tencent 这一个直接子目录）
    direct_children: dict[str, set[str]] = {}
    for d in new_dirs_set:
        parent = os.path.dirname(d.replace("\\", "/"))
        if parent:
            direct_children.setdefault(parent, set()).add(d)
        # 父目录可能本身不在 new_dirs 中，但仍需要记录
        if parent not in direct_children:
            direct_children[parent] = direct_children.get(parent, set())
        direct_children[parent].add(d)

    # 步骤 3：统计每个目录下的"散文件数量"（move target 直接落在该目录下的文件）
    files_under_dir: dict[str, int] = {}
    for item in move_list:
        target = item.get("target", "").replace("\\", "/")
        parent = os.path.dirname(target)
        files_under_dir[parent] = files_under_dir.get(parent, 0) + 1

    # 步骤 4：找出可扁平化的层级 —— 父目录 A 下无散文件 + 仅有单子目录 A1 + A 在 new_dirs 中
    flatten_map: dict[str, str] = {}  # "A/A1" -> "A"（即把 A/A1 上提到 A）
    flatten_log: list[str] = []
    for parent, children in direct_children.items():
        if parent not in new_dirs_set:
            continue
        if files_under_dir.get(parent, 0) > 0:
            continue
        # 仅保留直接子目录（rel 路径仅多一段）
        direct = [
            c for c in children
            if os.path.dirname(c.replace("\\", "/")) == parent
        ]
        if len(direct) == 1:
            child = direct[0]
            flatten_map[child] = parent
            flatten_log.append(f"{child} → {parent}")

    if not flatten_map:
        return (0, [])

    # 步骤 5：重写 move 项的 target 路径
    original_move_count = len(move_list)
    rewritten_move: list[dict] = []
    for item in move_list:
        target = item.get("target", "").replace("\\", "/")
        new_target = target
        # 多次替换以支持嵌套扁平化
        for old_prefix, new_prefix in flatten_map.items():
            if new_target == old_prefix or new_target.startswith(old_prefix + "/"):
                new_target = new_prefix + new_target[len(old_prefix):]
        new_item = dict(item)
        new_item["target"] = new_target
        rewritten_move.append(new_item)

    # 步骤 6：保证扁平化前后 move 总数一致（仅改路径不改条目）
    if len(rewritten_move) != original_move_count:
        raise RuntimeError(
            f"扁平化前后 move 条目数不一致：{original_move_count} → {len(rewritten_move)}，已终止"
        )

    plan["move"] = rewritten_move

    # 步骤 7：从 new_dirs 中移除被扁平化的中间层级
    plan["new_dirs"] = [d for d in new_dirs if d.rstrip("/") not in flatten_map]

    return (len(flatten_map), flatten_log)


def _validate_basic_fields(plan: dict, raw_content: str) -> list[str]:
    """校验基础字段（路径分隔符、必要字段、目录存在性）。"""
    errors: list[str] = []

    if "\\" in raw_content:
        errors.append("蓝图 JSON 中包含反斜杠 '\\'，所有路径必须使用正斜杠 '/'")

    for field in _REQUIRED_FIELDS:
        if field not in plan:
            errors.append(f"缺少必要字段：{field}")

    source_root = plan.get("source_root", "")
    target_root = plan.get("target_root", "")

    if source_root and not os.path.isdir(source_root):
        errors.append(f"source_root 目录不存在：{source_root}")
    if target_root and not os.path.isdir(target_root):
        parent = os.path.dirname(target_root)
        if parent and not os.path.isdir(parent):
            errors.append(f"target_root 的父目录不存在：{parent}")

    return errors


def _validate_move_array(plan: dict) -> tuple[list[str], list[str], list[int], int, int]:
    """
    校验 move 数组每项的字段与源路径存在性。

    Returns:
        (errors, warnings, stripped_indices, file_count, dir_count) —
        stripped_indices 为待剔除的快捷方式条目下标列表。
    """
    errors: list[str] = []
    warnings: list[str] = []
    stripped_indices: list[int] = []
    file_count = 0
    dir_count = 0
    source_root = plan.get("source_root", "")

    for i, item in enumerate(plan.get("move", [])):
        extra_fields = set(item.keys()) - _ALLOWED_MOVE_FIELDS
        if extra_fields:
            errors.append(f"第{i + 1}条 move 记录包含多余字段：{extra_fields}（只允许 source 和 target）")

        source_rel = item.get("source", "")
        target_rel = item.get("target", "")
        if not source_rel:
            errors.append(f"第{i + 1}条记录缺少 source")
        elif source_root:
            _, ext = os.path.splitext(source_rel)
            if ext.lower() in _SKIP_EXTENSIONS:
                stripped_indices.append(i)
                warnings.append(
                    f"第{i + 1}条记录 source 是快捷方式文件（{ext}），"
                    f"已自动从蓝图中剔除：{source_rel}"
                )
                continue

            src_abs = os.path.join(source_root, source_rel)
            if os.path.isfile(src_abs):
                file_count += 1
            elif os.path.isdir(src_abs):
                dir_count += 1
            else:
                errors.append(f"第{i + 1}条记录 source 不存在：{source_rel}（绝对路径：{src_abs}）")
        if not target_rel:
            errors.append(f"第{i + 1}条记录缺少 target")

    return (errors, warnings, stripped_indices, file_count, dir_count)


def _validate_other_arrays(plan: dict) -> list[str]:
    """校验 new_dirs 与 skipped 两个数组的格式。"""
    errors: list[str] = []

    for i, d in enumerate(plan.get("new_dirs", [])):
        if not isinstance(d, str):
            errors.append(
                f"new_dirs 第{i + 1}项不是字符串（实际类型：{type(d).__name__}），"
                f"必须为纯路径字符串"
            )

    for i, item in enumerate(plan.get("skipped", [])):
        if isinstance(item, str):
            errors.append(
                f"skipped 第{i + 1}项是纯字符串 \"{item}\"，"
                f"应改为字典格式：{{\"path\": \"{item}\", \"reason\": \"跳过原因\"}}"
            )
        elif isinstance(item, dict):
            if "path" not in item:
                errors.append(f"skipped 第{i + 1}项缺少 path 字段")
            if "reason" not in item:
                errors.append(f"skipped 第{i + 1}项缺少 reason 字段")
            extra_fields = set(item.keys()) - _ALLOWED_SKIPPED_FIELDS
            if extra_fields:
                errors.append(f"skipped 第{i + 1}项包含多余字段：{extra_fields}（只允许 path 和 reason）")
        else:
            errors.append(
                f"skipped 第{i + 1}项类型不正确（实际类型：{type(item).__name__}），"
                f"应为字典格式：{{\"path\": \"...\", \"reason\": \"...\"}}"
            )

    return errors


def _validate_coverage(plan: dict, scan_result_path: str | None) -> list[str]:
    """
    覆盖率强校验：source_dirs 覆盖率必须为 100%，否则阻断进入阶段二。

    覆盖判定：扫描到的每个 source_dir（按 rel_path 比较），必须出现在 plan 的
    move 数组（source 字段）或 skipped 数组（path 字段）中。

    递归扫描场景下（scan_result 中 recursive=true），本校验则只要求顶层子目录要么以
    整体/拆散形式出现在 move/skipped 中，要么子目录下至少有1个文件被覆盖。
    """
    errors: list[str] = []
    if not scan_result_path:
        return errors

    try:
        with open(scan_result_path, "r", encoding="utf-8") as f:
            scan_data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        errors.append(f"无法读取扫描结果文件进行覆盖率检查：{e}")
        return errors

    source_dirs = scan_data.get("source_dirs", [])
    # 仅校验顶层（depth==1）source_dirs 的覆盖率
    top_level_dirs = [d for d in source_dirs if d.get("depth") == 1]
    if not top_level_dirs:
        return errors

    move_sources_norm = [
        item.get("source", "").replace("\\", "/").rstrip("/")
        for item in plan.get("move", [])
    ]
    move_sources = {s for s in move_sources_norm if s}
    skipped_paths = {
        item.get("path", "").replace("\\", "/").rstrip("/")
        for item in plan.get("skipped", [])
        if isinstance(item, dict)
    }
    covered = move_sources | skipped_paths

    recursive_scan = bool(scan_data.get("recursive"))

    missing: list[str] = []
    for d in top_level_dirs:
        # 应用安装目录默认不要求覆盖（scan 时已标记不参与整理）
        if d.get("is_app_install"):
            continue
        rel = d.get("rel_path", "").replace("\\", "/").rstrip("/")
        name = d.get("name", "").rstrip("/")
        # 同时支持以 rel_path 或 name 作为 source 标识
        if rel and rel in covered:
            continue
        if name and name in covered:
            continue
        # 递归扫描场景下，只要该子目录下任意层级有1个文件被 move 覆盖即认为已处理
        if recursive_scan and rel:
            prefix = rel + "/"
            if any(s.startswith(prefix) for s in move_sources):
                continue
        missing.append(rel or name)

    if missing:
        errors.append(
            "source_dirs 覆盖率不足：以下顶层子目录未被纳入 move 或 skipped，"
            f"必须显式处理（共 {len(missing)} 个）：{missing[:10]}"
        )

    return errors


def _validate_no_dir_breakup(plan: dict, scan_result_path: str | None) -> list[str]:
    """
    用户原有子目录结构保护（SKILL.md 红线：“默认不递归拆解已有文件夹结构”）。

    检测蓝图是否把扫描到的 source_dir 里面的文件拆出来单独搬运，而该 source_dir 本身
    并未作为整体出现在 move 中。出现这种情况说明 LLM 违反了“结构保持，禁止拆散文件夹”
    红线。

    例外放行场景：
    1. scan 阶段显式开启了 --recursive（scan_data.recursive==True）——表明用户明确授权拆解
    2. 该子目录本身也在 move 中被作为整体搬运——不可能同时拆散，但如果出现也是其他校验报错
    3. 该子目录被纳入 skipped——也不会出现拆散
    """
    errors: list[str] = []
    if not scan_result_path:
        return errors

    try:
        with open(scan_result_path, "r", encoding="utf-8") as f:
            scan_data = json.load(f)
    except (OSError, json.JSONDecodeError):
        # 覆盖率校验里已报过，这里不重复
        return errors

    # 递归扫描是用户明确授权拆解的场景，跳过本校验
    if scan_data.get("recursive"):
        return errors

    source_dirs = scan_data.get("source_dirs", [])
    if not source_dirs:
        return errors

    # 按 rel_path 建立 "子目录集合"，同时记录顶层名以便双重匹配
    dir_rels: set[str] = set()
    dir_names_top: set[str] = set()
    for d in source_dirs:
        if d.get("is_app_install"):
            continue
        rel = d.get("rel_path", "").replace("\\", "/").rstrip("/")
        if rel:
            dir_rels.add(rel)
        if d.get("depth") == 1:
            name = d.get("name", "").rstrip("/")
            if name:
                dir_names_top.add(name)

    if not dir_rels and not dir_names_top:
        return errors

    # 被作为整体搬运或被 skip 的子目录集合（以 source/path 标识）
    whole_handled: set[str] = set()
    for item in plan.get("move", []):
        src = item.get("source", "").replace("\\", "/").rstrip("/")
        if src and (src in dir_rels or src in dir_names_top):
            whole_handled.add(src)
    for item in plan.get("skipped", []):
        if not isinstance(item, dict):
            continue
        path = item.get("path", "").replace("\\", "/").rstrip("/")
        if path and (path in dir_rels or path in dir_names_top):
            whole_handled.add(path)

    # 扫描 move 数组，检查是否有 source 处于某个未被整体处理的子目录之下
    breakup_violations: dict[str, list[str]] = {}
    for item in plan.get("move", []):
        src = item.get("source", "").replace("\\", "/").rstrip("/")
        if not src or "/" not in src:
            continue
        # 判定 src 是否位于某个子目录之下
        # 优先取最长前缀匹配，以防止嵌套子目录被误判
        candidate_dirs = sorted(dir_rels, key=len, reverse=True)
        matched = None
        for d in candidate_dirs:
            if src == d:
                # source 作为整体搬运，不是拆散
                matched = None
                break
            if src.startswith(d + "/"):
                matched = d
                break
        if matched is None:
            # 处理顶层名匹配（例如 source="诊断日志/x.log"，rel_path="诊断日志"）
            top = src.split("/", 1)[0]
            if top in dir_names_top and top not in dir_rels:
                matched = top
        if matched is None:
            continue
        if matched in whole_handled:
            continue
        breakup_violations.setdefault(matched, []).append(src)

    if breakup_violations:
        # 生成详细错误信息，指出被拆散的目录及示例路径
        details = []
        for d, srcs in sorted(breakup_violations.items()):
            sample = srcs[:3]
            details.append(f"· “{d}/” 下被拆散 {len(srcs)} 个文件（示例：{sample}）")
        errors.append(
            "违反 'SKILL.md 结构保持' 红线：检测到 "
            f"{len(breakup_violations)} 个用户原有子目录被拆散。\n"
            "默认不递归拆解已有文件夹。请将这些子目录作为整体写入 move"
            "（source/target 都是子目录名）或纳入 skipped。\n"
            + "\n".join(details)
            + "\n例外：如果用户明确要求详细拆解某个子目录，请重新执行 "
            "scan_files.py --recursive 后再生成蓝图。"
        )

    return errors


def _rewrite_dir_merge_targets(plan: dict) -> tuple[int, list[str]]:
    """
    歧义性目录归并改写：当 LLM 把多个原有子目录"归类到同一个新建分类目录"时，
    自动把 target 改写为 ``<原 target>/<source basename>`` 以保留目录边界。

    背景：
        execute_moves.py 在处理目录类 move 时，若 ``target`` 路径已存在（例如
        前面散文件搬运已 ``os.makedirs`` 创建了分类目录），会走 ``_merge_dir_contents``
        把源目录内容**拍平合并**进去，导致多个原有子目录的边界丢失（参见
        2026-06-02 "诊断日志" 事故）。

    改写规则（仅作用于"目录到分类容器"场景）：
        1. ``source`` 是目录（不含 ``/`` 即顶层；含 ``/`` 时基底名仍当作目录处理）
        2. ``target`` 命中 ``new_dirs``（即 LLM 新建的分类容器）
        3. ``basename(source) != basename(target)``（不是同名重命名/合并）
        4. 满足以上条件即把 target 改写为 ``<target>/<basename(source)>``

    例外（不改写）：
        - target 是用户已有目录（不在 ``new_dirs`` 中）：保留合并语义
        - source 与 target 同名：通常是"重命名/同名合并"，保留原行为

    Returns:
        (改写次数, 改写明细列表) — 明细形如 ``"marvis-diagnosis-xxx → 诊断日志/marvis-diagnosis-xxx"``。

    .. note::
        本函数无法直接判断 ``source`` 是否为目录（它是相对路径字符串），因此采用
        启发式策略：当 ``source`` 没有扩展名（不像文件名）且 target 命中 ``new_dirs``
        时启动改写。误判风险极低（无扩展名的散文件极少与 new_dirs 形成命名冲突），
        且改写后即使 source 是文件，最终行为也仅相当于在分类目录下多套一层同名目录
        —— 这与 LLM 写出 ``target = "诊断日志"`` 时的本意一致。
    """
    move_list = plan.get("move", [])
    new_dirs_raw = plan.get("new_dirs", []) or []
    new_dirs_set: set[str] = {
        str(d).replace("\\", "/").rstrip("/")
        for d in new_dirs_raw
        if isinstance(d, str)
    }
    if not new_dirs_set or not move_list:
        return (0, [])

    rewrite_count = 0
    rewrite_log: list[str] = []
    rewritten_move: list[dict] = []

    for item in move_list:
        new_item = dict(item)
        source_rel = str(item.get("source", "")).replace("\\", "/").rstrip("/")
        target_rel = str(item.get("target", "")).replace("\\", "/").rstrip("/")
        if not source_rel or not target_rel:
            rewritten_move.append(new_item)
            continue

        # 仅当 target 整体落在 new_dirs 里（即 target 完全等于某个 new_dir）时才考虑改写
        if target_rel not in new_dirs_set:
            rewritten_move.append(new_item)
            continue

        source_base = source_rel.rsplit("/", 1)[-1]
        target_base = target_rel.rsplit("/", 1)[-1]
        if source_base == target_base:
            # 原位保留条目，由 execute 走 preserved 分支跳过搬运（防自合并 bug）
            rewritten_move.append(new_item)
            continue

        # 启发式：source 没有常见文件扩展名时视为目录归并意图
        _, ext = os.path.splitext(source_base)
        looks_like_file = bool(ext) and len(ext) <= 6 and ext.lower() not in {".tar"}
        if looks_like_file:
            # 形如 "a.txt" 的文件，target="分类目录" 时本来就语义清晰（搬到分类目录下保留同名），
            # execute_moves.py 的文件分支会自动处理，无需改写
            rewritten_move.append(new_item)
            continue

        # 改写：target = 原 target + "/" + source 基底名
        new_target = target_rel + "/" + source_base
        new_item["target"] = new_target
        rewrite_count += 1
        rewrite_log.append(f"{source_rel} → {new_target}（原 target={target_rel}）")
        rewritten_move.append(new_item)

    if rewrite_count:
        plan["move"] = rewritten_move

    return (rewrite_count, rewrite_log)


def _normalize_for_in_place(path: str) -> str:
    """
    把蓝图路径规范化为统一形式，用于 source/target 字符串相等比较（识别原位保留条目）。

    规则：
    1. 反斜杠转正斜杠
    2. 去尾部斜杠
    3. ``os.path.normcase`` 统一大小写敏感性（Windows 折叠为小写、Linux 保持原样）

    :param path: 蓝图中原始路径字符串
    :returns: 规范化后的字符串
    """
    if not isinstance(path, str):
        return ""
    return os.path.normcase(path.replace("\\", "/").rstrip("/"))


def _mark_in_place_items(plan: dict) -> tuple[int, list[str]]:
    """
    遍历 ``plan["move"]``，对 source 与 target 经规范化后字符串相等的条目追加 ``_in_place=True``。

    🚨 这是 5/26 自合并 bug 的上游拦截：execute_moves.py 主循环看到 ``_in_place=True`` 直接
    走 ``preserved`` 分支，避免再触发 ``_merge_dir_contents`` 把整树文件改名为 ``_(1)`` 版本。

    :param plan: 蓝图字典（原地修改）
    :returns: (in_place_count, in_place_log) 统计与日志条目
    """
    move_list = plan.get("move", [])
    if not move_list:
        return (0, [])

    in_place_count = 0
    in_place_log: list[str] = []

    for item in move_list:
        if not isinstance(item, dict):
            continue
        source_norm = _normalize_for_in_place(item.get("source", ""))
        target_norm = _normalize_for_in_place(item.get("target", ""))
        if not source_norm or not target_norm:
            continue
        if source_norm == target_norm:
            item["_in_place"] = True
            in_place_count += 1
            in_place_log.append(f"{item.get('source', '')} == {item.get('target', '')}")

    return (in_place_count, in_place_log)


def _attach_signature(plan: dict, scan_result_path: str | None) -> dict:
    """
    向蓝图追加 _signature 字段，供 execute_moves.py 启动时强制校验。

    签名内容：
    - version：签名格式版本
    - validated_at：ISO8601 时间戳
    - scan_result_hash：扫描结果文件的 sha256，用于绑定扫描结果与蓝图
    - scan_result_path：扫描结果文件的绝对路径（execute_moves.py 据此精确定位
      用于 hash 比对的扫描结果文件，避免与同目录下其他残留扫描文件混淆）
    """
    abs_scan_path = (
        os.path.abspath(scan_result_path)
        if scan_result_path and os.path.isfile(scan_result_path)
        else None
    )
    signature = {
        "version": _SIGNATURE_VERSION,
        "validated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "scan_result_hash": _compute_scan_result_hash(scan_result_path),
        "scan_result_path": abs_scan_path,
    }
    plan["_signature"] = signature
    return signature


def validate(
    plan_path: str,
    scan_result_path: str | None = None,
    flatten: bool = True,
    sign: bool = True,
) -> tuple[list[str], list[str], dict]:
    """
    校验蓝图 JSON 的正确性。

    校验通过后会自动：
    - 剔除 ``move`` 中残留的 ``.lnk`` / ``.url`` 等快捷方式条目
    - 扁平化空洞层级（``flatten=True`` 时）
    - 追加 ``_signature`` 字段以便 ``execute_moves.py`` 强制校验（``sign=True`` 时）

    Returns:
        (errors, warnings, info) — info 含 ``flatten_log`` / ``signature`` 等元数据。
    """
    info: dict = {"flatten_log": [], "signature": None}

    if not os.path.exists(plan_path):
        return ([f"蓝图文件不存在：{plan_path}"], [], info)

    try:
        with open(plan_path, "r", encoding="utf-8") as f:
            raw_content = f.read()
    except OSError as e:
        return ([f"无法读取蓝图文件：{e}"], [], info)

    try:
        plan = json.loads(raw_content)
    except json.JSONDecodeError as e:
        return ([f"蓝图 JSON 格式错误：{e}"], [], info)

    errors: list[str] = []
    warnings: list[str] = []

    errors.extend(_validate_basic_fields(plan, raw_content))

    move_errors, move_warnings, stripped_indices, file_count, dir_count = _validate_move_array(plan)
    errors.extend(move_errors)
    warnings.extend(move_warnings)

    errors.extend(_validate_other_arrays(plan))

    # 覆盖率强校验（无扫描结果时跳过）
    errors.extend(_validate_coverage(plan, scan_result_path))

    # 用户原有子目录结构保护（默认不递归拆解，递归扫描场景例外）
    errors.extend(_validate_no_dir_breakup(plan, scan_result_path))

    # 命中错误时直接返回，不做扁平化与签名（避免污染坏蓝图）
    if errors:
        return (errors, warnings, info)

    # 自动剔除快捷方式条目
    if stripped_indices:
        move_list = plan.get("move", [])
        plan["move"] = [
            item for idx, item in enumerate(move_list)
            if idx not in set(stripped_indices)
        ]

    # 歧义性目录归并改写（针对 LLM 把多个子目录归类到同一新建分类目录的场景）
    # 必须在扁平化之前执行，让扁平化看到改写后的完整目标路径
    rewrite_count, rewrite_log = _rewrite_dir_merge_targets(plan)
    info["dir_merge_rewrite_log"] = rewrite_log
    if rewrite_count:
        warnings.append(
            f"已自动改写 {rewrite_count} 条目录归并 target，避免目录边界丢失：{rewrite_log}"
        )

    # 打原位保留标记（防自合并 bug 的上游拦截）：
    # source / target 在统一斜杠 + os.path.normcase + rstrip('/') 后字符串相等 → 打 _in_place=True
    in_place_count, in_place_log = _mark_in_place_items(plan)
    info["in_place_log"] = in_place_log
    info["in_place_count"] = in_place_count
    if in_place_count:
        warnings.append(
            f"识别到 {in_place_count} 条原位保留条目（execute 阶段将跳过搬运）：{in_place_log}"
        )

    # 扁平化空洞层级
    if flatten:
        try:
            flatten_count, flatten_log = _flatten_singleton_layers(plan)
            info["flatten_log"] = flatten_log
            if flatten_count:
                warnings.append(f"已扁平化 {flatten_count} 个空洞层级：{flatten_log}")
        except RuntimeError as e:
            return ([str(e)], warnings, info)

    # 追加签名（必须在扁平化之后）
    if sign:
        info["signature"] = _attach_signature(plan, scan_result_path)

    # 回写蓝图（剔除快捷方式 + 扁平化 + 签名）
    try:
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
    except OSError as e:
        return ([f"无法回写蓝图文件：{e}"], warnings, info)

    info["file_count"] = file_count
    info["dir_count"] = dir_count
    info["plan"] = plan

    return ([], warnings, info)


def _print_dir_merge_rewrite(info: dict) -> None:
    """打印目录归并改写明细（若有），供 file-agent 在阶段二开始前透明告知用户。"""
    rewrite_log = info.get("dir_merge_rewrite_log") or []
    if rewrite_log:
        print(f"🪄 已自动改写 {len(rewrite_log)} 条目录归并 target，保留原目录边界：")
        for entry in rewrite_log:
            print(f"  - {entry}")


def _print_summary(plan: dict, file_count: int, dir_count: int, info: dict) -> None:
    """打印校验通过后的汇总信息。"""
    move_count = len(plan.get("move", []))
    new_dirs_count = len(plan.get("new_dirs", []))
    skipped_count = len(plan.get("skipped", []))
    in_place_count = info.get("in_place_count", 0) or 0
    parts = [f"共 {move_count} 条移动记录"]
    if dir_count > 0:
        parts.append(f"其中 {dir_count} 个文件夹、{file_count} 个文件")
    parts.append(f"{new_dirs_count} 个新建目录")
    parts.append(f"{skipped_count} 条跳过记录")
    if in_place_count:
        parts.append(f"原位保留 {in_place_count} 条")
    print(f"✅ 蓝图校验通过，{'，'.join(parts)}")

    _print_dir_merge_rewrite(info)

    in_place_log = info.get("in_place_log") or []
    if in_place_log:
        print(f"📎 原位保留条目（execute 阶段将跳过搬运，防自合并质变为批量重命名）：")
        for entry in in_place_log:
            print(f"  - {entry}")

    flatten_log = info.get("flatten_log") or []
    if flatten_log:
        print(f"🔧 已扁平化 {len(flatten_log)} 个空洞层级：")
        for entry in flatten_log:
            print(f"  - {entry}")

    signature = info.get("signature")
    if signature:
        print(f"🔏 蓝图签名已追加：validated_at={signature['validated_at']}")


def main():
    parser = argparse.ArgumentParser(description="蓝图校验脚本：校验 Agent 生成的蓝图 JSON 的正确性")
    parser.add_argument("--plan", required=True, help="蓝图 JSON 文件路径")
    parser.add_argument(
        "--scan-result", default=None, dest="scan_result",
        help="scan_files.py 输出的扫描结果 JSON 路径（用于覆盖率检查与签名绑定）"
    )
    parser.add_argument(
        "--no-flatten", action="store_true", dest="no_flatten",
        help="禁用空洞层级扁平化（默认开启）"
    )
    parser.add_argument(
        "--no-sign", action="store_true", dest="no_sign",
        help="禁用蓝图签名（仅供调试，正常流程下严禁使用）"
    )
    # 内容索引接入预留点（需求 5），暂不实现实际逻辑
    parser.add_argument(
        "--use-content-index", action="store_true", dest="use_content_index",
        help="（预留）使用 file-search 内容索引辅助分类，当前版本暂未实现"
    )
    args = parser.parse_args()

    if args.use_content_index:
        print("ℹ️ --use-content-index 为预留参数，当前版本未启用，分类仍按 SKILL.md 优先级 1/3/4 处理")

    errors, warnings, info = validate(
        plan_path=args.plan,
        scan_result_path=args.scan_result,
        flatten=not args.no_flatten,
        sign=not args.no_sign,
    )
    if warnings:
        print("⚠️ 蓝图校验警告（已自动处理，不影响执行）：")
        for w in warnings:
            print(f"  - {w}")
    if errors:
        print("❌ 蓝图校验失败，发现以下问题：")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        plan = info.get("plan") or {}
        _print_summary(
            plan,
            info.get("file_count", 0),
            info.get("dir_count", 0),
            info,
        )


if __name__ == "__main__":
    main()
