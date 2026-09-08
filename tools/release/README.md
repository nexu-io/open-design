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

`build resource --resource-id <id> --root <workspace> --output <directory>
--receipt <file>` invokes the Closure public producer for one declared data
group. It needs no Shell, platform, channel or version and does not compile
Closure, Web or daemon. Its `closure.data-resource.build` receipt describes one
artifact, never a complete resource set or a reusable-result authorization.
The planner owns build/restore selection; release composition must still verify
all required resources before producing complete signed content.

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
