> See [`image-base.md`](./image-base.md) for the common framework. For the web sourcing path, see [`image-searcher.md`](./image-searcher.md).

# Image_Generator Reference Manual

Role definition for the **AI image generation path**: convert each `Acquire Via: ai` row into an optimized prompt, generate the image, and save it to `project/images/`.

**Trigger**: resource list rows with `Acquire Via: ai`. The role is loaded only when at least one such row exists.

---

## 1. Unified Prompt Structure

### 1.1 Standard Output Format

Every image must be emitted into `image_prompts.md` in the following block format:

```markdown
### Image N: {filename}

| Attribute | Value |
| --------- | ----- |
| Purpose   | {which page / what function} |
| Type      | {Background / Illustration / Photography / Diagram / Decorative} |
| Dimensions | {width}x{height} ({aspect ratio}) |
| Original description | {Reference field from the resource list} |

**Prompt**:
{subject description}, {style directive}, {color directive}, {composition directive}, {quality directive}

**Alt Text**:
> {Description for accessibility and image captions}
```

### 1.2 Prompt Components

| Component | Description | Example |
|-----------|-------------|---------|
| Subject description | Core content | `Abstract geometric shapes`, `Team collaboration scene` |
| Style directive | Visual style | `flat design`, `3D isometric`, `watercolor style` |
| Color directive | Color scheme | `color palette: navy blue (#1E3A5F), gold (#D4AF37)` |
| Composition directive | Layout ratio | `16:9 aspect ratio`, `centered composition` |
| Quality directive | Resolution quality | `high quality`, `4K resolution`, `sharp details` |

### 1.3 Style Keywords Quick Reference

| Design Style | Recommended Image Style | Core Keywords |
|-------------|------------------------|---------------|
| General Versatile | Modern illustration, flat design | `modern`, `flat design`, `gradient`, `vibrant colors` |
| General Consulting | Clean professional, corporate | `professional`, `clean`, `corporate`, `minimalist` |
| Top Consulting | Premium minimal, abstract geometric | `premium`, `sophisticated`, `geometric`, `abstract`, `elegant` |
| Technology / SaaS | Futuristic, digital | `futuristic`, `digital`, `tech grid`, `circuit pattern`, `neon accents`, `dark background` |
| Education / Training | Friendly, instructional | `friendly`, `instructional`, `whiteboard style`, `pastel colors`, `simple shapes` |
| Marketing / Branding | Bold, energetic | `bold`, `energetic`, `dynamic composition`, `vivid colors`, `action-oriented` |
| Healthcare / Medical | Clean, reassuring | `clean`, `clinical`, `soft blue-green palette`, `organic curves`, `reassuring` |
| Finance / Banking | Conservative, trustworthy | `conservative`, `trustworthy`, `blue-gray palette`, `structured`, `precise` |
| Creative / Design | Artistic, experimental | `artistic`, `experimental`, `asymmetric`, `textured`, `hand-crafted feel` |

### 1.4 Color Integration Method

Extract colors from design spec, convert to prompt directives:

```
Primary: #1E3A5F (Deep Navy)  →  "deep navy blue (#1E3A5F)"
Secondary: #F8F9FA (Light Gray) →  "light gray (#F8F9FA)"
Accent: #D4AF37 (Gold)        →  "gold accent (#D4AF37)"

Full directive: "color palette: deep navy blue (#1E3A5F), light gray (#F8F9FA), gold accent (#D4AF37)"
```

### 1.5 Canvas Format & Aspect Ratio

| Canvas Format | Background Aspect Ratio | Recommended Resolution |
|--------------|------------------------|----------------------|
| PPT 16:9 | 16:9 | 1920x1080 or 2560x1440 |
| PPT 4:3 | 4:3 | 1600x1200 |
| Xiaohongshu (RED) | 3:4 | 1242x1660 |
| WeChat Moments | 1:1 | 1080x1080 |
| Story | 9:16 | 1080x1920 |

> Supported aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` (Gemini also supports `1:4`, `1:8`, `4:1`, `8:1`)

### 1.6 Multi-Image Coherence Strategy

When generating multiple images for a single deck, visual coherence is critical. Use a **Deck Style Anchor** — a shared prefix of 15-25 words prepended to every image prompt.

**Construction**: Combine style keywords (Section 1.3) + color directive (Section 1.4) + quality directive into one reusable prefix.

**Example**:
```
Deck Style Anchor:
"modern flat design illustration, color palette: deep navy (#1E3A5F), light gray (#F8F9FA), gold accent (#D4AF37), clean minimalist, high quality, 4K"

