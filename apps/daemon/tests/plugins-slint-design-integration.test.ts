// Integration coverage for community plugin `slint-design` (#8405).
// Fast, non-flaky: no Electron, no full daemon GUI e2e, no live MCP fetch.
// Complements plugins/community/slint-design/scripts/{smoke.sh,integration-check.mjs}.

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  flattenValidationDiagnostics,
  validatePluginFolder,
} from '../src/plugins/validate.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const pluginRoot = path.join(repoRoot, 'plugins/community/slint-design');
const stubReadme = path.join(repoRoot, 'plugins/slint-design/README.md');
const marketplacePath = path.join(
  repoRoot,
  'plugins/registry/community/open-design-marketplace.json',
);

describe('community/slint-design integration', () => {
  it('validates the plugin folder (manifest + SKILL) with no errors', async () => {
    const result = await validatePluginFolder({ folder: pluginRoot });
    const errors = flattenValidationDiagnostics(result).filter((d) => d.severity === 'error');
    expect(result.resolveErrors, result.resolveErrors.join('; ')).toEqual([]);
    expect(errors, errors.map((e) => `${e.code}: ${e.message}`).join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
  }, 10_000);

  it('declares image preview via poster and rejects html entry', () => {
    const manifest = JSON.parse(readFileSync(path.join(pluginRoot, 'open-design.json'), 'utf8'));
    expect(manifest.name).toBe('slint-design');
    expect(manifest.od.preview.type).toBe('image');
    expect(manifest.od.preview.entry).toBeUndefined();
    expect(typeof manifest.od.preview.poster).toBe('string');
    const posterAbs = path.resolve(pluginRoot, manifest.od.preview.poster);
    expect(existsSync(posterAbs)).toBe(true);
    const docs = (manifest.od.context?.mcp ?? []).find(
      (m: { name?: string }) => m.name === 'slint-docs',
    );
    expect(docs?.url).toBe('https://docs.slint.dev/mcp');
  });

  it('is discoverable in the community marketplace catalog', () => {
    const market = JSON.parse(readFileSync(marketplacePath, 'utf8'));
    const entry = (market.plugins ?? []).find(
      (p: { name?: string }) => p.name === 'community/slint-design',
    );
    expect(entry).toBeTruthy();
    const manifest = JSON.parse(readFileSync(path.join(pluginRoot, 'open-design.json'), 'utf8'));
    expect(entry.version).toBe(manifest.version);
    const sub = String(entry.source ?? '').replace(
      /^github:nexu-io\/open-design(?:@[^/]+)?\//,
      '',
    );
    expect(sub).toBe('plugins/community/slint-design');
  });

  it('keeps the legacy stub README pointing at the community path', () => {
    expect(existsSync(stubReadme)).toBe(true);
    const body = readFileSync(stubReadme, 'utf8');
    expect(body).toContain('plugins/community/slint-design');
  });

  it('passes the zero-deps integration-check script', () => {
    const script = path.join(pluginRoot, 'scripts/integration-check.mjs');
    const r = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      timeout: 30_000,
      env: process.env,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  }, 35_000);

  it('passes smoke.sh (--check + best-effort screenshots) when viewer is present', () => {
    const viewer = process.env.SLINT_VIEWER || 'slint-viewer';
    let available = false;
    try {
      if (viewer.startsWith('/')) accessSync(viewer, constants.X_OK);
      else {
        const which = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(viewer)}`], {
          encoding: 'utf8',
        });
        available = which.status === 0;
      }
      if (viewer.startsWith('/')) available = true;
    } catch {
      available = false;
    }
    if (!available) {
      // CI jobs without Rust pin still run the other assertions above.
      return;
    }
    const smoke = path.join(pluginRoot, 'scripts/smoke.sh');
    const r = spawnSync('bash', [smoke], {
      encoding: 'utf8',
      timeout: 60_000,
      env: process.env,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  }, 65_000);
});
