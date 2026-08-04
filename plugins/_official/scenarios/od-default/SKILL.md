---
name: od-default
description: Hidden fallback scenario for free-form Home prompts. Infer the task type and ask only when routing is materially ambiguous.
od:
  scenario: default-router
  mode: scenario
---

# od-default (hidden scenario)

This plugin runs only when the user types a free-form Home prompt without
choosing one of the visible category chips. It is the design-engine
fallback, not a visible catalog entry.

## Route first; clarify only when needed

Infer the task type from the user's brief and known conversation context.
When one route is reasonably clear, bind it and continue directly to that
Open Design flow. A free-form Home prompt, a first turn, or the presence of a
discovery stage does not by itself require a question form.

Emit the form below only when two or more routes remain materially plausible
and choosing the wrong one would change the delivery format. Localize every
user-facing string to the user's chat language, but keep ids, types, option
values, and the ordered `taskType` options stable. Set `defaultValue` to the
stable value of the route you recommend so the user can submit unchanged; the
example below recommends `prototype`, but replace it with the inferred route
value before emission. You may add at most two other unanswered questions, and
only when their answers are also required before useful work can begin; never
restore a fixed discovery checklist.

```html
<question-form id="task-type" title="Choose the task type">
{
  "lang": "en",
  "description": "I need one routing decision before I build. The recommended option is preselected.",
  "questions": [
    {
      "id": "taskType",
      "label": "What should I build?",
      "type": "radio",
      "required": true,
      "allowCustom": false,
      "defaultValue": "prototype",
      "options": [
        { "label": "Prototype", "value": "prototype" },
        { "label": "Live artifact", "value": "live_artifact" },
        { "label": "Slide deck", "value": "slide_deck" },
        { "label": "Image", "value": "image" },
        { "label": "Video", "value": "video" },
        { "label": "HyperFrames", "value": "hyperframes" },
        { "label": "Audio", "value": "audio" },
        { "label": "Other", "value": "other" }
      ]
    }
  ]
}
</question-form>
```

## After the answer

When the user replies with `[form answers — task-type]`, bind the chosen task
type as authoritative, match the stable `[value: ...]` token rather than the
localized label, and continue:

- `prototype` (`Prototype`): run the normal new-generation prototype flow.
- `live_artifact` (`Live artifact`): create a live HTML/CSS/JS artifact and register it for
  preview when tooling is available.
- `slide_deck` (`Slide deck`): follow the deck workflow and framework rules.
- `image` (`Image`): plan a concrete image prompt, then use the OD media generation
  CLI for image output.
- `video` (`Video`): plan shots, duration, aspect, and motion, then use the OD media
  generation CLI for video output.
- `hyperframes` (`HyperFrames`): create HTML-driven motion frames or a HyperFrames-ready
  motion artifact before rendering/exporting.
- `audio` (`Audio`): plan voice/music/SFX intent, then use the OD media generation
  CLI for audio output.
- `other` (`Other`): ask only the minimum follow-up needed, then choose the closest
  Open Design workflow and continue.

Do not automatically emit a second `<question-form id="discovery">` after the
route answer. Continue with the submitted answer and all existing context.
Ask again later only if a new, genuinely blocking ambiguity appears. Do not
tell the user to go back and choose a chip; the default plugin owns this
fallback.
