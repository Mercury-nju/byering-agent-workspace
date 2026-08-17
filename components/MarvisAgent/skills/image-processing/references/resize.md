# 缩放与尺寸调整执行卡

使用场景：改尺寸、调分辨率、照片尺寸、A4/A3、放大、缩小、压缩尺寸。
脚本：`scripts/resize_image.py`。依赖：Pillow。

## 1. 依赖检查

缩放路线只需要 Pillow；不要为了单纯缩放安装 rembg。按当前 shell 平台选择命令。

Windows / PowerShell：

```powershell
python -c "from PIL import Image" 2>$null; if ($LASTEXITCODE -ne 0) { python -m pip install Pillow -q }
```

macOS / Linux / Bash：

```bash
/usr/bin/python3 -c "from PIL import Image" 2>&1 || \
  /usr/bin/python3 -m pip install Pillow -q 2>&1
```

## 2. 参数抽取

| 参数 | 来源 | 默认值 |
|------|------|--------|
| `source` | 用户图片文件或文件夹路径 | 必填 |
| `size` | 用户指定尺寸，如 `800x600`、`5寸`、`A4` | 必填 |
| `--output-dir` | 用户指定输出目录 | 源目录下 `resized/` |
| `--suffix` | 用户指定文件名后缀 | 空 |
| `--format` | 用户指定输出格式 | `same` |
| `--quality` | 用户指定 JPEG/WebP 质量 | `95` |
| `--mode` | 比例策略：`auto`/`fit`/`fill`/`pad`/`stretch` | `auto` |
| `--json` | 固定追加，用于可靠解析结果 | 必须加 |

缺少必填的 `source` 或 `size` 时再询问；其他缺省值直接使用。

## 3. 命令模板

Windows / PowerShell：

```powershell
python "{skill_base_dir}/scripts/resize_image.py" "<source>" "<size>" --json
```

```powershell
python "{skill_base_dir}/scripts/resize_image.py" "<source>" "<size>" `
  --output-dir "<目录>" --suffix "<后缀>" --format "<格式>" --json
```

macOS / Linux / Bash：

```bash
/usr/bin/python3 "{skill_base_dir}/scripts/resize_image.py" "<source>" "<size>" --json
```

```bash
/usr/bin/python3 "{skill_base_dir}/scripts/resize_image.py" "<source>" "<size>" \
  --output-dir "<目录>" --suffix "<后缀>" --format "<格式>" --json
```

仅在用户明确要求特定策略时追加 `--mode`，否则不加，让脚本使用 `auto`。

常用模式：

```text
--mode fill
--mode pad
--mode stretch
```

脚本路径、输入路径、输出路径必须加双引号；路径在 Windows/macOS 都可能包含空格。

## 4. 尺寸规则

| 类型 | 示例 | 处理 |
|------|------|------|
| 精确像素 | `800x600`、`800*600`、`800×600` | 指定宽高 |
| 单边尺寸 | `800`、`宽800`、`高600`、`x600` | 另一边等比计算 |
| 物理尺寸 | `5寸`、`6寸`、`A4`、`A3` | 按 300DPI 换算 |
| 照片尺寸 | `1寸`、`2寸`、`大2寸`、`3寸`、`7寸`、`8寸` | 证件照/冲印标准 |

硬性边界：

- `0x800`、`800x0`、`0`、负数、非数字尺寸必须拒绝，不能改写成 `800x800` 或其他尺寸。
- 标准照片尺寸默认跟随原图横竖方向，例如 `5寸` 横版为 `1500x1050`，竖版为 `1050x1500`。

## 5. 比例策略

不要手写 PIL 做裁剪、补边、拉伸；统一交给 `resize_image.py`。

| 用户意图 | 参数 | 行为 |
|----------|------|------|
| 照片尺寸/物理尺寸，如 `5寸`、`A4` | 不加 `--mode` | `auto` 自动生成精确成品尺寸，必要时居中裁剪，不产生黑边 |
| 普通缩放，如 `宽800`、`高600`、`800x600` | 不加 `--mode` | `auto` 默认等比适配目标框 |
| 用户说“填满/裁剪/不要留边” | `--mode fill` | 等比放大后居中裁剪到目标尺寸 |
| 用户说“完整保留/不裁剪/允许白边” | `--mode pad` | 等比缩放后用白色补边到目标尺寸 |
| 用户说“拉伸/不保持比例/允许变形” | `--mode stretch` | 直接拉伸到目标尺寸，可能变形 |
| 用户只想缩小到框内，不要求最终尺寸精确 | `--mode fit` | 等比缩放到目标框内，不裁剪、不补边 |

重点：用户要求“改为 5寸/6寸/A4”等成品尺寸时，默认直接调用脚本，不要额外写脚本补边；黑边通常来自临场手写画布逻辑。

## 6. 结果处理

必须遵守主文件“结果汇报协议”，明确结果基于用户原图处理，不是纯 AI 新创作文件。

解析 JSON：

- `success=true`：汇报输出路径和处理数量。
- `success=false`：汇报 `summary` 或单项 `warning`，不得声称成功。
- 单图使用 `results[0].output`；批量可汇报输出目录和成功/失败数量。

推荐成功话术。`yyb-product` 是**带 ``` 围栏的产物代码块**，前端提取器强依赖该围栏，
必须**照 SKILL.md §4 结果汇报协议**输出（三反引号紧跟 `<yyb-product>`，链接单独一行，末尾三反引号闭合）：

<pre>
已基于你提供的原图完成尺寸处理，源文件已保留，结果文件如下。
该结果基于用户提供的原图进行处理，不是纯 AI 新创作文件。

```&lt;yyb-product&gt;
[photo_5inch.jpg](C:\Users\Administrator\Desktop\photo_5inch.jpg)
```
</pre>

**硬性红线**（三条必须同时满足）：

- **必须**保留 ` ```<yyb-product> ` 起始围栏和 ` ``` ` 结束围栏，前端 `ProductExtractor` 用
  `` ```<yyb-product>[^\n]*\n(.*?)\n\s*``` `` 提取产物，缺失围栏会导致产物卡片无法渲染。
- 链接 URL **禁止**用 `<` `>` 尖括号包裹；正确：`[photo.jpg](C:\path\photo.jpg)`，错误：`[photo.jpg](<C:\path\photo.jpg>)`。
- 链接文本必须是**真实的输出文件名并带扩展名**（如 `photo_5inch.jpg`），禁止写成"处理后的图片"之类无扩展名描述，否则前端可能无法渲染缩略图。

常见组合：

- 缩放并转格式：用 `--format` 一步完成，不要拆成两次。
- 自定义文件名：用 `--suffix`，例如 `--suffix _5inch` 生成 `photo_5inch.jpg`。
- 批量处理：直接把文件夹路径作为 `source`。
