import type { FigmaFileData, ParsedNode, ParsedPaint } from './parser';
import { walkAllNodes } from './parser';

// Weight mapping from font style names → numeric weight (article § 富文本)
const WEIGHT_MAP: Record<string, number> = {
  thin: 100, hairline: 100,
  extralight: 200, 'extra light': 200, ultralight: 200,
  light: 300,
  regular: 400, normal: 400, book: 400,
  medium: 500,
  semibold: 600, 'semi bold': 600, demibold: 600,
  bold: 700,
  extrabold: 800, 'extra bold': 800, ultrabold: 800, heavy: 800,
  black: 900,
};

function parseWeightFromStyle(style?: string): number | null {
  if (!style) return null;
  const lower = style.toLowerCase();
  for (const [name, weight] of Object.entries(WEIGHT_MAP)) {
    if (lower.includes(name)) return weight;
  }
  // Try to parse numeric suffix like "SFProDisplay-Semibold" → extract "Semibold"
  const parts = lower.split(/[-_\s]+/);
  for (const part of parts) {
    const w = WEIGHT_MAP[part];
    if (w) return w;
  }
  return null;
}

export interface ExtractedTokens {
  colors: ColorEntry[];
  fonts: FontEntry[];
  spacings: number[];
  radii: number[];
  componentNames: string[];
  gradientAngles: number[];
  textTransforms: string[];
  imageFills: string[];  // hash or blob references found
}

interface ColorEntry {
  hex: string;
  r: number; g: number; b: number;
  a: number;
  count: number;
  role: string;
  gradientAngle?: number;
}

interface FontEntry {
  family: string;
  sizes: number[];
  weights: number[];
  style: string;
  count: number;
}

export function extractTokens(file: FigmaFileData): ExtractedTokens {
  const colorMap = new Map<string, ColorEntry>();
  const fontMap = new Map<string, FontEntry>();
  const spacings: number[] = [];
  const radii: number[] = [];
  const componentNames: string[] = [];
  const gradientAngles: number[] = [];
  const textTransforms: string[] = [];
  const imageFills: string[] = [];

  walkAllNodes(file, (node) => {
    // Filter out "Internal Only" pages (article § 踩坑记录 #3)
    if (node.type === 'CANVAS' && node.name === 'Internal Only Canvas') return;

    // Colors from fillPaints and strokePaints (openfig-core naming)
    const paints: ParsedPaint[] = [
      ...((node as any).fillPaints ?? []),
      ...((node as any).strokePaints ?? []),
    ];
    for (const paint of paints) {
      if (paint.type === 'SOLID' && paint.color) {
        const hex = rgbaToHex(paint.color.r, paint.color.g, paint.color.b);
        const key = `${hex}_${(paint.color.a ?? 1).toFixed(2)}`;
        const entry = colorMap.get(key);
        if (entry) {
          entry.count++;
        } else {
          colorMap.set(key, {
            hex,
            r: paint.color.r,
            g: paint.color.g,
            b: paint.color.b,
            a: paint.color.a ?? 1,
            count: 1,
            role: inferColorRole(node, paint),
          });
        }
      }
      // Gradient fill — extract angle from transform matrix (article § 渐变角度)
      if (paint.type?.includes('GRADIENT') && (node as any).transform) {
        const t = (node as any).transform;
        // angle = atan2(m10, m00) * 180/π
        const angle = Math.atan2(t.m10 ?? 0, t.m00 ?? 1) * (180 / Math.PI);
        const rounded = Math.round(angle * 10) / 10;
        if (!gradientAngles.includes(rounded)) gradientAngles.push(rounded);
      }
      // Image fill — record hash/blob reference (article § 图片延迟解析)
      if (paint.type === 'IMAGE' && (paint as any).imageRef) {
        const ref = (paint as any).imageRef;
        if (!imageFills.includes(ref)) imageFills.push(ref);
      }
    }

    // Effects (shadows)
    if (node.effects) {
      for (const effect of node.effects) {
        if (effect.color) {
          const hex = rgbaToHex(effect.color.r, effect.color.g, effect.color.b);
          const key = `fx_${hex}_${(effect.color.a ?? 1).toFixed(2)}`;
          if (!colorMap.has(key)) {
            colorMap.set(key, {
              hex,
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a ?? 1,
              count: 1,
              role: 'effect',
            });
          }
        }
      }
    }

    // Typography
    if (node.type === 'TEXT' && node.fontName) {
      const family = node.fontName.family || 'Inter';
      const key = `${family}_${node.fontName.style || 'Regular'}`;
      // Extract numeric weight from font style name (article § 富文本 weight mapping)
      const parsedWeight = parseWeightFromStyle(node.fontName.style)
        ?? node.fontWeight
        ?? parseWeightFromStyle(node.fontName.postscript)
        ?? 400;
      const entry = fontMap.get(key);
      if (entry) {
        if (node.fontSize && !entry.sizes.includes(node.fontSize)) entry.sizes.push(node.fontSize);
        if (!entry.weights.includes(parsedWeight)) entry.weights.push(parsedWeight);
        entry.count++;
      } else {
        fontMap.set(key, {
          family,
          sizes: node.fontSize ? [node.fontSize] : [],
          weights: [parsedWeight],
          style: node.fontName.style || 'Regular',
          count: 1,
        });
      }

      // Text transform (article § 大小写变换)
      const xform = (node as any).textCase;
      if (xform && !textTransforms.includes(xform)) textTransforms.push(xform);
    }

    // Spacings (from auto layout)
    if (node.stackPaddingLeft) spacings.push(Math.round(node.stackPaddingLeft));
    if (node.stackPaddingRight) spacings.push(Math.round(node.stackPaddingRight));
    if (node.stackPaddingTop) spacings.push(Math.round(node.stackPaddingTop));
    if (node.stackPaddingBottom) spacings.push(Math.round(node.stackPaddingBottom));
    if (node.stackSpacing) spacings.push(Math.round(node.stackSpacing));

    // Radii
    const cr = node.cornerRadius;
    if (cr && cr > 0 && !radii.includes(Math.round(cr))) radii.push(Math.round(cr));

    // Component names
    if (node.type === 'COMPONENT' || node.type === 'SYMBOL' || (node as any).componentId) {
      const name = node.name || '';
      if (name && !componentNames.includes(name)) componentNames.push(name);
    }
  });

  return {
    colors: [...colorMap.values()].sort((a, b) => b.count - a.count),
    fonts: [...fontMap.values()].sort((a, b) => b.count - a.count),
    spacings: [...new Set(spacings)].sort((a, b) => a - b),
    radii: radii.sort((a, b) => a - b),
    componentNames,
    gradientAngles,
    textTransforms,
    imageFills,
  };
}

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

function inferColorRole(node: ParsedNode, paint: ParsedPaint): string {
  if (((node as any).strokePaints ?? []).includes(paint)) return 'stroke';
  if (node.type === 'TEXT') return 'text';
  if (((node as any).fillPaints ?? []).includes(paint)) return 'fill';
  return 'unknown';
}
