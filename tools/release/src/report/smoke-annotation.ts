/**
 * Make a swallowed packaged-smoke failure impossible to miss.
 *
 * The release smoke steps run with `continue-on-error: true` on purpose: a red
 * smoke must not block the daily beta channel. The cost of that exemption is
 * that the job reports success, so the only trace a failure leaves is a `status`
 * line buried in a per-target report — which is how a release-gating packaged
 * case stayed red for eleven days without anyone noticing.
 *
 * This restores the signal without restoring the block: a `::error` annotation
 * on the run and a caution banner at the top of the target's step summary, while
 * the job conclusion stays exactly as it was.
 */

export type SwallowedSmokeInput = {
  /** `true` when the smoke step carries `continue-on-error`, so the job stays green. */
  exempt: boolean;
  /** GitHub step outcome of the smoke step: success | failure | cancelled | skipped. */
  outcome: string;
  reportPath: string;
  /** Status derived from the suite result, used when no step outcome is wired. */
  suiteStatus: string;
  target: string;
  title: string;
  version: string;
};

export type SwallowedSmokeAnnouncement = {
  /** A GitHub workflow `::error` command, or null when the smoke did not fail. */
  annotation: string | null;
  /** Markdown lines to place above the report body, or empty when it did not fail. */
  banner: string[];
  failed: boolean;
};

export function smokeFailed(outcome: string, suiteStatus: string): boolean {
  return outcome.trim() === "failure" || suiteStatus.trim() === "failed";
}

export function announceSwallowedSmoke(input: SwallowedSmokeInput): SwallowedSmokeAnnouncement {
  if (!smokeFailed(input.outcome, input.suiteStatus)) {
    return { annotation: null, banner: [], failed: false };
  }

  const label = input.title.trim().length > 0 ? input.title.trim() : `${input.target} packaged smoke`;
  const version = input.version.trim().length > 0 ? input.version.trim() : "(unknown version)";
  const exemptSentence = input.exempt
    ? "This step runs with `continue-on-error: true`, so the job below still reports success and the release was not blocked. The failure is real — a green check on this job is not a pass."
    : "This step is a blocking gate, so the job is red.";
  const banner = [
    "> [!CAUTION]",
    `> **${label}: packaged smoke FAILED** (version \`${version}\`, target \`${input.target}\`).`,
    ">",
    `> ${exemptSentence}`,
  ];
  if (input.reportPath.trim().length > 0) {
    banner.push(">", `> Evidence: \`${input.reportPath.trim()}\``);
  }
  banner.push("");

  const annotationTitle = `${input.target} packaged smoke failed`;
  const annotationMessage = input.exempt
    ? `${label} failed for ${version}. continue-on-error kept the job green on purpose; the failure still needs an owner.`
    : `${label} failed for ${version}.`;

  return {
    annotation: `::error title=${escapeAnnotationProperty(annotationTitle)}::${escapeAnnotationData(annotationMessage)}`,
    banner,
    failed: true,
  };
}

/** GitHub workflow-command escaping for the message body. */
function escapeAnnotationData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Property values additionally escape the command's own delimiters. */
function escapeAnnotationProperty(value: string): string {
  return escapeAnnotationData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
