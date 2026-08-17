#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown 转 HTML 文档工具，基于 pandoc 实现，支持 ECharts 动态图表渲染。

用法：
    # 基本转换
    python scripts/md_to_html.py input.md output.html

    # 指定图表数据 JSON 文件
    python scripts/md_to_html.py input.md output.html --chart-data charts.json

依赖：
    pandoc（命令行工具）
"""

import argparse
import base64
import json
import mimetypes
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# pandoc 查找
# ---------------------------------------------------------------------------

def _refresh_windows_path():
    """在 Windows 上刷新当前进程的 PATH 环境变量，以便找到刚安装的程序。"""
    if platform.system() != "Windows":
        return
    try:
        import winreg
        # 获取系统 PATH
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment') as key:
            sys_path = winreg.QueryValueEx(key, 'Path')[0]
        # 获取用户 PATH
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment') as key:
                user_path = winreg.QueryValueEx(key, 'Path')[0]
        except FileNotFoundError:
            user_path = ""

        new_path = f"{sys_path};{user_path}"
        if new_path:
            current_path = os.environ.get("PATH", "")
            os.environ["PATH"] = f"{current_path};{new_path}"
    except Exception:
        pass

def find_pandoc() -> str:
    """查找 pandoc 可执行文件路径。

    :return: pandoc 可执行文件路径
    :raises FileNotFoundError: 找不到 pandoc 时抛出
    """
    pandoc_path = shutil.which("pandoc")

    # 如果找不到，尝试刷新环境变量后再次查找（针对刚安装的情况）
    if pandoc_path is None and platform.system() == "Windows":
        _refresh_windows_path()
        pandoc_path = shutil.which("pandoc")

    if pandoc_path is None:
        raise FileNotFoundError(
            "找不到 pandoc，请先安装：\n"
            "  Windows: winget install --id JohnMacFarlane.Pandoc -e\n"
            "  macOS:   brew install pandoc\n"
            "  Linux:   sudo apt install pandoc"
        )
    return pandoc_path


# ---------------------------------------------------------------------------
# CSS 样式常量（报告专用，自包含，不依赖外部技能）
# ---------------------------------------------------------------------------

REPORT_CSS = """
/* ===== 基础重置 ===== */
*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

/* ===== 页面整体 ===== */
html {
    font-size: 14px;
    line-height: 1.8;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue",
                 Helvetica, Arial, sans-serif;
    color: #333;
    background: #f5f5f5;
    padding: 0;
    margin: 0;
}

/* ===== 页面容器 ===== */
.page-wrapper {
    max-width: 1000px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    min-height: 100vh;
}

/* ===== 页眉 ===== */
.header {
    background: {{THEME_COLOR}};
    color: #fff;
    padding: 28px 48px;
    border-bottom: 3px solid {{THEME_COLOR_DARK}};
}

.header h1 {
    font-size: 1.75rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.5px;
}

.header .report-meta {
    font-size: 0.85rem;
    opacity: 0.85;
    margin-top: 6px;
}

/* ===== 内容区 ===== */
.content {
    padding: 36px 48px 48px;
}

/* ===== 标题 ===== */
.content h1 {
    font-size: 1.6rem;
    color: {{THEME_COLOR}};
    border-bottom: 2px solid {{THEME_COLOR}};
    padding-bottom: 8px;
    margin: 32px 0 16px;
}

.content h2 {
    font-size: 1.35rem;
    color: #333;
    border-left: 4px solid {{THEME_COLOR}};
    padding-left: 12px;
    margin: 28px 0 14px;
}

.content h3 {
    font-size: 1.15rem;
    color: #444;
    margin: 22px 0 10px;
}

.content h4 {
    font-size: 1.05rem;
    color: #555;
    margin: 18px 0 8px;
}

/* ===== 段落与文本 ===== */
.content p {
    margin: 10px 0;
    text-align: justify;
}

.content strong {
    color: {{THEME_COLOR}};
}

.content em {
    font-style: italic;
    color: #666;
}

/* ===== 引用块 ===== */
.content blockquote {
    border-left: 4px solid {{THEME_COLOR}};
    background: {{THEME_COLOR_LIGHT}};
    padding: 12px 20px;
    margin: 16px 0;
    border-radius: 0 6px 6px 0;
    color: #555;
}

