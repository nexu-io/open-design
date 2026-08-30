# Reference: Persistent Exploration Canvas

Parallel prototyping explains **why** multiple alternatives should stay alive. The exploration canvas explains **how** those alternatives remain visible and navigable.

This model combines three forms of design memory:

```text
SPATIAL MEMORY
A      B      C
sibling alternatives visible together

TEMPORAL MEMORY
Turn 3
Turn 2
Turn 1
prior exploration remains visible

ARTIFACT MEMORY
one primary document keeps growing
instead of being replaced by successive exports
```

The current state and the path that produced it can therefore be inspected in the same working space.

## 1. Figma — canvas as a working area for exploration

Figma describes the canvas as the working area where designers have room to explore and iterate on ideas.

Official guide:
https://help.figma.com/hc/en-us/articles/15297425105303-Explore-design-files

The same guide explains that Pages can help manage designs by milestone or status, keep a scratchpad of ideas, and archive older designs.

This separates two jobs:

- the **canvas** exposes active alternatives spatially;
- **pages/version history** provide additional organization and recovery.

For an agent-driven exploration, the most relevant earlier alternatives remain visible in the working space so comparison stays immediate.

## 2. Figma Sections — named regions for ideation

Figma Sections group related ideas and designate areas of the canvas for collaboration or ideation.

Official guide:
https://help.figma.com/hc/en-us/articles/9771500257687-Organize-your-canvas-with-sections

A useful analogue is:

```text
Turn 2
[2a] [2b] [2c]

Turn 1
[1a] [1b] [1c]
```

A turn is therefore both a temporal generation and a visible spatial region.

## 3. Version history — evolution with recoverability

Figma design files maintain version history so users can inspect previous iterations and capture milestones.

Official overview:
https://help.figma.com/hc/en-us/articles/15297425105303-Explore-design-files

Spatial exploration and version history serve related but different purposes:

```text
Spatial exploration
Used for: active comparison
Visible: A / B / C together
Question: "How do these ideas differ?"

Version history
Used for: recovery / temporal trace
Visible: v1 / v2 / v3 in a history UI
Question: "What did this artifact look like before?"
```

A persistent options canvas brings the most relevant temporal history into the visible design space while host version history remains an additional safety layer.

## 4. Artboards and frames — bounded designs in one document

Long before AI design agents, visual design tools normalized the idea that one document can contain multiple bounded design surfaces.

Adobe Illustrator's multiple-artboard model allowed several artboards to be created, positioned, reordered, and viewed in one document. Figma frames and similar UI-design primitives continue the same broad working pattern: a bounded design can be duplicated or branched while its source remains available for comparison.

Each option in this plugin behaves conceptually like an artboard or frame:

- bounded enough to judge as a design state;
- independently addressable;
- comparable in scale with siblings when useful;
- stable enough to serve as a source for later branches.

## 5. The pin-up wall mental model

Design studios have long used spatial review: sketches, alternatives, intermediate states, and developed proposals are pinned up together so a group can compare them.

The important property is **juxtaposition**.

When alternatives are simultaneously visible, critique naturally becomes relational:

- "A's hierarchy is clearer than B's."
- "B's interaction is stronger, while C handles density better."
- "Can we branch from B and borrow C's result treatment?"

The canvas supports that same kind of comparative language through stable visible ids.

## 6. Stable utility chrome

The canvas chrome serves orientation rather than expression. A small, stable visual substrate is more reliable than asking each generation to reinterpret adjectives such as "quiet" or "restrained."

The useful invariant is structural:

- a warm neutral working surface;
- compact system-ui turn labels;
- compact monospace state ids;
- thin separators between turns;
- flex-wrapped sibling options;
- intrinsic artboard sizing;
- transparent option containers;
- a light bounded surface around rendered artifacts;
- concise continuation cues when useful.

The actual designs remain free to carry the visual personality required by the brief.

## 7. Intrinsic artboard sizing

A general exploration canvas may contain phones, dashboards, posters, components, charts, or other artifacts. A fixed responsive column system assumes a page-layout problem that may not exist.

A more general model is:

```text
artifact chooses a useful intrinsic width
          ↓
option keeps that width
          ↓
canvas flex-wraps siblings as space permits
```

This preserves the artboard mental model while still allowing a normal HTML document to wrap when the viewport becomes narrow.

## 8. Persistent exploration units

The historical unit is the **delivered design state**: a turn, option, or baseline with stable identity and rendering meaning.

Once delivered, a state acts as a source-of-truth snapshot for later comparison and branching. The normal next-turn operation grows the document around that state rather than recreating an abbreviated or stylistically updated version of it.

The surrounding canvas can grow as the exploration continues. New state-local implementation can be added, while the identities, rendered content, turn association, and meaningful lineage of earlier states remain the anchors that keep the exploration intelligible.

## 9. Spatial hierarchy

The temporal and spatial order align:

```text
TURN 3   ← newest
[3a] [3b] [3c]

TURN 2
[2a] [2b] [2c]

TURN 1
[1a] [1b] [1c]

0 · BASELINE   ← when a reliable current state exists
[current design]
```

A user can scan downward to understand how the design space evolved while keeping the latest exploration immediately accessible.

## 10. Design rule derived from the references

> Design history that matters for active comparison is most useful when it remains visible, stable in meaning, and addressable from conversation inside the same growing artifact.

That principle is the basis for persistent turns, stable option ids, immutable delivered states, newest-first ordering, and a lightweight canvas substrate.
