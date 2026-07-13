# Laws of UX craft rules

Universal cognitive, perceptual, and behavioral heuristics that decide
what a UI composes — how many pricing tiers fit on a screen, where a
primary action anchors in scanning order, when a progress indicator
earns its place, why a settings list needs grouping. The active
`DESIGN.md` decides brand visual language; the existing craft files
decide rendering rules (color, typography, motion, states, ARIA, RTL,
forms); this file decides composition rules grounded in named research.

> Distilled from primary sources: Hick (1952) + Hyman (1953), Miller
> (1956) for chunking / `7±2` channel capacity, Cowan (2001) for the
> modern ~4 working-memory bound, Fitts (1954), Wertheimer (1923) for
> proximity / similarity / Prägnanz, Palmer (1992) for Common Region,
> Palmer & Rock (1994) for Uniform Connectedness, Kahneman /
> Fredrickson / Schreiber / Redelmeier (1993) for Peak-End, Zeigarnik
> (1927), Csíkszentmihályi (1975), Hull (1932), von Restorff (1933),
> Broadbent (1958), Sweller (1988), Postel (RFC 760, 1980), Carroll &
> Rosson (1987), Tversky & Kahneman (1974) for Anchoring, Kurosu &
> Kashimura (1995), Iyengar & Lepper (2000), Toffler (1970), Pareto
> (c.1906) / Juran (*Quality Control Handbook*, 1951), Ebbinghaus
> (1885), Ockham (14th c.), Tesler at Apple (1980s), Nielsen (2000),
> Norman *POET* (1988), Parkinson (1955).

## Prior art and scope

Existing public catalogs of UX heuristics (Yablonski's lawsofux.com,
NN/g's 10 usability heuristics, Material 3 motion + interaction
guidance, Apple HIG, Baymard Institute checkout research) inventory the
laws but rarely tie each one to a concrete code-gen directive. This
file does the translation: every entry ends with one actionable move
for an HTML / Tailwind / React-emitting agent. Sibling craft files
(`accessibility-baseline.md`, `state-coverage.md`, `typography.md`,
`anti-ai-slop.md`, `color.md`, `animation-discipline.md`,
`form-validation.md`) own the auto-checked rules; this file names the
underlying law and surfaces the folklore. Out of scope: Weber-Fechner
psychophysics and Signal Detection Theory — both apply to UI but the
prompt-emission directives are too narrow to earn a slot here. Add
later if a skill needs them.

The rules below are guidance, not auto-checked. Reviewers and the agent
apply them; the linter does not. Where a law has a sibling rule already
auto-checked elsewhere — touch-target floor in
`accessibility-baseline.md`, the 300 ms / 2 s / 10 s / 30 s / 60 s
loading thresholds in `state-coverage.md`, ALL CAPS letter-spacing in
`typography.md`, the indigo / gradient / emoji-icon list in
`anti-ai-slop.md` — the entry below cross-references rather than
duplicates.

## Perception and visual grouping

Five Gestalt laws plus three attention-and-recognition laws govern how
the eye groups elements before the brain reads them.

- **Law of Proximity** (Wertheimer, 1923). Objects near each other read
  as a group. Cheapest grouping signal — cheaper than borders or shared
  color. Apply variable vertical rhythm: 8–12 px within a group,
  32–48 px between groups. Uniform spacing reads as nothing being
  grouped.
- **Law of Similarity** (Wertheimer, 1923). Visually similar elements
  read as a group. Equivalent affordances must share treatment — every
  list row identical class set, every secondary button identical, every
  destructive action identical. Visible deviation is reserved for the
  one item meant to draw attention (the recommended pricing tier, the
  selected nav item).
- **Law of Common Region** (Palmer, 1992). A shared bounded area binds
  enclosed elements. Use enclosure when proximity is not enough — and
  reserve it. Concrete numbers: padding ≥16 px inside the region,
  distinct surface (border + tinted background, or card chrome at
  ≥1 px hairline). A page where every section is bordered destroys the
  signal.
- **Law of Prägnanz / Good Figure** (Wertheimer, 1923). The eye
  resolves complex layouts into the simplest underlying form. Designs
  that align with a clear underlying grid (12-column, F-pattern,
  4-quadrant) feel inevitable; ornate breaks that add nothing semantic
  feel arbitrary.
