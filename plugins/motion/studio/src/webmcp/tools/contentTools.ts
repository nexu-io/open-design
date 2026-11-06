/**
 * `studio_set_text` and `studio_set_style`: the first tools that change the file.
 *
 * The explicit source-safe handle is resolved to one selection per invocation.
 * That captured selection is passed into Studio's existing commit actor; visible
 * selection is presentation only and cannot redirect the write.
 */

import type { DomEditCommitOutcome } from "../../hooks/domEditCommitRunner";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import { toolFailure, type ToolFailure } from "../toolResult";
import {
  dispatched,
  runTargetedWrite,
  saved,
  type StudioWriteAdapterSuccess,
  type StudioWriteEvidence,
  type StudioWriteResult,
  type TargetedWriteDeps,
  WRITE_RECEIPT_DESCRIPTION,
} from "../writeCoordinator";

export interface ContentToolDeps extends TargetedWriteDeps {
  setText: (
    selection: DomEditSelection,
    value: string,
    fieldKey?: string,
  ) => Promise<DomEditCommitOutcome>;
  setStyle: (
    selection: DomEditSelection,
    property: string,
    value: string,
  ) => Promise<DomEditCommitOutcome>;
}

/**
 * The reasons a commit declines, translated into something an agent can act on.
 * `persist-failed` is exogenous; the rest are states it should route around.
 */
const DECLINE_HINTS: Record<string, { kind: "blocked" | "invalid" | "failed"; hint?: string }> = {
  "no-selection": { kind: "invalid", hint: "Call studio_select first." },
  "no-project": { kind: "blocked" },
  "geometry-property": {
    kind: "blocked",
    hint: "Position and size are not editable as styles. Use the transform tools.",
  },
  "styles-not-editable": {
    kind: "blocked",
    hint: "studio_inspect reports why, in can.reasonIfDisabled.",
  },
  "not-text-editable": {
    kind: "blocked",
    hint: "This element has no editable text. studio_inspect lists its textFields.",
  },
  "persist-failed": { kind: "failed", hint: "The write did not reach the file. Check Studio." },
};

function fromOutcome(outcome: DomEditCommitOutcome, what: string): ToolFailure | null {
  if (outcome.ok) return null;
  const mapped = DECLINE_HINTS[outcome.reason] ?? { kind: "failed" as const };
  return toolFailure(mapped.kind, `${what} was not applied: ${outcome.reason}`, mapped.hint);
}

export interface StudioSetTextResult {
  text: string;
  changed: boolean;
}

export async function studioSetText(
  deps: ContentToolDeps,
  input: { handle?: unknown; text?: unknown; field?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioSetTextResult>> {
  if (typeof input.text !== "string") {
    return preDispatchFailure("set-text", toolFailure("invalid", "text must be a string"));
  }
  const text = input.text;

  const requested = typeof input.field === "string" && input.field ? input.field : undefined;
  let field: string | undefined;
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "set-text",
    signal,
    preflight: (selection) => {
      const fields = selection.textFields;
      if (requested && !fields.some((candidate) => candidate.key === requested)) {
        return toolFailure(
          "invalid",
          `this element has no text field "${requested}"`,
          `Its fields are: ${fields.map((candidate) => candidate.key).join(", ") || "none"}.`,
        );
      }
      field = requested ?? (fields.length === 1 ? fields[0]?.key : undefined);
      if (field) return null;
      if (fields.length === 0) {
        return toolFailure(
          "blocked",
          "this element has no editable text field",
          "studio_inspect lists an element's textFields.",
        );
      }
      return toolFailure(
        "invalid",
        `this element has ${fields.length} text fields, so one must be named`,
        `Pass field as one of: ${fields.map((candidate) => candidate.key).join(", ")}.`,
      );
    },
    write: async (selection) => {
      const before = selection.element.textContent;
      const outcome = await deps.setText(selection, text, field);
      if (!outcome.ok) return fromOutcome(outcome, "the text")!;
      const value = { text, changed: selection.element.textContent !== before };
      return outcome.persistence
        ? saved(value, outcome.persistence)
        : dispatched(value, value.changed);
    },
  });
}

