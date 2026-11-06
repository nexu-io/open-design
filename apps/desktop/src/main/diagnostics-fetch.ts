import { DIAGNOSTICS_EXPORT_PATH } from "@open-design/diagnostics";

export interface FetchDiagnosticsBundleDeps {
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch the complete diagnostics bundle from the daemon's own export endpoint
 * and return its bytes.
 *
 * The daemon is the single source of truth for the bundle: it resolves its real
 * `RUNTIME_DATA_DIR` (`.od` in tools-dev, `<namespaceRoot>/data` when packaged,
 * or any `OD_DATA_DIR` override) and from there collects per-run
 * `runs/<id>/events.jsonl`, the agent CLI logs (claude/codex/opencode/amr),
 * the sidecar daemon/web/desktop logs, and host crash reports. The desktop main
 * process used to rebuild this bundle itself, but it had to *guess* the data dir
 * from the sidecar namespace layout — a guess that is wrong in dev (the daemon
 * writes to `<projectRoot>/.od`, not `<namespaceRoot>/data`) and under any
 * `OD_DATA_DIR` override, silently dropping the run-event and AMR logs that are
 * the whole point of a support bundle. Delegating to the daemon endpoint removes
 * that drift entirely.
 */
export async function fetchDiagnosticsBundle(
  baseUrl: string,
  deps: FetchDiagnosticsBundleDeps = {},
): Promise<Buffer> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = new URL(DIAGNOSTICS_EXPORT_PATH, baseUrl).toString();
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`GET ${DIAGNOSTICS_EXPORT_PATH} failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
