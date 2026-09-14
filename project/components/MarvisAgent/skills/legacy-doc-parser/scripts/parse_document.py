#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Universal legacy document parser.
Supports: .doc, .ppt, .xls, .wps, .wpt, .dps, .dpt, .et, .ett, .csv, .tsv, .xsv

Usage:
    python parse_document.py <filepath> [--extract-images <output_dir>] [--summary] [--meta]

Outputs extracted text to stdout as Markdown.
  --extract-images DIR   Save images to the given directory
  --summary              Output only first 50 lines (for large files)
  --meta                 Include file metadata (author, dates, etc.)
"""

# ╔════════════════════════════════════════════════════════════════════════╗
# ║ CRITICAL: Force UTF-8 on Windows BEFORE any I/O or other imports.   ║
# ║ Without this, Chinese/Japanese/Korean text will be garbled on       ║
# ║ Windows where the default console encoding is GBK (cp936).         ║
# ╚════════════════════════════════════════════════════════════════════════╝
import sys
import os

# Set PYTHONUTF8 for any child processes we might spawn
os.environ['PYTHONUTF8'] = '1'
# Also set PYTHONIOENCODING as a belt-and-suspenders approach
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

# Force stdout/stderr to UTF-8 immediately (before any print)
# On Windows, sys.stdout.reconfigure() alone is not enough when output is piped
# to a parent process that reads with system default encoding (GBK/cp936).
# We need to ensure the underlying binary buffer writes UTF-8 bytes.
if sys.platform == 'win32':
    try:
        # Replace stdout/stderr with UTF-8 writers that write directly to the binary buffer
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True)
    except Exception:
        # Fallback: try reconfigure
        try:
            if hasattr(sys.stdout, 'reconfigure'):
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            if hasattr(sys.stderr, 'reconfigure'):
                sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        ctypes.windll.kernel32.SetConsoleCP(65001)
    except Exception:
        pass
else:
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    if hasattr(sys.stderr, 'reconfigure'):
        try:
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

import struct
import re
import csv
import argparse
import platform


# ──────────────────── Format Detection ────────────────────

def detect_format(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    format_map = {
        '.doc': 'ole_doc', '.wps': 'ole_doc', '.wpt': 'ole_doc',
        '.ppt': 'ole_ppt', '.dps': 'ole_ppt', '.dpt': 'ole_ppt',
        '.xls': 'ole_xls', '.et': 'ole_xls', '.ett': 'ole_xls',
        '.csv': 'csv', '.tsv': 'tsv', '.xsv': 'xsv',
    }
    return format_map.get(ext, 'unknown'), ext


# ──────────────────── Encoding Detection ────────────────────

def detect_encoding(filepath):
    """Detect file encoding with fallback chain."""
    try:
        import chardet
        with open(filepath, 'rb') as f:
            raw = f.read(min(os.path.getsize(filepath), 100000))
        result = chardet.detect(raw)
        if result and result.get('encoding') and result.get('confidence', 0) > 0.5:
            return result['encoding']
    except ImportError:
        pass

    # Manual fallback: try common encodings
    for enc in ['utf-8-sig', 'utf-8', 'gbk', 'gb2312', 'gb18030', 'big5', 'shift_jis', 'latin-1']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                f.read(4096)
            return enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 'utf-8'


# ──────────────────── OLE Metadata ────────────────────

def extract_ole_metadata(ole):
    """Extract metadata from OLE SummaryInformation stream."""
    meta = {}
    try:
        si = ole.get_metadata()
        
        # Safe attribute access with encoding handling
        attrs = [
            ('author', 'Author'),
            ('last_saved_by', 'Last Saved By'), 
            ('title', 'Title'),
            ('subject', 'Subject'),
            ('create_time', 'Created'),
            ('last_save_time', 'Modified'),
            ('num_pages', 'Pages'),
            ('num_words', 'Words')
        ]
        
        for attr_name, display_name in attrs:
            try:
                if hasattr(si, attr_name):
                    value = getattr(si, attr_name)
                    if value:
                        # Handle different types of values
                        if isinstance(value, (bytes, bytearray)):
                            try:
                                # Try UTF-8 first, then GBK for Chinese content
                                try:
                                    value = value.decode('utf-8', errors='replace')
                                except:
                                    value = value.decode('gbk', errors='replace')
                            except:
                                value = str(value, errors='replace')
                        elif hasattr(value, '__str__'):
                            value = str(value)
                        
                        # Skip obviously corrupted metadata
                        if len(str(value)) > 500:  # Too long, likely corrupted
                            continue
                            
                        # Check for obvious encoding corruption indicators
                        if any(ord(c) > 1000 for c in str(value)[:100]):
                            # Contains high Unicode codepoints, likely corrupted
                            continue
                            
                        meta[display_name] = value
            except Exception:
                continue
                
    except Exception as e:
        # Minimal fallback - don't show encoding error details to user
        pass
    return meta


def format_metadata(meta):
    if not meta:
        return ""
    lines = ["## Metadata", ""]
    for k, v in meta.items():
        lines.append(f"- **{k}**: {v}")
    lines.append("")
    return '\n'.join(lines)


# ──────────────────── CSV/TSV/XSV ────────────────────

def parse_delimited(filepath, fmt):
    delimiters = {'csv': ',', 'tsv': '\t', 'xsv': '|'}
    delimiter = delimiters.get(fmt, ',')

    # Detect encoding
    encoding = detect_encoding(filepath)

    # Auto-detect delimiter for xsv
    if fmt == 'xsv':
        with open(filepath, 'r', encoding=encoding) as f:
            first_line = f.readline()
        for d in ['|', ';', '\t', ',']:
            if d in first_line:
                delimiter = d
                break

    rows = []
    with open(filepath, 'r', encoding=encoding) as f:
        reader = csv.reader(f, delimiter=delimiter)
        for row in reader:
            rows.append(row)

    if not rows:
        return "Empty file"

    # Format as markdown table
    header = rows[0]
    lines = ['| ' + ' | '.join(h.strip() for h in header) + ' |']
    lines.append('| ' + ' | '.join(['---'] * len(header)) + ' |')
    for row in rows[1:]:
        while len(row) < len(header):
            row.append('')
        lines.append('| ' + ' | '.join(c.strip() for c in row[:len(header)]) + ' |')

    return '\n'.join(lines)


# ──────────────────── Platform-aware HTML conversion ────────────────────

def try_convert_to_html(filepath):
    """Try to convert .doc/.wps/.wpt to HTML using macOS textutil.
    Returns HTML file path on success, None on failure.
    Only works on macOS (textutil is a built-in system tool)."""
    if platform.system() != 'Darwin':
        return None

    import subprocess
    import tempfile

    tmp_html = os.path.join(tempfile.gettempdir(), 'legacy_doc_parser_tmp.html')
    try:
        result = subprocess.run(
            ['textutil', '-convert', 'html', filepath, '-output', tmp_html],
            capture_output=True, timeout=30
        )
        if result.returncode == 0 and os.path.exists(tmp_html) and os.path.getsize(tmp_html) > 100:
            return tmp_html
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return None


def _clean_text(text):
    """Clean extracted text: remove null bytes, normalize whitespace."""
    # Remove null bytes (common artifact in OLE/textutil output)
    text = text.replace('\x00', '')
    # Normalize multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_html_to_text(html_path):
    """Extract text from HTML, try BeautifulSoup first, fallback to regex.

    Key: extract text per-paragraph (p/div/li/h1-h6) to preserve sentence
    integrity. Inline elements (span/b/i/u/a/em/strong) within a paragraph
    are concatenated WITHOUT newlines so formatted runs stay on one line.
    """
    with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
        html_content = f.read()

    try:
        from bs4 import BeautifulSoup, NavigableString
        soup = BeautifulSoup(html_content, 'html.parser')

        # Remove style/script
        for tag in soup.find_all(['style', 'script']):
            tag.decompose()

        # Extract tables as markdown first, then remove them from DOM
        tables_md = []
        for table in soup.find_all('table'):
            rows = []
            for tr in table.find_all('tr'):
                cells = [td.get_text(strip=True) for td in tr.find_all(['td', 'th'])]
                if cells:
                    rows.append(cells)
            if rows:
                max_cols = max(len(r) for r in rows)
                header = rows[0]
                while len(header) < max_cols:
                    header.append('')
                md_lines = ['| ' + ' | '.join(header) + ' |']
                md_lines.append('| ' + ' | '.join(['---'] * max_cols) + ' |')
                for row in rows[1:]:
                    while len(row) < max_cols:
                        row.append('')
                    md_lines.append('| ' + ' | '.join(row[:max_cols]) + ' |')
                tables_md.append('\n'.join(md_lines))
            table.decompose()

        # Extract text paragraph by paragraph
        # Block-level tags that should produce line breaks between them
        block_tags = {'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                      'tr', 'blockquote', 'pre', 'dt', 'dd', 'section', 'article'}

        paragraphs = []
        body = soup.find('body') or soup

        # Replace <br> with a space so inline breaks don't merge adjacent words
        for br in body.find_all('br'):
            br.replace_with(' ')

        for elem in body.find_all(block_tags):
            # get_text with empty separator → inline spans stay joined naturally
            para_text = elem.get_text('', strip=False)
            # Collapse ALL internal whitespace (including newlines within a paragraph)
            para_text = re.sub(r'\s+', ' ', para_text).strip()
            if para_text:
                paragraphs.append(para_text)

        # If no block-level elements found, fall back to whole-body extraction
        if not paragraphs:
            # Insert newlines at <br> tags
            for br in soup.find_all('br'):
                br.replace_with('\n')
            text = body.get_text('', strip=False)
            text = re.sub(r'[ \t]+', ' ', text).strip()
            paragraphs = [line.strip() for line in text.split('\n') if line.strip()]

        text = '\n'.join(paragraphs)
        if tables_md:
            text += '\n\n' + '\n\n'.join(tables_md)
        return _clean_text(text)

    except ImportError:
        pass

    # Regex fallback
    text = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    return _clean_text(text)


# ──────────────────── OLE Document (.doc/.wps/.wpt) ────────────────────

def _extract_doc_text_from_ole(ole):
    """Extract text from a Word .doc OLE file by parsing the FIB and text stream.

    Reads the WordDocument stream FIB to find the text start/length in the
    appropriate table stream (0Table or 1Table), handling both Word 97+ and
    Word 6/95 formats, as well as complex (fast-saved) documents.

    Returns extracted text string, or empty string on failure.
    """
    try:
        if not ole.exists('WordDocument'):
            return ""
        word_doc = ole.openstream('WordDocument').read()
        if len(word_doc) < 68:
            return ""

        # Read FIB base
        # wIdent at offset 0 (2 bytes) - magic number
        wIdent = struct.unpack_from('<H', word_doc, 0)[0]
        # nFib at offset 2 (2 bytes) - version
        nFib = struct.unpack_from('<H', word_doc, 2)[0]

        # Check if Word 6/95 (nFib < 193 i.e. pre-Word97)
        if nFib < 193 or wIdent != 0xA5EC:
            # Word 6/95: text is in WordDocument stream directly
            # fcMin at offset 24, ccpText at offset 76 (in older FIB)
            if len(word_doc) < 80:
                return ""
            try:
                fcMin = struct.unpack_from('<I', word_doc, 24)[0]
                ccpText = struct.unpack_from('<I', word_doc, 76)[0]
                if ccpText > 0 and fcMin + ccpText <= len(word_doc):
                    raw = word_doc[fcMin:fcMin + ccpText]
                    # Word 6/95 uses single-byte encoding (typically cp1252 or cp1251)
                    for enc in ['cp1252', 'cp1251', 'latin-1']:
                        try:
                            text = raw.decode(enc, errors='replace')
                            # Replace paragraph marks
                            text = text.replace('\r\n', '\n').replace('\r', '\n')
                            # Remove control chars except newline/tab
                            text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
                            if text.strip():
                                return text.strip()
                        except Exception:
                            continue
            except Exception:
                pass
            return ""

        # Word 97+: read FIB fields
        # flags at offset 10
        flags = struct.unpack_from('<H', word_doc, 10)[0]
        fWhichTblStm = (flags >> 9) & 1  # which table stream: 0=0Table, 1=1Table
        fComplex = (flags >> 2) & 1  # complex (fast-saved) document

        table_name = '1Table' if fWhichTblStm else '0Table'
        if not ole.exists(table_name):
            # Try the other table
            table_name = '0Table' if fWhichTblStm else '1Table'
            if not ole.exists(table_name):
                return ""

        table_stream = ole.openstream(table_name).read()

        # Read CLX (complex) from FIB
        # fcClx at offset 418, lcbClx at offset 422 (in FibRgFcLcb97)
        if len(word_doc) < 426:
            return ""
        fcClx = struct.unpack_from('<I', word_doc, 418)[0]
        lcbClx = struct.unpack_from('<I', word_doc, 422)[0]

        if lcbClx == 0 or fcClx + lcbClx > len(table_stream):
            # No CLX, try simple text extraction from ccpText
            # ccpText at FIB offset 76 (FibRgLw97.ccpText)
            if len(word_doc) < 80:
                return ""
            ccpText = struct.unpack_from('<I', word_doc, 76)[0]
            # fcMin from CLX or direct
            # For non-complex docs, text starts at offset in WordDocument
            return ""

        clx_data = table_stream[fcClx:fcClx + lcbClx]

        # Parse CLX: skip Prc (prefix 0x01) entries, find Pcdt (prefix 0x02)
        pos = 0
        pieces = []
        while pos < len(clx_data):
            clxt = clx_data[pos]
            if clxt == 0x01:  # Prc
                if pos + 3 > len(clx_data):
                    break
                cb = struct.unpack_from('<H', clx_data, pos + 1)[0]
                pos += 3 + cb
            elif clxt == 0x02:  # Pcdt
                if pos + 5 > len(clx_data):
                    break
                lcb = struct.unpack_from('<I', clx_data, pos + 1)[0]
                pcdt_data = clx_data[pos + 5:pos + 5 + lcb]
                # Parse PlcPcd: array of CPs followed by array of Pcds
                # Number of pieces = (lcb - 4) / (4 + 8) ... each CP is 4 bytes, each Pcd is 8 bytes
                # Actually: n+1 CPs (4 bytes each) + n Pcds (8 bytes each) = lcb
                # So: 4*(n+1) + 8*n = lcb → 12n + 4 = lcb → n = (lcb - 4) / 12
                if lcb < 16:
                    break
                n = (lcb - 4) // 12
                if n <= 0:
                    break

                # Read CPs
                cps = []
                for i in range(n + 1):
                    if 4 * i + 4 > len(pcdt_data):
                        break
                    cp = struct.unpack_from('<I', pcdt_data, 4 * i)[0]
                    cps.append(cp)

                # Read Pcds
                pcd_offset = 4 * (n + 1)
                for i in range(n):
                    if pcd_offset + 8 * i + 8 > len(pcdt_data):
                        break
                    pcd_data = pcdt_data[pcd_offset + 8 * i:pcd_offset + 8 * i + 8]
                    # Pcd: 2 bytes flags, 4 bytes fc, 2 bytes prm
                    fc_compressed = struct.unpack_from('<I', pcd_data, 2)[0]
                    fCompressed = (fc_compressed >> 30) & 1
                    fc = fc_compressed & 0x3FFFFFFF

                    cp_start = cps[i] if i < len(cps) else 0
                    cp_end = cps[i + 1] if i + 1 < len(cps) else cp_start
                    char_count = cp_end - cp_start

                    if fCompressed:
                        # Single-byte (cp1252), fc/2 is the real offset
                        byte_offset = fc // 2
                        byte_len = char_count
                        if byte_offset + byte_len <= len(word_doc):
                            raw = word_doc[byte_offset:byte_offset + byte_len]
                            pieces.append(raw.decode('cp1252', errors='replace'))
                    else:
                        # UTF-16LE
                        byte_len = char_count * 2
                        if fc + byte_len <= len(word_doc):
                            raw = word_doc[fc:fc + byte_len]
                            pieces.append(raw.decode('utf-16-le', errors='replace'))
                break
            else:
                break

        if pieces:
            full_text = ''.join(pieces)

            # FibRgLw97: ccpText(76), ccpFtn(80), ccpHdd(84), ccpMcr(88),
            #            ccpAtn(92), ccpEdn(96), ccpTxbx(100), ccpHdrTxbx(104)
            ccp_text = struct.unpack_from('<I', word_doc, 76)[0] if len(word_doc) > 80 else len(full_text)
            ccp_ftn = struct.unpack_from('<I', word_doc, 80)[0] if len(word_doc) > 84 else 0
            ccp_hdd = struct.unpack_from('<I', word_doc, 84)[0] if len(word_doc) > 88 else 0
            # skip ccpMcr(88) and ccpAtn(92) - macros and annotations
            ccp_edn = struct.unpack_from('<I', word_doc, 96)[0] if len(word_doc) > 100 else 0

            # Extract main text, footnotes, endnotes, headers
            parts = []

            # Main body text
            main_text = full_text[:ccp_text] if ccp_text <= len(full_text) else full_text
            main_text = main_text.replace('\r\n', '\n').replace('\r', '\n')
            main_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', main_text)
            if main_text.strip():
                parts.append(main_text.strip())

            # Footnotes
            ftn_start = ccp_text + 1  # +1 for separator char
            if ccp_ftn > 1 and ftn_start + ccp_ftn <= len(full_text):
                ftn_text = full_text[ftn_start:ftn_start + ccp_ftn - 1]
                ftn_text = ftn_text.replace('\r\n', '\n').replace('\r', '\n')
                ftn_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', ftn_text)
                if ftn_text.strip():
                    parts.append(ftn_text.strip())

            # Headers/footers
            hdd_start = ftn_start + ccp_ftn
            if ccp_hdd > 1 and hdd_start + ccp_hdd <= len(full_text):
                hdd_text = full_text[hdd_start:hdd_start + ccp_hdd - 1]
                hdd_text = hdd_text.replace('\r\n', '\n').replace('\r', '\n')
                hdd_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', hdd_text)
                if hdd_text.strip():
                    parts.append(hdd_text.strip())

            # Endnotes
            edn_start = hdd_start + ccp_hdd + 4 + 4  # skip ccpMcr + ccpAtn sections
            # More precise: edn_start = ccp_text + ccp_ftn + ccp_hdd + ccpMcr + ccpAtn + 1*(for each section separator)
            # Simpler approach: search for endnote text in the full text
            if ccp_edn > 1:
                ccp_mcr = struct.unpack_from('<I', word_doc, 88)[0] if len(word_doc) > 92 else 0
                ccp_atn = struct.unpack_from('<I', word_doc, 92)[0] if len(word_doc) > 96 else 0
                edn_start = ccp_text + ccp_ftn + ccp_hdd + ccp_mcr + ccp_atn
                if edn_start + ccp_edn <= len(full_text):
                    edn_text = full_text[edn_start:edn_start + ccp_edn]
                    edn_text = edn_text.replace('\r\n', '\n').replace('\r', '\n')
                    edn_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', edn_text)
                    if edn_text.strip():
                        parts.append(edn_text.strip())

            result = '\n'.join(parts)
            if result.strip():
                return result.strip()

        return ""
    except Exception:
        return ""

def _try_win32com(filepath):
    """Try to extract text using Word COM automation (Windows only).

    Requires Microsoft Office or WPS Office installed. Uses the real Word engine
    for highest-quality text extraction with full CJK support, formatting, tables,
    headers/footers, etc. Returns extracted text or empty string.
    """
    if platform.system() != 'Windows':
        return ""
    try:
        import win32com.client
    except ImportError:
        # pywin32 not installed — try auto-install
        try:
            import subprocess as _sp
            _sp.run([sys.executable, '-m', 'pip', 'install', 'pywin32', '-q'],
                    capture_output=True, timeout=120)
            import win32com.client
        except Exception:
            return ""

    word = None
    doc = None
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = False
        # Word COM requires absolute path
        abs_path = os.path.abspath(filepath)
        doc = word.Documents.Open(abs_path, ReadOnly=True, AddToRecentFiles=False)
        text = doc.Content.Text
        if text and isinstance(text, str):
            return text.strip()
        return ""
    except Exception:
        return ""
    finally:
        try:
            if doc:
                doc.Close(False)
        except Exception:
            pass
        try:
            if word:
                word.Quit()
        except Exception:
            pass


def _try_doc2txt(filepath):
    """Try to extract text using doc2txt (pip package with bundled antiword).

    Works on Windows, Linux, and macOS ARM64 without any external install
    beyond 'pip install doc2txt'. Returns extracted text or empty string.
    If doc2txt is not installed, attempts to install it automatically.
    """
    try:
        from doc2txt import extract_text
    except ImportError:
        # Auto-install doc2txt
        try:
            import subprocess as _sp
            _sp.run([sys.executable, '-m', 'pip', 'install', 'doc2txt', '-q'],
                    capture_output=True, timeout=60)
            from doc2txt import extract_text
        except Exception:
            extract_text = None

    if extract_text:
        try:
            text = extract_text(filepath)
            if text and isinstance(text, (str, bytes)):
                if isinstance(text, bytes):
                    text = text.decode('utf-8', errors='replace')
                text = text.strip()
                if text:
                    return text
        except Exception:
            pass

    # Also try pyantiword as alternative
    try:
        from pyantiword.antiword_wrapper import extract_text as pyantiword_extract
        text = pyantiword_extract(filepath)
        if text and isinstance(text, (str, bytes)):
            if isinstance(text, bytes):
                text = text.decode('utf-8', errors='replace')
            text = text.strip()
            if text:
                return text
    except ImportError:
        pass
    except Exception:
        pass

    return ""


def _try_parse_word2(filepath):
    """Try to parse pre-OLE Word formats (Word 2.0, Word 5.0).

    Word 2.0 files have magic 0xA5DB (LE) at offset 0. Text is stored as
    single-byte encoded data starting at the offset specified by fcMin (offset 24
    in the FIB). The length extends to fcMac.
    """
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
        if len(data) < 128:
            return ""

        wIdent = struct.unpack_from('<H', data, 0)[0]
        # Word 2.0: 0xA5DB, Word 5.0: 0xA5DC
        if wIdent not in (0xA5DB, 0xA5DC):
            return ""

        # fcMin at offset 24: start of text in file
        fcMin = struct.unpack_from('<I', data, 24)[0]
        # fcMac at offset 28 in some versions, or scan for end
        fcMac = struct.unpack_from('<I', data, 28)[0] if len(data) > 32 else len(data)

        if fcMin >= len(data) or fcMin < 128:
            fcMin = 128  # fallback to typical text start
        if fcMac <= fcMin or fcMac > len(data):
            fcMac = len(data)

        raw = data[fcMin:fcMac]

        # Word 2.0 uses single-byte encoding; try common codepages
        for enc in ['cp1252', 'cp1251', 'cp1250', 'latin-1']:
            try:
                text = raw.decode(enc, errors='replace')
                # Replace paragraph marks
                text = text.replace('\r\n', '\n').replace('\r', '\n')
                # Remove control chars
                text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)
                # Check if we got reasonable text
                readable = sum(1 for c in text if c.isalnum() or c.isspace())
                if readable > len(text) * 0.3 and len(text.strip()) > 10:
                    return text.strip()
            except Exception:
                continue

        return ""
    except Exception:
        return ""


def _ole_contains_cjk(ole):
    """Quick scan of the OLE WordDocument stream to detect CJK characters.

    Reads the piece table from the FIB/CLX structure and checks if any
    UTF-16LE piece contains CJK Unified Ideographs (U+4E00–U+9FFF),
    CJK Extension A (U+3400–U+4DBF), Hangul (U+AC00–U+D7AF),
    Katakana/Hiragana (U+3040–U+30FF), or fullwidth forms (U+FF00–U+FFEF).

    This is much more reliable than checking '?' ratio in antiword output,
    since it inspects the actual binary data before any lossy conversion.
    Returns True if CJK content is detected, False otherwise.
    """
    try:
        if not ole.exists('WordDocument'):
            return False
        word_doc = ole.openstream('WordDocument').read()
        if len(word_doc) < 426:
            return False

        wIdent = struct.unpack_from('<H', word_doc, 0)[0]
        nFib = struct.unpack_from('<H', word_doc, 2)[0]
        if nFib < 193 or wIdent != 0xA5EC:
            return False  # Word 6/95 — typically single-byte, skip CJK check

        flags = struct.unpack_from('<H', word_doc, 10)[0]
        fWhichTblStm = (flags >> 9) & 1
        table_name = '1Table' if fWhichTblStm else '0Table'
        if not ole.exists(table_name):
            table_name = '0Table' if fWhichTblStm else '1Table'
            if not ole.exists(table_name):
                return False

        table_stream = ole.openstream(table_name).read()
        fcClx = struct.unpack_from('<I', word_doc, 418)[0]
        lcbClx = struct.unpack_from('<I', word_doc, 422)[0]
        if lcbClx == 0 or fcClx + lcbClx > len(table_stream):
            return False

        clx_data = table_stream[fcClx:fcClx + lcbClx]
        pos = 0
        while pos < len(clx_data):
            clxt = clx_data[pos]
            if clxt == 0x01:
                if pos + 3 > len(clx_data):
                    break
                cb = struct.unpack_from('<H', clx_data, pos + 1)[0]
                pos += 3 + cb
            elif clxt == 0x02:
                if pos + 5 > len(clx_data):
                    break
                lcb = struct.unpack_from('<I', clx_data, pos + 1)[0]
                pcdt_data = clx_data[pos + 5:pos + 5 + lcb]
                if lcb < 16:
                    break
                n = (lcb - 4) // 12
                if n <= 0:
                    break

                cps = []
                for i in range(n + 1):
                    if 4 * i + 4 > len(pcdt_data):
                        break
                    cp = struct.unpack_from('<I', pcdt_data, 4 * i)[0]
                    cps.append(cp)

                pcd_offset = 4 * (n + 1)
                # Sample up to 10 pieces to keep it fast
                sample_count = min(n, 10)
                for i in range(sample_count):
                    if pcd_offset + 8 * i + 8 > len(pcdt_data):
                        break
                    pcd_data = pcdt_data[pcd_offset + 8 * i:pcd_offset + 8 * i + 8]
                    fc_compressed = struct.unpack_from('<I', pcd_data, 2)[0]
                    fCompressed = (fc_compressed >> 30) & 1

                    if fCompressed:
                        continue  # Single-byte piece, no CJK possible

                    # UTF-16LE piece — scan for CJK codepoints
                    fc = fc_compressed & 0x3FFFFFFF
                    cp_start = cps[i] if i < len(cps) else 0
                    cp_end = cps[i + 1] if i + 1 < len(cps) else cp_start
                    char_count = cp_end - cp_start
                    byte_len = char_count * 2
                    # Only scan first 2000 chars per piece to stay fast
                    scan_len = min(byte_len, 4000)
                    if fc + scan_len <= len(word_doc):
                        raw = word_doc[fc:fc + scan_len]
                        try:
                            text_sample = raw.decode('utf-16-le', errors='ignore')
                            for ch in text_sample:
                                cp = ord(ch)
                                # CJK Unified Ideographs + Ext A
                                if 0x3400 <= cp <= 0x9FFF:
                                    return True
                                # Hangul Syllables
                                if 0xAC00 <= cp <= 0xD7AF:
                                    return True
                                # Hiragana + Katakana
                                if 0x3040 <= cp <= 0x30FF:
                                    return True
                                # Fullwidth Forms
                                if 0xFF00 <= cp <= 0xFFEF:
                                    return True
                        except Exception:
                            continue
                break
            else:
                break
        return False
    except Exception:
        return False


def parse_ole_doc(filepath, extract_images=None, include_meta=False):
    import olefile

    if not olefile.isOleFile(filepath):
        # Check for pre-OLE Word formats (Word 2.0/5.0)
        text = _try_parse_word2(filepath)
        if text:
            return _clean_text(text)
        # Still try textutil HTML conversion as last resort (macOS only)
        html_path = try_convert_to_html(filepath)
        if html_path:
            text = parse_html_to_text(html_path)
            try:
                os.remove(html_path)
            except OSError:
                pass
            if text and text.strip():
                return _clean_text(text)
        return "Error: Not a valid OLE file"

    ole = olefile.OleFileIO(filepath)
    meta_text = ""
    if include_meta:
        meta_text = format_metadata(extract_ole_metadata(ole))

    images_found = []

    # Extraction priority for .doc files:
    #   1. win32com (Windows only, requires Office/WPS — best quality + full CJK)
    #   2. doc2txt / antiword (bundled, fast — but NO CJK support, auto-detected)
    #   3. textutil HTML conversion (macOS only, built-in)
    #   4. OLE FIB piece table (pure Python, zero deps, full CJK — ultimate fallback)
    # On macOS: textutil first, then doc2txt, then OLE.
    ext = os.path.splitext(filepath)[1].lower()

    # --- Windows: try win32com (Word/WPS COM automation) first ---
    if platform.system() == 'Windows' and ext == '.doc':
        text = _try_win32com(filepath)
        if text:
            if extract_images:
                images_found = extract_images_from_all_streams(ole, extract_images, 'doc')
            embedded_texts = _extract_embedded_ole_texts(ole)
            ole.close()
            result = meta_text + text if meta_text else text
            if embedded_texts:
                result += '\n\n' + '\n\n'.join(embedded_texts)
            if images_found:
                result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
            return _clean_text(result)

    # --- Non-macOS: try doc2txt (bundled antiword) if no CJK content ---
    # antiword does NOT support CJK characters — pre-check via OLE binary scan.
    # On macOS: try textutil first (better header/footer + style preservation),
    #           then doc2txt as fallback
    if platform.system() != 'Darwin' and ext == '.doc':
        has_cjk = _ole_contains_cjk(ole)
        if not has_cjk:
            text = _try_doc2txt(filepath)
            if text:
                if extract_images:
                    images_found = extract_images_from_all_streams(ole, extract_images, 'doc')
                embedded_texts = _extract_embedded_ole_texts(ole)
                ole.close()
                result = meta_text + text if meta_text else text
                if embedded_texts:
                    result += '\n\n' + '\n\n'.join(embedded_texts)
                if images_found:
                    result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
                return _clean_text(result)
        # CJK detected or doc2txt failed — fall through to other methods

    # Try textutil HTML conversion (macOS only)
    html_path = try_convert_to_html(filepath)
    if html_path:
        text = parse_html_to_text(html_path)
        try:
            os.remove(html_path)
        except OSError:
            pass
        if text and text.strip():
            if extract_images:
                images_found = extract_images_from_all_streams(ole, extract_images, 'doc')
            # Also extract text from embedded OLE sub-documents
            embedded_texts = _extract_embedded_ole_texts(ole)
            ole.close()
            result = meta_text + text if meta_text else text
            if embedded_texts:
                result += '\n\n' + '\n\n'.join(embedded_texts)
            if images_found:
                result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
            return _clean_text(result)

    # macOS: textutil failed → try doc2txt before OLE fallback (skip if CJK)
    if ext == '.doc':
        has_cjk = _ole_contains_cjk(ole)
        if not has_cjk:
            text = _try_doc2txt(filepath)
            if text:
                if extract_images:
                    images_found = extract_images_from_all_streams(ole, extract_images, 'doc')
                embedded_texts = _extract_embedded_ole_texts(ole)
                ole.close()
                result = meta_text + text if meta_text else text
                if embedded_texts:
                    result += '\n\n' + '\n\n'.join(embedded_texts)
                if images_found:
                    result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
                return _clean_text(result)
        # CJK detected or doc2txt failed, fall through to OLE parsing

    # Fallback: OLE binary text extraction via Word document stream parsing
    text = _extract_doc_text_from_ole(ole)

    if not text:
        # Last resort: raw UTF-16LE scan
        texts = []
        for stream_name in ['WordDocument', '1Table', '0Table']:
            if ole.exists(stream_name):
                try:
                    data = ole.openstream(stream_name).read()
                    fragments = extract_utf16_text(data)
                    texts.extend(fragments)
                except Exception:
                    continue
        text = '\n\n'.join(texts) if texts else ""

    if extract_images:
        images_found = extract_images_from_all_streams(ole, extract_images, 'doc')

    # Extract text from embedded OLE objects (Word/Excel/PPT sub-documents)
    embedded_texts = _extract_embedded_ole_texts(ole)

    ole.close()

    result = meta_text if meta_text else ""
    result += text if text else "No text content extracted"
    if embedded_texts:
        result += '\n\n' + '\n\n'.join(embedded_texts)
    if images_found:
        result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
    return _clean_text(result)


def _extract_embedded_ole_texts(ole):
    """Extract text from embedded OLE objects (Word, Excel sub-documents).

    Scans OLE directory for ObjectPool entries containing embedded documents,
    writes each sub-storage to a temp file, opens with olefile, and extracts text.
    """
    import olefile as _olefile
    import tempfile
    texts = []
    try:
        # Find ObjectPool entries
        all_entries = ole.listdir()
        # Group entries by parent path to find sub-storages
        substorages = set()
        for entry in all_entries:
            if len(entry) >= 2 and entry[-1] == 'WordDocument':
                # This is an embedded Word doc
                substorages.add(tuple(entry[:-1]))

        for parent in substorages:
            parent_path = '/'.join(parent)
            try:
                # Write the sub-storage as a standalone OLE file
                # We need to extract all streams under this parent and rebuild
                # Simpler approach: read WordDocument + Table streams directly

                wd_path = parent_path + '/WordDocument'
                if not ole.exists(wd_path):
                    continue
                wd_data = ole.openstream(wd_path).read()
                if len(wd_data) < 68:
                    continue

                # Read FIB basics
                wIdent = struct.unpack_from('<H', wd_data, 0)[0]
                nFib = struct.unpack_from('<H', wd_data, 2)[0]

                if wIdent != 0xA5EC or nFib < 193:
                    continue

                flags = struct.unpack_from('<H', wd_data, 10)[0]
                fWhichTblStm = (flags >> 9) & 1
                table_name = '1Table' if fWhichTblStm else '0Table'
                table_path = parent_path + '/' + table_name
                if not ole.exists(table_path):
                    alt = '0Table' if fWhichTblStm else '1Table'
                    table_path = parent_path + '/' + alt
                    if not ole.exists(table_path):
                        continue

                table_data = ole.openstream(table_path).read()

                if len(wd_data) < 426:
                    continue
                fcClx = struct.unpack_from('<I', wd_data, 418)[0]
                lcbClx = struct.unpack_from('<I', wd_data, 422)[0]

                if lcbClx == 0 or fcClx + lcbClx > len(table_data):
                    continue

                clx_data = table_data[fcClx:fcClx + lcbClx]

                # Parse piece table
                pos = 0
                pieces = []
                while pos < len(clx_data):
                    clxt = clx_data[pos]
                    if clxt == 0x01:
                        if pos + 3 > len(clx_data):
                            break
                        cb = struct.unpack_from('<H', clx_data, pos + 1)[0]
                        pos += 3 + cb
                    elif clxt == 0x02:
                        if pos + 5 > len(clx_data):
                            break
                        lcb = struct.unpack_from('<I', clx_data, pos + 1)[0]
                        pcdt = clx_data[pos + 5:pos + 5 + lcb]
                        if lcb < 16:
                            break
                        n = (lcb - 4) // 12
                        if n <= 0:
                            break
                        cps = []
                        for i in range(n + 1):
                            if 4 * i + 4 > len(pcdt):
                                break
                            cps.append(struct.unpack_from('<I', pcdt, 4 * i)[0])
                        pcd_off = 4 * (n + 1)
                        for i in range(n):
                            if pcd_off + 8 * i + 8 > len(pcdt):
                                break
                            pcd = pcdt[pcd_off + 8 * i:pcd_off + 8 * i + 8]
                            fc_c = struct.unpack_from('<I', pcd, 2)[0]
                            fC = (fc_c >> 30) & 1
                            fc = fc_c & 0x3FFFFFFF
                            cc = (cps[i + 1] - cps[i]) if i + 1 < len(cps) else 0
                            if fC:
                                off = fc // 2
                                if off + cc <= len(wd_data):
                                    pieces.append(wd_data[off:off + cc].decode('cp1252', errors='replace'))
                            else:
                                if fc + cc * 2 <= len(wd_data):
                                    pieces.append(wd_data[fc:fc + cc * 2].decode('utf-16-le', errors='replace'))
                        break
                    else:
                        break

                if pieces:
                    text = ''.join(pieces)
                    text = text.replace('\r\n', '\n').replace('\r', '\n')
                    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
                    if text.strip() and len(text.strip()) > 5:
                        texts.append(text.strip())
            except Exception:
                continue
    except Exception:
        pass
    return texts


# ──────────────────── OLE Presentation (.ppt/.dps/.dpt) ────────────────────

# PPT template/noise text to filter out
PPT_NOISE_PATTERNS = {
    'click to edit master',
    'second level',
    'third level',
    'fourth level',
    'fifth level',
    # German master slide placeholders
    'titelmasterformat',
    'textmasterformat',
    'formatvorlage des untertitelmasters',
    # French master slide placeholders
    'cliquez pour modifier',
    'modifiez les styles du texte du masque',
    # Chinese master slide placeholders
    '\u5355\u51fb\u6b64\u5904\u7f16\u8f91\u6bcd\u7248',  # 单击此处编辑母版
    '___ppt10',
    '__wpp10',
    'excel.sheet',
    'pptxgenjs',
    'microsoft office powerpoint',
}


def parse_ole_ppt(filepath, extract_images=None, include_meta=False):
    import olefile

    if not olefile.isOleFile(filepath):
        return "Error: Not a valid OLE file"

    ole = olefile.OleFileIO(filepath)
    meta_text = ""
    if include_meta:
        meta_text = format_metadata(extract_ole_metadata(ole))

    texts = []
    images_found = []

    # Detect codepage for TextBytesAtom decoding (CJK Windows support)
    codepage = _detect_ppt_codepage(ole)

    if ole.exists('PowerPoint Document'):
        try:
            data = ole.openstream('PowerPoint Document').read()
            texts = extract_ppt_text_records(data, codepage)
        except Exception:
            pass

    if extract_images and ole.exists('Pictures'):
        try:
            pic_data = ole.openstream('Pictures').read()
            images_found = extract_ppt_pictures(pic_data, extract_images)
        except Exception:
            pass

    ole.close()

    result = meta_text if meta_text else ""
    result += '\n\n'.join(texts) if texts else "No text content extracted"
    if images_found:
        result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
    return result


def _detect_ppt_codepage(ole):
    """Detect codepage from PPT file's OLE SummaryInformation or CompObj stream."""
    try:
        si = ole.get_metadata()
        if hasattr(si, 'codepage') and si.codepage:
            cp_map = {
                932: 'cp932', 936: 'gbk', 949: 'cp949', 950: 'big5',
                1200: 'utf-16-le', 1250: 'cp1250', 1251: 'cp1251',
                1252: 'cp1252', 1253: 'cp1253', 1254: 'cp1254',
                1256: 'cp1256', 65001: 'utf-8', 10000: 'mac-roman',
            }
            return cp_map.get(si.codepage, 'cp1252')
    except Exception:
        pass
    return 'cp1252'


