// @vitest-environment jsdom
import { useState, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary } from '@open-design/contracts';
import { ShareTab } from '../../../src/components/share/ShareTab';

afterEach(cleanup);
type Props = ComponentProps<typeof ShareTab>;
function setup(overrides: Partial<Props> = {}) {
  const change = vi.fn();
  const publish = vi.fn().mockResolvedValue(undefined);
  const outerKey = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <div onKeyDown={outerKey}><ShareTab
      menuOrigin="toolbar"
      workspaceContext={{
        workspaceId: 'ws', workspaceType: 'team', teamId: 'team', workspaceMemberId: 'member',
        role: 'member', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
        planId: null, providerMode: 'platform_credits',
        seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
        permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
      }}
      t={(key) => key}
      shareAccess="private" shareAccessMenuOpen={open} setShareAccessMenuOpen={setOpen}
      shareAccessBusy={false} viewerOnly={false} setWorkspaceShareAccess={change}
      canPublishPublic={true} filePublished={false} publishedFileUrl=""
      copyPublishedFileLink={vi.fn().mockResolvedValue(undefined)} publishLinkFeedback={null}
      publishingPublicFile={false} publishProgress={null}
      unpublishCurrentFilePublic={publish} viewerOnlyDisabledTitle="read only"
      publishCurrentFilePublic={publish} publishFailureKey={null} streaming={false}
      sharePageUrl="" canCopyShareLink={false} shareUnavailableHint=""
      copyShareLink={vi.fn().mockResolvedValue(true)} copyShareLinkLabel=""
      canOpenSharePage={false} shareLinkStatusHint="" {...overrides}
    /></div>;
  }
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'fileViewer.workspaceAccessPrivate' });
  return { trigger, change, publish, outerKey };
}

it.each(['ArrowDown', 'ArrowUp'])('opens with %s and focuses selected scope without changing access', (key) => {
  const { trigger, change, publish } = setup();
  trigger.focus();
  fireEvent.keyDown(trigger, { key });
  expect(screen.getByRole('option', { selected: true })).toHaveFocus();
  expect(change).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it('moves focus with arrows/Home/End, then activates only the chosen option', () => {
  const { trigger, change, publish } = setup();
  fireEvent.click(trigger);
  const first = screen.getByRole('option', { name: 'fileViewer.workspaceAccessPrivate' });
  const last = screen.getByRole('option', { name: 'fileViewer.workspaceAccessMembers' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'ArrowDown' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'ArrowUp' });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Home' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'End' });
  expect(last).toHaveFocus();
  expect(first).toHaveAttribute('aria-selected', 'true');
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(last); // Native button activation; keyboard synthesis belongs to browser acceptance.
  expect(change).toHaveBeenCalledExactlyOnceWith('workspace');
  expect(publish).not.toHaveBeenCalled();
});

it('Escape dismisses only the scope list and returns focus to its trigger', () => {
  const { trigger, outerKey, change } = setup();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('option', { selected: true }), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(trigger).toHaveFocus();
  expect(outerKey).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
});

it.each([{ shareAccessBusy: true }, { viewerOnly: true }])('does not open a gated scope selector: %j', (gate) => {
  const { trigger, change } = setup(gate);
  expect(trigger).toBeDisabled();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(trigger);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
