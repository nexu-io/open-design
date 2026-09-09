# tools-release

`tools-release` owns release lifecycle objects and immutable publication. It is
not an Electron builder.

The active exact flow is:

1. acquire build products selected by the Python control plane;
2. prepare signed content and Shell requirements;
3. finalize release-neutral Shell distribution contributions;
4. publish immutable objects with readback verification;
5. collect target-bound acceptance credentials;
6. compare-and-swap the channel head.

`release-exact`, `release-prerelease` and `release-stable` have independent
workflows and independent JSON plan declarations, with no indirect invocation.
Only `release-exact` / `betahyx` is authorized for live delivery in this task.
The explicit channel and
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

Release workflows use the existing `CLOUDFLARE_R2_RELEASES_*` configuration:
AK/SK map to `RELEASE_STORAGE_ACCESS_KEY_ID` / `RELEASE_STORAGE_SECRET_ACCESS_KEY`,
URL/BUCKET select the SigV4 target (region `auto`), and PUBLIC_ORIGIN prefers the
repository variable with a secret fallback. Workload-result AK/SK remain confined
to trusted convergence; producer plans use only `OD_WORKLOAD_RESULTS_BASE_URL`.
`EXACT_SIGNING_KEY_ID` / `EXACT_ED25519_PRIVATE_KEY` hold the persistent metadata
signing pair; optional `_NEXT` secrets support explicit rotation. Never replace
that pair with ephemeral local fixture keys. Apple certificate base64 and password
are passed directly as `CSC_LINK` / `CSC_KEY_PASSWORD`, alongside the existing
Apple notarization credentials, only for Electron distribution execution.

Content metadata schema 5 declares `shell.<type>.version.min` and the associated
build identity. Producers and consumers switch together; regenerate experimental
schema-4 metadata instead of accepting both requirement shapes. Retaining a
previous compatibility floor requires a verified schema-5 envelope for the same
channel and unchanged build identity. This does not change generation/state
schema versions or give Closure a Capsule update protocol.

`tools-release acceptance collect` accepts explicit policy, publication, Shell, target and
installed-root flags. Electron also requires runtime-log evidence; hot acceptance
adds hot-update, Standalone state and generation evidence. Terminal uses
runtime proof receipts for its install/start/status/stop lifecycle. The collector
selects the required target from the published topology and rejects policy
mismatches, altered installed bytes, and an incomplete latest runtime attempt.
The resulting credential is evidence binding, not a substitute for executing
the real installed lifecycle and update acceptance matrix.

Legacy channel metadata helpers remain only as file/data protocol readers and
use `resources/channel-versions.json` as the channel-owned base-version
registry. They do not build or validate Electron artifacts and cannot serve as
an acceptance path.

The workspace CLI and relocatable executable `dist/tools-release` use the same
`src/index.ts` entry and public commands: `scene pack|unpack|import|verify`,
`policy resolve|authorize`, `prepare`, `finalize`, `publish`, `activate`, and
`baseline inspect|fetch|promote`. Use explicit flags and consume their receipts;
workflows must not construct transient JSON requests for these operations.
Workflows put this executable on PATH and call `tools-release` directly. The
relocatable release commands run with Node 24 without a workspace install;
catalog rendering loads its optional browser/native image dependencies only
when those catalog commands execute. Credentials
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

Each workflow plan declares independent builds for all nine public data
groups. Production accepts business inputs only: no plan, pending workload or
source-identity recomputation. Python owns workload identities and decides which
producers execute. Production receipts describe actual resources, not plan nodes.

`resource export --resource-id <id> --resource-receipt <file> --output <directory>`
stages `artifact/` with one archive and a portable `resource-receipt.json`.
`resource import --resource-id <id> --descriptor <file> --output <new-directory>`
accepts an ordinary `{url, sha256}` blob descriptor. It verifies credential-free
HTTPS, transport bytes, resource ID, archive size/digest and payload inventory.
Pass the imported receipt directly to `prepare --data-resource`; imports never
execute compilers or read producer-machine paths. Capsule, platform and base use
the same export/import boundary, with an explicit target for native products.
Their shared artifact transport has no knowledge of cache decisions.

