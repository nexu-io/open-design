---
name: wix-ja-slide
description: |
  Wix Japan ブランドガイド準拠の Google Slides を outline から生成する。
  130 ページの Wix MKT テンプレートから shape 一致 layout を選択し、
  日本語禁則処理ルールに従って placeholder を埋める。
  数値・固有名詞は outline に書かれた範囲のみ使用、ハルシネーション禁止。
triggers:
  - "wix japan slide"
  - "wix-ja-slide"
  - "wix japan deck"
  - "wix japan performance report"
  - "月度報告"
  - "月次レポート"
  - "今期ハイライト"
  - "japan highlights deck"
od:
  mode: deck
  scenario: marketing
  preview:
    type: google-slides
    entry: result.json
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, anti-ai-slop]
  inputs:
    - name: outline
      type: string
      required: true
      description: |
        Markdown outline. Section headings (`#`) become potential dividers.
        Bullets (`-`) become bullets/items. Image markers `[image: filename.png]`
        bind images to their parent section.
    - name: deck_title
      type: string
      required: false
      description: 'Master の上部に出すデッキ名（例: "Wix Japan 4月 Performance Report"）'
    - name: deck_year
      type: integer
      required: false
      default: 2026
    - name: target_pages
      type: integer
      default: 8
      min: 4
      max: 30
  outputs:
    primary: result.json
    secondary: [deck-plan.md]
  capabilities_required:
    - file_write
    - bash_exec
---

# Wix JA Slide Skill

> **Skill root**: SKILL.md と一緒に `assets/layouts.json`、`references/prompt-rules.md`、`references/check-list.md` を絶対パスで読むこと。

このスキルは **outline → 130 ページの Wix MKT テンプレートから layout を選択 → 日本語禁則を満たした文字埋め込み → Google Slides に書き出し** までを実行する。

非設計者の Wix Japan 同僚が日常的に作る社内資料（月次ハイライト / Performance Report / Strategy Brief / 社外 briefing）が想定ユースケース。

---

## 0. 前提と禁忌

### 必ず読むファイル（Step 0）

1. **`assets/config.json`** — JP 副本テンプレート ID、デフォルト言語、deck 出力先 などのスキル設定。
2. **`assets/layouts.json`** — 130 ページの shape catalog。各 canonical layout の `use_for` ヒント・placeholder 仕様・字数制限。
3. **`references/prompt-rules.md`** — 日本語禁則処理ルール（行頭/行末禁則・分離禁止・助詞改行）。
4. **`DESIGN.md`**（active design system, `Wix Japan`）— トーン・配色・タイポグラフィ token。
5. **outline テキスト** — ユーザーがチャットで貼り付けた本文。

### 絶対禁止（最優先）

| | 禁止内容 |
|---|---|
| 🔴 P0 | **outline に書かれていない数値、固有名詞、人名、日付を生成・想像で埋めない**。Step 1.5 で**事前にユーザーへ質問して埋める**こと。それでも埋まらない場合のみ `[要◯◯]` プレースホルダで残し、deck 末尾の result.json に missingFields として明示報告する。 |
| 🔴 P0 | **assets/layouts.json に存在しない layout を発明しない**。catalog 130 ページ以外への参照禁止。 |
| 🔴 P0 | **slide の master / layout 上のロゴ・固定テキストを書き換えない**（"Presentation name / YYYY" 以外）。 |
| 🟡 P1 | **複合語を行跨ぎで分けない**（"開封"を"開"と"封"に分けるなど）。 |
| 🟡 P1 | **placeholder の字数上限を超える文字を生成しない**。超える場合はまず意味を保ったまま書き直す。書き直しても入らない場合は**ユーザーに確認**する（layout を変えるか outline を縮めるか）。 |

---

## 1. ワークフロー

### Step 1: コンテキスト取り込み

