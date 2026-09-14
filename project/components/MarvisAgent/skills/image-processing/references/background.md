# 背景处理执行卡

使用场景：抠图、去背景、透明背景、换背景、换底色、证件照换底。
脚本：`scripts/remove_bg.py`、`scripts/change_bg.py`。依赖：Pillow、rembg。

## 1. 依赖检查

背景路线需要 rembg；按当前 shell 平台选择命令。Windows PowerShell 禁止使用 Bash 专用 `||`。

Windows / PowerShell：

```powershell
python -c "from PIL import Image; from rembg import remove" 2>$null; if ($LASTEXITCODE -ne 0) { python -m pip install Pillow "rembg[cpu]" -q }
```

macOS / Linux / Bash：

```bash
/usr/bin/python3 -c "from PIL import Image; from rembg import remove" 2>&1 || \
  /usr/bin/python3 -m pip install Pillow "rembg[cpu]" -q 2>&1
```

## 2. 脚本选择

| 意图 | 触发词 | 脚本 | 输出 |
|------|--------|------|------|
| 抠图/去背景 | 抠图、去背景、透明背景 | `remove_bg.py` | 带透明通道 PNG |
| 换背景/换底色 | 换背景、换底色、证件照换底 | `change_bg.py` | 合成后的新图片 |

## 3. 抠图命令

Windows / PowerShell：

```powershell
python "{skill_base_dir}/scripts/remove_bg.py" "<输入图片>" `
  [--output "<输出路径>"] [--model <模型>] [--alpha-matting]
```

macOS / Linux / Bash：

```bash
/usr/bin/python3 "{skill_base_dir}/scripts/remove_bg.py" "<输入图片>" \
  [--output "<输出路径>"] [--model <模型>] [--alpha-matting]
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `input` | 必填 | 输入图片路径 |
| `--output` / `-o` | `{原文件名}_cutout.png` | 输出路径 |
| `--model` / `-m` | `u2netp` | 抠图模型 |
| `--alpha-matting` | 关闭 | 边缘羽化 |

## 4. 换背景命令

Windows / PowerShell：

```powershell
python "{skill_base_dir}/scripts/change_bg.py" "<输入图片>" `
  (--color <颜色> | --image "<背景图>") `
  [--quality-mode fast|balanced|precise] [--format jpg/png/webp]
```

macOS / Linux / Bash：

```bash
/usr/bin/python3 "{skill_base_dir}/scripts/change_bg.py" "<输入图片>" \
  (--color <颜色> | --image "<背景图>") \
  [--quality-mode fast|balanced|precise] [--format jpg/png/webp]
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `input` | 必填 | 输入图片路径 |
| `--color` / `-c` | 与 `--image` 二选一 | 纯色背景 |
| `--image` / `-i` | 与 `--color` 二选一 | 背景图片路径 |
| `--output` / `-o` | `{原文件名}_newbg.{ext}` | 输出路径 |
| `--quality-mode` | `fast` | 质量档位 |
| `--model` / `-m` | 按质量档位选择 | 显式覆盖模型 |
| `--format` / `-f` | `png` | 输出格式 |
| `--alpha-matting` | 关闭 | 边缘羽化 |
| `--despill` | 关闭 | 减轻纯色背景渗色，仅二次修复使用 |

脚本路径、输入路径、输出路径必须加双引号；路径在 Windows/macOS 都可能包含空格。

颜色参数：

| 底色 | `--color` |
|------|-----------|
| 蓝色底 | `#438EDB` |
| 红色底 | `#FF0000` 或 `red` |
| 白色底 | `#FFFFFF` 或 `white` |
| RGB | `"67,142,219"` |

## 5. 质量档位

默认保持泛化和速度，不要为某个场景全局改默认。结果不理想时按质量档位升级。

| 档位 | 默认模型 | 默认边缘羽化 | 适用 |
|------|----------|--------------|------|
| `fast` | `u2netp` | 关闭 | 默认、批量、简单主体、速度优先 |
| `balanced` | `silueta` | 关闭 | 通用质量折中，适合边缘略粗但主体完整的结果重试 |
| `precise` | `isnet-general-use` | 关闭 | 质量优先、低对比边缘、主体漏抠、复杂主体 |

