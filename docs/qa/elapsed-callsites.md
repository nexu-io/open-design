# OPEND-3378: ten original `elapsed` call sites

Audit baseline: CMS phase-2 API 2 host `7e6747b0e`. Line numbers in the table
refer to that fixed baseline. In-code markers C1–C10 are for later navigation;
do not treat the post-change count of `elapsed(` text matches as the original
ten sites. The fix adds recovery checks and moves C3/C6 duration budgets onto
the monotonic clock.

`monotonicElapsed` is a non-negative `performance.now()` delta. `elapsed` still
takes the maximum of the monotonic delta and the wall-clock delta. Wall-clock
rollback cannot extend grant lifetime. A forward wall-clock jump, or monotonic
stall after sleep on some platforms, still blocks display/interaction. When only
the wall clock appears expired and the monotonic window has not, keep the original
grant but hide it, observe for correction at most once per second; after
correction, restore only if both ages are still within window — clock anchors and
validity are never reset. Monotonic expiry, explicit withdrawal, clear, identity
change, and unmount all end recovery.

| Id / baseline line | Use | Wall clock jumps forward | Wall clock jumps backward | After forward jump, corrected back |
|---|---|---|---|---|
| C1 / 464 | `isCurrent`: mount and interaction gate | Returns false past the window; mounts in progress still report fenced per existing protocol | Monotonic clock still bounds the window; cannot extend | Same generation may be allowed again if still valid; a hidden presentation publishes a new generation on restore so stale async mounts cannot apply |
| C2 / 622 | Keep or drop grant after request failure | Ordinary failures only pause grants that look wall-expired; do not permanently delete; server withdrawal still revokes immediately | Keep until monotonic deadline; delete when due | Keep original grant; retain or the correction observer may restore; failures do not add time; explicit withdrawal is not recoverable |
| C3 / 633 | Fast-retry budget for this round | Uses monotonic delta; wall jump cannot skip the budget | Does not top up the budget | Original budget continues; does not reschedule retry on correction; still subject to two backoffs, offline policy, and pause |
| C4 / 659 | Expiry timer remaining | If callback only sees wall expiry, hide and keep grant while observing correction; if monotonic also expired, revoke permanently | Revoke at monotonic deadline as usual | 1s observer restores within the original window when the event loop allows; no new decision required. True expiry/withdrawal does not restore; a paused offline grant that truly expires still fires the original reclaim |
| C5 / 720 | Retain restores a set-aside lease | Does not restore display and does not unconditionally clear the grant; keep observing correction | May restore within the monotonic window | Restores only the original window; retain cannot create or renew grants; stays blank if nothing is recoverable |
| C6 / 744 | waiting / start-boundary re-request | Uses monotonic delta; forward jump cannot crush a 60s wait into 100ms | Does not add wait budget | Waits for the original boundary; still chunked by MAX_TIMER_MS; poll/resume may ask the server first, but the client never self-authorizes |
| C7 / 753 | Whether response latency exhausted validity | Permanent drop uses monotonic response cost only; a valid response that looks wall-expired is paused for save | Does not extend the server-issued window | May auto-mount a response already received without waiting for another grant; request start is not reset; expired responses still drop |
| C8 / 779 | Whether same-key keeps value/generation | Mounted same-key renewals keep generation; leases that need restore must satisfy both clocks | Monotonic deadline governs restore; rollback cannot replay an expired lease | Still-mounted stays; hidden/fenced ones publish a mountable generation via restore or a later valid decision |
| C9 / 861 | resume: refresh / hide / revoke | Suspected expiry hides first; keep grant while monotonic still valid; online revalidation and offline limits unchanged | Valid display does not flash away; background refresh; true expiry is not recoverable | Normal, device-offline, and server-fallback paths may restore the original valid grant; identity/revocation win; never restore to a previous account |
| C10 / 931 | Exported absolute `deadline` | Projection only; may become “now + 0”; exports 0 while hidden | Projects remaining monotonic budget onto the new wall clock; does not extend the grant | Projection for a valid original lease returns to the original timeline; same after restore. Consumers must not treat the projection as permanent revocation |

New `elapsed` reads inside recovery checks reuse the C1/C4 dual-clock display gate.
They only observe correction: no network, no `serverTime` update, and not a new
grant source. Extra failure/retain/decision/wake reads distinguish “temporarily
looks expired” from “truly expired”.

Three red tests landed before product changes
(`apps/web/tests/components/touchpoint-clock-recovery.test.ts`: failure, response,
expiry callback) and failed on the integrated baseline. After the fix the same
cases pass, with additional coverage for revoke, clear, identity change, disabled,
unmount, true monotonic expiry, wall rollback, retry, and waiting boundaries;
original 3376 cases remain. Final focused run was 212/212 (199 in the original
four files + 13 in the new file); offline-pause true-expiry reclaim has separate
red→green evidence.

Limits: browser `Date` / `performance` alone cannot distinguish every “system
sleep” from “system clock change”. Dual-clock conservative hide avoids keeping
UI up after macOS sleep if only `performance.now` were used; restore only when
both clocks allow after correction. 1s is the observe period, not a real-time
promise under background throttling or sleep. Server withdrawal is never restored
by correction. Validation here is local virtual-clock + mocks; native sleep/wake,
Windows, and remote Test/QA acceptance are not claimed.
