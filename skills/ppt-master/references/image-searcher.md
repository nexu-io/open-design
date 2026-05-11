> See [`image-base.md`](./image-base.md) for the common framework. Technical SVG/PPT constraints are in [`shared-standards.md`](./shared-standards.md).

# Image_Searcher Reference Manual

Role definition for the **web image acquisition path**: translate Strategist intent into keyword queries, search openly-licensed providers, download a license-cleared image into `project/images/`, and record provenance + license metadata into `image_sources.json`.

**Trigger**: resource list rows with `Acquire Via: web`. The role is loaded only when at least one such row exists.

---

## 1. License Tier Discipline

Every accepted image is classified into one of two tiers. Anything else is rejected outright.

| Tier | Licenses | On-slide attribution |
|---|---|---|
| `no-attribution` | CC0, Public Domain, Pexels License, Pixabay Content License | None |
| `attribution-required` | CC BY, CC BY-SA | Inline credit `<text>` on the slide |

**Forbidden — auto-rejected licenses**:

- CC BY-NC, CC BY-NC-SA (non-commercial)
- CC BY-ND, CC BY-NC-ND (no derivatives)
- All Rights Reserved
- Unknown / missing license

> `license_tier` is the central abstraction. Downstream consumers (Executor) read this single field and never interpret raw license strings.

---

## 2. Search Strategy

Default: quality-first across all allowed license tiers. Do not prefer CC0 / Public Domain over a better CC BY / CC BY-SA image; rely on the manifest's `license_tier` so Executor can add attribution only when needed.

```
Default: provider chain, license filter = cc0,pdm,pexels,pixabay,cc by,cc by-sa
         → rank candidates across providers; first downloadable ranked hit wins.
Strict:  provider chain, license filter = cc0,pdm,pexels,pixabay
         → fail if no no-attribution image can be downloaded.
```

`--strict-no-attribution` is opt-in. Use it only when the deck cannot tolerate any on-slide credit (corporate template, full-bleed hero).

---

## 3. Providers

