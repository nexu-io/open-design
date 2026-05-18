# Export To Vue

Use this plugin when the user wants to hand an accepted Open Design artifact to a Vue 3 project.

## Workflow

1. Convert the artifact into a Vue 3 single-file component with a clear template, script, and style boundary.
2. Use Composition API only when the component needs state, lifecycle hooks, or derived values.
3. Prefer Tailwind CSS when the target project already supports it; otherwise use scoped CSS.
4. Preserve accessibility semantics from the artifact, including headings, buttons, links, labels, focus states, and alt text.
5. Finish with file placement notes, required assets, and any assumptions about routing or data.

## Quality Bar

- Do not add Vue state for static content.
- Do not introduce a UI framework unless the target project already uses it.
- Keep generated props and emits minimal.
