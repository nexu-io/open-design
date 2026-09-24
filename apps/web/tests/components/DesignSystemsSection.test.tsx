// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import postcss, { type Rule } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsSection } from '../../src/components/DesignSystemsSection';
import { I18nProvider } from '../../src/i18n';
import {
  fetchDesignSystems,
  importLocalDesignSystem,
  updateDesignSystemDraft,
} from '../../src/providers/registry';
import type { AppConfig } from '../../src/types';

const memoryCss = readFileSync(resolve(process.cwd(), 'src/styles/viewer/memory.css'), 'utf8');
const memoryCssRoot = postcss.parse(memoryCss, { from: 'src/styles/viewer/memory.css' });

function topLevelRuleWithProperty(selector: string, property: string): Rule {
  const match = memoryCssRoot.nodes.find((node): node is Rule => {
    if (node.type !== 'rule') return false;
    if (!node.selectors.includes(selector)) return false;
    return node.nodes.some((child) => child.type === 'decl' && child.prop === property);
  });
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match;
}

function ruleValue(rule: Rule, property: string): string {
  const decl = rule.nodes.find(
    (node) => node.type === 'decl' && node.prop === property,
  );
  if (!decl || decl.type !== 'decl') throw new Error(`Missing CSS property ${property}`);
  return decl.value.trim();
}

const editable: DesignSystemSummary = {
  id: 'user:acme',
  title: 'Acme Design System',
  category: 'Custom',
  summary: 'Internal product system.',
  surface: 'web',
  source: 'user',
  status: 'draft',
  isEditable: true,
  updatedAt: '2026-05-13T03:19:00.000Z',
};

const builtIn: DesignSystemSummary = {
  id: 'linear',
  title: 'Linear',
  category: 'Productivity & SaaS',
  summary: 'Quiet issue-tracker system.',
  surface: 'web',
  source: 'built-in',
  status: 'published',
  isEditable: false,
};

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystems: vi.fn(async () => [editable, builtIn]),
    updateDesignSystemDraft: vi.fn(async () => ({ ...editable, title: 'Acme v2', body: '' })),
    // Default to a successful response so unrelated tests don't hit the real fetch.
    // Individual tests override with `mockResolvedValueOnce` to assert error paths.
    importLocalDesignSystem: vi.fn(
      async () => ({ designSystem: editable }) as Awaited<ReturnType<typeof actual.importLocalDesignSystem>>,
    ),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cfg = { disabledDesignSystems: [] } as unknown as AppConfig;

describe('DesignSystemsSection rename (issue #2811)', () => {
  it('renames an editable design system through the internal component', async () => {
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    const renameButton = await screen.findByRole('button', {
      name: /Rename Acme Design System/i,
    });
    fireEvent.click(renameButton);

    const input = screen.getByDisplayValue('Acme Design System');
    fireEvent.change(input, { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(vi.mocked(updateDesignSystemDraft)).toHaveBeenCalledWith('user:acme', {
        title: 'Acme v2',
      }, null);
    });
  });

  it('notifies the parent after renaming a design system without changing its id', async () => {
    const onDesignSystemsChanged = vi.fn();
    render(
      <DesignSystemsSection
        cfg={cfg}
        setCfg={() => {}}
        onDesignSystemsChanged={onDesignSystemsChanged}
      />,
    );

    const renameButton = await screen.findByRole('button', {
      name: /Rename Acme Design System/i,
    });
    fireEvent.click(renameButton);

    const input = screen.getByDisplayValue('Acme Design System');
    fireEvent.change(input, { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(onDesignSystemsChanged).toHaveBeenCalledWith('user:acme');
    });
  });

  it('keeps the rename modal open with the typed title when the update fails', async () => {
    vi.mocked(updateDesignSystemDraft).mockResolvedValueOnce(null);
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    const renameButton = await screen.findByRole('button', {
      name: /Rename Acme Design System/i,
    });
    fireEvent.click(renameButton);

    const input = screen.getByDisplayValue('Acme Design System');
    fireEvent.change(input, { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    // A failed update must not close the modal; the typed title stays for retry.
    await screen.findByText(/Rename failed/i);
    expect(screen.getByDisplayValue('Acme v2')).toBeTruthy();
  });

  it('ignores a stale rename completion when a newer rename session is open', async () => {
    const editableB: DesignSystemSummary = { ...editable, id: 'user:beta', title: 'Beta System' };
    vi.mocked(fetchDesignSystems).mockResolvedValueOnce([editable, editableB, builtIn]);
    let resolveFirst!: (value: null) => void;
    vi.mocked(updateDesignSystemDraft).mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    // Session 1: rename Acme and submit; the PATCH stays pending.
    fireEvent.click(await screen.findByRole('button', { name: /Rename Acme Design System/i }));
    fireEvent.change(screen.getByDisplayValue('Acme Design System'), { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    // Cancel Acme and open a rename for Beta before the first PATCH resolves.
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Rename Beta System/i }));
    expect(screen.getByDisplayValue('Beta System')).toBeTruthy();

    // The stale Acme request now fails; it must not touch Beta's modal.
    resolveFirst(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByDisplayValue('Beta System')).toBeTruthy();
    expect(screen.queryByText(/Rename failed/i)).toBeNull();
  });

  it('offers no Rename for built-in (read-only) design systems', async () => {
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);
    await screen.findByText('Linear');
    expect(screen.queryByRole('button', { name: /Rename Linear/i })).toBeNull();
  });

  it('keeps segmented control columns in sync with rendered buttons', async () => {
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    await screen.findByText('Linear');

    for (const selector of [
      '.library-install-form .library-import-source-control',
      '.library-install-form .library-import-mode-control',
    ]) {
      const control = document.querySelector(selector);
      expect(control).toBeTruthy();

      const buttonCount = control!.querySelectorAll('button').length;
      expect(buttonCount).toBeGreaterThan(0);

      const gridTemplateColumns = ruleValue(
        topLevelRuleWithProperty(selector, 'grid-template-columns'),
        'grid-template-columns',
      );
      const repeatMatch = /^repeat\((\d+),\s*auto\)$/.exec(gridTemplateColumns);

      expect(repeatMatch).toBeTruthy();
      expect(Number(repeatMatch![1])).toBe(buttonCount);
    }
  });
});

