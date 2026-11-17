// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnchoredMenuShell } from '../../../src/components/chat/AnchoredMenuShell';

afterEach(cleanup);

function Fixture({ enabled = true, close = () => {} }: { enabled?: boolean; close?: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="chat-log" data-testid="owner">
      <button data-artifact-anchor="publish:test" onClick={() => setOpen(true)}>Share</button>
      <div data-testid="nested" />
    </div>
    <div className="chat-log" data-testid="other-chat" />
    <div data-testid="preview" />
    {open && <AnchoredMenuShell anchorId="publish:test" className="" wrapperClassName=""
      onConversationScroll={enabled ? () => { close(); setOpen(false); } : undefined}>
      <div data-testid="panel-scroll">Share content</div>
    </AnchoredMenuShell>}
  </>;
}

it('dismisses on the owning conversation scroll immediately and can reopen', () => {
  render(<Fixture />);
  fireEvent.click(screen.getByText('Share'));
  expect(screen.queryByRole('menu')).not.toBeNull();
  fireEvent.scroll(screen.getByTestId('owner'));
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(screen.getByText('Share'));
  expect(screen.queryByRole('menu')).not.toBeNull();
  fireEvent.scroll(screen.getByTestId('owner'));
  expect(screen.queryByRole('menu')).toBeNull();
});

it('ignores panel, preview, nested content and other conversation scrolls', () => {
  render(<Fixture />);
  fireEvent.click(screen.getByText('Share'));
  for (const id of ['panel-scroll', 'preview', 'nested', 'other-chat']) {
    fireEvent.scroll(screen.getByTestId(id));
    expect(screen.queryByRole('menu')).not.toBeNull();
  }
});

it('keeps the opt-out toolbar/export behavior unchanged', () => {
  render(<Fixture enabled={false} />);
  fireEvent.click(screen.getByText('Share'));
  fireEvent.scroll(screen.getByTestId('owner'));
  expect(screen.queryByRole('menu')).not.toBeNull();
});

it('cleans up on dismissal/unmount and survives StrictMode', () => {
  const close = vi.fn();
  const view = render(<StrictMode><Fixture close={close} /></StrictMode>);
  fireEvent.click(screen.getByText('Share'));
  const owner = screen.getByTestId('owner');
  fireEvent.scroll(owner);
  fireEvent.scroll(owner);
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Share'));
  view.unmount();
  fireEvent.scroll(owner);
  expect(close).toHaveBeenCalledTimes(1);
});
