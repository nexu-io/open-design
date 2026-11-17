# Automatic version bump completion

After a stable release, `finalize-release.yml` opens the synchronized workspace
version bump. Its trusted `bump_followup` job validates the entire Git tree and
enqueues the PR without a human approval only when all of these hold:

- Same-repository PR by `open-design-release-bot[bot]`, targeting `main`, on the
  exact `release-bot/bump-main-v<next patch>` branch of the latest published stable.
- Every synchronized manifest is present and has exactly the output of changing
  its top-level version to that next patch. No other files, fields or modes change.
- Main has not already advanced, the head/base are unchanged during validation,
  and the queue mutation includes `expectedHeadOid`.
- `Validate workspace` succeeds, all reported checks finish without failure,
  there are no unresolved discussions, requested changes, conflicts or hold labels.

The job reads PR objects as data. It checks out only the trusted default branch,
does not execute PR code or install PR dependencies, and never calls direct merge,
admin merge, review approval or a protection-setting API. A queue removal stops
automatic re-enqueueing of that PR for investigation.

## Repository rules

Approval requirements live in a separate active ruleset targeting the default
branch. Only the release App (`4117861`) has a `pull_request` bypass there.
The original main ruleset still requires a PR and the squash merge queue, prevents
deletion/force pushes and requires linear history, with **no bypass actors**.
The separate `CI enforcement` ruleset is unchanged and has **no bypass actors**.

GitHub's bypass is identity-based, not diff-based: the exact-content boundary is
enforced by trusted automation. Do not use the release App's approval exception
from another workflow or from an interactive agent. Any change beyond the version
bump follows ordinary code-owner review. New policy code itself requires ordinary
review; the policy cannot waive its own approval.

Install the tested workflow before activating the rule exception. Create the
separate approval ruleset with the existing review parameters first, then remove
review requirements from the original ruleset while retaining its PR/queue and
integrity rules. This ordering never opens a gap in review enforcement. Back up
both rule definitions before changing them.

## CI failures

The release agent owns retries for these bump branches. The generic
`rerun.atom.yml` excludes them to avoid two independent retry loops.
The agent reads failed leaf-job logs and retries only explicit infrastructure
fingerprints, such as registry 429 or runner shutdown. Assertions, test timeouts,
mixed test/infrastructure failures and unknown errors do not qualify.
Its durable per-head ledger reserves each rerun before sending it, counts already
observed external retries, and permits at most two retries. Only failed jobs are
rerun. A stale head or uncertain previous request is never blindly retried.
After the limit, the progress card links the failed run and requests intervention.

Successful CI events and a half-hourly reconciliation wake the queue policy.
For read-only verification, dispatch `finalize-release.yml` on `main` with
`follow_bump_only=true,dry_run=true`. This never finalizes or publishes a release.
