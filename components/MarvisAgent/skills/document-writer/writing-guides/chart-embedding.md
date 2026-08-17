# 图表嵌入规范（图文报告专用）

> 📌 本规范在**文档需嵌入图表**时加载（通常由上游分析类技能传递图表数据给本技能）。纯文字文档可跳过本文件。
>
> **使用时机**：Step 4 动笔前若判断产物需要图表，与 `writing-guides/common.md` 叠加生效。

---

## 一、图表嵌入总则

图表嵌入支持两种方式，**按最终输出格式二选一**：

| 输出格式 | 嵌入方式 | 说明 |
|---------|---------|------|
| `.html`（推荐） | **ECharts 动态图表占位标记** | 在 `.md` 中写 `<!-- ECHARTS: {JSON} -->`，`md_to_html.py` 转换时渲染为交互式图表 |
| `.md` | **图片相对路径引用** | `![描述](./charts/xxx.png)`，图表文件必须先复制到 `./charts/` 子目录 |

**优先级规则**：上游同时传递了图片路径与结构化图表数据时，**优先使用结构化数据**进行 ECharts 渲染（仅 `.html` 场景）。仅传图片路径时，`md_to_html.py` 会自动把图片转为 base64 内嵌到 HTML，确保自包含。

---

## 二、ECharts 图表数据协议（输出 `.html` 时）

### 2.1 占位标记格式

一行一个图表，完整 JSON 放入 HTML 注释中：

```markdown
<!-- ECHARTS: {"chart_type": "bar", "title": "月度销售额对比", "data": {"labels": ["1月", "2月", "3月"], "values": [120, 200, 150]}} -->
```

- Markdown 渲染时占位标记不可见
- `md_to_html.py` 解析后替换为 `<div>` + `<script>` 渲染代码
- 支持的图表类型：`bar`（柱状图）、`line`（折线图）、`pie`（饼图）、`radar`（雷达图）、`scatter`（散点图）

### 2.2 JSON 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chart_type` | string | ✅ | `bar` / `line` / `pie` / `radar` / `scatter` |
| `title` | string | ✅ | 图表标题，显示在图表上方 |
| `data` | object | ✅ | 数据集，含 `labels` 和 `values` / `series` |
| `options` | object | ❌ | ECharts 原生配置项，用于覆盖默认 option（高级用法） |

**`data` 子字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `labels` | string[] | 数据标签 / 类别名称列表 |
| `values` | number[] | 单系列数据值（与 `labels` 一一对应） |
| `series` | object[] | 多系列数据（与 `values` 二选一），每项含 `name`（系列名）与 `values` |

### 2.3 各图表类型完整示例

**柱状图 — 单系列：**

```markdown
<!-- ECHARTS: {"chart_type": "bar", "title": "各区域销售额", "data": {"labels": ["华东", "华南", "华北", "西南", "华中"], "values": [320, 280, 250, 180, 210]}} -->
```

**柱状图 — 多系列：**

```markdown
<!-- ECHARTS: {"chart_type": "bar", "title": "各区域季度销售对比", "data": {"labels": ["华东", "华南", "华北", "西南"], "series": [{"name": "Q1", "values": [120, 100, 90, 70]}, {"name": "Q2", "values": [150, 130, 110, 85]}, {"name": "Q3", "values": [180, 160, 130, 95]}]}} -->
```

**折线图 — 多系列：**

```markdown
<!-- ECHARTS: {"chart_type": "line", "title": "月度销售额与利润趋势", "data": {"labels": ["1月", "2月", "3月", "4月", "5月", "6月"], "series": [{"name": "销售额", "values": [120, 200, 150, 180, 250, 220]}, {"name": "利润", "values": [30, 50, 40, 45, 65, 55]}]}} -->
```

**饼图：**

```markdown
<!-- ECHARTS: {"chart_type": "pie", "title": "产品类别销售占比", "data": {"labels": ["电子产品", "服装", "食品", "家居", "其他"], "values": [35, 25, 20, 12, 8]}} -->
```

**雷达图：**

```markdown
<!-- ECHARTS: {"chart_type": "radar", "title": "员工能力画像", "data": {"labels": ["技术能力", "沟通能力", "团队协作", "创新思维", "执行力", "学习能力"], "values": [90, 75, 85, 70, 88, 82]}} -->
```

