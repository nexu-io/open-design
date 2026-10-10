import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const withdrawWorkflow = new URL("../../../.github/workflows/release-withdraw.yml", import.meta.url);
const cutWorkflow = new URL("../../../.github/workflows/cut-release.yml", import.meta.url);
const prereleaseWorkflow = new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url);

function section(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
}

describe("release withdraw workflow", () => {
  it("[P0] refuses a version that already shipped stable", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");
    const guard = section(withdraw, "  guard:", "  withdraw:");

    // The whole premise is "cut but never shipped". Withdrawing a shipped
    // release would delete the branch of something users are running, and the
    // operator would think they had retracted it. That case is
    // release-rollback's, and the error has to say so.
    expect(guard).toContain("stable/latest/metadata.json");
    expect(guard).toContain("stable/versions/$VERSION/metadata.json");
    expect(guard).toContain("use release-rollback to retract a shipped release");
    expect(guard).not.toContain("secrets.");
  });

  it("[P0] refuses to delete a branch carrying non-bot commits", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");
    const step = section(
      withdraw,
      "      - name: Assert the branch holds nothing but cut commits",
      "      - name: Assert nobody is still working against the branch",
    );

    // A fix backported here and nowhere else dies with the branch. Only the
    // two bots cut-release commits as may have written a branch-only commit.
    expect(step).toContain("--not origin/main");
    expect(step).toContain("open-design-bot|open-design-release-bot\\[bot\\]");
    expect(step).toContain("would destroy them");
    // The SHA must be captured before anything destructive so the branch is
    // recoverable.
    expect(step).toContain('echo "sha=$sha" >> "$GITHUB_OUTPUT"');
  });

  it("[P0] refuses while PRs still target the branch or carry its label", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");
    const step = section(
      withdraw,
      "      - name: Assert nobody is still working against the branch",
      "      - name: Resolve the prerelease pointer",
    );

    expect(step).toContain("--base \"$BRANCH\" --state open");
    expect(step).toContain("--label \"$LABEL\" --state open");
    expect(step).toContain("exit 1");
  });

  it("[P0] will not move the prerelease pointer blind", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");
    const step = section(
      withdraw,
      "      - name: Resolve the prerelease pointer",
      "      - name: Setup pnpm",
    );

    // Detected from the live pointer, never taken on trust from the input: the
    // rollback only happens when latest actually belongs to the withdrawn
    // version, and then a target is mandatory rather than silently skipped.
    expect(step).toContain("prerelease/latest/metadata.json");
    expect(step).toContain('"$VERSION"-prerelease.*) belongs=true');
    expect(step).toContain("but prerelease_to_version is empty");
    expect(withdraw).toContain("RELEASE_ROLLBACK_FROM_VERSION: ${{ steps.pre.outputs.from }}");
  });

  it("[P0] undoes the cut in an order that cannot strand a label", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");

    const pointer = withdraw.indexOf("- name: Repoint prerelease latest");
    const label = withdraw.indexOf("- name: Delete the backport label");
    const branch = withdraw.indexOf("- name: Delete the release branch");
    expect(pointer).toBeGreaterThanOrEqual(0);
    // A label outliving its branch invites a PR whose backport then targets a
    // branch that is gone, so the label goes first; the branch is last because
    // it is the hardest step to undo.
    expect(pointer).toBeLessThan(label);
    expect(label).toBeLessThan(branch);
  });

  it("[P0] plans before it destroys", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");
    const inputs = section(withdraw, "      dry_run:", "      notify_feishu:");

    // Unlike release-rollback, a withdrawal is never the urgent case, so the
    // safe mode is the default one.
    expect(inputs).toContain("default: true");
    for (const step of ["Delete the backport label", "Delete the release branch"]) {
      const body = section(withdraw, `      - name: ${step}`, "        env:");
      expect(body, `${step} must be gated on dry_run`).toContain("!inputs.dry_run");
    }
  });

  it("[P0] makes the dry run validate the pointer target instead of skipping it", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");

    // A dry run that skipped the planner validated nothing about
    // `prerelease_to_version` beyond its syntax: an absent, half-published or
    // feed-less target passed the plan and failed for the first time during the
    // real run — after the label and the branch were already gone. The planner
    // is the validation, so it runs either way and `RELEASE_DRY_RUN` decides
    // only whether it writes.
    for (const step of ["Setup pnpm", "Install dependencies", "Repoint prerelease latest"]) {
      const body = section(withdraw, `      - name: ${step}`, "\n\n");
      expect(body, `${step} must not be skipped on a dry run`).not.toContain("!inputs.dry_run");
      expect(body, `${step} runs only when the pointer needs moving`).toContain(
        "steps.pre.outputs.rollback == 'true'",
      );
    }
    const planner = section(withdraw, "      - name: Repoint prerelease latest", "        run:");
    expect(planner).toContain("RELEASE_DRY_RUN: ${{ inputs.dry_run }}");
  });

  it("[P0] queues against the only other writer of prerelease/latest", async () => {
    const [withdraw, prerelease] = await Promise.all([
      readFile(withdrawWorkflow, "utf8"),
      readFile(prereleaseWorkflow, "utf8"),
    ]);

    // A private concurrency group serialises this workflow against nothing.
    // release-prerelease is the only other writer of `prerelease/latest`, and a
    // publish that moved the pointer after `Resolve the prerelease pointer` read
    // it would interleave its multi-object writes with the rollback's, leaving
    // `latest` mixing two candidates. If the publisher's group is ever renamed,
    // this pairing has to be rechecked rather than silently broken.
    expect(prerelease).toContain("group: open-design-release-prerelease");
    expect(withdraw).toContain("group: open-design-release-prerelease");
    expect(withdraw).toContain("cancel-in-progress: false");
    expect(withdraw).not.toContain("group: open-design-release-withdraw");

    // The lock has to be held for the whole run, not per job. A trailing
    // `notify-release-feishu` publish — the cut push and the preview-manifest
    // push both start one, so this is the ordinary timeline rather than a manual
    // re-run — then cannot enter the publisher until `release/vX.Y.Z` is gone,
    // and its checkout of a deleted ref fails closed instead of republishing the
    // withdrawn commit. A job-level group would release the lock before the
    // delete and lose that.
    expect(withdraw.match(/^concurrency:$/gm)).toHaveLength(1);
    expect(withdraw).not.toMatch(/^ {4}concurrency:/m);
  });

  it("[P0] refuses to delete a branch whose tip moved after it was judged", async () => {
    const withdraw = await readFile(withdrawWorkflow, "utf8");
    const step = section(withdraw, "      - name: Delete the release branch", "      - name: Notify Feishu");

    // Every finding that made the branch safe to delete was established against
    // the captured SHA, and a human then read a dry run in between. A tip that
    // moved means those findings describe a branch that no longer exists — and
    // the likeliest new commit is the backport somebody needed. GitHub's ref
    // delete has no expected-SHA precondition, so the compare is explicit and
    // has to come before the delete.
    const compare = step.indexOf("git/ref/heads/$BRANCH");
    const remove = step.indexOf("-X DELETE");
    expect(compare).toBeGreaterThanOrEqual(0);
    expect(compare).toBeLessThan(remove);
    expect(step).toContain('if [ "$tip" != "$SHA" ]; then');
    expect(step).toContain("exit 1");
  });

  it("[P1] reverses exactly what cut-release created", async () => {
    const [withdraw, cut] = await Promise.all([readFile(withdrawWorkflow, "utf8"), readFile(cutWorkflow, "utf8")]);

    // Same label string, same App credentials — the branch delete needs the
    // bypass actor on the release/v* deletion rule, which is the App that cut
    // the branch in the first place.
    expect(cut).toContain('gh label create "backport release/v$VERSION"');
    expect(withdraw).toContain("LABEL: backport release/v${{ inputs.version }}");
    for (const secret of ["RELEASE_BOT_APP_ID", "RELEASE_BOT_PRIVATE_KEY"]) {
      expect(cut).toContain(`secrets.${secret}`);
      expect(withdraw).toContain(`secrets.${secret}`);
    }
  });
});