Each independent workflow JSON declares artifact product names and prefixes.
The Linux Python control plane binds successful executions through
`contribute-all`; native jobs emit no workload result manifests. Cache hits
are not contributed again. Trusted convergence remains the R2 cache writer.
Scene cache transport uses an opaque `scene.tar` inside the existing GitHub
artifact / convergence ZIP. It preserves native executable permissions,
read-only files and hidden inputs, while convergence retains ownership of
immutable R2 cache publication. Unpack only creates a new scene directory and
rejects links and unsafe paths; it does not repair installed applications or
replace the consumer's full scene verification. The cache policy is versioned
to miss older, lossy directory artifacts without deleting them.
`scene import --descriptor <file>` verifies the downloaded ZIP digest and accepts
only its opaque `scene.tar`. `scene verify` checks the actual target, carrier
identity and absence of release-owned fields without reading planner state.
Python `execution` projects each workflow's own runner/matrix declarations and
literal business inputs. `prepare --shells <file>` receives only a Shell/target
inventory. Python alone computes workload identities, cache decisions and result
bindings. The release tool is itself a reusable product; Linux Python `acquire`
bootstraps its verified archive without requiring the tool to restore itself.
The plan job does not install Node packages or execute tools-release.

`activate` and `baseline promote` accept `--channel-head` for a relocated local
file. Its bytes must match the original publication receipt: relocation never
rewrites that receipt or changes its authority.
Schema-3 baseline promotion records the physical carrier, distribution and
installed acceptance evidence (plus hot acceptance when explicitly proved).
It contains no workload identities or cache authorization. It does not
mark contract/Closure builds or any unit-test node as executed. Those results
must come from their own verified convergence records; an installed artifact is
not evidence that the current checkout's test suite ran.

`validate <node> --root <workspace> --target <target> --source-commit <sha> --log <fresh-file>
--receipt <fresh-file>` executes the selected `electron.contract.test`,
`electron.shell.test` or `closure.test` recipe. Build prerequisites first.
The workflow supplies the verified checkout commit; Python owns source identities
and scheduling. This command neither reads a plan nor recomputes workload keys.
It retains test output and writes an execution receipt only after every command
succeeds. It refuses unsupported recipes, malformed source bindings, existing
result files and mismatched native execution platforms. The pure
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
reason, coverage and source commit; it contains no workload or plan identity and
is not an architecture-node cache result. Python binds recipe changes to results.
Do not rerun business aggregates merely because orchestration moved to another
stage, or reinterpret a historical full-suite receipt as proof of new sources.

`baseline inspect --publish-receipt <file>` compares the verified accepted
baseline with the actual published carrier and release version. A missing or
incompatible baseline selects full installed acceptance; it never invalidates
build caches. Invalid metadata fails closed. A compatible older baseline selects
hot acceptance and emits the business snapshot consumed by `baseline fetch`.
`baseline fetch --baseline <file> --publish-receipt <file> --validation <receipt>`
requires matching physical carrier bytes and current successful native Shell
test evidence. It neither consumes nor recomputes a plan.
The fetched installer is only an upgrade-test fixture, never a distribution
contribution. Every release assembles a new installer with its current Capsule.
Hot acceptance collects the upgraded baseline with `--hot-receipt` and requires
separate `--first-install-root` and `--first-install-user-data-root` evidence for
the current installer. The resulting credential retains current first-install
proof as its primary installation and nests the old installation under
`installed.proof.hotUpdate.baseline`.

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
pnpm exec tools-release --help
pnpm exec tools-release policy --help
pnpm exec tools-release baseline --help
```
