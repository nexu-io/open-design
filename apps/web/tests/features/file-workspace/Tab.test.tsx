// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tab } from '../../../src/features/file-workspace/components/Tab';
import { I18nProvider } from '../../../src/i18n';

function renderTab(props: Partial<Parameters<typeof Tab>[0]> = {}) {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <I18nProvider initial="en">
      <Tab label="design.md" active={false} onActivate={onActivate} onClose={onClose} {...props} />
    </I18nProvider>,
  );
  return { ...utils, onActivate, onClose };
}

afterEach(cleanup);

describe('Tab', () => {
  it('renders the label and marks the active tab', () => {
    renderTab({ active: true });
    expect(screen.getByText('design.md')).toBeInTheDocument();
    expect(screen.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  });

  it('renders meta text alongside the label', () => {
    renderTab({ meta: '(2)' });
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('fires onActivate on click and on Enter/Space keydown', () => {
    const { onActivate } = renderTab();
    const tab = screen.getByRole('tab');
    fireEvent.click(tab);
    fireEvent.keyDown(tab, { key: 'Enter' });
    fireEvent.keyDown(tab, { key: ' ' });
    fireEvent.keyDown(tab, { key: 'a' });
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it('renders a close button by default and fires onClose without activating', () => {
    const { onActivate, onClose } = renderTab();
    fireEvent.click(screen.getByLabelText('Close tab'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('omits the close button when closable is false', () => {
    renderTab({ closable: false });
    expect(screen.queryByLabelText('Close tab')).not.toBeInTheDocument();
  });

  it('omits the close button when no onClose handler is supplied', () => {
    renderTab({ onClose: undefined });
    expect(screen.queryByLabelText('Close tab')).not.toBeInTheDocument();
  });

  it('applies live-artifact and browser kind classes', () => {
    const { rerender } = renderTab({ kind: 'live-artifact' });
    expect(screen.getByRole('tab').className).toContain('live-artifact-tab');
    rerender(
      <I18nProvider initial="en">
        <Tab label="browser tab" active={false} onActivate={vi.fn()} kind="browser" />
      </I18nProvider>,
    );
    expect(screen.getByRole('tab').className).toContain('browser-tab');
  });

  it('renders live-artifact badges when a liveArtifact is supplied', () => {
    renderTab({
      liveArtifact: {
        status: 'idle',
        refreshStatus: 'idle',
      } as unknown as Parameters<typeof Tab>[0]['liveArtifact'],
    });
    expect(document.querySelector('.ws-live-artifact-badges')).toBeInTheDocument();
  });

  it('wires drag handlers only when draggable', () => {
    const onDragStart = vi.fn();
    renderTab({ draggable: true, onDragStart });
    const tab = screen.getByRole('tab');
    expect(tab).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(tab);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('does not attach drag handlers when not draggable', () => {
    const onDragStart = vi.fn();
    renderTab({ draggable: false, onDragStart });
    fireEvent.dragStart(screen.getByRole('tab'));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('applies the drag-over-edge modifier class', () => {
    renderTab({ draggable: true, dragOverEdge: 'after' });
    expect(screen.getByRole('tab').className).toContain('drag-over-after');
  });

  it('uses the explicit title over the derived label/meta title', () => {
    renderTab({ title: 'Custom title', meta: '(2)' });
    expect(screen.getByRole('tab')).toHaveAttribute('title', 'Custom title');
  });
});