// Issue #2686: when the daemon rejects a design-system import, the Settings
// form must not surface its raw English message in a non-English UI. Today
// the import-error slot renders `result.error.message` directly, so a Chinese
// (or any other non-English) locale sees an English error inline. The red
// spec anchors the contract: after a failed import, the daemon's English
// text must not be visible in the rendered form. The fix will route the
// error envelope through a localized formatter (`formatDesignSystemImportError`)
// that maps `code` to an i18n key and keeps the raw detail under a details
// disclosure.
describe('DesignSystemsSection import error localization (issue #2686)', () => {
  it('does not surface the daemon raw English message in the import form under zh-CN', async () => {
    vi.mocked(importLocalDesignSystem).mockResolvedValueOnce({
      error: {
        code: 'BAD_REQUEST',
        message: 'local project path must be a directory',
      },
    });

    render(
      <I18nProvider initial="zh-CN">
        <DesignSystemsSection cfg={cfg} setCfg={() => {}} />
      </I18nProvider>,
    );

    // Open the import form (collapsible +Add design system panel).
    const addButton = await screen.findByRole('button', {
      name: /add design system|添加设计系统/i,
    });
    fireEvent.click(addButton);

    // Fill in the local-import path field.
    const pathInput = await screen.findByPlaceholderText(/\/path\/to\/project/);
    fireEvent.change(pathInput, { target: { value: '/tmp/non-existent' } });

    // Submit. The button text is localized ("从项目导入" in zh-CN) — match on a unique substring.
    const submit = screen.getByRole('button', {
      name: /从项目导入/i,
    });
    fireEvent.click(submit);

    // Sanity: the import client was actually invoked with our typed path.
    await waitFor(() => {
      expect(importLocalDesignSystem).toHaveBeenCalledWith(
        expect.objectContaining({ baseDir: '/tmp/non-existent' }),
      );
    });

    // The localized Chinese summary replaces the raw English as the
    // user-facing message. The raw detail stays under <details>.
    await waitFor(() => {
      expect(screen.getByText(/无法导入设计系统/)).toBeInTheDocument();
    });

    // Raw daemon detail is still accessible for diagnostics.
    const detail = document.querySelector('.library-install-error-detail code');
    expect(detail).toBeTruthy();
    expect(detail!.textContent).toBe('local project path must be a directory');

    // Review point from #6075: <details> is not valid inside a <p>, so the
    // block must wrap a sibling paragraph rather than nest the disclosure.
    expect(detail!.closest('p')).toBeNull();
    const block = document.querySelector('.library-install-error');
    expect(block?.tagName).toBe('DIV');
  });
});
