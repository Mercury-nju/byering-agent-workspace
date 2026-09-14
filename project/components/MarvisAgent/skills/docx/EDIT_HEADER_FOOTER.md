# 页眉页脚完整流程

> 本文档说明如何查看、修改、添加或删除 .docx 文档的页眉/页脚。
>
> ⚠️ **此流程仅适用于纯页眉页脚操作。** 如果任务还涉及其他操作（如"添加首页封面 + 页眉 + 页码"），必须走 [EDIT_COMBO.md](EDIT_COMBO.md) 的组合任务流程，不要走此单功能流程。
>
> ⚠️ **特别注意："添加首页/封面页"不是页眉页脚任务，而是内容插入任务（用 `insert_xml.py`）。** `header_footer.py` 只能管理页眉栏和页脚栏的内容，不能向文档正文中插入封面页。

---

## 🚫 禁止操作清单

- 🚫 **禁止手动读取或编辑 `header*.xml` / `footer*.xml` 文件**
- 🚫 **禁止手动修改 `document.xml.rels` 或 `[Content_Types].xml`**
- 🚫 **禁止自己编写 Python 脚本**来操作页眉页脚
- 🚫 **禁止打包后再解包验证**结果，打包完成即流程结束
- 🚫 **禁止输出路径覆盖源文档**，必须新建文件

---

## ⚠️ 重要规范

### 1. 字号参数转换（中文老字号 vs 磅值）
当用户要求使用中文老字号（如“五号”、“小四”）时，**必须**查表将其转换为对应的**磅值（pt）**传入 `--size` 参数。**严禁**直接将中文数字（如 5、4）作为参数传入！

**常用字号对照表：**
- 初号 = 42 磅
- 小初 = 36 磅
- 一号 = 26 磅
- 小一 = 24 磅
- 二号 = 22 磅
- 小二 = 18 磅
- 三号 = 16 磅
- 小三 = 15 磅
- 四号 = 14 磅
- 小四 = 12 磅
- 五号 = 10.5 磅
- 小五 = 9 磅
- 六号 = 7.5 磅
- 小六 = 6.5 磅
- 七号 = 5.5 磅
- 八号 = 5 磅

### 2. 默认内容规则
如果用户要求添加页眉/页脚但未指定具体文本，请默认使用页码格式（如 `第 {PAGE} 页`），或者主动向用户询问确认。不要随意编造其他无关文本。

---

## 完整流程（3 步）

> ⚠️ **整个页眉页脚流程只有 3 条命令：解包 → 运行 `header_footer.py` → 打包。除此之外不需要任何其他操作。**

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

### 第 2 步：使用 `header_footer.py` 操作页眉页脚

> ⚠️ **脚本路径：`scripts/header_footer.py`（在 scripts/ 根目录下）**

脚本支持 4 个子命令：`list`（查看）、`modify`（修改）、`add`（添加）、`remove`（删除）。

```bash
# 查看所有页眉页脚
python scripts/header_footer.py <结果产物目录>/unpacked/ list

# 修改默认页眉文本
python scripts/header_footer.py <结果产物目录>/unpacked/ modify --type header --position default --text "新页眉内容"

# 修改默认页脚文本（居中对齐）
python scripts/header_footer.py <结果产物目录>/unpacked/ modify --type footer --position default --text "新页脚" --align center

# 添加默认页眉
python scripts/header_footer.py <结果产物目录>/unpacked/ add --type header --position default --text "公司机密文件"

# 添加带页码的页脚（居中，{PAGE} 会自动替换为 Word 页码域）
python scripts/header_footer.py <结果产物目录>/unpacked/ add --type footer --position default --text "第 {PAGE} 页 / 共 {NUMPAGES} 页" --align center

# 添加首页页眉（自动启用"首页不同"）
python scripts/header_footer.py <结果产物目录>/unpacked/ add --type header --position first --text "首页专用页眉"

# 删除默认页脚
python scripts/header_footer.py <结果产物目录>/unpacked/ remove --type footer --position default

# 修改页眉并设置字体和字号
python scripts/header_footer.py <结果产物目录>/unpacked/ modify --type header --position default --text "机密文件" --font 黑体 --size 10
```

**子命令说明：**

| 子命令 | 说明 |
|--------|------|
| `list` | 列出文档中所有页眉页脚及其内容 |
| `modify` | 修改现有页眉/页脚的文本内容 |
| `add` | 添加新的页眉/页脚 |
| `remove` | 删除页眉/页脚 |

**`modify` / `add` / `remove` 通用参数：**

| 参数 | 必选 | 说明 | 示例 |
|------|------|------|------|
| `--type TYPE` | ✅ | 类型：`header`（页眉）或 `footer`（页脚） | `--type header` |
| `--position POS` | | 位置：`default`（默认/奇数页）、`first`（首页）、`even`（偶数页）、`all`（同时添加 default + first，确保覆盖所有页面，仅 `add` 支持），`add` 子命令默认 `all`，其他子命令默认 `default` | `--position first` |
| `--section N` | | 节索引（0-based，-1 表示文档默认节，默认 -1） | `--section 0` |

**`modify` / `add` 额外参数：**

| 参数 | 必选 | 说明 | 示例 |
|------|------|------|------|
| `--text TEXT` | ✅ | 文本内容（支持 `{PAGE}` 和 `{NUMPAGES}` 占位符） | `--text "第 {PAGE} 页"` |
| `--align ALIGN` | | 对齐方式：`left`、`center`、`right` | `--align center` |
| `--font NAME` | | 字体名称 | `--font 宋体` |
| `--size PT` | | 字号（磅） | `--size 10` |

**页码占位符说明：**

| 占位符 | 说明 |
|--------|------|
| `{PAGE}` | 当前页码（在 Word 中打开时显示实际页码） |
| `{NUMPAGES}` | 总页数（在 Word 中打开时显示实际总页数） |

**注意事项：**
- `--position first` 会自动在 `<w:sectPr>` 中添加 `<w:titlePg/>` 启用"首页不同"
- 如果文档有多个节（section），使用 `--section` 参数指定要操作的节
- `list` 子命令会显示每个节的页眉页脚信息，包括文件名和关系 ID

### 第 3 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 不要再解包验证、不要再读取 XML 检查结果。直接告知用户操作已完成即可。
