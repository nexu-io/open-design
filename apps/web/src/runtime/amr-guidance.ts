// Shared logic that maps a failed run's error code + agent into the failure
// UI: which contextual button the gray error card shows, whether to override
// the error text, and whether to show the AMR promotion card below. Kept in
// its own module so ChatPane / ProjectView / AssistantMessage can import it
// without a circular dependency.
import {
  isModelWindowLimitFailure,
  readMembershipConcurrencyResetAt,
  readModelWindowResetAt,
} from '@open-design/contracts';
import type { RunFailureAction } from '@open-design/contracts';

// AMR model-gateway console (account, balance, top-up, plans).
// `source=open_design` tags the landing page_view so vela analytics can
// attribute the visit to OpenDesign (per-product revenue/traffic attribution).
//
// The console's dashboard — not a wallet page — is the account surface every
// entry here targets. A wallet route still answers on B's side, but it is no
// longer part of the product's information architecture: balance, manual
// top-up and the auto-recharge policy were all rehomed onto the dashboard
// (vela #1055), so sending a user to /wallet would drop them on a surface the
// product no longer navigates to.
export const AMR_CONSOLE_URL =
  'https://open-design.ai/amr/dashboard?source=open_design';
export const DEFAULT_AMR_RECHARGE_URL = AMR_CONSOLE_URL;
export const AMR_RECHARGE_URL = DEFAULT_AMR_RECHARGE_URL;

// Path + attribution the console is always reached through, so a runtime
// origin only has to carry the host.
const AMR_CONSOLE_PATH = '/dashboard?source=open_design';

/**
 * The console's `billing=<intent>` value that means "open the upgrade surface
 * that matches THIS workspace".
 *
 * B's dashboard resolves it against the workspace's own subscription state
 * rather than trusting the caller: a personal owner gets the personal plan
 * modal (the same one the console's 「升级订阅」 hero button opens), a team that
 * never subscribed gets first-checkout, and a subscribed team gets change-plan.
 * That is why this client links one intent for every state instead of guessing
 * a per-state parameter — a wrong guess used to open nothing at all
 * (recvpSQKna0LwR).
 *
 * RESTORED 2026-09-06 (spec T54). origin/main had removed this constant in
 * #7122 (Go-plan launch: "public Pricing is the single comparison surface"),
 * with #7167 following up on Pricing's own copy/layout. Neither removal was a
 * technical constraint — it was an information-architecture choice for that
 * campaign — and it left `amrPlansUrlForProfile` ignoring its `profile`
 * argument, so every non-prod build sent 升级 to PRODUCTION Pricing, whose cards
 * hand plan + interval to production Vela for direct checkout. Product ruled
 * the upgrade entries back onto the profile's own console plan surface.
 *
 * B-side support is not in doubt for THIS value: `billing=plan` is one of the
 * two intents vela's `apps/web/src/routes/team-dashboard.tsx` deep-link effect
 * recognizes today. When its `ownerBillingActionsAvailable` guard is false the
 * dialog simply does not open and the user lands on `/dashboard` — the same
 * page the shipped balance/recharge links already target, so an unsatisfiable
 * intent degrades to today's behavior rather than to an error.
 */
export const AMR_CONSOLE_UPGRADE_INTENT = 'plan';

/**
 * The console's `billing=<intent>` value that means "open the auto-recharge
 * (auto top-up) settings dialog for THIS workspace".
 *
 * Sibling of {@link AMR_CONSOLE_UPGRADE_INTENT}; it names a DIFFERENT
 * destination — the console's own auto-recharge settings. It exists because a
 * Max subscriber has no higher plan to sell, so topping up IS the fix: both the
 * in-conversation UpgradeCard and (since spec T58) the balance dialog's primary
 * CTA must land that owner directly on 触发阈值 / 充值金额 / 每月上限.
 *
 * ✅ CONFIRMED ON B since 2026-09-06. vela #1900 (`feat(billing): open
 * auto-recharge settings from a dashboard deep link`) taught the dashboard's
 * deep-link effect this third intent, so the link now opens the settings dialog
 * rather than merely landing on the page that owns it. The comment here
 * previously warned the value was inert on B; that was true when it was written
 * and is no longer.
 */
export const AMR_CONSOLE_AUTO_RECHARGE_INTENT = 'auto-recharge';

const AMR_CONSOLE_URL_BY_PROFILE: Record<string, string> = {
  prod: DEFAULT_AMR_RECHARGE_URL,
  test: 'https://vela.powerformer.net/dashboard?source=open_design',
  local: 'http://localhost:5173/dashboard?source=open_design',
};

// Every AMR profile the packaged runtime can be built with (mirrors the daemon's
// resolveAmrProfile allowlist). Anything else is treated as prod.
const KNOWN_AMR_PROFILES: ReadonlySet<string> = new Set([
  'prod',
  'test',
  'feature-test',
  'local',
]);

// Console origin the daemon reported for THIS runtime (GET
// /api/integrations/vela/status -> consoleOrigin, sourced from OD_VELA_WEB_URL).
//
// The web bundle ships publicly, so the hostnames of internal (non-public) AMR
// environments are not literals in this source tree: packaging injects the
// origin from a CI secret and the daemon hands it to the client at runtime.
// Kept module-level rather than threaded through every caller because it is a
// property of the runtime, not of any one call site, and it is written once per
// status fetch (see setRuntimeAmrConsoleOrigin's single caller in
// providers/daemon.ts).
let runtimeAmrConsoleOrigin: string | null = null;

/**
 * Record the vela console origin the daemon reported, or clear it with a blank
 * value. Normalizes away a trailing slash so callers can append console paths.
 */
export function setRuntimeAmrConsoleOrigin(origin: string | null | undefined): void {
  const normalized = origin?.trim().replace(/\/$/, '') ?? '';
  runtimeAmrConsoleOrigin = normalized.length > 0 ? normalized : null;
}

export function amrConsoleUrlForProfile(
  profile: string | null | undefined,
  consoleOrigin?: string | null,
): string {
  const normalized = profile?.trim() || 'prod';
  // prod's console is the public product URL and stays pinned to it: a runtime
  // origin must never be able to redirect a production user's account, plan, or
  // upgrade links somewhere else. Unrecognized profiles are treated as prod for
  // the same reason.
  if (normalized === 'prod' || !KNOWN_AMR_PROFILES.has(normalized)) {
    return DEFAULT_AMR_RECHARGE_URL;
  }
  const statusOrigin = consoleOrigin?.trim().replace(/\/$/, '') ?? '';
  if (statusOrigin) return `${statusOrigin}${AMR_CONSOLE_PATH}`;
  if (runtimeAmrConsoleOrigin) return `${runtimeAmrConsoleOrigin}${AMR_CONSOLE_PATH}`;
  return AMR_CONSOLE_URL_BY_PROFILE[normalized] ?? DEFAULT_AMR_RECHARGE_URL;
}

export function amrRechargeUrlForProfile(profile: string | null | undefined): string {
  return amrConsoleUrlForProfile(profile);
}

function amrWorkspaceUrl(
  profile: string | null | undefined,
  workspaceId: string | null | undefined,
  intent?: 'plans',
): string | null {
  const normalizedWorkspaceId = workspaceId?.trim();
  if (!normalizedWorkspaceId) return null;
  const url = new URL(amrConsoleUrlForProfile(profile));
  url.searchParams.set('workspaceId', normalizedWorkspaceId);
  if (intent === 'plans') url.searchParams.set('billing', AMR_CONSOLE_UPGRADE_INTENT);
  return url.toString();
}

export function amrConsoleUrlForWorkspace(
  profile: string | null | undefined,
  workspaceId: string | null | undefined,
): string | null {
  return amrWorkspaceUrl(profile, workspaceId);
}

export function amrPlansUrlForWorkspace(
  profile: string | null | undefined,
  workspaceId: string | null | undefined,
): string | null {
  return amrWorkspaceUrl(profile, workspaceId, 'plans');
}

/**
 * Where every generic Upgrade / View plans entry lands: the console's plan
 * surface **for this runtime's own profile** (spec T54, product 2026-09-06).
 *
 * `profile` is load-bearing, and that is the whole point of the ruling. While
 * this returned a hardcoded public Pricing URL the parameter was prefixed `_`
 * and deliberately unused, so a test / local / feature-test build sent 升级 to
 * PRODUCTION Pricing — and a card selected there carries plan + interval back
 * to production Vela for direct checkout. Routing through
 * {@link amrConsoleUrlForProfile} reuses the one origin decision the runtime
 * already owns (daemon `/api/integrations/vela/status` → consoleOrigin →
 * `setRuntimeAmrConsoleOrigin`), so there is no second source of truth for
 * "which environment am I".
 */
export function amrPlansUrlForProfile(profile: string | null | undefined): string {
  return amrConsoleUrlWithBillingIntent(profile, AMR_CONSOLE_UPGRADE_INTENT);
}

/**
 * Console dashboard deep-linked to open the auto-recharge settings, used by the
 * Max-tier balance card whose owner has no higher plan to buy. See
 * {@link AMR_CONSOLE_AUTO_RECHARGE_INTENT} for the B-side caveat.
 */
