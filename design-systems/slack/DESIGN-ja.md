# Slack に着想を得たデザインシステム

> Category: 生産性・SaaS
> 職場向けコミュニケーションプラットフォーム。深いオーベルジーヌを主色に、マルチアクセントのロゴパレット、ダークサイドバーを組み合わせた明るいサーフェス。温かみがあり親しみやすい。

## 1. ビジュアルテーマと雰囲気

Slack のアイデンティティは、「仕事は人間らしく、少し楽しくあるべきだ」というコンセプトに基づいています。標準的なサーフェスは**明るい**——白いコンテンツエリアに深いオーベルジーヌ（`#4A154B`）のサイドバー——ダーク優先のツールとは対照的です。このコントラストは意図的なもので、サイドバーは落ち着いた常設のナビゲーションアンカーであり、コンテンツエリアは明るく開放的です。

ロゴパレット——青、緑、黄、赤——は主にハッシュタグアイコンやマーケティングの文脈で使用され、UI 全体に散りばめられてはいません。製品内では、Slack はオーベルジーヌを唯一のブランドアンカーとして使用する、節制された専門的なカラーシステムを採用しています。

**主な特徴：**
- 明るさ優先のコンテンツサーフェス：ホワイト `#FFFFFF` とニアホワイト `#F8F8F8`
- 深いオーベルジーヌ `#4A154B` のサイドバー——ブランドで最も象徴的な UI 要素
- 4 つのロゴアクセントカラー（青、緑、黄、赤）はハイライトのみに少量使用
- 見出しに Larsseit（マーケティング）、UI にはシステムサンセリフ
- 丸みはあるがカートゥーン調ではない：ほとんどのコンポーネントで 4〜8px の角丸
- 密度があり息づかいのある：コンパクトなメッセージ行と明確なスレッド階層
- 温かく会話的なトーン——絵文字、リアクション、イラストはファーストクラス

---

## 2. カラーパレットと役割

### ブランドプライマリ
| トークン | Hex | 役割 |
|---|---|---|
| `--color-aubergine` | `#4A154B` | サイドバー背景、ブランドプライマリカラー |
| `--color-aubergine-dark` | `#350d36` | オーベルジーヌサーフェスのホバー状態 |
| `--color-aubergine-light` | `#611f69` | サイドバーのアクティブアイテムハイライト |

### ロゴアクセントカラー（少量使用——ハイライト、アイコン、マーケティングのみ）
| トークン | Hex | 名前 | 役割 |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | スカイブルー | チャンネルアイコン、リンク、情報状態 |
| `--color-green` | `#2EB67D` | ティールグリーン | オンラインステータス、成功状態 |
| `--color-yellow` | `#ECB22E` | ゴールド | 離席ステータス、警告、ハイライト |
| `--color-red` | `#E01E5A` | ルビー | 通知、エラー、メンションバッジ |

### サーフェスと背景
| トークン | Hex | 役割 |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | メインメッセージエリア、モーダル |
| `--bg-secondary` | `#F8F8F8` | スレッドパネル、セカンダリサーフェス |
| `--bg-tertiary` | `#F1F1F1` | 入力欄の背景、ホバー状態 |
| `--bg-sidebar` | `#4A154B` | 左サイドバー（オーベルジーヌ） |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | サイドバーアイテムのホバー |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | アクティブなサイドバーアイテム |
| `--bg-message-hover` | `#F8F8F8` | メッセージ行のホバー |

### テキストカラー
| トークン | Hex | 役割 |
|---|---|---|
| `--text-primary` | `#1D1C1D` | メインボディテキスト（ニアブラック） |
| `--text-secondary` | `#616061` | タイムスタンプ、ミュートラベル |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | サイドバーのチャンネル名 |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | サイドバーの非アクティブアイテム |
| `--text-link` | `#1264A3` | メッセージ内のインラインリンク |
| `--text-mention` | `#1264A3` | @メンションのテキストカラー |

### セマンティックカラー
| トークン | Hex | 役割 |
|---|---|---|
| `--color-success` | `#2EB67D` | 成功トースト、ポジティブな状態 |
| `--color-warning` | `#ECB22E` | 警告状態 |
| `--color-danger` | `#E01E5A` | エラー状態、破壊的なアクション |
| `--color-info` | `#36C5F0` | 情報ハイライト |