def _decode_textbytes(data, codepage='cp1252'):
    """Decode TextBytesAtom data, trying codepage first then fallback."""
    # TextBytesAtom is single-byte encoded, depends on system locale
    # On CJK Windows: cp936 (GBK), cp932 (Shift_JIS), cp949 (EUC-KR)
    for enc in [codepage, 'cp1252', 'latin-1']:
        try:
            text = data.decode(enc, errors='replace')
            return text.strip()
        except Exception:
            continue
    return data.decode('latin-1', errors='replace').strip()


def extract_ppt_text_records(data, codepage='cp1252'):
    """Parse PPT binary records to extract TextCharsAtom and TextBytesAtom."""
    texts = []
    offset = 0

    while offset < len(data) - 8:
        try:
            rec_header = struct.unpack_from('<HHI', data, offset)
            rec_type = rec_header[1]
            rec_len = rec_header[2]

            if rec_len > len(data) - offset - 8 or rec_len > 1000000:
                offset += 1
                continue

            rec_data = data[offset + 8: offset + 8 + rec_len]

            if rec_type == 0x0FA0 and rec_len >= 2:  # TextCharsAtom (UTF-16LE)
                text = rec_data.decode('utf-16-le', errors='ignore').strip()
                if text:
                    texts.append(text)
                offset += 8 + rec_len
            elif rec_type == 0x0FA8 and rec_len >= 1:  # TextBytesAtom (single-byte, codepage-dependent)
                text = _decode_textbytes(rec_data, codepage)
                if text:
                    texts.append(text)
                offset += 8 + rec_len
            elif rec_type == 0x0FBA and rec_len >= 2:  # CString (UTF-16LE)
                text = rec_data.decode('utf-16-le', errors='ignore').strip()
                if text:
                    texts.append(text)
                offset += 8 + rec_len
            else:
                offset += 1
        except Exception:
            offset += 1

    # Deduplicate, clean, and filter noise
    seen = set()
    unique = []
    for t in texts:
        t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', t).strip()
        if not t or t in seen:
            continue
        # Filter PPT template noise
        t_lower = t.lower()
        if any(noise in t_lower for noise in PPT_NOISE_PATTERNS):
            continue
        if t == '*' or t == '|':
            continue
        seen.add(t)
        unique.append(t)
    return unique


