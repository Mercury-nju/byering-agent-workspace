const PAIRS = Object.freeze([
  ['"Marvis(马维斯)"', '"Byering(幕僚长)"'],
  ["马维斯 为你24小时随时在线", "一句话下达，数字员工马上开工"],
  ["Marvis 为你24小时随时在线", "一句话下达，数字员工马上开工"],
  ["SaleBuddy 为你24小时随时在线", "一句话下达，数字员工马上开工"],
  ["Byering 为你24小时随时在线", "一句话下达，数字员工马上开工"],
  ["Hi，我是Marvis", "Hi，我是Byering"],
  ["Marvis，我可以改一下你的人设吗？", "Byering，我可以改一下你的人设吗？"],
  ['children:"设定我的Marvis"', 'children:"设定我的Byering"'],
  ['title:"Marvis人设已重制"', 'title:"Byering人设已重制"'],
  ["你可以重新对Marvis进行设定", "你可以重新对Byering进行设定"],
  ['"Marvis办公室"', '"Byering办公室"'],
  ['"SaleBuddy办公室"', '"Byering办公室"'],
  ['"与Marvis的对话"', '"与Byering的对话"'],
  ['"与SaleBuddy的对话"', '"与Byering的对话"'],
  ['alt:"Marvis"', 'alt:"Byering"'],
  ['alt:"SaleBuddy"', 'alt:"Byering"'],
  ["《Marvis软件许可及服务协议》", "《Byering软件许可及服务协议》"],
  ["《SaleBuddy软件许可及服务协议》", "《Byering软件许可及服务协议》"],
  ["已被限制登录Marvis", "已被限制登录Byering"],
  ["Marvis无法自动修复", "Byering无法自动修复"],
  ["发送指令操作Marvis", "发送指令操作Byering"],
  ["程序坞中Marvis图标", "程序坞中Byering图标"],
  ["添加Marvis插件", "添加Byering插件"],
  ["离开Marvis并访问外部链接", "离开Byering并访问外部链接"],
  ['Dk("Marvis",!0)', 'Dk("Byering",!0)'],
  ['Dk("SaleBuddy",!0)', 'Dk("Byering",!0)'],
  ['name:"Marvis"', 'name:"Byering"'],
  ['name:"SaleBuddy"', 'name:"Byering"'],
  ['authorName:t.author||"Marvis"', 'authorName:t.author||"Byering"'],
  ['authorName:t.author||"SaleBuddy"', 'authorName:t.author||"Byering"']
]);

export function patchRecoveredBrand(filePath, body, warn = () => {}) {
  const name = String(filePath || "");
  if (!name.endsWith("treemap-KZPCXAKY-Dm7XgKSQ.js")) return body;
  let source = Buffer.from(body).toString("utf8");
  for (const [from, to] of PAIRS) {
    if (source.includes(from)) source = source.split(from).join(to);
    else if (/Marvis|SaleBuddy/.test(from)) warn(from);
  }
  return Buffer.from(source);
}

export { PAIRS as BRAND_PATCH_PAIRS };
