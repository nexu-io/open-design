# GitHub にインスパイアされたデザインシステム

> Category: 開発者ツール
> コードファーストなプラットフォーム。機能密度が高く、青と白の精緻な配色、Primer を基盤とする。

## 1. ビジュアルテーマと雰囲気

GitHub のインターフェースは装飾的ではなく、エンジニアリングされている。すべてのピクセルが一つの姿勢を宣言している——これは diff、ビルド、pull request を気にかける人々のためのツールだ。ページの背景はクリーンな `#ffffff`（ライトモード）または `#0d1117`（ダークモード）で、コンテンツは余白ではなくヘアライン境界線で区切られた密な矩形ペインに配置される。情報密度がブランドだ——リスト行、コード行、リポジトリヘッダー、通知カードはすべて密集しており、パワーユーザーはスクロールなしに百件のアイテムを確認できる。

シグネチャのアクセントカラーは、リンクと主要アクションのための **Primer ブルー** (`#0969da`) と、マージ状態・成功・マージボタンのための **GitHub グリーン** (`#1a7f37`) だ。どちらもコンシューマー製品の青や緑と比べてやや抑えられている——密なグレーのテキストに対して読み取れるほどの彩度を持ちながら、一つのビューポートに複数表示されても背景に溶け込むほど抑制されている。

タイポグラフィはプロダクト全体で **system-ui** スタックを使用し、すべての OS でテキストが鮮明にレンダリングされるようにしている。コードには **SFMono / Menlo / Consolas** を組み合わせる。エディトリアルな表示用フォントは存在しない——GitHub の声はあなたが使用しているシステムの声そのものだ。

**主な特徴：**
- 真っ白なキャンバス（`#ffffff`）またはディープネイビーブラック（`#0d1117`）——温かみなし、色調なし
- ヘアラインのグレー境界線（`#d0d7de`）がすべてのペインとパネルを定義する
- Primer ブルー（`#0969da`）はリンク/主要アクション用；GitHub グリーン（`#1a7f37`）は成功/マージ用
- 本文には system-ui；コードには SFMono——カスタム書体なし
- 最小限のパディングで密なリスト行；余白は希少
- 16px / 24px の Octicon アイコン——シングルストローク、幾何学的、一貫性あり
- 強い色彩セマンティクスを持つピル型ステータスバッジ

## 2. カラーパレットと役割

### プライマリ
- **Canvas Default**（`#ffffff`）：ライトテーマのプライマリページ背景。
- **Canvas Subtle**（`#f6f8fa`）：セカンダリサーフェス、サイドバー、入力背景、ヘッダーストリップ。
- **Canvas Inset**（`#eaeef2`）：コードブロック背景、ディープインセットサーフェス。
- **Fg Default**（`#1f2328`）：プライマリテキスト、見出し、本文。
- **Fg Muted**（`#656d76`）：セカンダリテキスト、キャプション、ファイルパス。

### ブランドアクセント
- **Primer Blue**（`#0969da`）：リンク、プライマリ CTA、フォーカスリングの基色——ユニバーサルなインタラクティブカラー。
- **Primer Blue Hover**（`#0550ae`）：プライマリブルーのホバー/プレス状態。
- **Accent Subtle**（`#ddf4ff`）：コールアウト・情報バナー用のソフトブルーサーフェス。

### セマンティック
- **Success / Merge Green**（`#1a7f37`）：マージ済み PR、成功バッジ、マージボタン。
- **Success Subtle**（`#dafbe1`）：成功サーフェスのティント。
- **Open Green**（`#1a7f37`）：Issue/PR の「Open」状態。
- **Closed / Danger Red**（`#cf222e`）：クローズ済み PR、破壊的アクション、バリデーションエラー。
- **Danger Subtle**（`#ffebe9`）：エラーバナーサーフェス。
- **Attention / Warning Yellow**（`#9a6700`）：アンバーサーフェス上の警告テキスト。
- **Attention Subtle**（`#fff8c5`）：警告バナーサーフェス。
- **Done Purple**（`#8250df`）：マージ済みアーカイブ、「done」状態、プレミアムバッジ。
- **Sponsor Pink**（`#bf3989`）：スポンサーハート、GitHub Sponsors ブランドカラー。

