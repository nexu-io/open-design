# Open Design

> [!IMPORTANT]
> ### 🔥 `0.8.0-preview` が公開されました。デザインの旧時代は、ここで終わります。
>
> オープンソースで agent-native な Claude Design / Figma の代替 —— 2 週間で 40k stars、ここまで来ました。**残りの道のりは、あなたと一緒に進みたい。**
>
> **`main` で高速イテレーション中** — 0.8.0 は Open Design の次のフェーズです。PR を投げ、突飛なアイデアを放り込み、バグを報告してください —— あなたが持ち込んだものが、このムーブメントの次の姿になります。
>
> → [**告知を読む · インストーラーを入手 · このムーブメントに参加**](https://github.com/nexu-io/open-design/discussions/1727) · 現在の 0.7 と並行してインストールできます。

> **[Claude Design][cd] のオープンソース代替。** ローカルファースト、Vercel デプロイ可能、あらゆるレイヤーで BYOK（Bring Your Own Key） — `PATH` 上で自動検出される **16 種類の coding-agent CLI**（Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI）がデザインエンジンとなり、**31 個の組み合わせ可能な Skill** と **72 種のブランドグレード Design System** で駆動されます。CLI が未インストールでも、OpenAI 互換の BYOK プロキシ `/api/proxy/stream` で同じループを spawn なしで実行できます。

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — ノートパソコン上のエージェントとデザインする" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ffd700&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=2ecc71&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/issues"><img alt="Issues" src="https://img.shields.io/github/issues/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ff6b6b&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/pulls"><img alt="Pull Requests" src="https://img.shields.io/github/issues-pr/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=9b59b6&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=3498db&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=e67e22&logo=git&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=8e44ad&logo=git&logoColor=white" /></a>
</p>

<p align="center">
  <a href="https://open-design.ai/"><img alt="ダウンロード" src="https://img.shields.io/badge/%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#対応-coding-agent"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-system">
  <img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#組み込み-skill"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.ja-JP.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <b>日本語</b> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## なぜこれを作ったのか

Anthropic の [Claude Design][cd]（2026-04-17 リリース、Opus 4.7 搭載）は、LLM が文章を書くのをやめてデザイン成果物を直接出力し始めたらどうなるかを世に示しました。瞬く間にバズり — そして**クローズドソース**、有料限定、クラウド限定、Anthropic のモデルと Anthropic の Skill に縛られたままでした。checkout もセルフホストも Vercel デプロイも、エージェントの差し替えもできません。

**Open Design（OD）はそのオープンソース代替です。** 同じループ、同じ「artifact-first」のメンタルモデル、しかしロックインなし。私たちはエージェントを同梱しません — あなたのノートパソコンにある最強の coding agent がすでにインストール済みです。それを Skill 駆動のデザインワークフローに接続するのが私たちの仕事です。ローカルでは `pnpm tools-dev` で完結し、Web レイヤーは Vercel にデプロイ可能で、すべてのレイヤーが BYOK です。

「`雑誌風のシードラウンド pitch deck を作って`」と入力してください。モデルが最初の 1 ピクセルを描く前に、**初期化質問フォーム**がポップアップします。エージェントは 5 つの厳選されたビジュアルディレクションから 1 つを選びます。ライブの `TodoWrite` 計画カードが UI にストリーミングされます。Daemon がディスク上に実際のプロジェクトフォルダを構築し、seed テンプレート、レイアウトライブラリ、セルフチェック用チェックリストを配置します。エージェントはそれらを**pre-flight で強制的に**読み取り、自身の出力に対して**五次元評価**を実行し、数秒後に `<artifact>` を 1 つ出力してサンドボックス iframe にレンダリングします。

これは「AI がデザインを試みる」ではありません。プロンプトスタックによって、使えるファイルシステムと、決定論的なカラーパレットライブラリと、チェックリスト文化を持つシニアデザイナーのように振る舞うよう訓練された AI です — まさに Claude Design が設定した水準そのもの、ただしオープンで、あなたのものです。

OD は 4 つのオープンソースプロジェクトの上に立っています：

- [**`alchaincyf/huashu-design`**（花叔の画術）](https://github.com/alchaincyf/huashu-design) — デザイン哲学の羅針盤。Junior-Designer ワークフロー、5 ステップのブランドアセットプロトコル、anti-AI-slop チェックリスト、五次元セルフ評価、そしてディレクションピッカーの背後にある「5 流派 × 20 のデザイン哲学」のアイデア — すべて [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) に蒸留されています。
- [**`op7418/guizang-ppt-skill`**（歸藏の雑誌風 PPT Skill）](https://github.com/op7418/guizang-ppt-skill) — Deck モード。[`skills/guizang-ppt/`](skills/guizang-ppt/) 以下にオリジナルのまま同梱、元の LICENSE を保持。雑誌レイアウト、WebGL hero、P0/P1/P2 チェックリスト。
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — UX の北極星であり、最も近い同類プロジェクト。初のオープンソース Claude-Design 代替。ストリーミング artifact ループ、サンドボックス iframe プレビュー（React 18 + Babel 同梱）、ライブエージェントパネル（todo + tool calls + 中断可能な生成）、5 種類のエクスポート形式リスト（HTML / PDF / PPTX / ZIP / Markdown）を借用。形態では意図的に分岐しています — 彼らは [`pi-ai`][piai] を同梱するデスクトップ Electron アプリ、私たちは既存の CLI に委任する Web アプリ + ローカル daemon です。
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — Daemon とランタイムのアーキテクチャ。PATH スキャンによるエージェント検出、ローカル daemon を唯一の特権プロセスとする思想、agent-as-teammate の世界観。

## 概要

| | 提供される機能 |
|---|---|
| **Coding-agent CLI（16 種類）** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI — `PATH` 上で自動検出、ピッカーでワンクリック切り替え |
| **BYOK フォールバック** | OpenAI 互換プロキシ `/api/proxy/stream` — `baseUrl` + `apiKey` + `model` を貼れば、任意のベンダー（Anthropic-via-OpenAI、DeepSeek、Groq、MiMo、OpenRouter、セルフホスト vLLM、その他の OpenAI 互換プロバイダ）がエンジンになります。daemon 側で loopback / link-local / RFC1918 を拒否し SSRF を防御。 |
| **組み込み Design System** | **72 種** — 2 つの手書きスターター + [`awesome-design-md`][acd2] からインポートした 70 のプロダクトシステム（Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Anthropic、Apple、Cursor、Supabase、Figma、小紅書…） |
| **組み込み Skill** | **31 個** — `prototype` モード 27 個（web-prototype、saas-landing、dashboard、mobile-app、gamified-app、social-carousel、magazine-poster、dating-web、sprite-animation、motion-frames、critique、tweaks、wireframe-sketch、pm-spec、eng-runbook、finance-report、hr-onboarding、invoice、kanban-board、team-okrs…）+ `deck` モード 4 個（`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`）。ピッカーは `scenario` でグループ化：design / marketing / operation / engineering / product / finance / hr / sale / personal。 |
| **メディア生成** | 画像 · 動画 · 音声サーフェスがデザインループと並走。**gpt-image-2**（Azure / OpenAI）でポスター・アバター・インフォグラフィック・イラスト都市マップ · **Seedance 2.0**（ByteDance）で 15 秒のシネマティック text-to-video / image-to-video · **HyperFrames**（[heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)）で HTML→MP4 のモーショングラフィック（プロダクトリビール、キネティックタイポグラフィ、データチャート、ソーシャルオーバーレイ、ロゴアウトロ）。**93 件**のすぐ複製できる prompt ギャラリー — 43 gpt-image-2 + 39 Seedance + 11 HyperFrames、すべて [`prompt-templates/`](prompt-templates/) にプレビュー画像と出典付きで配置。Chat の入口はコードと同じ；実体の `.mp4` / `.png` がプロジェクトワークスペースに chip として落ちます。 |
| **ビジュアルディレクション** | 5 つの厳選流派（Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental）— 各々に OKLch パレット + フォントスタック付き（[`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)） |
| **デバイスフレーム** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — ピクセル単位で正確、Skill 間で共有、[`assets/frames/`](assets/frames/) に集約 |
| **エージェントランタイム** | ローカル daemon がプロジェクトフォルダ内で CLI を spawn — エージェントは実際のディスク上で `Read` / `Write` / `Bash` / `WebFetch` を使用。各 adapter に Windows `ENAMETOOLONG` フォールバック（stdin / 一時 prompt ファイル）あり |
| **インポート** | [Claude Design][cd] のエクスポート ZIP をウェルカムダイアログにドロップ — `POST /api/import/claude-design` が実プロジェクトとして展開し、Anthropic の中断箇所からエージェントが編集を続行 |
| **永続化** | SQLite（`.od/app.sqlite`）：projects · conversations · messages · tabs · ユーザー templates。翌日開いても、todo カードと開いていたファイルはそのまま。 |
| **ライフサイクル** | 唯一のエントリポイント `pnpm tools-dev`（start / stop / run / status / logs / inspect / check）— 型付き sidecar stamp で daemon + web（+ desktop）を起動 |
| **デスクトップ** | オプションの Electron シェル：サンドボックスレンダラ + sidecar IPC（STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN）— 同じチャネルで `tools-dev inspect desktop screenshot` を駆動、E2E テスト対応 |
| **デプロイ先** | ローカル（`pnpm tools-dev`）· Vercel Web レイヤー · macOS（Apple Silicon）と Windows（x64）向けパッケージ版 Electron デスクトップアプリ — [open-design.ai](https://open-design.ai/) または [最新リリース](https://github.com/nexu-io/open-design/releases) からダウンロード |
| **ライセンス** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md

## デモ

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · エントリビュー" /><br/>
<sub><b>エントリビュー</b> — Skill を選び、Design System を選び、要件を入力。プロトタイプ、デッキ、モバイルアプリ、ダッシュボード、エディトリアルページ — すべて同じ画面で。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · 初期化質問フォーム" /><br/>
<sub><b>初期化質問フォーム</b> — モデルが 1 ピクセルも描く前に、OD が要件をロック：surface、ターゲット、トーン、ブランドコンテキスト、規模。30 秒のラジオ選択が 30 分の手戻りを消し去ります。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · ディレクションピッカー" /><br/>
<sub><b>ディレクションピッカー</b> — ユーザーにブランドコンテキストがない場合、エージェントが 5 つの厳選ディレクション（Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm）を提示する 2 つ目のフォームを表示。ラジオ 1 クリックでパレット + フォントスタックが確定、フリースタイルの余地なし。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · ライブ todo 進捗" /><br/>
<sub><b>ライブ todo 進捗</b> — エージェントの計画がライブカードとして UI に流れ込みます。<code>in_progress</code> → <code>completed</code> がリアルタイムで更新。ユーザーは最小コストで途中介入・軌道修正が可能。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · サンドボックスプレビュー" /><br/>
<sub><b>サンドボックスプレビュー</b> — すべての <code>&lt;artifact&gt;</code> がクリーンな srcdoc iframe でレンダリングされます。ファイルワークスペースでその場編集可能。HTML / PDF / ZIP でダウンロード。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72 種 Design System ライブラリ" /><br/>
<sub><b>72 種 Design System ライブラリ</b> — 各プロダクトシステムが 4 色のカラーカードを表示。クリックで完全な <code>DESIGN.md</code>、スウォッチグリッド、ライブショーケースを閲覧。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · 雑誌風デッキ" /><br/>
<sub><b>Deck モード（guizang-ppt）</b> — 同梱の <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> をそのまま統合。雑誌レイアウト、WebGL hero 背景、単一ファイル HTML 出力、PDF エクスポート対応。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · モバイルプロトタイプ" /><br/>
<sub><b>モバイルプロトタイプ</b> — ピクセル単位で正確な iPhone 15 Pro クローム（Dynamic Island、ステータスバー SVG、ホームインジケータ）。マルチスクリーンプロトタイプは <code>/frames/</code> の共有アセットを再利用するため、エージェントが端末を描き直す必要は一切ありません。</sub>
</td>
</tr>
</table>

## 組み込み Skill

**31 個の Skill が同梱されています。** 各 Skill は [`skills/`](skills/) 配下のフォルダで、Claude Code の [`SKILL.md`][skill] 規約に従いつつ、daemon がそのままパースする OD 拡張 `od:` frontmatter を持ちます — `mode`、`platform`、`scenario`、`preview.type`、`design_system.requires`、`default_for`、`featured`、`fidelity`、`speaker_notes`、`animations`、`example_prompt`（[`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)）。

2 つのトップレベル **mode** がカタログを構成します：**`prototype`**（27 個 — 雑誌風ランディングからモバイル画面、PM 仕様書まで、単一ページ artifact としてレンダリングされるすべて）と **`deck`**（4 個 — デッキフレームワーク付きの横スワイプ型プレゼンテーション）。**`scenario`** フィールドがピッカーのグループ化に使われます：`design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`。

### ショーケース

ビジュアル的に最も特徴的で、最初に試す Skill として最適なものです。各 Skill には実際の `example.html` が付属しており、リポジトリから直接開いてエージェントの出力を確認できます — 認証もセットアップも不要。

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>コンシューマー向けマッチングダッシュボード — 左サイドバー、ティッカーバー、KPI、30 日間の相互マッチチャート、エディトリアルタイポグラフィ。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>2 見開きのデジタル e-guide — 表紙（タイトル、著者、TOC ティーザー）+ レッスン見開き（プルクオート + ステップリスト）。クリエイター / ライフスタイルトーン。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>ブランド新製品発売 HTML メール — ワードマーク、hero 画像、見出しロックアップ、CTA、スペックグリッド。中央揃え単一カラム + テーブルフォールバックでメールクライアント安全。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>ダークステージ上の 3 画面ゲーミフィケーションモバイルアプリプロトタイプ — カバー / 今日のクエスト（XP リボン + レベルバー）/ クエスト詳細。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>3 画面モバイルオンボーディングフロー — スプラッシュ、バリュープロポジション、サインイン。ステータスバー、スワイプドット、プライマリ CTA。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>ループ CSS アニメーション付きの単一フレームモーションデザイン hero — 回転タイプリング、地球、タイマー。HyperFrames 等へのハンドオフ対応。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>1080×1080 の 3 枚 SNS カルーセル — シネマティックなパネル、シリーズを横断する大見出し、ブランドマーク、ループインジケータ。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>ピクセル / 8-bit アニメーション解説スライド — クリーム地フルブリード、アニメーションピクセルマスコット、キネティックな日本語ディスプレイタイプ、ループ CSS keyframes。</sub>
</td>
</tr>
</table>

### デザイン & マーケティング系（prototype モード）

| Skill | プラットフォーム | シナリオ | 出力 |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | デスクトップ | design | 単一ページ HTML — ランディング、マーケティング、hero（prototype のデフォルト） |
| [`saas-landing`](skills/saas-landing/) | デスクトップ | marketing | hero / features / pricing / CTA マーケティングレイアウト |
| [`dashboard`](skills/dashboard/) | デスクトップ | operation | サイドバー + データ密度の高い管理画面 |
| [`pricing-page`](skills/pricing-page/) | デスクトップ | sale | 単独料金ページ + 比較表 |
| [`docs-page`](skills/docs-page/) | デスクトップ | engineering | 3 カラムドキュメントレイアウト |
| [`blog-post`](skills/blog-post/) | デスクトップ | marketing | エディトリアル長文 |
| [`mobile-app`](skills/mobile-app/) | モバイル | design | iPhone 15 Pro / Pixel フレーム付きアプリ画面 |
| [`mobile-onboarding`](skills/mobile-onboarding/) | モバイル | design | マルチスクリーンモバイルオンボーディング（スプラッシュ · バリュープロポジション · サインイン） |
| [`gamified-app`](skills/gamified-app/) | モバイル | personal | 3 画面ゲーミフィケーションアプリプロトタイプ |
| [`email-marketing`](skills/email-marketing/) | デスクトップ | marketing | ブランド新製品発売メール（テーブルフォールバック対応） |
| [`social-carousel`](skills/social-carousel/) | デスクトップ | marketing | 1080×1080 3 枚 SNS カルーセル |
| [`magazine-poster`](skills/magazine-poster/) | デスクトップ | marketing | 単一ページ雑誌風ポスター |
| [`motion-frames`](skills/motion-frames/) | デスクトップ | marketing | CSS ループアニメーション付きモーション hero |
| [`sprite-animation`](skills/sprite-animation/) | デスクトップ | marketing | ピクセル / 8-bit アニメーション解説 |
| [`dating-web`](skills/dating-web/) | デスクトップ | personal | コンシューマー向けマッチングダッシュボード |
| [`digital-eguide`](skills/digital-eguide/) | デスクトップ | marketing | 2 見開きデジタル e-guide（表紙 + レッスン見開き） |
| [`wireframe-sketch`](skills/wireframe-sketch/) | デスクトップ | design | 手描きスケッチ風ワイヤーフレーム — 「まず目に見えるものを早く出す」初期パス |
| [`critique`](skills/critique/) | デスクトップ | design | 五次元セルフ評価スコアシート（Philosophy · Hierarchy · Detail · Function · Innovation） |
| [`tweaks`](skills/tweaks/) | デスクトップ | design | AI が出力する tweaks パネル — モデル自身が調整すべきパラメータを提示 |

### Deck 系（deck モード）

| Skill | デフォルト | 出力 |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **deck のデフォルト** | 雑誌風 Web PPT — [op7418/guizang-ppt-skill][guizang] からそのまま同梱、元の LICENSE 保持 |
| [`simple-deck`](skills/simple-deck/) | — | ミニマル横スワイプデッキ |
| [`replit-deck`](skills/replit-deck/) | — | プロダクトウォークスルーデッキ（Replit スタイル） |
| [`weekly-update`](skills/weekly-update/) | — | チーム週次報告デッキ（進捗 · ブロッカー · 次のステップ） |

### ドキュメント & 業務系（prototype モード、ドキュメント系シナリオ）

| Skill | シナリオ | 出力 |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | PM 仕様書 + 目次 + 意思決定ログ |
| [`team-okrs`](skills/team-okrs/) | product | OKR スコアシート |
| [`meeting-notes`](skills/meeting-notes/) | operation | 会議議事録 |
| [`kanban-board`](skills/kanban-board/) | operation | カンバンボードスナップショット |
| [`eng-runbook`](skills/eng-runbook/) | engineering | インシデント Runbook |
| [`finance-report`](skills/finance-report/) | finance | 経営層向け財務サマリー |
| [`invoice`](skills/invoice/) | finance | 単一ページ請求書 |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | 職位オンボーディング計画 |

Skill の追加はフォルダ 1 つで完了します。拡張 frontmatter の詳細は [`docs/skills-protocol.md`](docs/skills-protocol.md) を参照し、既存の Skill を fork して daemon を再起動すればピッカーに表示されます。カタログエンドポイントは `GET /api/skills`、個別 Skill の seed 組み立て（テンプレート + 副ファイル）は `GET /api/skills/:id/example` です。

## 6 つの基本設計思想

### 1 · エージェントは同梱しない — あなたのもので十分

Daemon は起動時に `PATH` を走査し、[`claude`](https://docs.anthropic.com/en/docs/claude-code)、[`codex`](https://github.com/openai/codex)、[`cursor-agent`](https://www.cursor.com/cli)、[`gemini`](https://github.com/google-gemini/gemini-cli)、[`opencode`](https://opencode.ai/)、[`qwen`](https://github.com/QwenLM/qwen-code)、`qodercli`、[`copilot`](https://github.com/features/copilot/cli)、`hermes`、`kimi`、[`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) を検索します。見つかったものすべてが候補デザインエンジンになります — stdio 経由で CLI ごとに 1 つの adapter を持ち、モデルピッカーからワンクリックで切り替え可能。[`multica`](https://github.com/multica-ai/multica) と [`cc-switch`](https://github.com/farion1231/cc-switch) に着想を得ています。CLI が 1 つもない？`POST /api/proxy/stream` が spawn を除いた同じパイプラインです — 任意の OpenAI 互換 `baseUrl` + `apiKey` を貼れば、daemon が SSE チャンクをブラウザに転送し、loopback / link-local / RFC1918 はエッジで拒否されます。

### 2 · Skill はファイルであり、プラグインではない

Claude Code の [`SKILL.md` 規約](https://docs.anthropic.com/en/docs/claude-code/skills)に従い、各 Skill は `SKILL.md` + `assets/` + `references/` です。[`skills/`](skills/) にフォルダを入れて daemon を再起動すれば、ピッカーに表示されます。同梱の `magazine-web-ppt` は [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) を**そのまま**同梱 — 元の LICENSE 保持、元の帰属表示保持。

### 3 · Design System は移植可能な Markdown であり、theme JSON ではない

[`VoltAgent/awesome-design-md`][acd2] の 9 セクション `DESIGN.md` スキーマ — color、typography、spacing、layout、components、motion、voice、brand、anti-patterns。すべての artifact はアクティブなシステムからトークンを読み取ります。システムを切り替えれば、次のレンダリングは新しいトークンを使用します。ドロップダウンには **Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Apple、Anthropic、Cursor、Supabase、Figma、Resend、Raycast、Lovable、Cohere、Mistral、ElevenLabs、X.AI、Spotify、Webflow、Sanity、PostHog、Sentry、MongoDB、ClickHouse、Cal、Replicate、Clay、Composio、小紅書…** — 全 72 種が揃っています。

### 4 · 初期化質問フォームが手戻りの 80% を解消

OD のプロンプトスタックは `RULE 1` をハードコードしています：新しいデザイン要件はすべて `<question-form id="discovery">` で始まり、**コードではありません**。Surface · ターゲット · トーン · ブランドコンテキスト · 規模 · 制約。長い要件でもデザイン上の判断は残ります — ビジュアルトーン、カラースタンス、スケール — まさにフォームが 30 秒のラジオ選択で確定させるポイントです。方向を間違えたコストは 1 往復のチャットであり、完成済みのデッキではありません。

これは [`huashu-design`](https://github.com/alchaincyf/huashu-design) から蒸留された **Junior-Designer モード**です：着手前に質問を一括で済ませ、早い段階で何か目に見えるもの（グレーブロックのワイヤーフレームでも可）を提示し、ユーザーが最小コストで軌道修正できるようにします。ブランドアセットプロトコル（特定 · ダウンロード · `grep` hex · `brand-spec.md` 作成 · 復唱）と組み合わせることで、出力が「AI のフリースタイル」から「資料を見てから描くデザイナー」に変わる最大の要因です。

### 5 · Daemon がエージェントをあなたのノートパソコン上に感じさせる — 実際にそこにいるから

Daemon は CLI を spawn する際、`cwd` を `.od/projects/<id>/` 配下のプロジェクト artifact フォルダに設定します。エージェントが使う `Read` / `Write` / `Bash` / `WebFetch` は実際のファイルシステムに作用する本物のツールです。Skill の `assets/template.html` を `Read` し、CSS から `grep` で hex 値を取得し、`brand-spec.md` を作成し、生成画像を配置し、`.pptx` / `.zip` / `.pdf` を出力できます — これらのファイルはターン終了時にファイルワークスペース上のダウンロードチップとして表示されます。セッション、会話、メッセージ、タブはすべてローカル SQLite に永続化されます — 翌日プロジェクトを開けば、エージェントの todo カードは昨日閉じた場所にそのまま残っています。

### 6 · プロンプトスタック自体がプロダクト

送信時に組み立てられるのは「system + user」ではありません。以下の構成です：

```
DISCOVERY ディレクティブ     （turn-1 フォーム、turn-2 ブランド分岐、TodoWrite、五次元評価）
  + アイデンティティ憲章      （OFFICIAL_DESIGNER_PROMPT、anti-AI-slop、Junior Designer モード）
  + アクティブな DESIGN.md    （72 種から選択）
  + アクティブな SKILL.md     （31 個から選択）
  + プロジェクトメタデータ     （kind、fidelity、speakerNotes、animations、インスピレーション system id）
  + Skill 副ファイル         （自動注入 pre-flight：assets/template.html + references/*.md を先読み）
  + （deck kind かつ Skill seed なし時） DECK_FRAMEWORK_DIRECTIVE   （nav / counter / scroll / print）
```

すべてのレイヤーが組み合わせ可能で、すべてのレイヤーが編集可能なファイルです。実際の契約は [`apps/daemon/src/prompts/system.ts`](apps/daemon/src/prompts/system.ts) と [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) で確認できます。

## アーキテクチャ

```
┌───────────────── ブラウザ（Next.js 16）─────────────────────────┐
│  chat · ファイルワークスペース · iframe プレビュー · 設定 · インポート │
└──────────────┬──────────────────────────────────┬──────────────┘
               │ /api/*（dev は rewrites 経由）     │
               ▼                                   ▼
   ┌──────────────────────────────────┐  /api/proxy/stream (SSE)
   │  ローカル daemon（Express + SQLite）│  ─→ 任意の OpenAI 互換
   │                                   │      エンドポイント（BYOK）
   │  /api/agents         /api/skills  │      SSRF 防御付き
   │  /api/design-systems /api/projects/…
   │  /api/chat (SSE)     /api/proxy/stream (SSE)
   │  /api/templates      /api/import/claude-design
   │  /api/artifacts/save /api/artifacts/lint
   │  /api/upload         /api/projects/:id/files…
   │  /artifacts (静的)   /frames (静的)
   │
   │  オプション sidecar IPC：/tmp/open-design/ipc/<ns>/<app>.sock
   │  （STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN）
   └─────────┬───────────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · gemini · opencode · cursor-agent · qwen        │
   │  qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC)                  │
   │  SKILL.md + DESIGN.md を読み、artifact をディスクに書き出す         │
   └──────────────────────────────────────────────────────────────────┘
```

| レイヤー | 技術スタック |
|---|---|
| フロントエンド | Next.js 16 App Router + React 18 + TypeScript、Vercel デプロイ可能 |
| Daemon | Node 24 · Express · SSE ストリーミング · `better-sqlite3`；テーブル：`projects` · `conversations` · `messages` · `tabs` · `templates` |
| エージェント転送 | `child_process.spawn`；Claude Code は `claude-stream-json`、Qoder CLI は `qoder-stream-json`、Copilot は `copilot-stream-json`、Codex / Gemini / OpenCode / Cursor Agent は `json-event-stream`（CLI ごとのパーサー）、Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe は `acp-json-rpc`（Agent Client Protocol）、Pi は `pi-rpc`（stdio JSON-RPC）、Qwen Code / DeepSeek TUI は `plain` |
| BYOK プロキシ | `POST /api/proxy/stream` → OpenAI 互換 `/v1/chat/completions` SSE パススルー；daemon エッジで loopback / link-local / RFC1918 を拒否 |
| ストレージ | プレーンファイル `.od/projects/<id>/` + SQLite `.od/app.sqlite`（gitignore 済み、daemon 起動時に自動作成）。`OD_DATA_DIR` でルートを変更可能（テスト分離用） |
| プレビュー | サンドボックス iframe（`srcdoc`）+ Skill ごとの `<artifact>` パーサー（[`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)） |
| エクスポート | HTML（インラインアセット）· PDF（ブラウザ印刷、デッキ対応）· PPTX（エージェント駆動、Skill 経由）· ZIP（archiver）· Markdown |
| ライフサイクル | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`；ポートは `--daemon-port` / `--web-port`、ネームスペースは `--namespace` |
| デスクトップ（オプション） | Electron シェル — sidecar IPC 経由で Web URL を取得、ポート推測なし；同じチャネル（`STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN`）で `tools-dev inspect desktop …` を駆動し E2E 対応 |

## クイックスタート

### デスクトップアプリのダウンロード（ビルド不要）

Open Design を最速で試す方法は、ビルド済みのデスクトップアプリです — Node、pnpm、clone は不要：

- **[open-design.ai](https://open-design.ai/)** — 公式ダウンロードページ
- **[GitHub リリース](https://github.com/nexu-io/open-design/releases)**

### ソースから実行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 10.33.2 と表示されるはず
pnpm install
pnpm tools-dev run web
# tools-dev が出力した Web URL を開く
```

環境要件：Node `~24`、pnpm `10.33.x`。`nvm` / `fnm` はあくまでオプションのヘルパーです。使用する場合は `pnpm install` の前に `nvm install 24 && nvm use 24` または `fnm install 24 && fnm use 24` を実行してください。

デスクトップ / バックグラウンド起動、固定ポート再起動、メディア生成ディスパッチャの確認（`OD_BIN`、`OD_DAEMON_URL`、`apps/daemon/dist/cli.js`）は [`QUICKSTART.ja-JP.md`](QUICKSTART.ja-JP.md) を参照。

初回ロード時：

1. `PATH` 上のエージェント CLI を検出し、自動的に 1 つを選択。
2. 31 個の Skill + 72 種の Design System をロード。
3. ウェルカムダイアログが表示され、Anthropic キーの貼り付けを促す（BYOK フォールバックパスのみ必要）。
4. **`./.od/` を自動作成** — SQLite プロジェクト DB、プロジェクトごとの artifact、保存されたレンダリングを格納するローカルランタイムフォルダ。`od init` ステップは不要、daemon が起動時に必要なディレクトリをすべて `mkdir` します。

プロンプトを入力し、**Send** を押し、質問フォームの到着を確認、記入し、todo カードのストリーミングを見守り、artifact のレンダリングを確認。**Save to disk** をクリックするか、プロジェクト ZIP としてダウンロード。

### 初回起動時の状態（`./.od/`）

Daemon はリポジトリルートに 1 つの隠しフォルダを管理します。中身はすべて gitignore 済みのマシンローカルデータです — **絶対に commit しないでください**。

```
.od/
├── app.sqlite                 ← プロジェクト · 会話 · メッセージ · 開いているタブ
├── artifacts/                 ← Save to disk の一回限りレンダリング（タイムスタンプ付き）
└── projects/<id>/             ← プロジェクトごとの作業ディレクトリ（エージェントの cwd）
```

| やりたいこと | 方法 |
|---|---|
| 中身を確認する | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| 完全にリセット | `pnpm tools-dev stop` → `rm -rf .od` → `pnpm tools-dev run web` を再実行 |
| 別の場所に移動 | 未対応 — パスはリポジトリルートからの相対パスで固定 |

完全なファイルマップ、スクリプト、トラブルシューティング → [`QUICKSTART.ja-JP.md`](QUICKSTART.ja-JP.md)。

## リポジトリ構成

```
open-design/
├── README.md                      ← 英語
├── README.zh-CN.md                ← 简体中文
├── README.ja-JP.md                ← 本ファイル
├── QUICKSTART.md                  ← 実行 / ビルド / デプロイガイド
├── package.json                   ← 単一 bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express、唯一のサーバー
│   │   ├── src/                   ← TypeScript daemon ソース
│   │   │   ├── cli.ts             ← `od` bin ソース、dist/cli.js にコンパイル
│   │   │   ├── server.ts          ← /api/* ルート（projects、chat、files、exports）
│   │   │   ├── agents.ts          ← PATH スキャナ + CLI ごとの argv ビルダー
│   │   │   ├── claude-stream.ts   ← Claude Code stdout ストリーミング JSON パーサー
│   │   │   ├── skills.ts          ← SKILL.md frontmatter ローダー
│   │   │   └── db.ts              ← SQLite スキーマ（projects/messages/templates/tabs）
│   │   ├── sidecar/               ← tools-dev daemon sidecar ラッパー
│   │   └── tests/                 ← daemon パッケージテスト
│   │
│   └── web/                       ← Next.js 16 App Router + React クライアント
│       ├── app/                   ← App Router エントリポイント
│       ├── next.config.ts         ← dev rewrites + 本番 out/ 静的エクスポート
│       └── src/                   ← React + TS クライアントモジュール
│           ├── App.tsx            ← ルーティング、ブートストラップ、設定
│           ├── components/        ← chat、composer、picker、preview、sketch…
│           ├── prompts/           ← system、discovery、directions、deck framework
│           ├── artifacts/         ← ストリーミング <artifact> パーサー + マニフェスト
│           ├── runtime/           ← iframe srcdoc、markdown、エクスポートヘルパー
│           ├── providers/         ← daemon SSE + BYOK API トランスポート
│           └── state/             ← localStorage + daemon バックドプロジェクト状態
│
├── e2e/                           ← Playwright UI + 外部統合/Vitest ハーネス
│
├── packages/
│   ├── contracts/                 ← web/daemon 共有アプリ contracts
│   ├── sidecar-proto/             ← Open Design sidecar プロトコル contract
│   ├── sidecar/                   ← 汎用 sidecar ランタイムプリミティブ
│   └── platform/                  ← 汎用 process/platform プリミティブ
│
├── skills/                        ← 31 個の SKILL.md Skill バンドル（27 prototype + 4 deck）
│   ├── web-prototype/             ← prototype のデフォルト
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← deck モード
│   └── guizang-ppt/               ← 同梱 magazine-web-ppt（deck のデフォルト）
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72 種の DESIGN.md
│   ├── default/                   ← Neutral Modern（スターター）
│   ├── warm-editorial/            ← Warm Editorial（スターター）
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md
│
├── assets/
│   └── frames/                    ← Skill 間共有のデバイスフレーム
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   └── deck-framework.html        ← デッキベースライン（nav / counter / print）
│
├── scripts/
│   └── sync-design-systems.ts     ← 上流 awesome-design-md tarball からの再インポート
│
├── docs/
│   ├── spec.md                    ← プロダクト定義、シナリオ、差別化
│   ├── architecture.md            ← トポロジ、データフロー、コンポーネント
│   ├── skills-protocol.md         ← SKILL.md 拡張 od: frontmatter
│   ├── agent-adapters.md          ← CLI ごとの検出 + ディスパッチ
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← 詳細な出典・系譜
│   ├── roadmap.md                 ← フェーズ別デリバリー
│   ├── schemas/                   ← JSON スキーマ
│   └── examples/                  ← 標準 artifact サンプル
│
└── .od/                           ← ランタイムデータ、gitignore 済み、daemon 起動時に自動作成
    ├── app.sqlite                 ← プロジェクト / 会話 / メッセージ / タブ
    ├── projects/<id>/             ← プロジェクトごとの作業ディレクトリ（エージェントの cwd）
    └── artifacts/                 ← 一回限りのレンダリング保存
```

## Design System

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="72 種の Design System ライブラリ — スタイルガイド見開き" width="100%" />
</p>

72 種がすぐ使えます。各システムは 1 つの [`DESIGN.md`](design-systems/README.md)：

<details>
<summary><b>全カタログ</b>（クリックで展開）</summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**開発者ツール** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**プロダクティビティ** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**フィンテック** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E コマース / モビリティ** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**メディア** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**自動車** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**その他** — `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**スターター** — `default`（Neutral Modern）· `warm-editorial`

</details>

ライブラリ全体は [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) を通じて [`VoltAgent/awesome-design-md`][acd2] からインポートされています。再実行で更新可能。

## ビジュアルディレクション

ユーザーにブランドアセットがない場合、エージェントは 5 つの厳選ディレクションを提示する 2 つ目のフォームを出力します — [`huashu-design` の「デザインディレクション顧問 · 5 流派 × 20 のデザイン哲学」フォールバック](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback)を OD に適用したものです。各ディレクションは決定論的な仕様です — OKLch パレット、フォントスタック、レイアウトポスチャのヒント、リファレンス — エージェントはこれを seed テンプレートの `:root` にそのままバインドします。ラジオを 1 つクリックすれば、完全なビジュアルシステムが確定します。即興なし、AI slop なし。

| ディレクション | ムード | リファレンス |
|---|---|---|
| Editorial — Monocle / FT | 印刷雑誌、インク + クリーム + ウォームラスト | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | クール、構造的、ミニマルアクセント | Linear · Vercel · Stripe |
| Tech utility | 情報密度、モノスペース、ターミナル風 | Bloomberg · Bauhaus ツール |
| Brutalist | 生々しい、巨大タイプ、シャドウなし、鮮烈なアクセント | Bloomberg Businessweek · Achtung |
| Soft warm | おおらか、低コントラスト、ピーチ系ニュートラル | Notion マーケティングページ · Apple Health |

完全な仕様 → [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)。

## メディア生成

OD はコードで止まりません。`<artifact>` の HTML を生み出すのと同じ chat 入口が、**画像**・**動画**・**音声**の生成も駆動します — モデル adapter は daemon のメディアパイプライン（[`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts)、[`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)）に組み込み済みです。各レンダリングはプロジェクトワークスペースに実ファイル（`.png` / `.mp4`）として落ち、ターン終了時にダウンロード chip として現れます。

主力は今のところこの 3 つのモデルファミリーです：

| サーフェス | モデル | 提供元 | 用途 |
|---|---|---|---|
| **画像** | `gpt-image-2` | Azure / OpenAI | ポスター、プロフィールアバター、イラスト都市マップ、インフォグラフィック、雑誌風ソーシャルカード、写真修復、製品爆発図 |
| **動画** | `seedance-2.0` | ByteDance Volcengine | 15 秒のシネマティック t2v + i2v + 音声 — 物語ショート、人物クローズアップ、プロダクト映像、MV 振付 |
| **動画** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 モーショングラフィック — プロダクトリビール、キネティックタイポグラフィ、データチャート、ソーシャルオーバーレイ、ロゴアウトロ、カラオケキャプション付き縦型 TikTok |

成長中の **prompt ギャラリー** は [`prompt-templates/`](prompt-templates/) — **93 件のすぐ複製できる prompt** が同梱：43 件の画像（`prompt-templates/image/*.json`）、39 件の Seedance（`prompt-templates/video/*.json` のうち `hyperframes-*` 以外）、11 件の HyperFrames（`prompt-templates/video/hyperframes-*.json`）。各エントリにプレビュー画像、prompt 本文、対象モデル、アスペクト比、ライセンス + 帰属を記録した `source` ブロックが付きます。daemon は `GET /api/prompt-templates` で配信し、Web アプリはエントリビューの **Image templates** / **Video templates** タブにカードグリッドとして表示。1 クリックで対応モデルが選択された状態の prompt が composer に流し込まれます。

### gpt-image-2 — 画像ギャラリー（43 件中 5 件）

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D Stone Staircase Evolution Infographic</b><br/>3 段構成・石材調インフォグラフィック</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Illustrated City Food Map</b><br/>編集級の手描き旅行ポスター</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Cinematic Elevator Scene</b><br/>シネマティックなファッション 1 フレーム</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Cyberpunk Anime Portrait</b><br/>プロフィールアバター — ネオン顔字</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Glamorous Woman in Black Portrait</b><br/>編集級スタジオポートレート</sub></td>
</tr>
</table>

完全リスト → [`prompt-templates/image/`](prompt-templates/image/)。出典：多くは [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts)（CC-BY-4.0）から、テンプレート単位で作者帰属を保持。

### Seedance 2.0 — 動画ギャラリー（39 件中 5 件）

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Music Podcast & Guitar Technique</b><br/>4K シネマティックスタジオ映像</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Emotional Face Close-up</b><br/>シネマティック微表情研究</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Luxury Supercar Cinematic</b><br/>物語仕立てのプロダクト映像</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Forbidden City Cat Satire</b><br/>スタイライズされた風刺ショート</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Japanese Romance Short Film</b><br/>15 秒の Seedance 2.0 物語</sub></td>
</tr>
</table>

サムネイルをクリックすると実レンダリング MP4 が再生されます。完全リスト → [`prompt-templates/video/`](prompt-templates/video/)（`*-seedance-*` と Cinematic タグ付きエントリ）。出典：[`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts)（CC-BY-4.0）、原ツイートリンクと作者ハンドルを保持。

### HyperFrames — HTML→MP4 モーショングラフィック（11 件のすぐ複製できるテンプレート）

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) は HeyGen がオープンソース化したエージェントネイティブな動画フレームワークです — あなた（あるいは agent）が HTML + CSS + GSAP を書くと、HyperFrames は headless Chrome + FFmpeg で確定的に MP4 にレンダリングします。Open Design は HyperFrames を一級の動画モデル（`hyperframes-html`）として daemon dispatch に接続し、さらに `skills/hyperframes/` skill を同梱して timeline 規約・シーンタンスィション規則・オーディオリアクティブパターン・キャプション/TTS・カタログブロック（`npx hyperframes add <slug>`）を agent に教えます。

11 件の HyperFrames prompt は [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/) に置かれ、それぞれ特定アーキタイプを生む具体的な brief です：

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5s ミニマルなプロダクトリビール</b> · 16:9 · 押し込みタイトルカード + シェーダトランジション</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30s SaaS プロダクト動画</b> · 16:9 · Linear/ClickUp 風 + UI 3D リビール</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok カラオケトーキングヘッド</b> · 9:16 · TTS + 単語同期キャプション</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30s ブランド sizzle リール</b> · 16:9 · ビート同期キネティックタイポグラフィ、audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>アニメーション bar-chart race</b> · 16:9 · NYT 風データインフォグラフィック</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>フライトマップ（出発 → 到着）</b> · 16:9 · Apple 風シネマティック経路リビール</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4s シネマティックロゴアウトロ</b> · 16:9 · ピース単位のアセンブル + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K マネーカウンター</b> · 9:16 · Apple 風 hype + グリーンフラッシュ + バースト</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>3 端末アプリショーケース</b> · 16:9 · 浮遊スマホ + 機能コールアウト</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>ソーシャルオーバーレイスタック</b> · 9:16 · X · Reddit · Spotify · Instagram を順に</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>ウェブサイト→動画パイプライン</b> · 16:9 · 3 ビューポート取得 + トランジション</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

パターンは他と同じです：テンプレートを選び、brief を編集し、送信。Agent は同梱の `skills/hyperframes/SKILL.md`（OD 専用のレンダリングフロー — composition のソースファイルは `.hyperframes-cache/` に隔離してファイルワークスペースを汚さない、daemon が `npx hyperframes render` を肩代わりして macOS sandbox-exec / Puppeteer のハングを回避、最終 `.mp4` だけがプロジェクトの chip として現れる）を読み、composition を書き、MP4 を出力します。カタログブロックのサムネイルは © HeyGen で同社 CDN から配信、OSS フレームワーク本体は Apache-2.0 です。

> **接続済みだがまだ prompt 化していないモデル：** Kling 2.0 / 1.6 / 1.5、Veo 3 / Veo 2、Sora 2 / Sora 2-Pro（via Fal）、MiniMax video-01 — いずれも `VIDEO_MODELS`（[`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)）にあります。Suno v5 / v4.5、Udio v2、Lyria 2（音楽）と gpt-4o-mini-tts、MiniMax TTS（音声）が音声サーフェスをカバー。これらの prompt テンプレートはオープンコントリビューションです — JSON を `prompt-templates/video/` か `prompt-templates/audio/` に置けば picker に出ます。

## チャット以外に同梱されているもの

チャット / artifact ループが最も目立ちますが、OD を他と比較する前に把握しておく価値のある、目立たないが既に実装済みの機能がいくつかあります：

- **Claude Design ZIP インポート。** claude.ai からのエクスポート ZIP をウェルカムダイアログにドロップ。`POST /api/import/claude-design` が `.od/projects/<id>/` に展開し、エントリファイルをタブとして開き、ローカルエージェント向けに「Anthropic の中断箇所から編集を続行」するプロンプトを用意します。再プロンプティング不要、「モデルに作り直してもらう」必要なし。（[`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`）
- **OpenAI 互換 BYOK プロキシ。** `POST /api/proxy/stream` は `{ baseUrl, apiKey, model, messages }` を受け取り、パスを正規化（`…/v1/chat/completions`）、SSE チャンクをブラウザに転送、loopback / link-local / RFC1918 を拒否して SSRF を防御。OpenAI chat スキーマを話す任意のベンダーが使えます — Anthropic-via-OpenAI shim、DeepSeek、Groq、MiMo、OpenRouter、セルフホスト vLLM。MiMo は自動的に `tool_choice: 'none'` が付加されます（tool スキーマがフリーフォーム生成と相性が悪いため）。
- **ユーザー保存テンプレート。** レンダリング結果が気に入ったら、`POST /api/templates` で HTML + メタデータを SQLite `templates` テーブルにスナップショット。次のプロジェクトのピッカーに「あなたのテンプレート」行が追加されます — 同梱の 31 個と同じ選択画面で、ただしあなたのもの。
- **タブ永続化。** 各プロジェクトは開いているファイルとアクティブタブを `tabs` テーブルに記録。翌日開いてもワークスペースは昨日の状態そのまま。
- **Artifact lint API。** `POST /api/artifacts/lint` は生成された artifact に対して構造チェックを実行（`<artifact>` フレーミングの破損、必須副ファイルの欠落、古いパレットトークン）し、エージェントが次のターンで読み返せる findings を返します。五次元セルフ評価はこれを使ってスコアを vibes ではなくエビデンスに基づかせます。
- **Sidecar プロトコル + デスクトップ自動化。** Daemon、web、desktop プロセスは型付き 5 フィールドスタンプ（`app · mode · namespace · ipc · source`）を持ち、`/tmp/open-design/ipc/<namespace>/<app>.sock` に JSON-RPC IPC チャネルを公開。`tools-dev inspect desktop status \| eval \| screenshot` はこのチャネル上で動作するため、ヘッドレス E2E テストが実際の Electron シェルに対して、カスタムハーネスなしで実行可能（[`packages/sidecar-proto/`](packages/sidecar-proto/)、[`apps/desktop/src/main/`](apps/desktop/src/main/)）。
- **Windows フレンドリーな spawn。** 長いプロンプトで `CreateProcess` の約 32 KB argv 上限に達する adapter（Codex、Gemini、OpenCode、Cursor Agent、Qwen、Qoder CLI、Pi）はすべて stdin 経由でプロンプトを渡します。Claude Code と Copilot は `-p` を維持。stdin でも溢れる場合、daemon は一時 prompt ファイルにフォールバック。
- **ネームスペースごとのランタイムデータ分離。** `OD_DATA_DIR` + `--namespace` で完全に分離された `.od/` スタイルのディレクトリツリーを提供。Playwright、beta チャネル、本番プロジェクトが同一 SQLite ファイルを共有することはありません。

## anti-AI-slop 機構

以下の機構はすべて [`huashu-design`](https://github.com/alchaincyf/huashu-design) のプレイブックを OD のプロンプトスタックに移植し、Skill 副ファイルの pre-flight で各 Skill に適用可能にしたものです。実際の文言は [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) を参照：

- **まずフォーム。** Turn 1 は `<question-form>` のみ — thinking 禁止、tools 禁止、ナレーション禁止。ユーザーはラジオの速度でデフォルトを選択。
- **ブランドアセットプロトコル。** ユーザーがスクリーンショットや URL を添付した場合、エージェントは 5 ステップのプロトコル（特定 · ダウンロード · grep hex · `brand-spec.md` 作成 · 復唱）を実行してから CSS を書きます。**記憶からブランドカラーを推測することは絶対にありません。**
- **五次元評価。** `<artifact>` を出力する前に、エージェントはサイレントに 5 次元（哲学 / 階層 / 実行 / 具体性 / 抑制）で 1–5 点の自己評価を行います。いずれかが 3/5 未満なら退行と見なし、修正して再評価。2 パスが通常。
- **P0/P1/P2 チェックリスト。** 各 Skill には `references/checklist.md` が付属し、ハードな P0 ゲートを含みます。エージェントは P0 をすべてパスしてから emit 可能。
- **Slop ブラックリスト。** 攻撃的な紫グラデーション、汎用 emoji アイコン、左ボーダー付き角丸カード、手描き SVG 人物、Inter を *display* フォントとして使用、架空のメトリクス — すべてプロンプトで明示的に禁止。
- **正直なプレースホルダー > 偽データ。** エージェントが実数値を持たない場合は `—` またはラベル付きグレーブロックを書き、「10 倍高速」とは書きません。

## 比較

| 軸 | [Claude Design][cd]（Anthropic） | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| ライセンス | クローズド | MIT | **Apache-2.0** |
| 形態 | Web (claude.ai) | デスクトップ (Electron) | **Web アプリ + ローカル daemon** |
| Vercel デプロイ | ❌ | ❌ | **✅** |
| エージェントランタイム | 同梱 (Opus 4.7) | 同梱 ([`pi-ai`][piai]) | **ユーザーの既存 CLI に委任** |
| Skill | プロプライエタリ | 12 個のカスタム TS モジュール + `SKILL.md` | **31 個のファイルベース [`SKILL.md`][skill] バンドル、ドロップイン** |
| Design System | プロプライエタリ | `DESIGN.md`（v0.2 ロードマップ） | **`DESIGN.md` × 72 種、すぐに利用可能** |
| プロバイダ柔軟性 | Anthropic のみ | 7+（[`pi-ai`][piai]） | **11 種の CLI adapter + OpenAI 互換 BYOK プロキシ** |
| 初期化質問フォーム | ❌ | ❌ | **✅ ハードルール、turn 1** |
| ディレクションピッカー | ❌ | ❌ | **✅ 5 つの決定論的ディレクション** |
| ライブ todo 進捗 + tool ストリーム | ❌ | ✅ | **✅**（UX パターンは open-codesign 由来） |
| サンドボックス iframe プレビュー | ❌ | ✅ | **✅**（パターンは open-codesign 由来） |
| Claude Design ZIP インポート | n/a | ❌ | **✅ `POST /api/import/claude-design` — Anthropic の中断箇所から編集続行** |
| コメントモード精密編集 | ❌ | ✅ | 🚧 ロードマップ（open-codesign から移植予定） |
| AI 出力 tweaks パネル | ❌ | ✅ | 🟡 部分的 — [`tweaks` Skill](skills/tweaks/) は出荷済み、専用チャットサイドパネル UX はロードマップ |
| ファイルシステムレベルのワークスペース | ❌ | 部分的（Electron サンドボックス） | **✅ 実 cwd、実ツール、SQLite 永続化（projects · conversations · messages · tabs · templates）** |
| 五次元セルフ評価 | ❌ | ❌ | **✅ emit 前ゲート** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — findings をエージェントにフィードバック** |
| Sidecar IPC + ヘッドレスデスクトップ | ❌ | ❌ | **✅ スタンプ付きプロセス + `tools-dev inspect desktop status \| eval \| screenshot`** |
| エクスポート形式 | 限定的 | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX（エージェント駆動）/ ZIP / Markdown** |
| PPT Skill 再利用 | N/A | 組み込み | **[`guizang-ppt-skill`][guizang] がドロップイン（deck モードのデフォルト）** |
| 最低課金 | Pro / Max / Team | BYOK | **BYOK — 任意の OpenAI 互換 `baseUrl` を貼り付け** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 対応 Coding Agent

Daemon 起動時に `PATH` から自動検出。設定不要。ストリーミングディスパッチは [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) の `AGENT_DEFS` に、CLI ごとのパーサーも同ディレクトリにあります。モデルリストは `<bin> --list-models` / `<bin> models` / ACP ハンドシェイクのいずれかで取得するか、CLI がリスト機能を持たない場合は厳選フォールバックリストを使用。

| エージェント | バイナリ | ストリーム形式 | argv 形態（組み立て済みプロンプトパス） |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json`（型付きイベント） | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + `codex` パーサー | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]`（プロンプトは stdin） |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + `gemini` パーサー | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]`（プロンプトは stdin） |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + `opencode` パーサー | `opencode run --format json --dangerously-skip-permissions [--model …] -`（プロンプトは stdin） |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + `cursor-agent` パーサー | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -`（プロンプトは stdin） |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain`（生 stdout チャンク） | `qwen --yolo [--model …] -`（プロンプトは stdin） |
| Qoder CLI | `qodercli` | `qoder-stream-json`（型付きイベント） | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]`（プロンプトは stdin） |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json`（型付きイベント） | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc`（Agent Client Protocol） | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc`（stdio JSON-RPC） | `pi --mode rpc [--model …] [--thinking …]`（プロンプトは RPC `prompt` コマンドで送信） |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain`（生 stdout チャンク） | `deepseek exec --auto [--model …] <prompt>` |
| **OpenAI 互換 BYOK** | n/a | SSE パススルー | `POST /api/proxy/stream` → `<baseUrl>/v1/chat/completions`；loopback / link-local / RFC1918 を拒否 |

新しい CLI の追加 = [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) にエントリを 1 つ追加。ストリーム形式は `claude-stream-json` / `qoder-stream-json` / `copilot-stream-json` / `json-event-stream`（CLI ごとの `eventParser` 付き）/ `acp-json-rpc` / `pi-rpc` / `plain` から選択。

## 参考文献 & 系譜

本リポジトリが参考にしたすべての外部プロジェクト。各リンクからソースを確認できます。

| プロジェクト | 本リポジトリでの役割 |
|---|---|
| [`Claude Design`][cd] | 本リポジトリがオープンソース代替を提供するクローズドソースプロダクト。 |
| [**`alchaincyf/huashu-design`**（花叔の画術）](https://github.com/alchaincyf/huashu-design) | デザイン哲学のコア。Junior-Designer ワークフロー、5 ステップブランドアセットプロトコル、anti-AI-slop チェックリスト、五次元セルフ評価、ディレクションピッカーの背後にある「5 流派 × 20 のデザイン哲学」ライブラリ — すべて [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) と [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts) に蒸留。 |
| [**`op7418/guizang-ppt-skill`**（歸藏）][guizang] | Magazine-web-PPT Skill を [`skills/guizang-ppt/`](skills/guizang-ppt/) にそのまま同梱、元の LICENSE 保持。Deck モードのデフォルト。P0/P1/P2 チェックリスト文化を他のすべての Skill に波及。 |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + adapter アーキテクチャ。PATH スキャンによるエージェント検出、ローカル daemon を唯一の特権プロセスとする思想、agent-as-teammate の世界観。モデルを採用、コードは vendor せず。 |
| [**`OpenCoworkAI/open-codesign`**][ocod] | 初のオープンソース Claude-Design 代替、最も近い同類。採用済み UX パターン：ストリーミング artifact ループ、サンドボックス iframe プレビュー（React 18 + Babel 同梱）、ライブエージェントパネル（todo + tool calls + 中断可能）、5 種エクスポート形式リスト（HTML/PDF/PPTX/ZIP/Markdown）、ローカルファーストストレージハブ、`SKILL.md` テイスト注入。ロードマップ上の UX パターン：コメントモード精密編集、AI 出力 tweaks パネル。**[`pi-ai`][piai] は意図的に vendor していません** — open-codesign はそれをエージェントランタイムとして同梱していますが、私たちはユーザーの既存 CLI に委任します。 |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9 セクション `DESIGN.md` スキーマのソース。69 のプロダクトシステムが [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 経由でインポート。 |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | 複数エージェント CLI 間の symlink ベース Skill 配布のインスピレーション源。 |
| [Claude Code skills][skill] | `SKILL.md` 規約をそのまま採用 — 任意の Claude Code Skill を `skills/` に入れれば daemon が認識。 |

詳細な系譜（各プロジェクトから何を採用し、何を意図的に採用しなかったか）は [`docs/references.md`](docs/references.md) にあります。

## ロードマップ

- [x] Daemon + エージェント検出（11 種 CLI adapter）+ Skill レジストリ + Design System カタログ
- [x] Web アプリ + チャット + 質問フォーム + 5 つのディレクションピッカー + todo 進捗 + サンドボックスプレビュー
- [x] 31 個の Skill + 72 種の Design System + 5 つのビジュアルディレクション + 5 つのデバイスフレーム
- [x] SQLite バックドの projects · conversations · messages · tabs · templates
- [x] OpenAI 互換 BYOK プロキシ（`/api/proxy/stream`）SSRF 防御付き
- [x] Claude Design ZIP インポート（`/api/import/claude-design`）
- [x] Sidecar プロトコル + Electron デスクトップ + IPC 自動化（STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN）
- [x] Artifact lint API + 五次元セルフ評価 emit 前ゲート
- [ ] コメントモード精密編集（要素をクリック → 指示 → パッチ）— パターンは [`open-codesign`][ocod] から
- [ ] AI 出力 tweaks パネル UX — ビルディングブロック（[`tweaks` Skill](skills/tweaks/)）は出荷済み、チャット統合パネルは未完
- [ ] Vercel + トンネルデプロイレシピ（Topology B）
- [ ] ワンコマンド `npx od init` で `DESIGN.md` 付きプロジェクトをスキャフォールド
- [ ] Skill マーケットプレイス（`od skills install <github-repo>`）と `od skill add | list | remove | test` CLI サーフェス（[`docs/skills-protocol.md`](docs/skills-protocol.md) にドラフトあり、daemon 実装は未着手）
- [x] `apps/packaged/` からの配布可能 Electron ビルド — macOS（Apple Silicon）と Windows（x64）のダウンロードは [open-design.ai](https://open-design.ai/) および [GitHub リリースページ](https://github.com/nexu-io/open-design/releases) から

フェーズ別デリバリー計画 → [`docs/roadmap.md`](docs/roadmap.md)。

## プロジェクトの状態

これは初期実装です — クローズドループ（検出 → Skill + Design System を選択 → チャット → `<artifact>` をパース → プレビュー → 保存）はエンドツーエンドで動作しています。プロンプトスタックと Skill ライブラリが最も価値の大きい部分であり、安定しています。コンポーネントレベルの UI は日々更新中です。

## Star をお願いします

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Open Design に Star を — github.com/nexu-io/open-design" width="100%" /></a>
</p>

30 分の時間を節約できたなら、★ をお願いします。Star は家賃を払いませんが、次のデザイナー、エージェント、コントリビューターに「この実験は注目する価値がある」と伝えます。1 クリック、3 秒、リアルなシグナル：[github.com/nexu-io/open-design](https://github.com/nexu-io/open-design)。

## コントリビューション

Issue、PR、新 Skill、新 Design System を歓迎します。最も効果の高いコントリビューションは通常、フォルダ 1 つ、Markdown ファイル 1 つ、または PR サイズの adapter です：

- **Skill を追加** — [`skills/`](skills/) にフォルダをドロップし、[`SKILL.md`][skill] 規約に従う。
- **Design System を追加** — [`design-systems/<brand>/`](design-systems/) に 9 セクションスキーマの `DESIGN.md` をドロップ。
- **新しい coding-agent CLI を接続** — [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) にエントリを 1 つ追加。

完全なワークフロー、マージ基準、コードスタイル、受け入れない PR の種類 → [`CONTRIBUTING.ja-JP.md`](CONTRIBUTING.ja-JP.md)（[English](CONTRIBUTING.md) · [Deutsch](CONTRIBUTING.de.md) · [Français](CONTRIBUTING.fr.md) · [简体中文](CONTRIBUTING.zh-CN.md)）。

## コントリビューター

コード、ドキュメント、フィードバック、新 Skill、新 Design System、あるいは鋭い Issue — あらゆる形で Open Design を前進させてくださったすべての方に感謝します。すべての実質的なコントリビューションは大切であり、以下のウォールは最もシンプルな感謝の表明です。

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-15" alt="Open Design コントリビューター" />
</a>

初めての PR を送った方 — ようこそ。[`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) ラベルがエントリポイントです。

## リポジトリ活動

<picture>
  <img alt="Open Design リポジトリメトリクス" src="docs/assets/github-metrics.svg" />
</picture>

上記の SVG は [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) が [`lowlighter/metrics`](https://github.com/lowlighter/metrics) を使って毎日自動再生成しています。すぐに更新したい場合は **Actions** タブから手動トリガーしてください。より充実したプラグイン（traffic、follow-up time など）を有効にするには、リポジトリシークレットに細粒度 PAT を `METRICS_TOKEN` として追加してください。

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-15" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-15" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-15" />
  </picture>
</a>

カーブが上向きなら — それが私たちの求めるシグナルです。★ で後押ししてください。

## ライセンス

Apache-2.0。同梱の [`skills/guizang-ppt/`](skills/guizang-ppt/) は元の [LICENSE](skills/guizang-ppt/LICENSE)（MIT）と [op7418](https://github.com/op7418) の帰属表示を保持しています。
