"""接受 DOCX 文件中所有修订的工具，使用 Microsoft Word COM 自动化。"""

import argparse
import shutil
from pathlib import Path


def accept_changes(
    input_file: str,
    output_file: str,
) -> tuple[None, str]:
    """接受 DOCX 文件中的所有修订。

    :param input_file: 带有修订的输入 DOCX 文件
    :param output_file: 输出 DOCX 文件（干净，无修订）
    :return: (None, 结果消息)
    """
    input_path = Path(input_file)
    output_path = Path(output_file)

    if not input_path.exists():
        return None, f"Error: Input file not found: {input_file}"

    if not input_path.suffix.lower() == ".docx":
        return None, f"Error: Input file is not a DOCX file: {input_file}"

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(input_path, output_path)
    except Exception as e:
        return None, f"Error: Failed to copy input file to output location: {e}"

    return _accept_changes_word_com(output_path, input_file, output_file)


def _accept_changes_word_com(
    output_path: Path,
    input_file: str,
    output_file: str,
) -> tuple[None, str]:
    """使用 Microsoft Word COM 接受所有修订。"""
    try:
        import win32com.client  # type: ignore[import-untyped]
    except ImportError:
        return None, (
            "Error: Windows 上需要安装 pywin32。请运行: pip install pywin32"
        )

    word = None
    doc = None
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = False

        doc = word.Documents.Open(str(output_path.resolve()))
        doc.AcceptAllRevisions()
        doc.Save()
        doc.Close(False)
        doc = None

        return (
            None,
            f"Successfully accepted all tracked changes: {input_file} -> {output_file}",
        )
    except Exception as exc:
        return None, f"Error: Word COM 接受修订失败: {exc}"
    finally:
        if doc is not None:
            try:
                doc.Close(False)
            except Exception:
                pass
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Accept all tracked changes in a DOCX file"
    )
    parser.add_argument("input_file", help="Input DOCX file with tracked changes")
    parser.add_argument(
        "output_file", help="Output DOCX file (clean, no tracked changes)"
    )
    args = parser.parse_args()

    _, message = accept_changes(args.input_file, args.output_file)
    print(message)

    if "Error" in message:
        raise SystemExit(1)
