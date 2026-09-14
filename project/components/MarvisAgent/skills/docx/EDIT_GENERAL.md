# 通用编辑流程（手动编辑 XML）

> 本文档说明如何通过手动编辑 XML 来修改 .docx 文档（适用于修改文本内容、添加修订等其他编辑任务）。
>
> ⚠️ **如果你的任务属于以下类型，请走对应的专用流程，不要走此通用流程：**
> - 格式修改 → [EDIT_FORMAT.md](EDIT_FORMAT.md)
> - 内容插入（表格/段落/图片）→ [EDIT_INSERT.md](EDIT_INSERT.md)
> - 批注/错别字检查 → [EDIT_COMMENT.md](EDIT_COMMENT.md)
> - 内容删除 → [EDIT_DELETE.md](EDIT_DELETE.md)
> - 页眉页脚 → [EDIT_HEADER_FOOTER.md](EDIT_HEADER_FOOTER.md)
> - 组合任务（2种以上操作）→ [EDIT_COMBO.md](EDIT_COMBO.md)

---

## 🚫 禁止操作清单

- 🚫 **禁止自己编写 Python 脚本**来修改 XML（直接使用编辑工具进行字符串替换，批量场景请使用 `scripts/replace_text.py`）
- 🚫 **严禁通过 `python_executor` / shell 执行自写的 `str.replace` / 正则脚本**来做批量替换。此类脚本在自包含替换场景（new_string 包含 old_string，如 `小宝` → `应用宝小宝`）下无法幂等，一旦被误判为“未生效”重复执行将产生污染（如 `应用宝应用宝小宝`）。批量替换请一律走 `scripts/replace_text.py`。

---

## 完整流程（3 步）

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

解包后，使用 `read_text` 工具读取以下文件进行分析：
- `<结果产物目录>/unpacked/word/document.xml` — 文档主体内容
- `<结果产物目录>/unpacked/word/styles.xml` — 样式定义

> 💡 解包时会自动完成：提取 XML、美化打印、合并相邻 run、将智能引号转换为 XML 实体（`&#x201C;` 等）。使用 `--merge-runs false` 跳过 run 合并。

### 第 2 步：编辑 XML

编辑 `<结果产物目录>/unpacked/word/` 中的文件。

根据修改规模选择方式：

| 场景 | 推荐方式 |
|------|----------|
| **少量（≤3 处）文本/XML 局部修改** | 直接使用编辑工具（`replace_in_file` / `edit_file`）做字符串替换，编辑工具能清楚地显示正在替换的内容 |
| **全文批量查找-替换**（≥ 4 处，或替换 new_string 本身包含 old_string，如 `小宝` → `应用宝小宝`） | 使用 `scripts/replace_text.py`，见下文「批量文本替换」 |

**无论哪种场景，都不要自己通过 `python_executor` 编写 `open/read/replace/write` 脚本**。自写脚本在自包含替换场景下无法判断是否成功替换，容易被误判为“未生效”而重复执行，从而产生 `应用宝应用宝小宝` 这类重复污染。

**例外：** 格式修改、样式修改、批注、图片插入、XML 内容插入等操作使用本技能提供的辅助脚本，不要自己编写新脚本。

#### 批量文本替换（`scripts/replace_text.py`）

对正文文本做批量查找-替换，使用该脚本而不是自写任何 `str.replace` 脚本。

```bash
python scripts/replace_text.py <结果产物目录>/unpacked/ \
    --pair "小宝=应用宝小宝" \
    --pair "AI助手=AI Agent"
```

关键特性：
- **幂等**：即使 `new_string` 本身包含 `old_string`（自包含替换），多次执行也不会产生重复污染。
- **XML 安全**：默认只替换 `<w:t>...</w:t>` 文本节点内部，不会误改属性、命名空间或样式标签；`new_string` 会做 XML 实体转义。
- **仅作用于解包目录**：第一个参数必须是 `unpack.py` 输出的 `unpacked/` 目录，不会误伤原始 `.docx`。

常用参数：
- `--pair OLD=NEW`：指定一对替换，可多次传入。
- `--files word/document.xml word/footer1.xml`：指定要处理的相对路径，默认只处理 `word/document.xml`。
- `--raw`：绕过 `<w:t>` 边界对整文件直接替换（慎用，可能影响属性值）。

> 💡 脚本运行后会打印每个文件、每对替换的命中次数（如 `'小宝'x67`）。若命中数为 0，说明目标已替换完成或文件中不存在该文本，**禁止**重复执行（命中 0 = 无需再跑）。

#### 修订和批注中的作者默认值

**修订和批注中使用 "yyb" 作为作者**，除非用户明确要求使用其他名称。

#### 智能引号 XML 实体

添加包含撇号或引号的文本时，使用 XML 实体生成智能引号：

```xml
<!-- 使用这些实体以获得专业的排版效果 -->
<w:t>Here&#x2019;s a quote: &#x201C;Hello&#x201D;</w:t>
```

| 实体 | 字符 | 说明 |
|------|------|------|
| `&#x2018;` | ' | 左单引号 |
| `&#x2019;` | ' | 右单引号/撇号 |
| `&#x201C;` | " | 左双引号 |
| `&#x201D;` | " | 右双引号 |

#### 常见陷阱

- **替换整个 `<w:r>` 元素**：添加修订时，将整个 `<w:r>...</w:r>` 块替换为并列的 `<w:del>...<w:ins>...`。不要在 run 内部注入修订标记。
- **保留 `<w:rPr>` 格式**：将原始 run 的 `<w:rPr>` 块复制到修订 run 中，以保持粗体、字号等格式。
- **空白处理**：在包含前导/尾随空格的 `<w:t>` 上添加 `xml:space="preserve"`。

> 💡 详细的 XML 结构参考（修订 XML、批注 XML、格式 XML 等）参见 [XML_REFERENCE.md](XML_REFERENCE.md)。

#### 接受修订

生成已接受所有修订的干净文档：

```bash
python scripts/accept_changes.py input.docx output.docx
```

> ⚠️ **输出文件路径禁止与源文档相同，必须新建文件，不能覆盖源文档。**

### 第 3 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 不要再解包验证、不要再读取 XML 检查修改结果。直接告知用户修改已完成即可。
