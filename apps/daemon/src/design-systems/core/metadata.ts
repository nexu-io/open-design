/** @module core/metadata
 * Foundational read + validation primitives for a user design system's `metadata.json`.
 * Lives in the foundation layer because both the read layer (catalog) and the write layer
 * (user) depend on reading and normalising metadata; only `core/` may be imported by both.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isDesignSystemArtifactMode, isDesignSystemStatus, isDesignSystemSurface, parseProvenance } from './body.js';
import type { DesignSystemArtifactMode, UserDesignSystemMetadata } from './types.js';

/**
 * Validates and sanitises a raw value as a project ID suitable for storage in
 * `metadata.json`. Accepts alphanumeric characters plus `.`, `_`, `:`, `-`,
 * up to 160 characters.
 *
 * @param raw - Untrusted input from an API request.
 * @returns Trimmed valid project ID, or `null` if invalid.
 */
export function cleanProjectIdForMetadata(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value === '.' || value === '..') return null;
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) return null;
  return value;
}

/**
 * Coerces an unknown value to a `DesignSystemArtifactMode`, returning
 * `undefined` for any unrecognised value.
 *
 * @param raw - Untrusted input from an API request or metadata file.
 */
export function normalizeArtifactMode(raw: unknown): DesignSystemArtifactMode | undefined {
  return isDesignSystemArtifactMode(raw) ? raw : undefined;
}

/**
 * Reads and parses `<root>/<id>/metadata.json`, returning a typed
 * `UserDesignSystemMetadata` object. Returns an empty object when the file is
 * absent, unparseable, or contains invalid field values.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Directory name of the specific design system.
 */
export async function readUserMetadata(root: string, id: string): Promise<UserDesignSystemMetadata> {
  try {
    const raw = await readFile(path.join(root, id, 'metadata.json'), 'utf8');
    const parsed = JSON.parse(raw) as UserDesignSystemMetadata;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const provenance = parseProvenance((parsed as { provenance?: unknown }).provenance);
    const projectId = cleanProjectIdForMetadata(parsed.projectId);
    return {
      ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
      ...(typeof parsed.category === 'string' ? { category: parsed.category } : {}),
      ...(isDesignSystemSurface(parsed.surface) ? { surface: parsed.surface } : {}),
      ...(isDesignSystemStatus(parsed.status) ? { status: parsed.status } : {}),
      ...(isDesignSystemArtifactMode(parsed.artifactMode) ? { artifactMode: parsed.artifactMode } : {}),
      ...(typeof parsed.createdAt === 'string' ? { createdAt: parsed.createdAt } : {}),
      ...(typeof parsed.updatedAt === 'string' ? { updatedAt: parsed.updatedAt } : {}),
      ...(provenance ? { provenance } : {}),
      ...(projectId ? { projectId } : {}),
    };
  } catch {
    return {};
  }
}
