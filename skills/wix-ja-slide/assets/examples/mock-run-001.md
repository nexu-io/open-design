---
title: Mock Run 001 — Wix Japan 4月 Performance Report 8 ページ
tags: [project/wix-ja-slide-generator, mock, walkthrough]
created: 2026-05-04
referenced_by: SKILL.md §2 例示
---

# Mock Run 001: Wix Japan 4月 Performance Report

skill の動作を逐ステップで書き起こした reference。実際の Iteration 1 開発時、LLM 出力をこの walkthrough と比較して品質確認に使う。

## Persona

- **ユーザー**: <reviewer>
- **目的**: 月次の Performance Report を社内 + HQ に共有
- **頻度**: 月 1-2 回

## Turn 1: ユーザーが outline を chat に貼り付け

```
[ユーザーがチャット入力]

Wix Japan 4月 Performance Report、8 ページ作って。

# Executive Summary
今期の3大ハイライト:
- Japan <industry-event> 出展成功
- <newsletter-project> Vol.001 ローンチ
- <brand-project> JA ブランド着手

# Top Metrics
<industry-event>: 来場者と多数の接点
<newsletter-project>: 開封率 業界平均超
<brand-project> JA: スコープ確定、Q3 展開計画中

# <industry-event> Recap [image: dx-booth.jpg]
4/8-10 東京ビッグサイトで出展
ブースデザイン好評、Demo Site / Base44 / Swag を展示
来期も継続出展予定

# <newsletter-project> Launch [image: manazashi-cover.jpg]
社外向けデザインニュースレター Vol.001 を 4/15 配信
読者反応良好

# <brand-project> JA Progress
楽天向けブランドガイド着手
Strategy Framework 完成、Speech Draft 進行中
Q3 中の納品を目指す

# Next Month Focus
- Acquisition LP A/B test 結果分析
- <newsletter-project> Vol.002 制作
- <brand-project> JA Phase 2 展開
```

ユーザーは画像 2 枚も chat にドラッグ&ドロップ：
- `dx-booth.jpg`
- `manazashi-cover.jpg`

## Turn 1 → AI 内部処理

### Step 0: コンテキスト読み込み

```
Read: assets/layouts.json
Read: references/prompt-rules.md
Read: DESIGN.md (Wix Japan)
Read: outline (chat 本文)
Detect images in cwd: dx-booth.jpg, manazashi-cover.jpg
```

### Step 1.5: Outline gap 分析

outline をスキャンして「数値・固有名詞が必要そう」な主張を抽出：

| 項目 | 言及あり? | 必要? |
|---|---|---|
| <industry-event> 来場者数 | ✗ "多数の接点" 抽象 | △ 推奨 |
| <industry-event> Booth 体験率 | ✗ 言及なし | △ 推奨 |
| <newsletter-project> 開封率 | ✗ "業界平均超" 抽象 | △ 推奨 |
| <newsletter-project> 業界平均比較値 | ✗ 言及なし | △ 推奨 |
| <brand-project> JA 納品月 | ✗ "Q3 中" 漠然 | ○ 確認推奨 |
| Strategy Framework 完成度 | ○ "完成" | × 不要 |
| <brand-project> JA 担当者 | ✗ 言及なし | × このページでは不要（人名 layout 不使用） |

→ **AI が QuestionForm で 5 項目をユーザーに返す（1 ターンのみ）**

## Turn 2: AI から QuestionForm が返る

```
[QuestionForm UI]

deck を生成する前に、以下の数値・日付について教えてください。
わからない / 公開できない場合は空欄で OK です（その場合該当 bullet は定性的表現になります）。

[1] <industry-event> の来場者数:        [_____________]
[2] <industry-event> Booth の体験率（%）: [_____________]
[3] <newsletter-project> Vol.001 の開封率（%）: [_____________]
[4] <newsletter-project> の業界平均比較値: [_____________]
[5] <brand-project> JA の納品予定月（4-9 月）: [_____________]

[送信]
```

## Turn 3: ユーザーが回答

```
[1] 8,000 名
[2] 65
[3] 28
[4] 業界平均 12pt 上回る
[5] 9月（Q3 終盤）
```

## Turn 3 → AI 内部処理（deck 生成）

### Step 2: Deck-level pre-pass

`deck-plan.md` を生成：