```
[必ず Read tool を使う]
1. assets/layouts.json     ← catalog 全体
2. references/prompt-rules.md  ← JA 禁則ルール
3. DESIGN.md               ← Wix Japan 視覚 token
4. ユーザー outline        ← チャット本文
```

outline が `[image: ...]` マーカーを含む場合、cwd 内のファイル一覧と照合して画像存在を確認する（次の Step で使う）。

### Step 1.5: Outline gap 分析 & ユーザー Q&A（Gap 2 fix: ハルシネーション根絶）

**deck 生成の前に、ユーザーと 1 ターン対話する**。これが`[要◯◯]`プレースホルダ満載で出来上がる失敗パターンを防ぐ唯一の方法。

#### 1.5.1 outline をスキャンして「数値が必要そうな主張」を抽出

| outline の表現 | 必要な数値 | 質問例 |
|---|---|---|
| "出展成功" / "好評" | 来場者数 / engagement 率 | "<industry-event> の来場者数や具体的な指標はありますか?" |
| "業界平均超" / "好調" | 開封率 / CTR / 比較値 | "<newsletter-project> の開封率（%）と業界平均はいくつですか?" |
| "完成" / "進行中" | パーセンテージ / 段階 | "Strategy Framework の完成度合いは何 % か、段階表現か?" |
| "Q3 中" / "来期" | 具体日付 | "Q3 のうち何月の納品予定ですか?" |
| "メンバー主導" | 人名 | "誰が主導していますか?" |

#### 1.5.2 質問を **`QuestionForm` UI 経由でまとめて返す**

open-design の sidebar には QuestionForm コンポーネントがある。**1 ターンで全 missing fields を一度に質問する**。バラバラに何度も聞かない。

例:

```
ユーザー: 「Wix Japan 4月 Performance Report 8 ページ、outline は ...」

AI Step 1.5 出力（QuestionForm として返す）:
  以下 5 項目について、今わかる数値・固有名詞を入力してください。
  わからない項目は空欄で OK ですが、その場合該当 bullet は定性的表現になります。
  
  [1] <industry-event> 来場者数:           [____]
  [2] <industry-event> Booth 体験率:        [____]
  [3] <newsletter-project> Vol.001 開封率:    [____]
  [4] <newsletter-project> 業界平均比較値:    [____]
  [5] <brand-project> JA 納品予定月:       [____]
  
  [送信]
```

#### 1.5.3 ユーザーが空欄で返した項目への対応

優先順位:

1. **定性的に書き直す** — "65%" を "高い体験率" に、"<N>名" を "多数の接点" に変換。最も自然。
2. **layout を別 shape に変える** — 数値 placeholder が必須の layout (例: stats-style) なら避けて T+3B に変更。
3. **最終手段として `[要◯◯]` プレースホルダ** — 上 2 つで対応できない場合のみ、deck に残す。result.json の missingFields に必ず列挙。

`[要◯◯]` は最後の最後。**できるだけ定性表現に逃げる**。

### Step 2: Deck レベル pre-pass（Gap 5 fix: 多頁一致性）

ページごとに生成する**前に**、deck 全体の方針を決める。これを `deck-plan.md` に書き出す。

決める項目：

```markdown
# Deck Plan

## 対象
{誰が読む / どの会議 / 公開範囲}

## トーン
{フォーマル / カジュアル / 数字重視 / ナラティブ重視}

## 用語辞典（deck 全体で統一）
- "ハイライト" を使う、"主要トピック"・"重要事項" は使わない
- 進捗を表すとき "進行中" を使う、"ing" は使わない
- 完了を "完成" で表現、"完了" は使わない（重複回避）
- 数字 + 単位は半角（"<N>名"、"65%"）

## 章立て（outline からのマッピング）
1. Cover
2. Executive Summary (T+3B)
3. Top Metrics (T+3B)
...
N. Closing (T-ONLY)

## 全体長
{N ページ。10 ページ超なら section divider 入れる}
```

**この pre-pass を飛ばすと、ページごとに語彙・トーンがブレる。**

