import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for the composer's "打开执行设置" sticky footer
// (`AvatarMenu.tsx`'s `.avatar-item--pinned`, 飞书 #69/P1).
//
// `position: sticky` on the footer was never the problem — it already keeps
// the footer's reserved box pinned to the popover's scroll port. The actual
// bug was a cascade collision: `.avatar-item--pinned` declared
// `background: var(--bg-elevated)` (opaque, so scrolled-under rows don't
// bleed through), but the bare `.avatar-item` reset — declared further down
// this same file for every popover row — also sets `background` and has
// EQUAL specificity (one class each). Whichever rule is LAST in source order
// wins a specificity tie, so `.avatar-item` silently clobbered the footer's
// opaque background back to transparent, and the last model row visually
// bled through/collided with the "打开执行设置" label.
//
// The fix qualifies the footer selector as `.avatar-item.avatar-item--pinned`
// (two classes), mirroring `.avatar-item.avatar-amr-row` a few lines below it
// in the same file. This wins by specificity, not by source order, so the
// footer's background survives a future reshuffle of the stylesheet.

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');

function cssDeclarations(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
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

// Specificity of a simple selector chain made only of class selectors (the
// only kind used by `.avatar-item` and its qualified variants): the count of
// class tokens. Good enough to order the two rules under test, not a general
// CSS specificity engine.
function classSpecificity(selector: string): number {
  return (selector.match(/\.[a-zA-Z0-9_-]+/g) ?? []).length;
}

describe('AvatarMenu pinned footer styles', () => {
  it('qualifies the pinned footer with .avatar-item so it outranks the base reset', () => {
    // A bare `.avatar-item--pinned` selector would tie the base `.avatar-item`
    // reset on specificity and lose on source order alone (the reset is
    // declared later in this file). Asserting the exact compound selector
    // means a future edit cannot silently drop the qualifier and slide back
    // into the order-dependent bug.
    expect(shellCss).toContain('.avatar-item.avatar-item--pinned {');
    expect(shellCss).not.toMatch(/[^.\w-]\.avatar-item--pinned\s*\{/);
  });

  it('outranks the base .avatar-item reset on specificity, not source order', () => {
    const pinnedSelector = '.avatar-item.avatar-item--pinned';
    const baseSelector = '.avatar-item';
    expect(classSpecificity(pinnedSelector)).toBeGreaterThan(classSpecificity(baseSelector));

    const baseBlock = cssDeclarations(shellCss, baseSelector);
    expect(ruleValue(baseBlock, 'background')).toBe('transparent');
  });

  it('keeps the footer opaque so scrolled-under model rows cannot bleed through', () => {
    const pinnedBlock = cssDeclarations(shellCss, '.avatar-item.avatar-item--pinned');
    expect(ruleValue(pinnedBlock, 'background')).toBe('var(--bg-elevated)');
    expect(ruleValue(pinnedBlock, 'position')).toBe('sticky');
  });
});