export function amrAutoRechargeUrlForProfile(profile: string | null | undefined): string {
  return amrConsoleUrlWithBillingIntent(profile, AMR_CONSOLE_AUTO_RECHARGE_INTENT);
}

function amrConsoleUrlWithBillingIntent(
  profile: string | null | undefined,
  intentValue: string,
): string {
  const base = amrConsoleUrlForProfile(profile);
  const intent = `billing=${intentValue}`;
  return base.includes('?') ? `${base}&${intent}` : `${base}?${intent}`;
}

export function amrProfileBadgeLabel(profile: string | null | undefined): string | null {
  if (profile === 'test') return 'TEST';
  if (profile === 'feature-test') return 'FEATURE TEST';
  if (profile === 'local') return 'LOCAL';
  return null;
}

// Codes that mean a non-AMR agent hit "the model service rejected or could not
// serve the run" — auth missing/invalid, quota/rate exhausted, or the upstream
// model endpoint was unavailable. These are the failures worth promoting AMR
// for. Generic process failures (AGENT_EXECUTION_FAILED) and missing binaries
// (AGENT_UNAVAILABLE) are excluded.
const PROMOTE_AMR_CODES = new Set<string>([
  'AGENT_AUTH_REQUIRED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

// Primary action offered in the gray error card.
//   - retry:                       re-run with the current agent.
//   - authorize:                   AMR sign-in/authorize flow, then auto-retry on success.
//   - recharge:                    open the AMR console (manual retry afterwards).
//   - upgrade:                     open public Pricing (manual retry afterwards).
//   - launch-terminal-auth:        Antigravity-specific. agy's `-p`
//                                  print mode cannot complete Google
//                                  Sign-In on its own (no input field
//                                  for the auth code), so OD spawns a
//                                  system Terminal running `agy` and
//                                  the user finishes OAuth there.
//   - switch-model:                the selected model is gone/disabled, so a
//                                  retry reproduces the same answer. Opens the
//                                  model picker (Settings → Execution) instead
//                                  of offering a dead Retry. Design principle
//                                  4: a retry button only appears where a retry
//                                  can actually work.
//   - launch-terminal-switch-model: Antigravity-specific. agy has no
//                                  `--model` flag (upstream #35), so
//                                  switching to a model with available
//                                  quota means opening agy's TUI and
//                                  using its Switch Model picker. The
//                                  daemon spawns the same terminal as
//                                  launch-terminal-auth — the button
//                                  label is the only thing that changes.
//   - open-settings:               S30. The failure is in the user's own machine
//                                  or network path — a corporate proxy, a
//                                  rewritten TLS chain, an unreachable route, a
//                                  host policy, a broken local store. Nothing
//                                  upstream changes on a re-run, and the only
//                                  lever we own is the place those overrides are
//                                  entered: Settings → Local CLI → "Advanced:
//                                  proxy & custom paths", whose `configuredEnv`
//                                  outranks the inherited process env
//                                  (`apps/daemon/src/runtimes/env.ts`). Pairs
//                                  with `secondaryRetry: true` because the
//                                  upstream string this classifies on also
//                                  covers a genuine handshake flake — design
//                                  keeps 〔重试〕 on this card deliberately.
//   - switch-to-cloud:             ladder rung 3. This local path cannot work at
//                                  all (nothing installed, nothing signed in,
//                                  the provider's quota is spent) and none of
//                                  the fixes are in our hands, so the forward
//                                  path is the hosted alternative. The card
//                                  itself draws no button — the AMR switch card
//                                  rendered underneath IS the primary action.
//   - contact-support:             ladder rung 4. Retrying is futile and we have
//                                  no other way out, so the always-present
//                                  secondary 〔Contact support〕 is promoted to
//                                  primary rather than leaving a dead-end card.
// Both terminal-launch actions pair with `secondaryRetry: true` so the
// user has a Retry button after the external step completes (OAuth /
// switching models happens out-of-band; we can't auto-retry from the
// daemon side).
export type RunFailurePrimaryAction =
  | 'retry'
  | 'authorize'
  | 'recharge'
  | 'upgrade'
  | 'switch-model'
  | 'open-settings'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model'
  | 'switch-to-cloud'
  | 'contact-support';

// i18n keys for the gray-card text override (null = show the raw error).
// Keys ending in a value with `{agent}` are interpolated at render time via
// t(key, { agent }) (see ChatPane displayError).
export type RunFailureMessageKey =
  | 'chat.amrError.authMessage'
  | 'chat.amrError.balanceMessage'
  | 'chat.connectionDropped'
  | 'chat.runError.signInMessage.amr'
  | 'chat.runError.signInMessage.other'
  | 'chat.runError.cliMissingMessage'
  | 'chat.runError.promptTooLargeMessage'
  | 'chat.runError.modelUnavailableMessage'
  | 'chat.runError.rateLimitedMessage'
  | 'chat.runError.modelWindowLimitMessage'
  | 'chat.runError.modelWindowLimitMessageNoTime'
  | 'chat.runError.membershipConcurrencyLimitMessage'
  | 'chat.runError.membershipConcurrencyLimitMessageNoTime'
  | 'chat.runError.upstreamUnavailableMessage'
  | 'chat.runError.toolLoopMessage'
  | 'chat.runError.outputInvalidMessage'
  | 'chat.runError.runtimeConfigMessage'
  | 'chat.runError.quotaExhaustedMessage'
  | 'chat.runError.workspaceCreditsMessage'
  | 'chat.runError.timedOutMessage'
  | 'chat.runError.inactivityTimeoutMessage'
  | 'chat.runError.emptyOutputMessage'
  | 'chat.runError.sessionExpiredMessage'
  | 'chat.runError.gitBashMissingMessage'
  | 'chat.runError.cpuUnsupportedMessage'
  | 'chat.runError.agentCrashedMessage'
  | 'chat.runError.accountSuspendedMessage'
  | 'chat.runError.fallbackMessage'
  | 'chat.runError.cliSessionRefusedMessage'
  | 'chat.runError.strategyTaskStateMismatchMessage'
  | 'chat.runError.agentReplyIncompleteMessage'
  | 'chat.runError.clarificationRepeatedMessage'
  | 'chat.runError.clientEnvironmentMessage'
  | null;

/**
 * The `{cause}` half of S30's sentence — the parenthesis the design writes as
 * 「{地区不支持 / 证书校验失败}」, i.e. a slot, not a fixed phrase.
 *
 * It is a KEY rather than a string because this module has no `t`: the card
 * resolves it at render time next to `{agent}` (see ChatPane's
 * `runFailureMessageVars`). Keeping the five causes in one sentence — instead
 * of five near-identical sentences — is also what keeps the copy honest across
 * 19 locales: only the noun changes.
 */
export type RunFailureCauseKey =
  | 'chat.runError.clientEnvironmentCause.certificate'
  | 'chat.runError.clientEnvironmentCause.proxy'
  | 'chat.runError.clientEnvironmentCause.network'
  | 'chat.runError.clientEnvironmentCause.hostPolicy'
  | 'chat.runError.clientEnvironmentCause.localStorage';

/**
 * The one sentence a failure card falls back to when its mapping carries no
 * copy of its own.
 *
 * Before this existed the card rendered `rawError` — the upstream string, in
 * English, sometimes a slab of stderr — straight onto the card face, which is
 * design principle 5 ("say it in plain words") inverted. The raw text is still
 * reachable: it stays in the collapsible diagnostic area, which is where the
 * engineering-facing copy belongs.
 */
export const RUN_FAILURE_FALLBACK_MESSAGE_KEY =
  'chat.runError.fallbackMessage' as const;

// i18n keys for the unified error card's TITLE (the "error type" line above the
// detail message). Frontend-only mapping from error code → human-readable type;
// the daemon does not yet emit a type name (the raw status label is just the
// word "error"). A full backend type ⇄ frontend pairing is a later effort.
export type RunFailureTitleKey =
  | 'chat.runError.title.authRequired'
  | 'chat.runError.title.balance'
  | 'chat.runError.title.connectionDropped'
  | 'chat.runError.title.signInRequired'
  | 'chat.runError.title.rateLimited'
  | 'chat.runError.title.modelWindowLimit'
  | 'chat.runError.title.membershipConcurrencyLimit'
  | 'chat.amrBalanceGate.title'
  | 'chat.runError.title.cliMissing'
  | 'chat.runError.title.promptTooLarge'
  | 'chat.runError.title.modelUnavailable'
  | 'chat.runError.title.upstreamUnavailable'
  | 'chat.runError.title.toolLoop'
  | 'chat.runError.title.outputInvalid'
  | 'chat.runError.title.runtimeConfig'
  | 'chat.runError.title.quotaExhausted'
  | 'chat.runError.title.timedOut'
  | 'chat.runError.title.emptyOutput'
  | 'chat.runError.title.sessionExpired'
  | 'chat.runError.title.gitBashMissing'
  | 'chat.runError.title.artifactMissing'
  | 'chat.runError.title.cpuUnsupported'
  | 'chat.runError.title.agentCrashed'
  | 'chat.runError.title.accountSuspended'
  | 'chat.runError.title.cliSessionRefused'
  | 'chat.runError.title.strategyTaskHalted'
  | 'chat.runError.title.agentReplyIncomplete'
  | 'chat.runError.title.clarificationRepeated'
  | 'chat.runError.title.clientEnvironment'
  | 'chat.runError.title.generic';

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  // Title shown above the detail message — names the failure type.
  titleKey: RunFailureTitleKey;
  // Override the gray error card's text (e.g. AMR auth / balance get a clearer
  // explanation than the raw upstream string).
  messageKey: RunFailureMessageKey;
  // Interpolation values for `messageKey`, for the cases whose copy names
  // something the daemon read off the failure (e.g. when a rolling model window
  // reopens). Absent for every message that is a fixed sentence.
  messageVars?: Record<string, string>;
  // A `{cause}` the copy names but that is itself localized, so it arrives as a
  // key and is translated next to `{agent}` at render time. Only S30 uses it.
  messageCauseKey?: RunFailureCauseKey;
  // Show a secondary plain "retry" button alongside the primary action (used
  // by the recharge case, where retry is manual after topping up).
  secondaryRetry: boolean;
  // Show the AMR promotion card under the gray error card.
  showSwitchCard: boolean;
  /**
   * Draw no error card at all — some other surface already owns this story.
   *
   * Two failures set it. The browser↔daemon stream drop hands its card to the
   * reconnect line at the tail of the conversation (grid 82–84, S29), which is
   * already saying the same thing with the right button; the insufficient
   * balance hands its card to the upgrade card (component 18). Two blocks of
   * UI for one event, in two different wordings, is exactly what the design
   * forbids.
   *
   * This is a HAND-OFF, not a delete: it is only true while the surface named
   * above is actually on screen. The reconnect line always is. The upgrade card
   * is conditional — see `failureCardHandedToAmrBalanceCard`.
   */
  suppressCard?: boolean;
}

/**
 * Is this the failure whose card is handed to the AMR upgrade card, rather
 * than to the always-present reconnect line?
 *
 * The distinction matters because that receiver is conditional: the upgrade
 * card only renders once a wallet read returns a definite number, and the
 * failure event itself carries no balance. When that read comes back empty
 * nobody is telling the story, and honouring the hand-off would leave a run
 * that died for lack of funds with no top-up entry and no retry — the one
 * self-rescue path this failure has.
 *
 * Callers must therefore confirm the upgrade card is on screen before
 * honouring `suppressCard` for this failure.
 */
export function failureCardHandedToAmrBalanceCard(
  ui: RunFailureUi | null | undefined,
): boolean {
  return ui?.suppressCard === true && ui.primaryAction === 'recharge';
}

/**
 * The browser↔daemon SSE stream ran out of reconnect budget.
 *
 * Duplicated from `providers/daemon.ts` rather than imported: that module
 * already imports this one (`setRuntimeAmrConsoleOrigin`), so the import would
 * close a cycle. `run-error-ladder.test.ts` pins the two copies equal, since a
 * silently drifting copy is the failure mode of writing it twice.
 */
export const RECONNECT_OWNED_FAILURE_CODE = 'DAEMON_STREAM_DISCONNECTED';
const RECONNECT_OWNED_FAILURE_MESSAGE =
  'daemon stream disconnected before run completed';

/**
 * Is this failure the one the reconnect line already speaks for?
 *
 * Reads the same code-or-message pair as `ProjectView`'s
 * `hasGenericDisconnectFailureEvent`: rows persisted before the structured code
 * existed carry only the sentence, and they have to be recognized too or the
 * duplicate card comes back for exactly the users with the longest history.
 *
 * Not the same thing as `AGENT_CONNECTION_DROPPED` (S11): that is the agent's
 * connection to the MODEL service, which the reconnect line knows nothing about
 * and cannot re-establish, so that failure keeps its card and its retry.
 */
export function isReconnectOwnedFailure(
  code: string | null | undefined,
  rawMessage?: string | null,
): boolean {
  if (code === RECONNECT_OWNED_FAILURE_CODE) return true;
  return typeof rawMessage === 'string'
    && rawMessage.trim() === RECONNECT_OWNED_FAILURE_MESSAGE;
}

/**
 * The two window-limit message keys, narrowed away from `RunFailureMessageKey`
 * (which includes `null` for the cases that keep the raw upstream string) so
 * callers can hand the result straight to `t()` without a non-null assertion.
 */
export type ModelWindowLimitMessageKey =
  | 'chat.runError.modelWindowLimitMessage'
  | 'chat.runError.modelWindowLimitMessageNoTime';

/**
 * The copy a rolling model-window rejection should render, or null when the
 * text is some other failure.
 *
 * Two surfaces need this and they arrive from opposite directions: the chat
 * card already knows the daemon's `model_window_limit` classification and only
 * wants the instant, while the Home composer fails before a run exists and has
 * nothing but the raw upstream sentence. Sharing one reader keeps them from
 * disagreeing about what counts as a window limit.
 */
export function modelWindowLimitCopy(
  rawMessage: string | null | undefined,
): { messageKey: ModelWindowLimitMessageKey; retryAt?: string } | null {
  if (!isModelWindowLimitFailure(rawMessage)) return null;
  const parsed = readModelWindowResetAt(rawMessage);
  // Shape-valid but not a real instant (`2026-13-45T…`) counts as unreadable,
  // so the message key and the variable can never disagree about whether a
  // time exists — the card would otherwise render "Invalid Date".
  const retryAt = parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
  return retryAt
    ? { messageKey: 'chat.runError.modelWindowLimitMessage', retryAt }
    // Promising a time we could not read is worse than not naming one.
    : { messageKey: 'chat.runError.modelWindowLimitMessageNoTime' };
}

/**
 * The instant a model window reopens, rendered for a reader in `locale`.
 *
 * The gateway reports UTC; a user waiting on a clock needs their own. Date and
 * time are both shown because the wait can cross midnight, and the year is left
 * off because a rolling window never reaches one.
 *
 * Returns the input untouched if it cannot be formatted, so the copy degrades
 * to a machine-readable instant rather than to a gap.
 */
export function formatModelWindowRetryAt(retryAt: string, locale: string): string {
  const parsed = new Date(retryAt);
  if (!Number.isFinite(parsed.getTime())) return retryAt;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return retryAt;
  }
}