### ボーダーとディバイダー
- **Border Default**（`#d0d7de`）：標準のヘアラインボーダー、パネルのアウトライン。
- **Border Muted**（`#d8dee4`）：パネル内の内部ディバイダー。
- **Border Subtle**（`#eaeef2`）：淡いテーブル行ディバイダー。

### ダークテーマ
- **Dark Canvas**（`#0d1117`）：ダークページ背景。
- **Dark Surface**（`#161b22`）：サイドバー、ヘッダー、セカンダリサーフェス。
- **Dark Border**（`#30363d`）：標準ダークモードボーダー。
- **Dark Fg**（`#e6edf3`）：ダーク背景上のプライマリテキスト。

## 3. タイポグラフィのルール

### フォントファミリー
- **本文 / UI**：`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **コード / 等幅**：`ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**：`"Apple Color Emoji", "Segoe UI Emoji"`

### 階層

| 役割 | フォント | サイズ | ウェイト | 行高 | 字間 | 備考 |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | リポジトリヘッダー、マーケティングヒーロー |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | ページ見出し |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | セクション見出し |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | サブセクション、パネルヘッダー |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | デフォルトテキストサイズ——16px ではない |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | キャプション、ファイルメタデータ |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | コードブロック、diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | インライン `code` スパン |

### 原則
- **本文 14px、16px ではない**：GitHub の文字密度はそのアイデンティティだ。より多くの行をビューポートに収めるため、プロダクトは 14px で表示される。
- **ウェイトはバイナリ**：デフォルトはすべて 400；見出しと強調には 600。500 も 700 も使わない。
- **常にシステムフォント**：Chrome 用のウェブフォントは絶対に読み込まない——テキストは低速な接続でも即座にレンダリングされなければならない。

## 4. コンポーネントのスタイル

### ボタン

**プライマリ（グリーン）**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- 用途：「Create repository」、「Merge pull request」

**デフォルト**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`、border `#d0d7de`

**アウトライン（ブルーリンクスタイル）**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`、text `#ffffff`

**デンジャー**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`、text `#ffffff`、border `#a40e26`

### カード / ボックス
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px（ヘッダー）+ 16px（本文）
- ヘッダーには下ボーダーを持つ `#f6f8fa` のストリップがある。

### インプット
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: border `#0969da`、ring `0 0 0 3px rgba(9,105,218,0.3)`

### ステータスピル（Issue / PR）
- **Open**：background `#1a7f37`、テキスト白、padding 4px 10px、radius 9999px。
- **Closed**：background `#cf222e`、テキスト白。
- **Merged**：background `#8250df`、テキスト白。
- **Draft**：background `#6e7781`、テキスト白。

### ラベル（Issue/PR のタグ）
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- 背景色とテキスト色はプログラム的に算出される（ラベルカラー→コントラストに応じてテキスト色を計算）。

## 5. スペーシングとレイアウト

- **基本単位**：4px。スペーシングスケール：4, 8, 12, 16, 24, 32, 40, 48。
- **ページ最大幅**：1280px（`Container-xl`）。
- **サイドバー**：デスクトップで 296px、1012px 以下で折りたたまれる。
- **行のパディング**：水平 16px、垂直 12px（リストはデザインとして密集している）。

## 6. モーション

- **デュレーション**：ホバーは 80ms；メニュー/ポップオーバーの展開は 200ms。
- **イージング**：展開には `ease-out`、閉じるには `ease-in`。
- **意図的に避けるもの**：ページロードアニメーション、パララックス、持続的なマイクロインタラクション。物事は現れる——パフォーマンスはしない。

## 7. 使用上のガードレール

- 密なリスト、ボーダーのあるボックス、システムタイポグラフィは一緒に使うこと——グリーンボタンだけでは GitHub ライクなプロダクトサーフェスは作れない。
- グリーンは建設的なリポジトリ操作に、ブルーはリンクとフォーカスに、レッド/パープル/グレーは Issue・PR・ワークフローの状態にのみ使用する。
- 装飾的なシャドウや大型のマーケティングスタイルカードより、控えめなクローム、明示的なボーダー、コンパクトなスペーシングを優先する。