**散点图：**

```markdown
<!-- ECHARTS: {"chart_type": "scatter", "title": "价格与销量关系", "data": {"labels": [], "values": [[10, 120], [15, 95], [20, 80], [25, 70], [30, 55], [35, 40]]}} -->
```

**自定义 options 覆盖默认配置（高级用法）：**

```markdown
<!-- ECHARTS: {"chart_type": "bar", "title": "自定义样式示例", "data": {"labels": ["A", "B", "C"], "values": [100, 200, 150]}, "options": {"color": ["#5470c6", "#91cc75", "#fac858"], "series": [{"itemStyle": {"borderRadius": [8, 8, 0, 0]}}]}} -->
```

---

## 三、图片相对路径引用（输出 `.md` 时）

### 3.1 预处理：复制图表到 `charts/` 子目录

接收到图表文件清单后，**动笔前必须先**将文件复制到输出目录下的 `charts/` 子目录，并按相对路径引用：

```python
import os
import shutil


def prepare_charts(chart_files: list[dict], output_dir: str) -> dict:
    """复制图表文件到 output_dir/charts/ 并生成相对路径映射。

    :param chart_files: 上游传递的图表清单
        [{"path": "绝对路径", "description": "主题描述", "section": "建议章节"}, ...]
    :param output_dir: 报告输出目录的绝对路径
    :return: 描述 -> {"md": "![xxx](./charts/xxx.png)", "section": "建议章节"} 映射
    """
    charts_dir = os.path.join(output_dir, "charts")
    os.makedirs(charts_dir, exist_ok=True)

    chart_md_map = {}
    for chart in chart_files:
        src_path = chart["path"]
        description = chart["description"]
        filename = os.path.basename(src_path)
        dst_path = os.path.join(charts_dir, filename)

        if not os.path.exists(src_path):
            chart_md_map[description] = {
                "md": f"[图表加载失败：{description}]",
                "section": chart.get("section", ""),
            }
            continue

        try:
            shutil.copy2(src_path, dst_path)
            md_img = f"![{description}](./charts/{filename})"
        except Exception as e:
            md_img = f"[图表加载失败：{description}]"

        chart_md_map[description] = {
            "md": md_img,
            "section": chart.get("section", ""),
        }

    return chart_md_map
```

### 3.2 引用语法

```markdown
![月度销售额与利润趋势](./charts/月度销售额利润趋势.png)
```

---

## 四、图文排版原则

1. **先文字后图表**：图表必须紧跟在对应分析段落之后，不得将图表放在文字之前
2. **alt 文本必填**：`![]()` 中的 alt 必须填主题描述，不得留空
3. **前后空行**：图表 / 占位标记前后各空一行，确保渲染间距正常
4. **章节对应**：按上游传递的"建议章节"信息嵌入到对应章节，不要集中堆在文末

---

## 五、☢️ 红线规则（绝对禁止）

| # | 禁止项 | 说明 |
|---|--------|------|
| R1 | **禁止绝对路径引用图片** | 严禁 `![](C:\xxx\xxx.png)`，必须用相对路径 `./charts/xxx.png` |
| R2 | **禁止在 Markdown 中直接写 base64 Data URI** | `![](data:image/png;base64,...)` 禁止。`md_to_html.py` 转换时会自动内嵌，Markdown 源禁止直接使用 |
| R3 | **禁止引用不存在的图表** | 未收到图表数据时，不得生成任何 `![]()` 或 `<!-- ECHARTS: ... -->` |
| R4 | **必须先复制再引用**（图片方式） | 收到图表路径时必须先 `prepare_charts()` 复制，再在报告中以相对路径引用 |
| R5 | **ECharts 占位标记仅用于 `.html` 输出** | 最终格式为 `.md` 时，严禁使用 `<!-- ECHARTS: ... -->` 占位标记 |

---

## 六、格式转换流程（md → html）

> ⚠️ **核心原则：步骤分离**
> - **Python 代码**只负责生成 `.md` 文件，**严禁** `import subprocess` 调用转换脚本
> - **格式转换**作为独立的 Shell 命令执行，与内容生成完全解耦
> - 好处：职责分离、出错可单独重跑

