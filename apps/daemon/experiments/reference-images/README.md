# Reference-image experiment (evaluation branch only, 2026-09-30)

Control arm: parent commit 2c2d78c7bc, no experiment code. The agent receives the
evalset_4.0 v9 question verbatim.

Image arm: this commit. For the exact initial prompt of each of the 15 evalset_4.0 v9
questions, it appends one fixed sentence (identical for every case, not derived from
the image) and attaches one frozen image through the ordinary upload pipeline:

    用户已从候选参考图中选定此方向，请参考其整体风格与版式方向生成，不要照搬图中的文字、品牌名和具体内容。

Images were selected by the pre-registered rules in
https://powerformer.feishu.cn/docx/RBABdVHKbo3tWsxbOOJchwuLnth before any generation.

| Case | File | Source | SHA-256 |
|-|-|-|-|
| OD-EVAL-002 | OD-EVAL-002.jpg | https://robinhood.com/us/en/legend/ | 0bd36d2dda3d… |
| OD-EVAL-003 | OD-EVAL-003.webp | https://edos.one/en | 8ab60e2ecdf4… |
| OD-EVAL-005 | OD-EVAL-005.png | https://support.omadanetworks.com/en/document/109105/ | d77bd22dcb8d… |
| OD-EVAL-008 | OD-EVAL-008.png | https://apps.apple.com/us/app/pok%C3%A9mon-tcg-pocket/id6479970832 | c0a610ccc041… |
| OD-EVAL-010 | OD-EVAL-010.png | https://apps.apple.com/us/app/sweetgreen/id594329490 | 3a2d54e140ba… |
| OD-EVAL-011 | OD-EVAL-011.png | https://apps.apple.com/us/app/pill-reminder-mytherapy/id662170995 | 34f27bee38c3… |
| OD-EVAL-014 | OD-EVAL-014.webp | https://edos.one/en | 6e7947f4366f… |
| OD-EVAL-015 | OD-EVAL-015.png | https://sspai.com/ | 4efe0d795056… |
| OD-EVAL-017 | OD-EVAL-017.png | https://help.fieldwire.com/hc/en-us/articles/202909260-How-to-use-the-Single-Plan-View-and-Markup-Tools-Web | 6f996b4bf557… |
| OD-EVAL-020 | OD-EVAL-020.png | https://www.tripodking.com.tw/ | 9955a9b6221c… |
| OD-EVAL-022 | OD-EVAL-022.png | https://kyleconrad.com/ | 8edb14c7131b… |
| OD-EVAL-024 | OD-EVAL-024.png | https://www.metalab.com/ | 7e07c7141a3a… |
| OD-EVAL-025 | OD-EVAL-025.png | https://superwhisper.com/docs/get-started/essential-settings | 7f368383cfbc… |
| OD-EVAL-028 | OD-EVAL-028.png | https://kling.ai/quickstart/ai-lip-sync-guide | 209a5ebb3b7b… |
| OD-EVAL-029 | OD-EVAL-029.png | https://apps.microsoft.com/detail/9NBLGGH4QGHW | 6c40a74e373f… |

Missing or corrupt images fail the request rather than silently producing a
text-only treatment. Do not merge or deploy this branch.
