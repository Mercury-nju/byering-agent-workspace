# 内容插入完整流程

> 本文档说明如何向 .docx 文档中插入新内容（表格、段落、图片等）。

---

## 🚫 禁止操作清单

- 🚫 **禁止自己编写 Python 脚本**来生成或插入 XML / 图片，必须使用 `insert_xml.py` 或 `insert_image.py`
- 🚫 **禁止读取 `document.xml` 查找插入位置**，脚本内置了定位能力（`--page`、`--after-heading` 等参数）
- 🚫 **禁止在 XML 文件中包含 XML 声明**（如 `<?xml version="1.0" encoding="UTF-8"?>`），直接以 `<w:tbl>`、`<w:p>` 等元素开头
- 🚫 **禁止使用 `minidom.parseString()`、`ElementTree.fromstring()` 等 XML 解析器**解析 OOXML 片段（命名空间前缀未绑定，会报 `unbound prefix` 错误）
- 🚫 **禁止打包后再解包验证**插入结果，打包完成即流程结束
- 🚫 **禁止输出路径覆盖源文档**，必须新建文件

---

## 完整流程（3 步）

> ⚠️ **必须严格按照以下 3 个步骤的编号顺序执行，不得跳过任何步骤，不得自行添加额外步骤。整个流程只有这 3 步，打包完成即结束。**

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

### 第 2 步：准备内容并使用专用脚本插入

根据要插入的内容类型选择对应脚本：

---

#### A. 插入 XML 内容（表格、段落等）— 使用 `insert_xml.py`

**正确做法：**
1. 用 `write_file` 工具创建 XML 片段文件（如 `table.xml`）
2. 调用 `insert_xml.py` 脚本插入到指定位置

```bash
# 插入到指定标题之前/之后（目标段落是 Heading 样式时使用）
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --after-heading "总结"
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --before-heading "第三章"

# 插入到包含指定文本的段落之前/之后（目标段落不是 Heading 样式时使用）
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --after-text "2024-2025学年度"
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --before-text "摘要内容"

# 插入到第 N 页开头
python scripts/insert_xml.py <结果产物目录>/unpacked/ table.xml --page 2

# 插入到文档末尾/开头
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --append
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --prepend

# 使用精确字符偏移位置插入（配合 find_page.py 输出）
python scripts/insert_xml.py <结果产物目录>/unpacked/ content.xml --position 64248
```

**位置参数一览（互斥，只能选其一）：**

| 参数 | 说明 | 示例 |
|------|------|------|
| `--append` | 插入到文档末尾（`</w:body>` 之前） | `--append` |
| `--prepend` | 插入到文档开头（第一个段落之前） | `--prepend` |
| `--position POS` | 插入到 document.xml 指定字符偏移位置 | `--position 64248` |
| `--page N` | 插入到第 N 页开头（基于分页标记定位） | `--page 2` |
| `--before-heading TEXT` | 插入到指定标题之前（优先 Heading，fallback 到所有段落） | `--before-heading "第三章"` |
| `--after-heading TEXT` | 插入到指定标题之后（优先 Heading，fallback 到所有段落） | `--after-heading "总结"` |
| `--before-text TEXT` | 插入到包含指定文本的段落之前（仅搜所有段落） | `--before-text "摘要"` |
| `--after-text TEXT` | 插入到包含指定文本的段落之后（仅搜所有段落） | `--after-text "2024-2025学年度"` |

> 💡 **`--before-heading` / `--after-heading` 优先搜索 Heading 样式段落，找不到则自动 fallback 到所有段落。** 即使目标文本不是正式 Heading 样式，也可以使用 `--after-heading`。如果明确知道目标不是 Heading，也可以直接用 `--before-text` / `--after-text`。

> ⚠️ **`--page` 参数的页码检测依赖 XML 中的分页标记**。如果文档从未在 Word 中打开保存过，可能缺少 `lastRenderedPageBreak` 标记，导致页码检测不准确。此时建议使用 `--before-heading` 或 `--after-heading` 按标题定位。

**XML 内容格式要求：**
- 禁止包含 XML 声明，直接以 `<w:tbl>`、`<w:p>` 等元素开头
- XML 内容必须符合 Word 文档的 XML 格式规范
- 先将完整的 XML 片段写入文件，再传文件路径给脚本

**常见 XML 片段示例：**

插入普通段落：
```xml
<w:p>
  <w:r>
    <w:t>这是要插入的文本内容</w:t>
  </w:r>
</w:p>
```

插入带格式的段落（⚠️ `<w:pPr>` 内子元素必须按规定顺序排列，详见 [XML_REFERENCE.md](XML_REFERENCE.md) 架构合规性）：
```xml
<w:p>
  <w:pPr>
    <!-- ⚠️ pPr 子元素顺序：spacing → ind → jc，顺序错误会导致验证失败 -->
    <w:spacing w:before="120"/>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/>
      <w:color w:val="FF0000"/>
    </w:rPr>
    <w:t>居中对齐的红色加粗文本</w:t>
  </w:r>
</w:p>
```

