import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  assertSeededOnboardingRetained,
  asPackagedAppShellSnapshot,
  PackagedOnboardingSeedError,
  evaluatePackagedAppShellProbe,
  evaluatePackagedOnboardingConfigProbe,
  PackagedOnboardingConfigError,
  packagedAppShellExpression,
  packagedOnboardingCompletedFromProbe,
  packagedOnboardingCompletedForScenario,
  packagedOnboardingConfigExpression,
  packagedOnboardingOutcomeFromProbe,
  runPackagedAppShellPhase,
  type PackagedOnboardingConfigFetch,
  packagedAppShellFailureReason,
  packagedAppShellPolicy,
  packagedAppRouteUrl,
  packagedAppShellSettled,
  packagedAppShellState,
  type PackagedAppShellProbeDocument,
  type PackagedAppShellProbeElement,
  type PackagedAppShellSnapshot,
} from '@/vitest/packaged-app-shell';

/**
 * A fixture element the probe can `instanceof`-check and measure. `rects` is
 * the `getClientRects().length` the real renderer reports: zero means the node
 * is in the tree but paints nothing (display:none, detached subtree), which the
 * probe must not read as a visible home rail.
 */
class FixtureElement implements PackagedAppShellProbeElement {
  constructor(
    readonly classes: readonly string[],
    readonly attributes: Readonly<Record<string, string>>,
    private readonly rects: number,
  ) {}

  getClientRects(): ArrayLike<unknown> {
    return Array.from({ length: this.rects }, () => ({}));
  }
}

type FixtureNode = {
  attributes?: Record<string, string>;
  classes?: string[];
  rects?: number;
};

/**
 * Enough of `querySelector` for the selectors the probe uses: class selectors,
 * `[attr="value"]` selectors, and comma-separated groups.
 */
function matchesSelector(element: FixtureElement, selector: string): boolean {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .some((simple) => {
      if (simple.startsWith('.')) return element.classes.includes(simple.slice(1));
      const attribute = /^\[([^=\]]+)="([^"]*)"\]$/.exec(simple);
      if (attribute?.[1] != null && attribute[2] != null) {
        return element.attributes[attribute[1]] === attribute[2];
      }
      throw new Error(`fixture selector engine does not support ${JSON.stringify(simple)}`);
    });
}

function renderFixture(
  nodes: readonly FixtureNode[],
  options: { bodyText?: string; title?: string } = {},
): PackagedAppShellProbeDocument {
  const elements = nodes.map(
    (node) => new FixtureElement(node.classes ?? [], node.attributes ?? {}, node.rects ?? 1),
  );
  return {
    body: { textContent: options.bodyText ?? '' },
    querySelector: (selectors) => elements.find((element) => matchesSelector(element, selectors)) ?? null,
    querySelectorAll: (selectors) => elements.filter((element) => matchesSelector(element, selectors)),
    title: options.title ?? 'Open Design',
  };
}

function probe(document: PackagedAppShellProbeDocument): PackagedAppShellSnapshot {
  const value = evaluatePackagedAppShellProbe(document, FixtureElement);
  const snapshot = asPackagedAppShellSnapshot(value);
  if (snapshot == null) throw new Error(`probe returned an unusable snapshot: ${JSON.stringify(value)}`);
  return snapshot;
}

// The surface a signed-in packaged app comes up on.
const HOME_SHELL: readonly FixtureNode[] = [
  { classes: ['entry-shell'] },
  { attributes: { 'data-testid': 'entry-nav-home' }, classes: ['entry-nav__item'] },
  { attributes: { 'data-testid': 'entry-nav-updater' }, classes: ['entry-nav__item'] },
];

// The auth-first surface a fresh install or a completed but signed-out core
// run comes up on: EntryShell's onboarding shell wrapping OnboardingView's
// identity gate. Runtime selection intentionally follows Cloud sign-in.
const CLOUD_SIGN_IN_LANDING: readonly FixtureNode[] = [
  { classes: ['entry-shell', 'entry-shell--no-header', 'entry-shell--onboarding'] },
  { classes: ['entry-onboarding-modal'] },
  { classes: ['onboarding-view', 'onboarding-view--cloud'] },
  { classes: ['onboarding-cloud__primary'] },
];

