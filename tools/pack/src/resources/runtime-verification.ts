import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { arch, hostname, platform, release } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
type Host = { platform: string; arch: string };
type RuntimeVerificationInput = {
  resources: string;
  manifest: string;
  expectedVela: string;
  expectedOpenCode: string;
  host?: Host;
  runVersion?: (binary: string) => Promise<string>;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid ${label}`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing ${label}`);
  return value.trim();
}
async function digest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function packageFile(root: string, path: string): Promise<string> {
  const real = await realpath(path);
  const rel = relative(root, real);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
    throw new Error(`package file resolves outside selected resources: ${path}`);
  }
  if (!(await stat(real)).isFile()) throw new Error(`package file is not a regular file: ${path}`);
  return real;
}

/** Inspect installed bytes. This is deliberately separate from runtime regression acceptance. */
export async function verifyPackagedRuntime(input: RuntimeVerificationInput) {
  const expectedVela = text(input.expectedVela, 'expected Vela version');
  const expectedOpenCode = text(input.expectedOpenCode, 'expected OpenCode version');
  const root = await realpath(resolve(text(input.resources, 'resources directory')));
  const manifestPath = await realpath(resolve(text(input.manifest, 'release manifest path')));
  const manifestBytes = await readFile(manifestPath);
  const manifest = object(JSON.parse(manifestBytes.toString('utf8')), 'release manifest');
  const configPath = await packageFile(root, join(root, 'open-design-config.json'));
  const configBytes = await readFile(configPath);
  const config = object(JSON.parse(configBytes.toString('utf8')), 'packaged config');
  const version = text(manifest.releaseVersion, 'manifest releaseVersion');
  if (config.appVersion !== version) throw new Error(`packaged app version ${String(config.appVersion)} does not match manifest ${version}`);
  const channel = text(manifest.channel, 'manifest channel');
  if (channel !== 'prerelease' || !/^\d+\.\d+\.\d+-prerelease\.\d+$/.test(version)) {
    throw new Error('runtime regression verification requires a prerelease manifest and version');
  }
  const host = input.host ?? { platform: platform(), arch: arch() };
  const platformKey = `${({ darwin: 'mac', win32: 'win', linux: 'linux' } as Record<string, string>)[host.platform] ?? 'unsupported'}_${host.arch}`;
  if (!['mac_arm64', 'mac_x64', 'win_x64', 'linux_x64'].includes(platformKey) || manifest.platformKey !== platformKey) {
    throw new Error(`manifest platform ${String(manifest.platformKey)} does not match host ${platformKey}`);
  }
  const commit = text(object(manifest.github, 'manifest github').commit, 'release commit');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('release commit must be an exact SHA');
  const suffix = host.platform === 'win32' ? '.exe' : '';
  // Resolve both before probing either: never fall back to a developer binary on PATH.
  const vela = await packageFile(root, join(root, 'open-design/bin', `vela${suffix}`));
  const opencode = await packageFile(root, join(root, 'open-design/bin/libexec/opencode', `opencode${suffix}`));
  const runVersion = input.runVersion ?? (async (binary: string) => {
    const result = await exec(binary, ['--version'], { timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true, encoding: 'utf8' });
    return result.stdout;
  });
  async function inspect(binary: string, expected: string, label: string) {
    const sha256 = await digest(binary);
    const actual = (await runVersion(binary)).trim();
    if (sha256 !== await digest(binary)) throw new Error(`${label} binary changed during verification`);
    if (actual !== expected) throw new Error(`${label} version ${JSON.stringify(actual)} does not match expected ${expected}`);
    return { path: binary, version: actual, sha256, size: (await stat(binary)).size };
  }
  const binaries = { vela: await inspect(vela, expectedVela, 'Vela'), opencode: await inspect(opencode, expectedOpenCode, 'OpenCode') };
  return {
    schemaVersion: 1,
    scope: 'binary-identity-only',
    capturedAt: new Date().toISOString(),
    machine: { hostname: hostname(), ...host, osRelease: release() },
    resources: root,
    release: { version, channel, platformKey, commit, manifestPath, manifestSha256: createHash('sha256').update(manifestBytes).digest('hex') },
    configSha256: createHash('sha256').update(configBytes).digest('hex'),
    binaries,
  };
}
