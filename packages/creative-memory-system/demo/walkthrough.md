# End-to-end engine walkthrough

A scripted demo of every layer the package exposes — signal ingestion, the confidence ladder, reversal lifecycle (with shadow records), decay and archive, the eleven-stage retrieval pipeline with diagnostics, prompt-block rendering, and the project-override scenario.

This is the **engine layer** of the Creative Memory System. The package has no UI surface of its own (a documented non-goal); user-facing controls (inspect / edit / disable / reset) live in the host application and depend on integration decisions tracked in [`docs/open-questions.md`](../docs/open-questions.md).

## How to run it yourself

From the repo root:

```bash
pnpm --filter @open-design/creative-memory-system demo
```

The output below is a transcript of running `demo/walkthrough.ts`. The script writes to an isolated scratch directory under `demo/.demo-storage/` and removes it on exit, so it never touches real user data.

---

## Step 1 — Fresh user state

A new user has nothing in memory. `retrieveForInjection` returns empty arrays, and the prompt block is an empty string (nothing gets injected).

```
State:
  (no preferences)

Retrieval result:
  positives (0):
  negatives (0):
  projectOverrides (0):
  diagnostics (0):

Generated prompt block (concatenated into the next generation):
  (empty — nothing injectable)
```

**Why this matters.** The engine never produces "surprise context" for users it has nothing on. Until at least one preference crosses the injection threshold AND reaches medium confidence, the prompt builder emits nothing.

---

## Step 2 — Positive signal arrives

User taps an inline tag "Save this direction" on a generated layout.

```
State:
  [positive] layout_density/airy_spacing  strength=0.15 conf=low status=stable

Retrieval result:
  positives (0):
  negatives (0):
  projectOverrides (0):
  diagnostics (0):
```

**Why this matters.** `explicit_tag` is the strongest signal weight (0.30). One signal contributes `weight / NORMALIZER` = 0.15 to the running strength. The preference is recorded but **not yet injectable** — the gate requires `strength >= 0.40` AND confidence in `{medium, high}`. One click is never enough.

---

## Step 3 — The confidence ladder

Three more matching signals arrive over the next sessions.

```
State:
  [positive] layout_density/airy_spacing  strength=0.60 conf=medium status=stable

Retrieval result:
  positives (1):
    layout_density/airy_spacing (medium, strength=0.60)
  negatives (0):
  projectOverrides (0):
  diagnostics (0):

Generated prompt block (concatenated into the next generation):
  | [MEMORY CONTEXT]
  | Prefer (medium):  airy_spacing
```

**Why this matters.** After four `explicit_tag` signals (4 × 0.15 = 0.60), the preference has crossed the threshold and reached medium confidence. Now it appears in retrieval and the prompt block contains a real `[MEMORY CONTEXT]` directive that will steer the next generation toward airy spacing.

---

## Step 4 — Negative preference (rejection memory)

User gives `thumbs_down` on a different pattern (`neon_palette`), then four follow-up `explicit_tag` negatives reinforce the avoidance.

```
State:
  [negative] color/neon_palette  strength=0.65 conf=medium status=stable
  [positive] layout_density/airy_spacing  strength=0.60 conf=medium status=stable

Retrieval result:
  positives (1):
    layout_density/airy_spacing (medium, strength=0.60)
  negatives (1):
    color/neon_palette (medium, strength=0.65)
  projectOverrides (0):
  diagnostics (0):

Generated prompt block (concatenated into the next generation):
  | [MEMORY CONTEXT]
  | Prefer (medium):  airy_spacing
  | Avoid (medium):   neon_palette
```

**Why this matters.** Negative preferences are first-class. The prompt block now tells the next generation BOTH what to lean toward and what to avoid. At equal strength, negatives rank ahead of positives because of `NEGATIVE_PRIORITY_MULTIPLIER` (1.2) — the cost of generating something the user explicitly disliked is higher than the cost of failing to surface a mild preference.

---

## Step 5 — Reversal lifecycle

The user changes their mind about `airy_spacing` and starts tagging it negatively. Four contradictory signals arrive.

```
State after reversal triggers:
  [negative] color/neon_palette                strength=0.65 conf=medium status=stable
  [negative] layout_density/airy_spacing       strength=0.15 conf=low status=stable shadow_of=pref_xxx
  [positive] layout_density/airy_spacing       strength=0.00 conf=low status=under_review

Retrieval result:
  positives (0):
  negatives (1):
    color/neon_palette (medium, strength=0.65)
  projectOverrides (0):
  diagnostics (0):
```

