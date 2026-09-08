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
Do not impose a new tool-count cap or sacrifice quality to reduce calls.

## Batch independent input work

When the tools support it and inputs are independent, batch search, fetch,
download, format handling, and intrinsic width/height measurements. Preserve
each item's result and failures; keep dependent requests ordered. Reuse valid
measurements for unchanged files; after transformation, remeasure affected
files before sizing their containers. HTTP success and file/size probes do not
prove semantic fit. A read invocation alone does not prove the image was seen.

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
