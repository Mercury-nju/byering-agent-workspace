# 微信读书 App 操作规范

> **包名**：`com.tencent.weread`

## 0. App 结构与启动

| Tab | resource-id | 说明 |
|-----|------------|------|
| 阅读 | `#home_tab_discover` | 首页/推荐 |
| 书架 | `#home_tab_shelf` | 我的书架 |
| 有声书 | `#home_tab_timeline` | 有声书频道 |
| **我** | **`#home_tab_personal`** | **个人中心（⭐最常用）** |

```
启动微信读书后：
  1. dump_ui 确认页面
  2. 处理弹窗（按通用规范中断处理）：
     ├─ 通用弹窗（更新、登录、推荐等）→ 按通用规范处理
     └─ 图片验证码 → capture_screen 观察后使用 `gui_grounder`定位并选择（App 特有）
  3. 确认已在首页（底部有 #home_tab_discover / #home_tab_shelf / #home_tab_personal 等Tab）
```

## 0.2 "我的"页面关键入口（`#personal_page`）

| 功能入口 | resource-id | 说明 |
|---------|-------------|------|
| **笔记** | **`#id_cell_Note`** | **⭐导出笔记入口，"累计 N 个"** |
| 在读 | `#id_cell_IsReading` | "累计 N 本" |
| 读完 | `#id_cell_FinishReading` | "累计 N 本" |
| 阅读时长 | `#id_cell_ReadingTime` | 总时长+本月时长 |
| 读书排行榜 | `#id_cell_FriendRank` | 今日阅读排名 |
| 设置 | `#person_right_setting_button` | 右上角 |

---

## 1. ⭐ 导出书籍笔记（核心功能，完整 SOP）

> ⚠️ **这是本 skill 最重要的功能。必须严格按以下流程执行，不可跳步。**

### 1.1 完整流程概览

```
导出笔记完整路径（⚠️ 不可跳步，每次都从头开始）：
  │
  ├─ 1. 启动微信读书
  │
  ├─ 2. dump_ui 确认当前页面，处理弹窗
  │
  ├─ 3. 点击底部"我"Tab → 进入"我的"页面
  │     └─ dump_ui → 找 #home_tab_personal → android_tap/focus_at
  │
  ├─ 4. 在"我的"页面点击"笔记"入口 → 进入笔记列表
  │     └─ dump_ui → 找 #id_cell_Note 或 text 含"笔记" → android_tap/focus_at
  │
  ├─ 5. 在笔记列表中找到目标书籍 → 点击进入该书笔记详情页
  │     └─ dump_ui → 找 text 匹配书名 → android_tap/focus_at
  │     └─ ⚠️ 未找到则 swipe 向下滑动后重新 dump_ui
  │
  ├─ 6. 在书籍笔记详情页点击"导出笔记"
  │     └─ dump_ui → 找 text 含"导出笔记" → android_tap/focus_at
  │
  ├─ 7. 选择"复制到剪贴板"
  │     └─ dump_ui → 找 text 含"复制"或"剪贴板" → android_tap/focus_at
  │
  └─ 8. get_clipboard_text 获取全部笔记内容
```

### 1.2 阶段1：导航到笔记列表（对应步骤 1-4）

```
步骤1: 启动微信读书

步骤2: dump_ui 确认当前页面状态
  ├─ 如果已在"我的"页面 → 跳到步骤4
  ├─ 如果已在笔记页面 → 跳到阶段2
  └─ 如果在首页或其他页面 → 继续步骤3

步骤3: 点击底部"我"Tab（⚠️ 必须 dump_ui 精确定位）
  ├─ dump_ui → 搜索 resource-id 含 "home_tab_personal"
  ├─ 计算 bounds 中心坐标
  └─ android_tap/focus_at 点击

步骤4: dump_ui 确认已进入"我的"页面，然后定位"笔记"入口
  ├─ dump_ui → 搜索 resource-id 含 "cell_Note" 或 text 含 "笔记"
  ├─ 计算 bounds 中心坐标
  └─ android_tap/focus_at 点击进入笔记列表
```

### 1.3 阶段2：在笔记列表中定位目标书籍（对应步骤 5）

> ⚠️ **笔记列表中书籍排列紧密，必须通过 `dump_ui` 的 `text` 属性精确匹配目标书名！**

```
步骤1: dump_ui 获取笔记列表中所有书籍条目
  └─ 查找所有 text 属性包含书名关键字的节点

步骤2: 精确匹配目标书籍
  ├─ ⚠️ 用书名关键词模糊匹配（如"人形机器人"而非全名）
  ├─ ⚠️ 多本相似书名需对比全名确认
  └─ ⚠️ 未找到 → swipe 向下滑动后重新 dump_ui

步骤3: 确认后 android_tap 进入该书笔记详情页
  └─ dump_ui 或 capture_screen 验证页面标题是否为正确书名
  └─ ⚠️ 进错了 → tap_back 返回重新定位
```

### 1.4 阶段3：采集笔记内容（对应步骤 6-8）

> ⚠️ **【强制前置条件】** 导出笔记**必须**从"我的"→"笔记"→目标书籍的笔记详情页中执行。**禁止**从阅读器内的笔记面板或其他入口导出。

```
步骤1: 确认已进入目标书籍的笔记详情页（通过"我的"→"笔记"路径）

步骤2: dump_ui 查找"导出笔记"按钮
  └─ 通常在页面顶部或右上角区域，text 含"导出笔记"
  └─ 从 bounds 计算中心坐标并 android_tap/focus_at 点击

步骤3: 在弹出的选项中选择"复制到剪贴板"
  └─ dump_ui 查找 text 含"复制"或"剪贴板"的选项
  └─ android_tap/focus_at 点击

步骤4: get_clipboard_text 获取完整笔记内容
  └─ 返回值即为微信读书格式化好的全部笔记文本（按章节排列）

步骤5: 采集完成，根据用户需求进行后续处理
```