- **Law of Uniform Connectedness** (Palmer & Rock, 1994). The
  strongest grouping signal in the Gestalt hierarchy: connected lines,
  shared toolbars, or bracketing containers tie items together more
  strongly than proximity or similarity. Use for wizard steps,
  comparison sets, and explicit navigation flows.
- **Selective Attention** (Broadbent, *Perception and Communication*,
  1958). Cognitive bandwidth is finite. Users filter aggressively and
  ignore anything that looks irrelevant to their goal — banner blindness
  comes from this. Reserve the strongest visual contrast for the single
  goal-relevant action; let supporting content recede in weight.
- **Von Restorff Effect** (von Restorff, 1933). The item that differs
  from a uniform field is the one most likely to be remembered. Make
  the recommended pricing tier, the active nav item, the warning state
  visually distinct. Pair contrast with a non-color signal (icon, text
  label, position) — `accessibility-baseline.md` rules out color-alone
  signaling.
- **Aesthetic-Usability Effect** (Kurosu & Kashimura, Hitachi Design
  Center, 1995). Visual polish biases perceived usability. Refined
  typography, generous whitespace, and a calm palette earn the benefit
  of the doubt for minor friction. Never substitutes for measurable
  usability or for `state-coverage.md`'s required-states rule.

## Decision-making

Six laws govern how fast and how well users decide when an interface
offers a choice.

- **Hick's Law** (Hick, 1952; Hyman, 1953 replication). Decision time
  grows roughly log(n+1) with the number of equivalent options. Cap any
  single decision-screen to 3–5 visible primary options; collapse the
  rest behind a "More" / progressive disclosure pattern; visually
  distinguish the recommended choice. Aggressive truncation that hides
  the path forward is the opposite failure mode — surface the full
  option set, just don't render every option at the same visual weight.
- **Choice Overload** (Iyengar & Lepper, *Journal of Personality and
  Social Psychology*, 2000; framing dates to Toffler, *Future Shock*,
  1970). Too many roughly-equivalent options stall or abandon the
  decision. Pricing pages: 3–4 tiers, exactly one marked recommended.
  Product grids: 6–9 hero cards above the fold. Settings panels: ≤5
  named groups. Never emit a flat wall of equivalents.
- **Anchoring** (Tversky & Kahneman, *Science* 185:1124–1131, 1974).
  The first number a user sees re-weights every subsequent number.
  Place the recommended pricing tier where it anchors the comparison;
  render yearly-billing savings as concrete dollar deltas, not just
  percentage badges; pre-select the safer default in radio groups.
  Visual weight matches intended decision weight.
- **Pareto Principle / 80-20** (Pareto, c.1906; Juran, *Quality Control
  Handbook*, 1951 — popularized the management-application framing). A
  small share of features drives most of the value. Identify the 2–3 actions
  that drive the dominant journey for the target persona; emphasize
  those visually; demote the long tail to overflow menus, footer
  surfaces, or settings.
- **Tesler's Law / Conservation of Complexity** (Tesler, Apple, 1980s).
  Every product has an irreducible amount of complexity. The design
  choice is *where* it lives — engineering team, interface, user — not
  whether to eliminate it. When complexity reaches the user, surface
  contextual guidance (tooltips, smart defaults, inline empty-state
  coaching, progressive disclosure) at the exact step where it
  surfaces. Hiding it is not the same as removing it.
- **Occam's Razor** (Ockham, 14th c.). Among options that explain the
  data equally well, prefer the one with the fewest assumptions. Specify
  a minimal element inventory; forbid decorative chrome that doesn't
  serve a stated user task. The law constrains assumptions, not feature
  count — a "minimum viable" framing misreads it.

## Memory and learning

Five laws cover how working memory handles information density and
what the user retains afterward.

