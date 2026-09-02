---
name: image-led-page
en_name: "Image-Led Page"
description: |
  Build a page whose imagery is generated rather than borrowed: plan an image
  manifest, generate every asset through the OpenDesign media dispatcher, place
  them in the layout, then verify the result against the failures that
  generated imagery actually produces. Use when a landing page, marketing site,
  or product page needs real hero photography, product screenshots, portraits,
  or illustration as page content instead of placeholder services, stock URLs,
  or hand-rolled SVG stand-ins.
triggers:
  - "image-led page"
  - "landing page with generated images"
  - "generate the images for my page"
  - "replace the placeholder images"
  - "page with real product shots"
  - "hero photography for my site"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  category: web-artifacts
  preview:
    type: html
    entry: example.html
  craft:
    requires:
      - typography
      - color
      - anti-ai-slop
  design_system:
    requires: false
  example_prompt: |
    Build the launch page for my product and generate its hero shot, two
    product screenshots, and three portraits through the media dispatcher
    instead of leaving placeholder images.
---

# Image-Led Page

A page carried by real imagery, generated in-product.

Design skills reach for whatever image tool the environment happens to expose
and fall back to a placeholder photo service when they find none. Inside
OpenDesign there is always one: the media dispatcher the agent already holds as
`"$OD_NODE_BIN" "$OD_BIN" media generate`. This skill makes that the default
path and closes the chain around it — manifest, generate, place, verify —
carrying the checks that catch what generated imagery actually gets wrong.

## When to use this

Use it when images are **page content**: the hero, the product screenshot, the
portrait next to a quote, the texture behind a section.

Do not use it for:

| Instead | Use |
|---|---|
| Product photos from a customer's reference shots | `ecommerce-image-workflow` |
| Reference comps *of* sections for a coding model to rebuild | `imagegen-frontend-web` |
| A brand-guidelines board or identity system | `brandkit` |
| A layout with no photographic content at all | `frontend-design` alone |

## Step 1 — Plan the manifest before generating anything

Write the full image list first, as a table, and show it to the user before
spending a single generation. Each row: slot id, role on the page, aspect,
and what must be recognisable in it.

A typical marketing page needs six to nine images. If the plan needs more than
about twelve, the page is probably using imagery as filler — cut the slots that
carry no information rather than generating decoration.

Reuse the active project's `imageAspect` metadata when it is set; otherwise
pick per slot (hero `16:9`, portrait `1:1`, phone frame `9:16`).

## Step 2 — Write prompts against one style block

Compose the style block **once** from whatever brand truth exists — the
project's design system, an uploaded logo, or the user's stated direction —
covering palette, material, lighting, and mood. Append it **verbatim** to every
prompt in the manifest. Identical wording across prompts is what makes a set
look like one set; paraphrasing it per image is the most common reason a page's
images drift apart.

Then add the slot-specific subject. For any image that shows a screen or
carries a brand mark, quote the exact strings:

```text
The word "ACME" appears as the logo in the top-left. All interface labels are
in German. No other brand names appear anywhere in the image.
```

Without that lock the model supplies a plausible product name of its own, and
a screenshot captioned as your product ships showing someone else's. Read
`references/pitfalls.md` before writing the first prompt.

## Step 3 — Generate through the dispatcher

Do not call provider APIs, MCP image tools, or placeholder services. Use the
unified dispatcher so the run stays inside the project's configured model,
credentials, and file handling.