档位只切换抠图模型，**不再隐式启用** `--alpha-matting`。用户显式指定 `--model` 时以 `--model` 为准。用户明确说“发丝/边缘精细”时，才追加 `--alpha-matting`；证件照黑发、深色主体不要默认叠加，因为 alpha matting 的 erode 会向内侵蚀边缘，反而把发丝整片抠掉。

首次执行选择：

- 首次一律使用默认 `fast`，包括证件照/头像/人像换纯色底。**不要**在首次尝试就使用 `precise` 或叠加 `--alpha-matting`。
- 首次结果不理想时按 §6 二次修复策略逐级升级；不要凭“用户是证件照”这类场景标签直接跳过升级路径。
- 用户明确要求速度优先或批量快速处理时，也保持 `fast`。

## 6. 二次修复策略

首次处理结果不理想时，不要堆场景特判，按问题类型升级处理：

| 问题表现 | 二次处理 |
|----------|----------|
| 主体边缘略粗但主体完整 | 先用 `--quality-mode balanced` 重试 |
| 主体大面积漏抠、低对比边缘丢失、浅色主体被误当背景 | 直接用 `--quality-mode precise` 重试 |
| 发丝、复杂毛边、用户明确要求羽化 | 在 `--quality-mode precise` 基础上叠加 `--alpha-matting` 重试；若发现主体反而被侵蚀（黑发、深色衣物边缘变透明或缺失），立即撤掉 `--alpha-matting` |
| 证件照/人像换底后，头发/衣物边缘缺失或整片被抠掉 | 回退到 `--quality-mode balanced` 或 `fast`；**禁止**通过叠加 `--alpha-matting` 来试图“修复”缺失，那只会加剧侵蚀 |
| 纯色新背景只在半透明边缘形成细窄红/蓝/绿色边 | 在更高质量档位基础上追加 `--despill` |

`--despill` 默认关闭，避免误伤商品图、素材图、半透明物体、真实彩色主体；只有用户反馈边缘染色/渗色/溢色时使用。
如果是主体大面积缺失或衣服被当成背景，优先升级到 `precise`，不要指望 `--despill` 修复漏抠。

## 7. 边界与故障处理

- 非照片内容（截图、图表、纯文字）抠图效果可能较差，需要提醒用户。
- 超大图片建议先按 `references/resize.md` 缩到长边 2048px 以内。
- 复杂场景/多人合影默认模型可能不理想，可按质量档位升级。
- 支持 PNG、JPEG、WebP、BMP、TIFF；JPEG 不支持透明通道，只适合换背景输出。
- `No onnxruntime backend found`：执行 `pip install "rembg[cpu]" --force-reinstall`。
- 模型缓存无权限：设置 `U2NET_HOME` 到可写目录后重试。

## 8. 结果处理

必须遵守主文件“结果汇报协议”，明确结果基于用户原图处理，不是纯 AI 新创作文件。

推荐成功话术。`yyb-product` 是**带 ``` 围栏的产物代码块**，前端提取器强依赖该围栏，
必须**照 SKILL.md §4 结果汇报协议**输出（三反引号紧跟 `<yyb-product>`，链接单独一行，末尾三反引号闭合）：

<pre>
已基于你提供的原图完成背景处理，源文件已保留，结果文件如下。
该结果基于用户提供的原图进行处理，不是纯 AI 新创作文件。

```&lt;yyb-product&gt;
[photo_newbg.jpg](C:\Users\Administrator\Desktop\photo_newbg.jpg)
```
</pre>

**硬性红线**（三条必须同时满足）：

- **必须**保留 ` ```<yyb-product> ` 起始围栏和 ` ``` ` 结束围栏，前端 `ProductExtractor` 用
  `` ```<yyb-product>[^\n]*\n(.*?)\n\s*``` `` 提取产物，缺失围栏会导致产物卡片无法渲染。
- 链接 URL **禁止**用 `<` `>` 尖括号包裹；正确：`[photo.jpg](C:\path\photo.jpg)`，错误：`[photo.jpg](<C:\path\photo.jpg>)`。
- 链接文本必须是**真实的输出文件名并带扩展名**（如 `photo_newbg.jpg`、`photo_cutout.png`），禁止写成"抠图后的图片"之类无扩展名描述，否则前端无法渲染缩略图。
