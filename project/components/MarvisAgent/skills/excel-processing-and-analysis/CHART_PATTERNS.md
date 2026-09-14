# 图表生成规范 (CHART_PATTERNS)

本规范定义了在进行数据可视化和图表生成时必须严格遵循的模式，以确保图表在各种环境（Windows、macOS、Linux）下能够正确生成，避免中文乱码和线程崩溃等问题。

## 1. 核心红线规则

1. **后端设置必须前置**：`matplotlib.use('Agg')` **必须**在导入 `matplotlib.pyplot` 之前执行。这可以防止在没有 GUI 的环境下运行时发生线程崩溃。
2. **中文字体配置**：必须显式配置跨平台的中文字体列表（涵盖 macOS 的 `Arial Unicode MS`, `PingFang SC` 和 Windows 的 `Microsoft YaHei`, `SimHei`），否则图表中的中文将显示为方块（乱码）。
3. **Seaborn 样式覆盖问题**：如果使用了 `seaborn` 库，**必须**在调用 `sns.set_theme()` 或任何其他 seaborn 样式设置函数**之后**，再进行中文字体配置。因为 seaborn 的样式设置会重置 matplotlib 的字体配置。

## 2. 标准图表生成代码模板

在生成图表时，请直接复制并使用以下标准模板，根据实际需求修改数据和图表类型：

```python
import pandas as pd
import matplotlib
# 【红线】必须在导入 pyplot 之前设置 Agg 后端
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

def generate_chart(df: pd.DataFrame, output_path: str):
    # 1. 设置 seaborn 样式（如果需要使用 seaborn）
    sns.set_theme(style="whitegrid")

    # 2. 【红线】配置中文字体，必须在 sns.set_theme() 之后执行！
    # 兼容 macOS (Arial Unicode MS, PingFang SC) 和 Windows (Microsoft YaHei, SimHei)
    plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'PingFang SC', 'Microsoft YaHei', 'SimHei', 'sans-serif']
    # 解决负号 '-' 显示为方块的问题
    plt.rcParams['axes.unicode_minus'] = False

    # 3. 创建图表
    plt.figure(figsize=(10, 6))

    # --- 在这里编写具体的绘图逻辑 ---
    # 示例：绘制折线图
    # sns.lineplot(data=df, x='日期', y='销售额', marker='o')
    # plt.title('每日销售额趋势图', fontsize=14)
    # plt.xlabel('日期', fontsize=12)
    # plt.ylabel('销售额 (元)', fontsize=12)
    # ---------------------------------

    # 4. 调整布局并保存
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')

    # 5. 清理内存
    plt.close()

    return output_path
```

## 3. 常见错误排查

- **错误：图表中文显示为方块（□□□）**
  - **原因 1**：未配置 `plt.rcParams['font.sans-serif']`。
  - **原因 2**：配置了字体，但随后调用了 `sns.set_theme()` 导致配置被覆盖。请检查顺序。
- **错误：程序卡死或抛出 GUI 相关异常**
  - **原因**：未在导入 `pyplot` 之前调用 `matplotlib.use('Agg')`。
