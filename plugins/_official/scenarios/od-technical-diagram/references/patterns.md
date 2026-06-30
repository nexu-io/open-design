# Technical Diagram Pattern Router

Use this file as the first routing layer, then load the matching
fireworks-tech-graph references.

## Diagram Types

- Architecture: client, gateway/API, services, workers, stores,
  observability. Use section bands for layers.
- Workflow: lanes, triggers, states, decision branches, exceptions, outputs.
- RAG / agent: input, planner/LLM loop, tools, memory, retrieval, evaluation,
  final response.
- Data flow: sources, transforms, warehouse, semantic layer, dashboards,
  governance. Label every important arrow with the data type.
- UML sequence: lifelines, activations, request/response, retry/error path.
- UML class/state/use-case/ER: use the dedicated grammar in `SKILL.md` and
  upstream templates.
- Comparison: before/after, decision matrix, option scorecard, quadrant.
- Timeline: horizontal time axis, milestones, phase bars, optional now marker.
- Mind map: central concept plus curved branches and leaf ideas.
- Network topology: zones/subnets, devices, bandwidth/traffic labels.

## Starter Templates

Use the closest starter under `templates/`:

- `architecture.svg`
- `agent-architecture.svg`
- `data-flow.svg`
- `flowchart.svg`
- `sequence.svg`
- `state-machine.svg`
- `timeline.svg`
- `comparison-matrix.svg`
- `er-diagram.svg`
- `use-case.svg`

## Style Routing

- Style 1 Flat Icon: default for product docs and readable handoff.
- Style 2 Dark Terminal: CLI/agent/tool-call flows, dark devtool surfaces.
- Style 3 Blueprint: infrastructure, deployment, networks, serious engineering.
- Style 4 Notion Clean: minimal internal docs and concept maps.
- Style 5 Glassmorphism: multi-agent collaboration or showcase diagrams.
- Style 6 Claude Official: warm, restrained AI product architecture.
- Style 7 OpenAI Official: precise, modern API integration or SDK flows.
- Style 8 Dark Luxury: premium black/gold architecture and launch visuals.

Load `references/style-diagram-matrix.md` for the full matrix and one
`references/style-*.md` file for exact tokens.

## Shape Vocabulary

- LLM/model: double-border rounded rectangle.
- Agent: hexagon.
- Store/memory/database: cylinder or stacked rounded container.
- Decision: diamond.
- External actor: circle/avatar or labeled side node.
- Semantic group: dashed rounded band with section label.
- Write path: warm/accent arrow.
- Read path: green/blue dashed arrow.
- Retry/feedback: curved loop arrow.

## Output Contract

Keep the final diagram editable SVG. Use real text nodes, marker definitions,
group labels, and export-friendly viewBox dimensions. Mermaid can be used for
thinking, not as the final designed artifact.
