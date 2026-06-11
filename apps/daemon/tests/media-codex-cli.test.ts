import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateMedia } from '../src/media.js';

// A fake Codex CLI that replays a canned `codex exec --json` turn. It lets
// us exercise the codex-cli image provider's stdout parsing + ground-truth
// file checks with zero ChatGPT tokens and no real Codex login. The
// provider resolves the binary through CODEX_BIN, so pointing that at this
// script is all the injection we need.
//
// `od-codex-image.png` MUST match CODEX_OUTPUT_BASENAME in src/media.ts, and
// the script writes it relative to process.cwd() — which the provider sets
// to the private temp workspace it then reads back.
const FAKE_CODEX = `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'od-codex-image.png');
const mode = process.env.FAKE_CODEX_MODE || 'success';
// Drain stdin so the parent's stdin.end(prompt) never EPIPEs.
try { process.stdin.resume(); process.stdin.on('data', () => {}); } catch {}
function line(itemType, text) {
  return JSON.stringify({ type: 'item.completed', item: { id: 'i1', type: itemType, text } }) + '\\n';
}
function validPng() {
  // 1x1 PNG (real signature + chunks) padded past the provider's 128-byte floor.
  const base = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  return Buffer.concat([base, Buffer.alloc(160, 0)]);
}
function done(out, code, err) {
  if (err) process.stderr.write(err);
  if (out) process.stdout.write(out, () => process.exit(code));
  else process.exit(code);
}
if (mode === 'fail') {
  done('', 1, 'boom: codex blew up\\n');
} else if (mode === 'unavailable') {
  done(line('agent_message', 'IMAGE_GEN_UNAVAILABLE'), 0);
} else if (mode === 'nofile') {
  done(line('agent_message', 'I made the image but could not save it.'), 0);
} else if (mode === 'badpng') {
  writeFileSync(OUT, 'this is not a png at all');
  done(line('agent_message', 'OD_IMAGE_SAVED:' + OUT), 0);
} else {
  writeFileSync(OUT, validPng());
  const out = line('command_execution', 'cp ... ' + OUT) + line('agent_message', 'OD_IMAGE_SAVED:' + OUT);
  done(out, 0);
}
`;

describe('codex-cli image provider', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let codexBinPath: string;
  const originalAllowStubs = process.env.OD_MEDIA_ALLOW_STUBS;
  const originalCodexBin = process.env.CODEX_BIN;
  const originalMode = process.env.FAKE_CODEX_MODE;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-codex-cli-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(path.join(projectsRoot, 'project-1'), { recursive: true });

    codexBinPath = path.join(root, 'fake-codex.mjs');
    await writeFile(codexBinPath, FAKE_CODEX, 'utf8');
    await chmod(codexBinPath, 0o755);

    // Prove failures still throw even when stubs are globally allowed — a
    // local renderer must never silently degrade to a placeholder image.
    process.env.OD_MEDIA_ALLOW_STUBS = '1';
    process.env.CODEX_BIN = codexBinPath;
  });

  afterEach(async () => {
    const restore = (key: string, val: string | undefined) => {
      if (val == null) delete process.env[key];
      else process.env[key] = val;
    };
    restore('OD_MEDIA_ALLOW_STUBS', originalAllowStubs);
    restore('CODEX_BIN', originalCodexBin);
    restore('FAKE_CODEX_MODE', originalMode);
    await rm(root, { recursive: true, force: true });
  });

  const generate = () =>
    generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'codex-image-gen',
      output: 'concept.png',
      prompt: 'an orange cat on a blue cube, flat design',
      aspect: '1:1',
    });

  it('returns the real image bytes from a successful image_gen turn', async () => {
    process.env.FAKE_CODEX_MODE = 'success';
    const result = await generate();
    expect(result.providerId).toBe('codex-cli');
    expect(result.usedStubFallback).toBe(false);
    expect(result.intentionalStub).toBe(false);
    expect(result.providerError).toBeNull();
    expect(result.providerNote).toMatch(/codex-cli\/image_gen/);
    expect(result.name).toMatch(/\.png$/);
    // 68-byte 1x1 PNG + 160 bytes padding — far larger than the 67-byte
    // stub PNG, so a non-zero match proves real bytes flowed through.
    expect(result.size).toBeGreaterThan(200);
  });

  it('throws (no stub fallback) when image_gen is unavailable', async () => {
    process.env.FAKE_CODEX_MODE = 'unavailable';
    await expect(generate()).rejects.toThrow(/image_gen tool is unavailable/i);
  });

  it('throws when codex exits cleanly but writes no image', async () => {
    process.env.FAKE_CODEX_MODE = 'nofile';
    await expect(generate()).rejects.toThrow(/no image at the requested path/i);
  });

  it('throws when the saved file is not a valid PNG', async () => {
    process.env.FAKE_CODEX_MODE = 'badpng';
    await expect(generate()).rejects.toThrow(/not a valid PNG/i);
  });

  it('throws with the stderr tail when codex exits non-zero', async () => {
    process.env.FAKE_CODEX_MODE = 'fail';
    await expect(generate()).rejects.toThrow(/codex image_gen exited exit 1/i);
  });

  it('still spawns Codex under a minimal GUI-launch PATH', async () => {
    // Reproduce the desktop/packaged launch: a daemon PATH with no `node` on
    // it. The fake Codex is a `#!/usr/bin/env node` shim (like the real npm
    // wrapper), so its interpreter only resolves if the provider re-injects
    // the running Node dir into the child PATH the way the daemon's runtime
    // launcher does (resolveAgentLaunch + applyAgentLaunchEnv). Without that
    // symmetry the shebang lookup fails (`env: node: …`, exit 127) and a
    // GUI-launched app can never reach image_gen even with Codex installed.
    process.env.FAKE_CODEX_MODE = 'success';
    const emptyDir = path.join(root, 'empty-path');
    await mkdir(emptyDir, { recursive: true });
    const savedPath = process.env.PATH;
    // `/usr/bin/env` is absolute in the shebang, so it still runs — but it
    // searches this PATH for `node`, which is absent here on purpose.
    process.env.PATH = emptyDir;
    try {
      const result = await generate();
      expect(result.providerId).toBe('codex-cli');
      expect(result.usedStubFallback).toBe(false);
      expect(result.size).toBeGreaterThan(200);
    } finally {
      if (savedPath == null) delete process.env.PATH;
      else process.env.PATH = savedPath;
    }
  });
});