/**
 * The rung-1 actions: the things we can do FOR the user in one click.
 *
 * Narrowed out of `RunFailurePrimaryAction` so a mapping cannot accidentally
 * declare "we have a direct fix" and then name `retry` (rung 2) or
 * `contact-support` (rung 4) as that fix.
 */
export type RunFailureDirectFix = Extract<
  RunFailurePrimaryAction,
  | 'authorize'
  | 'recharge'
  | 'upgrade'
  | 'switch-model'
  | 'open-settings'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model'
>;

/**
 * What KIND of failure this is — the only thing a mapping has to declare.
 *
 * Every field is a question about the failure itself, not about the button we
 * want. The button is derived (`primaryActionForFailure`), which is the whole
 * point: adding a new failure code means answering three questions, not picking
 * a CTA by hand and hoping it stays consistent with the sixteen picked before it.
 */
export interface RunFailureNature {
  /** Rung 1 — we have a one-click action that actually resolves this. */
  directFix?: RunFailureDirectFix;
  /** Rung 2 — running it again can plausibly succeed (possibly after the user does something). */
  transient?: boolean;
  /** Rung 3 — this local path cannot work at all and the fix isn't in our hands. */
  localDeadEnd?: boolean;
}

/**
 * The primary-button ladder (`specs/current/run-error-catalog.md` §6.Z),
 * top-down; the first rung that matches wins.
 *
 *   1. We have an action that directly solves it   → that action
 *   2. The failure is transient                    → retry from where it failed
 *   3. This local path cannot work at all          → switch to Cloud
 *   4. None of the above                           → contact support (promoted
 *                                                     from the standing secondary)
 *
 * One ladder covers both environments: a run that is ALREADY on Cloud never
 * trips rung 3, so it degrades to the Cloud answer on its own — no second table.
 *
 * Rung 1 outranks rung 3 deliberately (user's words): someone paying for their
 * own CLI/BYOK who hits a "just switch models" problem must not be told to buy
 * a second product instead — that puts marketing ahead of solving the problem.
 *
 * Rung 4 is what makes design principle 4 hold structurally rather than by
 * vigilance: a failure that declares neither a direct fix nor transience can no
 * longer end up with a Retry button, because nothing in this function can
 * produce one.
 *
 * §6.T maps the rungs onto the F0–F10 flow table: rung 1 = F4/F5/F6/F7/F8,
 * rung 2 = F1/F2/F3/F9, rung 3 has no F-row (it is new in the ladder),
 * rung 4 = F10.
 */
export function primaryActionForFailure(
  nature: RunFailureNature,
): RunFailurePrimaryAction {
  if (nature.directFix) return nature.directFix;
  if (nature.transient) return 'retry';
  if (nature.localDeadEnd) return 'switch-to-cloud';
  return 'contact-support';
}

