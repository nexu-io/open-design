// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '../src/button';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renders a type=button by default so it never submits an enclosing form', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('accepts the chat secondary variant and sm size without leaking legacy global classes', () => {
    render(
      <Button variant="secondary" size="sm">
        Retry
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Retry' });
    // Legacy compat classes (`primary`, `ghost`, `icon-btn`, …) are frozen; new
    // variants/sizes must not add to that surface.
    for (const legacy of ['primary', 'primary-ghost', 'ghost', 'subtle', 'icon-btn']) {
      expect(button.classList.contains(legacy)).toBe(false);
    }
  });

  it('keeps the caller className and disabled state', () => {
    render(
      <Button className="extra" disabled>
        Send
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(button.classList.contains('extra')).toBe(true);
    expect(button.disabled).toBe(true);
  });
});