Image 1 prompt: [Deck Style Anchor], abstract technology network showing connected nodes...
Image 2 prompt: [Deck Style Anchor], team of professionals collaborating at a desk...
Image 3 prompt: [Deck Style Anchor], growth chart with upward trending line...
```

**Exception**: Background images may replace style keywords with `background`, `backdrop`, `negative space for text overlay` while keeping the same color directive. This ensures color consistency without compromising background functionality.

**Rule**: Define the Deck Style Anchor once in the prompt document header (Section 4), then reference it in every individual prompt.

---

## 2. Image Type Classification & Handling

### Type Determination Flow

1. Full-page / large-area backdrop → **Background** (2.1)
2. Real scenes / people / products → **Photography** (2.2)
3. Flat / illustration / cartoon style → **Illustration** (2.3)
4. Process / architecture / relationships → **Diagram** (2.4)
5. Partial decoration / texture → **Decorative Pattern** (2.5)

### 2.1 Background

**Identifying characteristics**: Full-page background for covers or chapter pages; must support text overlay

| Key Point | Description |
|-----------|-------------|
| Emphasize background nature | Add `background`, `backdrop` |
| Reserve text area | `negative space in center for text overlay` |
| Avoid strong subjects | Use abstract, gradient, geometric elements |
| Low-contrast details | `subtle`, `soft`, `muted` |

**Template**: `Abstract {theme element} background, {style} style, {primary color} to {secondary color} gradient, subtle {decorative elements}, clean negative space in center for text overlay, {aspect ratio} aspect ratio, high resolution, professional presentation background`

### 2.2 Photography

**Identifying characteristics**: Real scenes, people, products, architecture — photographic quality

| Key Point | Description |
|-----------|-------------|
| Emphasize realism | `photography`, `photorealistic`, `real photo` |
| Lighting effects | `natural lighting`, `soft shadows`, `studio lighting` |
| Background handling | `white background` / `blurred background` / `contextual setting` |
| People diversity | `diverse`, `professional attire` |

**Template**: `{subject description}, professional photography, {lighting type} lighting, {background type} background, color grading matching {color scheme}, high quality, sharp focus, 8K resolution`

### 2.3 Illustration

**Identifying characteristics**: Flat design, vector style, cartoon, concept diagrams

| Key Point | Description |
|-----------|-------------|
| Specify style | `flat design`, `isometric`, `vector style`, `hand-drawn` |
| Simplify details | `simplified`, `clean lines`, `minimal details` |
| Unified palette | Strictly use design spec colors |
| Background choice | `white background` or `transparent background` |

**Template**: `{subject description}, {illustration style} illustration style, {detail level} with clean lines, color palette: {color list}, {background type} background, professional {purpose} illustration`

### 2.4 Diagram

**Identifying characteristics**: Flowcharts, architecture diagrams, concept relationship maps, data visualizations

| Key Point | Description |
|-----------|-------------|
| Clear structure | `clear structure`, `organized layout`, `logical flow` |
| Connection representation | `arrows indicating flow`, `connecting lines` |
| Academic / professional feel | `suitable for academic publication`, `professional diagram` |
| Light background | `white background` or `light gray background` |

**Template**: `{diagram type} diagram showing {content description}, {component description} connected by {connection method}, {style} style with {color scheme}, white background, clear labels, professional technical diagram`

### 2.5 Decorative Pattern

**Identifying characteristics**: Partial decoration, textures, borders, divider elements

| Key Point | Description |
|-----------|-------------|
| Repeatability | `seamless`, `tileable`, `repeatable` (if needed) |
| Understated support | `subtle`, `understated`, `supporting element` |
| Transparency-friendly | `transparent background` or `isolated element` |
| Small-size readability | Consider legibility at small dimensions |

**Template**: `{pattern type} decorative pattern, {style} style, {color scheme}, {background type} background, subtle and elegant, suitable for {purpose}`

---

## 3. Generation Workflow

### 3.1 Prompt Generation Phase

For each image with `Acquire Via: ai` and `Status: Pending`:

1. **Determine type** → Background / Photography / Illustration / Diagram / Decorative
2. **Understand purpose** → Which page? What function?
3. **Analyze the Reference field** → User's intent description
4. **Apply type-specific key points** → Reference §2's table for that type
5. **Generate optimized prompt** → Use the §1.1 standard output format
6. **Save prompt document** → **Must** write to `project/images/image_prompts.md`

> `image_prompts.md` is human-readable; each `### Image N:` block is paste-ready for ChatGPT / Gemini / Midjourney. See §3.2 Offline Manual Mode for the handoff.

### 3.2 Image Generation Phase

> Prerequisite: §3.1 must be complete; `images/image_prompts.md` must exist.

