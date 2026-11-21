# Live artifact gallery preview

`example.html` is the rendered sample from
`templates/live-artifacts/otd-operations-brief/index.html` (template + illustrative
sample data). It demonstrates a data-backed operations report; the figures are
not connected to a real account or a live feed.

Keep this plugin-local copy when updating the preview: gallery preview requests
can only serve files inside the plugin folder. To update it, regenerate the
operations brief as described in its README, then copy its rendered `index.html`
here as `example.html`. No agent run or connector login is needed to preview it.

`SKILL.md` continues to describe live artifact creation. Its project `index.html`
is daemon-derived output, separate from this bundled gallery sample.
