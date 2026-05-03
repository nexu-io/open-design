---
title: Wix JA Slide Generator — Self-check List
tags: [project/wix-ja-slide-generator, qa]
created: 2026-05-04
referenced_by: SKILL.md Step 9
---

# Self-check List

skill が `result.json` を出力する前に、以下を全項目チェックする。1 つでも fail なら deck を修正してから出力。

## P0（必須・blocker）

- [ ] **数値・固有名詞・人名・日付の出所**：すべて outline またはユーザー Q&A 回答に明示されている。AI 想像で埋めたものはゼロ。
- [ ] **layouts.json に存在する canonical slide_id だけ使用**：catalog 外参照ゼロ。
- [ ] **master / layout 上のロゴ・固定テキスト**は変更していない（"Presentation name / YYYY" 以外）。
- [ ] **placeholder の object_id**は layouts.json 記載と完全一致。発明したIDで gog 呼び出しをしていない。

## P1（品質・行動指標）

### 字数 / 改行

- [ ] 各 placeholder の出力文字 cell 数が `estimated_max_cells_per_line × estimated_max_lines` 以内。
- [ ] 漢字熟語が改行で分かれていない（"開封"、"着手"、"獲得" などを目視確認）。
- [ ] 英単語が改行で分かれていない（"<newsletter-project>"、"Vol.001"、"Wix Studio" など）。
- [ ] 数字 + 単位が分かれていない（"<N>名"、"65%"、"12pt" など）。

### 行頭・行末禁則

- [ ] 行頭に `。、）」？！…・` などの禁則文字が来ていない。
- [ ] 行頭に `ぁぃぅぇぉっゃゅょー` などの小書き仮名 / 長音が来ていない。
- [ ] 行末に `（「『【` などの始め括弧が来ていない。

### 一致性

- [ ] deck-plan.md の用語辞典に従っている（"ハイライト" 統一、"主要トピック" 混入していない、など）。
- [ ] deck 全体のトーンが揃っている（フォーマル / カジュアルが混ざっていない）。
- [ ] 同じ事象を指す表現が章ごとに異なっていない。

## P2（推奨）

- [ ] 画像 placeholder がある layout で、画像 source が確定している（user upload / outline marker / filename heuristic のいずれか）。
- [ ] 画像 source 不明のページがあれば missingImages として result.json に列挙。
- [ ] 10 ページ超の deck で、`# 大見出し` ごとに section divider を挿入した。
- [ ] result.json の `missingFields` に `[要◯◯]` プレースホルダ全件を列挙。
- [ ] `deck-plan.md` を cwd に書き残し、判断の根拠を後追い可能にした。

## P3（運用）

- [ ] result.json の `layoutsUsed` 配列が deck の実 page 順と一致。
- [ ] result.json に `deckUrl` と `embedUrl` が含まれている。
- [ ] gog の置換ログ（"X occurrences"）を確認し、想定外のページに副作用が出ていないかチェック。

## fail 時の対応

| fail カテゴリ | 対応 |
|---|---|
| P0 fail | deck を出力しない。問題箇所を直してから再 self-check。 |
| P1 fail（字数 / 禁則） | 該当 bullet を書き直し。それでも収まらなければユーザーに QuestionForm で確認。 |
| P1 fail（一致性） | deck-plan.md の用語辞典を参照して全 page 修正。 |
| P2 fail | result.json の `missingFields` / `missingImages` に明記してユーザーに渡す（deck 出力は許可）。 |
| P3 fail | log を残してユーザーに通知。手動確認を促す。 |

## チェック方式

skill の Step 9 で以下を実行：

```bash
# 字数チェック（cell-based）
python3 references/check-cells.py < generated_content.json

# 禁則チェック（行頭・行末・分離）
python3 references/check-kinsoku.py < generated_content.json

# 数値・固有名詞ハルシネーション検出
python3 references/check-hallucination.py \
    --outline original_outline.txt \
    --content generated_content.json
```

これらの helper script は Iteration 1 で実装。Iteration 0（POC）では LLM の self-check で代用。
