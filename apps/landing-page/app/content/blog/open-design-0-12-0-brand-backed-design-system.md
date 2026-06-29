---
title: "Open Design 0.12.0: your brand is a design system"
date: 2026-06-26
category: "Product"
readingTime: 7
summary: "Tag open-design-v0.12.0 — 103 PRs from 30 contributors in six days. Codename \"Brand-backed Design System.\" Point Open Design at a live site, drop in a Figma file, or clip a page in your browser, and it lifts the real brand — colors, type, voice — into a reusable design system you can build from on every project after."
i18n:
  zh:
    title: 'Open Design 0.12.0：你的品牌就是一套设计系统'
    summary: '标签 open-design-v0.12.0 —— 六天内 30 位贡献者提交了 103 个 PR。代号「品牌支撑的设计系统」。把 Open Design 对准一个在线站点、丢进一个 Figma 文件，或者在浏览器里剪取一个页面，它就会把真实的品牌 —— 配色、字体、语调 —— 提炼成一套可复用的设计系统，让你在之后的每个项目里都能以它为基础进行构建。'
    bodyHtml: |
      <p>标签 <code>open-design-v0.12.0</code>，于 2026 年 6 月 26 日发布。<strong>六天内 30 位贡献者提交了 103 个 PR。</strong>代号「品牌支撑的设计系统」。过去两个月里，Open Design 从一张白纸出发，<em>为</em>你做设计。而这次发布把它反转过来：<strong>你已经拥有的品牌，变成一套可复用的设计系统。</strong></p>
      <p>想看完整版本，可以查阅 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub 上的发布说明</a>。本文是精简版：底层改了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>你的品牌就是一套设计系统</h2>
      <p>这是 0.12.0 的头牌。直到现在，要得到一套品牌精准的设计系统，唯一的办法是手写一份 <code>DESIGN.md</code> —— 对任何还没浸淫于规范的人来说，这都是一堵墙。如今，<strong>每一条接入路径都汇入同一条流水线。</strong></p>
      <p>把 Open Design 对准一个<strong>品牌 URL</strong>、丢进一份 <code>DESIGN.md</code>、递给它一个<strong>离线 <code>.fig</code> 文件</strong>（在本地解码，无需 Figma 账号），或者用全新的<strong>浏览器剪取工具</strong>捕获一个页面 —— 每一种都会被提炼成一套可复用的 <code>user:</code> 设计系统。因为这正是这次发布背后的全部理念：<strong>品牌并不是一个独立的东西，它<em>本身就是</em>一套设计系统。</strong>捕获一次，它就会在一条不间断的闭环里流转，从此归你在之后的每个项目里复用。</p>
      <p>从这里开始就是一条端到端的闭环：把这套系统作为一份套件加模板来预览，<strong>直接以它为基础进行构建</strong>（引导上手现在以一个构建步骤收尾），再把成果<strong>一键导出</strong>为 PDF、PPTX、可编辑的 PPTX 或图片。捕获到的徽标、截图和配色终于在全新的 <strong>OD Library</strong> 里有了归宿 —— 这是一个内容寻址的素材注册表。而一次全新安装现在会附带 <strong>150 套现成的品牌设计系统</strong> —— Airbnb、Stripe、Vercel、Tesla、Supabase、Uber 等等 —— 因此选择器从第一天起就好用。CLI 保持完全对等：<code>od brand</code>、<code>od library</code>、<code>od figma import</code>、<code>od export</code>。</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="一张在线网站的缩略图被向上抬起，并分离成一小组品牌 token —— 一行色板、一份字体样本和一块徽标贴片 —— 汇聚到一张可复用的设计系统卡片上，卡片被框在一个绿色选择框内，背景为近白色的编辑风底色" />
        <figcaption>把它对准一个品牌，它就会把配色、字体和语调提炼成一套可复用的设计系统。</figcaption>
      </figure>

      <h2>终于会告诉你哪里出错的失败</h2>
      <p>那个令人头疼、什么都往里装的「execution_failed」不见了。运行现在会<strong>说出自己的原因</strong> —— 启动崩溃、恢复会话过期、agent 卡在工具循环里、服务商配置过期 —— 这样你就知道该重试还是该上报。而当一次运行<em>能够</em>恢复时，它现在会<strong>带抖动地退避并自行重试</strong>，而不是直接倒下。</p>
      <p>这是一个改动不大、收益却很大的变化：过去一次失败就是一条死胡同，外加一个耸肩。现在它会把你指向修复方案，而那些可恢复的失败则会悄悄自我修复。</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="一个灰色、没有标注的运行失败方块，旁边是一张标注清晰的失败卡片，它写明了自己的原因并显示一个向回弯曲的重试箭头，那张带标注的卡片被框在一个绿色选择框内，背景为近白色的编辑风底色" />
        <figcaption>明确命名的原因取代了那个不透明的灰色大筐 —— 而可恢复的运行会自行重试。</figcaption>
      </figure>

      <h2>经得起一次糟糕浏览器跳转的登录</h2>
      <p>过去，如果浏览器跳转出岔子，云端登录会沉默地卡上五分钟。现在它会<strong>当场打印出登录 URL 和验证码</strong>，让你可以手动完成，而整个引导上手的 Connect 步骤也被重新设计成一个清爽的云端登录落地页。新用户最先接触到的那一步，不再会因为一个行为不端的浏览器而崩坏。</p>

      <h2>0.12.0 中还有什么</h2>
      <p>这次发布覆盖面很广。值得拎出来说的几块：</p>
      <ul>
        <li><strong>你的 coding agent，毛刺更少。</strong>在 npm 上更稳的 OpenCode 二进制检测、通过 <code>fnm</code> 进行的 Windows Node 发现、经由 Corepack 的 <code>pnpm</code> 解析、一套集中式的推理服务商策略、优先使用的 Codex 订阅版图像生成，以及在不该出现 Warp 启动器的地方把它隐藏了起来。</li>
        <li><strong>更清晰的 PDF 与更好的演示文稿处理。</strong>PDF 导出现在会等页面进入可打印状态再触发，打印出的文件名对 Teams 友好，演示文稿检测能识别带 slide 前缀的类名，而 HTML-PPT 截图不再依赖系统中已安装的 Chrome。</li>
        <li><strong>一个会展示进度的桌面端。</strong>启动画面现在显示真实的启动阶段进度，而不是一个冻住的徽标，它佩戴着首字母大写的「Open Design」字标，而负载更新会像你预期的那样在应用内安装。</li>
        <li><strong>网页端的更多打磨。</strong>一个焕新的首页，配上移动端响应式修复，一篇覆盖 18 种语言的《什么是 vibe design》博客文章以及更广的 vibe-design 内容簇，一轮全站 SEO 元数据整治，以及统一到 <strong>@OpenDesignHQ</strong> 的官方账号。</li>
        <li><strong>更容易自托管。</strong>运行时镜像现在自带 <code>bash</code> 和 <code>git</code>，Docker 默认配置与 GHCR 发布版对齐，针对可信网络提供了一个可选启用的 API 鉴权关闭开关，还有一个全新的一键 Sealos 部署选项。</li>
      </ul>
      <p>完整清单长达 103 个 PR。其余内容都在 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub 上的发布说明</a>里。</p>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用，从 150 套预置的品牌设计系统里挑一套 —— 引导上手现在以一个真正的构建步骤收尾</td></tr>
          <tr><td>要带上你自己的品牌</td><td>把它对准你的品牌 URL、丢进一份 <code>DESIGN.md</code>、递给它一个离线 <code>.fig</code>，或者在浏览器里剪取一个页面 —— 这四种方式都汇入同一套可复用的设计系统</td></tr>
          <tr><td>要交付一套演示文稿或一份文档</td><td>直接以你的设计系统为基础进行构建，再一键导出为 PDF、PPTX、可编辑的 PPTX 或图片</td></tr>
          <tr><td>遇到一次失败的运行</td><td>重新运行它 —— 失败现在会说出自己的原因，而可恢复的那些会自行退避并重试</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>品牌并不是一份你每个项目都要重新描述一遍的独立资产 —— 它<em>本身就是</em>一套设计系统。下载桌面应用，把 Open Design 对准一个你已经拥有的品牌，看着它把配色、字体和语调提炼成某种你今天就能以之为基础进行构建、并在之后每个项目里都能复用的东西。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>六天 103 个 PR，来自 30 个把一张白纸变成起点的人。品牌支撑的设计系统之所以存在，是因为贡献者们弥合了「你拥有的品牌」与「你据以构建的系统」之间的鸿沟。一场运动不会从某一个团队的笔记本电脑里发布出来；它从那些挺身而出、动手去建的人手中发布出来。我们看见你们了。🏛️</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0：集市</a> —— 本次发布所立足的那次「画廊与欢迎」发布</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0：一体化设计工作空间</a> —— 构建闭环底下那次单窗口发布</li>
        <li><a href="/blog/what-is-vibe-design/">什么是 vibe design？</a> —— 关于「以意图来设计」更长的展开，也正是这次发布捕获进系统里的那套工作流</li>
      </ul>
  ja:
    title: 'Open Design 0.12.0：あなたのブランドはデザインシステムである'
    summary: 'タグ open-design-v0.12.0 — 6日間で30人のコントリビューターから103件のPR。コードネームは「ブランドに裏打ちされたデザインシステム」。Open Design を稼働中のサイトに向けるか、Figma ファイルを放り込むか、ブラウザでページをクリップすれば、本物のブランド——色、書体、トーン——を、その後すべてのプロジェクトで土台にできる再利用可能なデザインシステムへと引き上げます。'
    bodyHtml: |
      <p>タグ <code>open-design-v0.12.0</code>、2026年6月26日にリリース。<strong>6日間で30人のコントリビューターから103件のPR。</strong>コードネームは「ブランドに裏打ちされたデザインシステム」。この2か月間、Open Design は白紙のページから始めて、あなたの<em>ために</em>デザインしてきました。今回のリリースはそれを反転させます：<strong>あなたがすでに所有しているブランドが、再利用可能なデザインシステムになります。</strong></p>
      <p>詳細版が読みたい方は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub のリリースノート</a>をご覧ください。本記事は短縮版です：内部で何が変わったか、今日それで何ができるか、そしてどこから始めればよいか。</p>

      <h2>あなたのブランドはデザインシステムである</h2>
      <p>これは 0.12.0 の目玉です。これまで、ブランドに忠実なデザインシステムを手にする唯一の方法は、<code>DESIGN.md</code> を手作業で書き起こすことでした——仕様にまだ通じていない人にとっては壁です。いまや<strong>あらゆる取り込み経路が、ひとつのパイプラインに流れ込みます。</strong></p>
      <p>Open Design を<strong>ブランド URL</strong> に向けるか、<code>DESIGN.md</code> を放り込むか、<strong>オフラインの <code>.fig</code> ファイル</strong>（ローカルでデコードされ、Figma アカウントは不要）を渡すか、新しい<strong>ブラウザクリッパー</strong>でページをキャプチャしてください——そのどれもが、再利用可能な <code>user:</code> デザインシステムへと抽出されます。なぜなら、それこそが今回のリリースの根底にある考えだからです：<strong>ブランドは別個の何かではなく、それ<em>自体が</em>デザインシステムなのです。</strong>一度キャプチャすれば、それは途切れのないひとつのループを通り抜け、その後すべてのプロジェクトであなたが再利用できるものになります。</p>
      <p>そこから先は、端から端までひとつのループです：システムをキット＋テンプレートとしてプレビューし、<strong>そこから直接ビルドし</strong>（オンボーディングはいまやビルドステップで完結します）、その結果を<strong>ワンクリックでエクスポート</strong>して PDF、PPTX、編集可能な PPTX、または画像にします。キャプチャしたロゴ、スクリーンショット、パレットは、コンテンツアドレス指定のアセットレジストリである新しい <strong>OD Library</strong> に、ようやく居場所を得ます。そして新規インストールにはいまや、<strong>150 種のすぐ使えるブランドデザインシステム</strong>——Airbnb、Stripe、Vercel、Tesla、Supabase、Uber など——が同梱されるので、ピッカーは初日から役に立ちます。CLI も完全に同等です：<code>od brand</code>、<code>od library</code>、<code>od figma import</code>、<code>od export</code>。</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="稼働中のウェブサイトのサムネイルが上方へ引き上げられ、少数のブランドトークン——カラースウォッチの列、書体のサンプル、ロゴのタイル——へと分解され、緑の選択フレーム内に保持されたひとつの再利用可能なデザインシステムカードへ集められている、ほぼ白のエディトリアルな地" />
        <figcaption>ブランドに向ければ、色、書体、トーンを再利用可能なデザインシステムへと引き上げます。</figcaption>
      </figure>

      <h2>何が壊れたのかをついに教えてくれる失敗</h2>
      <p>あの忌まわしい何でも一括りの「execution_failed」はなくなりました。実行はいまや<strong>その原因を名指しします</strong>——起動時のクラッシュ、再開の期限切れ、ツールループに陥ったエージェント、古いプロバイダー設定——ので、リトライすべきか報告すべきかが分かります。そして実行が回復<em>できる</em>ときには、いまや倒れ込む代わりに<strong>ジッターを入れてバックオフし、自ら再試行します</strong>。</p>
      <p>小さな変更ですが、見返りは大きいものです：かつて失敗は、肩すくめが添えられた行き止まりでした。いまやそれはあなたを修正へと指し示し、回復できるものは静かに自らを修復します。</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="ラベルのない灰色の実行失敗ブロックが1つ、その横に、原因を名指しし、後ろへ弧を描くリトライの矢印を示す、明確にラベル付けされた失敗カード。ラベル付きのカードが緑の選択フレーム内に保持されている、ほぼ白のエディトリアルな地" />
        <figcaption>名前のついた原因が、不透明な灰色のひとまとめを置き換えます——そして回復可能な実行は自ら再試行します。</figcaption>
      </figure>

      <h2>不調なブラウザの受け渡しでも生き残るサインイン</h2>
      <p>クラウドサインインは、ブラウザの受け渡しが不調になると、これまで沈黙のまま5分間ハングしていました。いまや<strong>ログイン URL とコードをその場に表示する</strong>ので、手作業で完了でき、オンボーディングの Connect ステップ全体が、すっきりとしたクラウドサインインのランディングへと再設計されました。新規ユーザーが最初に触れるものが、行儀の悪いブラウザで壊れることはもうありません。</p>

      <h2>0.12.0 に含まれるその他の変更</h2>
      <p>このリリースは幅広い内容です。前面に押し出す価値のあるものは次のとおり：</p>
      <ul>
        <li><strong>あなたのコーディングエージェント、ざらつきはより少なく。</strong>npm 上での OpenCode バイナリ検出がより安定し、<code>fnm</code> 経由の Windows Node 探索、Corepack を介した <code>pnpm</code> の解決、一元化された推論プロバイダーポリシー、優先される Codex サブスクリプションの画像生成、そして場違いな場所では隠される Warp ランチャー。</li>
        <li><strong>よりくっきりした PDF とデッキの扱い。</strong>PDF エクスポートは、発火する前にページが印刷可能な状態になるのを待つようになり、印刷されるファイル名は Teams で安全になり、デッキ検出はスライド接頭辞付きのクラスを拾い上げ、HTML-PPT のスクリーンショットはシステムに Chrome がインストールされていることに依存しなくなりました。</li>
        <li><strong>仕事ぶりを見せるデスクトップ。</strong>スプラッシュ画面は、固まったロゴの代わりに本物の起動段階の進捗を示し、大文字始まりの「Open Design」ワードマークをまとい、ペイロードの更新は期待どおりアプリ内でインストールされます。</li>
        <li><strong>ウェブ上のさらなる磨き込み。</strong>モバイルレスポンシブの修正を施した刷新済みのホームページ、18 のロケールで提供される「What is vibe design」のブログ記事と、より広い vibe-design クラスター、サイト全体の SEO メタデータの見直し、そして<strong>@OpenDesignHQ</strong> に統一された公式アカウント。</li>
        <li><strong>セルフホストがより簡単に。</strong>ランタイムイメージは <code>bash</code> と <code>git</code> を同梱し、Docker のデフォルトは GHCR のリリースに揃い、信頼されたネットワーク向けにオプトインの API 認証無効化フラグが用意され、新たにワンクリックの Sealos デプロイオプションが加わりました。</li>
      </ul>
      <p>全リストは103件のPRに及びます。残りは<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub のリリースノート</a>に記載されています。</p>

      <h2>今日それで何をするか</h2>
      <table>
        <thead>
          <tr><th>あなたが…</th><th>ここから始める</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design が初めて</td><td>デスクトップアプリをダウンロードして、あらかじめ用意された 150 種のブランドデザインシステムから一つ選びましょう——オンボーディングはいまや、本物のビルドステップで完結します</td></tr>
          <tr><td>自分のブランドを持ち込む</td><td>自分のブランド URL に向けるか、<code>DESIGN.md</code> を放り込むか、オフラインの <code>.fig</code> を渡すか、ブラウザでページをクリップしましょう——その4つすべてが、ひとつの再利用可能なデザインシステムに流れ込みます</td></tr>
          <tr><td>デッキやドキュメントを出荷する</td><td>デザインシステムから直接ビルドし、ワンクリックで PDF、PPTX、編集可能な PPTX、または画像にエクスポートしましょう</td></tr>
          <tr><td>失敗した実行に見舞われた</td><td>もう一度実行しましょう——失敗はいまやその原因を名指しし、回復可能なものはバックオフして自ら再試行します</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>ブランドは、プロジェクトのたびに記述し直す別個のアセットではありません——それ<em>自体が</em>デザインシステムです。デスクトップアプリをダウンロードし、Open Design をあなたがすでに所有しているブランドに向け、色、書体、トーンが、今日から土台にでき、その後すべてのプロジェクトで再利用できる何かへと引き上げられるのを見届けてください。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>6日間で103件のPR、白紙のページを出発点へと変えた30人から。ブランドに裏打ちされたデザインシステムが存在するのは、コントリビューターたちが「あなたが所有するブランド」と「あなたが土台にするシステム」とのあいだの隔たりを埋めたからです。ムーブメントは一つのチームのノートパソコンから出荷されるのではありません。現れて、作り上げた人々から出荷されるのです。私たちはあなたを見ています。🏛️</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0：バザール</a> — 今回がその上に築かれる、ギャラリーとウェルカムのリリース</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0：オールインワンのデザインワークスペース</a> — ビルドループの下にある、ワンウィンドウのリリース</li>
        <li><a href="/blog/what-is-vibe-design/">vibe design とは？</a> — 意図によってデザインすることについてのより長い考察。今回のリリースがシステムへと取り込む、そのワークフローです</li>
      </ul>
  ko:
    title: 'Open Design 0.12.0: 당신의 브랜드가 곧 디자인 시스템'
    summary: '태그 open-design-v0.12.0 — 6일 동안 30명의 기여자가 만든 103개의 PR. 코드명 "브랜드 기반 디자인 시스템(Brand-backed Design System)". Open Design을 라이브 사이트로 향하게 하거나, Figma 파일을 떨궈 넣거나, 브라우저에서 페이지를 클립하면, 실제 브랜드 — 색상, 타이포, 보이스 — 를 이후 모든 프로젝트에서 토대로 삼아 빌드할 수 있는 재사용 가능한 디자인 시스템으로 끌어올립니다.'
    bodyHtml: |
      <p>태그 <code>open-design-v0.12.0</code>, 2026년 6월 26일 출시. <strong>6일 동안 30명의 기여자가 만든 103개의 PR.</strong> 코드명 "브랜드 기반 디자인 시스템(Brand-backed Design System)". 지난 두 달 동안 Open Design은 빈 페이지에서 시작해 당신을 <em>위해</em> 디자인했습니다. 이번 릴리스는 그것을 뒤집습니다: <strong>당신이 이미 소유한 브랜드가 재사용 가능한 디자인 시스템이 됩니다.</strong></p>
      <p>긴 버전이 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub의 릴리스 노트</a>에 담겨 있습니다. 이 글은 짧은 버전입니다: 내부에서 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작하면 되는지.</p>

      <h2>당신의 브랜드가 곧 디자인 시스템입니다</h2>
      <p>이것이 0.12.0의 간판입니다. 지금까지 브랜드에 정확히 들어맞는 디자인 시스템을 얻는 유일한 방법은 <code>DESIGN.md</code>를 손수 작성하는 것이었습니다 — 사양에 이미 익숙하지 않은 사람에게는 하나의 벽이었죠. 이제 <strong>모든 수집 경로가 하나의 파이프라인으로 흘러듭니다.</strong></p>
      <p>Open Design을 <strong>브랜드 URL</strong>로 향하게 하거나, <code>DESIGN.md</code>를 떨궈 넣거나, <strong>오프라인 <code>.fig</code> 파일</strong>(로컬에서 디코딩되며, Figma 계정 불필요)을 건네거나, 새로운 <strong>브라우저 클리퍼</strong>로 페이지를 캡처하세요 — 그리고 그 각각이 재사용 가능한 <code>user:</code> 디자인 시스템으로 추출됩니다. 이번 릴리스의 핵심 아이디어가 바로 그것이기 때문입니다: <strong>브랜드는 별개의 무언가가 아니라, 그 자체로 디자인 시스템<em>입니다</em>.</strong> 한 번 캡처하면 끊김 없는 하나의 루프를 따라 흐르며, 이후 모든 프로젝트에서 재사용할 수 있는 당신의 것이 됩니다.</p>
      <p>거기서부터는 끝에서 끝까지 하나의 루프입니다: 시스템을 키트와 템플릿으로 프리뷰하고, <strong>거기서 곧장 빌드</strong>하며(이제 온보딩이 빌드 단계에서 끝납니다), 그 결과물을 PDF, PPTX, 편집 가능한 PPTX, 또는 이미지로 <strong>원클릭 내보내기</strong>합니다. 캡처한 로고, 스크린샷, 팔레트가 마침내 콘텐츠 주소 기반 에셋 레지스트리인 새로운 <strong>OD Library</strong>에 보금자리를 얻었습니다. 그리고 이제 새로 설치하면 <strong>150개의 기성 브랜드 디자인 시스템</strong> — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber 등 — 이 함께 제공되므로, 피커가 첫날부터 유용합니다. CLI는 완전한 동등성을 유지합니다: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="위로 들어 올려져 작은 브랜드 토큰 묶음 — 색상 견본 줄, 타이포 샘플, 로고 타일 — 으로 분리되는 라이브 웹사이트 썸네일, 이것이 녹색 선택 프레임 안에 담긴 재사용 가능한 하나의 디자인 시스템 카드 위에 모이며, 거의 흰색에 가까운 편집 배경 위에 놓여 있다" />
        <figcaption>브랜드로 향하게 하면 색상, 타이포, 보이스를 재사용 가능한 디자인 시스템으로 끌어올립니다.</figcaption>
      </figure>

      <h2>마침내 무엇이 깨졌는지 알려주는 실패</h2>
      <p>두려움의 대상이던 뭉뚱그린 "execution_failed"가 사라졌습니다. 이제 실행은 <strong>그 원인을 이름으로 짚어줍니다</strong> — 시작 시 크래시, 재개 만료, 도구 루프에 갇힌 에이전트, 오래된 제공자 설정 — 그래서 재시도할지 신고할지 알 수 있습니다. 그리고 실행이 복구<em>될 수 있을</em> 때는, 이제 쓰러지는 대신 <strong>지터를 두고 물러났다가 스스로 재시도합니다</strong>.</p>
      <p>작은 변화지만 보상은 큽니다: 예전에는 실패가 어깨 으쓱이 딸린 막다른 길이었습니다. 이제는 해결책을 가리켜 주고, 복구 가능한 것들은 조용히 스스로 고쳐집니다.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="라벨 없는 회색 실행 실패 블록 하나가, 원인을 이름으로 짚고 되돌아 굽은 재시도 화살표를 보여주는 명확히 라벨이 붙은 실패 카드 옆에 있고, 그 라벨 붙은 카드가 녹색 선택 프레임 안에 담겨 있으며, 거의 흰색에 가까운 편집 배경 위에 놓여 있다" />
        <figcaption>이름이 붙은 원인이 불투명한 회색 뭉치를 대체합니다 — 그리고 복구 가능한 실행은 스스로 재시도합니다.</figcaption>
      </figure>

      <h2>잘못된 브라우저 핸드오프에서도 살아남는 로그인</h2>
      <p>클라우드 로그인은 예전에 브라우저 핸드오프가 흔들리면 5분 동안 말없이 멈춰 있었습니다. 이제는 <strong>로그인 URL과 코드를 바로 그 자리에 출력</strong>해 손수 마무리할 수 있게 하고, 온보딩 Connect 단계 전체가 깔끔한 클라우드 로그인 랜딩으로 재설계되었습니다. 새 사용자가 가장 먼저 만지는 것이 더 이상 제멋대로 구는 브라우저에서 깨지지 않습니다.</p>

      <h2>0.12.0에 또 무엇이 담겼나</h2>
      <p>이번 릴리스는 폭이 넓습니다. 앞으로 끌어올릴 만한 조각 몇 가지:</p>
      <ul>
        <li><strong>당신의 코딩 에이전트, 더 적어진 거친 모서리.</strong> npm에서 더 안정적인 OpenCode 바이너리 감지, <code>fnm</code>을 통한 Windows Node 탐색, Corepack을 통한 <code>pnpm</code> 해석, 중앙화된 추론 제공자 정책, 선호되는 Codex 구독 이미지 생성, 그리고 어울리지 않는 곳에 숨겨진 Warp 런처.</li>
        <li><strong>더 선명한 PDF와 덱 처리.</strong> 이제 PDF 내보내기는 실행하기 전에 페이지가 인쇄 준비될 때까지 기다리고, 인쇄된 파일 이름은 Teams에 안전하며, 덱 감지가 슬라이드 접두사가 붙은 클래스를 잡아내고, HTML-PPT 스크린샷이 더 이상 시스템에 설치된 Chrome에 의존하지 않습니다.</li>
        <li><strong>제 작업을 보여주는 데스크톱.</strong> 스플래시 화면이 멈춘 로고 대신 실제 부팅 단계 진행 상황을 보여주고, 첫 글자를 대문자로 한 "Open Design" 워드마크를 두르며, 페이로드 업데이트가 당신이 기대하는 방식대로 앱 안에서 설치됩니다.</li>
        <li><strong>웹에서의 더 많은 다듬기.</strong> 모바일 반응형 수정을 곁들여 새단장한 홈 페이지, 18개 언어로 제공되는 "What is vibe design" 블로그 글과 더 넓은 vibe-design 클러스터, 사이트 전반의 SEO 메타데이터 개선, 그리고 <strong>@OpenDesignHQ</strong>로 통일된 공식 계정.</li>
        <li><strong>더 쉬워진 셀프 호스팅.</strong> 런타임 이미지가 <code>bash</code>와 <code>git</code>을 함께 제공하고, Docker 기본값이 GHCR 릴리스와 정렬되며, 신뢰할 수 있는 네트워크를 위한 옵트인 API 인증 비활성화 플래그가 있고, 새로운 원클릭 Sealos 배포 옵션이 있습니다.</li>
      </ul>
      <p>전체 목록은 103개의 PR에 이릅니다. 나머지는 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub의 릴리스 노트</a>에 담겨 있습니다.</p>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead>
          <tr><th>당신이…</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 다운로드하고 미리 담긴 150개의 브랜드 디자인 시스템 중 하나를 고르세요 — 이제 온보딩이 진짜 빌드 단계에서 끝납니다</td></tr>
          <tr><td>자신의 브랜드를 가져온다면</td><td>브랜드 URL로 향하게 하거나, <code>DESIGN.md</code>를 떨궈 넣거나, 오프라인 <code>.fig</code>를 건네거나, 브라우저에서 페이지를 클립하세요 — 네 가지 모두 하나의 재사용 가능한 디자인 시스템으로 흘러듭니다</td></tr>
          <tr><td>덱이나 문서를 출시한다면</td><td>디자인 시스템에서 곧장 빌드하고 PDF, PPTX, 편집 가능한 PPTX, 또는 이미지로 원클릭 내보내기 하세요</td></tr>
          <tr><td>실패한 실행에 부딪혔다면</td><td>다시 실행하세요 — 이제 실패는 그 원인을 이름으로 짚어주고, 복구 가능한 것들은 스스로 물러났다가 재시도합니다</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>브랜드는 프로젝트마다 다시 설명하는 별개의 에셋이 아니라, 그 자체로 디자인 시스템<em>입니다</em>. 데스크톱 앱을 다운로드하고, Open Design을 이미 소유한 브랜드로 향하게 한 뒤, 색상, 타이포, 보이스를 오늘 바로 토대로 삼아 빌드하고 이후 모든 프로젝트에서 재사용할 수 있는 무언가로 끌어올리는 모습을 지켜보세요.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>6일 동안 103개의 PR, 빈 페이지를 출발점으로 바꾼 30명에게서. 브랜드 기반 디자인 시스템이 존재하는 이유는, 기여자들이 "당신이 소유한 브랜드"와 "당신이 토대로 삼아 빌드하는 시스템" 사이의 간극을 메웠기 때문입니다. 운동은 한 팀의 노트북에서 출시되지 않습니다; 나타나서 만든 사람들에게서 출시됩니다. 우리는 당신을 보고 있습니다. 🏛️</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: 바자르</a> — 이번 릴리스가 그 위에 쌓아 올린 갤러리-그리고-환영 릴리스</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: 올인원 디자인 워크스페이스</a> — 빌드 루프 밑에 자리한 단일 창 릴리스</li>
        <li><a href="/blog/what-is-vibe-design/">바이브 디자인이란 무엇인가?</a> — 의도로 디자인하기에 대한 더 긴 이야기, 이번 릴리스가 시스템으로 담아낸 그 워크플로</li>
      </ul>
  de:
    title: 'Open Design 0.12.0: deine Marke ist ein Designsystem'
    summary: 'Tag open-design-v0.12.0 — 103 PRs von 30 Mitwirkenden in sechs Tagen. Codename „Markengestütztes Designsystem”. Richte Open Design auf eine Live-Site, lege eine Figma-Datei ab oder clippe eine Seite in deinem Browser — und es hebt die echte Marke heraus — Farben, Typografie, Stimme — in ein wiederverwendbares Designsystem, aus dem du in jedem weiteren Projekt aufbauen kannst.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.12.0</code>, veröffentlicht am 26. Juni 2026. <strong>103 PRs von 30 Mitwirkenden in sechs Tagen.</strong> Codename „Markengestütztes Designsystem”. In den vergangenen zwei Monaten ist Open Design von einer leeren Seite gestartet und hat <em>für</em> dich gestaltet. Dieses Release dreht es um: <strong>die Marke, die du bereits besitzt, wird zu einem wiederverwendbaren Designsystem.</strong></p>
      <p>Wenn du die ausführliche Version möchtest, findest du sie in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">Release Notes auf GitHub</a>. Dieser Beitrag ist die Kurzfassung: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Deine Marke ist ein Designsystem</h2>
      <p>Das ist das Glanzstück von 0.12.0. Bis jetzt war der einzige Weg zu einem markengetreuen Designsystem, eine <code>DESIGN.md</code> von Hand zu verfassen — eine Mauer für alle, die nicht ohnehin tief in der Spezifikation stecken. Jetzt <strong>speist jeder Einlesepfad eine einzige Pipeline.</strong></p>
      <p>Richte Open Design auf eine <strong>Marken-URL</strong>, lege eine <code>DESIGN.md</code> ab, reiche ihm eine <strong>offline <code>.fig</code>-Datei</strong> (lokal dekodiert, kein Figma-Konto) oder erfasse eine Seite mit dem neuen <strong>Browser-Clipper</strong> — und jeder davon wird in ein wiederverwendbares <code>user:</code>-Designsystem extrahiert. Denn das ist die ganze Idee hinter diesem Release: <strong>eine Marke ist keine separate Sache, sie <em>ist</em> ein Designsystem.</strong> Erfasse sie einmal, und sie läuft durch eine einzige ununterbrochene Schleife, deine zum Wiederverwenden in jedem weiteren Projekt.</p>
      <p>Von dort an ist es eine Schleife, von Anfang bis Ende: Sieh dir das System als Kit plus Templates in der Vorschau an, <strong>baue direkt daraus</strong> (das Onboarding endet jetzt mit einem Build-Schritt) und <strong>exportiere das Ergebnis mit einem Klick</strong> als PDF, PPTX, bearbeitbares PPTX oder Bild. Erfasste Logos, Screenshots und Paletten haben endlich ein Zuhause in der neuen <strong>OD Library</strong>, einem inhaltsadressierten Asset-Register. Und eine frische Installation bringt jetzt <strong>150 fertige Marken-Designsysteme</strong> mit — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber und mehr —, sodass der Picker vom ersten Tag an nützlich ist. Die CLI bleibt voll gleichwertig: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="Ein Vorschaubild einer Live-Website wird nach oben gehoben und in einen kleinen Satz Marken-Tokens zerlegt — eine Reihe Farbfelder, eine Schriftprobe und eine Logo-Kachel —, zusammengeführt auf einer einzigen wiederverwendbaren Designsystem-Karte, die in einem grünen Auswahlrahmen gehalten wird, auf einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Richte es auf eine Marke, und es hebt Farben, Typografie und Stimme in ein wiederverwendbares Designsystem heraus.</figcaption>
      </figure>

      <h2>Fehler, die dir endlich sagen, was kaputtging</h2>
      <p>Das gefürchtete Sammelbecken „execution_failed” ist verschwunden. Läufe <strong>benennen jetzt ihre Ursache</strong> — ein Absturz beim Start, ein abgelaufener Resume, ein Agent, der in einer Tool-Schleife feststeckt, eine veraltete Anbieter-Konfiguration —, sodass du weißt, ob du es erneut versuchen oder melden solltest. Und wenn ein Lauf sich erholen <em>kann</em>, <strong>wartet er jetzt mit Jitter und versucht es von selbst erneut</strong>, statt umzukippen.</p>
      <p>Es ist eine kleine Änderung mit großer Wirkung: Ein Fehler war früher eine Sackgasse mit einem Achselzucken dran. Jetzt weist er dich auf die Lösung hin, und die behebbaren beheben sich leise von selbst.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Ein grauer, unbeschrifteter Lauffehler-Block neben einer klar beschrifteten Fehlerkarte, die ihre Ursache benennt und einen zurückschwingenden Wiederholungspfeil zeigt, die beschriftete Karte in einem grünen Auswahlrahmen gehalten, auf einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Benannte Ursachen ersetzen den undurchsichtigen grauen Topf — und behebbare Läufe versuchen es von selbst erneut.</figcaption>
      </figure>

      <h2>Anmeldung, die eine missglückte Browser-Übergabe übersteht</h2>
      <p>Die Cloud-Anmeldung hing früher fünf Minuten lang stumm, wenn die Browser-Übergabe zickte. Jetzt <strong>gibt sie die Login-URL und den Code direkt dort aus</strong>, sodass du es von Hand abschließen kannst, und der gesamte Connect-Schritt im Onboarding wurde zu einer sauberen Cloud-Anmelde-Landing umgestaltet. Das Erste, was ein neuer Nutzer anfasst, scheitert nicht mehr an einem Browser, der sich danebenbenimmt.</p>

      <h2>Was sonst noch in 0.12.0 landet</h2>
      <p>Das Release ist breit. Ein paar weitere Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
        <li><strong>Dein Coding-Agent, weniger raue Kanten.</strong> Stabilere OpenCode-Binary-Erkennung auf npm, Windows-Node-Erkennung über <code>fnm</code>, <code>pnpm</code>-Auflösung über Corepack, eine zentralisierte Reasoning-Provider-Policy, bevorzugte Codex-Abo-Bildgenerierung und der Warp-Launcher dort versteckt, wo er nicht hingehört.</li>
        <li><strong>Schärfere PDFs und besseres Deck-Handling.</strong> Der PDF-Export wartet jetzt, bis die Seite druckbereit ist, bevor er auslöst, gedruckte Dateinamen sind Teams-sicher, die Deck-Erkennung erfasst slide-präfigierte Klassen, und HTML-PPT-Screenshots hängen nicht mehr davon ab, dass ein System-Chrome installiert ist.</li>
        <li><strong>Ein Desktop, der seine Arbeit zeigt.</strong> Der Splash-Screen zeigt echten Fortschritt der Boot-Phasen statt eines eingefrorenen Logos, trägt den großgeschriebenen „Open Design”-Schriftzug, und Payload-Updates installieren sich in der App so, wie du es erwartest.</li>
        <li><strong>Mehr Feinschliff im Web.</strong> Eine aufgefrischte Startseite mit Mobile-Responsive-Korrekturen, ein Blogbeitrag „Was ist Vibe Design” in 18 Sprachen plus ein breiterer Vibe-Design-Cluster, ein websiteweiter SEO-Metadaten-Durchlauf und der offizielle Account vereinheitlicht zu <strong>@OpenDesignHQ</strong>.</li>
        <li><strong>Einfacher selbst zu hosten.</strong> Das Runtime-Image bringt <code>bash</code> und <code>git</code> mit, die Docker-Standardwerte richten sich nach den GHCR-Releases, es gibt ein optionales Flag zum Deaktivieren der API-Authentifizierung für vertrauenswürdige Netzwerke, und eine neue Ein-Klick-Deployment-Option für Sealos.</li>
      </ul>
      <p>Die vollständige Liste umfasst 103 PRs. Die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">Release Notes auf GitHub</a> enthalten den Rest.</p>

      <h2>Was du heute damit machen kannst</h2>
      <table>
        <thead>
          <tr><th>Wenn du…</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>Neu bei Open Design bist</td><td>Lade die Desktop-App herunter und wähle eines der 150 vorbestückten Marken-Designsysteme — das Onboarding endet jetzt mit einem echten Build-Schritt</td></tr>
          <tr><td>Deine eigene Marke mitbringst</td><td>Richte es auf deine Marken-URL, lege eine <code>DESIGN.md</code> ab, reiche ihm eine offline <code>.fig</code> oder clippe eine Seite im Browser — alle vier speisen ein wiederverwendbares Designsystem</td></tr>
          <tr><td>Ein Deck oder Dokument ausspielst</td><td>Baue direkt aus deinem Designsystem und exportiere mit einem Klick als PDF, PPTX, bearbeitbares PPTX oder Bild</td></tr>
          <tr><td>Von einem fehlgeschlagenen Lauf getroffen wurdest</td><td>Führe ihn erneut aus — Fehler benennen jetzt ihre Ursache, und die behebbaren warten ab und versuchen es von selbst erneut</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Eine Marke ist kein separates Asset, das du in jedem Projekt neu beschreibst — sie <em>ist</em> ein Designsystem. Lade die Desktop-App herunter, richte Open Design auf eine Marke, die du bereits besitzt, und sieh zu, wie es Farben, Typografie und Stimme in etwas hebt, aus dem du heute aufbauen und in jedem weiteren Projekt wiederverwenden kannst.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>103 PRs in sechs Tagen, von 30 Menschen, die eine leere Seite in einen Ausgangspunkt verwandeln. Markengestützte Designsysteme existieren, weil Mitwirkende die Lücke zwischen „der Marke, die du besitzt” und „dem System, aus dem du aufbaust” geschlossen haben. Eine Bewegung wird nicht von den Laptops eines einzelnen Teams ausgeliefert; sie wird von den Menschen ausgeliefert, die aufgetaucht sind und gebaut haben. Wir sehen euch. 🏛️</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: der Basar</a> — das Galerie-und-Willkommen-Release, auf dem dieses aufbaut</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: der All-in-One-Design-Workspace</a> — das Ein-Fenster-Release unter der Build-Schleife</li>
        <li><a href="/blog/what-is-vibe-design/">Was ist Vibe Design?</a> — die ausführlichere Betrachtung des Gestaltens nach Absicht, der Workflow, den dieses Release in ein System fasst</li>
      </ul>
  fr:
    title: 'Open Design 0.12.0 : votre marque est un système de design'
    summary: 'Tag open-design-v0.12.0 — 103 PR de 30 contributeurs en six jours. Nom de code « système de design adossé à la marque ». Pointez Open Design vers un site en ligne, déposez-y un fichier Figma, ou capturez une page dans votre navigateur, et il extrait la vraie marque — couleurs, typographie, voix — en un système de design réutilisable à partir duquel vous pourrez construire sur chaque projet suivant.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.12.0</code>, publié le 26 juin 2026. <strong>103 PR de 30 contributeurs en six jours.</strong> Nom de code « système de design adossé à la marque ». Ces deux derniers mois, Open Design partait d'une page blanche et concevait <em>pour</em> vous. Cette version inverse la donne : <strong>la marque que vous possédez déjà devient un système de design réutilisable.</strong></p>
      <p>Si vous voulez la version longue, les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">notes de version sur GitHub</a> la contiennent. Cet article est la version courte : ce qui a changé sous le capot, ce que vous pouvez en faire dès aujourd'hui, et par où commencer.</p>

      <h2>Votre marque est un système de design</h2>
      <p>C'est la vedette de la 0.12.0. Jusqu'ici, la seule façon d'obtenir un système de design fidèle à la marque était de rédiger à la main un <code>DESIGN.md</code> — un mur pour quiconque n'était pas déjà rompu à la spécification. Désormais, <strong>chaque voie d'ingestion alimente un seul pipeline.</strong></p>
      <p>Pointez Open Design vers une <strong>URL de marque</strong>, déposez-y un <code>DESIGN.md</code>, confiez-lui un <strong>fichier <code>.fig</code> hors ligne</strong> (décodé localement, sans compte Figma), ou capturez une page avec le nouveau <strong>clipper de navigateur</strong> — et chacun s'extrait en un système de design <code>user:</code> réutilisable. Parce que c'est toute l'idée derrière cette version : <strong>une marque n'est pas une chose à part, elle <em>est</em> un système de design.</strong> Capturez-la une fois et elle parcourt une boucle ininterrompue, à vous de la réutiliser sur chaque projet suivant.</p>
      <p>À partir de là, c'est une seule boucle, de bout en bout : prévisualisez le système sous forme de kit accompagné de templates, <strong>construisez directement à partir de lui</strong> (l'onboarding se termine désormais sur une étape de build), et <strong>exportez en un clic</strong> le résultat en PDF, PPTX, PPTX éditable ou image. Les logos, captures d'écran et palettes capturés ont enfin un foyer dans la nouvelle <strong>OD Library</strong>, un registre d'actifs adressé par contenu. Et une nouvelle installation est désormais livrée avec <strong>150 systèmes de design de marque prêts à l'emploi</strong> — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber, et plus encore — pour que le sélecteur soit utile dès le premier jour. La CLI conserve une parité complète : <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="La vignette d'un site web en ligne soulevée vers le haut et décomposée en un petit ensemble de tokens de marque — une rangée d'échantillons de couleur, un échantillon typographique et une tuile de logo — rassemblés sur une seule carte de système de design réutilisable maintenue à l'intérieur d'un cadre de sélection vert, sur un fond éditorial presque blanc" />
        <figcaption>Pointez-le vers une marque et il extrait les couleurs, la typographie et la voix en un système de design réutilisable.</figcaption>
      </figure>

      <h2>Des échecs qui vous disent enfin ce qui a cassé</h2>
      <p>Le redouté fourre-tout « execution_failed » a disparu. Les exécutions <strong>nomment désormais leur cause</strong> — un plantage au démarrage, l'expiration d'une reprise, un agent coincé dans une boucle d'outil, une configuration de fournisseur obsolète — pour que vous sachiez s'il faut réessayer ou signaler. Et lorsqu'une exécution <em>peut</em> se rétablir, elle <strong>temporise avec du jitter et réessaie d'elle-même</strong> au lieu de s'effondrer.</p>
      <p>C'est un petit changement au grand bénéfice : un échec était autrefois une impasse assortie d'un haussement d'épaules. Désormais, il vous oriente vers la correction, et les échecs récupérables se corrigent discrètement d'eux-mêmes.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Un bloc d'échec d'exécution gris et non étiqueté à côté d'une carte d'échec clairement étiquetée qui nomme sa cause et montre une flèche de réessai qui revient en courbe, la carte étiquetée maintenue à l'intérieur d'un cadre de sélection vert, sur un fond éditorial presque blanc" />
        <figcaption>Des causes nommées remplacent le fourre-tout gris opaque — et les exécutions récupérables se réessaient d'elles-mêmes.</figcaption>
      </figure>

      <h2>Une connexion qui survit à un mauvais relais de navigateur</h2>
      <p>La connexion au cloud se figeait autrefois cinq minutes en silence si le relais du navigateur flanchait. Désormais, elle <strong>affiche l'URL de connexion et le code sur-le-champ</strong> pour que vous puissiez terminer à la main, et toute l'étape Connect de l'onboarding a été repensée en une page de connexion au cloud épurée. La première chose qu'un nouvel utilisateur touche ne casse plus à cause d'un navigateur qui se comporte mal.</p>

      <h2>Quoi d'autre arrive dans la 0.12.0</h2>
      <p>La version est vaste. Quelques éléments de plus qui méritent d'être mis en avant :</p>
      <ul>
        <li><strong>Votre agent de codage, avec moins d'aspérités.</strong> Une détection plus stable du binaire OpenCode sur npm, la découverte de Node sous Windows via <code>fnm</code>, la résolution de <code>pnpm</code> par Corepack, une politique centralisée de fournisseur de raisonnement, la génération d'images par abonnement Codex privilégiée, et le lanceur Warp masqué là où il n'a pas sa place.</li>
        <li><strong>Des PDF plus nets et une meilleure gestion des decks.</strong> L'export PDF attend désormais que la page soit prête à l'impression avant de se déclencher, les noms de fichiers imprimés sont compatibles avec Teams, la détection de deck reconnaît les classes préfixées par slide, et les captures d'écran HTML-PPT ne dépendent plus de la présence d'un Chrome système installé.</li>
        <li><strong>Un bureau qui montre son travail.</strong> L'écran de démarrage affiche la vraie progression des étapes de démarrage au lieu d'un logo figé, arbore le logotype « Open Design » avec majuscules, et les mises à jour de payload s'installent dans l'application comme vous vous y attendez.</li>
        <li><strong>Plus de finition sur le web.</strong> Une page d'accueil rafraîchie avec des correctifs de réactivité mobile, un article de blog « Qu'est-ce que le vibe design » en 18 langues ainsi qu'un cluster vibe-design élargi, une passe de métadonnées SEO sur tout le site, et le compte officiel unifié sous <strong>@OpenDesignHQ</strong>.</li>
        <li><strong>Plus facile à auto-héberger.</strong> L'image d'exécution embarque <code>bash</code> et <code>git</code>, les valeurs par défaut de Docker s'alignent sur les releases GHCR, il existe un indicateur optionnel de désactivation de l'authentification API pour les réseaux de confiance, et une nouvelle option de déploiement Sealos en un clic.</li>
      </ul>
      <p>La liste complète compte 103 PR. Les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">notes de version sur GitHub</a> contiennent le reste.</p>

      <h2>Quoi en faire dès aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau et choisissez l'un des 150 systèmes de design de marque préchargés — l'onboarding se termine désormais sur une véritable étape de build</td></tr>
          <tr><td>En train d'apporter votre propre marque</td><td>Pointez-le vers l'URL de votre marque, déposez un <code>DESIGN.md</code>, confiez-lui un <code>.fig</code> hors ligne, ou capturez une page dans le navigateur — les quatre alimentent un seul système de design réutilisable</td></tr>
          <tr><td>En train de livrer un deck ou un document</td><td>Construisez directement à partir de votre système de design et exportez en un clic en PDF, PPTX, PPTX éditable ou image</td></tr>
          <tr><td>Confronté à une exécution échouée</td><td>Relancez-la — les échecs nomment désormais leur cause, et les échecs récupérables temporisent et réessaient d'eux-mêmes</td></tr>
        </tbody>
      </table>

      <h2>Quoi faire ensuite</h2>
      <p>Une marque n'est pas un actif distinct que vous redécrivez à chaque projet — elle <em>est</em> un système de design. Téléchargez l'application de bureau, pointez Open Design vers une marque que vous possédez déjà, et regardez-le extraire couleurs, typographie et voix en quelque chose à partir de quoi vous pouvez construire dès aujourd'hui et réutiliser sur chaque projet suivant.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Téléchargez Open Design</a>.</p>
      <p>103 PR en six jours, de 30 personnes transformant une page blanche en point de départ. Les systèmes de design adossés à la marque existent parce que des contributeurs ont comblé l'écart entre « la marque que vous possédez » et « le système à partir duquel vous construisez ». Un mouvement ne se livre pas depuis les ordinateurs portables d'une seule équipe ; il se livre depuis les personnes qui se sont présentées et ont construit. On vous voit. 🏛️</p>

      <h2>Lectures associées</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0 : le Bazar</a> — la version galerie-et-accueil sur laquelle celle-ci s'appuie</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0 : l'espace de travail de conception tout-en-un</a> — la version une seule fenêtre sous la boucle de build</li>
        <li><a href="/blog/what-is-vibe-design/">Qu'est-ce que le vibe design ?</a> — la version longue sur la conception par intention, le flux de travail que cette version capture en un système</li>
      </ul>
  ru:
    title: 'Open Design 0.12.0: ваш бренд — это дизайн-система'
    summary: 'Тег open-design-v0.12.0 — 103 PR от 30 контрибьюторов за шесть дней. Кодовое название «дизайн-система на основе бренда». Наведите Open Design на живой сайт, бросьте в него файл Figma или вырежьте страницу прямо в браузере — и он поднимет реальный бренд: цвета, шрифты, голос — в переиспользуемую дизайн-систему, от которой можно отталкиваться в каждом следующем проекте.'
    bodyHtml: |
      <p>Тег <code>open-design-v0.12.0</code>, выпущен 26 июня 2026 года. <strong>103 PR от 30 контрибьюторов за шесть дней.</strong> Кодовое название «дизайн-система на основе бренда». Последние два месяца Open Design начинал с чистого листа и проектировал <em>для</em> вас. Этот релиз переворачивает это: <strong>бренд, которым вы уже владеете, становится переиспользуемой дизайн-системой.</strong></p>
      <p>Если вам нужна развёрнутая версия, она есть в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">примечаниях к релизу на GitHub</a>. Этот пост — краткая версия: что изменилось под капотом, что вы можете сделать с этим уже сегодня и с чего начать.</p>

      <h2>Ваш бренд — это дизайн-система</h2>
      <p>Это главная фишка 0.12.0. До сих пор единственным способом получить точную по бренду дизайн-систему было вручную написать <code>DESIGN.md</code> — стена для любого, кто ещё не погружён в спецификацию. Теперь <strong>каждый путь импорта питает один конвейер.</strong></p>
      <p>Наведите Open Design на <strong>URL бренда</strong>, бросьте в него <code>DESIGN.md</code>, передайте ему <strong>офлайн-файл <code>.fig</code></strong> (декодируется локально, без аккаунта Figma) или захватите страницу новым <strong>браузерным клиппером</strong> — и каждый из них извлекается в переиспользуемую дизайн-систему <code>user:</code>. Потому что в этом вся идея релиза: <strong>бренд — это не отдельная вещь, он <em>и есть</em> дизайн-система.</strong> Захватите его один раз — и он проходит через один непрерывный цикл, ваш, чтобы переиспользовать в каждом следующем проекте.</p>
      <p>Дальше это один цикл, от начала до конца: посмотрите систему в превью как набор плюс шаблоны, <strong>стройте прямо из неё</strong> (онбординг теперь завершается шагом сборки) и <strong>в один клик экспортируйте</strong> результат в PDF, PPTX, редактируемый PPTX или изображение. Захваченные логотипы, скриншоты и палитры наконец обретают дом в новой <strong>OD Library</strong> — реестре ассетов с адресацией по содержимому. А свежая установка теперь поставляется со <strong>150 готовыми дизайн-системами брендов</strong> — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber и другими — так что пикер полезен с первого дня. CLI сохраняет полный паритет: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="Миниатюра живого сайта поднимается вверх и разделяется на небольшой набор токенов бренда — ряд образцов цвета, образец шрифта и плитку логотипа — собранных на одну переиспользуемую карточку дизайн-системы, удержанную внутри зелёной рамки выделения, на почти белом редакторском фоне" />
        <figcaption>Наведите его на бренд — и он поднимет цвета, шрифты и голос в переиспользуемую дизайн-систему.</figcaption>
      </figure>

      <h2>Сбои, которые наконец говорят, что сломалось</h2>
      <p>Пугающее всеохватное «execution_failed» ушло. Запуски теперь <strong>называют свою причину</strong> — крах при старте, истечение возобновления, агент, застрявший в цикле инструмента, устаревшая конфигурация провайдера — так что вы знаете, повторить или сообщить. А когда запуск <em>может</em> восстановиться, он теперь <strong>отступает с джиттером и повторяет сам</strong> вместо того, чтобы упасть.</p>
      <p>Небольшое изменение с большой отдачей: раньше сбой был тупиком, к которому прилагалось разве что пожатие плечами. Теперь он указывает вам путь к решению — а те, что поддаются восстановлению, тихо устраняются сами.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Один серый безымянный блок сбоя запуска рядом с чётко подписанной карточкой сбоя, которая называет свою причину и показывает изгибающуюся назад стрелку повтора, подписанная карточка удержана внутри зелёной рамки выделения, на почти белом редакторском фоне" />
        <figcaption>Названные причины заменяют непрозрачное серое ведро — а восстановимые запуски повторяются сами.</figcaption>
      </figure>

      <h2>Вход, который переживает плохую передачу в браузер</h2>
      <p>Раньше облачный вход молча висел пять минут, если передача в браузер давала сбой. Теперь он <strong>печатает URL и код для входа прямо тут</strong>, так что вы можете завершить вручную, а весь шаг онбординга Connect был переделан в аккуратную посадочную страницу облачного входа. Первое, к чему прикасается новый пользователь, больше не ломается из-за капризного браузера.</p>

      <h2>Что ещё вошло в 0.12.0</h2>
      <p>Релиз обширный. Вот ещё несколько частей, которые стоит вынести вперёд:</p>
      <ul>
        <li><strong>Ваш кодинг-агент — меньше шероховатостей.</strong> Более устойчивое определение бинарника OpenCode на npm, обнаружение Node в Windows через <code>fnm</code>, разрешение <code>pnpm</code> через Corepack, централизованная политика провайдеров рассуждений, предпочтительная генерация изображений по подписке Codex и скрытый лаунчер Warp там, где ему не место.</li>
        <li><strong>Более чёткие PDF и обработка презентаций.</strong> Экспорт PDF теперь ждёт, пока страница будет готова к печати, прежде чем сработать, имена печатаемых файлов безопасны для Teams, определение презентаций подхватывает классы с префиксом слайдов, а скриншоты HTML-PPT больше не зависят от установленного системного Chrome.</li>
        <li><strong>Десктоп, который показывает свою работу.</strong> Заставка показывает реальный прогресс этапов загрузки вместо застывшего логотипа, носит написанный с заглавных букв логотип-надпись «Open Design», а обновления полезной нагрузки устанавливаются прямо в приложении, как вы и ожидаете.</li>
        <li><strong>Больше лоска в вебе.</strong> Обновлённая домашняя страница с исправлениями адаптивности под мобильные, пост в блоге «Что такое vibe-дизайн» на 18 локалях плюс более широкий кластер про vibe-дизайн, проход по SEO-метаданным по всему сайту и официальный аккаунт, унифицированный в <strong>@OpenDesignHQ</strong>.</li>
        <li><strong>Проще для самостоятельного хостинга.</strong> Образ среды выполнения поставляется с <code>bash</code> и <code>git</code>, дефолты Docker согласованы с релизами GHCR, есть опциональный флаг отключения авторизации API для доверенных сетей и новый вариант развёртывания Sealos в один клик.</li>
      </ul>
      <p>Полный список насчитывает 103 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">Примечания к релизу на GitHub</a> содержат остальное.</p>

      <h2>Что делать с этим уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктопное приложение и выберите одну из 150 предзагруженных дизайн-систем брендов — онбординг теперь завершается настоящим шагом сборки</td></tr>
          <tr><td>Приносите собственный бренд</td><td>Наведите его на URL вашего бренда, бросьте <code>DESIGN.md</code>, передайте офлайн-<code>.fig</code> или вырежьте страницу в браузере — все четыре питают одну переиспользуемую дизайн-систему</td></tr>
          <tr><td>Готовите презентацию или документ</td><td>Стройте прямо из вашей дизайн-системы и в один клик экспортируйте в PDF, PPTX, редактируемый PPTX или изображение</td></tr>
          <tr><td>Столкнулись с неудавшимся запуском</td><td>Запустите его заново — сбои теперь называют свою причину, а восстановимые отступают и повторяют сами</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Бренд — это не отдельный ассет, который вы заново описываете в каждом проекте, он <em>и есть</em> дизайн-система. Скачайте десктопное приложение, наведите Open Design на бренд, которым вы уже владеете, и смотрите, как он поднимает цвета, шрифты и голос в нечто, от чего можно отталкиваться уже сегодня и переиспользовать в каждом следующем проекте.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>103 PR за шесть дней от 30 человек, превращающих чистый лист в точку старта. Дизайн-системы на основе бренда существуют потому, что контрибьюторы закрыли разрыв между «брендом, которым вы владеете» и «системой, от которой вы строите». Движение не выпускается с ноутбуков одной команды; оно выпускается людьми, которые пришли и строили. Мы видим вас. 🏛️</p>

      <h2>Похожие материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: базар</a> — релиз галереи-и-приветствия, на котором строится этот</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: единое рабочее пространство для дизайна</a> — релиз одного окна под циклом сборки</li>
        <li><a href="/blog/what-is-vibe-design/">Что такое vibe-дизайн?</a> — более развёрнутый взгляд на проектирование по намерению, рабочий процесс, который этот релиз захватывает в систему</li>
      </ul>
  es:
    title: 'Open Design 0.12.0: tu marca es un sistema de diseño'
    summary: 'Tag open-design-v0.12.0: 103 PRs de 30 colaboradores en seis días. Nombre en clave «Sistema de Diseño Respaldado por la Marca». Apunta Open Design a un sitio en vivo, suelta un archivo de Figma o recorta una página en tu navegador, y extrae la marca real —colores, tipografía, voz— en un sistema de diseño reutilizable a partir del cual construir en cada proyecto posterior.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.12.0</code>, publicado el 26 de junio de 2026. <strong>103 PRs de 30 colaboradores en seis días.</strong> Nombre en clave «Sistema de Diseño Respaldado por la Marca». Durante los últimos dos meses Open Design partía de una página en blanco y diseñaba <em>para</em> ti. Esta versión le da la vuelta: <strong>la marca que ya posees se convierte en un sistema de diseño reutilizable.</strong></p>
      <p>Si quieres la versión larga, las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">notas de la versión en GitHub</a> la tienen. Esta publicación es la versión corta: qué cambió por dentro, qué puedes hacer con ello hoy y por dónde empezar.</p>

      <h2>Tu marca es un sistema de diseño</h2>
      <p>Este es el plato fuerte de 0.12.0. Hasta ahora, la única forma de conseguir un sistema de diseño fiel a la marca era redactar a mano un <code>DESIGN.md</code>: un muro para cualquiera que no estuviera ya empapado en la especificación. Ahora <strong>cada ruta de ingesta alimenta una sola tubería.</strong></p>
      <p>Apunta Open Design a una <strong>URL de marca</strong>, suelta un <code>DESIGN.md</code>, dale un <strong>archivo <code>.fig</code> sin conexión</strong> (decodificado localmente, sin cuenta de Figma), o captura una página con el nuevo <strong>recortador de navegador</strong>, y cada uno se extrae en un sistema de diseño <code>user:</code> reutilizable. Porque esa es la idea central de esta versión: <strong>una marca no es algo aparte, <em>es</em> un sistema de diseño.</strong> Captúrala una vez y recorre un único ciclo ininterrumpido, tuyo para reutilizar en cada proyecto posterior.</p>
      <p>A partir de ahí es un solo ciclo, de extremo a extremo: previsualiza el sistema como un kit más plantillas, <strong>construye directamente a partir de él</strong> (la incorporación ahora termina en un paso de construcción), y <strong>exporta con un clic</strong> el resultado a PDF, PPTX, PPTX editable o imagen. Los logos, capturas de pantalla y paletas capturados por fin tienen un hogar en la nueva <strong>OD Library</strong>, un registro de activos direccionado por contenido. Y una instalación nueva ahora viene con <strong>150 sistemas de diseño de marca listos para usar</strong> —Airbnb, Stripe, Vercel, Tesla, Supabase, Uber y más— para que el selector sea útil desde el primer día. La CLI mantiene plena paridad: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="La miniatura de un sitio web en vivo siendo levantada hacia arriba y separada en un pequeño conjunto de tokens de marca —una fila de muestras de color, una muestra de tipografía y una baldosa de logo— reunidos en una sola tarjeta de sistema de diseño reutilizable sostenida dentro de un marco de selección verde, sobre un fondo editorial casi blanco" />
        <figcaption>Apúntalo a una marca y extrae colores, tipografía y voz en un sistema de diseño reutilizable.</figcaption>
      </figure>

      <h2>Fallos que por fin te dicen qué se rompió</h2>
      <p>El temido «execution_failed» genérico para todo desapareció. Las ejecuciones ahora <strong>nombran su causa</strong> —un fallo de arranque, una sesión reanudada caducada, un agente atascado en un bucle de herramientas, una configuración de proveedor obsoleta— para que sepas si reintentar o reportar. Y cuando una ejecución <em>puede</em> recuperarse, ahora <strong>se repliega con jitter y reintenta por su cuenta</strong> en lugar de caerse.</p>
      <p>Es un cambio pequeño con una gran recompensa: un fallo solía ser un callejón sin salida con un encogimiento de hombros adjunto. Ahora te señala la solución, y los recuperables se arreglan solos en silencio.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Un bloque gris sin etiqueta de fallo de ejecución junto a una tarjeta de fallo claramente etiquetada que nombra su causa y muestra una flecha de reintento curvándose de vuelta, con la tarjeta etiquetada sostenida dentro de un marco de selección verde, sobre un fondo editorial casi blanco" />
        <figcaption>Causas con nombre reemplazan el opaco cubo gris, y las ejecuciones recuperables se reintentan solas.</figcaption>
      </figure>

      <h2>Inicio de sesión que sobrevive a un mal traspaso del navegador</h2>
      <p>El inicio de sesión en la nube solía colgarse durante cinco minutos en silencio si el traspaso del navegador fallaba. Ahora <strong>imprime ahí mismo la URL y el código de inicio de sesión</strong> para que puedas terminar a mano, y todo el paso de Conexión de la incorporación se rediseñó en una limpia pantalla de inicio de sesión en la nube. Lo primero que toca un usuario nuevo ya no se rompe por un navegador que se porta mal.</p>

      <h2>Qué más llega en 0.12.0</h2>
      <p>La versión es amplia. Algunas piezas más que vale la pena destacar:</p>
      <ul>
        <li><strong>Tu coding agent, con menos asperezas.</strong> Detección más estable del binario de OpenCode en npm, descubrimiento de Node en Windows mediante <code>fnm</code>, resolución de <code>pnpm</code> a través de Corepack, una política centralizada de proveedor de razonamiento, generación de imágenes preferida por suscripción de Codex, y el lanzador de Warp oculto donde no corresponde.</li>
        <li><strong>PDFs más nítidos y mejor manejo de presentaciones.</strong> La exportación a PDF ahora espera a que la página esté lista para imprimir antes de dispararse, los nombres de archivo impresos son seguros para Teams, la detección de presentaciones reconoce clases con prefijo de diapositiva, y las capturas de HTML-PPT ya no dependen de tener instalado un Chrome del sistema.</li>
        <li><strong>Un escritorio que muestra su trabajo.</strong> La pantalla de bienvenida muestra el progreso real de las etapas de arranque en lugar de un logo congelado, luce el wordmark «Open Design» con mayúscula inicial, y las actualizaciones de payload se instalan dentro de la app tal como esperarías.</li>
        <li><strong>Más pulido en la web.</strong> Una página de inicio renovada con correcciones de adaptabilidad móvil, una publicación de blog «What is vibe design» en 18 idiomas más un clúster más amplio de vibe design, una pasada de metadatos SEO en todo el sitio, y la cuenta oficial unificada en <strong>@OpenDesignHQ</strong>.</li>
        <li><strong>Más fácil de autoalojar.</strong> La imagen de runtime incluye <code>bash</code> y <code>git</code>, los valores por defecto de Docker se alinean con las releases de GHCR, hay un flag opcional para desactivar la autenticación de API en redes de confianza, y una nueva opción de despliegue en Sealos con un clic.</li>
      </ul>
      <p>La lista completa llega a 103 PRs. Las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">notas de la versión en GitHub</a> tienen el resto.</p>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio y elige uno de los 150 sistemas de diseño de marca preinstalados: la incorporación ahora termina en un paso de construcción real</td></tr>
          <tr><td>Trayendo tu propia marca</td><td>Apúntalo a la URL de tu marca, suelta un <code>DESIGN.md</code>, dale un <code>.fig</code> sin conexión, o recorta una página en el navegador: los cuatro alimentan un único sistema de diseño reutilizable</td></tr>
          <tr><td>Vas a entregar una presentación o un documento</td><td>Construye directamente a partir de tu sistema de diseño y exporta con un clic a PDF, PPTX, PPTX editable o imagen</td></tr>
          <tr><td>Te topaste con una ejecución fallida</td><td>Vuelve a ejecutarla: los fallos ahora nombran su causa, y los recuperables se repliegan y reintentan por su cuenta</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>Una marca no es un activo aparte que vuelves a describir en cada proyecto: <em>es</em> un sistema de diseño. Descarga la aplicación de escritorio, apunta Open Design a una marca que ya posees, y mírala extraer colores, tipografía y voz en algo a partir de lo cual construir hoy y reutilizar en cada proyecto posterior.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>103 PRs en seis días, de 30 personas convirtiendo una página en blanco en un punto de partida. Los sistemas de diseño respaldados por la marca existen porque los colaboradores cerraron la brecha entre «la marca que posees» y «el sistema a partir del cual construyes». Un movimiento no se entrega desde los portátiles de un solo equipo; se entrega desde las personas que se presentaron y construyeron. Os vemos. 🏛️</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: el Bazar</a> — la versión de galería y bienvenida sobre la que esta se construye</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: el espacio de trabajo de diseño todo en uno</a> — la versión de una sola ventana que está debajo del ciclo de construcción</li>
        <li><a href="/blog/what-is-vibe-design/">¿Qué es el vibe design?</a> — la mirada más extensa sobre diseñar por intención, el flujo que esta versión captura en un sistema</li>
      </ul>
  pt-br:
    title: 'Open Design 0.12.0: sua marca é um sistema de design'
    summary: 'Tag open-design-v0.12.0 — 103 PRs de 30 contribuidores em seis dias. Codinome "Sistema de Design Lastreado na Marca". Aponte o Open Design para um site no ar, solte um arquivo Figma ou recorte uma página no seu navegador, e ele extrai a marca real — cores, tipografia, voz — para um sistema de design reutilizável a partir do qual você pode construir em todo projeto seguinte.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.12.0</code>, lançada em 26 de junho de 2026. <strong>103 PRs de 30 contribuidores em seis dias.</strong> Codinome "Sistema de Design Lastreado na Marca". Nos últimos dois meses, o Open Design partia de uma página em branco e projetava <em>para</em> você. Esta versão inverte isso: <strong>a marca que você já tem se torna um sistema de design reutilizável.</strong></p>
      <p>Se você quer a versão longa, as <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">notas de versão no GitHub</a> têm tudo. Este post é a versão curta: o que mudou por baixo dos panos, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Sua marca é um sistema de design</h2>
      <p>Este é o destaque do 0.12.0. Até agora, a única forma de obter um sistema de design fiel à marca era escrever manualmente um <code>DESIGN.md</code> — um muro para quem ainda não está imerso na especificação. Agora, <strong>todo caminho de ingestão alimenta um único pipeline.</strong></p>
      <p>Aponte o Open Design para uma <strong>URL de marca</strong>, solte um <code>DESIGN.md</code>, entregue a ele um <strong>arquivo <code>.fig</code> offline</strong> (decodificado localmente, sem conta no Figma), ou capture uma página com o novo <strong>recortador de navegador</strong> — e cada um deles extrai para um sistema de design <code>user:</code> reutilizável. Porque é essa toda a ideia por trás desta versão: <strong>uma marca não é uma coisa à parte, ela <em>é</em> um sistema de design.</strong> Capture-a uma vez e ela percorre um único ciclo ininterrupto, seu para reutilizar em todo projeto seguinte.</p>
      <p>Dali em diante é um único ciclo, de ponta a ponta: pré-visualize o sistema como um kit mais templates, <strong>construa diretamente a partir dele</strong> (a integração agora termina em uma etapa de build) e <strong>exporte com um clique</strong> o resultado para PDF, PPTX, PPTX editável ou imagem. Logos, capturas de tela e paletas capturadas finalmente têm um lar na nova <strong>OD Library</strong>, um registro de assets endereçado por conteúdo. E uma instalação nova agora vem com <strong>150 sistemas de design de marca prontos</strong> — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber e mais — de modo que o seletor já é útil no primeiro dia. A CLI mantém paridade total: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="Uma miniatura de site no ar sendo erguida para cima e separada em um pequeno conjunto de tokens de marca — uma fileira de amostras de cor, uma amostra de tipografia e um bloco de logo — reunidos em um único cartão de sistema de design reutilizável, contido dentro de um quadro de seleção verde, sobre um fundo editorial quase branco" />
        <figcaption>Aponte-o para uma marca e ele extrai cores, tipografia e voz para um sistema de design reutilizável.</figcaption>
      </figure>

      <h2>Falhas que finalmente dizem o que quebrou</h2>
      <p>O temido "execution_failed" genérico acabou. As execuções agora <strong>nomeiam sua causa</strong> — uma falha de inicialização, a expiração de uma retomada, um agente preso em um loop de ferramenta, uma configuração de provedor desatualizada — para que você saiba se deve repetir ou reportar. E quando uma execução <em>pode</em> se recuperar, ela agora <strong>recua com jitter e tenta novamente sozinha</strong> em vez de cair.</p>
      <p>É uma pequena mudança com um grande retorno: uma falha costumava ser um beco sem saída com um dar de ombros anexado. Agora ela aponta você para a correção, e as recuperáveis se corrigem silenciosamente sozinhas.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Um bloco cinza de falha de execução sem rótulo ao lado de um cartão de falha claramente rotulado que nomeia sua causa e mostra uma seta de repetição curvando-se de volta, com o cartão rotulado contido dentro de um quadro de seleção verde, sobre um fundo editorial quase branco" />
        <figcaption>Causas nomeadas substituem o balde cinza opaco — e as execuções recuperáveis se repetem sozinhas.</figcaption>
      </figure>

      <h2>Login que sobrevive a uma transferência de navegador ruim</h2>
      <p>O login na nuvem costumava travar por cinco minutos em silêncio se a transferência do navegador falhasse. Agora ele <strong>exibe a URL e o código de login ali mesmo</strong> para que você possa concluir manualmente, e toda a etapa Connect da integração foi redesenhada como uma tela limpa de login na nuvem. A primeira coisa que um novo usuário toca não quebra mais por causa de um navegador que se comporta mal.</p>

      <h2>O que mais chega no 0.12.0</h2>
      <p>A versão é ampla. Mais algumas partes que vale a pena destacar:</p>
      <ul>
        <li><strong>Seu agente de programação, com menos arestas.</strong> Detecção mais estável do binário do OpenCode no npm, descoberta do Node no Windows via <code>fnm</code>, resolução do <code>pnpm</code> pelo Corepack, uma política centralizada de provedor de raciocínio, geração de imagens preferencial por assinatura do Codex, e o lançador do Warp escondido onde ele não pertence.</li>
        <li><strong>PDFs mais nítidos e melhor tratamento de decks.</strong> A exportação de PDF agora espera a página ficar pronta para impressão antes de disparar, os nomes de arquivos impressos são seguros para o Teams, a detecção de decks reconhece classes com prefixo de slide, e as capturas de tela de HTML-PPT não dependem mais de um Chrome de sistema instalado.</li>
        <li><strong>Um desktop que mostra o que está fazendo.</strong> A tela de abertura mostra o progresso real das etapas de inicialização em vez de um logo congelado, exibe a marca nominal "Open Design" com inicial maiúscula, e as atualizações de payload são instaladas dentro do aplicativo do jeito que você esperaria.</li>
        <li><strong>Mais polimento na web.</strong> Uma página inicial repaginada com correções de responsividade para mobile, um post de blog "O que é vibe design" em 18 idiomas além de um cluster mais amplo de vibe design, uma leva de metadados de SEO em todo o site, e a conta oficial unificada em <strong>@OpenDesignHQ</strong>.</li>
        <li><strong>Mais fácil de auto-hospedar.</strong> A imagem de runtime traz <code>bash</code> e <code>git</code>, os padrões do Docker se alinham aos lançamentos do GHCR, há uma flag opcional para desabilitar a autenticação de API em redes confiáveis, e uma nova opção de implantação Sealos com um clique.</li>
      </ul>
      <p>A lista completa chega a 103 PRs. As <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">notas de versão no GitHub</a> trazem o resto.</p>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você é…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o aplicativo desktop e escolha um dos 150 sistemas de design de marca pré-carregados — a integração agora termina em uma etapa de build de verdade</td></tr>
          <tr><td>Trazendo sua própria marca</td><td>Aponte-o para a URL da sua marca, solte um <code>DESIGN.md</code>, entregue a ele um <code>.fig</code> offline ou recorte uma página no navegador — os quatro caminhos alimentam um único sistema de design reutilizável</td></tr>
          <tr><td>Entregando um deck ou documento</td><td>Construa diretamente a partir do seu sistema de design e exporte com um clique para PDF, PPTX, PPTX editável ou imagem</td></tr>
          <tr><td>Atingido por uma execução com falha</td><td>Execute novamente — as falhas agora nomeiam sua causa, e as recuperáveis recuam e tentam de novo sozinhas</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>Uma marca não é um asset separado que você redescreve a cada projeto — ela <em>é</em> um sistema de design. Baixe o aplicativo desktop, aponte o Open Design para uma marca que você já tem e veja-o extrair cores, tipografia e voz para algo a partir do qual você pode construir hoje e reutilizar em todo projeto seguinte.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>103 PRs em seis dias, de 30 pessoas transformando uma página em branco em um ponto de partida. Os sistemas de design lastreados na marca existem porque os contribuidores fecharam a lacuna entre "a marca que você tem" e "o sistema a partir do qual você constrói". Um movimento não é lançado a partir dos laptops de uma única equipe; ele é lançado pelas pessoas que apareceram e construíram. Nós vemos você. 🏛️</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: o Bazar</a> — a versão de galeria-e-acolhimento sobre a qual esta se constrói</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: o espaço de trabalho de design tudo-em-um</a> — a versão de janela única por baixo do ciclo de build</li>
        <li><a href="/blog/what-is-vibe-design/">O que é vibe design?</a> — a abordagem mais longa sobre projetar por intenção, o fluxo de trabalho que esta versão captura em um sistema</li>
      </ul>
  it:
    title: 'Open Design 0.12.0: il tuo brand è un design system'
    summary: 'Tag open-design-v0.12.0 — 103 PR da 30 contributori in sei giorni. Nome in codice "Design System supportato dal brand". Punta Open Design verso un sito live, trascina dentro un file Figma o ritaglia una pagina nel browser, e solleva il brand reale — colori, caratteri, voce — in un design system riutilizzabile da cui partire in ogni progetto successivo.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.12.0</code>, rilasciato il 26 giugno 2026. <strong>103 PR da 30 contributori in sei giorni.</strong> Nome in codice "Design System supportato dal brand". Negli ultimi due mesi Open Design partiva da una pagina bianca e progettava <em>per</em> te. Questa release ribalta la prospettiva: <strong>il brand che già possiedi diventa un design system riutilizzabile.</strong></p>
      <p>Se vuoi la versione lunga, le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">note di rilascio su GitHub</a> ce l'hanno. Questo post è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Il tuo brand è un design system</h2>
      <p>Questo è il piatto forte di 0.12.0. Fino a ora, l'unico modo per ottenere un design system fedele al brand era scrivere a mano un <code>DESIGN.md</code> — un muro per chiunque non fosse già immerso nelle specifiche. Ora <strong>ogni percorso di ingest alimenta un'unica pipeline.</strong></p>
      <p>Punta Open Design verso un <strong>URL del brand</strong>, trascina dentro un <code>DESIGN.md</code>, passagli un <strong>file <code>.fig</code> offline</strong> (decodificato in locale, senza account Figma), oppure cattura una pagina con il nuovo <strong>clipper del browser</strong> — e ciascuno di essi estrae un design system <code>user:</code> riutilizzabile. Perché è proprio questa l'idea alla base di questa release: <strong>un brand non è una cosa a sé, <em>è</em> un design system.</strong> Catturalo una volta e scorre attraverso un unico ciclo ininterrotto, tuo da riutilizzare in ogni progetto successivo.</p>
      <p>Da lì è un unico ciclo, dall'inizio alla fine: visualizza l'anteprima del sistema come kit più template, <strong>costruisci direttamente da esso</strong> (l'onboarding ora si conclude su uno step di build), ed <strong>esporta con un clic</strong> il risultato in PDF, PPTX, PPTX modificabile o immagine. Logo, screenshot e palette catturati hanno finalmente una casa nella nuova <strong>OD Library</strong>, un registro di asset indirizzato per contenuto. E una nuova installazione ora include <strong>150 design system di brand già pronti</strong> — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber e altri — così il picker è utile fin dal primo giorno. La CLI mantiene la piena parità: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="La miniatura di un sito web live che viene sollevata verso l'alto e separata in un piccolo insieme di token di brand — una riga di campioni di colore, un esempio di carattere e una tessera con il logo — raccolti su un'unica scheda di design system riutilizzabile tenuta dentro una cornice di selezione verde, su uno sfondo editoriale quasi bianco" />
        <figcaption>Puntalo verso un brand e solleva colori, caratteri e voce in un design system riutilizzabile.</figcaption>
      </figure>

      <h2>Fallimenti che finalmente ti dicono cosa si è rotto</h2>
      <p>Il temuto "execution_failed" generico è sparito. Le esecuzioni ora <strong>danno un nome alla loro causa</strong> — un crash all'avvio, la scadenza di un resume, un agent bloccato in un loop di strumenti, una configurazione di provider obsoleta — così sai se riprovare o segnalare. E quando un'esecuzione <em>può</em> riprendersi, ora <strong>arretra con jitter e riprova da sola</strong> invece di crollare.</p>
      <p>È un piccolo cambiamento con un grande beneficio: un fallimento prima era un vicolo cieco con un'alzata di spalle attaccata. Ora ti indica la soluzione, e quelli recuperabili si sistemano da soli in silenzio.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Un blocco grigio di fallimento di esecuzione senza etichetta accanto a una scheda di fallimento chiaramente etichettata che nomina la sua causa e mostra una freccia di retry che curva all'indietro, la scheda etichettata tenuta dentro una cornice di selezione verde, su uno sfondo editoriale quasi bianco" />
        <figcaption>Cause con un nome sostituiscono l'opaco contenitore grigio — e le esecuzioni recuperabili riprovano da sole.</figcaption>
      </figure>

      <h2>Un accesso che sopravvive a un passaggio di browser andato male</h2>
      <p>L'accesso al cloud prima restava appeso per cinque minuti in silenzio se il passaggio al browser faceva i capricci. Ora <strong>stampa lì sul posto l'URL di login e il codice</strong> così puoi finire a mano, e l'intero step Connect dell'onboarding è stato ridisegnato in una pulita landing di accesso al cloud. La prima cosa che un nuovo utente tocca non si rompe più su un browser che si comporta male.</p>

      <h2>Cos'altro arriva in 0.12.0</h2>
      <p>La release è ampia. Ancora qualche pezzo che vale la pena mettere in primo piano:</p>
      <ul>
        <li><strong>Il tuo coding agent, meno spigoli.</strong> Rilevamento più stabile del binario OpenCode su npm, scoperta di Node su Windows tramite <code>fnm</code>, risoluzione di <code>pnpm</code> attraverso Corepack, una policy centralizzata per i provider di reasoning, generazione di immagini preferenziale con l'abbonamento Codex, e il launcher Warp nascosto dove non deve stare.</li>
        <li><strong>PDF più nitidi e migliore gestione dei deck.</strong> L'esportazione PDF ora aspetta che la pagina sia pronta per la stampa prima di partire, i nomi dei file stampati sono a prova di Teams, il rilevamento dei deck riconosce le classi con prefisso slide, e gli screenshot HTML-PPT non dipendono più dalla presenza di un Chrome di sistema installato.</li>
        <li><strong>Un desktop che mostra il suo lavoro.</strong> La schermata di avvio mostra il progresso reale delle fasi di boot invece di un logo congelato, indossa il logotipo "Open Design" maiuscolo, e gli aggiornamenti di payload si installano nell'app come ti aspetteresti.</li>
        <li><strong>Più rifinitura sul web.</strong> Una home page rinnovata con correzioni di responsività mobile, un articolo del blog "What is vibe design" in 18 lingue più un cluster vibe-design più ampio, una revisione dei metadata SEO su tutto il sito, e l'account ufficiale unificato in <strong>@OpenDesignHQ</strong>.</li>
        <li><strong>Più facile da self-hostare.</strong> L'immagine di runtime include <code>bash</code> e <code>git</code>, le impostazioni predefinite di Docker si allineano con le release GHCR, c'è un flag opt-in per disabilitare l'auth API nelle reti fidate, e una nuova opzione di deployment Sealos con un clic.</li>
      </ul>
      <p>L'elenco completo arriva a 103 PR. Le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">note di rilascio su GitHub</a> contengono il resto.</p>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Inizia qui</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuovo su Open Design</td><td>Scarica l'app desktop e scegli uno dei 150 design system di brand precaricati — l'onboarding ora si conclude su un vero step di build</td></tr>
          <tr><td>In procinto di portare il tuo brand</td><td>Puntalo verso l'URL del tuo brand, trascina un <code>DESIGN.md</code>, passagli un <code>.fig</code> offline, oppure ritaglia una pagina nel browser — tutti e quattro alimentano un unico design system riutilizzabile</td></tr>
          <tr><td>In procinto di consegnare un deck o un documento</td><td>Costruisci direttamente dal tuo design system ed esporta con un clic in PDF, PPTX, PPTX modificabile o immagine</td></tr>
          <tr><td>Colpito da un'esecuzione fallita</td><td>Rieseguila — i fallimenti ora danno un nome alla loro causa, e quelli recuperabili arretrano e riprovano da soli</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>Un brand non è un asset a sé che ridescrivi a ogni progetto — <em>è</em> un design system. Scarica l'app desktop, punta Open Design verso un brand che già possiedi, e guardalo sollevare colori, caratteri e voce in qualcosa da cui puoi partire oggi e riutilizzare in ogni progetto successivo.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>103 PR in sei giorni, da 30 persone che trasformano una pagina bianca in un punto di partenza. I design system ancorati al brand esistono perché i contributori hanno colmato il divario tra "il brand che possiedi" e "il sistema da cui costruisci". Un movimento non viene rilasciato dai laptop di un solo team; viene rilasciato dalle persone che si sono presentate e hanno costruito. Vi vediamo. 🏛️</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: il Bazaar</a> — la release galleria-e-benvenuto su cui questa si basa</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: lo spazio di lavoro per il design tutto-in-uno</a> — la release a finestra unica sotto al ciclo di build</li>
        <li><a href="/blog/what-is-vibe-design/">Cos'è il vibe design?</a> — l'approfondimento sul progettare per intento, il flusso di lavoro che questa release cattura in un sistema</li>
      </ul>
  tr:
    title: 'Open Design 0.12.0: markanız bir tasarım sistemidir'
    summary: 'Etiket open-design-v0.12.0 — altı günde 30 katkıda bulunandan 103 PR. Kod adı "Marka Destekli Tasarım Sistemi." Open Design''ı canlı bir siteye yöneltin, bir Figma dosyası bırakın ya da tarayıcınızda bir sayfa kırpın; gerçek markayı — renkleri, yazı tipini, sesi — sonraki her projede üzerine inşa edebileceğiniz, yeniden kullanılabilir bir tasarım sistemine dönüştürsün.'
    bodyHtml: |
      <p>Etiket <code>open-design-v0.12.0</code>, 26 Haziran 2026'da yayınlandı. <strong>Altı günde 30 katkıda bulunandan 103 PR.</strong> Kod adı "Marka Destekli Tasarım Sistemi." Son iki aydır Open Design boş bir sayfadan başlıyor ve sizin <em>için</em> tasarlıyordu. Bu sürüm bunu tersine çeviriyor: <strong>hâlihazırda sahip olduğunuz marka, yeniden kullanılabilir bir tasarım sistemine dönüşüyor.</strong></p>
      <p>Uzun versiyonunu istiyorsanız, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub'daki sürüm notları</a> hepsini içeriyor. Bu yazı kısa versiyon: kaputun altında ne değişti, bununla bugün ne yapabilirsiniz ve nereden başlamalısınız.</p>

      <h2>Markanız bir tasarım sistemidir</h2>
      <p>Bu, 0.12.0'ın yıldızı. Şimdiye kadar markaya tam uygun bir tasarım sistemi elde etmenin tek yolu, elle bir <code>DESIGN.md</code> yazmaktı — spesifikasyona zaten hâkim olmayan herkes için bir duvar. Artık <strong>her alım yolu tek bir işlem hattını besliyor.</strong></p>
      <p>Open Design'ı bir <strong>marka URL'sine</strong> yöneltin, bir <code>DESIGN.md</code> bırakın, ona <strong>çevrimdışı bir <code>.fig</code> dosyası</strong> verin (yerel olarak çözülür, Figma hesabı gerekmez) ya da yeni <strong>tarayıcı kırpıcısıyla</strong> bir sayfa yakalayın — ve her biri yeniden kullanılabilir bir <code>user:</code> tasarım sistemine dönüşür. Çünkü bu sürümün ardındaki bütün fikir bu: <strong>bir marka ayrı bir şey değildir, <em>kendisi</em> bir tasarım sistemidir.</strong> Onu bir kez yakalayın, kesintisiz tek bir döngüden geçsin, sonraki her projede yeniden kullanmak sizin elinizde.</p>
      <p>Oradan sonrası baştan sona tek bir döngü: sistemi bir kit artı şablonlar olarak önizleyin, <strong>doğrudan onun üzerinden inşa edin</strong> (katılım artık bir inşa adımında bitiyor) ve sonucu <strong>tek tıkla</strong> PDF, PPTX, düzenlenebilir PPTX ya da görsel olarak dışa aktarın. Yakalanan logolar, ekran görüntüleri ve paletler nihayet, içeriğe göre adreslenen bir varlık kaydı olan yeni <strong>OD Library</strong>'de bir yuva buluyor. Ve yeni bir kurulum artık <strong>150 hazır marka tasarım sistemiyle</strong> geliyor — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber ve daha fazlası — böylece seçici ilk günden işe yarıyor. CLI tam paritesini koruyor: <code>od brand</code>, <code>od library</code>, <code>od figma import</code>, <code>od export</code>.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="Yukarı doğru kaldırılan ve küçük bir marka belirteçleri kümesine ayrılan canlı bir web sitesi küçük resmi — bir renk örneği satırı, bir yazı tipi örneği ve bir logo karosu — yeşil bir seçim çerçevesi içinde tutulan tek bir yeniden kullanılabilir tasarım sistemi kartında toplanmış hâlde, neredeyse beyaz bir editöryel zemin üzerinde" />
        <figcaption>Onu bir markaya yöneltin, renkleri, yazı tipini ve sesi yeniden kullanılabilir bir tasarım sistemine dönüştürsün.</figcaption>
      </figure>

      <h2>Sonunda neyin bozulduğunu söyleyen hatalar</h2>
      <p>Korkulan, her şeyi kapsayan "execution_failed" ortadan kalktı. Çalıştırmalar artık <strong>nedenlerini adlandırıyor</strong> — bir başlangıç çökmesi, bir oturum süresinin dolması, bir araç döngüsünde takılı kalan bir agent, eski bir sağlayıcı yapılandırması — böylece yeniden mi deneyeceğinizi yoksa bildirecek mi olduğunuzu bilirsiniz. Ve bir çalıştırma <em>kurtarılabildiğinde</em>, artık devrilmek yerine <strong>jitter ile geri çekilip kendi kendine yeniden deniyor</strong>.</p>
      <p>Küçük bir değişiklik ama büyük getirisi var: bir hata eskiden omuz silkmeyle gelen bir çıkmaz sokaktı. Artık sizi düzeltmeye yönlendiriyor ve kurtarılabilir olanlar sessizce kendi kendini düzeltiyor.</p>
      <figure>
        <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="Nedenini adlandıran ve geriye doğru kıvrılan bir yeniden deneme oku gösteren, açıkça etiketlenmiş bir hata kartının yanında, gri ve etiketsiz bir çalıştırma hatası bloğu; etiketli kart yeşil bir seçim çerçevesi içinde tutuluyor, neredeyse beyaz bir editöryel zemin üzerinde" />
        <figcaption>Adlandırılmış nedenler, anlaşılmaz gri kovanın yerini alıyor — ve kurtarılabilir çalıştırmalar kendi kendine yeniden deniyor.</figcaption>
      </figure>

      <h2>Kötü bir tarayıcı devrini atlatan oturum açma</h2>
      <p>Bulut oturum açma, tarayıcı devri aksadığında eskiden beş dakika sessizce takılıp kalırdı. Artık <strong>giriş URL'sini ve kodunu tam orada yazdırıyor</strong>, böylece elle tamamlayabiliyorsunuz ve katılımdaki tüm Connect adımı, temiz bir bulut oturum açma açılış sayfası olacak şekilde yeniden tasarlandı. Yeni bir kullanıcının dokunduğu ilk şey, yaramazlık yapan bir tarayıcıda artık bozulmuyor.</p>

      <h2>0.12.0'da başka neler var</h2>
      <p>Sürüm geniş kapsamlı. Öne çıkarılmaya değer birkaç parça daha:</p>
      <ul>
        <li><strong>Kodlama agent'ınız, daha az pürüz.</strong> npm üzerinde daha istikrarlı OpenCode ikili dosya algılaması, <code>fnm</code> aracılığıyla Windows Node keşfi, Corepack üzerinden <code>pnpm</code> çözümlemesi, merkezileştirilmiş bir akıl yürütme sağlayıcısı politikası, tercih edilen Codex abonelik görsel üretimi ve ait olmadığı yerde gizlenen Warp başlatıcısı.</li>
        <li><strong>Daha net PDF'ler ve sunum işleme.</strong> PDF dışa aktarma artık tetiklenmeden önce sayfanın yazdırmaya hazır olmasını bekliyor, yazdırılan dosya adları Teams-güvenli, sunum algılaması slayt önekli sınıfları yakalıyor ve HTML-PPT ekran görüntüleri artık sistemde kurulu bir Chrome'a bağlı değil.</li>
        <li><strong>İşini gösteren bir masaüstü.</strong> Açılış ekranı, donmuş bir logo yerine gerçek önyükleme aşaması ilerlemesini gösteriyor, büyük harfli "Open Design" sözcük markasını taşıyor ve yük güncellemeleri beklediğiniz şekilde uygulama içinde kuruluyor.</li>
        <li><strong>Web'de daha fazla cila.</strong> Mobil uyumlu düzeltmelerle tazelenmiş bir ana sayfa, 18 yerel ayarda bir "Vibe design nedir" blog yazısı ile daha geniş bir vibe-design kümesi, site genelinde bir SEO meta veri iyileştirmesi ve <strong>@OpenDesignHQ</strong>'ya birleştirilen resmi hesap.</li>
        <li><strong>Kendi sunucunuzda barındırmak daha kolay.</strong> Çalışma zamanı görüntüsü <code>bash</code> ve <code>git</code> ile geliyor, Docker varsayılanları GHCR sürümleriyle hizalı, güvenilen ağlar için isteğe bağlı bir API kimlik doğrulama devre dışı bırakma bayrağı var ve yeni bir tek tıkla Sealos dağıtım seçeneği mevcut.</li>
      </ul>
      <p>Tam liste 103 PR'a ulaşıyor. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0">GitHub'daki sürüm notları</a> geri kalanını içeriyor.</p>

      <h2>Bununla bugün ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer şuysanız…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'da yeni</td><td>Masaüstü uygulamasını indirin ve 150 hazır marka tasarım sisteminden birini seçin — katılım artık gerçek bir inşa adımında bitiyor</td></tr>
          <tr><td>Kendi markanı getiriyor</td><td>Onu marka URL'nize yöneltin, bir <code>DESIGN.md</code> bırakın, ona çevrimdışı bir <code>.fig</code> verin ya da tarayıcıda bir sayfa kırpın — dördü de tek bir yeniden kullanılabilir tasarım sistemini besler</td></tr>
          <tr><td>Bir sunum ya da belge gönderiyor</td><td>Doğrudan tasarım sisteminizin üzerinden inşa edin ve tek tıkla PDF, PPTX, düzenlenebilir PPTX ya da görsel olarak dışa aktarın</td></tr>
          <tr><td>Başarısız bir çalıştırmaya takıldı</td><td>Yeniden çalıştırın — hatalar artık nedenlerini adlandırıyor ve kurtarılabilir olanlar geri çekilip kendi kendine yeniden deniyor</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne yapmalı</h2>
      <p>Bir marka, her projede yeniden tanımladığınız ayrı bir varlık değildir — <em>kendisi</em> bir tasarım sistemidir. Masaüstü uygulamasını indirin, Open Design'ı zaten sahip olduğunuz bir markaya yöneltin ve renkleri, yazı tipini ve sesi, bugün üzerine inşa edebileceğiniz ve sonraki her projede yeniden kullanabileceğiniz bir şeye dönüştürmesini izleyin.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indirin</a>.</p>
      <p>Altı günde 103 PR, boş bir sayfayı bir başlangıç noktasına dönüştüren 30 kişiden. Marka destekli tasarım sistemleri var çünkü katkıda bulunanlar "sahip olduğunuz marka" ile "üzerine inşa ettiğiniz sistem" arasındaki boşluğu kapattı. Bir hareket tek bir ekibin dizüstü bilgisayarlarından çıkmaz; ortaya çıkıp inşa eden insanlardan çıkar. Sizi görüyoruz. 🏛️</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: Pazar Yeri</a> — bunun üzerine inşa edildiği galeri-ve-karşılama sürümü</li>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: hepsi bir arada tasarım çalışma alanı</a> — inşa döngüsünün altındaki tek pencere sürümü</li>
        <li><a href="/blog/what-is-vibe-design/">Vibe design nedir?</a> — niyetle tasarlamaya dair daha uzun bir bakış, bu sürümün bir sisteme dönüştürdüğü iş akışı</li>
      </ul>
---

Tag `open-design-v0.12.0`, shipped 26 June 2026. **103 PRs from 30 contributors in six days.** Codename "Brand-backed Design System." For the past two months Open Design started from a blank page and designed *for* you. This release flips it: **the brand you already own becomes a reusable design system.**

If you want the long version, the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0) have it. This post is the short version: what changed under the hood, what you can do with it today, and where to start.

