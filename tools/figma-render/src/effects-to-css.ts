// Figma effect → CSS value conversion

interface FigEffect {
  type?: string;
  visible?: boolean;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x?: number; y?: number };
  radius?: number;
  spread?: number;
  blendMode?: string;
}

export function effectsToCss(effects: FigEffect[] | undefined): string {
  if (!effects?.length) return '';
  const parts: string[] = [];

  let backdropFilter = '';
  let filter = '';

  for (const e of effects) {
    if (e.visible === false) continue;
    switch (e.type) {
      case 'DROP_SHADOW': {
        const color = e.color
          ? `rgba(${Math.round(e.color.r * 255)},${Math.round(e.color.g * 255)},${Math.round(e.color.b * 255)},${(e.color.a ?? 1).toFixed(2)})`
          : 'rgba(0,0,0,0.25)';
        const ox = e.offset?.x ?? 0;
        const oy = e.offset?.y ?? 4;
        const r = e.radius ?? 4;
        const s = e.spread ?? 0;
        parts.push(`${ox}px ${oy}px ${r}px ${s}px ${color}`);
        break;
      }
      case 'INNER_SHADOW': {
        const color = e.color
          ? `rgba(${Math.round(e.color.r * 255)},${Math.round(e.color.g * 255)},${Math.round(e.color.b * 255)},${(e.color.a ?? 1).toFixed(2)})`
          : 'rgba(0,0,0,0.25)';
        const ox = e.offset?.x ?? 0;
        const oy = e.offset?.y ?? 4;
        const r = e.radius ?? 4;
        parts.push(`inset ${ox}px ${oy}px ${r}px ${color}`);
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
