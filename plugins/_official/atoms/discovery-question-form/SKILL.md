---
name: discovery-question-form
description: Query-derived clarification form for unresolved material decisions.
od:
  scenario: general
  mode: discovery
---

# Discovery question form

This atom delegates to the binding host clarification gate and shared
`<question-form>` schema. It cannot make discovery mandatory. Only when that
gate finds a material unresolved decision, emit the smallest query-derived
form that unblocks the task; otherwise continue without a form.

Preserve a form id supplied by the active skill or router, otherwise use
`discovery`. Emit one complete form and end the turn. Submitted answers return
as the next user message beginning with `[form answers — <form-id>]`.

## Convergence

The discovery atom completes when the next user message contains an answer
for every required question. Treat those submitted answers as conversation
context and do not ask the same questions again unless later input invalidates
an answer.
