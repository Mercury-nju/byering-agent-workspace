import { openPage, el } from "./pages.js";
import { createShareStore } from "../agents/share-store.js";
import { buildMaterialArtifact, materialMime } from "../materials/material-generator.js";
import { createMaterialStore } from "../agents/material-store.js";

export const EAR_FORMATS = Object.freeze([
  Object.freeze({ id: "ppt", label: "PPT", extension: ".pptx", tone: "coral" }),
  Object.freeze({ id: "html", label: "HTML", extension: ".html", tone: "blue" }),
  Object.freeze({ id: "pdf", label: "PDF", extension: ".pdf", tone: "violet" }),
  Object.freeze({ id: "infographic", label: "信息图", extension: ".svg", tone: "green" })
]);

export const EAR_RECORD_STATES = Object.freeze({ ready: "ready", recording: "recording", complete: "complete" });

const RECORDING_STATE_LABELS = Object.freeze({ ready: "准备录音", recording: "录音中", complete: "录音完成" });

export function recordingStateLabel(state) {
  return RECORDING_STATE_LABELS[state] || RECORDING_STATE_LABELS.ready;
}

export function waveformHeightFromLevel(level) {
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  return Math.round(10 + normalized * 40);
}

const CSS = `
.sb-ear{min-height:100%;padding:18px 22px 26px;background:#f4f5f7;color:#20242b;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;box-sizing:border-box}
.sb-ear-shell{width:100%;min-height:100%;display:grid;grid-template-columns:220px minmax(0,1fr) 250px;grid-template-rows:auto minmax(0,1fr) auto;gap:16px;margin:0 auto}
.sb-ear-hero{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:54px;padding:2px 2px 14px;background:transparent;color:#20242b;border-bottom:1px solid #dfe2e6;box-sizing:border-box}
.sb-ear-kicker{margin:0 0 4px;color:#8b929d;font-size:10px;letter-spacing:.14em;text-transform:uppercase}
.sb-ear-title{margin:0;font-size:21px;line-height:27px;font-weight:680;letter-spacing:-.01em}
.sb-ear-subtitle{margin:3px 0 0;max-width:620px;color:#7e8691;font-size:12px;line-height:18px}
.sb-ear-record{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:9px;width:188px;height:52px;flex:none;margin:16px auto 0;border:0;border-radius:26px;background:#181b20;color:#fff;font:inherit;font-size:14px;font-weight:680;cursor:pointer;box-shadow:0 10px 22px rgba(24,27,32,.18);transition:transform 180ms ease,background 180ms ease,box-shadow 220ms ease}
.sb-ear-record:hover{background:#2d333b;transform:translateY(-2px);box-shadow:0 13px 26px rgba(24,27,32,.22)}
.sb-ear-record:focus-visible{outline:3px solid rgba(89,134,216,.34);outline-offset:3px}
.sb-ear-record[data-recording="true"]{background:#f06b5d;color:#fff;box-shadow:0 0 0 7px rgba(240,107,93,.12),0 0 0 14px rgba(240,107,93,.06);animation:sb-ear-record-pulse 1.55s ease-in-out infinite}
.sb-ear-record-glyph{position:relative;width:10px;height:14px;border:2px solid currentColor;border-radius:7px;box-sizing:border-box}
.sb-ear-record-glyph::before{content:"";position:absolute;left:50%;bottom:-6px;width:7px;height:5px;border:1.5px solid currentColor;border-top:0;border-radius:0 0 6px 6px;transform:translateX(-50%)}
.sb-ear-record-glyph::after{content:"";position:absolute;left:50%;bottom:-9px;width:2px;height:3px;background:currentColor;transform:translateX(-50%)}
@keyframes sb-ear-record-pulse{0%,100%{box-shadow:0 0 0 7px rgba(240,107,93,.12),0 0 0 14px rgba(240,107,93,.06)}50%{box-shadow:0 0 0 10px rgba(240,107,93,.16),0 0 0 20px rgba(240,107,93,.04)}}
.sb-ear-source{grid-column:1;grid-row:2 / 4;display:flex;flex-direction:column;min-height:0;background:#fff;border:1px solid #e0e3e7;border-radius:16px;padding:18px;box-sizing:border-box}
.sb-ear-source-title,.sb-ear-studio-title{margin:0;color:#20242b;font-size:15px;font-weight:680;line-height:22px}
.sb-ear-source-add{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:72px;margin-top:17px;border:1px dashed #cdd3dc;border-radius:12px;background:#fafbfc;color:#303641;font:inherit;font-size:12px;font-weight:650;cursor:pointer;transition:background 160ms ease,border-color 160ms ease,transform 160ms ease}
.sb-ear-source-add:hover{background:#f2f5f9;border-color:#9ca8b8;transform:translateY(-1px)}
.sb-ear-source-empty{display:flex;flex:1;align-items:center;justify-content:center;padding:20px 4px;color:#9198a7;font-size:12px;line-height:1.7;text-align:center}
.sb-ear-source-list{display:grid;gap:8px;margin-top:12px}.sb-ear-source-item{display:flex;align-items:center;gap:8px;padding:10px 9px;border-radius:9px;background:#f5f6f8;color:#596170;font-size:11px;line-height:16px}.sb-ear-source-item i{width:22px;height:22px;display:grid;place-items:center;border-radius:6px;background:#e8ebf0;color:#58616d;font-style:normal;font-size:12px}
.sb-ear-panel{display:contents}
.sb-ear-card{min-width:0;background:#fff;border:1px solid #e0e3e7;border-radius:16px;padding:20px;box-shadow:0 6px 18px rgba(23,25,29,.025);box-sizing:border-box}
.sb-ear-studio-note{margin:5px 0 18px;color:#9198a7;font-size:11px;line-height:17px}
.sb-ear-panel > .sb-ear-card:first-child{grid-column:2;grid-row:2 / 4;display:flex;flex-direction:column;min-height:0}
.sb-ear-panel > .sb-ear-card:nth-child(2){grid-column:3;grid-row:2;overflow:auto}
.sb-ear-card-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
.sb-ear-card-title{margin:0;font-size:15px;font-weight:650}
.sb-ear-status{display:inline-flex;align-items:center;gap:7px;color:#8b929d;font-size:12px}
.sb-ear-status-dot{width:7px;height:7px;border-radius:50%;background:#aeb5bf}.sb-ear-status[data-state="recording"]{color:#c34e43}.sb-ear-status[data-state="recording"] .sb-ear-status-dot{background:#f06b5d;box-shadow:0 0 0 4px rgba(240,107,93,.13);animation:sb-ear-status-ping 1.2s ease-in-out infinite}.sb-ear-status[data-state="complete"]{color:#2c8550}.sb-ear-status[data-state="complete"] .sb-ear-status-dot{background:#43ae6a}
@keyframes sb-ear-status-ping{0%,100%{transform:scale(1);opacity:.72}50%{transform:scale(1.35);opacity:1}}
.sb-ear-meter{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;flex:1;min-height:320px;padding:28px;border:0;background:#20242a;border-radius:13px;overflow:hidden;transition:background 220ms ease,box-shadow 220ms ease}
.sb-ear-meter::before{content:"";position:absolute;inset:18px;border:1px solid rgba(255,255,255,.08);border-radius:9px;pointer-events:none}
.sb-ear-meter[data-state="recording"]{background:#26292e;box-shadow:inset 0 0 0 1px rgba(240,107,93,.2)}
.sb-ear-meter[data-state="complete"]{background:#25372d;box-shadow:inset 0 0 0 1px rgba(67,174,106,.24)}
.sb-ear-time{width:auto;font-variant-numeric:tabular-nums;font-size:42px;line-height:46px;font-weight:500;letter-spacing:.02em;color:#fff}
.sb-ear-wave{width:min(620px,100%);height:72px;display:flex;align-items:center;justify-content:center;gap:5px}.sb-ear-wave i{display:block;width:5px;height:var(--wave-height,18px);border-radius:3px;background:#66707d;transform-origin:center;transition:height 120ms ease,background 180ms ease,opacity 180ms ease}.sb-ear-wave i:nth-child(3n){--wave-height:46px}.sb-ear-wave i:nth-child(4n){--wave-height:34px}.sb-ear-wave[data-live="true"] i{background:#ff806d}.sb-ear-wave[data-live="true"][data-source="demo"] i{animation:sb-ear-wave 720ms ease-in-out infinite alternate}.sb-ear-wave[data-live="true"][data-source="demo"] i:nth-child(2n){animation-delay:120ms}.sb-ear-wave[data-live="true"][data-source="demo"] i:nth-child(3n){animation-delay:240ms}@keyframes sb-ear-wave{from{transform:scaleY(.45);opacity:.62}to{transform:scaleY(1.12);opacity:1}}
.sb-ear-meter .sb-ear-wave,.sb-ear-meter .sb-ear-time{position:relative;z-index:1}
.sb-ear-note{margin:14px 0 0;color:#8b929d;font-size:11px;line-height:1.6}
.sb-ear-label{display:block;margin:0 0 8px;color:#68707c;font-size:12px;font-weight:600}
.sb-ear-input{box-sizing:border-box;width:100%;height:42px;border:1px solid #dfe3e8;border-radius:8px;padding:0 12px;color:#20242b;background:#fff;font:inherit;font-size:13px;outline:none}.sb-ear-input:focus{border-color:#5986d8;box-shadow:0 0 0 3px rgba(89,134,216,.12)}
.sb-ear-formats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:18px}.sb-ear-format{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;border:1px solid #e2e5e9;border-radius:8px;padding:0 11px;background:#fff;color:#4c535d;font:inherit;font-size:12px;cursor:pointer;transition:background 160ms ease,border-color 160ms ease,transform 160ms ease}.sb-ear-format:hover{border-color:#aeb7c4;transform:translateY(-1px)}.sb-ear-format[aria-pressed="true"]{border-color:#20242b;background:#20242b;color:#fff}.sb-ear-format small{opacity:.66;font-size:10px}
.sb-ear-generate{width:100%;height:44px;margin-top:20px;border:0;border-radius:8px;background:#17191d;color:#fff;font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:background 160ms ease,transform 160ms ease}.sb-ear-generate:not(:disabled):hover{background:#30343a;transform:translateY(-1px)}.sb-ear-generate:disabled{background:#e3e5e8;color:#9ca3ad;cursor:not-allowed}
.sb-ear-results{grid-column:3;grid-row:3;margin:0;max-height:210px;overflow:auto}.sb-ear-results[hidden]{display:none}.sb-ear-result{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid #edf0f2}.sb-ear-result:first-child{border-top:0}.sb-ear-file-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:6px;background:#eef1f5;color:#313741;font-size:10px;font-weight:700}.sb-ear-file{min-width:0;flex:1}.sb-ear-file-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}.sb-ear-file-meta{display:block;margin-top:3px;color:#8b929d;font-size:11px}.sb-ear-action{border:1px solid #e1e4e8;border-radius:5px;background:#fff;color:#4e5660;padding:6px 8px;font:inherit;font-size:11px;cursor:pointer}.sb-ear-action:hover{background:#f3f5f7}.sb-ear-action[data-share]{color:#3f6fb8}
.sb-ear-toast{position:fixed;right:26px;bottom:24px;z-index:9100;max-width:320px;padding:10px 14px;border-radius:6px;background:#17191d;color:#fff;box-shadow:0 12px 26px rgba(23,25,29,.18);font-size:12px}.sb-ear-toast[hidden]{display:none}
.sb-ear-preview{position:fixed;inset:82px 34px 34px auto;z-index:9090;width:min(460px,calc(100vw - 68px));overflow:auto;padding:22px;background:#fff;border:1px solid #dfe3e8;border-radius:8px;box-shadow:0 18px 48px rgba(23,25,29,.2)}.sb-ear-preview[hidden]{display:none}.sb-ear-preview h3{margin:0 0 10px;font-size:17px}.sb-ear-preview p{margin:8px 0;color:#626a76;font-size:12px;line-height:1.7}.sb-ear-preview-close{float:right;border:0;background:transparent;color:#8b929d;font-size:18px;cursor:pointer}
@media (max-width:780px){.sb-ear{padding:10px}.sb-ear-shell{display:flex;flex-direction:column;gap:10px}.sb-ear-hero{align-items:flex-start;flex-direction:column;padding:14px}.sb-ear-panel{display:flex;flex-direction:column;gap:10px}.sb-ear-source{min-height:150px;order:1}.sb-ear-panel > .sb-ear-card:first-child{order:2;min-height:430px}.sb-ear-panel > .sb-ear-card:nth-child(2){order:3}.sb-ear-results{order:4;max-height:none}.sb-ear-record{width:100%;margin-top:14px}.sb-ear-preview{inset:76px 16px 16px;width:auto}}
@media (prefers-reduced-motion:reduce){.sb-ear-record,.sb-ear-wave i,.sb-ear-status-dot{transition:none;animation:none!important}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  styleInjected = true;
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function createMaterialDraft({ formatId, title = "未命名访谈物料" } = {}) {
  const format = EAR_FORMATS.find((item) => item.id === formatId) || EAR_FORMATS[0];
  const cleanTitle = String(title || "未命名访谈物料").trim() || "未命名访谈物料";
  const id = `ear-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    formatId: format.id,
    label: format.label,
    extension: format.extension,
    title: cleanTitle,
    fileName: `${cleanTitle}-${format.label}${format.extension}`,
    status: "ready",
    shareable: true,
    createdAt: new Date().toISOString()
  };
}

