# Persistent Options Canvas — behavioral reference

This note documents the interaction model implemented by the plugin. It is a behavioral synthesis grounded in parallel prototyping, persistent visual workspaces, and established design-tool patterns.

## Core model

A persistent options canvas combines three kinds of design memory:

- **spatial memory** — sibling alternatives from the same exploration turn remain visible together;
- **temporal memory** — later turns are added while earlier work remains visible;
- **artifact memory** — the exploration keeps growing inside the same primary artifact rather than producing a sequence of replacement exports.

The result behaves more like a studio wall than a single mutable mockup.

## State model

The complete visible document is the canvas, whose direct states are ordered newest-first:

```text
Turn 3   ← newest
Turn 2
Turn 1
0 · Baseline   ← when a reliable current state exists
```

A turn contains sibling options. The optional baseline is a reference state representing what exists before exploration.

### Delivered turns become historical snapshots

A turn can change while it is being generated. Once delivered, it becomes part of the visible state ledger.

The normal follow-up operation adds a new turn while preserving the older states as the same rendered states the user already saw:

```text
D1 = [t1, baseline]
D2 = [t2, t1, baseline]
D3 = [t3, t2, t1, baseline]
```

Preservation means more than keeping the same label or concept. Replacing a full prototype with a compact summary changes the state. Shared style or behavior changes that alter how an older state renders also change the state.

See [`artifact-state-mutation.md`](artifact-state-mutation.md) for the mutation model.

### Baseline is evidence, lineage is descent

A baseline answers: **what is the current state?**

Lineage answers: **which earlier design is this option intentionally derived from?**

These are separate concepts. A project can have a visible baseline while a new option starts from first principles. Another option may explicitly riff on the baseline or a prior option and record that lineage.

## Stable identities

Turns and options receive stable anchors:

```text
t1, t2, t3
1a, 1b, 1c
2a, 2b, 2c
```

The same identities are used in the visual document and in conversation. A sentence such as:

```text
Combine the structure of 2a with the interaction from 1c.
```

can link directly to those states inside the canvas.

## Sibling comparison

Options within a turn are shown together whenever the medium allows. The layout makes comparison immediate and keeps the sibling relationship visually obvious.

The options vary on dimensions that matter to the brief: structure, hierarchy, interaction, navigation, visual language, content strategy, or other relevant axes.

The option count is part of the design judgment rather than the state protocol. Explicit user counts are followed; otherwise the exploration uses a compact set large enough to expose meaningful differences.

## Complete visible document

The canvas is the visible artifact, rather than one section inside a separate presentation wrapper. Turn labels, option identities, optional local explanation, continuation cues, and baseline context all live inside the state structure of the canvas.

This gives the protocol a clear ownership boundary while keeping the surrounding visual system lightweight.

## Stable chrome, variable content

The canvas chrome has one job: make states easy to locate, compare, and revisit. It stays visually stable across generations.

The option content has a different job: answer the actual design brief. Its typography, color, density, interaction model, and visual language can vary freely.

This separation reduces the chance that each new run reinvents the exploration workspace instead of concentrating on the designs.

## Local explanation

Explanation is optional content near the work. It can be a sentence, paragraph, bullets, or absent when the design is already self-explanatory.

The protocol keeps identity and history stable while leaving design reasoning expressive.

## Navigation suggestions

A turn can end with a short line of concrete next-step paths: riff on one option, combine specific parts, explore another axis, or converge when the user is ready.

## Progressive rendering

When the host refreshes HTML as project files change, progressive authoring can make the design space appear while generation is still in progress:

1. resolve the existing primary artifact when one already exists;
2. establish the newest turn shell in front of older states;
3. render coherent sibling options incrementally;
4. add local explanation or continuation cues when they improve the work.

The same interaction model also works in hosts that expose only a final-write workflow.

## Method lineage

The behavior is consistent with long-standing design practices such as parallel prototyping, pin-up critique, artboard duplication, design-space exploration, and persistent visual workspaces.

Modern AI design tools make the pattern especially useful because alternatives can be produced quickly enough that visible divergence can become a normal interaction rather than an expensive exception.
