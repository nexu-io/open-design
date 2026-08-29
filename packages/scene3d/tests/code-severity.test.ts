import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * One issue code names one situation at one severity.
 *
 * The code's own prefix declares its severity — `S3D-E-*`, `S3D-W-*`,
 * `S3D-I-*` — so a code pushed at two severities is a symbol that means two
 * things. A human reader is protected (the report renders the mismatch
 * honestly), but `scene3dIssueTitle` is severity-blind and an authoring agent
 * keying off the bare code gets one answer for two situations. That is the
 * reader this compiler exists to serve.
 *
 * Six codes were split when this rule was adopted, each because the READER'S
 * ACTION differed: a total proof failure against some looks not rendering; a
 * blocking absence of Blender against a note that this machine has none; a
 * stage declaring the WRONG units against declaring NONE; a part measured as
 * floating against grounding that could not be judged at all.
 *
 * What remains below is the deliberate exception, and it is deliberate for one
 * reason only: those codes report the SAME situation at two confidences — a
 * check that did not run at all, versus one that ran partially — rather than
 * two situations. Every entry carries why. An exception without a reason is
 * how this rule stops working.
 */
const SRC = path.join(__dirname, "..", "src");

/**
 * Codes that legitimately carry two severities, each with the reason. The
 * shared shape: the situation is "this check did not fully run", and the
 * severity tracks HOW MUCH of it ran, not what the reader must do.
 */
const ONE_SITUATION_TWO_CONFIDENCES: Record<string, string> = {
  CONTACTS_UNCHECKED:
    "warning when the contact scan did not run at all, info when it ran " +
    "partially — the same 'no measured word for this pair' fact, at two extents",
  PROOF_UNCHECKED:
    "warning when no proof frame could be measured, info when exposure " +
    "coverage is partial — the same unmeasured-proof fact, at two extents",
  EXPORT_FORMAT_UNAVAILABLE:
    "warning when a requested format could not be produced, info when it was " +
    "never requested on this machine — the same missing-deliverable fact",
};

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** The bounds of the object literal that encloses `index`, by brace matching
 *  outward from it — so severity is found wherever it sits in the object, and
 *  the object's length can never push it out of a fixed scan window. */
function enclosingObject(text: string, index: number): string | null {
  let open = -1;
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const c = text[i]!;
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) {
        open = i;
        break;
      }
      depth--;
    }
  }
  if (open < 0) return null;
  depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Every `ISSUE_CODES.X` push, paired with the severity of the object it sits
 * in — found by matching the enclosing object's braces rather than reading a
 * fixed window, so a reordered property or a long object literal cannot let a
 * severity escape the scan and leave the drift this test guards invisible.
 *
 * A COMPUTED severity — `severity: cond ? "error" : "warning"` — is recorded
 * as the special value `"<computed>"`, because a runtime-decided severity is
 * itself one code emitted at more than one severity, which is exactly what the
 * one-severity rule forbids. It is caught, never skipped.
 */
function emissions(): Map<string, Map<string, string[]>> {
  const found = new Map<string, Map<string, string[]>>();
  for (const file of tsFiles(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/ISSUE_CODES\.(\w+)/g)) {
      const name = m[1]!;
      const obj = enclosingObject(text, m.index!);
      if (obj === null || !/\bseverity:/.test(obj)) continue;
      const literal = /severity:\s*"(\w+)"/.exec(obj);
      const severity = literal ? literal[1]! : "<computed>";
      const line = text.slice(0, m.index!).split("\n").length;
      const perCode = found.get(name) ?? new Map<string, string[]>();
      const sites = perCode.get(severity) ?? [];
      sites.push(`${path.relative(SRC, file)}:${line}`);
      perCode.set(severity, sites);
      found.set(name, perCode);
    }
  }
  return found;
}

describe("issue code severity (static)", () => {
  const found = emissions();

  it("scans real emissions, or every assertion below is vacuous", () => {
    expect(found.size).toBeGreaterThan(40);
  });

  it("emits each code at exactly one severity", () => {
    const offenders: string[] = [];
    for (const [name, bySeverity] of found) {
      if (bySeverity.size < 2) continue;
      if (name in ONE_SITUATION_TWO_CONFIDENCES) continue;
      const detail = [...bySeverity]
        .map(([sev, sites]) => `${sev} at ${sites.join(", ")}`)
        .join(" | ");
      offenders.push(`${name}: ${detail}`);
    }
    expect(
      offenders,
      "a code pushed at two severities is one symbol meaning two things — split " +
        "it into two codes, or add it to ONE_SITUATION_TWO_CONFIDENCES with the " +
        "reason it is genuinely one situation at two confidences",
    ).toEqual([]);
  });

  it("keeps the exception list honest — every entry still has two severities", () => {
    // An exception that no longer applies is a licence nobody revoked. If a
    // code was split or simplified, its entry must go, or the next code with
    // that name inherits an exemption it never earned.
    const stale = Object.keys(ONE_SITUATION_TWO_CONFIDENCES).filter(
      (name) => (found.get(name)?.size ?? 0) < 2,
    );
    expect(stale, "these exceptions no longer emit two severities; remove them").toEqual([]);
  });

  it("matches each code's severity to its own prefix", () => {
    /*
     * The prefix is the severity, so `S3D-W-*` pushed as an error is a code
     * whose name contradicts its meaning. Checked against the declared table
     * rather than against prose.
     */
    const errorsTs = fs.readFileSync(path.join(SRC, "errors.ts"), "utf8");
    const declared = new Map<string, string>();
    for (const m of errorsTs.matchAll(/(\w+):\s*"(S3D-([EWI])-\d+)"/g)) {
      declared.set(m[1]!, m[3]!);
    }
    const expected: Record<string, string> = { E: "error", W: "warning", I: "info" };
    const mismatched: string[] = [];
    for (const [name, bySeverity] of found) {
      const prefix = declared.get(name);
      if (prefix === undefined) continue;
      if (name in ONE_SITUATION_TWO_CONFIDENCES) continue;
      for (const sev of bySeverity.keys()) {
        if (expected[prefix] !== sev) {
          mismatched.push(`${name} is S3D-${prefix}-* but is pushed as ${sev}`);
        }
      }
    }
    expect(mismatched, "a code's prefix must be the severity it is emitted at").toEqual([]);
  });
});
