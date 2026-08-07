/**
 * The packaged Windows smoke's app-shell probe and the rule that reads it.
 *
 * `specs/win.spec.ts` only executes on a Windows runner that has a packaged
 * build installed, and the probe below reaches the packaged renderer as a
 * plain string through `tools-pack inspect --expr` — so neither the compiler
 * nor any cross-platform suite ever sees it. Keeping the probe text and the
 * terminal-state rule that consumes its result in one pure module lets
 * `tests/packaged/app-shell.test.ts` hold both to a contract from any platform.
 */

/**
 * Runs inside the packaged renderer. Written as a two-argument arrow function
 * rather than an IIFE so the exact same text can be evaluated in Node against a
 * fixture document (see `evaluatePackagedAppShellProbe`); in the renderer both
 * arguments are the ordinary globals.
 */
const PACKAGED_APP_SHELL_PROBE = `
  (doc, ElementCtor) => {
    const home = doc.querySelector('[data-testid="entry-nav-home"]');
    const onboardingShell = doc.querySelector('.entry-shell--onboarding, .entry-onboarding-modal');
    const cloudSignIn = doc.querySelector('.onboarding-cloud__primary');
    return {
      cloudSignInVisible: cloudSignIn instanceof ElementCtor,
      homeVisible: home instanceof ElementCtor && home.getClientRects().length > 0,
      onboardingVisible: onboardingShell instanceof ElementCtor,
      text: doc.body?.textContent?.trim().slice(0, 300) ?? '',
      title: doc.title,
    };
  }
`;

export const packagedAppShellExpression = `(${PACKAGED_APP_SHELL_PROBE})(document, HTMLElement)`;

export type PackagedAppShellSnapshot = {
  cloudSignInVisible: boolean;
  homeVisible: boolean;
  onboardingVisible: boolean;
  text: string;
  title: string;
};

export type PackagedAppShellProbeElement = {
  getClientRects(): ArrayLike<unknown>;
};

export type PackagedAppShellProbeDocument = {
  body: { textContent: string | null } | null;
  querySelector(selectors: string): PackagedAppShellProbeElement | null;
  querySelectorAll(selectors: string): Iterable<PackagedAppShellProbeElement>;
  title: string;
};

/**
 * Evaluates the shipped probe text against a fixture document.
 *
 * The probe is a string, so nothing in the normal build checks it. Running the
 * identical text here is the only way a non-Windows machine can prove that the
 * selectors, the `getClientRects` visibility rule, and the reported field set
 * still behave as the smoke expects.
 */
export function evaluatePackagedAppShellProbe(
  document: PackagedAppShellProbeDocument,
  elementConstructor: new (...args: never[]) => PackagedAppShellProbeElement,
): unknown {
  // Parenthesized deliberately: the probe text opens with a newline, and a bare
  // `return` followed by one gets an automatic semicolon.
  const probe = new Function(`return (${PACKAGED_APP_SHELL_PROBE});`)() as (
    document: PackagedAppShellProbeDocument,
    elementConstructor: unknown,
  ) => unknown;
  return probe(document, elementConstructor);
}

export function asPackagedAppShellSnapshot(value: unknown): PackagedAppShellSnapshot | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  const candidate = value as Partial<PackagedAppShellSnapshot>;
  if (
    typeof candidate.cloudSignInVisible !== 'boolean' ||
    typeof candidate.homeVisible !== 'boolean' ||
    typeof candidate.onboardingVisible !== 'boolean' ||
    typeof candidate.text !== 'string' ||
    typeof candidate.title !== 'string'
  ) {
    return null;
  }
  return candidate as PackagedAppShellSnapshot;
}

/**
 * A surface the packaged app can legitimately come to rest on.
 *
 * `home` is the signed-in/seeded main shell. `onboarding-landing` is the cloud
 * sign-in landing a first run stops at.
 */
export type PackagedAppShellState = 'home' | 'onboarding-landing';

/**
 * Which settled surface the renderer is showing, or `null` while it is showing
 * neither — a blank window, a crashed renderer, a boot still on the loader, or
 * a half-rendered onboarding shell all fall through to `null`.
 *
 * The landing is recognised positively from the identity gate's sign-in CTA.
 * Local and BYOK are intentionally unavailable until identity completes, so a
 * bare `onboardingVisible` would degrade this into "anything that is not home"
 * and stop failing on a renderer that mounted the shell and then died.
 */
