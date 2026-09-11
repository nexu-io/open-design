# Agenti v praxi Usage

Design System package guide for Open Design agents and reviewers.

## Read Order

1. Read this file first to understand the package contract.
2. Read `DESIGN.md` for brand intent, tone, layout posture, and component rules.
3. Paste `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Use raw hex values only inside the token block. Component CSS should use `var(--token-name)`.

## Design Highlights

- Bright, utilitarian Czech operator workspace for practical AI-agent education.
- Warm paper background, white operational surfaces, crisp graphite text, and thin rules.
- Signal Blue for primary actions, Agent Green for successful automation, Warm Accent for notes and callouts.
- Dense but calm layouts for workflows, dashboards, templates, lessons, and audits.

## Do

- Keep the language practical and Czech-first when writing user-facing copy.
- Show real workflow structure: inputs, agent role, tools, checkpoints, outputs, and failure modes.
- Use mono type for prompts, commands, logs, agent IDs, tool names, and workflow labels.
- Make status colors semantic and pair them with labels or icons.

## Avoid

- Avoid generic AI neon, purple gradients, floating blobs, and decorative futurism.
- Avoid oversized marketing composition for tools, dashboards, or lesson surfaces.
- Avoid claiming that agents remove human review. Human checkpoints are part of the brand.
- Avoid raw hex values outside `tokens.css` unless the artifact is explicitly documenting the palette.
