import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPrototypeFinalizer, runPrototypeStatic } from '../../src/artifacts/prototype-quality-static-service.js';

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(dir => rm(dir, {recursive:true,force:true}))); });
async function project(html: string): Promise<string> { const dir = await mkdtemp(path.join(tmpdir(),'prototype-worker-')); directories.push(dir); await writeFile(path.join(dir,'index.html'),html); return dir; }
describe('compiled prototype static worker', () => {
  it('uses shipped JavaScript and freezes/hash-checks local executable dependencies', async () => {
    const root = await project('<!doctype html><script src="app.js"></script>');
    await writeFile(path.join(root,'app.js'),'document.addEventListener("hashchange", () => {});');
    const first = await runPrototypeStatic({projectRoot:root,entryFile:'index.html',deadlineAtMs:Date.now()+10_000});
    expect(first.checks.some(c => c.reason === 'hashchange_requires_window')).toBe(true);
    expect(Buffer.isBuffer(first.files.get('index.html'))).toBe(true);
    await writeFile(path.join(root,'app.js'),'window.addEventListener("hashchange", () => {});');
    const second = await runPrototypeStatic({projectRoot:root,entryFile:'index.html',deadlineAtMs:Date.now()+10_000});
    expect(second.checks.every(c => c.status === 'pass')).toBe(true);
    expect(second.hash).not.toBe(first.hash);
  });
  it('terminates the real worker when parsing exceeds the absolute wall budget and leaves the parent responsive', async () => {
    const root = await project('<script>'+Array.from({length:65_000},(_,i) => `let v${i}=${i};`).join('')+'</script>');
    const terminate = vi.spyOn(Worker.prototype,'terminate');
    const began = performance.now();
    // Real clocks witness worker isolation and termination; fake time cannot stop CPU parsing.
    let responsive = false; const pulse = setTimeout(() => { responsive = true; },25);
    try {
      await expect(runPrototypeStatic({projectRoot:root,entryFile:'index.html',deadlineAtMs:Date.now()+250})).rejects.toThrow('host_budget_exhausted');
    } finally { clearTimeout(pulse); }
    expect(responsive).toBe(true); expect(terminate).toHaveBeenCalledTimes(1);
    await expect(terminate.mock.results[0]!.value).resolves.toBeTypeOf('number');
    expect(performance.now()-began).toBeLessThan(2_000);
  });
  it('cancels and awaits actual termination instead of leaving a parser in the background', async () => {
    const root = await project('<script>let x=1;</script>'); const controller = new AbortController();
    const terminate = vi.spyOn(Worker.prototype,'terminate');
    const pending = runPrototypeStatic({projectRoot:root,entryFile:'index.html',deadlineAtMs:Date.now()+10_000,signal:controller.signal});
    controller.abort(); await expect(pending).rejects.toThrow('canceled');
    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(terminate.mock.results[0]!.value).resolves.toBeTypeOf('number');
  });
  it('pre-expired budget cannot launch a worker or claim a known candidate', async () => {
    const terminate = vi.spyOn(Worker.prototype,'terminate');
    await expect(runPrototypeStatic({projectRoot:'/missing',entryFile:'index.html',deadlineAtMs:Date.now()})).rejects.toThrow('host_budget_exhausted');
    expect(terminate).not.toHaveBeenCalled();
  });
  it('keeps canonical validation and guarded safe repair in the compiled worker', async () => {
    const projectsRoot = await project(''); const projectId = 'project-1';
    const root = path.join(projectsRoot,projectId); await mkdir(root);
    await writeFile(path.join(root,'index.html'),'<script>const items = [1, 2;</script>');
    const result = await runPrototypeFinalizer({projectsRoot,projectId,projectMetadata:{kind:'prototype',entryFile:'index.html'},
      artifactCount:1,touchedPaths:['index.html'],processTreeQuiescent:true,deadlineAtMs:Date.now()+10_000});
    expect(result.deliverable).toMatchObject({valid:true,entryFile:'index.html'});
    expect(result.syntax).toMatchObject({action:'allow',validation:{status:'pass',finalization:{committedPatchCount:1}}});
    expect(await readFile(path.join(root,'index.html'),'utf8')).toBe('<script>const items = [1, 2];</script>');
  });
  it('limits canonical resolution and legacy parsing by the same absolute deadline without later writes', async () => {
    const projectsRoot = await project(''); const projectId = 'project-1';
    const root = path.join(projectsRoot,projectId); await mkdir(root);
    const source = '<script>'+Array.from({length:65_000},(_,i) => `let v${i}=${i};`).join('')+'const items=[1;</script>';
    const target = path.join(root,'index.html'); await writeFile(target,source);
    const terminate = vi.spyOn(Worker.prototype,'terminate');
    await expect(runPrototypeFinalizer({projectsRoot,projectId,projectMetadata:{kind:'prototype',entryFile:'index.html'},
      artifactCount:1,touchedPaths:['index.html'],processTreeQuiescent:true,deadlineAtMs:Date.now()+250})).rejects.toThrow('host_budget_exhausted');
    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(terminate.mock.results[0]!.value).resolves.toBeTypeOf('number');
    expect(await readFile(target,'utf8')).toBe(source);
    // Real delay checks that termination left no asynchronous repair publishing later.
    await new Promise(resolve => setTimeout(resolve,100));
    expect(await readFile(target,'utf8')).toBe(source);
  });
});
