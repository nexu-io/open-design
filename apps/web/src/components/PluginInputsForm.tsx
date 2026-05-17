// Plan §3.C2 / spec §8.3 — inline plugin inputs form.
//
// Renders the `od.inputs` field set as a compact form between the brief
// textarea and the Send button. Required fields gate Send via
// `onValidityChange`; the parent disables its primary button until
// every required field has a value.
//
// Behaviour rules:
//   - String / text → text input (text becomes a textarea when type='text').
//   - Select → native <select> with the supplied options.
//   - Number → numeric input; coerces back to a number on blur.
//   - Boolean → checkbox.
//   - File → upload picker; the value stored for apply is lightweight
//     metadata so project creation can still pass JSON cleanly.
//   - Default values pre-fill the field on mount.

import { useEffect, useMemo, useState } from 'react';
import type { InputFieldSpec } from '@open-design/contracts';

interface Props {
  fields: InputFieldSpec[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onValidityChange?: (valid: boolean) => void;
}

export function PluginInputsForm(props: Props) {
  const fields = props.fields ?? [];
  const required = useMemo(
    () => fields.filter((f) => f.required === true).map((f) => f.name),
    [fields],
  );
  const [values, setValues] = useState<Record<string, unknown>>(props.values ?? {});

  useEffect(() => {
    setValues(props.values ?? {});
  }, [props.values]);

  // Hydrate defaults the first time we see a new field set.
  useEffect(() => {
    if (fields.length === 0) return;
    let mutated = false;
    const next = { ...values };
    for (const field of fields) {
      if (next[field.name] === undefined && field.default !== undefined) {
        next[field.name] = field.default;
        mutated = true;
      }
    }
    if (mutated) {
      setValues(next);
      props.onChange(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.length]);

  // Emit validity whenever required fields change presence.
  useEffect(() => {
    const valid = required.every((name) => {
      const v = values[name];
      return v !== undefined && v !== null && v !== '';
    });
    props.onValidityChange?.(valid);
  }, [values, required, props]);

  if (fields.length === 0) return null;

  const update = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(next);
    props.onChange(next);
  };

  return (
    <div className="plugin-inputs-form" data-testid="plugin-inputs-form">
      {fields.map((field) => (
        <label
          key={field.name}
          className="plugin-inputs-form__field"
          data-field-type={fieldType(field)}
          data-required={field.required === true ? 'true' : 'false'}
          data-filled={hasFieldValue(values[field.name]) ? 'true' : 'false'}
        >
          <span className="plugin-inputs-form__label">
            {field.label ?? field.name}
            {field.required ? <span className="plugin-inputs-form__required">*</span> : null}
          </span>
          {renderField(field, values[field.name], (v) => update(field.name, v))}
        </label>
      ))}
    </div>
  );
}

function renderField(
  field: InputFieldSpec,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  const type = fieldType(field);
  if (type === 'select' && Array.isArray(field.options)) {
    return (
      <select
        className="plugin-inputs-form__input"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={(e) => onChange(e.target.value)}
        data-field-name={field.name}
      >
        <option value="">{field.placeholder ?? 'Select…'}</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'number') {
    return (
      <input
        type="number"
        className="plugin-inputs-form__input"
        value={value === undefined || value === null ? '' : String(value)}
        placeholder={field.placeholder ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : raw);
        }}
        data-field-name={field.name}
      />
    );
  }
  if (type === 'boolean') {
    return (
      <input
        type="checkbox"
        className="plugin-inputs-form__input"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        data-field-name={field.name}
      />
    );
  }
  if (type === 'file') {
    const fileValue = fileInputLabel(value);
    return (
      <span className="plugin-inputs-form__file-shell">
        <input
          type="file"
          className="plugin-inputs-form__input plugin-inputs-form__input--file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            onChange(file ? fileMetadata(file) : undefined);
          }}
          data-field-name={field.name}
          {...(typeof field.accept === 'string' ? { accept: field.accept } : {})}
        />
        <span className="plugin-inputs-form__file-label">
          {fileValue ?? field.placeholder ?? 'Choose file…'}
        </span>
      </span>
    );
  }
  if (type === 'text') {
    return (
      <textarea
        className="plugin-inputs-form__input plugin-inputs-form__input--textarea"
        rows={3}
        value={value === undefined || value === null ? '' : String(value)}
        placeholder={field.placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)}
        data-field-name={field.name}
      />
    );
  }
  return (
    <input
      type="text"
      className="plugin-inputs-form__input"
      value={value === undefined || value === null ? '' : String(value)}
      placeholder={field.placeholder ?? ''}
      onChange={(e) => onChange(e.target.value)}
      data-field-name={field.name}
    />
  );
}

function fieldType(field: InputFieldSpec): string {
  const rawType = (field as { type?: unknown }).type;
  const raw = typeof rawType === 'string' ? rawType : 'string';
  return raw === 'upload' ? 'file' : raw;
}

function hasFieldValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function fileMetadata(file: File) {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

function fileInputLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}
