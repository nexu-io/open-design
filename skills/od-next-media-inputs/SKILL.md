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
references, and image geometry.

## Route each image slot

Decide each slot's route, and which libraries a stock search may use, with
the Core imagery-by-type rule; it is the only source of those rules.

## Search stock photos

- Fetch every stock slot through the authenticated daemon wrapper in one
  call, using the company service and your existing Vela login:
  `"$OD_NODE_BIN" "$OD_BIN" media stock-search --slots '[{"id":"hero","query":"black eyeglasses frame","width":1200,"orientation":"landscape"}]'`.
  Write queries in English with the subject first. The service follows configured channel priority,
  tries each channel at most once within its attempt limit, ranks by alt text, and returns
  each result. The wrapper downloads images into `assets/stock/` and records
  credits in `assets/stock/credits.json`. Provider keys stay on the server;
  never ask the user to configure a stock-provider key.
- If the command fails or times out, or a slot returns `error`, `not_found`,
  or `budget_exceeded`, keep successful local files and use your available
  web/image search tools for only the missing slots. This includes unavailable
  service/login, API errors, rate limits and failed image downloads. Do not
  call the stock tool again for those failed slots.
- Search the stock libraries' public pages or the correct official source
  for a named real subject. Read each result's title/alt text, source and
  license before selecting its actual image URL; never invent a URL or ID.
- Batch independent downloads, bound each request to 10–15 seconds, and
  stop when the existing acquisition budget expires. On HTTP 403/429, switch
  source instead of looping; at most one alternative web search per missing
  slot. Keep successful images and disclose a designed placeholder when no
  usable image is found.
- Download at display size (long edge 1600 px or less) and keep each JPEG or
  WebP under about 400 KB.
- Preserve each photo's page URL, author when shown, and license returned by
  the source in a sidecar next to the asset. Apply the Core Image attribution
  rule to decide whether any of that metadata belongs in the visible artifact.
- When the time budget runs out, keep the files that succeeded. Use a
  disclosed placeholder for any remaining slot.

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
each item's result and failures; keep dependent requests ordered. Reuse valid
measurements for unchanged files; after transformation, remeasure affected
files before sizing their containers.

HTTP success and file/size probes do not prove semantic fit; decide it as the
Core imagery rule describes, without reading images back into the
conversation.

## Collect results and stop when complete

Retain each actual job ID, status, returned cursor, original response, and
output location. Use only supported wait or batch operations. Submission and
exit success alone do not prove an asset is ready. Stop polling a job after
an explicit terminal result with complete output/error information; a failed
or interrupted terminal result is not a usable asset. Continue necessary
retrieval for running jobs, incomplete results, or new errors. Parse the saved
response again instead of requesting it merely to change formatting.

Stop acquiring assets when all required slots satisfy their content and input
conditions. If a required asset remains unavailable, follow the existing
fallback/failure contract and preserve uncertainty; never declare completion
just because fewer calls were made.
