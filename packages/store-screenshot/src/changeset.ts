import { z } from 'zod';
import type {
  StorePlatform,
  StoreScreenshotColorField,
  StoreScreenshotDocument,
  StoreScreenshotPage,
  StoreScreenshotTemplateId,
} from './schema.js';
import {
  StorePlatformSchema,
  StoreScreenshotDocumentSchema,
  StoreScreenshotPageSchema,
  StoreScreenshotTemplateIdSchema,
} from './schema.js';

export type ChangeOperation =
  | { op: 'setText'; pageId: string; field: 'headline' | 'body'; value: string; platform?: StorePlatform }
  | { op: 'setColor'; pageId: string; field: StoreScreenshotColorField; value: string }
  | { op: 'setTransform'; pageId: string; x: number; y: number; scale: number }
  | { op: 'setAsset'; pageId: string; assetId: string }
  | { op: 'setTemplate'; pageId: string; templateId: StoreScreenshotTemplateId }
  | { op: 'setVisibility'; pageId: string; visible: boolean; platform?: StorePlatform }
  | { op: 'insertPage'; afterPageId?: string; page: StoreScreenshotPage }
  | { op: 'duplicatePage'; pageId: string }
  | { op: 'deletePage'; pageId: string }
  | { op: 'movePage'; pageId: string; toIndex: number }
  | { op: 'setLocks'; pageId: string; fields: StoreScreenshotPage['lockedFields'] };

export interface StoreScreenshotChangeSet {
  baseVersion: number;
  operations: ChangeOperation[];
}

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const FiniteNumberSchema = z.number().finite();
const LockedFieldsSchema = z.array(z.enum(['headline', 'body', 'template', 'screenshot', 'layout']));

export const ChangeOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('setText'),
    pageId: z.string().min(1),
    field: z.enum(['headline', 'body']),
    value: z.string(),
    platform: StorePlatformSchema.optional(),
  }).strict(),
  z.object({
    op: z.literal('setColor'),
    pageId: z.string().min(1),
    field: z.enum(['background', 'accent', 'text']),
    value: HexColorSchema,
  }).strict(),
  z.object({
    op: z.literal('setTransform'),
    pageId: z.string().min(1),
    x: FiniteNumberSchema,
    y: FiniteNumberSchema,
    scale: FiniteNumberSchema,
  }).strict(),
  z.object({
    op: z.literal('setAsset'),
    pageId: z.string().min(1),
    assetId: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('setTemplate'),
    pageId: z.string().min(1),
    templateId: StoreScreenshotTemplateIdSchema,
  }).strict(),
  z.object({
    op: z.literal('setVisibility'),
    pageId: z.string().min(1),
    visible: z.boolean(),
    platform: StorePlatformSchema.optional(),
  }).strict(),
  z.object({
    op: z.literal('insertPage'),
    afterPageId: z.string().min(1).optional(),
    page: StoreScreenshotPageSchema.strict(),
  }).strict(),
  z.object({
    op: z.literal('duplicatePage'),
    pageId: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('deletePage'),
    pageId: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('movePage'),
    pageId: z.string().min(1),
    toIndex: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    op: z.literal('setLocks'),
    pageId: z.string().min(1),
    fields: LockedFieldsSchema,
  }).strict(),
]);

export const StoreScreenshotChangeSetSchema = z.object({
  baseVersion: z.number().int().positive(),
  operations: z.array(ChangeOperationSchema),
}).strict();

export function applyChangeSet(
  document: StoreScreenshotDocument,
  changeSet: StoreScreenshotChangeSet,
): StoreScreenshotDocument {
  if (changeSet.baseVersion !== document.version) {
    throw new Error('VERSION_CONFLICT');
  }

  const parsedChangeSet = StoreScreenshotChangeSetSchema.safeParse(changeSet);
  if (!parsedChangeSet.success) {
    throw new Error('INVALID_CHANGESET');
  }

  const startingLocks = new Map(document.pages.map((page) => [page.id, new Set(page.lockedFields)]));
  let pages = [...document.pages]
    .sort((left, right) => left.order - right.order)
    .map((page) => clonePage(page));
  for (const operation of parsedChangeSet.data.operations as ChangeOperation[]) {
    pages = applyOperation(document, pages, operation, startingLocks);
  }

  const candidate: StoreScreenshotDocument = {
    ...document,
    version: document.version + 1,
    pages: normalizePageOrder(pages),
  };
  if (!StoreScreenshotDocumentSchema.safeParse(candidate).success) {
    throw new Error('INVALID_DOCUMENT');
  }
  return candidate;
}

