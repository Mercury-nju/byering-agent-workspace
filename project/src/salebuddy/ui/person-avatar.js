function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isRenderableAvatarSource(value) {
  const source = String(value || "").trim();
  return /^(https?:\/\/|\/\/|\/|data:image\/|blob:)/i.test(source)
    && !/\.hei[cf](?:$|[?#])/i.test(source);
}

function avatarSourceFromValue(value, visited) {
  if (typeof value === "string") return isRenderableAvatarSource(value) ? value.trim() : "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const source = avatarSourceFromValue(item, visited);
      if (source) return source;
    }
    return "";
  }
  if (!isRecord(value) || visited.has(value)) return "";
  visited.add(value);
  const candidates = [
    value.avatarUrl,
    value.avatar_url,
    value.avatar,
    value.avatarThumb,
    value.avatar_thumb,
    value.avatarMedium,
    value.avatar_medium,
    value.avatarLarger,
    value.avatar_larger,
    value.profileImage,
    value.profile_image,
    value.headUrl,
    value.head_url,
    value.url,
    value.uri,
    value.urlList,
    value.url_list,
    value.urls,
    value.user,
    value.account,
    value.profile,
    value.identity,
    value.author,
    value.owner,
    value.sender,
    value.recipient,
    value.target
  ];
  for (const candidate of candidates) {
    const source = avatarSourceFromValue(candidate, visited);
    if (source) return source;
  }
  return "";
}

export function personAvatarUrl(...values) {
  for (const value of values) {
    const source = avatarSourceFromValue(value, new WeakSet());
    if (source) return source;
  }
  return "";
}

export function personAvatarFallback(name = "") {
  return Array.from(String(name || "").trim().replace(/^@+/, ""))[0] || "人";
}

export function mountPersonAvatar(container, person, { name = "", eager = false } = {}) {
  if (!container) return false;
  const label = String(name || person?.name || person?.nickname || person?.accountName || "用户").trim() || "用户";
  const source = personAvatarUrl(person);
  container.textContent = "";
  container.setAttribute("aria-label", `${label}头像`);
  if (!source) {
    container.dataset.avatarFallback = "true";
    container.textContent = personAvatarFallback(label);
    return false;
  }

  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.loading = eager ? "eager" : "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    if (image.parentElement !== container) return;
    image.remove();
    container.dataset.avatarFallback = "true";
    container.textContent = personAvatarFallback(label);
  }, { once: true });
  container.dataset.avatarFallback = "false";
  container.appendChild(image);
  return true;
}
