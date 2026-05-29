import { execAgentFile } from './invocation.js';
import type { RuntimeEnv } from './types.js';

export type AgentAuthProbeResult = {
  status: 'ok' | 'missing' | 'unknown';
  message?: string;
  // Output captured from the probe child process (e.g.
  // `cursor-agent status`). Exposed so callers like the connection
  // test layer can fold the probe's own stderr/exit context into their
  // structured diagnostics — the probe runs before the smoke spawn,
  // so without this the diagnostics block would otherwise drop the
  // probe output entirely.
  stdoutTail?: string;
  stderrTail?: string;
  exitCode?: number | null;
  signal?: string | null;
};

const CURSOR_AUTH_GUIDANCE =
  'Cursor Agent is not authenticated. Run `cursor-agent login`, then `cursor-agent status`, and retry. For automation, ensure CURSOR_API_KEY is set in the Open Design process environment.';

const DEEPSEEK_AUTH_GUIDANCE =
  'DeepSeek TUI is installed but is not authenticated. Add or verify your API key in `~/.deepseek/config.toml` as `api_key = "..."`, or expose DEEPSEEK_API_KEY to the Open Design daemon process, then retry. If Open Design is launched outside an interactive shell, shell rc files such as ~/.zshrc may not be loaded.';

// agy's print mode (`-p`) detects a missing OAuth token, prints the
// Google sign-in URL to stdout, waits 30s for completion, then exits
// "Error: authentication timed out." That URL points at a callback page
// that asks the user to paste the resulting auth code BACK into agy —
// which only works in the interactive TUI. So in OD's chat, surfacing
// the raw URL is a dead end (no input field to paste the code into).
// Instead we ask the user to run `agy` in a terminal once, which opens
// the browser, completes OAuth, and writes the credentials to the
// system keyring — both `-p` and TUI invocations read from there
// afterward, so the chat run can succeed on retry.
const ANTIGRAVITY_AUTH_GUIDANCE =
  'Antigravity needs to sign in. The agy CLI\'s keyring entry has expired or been cleared, and `-p` print mode cannot complete OAuth on its own (it has no field to paste the auth code into).\n\nFix: open a terminal and run `agy` once — it will open Google sign-in in your browser, accept the redirect, and store the token in your system keyring. After you finish, return here and retry this chat. You only need to do this once; the keyring entry persists across both terminal and Open Design runs.';

// agy's account-level quota is per-model (consumer accounts get a
// separate quota for Gemini 3 Pro vs Flash vs Claude vs GPT-OSS), and
// when exhausted the upstream returns
//   RESOURCE_EXHAUSTED (code 429): Individual quota reached. Contact
//   your administrator to enable overages. Resets in <H>h<M>m<S>s.
// to the `--log-file`. Print mode emits nothing on stdout/stderr, so
// without log inspection the daemon misreads it as missing-OAuth.
// Guidance points the user at agy's TUI Switch-Model picker because
// (a) different models have separate quotas, and (b) we can't drive
// the picker from OD until upstream issue #35 ships a `--model`
// flag — see antigravity.ts notes.
const ANTIGRAVITY_QUOTA_GUIDANCE =
  'Antigravity returned "RESOURCE_EXHAUSTED: Individual quota reached" for the current model. Each Antigravity model (Gemini 3 Pro / Flash, Claude 4.6, GPT-OSS) has its own quota.\n\nFix: open `agy` in a terminal and use its Switch Model picker (the menu at the bottom of the TUI) to pick a model with available quota, then retry here. Open Design uses whatever model you pick in agy\'s TUI when the Settings model picker is left on "Default". Quotas reset automatically on Antigravity\'s schedule.';

const REASONIX_AUTH_GUIDANCE =
  'DeepSeek Reasonix is installed but is not authenticated. Add your API key in `~/.reasonix/config.json` under `apiKey`, or expose DEEPSEEK_API_KEY to the Open Design daemon process, then retry. If Open Design is launched outside an interactive shell, shell rc files such as ~/.zshrc may not be loaded.';

export function cursorAuthGuidance(): string {
  return CURSOR_AUTH_GUIDANCE;
}

export function deepseekAuthGuidance(): string {
  return DEEPSEEK_AUTH_GUIDANCE;
}

export function antigravityAuthGuidance(): string {
  return ANTIGRAVITY_AUTH_GUIDANCE;
}

export function antigravityQuotaGuidance(): string {
  return ANTIGRAVITY_QUOTA_GUIDANCE;
}

export function reasonixAuthGuidance(): string {
  return REASONIX_AUTH_GUIDANCE;
}

export function isCursorAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  return (
    /authentication required/i.test(value) ||
    /not authenticated/i.test(value) ||
    /not logged in/i.test(value) ||
    /unauthenticated/i.test(value) ||
    /agent login/i.test(value) ||
    /cursor_api_key/i.test(value)
  );
}

