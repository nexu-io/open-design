# OPEND-3378: the ten `elapsed()` consumers in the touchpoint lifecycle

Audited against the current `apps/web/src/components/touchpoint-lifecycle.ts`
on the CMS residual-fixes branch (base `500257975`, plus the clock-recovery
change in the same commit as this file). Line numbers refer to that file after
the change. In-code markers `C1`–`C10` name the original ten consumers; the
recovery checks added by the fix are listed separately and are not new
consumers of authority.

## Clocks

- `monotonicElapsed(start)` (line 274): non-negative `performance.now()` delta.
  Monotonic expiry is final.
- `elapsed(start)` (line 275): the larger of the monotonic delta and the wall
  delta `Date.now() - start.wall`. Both clocks are kept; neither replaces the
  other. A wall rollback can never make `elapsed` smaller than the monotonic
  delta, so it cannot extend a grant. A forward wall jump (or a monotonic stall
  across sleep on some platforms) still hides the presentation.
- Wall-only expiry is a display fence, not revocation. The lease is set aside
  (`suspendClockLease`, line 566) with its original `start` and `validForMs`;
  `recoverClockLease` (line 547) checks at most once per second, without
  fetching, renewing, or touching `serverTime`, and restores only while both
  clocks are inside the original window. Monotonic expiry, server withdrawal,
  `clear`, identity change, disable, and unmount end recovery permanently.

## Scenario: wall clock jumps forward, then back

| Id | Line | Use | Forward jump | Then corrected back | Verdict |
|---|---|---|---|---|---|
| C1 | 468 | `isCurrent`: mount / interaction gate | False past the window; in-flight mounts are fenced | True again for the same generation only while both clocks are inside the window; a lease restored from suspension gets a fresh generation, so stale async mounts cannot apply | Acceptable (dual clock, unchanged) |
| C2 | 660 / 664 | Keep or drop grant after a request failure | Was: dropped permanently. Now: suspended unless withdrawn or monotonic-expired | Recovered within the original window | Fixed (red test: failure during forward jump) |
| C3 | 674 | Fast-retry budget inside the poll cycle | Was: wall jump spent the budget and skipped retries. Now monotonic only | Budget unchanged; no extra retry scheduled by the correction | Fixed (red test: retry budget) |
| C4 | 702 / 704 | Expiry timer | Was: revoked permanently. Now: hides and suspends while monotonic-live; revokes when monotonic-expired | Restored by the 1s observer; true expiry still triggers the offline reclaim request | Fixed (red tests: expiry callback, offline reclaim) |
| C5 | 770 / 775 | `retain` restores a set-aside lease | Does not restore; keeps the suspended lease observing | Restores only the original window; `retain` never creates or renews time | Fixed |
| C6 | 801 | Waiting / start-boundary re-request delay | Was: a forward jump collapsed a long wait to 100ms. Now monotonic only | Original boundary kept; still chunked by `MAX_TIMER_MS`; only a server answer grants display | Fixed (red test: waiting boundary) |
| C7 | 812 | Did response latency exhaust validity | Permanent drop only on monotonic latency; a valid answer that looks wall-expired is suspended (line 847) | Mounts without another request; request start not reset | Fixed (red test: valid response) |
| C8 | 842 | Same-key renewal keeps value / generation | Mounted renewal keeps generation; a resumed lease needs both clocks | Fenced / hidden leases get a mountable generation on restore or the next valid decision | Acceptable (unchanged logic) |
| C9 | 933 / 940 / 957 | Resume: refresh, hide, or revoke | Hides first; monotonic-live leases are suspended (offline and server-fallback paths too) | Restores the original grant; identity and withdrawal still win; never restores to a previous account | Fixed (previously offline paths revoked permanently) |
| C10 | 1009 | Exported absolute `deadline` | Projection may become `now + 0`; exports 0 while suspended | Returns to the original timeline after restore | Acceptable: projection only, never authority |

Recovery-check reads at lines 558, 770, 847, and 886 reuse the C1/C4 dual-clock
gate. They only observe whether a correction happened.

## Wall clock jumps backward only

All consumers keep the monotonic lower bound, so no grant, retry budget, or
wait gets longer. C10 rebases the projected deadline onto the new wall clock
without extending monotonic life.

## Existing assertions kept

`touchpoint-lifecycle`, `touchpoint-withdrawal-deadline`, and
`touchpoint-offline-fallback` all pass unchanged.
`tests/components/touchpoint-clock-recovery.test.ts` (13 cases) failed 6/13 on
`500257975` without the lifecycle change, and passes 13/13 with it. Focused run:
101/101 across the four files.

## Out of scope: the Test-channel clock

`TestCampaignModal.tsx` keeps its own `testElapsed` (line 302). It ratchets per
grant and never shrinks, and the render path retires an expired grant once
("a later clock correction cannot revive it"). After a forward jump that is
later corrected, a Test-channel placement stays hidden until the next server
decision, which normally arrives at the next 10s poll. This is not one of the
ten lifecycle consumers and is deliberately fail-closed, so it is documented
here and left unchanged.

## Limits

Browser `Date` / `performance` cannot tell every system sleep apart from a
clock change. The 1s observer period is best effort under background
throttling. Validation is local virtual clock plus mocks. Native sleep/wake,
real Windows clock changes, and remote QA are not claimed.
