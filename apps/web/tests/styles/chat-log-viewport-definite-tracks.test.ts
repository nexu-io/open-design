import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `client_chat_scroll_frozen` — the chat log stops responding to real wheel
 * input while layout stays correct, because the compositor holds a
 * maximum-scroll bound frozen at an early content height.
 *
 * The shipped candidate fix is to size `.chat-log-viewport`'s grid cell from a
 * DEFINITE track (`100% / 100%`) instead of an indefinite one
 * (`minmax(0, 1fr)`), so the scroll box's cell needs no free-space
 * distribution pass and is never revised after the scroll node is built.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE
 *
 * It cannot prove the fix works. jsdom performs no layout: there are no used
 * track sizes, no scroll bounds and no compositor here, and a test that
 * pretended otherwise would be a fake green. The falsification path for the
 * hypothesis itself is the telemetry event, not this suite.
 *
 * What it does hold is the CSS text contract, which is exactly what a careless
 * later edit would break silently:
 *
 *   1. the track stays definite (nobody reverts to `1fr` / `minmax()`);
 *   2. the acceptance of commit 0e8bbdaa69 ("fix(chat): own rtl scrollbar
 *      gutter", asserted by e2e/ui/split-resize-scrollbar-hitbox.test.ts) is
 *      preserved — the log still fills the cell to both logical edges and the
 *      viewport is still the containing block for the absolute overlays;
 *   3. the precondition a percentage track depends on — a definite containing
 *      block — is still handed down the `.pane` / `.chat-log-wrap` chain. If
 *      that chain loses its definite height, `100%` degrades to `auto`
 *      (content-sized) where `1fr` would still fill, which would be a silent
 *      layout regression rather than a loud one.
 */

const composioCss = readFileSync(
  new URL('../../src/styles/viewer/composio.css', import.meta.url),
  'utf8',
);
const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Declaration bodies of every rule whose selector list contains `selector` exactly. */
function cssDeclarations(css: string, selector: string): string[] {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const source = stripComments(css);
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(source)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }

  return blocks;
}

/** Every stylesheet `index.css` pulls in, in its real cascade order. */
function importedStylesheets(): { specifier: string; css: string }[] {
  const specifiers = [...indexCss.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1] as string);
  expect(specifiers.length).toBeGreaterThan(30);
  return specifiers.map((specifier) => ({
    specifier,
    css: readFileSync(new URL(specifier, new URL('../../src/index.css', import.meta.url)), 'utf8'),
  }));
}

describe('client_chat_scroll_frozen — chat log viewport sizes its scroll box from a definite track', () => {
  it('sizes the grid cell with definite tracks, not free-space distribution', () => {
    const blocks = cssDeclarations(composioCss, '.chat-log-viewport');
    expect(blocks).toHaveLength(1);
    const viewport = blocks[0] as string;

    expect(viewport).toMatch(/\bdisplay:\s*grid;/);
    expect(viewport).toMatch(/\bgrid-template:\s*100%\s*\/\s*100%;/);

    // The whole point of the change: no indefinite track may come back in.
    // `1fr` is sized from leftover space in a later pass than the box that
    // owns it, which is the resolution step this rule exists to remove.
    expect(viewport).not.toMatch(/\bminmax\(/);
    expect(viewport).not.toMatch(/\d*\.?\d*fr\b/);
  });

  it('keeps commit 0e8bbdaa69 intact: the log owns both logical edges of the viewport', () => {
    const viewport = cssDeclarations(composioCss, '.chat-log-viewport')[0] as string;

    // `.chat-message-rail` and `.chat-bottom-float-slot` are absolutely
    // positioned against this box; dropping `position: relative` re-parents
    // them to the nearest ancestor and moves the overlays off the panel.
    expect(viewport).toMatch(/\bposition:\s*relative;/);
    expect(viewport).toMatch(/\bflex:\s*1;/);
    expect(viewport).toMatch(/\bmin-height:\s*0;/);
    expect(viewport).toMatch(/\bmin-width:\s*0;/);

    // The scrollbar gutter is flush with the resize handle only while the log
    // is stretched across the single cell. e2e/ui/split-resize-scrollbar-hitbox
    // hit-tests 1px and 3px inside that edge, in LTR and RTL.
    const log = cssDeclarations(composioCss, '.chat-log-viewport > .chat-log');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/\bgrid-area:\s*1\s*\/\s*1;/);
    expect(log[0]).toMatch(/\bmin-height:\s*0;/);
    expect(log[0]).toMatch(/\bmin-width:\s*0;/);
  });

  it('leaves composio.css the sole owner of the viewport, so no later sheet can re-introduce an indefinite track', () => {
    const owners = importedStylesheets()
      .filter(({ css }) => stripComments(css).includes('.chat-log-viewport'))
      .map(({ specifier }) => specifier);

    // A second sheet later in the cascade — routines.css already wins over
    // chat.css elsewhere on source order alone — could restore `1fr` without
    // touching this rule at all.
    expect(owners).toEqual(['./styles/viewer/composio.css']);
  });

  it('keeps the definite containing block a percentage track resolves against', () => {
    // `100%` needs a definite containing block. This is the chain that
    // supplies it: the split's chat track -> .pane -> .chat-log-wrap ->
    // .chat-log-viewport (`flex: 1`). Track ownership on `.split` itself is
    // covered by tests/styles/chatpane-grid-transition.test.ts.
    const pane = cssDeclarations(shellCss, '.pane').join('\n');
    expect(pane).toMatch(/\bdisplay:\s*flex;/);
    expect(pane).toMatch(/\bflex-direction:\s*column;/);
    expect(pane).toMatch(/\bmin-height:\s*0;/);

    const wrap = cssDeclarations(composioCss, '.chat-log-wrap').join('\n');
    expect(wrap).toMatch(/\bdisplay:\s*flex;/);
    expect(wrap).toMatch(/\bflex-direction:\s*column;/);
    expect(wrap).toMatch(/\bflex:\s*1;/);
    expect(wrap).toMatch(/\bmin-height:\s*0;/);
  });
});
