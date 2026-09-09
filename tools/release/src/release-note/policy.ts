import { appendFileSync } from "node:fs";

import type { ReleaseChannel } from "@open-design/release";

import type { ReleaseNotePlan } from "./source.ts";

const STABLE_RECOMMENDED_LOCALES = ["en", "zh-CN"] as const;

export type ReleaseNotePolicyWarning = {
  code: "stable-release-note-absent" | "stable-release-note-locale-missing";
  message: string;
};

/**
 * Release note policy invariant: a release note that exists must be usable,
 * but a release with no note still ships.
 *
 * Throwing is reserved for a plan that is internally broken — a channel that
 * disagrees with the caller, or a plan with notes that omits the default
 * locale every consumer falls back to. Content that is merely missing (a
 * stable release with no notes, or one without every recommended locale) comes
 * back as a warning for the caller to surface, because a missing changelog is
 * an editorial gap and blocking on it costs a whole prerelease round trip: the
 * stable promotion gate pins `github.commit` to the promoted prerelease, so a
 * commit that adds notes invalidates the artifact being promoted.
 */
export function reviewReleaseNotePlanPolicy(
  plan: ReleaseNotePlan,
  channel: ReleaseChannel,
): ReleaseNotePolicyWarning[] {
  if (plan.channel !== channel) {
    throw new Error(`release note plan channel mismatch: expected ${channel}, got ${plan.channel}`);
  }
  if (plan.state === "ready" && !plan.entries.some((entry) => entry.locale === plan.defaultLocale)) {
    throw new Error(`release notes require the default locale: ${plan.defaultLocale}`);
  }
  if (channel !== "stable") return [];
  if (plan.state === "absent") {
    return [{
      code: "stable-release-note-absent",
      message: `stable ${plan.releaseVersion} has no release notes; publishing without them. `
        + `Add ${STABLE_RECOMMENDED_LOCALES.map((locale) => `${locale}.md`).join(" and ")} under ${plan.sourceDirectory} to include one.`,
    }];
  }
  const locales = new Set(plan.entries.map((entry) => entry.locale));
  const missing = STABLE_RECOMMENDED_LOCALES.filter((locale) => !locales.has(locale));
  if (missing.length === 0) return [];
  return [{
    code: "stable-release-note-locale-missing",
    message: `stable ${plan.releaseVersion} release notes are missing ${missing.join(", ")}; `
      + `publishing ${[...locales].join(", ")} only. Consumers fall back to ${plan.defaultLocale}.`,
  }];
}

/**
 * Make a skipped release note impossible to miss on the run page: one Actions
 * annotation per warning plus a job summary block. Outside Actions, and when
 * there is nothing to report, this stays quiet.
 */
export function reportReleaseNotePolicyWarnings(
  warnings: readonly ReleaseNotePolicyWarning[],
  summaryPath = process.env.GITHUB_STEP_SUMMARY ?? "",
): void {
  if (warnings.length === 0) return;
  for (const warning of warnings) {
    // Actions annotations are single-line; the messages above never wrap.
    console.warn(`::warning title=Release notes missing::${warning.message}`);
  }
  if (summaryPath.length === 0) return;
  appendFileSync(
    summaryPath,
    `${["### :warning: Release notes", "", ...warnings.map((warning) => `- ${warning.message}`), ""].join("\n")}\n`,
    "utf8",
  );
}
