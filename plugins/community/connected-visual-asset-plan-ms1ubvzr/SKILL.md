# connectEd visual asset plan

## Decision

The missing image system is **project-cover art for discovery**.

The live WebGL project graph already gives the hero a product-specific visual.
Replacing it with a raster image would make the page less distinctive. The
membership section works best as a quiet typographic comparison. The discovery
cards are the weak point: their covers need recognizable, content-aware imagery
that makes projects easier to scan without pretending to be screenshots.

The existing warm interior and glass-interface images are excluded. They belong
to an earlier visual direction and conflict with the current Supabase-inspired
near-black, emerald, border-defined system.

## Locked art direction

- Site type: technical collaboration product
- Conversion goal: browse a project or publish one
- Hero scale: mid editorial
- Theme: deep dark mode
- Narrative spine: a living project network
- Image treatment: matte technical artifacts, editorial crops, subtle scan grain
- Palette: near-black, charcoal, off-white, one restrained emerald marker
- Typography in generated references: geometric sans plus sparse monospace labels
- No purple, blue glow, glassmorphism, fake dashboards, people posing at laptops,
  floating cards, invented metrics, or visible brand logos

## Section reference set

Generate **3 horizontal references, one per existing section**. These are visual
targets for implementation and review, not images to place directly into the
page.

### Section 1 of 3: Hero

**File:** `assets/reference-connected-hero.png`  
**Aspect:** 16:9  
**Purpose:** confirm the existing live graph as the signature visual and refine
its composition.

**Prompt**

> High-fidelity horizontal website section reference for connectEd, a technical
> collaboration platform. Deep near-black canvas, off-white geometric sans
> headline reading "Find work worth joining.", one concise supporting sentence,
> emerald primary action, restrained secondary action. Product-specific live
> network visualization occupies the right half: a precise constellation of
> project and collaborator nodes, fine charcoal connections, one emerald active
> node, small monospace state labels for Publish, Collaborate, Interview. Clean
> developer-tool atmosphere inspired by premium open-source infrastructure
> products. Border-defined depth, no large shadows. Generous negative space,
> clear 1200px content grid, implementation-ready responsive structure. No
> photography, no fake dashboard, no gradient wash, no floating cards, no
> purple, no blue glow, no decorative blobs.

**Implementation note:** keep the current Three.js canvas. Use the reference only
to tune node scale, label hierarchy, and empty space.

### Section 2 of 3: Project discovery

**File:** `assets/reference-connected-discovery.png`  
**Aspect:** 16:9  
**Purpose:** define the project-cover system and the strongest content rhythm.

**Prompt**

> High-fidelity horizontal website section reference for a dark technical
> project discovery board. Near-black background with three real project cards
> in a strict responsive grid. Each card has a distinct editorial cover image,
> not a fake interface: one abstract service blueprint made from paper and
> graphite, one macro crop of a machined prototype with fine measurement marks,
> one research evidence collage using monochrome documents and a single emerald
> annotation. Covers share matte texture, charcoal neutrals, off-white detail,
> and one small emerald focal marker. Below each cover: concise project title,
> short summary, skill tags, owner, and one quiet action. Boosting is indicated
> by ordering and a small text label, not glow. Supabase-inspired typography,
> 16px card radius, 1px borders, generous gaps, high implementation clarity.
> No masonry, no Pinterest layout, no stock-office photography, no invented
> metrics, no purple, no glass, no neon, no fake dashboard screenshots.

**Implementation note:** this is the highest-priority reference. Its three cover
treatments become the reusable visual grammar for all project cards.

### Section 3 of 3: Membership

**File:** `assets/reference-connected-membership.png`  
**Aspect:** 16:9  
**Purpose:** protect the quiet comparison layout from becoming a generic pricing
card stack.

**Prompt**

> High-fidelity horizontal website section reference for connectEd membership.
> Deep near-black canvas with one editorial comparison surface, not two pricing
> cards. Large left-aligned statement, concise explanation, then two horizontal
> tiers divided by thin charcoal rules. Free and connectEd Plus use oversized
> white prices, muted descriptions, compact benefit lists, and one emerald
> primary action on Plus. Include one subtle project-network line motif entering
> from the far right edge and stopping before the text, used once as a
> second-read detail. Circular-style geometric sans, sparse monospace labels,
> border-defined depth, generous spacing. No checkmark icon wall, no popular
> badge, no glow, no gradient, no glass, no three-card pricing template.

**Implementation note:** the line motif may be recreated in CSS or omitted. Do
not place a raster image inside the membership section.

## Production project-cover system

