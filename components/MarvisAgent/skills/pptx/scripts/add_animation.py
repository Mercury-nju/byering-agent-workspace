# -*- coding: utf-8 -*-
"""为解包后的 PPTX 幻灯片中的形状添加动画效果（淡入、淡出、飞入、擦除、缩放等）。

Usage: python add_animation.py <unpacked_dir> --slide <N> --target <name_or_id> [options]

Options:
    --slide <N>         目标幻灯片编号（如 3 表示 slide3.xml）
    --target <str>      目标形状名称或 ID（如 "饼图" 或 "5"）
    --effect <type>     动画效果: fade, fly, wipe, appear, disappear,
                        zoom, split, wheel, bounce, float, swivel
                        (默认: fade)
    --direction <dir>   效果方向: in, out (默认: in)
                        fly 效果额外支持: fromLeft, fromRight, fromTop, fromBottom
    --duration <ms>     持续时间（毫秒，默认: 500）
    --delay <ms>        延迟时间（毫秒，默认: 0）
    --trigger <type>    触发方式: onClick, withPrevious, afterPrevious
                        (默认: onClick)
    --order <N>         动画顺序编号（默认: 自动追加到末尾）
    --dry-run           仅预览不实际修改

Examples:
    # 给第 3 页的 "饼图" 添加淡入效果
    python add_animation.py unpacked/ --slide 3 --target "饼图" \\
        --effect fade --direction in --duration 500

    # 给第 3 页的 "饼图" 添加淡出效果
    python add_animation.py unpacked/ --slide 3 --target "饼图" \\
        --effect fade --direction out --duration 500

    # 给第 1 页 ID 为 5 的形状添加从左飞入
    python add_animation.py unpacked/ --slide 1 --target "5" \\
        --effect fly --direction fromLeft --duration 800

    # 给第 2 页的 "标题" 添加擦除效果，在上一个动画之后自动触发
    python add_animation.py unpacked/ --slide 2 --target "标题" \\
        --effect wipe --direction in --trigger afterPrevious

    # 预览模式
    python add_animation.py unpacked/ --slide 3 --target "饼图" \\
        --effect fade --direction in --dry-run
"""

import argparse
import io
import os
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

# 支持的动画效果类型
EFFECT_TYPES = {
    "fade",       # 淡入/淡出
    "fly",        # 飞入/飞出
    "wipe",       # 擦除
    "appear",     # 出现（无渐变，立即显示）
    "disappear",  # 消失（无渐变，立即隐藏）
    "zoom",       # 缩放
    "split",      # 劈裂
    "wheel",      # 轮子
    "bounce",     # 弹跳
    "float",      # 浮入/浮出
    "swivel",     # 旋转
}

# 方向常量
DIRECTION_VALUES = {
    "in",           # 进入
    "out",          # 退出
    "fromLeft",     # 从左（fly 专用）
    "fromRight",    # 从右（fly 专用）
    "fromTop",      # 从上（fly 专用）
    "fromBottom",   # 从下（fly 专用）
}

# 触发方式
TRIGGER_VALUES = {
    "onClick",         # 点击触发
    "withPrevious",    # 与上一个同时
    "afterPrevious",   # 上一个之后
}

# OOXML 动画预设映射
# presetClass: entr=进入, exit=退出, emph=强调
# presetID 参考: https://docs.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/
EFFECT_PRESET_MAP = {
    # (effect, direction) -> (presetClass, presetID, presetSubtype)
    ("fade", "in"): ("entr", 10, 0),
    ("fade", "out"): ("exit", 10, 0),
    ("fly", "in"): ("entr", 2, 4),          # 默认从下
    ("fly", "out"): ("exit", 2, 4),
    ("fly", "fromLeft"): ("entr", 2, 8),
    ("fly", "fromRight"): ("entr", 2, 2),
    ("fly", "fromTop"): ("entr", 2, 1),
    ("fly", "fromBottom"): ("entr", 2, 4),
    ("wipe", "in"): ("entr", 22, 4),
    ("wipe", "out"): ("exit", 22, 4),
    ("appear", "in"): ("entr", 1, 0),
    ("disappear", "out"): ("exit", 1, 0),
    ("disappear", "in"): ("exit", 1, 0),     # disappear 本质是退出
    ("appear", "out"): ("entr", 1, 0),        # appear 本质是进入
    ("zoom", "in"): ("entr", 53, 0),
    ("zoom", "out"): ("exit", 53, 0),
    ("split", "in"): ("entr", 16, 0),
    ("split", "out"): ("exit", 16, 0),
    ("wheel", "in"): ("entr", 21, 1),
    ("wheel", "out"): ("exit", 21, 1),
    ("bounce", "in"): ("entr", 26, 0),
    ("bounce", "out"): ("exit", 26, 0),
    ("float", "in"): ("entr", 42, 0),
    ("float", "out"): ("exit", 42, 0),
    ("swivel", "in"): ("entr", 19, 0),
    ("swivel", "out"): ("exit", 19, 0),
}

# OOXML 命名空间
NAMESPACES = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


# ============================================================
# 工具函数
# ============================================================

