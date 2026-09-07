import { describe, expect, it } from 'vitest';

import { quotePopoverMaxHeight } from '../../../src/runtime/chat/quote-popover';

describe('Notes 浮层的可用高度', () => {
  it('跟随 ChatPanel 顶边与芯片位置，不使用固定窗口高度', () => {
    expect(quotePopoverMaxHeight({ anchorTop: 700, panelTop: 52 })).toBe(629);
    expect(quotePopoverMaxHeight({ anchorTop: 260, panelTop: 52 })).toBe(189);
    expect(quotePopoverMaxHeight({ anchorTop: 80, panelTop: 72 })).toBe(0);
  });

  it('为浮层与面板顶部保留安全间距', () => {
    expect(
      quotePopoverMaxHeight({ anchorTop: 240, panelTop: 40, gap: 9, safeInset: 16 }),
    ).toBe(175);
  });
});