### Step 3: Layout 選択（Gap 1 fix: shape マッチング）

outline の各セクションに対し：

1. **構造シグネチャを抽出**
   - `1 title + 3 bullets, no image` → `T+3B`
   - `1 title + paragraph + 1 image` → `T+IMG (paragraph variant)`
   - `1 title only` → `T-ONLY`
   - `1 image full bleed` → `FULL-IMG`
   
2. **`assets/layouts.json` の同 shape entries から canonical を選ぶ**
   - 各 canonical は `use_for: []` ヒントを持つ
   - outline セクションのテーマと一致度が高い entry を選択
   
3. **catalog に該当 shape が無い場合**
   - **発明しない**。代わりに同義の上位 shape にフォールバック（例: T+4B → T+3B + 補足を別ページ）
   - フォールバックも不可なら、ユーザーに「対応する layout が catalog にないため、outline を分割するか別構造にしてほしい」と返す

### Step 4: Section divider 自動挿入（Gap 7 fix）

deck が **10 ページ超** の場合のみ、outline の `# 大見出し` ごとに `T-ONLY` divider ページを挿入する。

10 ページ以下では強制しない（簡潔さ優先）。

例：
```
outline:
# Executive Summary
...
# Top Metrics
...

→ deck > 10 pages なら "01 Executive Summary" divider page を Top Metrics の手前に挿入
→ deck ≤ 10 pages なら挿入しない
```

### Step 5: ページごとの content 生成

各 placeholder に対し、以下の順序で文を作る：

#### 5.1 字数チェック（cell-based）

```python
def width(s):
    cells = 0
    for c in s:
        # CJK / 全角 = 1 cell、Latin / 半角 = 0.5 cell
        cells += 1.0 if is_fullwidth(c) else 0.5
    return cells
```

各 placeholder の `estimated_max_cells_per_line` × `estimated_max_lines` 以内に収める。

**`verified: true` でない placeholder の扱い（Bug 7 fix）**:

layouts.json の canonical のうち、現時点で字数 limit が **verified** されているのは P53 (T+3B) のみ。他の canonical は `estimated_max_cells_per_line: null` の状態。

null のときは以下の保守的な仮値を使う:

| placeholder role | 仮 max_cells_per_line | 仮 max_lines |
|---|---|---|
| title | 24 | 1 |
| subtitle | 30 | 2 |
| bullet_N | 14 | 1 |
| paragraph / body | 28 | 3 |
| caption | 16 | 1 |
| その他 (text_N) | 20 | 1 |

仮値で生成して、**ユーザーへの最終 result.json に `unverifiedLimits: true` を立てる**。レビュー時に Jay が POC で実 limit を確認 → layouts.json を update する循環。

#### 5.2 禁則処理

`references/prompt-rules.md` のルールを厳守：

- 行頭禁則: `。、）」？！…・ぁぃぅぇぉっゃゅょー`
- 行末禁則: `（「『【〔`
- 分離禁則: 複合語、英単語、数字+単位
- 助詞 `を/が/に/で/と/は/から/まで/の` の **後** で改行優先

#### 5.3 圧縮ルール（Gap 4 fix）

長すぎる場合は **意味を保ったまま書き直す**。**截断禁止**。

❌ NG（截断）:  
入力: 「東京ビッグサイトで Big Tech Japan 2026 にスポンサー出展」  
→ 出力: 「Big Tech Japan スポンサ」  ←重要 context 喪失、文意破壊

✅ OK（書き直し）:  
入力: 「東京ビッグサイトで Big Tech Japan 2026 にスポンサー出展」  
→ 出力: 「Big Tech Japan 2026 スポンサー出展」  ← 場所は subtitle / 別 placeholder へ

書き直しても入らない場合 → **ユーザーに QuestionForm で確認**:

```
このページの bullet が layout 容量を超えました（実 22 cells / 上限 17 cells）:
  「東京ビッグサイトで Big Tech Japan 2026 にスポンサー出展して...」

どう対応しますか?
  ○ outline を短く書き直してもらう（推奨）
  ○ 別 layout に変更（T+5B など、容量は増えるがレイアウト印象が変わる）
  ○ そのまま截断する（非推奨、文意が壊れます）
```

**LLM が単独で layout 升级を判断しない**。ユーザーの意思決定を待つ。

#### 5.4 数値・固有名詞ハルシネーション禁止（Gap 2 fix, **最優先**）

outline に書かれていない情報は **絶対に生成しない**。

| 状況 | 対応 |
|---|---|
| outline に「<industry-event> 出展成功」とだけある | "<industry-event> 出展、成果良好" など具体数字なし表現にする |
| outline に「来場者 8,000 名」と書いてある | そのまま使う |
| outline に「来場者多数」とある | 数字に**しない**。"多数の接点" などぼかす |
| 日付が outline に無い | `[要日付]` プレースホルダ |
| 人名が outline に無い | `[要担当者名]` プレースホルダ |

ユーザーが結果を見て `[要◯◯]` を見つけたら自分で埋める。AI が想像で埋めると Performance Report が誤情報になり信頼が失われる。

### Step 6: 画像処理（Gap 3 fix）

画像対応 layout（`T+IMG`、`COVER?`、`FULL-IMG`、`T+IMG×N`）に対し：

#### 6.1 画像源の確定

優先順：

1. **outline の `[image: filename.png]` マーカー** ← 最優先、明示的
2. **filename heuristic** — outline section 名と画像ファイル名の前方一致（例: section "<industry-event> Recap" + 画像 `dx-week-booth.jpg` → 一致）
3. **どちらも該当なし** → ユーザーに「このページの画像を指定してください」と返答（ハルシネーション禁止＝架空画像生成しない）

#### 6.2 画像のアップロードと挿入（Iteration 1 のスコープ）

**Iteration 1 では partial サポートのみ**。daemon-side `/api/google/slides/insert-image` 未実装のため、placeholder への挿入は**スキップする**。`curl` を呼んではいけない（404 になる）。

代わりに以下の動作を取る:

| layout shape | Iteration 1 の動作 |
|---|---|
| `FULL-IMG` (P33 など、全画面画像) | `gog slides replace-slide <slideId> <imagePath>` で全画面置換 ✅ |
| `T+IMG` (P31 など、framed 画像) | **スキップ**。result.json の `imageSlots` に `{page: N, status: "pending", reason: "Iteration 1: image-into-placeholder API not yet implemented"}` を記録。`missingImages` にも明示。Drive へのアップロードは事前にしておく（gog drive upload）と、後続の手動配置がスムーズ。|
| `T+IMG×N` (グリッド) | 同上、スキップ + result.json に明示 |
| `COVER?` (cover hero image) | 同上、スキップ + result.json に明示 |

```bash
# 画像 Drive 事前アップロード（後続手動配置用）
gog drive upload "/path/to/image.jpg" --json
# → returned id を imageSlots[].source に "drive:<id>" 形式で記録
```

> **重要**: Iteration 1 では agent は画像 placeholder への挿入を**試みない**。スキップして result.json で報告するだけ。Iteration 2 で daemon API 実装後、本 Step を更新。

### Step 7: Master / Header 設定（Gap 6 fix）

**Iteration 1 ではスキップ**。daemon-side `/api/google/slides/update-master` 未実装。`curl` を呼んではいけない。

代わりに以下の動作:

1. master の "Presentation name / YYYY" は**そのまま残す**（書き換えない）。
2. result.json の `knownSideEffects` に "master header / footer not customized — please edit manually in Slides under Slide → Edit theme" を記録。
3. ユーザーは Slides UI で手動で master を編集する（5 分作業）。

Iteration 2 で daemon API 実装後、本 Step を更新して `deck_title` / `deck_year` を自動書き込みに切り替える。

### Step 8: Slides API への書き出し

