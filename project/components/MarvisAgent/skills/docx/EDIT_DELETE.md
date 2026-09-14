# 内容删除完整流程

> 本文档说明如何从 .docx 文档中删除内容（图片、表格、段落、整页等）。

---

## 🚫 禁止操作清单

- 🚫 **禁止使用 `find_page.py` 查找页面位置或文本位置**（`delete_element.py` 内置了页面定位，不需要预先查找）
- 🚫 **禁止读取 `document.xml`** 查看内容或查找元素位置
- 🚫 **禁止自己编写 Python 脚本**来定位、查找或删除 XML 元素
- 🚫 **禁止打包后再解包验证**删除结果，打包完成即流程结束
- 🚫 **禁止自己发明参数名**（如 `--element-type`、`--type`）—— 必须严格使用 `--target`
- 🚫 **禁止输出路径覆盖源文档**，必须新建文件

---

## 完整流程（3 步）

> ⚠️ **整个删除流程只有 3 条命令：解包 → 运行 `delete_element.py` → 打包。除此之外不需要任何其他操作。**

### 第 1 步：解包文档

```bash
python scripts/office/unpack.py document.docx <结果产物目录>/unpacked/
```

### 第 2 步：使用 `delete_element.py` 删除目标元素

> ⚠️ **脚本路径：`scripts/delete_element.py`（在 scripts/ 根目录下）**
>
> ⚠️ **参数名称必须严格使用 `--target`，不要使用 `--element-type`、`--type` 等其他名称（脚本不认识，会报错）。**

```bash
# 基本语法（注意：参数名是 --target，不是 --element-type）
python scripts/delete_element.py <结果产物目录>/unpacked/ --target <TYPE> [定位参数]
```

**`--target` 目标类型（必选）：**

| 值 | 说明 | 匹配的 XML 元素 |
|----|------|------------------|
| `image` | 图片 | 包含 `<w:drawing>` 或 `<v:imagedata>` 的 `<w:p>` |
| `table` | 表格 | `<w:tbl>` |
| `paragraph` | 段落 | `<w:p>` |
| `page` | 整页所有内容（必须配合 `--page` 使用） | 页面范围内的所有 body 子元素 |

**定位参数（互斥，只能选其一）：**

| 参数 | 说明 | 示例 |
|------|------|------|
| `--page N` | 第 N 页中的目标元素 | `--page 3` |
| `--page last` | 最后一页中的目标元素 | `--page last` |
| `--after-text TEXT` | 指定文本之后的第一个目标元素 | `--after-text "2024-2025学年度"` |
| `--after-heading TEXT` | 指定标题之后的第一个目标元素 | `--after-heading "总结"` |
| `--before-text TEXT` | 指定文本之前的最后一个目标元素 | `--before-text "附录"` |
| `--before-heading TEXT` | 指定标题之前的最后一个目标元素 | `--before-heading "第三章"` |
| `--first` | 文档中第一个目标元素 | `--first` |
| `--last` | 文档中最后一个目标元素 | `--last` |
| `--nth N` | 文档中第 N 个目标元素（1-based） | `--nth 2` |

**选项参数：**

| 参数 | 说明 |
|------|------|
| `--all` | 删除范围内所有匹配的目标元素（默认只删第一个） |
| `--dry-run` | 预览模式，只显示将要删除的内容，不实际修改 |

**使用示例：**

```bash
# 删除最后一页的图片
python scripts/delete_element.py <结果产物目录>/unpacked/ --target image --page last

# 删除第一页的图片
python scripts/delete_element.py <结果产物目录>/unpacked/ --target image --page 1

# 删除第三页的图片
python scripts/delete_element.py <结果产物目录>/unpacked/ --target image --page 3

# 删除"2024-2025学年度第二学期"后的图片
python scripts/delete_element.py <结果产物目录>/unpacked/ --target image --after-text "2024-2025学年度第二学期"

# 删除最后一页的表格
python scripts/delete_element.py <结果产物目录>/unpacked/ --target table --page last

# 删除第三页的表格
python scripts/delete_element.py <结果产物目录>/unpacked/ --target table --page 3

# 删除"2024-2025学年度第二学期"后的表格
python scripts/delete_element.py <结果产物目录>/unpacked/ --target table --after-text "2024-2025学年度第二学期"

# 删除文档最末尾的段落
python scripts/delete_element.py <结果产物目录>/unpacked/ --target paragraph --last

# 删除"孩子们，在假期里"后的段落
python scripts/delete_element.py <结果产物目录>/unpacked/ --target paragraph --after-text "孩子们，在假期里"

# 删除最后一页所有内容
python scripts/delete_element.py <结果产物目录>/unpacked/ --target page --page last

# 删除第三页所有内容
python scripts/delete_element.py <结果产物目录>/unpacked/ --target page --page 3

# 预览将要删除的内容（不实际修改）
python scripts/delete_element.py <结果产物目录>/unpacked/ --target image --page last --dry-run

# 删除第三页的所有图片（而非仅第一个）
python scripts/delete_element.py <结果产物目录>/unpacked/ --target image --page 3 --all
```

> ⚠️ **`--page` 参数的页码检测依赖 XML 中的分页标记**。如果文档从未在 Word 中打开保存过，可能缺少 `lastRenderedPageBreak` 标记，导致页码检测不准确。此时建议使用 `--after-text` 或 `--after-heading` 按文本定位。

### 第 3 步：打包生成文档

⚠️ 打包规则参见 [SKILL.md 通用规则](SKILL.md#通用规则)

```bash
python scripts/office/pack.py <结果产物目录>/unpacked/ <结果产物目录>/output.docx --original document.docx
```

⚠️ **打包完成即流程结束。** 不要再解包验证、不要再读取 XML 检查删除结果。直接告知用户删除已完成即可。
