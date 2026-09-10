import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// The assembled app is a separate install root: workspace approvals do not apply.
export const LINUX_NATIVE_INSTALL_POLICY = {
  allowScripts: { 'better-sqlite3': true },
  pnpm: { onlyBuiltDependencies: ['better-sqlite3'] },
};

const SQLITE_PROBE = `
const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const { isAbsolute, join, relative, sep } = require('node:path');
const appRoot = realpathSync(process.argv[1]);
const daemonManifest = realpathSync(join(appRoot, 'node_modules', '@open-design', 'daemon', 'package.json'));
const daemonRequire = createRequire(daemonManifest);
const sqliteEntry = realpathSync(daemonRequire.resolve('better-sqlite3'));
for (const entry of [daemonManifest, sqliteEntry]) {
  const path = relative(appRoot, entry);
  if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) {
    throw new Error('SQLite must resolve inside the packaged app: ' + entry);
  }
}
const Database = daemonRequire('better-sqlite3');
const db = new Database(':memory:');
try {
  if (db.prepare('SELECT 42 AS answer').get().answer !== 42) {
    throw new Error('Packaged SQLite query failed');
  }
} finally {
  db.close();
}
`;

/** Loading the JS wrapper alone does not load better_sqlite3.node or check its ABI. */
export async function assertLinuxNativeModules(appRoot: string, nodeCommand: string): Promise<void> {
  try {
    await execFileAsync(nodeCommand, ['-e', SQLITE_PROBE, appRoot], {
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
      timeout: 30_000,
    });
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    throw new Error(
      `Linux packaged better-sqlite3 cannot open a database with bundled Node (${nodeCommand}): ${failure.stderr?.trim() || failure.message}`,
      { cause: error },
    );
  }
}

/** Verify the shipped bytes as well as the assembled dependency tree. */
export async function assertLinuxAppImageNativeModules(appImagePath: string): Promise<void> {
  const extractedRoot = await mkdtemp(join(tmpdir(), 'od-linux-appimage-'));
  try {
    await execFileAsync(appImagePath, ['--appimage-extract'], {
      cwd: extractedRoot,
      maxBuffer: 32 * 1024 * 1024,
    });
    const resources = join(extractedRoot, 'squashfs-root', 'resources');
    await assertLinuxNativeModules(
      join(resources, 'app'),
      join(resources, 'open-design', 'bin', 'node'),
    );
  } finally {
    await rm(extractedRoot, { recursive: true, force: true });
  }
}
