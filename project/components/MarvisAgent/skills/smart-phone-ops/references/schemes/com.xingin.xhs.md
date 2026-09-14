# 小红书 URL Scheme 快速导航

> **协议前缀**：`xhsdiscover://`
> **调用方式**（Androws MCP）：
> ```
> operate_app(operate_type="launch", package_names=["com.xingin.xhs"], apk_deep_link="<scheme>")
> ```
>
> **⭐ 使用原则**：能用 Scheme 直达就不要走 UI 点击。每次要进入某个页面前，**先查本表**；命中就用 `apk_deep_link` 一步直达，再用 `dump_ui` 后续操作。只有本表没有 / 调用失败时才回退到 UI 导航。
>
> **⚠️ 白名单规则**：以下所有 scheme 均已通过 Manifest intent-filter 验证，可被外部 `apk_deep_link` 直接唤起。
> 表外的 authority（如 `browsing_history`、`qr_scan`、`settings`、`profile_edit`、`note_detail`、`im/group/*`、`my_user_page`、`other_user_page` 等）虽然在 DEX 里能看到字符串，但未注册到 Manifest，**外部无法 am start**，请改用表中的替代项。
>
> **参数约定**：
> - 中文参数必须 URL Encode（如 `keyword=美食` → `keyword=%E7%BE%8E%E9%A3%9F`）
> - App 需已登录，主进程已初始化
> - `<note_id>` / `<uid>` / `<goods_id>` / `<board_oid>` 为 24 位十六进制 ID，通常从分享链接解析得到（见主规范 §3.1）

---

## 1. 导航 / 首页切换

| 场景 | Scheme |
|------|--------|
| 打开首页 | `xhsdiscover://home` |
| 关注 Tab | `xhsdiscover://home/follow` |
| 商城 Tab | `xhsdiscover://home/store` |
| 消息 Tab | `xhsdiscover://home/message` |
| 我的 Tab | `xhsdiscover://home/my` |
| 笔记 Tab | `xhsdiscover://home/note` |
| 分类页 | `xhsdiscover://home/category` |

## 2. 搜索

| 场景 | Scheme |
|------|--------|
| **搜索结果直达** | `xhsdiscover://search/result?keyword=<URL编码词>` |
| **搜索结果（指定类型）** | `xhsdiscover://search/result?keyword=<词>&target_search=<notes\|goods\|users>` |
| 搜索输入页（带推荐） | `xhsdiscover://search/recommend` |
| 搜索输入页（笔记模式） | `xhsdiscover://search/recommend?mode=notes` |
| 商城内搜索 | `xhsdiscover://instore_search` |
| 商城搜索推荐 | `xhsdiscover://instore_search/recommend` |
| 商城搜索结果 | `xhsdiscover://instore_search/result?keyword=<词>` |
| AI 搜索（搜索 Agent） | `xhsdiscover://search_agent_page` |
| 点点 v2 | `xhsdiscover://diandian/v2` |

## 3. 笔记 / 视频 / 商品详情（需 ID，配合分享链接解析流程使用）

> 这类 scheme 需要从分享面板复制链接后通过 `scripts/resolve_xhs_link.py` 解析得到 ID，拼接后使用。

| 场景 | Scheme |
|------|--------|
| **笔记详情** | `xhsdiscover://item/<note_id>` |
| **沉浸式视频详情** | `xhsdiscover://video_feed/<note_id>` |
| 竖屏视频流 | `xhsdiscover://portrait_feed/<note_id>` |
| **商品详情** | `xhsdiscover://goods_detail/<goods_id>` |
| 合集笔记 | `xhsdiscover://multi_note/<id>` |
| 笔记混排合集 | `xhsdiscover://note_mix/<id>` |
| 兼容旧版笔记链接 | `xhsdiscover://1/item/<id>` |
| 兼容旧版用户链接 | `xhsdiscover://1/user/<uid>` |
| 兼容旧版专辑链接 | `xhsdiscover://1/board/<board_oid>` |

## 4. 用户 / 个人中心

| 场景 | Scheme |
|------|--------|
| **他人用户主页** | `xhsdiscover://user/<uid>` |
| **我的个人页** | `xhsdiscover://profile` |
| IP 属地信息 | `xhsdiscover://profile/ip_info` |
| 个人横幅预览 | `xhsdiscover://profile/bannerPreview` |
| 我的主页预览 | `xhsdiscover://user/me/preview` |
| 桌面小组件预览 | `xhsdiscover://user/me/widget/preview` |
| 编辑资料（RN 新版） | `xhsdiscover://rn/profile/profile-edit-entry` |
| 我的二维码 | `xhsdiscover://rn/sns-qrcode/userpage` |
| 推荐用户 | `xhsdiscover://recommend/user` |
| 通讯录好友推荐 | `xhsdiscover://recommend/contacts` |
| 专辑详情 | `xhsdiscover://board/<board_oid>` |

## 5. 发布 / 创作

| 场景 | Scheme |
|------|--------|
| **发布图文笔记** | `xhsdiscover://post_note` |
| **发布视频** | `xhsdiscover://post_video` |
| 相册发布入口 | `xhsdiscover://post` |
| 视频相册发布 | `xhsdiscover://post_video_album` |
| 草稿箱 | `xhsdiscover://notes_draft_box` |

## 6. 商城 / 商品 / 订单

