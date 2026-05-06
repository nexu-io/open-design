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

#### 1.0 daemon project レコードを登録（**Round 11 v2、必須**）

cwd は通常 `~/Code/open-design/.od/projects/<projectId>/`。**daemon の sqlite に project レコードがあるかを確認**し、無ければ作る:

```bash
# 確認: project が daemon DB にあるか
curl -s "http://localhost:<daemon_port>/api/projects/<projectId>" | jq -r '.project.id // "missing"'

# 無ければ POST して作る
curl -X POST "http://localhost:<daemon_port>/api/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "<projectId>",
    "name": "<読みやすい deck title>",
    "skillId": "wix-ja-slide",
    "designSystemId": "wix-japan",
    "metadata": {}
  }'
```

これを skip すると web UI の主页 Designs リストに deck が出ない（Phase 6 まで Round 7-11 で実際に発生していた問題、backfill が必要だった）。

cwd の `<projectId>` は path basename で取れる（例: `wix-ja-e2e12-1777950000`）。「読みやすい title」は outline の最上位 `# 大見出し` を採用、無ければ projectId をそのまま。

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

#### 1.5.4 outline-level 字数 fit 事前評価（Round 15 polish）

Step 9.5 の視覚 self-check で発見した overflow / wrap を round-trip で修正するのはコスト高い（R14 で 6 round、R15 で 5 round。各 round が ~1-2 分）。outline 段階で粗い fit estimate を作って早期に push back することで round 数を 2-3 に削減できる。

各 outline section について以下を計算:

```
section_body_cells = sum over each line of body content:
  cells(line) using JP=2 / latin=1 rule
```

候補 canonical 群（image-marker rule + scenario hint + N-bullet match で絞った後）に対し、各 placeholder 容量と比較:

| canonical | 概算 body 容量（JP cells、verified=false は推定） |
|---|---|
| T+3B (P53, verified) | 3 × 17 = 51 cells |
| T+5B (P42) | 5 × 14 = 70 cells（推定） |
| T+SUB (P28) | 80 cells（subtitle 単一）|
| T-LONG (P26) | 180 cells（quote）|
| T+IMG (P31) | 60 cells（推定）|
| T+IMG (P83) | 100 cells（paragraph variant）|

`section_body_cells > capacity × 1.15` の場合、**Step 1.5 の Q&A 段階で同時にユーザーに通告**:

```
[警告] section "<title>" の body 約 <X> cells、選定候補 layout の容量を <Y>% 超過。
       選択肢:
         A) body を ~<削減目標> cells に圧縮する（おすすめ）
         B) layout を T-LONG / T+IMG P83 (paragraph variant) に切り替える
         C) section を 2 page に分割する
       どれにしますか?
```

これは Step 9.5 の視覚 self-check の前段で行う「outline level 圧縮提案」。Round 15 で 4 件の overflow が事前回避できれば 1-2 round 短縮できる見込み。

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

### Step 3: Layout 選択（Gap 1 fix + Round 4 厳格化）

#### 3.0 厳格 canonical モード（**Round 4 で発見、最優先**）

**ルール**: `assets/layouts.json` の `shape_canonicals[X].canonical_slide_id` だけを使う。**all_layouts から代替 P 番号を探すな**。`all_layouts` は参考データ — 元 deck にどんな slide があったかを記録するだけで、layout プールではない。

**理由**: Round 4 で agent が T-ONLY shape の代替として **P59 (05 People divider)** や **P109 (010 Closers divider)** を選んでしまった。これらは section divider 専用で、header / WIX logo が無い page になる。

```
✅ T-ONLY を使う場合は **P110 (Thank you.)** のみ — shape_canonicals.T-ONLY.canonical_slide_id
❌ P59 / P109 / P4 / P17 etc. の section divider は使わない
```

**禁止 P 番号**（all_layouts で `section_divider: true` または `skill_use_policy: "do_not_use_for_content"`）: 4, 17, 21, 25, 37, 59, 61, 69, 79, 93, 109, 111, 112, 121, 124

これらの P を選んだ時点で **layout 選択 NG**。shape_canonicals にある canonical だけ使う。

#### 3.0.1 Canonical の再利用は OK（**Phase 6 で可能になった、最重要更新**）

> Phase 5 までは「8 sections の deck では 8 distinct canonicals 必須」「kept slides は元 template の物理位置順に並ぶ」という制約があった（`replaceAllText` の deck-wide bleed 由来）。**Phase 6 で daemon に per-objectId の `update-text` + `duplicate-slide` + `update-slides-position` を追加**したため、両制約は消えた。

**新方針**:
- 同じ canonical を deck 内で **複数 page で再利用してよい**（例: T+3B P53 を Exec Summary / <brand-project> / Next Month の 3 page で使う）
- canonical 選択は **scenario 適合性のみで判断**。distinctness を気にしない
- 「物理位置序単調増加」も不要 — 後で `update-slides-position` で narrative 順に並べ替える

→ Phase 5 で agent が「distinct を満たすため不適 layout に逃げる」現象（<industry-event> が FULL-IMG に逃げた / Cover が T-LONG quote layout になった）が発生していた。Phase 6 ではこれが起きない。再利用を恐れるな。

#### 3.0.5 画像マーカーの精密ルール（Round 4 + Round 5 で発見）

outline の section に `[image: ...]` マーカーがある場合の layout 選択は **section に body 文字があるかどうか** で分岐する:

| section 構成 | 必須 canonical | 禁止 |
|---|---|---|
| `[image:]` + 標題 + body 文字（複数行） | **T+IMG (P31 or P83)** ← 画像 + 文字両方持つ | T-LONG (画像なくなる) / T+SUB (画像なくなる) / **FULL-IMG (文字なくなる、Round 5 regression)** |
| `[image:]` + 標題のみ（短く 1 行） | **T+IMG (P31)** | FULL-IMG（標題も消える） |
| `[image:]` のみ（文字無し、視覚的章扉り想定） | FULL-IMG (P33) | — |

**FULL-IMG は body 文字を持てない layout**。outline section に「4/8-10 東京ビッグサイトで出展...」のような body text がある時、FULL-IMG を選ぶと**全文字が消える**。これが Round 5 で起きた <industry-event> / <newsletter-project> の崩壊。

```
❌ <industry-event> section ([image:] + 4/8-10 body text) → FULL-IMG (P33) → 文字全消失
❌ <industry-event> section ([image:] + body) → T-LONG (P26) → 画像消失
✅ <industry-event> section ([image:] + body) → T+IMG (P31 or P83) → 画像 + 文字両方保持
```

**判定**: outline section の `[image:]` の **後の行が空でない** → body text 有り → T+IMG (P31/P83)。section が `[image:]` 1 行だけ → FULL-IMG OK。

