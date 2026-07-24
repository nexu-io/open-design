// The Community gallery's "Newest" sort ranks bundled templates by the
// manifest's `publishedAt` (apps/web/src/components/plugins-home/sortOrder.ts).
// That field is the only recency signal that survives a fresh install: the
// installed-record timestamps are stamped when a machine seeds its own
// database, so a first boot stamps the entire bundled catalog milliseconds
// apart in folder-walk order and "Newest" would degrade back to an order
// unrelated to publication (#1457).
//
// This guard keeps the signal from silently eroding: every bundled plugin
// manifest must declare a parseable ISO 8601 `publishedAt`. When adding a
// new template, stamp the authoring time — `date -u +%Y-%m-%dT%H:%M:%SZ` —
// next to `version` in `open-design.json`. Do not copy the date from a
// neighboring template: a wrong-but-parseable date places the template at
// the wrong spot in the Newest shelf, which this check cannot see.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

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

describe('bundled plugin manifest publishedAt', () => {
  it('[P2] every bundled manifest declares a parseable publishedAt (keeps the Newest sort meaningful)', async () => {
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
      const raw = manifest.publishedAt;
      if (typeof raw !== 'string' || !Number.isFinite(Date.parse(raw))) {
        violations.push(`${path.relative(repoRoot, file)} → publishedAt=${JSON.stringify(raw)}`);
      }
    }

    expect(
      violations,
      `Bundled manifests missing a parseable publishedAt (stamp the authoring time, see docblock):\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
