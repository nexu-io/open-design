// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SketchEditor, applySketchContextMenuSimplification } from '../../src/components/SketchEditor';
import { emptySketchScene, type ExcalidrawSketchScene } from '../../src/components/sketch-model';

const mockData = vi.hoisted<{
  excalidrawScene: ExcalidrawSketchScene;
  excalidrawToast: string | null;
  updateScene: ReturnType<typeof vi.fn>;
  setOpenDialog: ReturnType<typeof vi.fn>;
  lastProps: Record<string, any> | null;
}>(() => ({
  excalidrawScene: {
    elements: [{ id: 'api-element', type: 'rectangle', isDeleted: false }],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  },
  excalidrawToast: null,
  updateScene: vi.fn(),
  setOpenDialog: vi.fn(),
  lastProps: null,
}));

vi.mock('@excalidraw/excalidraw', async () => {
  const React = await import('react');
  const MainMenu = Object.assign(
    (props: Record<string, any>) => React.createElement('div', null, props.children),
    {
      Item: ({ children, icon, ...props }: Record<string, any>) =>
        React.createElement('button', { type: 'button', ...props }, icon, children),
      DefaultItems: {
        SearchMenu: () => null,
        Help: () => null,
        ChangeCanvasBackground: () => null,
      },
      Separator: () => null,
    },
  );
  return {
    Excalidraw: (props: Record<string, any>) => {
      mockData.lastProps = props;
      React.useEffect(() => {
        props.excalidrawAPI?.({
          getSceneElementsIncludingDeleted: () => mockData.excalidrawScene.elements,
          getAppState: () => mockData.excalidrawScene.appState,
          getFiles: () => mockData.excalidrawScene.files,
          updateScene: mockData.updateScene,
          setOpenDialog: mockData.setOpenDialog,
        });
      }, [props.excalidrawAPI]);
      return React.createElement(
        'div',
        {
          'data-testid': 'excalidraw',
          'data-lang': props.langCode,
          'data-theme': props.theme,
        },
        React.createElement('button', {
          type: 'button',
          'data-testid': 'main-menu-trigger',
          className: 'main-menu-trigger',
        }),
        React.createElement(
          'label',
          { title: 'Selection — V or 1' },
          React.createElement('input', {
            type: 'radio',
            'data-testid': 'toolbar-selection',
            'aria-label': 'Selection',
          }),
        ),
        React.createElement(
          'label',
          { title: 'Text — T or 8' },
          React.createElement('input', {
            type: 'radio',
            'data-testid': 'toolbar-text',
            'aria-label': 'Text',
          }),
        ),
        React.createElement('button', {
          type: 'button',
          'data-testid': 'toolbar-extra',
          className: 'App-toolbar__extra-tools-trigger',
          title: 'More tools',
        }),
        React.createElement('button', {
          type: 'button',
          'data-testid': 'default-sidebar-trigger',
          className: 'default-sidebar-trigger',
          title: 'Library',
        }),
        mockData.excalidrawToast
          ? React.createElement(
            'div',
            { className: 'Toast' },
            React.createElement('p', { className: 'Toast__message' }, mockData.excalidrawToast),
          )
          : null,
        props.renderTopRightUI?.(false, {}),
        props.children,
      );
    },
    MainMenu,
    convertToExcalidrawElements: vi.fn((elements: unknown[]) => elements),
    exportToBlob: vi.fn(async () => new Blob(['mock image'], { type: 'image/png' })),
  };
});

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  if (!window.requestAnimationFrame) {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
  }
});