def find_shape_by_target(dom: object, target: str) -> tuple[str, str] | None:
    """在 DOM 中查找目标形状，返回 (id, name)。

    支持按名称（模糊匹配）或 ID（精确匹配）查找。

    :param dom: DOM 文档对象
    :param target: 形状名称或 ID
    :return: (shape_id, shape_name) 元组，未找到返回 None
    """
    candidates = []

    for cnv_pr in dom.getElementsByTagName("p:cNvPr"):
        sp_id = cnv_pr.getAttribute("id")
        sp_name = cnv_pr.getAttribute("name")

        # ID 精确匹配
        if sp_id == target:
            return (sp_id, sp_name)

        # 名称匹配（包含即可）
        if target in sp_name:
            candidates.append((sp_id, sp_name))

    if len(candidates) == 1:
        return candidates[0]

    if len(candidates) > 1:
        print(f"Warning: 找到 {len(candidates)} 个匹配的形状:", file=sys.stderr)
        for cid, cname in candidates:
            print(f"  id={cid}, name=\"{cname}\"", file=sys.stderr)
        print(f"使用第一个匹配: id={candidates[0][0]}", file=sys.stderr)
        return candidates[0]

    return None


def list_shapes(dom: object) -> list[tuple[str, str]]:
    """列出幻灯片中所有形状的 ID 和名称。

    :param dom: DOM 文档对象
    :return: (id, name) 元组列表
    """
    shapes = []
    for cnv_pr in dom.getElementsByTagName("p:cNvPr"):
        sp_id = cnv_pr.getAttribute("id")
        sp_name = cnv_pr.getAttribute("name")
        if sp_id and sp_id != "1":  # 跳过 spTree 的 grpSpPr（id=1）
            shapes.append((sp_id, sp_name))
    return shapes


def _get_existing_anim_count(dom: object) -> int:
    """获取当前幻灯片中已有的动画效果数量。

    :param dom: DOM 文档对象
    :return: 动画数量
    """
    count = 0
    # 计算 p:timing 内的 p:par 节点（每个动画步骤通常对应一个 seq 下的 par）
    for seq in dom.getElementsByTagName("p:seq"):
        child_tn_lst = seq.getElementsByTagName("p:childTnLst")
        if child_tn_lst:
            for par in child_tn_lst[0].getElementsByTagName("p:par"):
                # 只计算直接子节点层级的 par
                if par.parentNode == child_tn_lst[0]:
                    count += 1
    return count


def _get_max_grp_id(dom: object) -> int:
    """获取 timing 树中最大的 grpId 值。

    :param dom: DOM 文档对象
    :return: 最大 grpId，无则返回 0
    """
    max_id = 0
    for ctn in dom.getElementsByTagName("p:cTn"):
        grp_id = ctn.getAttribute("grpId")
        if grp_id:
            try:
                max_id = max(max_id, int(grp_id))
            except ValueError:
                pass
    return max_id


# ============================================================
# XML 构建
# ============================================================

def _create_element(doc: object, tag: str, attrs: dict | None = None) -> object:
    """创建 DOM 元素并设置属性。

    :param doc: DOM 文档对象
    :param tag: 标签名
    :param attrs: 属性字典
    :return: DOM 元素
    """
    elem = doc.createElement(tag)
    if attrs:
        for key, value in attrs.items():
            elem.setAttribute(key, str(value))
    return elem


def build_anim_effect_node(
    doc: object,
    shape_id: str,
    preset_class: str,
    preset_id: int,
    preset_subtype: int,
    duration_ms: int = 500,
    delay_ms: int = 0,
    trigger: str = "onClick",
    effect_name: str = "fade",
    direction: str = "in",
    grp_id: int = 0,
) -> object:
    """构建一个动画效果的 p:par 容器节点。

    OOXML 动画结构示意:
    p:par                          ← 本函数返回的节点
      p:cTn (nodeType=clickPar)
        p:stCondLst
          p:cond delay="0"
        p:childTnLst
          p:par                    ← 动画步骤
            p:cTn
              p:stCondLst
                p:cond delay="<delay_ms>"
              p:childTnLst
                p:par              ← 效果容器
                  p:cTn presetClass presetID presetSubtype
                    p:stCondLst
                      p:cond delay="0"
                    p:childTnLst
                      ... (具体动画行为节点)

    :param doc: DOM 文档对象
    :param shape_id: 目标形状 ID
    :param preset_class: 预设类别 (entr/exit/emph)
    :param preset_id: 预设 ID
    :param preset_subtype: 预设子类型
    :param duration_ms: 持续时间（毫秒）
    :param delay_ms: 延迟时间（毫秒）
    :param trigger: 触发方式
    :param effect_name: 效果名称（用于生成行为节点）
    :param direction: 方向
    :param grp_id: 组 ID
    :return: p:par DOM 节点
    """
    # ---- 最外层 p:par ----
    outer_par = _create_element(doc, "p:par")

    # 外层 cTn
    outer_ctn = _create_element(doc, "p:cTn", {
        "id": str(grp_id + 1),
        "fill": "hold",
    })
    outer_par.appendChild(outer_ctn)

    # 外层开始条件
    outer_st_cond = _create_element(doc, "p:stCondLst")
    if trigger == "onClick":
        outer_cond = _create_element(doc, "p:cond", {"delay": "0"})
    elif trigger == "withPrevious":
        outer_cond = _create_element(doc, "p:cond", {"delay": "0"})
    else:  # afterPrevious
        outer_cond = _create_element(doc, "p:cond", {"delay": "0"})
    outer_st_cond.appendChild(outer_cond)
    outer_ctn.appendChild(outer_st_cond)

    # 外层子节点列表
    outer_child_tn = _create_element(doc, "p:childTnLst")
    outer_ctn.appendChild(outer_child_tn)

    # ---- 中间层 p:par (动画步骤) ----
    mid_par = _create_element(doc, "p:par")
    outer_child_tn.appendChild(mid_par)

    mid_ctn = _create_element(doc, "p:cTn", {
        "id": str(grp_id + 2),
        "fill": "hold",
    })
    mid_par.appendChild(mid_ctn)

    # 中间层开始条件（延迟）
    mid_st_cond = _create_element(doc, "p:stCondLst")
    mid_cond = _create_element(doc, "p:cond", {"delay": str(delay_ms)})
    mid_st_cond.appendChild(mid_cond)
    mid_ctn.appendChild(mid_st_cond)

    # 中间层子节点列表
    mid_child_tn = _create_element(doc, "p:childTnLst")
    mid_ctn.appendChild(mid_child_tn)

    # ---- 内层 p:par (效果容器) ----
    inner_par = _create_element(doc, "p:par")
    mid_child_tn.appendChild(inner_par)

    inner_ctn = _create_element(doc, "p:cTn", {
        "id": str(grp_id + 3),
        "presetID": str(preset_id),
        "presetClass": preset_class,
        "presetSubtype": str(preset_subtype),
        "fill": "hold",
        "grpId": "0",
        "nodeType": "clickEffect" if trigger == "onClick" else (
            "withEffect" if trigger == "withPrevious" else "afterEffect"
        ),
    })
    inner_par.appendChild(inner_ctn)

    # 内层开始条件
    inner_st_cond = _create_element(doc, "p:stCondLst")
    inner_cond = _create_element(doc, "p:cond", {"delay": "0"})
    inner_st_cond.appendChild(inner_cond)
    inner_ctn.appendChild(inner_st_cond)

    # 内层子节点列表 — 具体动画行为
    inner_child_tn = _create_element(doc, "p:childTnLst")
    inner_ctn.appendChild(inner_child_tn)

    # 根据效果类型构建动画行为节点
    _build_anim_behaviors(
        doc, inner_child_tn, shape_id, effect_name, direction,
        duration_ms, preset_class, grp_id + 4,
    )

    return outer_par


