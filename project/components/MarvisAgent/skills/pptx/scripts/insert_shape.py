# -*- coding: utf-8 -*-
"""在解包后的 PPTX 幻灯片中插入预置形状（矩形、圆角矩形、椭圆、箭头等），支持填充颜色和文本。

Usage: python insert_shape.py <unpacked_dir> --slide <N> [options]

Options:
    --slide <N>         目标幻灯片编号（如 3 表示 slide3.xml）
    --shape <type>      形状类型: rect, roundRect, ellipse, diamond,
                        rightArrow, leftArrow, upArrow, downArrow,
                        triangle, pentagon, hexagon, star5, star6,
                        callout1, callout2, cloud, heart, plus,
                        chevron, ribbon, flowChartProcess 等
                        (默认: rect)
    --left <inches>     左边距（英寸，默认: 1.0）
    --top <inches>      上边距（英寸，默认: 1.0）
    --width <inches>    宽度（英寸，默认: 4.0）
    --height <inches>   高度（英寸，默认: 1.5）
    --fill <hex>        填充颜色（十六进制 RGB，如 0070C0=蓝色）
    --border-color <hex> 边框颜色（十六进制 RGB，不指定则无边框）
    --border-width <pt>  边框宽度（磅值，默认: 1.0）
    --text <string>     形状内文本内容
    --text-color <hex>  文本颜色（十六进制 RGB，默认: 000000=黑色）
    --text-font <name>  文本字体名称（如 "微软雅黑"）
    --text-size <pt>    文本字号（磅值，默认: 18）
    --text-bold <0|1>   文本是否加粗（默认: 0）
    --text-align <type> 文本对齐: l=左, ctr=居中, r=右（默认: ctr）
    --text-valign <type> 文本垂直对齐: t=顶部, ctr=居中, b=底部（默认: ctr）
    --rotation <degrees> 旋转角度（默认: 0）
    --name <string>     形状名称（可选，不指定则自动生成）
    --dry-run           仅预览不实际修改

Examples:
    # 在第 3 页插入蓝色矩形框，白色文字 "核心指标"
    python insert_shape.py unpacked/ --slide 3 --shape rect \\
        --left 3 --top 2 --width 4 --height 1.5 \\
        --fill 0070C0 --text "核心指标" --text-color FFFFFF --text-size 24 --text-bold 1

    # 在第 1 页插入红色圆角矩形
    python insert_shape.py unpacked/ --slide 1 --shape roundRect \\
        --left 1 --top 1 --width 3 --height 1 \\
        --fill FF0000 --border-color 990000 --border-width 2

    # 在第 2 页插入右箭头
    python insert_shape.py unpacked/ --slide 2 --shape rightArrow \\
        --left 5 --top 3 --width 2 --height 1 \\
        --fill FFD700 --text "下一步" --text-color 333333

    # 预览模式
    python insert_shape.py unpacked/ --slide 3 --shape rect --fill 0070C0 --dry-run
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

# 支持的预设形状类型
# 完整列表参考: OOXML ISO/IEC 29500 ST_ShapeType
PRESET_SHAPES = {
    # 基本形状
    "rect", "roundRect", "snip1Rect", "snip2SameRect",
    "ellipse", "triangle", "rtTriangle",
    "diamond", "pentagon", "hexagon", "heptagon", "octagon",
    "parallelogram", "trapezoid",
    # 星形
    "star4", "star5", "star6", "star8", "star10", "star12",
    "star16", "star24", "star32",
    # 箭头
    "rightArrow", "leftArrow", "upArrow", "downArrow",
    "leftRightArrow", "upDownArrow", "bentArrow",
    "notchedRightArrow", "stripedRightArrow",
    "chevron", "homePlate",
    # 流程图
    "flowChartProcess", "flowChartDecision", "flowChartTerminator",
    "flowChartDocument", "flowChartInputOutput",
    "flowChartPreparation", "flowChartManualInput",
    # 标注
    "wedgeRoundRectCallout", "wedgeRectCallout", "wedgeEllipseCallout",
    "callout1", "callout2", "callout3",
    "cloudCallout", "borderCallout1", "borderCallout2",
    # 装饰
    "cloud", "heart", "ribbon", "ribbon2",
    "wave", "doubleWave",
    "plus", "cross",
    "can", "cube", "bevel", "donut",
    "plaque", "frame",
    # 括号
    "bracketPair", "bracePair", "leftBracket", "rightBracket",
    "leftBrace", "rightBrace",
}

# 对齐方式
ALIGN_VALUES = {"l", "ctr", "r", "just"}

# 垂直对齐方式
VALIGN_VALUES = {"t", "ctr", "b"}

# EMU 转换常量: 1 英寸 = 914400 EMU
EMU_PER_INCH = 914400

# 1 磅 = 12700 EMU
EMU_PER_PT = 12700


# ============================================================
# 工具函数
# ============================================================

def inches_to_emu(inches: float) -> int:
    """将英寸转换为 EMU（English Metric Units）。

    OOXML 中位置和尺寸使用 EMU 单位。
    1 英寸 = 914400 EMU

    :param inches: 英寸值
    :return: EMU 值
    """
    return int(inches * EMU_PER_INCH)


def pt_to_emu(pt: float) -> int:
    """将磅值转换为 EMU。

    :param pt: 磅值
    :return: EMU 值
    """
    return int(pt * EMU_PER_PT)


def pt_to_hundredths(pt: float) -> str:
    """将磅值转换为百分之一磅（OOXML 中 sz 的单位）。

    :param pt: 磅值
    :return: 百分之一磅的字符串
    """
    return str(int(pt * 100))


def degrees_to_ooxml(degrees: float) -> str:
    """将角度转换为 OOXML 旋转值。

    OOXML 中旋转值为角度 × 60000。

    :param degrees: 角度值
    :return: OOXML 旋转值字符串
    """
    return str(int(degrees * 60000))


def clean_color(color_str: str) -> str:
    """清理颜色值：去掉 # 前缀并转为大写。

    :param color_str: 颜色字符串
    :return: 清理后的 6 位大写十六进制颜色
    :raises ValueError: 如果颜色格式无效
    """
    cleaned = color_str.lstrip("#")
    if len(cleaned) != 6 or not all(c in "0123456789abcdefABCDEF" for c in cleaned):
        raise ValueError(f"无效的颜色值 '{color_str}'，请使用 6 位十六进制 RGB（如 FF0000）")
    return cleaned.upper()


def _get_max_sp_id(dom: object) -> int:
    """获取幻灯片中当前最大的形状 ID。

    :param dom: DOM 文档对象
    :return: 最大 ID 值
    """
    max_id = 0
    for cnv_pr in dom.getElementsByTagName("p:cNvPr"):
        id_attr = cnv_pr.getAttribute("id")
        if id_attr:
            try:
                max_id = max(max_id, int(id_attr))
            except ValueError:
                pass

    return max_id


# ============================================================
# XML 构建
# ============================================================

def build_shape_xml(
    doc: object,
    shape_id: int,
    shape_name: str,
    preset: str,
    left: float,
    top: float,
    width: float,
    height: float,
    fill_color: str | None = None,
    border_color: str | None = None,
    border_width_pt: float = 1.0,
    rotation: float = 0,
    text: str | None = None,
    text_color: str = "000000",
    text_font: str | None = None,
    text_size_pt: float = 18,
    text_bold: int = 0,
    text_align: str = "ctr",
    text_valign: str = "ctr",
) -> object:
    """构建一个完整的 p:sp 形状 DOM 节点。

    :param doc: DOM 文档对象
    :param shape_id: 形状唯一 ID
    :param shape_name: 形状名称
    :param preset: 预设形状类型（如 "rect", "roundRect"）
    :param left: 左边距（英寸）
    :param top: 上边距（英寸）
    :param width: 宽度（英寸）
    :param height: 高度（英寸）
    :param fill_color: 填充颜色（十六进制 RGB）
    :param border_color: 边框颜色（十六进制 RGB）
    :param border_width_pt: 边框宽度（磅值）
    :param rotation: 旋转角度
    :param text: 文本内容
    :param text_color: 文本颜色（十六进制 RGB）
    :param text_font: 文本字体名称
    :param text_size_pt: 文本字号（磅值）
    :param text_bold: 是否加粗
    :param text_align: 水平对齐
    :param text_valign: 垂直对齐
    :return: p:sp DOM 节点
    """
    sp = doc.createElement("p:sp")

    # ---- nvSpPr（非可视属性）----
    nv_sp_pr = doc.createElement("p:nvSpPr")

    c_nv_pr = doc.createElement("p:cNvPr")
    c_nv_pr.setAttribute("id", str(shape_id))
    c_nv_pr.setAttribute("name", shape_name)
    nv_sp_pr.appendChild(c_nv_pr)

    c_nv_sp_pr = doc.createElement("p:cNvSpPr")
    nv_sp_pr.appendChild(c_nv_sp_pr)

    nv_pr = doc.createElement("p:nvPr")
    nv_sp_pr.appendChild(nv_pr)

    sp.appendChild(nv_sp_pr)

    # ---- spPr（形状属性）----
    sp_pr = doc.createElement("p:spPr")

    # 位置和尺寸
    xfrm = doc.createElement("a:xfrm")
    if rotation != 0:
        xfrm.setAttribute("rot", degrees_to_ooxml(rotation))

    off = doc.createElement("a:off")
    off.setAttribute("x", str(inches_to_emu(left)))
    off.setAttribute("y", str(inches_to_emu(top)))
    xfrm.appendChild(off)

    ext = doc.createElement("a:ext")
    ext.setAttribute("cx", str(inches_to_emu(width)))
    ext.setAttribute("cy", str(inches_to_emu(height)))
    xfrm.appendChild(ext)

    sp_pr.appendChild(xfrm)

    # 预设几何形状
    prst_geom = doc.createElement("a:prstGeom")
    prst_geom.setAttribute("prst", preset)
    av_lst = doc.createElement("a:avLst")
    prst_geom.appendChild(av_lst)
    sp_pr.appendChild(prst_geom)

    # 填充颜色
    if fill_color is not None:
        solid_fill = doc.createElement("a:solidFill")
        srgb_clr = doc.createElement("a:srgbClr")
        srgb_clr.setAttribute("val", fill_color)
        solid_fill.appendChild(srgb_clr)
        sp_pr.appendChild(solid_fill)
    else:
        no_fill = doc.createElement("a:noFill")
        sp_pr.appendChild(no_fill)

    # 边框
    ln = doc.createElement("a:ln")
    if border_color is not None:
        ln.setAttribute("w", str(pt_to_emu(border_width_pt)))
        border_fill = doc.createElement("a:solidFill")
        border_srgb = doc.createElement("a:srgbClr")
        border_srgb.setAttribute("val", border_color)
        border_fill.appendChild(border_srgb)
        ln.appendChild(border_fill)
    else:
        no_fill = doc.createElement("a:noFill")
        ln.appendChild(no_fill)
    sp_pr.appendChild(ln)

    sp.appendChild(sp_pr)

    # ---- txBody（文本框）----
    tx_body = doc.createElement("p:txBody")

    # 文本框属性
    body_pr = doc.createElement("a:bodyPr")
    body_pr.setAttribute("wrap", "square")
    body_pr.setAttribute("anchor", text_valign)
    body_pr.setAttribute("anchorCtr", "0")
    # 设置内边距（上下左右各 0.05 英寸）
    margin_emu = str(inches_to_emu(0.05))
    body_pr.setAttribute("lIns", margin_emu)
    body_pr.setAttribute("tIns", margin_emu)
    body_pr.setAttribute("rIns", margin_emu)
    body_pr.setAttribute("bIns", margin_emu)
    tx_body.appendChild(body_pr)

    # 列表样式（空）
    lst_style = doc.createElement("a:lstStyle")
    tx_body.appendChild(lst_style)

    # 段落
    p = doc.createElement("a:p")

    # 段落属性
    p_pr = doc.createElement("a:pPr")
    p_pr.setAttribute("algn", text_align)
    p.appendChild(p_pr)

    if text:
        # 运行
        r = doc.createElement("a:r")

        # 运行属性
        r_pr = doc.createElement("a:rPr")
        r_pr.setAttribute("lang", "zh-CN")
        r_pr.setAttribute("altLang", "en-US")
        r_pr.setAttribute("sz", pt_to_hundredths(text_size_pt))
        r_pr.setAttribute("dirty", "0")
        if text_bold:
            r_pr.setAttribute("b", "1")

        # 文本颜色
        text_fill = doc.createElement("a:solidFill")
        text_srgb = doc.createElement("a:srgbClr")
        text_srgb.setAttribute("val", text_color)
        text_fill.appendChild(text_srgb)
        r_pr.appendChild(text_fill)

        # 字体
        if text_font:
            latin = doc.createElement("a:latin")
            latin.setAttribute("typeface", text_font)
            r_pr.appendChild(latin)

            ea = doc.createElement("a:ea")
            ea.setAttribute("typeface", text_font)
            r_pr.appendChild(ea)

        r.appendChild(r_pr)

        # 文本内容
        t = doc.createElement("a:t")
        t_text = doc.createTextNode(text)
        t.appendChild(t_text)
        r.appendChild(t)

        p.appendChild(r)
    else:
        # 空段落需要 endParaRPr
        end_rpr = doc.createElement("a:endParaRPr")
        end_rpr.setAttribute("lang", "zh-CN")
        p.appendChild(end_rpr)

    tx_body.appendChild(p)
    sp.appendChild(tx_body)

    return sp


# ============================================================
# 核心逻辑
# ============================================================

def insert_shape(
    unpacked_dir: Path,
    slide_num: int,
    preset: str = "rect",
    left: float = 1.0,
    top: float = 1.0,
    width: float = 4.0,
    height: float = 1.5,
    fill_color: str | None = None,
    border_color: str | None = None,
    border_width_pt: float = 1.0,
    rotation: float = 0,
    text: str | None = None,
    text_color: str = "000000",
    text_font: str | None = None,
    text_size_pt: float = 18,
    text_bold: int = 0,
    text_align: str = "ctr",
    text_valign: str = "ctr",
    shape_name: str | None = None,
    dry_run: bool = False,
) -> None:
    """在指定幻灯片中插入预设形状。

    :param unpacked_dir: 解包目录路径
    :param slide_num: 幻灯片编号
    :param preset: 预设形状类型
    :param left: 左边距（英寸）
    :param top: 上边距（英寸）
    :param width: 宽度（英寸）
    :param height: 高度（英寸）
    :param fill_color: 填充颜色（十六进制 RGB）
    :param border_color: 边框颜色（十六进制 RGB）
    :param border_width_pt: 边框宽度（磅值）
    :param rotation: 旋转角度
    :param text: 形状内文本
    :param text_color: 文本颜色（十六进制 RGB）
    :param text_font: 文本字体名称
    :param text_size_pt: 文本字号（磅值）
    :param text_bold: 是否加粗 (0 或 1)
    :param text_align: 水平对齐 (l, ctr, r)
    :param text_valign: 垂直对齐 (t, ctr, b)
    :param shape_name: 形状名称
    :param dry_run: 仅预览不修改
    """
    slide_file = unpacked_dir / "ppt" / "slides" / f"slide{slide_num}.xml"
    if not slide_file.exists():
        print(f"Error: {slide_file} 不存在", file=sys.stderr)
        sys.exit(1)

    dom = defusedxml.minidom.parse(str(slide_file))

    # 获取下一个可用的形状 ID
    next_id = _get_max_sp_id(dom) + 1

    # 自动生成形状名称
    if shape_name is None:
        shape_name = f"{preset} {next_id}"

    # 打印预览信息
    mode = "[DRY RUN] " if dry_run else ""
    print(f"{mode}Inserting shape into slide{slide_num}.xml:")
    print(f"  Shape:    {preset} (id={next_id}, name=\"{shape_name}\")")
    print(f"  Position: left={left}\", top={top}\"")
    print(f"  Size:     width={width}\", height={height}\"")
    if fill_color:
        print(f"  Fill:     #{fill_color}")
    else:
        print(f"  Fill:     (none)")
    if border_color:
        print(f"  Border:   #{border_color}, width={border_width_pt}pt")
    else:
        print(f"  Border:   (none)")
    if rotation != 0:
        print(f"  Rotation: {rotation}°")
    if text:
        print(f"  Text:     \"{text}\"")
        print(f"  Font:     {text_font or '(default)'}, size={text_size_pt}pt, "
              f"bold={'yes' if text_bold else 'no'}, color=#{text_color}")
        print(f"  Align:    h={text_align}, v={text_valign}")

    if dry_run:
        print(f"\n{mode}No changes made.")
        return

    # 构建形状 XML 节点
    sp_node = build_shape_xml(
        doc=dom,
        shape_id=next_id,
        shape_name=shape_name,
        preset=preset,
        left=left,
        top=top,
        width=width,
        height=height,
        fill_color=fill_color,
        border_color=border_color,
        border_width_pt=border_width_pt,
        rotation=rotation,
        text=text,
        text_color=text_color,
        text_font=text_font,
        text_size_pt=text_size_pt,
        text_bold=text_bold,
        text_align=text_align,
        text_valign=text_valign,
    )

    # 找到 spTree 并插入形状
    sp_tree_nodes = dom.getElementsByTagName("p:spTree")
    if not sp_tree_nodes:
        print("Error: 未找到 <p:spTree>，slide XML 结构异常", file=sys.stderr)
        sys.exit(1)

    sp_tree = sp_tree_nodes[0]
    sp_tree.appendChild(sp_node)

    # 保存
    xml_str = dom.toxml(encoding="utf-8")
    slide_file.write_bytes(xml_str)

    print(f"\nDone. Shape \"{shape_name}\" inserted into slide{slide_num}.xml")


# ============================================================
# 命令行接口
# ============================================================

def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    :return: 解析后的参数对象
    """
    parser = argparse.ArgumentParser(
        description="在解包后的 PPTX 幻灯片中插入预置形状",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # 蓝色矩形框 + 白色文字
  python insert_shape.py unpacked/ --slide 3 --shape rect \\
      --left 3 --top 2 --width 4 --height 1.5 \\
      --fill 0070C0 --text "核心指标" --text-color FFFFFF --text-size 24

  # 红色圆角矩形
  python insert_shape.py unpacked/ --slide 1 --shape roundRect \\
      --left 1 --top 1 --width 3 --height 1 --fill FF0000

  # 箭头 + 文字
  python insert_shape.py unpacked/ --slide 2 --shape rightArrow \\
      --left 5 --top 3 --width 2 --height 1 --fill FFD700 --text "下一步"

Common shapes: rect, roundRect, ellipse, diamond, triangle,
               rightArrow, leftArrow, chevron, star5, heart,
               flowChartProcess, callout1, cloud, plus
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
        "--shape",
        type=str,
        default="rect",
        help="形状类型（默认: rect）",
    )
    parser.add_argument(
        "--left",
        type=float,
        default=1.0,
        help="左边距（英寸，默认: 1.0）",
    )
    parser.add_argument(
        "--top",
        type=float,
        default=1.0,
        help="上边距（英寸，默认: 1.0）",
    )
    parser.add_argument(
        "--width",
        type=float,
        default=4.0,
        help="宽度（英寸，默认: 4.0）",
    )
    parser.add_argument(
        "--height",
        type=float,
        default=1.5,
        help="高度（英寸，默认: 1.5）",
    )
    parser.add_argument(
        "--fill",
        type=str,
        default=None,
        help="填充颜色（十六进制 RGB，如 0070C0=蓝色）",
    )
    parser.add_argument(
        "--border-color",
        type=str,
        default=None,
        help="边框颜色（十六进制 RGB，不指定则无边框）",
    )
    parser.add_argument(
        "--border-width",
        type=float,
        default=1.0,
        help="边框宽度（磅值，默认: 1.0）",
    )
    parser.add_argument(
        "--rotation",
        type=float,
        default=0,
        help="旋转角度（默认: 0）",
    )
    parser.add_argument(
        "--text",
        type=str,
        default=None,
        help="形状内文本内容",
    )
    parser.add_argument(
        "--text-color",
        type=str,
        default="000000",
        help="文本颜色（十六进制 RGB，默认: 000000=黑色）",
    )
    parser.add_argument(
        "--text-font",
        type=str,
        default=None,
        help="文本字体名称（如 '微软雅黑'）",
    )
    parser.add_argument(
        "--text-size",
        type=float,
        default=18,
        help="文本字号（磅值，默认: 18）",
    )
    parser.add_argument(
        "--text-bold",
        type=int,
        choices=[0, 1],
        default=0,
        help="文本是否加粗: 0=否, 1=是（默认: 0）",
    )
    parser.add_argument(
        "--text-align",
        type=str,
        default="ctr",
        help="文本水平对齐: l=左, ctr=居中, r=右（默认: ctr）",
    )
    parser.add_argument(
        "--text-valign",
        type=str,
        default="ctr",
        help="文本垂直对齐: t=顶部, ctr=居中, b=底部（默认: ctr）",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=None,
        help="形状名称（可选，不指定则自动生成）",
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

    if args.shape not in PRESET_SHAPES:
        print(
            f"Error: 不支持的形状类型 '{args.shape}'。\n"
            f"常用形状: rect, roundRect, ellipse, diamond, triangle, "
            f"rightArrow, leftArrow, chevron, star5, heart, "
            f"flowChartProcess, callout1, cloud, plus\n"
            f"全部 {len(PRESET_SHAPES)} 种支持的形状: {', '.join(sorted(PRESET_SHAPES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    # 校验颜色
    if args.fill is not None:
        try:
            args.fill = clean_color(args.fill)
        except ValueError as e:
            print(f"Error (--fill): {e}", file=sys.stderr)
            sys.exit(1)

    if args.border_color is not None:
        try:
            args.border_color = clean_color(args.border_color)
        except ValueError as e:
            print(f"Error (--border-color): {e}", file=sys.stderr)
            sys.exit(1)

    try:
        args.text_color = clean_color(args.text_color)
    except ValueError as e:
        print(f"Error (--text-color): {e}", file=sys.stderr)
        sys.exit(1)

    # 校验对齐方式
    if args.text_align not in ALIGN_VALUES:
        print(
            f"Error: 无效的水平对齐方式 '{args.text_align}'，"
            f"可选值: {', '.join(sorted(ALIGN_VALUES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.text_valign not in VALIGN_VALUES:
        print(
            f"Error: 无效的垂直对齐方式 '{args.text_valign}'，"
            f"可选值: {', '.join(sorted(VALIGN_VALUES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    # 校验尺寸
    if args.width <= 0 or args.height <= 0:
        print("Error: 宽度和高度必须大于 0", file=sys.stderr)
        sys.exit(1)

    if args.left < 0 or args.top < 0:
        print("Error: 位置不能为负数", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    args = parse_args()
    validate_args(args)

    insert_shape(
        unpacked_dir=args.unpacked_dir,
        slide_num=args.slide,
        preset=args.shape,
        left=args.left,
        top=args.top,
        width=args.width,
        height=args.height,
        fill_color=args.fill,
        border_color=args.border_color,
        border_width_pt=args.border_width,
        rotation=args.rotation,
        text=args.text,
        text_color=args.text_color,
        text_font=args.text_font,
        text_size_pt=args.text_size,
        text_bold=args.text_bold,
        text_align=args.text_align,
        text_valign=args.text_valign,
        shape_name=args.name,
        dry_run=args.dry_run,
    )
