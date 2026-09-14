# 文档格式规范详细说明

本文档提供 doc-format-skill 的详细格式规范参考和完整示例。

**输出格式：HTML 网页（自包含 .html 文件）**

## 1. 格式规范速查表

### 1.1 必需元素清单

| 序号 | 元素 | 要求 | HTML 实现 |
|------|------|------|-----------|
| 1 | DOCTYPE 声明 | 必须在文件开头 | `<!DOCTYPE html>` |
| 2 | 字符集声明 | UTF-8 | `<meta charset="UTF-8">` |
| 3 | 视口设置 | 响应式 | `<meta name="viewport" ...>` |
| 4 | 内嵌 CSS | 自包含 | `<style>...</style>` |
| 5 | 页面标题 | 非空 | `<title>文档标题</title>` |
| 6 | 一级标题 | 全文唯一 | `<h1>标题</h1>` |
| 7 | 作者/日期 | meta 区 | `<div class="meta">` |
| 8 | 摘要 | 50-150字 | `<div class="abstract">` |
| 9 | 二级标题章节 | ≥3 个 | `<h2>章节标题</h2>` |
| 10 | 项目符号列表 | ≥1 处，每处 ≥3 项 | `<ul><li>...</li></ul>` |
| 11 | 编号列表 | ≥1 处，每处 ≥3 项 | `<ol><li>...</li></ol>` |
| 12 | 表格 | ≥1 个，3行4列含表头 | `<table>` + `<thead>` + `<tbody>` |
| 13 | 图表占位符 | ≥1 处 | `<div class="chart-placeholder">` |
| 14 | 页眉 | 左标题+右作者 | `<div class="header">` |
| 15 | 页脚 | 居中页码 | `<div class="footer">` |
| 16 | 打印样式 | 打印适配 | `@media print { ... }` |
| 17 | 响应式样式 | 移动端适配 | `@media (max-width: 768px) { ... }` |

### 1.2 CSS 样式对照表

| 元素 | CSS 选择器 | 字体 | 字号 | 特殊样式 |
|------|-----------|------|------|---------|
| 一级标题 | `h1` | SimHei/黑体 | 26px | 居中、加粗 |
| 二级标题 | `h2` | SimHei/黑体 | 20px | 左对齐、底部彩色边框、左侧色块 |
| 正文段落 | `p` | SimSun/宋体 | 16px | 首行缩进2em |
| 表头 | `thead th` | — | 14px | 加粗、深色底纹、白色字 |
| 表格行 | `tbody tr` | — | 14px | 斑马纹、悬停高亮 |
| 摘要区 | `.abstract` | — | 15px | 斜体、左侧彩色边框、浅色渐变背景 |
| 页眉 | `.header` | — | 14px | 渐变背景、白色字 |
| 页脚 | `.footer` | — | 13px | 灰色字、居中 |

### 1.3 主题色配置

| 场景 | 色值 | 适用 |
|------|------|------|
| 商务蓝（默认） | `#1890ff` | 商务、科技报告 |
| 小红书红 | `#ff2442` | 社交、营销 |
| 清新绿 | `#52c41a` | 环保、健康 |
| 稳重金 | `#fa8c16` | 金融、财务 |
| 深灰 | `#333333` | 通用、中性 |

主题色影响范围：页眉渐变、h2 底部边框、h2 左侧色块、摘要左侧边框、列表圆点。

## 2. 完整示例文档