/**
 * The daemon's own reading of a failed run: can it be re-run, and what should
 * the user do. Both are already computed at finalize time
 * (`apps/daemon/src/run-failure-classification.ts` → `retryable` /
 * `user_action`) and both are already on `GET /api/runs/:id`
 * (`ChatRunStatusResponse.failureAction`).
 *
 * ⚠️ They do NOT reach the card today. The chat reads its failure off the
 * persisted `status`/`error` event, and the streaming layer only stamps
 * `failureCategory` + `failureDetail` onto it. Carrying these two the same way
 * is a three-file change outside this module — the SSE `end` frame /
 * `PersistedAgentEvent` shape in contracts, `providers/daemon.ts`'s
 * `markErrorRunFailure`, and `runtime/chat-events.ts`'s
 * `appendErrorStatusEvent` — so this parameter is written to be inert until
 * they land, and correct the moment they do.
 */
export interface RunFailureDaemonVerdict {
  /** Daemon's `retryable`. */
  retryable?: boolean | null;
  /** Daemon's `user_action`, as published on the run-status response. */
  failureAction?: RunFailureAction | null;
}

/**
 * Did the daemon put a NAME on this failure?
 *
 * The two cases the fallback used to merge are separable in the data, and this
 * is the whole of the test: the classifier emits a specific `failure_detail`
 * when it recognised the cause, and the literal `'unknown'` when it did not
 * (the last `classification('unknown', 'unknown', …)` in
 * `run-failure-classification.ts`). An absent detail is an older daemon that
 * classified nothing at all, which is the same situation.
 *
 * What it does NOT settle is the button. Among the causes the daemon names but
 * this module has no row for there are both futile ones (`spawn_enoexec`,
 * `cli_version_incompatible`) and genuinely transient ones (`upstream_5xx`,
 * `provider_high_demand`), so "named" alone cannot demote a Retry without
 * taking it away from failures that deserve it. That call belongs to the
 * daemon's own verdict — see {@link RunFailureDaemonVerdict}.
 */
export function daemonNamedTheFailure(detail: string | null | undefined): boolean {
  return typeof detail === 'string' && detail.length > 0 && detail !== 'unknown';
}

/**
 * Did the daemon already decide that running this again cannot help?
 *
 * Either half is sufficient and they are written independently upstream:
 * `retryable: false` is the classifier's verdict, `failureAction: 'none'` is
 * the same verdict expressed as an instruction. An absent verdict answers no,
 * which is what keeps an older daemon on today's behaviour.
 */
function daemonSaysRetryIsFutile(
  verdict: RunFailureDaemonVerdict | null | undefined,
): boolean {
  if (!verdict) return false;
  return verdict.retryable === false || verdict.failureAction === 'none';
}

/**
 * Read the daemon's verdict off whatever the chat has for this failure.
 *
 * Deliberately structural rather than typed against the event: the fields are
 * not on `PersistedAgentEvent` yet (see {@link RunFailureDaemonVerdict}), and
 * the same shape of defensive read is how `runFailureFieldsFromError` already
 * picks the classification off a surfaced error. Returns undefined when neither
 * field is present, so a caller passes nothing through rather than an object
 * that says "we asked and the answer was nothing".
 */
export function daemonFailureVerdictFrom(
  source: unknown,
): RunFailureDaemonVerdict | undefined {
  const value = source as
    | { retryable?: unknown; failureAction?: unknown }
    | null
    | undefined;
  if (!value || typeof value !== 'object') return undefined;
  const retryable = typeof value.retryable === 'boolean' ? value.retryable : undefined;
  const failureAction =
    typeof value.failureAction === 'string'
      ? (value.failureAction as RunFailureAction)
      : undefined;
  if (retryable === undefined && failureAction === undefined) return undefined;
  return {
    ...(retryable === undefined ? {} : { retryable }),
    ...(failureAction === undefined ? {} : { failureAction }),
  };
}

/**
 * Does THIS card draw a control that can push the failed run forward?
 *
 * Rung 3 and rung 4 both answer no: rung 3's button lives on the switch card
 * rendered underneath, and "contact support" opens a conversation, not a
 * recovery. Callers use it to decide whether to offer the generic local-CLI
 * escape hatch alongside.
 */
export function hasSelfContainedRecovery(ui: RunFailureUi | null | undefined): boolean {
  if (!ui) return false;
  if (ui.secondaryRetry) return true;
  return ui.primaryAction !== 'switch-to-cloud' && ui.primaryAction !== 'contact-support';
}

/**
 * Build a failure card from the nature of the failure. Callers never name a
 * primary action — they describe the failure and the ladder answers.
 */
function failureCard(
  nature: RunFailureNature,
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
  extra: Partial<
    Pick<
      RunFailureUi,
      'secondaryRetry' | 'showSwitchCard' | 'messageVars' | 'messageCauseKey'
    >
  > = {},
): RunFailureUi {
  return {
    primaryAction: primaryActionForFailure(nature),
    titleKey,
    messageKey,
    secondaryRetry: extra.secondaryRetry ?? false,
    // Rung 3 says the way out is the hosted alternative, so the switch card is
    // that rung's button and is always on. Any other rung may still promote AMR
    // for its own reasons, but has to ask for it.
    showSwitchCard: extra.showSwitchCard ?? Boolean(nature.localDeadEnd),
    ...(extra.messageVars ? { messageVars: extra.messageVars } : {}),
    ...(extra.messageCauseKey ? { messageCauseKey: extra.messageCauseKey } : {}),
  };
}

// Named failure type + actionable copy, recovered by re-running once the user
// has followed the instruction (ladder rung 2). No AMR promotion — these root
// causes aren't "switch to hosted model" cases.
function retryWithGuidance(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({ transient: true }, titleKey, messageKey);
}

/**
 * The selected model cannot serve this run at all — it is missing, disabled, or
 * no longer in the catalogue. Retrying re-picks the same model and reproduces
 * the same answer, so the card offers the one thing that changes the outcome:
 * picking a different model (ladder rung 1).
 */
function switchModelWithGuidance(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({ directFix: 'switch-model' }, titleKey, messageKey);
}

/**
 * S30 · the failure is in the user's own machine or network path.
 *
 * The daemon already names these five causes (`clientEnvironmentFailureDetail`
 * in `apps/daemon/src/run-failure-classification.ts`) and already rules them
 * `retryable: false` / `user_action: 'none'`. Web had no row for any of them,
 * so all five landed on the unclassified fallback and were handed a 〔重试〕 —
 * and a retry here is a whole new run against the same rewritten TLS chain or
 * the same blocked route, i.e. the same answer.
 *
 * Copy is the design's, verbatim (`error-ux-design.md` S30): 「网络环境不对 ——
 * 看起来走了代理或公司网络,{供应商} 拒绝了请求({地区不支持 / 证书校验失败})。
 * 换一个网络出口,或在设置里调整代理。〔去设置 | 重试〕」 — note what it does NOT
 * say: nothing here promises that installing a certificate makes it work, because
 * upstream has measured builds where it does not.
 *
 * 〔重试〕 stays as the SECONDARY on purpose. The upstream sentence these
 * classify on ("unknown certificate verification error") covers two different
 * events: a corporate middlebox (deterministic) and a handshake cut mid-flight
 * on a lossy link (a flake). Keeping a retry within reach costs nothing and
 * covers the second; making it the primary is what the design forbids.
 */
function clientEnvironmentCard(causeKey: RunFailureCauseKey): RunFailureUi {
  return failureCard(
    { directFix: 'open-settings' },
    'chat.runError.title.clientEnvironment',
    'chat.runError.clientEnvironmentMessage',
    { secondaryRetry: true, messageCauseKey: causeKey },
  );
}

/**
 * Rung 3 — "switch to the Open Design agent" — is not an answer for a run that
 * is ALREADY on that agent: the card would recommend the very thing that just
 * failed, and the switch card underneath would advertise it a second time.
 *
 * The ladder's own docblock already claims this ("a run that is ALREADY on
 * Cloud never trips rung 3, so it degrades to the Cloud answer on its own — no
 * second table"). Until now nothing executed that claim, because the AMR branch
 * returned a catch-all before any rung-3 mapping could be reached. This
 * function is where the claim becomes true, so the AMR branch no longer has to
 * swallow the rest of the table to stay honest.
 *
 * Removing rung 3 leaves nothing below it, so such a card lands on rung 4
 * (contact support) — never on a Retry, which principle 4 forbids for the
 * quota/entitlement failures that reach rung 3 in the first place.
 */
function withoutCloudSelfPromotion(ui: RunFailureUi): RunFailureUi {
  if (!ui.showSwitchCard && ui.primaryAction !== 'switch-to-cloud') return ui;
  return {
    ...ui,
    showSwitchCard: false,
    primaryAction:
      ui.primaryAction === 'switch-to-cloud' ? 'contact-support' : ui.primaryAction,
  };
}

/** The hosted agent — the one every rung-3 mapping points at. */
const CLOUD_NATIVE_AGENT_ID = 'amr';

/**
 * Nothing on this card can move the run forward and retrying is futile
 * (ladder rung 4). 〔Contact support〕 — a standing secondary on every failure
 * card — is promoted to primary so the card is never a dead end.
 */
function contactSupportOnly(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({}, titleKey, messageKey);
}

