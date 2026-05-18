import { createHash } from 'node:crypto';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { validateProjectPath } from './projects.js';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const FIGMA_IMPORT_SCHEMA_VERSION = 1;
const FIGMA_TOKENS_SCHEMA_VERSION = 1;

export type FigmaReimportDecision = 'create_version' | 'update_generated';

export interface FigmaImportDetection {
  embeddedFileId: string | null;
  contentSha256: string;
  fileName: string;
  byteSize: number;
}

export interface FigmaImportManifest {
  schemaVersion: number;
  importId: string;
  importVersion: number;
  sourceKind: 'figma-local';
  source: FigmaImportDetection;
  generatedArtifacts: string[];
  stats: {
    colors: number;
    typography: number;
    spacing: number;
    radius: number;
    shadows: number;
    unmatched: number;
    tailwindThemeKeys: number;
    previewColors: number;
  };
  warnings: string[];
  unmatchedPath: string;
  overridesPath?: string;
  updatedAt: string;
}

type ExtractedTokens = {
  schemaVersion: number;
  $schema: string;
  color: Array<{ $type: 'color'; $value: string; $description: string }>;
  typography: Array<{ $type: 'dimension'; $value: string; $description: string }>;
  spacing: Array<{ $type: 'dimension'; $value: string; $description: string }>;
  radius: Array<{ $type: 'dimension'; $value: string; $description: string }>;
  shadow: Array<{ $type: 'shadow'; $value: string; $description: string }>;
};

export interface FigmaImportReport {
  manifestPath: string;
  generatedFiles: string[];
  detection: FigmaImportDetection;
  importId: string;
  importVersion: number;
}

export interface FigmaDecisionRequiredErrorDetails {
  reason: 'reimport-detected';
  existingImportId: string;
  existingImportVersion: number;
}

export class FigmaDecisionRequiredError extends Error {
  details: FigmaDecisionRequiredErrorDetails;

  constructor(details: FigmaDecisionRequiredErrorDetails) {
    super('reimport decision required');
    this.name = 'FigmaDecisionRequiredError';
    this.details = details;
  }
}

