// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { evaluateCanary } from "@hyperframes/core/canary";

// Pin the registry: real entries move as rollouts ramp, and these tests are
// about the BINDING (does the browser supply the right three inputs?), not
// about whichever canaries happen to be live today.
// The policy reads import.meta.env.DEV, which vitest sets true — without
// this every case would resolve to telemetry_opt_out. Controlled explicitly
// so each test states the privacy posture it is exercising.
const policyState = { allowed: true };
vi.mock("./policy", () => ({
  browserTelemetryAllowed: () => policyState.allowed,
}));

vi.mock("@hyperframes/core/canary-registry", async () => {
  const actual = await vi.importActual<typeof import("@hyperframes/core/canary-registry")>(
    "@hyperframes/core/canary-registry",
  );
  const defs = [
    {
      name: "on-everywhere",
      percentage: 100,
      description: "",
      owner: "t",
      sunsetAfter: "2099-01-01",
    },
    {
      name: "off-everywhere",
      percentage: 0,
      description: "",
      owner: "t",
      sunsetAfter: "2099-01-01",
    },
  ];
  return { ...actual, CANARIES: defs, findCanary: (n: string) => defs.find((d) => d.name === n) };
});

const {
  isCanaryEnabled,
  resolveCanary,
  canaryEventProperties,
  canaryParamName,
  __resetStudioCanaryCacheForTests,
} = await import("./canary");
const { resolveStudioDistinctId, __resetStudioDistinctIdForTests } = await import("./distinctId");

function setSearch(search: string): void {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  policyState.allowed = true;
  localStorage.clear();
  sessionStorage.clear();
  setSearch("");
  delete window.__HF_CLI_DISTINCT_ID;
  delete window.__HF_CLI_BUCKET_SEED;
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
  __resetStudioCanaryCacheForTests();
  __resetStudioDistinctIdForTests();
});

afterEach(() => {
  setSearch("");
  __resetStudioCanaryCacheForTests();
  __resetStudioDistinctIdForTests();
});

describe("studio canary binding", () => {
  it("reads the percentage from the shared registry", () => {
    expect(isCanaryEnabled("on-everywhere")).toBe(true);
    expect(isCanaryEnabled("off-everywhere")).toBe(false);
  });

  it("an unregistered name is off, not a throw — a typo must not break the editor", () => {
    expect(isCanaryEnabled("nope")).toBe(false);
    expect(resolveCanary("nope").reason).toBe("out_of_cohort");
  });

  it("derives the query param from the canary name", () => {
    expect(canaryParamName("de-parallel-router")).toBe("hf_canary_de_parallel_router");
  });
});

describe("URL override", () => {
  it("turns a canary on and off from the query string", () => {
    setSearch("?hf_canary_off_everywhere=on");
    expect(resolveCanary("off-everywhere")).toMatchObject({ enabled: true, reason: "forced_on" });

    __resetStudioCanaryCacheForTests();
    setSearch("?hf_canary_on_everywhere=off");
    expect(resolveCanary("on-everywhere")).toMatchObject({ enabled: false, reason: "forced_off" });
  });

  it("survives losing the query string, so in-app navigation keeps the override", () => {
    setSearch("?hf_canary_off_everywhere=on");
    expect(isCanaryEnabled("off-everywhere")).toBe(true);

    // Navigate away from the param — a real SPA drops it constantly.
    __resetStudioCanaryCacheForTests();
    setSearch("");
    expect(isCanaryEnabled("off-everywhere")).toBe(true);
  });

  it("is session-scoped, not persisted to localStorage", () => {
    // A URL-borne override must not silently pin a browser into a cohort
    // forever; closing the tab is the reset.
    setSearch("?hf_canary_off_everywhere=on");
    expect(isCanaryEnabled("off-everywhere")).toBe(true);
    expect(JSON.stringify(localStorage).includes("canary")).toBe(false);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it("=reset clears a stored override", () => {
    setSearch("?hf_canary_off_everywhere=on");
    expect(isCanaryEnabled("off-everywhere")).toBe(true);

    __resetStudioCanaryCacheForTests();
    setSearch("?hf_canary_off_everywhere=reset");
    expect(isCanaryEnabled("off-everywhere")).toBe(false);

    __resetStudioCanaryCacheForTests();
    setSearch("");
    expect(isCanaryEnabled("off-everywhere")).toBe(false);
  });
});

describe("automated browsers", () => {
  it("are excluded from percentage enrolment", () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    expect(resolveCanary("on-everywhere")).toMatchObject({ enabled: false, reason: "excluded" });
  });

  it("still honour an explicit override, so a canary can be tested under automation", () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    setSearch("?hf_canary_on_everywhere=on");
    expect(resolveCanary("on-everywhere")).toMatchObject({ enabled: true, reason: "forced_on" });
  });
});