function buildWave() {
  const wave = el("div", "sb-ear-wave");
  for (let index = 0; index < 28; index += 1) wave.appendChild(el("i"));
  return wave;
}

function decodeBase64Bytes(value) {
  if (!value || typeof globalThis.atob !== "function") return null;
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function openEarPage({ onClose = null, gateway = null, autoStart = false } = {}) {
  ensureStyle();
  let recording = false;
  let state = EAR_RECORD_STATES.ready;
  let elapsed = 0;
  let timer = null;
  let mediaRecorder = null;
  let mediaStream = null;
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let waveFrame = null;
  let audioChunks = [];
  let audioBlob = null;
  let selectedFormats = new Set(EAR_FORMATS.map(({ id }) => id));
  let drafts = [];
  let toastTimer = null;
  const shareStore = createShareStore({ origin: globalThis.location?.origin || "" });
  const materialStore = createMaterialStore();

  const cleanup = () => {
    stopTimer();
    stopWaveAnimation();
    mediaStream?.getTracks?.().forEach((track) => track.stop());
    mediaStream = null;
    if (toastTimer) clearTimeout(toastTimer);
    onClose?.();
  };
  const page = openPage({ title: "倾耳", onClose: cleanup });
  const wrap = el("div", "sb-ear");
  const shell = el("div", "sb-ear-shell");
  const hero = el("section", "sb-ear-hero");
  const heroCopy = el("div");
  heroCopy.append(el("p", "sb-ear-kicker", "EARS / MATERIAL STUDIO"), el("h1", "sb-ear-title", "把一段对话，变成可交付物料"), el("p", "sb-ear-subtitle", "录下客户访谈、销售复盘或团队会议，倾耳会按你的选择整理成 PPT、HTML、PDF 或信息图，并生成可分享的交付链接。"));
  const recordButton = el("button", "sb-ear-record");
  recordButton.type = "button";
  const recordGlyph = el("span", "sb-ear-record-glyph");
  const recordLabel = el("span", null, "开始录音");
  recordButton.append(recordGlyph, recordLabel);
  hero.append(heroCopy);
  shell.appendChild(hero);

  const sourceCard = el("aside", "sb-ear-source");
  sourceCard.append(el("h2", "sb-ear-source-title", "来源"));
  const addSource = el("button", "sb-ear-source-add", "＋ 添加录音或文件");
  addSource.type = "button";
  addSource.addEventListener("click", () => showToast("来源添加将在录音完成后启用"));
  const sourceList = el("div", "sb-ear-source-list");
  sourceList.append(el("div", "sb-ear-source-item", "🎙️ 当前录音"));
  const sourceEmpty = el("div", "sb-ear-source-empty", "录音、文件和网页来源会显示在这里。\n先完成一段录音，再继续整理内容。");
  sourceCard.append(addSource, sourceList, sourceEmpty);
  shell.appendChild(sourceCard);

  const panel = el("div", "sb-ear-panel");
  const recordCard = el("section", "sb-ear-card");
  const recordHead = el("div", "sb-ear-card-head");
  recordHead.append(el("h2", "sb-ear-card-title", "录音工作台"));
  const status = el("span", "sb-ear-status", "准备录音");
  status.setAttribute("aria-live", "polite");
  status.dataset.state = "ready";
  status.prepend(el("i", "sb-ear-status-dot"));
  recordHead.appendChild(status);
  const meter = el("div", "sb-ear-meter");
  meter.dataset.state = EAR_RECORD_STATES.ready;
  meter.setAttribute("aria-label", "录音波形");
  const time = el("strong", "sb-ear-time", formatDuration(0));
  time.setAttribute("aria-live", "off");
  const wave = buildWave();
  wave.dataset.live = "false";
  wave.dataset.source = "demo";
  wave.setAttribute("aria-hidden", "true");
  meter.append(time, wave);
  const note = el("p", "sb-ear-note", "录音内容只在当前工作台内处理。浏览器未授予麦克风权限时，将以演示计时继续体验完整的物料流程。");
  recordCard.append(recordHead, meter, recordButton, note);

  const setupCard = el("section", "sb-ear-card");
  setupCard.append(el("h2", "sb-ear-studio-title", "工作室"), el("p", "sb-ear-studio-note", "录音完成后，选择一种输出形式生成可分享物料。"));
  const titleLabel = el("label", "sb-ear-label", "物料标题");
  const titleInput = el("input", "sb-ear-input");
  titleInput.value = "未命名访谈物料";
  titleInput.placeholder = "例如：客户访谈复盘";
  titleLabel.appendChild(titleInput);
  setupCard.appendChild(titleLabel);
  const formats = el("div", "sb-ear-formats");
  for (const format of EAR_FORMATS) {
    const button = el("button", "sb-ear-format");
    button.type = "button";
    button.dataset.formatId = format.id;
    button.setAttribute("aria-pressed", "true");
    button.append(el("span", null, format.label), el("small", null, format.extension));
    button.addEventListener("click", () => {
      if (selectedFormats.has(format.id)) selectedFormats.delete(format.id);
      else selectedFormats.add(format.id);
      button.setAttribute("aria-pressed", String(selectedFormats.has(format.id)));
      generateButton.disabled = state !== EAR_RECORD_STATES.complete || selectedFormats.size === 0;
    });
    formats.appendChild(button);
  }
  const generateButton = el("button", "sb-ear-generate", "生成物料");
  generateButton.type = "button";
  setupCard.append(el("span", "sb-ear-label", "输出格式"), formats, generateButton);
  panel.append(recordCard, setupCard);
  shell.appendChild(panel);

  const resultsCard = el("section", "sb-ear-card sb-ear-results");
  resultsCard.hidden = true;
  resultsCard.append(el("div", "sb-ear-card-head", "生成结果"));
  shell.appendChild(resultsCard);
  wrap.appendChild(shell);
  page.body.appendChild(wrap);

  const toast = el("div", "sb-ear-toast");
  toast.hidden = true;
  document.body.appendChild(toast);
  const preview = el("aside", "sb-ear-preview");
  preview.hidden = true;
  document.body.appendChild(preview);

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function stopWaveAnimation() {
    if (waveFrame) cancelAnimationFrame(waveFrame);
    waveFrame = null;
    if (audioSource) audioSource.disconnect();
    audioSource = null;
    analyser = null;
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    [...wave.children].forEach((bar) => bar.style.removeProperty("--wave-height"));
    wave.dataset.source = "demo";
  }

  function startWaveAnimation(stream) {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext || !stream) return;
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      audioSource = audioContext.createMediaStreamSource(stream);
      audioSource.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      wave.dataset.source = "microphone";
      const bars = [...wave.children];
      const tick = () => {
        if (!recording || !analyser) return;
        analyser.getByteFrequencyData(data);
        bars.forEach((bar, index) => {
          const sampleIndex = Math.min(data.length - 1, Math.floor(index / bars.length * data.length));
          const level = data[sampleIndex] / 255;
          bar.style.setProperty("--wave-height", `${waveformHeightFromLevel(level)}px`);
        });
        waveFrame = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      stopWaveAnimation();
    }
  }

  function setState(next, label) {
    state = next;
    status.dataset.state = next;
    status.lastChild.textContent = label || recordingStateLabel(next);
    wave.dataset.live = String(next === "recording");
    meter.dataset.state = next;
    time.textContent = formatDuration(elapsed);
    recordButton.dataset.recording = String(next === "recording");
    recordButton.dataset.state = next;
    recordButton.setAttribute("aria-label", next === "recording" ? "停止录音" : next === "complete" ? "重新录音" : "开始录音");
    recordLabel.textContent = next === "recording" ? "停止录音" : next === "complete" ? "重新录音" : "开始录音";
    generateButton.disabled = next !== "complete" || selectedFormats.size === 0;
  }

  setState(EAR_RECORD_STATES.ready, recordingStateLabel(EAR_RECORD_STATES.ready));

  function startTimer() {
    stopTimer();
    const startedAt = Date.now() - elapsed * 1000;
    timer = setInterval(() => {
      elapsed = Math.floor((Date.now() - startedAt) / 1000);
      time.textContent = formatDuration(elapsed);
    }, 250);
  }

  function finishRecording() {
    stopTimer();
    recording = false;
    stopWaveAnimation();
    mediaStream?.getTracks?.().forEach((track) => track.stop());
    mediaStream = null;
    mediaRecorder = null;
    setState("complete", "录音完成");
  }

  async function startRecording() {
    elapsed = 0;
    audioChunks = [];
    audioBlob = null;
    recording = true;
    setState("recording", "录音中");
    startTimer();
    const media = globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia || typeof globalThis.MediaRecorder !== "function") {
      showToast("当前环境无法访问麦克风，已进入演示录音模式");
      return;
    }
    try {
      mediaStream = await media.getUserMedia({ audio: true });
      if (!recording) {
        mediaStream.getTracks?.().forEach((track) => track.stop());
        mediaStream = null;
        return;
      }
      const recorder = new globalThis.MediaRecorder(mediaStream);
      mediaRecorder = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) audioChunks.push(event.data); };
      recorder.onstop = () => { audioBlob = audioChunks.length ? new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" }) : null; };
      recorder.start();
      startWaveAnimation(mediaStream);
    } catch {
      showToast("麦克风权限不可用，已进入演示录音模式");
    }
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    finishRecording();
  }

  recordButton.addEventListener("click", () => {
    if (recording) stopRecording();
    else if (state === "complete") { elapsed = 0; startRecording(); }
    else startRecording();
  });

  function renderResults() {
    resultsCard.replaceChildren(el("div", "sb-ear-card-head", "生成结果"));
    for (const material of drafts) {
      const row = el("div", "sb-ear-result");
      const icon = el("span", "sb-ear-file-icon", material.label);
      const file = el("div", "sb-ear-file");
      const ready = material.status === "ready";
      file.append(el("span", "sb-ear-file-name", material.fileName), el("span", "sb-ear-file-meta", ready ? "已完成 · 可分享" : "等待转换服务 · 暂不可下载"));
      const previewButton = el("button", "sb-ear-action", "预览");
      previewButton.type = "button";
      previewButton.addEventListener("click", () => {
        preview.replaceChildren();
        const close = el("button", "sb-ear-preview-close", "×");
        close.type = "button";
        close.addEventListener("click", () => { preview.hidden = true; });
        preview.append(close, el("h3", null, material.title), el("p", null, `${material.label} · ${formatDuration(elapsed)} 录音 · ${ready ? "真实文件已生成" : "等待转换服务"}`), el("p", null, ready ? "文件内容已生成并可下载；分享链接会按权限和有效期校验。" : "当前格式需要配置 OOXML 转换服务后才能下载或分享。"));
        preview.hidden = false;
      });
      const downloadButton = el("button", "sb-ear-action", "下载");
      downloadButton.type = "button";
      downloadButton.addEventListener("click", () => {
        if (!ready || material.artifact?.body == null) { showToast("PPT 需要先配置 OOXML 转换服务"); return; }
        const blob = new Blob([material.artifact.body], { type: material.artifact.mimeType || materialMime(material.formatId) });
        const url = URL.createObjectURL(blob);
        const anchor = el("a");
        anchor.href = url;
        anchor.download = material.fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      });
      const shareButton = el("button", "sb-ear-action", "分享");
      shareButton.type = "button";
      shareButton.dataset.share = material.id;
      shareButton.addEventListener("click", async () => {
        if (!ready) { showToast("当前格式尚未生成，暂不能分享"); return; }
        const localShare = shareStore.create({ materialId: material.id, title: material.title, permission: "viewer" });
        try {
          await gateway?.action?.("share.create", { materialId: material.id, title: material.title, permission: "viewer" });
        } catch { /* local store is the offline fallback */ }
        const shareUrl = new URL(localShare.url, globalThis.location?.origin || "http://127.0.0.1").href;
        try {
          if (globalThis.navigator?.share) await globalThis.navigator.share({ title: material.title, text: "倾耳生成的交付物料", url: shareUrl });
          else if (globalThis.navigator?.clipboard?.writeText) { await globalThis.navigator.clipboard.writeText(shareUrl); showToast("分享链接已复制"); }
          else showToast(shareUrl);
        } catch { showToast("分享已取消"); }
      });
      row.append(icon, file, previewButton, downloadButton, shareButton);
      resultsCard.appendChild(row);
    }
    resultsCard.hidden = false;
  }

  generateButton.addEventListener("click", async () => {
    if (state !== "complete") { showToast("请先完成一段录音"); return; }
    if (!selectedFormats.size) { showToast("至少选择一种输出格式"); return; }
    generateButton.disabled = true;
    generateButton.textContent = "正在生成…";
    showToast("正在整理录音并生成物料");
    setTimeout(async () => {
      drafts = await Promise.all(EAR_FORMATS.filter(({ id }) => selectedFormats.has(id)).map(async ({ id }) => {
        const material = createMaterialDraft({ formatId: id, title: titleInput.value });
        const transcript = "录音已完成，待接入转写服务后会自动填充逐字稿。";
        let artifact = null;
        if (id === "ppt" && gateway?.action) {
          try {
            const response = await gateway.action("material.generate", { materialId: material.id, formatId: id, title: material.title, duration: elapsed, transcript }, { timeoutMs: 30000 });
            const generated = response?.data;
            const body = decodeBase64Bytes(generated?.bodyBase64);
            if (generated?.ready && body) artifact = { formatId: id, mimeType: generated.mimeType, body, ready: true };
          } catch { /* converter unavailable: keep the explicit blocked state */ }
        }
        artifact ||= buildMaterialArtifact({ formatId: id, title: material.title, duration: elapsed, transcript });
        const next = { ...material, status: artifact.ready ? "ready" : "blocked", artifact, shareable: artifact.ready };
        if (artifact.ready) materialStore.put({ id: material.id, title: material.title, formatId: material.formatId, fileName: material.fileName, mimeType: artifact.mimeType, body: artifact.body });
        return next;
      }));
      renderResults();
      generateButton.textContent = "重新生成物料";
      setState("complete", "录音完成");
      showToast(`已生成 ${drafts.length} 份物料`);
    }, 700);
  });

  if (autoStart) recordButton.click();

  const originalClose = page.close;
  page.close = () => {
    preview.remove();
    toast.remove();
    originalClose();
  };
  page.getState = () => ({ state, elapsed, selectedFormats: [...selectedFormats], drafts, hasAudio: Boolean(audioBlob) });
  return page;
}