#### Path Selection (Deterministic)

C (AI-generated) supports three implementation modes sharing one `image_prompts.md` source:

| Trigger | Mode | Mechanism |
|---|---|---|
| **Default** — `IMAGE_BACKEND` configured | **Path A**: `image_gen.py` CLI | Agent runs the script; outputs land at `project/images/<filename>` |
| **Path A unavailable/fails OR User explicitly names host tool** | **Path B**: Host-native tool | Agent invokes the host's image capability; outputs land at `project/images/<filename>` |
| **Both Path A and Path B fail/unavailable** | **Offline Manual Mode** | Agent writes prompts to `image_prompts.md`; user generates externally and places files at `project/images/<filename>` |

**Selection logic** (automatic, no user prompting):

1. User explicitly named Path B → use Path B
2. Otherwise check `IMAGE_BACKEND` (env or `.env`)
   - configured → use Path A. If Path A fails twice in a row, automatically fall back to Path B.
   - not configured → skip Path A, automatically fall back to Path B.
3. If Path B also fails or the host lacks native image generation → fall through to Offline Manual Mode.

**Hard rule**: Step 5 is execution, not re-decision. Never present an interactive choice between paths here — image strategy was locked in Strategist Step 4 h item.

> All three modes share one output contract: file at `project/images/<filename>`. Step 6 SVG references are mode-agnostic.

#### Path A — `image_gen.py` CLI (Default)

```bash
python3 scripts/image_gen.py "your prompt" \
  --aspect_ratio 16:9 --image_size 1K \
  --output project/images --filename cover_bg
```

**Parameters**:

| Parameter | Short | Description | Default |
|-----------|-------|-------------|---------|
| `prompt` | - | Prompt (positional arg) | - |
| `--aspect_ratio` | - | Image aspect ratio | `1:1` |
| `--image_size` | - | Size (`1K`/`2K`/`4K`) | `1K` |
| `--output` | `-o` | Output directory | Current directory |
| `--filename` | `-f` | Output filename (no extension) | Auto-named |
| `--backend` | `-b` | Override backend (see `--list-backends` for options) | None |
| `--model` | `-m` | Model name | Backend default |
| `--list-backends` | - | Print support tiers and exit | `false` |

**Configuration sources**:
- Current process environment variables
- First `.env` found in this order: current working directory, clone repo root, `~/.ppt-master/.env`

Precedence:
- Current process environment wins
- `.env` fills missing values only

| Variable | Required | Description |
|----------|----------|-------------|
| `IMAGE_BACKEND` | Required | Backend identifier; run `image_gen.py --list-backends` for the current set |
| `{PROVIDER}_API_KEY` | Required | Provider-specific API key, e.g. `GEMINI_API_KEY`, `ZHIPU_API_KEY` |
| `{PROVIDER}_BASE_URL` | Optional | Provider-specific custom endpoint |
| `{PROVIDER}_MODEL` | Optional | Provider-specific model override |

> Use provider-specific names only (e.g. `GEMINI_API_KEY`, `OPENAI_API_KEY`). See `.env.example` in clone mode or `${SKILL_DIR}/.env.example` in skill-install mode for the full set per backend.

> `IMAGE_API_KEY`, `IMAGE_MODEL`, and `IMAGE_BASE_URL` are intentionally unsupported.

> If `.env` or the current environment contains multiple provider configs, `IMAGE_BACKEND` explicitly selects the active one.

**Support tiers (recommended usage)**: Core / Extended / Experimental. Run `image_gen.py --list-backends` for the current assignments.

**Generation pacing (mandatory)**:
- Execute only one generation command at a time; wait for file confirmation before the next
- Recommend 2-5 second intervals between images to avoid concurrency failures

#### Path B — Host-Native Image Tool (On Explicit User Request)

Triggered only when the user explicitly asks the skill to use the host's built-in image generation (e.g. Codex, Antigravity, or any other host that provides a native image tool).

- Agent invokes the host's native image tool directly; prompts come from the same `image_prompts.md`
- Outputs **must** land at `project/images/<filename-from-resource-list>` with dimensions matching the Image Resource List
- Executor downstream is path-agnostic — no spec change required between Path A and Path B

#### Offline Manual Mode (C's third implementation mode)

**Trigger**: Both Path A and Path B fail or are unavailable.

**Workflow** (no user prompting; system enters this mode automatically):