## Your brand is a design system

This is the marquee of 0.12.0. Until now, the only way to get a brand-accurate design system was to hand-author a `DESIGN.md` — a wall for anyone not already steeped in the spec. Now **every ingest path feeds one pipeline.**

Point Open Design at a **brand URL**, drop in a `DESIGN.md`, hand it an **offline `.fig` file** (decoded locally, no Figma account), or capture a page with the new **browser clipper** — and each one extracts into a reusable `user:` design system. Because that's the whole idea behind this release: **a brand isn't a separate thing, it *is* a design system.** Capture it once and it runs through one unbroken loop, yours to reuse on every project after.

From there it's one loop, end to end: preview the system as a kit plus templates, **build straight from it** (onboarding now finishes on a build step), and **one-click export** the result to PDF, PPTX, editable PPTX, or image. Captured logos, screenshots, and palettes finally have a home in the new **OD Library**, a content-addressed asset registry. And a fresh install now ships with **150 ready-made brand design systems** — Airbnb, Stripe, Vercel, Tesla, Supabase, Uber, and more — so the picker is useful on day one. The CLI keeps full parity: `od brand`, `od library`, `od figma import`, `od export`.

<figure>
  <img src="/blog/open-design-0-12-0-brand-backed-design-system-capture.webp" alt="A warm editorial illustration of a website window lifted upward, its colors and type pulled out as swatch dots and sample bars onto one design-system card, on a cream paper ground" />
  <figcaption>Point it at a brand and it lifts colors, type, and voice into a reusable design system.</figcaption>