def _build_anim_behaviors(
    doc: object,
    parent: object,
    shape_id: str,
    effect_name: str,
    direction: str,
    duration_ms: int,
    preset_class: str,
    start_id: int,
) -> None:
    """根据效果类型在 childTnLst 中构建具体的动画行为节点。

    :param doc: DOM 文档对象
    :param parent: p:childTnLst 父节点
    :param shape_id: 目标形状 ID
    :param effect_name: 效果名称
    :param direction: 方向
    :param duration_ms: 持续时间
    :param preset_class: 预设类别
    :param start_id: 起始 cTn id
    """
    dur_str = str(duration_ms)

    if effect_name == "fade":
        _build_fade_behavior(doc, parent, shape_id, dur_str, preset_class, start_id)
    elif effect_name == "fly":
        _build_fly_behavior(doc, parent, shape_id, dur_str, direction, preset_class, start_id)
    elif effect_name == "wipe":
        _build_wipe_behavior(doc, parent, shape_id, dur_str, preset_class, start_id)
    elif effect_name in ("appear", "disappear"):
        _build_appear_behavior(doc, parent, shape_id, preset_class, start_id)
    elif effect_name == "zoom":
        _build_zoom_behavior(doc, parent, shape_id, dur_str, preset_class, start_id)
    elif effect_name in ("split", "wheel", "bounce", "float", "swivel"):
        # 这些效果使用通用的 animEffect + set 模式
        _build_generic_effect_behavior(
            doc, parent, shape_id, dur_str, effect_name, preset_class, start_id,
        )
    else:
        _build_fade_behavior(doc, parent, shape_id, dur_str, preset_class, start_id)


def _build_spTgt(doc: object, shape_id: str) -> object:
    """构建 p:tgtEl > p:spTgt 目标元素节点。

    :param doc: DOM 文档对象
    :param shape_id: 形状 ID
    :return: p:tgtEl 节点
    """
    tgt_el = _create_element(doc, "p:tgtEl")
    sp_tgt = _create_element(doc, "p:spTgt", {"spid": shape_id})
    tgt_el.appendChild(sp_tgt)
    return tgt_el


def _build_fade_behavior(
    doc: object,
    parent: object,
    shape_id: str,
    dur_str: str,
    preset_class: str,
    start_id: int,
) -> None:
    """构建淡入/淡出动画行为节点。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param shape_id: 目标形状 ID
    :param dur_str: 持续时间字符串
    :param preset_class: entr 或 exit
    :param start_id: 起始 id
    """
    is_entrance = (preset_class == "entr")

    # p:animEffect — 淡入淡出效果
    anim_effect = _create_element(doc, "p:animEffect", {
        "transition": "in" if is_entrance else "out",
        "filter": "fade",
    })
    anim_effect_cbn = _create_element(doc, "p:cBhvr")
    anim_effect.appendChild(anim_effect_cbn)

    anim_effect_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id),
        "dur": dur_str,
    })
    anim_effect_cbn.appendChild(anim_effect_ctn)
    anim_effect_cbn.appendChild(_build_spTgt(doc, shape_id))
    parent.appendChild(anim_effect)

    # p:set — 设置可见性
    set_node = _create_element(doc, "p:set")
    set_cbn = _create_element(doc, "p:cBhvr")
    set_node.appendChild(set_cbn)

    set_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id + 1),
        "dur": "1",
        "fill": "hold",
    })
    set_cbn.appendChild(set_ctn)

    set_st_cond = _create_element(doc, "p:stCondLst")
    set_cond = _create_element(doc, "p:cond", {"delay": "0"})
    set_st_cond.appendChild(set_cond)
    set_ctn.appendChild(set_st_cond)

    set_cbn.appendChild(_build_spTgt(doc, shape_id))

    # p:attrNameLst
    attr_name_lst = _create_element(doc, "p:attrNameLst")
    attr_name = _create_element(doc, "p:attrName")
    attr_name.appendChild(doc.createTextNode("style.visibility"))
    attr_name_lst.appendChild(attr_name)
    set_cbn.appendChild(attr_name_lst)

    # p:to
    to_node = _create_element(doc, "p:to")
    str_val = _create_element(doc, "p:strVal", {
        "val": "visible" if is_entrance else "hidden",
    })
    to_node.appendChild(str_val)
    set_node.appendChild(to_node)

    parent.appendChild(set_node)


