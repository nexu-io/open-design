export interface PluginSkillDescriptionSource {
  key: string;
  assetPath: string | null;
}

const MAX_DESCRIPTION_FILES = 8;
const MAX_DESCRIPTION_CONCURRENCY = 2;
const MAX_MARKDOWN_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3_000;
const MARKDOWN_MEDIA_TYPES = new Set([
  'application/markdown',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
]);

export function normalizePluginSkillAssetPath(path: string | undefined): string | null {
  const normalized = path?.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) return null;
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function pluginAssetUrl(pluginId: string, assetPath: string): string {
  const encodedPath = assetPath.split('/').map(encodeURIComponent).join('/');
  return `/api/plugins/${encodeURIComponent(pluginId)}/asset/${encodedPath}`;
}

function firstMarkdownParagraph(markdown: string): string {
  const paragraphs = markdown.split(/\r?\n\s*\r?\n/);
  for (const paragraph of paragraphs) {
    const lines = paragraph.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.some((line) => /^(#{1,6}\s|```|~~~|\s*[-*+]\s|\s*\d+\.\s|>)/.test(line))) {
      continue;
    }
    return lines.join(' ');
  }
  return '';
}

function parseSkillFrontmatter(markdown: string): { description: string; body: string } {
  const text = markdown.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { description: '', body: text };

  const frontmatter = match[1] ?? '';
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const lineMatch = /^(\s*)description:\s*(.*)$/.exec(rawLine);
    if (!lineMatch) continue;

    const parentIndent = (lineMatch[1] ?? '').length;
    const rawValue = (lineMatch[2] ?? '').trim();
    if (/^[|>][+-]?$/.test(rawValue)) {
      const collected: string[] = [];
      let blockIndent: number | null = null;
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const child = lines[nextIndex] ?? '';
        if (!child.trim()) {
          collected.push('');
          continue;
        }
        const childIndent = child.match(/^\s*/)?.[0].length ?? 0;
        if (childIndent <= parentIndent) break;
        blockIndent ??= childIndent;
        if (childIndent < blockIndent) break;
        collected.push(child.slice(blockIndent));
      }
      return {
        description: collected.join('\n').trimEnd(),
        body: text.slice(match[0].length),
      };
    }

    const quoted = /^(["'])([\s\S]*)\1$/.exec(rawValue);
    return {
      description: (quoted?.[2] ?? rawValue).trim(),
      body: text.slice(match[0].length),
    };
  }

  return { description: '', body: text.slice(match[0].length) };
}

/**
 * Plugin Markdown is untrusted package content. Detail rows need one short
 * description, not rendered HTML, so strip markup and let React emit only a
 * text node. This keeps scriptable tags and unsafe link targets out of the DOM.
 */
function descriptionFromMarkdown(markdown: string): string {
  let source: string;
  try {
    const { description, body } = parseSkillFrontmatter(markdown);
    source = description || firstMarkdownParagraph(body);
  } catch {
    return '';
  }
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

function isMarkdownAssetPath(assetPath: string): boolean {
  const lower = assetPath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function responseMediaType(response: Response): string {
  return response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function declaredResponseBytes(response: Response): number | null {
  const raw = response.headers.get('Content-Length')?.trim() ?? '';
  if (!/^\d+$/.test(raw)) return null;
  const bytes = Number(raw);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

async function readBoundedResponseText(
  response: Response,
  signal: AbortSignal,
): Promise<string | null> {
  if (!MARKDOWN_MEDIA_TYPES.has(responseMediaType(response))) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const declaredBytes = declaredResponseBytes(response);
  if (declaredBytes !== null && declaredBytes > MAX_MARKDOWN_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel();
        return null;
      }
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_MARKDOWN_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchSkillMarkdown(
  pluginId: string,
  assetPath: string,
  parentSignal: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<string | null> {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abort();
  else parentSignal.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(pluginAssetUrl(pluginId, assetPath), {
      signal: controller.signal,
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    });
    if (!response.ok) return null;
    return await readBoundedResponseText(response, controller.signal);
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
    parentSignal.removeEventListener('abort', abort);
  }
}

export async function loadPluginSkillDescriptions(
  pluginId: string,
  sources: readonly PluginSkillDescriptionSource[],
  signal: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<Record<string, string>> {
  const eligible = sources
    .filter((source) => source.assetPath && isMarkdownAssetPath(source.assetPath))
    .slice(0, MAX_DESCRIPTION_FILES);
  const entries: Array<readonly [string, string] | null> = Array(eligible.length).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (!signal.aborted) {
      const index = cursor;
      cursor += 1;
      const source = eligible[index];
      if (!source?.assetPath) return;
      const markdown = await fetchSkillMarkdown(
        pluginId,
        source.assetPath,
        signal,
        workspaceContext,
      );
      if (!markdown) continue;
      const description = descriptionFromMarkdown(markdown);
      if (description) entries[index] = [source.key, description];
    }
  };
  const workerCount = Math.min(MAX_DESCRIPTION_CONCURRENCY, eligible.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, string] => entry !== null),
  );
}
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceProjectHeaders } from '../collab/workspace-identity';
