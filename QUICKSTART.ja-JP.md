# クイックスタート

<p align="center"><a href="QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <b>日本語</b></p>

製品全体をローカルで実行します。

## 環境要件

- **Node.js:** `~24`（Node 24.x）。リポジトリは `package.json#engines` を通じてこれを強制しています。
- **pnpm:** `10.33.x`。リポジトリは `packageManager` を通じて `pnpm@10.33.2` をピン留めしています。Corepack を使用すれば、ピン留めされたバージョンが自動的に選択されます。
- **OS:** macOS、Linux、WSL2 が主要なパスです。Windows ネイティブはほとんどのフローで動作するはずですが、WSL2 のほうが安全なベースラインです。
- **オプションのローカルエージェント CLI:** Claude Code、Codex、Devin for Terminal、Gemini CLI、OpenCode、Cursor Agent、Qwen、GitHub Copilot CLI など。何もインストールされていない場合は、設定から BYOK API モードを使用してください。

`nvm` / `fnm` はオプションの便利なツールであり、必須のプロジェクトセットアップではありません。使用する場合は、pnpm を実行する前に Node 24 をインストール／選択してください。

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

その後、Corepack を有効化してリポジトリに pnpm を選択させます。

```bash
corepack enable
corepack pnpm --version   # 10.33.2 が表示されるはずです
```

## ワンショット（dev モード）

```bash
corepack enable
pnpm install
pnpm tools-dev run web # daemon と web をフォアグラウンドで起動します
# tools-dev が出力した web URL を開きます
```

デスクトップシェルとすべての管理対象 sidecar をバックグラウンドで起動する場合：

```bash
pnpm tools-dev # daemon + web + desktop をバックグラウンドで起動します
```

初回起動時、アプリはインストール済みのコードエージェント CLI（Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen）を検出して自動選択し、デフォルトで `web-prototype` スキルと `Neutral Modern` デザインシステムを採用します。プロンプトを入力して **Send** を押してください。エージェントが左ペインにストリーミングし、`<artifact>` タグが解析されて HTML が右側にライブレンダリングされます。完了したら **Save to disk** をクリックして、アーティファクトを `./.od/artifacts/<timestamp>-<slug>/index.html` に永続化します。

