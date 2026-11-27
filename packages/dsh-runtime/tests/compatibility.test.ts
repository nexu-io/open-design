import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import * as protocol from '../src/protocol.js';

function generation(launcher: string | undefined, composition: unknown, startedAt = Date.now() + 1) {
  return protocol.resolveCompatibilityGeneration(launcher, composition, startedAt);
}

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function launcher(version = '0.1.1-rc.2') {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-dsh-identity-'));
  directories.push(dir);
  mkdirSync(path.join(dir, 'lib'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }));
  const entry = path.join(dir, 'lib', 'bin.js');
  writeFileSync(entry, 'fixture-launcher');
  return entry;
}

it('emits a bounded opaque generation from actual launcher and composition inputs', () => {
  const entry = launcher();
  const current = generation(entry, [{ name: 'tools', config: { confined: true } }]);
  expect(current).toMatch(/^[a-f0-9]{64}$/u);
  expect(generation(entry, [{ name: 'tools', config: { confined: true } }])).toBe(current);
  expect(generation(entry, [{ name: 'tools', config: { confined: false } }])).not.toBe(current);
});

it('changes generation for an upgrade, rollback, or replaced executable', () => {
  const entry = launcher();
  const original = generation(entry, []);
  writeFileSync(path.resolve(entry, '../../package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.2-rc.1' }));
  expect(generation(entry, [])).not.toBe(original);
  writeFileSync(path.resolve(entry, '../../package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.1-rc.2' }));
  expect(generation(entry, [])).toBe(original);
  writeFileSync(entry, 'replaced-launcher');
  expect(generation(entry, [])).not.toBe(original);
});

it('fails closed when launcher or composition cannot be identified', () => {
  expect(generation(undefined, [])).toBeNull();
  expect(generation('/missing/launcher', [])).toBeNull();
  expect(generation(launcher(), undefined)).toBeNull();
  expect(generation(launcher(), [{ config: () => 'dynamic' }])).toBeNull();
});

it('refuses non-JSON composition values rather than hashing away their behavior', () => {
  const entry = launcher();
  for (const config of [/allow/u, new Map([['permission', 'allow']]), new Date(0)]) {
    expect(generation(entry, [{ config }])).toBeNull();
  }
});

it('does not label an already-started process with a replacement installed during boot', () => {
  const entry = launcher();
  const beforeReplacement = statSync(entry).ctimeMs - 1;
  expect(generation(entry, [], beforeReplacement)).toBeNull();
});
