import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runtimeEnv, startStudio } from '../hyperframes.ts';

test('only Windows Hyperframes children disable the compile cache even if the caller enables it', () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const previous = process.env.NODE_DISABLE_COMPILE_CACHE;
  try {
    process.env.NODE_DISABLE_COMPILE_CACHE = '0';
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
    assert.equal(runtimeEnv().NODE_DISABLE_COMPILE_CACHE, '0');
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
    assert.equal(runtimeEnv().NODE_DISABLE_COMPILE_CACHE, '1');
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
    if (previous === undefined) delete process.env.NODE_DISABLE_COMPILE_CACHE; else process.env.NODE_DISABLE_COMPILE_CACHE = previous;
  }
});

test('Studio immediately rejects readiness for a different project instead of waiting for timeout', { timeout: 10_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'motion-startup-'));
  try {
    const bin = path.join(root, 'node_modules/hyperframes/bin');
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, 'hyperframes.mjs'), 'console.log(JSON.stringify({ok:true,result:{ready:true,projectDir:process.cwd()+"-different",studioUrl:"http://127.0.0.1:1"}}));setInterval(()=>{},1000);');
    await assert.rejects(startStudio(root, root, path.join(root, 'studio.log')), /工程目录不匹配/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
