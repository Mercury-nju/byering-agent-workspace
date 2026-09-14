/** Compatibility helpers for the recovered native office scene. */

// Only these office roles have a workstation monitor and a cloud-computer
// scene. Coordination and desk-free roles must not enter the live roster.
export const CLOUD_COMPUTER_AGENT_TYPES = Object.freeze([
  "App Agent",
  "Browser Agent",
  "Computer Agent",
  "File Agent",
  "Search Agent"
]);

const LEGACY_OFFICE_ROLE_LABELS = new Set([
  "Marvis",
  "App Agent",
  "Browser Agent",
  "Computer Agent",
  "File Agent",
  "Search Agent"
]);

export function isLegacyOfficeRoleLabel(value) {
  return LEGACY_OFFICE_ROLE_LABELS.has(String(value || "").trim());
}

function textureIdentity(texture) {
  return [
    texture?.label,
    texture?.source?.label,
    texture?.source?.resource?.src,
    texture?.source?.resource?.currentSrc
  ].filter(Boolean).join("|");
}

export function isLegacyOfficeNameTexture(texture) {
  const identity = textureIdentity(texture);
  return [...LEGACY_OFFICE_ROLE_LABELS].some((label) => identity.includes(`name_${label}.png`));
}

/** Prevent retired native role names from being baked into Pixi textures. */
export function installPixiLegacyRoleLabelFilter({ workbench, debug = false } = {}) {
  const textTypes = [workbench?.g, workbench?.b, workbench?.s].filter(Boolean);
  const patchedBases = new Set();
  const restores = [];
  for (const Text of textTypes) {
    let textBase = Text?.prototype || null;
    while (textBase && !Object.getOwnPropertyDescriptor(textBase, "text")) textBase = Object.getPrototypeOf(textBase);
    if (!textBase || patchedBases.has(textBase)) continue;
    patchedBases.add(textBase);
    const descriptor = Object.getOwnPropertyDescriptor(textBase, "text");
    if (!descriptor?.get || !descriptor?.set) continue;
    if (descriptor.set.__byeringLegacyOfficeRoleFilter) {
      restores.push(descriptor.set.__byeringLegacyOfficeRoleFilter);
      continue;
    }

    const nativeSetter = descriptor.set;
    function setText(value) {
      nativeSetter.call(this, isLegacyOfficeRoleLabel(value) ? "" : value);
    }
    const restore = () => Object.defineProperty(textBase, "text", descriptor);
    setText.__byeringLegacyOfficeRoleFilter = restore;
    Object.defineProperty(textBase, "text", { ...descriptor, set: setText });
    restores.push(restore);
  }

  const Sprite = workbench?.c;
  const Texture = workbench?.T;
  const textureDescriptor = Sprite?.prototype && Object.getOwnPropertyDescriptor(Sprite.prototype, "texture");
  if (textureDescriptor?.set && !textureDescriptor.set.__byeringLegacyOfficeRoleFilter) {
    const nativeTextureSetter = textureDescriptor.set;
    function setTexture(value) {
      if (debug && typeof window !== "undefined") {
        const identity = textureIdentity(value);
        if (identity && (window.__byeringOfficeTextureLabels ||= []).length < 500) {
          window.__byeringOfficeTextureLabels.push(identity);
        }
      }
      nativeTextureSetter.call(this, isLegacyOfficeNameTexture(value) ? Texture.EMPTY : value);
    }
    const restore = () => Object.defineProperty(Sprite.prototype, "texture", textureDescriptor);
    setTexture.__byeringLegacyOfficeRoleFilter = restore;
    Object.defineProperty(Sprite.prototype, "texture", { ...textureDescriptor, set: setTexture });
    restores.push(restore);

    const nativeUpdateBounds = Sprite.prototype.updateBounds;
    if (typeof nativeUpdateBounds === "function" && !nativeUpdateBounds.__byeringLegacyOfficeRoleFilter) {
      function updateBounds(...args) {
        const value = this.texture;
        if (debug && typeof window !== "undefined") {
          const identity = textureIdentity(value);
          if (identity && (window.__byeringOfficeTextureLabels ||= []).length < 500) {
            window.__byeringOfficeTextureLabels.push(identity);
          }
        }
        if (isLegacyOfficeNameTexture(value)) nativeTextureSetter.call(this, Texture.EMPTY);
        return nativeUpdateBounds.apply(this, args);
      }
      const restoreUpdateBounds = () => { Sprite.prototype.updateBounds = nativeUpdateBounds; };
      updateBounds.__byeringLegacyOfficeRoleFilter = restoreUpdateBounds;
      Sprite.prototype.updateBounds = updateBounds;
      restores.push(restoreUpdateBounds);
    }
  }
  return () => restores.forEach((restore) => restore());
}

export function hasCloudComputer(agentType) {
  return CLOUD_COMPUTER_AGENT_TYPES.includes(String(agentType || ""));
}
