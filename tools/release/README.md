# tools-release

`tools-release` owns release lifecycle objects and immutable publication. It is
not an Electron builder.

The active exact flow is:

1. resolve content identities and accepted baselines;
2. prepare signed content and Shell requirements;
3. finalize release-neutral Shell distribution contributions;
4. publish immutable objects with readback verification;
5. collect target-bound acceptance credentials;
6. compare-and-swap the channel head.

`release-exact` is the only Electron release workflow in this slice, and
`betahyx` is its isolated Electron delivery channel. The explicit channel and
release version travel together through storage, acceptance, and activation.
A version such as `0.1.0-betahyx.1` repeats the channel as a defensive naming
convention; it does not replace the explicit channel field.

Publication eligibility is enforced by `tools-release`, for local and remote
execution alike. `stable` and `prerelease` require `refs/heads/release/vX.Y.Z`
matching the release base version. Custom channels must match `^[a-z]{3,10}$`
and may use any valid source branch with an exact source commit. The current
`exact-validation` rollout permits only `betahyx`; it is not a main-only or
local-only publishing path. Existing artifact trust, acceptance, and activation
gates remain in force. Fossil channel-name readers retain their decoding grammar;
reading an old channel name does not authorize a new publication.
Stable versions are `X.Y.Z`; counted channels use `X.Y.Z-<channel>.N`.

Content metadata schema 5 declares `shell.<type>.version.min` and the associated
build identity. Producers and consumers switch together; regenerate experimental
schema-4 metadata instead of accepting both requirement shapes. Retaining a
previous compatibility floor requires a verified schema-5 envelope for the same
channel and unchanged build identity. This does not change generation/state
schema versions or give Closure a Capsule update protocol.

`exact-control` accepts an `exact.acceptance` request with `schemaVersion: 1`,
`policyReceipt`, `publishReceipt`, `shellType`, `target`, and `installedRoot`.
Electron also requires `runtimeLog`; hot acceptance adds `hotAcceptanceReceipt`,
`standaloneState`, and `standaloneGenerationsRoot`. Terminal uses
`runtimeProofRoot` for its install/start/status/stop receipts. The collector
selects the required target from the published topology and rejects policy
mismatches, altered installed bytes, and an incomplete latest runtime attempt.
The resulting credential is evidence binding, not a substitute for executing
the real installed lifecycle and update acceptance matrix.

Legacy channel metadata helpers remain only as file/data protocol readers and
use `resources/channel-versions.json` as the channel-owned base-version
registry. They do not build or validate Electron artifacts and cannot serve as
an acceptance path.

The workspace CLI and the relocatable `dist/exact-control.mjs` share the
`topology`, `scene pack|unpack|restore`, `policy resolve|authorize`, `prepare`, `finalize`, `publish`, `activate`, and
`baseline stage|promote` commands. Use explicit flags and consume their receipts;
workflows must not construct transient JSON requests for these operations.
The relocatable build runs with Node 24 without a workspace install. Credentials
remain environment inputs, never command-line arguments or receipt fields.

`build capsule` produces release-neutral content separately. `build scene` may
consume `--capsule-content` and `--capsule-archive` together to avoid recompiling
that input; the public Shell builder still verifies its target, digest and size.
Without these inputs the cold scene path builds its baseline Capsule locally.
This input path does not itself establish a cache hit or authorize reuse: the
planner and convergence cache must bind the source recipe to verified artifacts.
Final Electron metadata binds the published Capsule manifest and archive by
URL, SHA-256 and size. Compatibility is declared once in the signed Capsule
manifest; no separate Capsule latest pointer is published.

`prepare` and `finalize` enforce the same channel-independent Capsule release
budget, including reused products: at most 8 payload files, 1 MiB ZIP bytes and
4 MiB expanded bytes. The initial budget is based on a measured product with
one file, 467,112 ZIP bytes and 1,545,796 expanded bytes. Limits are release
policy in `src/exact/capsule-budget.ts`, not runtime protocol or CLI overrides.
Preparation records actual counts, sizes, digests and the budget revision;
finalization rechecks actual archive/tree bytes under the current policy rather
than trusting an old measurement. Adjust limits only against measured minimal
first-screen dependencies, never automatically to admit growing payloads.

`prepare --closure-artifact <file> --standalone-artifact <file>
--resource-receipt <file> --capsules <directory>` can select current independent
products without modifying retained carrier scenes. Capsule directories contain
`<target>/capsule-content.json` and `<target>/capsule.zip` for every active
Electron target. Missing, duplicate, mismatched or altered Capsule products
fail closed. Omitted inputs use scene seeds for cold assembly. A resource receipt
is a complete collection, not the single-resource build receipt. These inputs
do not authorize a cache hit or skip installed acceptance; carrier installation
seeds and current signed release content keep separate digest bindings.

Repeat `prepare --data-resource <receipt>` for all nine declared data groups to
compose independent build/restored products over the selected runtime collection.
Each `closure.data-resource.build` receipt must sit beside its content-addressed
archive; stale absolute paths from another machine are ignored. The full data
selection replaces old data seeds while retaining daemon/Web from
`--resource-receipt` (or the scene default). Missing groups, duplicates, unknown
IDs, invalid receipts and changed bytes fail closed. This composition performs
no builds and claims no cache hit; upstream plan/convergence must justify reuse.

