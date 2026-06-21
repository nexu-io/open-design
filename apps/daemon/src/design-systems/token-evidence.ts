import path from 'node:path';

export type DesignTokenKind = 'color' | 'typography' | 'spacing' | 'radius' | 'shadow';

export interface DesignTokenEntry {
  kind: DesignTokenKind;
  name?: string;
  value: string;
  sources: string[];
  usage: string[];
}

export interface DesignExtractReport {
  colors: DesignTokenEntry[];
  typography: DesignTokenEntry[];
  spacing: DesignTokenEntry[];
  radius: DesignTokenEntry[];
  shadow: DesignTokenEntry[];
  scannedFiles: string[];
  warnings: string[];
  endedAt: string;
}

export type CssCustomPropertyEvidence = {
  name: string;
  value: string;
  source: string;
  line: number;
};

export type DesignTokenEvidenceCollector = ReturnType<typeof createDesignTokenEvidenceCollector>;

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA_COLOR_RE = /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g;
const HSLA_COLOR_RE = /hsla?\(\s*[\d.]+(?:deg|rad|turn)?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+)?\s*\)/g;
const CUSTOM_PROPERTY_RE = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;{}\n]+);/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;\n]+)/g;
const SPACING_PX_RE = /\b(?:padding|margin|gap|inset|top|left|right|bottom)\s*:\s*(\d+(?:\.\d+)?(?:px|rem|em))/g;
const RADIUS_RE = /border-radius\s*:\s*([^;\n]+)/g;
const SHADOW_RE = /box-shadow\s*:\s*([^;\n]+)/g;
const TAILWIND_HEX_RE = /['"]#[0-9a-fA-F]{3,8}['"]/g;

export function createDesignTokenEvidenceCollector() {
  const colors: Map<string, DesignTokenEntry> = new Map();
  const typography: Map<string, DesignTokenEntry> = new Map();
  const spacing: Map<string, DesignTokenEntry> = new Map();
  const radius: Map<string, DesignTokenEntry> = new Map();
  const shadow: Map<string, DesignTokenEntry> = new Map();
  const scannedFiles: string[] = [];

  return {
    scannedFiles,
    scanText({ text, file, language }: { text: string; file: string; language?: string }): void {
      scannedFiles.push(file);
      extractColors(text, file, colors);
      extractCSSCustomProperties(text, file, { colors, typography, spacing, radius, shadow });
      extractTypography(text, file, typography);
      extractSpacing(text, file, spacing);
      extractRadius(text, file, radius);
      extractShadow(text, file, shadow);
      if (language === 'js' || language === 'ts') extractTailwindHexes(text, file, colors);
    },
    toReport({ warnings, endedAt }: { warnings: string[]; endedAt: string }): DesignExtractReport {
      return {
        colors: [...colors.values()].sort(byNameOrValue),
        typography: [...typography.values()].sort(byNameOrValue),
        spacing: [...spacing.values()].sort(byNameOrValue),
        radius: [...radius.values()].sort(byNameOrValue),
        shadow: [...shadow.values()].sort(byNameOrValue),
        scannedFiles,
        warnings,
        endedAt,
      };
    },
  };
}

export function extractCssCustomProperties(text: string, file: string): CssCustomPropertyEvidence[] {
  const tokens: CssCustomPropertyEvidence[] = [];
  CUSTOM_PROPERTY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CUSTOM_PROPERTY_RE.exec(text)) !== null) {
    const name = match[1];
    const value = match[2]?.trim();
    if (name === undefined || value === undefined) continue;
    if (value.length === 0 || value.length > 120) continue;
    tokens.push({ name, value, source: file, line: lineNumberAt(text, match.index) });
  }
  return tokens;
}

