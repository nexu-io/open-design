/** @module body
 * Parses DESIGN.md bodies into sections, extracts color tokens and palette, and renders the design context digest string consumed by generation prompts.
 * Also owns the `pickSwatchRow` logic that selects the four catalog swatch hex values.
 */
import { extractSwiftColors } from './swift-colors.js';
import type {
  ColorToken,
  DesignSystemArtifactMode,
  DesignSystemProvenance,
  DesignSystemSurface,
  DesignSystemStatus,
  DesignSystemRevisionStatus,
  GeneratedPalette,
  MarkdownSection,
  SwatchRow,
  UserDesignSystemInput,
} from './types.js';

// --- Type guards ---

const KNOWN_SURFACES = new Set<DesignSystemSurface>(['web', 'image', 'video', 'audio']);
const KNOWN_STATUSES = new Set<DesignSystemStatus>(['draft', 'published']);
const KNOWN_REVISION_STATUSES = new Set<DesignSystemRevisionStatus>([
  'pending',
  'accepted',
  'rejected',
]);
const KNOWN_ARTIFACT_MODES = new Set<DesignSystemArtifactMode>(['generated', 'agent-managed']);

/** Returns `true` when `value` is a valid `DesignSystemSurface`. */
export function isDesignSystemSurface(value: string | undefined): value is DesignSystemSurface {
  return value !== undefined && KNOWN_SURFACES.has(value as DesignSystemSurface);
}

/** Returns `true` when `value` is a valid `DesignSystemStatus`. */
export function isDesignSystemStatus(value: string | undefined): value is DesignSystemStatus {
  return value !== undefined && KNOWN_STATUSES.has(value as DesignSystemStatus);
}

/** Returns `true` when `value` is a valid `DesignSystemRevisionStatus`. */
export function isDesignSystemRevisionStatus(
  value: string | undefined,
): value is DesignSystemRevisionStatus {
  return value !== undefined && KNOWN_REVISION_STATUSES.has(value as DesignSystemRevisionStatus);
}

/** Returns `true` when `value` is a valid `DesignSystemArtifactMode`. */
export function isDesignSystemArtifactMode(value: unknown): value is DesignSystemArtifactMode {
  return typeof value === 'string' && KNOWN_ARTIFACT_MODES.has(value as DesignSystemArtifactMode);
}

// --- Text utilities ---

/**
 * Collapses internal whitespace in `raw` and trims it.
 * Returns an empty string when `raw` is not a string.
 *
 * @param raw - Untrusted input string.
 */
export function cleanText(raw: string | undefined): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Normalises a potentially multiline string: normalises line endings, collapses
 * inline whitespace, removes triple+ newlines, and trims the result.
 * Returns an empty string when `raw` is not a string.
 *
 * @param raw - Untrusted (possibly multiline) input string.
 */
export function cleanMultiline(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalises a raw title string, returning `'Untitled Design System'` when
 * the input is blank or absent.
 *
 * @param raw - Title string from user input or DESIGN.md.
 */
export function normalizeTitle(raw: string | undefined): string {
  const title = cleanText(raw);
  return title || 'Untitled Design System';
}

/**
 * Converts `raw` to a URL-safe ASCII slug suitable for directory names.
 * Falls back to `'design-system'` when no alphanumeric characters remain.
 *
 * @param raw - Human-readable string to slugify.
 */
export function slugify(raw: string): string {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return ascii || 'design-system';
}

/**
 * Strips generic design-system boilerplate prefix from a title.
 * Example: `"Design System Inspired by Cohere"` → `"Cohere"`.
 *
 * @param raw - Raw title string (often from a DESIGN.md `#` heading).
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/^Design System (Inspired by|for)\s+/i, '')
    .trim();
}

/**
 * Coerces an unknown value to a deduplicated, trimmed array of non-empty
 * strings, or `undefined` when the input contains none.
 *
 * @param raw - Untrusted value from user input or stored JSON.
 */
export function parseStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = uniqueCleanList(raw.filter((value): value is string => typeof value === 'string'));
  return values.length > 0 ? values : undefined;
}

/**
 * Deduplicates and trims `values`, discarding empty strings and capping the
 * result at 100 entries.
 *
 * @param values - Array of potentially duplicate strings.
 */
export function uniqueCleanList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const clean = cleanText(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 100) break;
  }
  return out;
}

// --- Provenance ---

/**
 * Returns `true` when `provenance` contains at least one non-empty field.
 *
 * @param provenance - Provenance object to check.
 */
export function hasProvenance(provenance: DesignSystemProvenance): boolean {
  return Boolean(
    provenance.companyBlurb
      || provenance.notes
      || provenance.sourceNotes
      || provenance.sourceUrls?.length
      || provenance.githubUrls?.length
      || provenance.localCodeFiles?.length
      || provenance.figFiles?.length
      || provenance.assetFiles?.length,
  );
}

/**
 * Parses and validates an unknown value as a `DesignSystemProvenance`, returning
 * `undefined` when the input is empty or produces no valid fields.
 *
 * @param raw - Untrusted input from an API request or stored JSON.
 */
