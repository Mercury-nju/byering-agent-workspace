# 图片合并为 PDF 指南

## 概述

本文档覆盖**将多张图片合并为单个 PDF**。典型用例：

- 身份证 / 银行卡 / 名片 / 驾照等**成对证件**正反面合并
- 证件照 / 票据 / 合同扫描件等**材料合并**

入口脚本：`scripts/images_to_pdf.py`。复杂需求请参考文末「回退策略」。

## 默认行为约定

**公共默认**：

- **A4 纵向**；边距 **15mm**，同页图间距 **10mm**
- **不**添加页码 / 标题 / 文件名 / 水印 / 边框等任何装饰
- 图片等比缩放并在槽位内居中，保持宽高比不变形

**每页张数采用智能推断**（`--per-page auto`）：

| 场景 | 每页张数 | 触发方式 |
|---|---|---|
| 命中"身份证 / 银行卡 / 名片 / 驾照 / 证件正反面 / 学生证 / 工作证"等关键词 | **2 张上下** | LLM 显式传 `--per-page 2 --layout vertical` |
| 图片数量恰好为 **2 张**（未命中关键词） | **2 张上下** | 脚本 auto 推断 |
| 图片数量为 **1 张或 ≥ 3 张** | **1 张** | 脚本 auto 推断 |

## LLM 决策指南

### 触发"每页 2 张"的关键词

命中以下任一关键词时，Agent 必须显式传入 `--per-page 2 --layout vertical`：

- 身份证 / 身份证正反面 / 身份证两面
- 银行卡 / 银行卡正反面
- 名片 / 名片正反
- 驾照 / 驾驶证 / 行驶证
- 学生证 / 工作证 / 员工证 / 工牌
- 证件正反面 / 卡片正反 / 证件两面

### 映射示例

- "把身份证正反面合成一个 PDF" → `--per-page 2 --layout vertical`
- "合并这几张照片成 PDF"（无关键词） → 省略 `--per-page`，走 auto
- "每页 4 张九宫格" → `--per-page 4 --layout grid`

## 脚本用法

### 示例 1：默认 auto 模式

```bash
python skills/pdf/scripts/images_to_pdf.py photo1.jpg photo2.jpg photo3.jpg -o out.pdf
```

3 张图片 → 每页 1 张，共 3 页。

### 示例 2：身份证场景

```bash
python skills/pdf/scripts/images_to_pdf.py idcard_front.jpg idcard_back.jpg \
    -o idcard.pdf --per-page 2 --layout vertical
```

2 张 → 1 页、上下堆叠、居中、无装饰。

### 示例 3：强制每页 1 张

```bash
python skills/pdf/scripts/images_to_pdf.py "contract/*.jpg" -o contract.pdf --per-page 1
```

支持通配符与目录输入；适合多页合同/票据。

### 示例 4：每页 4 张九宫格

```bash
python skills/pdf/scripts/images_to_pdf.py ./gallery -o gallery.pdf --per-page 4 --layout grid
```

目录会自动展开为其下所有支持的图片文件（按文件名排序）。

## 参数速查表

| 参数 | 默认值 | 可选值 | 说明 |
|---|---|---|---|
| `inputs`（位置参数） | — | 图片路径 / 目录 / glob 模式 | 支持 jpg、jpeg、png、webp、bmp；允许多个，按给定顺序合并 |
| `-o / --output` | — | `*.pdf` 路径 | 必填；目录不存在时自动创建 |
| `--per-page` | `auto` | `auto / 1 / 2 / 4 / 6 / 9` | auto：2 张时每页 2 张，否则每页 1 张 |
| `--layout` | `vertical` | `vertical / horizontal / grid` | `grid` 仅在 per-page ≥ 4 时生效 |
| `--page-size` | `A4` | `A4 / A5 / Letter` | 页面尺寸 |
| `--orientation` | `portrait` | `portrait / landscape` | 页面方向 |
| `--margin` | `15` | 非负浮点 | 页面边距（毫米） |
| `--gap` | `10` | 非负浮点 | 同页多图之间的间距（毫米） |

**组合约束**：`per-page=1` 不允许 `layout=grid`；`per-page=2` 不允许 `layout=grid`；`per-page=4/6/9` **必须**使用 `layout=grid`。

**退出码**：`0` 成功；`2` 参数或输入非法；`3` 所有图片加载失败；`4` PDF 写入失败；`5` 未预期的渲染错误。成功时 PDF 绝对路径会打印到 **stdout**，日志打印到 stderr。

## 回退策略

满足以下**任一**情况时，**禁止使用本脚本**，改为手写 `pypdf + reportlab` 代码：

- 输入中包含 PDF 文件（图片与 PDF 混合合并）
- 需要添加页码 / 标题 / 水印 / 文字标注
- 非均匀布局（如第 1 页 1 张、后续页 2 张）
- 为不同图片指定不同尺寸 / 位置
- 添加书签 / 目录 / 元数据
- 裁剪 / 滤镜 / 圈注等图片额外处理

回退时在回复中简要说明原因，例如："由于需要添加页码，已切换到手写实现"。

## 手写代码模板

### 模板：图片合并 + 页码

```python
# 需求：将图片合并为 PDF，并在每页右下角添加页码
from PIL import Image, ImageOps
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

images = ["a.jpg", "b.jpg", "c.jpg"]
page_w, page_h = A4
pdf = canvas.Canvas("out.pdf", pagesize=A4)

for idx, path in enumerate(images, start=1):
    # 图片预处理：按 EXIF 旋转 + 透明通道合成白底
    with Image.open(path) as raw:
        raw.load()
        img = ImageOps.exif_transpose(raw).convert("RGB")
    pdf.drawImage(ImageReader(img), 40, 80, width=page_w - 80, height=page_h - 160,
                  preserveAspectRatio=True, anchor="c")
    # 右下角页码
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(page_w - 40, 40, "Page {}".format(idx))
    pdf.showPage()

pdf.save()
```

混合合并（图片 + 已有 PDF）可通过 `pypdf.PdfWriter` 追加各自的页面实现，思路同上：先用 reportlab 把图片渲染为临时 PDF 字节流，再用 `PdfWriter.add_page()` 依次拼接已有 PDF 的页面。
