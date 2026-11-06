# `hallmark audit`

Read the file(s) the user pointed at. For each finding, return:

- **Tell** — the named anti-pattern from [`anti-patterns.md`](../anti-patterns.md).
- **Where** — file path and line range.
- **Severity** — `critical` (ships as slop), `major` (looks AI-generated), `minor` (small taste issue).
- **Fix** — one-line concrete correction.

Group by severity. Do not edit. Do not redesign. End with a count: `N critical · M major · K minor`.

Audit *also* checks structural fingerprint: if the page uses the AI template (centered hero, 3 equal feature cards, CTA, footer, with no asymmetry or surprise), flag it as a critical structural finding even if the visual treatment is fine.

**Stamp-vs-page check.** If the audited file contains a `/* Hallmark · macrostructure: <name> · ... */` stamp, verify the page actually matches that name. If the stamp says **Bento Grid** but the page is a centered single-column hero with a CTA, flag it as a critical structural finding: `stamp lies` — the stamp must reflect what shipped or be removed. This catches drift where a previous Hallmark run stamped one thing and a later edit pulled the page back toward the AI template.

**Genre-aware audit.** If the audited file's stamp names a genre (e.g. `genre: atmospheric`), apply the genre-scoped overrides from [`slop-test.md`](../slop-test.md) when grading. A radial-gradient background is a critical tell for editorial — but allowed for atmospheric. A pure-white paper is a tell for editorial — but allowed for modern-minimal. The audit verb must respect the genre the page declared.

**`design.md` audit.** If the project root has a `design.md` (or `DESIGN.md`), read it before grading. Then check every audited page against the system:

- **Theme drift.** Page uses tokens / fonts / accent that don't match `design.md`'s declared system → flag as `critical: design-system drift`. Per-page theme picks are slop on a system-managed project even if each page is internally fine.
- **Macrostructure family violation.** `design.md` says marketing pages use Marquee Hero or Stat-Led — the audited page is a Letter format → flag as `major: outside design.md family`.
- **Stamp mismatch.** The page's CSS stamp says `designed-as-app` but reads `design-system: design.md` and the page actually drifts from `design.md` → flag as `critical: stamp lies`. The stamp claims compliance the code doesn't deliver.
- **No stamp at all on a system-managed project** → flag as `major: missing system reference`. Every page on a `design.md` project must stamp its allegiance to the system.

Inversely, on a project *without* `design.md`, the standard diversification rule applies — flag pages that share macrostructure / theme with a previous Hallmark output as `minor: variety drift`.
