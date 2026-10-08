---
name: discovery-question-form
description: Structured clarification form for unresolved material requirements.
od:
  scenario: general
  mode: discovery
---

# Discovery question form

This atom defines the `<question-form>` protocol. It does not decide whether
clarification is required. Follow the active skill and core prompt's
requirements-clarification policy. When they identify unresolved information
that would materially change the design direction, content structure, or
delivery format, surface the smallest possible set of questions that unblocks
the workflow.

The questions are rendered as a `<question-form>` artifact inline in the
originating assistant message. This is assistant text parsed by the host, not a
plugin GenUI surface or a native tool call. Submitted answers return as the
next user message, beginning with `[form answers — <form-id>]`.

## Activation boundary

- A first turn or new project does not by itself require a form.
- A `discovery` pipeline stage only makes this protocol available; declaring
  or entering the stage does not trigger a form.
- Missing metadata is not automatically a question. First use the request,
  conversation, plugin inputs, memory, active skill, and design system.
- If enough information is available to proceed safely, do not emit a form.
- If a material blocker remains, ask only for that unresolved information.

## Emission shape

Emit the form as a `question-form` block whose body is a JSON object with a
top-level `questions` array. Do not emit a bare question object by itself; the
renderer only recognizes the wrapped form contract.

The example below shows field shapes, not a fixed questionnaire. Include only
unresolved questions and derive their recommendations from the actual brief;
these example values are not fallback answers. A reference file remains
unanswered until supplied.

```html
<question-form id="discovery" title="Quick brief — 30 seconds">
{
  "description": "I'll lock these in before building. Skip what doesn't apply — I'll fill defaults.",
  "questions": [
    {
      "id": "audience",
      "label": "Who's the primary audience?",
      "type": "checkbox",
      "default": ["Customer"],
      "options": ["VC", "Customer", "Internal team"],
      "maxSelections": 2,
      "required": true
    },
    {
      "id": "format",
      "label": "Which format should I use?",
      "type": "radio",
      "default": "landscape",
      "options": [
        { "label": "Portrait", "value": "portrait" },
        { "label": "Landscape", "value": "landscape" }
      ]
    },
    {
      "id": "language",
      "label": "Which language should the promo use?",
      "type": "select",
      "default": "en",
      "options": [
        { "label": "Chinese", "value": "zh-CN" },
        { "label": "English", "value": "en" },
        { "label": "French", "value": "fr" },
        { "label": "German", "value": "de" },
        { "label": "Japanese", "value": "ja" },
        { "label": "Spanish", "value": "es" }
      ]
    },
    {
      "id": "reference",
      "label": "Add a reference file if available",
      "type": "file",
      "required": false
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
  `email`, `tel`, `file`, or `switch`.
- `default`: the recommended answer inferred from the brief, project metadata,
  plugin inputs, and known context. Use an option's stable `value` for `radio`
  or `select`, an array of option values for `checkbox`, and concrete suggested
  text for free-text fields. String options use the exact option string as
  their value. Respect `maxSelections`; never substitute localized labels for
  stable values. The host also accepts the `defaultValue` alias; emit only one
  of these fields per question.
- Prefill each non-visual question suitable for a recommendation; omit `default` only when no reasonable recommendation exists, such as a file upload.
  Do not invent a missing fact or select the first option merely because it is
  first. A recommendation written only in `description` does not preselect an
  answer: encode it in the default field. Place that field before `options` so
  it arrives before a long option list during streaming.
- `options`: required for choice controls; strings are
  allowed, or objects with localized `label` and stable `value`.
- At most 6-7 options per question; merge near-duplicates instead of listing more.
- Choose `radio` vs `select` by option count, not importance: `radio` for a short list, `select` once it runs long (languages, timezones, voices). `checkbox` is always a plain list.
- `select` options may carry `group` (first group expands, the rest collapse) and `trailingLabel` (a short end-of-row code such as `ZH-CN`). Both optional.
- Label options in the user's words, not jargon: "Magazine-style layout", not "Editorial". Reword only `label`; never change a stable `value`.
- Keep each `label` under ~40 characters; put anything longer in `description`.
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
