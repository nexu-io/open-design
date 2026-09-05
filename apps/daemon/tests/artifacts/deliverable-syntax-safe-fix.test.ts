import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDeliverableSyntax } from '../../src/artifacts/deliverable-syntax.js';
import { applyDeliverableSyntaxSafeFix } from '../../src/artifacts/deliverable-syntax-safe-fix.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(file: string, content: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-syntax-safe-fix-'));
  roots.push(root);
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content, 'utf8');
  return root;
}

async function repairable(root: string, entryFile: string) {
  const result = await checkDeliverableSyntax({ projectRoot: root, entryFile });
  if (result.status !== 'repairable') throw new Error(`Expected repairable, got ${result.status}`);
  return result;
}

describe('deliverable syntax safe fixer', () => {
  it('inserts one uniquely implied closing delimiter', async () => {
    const root = await fixture('app.js', 'const values = [1, 2;');
    const result = await repairable(root, 'app.js');

    await expect(applyDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toEqual({
        action: 'applied',
        file: 'app.js',
        rule: 'insert_missing_closing_delimiter',
      });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8'))
      .resolves.toBe('const values = [1, 2];');
  });

  it('closes an unterminated inline block comment before the script end tag', async () => {
    const root = await fixture(
      'index.html',
      '<!doctype html><script>const ready = true; /* generated note</script>',
    );
    const result = await repairable(root, 'index.html');

    await expect(applyDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toMatchObject({ action: 'applied', rule: 'close_unterminated_block_comment' });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8'))
      .resolves.toBe(
        '<!doctype html><script>const ready = true; /* generated note*/</script>',
      );
  });

  it('declines expression holes and leaves the file byte-identical', async () => {
    const source = 'const value = ;';
    const root = await fixture('app.js', source);
    const result = await repairable(root, 'app.js');

    await expect(applyDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toEqual({ action: 'none', reason: 'unsupported_syntax_error' });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8')).resolves.toBe(source);
  });

  it('declines delimiter repair when a regex literal makes lexical grouping ambiguous', async () => {
    const source = 'const pattern = /\\(/; function ready() {';
    const root = await fixture('app.js', source);
    const result = await repairable(root, 'app.js');

    await expect(applyDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toEqual({ action: 'none', reason: 'unsupported_syntax_error' });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8')).resolves.toBe(source);
  });
});