`build resource --resource-id <id> --root <workspace> --output <directory>
--receipt <file>` invokes the Closure public producer for one declared data
group. It needs no Shell, platform, channel or version and does not compile
Closure, Web or daemon. Its `closure.data-resource.build` receipt describes one
artifact, never a complete resource set or a reusable-result authorization.
The planner owns build/restore selection; release composition must still verify
all required resources before producing complete signed content.

The exact plan declares `closure.data.<id>.build` for all nine public data
groups. Each identity includes its producer and its own unfiltered resource
bytes; identities remain target-scoped conservatively. Optional `build resource
--plan <release-plan>` verifies that selected node before and after production,
then adds `planNode` to the receipt. It hashes only that resource's declared
closure, so unrelated resource directories and daemon/Web sources need not be
present. A stale plan or mid-build source change emits no success receipt;
existing receipts are never overwritten. This binding is evidence for the
existing convergence authority, not permission to publish cache results.
The old aggregate scene/Closure dependencies remain in place until independent
build, restore and composition are wired end to end; these nodes alone do not
enable workflow skips.

`resource contribute --plan <file> --resource-id <id> --pending <file>
--workload <name> --resource-receipt <file> --artifact <name> --output <directory>`
verifies the planned resource and stages `artifact/` (one archive plus portable
`resource-receipt.json`) and `products/` (the existing convergence handoff
manifest). It emits no candidate for a planner cache hit and publishes nothing
to R2. The job artifact uses the existing convergence ZIP normalization.
`resource restore --plan <file> --resource-id <id> --pending <file>
--workload <name> --output <new-directory>` accepts only a complete planner hit,
credential-free HTTPS and verified transport bytes. It checks the exact plan
identity, resource ID, archive size/digest and payload allowlist before exposing
the directory. Pass its `resource-receipt.json` directly to `prepare
--data-resource`; restoration never executes a compiler or reads the original
machine's paths. Scene and resource acquisition share one convergence transport
implementation. These commands do not yet replace the workflow's aggregate
scene execution.

Scene cache transport uses an opaque `scene.tar` inside the existing GitHub
artifact / convergence ZIP. It preserves native executable permissions,
read-only files and hidden inputs, while convergence retains ownership of
immutable R2 cache publication. Unpack only creates a new scene directory and
rejects links and unsafe paths; it does not repair installed applications or
replace the consumer's full scene verification. The cache policy is versioned
to miss older, lossy directory artifacts without deleting them.
`scene restore` requires a complete cache hit from the convergence planner,
verifies the downloaded ZIP digest, and accepts only its opaque `scene.tar`.
`topology` projects full/hot actions over the workflow's declarative target and
runner configuration; it does not enable deferred targets or create cache hits.

`activate` and `baseline promote` accept `--channel-head` for a relocated local
file. Its bytes must match the original publication receipt: relocation never
rewrites that receipt or changes its authority.
Baseline promotion records only the carrier build, distribution and installed
acceptance identities (plus hot acceptance when explicitly proved). It does not
mark contract/Closure builds or any unit-test node as executed. Those results
must come from their own verified convergence records; an installed artifact is
not evidence that the current checkout's test suite ran.

`validate <node> --root <workspace> --plan <release-plan> --log <fresh-file>
--receipt <fresh-file>` executes the selected `electron.contract.test`,
`electron.shell.test` or `closure.test` recipe. Build prerequisites first.
The command recomputes the selected node and its recursive dependency identity
before and after execution; unrelated node changes do not invalidate its result.
It retains test output and writes a successful identity-bound receipt only after every
command succeeds. It refuses unsupported/unselected nodes, stale source plans,
existing result files and mismatched native execution platforms. The pure
contract tests may run on another platform; the receipt records that platform.
These are local execution receipts, not self-authorized convergence cache hits.

Coverage defaults to `architecture`. For `closure.test`, this runs Closure's
package/resource tests plus focused daemon resource/startup/status and Web
proxy/shutdown contracts. It does **not** run daemon or Web business aggregates.
The recipe is owned by tools-release; release-exact explicitly selects this
coverage and retains real installed/hot-update acceptance separately.

Only a broad business change, insufficient focused evidence, or an explicitly
required stage warrants `validate closure.test --coverage business --reason
"<risk requiring full business validation>"`. This runs the full Closure,
daemon and Web suites. Its `exact.business-validation` receipt records the
reason, coverage, a distinct identity and underlying `planIdentity`; it is not
an architecture-node cache result. Recipe changes invalidate prior identities.
Do not rerun business aggregates merely because orchestration moved to another
stage, or reinterpret a historical full-suite receipt as proof of new sources.

`baseline stage --validation <receipt>` requires current successful native Shell
test evidence even when a supplied plan claims that testing was already cached.
A pending test action can be satisfied without rebuilding the physical carrier;
build/distribution/full-installed actions still prohibit that reuse path.

`prepare` and `finalize` authorize the bound policy and execute release-owned
content assembly and signing in-process. Cross-job collection and relocation
share that implementation; tools-pack has no exact signing API or request CLI.
Previous content is acquired from the policy's channel origin when no explicit
envelope is supplied. A missing channel head is cold start; other acquisition
failures and content digest mismatches fail closed instead of silently resetting
the compatibility floor.

```sh
pnpm --filter @open-design/tools-release typecheck
pnpm --filter @open-design/tools-release build
pnpm --filter @open-design/tools-release test
pnpm exec tools-release exact-plan --help
pnpm exec tools-release exact-release-plan --help
pnpm exec tools-release exact-control --help
```
