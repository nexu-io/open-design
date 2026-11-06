export const gsapRendersTransform = (el: Element) =>
  !!(el as { _gsap?: { renderTransform?: unknown } })._gsap?.renderTransform;
