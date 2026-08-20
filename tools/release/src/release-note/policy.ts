import type { ReleaseChannel } from "@open-design/release";

import type { ReleaseNotePlan } from "./source.ts";

const STABLE_REQUIRED_LOCALES = ["en", "zh-CN"] as const;

export function assertReleaseNotePlanPolicy(plan: ReleaseNotePlan, channel: ReleaseChannel): void {
  if (plan.channel !== channel) {
    throw new Error(`release note plan channel mismatch: expected ${channel}, got ${plan.channel}`);
  }
  if (plan.state === "ready" && !plan.entries.some((entry) => entry.locale === plan.defaultLocale)) {
    throw new Error(`release notes require the default locale: ${plan.defaultLocale}`);
  }
  if (channel !== "stable") return;
  if (plan.state === "absent") {
    throw new Error("release notes are required for stable releases");
  }
  const locales = new Set(plan.entries.map((entry) => entry.locale));
  const missing = STABLE_REQUIRED_LOCALES.filter((locale) => !locales.has(locale));
  if (missing.length > 0) {
    throw new Error(`stable release notes require locales: ${missing.join(", ")}`);
  }
}
