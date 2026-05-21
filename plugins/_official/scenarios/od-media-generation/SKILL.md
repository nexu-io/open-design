---
name: od-media-generation
description: Default reference pipeline for image, video, and audio projects — routes through media-image / media-video / media-audio atoms based on the project kind, wraps the output in a live artifact, and devloops on critique-theater until the score converges.
od:
  scenario: media-generation
  mode: scenario
---

# od-media-generation (scenario)

This scenario plugin is the bundled default for projects whose
`metadata.kind` is `image`, `video`, or `audio`. The web client and the
daemon both look up `defaultScenarioPluginIdForKind(kind)` from
`@open-design/contracts` and, when no other plugin is applied, bind
this scenario at project / run creation time.

## Default pipeline

```jsonc
{
  "stages": [
    { "id": "discovery", "atoms": ["discovery-question-form"] },
    { "id": "plan",      "atoms": ["todo-write"] },
    { "id": "generate",  "atoms": ["media-image", "media-video", "media-audio", "live-artifact"] },
    {
      "id": "critique", "atoms": ["critique-theater"],
      "repeat": true,
      "until": "critique.score>=4 || iterations>=3"
    }
  ]
}
```

The `generate` stage lists all three media atoms even though a single
run only calls one of them. Picking the right atom is the agent's job:

- `metadata.kind === 'image'` → `media-image`
- `metadata.kind === 'video'` → `media-video`
- `metadata.kind === 'audio'` → `media-audio`

If the user picks this plugin manually without a media-typed project,
prefer `media-image` and explain the assumption in the first reply.

## Atom call shape

Every media atom takes the same kernel of inputs and returns a media
artifact reference that `live-artifact` can wrap:

- `prompt` — the rendered `useCase.query` after input substitution.
- `aspect` — one of `1:1` / `16:9` / `9:16` / `4:3` / `3:4`. Default
  `16:9`. The contracts `MediaAspect` union enumerates the legal
  values.
- `provider` — left blank by default so the daemon picks the user's
  configured provider for this media kind (see Settings → Media). Only
  set this when the user names a provider explicitly.

After the media atom returns:

1. Save the binary into `<cwd>/media/<timestamp>.<ext>`.
2. Call `live-artifact` to register a preview surface pointing at the
   saved file. The preview is what the user sees in the right pane.

## Critique loop

`critique-theater` reads the artifact, scores it across the standard
five dimensions, and emits a `critique.score` signal. The `until`
clause stops the loop at score ≥ 4 or three iterations, whichever
comes first. Use the critique notes to drive the next media call's
prompt, not to re-pick the media atom.

## Replace, do not extend

Enterprise editions that need a different default for media work
should ship a sibling scenario plugin and add the right mapping in
`@open-design/contracts/scenario-defaults`, not patch this manifest.
