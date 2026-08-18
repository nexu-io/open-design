/**
 * Regression coverage for the Linux AppImage cold-start prewarm in
 * apps/packaged/src/prewarm.ts.
 *
 * Background: every AppImage launch mounts a fresh FUSE squashfs whose VFS
 * page cache is cold, so the daemon sidecar demand-pages its 124 MB bundled
 * node binary (plus JS payload) through FUSE on EVERY launch while Electron
 * faults through the same mount. Demand-paged cold starts measured ~25-60s on
 * a mid-range Linux box and routinely blew past the 35s status budget, while
 * the same payload read sequentially takes ~3s. The prewarm pass reads the
 * sidecar payload into the page cache before spawning so the timed window
 * only covers real daemon work.
 *
 * @see apps/packaged/src/prewarm.ts
 * @see https://github.com/nexu-io/open-design/issues/5835
 */
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectPrewarmFiles,
  detectFuseBackedPath,
  prewarmFiles,
  prewarmPackagedFiles,
  resolveDaemonPrewarmTargets,
  resolveWebPrewarmTargets,
  unescapeProcMountsField,
} from '../src/prewarm.js';

const MOUNTS_FIXTURE = [
  'proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
  '/dev/sda1 / ext4 rw,relatime 0 0',
  'tmpfs /tmp tmpfs rw,nosuid,nodev 0 0',
  'Open\\040Design-default.AppImage /tmp/.mount_Open\\040DePl0rQ fuse.Open\\040Design-default.AppImage ro,nosuid,nodev,relatime,user_id=1000,group_id=1000 0 0',
].join('\n');

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'od-prewarm-test-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root != null) rmSync(root, { recursive: true, force: true });
  }
});

describe('unescapeProcMountsField', () => {
  it('decodes octal escapes used for space, tab, newline and backslash', () => {
    expect(unescapeProcMountsField('/tmp/.mount_Open\\040DePl0rQ')).toBe('/tmp/.mount_Open DePl0rQ');
    expect(unescapeProcMountsField('a\\011b\\012c\\134d')).toBe('a\tb\nc\\d');
    expect(unescapeProcMountsField('/plain/path')).toBe('/plain/path');
  });
});

describe('detectFuseBackedPath', () => {
  it('detects a path under an AppImage FUSE mount with an escaped space', () => {
    expect(
      detectFuseBackedPath('/tmp/.mount_Open DePl0rQ/resources/open-design/bin/node', MOUNTS_FIXTURE),
    ).toBe(true);
  });

  it('matches the mountpoint itself', () => {
    expect(detectFuseBackedPath('/tmp/.mount_Open DePl0rQ', MOUNTS_FIXTURE)).toBe(true);
  });

  it('returns false for a path on a regular filesystem', () => {
    expect(detectFuseBackedPath('/usr/bin/node', MOUNTS_FIXTURE)).toBe(false);
  });

  it('prefers the longest matching mountpoint over shorter prefixes', () => {
    const mounts = [
      '/dev/sda1 / ext4 rw,relatime 0 0',
      'squashfuse /opt/app fuse.squashfuse ro,relatime 0 0',
    ].join('\n');
    expect(detectFuseBackedPath('/opt/app/resources/node', mounts)).toBe(true);
    expect(detectFuseBackedPath('/etc/hostname', mounts)).toBe(false);
  });

  it('does not match a sibling directory that merely shares a path prefix', () => {
    const mounts = [
      '/dev/sda1 / ext4 rw,relatime 0 0',
      'squashfuse /opt/app fuse.squashfuse ro,relatime 0 0',
    ].join('\n');
    expect(detectFuseBackedPath('/opt/app-other/node', mounts)).toBe(false);
  });

  it('returns null when no mountpoint matches', () => {
    expect(detectFuseBackedPath('/somewhere/else', 'proc /proc proc rw 0 0')).toBe(null);
  });
});

describe('resolveDaemonPrewarmTargets', () => {
  it('includes the bundled node binary, the daemon dist dir and the bundled plugins', () => {
    const targets = resolveDaemonPrewarmTargets({
      nodeCommand: '/res/open-design/bin/node',
      daemonSidecarEntry: '/res/app/node_modules/@open-design/daemon/dist/sidecar/index.js',
      resourceRoot: '/res/open-design',
    });
    expect(targets).toEqual([
      { kind: 'file', path: '/res/open-design/bin/node' },
      { kind: 'dir', path: '/res/app/node_modules/@open-design/daemon/dist' },
      { kind: 'dir', path: '/res/open-design/plugins' },
    ]);
  });

  it('omits the node binary when the sidecar would run under Electron-as-node', () => {
    const targets = resolveDaemonPrewarmTargets({
      nodeCommand: null,
      daemonSidecarEntry: '/res/app/node_modules/@open-design/daemon/dist/sidecar/index.js',
      resourceRoot: '/res/open-design',
    });
    expect(targets).toEqual([
      { kind: 'dir', path: '/res/app/node_modules/@open-design/daemon/dist' },
      { kind: 'dir', path: '/res/open-design/plugins' },
    ]);
  });

  it('omits the plugins dir when the resource root is unknown', () => {
    const targets = resolveDaemonPrewarmTargets({
      nodeCommand: '/res/open-design/bin/node',
      daemonSidecarEntry: '/res/app/node_modules/@open-design/daemon/dist/sidecar/index.js',
      resourceRoot: null,
    });
    expect(targets).toEqual([
      { kind: 'file', path: '/res/open-design/bin/node' },
      { kind: 'dir', path: '/res/app/node_modules/@open-design/daemon/dist' },
    ]);
  });
});

