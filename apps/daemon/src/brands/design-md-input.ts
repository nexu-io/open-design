import type { Brand, BrandColor, BrandColorRole, BrandFontSpec } from '@open-design/contracts';

import { luminance, normalizeHex, saturation } from './seed.js';
import { validateBrand } from './validate.js';

export interface BrandFromDesignMdInput {
  markdown: string;
  sourceUrl: string;
  description?: string | undefined;
  fallbackName?: string;
}

interface DesignMdColor {
  key: string;
  hex: string;
}

interface FontCandidate {
  key: string;
  family: string;
}

interface ParsedDesignMd {
  frontmatter: Record<string, unknown>;
  body: string;
}

const DEFAULT_BACKGROUND = '#ffffff';
const DEFAULT_FOREGROUND = '#111111';
const DEFAULT_ACCENT = '#1677ff';
const SANS_FALLBACKS = ['system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'];

export function sourceUrlForDesignMd(markdown: string, fallbackName = 'Design System'): string {
  const parsed = parseDesignMd(markdown);
  const name =
    scalarString(parsed.frontmatter.name) ??
    markdownH1(parsed.body) ??
    fallbackName;
  const slug = slugify(name) || 'design-md';
  return `designmd://${slug}`;
}

export function brandFromDesignMd(input: BrandFromDesignMdInput): Brand | null {
  const markdown = input.markdown.trim();
  if (!markdown) return null;

  const parsed = parseDesignMd(markdown);
  const name =
    scalarString(parsed.frontmatter.name) ??
    markdownH1(parsed.body) ??
    input.fallbackName ??
    'Design System';
  const overview = firstSection(parsed.body, ['overview', 'brand & style', 'brand and style']) ?? firstParagraph(parsed.body);
  const description = input.description?.trim() || scalarString(parsed.frontmatter.description) || overview || '';
  const tagline = firstSentence(overview || description);
  const colors = resolveColors(collectColors(parsed));
  const fonts = collectFonts(parsed.frontmatter, parsed.body);
  const display = fontSpec(
    fonts.find((font) => /display|heading|headline|h1|title/i.test(font.key))?.family ??
      fonts[0]?.family ??
      'Inter',
  );
  const body = fontSpec(
    fonts.find((font) => /body|text|paragraph|copy/i.test(font.key))?.family ??
      fonts[0]?.family ??
      display.family,
  );
  const mono = fonts.find((font) => /mono|code/i.test(font.key));
  const componentNames = collectComponentNames(parsed.frontmatter, parsed.body);
  const radius = firstDimension(parsed.frontmatter.rounded) ?? firstDimension(parsed.frontmatter.radius) ?? '8px';
  const spacing = firstDimension(parsed.frontmatter.spacing) ?? '8px baseline grid';

  const rawBrand = {
    name,
    tagline,
    description,
    sourceUrl: input.sourceUrl,
    logo: {
      primary: null,
      alternates: [],
      notes: 'No logo supplied in pasted DESIGN.md.',
    },
    colors,
    typography: {
      display,
      body,
      ...(mono ? { mono: fontSpec(mono.family, ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']) } : {}),
    },
    voice: {
      adjectives: [],
      tone: description ? firstSentence(description) : '',
      messagingPillars: [description, overview].filter((value, index, arr): value is string =>
        Boolean(value && arr.indexOf(value) === index),
      ),
      vocabulary: { use: [], avoid: [] },
    },
    imagery: {
      style: '',
      subjects: [],
      treatment: '',
      avoid: [],
    },
    layout: {
      radius,
      borderWeight: '1px',
      spacing,
      postureRules: componentNames.length
        ? [`Component kit should cover: ${componentNames.slice(0, 12).join(', ')}.`]
        : [],
    },
  };

  return validateBrand(rawBrand, input.sourceUrl);
}

function parseDesignMd(markdown: string): ParsedDesignMd {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { frontmatter: {}, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: {}, body: normalized };
  const frontmatterText = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n+/, '');
  return { frontmatter: parseSimpleYaml(frontmatterText), body };
}

function parseSimpleYaml(source: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: root }];

  for (const rawLine of source.split('\n')) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const match = /^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/.exec(rawLine);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    const key = match[2] ?? '';
    const rest = match[3] ?? '';
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]!.target;
    if (!rest.trim()) {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, target: child });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return root;
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((part) => scalarString(parseScalar(part)) ?? '')
      .filter(Boolean);
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
}

