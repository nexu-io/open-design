// parseDesignMd — turn a DESIGN.md document into the structured modules the
// brand.html-style kit view renders (palette, typography, voice, imagery,
// layout) plus identity (name / tagline / description).
//
// It is deliberately HEURISTIC, not a strict mirror of any single emitter,
// because DESIGN.md comes in several shapes:
//   - brand-generated user systems (apps/daemon/src/brands/design-md.ts):
//     `## Color Palette` markdown table, `## Typography` font lines,
//     `## Voice & Tone`, `## Imagery`, `## Layout`.
//   - bundled official presets (design-systems/*/DESIGN.md): bullet lists under
//     `## Color Palette & Roles` / `## 2. Color`, `## Typography Rules` /
//     `## 3. Typography` with `Families: primary=…`, numbered headings, etc.
// Every field is best-effort: a section we cannot read just yields an empty
// module (which the kit view renders as a blank/upload state).
//
// Pure TypeScript — no React, DOM, or provider imports — so it is unit-testable
// and safe to reuse across surfaces.

export interface ParsedColor {
  role: string;
  name: string;
  hex: string;
  usage: string;
}

export interface ParsedFont {
  family: string;
  fallbacks: string[];
  weights: number[];
}

export interface ParsedVoice {
  adjectives: string[];
  tone: string;
  messagingPillars: string[];
  vocabulary: { use: string[]; avoid: string[] };
}

export interface ParsedImagery {
  style: string;
  subjects: string[];
  treatment: string;
  avoid: string[];
}

export interface ParsedLayout {
  radius: string;
  borderWeight: string;
  spacing: string;
  postureRules: string[];
}

export interface ParsedDesignMd {
  name: string;
  tagline: string;
  description: string;
  category: string;
  surface: string;
  colors: ParsedColor[];
  typography: { display?: ParsedFont; body?: ParsedFont; mono?: ParsedFont };
  voice: ParsedVoice;
  imagery: ParsedImagery;
  layout: ParsedLayout;
}

interface Section {
  title: string;
  content: string;
}

const HEX_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;

/** Strip markdown emphasis, backticks and surrounding quotes from a fragment. */
function clean(value: string): string {
  return value
    .replace(/`+/g, '')
    .replace(/\*\*/g, '')
    .replace(/[*_]/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

function splitList(value: string): string[] {
  return value
    .split(/[,;·•]/)
    .map((part) => clean(part))
    .filter((part) => part.length > 0 && !/^\(none/i.test(part));
}

/** Split a DESIGN.md body into a preamble (before the first `##`) plus a list of
 *  `## ` sections. Numeric prefixes (`## 2. Color`) are stripped from titles. */
function splitDocument(body: string): { preamble: string; sections: Section[] } {
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length === 0) return { preamble: body, sections: [] };
  const preamble = body.slice(0, matches[0]!.index ?? 0);
  const sections = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const title = (match[1] ?? '').replace(/^\d+[.)]\s*/, '').trim();
    return { title, content: body.slice(start, end).trim() };
  });
  return { preamble, sections };
}

function findSection(sections: Section[], ...keywords: string[]): Section | undefined {
  return sections.find((section) => {
    const normalized = section.title.toLowerCase();
    return keywords.some((kw) => normalized.includes(kw));
  });
}

function splitFrontmatter(body: string): { frontmatter: string; rest: string } {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: '', rest: body };
  return { frontmatter: match[1] ?? '', rest: body.slice(match[0].length) };
}

function frontmatterScalar(frontmatter: string, key: string): string {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? clean(match[1] ?? '') : '';
}

/** Frontmatter `colors:` map (`  key: "#hex"`) → ParsedColor[]. */
function frontmatterColors(frontmatter: string): ParsedColor[] {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => /^colors:\s*$/.test(line));
  if (start < 0) return [];
  const out: ParsedColor[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!/^\s+\S/.test(line)) break; // dedent → end of the map
    const match = line.match(/^\s+([^:]+):\s*(.+)$/);
    if (!match) continue;
    const name = clean(match[1] ?? '');
    const hex = (clean(match[2] ?? '').match(HEX_RE) ?? [])[0];
    if (hex) out.push({ role: name, name: titleCase(name), hex: hex.toLowerCase(), usage: '' });
  }
  return out;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Map a human label onto one of the seven semantic roles for ordering/labels. */