describe('resolveWebPrewarmTargets', () => {
  const entry = '/res/app/node_modules/@open-design/web/dist/sidecar/index.js';

  it('covers the web sidecar, Next server chunks and framework server code in server mode', () => {
    // next/dist/compiled (~107 MB) is intentionally excluded: only a small
    // fraction of it is required during the status window, and the rest is
    // demand-loaded on first paint, which has no hard timeout.
    const targets = resolveWebPrewarmTargets({
      webSidecarEntry: entry,
      webStandaloneRoot: null,
      resolveNextPackageRoot: () => '/res/app/node_modules/next',
    });
    expect(targets).toEqual([
      { kind: 'dir', path: '/res/app/node_modules/@open-design/web/dist/sidecar' },
      { kind: 'dir', path: '/res/app/node_modules/@open-design/web/.next/server' },
      { kind: 'dir', path: '/res/app/node_modules/next/dist/server' },
    ]);
  });

  it('falls back to the standalone bundle root in standalone mode', () => {
    const targets = resolveWebPrewarmTargets({
      webSidecarEntry: entry,
      webStandaloneRoot: '/res/open-design-web-standalone',
      resolveNextPackageRoot: () => '/res/app/node_modules/next',
    });
    expect(targets).toEqual([{ kind: 'dir', path: '/res/open-design-web-standalone' }]);
  });

  it('skips the Next framework dirs when next cannot be resolved', () => {
    const targets = resolveWebPrewarmTargets({
      webSidecarEntry: entry,
      webStandaloneRoot: null,
      resolveNextPackageRoot: () => null,
    });
    expect(targets).toEqual([
      { kind: 'dir', path: '/res/app/node_modules/@open-design/web/dist/sidecar' },
      { kind: 'dir', path: '/res/app/node_modules/@open-design/web/.next/server' },
    ]);
  });

  it('returns no targets when the web sidecar entry is unknown', () => {
    expect(
      resolveWebPrewarmTargets({ webSidecarEntry: null, webStandaloneRoot: null }),
    ).toEqual([]);
  });
});

describe('collectPrewarmFiles', () => {
  it('walks directories recursively, keeps plain files, and skips missing paths and symlinks', async () => {
    const root = makeTempRoot();
    const dir = join(root, 'dist');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'a.js'), 'aaa');
    writeFileSync(join(dir, 'nested', 'b.js'), 'bbbbb');
    writeFileSync(join(root, 'node.bin'), 'nn');
    symlinkSync(join(dir, 'a.js'), join(dir, 'link.js'));

    const resolved = await collectPrewarmFiles([
      { kind: 'dir', path: dir },
      { kind: 'file', path: join(root, 'node.bin') },
      { kind: 'file', path: join(root, 'missing.bin') },
    ]);
    expect(resolved).toEqual([
      join(dir, 'a.js'),
      join(dir, 'nested', 'b.js'),
      join(root, 'node.bin'),
    ]);
  });
});

describe('prewarmFiles', () => {
  it('reads every file fully and reports totals, skipping unreadable entries', async () => {
    const root = makeTempRoot();
    writeFileSync(join(root, 'one.bin'), Buffer.alloc(10_000, 1));
    writeFileSync(join(root, 'two.bin'), Buffer.alloc(20_000, 2));

    const report = await prewarmFiles([
      join(root, 'one.bin'),
      join(root, 'two.bin'),
      join(root, 'gone.bin'),
    ]);
    expect(report.files).toBe(2);
    expect(report.bytes).toBe(30_000);
  });
});

describe('prewarmPackagedFiles', () => {
  it('skips on non-linux platforms', async () => {
    const report = await prewarmPackagedFiles([], { platform: 'darwin' });
    expect(report.skipped).toBe(true);
    expect(report.reason).toBe('not-linux');
  });

  it('skips when there is nothing to prewarm', async () => {
    const report = await prewarmPackagedFiles([], { platform: 'linux' });
    expect(report.skipped).toBe(true);
    expect(report.reason).toBe('no-targets');
  });

  it('skips when the payload is not backed by a FUSE mount', async () => {
    const root = makeTempRoot();
    writeFileSync(join(root, 'node.bin'), 'nn');
    const report = await prewarmPackagedFiles([{ kind: 'file', path: join(root, 'node.bin') }], {
      platform: 'linux',
      mountsContent: MOUNTS_FIXTURE,
    });
    expect(report.skipped).toBe(true);
    expect(report.reason).toBe('not-fuse');
  });

  it('prewarms when the payload lives under a FUSE mount', async () => {
    const root = makeTempRoot();
    const fuseRoot = join(root, '.mount_Open DePl0rQ');
    mkdirSync(fuseRoot, { recursive: true });
    writeFileSync(join(fuseRoot, 'node.bin'), Buffer.alloc(4096, 3));
    const mounts = MOUNTS_FIXTURE.replaceAll('/tmp/.mount_Open\\040DePl0rQ', fuseRoot.replaceAll(' ', '\\040'));

    const report = await prewarmPackagedFiles([{ kind: 'file', path: join(fuseRoot, 'node.bin') }], {
      platform: 'linux',
      mountsContent: mounts,
    });
    expect(report.skipped).toBe(false);
    expect(report.files).toBe(1);
    expect(report.bytes).toBe(4096);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fails open toward prewarming when the mounts table is unavailable', async () => {
    const root = makeTempRoot();
    writeFileSync(join(root, 'node.bin'), Buffer.alloc(2048, 4));
    const report = await prewarmPackagedFiles([{ kind: 'file', path: join(root, 'node.bin') }], {
      platform: 'linux',
      mountsContent: null,
    });
    expect(report.skipped).toBe(false);
    expect(report.bytes).toBe(2048);
  });
});
