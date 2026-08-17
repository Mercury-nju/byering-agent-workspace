# 编辑演示文稿

> 🚨 **工作目录**：下面所有 `python scripts/...` 命令**必须**在 **pptx 技能根目录**（即包含 `scripts/` 文件夹的目录）下执行。运行任何脚本前，请先 `cd` 到该目录：
> ```bash
> cd "<path-to-workspace>/backend/skills/pptx"
> ```
> 否则会导致 `No such file or directory` 错误。PPT 输入/输出文件路径可以使用绝对路径。

## 基于模板的工作流

使用现有演示文稿作为模板时：

1. **分析现有幻灯片**：
   ```bash
   python scripts/thumbnail.py template.pptx
   python -m markitdown template.pptx
   ```
   查看 `thumbnails.jpg` 了解布局，查看 markitdown 输出了解占位符文本。

2. **规划幻灯片映射**：为每个内容章节选择一个模板幻灯片。

   ⚠️ **使用多样化的布局** — 单调的演示文稿是常见的失败模式。不要默认使用基本的标题 + 项目符号幻灯片。积极寻找：
   - 多栏布局（双栏、三栏）
   - 图片 + 文本组合
   - 全出血图片 + 文字叠加
   - 引用或标注幻灯片
   - 章节分隔页
   - 数据/数字突出显示
   - 图标网格或图标 + 文本行

   **避免：** 每张幻灯片都重复使用相同的文字密集布局。

   将内容类型与布局风格匹配（例如，关键要点 → 项目符号幻灯片，团队信息 → 多栏布局，用户评价 → 引用幻灯片）。

3. **解包**：`python scripts/office/unpack.py template.pptx <UNPACKED_DIR>/`
   > ⚠️ **记住解包目录路径**（例如 `unpacked/`、`unpacked_test/` 或绝对路径）。后续所有命令（脚本、清理、打包）都**必须使用完全相同的路径**。不要假设目录名总是 `unpacked/`。

4. **构建演示文稿**（自己完成，不要使用子代理）：
   - 删除不需要的幻灯片（从 `<p:sldIdLst>` 中移除）
   - 复制要重用的幻灯片（`add_slide.py`）
   - 在 `<p:sldIdLst>` 中重新排列幻灯片顺序
   - **在第 5 步之前完成所有结构性更改**

