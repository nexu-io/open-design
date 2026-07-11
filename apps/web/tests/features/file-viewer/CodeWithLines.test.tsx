// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CodeWithLines } from '../../../src/features/file-viewer/components/CodeWithLines';

afterEach(cleanup);

describe('CodeWithLines', () => {
  it('renders a gutter line number per source line', () => {
    const { container } = render(<CodeWithLines text={'a\nb\nc'} />);
    expect(container.querySelector('code.gutter')?.textContent).toBe('1\n2\n3');
    expect(container.querySelector('code.lines')?.textContent).toBe('a\nb\nc');
  });

  it('keeps the gutter aligned with a trailing-newline phantom empty line', () => {
    const { container } = render(<CodeWithLines text={'a\nb\n'} />);
    expect(container.querySelector('code.gutter')?.textContent).toBe('1\n2\n3');
  });
});
