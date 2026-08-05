import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectPluginManifest {
  name: string;
  title: string;
  version: string;
  manifest: Record<string, unknown>;
}

function asManifest(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('open-design.json must contain a JSON object');
  }
  return value as Record<string, unknown>;
}

export async function readProjectPluginManifest(
  folder: string,
): Promise<ProjectPluginManifest> {
  const raw = await readFile(path.join(folder, 'open-design.json'), 'utf8');
  const manifest = asManifest(JSON.parse(raw));
  const name = typeof manifest.name === 'string' && manifest.name.trim()
    ? manifest.name.trim()
    : path.basename(folder);
  if (/[/\\]/.test(name) || /^\.+$/.test(name)) {
    throw new Error(
      `open-design.json in ${folder}: name "${name}" must not contain path separators or consist only of dots`,
    );
  }
  return {
    name,
    title: typeof manifest.title === 'string' ? manifest.title : name,
    version: typeof manifest.version === 'string' ? manifest.version : '0.1.0',
    manifest,
  };
}
