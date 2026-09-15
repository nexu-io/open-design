// PR #8138 review follow-up (#3849): CaretFloatingLayer re-anchors the
// mention picker through a ResizeObserver, which can only deliver when the
// observed box actually changes size. `.mention-popover` must therefore keep
// its height content-derived — capped by max-height so tall lists still
// scroll internally, but never pinned by a fixed `height`. A pinned box
// survives a tab switch unchanged, the observer never delivers, and the
// picker stays at its stale top coordinate (the exact gap nettee flagged on
// the real @-picker path).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'src/styles/workspace/mention-home.css'),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

describe('.mention-popover sizing contract (CaretFloatingLayer observer delivery)', () => {
  const block = cssBlock('.mention-popover');

  it('keeps the max-height cap so tall lists still scroll internally', () => {
    expect(block).toMatch(/max-height:\s*var\(--cfl-max-h/);
  });

  it('does not pin a fixed height — a pinned box cannot resize, so the observer never fires on a tab switch', () => {
    // `(?:^|;)\s*` anchors on rule boundaries so `max-height:` does not
    // satisfy this matcher; only a bare `height:` declaration may not appear.
    expect(block).not.toMatch(/(?:^|;)\s*height\s*:/);
  });
});
