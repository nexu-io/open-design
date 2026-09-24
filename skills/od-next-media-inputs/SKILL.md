---
name: od-next-media-inputs
en_name: "OD Next Media Inputs"
zh_name: "OD Next 素材输入"
description: |
  Prepare required media inputs within an existing OD Next plan. Reuse capability
  evidence, acquire and measure assets efficiently, and resolve asynchronous
  jobs without removing required content or weakening quality standards.
triggers:
  - "OD Next media inputs"
  - "prepare required media assets"
  - "reuse media capability results"
od:
  mode: utility
  category: image-generation
  design_system:
    requires: false
  example_prompt: "Prepare the media inputs required by the frozen plan, preserving every asset slot and quality requirement."
---

# OD Next Media Inputs

Use only when the current task needs media inputs. Reuse these instructions
while applicable; do not load them for tasks without asset work. Follow the
current route, stage, frozen plan, and delivery boundary. During
`contract_repair`, make no tool calls. Finish required input work before the
deliverable write that depends on it. Never label post-write artifact
inspection, rendering, validation, or repair as input preparation to bypass
ship-on-write.

## Preserve the required slots

Use the frozen asset requirements in the existing working context: purpose,
subject, source/license constraints, geometry, reuse positions, and readiness.
Reuse suitable user assets and the same asset across pages. Deduplicate work,
not distinct subjects or required states. Do not add a new plan, manifest,
approval step, or review Agent. Preserve every required asset and quality
condition, including semantic fit, authenticity, licensing, local or inline
references, and image geometry. Do not hotlink or fabricate real referents.

## Route each image slot

Decide each slot's route from what it shows, following the Core imagery rule:

- Real referent (a named product, book cover, brand mark, or a real place,
  person, or event): use a user or brand asset first, then search stock
  photos as described below. Never generate it.
- Illustrative, fictional, or atmospheric subject, or a set that must share
  one style: generate it. Search stock photos only when generation is
  unavailable.
- Chart, diagram, icon, or text-heavy image: build it in code.

When the user explicitly asks for real photos or for generated images, follow
that request.

## Search stock photos

Use Pexels first and Pixabay second. Do not use Wikipedia or Wikimedia
Commons, random-image services such as picsum.photos or loremflickr, or other
sites the user did not supply. A named real referent that neither library
shows, such as a specific book cover or product, may come from its official
page; otherwise design a placeholder and disclose it.

- With `PEXELS_API_KEY` or `PIXABAY_API_KEY` in the environment, fetch every
  slot in one call instead of writing a script:
  `"$OD_NODE_BIN" "$OD_BIN" media stock-search --slots '[{"id":"hero","query":"black eyeglasses frame","width":1200,"orientation":"landscape"}]'`.
  Write each query in English with the subject first. The command searches,
  re-ranks by alt text, downloads at `width` into `assets/stock/`, records
  credits in `assets/stock/credits.json`, and prints each slot's `path`,
  `alt`, and `status`. Use a slot's `alt` to judge fit; for `not_found`,
  retry that slot once with a broader query. Exit code 5 means no key: use
  the keyless path below.
- Without a key, the sites' search pages block scripts (HTTP 403). Open the
  search results page with the web fetch tool instead, for example
  `https://www.pexels.com/search/<query>/` or
  `https://pixabay.com/images/search/<query>/`, and read each result's photo
  ID or image URL together with its alt text.
  - Pexels file:
    `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=<display width>`
  - Pixabay file: the `cdn.pixabay.com/photo/...` URL listed in the results.
- Choose candidates from their alt text and titles. Download every slot in
  one batched command: concurrent requests, a 10–15 s timeout per request,
  and about 3 minutes in total. Do not poll with sleep or retry one slot in a
  loop; on HTTP 403 or 429, switch to another candidate or library.
- Download at display size (long edge 1600 px or less) and keep each JPEG or
  WebP under about 400 KB.
- Record each photo's page URL, author when shown, and license (Pexels
  License or Pixabay Content License) in a comment or sidecar next to the
  asset.
- When the time budget runs out, keep the files that succeeded. Generate the
  remaining illustrative slots; use a disclosed placeholder for any remaining
  real referent.

## Reuse capabilities and recover by cause

Use only tools, model IDs, parameters, and permissions actually provided for
this run. Reuse complete, valid capability results. Query only missing,
truncated, or invalidated facts; refresh relevant facts when the environment,
authorization, or an error changes the decision. A catalogue entry alone does
not prove authorization or readiness. Do not guess tool/model names or expose
credential values.

Classify failures before retrying:

- Authorization: a stable missing/invalid credential is not fixed by changing
  the subject or guessing another model. Use only a verified, permitted alternative or
  the existing contract's fallback; never bypass access controls.
- Parameters: correct the unsupported input using actual capability/error
  information, without searching guessed aliases.
- Temporary failures: follow existing retry guidance and budgets. If a job
  was accepted, retrieve its result before creating another. A retryable
  transient error may justify unchanged parameters within that guidance.
- Asset mismatch: correct that slot's subject or composition; do not rename
  the requested subject, delete the slot, or distort content to hide failure.

Retry only when the change addresses the cause, the relevant state changes,
or existing guidance permits retrying a temporary failure.
Do not sacrifice required quality to reduce calls; bound stock photo search
with its time budget.

## Batch independent input work

When the tools support it and inputs are independent, batch search, fetch,
download, format handling, and intrinsic width/height measurements. Preserve
each item's result and failures; keep dependent requests ordered. Submit
independent generation jobs together and request the smallest output profile
that covers the display size (usually 1K). Reuse valid measurements for
unchanged files; after transformation, remeasure affected files before sizing
their containers.

HTTP success and file/size probes do not prove semantic fit; judge fit from
the source's title, alt text, or tags, or from the generation prompt. Do not
read downloaded or generated images back into the conversation to inspect
them: images stay in context and slow every later step, and a text-only model
may not see them.

## Collect results and stop when complete

Retain each actual job ID, status, returned cursor, original response, and
output location. Use only supported wait or batch operations. Submission and
exit success alone do not prove generation finished. Stop polling a job after
an explicit terminal result with complete output/error information; a failed
or interrupted terminal result is not a usable asset. Continue necessary
retrieval for running jobs, incomplete results, or new errors. Parse the saved
response again instead of requesting it merely to change formatting.

Stop acquiring assets when all required slots satisfy their content and input
conditions. If a required asset remains unavailable, follow the existing
fallback/failure contract and preserve uncertainty; never declare completion
just because fewer calls were made.
