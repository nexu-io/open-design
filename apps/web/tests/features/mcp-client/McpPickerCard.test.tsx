// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpTemplate } from '@open-design/contracts';
import { McpPickerCard } from '../../../src/features/mcp-client/components/McpPickerCard';

afterEach(cleanup);

function template(over: Partial<McpTemplate> = {}): McpTemplate {
  return { id: 't', label: 'Figma', description: 'design tool', transport: 'http', category: 'design-systems', ...over };
}

describe('McpPickerCard', () => {
  it('renders label, transport, example and a homepage link, and fires onPick', () => {
    const onPick = vi.fn();
    render(<McpPickerCard tpl={template({ example: 'draw a card', homepage: 'https://figma.com' })} onPick={onPick} />);
    expect(screen.getByText('Figma')).toBeTruthy();
    expect(screen.getByText('design tool')).toBeTruthy();
    expect(screen.getByText(/draw a card/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Homepage/i }).getAttribute('href')).toBe('https://figma.com');
    fireEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('omits the example and homepage when absent', () => {
    render(<McpPickerCard tpl={template()} onPick={vi.fn()} />);
    expect(screen.queryByText(/Try:/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Homepage/i })).toBeNull();
  });
});
