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

**Status.** The subsystem now lives at `packages/creative-memory-system/` as `@open-design/creative-memory-system`, following the workspace convention used by `@open-design/contracts`, `@open-design/platform`, etc.

**The question (resolved for now).** This placement was chosen during the TypeScript port. Earlier iterations placed the validated prototype at `<repo-root>/creative-memory-system/`, which conflicted with `packages/AGENTS.md` boundaries and the `pnpm guard` residual-JS check. Migration into the workspace was the right move; the question to revisit is whether the host that will primarily call it (likely `apps/daemon`) should re-export it through a thin wrapper or import directly.

**Where the assumption lives.** Directory layout, `packages/creative-memory-system/package.json`, `pnpm-workspace.yaml`.

**What to do.** No action; revisit only if a daemon-side wrapper proves useful.

---

## 9. CommonJS vs TypeScript

**Status (resolved).** The subsystem is now TypeScript / ESM under `packages/creative-memory-system/src/`, built via esbuild for runtime and `tsc --emitDeclarationOnly` for types. The previous `.js` CommonJS prototype has been removed; it lives in git history at the parent commit if the original baseline ever needs to be diffed.

**What was preserved.** All logic, all constants, all balancing semantics, all diagnostic events, and all 238 simulation-suite invariants. The Vitest port reproduces the same scenarios as the original `sims/*.js` runners.

**What changed.** Module exports use named ESM exports rather than `module.exports`. Storage-root resolution is now lazy (`getStorageRoot()`) so tests can override `MEMORY_STORAGE_ROOT` after the module has been imported. A small refactor inside `extractionAdapter.ts` collapses repeated per-handler boilerplate into a `dispatchSignals` helper without changing behavior.

**What to do.** No action.

---

## 10. Future ranking — leave alone

**Status.** Ranking is `signal_strength × polarity_multiplier`, descending. It is deterministic and easy to reason about.

**The question.** Should ranking ever incorporate recency, confidence, source diversity, or any signal beyond strength?

**Why it matters.** Each additional signal makes ranking less explicable. The current architectural risk is over-stabilization, not under-sophistication. Adding learned ranking would also violate the no-ML non-goal.

**Where the assumption lives.** `preferenceStore.js → retrieveForInjection`, the effective-priority scoring stage.

**What to do.** **Do not change this without an explicit architectural review.** This entry exists so that future contributors know the simplicity of ranking is deliberate.

---

## 11. Derivation lifecycle and raw-events contract

**Status.** The current engine is **write-time-derivation only**. `ingestSignal` mutates preference records directly (`signal_strength`, `confidence`, `polarity_status`, etc.) and there is no separate raw-events log that retrieval can re-derive from. The `refinement_log[]` field exists but is dormant; nothing reads it.

**Background.** This question was raised during PR #1746 review (issue #1637 thread). Two failure modes were identified:

1. **Attribution problem.** A unary accept/reject is one bit; it cannot tell the engine *what specifically* the user objected to. Without contrastive context, an extractor can attribute rejections to whatever it finds most salient in each candidate, not what the user actually disliked. Predicted compounding effect: after ~50 events, rejection memory hardens around extractor salience rather than user intent — phantom preferences that the engine treats as confident.
2. **Re-derivation impossible.** Because derived features are written directly into the store at ingestion time, an improvement to the extractor (or new contextual signals arriving later) cannot retroactively re-interpret older events. The audit trail is gone.

**The agreed forward-looking contract.** The integration-boundary discussion converged on the following shape:

- **Raw events are canonical.** Every interaction event (acceptance, rejection, edit, tag, pairwise comparison) is persisted as a raw record with enough context to re-derive features later. Raw events are append-only and never overwritten.
- **Derived features are a cache.** What is currently `Preference[]` becomes a cached interpretation of the raw event log. Derived features carry provenance (which raw events produced them, with what derivation version).
- **Pairwise > unary for attribution.** Where the host UX can support it, prefer pairwise comparison ("which of these two do you prefer, or neither") over unary accept/reject. The contrast isolates the dimension that actually differs. Unary signals stay weaker/provisional unless reinforced by explicit tags, edits, or contrastive evidence.
- **Cache invalidation contract.** Derived features must be re-derivable when the underlying raw events have shifted enough to warrant re-interpretation. The recommended trigger is *event-count primary + generous time fallback*:
  - `last_derived_event_seq` and `source_event_count` are stored on each derived feature.
  - Re-derivation fires when `event_count_delta >= N` (the primary trigger) OR `time_since_derivation > 30d` (slow-drift fallback so low-volume features cannot fossilize).
  - For MVP, re-derivation is **lazy on read** with a write-back cache. Background re-derivation is a follow-up once derivations grow heavy enough to dominate p99 latency.
  - Each derived record stores the **derivation version** it was produced by, so weighting changes are auditable.
