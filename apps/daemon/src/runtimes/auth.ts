import { execAgentFile } from './invocation.js';
import { readCodexProviderEnvKey } from '../codex-config-normalize.js';
import { reportsPlatformProviderCredentialFault } from '../integrations/vela-errors.js';
import type { RuntimeAgentDef, RuntimeEnv } from './types.js';

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
  'Cursor Agent is not authenticated. Run `cursor-agent login`, then `cursor-agent status`, and retry. For automation, ensure CURSOR_API_KEY is set in the OpenDesign process environment.';

const DEEPSEEK_AUTH_GUIDANCE =
  'DeepSeek TUI is installed but is not authenticated. Add or verify your API key in `~/.deepseek/config.toml` as `api_key = "..."`, or expose DEEPSEEK_API_KEY to the OpenDesign daemon process, then retry. If OpenDesign is launched outside an interactive shell, shell rc files such as ~/.zshrc may not be loaded.';

const DEEPSEEK_HARNESS_AUTH_GUIDANCE =
  'DeepSeek Harness has no model API key configured. Open a terminal and run `dsh web`, then open Settings → Models and add your DeepSeek API key. Return to OpenDesign and retry. For automation, expose DEEPSEEK_API_KEY to the OpenDesign process.';

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
  'Antigravity needs to sign in. The agy CLI\'s keyring entry has expired or been cleared, and `-p` print mode cannot complete OAuth on its own (it has no field to paste the auth code into).\n\nFix: open a terminal and run `agy` once — it will open Google sign-in in your browser, accept the redirect, and store the token in your system keyring. After you finish, return here and retry this chat. You only need to do this once; the keyring entry persists across both terminal and OpenDesign runs.';

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
  'Antigravity returned "RESOURCE_EXHAUSTED: Individual quota reached" for the current model. Each Antigravity model (Gemini 3 Pro / Flash, Claude 4.6, GPT-OSS) has its own quota.\n\nFix: open `agy` in a terminal and use its Switch Model picker (the menu at the bottom of the TUI) to pick a model with available quota, then retry here. OpenDesign uses whatever model you pick in agy\'s TUI when the Settings model picker is left on "Default". Quotas reset automatically on Antigravity\'s schedule.';

const REASONIX_AUTH_GUIDANCE =
  'DeepSeek Reasonix is installed but is not authenticated. Add your API key in `~/.reasonix/config.json` under `apiKey`, or expose DEEPSEEK_API_KEY to the OpenDesign daemon process, then retry. If OpenDesign is launched outside an interactive shell, shell rc files such as ~/.zshrc may not be loaded.';

const CLAUDE_AUTH_GUIDANCE =
  'Claude Code is installed but is not authenticated. Run `claude auth login` or open `claude` and complete login in a terminal, then rescan. If OpenDesign was launched outside an interactive shell, your shell rc files (e.g. ~/.zshrc) may not be loaded into its environment.';

export function cursorAuthGuidance(): string {
  return CURSOR_AUTH_GUIDANCE;
}

export function deepseekAuthGuidance(): string {
  return DEEPSEEK_AUTH_GUIDANCE;
}

