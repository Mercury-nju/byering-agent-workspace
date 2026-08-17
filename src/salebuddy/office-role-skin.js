/** Role-specific office skin contract. Keeps native scene layout as the source of truth. */

export const OFFICE_ROLE_SHEETS = Object.freeze({
  "Browser Agent": "线索猎人",
  "Search Agent": "数据分析",
  "App Agent": "金牌客服",
  "File Agent": "内容营销",
  "Computer Agent": "录音总结",
  "mkt-market-scout": "竞品调研"
});

export const ACTION_STATES = Object.freeze({
  fc_walking_h: "walking_right",
  fc_walking_up: "walking_left",
  fc_talking_on_seat: "seated_review",
  fc_off_chair: "seated_review",
  fc_working: "working",
  fc_high_press: "working",
  fc_screen_playing1: "working",
  fc_screen_playing2: "working",
  fc_screen_playing3: "working",
  fc_screen_working_apk_use: "working",
  fc_screen_working_file_use: "working",
  fc_screen_working_main: "working",
  fc_screen_working_search_or_browser_use: "working",
  fc_screen_working_win_use: "working",
  fc_cheer1_sub: "celebrate",
  fc_cheer2_sub: "celebrate",
  fc_cheer_main: "celebrate",
  fc_salute: "celebrate",
  fc_sleeping: "rest",
  fc_sigh: "rest",
  fc_coffee: "rest",
  fc_drink_coffee: "rest"
});

export function roleSheetForAgent(agentType) {
  return OFFICE_ROLE_SHEETS[String(agentType || "")] || null;
}

export function stateForAction(action) {
  return ACTION_STATES[String(action || "")] || "standby";
}

export function frameUrl(root, role, state) {
  if (!role || !state) return null;
  return `${String(root).replace(/\/$/, "")}/${encodeURIComponent(role)}/${state}.png`;
}

export function roleForCanvasPoint({ x, y, width, height }) {
  const nx = width ? x / width : 0;
  const ny = height ? y / height : 0;
  if (ny < 0.52 && nx > 0.66) return "App Agent";
  if (ny < 0.52 && nx < 0.18) return "Computer Agent";
  if (ny < 0.52 && nx < 0.42) return "Browser Agent";
  if (ny < 0.52) return "main";
  if (nx < 0.66) return "File Agent";
  return "Search Agent";
}

export async function preloadRoleFrames({ root, roles = Object.values(OFFICE_ROLE_SHEETS) } = {}) {
  if (typeof Image === "undefined") return new Map();
  const states = new Set(Object.values(ACTION_STATES).concat("standby"));
  const entries = [];
  for (const role of new Set(roles)) {
    for (const state of states) entries.push([role, state]);
  }
  const loaded = await Promise.all(entries.map(([role, state]) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve([`${role}:${state}`, image]);
    image.onerror = () => resolve([`${role}:${state}`, null]);
    image.src = frameUrl(root, role, state);
  })));
  return new Map(loaded.filter(([, image]) => image));
}

