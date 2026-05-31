# Architecture diagrams — drawio + architecture-diagram skill contract

Every architecture / system / data-flow / network slide in an AWS deck must use a real generated diagram. **Never hand-draw SVG architecture diagrams in this skill.** Either invoke the `drawio` skill (preferred) or the `architecture-diagram` skill, save the output, and reference it from the slide.

## Decision tree

```
Is the diagram an AWS architecture / VPC / multi-account / data-pipeline / network topology?
  YES  ── invoke `drawio` skill (it has AWS shape libraries built-in)
  NO   ── is it a generic system diagram (boxes + arrows, sequence, flow, ER)?
            YES ── invoke `architecture-diagram` skill
            NO  ── leave a labelled placeholder per layouts.md (slot variant)
```

If `diagramApproach=drawio` is set on the plugin inputs, default to drawio for every diagram. If `diagramApproach=architecture-diagram`, default to that skill. If `diagramApproach=slot`, never invoke a diagram skill — leave the placeholder.

## drawio invocation pattern

The `drawio` skill is the preferred path for AWS work because it speaks AWS shape libraries directly. Trigger phrases that route to drawio: "draw an AWS architecture diagram", "VPC layout", "multi-account topology", "Landing Zone diagram", "data pipeline".

Example brief to pass to the drawio skill (call it via `Skill` tool with `skill: "drawio"`):

```
Generate an AWS architecture diagram for "Landing Zone — multi-account base".

Theme: dark (Squid Ink background)
Output: SVG, save as assets/diagrams/landing-zone.svg

Required elements:
- AWS Organizations management account at top
- Two OUs: "Workloads" and "Security"
- Workloads OU contains: Production account, Non-Production account, Sandbox account
- Security OU contains: Log Archive account, Audit account
- Each account is its own group container with the AWS Squid Ink (#232F3E) outline
- Cross-account flows: CloudTrail logs from every account → Log Archive S3
- AWS Control Tower icon top-center, IAM Identity Center icon top-right
- All connectors: 2pt, Open Arrow Size 4, #9BA7B6
- Labels: Arial 12pt
- Service category colors per AWS spec
```

After the drawio skill returns the file, save it to `assets/diagrams/{name}.svg` (or `.png`) inside the project. In the architecture slide, embed it:

```html
<section class="slide" data-screen-label="07 Target Architecture" data-slide-type="architecture">
  <h2 class="slide-title">Target Architecture — AWS Landing Zone</h2>
  <figure class="arch-figure">
    <img src="assets/diagrams/landing-zone.svg" alt="AWS Landing Zone architecture" />
  </figure>
</section>
```

## architecture-diagram invocation pattern

Use this for non-AWS-specific system diagrams (sequence diagrams, ER diagrams, generic block diagrams, organization charts). Call it via `Skill` tool with `skill: "architecture-diagram"`.

Example brief:

```
Generate a sequence diagram for "Bedrock Agent — RAG retrieval flow".

Output: SVG, save as assets/diagrams/bedrock-rag-flow.svg

Actors:
- User
- API Gateway
- Lambda (orchestrator)
- Bedrock Agent
- Knowledge Base (OpenSearch)
- Bedrock Foundation Model (Claude)

Flow:
1. User → API Gateway → Lambda: query
2. Lambda → Bedrock Agent: invoke
3. Bedrock Agent → Knowledge Base: retrieve top-k chunks
4. Knowledge Base → Bedrock Agent: chunks
5. Bedrock Agent → Bedrock FM: prompt + chunks
6. Bedrock FM → Bedrock Agent: response
7. Bedrock Agent → Lambda → API Gateway → User: response

Style: dark theme, AWS Squid Ink background, Arial labels, 12pt, AWS service category colors per category.
```

## Slot fallback

If neither skill is available or `diagramApproach=slot`, render a labelled placeholder using the architecture layout's `.arch-placeholder` element:

```html
<figure class="arch-figure">
  <div class="arch-placeholder" data-label="Landing Zone topology — pending diagram">
    <span class="arch-placeholder-title">[architecture diagram]</span>
    <span class="arch-placeholder-meta">Landing Zone — multi-account · drawio · 1700×800</span>
  </div>
</figure>
```

The CSS for `.arch-placeholder` is in `assets/template.html` — a Squid Ink rectangle with a Smile Orange dashed outline and a centered label.

## Caption rule

Every architecture slide gets a one-sentence caption below the diagram in 14px Amazon Ember:

> *Production accounts host workloads in two AZs across us-east-1; CloudTrail logs aggregate to a dedicated Log Archive account.*

The caption is the part the speaker reads. The diagram is what the audience studies during that line.

## Saving generated diagrams

All generated diagrams live under `assets/diagrams/` in the project root, named by slide topic in kebab-case:

```
assets/diagrams/
├── landing-zone.svg
├── target-architecture.svg
├── data-pipeline.svg
├── bedrock-rag-flow.svg
└── wave-plan-network.svg
```

Reference them by relative path. Do not inline SVG into the deck HTML — keep the deck file readable and let the framework's `<img>` references handle it.
