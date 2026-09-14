/* ───────────────────────────────────────────────────────────────────
 * Guard: the repository copy of the post-update "What's New" card.
 *
 * `docs/whats-new.json` is the source of truth that
 * `.github/workflows/whats-new-publish.yml` uploads to the R2 object the
 * daemon reads (`DEFAULT_WHATS_NEW_URL`). The daemon parses that document
 * fail-safe: anything missing or malformed resolves to "no highlight"
 * rather than an error, so a typo does not fail a request — it silently
 * removes the card from every user's Home. A successful upload therefore
 * proves nothing about whether the card will appear.
 *
 * This guard closes that gap before merge by running the shipping parser
 * (`parseWhatsNewDocument`) over the repository document and asserting the
 * invariant the fail-safe hides:
 *
 *   the document is either a complete, parser-valid highlight, or the
 *   explicit empty retirement document `{}` — never something in between.
 *
 * It runs in `pnpm guard`, which CI invokes from the `preflight` job. That
 * job is declared `inputs: ["*"]` / `reusable: false` in
 * `.github/config/convergence.json` and its guard step carries no `if`, so it
 * runs on every pull request. That matters here: the document lives under
 * `docs/`, which `.github/config/scopes.json` treats as `certain-exempt` — a
 * change to it selects no scoped validation workload at all, so a lane-routed
 * test would simply never run for the one edit it exists to check.
 *
 * Run standalone: `pnpm exec tsx scripts/check-whats-new-document.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseWhatsNewDocument } from "../apps/daemon/src/services/whats-new.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** Kept in sync with the workflow's `WHATS_NEW_DOCUMENT` input. */
export const WHATS_NEW_DOCUMENT_PATH = "docs/whats-new.json";

// Field names the daemon parser reads. Anything else in the document is a
// typo (`imageURL`, `link_url`, `locale`) that the parser would drop without
// complaint, which is exactly the silent-no-card failure this guard exists
// to catch.
const KNOWN_TOP_LEVEL_KEYS = new Set(["id", "title", "body", "imageUrl", "linkUrl", "ctaLabel", "locales"]);
const KNOWN_LOCALE_KEYS = new Set(["title", "body", "linkUrl", "ctaLabel"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function checkWhatsNewDocument(root: string = repoRoot): Promise<boolean> {
  const documentPath = path.join(root, WHATS_NEW_DOCUMENT_PATH);
  const violations: string[] = [];

  let raw: string;
  try {
    raw = await readFile(documentPath, "utf8");
  } catch (error) {
    console.error(`What's New document check failed: cannot read ${WHATS_NEW_DOCUMENT_PATH}`);
    console.error(error);
    return false;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (error) {
    console.error(`What's New document check failed: ${WHATS_NEW_DOCUMENT_PATH} is not valid JSON.`);
    console.error(error);
    return false;
  }

  if (!isObject(payload)) {
    console.error(`What's New document check failed: ${WHATS_NEW_DOCUMENT_PATH} must be a JSON object.`);
    return false;
  }

  // Retiring the card is a real operation the daemon supports: an empty
  // document resolves to "no highlight" on purpose. Accept it explicitly so
  // the completeness rules below cannot be read as "the card can never be
  // taken down".
  if (Object.keys(payload).length === 0) {
    console.log(
      `What's New document check passed: ${WHATS_NEW_DOCUMENT_PATH} is the empty retirement document, so no card will show.`,
    );
    return true;
  }

  for (const key of Object.keys(payload)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      violations.push(`unknown top-level field ${JSON.stringify(key)}; the daemon parser ignores it`);
    }
  }

  const parsed = parseWhatsNewDocument(payload);
  if (parsed.id == null || parsed.content == null) {
    violations.push(
      "the shipping parser resolves this document to no highlight; `id`, `title`, and `body` must all be present, non-empty strings",
    );
  }

  const content = parsed.content;
  if (content != null) {
    // A dropped optional field is the silent half of the failure mode: the
    // card still shows, just without the cover art or with the wrong link.
    if (payload.imageUrl !== undefined && content.imageUrl == null) {
      violations.push("`imageUrl` is present but the parser dropped it; it must be a non-empty https: URL");
    }
    if (payload.linkUrl !== undefined && content.linkUrl == null) {
      violations.push("`linkUrl` is present but the parser dropped it; it must be a non-empty https: URL");
    }

    if (payload.ctaLabel !== undefined && content.ctaLabel == null) {
      violations.push("`ctaLabel` is present but the parser dropped it; it must be a non-empty string");
    }

    const rawLocales = payload.locales;
    if (rawLocales !== undefined) {
      if (!isObject(rawLocales)) {
        violations.push("`locales` must be an object keyed by app locale id (for example `zh-CN`)");
      } else {
        for (const [locale, entry] of Object.entries(rawLocales)) {
          if (!isObject(entry)) {
            violations.push(`locale ${JSON.stringify(locale)} must be an object of title/body/linkUrl/ctaLabel overrides`);
            continue;
          }
          for (const key of Object.keys(entry)) {
            if (!KNOWN_LOCALE_KEYS.has(key)) {
              violations.push(`locale ${JSON.stringify(locale)} has unknown override ${JSON.stringify(key)}`);
            }
          }
          const overrides = content.locales?.[locale];
          if (overrides == null) {
            violations.push(`locale ${JSON.stringify(locale)} was dropped by the parser; every override it declares is invalid`);
            continue;
          }
          for (const key of Object.keys(entry)) {
            if (!KNOWN_LOCALE_KEYS.has(key)) continue;
            if (overrides[key as "title" | "body" | "linkUrl" | "ctaLabel"] == null) {
              violations.push(
                `locale ${JSON.stringify(locale)} declares ${JSON.stringify(key)} but the parser dropped it; strings must be non-empty and linkUrl must be https:`,
              );
            }
          }
        }
      }
    }

    for (const [label, text] of [["body", content.body] as const, ...localeBodies(content.locales)]) {
      // Each line renders as one bullet, so a blank line renders as an
      // empty bullet.
      const lines = text.split("\n");
      if (lines.some((line) => line.trim().length === 0)) {
        violations.push(`${label} has a blank line; every line renders as one bullet`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(`What's New document check failed for ${WHATS_NEW_DOCUMENT_PATH}:`);
    for (const violation of violations) console.error(`- ${violation}`);
    console.error(
      "The daemon resolves a malformed document to 'no highlight' instead of an error, so publishing this file would silently remove the card rather than fail. See docs/whats-new.md.",
    );
    return false;
  }

  const localeIds = Object.keys(content?.locales ?? {});
  const localeLabel = localeIds.length > 0 ? ` plus ${localeIds.join(", ")} override${localeIds.length === 1 ? "" : "s"}` : "";
  console.log(
    `What's New document check passed: ${WHATS_NEW_DOCUMENT_PATH} resolves to highlight id ${parsed.id}${localeLabel}.`,
  );
  return true;
}

function localeBodies(
  locales: Record<string, { body?: string }> | undefined,
): ReadonlyArray<readonly [string, string]> {
  if (locales == null) return [];
  const entries: Array<readonly [string, string]> = [];
  for (const [locale, override] of Object.entries(locales)) {
    if (typeof override.body === "string") entries.push([`locale ${locale} body`, override.body] as const);
  }
  return entries;
}

// ─── Standalone entrypoint ───────────────────────────────────────────

const isInvokedDirectly =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isInvokedDirectly) {
  const passed = await checkWhatsNewDocument();
  if (!passed) process.exitCode = 1;
}
