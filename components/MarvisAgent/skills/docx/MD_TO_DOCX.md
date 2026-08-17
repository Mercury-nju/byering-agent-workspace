# Markdown 转 Word 文档

> 本文档说明如何使用 `md_to_docx.py` 脚本将 Markdown 文件转换为带格式的 Word 文档（基于 pandoc）。

---

## 前置依赖

需要安装 pandoc：
```bash
# 检查是否已安装
pandoc --version

# Windows 安装
winget install --id JohnMacFarlane.Pandoc -e
```

---

## 基本用法

```bash
# 基本转换（脚本路径：scripts/md_to_docx.py）
python scripts/md_to_docx.py input.md output.docx
```

> ⚠️ **命令执行方式**：所有 `python scripts/` 命令需在 skill 根目录下执行：
> ```bash
> cd "<skill根目录>"; python scripts/md_to_docx.py input.md output.docx
> ```

---

## 使用模板文档（推荐）

通过 `--reference-doc` 参数指定一个 .docx 模板文件，生成的文档将继承模板中的样式定义（字体、字号、标题样式、页边距等）：

```bash
python scripts/md_to_docx.py input.md output.docx --reference-doc template.docx
```

> 💡 **模板文档的作用**：pandoc 会从模板中提取样式定义（如 Heading 1 的字体字号、Normal 的行距等），应用到生成的文档中。模板中的实际内容不会被复制，只有样式生效。
>
> **如何制作模板**：在 Word 中创建一个空文档，修改各级标题和正文的样式为你想要的格式，保存为 .docx 即可作为模板使用。

---

## 生成目录

```bash
# 在文档开头生成目录（默认 3 级深度）
python scripts/md_to_docx.py input.md output.docx --toc

# 指定目录深度
python scripts/md_to_docx.py input.md output.docx --toc --toc-depth 2
```

---

## 代码高亮

```bash
# 指定代码高亮主题
python scripts/md_to_docx.py input.md output.docx --highlight-style tango
```

可选主题：`tango`、`pygments`、`kate`、`monochrome`、`espresso`、`haddock` 等。

---

## 组合使用

```bash
# 使用模板 + 生成目录 + 代码高亮
python scripts/md_to_docx.py input.md output.docx --reference-doc template.docx --toc --highlight-style tango
```

---

## 转换后进一步编辑

如果转换后还需要对文档进行格式微调（如修改特定段落的字体、插入图片等），可以将生成的 .docx 作为输入，使用本技能的其他编辑功能继续处理：

```bash
# 1. 先转换 md → docx
python scripts/md_to_docx.py input.md output.docx

# 2. 再用编辑流程微调格式（如修改标题样式）
python scripts/office/unpack.py output.docx <结果产物目录>/unpacked/
python scripts/modify_style.py <结果产物目录>/unpacked/ --style "heading 1" --font 黑体 --size 22 --bold
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/final.docx --original output.docx
```

---

## Markdown 语法支持

pandoc 支持以下 Markdown 元素的转换：

| Markdown 元素 | Word 中的效果 |
|---------------|---------------|
| `# 标题` ~ `###### 标题` | Heading 1 ~ Heading 6 样式 |
| 普通段落 | Normal 样式段落 |
| `**粗体**` / `*斜体*` | 加粗 / 斜体 |
| `- 列表` / `1. 列表` | 项目符号列表 / 编号列表 |
| `> 引用` | 引用样式段落 |
| `` `代码` `` / 代码块 | 等宽字体 / 带高亮的代码块 |
| `[链接](url)` | 超链接 |
| `![图片](path)` | 嵌入图片 |
| GFM 表格 | Word 表格 |
| `---` 分隔线 | 水平线 |
| 脚注 `[^1]` | Word 脚注 |
