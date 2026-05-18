---
name: todo-write
description: TodoWrite-driven plan that the agent commits to before generation.
od:
  scenario: general
  mode: planning
---

# Todo write

Before writing any artifact files, the agent commits to a numbered plan
via the TodoWrite tool. The plan is the audit trail; subsequent turns
either tick items off or rewrite the plan. The atom's prompt fragment
teaches the agent to:

1. Keep todos atomic (one verb per todo).
2. Reorder freely as the picture sharpens.
3. Mark a todo complete only after the matching artifact lands.
4. Surface blockers as todos — never silently skip.

The Open Design daemon does not enforce a particular tool name; the
agent is free to use TodoWrite (Claude Code) or an in-prompt list.
The atom's job is to keep "make a plan first" in the system prompt so
non-trivial workflows don't skip the planning step.
