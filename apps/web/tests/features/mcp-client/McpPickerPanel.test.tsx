// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpTemplate } from '@open-design/contracts';
import { McpPickerPanel } from '../../../src/features/mcp-client/components/McpPickerPanel';

afterEach(cleanup);

function template(over: Partial<McpTemplate> = {}): McpTemplate {
  return { id: 't', label: 'L', description: 'd', transport: 'stdio', category: 'utilities', ...over };
}

const templates = [
  template({ id: 'gen', label: 'Generator', category: 'image-generation' }),
  template({ id: 'util', label: 'Utility', category: 'utilities' }),
];

function renderPanel(over: Partial<Parameters<typeof McpPickerPanel>[0]> = {}) {
  const props = {
    templates,
    query: '',
    onQueryChange: vi.fn(),
    onPick: vi.fn(),
    onPickBlank: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<McpPickerPanel {...props} />);
  return props;
}

describe('McpPickerPanel', () => {
  it('renders category groups and both template cards', () => {
    renderPanel();
    expect(screen.getByText('Image generation')).toBeTruthy();
    expect(screen.getByText('Generator')).toBeTruthy();
    expect(screen.getByText('Utility')).toBeTruthy();
  });

  it('fires onQueryChange, onPick, onPickBlank and onClose', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Filter by name/i), { target: { value: 'gen' } });
    expect(props.onQueryChange).toHaveBeenCalledWith('gen');
    fireEvent.click(screen.getByText('Generator'));
    expect(props.onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen' }));
    fireEvent.click(screen.getByText('Custom server'));
    expect(props.onPickBlank).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Close picker/i }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('shows the empty state when a query matches nothing', () => {
    renderPanel({ query: 'zzz' });
    expect(screen.getByText(/No templates match/)).toBeTruthy();
  });
});
