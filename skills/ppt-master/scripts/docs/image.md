# Image Tools

> Architecture rationale (why provider-specific config keys instead of a generic `IMAGE_API_KEY`, why permissive license filter with strict-mode escape hatch, why external refs in dev but two divergent embedding strategies for delivery): see [docs/technical-design.md "Image Acquisition & Embedding"](../../../../docs/technical-design.md#image-acquisition--embedding).

Image tools cover prompt-based AI generation, web image search, image inspection, and Gemini watermark removal.

## `image_gen.py`

Unified image generation entry point.

```bash
python3 scripts/image_gen.py "A modern futuristic workspace"
python3 scripts/image_gen.py "Abstract tech background" --aspect_ratio 16:9 --image_size 4K
python3 scripts/image_gen.py "Concept car" -o projects/demo/images
python3 scripts/image_gen.py "Beautiful landscape" -n "low quality, blurry, watermark"
python3 scripts/image_gen.py --list-backends
```

Backends are grouped into Core / Extended / Experimental tiers. Run `python3 scripts/image_gen.py --list-backends` for the current list.

Backend selection:

```bash
python3 scripts/image_gen.py "A cat" --backend openai
python3 scripts/image_gen.py "A cinematic portrait" --backend minimax
python3 scripts/image_gen.py "A product launch hero image" --backend qwen
python3 scripts/image_gen.py "科技感背景图" --backend zhipu
python3 scripts/image_gen.py "A product KV in cinematic style" --backend volcengine
```

Configuration sources:

1. Current process environment variables
2. First `.env` found in this order:
   - Current working directory
   - Clone repo root
   - `~/.ppt-master/.env`

The active backend must always be selected explicitly via `IMAGE_BACKEND`.

Example `.env`:

```env
IMAGE_BACKEND=openai
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-image-2
# OPENAI_BASE_URL=http://127.0.0.1:3000/v1   # optional proxy
# OPENAI_OUTPUT_FORMAT=png                   # png / jpeg / webp
# OPENAI_OUTPUT_COMPRESSION=80               # jpeg/webp only, 0-100
# OPENAI_BACKGROUND=auto                     # gpt-image-2: auto / opaque
# OPENAI_MODERATION=auto                     # auto / low
```

Example process environment:

```bash
export IMAGE_BACKEND=openai
export OPENAI_API_KEY=sk-xxx
export OPENAI_MODEL=gpt-image-2
export OPENAI_OUTPUT_FORMAT=png
```

Current process environment wins over `.env`.

OpenAI backend notes:
- `gpt-image-2` is the default OpenAI model.
- For `gpt-image-2`, `image_size=512px` means a low-quality draft preset, not a literal 512px edge. The model requires both edges to be multiples of 16px, a long:short ratio no greater than 3:1, and total pixels between 655,360 and 8,294,400.
- `OPENAI_BACKGROUND=transparent` is not supported by `gpt-image-2`; use `auto` or `opaque`.
- If `OPENAI_OUTPUT_FORMAT=jpeg` or `webp`, generated files use `.jpg` or `.webp` extensions instead of `.png`.

Use provider-specific keys only (e.g. `GEMINI_API_KEY`, `OPENAI_API_KEY`). See `.env.example` in clone mode or `${SKILL_DIR}/.env.example` in skill-install mode for the full list per backend.

`IMAGE_API_KEY`, `IMAGE_MODEL`, and `IMAGE_BASE_URL` are intentionally unsupported.

If you keep multiple providers in one `.env` or environment, `IMAGE_BACKEND` must explicitly select the active provider.

Recommendation:
- Default to the Core tier for routine PPT work
- Use Extended only when you need a specific model style
- Treat Experimental backends as opt-in

Example `.env` for MiniMax image backend:

```env
IMAGE_BACKEND=minimax
MINIMAX_API_KEY=your-api-key
# Optional: override base URL (defaults to https://api.minimaxi.com, domestic China endpoint)
# Use https://api.minimax.io for overseas access
# MINIMAX_BASE_URL=https://api.minimax.io
# MINIMAX_MODEL=image-01
```

## `analyze_images.py`

Analyze images in a project directory before writing the design spec or composing slide layouts.

```bash
python3 scripts/analyze_images.py <project_path>/images
```

Use this instead of opening image files directly when following the project workflow.

## `image_search.py`

Zero-config web image search across openly-licensed providers. Sister tool to `image_gen.py` — used when the resource list row has `Acquire Via: web`.

```bash
python3 scripts/image_search.py "offshore wind farm" \
  --filename cover_bg.jpg --slide 01_cover \
  --orientation landscape -o projects/demo/images
```

Providers (Openverse and Wikimedia work with no key; configure Pexels / Pixabay for better stock-photo quality):

| Provider | Config | Strength |
|---|---|---|
| `openverse` | zero-config | fallback aggregator: Wikimedia + Flickr + museums + rawpixel |
| `wikimedia` | zero-config | educational, scientific, geographic, historical |
| `pexels` | recommended: `PEXELS_API_KEY` | modern stock photography, people, workplace, lifestyle |
| `pixabay` | recommended: `PIXABAY_API_KEY` | broad type coverage including photos and illustrations |

Default search chain (when `--provider` is unset): zero-config providers first, then keyed providers whose API key is set in the environment. Keyed providers without a key are silently skipped. For polished visual decks, configure at least one keyed provider.

`image_search.py` uses the same `.env` lookup order as `image_gen.py`, so skill installs can keep `PEXELS_API_KEY` / `PIXABAY_API_KEY` in `~/.ppt-master/.env`.

Query guidance:

| Case | Pattern |
|---|---|
| Generic stock concept | `boardroom meeting, professional editorial photography, natural light` |
| China-specific landmark | Official Chinese place name + concrete scene |
| Avoid | Negative prompt wording such as `not tourist snapshot` |

License filter:

- **Default**: search all providers with `cc0,pdm,pexels,pixabay,cc by,cc by-sa` allowed together. The chosen image may be `no-attribution` or `attribution-required`; Executor adds an inline credit only when needed.
- `--strict-no-attribution` restricts the search to `cc0,pdm,pexels,pixabay` — useful for full-bleed hero images or templates that cannot host a credit element.

Pin a provider, refuse attribution, or override the manifest path:

```bash
# Pin Wikimedia
python3 scripts/image_search.py "Olympics opening ceremony" \
  --filename event.jpg --provider wikimedia \
  --orientation landscape -o projects/demo/images

# Strict mode — refuse CC BY / CC BY-SA
python3 scripts/image_search.py "abstract gradient" \
  --filename hero.jpg --strict-no-attribution \
  -o projects/demo/images
```

Output:

- Image saved to the specified output directory (auto-converts webp → jpg via Pillow when the filename extension demands)
- `image_sources.json` manifest with full provenance (provider, license, license_tier, author, source URL, dimensions, attribution_text)
- Manifest is idempotent on `filename` — rerunning replaces that entry only

Allowed licenses (default): CC0, Public Domain, Pexels License, Pixabay Content License, CC BY, CC BY-SA. Auto-rejected: CC BY-NC, CC BY-ND, CC BY-NC-SA, CC BY-NC-ND, all rights reserved, unknown.

The full role-level reference (intent → query translation, on-slide attribution visual specification) is in [`references/image-searcher.md`](../../references/image-searcher.md).

## `gemini_watermark_remover.py`

Remove Gemini watermark assets after manual download.

```bash
python3 scripts/gemini_watermark_remover.py <image_path>
python3 scripts/gemini_watermark_remover.py <image_path> -o output_path.png
python3 scripts/gemini_watermark_remover.py <image_path> -q
```

Notes:
- Requires `scripts/assets/bg_48.png` and `scripts/assets/bg_96.png`
- Best used after downloading “full size” Gemini images

Dependencies:

```bash
pip install Pillow numpy
```
