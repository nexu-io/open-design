# クイックスタート

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <b>日本語</b> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <a href="QUICKSTART.th.md">ภาษาไทย</a></p>

製品全体をローカルで実行します。

## 環境要件

- **Node.js:** `~24`（Node 24.x）。リポジトリは `package.json#engines` を通じてこれを強制しています。
- **pnpm:** `10.33.x`。リポジトリは `packageManager` を通じて `pnpm@10.33.2` をピン留めしています。Corepack を使用すれば、ピン留めされたバージョンが自動的に選択されます。
- **OS:** macOS、Linux、WSL2 が主要なパスです。Windows ネイティブはほとんどのフローで動作するはずですが、WSL2 のほうが安全なベースラインです。
- **オプションのローカルエージェント CLI:** Open Design は、Claude Code、Codex、Devin for Terminal、OpenCode、Cursor Agent、Qwen、Qoder CLI、GitHub Copilot CLI などのローカルランタイムをレジストリで管理しています。現在の一覧は [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) にあります。何もインストールされていない場合は、Settings で設定した BYOK ランタイムを使用してください。

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

初回起動時、アプリは利用可能なローカルランタイムを検出し、Settings で設定された BYOK ランタイムも提示します。ランタイム、デザインテンプレート、デザインシステムを選び、プロンプトを入力して **Send** を押してください。構造化されたローカルランタイムは正規のプロジェクトファイルを書き込み、ファイル／ツールイベントをストリーミングします。ファイルワークスペースとプレビューはその書き込みから更新されます。テキスト専用および BYOK 実行は、代わりにホストが解析する完全な `<artifact>` ブロックを返します。アーティファクトの保存パスを文書化または変更する前に、ルートの `AGENTS.md` にある **Daemon data directory contract** を必ず読んでください。

**Design systems** カタログは、[`design-systems/`](../../design-systems/) 配下の `DESIGN.md` パッケージから直接読み込まれます。1 つ選ぶと、そのブランドの視覚言語がアーティファクトに適用されます。

**Templates** カタログは [`design-templates/`](../../design-templates/) から読み込まれ、プロトタイプ、デッキ、ドキュメント、画像、動画、音声のアーティファクト形式をまとめています。[`skills/`](../../skills/) は、作業中にエージェントが呼び出す機能的な能力のために使われます。テンプレートとデザインシステムを組み合わせると、選択した視覚言語でアーティファクトを生成できます。

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

## Docker セットアップ

Node.js や pnpm をローカルにインストールせずに、完全にコンテナ化された環境で Open Design を実行できます。

### 必要条件

* Docker Desktop
* Docker Compose v2

Docker が正しくインストールされていることを確認：

```bash
docker compose version
```

---

## Open Design を起動

リポジトリルートから：

1. deploy ディレクトリに移動し、環境テンプレートをコピーします：

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. セキュアなトークンを生成します：

   ```bash
   openssl rand -hex 32
   ```

3. エディタで `.env` を開き、`OD_API_TOKEN=` を見つけて、生成したトークンを貼り付けます。

サービスを起動します：

```bash
docker compose up -d
```

ブラウザでアプリを開きます：

```text
http://localhost:7456
```

初回起動時は、Docker が最新イメージをプルするため数秒かかる場合があります。

---

## よく使う Docker コマンド

### ログを表示

```bash
docker compose logs -f
```

### コンテナを再起動

```bash
docker compose restart
```

### コンテナを停止

```bash
docker compose down
```

### 最新イメージをプル

```bash
docker compose pull
docker compose up -d
```

### すべてのローカルアプリデータを削除

```bash
docker compose down -v
```

---

## 環境設定

`deploy/.env` ファイルを作成して、デフォルト設定を上書きします。提供された例から始めます：

```bash
cp deploy/.env.example deploy/.env
```

`deploy/.env` を編集して、自分のトークンを設定し、必要に応じて他の値を調整します：

```env
# ホストで公開するポート
OPEN_DESIGN_PORT=7456

# コンテナのメモリ制限
OPEN_DESIGN_MEM_LIMIT=384m

# 許可する CORS オリジン
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker イメージタグ
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

# Daemon セキュリティに必要な API トークン
# 次のコマンドで生成：openssl rand -hex 32
OD_API_TOKEN=
```

---

## 永続ストレージ

永続的なデーモン保存パスを文書化、変更、または選択する前に、
ルートの `AGENTS.md` にある **Daemon data directory contract** を必ず読んでください。
この Quickstart でその契約を繰り返したり、保存パスを定義したりしてはいけません。

---

## 注意事項

* Docker モードは、ローカルに Node.js や pnpm をインストールしたくないコントリビューターに最適です。
* コンテナは本番用 daemon ビルドをポート `7456` で直接公開します。
* 開発ワークフローや高度なローカル設定については、この Quickstart ガイドの残りの部分を参照してください。

---

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
| **Local CLI**（daemon がエージェントを検出した場合のデフォルト） | "Local CLI" | フロントエンド → daemon `/api/chat` → `spawn(<agent>, ...)` → 構造化されたツール／ファイルイベントを SSE 配信 → プロジェクトファイル → プレビュー。plain-stream CLI は text-artifact 経路を使用します。 |
| **API モード**（フォールバック / CLI なし） | "Anthropic API" / "OpenAI API" / "Atlas Cloud" / "Azure OpenAI" / "Google Gemini" | フロントエンド → daemon `/api/proxy/{provider}/stream` → provider SSE を `delta/end/error` に正規化 → `<artifact>` パーサー → プレビュー |

