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

/** Required fields with neither a provided value nor a usable default. */
function unsatisfiedRequiredFields(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): InputFieldSpec[] {
  return fields.filter((field) => (
    field.required === true && !hasValue(values[field.name]) && !hasValue(field.default)
  ));
}

/**
 * Names of required fields that have neither a provided value nor a usable
 * default. Field labels are preferred over names for user-facing messages.
 */
export function missingRequiredInputs(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): string[] {
  return unsatisfiedRequiredFields(fields, values).map(
    (field) => field.label?.trim() || field.name,
  );
}

/** True when every required field is satisfied by a value or a default. */
export function pluginInputsAreValid(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): boolean {
  return missingRequiredInputs(fields, values).length === 0;
}

/** True when `{{name}}` appears in the tracked query template. */
function templateReferencesInput(template: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`).test(template);
}

/**
 * True when every still-unsatisfied required input has somewhere the user can
 * actually type it — the only condition under which gating Send on those inputs
 * is a guard rather than a dead end.
 *
 * Two surfaces can fill a required field on Home:
 *  - `mediaSurface`: the media composer renders its fields as real controls, so a
 *    blanked required field is one edit away from valid.
 *  - a tracked `queryTemplate` that actually contains the field as a
 *    `{{placeholder}}`: editing the hydrated value in the composer writes back
 *    into `inputs` (see `extractPluginInputsFromPrompt`). A template that never
 *    mentions the field cannot fill it, no matter how much the user types — which
 *    is why this checks the placeholders rather than merely that a template
 *    exists.
 *
 * Otherwise the fields are unreachable. This composer has no inline
 * plugin-inputs form (removed in #3645, see the note above), so a template whose
 * `od.useCase.query` carries no `{{...}}` placeholders — the 「使用」 path, where a
 * complete self-contained brief is already seeded — leaves the user with nothing
 * to edit and Send permanently dead under a tooltip telling them to type
 * something. The gate stands down there and the daemon stays the authority
 * (`validateInputs` in apps/daemon/src/plugins/apply.ts still throws
 * MissingInputError), so the failure is reported rather than pre-empted.
 */
export function requiredInputsAreUserFillable(active: {
  mediaSurface: unknown;
  queryTemplate: string | null;
  inputFields: InputFieldSpec[];
  inputs: Record<string, unknown>;
}): boolean {
  if (active.mediaSurface !== null) return true;
  const template = active.queryTemplate;
  if (!template) return false;
  return unsatisfiedRequiredFields(active.inputFields, active.inputs).every((field) =>
    templateReferencesInput(template, field.name),
  );
}