def _build_fly_behavior(
    doc: object,
    parent: object,
    shape_id: str,
    dur_str: str,
    direction: str,
    preset_class: str,
    start_id: int,
) -> None:
    """构建飞入/飞出动画行为节点。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param shape_id: 目标形状 ID
    :param dur_str: 持续时间字符串
    :param direction: 方向
    :param preset_class: entr 或 exit
    :param start_id: 起始 id
    """
    is_entrance = (preset_class == "entr")

    # 根据方向确定位移
    # OOXML 中 fly 使用 p:anim 的 by 属性（PPT 坐标：1 = 幻灯片宽度的某比例）
    x_by = "0"
    y_by = "0"
    fly_directions = {
        "fromLeft": ("-1", "0") if is_entrance else ("1", "0"),
        "fromRight": ("1", "0") if is_entrance else ("-1", "0"),
        "fromTop": ("0", "-1") if is_entrance else ("0", "1"),
        "fromBottom": ("0", "1") if is_entrance else ("0", "-1"),
        "in": ("0", "1") if is_entrance else ("0", "-1"),
        "out": ("0", "-1") if is_entrance else ("0", "1"),
    }
    x_by, y_by = fly_directions.get(direction, ("0", "1"))

    # p:anim — X 方向位移
    if x_by != "0":
        anim_x = _create_element(doc, "p:anim", {
            "calcmode": "lin",
            "valueType": "num",
        })
        anim_x_cbn = _create_element(doc, "p:cBhvr", {"additive": "base"})
        anim_x.appendChild(anim_x_cbn)

        anim_x_ctn = _create_element(doc, "p:cTn", {
            "id": str(start_id),
            "dur": dur_str,
            "fill": "hold",
        })
        anim_x_cbn.appendChild(anim_x_ctn)
        anim_x_cbn.appendChild(_build_spTgt(doc, shape_id))

        attr_lst = _create_element(doc, "p:attrNameLst")
        attr_name = _create_element(doc, "p:attrName")
        attr_name.appendChild(doc.createTextNode("ppt_x"))
        attr_lst.appendChild(attr_name)
        anim_x_cbn.appendChild(attr_lst)

        tav_lst = _create_element(doc, "p:tavLst")

        tav1 = _create_element(doc, "p:tav", {"tm": "0"})
        tav1_val = _create_element(doc, "p:val")
        tav1_str = _create_element(doc, "p:strVal", {"val": f"#{x_by}"})
        tav1_val.appendChild(tav1_str)
        tav1.appendChild(tav1_val)
        tav_lst.appendChild(tav1)

        tav2 = _create_element(doc, "p:tav", {"tm": "100000"})
        tav2_val = _create_element(doc, "p:val")
        tav2_str = _create_element(doc, "p:strVal", {"val": "#0"})
        tav2_val.appendChild(tav2_str)
        tav2.appendChild(tav2_val)
        tav_lst.appendChild(tav2)

        anim_x.appendChild(tav_lst)
        parent.appendChild(anim_x)
        start_id += 1

    # p:anim — Y 方向位移
    if y_by != "0":
        anim_y = _create_element(doc, "p:anim", {
            "calcmode": "lin",
            "valueType": "num",
        })
        anim_y_cbn = _create_element(doc, "p:cBhvr", {"additive": "base"})
        anim_y.appendChild(anim_y_cbn)

        anim_y_ctn = _create_element(doc, "p:cTn", {
            "id": str(start_id),
            "dur": dur_str,
            "fill": "hold",
        })
        anim_y_cbn.appendChild(anim_y_ctn)
        anim_y_cbn.appendChild(_build_spTgt(doc, shape_id))

        attr_lst = _create_element(doc, "p:attrNameLst")
        attr_name = _create_element(doc, "p:attrName")
        attr_name.appendChild(doc.createTextNode("ppt_y"))
        attr_lst.appendChild(attr_name)
        anim_y_cbn.appendChild(attr_lst)

        tav_lst = _create_element(doc, "p:tavLst")

        tav1 = _create_element(doc, "p:tav", {"tm": "0"})
        tav1_val = _create_element(doc, "p:val")
        tav1_str = _create_element(doc, "p:strVal", {"val": f"#{y_by}"})
        tav1_val.appendChild(tav1_str)
        tav1.appendChild(tav1_val)
        tav_lst.appendChild(tav1)

        tav2 = _create_element(doc, "p:tav", {"tm": "100000"})
        tav2_val = _create_element(doc, "p:val")
        tav2_str = _create_element(doc, "p:strVal", {"val": "#0"})
        tav2_val.appendChild(tav2_str)
        tav2.appendChild(tav2_val)
        tav_lst.appendChild(tav2)

        anim_y.appendChild(tav_lst)
        parent.appendChild(anim_y)
        start_id += 1

    # p:set — 可见性
    set_node = _create_element(doc, "p:set")
    set_cbn = _create_element(doc, "p:cBhvr")
    set_node.appendChild(set_cbn)

    set_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id),
        "dur": "1",
        "fill": "hold",
    })
    set_cbn.appendChild(set_ctn)

    set_st_cond = _create_element(doc, "p:stCondLst")
    set_cond = _create_element(doc, "p:cond", {"delay": "0"})
    set_st_cond.appendChild(set_cond)
    set_ctn.appendChild(set_st_cond)

    set_cbn.appendChild(_build_spTgt(doc, shape_id))

    attr_name_lst = _create_element(doc, "p:attrNameLst")
    attr_name = _create_element(doc, "p:attrName")
    attr_name.appendChild(doc.createTextNode("style.visibility"))
    attr_name_lst.appendChild(attr_name)
    set_cbn.appendChild(attr_name_lst)

    to_node = _create_element(doc, "p:to")
    str_val = _create_element(doc, "p:strVal", {
        "val": "visible" if is_entrance else "hidden",
    })
    to_node.appendChild(str_val)
    set_node.appendChild(to_node)
    parent.appendChild(set_node)


