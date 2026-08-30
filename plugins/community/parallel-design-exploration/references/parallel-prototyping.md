# Reference: Parallel Prototyping

This skill treats parallel prototyping as its primary design-method foundation.

## 1. Dow et al. — parallel prototyping vs serial iteration

**Steven P. Dow, Alana Glassco, Jonathan Kass, Melissa Schwarz, Daniel L. Schwartz, Scott R. Klemmer.**

*Parallel Prototyping Leads to Better Design Results, More Divergence, and Increased Self-Efficacy.* ACM Transactions on Computer-Human Interaction, 17(4), Article 18, 2010.

DOI: https://doi.org/10.1145/1879831.1879836

ACM: https://dl.acm.org/doi/10.1145/1879831.1879836

### What the study compared

```text
SERIAL
prototype → critique → prototype → critique → prototype

PARALLEL
prototype A ─┐
prototype B ─┼→ critique/comparison → later refinement
prototype C ─┘
```

The authors discuss how serial iteration can encourage fixation on an incumbent idea. In the reported experiment, participants in the parallel condition created several prototypes before feedback. The paper reports more diverse alternatives and stronger final outcomes by the study's expert-rating and click-through measures, while participants also reported a larger increase in task-specific confidence.

### Implications for this skill

The relevant lesson is structural rather than numeric:

- keep several design hypotheses alive long enough to compare them;
- make alternatives concrete before commitment;
- gather feedback across alternatives rather than only on a single incumbent;
- preserve meaningful diversity between sibling designs;
- let convergence follow comparison.

The exact number of siblings can follow the design question and the user's request.

## 2. Hartmann et al. — Design as Exploration / Juxtapose

**Björn Hartmann, Loren Yu, Abel Allison, Yeonsoo Yang, Scott R. Klemmer.**

*Design As Exploration: Creating Interface Alternatives through Parallel Authoring and Runtime Tuning.* UIST 2008.

Stanford HCI publication page: https://hci.stanford.edu/publications/paper.php?id=16

Project page: https://hci.stanford.edu/research/juxtapose/

### Why it matters here

Juxtapose is especially relevant because it treats **multiple interface alternatives as first-class authoring objects**, not only as sketches that disappear before implementation.

Its core premise supports:

- comparative reasoning;
- grounded team discussion;
- situated exploration;
- rapid surveying of alternatives.

It also highlights a tooling tension that remains recognizable today: authoring tools often center one current artifact even though exploration benefits from multiple alternatives.

### Implication for this skill

The design object is closer to:

```text
Exploration
├── Alternative A
├── Alternative B
└── Alternative C
```

than to a single latest-state artifact. Stable option identities and the persistent canvas make those alternatives explicit and addressable.

## 3. Divergence and convergence

Parallel prototyping belongs to a broader family of design practices that separate **divergence** from **convergence**.

### Explore mode

- increase meaningful alternatives;
- keep siblings visible;
- compare trade-offs;
- branch from promising ideas;
- build enough fidelity for judgment.

### Converge mode

- select or combine specific variants;
- preserve provenance of the selected ideas;
- continue development from a chosen state;
- retain the exploration record as context.

The user controls the transition between these modes through conversation.

## 4. Comparable representations

Parallel alternatives are easier to judge when comparison conditions are appropriate to the question.

For UI prototypes, useful controlled dimensions can include:

- device or viewport size;
- content/data scenario;
- prototype fidelity;
- key user task;
- visual scale on the canvas.

These are tools for fair comparison rather than content that automatically needs to appear in the visible artifact.

## 5. Meaningful divergence

Strong sibling differences often concern:

- information architecture;
- primary interaction model;
- navigation model;
- hierarchy;
- sequence and disclosure;
- product metaphor;
- spatial organization;
- density;
- direct manipulation versus command/action models;
- system-native versus custom interaction.

Visual style can also be a valid exploration dimension when that is the design question. In that case typography, color, material, motion, or tone may be the primary axes of divergence.

## 6. Design rule derived from the references

> Generate alternatives far enough to compare the design, not merely the description of the design.

That is the core distinction between parallel prototyping and a conventional direction picker.
