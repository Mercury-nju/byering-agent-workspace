import { createShareStore } from "../agents/share-store.js";
import { createMaterialStore } from "../agents/material-store.js";

const CSS = `body.sb-share-active{background:#f7f8fa!important}.sb-share-shell{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#f7f8fa;color:#20242b;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}.sb-share-card{width:min(720px,calc(100vw - 32px));padding:30px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 16px 40px rgba(23,25,29,.08)}.sb-share-kicker{margin:0 0 8px;color:#8b929d;font-size:11px;letter-spacing:.12em}.sb-share-title{margin:0;font-size:24px}.sb-share-meta{margin:10px 0;color:#68707c;font-size:13px}.sb-share-body{margin-top:22px;max-height:55vh;overflow:auto;padding:16px;border:1px solid #edf0f2;border-radius:6px;background:#fafbfc;white-space:pre-wrap;line-height:1.7;font-size:13px}.sb-share-download{margin-top:18px;padding:9px 13px;border:0;border-radius:6px;background:#17191d;color:#fff;font:inherit;cursor:pointer}.sb-share-error{text-align:center;color:#68707c}`;

export function mountSharePage({ token } = {}) {
  if (!token || typeof document === "undefined") return null;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.classList.add("sb-share-active");
  const shell = document.createElement("main");
  shell.className = "sb-share-shell";
  const card = document.createElement("section");
  card.className = "sb-share-card";
  const share = createShareStore().getByToken(token);
  const material = share && !share.expired ? createMaterialStore().get(share.materialId) : null;
  if (!share || share.expired || !material) {
    card.innerHTML = `<p class="sb-share-error">这个分享链接不存在、已过期，或物料已被移除。</p>`;
  } else {
    const safeTitle = document.createElement("h1");
    safeTitle.className = "sb-share-title";
    safeTitle.textContent = material.title;
    const body = document.createElement("div");
    body.className = "sb-share-body";
    if ((material.formatId === "html" || material.formatId === "infographic") && typeof material.body === "string") body.innerHTML = material.body;
    else body.textContent = typeof material.body === "string" ? material.body : "该格式请下载后查看。";
    const download = document.createElement("button");
    download.className = "sb-share-download";
    download.textContent = `下载 ${material.fileName || "物料"}`;
    download.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([material.body], { type: material.mimeType || "application/octet-stream" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = material.fileName || "material";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    const kicker = document.createElement("p");
    kicker.className = "sb-share-kicker";
    kicker.textContent = `倾耳 · ${String(material.formatId || "material").toUpperCase()} · ${share.permission}`;
    const meta = document.createElement("p");
    meta.className = "sb-share-meta";
    meta.textContent = `分享给你查看 · 有效期至 ${share.expiresAt ? new Date(share.expiresAt).toLocaleString("zh-CN") : "长期有效"}`;
    card.append(kicker, safeTitle, meta, body, download);
  }
  shell.appendChild(card);
  document.body.appendChild(shell);
  return { close() { shell.remove(); style.remove(); document.body.classList.remove("sb-share-active"); } };
}
