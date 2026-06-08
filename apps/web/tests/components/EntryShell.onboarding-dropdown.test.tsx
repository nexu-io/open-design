// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingDropdown } from '../../src/components/EntryShell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OnboardingDropdown', () => {
  it('renders a custom listbox instead of a native select', () => {
    render(
      <OnboardingDropdown
        label="Model"
        placeholder="Select a model"
        value="claude-sonnet-4-5"
        options={[
          { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          { value: 'gpt-5', label: 'GPT-5' },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(document.querySelector('select')).toBeNull();

    const trigger = screen.getByRole('button', { name: /Claude Sonnet 4.5/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox', { name: 'Model' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('flips upward near the viewport bottom and caps menu height', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 420,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('onboarding-view__select-field')) {
        return {
          x: 0,
          y: 330,
          width: 320,
          height: 42,
          top: 330,
          right: 320,
          bottom: 372,
          left: 0,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    render(
      <OnboardingDropdown
        label="Model"
        placeholder="Select a model"
        value="model-1"
        options={Array.from({ length: 30 }, (_, index) => ({
          value: `model-${index + 1}`,
          label: `Very long Windows model option ${index + 1}`,
        }))}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Very long Windows model option 1/ }));

    const listbox = screen.getByRole('listbox', { name: 'Model' });
    expect(listbox.parentElement?.getAttribute('data-placement')).toBe('top');
    expect(listbox.style.getPropertyValue('--onboarding-select-menu-max-height')).toBe('240px');
  });
});