describe('packaged app-shell probe', () => {
  it('accepts auth-first routes as packaged renderer URLs', () => {
    expect(packagedAppRouteUrl('od://app/')).toBe(true);
    expect(packagedAppRouteUrl('od://app/onboarding')).toBe(true);
    expect(packagedAppRouteUrl('http://127.0.0.1:3000/')).toBe(false);
  });

  it('ships a self-contained expression that reads the globals the renderer has', () => {
    expect(packagedAppShellExpression).toContain('(document, HTMLElement)');
    expect(packagedAppShellExpression).toContain('[data-testid="entry-nav-home"]');
    expect(packagedAppShellExpression).toContain('.onboarding-cloud__primary');
  });

  it('tracks the identity gate rendered by the current onboarding shell', async () => {
    const [entryShellSource, macSpecSource, winSpecSource] = await Promise.all([
      readFile(new URL('../../../apps/web/src/components/EntryShell.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../specs/mac.spec.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../specs/win.spec.ts', import.meta.url), 'utf8'),
    ]);
    const identityProbe = "querySelector('.onboarding-cloud__primary')";

    expect(entryShellSource).toContain('className="onboarding-cloud__primary"');
    expect(packagedAppShellExpression).toContain('.onboarding-cloud__primary');
    expect(macSpecSource).toContain(identityProbe);
    expect(winSpecSource).toContain(identityProbe);
  });

  it('reports home for the main shell', () => {
    expect(probe(renderFixture(HOME_SHELL))).toMatchObject({
      cloudSignInVisible: false,
      homeVisible: true,
      onboardingVisible: false,
    });
  });

  it('reports the cloud sign-in identity gate', () => {
    expect(probe(renderFixture(CLOUD_SIGN_IN_LANDING))).toMatchObject({
      cloudSignInVisible: true,
      homeVisible: false,
      onboardingVisible: true,
    });
  });

  it('does not read an unpainted home rail as visible', () => {
    expect(
      probe(renderFixture([{ attributes: { 'data-testid': 'entry-nav-home' }, rects: 0 }])).homeVisible,
    ).toBe(false);
  });

  it('reports nothing for a blank window', () => {
    expect(probe(renderFixture([], { title: '' }))).toMatchObject({
      cloudSignInVisible: false,
      homeVisible: false,
      onboardingVisible: false,
    });
  });
});

describe('packaged app-shell terminal state', () => {
  it('settles on home for every profile', () => {
    const snapshot = probe(renderFixture(HOME_SHELL));

    expect(packagedAppShellState(snapshot)).toBe('home');
    expect(packagedAppShellSettled(snapshot, { acceptOnboardingLanding: false })).toBe(true);
    expect(packagedAppShellSettled(snapshot, { acceptOnboardingLanding: true })).toBe(true);
  });

  // The bug this file exists for. A packaged first run that nobody signs in to
  // comes to rest on the cloud sign-in landing — `connectStepRuntimeReady` in
  // EntryShell.tsx will not advance without a signed-in cloud account, an
  // installed local CLI, or a verified BYOK key, none of which a release runner
  // has. Treating that as "not settled" made the Windows smoke wait 45s for a
  // home shell that can never arrive, which is why the 0.18.0 stable cut had to
  // fall back to `win_x64_smoke_mode: skip`.
  it('settles on the cloud sign-in landing when the profile only needs a rendered surface', () => {
    const snapshot = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    expect(packagedAppShellState(snapshot)).toBe('onboarding-landing');
    expect(packagedAppShellSettled(snapshot, { acceptOnboardingLanding: true })).toBe(true);
  });

  it('still requires home when the profile has to drive the entry rail', () => {
    const snapshot = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    expect(packagedAppShellSettled(snapshot, { acceptOnboardingLanding: false })).toBe(false);
    expect(packagedAppShellFailureReason(snapshot, { acceptOnboardingLanding: false })).toContain(
      'needs home',
    );
  });

  it('rejects a blank window under every profile', () => {
    const snapshot = probe(renderFixture([]));

    expect(packagedAppShellState(snapshot)).toBeNull();
    expect(packagedAppShellSettled(snapshot, { acceptOnboardingLanding: true })).toBe(false);
    expect(packagedAppShellFailureReason(snapshot, { acceptOnboardingLanding: true })).toContain(
      'neither the home nav rail nor the onboarding cloud sign-in landing rendered',
    );
  });

  // A renderer that mounted the onboarding shell and then died mid-render is a
  // real failure, not a gated first run: accepting bare `onboardingVisible`
  // would have turned this check into "anything that is not home".
  it('rejects an onboarding shell that never rendered its landing', () => {
    const snapshot = probe(
      renderFixture([
        { classes: ['entry-shell', 'entry-shell--onboarding'] },
        { classes: ['entry-onboarding-modal'] },
      ]),
    );

    expect(packagedAppShellState(snapshot)).toBeNull();
    expect(packagedAppShellSettled(snapshot, { acceptOnboardingLanding: true })).toBe(false);
    expect(packagedAppShellFailureReason(snapshot, { acceptOnboardingLanding: true })).toContain(
      'cloud sign-in landing did not render',
    );
  });

  it('rejects a snapshot the renderer could not produce', () => {
    expect(packagedAppShellState(null)).toBeNull();
    expect(packagedAppShellState({ homeVisible: true })).toBeNull();
    expect(packagedAppShellSettled(undefined, { acceptOnboardingLanding: true })).toBe(false);
    expect(packagedAppShellFailureReason(null, { acceptOnboardingLanding: true })).toContain(
      'no app-shell snapshot',
    );
  });
});

