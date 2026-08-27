# Guizang presenter deploy path

> **v0.6.4 caveat:** these rules apply to the rendered HTML, not to the
> Humanize PPT production brief. The brief (`guizang-production-prompt.md`)
> tells the next agent to follow `guizang-ppt-skill/SKILL.md`; the presenter
> shell, deploy packaging, and post-processing are all downstream-skill
> responsibilities. Humanize does not produce or post-process the rendered
> HTML. See `docs/versions/v0.6.4-guizang-production-brief-orchestrator.md`.

Use this when the task is a Chinese PPT and the user wants a complete, presentable artifact rather than only an outline or draft deck.

## Default path

```text
Humanize PPT
  -> AST production contract
  -> guizang-ppt-skill Chinese stable deck
  -> material / visual QA
  -> presenter adapter
  -> static deploy package
```

## Presenter shell requirements

- Keep presenter mode as a post-processing adapter after the final deck exists.
- The presenter shell should not duplicate the visual renderer. It should provide current slide, next slide, speaker notes, timer, and slide navigation.
- Prefer `postMessage` control with message types:
  - `presenter-goto`
  - `presenter-next`
  - `presenter-prev`
  - `presenter-state-request`
  - `presenter-state`
- Keep `?slide=<n>` as a fallback for static hosts and older deck runtimes.

## Deploy requirements

- Publish only static files needed by the deck and presenter shell.
- Do not include Remotion `node_modules`, raw generation caches, or temporary run directories.
- Public samples should include a root `index.html` that links or redirects to the presenter entry and exposes the raw PPT path.

## QA checks

- The deck opens through the deployed URL.
- The presenter entry opens through the deployed URL.
- Clicking next updates both the presenter notes and the deck iframe.
- `notes.json`, `presenter_manifest.json`, and `render_report.md` exist.
- The deck still passes renderer-specific validation when such a validator exists.