両モードは同じファイルワークスペースとサンドボックス化されたプレビューに到達しますが、引き渡し契約は異なります。ファイルシステム対応ランタイムは正規ファイルを書き込み、そのソースを `<artifact>` に再出力しません。plain／テキスト専用および BYOK 実行にはファイルツールがないため、完全な HTML を `<artifact>` に入れたものが正規の成果物です。実行プロファイルはランタイムのトランスポートから選択されます。

## プロンプトの構成

送信ごとに、アプリは 3 つのレイヤーからシステムプロンプトを構築してプロバイダーに送信します：

```
BASE_SYSTEM_PROMPT   （実行プロファイル別のファイルまたは <artifact> 引き渡し）
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
│   │       ├── agents.ts          # ランタイムモジュールの互換エクスポート
│   │       ├── runtimes/
│   │       │   ├── registry.ts    # サポート対象ランタイムのレジストリ
│   │       │   └── defs/          # ランタイム別の起動／引数定義
│   │       ├── skills.ts          # SKILL.md ローダー（フロントマターパーサー）
│   │       └── design-systems/    # DESIGN.md ローダーとサービス
│   │   ├── sidecar/           # tools-dev daemon sidecar ラッパー
│   │   └── tests/             # daemon パッケージのテスト
│   ├── web/                   # Next.js 16 App Router + React クライアント
│       ├── app/               # App Router エントリポイント
│       ├── src/               # React + TypeScript クライアント／ランタイムモジュール
│       │   ├── App.tsx        # mode / skill / DS ピッカー + send をオーケストレーション
│       │   ├── providers/     # daemon + BYOK API トランスポート
│       │   ├── prompts/       # system、discovery、directions、deck フレームワーク
│       │   ├── artifacts/     # text-artifact 解析 + アーティファクトマニフェスト
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
├── skills/                    # 作業中に呼び出す機能的な能力
├── design-templates/          # プロトタイプ、デッキ、文書、メディアのレンダリングカタログ
├── design-systems/            # DESIGN.md を基点とするブランドパッケージ
├── scripts/sync-design-systems.ts    # 上流の getdesign tarball から再インポート
├── docs/                      # 製品ビジョン + 仕様
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality スクリプト + `od` bin
```

## トラブルシューティング

- **「no agents found on PATH」** — [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) に登録されているローカルランタイムのいずれかをインストールし、その実行ファイルが daemon から見えることを確認してから、**Settings → Execution mode** で **Rescan** を実行してください。または、Settings で BYOK ランタイムを設定します。
- **/api/chat で daemon が 500 を返す** — daemon ターミナルで stderr の末尾を確認してください。通常は CLI が引数を拒否しています。CLI ごとに argv の形式が異なります。調整が必要な場合は `apps/daemon/src/runtimes/defs/` の対応する定義を参照してください。
- **メディア生成で `OD_BIN` が欠落、または daemon URL が `:0`** — 上記のメディアディスパッチャーチェックを実行してください。古い CLI セッションを再開せず、Open Design アプリからプロジェクトを再度開いて、daemon が新しい `OD_*` 変数を注入できるようにしてください。
- **Codex がプラグインコンテキストを多く読み込みすぎる** — `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` で Open Design を起動すると、daemon から起動された Codex プロセスが `--disable plugins` で実行されます。
- **アーティファクトがレンダリングされない** — まず引き渡しプロファイルを確認します。ファイルシステム対応のローカルランタイムでは、プレビュー可能なプロジェクトファイルが作成され、ファイルイベントが daemon に届いたかを確認してください。ソースを `<artifact>` に入れる経路ではありません。plain／テキスト専用または BYOK 実行では、完全な `<artifact>` ブロックが 1 つあることを確認し、daemon ログで最初に失敗した境界を探します。

## ビジョンへのマッピング

このクイックスタートは [`docs/`](../../docs/) にある仕様の実行可能なシードです。仕様は、これがどこへ成長するかを記述しています（[`docs/roadmap.md`](../../docs/roadmap.md) を参照）。ハイライト：

- `docs/architecture.md` は、出荷されたスタックを説明しています：前面に Next.js 16 App Router、その背後にローカル daemon、そして `apps/web/next.config.ts` の dev 時 rewrites によってブラウザが同じ `/api` 表面と通信し続けるようにします。
- `docs/skills-protocol.md` は現在の `SKILL.md`／`od:` フロントマターと、機能スキルとレンダリングテンプレートの分離を説明します。パーサーと正規化の実装上の真実は `apps/daemon/src/skills.ts` です。
- `docs/agent-adapters.md` はアダプター契約を説明しています。ランタイム固有の起動、引数、モデル、ストリーム設定は `apps/daemon/src/runtimes/defs/` にあり、`apps/daemon/src/runtimes/registry.ts` で登録されます。`apps/daemon/src/agents.ts` は互換エクスポート面です。
- `docs/modes.md` は 6 つの New Project タブと 7 つの正規化レジストリモード（`prototype`、`deck`、`template`、`design-system`、`image`、`video`、`audio`）を区別します。
