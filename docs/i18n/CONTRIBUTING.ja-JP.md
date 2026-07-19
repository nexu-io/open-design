# Open Design へのコントリビューション

コントリビューションを検討してくださりありがとうございます。OD は意図的に小さく保っています — 価値の大部分はフレームワークコードではなく**ファイル**（Skill、Design System、プロンプトフラグメント）にあります。そのため、最も効果の高いコントリビューションは通常、フォルダ 1 つ、Markdown ファイル 1 つ、または PR サイズの adapter です。

このガイドでは、各種コントリビューションの対象場所と、PR がマージされるために満たすべき基準を正確に説明します。

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <b>日本語</b> · <a href="CONTRIBUTING.ko.md">한국어</a> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a></p>

---

## 午後一回で出荷できる 3 つのこと

| やりたいこと | 実際に追加するもの | 配置場所 | 規模 |
|---|---|---|---|
| OD に新しい種類の artifact をレンダリングさせる（請求書、iOS Settings 画面、ワンページャー…） | **Design template** | [`design-templates/<your-template>/`](../../design-templates/) | `SKILL.md` とレンダリング asset を含むフォルダ 1 つ |
| タスク中にエージェントが呼び出す機能を追加する | **Skill** | [`skills/<your-skill>/`](../../skills/) | `SKILL.md` とオプションのリソースを含むフォルダ 1 つ |
| OD に新しいブランドのビジュアル言語を話させる | **Design System** | [`design-systems/<brand>/`](../../design-systems/) | 1 つのパッケージ：`manifest.json`、`DESIGN.md`、`tokens.css` |
| 新しい coding-agent CLI を接続する | **Agent adapter** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | 定義 1 つと registry entry 1 つ |
| 機能追加、バグ修正、[`open-codesign`][ocod] から UX パターンを移植 | コード | `apps/web/src/`、`apps/daemon/` | 通常の PR |
| ドキュメント改善、Français / Deutsch / 中文 への翻訳、タイポ修正 | ドキュメント | `README.md`、`README.fr.md`、`README.de.md`、`README.zh-CN.md`、`docs/`、`QUICKSTART.md` | PR 1 つ |

