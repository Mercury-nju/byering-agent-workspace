import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("artifacts/爆款作品分析报告-viral-work-analysis-resynthesis-20260917-141650.html");
const output = resolve("artifacts/爆款作品分析报告-创作决策版-20260917-160000.html");
const html = await readFile(source, "utf8");
const firstFrame = html.match(/data:image\/jpeg;base64,[^"]+/)?.[0] || "";
if (!firstFrame) throw new Error("No video frame is available for the report preview");

const replacement = `    <nav class="report-nav" aria-label="报告目录"><a class="nav-link" href="#decision">先看判断</a><a class="nav-link" href="#video">内容证据</a><a class="nav-link" href="#frames">关键画面</a><a class="nav-link" href="#reuse">下一条怎么做</a></nav>
  </section>
  <section class="section" id="decision">
    <div class="section-heading"><span class="section-number">01</span><div><p class="section-kicker">先看结论</p><h2>这条视频最值得参考什么</h2></div></div>
    <div class="two-col"><div><p class="label">值得参考</p><p class="intent-value">用热门但容易被说复杂的概念切入，再用大白话、产品例子和选择建议，把观众从“听不懂”带到“知道该怎么选”。</p></div><div><p class="label">不建议照搬</p><p class="intent-value">不要照搬夜间边走边讲的形式，也不要把完整概念课原样搬进下一条。观众需要的是更快进入问题和结论。</p></div></div>
    <p class="insight"><strong>下一条直接这样试：</strong>开头 3 秒先抛出一个观众已经听过、但仍然说不清的问题；中段只保留 3 个判断；最后给新手一个明确选择。用开头留存、收藏和“这下懂了 / 适合谁”的评论验证这套讲法。</p>
  </section>
  <section class="section" id="metrics">`;

const start = html.indexOf('    <aside class="notice">');
const end = html.indexOf('  <section class="section" id="metrics">');
if (start < 0 || end < 0 || end <= start) throw new Error("Expected report intro blocks were not found");

let optimized = `${html.slice(0, start)}${replacement}${html.slice(end + '  <section class="section" id="metrics">'.length)}`;

optimized = optimized.replace(
  /\.metrics\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:1px;margin-top:24px;background:var\(--line\)\}/,
  `.work-evidence{display:grid;grid-template-columns:minmax(240px,.72fr) minmax(0,1.28fr);gap:30px;align-items:start}.work-preview{margin:0;border:1px solid var(--line);background:#e8e4dc}.work-preview img{display:block;width:100%;aspect-ratio:9/16;object-fit:cover;background:#d9dddc}.work-preview figcaption{padding:10px 12px;color:var(--muted);font-size:12px;line-height:1.55}.work-data{min-width:0}.work-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;border-top:1px solid var(--line)}.work-meta div{padding:12px 0;border-bottom:1px solid var(--line)}.work-meta span{display:block;color:var(--muted);font-size:12px}.work-meta strong{display:block;margin-top:3px;font-size:16px;font-weight:650;overflow-wrap:anywhere}.data-evidence{margin:14px 0 0;padding:12px 14px;border-left:3px solid var(--blue);background:var(--blue-soft);color:#40545e;font-size:12px;line-height:1.65}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:18px;background:var(--line)}`
);
optimized = optimized.replace(
  /\.two-col,\.detail-grid\{grid-template-columns:1fr;gap:18px\}/,
  `.two-col,.detail-grid,.work-evidence{grid-template-columns:1fr;gap:18px}`
);
const dataStart = optimized.indexOf('    <div class="fact-grid">', optimized.indexOf('  <section class="section" id="metrics">'));
const dataEnd = optimized.indexOf('  </section>\n  <section class="section" id="video">', dataStart);
if (dataStart < 0 || dataEnd < 0) throw new Error("Expected video-data section was not found");
const metrics = `    <div class="work-evidence">
      <figure class="work-preview"><img src="${firstFrame}" alt="作品首帧预览"><figcaption><strong>视频首帧预览</strong><br>本次结果未返回官方封面地址，暂以已保存的视频首帧作为作品识别图；后续采集到官方封面会自动替换。</figcaption></figure>
      <div class="work-data">
        <div class="work-meta"><div><span>作品</span><strong>Agent 和 Harness到底是个啥</strong></div><div><span>作者</span><strong>Manta_Ai</strong></div><div><span>发布时间</span><strong>2026 年 9 月 6 日 16:53</strong></div><div><span>时长</span><strong>6 分 36 秒</strong></div></div>
        <div class="metrics"><div class="metric"><strong>2.3 万</strong><span>点赞</span></div><div class="metric"><strong>225</strong><span>评论</span></div><div class="metric"><strong>2,946</strong><span>收藏</span></div><div class="metric"><strong>682</strong><span>分享</span></div></div>
        <p class="data-evidence"><strong>数据来源：</strong>抖音作品公开页 · 作品 ID 7682342845214182707。采集于 2026 年 9 月 17 日；页面未显示播放量，因此本报告不展示播放量或互动率。</p>
      </div>
    </div>
`;
optimized = `${optimized.slice(0, dataStart)}${metrics}${optimized.slice(dataEnd)}`;
await writeFile(output, optimized);