afterEach(() => {
  cleanup();
  document.querySelectorAll('.excalidraw-modal-container').forEach((node) => node.remove());
  mockData.lastProps = null;
  mockData.excalidrawScene = {
    elements: [{ id: 'api-element', type: 'rectangle', isDeleted: false }],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
  mockData.excalidrawToast = null;
  mockData.updateScene.mockClear();
  document.querySelectorAll('.excalidraw-modal-container').forEach((portal) => portal.remove());
  vi.clearAllMocks();
  vi.useRealTimers();
});

const noop = () => {};

function sceneWithElement(): ExcalidrawSketchScene {
  return {
    elements: [{ id: 'scene-element', type: 'rectangle', isDeleted: false }],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}

function renderEditor(overrides: Partial<Parameters<typeof SketchEditor>[0]> = {}) {
  return render(
    <SketchEditor
      scene={emptySketchScene('test.sketch.json')}
      onSceneChange={noop}
      onSave={noop}
      fileName="test.sketch.json"
      {...overrides}
    />,
  );
}

function saveButton(): HTMLButtonElement {
  return screen.getByTestId('sketch-menu-save') as HTMLButtonElement;
}

describe('SketchEditor save', () => {
  it('renders Excalidraw with the current Open Design locale', () => {
    renderEditor({ dirty: true });
    expect(document.querySelector('[data-testid="excalidraw"]')?.getAttribute('data-lang')).toBe('zh-CN');
  });

  it('drives one shared tooltip per Excalidraw control without the duplicate native/black bubbles', async () => {
    renderEditor({ dirty: true });

    const mainMenu = screen.getByTestId('main-menu-trigger');
    await waitFor(() => expect(mainMenu.getAttribute('data-tooltip')).toBe('sketch.tooltipMainMenu'));
    expect(mainMenu.classList.contains('od-tooltip')).toBe(true);
    expect(mainMenu.getAttribute('data-tooltip-placement')).toBe('bottom');
    expect(mainMenu.getAttribute('aria-label')).toBe('sketch.tooltipMainMenu');
    // Only the shared TooltipLayer drives the bubble now: no second
    // sketch-specific ::after tooltip and no redundant native `title` — that
    // pairing is exactly what rendered the duplicate white + black popups.
    expect(mainMenu.getAttribute('data-od-sketch-tooltip')).toBeNull();
    expect(mainMenu.getAttribute('title')).toBeNull();

    const selection = screen.getByTestId('toolbar-selection');
    const selectionLabel = selection.closest('label');
    expect(selectionLabel?.getAttribute('data-tooltip')).toBe('sketch.tooltipSelection');
    expect(selectionLabel?.classList.contains('od-tooltip')).toBe(true);
    expect(selectionLabel?.getAttribute('data-od-sketch-tooltip')).toBeNull();
    // The element's native Excalidraw title is left untouched so the shared
    // TooltipLayer can suppress it on hover; we no longer overwrite it.
    expect(selectionLabel?.getAttribute('title')).toBe('Selection — V or 1');
    expect(selection.getAttribute('aria-label')).toBe('sketch.tooltipSelection');

    const text = screen.getByTestId('toolbar-text');
    const textLabel = text.closest('label');
    expect(textLabel?.getAttribute('data-tooltip')).toBe('sketch.tooltipText');

    // The library is disabled in the sketch editor, so its trigger is no longer
    // part of the tooltip set.
    const library = screen.getByTestId('default-sidebar-trigger');
    expect(library.getAttribute('data-tooltip')).toBeNull();
    expect(library.classList.contains('od-tooltip')).toBe(false);
  });

  it('adds close controls and localizes Excalidraw portal dialogs', async () => {
    renderEditor({ dirty: true });

    const portal = document.createElement('div');
    portal.className = 'excalidraw-modal-container';
    portal.innerHTML = `
      <div class="Modal">
        <div class="Modal__content">
          <div class="HelpDialog__header"><button>Documentation</button></div>
          <button title="Wrap selection in frame">Wrap selection in frame</button>
          <button aria-label="Generate">Generate</button>
          <textarea placeholder="Write Mermaid diagram definition here..."></textarea>
        </div>
      </div>
    `;
    document.body.appendChild(portal);

    const close = await waitFor(() => {
      const button = portal.querySelector<HTMLButtonElement>('.od-sketch-dialog-close');
      expect(button).toBeTruthy();
      return button!;
    });

    expect(portal.textContent).toContain('将选区包裹为画框');
    expect(portal.textContent).toContain('生成');
    expect(portal.querySelector('button[title="将选区包裹为画框"]')).toBeTruthy();
    expect(portal.querySelector('button[aria-label="生成"]')).toBeTruthy();
    expect(portal.querySelector('textarea')?.getAttribute('placeholder')).toBe('在这里输入 Mermaid 图表定义...');
    expect(close.getAttribute('aria-label')).toBe('关闭');
    expect(portal.classList.contains('od-sketch-help-modal')).toBe(true);

    fireEvent.click(close);
    expect(mockData.updateScene).toHaveBeenCalledWith({ appState: { openDialog: null } });

    mockData.updateScene.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockData.updateScene).toHaveBeenCalledWith({ appState: { openDialog: null } });
  });

  it('submits the Mermaid dialog when pressing command-enter inside its textarea', async () => {
    renderEditor({ dirty: true });

    const portal = document.createElement('div');
    portal.className = 'excalidraw-modal-container';
    portal.innerHTML = `
	      <div class="Modal">
	        <div class="Modal__content">
	          <h2>Mermaid to Excalidraw</h2>
	          <textarea placeholder="Write Mermaid diagram definition here..."></textarea>
	          <div class="ttd-dialog-panel-button-container">
	            <button type="button">Insert <span>→</span></button>
	            <div class="ttd-dialog-submit-shortcut">
	              <div class="ttd-dialog-submit-shortcut__key">Cmd</div>
	              <div class="ttd-dialog-submit-shortcut__key">Enter</div>
	            </div>
	          </div>
	        </div>
	      </div>
	    `;
    const insert = portal.querySelector<HTMLButtonElement>('button')!;
    const textarea = portal.querySelector<HTMLTextAreaElement>('textarea')!;
    const onInsert = vi.fn();
    insert.addEventListener('click', onInsert);
    document.body.appendChild(portal);

    await waitFor(() => expect(portal.classList.contains('od-sketch-modal')).toBe(true));
    expect(insert.querySelector('kbd')).toBeNull();
    expect(portal.querySelector('.ttd-dialog-submit-shortcut')).toBeNull();
    expect(portal.querySelector('.ttd-dialog-submit-shortcut__key')).toBeNull();
    expect(insert.textContent).not.toContain('Cmd');
    expect(insert.textContent).not.toContain('Enter');

    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(enter);
    expect(onInsert).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);

    const commandEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(commandEnter);

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(commandEnter.defaultPrevented).toBe(true);
  });

  it('does not wire Excalidraw library state into sketch editing', () => {
    renderEditor({
      scene: {
        ...emptySketchScene('test.sketch.json'),
        libraryItems: [
          {
            id: 'lib-box',
            status: 'unpublished',
            created: 1710000000000,
            elements: [{ id: 'box-template', type: 'rectangle', isDeleted: false }],
          },
        ],
      } as ExcalidrawSketchScene & { libraryItems: readonly unknown[] },
    });

    expect(mockData.lastProps?.initialData?.libraryItems).toBeUndefined();
    expect(mockData.lastProps?.onLibraryChange).toBeUndefined();
  });

  it('keeps sketch context menus minimal and clamps them inside the canvas', () => {
    const root = document.createElement('div');
    const popover = document.createElement('div');
    const menu = document.createElement('ul');
    root.appendChild(popover);
    popover.appendChild(menu);
    popover.className = 'popover';
    popover.style.left = '260px';
    popover.style.top = '20px';
    menu.className = 'context-menu';
    for (const actionName of ['paste', 'copyAsPng', 'addToLibrary', 'sendBackward', 'copy', 'copyAsSvg']) {
      const item = document.createElement('li');
      item.setAttribute('data-testid', actionName);
      item.textContent = actionName;
      menu.appendChild(item);
      const separator = document.createElement('hr');
      menu.appendChild(separator);
    }
    document.body.appendChild(root);

    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 300,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });
    vi.spyOn(popover, 'getBoundingClientRect').mockReturnValue({
      x: 260,
      y: 20,
      left: 260,
      top: 20,
      right: 460,
      bottom: 220,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    applySketchContextMenuSimplification(root, root);

    expect(Array.from(menu.querySelectorAll('li')).map((item) => item.getAttribute('data-testid'))).toEqual([
      'copy',
      'paste',
      'copyAsPng',
      'copyAsSvg',
    ]);
    expect(menu.querySelector('[data-testid="addToLibrary"]')).toBeNull();
    expect(menu.querySelector('hr')).toBeNull();
    expect(menu.classList.contains('od-sketch-context-menu')).toBe(true);
    expect(popover.classList.contains('od-sketch-context-popover')).toBe(true);
    expect(popover.style.left).toBe('92px');
  });

  it('does not re-append already-ordered context menu items on repeat runs', () => {
    // Regression: this runs on every MutationObserver tick. Re-`appendChild`-ing
    // nodes that are already in place detaches/re-inserts them each frame, which
    // cancels the in-flight pointer interaction and makes items unclickable.
    const root = document.createElement('div');
    const popover = document.createElement('div');
    const menu = document.createElement('ul');
    root.appendChild(popover);
    popover.appendChild(menu);
    popover.className = 'popover';
    popover.style.left = '40px';
    popover.style.top = '20px';
    menu.className = 'context-menu';
    for (const actionName of ['copy', 'paste', 'copyAsPng', 'copyAsSvg']) {
      const item = document.createElement('li');
      item.setAttribute('data-testid', actionName);
      item.textContent = actionName;
      menu.appendChild(item);
    }
    document.body.appendChild(root);

    const rect = {
      x: 0,
      y: 0,
      left: 40,
      top: 20,
      right: 200,
      bottom: 180,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ ...rect, left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600 } as DOMRect);
    vi.spyOn(popover, 'getBoundingClientRect').mockReturnValue(rect);

    // First pass: already in canonical order, so nothing should be reordered.
    applySketchContextMenuSimplification(root, root);
    const appendSpy = vi.spyOn(menu, 'appendChild');
    // Second pass (mimics a later MutationObserver tick).
    applySketchContextMenuSimplification(root, root);

    expect(appendSpy).not.toHaveBeenCalled();
    expect(Array.from(menu.querySelectorAll('li')).map((item) => item.getAttribute('data-testid'))).toEqual([
      'copy',
      'paste',
      'copyAsPng',
      'copyAsSvg',
    ]);
  });

  it('allows explicit http and https web embeds while rejecting missing or unsafe protocols', () => {
    renderEditor({ dirty: true });

    const validate = mockData.lastProps?.validateEmbeddable as ((link: string) => boolean) | undefined;
    expect(validate?.('https://open-design.ai')).toBe(true);
    expect(validate?.('http://localhost:3000')).toBe(true);
    expect(validate?.('open-design.ai')).toBe(false);
    expect(validate?.('   ')).toBe(false);
    expect(validate?.('javascript:alert(1)')).toBe(false);
  });

  it('rewrites Excalidraw web embed whitelist toast to the local validation message', async () => {
    mockData.excalidrawToast = '目前不允许嵌入此网址。请在 GitHub 上提交 issue 请求将此网址加入白名单';
    renderEditor({ dirty: true });

    await waitFor(() => expect(screen.getByText('sketch.tooltipEmbeddable')).toBeTruthy());
    expect(screen.queryByText(/GitHub|白名单/)).toBeNull();
    expect(document.querySelector('.Toast')?.getAttribute('data-od-embed-toast-rewritten')).toBe('true');
  });

  it('strips Excalidraw runtime app state before passing initial data back to Excalidraw', () => {
    renderEditor({
      scene: {
        elements: [],
        appState: {
          viewBackgroundColor: '#ffffff',
          collaborators: { stale: true },
          openMenu: 'canvas',
          editingElement: { id: 'editing' },
        },
        files: {},
      },
    });

    const appState = mockData.lastProps?.initialData?.appState;
    expect(appState?.viewBackgroundColor).toBe('#ffffff');
    expect(appState?.collaborators).toBeUndefined();
    expect(appState?.openMenu).toBeUndefined();
    expect(appState?.editingElement).toBeUndefined();
  });

  it('shows the Save label by default', () => {
    renderEditor({ dirty: true });
    expect(saveButton().textContent).toBe('common.save');
  });

  it('does not render the sketch Close menu item', () => {
    renderEditor({ dirty: true });
    expect(screen.queryByTestId('sketch-menu-close')).toBeNull();
  });

  it('shows the saving label when saving', () => {
    renderEditor({ saving: true, dirty: true });
    expect(saveButton().textContent).toBe('sketch.saving');
  });

  it('shows the Excalidraw top-right saved state from autosave props', () => {
    renderEditor({ scene: sceneWithElement(), dirty: false, savedAt: 1710000000000 });
    expect(screen.getByTestId('sketch-save-state').textContent).toContain('sketch.saved');
  });

  it('shows dirty state in the Excalidraw top-right save status', () => {
    renderEditor({ scene: sceneWithElement(), dirty: true });
    expect(screen.getByTestId('sketch-save-state').textContent).toContain('sketch.tooltipDirty');
  });

  it('disables the button while saving', () => {
    renderEditor({ saving: true, dirty: true });
    expect(saveButton().disabled).toBe(true);
  });

  it('disables the button when nothing is editable', () => {
    renderEditor({ scene: emptySketchScene(), dirty: false, hasPreservedRawItems: false });
    expect(saveButton().disabled).toBe(true);
  });

  it('enables the button when the scene has elements', () => {
    renderEditor({ scene: sceneWithElement() });
    expect(saveButton().disabled).toBe(false);
  });

  it('enables the button when dirty', () => {
    renderEditor({ dirty: true });
    expect(saveButton().disabled).toBe(false);
  });

  it('enables the button when there are preserved raw items', () => {
    renderEditor({ hasPreservedRawItems: true });
    expect(saveButton().disabled).toBe(false);
  });

  it('enables the button when legacy items need migration', () => {
    renderEditor({
      legacyItems: [{ kind: 'pen', points: [{ x: 10, y: 20 }], color: '#000', size: 2 }],
    });
    expect(saveButton().disabled).toBe(false);
  });

  it('calls onSave with the latest Excalidraw scene when clicked', () => {
    const onSave = vi.fn();
    renderEditor({ dirty: true, onSave });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      elements: mockData.excalidrawScene.elements,
      appState: mockData.excalidrawScene.appState,
      files: mockData.excalidrawScene.files,
    });
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('libraryItems');
  });

  it('strips Excalidraw runtime app state before saving the latest scene', () => {
    mockData.excalidrawScene.appState = {
      viewBackgroundColor: '#ffffff',
      collaborators: new Map([['socket-1', { username: 'stale' }]]),
      openMenu: 'canvas',
      pendingImageElementId: 'image-1',
    } as Record<string, unknown> & { viewBackgroundColor: string };
    const onSave = vi.fn();
    renderEditor({ dirty: true, onSave });
    fireEvent.click(saveButton());

    const savedScene = onSave.mock.calls[0]?.[0] as ExcalidrawSketchScene;
    expect(savedScene.appState?.viewBackgroundColor).toBe('#ffffff');
    expect(savedScene.appState?.collaborators).toBeUndefined();
    expect(savedScene.appState?.openMenu).toBeUndefined();
    expect(savedScene.appState?.pendingImageElementId).toBeUndefined();
  });

  it('does not echo Excalidraw hydration changes back to the parent scene', () => {
    const onSceneChange = vi.fn();
    renderEditor({ onSceneChange });

    act(() => {
      mockData.lastProps?.onChange?.([], { viewBackgroundColor: '#ffffff' }, {});
    });

    expect(onSceneChange).not.toHaveBeenCalled();
  });

  it('reports user scene changes once and ignores duplicate Excalidraw updates', () => {
    const onSceneChange = vi.fn();
    renderEditor({ onSceneChange });

    act(() => {
      mockData.lastProps?.onChange?.([], { viewBackgroundColor: '#ffffff' }, {});
    });

    const elements = [{ id: 'drawn', type: 'rectangle', version: 1, versionNonce: 1, isDeleted: false }];
    act(() => {
      mockData.lastProps?.onChange?.(elements, { viewBackgroundColor: '#ffffff' }, {});
    });

    expect(onSceneChange).toHaveBeenCalledTimes(1);
    expect(onSceneChange.mock.calls[0]?.[1]).toEqual({
      markDirty: true,
      discardLegacyItems: true,
    });

    act(() => {
      mockData.lastProps?.onChange?.(elements, { viewBackgroundColor: '#ffffff' }, {});
    });

    expect(onSceneChange).toHaveBeenCalledTimes(1);
  });

  it('shows the checkmark icon after save completes', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    const btn = saveButton();
    expect(btn.textContent).not.toBe('common.save');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.disabled).toBe(false);
  });

  it('shows a toast after save completes', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(document.querySelector('.od-toast')?.textContent).toContain('sketch.saved');
  });

  it('shows a clickable toast after exporting an image', async () => {
    const onExportImage = vi.fn().mockResolvedValue({ fileName: 'exports/test.png' });
    const onOpenExportedImage = vi.fn();
    renderEditor({
      scene: sceneWithElement(),
      onExportImage,
      onOpenExportedImage,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('sketch-menu-export-image'));
    });

    await waitFor(() => expect(onExportImage).toHaveBeenCalledTimes(1));
    expect(onExportImage.mock.calls[0]?.[1]).toBe('test.png');
    expect(document.querySelector('.od-toast')?.textContent).toContain('fileViewer.exportImageSaved');
    expect(document.querySelector('.od-toast')?.textContent).toContain('exports/test.png');

    fireEvent.click(screen.getByRole('button', { name: 'workspace.openFile' }));
    expect(onOpenExportedImage).toHaveBeenCalledWith('exports/test.png');
  });

  it('reverts to the Save label after the saved indicator expires', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(saveButton().textContent).not.toBe('common.save');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().disabled).toBe(false);
  });

  it('does not show the checkmark when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });

  it('hides the checkmark when dirty becomes true after a successful save', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(true);
    const { rerender } = renderEditor({ dirty: true, onSave });

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().querySelector('svg')).not.toBeNull();

    rerender(
      <SketchEditor
        scene={emptySketchScene('test.sketch.json')}
        onSceneChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={false}
      />,
    );

    rerender(
      <SketchEditor
        scene={emptySketchScene('test.sketch.json')}
        onSceneChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={true}
      />,
    );

    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });

  it('hides the checkmark when save fails if success indicator is still visible', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    renderEditor({ dirty: true, onSave });

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().textContent).not.toBe('common.save');

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });

  it('has an aria-label matching the default save state', () => {
    renderEditor();
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('has an aria-label when dirty is true', () => {
    renderEditor({ dirty: true });
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('has an aria-label showing saving state while saving', () => {
    renderEditor({ saving: true, dirty: true });
    expect(saveButton().getAttribute('aria-label')).toBe('sketch.saving');
  });

  it('has an aria-label showing saved state after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const btn = saveButton();
    expect(btn.getAttribute('aria-label')).toBe('sketch.saved');
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  it('reverts the aria-label to default after saved indicator expires', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().getAttribute('aria-label')).toBe('sketch.saved');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('keeps the aria-label as default when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('shows the default aria-label when dirty becomes true after a successful save', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(true);
    const { rerender } = renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().getAttribute('aria-label')).toBe('sketch.saved');
    rerender(
      <SketchEditor
        scene={emptySketchScene('test.sketch.json')}
        onSceneChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={false}
      />,
    );
    rerender(
      <SketchEditor
        scene={emptySketchScene('test.sketch.json')}
        onSceneChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={true}
      />,
    );
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });
});