- **Miller's Law and Chunking** (Miller, *The Magical Number Seven,
  Plus or Minus Two*, *Psychological Review*, 1956 — channel capacity /
  `7±2` and chunking; Cowan, *Behavioral and Brain Sciences* 24:1, 2001
  for the modern ~4-item working-memory bound). Working memory holds
  about four items reliably and up to seven for short-term recall. Each
  slot can hold a *larger familiar unit*, constrained by the user's
  domain knowledge — chunking does not let you pack arbitrary content
  into a single slot. Often misread as a rule about menu length;
  Miller's paper is about chunks. Group related fields with clear
  section headings, dividers, or card containers. A settings page with
  sections "Account / Notifications / Privacy / Billing / Danger zone"
  beats one flat list of 30 toggles.
- **Working Memory** (Baddeley & Hitch, 1974; lineage to Atkinson &
  Shiffrin, 1968). Items decay in seconds without rehearsal. Recognition
  beats recall: persisting prior context across screens, marking visited
  elements, and surfacing comparison views beats forcing the user to
  memorize. On dashboards specifically: sticky filter chips, last-N
  selections persisted, breadcrumbs that include applied filters.
- **Serial Position Effect** (Ebbinghaus, *Über das Gedächtnis*, 1885).
  Recall favors the extremes — primacy at the start, recency at the
  end — while middle items fade. Anchor the most important nav items at
  the leftmost and rightmost positions of a horizontal menu; cluster
  utilities in the middle.
- **Peak-End Rule** (Kahneman, Fredrickson, Schreiber, Redelmeier,
  *Psychological Science*, 1993). Memory of an experience is dominated
  by the emotional peak and the ending, not the average. Stage a
  high-effort celebratory success state; let intermediate steps stay
  calm. Mediocre middles matter less than a strong close. The peak
  belongs at the *end* of a flow, not as arbitrary mid-flow motion —
  `animation-discipline.md` rejects motion that performs (rather than
  confirms) a state change.
- **Zeigarnik Effect** (Zeigarnik, *Über das Behalten erledigter und
  unerledigter Handlungen*, 1927). Uncompleted tasks create cognitive
  tension that pulls the user back. Visible progress ("3 of 5 steps",
  greyed-out next sections) converts that tension into completion
  pressure. Reserve for genuinely beneficial flows like onboarding;
  applying the same lever to streaks, daily-quest counters, or notification-
  reduction nags is a dark pattern.

## Interaction and motor

Five laws cover how fast and how accurately users can act on the UI.

- **Fitts's Law** (Fitts, *Journal of Experimental Psychology*, 1954).
  Time to acquire a target depends on its distance and size — bigger
  and closer is faster. Spacing between adjacent hit zones matters as
  much as size. Pair with `accessibility-baseline.md`'s 24 × 24 CSS px
  AA touch-target floor; on mobile, place high-frequency controls in
  the natural thumb arc.
- **Doherty Threshold** (Doherty & Thadani, *IBM Systems Journal*,
  1982). Sub-second feedback keeps users in flow; latency above ~1 s
  breaks attention. The implementable directive lives in
  `state-coverage.md`'s loading-threshold table (no indicator under
  300 ms; skeleton 300 ms – 2 s; labelled spinner 2 – 10 s; determinate
  bar with cancel 10 – 60 s; stop and offer error/retry past 60 s).
  This entry exists to name the underlying law and flag its folklore
  (the 400 ms number doesn't appear in the 1982 paper — see
  `animation-discipline.md` for the 400 ms folklore trace).
- **Flow** (Csíkszentmihályi, *Beyond Boredom and Anxiety*, 1975). Flow
  sits in the balance between challenge and skill — too hard breeds
  frustration, too easy breeds boredom. Continuous feedback and a clear
  sense of control keep the user inside the state. System friction and
  latency are the fastest ways to break it.
- **Goal-Gradient Effect** (Hull, *Psychological Review*, 1932; Kivetz,
  Urminsky, Zheng, 2006 for the punch-card replication). Motivation to
  finish rises as the goal gets closer. Multi-step flows render with a
  prominent progress indicator that reflects *real* endowed progress —
  show completed prerequisites when they truly exist (saved profile,
  imported team, prior survey answer). When no real prerequisite
  exists, render the current step honestly as `1 of N` with the
  empty/current-step state clearly marked. Hull's hypothesis is
  descriptive; treating it as license for fabricated progress, streak
  dark patterns, or loyalty-program quota inflation is a misread.
