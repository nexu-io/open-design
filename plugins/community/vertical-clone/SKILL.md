---
name: vertical-clone
description: Faithful visual clone of the vertical.framer.media editorial portfolio — a 14-section dark/green long-scroll site with self-hosted Figtree + Fragment Mono fonts, real photography, and Lenis smooth scroll.
od:
  kind: skill
  mode: scenario
---

# vertical-clone

A faithful visual clone of **vertical.framer.media** — Adam Knoxville's editorial
portfolio, built on Framer. The original is a long-scroll narrative with a giant
stacked green `VERTICAL` wordmark, a portrait hero, a manifesto, a video-background
statement block, a five-category archive list, a studio-chat video, and a 3-column
About. This plugin packages that finished clone so it can be installed into
**My plugins** and submitted to the Open Design community catalog.

## What's in the plugin

- `SKILL.md` — this file (agent behavior + workflow).
- `open-design.json` — plugin metadata derived from the project's `*.artifact.json`,
  `NOTES.md`, and the generated `index.html` / `styles.css`.
- `examples/vertical-clone/` — the rendered artifact: `index.html`, `styles.css`,
  and the full `assets/` tree (42 photos, 3 videos, 61 self-hosted woff2 fonts,
  Lenis CSS/JS) harvested from the real site. Self-contained and openable in any
  browser / OD preview pane.

## Agent behavior

When invoked, the agent should:

1. **Inspect the project for the source of truth.** Read `*.artifact.json`
   (task kind `html`, renderer `html`, entry `index.html`), `NOTES.md`
   (complexity L5, faithful-visual-clone mode), and the generated artifacts.
   Derive the plugin id, title, description, tags, and example output path from
   what is already present — do not re-ask the user for fields the files answer.
2. **Reproduce the design system from the cloned values.** Bind the recon-derived
   tokens verbatim: `--bg: #050609`, `--green: #81ff28`, Figtree (display/body)
   + Fragment Mono / IBM Plex Mono (mono), Lenis 1.3.23 inertia scroll, film-grain
   overlay, two breakpoints at 980px / 620px.
3. **Use real assets, never placeholders.** All 107 harvested assets live under
   `assets/` — reference them by relative path. No gradients, SVG, or emoji stand
   in for photography.
4. **Keep the clone honest.** Document in `NOTES.md` the known gaps: Framer
   badge, tracking scripts, and the "Get Template" CTA are intentionally omitted;
   scroll-snap / hover micro-interactions are CSS approximations of Framer's SPA
   behavior. The source is a proprietary Framer template — this is a local
   learning clone; replace branding/contact before any public deploy.
5. **Package & validate.** Copy the most recent generated artifact into
   `examples/`, write `open-design.json` + this `SKILL.md`, then run
   `od plugin validate`, `od plugin pack`, and `od plugin install --source <folder>`.

## Running the example

```bash
# From the project root (or the extracted plugin folder's examples/vertical-clone):
python3 -m http.server 8099
# Open http://127.0.0.1:8099/index.html
```

## License / attribution

The original site is a proprietary Framer template (Adam Knoxville, "Vertical").
This clone is a visual-recreation exercise for local learning — do not publicly
redeploy without the author's permission or replacing the branding with your own.
