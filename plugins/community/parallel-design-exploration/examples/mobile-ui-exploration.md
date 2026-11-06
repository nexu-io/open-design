# Example: Mobile Search UI Exploration

This walkthrough demonstrates the **session shape** of Parallel Design Exploration. It is an example of the protocol, not a prescribed product style or option count.

## User brief

```text
Explore alternative interaction models for an iOS quick-search app.

The user arrives with a specific search intent and should be able to execute the search
without getting pulled into an infinite content feed. I want structurally different
ideas and I want to compare them before choosing a direction.
```

## Turn 1

The first turn might establish a compact set of distinct hypotheses such as:

```text
1a — Quiet Canvas
Search and result content dominate; almost all surrounding chrome recedes.

1b — Thumb Search Dock
The primary search affordance stays in the thumb zone while results expand above it.

1c — Command Results
Results emphasize the next action rather than feed-like browsing.
```

All siblings are rendered inside the same exploration artifact and remain addressable by their stable logical ids.

A simplified structure looks like:

```html
<main class="pde-canvas">
  <section class="pde-turn" id="t1" data-turn="1">
    <div class="pde-options">
      <article class="pde-option" id="o-1a" data-option="1a">...</article>
      <article class="pde-option" id="o-1b" data-option="1b">...</article>
      <article class="pde-option" id="o-1c" data-option="1c">...</article>
    </div>
  </section>
</main>
```

The conversational identity stays `1a` / `1b` / `1c`; the `o-` prefix only makes DOM anchors safe for CSS and JavaScript selectors.

Once delivered, this Turn 1 subtree becomes a historical snapshot in the session's primary artifact.

Local explanation can appear beside or below an option when the design benefits from it; it is not part of a fixed review form.

## Follow-up feedback

```text
1b feels closest, but the keyboard will already occupy the lower part of the screen.
Keep the dock idea and show me three different ways to handle results in that state.
```

## Turn 2

The user explicitly asked for three riffs, so the next turn branches from `1b`:

```text
2a — Compressed result stack     ← 1b
2b — Result peek + expand        ← 1b
2c — Single-result command       ← 1b
```

The same primary artifact grows into:

```text
TURN 2
2a        2b        2c
 ↑         ↑         ↑
 └──────── 1b ───────┘

TURN 1
1a        1b        1c
```

When targeted edits are available, the follow-up is a local prepend immediately after the opening `main.pde-canvas` tag. Existing delivered state subtrees are left untouched.

The resulting structure is:

```html
<main class="pde-canvas">
  <!-- newly inserted state -->
  <section class="pde-turn" id="t2" data-turn="2">
    <article class="pde-option" id="o-2a" data-option="2a" data-parent="1b">...</article>
    <article class="pde-option" id="o-2b" data-option="2b" data-parent="1b">...</article>
    <article class="pde-option" id="o-2c" data-option="2c" data-parent="1b">...</article>
  </section>

  <!-- previously delivered subtree remains the same rendered state -->
  <section class="pde-turn" id="t1" data-turn="1">
    ... original 1a / 1b / 1c ...
  </section>
</main>
```

Turn 2 is new work. Turn 1 remains source-of-truth history rather than being redrawn as a thumbnail, summary, or reinterpretation. New CSS or JavaScript for Turn 2 is scoped so the earlier prototypes keep the same rendering meaning.

The file path established in Turn 1 also remains the primary artifact identity; the follow-up extends that artifact rather than creating a second "latest" exploration file.

## Conversation stays connected to the canvas

Stable logical ids make follow-up prompts precise:

```text
Go back to 1a and branch a more system-native version.
```

```text
Combine 1c's action treatment with 2b's result expansion.
```

```text
2a is strongest; continue from that direction.
```

These prompts normally create new descendant states. If the user instead explicitly asks to correct a historical state itself, that is a direct historical edit rather than a normal continuation.

The value of the protocol is that each sentence refers to a visible, persistent design state rather than an implicit version remembered only by the conversation.