export function packagedAppShellState(value: unknown): PackagedAppShellState | null {
  const snapshot = asPackagedAppShellSnapshot(value);
  if (snapshot == null) return null;
  if (snapshot.homeVisible) return 'home';
  if (snapshot.onboardingVisible && snapshot.cloudSignInVisible) {
    return 'onboarding-landing';
  }
  return null;
}

/**
 * Reads the daemon's own onboarding-completion fact inside the packaged
 * renderer. `GET /api/app-config` serves `readAppConfig(RUNTIME_DATA_DIR)`, so
 * this reports what the running daemon resolved.
 *
 * `fetch` is taken as an argument (and wrapped at the call site, since an
 * unbound `fetch` throws in a browser) so the same text can be driven against a
 * fake in Node.
 */
const PACKAGED_ONBOARDING_CONFIG_PROBE = `
  (async (fetchImpl) => {
    try {
      const response = await fetchImpl('/api/app-config');
      const status = typeof response.status === 'number' ? response.status : null;
      if (!response.ok) return { error: 'daemon returned HTTP ' + status, kind: 'http-error', ok: false, status };
      const body = await response.json();
      const config = body == null ? null : body.config;
      if (config == null || typeof config !== 'object' || Array.isArray(config)) {
        return { error: 'daemon response carried no config object', kind: 'no-config', ok: false, status };
      }
      // Absent is not malformed. A daemon whose app-config.json does not exist
      // returns {} plus telemetry defaults, so the key is simply missing — a
      // legitimate reading of a fresh install. A key present with the wrong type
      // is corruption. They get different outcomes because different scenarios
      // may accept them.
      if (!('onboardingCompleted' in config)) {
        return { kind: 'absent', ok: false, status };
      }
      // Require the type before reading it. Coercing here (\`x === true\`) would
      // manufacture a boolean out of a null or the string "false" — and the
      // manufactured value is \`false\`, which is exactly the reading that
      // permits the onboarding landing.
      if (typeof config.onboardingCompleted !== 'boolean') {
        return {
          error: 'daemon config carried a non-boolean onboardingCompleted (got '
            + (config.onboardingCompleted === null ? 'null' : typeof config.onboardingCompleted)
            + ')',
          kind: 'malformed',
          ok: false,
          status,
        };
      }
      return { kind: 'reading', ok: true, onboardingCompleted: config.onboardingCompleted, status };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        kind: 'transport-failure',
        ok: false,
        status: null,
      };
    }
  })
`;

export const packagedOnboardingConfigExpression = `(${PACKAGED_ONBOARDING_CONFIG_PROBE})((input) => fetch(input))`;

export type PackagedOnboardingConfigFetch = (input: string) => Promise<{
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
}>;

export function evaluatePackagedOnboardingConfigProbe(
  fetchImpl: PackagedOnboardingConfigFetch,
): Promise<unknown> {
  const probe = new Function(`return (${PACKAGED_ONBOARDING_CONFIG_PROBE});`)() as (
    fetchImpl: PackagedOnboardingConfigFetch,
  ) => Promise<unknown>;
  return probe(fetchImpl);
}

/**
 * Raised when the daemon's onboarding-completion fact could not be established.
 *
 * Its own type so a caller can never mistake "we could not find out" for a
 * `false` reading.
 */
export class PackagedOnboardingConfigError extends Error {
  constructor(reason: string) {
    super(`packaged windows daemon onboarding config could not be established: ${reason}`);
    this.name = 'PackagedOnboardingConfigError';
  }
}

/**
 * The daemon's `onboardingCompleted`, or an error.
 *
 * Never returns a default. An unestablished fact must not become a permission.
 */
