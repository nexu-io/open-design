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
    const field = listbox.closest('.onboarding-view__select-field');
    const menu = listbox.closest('.onboarding-view__select-menu') as HTMLElement | null;
    expect(field?.getAttribute('data-placement')).toBe('top');
    expect(menu?.style.getPropertyValue('--onboarding-select-menu-max-height')).toBe('240px');
  });

  it('lets Escape close the searchable menu', () => {
    render(
      <OnboardingDropdown
        label="Model"
        placeholder="Select a model"
        value="model-1"
        options={[
          { value: 'model-1', label: 'Claude Sonnet 4.5' },
          { value: 'model-2', label: 'GPT-5' },
        ]}
        onChange={vi.fn()}
        searchable
        searchPlaceholder="Search models"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Claude Sonnet 4.5/ }));
    const search = screen.getByRole('searchbox', { name: 'Search models' });
    expect(screen.getByRole('listbox', { name: 'Model' })).toBeTruthy();

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(screen.queryByRole('listbox', { name: 'Model' })).toBeNull();
  });

  it('uses generic no-match copy for searchable dropdown filters', () => {
    render(
      <OnboardingDropdown
        label="Provider"
        placeholder="Custom provider"
        value=""
        options={[
          { value: 'anthropic', label: 'Anthropic' },
          { value: 'openai', label: 'OpenAI' },
        ]}
        onChange={vi.fn()}
        searchable
        searchPlaceholder="Provider"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Custom provider/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Provider' }), {
      target: { value: 'missing provider' },
    });

    expect(screen.getByText('No matches')).toBeTruthy();
    expect(screen.queryByText('No compatible text models were returned.')).toBeNull();
  });

  it('renders model tag and cost metadata as option text', () => {
    render(
      <OnboardingDropdown
        label="Model"
        placeholder="Select a model"
        value="deepseek-v4-flash"
        options={[
          {
            value: 'deepseek-v4-flash',
            label: 'deepseek-v4-flash',
            meta: 'Low cost',
            tag: 'Standard',
            tagKind: 'standard',
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /deepseek-v4-flash/ }));

    const option = screen.getByRole('option', { name: /^deepseek-v4-flash$/ });
    expect(option.textContent).toContain('Low cost');
    expect(option.textContent).toContain('Standard');
    expect(option).toHaveAccessibleName('deepseek-v4-flash');
    expect(option).toHaveAccessibleDescription('Low cost Standard');
    expect(option.querySelector('[data-description]')).toBeNull();
    expect(option.querySelector('[data-label]')).toBeNull();
  });
});
