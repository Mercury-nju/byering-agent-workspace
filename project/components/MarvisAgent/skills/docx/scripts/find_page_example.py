#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""页面查找脚本使用示例。

展示如何使用 find_page.py 脚本来查找 Word 文档中的页面位置。

Usage:
    python find_page_example.py

该示例不直接执行，仅用于展示用法。
"""

import os
import sys
from pathlib import Path


def example_usage():
    """展示 find_page.py 脚本的使用方法。"""

    print("=== find_page.py 脚本使用示例 ===\n")

    print("1. 基本用法：查找指定页面的位置")
    print("   python find_page.py unpacked/ 2")
    print("   # 查找第 2 页的起始位置\n")

    print("2. 查看所有页面信息")
    print("   python find_page.py unpacked/ all")
    print("   # 显示所有页面的位置和分页标记统计\n")

    print("3. 查找第一页位置")
    print("   python find_page.py unpacked/ 1")
    print("   # 查找第 1 页的起始位置\n")

    print("4. 在 Python 代码中使用")
    print("   from find_page import find_page")
    print("   result = find_page('unpacked/', 2)")
    print("   if 'error' not in result:")
    print("       print(f'Page 2 starts at position: {result[\"position\"]}')")
    print("   else:")
    print("       print(f'Error: {result[\"error\"]}')")
    print()

    print("5. 与其他脚本结合使用示例")
    print("   # 先查找页面位置，然后在指定位置插入内容")
    print("   result = find_page('unpacked/', 3)")
    print("   if 'error' not in result:")
    print("       # 使用编辑工具在指定位置插入内容")
    print("       # 例如：在第三页开头插入图片或文本")
    print("   else:")
    print("       # 使用备用方案（如按标题定位）")
    print()

    print("=== 输出示例 ===\n")

    print("示例 1：查找第 2 页")
    print("$ python find_page.py unpacked/ 2")
    print("Page 2 of 5:")
    print("  Position: 2456 (line 89)")
    print("  XML preview: <w:p><w:r><w:t>这是第二页的内容...</w:t></w:r></w:p>")
    print()
    print("Page break analysis:")
    print("  - Last rendered page breaks: 4")
    print("  - Manual page breaks: 0")
    print("  - Page break before attributes: 0")
    print("  - Section breaks: 0")
    print()

    print("示例 2：查看所有页面")
    print("$ python find_page.py unpacked/ all")
    print("Total pages detected: 5")
    print("Page break analysis:")
    print("  - Last rendered page breaks: 4")
    print("  - Manual page breaks: 0")
    print("  - Page break before attributes: 0")
    print("  - Section breaks: 0")
    print()
    print("Page 1: ")
    print("  Position: 0 (line 1)")
    print("  XML preview: <w:p><w:r><w:t>第一页内容...</w:t></w:r></w:p>")
    print()
    print("Page 2: ")
    print("  Position: 2456 (line 89)")
    print("  XML preview: <w:p><w:r><w:t>第二页内容...</w:t></w:r></w:p>")
    print()

    print("=== 支持的页面标记类型 ===\n")
    print("脚本支持以下分页标记类型：")
    print("1. <w:lastRenderedPageBreak/> - Word 渲染时记录的软分页（最常见）")
    print("2. <w:br w:type=\"page\"/> - 手动插入的分页符")
    print("3. <w:pageBreakBefore/> - 段落属性中的段前分页")
    print("4. <w:sectPr> - 分节符（非文档末尾）")
    print()

    print("=== 常见问题解决方案 ===\n")

    print("问题：找不到分页标记")
    print("原因：文档可能从未在 Word 中打开保存过，缺少 lastRenderedPageBreak 标记")
    print("解决方案：")
    print("1. 在 Word 中打开文档并保存，重新解包")
    print("2. 使用其他定位方式（如按标题定位）")
    print()

    print("问题：页码检测不准确")
    print("原因：分页标记可能不完整或格式异常")
    print("解决方案：")
    print("1. 使用 'all' 参数查看所有检测到的页面")
    print("2. 检查 page_break_analysis 了解分页标记统计")
    print("3. 考虑使用标题定位作为备用方案")
    print()

    print("=== 最佳实践 ===\n")

    print("1. 先使用 'all' 参数查看所有页面信息")
    print("   python find_page.py unpacked/ all")
    print()

    print("2. 检查分页标记统计，了解文档的分页类型")
    print("   - 如果 last_rendered_page_breaks 数量较多，说明文档在 Word 中渲染过")
    print("   - 如果 manual_page_breaks 数量较多，说明有手动分页符")
    print()

    print("3. 对于重要操作，始终检查返回结果中是否包含 'error'")
    print("   result = find_page('unpacked/', 2)")
    print("   if 'error' in result:")
    print("       # 处理错误情况")
    print()

    print("4. 结合其他定位方式使用")
    print("   # 如果页面定位失败，可以尝试标题定位")
    print("   # 使用 insert_image.py 的 --before-heading 或 --after-heading 参数")


if __name__ == "__main__":
    example_usage()
