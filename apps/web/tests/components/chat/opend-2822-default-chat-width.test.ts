import { describe, expect, it } from 'vitest';

import { defaultChatPanelWidthForSplit } from '../../../src/components/ProjectView';

describe('OPEND-2822 — first-open ChatPanel width', () => {
  it('keeps the first-open panel at the design baseline instead of taking half the workspace', () => {
    // The ChatPanel design baseline is 460px (the 406px composer content
    // measure is derived from that width). A first-open 1600px workspace must
    // therefore leave the artifact area with the remaining space; equal-half
    // sizing makes the chat column 796px and reproduces the reported bug.
    expect(defaultChatPanelWidthForSplit(1600)).toBe(460);
  });
});
