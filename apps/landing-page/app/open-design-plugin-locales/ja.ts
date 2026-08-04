/* Open Design plugin page — complete Japanese localization. */
import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const ja: OpenDesignPluginCopy = {
  metadata: {
    title: 'Codex/ChatGPT 向け Open Design | Open Design Cloud プラグインをインストール',
    description:
      'Open Design Cloud を Codex/ChatGPT にインストールし、同じタスクの中で Web サイト、スライド、プロトタイプ、デザインシステムを制作できます。',
    keywords:
      'Open Design Codex プラグイン, ChatGPT デスクトッププラグイン, Codex プラグイン インストール, Open Design Cloud, Codex デザインプラグイン, Codex MCP',
  },
  hero: {
    title: 'Codex/ChatGPT 向け Open Design プラグイン',
    leadBefore: '以下の指示を、お使いの',
    chatgptLabel: 'ChatGPT デスクトップアプリの任意のタスクに入力してください',
    installAria: 'Open Design Cloud を Codex/ChatGPT にインストール',
    copy: 'コピー',
    github: 'GitHub でソースを見る ↗',
  },
  agentInstall: {
    howToName: 'Codex に Open Design プラグインをインストール',
    howToDescription:
      'Open Design の Codex プラグインをインストールし、ローカル MCP を登録するためにエージェントが実行できる手順です。',
    eyebrow: 'エージェントが読み取れるインストールプロトコル',
    title: 'Codex プラグインを完全にインストールする。',
    intro:
      'ユーザーから Open Design のインストールを依頼された場合は、このプロトコルを順番に実行してください。この依頼で許可されているのは、ユーザーの Codex プラグインと MCP 設定の変更に限られます。関係のないマーケットプレイス、プラグイン、MCP サーバー、認証状態はそのまま保持してください。',
    downloadLabel: 'Open Design 公式ダウンロードページ ↗',
    steps: [
      {
        title: '対応環境を事前確認する',
        body:
          'release-manifest.json から plugin.minimumCodexCliVersion と plugin.minimumOpenDesignVersion を読み取ってください。設定を変更する前に、両方の最小要件を満たしていることを確認してください。Open Design のランタイムバージョンとして受け入れてよいのは、プローブした Open Design CLI が報告した値、またはコード署名と Gatekeeper のチェックに合格した署名済み macOS アプリバンドル内の CFBundleShortVersionString の値だけです。od が見つからない場合、PATH 上でシャドーイングされている場合（/usr/bin/od を含む）、またはデーモンが停止している場合は、署名済みバンドルのプローブに切り替えてください。いずれの検証済みプローブも利用できない場合は、設定を変更する前に停止し、Open Design Settings → MCP server でクライアント専用の絶対パススニペットをコピーするようユーザーに案内してから、再試行してください。公式ダウンロードページへ案内するのは、アプリが存在しないか古すぎる場合だけにしてください。インストーラーを無断でダウンロードしたり、未検証のスクリプトを実行したりしないでください。',
      },
      {
        title: '設定を変更する前に確認する',
        body:
          'release-manifest.json から必須のセレクターとバージョンを読み取り、確認した Codex の状態と比較してください。codex mcp list --json から生成したフィルタ済みの MCP スナップショットだけを使って、MCP の状態を確認してください。出力するのは name、enabled、transport.type、command だけとし、args、env、env_vars、headers、token の各フィールドは出力前に破棄してください。open-design の結果がないことは想定内であり、致命的なエラーではありません。トランスポートの値に認証情報が含まれる可能性があるため、未加工のリストや codex mcp get open-design --json の出力を表示したり報告したりしないでください。open-design というマーケットプレイス名が別のソースを指している場合は停止し、競合を報告してください。open-design@open-design は、インストール済みのバージョンが release-manifest.json で宣言されているバージョンと一致する場合にのみ保持してください。',
      },
      {
        title: '不足しているコンポーネントだけをインストールする',
        body:
          '正規のマーケットプレイスが存在しない場合にのみ、マーケットプレイスコマンドを実行してください。open-design@open-design が存在しない場合は、プラグインコマンドを実行してください。異なるバージョンがインストールされている場合は、更新または再インストールの前にユーザーへ確認を求めてください。必要なバージョンと完全に一致する場合にのみインストールをスキップしてください。alreadyAdded: true という結果は成功です。Codex の設定を手作業で編集したり、Codex のホームディレクトリへプラグインファイルをコピーしたりしないでください。',
      },
      {
        title: 'ローカルの Open Design MCP を確実に用意する',
        body:
          'すでに有効な open-design MCP がある場合は、そのまま保持してください。それ以外の場合は、インストール済みの Open Design アプリケーションに付属する MCP インストーラーを実行してください。POSIX システムでは、解決済みの od パスに対するプローブが open-design-cli:mcp-install:v1 を返した場合にのみ、そのパスを実行してください。そのパスが存在しない場合、/usr/bin/od によってシャドーイングされている場合、または実行を完了できない場合は、検証済みの署名済み macOS アプリバンドルに対して /usr/bin/open と --headless --mcp-install codex を使用し、その後はフィルタ済みの MCP スナップショットだけをポーリングしてください。検証済みの起動手段を利用できない場合は停止し、Open Design Settings → MCP server でクライアント専用の絶対パススニペットをコピーするようユーザーに案内してから、この手順を再試行してください。localhost のポートを推測したり、codex mcp login を実行したりしないでください。Vela へのログインは Open Design で行います。',
      },
      {
        title: '確認、報告を行い、新しいタスクを開始する',
        body:
          'プラグイン ID open-design@open-design を検証し、そのインストール済みバージョンが release-manifest.json の plugin.version と完全に一致することを確認してください。また、フィルタ済みの MCP スナップショットを使って、open-design という名前の有効な stdio MCP を確認してください。確認するのは name、enabled、transport.type、command だけにしてください。未加工の args、env、env_vars、headers、token、bearer token、API key、および Vela の認証情報の値は、出力やレポートに決して含めないでください。command は Open Design を起動する絶対パスでなければなりません。インストールした内容と、未完了の Open Design または Vela ログインの前提条件があれば報告してください。新しい Codex タスクを開始してインストール済みのプラグインスナップショットを読み込ませ、@open-design を呼び出してください。',
      },
    ],
  },
  demo: {
    title: '一度インストールすれば、Codex/ChatGPT からそのまま制作。',
    lead:
      'まず Codex と Open Design のワークスペース全体を確認し、実際のインストールから完成までの流れを順番にたどれます。',
    overviewAlt:
      'Open Design プラグインを使う実際の Codex タスクと、完成した Goodfield カフェの Web サイト',
    overviewLabel: '実際の Codex タスク',
    overviewCaption:
      'プロンプト、Open Design への引き継ぎ、生成ファイル、完成した Web サイトを、ひとつのワークスペースで確認できます。',
    stepListAria: '実際の Codex プラグイン実行を構成する 5 つのステップ',
    installPhase: 'インストール',
    installTitle: 'Codex にインストールを頼む',
    installBody:
      'この指示を Codex のタスクに貼り付けます。Codex が正規の Git マーケットプレイスソースを追加し、プラグインが未インストールの場合にのみインストールして、公開カタログへの掲載を必要とせずにローカル MCP の設定を完了します。',
    installNote: 'Codex に一度貼り付けるだけで、インストールの詳細は自動で処理されます。',
    steps: [
      {
        phase: '使う',
        title: '新しい Codex タスクを始める',
        body:
          'インストールが完了したら、新しいタスクでインストール済みの Open Design プラグインを開き、「Try now」を選んで始めます。',
        alt: '「Try now」ボタンが表示された、Codex の実際の Open Design プラグイン詳細画面',
      },
      {
        phase: '制作',
        title: 'デザインブリーフを書く',
        body:
          'Open Design をメンションし、作りたい成果物、必要な内容、ビジュアルの方向性、レスポンシブ対応の要件を伝えます。',
        alt: 'Open Design に温かみのある街のカフェの Web サイト制作を依頼する、実際の Codex プロンプト',
      },
      {
        phase: '制作',
        title: 'リアルタイムの引き継ぎを確認する',
        body:
          'Codex が方向性を確認してプロジェクトを作成し、Open Design へ作業を引き継ぎます。生成されたファイルもその場で表示されます。',
        alt:
          '街のカフェの Web サイトを生成中の、実際の Codex と Open Design のワークスペース',
      },
      {
        phase: '制作',
        title: '完成した成果物を確認する',
        body:
          '同じタスク内に、レスポンシブな Goodfield カフェのランディングページ、生成画像、編集可能なファイルが返ってきます。',
        alt:
          'Codex の Open Design プラグインで生成された、完成版 Goodfield 街のカフェのランディングページ',
      },
    ],
  },
  use: {
    title: 'そのまま使えるプロンプトから始める。',
    lead:
      'Codex のプラグインメニューから Open Design を選び、作りたい成果物を説明します。同じタスクの中で、続けて調整を重ねられます。プラグインへのメンションは、Codex 上で Open Design のチップとして表示されます。',
    promptLabel: '実際の Codex タスクで使用したプロンプト',
    copyPrompt: 'Codex プロンプトをコピー',
    galleryAria: 'Open Design で制作した事例',
    templates: [
      {
        alt: '手触りのあるカッティングマットとコルクのオブジェを配した Oryzo の商品ランディングページ',
        label: 'プロダクトローンチ',
      },
      {
        alt: 'タイポグラフィで地図を表現した Open Design Osaka のイベントランディングページ',
        label: 'イベントページ',
      },
      {
        alt: 'ダークトーンのエディトリアルデザインによる Fable 5 のプロダクト Web サイト',
        label: 'エディトリアルサイト',
      },
      {
        alt: '明るいキャンバス上に展開する Open Design のモデルタイムライン画面',
        label: 'インタラクティブストーリー',
      },
    ],
    promptListAria: 'Open Design Cloud のプロンプト例',
    prompts: [
      { title: 'Web サイト' },
      { title: 'スライド' },
      { title: 'プロトタイプ' },
      { title: 'デザインシステム' },
    ],
  },
  faq: {
    title: 'インストール前によくある質問',
    lead: 'タスクの進行は Codex が担い、Open Design がビジュアル制作のワークフローを担当します。',
    items: [
      {
        q: 'このプラグインを入れると、Codex で何ができるようになりますか？',
        a:
          'Web サイト、スライド、プロトタイプ、デザインシステムを作るための Open Design ワークフローが Codex に加わります。プラグインはローカルの Open Design MCP に接続し、ブリーフ作成、プロジェクト管理、成果物の生成を行います。',
      },
      {
        q: 'どの Codex 製品に対応していますか？',
        a:
          '現在のパッケージは Codex Desktop と Codex CLI に対応しています。最初に対応するホストは Codex です。',
      },
      {
        q: 'インストール前に何が必要ですか？',
        a:
          'Codex CLI 0.144.6 以降と Open Design 0.17.0 以降が必要です。ローカル MCP を登録する前に Open Design をインストールしてください。',
      },
      {
        q: 'なぜ新しい Codex タスクを始める必要がありますか？',
        a:
          'Codex はタスクの開始時にプラグインと MCP の機能を読み込みます。新しいタスクを始めることで、インストールした Open Design Cloud プラグインが利用できるようになります。',
      },
      {
        q: 'Open Design のウィンドウは開いたままにする必要がありますか？',
        a:
          'いいえ。登録済みのローカル MCP が必要に応じて、署名済みの Open Design ランタイムをバックグラウンドで起動できます。',
      },
    ],
  },
  final: {
    aria: 'Open Design Cloud を Codex/ChatGPT にインストール',
    title: '次の Codex/ChatGPT タスクに Open Design を。',
    bodyBeforeMention: 'プラグインをインストールしてローカル MCP を接続し、',
    bodyAfterMention: 'を呼び出します。',
    copy: 'コピー',
    download: 'Open Design をダウンロード',
    source: 'ソースを見る',
  },
  clipboard: {
    copying: 'コピー中…',
    copied: 'コピーしました',
    failed: '選択してコピー',
  },
  schema: {
    pageName: 'Codex/ChatGPT 向け Open Design Cloud プラグイン',
    applicationName: 'Codex/ChatGPT 向け Open Design Cloud プラグイン',
  },
};

export default ja;
