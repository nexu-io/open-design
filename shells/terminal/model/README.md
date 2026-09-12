# Shell lifecycle formal model

This directory is the executable design authority for the Terminal reference
Shell. It does not define a Terminal runtime implementation. The native `sh`
and PowerShell carriers remain mechanical, and the TypeScript reference model
lives under `tests/model` only.

The purpose of the model is to make the future Electron adapter a refinement of
explicit Shell-neutral laws instead of a second lifecycle design. “Formal” here
means finite states, typed operations, named linearization points, invariants,
and exhaustive bounded traces. It does not claim to prove operating-system or
filesystem behavior.

## 1. Identities

The following identities are independent. No identity may be reconstructed from
another one.

| Identity | Owner | Meaning |
| --- | --- | --- |
| `channel + namespace` | Standalone | One logical Closure instance shared by every Shell attachment. |
| `attachment id + capability` | Standalone lifecycle adapter | One renewable reference to that logical instance. Shell type is an attachment fact, not instance identity. |
| `shell type + version + build hash + installed digest` | Shell contract | Exact caller/installer capability and compatibility proof. |
| resource-set declaration | Product Shell kit | The complete physical resources that must start and retire together. Terminal uses a fixture declaration; Electron will own its real declaration in `electron-kit`. |
| generation reference | Sidecar | One observed process generation, fenced by stamp, root PID, and process start time. |
| transition token + logical fence | Standalone | Exclusive authority to change one logical instance. |
| install attempt id | Shell updater | One immutable candidate-to-installer transaction. |
| blob digest | Standalone | Immutable content identity. Node is deliberately excluded because it is the Shell-carried cold-start anchor. |
| bootloader binding digest | Standalone | Exact `scope + generation + launcher protocol/path/blob + Shell floors` selected by one long-lived host. |

In particular, attachment occupants are sufficient for blocking policy and user
interaction, but never prove which processes exist. Only the product resource
set plus Sidecar generation observations can establish physical retirement.

## 2. Orthogonal state axes

The product state is a constrained product of smaller algebras:

```text
Instance       = stopped | running(generation, instance)
Bootloader     = unselected | selected(binding) | terminal-failure(binding, error)
Attachments    = finite map attachment -> heartbeat/capability/Shell identity
Transition     = idle | reserved(token, fence, lease) | stopped-sealed(token, fence, lease)
Physical set   = finite map resource -> absent | generation(ref)
Physical guard = free | held(attempt, resource-set)
Retirement     = none | observed | retired | verified(certificate)
Resource sync  = unknown | syncing | ready | corrupt | failed
Compatibility = compatible | shell-upgrade-required(requirement)
Updater        = idle | checking | available | downloading | ready
               | applying | handed-off | installed | failed
Handoff        = none | durable(attempt, candidate, retirement certificate)
```

The implementation must not replace this product with one enum containing every
combination. Cross-axis invariants reject invalid combinations.

## 3. Guarded retirement transaction

The highest-risk operation is a Shell installation that has to retire Closure.
Its required refinement is:

```text
reserve logical transition
  -> acquire the complete physical resource-set guard
  -> observe all generation roots at one process-table boundary
  -> retire only the observed generations
  -> verify no survivor or replacement generation exists
  -> commit the logical stopped-sealed transition       [linearization point]
  -> persist the exact installer handoff
  -> release the physical guard
```

Every start path for the same resource set must use the same guard. Otherwise a
new generation can appear between physical verification and logical commit.
The guard must remain held through durable handoff creation; returning only a
retirement result to an unguarded caller is not a valid refinement.

The preferred adapter shape is a continuation, so authority cannot accidentally
escape its lifetime:

```ts
withRetiredResourceSet(request, async (verified) => {
  const sealed = await verified.commitLogicalStop();
  return await sealed.persistInstallerHandoff();
});
```

The install attempt id is also supplied when reserving the logical transition.
Re-presenting that id resumes the same unexpired reservation or sealed
transition; it cannot adopt another attempt. This binding is what lets a Shell
restart after logical commit but before durable handoff creation.

Standalone owns the logical transition. Sidecar owns observation, generation
fencing, retirement, and the physical guard primitive. A product Shell kit owns
the resource-set declaration and composes both authorities. Closure sees only
the Shell-neutral updater/lifecycle ports.

## 4. Invariants

The executable reference model checks these laws after every accepted command:

1. At most one transition exists for a `channel + namespace`.
2. A stopped logical instance has no generation, instance, or attachments.
3. A stopped-sealed transition carries the current logical fence.
4. Observation and retirement evidence belongs to the current physical guard
   owner and exact resource set.
5. A retirement certificate can be produced only while the guarded physical set
   is empty at the same physical epoch.
6. Logical commit requires that exact certificate and guard; it clears all
   attachments and advances the logical fence exactly once.
7. Durable installer handoff requires the matching sealed transition and copies
   its retirement certificate. It is never installation success.
8. Replaying an accepted command for the same attempt is idempotent. A stale
   attempt cannot mutate a newer fence or reuse another attempt's evidence.
9. Losing the physical guard invalidates transient observation and retirement
   evidence. Expiring the logical transition invalidates its old owner.
10. Starting any resource while its set is guarded is rejected. After release,
    later physical activity does not rewrite the historical handoff certificate;
    the installer must acquire the same guard before replacement work.
11. `running` does not imply every physical resource is alive: retirement may
    succeed before a logical commit fails. Recovery must tolerate this safe,
    stopped-but-not-committed intermediate condition.
12. No failure before logical commit may create an installer handoff.
13. Recovery after a lost guard must re-observe and re-verify the complete
    physical set. An earlier certificate never crosses a guard lifetime.