`shape_canonicals.T+IMG.canonical_slide_id` (P31) を default。`shape_canonicals['T+IMG'].alt_canonicals` (P83 など — body 文字長いの場合の variant) は**所定の名前のみ**使う。**all_layouts から自由探索禁止**。

#### 3.0.6 ルール優先順（**Round 10 で発見**: image-marker > scenario hint）

> Round 10 P3 (Top Metrics) で問題発生: outline は KPI scenario + `[image:]` marker の両方を持っていた。3.1 の `preferred_per_scenario` は KPI = T+3B、3.0.5 は `[image:]` + body → T+IMG。agent が scenario を優先し T+3B を選択 → image が drop された（T+3B には image slot が無い）。
>
> **規則**: outline に `[image:]` marker が存在する section では、**3.0.5 の image-marker rule が 3.1 の scenario hint を上書きする**。理由: ユーザーが明示的に画像を指定した = 画像を出したいという意図。skip すると silently 情報が消える。
>
> | outline 状況 | 選択 |
> |---|---|
> | KPI scenario + `[image:]` 有 + body 有 | **T+IMG** (image-marker 勝つ) |
> | KPI scenario + `[image:]` 無 | T+3B (scenario hint 採用) |
> | 引用 scenario + `[image:]` 有 + body 有 | T+IMG (image-marker 勝つ、quote brackets は省略) |
> | プロセス scenario + `[image:]` 有 | T+IMG（process visual を image で表現）|
>
> 例外なく image-marker が勝つ。section に画像 slot が必要だと判断したら scenario が何であっても T+IMG family に行く。

#### 3.1 `[image:]` marker が無い section: layouts.json の `skill_guidance.preferred_per_scenario` をチェック

> ⚠️ **3.0.6 を先に通過していること**。outline section に `[image:]` marker が**有る**場合、この §3.1 の表は**読まない**。3.0.5 / 3.0.6 で T+IMG を選び §3.7 へ進む。
>
> §3.1 の対象は **`[image:]` marker が無い section のみ**。表の右列に「UNLESS [image:]…」の保険文言が入っているのは、§3.0.6 を飛ばして §3.1 に来てしまった場合の最終ガード。

scenario タグから直接 canonical を引けるなら採用:

| outline セクションタイプ | canonical（[image:] 無し前提） |
|---|---|
| Cover | **T+SUB or T-ONLY**（COVER? は使うな）|
| 3 点ハイライト | T+3B (P53)。`[image:]` 有 → T+IMG (P31)。**Round 13 注**: P53 の title placeholder は中下に位置（顶部にない）、3 箭頭が視覚的支配。title を強調したい section（cover-style headline / 1 行 takeaway）には T+SUB / T-ONLY を選ぶ |
| **段落のみ（bullet マーカー無し）** | **T+SUB (P28)**（body ≤80 cells）/ **T-LONG (P26)**（body 80-180 cells）。**T+3B に分解するな**（Round 14 regression: P10/P14 が paragraph → 3 bullet 分解 → T+3B → title 中下降格）。outline source が「3 本柱」「3 つの」「番号付き 3 項目」を明示している場合のみ T+3B 化 |
| KPI 集約 | T+3B（各 metric 1 bullet）— **T-LONG は引用用、KPI に使うな**。`[image:]` 有 → **T+IMG (P31) を強制**（Round 10 で T+3B を選んで image が drop された regression。image-marker > scenario hint） |
| 画像付きイベント振り返り | T+IMG (P31) |
| 製品ローンチ | T+IMG (hero) or T+SUB (text 多)。`[image:]` 有 → T+IMG 強制 |
| プロセス N ステップ | T+5B（番号付き）。`[image:]` 有 → T+IMG（process visual を image で表現）|
| 引用 / Quote | T-LONG (P26)、「」記号付き。`[image:]` 有 → T+IMG（quote brackets は省略、image が視覚 anchor）|
| クロージング | T-ONLY (P110)。**"Thank you." を default 採用**（placeholder は元々 "Thank you." 用に設計、JP 全角 5 字 "ありがとう" は同じ font size で 2 行 wrap する。Round 3 / Round 7 ユーザーフィードバック）。**字号縮小はしない**（template の typography は触らない、Round 7 の方針）。JP closing が必須なら短い「感謝」など 2 字フレーズで再考。 |

#### 3.2 `skill_guidance.must_avoid_for_unique_content` をブラックリストで尊重

以下 canonical は **unique content の deck で使ってはいけない**:

| 禁止 canonical | 理由 |
|---|---|
| **COVER?** | 複数の cover variant が同 placeholder text を共有、replaceAllText が全部 hit、同じ文字が複数所に入る。代替: T+SUB / T-ONLY |
| **T+IMG×8** | 8 個の round badge の **ALL-CAPS 英文ラベル**（HEY TEAM! 等）は badge 図形内、replaceAllText で改不能。team badge 専用、コンテンツに使うな。代替: T+3B / T+5B |

#### 3.3 N-bullet 厳密マッチ（Round 3 で発見）

bullet 数は **正確に一致する canonical を選ぶ**。N=3 なら T+3B、N=2 なら T+2B、N=5 なら T+5B。**インターサブスティチュート禁止**。

| outline bullet 数 | 必須 canonical | NG（避ける） |
|---|---|---|
| 2 | **T+SUB (P28)** ← P54 でなく | T+2B (P54) は 4 箭頭位を持ち 2 個空が残る (Round 4 user feedback) |
| 3 | T+3B (P53) | T+2B（1 個切られる） / T+5B（空 2 個残る） |
| 5 | T+5B (P42) | T+3B（2 個切られる） |

**同 canonical を複数 page で使うのは OK**。例えば deck 内に T+3B が 3 page あっても問題ない。canonical 重複を避けるために bullet 数違う canonical に行くな。

#### 3.4 構造シグネチャからの fallback

scenario が明確に該当しない場合の構造マッチング:
   - `1 title + 3 bullets, no image` → `T+3B`
   - `1 title + paragraph + 1 image` → `T+IMG (paragraph variant)`
   - `1 title only` → `T-ONLY`
   - `1 image full bleed` → `FULL-IMG`
   
2. **`assets/layouts.json` の同 shape entries から canonical を選ぶ**
   - 各 canonical は `use_for: []` ヒントを持つ
   - outline セクションのテーマと一致度が高い entry を選択
   - **`unsuitable_for_unique_content: true` の canonical をスキップ**

3. **catalog に該当 shape が無い場合**
   - **発明しない**。代わりに同義の上位 shape にフォールバック（例: T+4B → T+3B + 補足を別ページ）
   - フォールバックも不可なら、ユーザーに「対応する layout が catalog にないため、outline を分割するか別構造にしてほしい」と返す

### Step 3.7: Pre-flight 文字 fit 事前評価（**Round 11 で追加**、v4-#4 / Round 12 で title 検査追加）

