---
name: ecot-public-information-design
description: ECOTの公開情報、適合品データベース、メーカー登録案内を設計・実装するための再利用可能なデザインシステムパッケージ。
user-invocable: true
---

# ECOT Public Information Design Skill

This reusable Claude Design skill packages the source-backed visual language and applied interface patterns for ECOT public information products.

## What is inside

- `DESIGN.md`: 色、タイポグラフィ、レイアウト、コンポーネント、文体、禁止事項。
- `colors_and_type.css`: 実装用の色・余白・角丸・境界線・フォントトークン。
- `preview/`: 色、文字、余白、コンポーネント、資産、適用UIを分けたレビューカード。
- `ui_kits/app/`: 適合品データベースを題材にした組み立て済みの適用例と部品。
- `assets/`: ロゴ、役割アイコン、写真、図版。`assets/source-examples/` には元実装の実体を保存。
- `build/`: ランタイムで参照する代表的なSVGアイコン。
- `context/provenance/`: どのソースから何を判断したかの記録。

## Package contents

The package contains the design-system source of truth, focused preview cards, preserved source examples, runtime assets, and an applied UI kit. Use the paths above as package entry points; do not recreate tokens or components from memory.

## Source context

このパッケージは Source project `Hyperframes` のコピー済み資料から生成した。主な根拠は `assets/source-examples/ecot-latest-site-design.html`、`ecot-shanetsu-database.html`、`ecot-products-list.html`、`ecot-site-redesign-plan.md` と、`assets/` 内のロゴ・役割アイコン・タイムライン画像である。コピー元の実装と画像は削除・縮約せず、レビュー可能な形で保持する。

### Source references

- `context/source-context.md` — source project metadata and copied-file inventory.
- `context/provenance/README.md` — evidence mapping, decisions, and known limitations.
- `assets/source-examples/` — substantive source snapshots kept outside `context/`.
- `assets/` and `build/` — preserved visual and runtime assets.

## When to use this skill

- ECOTのトップ、製品一覧、遮熱データベース、メーカー登録、FAQ、問い合わせページを作るとき。
- 登録番号、規格、試験資料、SDS、公開日、期限を「確認できる」状態で提示するとき。
- 公共調達・設計・施工の3つの利用者に、証拠と次の行動を同じ情報構造で提供するとき。

## How to use

1. `colors_and_type.css` を最初に読み込み、既存の `--ecot-*` トークンを使う。
2. 近い画面を `ui_kits/app/index.html` と `components/` から選び、必要な部品だけ再構成する。
3. `preview/` で色、文字、余白、状態、適用面を順に確認する。
4. コピーは一次資料で確認し、登録と行政機関による直接認証を混同しない。
5. 360px幅でも横スクロールがないこと、全ての操作要素が44px以上であることを確認する。

### Claude Design reuse workflow

1. Read `DESIGN.md`, this skill, and the relevant source reference before starting a new surface.
2. Load `colors_and_type.css` without replacing its color, radius, spacing, or focus tokens.
3. Compose from `ui_kits/app/components/` and validate the result against the focused cards in `preview/`.
4. Keep evidence links, registration identifiers, source limitations, and Japanese factual copy visible.
5. Recheck responsive layout, keyboard focus, contrast, and document-link states before delivery.

## Design system highlights

- 濃緑は公共性・信頼、青は参照と行動、赤は期限・注意に限定する。
- 白い読書面、薄い緑の補助面、1pxの境界線、8pxの角丸を基本にする。
- `system-ui` 系の日本語可読性を前提に、本文は1.75、見出しは1.25〜1.35の行間を使う。
- ヒーロー、スケジュール帯、根拠カード、データ表、役割別導線を情報の骨格とする。
- 派手なキャンペーン表現、根拠のない性能値、過剰な影、グラデーション、絵文字アイコンを使わない。
