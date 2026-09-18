import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "assets/mock-office-replays");
const ffmpeg = process.env.FFMPEG_BIN || (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const fontFile = process.env.MOCK_REPLAY_FONT || (process.platform === "win32" ? "C\\:/Windows/Fonts/msyh.ttc" : "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc");

const REPLAYS = [
  { file: "comment-acquisition", color: "2588f5", view: "互动消息", nav: "互动消息", rows: ["上海周先生   周末能安排试驾吗？", "杭州林女士   可以零首付分期吗？", "绍兴唐女士   上海店现在有现车吗？"], action: "读取新评论，识别试驾与价格意向", result: "已加入待触达队列" },
  { file: "gold-customer-service", color: "16bfae", view: "私信客服", nav: "消息管理", rows: ["南京徐女士   周日下午可以试驾吗？", "合肥赵先生   直播间优惠还能用吗？", "绍兴唐女士   续航够通勤和回家吗？"], action: "根据用户问题生成下一句回复", result: "已更新客户跟进记录" },
  { file: "live-danmaku-analysis", color: "9a72f5", view: "直播管理", nav: "直播管理", rows: ["想知道现在订车有什么优惠", "周末到上海店能试驾吗", "家用续航实际能跑多少公里"], action: "实时归类弹幕问题与转化阻力", result: "已同步直播问题清单" },
  { file: "viral-work-analysis", color: "ff3f58", view: "作品数据", nav: "数据中心", rows: ["前 3 秒：限时优惠开场", "12 秒：车型配置对比", "评论区：试驾与库存咨询集中"], action: "提取作品结构与高互动片段", result: "已保存爆款拆解报告" },
  { file: "live-danmaku-outreach", color: "1bbdac", view: "直播间互动", nav: "互动消息", rows: ["上海周先生   试驾问题已进入私信", "杭州林女士   金融方案待平台回执", "绍兴唐女士   已回复试驾时间咨询"], action: "按意向优先级执行私信触达", result: "已记录发送与回复状态" }
];

function escapeText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");
}

function drawText(text, x, y, size, color, start = 0, weight = "normal") {
  return `drawtext=fontfile='${fontFile}':text='${escapeText(text)}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}:enable='gte(t,${start})'${weight === "bold" ? ":borderw=0" : ""}`;
}

function drawBox(x, y, width, height, color, start = 0) {
  return `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=${color}:t=fill:enable='gte(t,${start})'`;
}

function filtersFor(replay) {
  const accent = `0x${replay.color}`;
  const filters = [
    drawBox(0, 0, 960, 720, "0x202633"),
    drawBox(0, 0, 960, 42, "0x151a23"),
    drawText("云桌面", 26, 10, 20, "0xf2f5f8"),
    drawBox(140, 15, 9, 9, "0x42c98a"),
    drawText("已连接", 158, 11, 16, "0xbdc8d5"),
    drawText("09:18", 885, 11, 16, "0xbdc8d5"),
    drawBox(24, 58, 912, 638, "0xffffff"),
    drawBox(24, 58, 912, 52, "0xf0f2f5"),
    drawBox(48, 77, 12, 12, "0xff6a6a"),
    drawBox(68, 77, 12, 12, "0xffc45d"),
    drawBox(88, 77, 12, 12, "0x4fc978"),
    drawBox(132, 70, 568, 26, "0xffffff"),
    drawText("creator.douyin.com", 154, 73, 16, "0x667382"),
    drawText("抖音创作服务平台", 746, 73, 17, "0x344150"),
    drawBox(24, 110, 164, 586, "0xf7f8fa"),
    drawText("抖音", 48, 136, 30, "0x161c25", 0, "bold"),
    drawText("内容管理", 52, 205, 20, "0x697584"),
    drawBox(42, replay.nav === "互动消息" ? 234 : replay.nav === "消息管理" ? 264 : replay.nav === "直播管理" ? 294 : 324, 128, 42, "0xe8f2ff"),
    drawText("互动消息", 62, 244, 20, replay.nav === "互动消息" ? accent : "0x697584"),
    drawText("消息管理", 62, 274, 20, replay.nav === "消息管理" ? accent : "0x697584"),
    drawText("直播管理", 62, 304, 20, replay.nav === "直播管理" ? accent : "0x697584"),
    drawText("数据中心", 62, 334, 20, replay.nav === "数据中心" ? accent : "0x697584"),
    drawText(replay.view, 224, 142, 36, "0x1e2731", 0, "bold"),
    drawText("自动化任务运行中", 226, 187, 20, "0x718092"),
    drawBox(224, 218, 460, 390, "0xf9fafb"),
    drawText("最新互动", 252, 242, 22, "0x4c5968"),
    drawBox(710, 218, 198, 390, "0xf7faff"),
    drawText("Agent 操作", 734, 244, 22, accent, 0, "bold"),
    drawText(replay.action, 734, 284, 24, "0x344150", 0.5),
    drawBox(734, 368, 146, 2, "0xdbe5f1", 0.8),
    drawText(replay.result, 734, 398, 23, "0x2f9a6b", 2.9),
    drawText("同步完成", 734, 440, 18, "0x738094", 2.9)
  ];
  replay.rows.forEach((row, index) => {
    const start = 0.8 + index * 1.15;
    const y = 276 + index * 98;
    filters.push(drawBox(246, y, 414, 78, "0xffffff", start));
    filters.push(drawBox(266, y + 29, 12, 12, accent, start));
    filters.push(drawText(row, 296, y + 22, 25, "0x344150", start));
  });
  filters.push("drawbox=x=734:y=554:w='min(146,146*t/6.5)':h=4:color=0x2ec487:t=fill");
  return filters.join(",");
}

mkdirSync(outputDir, { recursive: true });
for (const replay of REPLAYS) {
  const output = resolve(outputDir, `${replay.file}.mp4`);
  execFileSync(ffmpeg, [
    "-y", "-f", "lavfi", "-i", "color=c=0xf6f8fb:s=960x720:r=30:d=7",
    "-vf", filtersFor(replay), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output
  ], { stdio: "inherit" });
}
