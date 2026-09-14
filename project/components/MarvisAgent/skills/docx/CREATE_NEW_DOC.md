# 创建新文档

> 本文件是 SKILL.md 中"创建新文档"章节的独立文档。创建新 .docx 文件时参考本文件。

## 标准作业程序 (SOP)

**执行步骤：**
1. 仔细阅读下方的 JSON Schema 规范。
2. 在工作区创建一个符合规范的 `.json` 配置文件。
3. 执行命令：`node scripts/create_doc.js <你的json路径> <输出的docx路径>`。
4. 执行成功后直接向用户报告，无需验证生成的文件。

## 前置准备

创建新文档需要安装 `docx` npm 包：

| 依赖 | 检查命令 | 安装命令 |
|------|----------|----------|
| **docx (npm)** | `node -e "require('docx'); console.log('ok')"` （在 skill 根目录执行） | `npm install docx`（在 skill 根目录执行，本地安装） |

## 基本流程

**模型只需生成 JSON 描述文件，由 `create_doc.js` 脚本负责生成 .docx 文件。** 禁止自己编写 JS 代码来调用 docx-js API。

### 步骤

1. **用 `write_file` 工具创建 JSON 描述文件**（如 `doc_spec.json`）
   - ⚠️ **必须用 `write_file` 工具直接写 JSON 文件，❌ 禁止用 Python 脚本生成 JSON**
   - ⚠️ **JSON 必须严格遵循下方的格式规范，禁止自己发明字段名或结构**
   - 🚫 **【强制】必须复制下方"最小可用示例"作为起点，在其基础上修改，❌ 禁止从零手写 JSON 结构**（从零手写几乎必然导致字段名错误，生成空文档）
2. **调用脚本生成文档**：
   ```bash
   cd "<skill根目录>"; node scripts/create_doc.js doc_spec.json output.docx
   ```
3. **验证**（可选）：
   ```bash
   cd "<skill根目录>"; python scripts/office/validate.py output.docx
   ```

> ⚠️ **禁止自己编写 JS 代码来调用 docx-js API。** 所有 docx-js 的 API 细节、格式规范、属性补全都由 `create_doc.js` 脚本保证。模型只需要生成正确的 JSON 描述文件。

> ⚠️⚠️⚠️ **【JSON 格式铁律 — 违反则生成空文档】**
>
> JSON 描述文件的**顶层字段名是固定的**，脚本只认识以下字段，其他字段一律被忽略：
>
> | 必选字段 | 说明 |
> |----------|------|
> | **`content`** | 文档内容数组（**必须存在，否则生成空文档**） |
>
> | 可选字段 | 说明 |
> |----------|------|
> | `styles` | 样式定义 |
> | `page` | 页面设置 |
> | `header` | 页眉 |
> | `footer` | 页脚 |
> | `numbering` | 自定义编号 |
> | `footnotes` | 脚注定义 |
> | `sections` | 多节模式（使用时替代顶层的 `page`/`header`/`footer`/`content`） |
>
> ❌ **以下顶层字段名全部是错误的（脚本不认识，会被忽略，导致生成空文档）**：`title`、`body`、`paragraphs`、`data`、`document`、`text`、`items`、`blocks`、`children`、`properties`、`format`、`elements` 等任何不在上表中的字段名。
>
> ❌ **禁止用 Python 脚本（`json.dump` 等）生成 JSON 文件**。必须用 `write_file` 工具直接写 JSON。用 Python 生成的 JSON 几乎总是使用错误的字段名和结构。
>
> ❌ **`content` 数组中的每个元素必须有 `type` 字段**，脚本只认识以下 type 值：`heading`、`paragraph`、`table`、`list`、`image`、`page_break`、`toc`、`empty`。不要使用 `section`、`title`、`block`、`table-row`、`table-cell` 等自创 type。
>
> **最小可用示例（直接复制修改即可）：**
>
> ```json
> {
>   "styles": { "default": { "font": "微软雅黑", "size": 12 } },
>   "page": { "margin": { "top": 2.54, "bottom": 2.54, "left": 3.18, "right": 3.18 } },
>   "content": [
>     { "type": "heading", "level": 1, "text": "文档标题", "align": "center" },
>     { "type": "paragraph", "text": "正文内容。", "indent_first_line": 2, "line_spacing": 1.5 },
>     { "type": "list", "style": "number", "items": ["第一项", "第二项"] },
>     {
>       "type": "table",
>       "headers": ["姓名", "成绩"],
>       "rows": [["张三", "95"], ["李四", "87"]]
>     }
>   ]
> }
> ```
>
> ⚠️ **注意表格的写法**：用 `headers`（字符串数组）和 `rows`（二维字符串数组），**不要**用 `table-row`/`table-cell`/`children` 等自创结构。

