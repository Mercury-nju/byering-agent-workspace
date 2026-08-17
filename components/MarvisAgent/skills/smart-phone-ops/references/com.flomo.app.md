# flomo 浮墨笔记 App 操作规范

**类型**：普通 App（dump_ui 优先）

## 0. 核心特性

- 主界面为笔记瀑布流列表，按时间倒序排列
- 右下角悬浮「+」按钮新建笔记
- 左侧抽屉菜单（三横线，resource-id: `actionMenu`）含标签管理、每日回顾入口
- 笔记支持 `#标签名` 语法（`#` 后不加空格，标签名后加空格结束）
- 笔记输入支持 `\n` 换行

## 1. 操作流程

### 1.1 创建新笔记（核心操作）

> ⚠️ **防止在已有笔记上写入**：右下角绿色按钮在主界面是"新建"，在详情页是"编辑当前笔记"，操作前必须确认界面！

```
创建笔记
  │
  ├─ dump_ui 确认当前界面
  │   ├─ 多条笔记卡片 + 搜索框 + 菜单 → 主界面 ✅
  │   └─ 单条笔记/大输入框 → 编辑界面 ❌ → tap_back 返回
  │
  ├─ 点击右下角「+」悬浮按钮（resource-id: com.flomo.app:id/btnCreateMemo）
  │   ⚠️ 点击后确认编辑区是空的（resource-id: com.flomo.app:id/aztec_text），若已有内容立即 tap_back
  │
  ├─ 点击输入框 → input_text_at 输入内容（标签如 #日记 #工作）
  │
  ├─ ⚠️ 点击发送按钮（resource-id: com.flomo.app:id/action_deploy，编辑器底部绿色箭头）
  │   如键盘遮挡，先点击输入框外收起键盘
  │
  └─ dump_ui 确认发布成功（回到列表，顶部显示新笔记）
```

### 1.2 搜索笔记

```
搜索笔记
  ├─ 点击顶部搜索入口 → input_text_at 关键词
  └─ 点击目标笔记查看详情 → tap_back 返回
```

### 1.3 按标签浏览

```
按标签浏览
  ├─ 点击左上角三横线（resource-id: actionMenu）打开抽屉
  └─ 查找并点击目标标签 → 查看笔记 → tap_back 返回
```

### 1.4 编辑与删除笔记

```
编辑笔记：点击笔记 → 查找"编辑"按钮 → 修改内容 → 点击保存
删除笔记：进入详情 → 查找"删除"/"更多" → ⚠️ 删除前必须向用户确认
```

### 1.5 每日回顾

```
每日回顾
  ├─ 点击左上角三横线打开抽屉 → 查找 text 含"回顾"
  └─ swipe 左右滑动查看不同回顾卡片
```

## 2. 界面元素定位提示

> 以下 resource-id 经实测验证，优先使用精确 resource-id 定位。

| 目标元素 | dump_ui 搜索策略（实测 resource-id） | 备用方案 |
|---------|-----------------|---------|
| 新建按钮（+） | resource-id=`com.flomo.app:id/btnCreateMemo`（主界面底部，clickable=true） | 右下角圆形按钮 |
| 笔记输入框 | resource-id=`com.flomo.app:id/aztec_text`（EditText） | 编辑页中部 |
| 发送按钮 | resource-id=`com.flomo.app:id/action_deploy`（编辑器底部工具栏右侧绿色箭头） | 编辑页右下角绿色圆形 |
| 标签按钮 | resource-id=`com.flomo.app:id/action_tag`（编辑器底部工具栏） | — |
| 搜索入口 | resource-id=`com.flomo.app:id/btnSearch` | 右上角放大镜 |
| 抽屉菜单 | resource-id: actionMenu（三横线） | 左上角 |

## 4. 结果输出格式

### 笔记创建结果

```markdown
### ✅ flomo 笔记已保存
- **标签**：#标签1 #标签2
- **内容预览**：笔记内容前两行...
```

### 笔记搜索结果

```markdown
### 🔍 flomo 搜索结果「XXX」

| 序号 | 时间 | 标签 | 内容摘要 |
|------|------|------|---------|
| 1 | 03-12 14:30 | #日记 | 今天天气不错... |
```