5. **编辑内容** — 根据任务类型选择正确的方法：

   > ⚠️ **强制路由规则 — 操作前必读：**
   >
   > | 任务类型 | 操作 | 禁止行为 |
   > |----------|------|----------|
   > | **修改字体、大小、加粗、斜体、下划线** | 运行 `scripts/change_font.py`（见下方） | ❌ 禁止编写新的 Python 脚本 |
   > | **修改对齐方式、颜色** | 运行 `scripts/change_font.py`（见下方） | ❌ 禁止手动编辑 `<a:rPr>` 或 `<a:pPr>` XML |
   > | **插入形状、文本框、箭头、标注** | 运行 `scripts/insert_shape.py`（见下方） | ❌ 禁止编写新的 Python 脚本或手动构建 `<p:sp>` XML |
   > | **添加动画（淡入、飞入、擦除、缩放等）** | 运行 `scripts/add_animation.py`（见下方） | ❌ 禁止编写新的 Python 脚本或手动构建 `<p:timing>` XML |
   > | **合并多个 PPT** | **遵循下方合并工作流**（先解包所有 PPT，再运行 `scripts/merge_slides.py`） | ❌ 禁止编写新的 Python 脚本或手动复制幻灯片 XML；禁止跳过解包步骤；⛔ 绝不使用 `python-pptx` |
   > | 替换文本内容 | 使用编辑工具修改 `slide{N}.xml` | ❌ 禁止使用 sed 或 Python 脚本 |

   ### 5a. 字体/大小修改 → 使用 `change_font.py`

   **如果任务涉及修改字体、大小、加粗、斜体、下划线、对齐方式或颜色，必须使用 `scripts/change_font.py`。禁止编写自己的脚本或手动编辑 XML。该脚本通过在幻灯片级别直接设置属性，处理完整的 OOXML 字体继承链（slide → slideLayout → slideMaster → theme）。**

   ```bash
   # 统一标题字体
   python scripts/change_font.py unpacked/ --target title --font "微软雅黑" --size 36

   # 统一正文字体
   python scripts/change_font.py unpacked/ --target body --font "Arial" --size 18

   # 全部占位符，加粗+斜体
   python scripts/change_font.py unpacked/ --target all --font "微软雅黑" --size 24 --bold 1 --italic 1

   # 修改标题颜色和对齐方式
   python scripts/change_font.py unpacked/ --target title --color FF0000 --align ctr

   # 预览（不实际修改）
   python scripts/change_font.py unpacked/ --target title --font "微软雅黑" --size 36 --dry-run
   ```

   运行 `change_font.py` 后，如果没有其他内容编辑需要，直接跳到第 6 步（清理并打包为新文件）。

   ### 5b. 插入形状/文本框 → 使用 `insert_shape.py`

   **如果任务涉及插入形状（矩形、箭头、标注等）、文本框或装饰元素，必须使用 `scripts/insert_shape.py`。禁止编写自己的脚本或手动构建 `<p:sp>` XML。**

   > ⛔ **参数名严格要求**：必须使用下方参数列表中的确切参数名，禁止臆造参数名。
   > 常见错误对照：
   > - `--fill-color`（❌）→ 正确为 `--fill`
   > - `--font-color`（❌）→ 正确为 `--text-color`
   > - `--position-x`（❌）→ 正确为 `--left`
   > - `--position-y`（❌）→ 正确为 `--top`
   >
   > 颜色值必须使用 6 位十六进制 RGB（如 `FFFFFF`），不接受颜色名称（如 `white`）。
   > 位置和尺寸单位为**英寸**，不是 EMU。

   ```bash
   # 在第 3 页插入蓝色矩形框，白色文字 "核心指标"
   python scripts/insert_shape.py unpacked/ --slide 3 --shape rect \
       --left 3 --top 2 --width 4 --height 1.5 \
       --fill 0070C0 --text "核心指标" --text-color FFFFFF --text-size 24 --text-bold 1

   # 插入红色圆角矩形
   python scripts/insert_shape.py unpacked/ --slide 1 --shape roundRect \
       --left 1 --top 1 --width 3 --height 1 --fill FF0000

   # 插入右箭头 + 文字
   python scripts/insert_shape.py unpacked/ --slide 2 --shape rightArrow \
       --left 5 --top 3 --width 2 --height 1 --fill FFD700 --text "下一步"

   # 预览（不实际修改）
   python scripts/insert_shape.py unpacked/ --slide 3 --shape rect --fill 0070C0 --dry-run
   ```

   ### 5c. 添加动画 → 使用 `add_animation.py`

   **如果任务涉及为幻灯片上的形状添加动画效果（淡入、飞入、擦除、缩放、出现、消失等），必须使用 `scripts/add_animation.py`。禁止编写自己的脚本或手动构建 `<p:timing>` XML。**

   ```bash
   # 给第 3 页的 "饼图" 添加淡入效果
   python scripts/add_animation.py unpacked/ --slide 3 --target "饼图" \
       --effect fade --direction in --duration 500

   # 给第 3 页的 "饼图" 添加淡出效果
   python scripts/add_animation.py unpacked/ --slide 3 --target "饼图" \
       --effect fade --direction out --duration 500

   # 给第 1 页 ID 为 5 的形状添加从左飞入
   python scripts/add_animation.py unpacked/ --slide 1 --target "5" \
       --effect fly --direction fromLeft --duration 800

   # 擦除进入，与前一个动画同时触发
   python scripts/add_animation.py unpacked/ --slide 2 --target "标题" \
       --effect wipe --direction in --trigger withPrevious

   # 预览（不实际修改）
   python scripts/add_animation.py unpacked/ --slide 3 --target "饼图" \
       --effect fade --direction in --dry-run
   ```

   ### 5d. 文本内容修改 → 使用编辑工具

   更新每个 `slide{N}.xml` 中的文本。
   **如果有子代理可用，在此处使用** — 幻灯片是独立的 XML 文件，子代理可以并行编辑。

