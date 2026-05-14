# Open questions

These are deliberately unresolved at this stage of integration. Hardcoding answers before the pipeline contract is confirmed would create assumptions that are expensive to reverse later. Each question has a current working assumption, the consequence of getting it wrong, and the place in the code where the assumption lives.

The subsystem is engineered to *tolerate* not knowing the answers. None of the questions below blocks integration; they are tuning and contract questions that will become tractable once the host pipeline starts emitting real events.

---

## 1. Pipeline event shapes — when does each handler fire?

**Status.** Working assumptions documented in `extractionAdapter.js` handler comments. Pipeline team confirmation pending.

**The questions.**

- `onGenerationAccepted` — fires on what exact user action? "Use this", "Keep", panel close without discard? Does hovering count? What about keyboard shortcuts that auto-accept?
- `onArtifactEditedAndSaved` — what is "saved"? Auto-save on blur, explicit save action, or both? Multiple edits within the same session — one signal each, or one signal at session end?
- `onGenerationAbandoned` — is there an explicit "discard" action, or is this inferred from inactivity timeout / new generation start? At what timeout?
- `onRevertAfterEdit` — is there an explicit revert affordance, or is this a diff comparison that the host computes?

**Why it matters.** Signal frequency is wired into the confidence ladder. If `onGenerationAccepted` fires on hover, every record will reach high confidence in one session and the threshold gate becomes meaningless. If it fires only on explicit "Use this" clicks, the engine may never see enough signals to populate the prompt at all.

**Where the assumption lives.** `extractionAdapter.js`, in the per-handler comment block above each function.

**What to do.** Wait for pipeline team confirmation. Do not hardcode debounce, timeout, or accumulation logic in the adapter.

---

## 2. Refinement diff structure

**Status.** Provisional shape `{ from: { key: val }, to: { key: val } }` is accepted by `onArtifactEditedAndSaved` and forwarded to `logRefinement`. The store does not consume the diff for retrieval — it just persists it.

**The question.** Should the diff be a flat key-value comparison, a list of structured field changes, or a free-form change description? The current shape is the simplest thing that round-trips through JSON.

**Why it matters.** The refinement log is currently dormant — nothing reads it during retrieval. If the future plan is "use refinement history to detect repeated edit patterns", the diff shape needs to support pattern extraction. If the plan is just audit trail, the current shape is sufficient.

**Where the assumption lives.** `preferenceStore.js → logRefinement`, `extractionAdapter.js → onArtifactEditedAndSaved`.

**What to do.** Hold the current shape until a consumer of the refinement log is specified. Do not premature-optimize for an unknown reader.

---

## 3. Edit / save lifecycle timing

**Status.** Each event handler ingests one signal per `(preference_type, pattern)` pair on each call. There is no debouncing or coalescing.

**The question.** If a user edits an artifact five times in two minutes and saves at the end, should that be five `manual_refinement` signals or one? Same for thumbs ratings — does double-clicking thumbs-up emit two signals?

**Why it matters.** The confidence ladder assumes ~5–10 signals to reach `high`. Aggressive event firing (one per keystroke save) collapses the ladder; conservative firing (one per session) prevents accumulation.

**Where the assumption lives.** Implicit in `extractionAdapter.js` — every event call produces one ingestion. Debouncing must be done by the host.

**What to do.** Document the assumption in the integration contract. When the pipeline team wires up real events, decide whether the host or the adapter does the debouncing. The adapter is simpler if the host coalesces; the engine is simpler if the adapter does it.

---

## 4. Adapter attachment point

**Status.** The adapter assumes the host already has classified `artifact_meta.signals[]` available. It does not extract `(preference_type, pattern)` from raw artifacts.

**The question.** Where in the generation pipeline does classification happen? Is `artifact_meta` populated by the model output, by a post-generation classifier, or by metadata the user enters?

**Why it matters.** The current `classifyArtifact` is a pass-through. If the pipeline team expects the adapter to do the extraction, the adapter needs a real classifier. If extraction happens upstream, the current stub is fine.

**Where the assumption lives.** `extractionAdapter.js → classifyArtifact`. The function comment explicitly calls this out as a stub.

**What to do.** Confirm with pipeline team. Resist the pull to add embedding-based classification here — that would violate the local-first / no-ML constraint. If extraction needs to be ML-driven, it belongs in the host, not in the memory subsystem.

---

## 5. Normalizer tuning

**Status.** `NORMALIZER = 2.0`. Each signal contributes `weight / NORMALIZER` to the strength. With current weights, this gives roughly 2 explicit tags or 4 manual refinements to cross the 0.40 injection threshold, and roughly 4 explicit tags to reach the 0.65 medium-confidence cap.

**The question.** Is this the right ladder for real users? Too steep and users see prompts populated after one feedback action; too shallow and the engine never injects.

**Why it matters.** The entire confidence ladder is a single division. Every assertion in `testHarness.js` sections 3–7 calibrates against `NORMALIZER = 2.0`.

**Where the assumption lives.** `preferenceStore.js → NORMALIZER`, top of file.

**What to do.** Hold the value until real-user data is available. If tuning is needed post-launch, the simulation suites will tell you whether the new value preserves all 238 invariants.

