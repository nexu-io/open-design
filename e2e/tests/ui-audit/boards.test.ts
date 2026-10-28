import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const authorColor = 'rgb(105, 213, 240)';
const authorKey = 'a'.repeat(64);

describe('paired comment-color board evidence (synthetic validator fixtures only)', () => {
  it.each([
    { name: 'accepts matching author, OD pin and share pin colors', pins: [authorColor, authorColor], sharePin: authorColor, accepted: true },
    { name: 'rejects the retired fixed orange OD pins', pins: ['rgb(217, 106, 70)', 'rgb(217, 106, 70)'], sharePin: authorColor, accepted: false },
    { name: 'rejects one mismatched OD pin', pins: [authorColor, 'rgb(0, 0, 0)'], sharePin: authorColor, accepted: false },
    { name: 'rejects a mismatched share-page pin', pins: [authorColor, authorColor], sharePin: 'rgb(0, 0, 0)', accepted: false },
  ])('$name', async ({ pins, sharePin, accepted }) => {
    const root = await mkdtemp(join(tmpdir(), 'od-board-colors-'));
    try {
      // Run the real report script against isolated synthetic metadata. These
      // files are parser fixtures, never screenshot/production acceptance proof.
      const script = join(root, 'e2e/lib/playwright/ui-audit-boards.ts');
      const audit = join(root, '.tmp/ui-audit');
      const captures = join(audit, 'captures/actual');
      const support = join(audit, 'input/boards/Chain-1-publish');
      await Promise.all([
        mkdir(join(root, 'e2e/lib/playwright'), { recursive: true }),
        mkdir(captures, { recursive: true }),
        mkdir(join(support, 'vendor'), { recursive: true }),
      ]);
      await copyFile(new URL('../../lib/playwright/ui-audit-boards.ts', import.meta.url), script);
      await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
      await writeFile(join(audit, 'inventory.md'), '## 当前有效状态\n| O5 | Same-author colors | Both | Chain-4 | Comments |\n## 作废\n');
      await writeFile(join(audit, 'input/board-head.tpl'), '<html><body><x-dc>');
      await writeFile(join(support, 'support.js'), '// Synthetic report fixture.');
      const parserImage = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(128)]);
      for (const side of ['OD', 'vela']) {
        const id = `O5-${side}`;
        await writeFile(join(captures, `${id}.png`), parserImage);
        await writeFile(join(captures, `${id}.json`), JSON.stringify({
          id, observedState: id, source: 'actual-mock', text: 'Synthetic color evidence validator fixture',
          authorKey, avatarColors: [authorColor, authorColor],
          ...(side === 'OD' ? { pinColors: pins } : { pinColor: sharePin }),
        }));
      }
      const result = await execute(process.execPath, ['--experimental-strip-types', script], { cwd: root });
      expect(JSON.parse(result.stdout.trim()).actualFrames).toBe(accepted ? 1 : 0);
      const summary = await readFile(join(audit, 'output/boards/Current-0-map.dc.html'), 'utf8');
      expect(summary.includes('现状帧')).toBe(accepted);
      if (!accepted) expect(result.stderr).toContain('O5 author/pin colors did not match');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
