// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectPanel } from '../../../src/features/file-viewer/components/InspectPanel';
import type { InspectTarget } from '../../../src/features/file-viewer/types';

afterEach(cleanup);

function target(overrides: Partial<InspectTarget> = {}): InspectTarget {
  return {
    elementId: 'el-1',
    selector: '[data-od-id="el-1"]',
    label: 'Button',
    text: '',
    style: {},
    ...overrides,
  };
}

describe('InspectPanel', () => {
  it('shows the target label and element id', () => {
    render(
      <InspectPanel
        target={target()}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    expect(screen.getAllByText('Button').length).toBeGreaterThan(0);
    expect(screen.getByText('el-1')).toBeTruthy();
  });

  it('calls onApply with the picked color and keeps the draft value on re-render', () => {
    const onApply = vi.fn();
    render(
      <InspectPanel
        target={target({ style: { color: 'rgb(0, 0, 0)' } })}
        onApply={onApply}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    fireEvent.change(screen.getByTestId('inspect-color'), { target: { value: '#ff0000' } });
    expect(onApply).toHaveBeenCalledWith('color', '#ff0000');
    expect((screen.getByTestId('inspect-color') as HTMLInputElement).value).toBe('#ff0000');
  });

  it('resets the draft when the target element changes', () => {
    const { rerender } = render(
      <InspectPanel
        target={target({ style: { color: 'rgb(0, 0, 0)' } })}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    fireEvent.change(screen.getByTestId('inspect-color'), { target: { value: '#ff0000' } });
    expect((screen.getByTestId('inspect-color') as HTMLInputElement).value).toBe('#ff0000');

    rerender(
      <InspectPanel
        target={target({ elementId: 'el-2', style: { color: 'rgb(0, 128, 0)' } })}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    expect((screen.getByTestId('inspect-color') as HTMLInputElement).value).toBe('#008000');
  });

  it('shows the clicked-descendant notice only when present', () => {
    const { rerender } = render(
      <InspectPanel
        target={target()}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    expect(screen.queryByTestId('inspect-ancestor-notice')).toBeNull();

    rerender(
      <InspectPanel
        target={target({ clickedDescendant: { label: 'Span', text: 'hi' } })}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    expect(screen.getByTestId('inspect-ancestor-notice')).toBeTruthy();
  });

  it('calls onResetElement with the element id and onClose/onSaveToSource on their buttons', () => {
    const onResetElement = vi.fn();
    const onSaveToSource = vi.fn();
    const onClose = vi.fn();
    render(
      <InspectPanel
        target={target()}
        onApply={() => {}}
        onResetElement={onResetElement}
        onSaveToSource={onSaveToSource}
        onClose={onClose}
        saving={false}
        savedAt={null}
        error={null}
      />,
    );
    fireEvent.click(screen.getByText('Reset element'));
    expect(onResetElement).toHaveBeenCalledWith('el-1');
    fireEvent.click(screen.getByTestId('inspect-save'));
    expect(onSaveToSource).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Close inspect'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a saved confirmation shortly after savedAt, and the error banner when present', () => {
    render(
      <InspectPanel
        target={target()}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving={false}
        savedAt={Date.now()}
        error="write failed"
      />,
    );
    expect(screen.getByText('Saved ✓')).toBeTruthy();
    expect(screen.getByText('write failed')).toBeTruthy();
  });

  it('shows a saving label and disables the save button while saving', () => {
    render(
      <InspectPanel
        target={target()}
        onApply={() => {}}
        onResetElement={() => {}}
        onSaveToSource={() => {}}
        onClose={() => {}}
        saving
        savedAt={null}
        error={null}
      />,
    );
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(screen.getByTestId('inspect-save')).toBeDisabled();
  });
});