---

## JSON 描述文件格式

### 顶层结构

```json
{
  "styles": { ... },
  "numbering": [ ... ],
  "footnotes": { ... },
  "page": { ... },
  "header": { ... },
  "footer": { ... },
  "content": [ ... ]
}
```

也支持多节模式（多个不同页面设置的区域）：

```json
{
  "styles": { ... },
  "sections": [
    { "page": { ... }, "header": { ... }, "footer": { ... }, "content": [ ... ] },
    { "page": { ... }, "content": [ ... ] }
  ]
}
```

> `styles`、`numbering`、`footnotes` 是文档级别的配置，放在顶层。
> `page`、`header`、`footer`、`content` 是节级别的配置，单节模式放顶层，多节模式放在 `sections` 数组中。

---

### 页面设置 (`page`)

```json
{
  "page": {
    "size": "a4",
    "orientation": "portrait",
    "margin": { "top": 2.54, "bottom": 2.54, "left": 3.18, "right": 3.18 },
    "margin_unit": "cm"
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `size` | string | `"a4"` | 页面大小：`a4`、`letter`、`a3`、`a5`、`b5`、`legal` |
| `orientation` | string | `"portrait"` | 方向：`portrait`（纵向）、`landscape`（横向） |
| `margin` | object | 各 1 英寸 | 页边距，含 `top`、`bottom`、`left`、`right` |
| `margin_unit` | string | `"cm"` | 边距单位：`cm`（厘米）、`inch`（英寸） |
| `width` / `height` | number | — | 自定义页面尺寸（DXA 单位），覆盖 `size` |

---

### 样式 (`styles`)

```json
{
  "styles": {
    "default": { "font": "Arial", "size": 12 },
    "heading1": { "font": "Arial", "size": 16, "bold": true, "spacing_before": 12, "spacing_after": 12 },
    "heading2": { "font": "Arial", "size": 14, "bold": true, "spacing_before": 9, "spacing_after": 9 },
    "heading3": { "font": "Arial", "size": 12, "bold": true },
    "custom": [
      { "id": "Quote", "name": "Quote", "font": "Georgia", "size": 11, "italic": true, "color": "666666" }
    ]
  }
}
```

**default 样式属性：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `font` | string | 默认字体 |
| `size` | number | 默认字号（磅） |
| `color` | string | 默认颜色（十六进制，如 `"333333"`） |

**heading1 ~ heading6 样式属性：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `font` | string | 字体 |
| `size` | number | 字号（磅） |
| `bold` | boolean | 加粗（默认 true） |
| `italic` | boolean | 斜体 |
| `color` | string | 颜色 |
| `spacing_before` | number | 段前间距（磅） |
| `spacing_after` | number | 段后间距（磅） |

---

### 内容 (`content`)

`content` 是一个数组，每个元素代表一个文档块。支持以下类型：

#### 标题 (`heading`)

```json
{ "type": "heading", "level": 1, "text": "第一章 引言" }
```

也支持富文本 children：

```json
{
  "type": "heading", "level": 2,
  "children": [
    { "type": "text", "text": "第二章 ", "color": "333333" },
    { "type": "text", "text": "方法论", "italic": true }
  ]
}
```

支持书签（用于内部链接跳转）：

```json
{ "type": "heading", "level": 1, "text": "第一章", "bookmark_id": "chapter1" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `level` | number | 标题级别 1~6 |
| `text` | string | 纯文本内容（与 `children` 二选一） |
| `children` | array | 富文本内容（与 `text` 二选一） |
| `align` | string | 对齐：`left`、`center`、`right`、`justify` |
| `bookmark_id` | string | 书签 ID（可选，用于内部链接） |

#### 段落 (`paragraph`)

```json
{ "type": "paragraph", "text": "这是一段普通文本。" }
```

带格式的段落：

```json
{
  "type": "paragraph",
  "align": "center",
  "line_spacing": 1.5,
  "indent_first_line": 2,
  "children": [
    { "type": "text", "text": "加粗文本", "bold": true },
    { "type": "text", "text": "和普通文本" }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | string | 纯文本（与 `children` 二选一） |
| `children` | array | 富文本 inline 元素数组（与 `text` 二选一） |
| `align` | string | 对齐：`left`、`center`、`right`、`justify`、`both` |
| `line_spacing` | number | 行距倍数（如 `1.5`） |
| `spacing_before` | number | 段前间距（磅） |
| `spacing_after` | number | 段后间距（磅） |
| `indent_first_line` | number | 首行缩进（字符数，如 `2` = 2 个中文字符） |
| `indent_left` | number | 左缩进（厘米） |
| `indent_right` | number | 右缩进（厘米） |
| `style` | string | 引用样式 ID |
| `page_break_before` | boolean | 段前分页 |
| `numbering` | object | 列表编号 `{ "reference": "ref_name", "level": 0 }` |
| `tab_stops` | array | 制表位 `[{ "type": "right", "position": "max" }]` |
| `border` | object | 段落边框 `{ "bottom": { "size": 6, "color": "2E75B6" } }` |

#### inline 元素（`children` 数组中的元素）

**文本 (`text`)**：

```json
{ "type": "text", "text": "Hello", "bold": true, "italic": true, "color": "FF0000", "font": "微软雅黑", "size": 14 }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | string | 文本内容 |
| `font` | string | 字体 |
| `size` | number | 字号（磅） |
| `bold` | boolean | 加粗 |
| `italic` | boolean | 斜体 |
| `underline` | boolean/string | 下划线（`true` 或样式名：`single`、`double`、`dotted`、`dash`、`wave`） |
| `strike` | boolean | 删除线 |
| `color` | string | 颜色（十六进制） |
| `highlight` | string | 高亮色 |
| `superscript` | boolean | 上标 |
| `subscript` | boolean | 下标 |

**外部链接 (`link`)**：

```json
{ "type": "link", "text": "点击访问", "url": "https://example.com" }
```

**内部链接 (`internal_link`)**：

```json
{ "type": "internal_link", "text": "参见第一章", "anchor": "chapter1" }
```

**书签 (`bookmark`)**：

```json
{ "type": "bookmark", "id": "chapter1", "text": "第一章" }
```

**图片 (`image`)**（inline 级别）：

```json
{ "type": "image", "path": "./logo.png", "width": 100, "height": 50 }
```

**脚注引用 (`footnote`)**：

```json
{ "type": "footnote", "id": 1 }
```

**分页符 (`page_break`)**：

```json
{ "type": "page_break" }
```

**制表符 (`tab`)**：

```json
{ "type": "tab" }
```

**定位制表符 (`positional_tab`)**：

```json
{ "type": "positional_tab", "alignment": "right", "leader": "dot", "text": "3" }
```

#### 表格 (`table`)

```json
{
  "type": "table",
  "headers": ["姓名", "成绩", "等级"],
  "rows": [
    ["张三", "95", "A"],
    ["李四", "87", "B"]
  ],
  "header_shading": "D5E8F0"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `headers` | array | 表头行（字符串数组或单元格对象数组） |
| `rows` | array | 数据行（二维数组或单元格对象数组） |
| `width` | number | 表格总宽度（DXA），默认自动计算为页面内容宽度 |
| `column_widths` | array | 各列宽度（DXA 数组），默认等分 |
| `border` | object/string/false | 边框配置，`false` 或 `"none"` 无边框 |
| `header_shading` | string | 表头底纹颜色（十六进制） |
| `cell_margins` | object | 全局单元格内边距 `{ "top": 80, "bottom": 80, "left": 120, "right": 120 }` |

**单元格对象格式**（用于需要格式的单元格）：

```json
{
  "text": "内容",
  "bold": true,
  "color": "FF0000",
  "align": "center",
  "shading": "F0F0F0",
  "vertical_align": "center",
  "column_span": 2,
  "row_span": 2,
  "children": [
    { "type": "paragraph", "text": "段落1" },
    { "type": "paragraph", "text": "段落2" }
  ]
}
```

#### 列表 (`list`)

```json
{
  "type": "list",
  "style": "bullet",
  "items": ["第一项", "第二项", "第三项"]
}
```

编号列表：

```json
{
  "type": "list",
  "style": "number",
  "items": [
    "步骤一：准备材料",
    "步骤二：开始操作",
    { "text": "步骤三：带格式的项", "bold": true }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `style` | string | `"bullet"`（项目符号）或 `"number"`（编号） |
| `items` | array | 列表项（字符串或段落对象） |
| `reference` | string | 自定义编号引用名（可选，用于多个独立编号序列） |

> ⚠️ 相同 `reference` = 继续编号（1,2,3 然后 4,5,6）；不同 `reference` = 重新编号（1,2,3 然后 1,2,3）。

#### 图片 (`image`)

```json
{
  "type": "image",
  "path": "/absolute/path/to/image.png",
  "width": 300,
  "height": 200,
  "align": "center"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 图片路径（绝对路径或相对于 JSON 文件的路径） |
| `width` | number | 宽度（像素） |
| `height` | number | 高度（像素） |
| `align` | string | 对齐方式 |

#### 分页符 (`page_break`)

```json
{ "type": "page_break" }
```

#### 目录 (`toc`)

```json
{ "type": "toc", "title": "目录", "heading_range": "1-3" }
```

#### 空段落 (`empty`)

```json
{ "type": "empty", "count": 2 }
```

---

### 页眉 (`header`)

简单文本：

```json
{ "header": "公司名称" }
```

带格式：

```json
{
  "header": {
    "text": "公司名称",
    "align": "center",
    "border_bottom": true,
    "border_color": "2E75B6"
  }
}
```

左右分栏：

```json
{
  "header": {
    "left": "公司名称",
    "right": "机密文件"
  }
}
```

自定义内容：

```json
{
  "header": {
    "content": [
      { "type": "paragraph", "text": "自定义页眉内容", "align": "center" }
    ]
  }
}
```

---

### 页脚 (`footer`)

页码：

```json
{
  "footer": {
    "page_number": true,
    "page_number_prefix": "第 ",
    "page_number_suffix": " 页"
  }
}
```

简单文本：

```json
{ "footer": { "text": "© 2025 公司名称", "align": "center" } }
```

左文本 + 右页码：

```json
{
  "footer": {
    "left": "© 2025 公司名称",
    "page_number": true
  }
}
```

---

### 脚注 (`footnotes`)

```json
{
  "footnotes": {
    "1": "来源：2024 年度报告",
    "2": "方法论详见附录"
  }
}
```

在内容中引用脚注：

```json
{
  "type": "paragraph",
  "children": [
    { "type": "text", "text": "收入增长了 15%" },
    { "type": "footnote", "id": 1 },
    { "type": "text", "text": " 使用调整后的指标" },
    { "type": "footnote", "id": 2 }
  ]
}
```

---

### 自定义编号 (`numbering`)

```json
{
  "numbering": [
    {
      "reference": "my-bullets",
      "levels": [
        { "level": 0, "format": "bullet", "text": "•" },
        { "level": 1, "format": "bullet", "text": "◦" }
      ]
    },
    {
      "reference": "my-numbers",
      "levels": [
        { "level": 0, "format": "decimal", "text": "%1." },
        { "level": 1, "format": "lower_letter", "text": "%2)" }
      ]
    }
  ]
}
```

> 不定义自定义编号时，脚本会自动提供 `default-bullets` 和 `default-numbering` 两个默认编号配置。

---

### 多栏布局 (`columns`)

等宽栏：

```json
{
  "columns": {
    "count": 2,
    "space": 720,
    "separate": true
  }
}
```

自定义宽度栏：

```json
{
  "columns": {
    "equal_width": false,
    "columns": [
      { "width": 5400, "space": 720 },
      { "width": 3240 }
    ]
  }
}
```

---

### 多节模式 (`sections`)

不同页面设置的多个区域：

```json
{
  "styles": { "default": { "font": "Arial", "size": 12 } },
  "sections": [
    {
      "page": { "size": "a4", "orientation": "portrait" },
      "header": "第一节",
      "footer": { "page_number": true },
      "content": [
        { "type": "heading", "level": 1, "text": "纵向页面内容" },
        { "type": "paragraph", "text": "这是纵向页面。" }
      ]
    },
    {
      "page": { "size": "a4", "orientation": "landscape" },
      "section_type": "next_page",
      "content": [
        { "type": "heading", "level": 1, "text": "横向页面内容" },
        { "type": "table", "headers": ["A", "B", "C", "D", "E"], "rows": [["1","2","3","4","5"]] }
      ]
    }
  ]
}
```

| `section_type` 值 | 说明 |
|-------------------|------|
| `next_page` | 下一页分节 |
| `continuous` | 连续分节 |
| `next_column` | 下一栏分节 |
| `even_page` | 偶数页分节 |
| `odd_page` | 奇数页分节 |

---

## 完整示例

### 示例 1：简单报告

```json
{
  "styles": {
    "default": { "font": "微软雅黑", "size": 12 },
    "heading1": { "font": "微软雅黑", "size": 18, "bold": true },
    "heading2": { "font": "微软雅黑", "size": 14, "bold": true }
  },
  "page": {
    "size": "a4",
    "margin": { "top": 2.54, "bottom": 2.54, "left": 3.18, "right": 3.18 }
  },
  "header": { "text": "年度报告", "align": "center" },
  "footer": { "page_number": true },
  "content": [
    { "type": "heading", "level": 1, "text": "2024 年度工作报告", "align": "center" },
    { "type": "empty" },
    { "type": "heading", "level": 2, "text": "一、工作概述" },
    { "type": "paragraph", "text": "本年度完成了以下重点工作：", "indent_first_line": 2 },
    {
      "type": "list", "style": "number",
      "items": ["完成系统升级", "优化用户体验", "提升服务质量"]
    },
    { "type": "page_break" },
    { "type": "heading", "level": 2, "text": "二、数据统计" },
    {
      "type": "table",
      "headers": ["指标", "目标值", "实际值", "完成率"],
      "rows": [
        ["用户增长", "10000", "12500", "125%"],
        ["收入目标", "500万", "480万", "96%"],
        ["满意度", "90%", "92%", "102%"]
      ],
      "header_shading": "D5E8F0"
    }
  ]
}
```

### 示例 2：带超链接和脚注的文档

```json
{
  "styles": {
    "default": { "font": "Arial", "size": 12 }
  },
  "footnotes": {
    "1": "来源：2024 年度报告",
    "2": "详见附录 A"
  },
  "page": { "size": "letter" },
  "content": [
    { "type": "heading", "level": 1, "text": "Research Report", "bookmark_id": "title" },
    {
      "type": "paragraph",
      "children": [
        { "type": "text", "text": "Revenue grew by 15%" },
        { "type": "footnote", "id": 1 },
        { "type": "text", "text": ". For more details, visit " },
        { "type": "link", "text": "our website", "url": "https://example.com" },
        { "type": "text", "text": "." }
      ]
    },
    {
      "type": "paragraph",
      "children": [
        { "type": "internal_link", "text": "Back to title", "anchor": "title" }
      ]
    }
  ]
}
```

---

## 注意事项

- **图片路径**：支持绝对路径和相对路径（相对于 JSON 文件所在目录）
- **颜色值**：统一使用 6 位十六进制（如 `"FF0000"`），可带或不带 `#` 前缀
- **字号单位**：JSON 中统一使用磅（pt），脚本内部自动转换为 docx-js 需要的半磅值
- **边距单位**：默认厘米（cm），可通过 `margin_unit` 改为英寸（inch）
- **表格宽度**：如果不指定 `width` 和 `column_widths`，脚本会自动根据页面内容宽度等分列宽
- **列表编号**：不需要自定义编号时，直接使用 `"style": "bullet"` 或 `"style": "number"` 即可，脚本内置了默认编号配置