> Round 9-10 で page 2/3/4 の body 文字が template 原字号で 1-2 回 wrap した。Round 12 ユーザーフィードバック: **title 字数が placeholder にミスマッチ**して 2 つの逆症状が発生:
> 1. **title 長すぎ → wrap して見栄え崩壊**
> 2. **title 短すぎ → placeholder の余白が大きすぎて page が空っぽ感**
>
> 両症状を防ぐため Step 3.7 を **title fit 検査**にも拡張。layouts.json の各 canonical に `title_fit: { min, ideal, max, lines }` を追加（cells 単位、JP 全角 = 2 cells / 半角 = 1 cell）。skill は outline section の H1 字数を測り、`title_fit.ideal` に最も近い canonical を選ぶ。`min` 未満 → page sparse、`max` 超え → wrap、どちらも不可。

#### 3.7.0 Title fit 区間（**最優先、layout 候補絞り込み**）

各 outline section について:

1. **section H1 の cells 数を計算**:
   ```
   cells(text) = sum over each char:
     if 全角 JP / 全角句読点 → +2
     elif 半角 latin / 数字 / 記号 → +1
   ```

2. **layouts.json の `shape_canonicals[X].title_fit` 区間で候補を絞る**:
   - `cells < min` → ❌ skip（page 太空）
   - `cells > max` → ❌ skip（title wrap）
   - `min ≤ cells ≤ max` → ✅ 候補

3. **複数候補が残ったら `|cells - ideal|` 最小の canonical を選ぶ**

4. **候補無し（全 canonical の min/max を超えた）→ ユーザーに通告**:
   ```
   「Section "<title>" の標題 ${cells} cells、現有 layouts のどれにもフィットしない。
    短くする / 長くする / 標題を分けるかを決めてほしい」
   ```

#### 3.7.0.1 例: 「<newsletter-project> Vol.001 Launch」(31 cells)

| canonical | title_fit | match? |
|---|---|---|
| T+3B (P53) | min 8, ideal 14, max 48 | ✅ within range, |31-14|=17 |
| T+SUB (P28) | min 10, ideal 24, max 50 | ✅ within range, |31-24|=7 ← **best** |
| T+IMG (P31) | min 8, ideal 20, max 40 | ✅ within range, |31-20|=11 |
| T-ONLY (P110) | min 5, ideal 10, max 16 | ❌ 31 > 16 |
| T+IMG×3 (P85) | min 6, ideal 16, max 24 | ❌ 31 > 24 |

→ T+SUB が選ばれる（image-marker rule 3.0.6 の制約があれば override）。


#### 3.7.1 各 (section, canonical) ペアで容量 vs 文字量を概算

Step 3 で選んだ layout に対し、各 placeholder の容量と outline body の文字量を比較:

| 項目 | 取得元 |
|---|---|
| 容量 | `layouts.json.shape_canonicals[X].placeholders[].estimated_max_cells_per_line × estimated_max_lines` |
| 文字量 | outline body を cell 単位で数える: ASCII = 1 cell、JP 全角 = 2 cells、半角数字 / 記号 = 1 cell |

**verified: false** の canonical は `default_max_cells` から保守的推定（Step 5.1 の表参照）。

#### 3.7.2 オーバー予測の判断

| 文字量 vs 容量 | 判断 | アクション |
|---|---|---|
| ≤ 100% | OK | そのまま進む |
| 100-115% | 軽微オーバー | 1 cell 削れば収まる範囲。Step 5.3 圧縮ルールで自然に修まる予測 → 進む（**強制 push back しない**）|
| 115-140% | 明確オーバー | 2 行 wrap がほぼ確定。**ユーザーに通告**: 「page X の bullet Y は容量 N cells に対し M cells、wrap する見込み。短縮するか別 canonical に変更するか?」|
| > 140% | 大幅オーバー | wrap が複数発生 / 字数 cap に当たる予測。**強制 push back**: 「page X は容量超え過ぎ。outline を split するか別 canonical を選ぶ必要あり」|

#### 3.7.3 push back の出し方

`AskUserQuestion` で QuestionForm として返す。例:

```
title: outline 文字量が一部 page で容量超え見込み

description: PDF self-check で wrap が発生する前に事前確認を取りたい。

questions:
  - id: page3-overflow
    text: |
      Page 3 (Top Metrics, T+IMG) の body bullet:
      "<newsletter-project>: 開封率 28%（業界平均 +12pt）" は 32 cells、
      placeholder 容量は推定 24 cells / 行 × 1 行 = 24 cells。
      
      A) 文字を縮める（"<newsletter-project>: 開封率 28%" など）
      B) bullet を 2 つに分割（KPI 分割）
      C) このまま進めて wrap も許容
      D) 別 canonical（T+3B 等 image なし、各 bullet 容量大）に変更
    options: [A, B, C, D]
```

ユーザー応答を反映してから Step 4 以降に進む。

#### 3.7.4 例外: image_marker_layout_constraint（3.0.6）優先

3.0.6 で「[image:] marker 存在時は image-marker > scenario hint」を確定済。3.7 で「容量超えで canonical 変更」を提案する場合も image-marker rule に従う:
- `[image:]` 有 + 容量超え → **canonical 変更先も T+IMG family を維持**（T+IMG (P31) → T+IMG (P83 longer body variant) など）
- `[image:]` 有 + どの T+IMG でも入らない → image を別 page に分離する案を提示

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

### Step 6: 画像処理

> **テスト用プレースホルダー画像 URL の扱い（Round 3 + Round 14 ユーザーフィードバック）**: outline 内の image marker が以下のような **プレースホルダー画像サービス** の URL を指している場合、画像は本物の content ではない（テキストオーバーレイ / 風景写真ランダム / 不適切な被写体）。これは**テスト用の挿入確認**で、最終 deck には不向き。
>
> 自動検出すべきホスト一覧:
>
> - `placehold.co`、`placeholder.com`、`via.placeholder.com`、`dummyimage.com` — テキストオーバーレイ画像
> - `picsum.photos`、`loremflickr.com`、`unsplash.com/random` — ランダム風景写真（**Round 14 で発見: 同 service の異なる seed が同じ image を返すハッシュ衝突あり**、deck 内で重複画像になる可能性）
> - `via.placeholder.com`、`fakeimg.pl` — テキスト表示のみ
>
> 検出した場合、result.json の `userActions` に必ず以下を追加する:
>
> ```
> "userActions": [
>   {
>     "priority": "high",
>     "label": "画像差し替え（プレースホルダー検出）",
>     "detail": "outline で指定された <N> 個の image marker が プレースホルダーサービス (placehold.co / picsum.photos 等) を指しています。本物の画像ではないため最終 deck では各 image marker を実画像 URL（公司 CDN / GitHub raw / 公開 imgur 等）に書き直して outline を再投入するか、Slides UI で page X / Y / Z の画像を手動差し替え。 picsum 等は**異なる seed でも同じ画像が返ることがあります**ので必ず PDF プレビューで重複も確認。"
>   }
> ]
> ```（Gap 3 fix + Round 14 拡張）

