---
name: od-default
description: Hidden fallback scenario for free-form Home prompts. Ask the task type first, then continue through the matching Open Design flow.
od:
  scenario: default-router
  mode: scenario
---

# od-default (hidden scenario)

This plugin runs only when the user types a free-form Home prompt without
choosing one of the visible category chips. It is the design-engine
fallback, not a visible catalog entry.

## Turn 1: ask the task type and lock the brief

Your first response must be one short sentence plus this structured form,
then stop. Do not write files, use tools, or start planning until the user
answers. Localize every user-facing string to the user's chat language, but
keep ids, types, option values, and the ordered `taskType` options stable.
Prefill each question's `default` from the brief, including the `taskType`
option you recommend, so the user can submit the form unchanged.

```html
<question-form id="task-type" title="Choose the task type">
{
  "lang": "en",
  "description": "I'll route this through the right Open Design workflow and lock the brief in one shot. Prefilled for you — send as is, or adjust first.",
  "questions": [
    {
      "id": "taskType",
      "label": "What should I build?",
      "type": "radio",
      "required": true,
      "allowCustom": false,
      "options": [
        "Prototype",
        "Live artifact",
        "Slide deck",
        "Image",
        "Video",
        "HyperFrames",
        "Audio",
        "Other"
      ]
    },
    {
      "id": "audience",
      "label": "Who is this for?",
      "type": "text",
      "placeholder": "Target user, buyer, viewer, or audience..."
    },
    {
      "id": "brand",
      "label": "Brand context",
      "type": "radio",
      "options": [
        { "label": "Pick a direction for me", "value": "pick_direction" },
        { "label": "I have a brand spec — I'll share it", "value": "brand_spec" },
        { "label": "Match a reference site / screenshot — I'll attach it", "value": "reference_match" }
      ]
    },
    {
      "id": "scale",
      "label": "Roughly how much?",
      "type": "text",
      "placeholder": "e.g. 8 slides, 1 landing + 3 sub-pages, 4 mobile screens, 30s video"
    },
    {
      "id": "speakerNotes",
      "label": "For slide decks, include speaker notes?",
      "type": "switch",
      "defaultValue": true
    },
    {
      "id": "constraints",
      "label": "Any important constraints?",
      "type": "textarea",
      "placeholder": "Audience, brand, format, length, aspect ratio, references, things to avoid..."
    }
  ]
}
</question-form>
```

## After the answer

When the user replies with `[form answers — task-type]`, bind the chosen
task type as authoritative and continue:

- `Prototype`: run the normal new-generation prototype flow.
- `Live artifact`: create a live HTML/CSS/JS artifact and register it for
  preview when tooling is available.
- `Slide deck`: follow the deck workflow and framework rules.
- `Image`: plan a concrete image prompt, then use the OD media generation
  CLI for image output.
- `Video`: plan shots, duration, aspect, and motion, then use the OD media
  generation CLI for video output.
- `HyperFrames`: create HTML-driven motion frames or a HyperFrames-ready
  motion artifact before rendering/exporting.
- `Audio`: plan voice/music/SFX intent, then use the OD media generation
  CLI for audio output.
- `Other`: ask only the minimum follow-up needed, then choose the closest
  Open Design workflow and continue.

This single form already locks the discovery brief. Do not emit a second
`<question-form id="discovery">`; proceed directly to the matching planning,
generation, and critique stages. Do not tell the user to go back and choose a
chip; the default plugin owns this fallback.