| 场景 | Scheme |
|------|--------|
| 商城 Tab | `xhsdiscover://home/store` |
| 商城活动 | `xhsdiscover://store/activity` |
| 店铺详情 | `xhsdiscover://shop_detail` |
| 店铺分类 | `xhsdiscover://shop_category` |
| 店内商品搜索 | `xhsdiscover://shop_goods_search` |
| **购物车** | `xhsdiscover://rn/lancer-slim/user/shopping_cart` |
| **订单列表** | `xhsdiscover://rn/lancer-slim/order/list` |
| 收货地址列表 | `xhsdiscover://rn/lancer-slim/address/list` |
| 新建收货地址 | `xhsdiscover://rn/lancer-slim/address/create` |
| 优惠券列表 | `xhsdiscover://rn/chaos/coupon/list` |
| 预告券列表 | `xhsdiscover://rn/chaos/coupon/trailer/list` |
| **钱包** | `xhsdiscover://rn/wallet-rn/user/wallet` |

## 7. 直播

| 场景 | Scheme |
|------|--------|
| 直播广场 | `xhsdiscover://live_square` |
| 直播观众端 | `xhsdiscover://live_audience` |
| 直播播放页 | `xhsdiscover://live_player_page` |
| 直播标签流 | `xhsdiscover://live_tagfeed` |
| 直播好物 | `xhsdiscover://live_good_products` |
| 直播商品管理 | `xhsdiscover://live_goods_manager` |
| 创建直播预告 | `xhsdiscover://live_trailer_create` |
| 直播计划入口 | `xhsdiscover://live_live_plan_entrance` |

## 8. 话题 / POI / 社区

| 场景 | Scheme |
|------|--------|
| 话题页（按关键词） | `xhsdiscover://topic/v2/<URL编码关键词>` |
| 地图 | `xhsdiscover://rn/poi/map` |
| 旅行发布 | `xhsdiscover://rn/poi-extra/travel-publish` |
| 足迹管理 | `xhsdiscover://rn/poi-extra/footprints-management` |

## 9. 账号

| 场景 | Scheme |
|------|--------|
| 登录 | `xhsdiscover://account/login` |
| 手机号登录 | `xhsdiscover://account/phone/login` |
| 账号绑定 | `xhsdiscover://account/bind` |
| 手机号绑定 | `xhsdiscover://account/bind/phone` |
| 登录设备列表 | `xhsdiscover://account/loginDeviceList` |
| 实名认证 | `xhsdiscover://account/realName/atomization` |

## 10. 设置 / 通用功能

| 场景 | Scheme |
|------|--------|
| 语言/翻译 | `xhsdiscover://language_translation_setting` |
| 缓存管理 | `xhsdiscover://resource_cache_manage` |
| 设置（RN 新版） | `xhsdiscover://rn/app-settings/apply/index` |
| 桌面小组件设置 | `xhsdiscover://rn/app-settings/widget?sort=a827631054` |
| 青少年模式引导 | `xhsdiscover://rn/app-settings/teenager/guide` |
| 注销账号 | `xhsdiscover://rn/accounts/deletion` |
| 授权应用管理 | `xhsdiscover://rn/accounts/appAuthorization/manager` |

## 11. 反馈 / 举报

| 场景 | Scheme |
|------|--------|
| 举报入口 | `xhsdiscover://report` |
| 意见反馈 | `xhsdiscover://rn/feedback/advice` |
| 反馈提交 | `xhsdiscover://rn/feedback/submit` |
| 通用反馈 | `xhsdiscover://rn/common-feedback/advice` |
| 账号申诉 | `xhsdiscover://rn/feedback/account-appeal` |
| 违规详情 | `xhsdiscover://rn/kuri/freeze-account-violation-detail` |

## 12. 创作者 / 商家（B 端）

| 场景 | Scheme |
|------|--------|
| **创作中心** | `xhsdiscover://rn/creator-center/creator?source=main_tab` |
| 商家后台 | `xhsdiscover://rn/eva-seraph/seller/` |
| 商家消息中心 | `xhsdiscover://rn/eva-seraph/messagecenter` |
| 商家客服 | `xhsdiscover://rn/eva-seraph/customHelpCenter/home` |
| 创建商品 | `xhsdiscover://rn/eva-seraph/tools/createGoods` |

## 13. Webview / 内嵌 H5

| 场景 | Scheme |
|------|--------|
| 打开 H5 | `xhsdiscover://webview/<url>` |
| H5（隐藏导航栏） | `xhsdiscover://webview/<url>?naviHidden=yes` |
| 外部 Webview | `xhsdiscover://extweb` |

## 14. 其他实用

| 场景 | Scheme |
|------|--------|
| 选择分享对象 | `xhsdiscover://choose_share_user` |
| 播客 | `xhsdiscover://rn/podcast` |
| 图搜历史 | `xhsdiscover://rn/img-search/history` |

---

## 附：常见需求 → Scheme 映射

| 用户意图 | 推荐 Scheme |
|---------|------------|
| "打开小红书搜 XXX" | `xhsdiscover://search/result?keyword=<URL编码词>` |
| "打开小红书商品搜 XXX" | `xhsdiscover://search/result?keyword=<词>&target_search=goods` |
| "打开小红书用户搜 XXX" | `xhsdiscover://search/result?keyword=<词>&target_search=users` |
| "进我的小红书主页" | `xhsdiscover://profile` |
| "看我的收藏" | `xhsdiscover://profile/collect` |
| "打开消息/看通知" | `xhsdiscover://message/center` |
| "发笔记" | `xhsdiscover://post_note` |
| "发视频" | `xhsdiscover://post_video` |
| "打开购物车" | `xhsdiscover://rn/lancer-slim/user/shopping_cart` |
| "打开订单" | `xhsdiscover://rn/lancer-slim/order/list` |
| "打开钱包" | `xhsdiscover://rn/wallet-rn/user/wallet` |
| "打开商城" | `xhsdiscover://home/store` |
| "打开直播广场" | `xhsdiscover://live_square` |
| "打开创作中心" | `xhsdiscover://rn/creator-center/creator?source=main_tab` |