// Agent-agnostic failure codes that carry a clear root cause and a concrete
// fix, mapped the same way regardless of which agent produced them. The daemon
// already classifies these into failure_category / user_action
// (apps/daemon/src/run-failure-classification.ts); this is the user-facing half
// of that taxonomy — a human-readable type name plus a one-line instruction,
// with the raw upstream string preserved in the card's collapsible source area.
const AGENT_AGNOSTIC_FAILURE_UI: Record<string, RunFailureUi> = {
  // The run completed but did not leave a deliverable file. Name the actual
  // missing outcome in the compact card and keep the raw reason in details.
  ARTIFACT_NOT_FOUND: retryWithGuidance(
    'chat.runError.title.artifactMissing',
    null,
  ),
  // CLI binary not found on PATH (user_action: install_cli).
  AGENT_UNAVAILABLE: retryWithGuidance(
    'chat.runError.title.cliMissing',
    'chat.runError.cliMissingMessage',
  ),
  // Input exceeded the model context window (user_action: reduce_context).
  AGENT_PROMPT_TOO_LARGE: retryWithGuidance(
    'chat.runError.title.promptTooLarge',
    'chat.runError.promptTooLargeMessage',
  ),
  // Selected model is missing/disabled (user_action: switch_model). The daemon
  // already names the fix — offer it as the button instead of a Retry that is
  // guaranteed to fail the same way.
  AMR_MODEL_UNAVAILABLE: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  // Guard halted a repeating, non-progressing tool loop (user_action: retry
  // after checking the real target).
  TOOL_LOOP_DETECTED: retryWithGuidance(
    'chat.runError.title.toolLoop',
    'chat.runError.toolLoopMessage',
  ),
  // Model emitted a fabricated role marker and was aborted; a plain retry
  // usually recovers.
  ROLE_MARKER_HALLUCINATION: retryWithGuidance(
    'chat.runError.title.outputInvalid',
    'chat.runError.outputInvalidMessage',
  ),
  // Checked-in runtime def failed strict validation (user_action: fix_config).
  // Ladder rung 4 (catalogue R-031: flow F10, "retryable: no"): the user cannot
  // self-repair and a new run re-reads the same invalid definition, so the
  // button now matches what the copy has always said — talk to us.
  AGENT_RUNTIME_DEF_INVALID: contactSupportOnly(
    'chat.runError.title.runtimeConfig',
    'chat.runError.runtimeConfigMessage',
  ),
  // R9 · the browser↔daemon stream gave up reconnecting. Ladder rung 2 — the
  // stream can be re-established, and 〔重新连接〕 already exists for exactly
  // that. But the button lives on the reconnect line at the tail of the
  // conversation (grid 84, S29), not on a card, so this mapping draws no card:
  // the run may well still be alive on the daemon (`ProjectView` re-attaches
  // any run whose only failure event is this one), and a card claiming "task
  // failed" would be both a duplicate and a lie.
  [RECONNECT_OWNED_FAILURE_CODE]: {
    ...failureCard(
      { transient: true },
      'chat.runError.title.connectionDropped',
      'chat.connectionDropped',
    ),
    suppressCard: true,
  },
  // A strategy-task continuation (clarification answer) arrived after the
  // daemon's OD Next protocol gate already settled the task — typically a
  // sticky `blocked` verdict. This is a task-lifecycle rejection, not an
  // engine failure: name the halted task and point at retrying the request
  // or starting a new one instead of showing the generic "task failed" card.
  STRATEGY_TASK_STATE_MISMATCH: retryWithGuidance(
    'chat.runError.title.strategyTaskHalted',
    'chat.runError.strategyTaskStateMismatchMessage',
  ),
  // The agent answered — completely, readably, and the reply is already on
  // screen — but the reply carried no usable Runtime State block, and the OD
  // Next clarification stage admits only `plan_ready` (which needs a Plan
  // Contract this reply never had), `blocked`, or `canceled`. So the turn
  // settles terminal-`blocked`.
  //
  // Refusing it is CORRECT and is not what these rows change. What they change
  // is what the user is told. Without a row here the failure fell through to
  // the generic fallback, whose `messageKey: null` renders
  // RUN_FAILURE_FALLBACK_MESSAGE_KEY — a blank "the task failed" — while the
  // user is looking at their submitted answers and a full prose plan. The one
  // sentence that actually described the failure lived only in the English
  // diagnostic text. That is design principle 5 inverted twice over: it
  // explains nothing, and it lets the user suspect their own answers.
  //
  // Ladder rung 2. The omission is intermittent — the same prompt re-run
  // usually emits the block — so Retry is the honest action, and
  // `retryWithGuidance` keeps exactly the button the fallback already gave.
  //
  // ⚠️ `docs/design/run-errors/error-ux-design.md` HAS NO CELL FOR THIS. The
  // nearest, S21, covers an empty / malformed / looping model response, which
  // this is not. The copy below is W41's draft for a cell product has yet to
  // write — replace the wording, not the routing, when they do.
  //
  // All four Runtime State issue codes (`strategies/od-next/protocol.ts:16-19`)
  // share the row: to the user they are one story — the reply came back without
  // the marker — and splitting them would only ask product for four wordings of
  // the same sentence.
  od_next_protocol_runtime_state_missing: agentReplyIncomplete(),
  od_next_protocol_runtime_state_duplicate: agentReplyIncomplete(),
  od_next_protocol_runtime_state_invalid_json: agentReplyIncomplete(),
  od_next_protocol_runtime_state_invalid_schema: agentReplyIncomplete(),
  // The user answered the clarification form, and the agent came back with
  // ANOTHER question instead of proceeding.
  //
  // DELIBERATELY NOT one of the four above, even though the daemon reaches this
  // code through the same block-less turn. To the user those are one story —
  // "the reply came back without its marker" — and this is a different one: "I
  // answered, and it is asking me again." Folding it into that row would tell
  // the user their reply went missing while a fresh question form sits on
  // screen in front of them.
  //
  // It is also NOT intermittent, which is why its copy must not promise that a
  // re-run fixes it. A task admits exactly ONE clarification round
  // (`coordinator.ts` beginStrategyClarification: "the task is not awaiting its
  // one allowed clarification answer"), and at `inputStage: 'clarification'`
  // the contract admits only `plan_ready` / `blocked` / `canceled`
  // ("Clarification cannot request another clarification round",
  // `contracts/src/plugins/strategy-v2.ts`). A properly DECLARED second
  // question is refused by the identical code, so nothing about this is a
  // dropped block.
  //
  // Retry still earns its place, for a different reason than rung 2's usual
  // one: Retry does not re-roll this turn, it opens a NEW task. `handleRetry`
  // sends no `strategyTaskExecutionId`, so `resolveClarificationContinuation`
  // returns `ordinary` and `createStrategyTaskExecution` starts a fresh chain
  // at `clarificationCount: 0` / `inputStage: 'request'` — where asking a
  // question is a legal outcome. The agent will likely ask again; that time it
  // renders as a normal round of questions instead of a failure card.
  //
  // ⚠️ `docs/design/run-errors/error-ux-design.md` HAS NO CELL FOR THIS either
  // — S01–S32 contain nothing about clarification or follow-up questions. The
  // copy is W41's draft; product should rewrite the wording, not the routing.
  od_next_clarification_repeated: retryWithGuidance(
    'chat.runError.title.clarificationRepeated',
    'chat.runError.clarificationRepeatedMessage',
  ),
};

/**
 * The card for "the agent replied, but the reply could not be recorded".
 *
 * A function rather than a shared constant because `AGENT_AGNOSTIC_FAILURE_UI`
 * hands its values straight to callers; four references to one frozen-by-
 * convention object would let a future mutation of one code's card silently
 * rewrite the other three.
 */
function agentReplyIncomplete(): RunFailureUi {
  return retryWithGuidance(
    'chat.runError.title.agentReplyIncomplete',
    'chat.runError.agentReplyIncompleteMessage',
  );
}

// Ladder rung 3: this local path cannot work at all — the provider's quota is
// spent, and topping it up / changing keys isn't something we can do for the
// user. The hosted alternative is the way out, so the switch card below is the
// primary action and the card itself draws no button.
function switchToCloud(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({ localDeadEnd: true }, titleKey, messageKey);
}

// Failure causes keyed by the daemon's fine-grained `failure_detail`, for the
// cases where the coarse `error_code` alone is wrong or too vague. This layer
// can OVERRIDE a code mapping — e.g. `hard_quota` and a transient 429 share
// `error_code: RATE_LIMITED`, but only the transient one should offer Retry.
// Applied after AMR/Antigravity agent-specific handling (which own their own
// quota/auth flows) and before the generic code branches.
const DETAIL_FAILURE_UI: Record<string, RunFailureUi> = {
  // Provider quota / billing hard-stop: retrying reproduces the failure, so
  // drop Retry and steer to the hosted-AMR switch card.
  hard_quota: switchToCloud(
    'chat.runError.title.quotaExhausted',
    'chat.runError.quotaExhaustedMessage',
  ),
  workspace_credits_exhausted: switchToCloud(
    'chat.runError.title.quotaExhausted',
    'chat.runError.workspaceCreditsMessage',
  ),
  // CLI binary missing detected only from text (leaks in as the opaque
  // AGENT_EXECUTION_FAILED code, not AGENT_UNAVAILABLE) — reuse the same
  // "install the CLI, then retry" card the code path already renders.
  cli_not_installed: retryWithGuidance(
    'chat.runError.title.cliMissing',
    'chat.runError.cliMissingMessage',
  ),
};

