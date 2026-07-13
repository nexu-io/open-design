import type { FigmaFileData, ParsedNode, ParsedPaint } from './parser';
import { walkAllNodes } from './parser';

export interface ExtractedTokens {
  colors: ColorEntry[];
  fonts: FontEntry[];
  spacings: number[];
  radii: number[];
  componentNames: string[];
}

interface ColorEntry {
  hex: string;
  r: number; g: number; b: number;
  a: number;
  count: number;
  role: string;
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

  walkAllNodes(file, (node) => {
    // Colors from fills and strokes
    const paints: ParsedPaint[] = [
      ...(node.fills ?? []),
      ...(node.strokes ?? []),
    ];
    for (const paint of paints) {
      if (paint.type === 'SOLID' && paint.color) {
        const hex = rgbaToHex(paint.color.r, paint.color.g, paint.color.b);
        const key = `${hex}_${paint.color.a.toFixed(2)}`;
        const entry = colorMap.get(key);
        if (entry) {
          entry.count++;
        } else {
          colorMap.set(key, {
            hex,
            r: paint.color.r,
            g: paint.color.g,
            b: paint.color.b,
            a: paint.color.a,
            count: 1,
            role: inferColorRole(node, paint),
          });
        }
      }
      // Extract colors from gradient stops
      if (paint.gradientStops) {
        for (const stop of paint.gradientStops) {
          if (stop.color) {
            const hex = rgbaToHex(stop.color.r, stop.color.g, stop.color.b);
            const key = `grad_${hex}_${stop.color.a.toFixed(2)}`;
            if (!colorMap.has(key)) {
              colorMap.set(key, {
                hex,
                r: stop.color.r,
                g: stop.color.g,
                b: stop.color.b,
                a: stop.color.a,
                count: 1,
                role: 'gradient',
              });
            }
          }
        }
      }
    }

    // Effects (shadows)
    if (node.effects) {
      for (const effect of node.effects) {
        if (effect.color) {
          const hex = rgbaToHex(effect.color.r, effect.color.g, effect.color.b);
          const key = `fx_${hex}_${effect.color.a.toFixed(2)}`;
          if (!colorMap.has(key)) {
            colorMap.set(key, {
              hex,
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a,
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
      const entry = fontMap.get(key);
      if (entry) {
        if (node.fontSize && !entry.sizes.includes(node.fontSize)) entry.sizes.push(node.fontSize);
        if (node.fontWeight && !entry.weights.includes(node.fontWeight)) entry.weights.push(node.fontWeight);
        entry.count++;
      } else {
        fontMap.set(key, {
          family,
          sizes: node.fontSize ? [node.fontSize] : [],
          weights: node.fontWeight ? [node.fontWeight] : [],
          style: node.fontName.style || 'Regular',
          count: 1,
        });
      }
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
    if (node.type === 'COMPONENT' || node.type === 'SYMBOL' || node.componentId) {
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
  };
}

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

function inferColorRole(node: ParsedNode, paint: ParsedPaint): string {
  if (node.strokes?.includes(paint)) return 'stroke';
  if (node.type === 'TEXT') return 'text';
  if (node.fills?.includes(paint)) return 'fill';
  return 'unknown';
}