def extract_ppt_pictures(data, output_dir):
    """Extract images from PPT Pictures stream using record-based parsing."""
    os.makedirs(output_dir, exist_ok=True)
    images = []
    offset = 0
    img_idx = 0

    # Record types: EMF=0xF01A, WMF=0xF01B, PICT=0xF01C, JPEG=0xF01D/0xF01E, PNG=0xF01F/0xF020
    pic_types = {
        0xF01D: ('jpg', b'\xff\xd8\xff'), 0xF01E: ('jpg', b'\xff\xd8\xff'),
        0xF01F: ('png', b'\x89PNG'),       0xF020: ('png', b'\x89PNG'),
        0xF01A: ('emf', None),             0xF01B: ('wmf', None),
    }

    while offset < len(data) - 25:
        try:
            rec_header = struct.unpack_from('<HHI', data, offset)
            rec_type = rec_header[1]
            rec_len = rec_header[2]

            if rec_len > len(data) - offset - 8 or rec_len <= 0 or rec_len > 50000000:
                offset += 1
                continue

            if rec_type in pic_types:
                ext, sig = pic_types[rec_type]
                img_data = data[offset + 8 + 17: offset + 8 + rec_len]
                if sig:
                    soi = img_data.find(sig)
                    if soi >= 0:
                        img_data = img_data[soi:]
                if len(img_data) > 100:
                    fname = f"image_{img_idx}.{ext}"
                    fpath = os.path.join(output_dir, fname)
                    with open(fpath, 'wb') as f:
                        f.write(img_data)
                    images.append(fname)
                    img_idx += 1
                offset += 8 + rec_len
            else:
                offset += 1
        except Exception:
            offset += 1

    return images


