import { useI18n } from "../../i18n/I18n";
/**
 * Wraps a Design-panel property control with the promote-to-variable gesture.
 * When a control can be promoted it shows a visible "◇ var" button; clicking it
 * declares a variable (default = current value, so the render is unchanged) and
 * binds this property to it. Once bound, the button is replaced by a "◆ {id}"
 * chip and edits route to the variable's default (edit-in-place). Controls that
 * aren't eligible (or render outside a promote context, or are disabled by the
 * caller) pass through untouched. Uses a render-prop so each control keeps its
 * own value/onCommit shape.
 */

import { useEffect } from "react";
import {
  useVariablePromoteChannel,
  type PromoteChannel,
} from "../../contexts/VariablePromoteContext";

interface RenderArgs {
  /** When bound, the variable's default to display; otherwise undefined. */
  value?: string;
  /** When bound, routes commits to the variable default; otherwise undefined. */
  onCommit?: (value: string) => void;
  bound: boolean;
}

export function PromotableControl({
  channel,
  enabled = true,
  children,
}: {
  channel: PromoteChannel;
  /**
   * Caller-side gate. Text-section controls only promote when the edited field
   * is the selected element's OWN text (source "self"); binding a child/text-
   * node field would target a different element than the control edits.
   */
  enabled?: boolean;
  children: (args: RenderArgs) => React.ReactNode;
}) {
  const { t } = useI18n();
  const promote = useVariablePromoteChannel(channel);

  // A binding attribute (`data-var-*` / `var(--id)`) pointing at a declaration
  // that no longer exists renders as a plain unbound control — a silent
  // fallback that leaves a dev wondering why "their binding isn't showing".
  // Surface it in the console so the dangling reference is discoverable.
  const danglingId =
    enabled && promote && promote.boundId != null && promote.declaration == null
      ? promote.boundId
      : null;
  useEffect(() => {
    if (danglingId != null) {
      console.warn(
        `[hyperframes] Control is bound to variable "${danglingId}", but no such declaration exists. The element still carries the binding on disk. Re-declare the variable or unbind the element.`,
      );
    }
  }, [danglingId]);

  if (!promote || !enabled) return <>{children({ bound: false })}</>;

  // A binding whose declaration was removed elsewhere is dangling: don't show
  // it as an editable bound control (setDefault would silently no-op) — let it
  // fall back to a plain, re-promotable control.
  const bound = promote.boundId != null && promote.declaration != null;
  const canPromote = promote.action != null && !bound;
  const defaultValue = promote.declaration?.default;

  const rendered = children(
    bound
      ? {
          // Only string defaults render inline; a FontValue/ImageValue object
          // falls back to the element's real value instead of "[object Object]".
          value: typeof defaultValue === "string" ? defaultValue : undefined,
          onCommit: promote.setDefault,
          bound: true,
        }
      : { bound: false },
  );

  return (
    <div className={`relative ${bound ? "rounded-lg ring-1 ring-studio-accent/40" : ""}`}>
      {rendered}
      {bound && (
        <span
          // Sits above the row (not on top of top-0) so it clears a value that
          // renders flush to the row's right edge, e.g. flat Font/Color rows.
          className="pointer-events-none absolute -top-2 right-1.5 z-10 inline-flex max-w-[60%] items-center gap-1 truncate rounded-sm bg-studio-accent/20 px-1 py-px font-mono text-[8px] font-medium text-accent-ink"
          title={t("Bound to variable \"{value0}\"", { value0: promote.boundId ?? "" })}
        >
          ◆ {promote.boundId}
        </span>
      )}
      {canPromote && (
        <button
          type="button"
          title={t("Make this a variable")}
          onClick={(e) => {
            e.stopPropagation();
            promote.promote();
          }}
          className="absolute -top-2 right-1.5 z-10 inline-flex items-center gap-1 rounded-sm bg-raised/80 px-1 py-px font-mono text-[8px] font-medium text-neutral-400 opacity-70 transition-colors hover:bg-studio-accent/20 hover:text-accent-ink hover:opacity-100"
        >
          ◇ var
        </button>
      )}
    </div>
  );
}
