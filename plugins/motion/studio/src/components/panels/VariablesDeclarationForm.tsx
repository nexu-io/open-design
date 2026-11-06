import { useI18n } from "../../i18n/I18n";
/**
 * Add/edit form for a variable declaration. Builds a typed
 * CompositionVariable from free-text drafts; structural validation beyond
 * the field-level checks here is the SDK's job (can() on dispatch).
 */

import { useState } from "react";
import type { CompositionVariable, CompositionVariableType } from "@hyperframes/sdk";
import { variableDefaultText, VARIABLES_INPUT_CLASS } from "./VariablesValueControls";

const VARIABLE_TYPES: CompositionVariableType[] = [
  "string",
  "number",
  "color",
  "boolean",
  "enum",
  "font",
  "image",
];

export interface DeclarationDraft {
  original?: CompositionVariable;
  id: string;
  label: string;
  type: CompositionVariableType;
  defaultRaw: string;
  description: string;
  min: string;
  max: string;
  step: string;
  optionsRaw: string;
}

export const EMPTY_DRAFT: DeclarationDraft = {
  id: "",
  label: "",
  type: "string",
  defaultRaw: "",
  description: "",
  min: "",
  max: "",
  step: "",
  optionsRaw: "",
};

// Per-type field mapping — one ternary per optional field.
// fallow-ignore-next-line complexity
export function draftFromDeclaration(decl: CompositionVariable): DeclarationDraft {
  const numeric = decl.type === "number" ? decl : null;
  return {
    ...EMPTY_DRAFT,
    original: decl,
    id: decl.id,
    label: decl.label,
    type: decl.type,
    defaultRaw: variableDefaultText(decl),
    description: decl.description ?? "",
    min: numeric?.min !== undefined ? String(numeric.min) : "",
    max: numeric?.max !== undefined ? String(numeric.max) : "",
    step: numeric?.step !== undefined ? String(numeric.step) : "",
    optionsRaw:
      decl.type === "enum" ? decl.options.map((o) => `${o.value}:${o.label}`).join("\n") : "",
  };
}

function numberDeclFromDraft(
  base: { id: string; label: string; description?: string },
  draft: DeclarationDraft,
): CompositionVariable | string {
  const value = Number(draft.defaultRaw);
  if (!Number.isFinite(value)) return "Default must be a number.";
  const constraint = (key: "min" | "max" | "step") => {
    const raw = draft[key].trim();
    if (!raw) return {};
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? { [key]: parsed } : {};
  };
  return {
    ...base,
    type: "number",
    default: value,
    ...constraint("min"),
    ...constraint("max"),
    ...constraint("step"),
  };
}

// fallow-ignore-next-line complexity
function enumDeclFromDraft(
  base: { id: string; label: string; description?: string },
  draft: DeclarationDraft,
): CompositionVariable | string {
  const options = draft.optionsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split(":");
      const v = (value ?? "").trim();
      return { value: v, label: rest.join(":").trim() || v };
    })
    .filter((o) => o.value.length > 0);
  if (options.length === 0) return "Enum needs at least one option (one per line, value:Label).";
  const value = draft.defaultRaw.trim() || (options[0]?.value ?? "");
  if (!options.some((o) => o.value === value)) return "Default must be one of the options.";
  return { ...base, type: "enum", default: value, options };
}

/**
 * Fields the form actually models. On an unchanged-type edit, every OTHER key
 * of the original declaration (font source/default_name/default_source,
 * brandRole, placeholder, maxLength, unit, …) must ride through untouched —
 * updateVariableDeclaration replaces wholesale, so dropping them here would
 * silently strip schema metadata on every Edit + Save.
 */
const FORM_OWNED_KEYS = new Set([
  "id",
  "label",
  "type",
  "default",
  "description",
  "min",
  "max",
  "step",
  "options",
]);

export function mergeDeclarationEdit(
  original: CompositionVariable,
  edited: CompositionVariable,
): CompositionVariable {
  // Type changed → old type-specific metadata no longer applies.
  if (original.type !== edited.type) return edited;
  const passthrough: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(original)) {
    if (!FORM_OWNED_KEYS.has(key)) passthrough[key] = value;
  }
  // Both sides are same-type declarations and edited owns every form key, so
  // the merge preserves the declared shape.
  return { ...passthrough, ...edited };
}

