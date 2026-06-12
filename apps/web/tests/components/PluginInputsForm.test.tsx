// @vitest-environment jsdom

// Plan §3.C2 / §3.C4 — PluginInputsForm unit test.
//
// Confirms the validity gating contract every composer relies on:
//   - Required text fields gate Send (onValidityChange flips false → true).
//   - Defaults pre-fill on mount.
//   - Inputs flow back through onChange.
//   - Select renders options + emits the chosen value.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { PluginInputsForm } from '../../src/components/PluginInputsForm';
import { I18nProvider } from '../../src/i18n';

type OnChange = (values: Record<string, unknown>) => void;
type OnValidityChange = (valid: boolean) => void;

let onChange: ReturnType<typeof vi.fn<OnChange>>;
let onValidityChange: ReturnType<typeof vi.fn<OnValidityChange>>;

beforeEach(() => {
  onChange = vi.fn<OnChange>();
  onValidityChange = vi.fn<OnValidityChange>();
});

afterEach(() => cleanup());

describe('PluginInputsForm', () => {
  it('renders nothing for an empty field set', () => {
    const { container } = render(
      <PluginInputsForm fields={[]} values={{}} onChange={onChange} onValidityChange={onValidityChange} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('emits invalid → valid as the user fills required fields', () => {
    render(
      <PluginInputsForm
        fields={[{ name: 'topic', label: 'Topic', type: 'string', required: true }]}
        values={{}}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    const input = screen.getByLabelText(/Topic/);
    fireEvent.change(input, { target: { value: 'design tools' } });
    expect(onChange).toHaveBeenCalled();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('does not loop when validity updates parent state during render cycles', () => {
    function ValidityMirror() {
      const [, setValidityEmits] = useState(0);
      return (
        <PluginInputsForm
          fields={[{ name: 'topic', label: 'Topic', type: 'string', required: true }]}
          values={{ topic: 'design tools' }}
          onChange={onChange}
          onValidityChange={() => setValidityEmits((count) => count + 1)}
        />
      );
    }

    expect(() => render(<ValidityMirror />)).not.toThrow();
    expect(screen.getByLabelText(/Topic/)).toBeTruthy();
  });

  it('hydrates default values on mount', () => {
    render(
      <PluginInputsForm
        fields={[
          { name: 'tone', label: 'Tone', type: 'select', options: ['Editorial', 'Modern'], default: 'Modern' },
        ]}
        values={{}}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    const select = screen.getByLabelText(/Tone/) as HTMLSelectElement;
    expect(select.value).toBe('Modern');
    expect(onChange).toHaveBeenCalledWith({ tone: 'Modern' });
  });

  it('renders a select with each option', () => {
    render(
      <PluginInputsForm
        fields={[{ name: 'audience', label: 'Audience', type: 'select', options: ['VC', 'Customer'] }]}
        values={{}}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    expect(screen.getByText('VC')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
  });

  it('renders select option labels while preserving submitted values', () => {
    render(
      <PluginInputsForm
        fields={[
          {
            name: 'audioType',
            label: 'Audio type',
            type: 'select',
            options: ['speech', 'music'],
            optionLabels: { speech: 'Speech', music: 'Music' },
          },
        ]}
        values={{ audioType: 'speech' }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    const select = screen.getByLabelText(/Audio type/) as HTMLSelectElement;
    expect(select.value).toBe('speech');
    expect(screen.getByText('Speech')).toBeTruthy();

    fireEvent.change(select, { target: { value: 'music' } });

    expect(onChange).toHaveBeenCalledWith({ audioType: 'music' });
  });

  it('localizes optionLabels-backed select labels in Simplified Chinese', () => {
    render(
      <I18nProvider initial="zh-CN">
        <PluginInputsForm
          fields={[
            {
              name: 'audioType',
              label: 'Audio type',
              type: 'select',
              options: ['speech', 'sfx'],
              optionLabels: { speech: 'Speech', sfx: 'Sound effect' },
            },
          ]}
          values={{ audioType: 'speech' }}
          onChange={onChange}
          onValidityChange={onValidityChange}
        />
      </I18nProvider>,
    );
    const select = screen.getByLabelText('音频类型') as HTMLSelectElement;

    expect(select.value).toBe('speech');
    expect(screen.getByText('语音')).toBeTruthy();
    expect(screen.getByText('音效')).toBeTruthy();
    expect(screen.queryByText('Speech')).toBeNull();
    expect(screen.queryByText('Sound effect')).toBeNull();

    fireEvent.change(select, { target: { value: 'sfx' } });

    expect(onChange).toHaveBeenCalledWith({ audioType: 'sfx' });
  });

  it('renders file inputs as upload slots with serializable metadata', () => {
    render(
      <PluginInputsForm
        fields={[{ name: 'reference', label: 'Reference file', type: 'file' }]}
        values={{}}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    const input = screen.getByLabelText(/Reference file/) as HTMLInputElement;
    const file = new File(['brief'], 'brief.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onChange).toHaveBeenCalledWith({
      reference: expect.objectContaining({
        name: 'brief.txt',
        size: 5,
        type: 'text/plain',
      }),
    });
    expect(screen.getByText('brief.txt')).toBeTruthy();
  });
});