14. A running instance carries one bootloader binding digest; readiness,
    commands and Shell capabilities must echo that exact digest.
15. Bootloader selection is monotonic for one host. A selected launcher failure
    is terminal and cannot fall back in-process; rollback becomes eligible only
    to a fresh host lifecycle.
16. One selected generation body may serve many compatible attachments, but a
    changed attachment identity or another generation binding fails closed. The
    body closes only after its last handle is released.
17. Cold start and transition-owned restart enter the same handoff continuation;
    neither path may mutate lifecycle state before the exact generation launcher
    has been selected and imported.

## 5. Algebraic laws

The focused model suite establishes the following bounded properties:

- **Idempotence:** observe, retire, verify, commit, and handoff replay do not
  advance identities twice.
- **Fencing:** transition expiry or another attempt prevents stale commit.
- **Guard exclusion:** resource start and replacement cannot interleave with a
  guarded retirement.
- **Monotonicity:** logical fence, physical epoch, and durable handoff knowledge
  never move backwards.
- **Atomic visibility:** every state containing a handoff also contains a sealed
  logical transition and the exact certificate created before its linearization.
- **Failure closure:** owner crash, lease expiry, survivor, and commit failure
  leave either a retryable reservation or a fenced abort, never a false handoff.

These are safety properties. Liveness still depends on bounded Sidecar calls,
lease renewal, lock timeouts, and an external retry policy.

## 6. Failure semantics

| Failure | Required result |
| --- | --- |
| Ambiguous roots, endpoint ownership change, survivor, or replacement | Do not commit logical stop; do not create handoff. |
| Physical guard timeout | Return unavailable; make no logical mutation beyond an already-held reservation, which remains releasable/expirable. |
| Transition renewal or fence failure | Abandon the attempt; its physical evidence is unusable. |
| Physical retirement succeeds but logical commit fails | Keep the instance physically stopped, release authority, and retry/recover from Standalone state. Never report it running or handed off. |
| Handoff persistence fails after logical commit | Keep the sealed transition; retry the same attempt idempotently. Do not start an unrelated generation through the guarded set. |
| Shell owner crashes | Kernel/process guard releases; transient physical evidence disappears; logical reservation is recovered by its lease/fence. |
| Installer opens successfully | Persist `handed-off`; wait for an exact newly installed Shell identity before recording `installed`. |
| Selected generation launcher import/start fails | Roll back only the durable generation state, return the original failure, and require a fresh host for recovery. Never invoke baseline or last-healthy code in the selected host. |
| Readiness/status/capability returns another binding | Reject it as stale or corrupt; never confirm the activation attempt. |

## 7. Refinement boundaries

- `packages/standalone` remains the pure domain implementation for instance,
  attachment, transition, updater, resource, generation, and recovery states.
- `packages/sidecar` supplies physical mechanics. It does not know Shell update
  policy, logical channel state, or product resource membership.
- `packages/electron-kit` will declare Electron resource sets and implement the
  guarded continuation. This declaration must not remain in `tools-pack`.
- `shells/terminal` proves the complete calling shape with a local fixture and
  fault-injectable model. It does not copy Sidecar discovery or process control.
- `apps/closure` emits content and consumes progress/interaction handlers. It
  does not own resource sets, installer policy, or Shell scripts.

## 8. Reference ledger

The archive POC gold snapshot is
`715c0cb9d8ffdedd47d8c27a78a1d5dfdb2dc201`.

| Reference | Behavior retained | Deliberately discarded |
| --- | --- | --- |
| `shells/electron/src/main/updater/standalone.ts` | Shell-vs-Closure update routing and explicit minimum-Shell handling. | Electron-private metadata probing as a general Standalone concern. |
| `shells/electron/src/main/updater/release-lifecycle.ts` | Exclusive lifecycle work, retryable cleanup, and observations that are not authority. | mkdir/PID lock as a cross-platform process-generation proof; Electron store layout. |
| `shells/electron/tests/main/updater-host-boundary.test.ts` | Installer launch separated from quit, one transition owner, and host handlers around domain ports. | Source-text tests as the formal lifecycle proof. |
| `shells/electron/tests/main/session-lifecycle.test.ts` | Monotonic persisted observations and retry-until-ack failure reporting. | Desktop session/crash policy in Standalone. |
| `apps/standalone/src/bootloader.ts` and its tests | One selected inner bootloader, shared body, attachment multiplexing, generation-fenced status/capabilities, final-reference close, and no fallback after selection. | The historical app placement and Electron-specific body wiring. |
| `apps/standalone/src/fossil-bootloader.ts`, `apps/standalone/src/generation-bootloader.ts` | Immutable fossil to absolute generation launcher handoff using Shell-owned Node. | Historical Closure store paths, Web/daemon layout, and fixed Electron process policy. |
| `shells/electron/src/standalone-handoff.ts` | Import-once and fail-closed handling of invalid or conflicting selected generations. | Electron window, deep-link and after-quit policy. |
| current Sidecar convergence `generation.ts` | Set observation, PID-start-time fencing, survivor/replacement verification. | Product resource membership in Sidecar. |
| current Sidecar convergence `lifecycle-lock.ts` | One physical guard primitive shared by start and stop paths. | Treating a Windows-only implementation as the complete cross-platform contract. |

The model intentionally does not modify `e2e`, `tools-*`, Web, daemon, or the
Electron Shell. Platform refinement tests belong to their eventual owning
adapter; Terminal keeps this proof fast and local.

The Shell updater accepts only `withRetiredStandalone(input, commit)`. A
result-returning retirement callback cannot establish the guard invariant and
is deliberately absent from the new Terminal runtime.
