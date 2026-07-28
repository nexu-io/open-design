import { z } from 'zod';

export type StorePlatform = 'appStore' | 'googlePlay';

export interface StoreScreenshotPosition {
  x: number;
  y: number;
}

export interface StoreScreenshotTransform extends StoreScreenshotPosition {
  scale: number;
}

export type StoreScreenshotColorField = 'background' | 'accent' | 'text';

export interface StoreScreenshotAsset {
  id: string;
  color?: string;
  position?: StoreScreenshotPosition;
  scale?: number;
}

export interface StoreScreenshotProduct {
  name: string;
  summary: string;
  audience: string;
  features: string[];
}

export interface StoreScreenshotPage {
  id: string;
  order: number;
  templateId: 'minimal-center' | 'gradient-device' | 'editorial-split';
  headline: string;
  body?: string;
  screenshotAssetId?: string;
  logoAssetId?: string;
  colors?: Partial<Record<StoreScreenshotColorField, string>>;
  transform?: StoreScreenshotTransform;
  hidden?: boolean;
  overrides: Partial<Record<StorePlatform, {
    headline?: string;
    body?: string;
    hidden?: boolean;
  }>>;
  lockedFields: Array<'headline' | 'body' | 'template' | 'screenshot' | 'layout'>;
}

export interface StoreScreenshotDocument {
  schemaVersion: number;
  id: string;
  projectId: string;
  version: number;
  product: StoreScreenshotProduct;
  designSystemId: string;
  assets: StoreScreenshotAsset[];
  pages: StoreScreenshotPage[];
}

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须为 #RRGGBB。');
const FiniteNumberSchema = z.number().finite('数值必须是有限数。');

export const StorePlatformSchema = z.enum(['appStore', 'googlePlay']);

export const StoreScreenshotPositionSchema = z.object({
  x: FiniteNumberSchema,
  y: FiniteNumberSchema,
});

export const StoreScreenshotTransformSchema = StoreScreenshotPositionSchema.extend({
  scale: FiniteNumberSchema,
});

const StoreScreenshotColorsSchema = z.object({
  background: HexColorSchema.optional(),
  accent: HexColorSchema.optional(),
  text: HexColorSchema.optional(),
});

export const StoreScreenshotAssetSchema = z.object({
  id: z.string().min(1),
  color: HexColorSchema.optional(),
  position: StoreScreenshotPositionSchema.optional(),
  scale: FiniteNumberSchema.optional(),
});

export const StoreScreenshotProductSchema = z.object({
  name: z.string().min(1),
  summary: z.string(),
  audience: z.string(),
  features: z.array(z.string()),
});

const StoreScreenshotOverrideSchema = z.object({
  headline: z.string().optional(),
  body: z.string().optional(),
  hidden: z.boolean().optional(),
});

export const StoreScreenshotPageSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  templateId: z.enum(['minimal-center', 'gradient-device', 'editorial-split']),
  headline: z.string(),
  body: z.string().optional(),
  screenshotAssetId: z.string().min(1).optional(),
  logoAssetId: z.string().min(1).optional(),
  colors: StoreScreenshotColorsSchema.optional(),
  transform: StoreScreenshotTransformSchema.optional(),
  hidden: z.boolean().optional(),
  overrides: z.record(StorePlatformSchema, StoreScreenshotOverrideSchema),
  lockedFields: z.array(z.enum(['headline', 'body', 'template', 'screenshot', 'layout'])),
});

const StoreScreenshotDocumentBaseSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string().min(1),
  projectId: z.string().min(1),
  version: z.number().int().positive(),
  product: StoreScreenshotProductSchema,
  designSystemId: z.string().min(1),
  assets: z.array(StoreScreenshotAssetSchema),
  pages: z.array(StoreScreenshotPageSchema),
});

export const StoreScreenshotDocumentSchema = StoreScreenshotDocumentBaseSchema.superRefine((document, ctx) => {
  if (document.schemaVersion !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '只支持 schemaVersion 1。',
      path: ['schemaVersion'],
    });
  }

  if (document.pages.length < 1 || document.pages.length > 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '规范文档必须包含 1 到 10 个页面。',
      path: ['pages'],
    });
  }

  const pageIds = new Set<string>();
  for (const [index, page] of document.pages.entries()) {
    if (pageIds.has(page.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '页面 id 必须唯一。',
        path: ['pages', index, 'id'],
      });
    }
    pageIds.add(page.id);
  }

  const orders = document.pages.map((page) => page.order).sort((left, right) => left - right);
  if (orders.some((order, index) => order !== index)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '页面 order 必须从 0 开始连续。',
      path: ['pages'],
    });
  }

  const assetIds = new Set(document.assets.map((asset) => asset.id));
  for (const [index, page] of document.pages.entries()) {
    for (const assetField of ['screenshotAssetId', 'logoAssetId'] as const) {
      const assetId = page[assetField];
      if (assetId !== undefined && !assetIds.has(assetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${assetField} 必须引用 assets 中存在的素材。`,
          path: ['pages', index, assetField],
        });
      }
    }
  }
});
