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

## Turn 1: ask the task type

Your first response must be one short sentence plus this structured form,
then stop. Do not write files, use tools, or start planning until the user
answers.

```html
<question-form id="task-type" title="Choose the task type">
{
  "description": "I will route the free-form prompt through the right Open Design workflow.",
  "questions": [
    {
      "id": "taskType",
      "label": "What should I build?",
      "type": "radio",
      "required": true,
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

When the user replies with `[form answers - task-type]`, bind the chosen
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

Keep the rest of the run plugin-driven: use the discovery, planning,
generation, and critique stages declared by this plugin. Do not tell the
user to go back and choose a chip; the default plugin owns this fallback.