export function parseProvenance(raw: unknown): DesignSystemProvenance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const githubUrls = parseStringList(value.githubUrls);
  const sourceUrls = parseStringList(value.sourceUrls);
  const localCodeFiles = parseStringList(value.localCodeFiles);
  const figFiles = parseStringList(value.figFiles);
  const assetFiles = parseStringList(value.assetFiles);
  return normalizeProvenance({
    ...(typeof value.companyBlurb === 'string' ? { companyBlurb: value.companyBlurb } : {}),
    ...(githubUrls ? { githubUrls } : {}),
    ...(sourceUrls ? { sourceUrls } : {}),
    ...(localCodeFiles ? { localCodeFiles } : {}),
    ...(figFiles ? { figFiles } : {}),
    ...(assetFiles ? { assetFiles } : {}),
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    ...(typeof value.sourceNotes === 'string' ? { sourceNotes: value.sourceNotes } : {}),
  });
}

/**
 * Normalises a `DesignSystemProvenance` object, merging optional `fallback`
 * fields for `companyBlurb` and `sourceNotes`. Returns `undefined` when the
 * result contains no meaningful content.
 *
 * @param raw - Existing provenance to normalise.
 * @param fallback - Fallback values applied when `raw` fields are blank.
 */
export function normalizeProvenance(
  raw?: DesignSystemProvenance,
  fallback: { companyBlurb?: string; sourceNotes?: string } = {},
): DesignSystemProvenance | undefined {
  const companyBlurb = cleanMultiline(raw?.companyBlurb) || cleanMultiline(fallback.companyBlurb);
  const githubUrls = uniqueCleanList(raw?.githubUrls);
  const sourceUrls = uniqueCleanList(raw?.sourceUrls);
  const localCodeFiles = uniqueCleanList(raw?.localCodeFiles);
  const figFiles = uniqueCleanList(raw?.figFiles);
  const assetFiles = uniqueCleanList(raw?.assetFiles);
  const notes = cleanMultiline(raw?.notes);
  const sourceNotes = cleanMultiline(raw?.sourceNotes) || cleanMultiline(fallback.sourceNotes);
  const provenance: DesignSystemProvenance = {
    ...(sourceUrls ? { sourceUrls } : {}),
    ...(companyBlurb ? { companyBlurb } : {}),
    ...(githubUrls.length > 0 ? { githubUrls } : {}),
    ...(localCodeFiles.length > 0 ? { localCodeFiles } : {}),
    ...(figFiles.length > 0 ? { figFiles } : {}),
    ...(assetFiles.length > 0 ? { assetFiles } : {}),
    ...(notes ? { notes } : {}),
    ...(sourceNotes ? { sourceNotes } : {}),
  };
  return hasProvenance(provenance) ? provenance : undefined;
}

/**
 * Serialises a `DesignSystemProvenance` to a human-readable plain-text block
 * suitable for embedding in prompts or README files.
 *
 * @param provenance - Provenance to serialise, or `undefined`.
 * @returns Multi-line string, empty string when `provenance` is undefined.
 */
export function provenanceToNotes(provenance: DesignSystemProvenance | undefined): string {
  if (!provenance) return '';
  const lines: string[] = [];
  if (provenance.companyBlurb) lines.push(`Company/product context: ${provenance.companyBlurb}`);
  if (provenance.githubUrls?.length) lines.push(`GitHub/code links: ${provenance.githubUrls.join(', ')}`);
  if (provenance.localCodeFiles?.length) lines.push(`Local code references: ${provenance.localCodeFiles.join(', ')}`);
  if (provenance.figFiles?.length) lines.push(`Figma files: ${provenance.figFiles.join(', ')}`);
  if (provenance.assetFiles?.length) lines.push(`Fonts, logos and assets: ${provenance.assetFiles.join(', ')}`);
  if (provenance.notes) lines.push(`Additional notes: ${provenance.notes}`);
  if (provenance.sourceNotes && !lines.includes(provenance.sourceNotes)) {
    lines.push(provenance.sourceNotes);
  }
  return lines.join('\n');
}

// --- Body utilities ---

/**
 * Trims `raw` and appends a trailing newline. Returns `null` when `raw` is not
 * a string or collapses to empty.
 *
 * @param raw - Raw DESIGN.md content from user input or storage.
 */
export function normalizeBody(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const body = raw.trim();
  return body.length > 0 ? `${body}\n` : null;
}

/**
 * Extracts the text content of the first `# H1` heading in `raw`.
 * Returns `null` when no heading is found.
 *
 * @param raw - Markdown body to scan.
 */
export function firstHeading(raw: string): string | null {
  return /^#\s+(.+?)\s*$/m.exec(raw)?.[1]?.trim() ?? null;
}

/**
 * Updates the `# H1` heading in `body` to `input.title`, then upserts
 * `> Category:` and `> Surface:` blockquote meta lines beneath it.
 *
 * @param body - Existing DESIGN.md content.
 * @param input - Desired title, category, and surface values.
 * @returns Updated body ending with a newline.
 */