describe("cohort identity", () => {
  it("buckets on the CLI's bucket seed when injected — the unit that survives config wipes", () => {
    // The CLI buckets on its bucketSeed (inherited across config wipes via
    // the install-state file), so a CLI-launched Studio must bucket on the
    // SAME seed or the two surfaces would split one machine across cohorts.
    const cliId = "db0c1f4a-b95e-4c35-90c6-1a15bd76f717";
    const cliSeed = "5f1c9d2e-0000-4000-8000-aaaaaaaaaaaa";
    window.__HF_CLI_DISTINCT_ID = cliId;
    window.__HF_CLI_BUCKET_SEED = cliSeed;
    __resetStudioDistinctIdForTests();
    __resetStudioCanaryCacheForTests();

    // Telemetry identity still adopts the DISTINCT id — the seed only buckets.
    expect(resolveStudioDistinctId()).toBe(cliId);
    const viaBinding = resolveCanary("on-everywhere").bucket;
    const bySeed = evaluateCanary({
      feature: "on-everywhere",
      unitId: cliSeed,
      percentage: 100,
    }).bucket;
    expect(viaBinding).toBe(bySeed);
  });

  it("buckets on the Studio distinct id when no seed is injected (standalone Studio)", () => {
    const cliId = "db0c1f4a-b95e-4c35-90c6-1a15bd76f717";
    window.__HF_CLI_DISTINCT_ID = cliId;
    __resetStudioDistinctIdForTests();
    __resetStudioCanaryCacheForTests();

    expect(resolveStudioDistinctId()).toBe(cliId);
    const viaBinding = resolveCanary("on-everywhere").bucket;
    const direct = evaluateCanary({
      feature: "on-everywhere",
      unitId: cliId,
      percentage: 100,
    }).bucket;
    expect(viaBinding).toBe(direct);
  });

  it("memoizes so a decision cannot change mid-session", () => {
    expect(isCanaryEnabled("off-everywhere")).toBe(false);
    // A late override must NOT flip a component that already rendered.
    setSearch("?hf_canary_off_everywhere=on");
    expect(isCanaryEnabled("off-everywhere")).toBe(false);
    __resetStudioCanaryCacheForTests();
    expect(isCanaryEnabled("off-everywhere")).toBe(true);
  });
});

describe("telemetry", () => {
  it("emits the same PostHog flag-shaped properties as the CLI", () => {
    expect(canaryEventProperties()).toEqual({
      "$feature/canary-on-everywhere": "true",
      "$feature/canary-off-everywhere": "false",
      canary_reason_on_everywhere: "in_cohort",
      canary_reason_off_everywhere: "out_of_cohort",
    });

    __resetStudioCanaryCacheForTests();
    setSearch("?hf_canary_on_everywhere=off");
    expect(canaryEventProperties()["$feature/canary-on-everywhere"]).toBe("false");
  });
});

describe("telemetry opt-out is canary opt-out", () => {
  // The studio opt-out lever, per telemetry/config.ts.
  const OPT_OUT_KEY = "hyperframes-studio:telemetryDisabled";

  it("does not enrol an opted-out browser profile", () => {
    policyState.allowed = false;
    localStorage.setItem(OPT_OUT_KEY, "1");
    // on-everywhere is at 100% — it would be on for everyone otherwise.
    expect(resolveCanary("on-everywhere")).toEqual({
      enabled: false,
      reason: "telemetry_opt_out",
    });
  });

  it("never buckets an opted-out profile — no cohort is assigned at all", () => {
    policyState.allowed = false;
    localStorage.setItem(OPT_OUT_KEY, "1");
    expect(resolveCanary("on-everywhere").bucket).toBeUndefined();
  });

  it("still honours an explicit URL override", () => {
    policyState.allowed = false;
    localStorage.setItem(OPT_OUT_KEY, "1");
    setSearch("?hf_canary_off_everywhere=on");
    expect(resolveCanary("off-everywhere")).toEqual({ enabled: true, reason: "forced_on" });
  });

  it("reports every canary as false when opted out", () => {
    policyState.allowed = false;
    localStorage.setItem(OPT_OUT_KEY, "1");
    expect(canaryEventProperties()).toEqual({
      "$feature/canary-on-everywhere": "false",
      "$feature/canary-off-everywhere": "false",
      canary_reason_on_everywhere: "telemetry_opt_out",
      canary_reason_off_everywhere: "telemetry_opt_out",
    });
  });
});