# ──────────────────── OLE Spreadsheet (.xls/.et/.ett) ────────────────────

def _excel_date_format(dt_tuple, fmt_str):
    """Convert xlrd date tuple to string using Excel format string."""
    import datetime
    yr, mon, day, hr, mi, sec = dt_tuple

    # Map Excel format tokens to Python strftime
    # Do this via direct string building for reliability
    is_time_only = (yr == 0 and mon == 0 and day == 0)
    is_date_only = (hr == 0 and mi == 0 and sec == 0)

    fmt_lower = fmt_str.lower().replace('\\', '')

    # Common Excel date formats → direct output
    if 'am/pm' in fmt_lower or 'a/p' in fmt_lower:
        # 12-hour format
        ampm = 'AM' if hr < 12 else 'PM'
        hr12 = hr % 12
        if hr12 == 0:
            hr12 = 12
        if is_time_only:
            return f"{hr12}:{mi:02d} {ampm}"
        try:
            dt = datetime.datetime(yr, mon, day, hr, mi, sec)
            return f"{dt.month}/{dt.day}/{dt.strftime('%y')} {hr12}:{mi:02d} {ampm}"
        except Exception:
            return f"{hr12}:{mi:02d} {ampm}"

    if is_time_only:
        return f"{hr}:{mi:02d}"

    try:
        dt = datetime.datetime(yr, mon, day, hr, mi, sec)
    except (ValueError, OverflowError):
        return f"{yr}/{mon:02d}/{day:02d}"

    # Match specific Excel format patterns
    if 'd-mmm-yy' in fmt_lower:
        months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return f"{day}-{months[mon]}-{dt.strftime('%y')}"
    if 'd-mmm' in fmt_lower and 'yy' not in fmt_lower:
        months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return f"{day}-{months[mon]}"
    if 'mmm-yy' in fmt_lower and 'd' not in fmt_lower:
        months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return f"{months[mon]}-{dt.strftime('%y')}"
    if 'yyyy-mm-dd' in fmt_lower:
        return f"{yr}-{mon:02d}-{day:02d}"
    if 'yyyy/mm/dd' in fmt_lower:
        return f"{yr}/{mon:02d}/{day:02d}"
    if 'mm/dd/yy' in fmt_lower or 'm/d/yy' in fmt_lower:
        if 'h:mm' in fmt_lower:
            return f"{dt.month}/{dt.day}/{dt.strftime('%y')} {hr}:{mi:02d}"
        return f"{dt.month}/{dt.day}/{dt.strftime('%y')}"
    if 'dd-mm-yy' in fmt_lower:
        return f"{day:02d}-{mon:02d}-{dt.strftime('%y')}"

    # h:mm without AM/PM
    if is_date_only:
        return f"{dt.month}/{dt.day}/{dt.strftime('%y')}"
    if 'h:mm' in fmt_lower:
        return f"{hr}:{mi:02d}"

    # Default: ISO-like
    if is_date_only:
        return f"{yr}/{mon:02d}/{day:02d}"
    return f"{yr}/{mon:02d}/{day:02d} {hr}:{mi:02d}"


