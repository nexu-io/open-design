---
title: Wix Japan — Design System (DESIGN.md)
tags: [project/wix-ja-slide-generator, design-system, brand]
created: 2026-05-04
schema: awesome-claude-design 9-section
deploy_path: design-systems/wix-japan/DESIGN.md
needs_review_by: Jay (Wix brand book と照合) + <reviewer>（Wix Japan tone 確認）
---

# Wix Japan

> **Status**: Draft v0.1。AI が consume する design system spec。Wix HQ の brand guidelines に照合した上で確定する必要あり（特に accent color hex、font weight 指定）。`[要確認]` マーカーは Jay レビュー対象。

---

## Visual Theme & Atmosphere

Wix の現行ブランドは **「自信ある黒、信頼の白、選び抜かれた色彩」** が原則。Japan localization では**呼吸感**と**漢字密度の余白**を意識する。

- **トーン**: 落ち着いた自信 / 過剰装飾なし / プロフェッショナル
- **想定空気感**: 現代美術館の壁、洗練された Editorial 誌、信頼感のあるビジネス資料
- **避けるべき空気感**: ポップなテック企業 / カラフル過剰 / kawaii / 装飾過多

deck で表現する基本姿勢:
- 大胆なタイトル + 静かな本文
- 余白で語る（情報密度が高くても余白を切らない）
- 1 ページ 1 メッセージ（複数主張を詰め込まない）

---

## Color Palette & Roles

### Primary

| Role | Token | Hex | 用途 |
|---|---|---|---|
| Primary text | `--ink` | `#000000` | 標題・本文・主役テキスト |
| Background | `--paper` | `#FFFFFF` | スライド背景・カード地 |
| Accent | `--accent` | `[要確認: 0C6EFD?]` | 強調・リンク・KPI 数字 (1 ページ最大 2 箇所) |

### Supporting

| Role | Token | Hex | 用途 |
|---|---|---|---|
| Muted text | `--ink-muted` | `#666666` | 副文・補足・キャプション |
| Border | `--line` | `#E5E5E5` | 区切り線・テーブル罫線 |
| Surface alt | `--surface-2` | `#F5F5F5` | hero block・引用ボックス背景 |

### Status (使用は最小限)

| Role | Hex | 用途 |
|---|---|---|
| Success | `[要確認]` | 完了・KPI 達成のみ。装飾的に使わない |
| Warning | `[要確認]` | リスク・注意のみ |

### 制約

- **1 page につき accent 使用は最大 2 箇所**（タイトルの 1 単語 + KPI 数字 など）。乱発すると視覚 noise になる
- **Status カラーは情報伝達目的のみ**。色だけで意味を伝えない（必ずテキストラベル併用）
- **グラデーションは禁止**（Wix MKT template に存在しない、AI slop 警告）

---

## Typography Rules

### 字体

| 用途 | Slides 上 (proxy) | Export 後 (PPTX/Keynote, ローカル) |
|---|---|---|
| Display / Headline | **Noto Sans JP Bold** | **Wix Madefor Display JP Bold** |
| Body / Paragraph | **Noto Sans JP Regular** | **Wix Madefor Text JP Regular** |
| Body emphasis | **Noto Sans JP SemiBold** | **Wix Madefor Text JP SemiBold** |
| Latin in mixed text | (上に同じ — Noto がカバー) | **Wix Madefor Display / Text** (英文部) |

> **重要**: Google Slides は custom font をサポートしない。Slides 編集中は Noto Sans JP fallback、PPTX エクスポート後にローカルの Wix Madefor JP に置換する 2 段階運用。

### サイズ階層 (cells based)

| 階層 | 用途 | サイズ感 |
|---|---|---|
| H1 | スライドタイトル | 36-48 pt（Wix MKT template の P53 タイトル相当） |
| H2 | サブタイトル / セクション見出し | 24-30 pt |
| Body | 本文 / Bullet | 14-18 pt |
| Caption | 補足 / page number | 10-12 pt |

### 行間 / 字間 (JP optimization)

- **行間 (line-height)**: H1 1.2 / H2 1.3 / Body 1.5-1.6 / Caption 1.4
  - JP 本文は 1.5+ 必須（漢字密度のため英語より高め）
- **字間 (letter-spacing)**:
  - H1 (JP): -0.02em（やや詰める）
  - H1 (Latin): 0em
  - Body: 0em（標準）
  - ALL CAPS Latin: +0.06em（craft/typography.md 規則）

### JP 禁則 (詳細は references/prompt-rules.md)

- 行頭禁則・行末禁則・分離禁止を必ず守る
- 助詞（てにをは）の **後** で改行優先
- 複合語（漢字熟語、英単語、数字+単位）は絶対に分けない

---

## Component Stylings

### Bullet List

```
→ Item 一文（17 cells 以内、1 行）
  - 箭头マーカー: "→"（U+2192）、accent カラー、非太字
  - インデント: 半角 4 字相当
  - 改行: 1 bullet = 1 行（折り返さない）
```

### KPI Block

```
[Big number]    [Label]
  +28%          開封率（業界平均 +12pt）
```
- Big number: H1 サイズ + accent カラー
- Label: Body Regular + ink-muted

### Quote / Pull Quote

```
「This is a long, insightful and engaging quote
 from a stakeholder or customer.」
                              — Source attribution
```
- 鉤括弧使用（"" ではなく「」）
- 引用元は em-dash + 名前 / 役職

### Divider

- ページ全幅の細い罫線（1px、`--line` カラー）
- セクション間でのみ使用。本文中では使わない

### Image Frame