export interface StudioSetStyleResult {
  applied: Record<string, string>;
  /** Properties the element refused, with the reason. Empty when all landed. */
  rejected: Record<string, string>;
  partial: boolean;
  propertyReceipts: Record<
    string,
    { stage: "dispatched" | "saved"; changed: boolean; evidence: StudioWriteEvidence }
  >;
}

export async function studioSetStyle(
  deps: ContentToolDeps,
  input: { handle?: unknown; styles?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioSetStyleResult>> {
  const styles = input.styles;
  if (typeof styles !== "object" || styles === null || Array.isArray(styles)) {
    return preDispatchFailure(
      "set-style",
      toolFailure("invalid", "styles must be an object of CSS property to value"),
    );
  }
  const entries = Object.entries(styles).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (entries.length === 0) {
    // An empty commit would report success having done nothing.
    return preDispatchFailure(
      "set-style",
      toolFailure("invalid", "styles must contain at least one string value"),
    );
  }

  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "set-style",
    signal,
    preflight: (selection) =>
      selection.capabilities.canEditStyles
        ? null
        : toolFailure(
            "blocked",
            "this element's styles are not editable",
            "studio_inspect reports why, in can.reasonIfDisabled.",
          ),
    write: async (selection) => {
      const applied: Record<string, string> = {};
      const rejected: Record<string, string> = {};
      const propertyReceipts: StudioSetStyleResult["propertyReceipts"] = {};
      let weakest: StudioWriteAdapterSuccess<object> | null = null;
      for (const [property, value] of entries) {
        const outcome = await deps.setStyle(selection, property, value);
        if (!outcome.ok) {
          rejected[property] = outcome.reason;
          continue;
        }
        applied[property] = value;
        const receipt = outcome.persistence ? saved({}, outcome.persistence) : dispatched({}, true);
        propertyReceipts[property] = {
          stage: receipt.stage,
          changed: receipt.changed,
          evidence: receipt.evidence,
        };
        if (!weakest || weakest.stage !== "dispatched") weakest = receipt;
      }

      if (!weakest) {
        const reasons = Object.entries(rejected)
          .map(([property, reason]) => `${property}: ${reason}`)
          .join(", ");
        return toolFailure("blocked", `no style was applied (${reasons})`);
      }
      const value: StudioSetStyleResult = {
        applied,
        rejected,
        partial: Object.keys(rejected).length > 0,
        propertyReceipts,
      };
      const changed = Object.values(propertyReceipts).some((receipt) => receipt.changed);
      return weakest.stage === "dispatched"
        ? dispatched(value, changed)
        : { ...weakest, ...value, changed };
    },
  });
}

export const STUDIO_SET_TEXT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    text: { type: "string", description: "The new text content." },
    field: {
      type: "string",
      description:
        "Which text field to write, from studio_inspect. Omit for the element's own text.",
    },
  },
  required: ["handle", "text"],
  additionalProperties: false,
} as const;

export const STUDIO_SET_TEXT_DESCRIPTION = [
  "Set one element's text using its source-safe handle from studio_look.",
  "This is the edit a synthetic double-click cannot reach, because Studio's canvas",
  "takes pointer capture and recognises the double press itself.",
  "Returns `ok: true` with the resulting text and whether it changed, or `ok: false`",
  "with `kind`, `reason` and usually a `hint` naming what to do instead.",
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_SET_STYLE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    styles: {
      type: "object",
      description: 'CSS property to value, for example {"color": "red", "font-size": "48px"}.',
      additionalProperties: { type: "string" },
    },
  },
  required: ["handle", "styles"],
  additionalProperties: false,
} as const;

export const STUDIO_SET_STYLE_DESCRIPTION = [
  "Set inline styles on one element using its source-safe handle from studio_look.",
  "Each property is a separate commit, so N properties produce N undo entries.",
  "Position and size properties (left, top, width, height) are refused here on purpose;",
  "they belong to the transform tools.",
  "Returns `ok: true` with `applied` and `rejected` maps, so a partial success is visible",
  "as a partial success rather than reported as a whole one.",
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

function preDispatchFailure<T extends object>(
  operation: "set-text" | "set-style",
  failure: ToolFailure,
): StudioWriteResult<T> {
  return { ...failure, stage: "refused", operation };
}
