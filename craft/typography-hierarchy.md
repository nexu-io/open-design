# Typography hierarchy craft rules

Shared hierarchy contracts that layer on top of `typography.md`. This file does
not repeat scale ranges or tracking values — those live in `typography.md`.
This file defines how hierarchy *behaves*: entry points, rhythm, tension, and
the conditions under which controlled violations are allowed. This contract
applies per-surface (a page with multiple pacing resets may establish new
primaries at intentional intervals), not globally.

> Opt in via `od.craft.requires: [typography, typography-hierarchy]`.
> Aesthetic-specific variants (e.g. `typography-hierarchy-editorial`) extend this.

---

## The core contract

Every typographic surface must satisfy all three:

1. **One dominant entry point.** The eye needs a place to start. One element
   wins the hierarchy — not two, not three. If everything competes, nothing leads.
2. **Intentional rhythm between levels.** Hierarchy is not a list of sizes.
   It is the *contrast* between them. Adjacent levels that are too close
   in scale, weight, or spacing produce a flat, undifferentiated surface.
3. **Recoverable information flow.** Hierarchy may be inverted, collapsed,
   or disrupted — but a reader must still be able to reconstruct the content
   structure without re-reading. If they can't, it's chaos, not tension.

---

## Hierarchy vectors

Scale is one lever. Use all five.

| Vector | What it controls | Hierarchy direction |
|---|---|---|
| Scale | Size contrast between levels | Large → small reads as primary → secondary |
| Weight | Mass contrast between levels | Heavier reads as primary (see Controlled violations for weight inversion) |
| Spacing | Breathing room around an element | More space = more visual importance |
| Tracking | Tension and velocity | Tighter = faster; wider = ceremonial, slower |
| Alignment | Relationship to the grid/edge | Breaking alignment signals importance |

No single vector is required. A heading may lead through spacing alone if
scale is deliberately suppressed. A pull quote may lead through alignment
break. Identify which vectors are active and make sure at least two are
working in the same direction for the dominant element.

---

## Semantic role ≠ visual role

Allowed. Not an error. Not a lint violation.

An `<h1>` may render visually quieter than a nearby `<p>` if the
composition requires it. Body copy may behave like display typography.
A label may visually outrank a heading.

**The condition:** information flow must remain intact. A user who reads
linearly must still understand what is important, what supports it, and
what is incidental — regardless of which element "wins" visually.

---

## Hierarchy rhythm — the two failure modes

### Flat hierarchy

Everything lands at roughly the same visual weight. The surface reads as
a wall. Usually caused by:
- Scale steps that are too close (e.g. 18 / 20 / 22 px for three levels)
- Weight used only once (everything is regular, or everything is medium)
- Uniform spacing between all elements

Fix: increase contrast between levels. Use at least two vectors simultaneously.

### Noise hierarchy

Too many elements fighting for dominance. Everything is bold, large, or
accented. The eye has no resting point and no path.

Fix: promote one element deliberately. Demote everything else — including
things that feel important. Hierarchy is relative, not absolute.

---

## Controlled violations

The following are explicitly allowed when the three core contracts are met:

| Violation | Allowed when |
|---|---|
| Body copy at display scale | It is the intended entry point and nothing else competes |
| Heading rendered lighter than body | Intentional visual inversion with intact information flow |
| Zero scale contrast between levels | Hierarchy is carried entirely by spacing or tracking |
| No heading-level element visible | Hierarchy is emergent from layout/spacing alone |
| Primary-level spacing applied to secondary element | Creates deliberate tension while maintaining information flow |

**"Information flow remains intact" safeguards:**
- DOM/reading order still matches content meaning (no layout inversion breaks narrative)
- Proximity groups the inverted element with its parent/context
- Only one primary exists in the visual region (no competing co-primaries)
- A quick scan can identify entry point / support / incidental roles without rereading

---

## Spacing as hierarchy

Spacing is a full hierarchy vector. A typographic level can be elevated
entirely through surrounding whitespace without changing its size or weight.

Rules:
- Space above an element signals its relationship to what came before.
- Space below an element signals its relationship to what follows.
- An isolated element with large surrounding space reads as display-level
  regardless of its font size.
- Uniform spacing between all elements destroys spatial hierarchy.

---

## Three-level working model

Most surfaces can be mapped to three functional levels:

| Level | Role | Typical vectors |
|---|---|---|
| **Primary** | Entry point. One at a time per visual region; long-form surfaces may re-establish at intentional pacing resets. | Scale, spacing, or alignment break |
| **Secondary** | Structure. Subdivides or supports primary. | Weight, scale step, or tracking shift |
| **Tertiary** | Incidental. Labels, captions, metadata. | Scale reduction, weight reduction, or positive tracking |

More than three visible levels above the fold is usually a composition problem,
not a hierarchy opportunity. Collapse or demote before adding a fourth level.

**Long-form surfaces:** May re-establish a primary at intentional pacing resets
(e.g. a new section with its own headline and breathing room). Never maintain
two simultaneous primaries within the same visual region.

---

## Anti-patterns

- **Graduated weight ladder** — regular → medium → semibold → bold → extrabold,
  each level one step heavier. Reads as a default scale, not authored hierarchy.
  Weight should jump, not step.
- **Uniform section spacing** — every section gap is the same value. No
  hierarchy information is carried by spacing. Vary it deliberately.
- **Heading as the only hierarchy vector** — the heading is large and bold;
  everything else is flat. The heading does all the work. This is a sign
  that spacing and tracking are not being used as vectors.
- **Symmetrical emphasis** — two elements receive equal visual weight as
  co-primaries. Pick one. The other becomes secondary.
- **Size-only hierarchy** — all contrast is in font size alone. Weight,
  spacing, tracking, and alignment are uniform across levels. Fragile —
  any layout constraint that collapses the size contrast destroys the hierarchy.

---

## Lint

- [ ] One element is unambiguously dominant above the fold.
- [ ] At least two hierarchy vectors are active on the dominant element.
- [ ] No two adjacent levels share the same scale, weight, AND spacing.
- [ ] Spacing between levels varies — at least one gap is ≥1.5× the others or
      represents one typographic scale step (e.g. one token unit like `gap-md` vs `gap-sm`). (guidance)
- [ ] Semantic/visual role inversions remain structurally readable.
- [ ] Flat hierarchy: scale steps between levels are ≥1.25× apart OR compensated by a weight or spacing jump. (guidance)
- [ ] Noise hierarchy: no more than one element reads as primary above the fold.