/**
 * The complete set of distinct outcomes this probe can produce, and which
 * scenario may accept each. Seven review rounds on #6481 each found a defect of
 * one family: a *fault* and an *absence* sharing a representation. This table is
 * the fix for the family rather than for any one instance.
 *
 * | outcome            | meaning                                    | first-run | completed-user |
 * |--------------------|--------------------------------------------|-----------|----------------|
 * | `transport-failure`| fetch rejected; daemon unreachable         | reject    | reject         |
 * | `http-error`       | non-2xx from `/api/app-config`             | reject    | reject         |
 * | `no-config`        | 200 whose body carried no `config` object  | reject    | reject         |
 * | `absent`           | 200, `config` present, key never written   | **accept**| reject         |
 * | `malformed`        | key present but not a boolean              | reject    | reject         |
 * | `reading`          | key present and boolean                    | accept    | accept if true |
 *
 * `absent` is the only asymmetric row, and it is asymmetric for a reason: a key
 * that was never written is the honest state of a fresh install, whereas in a
 * run that seeded completion its disappearance means the seed vanished.
 */
export type PackagedOnboardingConfigOutcomeKind =
  | 'absent'
  | 'http-error'
  | 'malformed'
  | 'no-config'
  | 'reading'
  | 'transport-failure';

export type PackagedOnboardingConfigOutcome = {
  readonly error: string | null;
  readonly kind: PackagedOnboardingConfigOutcomeKind;
  readonly onboardingCompleted: boolean | null;
  readonly status: number | null;
};

const PACKAGED_ONBOARDING_OUTCOME_KINDS: readonly PackagedOnboardingConfigOutcomeKind[] = [
  'absent',
  'http-error',
  'malformed',
  'no-config',
  'reading',
  'transport-failure',
];

/**
 * Classifies a probe result. Raises only when the probe itself produced
 * something unusable — never to express a daemon-side fault, which is a value.
 */
export function packagedOnboardingOutcomeFromProbe(value: unknown): PackagedOnboardingConfigOutcome {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new PackagedOnboardingConfigError(
      `the probe returned no result (${JSON.stringify(value) ?? 'undefined'})`,
    );
  }
  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  if (typeof kind !== 'string' || !PACKAGED_ONBOARDING_OUTCOME_KINDS.includes(kind as PackagedOnboardingConfigOutcomeKind)) {
    throw new PackagedOnboardingConfigError(`the probe returned no recognisable outcome (${JSON.stringify(candidate)})`);
  }
  const status = typeof candidate.status === 'number' ? candidate.status : null;
  if (kind === 'reading') {
    if (status !== 200 || typeof candidate.onboardingCompleted !== 'boolean') {
      throw new PackagedOnboardingConfigError(
        `the probe claimed a reading without one (${JSON.stringify(candidate)})`,
      );
    }
    return { error: null, kind, onboardingCompleted: candidate.onboardingCompleted, status };
  }
  return {
    error: typeof candidate.error === 'string' ? candidate.error : null,
    kind: kind as PackagedOnboardingConfigOutcomeKind,
    onboardingCompleted: null,
    status,
  };
}

/**
 * Applies the table above: the daemon's onboarding fact for this scenario, or an
 * error naming what could not be established.
 */
export function packagedOnboardingCompletedForScenario(
  outcome: PackagedOnboardingConfigOutcome,
  scenario: PackagedLaunchScenario,
): boolean {
  if (outcome.kind === 'reading') {
    if (outcome.onboardingCompleted == null) {
      throw new PackagedOnboardingConfigError('the reading carried no value');
    }
    return outcome.onboardingCompleted;
  }
  if (outcome.kind === 'absent') {
    // A fresh install has never written the key; that IS "not completed".
    if (scenario === 'first-run') return false;
    // In a seeded run the key must exist. Its absence means the seed vanished,
    // which is the round-5 regression, so raise that cause rather than this one.
    throw new PackagedOnboardingSeedError(
      'the relaunched daemon has no onboardingCompleted at all, so the seeded state is gone — check that the protocol cold launch still resolves the tools-pack runtime data root',
    );
  }
  throw new PackagedOnboardingConfigError(
    `${outcome.error ?? outcome.kind} (status=${outcome.status ?? 'none'})`,
  );
}

/**
 * Back-compat reader for call sites that already know they are in a seeded
 * (completed-user) run, where every non-reading outcome is a fault.
 */
export function packagedOnboardingCompletedFromProbe(value: unknown): boolean {
  return packagedOnboardingCompletedForScenario(packagedOnboardingOutcomeFromProbe(value), 'completed-user');
}