```bash
# POSIX bash. One slot per invocation; wait for each before starting the next.

# Read one field out of a dispatcher JSON line. Parser failures propagate:
# a malformed line, a missing python3, or a non-object payload must stop the
# run. Defaulting a missing field to "" or 0 here is what silently produces a
# page referencing an image nobody generated.
od_json_field() {
  python3 -c '
import json, sys
obj = json.load(sys.stdin)
if not isinstance(obj, dict):
    sys.exit("dispatcher output is not a JSON object")
sys.stdout.write(str(obj.get(sys.argv[1], "")))
' "$1"
}

# Stage the prompt in a private temp file OUTSIDE the project. Prompt text is
# brand material and must never be routed through the shell: a double-quoted
# --prompt argument executes backticks and $(...), and a heredoc ends at any
# line equal to its delimiter, so a prompt containing that word truncates the
# file and the shell runs the remainder. A fixed name inside the project would
# also clobber a real project file and outlive a failed run.
prompt_file=$(mktemp "${TMPDIR:-/tmp}/od-prompt.XXXXXXXX") || exit 1
trap 'rm -f "$prompt_file"' EXIT INT TERM

# Write the subject sentence and the verbatim style block into "$prompt_file"
# with your file-writing tool — not with a shell heredoc, cat, or echo.
# Then confirm it arrived before spending a generation on an empty prompt:
[ -s "$prompt_file" ] || { echo "prompt file is empty: $prompt_file" >&2; exit 1; }

out=$("$OD_NODE_BIN" "$OD_BIN" media generate \
  --project "$OD_PROJECT_ID" \
  --surface image \
  --model "<imageModel from metadata>" \
  --aspect "<slot aspect>" \
  --output "assets/<slot-id>.png" \
  --prompt-file "$prompt_file")
ec=$?
if [ "$ec" -ne 0 ]; then echo "$out" >&2; exit "$ec"; fi

last=$(printf '%s\n' "$out" | tail -1)
task_id=$(printf '%s\n' "$last" | od_json_field taskId) || exit 1
since=$(printf '%s\n' "$last" | od_json_field nextSince) || exit 1
[ -n "$since" ] || since=0

while [ -n "$task_id" ]; do
  out=$("$OD_NODE_BIN" "$OD_BIN" media wait "$task_id" --since "$since")
  ec=$?
  last=$(printf '%s\n' "$out" | tail -1)
  since=$(printf '%s\n' "$last" | od_json_field nextSince) || exit 1
  [ -n "$since" ] || since=0
  if [ "$ec" -eq 0 ]; then
    task_id=""
  elif [ "$ec" -ne 2 ]; then
    echo "$out" >&2
    exit "$ec"
  fi
done

# The slot only succeeded if the dispatcher actually named a file. An exit
# code of 0 with no file field is a failure, not a quiet success.
file_name=$(printf '%s\n' "$last" | python3 -c '
import json, sys
obj = json.load(sys.stdin)
f = obj.get("file") if isinstance(obj, dict) else None
if not isinstance(f, dict) or not f.get("name"):
    sys.exit("dispatcher returned no file: " + json.dumps(obj)[:400])
print(f["name"])
') || exit 1

printf '%s\n' "$file_name"
```

`$file_name` is the name the dispatcher actually wrote. Record it against its
slot and reference that name in the markup — the name you asked for via
`--output` is not guaranteed to be the name you get.

If a slot fails, regenerate that slot alone. Do not restart the set.

## Step 4 — Look at every image before placing it

Open each generated file and check it, one at a time. This step is not
optional and cannot be delegated to the linter, which never sees inside a
raster image.

- Is the brand name in the image the right one?
- Is any rendered text spelled correctly and in the right language?
- Are numbers, ratings, certificates, or metrics visible that nobody verified?
  Treat them as false claims and regenerate without them.
- Are hands, faces, and product geometry plausible?

Delete and regenerate anything that fails. A wrong image that reaches the
layout is far more expensive to find later, when it reads as intentional.

## Step 5 — Place them as content

Give every image a real job in the layout: it establishes the product, proves a
claim, or gives a person a face. An image that could be swapped for a grey box
without changing the page is decoration — cut it and reclaim the space.

Requirements at placement time:

- Text over an image needs full opacity **and** a scrim or plate. Photographs
  have bright and dark regions; protect against both.
- `width`/`height` attributes on every `<img>` so the layout does not reflow.
- Descriptive `alt` on content images; `alt=""` on purely atmospheric ones.
- No `ad`, `ads`, `banner`, or `sponsor` in file names, classes, or ids —
  content blockers hide those by name, and the page then renders empty for
  users who run one while looking correct in every test you can run.

## Step 6 — Verify

Run the linter first; it costs seconds and needs no model call. Point it at
the file this run actually wrote — this workflow names pages for what they
are, so there is usually no `index.html`:

```bash
page="landing.html"   # the page file this run created
"$OD_NODE_BIN" "$OD_BIN" lint "$page" --fail-on p0
```

Exit `1` means findings at or above the threshold; `--json` gives a
machine-readable envelope. Fix P0 findings before anything else.

Then work `references/checklist.md` top to bottom. The linter reads markup —
it cannot see contrast, an unreadable button, a cropped screenshot, or a
mislabelled photograph.

## Hard rules

- Plan the manifest and show it before generating.
- One style block, appended verbatim to every prompt.
- Quote exact brand and interface text for anything showing a screen.
- Generate through `"$OD_NODE_BIN" "$OD_BIN" media generate` only — never a
  provider API, never a placeholder photo service, never a hand-rolled SVG
  "screenshot".
- Open and inspect every generated image before it enters the layout.
- Never let a generated image assert a number, rating, or certification.
- Run `od lint` and `references/checklist.md` before handoff.
- Handoff follows the execution context. With filesystem tools, write
  the page into the project and close with the normal file summary — no
  `<artifact>` tag. In text-artifact runs (no filesystem tools), the
  generation commands above cannot run: build the page with the
  manifest's image slots as styled placeholders, say which slots still
  need the filesystem workflow, and return the completed canonical HTML
  in a single `<artifact type="text/html">` tag — that block is the only
  delivery path those runs have.
