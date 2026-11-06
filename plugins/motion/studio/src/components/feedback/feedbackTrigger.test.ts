// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// The policy module decides whether this profile may be measured at all; the
// trigger refuses to ask anyone it cannot hear, so every test here has to say
// which of those two worlds it is in.
vi.mock("../../telemetry/policy", () => ({
  browserTelemetryAllowed: () => telemetryAllowed,
}));

let telemetryAllowed = true;

const {
  requestStudioFeedback,
  subscribeToFeedbackRequests,
  markFeedbackAnswered,
  markFeedbackDismissed,
  followUpFor,
  isProblemReason,
} = await import("./feedbackTrigger");

const DAY_MS = 86_400_000;

function collect() {
  const seen: unknown[] = [];
  const unsubscribe = subscribeToFeedbackRequests((r) => seen.push(r));
  return { seen, unsubscribe };
}

beforeEach(() => {
  telemetryAllowed = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestStudioFeedback eligibility", () => {
  it("asks on the first eligible request", () => {
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "render_complete", renderId: "r1" });
    expect(seen).toEqual([{ reason: "render_complete", renderId: "r1" }]);
    unsubscribe();
  });

  it("asks only once per tab session, however many renders finish", () => {
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "render_complete", renderId: "r1" });
    requestStudioFeedback({ reason: "render_complete", renderId: "r2" });
    requestStudioFeedback({ reason: "render_failed", renderId: "r3" });
    expect(seen).toHaveLength(1);
    unsubscribe();
  });

  it("stays silent for 30 days after an answer", () => {
    markFeedbackAnswered();
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "render_complete" });
    expect(seen).toHaveLength(0);
    unsubscribe();
  });

  it("asks again once the 30 day answer cooldown has passed", () => {
    localStorage.setItem("hyperframes-studio:feedbackAnsweredAt", String(Date.now() - 31 * DAY_MS));
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "render_complete" });
    expect(seen).toHaveLength(1);
    unsubscribe();
  });

  it("stays silent for 7 days after a dismissal, then asks again", () => {
    markFeedbackDismissed();
    const first = collect();
    requestStudioFeedback({ reason: "render_complete" });
    expect(first.seen).toHaveLength(0);
    first.unsubscribe();

    sessionStorage.clear();
    localStorage.setItem("hyperframes-studio:feedbackDismissedAt", String(Date.now() - 8 * DAY_MS));
    const second = collect();
    requestStudioFeedback({ reason: "render_complete" });
    expect(second.seen).toHaveLength(1);
    second.unsubscribe();
  });

  it("never asks a profile that opted out of telemetry", () => {
    telemetryAllowed = false;
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "crash" });
    expect(seen).toHaveLength(0);
    unsubscribe();
  });

  it("does not burn the session slot on an ineligible request", () => {
    telemetryAllowed = false;
    const blocked = collect();
    requestStudioFeedback({ reason: "render_complete" });
    blocked.unsubscribe();

    // Opting back in mid-session must not find the one ask already spent.
    telemetryAllowed = true;
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "render_complete" });
    expect(seen).toHaveLength(1);
    unsubscribe();
  });

  it("drops the request when nothing is listening", () => {
    expect(() => requestStudioFeedback({ reason: "crash" })).not.toThrow();
    // The ask was not spent, so the next real subscriber still gets asked.
    const { seen, unsubscribe } = collect();
    requestStudioFeedback({ reason: "crash" });
    expect(seen).toHaveLength(1);
    unsubscribe();
  });
});

describe("follow-up selection", () => {
  it("gives every detractor the complaint question, never a rotated one", () => {
    for (let rating = 0; rating <= 6; rating++) {
      expect(followUpFor(rating).id).toBe("detractor");
    }
  });

  it("rotates among the three research questions above 6", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(followUpFor(9).id);
    expect([...ids].sort()).toEqual(["fix", "remove", "workaround"]);
  });

  it("gives every question scannable, distinct one-tap answers with explanations", () => {
    for (const rating of [0, 7, 8, 9, 10]) {
      const q = followUpFor(rating);
      // Four is the floor for a useful spread; past seven the chips stop being
      // scannable in a 340px card and start being a form.
      expect(q.presets.length).toBeGreaterThanOrEqual(4);
      expect(q.presets.length).toBeLessThanOrEqual(7);
      expect(new Set(q.presets.map((p) => p.label)).size).toBe(q.presets.length);
      for (const p of q.presets) {
        expect(p.hint.length).toBeGreaterThan(0);
        // A label that wraps to two lines in a chip row is not scannable.
        expect(p.label.length).toBeLessThanOrEqual(24);
      }
    }
  });

  it("offers no brand names, which are a popularity vote and not an instruction", () => {
    const brands = /capcut|premiere|resolve|after effects|final cut|remotion|canva|descript/i;
    for (const rating of [0, 7, 8, 9, 10]) {
      for (const p of followUpFor(rating).presets) {
        expect(p.label).not.toMatch(brands);
        expect(p.hint).not.toMatch(brands);
      }
    }
  });
});

describe("isProblemReason", () => {
  it("treats everything except a finished render as a problem report", () => {
    expect(isProblemReason("render_complete")).toBe(false);
    expect(isProblemReason("render_failed")).toBe(true);
    expect(isProblemReason("crash")).toBe(true);
  });
});
