# 格式修改完整流程

> 本文档说明如何修改 .docx 文档的格式（字体、字号、加粗、颜色、对齐、行距、页边距等）。

---

## 🚫 禁止操作清单

- 🚫 **禁止自己编写 Python 脚本**来修改格式，必须使用 `modify_format.py` 或 `modify_style.py`
- 🚫 **禁止打包后再解包验证**格式修改结果，打包完成即流程结束
- 🚫 **禁止输出路径覆盖源文档**，必须新建文件

---

## 脚本选择指南

| 场景 | 使用脚本 | 原因 |
|------|----------|------|
| "把标题1改成微软雅黑38号" | `modify_style.py` | 修改样式定义 + 自动清理内联冲突，全局生效 |
| "把所有标题1都改成加粗" | `modify_style.py` | 修改样式定义更高效、更语义化，自动处理内联覆盖 |
| "把第3段改成Arial 14号" | `modify_format.py` | 修改特定段落的 run 级别格式 |
| "把包含'第一章'的段落加粗" | `modify_format.py` | 按文本内容定位的格式修改 |
| "把所有正文行距改成1.5倍" | `modify_format.py` | 行距、对齐等段落级属性需用 modify_format.py |

---

## 完整流程（3 步）

> ⚠️ **必须严格按照以下 3 个步骤的编号顺序执行，不得跳过任何步骤，不得自行添加额外步骤（如"验证修改结果"）。整个流程只有这 3 步，打包完成即结束。**

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

> ⚠️ **命令执行方式**：所有 `python scripts/` 命令需在 skill 根目录下执行：
> ```bash
> cd "<skill根目录>"; python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
> ```

### 第 2 步：使用脚本修改格式

根据场景选择 `modify_format.py` 或 `modify_style.py`（参见上方选择指南）。

---

#### A. modify_format.py — 修改特定段落格式

> ⚠️ **脚本路径：`scripts/modify_format.py`（在 scripts/ 根目录下，不是 scripts/office/ 下）**

**脚本参数一览：**

| 类别 | 参数 | 说明 | 示例 |
|------|------|------|------|
| 定位（单段落） | `--text KEYWORD` | 按文本关键词匹配第一个包含该关键词的段落 | `--text "第一章"` |
| 定位（单段落） | `--paragraph N` | 第 N 个非空段落（1-based） | `--paragraph 1` |
| 定位（批量） | `--text-all KEYWORD` | 匹配所有包含该关键词的段落 | `--text-all "第一章"` |
| 定位（批量） | `--style STYLE` | 匹配所有指定样式的段落（支持 styleId 如 `Heading1` 或显示名称如 `heading 1`） | `--style Heading1` |
| 定位（批量） | `--all` | 匹配所有非空段落 | `--all` |
| 字体 | `--font NAME` | 字体名称 | `--font 微软雅黑` |
| 字号 | `--size PT` | 字号，单位磅 | `--size 14` |
| 加粗 | `--bold` / `--no-bold` | 加粗 / 取消加粗 | `--bold` |
| 斜体 | `--italic` / `--no-italic` | 斜体 / 取消斜体 | `--italic` |
| 颜色 | `--color RRGGBB` | 字体颜色（十六进制） | `--color FF0000` |
| 下划线 | `--underline STYLE` / `--no-underline` | 下划线样式 / 取消下划线 | `--underline single` |
| 对齐 | `--align ALIGN` | left / center / right / both | `--align center` |
| 行距 | `--line-spacing N` | 行距倍数 | `--line-spacing 1.5` |
| 页边距 | `--margin-top CM` | 上边距（厘米），文档级别 | `--margin-top 2.54` |
| 页边距 | `--margin-bottom CM` | 下边距（厘米），文档级别 | `--margin-bottom 2.54` |
| 页边距 | `--margin-left CM` | 左边距（厘米），文档级别 | `--margin-left 3.18` |
| 页边距 | `--margin-right CM` | 右边距（厘米），文档级别 | `--margin-right 3.18` |

**段落选择器（互斥，只能选其一）：**

