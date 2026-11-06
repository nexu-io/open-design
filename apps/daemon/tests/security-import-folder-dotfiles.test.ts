// Security regression: arbitrary-folder import turns the project file routes
// into a read/delete primitive over the user's whole home directory, dotfiles
// included.
//
// Chain (taint -> sink):
//   POST /api/import/folder { baseDir }          (src/import-export-routes.ts:241)
//     - validates only: absolute path, realpath, isDirectory, not fs-root,
//       not RUNTIME_DATA_DIR, sandbox-mode allowlist (no-op unless
//       OD_SANDBOX_MODE is on). NO sensitive-dir blocklist ($HOME, ~/.ssh,
//       ~/.aws, ...) — the existing BLOCKED_CANONICAL list in
//       src/linked-dirs.ts is never consulted on this route — and no dotfile
//       rule. baseDir is persisted into project metadata.
//   GET    /api/projects/:id/raw/*               (src/routes/project/index.ts:3280)
//   DELETE /api/projects/:id/raw/*               (src/routes/project/index.ts:3392)
//   DELETE /api/projects/:id/folders { path }    (src/routes/project/index.ts:3090)
//     - per-file paths go through validateProjectPath (src/projects.ts:1377),
//       which rejects '' / '.' / '..' and reserved segments (.file-versions,
//       .live-artifacts) but happily admits dot segments: '.ssh/id_rsa'
//       passes verbatim. resolveSafeReal then anchors at baseDir = $HOME, so
//       readFile/unlink land on ~/.ssh/id_rsa, ~/.aws/credentials, ... and the
//       bytes are returned over HTTP / the file is unlinked.
//
// Asymmetry (the sibling that does it right): buildBatchArchive
// (src/projects.ts:373-384) explicitly rejects any hidden path segment
// ("hidden segments are not eligible for archive"), and the collectors
// (collectFiles/collectFolders/collectArchiveEntries) skip dot entries. The
// per-file raw/files routes are the siblings missing that guard.
//
// Exposure: the /api origin middleware (src/server.ts:2222) lets any request
// WITHOUT an Origin header through — i.e. any local process (prompt-injected
// agent, malware, another app) can drive this unauthenticated on loopback.
// Real cross-origin browser requests (Origin: https://evil.example) and
// Origin: null on mutating routes are still blocked by that middleware; those
// facts are probed and asserted in the exposure test below.
//
// These specs assert the SECURE end-state invariants (import of a home-like
// tree must not make dotfiles readable/deletable over HTTP, and must not make
// arbitrary user dirs recursively removable). RED on current origin/main;
// green under either fix direction (blocklist at import, or a hidden-segment
// guard in the per-file chain).

import type http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let daemon: http.Server | undefined;
let daemonShutdown: (() => Promise<void> | void) | undefined;
let baseUrl = '';
let dataDir = '';
let fakeHome = '';

const SSH_KEY = path.join('.ssh', 'id_rsa');
const AWS_CREDS = path.join('.aws', 'credentials');
const SENTINEL_KEY = 'SENTINEL-PRIVATE-KEY-do-not-leak-7f3a';
const SENTINEL_CREDS = 'SENTINEL-AWS-CREDS-do-not-leak-9b21';

const PREV_DATA_DIR = process.env.OD_DATA_DIR;

beforeEach(async () => {
  // Sentinel "home directory". Everything the daemon touches lives under this
  // mkdtemp — no real user file is ever read or deleted by this spec.
  fakeHome = await mkdtemp(path.join(os.tmpdir(), 'od-fakehome-'));
  await mkdir(path.join(fakeHome, '.ssh'), { recursive: true });
  await mkdir(path.join(fakeHome, '.aws'), { recursive: true });
  await mkdir(path.join(fakeHome, 'docs'), { recursive: true });
  await writeFile(path.join(fakeHome, SSH_KEY), SENTINEL_KEY);
  await writeFile(path.join(fakeHome, AWS_CREDS), SENTINEL_CREDS);
  await writeFile(path.join(fakeHome, 'docs', 'keep.txt'), 'precious');

  dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-importsec-'));
  process.env.OD_DATA_DIR = dataDir;

  // Dynamic import AFTER OD_DATA_DIR is set: RUNTIME_DATA_DIR is resolved at
  // module-eval time, so a static import would pin the real data dir.
  const { startServer } = await import('../src/server.js');
  const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  daemon = started.server;
  daemonShutdown = started.shutdown;
});

