import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const routinesCss = readFileSync(new URL('../../src/styles/viewer/routines.css', import.meta.url), 'utf8');
const composioCss = readFileSync(new URL('../../src/styles/viewer/composio.css', import.meta.url), 'utf8');
const entryLayoutCss = readFileSync(new URL('../../src/styles/home/entry-layout.css', import.meta.url), 'utf8');

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('workspace tabs chrome styles', () => {
  it('keeps only a small intentional inset before the first tab', () => {
    const chrome = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header');
    const traffic = cssDeclarations(shellCss, '.workspace-tabs-chrome .workspace-tabs-traffic');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    const projectStrip = cssDeclarations(routinesCss, '.workspace-shell .workspace-tabs-strip');

    expect(ruleValue(chrome, 'padding')).toBe('0 8px 0 6px');
    expect(ruleValue(traffic, 'margin-right')).toBe('var(--app-chrome-traffic-margin)');
    expect(ruleValue(projectChrome, 'padding')).toBe('0 8px 0 0');
    expect(ruleValue(projectStrip, 'align-items')).toBe('center');
  });

  it('keeps the project composer input inset and focus ring polished', () => {
    const composerShell = cssDeclarations(routinesCss, '.app .composer-shell');
    const focusedComposerShell = cssDeclarations(routinesCss, '.app .composer-shell:focus-within');

    expect(ruleValue(composerShell, 'padding')).toBe('7px');
    expect(ruleValue(composerShell, 'border-color')).toBe('color-mix(in srgb, var(--border) 84%, var(--border-strong))');
    expect(ruleValue(composerShell, 'box-shadow')).toBe('var(--shadow-sm)');
    expect(ruleValue(focusedComposerShell, 'border-color')).toBe('color-mix(in srgb, var(--accent) 34%, var(--border-strong))');
    expect(ruleValue(focusedComposerShell, 'box-shadow')).toContain('0 0 0 1px');
  });

  it('keeps the fixed composer visually stable while quick search is open', () => {
    const fixedLayer = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer',
    );
    const fixedComposer = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer',
    );
    const fixedShell = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-shell',
    );
    const fixedShellHover = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-shell:hover',
    );
    const fixedShellFocus = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-shell:focus-within',
    );
    const fixedShellDragActive = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer.drag-active .composer-shell',
    );
    const fixedInput = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-wrap',
    );
    const fixedInputFocus = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-wrap:focus-within',
    );
    const fixedEditable = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-editor .composer-editable',
    );
    const fixedTextarea = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer textarea',
    );
    const fixedInputControl = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer input',
    );
    const fixedPlaceholder = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-input-placeholder',
    );
    const fixedToolbarIcon = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .icon-btn',
    );
    const fixedStagedRow = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context-row',
    );
    const fixedDesignSystemTrigger = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context-picker--design-system .project-ds-picker-trigger',
    );
    const fixedStagedChip = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip',
    );
    const fixedStagedChipHover = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip:hover',
    );
    const fixedStagedContext = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context',
    );
    const fixedStagedOrder = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-order',
    );
    const fixedStagedPreviewTrigger = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-preview-trigger',
    );
    const fixedStagedContextOpen = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context-open',
    );
    const fixedStagedCommentButton = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-comment button',
    );
    const fixedStagedName = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-name',
    );
    const fixedStagedContextKind = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context-kind',
    );
    const fixedStagedIcon = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-context .staged-icon',
    );
    const fixedGenericStagedIcon = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip .staged-icon',
    );
    const fixedGenericStagedRemove = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .staged-chip .staged-remove',
    );
    const fixedActiveFile = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-active-file',
    );
    const fixedToolbarMode = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .session-mode-toggle__trigger',
    );
    const fixedToolbarAvatar = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .avatar-agent-trigger',
    );
    const fixedToolbarAvatarButton = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-row .avatar-btn',
    );
    const fixedToolbarSend = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-send',
    );
    const fixedToolbarSendDisabled = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .composer-send:disabled',
    );
    const fixedWorkingDirPill = cssDeclarations(
      routinesCss,
      'body.od-quick-switcher-open .chat-composer-fixed-layer .working-dir-pill-trigger',
    );
    expect(ruleValue(fixedLayer, 'pointer-events')).toBe('none');
    expect(ruleValue(fixedLayer, 'opacity')).toBe('0.58');
    expect(ruleValue(fixedComposer, 'pointer-events')).toBe('none');
    expect(ruleValue(fixedShell, 'border-color')).toBe('transparent');
    expect(fixedShell).not.toMatch(/(?:^|[;\n])\s*background\s*:/);
    expect(ruleValue(fixedShell, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedShellHover, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedShellHover, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedShellFocus, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedShellFocus, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedShellDragActive, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedShellDragActive, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedInput, 'background')).toBe('var(--bg-fill-tertiary)');
    expect(ruleValue(fixedInput, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedInput, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedInputFocus, 'background')).toBe('var(--bg-fill-tertiary)');
    expect(ruleValue(fixedInputFocus, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedInputFocus, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedEditable, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedEditable, 'caret-color')).toBe('transparent');
    expect(fixedEditable).not.toMatch(/(?:^|[;\n])\s*background\s*:/);
    expect(ruleValue(fixedTextarea, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedTextarea, 'caret-color')).toBe('transparent');
    expect(fixedTextarea).not.toMatch(/(?:^|[;\n])\s*background\s*:/);
    expect(ruleValue(fixedInputControl, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedInputControl, 'caret-color')).toBe('transparent');
    expect(fixedInputControl).not.toMatch(/(?:^|[;\n])\s*background\s*:/);
    expect(ruleValue(fixedPlaceholder, 'color')).toBe('color-mix(in srgb, var(--text-muted) 72%, transparent)');
    expect(ruleValue(fixedStagedRow, 'border-color')).toBe('transparent');
    for (const toolbarControl of [
      fixedDesignSystemTrigger,
      fixedStagedChip,
      fixedStagedChipHover,
      fixedStagedContext,
      fixedStagedOrder,
      fixedStagedPreviewTrigger,
      fixedStagedContextOpen,
      fixedStagedCommentButton,
      fixedActiveFile,
      fixedToolbarIcon,
      fixedToolbarMode,
      fixedToolbarAvatar,
      fixedToolbarAvatarButton,
      fixedToolbarSend,
      fixedWorkingDirPill,
    ]) {
      expect(ruleValue(toolbarControl, 'background')).toBe('transparent');
      expect(ruleValue(toolbarControl, 'border-color')).toBe('transparent');
      expect(ruleValue(toolbarControl, 'box-shadow')).toBe('none');
      expect(ruleValue(toolbarControl, 'color')).toBe('var(--text-muted)');
    }
    expect(ruleValue(fixedStagedName, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedStagedContextKind, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedStagedIcon, 'background')).toBe('transparent');
    expect(ruleValue(fixedStagedIcon, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedStagedIcon, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedStagedIcon, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedGenericStagedIcon, 'background')).toBe('transparent');
    expect(ruleValue(fixedGenericStagedIcon, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedGenericStagedIcon, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedGenericStagedIcon, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedGenericStagedRemove, 'background')).toBe('transparent');
    expect(ruleValue(fixedGenericStagedRemove, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedGenericStagedRemove, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedGenericStagedRemove, 'color')).toBe('var(--text-muted)');
    expect(ruleValue(fixedToolbarSendDisabled, 'background')).toBe('transparent');
    expect(ruleValue(fixedToolbarSendDisabled, 'border-color')).toBe('transparent');
    expect(ruleValue(fixedToolbarSendDisabled, 'box-shadow')).toBe('none');
    expect(ruleValue(fixedToolbarSendDisabled, 'color')).toBe('var(--text-faint)');
  });

  it('uses hairline dividers for the tab chrome and entry rail', () => {
    const chrome = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header');
    const chromeDivider = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header::after');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    const rail = cssDeclarations(entryLayoutCss, '.entry-nav-rail');
    const railDivider = cssDeclarations(entryLayoutCss, '.entry-nav-rail::after');

    const hairlineColor = 'color-mix(in srgb, var(--border) 64%, transparent)';
    expect(ruleValue(chrome, 'border-bottom')).toBe('0');
    expect(ruleValue(projectChrome, 'border-bottom')).toBe('0');
    expect(ruleValue(rail, 'border-right')).toBe('0');
    expect(ruleValue(chromeDivider, 'height')).toBe('1px');
    expect(ruleValue(chromeDivider, 'background')).toBe(hairlineColor);
    expect(ruleValue(chromeDivider, 'transform')).toBe('scaleY(0.5)');
    expect(ruleValue(railDivider, 'width')).toBe('1px');
    expect(ruleValue(railDivider, 'background')).toBe(hairlineColor);
    expect(ruleValue(railDivider, 'transform')).toBe('scaleX(0.5)');
  });

  it('keeps workspace tabs compact and centered in the top chrome', () => {
    const projectTab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab');
    const activeProjectTab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab.is-active');
    const tabSeparator = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab + .workspace-tab::before');
    const main = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab__main');
    const popover = cssDeclarations(shellCss, '.workspace-tabs-popover');
    const preview = cssDeclarations(shellCss, '.workspace-tab-preview');
    const presentOverlay = cssDeclarations(composioCss, '.present-overlay');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    const projectStrip = cssDeclarations(routinesCss, '.workspace-shell .workspace-tabs-strip');
    const sharedStrip = cssDeclarations(shellCss, '.workspace-tabs-strip');

    expect(ruleValue(projectTab, 'height')).toBe('26px');
    expect(ruleValue(projectTab, 'align-self')).toBe('center');
    expect(ruleValue(projectTab, 'border-radius')).toBe('7px');
    // Tabs auto-shrink: flex-grow 0 (never balloon), flex-shrink 1 (squeeze to
    // fit) down to --workspace-tab-min-width before the strip scrolls.
    expect(ruleValue(projectTab, 'flex')).toBe('0 1 156px');
    expect(ruleValue(projectTab, 'min-width')).toBe('var(--workspace-tab-min-width, 56px)');
    expect(ruleValue(activeProjectTab, 'background')).toBe('color-mix(in srgb, var(--bg-panel) 94%, var(--bg-subtle))');
    expect(ruleValue(activeProjectTab, 'border-color')).toBe('var(--workspace-active-tab-border)');
    expect(ruleValue(activeProjectTab, 'box-shadow')).toContain('0 1px 2px');
    expect(ruleValue(activeProjectTab, 'box-shadow')).toContain('inset');
    expect(projectChrome).not.toContain('overflow:');
    expect(projectStrip).not.toContain('overflow:');
    expect(projectStrip).not.toContain('overflow-x:');
    expect(ruleValue(sharedStrip, 'overflow-x')).toBe('auto');
    expect(ruleValue(sharedStrip, 'overflow-y')).toBe('hidden');
    expect(ruleValue(tabSeparator, 'display')).toBe('none');
    expect(ruleValue(main, 'z-index')).toBe('2');
    expect(Number(ruleValue(popover, 'z-index'))).toBeGreaterThan(
      Number(ruleValue(presentOverlay, 'z-index')),
    );
    expect(ruleValue(preview, 'box-sizing')).toBe('border-box');
    expect(routinesCss).not.toContain('.workspace-shell .workspace-tab.is-active::before');
    expect(routinesCss).not.toContain('.workspace-shell .workspace-tab.is-active::after');
  });

  it('pins the Home tab fixed and stuck to the left edge', () => {
    const pinnedShared = cssDeclarations(shellCss, '.workspace-tab.is-pinned');
    const pinnedProject = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab.is-pinned');

    // Home never shrinks (flex-shrink 0) in either chrome…
    expect(ruleValue(pinnedShared, 'flex')).toBe('0 0 96px');
    expect(ruleValue(pinnedProject, 'flex')).toBe('0 0 104px');
    // …and stays stuck to the left edge with an opaque background so scrolled
    // project tabs pass behind it instead of squeezing it.
    expect(ruleValue(pinnedShared, 'position')).toBe('sticky');
    expect(ruleValue(pinnedShared, 'left')).toBe('0');
    expect(ruleValue(pinnedProject, 'position')).toBe('sticky');
    expect(ruleValue(pinnedProject, 'left')).toBe('0');
    expect(ruleValue(pinnedProject, 'background')).toBe('var(--workspace-tab-bar-bg)');
  });

  it('uses a rounded highlight for inactive workspace tab hover', () => {
    const hoverTab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab:not(.is-active):hover');

    expect(ruleValue(hoverTab, 'border-radius')).toBe('7px');
    expect(ruleValue(hoverTab, 'background')).toContain('calc(100% - 2px)');
    expect(ruleValue(hoverTab, 'border-color')).toBe('transparent');
    expect(ruleValue(hoverTab, 'box-shadow')).toContain('inset 0 0 0 1px');
  });

  it('keeps the pinned Home tab opaque on hover/focus so crowded tabs cannot bleed through (#4446)', () => {
    // The generic inactive-hover rule paints a translucent panel wash
    // (color-mix(… 78%, transparent)) sized to calc(100% - 2px). Its specificity
    // (0,4,0) outranks the pinned base rule (0,3,0) and sits later in the
    // cascade, so without a pinned-specific override the sticky Home tab loses
    // its opaque background on hover/focus and horizontally-scrolled project
    // tabs bleed through it. The pinned tab needs its own hover/focus rule that
    // re-lays the opaque tab-bar background under that wash.
    const pinnedHover = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tab.is-pinned:not(.is-active):hover',
    );
    const pinnedFocus = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tab.is-pinned:not(.is-active):focus-within',
    );

    for (const block of [pinnedHover, pinnedFocus]) {
      const background = ruleValue(block, 'background');
      // Opaque base layer keeps scrolled tabs from bleeding through…
      expect(background).toContain('var(--workspace-tab-bar-bg)');
      // …while the translucent hover wash still rides on top for the affordance.
      expect(background).toContain('calc(100% - 2px)');
    }
  });

  it('gives dragged tabs physical collision feedback', () => {
    const tab = cssDeclarations(shellCss, '.workspace-tab');
    const dragging = cssDeclarations(shellCss, '.workspace-tab.is-dragging');
    const dragOverBefore = cssDeclarations(shellCss, '.workspace-tab.is-drag-over-before');
    const dragOverAfter = cssDeclarations(shellCss, '.workspace-tab.is-drag-over-after');
    const projectDragging = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab.is-dragging');

    expect(ruleValue(tab, 'cursor')).toBe('default');
    expect(ruleValue(tab, 'transition-property')).toContain('transform');
    expect(ruleValue(dragging, 'transform')).toBe('translateY(-2px) scale(1.015)');
    expect(ruleValue(dragging, 'z-index')).toBe('3');
    expect(ruleValue(dragOverBefore, 'border-color')).not.toContain('var(--accent)');
    expect(ruleValue(dragOverBefore, 'transform')).toBe('translateX(6px)');
    expect(ruleValue(dragOverAfter, 'transform')).toBe('translateX(-6px)');
    expect(ruleValue(projectDragging, 'box-shadow')).toContain('0 14px 30px');
    expect(shellCss).not.toContain('.workspace-tab.is-drag-over-before::after');
    expect(shellCss).not.toContain('.workspace-tab.is-drag-over-after::after');
  });
});
