# ECOT Applied UI Kit

This applied kit is a reusable Claude Design package for ECOT's public product database surface. It is grounded in the preserved product-list and heat-shielding database examples, not a generic dashboard template.

## Applied kit structure

`index.html` は `../../colors_and_type.css` を読み込む適合品データベースの組み立て例で、utility bar、sticky header、evidence-led hero、filters、product rows、role routesを一つの画面に配置する。`components/` には製品行など、単体で差し替えやすいHTML部品を保存している。

## Component files

- `components/product-row.html` — registration number, product identity, category, and evidence links in one reusable row.
- `../../colors_and_type.css` — shared color, typography, spacing, radius, border, focus, and elevation tokens.
- `index.html` — composed interface that demonstrates how the component and tokens work together.

## Usage workflow

1. `index.html` を開き、情報の優先順位とレスポンシブな積み方を確認する。
2. 必要な部品を `components/` から取り出し、実データに置き換える。
3. `colors_and_type.css` のトークン以外の色を追加せず、登録番号・区分・根拠資料リンクを残す。
4. 360px幅とキーボードフォーカスで検証する。
5. `preview/` の色、タイポグラフィ、余白、コンポーネントカードで変更をレビューする。

## Design notes

このキットは `assets/source-examples/ecot-products-list.html`、`ecot-shanetsu-database.html`、`ecot-latest-site-design.html` の実装パターンを元にしている。公開製品の件数や性能値はサンプル表示であり、プロダクションでは一次資料から注入する。ECOT登録を行政機関の個別認証と表現しない。

## Source basis

- `assets/source-examples/ecot-products-list.html` — product-row fields and evidence links.
- `assets/source-examples/ecot-shanetsu-database.html` — database table and registration facts.
- `assets/source-examples/ecot-latest-site-design.html` — header, hero, responsive behavior, and token usage.

The kit is intentionally not a generic dashboard: labels and fields follow the source product-list and database examples. Public product counts and performance values are illustrative sample content and must be replaced with primary-source data in production.

Open `index.html`, then inspect `components/` for reusable HTML fragments.
