---
name: import-screenshot-to-prototype
description: Use this plugin when the user provides a screenshot or image reference and wants it reconstructed as an editable Open Design prototype with sensible components, layout, and responsive behavior.
license: MIT
metadata:
  author: open-design-spec
  version: "0.1.0"
---

# Import Screenshot To Prototype

## Workflow

1. Inspect the screenshot and identify layout regions, controls, typography scale, color roles, and content hierarchy.
2. Ask for the target viewport only if it cannot be inferred.
3. Rebuild the screenshot as a clean `index.html` artifact with semantic sections and reusable CSS tokens.
4. Preserve the visual intent, but replace unreadable or unavailable text with realistic editable content.
5. Add responsive behavior for at least one mobile width.
6. Self-critique visual fidelity, text fit, and editability before final.

## Output Contract

Produce `index.html` and a short `import-notes.md` that lists inferred decisions.