1. Verify `images/image_prompts.md` was generated in §3.1
2. Set `Status: Needs-Manual` on every affected ai row per [`image-base.md`](./image-base.md) §6
3. Continue to Step 6 — SVG references `images/<filename>` optimistically; Step 7 entry verifies presence
4. Print one consolidated handoff to the user:
   - Filenames awaiting manual generation
   - Pointer to `images/image_prompts.md`: each `### Image N:` block is a paste-ready prompt for ChatGPT / Gemini / Midjourney
   - Target placement: `project/images/<filename>` matching the resource list exactly
   - Resume command: re-run Step 7 once all expected files exist

**User-initiated**: When Strategist Step 4 captured "user wants manual generation" up front, Path A is skipped from the start; the workflow above runs as a planned mode.

> The pipeline tolerates `Needs-Manual` rows end-to-end. The user can leave the project, generate offline at their own pace, then resume Step 7.

#### AI-specific Failure Handling (extends image-base.md §6)

If Path A's backend fails twice in a row:

1. Do not halt. Automatically attempt to fall back to **Path B (Host-Native Tool)**.
2. If Path B also fails or is unavailable, mark the row `Needs-Manual`.
3. Report to user: filename, prompt used, error message.
4. Fall through to **Offline Manual Mode** above.

> If the alternate platform watermarks outputs (e.g. Gemini web), the repository includes `scripts/gemini_watermark_remover.py`.

#### Guardrails (All Modes)

**Hard rule**:

- Do not claim an image is generated without an actual file at the expected path
- `Needs-Manual` is set after a failed attempt OR on entering Offline Manual Mode — not as a way to skip work that automation could have done
- Status transitions are evidence-driven: `Pending` → `Generated` (file exists) or `Pending` → `Needs-Manual` (no automation, or attempt failed once)

---

## 4. Prompt Document Template

Use the following structure when creating `project/images/image_prompts.md`:

```markdown
# Image Generation Prompts

> Project: {project_name}
> Generated: {date}
> Color scheme: Primary {#HEX} | Secondary {#HEX} | Accent {#HEX}
> Deck Style Anchor: {15–25 word prefix per §1.6}

---

## Image List Overview

| # | Filename | Type | Dimensions | Status |
|---|----------|------|-----------|--------|
| 1 | cover_bg.png | Background | 1920x1080 | Pending |

---

## Detailed Prompts

### Image 1: cover_bg.png

| Attribute | Value |
|-----------|-------|
| Purpose | Cover background |
| Type | Background |
| Dimensions | 1920x1080 (16:9) |
| Original description | Modern tech abstract background, deep blue gradient |

**Prompt**:
[Deck Style Anchor], Abstract futuristic background with flowing digital waves...

**Alt Text**:
> Modern tech abstract background with deep blue gradient, digital waves, and particle effects

---

## Usage Instructions

1. Copy the "Prompt" above into an AI image generation tool
2. Recommended platforms: gpt-image-2 / Midjourney / DALL-E 3 / Gemini / Stable Diffusion
3. Rename generated images to the corresponding filenames
4. Place in the `images/` directory
```

---

## 5. Common Issues

### Default Inference When No `Reference` Provided

| Purpose | Default Inference |
|---------|------------------|
| Cover background | Abstract gradient background, reserve central text area |
| Chapter page background | Clean geometric pattern, monochrome focus |
| Team introduction page | Team collaboration scene illustration (flat style) |
| Data display page | Clean geometric pattern or solid color background |
| Product showcase | Product photography style, white or gradient background |

### When Images Are Unsatisfactory

Diagnose the problem category and apply a targeted prompt fix:

| Problem | Diagnosis | Prompt Adjustment |
|---------|-----------|-------------------|
| Wrong style | Image looks photorealistic when flat design was intended | Change style directive: replace `photography` with `flat design illustration` |
| Wrong colors | Colors don't match the design spec palette | Strengthen color directive: add explicit HEX codes, repeat color names |
| Wrong composition | Subject is off-center or layout doesn't fit the slide | Adjust composition directive: add `centered composition`, `rule of thirds`, or `wide negative space on left` |
| Wrong subject | Image depicts something different from what was described | Rewrite subject description with more specificity and concrete details |
| Low quality | Image is blurry, has artifacts, or lacks detail | Add `highly detailed, sharp focus, professional quality, 8K resolution` |

**Variant workflow**:
1. Keep the original prompt as "Variant A" in `image_prompts.md`
2. Create modified prompt as "Variant B" with targeted fixes from the table above
3. If needed, create "Variant C" with a different stylistic approach
4. Label all variants clearly so the user can compare results

---

## 6. Forbidden

- Generating prompts for `web` rows — those go through [`image-searcher.md`](./image-searcher.md)
- Brand names or HEX codes inside the subject description (degrades output)
- Mixed Deck Style Anchors across images in the same deck (breaks coherence)
- Placing an image without updating `image_prompts.md` and the resource list status