画像対応 layout（`T+IMG`、`COVER?`、`FULL-IMG`、`T+IMG×N`）に対し：

#### 6.1 画像源の確定

優先順：

1. **outline の `[image: filename.png]` マーカー** ← 最優先、明示的
2. **filename heuristic** — outline section 名と画像ファイル名の前方一致（例: section "<industry-event> Recap" + 画像 `dx-week-booth.jpg` → 一致）
3. **どちらも該当なし** → ユーザーに「このページの画像を指定してください」と返答（ハルシネーション禁止＝架空画像生成しない）

#### 6.2 画像のアップロードと挿入

daemon の `/api/google/slides/upload-image` と `/api/google/slides/insert-image` を使う。**ただし Wix Workspace の DLP ポリシーが Drive ファイルの公開分享を阻止する**ため、画像 source の処理が二段階になる:

##### 6.2.1 source タイプの判定

| outline marker / 入力 | source type | 動作 |
|---|---|---|
| `[image: filename.jpg]` （cwd ローカルファイル） | `local` | Step 6.2.2A |
| `[image: https://...]` （外部公開 URL） | `public` | Step 6.2.2B |
| 画像なし | — | placeholder のまま、result.json で報告 |

##### 6.2.2A ローカルファイルの場合（v1 制約あり）

Wix DLP は `permissions.create({type: 'anyone'})` を `publishOutNotPermitted` で拒否する。Slides API server は user の OAuth token で fetch できないため、Drive にあるだけでは Slides に挿入できない。

```bash
# 1. アップロード（Drive に置く、公開分享は best-effort で skip）
curl -X POST http://localhost:<daemon_port>/api/google/slides/upload-image \
  -H "Content-Type: application/json" \
  -d '{"localPath": "/abs/path/to/image.jpg", "mimeType": "image/jpeg"}'

# response: { driveFileId, slidesAccessibleUrl, publiclyShared: false }
```

その後、**Slides API への直接挿入はスキップする**（"Internal error" を返すため）。代わりに result.json の `imageSlots` に記録:

```json
{
  "page": 4,
  "status": "drive-pending-manual-insert",
  "source": "drive:1ABC...",
  "reason": "Wix DLP blocks public Drive sharing; manual drag from Drive panel in Slides UI required (~30 sec/image).",
  "driveUrl": "https://drive.google.com/file/d/1ABC.../view"
}
```

ユーザーは Slides UI で挿入 → メニュー → 画像 → Drive → 該当ファイルをドラッグ。1 画像 30 秒。

##### 6.2.2B 外部公開 URL の場合（完全自動）

公開 URL（imgur, placehold.co, GitHub raw, 自社 CDN など）は Slides API server が直接 fetch できる。**これが Iteration 1 で完全自動挿入できる唯一のパス**。

```bash
# 直接 insert（upload step 不要）
curl -X POST http://localhost:<daemon_port>/api/google/slides/insert-image \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "...",
    "slideId": "...",
    "placeholderObjectId": "...",
    "imageUrl": "https://your-cdn.example.com/image.png"
  }'
```

result.json の imageSlots に `{status: "filled", source: "public:https://..."}` を記録。

##### 6.2.3 layout 別動作まとめ

| layout shape | local file source | public URL source |
|---|---|---|
| `FULL-IMG` | drag-from-drive 指示 | 自動挿入 ✅ |
| `T+IMG` | drag-from-drive 指示 | 自動挿入 ✅ |
| `T+IMG×N` | drag-from-drive 指示（各画像） | 自動挿入 ✅ |
| `COVER?` | drag-from-drive 指示 | 自動挿入 ✅ |

##### 6.2.4 ユーザーへの推奨

skill が Step 1.5 QuestionForm で画像を要求するときに、**「公開 URL を貼ってもらう」** が最も自動化される旨を説明する:

```
画像について:
- ローカルファイル名（[image: foo.jpg] マーカー） → Drive 経由、最後に手動配置（30 秒/画像）
- 公開 URL（imgur など） → 自動挿入完了

Wix Workspace の Drive 公開分享制限のため、ローカルファイルは半自動になります。
```

### Step 7: Master / Header 設定（Gap 6 fix）

deck の最初の生成時、master の "Presentation name / YYYY" を実際の deck 情報に書き換える。

> **重要（Phase 5 Round 3 で発見）**: この template の場合 `update-master` は 0 occurrences を返す（"Presentation name / 2025" が **layout 上にあって master 上にない**ため）。代替として `apply-replacements` で deck-wide find/replace を使う:

```bash
curl -X POST http://localhost:<daemon_port>/api/google/slides/apply-replacements \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "<copied_deck_id>",
    "replacements": {
      "Presentation name / 2025": "Wix Japan / 2026"
    }
  }'
# → { "occurrences": { "Presentation name / 2025": 3 } }
# 削除済み slide にも bleed する可能性があるため Step 8.5 の前に実行する
```

#### 7.1 Header 文字長の制約（Round 3 で発見）

master placeholder の box 幅は短い（"Presentation name / 2025" 7 latin + 1 sp + 4 digit = 約 8 cells）。**replace 値は 12 cells 以下**にする:

| ✅ OK | ❌ NG（wrap する） |
|---|---|
| `Wix Japan / 2026` (8 cells) | `Wix Japan 4月 / Performance Report / 2026` (約 26 cells、3 行 wrap) |
| `Wix Japan 4月` (8 cells) | `Wix Japan April Performance Report` (28 cells) |
| `WJ Performance / 2026` (12 cells、limit ぎりぎり) | |

deck の正式タイトルは page 1 (Cover) に大きく出すから、header は短い識別子でいい。`deck_title` をそのまま header に渡さない。

`deck_title` と `deck_year` は input から取得（指定がなければ outline の最初の `# 大見出し` + 現在年で fallback）。

### Step 8: Slides API への書き出し（**Phase 6 改訂版、per-objectId 主流**）

daemon の Slides 系エンドポイントを使う。**JP テンプレート ID は Step 0 で読んだ `assets/config.json` の `jp_template_id` から取得する**（ハードコード禁止）。

#### 8.1 テンプレートをコピー

```bash
curl -X POST http://localhost:<daemon_port>/api/google/slides/copy \
  -H "Content-Type: application/json" \
  -d '{"sourceDeckId": "<jp_template_id>", "title": "<deck_title>"}'
# → { deckId, deckTitle, deckUrl, embedUrl }
```

コピー直後は 130 page（template 全体）が deck に存在する。各 page の objectId と各 placeholder の objectId は **layouts.json の値と一致**（Drive copy は ID を保持する）。