function scalarString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function collectColors(parsed: ParsedDesignMd): DesignMdColor[] {
  const out: DesignMdColor[] = [];
  const seen = new Set<string>();
  const add = (key: string, raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex || seen.has(hex)) return;
    seen.add(hex);
    out.push({ key, hex });
  };
  collectHexValues(parsed.frontmatter, [], add);
  for (const line of parsed.body.split('\n')) {
    for (const match of line.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/g)) {
      const hex = match[0] ?? '';
      const key = line.slice(0, match.index).replace(/[`*_|\-[\]()]/g, ' ').trim() || 'body';
      add(key, hex);
    }
  }
  return out;
}

function collectHexValues(value: unknown, path: string[], add: (key: string, raw: string) => void): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) {
      add(path.join('.'), match[0] ?? '');
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectHexValues(child, [...path, key], add);
  }
}

function resolveColors(candidates: DesignMdColor[]): BrandColor[] {
  const colors = candidates.filter((item) => /^#[0-9a-f]{6}$/.test(item.hex));
  const used = new Set<string>();
  const picked: BrandColor[] = [];
  const addRole = (role: BrandColorRole, color: DesignMdColor | null, fallback: string, name: string, usage: string) => {
    const hex = color?.hex ?? fallback;
    picked.push({
      role,
      hex,
      oklch: '',
      name: color ? titleFromKey(color.key, name) : name,
      usage,
    });
    used.add(hex);
  };
  const pick = (pattern: RegExp, predicate?: (hex: string) => boolean): DesignMdColor | null =>
    colors.find((item) => !used.has(item.hex) && pattern.test(item.key) && (!predicate || predicate(item.hex))) ?? null;
  const lightest = colors.reduce<DesignMdColor | null>(
    (best, item) => (!best || luminance(item.hex) > luminance(best.hex) ? item : best),
    null,
  );
  const darkest = colors.reduce<DesignMdColor | null>(
    (best, item) => (!best || luminance(item.hex) < luminance(best.hex) ? item : best),
    null,
  );
  const chromatic = (): DesignMdColor | null =>
    colors.find((item) => !used.has(item.hex) && saturation(item.hex) >= 0.16 && luminance(item.hex) > 0.08 && luminance(item.hex) < 0.9) ??
    colors.find((item) => !used.has(item.hex)) ??
    null;

  const background = pick(/background|bg|canvas|neutral|paper|limestone|base/i, (hex) => luminance(hex) > 0.55) ?? (lightest && luminance(lightest.hex) > 0.55 ? lightest : null);
  addRole('background', background, DEFAULT_BACKGROUND, 'Background', 'page canvas');
  addRole('foreground', pick(/foreground|text|ink|black|primary/i, (hex) => luminance(hex) < 0.55) ?? darkest, DEFAULT_FOREGROUND, 'Foreground', 'body text and headings');
  addRole('accent', pick(/accent|brand|cta|tertiary|interactive|button|link/i) ?? chromatic(), DEFAULT_ACCENT, 'Accent', 'primary actions and emphasis');
  addRole('surface', pick(/surface|card|panel|raised/i), mixHex(picked[0]?.hex ?? DEFAULT_BACKGROUND, picked[1]?.hex ?? DEFAULT_FOREGROUND, 0.04), 'Surface', 'cards and panels');
  addRole('muted', pick(/muted|secondary|caption|slate|subtle|gray|grey/i), mixHex(picked[0]?.hex ?? DEFAULT_BACKGROUND, picked[1]?.hex ?? DEFAULT_FOREGROUND, 0.45), 'Muted', 'secondary text and metadata');
  addRole('border', pick(/border|line|hairline|divider|stroke/i), mixHex(picked[0]?.hex ?? DEFAULT_BACKGROUND, picked[1]?.hex ?? DEFAULT_FOREGROUND, 0.14), 'Border', 'rules and dividers');
  const secondary = pick(/accent-secondary|secondary|success|link/i);
  if (secondary) addRole('accent-secondary', secondary, secondary.hex, 'Accent secondary', 'secondary actions and links');

  return picked;
}

function collectFonts(frontmatter: Record<string, unknown>, body: string): FontCandidate[] {
  const out: FontCandidate[] = [];
  const seen = new Set<string>();
  const add = (key: string, family: string) => {
    const clean = cleanFontFamily(family);
    if (!clean || seen.has(`${key}:${clean}`)) return;
    seen.add(`${key}:${clean}`);
    out.push({ key, family: clean });
  };
  collectFontValues(frontmatter.typography ?? frontmatter.fonts ?? frontmatter.type, [], add);
  for (const line of body.split('\n')) {
    const familyMatch =
      /(?:font-family|fontFamily|family)\s*[:=-]\s*`?["']?([^`"',;()]+(?:\s+[^`"',;()]+){0,3})/i.exec(line) ??
      /\b([A-Z][A-Za-z0-9]+(?:Sans|Serif|Mono|Display|Text|Grotesk|Gothic|Humanist|Roman|UI)\b(?:\s+[A-Z][A-Za-z0-9]+)*)/.exec(line);
    if (familyMatch?.[1]) add(line.slice(0, 48), familyMatch[1]);
  }
  return out;
}