**Why this matters.** This is the most subtle behavior in the engine. Naive last-write-wins or instant-flip strategies produce flicker on every disagreement. The reversal ladder is graduated:

| Reversal signals | Effect |
|---|---|
| 1 | **Noise guard** — no change. One off-day click is tolerated. |
| 2 | Strength × 0.80, status remains `stable`. |
| 3 | Strength × 0.60, confidence drops one rung. |
| 4+ | Status flips to `under_review`. A **shadow record** of opposite polarity is created. |

The shadow tracks the new opposing signals. Until it reaches medium confidence, neither the original (`under_review`) nor the shadow (`low confidence`) are injected — the prompt simply omits the contested pattern entirely. This decouples *"this preference is contested"* from *"this is the new preference"*.

---

## Step 6 — Shadow promotion

Five more reinforcing signals on the new direction.

```
State after shadow promotion:
  [negative] layout_density/airy_spacing  strength=0.90 conf=high   status=stable
  [negative] color/neon_palette           strength=0.65 conf=medium status=stable
  [positive] layout_density/airy_spacing  strength=0.00 conf=low    status=archived

Retrieval result:
  positives (0):
  negatives (2):
    layout_density/airy_spacing (high, strength=0.90)
    color/neon_palette (medium, strength=0.65)
  projectOverrides (0):
  diagnostics (0):
```

**Why this matters.** The shadow has reached high confidence, promoted (cleared `shadow_of`), and the original positive is archived. The user's taste has genuinely shifted — and the engine recognized it without flickering once during the transition. The graduated ladder absorbed the noise; the shadow preserved the path forward.

---

## Step 7 — Decay and archive

Profile is reset for clarity. A preference is built up, then time advances.

```
State before decay:
  [positive] style/stale_pattern  strength=0.60 conf=medium status=stable

Backdating decay_at by 91 days to simulate inactivity...
runDecay() returned: { decayed: 1, archived: 0 }

State after decay pass:
  [positive] style/stale_pattern  strength=0.42 conf=low status=stable

Backdating last_seen by 181 days to trigger archive...
runDecay() returned: { decayed: 0, archived: 1 }

State after archive pass:
  [positive] style/stale_pattern  strength=0.42 conf=medium status=archived
```

**Why this matters.** Two distinct lifecycle phases:

- **Decay** (`daysSinceDecay >= 0`, fixed every 90-day cycle): strength × 0.70, confidence drops a rung. The preference is still alive but waning.
- **Archive** (`daysSinceLastSeen >= ARCHIVE_DAYS`): the record becomes terminal. Excluded from retrieval forever — unless a new same-polarity signal reactivates it (which is supported; see open-questions for the design rationale).

Critically, archive is measured from `last_seen`, not `decay_at`. A routine decay pass resets `decay_at` forward, but the archive deadline stays anchored to the user's actual last interaction.

---

## Step 8 — Realistic profile, full retrieval pipeline

Build a profile that exercises balancing: 8 positives across 4 categories, 3 negatives, 11 records total.

```
Profile size: 11 preferences

Retrieval result:
  positives (7):
    layout/airy_spacing      (medium, strength=0.60)
    layout/wide_grid         (medium, strength=0.60)
    layout/single_column     (medium, strength=0.60)
    typography/serif_headlines (medium, strength=0.60)
    typography/monospace_code  (medium, strength=0.60)
    color/earth_palette      (medium, strength=0.60)
    motion/subtle_motion     (medium, strength=0.60)
  negatives (3):
    color/neon_palette       (medium, strength=0.60)
    motion/heavy_animation   (medium, strength=0.60)
    typography/comic_sans    (medium, strength=0.60)
  projectOverrides (0):
  diagnostics (1):
    [category_ceiling_applied] Category ceiling: 1 pattern(s) trimmed from layout (max 3/type)

Generated prompt block (concatenated into the next generation):
  | [MEMORY CONTEXT]
  | Prefer (medium):  airy_spacing · wide_grid · single_column · serif_headlines · monospace_code · earth_palette · subtle_motion
  | Avoid (medium):   neon_palette · heavy_animation · comic_sans
```