以下是一份符合所有格式要求的完整 HTML 示例（篇幅较长，展示关键结构）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>2026年Q1数字化转型市场分析报告</title>
    <style>
        /* 内嵌完整 CSS（参见 assets/DOC_TEMPLATE.html） */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "SimSun", serif; font-size: 16px; line-height: 1.8; color: #333; background: #f0f2f5; }
        .page-wrapper { max-width: 900px; margin: 0 auto; padding: 20px; }
        .page { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden; }
        .header { display: flex; justify-content: space-between; padding: 12px 40px; background: linear-gradient(135deg, #1890ff, #69c0ff); color: #fff; font-size: 14px; }
        .content { padding: 40px 50px 30px; }
        h1 { font-family: "SimHei", sans-serif; font-size: 26px; text-align: center; margin-bottom: 20px; }
        .meta { text-align: center; color: #666; font-size: 15px; margin-bottom: 24px; }
        .abstract { border-left: 4px solid #1890ff; padding: 16px 20px; margin-bottom: 32px; font-style: italic; }
        h2 { font-family: "SimHei", sans-serif; font-size: 20px; margin: 32px 0 16px; border-bottom: 2px solid #1890ff; display: inline-block; }
        p { text-indent: 2em; margin-bottom: 14px; }
        /* ... 更多样式见模板 ... */
        @media (max-width: 768px) { .content { padding: 24px 20px; } }
        @media print { body { background: #fff; } .page { box-shadow: none; } }
    </style>
</head>
<body>
<div class="page-wrapper">
    <div class="page">
        <div class="header">
            <span class="left">2026年Q1数字化转型市场分析报告</span>
            <span class="right">张明远</span>
        </div>
        <div class="content">
            <h1>2026年Q1数字化转型市场分析报告</h1>
            <div class="meta">
                <span><strong>作者</strong>：张明远</span>
                <span><strong>日期</strong>：2026年3月18日</span>
            </div>
            <div class="abstract">
                摘要：本报告基于2026年第一季度市场数据，深入分析了企业数字化转型的最新趋势、
                关键技术驱动因素及行业应用场景，并对未来发展方向提出建议。
            </div>

            <h2>市场概况与发展背景</h2>
            <p>2026年第一季度，全球数字化转型市场规模持续扩大...</p>
            <ul>
                <li>AI 大模型技术的商业化应用加速</li>
                <li>云原生架构的普及使中小企业也能享受弹性计算资源</li>
                <li>数据安全法规的完善促进了数据资产的规范化管理</li>
            </ul>

            <h2>关键技术趋势分析</h2>
            <p>本季度，技术层面呈现出多个值得关注的趋势...</p>
            <ol>
                <li>AI Agent 成为企业自动化的新范式</li>
                <li>多云混合架构逐渐成为主流</li>
                <li>低代码/无代码平台市场同比增长41%</li>
            </ol>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>技术领域</th><th>市场规模</th><th>同比增长</th><th>采用率</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>人工智能</td><td>4,200亿</td><td>38.2%</td><td>72%</td></tr>
                        <tr><td>云计算</td><td>6,800亿</td><td>21.5%</td><td>89%</td></tr>
                        <tr><td>大数据</td><td>3,100亿</td><td>18.7%</td><td>67%</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="chart-placeholder">
                <div class="icon">📊</div>
                <div class="label">[此处插入：2024-2026年各技术领域市场规模变化趋势折线图]</div>
            </div>

            <h2>结论与建议</h2>
            <p>综合本季度的市场数据和技术趋势分析，数字化转型已进入"深水区"...</p>
            <p>建议企业优先考虑AI与核心业务的深度融合，同时建立健全的数据治理体系。</p>
        </div>
        <div class="footer">第1页，共1页 | © 2026 张明远</div>
    </div>
</div>
</body>
</html>
```

## 3. 常见问题

### Q: 为什么选择 HTML 而不是 Markdown？
A: HTML 是自包含的，浏览器打开就能看到完整排版效果，不需要额外的 Markdown 渲染器，也不需要手动在 Word 中调整样式。字体、颜色、布局一步到位。

### Q: 首行缩进怎么实现？
A: 通过 CSS `text-indent: 2em` 自动实现，只要用 `<p>` 标签包裹段落即可。

### Q: 表格表头的灰色底纹怎么实现？
A: CSS 自动实现：`thead th { background: #4a4a4a; color: #fff; }`。

### Q: 图表占位符如何使用？
A: 使用 `<div class="chart-placeholder">` 包裹，内含图标和描述文字。如有具体数据，可用 CSS `conic-gradient` 实现饼图等简单可视化。

### Q: 主题色怎么修改？
A: 在 `init_doc.py` 中使用 `--color` 参数指定，如 `--color "#ff2442"`。主题色会自动应用到页眉渐变、标题边框、列表圆点等所有装饰元素。

### Q: 怎么打印？
A: 直接在浏览器中按 Ctrl+P（或 Cmd+P），内置的 `@media print` 样式会自动优化打印效果（去除阴影、白色背景等）。

### Q: 怎么将 HTML 转为 Word？
A: 推荐使用 Pandoc：`pandoc document.html -o document.docx`，或直接在 Word 中"打开" → 选择 .html 文件。
