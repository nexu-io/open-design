# First live share-chain probe — PREPARED, NOT RUN

Source: first-chain acceptance task28, retained in the delivery coordinator’s local task artifacts.

This is an operator-assisted **live observation probe**, not a mocked Playwright CI test. It attaches to the already prepared Owner browser in an isolated tools-dev namespace; it never boots another runtime, makes an API write, fabricates a slug/session/comment, imports app internals, or substitutes a fixture. The operator performs real UI publishing, edits, selection, SSO, and comment submissions. Pressing Enter advances observation; it never makes an assertion pass. The probe clicks the actual UI Copy Link button and reads the system clipboard. All later page visits use that captured clipboard URL, never the CLI's expected URL or API receipt URL.

## DO NOT RUN until explicitly dispatched

Preparation/typechecking does not invoke the entry or connect to services. Two gates guard execution: explicit `--execute` and `SHARE_CHAIN_DISPATCHED=1`. A real expected URL must arrive first. No green runtime result is claimed for this preparation.

Runtime configuration (not alternative business inputs):
- `SHARE_CHAIN_CDP`: dedicated Chromium CDP endpoint; **never a personal/default/shared browser**. Resolve browser-seat coordination before dispatch.
- `SHARE_CHAIN_NAMESPACE`: existing non-default tools-dev namespace. The script records/accepts this operator prerequisite; does not independently attest sidecar identity.
- `SHARE_CHAIN_WEB_ORIGIN`: independently verified deployed console origin. Do not set it by extracting the test URL's origin; that would make the origin check tautological.
- `SHARE_CHAIN_PG_SERVICE`: optional authorized **read-only** libpq service name. `psql` must be installed. Never pass a database URL/password to the command. SQL uses an exact real POST comment ID, actual project and alias, read-only transaction, and body/selector equality. Output contains counts/booleans only. Without this configuration the persistence check is UNKNOWN, not inferred from HTTP201.
- Have exactly one real Owner file UI tab for the input project's ID already open and authenticated. No Owner route is synthesized. The expected URL is a reference only; step1 must republish through that Owner UI and copy the same URL.

Future dispatch command (not executed during preparation):

```sh
# Run only after the main session dispatches the real target and approves test accounts/resources.
with-env corepack pnpm --dir e2e exec tsx scripts/playwright.ts share-chain-probe \
  --execute "$REAL_URL" "$NEW_EVIDENCE_DIRECTORY"
```

Use a **new** output directory; existing directories are rejected. Headers, cookies, storageState, credentials and auth response bodies are never recorded. Relevant HTTP JSON is redacted; screenshots/rendered work/comment text are still sensitive and belong only to authorized test accounts in the private evidence directory. No tracing of the SSO/login page. Startup/stop of the preexisting Owner runtime remains with its owner via tools-dev; retain those lifecycle logs alongside the probe output. The probe closes only contexts it creates and disconnects its CDP client. It does not stop another session's runtime. Exit 0=all criteria PASS,1=FAIL,2=UNKNOWN present. Per-step `report.json`, redacted `http-evidence.json` (all response statuses, business-body allowlist only) and `http-requests.json` (request attempts, including those with no response), PG text output, screenshots and lifecycle records are retained.

## HTTP evidence completeness

Request attempts are retained independently of responses, so a blocked/failed directory request cannot disappear from the evidence. Capturing an attempt does not classify it as allowed or forbidden. All responses retain status/method/type/redacted URL, but only canonical comment, publication and metadata endpoints have JSON bodies read. Auth, directory and artifact-resource bodies are not read. URL userinfo/fragments and arbitrary query values are redacted; non-HTTP URL payloads are omitted. Persistence applies the existing identity/secret redactor as well.

`bodyRead` distinguishes `complete` (including a genuine JSON null), `unavailable` (for example a lost CDP response body), and `not-requested` (outside the body allowlist). An unavailable body is missing proof, never evidence of an empty response or a successful contract assertion. Body reads start in the response callback; the observer does not retry requests or promise that CDP will retain every body. Listeners are removed before pending reads are drained on exit.

The local recorder unit tests are not browser/privacy/SSO acceptance. Actual anonymous visibility, nonempty author-snapshot provenance, and absence of directory exposure still require the dispatched real observations.

## Data lineage / chronology

1. Given expected URL → actual Owner UI publish HTTP → actual UI copy/clipboard URL. Assert canonical `/artifact/project/UUIDv4`, independent Web origin, exact expected URL. Any explicit failure stops the chain.
2. Clipboard URL → fresh cookie-empty visitor context → rendered text compared with Owner's actual iframe output. Empty/non-text/dynamic artifacts need a specific content oracle; no made-up heading is substituted.
3. Same clipboard URL with final8path characters removed → E3 page (never E2) + actual navigation and relevant API status. This is a negative **branch**; step4 continues the valid step2 page, not a fabricated replacement URL.
4. Same visitor context → real login/UI comment POST → actual returned ID/body/author/isMine → visible article + optional exact PG match. Public author discriminator is `comment.author.kind`, not an invented top-level `authorKind`.
5. That exact ID → Owner panel row + naturally observed Owner comment read → internal authorKind. Public comment data is never substituted for the Owner response.
6. **Before republishing**, create the step7 local comment via Owner UI; capture its actual POST ID. Edit actual rendered content. Enter a real unsent visitor draft. Owner publishes, copies UI link again; verify stable URL and fresh page loads changed Owner output. Original page/draft must remain. If real toast is visible, its actual refresh button is exercised with native confirm: cancel preserves draft/document, accept reloads the same URL into new content and clears draft. No window.confirm replacement, page.reload shortcut, clock acceleration, or injected version event.
7. Only the captured pre-update local comment ID may satisfy public-read and visitor-list checks. Failure branch is not fault-injected. Missing delivery is UNKNOWN until a real terminal/backfill status distinguishes it from latency; it is never marked successful by note text alone.

