# Noto Sans Cyrillic subsets (vendored)

Self-hosted Cyrillic fallback for the Open Design web UI (#6478).

## Why these files exist

Albert Sans is the primary product face after #6142, but the bundled variable
TTF has no basic Russian Cyrillic glyphs. Without a same-origin fallback,
Russian UI text falls through to OS fonts (`PingFang SC` / `Microsoft YaHei` /
generic `sans-serif`) and becomes non-deterministic across platforms.

These four WOFF2 files are **Unicode-range limited** to Cyrillic scripts only.
Latin continues to resolve to Albert Sans because that family is listed first
and covers Latin code points.

## Assets

| File | Style | Subset | Size (bytes) |
|------|-------|--------|--------------|
| `noto-sans-cyrillic-wght-normal.woff2` | normal | cyrillic | 20080 |
| `noto-sans-cyrillic-wght-italic.woff2` | italic | cyrillic | 24976 |
| `noto-sans-cyrillic-ext-wght-normal.woff2` | normal | cyrillic-ext | 70680 |
| `noto-sans-cyrillic-ext-wght-italic.woff2` | italic | cyrillic-ext | 81936 |

Total: **197,672** bytes.

## Provenance

- Package: `@fontsource-variable/noto-sans@5.3.0`
- Upstream family: Noto Sans (Google Fonts / Noto Project)
- Source tree: https://github.com/google/fonts (via Fontsource variable build)
- License: SIL Open Font License 1.1 — see `OFL-NotoSans.txt`
- Vendored (not installed as an npm dependency) to match the existing
  checked-in Albert Sans / JiduMono Pro strategy and avoid lockfile churn.

## Unicode ranges (from Fontsource)

- **cyrillic:** `U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116`
  (covers the basic Russian alphabet including `Ё/ё`)
- **cyrillic-ext:** `U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F`

## CSS wiring

Declared in `apps/web/src/styles/base.css` as family `"Noto Sans"` with the
ranges above, then ordered in `tokens.css` immediately after Albert Sans:

```text
--sans: "Albert Sans", "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
```