/** Patch only native agent sprite draw calls; furniture and scene geometry remain untouched. */
export async function installOfficeRoleSkin({ root = "/workbench/byering/source/role-frames-v5", debug = false } = {}) {
  if (typeof CanvasRenderingContext2D === "undefined") return () => {};
  const frames = await preloadRoleFrames({ root });
  const original = CanvasRenderingContext2D.prototype.drawImage;
  if (original.__byeringRoleSkin) return original.__byeringRoleSkin;

  function drawImage(image, ...args) {
    const sourceUrl = String(image?.currentSrc || image?.src || "");
    if (debug && typeof window !== "undefined" && (window.__byeringAllDraws ||= []).length < 300) {
      window.__byeringAllDraws.push({ sourceUrl, argCount: args.length, args: args.slice(0, 9), canvas: this.canvas ? { width: this.canvas.width, height: this.canvas.height } : null });
    }
    if (!/\/spritesheet\/agent\/fc_[^/]+\.(?:webp|ktx2)/.test(sourceUrl) || args.length < 8) {
      return original.call(this, image, ...args);
    }
    const [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    const roleType = roleForCanvasPoint({ x: dx + dw / 2, y: dy + dh / 2, width: this.canvas.width, height: this.canvas.height });
    const action = sourceUrl.match(/\/fc_([^./-]+)/)?.[1];
    const state = stateForAction(action ? `fc_${action}` : "fc_standby");
    const role = roleSheetForAgent(roleType);
    const replacement = role && frames.get(`${role}:${state}`);
    if (!replacement) return original.call(this, image, ...args);
    if (debug && typeof window !== "undefined") (window.__byeringRoleSkinDraws ||= []).push({ roleType, role, state, dx, dy, dw, dh });
    return original.call(this, replacement, 0, 0, replacement.naturalWidth, replacement.naturalHeight, dx, dy, dw, dh);
  }

  drawImage.__byeringRoleSkin = () => { CanvasRenderingContext2D.prototype.drawImage = original; };
  CanvasRenderingContext2D.prototype.drawImage = drawImage;
  return drawImage.__byeringRoleSkin;
}

function textureAction(texture) {
  const value = [texture?.label, texture?.source?.label, texture?.source?.resource?.src].filter(Boolean).join("|");
  const match = value.match(/fc_[a-z0-9_]+/i);
  return match?.[0] || null;
}

function nativePoint(sprite) {
  const transform = sprite?.worldTransform;
  return {
    x: Number.isFinite(transform?.tx) ? transform.tx : Number(sprite?.x) || 0,
    y: Number.isFinite(transform?.ty) ? transform.ty : Number(sprite?.y) || 0
  };
}

function roleTypeForSprite(sprite) {
  let node = sprite;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parent) {
    const label = String(node.label || node.name || "").trim().replace(/\s+/g, " ");
    const nativeAgent = label.match(/\b(App|Browser|File|Search|Computer)\s+Agent\b/i)?.[0];
    if (nativeAgent) return nativeAgent.replace(/\s+/g, " ");
    if (OFFICE_ROLE_SHEETS[label]) return label;
  }
  return null;
}

function roleContainerForSprite(sprite, roleType) {
  let node = sprite;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parent) {
    const label = String(node.label || node.name || "").trim().replace(/\s+/g, " ");
    const nativeAgent = label.match(/\b(App|Browser|File|Search|Computer)\s+Agent\b/i)?.[0]?.replace(/\s+/g, " ");
    if (nativeAgent === roleType || label === roleType) return node;
  }
  return null;
}