### ボーダーと区切り線
| トークン | Hex | 役割 |
|---|---|---|
| `--border-default` | `#DDDDDD` | 標準の区切り線、カードボーダー |
| `--border-subtle` | `#F1F1F1` | 行間の微妙なセパレーター |
| `--border-focus` | `#1264A3` | フォーカスリングのカラー |

---

## 3. タイポグラフィルール

### 書体
| 役割 | 公式 | ウェブフォールバック |
|---|---|---|
| ディスプレイ / マーケティング見出し | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / ボディ / クローム | Slack Lato（カスタム） | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| コード / 等幅 | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack はマーケティングの見出しに **Larsseit** を使用し、製品内 UI にはカスタム Lato バリアントを使用しています。ウェブでの使用には、`system-ui` が最も安全なフォールバックです。

### タイプスケール

| レベル | サイズ | ウェイト | 行高 | 字間 | 用途 |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | マーケティングのヒーロー見出し |
| Display L | 36px | 700 | 1.15 | -0.5px | セクションヒーロー |
| Heading 1 | 28px | 700 | 1.25 | normal | モーダルタイトル、ページヘッダー |
| Heading 2 | 22px | 700 | 1.3 | normal | カードタイトル、設定セクション |
| Heading 3 | 18px | 700 | 1.35 | normal | サブセクションヘッダー |
| Body L | 16px | 400 | 1.5 | normal | メッセージテキスト、説明 |
| Body | 15px | 400 | 1.46667 | normal | デフォルト UI テキスト（Slack の基本サイズ） |
| Body SM | 13px | 400 | 1.38462 | normal | セカンダリメタデータ |
| Caption | 12px | 400 | 1.33 | normal | タイムスタンプ、ヒント |
| Code | 12px | 400 | 1.5 | normal | インラインコード、コードブロック |

### タイポグラフィルール
- Slack の基本ボディサイズは **15px**——密度を高めるため 16px より若干小さい
- 未読チャンネル：ウェイト 700——太字が主な未読インジケーター
- タイムスタンプ：12px `--text-secondary`、ホバー時のみ表示
- コードブロック：背景 `#F8F8F8`、ボーダー `1px solid #DDDDDD`、角丸 4px
- フォントサイズを 12px 未満にしない
- マーケティング見出し：大きなディスプレイサイズには字間 `-1px`

---

## 4. コンポーネントスタイル

### ボタン

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### 入力フィールド
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### サイドバーチャンネルアイテム
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### 未読バッジ
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### メッセージ添付ファイル / カード
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### リアクション
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. レイアウト原則

### 3 カラムレイアウト
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### スペーシングシステム（ベースは 4px）
| トークン | 値 | 用途 |
|---|---|---|
| `--space-1` | 4px | タイトなギャップ |
| `--space-2` | 8px | コンポーネントパディング |
| `--space-3` | 12px | 入力パディング |
| `--space-4` | 16px | 標準パディング |
| `--space-6` | 24px | カードパディング |
| `--space-8` | 32px | セクションギャップ |

### サイドバー構造
```
[ワークスペース名 ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### メッセージコンポーザー
- メッセージエリアの底部に固定
- `border: 1px solid #DDDDDD`、`border-radius: 8px`、`margin: 0 16px 16px`
- ツールバー：絵文字、添付、書式設定、送信ボタン

---

## 6. 深度とエレベーション

Slack は明るいサーフェスに軽いシャドウを使用しています：

| レベル | 用途 | シャドウ |
|---|---|---|
| フラット | メッセージ行、サイドバーアイテム | none |
| 低 | カード、入力欄 | `0 1px 3px rgba(0,0,0,0.08)` |
| 中 | ドロップダウン、ポップオーバー | `0 4px 12px rgba(0,0,0,0.12)` |
| 高 | モーダル、ダイアログ | `0 8px 24px rgba(0,0,0,0.15)` |
| オーバーレイ | モーダルバックドロップ | `rgba(0,0,0,0.5)` |

---

## 7. すべきこととすべきでないこと

