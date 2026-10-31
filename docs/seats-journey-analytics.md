# Seats journey analytics

Implementation follows the [seats tracking agreement](https://powerformer.feishu.cn/sheets/LisKsg9tEhYIY0tn04ac76Bunve) and [tracking standard](https://powerformer.feishu.cn/wiki/Ltr7wd07siTU7lk9aTacaCGYneD?sheet=MUu2Au).

| Surface | Final event | Distinguishing fields |
| --- | --- | --- |
| Onboarding invitation step | `page_view` | `page_name=onboarding`, `step_name=invite_teammates`, `invite_surface_id` |
| Home invitation banner, ordinary invitation dialog | `surface_view` | `area`, `entry_from`, surface instance |
| Invitation entry, form interactions, explicit skip | `ui_click` | `area`, `element`, `entry_from`, `invite_surface_id` |
| Invitation submission and response | existing `ui_click`, `workspace_invite_result` | Same `request_id`, `invite_batch_id`, source and workspace dimensions |
| Quota popover, credit/concurrency interruption, removed-member notice | `surface_view` | `area`, `surface_instance_id`, workspace; interruption `block_id`, `reason`, `stage` |
| Dismissal, upgrade, return to personal workspace | `ui_click` | Same visible instance; credit upgrade enriches the existing AMR entry click |

A visible instance survives React StrictMode and background context refreshes. Close/reopen or workspace changes create a fresh instance. Onboarding emits a page view instead of an ordinary invitation-modal exposure. Automatic onboarding completion is not an explicit skip.

Invite results preserve `requested_count = succeeded_count + failed_count + unknown_count`. Transport failures, server 5xx responses, missing per-row responses and malformed responses do not prove rejection. These report `unknown`; known row rejections remain failures. Results describe invitation request handling, not email delivery/opening or membership creation. No recipient email, invitation token or raw URL is added to analytics.

`workspace_key` is the existing analytics name for `WorkspaceCollabContext.workspaceId`. Existing workspace switches, project sharing/opening and run lifecycle events remain the downstream sources. `is_first_run` retains its existing meaning; analysts must derive first post-join collaboration from the committed join timestamp, workspace/user identity and run outcome.

The AMR companion adds invitation landing states, committed membership and continuation results, seats console behavior and payment observations. The client PR can be reviewed independently, but the complete cross-product funnel requires that companion. `block_id` currently correlates the displayed client interruption and its click; it is not propagated into a payment operation or later retry. Temporal correlation is not proof of a causal recovery.

No invitation-copy control or migration-notice UI exists on this feature branch, so no synthetic events are emitted for those draft rows. This change has automated coverage; deployed-client/PostHog acceptance remains a separate validation step after merge.
