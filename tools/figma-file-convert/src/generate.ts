import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractedTokens } from './extract';

export function generateDesignSystem(outputDir: string, name: string, tokens: ExtractedTokens): void {
  mkdirSync(outputDir, { recursive: true });

  const primary = tokens.colors[0]?.hex || '#000000';
  const background = findBackgroundColor(tokens.colors);
  const surface = findSurfaceColor(background, tokens.colors);
  const accent = findAccentColor(tokens.colors);
  const textColor = tokens.colors.find((c) => c.role === 'text')?.hex || '#1a1a1a';

  writeDESIGNmd(outputDir, name, tokens, { primary, background, surface, accent, textColor });
  writeTokens(outputDir, tokens, { primary, background, surface, accent, textColor });
  writeTokensCss(outputDir, tokens, { primary, background, surface, accent, textColor });
  writeManifest(outputDir, name);
}

function findBackgroundColor(colors: ExtractedTokens['colors']): string {
  // Lightest color >90% lightness
  const light = colors.filter((c) => {
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    return lum > 0.9;
  });
  return light[0]?.hex || '#ffffff';
}

function findSurfaceColor(bg: string, colors: ExtractedTokens['colors']): string {
  const card = colors.find((c) => {
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    return lum > 0.85 && lum < 0.98 && c.hex !== bg;
  });
  return card?.hex || '#f5f5f5';
}

function findAccentColor(colors: ExtractedTokens['colors']): string {
  // Most saturated non-grayscale color
  const colored = colors.filter((c) => {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    return max - min > 0.15;
  });
  return colored[0]?.hex || '#2563eb';
}

function writeDESIGNmd(dir: string, name: string, tokens: ExtractedTokens, p: Record<string, string>): void {
  const palette = tokens.colors.slice(0, 16).map((c) => `- ${c.hex} (${c.role}${c.gradientAngle != null ? `, ${c.gradientAngle}deg gradient` : ''}, ${c.count} uses)`).join('\n');
  const fontList = tokens.fonts.slice(0, 8).map((f) => `- **${f.family}**: ${f.sizes.sort((a, b) => a - b).map((s) => `${s}px`).join(', ')} | weights: ${f.weights.sort((a, b) => a - b).join(', ')} | ${f.count} uses`).join('\n');
  const spacing = tokens.spacings.slice(0, 10).map((s) => `${s}px`).join(', ');
  const radii = tokens.radii.slice(0, 5).map((r) => `${r}px`).join(', ');
  const components = tokens.componentNames.slice(0, 20).map((c) => `- ${c}`).join('\n');
  const gradientInfo = tokens.gradientAngles.length > 0
    ? `- Gradient angles found: ${tokens.gradientAngles.map((a) => `${a}deg`).join(', ')}\n- ${tokens.imageFills.length} image fills detected`
    : (tokens.imageFills.length > 0 ? `- ${tokens.imageFills.length} image fills detected in the design` : '- No gradients or image fills detected');
  const textInfo = tokens.textTransforms.length > 0
    ? `- Text transforms used: ${tokens.textTransforms.join(', ')}` : '';

  const md = `# Design System: ${name}

> Auto-generated from Figma .fig file. Review and adjust as needed.

## 1. Visual Theme & Atmosphere

${name} — extracted from a Figma design file. Palette is ${tokens.colors.length} colors, ${tokens.fonts.length} fonts, ${tokens.componentNames.length} named components.

## 2. Color Palette & Roles

### Primary
- **Primary / Brand**: ${p.primary}
- **Accent**: ${p.accent}
- **Text**: ${p.textColor}

### Surface & Background
- **Background**: ${p.background}
- **Surface / Card**: ${p.surface}

### Full Palette (top 16 by usage)
${palette}

## 3. Typography Rules

### Font Families
${fontList}

### Spacing
${spacing}

### Border Radii
${radii}

## 4. Component Stylings

${components || '(No named components found)'}

### Buttons
- Background: ${p.accent}
- Text: ${p.background}
- Radius: ${radii ? radii.split(',')[0] : '8px'}
- Focus: 2px solid ${p.primary}

### Inputs
- Border: 1px solid ${p.textColor}44
- Focus: 2px solid ${p.accent}

### Gradients & Images
${gradientInfo}

${textInfo ? `### Text Transforms\n${textInfo}\n` : ''}

## 5. Layout & Spacing

- Auto-layout spacings found: ${spacing}
- Padding defaults: ${spacing}

## 6. Motion

- Duration: 150ms (enter), 100ms (exit)
- Easing: cubic-bezier(0.23, 1, 0.32, 1)

## 7. Voice & Tone

- Brand voice: Professional, clear, human
- Terminology: Use straightforward language

## 8. Brand

This design system was auto-generated from a Figma file.
Customize sections above to match your brand guidelines.

## 9. Anti-Patterns

- Do not introduce colors outside the palette above
- Do not use fonts not listed in typography
- Do not override spacing tokens with arbitrary values
`;
  writeFileSync(join(dir, 'DESIGN.md'), md, 'utf-8');
}

function writeTokens(dir: string, tokens: ExtractedTokens, p: Record<string, string>): void {
  const json = {
    name: 'Figma Import',
    version: '1.0.0',
    colors: {
      primary: p.primary,
      accent: p.accent,
      text: p.textColor,
      background: p.background,
      surface: p.surface,
      palette: tokens.colors.slice(0, 16).map((c) => ({ hex: c.hex, role: c.role, usage: c.count, gradientAngle: c.gradientAngle ?? undefined })),
    },
    typography: {
      fonts: tokens.fonts.slice(0, 8).map((f) => ({
        family: f.family,
        style: f.style,
        sizes: f.sizes.sort((a, b) => a - b),
        weights: f.weights.sort((a, b) => a - b),
      })),
      textTransforms: tokens.textTransforms,
    },
    gradients: tokens.gradientAngles,
    imageFills: tokens.imageFills,
    spacing: tokens.spacings.slice(0, 10),
    radii: tokens.radii.slice(0, 5),
    components: tokens.componentNames.slice(0, 30),
  };
  writeFileSync(join(dir, 'design-tokens.json'), JSON.stringify(json, null, 2), 'utf-8');
}

function writeTokensCss(dir: string, tokens: ExtractedTokens, p: Record<string, string>): void {
  const css = `:root {
  --color-primary: ${p.primary};
  --color-accent: ${p.accent};
  --color-text: ${p.textColor};
  --color-background: ${p.background};
  --color-surface: ${p.surface};

  --font-display: ${tokens.fonts[0]?.family || 'system-ui'}, sans-serif;
  --font-body: ${tokens.fonts[0]?.family || 'Inter'}, sans-serif;

  --space-xs: ${tokens.spacings[0] || 4}px;
  --space-sm: ${tokens.spacings[1] || 8}px;
  --space-md: ${tokens.spacings[2] || 16}px;
  --space-lg: ${tokens.spacings[3] || 24}px;
  --space-xl: ${tokens.spacings[4] || 32}px;

  --radius-sm: ${tokens.radii[0] || 4}px;
  --radius-md: ${tokens.radii[1] || 8}px;
  --radius-lg: ${tokens.radii[2] || 16}px;

  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
`;
  writeFileSync(join(dir, 'tokens.css'), css, 'utf-8');
}

function writeManifest(dir: string, name: string): void {
  const manifest = {
    name,
    version: '1.0.0',
    description: `Design system extracted from Figma .fig file: ${name}`,
    author: 'figma-import',
    license: 'MIT',
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}