// The postcondition PerishCode's review on #6481 asked to keep: a run that
// seeds onboarding as completed must still notice when a cold launch loses it.
// Auth-first means a retained completed user may legitimately see the same
// cloud sign-in landing as a first run, so the seed check and surface policy
// must stay separate.
describe('packaged app-shell policy', () => {
  it('accepts the auth-first landing when a seeded core run retained onboarding completion', () => {
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));
    const policy = packagedAppShellPolicy({
      coreProfile: true,
      daemonOnboardingCompleted: true,
      seededOnboardingCompleted: true,
    });

    expect(policy).toEqual({ acceptOnboardingLanding: true });
    expect(packagedAppShellSettled(landing, policy)).toBe(true);
  });

  it('requires home when the scenario does not establish auth-first permission', () => {
    expect(
      packagedAppShellPolicy({ coreProfile: true, daemonOnboardingCompleted: true, seededOnboardingCompleted: false }),
    ).toEqual({ acceptOnboardingLanding: false });
    expect(
      packagedAppShellPolicy({ coreProfile: false, daemonOnboardingCompleted: true, seededOnboardingCompleted: true }),
    ).toEqual({ acceptOnboardingLanding: false });
  });

  it('accepts the landing only when the daemon reports onboarding is not completed', () => {
    expect(
      packagedAppShellPolicy({ coreProfile: true, daemonOnboardingCompleted: false, seededOnboardingCompleted: false }),
    ).toEqual({ acceptOnboardingLanding: true });
  });

  it('does not infer completed-user auth permission without a seed', () => {
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));
    const policy = packagedAppShellPolicy({ coreProfile: true, daemonOnboardingCompleted: true, seededOnboardingCompleted: false });

    expect(packagedAppShellSettled(landing, policy)).toBe(false);
    expect(packagedAppShellFailureReason(landing, policy)).toContain('needs home');
  });

  // Swept alongside the probe fix: both of these read their input for
  // truthiness, so anything that is not a real boolean falls through to the
  // permissive branch. TypeScript forbids it today and the sole producer is
  // validated, but the closed direction should be structural rather than
  // dependent on a caller staying honest — only an explicit `false` may buy
  // permission.
  it('requires home for any onboarding reading that is not an explicit false', () => {
    for (const daemonOnboardingCompleted of [undefined, null, '', 0, NaN, 'false']) {
      expect(
        packagedAppShellPolicy({
          coreProfile: true,
          daemonOnboardingCompleted: daemonOnboardingCompleted as unknown as boolean,
          seededOnboardingCompleted: false,
        }),
        `reading ${JSON.stringify(daemonOnboardingCompleted)}`,
      ).toEqual({ acceptOnboardingLanding: false });
    }
  });

  it('requires an explicit permission before accepting the landing', () => {
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    for (const acceptOnboardingLanding of [undefined, null, 1, 'yes']) {
      expect(
        packagedAppShellSettled(landing, {
          acceptOnboardingLanding: acceptOnboardingLanding as unknown as boolean,
        }),
        `permission ${JSON.stringify(acceptOnboardingLanding)}`,
      ).toBe(false);
    }
  });

  // PerishCode's fifth review on #6481, the same family one level out: at the
  // level of the scenario rather than a single expression. This run seeds
  // `onboardingCompleted: true` and observes the daemon confirm it, then stops
  // the app and relaunches it through the OS protocol handler — which inherits
  // none of the test process's environment. If that cold launch resolves a
  // different data root, the seeded config is gone, the fresh reading is
  // `false`, and "we lost the seed" is absorbed as "genuine first run". The
  // smoke would then pass while blind to the regression it exists to catch.
  it('never downgrades a lost seed to a genuine first run', () => {
    expect(
      packagedAppShellPolicy({
        coreProfile: true,
        daemonOnboardingCompleted: false,
        seededOnboardingCompleted: true,
      }),
    ).toEqual({ acceptOnboardingLanding: false });
  });

  it('keeps a lost seed failing at the shell check', () => {
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));
    const policy = packagedAppShellPolicy({
      coreProfile: true,
      daemonOnboardingCompleted: false,
      seededOnboardingCompleted: true,
    });

    expect(packagedAppShellSettled(landing, policy)).toBe(false);
  });

  it('fails a lost seed with a cause that names the cold launch', () => {
    expect(() =>
      assertSeededOnboardingRetained({
        daemonOnboardingCompleted: false,
        seededOnboardingCompleted: true,
      }),
    ).toThrow(PackagedOnboardingSeedError);
    expect(() =>
      assertSeededOnboardingRetained({
        daemonOnboardingCompleted: false,
        seededOnboardingCompleted: true,
      }),
    ).toThrow(/lost the seeded onboarding state.*tools-pack runtime data root/s);
  });

  it('passes a retained seed and an honestly unseeded run', () => {
    expect(() =>
      assertSeededOnboardingRetained({
        daemonOnboardingCompleted: true,
        seededOnboardingCompleted: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertSeededOnboardingRetained({
        daemonOnboardingCompleted: false,
        seededOnboardingCompleted: false,
      }),
    ).not.toThrow();
  });

  it('lets an unseeded run settle on the landing', () => {
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));
    const policy = packagedAppShellPolicy({ coreProfile: true, daemonOnboardingCompleted: false, seededOnboardingCompleted: false });

    expect(packagedAppShellSettled(landing, policy)).toBe(true);
  });

  it('still requires a real surface when onboarding is not completed', () => {
    const policy = packagedAppShellPolicy({ coreProfile: true, daemonOnboardingCompleted: false, seededOnboardingCompleted: false });

    expect(packagedAppShellSettled(probe(renderFixture([])), policy)).toBe(false);
  });
});

