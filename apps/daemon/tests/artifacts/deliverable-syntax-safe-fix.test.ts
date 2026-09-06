import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDeliverableSyntax } from '../../src/artifacts/deliverable-syntax.js';
import {
  commitDeliverableSyntaxSafeFix,
  proposeDeliverableSyntaxSafeFix,
} from '../../src/artifacts/deliverable-syntax-safe-fix.js';

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
  it('stages one uniquely implied delimiter and mutates only after commit', async () => {
    const source = 'const values = [1, 2;';
    const root = await fixture('app.js', source);
    const result = await repairable(root, 'app.js');

    const proposal = await proposeDeliverableSyntaxSafeFix({ projectRoot: root, result });
    expect(proposal).toMatchObject({
      action: 'proposed',
      patch: { file: 'app.js', rule: 'insert_missing_closing_delimiter' },
    });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8')).resolves.toBe(source);
    if (proposal.action !== 'proposed') throw new Error('Expected proposal');

    await expect(commitDeliverableSyntaxSafeFix(proposal.patch))
      .resolves.toEqual({ action: 'committed' });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8'))
      .resolves.toBe('const values = [1, 2];');
  });

  it('stages an unterminated inline block comment before the script end tag', async () => {
    const source = '<!doctype html><script>const ready = true; /* note</script>';
    const root = await fixture('index.html', source);
    const result = await repairable(root, 'index.html');

    const proposal = await proposeDeliverableSyntaxSafeFix({ projectRoot: root, result });
    expect(proposal).toMatchObject({
      action: 'proposed',
      patch: { rule: 'close_unterminated_block_comment' },
    });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('stages an unterminated string at the end of a JavaScript file', async () => {
    const root = await fixture('app.js', 'const label = "hello');
    const result = await repairable(root, 'app.js');

    const proposal = await proposeDeliverableSyntaxSafeFix({ projectRoot: root, result });
    expect(proposal).toMatchObject({
      action: 'proposed',
      patch: { rule: 'close_unterminated_string' },
    });
    if (proposal.action !== 'proposed') throw new Error('Expected proposal');
    await expect(commitDeliverableSyntaxSafeFix(proposal.patch))
      .resolves.toEqual({ action: 'committed' });
    await expect(checkDeliverableSyntax({ projectRoot: root, entryFile: 'app.js' }))
      .resolves.toMatchObject({ status: 'pass' });
  });

  it('stages an unterminated expression-free template at the end of a JavaScript file', async () => {
    const root = await fixture('app.js', 'const label = `hello');
    const result = await repairable(root, 'app.js');

    const proposal = await proposeDeliverableSyntaxSafeFix({ projectRoot: root, result });
    expect(proposal).toMatchObject({
      action: 'proposed',
      patch: { rule: 'close_unterminated_template' },
    });
    if (proposal.action !== 'proposed') throw new Error('Expected proposal');
    await expect(commitDeliverableSyntaxSafeFix(proposal.patch))
      .resolves.toEqual({ action: 'committed' });
    await expect(checkDeliverableSyntax({ projectRoot: root, entryFile: 'app.js' }))
      .resolves.toMatchObject({ status: 'pass' });
  });

  it('declines an unterminated template that contains an expression', async () => {
    const source = 'const label = `hello ${value';
    const root = await fixture('app.js', source);
    const result = await repairable(root, 'app.js');

    await expect(proposeDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toEqual({ action: 'none', reason: 'unsupported_syntax_error' });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8')).resolves.toBe(source);
  });

  it('declines expression holes and leaves the file byte-identical', async () => {
    const source = 'const value = ;';
    const root = await fixture('app.js', source);
    const result = await repairable(root, 'app.js');

    await expect(proposeDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toEqual({ action: 'none', reason: 'unsupported_syntax_error' });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8')).resolves.toBe(source);
  });

  it('declines delimiter repair when regex syntax makes grouping ambiguous', async () => {
    const source = 'const pattern = /\\(/; function ready() {';
    const root = await fixture('app.js', source);
    const result = await repairable(root, 'app.js');

    await expect(proposeDeliverableSyntaxSafeFix({ projectRoot: root, result }))
      .resolves.toEqual({ action: 'none', reason: 'unsupported_syntax_error' });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8')).resolves.toBe(source);
  });

  it('refuses to overwrite a concurrent edit', async () => {
    const root = await fixture('app.js', 'const values = [1, 2;');
    const result = await repairable(root, 'app.js');
    const proposal = await proposeDeliverableSyntaxSafeFix({ projectRoot: root, result });
    if (proposal.action !== 'proposed') throw new Error('Expected proposal');

    await fs.writeFile(path.join(root, 'app.js'), 'const external = true;', 'utf8');
    await expect(commitDeliverableSyntaxSafeFix(proposal.patch)).resolves.toEqual({
      action: 'none',
      reason: 'concurrent_modification',
    });
    await expect(fs.readFile(path.join(root, 'app.js'), 'utf8'))
      .resolves.toBe('const external = true;');
  });
});
