// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';
import type { PreviewCommentMember } from '../../src/types';

afterEach(() => {
  cleanup();
});

function member(elementId: string, label = elementId): PreviewCommentMember {
  return {
    elementId,
    selector: `#${elementId}`,
    label,
    text: '',
    position: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '',
  };
}

function podTarget(members: PreviewCommentMember[]): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'pod-1',
    selector: '',
    label: 'Pod',
    text: '',
    position: { x: 0, y: 0, width: 100, height: 60 },
    htmlHint: '',
    selectionKind: 'pod',
    memberCount: members.length,
    podMembers: members,
  };
}

function renderPopover(overrides: {
  target: PreviewCommentSnapshot;
  onHoverMember?: (elementId: string | null) => void;
}) {
  return render(
    <BoardComposerPopover
      target={overrides.target}
      existing={null}
      draft=""
      notes={[]}
      onDraft={() => {}}
      onAddDraft={() => {}}
      onRemoveQueuedNote={() => {}}
      onClose={() => {}}
      onSaveComment={() => {}}
      onSendBatch={() => {}}
      onRemoveMember={() => {}}
      onHoverMember={overrides.onHoverMember}
      sending={false}
      t={((key: string) => String(key)) as never}
    />,
  );
}

function chipFor(label: string): HTMLElement {
  const chip = screen.getByText(label).closest('.board-pod-chip');
  if (!chip) throw new Error(`chip for ${label} not rendered`);
  return chip as HTMLElement;
}

describe('BoardComposerPopover captured-chip hover', () => {
  it('reports the elementId when the pointer enters a chip and clears on leave', () => {
    const onHoverMember = vi.fn();
    renderPopover({
      target: podTarget([member('alpha', 'Alpha'), member('beta', 'Beta')]),
      onHoverMember,
    });

    fireEvent.pointerEnter(chipFor('Alpha'));
    expect(onHoverMember).toHaveBeenLastCalledWith('alpha');

    fireEvent.pointerLeave(chipFor('Alpha'));
    expect(onHoverMember).toHaveBeenLastCalledWith(null);
  });

  it('reports the elementId from keyboard focus on the chip remove button', () => {
    const onHoverMember = vi.fn();
    renderPopover({
      target: podTarget([member('alpha', 'Alpha'), member('beta', 'Beta')]),
      onHoverMember,
    });

    const betaRemove = within(chipFor('Beta')).getByRole('button');
    fireEvent.focus(betaRemove);
    expect(onHoverMember).toHaveBeenLastCalledWith('beta');

    fireEvent.blur(betaRemove);
    expect(onHoverMember).toHaveBeenLastCalledWith(null);
  });

  it('ignores pointer events from touch and pen so a tap on a chip does not flicker the highlight', () => {
    const onHoverMember = vi.fn();
    renderPopover({
      target: podTarget([member('alpha', 'Alpha')]),
      onHoverMember,
    });

    fireEvent.pointerEnter(chipFor('Alpha'), { pointerType: 'touch' });
    fireEvent.pointerLeave(chipFor('Alpha'), { pointerType: 'touch' });
    fireEvent.pointerEnter(chipFor('Alpha'), { pointerType: 'pen' });
    fireEvent.pointerLeave(chipFor('Alpha'), { pointerType: 'pen' });
    expect(onHoverMember).not.toHaveBeenCalled();

    fireEvent.pointerEnter(chipFor('Alpha'), { pointerType: 'mouse' });
    expect(onHoverMember).toHaveBeenLastCalledWith('alpha');
  });

  it('does not throw when onHoverMember is omitted', () => {
    expect(() =>
      renderPopover({
        target: podTarget([member('alpha', 'Alpha')]),
      }),
    ).not.toThrow();

    expect(() => fireEvent.pointerEnter(chipFor('Alpha'))).not.toThrow();
    expect(() => fireEvent.pointerLeave(chipFor('Alpha'))).not.toThrow();
  });
});
