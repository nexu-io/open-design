// ---------------------------------------------------------------------------
// A short trail of what the user did before they reported something.
//
// A feedback comment says what went wrong; it almost never says how to get
// there. This is the missing half. Every `studio_*` event already flows through
// one funnel (`trackEvent`), so recording the trail costs one call there and no
// new instrumentation anywhere else — and it stays correct as events are added.
//
// PRIVACY: names and numbers only. Values are copied from a fixed allowlist of
// short, low-cardinality keys, so free text (comments, file paths, composition
// content) can never reach the trail even if some future event carries it.
// ---------------------------------------------------------------------------

/** Enough to cover the run-up to a failure without bloating the payload. */
const LIMIT = 14;

/**
 * Keys worth keeping alongside an event name. Each is a short enum-ish
 * discriminator: `tab_switch` alone says little, `tab_switch:renders` says
 * where they were. Anything not on this list is dropped, not truncated.
 */
const DETAIL_KEYS = [
  "action",
  "tab",
  "panel",
  "status",
  "mode",
  "reason",
  "format",
  "via",
] as const;

interface Crumb {
  at: number;
  label: string;
}

const trail: Crumb[] = [];
const startedAt = Date.now();

function detailFor(properties: Record<string, unknown>): string {
  for (const key of DETAIL_KEYS) {
    const value = properties[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 24) return `:${value}`;
    if (typeof value === "number" || typeof value === "boolean") return `:${String(value)}`;
  }
  return "";
}

export function recordBreadcrumb(event: string, properties: Record<string, unknown>): void {
  // `studio:` and `studio_` prefixes are noise in a 14-item trail.
  const name = event.replace(/^studio[:_]/, "");
  trail.push({ at: Date.now() - startedAt, label: `${name}${detailFor(properties)}` });
  if (trail.length > LIMIT) trail.shift();
}

/**
 * The trail as one line, oldest first, each entry stamped with seconds since
 * the tab opened: `2.1 session_start > 48.7 render_start > 71.2 save_failure`.
 * A single string rather than an array so it stays readable in a PostHog cell
 * and in whatever the report is pasted into.
 */
export function breadcrumbTrail(): string {
  return trail.map((c) => `${(c.at / 1000).toFixed(1)} ${c.label}`).join(" > ");
}

/** Test seam. Production never clears the trail; it rolls. */
export function resetBreadcrumbs(): void {
  trail.length = 0;
}
