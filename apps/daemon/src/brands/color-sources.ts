/** Rank explicit primary and brand tokens ahead of accents and selectors. */
export function siteBrandColorSourceRank(source: string): number {
  if (/^css-var:--(?:(?:color-)?brand(?:-(?:color|primary))?|color-primary|primary(?:-color)?)(?:\s|$)/i.test(source)) {
    return 2;
  }
  if (
    /^css-var:--(?:color-)?(?:brand-accent|accent(?:-(?:color|primary|accent))?)(?:\s|$)/i.test(source) ||
    /(?:^|\s)selector:\.(?:site-)?brand(?:-(?:color|primary|accent))?(?:[\s,.#>[+~]|$)/i.test(source) ||
    /^prop:background(?:-color)? selector:\.site-header(?:[\s,]|$)/i.test(source)
  ) {
    return 1;
  }
  return 0;
}
