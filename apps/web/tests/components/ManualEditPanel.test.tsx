import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ManualEditPanel, emptyManualEditDraft, manualEditPatchSummary } from '../../src/components/ManualEditPanel';
import type { ManualEditTarget } from '../../src/edit-mode/types';

const target: ManualEditTarget = {
  id: 'hero-title',
  kind: 'text',
  label: 'Hero Title',
  tagName: 'h1',
  className: 'hero',
  text: 'Original',
  rect: { x: 0, y: 0, width: 120, height: 40 },
  fields: { text: 'Original' },
  attributes: { 'data-od-id': 'hero-title' },
  styles: {
    color: '',
    backgroundColor: '',
    fontSize: '',
    fontWeight: '',
    textAlign: '',
    padding: '',
    margin: '',
    borderRadius: '',
    border: '',
    width: '',
    minHeight: '',
  },
  outerHtml: '<h1 data-od-id="hero-title">Original</h1>',
};

describe('ManualEditPanel', () => {
  let dom: JSDOM;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = dom.window.document.querySelector('#root') as HTMLDivElement;
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    dom.window.close();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'HTMLElement');
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('opens with target metadata and calls selection from the layers rail', () => {
    const onSelectTarget = vi.fn();
    renderPanel({ onSelectTarget });

    expect(host.textContent).toContain('Hero Title');
    expect(host.textContent).toContain('hero-title');

    click(buttonByText('Hero Title'));

    expect(onSelectTarget).toHaveBeenCalledWith(target);
  });

  it('builds content patches from the active target', () => {
    const onApplyPatch = vi.fn();
    renderPanel({ onApplyPatch });

    click(buttonByText('Apply Content'));

    expect(onApplyPatch).toHaveBeenCalledWith(
      { id: 'hero-title', kind: 'set-text', value: 'Updated copy' },
      'Content: Hero Title',
    );
  });

  it('shows invalid attribute JSON without applying a write patch', () => {
    const onApplyPatch = vi.fn();
    const onError = vi.fn();
    renderPanel({ onApplyPatch, onError, attributesText: '{bad' });

    click(buttonByText('Attributes'));
    click(buttonByText('Apply Attributes'));

    expect(onError).toHaveBeenCalled();
    expect(onApplyPatch).not.toHaveBeenCalled();
  });

  it('summarizes full-source history entries without rendering the full file', () => {
    const source = '<html><body>' + 'x'.repeat(10_000) + '</body></html>';

    expect(manualEditPatchSummary({ kind: 'set-full-source', source })).toBe(
      JSON.stringify({ kind: 'set-full-source', bytes: source.length }),
    );
    expect(manualEditPatchSummary({ kind: 'set-full-source', source })).not.toContain('x'.repeat(100));
  });

  function renderPanel({
    onSelectTarget = vi.fn(),
    onApplyPatch = vi.fn(),
    onError = vi.fn(),
    attributesText = '{}',
  }: {
    onSelectTarget?: ReturnType<typeof vi.fn>;
    onApplyPatch?: ReturnType<typeof vi.fn>;
    onError?: ReturnType<typeof vi.fn>;
    attributesText?: string;
  }) {
    const draft = {
      ...emptyManualEditDraft('<html></html>'),
      text: 'Updated copy',
      attributesText,
      outerHtml: target.outerHtml,
    };
    act(() => {
      root.render(
        <ManualEditPanel
          targets={[target]}
          selectedTarget={target}
          draft={draft}
          history={[]}
          error={null}
          canUndo={false}
          canRedo={false}
          onSelectTarget={onSelectTarget}
          onDraftChange={vi.fn()}
          onApplyPatch={onApplyPatch}
          onError={onError}
          onCancelDraft={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
        />,
      );
    });
  }

  function buttonByText(text: string): HTMLButtonElement {
    const buttons = Array.from(host.querySelectorAll('button'));
    const button = buttons.find((item) => item.textContent?.includes(text));
    if (!button) throw new Error(`Button not found: ${text}`);
    return button as HTMLButtonElement;
  }

  function click(button: HTMLButtonElement): void {
    act(() => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }
});