function collectFontValues(value: unknown, path: string[], add: (key: string, family: string) => void): void {
  if (typeof value === 'string') {
    if (/font|family|type|body|display|heading|mono/i.test(path.join('.'))) add(path.join('.'), value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  const family = scalarString(o.fontFamily) ?? scalarString(o.family);
  if (family) add(path.join('.'), family);
  for (const [key, child] of Object.entries(o)) collectFontValues(child, [...path, key], add);
}

function fontSpec(family: string, fallbacks = SANS_FALLBACKS): BrandFontSpec {
  return { family, fallbacks, weights: [400, 700] };
}

function cleanFontFamily(raw: string): string {
  return raw
    .split(',')[0]!
    .replace(/[`"']/g, '')
    .replace(/\s+\d+(?:px|rem|em|%)?.*$/i, '')
    .trim();
}

function collectComponentNames(frontmatter: Record<string, unknown>, body: string): string[] {
  const names = new Set<string>();
  const components = frontmatter.components;
  if (components && typeof components === 'object' && !Array.isArray(components)) {
    for (const key of Object.keys(components)) names.add(key);
  }
  const componentSection = firstSection(body, ['components']);
  if (componentSection) {
    for (const line of componentSection.split('\n')) {
      const match = /^\s*[-*]\s+`?([A-Za-z][A-Za-z0-9_-]{1,48})`?/.exec(line);
      if (match?.[1]) names.add(match[1]);
    }
  }
  return Array.from(names);
}

function firstDimension(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (typeof child === 'string' && child.trim()) return child.trim();
    if (typeof child === 'number') return `${child}px`;
  }
  return null;
}

function markdownH1(body: string): string | null {
  const match = /^#\s+(.+)$/m.exec(body);
  return match?.[1]?.trim() || null;
}

function firstSection(body: string, names: string[]): string | null {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const matches = [...body.matchAll(/^##\s+(.+)$/gm)];
  for (let i = 0; i < matches.length; i += 1) {
    const title = matches[i]?.[1]?.trim().toLowerCase();
    if (!title || !wanted.has(title)) continue;
    const start = (matches[i]?.index ?? 0) + (matches[i]?.[0].length ?? 0);
    const end = matches[i + 1]?.index ?? body.length;
    const section = body.slice(start, end).trim();
    return section || null;
  }
  return null;
}

function firstParagraph(body: string): string | null {
  for (const part of body.split(/\n\s*\n/)) {
    const trimmed = part
      .split('\n')
      .filter((line) => !/^#{1,6}\s/.test(line.trim()) && !line.trim().startsWith('|'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function firstSentence(value: string): string {
  return value.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
}

function titleFromKey(key: string, fallback: string): string {
  const leaf = key.split('.').filter(Boolean).at(-1) ?? fallback;
  const words = leaf.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : fallback;
}

function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const ch = (i: number): string =>
    Math.round(ca[i]! + (cb[i]! - ca[i]!) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const n = parseInt(match[1] ?? '', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
