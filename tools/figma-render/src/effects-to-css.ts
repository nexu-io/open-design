// Figma effect → CSS value conversion
import { colorToCss } from './paint-to-css';

interface FigEffect {
  type?: string;
  visible?: boolean;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x?: number; y?: number };
  radius?: number;
  spread?: number;
  blendMode?: string;
}

const SHADOW_COLOR = { r: 0, g: 0, b: 0, a: 0.25 };

export function effectsToCss(effects: FigEffect[] | undefined): string {
  if (!effects?.length) return '';
  const parts: string[] = [];
  let backdropFilter = '';
  let filter = '';

  for (const e of effects) {
    if (e.visible === false) continue;
    switch (e.type) {
      case 'DROP_SHADOW': {
        const clr = colorToCss(e.color ?? SHADOW_COLOR);
        parts.push(`${e.offset?.x ?? 0}px ${e.offset?.y ?? 4}px ${e.radius ?? 4}px ${e.spread ?? 0}px ${clr}`);
        break;
      }
      case 'INNER_SHADOW': {
        const clr = colorToCss(e.color ?? SHADOW_COLOR);
        parts.push(`inset ${e.offset?.x ?? 0}px ${e.offset?.y ?? 4}px ${e.radius ?? 4}px ${clr}`);
        break;
      }
      case 'BACKGROUND_BLUR':
        backdropFilter = `blur(${e.radius ?? 8}px)`;
        break;
      case 'LAYER_BLUR':
        filter = `blur(${e.radius ?? 4}px)`;
        break;
    }
  }

  const css: string[] = [];
  if (parts.length) css.push(`box-shadow: ${parts.join(', ')}`);
  if (backdropFilter) css.push(`backdrop-filter: ${backdropFilter}`);
  if (filter) css.push(`filter: ${filter}`);
  return css.join('; ');
}