def _build_wipe_behavior(
    doc: object,
    parent: object,
    shape_id: str,
    dur_str: str,
    preset_class: str,
    start_id: int,
) -> None:
    """构建擦除动画行为节点。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param shape_id: 目标形状 ID
    :param dur_str: 持续时间字符串
    :param preset_class: entr 或 exit
    :param start_id: 起始 id
    """
    is_entrance = (preset_class == "entr")

    # p:animEffect — wipe 效果
    anim_effect = _create_element(doc, "p:animEffect", {
        "transition": "in" if is_entrance else "out",
        "filter": "wipe(down)",
    })
    anim_effect_cbn = _create_element(doc, "p:cBhvr")
    anim_effect.appendChild(anim_effect_cbn)

    anim_effect_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id),
        "dur": dur_str,
    })
    anim_effect_cbn.appendChild(anim_effect_ctn)
    anim_effect_cbn.appendChild(_build_spTgt(doc, shape_id))
    parent.appendChild(anim_effect)

    # p:set — 可见性
    set_node = _create_element(doc, "p:set")
    set_cbn = _create_element(doc, "p:cBhvr")
    set_node.appendChild(set_cbn)

    set_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id + 1),
        "dur": "1",
        "fill": "hold",
    })
    set_cbn.appendChild(set_ctn)

    set_st_cond = _create_element(doc, "p:stCondLst")
    set_cond = _create_element(doc, "p:cond", {"delay": "0"})
    set_st_cond.appendChild(set_cond)
    set_ctn.appendChild(set_st_cond)

    set_cbn.appendChild(_build_spTgt(doc, shape_id))

    attr_name_lst = _create_element(doc, "p:attrNameLst")
    attr_name = _create_element(doc, "p:attrName")
    attr_name.appendChild(doc.createTextNode("style.visibility"))
    attr_name_lst.appendChild(attr_name)
    set_cbn.appendChild(attr_name_lst)

    to_node = _create_element(doc, "p:to")
    str_val = _create_element(doc, "p:strVal", {
        "val": "visible" if is_entrance else "hidden",
    })
    to_node.appendChild(str_val)
    set_node.appendChild(to_node)
    parent.appendChild(set_node)


def _build_appear_behavior(
    doc: object,
    parent: object,
    shape_id: str,
    preset_class: str,
    start_id: int,
) -> None:
    """构建出现/消失动画行为节点。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param shape_id: 目标形状 ID
    :param preset_class: entr 或 exit
    :param start_id: 起始 id
    """
    is_entrance = (preset_class == "entr")

    # p:set — 仅设置可见性（无渐变）
    set_node = _create_element(doc, "p:set")
    set_cbn = _create_element(doc, "p:cBhvr")
    set_node.appendChild(set_cbn)

    set_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id),
        "dur": "1",
        "fill": "hold",
    })
    set_cbn.appendChild(set_ctn)

    set_st_cond = _create_element(doc, "p:stCondLst")
    set_cond = _create_element(doc, "p:cond", {"delay": "0"})
    set_st_cond.appendChild(set_cond)
    set_ctn.appendChild(set_st_cond)

    set_cbn.appendChild(_build_spTgt(doc, shape_id))

    attr_name_lst = _create_element(doc, "p:attrNameLst")
    attr_name = _create_element(doc, "p:attrName")
    attr_name.appendChild(doc.createTextNode("style.visibility"))
    attr_name_lst.appendChild(attr_name)
    set_cbn.appendChild(attr_name_lst)

    to_node = _create_element(doc, "p:to")
    str_val = _create_element(doc, "p:strVal", {
        "val": "visible" if is_entrance else "hidden",
    })
    to_node.appendChild(str_val)
    set_node.appendChild(to_node)
    parent.appendChild(set_node)


