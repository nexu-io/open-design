import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const deployDir = join(import.meta.dirname, '..');
const baseCompose = join(deployDir, 'docker-compose.yml');
const snapCompose = join(deployDir, 'docker-compose.snap.yml');
const readme = join(deployDir, 'README.md');

test('base compose keeps the security defaults that snap Docker rejects', async () => {
  const text = await readFile(baseCompose, 'utf8');
  assert.match(text, /^\s*read_only:\s*true\s*$/m);
  assert.match(text, /no-new-privileges:true/);
});

test('snap compose override relaxes only the tini-blocking hardening flags', async () => {
  const text = await readFile(snapCompose, 'utf8');
  // Escape hatch must flip the two flags from the issue report (#6488).
  assert.match(text, /^\s*read_only:\s*false\s*$/m);
  assert.match(text, /security_opt:\s*!reset\s*\[\]/);
  // Active YAML keys must not re-enable the flag (comments may still name it).
  assert.doesNotMatch(text, /^\s*-\s*no-new-privileges/m);
  // Document the failure mode so operators can find the file from logs.
  assert.match(text, /exec \/sbin\/tini: operation not permitted/);
  assert.match(text, /snap/i);
});

test('deploy README documents the snap Docker tini failure and escape hatch', async () => {
  const text = await readFile(readme, 'utf8');
  assert.match(text, /Snap Docker \(Linux\)/);
  assert.match(text, /exec \/sbin\/tini: operation not permitted/);
  assert.match(text, /docker-compose\.snap\.yml/);
  assert.match(text, /docs\.docker\.com\/engine\/install/);
});

test(
  'merged compose config drops read_only and no-new-privileges when snap override is applied',
  async (t) => {
    // Needs a working Compose v2 that understands !reset.
    let composeOk = false;
    try {
      await execFileAsync('docker', ['compose', 'version'], { timeout: 5000 });
      composeOk = true;
    } catch {
      composeOk = false;
    }
    if (!composeOk) {
      t.skip('docker compose not available');
      return;
    }

    const env = {
      ...process.env,
      // Avoid pulling/building; config only resolves the merge.
      OPEN_DESIGN_IMAGE: 'ghcr.io/nexu-io/od:latest',
    };

    const { stdout: baseOnly } = await execFileAsync(
      'docker',
      ['compose', '-f', baseCompose, 'config'],
      { timeout: 30_000, cwd: deployDir, env },
    );
    // Sanity: base hardening is still present without the escape hatch.
    assert.match(baseOnly, /read_only:\s*true/);
    assert.match(baseOnly, /no-new-privileges/);

    const { stdout: withSnap } = await execFileAsync(
      'docker',
      ['compose', '-f', baseCompose, '-f', snapCompose, 'config'],
      { timeout: 30_000, cwd: deployDir, env },
    );

    // Compose omits default-false fields, so success is "no longer hardened":
    // read_only:true and no-new-privileges must both be gone after the merge.
    assert.doesNotMatch(withSnap, /read_only:\s*true/);
    assert.doesNotMatch(withSnap, /no-new-privileges/);
  },
);
