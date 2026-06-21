# design.md — opt-in portable design system

Loaded by [`SKILL.md`](../SKILL.md) Step 6 ONLY when the user explicitly asks Hallmark to lock the current build's design system into a portable file. The default verb does NOT auto-emit `design.md`. The user iterates freely until they say the system is settled, then asks for it.

This file is **also** loaded by [`study.md`](study.md) when the user — after a successful `study` diagnosis — asks for the DNA to be emitted as a portable system. The format below is shared between the two paths; the only differences are spelled out in § Two emission paths (default vs study) and in [`study.md`](study.md) § Emitting a `design.md` from `study`.

## Triggers (phrase-only — no new verb)

Fire ONLY when the user says one of:

- *"lock the system"* / *"lock the design system"* / *"lock the DNA"* / *"lock this DNA"*
- *"give me a design.md"* / *"write a design.md"* / *"export this as a design.md"*
- *"extract this to a design system"* / *"extract the tokens"* / *"extract the DNA"*
- *"make this portable"* / *"make the DNA portable"*
- *"I want to use this in another project"*

For everything else — including the default build, the redesign verb on a single page, and free iteration on the same brief — skip. The single-page redesign and default verb stay token-portable via `tokens.css`; `design.md` is the explicit lock-in step.

## Two emission paths (default vs study)

The same `design.md` format is emitted from two different entry points. They differ in which signals seed the file and in how strict the refusal layer is.

| | **Default-verb path** (lock the system) | **Study-verb path** (lock the DNA) |
| --- | --- | --- |
| **Trigger context** | After at least one build the user has iterated on and is satisfied with | After a successful `study` diagnosis (image or URL) |
| **Source of tokens** | The build's in-memory token state | The studied DNA — exact from CSS in URL mode, estimated from bands in image mode |
| **Refusal layer** | None — the user owns the build they iterated on | Tighter — see [`study.md`](study.md) § Emission-refusal layer. URL mode requires attestation; third-party URLs are refused |
| **`## Provenance` block** | Omitted (the system is the user's own work) | Required — records source mode, URL or "image", date, attestation answer, confidence note |
| **`## Notes` block** | Optional — covers any decisions worth remembering | Required — carries the diagnosis's "anti-patterns to NOT carry over" list |

Both paths produce a `design.md` Hallmark can read on subsequent runs; the file format is uniform once written.

## Scope

- **Page-builds only.** Skip on component-scope — a single component is too small to be a system.
- **Multi-page redesign keeps existing behaviour.** `hallmark redesign --multi-page` produces the heavyweight `design.md` per [`verbs/redesign.md`](verbs/redesign.md) § Multi-page flow. That flow already implies a locked system, so the rule there is unchanged.
- **No-overwrite policy.** If `design.md` already exists at the project root, do NOT overwrite. Refresh its `## Exports` section instead and emit one line: *"design.md detected — refreshed Exports, system unchanged."*

## CTA — surface the offer in the Step 5 preview

After every default + redesign page-build, append one quiet line at the bottom of the preview block:

> *System portable? Say `lock the system` to extract this build's tokens + voice into a `design.md`.*

Skip the CTA when (a) the build is component-scope, or (b) `design.md` already exists in the project (system is already locked).

## Format (the tight version)

Write the file at the project root. Match the project's case convention (`design.md` or `DESIGN.md`). Target ~45 lines — enough to seed a real app, not so much that it becomes a wiki to maintain. The format:

````markdown
# Design — <Project name>

Locked design system. Future Hallmark runs read this file first; pages defer
to it. Amend intentionally — the file is the rule.

## System
- Genre · <editorial / modern-minimal / atmospheric / playful>
- Macrostructure · <name>
- Theme · <catalog: NAME · or · custom (vibe: "<4–8 words>")>
- Axes · <paper-band> / <display-style> / <accent-hue>

## Tokens (canonical · `tokens.css` is the source of truth)
```css
:root {
  --color-paper:      oklch(<L> <C> <H>);
  --color-paper-2:    oklch(<L> <C> <H>);
  --color-ink:        oklch(<L> <C> <H>);
  --color-ink-2:      oklch(<L> <C> <H>);
  --color-rule:       oklch(<L> <C> <H>);
  --color-accent:     oklch(<L> <C> <H>);
  --color-accent-ink: oklch(<L> <C> <H>);
  --color-focus:      oklch(<L> <C> <H>);

  --font-display: "<face>", ...;
  --font-body:    "<face>", ...;
  --font-mono:    "<face>", ...;

  /* 4-pt spacing scale, named: --space-3xs … --space-4xl. See tokens.css.   */
  /* Type scale, 1.25 (major-third) ratio: --text-xs … --text-display.       */

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 180ms;  --dur-base: 240ms;  --dur-slow: 320ms;

  --radius-card: <px>;  --radius-pill: <px>;  --radius-input: <px>;
}
```

## CTA voice
- Primary · <fill colour> · <radius> · <padding rhythm>
- Secondary · <outline / ghost> · <same radius>

## Motion stance
- <silent · 1–2 reveal primitives · motion-cut>
- Reduced-motion fallback · ≤150 ms opacity crossfade.

## Exports
`tokens.css` (in this project) is the source of truth. For Tailwind v4
`@theme`, DTCG `tokens.json`, or shadcn/ui CSS variables, ask *"extend
design.md with Tailwind exports"* (or the format you want) — Hallmark will
append them per [`export-formats.md`](export-formats.md).
````

State the picks aloud BEFORE writing the file. *"Genre: editorial. Macrostructure: Long Document. Theme: catalog Editorial. Locking this as the project's system."* Then write.

## After the file is written

Once `design.md` exists, [`SKILL.md`](../SKILL.md) Step 0's pre-flight scan detects it on every subsequent run. From that point on:

- All future Hallmark runs READ `design.md` first; subsequent picks (genre / theme / typography / motion / CTA voice) defer to it.
- The diversification rule INVERTS — pages must SHARE the system, not differ from each other.
- If a future page genuinely needs a different system, AMEND `design.md` with a `## Variants` section rather than overriding locally — the file evolves; per-page overrides do not.

## Why opt-in (not auto-emit)

Briefs iterate. The first build is rarely the settled design. Auto-emitting `design.md` on every default build would either churn the file across iterations or lock a weak system before the user has reviewed it. Opt-in mirrors how design teams actually work — formalise the system after the patterns hold, not on day one. The CTA in the preview block keeps the feature discoverable without forcing it.