// Agent-agnostic failure causes keyed by the daemon's `failure_detail`, resolved
// BEFORE the AMR/Antigravity agent branches (unlike DETAIL_FAILURE_UI above).
// These are engine-neutral run outcomes — a timeout, an empty result, a stale
// resumed session, a missing Git Bash — that carry the same named type + fix for
// every agent, including AMR. They leak in under the opaque AGENT_EXECUTION_FAILED
// / process-exit codes, so without this the card would only show the raw stderr.
const AGENT_AGNOSTIC_DETAIL_FAILURE_UI: Record<string, RunFailureUi> = {
  stream_disconnected: retryWithGuidance(
    'chat.runError.title.connectionDropped',
    'chat.connectionDropped',
  ),
  // Hard wall-clock timeout for the run (daemon user_action: retry). A plain
  // retry — optionally with a smaller task — usually gets through.
  timeout: retryWithGuidance(
    'chat.runError.title.timedOut',
    'chat.runError.timedOutMessage',
  ),
  // The agent stalled (no new output for too long) and was cut off as a
  // timeout. Distinct copy from a hard timeout, same retry recovery.
  inactivity_timeout: retryWithGuidance(
    'chat.runError.title.timedOut',
    'chat.runError.inactivityTimeoutMessage',
  ),
  // Run terminated without producing any output (daemon user_action: retry);
  // usually transient, so name it and offer a straight retry.
  empty_output: retryWithGuidance(
    'chat.runError.title.emptyOutput',
    'chat.runError.emptyOutputMessage',
  ),
  // A resumed agent session id went stale; the daemon already cleared it so the
  // next run starts fresh (#3408). Name it as recoverable and offer Retry.
  session_resume_expired: retryWithGuidance(
    'chat.runError.title.sessionExpired',
    'chat.runError.sessionExpiredMessage',
  ),
  // Windows: the agent needs Git Bash to spawn and it isn't installed
  // (daemon user_action: install_cli). Point at installing Git for Windows,
  // then retry — same "install the dependency, then re-run" shape as cli_missing.
  git_bash_missing: retryWithGuidance(
    'chat.runError.title.gitBashMissing',
    'chat.runError.gitBashMissingMessage',
  ),
  // The bundled agent binary needs a CPU instruction set (AVX2) this device
  // doesn't have, so it crashes on launch — retrying reproduces the crash and
  // switching hosted models doesn't help (the runtime binary is the problem).
  // The fix is updating OpenDesign to a build that bundles a compatible
  // (baseline) runtime, so show guidance copy without a dead Retry button.
  // Ladder rung 4. §6.Z names this one explicitly under principle 4 ("quota
  // spent, account suspended, CPU unsupported — these three get no Retry").
  // Rung 3 is not available either: the binary that cannot start IS the hosted
  // runtime, so "switch to Cloud" would point at the thing that just crashed.
  cpu_unsupported: contactSupportOnly(
    'chat.runError.title.cpuUnsupported',
    'chat.runError.cpuUnsupportedMessage',
  ),
  // S19 · the agent exited and did not say why. 20,868 runs/month, 16.3% of all
  // failures, 3,869 devices — the second-largest bucket, and until now it had no
  // row in any of the three tables, so every one of those runs rendered "task
  // failed" plus whatever stderr happened to be attached (catalogue R-070 /
  // R-071 / R-072 / R-079).
  //
  // Design copy verbatim (`error-ux-design.md:212-217`): "{agent} exited
  // unexpectedly — it didn't say why. Retrying usually recovers; if it keeps
  // happening, send us the logs. 〔Retry | Export logs〕". 〔Export logs〕 is a
  // standing secondary on every card (§6.Z), so the mapping only has to declare
  // that a retry is worth offering — ladder rung 2.
  //
  // Causes we CAN name resolve earlier (cli missing, Git Bash, timeouts, stale
  // session, CPU): these six are the residue where the exit carries no reason.
  process_crashed: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  signal_killed: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  terminated_unknown: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  exit_code: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  exit_nonzero: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  execution_failed: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  // S10 · the hosted agent service failed at the protocol level and did not
  // come back. `fatal_rpc_error` is what the daemon writes when the ACP/JSON-RPC
  // channel to the agent reported a FATAL and the child closed
  // (`server.ts` markRpcCloseReason → `process_exit / fatal_rpc_error`); the
  // named members of that family — suspended account, insufficient balance,
  // rolling model window, stale resumed session — are all extracted ahead of
  // this row, so what is left is "the service backing this agent broke and did
  // not say anything we can act on".
  //
  // Why S10 (「服务暂时不可用」) and not S19 (「智能体意外退出了」): S19's copy is
  // "it didn't say why", and this failure is the case where it DID say — at the
  // protocol level — that the service side gave up. The observed instance is
  // AMR's `session/new`: vela's opencode session creation is slow by nature
  // (median 26.7s, p100 ~32s) and its long tail returns Go's
  // `context deadline exceeded`, which is upstream slowness, not a local crash.
  //
  // S10's 时机 is "自动重试都失败后", and that is exactly when this row is read:
  // `fatal_rpc_error` is in the daemon's safe same-run retry set
  // (`run-retry-policy.ts`), so by the time a card renders the run has already
  // burned its automatic retry — which makes S10's "已自动重试过" literally true.
  //
  // No switch card: 推荐 Open Design 智能体 is reserved for「本地 agent 没登录」
  // and「供应商额度用完」(design §3), and the agent that just failed here
  // usually IS the hosted one.
  fatal_rpc_error: retryWithGuidance(
    'chat.runError.title.upstreamUnavailable',
    'chat.runError.upstreamUnavailableMessage',
  ),
  // S10 as well — the OTHER half of the same scenario, and the half the daemon
  // actually reaches most often. Catalogue R-051 ("上游 5xx / 过载 529 / 网关 502
  // upstream_error") names exactly these two details, both 可重试, and points
  // them at S10「模型服务商报错 / 过载」— 11,200 runs/month, 8.8% of failures,
  // 2,056 devices.
  //
  // They were structurally unreachable, for the same reason the
  // `model_unavailable` family above was: the ONE code web has an S10 card for
  // is `UPSTREAM_UNAVAILABLE`, and the ACP/JSON-RPC path never emits it. That
  // path's `fail()` (`agent-protocol/acp/session.ts`) hard-codes
  // `AGENT_EXECUTION_FAILED` and — unlike the json-event-stream and Claude
  // paths in `server.ts`, which both run `classifyAgentServiceFailure` — never
  // upgrades the code from the text. So an AMR/vela run whose provider replied
  // 「Our servers are currently overloaded」 arrives at this table carrying the
  // opaque code plus one of these two details, and nothing claimed it.
  //
  // What that cost the user is not a missing sentence. The generic card's
  // `messageKey` is null, and a null messageKey is what hands the description
  // slot back to the upstream string — so the card rendered vela's whole
  // diagnostic envelope (`json-rpc id 4: opencode event stream: {"id":"evt_…",
  // …,"sessionID":"ses_…"}`) while the one sentence that described the failure,
  // 「Our servers are currently overloaded. Please try again later.」, sat
  // quoted inside it. (Observed on packaged 0.21.2-beta.1, 2026-09-07.)
  //
  // Same card as `fatal_rpc_error` above, deliberately: one scenario, one
  // story, and the copy + its 19 locales already exist. `daemonNamedTheFailure`
  // has been naming these two as the known gap in its own docblock ("genuinely
  // transient ones (`upstream_5xx`, `provider_high_demand`)"); this closes it.
  //
  // Ladder rung 2 — the provider's wobble passes, so Retry is the honest button
  // and matches the daemon's own verdict for this family (`retryable: true` /
  // `user_action: 'retry'`, `run-failure-classification.ts` upstreamDetail).
  //
  // ⚠️ `upstream_client_error` and `network_error` — the other two members of
  // `upstreamDetail()` — are deliberately NOT here. A 4xx / request-shape
  // rejection is R-050, not R-051, and repeats identically (`retryable: false`),
  // so S10's 「稍后再试通常就好」 would be a lie; `network_error` is the residue
  // where the endpoint was never reached, which R-054 sends to the client
  // environment card, not to a provider-outage card. Both need their own row,
  // and neither is what this change is about.
  upstream_5xx: retryWithGuidance(
    'chat.runError.title.upstreamUnavailable',
    'chat.runError.upstreamUnavailableMessage',
  ),
  provider_high_demand: retryWithGuidance(
    'chat.runError.title.upstreamUnavailable',
    'chat.runError.upstreamUnavailableMessage',
  ),
  // S18 · risk control suspended the account (catalogue R-064: "card — contact
  // support, no Retry"). Resolved here, ahead of the AMR branch, because the
  // suspension is the ACCOUNT's and the AMR catch-all below would otherwise
  // render it as "task failed" with a Retry that can only fail the same way.
  // Ladder rung 4, and deliberately no switch card: a suspended account has the
  // same problem on the hosted path.
  account_suspended: contactSupportOnly(
    'chat.runError.title.accountSuspended',
    'chat.runError.accountSuspendedMessage',
  ),
  // The `model_unavailable` family — the one failure class the daemon fully
  // diagnoses AND prescribes for, and the only one of those that had no row in
  // any of the three tables.
  //
  // `modelUnavailableDetail()` (`run-failure-classification.ts`) reads the cause
  // out of the upstream sentence and rules the run `retryable: false` /
  // `user_action: 'switch_model'`. Web carried only the code-keyed half of that
  // family — `AMR_MODEL_UNAVAILABLE` in `AGENT_AGNOSTIC_FAILURE_UI` above — and a
  // BYOK agent's model problem never arrives under that code: it arrives as the
  // opaque `AGENT_EXECUTION_FAILED` plus one of these details. So it was
  // structurally unreachable, fell to the rung-4 fallback, and the user was told
  // "task failed" with 〔contact support〕 while the daemon had already written
  // down both the cause and the cure. (Observed on a packaged Codex run whose
  // upstream sentence was literally "The '…' model requires a newer version of
  // Codex" — the exact string `cli_version_incompatible` matches on.)
  //
  // Same card as the code-keyed row, deliberately: one family, one story, and
  // the copy, the 19 locales and the 〔switch model〕 button all already exist.
  //
  // Ladder rung 1, and NO retry — neither primary nor secondary. The model
  // picker is ours and re-picking is the one act that changes the outcome;
  // re-running the same CLI against the same model reproduces the same refusal,
  // which is exactly what the daemon's `retryable: false` says. Note these rows
  // do not READ that verdict: the card is right for an older daemon that ships
  // the detail without it, which is the state the wire is actually in today.
  //
  // Resolved HERE and not in `DETAIL_FAILURE_UI` for three reasons:
  //   1. The family's code-keyed row already resolves at this precedence, above
  //      every agent branch. Splitting one card across two layers would make
  //      "may an agent branch pre-empt this?" depend on nothing more than
  //      whether the daemon happened to have a structured error code.
  //   2. The difference is reachable, not theoretical. The classifier's
  //      RATE_LIMITED branch sits BELOW its model branch, so `RATE_LIMITED` +
  //      `model_not_supported` is a real pair — and from `DETAIL_FAILURE_UI`
  //      the Antigravity `RATE_LIMITED` branch would claim it first and title a
  //      model-unavailability 「速率受限」.
  //   3. `DETAIL_FAILURE_UI` is scoped to OVERRIDING a code mapping that is
  //      wrong or too vague. These override nothing — `AGENT_EXECUTION_FAILED`
  //      has no row in any table.
  //
  // ⚠️ `provider_routing_error` is deliberately NOT here even though
  // `modelUnavailableDetail()` also emits it: `upstreamDetail()` emits the SAME
  // string for `upstream_unavailable` / `retryable: true` / `'retry'`, and this
  // module receives the detail without the category, so one row would mis-card
  // the upstream half. It needs `failureCategory` on the wire first.
  //
  // ⚠️ 待拍板 — `local_model_not_loaded` is the one member whose copy fits
  // loosely. The daemon prescribes `switch_model` for it like the rest, and the
  // family card is the honest place for it (the selected model genuinely cannot
  // serve the run), but its literal fix is "load a model in LM Studio", not
  // "pick another model here". Routing is right; the sentence may want its own
  // cell. Change the wording, not the row, when product writes one.
  cli_version_incompatible: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  model_not_found: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  model_not_supported: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  model_disabled: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  local_model_not_loaded: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  // S30 · the five client-environment causes. Agent-agnostic on purpose and
  // resolved here, ahead of every agent branch: the proxy, the certificate
  // store, the route and the host policy belong to the user's machine, so the
  // card is the same one whichever agent happened to be running.
  certificate_failure: clientEnvironmentCard(
    'chat.runError.clientEnvironmentCause.certificate',
  ),
  proxy_configuration: clientEnvironmentCard(
    'chat.runError.clientEnvironmentCause.proxy',
  ),
  network_configuration: clientEnvironmentCard(
    'chat.runError.clientEnvironmentCause.network',
  ),
  host_policy_block: clientEnvironmentCard(
    'chat.runError.clientEnvironmentCause.hostPolicy',
  ),
  // ⚠️ 待拍板 — this one is a local SQLite/WAL I/O failure, not a network path.
  // The design gives the environment family exactly one card (S30) and W28's
  // brief lists all five under it, so it renders here with its own cause noun;
  // but S30's opening clause (「看起来走了代理或公司网络」) does not describe this
  // failure. Either it needs its own sentence or it needs its own scenario.
  local_storage_failure: clientEnvironmentCard(
    'chat.runError.clientEnvironmentCause.localStorage',
  ),
};