### 6.1 两步走架构

```
步骤一（Python）：撰写报告内容 → 生成 .md 中间文件（含 ECharts 占位标记或图片引用）
                                           │
                                           ▼
步骤二（Shell）：调用 md_to_html.py → 输出 .html（.md 中间文件保留在 temp_dir）
```

### 6.2 转换命令

> ⚠️ **Shell 兼容性注意事项**：
> - **禁止使用 `&&`**（PowerShell 5.x 不支持，会报错 `标记"&&"不是此版本中的有效语句分隔符`）
> - **禁止使用 `cd` 切目录后再执行**，直接用脚本绝对路径调用

```bash
# 基本转换
python "{skill_base_dir}/scripts/md_to_html.py" "报告.md" "报告.html"

# 指定外部图表数据 JSON（可选）
python "{skill_base_dir}/scripts/md_to_html.py" "报告.md" "报告.html" --chart-data charts.json
```

**`md_to_html.py` 参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `input_file`（位置参数） | ✅ | 输入 Markdown 文件路径 |
| `output_file`（位置参数） | ✅ | 输出 HTML 文件路径 |
| `--chart-data` | ❌ | 外部图表数据 JSON 文件路径 |

> ℹ️ 主题色（`#2E86AB`）与代码高亮主题（`tango`）已内置，无需传参。

### 6.3 容错规则

> ⚠️ **严禁**在撰写正文时预先写入任何格式转换失败的警告。警告信息**只能**在转换失败后通过追加方式写入 `.md` 文件末尾。

**正确流程**：

1. 步骤一 Python 生成**不含任何转换状态提示**的纯净 `.md`，写入 `temp_dir`
2. 步骤二 Shell 执行转换：从 `temp_dir/{文档标题}.md` 转换为 `output_dir/{文档标题}.html`
3. 分支处理：
   - 成功（返回码 0）→ 正常输出 `.html` 到 `output_dir`，保留 `temp_dir` 中的 `.md` 中间文件，由框架统一管理生命周期
   - 失败（返回码非 0、pandoc 未安装、路径异常等）→ 保留 `temp_dir` 中的 `.md` 中间文件；在 `output_dir` 生成回退 `.md` 时，必须同时复制其依赖的相对资源目录（如 `./charts/`），确保图片引用不失效；若无法同步资源，则不要生成会断链的回退产物，并通过 Shell 追加警告：

```bash
echo "" >> "报告.md"
echo "> ⚠️ 因格式转换失败，已回退为 Markdown 格式输出。如需 HTML 格式，请检查 pandoc 安装。" >> "报告.md"
```

### 6.4 中间产物保留规则

| 最终格式 | `.md` 中间文件 | `charts/` 目录 |
|---------|---------------|----------------|
| `.html`（转换成功） | **保留在 `temp_dir`** | **不主动清理**，由框架统一管理 |
| `.md`（未转换或回退） | **保留** | **保留**（依赖相对路径引用） |

Agent 禁止自行删除、清理或移动中间产物；所有中间产物生命周期由框架统一管理。

---

## 七、输出格式选择策略

| 优先级 | 条件 | 输出格式 |
|--------|------|----------|
| 1 | 文档包含图表数据（ECharts 或图片） | `.html` |
| 2 | 纯文字文档 | `.md` |

> 📌 用户明确指定输出格式时以用户要求为准。

---

## 八、自审清单（含图表的文档必核）

- [ ] **图表与文字对应**：每张图表是否紧跟在对应分析文字之后？
- [ ] **alt 文本**：所有 `![]()` 的 alt 是否都填了主题描述，无空白？
- [ ] **路径规范**：是否全部用 `./charts/xxx.png` 相对路径，无绝对路径、无 base64？
- [ ] **占位标记场景正确**：`<!-- ECHARTS: ... -->` 是否仅出现在 `.html` 输出场景？
- [ ] **文件真实存在**：引用的图片文件是否都已复制到 `charts/` 目录，不存在幽灵引用？
- [ ] **Python 纯净**：生成 `.md` 的 Python 代码是否没有 `import subprocess` 去调 `md_to_html.py`？
