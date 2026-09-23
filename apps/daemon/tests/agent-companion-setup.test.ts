import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AgentCompanionSetupError,
  installDeepSeekHarnessCompanion,
} from '../src/agent-companion-setup.js';

const roots: string[] = [];
const originalDshBin = process.env.DSH_BIN;
const originalDshHome = process.env.DSH_HOME;
const originalMode = process.env.OD_DSH_SETUP_FAKE_MODE;
const originalAgentHome = process.env.OD_AGENT_HOME;
const originalPath = process.env.PATH;

afterEach(async () => {
  if (originalDshBin === undefined) delete process.env.DSH_BIN;
  else process.env.DSH_BIN = originalDshBin;
  if (originalDshHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = originalDshHome;
  if (originalMode === undefined) delete process.env.OD_DSH_SETUP_FAKE_MODE;
  else process.env.OD_DSH_SETUP_FAKE_MODE = originalMode;
  if (originalAgentHome === undefined) delete process.env.OD_AGENT_HOME;
  else process.env.OD_AGENT_HOME = originalAgentHome;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture(options: { existingProfile?: boolean; validHash?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'od-dsh-companion-'));
  roots.push(root);
  const resourceRoot = path.join(root, 'resources');
  const runtimeDataDir = path.join(root, 'data');
  const dshHome = path.join(root, 'dsh home');
  const bundleRoot = path.join(resourceRoot, 'agent-runtimes', 'deepseek-harness');
  const tarball = path.join(bundleRoot, 'open-design-dsh-runtime-0.1.0.tgz');
  const stateFile = path.join(root, 'plugin-add-count.txt');
  await mkdir(bundleRoot, { recursive: true });
  await mkdir(runtimeDataDir, { recursive: true });
  await mkdir(dshHome, { recursive: true });
  await writeFile(tarball, 'fixture runtime package', 'utf8');
  const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await writeFile(path.join(bundleRoot, 'manifest.json'), `${JSON.stringify({
    file: path.basename(tarball),
    packageName: '@open-design/dsh-runtime',
    schemaVersion: 1,
    sha256: options.validHash === false ? '0'.repeat(64) : sha256,
    version: '0.1.0',
  })}\n`, 'utf8');
  if (options.existingProfile) {
    const profileRoot = path.join(dshHome, 'profiles', 'open-design');
    await mkdir(profileRoot, { recursive: true });
    await writeFile(path.join(profileRoot, 'package.json'), '{}\n', 'utf8');
  }

  const script = path.join(root, 'fake-dsh.mjs');
  await writeFile(script, `
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
const home = process.env.DSH_HOME;
const profileRoot = path.join(home, 'profiles', 'open-design');
const marker = path.join(profileRoot, '.installed');
if (args[0] === '--version') {
  process.stdout.write('0.1.0-rc.6\\n');
} else if (args.includes('--probe')) {
  try {
    await readFile(marker);
    process.stdout.write(JSON.stringify({v:1,type:'probe',runtime:'open-design',protocol_version:1,plugin_version:'0.1.0',capabilities:{session_resume:true,session_cancel:true,structured_events:true}}) + '\\n');
  } catch {
    process.exitCode = 1;
  }
} else if (args[0] === 'plugin' && args[1] === '--profile' && args[2] === 'open-design' && args[3] === 'add') {
  if (process.env.OD_DSH_SETUP_FAKE_MODE === 'install-fail') process.exit(7);
  if (process.env.OD_DSH_SETUP_FAKE_MODE === 'require-profile-bundle') {
    const [directory, filename, extra] = args[4].split('/');
    const digest = filename?.endsWith('.tgz') ? filename.slice(0, -4) : '';
    const digestIsHex = digest.length === 64 && digest.replace(/[a-f0-9]/g, '') === '';
    if (directory !== '.open-design' || extra !== undefined || !digestIsHex) process.exit(8);
    const bundle = await readFile(path.join(profileRoot, args[4]), 'utf8');
    if (bundle !== 'fixture runtime package') process.exit(9);
  }
  await mkdir(profileRoot, { recursive: true });
  let count = 0;
  try { count = Number(await readFile(${JSON.stringify(stateFile)}, 'utf8')); } catch {}
  await writeFile(${JSON.stringify(stateFile)}, String(count + 1), 'utf8');
  await writeFile(path.join(profileRoot, 'package.json'), '{}\\n', 'utf8');
  if (process.env.OD_DSH_SETUP_FAKE_MODE !== 'probe-fail') await writeFile(marker, 'ok', 'utf8');
} else {
  process.exitCode = 2;
}
`, 'utf8');
  const carrier = process.platform === 'win32' ? path.join(root, 'dsh.cmd') : path.join(root, 'dsh');
  await writeFile(
    carrier,
    process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
    'utf8',
  );
  if (process.platform !== 'win32') await chmod(carrier, 0o755);
  process.env.DSH_BIN = carrier;
  process.env.DSH_HOME = dshHome;
  delete process.env.OD_DSH_SETUP_FAKE_MODE;
  return {
    options: { projectRoot: root, resourceRoot, runtimeDataDir },
    profileRoot: path.join(dshHome, 'profiles', 'open-design'),
    stateFile,
  };
}

async function expectSetupError(promise: Promise<unknown>, code: AgentCompanionSetupError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('DeepSeek Harness companion setup', () => {
  it('installs into an empty profile and is idempotent', async () => {
    const test = await fixture();
    const first = await installDeepSeekHarnessCompanion(test.options);
    expect(first).toMatchObject({ action: 'installed', ok: true, packageVersion: '0.1.0' });
    expect(first.agent.available).toBe(true);

    const second = await installDeepSeekHarnessCompanion(test.options);
    expect(second).toMatchObject({ action: 'already-compatible', ok: true });
    await expect(readFile(test.stateFile, 'utf8')).resolves.toBe('1');
  });

  it('reports repaired only when a profile existed before setup', async () => {
    const test = await fixture({ existingProfile: true });
    await expect(installDeepSeekHarnessCompanion(test.options)).resolves.toMatchObject({
      action: 'repaired',
      ok: true,
    });
  });

  it('rejects a corrupt bundled package before invoking dsh', async () => {
    const test = await fixture({ validHash: false });
    await expectSetupError(
      installDeepSeekHarnessCompanion(test.options),
      'BUNDLED_COMPANION_INVALID',
    );
    await expect(readFile(test.stateFile, 'utf8')).rejects.toThrow();
  });

  it('quick-fails when the official dsh executable is absent', async () => {
    const test = await fixture();
    process.env.DSH_BIN = path.join(path.dirname(test.stateFile), 'missing-dsh.cmd');
    process.env.OD_AGENT_HOME = path.join(path.dirname(test.stateFile), 'empty-agent-home');
    process.env.PATH = '';
    await expectSetupError(
      installDeepSeekHarnessCompanion(test.options),
      'AGENT_NOT_INSTALLED',
    );
    await expect(readFile(test.stateFile, 'utf8')).rejects.toThrow();
  });

  it('classifies install and post-install probe failures', async () => {
    const installFailure = await fixture();
    process.env.OD_DSH_SETUP_FAKE_MODE = 'install-fail';
    await expectSetupError(
      installDeepSeekHarnessCompanion(installFailure.options),
      'COMPANION_INSTALL_FAILED',
    );

    const probeFailure = await fixture();
    process.env.OD_DSH_SETUP_FAKE_MODE = 'probe-fail';
    await expectSetupError(
      installDeepSeekHarnessCompanion(probeFailure.options),
      'COMPANION_STILL_INCOMPATIBLE',
    );
  });

  it('keeps the bundled package path out of the dsh Windows shell boundary', async () => {
    const test = await fixture();
    process.env.OD_DSH_SETUP_FAKE_MODE = 'require-profile-bundle';

    await expect(installDeepSeekHarnessCompanion(test.options)).resolves.toMatchObject({
      action: 'installed',
      ok: true,
    });
  });

  it('deduplicates concurrent setup requests', async () => {
    const test = await fixture();
    const first = installDeepSeekHarnessCompanion(test.options);
    const second = installDeepSeekHarnessCompanion(test.options);
    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ action: 'installed', ok: true });
    await expect(readFile(test.stateFile, 'utf8')).resolves.toBe('1');
  });
});
