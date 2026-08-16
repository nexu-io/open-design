import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return await listTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  }))).flat();
}

describe('mac local saturation driver', () => {
  it('runs full headless saturation by default without borrowing a real release channel', async () => {
    const script = await readFile(join(e2eRoot, 'scripts', 'mac-local-saturation.sh'), 'utf8');

    expect(script).toContain('OD_MAC_LOCAL_SMOKE_PROFILE:-full');
    expect(script).toContain('RELEASE_CHANNEL=local');
    expect(script).toContain('DEBUG_CHANNEL="exact:$RELEASE_CHANNEL"');
    expect(script).toContain('OD_MAC_LOCAL_EXACT_NAME:-e2e$RUN_DIGEST');
    expect(script).toContain('OD_PACKAGED_E2E_HEADLESS=1');
    expect(script).toContain('STANDALONE_SEED_EMBEDDED=1');
    expect(script).toContain('STANDALONE_SEED_EMBEDDED=0');
    expect(script).toContain('OD_PACKAGED_E2E_MAC_SMOKE_LANES=shell,standalone');
    expect(script).toContain('OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE=tools-serve');
    expect(script).toContain('build-distribution-shared');
    expect(script).toContain('build-distribution-target');
    expect(script).toContain('merge-closure-distribution');
    expect(script).toContain('scripts/release-smoke.ts mac specs/mac.spec.ts');
    expect(script).toContain('OPEN_DESIGN_AMR_PROFILE=test');
    expect(script).toContain('--to dmg');
    expect(script).toContain("tr '[:upper:]' '[:lower:]'");
    expect(script).toContain('mac-local-$RUN_SLUG');
    expect(script).toContain('lowercase filesystem-safe segment');
    expect(script).not.toMatch(/(?:^|\s)--portable(?:\s|$)/u);
  });

  it('is exposed as the package-level mac smoke command', async () => {
    const pkg = JSON.parse(await readFile(join(e2eRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['smoke:mac:local']).toBe('bash scripts/mac-local-saturation.sh');
  });

  it('keeps platform lifecycle specs split into reviewable units', async () => {
    for (const platform of ['mac', 'win']) {
      const files = await listTypeScriptFiles(join(e2eRoot, 'specs', platform));
      expect(files.length).toBeGreaterThan(1);
      for (const file of files) {
        const lines = (await readFile(file, 'utf8')).split(/\r?\n/u).length;
        expect(lines, `${file} should stay below the platform spec size boundary`).toBeLessThan(800);
      }
    }
  });
});
