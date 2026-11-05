// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareMoreMenu } from '../../../src/components/share/ShareMoreMenu';

/*
 * jsdom in this suite never loads real stylesheets (no `css: true` in
 * vitest.config.ts, and CSS Modules resolve to class-name maps only), so a
 * computed-style assertion here would read browser defaults, not the rule
 * that actually ships. The regression this guards (S12: the deploy sub-menu
 * portals to `document.body` at a LOWER z-index than the share popover it
 * opens from, so it renders underneath instead of on top) is a token-
 * ordering fact in the source CSS, so assert that directly.
 */
const shareMoreMenuCss = readFileSync(
  join(process.cwd(), 'src/components/share/ShareMoreMenu.module.css'),
  'utf8',
);

const originalClientWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
afterEach(() => {
  cleanup();
  if (originalClientWidth) Object.defineProperty(document.documentElement, 'clientWidth', originalClientWidth);
  else Reflect.deleteProperty(document.documentElement, 'clientWidth');
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  else Reflect.deleteProperty(window, 'innerHeight');
  vi.restoreAllMocks();
});

describe('Owner S12 deployment menu layering', () => {
  it('stacks above the --z-menu share popover it opens from, not at a fixed literal', () => {
    // The share popover (AnchoredMenuShell) portals to document.body at
    // z-index: var(--z-menu). ShareMoreMenu portals independently to the
    // same document.body as a sibling, so it must clear that token — a
    // hardcoded literal (e.g. 1000) regresses to sitting underneath it.
    expect(shareMoreMenuCss).toMatch(/z-index:\s*calc\(var\(--z-menu\)\s*\+\s*1\)/);
    expect(shareMoreMenuCss).not.toMatch(/z-index:\s*\d/);
  });
});

describe('Owner S12 deployment menu', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({
    x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}),
  });
  function renderInHeader(onSelect = vi.fn()) {
    render(<div data-testid="tools"><ShareMoreMenu label="More sharing options" items={[
      { id: 'vercel', label: 'Deploy to Vercel', onSelect },
      { id: 'cloudflare', label: 'Deploy to Cloudflare Pages', onSelect: () => undefined },
    ]} /><button type="button">Close</button></div>);
    return { trigger: screen.getByRole('button', { name: 'More sharing options' }), tools: screen.getByTestId('tools') };
  }

  it('drops down under the trigger, right-aligned to the header tools, over the panel content', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const selectVercel = vi.fn();
    const { trigger, tools } = renderInHeader(selectVercel);
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(1236, 100, 20, 20));
    vi.spyOn(tools, 'getBoundingClientRect').mockReturnValue(rect(1236, 100, 44, 20));
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.top).toBe('126px');
    // Right edge (left + 214) lands on the tools' right edge (1280).
    expect(menu.style.left).toBe('1066px');
    expect(menu.style.width).toBe('214px');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Deploy to Vercel' }));
    expect(selectVercel).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });

  it('stays inside a narrow viewport and flips above when there is no room below', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 130 });
    const { trigger, tools } = renderInHeader();
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(140, 100, 20, 20));
    vi.spyOn(tools, 'getBoundingClientRect').mockReturnValue(rect(140, 100, 44, 20));
    const menuRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    menuRect.mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'menu' ? rect(0, 0, 184, 64) : rect(0, 0, 0, 0);
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('8px');
    expect(menu.style.width).toBe('184px');
    expect(menu.style.top).toBe('30px');
  });

  it('dismisses with Escape and outside pointer, restoring focus on Escape', () => {
    render(<><ShareMoreMenu label="More sharing options" items={[
      { id: 'vercel', label: 'Deploy to Vercel', onSelect: () => undefined },
      { id: 'cloudflare', label: 'Deploy to Cloudflare Pages', onSelect: () => undefined },
    ]} /><button type="button">Outside</button></>);
    const trigger = screen.getByRole('button', { name: 'More sharing options' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: 'Deploy to Vercel' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menuitem', { name: 'Deploy to Vercel' })).toBeNull();
  });
});