**Design system** ドロップダウンには **129 のデザインシステム** が同梱されています — 手作りのスターター 2 種（Neutral Modern、Warm Editorial）、バンドルされた製品システム 70 種、[`awesome-design-skills`](https://github.com/bergside/awesome-design-skills) から取得した 57 のデザインスキルです。1 つを選ぶと、すべてのプロトタイプがそのブランドの美学でスキニングされます。

**Skill** ドロップダウンはモード（Prototype / Deck / Template / Design system）でグループ化され、モードごとのデフォルトスキルには `· default` サフィックスが付きます。バンドルされているスキル：

- **Prototype** — `web-prototype`（汎用）、`saas-landing`、`dashboard`、`pricing-page`、`docs-page`、`blog-post`、`mobile-app`。
- **Deck / PPT** — `simple-deck`（単一ファイルの横スワイプ）と `magazine-web-ppt`（[`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) からの `guizang-ppt` バンドル — deck モードのデフォルト。独自のアセット／テンプレート + 4 つのリファレンスを同梱）。サイドファイルを持つスキルには自動的に「Skill root (absolute)」のプリアンブルが付与され、エージェントが CWD ではなく実際のディスク上のパスに対して `assets/template.html` や `references/*.md` を解決できるようになります。

スキルとデザインシステムを組み合わせれば、単一のプロンプトから選択した視覚言語でレイアウトに適したプロトタイプまたはデッキが生成されます。

## その他のスクリプト

```bash
pnpm tools-dev                 # daemon + web + desktop をバックグラウンドで起動
pnpm tools-dev start web       # daemon + web をバックグラウンドで起動
pnpm tools-dev run web         # daemon + web をフォアグラウンドで起動（e2e/dev サーバー）
pnpm tools-dev restart         # daemon + web + desktop を再起動
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # 管理対象ランタイムを検査
pnpm tools-dev logs            # daemon/web/desktop のログを表示
pnpm tools-dev check           # status + 最近のログ + 一般的な診断
pnpm tools-dev stop            # 管理対象ランタイムを停止
pnpm --filter @open-design/daemon build  # `od` 用に apps/daemon/dist/cli.js をビルド
pnpm --filter @open-design/web build     # 必要に応じて web パッケージをビルド
pnpm typecheck                 # workspace の typecheck
```

`pnpm tools-dev` がローカルライフサイクルの唯一のエントリポイントです。削除済みのレガシールートエイリアス（`pnpm dev`、`pnpm dev:all`、`pnpm daemon`、`pnpm preview`、`pnpm start`）は使用しないでください。

ローカル開発中、`tools-dev` は最初に daemon を起動し、そのポートを `apps/web` に渡します。`apps/web/next.config.ts` は `/api/*`、`/artifacts/*`、`/frames/*` をその daemon ポートに書き換えるため、App Router アプリは CORS 設定なしで隣接する Express プロセスと通信できます。

## メディア生成 / エージェントディスパッチャーチェック

Image、Video、Audio、HyperFrames スキルは、daemon がエージェントを起動する際に注入する環境変数を通じてローカル `od` CLI を呼び出します：

- `OD_BIN` — `apps/daemon/dist/cli.js` への絶対パス。
- `OD_DAEMON_URL` — 実行中の daemon URL。
- `OD_PROJECT_ID` — アクティブなプロジェクト ID。
- `OD_PROJECT_DIR` — アクティブなプロジェクトのファイルディレクトリ。

メディア生成が `OD_BIN: parameter not set`、`apps/daemon/dist/cli.js` の欠落、または `failed to reach daemon at http://127.0.0.1:0` で失敗する場合は、daemon CLI を再ビルドして管理対象ランタイムを再起動してください：

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

その後、古いターミナルエージェントセッションを再開する代わりに、Open Design アプリからプロジェクトを再度開いてください。daemon から起動されたエージェントは、次のような値を確認できるはずです：

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` は `http://127.0.0.1:0` ではなく、`http://127.0.0.1:7457` のような実際の daemon ポートでなければなりません。`:0` という値は内部的な「空きポートを選択する」起動ヒントにすぎず、エージェントセッションに漏れてはなりません。

daemon のみの本番モードでは、daemon 自身が `http://localhost:7456` で静的な Next.js エクスポートを提供するため、リバースプロキシは関与しません。

daemon の前段に nginx を配置する場合は、SSE ルートをバッファリングなし・圧縮なしに保ってください。一般的な失敗例は、ブラウザコンソールに 80〜90 秒後に `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` が表示されるというもので、これは daemon が `X-Accel-Buffering: no` を送信していても、nginx の `gzip on` がチャンク分割された SSE レスポンスをバッファリングしてしまうために発生します。

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;

    proxy_buffering off;
    gzip off;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 2 つの実行モード

| モード | ピッカーの値 | リクエストの流れ |
|---|---|---|
| **Local CLI**（daemon がエージェントを検出した場合のデフォルト） | "Local CLI" | フロントエンド → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → アーティファクトパーサー → プレビュー |
| **Anthropic API**（フォールバック / CLI なし） | "Anthropic API · BYOK" | フロントエンド → `@anthropic-ai/sdk` 直接呼び出し（`dangerouslyAllowBrowser`） → アーティファクトパーサー → プレビュー |

両モードとも **同じ** `<artifact>` パーサーと **同じ** サンドボックス化された iframe にデータを供給します。異なるのはトランスポートとシステムプロンプトの配信方法だけです（ローカル CLI には独立したシステムチャンネルがないため、合成プロンプトはユーザーメッセージに折り込まれます）。

## プロンプトの構成

送信ごとに、アプリは 3 つのレイヤーからシステムプロンプトを構築してプロバイダーに送信します：

```
BASE_SYSTEM_PROMPT   （出力契約：<artifact> でラップ、コードフェンスなし）
   + アクティブなデザインシステム本文  （DESIGN.md — パレット／タイポ／レイアウト）
   + アクティブなスキル本文          （SKILL.md — ワークフローと出力ルール）
```

トップバーでスキルまたはデザインシステムを切り替えると、次回の送信から新しいスタックが使用されます。本文はセッションごとにメモリ内にキャッシュされるため、選択ごとに 1 回の daemon フェッチで済みます。

## ファイルマップ

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express — ローカルエージェントを起動 + API を提供
│   │   └── src/
│   │       ├── cli.ts             # `od` bin エントリ
│   │       ├── server.ts          # /api/* + 静的配信
│   │       ├── agents.ts          # claude/codex/devin/gemini/opencode/cursor-agent/qwen/copilot 用 PATH スキャナ
│   │       ├── skills.ts          # SKILL.md ローダー（フロントマターパーサー）
│   │       └── design-systems.ts  # DESIGN.md ローダー
│   │   ├── sidecar/           # tools-dev daemon sidecar ラッパー
│   │   └── tests/             # daemon パッケージのテスト
│   ├── web/                   # Next.js 16 App Router + React クライアント
│       ├── app/               # App Router エントリポイント
│       ├── src/               # React + TypeScript クライアント／ランタイムモジュール
│       │   ├── App.tsx        # mode / skill / DS ピッカー + send をオーケストレーション
│       │   ├── providers/     # daemon + BYOK API トランスポート
│       │   ├── prompts/       # system、discovery、directions、deck フレームワーク
│       │   ├── artifacts/     # ストリーミング <artifact> パーサー + マニフェスト
│       │   ├── runtime/       # iframe srcdoc、markdown、エクスポートヘルパー
│       │   └── state/         # localStorage + daemon バックエンドのプロジェクト状態
│       ├── sidecar/           # tools-dev web sidecar ラッパー
│       └── next.config.ts     # tools-dev rewrites + 本番 apps/web/out エクスポート設定
│   └── desktop/               # Electron ランタイム、tools-dev によって起動／検査される
├── packages/
│   ├── contracts/             # 共有 web/daemon アプリ契約
│   ├── sidecar-proto/         # Open Design sidecar プロトコル契約
│   ├── sidecar/               # 汎用 sidecar ランタイムプリミティブ
│   └── platform/              # 汎用プロセス／プラットフォームプリミティブ
├── tools/dev/                 # `pnpm tools-dev` ライフサイクルと inspect CLI
├── e2e/                       # Playwright UI + 外部統合／Vitest ハーネス
├── skills/                    # SKILL.md — 任意の Claude Code スキルリポジトリからドロップイン
│   ├── web-prototype/         # 汎用シングルスクリーンプロトタイプ（prototype モードのデフォルト）
│   ├── saas-landing/          # マーケティングページ（hero / features / pricing / CTA）
│   ├── dashboard/             # 管理／分析ダッシュボード
│   ├── pricing-page/          # 独立した pricing + 比較
│   ├── docs-page/             # 3 列ドキュメンテーションレイアウト
│   ├── blog-post/             # エディトリアル長文
│   ├── mobile-app/            # 電話フレームのシングルスクリーン
│   ├── simple-deck/           # 最小限の横スワイプデッキ
│   └── guizang-ppt/           # magazine-web-ppt — バンドルされた deck/PPT デフォルト
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,components,checklist}.md
├── design-systems/            # DESIGN.md — 9 セクションスキーマ（awesome-claude-design）
│   ├── default/               # Neutral Modern（スターター）
│   ├── warm-editorial/        # Warm Editorial（スターター）
│   ├── README.md              # カタログ概要
│   └── …129 systems           # スターター 2 種 · 製品システム 70 種 · デザインスキル 57 種
├── scripts/sync-design-systems.ts    # 上流の getdesign tarball から再インポート
├── docs/                      # 製品ビジョン + 仕様
├── .od/                       # ランタイムデータ（gitignore 済み、自動作成）
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   ワンショット "Save to disk" レンダリング
│   └── projects/<id>/          #   プロジェクトごとの作業ディレクトリ + エージェント cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality スクリプト + `od` bin
```

## トラブルシューティング

- **「no agents found on PATH」** — `claude`、`codex`、`devin`、`gemini`、`opencode`、`cursor-agent`、`qwen`、`copilot` のいずれかをインストールしてください。または、トップバーで「Anthropic API · BYOK」に切り替え、**設定** にキーを貼り付けます。
- **/api/chat で daemon が 500 を返す** — daemon ターミナルで stderr の末尾を確認してください。通常は CLI が引数を拒否しています。CLI ごとに argv の形式が異なります。調整が必要な場合は `apps/daemon/src/agents.ts` の `buildArgs` を参照してください。
- **メディア生成で `OD_BIN` が欠落、または daemon URL が `:0`** — 上記のメディアディスパッチャーチェックを実行してください。古い CLI セッションを再開せず、Open Design アプリからプロジェクトを再度開いて、daemon が新しい `OD_*` 変数を注入できるようにしてください。
- **Codex がプラグインコンテキストを多く読み込みすぎる** — `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` で Open Design を起動すると、daemon から起動された Codex プロセスが `--disable plugins` で実行されます。
- **アーティファクトがレンダリングされない** — モデルが `<artifact>` でラップせずにテキストを生成しました。システムプロンプトが通っていることを確認し（daemon ログを確認）、より高性能なモデルまたは厳格なスキルへの切り替えを検討してください。

## ビジョンへのマッピング

このクイックスタートは [`docs/`](docs/) にある仕様の実行可能なシードです。仕様は、これがどこへ成長するかを記述しています（[`docs/roadmap.md`](docs/roadmap.md) を参照）。ハイライト：

- `docs/architecture.md` は、出荷されたスタックを説明しています：前面に Next.js 16 App Router、その背後にローカル daemon、そして `apps/web/next.config.ts` の dev 時 rewrites によってブラウザが同じ `/api` 表面と通信し続けるようにします。
- `docs/skills-protocol.md` は、完全な `od:` フロントマター（型付き入力、スライダー、機能ゲーティング）について説明しています。この MVP は `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires` のみを読み取ります — 残りを追加するには `apps/daemon/src/skills.ts` を拡張してください。
- `docs/agent-adapters.md` はより豊かなディスパッチ（機能検出、ストリーミングツール呼び出し）を予見しています。`apps/daemon/src/agents.ts` は最小限のディスパッチャーです — 配線を証明するには十分です。
- `docs/modes.md` は 4 つのモード（prototype / deck / template / design-system）を列挙しています。最初の 2 つのスキルを出荷しています。ピッカーはすでに `mode` でフィルタリングしています。
