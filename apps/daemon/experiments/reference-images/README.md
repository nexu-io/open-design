# Reference-image experiment (evaluation branch only, 2026-09-28)

Control arm: parent commit, no experiment code. The agent receives the evalset_4.0 v9
question verbatim.

Image arm: this commit. For the exact initial prompt of eval-OD-EVAL-022/003/028 only,
it appends one fixed sentence (identical for every case, not derived from the image)
and attaches one frozen image through the ordinary upload pipeline:

    用户已从候选参考图中选定此方向，请参考其整体风格与版式方向生成。

| Case | File | Source | SHA-256 |
|-|-|-|-|
| OD-EVAL-022 | OD-EVAL-022.jpg | cannele.framer.website/projects (Calenne template), 1265x712 | 7a91ed25… |
| OD-EVAL-003 | OD-EVAL-003.webp | edOS Teacher Dashboard product screenshot, 1440x1452 | 8ab60e2e… |
| OD-EVAL-028 | OD-EVAL-028.png | Kling AI creative space, official guide kling.ai/quickstart/ai-lip-sync-guide, 1653x958 | 209a5ebb… |

Missing or corrupt images fail the request rather than silently producing a
text-only treatment. Do not merge or deploy this branch.