describe("CLI-launched Studio adopts the CLI's decisions", () => {
  const OPT_OUT_KEY = "hyperframes-studio:telemetryDisabled";
  const cohort = (enabled: boolean) => ({ enabled, forced: false });
  const forced = (enabled: boolean) => ({ enabled, forced: true });

  afterEach(() => {
    delete window.__HF_CLI_CANARY_DECISIONS;
  });

  // The divergence this exists for: CLI telemetry off resolves every canary
  // to telemetry_opt_out, but Studio's opt-out is a SEPARATE localStorage
  // flag it cannot see — left to itself it would evaluate and could enrol.
  it("stays off when the CLI opted out, even though Studio's own flag is unset", () => {
    expect(localStorage.getItem(OPT_OUT_KEY)).toBeNull();
    window.__HF_CLI_CANARY_DECISIONS = { "on-everywhere": cohort(false) };
    expect(resolveCanary("on-everywhere").enabled).toBe(false);
  });

  // HF_CANARY_* never crosses into the browser, so before this the CLI was
  // forced on and Studio silently guessed from the percentage.
  it("turns on when the CLI forced it on, with no URL param present", () => {
    window.__HF_CLI_CANARY_DECISIONS = { "off-everywhere": forced(true) };
    expect(resolveCanary("off-everywhere").enabled).toBe(true);
  });

  it("beats a contradicting URL override — one render must not run half-enrolled", () => {
    window.__HF_CLI_CANARY_DECISIONS = { "on-everywhere": forced(false) };
    setSearch("?hf_canary_on_everywhere=on");
    expect(resolveCanary("on-everywhere").enabled).toBe(false);
  });

  it("beats the seed-derived bucket", () => {
    window.__HF_CLI_BUCKET_SEED = "5f1c9d2e-0000-4000-8000-aaaaaaaaaaaa";
    window.__HF_CLI_CANARY_DECISIONS = { "on-everywhere": cohort(false) };
    expect(resolveCanary("on-everywhere").enabled).toBe(false);
  });

  it("falls back to local evaluation for a canary the CLI did not publish", () => {
    window.__HF_CLI_CANARY_DECISIONS = { "off-everywhere": cohort(true) };
    expect(resolveCanary("on-everywhere").enabled).toBe(true);
  });

  it("ignores a malformed entry rather than trusting it", () => {
    window.__HF_CLI_CANARY_DECISIONS = {
      "on-everywhere": { enabled: "false" },
    } as unknown as Record<string, { enabled?: boolean; forced?: boolean }>;
    // Falls through to local evaluation: on-everywhere is at 100%.
    expect(resolveCanary("on-everywhere").enabled).toBe(true);
  });

  // Miguel's P1: a percentage roll from the CLI must NOT be able to enrol a
  // browser profile that opted out. The two surfaces have independent
  // opt-outs, and CLI telemetry being on says nothing about this profile.
  describe("precedence against Studio's own opt-out", () => {
    beforeEach(() => {
      policyState.allowed = false;
      localStorage.setItem(OPT_OUT_KEY, "1");
    });

    it("refuses a CLI COHORT enrolment when this profile opted out", () => {
      window.__HF_CLI_CANARY_DECISIONS = { "off-everywhere": cohort(true) };
      expect(resolveCanary("off-everywhere")).toEqual({
        enabled: false,
        reason: "telemetry_opt_out",
      });
    });

    it("honours a CLI FORCED enrolment even when this profile opted out", () => {
      // An explicit HF_CANARY_* override is a deliberate operator choice —
      // the documented escalation channel, same as a local URL override.
      window.__HF_CLI_CANARY_DECISIONS = { "off-everywhere": forced(true) };
      expect(resolveCanary("off-everywhere")).toEqual({ enabled: true, reason: "forced_on" });
    });

    it("honours a CLI forced-OFF when this profile opted out", () => {
      window.__HF_CLI_CANARY_DECISIONS = { "on-everywhere": forced(false) };
      expect(resolveCanary("on-everywhere")).toEqual({ enabled: false, reason: "forced_off" });
    });

    it("still refuses cohort enrolment with no CLI decision at all", () => {
      expect(resolveCanary("on-everywhere").reason).toBe("telemetry_opt_out");
    });
  });
});

// A CLI-launched Studio shares the CLI's bucket seed, so a cohort flip can
// surface on either surface. Attribution on only one of them makes the two
// flip counts irreconcilable — which is why this is not a CLI-only property.
describe("Studio attribution matches the CLI", () => {
  it("distinguishes a local URL override from a cohort roll at the same value", () => {
    setSearch("?hf_canary_off_everywhere=on");
    const props = canaryEventProperties();
    expect(props["$feature/canary-off-everywhere"]).toBe("true");
    expect(props["canary_reason_off_everywhere"]).toBe("forced_on");
    // Same assignment `on-everywhere` reaches by an ordinary roll.
    expect(props["$feature/canary-on-everywhere"]).toBe("true");
    expect(props["canary_reason_on_everywhere"]).toBe("in_cohort");
  });

  it("never puts a reason inside the $feature namespace", () => {
    for (const [key, value] of Object.entries(canaryEventProperties())) {
      if (key.startsWith("$feature/")) expect(value).toMatch(/^(true|false)$/);
    }
  });
});
