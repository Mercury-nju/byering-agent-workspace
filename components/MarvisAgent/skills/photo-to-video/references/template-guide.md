# 模板配置指南

本文档说明 photo-to-video 技能的模板 JSON 配置格式，以及如何创建自定义模板。

## 模板文件位置

模板配置文件存放在 `assets/templates/` 目录下，文件格式为 JSON。

```
assets/templates/
├── classic.json    # 经典相册模板
└── vlog.json       # 活力 Vlog 模板
```

## 模板 JSON 字段说明

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | ✅ | — | 模板唯一标识名（与文件名一致） |
| `display_name` | string | ❌ | `""` | 模板显示名称（中文） |
| `description` | string | ❌ | `""` | 模板描述 |
| `duration_per_image` | number | ✅ | 3 | 每张图片显示时长（秒） |
| `fps` | number | ✅ | 30 | 帧率 |
| `resolution` | object | ✅ | — | 输出分辨率 |
| `resolution.width` | integer | ✅ | 1920 | 输出宽度（必须为偶数） |
| `resolution.height` | integer | ✅ | 1080 | 输出高度（必须为偶数） |
| `effects` | array | ✅ | — | 动效配置列表 |
| `transition` | object | ✅ | — | 转场配置 |
| `background_color` | string | ❌ | `"black"` | 背景填充颜色 |

### effects 动效配置

每个动效对象包含以下字段：

#### kenburns（Ken Burns 缩放平移）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | string | — | 固定为 `"kenburns"` |
| `zoom_start` | number | 1.0 | 起始缩放比例 |
| `zoom_end` | number | 1.2 | 结束缩放比例 |
| `pan_direction` | string | `"random"` | 平移方向：`"random"`、`"left_to_right"`、`"right_to_left"`、`"top_to_bottom"`、`"bottom_to_top"`、`"center"` |

#### none（无动效）

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 固定为 `"none"` |

### transition 转场配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | string | — | 转场类型：`"fade"`（淡入淡出）、`"xfade"`（交叉溶解）、`"none"`（无转场） |
| `duration` | number | 0.5 | 转场持续时间（秒） |

## 完整模板示例

### 经典相册模板（classic.json）

```json
{
    "name": "classic",
    "display_name": "经典相册",
    "description": "Ken Burns 缩放 + 淡入淡出转场，适合通用场景",
    "duration_per_image": 3,
    "fps": 30,
    "resolution": {
        "width": 1920,
        "height": 1080
    },
    "effects": [
        {
            "type": "kenburns",
            "zoom_start": 1.0,
            "zoom_end": 1.2,
            "pan_direction": "random"
        }
    ],
    "transition": {
        "type": "fade",
        "duration": 0.5
    },
    "background_color": "black"
}
```

### 活力 Vlog 模板（vlog.json）

```json
{
    "name": "vlog",
    "display_name": "活力 Vlog",
    "description": "快节奏切换 + 交叉溶解转场，适合社交媒体",
    "duration_per_image": 2,
    "fps": 30,
    "resolution": {
        "width": 1080,
        "height": 1920
    },
    "effects": [
        {
            "type": "kenburns",
            "zoom_start": 1.0,
            "zoom_end": 1.3,
            "pan_direction": "random"
        }
    ],
    "transition": {
        "type": "xfade",
        "duration": 0.8
    },
    "background_color": "black"
}
```

## 创建自定义模板

### 步骤

1. 在 `assets/templates/` 目录下创建新的 JSON 文件（如 `my_template.json`）
2. 按照上述字段说明填写配置
3. 使用时通过 `--template my_template` 指定模板名（不含 `.json` 后缀）

### 自定义模板示例：慢节奏风景

```json
{
    "name": "landscape",
    "display_name": "风景慢赏",
    "description": "慢节奏缩放，适合风景照片",
    "duration_per_image": 5,
    "fps": 24,
    "resolution": {
        "width": 3840,
        "height": 2160
    },
    "effects": [
        {
            "type": "kenburns",
            "zoom_start": 1.0,
            "zoom_end": 1.1,
            "pan_direction": "random"
        }
    ],
    "transition": {
        "type": "xfade",
        "duration": 1.0
    },
    "background_color": "black"
}
```

### 自定义模板示例：无动效快速切换

```json
{
    "name": "quick",
    "display_name": "快速切换",
    "description": "无动效，快速切换，适合大量图片快速浏览",
    "duration_per_image": 1,
    "fps": 30,
    "resolution": {
        "width": 1920,
        "height": 1080
    },
    "effects": [
        {
            "type": "none"
        }
    ],
    "transition": {
        "type": "fade",
        "duration": 0.2
    },
    "background_color": "black"
}
```

## 注意事项

1. **分辨率必须为偶数**：FFmpeg 要求视频宽高为偶数，系统会自动调整奇数值
2. **转场时长不能超过图片时长**：`transition.duration` 应小于 `duration_per_image`
3. **Ken Burns 缩放范围**：`zoom_end` 建议不超过 1.5，过大会导致画面模糊
4. **命令行参数优先**：通过 `--duration`、`--fps`、`--resolution` 等命令行参数可以覆盖模板中的对应值
5. **背景颜色**：支持 FFmpeg 颜色名称（如 `black`、`white`、`gray`）或十六进制值（如 `0x000000`）
