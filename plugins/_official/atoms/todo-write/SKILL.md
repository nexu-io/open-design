---
name: todo-write
description: TodoWrite-driven plan that the agent commits to before generation.
od:
  scenario: general
  mode: planning
---

# Todo write

This atom reinforces the active mode's planning contract; it does not mandate a
specific tool name. In a substantial Design build, use the runtime's real
plan/task UI when available, otherwise maintain a concise numbered plan. Plan
mode owns its planning-document workflow, and Ask mode does not activate this
atom.

1. Keep todos atomic (one verb per todo).
2. Reorder freely as the picture sharpens.
3. Mark a todo complete only after the matching artifact lands.
4. Surface blockers as todos — never silently skip.