/**
 * A fake `/api/app-config`. `throws` models a renderer whose fetch rejects
 * outright (daemon socket gone); the rest model real HTTP answers.
 */
function fakeConfigFetch(options: {
  body?: unknown;
  ok?: boolean;
  status?: number;
  throws?: boolean;
}): PackagedOnboardingConfigFetch {
  return async () => {
    if (options.throws === true) throw new Error('fetch failed');
    return {
      json: async () => options.body,
      ok: options.ok ?? true,
      status: options.status ?? 200,
    };
  };
}

// PerishCode's second review on #6481: the probe converted an HTTP failure into
// `onboardingCompleted: false`, which is the exact branch that permits the
// onboarding landing. The fact the shell policy depends on could fail to be
// established and the smoke would pass anyway. An unestablished fact must be an
// error, never a permission.
describe('packaged daemon onboarding config probe', () => {
  it('reads a real completed config', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(
      fakeConfigFetch({ body: { config: { onboardingCompleted: true } } }),
    );

    expect(packagedOnboardingCompletedFromProbe(value)).toBe(true);
  });

  it('reads a real first-run config', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(
      fakeConfigFetch({ body: { config: { onboardingCompleted: false } } }),
    );

    expect(packagedOnboardingCompletedFromProbe(value)).toBe(false);
  });

  it('refuses to answer when the daemon returns a server error', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(
      fakeConfigFetch({ ok: false, status: 500 }),
    );

    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(/500/);
  });

  it('refuses to answer when the route is missing', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(
      fakeConfigFetch({ ok: false, status: 404 }),
    );

    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
      PackagedOnboardingConfigError,
    );
  });

  it('refuses to answer when the daemon is not reachable at all', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(fakeConfigFetch({ throws: true }));

    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
      PackagedOnboardingConfigError,
    );
  });

  it('refuses to answer when the response carries no config', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(fakeConfigFetch({ body: {} }));

    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
      PackagedOnboardingConfigError,
    );
  });

  // Round 3 fixed the transport half but left the payload half coerced:
  // `config.onboardingCompleted === true` turns a missing key, a null, or the
  // string "false" into a well-formed `false`, which the reader then accepts as
  // a real reading. "The daemon did not tell me" must never arrive as "the
  // daemon told me false".
  // Absent, not malformed: the daemon never wrote the key. A seeded run must
  // still reject it — there the absence means the seed vanished — but it is the
  // one outcome a declared first run legitimately accepts.
  it('classifies a 200 with no onboardingCompleted field as absent', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(fakeConfigFetch({ body: { config: {} } }));

    expect(packagedOnboardingOutcomeFromProbe(value).kind).toBe('absent');
    expect(packagedOnboardingCompletedForScenario(packagedOnboardingOutcomeFromProbe(value), 'first-run')).toBe(false);
    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(PackagedOnboardingSeedError);
  });

  it('refuses to answer when onboardingCompleted is the wrong type', async () => {
    for (const onboardingCompleted of ['false', 'true', 0, 1, null, {}, []]) {
      const value = await evaluatePackagedOnboardingConfigProbe(
        fakeConfigFetch({ body: { config: { onboardingCompleted } } }),
      );

      expect(value, `payload ${JSON.stringify(onboardingCompleted)}`).toMatchObject({ ok: false });
      expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
        PackagedOnboardingConfigError,
      );
    }
  });

  it('refuses to answer when config is an array rather than an object', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(fakeConfigFetch({ body: { config: [] } }));

    expect(value).toMatchObject({ ok: false });
    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
      PackagedOnboardingConfigError,
    );
  });

  it('names the status so a failure says what could not be established', async () => {
    const value = await evaluatePackagedOnboardingConfigProbe(
      fakeConfigFetch({ ok: false, status: 503 }),
    );

    expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
      /onboarding config could not be established.*503/s,
    );
  });

  // The load-bearing one: a failed probe must never reach the policy at all, so
  // it can never be the thing that permits the landing.
  it('never lets a failed probe become permission to accept the landing', async () => {
    const failures = [
      fakeConfigFetch({ ok: false, status: 500 }),
      fakeConfigFetch({ ok: false, status: 404 }),
      fakeConfigFetch({ throws: true }),
      fakeConfigFetch({ body: null }),
    ];

    for (const failure of failures) {
      const value = await evaluatePackagedOnboardingConfigProbe(failure);
      expect(() => packagedOnboardingCompletedFromProbe(value)).toThrow(
        PackagedOnboardingConfigError,
      );
    }
  });

  it('ships an expression that binds fetch for the renderer', () => {
    expect(packagedOnboardingConfigExpression).toContain("fetch(input)");
    expect(packagedOnboardingConfigExpression).toContain('/api/app-config');
  });
});

