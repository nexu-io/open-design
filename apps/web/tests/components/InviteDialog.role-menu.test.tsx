// @vitest-environment jsdom
//
// Red spec for the "assign role" dropdown that never appears (P1).
//
// `.entry-invite__rows` is a scroll container (`max-height` + `overflow-y:
// auto`, styles/home/entry-layout.css). Any in-flow descendant positioned
// outside its box is clipped by CSS — invisible, no matter what React state
// says. The custom role listbox (restored from the demo in bfd3f5693,
// replacing a native <select> whose popup the browser draws outside the DOM)
// rendered INSIDE that container, so opening it painted the menu into the
// clipped overflow area and the user saw nothing.
//
// The invariant under test: the role listbox must render OUTSIDE the
// scroll-clipped rows container (portaled to the viewport layer), and stay
// fully interactive — open on trigger click, select a role, dismiss on
// outside mousedown without swallowing option clicks.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { InviteDialog } from '../../src/components/InviteDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-inviter',
});

afterEach(cleanup);

function openDialog() {
  render(
    <InviteDialog
      open
      onClose={() => {}}
      workspaceContext={TEAM_CONTEXT}
      availableSeats={3}
    />,
  );
}

function roleTrigger(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /分配角色|assign role/i,
  }) as HTMLButtonElement;
}

describe('InviteDialog — role menu escapes the scroll clip', () => {
  it('renders the open role listbox outside the overflow-clipped rows container', () => {
    openDialog();
    fireEvent.click(roleTrigger());

    const listbox = screen.getByRole('listbox');
    const rows = document.querySelector('.entry-invite__rows');
    expect(rows).not.toBeNull();
    // A descendant of the overflow-y:auto rows container is clipped to the
    // container's box by CSS; the menu must live outside it to be visible.
    expect(rows!.contains(listbox)).toBe(false);
    expect(roleTrigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('selects a role from the open menu (mousedown must not dismiss the menu first)', () => {
    openDialog();
    fireEvent.click(roleTrigger());

    const admin = screen.getByRole('option', { name: /管理员|admin/i });
    // Real pointer interaction is mousedown → click; the outside-mousedown
    // dismisser must recognize the (portaled) menu as "inside" or the option
    // unmounts before its click can land.
    fireEvent.mouseDown(admin);
    fireEvent.click(admin);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(roleTrigger().textContent).toMatch(/管理员|admin/i);
  });

  it('closes on mousedown outside both the trigger and the menu', () => {
    openDialog();
    fireEvent.click(roleTrigger());
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
