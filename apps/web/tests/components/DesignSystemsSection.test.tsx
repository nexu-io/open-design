// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import postcss, { type Rule } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsSection } from '../../src/components/DesignSystemsSection';
import { fetchDesignSystems, updateDesignSystemDraft } from '../../src/providers/registry';
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
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cfg = { disabledDesignSystems: [] } as unknown as AppConfig;

describe('DesignSystemsSection rename (issue #2811)', () => {
  it('renames an editable design system from Settings', async () => {
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
      });
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

// Issue #2688 (mrcfps 2026-07-24 review on head d9f8274e): the library
// group heading in `DesignSystemsSection` (`.library-group-title`) is a
// `display: flex` row that pairs the category label with a count badge.
// Before this PR the heading carried `text-overflow: ellipsis` directly,
// but Chromium does NOT ellipsize the anonymous flex item that wraps a raw
// text node — so a long localized category ("Social & Messaging") was
// hard-clipped with no `…` AND the count badge was pushed out of view. The
// fix moves the truncation onto a dedicated `<span class="library-group-name">`
// shrinkable flex child and keeps the count badge as a non-shrinking
// sibling. This group locks that contract.
describe('DesignSystemsSection library heading truncation (issue #2688)', () => {
  const libraryCss = readFileSync(
    resolve(process.cwd(), 'src/styles/viewer/library.css'),
    'utf8',
  );
  const libraryCssRoot = postcss.parse(libraryCss, { from: 'src/styles/viewer/library.css' });

  function findRule(selector: string): Rule {
    const match = libraryCssRoot.nodes.find(
      (node): node is Rule => node.type === 'rule' && node.selectors.includes(selector),
    );
    if (!match) throw new Error(`Missing CSS block for ${selector}`);
    return match;
  }

  function decl(rule: Rule, prop: string): string | null {
    const d = rule.nodes.find(
      (n): n is postcss.Declaration => n.type === 'decl' && n.prop === prop,
    );
    return d ? d.value.trim() : null;
  }

  it('does NOT carry text-overflow on the flex parent `.library-group-title`', () => {
    // The fix removed `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
    // from `.library-group-title` (the flex CONTAINER). Carrying these on a
    // `display: flex` element is a no-op for the anonymous text-node flex
    // item in Chromium and was the root cause of the bad clip.
    const rule = findRule('.library-group-title');
    expect(decl(rule, 'display')).toBe('flex');
    expect(decl(rule, 'text-overflow')).toBeNull();
    expect(decl(rule, 'overflow')).toBeNull();
    // `white-space` on the parent is harmless but unnecessary; assert it's
    // gone too so a future edit doesn't quietly re-introduce the noop.
    expect(decl(rule, 'white-space')).toBeNull();
  });

  it('carries the truncation contract on the shrinkable flex CHILD `.library-group-name`', () => {
    // The child must be the ellipsis owner: `flex: 1 1 auto` so it can
    // shrink, `min-width: 0` so flex layout doesn't blow out the parent,
    // and the standard `overflow: hidden; text-overflow: ellipsis;
    // white-space: nowrap` triple.
    const rule = findRule('.library-group-name');
    expect(decl(rule, 'flex')).toBe('1 1 auto');
    expect(decl(rule, 'min-width')).toBe('0');
    expect(decl(rule, 'overflow')).toBe('hidden');
    expect(decl(rule, 'text-overflow')).toBe('ellipsis');
    expect(decl(rule, 'white-space')).toBe('nowrap');
  });

  it('keeps the count badge as a non-shrinking flex sibling', () => {
    // The count badge must NOT compete for space with the truncating label —
    // `flex: 0 0 auto` means it cannot grow OR shrink, so the label takes
    // all leftover width and ellipsizes first.
    const rule = findRule('.library-group-count');
    expect(decl(rule, 'flex')).toBe('0 0 auto');
  });

  it('renders the heading as a flex parent with the wrapped name span and count as siblings', async () => {
    // The mock registry returns [editable (Custom), builtIn (Productivity & SaaS)].
    // `categoryFilter === 'All'` (default) renders a heading per category.
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    // Wait for the library rows to render so the heading is in the DOM.
    await screen.findByText('Linear');

    const customHeading = document.querySelector(
      '[data-testid="library-group-title-Custom"]',
    );
    expect(customHeading).toBeTruthy();
    expect(customHeading?.tagName).toBe('H4');
    expect(customHeading?.classList.contains('library-group-title')).toBe(true);

    // The name span is the shrinkable flex child carrying the ellipsis contract.
    const nameSpan = customHeading?.querySelector('.library-group-name');
    expect(nameSpan).toBeTruthy();
    expect(nameSpan?.textContent).toBe('Custom');

    // The count badge is a sibling span, rendered alongside the name.
    const countSpan = customHeading?.querySelector('.library-group-count');
    expect(countSpan).toBeTruthy();
    // Only `editable` has category "Custom", so count is 1.
    expect(countSpan?.textContent).toBe('1');

    // The raw `{category}` text node is gone — the heading has exactly two
    // child spans and no direct text node. (Before the fix, the heading had
    // an anonymous text node `{category}{' '}` followed by the count span,
    // which is what made the truncation noop in Chromium.)
    const directTextChildren = Array.from(customHeading?.childNodes ?? []).filter(
      (n) => n.nodeType === Node.TEXT_NODE,
    );
    expect(directTextChildren.length).toBe(0);
  });
});
