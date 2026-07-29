import { IText, Rect, type FabricObject } from 'fabric';
import {
  deriveStoreScreenshotPage,
  type ChangeOperation,
  type StorePlatform,
  type StoreScreenshotDocument,
  type StoreScreenshotPage,
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
  baseLeft?: number;
  baseTop?: number;
  textField?: 'headline' | 'body';
}

export type StoreScreenshotFabricObject = FabricObject & {
  data: {
    storeScreenshotNode: StoreScreenshotFabricNode;
  };
};

export function storeScreenshotPageToFabricObjects(
  document: StoreScreenshotDocument,
  page: StoreScreenshotPage,
  platform: StorePlatform,
  viewportWidth: number,
): StoreScreenshotFabricObject[] {
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
    {
      id: 'headline',
      pageId: page.id,
      viewportScale,
      textField: 'headline',
    },
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
      {
        id: 'body',
        pageId: page.id,
        viewportScale,
        textField: 'body',
      },
    ));
  }

  if (derived.screenshotAsset !== undefined) {
    const screenshotWidth = derived.size.width * 0.8;
    const screenshotHeight = derived.size.height * 0.54;
    const assetPosition = derived.screenshotAsset.position ?? { x: 0, y: 0 };
    const baseLeft = (
      derived.template.devicePlacement === 'right'
        ? derived.size.width - screenshotWidth - derived.size.width * 0.06
        : (derived.size.width - screenshotWidth) / 2
    ) + assetPosition.x;
    const baseTop = (
      derived.size.height - screenshotHeight - derived.size.height * 0.07
    ) + assetPosition.y;
    const layoutLocked = locked.has('layout');
    objects.push(tagged(
      new Rect({
        left: (baseLeft + derived.transform.x) * viewportScale,
        top: (baseTop + derived.transform.y) * viewportScale,
        width: screenshotWidth * viewportScale,
        height: screenshotHeight * viewportScale,
        scaleX: derived.transform.scale,
        scaleY: derived.transform.scale,
        fill: derived.screenshotAsset.color ?? derived.colors.accent,
        rx: derived.template.screenshotRadius * viewportScale,
        ry: derived.template.screenshotRadius * viewportScale,
        originX: 'left',
        originY: 'top',
        selectable: !layoutLocked,
        evented: !layoutLocked,
        hasControls: !layoutLocked,
        lockRotation: true,
        lockScalingFlip: true,
      }),
      {
        id: 'product-shot',
        pageId: page.id,
        viewportScale,
        baseLeft: baseLeft * viewportScale,
        baseTop: baseTop * viewportScale,
      },
    ));
  }

  return objects;
}

export function fabricObjectToTransformOperation(
  pageId: string,
  object: FabricObject,
): Extract<ChangeOperation, { op: 'setTransform' }> | null {
  const node = readNode(object);
  if (
    !node
    || node.id !== 'product-shot'
    || node.pageId !== pageId
    || node.baseLeft === undefined
    || node.baseTop === undefined
  ) {
    return null;
  }
  const scaleX = object.scaleX ?? 1;
  const scaleY = object.scaleY ?? scaleX;
  return {
    op: 'setTransform',
    pageId,
    x: roundCanonical(((object.left ?? node.baseLeft) - node.baseLeft) / node.viewportScale),
    y: roundCanonical(((object.top ?? node.baseTop) - node.baseTop) / node.viewportScale),
    scale: roundCanonical((scaleX + scaleY) / 2),
  };
}

export function fabricObjectToTextOperation(
  pageId: string,
  platform: StorePlatform,
  object: FabricObject,
): Extract<ChangeOperation, { op: 'setText' }> | null {
  const node = readNode(object);
  if (
    !node?.textField
    || node.pageId !== pageId
    || !('text' in object)
    || typeof object.text !== 'string'
  ) {
    return null;
  }
  return {
    op: 'setText',
    pageId,
    field: node.textField,
    value: object.text,
    platform,
  };
}

function tagged(
  object: FabricObject,
  node: StoreScreenshotFabricNode,
): StoreScreenshotFabricObject {
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