// agy's plain-mode output when no keyring credentials are available:
//   - Top of stdout: "Authentication required. Please visit the URL to log in: <URL>"
//   - Tail of stdout: "Waiting for authentication (timeout 30s)..."
//                      "Error: authentication timed out."
// The same TUI text is logged by `agy --log-file` as
//   "You are not logged into Antigravity" and
//   "error getting token source: You are not logged into Antigravity"
// (confirmed via the `--log-file` dump on a cleared keyring). Any of
// these is sufficient signal — match conservatively so the regex
// doesn't fire on prose containing the word "authentication" by accident.
export function isAntigravityAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  return (
    /authentication required.*please visit/i.test(value) ||
    /authentication timed out/i.test(value) ||
    /not logged into antigravity/i.test(value) ||
    /accounts\.google\.com\/o\/oauth2\/auth.*antigravity/i.test(value)
  );
}

export function isDeepSeekAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  return (
    /KEY=<your-key>/i.test(value) ||
    /api_key\s*=\s*["']<your-key>["']/i.test(value) ||
    (/~\/\.deepseek\/config\.toml/i.test(value) && /api[_ -]?key|KEY=/i.test(value)) ||
    (/DEEPSEEK_API_KEY/i.test(value) &&
      /auth|api[_ -]?key|missing|not set|required|unauthorized/i.test(value))
  );
}

export function isReasonixAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  return (
    /~\/\.reasonix\/config\.json/i.test(value) &&
    /api[_ -]?key|missing|not set|required|unauthorized|invalid/i.test(value)
  ) || (
    /DEEPSEEK_API_KEY/i.test(value) &&
    /auth|missing|not set|required|unauthorized|invalid/i.test(value)
  );
}

export function classifyAgentAuthFailure(
  agentId: string,
  text: string,
): AgentAuthProbeResult | null {
  if (agentId === 'cursor-agent') {
    if (!isCursorAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: cursorAuthGuidance(),
    };
  }
  if (agentId === 'deepseek') {
    if (!isDeepSeekAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: deepseekAuthGuidance(),
    };
  }
  if (agentId === 'antigravity') {
    if (!isAntigravityAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: antigravityAuthGuidance(),
    };
  }
  if (agentId === 'reasonix') {
    if (!isReasonixAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: reasonixAuthGuidance(),
    };
  }
  return null;
}

// Model-service failure classes that map a CLI agent's raw error text to a
// structured API error code. `classifyAgentAuthFailure` only covers the two
// agents (cursor-agent, deepseek) that ship a tailored sign-in hint; every
// other CLI agent (Claude Code, codex, …) used to collapse auth / quota /
// upstream failures into the generic `AGENT_EXECUTION_FAILED`. This agent-
// agnostic, text-based classifier recovers the specific class so the chat
// shows an accurate reason — and so the hosted-AMR nudge can key off it.
export type AgentServiceFailureCode =
  | 'AGENT_AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE';

// A bare HTTP status number (`500`, `429`, …) is too noisy to trust on its own
// — agent stderr is full of unrelated numbers (`line 500`, `read 502 bytes`,
// `took 503ms`, `exit code 401`, `process exited with code 429`). Only treat a
// status number as a signal when it carries explicit HTTP-status context
// (`HTTP 500`, `status 429`, `status code 401`, `error code 502`,
// `server error 503`, or a punctuation-bound `code: 401`). Crucially `code`
// alone is NOT enough — that would still match process-exit lines like `exit
// code 401`; it only counts when qualified (status/error/response code) or
// immediately followed by `:`/`=`/`#`. Phrasing per review on #3083.
const STATUS_CTX =
  '(?:' +
  '\\bhttp(?:[ /]?\\d(?:\\.\\d)?)?\\b' + // HTTP, HTTP/1.1
  '|\\b(?:status|error|response)(?:[ _-]?code)?\\b' + // status / status code / error code / response code
  '|\\bcode(?=\\s*[:=#])' + // code: 401 / code=429  (NOT "exit code 401")
  '|\\b(?:server|http)[ _-]?error\\b' + // server error / http error
  ')[\\s:=#-]*';

// Authentication / authorization: a missing, invalid, or expired credential.
const AGENT_AUTH_FAILURE_RE = new RegExp(
  `(\\b(unauthor(?:ized|ised)|authenticat(?:e|ed|ion)|invalid[ _-]?(?:api[ _-]?)?key|incorrect api key|x-api-key|not (?:authenticated|logged[ _-]?in)|please (?:sign|log)[ _-]?in|oauth token (?:has )?expired|session expired|credentials? (?:are )?(?:missing|invalid|required))\\b|\\/login\\b|${STATUS_CTX}401\\b)`,
  'i',
);

