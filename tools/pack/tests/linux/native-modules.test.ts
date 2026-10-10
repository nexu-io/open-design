import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertLinuxAppImageNativeModules, assertLinuxNativeModules } from '@/linux/native-modules.js';

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'od-linux-native-test-'));
  roots.push(root);
  const app = join(root, 'resources', 'app');
  const daemon = join(app, 'node_modules', '@open-design', 'daemon', 'package.json');
  await mkdir(dirname(daemon), { recursive: true });
  await writeFile(daemon, JSON.stringify({ name: '@open-design/daemon' }));
  return { root, app };
}

async function sqliteWrapper(app: string, source: string) {
  const directory = join(app, 'node_modules', 'better-sqlite3');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.js'), source);
  return directory;
}

function workingWrapper(trace: string, answer = 42) {
  return `
const fs = require('node:fs');
const record = value => fs.appendFileSync(${JSON.stringify(trace)}, value + '\\n');
module.exports = class Database {
  constructor(name) { record(name); }
  prepare(sql) { record(sql); return { get: () => ({ answer: ${answer} }) }; }
  close() { record('closed'); }
};
`;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Linux packaged SQLite probe', () => {
  it('opens an in-memory database, runs a query and closes it', async () => {
    const { root, app } = await fixture();
    const trace = join(root, 'trace');
    await sqliteWrapper(app, workingWrapper(trace));

    await assertLinuxNativeModules(app, process.execPath);

    expect(await readFile(trace, 'utf8')).toBe(':memory:\nSELECT 42 AS answer\nclosed\n');
  });

  it('rejects a wrapper that imports successfully but cannot load its native binding', async () => {
    const { app } = await fixture();
    await sqliteWrapper(app, `module.exports = class Database {
      constructor() { throw new Error('Could not locate better_sqlite3.node'); }
    };`);

    await expect(assertLinuxNativeModules(app, process.execPath))
      .rejects.toThrow('Could not locate better_sqlite3.node');
  });

  it('rejects an invalid native binary', async () => {
    const { app } = await fixture();
    const sqlite = await sqliteWrapper(app, `module.exports = class Database {
      constructor() { require('./better_sqlite3.node'); }
    };`);
    await writeFile(join(sqlite, 'better_sqlite3.node'), 'not a native module');

    await expect(assertLinuxNativeModules(app, process.execPath))
      .rejects.toThrow('Linux packaged better-sqlite3 cannot open a database');
  });

  it('does not accept a dependency found outside the packaged app', async () => {
    const { root, app } = await fixture();
    await sqliteWrapper(root, workingWrapper(join(root, 'ambient-trace')));

    await expect(assertLinuxNativeModules(app, process.execPath))
      .rejects.toThrow('SQLite must resolve inside the packaged app');
  });

  it('reports an absent packaged daemon instead of using an ambient install', async () => {
    const { app } = await fixture();
    await rm(join(app, 'node_modules', '@open-design', 'daemon'), { recursive: true });

    await expect(assertLinuxNativeModules(app, process.execPath))
      .rejects.toThrow('Linux packaged better-sqlite3 cannot open a database');
  });

  it('closes the database when query verification fails', async () => {
    const { root, app } = await fixture();
    const trace = join(root, 'trace');
    await sqliteWrapper(app, workingWrapper(trace, 0));

    await expect(assertLinuxNativeModules(app, process.execPath))
      .rejects.toThrow('Packaged SQLite query failed');
    expect(await readFile(trace, 'utf8')).toContain('closed\n');
  });
});

describe.skipIf(process.platform !== 'linux')('Linux AppImage native-module verification', () => {
  async function appImageFixture(failExtraction = false) {
    const { root, app } = await fixture();
    const node = join(root, 'resources', 'open-design', 'bin', 'node');
    await mkdir(dirname(node), { recursive: true });
    await cp(process.execPath, node);
    const trace = join(root, 'extraction-path');
    const appImage = join(root, 'Open Design.AppImage');
    await writeFile(appImage, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (process.argv[2] !== '--appimage-extract') process.exit(3);
fs.writeFileSync(${JSON.stringify(trace)}, process.cwd());
${failExtraction ? 'process.exit(2);' : `fs.cpSync(${JSON.stringify(join(root, 'resources'))}, path.join(process.cwd(), 'squashfs-root', 'resources'), { recursive: true });`}
`);
    await chmod(appImage, 0o755);
    return { root, app, appImage, trace };
  }

  it('checks the extracted app with its bundled Node and removes the extraction', async () => {
    const { root, app, appImage, trace } = await appImageFixture();
    const sqliteTrace = join(root, 'sqlite-trace');
    await sqliteWrapper(app, workingWrapper(sqliteTrace));

    await assertLinuxAppImageNativeModules(appImage);

    expect(await readFile(sqliteTrace, 'utf8')).toContain('closed\n');
    await expect(readFile(await readFile(trace, 'utf8'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an AppImage missing SQLite and still removes the extraction', async () => {
    const { appImage, trace } = await appImageFixture();

    await expect(assertLinuxAppImageNativeModules(appImage))
      .rejects.toThrow('Linux packaged better-sqlite3 cannot open a database');
    await expect(readFile(await readFile(trace, 'utf8'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('propagates extraction failure and removes its temporary directory', async () => {
    const { appImage, trace } = await appImageFixture(true);

    await expect(assertLinuxAppImageNativeModules(appImage)).rejects.toThrow();
    await expect(readFile(await readFile(trace, 'utf8'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