## Rechecking an observed endpoint

Evidence URLs are **not replay inputs**. Every HTTP record labels its URL `urlPurpose: diagnostic-only`; userinfo/fragments and unrelated query values may have been removed or redacted. The recorder preserves `projectId`, `filePath` and `shareAlias` to explain routing, not to promise transport equivalence.

A permitted read-only recheck must reuse the actual live product request's full URL, including its complete query string, unchanged in memory. Never strip query parameters, build a URL from the pathname, or send a redacted report URL. Do not export credential-bearing URLs or copy auth headers/cookies into evidence. If the live request is no longer available, observe a fresh authorized product request instead of guessing missing values.

For stable-alias discovery, the actual metadata request carries `projectId` and `shareAlias=1`; the observed comment read carries `projectId` and `filePath`. Missing pairing context can correctly return not-found to prevent probing. A404 from an incomplete reconstructed request does not establish that the original artifact/comments were deleted. Preserve such a failed measurement with its correction; do not rewrite it into successful evidence.

## Human login handoff

Do not open a headed window until the human is ready and the browser seat has been checked using exact executable names. Use an isolated ephemeral context and follow the real share-page comment entry to login; never construct a replacement authentication URL. The human alone operates authentication fields, including email. Do not inspect field values, record the credential-entry process, take login screenshots, export cookies/storageState, or use capture/registration intermediate sessions as an authentication shortcut. No traces, HAR or video during authentication.

Wait for the original artifact URL or an actual signed-in UI condition, with a bounded several-minute timeout rather than a fixed sleep. Timeout/interruption closes only the owned browser/context. Retain the same context after return for comment selection/submission and exact-ID Owner/DB checks. A URL return alone is not proof of an authenticated accepted comment. Keep original comments needed for fallback coverage; releasing a browser seat does not authorize deleting test data.

Record deployment identity separately from behavior. The member-name snapshot repair does not guarantee a name on a `kind=user` comment: that path depends on the authenticated account's actual trusted nonempty name. Read the new accepted response without editing account data or backfilling old comments. A missing name can leave nonempty-name coverage unexercised even when submission/inbound succeeds.

## Settled criteria and remaining evidence gaps

- Step2's anonymous policy is defined: the work iframe, safety warning, Open Design badge/site link, Comments panel/entry and Share control are allowed. Collapsed Share input/copy controls may remain hidden. Metadata `snapshotSlug` is intentional discovery, not a leak; it is distinct from the stable `slug`. Author names carried in comment snapshots are allowed. Owner publish/update/stop/delete, project navigation, team management, member rows and identity/enumeration sourced from a member directory are forbidden. Exercise empty and populated datasets separately. The current probe still emits a stale “not enumerated” UNKNOWN rather than executing this complete oracle; that is a probe implementation gap, not a missing policy decision.
- Step5 requires the same accepted external comment ID on the Owner, with internal `authorKind=user`, without treating that author as a team member or weakening the member-directory permission boundary. Inspect actual requests and author-data provenance as well as visible controls; neither a screenshot nor absence of one endpoint-name pattern proves no disclosure. This is still a real behavioral check, not satisfied by the anonymous permission definition.
- Step6 policy is settled: `slug` is a stable alias, publication advances its pointer, and visitors see new content on explicit refresh. An already-open page does not poll publication metadata or automatically replace its work. Do not restore polling to make an update-toast wait pass. The probe's optional toast path cannot substitute for an explicit-refresh witness; absence of an unsolicited toast is not a product failure. Observe the unchanged document/draft before the explicit refresh and the actual new published content afterward. Preserve `publishedAt` and actual version chronology; do not confuse an alias with an immutable snapshot address.
- Step7: on an already-shared file, a “local” comment may already relay **before** republish. Its later visibility alone cannot identify a backfill cause. Need an approved real pre-publication pending state or server backfill-generation witness. No artificial network failure is introduced. This limitation must not be mislabeled as backfill causality proof.
- The failure-only half of step7 needs a naturally observed real failure and an exact UI hint/success surface. No failure observed => that branch UNKNOWN, not PASS and not a reason to manufacture a failure.

These are separate policy, implementation and evidence states. Resolving policy does not run a test, fix a probe or turn a historical UNKNOWN into PASS. The existing operator-assisted probe still needs the indicated oracle/refresh updates before an all-green report is possible; do not reinterpret its stale messages as missing user decisions.
