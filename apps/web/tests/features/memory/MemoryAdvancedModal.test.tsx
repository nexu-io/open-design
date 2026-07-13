// @vitest-environment jsdom
//
// The Advanced modal portals the raw MEMORY.md index editor plus a technical
// memory-tree view into a host element. These pin the closed / no-host guards,
// the backdrop-click close, the index draft edit + reset + save wiring, and the
// tree render (folders, child rows, edit action).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryTreeNode } from '@open-design/contracts';

import { MemoryAdvancedModal } from '../../../src/features/memory/components/MemoryAdvancedModal';
import { I18nProvider } from '../../../src/i18n';

function folder(id: string, over: Partial<MemoryTreeNode> = {}): MemoryTreeNode {
  return {
    id,
    parentId: null,
    path: `${id}/`,
    name: id,
    kind: 'folder',
    scope: 'global',
    sourcePacketIds: [],
    proposalIds: [],
    createdAt: 't',
    updatedAt: 't',
    ...over,
  };
}
function child(id: string, over: Partial<MemoryTreeNode> = {}): MemoryTreeNode {
  return {
    id,
    parentId: 'f1',
    path: `f1/${id}`,
    name: id,
    kind: 'entry',
    scope: 'global',
    sourcePacketIds: [],
    proposalIds: [],
    createdAt: 't',
    updatedAt: 't',
    ...over,
  };
}

function renderModal(props: Partial<Parameters<typeof MemoryAdvancedModal>[0]> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cbs = {
    onClose: vi.fn(),
    onIndexDraftChange: vi.fn(),
    onSaveIndex: vi.fn(),
    onStartEdit: vi.fn(),
  };
  const utils = render(
    <I18nProvider initial="en">
      <MemoryAdvancedModal
        open
        modalHost={host}
        index="INDEX"
        indexDraft={null}
        busy={false}
        memoryTree={[]}
        treeFolders={[]}
        treeChildren={new Map()}
        {...cbs}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, host, ...cbs };
}

afterEach(cleanup);

describe('MemoryAdvancedModal', () => {
  it('renders nothing when closed', () => {
    const { host } = renderModal({ open: false });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders nothing when there is no host', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <MemoryAdvancedModal
          open
          modalHost={null}
          onClose={vi.fn()}
          index=""
          indexDraft={null}
          onIndexDraftChange={vi.fn()}
          onSaveIndex={vi.fn()}
          busy={false}
          memoryTree={[]}
          treeFolders={[]}
          treeChildren={new Map()}
          onStartEdit={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes when the backdrop (but not the dialog) is clicked', () => {
    const { onClose } = renderModal();
    const backdrop = document.querySelector('.memory-action-modal-backdrop') as HTMLElement;
    // Clicking the dialog itself must NOT close (stopPropagation / target guard).
    fireEvent.mouseDown(document.querySelector('[role="dialog"]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the backdrop surface closes.
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('edits the index draft and wires reset + save', () => {
    const { onIndexDraftChange, onSaveIndex } = renderModal({ indexDraft: 'draft text' });
    const textarea = screen.getByDisplayValue('draft text');
    fireEvent.change(textarea, { target: { value: 'new draft' } });
    expect(onIndexDraftChange).toHaveBeenCalledWith('new draft');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onIndexDraftChange).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Save index' }));
    expect(onSaveIndex).toHaveBeenCalled();
  });

  it('renders the memory tree and wires a child edit action', () => {
    const { onStartEdit } = renderModal({
      memoryTree: [folder('f1'), child('c1')],
      treeFolders: [folder('f1')],
      treeChildren: new Map([['f1', [child('c1', { description: 'a note' })]]]),
    });
    expect(screen.getByText('Memory tree')).toBeInTheDocument();
    expect(screen.getByText('a note')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Edit'));
    expect(onStartEdit).toHaveBeenCalledWith('c1');
  });

  it('handles an empty folder (no children map entry) with a "0 nodes" count', () => {
    renderModal({
      memoryTree: [folder('f1')],
      treeFolders: [folder('f1')],
      // No entry for f1 in the map → the `?? []` fallback + the 0-children path.
      treeChildren: new Map(),
    });
    expect(screen.getByText('0 nodes')).toBeInTheDocument();
  });

  it('renders a single child without a description as "1 node"', () => {
    renderModal({
      memoryTree: [folder('f1'), child('c1')],
      treeFolders: [folder('f1')],
      // One child, no description → singular "node" + the no-description branch.
      treeChildren: new Map([['f1', [child('c1')]]]),
    });
    expect(screen.getByText('1 node')).toBeInTheDocument();
  });
});
