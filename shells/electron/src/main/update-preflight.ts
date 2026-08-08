export type UpdateActionRequest = {
  force: boolean;
  source: string | null;
};

export type UpdateRestartSafety =
  | { activeRunCount: 0; state: "clear" }
  | { activeRunCount: number; state: "blocked" }
  | { activeRunCount: null; reason: string; state: "unknown" };

export const UPDATE_RESTART_BLOCKED_ERROR_CODE = "active-runs-blocked";
export const UPDATE_RESTART_UNKNOWN_ERROR_CODE = "active-runs-unknown";

export function updateRestartSafetyError(safety: Exclude<UpdateRestartSafety, { state: "clear" }>): {
  code: string;
  details: { activeRunCount: number | null };
  message: string;
} {
  if (safety.state === "blocked") {
    return {
      code: UPDATE_RESTART_BLOCKED_ERROR_CODE,
      details: { activeRunCount: safety.activeRunCount },
      message: `Open Design is still working on ${safety.activeRunCount} active task${safety.activeRunCount === 1 ? "" : "s"}.`,
    };
  }
  return {
    code: UPDATE_RESTART_UNKNOWN_ERROR_CODE,
    details: { activeRunCount: null },
    message: "Open Design could not confirm whether tasks are still running.",
  };
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function parseUpdateActionRequest(input: unknown): UpdateActionRequest {
  if (!isRecord(input) || !isRecord(input.payload)) return { force: false, source: null };
  const source = input.payload.source;
  return {
    force: input.payload.force === true,
    source:
      typeof source === "string" && source.length > 0 && source.length <= 80 && /^[a-z0-9:_-]+$/i.test(source)
        ? source
        : null,
  };
}

export async function checkUpdateRestartSafety(input: {
  discoverDaemonBaseUrl: () => Promise<string>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<UpdateRestartSafety> {
  try {
    const baseUrl = (await input.discoverDaemonBaseUrl()).replace(/\/$/, "");
    if (baseUrl.length === 0) throw new Error("daemon URL is unavailable");
    const response = await (input.fetchImpl ?? fetch)(`${baseUrl}/api/runs?status=active`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 1500),
    });
    if (!response.ok) throw new Error(`active runs request failed with ${response.status}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.runs)) {
      throw new Error("active runs response is invalid");
    }
    const activeRunCount = payload.runs.length;
    return activeRunCount === 0
      ? { activeRunCount: 0, state: "clear" }
      : { activeRunCount, state: "blocked" };
  } catch (error) {
    return {
      activeRunCount: null,
      reason: error instanceof Error ? error.message : String(error),
      state: "unknown",
    };
  }
}
