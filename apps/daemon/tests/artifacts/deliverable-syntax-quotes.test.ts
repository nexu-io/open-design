import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '@babel/parser';
import { load } from 'cheerio';
import { afterEach, describe, expect, it } from 'vitest';

import { finalizeDeliverableSyntax } from '../../src/artifacts/deliverable-syntax-finalization.js';
import { checkDeliverableSyntax } from '../../src/artifacts/deliverable-syntax.js';

const fixtureRoot = fileURLToPath(new URL('./fixtures/syntax-quotes/', import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(source: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-syntax-quotes-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'index.html'), source, 'utf8');
  return root;
}

async function finalize(root: string) {
  return finalizeDeliverableSyntax({
    artifactKind: 'html', projectRoot: root, entryFile: 'index.html', processTreeQuiescent: true,
    // These tests prove repair/rollback contracts, not host scheduling speed.
    // Budget boundaries have independent virtual-clock coverage; deployed
    // replay keeps the real clock and records actual timing/timeout outcomes.
    monotonicNow: () => 0,
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Parse-only oracle: never eval or render the generated application. */
function comparableScriptAsts(html: string): unknown[] {
  const $ = load(html);
  return $('script').toArray().map((element) => JSON.parse(JSON.stringify(
    parse($(element).html() ?? '', { sourceType: 'unambiguous' }),
    (key: string, value: unknown) => (
      ['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)
        ? undefined
        : value
    ),
  )) as unknown);
}

const controlledMutations = [
  {
    name: 'single-quoted statement followed by another statement',
    valid: "const label = 'ready';\nconst done = true;",
    broken: "const label = 'ready\";\nconst done = true;",
    rule: 'normalize_mismatched_string_quote',
  },
  {
    name: 'double-quoted statement followed by another statement',
    valid: 'const label = "ready";\nconst done = true;',
    broken: 'const label = "ready\';\nconst done = true;',
    rule: 'normalize_mismatched_string_quote',
  },
  {
    name: 'HTML fragment in a ternary branch with an unambiguous diagnostic start',
    valid: `const markup = true ? '<b class="label">ready</b>' : "";`,
    broken: `const markup = true ? '<b class="label">ready</b>" : "";`,
    rule: 'normalize_mismatched_string_quote',
  },
  {
    name: 'one unescaped static HTML attribute',
    valid: String.raw`const markup = "<span class=\"chip\">ready</span>";`,
    broken: 'const markup = "<span class="chip">ready</span>";',
    rule: 'normalize_html_attribute_quotes',
  },
  {
    name: 'multiple static HTML attributes in one literal',
    valid: String.raw`const markup = "</span><span class=\"od-truncate\" style=\"flex:1;text-align:right;\">";`,
    broken: 'const markup = "</span><span class="od-truncate" style="flex:1;text-align:right;">";',
    rule: 'normalize_html_attribute_quotes',
  },
  {
    name: 'attributes in a static return expression',
    valid: String.raw`function markup() { return "<input type=\"text\" aria-label=\"姓名\" />"; }`,
    broken: 'function markup() { return "<input type="text" aria-label="姓名" />"; }',
    rule: 'normalize_html_attribute_quotes',
  },
] as const;

describe('deterministic quote repair acceptance', () => {
  it('repairs all six diagnosed locations in the sanitized historical ORDER artifact', async () => {
    const original = await fs.readFile(path.join(fixtureRoot, 'order-stress-r01.sanitized.html'), 'utf8');
    const reference = await fs.readFile(path.join(fixtureRoot, 'order-stress-r01.sanitized-reference.html'), 'utf8');
    expect(sha256(original)).toBe('423637b44d6d900f9c0a7a0dd694619fc611fa4dfa5fc480d66dc37935ee8d7e');
    expect(sha256(reference)).toBe('f442c0b5c6157ec1b09816bffbc3b5924ad422cba0dcd24784ee1f975c4977b2');
    expect(Buffer.byteLength(original)).toBe(120_711);
    const root = await fixture(original);

    await expect(checkDeliverableSyntax({ projectRoot: root, entryFile: 'index.html' }))
      .resolves.toMatchObject({ status: 'repairable', diagnostics: [expect.objectContaining({ line: 1633 })] });
    expect(() => comparableScriptAsts(reference)).not.toThrow();

    await expect(finalize(root)).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'pass',
        repairState: { mode: 'host_safe_fixer', attempt: 6, maxAttempts: 8 },
        finalization: {
          initialStatus: 'repairable', stagedPatchCount: 6, committedPatchCount: 6,
          committedRepairRules: ['normalize_mismatched_string_quote', 'normalize_html_attribute_quotes'],
        },
        metrics: {
          appliedRepairRules: ['normalize_mismatched_string_quote', 'normalize_html_attribute_quotes'],
        },
      },
    });
    // The historical reference is a documented human inference, not a lost
    // original oracle. This asserts the reviewed local edits, not app semantics.
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(reference);
  });

  it.each(controlledMutations)('restores the known-correct oracle: $name', async ({ valid, broken, rule }) => {
    const expected = `<script>${valid}</script>`;
    const root = await fixture(`<script>${broken}</script>`);
    expect(() => comparableScriptAsts(expected)).not.toThrow();
    await expect(checkDeliverableSyntax({ projectRoot: root, entryFile: 'index.html' }))
      .resolves.toMatchObject({ status: 'repairable' });

    await expect(finalize(root)).resolves.toMatchObject({
      action: 'allow',
      validation: {
        status: 'pass', repairState: { attempt: 1, mode: 'host_safe_fixer' },
        metrics: { appliedRepairRules: [rule] },
      },
    });
    const actual = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    expect(actual).toBe(expected);
    // Unlike the historical artifact, these mutations have a known-correct
    // source oracle. AST comparison retains decoded StringLiteral.value.
    expect(comparableScriptAsts(actual)).toEqual(comparableScriptAsts(expected));
  });

  it.each(['\n', '\r\n'])('preserves the existing line-ending bytes: %j', async (newline) => {
    const expected = `<script>${newline}const label = 'ready';${newline}const done = true;${newline}</script>`;
    const root = await fixture(expected.replace("'ready'", "'ready\""));
    await expect(finalize(root)).resolves.toMatchObject({ action: 'allow' });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(expected);
  });

  it.each([
    `const label = 'He said "ready"';`,
    String.raw`const markup = "<span class=\"chip\" data-note=\"ready\">hello</span>";`,
    String.raw`const markup = '<span class="chip" data-note="it\'s ready">hello</span>';`,
    String.raw`const pattern = /['"]/; const text = "normal";`,
    `/* const bad = 'ready"; */\nconst good = true;`,
    'const markup = "<span class=" + css + ">ready</span>";',
    'const text = `value: ${1 + 2}`;',
  ])('does not rewrite already-valid near-miss syntax: %s', async (script) => {
    const source = `<script>${script}</script>`;
    const root = await fixture(source);
    await expect(finalize(root)).resolves.toMatchObject({
      action: 'allow', validation: { status: 'pass' },
    });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it.each([
    // Two different one-character repairs both parse but have different values.
    `const value = 'a" + "b";`,
    // The final single quotes shift the reported lexical start. This rule does
    // not guess backwards across the line to recover a different string start.
    `const markup = true ? '<b class="label">ready</b>" : '';`,
    String.raw`const value = 'line\n";
const done = true;`,
    'const value = \'hello ${user}";\nconst done = true;',
    'const markup = "<button onclick="run()">go</button>";',
    'const markup = "<iframe srcdoc="<p>hello</p>"></iframe>";',
    'const markup = "<style media="screen">body{color:red}</style>";',
    'const markup = "<span class="chip title="wide">ready</span>";',
    // Escaping attribute quotes would parse, but swallow a live expression into
    // literal text. A parse-valid candidate alone is not an adequate oracle.
    `const markup = "<span data-value="' + lookup() + '" class="badge">ready</span>";`,
    `const markup = "<span data-value="' + value + '" class="badge">ready</span>";`,
    'const value = ;',
  ])('refuses ambiguous or unsupported syntax without changing disk bytes: %s', async (script) => {
    const source = `<script>${script}</script>`;
    const root = await fixture(source);
    await expect(checkDeliverableSyntax({ projectRoot: root, entryFile: 'index.html' }))
      .resolves.toMatchObject({ status: 'repairable' });
    await expect(finalize(root)).resolves.toMatchObject({ action: 'fail' });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('repairs eight independent quote locations before one successful commit', async () => {
    const expected = `<script>\n${Array.from({ length: 8 }, (_, index) => `const label${index} = 'ready${index}';`).join('\n')}\n</script>`;
    const source = expected.replace(/';/gu, '";');
    const root = await fixture(source);
    await expect(finalize(root)).resolves.toMatchObject({
      action: 'allow',
      validation: { status: 'pass', repairState: { attempt: 8, maxAttempts: 8, mode: 'host_safe_fixer' } },
    });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(expected);
  });

  it('does not publish staged changes when nine locations exceed the eight-patch budget', async () => {
    const source = `<script>\n${Array.from({ length: 9 }, (_, index) => `const label${index} = 'ready${index}";`).join('\n')}\n</script>`;
    const root = await fixture(source);
    await expect(finalize(root)).resolves.toMatchObject({
      action: 'fail', reason: 'attempt_limit_reached',
      validation: { repairState: { attempt: 8, maxAttempts: 8, mode: 'host_safe_fixer' } },
    });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(source);
  });

  it('rolls back all staged quote fixes if a later expression hole cannot be repaired', async () => {
    const source = '<script>\nconst one = \'ready";\nconst two = \'done";\nconst unsupported = ;\n</script>';
    const root = await fixture(source);
    await expect(finalize(root)).resolves.toMatchObject({
      action: 'fail', reason: 'no_safe_fix',
      validation: {
        repairState: { attempt: 2, maxAttempts: 8, mode: 'host_safe_fixer' },
        metrics: {
          safeFixProposalCount: 3,
          appliedRepairRules: ['normalize_mismatched_string_quote'],
        },
      },
    });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(source);
  });
});