アイデアがどのカテゴリに該当するか分からない場合は、[まず discussion / issue を作成](https://github.com/nexu-io/open-design/issues/new)してください。適切な場所をご案内します。

---

## ローカル環境セットアップ

完全なセットアップ手順は [`QUICKSTART.md`](../../QUICKSTART.md) にあります。コントリビューター向けの要約：

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # packageManager で指定された pnpm を選択
pnpm install
pnpm tools-dev run web    # daemon + web フォアグラウンドループ
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # 必要に応じて web パッケージをビルド
```

Node `~24` と pnpm `10.33.x` が必要です。`nvm` / `fnm` はオプション。使用する場合は `nvm install 24 && nvm use 24` または `fnm install 24 && fnm use 24` を実行してください。macOS、Linux、WSL2 が主要プラットフォームです。Windows ネイティブもサポートされています — 一般的なセットアップ時の落とし穴については [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) を参照してください。

OD 自体の開発に agent CLI は `PATH` 上に不要です — daemon は「no agents found」と表示し、**Anthropic API · BYOK** パスにフォールバックします。このパスが最も高速な開発ループです。

---

## 新しい Design template の追加

Design template は [`design-templates/`](../../design-templates/) 配下のフォルダで、ルートに `SKILL.md` を持ち、Claude Code の [`SKILL.md` 規約][skill]とオプションの `od:` 拡張に従います。Templates ギャラリーに表示する artifact の形とレンダリングリソースをまとめます。

### → 詳細は [`docs/skills-contributing.md`](../../docs/skills-contributing.md) を参照

### Design template フォルダ構成

```text
design-templates/your-template/
├── SKILL.md                    # 必須
├── assets/template.html        # オプションだが推奨 — seed ファイル
├── references/                 # オプション — エージェントが読むナレッジファイル
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # 強く推奨 — 実際の手作りサンプル
```

### `SKILL.md` frontmatter

最初の 3 キーは Claude Code のベース仕様 — `name`、`description`、`triggers`。`od:` 配下はすべて OD 固有のオプションですが、**`od.mode`** が template の表示グループ（Prototype / Deck / Template / Design system）を決定します。

```yaml
---
name: your-template
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
  design_system:
    requires: true          # template がアクティブな DESIGN.md を読むか？
  craft:
    requires: [typography, color, anti-ai-slop]
  example_prompt: "この template の機能をわかりやすく示すコピペ可能なプロンプト。"
---

# Your Template

本文はエージェントが従うべきワークフローを記述する自由形式の Markdown…
```

アクティブな完全文法（`od.mode`、`od.surface`、`od.craft.requires`、`od.critique.policy`、gallery hints など）は [`docs/skills-protocol.md`](../../docs/skills-protocol.md) にあります。`od.inputs`、`od.parameters`、`od.capabilities_required` のような古いポータブルフィールドは外部バンドルに残ることがありますが、skill/template registry では消費されません。

### 新しい Design template のマージ基準

Design template はユーザーに直接見える面であるため、厳しく審査します。新しい template は以下を満たす必要があります：

1. **実際の `example.html` を同梱すること。** 手作りで、ディスクから直接開けて、デザイナーが実際に納品するレベルの見た目であること。Lorem ipsum や `<svg><rect/></svg>` のプレースホルダー hero は不可。自分で example を作れないなら、その template はまだ準備できていません。
2. **本文で anti-AI-slop チェックリストをパスすること。** 紫グラデーション、汎用 emoji アイコン、左ボーダー付き角丸カード、Inter を *display* フォントとして使用、架空の統計データは不可。完全なリストは README の **anti-AI-slop 機構**セクションを参照。
3. **正直なプレースホルダー。** エージェントが実数値を持たない場合は `—` またはラベル付きグレーブロックを書き、「10 倍高速」とは書かない。
4. **`references/checklist.md` を持つこと。** 少なくとも P0 ゲート（エージェントが `<artifact>` を出力する前にパスすべき項目）を含む。フォーマットは [`design-templates/guizang-ppt/references/checklist.md`](../../design-templates/guizang-ppt/) または [`design-templates/dating-web/references/checklist.md`](../../design-templates/dating-web/) を参考にしてください。
5. **スクリーンショットを追加。** template が featured の場合、`docs/screenshots/skills/<skill>.png` に配置。PNG、約 1024×640 Retina、実際の `example.html` からズームアウトしたブラウザ縮尺でキャプチャ。
6. **単一の自己完結フォルダであること。** 他の template が既に使用しているもの以外の CDN インポート禁止。ライセンスのないフォント禁止。約 250 KB を超える画像禁止。

既存の Design template を fork する場合（例：`dating-web` から `recruiting-web` にリミックス）、元の LICENSE と帰属表示を `references/` に保持し、PR の説明で明記してください。

### 同梱済み Design template — 模倣するものを選ぶ

- ビジュアルショーケース、単一画面プロトタイプ：[`design-templates/dating-web/`](../../design-templates/dating-web/)、[`design-templates/digital-eguide/`](../../design-templates/digital-eguide/)
- マルチフレームモバイルフロー：[`design-templates/mobile-onboarding/`](../../design-templates/mobile-onboarding/)、[`design-templates/gamified-app/`](../../design-templates/gamified-app/)
- ドキュメント / テンプレート（Design System 不要）：[`design-templates/pm-spec/`](../../design-templates/pm-spec/)、[`design-templates/weekly-update/`](../../design-templates/weekly-update/)
- Deck モード：[`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/)（[op7418/guizang-ppt-skill][guizang] からそのまま同梱）および [`design-templates/simple-deck/`](../../design-templates/simple-deck/)

---

## Functional Skill の追加

