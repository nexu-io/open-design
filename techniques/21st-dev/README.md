# 21st.dev Technique Library Hook

Purpose: reserve a clean landing zone for later 21st.dev MCP/code ingestion.

This folder is intentionally a scaffold, not fabricated component source. When the 21st.dev MCP or export source is connected, save each copied component/effect as source code here and index it in `index.json`.

## Folder contract

```text
techniques/21st-dev/
  README.md
  manifest.schema.json
  index.json
  categories/
    heroes/
    navigation/
    backgrounds/
    shaders/
    motion-scroll/
    forms/
    pricing/
    dashboards/
    ai-chat/
    system-ui/
```

## Per-technique contract

Each imported technique should contain:

- `README.md` — what it does, where to use it, dependencies, adaptation notes.
- `source.tsx` / `source.jsx` / `source.html` — copied source from MCP/export.
- `styles.css` / `tokens.css` — copied style source when separate.
- `dependencies.md` — package names, install command, runtime constraints.
- `preview-notes.md` — visual/interaction behavior and QA notes.

## Horangdesign usage

The daemon prompt now tells agents to reserve `techniques/` hooks when a project mentions 21st.dev/MCP/component-code sources. Do not invent missing code. Import only verified source from MCP/export.