export type PackagedAppShellPolicyInput = {
  /**
   * What the daemon itself reports for `onboardingCompleted`, read from
   * `GET /api/app-config` — which serves `readAppConfig(RUNTIME_DATA_DIR)`, the
   * daemon's own resolved data root.
   */
  readonly daemonOnboardingCompleted: boolean;
  /** Whether the run is the core smoke profile. */
  readonly coreProfile: boolean;
  /**
   * Whether this run seeded onboarding completion and observed the daemon
   * confirm it earlier, before any relaunch.
   */
  readonly seededOnboardingCompleted: boolean;
};


/**
 * Which terminal states this run may settle on.
 *
 * Derived from the daemon's own `onboardingCompleted`, never from the smoke
 * profile, so a run's setup and its accepted terminal state cannot disagree.
 * The smoke seeds `onboardingCompleted: true` before start; if the daemon
 * confirms it, the renderer must honour it and home is the only acceptable
 * outcome — that is what keeps a broken completed-onboarding boot path
 * detectable on the core release lane. Only a run whose daemon reports
 * onboarding as *not* completed is a genuine first run, and only then is the
 * cloud sign-in landing a legitimate place to stop.
 *
 * `coreProfile` still narrows it: the full profile goes on to drive the entry
 * rail, which `clickUpdaterRailExpression` refuses while onboarding is up, so
 * it needs home either way.
 */
export function packagedAppShellPolicy(
  input: PackagedAppShellPolicyInput,
): { readonly acceptOnboardingLanding: boolean } {
  // A run that seeded completion and saw the daemon confirm it may never accept
  // the landing, whatever a later reading says. Losing the seed across a
  // relaunch is a regression, not a downgrade to "genuine first run" — see
  // `assertSeededOnboardingRetained`, which is what turns that loss into a
  // named failure rather than merely a stricter expectation here.
  if (input.seededOnboardingCompleted !== false) return { acceptOnboardingLanding: false };
  // Only an explicit `false` — a daemon that positively said "not completed" —
  // buys permission. Testing for truthiness instead would let any non-boolean
  // that leaked past the type fall through to the permissive branch, which is
  // the same shape of defect as coercing the reading in the first place.
  if (input.daemonOnboardingCompleted !== false) return { acceptOnboardingLanding: false };
  return { acceptOnboardingLanding: input.coreProfile === true };
}

/**
 * Polls an observation until the renderer settles on a state the policy allows.
 *
 * The clock and sleep are injectable so the transition can be driven without
 * waiting out a real timeout.
 */
export async function settlePackagedAppShell(options: {
  readonly describeLast?: (value: unknown) => string;
  readonly now?: () => number;
  readonly observe: () => Promise<unknown>;
  readonly policy: { readonly acceptOnboardingLanding: boolean };
  readonly sleep?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
}): Promise<PackagedAppShellState> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = options.timeoutMs ?? 45_000;
  const startedAt = now();
  let lastResult: unknown = null;
  let lastValue: unknown = null;

  while (now() - startedAt < timeoutMs) {
    try {
      const observed = await options.observe();
      lastResult = observed;
      lastValue = observed;
      if (packagedAppShellSettled(lastValue, options.policy)) {
        const state = packagedAppShellState(lastValue);
        if (state != null) return state;
      }
    } catch (error) {
      lastResult = error;
    }
    await sleep(750);
  }

  throw new Error(
    [
      `packaged windows runtime did not reach a usable app shell: ${packagedAppShellFailureReason(lastValue, options.policy)}`,
      options.describeLast?.(lastResult) ?? String(lastResult),
    ].join('\n'),
  );
}

/**
 * Raised when a run that seeded onboarding completion, and saw the daemon
 * confirm it, later observes it gone.
 */
export class PackagedOnboardingSeedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PackagedOnboardingSeedError';
  }
}

/**
 * Holds the run's own seeded state across a process transition.
 *
 * Once this run has seeded completion and observed `true`, a later `false` is a
 * regression in the packaged runtime, never new information about the user. The
 * core profile stops the app and relaunches it through the OS protocol handler,
 * which inherits none of this process's environment — so if that cold launch
 * resolves a different data root, the seeded config disappears. This is the
 * point where that loss becomes a failure with a cause attached, instead of
 * being absorbed as a first run.
 */
