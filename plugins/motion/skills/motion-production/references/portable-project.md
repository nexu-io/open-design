# Portable HyperFrames template project

The deliverable is a native HyperFrames project, closest to an official `hyperframes:example`: editable HTML/CSS/JS and the assets needed to render it. It must work after unpacking in a different directory, without the creator's local catalog or plugin cache paths.

A useful layout (split scenes only when helpful):

```text
project/
  index.html
  compositions/
  assets/
  hyperframes.json
  TEMPLATE.md
  preview.mp4
  poster.jpg
```

`index.html` is the content authority. `hyperframes.json` is native runtime configuration, not a second description of the video. Preserve hidden Studio manifests if the project uses them. Bundle fonts and dependencies that the project actually needs; use project-relative references, not creator-machine paths or undeclared remote assets. Do not package runtime caches (including Studio `.thumbnails/`), node_modules, temporary measurement files, or the `AGENTS.md`/`CLAUDE.md` agent instructions that `hyperframes init` creates. Keep the folder to what renders the video plus `TEMPLATE.md`, `preview.mp4` and the cover. Do not re-encode `preview.mp4` to shrink it: it is the finished video delivered as-is for unchanged reuse. Store an extracted original soundtrack as AAC (`.m4a`), not uncompressed WAV. The comparison video is for human review only, so encode it for web playback (H.264, for example `-crf 28`) rather than at preview quality.

For a distributable package, use fonts/assets with documented redistribution permission and include required license files. A locally installed system font is not evidence of that permission. Prefer open-licensed fonts, such as Google Fonts families under SIL OFL, and bundle each with its license file. For Chinese text, declare a fallback chain such as the Latin font, then Noto Sans SC (Noto Serif SC for serif), then generic families, rather than bundling a system Chinese font. If permission is unconfirmed, replace it with an appropriate permitted font and regenerate affected previews, or identify the delivery as local-only with the unresolved dependency.

Include a preview MP4 from the delivered source and a representative cover for browsing. `TEMPLATE.md` identifies the entry, pinned HyperFrames version, exact tested preview/render commands, common editable content and known differences from the reference. Variables are shortcuts; agents may also edit native source. Neither fixed slots nor a custom `template.json` is required to read or render the project.

`TEMPLATE.md` is the single handoff note, mainly for the next agent and template producers: what to change (variable or source/asset entry and its layout/timing dependencies), differences from the original, the rebuild record (observations, named objects, choices) and check results. Organize it by meaningful objects or systems, not every decorative fragment. It is not a content schema or an editing whitelist. The user-facing editing surface is the root variables shown in the Studio Variables panel. Update or remove stale variable declarations after source edits.

For website/registry publication, add an official `registry-item.json` of type `hyperframes:example` using the schema and examples shipped with the pinned runtime. Its file list must include referenced source and assets. Follow that schema for preview metadata; do not invent a separate content schema. Registry publication and website upload are separate from making a usable project. The team's gallery/import integration owns discovery, categories and IDs.

Save the template folder and its same-named ZIP in the current workspace (the session's working directory), not in plugin caches, temporary or system data directories. The ZIP is the single delivery unit, including for cloud upload. Record reference provenance and verification results in `TEMPLATE.md`. Save the original-versus-template comparison video next to the ZIP as `<template-name>-comparison.mp4`, outside the package: it shows the reference footage, which must not be redistributed with the template. Do not put comparison videos, comparison screenshots or check data files in the package. Keep working files such as frame dumps, measurement scripts and intermediate renders out of the package. They describe what was tested; they do not drive rendering. Future video/audio/generated assets can use the native project media mechanisms; this phase guarantees Motion visuals only, not live-action generation or audio production.

The team gallery remains a separate integration. This Skill does not register projects or create a local template database. A previously delivered folder/ZIP is reusable directly even when it is not listed by the gallery.