export function withDesignSystemHeader(
  body: string,
  input: { title: string; category: string; surface: DesignSystemSurface },
): string {
  let next = body.replace(/^#\s+.*$/m, `# ${input.title}`);
  if (next === body && !/^#\s+/.test(next)) next = `# ${input.title}\n\n${next}`;
  next = upsertBlockquoteMeta(next, 'Category', input.category);
  next = upsertBlockquoteMeta(next, 'Surface', input.surface);
  return next.endsWith('\n') ? next : `${next}\n`;
}

/**
 * Upserts a `> Key: Value` blockquote metadata line in `body`.
 * Updates in place when the key is found; otherwise inserts after the first H1.
 *
 * @param body - Markdown body to modify.
 * @param key - Metadata key (e.g. `'Category'`).
 * @param value - New value for the key.
 */
export function upsertBlockquoteMeta(body: string, key: string, value: string): string {
  const re = new RegExp(`^>\\s*${key}:\\s*.*$`, 'im');
  if (re.test(body)) return body.replace(re, `> ${key}: ${value}`);
  const h1 = /^#\s+.*$/m.exec(body);
  if (!h1) return `> ${key}: ${value}\n\n${body}`;
  const insertAt = h1.index + h1[0].length;
  return `${body.slice(0, insertAt)}\n> ${key}: ${value}${body.slice(insertAt)}`;
}

/**
 * Generates a 9-section draft DESIGN.md scaffold from `input`.
 * Used when `createUserDesignSystem` receives no `body`.
 *
 * @param input - Required `title` plus optional scaffold hints from the API input.
 */
export function buildDraftDesignSystemBody(input: UserDesignSystemInput & { title: string }): string {
  const category = cleanText(input.category) || 'Custom';
  const surface = input.surface ?? 'web';
  const summary = cleanText(input.summary) || 'A user-authored design system for future Open Design projects.';
  const sourceNotes = cleanText(input.sourceNotes);
  return `# ${input.title}

> Category: ${category}
> Surface: ${surface}

${summary}

## 1. Visual Theme & Atmosphere

Describe the visual mood, product context, and the feeling this system should create.
${sourceNotes ? `\nSource context: ${sourceNotes}\n` : ''}
## 2. Color

List brand colors, semantic roles, background surfaces, text colors, borders, and states.

## 3. Typography

Define display, heading, body, caption, and code typography. Include fallback stacks.

## 4. Spacing

Define the spacing scale, density, radius, and layout rhythm.

## 5. Layout & Composition

Describe grids, page structure, information density, navigation, and responsive behavior.

## 6. Components

Document buttons, cards, forms, tables, navigation, modals, and product-specific components.

## 7. Motion & Interaction

Define hover, focus, loading, transition, and reduced-motion behavior.

## 8. Voice & Brand

Describe copy style, terminology, capitalization, and tone.

## 9. Anti-patterns

List visual and interaction choices the agent must avoid when generating with this system.
`;
}

// --- Markdown analysis ---

/**
 * Extracts the first paragraph after the H1 heading as a short summary string.
 * Strips `> Category:` and `> Surface:` blockquote lines before extraction.
 * Returns `''` when the body has no H1 or the following paragraph is empty.
 *
 * @param raw - Full DESIGN.md content.
 */
export function summarize(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 === -1) return '';
  const afterH1 = lines.slice(firstH1 + 1);
  const nextHeading = afterH1.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? afterH1 : afterH1.slice(0, nextHeading))
    .join('\n')
    .replace(/^>\s*Category:.*$/gim, '')
    .replace(/^>\s*Surface:.*$/gim, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
}

/**
 * Extracts the `> Category: <value>` blockquote field from `raw`.
 * Returns `undefined` when the field is absent.
 *
 * @param raw - DESIGN.md content.
 */
export function extractCategory(raw: string): string | undefined {
  const m = /^>\s*Category:\s*(.+?)\s*$/im.exec(raw);
  return m?.[1];
}

/**
 * Extracts the `> Surface: <value>` blockquote field and validates it as a
 * `DesignSystemSurface`. Returns `undefined` when absent or invalid.
 *
 * @param raw - DESIGN.md content.
 */
export function extractSurface(raw: string): DesignSystemSurface | undefined {
  const m = /^>\s*Surface:\s*(.+?)\s*$/im.exec(raw);
  if (!m) return undefined;
  const v = m[1]?.trim().toLowerCase();
  return isDesignSystemSurface(v) ? v : undefined;
}

/**
 * Splits `body` into `##`-level sections. Each section's body spans from
 * after its heading to before the next `##` heading.
 *
 * @param body - Full DESIGN.md content.
 * @returns Array of `{title, body}` objects, one per `##` section.
 */
export function extractMarkdownSections(body: string): MarkdownSection[] {
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length === 0) return [];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    return {
      title: match[1]?.replace(/^\d+\.\s*/, '').trim() || 'Section',
      body: body.slice(start, end).trim(),
    };
  });
}

// --- Color / swatch extraction ---

/**
 * Normalises a CSS hex color string (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`)
 * to lowercase 6- or 8-character `#xxxxxxxx` form.
 * Returns `null` for any non-hex input.
 *
 * @param raw - Raw hex string from user input or DESIGN.md.
 */
export function normalizeHex(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? '';
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('').slice(0, 8);
  return '#' + hex.toLowerCase();
}

