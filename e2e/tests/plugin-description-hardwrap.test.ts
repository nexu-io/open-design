// Bundled plugin manifest descriptions are dropped verbatim into the Home
// composer when a user picks an example-prompt card (or "Replicate this
// content" in the plugin detail modal). The composer renders that seed with
// `white-space: pre-wrap`, so a cosmetic hard wrap (a single newline mid
// paragraph, as if the text were formatted for an ~80-col terminal) survives
// as a short ragged line that never fills the editor width — leaving a large
// blank gutter on the right of the input box.
//
// This guard keeps the manifest copy free of those cosmetic wraps. Real
// paragraph breaks (a blank line, i.e. `\n\n`) are allowed; a lone `\n` is
// not. If this fails, reflow the offending `description` / `description_i18n`
// value into flowing text (join wrapped lines, keeping blank-line paragraph
// breaks) rather than re-introducing a runtime reflow.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// A lone newline not adjacent to another newline = a cosmetic intra-paragraph
// hard wrap. `\n\n` (paragraph break) is intentional and allowed.
const INTRA_PARAGRAPH_WRAP = /(?<!\n)\n(?!\n)/;

async function findManifests(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findManifests(full)));
    } else if (entry.name === 'open-design.json') {
      out.push(full);
    }
  }
  return out;
}

function collectDescriptionStrings(manifest: Record<string, unknown>): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];
  if (typeof manifest.description === 'string') {
    fields.push({ field: 'description', value: manifest.description });
  }
  const i18n = manifest.description_i18n;
  if (i18n && typeof i18n === 'object') {
    for (const [locale, value] of Object.entries(i18n as Record<string, unknown>)) {
      if (typeof value === 'string') {
        fields.push({ field: `description_i18n.${locale}`, value });
      }
    }
  }
  return fields;
}

describe('bundled plugin manifest descriptions', () => {
  it('[P2] contain no cosmetic intra-paragraph hard wraps (would blank the composer right gutter)', async () => {
    const manifests = await findManifests(path.join(repoRoot, 'plugins', '_official'));
    expect(manifests.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of manifests) {
      let manifest: Record<string, unknown>;
      try {
        manifest = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      } catch (error) {
        throw new Error(`Failed to parse plugin manifest: ${file}`, { cause: error });
      }
      for (const { field, value } of collectDescriptionStrings(manifest)) {
        if (INTRA_PARAGRAPH_WRAP.test(value)) {
          violations.push(`${path.relative(repoRoot, file)} → ${field}`);
        }
      }
    }

    expect(violations, `Manifest descriptions with cosmetic hard wraps:\n${violations.join('\n')}`).toEqual([]);
  });
});