def _build_zoom_behavior(
    doc: object,
    parent: object,
    shape_id: str,
    dur_str: str,
    preset_class: str,
    start_id: int,
) -> None:
    """构建缩放动画行为节点。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param shape_id: 目标形状 ID
    :param dur_str: 持续时间字符串
    :param preset_class: entr 或 exit
    :param start_id: 起始 id
    """
    is_entrance = (preset_class == "entr")

    # p:animScale — 缩放效果
    anim_scale = _create_element(doc, "p:animScale")
    anim_scale_cbn = _create_element(doc, "p:cBhvr")
    anim_scale.appendChild(anim_scale_cbn)

    anim_scale_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id),
        "dur": dur_str,
        "fill": "hold",
    })
    anim_scale_cbn.appendChild(anim_scale_ctn)
    anim_scale_cbn.appendChild(_build_spTgt(doc, shape_id))

    if is_entrance:
        by_node = _create_element(doc, "p:by", {"x": "100000", "y": "100000"})
        from_node = _create_element(doc, "p:from", {"x": "0", "y": "0"})
        anim_scale.appendChild(by_node)
        anim_scale.appendChild(from_node)
    else:
        by_node = _create_element(doc, "p:by", {"x": "0", "y": "0"})
        from_node = _create_element(doc, "p:from", {"x": "100000", "y": "100000"})
        anim_scale.appendChild(by_node)
        anim_scale.appendChild(from_node)

    parent.appendChild(anim_scale)

    # p:set — 可见性
    set_node = _create_element(doc, "p:set")
    set_cbn = _create_element(doc, "p:cBhvr")
    set_node.appendChild(set_cbn)

    set_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id + 1),
        "dur": "1",
        "fill": "hold",
    })
    set_cbn.appendChild(set_ctn)

    set_st_cond = _create_element(doc, "p:stCondLst")
    set_cond = _create_element(doc, "p:cond", {"delay": "0"})
    set_st_cond.appendChild(set_cond)
    set_ctn.appendChild(set_st_cond)

    set_cbn.appendChild(_build_spTgt(doc, shape_id))

    attr_name_lst = _create_element(doc, "p:attrNameLst")
    attr_name = _create_element(doc, "p:attrName")
    attr_name.appendChild(doc.createTextNode("style.visibility"))
    attr_name_lst.appendChild(attr_name)
    set_cbn.appendChild(attr_name_lst)

    to_node = _create_element(doc, "p:to")
    str_val = _create_element(doc, "p:strVal", {
        "val": "visible" if is_entrance else "hidden",
    })
    to_node.appendChild(str_val)
    set_node.appendChild(to_node)
    parent.appendChild(set_node)


def _build_generic_effect_behavior(
    doc: object,
    parent: object,
    shape_id: str,
    dur_str: str,
    effect_name: str,
    preset_class: str,
    start_id: int,
) -> None:
    """构建通用动画效果行为节点（split、wheel、bounce、float、swivel）。

    使用 animEffect + set 的通用模式。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param shape_id: 目标形状 ID
    :param dur_str: 持续时间字符串
    :param effect_name: 效果名称
    :param preset_class: entr 或 exit
    :param start_id: 起始 id
    """
    is_entrance = (preset_class == "entr")

    # 效果 -> filter 映射
    filter_map = {
        "split": "barn(inVertical)" if is_entrance else "barn(outVertical)",
        "wheel": "wheel(1)",
        "bounce": "fade",
        "float": "fade",
        "swivel": "fade",
    }
    filter_val = filter_map.get(effect_name, "fade")

    # p:animEffect
    anim_effect = _create_element(doc, "p:animEffect", {
        "transition": "in" if is_entrance else "out",
        "filter": filter_val,
    })
    anim_effect_cbn = _create_element(doc, "p:cBhvr")
    anim_effect.appendChild(anim_effect_cbn)

    anim_effect_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id),
        "dur": dur_str,
    })
    anim_effect_cbn.appendChild(anim_effect_ctn)
    anim_effect_cbn.appendChild(_build_spTgt(doc, shape_id))
    parent.appendChild(anim_effect)

    # p:set — 可见性
    set_node = _create_element(doc, "p:set")
    set_cbn = _create_element(doc, "p:cBhvr")
    set_node.appendChild(set_cbn)

    set_ctn = _create_element(doc, "p:cTn", {
        "id": str(start_id + 1),
        "dur": "1",
        "fill": "hold",
    })
    set_cbn.appendChild(set_ctn)

    set_st_cond = _create_element(doc, "p:stCondLst")
    set_cond = _create_element(doc, "p:cond", {"delay": "0"})
    set_st_cond.appendChild(set_cond)
    set_ctn.appendChild(set_st_cond)

    set_cbn.appendChild(_build_spTgt(doc, shape_id))

    attr_name_lst = _create_element(doc, "p:attrNameLst")
    attr_name = _create_element(doc, "p:attrName")
    attr_name.appendChild(doc.createTextNode("style.visibility"))
    attr_name_lst.appendChild(attr_name)
    set_cbn.appendChild(attr_name_lst)

    to_node = _create_element(doc, "p:to")
    str_val = _create_element(doc, "p:strVal", {
        "val": "visible" if is_entrance else "hidden",
    })
    to_node.appendChild(str_val)
    set_node.appendChild(to_node)
    parent.appendChild(set_node)


# ============================================================
# 核心逻辑
# ============================================================

