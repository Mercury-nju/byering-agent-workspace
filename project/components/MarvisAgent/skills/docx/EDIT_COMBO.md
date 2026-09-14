# 组合任务流程

> 本文档说明当用户任务涉及 **2 种及以上功能类型**时（如"插入内容 + 设置页眉"、"添加封面 + 修改格式 + 加页码"等），如何在一次解包-打包周期内完成所有操作。

---

## 核心原则

> ⚠️ **整个任务只解包一次、只打包一次！** 所有子操作共享同一个解包目录，在一次解包-打包周期内依次完成。

## 🚫 禁止操作清单

- 🚫 **禁止每个子操作单独执行"解包→操作→打包"流程**
- 🚫 **禁止在中间步骤解包检查/验证结果**
- 🚫 **禁止自己手动操作底层 XML 文件**（如 rels、Content_Types 等），应使用对应的专用脚本
- 🚫 **禁止手动创建页眉页脚 XML 文件**（如 header*.xml、footer*.xml 等），页眉页脚文件由 `header_footer.py` 自动管理。封面页等插入内容应先用 `write_file` 工具写入 XML 片段文件，再传文件路径给 `insert_xml.py`（详见 [EDIT_INSERT.md](EDIT_INSERT.md)）
- 🚫 **禁止输出路径覆盖源文档**，必须新建文件

---

## 完整流程（3 步）

### 第 1 步：解包

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

### 第 2 步：按推荐顺序依次执行各子操作

**执行前必做：任务拆解**

在执行任何操作之前，先完成以下拆解：
1. **识别子操作**：将用户任务拆解为多个独立的子操作，明确每个子操作属于下表中的哪种操作类型
2. **确定脚本和参数**：为每个子操作确定对应的专用脚本，并预先规划好脚本参数
3. **按推荐顺序排列**：将所有子操作按下方"推荐执行顺序"表排列
4. **一次性执行**：在一次解包-打包周期内，按排列好的顺序依次执行所有子操作

**推荐执行顺序：**

| 顺序 | 操作类型 | 对应脚本 | 排序原因 |
|------|---------|----------|---------|
| ① | 内容插入（段落、表格、封面页等） | `insert_xml.py` / `insert_image.py` | 最先执行——先有内容，后续才能对其改格式或加批注 |
| ② | 内容删除（删除段落、图片、表格等） | `delete_element.py` | 在插入之后、格式修改之前执行，避免删除后索引变化影响插入 |
| ③ | 页眉页脚（添加/修改页眉、页脚、页码） | `header_footer.py` | 操作独立的 header/footer XML 文件，不影响 document.xml，可灵活安排 |
| ④ | 格式修改（字体、字号、颜色、对齐等） | `modify_format.py` / `modify_style.py` | 在内容操作完成后执行，避免新插入的内容覆盖已设置的格式 |
| ⑤ | 批注/标注 | `add_comment_mark.py` / `comment.py` | 最后执行——需要最终文本才能准确定位批注位置 |

> 💡 如果任务不涉及某种操作类型，直接跳过该顺序。例如任务只涉及"内容插入 + 页眉页脚"，则只执行 ① 和 ③。

各子操作详细参数说明参见对应子文档：
- 内容插入详见 [EDIT_INSERT.md](EDIT_INSERT.md)
- 内容删除详见 [EDIT_DELETE.md](EDIT_DELETE.md)
- 页眉页脚详见 [EDIT_HEADER_FOOTER.md](EDIT_HEADER_FOOTER.md)
- 格式修改详见 [EDIT_FORMAT.md](EDIT_FORMAT.md)
- 批注/标注详见 [EDIT_COMMENT.md](EDIT_COMMENT.md)

### 第 3 步：打包

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 不要再解包验证、不要再读取 XML 检查结果。直接告知用户操作已完成即可。

---

## 典型示例

### 示例 1：论文格式化（添加封面 + 页眉 + 页码）

**任务描述：** 用户要求"添加首页封面（居中放文档标题）+ 其他页面加页眉（显示文档标题）+ 所有页面加页码（5号宋体居中）"

**操作拆解：**
- 子操作 A（内容插入 ①）：用 `insert_xml.py` 在文档开头插入封面页内容（居中标题 + 分页符）
- 子操作 B（页眉页脚 ③）：用 `header_footer.py` 添加 default 页眉（显示标题）、添加 first 空页眉（首页无页眉）、添加页脚页码（不指定 --position 则默认 all，同时添加 default + first 确保覆盖所有页面）

**完整命令序列：**

```bash
# 第 1 步：解包
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/

# 第 2 步-A：内容插入 —— 先用 write_file 工具创建封面页 XML 文件，再传文件路径给 insert_xml.py
# 封面页内容：居中标题段落 + 分页符
# 1) 用 write_file 工具创建 cover.xml，内容如下（⚠️ pPr 内子元素必须按 spacing → jc 顺序排列）：
#    <w:p><w:pPr><w:spacing w:before="6000"/><w:jc w:val="center"/></w:pPr>
#      <w:r><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="52"/></w:rPr>
#        <w:t>文档标题</w:t></w:r></w:p>
#    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
# 2) 调用 insert_xml.py 插入
python scripts/insert_xml.py <结果产物目录>/unpacked/ cover.xml --prepend

# 第 2 步-B：页眉页脚 —— 依次添加页眉和页脚
# 添加默认页眉（非首页显示文档标题）
python scripts/header_footer.py <结果产物目录>/unpacked/ add --type header --position default --text "文档标题" --font 宋体 --size 10.5 --align center

# 添加首页空页眉（首页不显示页眉，传入空文本）
python scripts/header_footer.py <结果产物目录>/unpacked/ add --type header --position first --text " "

# 所有页面添加页码（--position all 同时添加 default + first，确保覆盖所有页面，5号宋体 = 10.5磅）
python scripts/header_footer.py <结果产物目录>/unpacked/ add --type footer --text "{PAGE}" --font 宋体 --size 10.5 --align center

# 第 3 步：打包
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

---

### 示例 2：文档排版优化（修改样式 + 插入图片 + 添加批注）

**任务描述：** 用户要求"把标题改成黑体 + 在第二章后插入一张图片 + 给文中'错误'二字加批注'此处表述有误，建议修改'"

**操作拆解：**
- 子操作 A（内容插入 ①）：用 `insert_image.py` 在第二章标题之后插入图片
- 子操作 B（格式修改 ④）：用 `modify_style.py` 将标题样式改为黑体
- 子操作 C（批注 ⑤）：用 `add_comment_mark.py` 给"错误"文字添加批注

**完整命令序列：**

```bash
# 第 1 步：解包
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/

# 第 2 步-A：内容插入 —— 在第二章标题后插入图片
python scripts/insert_image.py <结果产物目录>/unpacked/ /path/to/image.jpg --width 15 --after-heading "第二章"

# 第 2 步-B：格式修改 —— 将标题样式改为黑体
python scripts/modify_style.py <结果产物目录>/unpacked/ --style "heading 1" --font 黑体

# 第 2 步-C：批注 —— 给"错误"文字添加批注
python scripts/add_comment_mark.py <结果产物目录>/unpacked/ --text "错误" --comment "此处表述有误，建议修改"

# 第 3 步：打包
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```