```markdown
# Deck Plan — Wix Japan 4月 Performance Report

## 対象
HQ + 社内ステークホルダー
8 ページ、フォーマル寄り、数値ベースの月次報告

## トーン
- 簡潔・客観的（"成功した" でなく "8,000 名と接触" のような事実ベース）
- 数値があるところは数値、ないところは控えめな定性表現
- 漢字熟語多め、ビジネス文体

## 用語辞典
- "ハイライト" を使う（"主要トピック" / "重要事項" 不使用）
- "進行中" を使う（"-ing" / "ing 中" 不使用）
- "完成" で完了表現（"完了" / "終了" 不使用、混乱回避）
- 数字 + 単位は半角（"<N>名"、"65%"、"12pt"、"4/8"）
- 月数表現は "4月 / 5月"、"April / May" は不使用

## 章立て
1. Cover                  → COVER? (P7)
2. Executive Summary       → T+3B (P53 canonical)
3. Top Metrics             → T+3B (P53 復用)
4. <industry-event> Recap           → T+IMG (P83) ← image: dx-booth.jpg
5. <newsletter-project> Launch        → T+IMG (P31) ← image: manazashi-cover.jpg
6. <brand-project> JA Progress → T+3B (P53 復用)
7. Next Month Focus        → T+3B (P53 復用)
8. Closing                 → T-ONLY (P110)

## 全体長
8 ページ、divider 不要（10 ページ以下のため）。
```

### Step 5: ページごとの content 生成

**Page 1 (P7 Cover)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Headline | "Wix Japan 4月 Performance Report" | 18 latin + 4 JP = 13 cells ✓ |
| Subtitle | "2026年4月 / 東京オフィス" | 11 JP + 6 latin = 14 cells ✓ |
| Image | (cover image — placeholder 残し) | — |

**Page 2 (P53 T+3B Executive Summary)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Title | "今期 Wix Japan 主要ハイライト" | 16 cells ✓ |
| Bullet 1 | "Japan <industry-event> 出展成功" | 12 cells ✓ |
| Bullet 2 | "<newsletter-project> Vol.001 ローンチ" | 13 cells ✓ |
| Bullet 3 | "<brand-project> JA 着手" | 11 cells ✓ |

**Page 3 (P53 復用 Top Metrics)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Title | "今期パフォーマンス指標" | 11 cells ✓ |
| Bullet 1 | "<industry-event> 来場者 <N>名" | 14 cells ✓（数字使用） |
| Bullet 2 | "<newsletter-project> 開封率 28% 業界超" | 17 cells ✓（gigaぎりぎり） |
| Bullet 3 | "<brand-project> JA 9月 納品予定" | 13 cells ✓ |

→ Bullet 2 が 17 cells で limit ギリギリ。あと半角 1 字でも増えれば overflow。
→ AI は self-check で "tight but ok" として通過。書き直し候補も内部で持つ：
   "<newsletter-project> 開封率 28%（平均 +12pt）" → 18 cells で overflow → 不採用。
   現案で行く。

**Page 4 (P83 T+IMG <industry-event>)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Title | "Japan <industry-event> 2026 出展レポート" | 17 cells ✓ |
| Body paragraph | "4/8-10 東京ビッグサイトにて出展。来場者 8,000 名と接触、Booth 体験率 65%。Demo Site / Base44 / Swag を展示。来期も継続予定。" | (paragraph 上限不明、verified=false) |
| Image | dx-booth.jpg (cwd から取得) | — |

→ paragraph 字数上限が verified=false なので、結果を見て調整必要。

**Page 5 (P31 T+IMG <newsletter-project>)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Title | "<newsletter-project> Vol.001 配信開始" | 15 cells ✓ |
| Image | manazashi-cover.jpg | — |

**Page 6 (P53 復用 <brand-project> Progress)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Title | "<brand-project> JA Phase 1 進捗" | 17 cells ✓（タイトの上限内） |
| Bullet 1 | "Strategy Framework 完成" | 12 cells ✓ |
| Bullet 2 | "Speech Draft 進行中" | 12 cells ✓ |
| Bullet 3 | "9月 納品を目指す" | 8 cells ✓ |

**Page 7 (P53 復用 Next Month)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Title | "5月の重点アクション" | 9 cells ✓ |
| Bullet 1 | "LP A/B test 結果分析" | 12 cells ✓ |
| Bullet 2 | "<newsletter-project> Vol.002 制作" | 14 cells ✓ |
| Bullet 3 | "<brand-project> JA Phase 2 展開" | 14 cells ✓ |

**Page 8 (P110 T-ONLY Closing)**

| placeholder | 内容 | cell 数 |
|---|---|---|
| Headline | "ありがとうございました。" | 11 cells ✓ |

### Step 6: 画像処理

