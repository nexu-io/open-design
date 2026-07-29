import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "vitest";

import { normalizeEol } from "../../../scripts/lib/eol.ts";

// Regression test for #6192 / #5176: Windows `core.autocrlf=true` checks LF
// files out with CRLF endings. The multi-line template literal in
// `scripts/check-packaged-leaf-boundary.ts` carries LF, so a byte-exact
// `String.prototype.includes` against a CRLF working tree never matches —
// the guard reports a phantom "ci.yml no longer contains the guarded … block"
// violation on a pristine `main`. Apply `normalizeEol` to both sides before
// comparing. Mirrors the precedent set by #5176 for design-system manifests.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

// A reliable multi-line anchor that exists in ci.yml on upstream/main.
// Multi-line is essential: single-line strings trivially `includes()` whether
// the haystack is LF or CRLF — the #6192 bug specifically reproduces on
// multi-line template literals where the embedded \n cannot match a
// working-tree \r\n.
const CI_YML_ANCHOR = `if [ "\${{ needs.scopes.outputs.tools_dev_tests_required }}" = "true" ]; then
            pnpm --filter @open-design/tools-dev test
          fi`;

const ciLF = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
const ciCRLF = ciLF.replace(/\n/g, "\r\n");

test("normalizeEol maps CRLF → LF", () => {
  expect(normalizeEol("a\r\nb\r\nc")).toBe("a\nb\nc");
});

test("normalizeEol is a no-op on pure LF", () => {
  const pureLF = "a\nb\nc";
  expect(normalizeEol(pureLF)).toBe(pureLF);
});

test("normalizeEol is idempotent", () => {
  const once = normalizeEol("a\r\nb\r\nc\r\n");
  expect(normalizeEol(once)).toBe(once);
});

test("normalizeEol handles mixed CRLF/LF input", () => {
  expect(normalizeEol("a\r\nb\nc\r\nd")).toBe("a\nb\nc\nd");
});

test("LF ci.yml contains the key tools-dev test command (#6192 sanity)", () => {
  expect(ciLF.includes(CI_YML_ANCHOR)).toBe(true);
});

test("raw includes() against CRLF ci.yml fails (the bug #6192)", () => {
  // On Windows the guard reads ci.yml with CRLF endings and then calls
  // `workflow.includes(requiredWorkspaceUnitBlock)` — both literal strings
  // use LF, so the comparison always returns false even on pristine main.
  expect(ciCRLF.includes(CI_YML_ANCHOR)).toBe(false);
});

test("normalizeEol on both sides fixes the CRLF comparison (#6192 fix)", () => {
  expect(normalizeEol(ciCRLF).includes(normalizeEol(CI_YML_ANCHOR))).toBe(true);
});