`gog slides create-from-template` と置換マップで実行する。**JP テンプレート ID は Step 0 で読んだ `assets/config.json` の `jp_template_id` から取得する**（ハードコード禁止）。

```bash
# Step 0 で読んだ config を使う
JP_TEMPLATE_ID=$(jq -r '.jp_template_id' assets/config.json)

# 1. JP テンプレートをコピー
gog slides copy "$JP_TEMPLATE_ID" "<deck_title>"
# → new presentation_id を取得（後の手順で使う）

# 2. 置換マップ（前 step で生成した layout-fills を JSON で書き出し）
cat > /tmp/replacements.json <<EOF
{
  "字数上限：48字": "今期 Wix Japan 主要ハイライト",
  "字数上限：54字": "Japan <industry-event> 出展成功",
  "字字字字字字...": "<newsletter-project> Vol.001 ローンチ",
  "Lorem ipsum - Lorem ipsum dolor sit...": "<brand-project> JA 着手",
  ...
}
EOF

# 3. 置換実行
gog slides create-from-template <copied_id> "<deck_title>" \
    --exact \
    --replacements /tmp/replacements.json
```

> **重要**: 文字列 key は P53 の例（"字数上限：48字"）のように catalog の元 placeholder text と完全一致しなければならない。`assets/layouts.json` から各 placeholder の `original_text` を引いて key にする。

### Step 9: Self-check（Step 7）

result.json を書く前に：

```
[ ] 全 page で字数 limit を満たしている
[ ] [要◯◯] プレースホルダの数を deck-plan.md に記録
[ ] 画像 placeholder で source 不明のものをユーザーに報告
[ ] 行頭・行末禁則を全 bullet で検証
```

### Step 10: result.json 出力 + artifact manifest sidecar 必須（Bug 1 fix）

最終の output を **2 つのファイルに分けて** cwd に書く。両方必須——manifest sidecar が無いと open-design の renderer が起動せず、UI 上で deck が表示されない。

#### 10.1 `result.json` (deck の primary 出力)

```json
{
  "deckId": "1ABC...",
  "deckUrl": "https://docs.google.com/presentation/d/1ABC.../edit",
  "embedUrl": "https://docs.google.com/presentation/d/1ABC.../embed?start=false&loop=false",
  "totalPages": 8,
  "missingFields": ["[要数値] (page 3, bullet 2)", "[要日付] (page 5)"],
  "missingImages": ["page 1: cover image — please upload manually"],
  "imageSlots": [
    {"page": 4, "status": "pending", "reason": "Iteration 1: image insert API pending", "source": "drive:1XXX"},
    {"page": 5, "status": "pending", "reason": "Iteration 1: image insert API pending", "source": "drive:1YYY"}
  ],
  "layoutsUsed": ["P7", "P53", "P53", "P83", "P31", "P53", "P53", "P110"],
  "knownSideEffects": [
    "Lorem ipsum 文字列が他 12 ページにも置換適用された。最終配布前に手動 cleanup 必要。",
    "Master header / footer not customized — please edit manually in Slides under Slide → Edit theme"
  ],
  "unverifiedLimits": false
}
```

#### 10.2 `result.json.artifact.json` (manifest sidecar)

```json
{
  "version": 1,
  "kind": "google-slides-deck",
  "title": "Wix Japan 4月 Performance Report",
  "entry": "result.json",
  "renderer": "google-slides",
  "status": "complete",
  "exports": ["html"],
  "createdAt": "2026-05-04T10:30:00Z",
  "updatedAt": "2026-05-04T10:30:00Z",
  "sourceSkillId": "wix-ja-slide",
  "designSystemId": "wix-japan",
  "metadata": {
    "deckId": "1ABC...",
    "totalPages": 8
  }
}
```

> **チェック**: `result.json.artifact.json` を書いた後、open-design Web UI の右ペインで Slides /embed iframe が表示されればパイプライン成功。表示されなければ manifest の `kind` または `renderer` 値を確認（`google-slides-deck` / `google-slides` 完全一致）。