| Page | Image source | 動作 |
|---|---|---|
| 1 (Cover) | 未指定 | placeholder 残す。result.json `missingImages` に記録 |
| 4 (<industry-event>) | `[image: dx-booth.jpg]` outline marker → cwd `dx-booth.jpg` ✓ | gog drive upload → /api/google/slides/insert-image (Iteration 1 未実装なら skip + 警告) |
| 5 (<newsletter-project>) | `[image: manazashi-cover.jpg]` outline marker → cwd 確認 ✓ | 同上 |

**Iteration 1 制限**: image-into-placeholder API 未実装のため、Page 4/5 は画像枠を空のまま残し、result.json に "image insert pending" として明記。ユーザーが Slides を開いてから手動で画像配置する。

### Step 8: gog で書き出し

```bash
# 1. JP テンプレート copy
gog slides copy 1ENwLW7nzIqR8U_KjzchUh4Uxscd89LfHSuq8E5JOb1w \
    "Wix Japan 4月 Performance Report (AI Draft)"
# → 新 deck ID: 1XYZ...

# 2. 置換マップ
cat > /tmp/replacements.json <<EOF
{
  "字数上限：48字": "今期 Wix Japan 主要ハイライト",
  "字数上限：54字": "Japan <industry-event> 出展成功",
  ...
  "Lorem ipsum - Lorem ipsum dolor sit amet, consectetur adipiscing elit tempor incididunt ut labore et dolore.": "<brand-project> JA 着手"
}
EOF

# 3. apply
gog slides create-from-template 1XYZ... "(final title)" \
    --exact --replacements /tmp/replacements.json
```

> ⚠️ **既知の副作用**: P53 の Lorem ipsum 文字列は他 12 ページにも出現。create-from-template の置換は全 deck スコープのため、それらのページの Lorem ipsum も "<brand-project> JA 着手" に書き換わる。**Iteration 1 では受け入れ**（最終 deck は 8 ページに切り出すか、副作用ページを手動 cleanup）。Iteration 2 で page-scoped 置換に対応する daemon API を実装。

### Step 10: result.json

```json
{
  "deckId": "1XYZ...",
  "deckUrl": "https://docs.google.com/presentation/d/1XYZ.../edit",
  "embedUrl": "https://docs.google.com/presentation/d/1XYZ.../embed?start=false&loop=false",
  "totalPages": 8,
  "missingFields": [],
  "missingImages": [
    "page 1: cover image — please upload and insert manually"
  ],
  "imageSlots": [
    {"page": 4, "status": "pending", "reason": "Iteration 1: image insert into placeholder not yet supported. Image dx-booth.jpg uploaded to Drive (id: 1ABC). Insert manually in Slides editor."},
    {"page": 5, "status": "pending", "reason": "Same as above. Image manazashi-cover.jpg uploaded (id: 1DEF)."}
  ],
  "layoutsUsed": ["P7", "P53", "P53", "P83", "P31", "P53", "P53", "P110"],
  "knownSideEffects": [
    "Lorem ipsum 文字列が 12 ページにも出現するため、bullet 3 の置換は他ページにも適用された。最終配布前に他ページの cleanup または不要ページの削除が必要。"
  ]
}
```

## ユーザー review

ユーザー（<reviewer>）が deck を Slides で開いて確認：

- ✅ 8 ページ全部生成された
- ⚠️ Page 4, 5 の画像 placeholder が空 → 手動で挿入
- ⚠️ Page 12 など、Lorem ipsum 元の他ページに想定外文字列 → 削除 or cleanup
- ✅ 字数 / 禁則は OK
- ✅ 数値（<N>名、65%、28%）が正しく入っている

→ Iteration 1 として OK。実用には Iteration 2（image insert + page-scoped replacement）を待つ。

## 学んだこと（このモック実行から）

1. **Iteration 1 は image insert と page-scoped replacement が課題**——daemon API が無いと実用に厳しい
2. **Lorem ipsum の 13 ページ重複**は catalog 側の構造問題。canonical を選ぶ時、unique placeholder text を持つページを優先すべき。
3. **bullet 17 cells limit** はギリギリ過ぎる。LLM が cell 計算を間違える可能性を考えると、安全率 80% (= 14 cells) を内部 limit にすべきかも。
4. **deck-plan.md** が "なぜこの layout / なぜこの言葉" を後追いできるので、ユーザーが review しやすい。価値が高い。

## 次のモック (mock-run-002)

候補:
- <newsletter-project> Vol.002 制作プロセス deck（Strategy Brief）
- <industry-event> 2027 出展計画 deck（提案資料）
- Wix Studio 戦略立案 deck（<colleague> 担当）

これらは異なる shape mix（quote / large image / table 含む）を要求するため、catalog の他 canonical を活用する機会。