describe('packaged app-shell snapshot guards', () => {
  it('rejects a malformed snapshot', () => {
    expect(packagedAppShellState(null)).toBeNull();
    expect(packagedAppShellState({ homeVisible: true })).toBeNull();
    expect(packagedAppShellSettled(undefined, { acceptOnboardingLanding: true })).toBe(false);
    expect(packagedAppShellFailureReason(null, { acceptOnboardingLanding: true })).toContain(
      'no app-shell snapshot',
    );
  });
});

// PerishCode's sixth review on #6481: the unit fixtures prove the rule, but the
// release smoke seeds unconditionally, so `seededObserved` is always true at the
// only policy call site and the unseeded cases exercise a state the smoke can
// never enter. These drive the smoke's own transition — read the daemon fact,
// hold the seeded state across it, derive the policy, settle — with only the
// I/O faked, for both scenarios the packaged app legitimately has.
describe('packaged launch scenarios', () => {
  const virtualClock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; } };
  };

  it('settles a genuine first run on the cloud sign-in landing', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    const result = await runPackagedAppShellPhase({
      coreProfile: true,
      now: clock.now,
      observe: async () => landing,
      readOnboardingConfig: async () => ({ kind: 'reading', ok: true, onboardingCompleted: false, status: 200 }),
      scenario: 'first-run',
      sleep: clock.sleep,
    });

    expect(result).toEqual({ appShell: 'onboarding-landing', onboardingCompleted: false });
  });

  it('settles a completed user on home', async () => {
    const clock = virtualClock();
    const home = probe(renderFixture(HOME_SHELL));

    const result = await runPackagedAppShellPhase({
      coreProfile: true,
      now: clock.now,
      observe: async () => home,
      readOnboardingConfig: async () => ({ kind: 'reading', ok: true, onboardingCompleted: true, status: 200 }),
      scenario: 'completed-user',
      sleep: clock.sleep,
    });

    expect(result).toEqual({ appShell: 'home', onboardingCompleted: true });
  });

  it('settles a retained completed user on the core auth-first landing', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    const result = await runPackagedAppShellPhase({
      coreProfile: true,
      now: clock.now,
      observe: async () => landing,
      readOnboardingConfig: async () => ({ kind: 'reading', ok: true, onboardingCompleted: true, status: 200 }),
      scenario: 'completed-user',
      sleep: clock.sleep,
    });

    expect(result).toEqual({ appShell: 'onboarding-landing', onboardingCompleted: true });
  });

  it('fails a completed user whose seeded state was lost across the relaunch', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    await expect(
      runPackagedAppShellPhase({
        coreProfile: true,
        now: clock.now,
        observe: async () => landing,
        readOnboardingConfig: async () => ({ kind: 'reading', ok: true, onboardingCompleted: false, status: 200 }),
        scenario: 'completed-user',
        sleep: clock.sleep,
      }),
    ).rejects.toThrow(PackagedOnboardingSeedError);
  });

  it('fails a first run whose renderer never painted either surface', async () => {
    const clock = virtualClock();
    const blank = probe(renderFixture([]));

    await expect(
      runPackagedAppShellPhase({
        coreProfile: true,
        now: clock.now,
        observe: async () => blank,
        readOnboardingConfig: async () => ({ kind: 'reading', ok: true, onboardingCompleted: false, status: 200 }),
        scenario: 'first-run',
        sleep: clock.sleep,
      }),
    ).rejects.toThrow(/neither the home nav rail nor the onboarding cloud sign-in landing rendered/);
  });
});