/** Replace Pixi Sprite textures while preserving native transforms and hit targets. */
export async function installPixiRoleSkin({ workbench, root = "/workbench/byering/source/role-frames-v5", debug = false } = {}) {
  if (!workbench) return () => {};
  const Sprite = workbench.c;
  const AnimatedSprite = workbench.d;
  const Texture = workbench.T;
  if (!Sprite || !Texture) return () => {};
  const images = await preloadRoleFrames({ root });
  const textureCache = new Map();
  const getTexture = (role, state) => {
    const key = `${role}:${state}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const image = images.get(key);
    if (!image || typeof Texture.from !== "function") return null;
    const texture = Texture.from(image);
    texture.label = `byering:${key}`;
    textureCache.set(key, texture);
    return texture;
  };

  const descriptor = Object.getOwnPropertyDescriptor(Sprite.prototype, "texture");
  if (!descriptor?.set || descriptor.set.__byeringRoleSkin) return () => {};
  const nativeSetter = descriptor.set;
  function setTexture(value) {
    nativeSetter.call(this, value);
    if (debug && typeof document !== "undefined") {
      const seen = document.documentElement.getAttribute("data-byering-texture-labels") || "";
      const label = String(value?.label || value?.source?.resource?.src || "");
      if (label && seen.split(";").length < 100 && !seen.split(";").includes(label)) {
        document.documentElement.setAttribute("data-byering-texture-labels", `${seen}${seen ? ";" : ""}${label}`);
      }
    }
    if (this.__byeringRoleSkinApplying || !value) return;
    const point = nativePoint(this);
    const roleType = roleTypeForSprite(this);
    if (!roleType) return;
    if (debug && typeof document !== "undefined") {
      const rows = document.documentElement.getAttribute("data-byering-sprite-points") || "";
      const parent = this.parent || {};
      const world = this.worldTransform || {};
      const row = `${roleType}:${point.x.toFixed(1)},${point.y.toFixed(1)}:world${Number(world.tx || 0).toFixed(1)},${Number(world.ty || 0).toFixed(1)}:${this.label || this.name || this.constructor?.name || "sprite"}:${parent.label || parent.name || parent.constructor?.name || "parent"}`;
      if (!rows.split(";").includes(row) && rows.split(";").length < 80) document.documentElement.setAttribute("data-byering-sprite-points", `${rows}${rows ? ";" : ""}${row}`);
    }
    const role = roleSheetForAgent(roleType);
    if (!role) return;
    const action = textureAction(value);
    if (!action) return;
    const nativeWidth = Number(value.width) || 1;
    const nativeHeight = Number(value.height) || 1;
    const roleContainer = roleContainerForSprite(this, roleType);
    if (roleContainer && nativeWidth >= 300 && nativeHeight >= 250) {
      if (roleContainer.__byeringRoleSpriteClaimed && roleContainer.__byeringRoleSpriteClaimed !== this) return;
      roleContainer.__byeringRoleSpriteClaimed = this;
    }
    const state = stateForAction(action);
    const replacement = getTexture(role, state);
    if (!replacement || replacement === value || this.__byeringRoleSkinKey === `${role}:${state}`) return;
    this.__byeringRoleSkinApplying = true;
    nativeSetter.call(this, replacement);
    this.__byeringRoleSkinKey = `${role}:${state}`;
    this.__byeringRoleSkinApplying = false;
    if (debug && typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-byering-role-swaps") || "";
      document.documentElement.setAttribute("data-byering-role-swaps", `${current}${current ? ";" : ""}${roleType}:${role}:${state}:${nativeWidth}x${nativeHeight}->${replacement.width}x${replacement.height}:s${this.scale.x.toFixed(3)},${this.scale.y.toFixed(3)}`);
    }
  }
  setTexture.__byeringRoleSkin = true;
  Object.defineProperty(Sprite.prototype, "texture", { ...descriptor, set: setTexture });
  if (Sprite.prototype.updateBounds && !Sprite.prototype.updateBounds.__byeringRoleSkin) {
    const nativeUpdateBounds = Sprite.prototype.updateBounds;
    function updateBounds() {
      nativeUpdateBounds.call(this);
      if (this.texture) {
        if (debug && typeof document !== "undefined") {
          const seen = document.documentElement.getAttribute("data-byering-texture-debug") || "";
          if (seen.split(";").length < 40) {
            const texture = this.texture;
            const source = texture.source || texture.baseTexture || {};
            const value = `${texture.label || ""}|${texture.width}x${texture.height}|${source.label || ""}|${source.resource?.src || source.resource?.currentSrc || ""}|a${this.anchor?.x},${this.anchor?.y}|p${this.x},${this.y}|w${this.width},${this.height}`;
            document.documentElement.setAttribute("data-byering-texture-debug", `${seen}${seen ? ";" : ""}${value}`);
          }
        }
        setTexture.call(this, this.texture);
      }
    }
    updateBounds.__byeringRoleSkin = true;
    Sprite.prototype.updateBounds = updateBounds;
  }
  if (AnimatedSprite?.prototype?._updateTexture && !AnimatedSprite.prototype._updateTexture.__byeringRoleSkin) {
    const nativeUpdateTexture = AnimatedSprite.prototype._updateTexture;
    function updateTexture() {
      nativeUpdateTexture.call(this);
      if (this.texture) setTexture.call(this, this.texture);
      if (debug && typeof document !== "undefined") {
        const labels = (this.textures || []).slice(0, 2).map((texture) => texture?.label || texture?.source?.resource?.src || "").join("|");
        const seen = document.documentElement.getAttribute("data-byering-animated-labels") || "";
        if (labels && seen.split(";").length < 100 && !seen.split(";").includes(labels)) document.documentElement.setAttribute("data-byering-animated-labels", `${seen}${seen ? ";" : ""}${labels}`);
      }
    }
    updateTexture.__byeringRoleSkin = true;
    AnimatedSprite.prototype._updateTexture = updateTexture;
  }
  return () => Object.defineProperty(Sprite.prototype, "texture", descriptor);
}