/** Build a typed declaration from the form draft; string on validation error. */
// fallow-ignore-next-line complexity
export function declarationFromDraft(draft: DeclarationDraft): CompositionVariable | string {
  const id = draft.id.trim();
  if (!id) return "Variable id is required.";
  const label = draft.label.trim() || id;
  const description = draft.description.trim() || undefined;
  const base = { id, label, ...(description ? { description } : {}) };
  switch (draft.type) {
    case "number":
      return numberDeclFromDraft(base, draft);
    case "boolean":
      return { ...base, type: "boolean", default: draft.defaultRaw.trim() === "true" };
    case "enum":
      return enumDeclFromDraft(base, draft);
    case "font": {
      const value = draft.original?.type === "font" ? draft.original.default : undefined;
      return {
        ...base,
        type: "font",
        default:
          typeof value === "object" ? { ...value, name: draft.defaultRaw } : draft.defaultRaw,
      };
    }
    case "image": {
      const value = draft.original?.type === "image" ? draft.original.default : undefined;
      return {
        ...base,
        type: "image",
        default: typeof value === "object" ? { ...value, url: draft.defaultRaw } : draft.defaultRaw,
      };
    }
    default:
      return { ...base, type: draft.type, default: draft.defaultRaw };
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-medium text-neutral-500">{label}</label>
      {children}
    </div>
  );
}

function DefaultField({
  draft,
  onChange,
}: {
  draft: DeclarationDraft;
  onChange: (defaultRaw: string) => void;
}) {
  if (draft.type === "boolean") {
    return (
      <select
        value={draft.defaultRaw === "true" ? "true" : "false"}
        onChange={(e) => onChange(e.target.value)}
        className={VARIABLES_INPUT_CLASS}
      >
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    );
  }
  return (
    <input
      type="text"
      value={draft.defaultRaw}
      onChange={(e) => onChange(e.target.value)}
      className={VARIABLES_INPUT_CLASS}
    />
  );
}

export function DeclarationForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: DeclarationDraft;
  submitLabel: string;
  onSubmit: (decl: CompositionVariable) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<DeclarationDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const editingExisting = initial.id.length > 0;
  const set = (patch: Partial<DeclarationDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = () => {
    const result = declarationFromDraft(draft);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setError(null);
    onSubmit(result);
  };

  return (
    <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="ID">
          <input
            type="text"
            value={draft.id}
            disabled={editingExisting}
            onChange={(e) => set({ id: e.target.value })}
            placeholder={t("title")}
            className={`${VARIABLES_INPUT_CLASS} font-mono disabled:opacity-50`}
          />
        </Field>
        <Field label={t("Label")}>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder={t("Title")}
            className={VARIABLES_INPUT_CLASS}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Type")}>
          <select
            value={draft.type}
            onChange={(e) => {
              const type = VARIABLE_TYPES.find((t) => t === e.target.value);
              if (type) set({ type });
            }}
            className={VARIABLES_INPUT_CLASS}
          >
            {VARIABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Default")}>
          <DefaultField draft={draft} onChange={(defaultRaw) => set({ defaultRaw })} />
        </Field>
      </div>
      {draft.type === "number" && (
        <div className="grid grid-cols-3 gap-2">
          {(["min", "max", "step"] as const).map((key) => (
            <Field key={key} label={key}>
              <input
                type="text"
                value={draft[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                className={`${VARIABLES_INPUT_CLASS} tabular-nums`}
              />
            </Field>
          ))}
        </div>
      )}
      {draft.type === "enum" && (
        <Field label={t("Options (one per line, value:Label)")}>
          <textarea
            value={draft.optionsRaw}
            onChange={(e) => set({ optionsRaw: e.target.value })}
            rows={3}
            className={`${VARIABLES_INPUT_CLASS} resize-y font-mono`}
          />
        </Field>
      )}
      <Field label={t("Description (optional)")}>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          className={VARIABLES_INPUT_CLASS}
        />
      </Field>
      {error && <p className="text-[10px] text-danger-ink">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-6 rounded-sm px-2 text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          {t("Cancel")}</button>
        <button
          type="button"
          onClick={submit}
          className="h-6 rounded-sm bg-neutral-800 px-2 text-[10px] font-medium text-neutral-200 hover:bg-neutral-700"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
