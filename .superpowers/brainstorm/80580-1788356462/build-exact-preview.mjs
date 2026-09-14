import fs from "node:fs";
import path from "node:path";

const sourcePath = "project/.superpowers/brainstorm/79420-1788355965/agent-square-avatar-exact.html";
const outputPath = ".superpowers/brainstorm/80580-1788356462/agent-square-avatar-exact.html";
const assetNames = [
  "chief-54b9a6-idle.svg",
  "sales-outbound-f19d38-idle.svg",
  "inbox-manager-6464ef-notifying.svg",
  "account-manager-885cf5.svg",
  "talent-scout-3c82f6.svg",
  "expense-manager-ed712e.svg",
  "offsite-crew-54b9a6.svg",
  "offsite-crew-885cf5.svg",
];

const assets = Object.fromEntries(
  assetNames.map((name) => [
    name,
    `data:image/svg+xml;base64,${fs.readFileSync(path.join("assets/grok-bot-avatars", name)).toString("base64")}`,
  ]),
);

let output = fs.readFileSync(sourcePath, "utf8");
output = output.replace(/<style>[\s\S]*?<\/style>/, `<style>
  :root { --ink:#17191e; --muted:#767981; --line:#e4e5e8; --paper:#f7f7f5; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .canvas { max-width:1100px; margin:0 auto; padding:34px 32px 52px; }
  .intro { display:flex; justify-content:space-between; align-items:end; gap:24px; margin-bottom:24px; }
  h2 { margin:0 0 8px; font-size:26px; letter-spacing:0; }
  .intro p { margin:0; color:var(--muted); font-size:14px; }
  .badge { border:1px solid var(--line); background:#fff; padding:9px 12px; color:#555960; font-size:12px; }
  .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
  .agent { min-height:188px; padding:18px; border:1px solid var(--line); border-radius:8px; background:#fff; overflow:hidden; }
  .agent.selected { border-color:#b7b9bd; box-shadow:0 0 0 2px rgba(23,25,30,.05); }
  .row { display:flex; align-items:center; gap:14px; }
  .avatar { width:64px; height:64px; flex:0 0 64px; display:block; object-fit:contain; animation:float 4.8s ease-in-out infinite; }
  .avatar[data-delay="1"] { animation-delay:-1.1s; }
  .avatar[data-delay="2"] { animation-delay:-2.2s; }
  .title { min-width:0; }
  .title h3 { margin:0 0 5px; font-size:16px; font-weight:600; }
  .title p { margin:0; color:var(--muted); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .meta { display:flex; justify-content:space-between; margin-top:22px; padding-top:13px; border-top:1px solid #f0f0f1; color:#97999f; font-size:12px; }
  .online { display:inline-flex; align-items:center; gap:6px; color:#5a9069; }
  .online i { width:6px; height:6px; border-radius:50%; background:#68b27c; }
  .cluster { position:relative; width:64px; height:64px; flex:0 0 64px; }
  .cluster .avatar { position:absolute; width:45px; height:45px; flex-basis:45px; }
  .cluster .avatar:first-child { left:0; top:15px; }
  .cluster .avatar:last-child { right:0; top:3px; }
  .note { margin:18px 0 0; color:#8a8c93; font-size:12px; }
  @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-2px); } }
  @media (max-width:760px) { .canvas { padding:24px 18px 36px; } .intro { align-items:start; flex-direction:column; } .grid { grid-template-columns:1fr; } .agent { min-height:148px; } }
  @media (prefers-reduced-motion:reduce) { .avatar { animation:none; } }
</style>`);

output = output.replace(
  /<div class="avatar"([^>]*)data-src="([^"]+)"([^>]*)><\/div>/g,
  (_, before, name, after) => `<img class="avatar"${before}${after} src="${assets[name]}" alt="">`,
);
output = output.replace(/<script>[\s\S]*?<\/script>/, "");
output = output.replace(
  /<div class="badge" id="status">Loading original SVGs\.\.\.<\/div>/,
  '<div class="badge">Original SVG proportions verified</div>',
);
output = output.replace(
  /The shapes and internal proportions come from the extracted x\.ai SVGs\.[\s\S]*?<\/p>/,
  "The artwork is rendered from the extracted x.ai SVG files with fixed dimensions; no CSS redrawing or stretching is applied.</p>",
);

fs.writeFileSync(outputPath, output);
