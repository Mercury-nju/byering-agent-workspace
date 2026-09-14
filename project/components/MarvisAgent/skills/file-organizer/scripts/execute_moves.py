"""
execute_moves.py — 文件整理执行脚本
读取经 validate_plan.py 签名后的蓝图 JSON，执行物理搬运（仅 shutil.move）。

核心安全约束（永久红线）：
1. 启动时强制校验 _signature 字段（缺失 / 过期 / hash 不匹配 → 拒绝执行）。
2. 仅调用 shutil.move，严禁任何形式的删除（os.remove / os.unlink /
   shutil.rmtree / Path.unlink / 子进程 rm / Remove-Item / del 等）。
3. 每次 shutil.move 后立即做副作用验证（源消失 + 目标存在 + size 一致）。
4. stdout 输出结构化 JSON（含 success_count / failed_count / skipped_count），
   严禁仅以自由文本作为成功判据。
5. 完成后向 ~/.marvis/file-organizer/history/ 写入反向 move 清单，供
   reverse_moves.py 撤销使用。

用法：
    python execute_moves.py --plan <蓝图 JSON 路径>
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys
import uuid

# Windows 控制台默认 GBK 会让中文/emoji 输出失败，强制使用 UTF-8 避免子进程读取乱码
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

# 应用快捷方式扩展名（与 scan_files.py 保持一致）
_SKIP_EXTENSIONS = {".lnk", ".url", ".webloc", ".desktop"}

# 蓝图签名格式版本（必须与 validate_plan.py 一致）
_SIGNATURE_VERSION = "1.0"

# 蓝图签名有效期（小时）；超过此时长直接拒绝执行
_SIGNATURE_TTL_HOURS = 24

# 历史持久化根目录（用于撤销能力）
_HISTORY_ROOT = os.path.join(os.path.expanduser("~"), ".marvis", "file-organizer", "history")


def _emit_error_and_exit(reason: str, plan_path: str = "") -> None:
    """以非零退出码终止，并向 stdout 输出结构化 error JSON。"""
    error_payload = {
        "error": True,
        "reason": reason,
        "plan_path": plan_path,
        "success_count": 0,
        "failed_count": 0,
        "skipped_count": 0,
        "moved": [],
        "failed": [],
        "skipped": [],
    }
    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(error_payload, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")
    print(f"❌ 错误：{reason}", file=sys.stderr)
    sys.exit(1)


def _verify_signature(plan: dict, plan_path: str) -> None:
    """
    强制校验蓝图 _signature 字段；不通过则立即终止。

    校验规则：
    - 字段缺失 → 拒绝
    - validated_at 距今 > _SIGNATURE_TTL_HOURS → 拒绝
    - scan_result_hash 与同目录下扫描结果文件不一致 → 拒绝（需要扫描结果文件存在时）
    """
    signature = plan.get("_signature")
    if not isinstance(signature, dict):
        _emit_error_and_exit(
            "蓝图未经 file-organizer skill 注册（缺少 _signature 字段），禁止执行",
            plan_path,
        )

    version = signature.get("version", "")
    if version != _SIGNATURE_VERSION:
        _emit_error_and_exit(
            f"蓝图签名版本不兼容（期望 {_SIGNATURE_VERSION}，实际 {version!r}），请重新生成",
            plan_path,
        )

    validated_at = signature.get("validated_at", "")
    try:
        ts = datetime.datetime.fromisoformat(validated_at)
    except (TypeError, ValueError):
        _emit_error_and_exit(
            f"蓝图签名 validated_at 格式异常：{validated_at!r}，请重新生成",
            plan_path,
        )
    age_hours = (datetime.datetime.now() - ts).total_seconds() / 3600
    if age_hours > _SIGNATURE_TTL_HOURS:
        _emit_error_and_exit(
            f"蓝图已过期（生成于 {validated_at}，距今 {age_hours:.1f} 小时），请重新生成",
            plan_path,
        )

    # scan_result_hash 校验：优先按 signature.scan_result_path 精确定位扫描结果文件，
    # 仅当签名中未携带该字段时才回落到同目录默认文件名（兼容老蓝图）
    expected_hash = signature.get("scan_result_hash")
    if expected_hash:
        sig_scan_path = signature.get("scan_result_path")
        if sig_scan_path:
            # 新版签名：必须使用签名中绑定的精确扫描结果文件
            if not os.path.isfile(sig_scan_path):
                _emit_error_and_exit(
                    f"蓝图签名绑定的扫描结果文件已不存在：{sig_scan_path}，"
                    "请通过 use_skill 重新走 scan → validate 三步生成蓝图",
                    plan_path,
                )
            scan_file = sig_scan_path
        else:
            # 兼容老蓝图：回落到 plan 同目录下的默认命名候选
            plan_dir = os.path.dirname(os.path.abspath(plan_path))
            candidates = [
                os.path.join(plan_dir, "organizer_filelist.json"),
            ]
            scan_file = next((p for p in candidates if os.path.isfile(p)), None)
        if scan_file:
            actual_hash = _sha256_of_file(scan_file)
            if actual_hash != expected_hash:
                _emit_error_and_exit(
                    "蓝图与扫描结果不一致（scan_result_hash 校验失败），可能蓝图已被外部篡改，"
                    "请通过 use_skill 重新走 scan → validate 三步生成蓝图",
                    plan_path,
                )


def _sha256_of_file(path: str) -> str:
    """计算文件的 sha256，与 validate_plan._compute_scan_result_hash 一致。"""
    sha = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha.update(chunk)
    except OSError:
        return ""
    return sha.hexdigest()


def _paths_point_to_same(path_a: str, path_b: str) -> bool:
    """
    判定两个路径是否指向同一物理位置（防自合并 bug 的核心工具）。

    优先使用 ``os.path.samefile``（能同时处理符号链接 / 硬链接 / 大小写不敏感等场景）；
    该函数在跨卷 / 路径不存在 / 权限异常时会抛 OSError，此时降级为
    ``realpath + normcase`` 字符串比较。

    :param path_a: 路径 A
    :param path_b: 路径 B
    :returns: 两者指向同一物理位置返回 True，否则 False；任一路径为空也返回 False
    """
    if not path_a or not path_b:
        return False
    try:
        return os.path.samefile(path_a, path_b)
    except (OSError, ValueError):
        # 字符串降级路径：Windows 大小写不敏感由 normcase 统一处理
        try:
            return (
                os.path.normcase(os.path.realpath(path_a))
                == os.path.normcase(os.path.realpath(path_b))
            )
        except (OSError, ValueError):
            return False

def _safe_rename(target_dir: str, filename: str, src_path: str | None = None) -> str:
    """
    重名保护：若目标路径已存在同名文件/文件夹，自动重命名为 filename_(1).ext。
    返回最终不冲突的名称（不含目录）。

    🚨 防自合并 bug：当撞名的其实是「即将被搬运的源文件本身」（src_path 与同名路径
    指向同一物理位置）时，直接返回原名，避免把 foo.py 改名为 foo_(1).py 这种忪性循环。
    当调用方未传 src_path（旧调用保持向后兼容）时，沿用旧逻辑递增 _(N) 后缀。

    :param target_dir: 目标目录路径
    :param filename: 预期的文件名（不含目录）
    :param src_path: 可选，即将被 shutil.move 搬运的源路径（用于识别「撞的是自己」）
    :returns: 最终不冲突的文件名
    """
    base, ext = os.path.splitext(filename)
    candidate = filename
    counter = 1
    while os.path.exists(os.path.join(target_dir, candidate)):
        candidate_abs = os.path.join(target_dir, candidate)
        # 撞名者正是源文件自己 → 保持原名，由主调用方走 preserved 分支或原位覆写
        if src_path and _paths_point_to_same(candidate_abs, src_path):
            return candidate
        candidate = f"{base}_({counter}){ext}"
        counter += 1
    return candidate


def _classify_os_error(err: Exception) -> str:
    """
    将 OSError 分类为人类可读的原因字符串。
    Windows 的 WinError 32（被占用）、EBUSY、PermissionError 都映射为"被占用"原因。
    """
    if isinstance(err, PermissionError):
        return "文件被占用或无写入权限"
    winerror = getattr(err, "winerror", None)
    if winerror == 32:
        return "文件被其他程序占用（WinError 32）"
    errno = getattr(err, "errno", None)
    if errno is not None:
        # EBUSY=16, EACCES=13
        if errno in (13, 16):
            return f"文件被占用或权限不足（errno={errno}）"
    return str(err)


def _verify_move_side_effect(src: str, dst: str, original_size: int | None) -> tuple[bool, str]:
    """
    副作用验证：源路径不存在 + 目标路径存在 + 大小一致。
    Returns:
        (verified, reason) — verified=False 时 reason 给出具体未通过项。
    """
    if os.path.exists(src):
        return (False, f"源路径仍然存在：{src}")
    if not os.path.exists(dst):
        return (False, f"目标路径不存在：{dst}")
    if original_size is not None and os.path.isfile(dst):
        try:
            actual_size = os.path.getsize(dst)
        except OSError as e:
            return (False, f"无法读取目标大小：{e}")
        if actual_size != original_size:
            return (False, f"大小不一致（期望 {original_size}，实际 {actual_size}）")
    return (True, "")


def _merge_dir_contents(
    src_dir: str,
    dst_dir: str,
    moved: list[dict],
    failed: list[dict],
    skipped_runtime: list[dict],
) -> None:
    """
    将源文件夹内的所有文件逐一移入目标文件夹（内容合并模式）。
    子文件夹递归处理（保持目录结构），文件重名时自动重命名保护。

    🚨 重要：本函数严禁删除任何文件或目录（包括空源目录），合并后留下的空源
    文件夹由用户或独立的清理流程处理，整理流程不主动删除。

    🚨 防自合并 bug（纵深防御第二层）：入口处检查 src_dir 与 dst_dir 是否指向同一物理路径，
    是则立即 return，不进入 os.listdir / shutil.move 流程。递归子目录时同样检查。
    """
    # 入口防御：源 / 目标同一物理路径时不做任何事。listdir 升级为必须在此之后。
    if _paths_point_to_same(src_dir, dst_dir):
        return

    try:
        entries = os.listdir(src_dir)
    except (PermissionError, OSError) as e:
        failed.append({
            "source": src_dir,
            "target": dst_dir,
            "error": f"无法读取源文件夹：{_classify_os_error(e)}",
            "verified": False,
        })
        return

    for name in entries:
        child_src = os.path.join(src_dir, name)
        if os.path.isdir(child_src):
            child_dst_dir = os.path.join(dst_dir, name)
            # 递归防御：子目录与子目标同一物理路径时跳过递归
            if _paths_point_to_same(child_src, child_dst_dir):
                continue
            try:
                os.makedirs(child_dst_dir, exist_ok=True)
            except OSError as e:
                failed.append({
                    "source": child_src,
                    "target": child_dst_dir,
                    "error": f"无法创建目标子目录：{_classify_os_error(e)}",
                    "verified": False,
                })
                continue
            _merge_dir_contents(child_src, child_dst_dir, moved, failed, skipped_runtime)
        else:
            final_name = _safe_rename(dst_dir, name, src_path=child_src)
            dst_path = os.path.join(dst_dir, final_name)
            original_size = None
            try:
                original_size = os.path.getsize(child_src)
            except OSError:
                pass
            try:
                shutil.move(child_src, dst_path)
            except PermissionError as e:
                skipped_runtime.append({
                    "path": child_src,
                    "reason": _classify_os_error(e),
                })
                continue
            except OSError as e:
                if getattr(e, "winerror", None) == 32 or getattr(e, "errno", None) in (13, 16):
                    skipped_runtime.append({
                        "path": child_src,
                        "reason": _classify_os_error(e),
                    })
                    continue
                failed.append({
                    "source": child_src,
                    "target": dst_path,
                    "error": _classify_os_error(e),
                    "verified": False,
                })
                continue
            verified, reason = _verify_move_side_effect(child_src, dst_path, original_size)
            if verified:
                moved.append({
                    "source": child_src,
                    "target": dst_path,
                    "verified": True,
                    "status": "merged",
                })
            else:
                failed.append({
                    "source": child_src,
                    "target": dst_path,
                    "error": f"副作用验证失败：{reason}",
                    "verified": False,
                })


def _move_single_item(
    src: str,
    dst_dir: str,
    dst_name: str,
    moved: list[dict],
    failed: list[dict],
    skipped_runtime: list[dict],
    *,
    status_label: str = "moved",
) -> None:
    """将单个文件或文件夹移动到 dst_dir/dst_name，带重名保护、副作用验证与异常分类。"""
    try:
        os.makedirs(dst_dir, exist_ok=True)
    except OSError as e:
        failed.append({
            "source": src,
            "target": os.path.join(dst_dir, dst_name),
            "error": f"无法创建目标目录：{_classify_os_error(e)}",
            "verified": False,
        })
        return

    final_name = _safe_rename(dst_dir, dst_name, src_path=src)
    dst_path = os.path.join(dst_dir, final_name)
    original_size = None
    if os.path.isfile(src):
        try:
            original_size = os.path.getsize(src)
        except OSError:
            pass
    try:
        shutil.move(src, dst_path)
    except PermissionError as e:
        skipped_runtime.append({
            "path": src,
            "reason": _classify_os_error(e),
        })
        return
    except OSError as e:
        if getattr(e, "winerror", None) == 32 or getattr(e, "errno", None) in (13, 16):
            skipped_runtime.append({
                "path": src,
                "reason": _classify_os_error(e),
            })
            return
        failed.append({
            "source": src,
            "target": dst_path,
            "error": _classify_os_error(e),
            "verified": False,
        })
        return

    actual_status = status_label
    if final_name != dst_name:
        actual_status = "renamed"
    verified, reason = _verify_move_side_effect(src, dst_path, original_size)
    if verified:
        moved.append({
            "source": src,
            "target": dst_path,
            "verified": True,
            "status": actual_status,
        })
    else:
        failed.append({
            "source": src,
            "target": dst_path,
            "error": f"副作用验证失败：{reason}",
            "verified": False,
        })


def _detect_concentrated_skips(skipped_runtime: list[dict]) -> str | None:
    """
    检测 skipped_runtime 中是否存在"同一目录下连续 ≥3 个文件被占用"的情况。
    若命中则返回提示信息，否则返回 None。
    """
    if len(skipped_runtime) < 3:
        return None
    counter: dict[str, int] = {}
    for item in skipped_runtime:
        parent = os.path.dirname(item.get("path", ""))
        if parent:
            counter[parent] = counter.get(parent, 0) + 1
    hot_dirs = [d for d, c in counter.items() if c >= 3]
    if hot_dirs:
        return (
            f"以下目录下多个文件被占用，可能有应用程序正在使用，建议关闭相关程序后重试："
            f"{hot_dirs[:3]}"
        )
    return None


def _normalize_path_to_slash(path: str) -> str:
    """
    把路径统一为正斜杠形式，便于跨平台与文档规范保持一致。

    :param path: 任意原始路径字符串
    :returns: 使用正斜杠分隔的等价路径
    """
    return path.replace("\\", "/")


def _persist_history(
    plan_path: str,
    plan: dict,
    moved: list[dict],
    new_dirs_created: list[str] | None = None,
) -> str | None:
    """
    把反向 move 清单写入 ~/.marvis/file-organizer/history/<时间戳>_<plan-id>.jsonl。
    每行一条 JSON：{"source": <目标路径>, "target": <原源路径>, ...}
    供 reverse_moves.py 撤销使用。

    :param plan_path: 蓝图文件路径
    :param plan: 蓝图内容字典
    :param moved: 已成功搬运的清单
    :param new_dirs_created: 本次整理实际新建的目录绝对路径列表（撤销时白名单）
    :returns: 历史文件的绝对路径；写入失败时返回 None
    """
    if not moved:
        return None
    try:
        os.makedirs(_HISTORY_ROOT, exist_ok=True)
    except OSError:
        return None

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    plan_id = uuid.uuid4().hex[:8]
    history_path = os.path.join(_HISTORY_ROOT, f"{timestamp}_{plan_id}.jsonl")

    # 路径规范化为正斜杠（与 SKILL.md 规范一致），即便清单为空也写空数组以保持字段稳定
    normalized_new_dirs = [_normalize_path_to_slash(p) for p in (new_dirs_created or [])]

    # 反向记录过滤：status == "preserved" 的条目从未发生物理搬运，不能污染撤销 jsonl
    reverse_items = [item for item in moved if item.get("status") != "preserved"]

    executed_at = datetime.datetime.now().isoformat(timespec="seconds")
    try:
        with open(history_path, "w", encoding="utf-8") as f:
            # 第一行写 metadata，便于撤销时识别；moved_count 仅计实际反向 entry 数以使对账一致
            metadata = {
                "_meta": True,
                "plan_path": plan_path,
                "source_root": plan.get("source_root", ""),
                "target_root": plan.get("target_root", ""),
                "executed_at": executed_at,
                "moved_count": len(reverse_items),
                "new_dirs_created": normalized_new_dirs,
            }
            f.write(json.dumps(metadata, ensure_ascii=False) + "\n")
            # 每条实际搬运写入反向记录（source=目标，target=原源）
            for item in reverse_items:
                reverse_entry = {
                    "source": item["target"],   # 当前位置（目标）
                    "target": item["source"],   # 原始位置（源）
                    "executed_at": executed_at,
                    "status": item.get("status", "moved"),
                }
                f.write(json.dumps(reverse_entry, ensure_ascii=False) + "\n")
    except OSError:
        return None
    return history_path


def execute(plan_path: str) -> None:
    """读取签名后的蓝图 JSON 并执行物理搬运。"""
    if not os.path.exists(plan_path):
        _emit_error_and_exit(f"蓝图文件不存在：{plan_path}", plan_path)

    try:
        with open(plan_path, "r", encoding="utf-8") as f:
            plan = json.load(f)
    except json.JSONDecodeError as e:
        _emit_error_and_exit(f"蓝图 JSON 格式错误：{e}", plan_path)

    # 强制签名校验（缺失/过期/hash 不匹配均拒绝）
    _verify_signature(plan, plan_path)

    source_root: str = plan.get("source_root", "")
    target_root: str = plan.get("target_root", "")
    move_items: list[dict] = plan.get("move", [])
    skipped_from_plan: list[dict] = list(plan.get("skipped", []))
    new_dirs: list[str] = plan.get("new_dirs", [])

    moved: list[dict] = []
    failed: list[dict] = []
    skipped_runtime: list[dict] = []

    if not move_items:
        # 仍然输出结构化 JSON，避免 file-agent 把"没有可移动文件"误判为执行失败
        result = {
            "success_count": 0,
            "failed_count": 0,
            "skipped_count": len(skipped_from_plan),
            "moved": [],
            "failed": [],
            "skipped": skipped_from_plan,
            "skipped_at_runtime": [],
            "history_file": None,
            "plan_path": plan_path,
            "message": "蓝图中没有可移动的文件，任务结束",
        }
        print("--- JSON_OUTPUT_START ---")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("--- JSON_OUTPUT_END ---")
        return

    print("🚀 开始执行文件整理...")

    # 创建所有需要的目标目录（new_dirs 是相对于 target_root 的相对路径）
    # 仅把"本次实际新建"的目录绝对路径加入白名单，避免把用户原有目录误纳入
    new_dirs_created: list[str] = []
    for d in new_dirs:
        abs_dir = os.path.join(target_root, d)
        already_exists = os.path.isdir(abs_dir)
        try:
            os.makedirs(abs_dir, exist_ok=True)
        except OSError as e:
            failed.append({
                "source": "",
                "target": abs_dir,
                "error": f"无法创建新目录：{_classify_os_error(e)}",
                "verified": False,
            })
            continue
        if not already_exists and abs_dir not in new_dirs_created:
            new_dirs_created.append(abs_dir)

    for i, item in enumerate(move_items):
        try:
            source_rel = item["source"]
            target_rel = item["target"]
        except KeyError as e:
            failed.append({
                "source": f"第{i + 1}条记录",
                "target": "",
                "error": f"缺少字段 {e}",
                "verified": False,
            })
            continue

        src = os.path.join(source_root, source_rel)

        # 兜底防御：跳过混入蓝图的快捷方式
        _, ext = os.path.splitext(source_rel)
        if ext.lower() in _SKIP_EXTENSIONS and os.path.isfile(src):
            skipped_from_plan.append({
                "path": source_rel,
                "reason": f"快捷方式文件（{ext}），已自动跳过",
            })
            continue

        if not os.path.exists(src):
            failed.append({
                "source": src,
                "target": target_rel,
                "error": "源路径不存在（可能已被移动）",
                "verified": False,
            })
            continue

        # 计算 dst_abs：需区分 dir / file 两种获取方式（以便下面同一逻辑做 samefile 早返回）
        if os.path.isdir(src):
            target_rel_clean = target_rel.rstrip("/")
            dst_abs = os.path.join(target_root, target_rel_clean)
        else:
            dst_abs = os.path.join(target_root, target_rel)

        # 🚨 防自合并 bug（主循环防御第一层）：优先识别上游 validate_plan.py 打上的
        # _in_place 标记；未打标时再用 _paths_point_to_same 做运行时侍以重肉。
        in_place_flag = bool(item.get("_in_place"))
        if in_place_flag or _paths_point_to_same(src, dst_abs):
            moved.append({
                "source": src,
                "target": dst_abs,
                "verified": True,
                "status": "preserved",
            })
            continue

        if os.path.isdir(src):
            if os.path.isdir(dst_abs):
                # 目标已有同名文件夹（且不是同一物理路径）→ 内容合并（严禁 rmtree 目标目录）
                _merge_dir_contents(src, dst_abs, moved, failed, skipped_runtime)
            else:
                target_rel_clean = target_rel.rstrip("/")
                parent_rel = os.path.dirname(target_rel_clean)
                dst_dir = os.path.join(target_root, parent_rel) if parent_rel else target_root
                dst_name = os.path.basename(target_rel_clean)
                _move_single_item(
                    src, dst_dir, dst_name,
                    moved, failed, skipped_runtime,
                    status_label="moved",
                )
        else:
            dst_dir = os.path.dirname(dst_abs)
            dst_name = os.path.basename(dst_abs)
            _move_single_item(
                src, dst_dir, dst_name,
                moved, failed, skipped_runtime,
                status_label="moved",
            )

    # 写入历史持久化文件（供撤销使用），同时持久化白名单
    history_path = _persist_history(plan_path, plan, moved, new_dirs_created)

    # 检测占用文件集中目录提示
    concentrated_hint = _detect_concentrated_skips(skipped_runtime)

    skipped_combined = list(skipped_from_plan)

    # 原位保留状态计数（供 file-agent 与用户报告独立展示）
    preserved_count = sum(1 for m in moved if m.get("status") == "preserved")

    result = {
        "success_count": len(moved),
        "failed_count": len(failed),
        "skipped_count": len(skipped_combined) + len(skipped_runtime),
        "preserved_count": preserved_count,
        "moved": moved,
        "failed": failed,
        "skipped": skipped_combined,
        "skipped_at_runtime": skipped_runtime,
        "history_file": history_path,
        "plan_path": plan_path,
        "concentrated_skip_hint": concentrated_hint,
    }

    print("--- JSON_OUTPUT_START ---")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("--- JSON_OUTPUT_END ---")

    # 人类可读摘要（供调试，不作为 file-agent 判据）
    print(
        f"\n📊 执行完成：成功 {len(moved)}（含原位保留 {preserved_count}） / "
        f"失败 {len(failed)} / 跳过 {len(skipped_combined) + len(skipped_runtime)}"
    )
    if history_path:
        print(f"📝 历史记录已保存（撤销可用）：{history_path}")
    if concentrated_hint:
        print(f"💡 提示：{concentrated_hint}")

    # 🚨🚨🚨 严禁删除蓝图或任何文件（不再尝试 os.remove(plan_path)）
    # 中间产物清理由调用方或独立流程负责，整理流程不主动删除
    print(f"\nℹ️ 蓝图文件已保留：{plan_path}")


def main():
    parser = argparse.ArgumentParser(description="文件整理执行脚本")
    parser.add_argument(
        "--plan", required=True,
        help="经 validate_plan.py 校验签名后的蓝图 JSON 路径",
    )
    args = parser.parse_args()
    execute(plan_path=args.plan)


if __name__ == "__main__":
    main()
