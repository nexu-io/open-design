# OD Next free-text routing corpus

Phase-0 evaluation corpus for the two-layer skill routing work: when the home
composer submits free text without a task type, the agent must (1) pick one
OD Next task profile and (2) optionally stack one specific skill on top of it.
This corpus is the gate for phase 1 (target: task-type accuracy >= 90%).

## Files

- `queries.csv` — **100 real production queries** sampled from Langfuse
  (`open-design-turn` traces on the self-hosted instance): 30 Chinese
  (`lang=zh`) and 70 English (`lang=en`, with a Chinese translation in
  `query_zh` for annotators). This is the file to annotate.
- `queries-synthetic.csv` — the earlier authored set, kept only as a
  reference for the label vocabulary and edge-case shapes. Do not use it for
  the accuracy gate.

## How `queries.csv` was sampled

1. Pulled first-turn traces from 2026-08-07 to 2026-09-01 in one-day windows
   (the self-hosted list endpoint rejects wider windows), 5 to 6 random pages
   of 100 per day, about 6,000 traces in total.
2. Kept only `env=prod` traces whose `stablePromptCacheMissReason` is
   `new-session` (the first turn of an agent session), and dropped eval
   traces, `@skill` mentions, automation continuations, and inputs shorter
   than 18 characters.
3. Stripped host-appended blocks (`<active-workspace-context>`,
   `[form answers …]`, attachment and transcript sections) so only the text
   the user typed remains.
4. Dropped follow-up edits on existing projects ("fix the header", "slide 4
   …"), skill descriptions the client pastes as prompts ("Use when the
   brief …"), the two client-generated template sentences ("Website URL to
   clone: …", "Create a new design with the X design system."), and
   non-English Latin-script queries (Spanish, Portuguese, Indonesian, …).
5. From the remaining pool (about 330 queries) hand-picked 30 zh and 70 en
   that read as a new task, at most two per user, stratified across page,
   dashboard, mobile, slides, image, video, and document intents.
6. Redacted personal names, emails, and URLs to `[name]`, `[email]`, `[url]`.
   Queries longer than 320 characters are cut with `…` and flagged in `note`.

Langfuse does not record the task type the user picked, so the
`proposed_*` columns are the author's proposal, not observed ground truth.

## Columns

| Column | Meaning |
| --- | --- |
| `id` | Stable id `Q001`..`Q100`. |
| `lang` | `zh` or `en`. |
| `query` | The query as the user typed it, after redaction. |
| `query_zh` | Chinese translation of an English query. Empty for `zh` rows. |
| `proposed_task_type` | Author's proposed parent profile: `prototype`, `ppt`, `marketing`, `hyperframes`, `image`, `document`, or `?` when the query alone cannot decide. |
| `proposed_skill` | Author's proposed specific skill (a `design-templates/<id>`), empty when no specific skill should stack. |
| `difficulty` | `easy` (one obvious answer), `medium` (two plausible skills), `hard` (task type itself is arguable). |
| `note` | Why the row is interesting, plus redaction or truncation flags. |
| `trace_id` | Langfuse trace id, for going back to the full session. |
| `day` | Trace date (UTC). |
| `agent` | Agent runtime that served the turn. |
| `label_task_type`, `label_skill`, `annotator` | Left empty for human annotation. The label columns are the ground truth; the `proposed_*` columns are only a starting point. |

## Conventions used in the proposals

- Landing pages, marketing sites, and docs pages are `prototype`. The
  `marketing` profile is reserved for campaign material sets (icons plus
  social cards, several ads), not for a single landing page.
- A single poster, logo, icon, or photo is `image`; anything that moves
  (video, kinetic type, app launch animation, "poster in motion") is
  `hyperframes`.
- `document` covers resumes, reports, manuals, cover pages, and PDF
  deliverables. The `document` task profile does not exist yet; rows labelled
  `document` are still valid ground truth for the router.
- `?` means the router is expected to ask (via `<question-form>`) or fall
  back to the generic contract; leaving the task type unresolved on those
  rows is not a failure.
- Desktop-app and 3D/WebGL requests are labelled `prototype` with
  `difficulty=hard`; whether they deserve their own profile is an open
  question for the annotators.

## How to annotate

1. Fill `label_task_type` for every row. Use the same vocabulary as
   `proposed_task_type`.
2. Fill `label_skill` only when one specific skill is clearly right. Leave it
   empty when the task profile alone is the correct answer.
3. Put your handle in `annotator`. Disagreements with the proposal are
   expected on `medium` and `hard` rows; add a short reason in `note`.

## Distribution of the proposals

| Task type | Rows |
| --- | ---: |
| prototype | 56 |
| image | 17 |
| ppt | 11 |
| document | 7 |
| hyperframes | 7 |
| marketing | 1 |
| ? | 1 |

This mirrors the observed traffic: prototype-shaped requests dominate, image
requests are the second largest group, and slides come third.

## Privacy

Rows are real user input. Names, emails, and URLs are redacted, but product
and brand names the user typed are kept because they carry routing signal.
Keep this file inside the repository's normal review flow and do not
re-publish it outside the project without a second redaction pass.