def _ensure_timing_structure(dom: object) -> object:
    """确保 slide XML 中存在完整的 p:timing 骨架结构。

    如果不存在则创建:
    p:timing
      p:tnLst
        p:par
          p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"
            p:childTnLst
              p:seq concurrent="1" nextAc="seek"
                p:cTn id="2" dur="indefinite" nodeType="mainSeq"
                  p:childTnLst
                    (动画步骤在此追加)
                p:prevCondLst
                  p:cond evt="onPrev" delay="0"
                    p:tgtEl
                      p:sldTgt
                p:nextCondLst
                  p:cond evt="onNext" delay="0"
                    p:tgtEl
                      p:sldTgt

    :param dom: DOM 文档对象
    :return: p:seq 下的 p:childTnLst 节点（动画步骤容器）
    """
    # 检查是否已有 p:timing
    timing_nodes = dom.getElementsByTagName("p:timing")
    if timing_nodes:
        # 已有 timing，找到 seq 的 childTnLst
        seq_nodes = dom.getElementsByTagName("p:seq")
        if seq_nodes:
            seq = seq_nodes[0]
            # 找到 seq 的 cTn 下的 childTnLst
            for ctn in seq.getElementsByTagName("p:cTn"):
                if ctn.parentNode == seq:
                    child_tn_nodes = ctn.getElementsByTagName("p:childTnLst")
                    if child_tn_nodes:
                        return child_tn_nodes[0]
                    # 没有 childTnLst，创建一个
                    child_tn = dom.createElement("p:childTnLst")
                    ctn.appendChild(child_tn)
                    return child_tn
        # 有 timing 但没有 seq — 这种情况不太正常，重建
        timing_node = timing_nodes[0]
        timing_node.parentNode.removeChild(timing_node)

    # 从头构建 p:timing 结构
    timing = dom.createElement("p:timing")

    tn_lst = dom.createElement("p:tnLst")
    timing.appendChild(tn_lst)

    # 根 par
    root_par = dom.createElement("p:par")
    tn_lst.appendChild(root_par)

    root_ctn = _create_element(dom, "p:cTn", {
        "id": "1",
        "dur": "indefinite",
        "restart": "never",
        "nodeType": "tmRoot",
    })
    root_par.appendChild(root_ctn)

    root_child_tn = dom.createElement("p:childTnLst")
    root_ctn.appendChild(root_child_tn)

    # seq（主序列）
    seq = _create_element(dom, "p:seq", {
        "concurrent": "1",
        "nextAc": "seek",
    })
    root_child_tn.appendChild(seq)

    seq_ctn = _create_element(dom, "p:cTn", {
        "id": "2",
        "dur": "indefinite",
        "nodeType": "mainSeq",
    })
    seq.appendChild(seq_ctn)

    seq_child_tn = dom.createElement("p:childTnLst")
    seq_ctn.appendChild(seq_child_tn)

    # prevCondLst
    prev_cond_lst = dom.createElement("p:prevCondLst")
    prev_cond = _create_element(dom, "p:cond", {"evt": "onPrev", "delay": "0"})
    prev_tgt = dom.createElement("p:tgtEl")
    prev_sld = dom.createElement("p:sldTgt")
    prev_tgt.appendChild(prev_sld)
    prev_cond.appendChild(prev_tgt)
    prev_cond_lst.appendChild(prev_cond)
    seq.appendChild(prev_cond_lst)

    # nextCondLst
    next_cond_lst = dom.createElement("p:nextCondLst")
    next_cond = _create_element(dom, "p:cond", {"evt": "onNext", "delay": "0"})
    next_tgt = dom.createElement("p:tgtEl")
    next_sld = dom.createElement("p:sldTgt")
    next_tgt.appendChild(next_sld)
    next_cond.appendChild(next_tgt)
    next_cond_lst.appendChild(next_cond)
    seq.appendChild(next_cond_lst)

    # 将 p:timing 插入到 slide 的根节点中（在 p:sld 下）
    sld_nodes = dom.getElementsByTagName("p:sld")
    if sld_nodes:
        sld_nodes[0].appendChild(timing)

    return seq_child_tn


def _renumber_ctn_ids(dom: object) -> None:
    """重新编号所有 p:cTn 的 id 属性，确保连续且唯一。

    OOXML 要求 timing 树中所有 cTn 的 id 必须唯一且从 1 开始递增。

    :param dom: DOM 文档对象
    """
    timing_nodes = dom.getElementsByTagName("p:timing")
    if not timing_nodes:
        return

    counter = 1
    for ctn in timing_nodes[0].getElementsByTagName("p:cTn"):
        ctn.setAttribute("id", str(counter))
        counter += 1


def add_animation(
    unpacked_dir: Path,
    slide_num: int,
    target: str,
    effect: str = "fade",
    direction: str = "in",
    duration_ms: int = 500,
    delay_ms: int = 0,
    trigger: str = "onClick",
    dry_run: bool = False,
) -> None:
    """在指定幻灯片的指定形状上添加动画效果。

    :param unpacked_dir: 解包目录路径
    :param slide_num: 幻灯片编号
    :param target: 目标形状名称或 ID
    :param effect: 动画效果类型
    :param direction: 效果方向
    :param duration_ms: 持续时间（毫秒）
    :param delay_ms: 延迟时间（毫秒）
    :param trigger: 触发方式
    :param dry_run: 仅预览不修改
    """
    slide_file = unpacked_dir / "ppt" / "slides" / f"slide{slide_num}.xml"
    if not slide_file.exists():
        print(f"Error: {slide_file} 不存在", file=sys.stderr)
        sys.exit(1)

    dom = defusedxml.minidom.parse(str(slide_file))

    # 查找目标形状
    shape_info = find_shape_by_target(dom, target)
    if shape_info is None:
        print(f"Error: 未找到名称或 ID 为 \"{target}\" 的形状", file=sys.stderr)
        print("\n当前幻灯片中的形状列表:", file=sys.stderr)
        for sp_id, sp_name in list_shapes(dom):
            print(f"  id={sp_id}, name=\"{sp_name}\"", file=sys.stderr)
        sys.exit(1)

    shape_id, shape_name = shape_info

    # 查找预设映射
    key = (effect, direction)
    if key not in EFFECT_PRESET_MAP:
        # 尝试默认方向
        fallback_dir = "in" if direction not in ("in", "out") else direction
        key = (effect, fallback_dir)
        if key not in EFFECT_PRESET_MAP:
            print(
                f"Error: 不支持的效果组合 effect={effect}, direction={direction}",
                file=sys.stderr,
            )
            sys.exit(1)

    preset_class, preset_id, preset_subtype = EFFECT_PRESET_MAP[key]

    # 中文效果描述
    class_names = {"entr": "进入", "exit": "退出", "emph": "强调"}
    class_cn = class_names.get(preset_class, preset_class)

    # 打印预览信息
    mode = "[DRY RUN] " if dry_run else ""
    print(f"{mode}Adding animation to slide{slide_num}.xml:")
    print(f"  Target:   id={shape_id}, name=\"{shape_name}\"")
    print(f"  Effect:   {effect} ({class_cn})")
    print(f"  Direction: {direction}")
    print(f"  Duration: {duration_ms}ms")
    if delay_ms > 0:
        print(f"  Delay:    {delay_ms}ms")
    print(f"  Trigger:  {trigger}")
    print(f"  Preset:   class={preset_class}, id={preset_id}, subtype={preset_subtype}")

    if dry_run:
        print(f"\n{mode}No changes made.")
        return

    # 确保 timing 结构存在
    seq_child_tn = _ensure_timing_structure(dom)

    # 获取当前已有的动画数量（用于 grpId 分配）
    existing_count = _get_existing_anim_count(dom)

    # 计算当前 timing 树中最大的 cTn id
    max_ctn_id = 0
    timing_nodes = dom.getElementsByTagName("p:timing")
    if timing_nodes:
        for ctn in timing_nodes[0].getElementsByTagName("p:cTn"):
            ctn_id = ctn.getAttribute("id")
            if ctn_id:
                try:
                    max_ctn_id = max(max_ctn_id, int(ctn_id))
                except ValueError:
                    pass

    # 构建动画效果节点
    anim_node = build_anim_effect_node(
        doc=dom,
        shape_id=shape_id,
        preset_class=preset_class,
        preset_id=preset_id,
        preset_subtype=preset_subtype,
        duration_ms=duration_ms,
        delay_ms=delay_ms,
        trigger=trigger,
        effect_name=effect,
        direction=direction,
        grp_id=max_ctn_id,
    )

    # 追加到序列中
    seq_child_tn.appendChild(anim_node)

    # 重新编号所有 cTn id
    _renumber_ctn_ids(dom)

    # 保存
    xml_str = dom.toxml(encoding="utf-8")
    slide_file.write_bytes(xml_str)

    print(f"\nDone. \"{effect}\" animation added to \"{shape_name}\" (id={shape_id})")
    print(f"Total animations on this slide: {existing_count + 1}")


