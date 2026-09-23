// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ShareMoreMenu } from '../../src/components/share/ShareMoreMenu';

afterEach(cleanup);
const items = [
  { id: 'vercel', label: 'Deploy to Vercel', onSelect: vi.fn() },
  { id: 'cloudflare', label: 'Deploy to Cloudflare Pages', onSelect: vi.fn() },
];
it('opens only the two deployment actions and Escape restores trigger focus', () => {
  const outerEscape = vi.fn();
  render(<div onKeyDown={outerEscape}><ShareMoreMenu label="More sharing options" items={items} /></div>);
  const trigger = screen.getByRole('button', { name: 'More sharing options' });
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  expect(screen.getByRole('menuitem', { name: 'Deploy to Vercel' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: 'Deploy to Cloudflare Pages' })).toHaveFocus();
  outerEscape.mockClear();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(trigger).toHaveFocus();
  expect(outerEscape).not.toHaveBeenCalled();
});
it('selects once and closes; disabled actions never invoke the callback', () => {
  const select = vi.fn();
  const { rerender } = render(<ShareMoreMenu label="More" items={[{ id: 'vercel', label: 'Vercel', onSelect: select }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem'));
  expect(select).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).toBeNull();
  rerender(<ShareMoreMenu label="More" items={[{ id: 'vercel', label: 'Vercel', onSelect: select, disabled: true, title: 'Read only' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByRole('menuitem')).toBeDisabled();
  fireEvent.click(screen.getByRole('menuitem'));
  expect(select).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).toBeNull();
});