.content blockquote p {
    margin: 4px 0;
}

/* ===== 列表 ===== */
.content ul, .content ol {
    padding-left: 24px;
    margin: 10px 0;
}

.content li {
    margin: 4px 0;
}

.content li::marker {
    color: {{THEME_COLOR}};
}

/* ===== 表格 ===== */
.table-wrapper {
    overflow-x: auto;
    margin: 16px 0;
    border-radius: 6px;
    border: 1px solid #e8e8e8;
}

.content table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
}

.content thead {
    background: {{THEME_COLOR}};
    color: #fff;
}

.content thead th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
    white-space: nowrap;
}

.content tbody tr:nth-child(even) {
    background: #fafafa;
}

.content tbody tr:hover {
    background: {{THEME_COLOR_LIGHT}};
}

.content tbody td {
    padding: 9px 14px;
    border-top: 1px solid #e8e8e8;
}

/* ===== 代码 ===== */
.content code {
    background: #f6f6f6;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.content pre {
    background: #f6f6f6;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 14px 0;
    border: 1px solid #e8e8e8;
}

.content pre code {
    background: none;
    padding: 0;
}

/* ===== 图片 ===== */
.content img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin: 12px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* ===== 水平线 ===== */
.content hr {
    border: none;
    border-top: 1px solid #e8e8e8;
    margin: 24px 0;
}

/* ===== ECharts 图表容器 ===== */
.echarts-container {
    width: 100%;
    height: 400px;
    margin: 20px 0;
    border-radius: 6px;
    border: 1px solid #e8e8e8;
    background: #fff;
}

.echarts-title {
    text-align: center;
    font-size: 0.9rem;
    color: #888;
    margin-top: 4px;
    margin-bottom: 16px;
}

/* ===== 图表占位/降级提示 ===== */
.chart-placeholder {
    width: 100%;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
    border: 1px dashed #d9d9d9;
    border-radius: 6px;
    color: #999;
    font-size: 0.95rem;
    margin: 20px 0;
    padding: 20px;
}

/* ===== 页脚 ===== */
.footer {
    background: #fafafa;
    border-top: 1px solid #e8e8e8;
    padding: 16px 48px;
    text-align: center;
    font-size: 0.8rem;
    color: #999;
}

/* ===== 响应式布局 ===== */
@media (max-width: 768px) {
    .page-wrapper {
        margin: 0;
        box-shadow: none;
    }

    .header {
        padding: 20px 20px;
    }

    .header h1 {
        font-size: 1.35rem;
    }

    .content {
        padding: 20px 20px 28px;
    }

    .footer {
        padding: 12px 20px;
    }

    .content h1 { font-size: 1.35rem; }
    .content h2 { font-size: 1.15rem; }
    .content h3 { font-size: 1.05rem; }

    .echarts-container {
        height: 300px;
    }
}

/* ===== 打印适配 ===== */
@media print {
    body {
        background: #fff;
    }

    .page-wrapper {
        box-shadow: none;
        max-width: 100%;
    }

    .header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    .content table thead {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    .echarts-container {
        break-inside: avoid;
    }

    .footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
    }
}
"""


# ---------------------------------------------------------------------------
# HTML 模板
# ---------------------------------------------------------------------------

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <style>
{{CSS}}
    </style>
{{ECHARTS_CDN}}
</head>
<body>
    <div class="page-wrapper">
        <header class="header">
            <h1>{{TITLE}}</h1>
        </header>
        <main class="content">
{{BODY}}
        </main>
        <footer class="footer">
            <p>本报告由 AI 自动生成</p>
        </footer>
    </div>
{{ECHARTS_SCRIPTS}}
{{ECHARTS_FALLBACK}}
</body>
</html>
"""

ECHARTS_CDN_TAG = (
    '    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>'
)

ECHARTS_FALLBACK_SCRIPT = """
    <script>
    (function() {
        if (typeof echarts === 'undefined') {
            var containers = document.querySelectorAll('.echarts-container');
            for (var i = 0; i < containers.length; i++) {
                containers[i].style.display = 'flex';
                containers[i].style.alignItems = 'center';
                containers[i].style.justifyContent = 'center';
                containers[i].style.color = '#999';
                containers[i].style.fontSize = '0.95rem';
                containers[i].innerHTML = '图表需要网络连接加载 ECharts 库';
            }
        }
    })();
    </script>
"""


