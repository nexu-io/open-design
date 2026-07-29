import { FabricImage, IText, Rect, type FabricObject } from 'fabric';
import {
  deriveStoreScreenshotPage,
  placeStoreScreenshotAsset,
  type ChangeOperation,
  type StorePlatform,
  type StoreScreenshotDocument,
  type StoreScreenshotPage,
  type StoreScreenshotTemplate,
} from '@launch-studio/store-screenshot';

export type StoreScreenshotFabricNodeId =
  | 'background'
  | 'headline'
  | 'body'
  | 'product-shot';

interface StoreScreenshotFabricNode {
  id: StoreScreenshotFabricNodeId;
  pageId: string;
  viewportScale: number;
  assetPlacement?: {
    size: { width: number; height: number };
    template: Pick<StoreScreenshotTemplate, 'devicePlacement' | 'screenshotRadius'>;
    assetPosition?: { x: number; y: number };
  };
  textField?: 'headline' | 'body';
}

export type StoreScreenshotFabricObject = FabricObject & {
  data: {
    storeScreenshotNode: StoreScreenshotFabricNode;
  };
};

export async function storeScreenshotPageToFabricObjects(
  document: StoreScreenshotDocument,
  page: StoreScreenshotPage,
  platform: StorePlatform,
  viewportWidth: number,
  assetUrl?: string,
): Promise<StoreScreenshotFabricObject[]> {
  const derived = deriveStoreScreenshotPage(document, page.id, platform);
  const viewportScale = viewportWidth / derived.size.width;
  const viewportHeight = derived.size.height * viewportScale;
  const locked = new Set(page.lockedFields);
  const background = tagged(
    new Rect({
      left: 0,
      top: 0,
      width: viewportWidth,
      height: viewportHeight,
      fill: derived.colors.background,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    }),
    { id: 'background', pageId: page.id, viewportScale },
  );
  const headlineLeft = derived.template.headlineAlign === 'center'
    ? viewportWidth / 2
    : viewportWidth * 0.1;
  const headline = tagged(
    new IText(derived.headline, {
      left: headlineLeft,
      top: viewportHeight * 0.12,
      originX: derived.template.headlineAlign === 'center' ? 'center' : 'left',
      width: viewportWidth * 0.8,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: viewportWidth * (
        derived.template.headlineScale === 'display' ? 0.105 : 0.072
      ),
      fontWeight: 700,
      fill: derived.colors.text,
      textAlign: derived.template.headlineAlign,
      editable: !locked.has('headline'),
      selectable: !locked.has('headline'),
      evented: !locked.has('headline'),
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
    }),
    { id: 'headline', pageId: page.id, viewportScale, textField: 'headline' },
  );
  const objects = [background, headline];

  if (derived.body !== undefined) {
    objects.push(tagged(
      new IText(derived.body, {
        left: headlineLeft,
        top: viewportHeight * 0.22,
        originX: derived.template.headlineAlign === 'center' ? 'center' : 'left',
        width: viewportWidth * 0.8,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: viewportWidth * 0.033,
        fill: derived.colors.text,
        textAlign: derived.template.headlineAlign,
        editable: !locked.has('body'),
        selectable: !locked.has('body'),
        evented: !locked.has('body'),
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
      }),
      { id: 'body', pageId: page.id, viewportScale, textField: 'body' },
    ));
  }

  if (derived.screenshotAsset !== undefined) {
    if (!assetUrl) throw new Error('The selected product screenshot has no render URL');
    const layoutLocked = locked.has('layout');
    const placement = placeStoreScreenshotAsset({
      size: derived.size,
      template: derived.template,
      assetPosition: derived.screenshotAsset.position,
      transform: derived.transform,
    });
    const image = await FabricImage.fromURL(assetUrl, { crossOrigin: 'anonymous' });
    const baseWidth = derived.size.width * 0.8 * viewportScale;
    const baseHeight = derived.size.height * 0.54 * viewportScale;
    image.set({
      left: placement.left * viewportScale,
      top: placement.top * viewportScale,
      width: baseWidth,
      height: baseHeight,
      scaleX: derived.transform.scale,
      scaleY: derived.transform.scale,
      originX: 'left',
      originY: 'top',
      selectable: !layoutLocked,
      evented: !layoutLocked,
      hasControls: !layoutLocked,
      lockRotation: true,
      lockScalingFlip: true,
      lockUniScaling: true,
      clipPath: new Rect({
        left: 0,
        top: 0,
        width: baseWidth,
        height: baseHeight,
        rx: placement.radius * viewportScale,
        ry: placement.radius * viewportScale,
        originX: 'left',
        originY: 'top',
        absolutePositioned: false,
      }),
    });
    objects.push(tagged(image, {
      id: 'product-shot',
      pageId: page.id,
      viewportScale,
      assetPlacement: {
        size: derived.size,
        template: derived.template,
        assetPosition: derived.screenshotAsset.position,
      },
    }));
  }

  return objects;
}

export function fabricObjectToTransformOperation(
  pageId: string,
  object: FabricObject,
): Extract<ChangeOperation, { op: 'setTransform' }> | null {
  const node = readNode(object);
  if (!node || node.id !== 'product-shot' || node.pageId !== pageId || !node.assetPlacement) {
    return null;
  }
  const scaleX = object.scaleX ?? 1;
  const scaleY = object.scaleY ?? scaleX;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || Math.abs(scaleX - scaleY) > 0.0001) {
    return null;
  }
  const anchor = placeStoreScreenshotAsset({
    ...node.assetPlacement,
    transform: { x: 0, y: 0, scale: scaleX },
  });
  return {
    op: 'setTransform',
    pageId,
    x: roundCanonical((object.left ?? anchor.left * node.viewportScale) / node.viewportScale - anchor.left),
    y: roundCanonical((object.top ?? anchor.top * node.viewportScale) / node.viewportScale - anchor.top),
    scale: roundCanonical(scaleX),
  };
}

export function fabricObjectToTextOperation(
  pageId: string,
  platform: StorePlatform,
  object: FabricObject,
): Extract<ChangeOperation, { op: 'setText' }> | null {
  const node = readNode(object);
  if (!node?.textField || node.pageId !== pageId || !('text' in object) || typeof object.text !== 'string') {
    return null;
  }
  return { op: 'setText', pageId, field: node.textField, value: object.text, platform };
}

function tagged(object: FabricObject, node: StoreScreenshotFabricNode): StoreScreenshotFabricObject {
  const taggedObject = object as StoreScreenshotFabricObject;
  taggedObject.data = { storeScreenshotNode: node };
  return taggedObject;
}

function readNode(object: FabricObject): StoreScreenshotFabricNode | null {
  const data = (object as unknown as Partial<StoreScreenshotFabricObject>).data;
  return data?.storeScreenshotNode ?? null;
}

function roundCanonical(value: number): number {
  return Math.round(value * 100) / 100;
}
