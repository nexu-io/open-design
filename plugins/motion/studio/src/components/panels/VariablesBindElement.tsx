import { useI18n } from "../../i18n/I18n";
/**
 * "Bind selected element" card for the Variables panel — the promote-a-
 * property-to-variable gesture. Each action declares a variable whose default
 * is the element's current value, so binding to a NEW id never changes the
 * render. Binding to an EXISTING id instead wires the element to that
 * variable's current default (which came from another element) — the card
 * warns before committing, since that does change the render. The binding the
 * runtime resolves is written as a data-var-src / data-var-text attribute, or
 * a `<prop>: var(--id)` style.
 */

import { useMemo, useState } from "react";
import type { Composition, CompositionVariable } from "@hyperframes/sdk";
import type { DomEditSelection } from "../editor/domEditingTypes";

import { variableDefaultText, VARIABLES_INPUT_CLASS } from "./VariablesValueControls";

// <source> is deliberately excluded: rewriting a <source> child's src after
// the parent media element ran resource selection is a spec no-op.
const MEDIA_TAGS = new Set(["img", "video", "audio"]);

export interface BindAction {
  key: string;
  label: string;
  /** Binding channel: data-var-src / data-var-text attribute, or a style prop. */
  kind: "src" | "text" | "style";
  styleProp?: string;
  suggestedId: string;
  declaration: (id: string) => CompositionVariable;
}

function sanitizeId(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "variable";
}

/**
 * "rgb(0, 195, 255)" / "rgba(0, 195, 255, 0.4)" → "#00c3ff". Alpha is dropped
 * (color variables are hex) — a fully transparent computed color maps to
 * #000000, which the picker can at least display. Unrecognized formats pass
 * through verbatim.
 */