- フルブリード or padding 24-48 px 内
- アスペクト 16:9 / 1:1 / 3:4 のいずれか
- 角丸**禁止**（Wix Madefor 系の硬質感を維持）

---

## Layout Principles

### Grid

- 12 カラム グリッド（Wix MKT template 標準）
- ガター 24 px、左右マージン 64-96 px

### Vertical Rhythm

- セクション間: 48 px
- 段落間: 16-24 px
- 行内: line-height で表現

### Hierarchy

- **One H1 per page**。タイトルは必ず最上部か左上
- 視線誘導は **左上 → 右下** または **上 → 下** の単純な流れ
- Z パターンや F パターンを意識（特に画像 + テキスト混在ページ）

### 余白

- 「迷ったら余白を増やす」が原則
- 1 ページに最大 5 件の情報単位（タイトル・bullet・キャプション含めて）
- 余白を埋める装飾要素は避ける

---

## Depth & Elevation

Wix MKT template は **flat design**。影・3D・グラデーション・ぼかしを基本使わない。

- **Shadow**: 一切使わない（modal や dropdown を除く、deck 内では不要）
- **Border**: 1px solid のみ。装飾的な多重線は使わない
- **Glow / Blur**: 禁止

例外:
- 画像内には任意の depth 表現があって良い（写真自体の depth）
- セクション divider は罫線のみで表現（影なし）

---

## Do's and Don'ts

### Do

- ✅ **静かに語る**: 1 ページ 1 メッセージ、余白を保つ
- ✅ **数字に語らせる**: 形容詞より KPI 数字を出す（"成功" でなく "8,000 名と接触"）
- ✅ **漢字熟語を活用**: "推進"・"展開"・"着手" など 2-3 字熟語で密度上げる
- ✅ **アクセントは scarce**: 1 ページ accent 色 2 箇所以下
- ✅ **句読点は半角コンマ + 全角句読点併用**: 数字内 "<N>名"、文末 "了。"
- ✅ **行末助詞ぶら下げ OK**: 「〜を」「〜が」で終わる行は自然

### Don't

- ❌ **AI slop 警告**:
  - `#6366f1`（AI default インディゴ）禁止
  - グラデーション禁止
  - 過剰絵文字（1 deck に 0-2 個まで、emoji は装飾でなく機能）
  - 「驚くほど〜」「画期的な〜」など誇大形容詞禁止
- ❌ **横書き混在**: 縦組みは使わない
- ❌ **半角片仮名**: ｺﾞｼｯｸ など機能的にも審美的にも禁止
- ❌ **三点リーダー**: "..." でなく "…"（U+2026）使う
- ❌ **ALL CAPS の JP 文字**: そもそも JP には CAPS 概念なし、デザイン的にも崩れる
- ❌ **本文での Wix ロゴ流用**: ロゴは master/footer のみ

---

## Responsive Behavior

このスキルは **Google Slides 16:9 専用**。レスポンシブ対応は不要。

ただし下記のエクスポート対応:

| Format | 動作 |
|---|---|
| Google Slides (in-browser) | 16:9 default、Noto Sans JP fallback で表示 |
| PPTX export | 16:9 維持、ローカル Wix Madefor JP に切替（フォント置換 v2） |
| PDF export | 16:9 維持、フォント embed |
| Print | 横長 A4 や A3 縮小印刷可 |

縦長フォーマット（mobile / portrait）は別スキルで対応予定。

---

## Agent Prompt Guide

### deck 生成時に守るべきこと

1. **outline に書かれていない数値・固有名詞は絶対に生成しない**（Step 1.5 で QuestionForm 経由でユーザーに確認）
2. **layouts.json の canonical layouts のみ使用**。発明禁止。
3. **deck-plan.md を最初に書く**。トーン・用語辞典を deck 全体で統一
4. **1 page につき accent 色は 2 箇所以下**。守れない layout は別 canonical に変更
5. **JP 禁則を全 placeholder で適用**（references/prompt-rules.md）
6. **画像 source は明示的指定優先**（[image: filename] marker）
7. **Lorem ipsum / placeholder text を最終 deck に残さない**（self-check P0）
8. **master / layout 上の固定要素は触らない**（"Presentation name / YYYY" 以外）

### Wix Japan 文体トーン

- フォーマル、客観的、淡々と事実ベース
- 自慢・誇張なし。数字で語る
- 「〜と思います」より「〜です」断定形
- 関係者への感謝は最後の Closing ページのみ
- 英単語は無理に和訳しない（"<newsletter-project>"、"Performance Report" など固有名詞そのまま）
- 略語の初出は full form 併記（"Q3（第 3 四半期）" 以降は "Q3"）

### 章節パターン

| 章節タイプ | おすすめ layout | 注意点 |
|---|---|---|
| 月次ハイライト 3 点 | T+3B (P53) | 並列 3 件、各 17 cells 以内 |
| KPI 集約 | T+3B (P53) または DENSE-8 数字版 | 数字は accent カラー、各 KPI 1 行 |
| イベント振り返り | T+IMG (P83) | image marker 必須、本文 paragraph 1-3 段 |
| ローンチ告知 | T+IMG (P31) | hero image + シンプルタイトル |
| プロセス紹介 | T+5B (P42) | 5 ステップ、順序明示 |
| 引用 / Quote | T-LONG (P26) | 「」記号、出処明記 |
| 表紙 | COVER? (P7) | タイトル + 期間 + ブランド画像 |
| クロージング | T-ONLY (P110) | "ありがとうございました。" のみ、装飾なし |

### 出力チェックリスト

result.json 出力前に、必ず references/check-list.md の P0 / P1 を全項目クリア。
