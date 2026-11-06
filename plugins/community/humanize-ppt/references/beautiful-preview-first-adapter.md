# Beautiful Preview-First Adapter Notes

Use this when Humanize PPT routes a deck to `beautiful-html-templates` for style exploration.

## Version boundary

Treat real Beautiful preview generation as **V0.3+**, not a V0.2 patch.

- V0.2 Router Edition: AST contracts, renderer routing, bounded commands, manifest, QA.
- V0.3 Preview-First Edition: reads `beautiful-html-templates/index.json`, selects 3 candidates, and writes real HTML preview artifacts plus manifest/report.

If a task moves a renderer from `planned` command output to real artifact generation, bump the visible capability/version rather than describing it as a minor doc update.

## Adapter workflow

1. Load or locate `beautiful-html-templates`.
   - Prefer explicit `--beautiful-repo /path/to/beautiful-html-templates` when provided.
   - Otherwise detect local installs/cache before attempting an auto-clone.
2. Read `index.json` and score templates using `mood`, `tone`, `occasion`, `best_for`, `density`, `scheme`, and the Humanize PPT brief.
3. Pick 3 distinct candidates; avoid three near-identical editorial choices unless the user explicitly wants that.
4. For each candidate:
   - read the template `template.html`;
   - extract the first cover/title slide only;
   - replace placeholder title/subtitle/kicker with the real deck topic and first-slide message;
   - keep/copy sibling assets and `runtime/deck-stage.js` so the preview opens standalone;
   - write `outputs/beautiful/previews/NN-<slug>/index.html`.
5. Write `outputs/beautiful/previews/index.html` as the gallery.
6. Write `outputs/beautiful/preview_manifest.json` with selected templates, scores, reasons, and paths.
7. Mark the `beautiful-html-templates` route status as `rendered` in `router_plan.json`.
8. QA must treat preview render failure as a blocking issue.

## Tests to keep

A minimal regression suite should assert:

- template selection returns 3 distinct candidates;
- preview HTML contains the real title/subtitle;
- preview HTML contains exactly one slide/section;
- copied assets include `deck-stage.js` when the template depends on it;
- missing Beautiful repo returns a safe `missing-library` status instead of crashing;
- manifest/router versions match the public skill version.

## Pitfalls

- Do not only write `commands/beautiful-agent.md` and call the path connected. Preview-first means real HTML files exist.
- Do not let Beautiful consume raw noisy source directly; Humanize PPT still owns AST cleanup and production contracts first.
- Do not mix slides from multiple Beautiful templates in one preview. Each candidate preview should preserve one closed visual system.
- Do not hardcode session-specific output paths into docs; document relative output structure and show example commands.
