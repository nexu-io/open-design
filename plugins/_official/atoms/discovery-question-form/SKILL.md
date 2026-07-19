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
of the workflow. The questions are rendered as a `<question-form>` artifact
inline in the originating assistant message. This is assistant text parsed by
the host, not a plugin GenUI surface or a native tool call. Submitted answers
return as the next user message, beginning with
`[form answers — <form-id>]`.

## When to fire

- Brief is missing audience, target medium, or core intent.
- Brief explicitly invites questions ("ask me anything if unclear").
- The discovery skill or pipeline declares a `discovery` stage.

## Emission shape

Emit the form as a `question-form` block whose body is a JSON object with a
top-level `questions` array. Do not emit a bare question object by itself; the
renderer only recognizes the wrapped form contract.

```html
<question-form id="discovery" title="Quick brief — 30 seconds">
{
  "description": "I'll lock these in before building. Skip what doesn't apply — I'll fill defaults.",
  "questions": [
    {
      "id": "audience",
      "label": "Who's the primary audience?",
      "type": "checkbox",
      "options": ["VC", "Customer", "Internal team"],
      "maxSelections": 2,
      "required": true
    }
  ]
}
</question-form>
```

## Question object shape

Each entry in the top-level `questions` array uses:

- `id`: stable answer key, for example `audience`.
- `label`: user-facing question copy.
- `type`: one of `radio`, `checkbox`, `select`, `text`, `textarea`,
  `number`, `range`, `date`, `time`, `datetime-local`, `color`, `url`,
  `email`, `tel`, `file`, `switch`, or `direction-cards`.
- `options`: required for choice controls; strings are allowed, or objects with
  localized `label` and stable `value`.
- `allowCustom`: leave unset or set to `true` for finite-choice controls so
  users can type their own answer instead of accepting only generated options.
  Set `allowCustom: false` only when the downstream system needs an exact
  machine id.
- `customLabel` / `customPlaceholder`: optional localized copy for that custom
  answer input.
- `maxSelections`: include this for checkbox controls with a limited selection
  count.
- `required`: set to `true` only when the answer is needed before work can
  continue.

## Convergence

The discovery atom completes when the next user message contains an answer
for every required question. Treat those submitted answers as conversation
context and do not ask the same questions again unless later input invalidates
an answer.
