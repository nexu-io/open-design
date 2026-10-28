import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureMotionRenderSource, motionRenderEvidence } from '../../src/media/motion-render-evidence.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'od-motion-source-evidence-'));
  roots.push(root);
  await mkdir(path.join(root, 'glyph'));
  await writeFile(path.join(root, 'index.html'), '<script src="./glyph/runtime.js"></script>');
  await writeFile(path.join(root, 'glyph/runtime.js'), 'initial');
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('Motion render source evidence', () => {
  it('binds output bytes to source and local module versions, detecting dependency edits', async () => {
    const root = await fixture(), output = path.join(root, 'film.mp4');
    const before = await captureMotionRenderSource(root, output);
    await writeFile(output, 'encoded-video');
    const after = await captureMotionRenderSource(root, output);
    const evidence = motionRenderEvidence({ projectId: 'p', compositionDir: 'film', output: 'film/film.mp4', before, after, videoBytes: await readFile(output) });
    expect(before.directoryComplete).toBe(true);
    expect(evidence.directoryUnchanged).toBe(true);
    expect(evidence.videoSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(after.files.map(file => file.path)).toEqual(['glyph/runtime.js', 'index.html']);
    await writeFile(path.join(root, 'glyph/runtime.js'), 'changed');
    const changed = await captureMotionRenderSource(root, output);
    expect(motionRenderEvidence({ ...evidence, before, after: changed, videoBytes: null }).directoryUnchanged).toBe(false);
    expect(changed.externalDependencies).toBe('not-observed');
  });

  it('keeps symlink and budget gaps unknown without following external files or failing capture', async () => {
    const root = await fixture(), output = path.join(root, 'film.mp4');
    await symlink(path.join(root, 'index.html'), path.join(root, 'linked.html'));
    const linked = await captureMotionRenderSource(root, output);
    expect(linked.issues).toEqual([{ path: 'linked.html', reason: 'symlink-not-followed' }]);
    expect(linked.files.some(file => file.path === 'linked.html')).toBe(false);
    const after = await captureMotionRenderSource(root, output, { files: 1, bytes: 100 });
    expect(after.directoryComplete).toBe(false);
    expect(after.issues.length).toBeGreaterThan(0);
    expect(motionRenderEvidence({ projectId: 'p', compositionDir: 'film', output: 'film.mp4', before: null, after, videoBytes: null }).directoryUnchanged).toBeNull();
    expect(await readFile(path.join(root, 'glyph/runtime.js'), 'utf8')).toBe('initial');
  });
});
