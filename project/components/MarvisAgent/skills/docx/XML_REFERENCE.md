# XML 参考

> 本文档是 OOXML 格式参考，供手动编辑 XML 时查阅。大多数操作应使用专用脚本（`modify_format.py`、`add_comment_mark.py` 等），只有在通用编辑流程中手动修改 XML 时才需要参考本文档。

---

## 架构合规性

- **⚠️ `<w:pPr>` 中的元素顺序（必须严格遵守，顺序错误会导致验证失败）**：
  `pStyle` → `keepNext` → `keepLines` → `pageBreakBefore` → `widowControl` → `numPr` → `pBorders` → `shd` → `spacing` → `ind` → `jc` → `outlineLvl` → `rPr`（最后）
  **常用速记：spacing 在 jc 前面，ind 在 jc 前面，pStyle 在最前面，rPr 在最后面**
- **空白处理**：在包含前导/尾随空格的 `<w:t>` 上添加 `xml:space="preserve"`
- **RSID**：必须是 8 位十六进制数（例如 `00AB1234`）

---

## 格式修改 XML 结构

> 💡 **提示**：大多数格式修改应使用 `scripts/modify_format.py` 或 `scripts/modify_style.py` 脚本，而非手动编辑 XML。本节仅供理解底层结构时参考。

### run 级别格式（字体、字号、加粗、斜体、颜色等）

```xml
<w:rPr>
  <w:rFonts w:ascii="微软雅黑" w:eastAsia="微软雅黑" w:hAnsi="微软雅黑" w:cs="微软雅黑"/>
  <w:b/>          <!-- 加粗 -->
  <w:bCs/>        <!-- 复杂脚本加粗（中文文档建议同时添加） -->
  <w:i/>          <!-- 斜体 -->
  <w:iCs/>        <!-- 复杂脚本斜体 -->
  <w:sz w:val="28"/>    <!-- 字号 = val/2 磅，28 = 14磅 -->
  <w:szCs w:val="28"/>  <!-- 复杂脚本字号（建议与 sz 保持一致） -->
  <w:color w:val="FF0000"/>  <!-- 字体颜色（RGB 十六进制） -->
  <w:u w:val="single"/>      <!-- 下划线 -->
  <w:strike/>                <!-- 删除线 -->
</w:rPr>
```

**注意事项：**
- 如果 `<w:r>` 中没有 `<w:rPr>`，需要新建一个 `<w:rPr>` 作为 `<w:r>` 的第一个子元素
- 如果已有 `<w:rPr>`，在其中添加或替换对应元素即可（注意不要破坏已有的其他格式属性）
- 同一段落的所有 `<w:r>` 都需要修改，否则格式不一致
- 取消加粗：将 `<w:b/>` 改为 `<w:b w:val="0"/>`，或直接删除 `<w:b/>`

### 段落级别格式（对齐、行距、缩进等）

> ⚠️ **`<w:pPr>` 内子元素必须按规定顺序排列，否则 Schema 验证会失败！** 正确顺序：`spacing` → `ind` → `jc`（详见上方"架构合规性"章节）

```xml
<w:pPr>
  <!-- ⚠️ 子元素顺序：spacing → ind → jc，不可颠倒 -->
  <w:spacing w:line="360" w:lineRule="auto" w:before="120" w:after="120"/>  <!-- 行距 + 段前段后间距 -->
  <w:ind w:firstLine="480"/>  <!-- 首行缩进（单位：缇，480 ≈ 2个中文字符） -->
  <w:jc w:val="center"/>  <!-- 对齐：left / center / right / both（两端对齐） -->
</w:pPr>
```

> 💡 **行距说明**：`w:line="360"` + `w:lineRule="auto"` = 1.5 倍行距（240 = 单倍行距）。段前段后间距单位为缇（20 缇 = 1 磅）。

### 常用字号速查表

| 中文字号 | 磅值 (pt) | `<w:sz>` val 值 |
|----------|-----------|-----------------|
| 小四 | 12 | 24 |
| 四号 | 14 | 28 |
| 小三 | 15 | 30 |
| 三号 | 16 | 32 |
| 小二 | 18 | 36 |
| 二号 | 22 | 44 |
| 小一 | 24 | 48 |
| 一号 | 26 | 52 |
| 小初 | 36 | 72 |
| 初号 | 42 | 84 |

### 操作示例 — 将第一段设为微软雅黑、14磅、加粗

找到第一个 `<w:p>` 中的每个 `<w:r>`，在其 `<w:rPr>` 中添加或替换对应元素：