---

## 6. Reversal multiplier validation

**Status.** Reversal multipliers (1.0× at signal 1 — noise guard, 1.5× at signal 2, 2.0× at signal 3+) and reduction factors (× 0.80 at signal 2, × 0.60 at signal 3) are heuristic.

**The question.** Are these the right values? The current ladder produces:

- 1 contradictory signal: no change (noise tolerance).
- 2 signals: ~20% strength reduction, status stable.
- 3 signals: ~40% reduction, confidence drops a rung.
- 4+ signals: status flips to `under_review`, shadow record created.

This was tuned to feel reasonable in simulation but has not been calibrated against real reversal behavior.

**Why it matters.** Too aggressive and a single bad day's clicks flip stable preferences. Too conservative and the engine never recognizes a genuine shift in taste.

**Where the assumption lives.** `preferenceStore.js → _applyReversal`.

**What to do.** Hold and observe. Once integrated, log reversal events and see whether the ladder matches actual user behavior.

---

## 7. Injection formatting expectations

**Status.** `buildPromptBlock` produces a fixed format with `Prefer (high) / Prefer (medium) / Avoid (high) / Avoid (medium)` sections separated by ` · `, plus a `Project override:` line when applicable.

**The question.** Is this format optimal for the generation model? A different model or a different prompt structure might prefer:

- bulleted lists instead of `·` separators;
- inline weight annotations (`pattern_x [strong prefer]`);
- a structured JSON block;
- natural-language paraphrases ("you tend to prefer airy spacing").

**Why it matters.** The format is a contract between the memory subsystem and whatever assembles the final prompt. Changing it is a breaking change for the consumer.

**Where the assumption lives.** `preferenceStore.js → buildPromptBlock`.

**What to do.** Surface the current format to the pipeline team. If they want a different shape, replace `buildPromptBlock` — leave `retrieveForInjection` untouched. The structured retrieval result is sufficient for any format.

---

## 8. Memory subsystem placement in the repo

**Status.** Currently at `<repo-root>/creative-memory-system/`. The repo's top-level convention is `apps/`, `packages/`, `tools/`, `e2e/`, plus content directories (`skills/`, `design-templates/`, `design-systems/`, `craft/`).

**The question.** Where does memory belong long-term?

- **`<repo-root>/creative-memory-system/`** (current) — visible, but unusual for a top-level directory in this repo.
- **`packages/creative-memory-system`** — fits the workspace convention, would need TypeScript port and a `package.json` integrated with `pnpm-workspace.yaml`.
- **`apps/daemon/src/creative-memory-system/`** — co-located with the host that will likely call it; would lose the simulation-suite testability boundary.

**Why it matters.** The repo's `AGENTS.md` says new project-owned modules default to TypeScript and that `packages/contracts` is the place for shared TypeScript app contracts. A future-proofed location would also be a TypeScript port.

**Where the assumption lives.** Directory layout, `creative-memory-system/package.json`.

**What to do.** Decide before merge. The current `creative-memory-system/` location is fine for review and validation; production placement can be a follow-up PR that ports to TypeScript and migrates into `packages/`.

---

## 9. CommonJS vs TypeScript

**Status.** `creative-memory-system/package.json` declares `"type": "commonjs"` to override the repo root's `"type": "module"`. The validated code is `require()`-style CommonJS.

**The question.** Should the subsystem be ported to TypeScript / ESM as part of integration?

**Why it matters.** The repo is TypeScript-first. Long-term, the memory subsystem should match. A port now risks introducing bugs that the simulations would not catch (e.g., async/await semantics, named exports vs default).

**Where the assumption lives.** `creative-memory-system/package.json`, all `.js` files in the subsystem.

**What to do.** Hold the CommonJS shape for the integration milestone. After the pipeline contracts are confirmed and the adapter handlers are wired up, do a TypeScript port as a focused PR with the simulations preserved. The `pnpm guard` allowlist may need to be updated; check before merge.

---

## 10. Future ranking — leave alone

**Status.** Ranking is `signal_strength × polarity_multiplier`, descending. It is deterministic and easy to reason about.

**The question.** Should ranking ever incorporate recency, confidence, source diversity, or any signal beyond strength?

**Why it matters.** Each additional signal makes ranking less explicable. The current architectural risk is over-stabilization, not under-sophistication. Adding learned ranking would also violate the no-ML non-goal.

**Where the assumption lives.** `preferenceStore.js → retrieveForInjection`, the effective-priority scoring stage.

**What to do.** **Do not change this without an explicit architectural review.** This entry exists so that future contributors know the simplicity of ranking is deliberate.

---

## What is *not* an open question

The following are settled, even though they may seem like tuning knobs:

- **No embeddings.** Non-goal, not an open question.
- **No vector DB.** Non-goal, not an open question.
- **No ML ranker.** Non-goal, not an open question.
- **No autonomous agent.** Non-goal, not an open question.
- **No cloud sync.** Non-goal, not an open question.
- **No screenshot analysis.** Non-goal, not an open question.

If a question reduces to "should we add one of the above?", the answer is no — that is the architecture.
