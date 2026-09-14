"""
reverse_moves.py — 文件整理撤销脚本
读取 ~/.marvis/file-organizer/history/ 下由 execute_moves.py 写入的反向 move
清单（jsonl），把搬运过的文件逐项移回原位置。

核心安全约束：
1. 仅调用 shutil.move，严禁任何形式的删除（os.remove / os.unlink /
   shutil.rmtree / Path.unlink / 子进程 rm / Remove-Item / del 等）。
   ⚠️ 例外 1：原源目录已被外部删除时，允许 os.makedirs 重建空目录。
   ⚠️ 例外 2：受控删除模式（--cleanup-empty-dirs）下，允许 os.rmdir 删除
              历史白名单（_meta.new_dirs_created）内、且实时校验为空的目录；
              仍严禁 shutil.rmtree / os.remove / os.unlink / os.removedirs。
2. 撤销路径上的目标位置已被其他文件占用 → 跳过加入 conflicts 列表，不覆盖。
3. 历史文件第一行 metadata 中含 ``reversed_at`` 字段时，视为该次操作已被
   撤销，再次撤销会被明确拒绝（撤销的撤销不支持）。
4. 历史文件 metadata 中含 ``cleanup_executed_at`` 字段时，视为受控删除已执行
   过，再次执行 --cleanup-empty-dirs 会被明确拒绝（避免重复触发）。
5. stdout 输出结构化 JSON（reversed / conflicts / not_found / cleanup_candidates
   / skipped_cleanup_candidates / cleaned_up / cleanup_skipped），便于
   file-agent 据此判断结果。

用法：
    python reverse_moves.py --latest                       # 撤销最近一次整理
    python reverse_moves.py --history-file <jsonl 路径>     # 撤销指定历史
    python reverse_moves.py --preview                      # 仅预览反向清单
    python reverse_moves.py --cleanup-empty-dirs <jsonl>   # 受控删除空目录
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
import sys

# Windows 控制台默认 GBK 会让中文/emoji 输出失败，强制使用 UTF-8 避免子进程读取乱码
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

# 历史持久化根目录（必须与 execute_moves.py 一致）
_HISTORY_ROOT = os.path.join(os.path.expanduser("~"), ".marvis", "file-organizer", "history")

# 跨会话查找窗口期（天）
_HISTORY_LOOKBACK_DAYS = 7


def _normalize_path_to_slash(path: str) -> str:
    """
    把路径统一为正斜杠形式，便于跨平台比较与文档规范保持一致。

    :param path: 任意原始路径字符串
    :returns: 使用正斜杠分隔的等价路径
    """
    return path.replace("\\", "/")


def _emit_error_and_exit(reason: str) -> None:
    """以非零退出码终止，并向 stdout 输出结构化 error JSON。"""
    error_payload = {
        "error": True,
        "reason": reason,
        "reversed_count": 0,
        "conflicts_count": 0,
        "not_found_count": 0,
        "reversed": [],
        "conflicts": [],
        "not_found": [],
    }
    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(error_payload, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(f"❌ 错误：{reason}", file=sys.stderr)
    sys.exit(1)


def _emit_cleanup_error_and_exit(reason: str, history_path: str = "") -> None:
    """
    受控删除模式下的错误终止：输出受控删除专用的结构化 JSON。

    :param reason: 终止原因
    :param history_path: 历史文件路径（便于排查）
    """
    error_payload = {
        "error": True,
        "reason": reason,
        "history_file": history_path,
        "total_attempted": 0,
        "cleaned_up": [],
        "cleanup_skipped": [],
    }
    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(error_payload, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(f"❌ 错误：{reason}", file=sys.stderr)
    sys.exit(1)


def _find_latest_history() -> str | None:
    """在 _HISTORY_ROOT 下查找最近 _HISTORY_LOOKBACK_DAYS 天内最新的 jsonl 文件。"""
    if not os.path.isdir(_HISTORY_ROOT):
        return None
    cutoff = datetime.datetime.now() - datetime.timedelta(days=_HISTORY_LOOKBACK_DAYS)
    candidates: list[tuple[float, str]] = []
    try:
        entries = os.listdir(_HISTORY_ROOT)
    except OSError:
        return None
    for name in entries:
        if not name.endswith(".jsonl"):
            continue
        full_path = os.path.join(_HISTORY_ROOT, name)
        try:
            mtime = os.path.getmtime(full_path)
        except OSError:
            continue
        if datetime.datetime.fromtimestamp(mtime) < cutoff:
            continue
        candidates.append((mtime, full_path))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _load_history(history_path: str) -> tuple[dict, list[dict]]:
    """
    解析 jsonl 历史文件。

    Returns:
        (metadata, entries) — metadata 来自第一行（_meta=True），entries 为反向 move 清单。
    """
    metadata: dict = {}
    entries: list[dict] = []
    try:
        with open(history_path, "r", encoding="utf-8") as f:
            lines = [line for line in (raw.strip() for raw in f) if line]
    except OSError as e:
        _emit_error_and_exit(f"无法读取历史文件 {history_path}：{e}")

    for idx, line in enumerate(lines):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            _emit_error_and_exit(f"历史文件第 {idx + 1} 行 JSON 解析失败：{e}")
        if idx == 0 and obj.get("_meta"):
            metadata = obj
            continue
        entries.append(obj)
    return (metadata, entries)


def _scan_cleanup_candidates(whitelist: list[str]) -> tuple[list[dict], list[dict]]:
    """
    扫描"撤销后已清空的新建目录"白名单候选清单。

    严禁扫描白名单之外的任何目录。仅当目录满足"仍存在 + listdir 完全为空"
    才加入 cleanup_candidates；其他情况（不存在 / 非空 / 无权限）加入
    skipped_cleanup_candidates，并附原因。

    :param whitelist: 历史 _meta.new_dirs_created 中登记的目录绝对路径列表
    :returns: (cleanup_candidates, skipped_cleanup_candidates) 两个列表
    """
    candidates: list[dict] = []
    skipped: list[dict] = []
    for raw_path in whitelist:
        if not isinstance(raw_path, str) or not raw_path:
            continue
        # 历史中以正斜杠存储；Windows / POSIX os.path API 都能识别
        path = raw_path
        normalized = _normalize_path_to_slash(path)
        if not os.path.isdir(path):
            skipped.append({
                "path": normalized,
                "reason": "directory_missing",
            })
            continue
        try:
            children = os.listdir(path)
        except PermissionError:
            skipped.append({
                "path": normalized,
                "reason": "permission_denied",
            })
            continue
        except OSError as exc:
            skipped.append({
                "path": normalized,
                "reason": f"listdir_error: {exc}",
            })
            continue
        if children:
            # 严格语义：含任何子项（包括 .DS_Store / Thumbs.db / desktop.ini）即视为非空
            skipped.append({
                "path": normalized,
                "reason": "not_empty",
            })
            continue
        candidates.append({
            "path": normalized,
        })
    return (candidates, skipped)


def _classify_os_error(err: Exception) -> str:
    """将 OSError 分类为人类可读的原因字符串。"""
    if isinstance(err, PermissionError):
        return "文件被占用或无写入权限"
    winerror = getattr(err, "winerror", None)
    if winerror == 32:
        return "文件被其他程序占用（WinError 32）"
    errno = getattr(err, "errno", None)
    if errno in (13, 16):
        return f"文件被占用或权限不足（errno={errno})"
    return str(err)


def _reverse_one(
    entry: dict,
    reversed_list: list[dict],
    conflicts: list[dict],
    not_found: list[dict],
) -> None:
    """
    撤销单条记录：把 entry["source"]（当前位置）移回 entry["target"]（原位置）。
    """
    current = entry.get("source", "")
    original = entry.get("target", "")
    if not current or not original:
        not_found.append({
            "current": current,
            "original": original,
            "reason": "记录字段缺失",
        })
        return

    if not os.path.exists(current):
        not_found.append({
            "current": current,
            "original": original,
            "reason": "当前位置文件已不存在（可能被用户手动移走）",
        })
        return

    # 原位置已被新文件占用 → 跳过加入 conflicts，不覆盖
    if os.path.exists(original):
        conflicts.append({
            "current": current,
            "original": original,
            "reason": "原位置已被其他文件占用，跳过避免覆盖",
        })
        return

    # 原源目录已被外部删除时，允许 os.makedirs 重建（撤销脚本的唯一例外）
    parent = os.path.dirname(original)
    if parent and not os.path.isdir(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError as e:
            conflicts.append({
                "current": current,
                "original": original,
                "reason": f"无法重建原父目录：{_classify_os_error(e)}",
            })
            return

    try:
        shutil.move(current, original)
    except (PermissionError, OSError) as e:
        conflicts.append({
            "current": current,
            "original": original,
            "reason": _classify_os_error(e),
        })
        return

    reversed_list.append({
        "from": current,
        "to": original,
        "status": "reversed",
    })


def _mark_history_reversed(history_path: str, metadata: dict, entries: list[dict]) -> None:
    """
    在历史文件 metadata 中追加 ``reversed_at`` 字段，标记该次操作已被撤销，
    后续再次执行 reverse 会被拒绝（撤销的撤销不支持）。
    """
    metadata["reversed_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    try:
        with open(history_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(metadata, ensure_ascii=False) + "\n")
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        # 标记失败不阻断流程，仅打印告警
        print(f"⚠️ 无法标记历史文件已撤销：{history_path}", file=sys.stderr)


def _rewrite_history_meta(history_path: str, metadata: dict, entries: list[dict]) -> bool:
    """
    用更新后的 metadata 重写历史文件第一行；保留所有 entries 不变。

    :param history_path: 历史 jsonl 绝对路径
    :param metadata: 更新后的 _meta 字典（必须含 _meta=True）
    :param entries: 原始反向 move 清单
    :returns: 重写是否成功
    """
    try:
        with open(history_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(metadata, ensure_ascii=False) + "\n")
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        return False
    return True


def _execute_cleanup(
    whitelist: list[str],
    history_path: str,
) -> dict:
    """
    受控删除阶段：白名单内的、运行时再次校验为空的目录调用 os.rmdir 删除。

    🚨 严禁调用 shutil.rmtree / os.remove / os.unlink / os.removedirs；
       仅允许 os.rmdir（目录非空时会抛 OSError）。

    :param whitelist: 历史 _meta.new_dirs_created 字段
    :param history_path: 历史 jsonl 路径（仅用于审计输出）
    :returns: 包含 cleaned_up / cleanup_skipped / total_attempted 三个字段的字典
    """
    cleaned_up: list[dict] = []
    cleanup_skipped: list[dict] = []
    # 把白名单转为集合用于成员校验，但保留有序列表用于遍历顺序
    whitelist_set = {item for item in whitelist if isinstance(item, str) and item}
    seen: set[str] = set()
    for raw_path in whitelist:
        if not isinstance(raw_path, str) or not raw_path:
            continue
        if raw_path in seen:
            continue
        seen.add(raw_path)
        normalized = _normalize_path_to_slash(raw_path)
        # 防注入：再次确认在白名单中（即便外部修改了 whitelist 副本，依旧二次确认）
        if raw_path not in whitelist_set:
            cleanup_skipped.append({
                "path": normalized,
                "reason": "not_in_whitelist",
            })
            continue
        if not os.path.isdir(raw_path):
            cleanup_skipped.append({
                "path": normalized,
                "reason": "directory_missing",
            })
            continue
        try:
            children = os.listdir(raw_path)
        except OSError as exc:
            cleanup_skipped.append({
                "path": normalized,
                "reason": f"listdir_error: {exc}",
            })
            continue
        if children:
            # 运行时再校验：ask_user 期间用户可能放入新文件
            cleanup_skipped.append({
                "path": normalized,
                "reason": "not_empty",
            })
            continue
        try:
            os.rmdir(raw_path)
        except OSError as exc:
            cleanup_skipped.append({
                "path": normalized,
                "reason": f"rmdir_failed: {_classify_os_error(exc)}",
            })
            continue
        cleaned_up.append({
            "path": normalized,
        })

    return {
        "history_file": history_path,
        "total_attempted": len(seen),
        "cleaned_up": cleaned_up,
        "cleanup_skipped": cleanup_skipped,
    }


def cleanup_empty_dirs(history_path: str) -> None:
    """
    受控删除模式入口：读取历史 jsonl 的白名单，对其中"仍为空"的目录执行 os.rmdir。

    :param history_path: 历史 jsonl 绝对路径
    """
    if not os.path.isfile(history_path):
        _emit_cleanup_error_and_exit(
            f"历史文件不存在：{history_path}",
            history_path,
        )

    metadata, entries = _load_history(history_path)

    if metadata.get("cleanup_executed_at"):
        _emit_cleanup_error_and_exit(
            f"该历史文件的受控删除已于 {metadata['cleanup_executed_at']} 执行过，"
            f"不允许重复触发",
            history_path,
        )

    whitelist = metadata.get("new_dirs_created") or []
    if not isinstance(whitelist, list):
        whitelist = []

    if not whitelist:
        # 旧版历史无白名单 → 直接拒绝，避免任何误删
        _emit_cleanup_error_and_exit(
            "历史文件 _meta.new_dirs_created 缺失或为空，受控删除拒绝执行",
            history_path,
        )

    print(f"🧹 进入受控删除模式：候选 {len(whitelist)} 个目录（仅删除仍为空的）")

    result = _execute_cleanup(whitelist, history_path)

    # 写入 cleanup_executed_at，避免重复触发
    metadata["cleanup_executed_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    if not _rewrite_history_meta(history_path, metadata, entries):
        print(f"⚠️ 无法在历史文件写入 cleanup_executed_at：{history_path}", file=sys.stderr)

    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(
        f"\n📊 清理完成：删除 {len(result['cleaned_up'])} / "
        f"跳过 {len(result['cleanup_skipped'])} / 共尝试 {result['total_attempted']}"
    )


def _emit_preview(metadata: dict, entries: list[dict], history_path: str) -> None:
    """仅预览反向清单（前 5 条 + 冲突预警），不执行任何文件操作。"""
    sample = entries[:5]
    conflict_warnings: list[str] = []
    for entry in entries:
        current = entry.get("source", "")
        original = entry.get("target", "")
        if original and os.path.exists(original):
            conflict_warnings.append(f"原位置已被占用：{original}")
        if current and not os.path.exists(current):
            conflict_warnings.append(f"当前位置文件已丢失：{current}")
    preview = {
        "history_file": history_path,
        "metadata": metadata,
        "total_entries": len(entries),
        "sample_entries": sample,
        "conflict_warnings": conflict_warnings[:10],
    }
    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(preview, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(f"\nℹ️ 预览模式：将撤销 {len(entries)} 条记录，"
          f"其中 {len(conflict_warnings)} 条存在冲突预警")


def reverse(history_path: str, preview_only: bool = False) -> None:
    """读取历史文件并执行（或预览）反向 move。"""
    if not os.path.isfile(history_path):
        _emit_error_and_exit(f"历史文件不存在：{history_path}")

    metadata, entries = _load_history(history_path)

    if not entries:
        _emit_error_and_exit("历史文件为空，没有可撤销的记录")

    # 撤销的撤销不支持
    if metadata.get("reversed_at"):
        _emit_error_and_exit(
            f"该次操作已于 {metadata['reversed_at']} 撤销过，"
            f"撤销操作本身不可再次撤销，请重新整理"
        )

    if preview_only:
        _emit_preview(metadata, entries, history_path)
        return

    print(f"🔄 开始撤销最近一次整理：共 {len(entries)} 条记录")
    if metadata.get("source_root"):
        print(f"   源目录：{metadata['source_root']}")
    if metadata.get("target_root"):
        print(f"   目标目录：{metadata['target_root']}")

    reversed_list: list[dict] = []
    conflicts: list[dict] = []
    not_found: list[dict] = []

    # 按时间逆序（先撤销最后搬运的项目，避免目录依赖错乱）
    for entry in reversed(entries):
        _reverse_one(entry, reversed_list, conflicts, not_found)

    # 标记历史已撤销（即使部分失败也标记，避免重复执行）
    _mark_history_reversed(history_path, metadata, entries)

    # 候选清空目录扫描：仅遍历历史白名单 _meta.new_dirs_created
    whitelist_raw = metadata.get("new_dirs_created") or []
    whitelist: list[str] = whitelist_raw if isinstance(whitelist_raw, list) else []
    cleanup_candidates, skipped_cleanup_candidates = _scan_cleanup_candidates(whitelist)

    result = {
        "history_file": history_path,
        "reversed_count": len(reversed_list),
        "conflicts_count": len(conflicts),
        "not_found_count": len(not_found),
        "reversed": reversed_list,
        "conflicts": conflicts,
        "not_found": not_found,
        "cleanup_candidates": cleanup_candidates,
        "skipped_cleanup_candidates": skipped_cleanup_candidates,
    }
    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(
        f"\n📊 撤销完成：成功 {len(reversed_list)} / "
        f"冲突 {len(conflicts)} / 找不到 {len(not_found)}"
    )
    if cleanup_candidates:
        print(
            f"🧺 检测到 {len(cleanup_candidates)} 个本次整理新建、撤销后已清空的目录，"
            f"可通过 --cleanup-empty-dirs 受控删除（需 ask_user 二次确认）"
        )


def main():
    parser = argparse.ArgumentParser(description="文件整理撤销脚本")
    parser.add_argument(
        "--history-file", default=None, dest="history_file",
        help="指定撤销的历史 jsonl 文件路径；不指定时使用 --latest 行为",
    )
    parser.add_argument(
        "--latest", action="store_true",
        help=f"撤销最近一次整理（在 {_HISTORY_LOOKBACK_DAYS} 天内查找最新历史文件）",
    )
    parser.add_argument(
        "--preview", action="store_true",
        help="仅预览反向清单（不执行任何文件操作）",
    )
    parser.add_argument(
        "--cleanup-empty-dirs", default=None, dest="cleanup_empty_dirs",
        help="受控删除模式：仅删除指定历史 jsonl 中 _meta.new_dirs_created 白名单内、"
             "且运行时仍为空的目录（os.rmdir）；必须经 ask_user 二次确认后才能调用",
    )
    args = parser.parse_args()

    # 受控删除模式优先级最高，且与其他模式互斥
    if args.cleanup_empty_dirs:
        cleanup_empty_dirs(history_path=args.cleanup_empty_dirs)
        return

    if args.history_file:
        history_path = args.history_file
    else:
        history_path = _find_latest_history()
        if not history_path:
            _emit_error_and_exit(
                f"未在 {_HISTORY_ROOT} 找到最近 {_HISTORY_LOOKBACK_DAYS} 天内的整理历史，"
                f"无法撤销"
            )

    reverse(history_path=history_path, preview_only=args.preview)


if __name__ == "__main__":
    main()