export function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let offset = 0; offset < index && offset < text.length; offset += 1) {
    if (text.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}

function extractColors(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  for (const re of [HEX_COLOR_RE, RGBA_COLOR_RE, HSLA_COLOR_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      const line = lineNumberAt(text, match.index);
      pushSource(out, `c:${value.toLowerCase()}`, 'color', value, `${file}:${line}`);
    }
  }
}

function extractCSSCustomProperties(
  text: string,
  file: string,
  out: {
    colors: Map<string, DesignTokenEntry>;
    typography: Map<string, DesignTokenEntry>;
    spacing: Map<string, DesignTokenEntry>;
    radius: Map<string, DesignTokenEntry>;
    shadow: Map<string, DesignTokenEntry>;
  },
): void {
  for (const token of extractCssCustomProperties(text, file)) {
    const name = token.name.toLowerCase();
    const source = `${file}:${token.line}`;
    if (isColorValue(token.value) || colorNameHint(name)) {
      pushSource(out.colors, `cv:${token.name}`, 'color', token.value, source, token.name);
    }
    if (fontNameHint(name) || (name.includes('font') && /[A-Za-z]/.test(token.value))) {
      pushSource(out.typography, `fv:${token.name}`, 'typography', token.value.replace(/['"]/g, '').trim(), source, token.name);
    }
    if (spacingNameHint(name) && isLengthLike(token.value)) {
      pushSource(out.spacing, `sv:${token.name}`, 'spacing', token.value, source, token.name);
    }
    if (name.includes('radius') && isLengthLike(token.value)) {
      pushSource(out.radius, `rv:${token.name}`, 'radius', token.value, source, token.name);
    }
    if ((name.includes('shadow') || name.includes('elev')) && token.value.trim().length > 0) {
      pushSource(out.shadow, `shv:${token.name}`, 'shadow', token.value, source, token.name);
    }
  }
}

function extractTypography(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  FONT_FAMILY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FONT_FAMILY_RE.exec(text)) !== null) {
    const value = (match[1] ?? '').replace(/['"]/g, '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, match.index);
    pushSource(out, `f:${value.toLowerCase()}`, 'typography', value, `${file}:${line}`);
  }
}

function extractSpacing(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  SPACING_PX_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPACING_PX_RE.exec(text)) !== null) {
    const value = match[1] ?? '';
    if (!value) continue;
    const line = lineNumberAt(text, match.index);
    pushSource(out, `s:${value}`, 'spacing', value, `${file}:${line}`);
  }
}

function extractRadius(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  RADIUS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RADIUS_RE.exec(text)) !== null) {
    const value = (match[1] ?? '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, match.index);
    pushSource(out, `r:${value}`, 'radius', value, `${file}:${line}`);
  }
}

function extractShadow(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  SHADOW_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SHADOW_RE.exec(text)) !== null) {
    const value = (match[1] ?? '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, match.index);
    pushSource(out, `sh:${value}`, 'shadow', value, `${file}:${line}`);
  }
}

function extractTailwindHexes(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  TAILWIND_HEX_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAILWIND_HEX_RE.exec(text)) !== null) {
    const raw = match[0]!;
    const value = raw.slice(1, -1);
    const line = lineNumberAt(text, match.index);
    pushSource(out, `c:${value.toLowerCase()}`, 'color', value, `${file}:${line}`);
  }
}

function pushSource(
  map: Map<string, DesignTokenEntry>,
  key: string,
  kind: DesignTokenKind,
  value: string,
  source: string,
  name?: string,
): void {
  let entry = map.get(key);
  if (!entry) {
    entry = { kind, value, sources: [], usage: [] };
    if (name) entry.name = name;
    map.set(key, entry);
  }
  if (!entry.sources.includes(source)) entry.sources.push(source);
  const basename = path.basename(source.split(':')[0] ?? source);
  if (!entry.usage.includes(basename)) entry.usage.push(basename);
}

function byNameOrValue(a: DesignTokenEntry, b: DesignTokenEntry): number {
  if (a.name && b.name && a.name !== b.name) return a.name.localeCompare(b.name);
  return a.value.localeCompare(b.value);
}

function colorNameHint(name: string): boolean {
  return ['color', 'fg', 'bg', 'accent', 'primary', 'secondary', 'surface', 'border', 'muted'].some((needle) =>
    name.includes(needle),
  );
}

function fontNameHint(name: string): boolean {
  return ['font', 'typeface'].some((needle) => name.includes(needle));
}

function spacingNameHint(name: string): boolean {
  return ['space', 'spacing', 'gap', 'gutter', 'padding', 'margin'].some((needle) => name.includes(needle));
}

function isColorValue(value: string): boolean {
  return /^(#(?:[0-9a-f]{3,8})|rgb[a]?\(|hsl[a]?\(|oklch\(|color-mix\(|var\()/i.test(value.trim());
}

function isLengthLike(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|ch|vw|vh|%)|clamp\(|calc\(|var\()/i.test(value.trim());
}
