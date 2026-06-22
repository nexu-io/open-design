<h1 align="center">Open Design: オープンソースの Claude Design 代替ツール</h1>

> 🔥 **Open Design 0.10.0 が登場——オールインワンの Agentic デザインワークスペース。** デザインの全工程が、ひとつのウィンドウに。曖昧なアイデアから、リファレンス探し、素材集め、インタラクティブな編集、コメントのキュー投入、モーションの仕上げ、そしてエディタや Code Agent への受け渡しまで——アプリを離れることなく完結します。複数セッションの並行実行で、それはもはや一人のアシスタントではなく、あなたのために働くローカルなデザインチームです。[0.10.0 をダウンロード](https://github.com/nexu-io/open-design/releases) · [ディスカッションに参加](https://github.com/nexu-io/open-design/discussions/4153)
>
> ⚡ **Open Design AMR（Agentic Model Router）——公式モデルサービス。** 一度のチャージで、Open Design の中で GPT、Claude、Gemini、DeepSeek をそのまま利用可能。20+ のフラッグシップモデル、設定ゼロ、実トークン使用量ベースの課金。[AMR を試す](https://open-design.ai/amr/)
>
> 🏅 **Open Design Fellow プログラムの募集を開始しました。** あなたもデザインはオープンであるべきだと信じるなら——Open Design Fellow となり、コアチームとともにプロダクトを形づくり、より多くの人がデザインの未来を定義することに参加できるよう手助けしてください。詳細 → [`MAINTAINERS.md`](../../MAINTAINERS.md) と [Discord](https://discord.gg/9ptkbbqRu)。

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/hero.png" alt="Open Design — The open-source Claude Design alternative · 150 Design Systems · 261 Plugins · 21 Coding Agents · 14 Media Providers" width="100%" />
</p>

<p align="center">
  <a href="https://open-design.ai/">ウェブサイト</a> ·
  <a href="https://open-design.ai/">ダウンロード</a> ·
  <a href="https://open-design.ai/amr/">Model Router</a> ·
  <a href="https://discord.gg/9ptkbbqRu">Discord</a> ·
  <a href="https://x.com/OpenDesignHQ">@OpenDesignHQ をフォロー</a>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="../../LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat" /></a>
  <a href="https://discord.gg/9ptkbbqRu"><img alt="discord" src="https://img.shields.io/discord/1479002485040480266?style=flat&logo=discord&logoColor=white&label=discord&color=5865F2&cacheSeconds=3600" /></a>
  <a href="QUICKSTART.ja-JP.md"><img alt="quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat" /></a>
</p>

<p align="center"><a href="../../README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <b>日本語</b> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## Open Design とは

🎨 **ローカルファーストでオープンソースの [Claude Design][cd] 代替ツール。** &nbsp;🖥️ **macOS と Windows 向けのネイティブデスクトップアプリ。** &nbsp;⚡ **100 種類以上のスキル** · ✨ **150 のブランドグレード `DESIGN.md` システム** · 📦 **261 のすぐ使えるプラグイン。** &nbsp;🖼️ **ウェブ · デスクトップ · モバイルのプロトタイプ**、**ライブダッシュボード／アーティファクト**、**スライド**、**画像**、**動画**、さらに **HyperFrames** のモーショングラフィックスを生成。🔒 サンドボックス化された iframe プレビュー · HTML / PDF / PPTX / MP4 エクスポート。&nbsp;🤖 **Claude Code · OpenClaw · Codex · Cursor · OpenCode · Qwen · Copilot · Hermes · Kimi · Antigravity および 21 のローカル CLI 上で動作**、もしくは BYOK 経由で任意の OpenAI 互換エンドポイント上でも動作します。

Open Design は、Anthropic が Claude Design とともに送り出した **エージェントネイティブ**なループ——ブリーフを探り、方向性を確定し、アーティファクトをストリーミングし、批評し、納品する——がクローズドであることをやめ、ラップトップにすでにあるコーディングエージェントが読み・書き・リミックスできる **スキル・デザインシステム・プラグインのファイルシステム** になったときに得られるものです。あなたの CLI がデザインエンジンに、ラップトップがスタジオに、そしてチームの `DESIGN.md` がブランドの契約書になります。

これはまた、**エージェント時代の Figma 代替ツール**でもあります——キャンバス上でピクセルを動かす代わりに、本物の CSS、本物のフォント、本物のコンポーネントによる単一ページのアーティファクトを納品し、HTML / PDF / PPTX / MP4 へ直接エクスポートします。すでにあなたのデザインシステムによって形づくられ、すでに日常的に使うエージェントの中で実行可能です。

[cd]: https://x.com/claudeai/status/2045156267690213649

---

## プロダクトツアー

Open Design が何であり、何ができるのかを手早く見ていきましょう。**Home** から始め、**Automation** で繰り返しのワークフローをオーケストレーションし、**Design System** でブランドの契約書を抽出し、**Plugins** と **連携機能**で拡張します。どのプロジェクトの **Studio** 内でも、同じデザインシステムがプロトタイプ、ライブアーティファクト、HyperFrames、スライド、画像をストリーミング出力します。

### コアページ

<table>
<tr>
<td valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/home.png" alt="Home page" /><br/>
<sub><b>Home</b> — 概観のエントリーポイント。スキルとデザインシステムを選び、ブリーフを入力して、すべてを一か所から始められます。</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/automation.png" alt="Automation page" /><br/>
<sub><b>Automation</b> — 繰り返しのデザインワークフローを、再利用可能でスケジュール可能な自動化へとオーケストレーションします。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/design-system.png" alt="Design System page" /><br/>
<sub><b>Design System</b> — チームの <code>DESIGN.md</code> を、すべての出力を形づくるブランドの契約書へと抽出します。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/plugin.png" alt="Plugin page" /><br/>
<sub><b>Plugin</b> — ワークフロープラグインを閲覧・インストール・配布し、必要に応じて生成を拡張します。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/integrations.png" alt="Integrations page" /><br/>
<sub><b>Integrations</b> — 外部システムや MCP ツールを接続し、任意の IDE・スクリプト・自動化から Open Design を利用できます。</sub>
</td>
</tr>
</table>

### Studio — 1 つのプロジェクトで多様なアーティファクトタイプを

プロジェクトの Studio 内では、同じデザインシステムが複数のアーティファクトタイプをストリーミング出力します。

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-prototype.png" alt="Prototype" /><br/>
<sub><b>Prototype</b> — あなたのデザインシステムを読み取り、サンドボックス化された iframe にレンダリングされる単一ページの HTML アーティファクト。即座にプレビューでき、ソースとしてダウンロード可能です。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-hyperframe.png" alt="HyperFrame" /><br/>
<sub><b>HyperFrame</b> — プログラムによるモーションとアニメーショングラフィックスを、本物の MP4 にレンダリングします（例: 1920×1080 · 30fps）。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-ppt.png" alt="Deck" /><br/>
<sub><b>Deck</b> — ページ送りでき、キーボードで操作でき、PPTX / PDF にエクスポートできるピッチデック。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-image.png" alt="Image" /><br/>
<sub><b>Image</b> — 高解像度の生成とダウンロードに対応した、ブランドグレードの画像とビジュアルアセット。</sub>
</td>
</tr>
</table>

---

## プラットフォーム互換性

> Open Design は、主流のコーディングエージェントがネイティブに利用する **スキル、CLI、MCP サーバー**として提供されます。OD をインストールすれば、`od mcp install <agent>` 一発で MCP サーバーがそのエージェントの設定に組み込まれ、どのエージェントの内部からでも同じツールを呼び出せます。

| コーディングエージェント／プラットフォーム &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | ステータス &nbsp;&nbsp; | MCP サーバーのワンラインインストール &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |
|---|:---:|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ 対応済み | `od mcp install claude` |
| [Codex CLI](https://github.com/openai/codex) | ✅ 対応済み | `od mcp install codex` |
| [Cursor](https://www.cursor.com/cli) | ✅ 対応済み | `od mcp install cursor` |
| [VS Code + GitHub Copilot](https://github.com/features/copilot) | ✅ 対応済み | `od mcp install copilot` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | ✅ 対応済み | `od mcp install copilot` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ 対応済み | `od mcp install gemini` |
| [OpenCode](https://opencode.ai/) | ✅ 対応済み | `od mcp install opencode` |
| [OpenClaw](https://github.com/openclaw/openclaw) | ✅ 対応済み | `od mcp install openclaw` |
| [Antigravity](https://antigravity.google) | ✅ 対応済み | `od mcp install antigravity` |
| [Cline](https://github.com/cline/cline) | ✅ 対応済み | `od mcp install cline` |
| [Trae](https://www.trae.ai/) | ✅ 対応済み | `od mcp install trae` |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | ✅ 対応済み | `od mcp install kimi` |
| [Pi Agent](https://github.com/badlogic/pi-mono) | ✅ 対応済み | `od mcp install pi` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | ✅ 対応済み | `od mcp install vibe` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | ✅ 対応済み | `od mcp install hermes` |

`od mcp install <agent> --print` でドライランのプレビュー · `--uninstall` で削除 · 完全な一覧は `od mcp install --help` で確認できます。

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/coding-agents.png" alt="The 21 coding-agent CLIs Open Design supports — Claude Code · Codex · OpenCode · Hermes · Antigravity · Gemini · Grok Build · Kimi · Cursor Agent · Qwen · Qoder · GitHub Copilot · Pi · Kiro · Kilo · Mistral Vibe · DeepSeek · Reasonix · Aider · Devin · Trae" width="100%" />
</p>

**CLI を一つもインストールしていない場合は？** `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` の BYOK プロキシが同じループ（プロセスのスポーンなし）を提供します——`baseUrl` + `apiKey` + `model` を貼り付けるだけで、OpenAI、Anthropic、Azure OpenAI、Google Gemini、Ollama、LM Studio、vLLM、または任意の OpenAI 互換エンドポイントに対応します。ターゲットごとの SSRF 保護が、内部 IP／リンクローカル／CGNAT をデーモンのエッジでブロックします。

アダプターの契約とストリームパーサーは [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) にあります。新しい CLI の追加はエントリー 1 つだけです——[`docs/agent-adapters.md`](../../docs/agent-adapters.md) を参照してください。

---

## デモ

4 つのコアプロダクトカテゴリーは、すべてあなたのラップトップ上で動作するコーディングエージェントによってレンダリングされています。サムネイルをクリックすると、実際の例を確認できます。

### 1 · プロトタイプ — ウェブ · デスクトップ · モバイル

デフォルトの出力サーフェス。あなたの `DESIGN.md` を読み取り、サンドボックス化された iframe にレンダリングされる単一ページの HTML アーティファクトです。

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/01-entry-view.png" alt="Entry view" /><br/>
<sub><b>エントリービュー</b> — スキルを選び、デザインシステムを選び、ブリーフを入力します。プロトタイプ、ダッシュボード、スライド、モバイルアプリ、雑誌風ページのための単一のサーフェスです。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/mobile-onboarding.png" alt="Mobile onboarding" /><br/>
<sub><b>モバイルプロトタイプ</b> — ピクセル精度の iPhone 15 Pro のクロームと、マルチスクリーンのフロー。エージェントは決して電話のフレームを描き直しません。共有されるデバイスフレームは <code>assets/frames/</code> にあります。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/dating-web.png" alt="Web prototype dating-web" /><br/>
<sub><b>ウェブプロトタイプ</b> — スクロールバー、KPI、チャートを備えたエディトリアルなダッシュボード。<code>design-templates/dating-web/</code> から直接レンダリングされています。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/gamified-app.png" alt="Gamified app" /><br/>
<sub><b>モバイルアプリのプロトタイプ</b> — XP リボンとクエスト詳細を備えた 3 画面のゲーミフィケーションフロー。Cursor / Codex / Claude Code に直接引き渡して React/Next/Vue に変換できます。</sub>
</td>
</tr>
</table>

### 2 · ライブアーティファクトとダッシュボード

ライブダッシュボード、意思決定ルーム、KPI ウォール——tweaks パネルを通じてデータを取り込み、その場で編集可能なまま保たれる単一ページのアーティファクトです。

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/live-dashboard.png" alt="Live dashboard" /><br/>
<sub><b>ライブダッシュボード</b> — 編集可能な KPI ウォールで、その tweaks パネルが調整に値するパラメーターを浮かび上がらせます。エージェントがマニフェストを発行し、iframe はリロードなしで再レンダリングします。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/research-decision-room.png" alt="Decision room" /><br/>
<sub><b>意思決定ルーム</b> — プロダクト／リサーチ／オペレーションの会議向けの、マルチソースのブリーフィングアーティファクト。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/github-dashboard.png" alt="GitHub dashboard" /><br/>
<sub><b>GitHub スタイルのダッシュボード</b> — リポジトリのメトリクスをライブアーティファクトとして提示します。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/flowai-live-dashboard-template.png" alt="Flow live dashboard" /><br/>
<sub><b>Flow ライブダッシュボードテンプレート</b> — アクティブな <code>DESIGN.md</code> によってブランド化された、ドメイン特化型の KPI テンプレート。</sub>
</td>
</tr>
</table>

### 3 · スライド — 雑誌風スライド、週次アップデート、ピッチ

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/07-magazine-deck.png" alt="Magazine deck (guizang-ppt)" /><br/>
<sub><b>Deck モード (guizang-ppt)</b> — 雑誌風レイアウト、WebGL ヒーロー、P0/P1/P2 チェックリスト。<a href="https://github.com/op7418/guizang-ppt-skill"><code>op7418/guizang-ppt-skill</code></a> からそのままバンドルされ、元のライセンスを保持しています。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/deck-swiss-international.png" alt="Swiss deck" /><br/>
<sub><b>スイス・インターナショナルスタイルのスライド</b> — グリッドに固定され、モノクロのアクセントを効かせています。<code>design-templates/html-ppt-*/</code> 配下の <b>15 のスライドテンプレート</b>と <b>36 のテーマ</b>のうちの 1 つです。</sub>
</td>
</tr>
</table>

すべてのスライドは、**HTML**（単一ファイル、アセットをインライン化）、**PDF**（ブラウザ印刷、スライド対応）、**PPTX**（エージェント駆動のスキル）、**ZIP**（アーカイブ）、または **Markdown** にエクスポートできます。

### 4 · 画像 — `gpt-image-2`、ImageRouter、カスタム API

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated city food map" /><br/><sub><b>イラスト調の都市グルメマップ</b><br/>手描きのエディトリアルな旅行ポスター</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic elevator scene" /><br/><sub><b>シネマティックなエレベーターのシーン</b><br/>単一フレームのエディトリアルな静止画</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk anime portrait" /><br/><sub><b>サイバーパンクのポートレート</b><br/>プロフィールアバター——ネオンの顔のテキスト</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D stone staircase evolution" /><br/><sub><b>3D の石の階段</b><br/>削り出した石のインフォグラフィック</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous portrait" /><br/><sub><b>華やかなポートレート</b><br/>エディトリアルなスタジオ撮影</sub></td>
</tr>
</table>

**93 のすぐに再現できるプロンプト**が [`prompt-templates/`](../../prompt-templates/) にあります——プレビューサムネイル、プロンプト全文、対象モデル、アスペクト比、出典の帰属付きです。ワンクリックでブリーフをコンポーザーに投入できます。

### 5 · 動画と HyperFrames — エージェントネイティブなモーショングラフィックス

**[HyperFrames][hyperframes]** は HeyGen のオープンソースでエージェントネイティブな動画フレームワークであり、Open Design に第一級の存在として統合されています。エージェントが HTML + CSS + GSAP を書き、HyperFrames がそれをヘッドレス Chrome + FFmpeg を通じて決定論的な MP4 にレンダリングします。シネマティックな t2v / i2v のための **Seedance 2.0**、ルーティングされたモデルバリアントのための **Veo 3 / Sora 2 / Kling 2**、そしてオーディオレイヤーのための **Suno v5 / Lyria 2** と組み合わせられます。

<table>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30 秒の SaaS プロダクトプロモ</b> · 16:9 · UI の 3D リビール</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok カラオケのトーキングヘッド</b> · 9:16 · TTS + 単語同期の字幕</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle reel" /></a><br/><sub><b>30 秒のブランドシズルリール</b> · 16:9 · オーディオに反応するキネティックタイプ</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Bar chart race" /></a><br/><sub><b>バーチャートレース</b> · 16:9 · NYT 風のデータインフォグラフィック</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>フライトマップ</b> · 16:9 · Apple 風のルートリビール</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4 秒のシネマティックなロゴアウトロ</b> · 16:9 · パーツごとの組み立て + ブルーム</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K のマネーカウンター</b> · 9:16 · Apple 風のハイプ</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>ウェブサイトから動画へ</b> · 16:9 · サイトを 3 つのビューポートでキャプチャ</sub></td>
</tr>
</table>

11 の HyperFrames テンプレート + 39 の Seedance プロンプトがリポジトリに同梱されています。カタログのサムネイルは © HeyGen、フレームワークは Apache-2.0 です。OD 固有のレンダーワークフロー（コンポジションキャッシュ、sandbox-exec の回避策、MP4-as-chip）は [`design-templates/hyperframes/`](../../design-templates/hyperframes/) に詳しく記載されています。

[hyperframes]: https://github.com/heygen-com/hyperframes

---

## なぜ Open Design なのか

> **2026 年 4 月、Anthropic は [Claude Design][cd] をリリースしました——LLM が散文を書くのをやめ、デザインアーティファクトを直接納品し始めた初めての出来事でした。** これは一気に広まりました。しかし、それはクローズドソースのまま、有料のみ、クラウドのみで、Anthropic のモデル、Anthropic のスキル、Anthropic のサーフェスに縛られていました。チェックアウトもなく、セルフホストもなく、Vercel デプロイもなく、自前のエージェントへの差し替えもできません。

Open Design (OD) はそのオープンソースの代替ツールです。同じループ、同じアーティファクトファーストのメンタルモデル、ロックインは一切なし:

- 🤖 **エージェントネイティブ、モデル非依存。** 私たちはエージェントを同梱しません。すでにあなたの `PATH` にある `claude` / `codex` / `cursor-agent` / `copilot` / `hermes` / `kimi` がデザインエンジンです。ワンクリックで差し替えられます。
- 🧠 **デフォルトでブランドグレード。** すべてのレンダリングはアクティブな `DESIGN.md` を読み取ります——パレット、タイポグラフィ、スペーシング、モーション、ボイス、アンチパターンをカバーする 9 セクションのスキーマです。150 のシステムがリポジトリに同梱されています（Linear、Stripe、Vercel、Airbnb、Apple、Tesla、Notion、Anthropic、Cursor、Supabase、Figma…）。フォルダをドロップすれば、ピッカーがそれを見つけます。
- 🖥️ **ローカルファースト、あらゆるレイヤーで BYOK。** ネイティブデスクトップアプリはクラウドへの往復なしにローカルファーストのままです。デーモンデータパスを説明する前に、ルートの `AGENTS.md` にある **Daemon data directory contract** を必ず読んでください。
- 🌍 **3 つの平面で組み合わせ可能。** **プラグイン**は実行可能なワークフローを運び · **スキル**はエージェントのデザインの審美眼を運び · **デザインシステム**はブランドを運びます。これら 3 つはすべて、誰もが作成・バージョン管理・公開できるプレーンファイルです。
- 🔁 **既存のコードベースをリフレッシュ。** `git` リポジトリ + `DESIGN.md` をエージェントに渡せば、あなたの実際のコンポーネントをブランド仕様にリファクタリングします。専用のプラグインが Figma / Pencil のワークフローを React / Next.js / Vue のコードへと移行します。
- 🔒 **信念としてのプライバシー。** すべてがあなたのデータのある場所——あなたのラップトップ、チームのサーバー、Vercel プロジェクト——で動作します。ネットワークが必要なときも、BYOK プロキシは SSRF からガードされています。

### 比較

| | [Claude Design][cd] | Figma | Lovable / v0 / Bolt | **Open Design** |
|---|---|---|---|---|
| オープンソース | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| セルフホスト／デスクトップ | ❌ | ❌ | ❌ | **✅ macOS + Windows + Vercel** |
| エージェントネイティブ（あなたの CLI で動作） | Anthropic のみ | ❌ | クラウドエージェントのみ | **✅ 21 CLI + BYOK** |
| ブランドグレードの `DESIGN.md` | プロプライエタリ | テーマ JSON | 限定的なトークン | **✅ 150 システム同梱** |
| スキル／プラグイン／テンプレート | クローズド | プラグインストア | クローズド | **✅ 100 種類以上のスキル · 261 プラグイン** |
| HyperFrames（HTML→MP4） | ❌ | ❌ | ❌ | **✅ 第一級対応** |
| 既存リポジトリをブランドにリフレッシュ | ❌ | ❌ | ❌ | **✅ エージェント + `DESIGN.md` 経由** |
| 最低限の課金 | Pro / Max / Team | Pro / Org | Pro / Team | **BYOK · 任意の互換エンドポイント** |

---

## クイックスタート

### 🖥️ デスクトップアプリをダウンロード（推奨——設定ゼロ）

Open Design を使う最も速い方法。Node も、pnpm も、クローンも不要です。

- **macOS**（Apple Silicon · Intel x64）→ [**open-design.ai**](https://open-design.ai/) または [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Windows**（x64）→ [**open-design.ai**](https://open-design.ai/) または [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Linux**（AppImage、オプションのレーン）→ [GitHub Releases](https://github.com/nexu-io/open-design/releases)

インストール後: アプリはあなたの `PATH` 上のすべてのコーディングエージェント CLI を自動検出し、100 種類以上のスキルと 150 のデザインシステムを読み込み、エントリービューでブリーフを入力できるようにします。

### 🤖 コーディングエージェントにインストール（UI なし）

GUI を一度も開くことなく Open Design を使えます——Claude Code、Codex、Cursor、Copilot、OpenClaw、Antigravity、Hermes、Kimi などの内部で、スキル、プラグイン、または MCP サーバーとして呼び出せます。

```bash
# One-line install into the agent you're using:
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
# <agent> = claude | codex | cursor | copilot | openclaw | antigravity | gemini
#         | pi | vibe | hermes | cline | kimi | trae | opencode
```

そして、エージェントの内部で:

```
> Use open-design to generate a landing page with the Linear design system
```

エージェントは `skills/` を読み取り、適切な `SKILL.md` を選び、あなたが指定した `DESIGN.md` をバインドし、`http://localhost:7456` でプレビューできる `<artifact>` を発行します。

### 🐳 Docker で実行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# open http://localhost:7456
```

### 🚀 Sealos にデプロイ

[![Deploy on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/open-design/)

Sealos App Store テンプレートは、公開済みの Open Design Docker イメージを永続的なワークスペースストレージと公開プロキシの Basic Auth 付きで実行します。独自の公開または共有 Docker デプロイでは、[`deploy/README.md`](../../deploy/README.md#local-compose) のリバースプロキシと `OPEN_DESIGN_ALLOWED_ORIGINS` の手順に従ってください。

### 🧑‍💻 ソースから実行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Node `~24`、pnpm `10.33.x`。Windows ユーザーは [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) を参照してください。完全なクイックスタート、環境変数、Nix flake、パッケージ化されたビルドフロー → [`QUICKSTART.ja-JP.md`](QUICKSTART.ja-JP.md)。

### 完全なワークフロー — ブリーフからアーティファクトまで

`brief → plugin → direction → design system → artifact → handoff → memory`

1. **PM がブリーフを提出します。** プラグインピッカーが、ランディングページ · ピッチデック · ダッシュボード · ソーシャル投稿 · PM スペック · OKR スコアカード… を提案します。
2. **デザイナー（またはエージェント）が方向性を確定します。** ブランドがない？ 5 つの厳選された方向性から選びます。ブランドがある？ スクリーンショット／URL をドロップ → エージェントが GitHub に接続し、Figma をインポートし、再利用可能な `DESIGN.md` に体系化します。
3. **エージェントが最初の `<artifact>` を発行します。** プラグイン + スキル + `DESIGN.md` がバインドされます。それはサンドボックス化された iframe にストリーミングされ、その場で編集可能です——「ゼロから再生成」ではありません。
4. **エンジニアリングへ引き渡します。** アーティファクトは本物の HTML/CSS です——Cursor、Codex、または Claude Code にドロップして、コードとして開発を続けられます。あるいは PPTX / PDF / MP4 をマーケティングへ直接エクスポートできます。
5. **Open Design は使うほど賢くなります。** あなたのスクリーンショット、フォント、パレット、確定したアーティファクトは、次回のセッションのデフォルトとして蓄積されます。やり直しは減り、ブレも減ります。

---

## コーディングエージェントから Open Design を使う

Open Design は **stdio MCP サーバー**とエージェントごとの**インストールスクリプト**を提供します。別のリポジトリにある MCP 互換のエージェントは、あなたのローカルの Open Design プロジェクトからファイル——トークン CSS、JSX コンポーネント、エントリー HTML——を、名前で問い合わせ可能な構造化 API として直接読み取れます。エージェントは常に、古いエクスポートではなくライブのファイルを見ます。

```bash
# One-line install (16+ CLIs supported):
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>

# Then the agent can:
od search-files "primary button"      # search files across projects
od get-file design-systems/linear-app/DESIGN.md
od get-artifact <slug>                # latest rendered artifact
od plugin run web-prototype --brief "..."
od skill list --scenario marketing
```

**なぜ MCP なのか？** イテレーションのたびに zip をエクスポートして再アタッチすると、フローが途切れます。MCP はデザインソースを直接公開します——エージェントは常にライブのファイルを見ます。

**ゼロから始めるエージェントのために、**インストーラーは `~/.config/<agent>/open-design.json`（またはプラットフォーム相当のもの）と、コピー＆ペースト用の MCP スニペットを配置します。Cursor にはワンクリックのディープリンク、Claude Code には `claude mcp add-json` のワンライナー、その他すべてのエージェントには、その設定が期待するスキーマの JSON が提供されます。エージェントごとの完全なフロー → デスクトップアプリの **Settings → MCP server**、または [`docs/agent-adapters.md`](../../docs/agent-adapters.md)。

**セキュリティモデル。** デフォルトで読み取り専用、デーモンは `127.0.0.1` にバインドし、SSRF はプロキシのエッジでブロックされます。LAN への公開には、明示的な `OD_BIND_HOST` と `OD_ALLOWED_ORIGINS` が必要です。コネクターの認証情報とライブアーティファクトのプレビュールートは、いずれにせよループバック専用のままです。

---

## スキル

**100 種類以上のスキルが標準で同梱されています**——それぞれが [`skills/`](../../skills/) 配下のフォルダで、Claude Code の [`SKILL.md`][skill] 規約に従い、`od:` フロントマター（`mode`、`platform`、`scenario`、`preview.type`、`design_system.requires`、`default_for`、`fidelity`、`example_prompt`）で拡張されています。フォルダをドロップしてデーモンを再起動すれば、ピッカーに表示されます。

2 つの**モード**がカタログの軸になります: `prototype`（ウェブ／モバイル／デスクトップの単一ページアーティファクト）と `deck`（横スワイプのプレゼンテーション）。さらに `image`、`video`、`audio`、`template`、`design-system`、`utility` の各モードもあります。**`scenario`** フィールドは、それらを対象者ごとにグループ化します: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`。

| スキル | モード | シナリオ | 生成するもの |
|---|---|---|---|
| [`web-prototype`](../../design-templates/web-prototype/) | prototype | design | デフォルトのランディングページ／ヒーロー |
| [`saas-landing`](../../design-templates/saas-landing/) | prototype | marketing | ヒーロー／機能／価格／CTA |
| [`dashboard`](../../design-templates/dashboard/) | prototype | operation | 管理画面／アナリティクス（サイドバー付き） |
| [`mobile-app`](../../design-templates/mobile-app/) | prototype | design | iPhone 15 Pro / Pixel フレーム付きアプリ |
| [`mobile-onboarding`](../../design-templates/mobile-onboarding/) | prototype | design | スプラッシュ · 価値提案 · サインインフロー |
| [`social-carousel`](../../design-templates/social-carousel/) | prototype | marketing | 3 カードの 1080×1080 カルーセル |
| [`email-marketing`](../../design-templates/email-marketing/) | prototype | marketing | テーブルフォールバック対応のブランドメール |
| [`magazine-poster`](../../design-templates/magazine-poster/) | prototype | marketing | 単一ページの雑誌レイアウト |
| [`motion-frames`](../../design-templates/motion-frames/) | prototype | marketing | ループする CSS モーションヒーロー |
| [`sprite-animation`](../../design-templates/sprite-animation/) | prototype | marketing | 8 ビットのピクセルアニメーション解説 |
| [`pm-spec`](../../design-templates/pm-spec/) | prototype | product | PM スペック文書（目次 + 意思決定ログ付き） |
| [`team-okrs`](../../design-templates/team-okrs/) | prototype | product | OKR スコアカード |
| [`eng-runbook`](../../design-templates/eng-runbook/) | prototype | engineering | インシデントランブック |
| [`finance-report`](../../design-templates/finance-report/) | prototype | finance | 経営向け財務サマリー |
| [`hr-onboarding`](../../design-templates/hr-onboarding/) | prototype | hr | 役割別オンボーディング計画 |
| [`guizang-ppt`](../../design-templates/guizang-ppt/) | deck | marketing | 雑誌風のウェブ PPT（deck のデフォルト） |
| [`html-ppt-*`](../../design-templates/) | deck | marketing | 15 のスライドテンプレート × 36 のテーマ（マスターテンプレートは [`design-templates/html-ppt/`](../../design-templates/html-ppt/)） |
| [`hyperframes`](../../design-templates/hyperframes/) | video | marketing | HTML → MP4 のモーショングラフィックス（HeyGen OSS フレームワーク） |
| [`critique`](../../design-templates/critique/) | utility | design | 5 次元の自己批評スコアシート |
| [`tweaks`](../../design-templates/tweaks/) | utility | design | AI が発行する tweaks パネルのマニフェスト |

完全なスキルプロトコル → [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。スキルレジストリのエンドポイント: `GET /api/skills`。

---

## デザインシステム

**150 のブランドグレード `DESIGN.md` システム**がリポジトリに同梱されています——それぞれが 9 セクションのスキーマ（カラー、タイポグラフィ、スペーシング、レイアウト、コンポーネント、モーション、ボイス、ブランド、アンチパターン）を持つ単一の Markdown ファイルで、[`VoltAgent/awesome-design-md`][acd2] からのものです。システムを切り替える → 次のレンダリングは新しいトークンを使います。テーマ JSON は不要です。

<details>
<summary><b>完全なカタログ（クリックで展開）</b></summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**開発者ツール** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**生産性** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**フィンテック** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E コマース** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**メディア** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**自動車** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**その他** — `apple` · `ibm` · `nvidia` · `vodafone` · `resend` · `spacex`

**スターター** — `default`（Neutral Modern） · `warm-editorial`

</details>

ライブラリの再インポートは [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts) で行えます。独自のブランドを追加する → `design-systems/<brand>/` に `DESIGN.md` をドロップします。完全なガイド → [`design-systems/README.md`](../../design-systems/README.md)。

[acd2]: https://github.com/VoltAgent/awesome-design-md

---

## プラグイン

**261 の公式プラグイン**が [`plugins/_official/`](../../plugins/_official/) にあります。各プラグインは**ポータブルなエージェントスキルのフォルダ**です——`SKILL.md`（Agent Skills をサポートする任意のエージェントが読める）に加え、Open Design にマーケットプレイスのメタデータ、入力、プレビュー、パイプライン、機能宣言を与える任意の `open-design.json` マニフェストを備えています。カテゴリーに直接ジャンプ:

| カテゴリー | 数 | 内容 |
|---|---|---|
| [`scenarios/`](../../plugins/_official/scenarios/) | 11 | 完全なデザインシナリオ — [`od-default`](../../plugins/_official/scenarios/od-default/), [`od-design-refine`](../../plugins/_official/scenarios/od-design-refine/), [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/), [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/), [`od-react-export`](../../plugins/_official/scenarios/od-react-export/), [`od-nextjs-export`](../../plugins/_official/scenarios/od-nextjs-export/), [`od-vue-export`](../../plugins/_official/scenarios/od-vue-export/), [`od-media-generation`](../../plugins/_official/scenarios/od-media-generation/), [`od-new-generation`](../../plugins/_official/scenarios/od-new-generation/), [`od-tune-collab`](../../plugins/_official/scenarios/od-tune-collab/), [`od-plugin-authoring`](../../plugins/_official/scenarios/od-plugin-authoring/) |
| [`image-templates/`](../../plugins/_official/image-templates/) | 45 | ワンショットの画像プロンプト — エディトリアル、シネマティック、プロダクト、ポートレート |
| [`video-templates/`](../../plugins/_official/video-templates/) | 50 | HyperFrames / Seedance / Veo のモーションテンプレート |
| [`design-systems/`](../../plugins/_official/design-systems/) | 142 | プラグインとしてラップされたブランド `DESIGN.md` |
| [`atoms/`](../../plugins/_official/atoms/) | 13 | 再利用可能な UI フラグメント（ボタン、ヒーロー、KPI カード） |
| [`examples/`](../../plugins/_official/examples/) | 140 | リミックス可能なリファレンス出力 |

コミュニティプラグインは [`plugins/community/`](../../plugins/community/)、公開フローは [`plugins/registry/`](../../plugins/registry/) もご覧ください。

### プラグインにできること

- 🤖 **任意のコーディングエージェントで実行** — [Claude Code](../../docs/agent-adapters.md)、Codex、Cursor、Copilot、[OpenClaw](https://github.com/openclaw/openclaw)、[Antigravity](https://antigravity.google)、Hermes、Kimi… エージェントがすでに知っている同じスキルプロトコルを通じて。
- 🔁 **Figma / Pencil のワークフローを移行** → React、Next.js、または Vue のソースへ。[`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/) を参照。
- 🛠️ **既存のコードベースをブランド仕様にリフレッシュ** — プラグインを `git` リポジトリ + `DESIGN.md` に向ければ、PR が得られます。[`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/) を参照。
- 💾 **カスタムワークフローを永続化** — チームの再利用可能なテンプレートが、同梱されたものの隣に並びます。

### プラグインを使う

プラグインは **ウェブ UI** と **`od` CLI** の間で完全に同等です——同じ `/api/plugins` エンドポイントなので、どちらでも合うほうを選べます。

**デスクトップ／ウェブアプリで:** **Plugin** ページを開いてマーケットプレイスを閲覧し、**Install** をクリックします。プロジェクトの Studio 内では、プラグインはクリックして適用するコンポーザーのチップとして（それらが宣言する入力とともに）表示されます。

**コマンドラインで**（UI なしで動作——これは外部エージェントが使うパスです）:

```bash
od plugin list                       # list installed plugins (--task-kind / --mode / --tag filters)
od plugin search "landing page"      # search by keyword
od plugin info od-default            # inspect a plugin's metadata, inputs, capabilities
od plugin install od-figma-migration # install from a registry; also accepts ./local-folder or an https://… link
od plugin apply od-default --input brief="a one-page pitch for our seed round"
od plugin upgrade od-default         # upgrade
od plugin uninstall od-default       # uninstall
```

すべてのコマンドが `--json` をサポートしているため、`jq` / `xargs` を通じて自動化にパイプできます。

### プラグインを作る

プラグインは **最低限 `SKILL.md` が 1 つあれば成り立ちます**。Open Design のマーケットプレイスに掲載するには `open-design.json` を追加します:

```
my-plugin/
├── SKILL.md            ← required: YAML frontmatter (name · description) + trigger phrasing + workflow (aim for < 500 lines)
├── open-design.json    ← needed to list: marketplace metadata + inputs + pipeline + capabilities
├── README.md           ← optional: usage, install, registry links
├── preview/            ← optional: index.html / poster.png (strongly recommended for visual plugins)
└── examples/           ← optional: concrete use cases
```

`open-design.json` の主要フィールド: `specVersion`（現在は `1.0.0`）、`name`（安定した ID）、`version`（semver）、`compat.agentSkills[].path`（`./SKILL.md` を指す）、`od.kind`（`skill` / `scenario` / `atom` / `bundle`）、`od.taskKind`（`new-generation` / `figma-migration` / `code-migration` / `tune-collab`）、`od.mode`（出力サーフェス、例: `prototype` / `deck` / `live-artifact` / `image` / `video` / `hyperframes` / `audio` / `design-system` / `scenario`）、`od.capabilities[]`（**最小限を宣言する**——制限付きインストールはデフォルトで `prompt:inject` のみを付与します）、`od.inputs[]`（適用時のパラメーター）。

ローカルでスキャフォールド + 検証:

```bash
od plugin scaffold --id my-plugin --title "My Plugin"   # generate the skeleton
od plugin validate ./my-plugin                          # check manifest / file layout
pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck
```

完全なフィールドセットとランタイム契約 → [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md)。コーディングエージェントでプラグインを開発する → [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md)。コピー＆ペースト用の最小テンプレート → [`plugins/spec/examples/`](../../plugins/spec/examples/)。

### プラグインを貢献する

1. プラグインフォルダを [`plugins/community/`](../../plugins/community/)（サードパーティプラグイン）にドロップするか、または——Open Design に同梱して提供するには——[`plugins/_official/`](../../plugins/_official/) の該当するティアにドロップします。
2. 検証を通過させます: `od plugin validate`、`pnpm guard`、`pnpm --filter @open-design/plugin-runtime typecheck`。
3. [`plugins/spec/CONTRIBUTING.md`](../../plugins/spec/CONTRIBUTING.md) のテンプレートを使って PR を記入します（ID、バージョン、レーン、モード、機能、トリガー例。ビジュアルプラグインにはスクリーンショット／プレビューを添付）。
4. 外部レジストリ（skills.sh / ClawHub / スタンドアロンの GitHub）に公開する → [`plugins/spec/PUBLISHING-REGISTRIES.md`](../../plugins/spec/PUBLISHING-REGISTRIES.md)。

プラグインレジストリのエンドポイント: `GET /api/plugins`。ディレクトリ概要 → [`plugins/README.md`](../../plugins/README.md)（[简体中文](../../plugins/README.zh-CN.md)）。

---

## アーキテクチャ

```
┌────────────────── browser (Next.js 16) / Electron shell ──────────────┐
│  chat · file workspace · iframe preview · settings · import · MCP     │
└──────────────┬─────────────────────────────────────┬─────────────────┘
               │ /api/*                              │
               ▼                                     ▼
   ┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  local daemon (Express+SQLite)  │   ─→ any OpenAI-compatible BYOK,
   │                                  │       SSRF-guarded at the edge
   │  /api/skills    /api/plugins    │
   │  /api/design-systems            │
   │  /api/chat (SSE)   /api/proxy/* │
   │  /api/projects/:id/files/...    │
   │  /api/artifacts/{save,lint}     │
   │  /api/import/claude-design      │
   │  MCP stdio server                │
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: managed project cwd })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · copilot · openclaw · antigravity ·│
   │  gemini · opencode · qwen · qoder · hermes (ACP) · kimi (ACP) ·    │
   │  pi (RPC) · kiro · kilo · vibe (ACP) · cline · trae · deepseek     │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk             │
   └──────────────────────────────────────────────────────────────────┘
```

| レイヤー | スタック |
|---|---|
| フロントエンド | Next.js 16 App Router + React 18 + TypeScript |
| デーモン | Node 24 · Express · SSE ストリーミング · `better-sqlite3` |
| ストレージ | デーモンのストレージパスを変更または文書化する前に、ルートの `AGENTS.md` にある **Daemon data directory contract** を必ず読んでください。この README でそれを繰り返してはいけません。 |
| プレビュー | サンドボックス化された `srcdoc` iframe + ストリーミング `<artifact>` パーサー |
| エクスポート | HTML（インライン化） · PDF（ブラウザ印刷） · PPTX（エージェント駆動） · ZIP · Markdown · MP4（HyperFrames） |
| デスクトップ | Electron シェル + サンドボックス化されたレンダラー + サイドカー IPC（STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN） |
| ライフサイクル | 単一のエントリーポイント: `pnpm tools-dev`（start / stop / run / status / logs / inspect / check） |

完全なアーキテクチャ → [`docs/architecture.md`](../../docs/architecture.md)。スキルプロトコル → [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。エージェントアダプターの契約 → [`docs/agent-adapters.md`](../../docs/agent-adapters.md)。

---

## ロードマップ

- [x] デーモン + 21 のコーディングエージェント CLI アダプター + スキルレジストリ + デザインシステムカタログ
- [x] ウェブアプリ + チャット + 質問フォーム + 5 方向ピッカー + todo 進捗 + サンドボックス化プレビュー
- [x] 100 種類以上のスキル · 150 のデザインシステム · 5 つのビジュアル方向性 · 5 つのデバイスフレーム
- [x] SQLite を裏に持つプロジェクト · 会話 · メッセージ · タブ · テンプレート
- [x] マルチプロバイダー BYOK プロキシ（`/api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`）+ SSRF ガード
- [x] Claude Design ZIP インポート（`/api/import/claude-design`）
- [x] サイドカープロトコル + Electron デスクトップ + IPC 自動化
- [x] アーティファクト lint API + 5 次元の自己批評による発行前ゲート
- [x] **0.8.0** — プラグインマーケットプレイスのインフラ（261 の公式プラグイン、マニフェスト仕様、エージェントごとのインストールスクリプト）
- [x] **0.9.0** — Open Design AMR（アプリに組み込まれた公式 Model Router: 設定ゼロ、ワンクリックのサインイン）
- [x] パッケージ化された Electron ビルド — macOS（Apple Silicon + Intel） + Windows（x64） + Linux AppImage（オプションのレーン）
- [ ] コメントモードの外科的な編集 — 一部提供済み。信頼性の高いターゲット指定のパッチ適用は進行中
- [ ] AI が発行する tweaks パネルの UX — 未実装
- [ ] `npx od init` で `DESIGN.md` を備えたプロジェクトをスキャフォールド
- [ ] プラグイン SDK + `od plugin {add,list,remove,test,publish}` CLI
- [ ] Figma / Pencil → React / Next / Vue の移行プラグイン（アルファ）
- [ ] 既存コードベースのリフレッシュプラグイン（git リポジトリ + `DESIGN.md` に向ける）

段階的なデリバリー → [`docs/roadmap.md`](../../docs/roadmap.md)。

---

## コミュニティ

すべてのチャネルの裏側には、本物の人がいます。

- 💬 **Discord** — 日々のチャット、プラグインの共有、質問 → [**discord.gg/9ptkbbqRu**](https://discord.gg/9ptkbbqRu)
- 🐦 **X / Twitter** — リリースノート、マイルストーン、舞台裏 → [**@OpenDesignHQ**](https://x.com/OpenDesignHQ)
- 🗣️ **GitHub Discussions** — 深い Q&A、RFC、「成果を見せて」 → [**Discussions**](https://github.com/nexu-io/open-design/discussions)
- 🐛 **GitHub Issues** — バグ報告、機能リクエスト → [**Issues**](https://github.com/nexu-io/open-design/issues)

[`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) と [`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) のラベルが、最も入りやすい入口です。

---

## 貢献

Open Design が動き続けるのは、貢献者——デザイナー、エンジニア、プロンプトの作者——が現れ続けるからです。最もよく使われるスキル、デザインシステム、プラグインの多くは、コアチームの外の人々によって書かれました。

### 🎯 どこから始めるか（最大のレバレッジ、最小の変更）

| 出したいもの… | 方法 | 場所 |
|---|---|---|
| 新しい**スキル** | `SKILL.md` + `assets/` + `references/` を備えたフォルダをドロップ | [`skills/`](../../skills/) · 仕様は [`docs/skills-protocol.md`](../../docs/skills-protocol.md) |
| 新しい**デザインシステム** | 9 セクションのスキーマを使った `DESIGN.md` をドロップ | [`design-systems/<brand>/`](../../design-systems/) |
| 新しい**プラグイン** | カテゴリーフォルダの下に `open-design.json` + マニフェストをドロップ | [`plugins/community/`](../../plugins/community/) · 仕様は [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md) · エージェント開発ガイドは [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md) |
| 新しい**コーディングエージェント CLI** をサポート | アダプターエントリー 1 つ + ストリームパーサー | [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) |
| バグ修正や UI の磨き上げ | [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) ラベルを閲覧 | [Issues →](https://github.com/nexu-io/open-design/issues) |
| ドキュメントを翻訳 | `README.<lang>.md` ファイルを更新 | [`TRANSLATIONS.md`](../../TRANSLATIONS.md) |

### 🤖 エージェントとして貢献する

*あなたがこれを読んでいるエージェントである*なら、最も速いパスは:

```bash
# 1. Boot locally
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# 2. Find a good-first-issue and assign yourself
gh issue list --label "good first issue" --state open --limit 20
gh issue develop <number>   # create a branch and worktree

# 3. Make the change, run the checks
pnpm guard && pnpm typecheck
pnpm --filter @open-design/<package> test

# 4. Open the PR
gh pr create --fill
```

完全なエージェントフレンドリーな貢献フロー、コードスタイル、PR の基準 → [English](../../CONTRIBUTING.md)（[Deutsch](CONTRIBUTING.de.md) · [Français](CONTRIBUTING.fr.md) · [简体中文](CONTRIBUTING.zh-CN.md) · [日本語](CONTRIBUTING.ja-JP.md) · [Português](CONTRIBUTING.pt-BR.md)）。

### 🏅 Open Design Fellow プログラム

私たちは世界中で **Open Design Fellow** を募集しています——Fellow はコアチームとともにプロダクトを形づくり、各地域で Open Design を公式に代表し、資金面のサポート（$1,000 / MR）、無料の LLM クレジット、直通のレビュートラックに支えられながら、ローカルでコミュニティを育てます。詳細 → [`MAINTAINERS.md`](../../MAINTAINERS.md) と [Discord](https://discord.gg/9ptkbbqRu) のアナウンス。

---

## メンテナー

彼らは多くの負担を担っています——日々のメンテナンス、レビュー、そしてコミュニティサポート。

<table>
  <tr>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Nagendhra-web">
        <img src="https://github.com/Nagendhra-web.png" width="96" alt="@Nagendhra-web" /><br/>
        <sub><b>@Nagendhra-web</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Sid-Qin">
        <img src="https://github.com/Sid-Qin.png" width="96" alt="@Sid-Qin" /><br/>
        <sub><b>@Sid-Qin</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
  </tr>
</table>

メンテナーのルール、昇格基準、退任プロトコル → [`MAINTAINERS.md`](../../MAINTAINERS.md)（[Deutsch](MAINTAINERS.de.md) · [Français](MAINTAINERS.fr.md) · [简体中文](MAINTAINERS.zh-CN.md) · [日本語](MAINTAINERS.ja-JP.md) · [Português](MAINTAINERS.pt-BR.md) も）。

## コントリビューター

参加してくださったすべての方に感謝します——コード、ドキュメント、フィードバック、鋭い issue、新しいスキル、新しいデザインシステム。

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=20&anon=1&cache_bust=2026-06-22" alt="Open Design contributors" />
</a>

---

## リポジトリのアクティビティ

<picture>
  <img alt="Open Design — repository metrics" src="https://repo-assets.open-design.ai/resources/images/github-metrics.svg" />
</picture>

上の SVG は、[`lowlighter/metrics`](https://github.com/lowlighter/metrics) を使って [`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml) によって毎日再生成されます。

---

## スターをお願いします

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="https://repo-assets.open-design.ai/resources/images/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

これで 30 分を節約できたなら、★ を付けてください。スターは家賃を払ってはくれません——でも、次のデザイナー、エージェント、貢献者に、この実験が注目に値することを伝えてくれます。ワンクリック、3 秒、本物のシグナルです。

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-06-22" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-06-22" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-06-22" />
  </picture>
</a>

---

## 参考と系譜

| プロジェクト | 役割 |
|---|---|
| [Claude Design][cd] | このリポジトリがオープンソースの代替ツールとなっている、クローズドソースのプロダクト。 |
| [`alchaincyf/huashu-design`](https://github.com/alchaincyf/huashu-design) | デザイン哲学の羅針盤——ジュニアデザイナーのワークフロー、ブランドアセットのプロトコル、アンチ AI スロップのチェックリスト、5 次元の批評。 |
| [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) | 雑誌風のウェブ PPT スキルで、[`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) の下にそのままバンドルされています。deck モードのデフォルト。 |
| [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) | HTML PPT Studio ファミリー——15 のスライドテンプレート、36 のテーマ、31 のページレイアウト、アニメーションランタイム、マグネティックカードのプレゼンターモード。 |
| [`OpenCoworkAI/open-codesign`](https://github.com/OpenCoworkAI/open-codesign) | 最初のオープンソース Claude Design 代替ツール。私たちが借用している UX パターン（ストリーミングアーティファクトのループ、サンドボックス化された iframe、ライブエージェントパネル）。 |
| [`multica-ai/multica`](https://github.com/multica-ai/multica) | デーモン + アダプターのアーキテクチャ——PATH スキャンによるエージェント検出、唯一の特権プロセスとしてのローカルデーモン。 |
| [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) | 9 セクションの `DESIGN.md` スキーマと 70 のプロダクトシステムの出典。 |
| [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills) | `design-systems/` の下に追加された 57 のデザインスキルの出典。 |
| [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | HTML→MP4 のモーショングラフィックスフレームワークで、Open Design に第一級の `hyperframes-html` として統合されています。 |
| [Claude Code skills][skill] | 私たちがそのまま採用している `SKILL.md` 規約。 |

詳細な来歴 → [`docs/references.md`](../../docs/references.md)。

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## ライセンス

Apache-2.0。同梱の `design-templates/guizang-ppt/` は元の [LICENSE](../../design-templates/guizang-ppt/LICENSE)（MIT、[@op7418](https://github.com/op7418)）を保持しています。同梱の `design-templates/html-ppt/` は元の [LICENSE](../../design-templates/html-ppt/LICENSE)（MIT、[@lewislulu](https://github.com/lewislulu)）を保持しています。
