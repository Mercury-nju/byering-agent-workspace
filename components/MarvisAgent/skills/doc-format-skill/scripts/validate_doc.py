#!/usr/bin/env python3
"""
Document Format Validator - Validates an HTML document against format requirements

Usage:
    validate_doc.py <path/to/document.html>

Examples:
    validate_doc.py ./output/2026年市场分析报告.html
"""

import sys
import io
import re
from pathlib import Path

# Fix console encoding for CJK characters
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


def validate_doc(doc_path):
    """
    Validate an HTML document against the doc-format-skill requirements.

    Returns:
        (valid: bool, messages: list[str])
    """
    doc_path = Path(doc_path).resolve()
    errors = []
    warnings = []

    # --- 1. File existence ---
    if not doc_path.exists() or not doc_path.is_file():
        return False, [f"❌ 文件不存在: {doc_path}"]

    if not doc_path.name.endswith(".html"):
        warnings.append(f"⚠️ 文件不是 .html 格式: {doc_path.name}")

    content = doc_path.read_text(encoding="utf-8")

    # --- 2. Basic HTML structure ---
    if "<!DOCTYPE html>" not in content and "<!doctype html>" not in content:
        errors.append("❌ 缺少 <!DOCTYPE html> 声明")
    else:
        print("  [OK] DOCTYPE 声明")

    if "<html" not in content:
        errors.append("❌ 缺少 <html> 标签")

    if "<head>" not in content and "<head " not in content:
        errors.append("❌ 缺少 <head> 标签")

    if "<body>" not in content and "<body " not in content:
        errors.append("❌ 缺少 <body> 标签")

    # --- 3. Meta and style ---
    if 'charset="UTF-8"' not in content and "charset='UTF-8'" not in content and 'charset=UTF-8' not in content:
        errors.append("❌ 缺少 UTF-8 字符集声明（<meta charset=\"UTF-8\">）")
    else:
        print("  [OK] UTF-8 字符集声明")

    if "<style>" not in content and "<style " not in content:
        errors.append("❌ 缺少内嵌 <style> 标签（样式必须内嵌）")
    else:
        print("  [OK] 内嵌 <style> 样式")

    # --- 4. Title tag ---
    title_match = re.search(r"<title>(.*?)</title>", content, re.DOTALL)
    if not title_match:
        errors.append("❌ 缺少 <title> 标签")
    elif not title_match.group(1).strip() or "TODO" in title_match.group(1):
        errors.append("❌ <title> 标签为空或仍为占位符")
    else:
        print(f"  [OK] <title>: {title_match.group(1).strip()}")

    # --- 5. H1 title (exactly one) ---
    h1_matches = re.findall(r"<h1[^>]*>(.*?)</h1>", content, re.DOTALL)
    if len(h1_matches) == 0:
        errors.append("❌ 缺少一级标题（<h1>）")
    elif len(h1_matches) > 1:
        warnings.append(f"⚠️ 发现 {len(h1_matches)} 个 <h1> 标签，建议全文仅使用一个")
    else:
        h1_text = re.sub(r"<[^>]+>", "", h1_matches[0]).strip()
        if "TODO" in h1_text:
            errors.append("❌ <h1> 标题仍为占位符")
        else:
            print(f"  [OK] 一级标题: {h1_text[:40]}...")

    # --- 6. H2 sections (at least 3) ---
    h2_matches = re.findall(r"<h2[^>]*>(.*?)</h2>", content, re.DOTALL)
    # Exclude appendix section from count
    content_h2 = [h for h in h2_matches if "附录" not in h]
    if len(content_h2) < 3:
        errors.append(f"❌ 正文章节不足（需至少 3 个 <h2>，当前 {len(content_h2)} 个）")
    else:
        print(f"  [OK] 二级标题章节: {len(content_h2)} 个")

    # --- 7. Bullet list (ul with ≥3 li) ---
    ul_matches = re.findall(r"<ul[^>]*>(.*?)</ul>", content, re.DOTALL)
    valid_ul = False
    for ul_content in ul_matches:
        li_count = len(re.findall(r"<li[^>]*>", ul_content))
        if li_count >= 3:
            valid_ul = True
            break
    if not valid_ul:
        errors.append("❌ 缺少项目符号列表（需至少 1 个 <ul>，每个 ≥3 个 <li>）")
    else:
        print(f"  [OK] 项目符号列表: {len(ul_matches)} 处")

    # --- 8. Numbered list (ol with ≥3 li) ---
    ol_matches = re.findall(r"<ol[^>]*>(.*?)</ol>", content, re.DOTALL)
    valid_ol = False
    for ol_content in ol_matches:
        li_count = len(re.findall(r"<li[^>]*>", ol_content))
        if li_count >= 3:
            valid_ol = True
            break
    if not valid_ol:
        errors.append("❌ 缺少编号列表（需至少 1 个 <ol>，每个 ≥3 个 <li>）")
    else:
        print(f"  [OK] 编号列表: {len(ol_matches)} 处")

    # --- 9. Table (with thead and tbody) ---
    table_matches = re.findall(r"<table[^>]*>(.*?)</table>", content, re.DOTALL)
    if not table_matches:
        errors.append("❌ 缺少表格（需至少 1 个 <table>）")
    else:
        has_proper_table = False
        for table_content in table_matches:
            has_thead = "<thead" in table_content
            has_tbody = "<tbody" in table_content
            if has_thead and has_tbody:
                # Count data rows in tbody
                tbody_match = re.search(r"<tbody[^>]*>(.*?)</tbody>", table_content, re.DOTALL)
                if tbody_match:
                    data_rows = len(re.findall(r"<tr[^>]*>", tbody_match.group(1)))
                    if data_rows >= 3:
                        has_proper_table = True
                    else:
                        warnings.append(f"⚠️ 表格数据行不足（需 ≥3 行，当前 {data_rows} 行）")
            else:
                if not has_thead:
                    warnings.append("⚠️ 表格缺少 <thead>")
                if not has_tbody:
                    warnings.append("⚠️ 表格缺少 <tbody>")

        if has_proper_table:
            print(f"  [OK] 表格: {len(table_matches)} 个")
        elif not any("缺少表格" in e for e in errors):
            warnings.append("⚠️ 表格结构不完整（需含 <thead> + <tbody>，且数据行 ≥3）")

    # --- 10. Chart/image placeholder ---
    has_chart = "chart-placeholder" in content or "[此处插入" in content
    if not has_chart:
        errors.append("❌ 缺少图表/图片占位符（class=\"chart-placeholder\" 或 [此处插入：...]）")
    else:
        print("  [OK] 图表占位符")

    # --- 11. Header ---
    has_header = 'class="header"' in content or "class='header'" in content
    if not has_header:
        errors.append("❌ 缺少页眉（class=\"header\"）")
    else:
        print("  [OK] 页眉")

    # --- 12. Footer ---
    has_footer = 'class="footer"' in content or "class='footer'" in content
    if not has_footer:
        errors.append("❌ 缺少页脚（class=\"footer\"）")
    else:
        print("  [OK] 页脚")

    # --- 13. Print styles ---
    if "@media print" not in content:
        errors.append("❌ 缺少打印样式（@media print）")
    else:
        print("  [OK] 打印样式 @media print")

    # --- 14. Responsive styles ---
    if "@media (max-width" not in content and "@media(max-width" not in content:
        warnings.append("⚠️ 缺少响应式样式（@media (max-width: ...)）")
    else:
        print("  [OK] 响应式样式 @media (max-width)")

    # --- 15. Check for unfilled TODOs ---
    todo_count = content.count("[TODO")
    if todo_count > 0:
        errors.append(f"❌ 发现 {todo_count} 个未填写的 [TODO] 占位符")

    # --- 16. Check meta info (author and date) ---
    if "作者" not in content:
        warnings.append("⚠️ 缺少作者信息")
    if "日期" not in content:
        warnings.append("⚠️ 缺少日期信息")

    # --- 17. Check abstract ---
    has_abstract = 'class="abstract"' in content or "class='abstract'" in content
    if not has_abstract:
        warnings.append("⚠️ 缺少摘要区域（class=\"abstract\"）")
    else:
        print("  [OK] 摘要区域")

    # --- Result ---
    messages = errors + warnings
    valid = len(errors) == 0

    if valid and not warnings:
        messages.append("✅ HTML 文档格式校验通过！")
    elif valid:
        messages.insert(0, "✅ 校验通过（有警告）:")

    return valid, messages


def main():
    if len(sys.argv) != 2:
        print("Usage: validate_doc.py <path/to/document.html>")
        print("\nExample:")
        print("  validate_doc.py ./output/2026年市场分析报告.html")
        sys.exit(1)

    print(f"[INFO] 校验 HTML 文档: {sys.argv[1]}")
    print()

    valid, messages = validate_doc(sys.argv[1])
    for msg in messages:
        print(msg)

    print()
    if valid:
        print("[RESULT] ✅ HTML 文档格式合规")
    else:
        print("[RESULT] ❌ HTML 文档格式不合规，请修复上述错误后重新校验")

    sys.exit(0 if valid else 1)


if __name__ == "__main__":
    main()