#### 8.1.1 deckId / deckUrl を project metadata に書き戻す（**Round 13 で発見、必須**）

`copy` のレスポンスを受け取ったら**直ちに**`PATCH /api/projects/:projectId` を呼んで `metadata.deckId` と `metadata.deckUrl` を保存する。これをやらないと web UI の以下機能が全部 404 になる:

- `/api/projects/:id/thumbnails` — slide 縮略图（gallery viewer の主要 render path）
- `/api/projects/:id/deck-pdf` — 自動 PDF export
- `/api/projects/:id/page-ids` — page 順序
- `/api/projects/:id/page-image` — full-resolution PNG

```bash
curl -X PATCH http://localhost:<daemon_port>/api/projects/<projectId> \
  -H "Content-Type: application/json" \
  -d '{"metadata": {"deckId": "<copied_deck_id>", "deckUrl": "<deckUrl>"}}'
```

`projectId` は agent spawn 時の cwd 末尾から取れる（`.od/projects/<projectId>/`）。**忘れると user は preview pane で「Thumbnails unavailable: status 404」を見る** — Round 13 で実際に発生したバグ。

#### 8.2 Canonical 再利用が必要なら duplicate-slide で複製

ある canonical を deck 内で N 回使う場合、**最初の使用は元 page のまま、2 回目以降は duplicate**。

```bash
# 例: T+3B (P53, slideId g3dbbd34042a_0_0) を Exec Summary + <brand-project> + Next Month の 3 page で再利用したい
# → 1 回目は元の slide、2-3 回目は duplicate を作る

curl -X POST http://localhost:<daemon_port>/api/google/slides/duplicate-slide \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "<copied_deck_id>",
    "slideObjectId": "g3dbbd34042a_0_0",
    "idMap": {
      "g3dbbd34042a_0_0": "p53_use2",
      "<title_objectId>": "p53_use2_title",
      "<bullet_1_objectId>": "p53_use2_bullet_1",
      "<bullet_2_objectId>": "p53_use2_bullet_2",
      "<bullet_3_objectId>": "p53_use2_bullet_3"
    }
  }'
# → { "newSlideId": "p53_use2" }
```

`idMap` は **任意だが推奨**。指定すると新 page と全 child element に決定論的 ID が付くため、後続の `update-text` 呼び出しが書きやすい。命名規則: `<canonical_lower>_use<N>_<placeholder_role>`（例: `p53_use2_title`、`tplus_img_use2_paragraph`）。

`idMap` を省略した場合、新 ID は auto-generate される。新 placeholder ID を知るには `readPresentation` を呼ぶ必要があり 1 round-trip 余分にかかる。

#### 8.3 各 placeholder を per-objectId で埋める（**新主流**）

deck 内の各使用 page について、placeholder ごとに `update-text` を 1 回呼ぶ。

```bash
curl -X POST http://localhost:<daemon_port>/api/google/slides/update-text \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "<copied_deck_id>",
    "objectId": "<placeholder_objectId>",
    "text": "今期 主要ハイライト"
  }'
# → { "ok": true }（既存 text を全削除して新 text を挿入）
```

Phase 5 までの `apply-replacements`（deck-wide find/replace）は使わない。理由:
- ✅ deck-wide bleed 解消 → 同じ canonical を複数 page で再利用しても干渉しない
- ✅ canonical 内部 dup placeholder（T+5B の "Lorem ipsum dolor sit amet" × 3 等）を独立に書ける
- ✅ `\x0b` (vertical tab) など特殊文字を含む placeholder も objectId 直指定で書ける（exact-match 不要）

placeholder objectId の取得元:
1. `layouts.json` の `shape_canonicals[X].placeholders[].objectId`（元 deck 内 ID）
2. duplicate した page は `idMap` で指定した新 ID
3. 不明な場合は `readPresentation` で deck 全体から拾う

#### 8.4 apply-replacements の残存用途（master / bulk のみ）

`apply-replacements` は **master / layout に住む共有テキストの一括置換** にだけ使う（Step 7 を参照）。具体的には:
- "Presentation name / 2025" → "Wix Japan / 2026"
- 用語辞典（"完了" → "完成" 等）の deck-wide 統一

通常 page の placeholder 埋めには使わない。Phase 5 の P5 <newsletter-project> 崩壊（T+5B 内部 dup の 3 unique × repeat）と P7 Next Month 崩壊（\x0b 残存で title 置換失敗）の根因。

#### 8.5 旧 apply-replacements 流れ（**deprecated、参考のみ**）

> Phase 5 まで使っていた deck-wide find/replace 流れ。Phase 6 では Step 8.3 の per-objectId に置き換え。後方互換のため endpoint は残るが、新規 deck で使うな。
>
> ```bash
> # OLD（deprecated）
> curl -X POST .../api/google/slides/apply-replacements \
>   -d '{"deckId": "...", "replacements": {"字数上限：48字": "今期..."}}'
> ```

### Step 8.5: 不要ページの削除（**必須**、Phase 5 第 1 轮で発見した P0 issue）

`gog slides copy` / `/api/google/slides/copy` は **テンプレート 130 ページ全体** を複製する。populate するのは layoutsUsed に並ぶ 6-10 page だけ。残り 120+ ページはテンプレート状態のまま deck に残り、Step 8 の replaceAllText の bleed もそこに混入する。**ユーザーが受け取る前に必ず削除する**。

#### 8.5.1 削除対象の特定（**keep list は canonical + duplicate 両方**）

```bash
# deck の全 slide ID を取得
curl -s http://localhost:<daemon_port>/api/google/slides/<deckId>
# response: { slides: [ { slideId, elementCount, elementIds }, ... ] }
```

**保持する slideId（keep list）= layoutsUsed[].slideId の全部**。

> **Codex review (2026-05-05) finding**: Phase 6 で同 canonical を再利用する場合、Step 8.2 の duplicate-slide で生成した新 ID（`p53_use2`、`p31_use3` 等）も **kept** として保持しなければならない。Phase 5 まで使っていた「canonical_slide_id だけ keep」ロジックは Phase 6 では duplicate を誤って削除する。
>
> 実装: agent は `layoutsUsed` 配列に各使用 page の **実際の slideId**（元 canonical_slide_id か duplicate の新 ID）を記録。delete-pages の対象 = 全 deck slide IDs **マイナス** layoutsUsed[].slideId 全部。

#### 8.5.2 一括削除

```bash
curl -X POST http://localhost:<daemon_port>/api/google/slides/delete-pages \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "<copied_deck_id>",
    "slideIds": ["<unused_id_1>", "<unused_id_2>", ...]
  }'
# response: { "deleted": 124 }
```

deck は populate された 6-10 page（layoutsUsed の全 slideId、元 canonical + duplicate 含む）だけになる。

