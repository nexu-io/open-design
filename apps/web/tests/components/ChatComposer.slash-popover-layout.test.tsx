// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';
import { typeInComposer } from '../helpers/lexical-composer';

// OPEND-2236 — typing `/` in the composer opened a visually garbled palette.
//
// `.slash-popover` is a height-capped flex column (`max-height:
// var(--cfl-max-h)` + `overflow: hidden`) and every command row was a DIRECT
// flex child of it. A workspace with many enabled MCP servers produces one
// row per server, so the list overflows the cap — and flexbox resolves that
// overflow by SHRINKING each row (default `flex-shrink: 1`) down to the
// `min-height: 34px` floor that was only ever meant as a one-line minimum.
// A row's content is two lines (label row + description ≈ 50px), so the
// description spills out of its own row box onto the neighbouring rows and
// the selected row's outline slices through the row above it. On top of that
// the shell clips (`overflow: hidden`) with no scroll port, so the rows past
// the cap are unreachable.
//
// The invariant these tests pin: command rows must live in a real scroll port
// so they keep their natural height and the overflow scrolls.
//
// Parsing the whole 1.6MB expanded `index.css` into jsdom costs several
// seconds per run, so the computed-style cases below inject only the
// stylesheet that owns these selectors. The first case guards that shortcut:
// it re-reads the full cascade and fails if any OTHER stylesheet has started
// declaring `.slash-*` rules that could beat these on source order.
const libraryCss = readFileSync(
  resolve(process.cwd(), 'src/styles/viewer/library.css'),
  'utf8',
);

// The row height case needs the clamp it overrides to actually be in the
// cascade. `button { height: 36px }` is what pins a row at 36px in production
// while its two lines need 54px; injecting only `library.css` would let the
// height compute to `auto` whether or not the override exists, which makes the
// assertion prove nothing.
const primitivesCss = readFileSync(
  resolve(process.cwd(), 'src/styles/primitives.css'),
  'utf8',
);

// Selectors of every rule that targets the slash palette shell or its rows,
// in source order. Comment-stripped so a commented-out rule does not count.
function slashPaletteRuleSelectors(css: string): string[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((match) => match[1]!.trim().replace(/\s+/g, ' '))
    .filter((selector) => /\.slash-(popover|item)/.test(selector));
}

// The floating popover commits state from a layout effect, which React's bare
// `act` (used by the Lexical helper) only accepts inside a declared act
// environment. Same opt-in as FileWorkspace.test.tsx.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Enough enabled MCP servers that the palette (one row each, plus the `/mcp`
// root entry) overflows any plausible `--cfl-max-h`. Mirrors the reporter's
// screenshot, which showed `evidence-server-14` … `evidence-server-24`.
const MCP_SERVER_COUNT = 24;

const mcpServers = Array.from({ length: MCP_SERVER_COUNT }, (_, index) => ({
  id: `evidence-server-${index + 1}`,
  label: `Evidence Transport ${index + 1}`,
  transport: 'stdio' as const,
  enabled: true,
  command: 'evidence-mcp',
}));

let styleEl: HTMLStyleElement | null = null;

function injectComposerStyles(): void {
  styleEl = document.createElement('style');
  styleEl.textContent = `${primitivesCss}\n${libraryCss}`;
  document.head.appendChild(styleEl);
}

async function flushTick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Open the `/` palette on a real ChatComposer and hand back the rendered
// option rows. The rows come from the component itself (not a hand-built
// fixture), so a markup change cannot quietly invalidate the assertions.
async function openSlashPalette(): Promise<HTMLElement[]> {
  render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={[]}
    />,
  );

  // Let the editor mount before driving it.
  await flushTick();

  typeInComposer('/');

  // Typing engages the composer, which lazily fetches `/api/mcp/servers`;
  // the palette only grows its per-server rows once that resolves. Flush
  // inside `act` (rather than polling with `waitFor`) so the resulting React
  // state updates stay inside a React act scope.
  await flushTick();
  await flushTick();

  expect(screen.getByTestId('slash-popover')).toBeInTheDocument();
  const rows = screen.getAllByRole('option') as HTMLElement[];
  // One row per enabled MCP server plus the `/mcp` "open settings" entry —
  // guards the fixture itself, so a squashing assertion below can never pass
  // vacuously on a short list that never overflows.
  expect(rows).toHaveLength(MCP_SERVER_COUNT + 1);

  injectComposerStyles();
  return rows;
}

// True when `row`'s containing block is a flex column that is allowed to
// squeeze the row below its content height — the exact condition that made
// the descriptions overflow their row boxes.
function isSquashableFlexChild(row: HTMLElement): boolean {
  const parent = row.parentElement;
  if (!parent) throw new Error('slash option row has no parent');
  const parentStyle = getComputedStyle(parent);
  const parentIsFlexColumn =
    (parentStyle.display === 'flex' || parentStyle.display === 'inline-flex')
    && parentStyle.flexDirection === 'column';
  return parentIsFlexColumn && getComputedStyle(row).flexShrink !== '0';
}

// Mounting the composer and parsing the whole app cascade into jsdom is the
// expensive part, so do it once and let the three cases assert against the
// same open palette. Nothing here mutates the DOM, so the cases stay
// independent.
let rows: HTMLElement[] = [];

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: mcpServers, templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  rows = await openSlashPalette();
});

afterAll(() => {
  styleEl?.remove();
  styleEl = null;
  vi.unstubAllGlobals();
  cleanup();
});

describe('slash command palette layout (OPEND-2236)', () => {
  it('keeps the slash palette selectors owned by a single stylesheet', () => {
    // If this fails, some other stylesheet now also styles the palette and
    // the computed-style cases below must inject the full cascade instead.
    expect(slashPaletteRuleSelectors(readExpandedIndexCss())).toEqual(
      slashPaletteRuleSelectors(libraryCss),
    );
  });

  it('keeps every command row at its natural height when the palette overflows', () => {
    // A row that flexbox may shrink is a row whose second line escapes its
    // own box — that is the reported "排版错乱".
    expect(rows.map(isSquashableFlexChild)).toEqual(rows.map(() => false));
  });

  it('lets a row outgrow the global button height clamp', () => {
    // Guards the second half of the fix. The scroll port made the overflow
    // reachable; this is what stops each row's description from painting
    // outside its own box onto the row below.
    expect(rows.map((row) => getComputedStyle(row).height)).toEqual(
      rows.map(() => 'auto'),
    );
  });

  it('puts the command rows in a scroll port so the overflow is reachable', () => {
    const list = rows[0]!.parentElement!;
    const listStyle = getComputedStyle(list);

    expect(listStyle.overflowY).toBe('auto');
    // Without an explicit `min-height: 0` a flex child refuses to shrink
    // below its content, so the scroll port would never actually scroll.
    expect(listStyle.minHeight).toMatch(/^0(px)?$/);
  });

  it('keeps the palette header at full height while the list scrolls', () => {
    const head = document.querySelector('.slash-popover-head');
    expect(head).not.toBeNull();

    expect(getComputedStyle(head as HTMLElement).flexShrink).toBe('0');
  });

});
