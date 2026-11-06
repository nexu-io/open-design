# Share client batch 1 — review evidence

Scope: Plane OPEND-3745, OPEND-3691, OPEND-3722. OPEND-3663 is withdrawn and is not implemented by this patch. This is review evidence, **not a completed Featuretest acceptance report**.

## Share entry point

These two screenshots show the same fixed build during an earlier real login attempt, not a buggy-versus-fixed comparison:

- [Before login](3691-before-login.png): file toolbar → Share → Sign in to share.
- [After login](3691-after-login.png): the same file's Share panel returns with Generate and copy link.

The top 40 pixels were cropped from both screenshots to exclude account status. Remaining pixels are unchanged; image metadata is omitted. The screenshots prove the visible entry point/panel only. The attempt's authoritative share-state request returned 503, so they do not prove successful publishing or guest access. A subsequent fresh-login attempt is blocked by browser connectivity.

## Reproducible red/green tests

The current regression tests were copied into a detached worktree of the pinned `feat/share-comment-p0` base `a8dfb3a48cf49cb7ad658218b7caefbc9f739daa`, without any production fixes. The assertions reproduce:

| Test | Base | Fixed branch |
| --- | --- | --- |
| `OPEND-3745 never uploads a case-collapsed file/directory staging tree` | Two failures: expected 502, received 200 on a case-insensitive temporary volume | Both pass; refuse before the resource-push call |
| `OPEND-3691 keeps the sign-in share panel across pending workspace authority without publishing` | Share action missing after authority resolves | Pass |
| `OPEND-3691 restores only the UI continuation after the whole authenticated viewer remounts` | Continuation callback missing | Pass |
| `OPEND-3691 keeps the exact panel continuation above the project authorization remount` | Expected index.html, received none | Pass |
| `OPEND-3722 settles a deleted Team route instead of restarting absence resolution on its own list read` | No alert; Loading workspace remains | Pass; finite retry budget and terminal feedback |

The base reproduction has seven failing targeted assertions overall (two daemon, five web, including the parent-cancelled continuation case). This is a pinned-feature-base comparison, **not a claim that the latest target head or main was tested**. The PR targets `feat/share-comment-p0`, like the preceding share fixes; main does not yet contain this share implementation.

Fixed-branch commands:

```sh
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon exec vitest run tests/collab-sync-routes.test.ts
pnpm --filter @open-design/web exec vitest run tests/components/App.project-create-race.test.tsx tests/components/FileViewer.share-update.test.tsx
```

Results: guard/typecheck pass; daemon 137 tests, web 108 tests pass. Focused package suites, not the full repository test suite or CI.

## Real-environment evidence and remaining gate

- **3745:** Actual case-sensitive APFS source files, actual production deploy planner, and actual production staging were exercised for file aliases, directory aliases, and an ordinary control. The case-sensitive destination preserved exact bytes; the ordinary temporary destination refused both alias plans. This is real filesystem evidence, not HTTP/Cloud/guest acceptance. The private test volume was detached afterwards.
- **3691:** Normal cancellation settled to signed_out/loginInFlight=false. A fresh Featuretest login started with HTTP 202 but its real activation page failed ERR_CONNECTION_CLOSED. The attempt was cancelled normally. Earlier successful UI restoration does not substitute for complete current Cloud/guest acceptance.
- **3722:** Actual dedicated Team project registration and deletion returned 200; subsequent GET returned 404. Independent normal run submission for the deleted conversation returned 404 CONVERSATION_NOT_FOUND, queued=false, with zero project runs. The old comment handoff disappeared. The attempted old-reference click was invalid after network-listener setup and deletion, so **no actual stale-button click is established**. The latest live route showed conversation-load failure/residual chrome rather than the expected explicit deleted-project terminal. The complete original UI sequence remains unverified.

Before marking ready: restore actual browser connectivity and repeat each full Cloud scenario. For 3722, enable network collection **before** locating controls, use a stable semantic/CSS locator, record whether the actual click occurred or the control was legitimately removed, and retain the resulting failure/terminal feedback and absence of message/Run/queue side effects. Never manufacture permissions, responses, DOM state, or database state to make acceptance pass.

No full acceptance, successful public-link receipt, CI pass, merge, deployment, or Plane status transition is claimed here.
