import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

test('public Motion sources contain no company endpoints, workstation paths or embedded upstream ingest keys', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of files) {
    if (!/\.(?:md|txt|ts|tsx|js|mjs|json|yml|yaml|html|css|sh|ps1|command)$/.test(file)) continue;
    let content: string;
    try { content = await readFile(path.join(root, file), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    // Report the filename only: an accidentally introduced secret must not reach CI logs.
    assert(!/https?:\/\/[^\s/]*(?:powerformer\.(?:net|com)|powerformer\.feishu\.cn)(?:[/:]|$)/i.test(content), 'Company endpoint in ' + file);
    assert(!/phc_[A-Za-z0-9]{20,}/.test(content), 'Embedded upstream ingest identifier in ' + file);
    const users = [...content.matchAll(/\/Users\/([\w.-]+)\//g)].map(match => match[1]);
    assert(users.every(name => ['me', 'a', 'someone'].includes(name)), 'Workstation path in ' + file);
  }
});

test('source installation sparse-checks out Motion and invokes the nested installer', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion source install '));
  try {
    const bin = path.join(directory, 'bin'), log = path.join(directory, 'git.jsonl');
    await mkdir(bin);
    await writeFile(path.join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await writeFile(path.join(bin, 'git'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOTION_GIT_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'clone') {
  const scripts = path.join(args.at(-1), 'plugins/motion/scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, 'install-motion.command'), '#!/bin/sh\\necho nested-motion-installer\\n');
}
`, { mode: 0o755 });
    const destination = path.join(directory, 'selected install');
    const result = spawnSync('bash', [fileURLToPath(new URL('../install.sh', import.meta.url))], {
      encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
        MOTION_GIT_LOG: log, OPENMOTION_INSTALL_DIR: destination, OPENMOTION_REF: 'migration-review' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /nested-motion-installer/);
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(calls[0], ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', 'migration-review', '--', 'https://github.com/nexu-io/open-design.git', destination]);
    assert.deepEqual(calls[1], ['-C', destination, 'sparse-checkout', 'set', 'plugins/motion']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
