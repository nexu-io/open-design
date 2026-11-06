<!-- merge-queue-ci-failure -->
Ejected from the merge queue: CI failed on the queued merge of this PR.

The merge queue gate ([run {{ run_id }}]({{ run_url }})) failed for the group headed by this PR. That run executes on the queue's transient ref, so the failure never shows up in this PR's own checks — they stay green, the queue entry simply disappears, and this notice is the only visible trace on the PR.

Failed jobs:

{{ failed_lines }}

The queued merge combines this PR with everything that landed on `main` after its last CI run{{ group_note }}. When this PR's own checks are green, the failure is usually one of: a conflict with newer `main` (for example a test added or changed since this branch diverged), a PR ahead of it in the queue, or a flaky test.

To land this PR: open the run above and check whether the failure is related to this change. If it is, merge or rebase onto the latest `main`, fix, push, and add the PR back to the merge queue. If it is unrelated, add the PR back to the merge queue.
