// Phase 4 / spec §11.5 / plan §3.W1 — validatePluginFolder.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  flattenValidationDiagnostics,
  validatePluginFolder,
} from '../src/plugins/validate.js';

let folder: string;

beforeEach(async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-validate-'));
  folder = path.join(tmp, 'my-plugin');
  await mkdir(folder, { recursive: true });
});

afterEach(async () => {
  await rm(path.dirname(folder), { recursive: true, force: true });
});

async function writeManifest(body: Record<string, unknown>) {
  await writeFile(path.join(folder, 'open-design.json'), JSON.stringify(body, null, 2));
}

async function writeSkill(body: string) {
  await writeFile(path.join(folder, 'SKILL.md'), body);
}

describe('validatePluginFolder', () => {
  it('passes a clean manifest + SKILL.md with no registry refs', async () => {
    await writeManifest({
      name: 'my-plugin',
      version: '0.1.0',
      title: 'Test plugin',
      od: { taskKind: 'new-generation' },
    });
    await writeSkill('---\nname: my-plugin\n---\n# Test plugin\n');
    const result = await validatePluginFolder({ folder });
    expect(result.ok).toBe(true);
    const diagnostics = flattenValidationDiagnostics(result);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('flags an empty folder with a resolve-time error', async () => {
    const result = await validatePluginFolder({ folder });
    expect(result.ok).toBe(false);
    expect(result.resolveErrors.length).toBeGreaterThan(0);
  });

  it('rejects malformed open-design.json with a parse error', async () => {
    await writeFile(path.join(folder, 'open-design.json'), '{ this is not json');
    const result = await validatePluginFolder({ folder });
    expect(result.ok).toBe(false);
    expect(result.resolveErrors.some((e) => e.includes('open-design.json'))).toBe(true);
  });

  it('flags an unknown atom id in od.pipeline', async () => {
    await writeManifest({
      name: 'pipe',
      version: '0.1.0',
      od: {
        taskKind: 'new-generation',
        pipeline: { stages: [{ id: 'one', atoms: ['no-such-atom'] }] },
      },
    });
    const result = await validatePluginFolder({ folder });
    const diagnostics = flattenValidationDiagnostics(result);
    expect(diagnostics.some((d) => d.severity === 'error' && d.code.includes('atom'))).toBe(true);
  });

  it('flags an unparseable until expression as an error', async () => {
    await writeManifest({
      name: 'pipe',
      version: '0.1.0',
      od: {
        taskKind: 'new-generation',
        pipeline: {
          stages: [
            {
              id: 'critique',
              atoms: ['critique-theater'],
              repeat: true,
              until: 'this is not a valid until expression',
            },
          ],
        },
      },
    });
    const result = await validatePluginFolder({ folder });
    const diagnostics = flattenValidationDiagnostics(result);
    expect(diagnostics.some((d) => d.severity === 'error' && d.code.includes('until'))).toBe(true);
  });

  it('emits warnings (not errors) for unresolved skill refs when no registry is supplied', async () => {
    await writeManifest({
      name: 'with-skill',
      version: '0.1.0',
      od: {
        taskKind: 'new-generation',
        context: { skills: [{ ref: 'missing-skill' }] },
      },
    });
    const result = await validatePluginFolder({ folder });
    // Without a registry, ref-resolution warnings stay informational.
    expect(result.ok).toBe(true);
  });

  it('promotes a missing skill ref to a warning when an empty registry is supplied', async () => {
    await writeManifest({
      name: 'with-skill',
      version: '0.1.0',
      od: {
        taskKind: 'new-generation',
        context: { skills: [{ ref: 'missing-skill' }] },
      },
    });
    const result = await validatePluginFolder({
      folder,
      registry: { skills: [], designSystems: [], craft: [], atoms: [] },
    });
    const diagnostics = flattenValidationDiagnostics(result);
    expect(diagnostics.some((d) => d.message.includes('missing-skill') || d.message.includes('skill'))).toBe(true);
  });

  it('flattenValidationDiagnostics merges resolve + doctor diagnostics in order', async () => {
    await writeFile(path.join(folder, 'open-design.json'), '{ broken');
    const result = await validatePluginFolder({ folder });
    const flat = flattenValidationDiagnostics(result);
    // Resolve errors come first.
    expect(flat[0]?.severity).toBe('error');
    expect(flat[0]?.code).toBe('manifest.resolve');
  });
});
