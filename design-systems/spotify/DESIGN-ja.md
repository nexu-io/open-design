# Design System Inspired by Spotify

> Category: メディア＆コンシューマー
> 音楽ストリーミング。ダーク背景に鮮やかなグリーン、太いタイポグラフィ、アルバムアート中心の設計。

## 1. ビジュアルテーマ＆雰囲気

Spotifyのウェブインターフェースは、暗くて没入感のある音楽プレーヤーです。リスナーをほぼ黒に近い空間（`#121212`、`#181818`、`#1f1f1f`）に包み込み、アルバムアートとコンテンツが色の主役となります。デザイン哲学は「コンテンツ優先の暗闇」——UIが影の中に溶け込むことで、音楽・ポッドキャスト・プレイリストが輝きを放ちます。あらゆるサーフェスはチャコールの濃淡で構成され、劇場のような空間を生み出しています。その中で唯一の真の色は、象徴的な Spotify Green（`#1ed760`）とアルバムアートワークだけです。

タイポグラフィには SpotifyMixUI と SpotifyMixUITitle を使用しています。これらは CircularSp ファミリーのプロプライエタリフォント（Lineto による Circular を Spotify 向けにカスタマイズ）で、アラビア語・ヘブライ語・キリル文字・ギリシャ語・デーヴァナーガリー・CJK フォントを含む広範なフォールバックスタックを持ち、Spotify のグローバル展開を反映しています。タイプシステムはコンパクトで機能的：強調とナビゲーションに 700（ボールド）、二次的な強調に 600（セミボールド）、本文に 400（レギュラー）を使用します。ボタンはシステマティックなラベル的品質を持たせるため、大文字 + 正のレタースペーシング（1.4px〜2px）を使用しています。

Spotify を特徴づけるのは、ピルと円の形状です。プライマリボタンは 500px〜9999px のradius（フルピル）、円形の再生ボタンは 50% のradius、検索入力は 500px のピルを使用します。浮き上がった要素への重いシャドウ（`rgba(0,0,0,0.5) 0px 8px 24px`）と、ユニークなインセットボーダーシャドウの組み合わせ（`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`）によって、プレミアムなオーディオデバイスのような——触感があり、丸みを帯び、タッチに最適化された——インターフェースが実現しています。

**Key Characteristics:**
- ほぼ黒の没入型ダークテーマ（`#121212`〜`#1f1f1f`）——UIがコンテンツの背後に消える
- Spotify Green（`#1ed760`）を単一のブランドアクセントとして使用——装飾的ではなく、常に機能的
- グローバルスクリプトをサポートする SpotifyMixUI/CircularSp フォントファミリー
- ピルボタン（500px〜9999px）と円形コントロール（50%）——丸みを帯び、タッチ最適化
- 広いレタースペーシング（1.4px〜2px）を持つ大文字のボタンラベル
- 浮き上がった要素への重いシャドウ（`rgba(0,0,0,0.5) 0px 8px 24px`）
- セマンティックカラー：ネガティブレッド（`#f3727f`）、ウォーニングオレンジ（`#ffa42b`）、アナウンスメントブルー（`#539df5`）
- アルバムアートを主要な色の源として——UIはデザイン上アクロマティック

## 2. カラーパレット＆役割

### プライマリブランド
- **Spotify Green**（`#1ed760`）：プライマリブランドアクセント——再生ボタン、アクティブ状態、CTA
- **Near Black**（`#121212`）：最も深い背景サーフェス
- **Dark Surface**（`#181818`）：カード、コンテナ、浮き上がったサーフェス
- **Mid Dark**（`#1f1f1f`）：ボタン背景、インタラクティブサーフェス

### テキスト
- **White**（`#ffffff`）：`--text-base`、プライマリテキスト
- **Silver**（`#b3b3b3`）：セカンダリテキスト、ミュートラベル、非アクティブナビ
- **Near White**（`#cbcbcb`）：わずかに明るいセカンダリテキスト
- **Light**（`#fdfdfd`）：最大の強調に使うほぼ純白

