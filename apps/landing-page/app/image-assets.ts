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
