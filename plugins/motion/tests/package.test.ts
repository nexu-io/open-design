import test from 'node:test';
import assert from 'node:assert/strict';
import { zip } from '../scripts/package.ts';
import { distributionFiles } from '../scripts/distribution.ts';
import { getWorkflow, workflowRegistry } from '../shared/workflow.ts';

test('every distribution preserves public workflow dependencies and licenses while excluding development material', async () => {
  for (const profile of ['phase1', 'legacy']) {
    const files = new Set(await distributionFiles(profile));
    for (const file of ['studio/build/index.html', 'studio/LICENSE', 'template-library/LICENSE', 'template-library/NOTICE.md', 'web/design-system/fonts/Albert-Sans-OFL.txt', 'scripts/distribution.ts', 'shared/editor-launch.pl', 'skills/motion-recreate/scripts/measure_frame.mjs']) assert(files.has(file), 'Missing runtime or license: ' + file);
    assert(![...files].some(file => /^(?:tests\/|studio\/(?:src|tests)\/)|\.map$|publish-test-package|acceptance\.md$/.test(file)));
    for (const [workflow, definition] of Object.entries(workflowRegistry)) {
      if (profile === 'phase1' && workflow === 'video-to-template') continue;
      for (const section of Object.keys(definition.sections)) {
        const document = await getWorkflow(section, workflow);
        assert(files.has(document.documentId), 'Missing workflow document: ' + document.documentId);
        for (const reference of document.references) assert(files.has(reference.documentId), 'Missing workflow reference: ' + reference.documentId);
      }
    }
    assert.equal(files.has('skills/video-to-template/SKILL.md'), profile === 'legacy');
  }
  await assert.rejects(distributionFiles('unknown'), /Unknown distribution/);
});
test('ZIP stores UTF-8 names and file sizes in local and central headers', () => {
  const archive = zip([{ name: 'motion/测试.txt', data: Buffer.from('editable project') }]);
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert.equal(archive.readUInt32LE(18), 16);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), 1);
  assert.equal(archive.readUInt32LE(archive.readUInt32LE(end + 16)), 0x02014b50);
});
