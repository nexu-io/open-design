// Pure core of the desktop invite hand-off — no electron import, so it is unit
// testable. The electron scheme registration lives in `invite-deeplink.ts`.

export const INVITE_DEEPLINK_SCHEME = "opendesign";
const INVITE_DEEPLINK_HOST = "workspace";
const INVITE_DEEPLINK_PATH = "/invite/continue";

interface ParsedInviteDeeplink {
  workspaceId: string;
  memberId: string;
  inviteId: string;
  nonce: string;
}

/**
 * Parse `opendesign://workspace/invite/continue?workspace_id=&member_id=&invite_id=
 * &nonce=` into its four required fields, or null if the scheme/host/path is wrong
 * or any field is missing. The desktop only forwards the nonce to the daemon, but
 * all four are validated so a malformed deeplink is rejected rather than
 * half-handled. The payload shape is fixed by the B-C invite contract; the daemon
 * and web share the same fields.
 */
function parseInviteDeeplink(url: string): ParsedInviteDeeplink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${INVITE_DEEPLINK_SCHEME}:`) return null;
  if (parsed.host !== INVITE_DEEPLINK_HOST) return null;
  if (parsed.pathname.replace(/\/+$/, "") !== INVITE_DEEPLINK_PATH) return null;
  const q = parsed.searchParams;
  const workspaceId = q.get("workspace_id")?.trim() ?? "";
  const memberId = q.get("member_id")?.trim() ?? "";
  const inviteId = q.get("invite_id")?.trim() ?? "";
  const nonce = q.get("nonce")?.trim() ?? "";
  if (!workspaceId || !memberId || !inviteId || !nonce) return null;
  return { workspaceId, memberId, inviteId, nonce };
}

export interface InviteDeeplinkDeps {
  /** Resolve the running daemon's base URL; rejects when it is not up yet. */
  resolveDaemonBaseUrl: () => Promise<string>;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Bring the app to the foreground after a successful hand-off. */
  focus?: () => void;
  /** Fired with the resolved workspace context on success (e.g. to nudge the web). */
  onActivated?: (context: unknown) => void;
}

type ContinueInvite = (
  url: string,
  deps: InviteDeeplinkDeps,
) => Promise<{ ok: boolean; reason?: string; status?: number }>;

/**
 * Queue OS deeplinks that arrive before the desktop runtime can resolve the
 * daemon URL. macOS can deliver `open-url` during cold start, before the app has
 * finished constructing the daemon/web bridge; dropping that URL would strand
 * the accepted invite on the cloud success page.
 */
export function createInviteDeeplinkDispatcher(
  continueInvite: ContinueInvite = continueInviteFromUrl,
) {
  let deps: InviteDeeplinkDeps | null = null;
  const pending: string[] = [];

  const dispatch = (url: string | null) => {
    if (!url) return;
    if (!deps) {
      pending.push(url);
      return;
    }
    void continueInvite(url, deps);
  };

  return {
    dispatch,
    setDeps(nextDeps: InviteDeeplinkDeps) {
      deps = nextDeps;
      const queued = pending.splice(0);
      for (const url of queued) dispatch(url);
    },
    pendingCount() {
      return pending.length;
    },
  };
}

/** Extract an `opendesign://` url from a process argv list, if present. */
export function findDeeplinkArg(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${INVITE_DEEPLINK_SCHEME}://`)) ?? null;
}

/**
 * Parse an invite deeplink and consume it via the daemon. Returns the outcome (or
 * a reason it did nothing) and never throws, so the app's url handlers stay safe.
 */
export async function continueInviteFromUrl(
  url: string,
  deps: InviteDeeplinkDeps,
): Promise<{ ok: boolean; reason?: string; status?: number }> {
  const parsed = parseInviteDeeplink(url);
  if (!parsed) return { ok: false, reason: "not_an_invite_deeplink" };
  let baseUrl: string;
  try {
    baseUrl = await deps.resolveDaemonBaseUrl();
  } catch {
    return { ok: false, reason: "daemon_unavailable" };
  }
  const fetchImpl = deps.fetch ?? fetch;
  try {
    const response = await fetchImpl(new URL("/api/workspace/invite/continue", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce: parsed.nonce }),
    });
    if (!response.ok) return { ok: false, reason: "consume_failed", status: response.status };
    const body = (await response.json()) as { context?: unknown };
    deps.onActivated?.(body.context ?? null);
    deps.focus?.();
    return { ok: true };
  } catch {
    // The web success page keeps a retry-open affordance, so a transient failure
    // here is recoverable — never throw into the app's url handlers.
    return { ok: false, reason: "unreachable" };
  }
}
