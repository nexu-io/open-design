// i18n coverage report — non-blocking informational script that surfaces
// per-locale key-coverage drift against English. Run via:
//
//   pnpm i18n:coverage
//
// The companion script `scripts/i18n-check.ts` already enforces
// *structural* consistency (locale registration, README language
// switcher alignment, core doc link references). This script is
// orthogonal: it reports *content* coverage so contributors and
// release managers can see how each locale is tracking against the
// English source-of-truth as features land.
//
// Reasons for keeping this separate from `i18n-check.ts`:
//
// 1. `i18n-check.ts` is wired into `pnpm i18n:check` and exits with a
//    non-zero status. Adding "every locale must match en exactly" to
//    that script would break every PR until 13 of 14 locales catch up
//    on hundreds of missing keys. Issue #1894 covers the policy
//    question of *whether* to enforce parity for the full locale set
//    or only a tier-1 subset; until that lands, this script stays
//    informational only.
//
// 2. The test suite in `apps/web/tests/i18n/locales.test.ts` enforces
//    strict parity for `id` (Indonesian) as a regression guard. This
//    script reuses the same `LOCALES` list and dictionary shape so
//    extending enforcement later is a one-line change.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { LOCALES, LOCALE_LABEL, type Locale } from "../apps/web/src/i18n/types.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const localesDirectory = path.join(repoRoot, "apps/web/src/i18n/locales");

const KEY_PATTERN = /^\s*['"]([^'"\\]+)['"]\s*:/gm;

type LocaleCoverage = {
  locale: Locale;
  total: number;
  missingFromEnglish: string[];
  orphanInLocale: string[];
  untranslated: string[];
};

async function readKeySet(locale: Locale): Promise<Set<string>> {
  const filePath = path.join(localesDirectory, `${locale}.ts`);
  const source = await readFile(filePath, "utf8");
  const keys = new Set<string>();
  // Walk one match at a time so we can skip the regex-state-shared `lastIndex`
  // pitfall that bites global regexes when reused.
  KEY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KEY_PATTERN.exec(source)) !== null) {
    const key = match[1];
    if (key) keys.add(key);
  }
  return keys;
}

async function readRawDict(locale: Locale): Promise<Map<string, string>> {
  const filePath = path.join(localesDirectory, `${locale}.ts`);
  const source = await readFile(filePath, "utf8");
  const entries = new Map<string, string>();
  // Match `'key': 'value',` or `'key': "value",` on a single line.
  // Multi-line values fall through silently; reporting "untranslated"
  // for those would need a real TS parser.
  const lineEntry = /^\s*['"]([^'"\\]+)['"]\s*:\s*(['"])((?:[^'"\\\n]|\\.)*)\2\s*,?$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineEntry.exec(source)) !== null) {
    const key = match[1];
    const value = match[3];
    if (key !== undefined && value !== undefined) {
      entries.set(key, value);
    }
  }
  return entries;
}

async function buildCoverage(): Promise<LocaleCoverage[]> {
  const englishKeys = await readKeySet("en");
  const englishDict = await readRawDict("en");
  const results: LocaleCoverage[] = [];
  for (const locale of LOCALES) {
    const keys = await readKeySet(locale);
    const dict = await readRawDict(locale);
    const missing: string[] = [];
    for (const key of englishKeys) {
      if (!keys.has(key)) missing.push(key);
    }
    const orphan: string[] = [];
    for (const key of keys) {
      if (!englishKeys.has(key)) orphan.push(key);
    }
    const untranslated: string[] = [];
    if (locale !== "en") {
      for (const [key, value] of dict) {
        const englishValue = englishDict.get(key);
        if (englishValue !== undefined && englishValue === value && value.length > 0) {
          untranslated.push(key);
        }
      }
    }
    missing.sort();
    orphan.sort();
    untranslated.sort();
    results.push({
      locale,
      total: keys.size,
      missingFromEnglish: missing,
      orphanInLocale: orphan,
      untranslated,
    });
  }
  return results;
}

function formatTable(results: LocaleCoverage[], englishTotal: number): string {
  const header = `Locale (key total = ${englishTotal} on en)`;
  const lines: string[] = [header, "-".repeat(header.length)];
  for (const r of results) {
    const label = LOCALE_LABEL[r.locale];
    const missingPct = r.locale === "en"
      ? "—"
      : `${((r.total / englishTotal) * 100).toFixed(0)}%`;
    lines.push(
      `${r.locale.padEnd(8)} ${label.padEnd(22)} keys=${String(r.total).padStart(4)} missing=${String(r.missingFromEnglish.length).padStart(4)} orphan=${String(r.orphanInLocale.length).padStart(3)} untranslated=${String(r.untranslated.length).padStart(4)} coverage=${missingPct}`,
    );
  }
  return lines.join("\n");
}

function formatExamples(results: LocaleCoverage[]): string {
  const lines: string[] = ["", "First 5 missing keys per non-English locale:"];
  for (const r of results) {
    if (r.locale === "en") continue;
    if (r.missingFromEnglish.length === 0) {
      lines.push(`  ${r.locale}: all English keys present ✓`);
      continue;
    }
    const preview = r.missingFromEnglish.slice(0, 5).map((k) => `'${k}'`).join(", ");
    const more = r.missingFromEnglish.length > 5 ? ` (+${r.missingFromEnglish.length - 5} more)` : "";
    lines.push(`  ${r.locale}: ${preview}${more}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const results = await buildCoverage();
  const english = results.find((r) => r.locale === "en");
  if (!english) {
    console.error("English locale missing; cannot build report.");
    process.exitCode = 1;
    return;
  }
  console.log(formatTable(results, english.total));
  console.log(formatExamples(results));
  console.log("");
  console.log("This report is informational only — exit code stays 0. See #1894 for the policy discussion.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
