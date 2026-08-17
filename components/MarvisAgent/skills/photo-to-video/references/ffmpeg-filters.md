# FFmpeg 滤镜语法参考

本文档记录 photo-to-video 技能中使用的 FFmpeg 滤镜语法，供开发和调试参考。

## 视频滤镜

### scale — 缩放

将视频/图片缩放到指定尺寸。

```
scale=<width>:<height>[:flags=<algorithm>][:force_original_aspect_ratio=<mode>]
```

**参数：**
- `width`、`height`：目标尺寸，支持表达式（如 `iw*2`、`-1` 自动计算）
- `flags`：缩放算法，推荐 `lanczos`（高质量）
- `force_original_aspect_ratio`：保持宽高比模式
  - `decrease`：缩小到目标尺寸内（不超出）
  - `increase`：放大到至少覆盖目标尺寸

**示例：**
```
# 缩放到 1920x1080 内，保持宽高比
scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos
```

### pad — 填充

在视频/图片周围添加填充（黑边）。

```
pad=<width>:<height>:<x>:<y>[:color=<color>]
```

**参数：**
- `width`、`height`：输出尺寸
- `x`、`y`：视频在输出中的位置（支持表达式）
- `color`：填充颜色，默认 `black`

**示例：**
```
# 填充到 1920x1080，居中放置
pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black
```

### zoompan — 缩放平移（Ken Burns 效果）

对静态图片应用缩放和平移动画。

```
zoompan=z='<zoom_expr>':x='<x_expr>':y='<y_expr>':d=<frames>:s=<size>:fps=<fps>
```

**参数：**
- `z`：缩放因子表达式（1.0 = 原始大小）
- `x`、`y`：平移位置表达式
- `d`：总帧数
- `s`：输出尺寸（如 `1920x1080`）
- `fps`：输出帧率

**内置变量：**
- `on`：当前帧号（从 1 开始）
- `iw`、`ih`：输入宽度/高度
- `zoom`：当前缩放值

**示例：**
```
# 从 1.0 缩放到 1.2，从左到右平移，持续 90 帧
zoompan=z='if(eq(on,1),1.0,1.0+(1.2-1.0)*on/90)':x='on/90*(iw-iw/zoom)':y='(ih-ih/zoom)/2':d=90:s=1920x1080:fps=30
```

### fade — 淡入淡出

```
fade=t=<type>:st=<start_time>:d=<duration>
```

**参数：**
- `t`：类型，`in`（淡入）或 `out`（淡出）
- `st`：开始时间（秒）
- `d`：持续时间（秒）

**示例：**
```
# 开头 0.3 秒淡入
fade=t=in:st=0:d=0.3

# 结尾 0.3 秒淡出（假设总时长 3 秒）
fade=t=out:st=2.7:d=0.3
```

### xfade — 交叉转场

在两个视频流之间创建转场效果。

```
xfade=transition=<type>:duration=<seconds>:offset=<seconds>
```

**参数：**
- `transition`：转场类型
  - `fade`：淡入淡出
  - `dissolve`：溶解
  - `wipeleft`、`wiperight`、`wipeup`、`wipedown`：擦除
  - `slideleft`、`slideright`、`slideup`、`slidedown`：滑动
  - 更多类型参见 FFmpeg 文档
- `duration`：转场持续时间（秒）
- `offset`：转场开始的时间偏移（秒，相对于第一个输入流）

**示例：**
```
# 在第 2.5 秒开始 0.5 秒的溶解转场
[v0][v1]xfade=transition=dissolve:duration=0.5:offset=2.5[xf1]
```

### setsar — 设置采样宽高比

```
setsar=1
```

确保输出的像素宽高比为 1:1（方形像素），避免播放器拉伸。

### setpts — 设置时间戳

```
setpts=PTS-STARTPTS
```

重置时间戳从 0 开始，常用于拼接后的时间戳对齐。

### format — 像素格式转换

```
format=yuva420p
```

转换为带 Alpha 通道的 YUV 格式，xfade 转场需要此格式。

### loop — 循环

```
loop=loop=<count>:size=<frames>:start=<frame>
```

将单帧图片循环为多帧视频。

**示例：**
```
# 将单帧循环为 89 帧（加上原始 1 帧共 90 帧）
loop=loop=89:size=1:start=0
```

### concat — 拼接

```
concat=n=<count>:v=<video_streams>:a=<audio_streams>
```

将多个视频流按顺序拼接。

## 音频滤镜

### volume — 音量调节

```
volume=<level>
```

**示例：**
```
volume=0.5    # 50% 音量
volume=1.5    # 150% 音量
```

### afade — 音频淡入淡出

```
afade=t=<type>:st=<start_time>:d=<duration>
```

与视频 fade 类似，但作用于音频。

**示例：**
```
# 结尾 2 秒淡出
afade=t=out:st=13:d=2
```

### atrim — 音频截断

```
atrim=<start>:<end>
```

截取音频的指定时间段。

**示例：**
```
# 截取前 15 秒
atrim=0:15
```

### asetpts — 音频时间戳重置

```
asetpts=PTS-STARTPTS
```

重置音频时间戳，常与 atrim 配合使用。

## 常用滤镜组合

### 图片缩放 + 填充到目标分辨率

```
scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1
```

### Ken Burns 效果完整链

```
# 先放大图片给 zoompan 留空间，再应用 zoompan
scale=2496:1404:force_original_aspect_ratio=decrease:flags=lanczos,pad=2496:1404:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,zoompan=z='if(eq(on,1),1.0,1.0+(1.2-1.0)*on/90)':x='on/90*(iw-iw/zoom)':y='(ih-ih/zoom)/2':d=90:s=1920x1080:fps=30,setpts=PTS-STARTPTS,format=yuva420p
```

### 音频处理完整链

```
# 音量 50% + 截断到 15 秒 + 结尾 2 秒淡出
volume=0.5,atrim=0:15,asetpts=PTS-STARTPTS,afade=t=out:st=13:d=2
```

## FFmpeg 命令行参数参考

### 输入参数

| 参数 | 说明 |
|------|------|
| `-loop 1` | 循环输入（用于静态图片） |
| `-t <seconds>` | 输入时长限制 |
| `-i <file>` | 输入文件 |
| `-stream_loop <count>` | 循环输入流（用于音频循环） |

### 输出参数

| 参数 | 说明 |
|------|------|
| `-c:v libx264` | H.264 视频编码 |
| `-preset medium` | 编码速度/质量平衡 |
| `-crf <value>` | 质量控制（18=高质量，28=低质量） |
| `-pix_fmt yuv420p` | 像素格式（兼容性最好） |
| `-movflags +faststart` | MP4 快速启动（元数据前置） |
| `-c:a aac` | AAC 音频编码 |
| `-b:a 192k` | 音频比特率 |
| `-an` | 无音频 |
| `-y` | 覆盖已有文件 |

### 滤镜图参数

| 参数 | 说明 |
|------|------|
| `-filter_complex <graph>` | 复杂滤镜图 |
| `-map <label>` | 选择输出流 |