### セマンティック
- **Negative Red**（`#f3727f`）：`--text-negative`、エラー状態
- **Warning Orange**（`#ffa42b`）：`--text-warning`、警告状態
- **Announcement Blue**（`#539df5`）：`--text-announcement`、情報状態

### サーフェス＆ボーダー
- **Dark Card**（`#252525`）：浮き上がったカードサーフェス
- **Mid Card**（`#272727`）：代替カードサーフェス
- **Border Gray**（`#4d4d4d`）：ダーク背景上のボタンボーダー
- **Light Border**（`#7c7c7c`）：アウトラインボタンのボーダー、ミュートリンク
- **Separator**（`#b3b3b3`）：区切り線
- **Light Surface**（`#eeeeee`）：ライトモードのボタン（まれ）
- **Spotify Green Border**（`#1db954`）：グリーンアクセントボーダーのバリアント

### シャドウ
- **Heavy**（`rgba(0,0,0,0.5) 0px 8px 24px`）：ダイアログ、メニュー、浮き上がったパネル
- **Medium**（`rgba(0,0,0,0.3) 0px 8px 8px`）：カード、ドロップダウン
- **Inset Border**（`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`）：入力欄のボーダーシャドウ組み合わせ

## 3. タイポグラフィルール

### フォントファミリー
- **Title**：`SpotifyMixUITitle`、フォールバック：`CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Body**：`SpotifyMixUI`、同じフォールバックスタック

### 階層

| 役割 | フォント | サイズ | ウェイト | 行高 | レタースペーシング | 備考 |
|------|------|------|--------|-------------|----------------|-------|
| Section Title | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | ボールドタイトルウェイト |
| Feature Heading | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (タイト) | normal | セミボールドのセクション見出し |
| Body Bold | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | 強調テキスト |
| Body | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | 標準本文 |
| Button Uppercase | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (タイト) | 1.4px–2px | `text-transform: uppercase` |
| Button | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | 標準ボタン |
| Nav Link Bold | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | ナビゲーション |
| Nav Link | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | 非アクティブナビ |
| Caption Bold | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | ボールドメタデータ |
| Caption | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | メタデータ |
| Small Bold | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | タグ、カウント |
| Small | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | 細かい注記 |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | 最小テキスト |

### 原則
- **ボールド／レギュラーの二項対立**：テキストのほとんどは 700（ボールド）か 400（レギュラー）で、600 はわずかに使用します。サイズ変化ではなくウェイトコントラストによって、明確な視覚的階層を生み出します。
- **システムとしての大文字ボタン**：ボタンラベルは大文字 + 広いレタースペーシング（1.4px〜2px）を使用し、コンテンツテキストとは区別された系統的な「ラベル」のような声質を作り出します。
- **コンパクトなサイジング**：範囲は 10px〜24px——多くのシステムより狭い範囲です。Spotifyのタイポグラフィはコンパクトで機能的であり、記事を読むためではなくプレイリストをスキャンするために設計されています。
- **グローバルスクリプトサポート**：広範なフォールバックスタック（アラビア語、ヘブライ語、キリル文字、ギリシャ語、デーヴァナーガリー、CJK）は、Spotify の 180 以上の市場展開を反映しています。

## 4. コンポーネントスタイリング

### ボタン

**Dark Pill**
- Background: `#1f1f1f`
- Text: `#ffffff` または `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px（フルピル）
- 用途：ナビゲーションピル、セカンダリアクション

**Dark Large Pill**
- Background: `#181818`
- Text: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- 用途：アプリのプライマリナビゲーションボタン

**Light Pill**
- Background: `#eeeeee`
- Text: `#181818`
- Radius: 500px
- 用途：ライトモードの CTA（Cookie 同意、マーケティング）

