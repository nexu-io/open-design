import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { compareVideos } from '../shared/video-compare.ts';
import { pluginRoot } from '../hyperframes.ts';
import { rpc, callTool, mcpRegistry } from '../mcp.ts';
import { fixture } from './fixtures.ts';

test('corrupt videos preserve native execution errors through MCP', () => fixture(async store => {
  const file = path.join(store.directory, 'broken.mp4');
  await writeFile(file, 'not a video');
  await assert.rejects(compareVideos(pluginRoot, store.directory, file, file), /ffprobe|decode/i);
  const response = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'motion_compare_video', arguments: { reference: file, candidate: file },
  } }, store, mcpRegistry('legacy'));
  assert.equal(response.result.isError, true);
  assert.match(JSON.stringify(response.result.content), /ffprobe|decode/i);
}));

test('project candidates request an exported video before invoking the CLI', () => fixture(async store => {
  const file = path.join(store.directory, 'reference.mp4');
  await writeFile(file, 'unused');
  for (const candidate of ['project', store.projectDirectory]) {
    await assert.rejects(callTool('motion_compare_video', { reference: file, candidate }, store), /先导出工程/);
  }
}));

test('valid diff metrics with exit code 1 remain a comparison result', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'motion-diff-result-'));
  try {
    const bin = path.join(root, 'node_modules/hyperframes/bin');
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, 'hyperframes.mjs'), 'console.log(JSON.stringify({ok:true,pass:false,ssim:{mean:0.5},warnings:[]})); process.exitCode=1;');
    const file = path.join(root, 'input.mp4');
    await writeFile(file, 'fixture');
    const result = await compareVideos(root, root, file, file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.ssim, { mean: 0.5 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
