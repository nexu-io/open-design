import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The "How your turn is rendered" section exists twice — the daemon composer
 * renders it for agent-CLI runs, `packages/contracts` carries a verbatim copy
 * for the BYOK/API path — and the contracts copy already says so in a comment:
 * 「两边措辞必须一致,否则 API/BYOK 模式和 daemon 模式对同一件事给模型两种说法」.
 * A comment is not a guard, and `MEDIA_USER_REPLY_CONTRACT` has already shown
 * what happens without one: an edit landed on the unused copy, looked like a
 * behaviour change, and changed nothing.
 *
 * This section is where the host tells the model what the reader actually SEES,
 * so it is the one place a false statement about rendering is guaranteed to be
 * believed. It has now gone stale twice: "files you write become artifact
 * cards" outlived the opt-in rule, and "a turn that declares none shows none"
 * outlived opt-in itself once the host started falling back to the main
 * artifacts of what the turn wrote.
 */

function turnRenderingSource(path: string): string {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  const startMarker = '"\\n\\n---\\n\\n## How your turn is rendered';
  const endMarker = 'buried in the working narration."';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`turn-rendering section not found in ${path}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`unterminated turn-rendering section in ${path}`);
  return source.slice(start, end + endMarker.length);
}

/** The text the model reads: source-level literal joins and indentation removed. */
function turnRenderingProse(path: string): string {
  return turnRenderingSource(path)
    .split(/"\s*\+\s*\n\s*"/)
    .join('')
    .replace(/^"/, '')
    .replace(/"$/, '');
}

describe('"How your turn is rendered" mirrors', () => {
  const daemonProse = turnRenderingProse('../../src/prompts/system.ts');
  const contractsProse = turnRenderingProse(
    '../../../../packages/contracts/src/prompts/system.ts',
  );

  it('keeps the daemon copy and the contracts copy identical', () => {
    expect(daemonProse).toBe(contractsProse);
  });

  /*
   * Declared-first, with the host fallback stated honestly. Paired with the two
   * negatives below so no assertion passes vacuously: the section must describe
   * cards as DECLARED, must not describe them as a consequence of writing a
   * file, and must not repeat the claim that an undeclared turn shows none.
   */
  it('describes artifact cards as declared, with the host fallback stated honestly', () => {
    expect(daemonProse).toContain('**Artifact cards are the deliverables you declare**');
    expect(daemonProse).toContain("falls back to the host's own pick of the main artifacts");
    expect(daemonProse).toContain("stays reachable in the project's file list");
  });

  it('no longer claims every file you write becomes a card', () => {
    expect(daemonProse).not.toContain('Files you write become artifact cards');
    expect(contractsProse).not.toContain('Files you write become artifact cards');
  });

  /*
   * The sentence this test used to PIN, now pinned as forbidden.
   *
   * 「不声明就一张卡都没有」was both the ruling and the panel's behaviour until
   * the declaration rate was measured: 100% on turns that created a file,
   * 22–25% on turns that only edited one. The host now falls back to the main
   * artifacts among the files the turn wrote, so this sentence became false in
   * the one section whose entire job is telling the model what the reader sees
   * — the place where a false statement is guaranteed to be believed.
   */
  it('no longer claims an undeclared turn shows no cards at all', () => {
    expect(daemonProse).not.toContain('declares none shows none');
    expect(contractsProse).not.toContain('declares none shows none');
  });

  /* The rest of the section is untouched — a mirror test that only ever sees
     the line under edit would not notice the other four bullets drifting. */
  it('keeps the surrounding rendering facts intact', () => {
    expect(daemonProse).toContain('**Inside the card**');
    expect(daemonProse).toContain('**Below the card**');
    expect(daemonProse).toContain('**TodoWrite is the progress the user watches.**');
    expect(daemonProse).toContain('**Questions go through `<question-form>`**');
  });
});
