// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonPanel } from '../../../src/features/file-viewer/components/JsonPanel';

afterEach(cleanup);

describe('JsonPanel', () => {
  it('renders the empty label when value is null', () => {
    render(<JsonPanel value={null} emptyLabel="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders the empty label when value is undefined', () => {
    render(<JsonPanel value={undefined} emptyLabel="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('pretty-prints a non-null value as JSON', () => {
    const { container } = render(<JsonPanel value={{ a: 1, b: [2, 3] }} emptyLabel="empty" />);
    expect(container.querySelector('pre.viewer-source')?.textContent).toBe(
      JSON.stringify({ a: 1, b: [2, 3] }, null, 2),
    );
  });
});
