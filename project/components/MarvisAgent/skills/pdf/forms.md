**重要提示：你必须按顺序完成以下步骤。不要跳过任何步骤直接编写代码。**

如果你需要填写 PDF 表单，首先检查该 PDF 是否包含可填写的表单字段。从本文件所在目录运行以下脚本：
 `python scripts/check_fillable_fields <file.pdf>`，根据结果转到"可填写字段"或"不可填写字段"部分，并按照相应说明操作。

# 可填写字段
如果 PDF 包含可填写的表单字段：
- 从本文件所在目录运行以下脚本：`python scripts/extract_form_field_info.py <input.pdf> <field_info.json>`。它将创建一个 JSON 文件，包含以下格式的字段列表：
```
[
  {
    "field_id": (字段的唯一标识符),
    "page": (页码，从1开始),
    "rect": ([左、下、右、上] PDF 坐标系中的边界框，y=0 位于页面底部),
    "type": ("text"、"checkbox"、"radio_group" 或 "choice"),
  },
  // 复选框包含 "checked_value" 和 "unchecked_value" 属性：
  {
    "field_id": (字段的唯一标识符),
    "page": (页码，从1开始),
    "type": "checkbox",
    "checked_value": (将字段设为此值以勾选复选框),
    "unchecked_value": (将字段设为此值以取消勾选复选框),
  },
  // 单选按钮组包含一个 "radio_options" 列表，列出所有可选项。
  {
    "field_id": (字段的唯一标识符),
    "page": (页码，从1开始),
    "type": "radio_group",
    "radio_options": [
      {
        "value": (将字段设为此值以选中该单选项),
        "rect": (该单选按钮选项的边界框)
      },
      // 其他单选选项
    ]
  },
  // 多选字段包含一个 "choice_options" 列表，列出所有可选项：
  {
    "field_id": (字段的唯一标识符),
    "page": (页码，从1开始),
    "type": "choice",
    "choice_options": [
      {
        "value": (将字段设为此值以选中该选项),
        "text": (选项的显示文本)
      },
      // 其他选项
    ],
  }
]
```
- 将 PDF 转换为 PNG 图像（每页一张图片），使用以下脚本（从本文件所在目录运行）：
`python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>`
然后分析图像以确定每个表单字段的用途（确保将边界框的 PDF 坐标转换为图像坐标）。
- 创建一个 `field_values.json` 文件，使用以下格式填写每个字段的值：
```
[
  {
    "field_id": "last_name", // 必须与 `extract_form_field_info.py` 输出的 field_id 匹配
    "description": "用户的姓氏",
    "page": 1, // 必须与 field_info.json 中的 "page" 值匹配
    "value": "Simpson"
  },
  {
    "field_id": "Checkbox12",
    "description": "如果用户年满18岁则勾选的复选框",
    "page": 1,
    "value": "/On" // 如果是复选框，使用其 "checked_value" 值来勾选。如果是单选按钮组，使用 "radio_options" 中的某个 "value" 值。
  },
  // 更多字段
]
```
- 从本文件所在目录运行 `fill_fillable_fields.py` 脚本来创建填写后的 PDF：
`python scripts/fill_fillable_fields.py <input pdf> <field_values.json> <output pdf>`
该脚本将验证你提供的字段 ID 和值是否有效；如果打印了错误信息，请更正相应字段后重试。

# 不可填写字段
如果 PDF 没有可填写的表单字段，你需要添加文本注释。首先尝试从 PDF 结构中提取坐标（更精确），如果不行则回退到视觉估算方法。

## 步骤 1：优先尝试结构提取

运行以下脚本提取文本标签、线条和复选框及其精确的 PDF 坐标：
`python scripts/extract_form_structure.py <input.pdf> form_structure.json`