#### 8.5.3 narrative 順に並べ替え（**Phase 6 で追加**、`update-slides-position`）

Phase 5 までは「kept slides は元 template の物理位置順に並ぶ」制約があった（reorder API 未実装のため）。**Phase 6 では `update-slides-position` で narrative 順に自由に並べ替えられる**。

> **Codex review (2026-05-05) finding**: Google API の `UpdateSlidesPositionRequest` は `slideObjectIds` が**現在の presentation 内位置順**であることを要求（in-order without duplicates）。daemon の `update-slides-position` v2 はこの制約を吸収するため、内部で **1 slide ずつ順次移動**する実装に変更（caller は最終 narrative 順だけ渡す）。

```bash
# narrativeOrder は最終 deck 内順序（outline 章立て順）。
# 各 slide が現在 deck 内のどこにいても OK — daemon が 1 つずつ正しい位置へ移動する。

curl -X POST http://localhost:<daemon_port>/api/google/slides/update-slides-position \
  -H "Content-Type: application/json" \
  -d '{
    "deckId": "<copied_deck_id>",
    "narrativeOrder": ["<cover_slideId>", "<exec_summary_slideId>", "<top_metrics_slideId>", "<dx_week_slideId>", "<manazashi_slideId>", "<harmony_slideId>", "<next_month_slideId>", "<closing_slideId>"]
  }'
# → { "ok": true, "reordered": 8, "moves": <0-8、既に正位置の slide はスキップ> }
```

旧フィールド名 `slideIds` も後方互換で受理するが、**新規コードでは `narrativeOrder` を使う**（API contract が「順序を伝える」と明示的に読める）。`insertionIndex` パラメータは廃止。

> **重要**: Phase 5 で用いていた「canonical_slide_id の元 deck 内位置順を narrative 順と一致するよう選ぶ」は **不要**。canonical 選択は scenario 適合性のみで行い、順序は最後に `update-slides-position` で決める。

### Step 9.0: Text Self-check

result.json を書く前に、テキストレベルで:

```
[ ] 全 page で字数 cell limit (verified 値 or fallback 仮値) を満たしている
[ ] [要◯◯] プレースホルダの数を deck-plan.md に記録
[ ] 画像 placeholder で source 不明のものをユーザーに報告
[ ] 行頭・行末禁則を全 bullet で検証
```

### Step 9.5: 視覚 Self-check（**必須**、Phase 5 第 1 轮で発見した: estimated_max_cells_per_line は信用できない）

字数 cell 計算は仮値ベースで、**実際 placeholder のフォントサイズ・幅と必ずしも一致しない**。verified=true の P53 (T+3B) 以外は overflow / 切れ / 折り返し位置不自然が発生する。**PDF を export して Read で各 page を見て、自分の目で確認する**。

#### 9.5.1 PDF を export

```bash
curl -X POST http://localhost:<daemon_port>/api/google/slides/export-pdf \
  -H "Content-Type: application/json" \
  -d '{"deckId": "<copied_deck_id>", "projectId": "<projectId>", "filename": "review-v1.pdf"}'
# response: { "path": "/.../projects/<projectId>/_review/review-v1.pdf", ... }
```

#### 9.5.2 各 populate page を Read で視覚確認

Read tool に PDF パスと `pages: "<page_number>"` を渡して各 populate page を取得する。Claude は PDF page を画像として認識できる。

各 page で確認する観点:

| 観点 | 検出方法 | NG 例 |
|---|---|---|
| **テキスト box overflow** | 文字が placeholder 矩形の外に出ている / 切れている | "<industry-event> 来場者 8,000 名" の "0 名" が右に切れる |
| **不自然な折り返し** | 助詞・複合語の途中で改行 | "8,0\n00 名" / "<newsletter-project> V\nol.001" |
| **title wrap (Round 12 追加)** | title placeholder の text が 2 行以上に折り返している | "<brand-project> JA — Phase 1" が "<brand-project> JA — \nPhase 1" になる |
| **title under-fill (Round 12 追加)** | placeholder が想定 N 行のところ title が 1 行で残り N-1 行が白く余る | T+SUB の 3 行 placeholder に「KPI」だけ入って残り 2 行空白 |
| **lone particle at line start (Round 13 追加)** | 行頭に **1 mora の助詞**（て / を / が / は / の / と / に / で / も / や）が単独で残っている | 「Wix Japan を使い始めて、初め / **て**『海外…」← 「て」だけ次の行に押し出されている |
| **paragraph-style title leak in T+IMG (Round 13 追加)** | T+IMG (P31) の title placeholder に明示 \\n を入れると line 2+ が paragraph style に降格する | "<brand-project> JA Phase 1\\nドラフト" → 「ドラフト」が title style ではなく本文サイズで出る |
| **T-LONG quote orphan first line (Round 14 追加)** | 明示 \\n を入れた quote で line 1 が **<10 cells** で孤立 | 「Lumina で、\\nドキュメント作業が…」→ line 1「Lumina で、」5 cells のみ → balance 崩れ。修法: \\n を削除して auto-wrap に戻すか、quote を書き直して自然な first clause を長くする |
| **T+3B title 中下降格（Round 14 追加）** | outline が paragraph 1 段落のみなのに 3 bullet に分解して T+3B に入れる → title が中下に置かれ、3 箭頭が視覚支配 | P10「チーム拡張と組織体制」を T+3B 化 → title 中下 / 3 箭頭が要約箇条書き ← T+SUB に切り替えて title をトップ強調すべき |
| **画像重複（Round 14 追加）** | 2 枚以上の slide で image が **同一画像**（hash 一致 / または明らかに同じ被写体） | R14 P2 と P4 で picsum.photos の異なる seed が同じ image を返した（外部 service hash collision）→ deck が「軽い」印象に。検出時は userActions に「P_x と P_y は同じ画像、片方を差し替え推奨」を追加 |
| **font size 過大** | 1 行の文字が overflow 起因で sub-1pt まで縮む / 2 行に gap | "Strategy Framework 完成"が 14pt → 5pt に縮小 |
| **layout 崩壊** | bullet 数 mismatch / 並び崩れ | T+3B に 4 bullet 入って 4th が消失 |
| **placeholder filler 残存** | "Lorem ipsum" / "Click here to" / "Headline first slide" 等が残る | bleed 副作用の見落とし |

**title wrap / under-fill の両症状は、Step 3.7.0 の title fit 区間チェックを Step 3 で行えば 90% は事前回避できる**。視覚 self-check は最後の安全網。検出時は段階 2 で canonical を変更する（字号は触らない）。

#### 9.5.3 NG 検出時の対応（**2 段階修正戦略、Phase 5 Round 2 で発見**）