function inferRole(label: string): string {
  const l = label.toLowerCase();
  if (/(background|canvas|page|paper)/.test(l)) return 'background';
  if (/(surface|card|panel|elevated)/.test(l)) return 'surface';
  if (/(foreground|text|ink|body|heading|content|on-)/.test(l)) return 'foreground';
  if (/(muted|secondary text|metadata|caption|subtle|slate)/.test(l)) return 'muted';
  if (/(border|hairline|divider|line|outline|stroke)/.test(l)) return 'border';
  if (/(accent secondary|secondary|tertiary)/.test(l)) return 'accent-secondary';
  if (/(accent|primary|brand|cta|link|highlight)/.test(l)) return 'accent';
  if (/(success|ok|positive|green)/.test(l)) return 'success';
  if (/(warn|amber|caution)/.test(l)) return 'warning';
  if (/(danger|error|destructive|red|negative)/.test(l)) return 'danger';
  return l.replace(/[^a-z0-9 ]/g, '').trim() || 'color';
}

/** Pull colors out of a section: markdown table rows and `- **Name:** \`#hex\`` bullets. */
function parseColors(section: Section | undefined): ParsedColor[] {
  if (!section) return [];
  const out: ParsedColor[] = [];
  for (const raw of section.content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!HEX_RE.test(line)) continue;
    const hex = (line.match(HEX_RE) ?? [])[0]!.toLowerCase();

    // Markdown table row: | role | name | `#hex` | usage |
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.every((c) => /^-+$/.test(c))) continue; // separator row
      if (cells.some((c) => /^role$/i.test(c)) && cells.some((c) => /^hex$/i.test(c))) continue;
      const role = clean(cells[0] ?? '');
      const name = clean(cells[1] ?? '') || titleCase(role);
      const usage = clean(cells[3] ?? cells[2] ?? '');
      out.push({ role: role || inferRole(name), name, hex, usage: usage === '—' ? '' : usage });
      continue;
    }

    // Bullet: - **Name (primary):** `#hex` — usage   |   - Name: #hex (usage)
    const labelMatch = line.match(/\*\*(.+?)\*\*/) ?? line.match(/^[-*]\s*([^:`#]+?)\s*[:：]/);
    const label = labelMatch ? clean(labelMatch[1] ?? '') : '';
    // Everything after the hex token is the usage note.
    const afterHex = line.slice(line.toLowerCase().indexOf(hex) + hex.length);
    const usage = clean(afterHex.replace(/^[\s—–\-(:)`]+/, '').replace(/\)\s*$/, ''));
    out.push({
      role: inferRole(label),
      name: label ? titleCase(label.replace(/\s*\(.*\)\s*$/, '')) : titleCase(inferRole(label)),
      hex,
      usage,
    });
  }
  // De-dupe by hex (first wins) and cap so a kitchen-sink doc stays readable.
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.hex) ? false : (seen.add(c.hex), true))).slice(0, 12);
}

function parseWeights(value: string): number[] {
  const nums = (value.match(/\b\d{3}\b/g) ?? []).map(Number);
  return Array.from(new Set(nums)).filter((n) => n >= 100 && n <= 900);
}

/** Fallback CSS stack from a backtick run: `'Family', Georgia, serif` → fallbacks. */
function fallbacksFromStack(line: string, family: string): string[] {
  const stack = line.match(/`([^`]*(?:,|serif|sans-serif|monospace)[^`]*)`/);
  if (!stack) return [];
  return stack[1]!
    .split(',')
    .map((f) => clean(f))
    .filter((f) => f.length > 0 && f.toLowerCase() !== family.toLowerCase());
}

