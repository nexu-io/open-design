// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { createArtifactParser } from '../../../src/artifacts/parser';
import { readQuestionFormPayloadAt } from '../../../src/artifacts/question-form';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { TurnBlock } from '../../../src/runtime/chat/contract';

const KEY = 'a7f3c91ed2b40561';
const AFTER = 'The authenticated conclusion is here.';
const MARKER_AND_AFTER = `<od-done key="${KEY}"/>${AFTER}`;
const FORM = '<question-form id="audience">{"questions":[{"id":"audience","type":"text","label":"Who is the audience?"}]}</question-form>';
const ARTIFACT = '<artifact identifier="result" type="text/html" title="Result"><html><body>Actual deliverable</body></html></artifact>';

function project(chunks: string[]): TurnBlock[] {
  const events: PersistedAgentEvent[] = [
    { kind: 'done_key', key: KEY },
    ...chunks.map((text) => ({ kind: 'text' as const, text })),
  ];
  return buildTurnBlocks({
    events, runStatus: 'succeeded', startedAtMs: 1000, endedAtMs: 2000, nowMs: 2000,
  });
}

function shellText(blocks: TurnBlock[]): string {
  return blocks.flatMap((block) => block.kind === 'shell'
    ? block.items.flatMap((item) => item.kind === 'text' ? [item.text] : [])
    : []).join('\n');
}

function proseText(blocks: TurnBlock[]): string {
  return blocks.flatMap((block) => block.kind === 'prose' ? [block.text] : []).join('\n');
}

function assertAuthenticatedBoundary(blocks: TurnBlock[], before: string): void {
  // A positive boundary assertion, not merely equality between two projections
  // that could both incorrectly promote the literal opener to a conclusion.
  expect(shellText(blocks)).toContain(before.trim());
  expect(shellText(blocks)).not.toContain(AFTER);
  expect(proseText(blocks)).toBe(AFTER);
  expect(shellText(blocks) + proseText(blocks)).not.toContain('<od-done');
}

describe.each(['one persisted text', 'separate text events'] as const)('%s', (shape) => {
  const chunks = (before: string): string[] => shape === 'one persisted text'
    ? [before + MARKER_AND_AFTER] : [before, MARKER_AND_AFTER];

  it.each([
    ['prose question-form mention', 'The <question-form> tag is only for clarifications.'],
    ['unclosed question-form JSON', '<question-form id="unfinished">{"questions":'],
    ['closed but invalid question-form JSON', '<question-form id="invalid">not JSON</question-form>'],
  ])('%s does not preempt the authenticated done', (_label, mention) => {
    const before = `Execution explanation: ${mention}\n`;
    expect(readQuestionFormPayloadAt(before, before.indexOf('<question-form'))).toBeNull();
    assertAuthenticatedBoundary(project(chunks(before)), before);
  });

  it.each([
    ['prose artifact mention', 'The <artifact> tag describes a deliverable.'],
    ['prefix-sharing artifact name', 'The <artifact-example> tag is documentation.'],
  ])('%s does not preempt the authenticated done', (_label, mention) => {
    const before = `Execution explanation: ${mention}\n`;
    const parser = createArtifactParser();
    const parsed = [...parser.feed(before), ...parser.flush()];
    expect(parsed.some((event) => event.type === 'artifact:start')).toBe(false);
    assertAuthenticatedBoundary(project(chunks(before)), before);
  });

  it.each([
    ['complete question form', FORM],
    ['real artifact', ARTIFACT],
  ])('%s still becomes visible before the later authenticated done', (_label, protocol) => {
    if (protocol === FORM) {
      expect(readQuestionFormPayloadAt(protocol, 0)).not.toBeNull();
    } else {
      const parser = createArtifactParser();
      expect([...parser.feed(protocol), ...parser.flush()]).toContainEqual({
        type: 'artifact:end', identifier: 'result', fullContent: '<html><body>Actual deliverable</body></html>',
      });
    }
    const blocks = project(chunks(`Working on the request.\n${protocol}\n`));
    expect(shellText(blocks)).toContain('Working on the request.');
    expect(shellText(blocks)).not.toContain(protocol);
    expect(proseText(blocks)).toContain(protocol);
    expect(proseText(blocks)).toContain(AFTER);
  });

  it('continues past an invalid opener to the later real question form', () => {
    const explanation = 'The <question-form> tag is only for clarifications.\n';
    const blocks = project(chunks(`${explanation}${FORM}\n`));
    expect(shellText(blocks)).toContain(explanation.trim());
    expect(proseText(blocks)).not.toContain(explanation.trim());
    expect(proseText(blocks)).toContain(FORM);
    expect(proseText(blocks)).toContain(AFTER);
  });
});

it.each([
  ['inline code', `Literal protocol examples: \`${FORM}\` and \`${ARTIFACT}\`.\n`],
  ['fenced code', `Literal protocol examples:\n\n\`\`\`html\n${FORM}\n${ARTIFACT}\n\`\`\`\n`],
])('preserves %s in the execution record before authenticated done', (_label, before) => {
  assertAuthenticatedBoundary(project([before + MARKER_AND_AFTER]), before);
});
