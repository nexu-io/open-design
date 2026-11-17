// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import type { AppConfig } from '../../src/types';

const config: AppConfig = {
  mode: 'daemon', apiKey: '', apiProtocol: 'anthropic', apiVersion: '',
  baseUrl: 'https://api.anthropic.com', model: '', agentId: 'codex',
  skillId: null, designSystemId: null, onboardingCompleted: true,
  mediaProviders: {}, agentModels: { codex: { model: 'model-a' } }, agentCliEnv: {},
};

let anchorTop = 420;
let scrollTop = 44;
let scrollBottom = 720;
let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();

function rect(top: number, bottom: number): DOMRect {
  return { x: 700, y: top, top, bottom, left: 700, right: 900,
    width: 200, height: bottom - top, toJSON: () => ({}) };
}

function openMenu(): HTMLElement {
  render(<div className="entry-main--scroll">
    <InlineModelSwitcher config={config} compact daemonLive
      agents={[{ id: 'codex', name: 'Codex', bin: 'codex', available: true,
        version: 'test', models: [{ id: 'model-a', label: 'Model A' }] }]}
      onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
      onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onOpenSettings={vi.fn()} />
  </div>);
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  return screen.getByTestId('inline-model-switcher-popover');
}

function advanceFrame(): void {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

beforeEach(() => {
  anchorTop = 420;
  scrollTop = 44;
  scrollBottom = 720;
  nextFrame = 0;
  frames = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('entry-main--scroll')
      ? rect(scrollTop, scrollBottom) : rect(anchorTop, anchorTop + 36);
  });
  vi.stubGlobal('innerHeight', 720);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LINK-C21-VIEW-016-001 menu placement', () => {
  it('remeasures a moved anchor even when its size, viewport and scroll are unchanged', () => {
    const menu = openMenu();
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(420 - 44 - 16);
    anchorTop = 260;
    advanceFrame();
    // The arriving examples move the composer upward. Below now has more
    // room, so the old upward placement must not survive unchanged.
    expect(Number.parseFloat(menu.style.maxHeight)).toBe(720 - 296 - 16);
  });

  it('never imposes a minimum height larger than the scrollport can hold', () => {
    scrollTop = 300;
    scrollBottom = 500;
    const menu = openMenu();
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(104);
  });

  it('restores keyboard focus to the trigger and stops following a closed menu', () => {
    openMenu();
    const row = screen.getByRole('radio');
    row.focus();
    fireEvent.keyDown(row, { key: 'Escape' });
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('inline-model-switcher-chip'));
    expect(frames.size).toBe(0);
  });
});