```xml
<w:r>
  <w:rPr>
    <w:rFonts w:ascii="微软雅黑" w:eastAsia="微软雅黑" w:hAnsi="微软雅黑" w:cs="微软雅黑"/>
    <w:b/>
    <w:bCs/>
    <w:sz w:val="28"/>
    <w:szCs w:val="28"/>
  </w:rPr>
  <w:t>段落文本内容</w:t>
</w:r>
```

---

## 修订 XML 结构

### 插入修订

```xml
<w:ins w:id="1" w:author="yyb" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>插入的文本</w:t></w:r>
</w:ins>
```

### 删除修订

```xml
<w:del w:id="2" w:author="yyb" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>删除的文本</w:delText></w:r>
</w:del>
```

> ⚠️ **在 `<w:del>` 内部**：使用 `<w:delText>` 而非 `<w:t>`，使用 `<w:delInstrText>` 而非 `<w:instrText>`。

### 最小化编辑 — 只标记变更部分

```xml
<!-- 将 "30 天" 改为 "60 天" -->
<w:r><w:t>期限为 </w:t></w:r>
<w:del w:id="1" w:author="yyb" w:date="...">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="yyb" w:date="...">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r><w:t> 天。</w:t></w:r>
```

### 删除整个段落

当删除段落中的所有内容时，还需标记段落标记为已删除，以便与下一段落合并。在 `<w:pPr><w:rPr>` 中添加 `<w:del/>`：

```xml
<w:p>
  <w:pPr>
    <w:numPr>...</w:numPr>  <!-- 列表编号（如有） -->
    <w:rPr>
      <w:del w:id="1" w:author="yyb" w:date="2025-01-01T00:00:00Z"/>
    </w:rPr>
  </w:pPr>
  <w:del w:id="2" w:author="yyb" w:date="2025-01-01T00:00:00Z">
    <w:r><w:delText>正在删除的整个段落内容...</w:delText></w:r>
  </w:del>
</w:p>
```

> ⚠️ 如果没有在 `<w:pPr><w:rPr>` 中添加 `<w:del/>`，接受修改后会留下空段落/列表项。

### 拒绝他人插入 / 恢复他人删除

```xml
<!-- 拒绝他人插入：在其插入内部嵌套删除 -->
<w:ins w:author="Jane" w:id="5">
  <w:del w:author="yyb" w:id="10">
    <w:r><w:delText>他们插入的文本</w:delText></w:r>
  </w:del>
</w:ins>

<!-- 恢复他人删除：在其后添加插入（不要修改其删除内容） -->
<w:del w:author="Jane" w:id="5">
  <w:r><w:delText>已删除的文本</w:delText></w:r>
</w:del>
<w:ins w:author="yyb" w:id="10">
  <w:r><w:t>已删除的文本</w:t></w:r>
</w:ins>
```

### 常见陷阱

- **替换整个 `<w:r>` 元素**：添加修订时，将整个 `<w:r>...</w:r>` 块替换为并列的 `<w:del>...<w:ins>...`。不要在 run 内部注入修订标记。
- **保留 `<w:rPr>` 格式**：将原始 run 的 `<w:rPr>` 块复制到修订 run 中，以保持粗体、字号等格式。

---

## 批注 XML 结构

> 💡 **提示**：批注应使用 `scripts/add_comment_mark.py` 脚本一键完成，通常不需要手动编写批注 XML。本节仅供理解底层结构时参考。

**重要：`<w:commentRangeStart>` 和 `<w:commentRangeEnd>` 是 `<w:r>` 的兄弟元素，永远不能在 `<w:r>` 内部。**

```xml
<!-- 批注标记是 w:p 的直接子元素，永远不在 w:r 内部 -->
<w:commentRangeStart w:id="0"/>
<w:r><w:t>被批注的文本</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r>
  <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
  <w:commentReference w:id="0"/>
</w:r>

<!-- 批注 0 及其嵌套的回复 1 -->
<w:commentRangeStart w:id="0"/>
  <w:commentRangeStart w:id="1"/>
  <w:r><w:t>文本</w:t></w:r>
  <w:commentRangeEnd w:id="1"/>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="1"/></w:r>
```

---

## 图片 XML 说明

> 💡 **提示**：图片插入应使用 `scripts/insert_image.py` 脚本，脚本会自动完成以下所有操作，通常不需要手动编写图片 XML。

脚本会自动完成：
1. 复制图片到 `word/media/`
2. 在 `word/_rels/document.xml.rels` 中添加关系
3. 在 `[Content_Types].xml` 中添加内容类型
4. 生成完整的 `<w:p>` XML 片段
5. 使用位置参数时，自动将 XML 插入到 document.xml 的对应位置

---

## 智能引号 XML 实体

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

> 💡 解包时（`unpack.py`）会自动将文档中的智能引号转换为 XML 实体，以便在编辑过程中保留。