6. **清理并打包为新文件 — 编辑工作流到此结束。**

   > 🚨 **强制要求**：本步直接执行，**不要向用户垂询**是否覆盖、是否确认。原文件永远不动，最终产物固定写入主 agent 提供的 `最终产物目录（output）`，文件名为 `<原始文件名不含扩展名>_edited.pptx`。若同名文件已存在，直接覆盖。

   > ⚠️ **`<UNPACKED_DIR>` 必须**与解包步骤（第 3 步）使用的路径**完全相同**。例如 `unpacked/`、`unpacked_test/`、绝对路径等。使用错误的路径会静默失败或操作错误目录。

   > ⛔ **常见错误 — 必读**：`pack.py` 的路径是 `scripts/office/pack.py`，**不是** `scripts/pack.py`。`clean.py` 的路径是 `scripts/clean.py`，**不在** `office/` 子目录下。写错路径会得到 `No such file or directory` 错误。

   **执行步骤**：

   1. **清理解包目录**：
      ```bash
      # ⚠️ 注意：clean.py 直接位于 scripts/ 目录下 — 不要加 office/ 前缀！
      python scripts/clean.py <UNPACKED_DIR>/
      ```

   2. **打包到 output 目录**（原文件永不覆盖）：
      ```bash
      # ⚠️ pack.py 位于 scripts/office/ 目录下 — 不要省略 office/ 部分！
      # 输出路径：<最终产物目录（output）>/<原始文件名不含扩展名>_edited.pptx
      python scripts/office/pack.py <UNPACKED_DIR>/ "<OUTPUT_DIR>/<原始文件名不含扩展名>_edited.pptx" --original "<原始文件路径>"
      ```

      例：原文件 `D:\foo\报告.pptx`，`<OUTPUT_DIR>` 为 `D:\...\workspace\conv_xxx\output`，则输出为 `D:\...\workspace\conv_xxx\output\报告_edited.pptx`。

   3. **返回结果摘要给用户**（仅信息性汇报，不含任何确认选项）：

      ```
      📋 编辑完成：
      - [列出所有修改项，例如：]
      - 3 张幻灯片的标题字体统一为：微软雅黑, 36pt
      - 第 3 页插入了蓝色矩形框 "核心指标"
      - 第 3 页饼图添加了淡入、淡出动画

      已生成新文件（原文件未动）：
      <OUTPUT_DIR>/<原始文件名>_edited.pptx
      ```

      摘要信息来源：
      - `change_font.py` 输出日志（字体、颜色、对齐方式的更改）
      - `insert_shape.py` 输出日志（形状插入）
      - `add_animation.py` 输出日志（动画效果）
      - 你自己使用编辑工具所做的更改（文本替换）

   **工作流共 5 个步骤。本步即最后一步，执行完成后返回产物路径即可。**

---

## 脚本列表

| 脚本 | 路径 | 用途 |
|------|------|------|
| `unpack.py` | `scripts/office/unpack.py` | 解包并格式化 PPTX 的 XML |
| `add_slide.py` | `scripts/add_slide.py` | 复制幻灯片或从布局创建 |
| `clean.py` | `scripts/clean.py` | 删除孤立文件 |
| `pack.py` | `scripts/office/pack.py` | 验证后重新打包 |
| `change_font.py` | `scripts/change_font.py` | 批量修改字体、大小、颜色、对齐方式等 |
| `insert_shape.py` | `scripts/insert_shape.py` | 在幻灯片中插入形状、文本框、箭头、标注 |
| `add_animation.py` | `scripts/add_animation.py` | 为形状添加动画效果（淡入、飞入、擦除、缩放等） |
| `merge_slides.py` | `scripts/merge_slides.py` | 合并多个 PPT 的幻灯片并统一主题 |
| `thumbnail.py` | `scripts/thumbnail.py` | 创建幻灯片缩略图网格 |

> ⚠️ **注意**：`unpack.py` 和 `pack.py` 位于 `scripts/office/` 子目录下，而不是直接在 `scripts/` 下。其他脚本直接位于 `scripts/` 下。

### unpack.py (`scripts/office/unpack.py`)

