#!/usr/bin/env python3
"""
Document Initializer - Creates a formatted HTML document from template

Usage:
    init_doc.py --title <标题> --author <作者> --path <output-dir> [--date <日期>] [--type <report|article|proposal>] [--color <主题色>]

Examples:
    init_doc.py --title "2026年市场分析报告" --author "张三" --path ./output
    init_doc.py --title "项目方案" --author "李四" --path ./output --type proposal --date 2026-03-18 --color "#52c41a"
"""

import sys
import os
import io
import argparse
from pathlib import Path
from datetime import date

# Fix console encoding for CJK characters
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


def _fix_encoding(stream):
    """确保流使用 UTF-8 编码。"""
    if stream is None or (stream.encoding and stream.encoding.lower().replace('-', '') == 'utf8'):
        return stream
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
        return stream
    except (AttributeError, io.UnsupportedOperation):
        pass
    try:
        return io.TextIOWrapper(
            stream.buffer, encoding='utf-8', errors='replace', line_buffering=stream.line_buffering
        )
    except AttributeError:
        return stream


sys.stdout = _fix_encoding(sys.stdout)
sys.stderr = _fix_encoding(sys.stderr)


# --- Document type specific section titles ---

DOC_TYPE_SECTIONS = {
    "report": {
        "section_1": "背景与概述",
        "section_2": "数据分析",
        "section_3": "结论与建议",
        "image_desc": "数据趋势图表，展示关键指标随时间的变化情况",
    },
    "article": {
        "section_1": "引言",
        "section_2": "主体论述",
        "section_3": "总结与展望",
        "image_desc": "主题相关的说明图，展示文章核心观点的可视化表达",
    },
    "proposal": {
        "section_1": "项目背景",
        "section_2": "实施方案",
        "section_3": "预期效果与风险评估",
        "image_desc": "项目实施路线图，展示各阶段时间节点和关键里程碑",
    },
}

# --- Theme color presets ---

THEME_PRESETS = {
    "#1890ff": {"light": "#69c0ff", "abstract_start": "#f0f8ff", "abstract_end": "#e6f4ff"},
    "#ff2442": {"light": "#ff6b81", "abstract_start": "#fff5f5", "abstract_end": "#fff0f0"},
    "#52c41a": {"light": "#95de64", "abstract_start": "#f6ffed", "abstract_end": "#f0ffe6"},
    "#fa8c16": {"light": "#ffc069", "abstract_start": "#fff7e6", "abstract_end": "#fff2e0"},
    "#333333": {"light": "#666666", "abstract_start": "#fafafa", "abstract_end": "#f5f5f5"},
}


def _get_theme_colors(color):
    """根据主题色获取渐变色和背景色。"""
    if color in THEME_PRESETS:
        preset = THEME_PRESETS[color]
        return color, preset["light"], preset["abstract_start"], preset["abstract_end"]
    # Fallback: use the color directly with some opacity variants
    return color, color, "#f8f9fa", "#f0f2f5"


