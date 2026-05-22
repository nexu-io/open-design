// Regression test for readProjectPluginManifest crashing on malformed JSON (issue #2746).
//
// Previously JSON.parse was called with no try/catch, so a corrupted or
// hand-edited open-design.json produced a bare SyntaxError with no path
// context, making it hard to diagnose which plugin was broken.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectPluginManifest } from '../src/server.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-manifest-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('readProjectPluginManifest', () => {
  it('throws a descriptive error when open-design.json contains malformed JSON', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), '{ "name": "broken", }');
    await expect(readProjectPluginManifest(tmpDir)).rejects.toThrow(
      /open-design\.json.*invalid JSON/i,
    );
  });

  it('error message includes the folder path so the broken plugin is identifiable', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), 'not json at all');
    const err = await readProjectPluginManifest(tmpDir).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(tmpDir);
  });

  it('error message preserves the original parser detail so the bad token is findable', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), '{ "name": "broken", }');
    const err = await readProjectPluginManifest(tmpDir).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    // Must contain both the folder path and the SyntaxError detail from JSON.parse.
    expect(msg).toContain(tmpDir);
    expect(msg.toLowerCase()).toMatch(/unexpected|json|token|position/);
  });

  it('parses a valid manifest and returns name/title/version', async () => {
    await writeFile(
      path.join(tmpDir, 'open-design.json'),
      JSON.stringify({ name: 'my-plugin', title: 'My Plugin', version: '1.2.3' }),
    );
    const result = await readProjectPluginManifest(tmpDir);
    expect(result.name).toBe('my-plugin');
    expect(result.title).toBe('My Plugin');
    expect(result.version).toBe('1.2.3');
  });
});
