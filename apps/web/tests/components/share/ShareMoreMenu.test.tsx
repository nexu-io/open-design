// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareMoreMenu } from '../../../src/components/share/ShareMoreMenu';

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

describe('Owner S12 deployment menu', () => {
  it('keeps deployment items in the viewport beside an edge trigger without removing the link-access explanation', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    const selectVercel = vi.fn();
    render(<><ShareMoreMenu label="More sharing options" items={[
      { id: 'vercel', label: 'Deploy to Vercel', onSelect: selectVercel },
      { id: 'cloudflare', label: 'Deploy to Cloudflare Pages', onSelect: () => undefined },
    ]} /><p>Link access details</p></>);
    const trigger = screen.getByRole('button', { name: 'More sharing options' });
    const triggerRect = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 10, y: 40, left: 10, top: 40, right: 30, bottom: 60, width: 20, height: 20,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Deploy to Vercel' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Deploy to Cloudflare Pages' })).toBeVisible();
    expect(menu.style.position).toBe('fixed');
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(312);
    expect(menu.style.left).toBe('34px');
    expect(screen.getByText('Link access details')).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Deploy to Vercel' }));
    expect(selectVercel).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    triggerRect.mockReturnValue({
      x: 290, y: 40, left: 290, top: 40, right: 310, bottom: 60, width: 20, height: 20,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu').style.left).toBe('72px');
  });

  it('opens beside the panel instead of covering link-access copy when both sides fit', () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 960 });
    render(<><ShareMoreMenu label="More sharing options" items={[
      { id: 'vercel', label: 'Deploy to Vercel', onSelect: () => undefined },
      { id: 'cloudflare', label: 'Deploy to Cloudflare Pages', onSelect: () => undefined },
    ]} /><p>Link access details</p></>);
    const trigger = screen.getByRole('button', { name: 'More sharing options' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 500, y: 40, left: 500, top: 40, right: 520, bottom: 60, width: 20, height: 20,
      toJSON: () => ({}),
    });
    const explanation = screen.getByText('Link access details');
    vi.spyOn(explanation, 'getBoundingClientRect').mockReturnValue({
      x: 280, y: 65, left: 280, top: 65, right: 490, bottom: 90, width: 210, height: 25,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    const menuLeft = Number.parseFloat(menu.style.left);
    expect(menuLeft).toBeGreaterThanOrEqual(explanation.getBoundingClientRect().right + 4);
    expect(menuLeft).toBe(524);
    expect(menuLeft + Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(952);
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
