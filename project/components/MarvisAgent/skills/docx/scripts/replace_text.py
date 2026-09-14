"""幂等批量文本替换工具，作用于已解包的 DOCX 目录。

适用场景：对 .docx 文件中的文本内容做批量"查找-替换"，例如将
文档中所有 "小宝" 替换为 "应用宝小宝"。

关键特性：
- 幂等：使用 sentinel 两阶段替换，避免 new_string 包含 old_string
  时产生的重复污染（例如 "小宝" -> "应用宝小宝" 若朴素 str.replace
  会把已替换结果里的 "小宝" 再替换一次）。
- XML 安全：默认仅替换 <w:t>...</w:t> 文本节点内部内容，不会破坏
  XML 结构或样式标签；new_string 会做 XML 实体转义。
- 作用范围可控：只接受解包目录作为输入，避免误伤原始 .docx。

典型用法：
    python scripts/replace_text.py <unpacked_dir> \\
        --pair "小宝=应用宝小宝" --pair "AI助手=AI Agent"

流程：
    1. scripts/office/unpack.py  original.docx  <out>/unpacked/
    2. scripts/replace_text.py   <out>/unpacked/  --pair "A=B"
    3. scripts/office/pack.py    <out>/unpacked/  <out>/output.docx \\
           --original original.docx
"""

import argparse
import re
import sys
from pathlib import Path


# 默认处理的 XML 文件相对路径（相对于 unpacked 目录）
DEFAULT_TARGET_FILES = (
    "word/document.xml",
)

# 用于两阶段替换的 sentinel 前后缀，几乎不会与真实文本冲突
_SENTINEL_PREFIX = "\x00__MARVIS_REPL_"
_SENTINEL_SUFFIX = "__\x00"


def replace_text(
    unpacked_dir: str,
    pairs: list[tuple[str, str]],
    target_files: list[str] | None = None,
    raw: bool = False,
) -> tuple[dict[str, dict[str, int]], str]:
    """在解包目录内对目标 XML 文件进行批量替换。

    :param unpacked_dir: 已解包的 DOCX 目录（unpack.py 的输出目录）
    :param pairs: [(old_string, new_string), ...] 替换对列表
    :param target_files: 相对于 unpacked_dir 的 XML 文件路径列表，
        为 None 时使用 DEFAULT_TARGET_FILES
    :param raw: 是否对整个文件内容直接替换（绕过 <w:t> 边界）；
        默认 False，仅替换 <w:t> 文本节点内部
    :return: (统计字典, 结果消息)
        统计字典形如 {"word/document.xml": {"小宝": 67, "AI助手": 3}}
    """
    unpacked_path = Path(unpacked_dir)
    if not unpacked_path.exists() or not unpacked_path.is_dir():
        return {}, f"Error: Unpacked directory not found: {unpacked_dir}"

    if not pairs:
        return {}, "Error: No replacement pairs provided"

    for old, _new in pairs:
        if not old:
            return {}, "Error: old_string must not be empty"

    files = list(target_files) if target_files else list(DEFAULT_TARGET_FILES)

    stats: dict[str, dict[str, int]] = {}
    touched_files = 0
    total_replacements = 0

    for rel in files:
        target = unpacked_path / rel
        if not target.exists():
            # 非致命：目标文件不存在时跳过并记录
            stats[rel] = {old: -1 for old, _ in pairs}
            continue

        try:
            content = target.read_text(encoding="utf-8")
        except OSError as exc:
            return stats, f"Error: Failed to read {target}: {exc}"

        new_content, per_file_counts = _apply_pairs(content, pairs, raw=raw)
        stats[rel] = per_file_counts

        file_total = sum(c for c in per_file_counts.values() if c > 0)
        if file_total > 0:
            try:
                target.write_text(new_content, encoding="utf-8")
            except OSError as exc:
                return stats, f"Error: Failed to write {target}: {exc}"
            touched_files += 1
            total_replacements += file_total

    summary_parts = []
    for rel, counts in stats.items():
        parts = ", ".join(f"{old!r}x{n}" for old, n in counts.items())
        summary_parts.append(f"{rel}: {parts}")

    message = (
        f"Replaced {total_replacements} occurrence(s) across "
        f"{touched_files} file(s). Details: " + " | ".join(summary_parts)
    )
    return stats, message


