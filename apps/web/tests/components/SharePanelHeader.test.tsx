// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SharePanelHeader } from '../../src/components/share/SharePanelHeader';

afterEach(cleanup);

it('renders the canvas close stroke without changing its accessible action', () => {
  const onClose = vi.fn();
  render(<SharePanelHeader title="Share" closeLabel="Close" onClose={onClose} />);
  expect(screen.getByRole('heading', { name: 'Share', level: 2 })).toBeVisible();
  const close = screen.getByRole('button', { name: /^Close$/ });
  const icon = close.querySelector('svg')!;
  for (const [name, value] of Object.entries({ width: '14', height: '14', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
    expect(icon).toHaveAttribute(name, value);
  }
  expect(icon.querySelector('path')).toHaveAttribute('d', 'M4 4l8 8M12 4l-8 8');
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledTimes(1);
});