```bash
python scripts/office/unpack.py input.pptx <UNPACKED_DIR>/
```

解包 PPTX，格式化 XML，转义智能引号。`<UNPACKED_DIR>` 是你选择的任意目录名 — **记住它**，因为后续所有命令（脚本、清理、打包）都必须使用相同的路径。

### add_slide.py

```bash
python scripts/add_slide.py unpacked/ slide2.xml      # 复制幻灯片
python scripts/add_slide.py unpacked/ slideLayout2.xml # 从布局创建
```

输出要添加到 `<p:sldIdLst>` 中所需位置的 `<p:sldId>`。

### clean.py

```bash
python scripts/clean.py <UNPACKED_DIR>/
```

删除不在 `<p:sldIdLst>` 中的幻灯片、未引用的媒体文件、孤立的 rels 文件。`<UNPACKED_DIR>` 必须与解包步骤中使用的**相同目录**。

### pack.py (`scripts/office/pack.py`)

> ⚠️ 此脚本路径为 `scripts/office/pack.py`，不是 `scripts/pack.py`。

```bash
python scripts/office/pack.py <UNPACKED_DIR>/ output.pptx --original input.pptx
```

`<UNPACKED_DIR>` 必须与解包步骤中使用的**相同目录**。

验证、修复、压缩 XML，重新编码智能引号。

### change_font.py

```bash
python scripts/change_font.py unpacked/ --target title --font "微软雅黑" --size 36
python scripts/change_font.py unpacked/ --target body --font "Arial" --size 18 --ea-font "微软雅黑"
python scripts/change_font.py unpacked/ --target all --font "微软雅黑" --size 24 --bold 1 --italic 1
python scripts/change_font.py unpacked/ --target title --color FF0000 --align ctr
python scripts/change_font.py unpacked/ --target body --underline sng --color 0000FF
python scripts/change_font.py unpacked/ --target title --size 36 --dry-run
```

批量修改所有幻灯片的字体名称、大小、加粗、斜体、下划线、颜色和对齐方式。支持目标为 `title`（标题）、`body`（正文）或 `all`（全部）占位符。通过在幻灯片级别直接设置属性来处理完整的 OOXML 字体继承链（slide → slideLayout → slideMaster → theme）。

参数选项：
- `--target`：`title`（默认）、`body` 或 `all`
- `--font`：拉丁字体名称（例如 "Arial"、"微软雅黑"）
- `--ea-font`：东亚字体（未指定时默认使用 `--font` 的值）
- `--size`：字号，单位为磅（例如 36）
- `--bold`：0 或 1
- `--italic`：0 或 1
- `--underline`：下划线类型 — `none`、`sng`（单线）、`dbl`（双线）、`heavy`、`dotted`、`dash`、`wavy` 等
- `--color`：字体颜色，十六进制 RGB（例如 `FF0000` 红色，`0000FF` 蓝色）。带或不带 `#` 前缀均可
- `--align`：段落对齐 — `l`（左对齐）、`ctr`（居中）、`r`（右对齐）、`just`（两端对齐）
- `--dry-run`：预览更改但不实际修改文件

### insert_shape.py

```bash
# 蓝色矩形框 + 白色文字
python scripts/insert_shape.py unpacked/ --slide 3 --shape rect \
    --left 3 --top 2 --width 4 --height 1.5 \
    --fill 0070C0 --text "核心指标" --text-color FFFFFF --text-size 24 --text-bold 1

# 圆角矩形 + 红色边框
python scripts/insert_shape.py unpacked/ --slide 1 --shape roundRect \
    --left 1 --top 1 --width 3 --height 1 \
    --fill FF0000 --border-color 990000 --border-width 2

# 右箭头
python scripts/insert_shape.py unpacked/ --slide 2 --shape rightArrow \
    --left 5 --top 3 --width 2 --height 1 --fill FFD700 --text "下一步"

# 预览
python scripts/insert_shape.py unpacked/ --slide 3 --shape rect --fill 0070C0 --dry-run
```

在指定幻灯片的精确位置插入预设形状（矩形、箭头、标注、星形等）。支持填充颜色、边框、带字体/大小/颜色/对齐方式的文本。