插入封面页/首页（⚠️ **必须在标题段落后面加分页符段落**，否则标题和正文会显示在同一页）：
```xml
<!-- 标题段落：居中 + 距顶部留白 -->
<w:p>
  <w:pPr>
    <!-- ⚠️ pPr 子元素顺序：spacing → jc -->
    <w:spacing w:before="6000"/>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/>
      <w:sz w:val="52"/>
      <w:szCs w:val="52"/>
    </w:rPr>
    <w:t>文档标题</w:t>
  </w:r>
</w:p>
<!-- ⚠️ 分页符段落：必须有这个段落，才能让后续正文从第二页开始 -->
<w:p>
  <w:r>
    <w:br w:type="page"/>
  </w:r>
</w:p>
```
> 💡 使用 `--prepend` 参数将封面页插入到文档开头。`w:before="6000"` 表示标题距页面顶部约 300 磅（≈10.6cm），使标题大致居于页面中部。`w:sz w:val="52"` = 一号字（26磅）。

插入分页符（在任意位置强制分页）：
```xml
<w:p>
  <w:r>
    <w:br w:type="page"/>
  </w:r>
</w:p>
```

插入简单表格：
```xml
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>
      <w:p><w:r><w:t>姓名</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>
      <w:p><w:r><w:t>成绩</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>
```

> ⚠️ **表格 XML 必须包含完整的 OOXML 属性**：`<w:tblPr>` 中必须有 `<w:tblW>`，每个 `<w:tc>` 中必须有 `<w:tcPr>`（含 `<w:tcW>`），如果不引用已有表格样式，必须显式定义 `<w:tblBorders>`。

---

#### B. 插入图片 — 使用 `insert_image.py`

```bash
# 追加到文档末尾
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --append

# 插入到文档开头
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --prepend

# 插入到指定页码的开头
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --page 3

# 插入到包含指定文本的段落之后/之前（目标段落不是 Heading 样式时使用）
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --after-text "用户画像（细化版）"
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --before-text "摘要内容"

# 插入到指定标题之前/之后（支持模糊匹配）
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --before-heading "第三章"
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 10 --after-heading "总结"

# 同时指定宽高
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 15 --height 10 --append
```

**位置参数一览（互斥，只能选其一）：**

| 参数 | 说明 | 示例 |
|------|------|------|
| `--append` | 插入到文档末尾 | `--append` |
| `--prepend` | 插入到文档开头 | `--prepend` |
| `--page N` | 插入到第 N 页开头 | `--page 3` |
| `--after-text TEXT` | 插入到包含指定文本的段落之后（仅搜所有段落） | `--after-text "用户画像（细化版）"` |
| `--before-text TEXT` | 插入到包含指定文本的段落之前（仅搜所有段落） | `--before-text "摘要"` |
| `--after-heading TEXT` | 插入到指定标题之后（优先 Heading，fallback 到所有段落） | `--after-heading "总结"` |
| `--before-heading TEXT` | 插入到指定标题之前（优先 Heading，fallback 到所有段落） | `--before-heading "第三章"` |

> 💡 **按文本定位优先使用 `--after-text` / `--before-text`，无需手动搜索位置或调用 `find_page.py`。** `insert_image.py` 会自动完成：复制图片到 `word/media/`、添加关系、添加内容类型、生成 XML 片段并插入到指定位置。

---

### 第 3 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 不要再解包验证、不要再读取 XML 检查插入结果。直接告知用户插入已完成即可。

---

## 附录：find_page.py 命令行用法

> 💡 **大多数操作脚本已内置页面定位能力，通常不需要手动调用 `find_page.py`。** 只有在需要单独查看页面信息（如用户问"文档有几页"）或使用 `--position` 精确偏移插入时，才需要手动调用此脚本。

```bash
# 查找指定页面的位置
python scripts/find_page.py <unpacked_dir> <page_number>

# 查看所有页面信息
python scripts/find_page.py <unpacked_dir> all

# 按文本内容搜索段落位置
python scripts/find_page.py <unpacked_dir> --text "要搜索的文本"

# 按标题搜索段落位置（优先搜索 Heading 样式）
python scripts/find_page.py <unpacked_dir> --heading "标题文本"
```

输出示例：
```
Page 2 of 5:
  Position: 2456 (line 89)
  XML preview: <w:p><w:r><w:t>这是第二页的内容...</w:t></w:r></w:p>
```

将输出的 `Position` 值传给 `insert_xml.py --position` 参数即可精确插入。