</figure>

## Failures that finally tell you what broke

The dreaded catch-all "execution_failed" is gone. Runs now **name their cause** — a startup crash, a resume expiry, an agent stuck in a tool loop, a stale provider config — so you know whether to retry or report. And when a run *can* recover, it now **backs off with jitter and retries on its own** instead of falling over.

It's a small change with a big payoff: a failure used to be a dead end with a shrug attached. Now it points you at the fix, and the recoverable ones quietly fix themselves.

<figure>
  <img src="/blog/open-design-0-12-0-brand-backed-design-system-diagnose.webp" alt="A warm editorial illustration of two app cards, one faded and one marked with a status dot and a curved retry arrow looping back, on a cream paper ground" />
  <figcaption>Named causes replace the opaque grey bucket — and recoverable runs retry themselves.</figcaption>
</figure>

## Sign-in that survives a bad browser handoff

Cloud sign-in used to hang for five minutes in silence if the browser handoff flaked. Now it **prints the login URL and code right there** so you can finish by hand, and the whole onboarding Connect step was redesigned into a clean cloud sign-in landing. The first thing a new user touches no longer breaks on a browser that misbehaves.

## What else lands in 0.12.0

The release is wide. A few more pieces worth pulling forward:

- **Your coding agent, fewer rough edges.** Steadier OpenCode binary detection on npm, Windows Node discovery via `fnm`, `pnpm` resolution through Corepack, a centralized reasoning-provider policy, preferred Codex subscription image generation, and the Warp launcher hidden where it doesn't belong.
- **Sharper PDFs and deck handling.** PDF export now waits for the page to be print-ready before firing, printed filenames are Teams-safe, deck detection picks up slide-prefixed classes, and HTML-PPT screenshots no longer depend on a system Chrome being installed.
- **A desktop that shows its work.** The splash screen shows real boot-stage progress instead of a frozen logo, wears the capitalized "Open Design" wordmark, and payload updates install in-app the way you'd expect.
- **More polish on the web.** A refreshed home page with mobile-responsive fixes, a "What is vibe design" blog post in 18 locales plus a wider vibe-design cluster, a site-wide SEO metadata pass, and the official account unified to **@OpenDesignHQ**.
- **Easier to self-host.** The runtime image ships `bash` and `git`, Docker defaults align with the GHCR releases, there's an opt-in API-auth-disable flag for trusted networks, and a new one-click Sealos deployment option.