// PerishCode's seventh review on #6481. Round 4 made a missing
// `onboardingCompleted` fail closed; round 6 then added a scenario that
// produces exactly that, and they collide. `resetPackagedRuntimeDataRoot()`
// deletes `app-config.json`; `readAppConfig` returns `{}` on ENOENT and adds
// only telemetry defaults, so a fresh install's `/api/app-config` OMITS the key
// rather than reporting `false`. **Absent is not malformed.**
describe('real fresh-install app-config response', () => {
  // Byte-shaped like the daemon's actual fresh reply: `readAppConfig` ->
  // `applyTelemetryDefaults({})`.
  const FRESH_INSTALL_BODY = { config: { telemetry: { content: true, metrics: true } } };

  const virtualClock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; } };
  };

  it('settles a first run whose daemon never wrote the key', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    const result = await runPackagedAppShellPhase({
      coreProfile: true,
      now: clock.now,
      observe: async () => landing,
      readOnboardingConfig: async () =>
        evaluatePackagedOnboardingConfigProbe(fakeConfigFetch({ body: FRESH_INSTALL_BODY })),
      scenario: 'first-run',
      sleep: clock.sleep,
    });

    expect(result).toEqual({ appShell: 'onboarding-landing', onboardingCompleted: false });
  });

  it('still fails a completed user whose key went missing', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    await expect(
      runPackagedAppShellPhase({
        coreProfile: true,
        now: clock.now,
        observe: async () => landing,
        readOnboardingConfig: async () =>
          evaluatePackagedOnboardingConfigProbe(fakeConfigFetch({ body: FRESH_INSTALL_BODY })),
        scenario: 'completed-user',
        sleep: clock.sleep,
      }),
    ).rejects.toThrow(PackagedOnboardingSeedError);
  });

  it('keeps a wrong-typed key a fault even for a first run', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    await expect(
      runPackagedAppShellPhase({
        coreProfile: true,
        now: clock.now,
        observe: async () => landing,
        readOnboardingConfig: async () =>
          evaluatePackagedOnboardingConfigProbe(
            fakeConfigFetch({ body: { config: { onboardingCompleted: 'false' } } }),
          ),
        scenario: 'first-run',
        sleep: clock.sleep,
      }),
    ).rejects.toThrow(PackagedOnboardingConfigError);
  });

  it('keeps transport and HTTP faults closed for a first run', async () => {
    const clock = virtualClock();
    const landing = probe(renderFixture(CLOUD_SIGN_IN_LANDING));

    for (const failure of [fakeConfigFetch({ ok: false, status: 500 }), fakeConfigFetch({ throws: true })]) {
      await expect(
        runPackagedAppShellPhase({
          coreProfile: true,
          now: clock.now,
          observe: async () => landing,
          readOnboardingConfig: async () => evaluatePackagedOnboardingConfigProbe(failure),
          scenario: 'first-run',
          sleep: clock.sleep,
        }),
      ).rejects.toThrow(PackagedOnboardingConfigError);
    }
  });
});
