---
title: Wix Japan Black
tags: [project/wix-ja-slide-generator, design-system, brand]
created: 2026-05-04
revised: 2026-05-05
schema: awesome-claude-design 9-section
source_of_truth: "MKT / Wix Com - Google Slides Template (Black)" 130-page template
template_id: 1UaAYw60JvGotNjx2fqosnZL1EKqZEps-oSq0eCxqT0U
---

# Wix Japan Black

> **このドキュメントの根拠**: Wix HQ の brand book は使用していない。ルールはすべて **130 ページ MKT Slides テンプレートから観察できた範囲のみ**。観察できないこと（具体的な hex 値、font weight 数値）は意図的に書いていない。スキルの agent は「テンプレートに無いことはやらない」を原則とする。

---

## Visual Theme & Atmosphere

テンプレート名 "MKT / Wix Com - Google Slides Template (Black)" + Slide 1 のサブタイトル "Palette Mono / 2024" から **モノクローム基調 + Black テーマ** が骨格。

観察できる空気感:
- Slide 4 タイトル "01 Openers + Badges" → セクション番号付きでビジネス資料的に整理されている
- Slide 26 / 27 のサンプル文 "This is a long, insightful and engaging quote" → 引用ページが想定されている
- Slide 110 "Thank you." → クロージング 1 単語、簡潔
- Slide 109 "010 Closers" → セクション境界が明示的
- Slide 60 "Full NameTitle" × 12 → メンバー紹介はグリッド形式

→ **トーン推定**: 静か、整理された、業務的。装飾より構造。

---

## Color Palette & Roles

**観察できる**:
- テーマ名: "Black"
- パレット名: "Mono"（Slide 1 サブタイトル "Palette Mono / 2024"）

**観察できない**（テンプレート メタデータから抽出不可、PDF 渲染して color-pick で取る必要がある）:
- 具体的な hex 値
- アクセント色の有無
- 状態色（success / warning など）の hex

**運用ルール**:
- skill が deck 生成する際、**色は変更しない**。テンプレートの既存 token をそのまま使う。
- テキスト色 / 背景色を hex 指定する Slides API call を発行しない（テンプレートの inheritance に任せる）。
- ユーザーが「色を変えたい」と要望した場合、まず Slides UI で手動編集を依頼。skill 自動変更は v2 以降。

---

## Typography Rules

**観察できる**:
- 130 ページに JP も Latin も混在。Slide 53 / 110 など JP のみのページもある
- テンプレートの英語名 "MKT / Wix Com" が Wix HQ ライン由来 → Wix Madefor フォントファミリーを想定

**観察できない**（gog read-slide ではフォント名・サイズが返らない）:
- 各 placeholder の正確なフォント family / weight / size

**運用ルール（Slides 編集時）**:
- skill は **font family を上書き設定しない**。テンプレートの既存 inheritance に任せる。Google Slides サーバが JP フォールバックで Noto Sans CJK JP に自動置換する（POC v2 で確認済み、自然に渲染される）。
- Wix Madefor JP（Jay 手作り）は **Slides ではなく PPTX エクスポート後** にローカル PowerPoint / Keynote 上で渲染される。Slides 編集時は気にしない。
- POC v2 の渲染確認: P53 を JP 文字で fill した結果、フォールバックで JP 文字も Latin 文字も統一感ある sans で表示された。

**JA 排版ルール（必須）**:

`references/prompt-rules.md` に詳述。要点のみ:
- 行頭禁則 / 行末禁則 / 分離禁則を必ず守る
- 助詞の **後** で改行優先
- 複合語（漢字熟語、英単語、数字+単位）絶対不破
- 字数は cell-based 計算（半角 0.5 / 全角 1）

---

## Component Stylings

**観察できる**（130 ページの shape 分布から逆算）:

| component | 出現テンプレート | 観察 |
|---|---|---|
| Bullet with arrow "→" | T+3B / T+5B / T+2B / T+4B / T+6B（計 18 ページ） | "→" U+2192 がデコレーション要素として独立配置。本文は別フィールド |
| Paragraph block | T+SUB / T-LONG（計 15 ページ） | 単行 sample "I'm a paragraph. Click here to..." の長さから 1-3 行想定 |
| Quote / Pull quote | T-LONG（計 4 ページ、P26-P27 等） | "This is a long, insightful and engaging quote" のような sample |
| KPI big number | DENSE-8 / DENSE-17（"+300M" pattern, P55-58） | 数値が大文字、単位が小文字、Lorem ipsum で context |
| Image frame | T+IMG / T+IMG×N / FULL-IMG（計 28 ページ） | Aspect ratio 不明、観察に slide preview が必要 |
| Section divider | T-ONLY セクションヘッダ（"01 Openers" "02.A Dividers" 等、計 11 個） | 番号 + 名前のみ、簡潔 |
| Closer | T-ONLY P110 "Thank you." | 1 単語 / 1 文のみ |

**運用ルール**:
- skill は component の shape を **追加・改変しない**。catalog の placeholder ID と original_text を引いて文字を差し替えるだけ。

---

## Layout Principles

**観察できる**（自動スキャンによる shape 分布、計 130 ページ）:

```
T-ONLY    23 ページ  ←簡潔、divider / opener / closer
T+IMG     15 ページ  ←画像 + 短文
T+SUB     11 ページ  ←タイトル + サブ / 段落
COVER?     7 ページ  ←表紙
T+3B       7 ページ  ←3 bullet
T+IMG×8    6 ページ  ←バッジグリッド / メンバー紹介
T+5B       4 ページ  ←5 bullet チェックリスト
T-LONG     4 ページ  ←長文 / quote
T+2B       4 ページ  ←2 bullet 対比
T+IMG×3    2 ページ  ←3 画像並列
... その他 (DENSE-N etc.)  約 35 ページ
```

→ **テンプレート設計者の意図**:
- 簡潔な単一メッセージ（T-ONLY が最大）
- ビジュアル単独表現（T+IMG, FULL-IMG）
- 並列リスト（T+NB family）
- モノクローム + ミニマル

**運用ルール**:
- 1 ページ 1 メッセージ（T-ONLY 多用が示すデザイン哲学）
- 並列構造 ≤6 件（catalog に T+6B はあるが T+7B+ は無い → 7+ は分割）
- 画像中心 layout が 30+ ページある → ビジュアル優先のスタイル

**Section structure**（テンプレート内蔵）:

```
01 Openers + Badges        (slide 4)
02.A Dividers              (slide 17)
02.B Dividers              (slide 21)
03 Paragraphs              (slide 25)
04 Lists / Info            (slide 37)
05 People                  (slide 59)
06 Text Highlight          (slide 61)
07 Infographics & Data     (slide 69)
08 Images & Text           (slide 79)
09 Grid boxes              (slide 93)
010 Closers                (slide 109)
011 PPT Badges             (slide 111)
```

→ deck 構成のリファレンス。skill が長い deck (>10 ページ) を作るときの section divider 候補。

---

## Depth & Elevation

**観察できる**: テンプレートに影 / グラデーション / 3D っぽい要素は見当たらない（130 ページ scan の text element 分析、装飾要素は箭頭 "→" のみ）。

→ **推測**: フラットデザイン。

**運用ルール**:
- skill は depth 効果を**指定しない**（box-shadow / gradient / blur など Slides API パラメータを送らない）。
- テンプレートの既存スタイルに任せる。

---

## Do's and Don'ts

### Do

- ✅ **テンプレートの placeholder text を完全一致で置換**（gog create-from-template --exact）
- ✅ **言語混在を許容**: <newsletter-project> / Wix Studio / <industry-event> などの英固有名詞はそのまま、和訳しない
- ✅ **数字 + 単位は半角**: "<N>名" "65%" "12pt"（テンプレートサンプル "+300M" に倣う）
- ✅ **複合語を保護**: 「開封」「着手」「進捗」を改行で分けない
- ✅ **箭頭は U+2192 "→"**（テンプレートの装飾要素と一致）

