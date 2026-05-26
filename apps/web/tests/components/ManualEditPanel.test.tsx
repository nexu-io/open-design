import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import { I18nProvider } from '../../src/i18n';
import { ManualEditPanel, emptyManualEditDraft, manualEditPatchSummary, normalizeManualEditStyles, type ManualEditDraft } from '../../src/components/ManualEditPanel';
import { emptyManualEditStyles, type ManualEditPatch, type ManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

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
  styles: emptyManualEditStyles(),
  isLayoutContainer: false,
  outerHtml: '<h1 data-od-id="hero-title">Original</h1>',
};

type OnDraftChange = (draft: ManualEditDraft) => void;
type OnStyleChange = (id: string, styles: Partial<ManualEditStyles>, label: string) => void;
type OnInvalidStyle = (id: string, keys: Array<keyof ManualEditStyles>) => void;
type OnApplyPatch = (patch: ManualEditPatch, label: string) => void;
type OnError = (message: string) => void;
type OnClearSelection = () => void;

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

  it('restores manual edit tabs for content, HTML, and source edits', () => {
    renderPanel();

    expect(host.textContent).toContain('TYPOGRAPHY');
    expect(host.textContent).toContain('Content');
    expect(host.textContent).toContain('HTML');
    expect(host.textContent).toContain('Source');
  });

  it('applies selected-element HTML from the manual edit panel', () => {
    const onApplyPatch = vi.fn();
    renderPanel({
      onApplyPatch,
      outerHtml: '<h1 data-od-id="hero-title">Updated</h1>',
    });

    clickTab('HTML');
    const htmlArea = host.querySelector('.manual-edit-code.tall') as HTMLTextAreaElement | null;
    if (!htmlArea) throw new Error('HTML editor not found');
    expect(htmlArea.value).toBe('<h1 data-od-id="hero-title">Updated</h1>');
    const apply = buttonByText('Apply HTML');
    act(() => {
      apply.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onApplyPatch).toHaveBeenCalledWith(
      { id: 'hero-title', kind: 'set-outer-html', html: '<h1 data-od-id="hero-title">Updated</h1>' },
      'HTML: Hero Title',
    );
  });

  it('applies full source edits from the manual edit panel', () => {
    const onApplyPatch = vi.fn();
    renderPanel({
      onApplyPatch,
      fullSource: '<html><body><h1>Updated source</h1></body></html>',
    });

    clickTab('Source');
    const sourceArea = host.querySelector('.manual-edit-code.tall') as HTMLTextAreaElement | null;
    if (!sourceArea) throw new Error('Source editor not found');
    expect(sourceArea.value).toBe('<html><body><h1>Updated source</h1></body></html>');
    const apply = buttonByText('Apply Source');
    act(() => {
      apply.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onApplyPatch).toHaveBeenCalledWith(
      { kind: 'set-full-source', source: '<html><body><h1>Updated source</h1></body></html>' },
      'Full source',
    );
  });

  it('allows returning from an element inspector to the page inspector', () => {
    const onClearSelection = vi.fn();
    renderPanel({ onClearSelection });

    const pageButton = host.querySelector('button[aria-label="Show page inspector"]') as HTMLButtonElement | null;
    if (!pageButton) throw new Error('Page inspector button not found');

    act(() => {
      pageButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('lists hidden targets so they can be selected outside the canvas', () => {
    const onSelectTarget = vi.fn();
    const hiddenTarget: ManualEditTarget = {
      ...target,
      id: 'authors',
      label: 'Authors',
      tagName: 'section',
      kind: 'container',
      rect: { x: 0, y: 0, width: 0, height: 0 },
      isHidden: true,
    };
    renderPanel({ targets: [target, hiddenTarget], selectedTarget: null, onSelectTarget });

    const hiddenRow = Array.from(host.querySelectorAll('.manual-edit-layer-row'))
      .find((row) => row.textContent?.includes('Authors')) as HTMLButtonElement | undefined;
    if (!hiddenRow) throw new Error('Hidden target row not found');
    expect(hiddenRow.textContent).toContain('Hidden');

    act(() => {
      hiddenRow.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectTarget).toHaveBeenCalledWith(hiddenTarget);
  });

  it('renders layer panel labels from the active locale', () => {
    const hiddenTarget: ManualEditTarget = {
      ...target,
      id: 'authors',
      label: 'Authors',
      tagName: 'section',
      kind: 'container',
      isHidden: true,
    };
    renderPanel({ targets: [hiddenTarget], selectedTarget: null, locale: 'fr' });

    expect(host.textContent).toContain('Calques');
    expect(host.textContent).toContain('Masqué');
    expect(host.textContent).not.toContain('Layers');
    expect(host.textContent).not.toContain('Hidden');
  });

  it('renders the empty layers message from the active locale', () => {
    renderPanel({ targets: [], selectedTarget: null, locale: 'fr' });

    expect(host.textContent).toContain('Aucun calque modifiable trouvé.');
    expect(host.textContent).not.toContain('No editable layers found.');
  });

  it('normalizes font stacks and writes a usable font-family value', () => {
    const onDraftChange = vi.fn();
    const onStyleChange = vi.fn();
    renderPanel({
      onDraftChange,
      onStyleChange,
      styles: {
        ...emptyManualEditStyles(),
        fontFamily: '"Roboto", sans-serif',
        fontSize: '32px',
        color: '#111111',
        paddingTop: '8px',
      },
    });

    const fontSelect = host.querySelector('select') as HTMLSelectElement | null;
    if (!fontSelect) throw new Error('Font select not found');
    expect(fontSelect.value).toBe('Roboto, Arial, sans-serif');

    act(() => {
      fontSelect.value = 'Georgia, serif';
      fontSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      styles: expect.objectContaining({ fontFamily: 'Georgia, serif' }),
    }));
    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { fontFamily: 'Georgia, serif' }, 'Style: Hero Title');
    expect(onStyleChange).not.toHaveBeenCalledWith(
      'hero-title',
      expect.objectContaining({ fontSize: '32px', color: '#111111', paddingTop: '8px' }),
      'Style: Hero Title',
    );
  });

  it('shows px-backed values without px in numeric inputs', () => {
    renderPanel({
      styles: {
        ...emptyManualEditStyles(),
        fontSize: '32px',
      },
    });

    const sizeRow = Array.from(host.querySelectorAll('.cc-row'))
      .find((row) => row.textContent?.includes('Size'));
    const sizeInput = sizeRow?.querySelector('input') as HTMLInputElement | null;
    if (!sizeInput) throw new Error('Size input not found');

    expect(sizeInput.value).toBe('32');
  });

  it('increments normal rows and quad cells with normalized values', () => {
    const onStyleChange = vi.fn();
    renderPanel({
      onStyleChange,
      styles: {
        ...emptyManualEditStyles(),
        fontSize: '32px',
        opacity: '0.5',
        paddingTop: '8px',
      },
    });

    const sizeIncrease = host.querySelector('button[aria-label="Size increase"]') as HTMLButtonElement | null;
    const opacityIncrease = host.querySelector('button[aria-label="Opacity increase"]') as HTMLButtonElement | null;
    const paddingTopDecrease = host.querySelector('.cc-quad button[aria-label="T decrease"]') as HTMLButtonElement | null;
    if (!sizeIncrease || !opacityIncrease || !paddingTopDecrease) throw new Error('Stepper button not found');

    act(() => {
      sizeIncrease.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      opacityIncrease.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      paddingTopDecrease.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { fontSize: '33px' }, 'Style: Hero Title');
    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { opacity: '0.6' }, 'Style: Hero Title');
    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { paddingTop: '7px' }, 'Style: Hero Title');
  });

  it('does not persist an unchanged target style when the inspector opens', () => {
    vi.useFakeTimers();
    try {
      const onApplyPatch = vi.fn();
      renderPanel({ onApplyPatch });

      act(() => {
        vi.advanceTimersByTime(1600);
      });

      expect(onApplyPatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes valid style values before host preview/persistence', () => {
    expect(normalizeManualEditStyles({
      fontSize: '48',
      color: '#f00',
      opacity: '2',
      lineHeight: '1.4',
    }, { layoutEnabled: true })).toEqual({
      ok: true,
      styles: {
        fontSize: '48px',
        color: '#ff0000',
        opacity: '1',
        lineHeight: '1.4',
      },
    });
    expect(normalizeManualEditStyles({ lineHeight: '49px' }, { layoutEnabled: true })).toEqual({
      ok: true,
      styles: { lineHeight: '49px' },
    });
  });

  it('rejects invalid style values before host preview/persistence', () => {
    expect(normalizeManualEditStyles({ color: 'tomato' }, { layoutEnabled: true })).toEqual({
      ok: false,
      error: 'color must be a hex color.',
    });
    expect(normalizeManualEditStyles({ lineHeight: '-1px' }, { layoutEnabled: true })).toEqual({
      ok: false,
      error: 'Line height must be a positive number or px value.',
    });
  });

  it('treats empty values as inline style clears', () => {
    expect(normalizeManualEditStyles({ fontSize: '', color: '' }, { layoutEnabled: true })).toEqual({
      ok: true,
      styles: { fontSize: '', color: '' },
    });
  });

  it('does not validate unchanged computed line-height values on blur', () => {
    const onError = vi.fn();
    const onStyleChange = vi.fn();
    renderPanel({
      onError,
      onStyleChange,
      styles: {
        ...emptyManualEditStyles(),
        lineHeight: '48.96px',
      },
    });

    const lineInput = Array.from(host.querySelectorAll('.cc-row'))
      .find((row) => row.textContent?.includes('Line'))
      ?.querySelector('input') as HTMLInputElement | null;
    if (!lineInput) throw new Error('Line input not found');

    act(() => {
      lineInput.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }));
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onStyleChange).not.toHaveBeenCalled();
  });

  it('accepts edited computed pixel line-height values', () => {
    const onError = vi.fn();
    const onStyleChange = vi.fn();
    renderPanel({
      onError,
      onStyleChange,
      styles: {
        ...emptyManualEditStyles(),
        lineHeight: '48.96px',
      },
    });

    const lineInput = Array.from(host.querySelectorAll('.cc-row'))
      .find((row) => row.textContent?.includes('Line'))
      ?.querySelector('input') as HTMLInputElement | null;
    if (!lineInput) throw new Error('Line input not found');

    act(() => {
      lineInput.value = '49px';
      Simulate.change(lineInput);
    });

    expect(onError).toHaveBeenCalledWith('');
    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { lineHeight: '49px' }, 'Style: Hero Title');
  });

  it('does not persist unchanged page styles when no target is selected', () => {
    vi.useFakeTimers();
    try {
      const onApplyPatch = vi.fn();
      renderPanel({ onApplyPatch, selectedTarget: null });

      act(() => {
        vi.advanceTimersByTime(1600);
      });

      expect(onApplyPatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits only the changed page style field', () => {
    const onStyleChange = vi.fn();
    renderPanel({ onStyleChange, selectedTarget: null });

    const bgSwatch = host.querySelector('button[aria-label="Pick Background"]') as HTMLButtonElement | null;
    if (!bgSwatch) throw new Error('Background swatch not found');

    act(() => {
      bgSwatch.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    const colorTile = host.querySelector('button[aria-label="#3b82f6"]') as HTMLButtonElement | null;
    if (!colorTile) throw new Error('Background color tile not found');
    act(() => {
      colorTile.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onStyleChange).toHaveBeenCalledWith('__body__', { backgroundColor: '#3b82f6' }, 'Page styles');
    expect(onStyleChange).not.toHaveBeenCalledWith(
      '__body__',
      expect.objectContaining({ fontFamily: expect.any(String) }),
      'Page styles',
    );
    expect(onStyleChange).not.toHaveBeenCalledWith(
      '__body__',
      expect.objectContaining({ fontSize: expect.any(String) }),
      'Page styles',
    );
  });

  it('does not emit untouched page fields when changing the page font', () => {
    const onStyleChange = vi.fn();
    renderPanel({ onStyleChange, selectedTarget: null });

    const fontSelect = host.querySelector('.cc-row select') as HTMLSelectElement | null;
    if (!fontSelect) throw new Error('Font select not found');

    act(() => {
      fontSelect.value = 'Georgia, serif';
      fontSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(onStyleChange).toHaveBeenCalledWith('__body__', { fontFamily: 'Georgia, serif' }, 'Page styles');
    expect(onStyleChange).not.toHaveBeenCalledWith(
      '__body__',
      expect.objectContaining({ backgroundColor: expect.any(String) }),
      'Page styles',
    );
    expect(onStyleChange).not.toHaveBeenCalledWith(
      '__body__',
      expect.objectContaining({ fontSize: expect.any(String) }),
      'Page styles',
    );
  });

  it('shows an inactive Page inspector for fragment HTML sources', () => {
    const onStyleChange = vi.fn();
    renderPanel({ onStyleChange, selectedTarget: null, pageStylesEnabled: false });

    expect(host.textContent).toContain('Page styles are available only for full HTML documents.');
    expect(host.textContent).not.toContain('Background');
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('select')).toBeNull();
    expect(onStyleChange).not.toHaveBeenCalled();
  });

  it('keeps explicit empty page values as field-specific clears', () => {
    const onStyleChange = vi.fn();
    renderPanel({ onStyleChange, selectedTarget: null });

    const fontSelect = host.querySelector('.cc-row select') as HTMLSelectElement | null;
    if (!fontSelect) throw new Error('Font select not found');

    act(() => {
      fontSelect.value = '';
      fontSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(onStyleChange).toHaveBeenCalledWith('__body__', { fontFamily: '' }, 'Page styles');
    expect(onStyleChange).not.toHaveBeenCalledWith(
      '__body__',
      expect.objectContaining({ backgroundColor: expect.any(String), fontFamily: expect.any(String) }),
      'Page styles',
    );
  });

  it('renders layout as inactive for non-layout single targets', () => {
    const onStyleChange = vi.fn();
    renderPanel({
      onStyleChange,
      styles: {
        ...emptyManualEditStyles(),
        gap: 'normal',
        flexDirection: 'row',
      },
    });

    const layoutSection = sectionByTitle('LAYOUT');
    expect(layoutSection.classList.contains('cc-section-inactive')).toBe(true);
    expect(layoutSection.textContent).toContain('Select a container or group to edit layout.');
    const gapInput = layoutSection.querySelector('input') as HTMLInputElement | null;
    const directionSelect = layoutSection.querySelector('select') as HTMLSelectElement | null;
    if (!gapInput || !directionSelect) throw new Error('Layout controls not found');

    expect(gapInput.disabled).toBe(true);
    expect(directionSelect.disabled).toBe(true);
    expect(normalizeManualEditStyles({ gap: '12', flexDirection: 'column' }, { layoutEnabled: false })).toEqual({
      ok: true,
      styles: {},
    });
  });

  it('enables layout controls for flex or grid containers', () => {
    const onStyleChange = vi.fn();
    renderPanel({
      onStyleChange,
      selectedTarget: { ...target, isLayoutContainer: true },
      styles: {
        ...emptyManualEditStyles(),
        gap: '8px',
        flexDirection: 'row',
      },
    });

    const layoutSection = sectionByTitle('LAYOUT');
    expect(layoutSection.classList.contains('cc-section-inactive')).toBe(false);
    expect(layoutSection.textContent).not.toContain('Select a container or group to edit layout.');
    const gapInput = layoutSection.querySelector('input') as HTMLInputElement | null;
    const directionSelect = layoutSection.querySelector('select') as HTMLSelectElement | null;
    const gapIncrease = layoutSection.querySelector('button[aria-label="Gap increase"]') as HTMLButtonElement | null;
    if (!gapInput || !directionSelect) throw new Error('Layout controls not found');
    expect(gapInput.disabled).toBe(false);
    expect(directionSelect.disabled).toBe(false);
    if (!gapIncrease) throw new Error('Gap increase control not found');

    act(() => {
      gapIncrease.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      directionSelect.value = 'column';
      directionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { gap: '9px' }, 'Style: Hero Title');
    expect(onStyleChange).toHaveBeenCalledWith('hero-title', { flexDirection: 'column' }, 'Style: Hero Title');
  });

  it('keeps layout controls enabled for hidden layout containers', () => {
    const onStyleChange = vi.fn();
    const hiddenLayoutTarget: ManualEditTarget = {
      ...target,
      id: 'hidden-section',
      label: 'Hidden Section',
      tagName: 'section',
      kind: 'container',
      rect: { x: 0, y: 0, width: 0, height: 0 },
      isHidden: true,
      isLayoutContainer: true,
    };
    renderPanel({
      onStyleChange,
      targets: [hiddenLayoutTarget],
      selectedTarget: hiddenLayoutTarget,
      styles: {
        ...emptyManualEditStyles(),
        gap: '12px',
        flexDirection: 'row',
      },
    });

    const layoutSection = sectionByTitle('LAYOUT');
    expect(layoutSection.classList.contains('cc-section-inactive')).toBe(false);
    expect(layoutSection.textContent).not.toContain('Select a container or group to edit layout.');
    const gapIncrease = layoutSection.querySelector('button[aria-label="Gap increase"]') as HTMLButtonElement | null;
    const directionSelect = layoutSection.querySelector('select') as HTMLSelectElement | null;
    if (!gapIncrease || !directionSelect) throw new Error('Layout controls not found');
    expect(gapIncrease.disabled).toBe(false);
    expect(directionSelect.disabled).toBe(false);

    act(() => {
      gapIncrease.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      directionSelect.value = 'column';
      directionSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    expect(onStyleChange).toHaveBeenCalledWith('hidden-section', { gap: '13px' }, 'Style: Hidden Section');
    expect(onStyleChange).toHaveBeenCalledWith('hidden-section', { flexDirection: 'column' }, 'Style: Hidden Section');
  });

  it('summarizes full-source history entries without rendering the full file', () => {
    const source = '<html><body>' + 'x'.repeat(10_000) + '</body></html>';

    expect(manualEditPatchSummary({ kind: 'set-full-source', source })).toBe(
      JSON.stringify({ kind: 'set-full-source', bytes: source.length }),
    );
    expect(manualEditPatchSummary({ kind: 'set-full-source', source })).not.toContain('x'.repeat(100));
  });

  function sectionByTitle(title: string): HTMLElement {
    const section = Array.from(host.querySelectorAll('.cc-section'))
      .find((candidate) => candidate.querySelector('.cc-section-head')?.textContent === title) as HTMLElement | undefined;
    if (!section) throw new Error(`${title} section not found`);
    return section;
  }

  function buttonByText(text: string): HTMLButtonElement {
    const button = Array.from(host.querySelectorAll('button'))
      .find((candidate) => candidate.textContent === text) as HTMLButtonElement | undefined;
    if (!button) throw new Error(`${text} button not found`);
    return button;
  }

  function clickTab(text: string) {
    const button = buttonByText(text);
    act(() => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  }

  function renderPanel({
    onDraftChange = vi.fn<OnDraftChange>(),
    onApplyPatch = vi.fn<OnApplyPatch>(),
    onError = vi.fn<OnError>(),
    onStyleChange = vi.fn<OnStyleChange>(),
    onInvalidStyle = vi.fn<OnInvalidStyle>(),
    onClearSelection = vi.fn<OnClearSelection>(),
    onSelectTarget = vi.fn<(target: ManualEditTarget) => void>(),
    attributesText = '{}',
    targets = [target],
    selectedTarget = target,
    styles = emptyManualEditStyles(),
    pageStylesEnabled = true,
    outerHtml = target.outerHtml,
    fullSource = '<html></html>',
    locale,
  }: {
    onDraftChange?: OnDraftChange;
    onApplyPatch?: OnApplyPatch;
    onError?: OnError;
    onStyleChange?: OnStyleChange;
    onInvalidStyle?: OnInvalidStyle;
    onClearSelection?: OnClearSelection;
    onSelectTarget?: (target: ManualEditTarget) => void;
    attributesText?: string;
    targets?: ManualEditTarget[];
    selectedTarget?: ManualEditTarget | null;
    styles?: ReturnType<typeof emptyManualEditStyles>;
    pageStylesEnabled?: boolean;
    outerHtml?: string;
    fullSource?: string;
    locale?: 'en' | 'fr';
  } = {}) {
    const draft = {
      ...emptyManualEditDraft(fullSource),
      text: 'Updated copy',
      attributesText,
      styles,
      outerHtml,
    };
    act(() => {
      const panel = (
        <ManualEditPanel
          targets={targets}
          selectedTarget={selectedTarget}
          draft={draft}
          history={[]}
          error={null}
          canUndo={false}
          canRedo={false}
          pageStylesEnabled={pageStylesEnabled}
          onSelectTarget={onSelectTarget}
          onDraftChange={onDraftChange}
          onStyleChange={onStyleChange}
          onInvalidStyle={onInvalidStyle}
          onApplyPatch={onApplyPatch}
          onError={onError}
          onClearSelection={onClearSelection}
          onCancelDraft={vi.fn<() => void>()}
          onUndo={vi.fn<() => void>()}
          onRedo={vi.fn<() => void>()}
        />
      );
      root.render(
        locale ? <I18nProvider initial={locale}>{panel}</I18nProvider> : panel,
      );
    });
  }

});