| Provider | Config | Strength |
|---|---|---|
| Openverse | zero-config | fallback aggregator: Wikimedia + Flickr + museums + rawpixel |
| Wikimedia Commons | zero-config | educational, scientific, geographic, historical |
| Pexels | recommended: `PEXELS_API_KEY` (free, [signup](https://www.pexels.com/api/)) | modern stock photography, people, workplace, lifestyle |
| Pixabay | recommended: `PIXABAY_API_KEY` (free, [signup](https://pixabay.com/api/docs/)) | broad type coverage including photos and illustrations |

Default chain (when `--provider` is unset):

```
openverse → wikimedia → pexels (if PEXELS_API_KEY set) → pixabay (if PIXABAY_API_KEY set)
```

Keyed providers without an API key are silently skipped — not an error.

**Validation**: For polished visual decks, configure at least one keyed provider before using `Acquire Via: web`.

---

## 4. Intent → Query Translation

Web image APIs match keywords against image metadata, not semantic embeddings. `simplify_query` automatically:

1. Strips HEX color codes (`#1E3A5F`) and parentheticals (`(corporate vibe)`)
2. Drops hard-noise words: brand names, generic filler
3. Drops soft-noise words (`ai`, `tech`, `platform`, `professional`, `editorial`, `photo`, `background`) — only when concrete nouns remain
4. Caps at 4 words
5. **Fail-open**: if filtering empties the query, return the original

Then `build_query_progression` tries: original → simplified (4 words) → simplified (3 words). First non-empty hit wins.

**Per-row web Reference grammar**:

| Segment | Rule |
|---|---|
| Subject | Use 1-2 concrete nouns only: `offshore wind farm`, `Xiamen skyline`, `boardroom meeting` |
| Quality cues | **DO NOT ADD QUALITY CUES** like `professional editorial photography` or `clean composition`. These APIs use exact keyword matching; adding long adjectives will result in 0 matches. |
| Language | For Chinese landmarks: use precise Chinese names (e.g., `磁器口古镇`) if specifically targeting `--provider wikimedia`. For general stock providers (Pexels/Pixabay), use simple English nouns (e.g., `Chongqing Jiefangbei`); do NOT use complex Chinese sentences or overly long English descriptive strings which fail on these platforms. |

**Forbidden — web negative prompts**: `not tourist snapshot`, `no amateur photo`, `avoid low quality`.

> Note: Keyword APIs search negative words literally.

| ✅ Good Reference (intent) | ❌ Avoid |
|---|---|
| "Offshore wind farm at dusk, aerial view, professional editorial photography" | "professional editorial photography background" |
| "Diverse engineering team collaborating around a laptop, modern office, natural light" | "use Openverse, search 'team'" |
| "Sunlit forest path in autumn, clean composition, high-resolution photography" | "Hero image, dramatic lighting" |

---

## 5. Running `image_search.py`

```bash
python3 scripts/image_search.py "<query>" \
  --filename <name>.jpg \
  --slide <slide_id> \
  --orientation landscape \
  --purpose background \
  -o <project_path>/images
```

| Parameter | Required | Default | Description |
|---|---|---|---|
| `query` | yes | — | Positional. Pre-simplification not necessary; CLI runs `simplify_query` internally. |
| `--filename` | yes | — | Output filename matching the resource list |
| `-o / --output` | no | `.` | Output directory; manifest defaults to `<output>/image_sources.json` |
| `--slide` | no | `""` | Slide ID from resource list (recorded in manifest) |
| `--purpose` | no | `""` | `background` / `hero` / `side` / `accent` |
| `--orientation` | no | `any` | `any` / `landscape` / `portrait` / `square` |
| `--provider` | no | (chain) | Pin one provider |
| `--strict-no-attribution` | no | off | Restrict to no-attribution licenses; refuse CC BY / CC BY-SA |
| `--manifest` | no | (default) | Override manifest path |

**Pacing (mandatory)**: one search at a time. Wikimedia/Openverse expect identifying User-Agent and reasonable rate (~1 req/sec). Default pacing is fine.

---

## 6. Manifest Format (`image_sources.json`)

Every successful download appends or replaces one entry keyed on `filename`:

```json
{
  "license_verification": "provider metadata used; manual review recommended for external delivery",
  "generated_at": "2026-05-01T12:17:59.856275Z",
  "items": [
    {
      "filename": "team.jpg",
      "slide": "03_team",
      "purpose": "Leadership photo",
      "search_query": "executive boardroom meeting",
      "orientation": "landscape",
      "provider": "openverse",
      "stage": "all",
      "title": "Untitled",
      "author": "",
      "source_page_url": "https://www.rawpixel.com/...",
      "download_url": "https://...",
      "license_name": "CC0",
      "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
      "license_tier": "no-attribution",
      "attribution_required": false,
      "width": 1024,
      "height": 683,
      "metadata_dimensions": {
        "width": 4800,
        "height": 3200,
        "note": "upstream-reported size; actual downloaded file is smaller (likely a preview)"
      },
      "attribution_text": "team.jpg — \"Untitled\" via Openverse — license: CC0 (...)",
      "status": "sourced"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `width` / `height` | Measured from the file actually saved to disk. Use these for layout. |
| `metadata_dimensions` | Present only when upstream-claimed size differs from the saved file (preview vs original). Informational only. |
| `license_tier` | Drives Executor's attribution decision. Only `no-attribution` / `attribution-required`. |
| `attribution_required` | Boolean alias of `license_tier == "attribution-required"`. |
| `attribution_text` | Pre-rendered canonical credit string. **Use as-is; do not regenerate.** |
| `stage` | `all` by default, or `no-attribution-only` when strict mode is used. |

> Manifest is **idempotent on `filename`**. Rerunning the CLI replaces that entry; other entries are preserved.

---

## 7. On-Slide Attribution — Visual Specification

Applied by Executor when an image's `license_tier == "attribution-required"`. Three layouts depending on the page.

### 7.1 Single-image page

- **Position**: bottom-right of the image's container, hugging the image edge (within ~8 px)
- **Font size**: 6–8pt equivalent (≈ 0.7–1 % of canvas short edge)
- **Color**: `#999` on light/photo backgrounds; `rgba(255,255,255,0.6)` on dark/photo
- **Content**: `© {author} / {provider_short} / {license_short}`
  - `provider_short`: `Openverse` / `Wikimedia` / `Pexels` / `Pixabay`
  - `license_short`: `CC BY 4.0` / `CC BY-SA 4.0` / `Public Domain`
  - Drop empty fields (CC0 with no author → `via Openverse`)

**Forbidden — fields that break the visual line**: full URLs, `attribution_text` verbatim, "License:" prefix.

### 7.2 Multi-image page (≥ 2 attribution-required)

Combine into one source line at the page bottom rather than scattering credits:

```
Sources: a, b via Wikimedia (CC BY); c via Openverse (CC BY-SA)
```

Use single-letter labels (a/b/c) only when needed for disambiguation.

### 7.3 Hero / full-bleed image

- Bottom 1.5 cm gradient overlay: transparent → `rgba(0,0,0,0.5)`
- 7pt white semi-transparent text inside the overlay band, right-aligned ~24 px from edge

### 7.4 Source for the credit text

Use `attribution_text` from the manifest as the **starting point**. Compress for the small-text constraint:

| Manifest | Slide credit |
|---|---|
| `team.jpg — "Untitled" via Openverse — license: CC0 (...)` | `via Openverse / CC0` |
| `team.jpg — "Sunset" by Jane Doe via Wikimedia Commons — license: CC BY-SA 4.0 (...)` | `© Jane Doe / Wikimedia / CC BY-SA 4.0` |

---

## 8. Failure Handling (web-specific)

Extends [`image-base.md`](./image-base.md) §6.

| Situation | Behavior |
|---|---|
| No candidates from any provider in either stage | Mark row `Needs-Manual`. Suggest: shorter query, drop `--strict-no-attribution`, or set keyed provider's API key. |
| Single candidate fails to download (HTTP 403/404) | Dispatcher auto-falls through to the next ranked candidate. No user action. |
| All candidates from one provider fail | Dispatcher moves to the next provider in the chain. |
| Keyed provider has no API key | Silently skipped. Not an error. |

CLI exit: `0` on success, `1` only when no acceptable image was found across the entire dispatch matrix.

---

## 9. Handoff with Strategist

Reference field is **intent description**, not a query. See [`image-base.md`](./image-base.md) §8 for the rule.

If the description is verbose, that's fine — `simplify_query` handles it.

---

## 10. Handoff with Executor

Executor reads `image_sources.json` per slide that uses a Sourced image. For each entry:

| `license_tier` | Slide-level action |
|---|---|
| `no-attribution` | Embed `<image>` only |
| `attribution-required` | Embed `<image>` **and** an inline credit element per §7 |

Executor does not interpret raw license strings — `license_tier` is sufficient.

`svg_quality_checker.py` verifies this handoff before post-processing: if an attribution-required image is referenced without visible `CC BY` / `CC BY-SA` credit text, the SVG fails the quality gate.

---

## 11. Task Completion Checkpoint

In addition to the shared checkpoint in [`image-base.md`](./image-base.md) §10:

- [ ] Every web row has a downloaded file at `project/images/<filename>` OR is marked `Needs-Manual`
- [ ] Each `Sourced` row has a manifest entry with valid `license_tier` and non-empty `attribution_text`
- [ ] Any `attribution-required` image has visible inline credit text in the corresponding SVG
- [ ] `metadata_dimensions` warnings surfaced when downloaded preview is much smaller than upstream-claimed size
- [ ] `Needs-Manual` rows include the failure reason