**段階 1: テキストを短く書き直す（compression）**
- overflow → そのページの該当 placeholder の text を **20% 短く書き直す**（compression rule §5.3 適用）
- 不自然な折り返し → 助詞の後 / 句読点の後で切るよう書き直す
- placeholder filler 残存 → catalog の `original_text` 値を確認して再 replace

**段階 1.5: 画像と隣接する title が awkward に wrap する場合 → 明示 \\n 挿入（Round 3 で発見）**

T+IMG / T+IMG×N layout で title が右側 image と縦に並ぶレイアウトの場合、title placeholder の幅が狭く wrap が発生する。Slides は自動 wrap で**意味境界を考慮しない** — "Japan <industry-event> 出展レポート" が "Japan <industry-event> 出展" / "レポート" のように複合語境界で割れて、しかも "出展" が image と重なる。

→ 修法: agent が text 内に**明示の改行 `\n` を入れる**。

```
❌ "Japan <industry-event> 出展レポート"  → Slides 自動 wrap → "Japan <industry-event> 出展" / "レポート" (出展 が image に重なる)
✅ "Japan <industry-event>\n出展レポート" → 明示 wrap → "Japan <industry-event>" / "出展レポート" (image と重ならない)
```

判断基準: PDF 視覚 check で「title が image 隣の placeholder で 2 行 wrap している」を見つけたら、応答テキストを `\n` 入りに書き直して再 apply。意味境界（助詞後 / 単語後）で改行を入れる。

**⚠️ Round 13 注意: T+IMG (P31) の title placeholder で `\n` 挿入は line 2+ を paragraph style に降格させる**

P31 placeholder は「title 1 行 + 自由文 N 行」想定の単一 placeholder で、line 1 のみ title style、line 2+ は paragraph style として render される。Round 13 P7 で「<brand-project> JA Phase 1\\nドラフト」と書いたら「ドラフト」が本文 size で出てしまった。

→ 対応の優先順:

1. **title を 1 行に収まる長さに書き直す** が第一選択。「Phase 1 ドラフト完了」のようにステータスを title 内に収めるか、「Phase 1」だけにして status は body に書く。
2. それでも収まらない場合のみ `\n` 挿入。**line 2 が paragraph style になることをユーザーに userActions で伝える**（Slides UI で手動で title style 再適用してもらう）。
3. T+IMG ではなく T+SUB に切り替えれば title placeholder と subtitle placeholder が別なので両方 title style を保てる — title 強調が最重要なら canonical 変更を優先。

**lone-particle wrap 検出時の修法**:

T-LONG quote / 長 paragraph で「行頭に 1 mora の助詞」が出た場合（例「初め / **て**」）、agent は次のいずれかで対応:

- **outline 段階に push back**: 文を ~80 cells 以下に圧縮、または意味境界が長い句で終わるよう書き直す（「〜と感じた」など clause 末で締める）
- T-LONG title placeholder には `\n` を挿入しない（quote block 扱いで paragraph break が出る）。`\n` 入れるなら quote 全体を分割した上で「By 〜」の分離専用

**段階 2: テキスト圧縮で収まらない → canonical を変更（**字号は触るな**）**

> **設計哲学（Round 7 ユーザーフィードバック）**: 「テンプレートが約束、文字は変数」。template designer が設定した字号 / 字体 / typography は touchable ではない。agent の判断で字号を変えると template の視覚言語が壊れる。
>
> **`update-font-size` endpoint は使うな**。圧縮で収まらない場合、字号を縮小せず、**より文字キャパが大きい canonical に変更**する。

代替 canonical の選び方:

| 元 canonical（overflow） | 切り替え先 | 理由 |
|---|---|---|
| T+SUB (P28) で paragraph が 3 行超え | T-LONG (P26) — paragraph 占有面積が大きい | text 専用 layout に移行 |
| T+3B で各 bullet 16 cells 超え | T+5B (P42) — bullet 容量大 / または 2 page に分割 | bullet 1 つあたりの面積が広い |
| T+IMG で title + body の文字量が image 横の placeholder に入らない | T+SUB (P28) — image 削除して text を主役に / または image を別 page に | レイアウト分離 |
| T-ONLY (P110) "ありがとう" が 2 行 wrap | "Thank you." を default 採用 | placeholder は元々 "Thank you." 用に設計、JP 全角 5 字は同字号で物理的に入らない |

→ canonical 切り替え手順は段階 4 で具体化。

**段階 3: layout-level 評価（Round 2 で漏れた観点）**

字数 / 折り返しだけでなく、**layout 全体が outline section の意図と合っているか**も評価する:

```
レビュー観点（各 page で自問）:
[ ] このページの layout は section の意図を表現できているか？
    - ✗ "今期主要 KPI" を T-LONG (quote layout) で表示 → 意図不一致
    - ✗ "ハイライト" を T+IMG×8 (badges layout) で表示 → ALL-CAPS 英文 badge と JP caption の混在
    - ✓ KPI は T+3B、ハイライトも T+3B、quote は T-LONG だけ
[ ] template の placeholder filler 文字が完全に消えているか？
    - "Lorem ipsum" / "Click here" / "Headline first slide" / "TEXT HERE" の残存
    - ALL-CAPS 英文 badge label（"HEY TEAM!" 等）の残存
[ ] 同じ placeholder marker が複数箇所に bleed していないか？
    - replaceAllText の occurrences > 1 が想定外
    - 各 page を目視で「同じ文字が 2 箇所以上に出ている」を検出
[ ] image placeholder が空白（cropped image / placeholder text overlay）になっていないか？
```

layout-level 問題が出たら → **canonical を別の同 shape entry に変更** または **それでもダメなら user に通告**:

```
# 発見した layout-level 問題:
- page 2 (T+IMG×8): badge 内 ALL-CAPS 英文ラベルが残存
- page 3 (T-LONG): KPI を quote 風に表示してしまっている

# 提案修正:
- page 2 → T+3B に変更（badge 不要、3 highlights を bullet で並列）
- page 3 → T+3B に変更（KPI summary なら quote brackets 不要）

# user 確認後、deck を作り直すか、page 単位で再生成するか選ぶ。
```

修正は **deck 全体 regenerate しない**（コスト高）。問題のページだけ:

1. 段階 1: 短く書き直し → 該当 placeholder を `update-text` で per-objectId 上書き
2. 段階 1.5: image 隣 title が awkward wrap → text に明示 `\n` 入りで再 `update-text`
3. 段階 2: 圧縮で収まらない → canonical 変更。**ただし source canonical slide が既に Step 8.5 で削除されている可能性に注意**:
   - Step 8.5 の delete-pages では `layoutsUsed[].slideId` 以外を全て削除 → 別 canonical の source slide は deck から消えている
   - canonical 変更を実行するには **source slide を delete-pages から退避**する必要がある
   - **推奨フロー**: 視覚 self-check の結果を見て canonical 変更が必要そうなら、**Step 8.5 を一旦巻き戻す**（旧 source slide を再 copy で取り戻すのではなく、最初から新しく deck を作り直す）。コスト高いので 3 round の修正で収まらない時の最終手段。
   - **代替フロー**: より安全には、**Step 8.5 を遅延**: 視覚 self-check（Step 9.5）が clean になるまで delete-pages を走らせない。これにより canonical 変更は「新 source を duplicate → 元 page を delete → update-text で埋める → 順序更新」で済む。