`deck-plan.md` も cwd に書き残し、ユーザーが後で「なぜこの layout / なぜこの語彙」を辿れるようにする。

---

## 2. 例示（mock run reference）

入力 outline と出力対応の例は `examples/mock-run-001.md` 参照。Wix Japan 4月 Performance Report 8 ページの mock を walkthrough している。

---

## 3. テスト・改善ループ

ユーザーが result の deck を見た後、改善要望が来た場合：

- 「ページ X の bullet が長すぎる」 → 該当 page だけ regenerate（layout は維持、content だけ書き直し）
- 「layout を変えたい」 → そのページだけ別 canonical を選び再書き出し
- 「全体トーンがフォーマルすぎる」 → deck-plan.md のトーン項目を更新して全 page regenerate

各 turn で **deck-plan.md と result.json を update**、過去版は `deck-plan.v1.md` のように残す（diff 可能にする）。

---

## 4. 既知の制限（Iteration 1）

### 4.1 機能制限

- 画像 placeholder への挿入は **FULL-IMG 限定**（v2 で T+IMG / T+IMG×N / COVER? 対応予定）
- Master / Header の deck 名・年号書き換えは**手動**（v2 で daemon-side API 経由）
- Comment / refine の per-element クリック編集はサポート外（Slides /embed が読み取り専用のため）
- PPTX 導出時の Madefor JP 自動 swap は未対応（v2、Workspace 字体目录推進と並行）

### 4.2 サポート外 shape（Bug 8 fix）

130 ページ catalog のうち以下の shape は Iteration 1 で**選択・利用しない**:

| shape | 理由 | 代替 |
|---|---|---|
| `DENSE-8`, `DENSE-9`, `DENSE-10`, `DENSE-11`, `DENSE-12`, `DENSE-13`, `DENSE-17`, `DENSE-19`, `DENSE-22`, `DENSE-27`, `DENSE-39` | 文本 element 数が 8 個以上の高密度 layout（table / multi-column comparison）。canonical 未選定、placeholder ID マッピング困難 | 内容を分割して T+3B / T+5B 複数ページに展開する |
| `T+2items`, `T+3items`, `T+4items`, `T+5items`, `T+6items` | 箭頭装飾なしの items 並列 layout。canonical 未選定 | 同 N の `T+NB`（箭頭付き）で代替 |
| `T+4B`, `T+6B` | canonical 未選定（POC 未実施） | T+3B または T+5B に丸める |
| `T+IMG×2`, `T+IMG×12` | canonical 未選定 | T+IMG×3 または T+IMG×8 に丸める |
| `EMPTY` | 完全空白 layout、用途不明 | 利用しない |

ユーザー outline がサポート外 shape を要求する場合、agent は代替案を **QuestionForm で確認** してから進む。**catalog にあるからといって発明・推測で利用しない**。

### 4.3 字数 limit verified 状況

11 個の canonical のうち、`estimated_max_cells_per_line` が **verified** されているのは P53 (T+3B) のみ。他 10 個は POC 未実施で null のため、SKILL.md §5.1 の保守的な仮値で運用する。

Iteration 1 期間中に Jay が POC を順次実施 → layouts.json を update する循環。result.json には `unverifiedLimits: true` を立てて警告。

---

## 5. 関連ファイル

```
skills/wix-ja-slide/
├── SKILL.md                 ← このファイル
├── assets/
│   ├── config.json          ← jp_template_id などスキル設定（Step 0 で読む）
│   ├── layouts.json         ← 130 ページ catalog（auto-generated from gog scan）
│   └── examples/
│       └── mock-run-001.md  ← Performance Report 8 ページ mock
└── references/
    ├── prompt-rules.md      ← JA 禁則ルール
    └── check-list.md        ← Self-check items
```

`design-systems/wix-japan/DESIGN.md` は別 path、daemon が自動 inject する。