**Outlined Pill**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px（アイコン用の非対称）
- Radius: 9999px
- 用途：フォローボタン、セカンダリアクション

**Circular Play**
- Background: `#1f1f1f`
- Text: `#ffffff`
- Padding: 12px
- Radius: 50%（円形）
- 用途：再生／一時停止コントロール

### カード＆コンテナ
- Background: `#181818` または `#1f1f1f`
- Radius: 6px〜8px
- ほとんどのカードには目に見えるボーダーなし
- ホバー時：背景がわずかに明るくなる
- Shadow: `rgba(0,0,0,0.3) 0px 8px 8px`（浮き上がった状態）

### 入力欄
- 検索入力：`#1f1f1f` 背景、`#ffffff` テキスト
- Radius: 500px（ピル）
- Padding: 12px 96px 12px 48px（アイコンを考慮）
- フォーカス時：ボーダーが `#000000` に変わり、outline `1px solid`

### ナビゲーション
- アクティブに SpotifyMixUI 14px ウェイト 700、非アクティブに 400 を使用するダークサイドバー
- 非アクティブアイテムに `#b3b3b3` のミュートカラー、アクティブに `#ffffff`
- 円形アイコンボタン（50% radius）
- 左上に緑色の Spotify ロゴ

## 5. レイアウト原則

### スペーシングシステム
- 基本単位：8px
- スケール：1px、2px、3px、4px、5px、6px、8px、10px、12px、14px、15px、16px、20px

### グリッド＆コンテナ
- サイドバー（固定）＋メインコンテンツエリア
- グリッドベースのアルバム／プレイリストカード
- 下部に全幅の再生中バー
- レスポンシブなコンテンツエリアが残りのスペースを埋める

### 余白の哲学
- **ダーク圧縮**：Spotify はコンテンツを高密度に詰め込みます——プレイリストグリッド、トラックリスト、ナビゲーションはすべて密にスペーシングされています。ダーク背景が大きなギャップなしに要素間の視覚的な休憩を提供します。
- **余裕より情報密度**：これはアプリであり、マーケティングサイトではありません。すべてのピクセルがリスニング体験のために機能します。

### ボーダー半径スケール
- Minimal（2px）：バッジ、明示的なタグ
- Subtle（4px）：入力欄、小さな要素
- Standard（6px）：アルバムアートコンテナ、カード
- Comfortable（8px）：セクション、ダイアログ
- Medium（10px〜20px）：パネル、オーバーレイ要素
- Large（100px）：大型ピルボタン
- Pill（500px）：プライマリボタン、検索入力
- Full Pill（9999px）：ナビゲーションピル、検索
- Circle（50%）：再生ボタン、アバター、アイコン

## 6. 奥行き＆エレベーション

