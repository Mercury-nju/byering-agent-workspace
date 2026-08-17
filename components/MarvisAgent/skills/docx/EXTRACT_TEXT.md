# 提取文本内容

> 本文档说明如何从 .docx 文件中提取文本内容。根据需求选择合适的方法。

---

## 方法选择

| 用户需求 | 方法 |
|----------|------|
| 只需文本内容、标题层级、段落结构 | **方法 A：pandoc 转 Markdown** |
| 需要字体、字号、样式定义、详细格式信息 | **方法 B：解包 XML 分析** |
| 不确定 | 如果用户提到"字体""字号""样式""格式"等关键词，使用方法 B |

> 💡 **前置依赖**：方法 A 需要安装 pandoc（`pandoc --version` 检查，`winget install --id JohnMacFarlane.Pandoc -e` 安装）。方法 B 只需 Python，无需额外依赖。

---

## 方法 A：pandoc 转 Markdown

适用于只需要文本内容和标题层级的场景。

```bash
# 基本转换
pandoc document.docx -o output.md

# 如需包含修订记录
pandoc --track-changes=all document.docx -o output.md
```

转换完成后，使用 `read_text` 工具读取 `output.md` 分析文档结构。

---

## 方法 B：解包 XML 分析

适用于需要获取字体、字号、样式定义等详细格式信息的场景。pandoc 转 Markdown 会丢失这些信息，必须通过解包原始 XML 来获取。

### 步骤 1：解包文档

```bash
# 输出到结果产物目录下的 unpacked/，不要输出到源文件所在目录
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

> ⚠️ **命令执行方式**：所有 `python scripts/` 命令需在 skill 根目录下执行，使用 `;` 分隔 cd 和后续命令：
> ```bash
> cd "<skill根目录>"; python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
> ```

### 步骤 2：读取 XML 文件分析

解包后，使用 `read_text` 工具读取以下文件进行分析：

- `<结果产物目录>/unpacked/word/document.xml` — 文档主体内容（段落结构、文本内容、内联格式）
- `<结果产物目录>/unpacked/word/styles.xml` — 样式定义（字体、字号、标题样式、段落样式等）

### XML 分析要点

分析 XML 时关注以下关键元素：

| XML 元素 | 含义 |
|----------|------|
| `<w:pStyle>` | 段落样式名称（如 Heading1、Normal） |
| `<w:rFonts>` | 字体定义 |
| `<w:sz>` | 字号（单位为半磅，如 `<w:sz w:val="24"/>` 表示 12pt） |
| `<w:b/>` | 粗体 |
| `<w:i/>` | 斜体 |
| `<w:jc>` | 对齐方式 |
| `<w:spacing>` | 行距和段前段后间距 |
| `<w:ind>` | 缩进 |
