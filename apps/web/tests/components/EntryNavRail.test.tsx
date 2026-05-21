// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';

afterEach(() => {
  cleanup();
});

describe('EntryNavRail page-patterns button', () => {
  it('renders the button and fires onViewChange', () => {
    const onViewChange = vi.fn();
    render(
      <EntryNavRail view="home" onViewChange={onViewChange} onNewProject={() => undefined} />,
    );
    const btn = screen.getByTestId('entry-nav-page-patterns');
    fireEvent.click(btn);
    expect(onViewChange).toHaveBeenCalledWith('page-patterns');
  });

  it('marks the page-patterns button as active when the view is page-patterns', () => {
    render(
      <EntryNavRail
        view="page-patterns"
        onViewChange={() => undefined}
        onNewProject={() => undefined}
      />,
    );
    const btn = screen.getByTestId('entry-nav-page-patterns');
    expect(btn.getAttribute('aria-current')).toBe('page');
  });
});