function familyFromLine(line: string): string {
  const quoted = line.match(/["'“”]([^"'“”]+)["'“”]/);
  if (quoted) return clean(quoted[1] ?? '');
  // After the bold label: `- **Display:** Family — weights …`
  const afterLabel = line.replace(/^[-*]\s*\*\*.+?\*\*[:：]?\s*/, '');
  const head = afterLabel.split(/—|–| - | or |\(|`/)[0] ?? '';
  return clean(head);
}

function parseTypography(section: Section | undefined): ParsedDesignMd['typography'] {
  const out: ParsedDesignMd['typography'] = {};
  if (!section) return out;
  const lines = section.content.split(/\r?\n/).map((l) => l.trim());
  // Shared weights line (preset format: `- **Weights:** 100, 200, …`).
  const weightsLine = lines.find((l) => /weights?/i.test(l) && /\d{3}/.test(l));
  const sharedWeights = weightsLine ? parseWeights(weightsLine) : [];

  // Preset "Families" line: `- **Families:** primary=X, display=Y, mono=Z`.
  const famLine = lines.find((l) => /families?/i.test(l) && /=/.test(l));
  if (famLine) {
    const map: Record<string, string> = {};
    for (const pair of famLine.split(',')) {
      const m = pair.match(/(\w+)\s*=\s*([^,]+)/);
      if (m) map[m[1]!.toLowerCase()] = clean(m[2] ?? '');
    }
    const display = map.display || map.heading || map.primary;
    const body = map.body || map.text || map.primary || map.display;
    const mono = map.mono || map.code;
    if (display) out.display = { family: display, fallbacks: [], weights: sharedWeights };
    if (body) out.body = { family: body, fallbacks: [], weights: sharedWeights };
    if (mono) out.mono = { family: mono, fallbacks: [], weights: sharedWeights };
  }

  // Per-role bullet lines (brand + warm-editorial formats).
  for (const line of lines) {
    const label = (line.match(/^[-*]\s*\*\*(.+?)\*\*/) ?? [])[1];
    if (!label) continue;
    const l = label.toLowerCase();
    const role: keyof ParsedDesignMd['typography'] | null = /mono|code/.test(l)
      ? 'mono'
      : /body|text/.test(l)
        ? 'body'
        : /display|head|title/.test(l)
          ? 'display'
          : null;
    if (!role || out[role]) continue;
    const family = familyFromLine(line);
    if (!family) continue;
    const weights = parseWeights(line);
    // Fallbacks come either as a `fallbacks: a, b` clause (brand emitter) or a
    // backtick CSS stack `'Family', Georgia, serif` (preset specimens).
    const fallbacksClause = line.match(/fallbacks?:\s*([^—–()]+)/i);
    const fallbacks = fallbacksClause
      ? splitList(fallbacksClause[1] ?? '').filter((f) => f.toLowerCase() !== family.toLowerCase())
      : fallbacksFromStack(line, family);
    out[role] = {
      family,
      fallbacks,
      weights: weights.length > 0 ? weights : sharedWeights,
    };
  }
  return out;
}

function bulletsUnder(section: Section | undefined, subheading: RegExp): string[] {
  if (!section) return [];
  const lines = section.content.split(/\r?\n/);
  const start = lines.findIndex((l) => /^###\s+/.test(l) && subheading.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (/^###\s+/.test(line)) break;
    const m = line.match(/^[-*]\s+(.*)$/);
    if (m && !/^\(none/i.test(clean(m[1] ?? ''))) out.push(clean(m[1] ?? ''));
  }
  return out;
}

function labelledValue(section: Section | undefined, label: RegExp): string {
  if (!section) return '';
  for (const raw of section.content.split(/\r?\n/)) {
    const m = raw.trim().match(/^[-*]\s*\*\*(.+?)\*\*[:：]?\s*(.*)$/);
    if (m && label.test(m[1] ?? '')) return clean(m[2] ?? '');
  }
  return '';
}

function parseVoice(section: Section | undefined): ParsedVoice {
  return {
    adjectives: splitList(labelledValue(section, /adjective|trait|personality/i)),
    tone: labelledValue(section, /tone|voice/i),
    messagingPillars: bulletsUnder(section, /pillar|messag/i),
    vocabulary: {
      use: splitList(labelledValue(section, /^use$|use:/i)),
      avoid: splitList(labelledValue(section, /avoid/i)),
    },
  };
}

function parseImagery(section: Section | undefined): ParsedImagery {
  return {
    style: labelledValue(section, /style|aesthetic/i),
    subjects: splitList(labelledValue(section, /subject|content/i)),
    treatment: labelledValue(section, /treatment|process/i),
    avoid: splitList(labelledValue(section, /avoid/i)),
  };
}

function parseLayout(section: Section | undefined): ParsedLayout {
  const explicit = new Set(['radius', 'border weight', 'spacing']);
  const radius = labelledValue(section, /radius|corner/i);
  const borderWeight = labelledValue(section, /border|stroke/i);
  const spacing = labelledValue(section, /spacing|grid|baseline/i);
  // Posture rules: explicit `### Posture rules`, else the non-token bullets.
  let postureRules = bulletsUnder(section, /posture|principle|rule/i);
  if (postureRules.length === 0 && section) {
    postureRules = section.content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => clean(l.replace(/^[-*]\s+/, '')))
      .filter((l) => {
        const key = (l.match(/^\*\*(.+?)\*\*/) ?? [])[1]?.toLowerCase() ?? '';
        return l.length > 0 && !explicit.has(key) && !/^\(none/i.test(l);
      })
      .slice(0, 6);
  }
  return { radius, borderWeight, spacing, postureRules };
}

function parsePreamble(preamble: string): {
  name: string;
  tagline: string;
  description: string;
  category: string;
  surface: string;
} {
  const lines = preamble.split(/\r?\n/);
  let name = '';
  let category = '';
  let surface = '';
  let tagline = '';
  const descLines: string[] = [];
  const quoteLines: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!name && line.startsWith('# ')) {
      name = clean(line.slice(2));
      continue;
    }
    const cat = line.match(/^>\s*Category:\s*(.+)$/i);
    if (cat) {
      category = clean(cat[1] ?? '');
      continue;
    }
    const surf = line.match(/^>\s*Surface:\s*(.+)$/i);
    if (surf) {
      surface = clean(surf[1] ?? '');
      continue;
    }
    if (line.startsWith('>')) {
      quoteLines.push(clean(line.replace(/^>\s?/, '')));
      continue;
    }
    if (!tagline && /^\*[^*].*\*$/.test(line)) {
      tagline = clean(line);
      continue;
    }
    if (!line.startsWith('#')) descLines.push(clean(line));
  }
  const description = descLines.join(' ').trim() || quoteLines.join(' ').trim();
  return { name, tagline, description, category, surface };
}

export function parseDesignMd(body: string): ParsedDesignMd {
  const safe = body ?? '';
  const { frontmatter, rest } = splitFrontmatter(safe);
  const { preamble, sections } = splitDocument(rest);
  const head = parsePreamble(preamble);

  const colorSection = findSection(sections, 'color', 'palette');
  let colors = parseColors(colorSection);
  if (colors.length === 0) colors = frontmatterColors(frontmatter);

  const typography = parseTypography(findSection(sections, 'typograph', 'type', 'font'));
  const voice = parseVoice(findSection(sections, 'voice', 'tone'));
  const imagery = parseImagery(findSection(sections, 'imagery', 'photograph', 'illustration'));
  const layout = parseLayout(findSection(sections, 'layout', 'spacing', 'grid', 'composition'));

  return {
    name: head.name || frontmatterScalar(frontmatter, 'name'),
    tagline: head.tagline,
    description: head.description,
    category: head.category || frontmatterScalar(frontmatter, 'category'),
    surface: head.surface || frontmatterScalar(frontmatter, 'surface'),
    colors,
    typography,
    voice,
    imagery,
    layout,
  };
}
