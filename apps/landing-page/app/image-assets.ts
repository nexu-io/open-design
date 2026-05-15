const R2_PUBLIC_ORIGIN = 'https://static.open-design.ai';
const IMAGE_RESIZING_ORIGIN = R2_PUBLIC_ORIGIN;
const ASSET_PREFIX = 'landing/assets';

type ImageOptions = {
  width: number;
  quality?: number;
};

export function r2Asset(name: string): string {
  return `${R2_PUBLIC_ORIGIN}/${ASSET_PREFIX}/${name}`;
}

export function imageAsset(name: string, { width, quality = 85 }: ImageOptions): string {
  const options = `width=${width},quality=${quality},format=auto`;
  return `${IMAGE_RESIZING_ORIGIN}/cdn-cgi/image/${options}/${r2Asset(name)}`;
}

export const heroImage = imageAsset('hero.png', { width: 1024, quality: 82 });

/**
 * Default Open Graph card image. Used by every page that doesn't supply
 * its own hero (most blog posts in the v1 layout). 1200 wide is what most
 * social platforms render at; aspect ratio is whatever hero.png ships with
 * — we omit explicit og:image:width/height so platforms can resolve it.
 */
export const ogDefaultImage = imageAsset('hero.png', { width: 1200, quality: 86 });
