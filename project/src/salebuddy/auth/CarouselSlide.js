export function createCarouselSlide({ documentRef, slide, active = false }) {
  const item = documentRef.createElement("figure");
  item.className = `sb-auth-carousel-slide${active ? " is-active" : ""}`;
  item.dataset.slideId = String(slide.id);
  item.setAttribute("aria-hidden", String(!active));

  const image = documentRef.createElement("img");
  image.src = slide.image;
  image.alt = slide.alt;
  image.loading = active ? "eager" : "lazy";
  image.decoding = "async";
  item.appendChild(image);
  return item;
}
