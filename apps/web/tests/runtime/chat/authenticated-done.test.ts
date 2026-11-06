import { describe, expect, it } from 'vitest';
import {
  eventsHaveAuthenticatedDoneConclusion,
  type PersistedAgentEvent,
} from '@open-design/contracts';

const KEY = 'a7f3c91ed2b40561';

function declares(text: string, key = KEY): PersistedAgentEvent[] {
  return [
    { kind: 'done_key', key },
    { kind: 'text', text },
  ] as PersistedAgentEvent[];
}

describe('eventsHaveAuthenticatedDoneConclusion', () => {
  it('requires a matching per-run marker followed by a visible conclusion', () => {
    expect(
      eventsHaveAuthenticatedDoneConclusion(
        declares(`过程叙述<od-done key="${KEY}"/>新图已经生成并保存到项目。`),
      ),
    ).toBe(true);
  });

  it('reassembles a marker split across persisted text deltas', () => {
    expect(
      eventsHaveAuthenticatedDoneConclusion([
        { kind: 'done_key', key: KEY },
        { kind: 'text', text: '<od-do' },
        { kind: 'text', text: `ne key="${KEY}"/>新图已经生成。` },
      ] as PersistedAgentEvent[]),
    ).toBe(true);
  });

  it.each([
    ['错误 nonce', declares('过程<od-done key="other-key"/>总结')],
    ['历史裸标记', [{ kind: 'text', text: '<done/>总结' }] as PersistedAgentEvent[]],
    ['question-form 隐式收口', declares('<question-form>version: 1</question-form>')],
    ['artifact 隐式收口', declares('<artifact name="result.html"/>')],
    ['标记后没有正文', declares(`<od-done key="${KEY}"/>   `)],
    ['代码示例里的标记', declares(`示例: \`<od-done key="${KEY}"/>\` 后续说明`)],
    ['围栏代码里的标记', declares(`\`\`\`html\n<od-done key="${KEY}"/>\n\`\`\`\n后续说明`)],
  ])('does not treat %s as authenticated delivery', (_label, events) => {
    expect(eventsHaveAuthenticatedDoneConclusion(events)).toBe(false);
  });
});