DOC_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        /* ===== 全局样式 ===== */
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}

        body {{
            font-family: "SimSun", "宋体", "Noto Serif SC", serif;
            font-size: 16px;
            line-height: 1.8;
            color: #333;
            background: #f0f2f5;
        }}

        /* ===== 页面容器 ===== */
        .page-wrapper {{
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }}

        .page {{
            background: #fff;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
            border-radius: 8px;
            overflow: hidden;
        }}

        /* ===== 页眉 ===== */
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 40px;
            background: linear-gradient(135deg, {theme_color} 0%, {theme_color_light} 100%);
            color: #fff;
            font-size: 14px;
        }}

        .header .left {{ font-weight: bold; }}
        .header .right {{ opacity: 0.9; }}

        /* ===== 主内容 ===== */
        .content {{ padding: 40px 50px 30px; }}

        /* ===== 标题区 ===== */
        h1 {{
            font-family: "SimHei", "黑体", "Noto Sans SC", sans-serif;
            font-size: 26px;
            font-weight: bold;
            text-align: center;
            color: #1a1a1a;
            margin-bottom: 20px;
            letter-spacing: 1px;
        }}

        .meta {{
            text-align: center;
            color: #666;
            font-size: 15px;
            margin-bottom: 24px;
        }}

        .meta span {{ margin: 0 12px; }}
        .meta strong {{ color: #333; }}

        /* ===== 摘要 ===== */
        .abstract {{
            background: linear-gradient(135deg, {abstract_bg_start} 0%, {abstract_bg_end} 100%);
            border-left: 4px solid {theme_color};
            padding: 16px 20px;
            margin-bottom: 32px;
            border-radius: 0 8px 8px 0;
            font-style: italic;
            color: #555;
            font-size: 15px;
            line-height: 1.9;
        }}

        /* ===== 二级标题 ===== */
        h2 {{
            font-family: "SimHei", "黑体", "Noto Sans SC", sans-serif;
            font-size: 20px;
            font-weight: bold;
            color: #1a1a1a;
            margin: 32px 0 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid {theme_color};
            display: inline-block;
        }}

        h2::before {{
            content: "▎";
            color: {theme_color};
            margin-right: 6px;
        }}

        /* ===== 段落 ===== */
        p {{
            text-indent: 2em;
            margin-bottom: 14px;
            line-height: 1.9;
        }}

        /* ===== 项目符号列表 ===== */
        ul {{ margin: 14px 0 14px 2em; padding-left: 1em; }}

        ul li {{
            margin-bottom: 8px;
            line-height: 1.8;
            position: relative;
            list-style: none;
            padding-left: 18px;
        }}

        ul li::before {{
            content: "";
            position: absolute;
            left: 0;
            top: 10px;
            width: 8px;
            height: 8px;
            background: {theme_color};
            border-radius: 50%;
        }}

        /* ===== 编号列表 ===== */
        ol {{ margin: 14px 0 14px 2em; padding-left: 1.2em; }}

        ol li {{
            margin-bottom: 10px;
            line-height: 1.8;
            padding-left: 6px;
        }}

        ol li strong {{ color: {theme_color}; }}

        /* ===== 表格 ===== */
        .table-wrapper {{
            overflow-x: auto;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
        }}

        table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}

        thead th {{
            background: #4a4a4a;
            color: #fff;
            font-weight: bold;
            padding: 12px 16px;
            text-align: left;
            white-space: nowrap;
        }}

        thead th:first-child {{ border-radius: 8px 0 0 0; }}
        thead th:last-child {{ border-radius: 0 8px 0 0; }}

        tbody td {{ padding: 10px 16px; border-bottom: 1px solid #eee; }}
        tbody tr:nth-child(even) {{ background: #fafafa; }}
        tbody tr:hover {{ background: #f5f5f5; transition: background 0.2s; }}

        /* ===== 图表占位符 ===== */
        .chart-placeholder {{
            margin: 24px 0;
            padding: 40px 20px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border: 2px dashed #ccc;
            border-radius: 12px;
            text-align: center;
            color: #888;
        }}

        .chart-placeholder .icon {{ font-size: 48px; margin-bottom: 12px; }}
        .chart-placeholder .label {{ font-size: 14px; font-style: italic; }}

        /* ===== 分隔线 ===== */
        hr {{
            border: none;
            height: 1px;
            background: linear-gradient(90deg, transparent, #ddd, transparent);
            margin: 32px 0;
        }}

        /* ===== 附录 ===== */
        .appendix {{
            background: #f8f9fa;
            border-radius: 8px;
            padding: 24px 28px;
            margin-top: 30px;
        }}

        .appendix h2 {{ border-bottom-color: #999; }}
        .appendix h2::before {{ color: #999; }}

        .tip {{
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px 16px;
            border-radius: 0 8px 8px 0;
            margin-top: 16px;
            font-size: 14px;
            color: #664d03;
        }}

        .tip::before {{ content: "💡 "; }}

        /* ===== 页脚 ===== */
        .footer {{
            text-align: center;
            padding: 14px 40px;
            background: #f8f9fa;
            color: #999;
            font-size: 13px;
            border-top: 1px solid #eee;
        }}

        /* ===== 响应式 ===== */
        @media (max-width: 768px) {{
            .content {{ padding: 24px 20px 20px; }}
            h1 {{ font-size: 22px; }}
            .header {{ padding: 10px 20px; font-size: 12px; }}
        }}

        /* ===== 打印样式 ===== */
        @media print {{
            body {{ background: #fff; }}
            .page-wrapper {{ padding: 0; }}
            .page {{ box-shadow: none; border-radius: 0; }}
            .header {{
                background: #333 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
            thead th {{
                background: #4a4a4a !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
        }}
    </style>
</head>
<body>

<div class="page-wrapper">
    <div class="page">

        <!-- 页眉 -->
        <div class="header">
            <span class="left">{title}</span>
            <span class="right">{author}</span>
        </div>

        <!-- 主内容 -->
        <div class="content">

            <!-- 标题区 -->
            <h1>{title}</h1>

            <div class="meta">
                <span><strong>作者</strong>：{author}</span>
                <span><strong>日期</strong>：{date_display}</span>
            </div>

            <!-- 摘要 -->
            <div class="abstract">
                摘要：[TODO: 用50-150字概括文档核心内容]
            </div>

            <!-- 第一章 -->
            <h2>{section_1}</h2>

            <p>[TODO: 第一章节第一段落内容]</p>

            <p>[TODO: 第一章节第二段落内容]</p>

            <ul>
                <li>[TODO: 要点一]</li>
                <li>[TODO: 要点二]</li>
                <li>[TODO: 要点三]</li>
            </ul>

            <!-- 第二章 -->
            <h2>{section_2}</h2>

            <p>[TODO: 第二章节第一段落内容]</p>

            <ol>
                <li>[TODO: 第一步/第一点]</li>
                <li>[TODO: 第二步/第二点]</li>
                <li>[TODO: 第三步/第三点]</li>
            </ol>

            <p>[TODO: 第二章节第二段落内容]</p>

            <!-- 表格 -->
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>[TODO: 列标题1]</th>
                            <th>[TODO: 列标题2]</th>
                            <th>[TODO: 列标题3]</th>
                            <th>[TODO: 列标题4]</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>[TODO]</td><td>[TODO]</td><td>[TODO]</td><td>[TODO]</td></tr>
                        <tr><td>[TODO]</td><td>[TODO]</td><td>[TODO]</td><td>[TODO]</td></tr>
                        <tr><td>[TODO]</td><td>[TODO]</td><td>[TODO]</td><td>[TODO]</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- 图表占位符 -->
            <div class="chart-placeholder">
                <div class="icon">📊</div>
                <div class="label">[此处插入：{image_desc}]</div>
            </div>

            <!-- 第三章 -->
            <h2>{section_3}</h2>

            <p>[TODO: 第三章节第一段落内容]</p>

            <p>[TODO: 第三章节第二段落内容]</p>

            <hr>

            <!-- 附录 -->
            <div class="appendix">
                <h2>附录</h2>
                <p>[TODO: 附录内容，如数据来源说明、参考文献等]</p>
                <div class="tip">
                    提示：本文档为自包含 HTML 文件，浏览器打开即可查看完整排版效果，也可直接打印。
                </div>
            </div>

        </div>

        <!-- 页脚 -->
        <div class="footer">
            第1页，共1页
        </div>

    </div>
</div>

</body>
</html>'''


def init_doc(title, author, path, doc_date=None, doc_type="report", theme_color="#1890ff"):
    """
    Initialize a new formatted HTML document from template.

    Args:
        title: Document title
        author: Author name
        path: Output directory
        doc_date: Date string (optional, defaults to today)
        doc_type: Document type: report / article / proposal
        theme_color: Theme color hex code (e.g. #1890ff)

    Returns:
        Path to created file, or None if error
    """
    # Resolve date
    if doc_date:
        date_iso = doc_date
        try:
            parts = doc_date.split("-")
            date_display = f"{parts[0]}年{int(parts[1])}月{int(parts[2])}日"
        except (IndexError, ValueError):
            date_display = doc_date
    else:
        today = date.today()
        date_iso = today.isoformat()
        date_display = f"{today.year}年{today.month}月{today.day}日"

    # Get section titles based on doc type
    sections = DOC_TYPE_SECTIONS.get(doc_type, DOC_TYPE_SECTIONS["report"])

    # Get theme colors
    tc, tc_light, abs_start, abs_end = _get_theme_colors(theme_color)

    # Resolve output path
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    path_obj = Path(path)
    if not path_obj.is_absolute():
        path_obj = project_root / path_obj

    path_obj = path_obj.resolve()

    # Create output directory
    try:
        path_obj.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"[ERROR] 无法创建输出目录: {e}")
        return None

    # Generate filename from title
    safe_title = title.replace(" ", "_").replace("/", "_").replace("\\", "_")
    filename = f"{safe_title}.html"
    output_file = path_obj / filename

    if output_file.exists():
        print(f"[WARN] 文件已存在，将跳过创建: {output_file}")
        print("[INFO] 请直接编辑已有文件或删除后重新运行")
        return output_file

    # Generate content
    content = DOC_TEMPLATE.format(
        title=title,
        author=author,
        date_iso=date_iso,
        date_display=date_display,
        section_1=sections["section_1"],
        section_2=sections["section_2"],
        section_3=sections["section_3"],
        image_desc=sections["image_desc"],
        theme_color=tc,
        theme_color_light=tc_light,
        abstract_bg_start=abs_start,
        abstract_bg_end=abs_end,
    )

    # Write file
    try:
        output_file.write_text(content, encoding="utf-8")
        print(f"[OK] 文档已创建: {output_file}")
    except Exception as e:
        print(f"[ERROR] 写入文件失败: {e}")
        return None

    print(f"\n[OK] HTML 文档 '{title}' 已初始化")
    print(f"   文件位置: {output_file}")
    print(f"   文档类型: {doc_type}")
    print(f"   主题色: {theme_color}")
    print("\nNext steps:")
    print("1. 填写所有 [TODO] 占位符")
    print("2. 运行 validate_doc.py 检查格式完整性")
    print("3. 在浏览器中打开 .html 文件预览效果")
    return output_file


def main():
    parser = argparse.ArgumentParser(description="初始化一份标准格式的 HTML 文档")
    parser.add_argument("--title", required=True, help="文档标题")
    parser.add_argument("--author", required=True, help="作者姓名")
    parser.add_argument("--path", required=True, help="输出目录")
    parser.add_argument("--date", dest="doc_date", help="日期（YYYY-MM-DD），默认为当天")
    parser.add_argument("--type", dest="doc_type", choices=["report", "article", "proposal"],
                        default="report", help="文档类型: report(报告) / article(文章) / proposal(方案)")
    parser.add_argument("--color", dest="theme_color", default="#1890ff",
                        help="主题色（十六进制），默认 #1890ff（商务蓝）")
    args = parser.parse_args()

    print(f"[INFO] 初始化 HTML 文档: {args.title}")
    print(f"   作者: {args.author}")
    print(f"   输出目录: {args.path}")
    print(f"   类型: {args.doc_type}")
    print(f"   主题色: {args.theme_color}")
    print()

    result = init_doc(args.title, args.author, args.path, args.doc_date, args.doc_type, args.theme_color)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
