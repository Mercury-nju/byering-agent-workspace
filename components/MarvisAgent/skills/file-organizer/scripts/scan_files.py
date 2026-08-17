"""
scan_files.py — 文件整理预检脚本
扫描源目录，列出所有文件，供 Agent 用 LLM 推理分类后生成整理蓝图 JSON。
可选扫描目标目录下的已有文件夹，让 Agent 优先将文件归入已有文件夹。
默认同时扫描源目录下的子文件夹信息（供 Agent 决定整体搬运或合并），
传入 --no-source-dirs 可关闭此行为。

🚨 默认行为：仅扫描源目录顶层散文件，绝不递归进入用户已有的子文件夹。
   只有当用户明确要求拆解某个子目录（如"详细整理 D 盘工作文件夹下的发票文件夹"）
   时，才允许显式开启 --recursive 标志。开启 --recursive 等同于声明
   "用户已授权本次整理拆散原有目录结构"，否则禁止使用。

用法：
    python scan_files.py --source <源目录> [--output <文件列表输出路径>] [--target <目标目录>] [--no-source-dirs] [--recursive]

不指定 --output 时，JSON 结果直接输出到 stdout，供 Agent 直接读取。
"""

from __future__ import annotations

import argparse
import datetime
import fnmatch
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

# 系统/隐藏文件名黑名单（统一大写，匹配时做 upper() 比较）
_SKIP_NAMES: set[str] = {
    "RECYCLE.BIN",
    "SYSTEM VOLUME INFORMATION",
    "$RECYCLE.BIN",
    "DESKTOP.INI",
    "THUMBS.DB",
    ".TRASH",
    ".TRASHES",
    ".DS_STORE",
    ".SPOTLIGHT-V100",
    ".FSEVENTSD",
}

# 应用快捷方式扩展名，这些文件不参与整理
_SKIP_EXTENSIONS: set[str] = {
    ".lnk",       # Windows 应用快捷方式
    ".url",       # 浏览器快捷方式
    ".webloc",    # macOS Safari 网址快捷方式
    ".desktop",   # Linux 桌面入口
}

# 临时文件扩展名（含下载中文件、备份文件等）
_TEMP_EXTENSIONS: set[str] = {
    ".tmp",
    ".temp",
    ".crdownload",   # Chrome 下载中文件
    ".part",         # Firefox 下载中文件
    ".partial",      # IE/Edge 下载中文件
    ".swp",          # Vim 临时文件
    ".swo",
    ".bak",
}

# 临时文件名通配模式（如 Office 锁文件）
_TEMP_NAME_PATTERNS: tuple[str, ...] = (
    "~$*",       # Office 锁文件（Word/Excel/PPT 编辑中）
    ".~lock.*",  # LibreOffice 锁文件
)

# 禁止整理的源目录黑名单（小写比较）
# Windows：系统盘根目录、系统目录、应用安装目录
# macOS：根目录、系统目录、应用安装目录
_BLOCKED_DIR_NAMES: set[str] = {
    # Windows 系统目录与应用安装目录
    "windows",
    "winnt",
    "system32",
    "syswow64",
    "program files",
    "program files (x86)",
    "programdata",
    "recovery",
    # macOS 系统目录与应用安装目录
    "system",
    "applications",
    "library",
    "usr",
    "bin",
    "sbin",
    "opt",
    "volumes",
    "private",
    "cores",
}

# macOS 用户家目录下需要拦截的子目录（仅当目录前缀匹配时生效）
_MACOS_USER_BLOCKED_PREFIXES: tuple[str, ...] = (
    "/library",   # ~/Library 与 /Library 都拦截
)

# 应用安装目录的标志性子项；命中任一则将该目录标记为 is_app_install
_APP_INSTALL_MARKERS_FILES: set[str] = {
    "unins000.exe",      # Inno Setup 卸载器
    "uninstall.exe",
    "uninst.exe",
}

# 应用安装目录的标志性扩展名（macOS 应用 bundle）
_APP_INSTALL_MARKER_EXTS: set[str] = {
    ".app",
    ".framework",
    ".bundle",
    ".plugin",
    ".kext",
}