| レベル | 処理 | 用途 |
|-------|-----------|-----|
| Base (Level 0) | `#121212` 背景 | 最も深い層、ページ背景 |
| Surface (Level 1) | `#181818` または `#1f1f1f` | カード、サイドバー、コンテナ |
| Elevated (Level 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | ドロップダウンメニュー、ホバーカード |
| Dialog (Level 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | モーダル、オーバーレイ、メニュー |
| Inset (Border) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | 入力欄のボーダー |

**シャドウの哲学**：Spotify はダークテーマのアプリとしては際立って重いシャドウを使用しています。24px ブラーでの 0.5 不透明度シャドウは、ダイアログやメニューに「暗闇に浮かぶ」ような劇的な効果を与えます。一方、8px ブラーでの 0.3 不透明度はより繊細なカードの浮き上がりを表現します。入力欄のユニークなインセットボーダーシャドウの組み合わせは、奥まったような触感を生み出します。

## 7. すべきこと・してはいけないこと

### すべきこと
- ほぼ黒の背景（`#121212`〜`#1f1f1f`）を使用する——濃淡の変化で奥行きを表現
- Spotify Green（`#1ed760`）は再生コントロール、アクティブ状態、プライマリ CTA にのみ適用する
- すべてのボタンにピル形状（500px〜9999px）を使用する——再生コントロールには円形（50%）
- ボタンラベルに大文字 + 広いレタースペーシング（1.4px〜2px）を適用する
- タイポグラフィはコンパクトに保つ（10px〜24px の範囲）——これはアプリであり、雑誌ではない
- 浮き上がった要素にはダーク背景上で重いシャドウ（0.3〜0.5 不透明度）を使用する
- アルバムアートが色を提供する——UI 自体はアクロマティックに

### してはいけないこと
- Spotify Green を装飾的に、または背景に使用しない——機能的な用途にのみ
- プライマリサーフェスにライト背景を使用しない——ダークへの没入がコアである
- ボタンのピル／円形のジオメトリを省略しない——四角いボタンはアイデンティティを壊す
- 薄い／繊細なシャドウを使用しない——ダーク背景では、シャドウは視認性のために重くする必要がある
- 追加のブランドカラーを加えない——グリーン＋アクロマティックなグレーが完全なパレット
- ゆったりした行高を使用しない——Spotifyのタイポグラフィはコンパクトで高密度
- 生のグレーボーダーをそのまま見せない——シャドウベースまたはインセットボーダーを使用する

## 8. レスポンシブ挙動

### ブレークポイント
| 名称 | 幅 | 主な変化 |
|------|-------|-------------|
| Mobile Small | <425px | コンパクトモバイルレイアウト |
| Mobile | 425–576px | 標準モバイル |
| Tablet | 576–768px | 2カラムグリッド |
| Tablet Large | 768–896px | 拡張レイアウト |
| Desktop Small | 896–1024px | サイドバー表示 |
| Desktop | 1024–1280px | フルデスクトップレイアウト |
| Large Desktop | >1280px | 拡張グリッド |

### 折りたたみ戦略
- サイドバー：全表示→折りたたみ→非表示
- アルバムグリッド：5カラム→3→2→1
- 再生中バー：全サイズで表示を維持
- 検索：ピル入力を維持、幅を調整
- ナビゲーション：サイドバー→モバイルではボトムバー

## 9. エージェントプロンプトガイド

### クイックカラーリファレンス
- Background: Near Black（`#121212`）
- Surface: Dark Card（`#181818`）
- Text: White（`#ffffff`）
- Secondary text: Silver（`#b3b3b3`）
- Accent: Spotify Green（`#1ed760`）
- Border: `#4d4d4d`
- Error: Negative Red（`#f3727f`）

### コンポーネントプロンプト例
- "Create a dark card: #181818 background, 8px radius. Title at 16px SpotifyMixUI weight 700, white text. Subtitle at 14px weight 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px on hover."
- "Design a pill button: #1f1f1f background, white text, 9999px radius, 8px 16px padding. 14px SpotifyMixUI weight 700, uppercase, letter-spacing 1.4px."
- "Build a circular play button: Spotify Green (#1ed760) background, #000000 icon, 50% radius, 12px padding."
- "Create search input: #1f1f1f background, white text, 500px radius, 12px 48px padding. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Design navigation sidebar: #121212 background. Active items: 14px weight 700, white. Inactive: 14px weight 400, #b3b3b3."

### イテレーションガイド
1. `#121212` から始める——すべてがほぼ黒の暗闇の中に存在する
2. Spotify Green は機能的なハイライトにのみ使用（再生、アクティブ、CTA）
3. すべてをピルに——大きなものは 500px、小さなものは 9999px、円形には 50%
4. ボタンは大文字 + 広いトラッキング——系統的なラベルの声質
5. 重いシャドウ（0.3〜0.5 不透明度）でエレベーションを表現——暗い背景では薄いシャドウは見えない
6. アルバムアートがすべての色を提供する——UI はアクロマティックを保つ
