// Pixel-accurate FigmaApiNode → HTML renderer
// Traverses the decoded node tree and emits absolute-positioned HTML elements

import { paintToCssBg, pickStrokeCss, pickFirstSolidColor } from './paint-to-css';
import { effectsToCss } from './effects-to-css';

// ── 2×3 Affine Matrix composition ──
// Figma stores transforms as [[m00,m01,m02],[m10,m11,m12]]
// Compose: result_point = parent × child × local_point

type Mat2x3 = [[number,number,number],[number,number,number]];

function matMultiply(a: Mat2x3 | null, b: Mat2x3 | null): Mat2x3 | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return [
    [a[0][0]*b[0][0] + a[0][1]*b[1][0], a[0][0]*b[0][1] + a[0][1]*b[1][1], a[0][0]*b[0][2] + a[0][1]*b[1][2] + a[0][2]],
    [a[1][0]*b[0][0] + a[1][1]*b[1][0], a[1][0]*b[0][1] + a[1][1]*b[1][1], a[1][0]*b[0][2] + a[1][1]*b[1][2] + a[1][2]],
  ];
}

function applyTransform(t: Mat2x3 | null, x: number, y: number): { x: number; y: number } {
  if (!t) return { x, y };
  return { x: t[0][0]*x + t[0][1]*y + t[0][2], y: t[1][0]*x + t[1][1]*y + t[1][2] };
}

function resolveNodeTransform(node: any, parentTransform: Mat2x3 | null): { absolute: Mat2x3 | null; pos: { x: number; y: number }; size: { w: number; h: number } } {
  // Extract local transform
  let local: Mat2x3 | null = null;
  const t = node.transform;
  if (Array.isArray(t) && t.length >= 2) {
    local = [t[0] as [number,number,number], t[1] as [number,number,number]];
  } else if (t && typeof t === 'object') {
    local = [[t.m00??1, t.m01??0, t.m02??0], [t.m10??0, t.m11??1, t.m12??0]];
  }
  const absolute = matMultiply(parentTransform, local);

  // Position — apply absolute transform to origin
  const pos = applyTransform(absolute, 0, 0);

  // Size — apply scale from local transform, fallback to node.size or absoluteBoundingBox
  const nodeSize = node.size ?? {};
  let w = node.absoluteBoundingBox?.width ?? nodeSize.x ?? 0;
  let h = node.absoluteBoundingBox?.height ?? nodeSize.y ?? 0;

  // If we have a transform but no absoluteBoundingBox, approximate size from local scale
  if ((!w || !h) && local) {
    w = w || Math.abs(local[0][0]) * (nodeSize.x ?? 100);
    h = h || Math.abs(local[1][1]) * (nodeSize.y ?? 100);
  }

  return { absolute, pos, size: { w, h } };
}

interface FigmaNode {
  guid?: { sessionID: number; localID: number };
  type?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  size?: { x?: number; y?: number };
  fillPaints?: any[];
  strokePaints?: any[];
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  rectangleTopLeftCornerRadius?: number;
  rectangleTopRightCornerRadius?: number;
  rectangleBottomLeftCornerRadius?: number;
  rectangleBottomRightCornerRadius?: number;
  effects?: any[];
  clipsContent?: boolean;
  characters?: string;
  fontSize?: number;
  fontWeight?: number;
  fontName?: { family?: string; style?: string; postscript?: string };
  lineHeight?: { value?: number; unit?: string };
  letterSpacing?: { value?: number; unit?: string };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textCase?: string;
  textDecoration?: string;
  textData?: { characters?: string };
  children?: FigmaNode[];
  componentId?: string;
  componentKey?: string;
  opacity_?: number;
}

export interface RenderOptions {
  imagesBase?: string;
}

function nodeId(node: FigmaNode): string {
  if (!node.guid) return '?';
  return `${node.guid.sessionID}:${node.guid.localID}`;
}

function textAlign(align?: string): string {
  switch (align) {
    case 'LEFT': return 'left';
    case 'CENTER': return 'center';
    case 'RIGHT': return 'right';
    case 'JUSTIFIED': return 'justify';
    default: return 'left';
  }
}

function textTransform(tCase?: string): string {
  switch (tCase) {
    case 'UPPER': return 'uppercase';
    case 'LOWER': return 'lowercase';
    case 'TITLE': return 'capitalize';
    default: return 'none';
  }
}

function textDecoration(decoration?: string): string {
  switch (decoration) {
    case 'UNDERLINE': return 'underline';
    case 'STRIKETHROUGH': return 'line-through';
    default: return 'none';
  }
}