export function deepseekHarnessAuthGuidance(): string {
  return DEEPSEEK_HARNESS_AUTH_GUIDANCE;
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

export function claudeAuthGuidance(): string {
  return CLAUDE_AUTH_GUIDANCE;
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
    /\b(?:MISSING_CREDENTIAL|DSH_PROVIDER_AUTH_FAILED)\b/i.test(value) ||
    /KEY=<your-key>/i.test(value) ||
    /api_key\s*=\s*["']<your-key>["']/i.test(value) ||
    (/~\/\.deepseek\/config\.toml/i.test(value) && /api[_ -]?key|KEY=/i.test(value)) ||
    (/DEEPSEEK_API_KEY/i.test(value) &&
      /auth|api[_ -]?key|missing|not set|required|unauthorized/i.test(value))
  );
}

type UnknownRecord = Record<string, unknown>;

function unknownRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as UnknownRecord;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export type DeepSeekHarnessFailure = {
  code: string;
  message: string;
  authRequired: boolean;
};

/**
 * Turns the profile's structured error payload into a safe user-facing error.
 * Harness SDK errors can place an object in `message`; never coerce that object
 * to text because it produces `[object Object]` and can expose provider data.
 */
export function normalizeDeepSeekHarnessFailure(payload: unknown): DeepSeekHarnessFailure {
  const root = unknownRecord(payload);
  const nestedError = unknownRecord(root?.error);
  const embeddedMessage = unknownRecord(root?.message);
  const code = firstNonEmptyString(
    nestedError?.code,
    root?.code,
    embeddedMessage?.code,
  ) ?? 'AGENT_EXECUTION_FAILED';
  const rawMessage = firstNonEmptyString(
    typeof payload === 'string' ? payload : undefined,
    root?.message,
    nestedError?.message,
    embeddedMessage?.message,
  );
  const authRequired = isDeepSeekAuthFailureText(`${code}\n${rawMessage ?? ''}`);
  return {
    code,
    message: authRequired
      ? deepseekHarnessAuthGuidance()
      : rawMessage ?? 'DeepSeek Harness profile error.',
    authRequired,
  };
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

export function isClaudeAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  try {
    const parsed = JSON.parse(value) as { authenticated?: unknown; loggedIn?: unknown };
    if (parsed.authenticated === true || parsed.loggedIn === true) return false;
    if (parsed.authenticated === false || parsed.loggedIn === false) return true;
  } catch {
    // Fall through to text matching below.
  }
  if (/"authenticated"\s*:\s*true/i.test(value) || /"loggedIn"\s*:\s*true/i.test(value)) {
    return false;
  }
  return (
    /"authenticated"\s*:\s*false/i.test(value) ||
    /"loggedIn"\s*:\s*false/i.test(value) ||
    /not authenticated/i.test(value) ||
    /not logged[ _-]?in/i.test(value) ||
    /authentication required/i.test(value) ||
    /please (?:sign|log)[ _-]?in/i.test(value)
  );
}

export function classifyAgentAuthFailure(
  agentId: string,
  text: string,
): AgentAuthProbeResult | null {
  if (agentId === 'claude') {
    if (!isClaudeAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: claudeAuthGuidance(),
    };
  }
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
  if (agentId === 'deepseek-harness') {
    if (!isDeepSeekAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: deepseekHarnessAuthGuidance(),
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
  `(\\b(unauthor(?:ized|ised)|authenticat(?:e|ed|ion)|invalid[ _-]?(?:api[ _-]?)?key|incorrect api key|no api key|x-api-key|missing[ _-]?credentials?|not (?:authenticated|logged[ _-]?in)|please (?:sign|log)[ _-]?in|oauth token (?:has )?expired|session expired|credentials? (?:are )?(?:missing|invalid|required))\\b|\\/login\\b|${STATUS_CTX}401\\b)`,
  'i',
);

// Quota / rate limit / billing balance — the wall the hosted gateway avoids.
const AGENT_RATE_FAILURE_RE = new RegExp(
  `(\\b(rate[ _-]?limit|too many requests|quota|insufficient[ _-]?(?:quota|balance|credit|funds)|credit balance is too low|exceeded your current quota|usage limit|session limit|limit reached|billing (?:hard )?limit)\\b|${STATUS_CTX}429\\b)`,
  'i',
);

// Upstream model/provider problems: overloaded, 5xx, temporarily unavailable.
const AGENT_UPSTREAM_FAILURE_RE = new RegExp(
  `(\\b(overloaded(?:_error)?|service (?:is )?(?:temporarily )?unavailable|bad gateway|gateway timeout|internal server error|upstream (?:error|unavailable)|provider (?:error|unavailable)|temporarily unavailable|model is currently overloaded|5xx)\\b|${STATUS_CTX}5\\d\\d\\b|\\b5\\d\\d\\s+(?:bad gateway|service unavailable|internal server error|gateway timeout))`,
  'i',
);

/**
 * A tool invocation, as the AGENT itself frames it.
 *
 * `tool bash failed:` / `tool error:` / `tool_use_error:` are the agent saying
 * "a tool I ran failed" — it is the authority on whether it was mid-tool, so
 * this is the strongest attribution available in the text. `mcp` / `connector`
 * / `plugin` are the daemon's own words for "a service the agent operates":
 * `run-failure-classification.ts` `isToolErrorText` already reads exactly this
 * vocabulary, and `mcp_auth_required` (bifrost `mcp/agent.go:333`) is vela's
 * self-identifying code for a per-user MCP OAuth. Reusing that vocabulary
 * rather than inventing one keeps a single answer to "what counts as a tool".
 */
const TOOL_INVOCATION_MARKER =
  /\btool[_ -](?:error|use|call|result)\b|\btool\s+[\w./-]+\s+(?:failed|error)\b|\bmcp_auth_required\b|\b(?:mcp|connector|plugin)\b/i;

/**
 * A program identifying ITSELF as the speaker: the Unix `progname: message`
 * convention, plus npm's `npm ERR!` variant of it. `gh:`, `curl:`, `docker:`,
 * `psql:` and `npm ERR!` all carry it, and so will the next tool — that is what
 * the convention is for, which is why this is a shape and not a roster of tool
 * names.
 *
 * It reads WHO is speaking. It does not, on its own, say whether that speaker
 * is foreign: `dsh: MISSING_CREDENTIAL: …` is DeepSeek Harness in exactly the
 * same shape, so the caller has to check the name against
 * `OWN_AGENT_COMMAND_NAMES`. An earlier cut of this predicate assumed the agent
 * would never prefix itself and dropped that row —
 * `tests/runtimes/service-failure-classification.test.ts` caught it, and the
 * row is pinned as A18 in the landing table.
 *
 * Two kinds of leading token are not names at all and are rejected by the
 * caller: severities (`Error:`, `warning:`, `fatal:`) name how bad the line is,
 * and status reason phrases (`Unauthorized:`) name what the server answered.
 * That rejection is load-bearing — vela's real model-service 401 arrives as
 * `Error: list Link models: API request failed with status 401: invalid_api_key`
 * (`acp-service-failure.test.ts` row A14).
 */
const PROGRAM_DIAGNOSTIC_PREFIX = /^[ \t]*([A-Za-z][\w.+-]{0,31})(?::[ \t]|[ \t]ERR!)/;

const SEVERITY_LABELS = new Set([
  'err', 'error', 'errors',
  'warn', 'warning',
  'fatal', 'panic', 'critical', 'crit',
  'note', 'notice', 'info', 'debug', 'trace', 'verbose',
]);

/**
 * Every command name Open Design's own agent CLIs answer to — each shipped
 * adapter's `id` and its `bin`.
 *
 * This is the half of the attribution the text cannot supply, and the reason
 * the program-prefix shape alone is not enough: `dsh: MISSING_CREDENTIAL:
 * llm-deepseek: no API key for provider route …` wears exactly the same prefix
 * as `gh: not authenticated`, and it is DeepSeek Harness reporting its OWN
 * model key. Position does not separate them either — echoed tool output and
 * the agent's own lines are both line-initial. Only the name does.
 *
 * It is an allowlist of OURS, not a blocklist of tools, and that direction is
 * what makes it hold: everything the daemon did not spawn is foreign by
 * default, so the next `terraform:` or `kubectl:` needs no amendment here. The
 * only list that has to stay current is the adapter registry, which the daemon
 * maintains anyway — and
 * `tests/runtimes/tool-vs-agent-auth-snapshot.test.ts` reads the real
 * `SHIPPED_AGENT_DEFS` and goes red if this falls behind it. Kept as a literal
 * rather than derived from `registry.ts` because that module imports every
 * adapter and every adapter imports this file.
 *
 * Exported for that guard only.
 */
export const OWN_AGENT_COMMAND_NAMES: ReadonlySet<string> = new Set([
  'agy', 'aider', 'amp', 'amr', 'antigravity', 'atomcode', 'byok-opencode',
  'claude', 'codebuddy', 'codex', 'copilot', 'cursor-agent', 'deepseek',
  'deepseek-harness', 'devin', 'dsh', 'grok', 'grok-build', 'hermes', 'kilo',
  'kimi', 'kiro', 'kiro-cli', 'mimo', 'opencode', 'opencode-cli', 'pi',
  'qoder', 'qodercli', 'qwen', 'reasonix', 'trae-cli', 'traecli', 'vela',
  'vibe', 'vibe-acp',
]);

/**
 * True when the auth failure `text` reports belongs to a TOOL the agent ran,
 * rather than to the agent's own credential.
 *
 * This is an attribution question, not a vocabulary question, and the
 * distinction is the whole point. `AGENT_AUTH_REQUIRED` means "sign in" — an
 * offer to fix a credential the daemon can reach (the agent's CLI login, or the
 * AMR Cloud session the web resolves it to,
 * `apps/web/src/runtime/amr-guidance.ts`). A run's failure text is not a clean
 * channel for that claim: `collectFailureText`
 * (`run-failure-classification.ts:177`) folds `stderr` events into the corpus
 * (:188), and the ACP bridge folds whatever the agent wrote into its JSON-RPC
 * error frame — so `gh`, `npm`, `curl` and MCP output are read here too, in the
 * same auth vocabulary the agent's own failures use. Answering "sign in" to one
 * of those sends the user to log in to Open Design for a `gh` token in their
 * own shell: a fix guaranteed not to work.
 *
 * The rule is: **when the report names the credential's holder, believe it; the
 * daemon may supply "the agent" only when the report names nobody.** A holder
 * is named in exactly two ways, and both are the text identifying its own
 * speaker rather than us guessing from prose — the same precedence
 * `reportsPlatformProviderCredentialFault` established for R-053, where a
 * self-identifying machine code outranked the sentence it travelled with.
 *
 * Line scope, not whole-text scope: an unrelated `npm ERR!` elsewhere in a long
 * stderr tail must not vouch for the agent's own 401 on another line. And the
 * program prefix must be the SPEAKER of the complaint, not the complaint — so
 * the auth vocabulary has to appear after it. That is what keeps vela's own
 * `auth_required: please reconnect AMR Cloud` from reading as a program named
 * `auth_required`.
 *
 * Exported because the two classifiers that read the same corpus —
 * `classifyAgentServiceFailure` here and `run-failure-classification.ts`'s
 * `isAuthDetailText` branch — have to agree about whose credential it is.
 */
export function reportsToolPrincipalAuthFailure(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  for (const line of value.split(/\r?\n/)) {
    if (!AGENT_AUTH_FAILURE_RE.test(line)) continue;
    if (TOOL_INVOCATION_MARKER.test(line)) return true;
    const prefix = PROGRAM_DIAGNOSTIC_PREFIX.exec(line);
    if (!prefix) continue;
    const speaker = (prefix[1] ?? '').toLowerCase();
    // A severity (`Error:`) or a status reason phrase (`Unauthorized:`) is a
    // LABEL, not a name: it says how bad the line is, or what the server
    // answered, never who wrote it. Reading either as a speaker would drop a
    // real model-service 401 — vela's arrives as `Error: list Link models: API
    // request failed with status 401: invalid_api_key`.
    if (SEVERITY_LABELS.has(speaker)) continue;
    if (AGENT_AUTH_FAILURE_RE.test(speaker)) continue;
    // One of our own agent CLIs speaking as itself, not a tool inside it.
    if (OWN_AGENT_COMMAND_NAMES.has(speaker)) continue;
    if (AGENT_AUTH_FAILURE_RE.test(line.slice(prefix[0].length))) return true;
  }
  return false;
}

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
  // Claimed before auth because the code says whose credentials failed and the
  // sentence beside it does not. vela's link gateway answers an upstream
  // 401/403 with `upstream_provider_unauthenticated` /
  // `upstream_provider_forbidden` on an HTTP 500, worded "Upstream provider
  // credentials are missing or invalid." — which satisfies this file's
  // `credentials (?:are )?missing` alternative and so reported the platform's
  // own misconfiguration to the user as "Sign-in required" (catalogue R-053).
  // A self-identifying machine code outranks a class read off prose; the same
  // precedence the daemon records as `evidenceLevel: 'structured_code'`.
  if (reportsPlatformProviderCredentialFault(value)) return 'UPSTREAM_UNAVAILABLE';
  // The auth class is a claim about THIS agent's credential — the web turns it
  // into a sign-in offer. A report that names a different holder (a tool the
  // agent ran) is answering a different question, so it does not reach the auth
  // branch. It is scoped to the auth branch on purpose: rate limit and upstream
  // outage are true of a tool's request whoever made it, so a tool that hit a
  // 503 or a 429 still classifies below.
  const toolPrincipal = reportsToolPrincipalAuthFailure(value);
  if (!toolPrincipal && AGENT_AUTH_FAILURE_RE.test(value)) return 'AGENT_AUTH_REQUIRED';
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

// Default generic sign-in hint for adapters that declare an `authProbe`
// but ship no tailored guidance (cursor / deepseek / antigravity / reasonix
// each have their own via `classifyAgentAuthFailure`). Kept agent-agnostic
// so a newly-onboarded CLI gets an actionable banner the moment it opts into
// auth probing, without bespoke copy.
function genericAuthGuidance(agentName: string): string {
  return `${agentName} appears to be installed but is not authenticated. Sign in with the CLI in a terminal, then rescan. If OpenDesign was launched outside an interactive shell, your shell rc files (e.g. ~/.zshrc) may not be loaded into its environment.`;
}

// Agents that ship a bespoke auth-failure classifier + tailored sign-in hint
// via `classifyAgentAuthFailure`. For these, a null result is authoritative
// ("authenticated"); we must NOT second-guess it with the broad generic
// regex (e.g. cursor-agent's healthy `status` output mentions "login" in
// ways the generic matcher would misread). The generic classifier is only a
// fallback for adapters with no tailored classifier of their own.
const TAILORED_AUTH_AGENTS = new Set([
  'claude',
  'cursor-agent',
  'deepseek',
  'deepseek-harness',
  'antigravity',
  'reasonix',
]);

function hasNonEmptyEnv(env: RuntimeEnv, keys: string[]): boolean {
  return keys.some((key) => {
    const value = env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

const CLAUDE_ENTERPRISE_PROVIDER_FLAGS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
] as const;

// `claude auth status` reports Claude.ai credentials only. An explicitly
// enabled enterprise provider is therefore the authoritative authentication
// path and must not be mistaken for a missing Claude.ai login.
function hasClaudeEnterpriseProviderAuth(env: RuntimeEnv): boolean {
  return CLAUDE_ENTERPRISE_PROVIDER_FLAGS.some((key) => env[key] === '1');
}

function hasProbeSatisfyingAuth(agentId: string, env: RuntimeEnv): boolean {
  if (agentId === 'codex') {
    return hasNonEmptyEnv(env, ['CODEX_API_KEY', 'OPENAI_API_KEY']);
  }
  if (agentId === 'claude') {
    return (
      hasNonEmptyEnv(env, ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) ||
      hasClaudeEnterpriseProviderAuth(env)
    );
  }
  return false;
}

// Classify an auth-probe's combined output into a missing-auth result, or
// null when the output does not look like an auth failure. Agents with a
// tailored classifier use only that (null === authenticated); every other
// adapter that opts into probing falls back to the generic, agent-agnostic
// HTTP/text classifier so it still gets a usable signal without bespoke
// regexes.
function classifyProbedAuthFailure(
  classifierId: string,
  agentName: string,
  text: string,
): AgentAuthProbeResult | null {
  if (TAILORED_AUTH_AGENTS.has(classifierId)) {
    return classifyAgentAuthFailure(classifierId, text);
  }
  if (classifyAgentServiceFailure(text) === 'AGENT_AUTH_REQUIRED') {
    return { status: 'missing', message: genericAuthGuidance(agentName) };
  }
  return null;
}

// Run an adapter's declared authentication probe (a cheap, side-effect-free
// status/whoami command) and classify the result. Returns null when the
// adapter declares no `authProbe` — those agents are never actively probed;
// their auth status is inferred only from a real chat failure's error text.
export async function probeAgentAuthStatus(
  def: Pick<RuntimeAgentDef, 'id' | 'name' | 'authProbe'>,
  resolvedBin: string,
  env: RuntimeEnv,
): Promise<AgentAuthProbeResult | null> {
  const probe = def.authProbe;
  if (!probe) return null;
  // Local profiles inherit a base adapter's authProbe but run under the profile
  // id; use the base adapter's classifier identity when present so its tailored
  // auth parsing / API-key short-circuit is preserved instead of falling
  // through to the generic classifier (#4456).
  const classifierId = probe.classifierAgentId ?? def.id;
  const agentName = def.name || def.id;
  if (hasProbeSatisfyingAuth(classifierId, env)) return { status: 'ok' };
  // Codex custom providers authenticate via a provider-specific `env_key` (e.g.
  // AZURE_OPENAI_API_KEY) declared in config.toml, even when `codex login
  // status` (a ChatGPT/OpenAI-login check) exits non-zero. Honor that key so a
  // working custom-provider install isn't misreported as missing auth (#4456).
  if (classifierId === 'codex') {
    const providerEnvKey = await readCodexProviderEnvKey(env);
    if (providerEnvKey && hasNonEmptyEnv(env, [providerEnvKey])) {
      return { status: 'ok' };
    }
  }
  try {
    const { stdout, stderr } = await execAgentFile(resolvedBin, probe.args, {
      env,
      timeout: probe.timeoutMs ?? 5000,
      maxBuffer: 1024 * 1024,
    });
    const stdoutText = typeof stdout === 'string' ? stdout : '';
    const stderrText = typeof stderr === 'string' ? stderr : '';
    const output = `${stdoutText}\n${stderrText}`;
    const failure = classifyProbedAuthFailure(classifierId, agentName, output);
    if (failure) {
      return withProbeTails(
        { ...failure, exitCode: 0, signal: null },
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
    const failure = classifyProbedAuthFailure(classifierId, agentName, output);
    if (failure) {
      return withProbeTails(
        { ...failure, exitCode: numericExit, signal: childSignal },
        stdoutText,
        stderrText,
      );
    }
    return withProbeTails(
      {
        status: 'unknown',
        message: `${def.name || def.id} authentication status could not be verified with \`${def.id} ${probe.args.join(' ')}\`.`,
        exitCode: numericExit,
        signal: childSignal,
      },
      stdoutText,
      stderrText,
    );
  }
}