**Why this matters.** Notice the diagnostic: `category_ceiling_applied`. The user had 4 layout patterns above threshold, but the engine trimmed to 3 (`MAX_PER_CATEGORY`) so layout couldn't dominate the prompt at the expense of typography, color, and motion. The diagnostic is structured (not just a log line), so a host can surface "the engine balanced your prompt" affordances if it wants.

The full eleven-stage retrieval pipeline is documented in [`docs/retrieval-pipeline.md`](../docs/retrieval-pipeline.md). Stages that fired in this run: `lifecycle filter`, `effective-priority scoring`, `ranking`, and `category ceiling`. Other stages (hard cap, polarity ceiling, polarity backfill, category backfill, token budget) are dormant on this profile because their conditions weren't met.

---

## Step 9 — Project override

User has a global preference for `airy_spacing`, but for THIS project (`proj_fintech`) they prefer `dense_grid`.

```
Global-only retrieval (no project_id):

Retrieval result:
  positives (7):
    layout/airy_spacing      (medium, strength=0.60)
    [...]
  diagnostics (1):
    [category_ceiling_applied] Category ceiling: 1 pattern(s) trimmed from layout (max 3/type)

Generated prompt block:
  | [MEMORY CONTEXT]
  | Prefer (medium):  airy_spacing · wide_grid · single_column · serif_headlines · monospace_code · earth_palette · subtle_motion
  | Avoid (medium):   neon_palette · heavy_animation · comic_sans


Project-scoped retrieval (project_id=proj_fintech):

Retrieval result:
  positives (7):
    layout/wide_grid         (medium, strength=0.60)
    layout/single_column     (medium, strength=0.60)
    layout/split_panel       (medium, strength=0.60)
    typography/serif_headlines (medium, strength=0.60)
    typography/monospace_code  (medium, strength=0.60)
    color/earth_palette      (medium, strength=0.60)
    motion/subtle_motion     (medium, strength=0.60)
  negatives (3):
    color/neon_palette       (medium, strength=0.60)
    motion/heavy_animation   (medium, strength=0.60)
    typography/comic_sans    (medium, strength=0.60)
  diagnostics (1):
    [project_override_suppression] proj_fintech override layout/airy_spacing active — global layout/airy_spacing (positive, 0.60) suppressed for this generation

Generated prompt block:
  | [MEMORY CONTEXT]
  | Prefer (medium):  wide_grid · single_column · split_panel · serif_headlines · monospace_code · earth_palette · subtle_motion
  | Avoid (medium):   neon_palette · heavy_animation · comic_sans
```

**Why this matters.** When the user is working in a specific project context, project-scoped preferences shadow global ones with the same `(preference_type, pattern)` identity. The diagnostic `project_override_suppression` records exactly which global was hidden, by which override, with what polarity and strength — so the host can surface "your project preferences differ from your usual taste here" affordances if desired.

Note that `airy_spacing` is missing from the project-scoped prompt entirely (the project preference says to avoid it; that record is shown in the negatives section in the actual demo output).

---

## What this demonstrates end-to-end at the engine layer

1. **Fresh users start with empty injection sets** — no surprise context.
2. **Signals build preferences gradually** — one click is never enough; the confidence ladder respects user intent.
3. **Negative preferences are first-class** — and weight ahead of positives at equal strength.
4. **Reversals respect a noise guard** before flipping; shadows preserve the path forward if the user changes their mind again.
5. **Stale preferences fade** and archive on a fixed schedule based on `last_seen`.
6. **Retrieval is bounded** on count, polarity ratio, category share, and prompt token budget — every non-trivial decision is observable through structured diagnostic events.
7. **Project context overrides global context** with a clear suppression trace so hosts can surface project-vs-global affordances.

## What is intentionally NOT shown here

- **User-facing UI for inspect / edit / disable / reset.** That surface lives in the host application (`apps/daemon`, `apps/web`) and depends on integration decisions tracked in [`docs/open-questions.md`](../docs/open-questions.md). The package exposes everything a host needs to build that UI (`listPreferences`, `updatePreference`, `deletePreference`, `resetMemory`, the `memory_enabled` flag), but does not impose a UI shape.
- **Wired pipeline integration.** The adapter handlers in [`src/extractionAdapter.ts`](../src/extractionAdapter.ts) are stubs awaiting pipeline-team confirmation on event timing and attachment points (open questions #1–#4).

This demo is the level the package operates at, and the level a product call on the engine shape can be made on. Wiring it into a real generation flow with user-visible affordances is a follow-up integration once the open boundary questions are resolved.
