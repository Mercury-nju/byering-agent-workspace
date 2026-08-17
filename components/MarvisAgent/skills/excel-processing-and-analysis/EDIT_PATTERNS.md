# Excel 编辑模式规范（EDIT_PATTERNS）

> **本文件定位**：承载 Excel 处理过程中**具体编辑场景**的模式化最佳实践。凡是"如何在这种布局下写入某种结构"类型的细化规范，都收录在本文件内，以避免主 `SKILL.md` 被特定场景的细节反复膨胀。
>
> **写作约定**：未来新增任何编辑模式（例如"插入图表""插入图片""条件格式""跨 Sheet 汇总"等），统一以 `## 模式 N：XXX` 的形式向下追加小节，保持编号连续；每节内部结构建议为"适用场景与识别规则 → 处理代码片段 → 注意事项"。除非必要，不在本文件顶部新增章节，以便未来扩展时只需在文件末尾追加。

---

## 模式 1：同 Sheet 多子表 · 追加合计行

> ⚠️ **无交互硬约束**：本流程必须在一次执行中连续跑完（探测 → 写入 → 保存）。**禁止**在中间插入"先打印边界让用户核对""等待用户确认"之类的人工介入步骤 —— 当前 agent 运行时不支持向用户垂询。
>
> 🛑 **禁止原地覆盖输入文件**：写入结果**必须**另存为独立副本（推荐命名 `{原文件名}_带合计.xlsx`，或写入调用方传入的 `output_dir`），**严禁** `wb.save(原文件路径)` 这种原地写回操作——否则一旦探测/写入出错将无法回退，用户源数据直接损毁。

### 1.1 适用场景与识别规则

当用户要求"在表格最后一行加合计"时，先判定 **当前 Sheet 是单表布局还是多子表布局**。可操作信号：

- **整行空白切分**（纵向信号）：Sheet 中存在整行单元格全部为空，将数据区在垂直方向切分为 ≥ 2 个互不相连的数据块。
- **整列空白切分**（横向信号）：同一行范围内存在整列全部为空的分隔列，两侧各自存在一组独立的表头（常见于"办公用品表 | 空列 | IT 设备表"这种并排布局）。
- **重复表头样式**：同一 Sheet 内出现多组外观/字段相似的表头行（例如多次出现"序号 / 物品名称 / 数量 / 金额"）。
- **标题夹层**：块与块之间夹有独立的小标题行（如"甲方采购单""乙方采购单"）。

**处理路径**：

- **多子表布局** → 必须走下文 1.2 的"自动探测"流程（**先横向切分 + 后纵向切分**两步，顺序不可颠倒），再走 1.3 的"合计行写入"流程；**禁止**凭目测直接向某个特定行号写入，也**禁止**只做纵向切分就收工（会把横向并排的两张独立子表误合并成一个大矩形，并导致合计行重复写入或错位）。
- **单表布局** → 回到主 `SKILL.md` 的 Fast-Track（Level 1）或状态机（Level 2）路径处理，本模式不做额外约束。

### 1.2 & 1.3 子表探测 + 合计行写入（直接调用工具脚本）

> 🛑🛑🛑 **强制使用工具脚本**：本 Skill 目录下已提供经过验证的 Python 工具脚本 [`subtable_utils.py`](./scripts/subtable_utils.py)，其中包含 `detect_subtables()`、`write_total_rows()` 和一站式入口 `add_total_rows_to_file()` 三个函数。
>
> **执行时必须 `import` 该脚本直接调用，严禁自己重写任何探测或写入逻辑。**

#### 使用方式

**方式 A：一站式调用（推荐，最省事）**

```python
import sys
import os
sys.path.insert(0, os.path.join(r"<本skill目录的绝对路径>", "scripts"))

from subtable_utils import add_total_rows_to_file
```

output_path = add_total_rows_to_file(
    file_path=r"<输入Excel文件路径>",
    output_path=r"<输出文件路径，可选>",  # 不传则自动命名为 xxx_带合计.xlsx
)
```

**方式 B：分步调用（需要更多控制时）**

```python
import os
import sys
sys.path.insert(0, os.path.join(r"<本skill目录的绝对路径>", "scripts"))

from openpyxl import load_workbook
```
from subtable_utils import detect_subtables, write_total_rows

wb = load_workbook(file_path)
ws = wb.active  # 或 wb[sheet_name]

# 探测子表
result = detect_subtables(ws)
print(f"探测到 {len(result)} 个子表: {[b['bounds'] for b in result]}")

# 写入合计行
write_total_rows(ws, result)

# 另存副本（禁止原地覆盖）
base, ext = os.path.splitext(file_path)
output_path = f"{base}_带合计{ext}"
wb.save(output_path)
```

#### 算法说明（仅供理解，不需要自己实现）

`detect_subtables` 采用 **8 连通域标记算法**（Connected Component Labeling）：
1. 将 Excel 视为二维布尔矩阵（非空为 True，空为 False）
2. 使用 BFS 寻找所有 8 连通的非空单元格区域，每个连通域即为一个子表
3. 自动进行顶部修剪，去除可能紧挨着表头的单行大标题

> 💡 **算法优势**：相比于传统的"按整行/整列空白切分"，连通域算法能够完美识别**任意错位并排**的子表。只要两个子表之间至少有一行或一列的局部空白间隙，就能被准确分开，彻底解决了左右子表行数不等导致的合并错位问题。

`write_total_rows` 的关键行为：
- "合计"标签写在该子表的第一列（`c0`），**不是** A 列
- 数值列（包括纯数字和以 `=` 开头的公式列）写 Excel 原生 `=SUM(...)` 公式，非数值列留空
- 合计行位置为 `r1 + 1`（该子表最后一行的下一行）

> 📌 **验证点**：`detect_subtables` 返回后，打印 `result` 验证子表数量。例如"采购单_详细"这类文件预期应有 5 张子表。如果数量明显偏少（如只有 2~3 张），说明你没有正确 import 或传入了错误的 worksheet。

#### 禁止事项

| ❌ 禁止 | ✅ 正确做法 |
|---------|------------|
| 自己写探测逻辑（无论多简单） | `from subtable_utils import detect_subtables` |
| 自己写合计行写入逻辑 | `from subtable_utils import write_total_rows` |
| `wb.save(原文件路径)` 原地覆盖 | 另存为 `_带合计.xlsx` 或写入 `output_dir` |
| 把"合计"写到 A 列 | 脚本已内置 `column=c0`，无需关心 |

---
