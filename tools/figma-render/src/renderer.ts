// Pixel-accurate FigmaApiNode → HTML renderer
// Traverses the decoded node tree and emits absolute-positioned HTML elements

import { paintToCssBg, pickStrokeCss, pickFirstSolidColor } from './paint-to-css';
import { effectsToCss } from './effects-to-css';

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

export function renderNode(node: FigmaNode, depth: number, opts: RenderOptions): string {
  if (node.visible === false) return '';
  if (node.type === 'DOCUMENT') {
    // Document just renders children
    const children = (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts))
      .filter(Boolean)
      .join('\n');
    return children;
  }

  if (node.type === 'CANVAS') {
    const { w, h } = resolveSize(node);
    const bg = paintToCssBg(node.fillPaints?.[0], opts.imagesBase) || '#ffffff';
    const children = (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts))
      .filter(Boolean)
      .join('\n');
    return `<div class="od-page" data-page="${escapeHtml(node.name || '')}" style="width:${w}px;height:${h}px;position:relative;overflow:hidden;background:${bg};margin:0 auto;">
${indent(children, 2)}
</div>`;
  }

  // Box/size — prefer absoluteBoundingBox, fall back to transform + size
  let box = node.absoluteBoundingBox;
  if (!box) {
    const t = (node as any).transform;
    const sz = node.size;
    if (t && sz) {
      // transform is [[m00,m01,m02],[m10,m11,m12]] — 2x3 affine
      const row0 = Array.isArray(t) ? t[0] : (t as any)?.m00 !== undefined ? [(t as any).m00, (t as any).m01, (t as any).m02] : null;
      const row1 = Array.isArray(t) ? t[1] : (t as any)?.m10 !== undefined ? [(t as any).m10, (t as any).m11, (t as any).m12] : null;
      if (row0 && row1) {
        box = { x: row0[2] ?? 0, y: row1[2] ?? 0, width: sz.x ?? 0, height: sz.y ?? 0 };
      }
    }
    if (!box && sz) {
      box = { x: 0, y: 0, width: sz.x ?? 0, height: sz.y ?? 0 };
    }
  }
  if (!box) {
    // No geometry, render children inline if any
    return (node.children ?? [])
      .map((c) => renderNode(c, depth + 1, opts))
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
      .map((c) => renderNode(c, depth + 1, opts))
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
