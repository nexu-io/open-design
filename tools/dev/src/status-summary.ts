import { asRecord, numberField, stringField } from "./record-fields.js";

/**
 * Render one app status snapshot as the single line `tools-dev` prints.
 *
 * Lives outside `index.ts` because that module runs `cli.parse()` on import, so
 * the status line can only be covered by a test if the formatter is importable
 * on its own.
 */
export function formatStatusSummary(status: unknown): string {
  const record = asRecord(status);
  if (record == null) return "status unavailable";

  const parts = [stringField(record, "state") ?? "unknown"];
  const url = stringField(record, "url");
  const pid = numberField(record, "pid");
  // The sidecar reports the bundler it actually resolved: a reused sidecar was
  // started by an earlier invocation, so no caller-side environment can answer
  // which bundler the running process is on.
  const bundler = stringField(record, "bundler");
  const title = stringField(record, "title");
  const windowVisible = record.windowVisible;
  if (url != null) parts.push(url);
  if (pid != null) parts.push(`pid ${pid}`);
  if (bundler != null) parts.push(bundler);
  if (title != null) parts.push(`title ${JSON.stringify(title)}`);
  if (typeof windowVisible === "boolean") parts.push(`window ${windowVisible ? "visible" : "hidden"}`);

  return parts.join(" · ");
}
