import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  acceptedRaises,
  browserMajor,
  checkCeilings,
  correlate,
  formatRow,
  lowerCeilings,
  readBase,
} from "./perf-ratchet.mjs";

describe("checkCeilings", () => {
  it("fails a counter that rose and names it with the rise", () => {
    const { passed, rows } = checkCeilings({ thumbnailRenders: 12 }, { thumbnailRenders: 20 });
    expect(passed).toBe(false);
    expect(formatRow(rows[0])).toBe("FAIL thumbnailRenders rose 12 -> 20 (+8, +67%)");
  });

  it("passes only at the ceiling", () => {
    expect(checkCeilings({ a: 5 }, { a: 5 }).passed).toBe(true);
  });

  it("fails a counter that fell until the improvement is banked", () => {
    const { passed, rows } = checkCeilings({ a: 5 }, { a: 3 });
    expect(passed).toBe(false);
    expect(formatRow(rows[0])).toMatch(/^FAIL a fell 5 -> 3: bank it by setting its ceiling to 3/);
  });

  it("fails a ceiling raised or removed against the base branch", () => {
    const { passed, rows } = checkCeilings({ a: 6 }, { a: 6 }, { a: 5, b: 2 });
    expect(passed).toBe(false);
    expect(rows.map((row) => row.status)).toEqual(["raised", "removed"]);
  });

  it("passes a raise only with a reason the base branch did not give", () => {
    const base = { counts: { a: 5 }, raised: { b: "older raise" } };
    const withReason = { counts: { a: 6 }, raised: { a: "new work on purpose" } };
    expect(
      checkCeilings(withReason.counts, { a: 6 }, base.counts, acceptedRaises(withReason, base))
        .passed,
    ).toBe(true);
    const noReason = { counts: { a: 6 } };
    expect(
      checkCeilings(noReason.counts, { a: 6 }, base.counts, acceptedRaises(noReason, base)).passed,
    ).toBe(false);
    const blank = { counts: { a: 6 }, raised: { a: " " } };
    expect(acceptedRaises(blank, base).size).toBe(0);
    expect(acceptedRaises(blank, { counts: { a: 5 }, raised: { a: "older raise" } }).size).toBe(0);
    const notText = { counts: { a: 6 }, raised: { a: 1 } };
    expect(acceptedRaises(notText, base).size).toBe(0);
  });

  it("does not take a whitespace edit of the base's reason as a new one", () => {
    const base = { counts: { a: 6 }, raised: { a: "new work  on purpose" } };
    const respaced = { counts: { a: 7 }, raised: { a: " new work on purpose " } };
    expect(acceptedRaises(respaced, base).size).toBe(0);
  });

  it("accepts a reason only for a counter whose ceiling went up", () => {
    const entry = { counts: { a: 5 }, raised: { a: "why" } };
    expect(acceptedRaises(entry, { counts: { a: 5 } }).size).toBe(0);
  });

  it("does not reuse a reason the base already gave for a later raise", () => {
    const base = { counts: { a: 6 }, raised: { a: "new work on purpose" } };
    const again = { counts: { a: 7 }, raised: { a: "new work on purpose" } };
    const { passed, rows } = checkCeilings(
      again.counts,
      { a: 7 },
      base.counts,
      acceptedRaises(again, base),
    );
    expect(passed).toBe(false);
    expect(rows[0].status).toBe("raised");
  });

  it("still fails a removed ceiling when other raises carry reasons", () => {
    const entry = { counts: { a: 6 }, raised: { a: "why", b: "why" } };
    const { passed, rows } = checkCeilings(
      entry.counts,
      { a: 6 },
      { a: 5, b: 2 },
      acceptedRaises(entry, { counts: { a: 5, b: 2 } }),
    );
    expect(passed).toBe(false);
    expect(rows.map((row) => row.status)).toEqual(["at", "removed"]);
  });

  it("fails a gated counter the journey did not measure", () => {
    expect(checkCeilings({ reactCommits: 4 }, {}).passed).toBe(false);
    expect(checkCeilings({ reactCommits: 4 }, { reactCommits: Number.NaN }).passed).toBe(false);
  });

  it("refuses an empty ceiling set", () => {
    expect(() => checkCeilings({}, { a: 1 })).toThrow(/checks nothing/);
  });
});

describe("readBase", () => {
  const all = { open: { browser: "153", counts: { a: 1 } } };

  it("returns the base journey's raise reasons", () => {
    const base = { j: { counts: { a: 1 }, raised: { a: "why" } } };
    expect(readBase(base, base, "j").raised).toEqual({ a: "why" });
  });

  it("names base journeys this file dropped", () => {
    const base = { open: { counts: { a: 2 } }, scroll: { counts: { b: 1 } } };
    expect(readBase(base, all, "open")).toEqual({ counts: { a: 2 }, removedJourneys: ["scroll"] });
  });

  it("refuses a base file in a shape it cannot compare", () => {
    expect(() => readBase({ open: { a: 13 } }, all, "open")).toThrow(/no counts object/);
  });
});