参数选项：
- `--slide`：目标幻灯片编号（必需）
- `--shape`：形状类型 — `rect`（默认）、`roundRect`、`ellipse`、`diamond`、`triangle`、`rightArrow`、`leftArrow`、`upArrow`、`downArrow`、`chevron`、`star5`、`heart`、`flowChartProcess`、`callout1`、`cloud`、`plus` 以及 60 多种 OOXML 预设形状
- `--left`、`--top`：位置，单位为英寸（默认：1.0）
- `--width`、`--height`：尺寸，单位为英寸（默认：4.0 × 1.5）
- `--fill`：填充颜色，十六进制 RGB（例如 `0070C0` 蓝色）
- `--border-color`：边框颜色，十六进制 RGB
- `--border-width`：边框宽度，单位为磅（默认：1.0）
- `--rotation`：旋转角度，单位为度
- `--text`：形状内的文本内容
- `--text-color`：文本颜色，十六进制 RGB（默认：`000000`）
- `--text-font`：字体名称（例如 "微软雅黑"）
- `--text-size`：字号，单位为磅（默认：18）
- `--text-bold`：0 或 1
- `--text-align`：水平对齐 — `l`、`ctr`（默认）、`r`
- `--text-valign`：垂直对齐 — `t`、`ctr`（默认）、`b`
- `--name`：自定义形状名称
- `--dry-run`：预览更改但不实际修改文件

### add_animation.py

```bash
# 淡入效果
python scripts/add_animation.py unpacked/ --slide 3 --target "饼图" \
    --effect fade --direction in --duration 500

# 淡出效果
python scripts/add_animation.py unpacked/ --slide 3 --target "饼图" \
    --effect fade --direction out --duration 500

# 从左飞入
python scripts/add_animation.py unpacked/ --slide 1 --target "5" \
    --effect fly --direction fromLeft --duration 800

# 擦除进入，上一个动画之后自动触发
python scripts/add_animation.py unpacked/ --slide 2 --target "标题" \
    --effect wipe --direction in --trigger afterPrevious

# 预览
python scripts/add_animation.py unpacked/ --slide 3 --target "饼图" \
    --effect fade --direction in --dry-run
```

为指定幻灯片上的形状添加动画效果。支持进入、退出和强调动画。如果 `<p:timing>` 结构不存在，会自动创建完整结构，并重新编号所有 `p:cTn` ID。

`--target` 参数支持形状名称（模糊匹配）和形状 ID（精确匹配）。如果目标未找到，脚本会列出该幻灯片上的所有形状。

参数选项：
- `--slide`：目标幻灯片编号（必需）
- `--target`：形状名称或 ID（必需）— 例如 `"饼图"`、`"Chart 1"` 或 `"5"`
- `--effect`：动画效果 — `fade`（默认）、`fly`、`wipe`、`appear`、`disappear`、`zoom`、`split`、`wheel`、`bounce`、`float`、`swivel`
- `--direction`：效果方向 — `in`（默认）、`out`、`fromLeft`、`fromRight`、`fromTop`、`fromBottom`（飞入专用）
- `--duration`：持续时间，单位为毫秒（默认：500）
- `--delay`：延迟时间，单位为毫秒（默认：0）
- `--trigger`：触发类型 — `onClick`（默认）、`withPrevious`、`afterPrevious`
- `--dry-run`：预览更改但不实际修改文件

可以多次运行脚本为同一个形状添加多个动画（例如淡入 + 淡出）。

### merge_slides.py

```bash
# 合并两个 PPT 到 base，统一使用 base 的主题配色
python scripts/merge_slides.py unpacked_a/ --source unpacked_b/ unpacked_c/ --adopt-theme

# 合并到开头
python scripts/merge_slides.py unpacked_a/ --source unpacked_b/ --insert-at start

# 插入到第 3 张幻灯片之后
python scripts/merge_slides.py unpacked_a/ --source unpacked_b/ --insert-at 3

# 预览操作
python scripts/merge_slides.py unpacked_a/ --source unpacked_b/ --adopt-theme --dry-run
```

