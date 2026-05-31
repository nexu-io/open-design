# AWS PPTX Generator

An Open Design plugin that produces AWS-compliant 16:9 widescreen decks following the official AWS Architecture Icons brand system.

## What this plugin does

When a user picks the **AWS PPTX** chip on Home (or routes a brief to this plugin), the agent receives:

- A locked 16:9 / 1920×1080 deck framework with AWS theme tokens.
- Twelve canonical AWS slide layouts (Cover, Agenda, Section Divider, Content, Architecture, Two-Column, Demo/Code, Customer Story, Comparison/Table, Summary, Resources/CTA, Q&A).
- AWS color tokens (Squid Ink, Smile Orange + eight service category colors).
- Typography rules (Amazon Ember primary, Arial 12pt for diagram labels, Consolas/Monaco for code).
- A diagram contract: every architecture / system / data-flow page invokes the `drawio` skill (preferred) or the `architecture-diagram` skill — never hand-drawn SVG.
- Image+text two-column enforcement on every technical / business content slide.

The output is a self-contained deck HTML file that is visually equivalent to a python-pptx-generated AWS PPTX, plus prints to a multi-page 1920×1080 PDF on Save → PDF.

## Inputs (asked once at start)

| Input | Purpose |
|---|---|
| `theme` | `dark` (Squid Ink, in-person standard) / `light` (white, web/PDF distribution) |
| `deckSubject` | proposal / migration / war / genai / custom |
| `audience` | Defaults to "AWS Solutions Architects" |
| `sessionCode` | AWS track prefix + level (e.g. `ARC301`, `BOA208`) |
| `speakerName` | Speaker name + title |
| `slideCount` | 8 / 10 / 12 / 16 / 20 |
| `diagramApproach` | `drawio` (default) / `architecture-diagram` / `slot` |
| `techVsBusiness` | `tech` / `business` / `mixed` — drives per-slide image+text discipline |

## File map

```
plugin.json                          # plugin manifest
README.md                            # this file
index.html                           # plugin preview (theme + slide-type gallery)
skills/aws-pptx-deck/
  SKILL.md                           # workflow the agent follows when this skill is active
  assets/
    template.html                    # AWS-theme deck framework (light + dark tokens, 12 slide variants)
  references/
    aws-theme.md                     # color / type / layout rules pulled from the AWS spec
    layouts.md                       # 12 slide skeletons (paste-ready)
    diagrams.md                      # how to call drawio / architecture-diagram skills
    checklist.md                     # P0/P1/P2 self-review (run before emitting <artifact>)
examples/
  migration-strategy/                # generated on first run for `migration` subject
```

## How to invoke from a brief

```
Generate an AWS-styled deck for an in-person SA-led session.
- theme: dark
- deckSubject: migration
- sessionCode: ARC301
- audience: enterprise customer architecture review
- diagramApproach: drawio
```

The agent loads `skills/aws-pptx-deck/SKILL.md`, then assets/references in order, drops the framework verbatim, fills 12 `<section class="slide">` blocks per `references/layouts.md`, and runs the P0 checklist before emitting the artifact.

## Brand fidelity guarantees

- Backgrounds are exactly Squid Ink `#232F3E` (dark) or pure white `#FFFFFF` (light) — never another hex.
- Smile Orange `#ED7100` is the only accent color allowed for state changes, kickers, and the cover bottom-bar.
- Service category colors (Galaxy Purple, Nebula, Mars Red, Cosmos Pink, Endor Green, Orbit Turquoise, Light Gray, Smile Orange) are used **only** to color-code service categories on architecture diagrams and comparison tables.
- All architecture-diagram labels are 12pt Arial; all body copy is 16pt Amazon Ember Light; subheads are Amazon Ember Bold ≤ half headline size; headlines are Amazon Ember Display.
- No more than 10 consecutive bold words anywhere. No more than 15 words per line of body copy.

## References

- [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) — Release 22 / 2025-07-31
- AWS-Compliant PPTX Generation Skill Dev (project source PDF)
- AWS-Architecture-Icons-Deck_For-Light-BG_07312025.pdf
- AWS-Architecture-Icons-Deck_For-Dark-BG_07312025.pdf
