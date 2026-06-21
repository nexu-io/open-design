import { describe, expect, it } from 'vitest';
import type { InputFieldSpec } from '@open-design/contracts';
import {
  missingRequiredInputs,
  pluginInputsAreValid,
} from '../../src/utils/pluginRequiredInputs';

function field(spec: Partial<InputFieldSpec> & { name: string }): InputFieldSpec {
  return spec as InputFieldSpec;
}

describe('pluginRequiredInputs', () => {
  it('flags a required field with no value and no default (the regressed case)', () => {
    // The Home composer dropped its inline inputs form; a required field with
    // no default that the user blanks out must still fail fast client-side, or
    // the run only breaks later at daemon apply time with a generic error.
    const fields = [field({ name: 'subject', label: 'Subject', required: true })];
    expect(missingRequiredInputs(fields, {})).toEqual(['Subject']);
    expect(missingRequiredInputs(fields, { subject: '' })).toEqual(['Subject']);
    expect(pluginInputsAreValid(fields, { subject: '' })).toBe(false);
  });

  it('treats a provided value or a usable default as satisfied', () => {
    const fields = [
      field({ name: 'subject', label: 'Subject', required: true }),
      field({ name: 'style', required: true, default: 'cinematic' }),
    ];
    expect(pluginInputsAreValid(fields, { subject: 'a product shot' })).toBe(true);
    expect(missingRequiredInputs(fields, { subject: 'a product shot' })).toEqual([]);
  });

  it('ignores optional fields entirely', () => {
    const fields = [
      field({ name: 'note', required: false }),
      field({ name: 'extra' }),
    ];
    expect(pluginInputsAreValid(fields, {})).toBe(true);
  });

  it('falls back to the field name when no label is set', () => {
    const fields = [field({ name: 'subject', required: true })];
    expect(missingRequiredInputs(fields, {})).toEqual(['subject']);
  });

  it('does not treat an empty-string default as a usable default', () => {
    const fields = [field({ name: 'subject', label: 'Subject', required: true, default: '' })];
    expect(pluginInputsAreValid(fields, {})).toBe(false);
  });
});
