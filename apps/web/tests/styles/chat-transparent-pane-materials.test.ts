// Measurement spec for the chat containers that sit on the TRANSPARENT chat
// pane (OPEND-3177 / OPEND-3175 / OPEND-3173; OPEND-3178 is the design
// evidence — OPEND-2553 P3, correcting the K1 pins from #8185). After S6 made
// the pane paint nothing (OPEND-3090), the containers that used to borrow the
// pane's white showed up as flat slabs over the app wash. H1 answered with a
// frosted material, K1 with one opaque floating card for everything in the
// content layer. The direction settled by design (OPEND-3178 recording of
// 2026-09-16 and `acceptance-3178-0.png`; OPEND-3177 comment "去掉底部的白色底")
// splits the content layer in two:
//
//   floating cards — ONLY the composer shell and the queued-send cards keep
//     the opaque `--chat-floating-card-*` card (K1's treatment stands there);
//   bare content — the thoughts window, the Confirmed answer block, the nested
//     terminal block and the question form (shell / body / foot) paint NOTHING
//     of their own: no ground, no edge, no shadow, no blur. Their text reads
//     the chat ink tokens so it stays legible straight on the pane (the
//     thoughts body moves from the muted stream ink to `--chat-text`, the
//     #494949 named in the recording's comment);
//   popovers — project switcher menu, conversation history menu — keep the
//     action-menu recipe (`--bg` ground, `--border-soft` edge, `--shadow-md`).
//
// The user bubble in the recording is the dark ground with white ink the
// branch already ships (`#121212` light / `--text-strong` dark), so it is
// pinned rather than changed.
//
// Values here are token names, not colours: dark and reduced-transparency
// follow the token layer, so the components carry no per-appearance override.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const composioCss = read('../../src/styles/viewer/composio.css');
const routinesCss = read('../../src/styles/viewer/routines.css');
const chatCss = read('../../src/styles/chat.css');
const recordCss = read('../../src/components/chat/primitives/record.module.css');
const chatRootCss = read('../../src/components/chat/ChatRoot.module.css');
const queuedSendCss = read('../../src/components/chat/QueuedSendStack.module.css');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function declarations(css: string, selector: string): string {
  const cssWithoutComments = stripComments(css);
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

/** Whether any rule in `css` (including inside at-rules) targets `selector`. */
function declares(css: string, selector: string): boolean {
  try {
    declarations(css, selector);
    return true;
  } catch {
    return false;
  }
}

/** The last value declared for `property` in a block ('' when absent). */
function value(block: string, property: string): string {
  const pattern = new RegExp(`(?:^|;)\\s*${property.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+)`, 'g');
  const values = [...block.matchAll(pattern)].map((m) => m[1]!.trim());
  return values.at(-1) ?? '';
}

/** The last `background` / `background-color` value declared in a block. */
function background(block: string): string {
  const values = [...block.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/g)].map((m) => m[1]!.trim());
  return values.at(-1) ?? '';
}

/** H1's frosted / glass tokens: none of these containers may read them now. */
const FROSTED = /--(?:chat-)?material-|--glass-|--vibrancy-fill/;