// Resolve the failure UI for a failed run:
//   - ACP CLI refused the session → named type + change-the-CLI guidance
//   - agent-agnostic root cause (cli missing, prompt too large, model
//     unavailable, tool loop, bad output, bad runtime def) → named type + fix
//   - agent-agnostic failure_detail (timeout, empty output, stale resumed
//     session, missing Git Bash) → named type + retry, for every agent
//   - AMR agent, auth required      → authorize-and-retry button, clearer copy
//   - AMR agent, insufficient funds → recharge button + manual retry, clearer copy
//   - AMR agent, tier entitlement   → upgrade button + manual retry
//   - AMR agent, anything else      → keeps walking the table below
//   - fine-grained failure_detail (hard quota, workspace credits, text-detected
//     cli-missing) → named type + fix, overriding a too-coarse code
//   - non-AMR agent, model/auth/quota error → plain retry + promotion card
//   - any agent, generic failure            → plain retry
//
// AMR is the DEFAULT hosted agent, so anything its branch fails to hand on is a
// gap on the most-used path. The branch therefore names only what is genuinely
// AMR-specific and then falls through; `withoutCloudSelfPromotion` at the exit
// keeps that safe by making rung 3 unreachable for a run already on Cloud.
export function resolveRunFailureUi(
  code: string | null | undefined,
  detail: string | null | undefined,
  agentId: string | null | undefined,
  rawMessage?: string | null,
  verdict?: RunFailureDaemonVerdict | null,
): RunFailureUi {
  const ui = resolveRunFailureUiIgnoringSelfPromotion(
    code,
    detail,
    agentId,
    rawMessage,
    verdict,
  );
  return agentId === CLOUD_NATIVE_AGENT_ID ? withoutCloudSelfPromotion(ui) : ui;
}