> 📌 通过剪贴板获取的笔记已按章节排列，包含章节标题和划线内容，可直接用于后续处理（如输出到 md 文件、生成报告、生成网页等）。

---

## 2. 搜索书籍

```
搜索流程：
  1. 启动App → dump_ui 确认首页 → 处理弹窗
  2. android_tap/focus_at 搜索入口（dump_ui 查找 #id_searchTextInput → 取 bounds 中心点击）
  3. android_tap/focus_at 搜索输入框获取焦点 → input_text("关键词\n") 触发搜索
  4. 切换到"电子书"Tab（dump_ui 查找 #id_searchResultTabBar 下 text="电子书" → android_tap/focus_at
```

**搜索页关键 resource-id**：返回 `#id_navigation_bar_back_button` | 输入框 `#id_searchTextInput`(EditText) | 结果Tab `#id_searchResultTabBar` | 书籍条目 `#bookItem_N` | 书名 `#id_bookName`

**热门筛选策略**：优先指标：在读人数 > 推荐值 > 评论数，选3本后向用户确认。

## 3. 书籍详情页

```
信息采集流程：
  1. 点击搜索结果中的书（#bookItem_N）
  2. dump_ui 获取基本信息（#id_bookName / #id_bookIntro / 推荐值 / 在读人数）
  3. 简介被截断 → 找"展开""更多"按钮点击
  4. swipe 向下查看目录和评论
  5. 评论区按"全部/推荐/一般/不行"Tab筛选，采集 3-5 条
  6. tap_back 返回
```

**详情页关键 resource-id**：封面 `#bookCover` | 书名 `#id_bookName` | 简介 `#id_bookIntro` | 加入书架 `#id_bookShelf` | 阅读 `#id_enterReader` | 点赞 `#review_detail_praise_btn_container`

## 4. 阅读器（`#book_page`）

> ⚠️ 阅读器默认全屏，**必须点击屏幕中心** 才能唤出顶部/底部工具栏。

**顶部工具栏** `#reader_top_actionbar`：返回 `#reader_top_backbutton` | 分享 `#reader_top_share` | 更多 `#reader_top_more`

**底部工具栏** `#reader_bottom_actionbar`：目录 `#reader_chapter` | 笔记 `#reader_note` | 进度 `#reader_progress` | 亮度 `#reader_bright` | 文字 `#reader_font`

**悬浮按钮**：AI问书 `#reader_ask_ai`（⚠️ 仅已登录） | 听书 `#reader_bottom_lecture`

## 5. 书架操作

**进入**：`#home_tab_shelf` → 书架页 `#shelf_page`

**查找书籍**：dump_ui → 搜索 `#book_grid_item_name` 的 text 匹配书名 → 未找到则 swipe → android_tap/focus_at 进入

**空白书架**：检查 `#empty_info` 或 `#empty_action`，引导用户去书城或搜索。

## 6. 报告生成模板

### 6.1 单本书籍报告

```markdown
## 📚 《书名》

### 📝 基本信息
| 项目 | 内容 |
|------|------|
| 📖 书名 | XXX |
| ✍️ 作者 | XXX |
| ⭐ 推荐值 | XX% |
| 👥 在读人数 | X万人 |

### 🎯 核心思想
（3-5句话总结）

### 📑 目录概览
（主要章节标题，不超过10个）

### 💬 热门评论解析
（3条评论原文 + 解析）

### ⭐ 推荐理由
（3条，加粗关键词）
```

### 6.2 多本书汇总模板

```markdown
# 📚 XX类书籍阅读笔记

（每本书按 6.1 模板生成）

---
## 📊 对比总结
| 维度 | 《书名1》 | 《书名2》 | 《书名3》 |
|------|----------|----------|----------|
| 侧重点 | XXX | XXX | XXX |
| 难度 | 简单/中等/较难 | … | … |
| 适合人群 | XXX | … | … |

## 🎯 阅读建议
1. **入门推荐**：……
2. **进阶学习**：……

📅 整理时间：YYYY-MM-DD | 📱 数据来源：微信读书
```

## 7. 常见操作快速路径

| # | 用户意图 | 操作路径 |
|---|---------|---------|
| 1 | **⭐导出某本书的笔记** | ⚠️ **必须经"我的"→"笔记"路径**：启动App → `#home_tab_personal` → `#id_cell_Note` → 找到目标书 → "导出笔记" → "复制到剪贴板" → `get_clipboard_text` |
| 2 | 搜索一本书 | 启动App → `#id_searchTextInput` → 输入关键词 → 选"电子书"Tab |
| 3 | 查看书籍详情 | 搜索 → `#bookItem_N` → 详情页 |
| 4 | 采集书籍评论 | 详情页 → swipe到评论区 → 按Tab筛选 |
| 5 | 开始阅读 | 详情页 → `#id_enterReader` |
| 6 | 阅读器查看目录 | 点击屏幕中心 → `#reader_chapter` |
| 7 | 使用AI问书 | 点击屏幕中心 → `#reader_ask_ai`（需已登录） |
| 8 | 查看我的书架 | `#home_tab_shelf` → 书籍网格 |

## 8. 注意事项

- **游客模式**：支持"直接试用"进入，书架为空、无笔记、无 `#reader_ask_ai`，其他 resource-id 一致
- **搜索结果**：可能混合"书籍""书单""讲书"等类型，只选"书籍"类型
- **首页搜索**：`#id_searchTextInput` 在首页是 TextView（点击跳转），在搜索页是 EditText（可输入）
- **评论区**：需多次 swipe 才能到达，"展开"可能显示为"...全文"或箭头
