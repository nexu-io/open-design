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
  onRemoveMember: (elementId: string) => void;
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
      onRemove={() => {}}
      onRemoveMember={overrides.onRemoveMember}
      sending={false}
      t={((key: string) => String(key)) as never}
    />,
  );
}

describe('BoardComposerPopover captured-component removal', () => {
  it('calls onRemoveMember with the chip elementId when the chip × is clicked', () => {
    const onRemoveMember = vi.fn();
    renderPopover({
      target: podTarget([member('alpha', 'Alpha'), member('beta', 'Beta')]),
      onRemoveMember,
    });

    const alphaChip = screen.getByText('Alpha').closest('.board-pod-chip');
    if (!alphaChip) throw new Error('Alpha chip not rendered');
    fireEvent.click(within(alphaChip as HTMLElement).getByRole('button'));

    expect(onRemoveMember).toHaveBeenCalledTimes(1);
    expect(onRemoveMember).toHaveBeenCalledWith('alpha');
  });

  it('renders every captured chip so members beyond the sixth stay reachable', () => {
    const members = Array.from({ length: 10 }, (_, i) => member(`m${i}`, `Member ${i}`));
    renderPopover({ target: podTarget(members), onRemoveMember: () => {} });

    expect(document.querySelectorAll('.board-pod-chip')).toHaveLength(10);
    expect(screen.queryByText('Member 9')).not.toBeNull();
  });
});