/** An opaque card in the content layer: the floating-card tokens, no blur. */
function expectFloatingCard(block: string) {
  expect(background(block)).toBe('var(--chat-floating-card-bg)');
  expect(block).not.toMatch(/backdrop-filter\s*:\s*var\(/);
  expect(block).not.toMatch(FROSTED);
}

/** Any card family a bare container must not read. */
const CARDED = /--chat-floating-card-|--chat-confirm-surface|--(?:chat-)?bg-panel|--(?:chat-)?bg\b/;

/**
 * Bare content on the transparent pane: paints no ground of its own, draws
 * no edge and no shadow, blurs nothing behind it, and reads no card token.
 */
function expectBare(block: string) {
  expect(['transparent', 'none']).toContain(background(block));
  expect(['', '0', 'none']).toContain(value(block, 'border'));
  expect(value(block, 'border-color')).toBe('');
  expect(['', 'none']).toContain(value(block, 'box-shadow'));
  expect(block).not.toMatch(/backdrop-filter\s*:\s*var\(/);
  expect(block).not.toMatch(FROSTED);
  expect(block).not.toMatch(CARDED);
}

/** A popover in the action-menu recipe: plain ground, soft edge, md shadow. */
function expectActionMenu(block: string) {
  expect(background(block)).toBe('var(--bg)');
  expect(value(block, 'border')).toBe('1px solid var(--border-soft)');
  expect(value(block, 'box-shadow')).toBe('var(--shadow-md)');
  expect(block).not.toMatch(/backdrop-filter\s*:\s*var\(/);
  expect(block).not.toMatch(FROSTED);
}

describe('composer shell is one opaque floating card (styles/viewer/routines.css)', () => {
  const shell = declarations(routinesCss, '.chat-composer-fixed-layer .composer-shell');

  it('reads the floating-card ground and soft edge at the xl radius, with no shadow', () => {
    expectFloatingCard(shell);
    expect(value(shell, 'border-color')).toBe('var(--chat-border-soft)');
    expect(value(shell, 'border-radius')).toBe('var(--chat-radius-xl)');
    expect(value(shell, 'box-shadow')).toBe('none');
  });

  it('switches the backdrop blur off explicitly (chat.css used to give it glass)', () => {
    expect(value(shell, '-webkit-backdrop-filter')).toBe('none');
    expect(value(shell, 'backdrop-filter')).toBe('none');
    expect(declares(chatCss, '.chat-composer-fixed-layer .composer-shell')).toBe(false);
  });

  it('keeps the compact inset of the reference (5px padding, 8px gap)', () => {
    expect(value(shell, 'padding')).toBe('5px');
    expect(value(shell, 'gap')).toBe('8px');
  });

  it('carries no per-appearance override: dark follows the floating-card token', () => {
    expect(declares(routinesCss, '[data-theme="dark"] .chat-composer-fixed-layer .composer-shell')).toBe(false);
    expect(declares(routinesCss, 'html:not([data-theme]) .chat-composer-fixed-layer .composer-shell')).toBe(false);
  });

  it('has the xl radius alias on the chat seam in both appearances', () => {
    for (const scope of [declarations(chatRootCss, '.root'), declarations(chatRootCss, ":global([data-theme='dark']) .root")]) {
      expect(scope).toMatch(/--chat-radius-xl:\s*var\(--radius-xl\);/);
    }
  });
});

describe('question form keeps its white card on the transparent pane (styles/viewer/composio.css)', () => {
  // OPEND-3282 (2026-09-16): every region that asks the user to type or
  // choose keeps an opaque white card so it does not melt into the pane.
  // That reverses the OPEND-3177 reading P3 applied to the form shell; the
  // read-only Confirmed block, thoughts window and terminal block stay bare.
  it('gives the card shell the floating-card ground and edge, no blur', () => {
    expectFloatingCard(declarations(composioCss, '.question-form'));
  });

  it('keeps the confirm variant on the same card (no separate confirm surface)', () => {
    expect(background(declarations(composioCss, '.question-form:has(.question-form-foot):has(.qf-options)'))).toBe('var(--chat-floating-card-bg)');
  });

  it('keeps the head, body, foot and pill transparent inside the shell', () => {
    expect(background(declarations(composioCss, '.question-form-head'))).toBe('transparent');
    expect(background(declarations(composioCss, '.question-form-body'))).toBe('transparent');
    expect(background(declarations(composioCss, '.question-form-pill'))).toBe('transparent');
    expect(background(declarations(composioCss, '.question-form-foot'))).toBe('');
  });

  it('lets the Confirmed answer block sit bare (it is content, not an input region)', () => {
    expectBare(declarations(composioCss, '.answered'));
  });

  it('reads the floating-card family only for the form shell in composio.css', () => {
    const uses = composioCss.match(/--chat-floating-card-bg/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(1);
    expect(composioCss).not.toMatch(/--chat-floating-card-text/);
  });
});

describe('thoughts window and nested terminal block sit bare (chat/primitives/record.module.css)', () => {
  it('gives the thoughts window no ground of its own', () => {
    expectBare(declarations(recordCss, '.stream'));
    expectBare(declarations(recordCss, '.thoughts > .body.stack'));
  });

  it('gives the nested command + output block no ground and no edge', () => {
    expectBare(declarations(recordCss, '.fold .body.stack .code'));
  });

  it('reads the thoughts body in the chat body ink so it stays legible on the pane', () => {
    expect(value(declarations(recordCss, '.fold .thoughts > .body > *'), 'color')).toBe('var(--chat-text)');
    expect(value(declarations(recordCss, '.stream > .think'), 'color')).toBe('var(--chat-text)');
  });

  it('reads neither the floating-card family nor the H1 material seam', () => {
    expect(recordCss).not.toMatch(/--chat-floating-card-/);
    expect(chatRootCss).not.toMatch(/--chat-material-/);
    expect(recordCss).not.toMatch(FROSTED);
  });
});

describe('the floating card stays with the composer and the queue', () => {
  it('keeps the queued-send cards on the opaque floating card with the soft edge', () => {
    const banner = declarations(queuedSendCss, '.banner');
    expectFloatingCard(banner);
    expect(value(banner, 'border')).toBe('1px solid var(--chat-border-soft)');
    expect(value(banner, 'color')).toBe('var(--chat-floating-card-text)');
  });

  it('defines the floating-card token in both chat seam scopes', () => {
    for (const scope of [declarations(chatRootCss, '.root'), declarations(chatRootCss, ":global([data-theme='dark']) .root")]) {
      expect(scope).toMatch(/--chat-floating-card-bg:/);
      expect(scope).toMatch(/--chat-floating-card-text:/);
    }
  });
});

describe('user bubble matches the recording: dark ground, white ink (styles/chat.css)', () => {
  it('keeps the dark ground token on the light appearance and the theme ink in dark', () => {
    expect(value(declarations(chatCss, '.msg.user'), '--chat-user-bubble-ground')).toBe('#121212');
    expect(value(declarations(chatCss, '.msg.user'), '--bub-bg')).toBe('var(--chat-user-bubble-ground)');
    expect(value(declarations(chatCss, '[data-theme="dark"] .msg.user'), '--chat-user-bubble-ground')).toBe('var(--text-strong)');
  });

  it('paints the bubble from that ground with the page ink for the text', () => {
    const bubble = declarations(chatCss, '.msg.user .user-text');
    expect(background(bubble)).toBe('var(--bub-bg)');
    expect(value(bubble, 'color')).toBe('var(--bg)');
  });
});

describe('popovers over the pane use the action-menu recipe (routines.css + composio.css)', () => {
  it('draws the project switcher menu as a plain elevated menu, rows on the subtle fill', () => {
    expectActionMenu(declarations(routinesCss, '.workspace-tabs-dropdown__menu'));
    expect(background(declarations(routinesCss, '.workspace-tabs-dropdown__row:hover'))).toBe('var(--bg-subtle)');
  });

  it('draws the conversation history menu the same way, with its search field back on a solid mix', () => {
    expectActionMenu(declarations(composioCss, '.chat-history-menu'));
    const search = declarations(composioCss, '.chat-history-search');
    expect(background(search)).toBe('color-mix(in srgb, var(--bg) 88%, var(--bg-panel))');
    expect(value(search, 'border')).toBe('1px solid color-mix(in srgb, var(--border) 78%, transparent)');
    expect(background(declarations(composioCss, '.chat-history-search:hover'))).toBe('color-mix(in srgb, var(--bg) 94%, var(--bg-panel))');
    expect(search).not.toMatch(FROSTED);
  });
});