def format_cell_value(val, wb=None, cell=None):
    """Format cell value: apply number formatting for dates, currency, percentage etc."""
    if wb and cell and cell.ctype == 3:  # XL_CELL_DATE
        try:
            import xlrd
            dt = xlrd.xldate_as_tuple(val, wb.datemode)
            # Get format string
            fmt_str = ""
            try:
                xf = wb.xf_list[cell.xf_index]
                fmt_obj = wb.format_map.get(xf.format_key)
                if fmt_obj and hasattr(fmt_obj, 'format_str'):
                    fmt_str = fmt_obj.format_str
            except Exception:
                pass
            return _excel_date_format(dt, fmt_str)
        except Exception:
            pass

    if isinstance(val, float) and val == int(val) and abs(val) < 1e15:
        return str(int(val))

    if isinstance(val, float) and wb and cell:
        try:
            xf = wb.xf_list[cell.xf_index]
            fmt_key = xf.format_key
            fmt_obj = wb.format_map.get(fmt_key)
            if fmt_obj and hasattr(fmt_obj, 'format_str'):
                fmt_s = fmt_obj.format_str
                fmt_lower = fmt_s.lower()
                # Currency format
                if '$' in fmt_s:
                    if val < 0 and '(' in fmt_s:
                        return f"(${abs(val):,.2f})"
                    return f"${val:,.2f}"
                # Percentage format
                if '%' in fmt_s:
                    pct = val * 100
                    # Determine decimal places from format
                    if '.00%' in fmt_s:
                        return f"{pct:.2f}%"
                    elif '.0%' in fmt_s:
                        return f"{pct:.1f}%"
                    elif '0%' in fmt_s:
                        return f"{round(pct)}%"
                    return f"{pct:.2f}%"
                # Thousands separator
                if '#,##' in fmt_lower or ',0' in fmt_lower:
                    if '.00' in fmt_s:
                        return f"{val:,.2f}"
                    elif '.0' in fmt_s:
                        return f"{val:,.1f}"
                    return f"{val:,.0f}"
                # Fraction format
                if '?' in fmt_s and '/' in fmt_s:
                    try:
                        from fractions import Fraction
                        whole = int(val)
                        frac = val - whole
                        if abs(frac) > 0.001:
                            f = Fraction(frac).limit_denominator(10)
                            if whole != 0:
                                return f"{whole} {f.numerator}/{f.denominator}"
                            return f"{f.numerator}/{f.denominator}"
                        return str(whole)
                    except Exception:
                        pass
                # Scientific notation
                if 'e+' in fmt_lower or 'e-' in fmt_lower:
                    return f"{val:.2E}"
        except Exception:
            pass

    if isinstance(val, float) and val == int(val) and abs(val) < 1e15:
        return str(int(val))

    return str(val)