这将创建一个 JSON 文件，包含：
- **labels（标签）**：每个文本元素及其精确坐标（x0、top、x1、bottom，单位为 PDF 点）
- **lines（线条）**：定义行边界的水平线
- **checkboxes（复选框）**：作为复选框的小方形矩形（包含中心坐标）
- **row_boundaries（行边界）**：根据水平线计算出的行顶部/底部位置

**检查结果**：如果 `form_structure.json` 包含有意义的标签（与表单字段对应的文本元素），请使用**方案 A：基于结构的坐标**。如果 PDF 是扫描/图像格式且标签很少或没有标签，请使用**方案 B：视觉估算**。

---

## 方案 A：基于结构的坐标（首选）

当 `extract_form_structure.py` 在 PDF 中找到文本标签时使用此方案。

### A.1：分析结构

阅读 form_structure.json 并识别：

1. **标签组**：组成单个标签的相邻文本元素（例如 "Last" + "Name"）
2. **行结构**：具有相似 `top` 值的标签位于同一行
3. **字段列**：输入区域从标签结束后开始（x0 = label.x1 + 间距）
4. **复选框**：直接使用结构中提取的复选框坐标

**坐标系统**：PDF 坐标系统中 y=0 位于页面顶部，y 值向下递增。

### A.2：检查遗漏的元素

结构提取可能无法检测到所有表单元素。常见情况：
- **圆形复选框**：只有方形矩形才会被检测为复选框
- **复杂图形**：装饰性元素或非标准表单控件
- **淡色或浅色元素**：可能无法被提取

如果你在 PDF 图像中看到的表单字段未出现在 form_structure.json 中，则需要对这些特定字段使用**视觉分析**（参见下方"混合方案"）。

### A.3：使用 PDF 坐标创建 fields.json

根据提取的结构为每个字段计算输入坐标：

**文本字段：**
- 输入区 x0 = 标签 x1 + 5（标签后的小间距）
- 输入区 x1 = 下一个标签的 x0，或行边界
- 输入区 top = 与标签 top 相同
- 输入区 bottom = 下方的行边界线，或标签 bottom + 行高

**复选框：**
- 直接使用 form_structure.json 中的复选框矩形坐标
- entry_bounding_box = [checkbox.x0, checkbox.top, checkbox.x1, checkbox.bottom]

使用 `pdf_width` 和 `pdf_height`（表示 PDF 坐标）创建 fields.json：
```json
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "姓氏输入字段",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Smith", "font_size": 10}
    },
    {
      "page_number": 1,
      "description": "美国公民-是-复选框",
      "field_label": "Yes",
      "label_bounding_box": [260, 200, 280, 210],
      "entry_bounding_box": [285, 197, 292, 205],
      "entry_text": {"text": "X"}
    }
  ]
}
```

**重要提示**：使用 `pdf_width`/`pdf_height` 和直接来自 form_structure.json 的坐标。

### A.4：验证边界框

填写前检查边界框是否有错误：
`python scripts/check_bounding_boxes.py fields.json`

此脚本检查是否存在相交的边界框以及输入框对于字体大小来说是否太小。在填写前修复所有报告的错误。

---

## 方案 B：视觉估算（备选）

当 PDF 是扫描/图像格式且结构提取未找到可用的文本标签（例如所有文本显示为"(cid:X)"模式）时使用此方案。

### B.1：将 PDF 转换为图像

`python scripts/convert_pdf_to_images.py <input.pdf> <images_dir/>`

### B.2：初步字段识别

检查每个页面图像以识别表单区域，并获得字段位置的**粗略估算**：
- 表单字段标签及其大致位置
- 输入区域（线条、方框或空白处用于文本输入）
- 复选框及其大致位置

对于每个字段，记录大致的像素坐标（此时不需要很精确）。

### B.3：缩放细化（对精确度至关重要）

对于每个字段，裁剪估算位置周围的区域以精确定位坐标。

**使用 ImageMagick 创建缩放裁剪：**
```bash
magick <page_image> -crop <width>x<height>+<x>+<y> +repage <crop_output.png>
```

