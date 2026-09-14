import { CAPABILITY_SLIDES } from "./slides.js";
import { createCarouselSlide } from "./CarouselSlide.js";

const AUTOPLAY_MS = 4500;

export function createCapabilityCarousel({
  documentRef = globalThis.document,
  eventTarget = globalThis,
  slides = CAPABILITY_SLIDES,
  autoplayMs = AUTOPLAY_MS
} = {}) {
  if (!documentRef?.createElement) throw new Error("CapabilityCarousel requires a document");
  if (!slides.length) throw new Error("CapabilityCarousel requires at least one slide");

  const root = documentRef.createElement("section");
  root.className = "sb-auth-capability-carousel";
  root.setAttribute("aria-label", "Byering 产品能力展示");

  const stage = documentRef.createElement("div");
  stage.className = "sb-auth-carousel-stage";
  const slidesRoot = documentRef.createElement("div");
  slidesRoot.className = "sb-auth-carousel-slides";
  stage.appendChild(slidesRoot);
  root.appendChild(stage);

  const slideElements = slides.map((slide, index) => {
    const item = createCarouselSlide({ documentRef, slide, active: index === 0 });
    slidesRoot.appendChild(item);
    return item;
  });
  let currentIndex = 0;
  let timer = null;
  let paused = documentRef.visibilityState === "hidden";
  const visibilityTarget = documentRef.addEventListener ? documentRef : eventTarget;

  function goTo(nextIndex, userInitiated = false) {
    const index = (nextIndex + slides.length) % slides.length;
    currentIndex = index;
    slideElements.forEach((item, itemIndex) => {
      const active = itemIndex === index;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-hidden", String(!active));
    });
    if (userInitiated) restartTimer();
  }

  function clearTimer() {
    if (timer !== null) eventTarget.clearInterval?.(timer);
    timer = null;
  }

  function restartTimer() {
    clearTimer();
    if (paused || slides.length < 2) return;
    timer = eventTarget.setInterval?.(() => goTo(currentIndex + 1), autoplayMs) || null;
  }

  const onVisibility = () => {
    paused = documentRef.visibilityState === "hidden";
    if (paused) clearTimer();
    else restartTimer();
  };

  visibilityTarget.addEventListener?.("visibilitychange", onVisibility);
  restartTimer();

  return {
    root,
    goTo,
    getCurrentIndex: () => currentIndex,
    destroy() {
      clearTimer();
      visibilityTarget.removeEventListener?.("visibilitychange", onVisibility);
      root.remove();
    }
  };
}
