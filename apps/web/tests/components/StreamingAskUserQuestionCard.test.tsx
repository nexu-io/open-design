// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StreamingAskUserQuestionCard } from '../../src/components/ToolCard';

afterEach(() => cleanup());

describe('StreamingAskUserQuestionCard key stability', () => {
  it('keeps the same field/option DOM nodes as the prompt grows token-by-token', () => {
    // Successive streamed prefixes of the same tool input.
    const p1 = '{"questions":[{"question":"Which databa","options":[{"label":"Postgr"}]}]}';
    const p2 = '{"questions":[{"question":"Which database?","options":[{"label":"Postgres"}]}]}';

    const { container, rerender } = render(<StreamingAskUserQuestionCard raw={p1} />);
    const field1 = container.querySelector('.qf-field');
    const option1 = container.querySelector('.qf-chip');
    expect(field1).not.toBeNull();
    expect(option1).not.toBeNull();
    // text reflects the early prefix
    expect(container.querySelector('.qf-label')?.textContent).toBe('Which databa');

    rerender(<StreamingAskUserQuestionCard raw={p2} />);
    const field2 = container.querySelector('.qf-field');
    const option2 = container.querySelector('.qf-chip');

    // Positional keys mean React updates these nodes in place rather than
    // remounting them (which would replay the reveal every token).
    expect(field2).toBe(field1);
    expect(option2).toBe(option1);
    // …and the text updated in place to the longer prefix.
    expect(container.querySelector('.qf-label')?.textContent).toBe('Which database?');
    expect(container.querySelector('.qf-chip-copy')?.textContent).toBe('Postgres');
  });
});
