# Open Design へのコントリビューション

コントリビューションを検討してくださりありがとうございます。OD は意図的に小さく保っています — 価値の大部分はフレームワークコードではなく**ファイル**（Skill、Design System、プロンプトフラグメント）にあります。そのため、最も効果の高いコントリビューションは通常、フォルダ 1 つ、Markdown ファイル 1 つ、または PR サイズの adapter です。

このガイドでは、各種コントリビューションの対象場所と、PR がマージされるために満たすべき基準を正確に説明します。

<p align="center"><a href="CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <b>日本語</b></p>

---

## 午後一回で出荷できる 3 つのこと

| やりたいこと | 実際に追加するもの | 配置場所 | 規模 |
|---|---|---|---|
| OD に新しい種類の artifact をレンダリングさせる（請求書、iOS Settings 画面、ワンページャー…） | **Skill** | [`skills/<your-skill>/`](skills/) | フォルダ 1 つ、約 2 ファイル |
| OD に新しいブランドのビジュアル言語を話させる | **Design System** | [`design-systems/<brand>/DESIGN.md`](design-systems/) | Markdown ファイル 1 つ |
| 新しい coding-agent CLI を接続する | **Agent adapter** | [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) | 1 つの配列に約 10 行 |
| 機能追加、バグ修正、[`open-codesign`][ocod] から UX パターンを移植 | コード | `apps/web/src/`、`apps/daemon/` | 通常の PR |
| ドキュメント改善、Français / Deutsch / 中文 への翻訳、タイポ修正 | ドキュメント | `README.md`、`README.fr.md`、`README.de.md`、`README.zh-CN.md`、`docs/`、`QUICKSTART.md` | PR 1 つ |

