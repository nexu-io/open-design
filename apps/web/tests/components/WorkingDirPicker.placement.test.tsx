// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkingDirPicker } from '../../src/components/WorkingDirPicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps recent folders inside the viewport when the parent is near the bottom', () => {
  vi.stubGlobal('innerHeight', 600);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 500, bottom: 532, height: 32,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240);
  const select = vi.fn();
  render(<WorkingDirPicker workingDir={null} recentDirs={['/tmp/first', '/tmp/last']}
    onPickDirectory={() => {}} onSelectRecent={select} />);
  fireEvent.click(screen.getByTestId('working-dir-trigger'));
  fireEvent.mouseEnter(screen.getByTestId('working-dir-recent'));
  const menu = screen.getByTestId('working-dir-recent-list');
  expect(500 + parseFloat(menu.style.top) + 240).toBeLessThanOrEqual(588);

  vi.stubGlobal('innerHeight', 400);
  fireEvent(window, new Event('resize'));
  expect(500 + parseFloat(menu.style.top) + 240).toBeLessThanOrEqual(388);
  fireEvent.click(screen.getByTitle('/tmp/last'));
  expect(select).toHaveBeenCalledWith('/tmp/last');
  expect(screen.queryByTestId('working-dir-panel')).toBeNull();
});

it('keeps upward menus below the top edge in short windows', () => {
  vi.stubGlobal('innerHeight', 400);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100, bottom: 132, height: 32,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240);
  render(<WorkingDirPicker placement="up" workingDir={null} recentDirs={[]}
    onPickDirectory={() => {}} onSelectRecent={() => {}} />);
  fireEvent.click(screen.getByTestId('working-dir-trigger'));
  fireEvent.mouseEnter(screen.getByTestId('working-dir-recent'));
  const menu = screen.getByTestId('working-dir-recent-list');
  expect(100 + parseFloat(menu.style.top)).toBeGreaterThanOrEqual(12);
});
