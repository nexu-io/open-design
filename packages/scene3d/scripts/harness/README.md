# Viewer harness

Look at the viewer instead of guessing about it.

The kit viewer ships as generated HTML, which means the only way to judge
its design used to be compiling a real scene, opening the app, and
squinting. That is slow enough that it does not happen, and the result was
a rail that reserved a third of the panel to list eight short words.

This renders the **real** `renderKitHtml` output across the states that
matter and screenshots each one, so viewer changes can be iterated visually
in seconds.

```bash
pnpm --filter @open-design/scene3d build      # the harness reads dist/
node scripts/harness/build-fixtures.mjs       # writes .out/*.html
node scripts/harness/shoot.mjs                # writes .shots/*.png
```

Flags: `--browser firefox`, `--only full`.

## Fixtures

| Name | What it proves |
|---|---|
| `single` | The common case. Rail auto-hides; the model owns the viewport. |
| `full` | 16 assets in 3 groups. Density, grouping, scroll fade. |
| `long` | Names that must ellipsize rather than widen the rail. |
| `failing` | Failure dot on the row, issue codes in the identity chip. |
| `empty` | A project with nothing compiled yet. |

Each is shot at three viewports: `panel` (780×720, the app's right pane),
`wide` (1280×800), and `narrow` (560×760).

Fixtures are served over HTTP rather than `file://` because the page
fetches its mesh; a file origin blocks that and every shot would capture
the error state instead of the design.

`.out/` and `.shots/` are generated and git-ignored.
