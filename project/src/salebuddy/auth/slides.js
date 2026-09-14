/**
 * CapabilityCarousel data contract.
 * Replace only the image values when the final five Byering artboards arrive.
 */
const asset = (name) => new URL(`./assets/${name}`, import.meta.url).href;

export const CAPABILITY_SLIDES = Object.freeze([
  { id: 1, image: asset("capability-01.png"), alt: "找到更值得联系的人" },
  { id: 2, image: asset("capability-02.png"), alt: "你的数字员工，开始工作" },
  { id: 3, image: asset("capability-03.png"), alt: "更懂每一个潜在客户" },
  { id: 4, image: asset("capability-04.png"), alt: "找到之后，继续完成触达" },
  { id: 5, image: asset("capability-05.png"), alt: "把每一次经营沉淀下来" }
]);
