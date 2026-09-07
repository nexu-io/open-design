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
gates remain in force. Fossil metadata readers retain their decoding grammar;
reading an old channel name does not authorize a new publication.

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

`prepare` and `finalize` authorize the bound policy and call the public
`@open-design/tools-pack/exact` content atoms in-process. They own cross-job
input collection and relocation, not a second signing or assembly implementation.
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
