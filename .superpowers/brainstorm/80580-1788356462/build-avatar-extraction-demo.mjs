import fs from "node:fs";
import path from "node:path";

const liveDir = "assets/grok-bot-avatars/live";
const output = ".superpowers/brainstorm/80580-1788356462/avatar-extraction-demo.html";
const entries = [
  { files: [["01-chief.svg", "#54B9A6"]], name: "Chief", state: "idle" },
  { files: [["02-sales-outbound.svg", "#F19D38"]], name: "Sales Outbound", state: "working" },
  { files: [["03-inbox-manager.svg", "#6464EF"]], name: "Inbox Manager", state: "notifying" },
  { files: [["04-account-manager.svg", "#885CF5"]], name: "Account Manager", state: "sleeping" },
  { files: [["05-talent-scout.svg", "#3C82F6"]], name: "Talent Scout", state: "searching" },
  { files: [["06-expense-manager.svg", "#ED712E"]], name: "Expense Manager", state: "working" }
];

function renderSvg(file, index, name) {
  let svg = fs.readFileSync(path.join(liveDir, file), "utf8").trim();
  svg = svg.replace(/id="([^"]+)"/g, `id="avatar-${index}-$1"`);
  svg = svg.replace(/url\(#([^)]*)\)/g, "url(#avatar-$1)");
  return svg.replace(/<svg /, `<svg data-avatar="${name}" `);
}

const cards = entries.map((entry, cardIndex) => {
  const artwork = entry.group
    ? `<div class="group-artwork">${entry.files.map(([file, color], layerIndex) => `<div class="bot-layer bot-layer-${layerIndex}" style="--fg:${color};--bg:#FFFFFF">${renderSvg(file, `${cardIndex}-${layerIndex}`, entry.name)}</div>`).join("")}</div>`
    : `<div class="artwork" style="--fg:${entry.files[0][1]};--bg:#FFFFFF">${renderSvg(entry.files[0][0], cardIndex, entry.name)}</div>`;
  return `<article class="avatar-card" data-state="${entry.state}">${artwork}<div class="card-copy"><h3>${entry.name}</h3><p>Captured live SVG · <span data-state-label>${entry.state}</span></p></div></article>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>x.ai Live Avatar Extraction</title>
<style>
  :root { --paper:#f5f5f3; --ink:#16181d; --muted:#7d8087; --line:#dedfe2; --green:#4d9b73; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  main { max-width:1180px; margin:0 auto; padding:42px 32px 64px; }
  header { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:28px; }
  h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
  header p { margin:0; color:var(--muted); font-size:14px; }
  .status { min-width:220px; border:1px solid var(--line); background:#fff; padding:10px 12px; font-size:12px; line-height:1.4; }
  .status strong { display:block; color:var(--green); font-size:13px; }
  .toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
  button { border:1px solid #d7d9dc; border-radius:7px; background:#fff; color:#444950; padding:8px 11px; font:inherit; font-size:12px; cursor:pointer; }
  button:hover { border-color:#a7abb1; color:#16181d; }
  .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
  .avatar-card { display:flex; min-height:205px; flex-direction:column; justify-content:space-between; gap:18px; padding:18px; border:1px solid var(--line); border-radius:8px; background:#fff; }
  .artwork { display:grid; min-height:134px; place-items:center; }
  .artwork > svg { display:block; width:126px; height:126px; overflow:visible; }
  .group-artwork { position:relative; width:126px; height:126px; }
  .bot-layer { position:absolute; width:58px; height:58px; line-height:0; }
  .bot-layer > svg { display:block; width:100%; height:100%; overflow:visible; }
  .group-artwork .grok-bot-mark__head { fill:var(--fg); transition:fill .6s; }
  .group-artwork .grok-bot-mark__eye { fill:var(--bg); transition:fill .6s; transform-box:fill-box; transform-origin:center; }
  .bot-layer-0 { left:7px; top:51px; z-index:1; }
  .bot-layer-1 { left:29px; top:30px; z-index:2; }
  .bot-layer-2 { left:57px; top:51px; z-index:3; }
  .artwork .grok-bot-mark__head { fill:var(--fg); transition:fill .6s; }
  .artwork .grok-bot-mark__eye { fill:var(--bg); transition:fill .6s; transform-box:fill-box; transform-origin:center; }
  .avatar-card[data-state="working"] .artwork,
  .avatar-card[data-state="working"] .group-artwork { animation:float 2.8s ease-in-out infinite; }
  .avatar-card[data-state="searching"] .artwork { animation:float 3.6s ease-in-out infinite; }
  .avatar-card[data-state="notifying"] .artwork { animation:notify .9s ease-out infinite alternate; }
  .avatar-card[data-state="sleeping"] .artwork { opacity:.82; }
  .avatar-card.is-spin .artwork { animation:spin .72s cubic-bezier(.22,.61,.36,1); }
  .avatar-card.is-bounce .artwork { animation:bounce .62s cubic-bezier(.22,.61,.36,1); }
  .card-copy h3 { margin:0 0 4px; font-size:15px; font-weight:600; }
  .card-copy p { margin:0; color:var(--muted); font-size:12px; }
  .footnote { margin:22px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }
  @keyframes float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-3px) } }
  @keyframes notify { from { transform:scale(1) } to { transform:scale(1.035) } }
  @keyframes spin { from { transform:rotate(0) } to { transform:rotate(360deg) } }
  @keyframes bounce { 0%,100% { transform:translateY(0) } 35% { transform:translateY(-8px) } 65% { transform:translateY(1px) } }
  @media (max-width:900px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:560px) { main { padding:28px 18px 42px; } header { align-items:start; flex-direction:column; } .status { width:100%; } .grid { grid-template-columns:1fr; } }
  @media (prefers-reduced-motion:reduce) { .avatar-card[data-state="working"] .artwork,.avatar-card[data-state="working"] .group-artwork,.avatar-card[data-state="searching"] .artwork,.avatar-card[data-state="notifying"] .artwork,.avatar-card.is-spin .artwork,.avatar-card.is-bounce .artwork { animation:none; } .artwork .grok-bot-mark__eye,.group-artwork .grok-bot-mark__eye { transition:none; } }
</style>
</head>
<body>
<main id="surface">
  <header>
    <div><h1>x.ai Live Avatar Extraction</h1><p>Exact SVG geometry captured from the live Agent sidebar at x.ai/bot</p></div>
    <div class="status" id="status"><strong>Pointer tracking: ready</strong><span>Move across the avatars</span></div>
  </header>
  <div class="toolbar" aria-label="Avatar state controls">
    <button type="button" data-action="notify">Trigger notifying</button>
    <button type="button" data-action="bounce">Bounce selected</button>
    <button type="button" data-action="spin">Spin selected</button>
    <button type="button" data-action="reset">Reset transforms</button>
  </div>
  <section class="grid">${cards}</section>
  <p class="footnote">This preview keeps the captured SVG viewBox and paths intact. Each avatar instance runs an independent x.ai-style state cycle; pointer movement updates only its original eye transforms. The red badge on Inbox Manager is part of its captured notifying state.</p>
</main>
<script>
  const surface = document.getElementById('surface');
  const status = document.getElementById('status');
  const cards = [...surface.querySelectorAll('.avatar-card')];
  const translatePattern = /^translate\\(([-.0-9]+)\\s+([-.0-9]+)\\)/;
  const scalePattern = /scale\\(([-.0-9]+)(?:\\s+([-.0-9]+))?\\)/;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const profiles = {
    idle: { expressions:[0,8], expressionMs:[9000,16000], pauseMs:[6000,14000], blinkMs:[2600,6000], drift:0.4 },
    working: { expressions:[7,16,11,10], expressionMs:[1800,3200], pauseMs:[2800,5500], blinkMs:[1700,3600], drift:0.8 },
    searching: { expressions:[15,9,3,20,12,18], expressionMs:[1000,1800], pauseMs:[1600,4000], blinkMs:[1100,2500], drift:1 },
    notifying: { expressions:[3,21,0], expressionMs:[1500,2600], pauseMs:[2000,4000], blinkMs:[1200,2600], drift:1.25 },
    sleeping: { expressions:[13,22,4], expressionMs:[6000,10000], pauseMs:[8000,14000], blinkMs:[7000,12000], drift:0.15 }
  };
  const poses = {
    0: { x:0, y:0, scale:1, openness:1 },
    3: { x:1.4, y:-1.4, scale:1.04, openness:1 },
    4: { x:0, y:1.4, scale:.94, openness:.92 },
    7: { x:-1.3, y:.6, scale:1.02, openness:1 },
    8: { x:0, y:.8, scale:1.02, openness:1 },
    9: { x:1.2, y:-.2, scale:1.03, openness:1 },
    10: { x:-.8, y:-.8, scale:1.01, openness:1 },
    11: { x:0, y:-1.1, scale:1.05, openness:1 },
    12: { x:-1.2, y:-.6, scale:.98, openness:1 },
    13: { x:0, y:1.2, scale:.9, openness:.78 },
    15: { x:1.4, y:-.7, scale:1.03, openness:1 },
    16: { x:-1.4, y:.4, scale:1.02, openness:1 },
    17: { x:.4, y:-1.2, scale:1.04, openness:1 },
    18: { x:-.9, y:-1.1, scale:1.01, openness:1 },
    20: { x:1.1, y:.8, scale:1.03, openness:1 },
    21: { x:1.6, y:-1.5, scale:1.06, openness:1 },
    22: { x:0, y:1.5, scale:.88, openness:.72 }
  };
  let pointer = { x: 0, y: 0, active: false };
  let currentPointer = { x: 0, y: 0 };
  let raf = 0;

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function randomBetween([min, max]) { return min + Math.random() * (max - min); }
  function ease(value) { return value * value * (3 - 2 * value); }
  function clonePose(pose) { return { x:pose.x, y:pose.y, scale:pose.scale, openness:pose.openness }; }
  function blendPose(from, to, amount) {
    const t = ease(clamp(amount, 0, 1));
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      scale: from.scale + (to.scale - from.scale) * t,
      openness: from.openness + (to.openness - from.openness) * t
    };
  }
  function blinkAmount(unit, now) {
    if (now < unit.blinkStart || now >= unit.blinkEnd) return 1;
    const progress = (now - unit.blinkStart) / (unit.blinkEnd - unit.blinkStart);
    const fold = progress < .45 ? progress / .45 : (1 - progress) / .55;
    return 1 - ease(clamp(fold, 0, 1)) * .92;
  }
  function updateEye(eye, base, dx, dy, pose, blinkScale, eyeIndex) {
    const translate = base.match(translatePattern);
    const scale = base.match(scalePattern);
    if (translate) {
      const sideOffset = eyeIndex === 0 ? pose.x : -pose.x;
      const x = Number(translate[1]) + dx + sideOffset;
      const y = Number(translate[2]) + dy + pose.y;
      let next = base.replace(translatePattern, 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
      if (scale) {
        const xScale = Number(scale[1]) * pose.scale;
        const yScale = Number(scale[2] || 1) * pose.scale * pose.openness * blinkScale;
        next = next.replace(scalePattern, 'scale(' + xScale.toFixed(4) + ' ' + yScale.toFixed(4) + ')');
      }
      eye.setAttribute('transform', next);
      return;
    }
    eye.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) scale(' + pose.scale.toFixed(3) + ') scaleY(' + (pose.openness * blinkScale).toFixed(3) + ')';
  }
  function markEvent(unit, eventName) {
    unit.card.dataset.lastEvent = eventName;
    unit.card.dataset.eventCount = String(Number(unit.card.dataset.eventCount || 0) + 1);
    if (eventName === 'blink' || eventName === 'manual-notify') unit.card.dataset.blinkCount = String(Number(unit.card.dataset.blinkCount || 0) + 1);
    if (eventName === 'expression') unit.card.dataset.expressionCount = String(Number(unit.card.dataset.expressionCount || 0) + 1);
  }
  function createUnit(card, svg, unitIndex) {
    const state = card.dataset.state;
    const profile = profiles[state] || profiles.idle;
    const unit = {
      card,
      svg,
      eyes: [...svg.querySelectorAll('.grok-bot-mark__eye')],
      bases: [...svg.querySelectorAll('.grok-bot-mark__eye')].map((eye) => eye.getAttribute('transform') || ''),
      state,
      profile,
      unitIndex,
      expressionIndex: profile.expressions[unitIndex % profile.expressions.length],
      nextExpressionAt: performance.now() + randomBetween(profile.expressionMs),
      nextBlinkAt: performance.now() + randomBetween(profile.blinkMs),
      blinkStart: 0,
      blinkEnd: 0,
      manualUntil: 0,
      poseFrom: clonePose(poses[profile.expressions[unitIndex % profile.expressions.length]] || poses[0]),
      poseTo: clonePose(poses[profile.expressions[unitIndex % profile.expressions.length]] || poses[0]),
      poseStart: performance.now(),
      poseDuration: 1,
      gazeX: 0,
      gazeY: 0,
      phase: Math.random() * Math.PI * 2
    };
    return unit;
  }
  const units = cards.flatMap((card) => [...card.querySelectorAll('svg')].map((svg, index) => createUnit(card, svg, index)));
  function updateUnit(unit, now) {
    const profile = unit.profile;
    if (now >= unit.nextExpressionAt) {
      const currentPose = getPose(unit, now);
      unit.expressionIndex = profile.expressions[Math.floor(Math.random() * profile.expressions.length)];
      unit.poseFrom = currentPose;
      unit.poseTo = clonePose(poses[unit.expressionIndex] || poses[0]);
      unit.poseStart = now;
      unit.poseDuration = Math.min(620, randomBetween(profile.expressionMs) * .28);
      unit.nextExpressionAt = now + randomBetween(profile.expressionMs) + randomBetween(profile.pauseMs);
      markEvent(unit, 'expression');
    }
    if (!reducedMotion && now >= unit.nextBlinkAt) {
      unit.blinkStart = now;
      unit.blinkEnd = now + (unit.state === 'notifying' ? 180 : 140);
      unit.nextBlinkAt = now + randomBetween(profile.blinkMs);
      markEvent(unit, 'blink');
    }
    const pose = getPose(unit, now);
    const rect = unit.svg.getBoundingClientRect();
    const targetX = pointer.active ? pointer.x : rect.left + rect.width / 2;
    const targetY = pointer.active ? pointer.y : rect.top + rect.height / 2;
    const targetLocalX = clamp((targetX - (rect.left + rect.width / 2)) / 180, -1, 1) * (5 + profile.drift);
    const targetLocalY = clamp((targetY - (rect.top + rect.height / 2)) / 180, -1, 1) * (4 + profile.drift);
    const gazeEase = profile.drift > 1 ? .2 : .14;
    unit.gazeX += (targetLocalX - unit.gazeX) * gazeEase;
    unit.gazeY += (targetLocalY - unit.gazeY) * gazeEase;
    const blinkScale = Math.min(blinkAmount(unit, now), now < unit.manualUntil ? .08 : 1);
    const microDriftX = reducedMotion ? 0 : Math.sin(now / 1100 + unit.phase) * profile.drift * .18;
    const microDriftY = reducedMotion ? 0 : Math.cos(now / 1400 + unit.phase) * profile.drift * .12;
    unit.eyes.forEach((eye, eyeIndex) => updateEye(eye, unit.bases[eyeIndex], unit.gazeX + microDriftX, unit.gazeY + microDriftY, pose, blinkScale, eyeIndex));
  }
  function getPose(unit, now) {
    const amount = (now - unit.poseStart) / unit.poseDuration;
    return blendPose(unit.poseFrom, unit.poseTo, amount);
  }
  function render() {
    raf = 0;
    const now = performance.now();
    units.forEach((unit) => updateUnit(unit, now));
    if (!reducedMotion || pointer.active || units.some((unit) => now < unit.blinkEnd || now < unit.manualUntil || now < unit.poseStart + unit.poseDuration)) raf = requestAnimationFrame(render);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }
  function trigger(action) {
    const selected = units.find((unit) => unit.card.dataset.state === 'notifying') || units[0];
    if (action === 'notify') {
      selected.manualUntil = performance.now() + 220;
      selected.blinkStart = performance.now();
      selected.blinkEnd = selected.manualUntil;
      markEvent(selected, 'manual-notify');
      schedule();
      return;
    }
    if (action === 'reset') {
      units.forEach((unit) => unit.eyes.forEach((eye, index) => { eye.setAttribute('transform', unit.bases[index]); eye.style.transform = ''; }));
      pointer = { x: 0, y: 0, active: false }; units.forEach((unit) => { unit.gazeX = 0; unit.gazeY = 0; }); return;
    }
    const className = action === 'spin' ? 'is-spin' : 'is-bounce';
    selected.card.classList.remove(className); void selected.card.offsetWidth; selected.card.classList.add(className);
  }
  surface.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY, active: true };
    status.innerHTML = '<strong>Pointer tracking: active</strong><span>Eyes are following the cursor</span>';
    schedule();
  });
  surface.addEventListener('pointerleave', () => {
    pointer = { x: 0, y: 0, active: false };
    status.innerHTML = '<strong>Pointer tracking: ready</strong><span>Move across the avatars</span>';
    schedule();
  });
  surface.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => trigger(button.dataset.action)));
  schedule();
</script>
</body>
</html>`;

fs.writeFileSync(output, html);
