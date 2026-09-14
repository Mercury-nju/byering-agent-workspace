export function createLoginMethodTabs({ documentRef, active = "phone", onChange }) {
  const root = documentRef.createElement("div");
  root.className = "sb-auth-method-tabs";
  root.setAttribute("role", "tablist");

  const methods = [["phone", "手机号登录"], ["email", "邮箱登录"]];
  const buttons = methods.map(([id, label]) => {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = `sb-auth-method-tab${active === id ? " is-active" : ""}`;
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(active === id));
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      onChange?.(id);
    });
    root.appendChild(button);
    return button;
  });

  return { root, buttons };
}