describe("browserMajor", () => {
  it("reads Chrome's major version from either evidence shape", () => {
    expect(browserMajor({ browser: "HeadlessChrome/153.0.8010.52" })).toBe("153");
    expect(browserMajor({ environment: { browser: "Chrome/152.0.1.1" } })).toBe("152");
    expect(browserMajor({})).toBe(null);
  });
});

describe("lower", () => {
  const cli = fileURLToPath(new URL("./perf-ratchet.mjs", import.meta.url));
  const setup = (browser) => {
    const dir = mkdtempSync(join(tmpdir(), "perf-ratchet-"));
    const ceilings = join(dir, "ceilings.json");
    const evidence = join(dir, "evidence.json");
    writeFileSync(ceilings, JSON.stringify({ j: { browser: "153", counts: { a: 5 } } }));
    writeFileSync(evidence, JSON.stringify({ browser, workCounts: { a: 2 } }));
    return { ceilings, evidence };
  };

  it("lowers from evidence taken on the recorded browser", () => {
    const { ceilings, evidence } = setup("HeadlessChrome/153.0.1.1");
    execFileSync(process.execPath, [cli, "lower", ceilings, "j", evidence]);
    expect(JSON.parse(readFileSync(ceilings, "utf8")).j.counts).toEqual({ a: 2 });
  });

  it("refuses evidence from another Chrome", () => {
    const { ceilings, evidence } = setup("HeadlessChrome/152.0.1.1");
    expect(() =>
      execFileSync(process.execPath, [cli, "lower", ceilings, "j", evidence], { stdio: "pipe" }),
    ).toThrow(/Chrome 152/);
    expect(JSON.parse(readFileSync(ceilings, "utf8")).j.counts).toEqual({ a: 5 });
  });
});

describe("check", () => {
  const cli = fileURLToPath(new URL("./perf-ratchet.mjs", import.meta.url));
  const run = (reason) => {
    const dir = mkdtempSync(join(tmpdir(), "perf-ratchet-"));
    const file = (name, value) => {
      writeFileSync(join(dir, name), JSON.stringify(value));
      return join(dir, name);
    };
    const base = file("base.json", {
      j: { browser: "153", counts: { a: 5 }, raised: { a: "why" } },
    });
    const ceilings = file("ceilings.json", {
      j: { browser: "153", counts: { a: 6 }, raised: { a: reason } },
    });
    const evidence = file("evidence.json", {
      browser: "HeadlessChrome/153.0.1.1",
      workCounts: { a: 6 },
    });
    return execFileSync(process.execPath, [cli, "check", ceilings, "j", evidence, base], {
      stdio: "pipe",
      encoding: "utf8",
    });
  };

  it("passes a raise with a new reason against the base file and prints it", () => {
    expect(run("new work on purpose")).toMatch(/a raised on purpose: new work on purpose/);
  });

  it("fails a raise that reuses the base file's reason", () => {
    let failure;
    try {
      run("why");
    } catch (error) {
      failure = error;
    }
    expect(failure?.status).toBe(1);
    expect(failure?.stdout).toMatch(/ceiling raised 5 -> 6/);
  });
});

describe("lowerCeilings", () => {
  it("only ever lowers", () => {
    expect(lowerCeilings({ a: 10, b: 10, c: 10 }, { a: 7, b: 12 })).toEqual({ a: 7, b: 10, c: 10 });
  });
});

describe("correlate", () => {
  const run = (variant, wallMs, counts) => ({ variant, wallMs, counts });

  it("gates a counter that repeats within a variant and moves with wall-clock", () => {
    const runs = [
      run("main", 900, { renders: 20, noisy: 3 }),
      run("main", 950, { renders: 20, noisy: 9 }),
      run("fix", 400, { renders: 12, noisy: 5 }),
      run("fix", 420, { renders: 12, noisy: 4 }),
    ];
    const byCounter = Object.fromEntries(correlate(runs).map((row) => [row.counter, row]));
    expect(byCounter.renders.gateable).toBe(true);
    expect(byCounter.noisy.gateable).toBe(false);
  });

  it("does not gate a counter that wobbles even slightly within a variant", () => {
    const runs = [
      run("main", 900, { layouts: 100 }),
      run("main", 950, { layouts: 101 }),
      run("fix", 400, { layouts: 50 }),
      run("fix", 420, { layouts: 50 }),
    ];
    expect(correlate(runs)[0].gateable).toBe(false);
  });

  it("does not gate a counter that never moves", () => {
    const [row] = correlate([run("main", 900, { a: 1 }), run("fix", 400, { a: 1 })]);
    expect(row.gateable).toBe(false);
  });
});