export function rgbToHex(value: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(value);
  if (!m) return value;
  return `#${m
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

function firstFontFamily(value: string): string {
  const first = value.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "") || "sans-serif";
}

// fallow-ignore-next-line complexity
export function buildBindActions(
  selection: DomEditSelection,
  sdkSession: Composition,
): BindAction[] {
  const hfId = selection.hfId;
  if (!hfId) return [];
  // No snapshot = the session can't resolve this element (e.g. a sub-comp
  // element that missed the source map) — a bind would target the wrong
  // document or dead-end, so offer nothing.
  const snapshot = sdkSession.getElement(hfId);
  if (!snapshot) return [];
  const base = sanitizeId(snapshot.attributes.id ?? selection.label ?? hfId);
  const actions: BindAction[] = [];

  const tag = selection.tagName.toLowerCase();
  if (MEDIA_TAGS.has(tag)) {
    const currentSrc = snapshot.attributes.src ?? "";
    actions.push({
      key: "src",
      label: tag === "img" ? "Image source" : "Media source",
      kind: "src",
      suggestedId: base,
      declaration: (id) =>
        tag === "img"
          ? { id, type: "image", label: `${selection.label} image`, default: currentSrc }
          : { id, type: "string", label: `${selection.label} source`, default: currentSrc },
    });
  }

  // Text binds only on leaf elements: the runtime preserves children, but a
  // container's "own text" default rarely matches what the user sees, so the
  // promote-never-changes-the-render guarantee only holds for leaves.
  const text = (snapshot.text ?? "").trim();
  if (text && snapshot.children.length === 0 && !selection.isCompositionHost) {
    actions.push({
      key: "text",
      label: "Text",
      kind: "text",
      suggestedId: `${base}-text`,
      declaration: (id) => ({
        id,
        type: "string",
        label: `${selection.label} text`,
        default: text,
      }),
    });
  }

  if (selection.capabilities.canEditStyles) {
    const computed = selection.computedStyles;
    actions.push(
      {
        key: "color",
        label: "Text color",
        kind: "style",
        styleProp: "color",
        suggestedId: `${base}-color`,
        declaration: (id) => ({
          id,
          type: "color",
          label: `${selection.label} color`,
          default: rgbToHex(computed["color"] ?? "#000000"),
        }),
      },
      {
        key: "background",
        label: "Background",
        kind: "style",
        styleProp: "background-color",
        suggestedId: `${base}-bg`,
        declaration: (id) => ({
          id,
          type: "color",
          label: `${selection.label} background`,
          default: rgbToHex(computed["background-color"] ?? "#000000"),
        }),
      },
      {
        key: "font",
        label: "Font",
        kind: "style",
        styleProp: "font-family",
        suggestedId: `${base}-font`,
        declaration: (id) => ({
          id,
          type: "font",
          label: `${selection.label} font`,
          default: firstFontFamily(computed["font-family"] ?? "sans-serif"),
        }),
      },
    );
  }

  return actions;
}

/** One batched schema edit: declare (unless the id already exists) + bind. */
export function applyBind(
  session: Composition,
  hfId: string,
  action: BindAction,
  id: string,
): void {
  session.batch(() => {
    if (!session.getVariableDeclarations().some((d) => d.id === id)) {
      session.declareVariable(action.declaration(id));
    }
    if (action.kind === "style" && action.styleProp) {
      session.setStyle(hfId, { [action.styleProp]: `var(--${id})` });
    } else {
      session.setAttribute(hfId, `data-var-${action.kind}`, id);
    }
  });
}

export function VariablesBindElement({
  selection,
  sdkSession,
  onBind,
}: {
  selection: DomEditSelection;
  sdkSession: Composition;
  onBind: (action: BindAction, id: string) => void;
}) {
  const { t } = useI18n();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [idDraft, setIdDraft] = useState("");
  const actions = useMemo(() => buildBindActions(selection, sdkSession), [selection, sdkSession]);
  if (actions.length === 0) return null;
  const active = actions.find((a) => a.key === activeKey) ?? null;

  const trimmedId = sanitizeId(idDraft);
  const idIsEmpty = idDraft.trim().length === 0;
  // Binding to an id that already exists wires the element to THAT variable's
  // existing default (declared from a different element), so the render changes
  // silently. Surface it before the user commits rather than after.
  const existingDecl = active
    ? sdkSession.getVariableDeclarations().find((d) => d.id === trimmedId)
    : undefined;

  return (
    <div className="space-y-1.5 rounded-lg border border-studio-accent/30 bg-neutral-900/40 p-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-neutral-500">
        {t("Bind selected:")}{" "}<span className="normal-case text-neutral-300">{selection.label}</span>
      </p>
      {active ? (
        <div className="space-y-1.5">
          <label className="text-[9px] font-medium text-neutral-500">
            {t("Variable id for")}{" "}{active.label.toLowerCase()}
          </label>
          <input
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setActiveKey(null)}
            className={`${VARIABLES_INPUT_CLASS} font-mono`}
          />
          {existingDecl && (
            <p className="text-[9px] leading-snug text-warning-ink">
              "{trimmedId}{t("\" already exists. This element will use its current value")}{" "}{existingDecl.default !== undefined && (
                <span className="font-mono"> ({variableDefaultText(existingDecl)})</span>
              )}
              {t(", not the element's own, so binding won't change \"")}{trimmedId}".
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActiveKey(null)}
              className="h-6 rounded-sm px-2 text-[10px] text-neutral-500 hover:text-neutral-300"
            >
              {t("Cancel")}</button>
            <button
              type="button"
              disabled={idIsEmpty}
              onClick={() => {
                setActiveKey(null);
                onBind(active, trimmedId);
              }}
              className="h-6 rounded-sm bg-neutral-800 px-2 text-[10px] font-medium text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {existingDecl ? t("Bind anyway") : t("Bind")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => {
                setActiveKey(action.key);
                setIdDraft(action.suggestedId);
              }}
              className="h-6 rounded-md border border-neutral-800 px-2 text-[10px] font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
            >
              {action.label} →&nbsp;variable
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
