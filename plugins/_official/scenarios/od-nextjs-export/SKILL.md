# Export To Next.js

Use this plugin when the user wants to hand an accepted Open Design artifact to a Next.js App Router project.

## Workflow

1. Decide whether the result should be a route, layout fragment, or reusable component.
2. Keep components server-first unless interactivity, browser APIs, or client state require `'use client'`.
3. Preserve the artifact's visual system while adapting image, link, font, and metadata usage to Next.js conventions.
4. Prefer Tailwind CSS when the target project already supports it; otherwise keep styling local and easy to move.
5. Finish with file placement notes, client/server assumptions, assets, and any data requirements.

## Quality Bar

- Do not mark the whole tree as client-side unless necessary.
- Do not add framework features unrelated to the artifact handoff.
- Keep route and component boundaries easy to review.
