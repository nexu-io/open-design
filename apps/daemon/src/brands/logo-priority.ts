// Deterministic logo-file ranking shared by brand extraction fallbacks.
//
// Extension rank is the conservative resolver order. Name rank is only used
// when adopting or mirroring otherwise empty logo slots from existing files.
import path from 'node:path';

export const LOGO_EXT_PRIORITY = Object.freeze(['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico']);

const LOGO_FILE_RE = /\.(svg|png|webp|jpe?g|gif|ico)$/i;
// This intentionally mirrors a few broad "logo-ish" names out of assets/.
// A false positive is preferable to leaving a brand kit logo-less; imagery
// adoption still owns hero/product/gallery files.
const LOGO_ASSET_NAME_RE = /(?:^|[-_.\s])(logo|logotype|wordmark|brandmark|symbol|lockup|mark|favicon)(?:[-_.\s]|$)/i;
const LOGO_NAME_PRIORITY = Object.freeze([
  /(?:^|[-_.\s])(logo|logotype|wordmark|lockup)(?:[-_.\s]|$)/i,
  /(?:^|[-_.\s])(brandmark|symbol|mark)(?:[-_.\s]|$)/i,
  // Existing `logos/` icons can be valid favicon fallbacks, but raw
  // `assets/icon.*` files are too generic to mirror as primary logo candidates.
  /(?:^|[-_.\s])(favicon|icon)(?:[-_.\s]|$)/i,
]);

// Locale-independent tie-breaker so CI runners do not disagree on raw names.
const compareStableName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function logoExtRank(name: string): number {
  const i = LOGO_EXT_PRIORITY.indexOf(path.extname(name).toLowerCase());
  return i === -1 ? LOGO_EXT_PRIORITY.length : i;
}

export function logoNameRank(name: string): number {
  const i = LOGO_NAME_PRIORITY.findIndex((pattern) => pattern.test(name));
  return i === -1 ? LOGO_NAME_PRIORITY.length : i;
}

export function compareLogoFileNames(a: string, b: string): number {
  return logoExtRank(a) - logoExtRank(b) || logoNameRank(a) - logoNameRank(b) || compareStableName(a, b);
}

export function compareLogoFileNamesByExtension(a: string, b: string): number {
  return logoExtRank(a) - logoExtRank(b) || compareStableName(a, b);
}

export function isLogoFileName(name: string): boolean {
  return LOGO_FILE_RE.test(name);
}

export function isLikelyLogoAssetFileName(name: string): boolean {
  return isLogoFileName(name) && LOGO_ASSET_NAME_RE.test(name);
}
