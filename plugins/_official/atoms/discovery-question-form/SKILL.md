---
name: discovery-question-form
description: Turn-1 discovery question form for ambiguous briefs.
od:
  scenario: general
  mode: discovery
---

# Discovery question form

When the user's brief is ambiguous, the agent's first turn must surface
the smallest possible set of clarifying questions that unblock the rest
of the workflow. The questions are rendered as a structured form
(GenUI surface kind: `form`, persist tier: `conversation` so a follow-
up turn doesn't re-ask).

## When to fire

- Brief is missing audience, target medium, or core intent.
- Brief explicitly invites questions ("ask me anything if unclear").
- The discovery skill or pipeline declares a `discovery` stage.

## Question shape (as the agent emits one)

```jsonc
{
  "id": "audience",
  "label": "Who's the primary audience?",
  "type": "checkbox",      // or 'radio' | 'text' | 'number'
  "options": ["VC", "Customer", "Internal team"],
  "maxSelections": 2,
  "required": true
}
```

## Convergence

The discovery atom completes when every required question has an answer
in `genui_surfaces` for the current conversation. The agent should not
loop back to discovery after that — the same surface id renders cached
on the next turn.