Generate six horizontal cover masters. They are content categories, not fake
project screenshots. Use `object-fit: cover` when displayed in the existing
176px card cover.

| File | Visual subject | Default mapping |
|---|---|---|
| `assets/project-cover-design.png` | paper service blueprint, cropped tools, graphite marks | design |
| `assets/project-cover-engineering.png` | machined component macro, calibration marks | engineering |
| `assets/project-cover-research.png` | evidence collage, documents, pinned annotation | research |
| `assets/project-cover-education.png` | modular learning materials, index cards, type blocks | education |
| `assets/project-cover-community.png` | interconnected printed portraits represented abstractly, no identifiable faces | community |
| `assets/project-cover-general.png` | neutral project dossier with node topology | fallback |

### Shared cover prompt

Replace `[SUBJECT]` with the subject in the table.

> Premium editorial project-cover image for a technical collaboration platform,
> horizontal 16:9 crop. [SUBJECT]. Matte near-black and charcoal materials,
> off-white structural details, exactly one small emerald green annotation or
> node. Precise, tactile, photographed like a design-research artifact on a dark
> work surface. Strong macro crop, asymmetrical composition, calm negative
> space, subtle scan grain, no readable text. No people posing, no laptop stock
> photo, no fake app UI, no logos, no purple, no blue glow, no gradient, no
> glassmorphism, no floating cards, no decorative sphere.

### Card assignment logic

1. Match exact normalized tags first: `design`, `engineering`, `research`,
   `education`, `community`.
2. Use `project-cover-general.png` when no category matches.
3. Do not rotate covers randomly on every load. The same project must keep the
   same cover.
4. Prefer a stored project cover URL when a creator later uploads or generates
   a custom cover.
5. Keep titles and badges outside the image. Generated covers contain no text.

## Social image

**File:** `assets/connected-og.png`  
**Target crop:** 1200 x 630  
**Generation aspect:** 16:9, then center-crop to 1200 x 630  
**Copy:** `Find work worth joining.`

**Prompt**

> Premium social share image for connectEd, a project collaboration platform.
> Deep near-black background, a precise project network crossing the frame from
> left to right, one emerald active project node connected to smaller off-white
> collaborator nodes, fine charcoal lines, subtle depth without glow. Leave a
> large clean safe area on the left for the headline "Find work worth joining."
> and a small connectEd wordmark. Geometric sans typography, sparse developer
> console detail, border-defined Supabase-inspired atmosphere. High contrast at
> mobile thumbnail size. No dashboard, no photography, no purple, no blue glow,
> no gradient text, no invented statistics.

## Icons and illustrations

- Do not generate a new icon set. Existing controls are text-led and the page
  does not need decorative icons.
- Do not add a hero illustration. The WebGL graph is the hero illustration.
- Do not build a moodboard. The visual direction is already locked.
- If project-type icons become necessary later, use one existing monoline icon
  family at 1.6px to 1.8px stroke and keep icons outside generated covers.

## Generation order

1. `assets/reference-connected-discovery.png`
2. `assets/project-cover-design.png`
3. `assets/project-cover-engineering.png`
4. `assets/project-cover-research.png`
5. `assets/project-cover-education.png`
6. `assets/project-cover-community.png`
7. `assets/project-cover-general.png`
8. `assets/connected-og.png`
9. `assets/reference-connected-hero.png`
10. `assets/reference-connected-membership.png`

Generate discovery first because it resolves the only visible content gap.
Generate the hero and membership references last because neither requires a
raster asset in production.

## Dispatcher command pattern

Use `gpt-image-2` for the first pass. Replace `<filename>` and `<prompt>` with
the entries above.

```bash
"$OD_NODE_BIN" "$OD_BIN" media generate \
  --project "$OD_PROJECT_ID" \
  --surface image \
  --model gpt-image-2 \
  --output "<filename>" \
  --aspect 16:9 \
  --prompt "<prompt>"
```

If the result returns a `taskId`, continue with `media wait` until the final
response contains a `file` object. Keep every output as a separate image. Never
combine the three section references into a tall page image.

## Acceptance checks

- Exactly three section references exist, each horizontal and separate.
- Discovery has multiple content-aware cover treatments, not colored blocks.
- The hero reference supports the live graph rather than replacing it.
- Membership remains a flat comparison, not a card stack.
- Every production cover is text-free and safe for `object-fit: cover`.
- Emerald appears once per cover as a signal, never as a wash.
- All assets remain legible beside the existing off-white and gray typography.
- No existing warm interior or glass-interface image is reused.
- The OG image remains readable at a small social preview size.

## Provenance

Formalized by Open Design from candidate 3a646e8a-2d1f-4559-aa34-848acec8cfee.