### ✅ すべきこと
- サイドバーにオーベルジーヌ `#4A154B` を使用する——Slack 最も象徴的な UI 要素
- メインコンテンツエリアを白く明るく保つ
- すべてのボディテキストに `#1D1C1D`（ニアブラック）を使用し、純粋な黒は避ける
- チャンネル名を太字にして未読状態を示す——ウェイトがインジケーター
- 4 つのアクセントカラーはセマンティックな役割（成功、警告、危険、情報）のみに使用
- メッセージの添付ファイルと埋め込みに `border-left: 4px` を適用
- タイムスタンプはホバー時のみ表示
- リンクとフォーカス状態に `#1264A3` を使用
- サイドバーアイテムをコンパクトに保つ：高さ 28px、角丸 6px

### ❌ すべきでないこと
- メインコンテンツエリアをダークにしない——Slack は明るさ優先
- 青/緑/黄/赤を装飾的なアクセントとして散りばめない
- テキストに純粋な黒 `#000000` を使用しない
- 吹き出しを使用しない——メッセージはフラットな行
- ボタンを大きな角丸にしない——4px が標準
- タイムスタンプを常時表示しない
- チャンネル名をすべて大文字にしない
- フォントサイズを 12px 未満にしない

---

## 8. レスポンシブ動作

### ブレークポイント
| ブレークポイント | 幅 | レイアウト |
|---|---|---|
| モバイル | < 768px | シングルパネル、サイドバーは左ドロワー |
| タブレット | 768–1024px | サイドバー + メッセージエリアのみ |
| デスクトップ | > 1024px | フルの 3 カラムレイアウト |

### モバイルアダプテーション
- サイドバー：左ドロワー、右スワイプで開く
- ボトムタブバー：ホーム、DM、アクティビティ、プロフィール
- スレッドパネル：フルスクリーンオーバーレイ
- コンポーザー：キーボードの上に固定
- チャンネルリストアイテム：44px のタッチターゲット高さ
- モバイルでもオーベルジーヌのトップヘッダーバーを維持

---

## 9. Agent プロンプトガイド

Slack スタイルのデザインを生成する際は、以下のアプローチに従ってください：

**カラーの適用：**
> メインキャンバスとして `background: #FFFFFF` を設定します。サイドバーには `#4A154B`（オーベルジーヌ）を使用します。すべてのプライマリテキストは `#1D1C1D` です。リンクとフォーカスリングは `#1264A3` を使用します。4 つのロゴカラー——`#36C5F0`、`#2EB67D`、`#ECB22E`、`#E01E5A`——はセマンティック専用：情報、成功、警告、危険。

**タイポグラフィ：**
> すべての UI に `system-ui, -apple-system, sans-serif` を使用します。ベースサイズは 15px です。未読チャンネル：ウェイト 700。ボディテキスト：ウェイト 400。タイムスタンプ：12px `#616061`、ホバー時のみ。コード：`Monaco, Menlo, monospace`、12px、背景 `#F8F8F8`。

**レイアウト：**
> 3 カラム：240px のオーベルジーヌサイドバー + フレキシブルな白いメッセージエリア + オプションの 400px スレッドパネル。サイドバーアイテム：高さ 28px、角丸 6px、未読時は太字。コンポーザー：底部固定、`border: 1px solid #DDDDDD`、`border-radius: 8px`。

**コンポーネント：**
> ボタン：角丸 4px、高さ 36px、オーベルジーヌプライマリ。入力欄：`1px solid #DDDDDD` ボーダー、`#1264A3` フォーカスリング。メッセージ行：フラット、吹き出しなし、36px の円形アバター。リアクション：ピル形 `border: 1px solid #DDDDDD`、`border-radius: 24px`。

**トーン：**
> Slack は温かく、プロフェッショナルで、人間らしいです。空の状態にはフレンドリーなイラストを使用します。CTA は直接的：「Send message」、「Get started」。エラーメッセージは明確で助けになります。決して不安をあおらない。

**避けるべきアンチパターン：**
> ダークなコンテンツエリア禁止。吹き出し禁止。純粋な黒のテキスト禁止。散乱したマルチカラーアクセント禁止。チャンネル名の全大文字禁止。12px 未満のフォント禁止。大きな角丸ボタン禁止。