export async function importLocalFigmaFile(args: {
  projectDir: string;
  sourcePath: string;
  decision?: FigmaReimportDecision | null;
}): Promise<FigmaImportReport> {
  const relSourcePath = validateProjectPath(args.sourcePath);
  const absoluteSourcePath = path.resolve(args.projectDir, relSourcePath);
  if (!absoluteSourcePath.startsWith(path.resolve(args.projectDir) + path.sep)) {
    throw new Error('figma import path escapes project root');
  }
  const file = await fsp.readFile(absoluteSourcePath);
  const fileName = path.basename(relSourcePath);
  const contentSha256 = createHash('sha256').update(file).digest('hex');
  const embeddedFileId = detectEmbeddedFileId(file);
  const detection: FigmaImportDetection = {
    embeddedFileId,
    contentSha256,
    fileName,
    byteSize: file.byteLength,
  };

  const figmaRoot = path.join(args.projectDir, 'figma');
  await fsp.mkdir(figmaRoot, { recursive: true });

  const existing = await findExistingImport(figmaRoot, detection);
  const baseImportId = embeddedFileId || `fig-${contentSha256.slice(0, 12)}`;
  const targetImportId = resolveTargetImportId(baseImportId, existing?.manifest?.importVersion ?? 0, args.decision, Boolean(existing));

  if (existing && !args.decision) {
    throw new FigmaDecisionRequiredError({
      reason: 'reimport-detected',
      existingImportId: existing.manifest.importId,
      existingImportVersion: existing.manifest.importVersion,
    });
  }

  const targetDir = args.decision === 'update_generated' && existing
    ? existing.dir
    : path.join(figmaRoot, targetImportId);
  await fsp.mkdir(targetDir, { recursive: true });

  const parsed = parseFigmaPayload(file);
  const { tokens: extractedTokens, unmatched } = extractOpenDesignTokens(parsed);
  const overridesResult = await readOverrides(path.join(targetDir, 'overrides.tokens.json'));
  const tokens = applyOverrides(extractedTokens, overridesResult.overrides);
  const rawJson = parsed ?? { note: 'Unable to decode structured JSON from this .fig file.' };
  const importVersion = args.decision === 'update_generated' && existing
    ? existing.manifest.importVersion + 1
    : 1;

  const manifest: FigmaImportManifest = {
    schemaVersion: FIGMA_IMPORT_SCHEMA_VERSION,
    importId: path.basename(targetDir),
    importVersion,
    sourceKind: 'figma-local',
    source: detection,
    generatedArtifacts: [
      'manifest.json',
      'tokens.dtcg.json',
      'tailwind.preset.ts',
      'tailwind-map.json',
      'unmatched.json',
      'raw.json',
      'preview.svg',
      'summary.md',
    ],
    stats: {
      colors: tokens.color.length,
      typography: tokens.typography.length,
      spacing: tokens.spacing.length,
      radius: tokens.radius.length,
      shadows: tokens.shadow.length,
      unmatched: unmatched.length,
      tailwindThemeKeys: 0,
      previewColors: 0,
    },
    warnings: parsed ? [] : ['No structured JSON payload could be decoded from this .fig file.'],
    unmatchedPath: 'unmatched.json',
    overridesPath: overridesResult.overrides ? 'overrides.tokens.json' : undefined,
    updatedAt: new Date().toISOString(),
  };
  if (overridesResult.warning) manifest.warnings.push(overridesResult.warning);
  if (overridesResult.overrides) {
    const applied = countOverrideValues(overridesResult.overrides);
    if (applied > 0) {
      manifest.warnings.push(`Applied ${applied} token override${applied === 1 ? '' : 's'} from overrides.tokens.json.`);
    }
  }

  const tailwind = buildTailwindPreset(tokens);
  manifest.stats.tailwindThemeKeys =
    Object.keys(tailwind.map.colors).length
    + Object.keys(tailwind.map.spacing).length
    + Object.keys(tailwind.map.radius).length
    + Object.keys(tailwind.map.shadow).length
    + Object.keys(tailwind.map.typography).length;
  const previewSvg = buildImportPreviewSvg(tokens);
  manifest.stats.previewColors = Math.min(6, tokens.color.length);
  const summary = buildImportSummaryMarkdown({
    importId: manifest.importId,
    importVersion: manifest.importVersion,
    stats: manifest.stats,
  });

  await fsp.writeFile(path.join(targetDir, 'raw.json'), JSON.stringify(rawJson, null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(targetDir, 'tokens.dtcg.json'), JSON.stringify(tokens, null, 2) + '\n', 'utf8');
  await fsp.writeFile(
    path.join(targetDir, 'tailwind.preset.ts'),
    `${tailwind.preset}\n`,
    'utf8',
  );
  await fsp.writeFile(
    path.join(targetDir, 'tailwind-map.json'),
    JSON.stringify(tailwind.map, null, 2) + '\n',
    'utf8',
  );
  await fsp.writeFile(path.join(targetDir, 'unmatched.json'), JSON.stringify({ values: unmatched }, null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(targetDir, 'preview.svg'), previewSvg, 'utf8');
  await fsp.writeFile(path.join(targetDir, 'summary.md'), summary, 'utf8');
  // Keep legacy filename during the migration window so existing
  // consumers don't break while the UI switches to dtcg naming.
  await fsp.writeFile(path.join(targetDir, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const toProjectPath = (p: string) => p.split(path.sep).join('/');
  const relTargetDir = toProjectPath(path.relative(args.projectDir, targetDir));
  return {
    manifestPath: `${relTargetDir}/manifest.json`,
    generatedFiles: [...manifest.generatedArtifacts, 'tokens.json'].map((name) => `${relTargetDir}/${name}`),
    detection,
    importId: manifest.importId,
    importVersion: manifest.importVersion,
  };
}

function buildImportSummaryMarkdown(input: {
  importId: string;
  importVersion: number;
  stats: FigmaImportManifest['stats'];
}): string {
  return [
    '# Figma Import Summary',
    '',
    `- Import: \`${input.importId}\` (v${input.importVersion})`,
    `- Colors: ${input.stats.colors}`,
    `- Typography: ${input.stats.typography}`,
    `- Spacing: ${input.stats.spacing}`,
    `- Radius: ${input.stats.radius}`,
    `- Shadows: ${input.stats.shadows}`,
    `- Unmatched values: ${input.stats.unmatched}`,
    '',
    '## Next step',
    'Use `tailwind.preset.ts` + `tokens.dtcg.json` as the first design-system package baseline.',
    '',
  ].join('\n');
}

function buildImportPreviewSvg(tokens: ExtractedTokens): string {
  const swatches = tokens.color.slice(0, 6).map((token) => token.$value);
  const colors = swatches.length > 0 ? swatches : ['#111111', '#333333', '#666666', '#999999', '#cccccc', '#eeeeee'];
  const width = 1200;
  const height = 675;
  const pad = 36;
  const swatchW = Math.floor((width - pad * 2) / colors.length);
  const rects = colors
    .map((color, index) => {
      const x = pad + index * swatchW;
      return `<rect x="${x}" y="${height - 180}" width="${swatchW - 8}" height="120" rx="14" fill="${escapeXml(color)}" />`;
    })
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#171717"/><stop offset="100%" stop-color="#242424"/></linearGradient></defs>',
    '<rect width="100%" height="100%" fill="url(#bg)" />',
    '<text x="36" y="74" fill="#ffffff" font-size="38" font-family="Inter, system-ui, sans-serif" font-weight="700">Imported Figma Design System</text>',
    `<text x="36" y="118" fill="#cfcfcf" font-size="20" font-family="Inter, system-ui, sans-serif">Colors ${tokens.color.length} · Typography ${tokens.typography.length} · Spacing ${tokens.spacing.length}</text>`,
    rects,
    '</svg>',
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function resolveTargetImportId(baseImportId: string, currentVersion: number, decision: FigmaReimportDecision | null | undefined, hasExisting: boolean): string {
  if (!hasExisting) return baseImportId;
  if (decision === 'update_generated') return baseImportId;
  const next = Math.max(2, currentVersion + 1);
  return `${baseImportId}-v${next}`;
}

async function findExistingImport(figmaRoot: string, detection: FigmaImportDetection): Promise<{ dir: string; manifest: FigmaImportManifest } | null> {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(figmaRoot);
  } catch {
    return null;
  }
  const manifests: Array<{ dir: string; manifest: FigmaImportManifest }> = [];
  for (const entry of entries) {
    const manifestPath = path.join(figmaRoot, entry, 'manifest.json');
    try {
      const parsed = JSON.parse(await fsp.readFile(manifestPath, 'utf8')) as FigmaImportManifest;
      if (!parsed?.source) continue;
      manifests.push({ dir: path.join(figmaRoot, entry), manifest: parsed });
    } catch {
      // ignore malformed/non-import folders
    }
  }
  manifests.sort((a, b) => {
    const av = Number(a.manifest.importVersion || 0);
    const bv = Number(b.manifest.importVersion || 0);
    return bv - av;
  });
  return manifests.find(({ manifest }) =>
    Boolean(
      (detection.embeddedFileId && manifest.source.embeddedFileId && detection.embeddedFileId === manifest.source.embeddedFileId) ||
      (detection.contentSha256 && manifest.source.contentSha256 === detection.contentSha256),
    ),
  ) ?? null;
}

function detectEmbeddedFileId(file: Buffer): string | null {
  const ascii = file.toString('utf8');
  const patterns = [
    /"fileKey"\s*:\s*"([A-Za-z0-9_-]{8,})"/,
    /"file_id"\s*:\s*"([A-Za-z0-9_-]{8,})"/,
    /"key"\s*:\s*"([A-Za-z0-9_-]{8,})"/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(ascii);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseFigmaPayload(file: Buffer): Record<string, unknown> | null {
  const asText = safeParseJson(file.toString('utf8'));
  if (asText && typeof asText === 'object') return asText;
  const zipEntries = readZipJsonEntries(file);
  for (const entry of zipEntries) {
    if (looksLikeFigmaDocument(entry)) return entry;
  }
  if (zipEntries.length > 0) return zipEntries[0] ?? null;
  return null;
}

function looksLikeFigmaDocument(value: Record<string, unknown>): boolean {
  return Boolean(
    value['document'] ||
    value['nodes'] ||
    value['styles'] ||
    value['components'] ||
    value['schemaVersion'],
  );
}

function safeParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function extractOpenDesignTokens(payload: Record<string, unknown> | null): {
  tokens: ExtractedTokens;
  unmatched: string[];
} {
  const colors = new Set<string>();
  const typography = new Set<string>();
  const spacing = new Set<string>();
  const radius = new Set<string>();
  const shadows = new Set<string>();
  const unmatched = new Set<string>();

  walk(payload, (key, value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return;
    const text = normalizeTokenValue(String(value).trim());
    if (!text) return;
    let matched = false;
    if (/^#(?:[0-9a-fA-F]{3,8})$/.test(text) || /^rgba?\(/i.test(text)) {
      colors.add(text.toLowerCase());
      matched = true;
    }
    if (/font/i.test(key) || /(px|rem)$/.test(text) && /(line|font|weight|letter)/i.test(key)) {
      typography.add(text);
      matched = true;
    }
    if (/(spacing|space|padding|margin|gap)/i.test(key) && /^-?\d+(\.\d+)?(px|rem|em|%)?$/.test(text)) {
      spacing.add(text);
      matched = true;
    }
    if (/(radius|corner)/i.test(key) && /^-?\d+(\.\d+)?(px|rem|em|%)?$/.test(text)) {
      radius.add(text);
      matched = true;
    }
    if (/(shadow|elevation)/i.test(key)) {
      shadows.add(text);
      matched = true;
    }
    if (!matched && looksLikeTokenValue(text)) unmatched.add(text);
  });

  return {
    tokens: {
      schemaVersion: FIGMA_TOKENS_SCHEMA_VERSION,
      $schema: 'https://www.designtokens.org/TR/2025.10/format/',
      color: Array.from(colors).sort().map((value) => ({
      $type: 'color',
      $value: value,
      $description: 'Extracted from imported .fig payload',
      })),
      typography: Array.from(typography).sort().map((value) => ({
      $type: 'dimension',
      $value: value,
      $description: 'Extracted typography-related value',
      })),
      spacing: Array.from(spacing).sort().map((value) => ({
      $type: 'dimension',
      $value: value,
      $description: 'Extracted spacing-related value',
      })),
      radius: Array.from(radius).sort().map((value) => ({
      $type: 'dimension',
      $value: value,
      $description: 'Extracted radius-related value',
      })),
      shadow: Array.from(shadows).sort().map((value) => ({
      $type: 'shadow',
      $value: value,
      $description: 'Extracted shadow/elevation value',
      })),
    },
    unmatched: Array.from(unmatched).sort(),
  };
}

function applyOverrides(tokens: ExtractedTokens, overrides: Record<string, string[]> | null): ExtractedTokens {
  if (!overrides) return tokens;
  const next: ExtractedTokens = {
    ...tokens,
    color: tokens.color,
    typography: tokens.typography,
    spacing: tokens.spacing,
    radius: tokens.radius,
    shadow: tokens.shadow,
  };
  const map: Array<{ key: keyof ExtractedTokens; allowType: string }> = [
    { key: 'color', allowType: 'color' },
    { key: 'typography', allowType: 'dimension' },
    { key: 'spacing', allowType: 'dimension' },
    { key: 'radius', allowType: 'dimension' },
    { key: 'shadow', allowType: 'shadow' },
  ];
  for (const { key, allowType } of map) {
    const values = overrides[key];
    if (!Array.isArray(values) || values.length === 0) continue;
    next[key] = values
      .map((value) => normalizeTokenValue(String(value)))
      .filter(Boolean)
      .map(($value) => ({
        $type: allowType as 'color' | 'dimension' | 'shadow',
        $value,
        $description: 'User override from overrides.tokens.json',
      })) as ExtractedTokens[typeof key];
  }
  return next;
}

async function readOverrides(
  filePath: string,
): Promise<{ overrides: Record<string, string[]> | null; warning: string | null }> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { overrides: null, warning: 'Ignored overrides.tokens.json because it is not an object.' };
    }
    return { overrides: parsed as Record<string, string[]>, warning: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENOENT')) return { overrides: null, warning: null };
    return { overrides: null, warning: 'Ignored overrides.tokens.json because it could not be parsed.' };
  }
}

function countOverrideValues(overrides: Record<string, string[]>): number {
  let count = 0;
  for (const category of ['color', 'typography', 'spacing', 'radius', 'shadow']) {
    const values = overrides[category];
    if (!Array.isArray(values)) continue;
    count += values.filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  }
  return count;
}

function normalizeTokenValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function looksLikeTokenValue(value: string): boolean {
  return /^-?\d+(\.\d+)?(px|rem|em|%)?$/.test(value)
    || /^#(?:[0-9a-fA-F]{3,8})$/.test(value)
    || /^rgba?\(/i.test(value);
}

function buildTailwindPreset(tokens: {
  color: Array<{ $value: string }>;
  typography: Array<{ $value: string }>;
  spacing: Array<{ $value: string }>;
  radius: Array<{ $value: string }>;
  shadow: Array<{ $value: string }>;
}): {
  preset: string;
  map: {
    colors: Record<string, string>;
    spacing: Record<string, string>;
    radius: Record<string, string>;
    shadow: Record<string, string>;
    typography: Record<string, string>;
  };
} {
  const colors = Object.fromEntries(tokens.color.map((token, index) => [`figma-color-${index + 1}`, token.$value]));
  const spacing = Object.fromEntries(tokens.spacing.map((token, index) => [`figma-space-${index + 1}`, token.$value]));
  const radius = Object.fromEntries(tokens.radius.map((token, index) => [`figma-radius-${index + 1}`, token.$value]));
  const shadow = Object.fromEntries(tokens.shadow.map((token, index) => [`figma-shadow-${index + 1}`, token.$value]));
  const typography = Object.fromEntries(tokens.typography.map((token, index) => [`figma-type-${index + 1}`, token.$value]));
  const preset = `export default {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 2)},
      spacing: ${JSON.stringify(spacing, null, 2)},
      borderRadius: ${JSON.stringify(radius, null, 2)},
      boxShadow: ${JSON.stringify(shadow, null, 2)}
    }
  }
};`;
  return {
    preset,
    map: {
      colors,
      spacing,
      radius,
      shadow,
      typography,
    },
  };
}

function walk(value: unknown, visit: (key: string, value: unknown) => void, key = ''): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, key);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    visit(k, v);
    walk(v, visit, k);
  }
}

function readZipJsonEntries(buf: Buffer): Array<Record<string, unknown>> {
  if (buf.byteLength < 22) return [];
  const eocdOffset = findEndOfCentralDirectory(buf);
  if (eocdOffset < 0) return [];
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  let offset = centralOffset;
  const out: Array<Record<string, unknown>> = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
    if (!name.endsWith('.json')) continue;
    const entryBody = readZipEntryBody(buf, localOffset, compressedSize, method);
    if (!entryBody) continue;
    const parsed = safeParseJson(entryBody.toString('utf8'));
    if (parsed) out.push(parsed);
  }
  return out;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const min = Math.max(0, zip.length - 0xffff - 22);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

function readZipEntryBody(zip: Buffer, localOffset: number, compressedSize: number, method: number): Buffer | null {
  if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_SIG) return null;
  const nameLen = zip.readUInt16LE(localOffset + 26);
  const extraLen = zip.readUInt16LE(localOffset + 28);
  const bodyStart = localOffset + 30 + nameLen + extraLen;
  const bodyEnd = bodyStart + compressedSize;
  if (bodyEnd > zip.length) return null;
  const compressed = zip.slice(bodyStart, bodyEnd);
  if (method === 0) return compressed;
  if (method === 8) {
    try {
      return inflateRawSync(compressed);
    } catch {
      return null;
    }
  }
  return null;
}