4. PDF を re-export
5. 9.5.2 を再実行（最大 3 round）

> **Codex review (2026-05-05) finding に応じた変更**: 上記の「代替フロー」を v2 で導入予定（Step 8.5 を Step 9.5 完了後に移動）。現状の Step 8.5 → 9.5 順序は backward compat 維持のため保持しているが、canonical 変更が頻発する outline では「代替フロー」を選ぶこと。

**字号 (`update-font-size`) は使わない**。template の typography は agent が触る領域ではない。

#### 9.5.4 修正不能な場合

3 round 試しても収まらない / 同じ overflow が再発する場合:
- result.json の `visualReviewIssues` に詳細記録（page / placeholder / 問題タイプ / 試した text variants）
- userActions に "page X の bullet Y は手動調整が必要" と明記
- ユーザーが Slides UI で直接調整する

#### 9.5.5 視覚チェックの記録

result.json に以下を追加:

```json
"visualReview": {
  "pdfPath": "_review/review-v1.pdf",
  "rounds": 2,
  "issuesFound": [
    {"page": 3, "placeholder": "title", "issue": "overflow_clipped", "fix_applied": "title shortened from 22 cells to 16"},
    {"page": 4, "placeholder": "body_paragraph", "issue": "auto_shrink_below_readable", "fix_applied": "split into 2 bullets"}
  ],
  "remainingIssues": []
}
```

### Step 10: result.json 出力 + artifact manifest sidecar 必須（Bug 1 fix）

最終の output を **2 つのファイルに分けて** cwd に書く。両方必須——manifest sidecar が無いと open-design の renderer が起動せず、UI 上で deck が表示されない。

#### 10.0 result.json を書く前の必須 checklist（Round 11 で強化）

result.json を書く前に **`userActions` 配列を構築**する。以下の検出は **すべて自動**:

1. **placehold.co / placeholder.com / via.placeholder.com 検出**: outline の `[image:]` URL を全部 scan。これら placeholder image 生成サービスを指している URL が 1 つでもあれば、`userActions` に **必ず high priority entry 追加**:
   ```json
   {
     "priority": "high",
     "label": "画像差し替え",
     "detail": "<N> 個の placeholder image (placehold.co 等) が deck に挿入された。これらは黒底白字のテキストオーバーレイで、最終 deck には不向き。Page <X, Y, Z> の image marker を実画像 URL（公司 CDN / GitHub raw / 公開 imgur 等）に書き直して outline を再投入するか、Slides UI で直接差し替え。"
   }
   ```
   N と page 番号は実検出値で埋める。**「placehold.co URL が無いから skip」は OK だが、「あるのに userActions に書かない」は NG**。

2. **`[要○○]` placeholder 残存**: outline で agent が「ハルシネーション禁止」のため `[要数値]` 等で残した未確定値が `result.json.missingFields` に積まれているはず。これを `userActions` にも entry 化:
   ```json
   {
     "priority": "high",
     "label": "未確定値の確認",
     "detail": "outline に <N> 件の `[要○○]` placeholder。実値を確認してから outline 再投入。"
   }
   ```
   `missingFields` が空なら skip。

3. **canonical 内 dup placeholder の重複表示**: T+5B 等 canonical 内 placeholder が同じ original_text を共有している場合、agent が複数 page でそれを書き換えると視覚上重複が出る。発生時に entry 追加（**Phase 5 P5 <newsletter-project> の例**）。Phase 6 では per-objectId update-text なので通常は出ないが、レアケースで該当したら記録。

4. **layout-level の自己評価**: 9.5.3 の段階 3 で発見した layout 不適合があれば entry 化。

5. **canonical-change 不能 case**: 9.5.4 で 3 round 試しても収まらなかった place があれば entry 化。

`userActions` 配列が**空**になることは滅多にない（少なくとも placehold.co 警告は各 e2e test で必ず 1 件は出る）。空のまま result.json を書くな。

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
    {"page": 4, "status": "filled", "method": "replaceImage CENTER_CROP", "source": "public:https://placehold.co/..."},
    {"page": 5, "status": "drive-pending-manual-insert", "source": "drive:1XXX", "reason": "Wix DLP blocks public sharing"}
  ],
  "layoutsUsed": ["P7", "P53", "P53", "P83", "P31", "P53", "P53", "P110"],
  "deletedPages": 124,
  "knownSideEffects": [],
  "userActions": [
    {
      "priority": "high",
      "label": "画像差し替え",
      "detail": "2 個の placeholder image (placehold.co) が page 3, 4 に挿入された。最終 deck には実画像に差し替え必要。"
    }
  ],
  "visualReview": {
    "pdfPath": "_review/review-v1.pdf",
    "rounds": 2,
    "issuesFound": [],
    "remainingIssues": []
  },
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

#### 10.3 daemon project status を completed に更新（**Round 11 v2、必須**）

result.json と artifact sidecar を書いた**後**、daemon の project record の status を `completed` に PATCH。これで主页 Designs リストの「未開始」表示が「完了」に変わる。

```bash
curl -X PATCH "http://localhost:<daemon_port>/api/projects/<projectId>" \
  -H "Content-Type: application/json" \
  -d '{"status": {"value": "succeeded"}}'
```

> **注意**: daemon の status は内部で run records から計算される派生値。skill 流れは agent run を経由しないので、PATCH しないと永遠に `not_started` のまま。Round 11 v1 では Round 7-11 の 5 件が backfill 必要だった。
>
> Status 値: `succeeded` / `failed` / `canceled`。途中失敗時は `failed`、ユーザーが Step 9.5 で諦めて中断したら `canceled`。

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

- **画像 placeholder への自動挿入は公開 URL のみ**。ローカルファイルは Drive にアップロードした後、ユーザーが Slides UI で手動配置（Wix Workspace DLP が Drive の anyone-with-link 共有を `publishOutNotPermitted` で阻止するため）。詳細は §6.2.2A。回避策は §6.2.2B（公開 URL を渡してもらう）。
- Master / Header の deck 名・年号書き換えは daemon API 経由で動作（`/api/google/slides/update-master`）。
- Comment / refine の per-element クリック編集はサポート外（Slides /embed が読み取り専用のため）。
- PPTX 導出時の Madefor JP 自動 swap は未対応（v2、Workspace 字体目录推進と並行）。

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