The full list runs to 103 PRs. The [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.12.0) carry the rest.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app and pick one of the 150 seeded brand design systems — onboarding now finishes on a real build step |
| Bringing your own brand | Point it at your brand URL, drop a `DESIGN.md`, hand it an offline `.fig`, or clip a page in the browser — all four feed one reusable design system |
| Shipping a deck or doc | Build straight from your design system and one-click export to PDF, PPTX, editable PPTX, or image |
| Hit by a failed run | Re-run it — failures now name their cause, and the recoverable ones back off and retry on their own |

## What to do next

A brand isn't a separate asset you re-describe every project — it *is* a design system. Download the desktop app, point Open Design at a brand you already own, and watch it lift colors, type, and voice into something you can build from today and reuse on every project after.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

103 PRs in six days, from 30 people turning a blank page into a starting point. Brand-backed design systems exist because contributors closed the gap between "the brand you own" and "the system you build from." A movement doesn't ship from one team's laptops; it ships from the people who showed up and built. We see you. 🏛️

## Related reading

- [Open Design 0.11.0: the Bazaar](/blog/open-design-0-11-0-the-bazaar/) — the gallery-and-welcome release this one builds on
- [Open Design 0.10.0: the all-in-one design workspace](/blog/open-design-0-10-0-all-in-one-workspace/) — the one-window release underneath the build loop
- [What is vibe design?](/blog/what-is-vibe-design/) — the longer take on designing by intent, the workflow this release captures into a system