afterEach(async () => {
  if (daemonShutdown) {
    await Promise.race([
      Promise.resolve(daemonShutdown()),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }
  daemon?.closeAllConnections?.();
  if (daemon) await new Promise<void>((r) => daemon!.close(() => r()));
  daemon = undefined;
  daemonShutdown = undefined;
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  await rm(fakeHome, { recursive: true, force: true }).catch(() => {});
  if (PREV_DATA_DIR === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = PREV_DATA_DIR;
}, 15000);

// Import the sentinel home dir through the real HTTP boundary, exactly as an
// unauthenticated local caller would (no Origin header → middleware allows).
async function importFakeHome(): Promise<{ status: number; projectId: string | null }> {
  const resp = await fetch(`${baseUrl}/api/import/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseDir: fakeHome, name: 'sentinel-home' }),
  });
  const json = (await resp.json().catch(() => ({}))) as { project?: { id?: string } };
  return { status: resp.status, projectId: json.project?.id ?? null };
}

describe('import/folder -> home-tree file primitives', () => {
  it('exposure: no-Origin requests reach the route; real cross-origin and null origins are blocked', async () => {
    // A real cross-origin browser request must stay blocked by the /api
    // origin middleware (this is the guard working as intended).
    const evil = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ baseDir: fakeHome }),
    });
    expect(evil.status).toBe(403);

    // Origin: null is only allowed for a small read-only GET allowlist; the
    // mutating import route must reject it.
    const nullOrigin = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'null' },
      body: JSON.stringify({ baseDir: fakeHome }),
    });
    expect(nullOrigin.status).toBe(403);

    // The exposure hole: a NON-browser client sends no Origin header at all
    // and is allowed through unauthenticated (server.ts:2222). Any local
    // process can therefore drive the chains below.
    const noOrigin = await importFakeHome();
    // eslint-disable-next-line no-console
    console.log(
      `[EXPOSURE] import/folder: no-Origin status=${noOrigin.status} ` +
        `(evil-Origin=${evil.status}, null-Origin=${nullOrigin.status})`,
    );
  });

  it('must NOT serve dotfiles (e.g. .ssh/id_rsa) from an imported home-like tree over HTTP', async () => {
    const { status: importStatus, projectId } = await importFakeHome();
    let readStatus = 0;
    let readBody = '';
    if (projectId) {
      const resp = await fetch(
        `${baseUrl}/api/projects/${projectId}/raw/${SSH_KEY.split(path.sep).join('/')}`,
      );
      readStatus = resp.status;
      readBody = await resp.text().catch(() => '');
    }
    // eslint-disable-next-line no-console
    console.log(
      `[READ EVIDENCE] import=${importStatus} projectId=${projectId ?? '(rejected)'} ` +
        `GET raw/.ssh/id_rsa status=${readStatus} leakedSentinel=${readBody.includes(SENTINEL_KEY)}`,
    );

    // SECURE invariant: the private key bytes must never leave the daemon.
    // Holds under either fix (import refused, or dotfile read refused).
    expect(readStatus).not.toBe(200);
    expect(readBody).not.toContain(SENTINEL_KEY);
  }, 30000);

  it('must NOT delete dotfiles (e.g. .aws/credentials) from an imported home-like tree', async () => {
    const { status: importStatus, projectId } = await importFakeHome();
    let delStatus = 0;
    if (projectId) {
      const resp = await fetch(
        `${baseUrl}/api/projects/${projectId}/raw/${AWS_CREDS.split(path.sep).join('/')}`,
        { method: 'DELETE' },
      );
      delStatus = resp.status;
    }
    const stillOnDisk = existsSync(path.join(fakeHome, AWS_CREDS));
    // eslint-disable-next-line no-console
    console.log(
      `[DELETE EVIDENCE] import=${importStatus} projectId=${projectId ?? '(rejected)'} ` +
        `DELETE raw/.aws/credentials status=${delStatus} fileStillOnDisk=${stillOnDisk}`,
    );

    // SECURE invariant: the credentials file must survive on disk.
    expect(stillOnDisk).toBe(true);
  }, 30000);

  // The rm-rf-of-a-user-directory reach exists because the home root can be
  // imported at all (deleting a subfolder of a legitimately-imported project is
  // a valid feature — the abuse is binding the project to $HOME). Close it at
  // the source: importing the home root or a credential store must be rejected
  // before a project is ever created. (Importing a temp folder and deleting its
  // `docs` subfolder is NOT asserted here — that is legitimate.)
  it('must reject importing the home root or a credential directory (no project bound to it)', async () => {
    const importDir = async (baseDir: string) => {
      const resp = await fetch(`${baseUrl}/api/import/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseDir, name: 'blocked-import' }),
      });
      const json = (await resp.json().catch(() => ({}))) as { project?: { id?: string } };
      return { status: resp.status, projectId: json.project?.id ?? null };
    };

    const home = os.homedir();
    const homeResult = await importDir(home);
    // eslint-disable-next-line no-console
    console.log(`[BLOCKLIST EVIDENCE] import $HOME status=${homeResult.status} projectId=${homeResult.projectId ?? '(rejected)'}`);
    expect(homeResult.status).toBeGreaterThanOrEqual(400);
    expect(homeResult.projectId).toBeNull();

    const ssh = path.join(home, '.ssh');
    if (existsSync(ssh)) {
      const sshResult = await importDir(ssh);
      // eslint-disable-next-line no-console
      console.log(`[BLOCKLIST EVIDENCE] import ~/.ssh status=${sshResult.status} projectId=${sshResult.projectId ?? '(rejected)'}`);
      expect(sshResult.status).toBeGreaterThanOrEqual(400);
      expect(sshResult.projectId).toBeNull();
    }
  }, 30000);

  // A/B causal: the per-file read/delete chain runs every path through
  // validateProjectPath — and that helper has no hidden-segment rule, unlike
  // its sibling buildBatchArchive (src/projects.ts:373-384) which explicitly
  // rejects dot segments for the same project tree. One omitted check, not a
  // design gap.
  it('A/B: validateProjectPath (raw read/delete chain) admits dot segments its sibling rejects', async () => {
    const { validateProjectPath } = await import('../src/projects.js');
    // The hole: '.ssh/id_rsa' sails through the guard used by GET/DELETE raw.
    expect(validateProjectPath('.ssh/id_rsa')).toBe('.ssh/id_rsa');
    expect(validateProjectPath('.aws/credentials')).toBe('.aws/credentials');
    // While traversal and reserved segments ARE rejected — the guard exists,
    // it just never learned the hidden-segment rule its sibling has.
    expect(() => validateProjectPath('../escape')).toThrow();
    expect(() => validateProjectPath('.file-versions/x')).toThrow();
  });

  // Coverage guard (raised by review on #5857): the dotfile denial must live at
  // the file-op choke point, not just the 3 raw/folders route handlers — every
  // sibling read route (files/*, text-preview/*, powered/*) resolves through the
  // same readProjectFile/resolveProjectFilePath and must equally refuse
  // dotfiles from an imported tree.
  it('must NOT serve dotfiles through the sibling GET files/* route either', async () => {
    const { projectId } = await importFakeHome();
    let status = 0;
    let body = '';
    if (projectId) {
      const resp = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/${SSH_KEY.split(path.sep).join('/')}`,
      );
      status = resp.status;
      body = await resp.text().catch(() => '');
    }
    // eslint-disable-next-line no-console
    console.log(`[SIBLING READ EVIDENCE] GET files/.ssh/id_rsa status=${status} leaked=${body.includes(SENTINEL_KEY)}`);
    expect(status).not.toBe(200);
    expect(body).not.toContain(SENTINEL_KEY);
  }, 30000);

  // Coverage guard (raised by review on #5857): the sensitive-dir blocklist must
  // also cover the sibling rebind route POST /api/projects/:id/working-dir,
  // otherwise a caller creates an ordinary project then rebinds its baseDir to
  // $HOME to bypass the import-route blocklist.
  it('must reject rebinding a project working-dir to the home root', async () => {
    const pid = `rebind_target_${Math.random().toString(36).slice(2)}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pid, name: 'rebind-target', metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }),
    });
    expect(createResp.status).toBe(200);

    const resp = await fetch(`${baseUrl}/api/projects/${pid}/working-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: os.homedir() }),
    });
    // eslint-disable-next-line no-console
    console.log(`[WORKING-DIR EVIDENCE] rebind $HOME status=${resp.status}`);
    expect(resp.status).toBeGreaterThanOrEqual(400);
  }, 30000);
});
