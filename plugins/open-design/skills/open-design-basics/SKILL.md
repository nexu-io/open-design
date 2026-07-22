---
name: open-design-basics
description: Shared execution and dynamic-discovery contract for the Open Design artifact skills. Use together with a specific create-*-with-open-design skill after the user explicitly selects or names Open Design; do not use as a generic design-artifact router.
---

# Open Design Basics

Apply this contract before executing any Open Design artifact skill. Let the artifact-specific skill choose the `artifactType`, candidate decision dimensions, internal workflow, and delivery checks.

## Fail closed when tools are unavailable

- Use the Open Design MCP tools as the only execution surface. Do not create substitute HTML, slides, images, media, documents, or mockups yourself.
- If the tools are missing, stop. Tell the user to fully quit and relaunch Codex, create a fresh task, and select Open Design again.
- Treat a real `collect_brief` tool call with a rendered Custom UI card as the reload signal. Refreshing the plugin page or merely opening another task is not proof.
- Never fall back to prose questions, `<question-form>`, `<ask-question>`, JSON, Markdown form markup, or a hand-written pseudo-form. Those surfaces render as text instead of the Open Design Custom UI.

## Derive a dynamic brief

Use the same decision policy and `QuestionForm` contract as Open Design's in-product discovery form. Do not reuse a universal list of audience, outcome, content, direction, and format questions for every request.

1. Read the complete current request, attachments, project context, prior user messages, and any submitted `[form answers — ...]` block.
2. Extract every explicitly settled decision into `knownAnswers`. Preserve exact user wording, URLs, attachments, project metadata, prior form answers, requested output, active design system, scale, platform, constraints, and stable option values. An inferred recommendation is not a known answer: use it as the question's `defaultValue` so the user can confirm or change it.
3. Read the artifact skill's candidate decision dimensions. Consider a dimension only when it is both unknown and likely to materially change what Open Design builds.
4. Rank the remaining decisions by outcome impact. Ask 2–3 high-impact questions in a normal brief, with a hard cap of 5. Do not ask a low-value question merely to fill a category. The form applies to every fresh creation, even when the incoming brief is detailed; use the remaining visual, narrative, variation, or delivery choices instead of repeating supplied facts.
5. Only skip the form when the user explicitly says to skip questions or just build, the current message begins with `[form answers — ...]`, or the user is making a narrow refinement inside an existing design. When an explicit skip applies, retain inferred defaults in the final structured brief and continue.

## Build the Open Design QuestionForm

Construct one `questionForm` dynamically for this request. The same artifact type may produce different questions for different user inputs.

- Use the shared shape `QuestionForm { id, title, description?, lang?, questions, submitLabel? }`. Use a stable id such as `open-design-brief` and keep each question `id` and option `value` stable, concise, and English machine identifiers.
- Localize `title`, `description`, `submitLabel`, question labels, help text, and option labels to the user's chat language. Set `lang` to its BCP-47 tag.
- Keep the form choice-only: use radio buttons for one choice and checkboxes for multiple choices, with `select`, `switch`, or `direction-cards` when they communicate the decision better. Do not emit `text`, `textarea`, number, range, date/time, URL, email, telephone, file, color, or any other editable input.
- Give every radio, checkbox, select, and direction-card option an explicit localized `label` plus stable `value`. Tailor the choices to the current request; do not copy a fixed preset list just because it exists in an artifact skill.
- Prefill every question through `defaultValue` with the best recommendation inferred from the request and known context. Use one option value for a single choice and an array of values for checkboxes. The form should be safe to submit unchanged.
- Use `required: true` only for a decision that generation cannot safely infer. Add `maxSelections` to a checkbox when the user should make a focused choice.
- Do not re-ask a user-supplied decision that is already known through `knownAnswers`, even as a disabled or prefilled duplicate.
- Do not add an internal OpenDesign logo, name, subtitle, or product header; the host tool card already supplies identity.

Call `collect_brief` with the dynamically authored contract:

```text
collect_brief({
  artifactType,
  projectTitle?,
  knownAnswers,
  questionForm
})
```

The `collect_brief` tool renders the supplied form; it does not decide which questions to ask. Never emit literal `<question-form>`, JSON form markup, prose questions, or a hand-written pseudo-form as assistant text.

## Continue from submitted answers

- Expect the Custom UI to return the standard Open Design answer envelope:

```text
[form answers — open-design-brief]
- <localized question label>: <localized selected label> [value: <stable value>]
```

- Match the envelope id to `questionForm.id`. Prefer each `[value: ...]` machine value over the visible localized label, merge the selections into `knownAnswers`, and preserve the human-readable labels for the final structured brief.
- A submitted form is approval of those decisions. Do not ask the same questions again or show another form unless a later user change creates a genuinely new, outcome-changing ambiguity.

## Check Cloud access

1. Call `get_cloud_account` before generation.
2. Continue only when `canUseCloud` is `true`; `start_run` is Cloud-pinned.
3. When signed out, show the returned sign-in action. Do not speculate whether the account is registered.
4. When `nextAction` is `recharge`, offer the returned recharge URL before generation. Explain that local Code Agent and BYOK remain available inside Open Design, not through this plugin flow.
5. Retry an unavailable wallet result. Never convert an account error into a zero balance.

## Create and run

1. Call `create_project` with a concise human-readable name and the selected `artifactType`. Pass a known `designSystem` when appropriate.
2. Keep the returned project id and use it explicitly for every later call.
3. Call `start_run` with that project id, the exact artifact-specific `artifactType`, the complete structured brief, and `confirmed: true`.
4. Do not pass an agent id. The server owns the Cloud runtime and internal workflow mapping.
5. Return the progress card immediately. Poll `get_run` every 30–60 seconds until the run is terminal; unchanged file timestamps during a running state are normal thinking time.
6. Cancel only when the user explicitly asks.

## Verify delivery

- Require `status: succeeded`, `artifactCount > 0`, and every output named by the artifact-specific skill. A process-level success with zero files is a failed delivery.
- Require a real `previewUrl` for websites, prototypes, presentations, images, videos, audio, and documents. Design systems instead require a real generated design-system file.
- Never claim completion after a write, read, archive, preview, or registration error. Report the returned failure exactly and leave the project available for diagnosis.
- For a delivered browser or media artifact, use the host in-app browser to open two separate tabs before replying: the exact `studioUrl` and exact `previewUrl`. For a design system, open the exact `studioUrl`.
- If in-app browser control is unavailable, return both exact links and say they could not be opened automatically.
- Never replace a returned URL with the Open Design origin, `/`, or `/onboarding`.

## Refine safely

- Reuse the same project for refinements and call `start_run` with the requested delta. Create another project only when the user asks.
- Keep advanced editing, versions, and export in Open Design.
- Never expose access tokens, Cloud control keys, runtime keys, API keys, cookies, or raw credentials.
- Never delete projects or files as cleanup without explicit user authorization.