将一个或多个源解包 PPTX 目录中的幻灯片合并到基础目录中。处理幻灯片重新编号、媒体去重、关系 ID 重映射、布局匹配（用于主题统一）、presentation.xml 更新和 Content_Types.xml 注册。

参数选项：
- `base_dir`：基础 PPTX 解包目录（其主题/母版/布局将作为标准）
- `--source`：一个或多个要合并的源解包 PPTX 目录
- `--adopt-theme`：将源幻灯片的布局重映射到基础中最匹配的布局（统一配色方案）
- `--insert-at`：插入位置 — `end`（默认）、`start` 或幻灯片编号
- `--dry-run`：预览更改但不实际修改文件

布局匹配策略（使用 `--adopt-theme` 时）：
1. 精确名称匹配（例如两者都命名为 "Title Slide"）
2. 精确占位符类型组合匹配
3. 占位符类型的最佳重叠得分

### thumbnail.py

```bash
python scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
```

生成带有幻灯片文件名标签的 `thumbnails.jpg`。默认 3 列，每页最多 12 张。

**仅用于模板分析**（选择布局）。进行视觉质量检查时，使用 `soffice` + `pdftoppm` 创建全分辨率的单张幻灯片图片 — 参见 SKILL.md。

---

## 幻灯片操作

幻灯片顺序在 `ppt/presentation.xml` → `<p:sldIdLst>` 中。

**重新排序**：重新排列 `<p:sldId>` 元素。

**删除**：移除 `<p:sldId>`，然后运行 `clean.py`。

**添加**：使用 `add_slide.py`。永远不要手动复制幻灯片文件 — 脚本会处理备注引用、Content_Types.xml 和关系 ID，手动复制会遗漏这些。

---

## 合并工作流

> 🚨 **重要提示**：合并 PPT 需要在运行合并脚本之前执行**前置步骤**。你**必须**先解包所有输入的 PPT 文件。`merge_slides.py` 操作的是**解包后的目录**，不是直接操作 `.pptx` 文件。跳过解包步骤将会失败。

> 🚨 **禁止行为**：禁止使用 `python-pptx` 库，禁止自行编写合并/组合 Python 脚本，禁止手动复制幻灯片 XML 文件。必须使用提供的 `scripts/merge_slides.py`。如果遇到任何依赖安装问题，请修复依赖 — 不要切换到替代方案。
>
> 🚨 **禁止回退**：如果依赖安装失败或 `merge_slides.py` 报错，请调试并修复问题。绝不回退到 `python-pptx` 或任何其他库/方案。合并任务中禁止使用"让我换个方案试试"或"让我改用 python-pptx"这种说法。只有一种正确的合并 PPT 方式：`scripts/merge_slides.py`。

> ⚠️ **提醒**：运行下面的任何命令前，确保已经 `cd` 到 pptx 技能根目录。PPT 文件和解包目录使用**绝对路径**。

合并多个 PPT 为一个并统一样式时：

1. **解包所有 PPT** 到各自的目录：
   ```bash
   python scripts/office/unpack.py a.pptx unpacked_a/
   python scripts/office/unpack.py b.pptx unpacked_b/
   python scripts/office/unpack.py c.pptx unpacked_c/
   ```

2. **分析每个 PPT** 以决定哪个作为基础（保留其主题/配色方案的那个）：
   ```bash
   python scripts/thumbnail.py a.pptx
   python scripts/thumbnail.py b.pptx
   python scripts/thumbnail.py c.pptx
   ```

3. **运行合并**，使用 `--adopt-theme` 统一样式：
   ```bash
   python scripts/merge_slides.py unpacked_a/ --source unpacked_b/ unpacked_c/ --adopt-theme
   ```

4. **可选：统一字体**，合并后使用 `change_font.py`：
   ```bash
   python scripts/change_font.py unpacked_a/ --target all --font "微软雅黑" --size 24
   ```

