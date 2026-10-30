// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';
import { RailConversationRow } from '../../src/components/entry-nav-rail/RailConversationRow';

vi.mock('../../src/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const targets = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Folder ${i}` })) as Project[];

// The menu dismisses on any scroll because its anchor is a snapshot of the
// row — but the 移动到 list is itself a scroll container, and scrolling it
// must not close the menu out from under the pointer.
it('keeps the menu open while the 移动到 list scrolls, and closes on outside scroll', () => {
  render(
    <RailConversationRow rowId="conversation:test" title="Chat" selected={false} onOpen={vi.fn()} moveTargets={targets} onMove={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'designs.menuMore' }));
  fireEvent.click(screen.getByTestId('entry-nav-conversation-move'));
  const list = screen.getByRole('menu', { name: 'chat.moveConversationTo' });

  fireEvent.scroll(list);
  expect(screen.getByRole('menu', { name: 'chat.moveConversationTo' })).toBeTruthy();

  fireEvent.scroll(document.body);
  expect(screen.queryByRole('menu', { name: 'chat.moveConversationTo' })).toBeNull();
});