# ============================================================
# 命令行接口
# ============================================================

def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    :return: 解析后的参数对象
    """
    parser = argparse.ArgumentParser(
        description="为解包后的 PPTX 幻灯片中的形状添加动画效果",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # 淡入效果
  python add_animation.py unpacked/ --slide 3 --target "饼图" \\
      --effect fade --direction in --duration 500

  # 淡出效果
  python add_animation.py unpacked/ --slide 3 --target "饼图" \\
      --effect fade --direction out --duration 500

  # 从左飞入
  python add_animation.py unpacked/ --slide 1 --target "5" \\
      --effect fly --direction fromLeft --duration 800

  # 擦除进入（与前一个动画同时）
  python add_animation.py unpacked/ --slide 2 --target "标题" \\
      --effect wipe --direction in --trigger withPrevious

Effects: fade, fly, wipe, appear, disappear, zoom,
         split, wheel, bounce, float, swivel

Directions: in, out, fromLeft, fromRight, fromTop, fromBottom

Triggers: onClick, withPrevious, afterPrevious
        """,
    )
    parser.add_argument(
        "unpacked_dir",
        type=Path,
        help="解包后的 PPTX 目录路径",
    )
    parser.add_argument(
        "--slide",
        type=int,
        required=True,
        help="目标幻灯片编号（如 3）",
    )
    parser.add_argument(
        "--target",
        type=str,
        required=True,
        help="目标形状名称或 ID（如 \"饼图\" 或 \"5\"）",
    )
    parser.add_argument(
        "--effect",
        type=str,
        default="fade",
        help="动画效果类型（默认: fade）",
    )
    parser.add_argument(
        "--direction",
        type=str,
        default="in",
        help="效果方向（默认: in）",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=500,
        help="持续时间（毫秒，默认: 500）",
    )
    parser.add_argument(
        "--delay",
        type=int,
        default=0,
        help="延迟时间（毫秒，默认: 0）",
    )
    parser.add_argument(
        "--trigger",
        type=str,
        default="onClick",
        help="触发方式（默认: onClick）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅预览不实际修改文件",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    """校验命令行参数。

    :param args: 解析后的参数对象
    """
    if not args.unpacked_dir.exists():
        print(f"Error: {args.unpacked_dir} 不存在", file=sys.stderr)
        sys.exit(1)

    if args.effect not in EFFECT_TYPES:
        print(
            f"Error: 不支持的动画效果 '{args.effect}'。\n"
            f"可选值: {', '.join(sorted(EFFECT_TYPES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.direction not in DIRECTION_VALUES:
        print(
            f"Error: 不支持的方向 '{args.direction}'。\n"
            f"可选值: {', '.join(sorted(DIRECTION_VALUES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.trigger not in TRIGGER_VALUES:
        print(
            f"Error: 不支持的触发方式 '{args.trigger}'。\n"
            f"可选值: {', '.join(sorted(TRIGGER_VALUES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.duration <= 0:
        print("Error: 持续时间必须大于 0", file=sys.stderr)
        sys.exit(1)

    if args.delay < 0:
        print("Error: 延迟时间不能为负数", file=sys.stderr)
        sys.exit(1)

    # fly 效果的方向校验
    fly_directions = {"in", "out", "fromLeft", "fromRight", "fromTop", "fromBottom"}
    if args.effect == "fly" and args.direction not in fly_directions:
        print(
            f"Error: fly 效果不支持方向 '{args.direction}'。\n"
            f"可选值: {', '.join(sorted(fly_directions))}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    args = parse_args()
    validate_args(args)

    add_animation(
        unpacked_dir=args.unpacked_dir,
        slide_num=args.slide,
        target=args.target,
        effect=args.effect,
        direction=args.direction,
        duration_ms=args.duration,
        delay_ms=args.delay,
        trigger=args.trigger,
        dry_run=args.dry_run,
    )
