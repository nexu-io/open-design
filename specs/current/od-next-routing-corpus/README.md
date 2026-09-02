# OD Next free-text routing corpus

Phase-0 evaluation corpus for the two-layer skill routing work: when the home
composer submits free text without a task type, the agent must (1) pick one
OD Next task profile and (2) optionally stack one specific skill on top of it.
This corpus is the gate for phase 1 (target: task-type accuracy >= 90%).

## Files

- `queries.csv` — 100 queries: 30 Chinese (`lang=zh`) and 70 English
  (`lang=en`, with a Chinese translation in `query_zh` for annotators).

## Columns

| Column | Meaning |
| --- | --- |
| `id` | Stable id `Q001`..`Q100`. |
| `lang` | `zh` or `en`. |
| `query` | The query exactly as a user would type it. |
| `query_zh` | Chinese translation of an English query. Empty for `zh` rows. |
| `proposed_task_type` | Author's proposed parent profile: `prototype`, `ppt`, `marketing`, `hyperframes`, `image`, `document`, or `?` when the query alone cannot decide. |
| `proposed_skill` | Author's proposed specific skill (a `design-templates/<id>`), empty when no specific skill should stack. |
| `difficulty` | `easy` (one obvious answer), `medium` (two plausible skills), `hard` (task type itself is arguable). |
| `note` | Why the row is interesting. |
| `label_task_type`, `label_skill`, `annotator` | Left empty for human annotation. The label columns are the ground truth; the `proposed_*` columns are only a starting point. |

## Conventions used in the proposals

- Landing pages, marketing sites, and docs pages are `prototype`. The
  `marketing` profile is reserved for campaign material sets (several social
  ads, a promo kit), not for a single landing page.
- A single poster or cover is `image`; a frame-by-frame animation is
  `hyperframes`.
- `document` covers the eight `document-*` templates. The `document` task
  profile does not exist yet; rows labelled `document` are still valid
  ground truth for the router.
- `?` means the router is expected to ask (via `<question-form>`) or to fall
  back to the generic contract; it is not a failure to leave the task type
  unresolved on those rows.

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
| prototype | 50 |
| ppt | 21 |
| document | 13 |
| image | 11 |
| hyperframes | 3 |
| marketing | 1 |
| ? | 1 |

Prototype is deliberately over-represented because it is the majority of
real free-text traffic and it has the largest specific-skill sub-tree.
