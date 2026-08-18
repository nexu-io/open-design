// Figma paint → CSS value conversion
// Handles SOLID, GRADIENT_LINEAR, GRADIENT_RADIAL, IMAGE, EMOJI paint types

interface FigColor { r: number; g: number; b: number; a?: number }
interface GradientStop { position: number; color: FigColor }

export function colorToCss(c: FigColor, alpha?: number): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = alpha ?? c.a ?? 1;
  if (a >= 0.999) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${(+a.toFixed(3))})`;
}

export function paintToCssBg(paint: any, imagesBase?: string): string {
  if (!paint || paint.visible === false) return '';
  const opacity = paint.opacity != null ? paint.opacity : 1;

  switch (paint.type) {
    case 'SOLID':
      if (!paint.color) return '';
      return colorToCss(paint.color, opacity);

    case 'GRADIENT_LINEAR': {
      if (!paint.gradientStops?.length) return '';
      // Compute angle from gradient transform
      const gt = paint.gradientTransform;
      let angle = 0;
      if (gt) {
        // gradientTransform is [[m00,m01,m02],[m10,m11,m12]]
        // angle = atan2(-m01_line, m00_line) where the gradient line goes
        // Simple version: angle from the first row
        const row0 = Array.isArray(gt) ? gt[0] : null;
        const row1 = Array.isArray(gt) ? gt[1] : null;
        if (row0 && row1) {
          angle = Math.atan2(row1[0], row0[0]) * (180 / Math.PI) + 90;
        }
      }
      angle = Math.round(angle * 10) / 10;
      const stops = paint.gradientStops
        .map((s: GradientStop) => `${colorToCss(s.color, opacity)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `linear-gradient(${angle}deg, ${stops})`;
    }

    case 'GRADIENT_RADIAL': {
      if (!paint.gradientStops?.length) return '';
      const stops = paint.gradientStops
        .map((s: GradientStop) => `${colorToCss(s.color, opacity)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `radial-gradient(circle, ${stops})`;
    }

    case 'GRADIENT_ANGULAR': {
      if (!paint.gradientStops?.length) return '';
      const stops = paint.gradientStops
        .map((s: GradientStop) => `${colorToCss(s.color, opacity)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `conic-gradient(${stops})`;
    }

    case 'IMAGE':
      if (paint.imageRef && imagesBase) {
        const ref = String(paint.imageRef).replace(/[^a-f0-9]/gi, '');
        return `url(${imagesBase}/${ref}.png)`;
      }
      return '';

    default:
      return '';
  }
}

export function pickStrokeCss(strokes: any[] | undefined, strokeWeight?: number): string {
  if (!strokes?.length || !strokes[0]) return '';
  const s = strokes[0];
  if (s.type !== 'SOLID' || !s.color) return '';
  const w = strokeWeight ?? 1;
  return `${w}px solid ${colorToCss(s.color, s.opacity)}`;
}

// Extract first solid fill as a simple color string (for text color etc.)
export function pickFirstSolidColor(fills: any[] | undefined): string {
  if (!fills?.length) return '';
  for (const f of fills) {
    if (f.type === 'SOLID' && f.color && f.visible !== false) {
      return colorToCss(f.color, f.opacity);
    }
  }
  return '';
}