def _get_xls_codepage(data):
    """Extract CodePage from BIFF CODEPAGE record (0x0042)."""
    pos = 0
    while pos < len(data) - 4:
        rec_id = struct.unpack_from('<H', data, pos)[0]
        rec_len = struct.unpack_from('<H', data, pos + 2)[0]
        if rec_len > len(data) - pos - 4:
            break
        if rec_id == 0x0042 and rec_len >= 2:
            cp_num = struct.unpack_from('<H', data, pos + 4)[0]
            cp_map = {
                1200: 'utf-16-le', 10000: 'mac-roman', 10008: 'gb2312',
                932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5',
                1250: 'cp1250', 1251: 'cp1251', 1252: 'cp1252',
                1253: 'cp1253', 1254: 'cp1254', 1255: 'cp1255',
                1256: 'cp1256', 1257: 'cp1257', 1258: 'cp1258',
                874: 'cp874', 65001: 'utf-8',
            }
            return cp_map.get(cp_num, 'cp1252')
        pos += 4 + rec_len
    return 'cp1252'


def _decode_biff_string(rec_data, offset, codepage):
    """Decode a BIFF8 string (2-byte length + 1-byte flag + data).
    
    When flag bit 0 = 1: uncompressed UTF-16LE (2 bytes per char).
    When flag bit 0 = 0: compressed single-byte (1 byte per char).
    For compressed strings, the encoding is the file's codepage, but if
    codepage is 'utf-16-le' (cp1200), fall back to 'latin-1' since
    compressed strings are always single-byte.
    """
    if len(rec_data) < offset + 3:
        return ""
    str_len = struct.unpack_from('<H', rec_data, offset)[0]
    flag = rec_data[offset + 2]
    if flag & 0x01:  # uncompressed (UTF-16LE)
        end = offset + 3 + str_len * 2
        if end <= len(rec_data):
            return rec_data[offset + 3:end].decode('utf-16-le', errors='replace')
    else:  # compressed single-byte
        end = offset + 3 + str_len
        if end <= len(rec_data):
            # Compressed strings are single-byte; if codepage is utf-16-le, use latin-1
            enc = codepage if codepage not in ('utf-16-le', 'utf-16') else 'latin-1'
            return rec_data[offset + 3:end].decode(enc, errors='replace')
    return ""