/**
 * Picks a 4-slot `[background, border, foreground, accent]` swatch row from
 * `colors` using semantic name hints. Falls back to neutral detection when
 * semantic hints find no match.
 *
 * @param colors - Named color tokens extracted from DESIGN.md.
 * @returns A `SwatchRow` with 4 hex values and a `filledAllSlots` flag.
 */
export function pickSwatchRow(colors: ColorToken[]): SwatchRow {
  /** Searches for the first color whose name includes any of the provided hints. */
  function pick(hints: string[]): string | null {
    for (const h of hints) {
      const found = colors.find((c) => c.name.includes(h));
      if (found) return found.value;
    }
    return null;
  }
  /** Returns true when the RGB components of a hex color are within 10 levels of each other (grayscale-like). */
  function isNeutral(hex: string): boolean {
    if (!/^#[0-9a-f]{6}$/.test(hex)) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 10;
  }

  const bgHit = pick(['page background', 'background', 'canvas', 'paper', 'surface']);
  const fgHit = pick(['heading', 'foreground', 'ink', 'fg', 'text', 'navy', 'graphite']);
  const accentHit = pick(['primary brand', 'brand primary', 'accent', 'brand', 'primary']);
  const supportHit = pick(['border', 'divider', 'rule', 'muted', 'secondary', 'subtle']);

  const bg = bgHit ?? '#ffffff';
  const fg = fgHit ?? '#111111';
  const accent =
    accentHit
    ?? colors.find((c) => !isNeutral(c.value))?.value
    ?? colors[0]?.value
    ?? '#888888';
  const support =
    supportHit
    ?? colors.find(
      (c) => isNeutral(c.value) && c.value !== bg && c.value !== fg,
    )?.value
    ?? '#cccccc';

  const filledAllSlots =
    bgHit !== null && fgHit !== null && accentHit !== null && supportHit !== null;
  return { values: [bg, support, fg, accent], filledAllSlots };
}

/**
 * Scans `raw` for hex color references using three regex passes (label-colon,
 * bold-label, and table cells) plus Swift color extraction, then returns a
 * 4-element swatch array.
 *
 * @param raw - Full DESIGN.md content to scan.
 * @returns Array of up to 4 hex color strings.
 */
export function extractSwatches(raw: string): string[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  /** Normalizes a color token, validates its hex value, and adds it to the accumulator if not already present. */
  function push(name: string, value: string): void {
    const cleanName = name.replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const v = normalizeHex(value);
    if (!v || cleanName.length > 60) return;
    const key = `${cleanName}|${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: cleanName, value: v });
  }
  const reA = /^[\s>*-]*\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*[:：]?\s*\**\s*[:：]?\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m;
  while ((m = reA.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  const reB = /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  const reC = /^[ \t]*\|(.+)\|[ \t]*$/gm;
  while ((m = reC.exec(raw)) !== null) {
    const cells = (m[1] ?? '').split('|').map((cell) => cell.trim());
    const hexCell = cells.find((cell) => /#[0-9a-fA-F]{3,8}\b/.test(cell));
    if (!hexCell) continue;
    const hex = hexCell.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? '';
    const nameCell = cells.find(
      (cell) => cell.length > 0 && !/#[0-9a-fA-F]{3,8}/.test(cell) && !/^[-:\s]+$/.test(cell),
    );
    push(nameCell ?? '', hex);
  }
  for (const token of extractSwiftColors(raw)) push(token.name, token.hex);
  if (colors.length === 0) return [];
  return pickSwatchRow(colors).values;
}

/**
 * Derives a `GeneratedPalette` from `body` by extracting swatches and applying
 * semantic fallback values for each palette role.
 *
 * @param body - DESIGN.md content to extract swatches from.
 */
export function normalizeSwatches(body: string): GeneratedPalette {
  const [background, border, foreground, accent] = extractSwatches(body);
  return {
    background: background ?? '#fbfaf7',
    border: border ?? '#ddd8d0',
    foreground: foreground ?? '#1f1d1b',
    accent: accent ?? '#d66f4d',
    muted: '#706b65',
    success: '#5d8f5a',
  };
}

// --- HTML escape helpers ---

/**
 * Escapes HTML special characters (`&`, `<`, `>`, `"`, `'`) in `raw`.
 *
 * @param raw - Plain text to escape.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serialises `raw` to a JSON string with `<`, `>`, and `&` Unicode-escaped
 * so the value is safe to embed in a `<script>` block.
 *
 * @param raw - String to embed as a JSON literal in HTML.
 */
export function scriptJson(raw: string): string {
  return JSON.stringify(raw)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Strips `{`, `}`, `<`, and `>` from `raw` to make it safe for embedding
 * inside JSX text nodes.
 *
 * @param raw - String to sanitise for JSX text output.
 */
export function escapeTsxText(raw: string): string {
  return raw.replace(/[{}<>]/g, '');
}

/**
 * Escapes backslashes and single-quotes in `raw` so it can be embedded in a
 * single-quoted JavaScript string literal.
 *
 * @param raw - String to escape.
 */
export function escapeJsString(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// --- Renderers ---

/**
 * Renders the `README.md` for a user design system, including product overview,
 * palette summary, captured section headings, and generated file inventory.
 *
 * @param input - Design-system metadata and extracted content.
 */
export function renderReadme(input: {
  title: string;
  category: string;
  surface: DesignSystemSurface;
  summary: string;
  sourceNotes?: string;
  provenance?: DesignSystemProvenance;
  palette: GeneratedPalette;
  sections: MarkdownSection[];
}): string {
  const notes = provenanceToNotes(input.provenance) || cleanMultiline(input.sourceNotes);
  const sectionLines = input.sections
    .slice(0, 8)
    .map((section) => `- ${section.title}`)
    .join('\n');
  return `# ${input.title}

A reusable Open Design package for ${input.title}.

## Product Overview

${input.summary} This design-system package is designed for product, app, workspace, and platform surfaces that need a reusable visual direction rather than a one-off mockup. It provides a concrete token layer, focused preview cards, and an applied UI kit so future agents can build interfaces with the same hierarchy, density, component roles, and interaction rules captured in DESIGN.md.

## Package Overview

- Category: ${input.category}
- Surface: ${input.surface}
- Primary accent: ${input.palette.accent}
- Background: ${input.palette.background}
- Foreground: ${input.palette.foreground}

## Captured Foundations

${sectionLines || '- Visual foundations\n- Component guidance\n- Brand usage'}

## Generated Files

- DESIGN.md: canonical design system source.
- colors_and_type.css: reusable CSS variables for color and type.
- preview/: focused HTML review cards for color themes, typography, spacing, components, and brand assets.
- assets/: logo and brand asset references.
- context/: structured source context captured during setup.
- ui_kits/app/: applied interface preview and UI-kit notes.
- SKILL.md: agent-facing usage instructions.
${notes ? `\n## Source Context\n\n${notes}\n` : ''}
`;
}

/**
 * Renders the `context/provenance.md` file for a design system.
 * Outputs a structured Markdown document with all captured provenance sections.
 *
 * @param provenance - Provenance object, or `undefined` for the no-context message.
 * @param title - Design-system title for the document heading.
 */
export function renderProvenanceMarkdown(
  provenance: DesignSystemProvenance | undefined,
  title: string,
): string {
  if (!provenance) {
    return `# ${title} Source Context\n\nNo structured source context was captured for this design system.\n`;
  }
  const sections = [
    provenance.companyBlurb ? `## Company / Product\n\n${provenance.companyBlurb}` : '',
    provenance.githubUrls?.length
      ? `## GitHub / Code Links\n\n${provenance.githubUrls.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.localCodeFiles?.length
      ? `## Local Code References\n\n${provenance.localCodeFiles.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.figFiles?.length
      ? `## Figma Files\n\n${provenance.figFiles.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.assetFiles?.length
      ? `## Fonts, Logos and Assets\n\n${provenance.assetFiles.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.notes ? `## Notes\n\n${provenance.notes}` : '',
    provenance.sourceNotes ? `## Flattened Source Notes\n\n${provenance.sourceNotes}` : '',
  ].filter(Boolean);
  return `# ${title} Source Context\n\n${sections.join('\n\n')}\n`;
}

/**
 * Renders the `SKILL.md` file that tells agents how to use the design system.
 *
 * @param input - Title, summary, and resolved palette for the skill file.
 */
export function renderSkill(input: {
  title: string;
  summary: string;
  palette: GeneratedPalette;
}): string {
  const skillName = slugify(input.title);
  return `---
name: ${skillName}
description: Use this skill when generating Open Design artifacts that should follow ${input.title}.
user-invocable: true
---

Read README.md, DESIGN.md, colors_and_type.css, preview/, preserved assets, context evidence, and ui_kits/app/ before generating any new interface.

**What's inside:**
- DESIGN.md as the canonical source-backed rules document.
- colors_and_type.css as the reusable token stylesheet.
- preview/ focused review cards for color, typography, spacing, components, and brand assets.
- ui_kits/app/ as a browser-reviewable applied interface kit with modular role components.
- context/ provenance and evidence notes for future refreshes.

**Source context:**
${input.summary}

**When to use this skill:**
- Creating product-like prototypes that should follow ${input.title}.
- Revising focused design-system preview cards or app UI kit components.
- Building interfaces that need this package's captured density, hierarchy, tokens, and anti-patterns.

**How to use:**
1. Read DESIGN.md for product context, foundations, components, motion, voice, and anti-patterns.
2. Load colors_and_type.css instead of hardcoding palette, typography, radius, or spacing values.
3. Inspect preview/ cards for focused modules before inventing new styling.
4. Reuse ui_kits/app/index.html and ui_kits/app/components/ as the applied component composition.
5. Preserve the product context, hierarchy, density, and anti-patterns documented in DESIGN.md.

**Design system highlights:**

- Background: ${input.palette.background}
- Foreground: ${input.palette.foreground}
- Accent: ${input.palette.accent}
- Border: ${input.palette.border}
`;
}

/**
 * Renders the `ui_kits/app/README.md` usage guide for an applied UI kit.
 *
 * @param title - Design-system title.
 */
export function renderUiKitReadme(title: string): string {
  return `# ${title} UI Kit

This UI kit is the applied interface reference for the design system. Open \`index.html\` to review the composed app surface, then reuse the modular role components under \`components/\` when building new product-like artifacts.

## Structure

- \`index.html\` - Browser-reviewable entry that loads \`../../colors_and_type.css\`, React, ReactDOM, Babel, and the component files.
- \`components/App.jsx\` - App shell that composes the role components.
- \`components/Sidebar.jsx\` - Navigation rail or sidebar pattern.
- \`components/AssistantsList.jsx\` - Object, assistant, or thread list pattern.
- \`components/ChatArea.jsx\` - Primary workspace with message/content stream.
- \`components/InputBar.jsx\` - Composer or command-entry surface.
- \`components/MessageBubble.jsx\` - Message, note, or review-comment unit.

## Usage

Copy component files into a React prototype or open \`index.html\` directly for visual review. Keep \`colors_and_type.css\` loaded before the components so color, type, spacing, radius, and state variables resolve through the extracted token contract.

## Design Notes

Prefer source-backed component roles over static duplicate HTML. When repository evidence is available, replace this scaffold with components modeled from captured app shell, navigation, composer, message, and content surfaces.

## Source

Use parent \`DESIGN.md\`, \`README.md\`, \`preview/\`, and \`context/\` as the evidence trail for any future refinement.
`;
}

/**
 * Renders the `colors_and_type.css` token stylesheet, mapping palette values
 * to both brand-namespaced and semantic Open Design CSS custom properties.
 *
 * @param input - Title (used for the CSS namespace slug) and resolved palette.
 */
export function renderCssTokens(input: { title: string; palette: GeneratedPalette }): string {
  const slug = slugify(input.title);
  return `:root {
  --${slug}-background: ${input.palette.background};
  --${slug}-surface: #ffffff;
  --${slug}-surface-muted: #f4f1ec;
  --${slug}-foreground: ${input.palette.foreground};
  --${slug}-muted: ${input.palette.muted};
  --${slug}-border: ${input.palette.border};
  --${slug}-accent: ${input.palette.accent};
  --${slug}-success: ${input.palette.success};
  --${slug}-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --${slug}-font-serif: Georgia, "Times New Roman", serif;
  --${slug}-font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --${slug}-radius-sm: 6px;
  --${slug}-radius-md: 10px;
  --${slug}-radius-lg: 16px;
  --${slug}-space-1: 4px;
  --${slug}-space-2: 8px;
  --${slug}-space-3: 12px;
  --${slug}-space-4: 16px;
  --${slug}-space-6: 24px;
  --${slug}-space-8: 32px;

  --color-background: var(--${slug}-background);
  --color-surface: var(--${slug}-surface);
  --color-background-soft: var(--${slug}-surface-muted);
  --color-text: var(--${slug}-foreground);
  --color-text-1: var(--${slug}-foreground);
  --color-text-secondary: var(--${slug}-muted);
  --color-border: var(--${slug}-border);
  --color-primary: var(--${slug}-accent);
  --color-primary-soft: color-mix(in srgb, var(--${slug}-accent) 14%, transparent);
  --font-family: var(--${slug}-font-sans);
  --code-font-family: var(--${slug}-font-mono);
  --radius-control: var(--${slug}-radius-sm);
  --radius-card: var(--${slug}-radius-md);
  --space-2: var(--${slug}-space-2);
  --space-3: var(--${slug}-space-3);
  --space-4: var(--${slug}-space-4);
}

.od-design-system-preview {
  color: var(--${slug}-foreground);
  background: var(--${slug}-background);
  font-family: var(--${slug}-font-sans);
}
`;
}

/**
 * Renders a monochrome SVG logo using the first two words of `title` as
 * initials on an accent-coloured circle against the palette background.
 *
 * @param title - Design-system title.
 * @param palette - Resolved colour palette used for the logo colours.
 */
export function renderLogoSvg(title: string, palette: GeneratedPalette): string {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'OD';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160" role="img" aria-label="${escapeHtml(title)}">
  <rect width="320" height="160" rx="28" fill="${palette.background}"/>
  <circle cx="84" cy="80" r="38" fill="${palette.accent}"/>
  <text x="84" y="92" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeHtml(initials)}</text>
  <text x="140" y="88" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" fill="${palette.foreground}">${escapeHtml(title)}</text>
</svg>
`;
}

/**
 * Renders a minimal React TSX file exporting a `DesignSystemReference` component
 * that references `title` and delegates to DESIGN.md for actual styling.
 *
 * @param title - Design-system title to embed in the component.
 */
export function renderReferenceComponent(title: string): string {
  return `export function DesignSystemReference() {
  return (
    <section className="od-design-system-preview">
      <h1>${escapeTsxText(title)}</h1>
      <p>Use DESIGN.md and colors_and_type.css as the source of truth.</p>
    </section>
  );
}
`;
}

/**
 * @internal
 * Wraps `body` HTML in a full HTML document with the shared design-token CSS
 * custom properties injected into `:root`.
 */
function renderHtmlDocument(title: string, body: string, palette: GeneratedPalette): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: ${palette.background};
      --surface: #fff;
      --fg: ${palette.foreground};
      --muted: ${palette.muted};
      --border: ${palette.border};
      --accent: ${palette.accent};
    }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg); font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(960px, calc(100vw - 48px)); margin: 48px auto; }
    h1 { margin: 0 0 14px; font-size: 42px; line-height: 1.04; letter-spacing: 0; }
    h2 { margin: 32px 0 14px; font-size: 26px; }
    h3 { margin: 0; font-size: 20px; }
    p { color: var(--muted); }
    .lead { max-width: 680px; font-size: 19px; }
    .eyebrow { margin: 0 0 10px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .palette, .swatch-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 32px 0; }
    .swatch { min-height: 126px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
    .swatch b { display: block; height: 76px; background: var(--color); border-bottom: 1px solid var(--border); }
    .swatch span { display: block; padding: 10px 12px 2px; font-weight: 700; }
    .swatch code { display: block; padding: 0 12px 12px; color: var(--muted); }
    .section-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0; list-style: none; }
    .section-list li, article { display: grid; gap: 6px; padding: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .section-list span, article span { color: var(--muted); }
    .type-sample { border-bottom: 1px solid var(--border); padding: 26px 0; }
    .type-sample small { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .spacing-list { display: grid; gap: 16px; margin: 28px 0; }
    .spacing-list div { display: grid; grid-template-columns: 100px 60px 1fr; gap: 16px; align-items: center; }
    .spacing-list b { display: block; height: 22px; border-radius: 4px; background: var(--accent); }
    .radius-list { display: flex; gap: 16px; }
    .radius-list span { width: 96px; height: 72px; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); }
    .logo-frame { padding: 34px; margin: 20px 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .logo-frame.dark { background: var(--fg); }
    .component-preview { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 96px); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .component-preview aside { display: grid; align-content: start; gap: 10px; padding: 20px; background: #f3f1ec; border-right: 1px solid var(--border); }
    button { border: 1px solid var(--border); background: var(--surface); color: var(--fg); border-radius: 7px; padding: 10px 14px; font-weight: 700; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .component-preview section { padding: 48px; }
    .component-row { display: flex; gap: 10px; margin: 24px 0; }
    .component-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 28px 0; }
    .component-grid label { display: grid; gap: 8px; color: var(--muted); font-size: 13px; }
    input, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border); background: var(--surface); color: var(--fg); border-radius: 7px; padding: 10px 12px; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    @media (max-width: 760px) { .palette, .swatch-grid, .section-list, .component-preview, .component-grid { grid-template-columns: 1fr; } main { width: min(100vw - 28px, 960px); margin: 24px auto; } }
  </style>
</head>
<body>${body}</body>
</html>
`;
}

/**
 * @internal
 * Renders a single colour swatch card for use in preview HTML pages.
 */
function renderSwatch(name: string, value: string): string {
  return `<div class="swatch" style="--color:${escapeHtml(value)}"><b></b><span>${escapeHtml(name)}</span><code>${escapeHtml(value)}</code></div>`;
}

/**
 * Renders `preview/overview.html` — a full-page summary showing the palette,
 * product description, and captured section list.
 *
 * @param title - Design-system title.
 * @param summary - Short product description.
 * @param palette - Resolved colour palette.
 * @param sections - Extracted DESIGN.md sections (first 6 used).
 */
export function renderOverviewHtml(
  title: string,
  summary: string,
  palette: GeneratedPalette,
  sections: MarkdownSection[],
): string {
  const items = sections
    .slice(0, 6)
    .map((section) => `<li><strong>${escapeHtml(section.title)}</strong><span>${escapeHtml(section.body.slice(0, 160) || 'Needs review.')}</span></li>`)
    .join('');
  return renderHtmlDocument(
    title,
    `<main class="overview">
      <p class="eyebrow">Open Design system</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(summary)}</p>
      <div class="palette">
        ${renderSwatch('Background', palette.background)}
        ${renderSwatch('Border', palette.border)}
        ${renderSwatch('Foreground', palette.foreground)}
        ${renderSwatch('Accent', palette.accent)}
      </div>
      <ul class="section-list">${items}</ul>
    </main>`,
    palette,
  );
}

/**
 * Renders a colour preview HTML page (`preview/colors-*.html`) showing 8
 * named palette swatches.
 *
 * @param title - Page title embedded in the document `<title>` and heading.
 * @param palette - Colour palette to display.
 */
export function renderColorPreviewHtml(title: string, palette: GeneratedPalette): string {
  const colors: Array<[string, string]> = [
    ['Background', palette.background],
    ['Surface', '#ffffff'],
    ['Foreground', palette.foreground],
    ['Muted', palette.muted],
    ['Border', palette.border],
    ['Accent', palette.accent],
    ['Success', palette.success],
    ['Subtle', '#f4f1ec'],
  ];
  return renderHtmlDocument(
    title,
    `<main>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="swatch-grid">${colors.map(([name, value]) => renderSwatch(name, value)).join('')}</div>
    </main>`,
    palette,
  );
}

/**
 * Renders `preview/typography-specimens.html` with H1–H3 and body copy samples.
 *
 * @param title - Design-system title used in the H1 sample.
 */
export function renderTypographyPreviewHtml(title: string): string {
  return renderHtmlDocument(
    'Typography Scale',
    `<main>
      <p class="eyebrow">Typography Scale</p>
      <div class="type-sample"><small>h1 - 40px/Bold</small><h1>${escapeHtml(title)}</h1></div>
      <div class="type-sample"><small>h2 - 32px/Bold</small><h2>Product Workspace</h2></div>
      <div class="type-sample"><small>h3 - 24px/Semibold</small><h3>Component Review</h3></div>
      <div class="type-sample"><small>body - 16px/Regular</small><p>Clear hierarchy, balanced density, and durable system defaults.</p></div>
    </main>`,
    normalizeSwatches(''),
  );
}

/**
 * Renders `preview/spacing-*.html` with a spacing scale bar chart and radius
 * examples.
 *
 * @param title - Heading to display on the preview page.
 */
export function renderSpacingPreviewHtml(title = 'Spacing and Radius'): string {
  const spaces = [4, 8, 12, 16, 24, 32, 40, 48];
  return renderHtmlDocument(
    title,
    `<main>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="spacing-list">
        ${spaces.map((space) => `<div><code>space-${space / 4}</code><span>${space}px</span><b style="width:${space * 2}px"></b></div>`).join('')}
      </div>
      <h2>Border Radius</h2>
      <div class="radius-list"><span style="border-radius:6px">6px</span><span style="border-radius:10px">10px</span><span style="border-radius:16px">16px</span></div>
    </main>`,
    normalizeSwatches(''),
  );
}

/**
 * Renders a component catalogue preview page with either button or input controls
 * depending on `title`.
 *
 * @param title - Card heading (drives the input/button branch).
 * @param systemTitle - Design-system name.
 * @param summary - Short description shown below the heading.
 * @param palette - Resolved colour palette.
 */
export function renderComponentCatalogHtml(
  title: string,
  systemTitle: string,
  summary: string,
  palette: GeneratedPalette,
): string {
  const isInputs = title.toLowerCase().includes('input');
  return renderHtmlDocument(
    title,
    `<main>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(systemTitle)}</h1>
      <p class="lead">${escapeHtml(summary)}</p>
      <section class="component-grid">
        ${isInputs
          ? `<label><span>Label</span><input value="Source-backed field" /></label><label><span>Search</span><input placeholder="Search components" /></label><textarea>Helpful multiline content.</textarea>`
          : `<button class="primary">Primary action</button><button>Secondary action</button><button class="ghost">Icon action</button>`}
      </section>
    </main>`,
    palette,
  );
}

/**
 * Renders `preview/brand-assets.html` showing the generated SVG logo on light
 * and dark backgrounds.
 *
 * @param title - Design-system title.
 * @param palette - Resolved colour palette.
 */
export function renderLogoPreviewHtml(title: string, palette: GeneratedPalette): string {
  return renderHtmlDocument(
    'Logo Variants',
    `<main>
      <p class="eyebrow">Logo Variants</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="logo-frame">${renderLogoSvg(title, palette)}</div>
      <div class="logo-frame dark">${renderLogoSvg(title, { ...palette, background: palette.foreground, foreground: '#ffffff' })}</div>
    </main>`,
    palette,
  );
}

/**
 * Renders `ui_kits/app/index.html` — the React-based applied UI kit entry point.
 * The `componentSpecs` parameter determines which component `<script>` tags are
 * emitted; `App` is always placed last so all role components resolve before it.
 *
 * @param title - Design-system title displayed in the page title and App prop.
 * @param summary - Short product description passed as `summary` prop to `App`.
 * @param palette - Resolved colour palette for the `:root` token block.
 * @param componentSpecs - Ordered list of component file/name pairs to load.
 */
export function renderComponentPreviewHtml(
  title: string,
  summary: string,
  palette: GeneratedPalette,
  componentSpecs: Array<{ fileName: string; componentName: string }>,
): string {
  const nonApp = componentSpecs.filter((spec) => spec.componentName !== 'App');
  const appSpec = componentSpecs.filter((spec) => spec.componentName === 'App');
  const componentScripts = [...nonApp, ...appSpec]
    .map((spec) => `  <script type="text/babel" src="components/${spec.fileName}"></script>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} Interface</title>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
  <link rel="stylesheet" href="../../colors_and_type.css" />
  <style>
    :root {
      color-scheme: light;
      --ui-kit-bg: ${palette.background};
      --ui-kit-surface: #fff;
      --ui-kit-fg: ${palette.foreground};
      --ui-kit-muted: ${palette.muted};
      --ui-kit-border: ${palette.border};
      --ui-kit-accent: ${palette.accent};
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--color-background, var(--ui-kit-bg));
      color: var(--color-text-1, var(--ui-kit-fg));
      font: 14px/1.5 var(--font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    }
    #root { min-height: 100vh; }
    .ui-kit-loading {
      display: grid;
      min-height: 100vh;
      place-items: center;
      color: var(--color-text-secondary, var(--ui-kit-muted));
    }
  </style>
</head>
<body>
  <div id="root"><div class="ui-kit-loading">Loading ${escapeHtml(title)} UI kit...</div></div>
${componentScripts}
  <script type="text/babel">
    const App = window.App;
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App title={${scriptJson(title)}} summary={${scriptJson(summary)}} />);
  </script>
</body>
</html>
`;
}
