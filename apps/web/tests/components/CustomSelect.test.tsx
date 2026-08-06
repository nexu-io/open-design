// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from '../../src/components/CustomSelect';

afterEach(() => cleanup());

describe('CustomSelect', () => {
  it('renders the selected label and chooses an option from the portal menu', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Model"
        value="gpt-image-2"
        options={[
          { value: 'gpt-image-2', label: 'GPT Image 2' },
          { value: 'seedance', label: 'Seedance' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Model: GPT Image 2' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('option', { name: /Seedance/ }));
    expect(onChange).toHaveBeenCalledWith('seedance');
  });

  it('skips disabled options and supports keyboard selection', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Provider"
        value="openai"
        options={[
          { value: 'openai', label: 'OpenAI' },
          { value: 'disabled', label: 'Disabled', disabled: true },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Provider: OpenAI' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Custom/ }).id,
    );
    expect(trigger.getAttribute('aria-activedescendant')).not.toBe(
      screen.getByRole('option', { name: /Disabled/ }).id,
    );

    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('custom');
    expect(onChange).not.toHaveBeenCalledWith('disabled');
  });

  it('keeps keyboard navigation active state across parent rerenders with fresh options', () => {
    const onChange = vi.fn();
    const options = () => [
      { value: 'first', label: 'First' },
      { value: 'second', label: 'Second' },
      { value: 'third', label: 'Third' },
    ];
    const { rerender } = render(
      <CustomSelect
        ariaLabel="Template"
        value="first"
        options={options()}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Template: First' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Second/ }).id,
    );

    rerender(
      <CustomSelect
        ariaLabel="Template"
        value="first"
        options={options()}
        onChange={onChange}
      />,
    );

    const rerenderedTrigger = screen.getByRole('combobox', { name: 'Template: First' });
    expect(rerenderedTrigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Second/ }).id,
    );
  });

  it('reveals an option description on hover and keyboard navigation', () => {
    render(
      <CustomSelect
        ariaLabel="Ratio"
        value="1:1"
        options={[
          { value: '1:1', label: '1:1', description: 'Instagram feed · Amazon product images' },
          { value: '9:16', label: '9:16', description: 'Instagram Reels · TikTok · Stories' },
        ]}
        onChange={() => undefined}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Ratio: 1:1' });
    fireEvent.click(trigger);
    expect(screen.queryByText('Instagram feed · Amazon product images')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('option', { name: '1:1' }));
    expect(screen.getByText('Instagram feed · Amazon product images')).not.toBeNull();

    fireEvent.mouseLeave(screen.getByRole('listbox', { name: 'Ratio' }));
    expect(screen.queryByText('Instagram feed · Amazon product images')).toBeNull();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByText('Instagram Reels · TikTok · Stories')).not.toBeNull();
  });

  it('shows a leading visual in both the trigger and menu option', () => {
    render(
      <CustomSelect
        ariaLabel="Ratio"
        value="16:9"
        options={[
          {
            value: '16:9',
            label: '16:9',
            leadingVisual: <span data-testid="ratio-visual" />,
          },
        ]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getAllByTestId('ratio-visual')).toHaveLength(1);
    fireEvent.click(screen.getByRole('combobox', { name: 'Ratio: 16:9' }));
    expect(screen.getAllByTestId('ratio-visual')).toHaveLength(2);
  });
});