function applyOperation(
  document: StoreScreenshotDocument,
  pages: StoreScreenshotPage[],
  operation: ChangeOperation,
  startingLocks: Map<string, Set<StoreScreenshotPage['lockedFields'][number]>>,
): StoreScreenshotPage[] {
  switch (operation.op) {
    case 'setText':
      return updatePage(pages, operation.pageId, (page) => {
        if (isLocked(startingLocks, page.id, operation.field)) return page;
        if (operation.platform === undefined) return { ...page, [operation.field]: operation.value };
        return {
          ...page,
          overrides: {
            ...page.overrides,
            [operation.platform]: { ...page.overrides[operation.platform], [operation.field]: operation.value },
          },
        };
      });
    case 'setColor':
      return updatePage(pages, operation.pageId, (page) => isLocked(startingLocks, page.id, 'layout')
        ? page
        : { ...page, colors: { ...page.colors, [operation.field]: operation.value } });
    case 'setTransform':
      return updatePage(pages, operation.pageId, (page) => isLocked(startingLocks, page.id, 'layout')
        ? page
        : { ...page, transform: { x: operation.x, y: operation.y, scale: operation.scale } });
    case 'setAsset':
      if (!document.assets.some((asset) => asset.id === operation.assetId)) {
        throw new Error(`ASSET_NOT_FOUND:${operation.assetId}`);
      }
      return updatePage(pages, operation.pageId, (page) => isLocked(startingLocks, page.id, 'screenshot')
        ? page
        : { ...page, screenshotAssetId: operation.assetId });
    case 'setTemplate':
      return updatePage(pages, operation.pageId, (page) => (
        isLocked(startingLocks, page.id, 'template')
        || isLocked(startingLocks, page.id, 'layout')
      )
        ? page
        : { ...page, templateId: operation.templateId });
    case 'setVisibility':
      return updatePage(pages, operation.pageId, (page) => {
        if (isLocked(startingLocks, page.id, 'layout')) return page;
        if (operation.platform === undefined) return { ...page, hidden: !operation.visible };
        return {
          ...page,
          overrides: {
            ...page.overrides,
            [operation.platform]: { ...page.overrides[operation.platform], hidden: !operation.visible },
          },
        };
      });
    case 'insertPage': {
      if (pages.some((page) => page.id === operation.page.id)) throw new Error(`PAGE_EXISTS:${operation.page.id}`);
      const index = operation.afterPageId === undefined ? pages.length : findPageIndex(pages, operation.afterPageId) + 1;
      return [...pages.slice(0, index), clonePage(operation.page), ...pages.slice(index)];
    }
    case 'duplicatePage': {
      const index = findPageIndex(pages, operation.pageId);
      const page = pages[index];
      if (page === undefined) throw new Error(`PAGE_NOT_FOUND:${operation.pageId}`);
      const id = nextCopyId(pages, page.id);
      return [...pages.slice(0, index + 1), { ...clonePage(page), id }, ...pages.slice(index + 1)];
    }
    case 'deletePage': {
      const index = findPageIndex(pages, operation.pageId);
      if (pages.length === 1) throw new Error('PAGE_COUNT_OUT_OF_RANGE');
      return [...pages.slice(0, index), ...pages.slice(index + 1)];
    }
    case 'movePage': {
      const index = findPageIndex(pages, operation.pageId);
      if (!Number.isInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= pages.length) {
        throw new Error(`INVALID_PAGE_INDEX:${operation.toIndex}`);
      }
      const page = pages[index];
      if (page === undefined) throw new Error(`PAGE_NOT_FOUND:${operation.pageId}`);
      const withoutPage = [...pages.slice(0, index), ...pages.slice(index + 1)];
      return [...withoutPage.slice(0, operation.toIndex), page, ...withoutPage.slice(operation.toIndex)];
    }
    case 'setLocks':
      return updatePage(pages, operation.pageId, (page) => ({ ...page, lockedFields: [...operation.fields] }));
    default:
      throw new Error('UNSUPPORTED_OPERATION');
  }
}

function isLocked(
  startingLocks: Map<string, Set<StoreScreenshotPage['lockedFields'][number]>>,
  pageId: string,
  field: StoreScreenshotPage['lockedFields'][number],
): boolean {
  return startingLocks.get(pageId)?.has(field) ?? false;
}

function updatePage(
  pages: StoreScreenshotPage[],
  pageId: string,
  update: (page: StoreScreenshotPage) => StoreScreenshotPage,
): StoreScreenshotPage[] {
  const index = findPageIndex(pages, pageId);
  return pages.map((page, currentIndex) => currentIndex === index ? update(page) : page);
}

function findPageIndex(pages: StoreScreenshotPage[], pageId: string): number {
  const index = pages.findIndex((page) => page.id === pageId);
  if (index === -1) throw new Error(`PAGE_NOT_FOUND:${pageId}`);
  return index;
}

function nextCopyId(pages: StoreScreenshotPage[], pageId: string): string {
  let suffix = 1;
  let candidate = `${pageId}-copy`;
  while (pages.some((page) => page.id === candidate)) {
    suffix += 1;
    candidate = `${pageId}-copy-${suffix}`;
  }
  return candidate;
}

function normalizePageOrder(pages: StoreScreenshotPage[]): StoreScreenshotPage[] {
  return pages.map((page, order) => ({ ...page, order }));
}

function clonePage(page: StoreScreenshotPage): StoreScreenshotPage {
  return {
    ...page,
    ...(page.colors === undefined ? {} : { colors: { ...page.colors } }),
    ...(page.transform === undefined ? {} : { transform: { ...page.transform } }),
    overrides: Object.fromEntries(
      Object.entries(page.overrides).map(([platform, override]) => [platform, { ...override }]),
    ),
    lockedFields: [...page.lockedFields],
  };
}