def _apply_pairs(
    content: str,
    pairs: list[tuple[str, str]],
    raw: bool,
) -> tuple[str, dict[str, int]]:
    """对单个字符串内容应用所有替换对，返回新内容与每对的命中次数。

    采用两阶段 sentinel 替换 + 跨运行幂等扫描：
    - 若 new_string 包含 old_string（例如 "小宝" -> "应用宝小宝"），
      则扫描 old 时会跳过那些已经处于"已存在的 new 片段"上下文内的
      位置，从而保证多次运行同一替换对得到的结果稳定。
    """
    # 构造 sentinel 映射
    sentinel_map: dict[str, tuple[str, str]] = {}
    for idx, (old, new) in enumerate(pairs):
        sentinel = f"{_SENTINEL_PREFIX}{idx}{_SENTINEL_SUFFIX}"
        sentinel_map[sentinel] = (old, new)

    counts: dict[str, int] = {old: 0 for old, _ in pairs}

    def _scan_replace(segment: str) -> str:
        """在单段文本内，对每个 (old, new) 做幂等的 old -> sentinel 替换。"""
        result = segment
        for sentinel, (old, new) in sentinel_map.items():
            if old not in result:
                continue
            # 只有当 old 是 new 的子串时，才需要排除"已存在的 new 区间"
            excluded: list[tuple[int, int]] = []
            if old and old in new:
                start = 0
                new_len = len(new)
                while True:
                    pos = result.find(new, start)
                    if pos == -1:
                        break
                    excluded.append((pos, pos + new_len))
                    start = pos + new_len

            # 扫描 old 位置，跳过落在 excluded 区间内的命中
            parts: list[str] = []
            cursor = 0
            search_from = 0
            old_len = len(old)
            hits = 0
            while True:
                pos = result.find(old, search_from)
                if pos == -1:
                    break
                # 判断 [pos, pos+old_len) 是否被任一 excluded 区间完全覆盖
                in_excluded = any(
                    ex_start <= pos and pos + old_len <= ex_end
                    for ex_start, ex_end in excluded
                )
                if in_excluded:
                    search_from = pos + 1
                    continue
                parts.append(result[cursor:pos])
                parts.append(sentinel)
                hits += 1
                cursor = pos + old_len
                search_from = cursor
            if hits > 0:
                parts.append(result[cursor:])
                result = "".join(parts)
                counts[old] += hits
        return result

    if raw:
        working = _scan_replace(content)
    else:
        pattern = re.compile(r"(<w:t\b[^>]*>)(.*?)(</w:t>)", flags=re.DOTALL)

        def _on_match(match: re.Match[str]) -> str:
            open_tag, inner, close_tag = match.group(1), match.group(2), match.group(3)
            inner = _scan_replace(inner)
            return f"{open_tag}{inner}{close_tag}"

        working = pattern.sub(_on_match, content)

    # 第 2 阶段：sentinel 替换为最终 new_string（做 XML 实体转义）
    for sentinel, (_old, new) in sentinel_map.items():
        if sentinel in working:
            working = working.replace(sentinel, _xml_escape(new))

    return working, counts


def _xml_escape(text: str) -> str:
    """对要写入 XML 文本节点的字符串做最小转义。"""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _parse_pair_arg(arg: str) -> tuple[str, str]:
    """解析命令行 --pair 参数，格式为 old=new。"""
    if "=" not in arg:
        raise argparse.ArgumentTypeError(
            f"Invalid --pair value {arg!r}, expected 'old=new'"
        )
    old, new = arg.split("=", 1)
    if not old:
        raise argparse.ArgumentTypeError("old_string in --pair must not be empty")
    return (old, new)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Idempotent batch text replacement inside an unpacked DOCX directory. "
            "Safe against self-containing replacements (e.g. A -> XA where A is in XA)."
        )
    )
    parser.add_argument(
        "unpacked_dir",
        help="Path to the unpacked DOCX directory (output of unpack.py)",
    )
    parser.add_argument(
        "--pair",
        action="append",
        default=[],
        type=_parse_pair_arg,
        metavar="OLD=NEW",
        help="Replacement pair; can be specified multiple times",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        default=None,
        metavar="REL_PATH",
        help=(
            "Relative XML file paths inside unpacked_dir to process. "
            "Default: word/document.xml"
        ),
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help=(
            "Replace across the entire file content instead of only inside "
            "<w:t> text nodes. Use with care; default is False."
        ),
    )
    args = parser.parse_args()

    _stats, message = replace_text(
        args.unpacked_dir,
        pairs=args.pair,
        target_files=args.files,
        raw=args.raw,
    )
    print(message)

    if message.startswith("Error"):
        sys.exit(1)