| 选项 | 说明 | 模式 |
|------|------|------|
| `--paragraph N` | 第 N 个非空段落（1-based） | 单段落 |
| `--text KEYWORD` | 第一个包含关键词的段落 | 单段落 |
| `--text-all KEYWORD` | 所有包含关键词的段落 | 批量 |
| `--style STYLE` | 所有指定样式的段落 | 批量 |
| `--all` | 所有非空段落 | 批量 |

> 💡 **页边距说明**：页边距是文档级别的设置，不需要段落选择器。直接使用 `--margin-*` 参数即可，单位为厘米（cm）。

**使用示例：**

```bash
# 单段落：按文本关键词匹配修改
python scripts/modify_format.py <结果产物目录>/unpacked/word/document.xml --text "第一章" --font Arial --size 16 --align center

# 单段落：取消加粗、设置斜体和颜色
python scripts/modify_format.py <结果产物目录>/unpacked/word/document.xml --text "第二章" --no-bold --italic --color FF0000

# 批量：将所有正文（Normal 样式）设置为微软雅黑 12pt
python scripts/modify_format.py <结果产物目录>/unpacked/word/document.xml --style Normal --font 微软雅黑 --size 12

# 批量：将所有一级标题设置为黑体 16pt 加粗居中
python scripts/modify_format.py <结果产物目录>/unpacked/word/document.xml --style "heading 1" --font 黑体 --size 16 --bold --align center

# 批量：将所有非空段落设置为 1.5 倍行距
python scripts/modify_format.py <结果产物目录>/unpacked/word/document.xml --all --line-spacing 1.5

# 页边距：设置上下左右页边距（文档级别）
python scripts/modify_format.py <结果产物目录>/unpacked/word/document.xml --margin-top 2.54 --margin-bottom 2.54 --margin-left 3.18 --margin-right 3.18
```

---

#### B. modify_style.py — 修改样式定义（全局生效）

当用户要求修改某种样式的所有段落时（如"把标题1改成微软雅黑38号"），使用 `modify_style.py` 修改 `styles.xml` 中的样式定义。脚本会自动完成：
1. 修改 `styles.xml` 中的样式定义
2. 自动修改关联的字符样式
3. **自动扫描 `document.xml`，清理使用该样式的段落中与新设置冲突的内联格式覆盖**

> ⚠️ **脚本路径：`scripts/modify_style.py`（在 scripts/ 根目录下）**
>
> ⚠️ **入参是解包目录路径**（脚本自动定位 `word/styles.xml` 和 `word/document.xml`）

**参数一览：**

| 类别 | 参数 | 说明 | 示例 |
|------|------|------|------|
| 位置参数 | `unpacked_dir` | 解包目录路径（必选） | `unpacked/` |
| 样式选择 | `--style STYLE` | 样式名称或 ID（必选，支持 styleId 或 `w:name` 显示名称） | `--style "heading 1"` |
| 字体 | `--font NAME` | 字体名称 | `--font 微软雅黑` |
| 字号 | `--size PT` | 字号，单位磅 | `--size 38` |
| 加粗 | `--bold` / `--no-bold` | 加粗 / 取消加粗 | `--bold` |
| 斜体 | `--italic` / `--no-italic` | 斜体 / 取消斜体 | `--italic` |
| 颜色 | `--color RRGGBB` | 字体颜色（十六进制） | `--color FF0000` |
| 下划线 | `--underline STYLE` / `--no-underline` | 下划线样式 / 取消下划线 | `--underline single` |

**使用示例：**

```bash
# 修改 heading 1 样式为微软雅黑 38pt
python scripts/modify_style.py <结果产物目录>/unpacked/ --style "heading 1" --font 微软雅黑 --size 38

# 修改 Normal 样式为宋体 12pt
python scripts/modify_style.py <结果产物目录>/unpacked/ --style Normal --font 宋体 --size 12

# 使用 styleId（中文版 Word 的本地化短 ID）
python scripts/modify_style.py <结果产物目录>/unpacked/ --style 1 --font 黑体 --size 16 --bold
```

---

### 第 3 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 不要再解包验证格式、不要再读取 XML 检查修改结果。直接告知用户修改已完成即可。