- **Pairwise / unary weighting must be explicit.** A strong unary aggregate across 100 events should not be silently outweighed by 2 pairwise signals. The weighting policy lives in the derivation version and is visible in derived records, not buried in code.

**What this contract implies for the current engine.** It is a meaningful restructuring, not a small tweak:

- A new raw-events store (probably `raw_events.json` per user, append-only).
- A derivation layer that produces today's `Preference[]` shape from raw events.
- A pairwise event type, plumbed from the host UX through the adapter.
- Cache-staleness fields (`last_derived_event_seq`, `source_event_count`, `derivation_version`) on derived records.
- Re-derivation paths (lazy on read for MVP, with the background-worker upgrade path documented).

**Why it matters.** The current write-time-derivation shape is correct under the assumption that the extractor's per-event interpretation is right. Once that assumption is questioned (which Ilya0527's argument does effectively), the contract shifts: raw events become the source of truth and derived features become disposable / re-computable. The package's external API can stay almost identical — `retrieveForInjection`, `buildPromptBlock`, the diagnostic events — but the internal model under it changes substantially.

**Where the assumption lives.** Everywhere ingestion mutates preference records directly: `preferenceStore.ts → ingestSignal`, `preferenceStore.ts → applyReversal`, `preferenceStore.ts → runDecay`. The `refinement_log[]` field is the closest thing to a raw-events log today, but it is dormant and shaped for diff persistence rather than general event storage.

**What to do.** **Do not refactor the engine in this PR.** This contract is a forward-looking agreement that should drive the next iteration (or the team's internal OpenHuman work, depending on how the foundation-vs-reference call lands). For now:

- Treat the current engine as a write-time-derivation prototype that satisfies the *behavioral* contract (signal in, prompt block out, diagnostics observable) but not the *structural* contract above.
- Preserve the `refinement_log[]` field and its append-only semantics — it is the natural seed for the future raw-events log.
- When the next iteration begins (whether on this branch or as a separate piece of work), this section is the agreed shape to build toward.

**Discussion thread.** The contract above is a synthesis of the conversation between @Ilya0527 and @lefarcen on issue #1637, surfaced here per @lefarcen's request that it move from loose issue discussion into PR #1746's open-questions doc.

### Refinement: content-addressed derivations

@Ilya0527 followed up on the cache-invalidation contract above with a stronger framing: rather than treating derived features as durable rows with explicit staleness bookkeeping, treat them as **content-addressed views** over the raw event log.

The cache key for a derived feature becomes a hash of `(raw_event_set, derivation_fn_version)`. When either side changes — new raw events arrive, the derivation function changes, the version tag bumps — the key itself changes, and the old derived value is unreachable. Re-derivation happens on demand against whatever set of raw events the new key resolves over.

This replaces the explicit invalidation rules in the contract above (event-count + time fallback, `last_derived_event_seq`, `source_event_count`, manual re-derivation triggers) with a single property: **a derived feature can never be stale, because if it were stale its key would have changed and the lookup would miss.**

Implications worth noting:

- **Storage shape.** Derived features become a content-addressed cache, not a mutable per-record table. Lookup is by hash; eviction is by capacity, not by age.
- **No staleness bookkeeping.** `last_derived_event_seq` and `source_event_count` go away. The hash subsumes both — if the event set is unchanged, the hash is unchanged, the cached value is still valid.
- **Version-tagged derivations stay.** They are now part of the cache key rather than a separate metadata field, but they still serve the audit-trail role (a feature derived under v1 has a different key than one derived under v2 over the same events).
- **Cost trade.** Lookups become O(1) hash probes, but every distinct event-set requires its own derivation pass. The original event-count threshold acted as a coarse batching mechanism; with content-addressing you either re-derive on every new event or batch by hashing over an event-set window (e.g. "events older than the last N seconds, sealed off") — both are valid strategies, just different than the threshold-based approach above.

This refinement is consistent with the original contract's spirit — raw events canonical, derived features cacheable, derivation auditable — but it makes the cache invariant **declarative rather than procedural**. Tracked here as a refinement to evaluate during the next-iteration design rather than something to retrofit into the current write-time-derivation engine.

**Source.** PR #1746 issue thread, follow-on by @Ilya0527 to the original Section 11 contract; carried into this doc per @lefarcen's request that it stay part of the integration-boundary discussion.

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
