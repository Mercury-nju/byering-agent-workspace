# 批注添加 + 错别字检查完整流程

> 本文档说明如何向 .docx 文档添加批注，以及如何检查错别字并自动批注。

---

## 🚫 禁止操作清单

- 🚫 **禁止使用 `find_page.py` 查找文本位置**（`add_comment_mark.py` 内置了文本定位，不需要预先查找）
- 🚫 **禁止读取 `document.xml`** 查看内容或查找文本
- 🚫 **禁止读取或检查 `comments.xml`** 是否存在
- 🚫 **禁止自己编写 Python 脚本**来定位文本、生成 XML 或添加批注标记
- 🚫 **禁止手动调用 `comment.py`**（`add_comment_mark.py` 内部会自动调用）
- 🚫 **禁止打包后再解包验证**批注结果，打包完成即流程结束
- 🚫 **禁止输出路径覆盖源文档**，必须新建文件

---

## 批注添加完整流程（3 步）

> ⚠️ **整个批注流程只有 3 条命令：解包 → 运行 `add_comment_mark.py` → 打包。除此之外不需要任何其他操作。**

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

### 第 2 步：运行 `add_comment_mark.py`（一条命令完成全部工作）

> ⚠️ **脚本路径：`scripts/add_comment_mark.py`（在 scripts/ 根目录下）**

脚本会自动完成：搜索文本 → 精确定位到 `<w:r>` 元素 → 创建批注内容 → 插入批注标记。**你只需要传入参数，不需要做任何预处理。**

```bash
# 基本用法：给"赶集"所有出现的位置标注"错题"（默认标注所有）
python scripts/add_comment_mark.py <结果产物目录>/unpacked/ --text "赶集" --comment "错题"

# 仅标注第一次出现的位置
python scripts/add_comment_mark.py <结果产物目录>/unpacked/ --text "赶集" --comment "错题" --first

# 自定义作者（默认作者为 "yyb"）
python scripts/add_comment_mark.py <结果产物目录>/unpacked/ --text "赶集" --comment "错题" --author "张老师"

# 回复已有批注（回复批注 0）
python scripts/add_comment_mark.py <结果产物目录>/unpacked/ --text "赶集" --comment "回复内容" --parent 0
```

**参数一览：**

| 参数 | 必选 | 说明 | 示例 |
|------|------|------|------|
| `unpacked_dir` | ✅ | 解包目录路径 | `unpacked/` |
| `--text TEXT` | ✅ | 要标注的目标文本 | `--text "赶集"` |
| `--comment TEXT` | ✅ | 批注内容 | `--comment "错题"` |
| `--first` | | 仅标注第一次出现（默认标注所有出现位置） | `--first` |
| `--author NAME` | | 作者名称（默认 "yyb"） | `--author "张老师"` |
| `--initials INIT` | | 作者缩写（默认 "y"） | `--initials "z"` |
| `--id N` | | 批注 ID（不指定则自动分配） | `--id 5` |
| `--parent N` | | 父批注 ID（回复时使用） | `--parent 0` |

### 第 3 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 直接告知用户批注已添加即可。

---

## 错别字检查完整流程（4 步）

> ⚠️ **以下是完整的 4 步流程。直接按步骤执行，不要自己规划步骤。**

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

### 第 2 步：调用 `analyze_file` 工具获取错别字 JSON

> ⚠️ **关于 `analyze_file` 的三条铁律（违反任何一条都会导致流程失败）：**
> 1. **`analyze_file` 是内置工具**（和 `read_file` 一样），通过 tool call 调用，**不是** Python 脚本，**不要**用 `python` 命令执行
> 2. **`file_path` 传原始 .docx 文件路径**（不是解包后的 XML）
> 3. **`question` 参数必须使用下方指定的固定值** —— 禁止自己编写 question（自己写的不会要求返回 JSON，会导致返回自然语言报告，后续全部失败）

**question 参数的唯一正确值（必须原封不动复制，禁止修改）：**

```
请仔细检查文档中的所有错别字、拼写错误。以 JSON 数组格式返回结果，格式为：[{"text": "错别字原文", "comment": "建议修正为"}]。text 字段必须是文档中实际出现的原文片段（尽量短小精确，只包含错别字本身及必要的上下文），comment 是正确写法。只返回 JSON 数组，不要返回其他内容。如果没有发现错别字，返回空数组 []。
```

**完整调用示例（只需替换 file_path）：**
```
analyze_file(
    file_path="<原始.docx文件的完整路径>",
    question="请仔细检查文档中的所有错别字、拼写错误。以 JSON 数组格式返回结果，格式为：[{\"text\": \"错别字原文\", \"comment\": \"建议修正为\"}]。text 字段必须是文档中实际出现的原文片段（尽量短小精确，只包含错别字本身及必要的上下文），comment 是正确写法。只返回 JSON 数组，不要返回其他内容。如果没有发现错别字，返回空数组 []。"
)
```

**返回值处理：** 从返回结果中提取纯 JSON 数组（可能被 \`\`\`json ... \`\`\` 包裹），格式形如：
```json
[
  {"text": "赶集", "comment": "赶紧"},
  {"text": "绝句》", "comment": "《绝句》"}
]
```

> ⚠️ **如果返回的不是 JSON 数组**（而是自然语言报告），说明 question 没有正确复制。**唯一正确的做法：重新调用 `analyze_file`，这次必须原封不动复制上面的 question 值。** 禁止从自然语言报告中提取错别字，禁止自己写 Python 脚本生成 JSON，禁止自己手动构造 JSON。

### 第 3 步：写入 JSON 文件并运行 `check_typo.py annotate`

1. 用 `write_file` 工具将第 2 步得到的 JSON 数组**原样**写入文件（如 `<结果产物目录>/typos.json`）。
   - ⚠️ **JSON 中只允许 `text` 和 `comment` 两个字段**。不要使用 `correction`、`replacement`、`suggestion`、`reason`、`author` 等字段名（脚本不认识，会报错）。
- ⚠️ **不要自己写 Python 脚本来生成这个文件**，直接用 `write_file` 工具写入即可。

2. 运行批注命令：
```bash
python scripts/check_typo.py annotate <结果产物目录>/unpacked/ --typos-file <结果产物目录>/typos.json
```

可选参数：`--author "张老师"` 自定义批注作者（默认 "yyb"），`--initials "z"` 作者缩写（默认 "y"）。

### 第 4 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 直接告知用户错别字检查已完成即可。不要再解包验证、不要再读取 XML 检查结果。