function resolveRunFailureUiIgnoringSelfPromotion(
  code: string | null | undefined,
  detail: string | null | undefined,
  agentId: string | null | undefined,
  rawMessage?: string | null,
  verdict?: RunFailureDaemonVerdict | null,
): RunFailureUi {
  // An ACP agent CLI that answered `initialize` and then refused to open a
  // session. Resolved before every other branch, and before the static
  // agent-agnostic table, because this code carries a prescription of its own
  // (change the CLI build, then retry) that the generic mappings would erase.
  // The daemon deliberately sends only the code plus the runtime identity as
  // data — a sentence composed there could never be translated (see
  // runtimes/acp-handshake-failure.ts).
  //
  // The copy names the installed build without quoting a version number. The
  // daemon does have a detected version, but reading the one THIS run started
  // with costs a pre-spawn probe on every launch, so naming it is deliberately
  // left to a follow-up rather than paid for on the failure path here.
  if (code === 'AGENT_CLI_SESSION_REFUSED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.cliSessionRefused',
      messageKey: 'chat.runError.cliSessionRefusedMessage',
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  // Agent-agnostic codes resolve first so an AMR/Antigravity run that hits one
  // of them still gets the specific guidance instead of the generic fallback.
  const agnostic = typeof code === 'string' ? AGENT_AGNOSTIC_FAILURE_UI[code] : undefined;
  if (agnostic) return agnostic;
  // A rolling per-model window (the hosted gateway's `model_limit_exceeded`)
  // resolves before every agent branch. It has to: the window is the gateway's,
  // not the agent's, and the AMR branch below ends in a catch-all that would
  // otherwise render it as "task failed" with the raw English sentence as the
  // body. The reset instant is read from the same upstream text the card
  // already displays, through the shared contracts reader.
  if (detail === 'model_window_limit') {
    // The daemon already decided this IS a window limit, so read the instant
    // directly rather than re-deciding from the text — an upstream rewording
    // that the daemon still classified must not silently lose the card.
    const parsed = readModelWindowResetAt(rawMessage);
    const retryAt = parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
    // The window rolls over on its own — as transient as a failure gets (rung 2).
    return failureCard(
      { transient: true },
      'chat.runError.title.modelWindowLimit',
      retryAt
        ? 'chat.runError.modelWindowLimitMessage'
        : 'chat.runError.modelWindowLimitMessageNoTime',
      retryAt ? { messageVars: { retryAt } } : {},
    );
  }
  // Membership concurrency is a temporary policy gate carried inside an ACP
  // fatal envelope. Keep the Retry button manual, name the wait explicitly,
  // and preserve the upstream reset instant when one is present.
  if (detail === 'membership_concurrency_limit') {
    const parsed = readMembershipConcurrencyResetAt(rawMessage);
    const retryAt = parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.membershipConcurrencyLimit',
      messageKey: retryAt
        ? 'chat.runError.membershipConcurrencyLimitMessage'
        : 'chat.runError.membershipConcurrencyLimitMessageNoTime',
      ...(retryAt ? { messageVars: { retryAt } } : {}),
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  // Engine-neutral failure_detail (timeout, empty output, stale resumed session,
  // missing Git Bash) resolves before the agent branches so it applies to every
  // agent — including AMR, whose branch below otherwise returns a generic retry.
  const agnosticDetail =
    typeof detail === 'string' ? AGENT_AGNOSTIC_DETAIL_FAILURE_UI[detail] : undefined;
  if (agnosticDetail) return agnosticDetail;
  if (agentId === CLOUD_NATIVE_AGENT_ID) {
    // The daemon's classifier already treats these three codes as ONE class
    // (`run-failure-classification.ts` → category `auth`, user_action `login`).
    // Web only recognised the AMR-branded one, so an AMR run whose auth failure
    // arrived under the generic code fell through to the catch-all — and after
    // the catch-all is gone it would pick up the non-AMR card below, whose copy
    // ("run the login command in your terminal") is wrong for an agent that
    // signs in inside the app. Alias them here instead.
    if (
      code === 'AMR_AUTH_REQUIRED' ||
      code === 'AGENT_AUTH_REQUIRED' ||
      code === 'UNAUTHORIZED'
    ) {
      // Rung 1: we can sign the user in from inside the card. PRD「需要登录」type
      // — shared title with the non-AMR sign-in case. No AMR promotion (the
      // agent already IS AMR); the authorize action reuses the inline
      // AmrLoginPill (sign-in + auto-retry on success).
      return failureCard(
        { directFix: 'authorize' },
        'chat.runError.title.signInRequired',
        'chat.runError.signInMessage.amr',
      );
    }
    if (code === 'AMR_INSUFFICIENT_BALANCE') {
      // 钱的事只有一张卡:升级卡(交付稿组件 18)。
      //
      // 用户 2026-09-02 裁决:「额度不足和额度耗尽,升级卡各只有一张,**不存在
      // 第二张白色通用报错卡**」。在此之前这一格返回的是通用 `failureCard`,于是
      // 同一件事被说两遍 —— 发送前那道闸门出的是升级卡(剩余额度 + Upgrade),
      // 跑到一半出的却是白卡 + 四颗按钮(联系支持 / 导出日志 / 充值 / 重试)。
      // 两块 UI 讲一件事、还是两种说法,正是设计稿要避免的。
      //
      // 所以这一档整张卡不画,交给升级卡。点亮它的是 `ProjectView` ——
      // 它认出这条失败之后去把钱包读数取回来,喂给 `amrBalanceCardUsd`
      // (见 `amrInsufficientBalanceFailureMessageId`)。这和 R9 断线那一档
      // 是同一个手法:`suppressCard` 的意思一直都是「别人已经在说这件事了」。
      //
      // 剩下的字段不是死码:标题 / 正文仍是这条失败**在别处**的人话来源
      // (被 `RunErrorCard` 之外的读者引用时),而 `secondaryRetry` 描述的是
      // 这条失败本身可重试 —— 判定不因为这张卡不画就改变。
      return {
        ...failureCard(
          { directFix: 'recharge' },
          'chat.runError.title.balance',
          'chat.amrError.balanceMessage',
          { secondaryRetry: true },
        ),
        suppressCard: true,
      };
    }
    if (code === 'AMR_TIER_UPGRADE_REQUIRED') {
      return failureCard(
        { directFix: 'upgrade' },
        'chat.amrBalanceGate.title',
        null,
        { secondaryRetry: true },
      );
    }
    // Workspace credits are OUR credits, so topping them up is a rung-1 action
    // we can run from inside the card — the same one `AMR_INSUFFICIENT_BALANCE`
    // offers, and the same one the daemon itself names (user_action `recharge`,
    // `run-failure-classification.ts`). The shared `DETAIL_FAILURE_UI` row below
    // answers rung 3 ("switch to Cloud"), which is right for a BYOK run and
    // meaningless here. Retry stays as a secondary because the top-up lands
    // out-of-band, exactly as in the balance case.
    if (detail === 'workspace_credits_exhausted') {
      return failureCard(
        { directFix: 'recharge' },
        'chat.runError.title.quotaExhausted',
        'chat.runError.workspaceCreditsMessage',
        { secondaryRetry: true },
      );
    }
    // No catch-all. Everything past this point — S11 connection dropped, S09
    // rate limit, S10 upstream unavailable, S08 provider quota, S01 missing CLI
    // — is agent-neutral and was dead code for AMR while this branch ended in a
    // generic card. The exit-point invariant strips the AMR promotion those
    // shared mappings carry for BYOK agents.
  }
  // Antigravity's auth flow is terminal-only — see the
  // `launch-terminal-auth` action comment for why. Without this branch
  // the user sees the daemon-emitted guidance text and would have to
  // open a terminal themselves; with it they get a one-click button
  // that opens Terminal.app / x-terminal-emulator / cmd with `agy`
  // running, and a Retry button to redo the chat after OAuth completes.
  if (agentId === 'antigravity') {
    if (code === 'AGENT_AUTH_REQUIRED') {
      return failureCard(
        { directFix: 'launch-terminal-auth' },
        'chat.runError.title.signInRequired',
        null,
        { secondaryRetry: true },
      );
    }
    // Quota: each Antigravity model has its own quota, so the action
    // is "open agy, switch model" rather than "sign in." Same handler
    // spawns the same terminal; only the label changes.
    if (code === 'RATE_LIMITED') {
      return failureCard(
        { directFix: 'launch-terminal-switch-model' },
        'chat.runError.title.rateLimited',
        null,
        { secondaryRetry: true },
      );
    }
  }
  // Fine-grained daemon classification overrides a too-coarse code (e.g.
  // hard_quota vs a transient 429 both arriving as RATE_LIMITED). Placed after
  // the AMR/Antigravity agent branches so their bespoke quota/auth flows still
  // win, and before the generic code branches so it can correct them.
  const detailUi = typeof detail === 'string' ? DETAIL_FAILURE_UI[detail] : undefined;
  if (detailUi) return detailUi;
  // Agent-neutral: a mid-response connection drop (any agent) gets a clear,
  // localized "lost connection — retry" message instead of the raw SDK string.
  // Not an AMR-promotable case: the break is the user's own network path, which
  // switching model service wouldn't fix.
  if (code === 'AGENT_CONNECTION_DROPPED') {
    return retryWithGuidance(
      'chat.runError.title.connectionDropped',
      'chat.connectionDropped',
    );
  }
  // Non-AMR sign-in required (any non-amr, non-antigravity agent — those two are
  // handled above). The agent's login lives in the user's own terminal, so Open
  // Design can't sign in for them: surface a "{agent} 尚未登录，请本地检查登录状态"
  // message, offer Retry as the primary action (re-run after they log in
  // locally), and promote AMR as the steadier alternative via the switch card.
  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return failureCard(
      { transient: true },
      'chat.runError.title.signInRequired',
      'chat.runError.signInMessage.other',
      { showSwitchCard: true },
    );
  }
  // Non-antigravity rate limit / upstream outage: name the type and explain the
  // recovery (wait & retry / switch service), and still promote AMR as the
  // steadier hosted alternative. Antigravity's own RATE_LIMITED was handled
  // above (per-model quota → switch model in terminal).
  if (code === 'RATE_LIMITED') {
    return failureCard(
      { transient: true },
      'chat.runError.title.rateLimited',
      'chat.runError.rateLimitedMessage',
      { showSwitchCard: true },
    );
  }
  if (code === 'UPSTREAM_UNAVAILABLE') {
    return failureCard(
      { transient: true },
      'chat.runError.title.upstreamUnavailable',
      'chat.runError.upstreamUnavailableMessage',
      { showSwitchCard: true },
    );
  }
  const promote = typeof code === 'string' && PROMOTE_AMR_CODES.has(code);
  // Nothing above claimed this failure — but two very different situations end
  // up here, and until now they shared one answer.
  //
  // (a) The daemon NAMED the cause and this table has no row for it. The old
  //     comment here read "Nothing named this failure", which was simply untrue
  //     of `certificate_failure` and forty-odd siblings: the daemon named them,
  //     ruled them non-retryable, and web handed out a Retry anyway. When its
  //     verdict is available it decides, because it read the run and this is a
  //     lookup table. Rung 4.
  //
  // (b) The daemon did not know either. Keep the retry — an unclassified
  //     failure really is usually a one-off.
  //
  // The `daemonNamedTheFailure` guard is load-bearing, not decoration: the
  // classifier's own last-resort row is `classification('unknown', 'unknown',
  // 'finalize', retryableHint ?? false, retryableHint ? 'retry' : 'none')`, so
  // a plain unknown failure carries `retryable: false` / `'none'` by DEFAULT.
  // Reading the verdict without this guard would therefore strip the Retry from
  // exactly the case that is supposed to keep it.
  if (daemonNamedTheFailure(detail) && daemonSaysRetryIsFutile(verdict)) {
    return failureCard({}, 'chat.runError.title.generic', null, {
      showSwitchCard: promote,
    });
  }
  // Copy comes from RUN_FAILURE_FALLBACK_MESSAGE_KEY at render time, not from
  // the upstream string, which stays in the collapsible diagnostic area.
  return failureCard({ transient: true }, 'chat.runError.title.generic', null, {
    showSwitchCard: promote,
  });
}