Functional Skill は、タスク中にエージェントがユーザー入力へ作用するために呼び出す機能です。責務の境界は [`skills/README.md`](../../skills/README.md)、フォルダ契約は [`skills/AGENTS.md`](../../skills/AGENTS.md)、共通の `SKILL.md` 文法は [`docs/skills-protocol.md`](../../docs/skills-protocol.md) を参照してください。daemon の lazy scanner は次の `/api/skills` リクエストで Skill root を走査するため、ローカルでは再ビルドも daemon の再起動も不要です。

---

## 新しい Design System の追加

リポジトリに追加する新しい Design System は [`design-systems/<slug>/`](../../design-systems/) 配下の package であり、単独の Markdown ファイルではありません。現在同梱される 151 システムはすべて下記の package contract に移行済みです。Daemon は古い内容やユーザーがインストールした内容との互換性のため `DESIGN.md` のみのフォルダも引き続き受け付けますが、新しい同梱システムの authoring target ではありません。Catalog は `/api/design-systems` リクエストごとに再走査されるため、編集後は Design System surface を refresh すればよく、daemon の再起動は不要です。

### 最小 package 構成

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json` は安定した id、表示名、category、description、provenance、宣言済み package path を保持します。`DESIGN.md` は agent に design intent を説明し、`tokens.css` は canonical なコンパイル済み semantic-token stylesheet です。完全な contract は [`docs/design-systems.md`](../../docs/design-systems.md) と [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md) を参照してください。

### `DESIGN.md` の構造

```markdown
# YourBrand Design System

## Visual Theme
…

## Color Roles
…

## Typography
…

## Layout and Spacing
## Components and States
## Motion and Interaction
## Accessibility
## Anti-patterns
```

固定の 9 セクション schema はありません。Package quality guard は内容のある H2 section を 7 つ以上要求しますが、名称、順序、番号は指定しません。実際の system に合う見出しを使ってください。

### 新しい Design System のマージ基準

1. **必須の 3 ファイルを含めること。** Folder slug と `manifest.id` を一致させ、正規化した ASCII を使います（`linear.app` → `linear-app`、`x.ai` → `x-ai`）。
2. **内容のある H2 section を 7 つ以上書くこと。** 数を満たすだけの空見出しは禁止です。
3. **Prose と token を一致させること。** `DESIGN.md` に書いた color、type、spacing、motion は `tokens.css` と一致し、共有 token guard を通る必要があります。
4. **実証できる evidence と明確な provenance を使うこと。** Source product または site から直接採取し、manifest/package evidence に出典を記録します。
5. **有用な catalog copy を書くこと。** `manifest.name`、`category`、`description` が picker の主要 metadata です。Marketing fluff は入れません。

上流由来のプロダクトシステムは [`VoltAgent/awesome-design-md`][acd2] から [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts) 経由でインポートされています。ブランドが上流に属する場合は、**まずそちらに PR を送ってください** — 次の sync で自動的に反映されます。`design-systems/` フォルダには、上流に合わないプロジェクト所有の追加システムも含まれます。

---

## 新しい coding-agent CLI の追加

新しいエージェント（例：`foo-coder` CLI）には [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) の定義と `runtimes/registry.ts` の登録を追加します：

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // Claude Code と同じプロトコルなら 'claude-stream-json'
} satisfies RuntimeAgentDef;
```