def _emit_error_and_exit(reason: str, source: str) -> None:
    """
    以非零退出码终止，并向 stdout 输出结构化 error JSON。

    file-agent 在解析 stdout 时优先识别 JSON 结构，避免把自由文本误判为成功。
    """
    error_payload = {
        "error": True,
        "reason": reason,
        "source": source,
    }
    # stdout 输出结构化 JSON，stderr 输出可读提示
    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(error_payload, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(f"❌ 错误：{reason}", file=sys.stderr)
    sys.exit(1)


def _is_blocked_source(source: str) -> str | None:
    """
    检查源目录是否属于禁止整理的范围。
    返回拒绝原因字符串，若合法则返回 None。
    """
    normed = os.path.normpath(os.path.abspath(source))

    # 1. 系统盘根目录（仅拦截 C:\，其他盘符根目录允许整理）
    drive, tail = os.path.splitdrive(normed)
    if drive and (not tail or tail == os.sep):
        if drive.upper() == "C:":
            return f"源目录 '{source}' 是系统盘根目录，不支持整理"

    # 2. macOS / Linux 文件系统根目录
    if normed in ("/", os.sep):
        return f"源目录 '{source}' 是文件系统根目录，不支持整理"

    # 3. 路径片段命中黑名单（Windows 系统目录、应用安装目录、macOS 系统目录）
    parts = [p.lower() for p in normed.split(os.sep) if p]
    for part in parts:
        if part in _BLOCKED_DIR_NAMES:
            return f"源目录 '{source}' 包含系统/应用安装路径 '{part}'，不支持整理"

    # 4. macOS 用户家目录下的特殊拦截（如 ~/Library）
    # 将 normed 转换为正斜杠，便于做前缀比对
    posix_path = normed.replace(os.sep, "/").lower()
    home = os.path.expanduser("~").replace(os.sep, "/").lower()
    if home and posix_path.startswith(home):
        rel_to_home = posix_path[len(home):]
        for prefix in _MACOS_USER_BLOCKED_PREFIXES:
            if rel_to_home.startswith(prefix):
                return f"源目录 '{source}' 命中用户家目录受保护路径 '{prefix}'，不支持整理"

    return None


def _matches_temp_pattern(name: str) -> bool:
    """判断文件名是否命中临时文件通配模式（如 ~$xxx、.~lock.xxx）。"""
    for pattern in _TEMP_NAME_PATTERNS:
        if fnmatch.fnmatch(name, pattern):
            return True
    return False


def _is_system_or_hidden(name: str) -> bool:
    """
    判断是否为隐藏文件、系统文件、应用快捷方式或临时文件。

    命中以下任一规则即返回 True，扫描时会自动跳过：
    - 以 ``.`` 开头的隐藏文件（含 ``.DS_Store`` / ``.Trashes``）
    - 系统文件名黑名单（``$RECYCLE.BIN`` / ``Thumbs.db`` / ``desktop.ini`` 等）
    - 应用快捷方式扩展名（``.lnk`` / ``.url`` / ``.webloc`` / ``.desktop``）
    - 临时文件扩展名（``.tmp`` / ``.temp`` / ``.crdownload`` / ``.part`` 等）
    - 临时文件名通配模式（``~$*`` Office 锁文件、``.~lock.*`` LibreOffice 锁文件）
    """
    if name.startswith("."):
        return True
    if name.upper() in _SKIP_NAMES:
        return True
    if _matches_temp_pattern(name):
        return True
    _, ext = os.path.splitext(name)
    ext_lower = ext.lower()
    if ext_lower in _SKIP_EXTENSIONS:
        return True
    if ext_lower in _TEMP_EXTENSIONS:
        return True
    return False


def _detect_app_install_dir(dir_path: str, dir_name: str) -> bool:
    """
    判断给定目录是否为应用安装目录。

    判定规则：
    - 目录名扩展名命中 macOS 应用 bundle 标识（``.app`` / ``.framework`` 等）
    - 目录下存在卸载器（``unins000.exe`` / ``uninstall.exe`` 等）
    """
    _, ext = os.path.splitext(dir_name)
    if ext.lower() in _APP_INSTALL_MARKER_EXTS:
        return True
    try:
        entries = os.listdir(dir_path)
    except (PermissionError, OSError):
        return False
    lower_entries = {e.lower() for e in entries}
    for marker in _APP_INSTALL_MARKERS_FILES:
        if marker in lower_entries:
            return True
    return False


def _format_size(size_bytes: int) -> str:
    """将字节数转为可读格式（KB/MB/GB）"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f}MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f}GB"


def _scan_dirs(root: str, *, include_stats: bool = False) -> list[dict]:
    """
    递归扫描目录下所有层级的子文件夹。

    Args:
        root: 要扫描的根目录路径。
        include_stats: 为 True 时额外收集 file_count 和 sub_dir_count（用于源目录扫描）。

    Returns:
        文件夹信息列表，每项包含 name / path / rel_path / depth / sample_files /
        is_app_install，include_stats=True 时额外包含 file_count / sub_dir_count。
    """
    result: list[dict] = []

    def _walk(dir_path: str, depth: int):
        try:
            entries = os.listdir(dir_path)
        except (PermissionError, OSError):
            return
        for name in entries:
            full_path = os.path.join(dir_path, name)
            if not os.path.isdir(full_path):
                continue
            if _is_system_or_hidden(name):
                continue

            sample_files: list[str] = []
            file_count = 0
            sub_dir_count = 0
            try:
                for child in os.listdir(full_path):
                    child_path = os.path.join(full_path, child)
                    if _is_system_or_hidden(child):
                        continue
                    if os.path.isdir(child_path):
                        if include_stats:
                            sub_dir_count += 1
                    elif os.path.isfile(child_path):
                        if include_stats:
                            file_count += 1
                        if len(sample_files) < 5:
                            sample_files.append(child)
            except (PermissionError, OSError):
                pass

            rel_path = os.path.relpath(full_path, root)
            is_app_install = _detect_app_install_dir(full_path, name)
            entry = {
                "name": name,
                "path": full_path,
                "rel_path": rel_path,
                "depth": depth,
                "sample_files": sample_files,
                "is_app_install": is_app_install,
            }
            if include_stats:
                entry["file_count"] = file_count
                entry["sub_dir_count"] = sub_dir_count
            result.append(entry)

            # 应用安装目录默认不递归进入，避免扫到一堆系统 dll/资源文件
            if not is_app_install:
                _walk(full_path, depth + 1)

    _walk(root, 1)
    return result


def scan_and_export(
    source: str,
    output: str | None,
    recursive: bool,
    target: str | None = None,
    include_source_dirs: bool = True,
) -> None:
    """扫描源目录并将文件信息导出为 JSON，供 Agent 用 LLM 推理分类。

    当 output 为 None 时，JSON 结果直接输出到 stdout；否则写入指定文件。
    """
    if not os.path.isdir(source):
        _emit_error_and_exit(f"源目录不存在：{source}", source)

    # 源目录合法性校验：拒绝根目录、系统目录、应用安装目录
    block_reason = _is_blocked_source(source)
    if block_reason:
        _emit_error_and_exit(block_reason, source)

    files = []

    # 当显式开启递归时，向 stderr 输出醒目警告横幅，并在结果 JSON 中持久化标记，
    # 便于 validate_plan.py / execute_moves.py / 历史 jsonl 联动审计
    if recursive:
        print(
            "\n" + "=" * 78 + "\n"
            "⚠️  RECURSIVE SCAN ENABLED ⚠️\n"
            "  本次扫描已开启递归模式，将拆散用户原有的子文件夹结构。\n"
            "  仅当用户明确要求'详细整理 / 拆解 / 递归 / 进入子文件夹'时才可使用此开关。\n"
            "  生成的蓝图允许把子目录里的文件单独搬运到不同分类目录。\n"
            + "=" * 78 + "\n",
            file=sys.stderr,
        )

    def _collect(dir_path: str):
        try:
            entries = os.listdir(dir_path)
        except OSError:
            return
        for name in entries:
            full_path = os.path.join(dir_path, name)
            if _is_system_or_hidden(name):
                continue
            if os.path.isdir(full_path):
                if recursive:
                    _collect(full_path)
                continue
            try:
                stat = os.stat(full_path)
                size = stat.st_size
                mtime = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            except OSError:
                size = -1
                mtime = "unknown"
            entry = {"path": full_path, "name": name, "size": size, "mtime": mtime}
            files.append(entry)

    _collect(source)

    print(f"✅ 共发现 {len(files)} 个文件：")
    for item in files:
        size_str = _format_size(item['size']) if item['size'] >= 0 else "unknown"
        print(f"  {item['path']}  ({size_str}, {item['mtime']})")

    result: dict = {
        "source": source,
        "file_count": len(files),
        "source_dir_count": 0,
        # 持久化记录是否开启递归，validate_plan.py 据此决定是否允许蓝图拆散用户子目录
        "recursive": bool(recursive),
        "files": files,
    }

    # 扫描源目录下的子文件夹（默认开启，传 --no-source-dirs 关闭）
    if include_source_dirs:
        source_dirs = _scan_dirs(source, include_stats=True)
        if source_dirs:
            result["source_dirs"] = source_dirs
            top_level = [d for d in source_dirs if d["depth"] == 1]
            result["source_dir_count"] = len(top_level)
            app_install_count = sum(1 for d in source_dirs if d.get("is_app_install"))
            print(f"\n📁 源目录下有 {len(top_level)} 个一级子文件夹（共 {len(source_dirs)} 个文件夹，含子目录）：")
            if app_install_count:
                print(f"   ⚠️ 其中 {app_install_count} 个被识别为应用安装目录，默认不参与整理")
            for d in source_dirs:
                indent = "  " * d["depth"]
                samples = "、".join(d["sample_files"][:3]) if d["sample_files"] else "（空）"
                sub_info = f"  +{d['sub_dir_count']}子目录" if d["sub_dir_count"] > 0 else ""
                app_tag = "  🚫[应用安装目录]" if d.get("is_app_install") else ""
                print(f"{indent}📁 {d['name']}  ({d['file_count']} 个文件{sub_info}){app_tag}  —  {samples}")

    # 扫描目标目录下的已有文件夹（若指定了 --target）
    # 当源目录和目标目录相同时（如"整理桌面"），也扫描源目录下的已有文件夹
    scan_target = target if target else source
    existing_dirs = _scan_dirs(scan_target)
    if existing_dirs:
        result["existing_dirs"] = existing_dirs
        top_level = [d for d in existing_dirs if d["depth"] == 1]
        print(f"\n📂 目标目录下已有 {len(top_level)} 个一级文件夹（共 {len(existing_dirs)} 个文件夹，含子目录）：")
        for d in existing_dirs:
            indent = "  " * d["depth"]
            samples = "、".join(d["sample_files"][:3]) if d["sample_files"] else "（空文件夹）"
            app_tag = "  🚫[应用安装目录]" if d.get("is_app_install") else ""
            print(f"{indent}📁 {d['name']}{app_tag}  —  {samples}")

    if output:
        output_dir = os.path.dirname(output)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n文件列表已保存至：{output}")
    else:
        # 不指定 --output 时，直接将 JSON 输出到 stdout，供 Agent 直接读取
        print("\n--- JSON_OUTPUT_START ---")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("--- JSON_OUTPUT_END ---")


def main():
    parser = argparse.ArgumentParser(description="文件整理预检脚本：扫描源目录，列出所有文件")
    parser.add_argument("--source", required=True, help="源目录路径")
    parser.add_argument("--output", default=None, help="文件列表 JSON 输出路径（可选，不指定则直接输出到 stdout）")
    parser.add_argument("--target", default=None, help="目标目录路径（默认同源目录）。脚本会扫描其下已有文件夹，供 Agent 优先归入")
    parser.add_argument(
        "--recursive", action="store_true",
        help=(
            "🚨 危险开关：递归进入子文件夹收集所有文件。开启后整理流程被允许拆散用户"
            "原有的目录结构（即把子目录内的文件单独搬运到不同分类目录）。"
            "默认关闭；仅当用户明确要求拆解某个子目录（如\"详细整理 / 进入子文件夹 /"
            "递归整理\"等语义）时才可使用。一旦开启，蓝图与历史清单中会持久化"
            "recursive=true 标记以便审计。"
        ),
    )
    parser.add_argument("--no-source-dirs", action="store_true", dest="no_source_dirs",
                        help="不扫描源目录下的子文件夹信息（默认会扫描，用于 Agent 决定将文件夹整体搬运或合并到目标目录）")
    args = parser.parse_args()

    scan_and_export(
        source=args.source,
        output=args.output or None,
        recursive=args.recursive,
        target=args.target,
        include_source_dirs=not args.no_source_dirs,
    )


if __name__ == "__main__":
    main()