def _extract_xls_headers_footers(filepath):
    """Extract header/footer strings by parsing BIFF HEADER(0x0014) and FOOTER(0x0015) records directly."""
    results = []
    try:
        import olefile
        if not olefile.isOleFile(filepath):
            return results
        ole = olefile.OleFileIO(filepath)
        stream_name = 'Workbook' if ole.exists('Workbook') else ('Book' if ole.exists('Book') else None)
        if not stream_name:
            ole.close()
            return results
        data = ole.openstream(stream_name).read()
        ole.close()

        codepage = _get_xls_codepage(data)

        pos = 0
        while pos < len(data) - 4:
            rec_id = struct.unpack_from('<H', data, pos)[0]
            rec_len = struct.unpack_from('<H', data, pos + 2)[0]
            if rec_len > len(data) - pos - 4:
                break
            if rec_id in (0x0014, 0x0015) and rec_len > 0:
                rec_data = data[pos + 4: pos + 4 + rec_len]
                try:
                    text = _decode_biff_string(rec_data, 0, codepage)
                    if text.strip():
                        cleaned = re.sub(r'&"[^"]*"', '', text)
                        cleaned = re.sub(r'&\d+', '', cleaned)
                        cleaned = re.sub(r'&[LCRDTPNKGUBSEHOIXA]', ' ', cleaned, flags=re.IGNORECASE)
                        cleaned = re.sub(r'&\[[^\]]*\]', '', cleaned)
                        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
                        if cleaned and len(cleaned) > 1:
                            results.append(cleaned)
                except Exception:
                    pass
            pos += 4 + rec_len
    except Exception:
        pass
    return results


def _extract_xls_biff_labels(filepath):
    """Extract text from BIFF LABEL (0x0204) and RSTRING (0x00D6) records.
    
    Some old Excel files store cell text as LABEL records instead of SST-based
    LabelSst records. xlrd may not read these, so we parse them directly.
    Uses file's CodePage for correct encoding on CJK Windows systems.
    """
    labels = {}
    try:
        import olefile
        if not olefile.isOleFile(filepath):
            return labels
        ole = olefile.OleFileIO(filepath)
        data = None
        for sname in ('Workbook', 'Book'):
            if ole.exists(sname):
                data = ole.openstream(sname).read()
                break
        ole.close()
        if not data:
            return labels

        codepage = _get_xls_codepage(data)

        pos = 0
        while pos < len(data) - 4:
            rec_id = struct.unpack_from('<H', data, pos)[0]
            rec_len = struct.unpack_from('<H', data, pos + 2)[0]
            if rec_len > len(data) - pos - 4 or rec_len < 0:
                break
            if rec_id in (0x0204, 0x00D6) and rec_len > 8:
                rec_data = data[pos + 4: pos + 4 + rec_len]
                try:
                    row = struct.unpack_from('<H', rec_data, 0)[0]
                    col = struct.unpack_from('<H', rec_data, 2)[0]
                    text = _decode_biff_string(rec_data, 6, codepage)
                    if text.strip():
                        labels[(row, col, pos)] = text.strip()
                except Exception:
                    pass
            pos += 4 + rec_len
    except Exception:
        pass
    # Flatten: return just the unique texts for supplementing xlrd output
    return labels