// Quota / rate limit / billing balance — the wall the hosted gateway avoids.
const AGENT_RATE_FAILURE_RE = new RegExp(
  `(\\b(rate[ _-]?limit|too many requests|quota|insufficient[ _-]?(?:quota|balance|credit|funds)|credit balance is too low|exceeded your current quota|usage limit|billing (?:hard )?limit)\\b|${STATUS_CTX}429\\b)`,
  'i',
);

// Upstream model/provider problems: overloaded, 5xx, temporarily unavailable.
const AGENT_UPSTREAM_FAILURE_RE = new RegExp(
  `(\\b(overloaded(?:_error)?|service (?:is )?(?:temporarily )?unavailable|bad gateway|gateway timeout|internal server error|upstream (?:error|unavailable)|provider (?:error|unavailable)|temporarily unavailable|model is currently overloaded|5xx)\\b|${STATUS_CTX}5\\d\\d\\b|\\b5\\d\\d\\s+(?:bad gateway|service unavailable|internal server error|gateway timeout))`,
  'i',
);

// Returns the model-service failure class implied by an agent's combined
// stdout/stderr/error text, or null when the text looks like an ordinary
// process failure. Auth is checked before rate/upstream so a `401` is never
// misread as a `5xx`. Pure text match — no agent-specific assumptions — so it
// applies uniformly to any CLI agent.
export function classifyAgentServiceFailure(
  text: string,
): AgentServiceFailureCode | null {
  const value = String(text || '');
  if (!value.trim()) return null;
  if (AGENT_AUTH_FAILURE_RE.test(value)) return 'AGENT_AUTH_REQUIRED';
  if (AGENT_RATE_FAILURE_RE.test(value)) return 'RATE_LIMITED';
  if (AGENT_UPSTREAM_FAILURE_RE.test(value)) return 'UPSTREAM_UNAVAILABLE';
  return null;
}

// Tail length matches the smoke-test sink so the diagnostics block
// stays compact when it folds probe output back into its overrides.
const PROBE_TAIL_BYTES = 400;

function tailString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > PROBE_TAIL_BYTES ? trimmed.slice(-PROBE_TAIL_BYTES) : trimmed;
}

function withProbeTails(
  base: AgentAuthProbeResult,
  stdoutText: string,
  stderrText: string,
): AgentAuthProbeResult {
  const result: AgentAuthProbeResult = { ...base };
  const stdoutTail = tailString(stdoutText);
  const stderrTail = tailString(stderrText);
  if (stdoutTail) result.stdoutTail = stdoutTail;
  if (stderrTail) result.stderrTail = stderrTail;
  return result;
}

export async function probeAgentAuthStatus(
  agentId: string,
  resolvedBin: string,
  env: RuntimeEnv,
): Promise<AgentAuthProbeResult | null> {
  if (agentId !== 'cursor-agent') return null;
  try {
    const { stdout, stderr } = await execAgentFile(resolvedBin, ['status'], {
      env,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const stdoutText = typeof stdout === 'string' ? stdout : '';
    const stderrText = typeof stderr === 'string' ? stderr : '';
    const output = `${stdoutText}\n${stderrText}`;
    if (isCursorAuthFailureText(output)) {
      return withProbeTails(
        { status: 'missing', message: cursorAuthGuidance(), exitCode: 0, signal: null },
        stdoutText,
        stderrText,
      );
    }
    return { status: 'ok' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: unknown;
      stderr?: unknown;
      code?: string | number;
      signal?: string;
    };
    const stdoutText = typeof err.stdout === 'string' ? err.stdout : '';
    const stderrText = typeof err.stderr === 'string' ? err.stderr : '';
    const output = [err.message, stdoutText, stderrText].join('\n');
    // util.promisify(execFile) attaches `code` and `signal` to the
    // rejection error. `code` may be a number (real non-zero exit) or
    // a Node ErrnoException string ("ENOENT"); only the numeric form
    // is meaningful as an exit code.
    const numericExit = typeof err.code === 'number' ? err.code : null;
    const childSignal = typeof err.signal === 'string' ? err.signal : null;
    if (isCursorAuthFailureText(output)) {
      return withProbeTails(
        {
          status: 'missing',
          message: cursorAuthGuidance(),
          exitCode: numericExit,
          signal: childSignal,
        },
        stdoutText,
        stderrText,
      );
    }
    return withProbeTails(
      {
        status: 'unknown',
        message: 'Cursor Agent authentication status could not be verified with `cursor-agent status`.',
        exitCode: numericExit,
        signal: childSignal,
      },
      stdoutText,
      stderrText,
    );
  }
}
