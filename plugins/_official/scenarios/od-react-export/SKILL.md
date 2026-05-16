# Export To React

Use this plugin when the user wants to hand an accepted Open Design artifact to a React app.

## Workflow

1. Inspect the current artifact and identify the smallest React component boundary that preserves the design.
2. Produce React 18 + TypeScript code with clear props only for content or state that is likely to vary.
3. Prefer Tailwind CSS when the target project already supports it; otherwise keep styling local and easy to move.
4. Preserve accessibility semantics from the artifact, including headings, buttons, links, labels, focus states, and alt text.
5. Finish with file placement notes, required assets, and any assumptions about routing or data.

## Quality Bar

- Do not flatten the artifact into generic divs.
- Do not introduce a component library unless the target project already uses it.
- Keep generated props and variants minimal.