其中：
- `<x>, <y>` = 裁剪区域的左上角（使用你的粗略估算值减去内边距）
- `<width>, <height>` = 裁剪区域的大小（字段区域加上每边约 50px 的内边距）

**示例：** 细化估算位于 (100, 150) 附近的"Name"字段：
```bash
magick images_dir/page_1.png -crop 300x80+50+120 +repage crops/name_field.png
```

（注意：如果 `magick` 命令不可用，请尝试使用相同参数的 `convert` 命令）。

**检查裁剪后的图像**以确定精确坐标：
1. 确定输入区域开始的精确像素位置（在标签之后）
2. 确定输入区域结束的位置（在下一个字段或边缘之前）
3. 确定输入线/框的顶部和底部

**将裁剪坐标转换回完整图像坐标：**
- full_x = crop_x + crop_offset_x
- full_y = crop_y + crop_offset_y

示例：如果裁剪从 (50, 120) 开始，输入框在裁剪图像中从 (52, 18) 开始：
- entry_x0 = 52 + 50 = 102
- entry_top = 18 + 120 = 138

**对每个字段重复此操作**，尽可能将相邻字段分组到同一个裁剪区域中。

### B.4：使用细化后的坐标创建 fields.json

使用 `image_width` 和 `image_height`（表示图像坐标）创建 fields.json：
```json
{
  "pages": [
    {"page_number": 1, "image_width": 1700, "image_height": 2200}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "姓氏输入字段",
      "field_label": "Last Name",
      "label_bounding_box": [120, 175, 242, 198],
      "entry_bounding_box": [255, 175, 720, 218],
      "entry_text": {"text": "Smith", "font_size": 10}
    }
  ]
}
```

**重要提示**：使用 `image_width`/`image_height` 和缩放分析后的精确像素坐标。

### B.5：验证边界框

填写前检查边界框是否有错误：
`python scripts/check_bounding_boxes.py fields.json`

此脚本检查是否存在相交的边界框以及输入框对于字体大小来说是否太小。在填写前修复所有报告的错误。

---

## 混合方案：结构 + 视觉

当结构提取对大多数字段有效但遗漏了部分元素（例如圆形复选框、非常规表单控件）时使用此方案。

1. 对 form_structure.json 中检测到的字段使用**方案 A**
2. **将 PDF 转换为图像**，对遗漏的字段进行视觉分析
3. 对遗漏的字段使用**缩放细化**（来自方案 B）
4. **合并坐标**：对于结构提取获得的字段，使用 `pdf_width`/`pdf_height`。对于视觉估算的字段，必须将图像坐标转换为 PDF 坐标：
   - pdf_x = image_x * (pdf_width / image_width)
   - pdf_y = image_y * (pdf_height / image_height)
5. 在 fields.json 中**使用统一的坐标系统** - 将所有坐标转换为使用 `pdf_width`/`pdf_height` 的 PDF 坐标

---

## 步骤 2：填写前验证

**填写前务必验证边界框：**
`python scripts/check_bounding_boxes.py fields.json`

此脚本检查：
- 相交的边界框（会导致文本重叠）
- 对于指定字体大小来说过小的输入框

在继续之前修复 fields.json 中所有报告的错误。

## 步骤 3：填写表单

填写脚本会自动检测坐标系统并处理转换：
`python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>`

## 步骤 4：验证输出

将填写后的 PDF 转换为图像并验证文本位置：
`python scripts/convert_pdf_to_images.py <output.pdf> <verify_images/>`

如果文本位置不正确：
- **方案 A**：检查是否使用了来自 form_structure.json 的 PDF 坐标以及 `pdf_width`/`pdf_height`
- **方案 B**：检查图像尺寸是否匹配以及坐标是否为准确的像素值
- **混合方案**：确保视觉估算字段的坐标转换正确
