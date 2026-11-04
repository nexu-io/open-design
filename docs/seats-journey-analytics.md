# Seats journey analytics

Implementation follows the [seats tracking agreement](https://powerformer.feishu.cn/sheets/LisKsg9tEhYIY0tn04ac76Bunve) and [tracking standard](https://powerformer.feishu.cn/wiki/Ltr7wd07siTU7lk9aTacaCGYneD?sheet=MUu2Au).

| Surface | Final event | Distinguishing fields |
| --- | --- | --- |
| Onboarding invitation step | `page_view` | `page_name=onboarding`, `step_name=invite_teammates`, `invite_surface_id` |
| Home invitation banner, ordinary invitation dialog | `surface_view` | `area`, `entry_from`, surface instance |
| Invitation entry, form interactions, explicit skip | `ui_click` | `area`, `element`, `entry_from`, `invite_surface_id` |
| Invitation submission and response | existing `ui_click`, `workspace_invite_result` | Same `request_id`, `invite_batch_id`, source and workspace dimensions |
| Authorized workspace content (entry pages and project view) | `surface_view` | `area=workspace_content`, `workspace_key`, `workspace_member_id`, `surface_instance_id` |
| Quota popover, credit/concurrency interruption, removed-member notice | `surface_view` | `area`, `surface_instance_id`, workspace; interruption `block_id`, `reason`, `stage` |
| Dismissal, upgrade, return to personal workspace | `ui_click` | Same visible instance; credit upgrade enriches the existing AMR entry click |

A visible instance survives React StrictMode and background context refreshes. Close/reopen or workspace changes create a fresh instance. Onboarding emits a page view instead of an ordinary invitation-modal exposure. Automatic onboarding completion is not an explicit skip.

Invite results preserve `requested_count = succeeded_count + failed_count + unknown_count`. Transport failures, server 5xx responses, missing per-row responses and malformed responses do not prove rejection. These report `unknown`; known row rejections remain failures. Results describe invitation request handling, not email delivery/opening or membership creation. No recipient email, invitation token or raw URL is added to analytics.

Submission and result carry `requested_roles`, `requested_admin_count` and
`requested_member_count` from the effective request after role permission
normalization. `workspace_role` continues to mean the inviter's role. Result
`invite_ids` contains only successful invitations returned by the daemon;
join these IDs to AMR's `invite_id` to relate senders to recipients. A missing
ID (old daemon or unknown response) is not evidence of no invitation.

## Six business measures

| Measure | Evidence and counting rule |
| --- | --- |
| People clicking an invitation entry | Explicit `ui_click` with `element=invite_teammates` from the invitation entry surfaces; automatic onboarding `page_view` is excluded. Deduplicate people, not entry labels. |
| People filling email and submitting | Invitation-form `ui_click`, `element=submit`; emitted after validation, before the response. A successful send is a separate result. |
| Recipients reaching the invitation landing page | AMR invitation landing `page_view`; this proves a visit, not inbox delivery. Anonymous visitors are not yet verified account identities. |
| Recipients clicking Accept | AMR explicit accept click. Keep `accept_trigger=auth_resume` separate because login can automatically finish acceptance. |
| New members who enter the invited workspace | AMR `workspace_invite_join_result`, `result=success`, `membership_created=true`, followed by client `surface_view`, `area=workspace_content`, for the same workspace/member. AMR's own workspace page view can be reported separately as Web entry. |
| Invited members creating in that workspace | Subsequent `run_created` in the same workspace/member; `run_finished` describes completion and artifact outcome. Starting a run is not proof of a finished creation. |

Workspace content exposure waits for a visible document and resolved active
membership, excludes onboarding and project materialization placeholders,
and deduplicates StrictMode and background refreshes. A workspace switch
result or AMR `workspace_invite_consumed` proves continuation processing,
not content exposure. UI events retain the existing `workspace_key` name;
run events use `workspace_id`. Both contain the same cloud workspace ID.
`workspace_member_id` on runs is the daemon-authorized caller, frozen at run
start and preserved on resume, never the project creator or current UI member.

For this funnel, join the committed membership to the exposure and run using
workspace ID plus member ID (or verified account `user_id` for older events),
and require chronological order. The inviter and recipient are different
people: do not put all six steps into a same-person funnel. These events span
the OD and AMR PostHog projects and require an explicit cross-project join;
event changes alone do not turn static dashboard snapshots into live queries.
Missing attribution, consent-disabled capture, and older client versions are
coverage gaps, not proof of zero creation. New fields are not backfilled.

`workspace_key` is the existing analytics name for `WorkspaceCollabContext.workspaceId`. Existing workspace switches, project sharing/opening and run lifecycle events remain the downstream sources. `is_first_run` retains its existing meaning; analysts must derive first post-join collaboration from the committed join timestamp, workspace/user identity and run outcome.

The AMR companion adds invitation landing states, committed membership and continuation results, seats console behavior and payment observations. The client PR can be reviewed independently, but the complete cross-product funnel requires that companion. `block_id` currently correlates the displayed client interruption and its click; it is not propagated into a payment operation or later retry. Temporal correlation is not proof of a causal recovery.

No invitation-copy control or migration-notice UI exists on this feature branch, so no synthetic events are emitted for those draft rows. This change has automated coverage; deployed-client/PostHog acceptance remains a separate validation step after merge.
