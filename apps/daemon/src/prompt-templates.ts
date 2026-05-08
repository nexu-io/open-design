// Prompt template registry. Mirrors design-systems.js: scans
// <projectRoot>/prompt-templates/{image,video}/*.json on every list call
// and returns the parsed entries with light validation.
//
// Each JSON file is hand-curated (or imported via
// scripts/import-prompt-templates.mjs) and carries a `source` block so
// attribution stays intact when we surface the entry in the gallery and
// the system prompt.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SUPPORTED_SURFACES = ['image', 'video'] as const;
type PromptTemplateSurface = (typeof SUPPORTED_SURFACES)[number];
type JsonRecord = Record<string, unknown>;

interface PromptTemplate {
  id: string;
  surface: PromptTemplateSurface;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  model?: string;
  aspect?: string;
  prompt: string;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  source: { repo: string; license: string; author?: string; url?: string };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object';
}

export async function listPromptTemplates(root: string): Promise<PromptTemplate[]> {
  const out: PromptTemplate[] = [];
  for (const surface of SUPPORTED_SURFACES) {
    const dir = path.join(root, surface);
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      const filePath = path.join(dir, entry.name);
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) continue;
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const validated = validateTemplate(parsed, surface, entry.name);
        if (validated) out.push(validated);
      } catch (err) {
        console.warn(`prompt-templates: failed ${filePath}`, err);
      }
    }
  }
  // Stable order — same surface group together, alpha by title within
  // surface so the gallery matches what `ls` would suggest.
  out.sort((a, b) => {
    if (a.surface !== b.surface) {
      return a.surface === 'image' ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
  return out;
}

export async function readPromptTemplate(root: string, surface: string, id: string): Promise<PromptTemplate | null> {
  if (!isPromptTemplateSurface(surface)) return null;
  const filePath = path.join(root, surface, `${id}.json`);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return validateTemplate(parsed, surface, `${id}.json`);
  } catch {
    return null;
  }
}

function isPromptTemplateSurface(surface: string): surface is PromptTemplateSurface {
  return (SUPPORTED_SURFACES as readonly string[]).includes(surface);
}

function validateTemplate(raw: unknown, expectedSurface: PromptTemplateSurface, fileName: string): PromptTemplate | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) {
    console.warn(`prompt-templates: ${fileName} missing id`);
    return null;
  }
  if (raw.surface !== expectedSurface) {
    console.warn(
      `prompt-templates: ${fileName} surface=${raw.surface} ≠ folder=${expectedSurface}`,
    );
    return null;
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  if (typeof raw.prompt !== 'string' || raw.prompt.trim().length < 20) {
    console.warn(`prompt-templates: ${fileName} prompt too short`);
    return null;
  }
  const source = isRecord(raw.source) ? raw.source : null;
  if (!source || typeof source.repo !== 'string' || typeof source.license !== 'string') {
    console.warn(`prompt-templates: ${fileName} missing source.repo / license`);
    return null;
  }
  const template: PromptTemplate = {
    id: raw.id,
    surface: expectedSurface,
    title: raw.title.trim(),
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    category: typeof raw.category === 'string' ? raw.category : 'General',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    prompt: raw.prompt.trim(),
    source: {
      repo: source.repo,
      license: source.license,
    },
  };
  if (typeof raw.model === 'string') template.model = raw.model;
  if (typeof raw.aspect === 'string') template.aspect = raw.aspect;
  if (typeof raw.previewImageUrl === 'string') template.previewImageUrl = raw.previewImageUrl;
  if (typeof raw.previewVideoUrl === 'string') template.previewVideoUrl = raw.previewVideoUrl;
  if (typeof source.author === 'string') template.source.author = source.author;
  if (typeof source.url === 'string') template.source.url = source.url;
  return template;
}