function cornerRadiusStyle(node: FigmaNode): string {
  const tl = node.rectangleTopLeftCornerRadius ?? node.cornerRadius;
  const tr = node.rectangleTopRightCornerRadius ?? node.cornerRadius;
  const br = node.rectangleBottomRightCornerRadius ?? node.cornerRadius;
  const bl = node.rectangleBottomLeftCornerRadius ?? node.cornerRadius;

  const vals = [tl, tr, br, bl].map((r) => (r ? `${r}px` : '0'));
  if (vals.every((v, i) => v === vals[0])) return vals[0]!;
  return vals.join(' ');
}

function resolveSize(node: FigmaNode): { w: number; h: number } {
  if (node.absoluteBoundingBox) {
    return { w: node.absoluteBoundingBox.width, h: node.absoluteBoundingBox.height };
  }
  if (node.size) {
    return { w: node.size.x ?? 0, h: node.size.y ?? 0 };
  }
  return { w: 0, h: 0 };
}

export function renderNode(node: FigmaNode, depth: number, opts: RenderOptions, parentTransform?: Mat2x3 | null): string {
  if (node.visible === false) return '';

  // Compute absolute transform and position from parent chain
  const xform = resolveNodeTransform(node as any, parentTransform ?? null);
  const box = { x: xform.pos.x, y: xform.pos.y, width: xform.size.w, height: xform.size.h };
  // Use absoluteBoundingBox for size when available (more accurate)
  if (node.absoluteBoundingBox) {
    box.width = node.absoluteBoundingBox.width;
    box.height = node.absoluteBoundingBox.height;
  }

  // Accumulate this node's transform for children
  const childTransform = xform.absolute;

  if (node.type === 'DOCUMENT') {
    const children = (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts, childTransform))
      .filter(Boolean)
      .join('\n');
    return children;
  }

  if (node.type === 'CANVAS') {
    const { w, h } = resolveSize(node);
    const bg = paintToCssBg(node.fillPaints?.[0], opts.imagesBase) || '#ffffff';
    const children = (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts, childTransform))
      .filter(Boolean)
      .join('\n');
    return `<div class="od-page" data-page="${escapeHtml(node.name || '')}" style="width:${Math.round(w)}px;height:${Math.round(h)}px;position:relative;overflow:hidden;background:${bg};margin:0 auto;">
${indent(children, 2)}
</div>`;
  }

  // Use absoluteBoundingBox position when available (fig-decode.ts pre-computes it)
  if (node.absoluteBoundingBox) {
    box.x = node.absoluteBoundingBox.x;
    box.y = node.absoluteBoundingBox.y;
  }

  if (box.width === 0 && box.height === 0) {
    // No geometry, render children inline if any
    return (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts, childTransform))
      .filter(Boolean)
      .join('\n');
  }

  // Build style
  const styles: string[] = [];
  styles.push(`position:absolute`);
  styles.push(`left:${Math.round(box.x)}px`);
  styles.push(`top:${Math.round(box.y)}px`);

  const opacity = node.opacity ?? node.opacity_ ?? 1;
  if (opacity < 1) styles.push(`opacity:${(+opacity.toFixed(3))}`);

  const isText = node.type === 'TEXT';
  const isVector = ['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION'].includes(node.type ?? '');
  const isContainer = ['FRAME', 'GROUP', 'SECTION', 'COMPONENT', 'SYMBOL', 'INSTANCE'].includes(node.type ?? '');

  if (!isText) {
    styles.push(`width:${Math.round(box.width)}px`);
    styles.push(`height:${Math.round(box.height)}px`);
  }

  // Fill
  const fills = node.fillPaints ?? [];
  let bgCss = '';
  if (fills.length > 0) {
    const bg = paintToCssBg(fills[0], opts.imagesBase);
    if (bg) bgCss = `background:${bg}`;
  }

  // Stroke
  const strokeCss = pickStrokeCss(node.strokePaints, node.strokeWeight);

  // Corner radius
  const radius = cornerRadiusStyle(node);
  if (radius && radius !== '0') styles.push(`border-radius:${radius}`);

  // Effects
  const effectCss = effectsToCss(node.effects);

  // Overflow clipping
  if (node.clipsContent) styles.push('overflow:hidden');

  // Text-specific styles
  let textStyles = '';
  if (isText) {
    const chars = node.characters ?? node.textData?.characters ?? '';
    if (!chars.trim()) {
      // Empty text — still render as a placeholder span
      textStyles += 'font-size:12px;';
    }
    if (node.fontName?.family) textStyles += `font-family:${cssFontFamily(node.fontName.family)};`;
    if (node.fontSize) textStyles += `font-size:${node.fontSize}px;`;
    if (node.fontWeight) textStyles += `font-weight:${node.fontWeight};`;
    if (node.lineHeight?.value !== undefined) {
      const lh = node.lineHeight.unit === 'PERCENT'
        ? `${(node.lineHeight.value / 100).toFixed(2)}`
        : `${node.lineHeight.value}px`;
      textStyles += `line-height:${lh};`;
    }
    if (node.letterSpacing?.value !== undefined) {
      textStyles += `letter-spacing:${node.letterSpacing.value}px;`;
    }
    textStyles += `text-align:${textAlign(node.textAlignHorizontal)};`;
    textStyles += `text-transform:${textTransform((node as any).textCase)};`;
    textStyles += `text-decoration:${textDecoration((node as any).textDecoration)};`;

    const textColor = pickFirstSolidColor(node.fillPaints);
    if (textColor) textStyles += `color:${textColor};`;

    // width based on box, but TEXT needs word-wrap
    if (box.width > 0) textStyles += `width:${Math.round(box.width)}px;word-wrap:break-word;overflow-wrap:break-word;`;
    textStyles += `overflow:hidden;`;
  }

  // Vector embedded SVG
  let vectorSvg = '';
  if (isVector && (node as any).geometryBlobToSVGPath) {
    // openfig-core provides SVG path resolution; inlined as placeholder
    vectorSvg = `<svg width="${Math.round(box.width)}" height="${Math.round(box.height)}" viewBox="0 0 ${Math.round(box.width)} ${Math.round(box.height)}" style="display:block;"><rect width="100%" height="100%" fill="${bgCss ? bgCss.replace('background:', '') : '#e0e0e0'}"/></svg>`;
  }

  // Image fills — render as img or background
  const imageFill = fills.find((f: any) => f.type === 'IMAGE');
  let imageTag = '';
  if (imageFill && imageFill.imageRef && opts.imagesBase) {
    const ref = String(imageFill.imageRef).replace(/[^a-f0-9]/gi, '');
    imageTag = `<img src="${opts.imagesBase}/${ref}.png" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  }

  const styleAttr = styles.join(';');

  // Special shapes
  if (node.type === 'ELLIPSE') {
    const extraRadius = radius || '50%';
    const extraStyles = [styleAttr, `border-radius:${extraRadius}`, ...(bgCss ? [bgCss] : [])].join(';');
    const inner = imageTag || '';
    const extras = [effectCss, strokeCss ? `border:${strokeCss}` : ''].filter(Boolean).join(';');
    const allStyles = extras ? `${extraStyles};${extras}` : extraStyles;
    return `<div data-od-id="${nodeId(node)}" data-od-name="${escapeAttr(node.name || '')}" data-type="ellipse" style="${allStyles}">${inner}</div>`;
  }

  // Text node
  if (isText) {
    const chars = node.characters ?? node.textData?.characters ?? '';
    const allStyles = [styleAttr, textStyles, bgCss, ...(strokeCss ? [`border:${strokeCss}`] : [])].filter(Boolean).join(';');
    const escapedChars = escapeHtml(chars);
    return `<span data-od-id="${nodeId(node)}" data-od-name="${escapeAttr(node.name || '')}" data-type="text" style="${allStyles}">${escapedChars}</span>`;
  }

  // Container with children
  if (isContainer) {
    const children = (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts, childTransform))
      .filter(Boolean)
      .join('\n');
    const allStyles = [styleAttr, bgCss, ...(strokeCss ? [`border:${strokeCss}`] : []), effectCss].filter(Boolean).join(';');
    const inner = imageTag || (children ? `\n${indent(children, 2)}\n` : '');
    return `<div data-od-id="${nodeId(node)}" data-od-name="${escapeAttr(node.name || '')}" data-type="${node.type?.toLowerCase()}" style="${allStyles}">${inner}</div>`;
  }

  // Leaf shape (RECTANGLE, ROUNDED_RECTANGLE, etc.)
  if (vectorSvg) {
    const allStyles = [styleAttr, bgCss, ...(strokeCss ? [`border:${strokeCss}`] : []), effectCss].filter(Boolean).join(';');
    return `<div data-od-id="${nodeId(node)}" data-od-name="${escapeAttr(node.name || '')}" data-type="${node.type?.toLowerCase()}" style="${allStyles}">${vectorSvg}</div>`;
  }

  // Generic rectangle/leaf
  const children2 = (node.children ?? [])
    .map((c) => renderNode(c, depth + 1, opts))
    .filter(Boolean)
    .join('\n');
  const allStyles2 = [styleAttr, bgCss || 'background:rgba(0,0,0,0.05)', ...(strokeCss ? [`border:${strokeCss}`] : []), effectCss].filter(Boolean).join(';');
  const inner2 = imageTag || children2 || '';
  return `<div data-od-id="${nodeId(node)}" data-od-name="${escapeAttr(node.name || '')}" data-type="${node.type?.toLowerCase() || 'unknown'}" style="${allStyles2}">${inner2}</div>`;
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line.trim() ? pad + line : line)).join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cssFontFamily(family: string): string {
  // Quote font names with spaces
  if (/\s/.test(family) && !family.startsWith('"') && !family.startsWith("'")) {
    return `"${family}"`;
  }
  return family;
}
