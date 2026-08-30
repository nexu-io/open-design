# Artifact & State Mutation — behavioral reference

Parallel Design Exploration treats design history as a visible state ledger rather than a sequence of replaceable exports.

## One exploration, one primary artifact

An exploration session establishes one primary artifact on its first generation. That artifact keeps the same identity as the conversation continues.

```text
exploration session
└── search-and-go-exploration.html
    ├── Turn 3
    ├── Turn 2
    ├── Turn 1
    └── 0 · Baseline
```

A follow-up turn extends this artifact in place. Supporting implementation files may exist, but they do not replace the primary visible history.

## Delivered states are historical snapshots

A turn is editable while it is being produced. Once delivered to the user, it becomes a historical design-state snapshot.

The normal state transition is:

```text
D1 = [t1, baseline]

user asks for another riff

D2 = [t2, t1, baseline]
```

The important relationship is:

```text
t1 in D2 means the same rendered state as t1 in D1
baseline in D2 means the same rendered state as baseline in D1
```

Stable history is stronger than preserving a label or summary. Replacing a full earlier prototype with a compact reinterpretation changes the historical state even if its conceptual description remains similar.

## New work is usually additive

Requests such as:

```text
riff on 1b
make 1b more compact
combine 1a with 1c
explore the same idea with a different hierarchy
```

normally create new descendant options in the next turn. Lineage records where the new work came from without rewriting the source state.

Direct mutation of an earlier state is reserved for cases where the user explicitly asks to correct or replace that historical state itself.

## Prefer a local prepend edit

When the host exposes targeted file editing, the safest follow-up mutation is a local insertion immediately after the opening `main.pde-canvas` tag, before the current newest state.

Conceptually:

```html
<main class="pde-canvas">
  <!-- insert the new turn here -->

  <!-- existing delivered states remain in place below -->
  <section id="t1" data-turn="1">...</section>
  <section id="baseline" data-baseline="0">...</section>
</main>
```

This operation scales better than regenerating the entire exploration document and makes historical preservation mechanical: the edit adds a new subtree without re-emitting older state subtrees.

Whole-file regeneration is a fallback for hosts that provide no targeted edit mechanism. Even in that case, the historical state model remains the same.

## Rendering meaning is part of state

History is not only DOM markup. Shared CSS or JavaScript can change the visual or interactive meaning of old states even when their HTML nodes stay untouched.

New turns therefore favor additive or state-local implementation:

```css
/* existing historical state */
.phone-1a { ... }
.phone-1b { ... }

/* later turn */
.phone-2a { ... }
.phone-2b { ... }
```

rather than broad redefinitions that silently restyle previously delivered work.

The same principle applies to event handlers, shared data, and layout rules.

## Prepend-only state growth

Because newest turns appear first, the normal structural result is:

```html
<main class="pde-canvas">
  <section id="t2" data-turn="2">...</section>
  <section id="t1" data-turn="1">...</section>
  <section id="baseline" data-baseline="0">...</section>
</main>
```

This preserves spatial and temporal memory at the same time: the latest work is immediately visible, while the path that led there remains on the same canvas.

## Why this matters

Without explicit mutation semantics, an agent can satisfy "keep the old work" by recreating an approximate summary of it. That preserves narrative history but destroys design history.

Persistent exploration requires the stronger model:

> delivered design states are source-of-truth snapshots; later work extends the ledger around them.