def parse_ole_xls(filepath, extract_images=None, include_meta=False):
    """Parse XLS/ET/ETT files using xlrd."""
    meta_text = ""
    if include_meta:
        try:
            import olefile
            if olefile.isOleFile(filepath):
                ole = olefile.OleFileIO(filepath)
                meta_text = format_metadata(extract_ole_metadata(ole))
                ole.close()
        except Exception:
            pass

    try:
        import xlrd
        wb = xlrd.open_workbook(filepath, formatting_info=True)
        # Pre-load BIFF LABEL records to fill gaps xlrd might miss
        biff_labels = _extract_xls_biff_labels(filepath)
        lines = []
        sheet_idx = 0
        for sheet in wb.sheets():
            lines.append(f"## {sheet.name}")
            if sheet.nrows == 0:
                lines.append("(empty sheet)")
                continue

            # Extract header/footer if present
            hf_parts = []
            for attr in ('header_str', 'footer_str'):
                raw = getattr(sheet, attr, '') or ''
                if raw:
                    # Clean header/footer format codes like &L, &C, &R, &D, &T, &P, &N, &"font,style", &nn
                    cleaned = re.sub(r'&"[^"]*"', '', raw)  # remove font specs
                    cleaned = re.sub(r'&\d+', '', cleaned)    # remove font sizes
                    cleaned = re.sub(r'&[LCRDTPNKGUBSEHOIXA]', ' ', cleaned, flags=re.IGNORECASE)
                    cleaned = re.sub(r'&\[[^\]]*\]', '', cleaned)  # remove &[TAB] etc.
                    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
                    if cleaned and len(cleaned) > 1:
                        hf_parts.append(cleaned)
            if hf_parts:
                lines.append(' | '.join(hf_parts))
                lines.append('')

            header = []
            for c in range(sheet.ncols):
                cell = sheet.cell(0, c)
                val = format_cell_value(cell.value, wb, cell)
                if not val or val == '0' or val.strip() == '':
                    label = biff_labels.get((0, c), '')
                    if label:
                        val = label
                header.append(val)
            lines.append('| ' + ' | '.join(header) + ' |')
            lines.append('| ' + ' | '.join(['---'] * sheet.ncols) + ' |')
            for r in range(1, sheet.nrows):
                row = []
                for c in range(sheet.ncols):
                    cell = sheet.cell(r, c)
                    val = format_cell_value(cell.value, wb, cell)
                    if not val or val.strip() == '':
                        label = biff_labels.get((r, c), '')
                        if label:
                            val = label
                    row.append(val)
                lines.append('| ' + ' | '.join(row) + ' |')
            lines.append('')
            sheet_idx += 1
        result = meta_text + '\n'.join(lines) if meta_text else '\n'.join(lines)
        # Append headers/footers extracted from BIFF records
        hf = _extract_xls_headers_footers(filepath)
        if hf:
            result += '\n\n## Headers/Footers\n' + '\n'.join(hf)
        # Append any BIFF LABEL texts not already in output
        if biff_labels:
            label_texts = set()
            for key, text in biff_labels.items():
                if text not in result and text not in label_texts:
                    label_texts.add(text)
            if label_texts:
                result += '\n\n## Labels\n' + '\n'.join(sorted(label_texts))
        # Extract images from OLE streams if requested
        images_found = []
        if extract_images:
            try:
                import olefile
                if olefile.isOleFile(filepath):
                    ole = olefile.OleFileIO(filepath)
                    images_found = extract_images_from_all_streams(ole, extract_images, 'xls')
                    ole.close()
            except Exception:
                pass
        if images_found:
            result += f"\n\n[Extracted {len(images_found)} image(s): {', '.join(images_found)}]"
        return result
    except ImportError:
        return meta_text + parse_ole_xls_fallback(filepath)
    except Exception:
        # If formatting_info=True fails (some files don't support it), retry without
        try:
            import xlrd
            wb = xlrd.open_workbook(filepath, formatting_info=False)
            lines = []
            for sheet in wb.sheets():
                lines.append(f"## {sheet.name}")
                if sheet.nrows == 0:
                    lines.append("(empty sheet)")
                    continue
                header = [format_cell_value(sheet.cell_value(0, c)) for c in range(sheet.ncols)]
                lines.append('| ' + ' | '.join(header) + ' |')
                lines.append('| ' + ' | '.join(['---'] * sheet.ncols) + ' |')
                for r in range(1, sheet.nrows):
                    row = [format_cell_value(sheet.cell_value(r, c)) for c in range(sheet.ncols)]
                    lines.append('| ' + ' | '.join(row) + ' |')
                lines.append('')
            result = meta_text + '\n'.join(lines) if meta_text else '\n'.join(lines)
            return result
        except Exception:
            return meta_text + parse_ole_xls_fallback(filepath)


def parse_ole_xls_fallback(filepath):
    """Fallback XLS parser using olefile for text extraction."""
    import olefile
    if not olefile.isOleFile(filepath):
        return "Error: Not a valid OLE file"
    ole = olefile.OleFileIO(filepath)
    texts = []
    for stream in ole.listdir():
        path = '/'.join(stream)
        try:
            data = ole.openstream(path).read()
            fragments = extract_utf16_text(data)
            texts.extend(fragments)
        except Exception:
            pass
    ole.close()
    return '\n'.join(texts) if texts else "No text content extracted"


# ──────────────────── Shared Utilities ────────────────────

def extract_utf16_text(data, min_len=3):
    """Extract UTF-16LE text fragments from binary data."""
    fragments = []
    current = b''
    i = 0
    while i < len(data) - 1:
        char_bytes = data[i:i+2]
        try:
            char = char_bytes.decode('utf-16-le')
            if char.isprintable() or char in '\r\n\t':
                current += char_bytes
            else:
                if len(current) >= min_len * 2:
                    decoded = current.decode('utf-16-le', errors='ignore')
                    has_cjk = any('\u4e00' <= c <= '\u9fff' for c in decoded)
                    has_alpha = any(c.isalpha() for c in decoded)
                    if has_cjk or (len(decoded) > 8 and has_alpha):
                        fragments.append(decoded.strip())
                current = b''
        except Exception:
            if len(current) >= min_len * 2:
                try:
                    decoded = current.decode('utf-16-le', errors='ignore')
                    if any('\u4e00' <= c <= '\u9fff' for c in decoded) or len(decoded) > 8:
                        fragments.append(decoded.strip())
                except Exception:
                    pass
            current = b''
        i += 2
    return fragments


def extract_images_from_all_streams(ole, output_dir, prefix='img'):
    """Scan ALL OLE streams for embedded images (not just Data)."""
    os.makedirs(output_dir, exist_ok=True)
    images = []

    sigs = [
        (b'\x89PNG\r\n\x1a\n', 'png'),
        (b'\xff\xd8\xff', 'jpg'),
        (b'GIF89a', 'gif'),
        (b'GIF87a', 'gif'),
    ]

    for stream in ole.listdir():
        path = '/'.join(stream)
        try:
            data = ole.openstream(path).read()
            if len(data) < 100:
                continue

            for sig, ext in sigs:
                search_offset = 0
                while True:
                    pos = data.find(sig, search_offset)
                    if pos == -1:
                        break
                    if ext == 'png':
                        end = data.find(b'IEND', pos)
                        end = (end + 8) if end != -1 else min(pos + 2000000, len(data))
                    elif ext == 'jpg':
                        end = data.find(b'\xff\xd9', pos + 2)
                        end = (end + 2) if end != -1 else min(pos + 2000000, len(data))
                    else:
                        end = min(pos + 500000, len(data))

                    img_data = data[pos:end]
                    if len(img_data) > 200:
                        fname = f"{prefix}_{len(images)}.{ext}"
                        fpath = os.path.join(output_dir, fname)
                        with open(fpath, 'wb') as f:
                            f.write(img_data)
                        images.append(fname)
                    search_offset = end
        except Exception:
            continue

    return images


# ──────────────────── Main ────────────────────

def main():
    parser = argparse.ArgumentParser(description='Universal legacy document parser')
    parser.add_argument('filepath', help='Path to the document file')
    parser.add_argument('--extract-images', metavar='DIR', help='Extract images to this directory')
    parser.add_argument('--summary', action='store_true', help='Output only first 50 lines')
    parser.add_argument('--meta', action='store_true', help='Include file metadata')
    args = parser.parse_args()

    if not os.path.exists(args.filepath):
        print(f"Error: File not found: {args.filepath}", file=sys.stderr)
        sys.exit(1)

    fmt, ext = detect_format(args.filepath)

    if fmt == 'unknown':
        print(f"Error: Unsupported format: {ext}", file=sys.stderr)
        sys.exit(1)

    # File info header — also write via buffer to avoid encoding issues
    file_size = os.path.getsize(args.filepath)
    size_str = f"{file_size / 1024:.1f} KB" if file_size < 1048576 else f"{file_size / 1048576:.1f} MB"
    header = f"[Format: {ext} | Parser: {fmt} | Size: {size_str} | OS: {platform.system()}]\n\n"
    try:
        sys.stdout.buffer.write(header.encode('utf-8'))
    except Exception:
        print(header, end='')

    if fmt in ('csv', 'tsv', 'xsv'):
        result = parse_delimited(args.filepath, fmt)
    elif fmt == 'ole_doc':
        result = parse_ole_doc(args.filepath, args.extract_images, args.meta)
    elif fmt == 'ole_ppt':
        result = parse_ole_ppt(args.filepath, args.extract_images, args.meta)
    elif fmt == 'ole_xls':
        result = parse_ole_xls(args.filepath, args.extract_images, args.meta)
    else:
        result = "Unsupported format"

    # Summary mode: truncate output
    if args.summary:
        lines = result.split('\n')
        if len(lines) > 50:
            result = '\n'.join(lines[:50])
            result += f"\n\n... (truncated, {len(lines) - 50} more lines. Run without --summary for full output)"

    # Output result — write UTF-8 bytes directly to stdout buffer
    # to avoid Windows encoding issues (GBK/cp936 mangles Chinese text)
    output = result + '\n'
    try:
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception:
        # Fallback to print if buffer write fails
        print(result)


if __name__ == '__main__':
    main()
