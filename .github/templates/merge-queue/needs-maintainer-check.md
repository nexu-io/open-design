<!-- merge-queue-needs-maintainer-check -->
Ejected from the merge queue: this PR still carries the `needs-maintainer-check` label.

The merge queue gate ([run {{ run_id }}]({{ run_url }})) blocked the queued group because of the label. That failure runs on the queue's transient ref, so it never appears in this PR's own checks — they stay green, and this notice is the only visible trace on the PR.

To land this PR: have a maintainer complete the check, remove the `needs-maintainer-check` label, then add the PR back to the merge queue.
