import type { InputFieldSpec } from '@open-design/contracts';

// The Home composer dropped its inline plugin-inputs form, so most fields are
// satisfied by their `default` or hydrated from the prompt body. Required
// fields that have neither a default nor a provided value cannot be inferred,
// though: the daemon rejects them at apply time (`validateInputs` in
// apps/daemon/src/plugins/apply.ts throws MissingInputError), which would
// otherwise surface only as a generic "Failed to apply …" after Send. These
// helpers mirror the daemon's required-input rule so Home flows can gate the
// submit client-side and name the missing field instead of regressing into a
// broken send path.

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Names of required fields that have neither a provided value nor a usable
 * default. Field labels are preferred over names for user-facing messages.
 */
export function missingRequiredInputs(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const field of fields) {
    if (field.required !== true) continue;
    if (hasValue(values[field.name])) continue;
    if (hasValue(field.default)) continue;
    missing.push(field.label?.trim() || field.name);
  }
  return missing;
}

/** True when every required field is satisfied by a value or a default. */
export function pluginInputsAreValid(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): boolean {
  return missingRequiredInputs(fields, values).length === 0;
}
