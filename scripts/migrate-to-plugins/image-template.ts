// Wrap a `prompt-templates/image/<id>.json` entry as a bundled plugin
// under `plugins/_official/image-templates/<plugin-id>/`. The wrapper
// preserves the original JSON beside the manifest so attribution,
// preview URLs, and the {argument …} placeholders stay accessible to
// the daemon's generator and to anyone auditing the plugin.

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  PLUGINS_ROOT,
  PROMPT_TEMPLATES_DIR,
  TIER_IMAGE_TEMPLATES,
  buildManifest,
  copyFile,
  dedupeTags,
  pluginName,
  writeManifest,
  type RunStats,
} from './lib.ts';

interface ImageTemplateJson {
  id?: string;
  surface?: string;
  title?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  model?: string;
  aspect?: string;
  prompt?: string;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  source?: { repo?: string; license?: string; author?: string; url?: string };
}

export interface ImageTemplateOptions {
  ids?: string[];
  limit?: number;
  dryRun?: boolean;
}

export async function runImageTemplateGenerator(opts: ImageTemplateOptions): Promise<RunStats> {
  return runJsonTemplateGenerator({
    sourceDir: path.join(PROMPT_TEMPLATES_DIR, 'image'),
    targetTier: TIER_IMAGE_TEMPLATES,
    namePrefix: 'image-template',
    mode: 'image',
    surface: 'image',
    atom: 'image-generate',
    capability: 'media:image-generate',
    aspectOptions: ['1:1', '16:9', '9:16', '4:5', '3:2'],
    defaultAspect: '1:1',
    previewType: 'image',
    ...opts,
  });
}

export interface VideoTemplateOptions extends ImageTemplateOptions {}

export async function runVideoTemplateGenerator(opts: VideoTemplateOptions): Promise<RunStats> {
  return runJsonTemplateGenerator({
    sourceDir: path.join(PROMPT_TEMPLATES_DIR, 'video'),
    targetTier: 'video-templates',
    namePrefix: 'video-template',
    mode: 'video',
    surface: 'video',
    atom: 'video-generate',
    capability: 'media:video-generate',
    aspectOptions: ['16:9', '9:16', '1:1', '4:5'],
    defaultAspect: '16:9',
    previewType: 'video',
    ...opts,
  });
}

interface SharedConfig {
  sourceDir: string;
  targetTier: string;
  namePrefix: string;
  mode: 'image' | 'video';
  surface: 'image' | 'video';
  atom: string;
  capability: string;
  aspectOptions: string[];
  defaultAspect: string;
  previewType: 'image' | 'video';
  ids?: string[];
  limit?: number;
  dryRun?: boolean;
}

async function runJsonTemplateGenerator(cfg: SharedConfig): Promise<RunStats> {
  const { readdir } = await import('node:fs/promises');
  const stats: RunStats = { generated: [], skipped: [] };
  let entries: string[];
  try {
    entries = await readdir(cfg.sourceDir);
  } catch {
    return stats;
  }
  const filtered = entries
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !cfg.ids || cfg.ids.includes(basenameNoExt(f)))
    .sort();
  const slice = cfg.limit !== undefined ? filtered.slice(0, cfg.limit) : filtered;

  for (const file of slice) {
    const filePath = path.join(cfg.sourceDir, file);
    const raw = await readFile(filePath, 'utf8');
    let parsed: ImageTemplateJson;
    try {
      parsed = JSON.parse(raw) as ImageTemplateJson;
    } catch (err) {
      stats.skipped.push({ id: file, reason: `invalid json: ${(err as Error).message}` });
      continue;
    }
    if (!parsed.id || !parsed.title || !parsed.prompt) {
      stats.skipped.push({ id: file, reason: 'missing id/title/prompt' });
      continue;
    }
    if (parsed.surface !== cfg.surface) {
      stats.skipped.push({ id: parsed.id, reason: `surface=${parsed.surface} mismatch` });
      continue;
    }

    const name = pluginName(cfg.namePrefix, parsed.id);
    const folder = path.join(PLUGINS_ROOT, cfg.targetTier, parsed.id);

    const manifest = buildManifest({
      name,
      title: parsed.title,
      description: parsed.summary ?? '',
      license: parsed.source?.license ?? 'CC-BY-4.0',
      author: {
        ...(parsed.source?.author ? { name: parsed.source.author } : {}),
        ...(parsed.source?.url ? { url: parsed.source.url } : {}),
      },
      ...(parsed.source?.repo
        ? { homepage: `https://github.com/${parsed.source.repo}` }
        : {}),
      tags: dedupeTags([
        cfg.namePrefix,
        'first-party',
        cfg.surface,
        parsed.category,
        ...(parsed.tags ?? []),
      ]),
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode: cfg.mode,
        scenario: cfg.surface,
        surface: cfg.surface,
        preview: previewBlock(parsed, cfg.previewType),
        useCase: { query: parsed.prompt },
        inputs: [
          ...(parsed.model
            ? [{
                name: 'model',
                label: 'Model',
                type: 'select' as const,
                options: [parsed.model],
                default: parsed.model,
              }]
            : []),
          {
            name: 'aspect',
            label: 'Aspect ratio',
            type: 'select' as const,
            options: cfg.aspectOptions,
            default: parsed.aspect ?? cfg.defaultAspect,
          },
        ],
        context: { assets: ['./template.json'] },
        pipeline: {
          stages: [{ id: 'generate', atoms: [cfg.atom] }],
        },
        capabilities: ['prompt:inject', cfg.capability],
      },
    });

    if (cfg.dryRun) {
      stats.generated.push(parsed.id);
      continue;
    }
    await writeManifest(folder, manifest);
    await copyFile(filePath, path.join(folder, 'template.json'));
    stats.generated.push(parsed.id);
  }
  return stats;
}

function basenameNoExt(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

function previewBlock(parsed: ImageTemplateJson, type: 'image' | 'video'): Record<string, unknown> | undefined {
  const block: Record<string, unknown> = { type };
  if (parsed.previewImageUrl) block.poster = parsed.previewImageUrl;
  if (parsed.previewVideoUrl) block.video = parsed.previewVideoUrl;
  return Object.keys(block).length > 1 ? block : undefined;
}