- **Postel's Law / Robustness Principle** (Postel, RFC 760, 1980). "Be
  liberal in what you accept, conservative in what you send." Take
  input in whatever shape users naturally give it (phone numbers with
  or without dashes, dates in mixed formats, percentages with or
  without `%`); normalize internally to a canonical form; emit one
  consistent format on output. The error-timing and ARIA-wiring half
  lives in `form-validation.md`; the input-tolerance half is the
  directive above. RFC 9413 (Thomson, IAB, 2023; built on the earlier
  `draft-iab-protocol-maintenance`) retracts the maxim for protocol
  design citing security surface; the UX-input application stands.

## Behavior and expectation

Five laws cover what users predict and how that prediction interacts
with the rendered surface.

- **Jakob's Law** (Nielsen, Nielsen Norman Group, 2000). Users spend
  most of their time on other sites and expect yours to work the same.
  Reuse category convention — nav placement, cart icon, settings gear,
  primary CTA in the upper right of a SaaS landing — so the user spends
  zero cycles relearning interaction grammar. Novelty must earn its
  keep against the convention's ROI; "innovate everywhere" is the
  opposite failure mode.
- **Mental Model** (Craik, *The Nature of Explanation*, 1943; Norman,
  *POET / The Psychology of Everyday Things*, 1988). Every user
  arrives with a prior built from competitor products and the physical
  world. When the prediction holds, the product feels intuitive; when
  it breaks, friction shows up as confusion, not curiosity. When the
  brief names a reference product, anchor explicitly — capture the
  reference in the prompt and the agent inherits a transferable
  interaction grammar.
- **Paradox of the Active User** (Carroll & Rosson, in *Interfacing
  Thought: Cognitive Aspects of Human-Computer Interaction*, MIT Press,
  1987, pp. 80–111). Users skip the manual and start using the
  software immediately, even when reading it would speed them up. Bake
  guidance into the surface itself — empty-state coaching, inline
  tooltips, contextual hints — at the action point.
- **Parkinson's Law** (Parkinson, *The Economist*, 1955). Work expands
  to fill the time allotted to it. Loose interfaces let users dawdle;
  cut friction and pre-fill what you can — autofill, smart defaults,
  saved state — so a checkout finishes faster than the user expected.
  Beating anticipated duration becomes the felt win.
- **Cognitive Load** (Sweller, *Cognitive Science*, 1988). Total
  mental effort splits into intrinsic (the task's inherent difficulty)
  and extraneous (poor layout, jargon, inconsistent patterns, visual
  noise). Designers can't reduce intrinsic load; they own extraneous
  fully. The visual-restraint directives (single accent in `color.md`,
  three-weight typography rhythm in `typography.md`, P0 anti-default
  list in `anti-ai-slop.md`) already constrain extraneous load; this
  entry exists to name the cognitive cost the sibling rules reduce.

## Common mistakes (lint these)

Folklore corrections that don't survive a primary-source check, in the
same vein as the busts already documented in `animation-discipline.md`
and `accessibility-baseline.md`. The first three are attribution
corrections (year / venue / institution) the body entries already
applied — restated here so a reviewer reading just this section sees
them. The remainder are folklore not addressed in the body.

- "Anchoring effect = Tversky & Kahneman 1972." Wrong year. The
  *Science* paper introducing the anchoring framing is 1974; the 1972
  paper is "Subjective probability: A judgment of representativeness"
  (different work).
- "Tesler's Law was developed at Xerox PARC." Tesler left PARC for
  Apple in 1980; the Conservation-of-Complexity formulation traces to
  his Apple years.
- "Paradox of the Active User was a CACM article." It's a chapter in
  Carroll's *Interfacing Thought* (MIT Press, 1987), not CACM.
- "Selective Attention = solved by red dots and badges." Repeated
  attention-grabbers train banner blindness. Reserve the strongest
  contrast for one goal-relevant action per surface.
- "Fitts's Law alone is enough for touch targets." Fitts gives the
  speed-accuracy tradeoff. WCAG 2.2 SC 2.5.8 sets the AA floor at
  24 × 24 CSS px (`accessibility-baseline.md`); iOS HIG suggests
  44 × 44 pt; Material 3 suggests 48 × 48 dp. Fitts plus the
  platform floor — never just Fitts.
