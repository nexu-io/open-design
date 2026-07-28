import { platformSpecs } from './platforms.js';
import type { StorePlatform, StoreScreenshotAsset, StoreScreenshotDocument, StoreScreenshotPage } from './schema.js';
import { storeScreenshotTemplates, type StoreScreenshotTemplate } from './templates.js';

export interface DerivedStoreScreenshotPage {
  id: string;
  platform: StorePlatform;
  size: {
    width: number;
    height: number;
  };
  template: StoreScreenshotTemplate;
  headline: string;
  body?: string;
  hidden: boolean;
  colors: StoreScreenshotTemplate['colors'];
  transform: {
    x: number;
    y: number;
    scale: number;
  };
  screenshotAsset?: StoreScreenshotAsset;
}

export function deriveStoreScreenshotPage(
  document: StoreScreenshotDocument,
  pageId: string,
  platform: StorePlatform,
): DerivedStoreScreenshotPage {
  const page = findPage(document.pages, pageId);
  const template = storeScreenshotTemplates[page.templateId];
  const override = page.overrides[platform];
  const body = override?.body ?? page.body;
  const screenshotAsset = page.screenshotAssetId === undefined
    ? undefined
    : document.assets.find((asset) => asset.id === page.screenshotAssetId);

  return {
    id: page.id,
    platform,
    size: platformSpecs[platform].size,
    template,
    headline: override?.headline ?? page.headline,
    ...(body === undefined ? {} : { body }),
    hidden: override?.hidden ?? page.hidden ?? false,
    colors: { ...template.colors, ...page.colors },
    transform: page.transform ?? { x: 0, y: 0, scale: 1 },
    ...(screenshotAsset === undefined ? {} : { screenshotAsset }),
  };
}

function findPage(pages: StoreScreenshotPage[], pageId: string): StoreScreenshotPage {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (page === undefined) {
    throw new Error(`PAGE_NOT_FOUND:${pageId}`);
  }
  return page;
}