# ---------------------------------------------------------------------------
# 主题色工具
# ---------------------------------------------------------------------------

def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """将十六进制颜色转换为 RGB 元组。"""
    hex_color = hex_color.lstrip("#")
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
    )


def _darken_color(hex_color: str, factor: float = 0.15) -> str:
    """将颜色加深。"""
    r, g, b = _hex_to_rgb(hex_color)
    r = max(0, int(r * (1 - factor)))
    g = max(0, int(g * (1 - factor)))
    b = max(0, int(b * (1 - factor)))
    return f"#{r:02x}{g:02x}{b:02x}"


def _lighten_color(hex_color: str, factor: float = 0.92) -> str:
    """将颜色变浅，生成淡色背景。"""
    r, g, b = _hex_to_rgb(hex_color)
    r = int(r + (255 - r) * factor)
    g = int(g + (255 - g) * factor)
    b = int(b + (255 - b) * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def _apply_theme_color(css: str, theme_color: str) -> str:
    """将 CSS 中的主题色占位符替换为实际颜色值。"""
    css = css.replace("{{THEME_COLOR_DARK}}", _darken_color(theme_color))
    css = css.replace("{{THEME_COLOR_LIGHT}}", _lighten_color(theme_color))
    css = css.replace("{{THEME_COLOR}}", theme_color)
    return css


# ---------------------------------------------------------------------------
# Markdown 标题提取
# ---------------------------------------------------------------------------

def _extract_title(md_content: str) -> str:
    """从 Markdown 内容中提取一级标题作为报告标题。

    :param md_content: Markdown 文本内容
    :return: 一级标题文本，找不到时返回 "报告"
    """
    match = re.search(r"^#\s+(.+)$", md_content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return "报告"


# ---------------------------------------------------------------------------
# ECharts 图表占位标记解析与渲染
# ---------------------------------------------------------------------------

# 匹配 <!-- ECHARTS: {JSON} --> 格式的占位标记
_ECHARTS_PATTERN = re.compile(
    r"<!--\s*ECHARTS:\s*(\{.*?\})\s*-->",
    re.DOTALL,
)


def _parse_echarts_placeholders(html_content: str) -> list[tuple[str, dict]]:
    """解析 HTML 中的 ECharts 图表占位标记。

    :param html_content: HTML 文本内容
    :return: 列表，每项为 (原始匹配文本, 解析后的 JSON 字典)
    """
    results = []
    for match in _ECHARTS_PATTERN.finditer(html_content):
        raw = match.group(0)
        json_str = match.group(1)
        try:
            data = json.loads(json_str)
            results.append((raw, data))
        except (json.JSONDecodeError, ValueError):
            # JSON 解析失败，保留原始文本，后续做降级处理
            results.append((raw, None))
    return results


def _generate_echarts_option(chart_data: dict) -> str:
    """根据图表数据生成 ECharts option 配置的 JSON 字符串。

    支持的图表类型：bar、line、pie、radar、scatter。

    :param chart_data: 图表数据字典，包含 chart_type、title、data、options 等
    :return: ECharts option 的 JSON 字符串
    """
    chart_type = chart_data.get("chart_type", "bar")
    title = chart_data.get("title", "")
    data = chart_data.get("data", {})
    custom_options = chart_data.get("options", {})

    labels = data.get("labels", [])
    values = data.get("values", [])
    series_list = data.get("series", [])

    # 基础 option
    option = {
        "title": {
            "text": title,
            "left": "center",
            "textStyle": {"fontSize": 16, "fontWeight": "bold"},
        },
        "tooltip": {"trigger": "axis" if chart_type != "pie" else "item"},
        "grid": {
            "left": "3%",
            "right": "4%",
            "bottom": "3%",
            "containLabel": True,
        },
    }

    if chart_type in ("bar", "line"):
        option["xAxis"] = {"type": "category", "data": labels}
        option["yAxis"] = {"type": "value"}

        if series_list:
            # 多系列
            option["legend"] = {
                "top": "bottom",
                "data": [s.get("name", "") for s in series_list],
            }
            option["series"] = [
                {
                    "name": s.get("name", ""),
                    "type": chart_type,
                    "data": s.get("values", []),
                    "smooth": True if chart_type == "line" else False,
                }
                for s in series_list
            ]
        else:
            # 单系列
            option["series"] = [
                {
                    "type": chart_type,
                    "data": values,
                    "smooth": True if chart_type == "line" else False,
                }
            ]

        if chart_type == "bar" and not series_list:
            option["series"][0]["itemStyle"] = {
                "borderRadius": [4, 4, 0, 0],
            }

    elif chart_type == "pie":
        pie_data = []
        for i, label in enumerate(labels):
            val = values[i] if i < len(values) else 0
            pie_data.append({"name": label, "value": val})

        option["tooltip"] = {"trigger": "item", "formatter": "{b}: {c} ({d}%)"}
        option["legend"] = {"top": "bottom", "data": labels}
        option["series"] = [
            {
                "type": "pie",
                "radius": ["40%", "70%"],
                "avoidLabelOverlap": True,
                "itemStyle": {"borderRadius": 6, "borderColor": "#fff", "borderWidth": 2},
                "label": {"show": True, "formatter": "{b}: {d}%"},
                "data": pie_data,
            }
        ]
        # 饼图不需要 grid/xAxis/yAxis
        option.pop("grid", None)

    elif chart_type == "radar":
        max_val = max(values, default=100) if values else 100
        indicator = [{"name": label, "max": max_val * 1.2} for label in labels]
        option["radar"] = {"indicator": indicator}
        option["series"] = [
            {
                "type": "radar",
                "data": [{"value": values, "name": title}],
                "areaStyle": {"opacity": 0.2},
            }
        ]
        option.pop("grid", None)

    elif chart_type == "scatter":
        scatter_data = []
        if series_list:
            for s in series_list:
                scatter_data.extend(s.get("values", []))
        else:
            scatter_data = values

        option["xAxis"] = {"type": "value"}
        option["yAxis"] = {"type": "value"}
        option["series"] = [
            {
                "type": "scatter",
                "data": scatter_data,
                "symbolSize": 8,
            }
        ]

    else:
        # 未知图表类型，尝试作为 bar 处理
        option["xAxis"] = {"type": "category", "data": labels}
        option["yAxis"] = {"type": "value"}
        option["series"] = [{"type": "bar", "data": values}]

    # 合并用户自定义 options（深度覆盖）
    if custom_options:
        _deep_merge(option, custom_options)

    return json.dumps(option, ensure_ascii=False, indent=2)


def _deep_merge(base: dict, override: dict) -> dict:
    """深度合并两个字典，override 中的值覆盖 base 中的值。"""
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def _generate_echarts_code(chart_data: dict, chart_id: str) -> str:
    """根据图表数据生成 ECharts 的 HTML 容器和初始化脚本。

    :param chart_data: 图表数据字典
    :param chart_id: 图表容器的唯一 ID
    :return: 包含 <div> 容器的 HTML 片段（脚本部分单独收集）
    """
    title = chart_data.get("title", "图表")
    html = (
        f'<div id="{chart_id}" class="echarts-container"></div>\n'
        f'<p class="echarts-title">{title}</p>'
    )
    return html


def _generate_echarts_init_script(chart_data: dict, chart_id: str) -> str:
    """生成单个图表的 ECharts 初始化脚本。

    :param chart_data: 图表数据字典
    :param chart_id: 图表容器的唯一 ID
    :return: <script> 标签内容
    """
    option_json = _generate_echarts_option(chart_data)
    script = (
        f'    <script>\n'
        f'    (function() {{\n'
        f'        var chartDom = document.getElementById("{chart_id}");\n'
        f'        if (typeof echarts !== "undefined" && chartDom) {{\n'
        f'            var myChart = echarts.init(chartDom);\n'
        f'            var option = {option_json};\n'
        f'            myChart.setOption(option);\n'
        f'            window.addEventListener("resize", function() {{ myChart.resize(); }});\n'
        f'        }}\n'
        f'    }})();\n'
        f'    </script>'
    )
    return script


def _replace_echarts_placeholders(html_content: str) -> tuple[str, list[str], bool]:
    """替换 HTML 中的 ECharts 占位标记为图表容器，并收集初始化脚本。

    :param html_content: HTML 正文内容
    :return: (替换后的 HTML, 初始化脚本列表, 是否包含图表)
    """
    placeholders = _parse_echarts_placeholders(html_content)
    if not placeholders:
        return html_content, [], False

    scripts = []
    has_charts = False

    for idx, (raw_text, chart_data) in enumerate(placeholders):
        chart_id = f"chart-{idx}"

        if chart_data is None:
            # JSON 解析失败，降级为占位提示
            replacement = (
                '<div class="chart-placeholder">'
                '[图表渲染失败：数据格式错误]'
                '</div>'
            )
        elif not chart_data.get("data"):
            # 数据不完整，降级为占位提示
            title = chart_data.get("title", "未知图表")
            replacement = (
                f'<div class="chart-placeholder">'
                f'[图表渲染失败：{title}]'
                f'</div>'
            )
        else:
            has_charts = True
            replacement = _generate_echarts_code(chart_data, chart_id)
            scripts.append(_generate_echarts_init_script(chart_data, chart_id))

        html_content = html_content.replace(raw_text, replacement, 1)

    return html_content, scripts, has_charts


# ---------------------------------------------------------------------------
# 图片 base64 内嵌
# ---------------------------------------------------------------------------

def _embed_images_as_base64(html_content: str, base_dir: Path) -> str:
    """将 HTML 中引用的本地图片转换为 base64 Data URI 内嵌。

    :param html_content: HTML 文本内容
    :param base_dir: 图片相对路径的基准目录
    :return: 替换后的 HTML 内容
    """
    img_pattern = re.compile(
        r'<img\s+([^>]*?)src=["\']([^"\']+?)["\']([^>]*?)(/?)>',
        re.IGNORECASE,
    )

    def _replace_img(match: re.Match) -> str:
        prefix_attrs = match.group(1)
        src = match.group(2)
        suffix_attrs = match.group(3)
        self_close = match.group(4)

        # 跳过已经是 data URI 或远程 URL 的图片
        if src.startswith("data:") or src.startswith("http://") or src.startswith("https://"):
            return match.group(0)

        # 解析本地图片路径
        img_path = (base_dir / src).resolve()
        if not img_path.exists():
            # 图片文件不存在，替换为文字占位提示
            alt_match = re.search(r'alt=["\']([^"\']*)["\']', prefix_attrs + suffix_attrs)
            alt_text = alt_match.group(1) if alt_match else src
            return (
                f'<div class="chart-placeholder">'
                f'[图片加载失败：{alt_text}]'
                f'</div>'
            )

        # 读取图片并转换为 base64
        mime_type = mimetypes.guess_type(str(img_path))[0] or "image/png"
        try:
            img_data = img_path.read_bytes()
            b64_data = base64.b64encode(img_data).decode("ascii")
            data_uri = f"data:{mime_type};base64,{b64_data}"
            return f'<img {prefix_attrs}src="{data_uri}"{suffix_attrs}{self_close}>'
        except (OSError, IOError):
            alt_match = re.search(r'alt=["\']([^"\']*)["\']', prefix_attrs + suffix_attrs)
            alt_text = alt_match.group(1) if alt_match else src
            return (
                f'<div class="chart-placeholder">'
                f'[图片加载失败：{alt_text}]'
                f'</div>'
            )

    return img_pattern.sub(_replace_img, html_content)


# ---------------------------------------------------------------------------
# 表格后处理：包裹 table-wrapper 并确保 thead/tbody 存在
# ---------------------------------------------------------------------------

def _post_process_tables(html_content: str) -> str:
    """对 HTML 中的表格进行后处理。

    1. 为 <table> 包裹 .table-wrapper 容器
    2. 确保表格包含 <thead> 和 <tbody>

    :param html_content: HTML 文本内容
    :return: 处理后的 HTML 内容
    """
    # 包裹 table-wrapper
    html_content = re.sub(
        r"(<table\b[^>]*>)",
        r'<div class="table-wrapper">\1',
        html_content,
    )
    html_content = re.sub(
        r"(</table>)",
        r"\1</div>",
        html_content,
    )

    # 如果表格没有 thead，将第一行 tr 包裹为 thead
    def _ensure_thead(match: re.Match) -> str:
        table_html = match.group(0)
        if "<thead" in table_html:
            return table_html
        # 将第一个 <tr>...</tr> 包裹为 <thead>
        table_html = re.sub(
            r"(<table\b[^>]*>)\s*(<tr\b[^>]*>.*?</tr>)",
            r"\1<thead>\2</thead><tbody>",
            table_html,
            count=1,
            flags=re.DOTALL,
        )
        # 在 </table> 前关闭 tbody
        if "<tbody>" in table_html and "</tbody>" not in table_html:
            table_html = table_html.replace("</table>", "</tbody></table>")
        # 将 thead 中的 td 替换为 th
        thead_match = re.search(r"<thead>(.*?)</thead>", table_html, re.DOTALL)
        if thead_match:
            thead_content = thead_match.group(1)
            new_thead = thead_content.replace("<td", "<th").replace("</td>", "</th>")
            table_html = table_html.replace(thead_content, new_thead)
        return table_html

    html_content = re.sub(
        r"<table\b[^>]*>.*?</table>",
        _ensure_thead,
        html_content,
        flags=re.DOTALL,
    )

    return html_content


# ---------------------------------------------------------------------------
# HTML 结构校验
# ---------------------------------------------------------------------------

def _validate_html_structure(html_content: str) -> str:
    """校验并修复 HTML 基本结构完整性。

    检查 DOCTYPE、html/head/body 标签、UTF-8 声明等。
    如果发现缺失，尝试自动修复。

    :param html_content: HTML 文本内容
    :return: 修复后的 HTML 内容
    """
    # 检查 DOCTYPE
    if "<!DOCTYPE" not in html_content.upper():
        html_content = "<!DOCTYPE html>\n" + html_content

    # 检查基本标签
    if "<html" not in html_content.lower():
        html_content = html_content.replace(
            "<!DOCTYPE html>",
            '<!DOCTYPE html>\n<html lang="zh-CN">',
        )
        html_content += "\n</html>"

    if "<head" not in html_content.lower():
        html_content = html_content.replace(
            "<html",
            "<html",
        ).replace(
            ">",
            ">\n<head><meta charset=\"UTF-8\"><title>报告</title></head>",
            1,
        )

    if "<body" not in html_content.lower():
        head_end = html_content.lower().find("</head>")
        if head_end != -1:
            insert_pos = head_end + len("</head>")
            html_content = (
                html_content[:insert_pos]
                + "\n<body>"
                + html_content[insert_pos:]
                + "\n</body>"
            )

    return html_content


# ---------------------------------------------------------------------------
# 核心转换函数
# ---------------------------------------------------------------------------

# 固定主题色和代码高亮主题，不支持外部设置
_THEME_COLOR = "#2E86AB"
_HIGHLIGHT_STYLE = "tango"


def md_to_html(
    input_file: str,
    output_file: str,
    chart_data_file: str | None = None,
    extra_args: list[str] | None = None,
) -> Path:
    """将 Markdown 文件转换为 HTML 文档。

    :param input_file: 输入 Markdown 文件路径
    :param output_file: 输出 .html 文件路径
    :param chart_data_file: 图表数据 JSON 文件路径（可选）
    :param extra_args: 传递给 pandoc 的额外参数
    :return: 输出文件路径
    :raises FileNotFoundError: 输入文件不存在或找不到 pandoc
    :raises RuntimeError: 转换失败时抛出
    """
    input_path = Path(input_file).resolve()
    output_path = Path(output_file).resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"输入文件不存在: {input_path}")

    # 确保输出目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 读取 Markdown 内容
    md_content = input_path.read_text(encoding="utf-8")

    # 提取标题
    title = _extract_title(md_content)

    # 如果提供了外部图表数据 JSON 文件，将其中的图表数据注入到 Markdown 中
    if chart_data_file is not None:
        md_content = _inject_chart_data_from_file(md_content, chart_data_file)

    # 调用 pandoc 将 Markdown 转换为 HTML 片段
    pandoc_path = find_pandoc()
    input_dir = str(input_path.parent)

    cmd = [
        pandoc_path,
        "--from", "markdown",
        "--to", "html",
        f"--highlight-style={_HIGHLIGHT_STYLE}",
    ]

    if extra_args:
        cmd.extend(extra_args)

    # 通过 stdin 传入 Markdown 内容，从 stdout 获取 HTML 片段
    result = subprocess.run(
        cmd,
        input=md_content,
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=input_dir,
    )

    if result.returncode != 0:
        error_msg = result.stderr.strip() if result.stderr else "未知错误"
        raise RuntimeError(f"pandoc 转换失败: {error_msg}")

    body_html = result.stdout

    # 后处理：表格优化
    body_html = _post_process_tables(body_html)

    # 后处理：替换 ECharts 占位标记
    body_html, echarts_scripts, has_echarts = _replace_echarts_placeholders(body_html)

    # 后处理：图片 base64 内嵌
    body_html = _embed_images_as_base64(body_html, input_path.parent)

    # 移除 body 中的一级标题（已在页眉中展示）
    body_html = re.sub(r"<h1\b[^>]*>.*?</h1>", "", body_html, count=1, flags=re.DOTALL)

    # 组装完整 HTML
    css = _apply_theme_color(REPORT_CSS, _THEME_COLOR)

    echarts_cdn = ECHARTS_CDN_TAG if has_echarts else ""
    echarts_scripts_html = "\n".join(echarts_scripts) if echarts_scripts else ""
    echarts_fallback = ECHARTS_FALLBACK_SCRIPT if has_echarts else ""

    full_html = HTML_TEMPLATE
    full_html = full_html.replace("{{TITLE}}", title)
    full_html = full_html.replace("{{CSS}}", css)
    full_html = full_html.replace("{{BODY}}", body_html)
    full_html = full_html.replace("{{ECHARTS_CDN}}", echarts_cdn)
    full_html = full_html.replace("{{ECHARTS_SCRIPTS}}", echarts_scripts_html)
    full_html = full_html.replace("{{ECHARTS_FALLBACK}}", echarts_fallback)

    # 校验 HTML 结构完整性
    full_html = _validate_html_structure(full_html)

    # 写入输出文件
    output_path.write_text(full_html, encoding="utf-8")

    if not output_path.exists():
        raise RuntimeError(f"转换失败：未生成输出文件 {output_path}")

    return output_path


# ---------------------------------------------------------------------------
# 外部图表数据注入
# ---------------------------------------------------------------------------

def _inject_chart_data_from_file(md_content: str, chart_data_file: str) -> str:
    """从外部 JSON 文件读取图表数据，注入到 Markdown 内容中。

    JSON 文件格式：
    {
        "charts": [
            {"chart_type": "bar", "title": "xxx", "data": {...}},
            ...
        ]
    }

    图表数据将以 <!-- ECHARTS: {JSON} --> 格式追加到 Markdown 末尾。

    :param md_content: 原始 Markdown 内容
    :param chart_data_file: 图表数据 JSON 文件路径
    :return: 注入图表数据后的 Markdown 内容
    """
    chart_path = Path(chart_data_file).resolve()
    if not chart_path.exists():
        print(f"警告：图表数据文件不存在: {chart_path}，跳过图表注入", file=sys.stderr)
        return md_content

    try:
        chart_json = json.loads(chart_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ValueError) as e:
        print(f"警告：图表数据文件格式错误: {e}，跳过图表注入", file=sys.stderr)
        return md_content

    charts = chart_json.get("charts", [])
    if not charts:
        return md_content

    # 将图表数据以占位标记格式追加到 Markdown 末尾
    lines = [md_content]
    for chart in charts:
        chart_str = json.dumps(chart, ensure_ascii=False)
        lines.append(f"\n<!-- ECHARTS: {chart_str} -->")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 命令行入口
# ---------------------------------------------------------------------------

def _parse_args(argv: list[str]) -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="将 Markdown 文件转换为 HTML 文档（基于 pandoc），支持 ECharts 动态图表",
    )
    parser.add_argument(
        "input_file",
        help="输入 Markdown 文件路径",
    )
    parser.add_argument(
        "output_file",
        help="输出 .html 文件路径",
    )
    parser.add_argument(
        "--chart-data",
        help="图表数据 JSON 文件路径（可选）",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args(sys.argv[1:])
    try:
        output = md_to_html(
            input_file=args.input_file,
            output_file=args.output_file,
            chart_data_file=args.chart_data,
        )
        print(f"转换成功: {output}")
    except Exception as e:
        print(f"转换失败: {e}", file=sys.stderr)
        sys.exit(1)