5. **清理并打包为新文件**（使用第 1 步中的**相同基础目录**）：
   ```bash
   python scripts/clean.py unpacked_a/
   # ⚠️ pack.py 位于 scripts/office/ 目录下 — 不要省略 office/ 部分！
   # 输出到会话的 最终产物目录（output），文件名为 merged_output.pptx（或根据语义起名）
   python scripts/office/pack.py unpacked_a/ "<OUTPUT_DIR>/merged_output.pptx"
   ```
   > ⚠️ 这里的 `unpacked_a/` 必须与第 1 步解包基础 PPT 时使用的**完全相同的路径**。输出文件固定写入 `<OUTPUT_DIR>`（主 agent 提供的产物目录），禁止覆盖任何输入文件。本步**不要向用户垂询确认**。
   >
   > ⛔ **常见错误**：正确路径是 `scripts/office/pack.py`，不是 `scripts/pack.py`。`office/` 子目录是必需的。

> ⚠️ **注意**：合并脚本在基础目录上就地操作。合并完成后，`unpacked_a/` 包含所有幻灯片。源目录（`unpacked_b/`、`unpacked_c/`）不会被修改。

---

## 编辑内容

**子代理：** 如果可用，在此处使用（完成第 4 步之后）。每张幻灯片是独立的 XML 文件，子代理可以并行编辑。在给子代理的提示中，包含：
- 要编辑的幻灯片文件路径
- **"使用编辑工具进行所有更改"**
- 下方的格式化规则和常见陷阱

对于每张幻灯片：
1. 读取幻灯片的 XML
2. 识别所有占位符内容 — 文本、图片、图表、图标、说明文字
3. 用最终内容替换每个占位符

**使用编辑工具，而非 sed 或 Python 脚本。** 编辑工具强制明确指定替换内容和位置，可靠性更高。

### 格式化规则

- **对所有标题、副标题和行内标签加粗**：在 `<a:rPr>` 上使用 `b="1"`。包括：
  - 幻灯片标题
  - 幻灯片内的章节标题
  - 行首的行内标签（例如："状态："、"描述："）
- **不要使用 Unicode 项目符号（•）**：使用 `<a:buChar>` 或 `<a:buAutoNum>` 的正确列表格式
- **项目符号一致性**：让项目符号从布局继承。仅在需要时指定 `<a:buChar>` 或 `<a:buNone>`。

---

## 常见陷阱

### 模板适配

当源内容的条目比模板少时：
- **完整移除多余的元素**（图片、形状、文本框），而不是仅清空文本
- 清空文本内容后检查是否有孤立的视觉元素
- 运行视觉质量检查以发现数量不匹配的问题

替换文本长度不同时：
- **更短的替换**：通常安全
- **更长的替换**：可能溢出或意外换行
- 文本更改后进行视觉质量检查
- 考虑截断或拆分内容以适应模板的设计约束

**模板槽位 ≠ 源条目数**：如果模板有 4 个团队成员但源数据只有 3 个用户，删除第 4 个成员的整个组（图片 + 文本框），而不仅仅是文本。

### 多条目内容

如果源数据有多个条目（编号列表、多个章节），为每个条目创建独立的 `<a:p>` 元素 — **不要连接成一个字符串**。

**❌ 错误做法** — 所有条目在一个段落中：
```xml
<a:p>
  <a:r><a:rPr .../><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
```

**✅ 正确做法** — 独立段落，标题加粗：
```xml
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" .../><a:t>Do the first thing.</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 2</a:t></a:r>
</a:p>
<!-- 继续此模式 -->
```

从原始段落复制 `<a:pPr>` 以保留行距。标题使用 `b="1"` 加粗。

### 智能引号

解包/打包会自动处理。但编辑工具会将智能引号转换为 ASCII。

**添加包含引号的新文本时，使用 XML 实体：**

```xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
```

| 字符 | 名称 | Unicode | XML 实体 |
|------|------|---------|----------|
| `\u201c` | 左双引号 | U+201C | `&#x201C;` |
| `\u201d` | 右双引号 | U+201D | `&#x201D;` |
| `\u2018` | 左单引号 | U+2018 | `&#x2018;` |
| `\u2019` | 右单引号 | U+2019 | `&#x2019;` |

### 其他注意事项

- **空白字符**：对于有前导/尾随空格的 `<a:t>`，使用 `xml:space="preserve"`
- **XML 解析**：使用 `defusedxml.minidom`，而非 `xml.etree.ElementTree`（后者会破坏命名空间）