定義を [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) に import して `BASE_AGENT_DEFS` に追加すると、共有エンジンが `PATH` 上で検出し、ピッカーに表示して invocation を組み立てます。wire shape が一致する場合は既存の `streamFormat` を再利用してください。まったく新しい wire format には、[`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/) または [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/) 配下の parser、parser test、そして [`server.ts`](../../apps/daemon/src/server.ts) の対応する dispatch branch も必要です。

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
- **新しいトップレベル依存関係は追加しない**（PR の説明で得られるものと出荷バイト数について 1 段落の説明がない限り）。[`package.json`](../../package.json) の依存関係リストは意図的に小さく保っています。
- **プッシュ前に `pnpm typecheck` を実行。** CI で実行されます。失敗すると「please fix」コメントが付きます。

---

## コミットとプルリクエスト

- **PR 1 つにつき 1 つの関心事。** Skill の追加 + パーサーのリファクタリング + 依存関係のバンプは 3 つの PR です。
- **タイトルは命令形 + スコープ。** `add dating-web skill`、`fix daemon SSE backpressure when CLI hangs`、`docs: clarify storage contract`。
- **PR テンプレートを使用する。** [`.github/pull_request_template.md`](../../.github/pull_request_template.md) の各セクション（Why、What users will see、Surface area、Screenshots（UI の場合）、Bug fix verification（バグ修正の場合）、Validation）をすべて埋めてください。空欄のセクションには "please fill in" のコメントが付きます。
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
- 「X をする Skill はどう書けばいい？」→ Discussion を作成してください。回答し、不足しているパターンであれば [`docs/skills-protocol.md`](../../docs/skills-protocol.md) に反映します。

---

## 受け入れないもの

プロジェクトの焦点を維持するため、以下のような PR は作成しないでください：

- **モデルランタイムを vendor する。** OD の根幹は「あなたの既存 CLI で十分」です。`pi-ai`、OpenAI キー、モデルローダーは同梱しません。
- **事前の議論なくフロントエンドを現在のスタックから書き換える。** Next.js 16 App Router + React 18 + TS がラインです。メンテナが明示的にそのマイグレーションを望まない限り、Astro、Solid、Svelte、その他のフレームワークへの書き換えは不可。
- **daemon をサーバーレス関数に置き換える。** daemon の存在意義は実際の `cwd` を所有し、実際の CLI を spawn することです。SPA の Vercel デプロイは OK。daemon は daemon のまま。
- **プライバシー契約の外側でテレメトリや外部向けデータ収集を追加する。** プロダクト分析とマスク済みセッションリプレイは同意制で、構成済みビルドではスクラブ済みの安全性・信頼性テレメトリが常時有効です。新しいイベント、フィールド、送信先は [`PRIVACY.md`](../../PRIVACY.md) の同意・最小化・スクラブ境界を守る必要があります。
- **ライセンスファイルと帰属表示なしでバイナリを同梱する。**

アイデアが適合するか分からない場合は、コードを書く前に discussion を作成してください。

---

<!-- Machine-translated section; native-speaker review welcome via PR. -->
## メンテナになるには

継続的にコントリビュートしてきた方で、メンテナになるまでの道のりを知りたい場合、ルールは **[`MAINTAINERS.md`](../../MAINTAINERS.md)** に記載されています。要点は以下のとおりです：

- メンテナは issue のレビュー、承認、クローズが可能です。マージボタンはコアチームが保持しますが、あなたの承認はマージに必要な承認としてカウントされます。
- 基準は **merged PRs が 20 件以上**、加えて公開されているアカウント品質チェック（アンチボット、アンチソックパペット）、さらにコアチームによるコントリビューション品質の判断です。応募フォームはなく、コアチームが内部で候補者を挙げて声をかけます。
- **クォータ、SLAs、固定任期はありません。** ステップダウンは容易かつ可逆的です（Emeritus → 生活が落ち着いたら復帰）。
- すべての閾値、推薦フロー、ステップダウンルール、初期プロジェクトの免除規定は [`MAINTAINERS.md`](../../MAINTAINERS.md) に記載されています。上記のいずれかに興味があれば、そのドキュメントを読んでください。

tl;dr：良い PR を出し、丁寧にレビューし、[Discussions][discussions] / [Discord][discord] に顔を出していれば、あとは自然と道が開けます。

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## ライセンス

コントリビューションすることにより、あなたのコントリビューションがこのリポジトリの [Apache-2.0 License](../../LICENSE) の下でライセンスされることに同意するものとします。ただし、[`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) 内のファイルは元の MIT ライセンスと [op7418](https://github.com/op7418) の帰属表示を保持します。

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
