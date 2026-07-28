import type { StorePlatform } from './schema.js';

export interface StorePlatformSpec {
  size: {
    width: number;
    height: number;
  };
  defaultPageCount: number;
  allowAlpha: boolean;
  pageCount: {
    min: number;
    max: number;
  };
}

export const platformSpecs: Record<StorePlatform, StorePlatformSpec> = {
  appStore: {
    size: { width: 1290, height: 2796 },
    defaultPageCount: 4,
    allowAlpha: false,
    pageCount: { min: 1, max: 10 },
  },
  googlePlay: {
    size: { width: 1080, height: 1920 },
    defaultPageCount: 4,
    allowAlpha: false,
    pageCount: { min: 4, max: 8 },
  },
};

export function assertPlatformPageCount(platform: StorePlatform, pageCount: number): void {
  const { min, max } = platformSpecs[platform].pageCount;
  if (!Number.isInteger(pageCount) || pageCount < min || pageCount > max) {
    throw new Error(`${platform} 截图数量必须为 ${min} 到 ${max}。`);
  }
}