export function assertSeededOnboardingRetained(input: {
  readonly daemonOnboardingCompleted: boolean;
  readonly seededOnboardingCompleted: boolean;
}): void {
  if (input.seededOnboardingCompleted !== true) return;
  if (input.daemonOnboardingCompleted === true) return;
  throw new PackagedOnboardingSeedError(
    'the relaunched daemon lost the seeded onboarding state — check that the protocol cold launch still resolves the tools-pack runtime data root',
  );
}

/**
 * The two launch scenarios the packaged app legitimately has.
 *
 * Both are real product behaviour, not a contradiction.
 * `shouldRouteToFirstRunOnboarding` (apps/web/src/App.tsx) keys purely on
 * `onboardingCompleted`, and `connectStepRuntimeReady` (EntryShell.tsx) lets
 * onboarding complete through cloud sign-in *or* a local CLI *or* a verified
 * BYOK key. So "completed setup, currently signed out -> home" and "never
 * completed -> cloud sign-in landing" are both correct.
 */
export type PackagedLaunchScenario = 'completed-user' | 'first-run';

/**
 * Walks one launch scenario: read the daemon's onboarding fact, hold the run's
 * own seeded state across the transition, derive the policy, and settle.
 *
 * Returns the reading alongside the state so the caller can record both.
 */
export async function runPackagedAppShellPhase(options: {
  readonly coreProfile: boolean;
  readonly describeLast?: (value: unknown) => string;
  readonly now?: () => number;
  readonly observe: () => Promise<unknown>;
  readonly readOnboardingConfig: () => Promise<unknown>;
  readonly scenario: PackagedLaunchScenario;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
}): Promise<{ appShell: PackagedAppShellState; onboardingCompleted: boolean }> {
  const onboardingCompleted = packagedOnboardingCompletedForScenario(
    packagedOnboardingOutcomeFromProbe(await options.readOnboardingConfig()),
    options.scenario,
  );
  // Only a completed-user phase carries a seed to hold across the transition. A
  // first-run phase deliberately has none, so `false` there is the fact under
  // test rather than a loss — which is why the scenario has to be declared by
  // the caller instead of inferred from the reading.
  const seededOnboardingCompleted = options.scenario === 'completed-user';
  assertSeededOnboardingRetained({ daemonOnboardingCompleted: onboardingCompleted, seededOnboardingCompleted });
  const policy = packagedAppShellPolicy({
    coreProfile: options.coreProfile,
    daemonOnboardingCompleted: onboardingCompleted,
    seededOnboardingCompleted,
  });
  const appShell = await settlePackagedAppShell({
    ...(options.describeLast == null ? {} : { describeLast: options.describeLast }),
    ...(options.now == null ? {} : { now: options.now }),
    observe: options.observe,
    policy,
    ...(options.sleep == null ? {} : { sleep: options.sleep }),
    ...(options.timeoutMs == null ? {} : { timeoutMs: options.timeoutMs }),
  });
  return { appShell, onboardingCompleted };
}

/**
 * Whether the renderer has reached a surface the caller can proceed from.
 *
 * `acceptOnboardingLanding` belongs to the caller because the answer depends on
 * what the smoke does next, not on what the app is allowed to show.
 */
export function packagedAppShellSettled(
  value: unknown,
  options: { readonly acceptOnboardingLanding: boolean },
): boolean {
  const state = packagedAppShellState(value);
  if (state === 'home') return true;
  // Explicit permission only, for the same reason as `packagedAppShellPolicy`.
  return state === 'onboarding-landing' && options.acceptOnboardingLanding === true;
}

/**
 * A named cause for the timeout, so a failed run points at a layer instead of
 * dumping an opaque snapshot.
 */
export function packagedAppShellFailureReason(
  value: unknown,
  options: { readonly acceptOnboardingLanding: boolean },
): string {
  const snapshot = asPackagedAppShellSnapshot(value);
  if (snapshot == null) return 'the packaged renderer returned no app-shell snapshot';
  if (packagedAppShellState(value) === 'onboarding-landing' && !options.acceptOnboardingLanding) {
    return 'the packaged renderer stopped on the onboarding cloud sign-in landing, but this smoke profile has to drive the entry rail and needs home';
  }
  if (snapshot.onboardingVisible) {
    return 'the onboarding shell mounted but its cloud sign-in landing did not render (no sign-in CTA, or fewer than two runtime links)';
  }
  return 'neither the home nav rail nor the onboarding cloud sign-in landing rendered';
}
