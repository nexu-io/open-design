// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from '../../src/components/CustomSelect';

afterEach(() => cleanup());

describe('CustomSelect', () => {
  it.each([
    { menuMinWidth: undefined, expectedWidth: 80 },
    { menuMinWidth: 180, expectedWidth: 180 },
    { menuMinWidth: 10_000, expectedWidth: window.innerWidth - 24 },
  ])('keeps a portal menu within the viewport with minimum width $menuMinWidth', ({ menuMinWidth, expectedWidth }) => {
    render(<CustomSelect ariaLabel="Category" value="all" onChange={vi.fn()} menuMinWidth={menuMinWidth}
      options={[{ value: 'all', label: 'All 5' }]} />);
    const trigger = screen.getByRole('combobox', { name: 'Category: All 5' });
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true, value: () => new DOMRect(window.innerWidth - 92, 30, 80, 32),
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Category' });
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.width).toBe(`${expectedWidth}px`);
    expect(menu.style.left).toBe(`${window.innerWidth - expectedWidth - 12}px`);
    expect(menu.style.top).toBe('66px');
  });

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

  it('closes on Tab without selecting or preventing normal keyboard navigation', () => {
    const onChange = vi.fn();
    render(<CustomSelect ariaLabel="Category" value="first" onChange={onChange}
      options={[{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }]} />);
    const trigger = screen.getByRole('combobox', { name: 'Category: First' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Second' }).id);

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(trigger, tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses Home and End to reach the first and last enabled options', () => {
    const onChange = vi.fn();
    render(<CustomSelect ariaLabel="Category" value="middle" onChange={onChange} options={[
      { value: 'disabled-first', label: 'Disabled first', disabled: true },
      { value: 'first', label: 'First' },
      { value: 'middle', label: 'Middle' },
      { value: 'last', label: 'Last' },
      { value: 'disabled-last', label: 'Disabled last', disabled: true },
    ]} />);
    const trigger = screen.getByRole('combobox', { name: 'Category: Middle' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'First' }).id);
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Last' }).id);
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('last');
  });

  it('keeps the active option visible while scrolling only the long menu', () => {
    const { container } = render(<CustomSelect ariaLabel="Category" value="0" onChange={vi.fn()}
      options={Array.from({ length: 20 }, (_, index) => ({ value: String(index), label: `Category ${index}` }))} />);
    container.scrollTop = 35;
    const trigger = screen.getByRole('combobox', { name: 'Category: Category 0' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Category' });
    Object.defineProperty(menu, 'clientHeight', { configurable: true, value: 96 });
    Object.defineProperty(menu, 'getBoundingClientRect', {
      configurable: true, value: () => new DOMRect(20, 200, 240, 96),
    });
    const options = screen.getAllByRole('option');
    options.forEach((option, index) => {
      Object.defineProperties(option, {
        offsetTop: { configurable: true, value: index * 32 },
        offsetHeight: { configurable: true, value: 32 },
        getBoundingClientRect: {
          configurable: true, value: () => new DOMRect(20, 200 + index * 32 - menu.scrollTop, 240, 32),
        },
      });
    });
    const expectActiveVisible = (index: number) => {
      const option = options[index]!;
      expect(trigger).toHaveAttribute('aria-activedescendant', option.id);
      expect(menu.scrollTop).toBeLessThanOrEqual(option.offsetTop);
      expect(menu.scrollTop + menu.clientHeight).toBeGreaterThanOrEqual(option.offsetTop + option.offsetHeight);
      expect(container.scrollTop).toBe(35);
    };

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expectActiveVisible(3);
    fireEvent.keyDown(trigger, { key: 'End' });
    expectActiveVisible(19);
    fireEvent.keyDown(trigger, { key: 'Home' });
    expectActiveVisible(0);
  });
});
