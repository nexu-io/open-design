---
name: kanban-board
description: |
  Kanban / task board with columns (To do / In progress / In review / Done),
  draggable-looking cards, assignee avatars, swimlanes, and a top filter
  bar. Use when the brief mentions "kanban", "task board", "sprint board",
  "trello", "看板".
triggers:
  - "kanban"
  - "task board"
  - "sprint board"
  - "trello"
  - "jira board"
  - "看板"
od:
  mode: prototype
  platform: desktop
  scenario: operations
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [state-coverage, laws-of-ux]
  example_prompt: "Make me a kanban board for a 5-person growth squad mid-sprint — backlog, doing, review, done."
---

# Kanban Board Skill

Produce a single-screen kanban board.

## Workflow

1. Read the active DESIGN.md.
2. Identify squad name, sprint number, columns, and member roster from the brief.
3. Layout:
   - Top bar: project crumb, sprint chip, filter row (members, labels, status), search.
   - 4 columns: Backlog, In progress, In review, Done. Each column has a count chip and an "+ add" affordance.
   - 3–6 cards per column. Each card: tag chip, title, assignee avatar, point estimate, progress (if applicable).
   - Sidebar (collapsible feel): "Sprint pulse" with progress bar, top assignees, blocked-tickets callout.
4. One inline `<style>`, semantic HTML.

## Output contract

```
<artifact identifier="kanban-board" type="text/html" title="Sprint Board">
<!doctype html>...</artifact>
```