### Don't

- ❌ **テンプレートに無い色 / フォント / shape を発明しない**
- ❌ **master / layout 上の固定要素を書き換えない**（"Presentation name / YYYY" 以外）
- ❌ **outline に書かれていない数値・人名・日付を生成しない**（ハルシネーション禁止、SKILL.md §0 P0 ルール）
- ❌ **catalog 外のページを参照しない**
- ❌ **AI slop の典型 hex（`#6366f1` など）を埋め込まない**（craft/anti-ai-slop.md と整合）

### 微妙な領域（テンプレートから判断不可、要 Jay 確認）

- 角丸の有無 → テンプレート画像を見る必要
- グラデーションの可否 → 同上
- ALL CAPS の英文表現可否 → 同上
- emoji の利用可否 → 同上

→ **判定不能項目は skill が自動判断しない**。ユーザー（Jay）の指示があるまで保守的に避ける。

---

## Responsive Behavior

**観察できる**: テンプレートは 16:9 横長 1 アスペクト固定（Google Slides デフォルト）。

エクスポート対応:

| Format | 動作 |
|---|---|
| Google Slides (in-browser) | 16:9 / Noto Sans JP fallback で渲染 |
| PPTX export | 16:9 維持 / ローカルフォント置換は v2 |
| PDF export | 16:9 維持 / フォント embed |

縦長 / mobile portrait は別 skill で対応予定。

---

## Agent Prompt Guide

skill の agent が deck 生成時に守るべきこと（SKILL.md §0 と整合）:

1. **outline に無い情報を生成しない**（数値・人名・日付）。Step 1.5 で QuestionForm 経由でユーザーに確認。
2. **layouts.json の canonical のみ使用**。発明禁止。
3. **deck-plan.md を最初に書く**。トーン・用語辞典を deck 全体で統一。
4. **JP 禁則を全 placeholder で適用**。`references/prompt-rules.md` 参照。
5. **画像 source は明示マーカー優先**。曖昧なら QuestionForm 経由でユーザーに確認。
6. **Lorem ipsum / placeholder filler を最終 deck に残さない**（self-check P0）。
7. **master / layout 上の固定要素は触らない**。
8. **色・フォントの上書きを skill から発行しない**。テンプレート inheritance に任せる。

### Wix Japan 文体トーン（観察 + 想定）

テンプレートの sample text "I'm a paragraph. Click here to..." はニュートラルで指示的。Performance Report / 月次ハイライトでの実用想定:

- フォーマル寄り、客観的、淡々と事実ベース
- 自慢・誇張なし、数字で語る
- 「〜です」断定形（「〜と思います」より）
- 関係者への感謝は最後の Closing ページのみ
- 英固有名詞そのまま（無理に和訳しない）
- 略語の初出は full form 併記（"Q3（第 3 四半期）" 以降は "Q3"）

### 章節パターン推奨マッピング

| 章節タイプ | おすすめ canonical | 注意点 |
|---|---|---|
| 月次ハイライト 3 点 | T+3B (P53) ✅ verified | bullet 17 cells 以内 |
| KPI 集約 | T+3B (P53) | 数字 + 単位は半角、cell 計算 |
| イベント振り返り（画像あり） | T+IMG (P31) | image marker 必須 |
| ローンチ告知 | T+IMG (P31) | hero image + 短タイトル |
| プロセス 5 ステップ | T+5B (P42) | 順序明示 |
| 引用 / Quote | T-LONG (P26) | 「」記号、出処明記 |
| 表紙 | COVER? (P7) | タイトル + 期間 + ブランド画像 |
| クロージング | T-ONLY (P110) | "ありがとうございました。" のみ |

### 出力前必須チェック

result.json と result.json.artifact.json を出力する前に、`references/check-list.md` の P0 / P1 全項目クリア。