アイデアがどのカテゴリに該当するか分からない場合は、[まず discussion / issue を作成](https://github.com/nexu-io/open-design/issues/new)してください。適切な場所をご案内します。

---

## ローカル環境セットアップ

完全なセットアップ手順は [`QUICKSTART.md`](QUICKSTART.md) にあります。コントリビューター向けの要約：

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # packageManager で指定された pnpm を選択
pnpm install
pnpm tools-dev run web    # daemon + web フォアグラウンドループ
pnpm typecheck            # tsc -b --noEmit
pnpm build                # プロダクションビルド
```

Node `~24` と pnpm `10.33.x` が必要です。`nvm` / `fnm` はオプション。使用する場合は `nvm install 24 && nvm use 24` または `fnm install 24 && fnm use 24` を実行してください。macOS、Linux、WSL2 が主要プラットフォームです。Windows ネイティブでも動作するはずですが、主要ターゲットではありません — 動作しない場合は issue を作成してください。

OD 自体の開発に agent CLI は `PATH` 上に不要です — daemon は「no agents found」と表示し、**Anthropic API · BYOK** パスにフォールバックします。このパスが最も高速な開発ループです。

---

## 新しい Skill の追加

Skill は [`skills/`](skills/) 配下のフォルダで、ルートに `SKILL.md` を持ち、Claude Code の [`SKILL.md` 規約][skill]とオプションの `od:` 拡張に従います。**登録ステップは不要です。** フォルダを配置して daemon を再起動すれば、ピッカーに表示されます。

### Skill フォルダ構成

```text
skills/your-skill/
├── SKILL.md                    # 必須
├── assets/template.html        # オプションだが推奨 — seed ファイル
├── references/                 # オプション — エージェントが読むナレッジファイル
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # 強く推奨 — 実際の手作りサンプル
```

### `SKILL.md` frontmatter

最初の 3 キーは Claude Code のベース仕様 — `name`、`description`、`triggers`。`od:` 配下はすべて OD 固有のオプションですが、**`od.mode`** が Skill の表示グループ（Prototype / Deck / Template / Design system）を決定します。

```yaml
---
name: your-skill
description: |
  1 段落のエレベーターピッチ。エージェントはこれをそのまま読んで、
  ユーザーの要件にマッチするか判断します。具体的に：surface、
  ターゲット、artifact に含まれるもの、含まれないもの。
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "日本語のトリガーフレーズ"
od:
  mode: prototype           # prototype | deck | template | design-system
  platform: desktop         # desktop | mobile
  scenario: marketing       # グループ化用の自由形式タグ
  featured: 1               # 正の整数を設定すると「ショーケース」セクションに表示
  preview:
    type: html              # html | jsx | pptx | markdown
    entry: index.html
  design_system:
    requires: true          # Skill がアクティブな DESIGN.md を読むか？
    sections: [color, typography, layout, components]
  example_prompt: "この Skill の機能をわかりやすく示すコピペ可能なプロンプト。"
---

# Your Skill

本文はエージェントが従うべきワークフローを記述する自由形式の Markdown…
```

型付き入力、スライダーパラメータ、ケイパビリティゲーティングの完全な文法は [`docs/skills-protocol.md`](docs/skills-protocol.md) にあります。

### 新しい Skill のマージ基準

Skill はユーザーに直接見える面であるため、厳しく審査します。新しい Skill は以下を満たす必要があります：

1. **実際の `example.html` を同梱すること。** 手作りで、ディスクから直接開けて、デザイナーが実際に納品するレベルの見た目であること。Lorem ipsum や `<svg><rect/></svg>` のプレースホルダー hero は不可。自分で example を作れないなら、その Skill はまだ準備できていません。
2. **本文で anti-AI-slop チェックリストをパスすること。** 紫グラデーション、汎用 emoji アイコン、左ボーダー付き角丸カード、Inter を *display* フォントとして使用、架空の統計データは不可。完全なリストは README の **anti-AI-slop 機構**セクションを参照。
3. **正直なプレースホルダー。** エージェントが実数値を持たない場合は `—` またはラベル付きグレーブロックを書き、「10 倍高速」とは書かない。
4. **`references/checklist.md` を持つこと。** 少なくとも P0 ゲート（エージェントが `<artifact>` を出力する前にパスすべき項目）を含む。フォーマットは [`skills/guizang-ppt/references/checklist.md`](skills/guizang-ppt/) または [`skills/dating-web/references/checklist.md`](skills/dating-web/) を参考にしてください。
5. **スクリーンショットを追加。** Skill が featured の場合、`docs/screenshots/skills/<skill>.png` に配置。PNG、約 1024×640 Retina、実際の `example.html` からズームアウトしたブラウザ縮尺でキャプチャ。
6. **単一の自己完結フォルダであること。** 他の Skill が既に使用しているもの以外の CDN インポート禁止。ライセンスのないフォント禁止。約 250 KB を超える画像禁止。

既存の Skill を fork する場合（例：`dating-web` から `recruiting-web` にリミックス）、元の LICENSE と帰属表示を `references/` に保持し、PR の説明で明記してください。

### 同梱済み Skill — 模倣するものを選ぶ

- ビジュアルショーケース、単一画面プロトタイプ：[`skills/dating-web/`](skills/dating-web/)、[`skills/digital-eguide/`](skills/digital-eguide/)
- マルチフレームモバイルフロー：[`skills/mobile-onboarding/`](skills/mobile-onboarding/)、[`skills/gamified-app/`](skills/gamified-app/)
- ドキュメント / テンプレート（Design System 不要）：[`skills/pm-spec/`](skills/pm-spec/)、[`skills/weekly-update/`](skills/weekly-update/)
- Deck モード：[`skills/guizang-ppt/`](skills/guizang-ppt/)（[op7418/guizang-ppt-skill][guizang] からそのまま同梱）および [`skills/simple-deck/`](skills/simple-deck/)

---

## 新しい Design System の追加

Design System は `design-systems/<slug>/` 配下の単一の [`DESIGN.md`](design-systems/README.md) ファイルです。**ファイル 1 つ、コード不要。** 配置して daemon を再起動すれば、ピッカーにカテゴリ別にグループ化されて表示されます。

### Design System フォルダ構成

```text
design-systems/your-brand/
└── DESIGN.md
```

### `DESIGN.md` の構造

```markdown
# Design System Inspired by YourBrand

> Category: Developer Tools
> ピッカーのプレビューに表示される 1 行の要約。

## 1. Visual Theme & Atmosphere
…

## 2. Color
- Primary: `#hex` / `oklch(...)`
- …

## 3. Typography
…

## 4. Spacing & Grid
## 5. Layout & Composition
## 6. Components
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

9 セクションスキーマは固定です — Skill 本文の grep 対象だからです。最初の H1 がピッカーのラベルになり（`Design System Inspired by` プレフィックスは自動的に除去）、`> Category: …` 行がグループを決定します。既存のカテゴリは [`design-systems/README.md`](design-systems/README.md) に記載されています。ブランドが本当にどのカテゴリにも合わない場合は新しいカテゴリを導入できますが、**まず既存カテゴリに合わないか試してください**。

### 新しい Design System のマージ基準

1. **全 9 セクションが存在すること。** データが見つかりにくいセクション（例：モーショントークン）は本文が空でも構いませんが、見出しは必須です。見出しがないとプロンプトの grep が壊れます。
2. **Hex コードが実物であること。** ブランドのサイトやプロダクトから直接サンプリングし、記憶や AI の推測ではないこと。README の「ブランドアセット抽出」5 ステッププロトコルはメンテナにも適用されます。
3. **アクセントカラーの OKLch 値**はあると良い。ライト/ダーク間で予測可能な補間が可能になります。
4. **マーケティングの美辞麗句は不要。** ブランドのタグラインはデザイントークンではありません。削除してください。
5. **スラッグは ASCII を使用** — `linear.app` は `linear-app`、`x.ai` は `x-ai` になります。インポート済みの 69 システムがこの規約に従っています。それに合わせてください。

出荷している 69 のプロダクトシステムは [`VoltAgent/awesome-design-md`][acd2] から [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 経由でインポートされています。ブランドが上流に属する場合は、**まずそちらに PR を送ってください** — 次の sync で自動的に反映されます。`design-systems/` フォルダは上流に合わないシステムと、手作りの 2 つのスターター用です。

---

## 新しい coding-agent CLI の追加

新しいエージェント（例：`foo-coder` CLI）の接続は [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) にエントリを 1 つ追加するだけです：

```javascript
{
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // Claude Code と同じプロトコルなら 'claude-stream-json'
}
```

これだけです — daemon が `PATH` 上で検出し、ピッカーに表示され、チャットパスが動作します。CLI が**型付きイベント**を出力する場合（Claude Code の `--output-format stream-json` のように）、[`apps/daemon/src/claude-stream.ts`](apps/daemon/src/claude-stream.ts) にパーサーを追加して `streamFormat: 'claude-stream-json'` を設定してください。

マージ基準：

1. **新しいエージェントで実際のセッションがエンドツーエンドで動作すること** — artifact がストリーミングされたことを示す daemon ログを PR の説明に貼り付けてください。
2. **`docs/agent-adapters.md`** を CLI の特徴で更新（キーファイルは必要か？画像入力に対応しているか？非対話モードのフラグは何か？）。
3. **README の「対応 Coding Agent」テーブル**に 1 行追加。

---

## コードスタイル

フォーマットについて厳格ではありません（保存時の Prettier で OK）が、2 つのルールはプロンプトスタックとユーザー向け API に影響するため交渉の余地がありません：

1. **JS/TS ではシングルクォート。** エスケープが見苦しくなる場合を除き、文字列はシングルクォート。コードベースは既に一貫しています — 合わせてください。
2. **コメントは英語。** PR が何かを日本語に翻訳する場合でも、コードコメントは英語を維持します。grep 可能なリファレンスを 1 セットに保つためです。

その他：

- **ナレーションしない。** `// import the module`、`// loop through items` は不要。コードが明らかに読める場合、コメントはノイズです。コメントはコードで表現できない非自明な意図や制約のために残してください。
- **TypeScript** は `apps/web/src/` 用。daemon（`apps/daemon/`）は型が重要な箇所で JSDoc 付きのプレーン ESM JavaScript です — そのまま維持してください。
- **新しいトップレベル依存関係は追加しない**（PR の説明で得られるものと出荷バイト数について 1 段落の説明がない限り）。[`package.json`](package.json) の依存関係リストは意図的に小さく保っています。
- **プッシュ前に `pnpm typecheck` を実行。** CI で実行されます。失敗すると「please fix」コメントが付きます。

---

## コミットとプルリクエスト

- **PR 1 つにつき 1 つの関心事。** Skill の追加 + パーサーのリファクタリング + 依存関係のバンプは 3 つの PR です。
- **タイトルは命令形 + スコープ。** `add dating-web skill`、`fix daemon SSE backpressure when CLI hangs`、`docs: clarify .od layout`。
- **本文は「なぜ」を説明。** 「何をするか」は通常 diff から明らかです。「なぜこれが必要か」はほとんどの場合そうではありません。
- **issue がある場合は参照。** ない場合で、PR が自明でないなら、先に issue を作成して変更が求められていることを合意してから時間を費やしてください。
- **レビュー中にスカッシュしない。** fixup をプッシュしてください。マージ時にスカッシュします。
- **共有ブランチへの force-push 禁止。** レビュアーが依頼した場合を除きます。

CLA は求めません。Apache-2.0 でカバーされます。あなたのコントリビューションは同じライセンスの下でライセンスされます。

---

## バグ報告

以下の情報を含めて issue を作成してください：

- 実行したコマンド（正確な `pnpm tools-dev ...` の呼び出し）。
- 選択されたエージェント CLI（または BYOK パスを使用していたか）。
- トリガーとなった Skill + Design System のペア。
- 関連する **daemon stderr のテール** — 「artifact がレンダリングされない」という報告のほとんどは、`spawn ENOENT` や CLI の実際のエラーが見えれば 30 秒で診断できます。
- UI に関する場合はスクリーンショット。

プロンプトスタックのバグ（「エージェントが紫グラデーションの hero を出力した、slop ブラックリストで禁止されているはずなのに」）の場合、**アシスタントメッセージの全文**を含めてください。違反がモデル側かプロンプト側かを判断できます。

---

## 質問する

- アーキテクチャの質問、設計の質問、「これはバグか使い方の問題か」→ [GitHub Discussions](https://github.com/nexu-io/open-design/discussions)（推奨 — 次の人が検索できます）。
- 「X をする Skill はどう書けばいい？」→ Discussion を作成してください。回答し、不足しているパターンであれば [`docs/skills-protocol.md`](docs/skills-protocol.md) に反映します。

---

## 受け入れないもの

プロジェクトの焦点を維持するため、以下のような PR は作成しないでください：

- **モデルランタイムを vendor する。** OD の根幹は「あなたの既存 CLI で十分」です。`pi-ai`、OpenAI キー、モデルローダーは同梱しません。
- **事前の議論なくフロントエンドを現在のスタックから書き換える。** Next.js 16 App Router + React 18 + TS がラインです。メンテナが明示的にそのマイグレーションを望まない限り、Astro、Solid、Svelte、その他のフレームワークへの書き換えは不可。
- **daemon をサーバーレス関数に置き換える。** daemon の存在意義は実際の `cwd` を所有し、実際の CLI を spawn することです。SPA の Vercel デプロイは OK。daemon は daemon のまま。
- **テレメトリ / アナリティクス / phone-home を追加する。** OD はローカルファーストです。外向きの呼び出しはユーザーが明示的に設定したプロバイダへのもののみ。
- **ライセンスファイルと帰属表示なしでバイナリを同梱する。**

アイデアが適合するか分からない場合は、コードを書く前に discussion を作成してください。

---

## ライセンス

コントリビューションすることにより、あなたのコントリビューションがこのリポジトリの [Apache-2.0 License](LICENSE) の下でライセンスされることに同意するものとします。ただし、[`skills/guizang-ppt/`](skills/guizang-ppt/) 内のファイルは元の MIT ライセンスと [op7418](https://github.com/op7418) の帰属表示を保持します。

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
