---
title: "Open Design 0.16.0: reliable delivery"
date: 2026-07-22
category: "Product"
readingTime: 7
summary: "open-design-v0.16.0 — 92 PRs from 20 contributors in five days. Codename \"Reliable Delivery.\" Visual direction now follows whatever you are actually making, automatic updates take effect properly, long tasks keep their answer and the files that came with it, and previews stop fighting the frame. Plus a message center inside the app — and the 0.16.1 patch that cleared the last thing covering your canvas."
socialImage: "/blog/open-design-0-16-0-reliable-delivery-cover.webp"
ctaKind: download-app
i18n:
  zh:
    title: 'Open Design 0.16.0：可靠交付'
    summary: 'open-design-v0.16.0 —— 五天内 20 位贡献者提交了 92 个 PR。代号「可靠交付（Reliable Delivery）」。视觉风格现在会跟着你手上真正在做的东西走，自动更新会真正生效，长任务能留住结果和随之产出的文件，预览也不再跟你较劲。另有应用内消息中心——以及 0.16.1 顺手清掉的最后一样挡住画布的东西。'
    category: '产品'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>，于 2026 年 7 月 22 日发布。<strong>五天内 20 位贡献者提交了 92 个 PR。</strong>代号「可靠交付（Reliable Delivery）」。上一次发布针对的是每次运行的成本，这一次针对的是「结果做完了」和「它真正到你手上」之间发生的事：只更新了一半的版本、丢了文件的长任务、要跟你较劲的预览、少了一页的导出。</p>
      <p>想看完整的更新日志？它就在 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">GitHub 上的发布说明</a>里。本文是精简版：底层改了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>视觉风格跟着你手上真正在做的东西走</h2>
      <p>过去，风格是只有演示文稿和原型才能做的决定。其余的一切——文档、海报、视频、Web Clone、线框图、移动端稿、Hyperframe——都只能听凭模型自由发挥。</p>
      <p>在 0.16.0 里，<strong>每一种产物形态都有自己的视觉方向</strong>，预览也按这种形态真正被看到的样子来渲染。四个快捷选项就摆在你工作的地方，完整的风格库一次点击即达。你直接为眼前这件东西挑一个样子，而不用在脑子里把一套演示主题翻译成一张海报。</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="草图上画着文档、海报、视频、手机屏等不同产物形态，各自变成一张比例正确的风格预览，落在一个安静的鼠尾草绿界面里，暖纸编辑插画风格" />
        <figcaption>文档、海报、视频、Web Clone、线框图、移动端稿与 Hyperframe，各自获得适配自身形态的预览——四个选项就在手边，完整风格库一次点击即达。</figcaption>
      </figure>

      <h2>真正会生效的更新</h2>
      <p>只更新了一半，比没更新更糟：应用报着新版本号，某个功能却还悄悄跑在旧版上。0.16.0 让升级真正落地。<strong>更新之后，新版本会更可靠地生效，那些因更新不完整而损坏的功能——包括 PPTX 导出——也重新能用了。</strong></p>
      <p>在 macOS 上，「检查更新…」现在会明确告诉你处在哪个状态：已是最新、正在下载、可以重启、正在等待手头的工作结束，或需要手动下载。Windows 的更新可靠性同样有提升。感谢 <a href="https://github.com/PerishCode">@PerishCode</a> 在这条线上的长期投入。</p>

      <h2>长任务留得住结果，也留得住文件</h2>
      <p>长时间运行是最有价值的工作所在，也曾经是工作最容易凭空消失的地方。在 0.16.0 里，逼近对话上限的任务<strong>会带着最新的有用上下文继续，而不是骤然失败</strong>，运行早期生成的文件也<strong>会跟着结果一起保留</strong>，不再随压缩一起消失。</p>
      <p>失败路径也变得更诚实了：被恢复的辅助 agent 不再把成功的工作报成失败，被打断的任务在重启后显示的是准确状态，取消掉的工作会保持取消，而真正无法恢复的错误会停下来给出一个你能据此行动的解释，而不是一个转圈的加载动画。</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="一根不断裂的线带着一摞已生成的文件卡片穿过收窄的关口，完整抵达一个安静的鼠尾草绿界面，暖纸编辑插画风格" />
        <figcaption>逼近上下文上限不再终结这次运行——任务带着最新的有用上下文继续，已经产出的文件也随之抵达。</figcaption>
      </figure>

      <h2>产品动态在应用里有了自己的位置</h2>
      <p>0.16.0 新增：<strong>首页与项目页顶部的一个铃铛，背后是消息中心</strong>——未读计数、筛选、一键全部已读，以及直达对应内容的链接。未读状态在匿名使用时留在本机，登录后则跟随账号；日期按你的语言环境渲染，关闭按钮永远在你以为它在的地方。感谢 <a href="https://github.com/nettee">@nettee</a>。</p>

      <h2>BYOK 在打断你之前就发现配置问题</h2>
      <p>自带密钥应该在配置阶段失败，而不是在任务跑了三分钟之后。<strong>没写完的修改现在会作为可恢复的草稿保留，而不是覆盖掉一份能用的配置</strong>，一次改到一半的调整因此不会拖垮你依赖的服务商。</p>
      <p>连接测试的行为更接近真实任务，会把服务商的真实报错呈现出来，并保留每家服务商自己的模型排序——不再让一个按字母排序的列表把你要的模型埋掉。兼容的 MiniMax、DeepSeek 与 MiMo 地址处理得更一致，过时的 Moonshot 与 DeepSeek 默认值指向了当前可用的模型，设置页与新手引导终于展示同一份选项。Memory 也能用上你已保存的兼容 MiniMax 密钥，遇到只支持图像或音频的服务商时会直说。</p>

      <h2>预览不再跟你较劲</h2>
      <p>摩擦很小，但天天都能感觉到。宽幅桌面页面现在<strong>会自适应窗格，直到你自己选择缩放比例</strong>，老的演示文稿会立刻响应导航按键，最新的主 HTML 文件在任务一结束就出现，而不用手动刷新。当某个素材因安全原因被拦下时，预览会指出相关的项目文件，而不暴露敏感的系统路径。</p>
      <p>图像生成也更稳了：<strong>Nano Banana 与自定义图像生成在服务商短暂繁忙时会自动重试一次</strong>，GPT Image 的参考图编辑在更多兼容服务上可用。一次抖动只是短暂等待，而不再白白丢掉一轮创作。</p>

      <h2>0.16.0 还带来了什么</h2>
      <ul>
        <li><strong>Gallery 优先展示真正有人在用的东西</strong>——幻灯片、图像、视频等非原型 Gallery会把真实使用量高的模板排在前面，空白条目和没有预览的卡片不再挤占顶部。原型仍保留人工策展的橱窗位，每个分类的完整目录也都还在。</li>
        <li><strong>设计系统导入还原度更高</strong>——仓库导入会选对流程，拆分的 token 包会保留布局值，常见的 YAML 列表与多行格式也保住了作者写下的元数据。</li>
        <li><strong>本地安全边界更牢</strong>——导入的项目会保护隐藏的凭证，删除插件只动这个插件自己的文件，市场与已保存站点的内容处理得更谨慎，每段对话也都稳稳挂在正确的项目上。</li>
        <li><strong>发布前先预览</strong>——Cloudflare Pages 部署现在在界面和 <code>od deploy --target … --json</code> 里都把 Preview 与 Production 作为明确的目标，预览会返回自己的 URL，而不是顶掉你的线上域名。</li>
        <li><strong>Kiro 加入 MCP 配置选择器</strong>——直接从设置里复制正确的共享服务端片段，不用再手动翻译另一个客户端的格式。</li>
        <li><strong>值得一提的零碎修复</strong>——MCP 的后续追问能收到最新一条消息，ACP 历史刷新后不再长出空行，搭载较老处理器的 Windows 设备也能通过常规更新路径重新运行 OpenCode。</li>
      </ul>

      <h2>已经补上：0.16.1</h2>
      <p>第二天，<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> 带来了一处针对设计预览的集中修复：<strong>运行状态不再盖住你生成的作品。</strong>构建中、已完成、交付恢复这几种状态都留在聊天里——那里依然是你跟进进度或重试失败交付的地方——画布则完全归你。今天要下载的话，就装 0.16.1。</p>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用、开一个项目，然后为你正在做的形态挑一个专门的视觉方向</td></tr>
          <tr><td>在跑长任务</td><td>把一次长运行推得更远——撞到上下文上限现在会带着最新的有用上下文继续，文件完整保留</td></tr>
          <tr><td>还停在旧版本</td><td>跑一次「检查更新…」——更新状态现在是明确的，升级后 PPTX 导出也能用了</td></tr>
          <tr><td>在用自己的密钥</td><td>重新测一遍你的 BYOK 服务商：报错会在配置阶段就出现，草稿也不会覆盖能用的配置</td></tr>
          <tr><td>整天泡在预览里</td><td>重新打开一个宽幅桌面页面或一份老演示文稿——画框会自适应，按键也有响应</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>一个值得信赖的版本，多半就是一个不再弄丢东西的版本。0.16.0 把预算花在了这里——一次真正落地的更新、一个留得住文件的长任务、一种匹配形态的风格、一个懂得让开的预览。下载桌面应用，重跑你手上最长的那个任务，看着它完整抵达。</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">下载 Open Design</a>。</p>
      <p>五天 92 个 PR，来自 20 个人，每个人都把「结果做完」和「东西交到手上」之间的一道缝隙补上了一点。可靠是不显眼的活儿，却是让其他一切显得可信的那件活儿。我们看见你们了。🚀</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1：看得更清，跑得更久</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0：更省成本，更快交付</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0：灵感时光机</a></li>
      </ul>
  ja:
    title: 'Open Design 0.16.0 — 確実に届く'
    summary: 'open-design-v0.16.0 — 5 日間で 20 人のコントリビューターから 92 の PR。コードネームは「Reliable Delivery」。ビジュアルの方向性が実際に作っているものに追従し、自動アップデートがきちんと効き、長いタスクが答えと生成物を手放さず、プレビューが枠と争わなくなりました。アプリ内のメッセージセンターと、キャンバスを覆う最後の一点を片づけた 0.16.1 も。'
    category: 'プロダクト'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>、2026 年 7 月 22 日公開。<strong>5 日間で 20 人のコントリビューターから 92 の PR。</strong>コードネームは「Reliable Delivery」。前回のリリースは 1 回の実行にかかるコストに向き合いました。今回は、成果が仕上がってから実際にあなたの手元に届くまでの間に起きること — 中途半端に当たったアップデート、ファイルを失った長いタスク、戦わないと使えないプレビュー、1 枚落ちた書き出し — に向き合います。</p>
      <p>変更履歴の全文は <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">GitHub のリリースノート</a>にあります。ここでは短い版を: 下で何が変わり、今日それで何ができ、どこから始めるか。</p>

      <h2>ビジュアルの方向性が、作っているものに追従する</h2>
      <p>スタイルは長らく、スライドとプロトタイプにしか下せない判断でした。それ以外 — ドキュメント、ポスター、動画、Web Clone、ワイヤーフレーム、モバイル、Hyperframe — はモデルの気分任せで始まっていました。</p>
      <p>0.16.0 では<strong>あらゆるフォーマットが独自のビジュアル方向性を持ち</strong>、プレビューもそのフォーマットが実際に見られる形でレンダリングされます。作業中の場所に 4 つの候補が並び、スタイルライブラリ全体はワンクリック先。目の前のものに合う見た目をそのまま選べます。スライドのテーマを頭の中でポスターに翻訳する必要はありません。</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="ドキュメント、ポスター、動画、モバイル画面といったフォーマットのスケッチが、それぞれ正しい比率のスタイルプレビューとなって穏やかなセージグリーンの画面に収まる、暖かなエディトリアル調のイラスト" />
        <figcaption>ドキュメント、ポスター、動画、Web Clone、ワイヤーフレーム、モバイル、Hyperframe に、それぞれのフォーマットに合ったプレビューを。4 つの候補は手元に、ライブラリ全体はワンクリック先に。</figcaption>
      </figure>

      <h2>ちゃんと効くアップデート</h2>
      <p>半分だけ当たったアップデートは、当たらないより厄介です。アプリは新しいバージョンを名乗りながら、ある機能は静かに古いままで動きます。0.16.0 はアップグレードを着地させます。<strong>更新後、新しいバージョンがより確実に有効になり、不完全な更新で壊れていた機能 — PPTX の書き出しを含む — がまた動きます。</strong></p>
      <p>macOS では「アップデートを確認…」が、いまどの状態かをはっきり示します。最新、ダウンロード中、再起動の準備完了、進行中の作業の終了待ち、手動ダウンロードが必要。Windows の更新の信頼性も向上しました。この領域で長く手を動かしてくれた <a href="https://github.com/PerishCode">@PerishCode</a> に感謝を。</p>

      <h2>長いタスクは答えを — そしてファイルを — 手放さない</h2>
      <p>もっとも価値のある仕事は長い実行の中にあり、そしてもっとも仕事が消えやすい場所でもありました。0.16.0 では、会話の上限に近づいたタスクが<strong>突然失敗するのではなく、最新の有用なコンテキストで継続します</strong>。実行の早い段階で生成されたファイルも<strong>結果に付いたまま残り</strong>、圧縮とともに消えることはありません。</p>
      <p>失敗の経路も正直になりました。復帰した補助エージェントが成功した仕事を失敗として報告することはなくなり、中断されたタスクは再起動後に正確な状態を示し、キャンセルした作業はキャンセルのままで、本当に復旧できないエラーは回り続けるスピナーではなく、行動につながる説明とともに停止します。</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="切れない一本の糸が生成済みのファイルカードの束を運び、狭まったゲートを抜けて穏やかなセージグリーンの画面へ無事に届く、暖かなエディトリアル調のイラスト" />
        <figcaption>コンテキストの上限に近づいても実行は終わりません。タスクは最新の有用なコンテキストで続き、すでに作られたファイルも一緒に届きます。</figcaption>
      </figure>

      <h2>プロダクトのお知らせがアプリの中に居場所を得た</h2>
      <p>0.16.0 の新機能: <strong>ホームとプロジェクトのヘッダーにあるベルの奥にメッセージセンター</strong>。未読件数、フィルター、すべて既読、そして告知の対象へ直接つながるリンク。既読状態は匿名利用ならその端末に残り、サインインしていればアカウントに従います。日付はあなたのロケールで表示され、閉じるボタンはいつも思った場所にあります。<a href="https://github.com/nettee">@nettee</a> に感謝。</p>

      <h2>BYOK は、あなたを止める前に設定の問題を捕まえる</h2>
      <p>自分の鍵を持ち込む設定は、タスクが 3 分走った後ではなく、設定の時点で失敗すべきです。<strong>書きかけの編集は、動いている設定を上書きせず、復元可能な下書きとして残ります。</strong>途中まで直した変更が、頼りにしているプロバイダーを巻き添えにすることはありません。</p>
      <p>接続テストは実際のタスクに近い挙動になり、プロバイダー本来のエラーを見せ、各プロバイダー自身のモデル順を保ちます。目当てのモデルがアルファベット順の中に埋もれることもありません。互換の MiniMax、DeepSeek、MiMo のアドレスの扱いはより一貫し、古い Moonshot と DeepSeek の既定値は現行モデルを指すようになり、設定とオンボーディングがようやく同じ選択肢を見せます。メモリーも保存済みの互換 MiniMax キーを使えるようになり、画像や音声しか対応しないプロバイダーの場合はそうはっきり伝えます。</p>

      <h2>プレビューが枠と争わなくなる</h2>
      <p>小さな摩擦ですが、毎日感じるものです。横に広いデスクトップページは<strong>自分でズームを選ぶまでペインに収まり</strong>、古いスライドはナビゲーションキーにすぐ反応し、最新のメイン HTML ファイルは手動更新を待たずタスク完了と同時に現れます。安全上の理由でアセットがブロックされたときは、機微なシステムパスを露出させずに該当するプロジェクトファイルを示します。</p>
      <p>画像生成も安定しました。<strong>Nano Banana とカスタム画像生成は、プロバイダーが一時的に混んでいるとき一度だけ再試行し</strong>、GPT Image の参照編集はより多くの互換サービスで動きます。一瞬の途切れは、失われた創作ではなく短い待ち時間になります。</p>

      <h2>0.16.0 のその他</h2>
      <ul>
        <li><strong>ギャラリーは実際に使われているものから</strong> — スライド、画像、動画などプロトタイプ以外のギャラリーは実使用のあるテンプレートを前に出し、空の項目やプレビューのないカードが上位を占めなくなりました。プロトタイプは編集部によるショーケースを保ち、各カテゴリのカタログも全て健在です。</li>
        <li><strong>デザインシステムの取り込みがより忠実に</strong> — リポジトリの取り込みが正しいフローを選び、分割されたトークンパッケージはレイアウト値を保ち、よくある YAML のリストや複数行の書式も作者が書いたメタデータを保ちます。</li>
        <li><strong>ローカルの安全境界が強く</strong> — 取り込んだプロジェクトは隠し資格情報を守り、プラグインの削除はそのプラグインのファイル内にとどまり、マーケットプレイスや保存済みサイトの内容はより慎重に扱われ、各会話は正しいプロジェクトに紐づいたままです。</li>
        <li><strong>公開の前にプレビューを</strong> — Cloudflare Pages のデプロイが、画面と <code>od deploy --target … --json</code> の両方で Preview と Production を明示的なターゲットとして扱います。プレビューは本番ホスト名を置き換えず、自分の URL を返します。</li>
        <li><strong>Kiro が MCP 設定のピッカーに参加</strong> — 別クライアントの形式を手作業で読み替えず、設定から正しい共有サーバーのスニペットをコピーできます。</li>
        <li><strong>名前を挙げておきたい静かな修正</strong> — MCP のフォローアップが最新のメッセージを受け取り、ACP の履歴が更新後に空行を増やさなくなり、古いプロセッサーの Windows 端末でも通常の更新経路で OpenCode を実行できます。</li>
      </ul>

      <h2>すでに修正済み: 0.16.1</h2>
      <p>翌日、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> がデザインプレビューに絞った修正を 1 つ届けました。<strong>実行ステータスが生成物を覆わなくなりました。</strong>ビルド中、完了、配信リカバリーの各ステータスはチャットに残り — 進捗の追跡や失敗した配信の再試行はそこが引き続き定位置です — キャンバスはあなたのものになります。今日ダウンロードするなら 0.16.1 を。</p>

      <h2>今日それで何ができるか</h2>
      <table>
        <thead>
          <tr><th>あなたが……</th><th>ここから</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design を初めて使う</td><td>デスクトップアプリを入れてプロジェクトを開始し、作っているフォーマット向けのビジュアル方向性を選ぶ</td></tr>
          <tr><td>長いタスクを回している</td><td>長い実行をもう一歩先へ。コンテキストの上限に触れても最新の有用なコンテキストで続き、ファイルもそのまま</td></tr>
          <tr><td>古いビルドのまま</td><td>「アップデートを確認…」を実行。状態が明示され、アップグレード後は PPTX の書き出しも動く</td></tr>
          <tr><td>自分の鍵を使っている</td><td>BYOK のプロバイダーを再テスト。エラーは設定時に出て、下書きが動作中の設定を壊さない</td></tr>
          <tr><td>プレビューに入り浸っている</td><td>横長のデスクトップページや古いスライドを開き直す。枠は収まり、キーは反応する</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>信頼できるリリースとは、たいてい物を失わなくなったリリースのことです。0.16.0 はそこに予算を使いました — 着地するアップデート、ファイルを保つ長いタスク、フォーマットに合うスタイル、邪魔をしないプレビュー。デスクトップアプリを入れて、手元でいちばん長いタスクを走らせ直し、丸ごと届くのを見てください。</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Open Design をダウンロード</a>。</p>
      <p>5 日間で 92 の PR。仕上がった成果と届いた成果のあいだにある隙間を、20 人がひとつずつ埋めました。信頼性は派手さのない仕事で、そして他のすべてを信じられるものにする仕事です。見ています。🚀</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — より鮮明な視界、より長いフロー</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — コストを下げ、速く届ける</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — インスピレーションのタイムマシン</a></li>
      </ul>
  ko:
    title: 'Open Design 0.16.0: 확실한 전달'
    summary: 'open-design-v0.16.0 — 5일 동안 20명의 기여자가 92개의 PR을 보냈습니다. 코드명 “Reliable Delivery”. 비주얼 방향이 실제로 만드는 것에 맞춰 따라오고, 자동 업데이트가 제대로 적용되며, 긴 작업이 결과와 함께 만들어진 파일까지 지키고, 미리보기가 프레임과 다투지 않습니다. 앱 안의 메시지 센터, 그리고 캔버스를 가리던 마지막 하나를 걷어낸 0.16.1까지.'
    category: '제품'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, 2026년 7월 22일 공개. <strong>5일 동안 20명의 기여자가 92개의 PR을 보냈습니다.</strong> 코드명 “Reliable Delivery”. 지난 릴리스가 한 번의 실행에 드는 비용을 겨눴다면, 이번 릴리스는 결과가 완성된 순간과 그것이 실제로 손에 닿는 순간 사이에 벌어지는 일을 겨눕니다. 반쯤 적용된 업데이트, 파일을 잃어버린 긴 작업, 씨름해야 하는 미리보기, 한 장이 빠진 내보내기.</p>
      <p>전체 변경 이력이 필요하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">GitHub의 릴리스 노트</a>에 있습니다. 여기서는 짧은 버전으로: 아래에서 무엇이 바뀌었고, 오늘 그것으로 무엇을 할 수 있으며, 어디서 시작하면 되는지.</p>

      <h2>비주얼 방향이 실제로 만드는 것을 따라옵니다</h2>
      <p>스타일은 오랫동안 덱과 프로토타입에서만 내릴 수 있는 결정이었습니다. 나머지 — 문서, 포스터, 영상, Web Clone, 와이어프레임, 모바일 작업, Hyperframe — 는 모델이 내키는 대로 시작했습니다.</p>
      <p>0.16.0에서는 <strong>모든 포맷이 각자의 비주얼 방향을 갖고</strong>, 미리보기도 그 포맷이 실제로 보이는 방식으로 렌더링됩니다. 작업 중인 자리에 네 개의 선택지가 놓이고, 전체 스타일 라이브러리는 한 번의 클릭 거리에 있습니다. 덱 테마를 머릿속에서 포스터로 번역하는 대신, 눈앞의 대상에 맞는 모습을 그대로 고르면 됩니다.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="문서, 포스터, 영상, 모바일 화면 같은 여러 포맷의 스케치가 각각 올바른 비율의 스타일 미리보기가 되어 차분한 세이지그린 화면에 놓인 따뜻한 편집 일러스트" />
        <figcaption>문서, 포스터, 영상, Web Clone, 와이어프레임, 모바일 작업과 Hyperframe이 각 포맷에 맞는 미리보기를 갖습니다 — 네 가지 선택지는 손 닿는 곳에, 전체 라이브러리는 한 번의 클릭에.</figcaption>
      </figure>

      <h2>실제로 적용되는 업데이트</h2>
      <p>절반만 적용된 업데이트는 업데이트하지 않은 것보다 나쁩니다. 앱은 새 버전을 말하는데 어떤 기능은 조용히 옛 버전으로 돌아갑니다. 0.16.0은 업그레이드가 착지하도록 만듭니다. <strong>업데이트 후 새 버전이 더 확실하게 적용되고, 불완전한 업데이트로 망가졌던 기능 — PPTX 내보내기를 포함해 — 이 다시 동작합니다.</strong></p>
      <p>macOS에서 “업데이트 확인…”은 지금 어떤 상태인지 분명히 알려 줍니다. 최신, 다운로드 중, 재시작 준비 완료, 진행 중인 작업 대기, 수동 다운로드 필요. Windows의 업데이트 안정성도 나아졌습니다. 이 영역에서 오래 손을 움직여 준 <a href="https://github.com/PerishCode">@PerishCode</a>에게 감사드립니다.</p>

      <h2>긴 작업이 결과를 — 그리고 파일을 — 지킵니다</h2>
      <p>가장 값진 작업은 긴 실행 안에 있고, 동시에 그 작업이 가장 잘 사라지던 곳이기도 했습니다. 0.16.0에서는 대화 한계에 가까워진 작업이 <strong>갑작스럽게 실패하는 대신 가장 최신의 유용한 컨텍스트로 계속되고</strong>, 실행 초반에 만들어진 파일도 <strong>결과에 붙어 남습니다</strong>. 압축과 함께 사라지지 않습니다.</p>
      <p>실패 경로도 더 정직해졌습니다. 복구된 보조 에이전트가 성공한 작업을 실패로 보고하지 않고, 중단된 작업은 재시작 후 정확한 상태를 보여 주며, 취소한 작업은 취소된 채로 남고, 정말로 복구할 수 없는 오류는 끝없는 스피너 대신 행동으로 이어지는 설명과 함께 멈춥니다.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="끊기지 않은 실이 생성된 파일 카드 묶음을 싣고 좁아지는 관문을 지나 차분한 세이지그린 화면에 온전히 도착하는 따뜻한 편집 일러스트" />
        <figcaption>컨텍스트 한계에 다가가도 실행은 끝나지 않습니다 — 작업은 최신의 유용한 컨텍스트로 이어지고, 이미 만들어진 파일도 함께 도착합니다.</figcaption>
      </figure>

      <h2>제품 소식이 앱 안에 자리를 얻었습니다</h2>
      <p>0.16.0의 새 기능: <strong>홈과 프로젝트 헤더의 종 아이콘 뒤에 있는 메시지 센터</strong> — 읽지 않은 개수, 필터, 모두 읽음, 그리고 알리는 대상으로 바로 가는 링크. 읽음 상태는 익명일 때 기기에 남고 로그인하면 계정을 따라갑니다. 날짜는 사용 언어에 맞게 표시되고, 닫기 버튼은 늘 예상한 자리에 있습니다. <a href="https://github.com/nettee">@nettee</a>에게 감사드립니다.</p>

      <h2>BYOK가 당신을 멈추기 전에 설정 문제를 잡습니다</h2>
      <p>자기 키를 가져오는 설정은 작업이 3분 돌아간 뒤가 아니라 설정 단계에서 실패해야 합니다. <strong>완성되지 않은 편집은 이제 동작 중인 설정을 덮어쓰지 않고 복구 가능한 초안으로 남습니다.</strong> 중간까지만 고친 변경이 의존하던 제공자를 무너뜨리는 일은 없습니다.</p>
      <p>연결 테스트는 실제 작업에 더 가깝게 동작하고, 제공자의 진짜 오류를 드러내며, 각 제공자 고유의 모델 순서를 지킵니다. 원하는 모델이 알파벳순 목록에 묻히지 않습니다. 호환되는 MiniMax, DeepSeek, MiMo 주소가 더 일관되게 처리되고, 오래된 Moonshot과 DeepSeek 기본값이 현재 모델을 가리키며, 설정과 온보딩이 드디어 같은 선택지를 보여 줍니다. 메모리도 이미 저장한 호환 MiniMax 키를 쓸 수 있고, 이미지나 오디오만 지원하는 제공자라면 그렇게 분명히 말합니다.</p>

      <h2>미리보기가 프레임과 다투지 않습니다</h2>
      <p>작은 마찰이지만 매일 느껴집니다. 넓은 데스크톱 페이지는 <strong>직접 확대율을 고르기 전까지 창에 맞춰지고</strong>, 오래된 덱은 내비게이션 키에 곧바로 반응하며, 최신 메인 HTML 파일은 수동 새로고침 없이 작업이 끝나는 즉시 나타납니다. 안전을 위해 에셋이 차단됐을 때는 민감한 시스템 경로를 드러내지 않고 관련 프로젝트 파일을 알려 줍니다.</p>
      <p>이미지 생성도 더 단단해졌습니다. <strong>Nano Banana와 커스텀 이미지 생성은 제공자가 잠시 바쁠 때 한 번 재시도하고</strong>, GPT Image 참조 편집은 더 많은 호환 서비스에서 동작합니다. 잠깐의 끊김이 잃어버린 창작이 아니라 짧은 기다림이 됩니다.</p>

      <h2>0.16.0에 함께 담긴 것들</h2>
      <ul>
        <li><strong>갤러리가 실제로 쓰이는 것부터 보여 줍니다</strong> — 슬라이드, 이미지, 영상 등 프로토타입이 아닌 갤러리는 실사용이 있는 템플릿을 앞세우고, 빈 항목과 미리보기 없는 카드가 상단을 차지하지 않습니다. 프로토타입은 편집 쇼케이스를 유지하고, 모든 카테고리의 전체 카탈로그도 그대로입니다.</li>
        <li><strong>디자인 시스템 가져오기가 더 충실해졌습니다</strong> — 저장소 가져오기가 알맞은 흐름을 고르고, 분리된 토큰 패키지가 레이아웃 값을 지키며, 흔한 YAML 목록과 여러 줄 형식이 작성자가 쓴 메타데이터를 보존합니다.</li>
        <li><strong>로컬 안전 경계가 더 튼튼해졌습니다</strong> — 가져온 프로젝트는 숨겨진 자격 증명을 지키고, 플러그인 삭제는 해당 플러그인 파일 안에서 끝나며, 마켓플레이스와 저장된 사이트 콘텐츠는 더 조심스럽게 다뤄지고, 각 대화는 올바른 프로젝트에 계속 붙어 있습니다.</li>
        <li><strong>배포 전에 미리보기</strong> — Cloudflare Pages 배포가 화면과 <code>od deploy --target … --json</code> 양쪽에서 Preview와 Production을 명시적인 대상으로 다룹니다. 미리보기는 운영 호스트명을 대체하지 않고 자기 URL을 돌려줍니다.</li>
        <li><strong>Kiro가 MCP 설정 선택기에 합류</strong> — 다른 클라이언트의 형식을 손으로 옮겨 적는 대신 설정에서 올바른 공유 서버 스니펫을 복사하세요.</li>
        <li><strong>짚고 갈 조용한 수정들</strong> — MCP 후속 요청이 최신 메시지를 받고, ACP 기록이 새로고침 후 빈 줄을 늘리지 않으며, 오래된 프로세서를 쓰는 Windows 기기도 일반 업데이트 경로로 OpenCode를 다시 실행할 수 있습니다.</li>
      </ul>

      <h2>이미 고쳐졌습니다: 0.16.1</h2>
      <p>다음 날 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a>이 디자인 미리보기에 집중한 수정 하나를 내놓았습니다. <strong>실행 상태가 생성된 작업물을 가리지 않습니다.</strong> 빌드 중, 완료, 전달 복구 상태는 채팅에 머물고 — 진행 상황을 따라가거나 실패한 전달을 다시 시도하는 곳은 여전히 채팅입니다 — 캔버스는 온전히 여러분의 것이 됩니다. 오늘 내려받는다면 0.16.1을 받으세요.</p>

      <h2>오늘 무엇을 할 수 있나</h2>
      <table>
        <thead>
          <tr><th>당신이……</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 내려받아 프로젝트를 시작하고, 지금 만드는 포맷에 맞는 비주얼 방향을 고르세요</td></tr>
          <tr><td>긴 작업을 돌리고 있다면</td><td>긴 실행을 한 걸음 더 밀어 보세요 — 컨텍스트 한계에 닿아도 최신의 유용한 컨텍스트로 이어지고 파일도 남습니다</td></tr>
          <tr><td>오래된 빌드를 쓰고 있다면</td><td>“업데이트 확인…”을 실행하세요 — 상태가 명확해졌고, 업그레이드 후 PPTX 내보내기도 동작합니다</td></tr>
          <tr><td>자기 키를 쓰고 있다면</td><td>BYOK 제공자를 다시 테스트하세요: 오류는 설정 단계에서 드러나고, 초안이 동작 중인 설정을 덮지 않습니다</td></tr>
          <tr><td>미리보기에 살고 있다면</td><td>넓은 데스크톱 페이지나 오래된 덱을 다시 열어 보세요 — 프레임이 맞고, 키가 반응합니다</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>믿을 수 있는 릴리스는 대개 무언가를 잃지 않게 된 릴리스입니다. 0.16.0은 예산을 바로 거기에 썼습니다 — 착지하는 업데이트, 파일을 지키는 긴 작업, 포맷에 맞는 스타일, 비켜서는 미리보기. 데스크톱 앱을 내려받아 가진 것 중 가장 긴 작업을 다시 돌리고, 그것이 온전히 도착하는지 보세요.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Open Design 내려받기</a>.</p>
      <p>5일 동안 92개의 PR, 완성된 결과와 전달된 결과 사이의 틈을 하나씩 메운 20명에게서. 안정성은 화려하지 않은 일이고, 나머지 모든 것을 믿을 수 있게 만드는 일입니다. 보고 있습니다. 🚀</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — 더 또렷한 시야, 더 긴 몰입</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — 비용은 줄이고, 더 빠르게</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — 영감의 타임머신</a></li>
      </ul>
  de:
    title: 'Open Design 0.16.0: verlässliche Auslieferung'
    summary: 'open-design-v0.16.0 — 92 PRs von 20 Mitwirkenden in fünf Tagen. Codename „Reliable Delivery“. Die visuelle Richtung folgt jetzt dem, was Sie tatsächlich bauen, automatische Updates greifen wirklich, lange Aufgaben behalten ihr Ergebnis samt Dateien, und Vorschauen kämpfen nicht mehr mit dem Rahmen. Dazu ein Nachrichtencenter in der App — und der 0.16.1-Patch, der das Letzte von der Canvas geräumt hat.'
    category: 'Produkt'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, veröffentlicht am 22. Juli 2026. <strong>92 PRs von 20 Mitwirkenden in fünf Tagen.</strong> Codename „Reliable Delivery“. Das letzte Release ging dem nach, was ein Lauf kostet. Dieses geht dem nach, was zwischen einem fertigen Ergebnis und dem Moment passiert, in dem es Sie wirklich erreicht: das halb angewandte Update, die lange Aufgabe, die ihre Dateien verlor, die Vorschau, gegen die man ankämpfen musste, der Export, dem eine Folie fehlte.</p>
      <p>Das vollständige Changelog steht in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">Release Notes auf GitHub</a>. Hier die Kurzfassung: was sich darunter geändert hat, was Sie heute damit tun können und wo Sie anfangen.</p>

      <h2>Die visuelle Richtung folgt dem, was Sie tatsächlich bauen</h2>
      <p>Stil war lange eine Entscheidung, die man nur für Decks und Prototypen treffen konnte. Alles andere — ein Dokument, ein Poster, ein Video, ein Web Clone, ein Wireframe, ein Mobile-Screen, ein Hyperframe — startete mit dem, wonach dem Modell gerade war.</p>
      <p>In 0.16.0 bekommt <strong>jedes Format seine eigene visuelle Richtung</strong>, mit Vorschauen, die so gerendert werden, wie dieses Format tatsächlich gesehen wird. Vier schnelle Optionen liegen dort, wo Sie arbeiten, die vollständige Stilbibliothek ist einen Klick entfernt. Sie wählen einen Look für das, was vor Ihnen liegt, statt ein Deck-Thema im Kopf in ein Poster zu übersetzen.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Eine skizzierte Reihe verschiedener Ausgabeformate — Dokument, Poster, Video, Mobile-Screen —, die jeweils zu einer korrekt proportionierten Stilvorschau in einer ruhigen salbeigrünen Oberfläche werden, als warme editoriale Illustration" />
        <figcaption>Dokumente, Poster, Videos, Web Clones, Wireframes, Mobile-Arbeiten und Hyperframes erhalten jeweils Vorschauen, die zum Format passen — vier Optionen direkt zur Hand, die volle Bibliothek einen Klick entfernt.</figcaption>
      </figure>

      <h2>Updates, die wirklich greifen</h2>
      <p>Ein Update, das nur halb ankommt, ist schlimmer als gar keines: Die App meldet eine neue Version, während eine Funktion still auf der alten läuft. 0.16.0 bringt das Upgrade zum Landen. <strong>Nach dem Update greift die neue Version zuverlässiger, und Funktionen, die ein unvollständiges Update zerlegt hatte — darunter der PPTX-Export —, arbeiten wieder.</strong></p>
      <p>Unter macOS sagt „Nach Updates suchen …“ jetzt, in welchem Zustand Sie sind: aktuell, lädt herunter, bereit zum Neustart, wartet auf laufende Arbeit oder braucht einen manuellen Download. Auch unter Windows wird die Update-Zuverlässigkeit besser. Dank an <a href="https://github.com/PerishCode">@PerishCode</a> für eine lange Reihe von Arbeiten hier.</p>

      <h2>Lange Aufgaben behalten ihr Ergebnis — und ihre Dateien</h2>
      <p>In langen Läufen steckt die wertvollste Arbeit, und dort verschwand sie bisher am ehesten. In 0.16.0 <strong>läuft eine Aufgabe, die sich einer Konversationsgrenze nähert, mit dem neuesten nützlichen Kontext weiter, statt abrupt zu scheitern</strong>, und Dateien, die früher im Lauf entstanden sind, <strong>bleiben am Ergebnis hängen</strong>, statt mit der Kompaktierung zu verschwinden.</p>
      <p>Auch die Fehlerpfade wurden ehrlicher: Wiederhergestellte Hilfsagenten machen aus erfolgreicher Arbeit keinen gemeldeten Fehlschlag mehr, unterbrochene Aufgaben zeigen nach einem Neustart einen korrekten Zustand, abgebrochene Arbeit bleibt abgebrochen, und Fehler, die sich wirklich nicht beheben lassen, halten mit einer Erklärung an, mit der Sie etwas anfangen können, statt mit einem endlosen Spinner.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Ein langer, ununterbrochener Faden trägt einen Stapel erzeugter Dateikarten durch ein enger werdendes Tor und kommt vollständig in einer ruhigen salbeigrünen Oberfläche an, als warme editoriale Illustration" />
        <figcaption>Das Erreichen einer Kontextgrenze beendet den Lauf nicht mehr — die Aufgabe läuft mit dem neuesten nützlichen Kontext weiter, und die bereits erzeugten Dateien kommen mit.</figcaption>
      </figure>

      <h2>Produktneuigkeiten haben jetzt einen Platz in der App</h2>
      <p>Neu in 0.16.0: <strong>ein Nachrichtencenter hinter einer Glocke in der Home- und Projektkopfzeile</strong> — Ungelesen-Zähler, Filter, Alles-gelesen und Links direkt zu dem, worum es geht. Der Lesestatus bleibt anonym auf dem Gerät und folgt angemeldet Ihrem Konto, Daten werden in Ihrer Sprache dargestellt, und der Schließen-Button ist immer dort, wo Sie ihn erwarten. Danke <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>BYOK bemerkt Konfigurationsfehler, bevor sie Sie unterbrechen</h2>
      <p>Ein eigener Schlüssel sollte beim Einrichten scheitern, nicht drei Minuten in einer Aufgabe. <strong>Unfertige Änderungen bleiben jetzt als wiederherstellbarer Entwurf, statt eine funktionierende Konfiguration zu überschreiben</strong> — eine halb fertige Anpassung kann also keinen Anbieter mehr mitreißen, auf den Sie angewiesen sind.</p>
      <p>Verbindungstests verhalten sich mehr wie echte Aufgaben, zeigen den tatsächlichen Fehler des Anbieters und bewahren dessen eigene Modellreihenfolge — keine alphabetische Liste mehr, die das gewünschte Modell begräbt. Kompatible MiniMax-, DeepSeek- und MiMo-Adressen werden konsistenter behandelt, veraltete Moonshot- und DeepSeek-Standards zeigen auf aktuelle Modelle, und Einstellungen und Onboarding zeigen endlich dieselbe Auswahl. Memory kann außerdem einen bereits gespeicherten kompatiblen MiniMax-Schlüssel nutzen und sagt klar, wenn ein Anbieter nur Bild oder Audio unterstützt.</p>

      <h2>Vorschauen kämpfen nicht mehr mit dem Rahmen</h2>
      <p>Kleine Reibung, ständig spürbar. Breite Desktop-Seiten <strong>passen sich jetzt dem Bereich an, bis Sie selbst einen Zoom wählen</strong>, ältere Decks reagieren sofort auf Navigationstasten, und die aktuellste Haupt-HTML-Datei erscheint direkt nach Ende der Aufgabe statt nach manuellem Neuladen. Wird ein Asset aus Sicherheitsgründen blockiert, benennt die Vorschau die betroffene Projektdatei, ohne einen sensiblen Systempfad offenzulegen.</p>
      <p>Auch die Bildgenerierung wurde robuster: <strong>Nano Banana und die eigene Bildgenerierung versuchen es einmal erneut, wenn ein Anbieter kurz ausgelastet ist</strong>, und GPT-Image-Referenzbearbeitungen funktionieren über mehr kompatible Dienste. Aus einem Aussetzer wird eine kurze Wartezeit statt einer verlorenen kreativen Runde.</p>

      <h2>Was sonst noch in 0.16.0 landet</h2>
      <ul>
        <li><strong>Galerien zeigen zuerst, was Menschen wirklich nutzen</strong> — Slides-, Bild-, Video- und andere Nicht-Prototyp-Galerien holen Vorlagen mit echter Nutzung nach vorne, während leere Einträge und Karten ohne Vorschau die Spitze nicht mehr verstopfen. Prototype behält sein kuratiertes Schaufenster, und jede Kategorie behält ihren vollständigen Katalog.</li>
        <li><strong>Design Systems werden originalgetreuer importiert</strong> — Repository-Importe wählen den richtigen Ablauf, aufgeteilte Token-Pakete behalten ihre Layoutwerte, und übliche YAML-Listen- und Mehrzeilenformate bewahren die Metadaten, die ihre Autoren geschrieben haben.</li>
        <li><strong>Stärkere lokale Sicherheitsgrenzen</strong> — importierte Projekte halten verborgene Zugangsdaten privat, das Entfernen eines Plugins bleibt in dessen eigenen Dateien, Marketplace- und gespeicherte Website-Inhalte werden vorsichtiger behandelt, und jede Konversation bleibt am richtigen Projekt hängen.</li>
        <li><strong>Vorschau vor der Veröffentlichung</strong> — das Cloudflare-Pages-Deployment macht Preview und Production sowohl in der Oberfläche als auch in <code>od deploy --target … --json</code> zu expliziten Zielen, sodass eine Vorschau ihre eigene URL zurückgibt statt Ihren Live-Hostnamen zu ersetzen.</li>
        <li><strong>Kiro kommt in die MCP-Auswahl</strong> — kopieren Sie das passende Shared-Server-Snippet aus den Einstellungen, statt das Format eines anderen Clients von Hand zu übersetzen.</li>
        <li><strong>Leise Korrekturen, die Erwähnung verdienen</strong> — MCP-Folgeanfragen erhalten die neueste Nachricht, ACP-Verläufe wachsen nach einem Refresh keine leeren Zeilen mehr, und Windows-Geräte mit älteren Prozessoren können OpenCode über den normalen Update-Pfad wieder ausführen.</li>
      </ul>

      <h2>Schon behoben: 0.16.1</h2>
      <p>Am Tag darauf brachte <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> eine gezielte Korrektur für die Design-Vorschau: <strong>Der Laufstatus verdeckt Ihre erzeugte Arbeit nicht mehr.</strong> Build-, Abschluss- und Delivery-Recovery-Status bleiben im Chat — dort verfolgen Sie weiterhin den Fortschritt oder starten eine fehlgeschlagene Auslieferung neu — und die Canvas gehört Ihnen. Wer heute herunterlädt, nimmt 0.16.1.</p>

      <h2>Was Sie heute damit tun können</h2>
      <table>
        <thead>
          <tr><th>Wenn Sie …</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>neu bei Open Design sind</td><td>Laden Sie die Desktop-App, starten Sie ein Projekt und wählen Sie eine visuelle Richtung, die zum Format passt, an dem Sie arbeiten</td></tr>
          <tr><td>lange Aufgaben laufen lassen</td><td>Treiben Sie einen langen Lauf weiter — die Kontextgrenze zu erreichen läuft jetzt mit dem neuesten nützlichen Kontext weiter, Dateien intakt</td></tr>
          <tr><td>auf einem älteren Build sind</td><td>Führen Sie „Nach Updates suchen …“ aus — der Update-Zustand ist jetzt explizit, und der PPTX-Export funktioniert nach dem Upgrade</td></tr>
          <tr><td>eigene Schlüssel nutzen</td><td>Testen Sie Ihre BYOK-Anbieter erneut: Fehler zeigen sich beim Einrichten, Entwürfe überschreiben keine funktionierende Konfiguration</td></tr>
          <tr><td>in der Vorschau leben</td><td>Öffnen Sie eine breite Desktop-Seite oder ein älteres Deck erneut — der Rahmen passt, und die Tasten reagieren</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes</h2>
      <p>Ein Release, dem man vertrauen kann, ist meist ein Release, das aufhört, Dinge zu verlieren. 0.16.0 gibt sein Budget genau dafür aus — ein Update, das landet, eine lange Aufgabe, die ihre Dateien behält, ein Stil, der zum Format passt, eine Vorschau, die aus dem Weg geht. Laden Sie die Desktop-App, starten Sie Ihre längste Aufgabe neu und sehen Sie zu, wie sie vollständig ankommt.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Open Design herunterladen</a>.</p>
      <p>92 PRs in fünf Tagen, von 20 Menschen, die jeweils eine weitere Lücke zwischen einem fertigen und einem ausgelieferten Ergebnis geschlossen haben. Verlässlichkeit ist unglamouröse Arbeit — und genau die Arbeit, die alles andere glaubwürdig macht. Wir sehen euch. 🚀</p>

      <h2>Weiterlesen</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — schärferer Blick, längerer Flow</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — weniger Kosten, schneller ausliefern</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — die Inspirations-Zeitmaschine</a></li>
      </ul>
  fr:
    title: 'Open Design 0.16.0 : une livraison fiable'
    summary: 'open-design-v0.16.0 — 92 PR de 20 contributeurs en cinq jours. Nom de code « Reliable Delivery ». La direction visuelle suit désormais ce que vous fabriquez vraiment, les mises à jour automatiques prennent effet pour de bon, les longues tâches gardent leur résultat et les fichiers qui vont avec, et les aperçus cessent de se battre avec le cadre. Plus un centre de messages dans l''app — et le correctif 0.16.1 qui a dégagé la dernière chose posée sur votre canvas.'
    category: 'Produit'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, publié le 22 juillet 2026. <strong>92 PR de 20 contributeurs en cinq jours.</strong> Nom de code « Reliable Delivery ». La version précédente s'attaquait à ce que coûte une exécution. Celle-ci s'attaque à ce qui se passe entre un résultat terminé et le moment où il vous parvient vraiment : la mise à jour à moitié appliquée, la longue tâche qui a perdu ses fichiers, l'aperçu qu'il fallait dompter, l'export auquel il manquait une diapositive.</p>
      <p>Le changelog complet vit dans les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">notes de version sur GitHub</a>. Voici la version courte : ce qui a changé en dessous, ce que vous pouvez en faire aujourd'hui et par où commencer.</p>

      <h2>La direction visuelle suit ce que vous fabriquez vraiment</h2>
      <p>Le style était longtemps une décision réservée aux decks et aux prototypes. Tout le reste — un document, une affiche, une vidéo, un Web Clone, un wireframe, un écran mobile, un Hyperframe — partait de ce dont le modèle avait envie.</p>
      <p>Dans 0.16.0, <strong>chaque format a sa propre direction visuelle</strong>, avec des aperçus rendus tels que ce format est réellement vu. Quatre choix rapides s'installent là où vous travaillez, et la bibliothèque de styles complète est à un clic. Vous choisissez un look pour l'objet qui est devant vous au lieu de traduire mentalement un thème de deck en affiche.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Une esquisse de plusieurs formats de sortie — document, affiche, vidéo, écran mobile — devenant chacun son propre aperçu de style aux bonnes proportions dans une interface vert sauge apaisée, illustration éditoriale chaleureuse" />
        <figcaption>Documents, affiches, vidéos, Web Clones, wireframes, travaux mobiles et Hyperframes reçoivent chacun des aperçus adaptés à leur format — quatre choix sous la main, la bibliothèque complète à un clic.</figcaption>
      </figure>

      <h2>Des mises à jour qui prennent vraiment effet</h2>
      <p>Une mise à jour à moitié appliquée est pire que pas de mise à jour du tout : l'app annonce une nouvelle version pendant qu'une fonctionnalité tourne discrètement sur l'ancienne. 0.16.0 fait atterrir la mise à niveau. <strong>Après la mise à jour, la nouvelle version prend effet plus sûrement, et les fonctionnalités cassées par une mise à jour incomplète — dont l'export PPTX — refonctionnent.</strong></p>
      <p>Sur macOS, « Rechercher les mises à jour… » indique désormais dans quel état vous êtes : à jour, en téléchargement, prêt à redémarrer, en attente de la fin du travail en cours, ou nécessitant un téléchargement manuel. La fiabilité des mises à jour progresse aussi sous Windows. Merci à <a href="https://github.com/PerishCode">@PerishCode</a> pour une longue série de travaux ici.</p>

      <h2>Les longues tâches gardent leur réponse — et leurs fichiers</h2>
      <p>C'est dans les longues exécutions que se trouve le travail le plus précieux, et c'est là qu'il disparaissait le plus souvent. Dans 0.16.0, une tâche qui approche d'une limite de conversation <strong>continue avec le contexte utile le plus récent au lieu d'échouer brutalement</strong>, et les fichiers générés plus tôt dans l'exécution <strong>restent attachés au résultat</strong> au lieu de s'évanouir avec le compactage.</p>
      <p>Les chemins d'échec sont devenus plus honnêtes eux aussi : les agents auxiliaires récupérés ne transforment plus un travail réussi en échec déclaré, les tâches interrompues affichent un état exact après redémarrage, le travail annulé reste annulé, et les erreurs vraiment irrécupérables s'arrêtent avec une explication exploitable plutôt qu'avec un spinner sans fin.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Un long fil ininterrompu transportant une pile de fiches de fichiers générés à travers un passage qui se rétrécit et arrivant intact dans une interface vert sauge apaisée, illustration éditoriale chaleureuse" />
        <figcaption>Approcher la limite de contexte ne met plus fin à l'exécution — la tâche continue avec le contexte utile le plus récent, et les fichiers déjà produits arrivent avec elle.</figcaption>
      </figure>

      <h2>Les nouvelles produit ont une place dans l'app</h2>
      <p>Nouveau dans 0.16.0 : <strong>un centre de messages derrière une cloche dans les en-têtes Accueil et Projet</strong> — compteurs de non-lus, filtres, tout marquer comme lu, et des liens directs vers ce dont on parle. L'état de lecture reste sur l'appareil en usage anonyme et suit votre compte une fois connecté, les dates s'affichent dans votre langue, et le bouton de fermeture est toujours là où vous l'attendez. Merci <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>BYOK attrape les problèmes de configuration avant qu'ils ne vous interrompent</h2>
      <p>Apporter sa propre clé devrait échouer au moment de la configuration, pas trois minutes après le début d'une tâche. <strong>Les modifications inachevées restent désormais des brouillons récupérables au lieu d'écraser une configuration qui marche</strong> : un changement à moitié fait ne peut plus faire tomber un fournisseur dont vous dépendez.</p>
      <p>Les tests de connexion se comportent davantage comme de vraies tâches, remontent l'erreur réelle du fournisseur et conservent l'ordre des modèles propre à chacun — fini la liste alphabétique qui enterre le modèle voulu. Les adresses compatibles MiniMax, DeepSeek et MiMo sont traitées plus uniformément, les valeurs par défaut obsolètes de Moonshot et DeepSeek pointent vers des modèles actuels, et les Réglages et l'onboarding montrent enfin les mêmes choix. La mémoire peut aussi utiliser une clé MiniMax compatible déjà enregistrée, et dit clairement quand un fournisseur ne gère que l'image ou l'audio.</p>

      <h2>Les aperçus cessent de se battre avec le cadre</h2>
      <p>Petite friction, ressentie en permanence. Les pages desktop larges <strong>tiennent maintenant dans le volet jusqu'à ce que vous choisissiez votre propre zoom</strong>, les decks plus anciens répondent immédiatement aux touches de navigation, et le dernier fichier HTML principal apparaît dès la fin de la tâche au lieu d'attendre un rafraîchissement manuel. Quand une ressource est bloquée pour raison de sécurité, l'aperçu nomme le fichier de projet concerné sans exposer un chemin système sensible.</p>
      <p>La génération d'images a gagné en robustesse : <strong>Nano Banana et la génération d'images personnalisée réessaient une fois quand un fournisseur est brièvement occupé</strong>, et les retouches par référence de GPT Image fonctionnent sur davantage de services compatibles. Un hoquet devient une courte attente au lieu d'un tour créatif perdu.</p>

      <h2>Ce qui arrive aussi dans 0.16.0</h2>
      <ul>
        <li><strong>Les galeries mettent en avant ce que les gens utilisent vraiment</strong> — les galeries Slides, image, vidéo et autres hors prototype font remonter les modèles réellement utilisés, tandis que les entrées vides et les cartes sans aperçu cessent d'encombrer le haut. Prototype conserve sa vitrine éditoriale, et chaque catégorie garde son catalogue complet.</li>
        <li><strong>Les design systems s'importent plus fidèlement</strong> — les imports de dépôt choisissent le bon flux, les paquets de tokens éclatés gardent leurs valeurs de mise en page, et les formats YAML de liste et multilignes courants préservent les métadonnées écrites par leurs auteurs.</li>
        <li><strong>Des frontières de sécurité locales renforcées</strong> — les projets importés gardent privés leurs identifiants cachés, la suppression d'un plugin reste dans les fichiers de ce plugin, les contenus de la marketplace et des sites enregistrés sont traités avec plus de soin, et chaque conversation reste rattachée au bon projet.</li>
        <li><strong>Prévisualiser avant de publier</strong> — le déploiement Cloudflare Pages expose Preview et Production comme cibles explicites dans l'interface et dans <code>od deploy --target … --json</code>, si bien qu'un aperçu renvoie sa propre URL au lieu de remplacer votre nom d'hôte en production.</li>
        <li><strong>Kiro rejoint le sélecteur de configuration MCP</strong> — copiez le bon extrait de serveur partagé depuis les Réglages au lieu de traduire à la main le format d'un autre client.</li>
        <li><strong>Des correctifs discrets qui méritent d'être cités</strong> — les relances MCP reçoivent le dernier message, les historiques ACP n'accumulent plus de lignes vides après un rafraîchissement, et les machines Windows à processeur plus ancien peuvent de nouveau exécuter OpenCode via le chemin de mise à jour normal.</li>
      </ul>

      <h2>Déjà corrigé : 0.16.1</h2>
      <p>Le lendemain, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> a livré un correctif ciblé pour l'aperçu de design : <strong>le statut d'exécution ne recouvre plus votre travail généré.</strong> Les statuts de construction, d'achèvement et de reprise de livraison restent dans le chat — qui demeure l'endroit pour suivre l'avancement ou relancer une livraison échouée — et le canvas reste le vôtre. Si vous téléchargez aujourd'hui, prenez 0.16.1.</p>

      <h2>Ce que vous pouvez en faire aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>découvrez Open Design</td><td>Téléchargez l'app desktop, démarrez un projet et choisissez une direction visuelle faite pour le format sur lequel vous travaillez</td></tr>
          <tr><td>lancez de longues tâches</td><td>Poussez une longue exécution plus loin — atteindre le plafond de contexte continue désormais avec le contexte utile le plus récent, fichiers intacts</td></tr>
          <tr><td>êtes sur une build ancienne</td><td>Lancez « Rechercher les mises à jour… » — l'état est maintenant explicite, et l'export PPTX refonctionne après la mise à niveau</td></tr>
          <tr><td>utilisez vos propres clés</td><td>Retestez vos fournisseurs BYOK : les erreurs apparaissent à la configuration, les brouillons n'écrasent plus une config qui marche</td></tr>
          <tr><td>vivez dans l'aperçu</td><td>Rouvrez une page desktop large ou un deck ancien — le cadre s'ajuste et les touches répondent</td></tr>
        </tbody>
      </table>

      <h2>Et maintenant</h2>
      <p>Une version en laquelle on peut avoir confiance est surtout une version qui arrête de perdre des choses. 0.16.0 dépense son budget exactement là — une mise à jour qui atterrit, une longue tâche qui garde ses fichiers, un style adapté au format, un aperçu qui s'écarte. Téléchargez l'app desktop, relancez la plus longue tâche que vous ayez, et regardez-la arriver entière.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Télécharger Open Design</a>.</p>
      <p>92 PR en cinq jours, de la part de 20 personnes qui ont chacune comblé un écart de plus entre un résultat fini et un résultat livré. La fiabilité est un travail sans gloire, et c'est le travail qui rend tout le reste crédible. On vous voit. 🚀</p>

      <h2>À lire ensuite</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — vision plus nette, flow plus long</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — coûter moins, livrer plus vite</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — la machine à remonter l'inspiration</a></li>
      </ul>
  ru:
    title: 'Open Design 0.16.0: надёжная доставка'
    summary: 'open-design-v0.16.0 — 92 PR от 20 участников за пять дней. Кодовое имя «Reliable Delivery». Визуальное направление теперь следует за тем, что вы действительно делаете, автообновления по-настоящему вступают в силу, длинные задачи сохраняют результат вместе с файлами, а превью перестаёт бороться с рамкой. Плюс центр сообщений внутри приложения — и патч 0.16.1, убравший последнее, что закрывало холст.'
    category: 'Продукт'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, опубликован 22 июля 2026 года. <strong>92 PR от 20 участников за пять дней.</strong> Кодовое имя «Reliable Delivery». Прошлый релиз занимался тем, сколько стоит один прогон. Этот занимается тем, что происходит между готовым результатом и моментом, когда он действительно доходит до вас: наполовину применённое обновление, длинная задача, потерявшая файлы, превью, с которым приходилось бороться, экспорт, потерявший слайд.</p>
      <p>Полный список изменений — в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">заметках о релизе на GitHub</a>. Здесь короткая версия: что изменилось внутри, что с этим можно делать сегодня и с чего начать.</p>

      <h2>Визуальное направление следует за тем, что вы делаете</h2>
      <p>Раньше стиль был решением, доступным только для презентаций и прототипов. Всё остальное — документ, постер, видео, Web Clone, вайрфрейм, мобильный экран, Hyperframe — начиналось с того, что придёт в голову модели.</p>
      <p>В 0.16.0 <strong>у каждого формата появляется собственное визуальное направление</strong>, и превью отрисовывается так, как этот формат действительно выглядит. Четыре быстрых варианта лежат прямо там, где вы работаете, а полная библиотека стилей — в одном клике. Вы выбираете вид для того, что перед вами, вместо того чтобы в уме переводить тему презентации в постер.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Набросок разных форматов — документ, постер, видео, мобильный экран — каждый превращается в собственное превью стиля с правильными пропорциями внутри спокойного шалфейно-зелёного интерфейса, тёплая редакционная иллюстрация" />
        <figcaption>Документы, постеры, видео, Web Clone, вайрфреймы, мобильные работы и Hyperframe получают превью под свой формат — четыре варианта под рукой, полная библиотека в одном клике.</figcaption>
      </figure>

      <h2>Обновления, которые действительно вступают в силу</h2>
      <p>Обновление, применённое наполовину, хуже, чем его отсутствие: приложение сообщает о новой версии, пока какая-то функция тихо работает на старой. 0.16.0 доводит обновление до конца. <strong>После обновления новая версия вступает в силу надёжнее, а функции, сломанные неполным обновлением, — включая экспорт в PPTX — снова работают.</strong></p>
      <p>На macOS пункт «Проверить обновления…» теперь прямо говорит, в каком вы состоянии: актуальная версия, загрузка, готово к перезапуску, ожидание завершения текущей работы или требуется ручная загрузка. Надёжность обновлений на Windows тоже выросла. Спасибо <a href="https://github.com/PerishCode">@PerishCode</a> за долгую работу в этом направлении.</p>

      <h2>Длинные задачи сохраняют ответ — и свои файлы</h2>
      <p>Самая ценная работа живёт в длинных прогонах, и именно там она чаще всего пропадала. В 0.16.0 задача, подходящая к пределу диалога, <strong>продолжается с самым свежим полезным контекстом вместо резкого падения</strong>, а файлы, созданные раньше по ходу прогона, <strong>остаются прикреплёнными к результату</strong>, а не исчезают вместе с уплотнением.</p>
      <p>Пути отказа стали честнее: восстановленные вспомогательные агенты больше не превращают успешную работу в отчёт об ошибке, прерванные задачи после перезапуска показывают точное состояние, отменённая работа остаётся отменённой, а по-настоящему неустранимые ошибки останавливаются с объяснением, с которым можно что-то сделать, а не с бесконечным спиннером.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Длинная неразрывная нить проносит стопку созданных файловых карточек через сужающиеся ворота и доставляет её целиком в спокойный шалфейно-зелёный интерфейс, тёплая редакционная иллюстрация" />
        <figcaption>Приближение к пределу контекста больше не заканчивает прогон — задача продолжается с самым свежим полезным контекстом, и уже созданные файлы приходят вместе с ней.</figcaption>
      </figure>

      <h2>Новости продукта получили место внутри приложения</h2>
      <p>Новое в 0.16.0: <strong>центр сообщений за иконкой колокольчика в шапке главной и проекта</strong> — счётчики непрочитанного, фильтры, «отметить всё прочитанным» и ссылки прямо на то, о чём идёт речь. Статус прочтения остаётся на устройстве при анонимной работе и следует за аккаунтом после входа, даты отображаются по вашей локали, а кнопка закрытия всегда там, где вы её ищете. Спасибо <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>BYOK ловит проблемы настройки до того, как они вас прервут</h2>
      <p>Свой ключ должен ломаться на этапе настройки, а не через три минуты после старта задачи. <strong>Незавершённые правки теперь остаются восстановимым черновиком вместо того, чтобы затирать рабочую конфигурацию</strong>, так что недоделанное изменение больше не уронит провайдера, на которого вы рассчитываете.</p>
      <p>Проверка соединения ведёт себя ближе к настоящей задаче, показывает реальную ошибку провайдера и сохраняет его собственный порядок моделей — больше никакого алфавитного списка, в котором тонет нужная модель. Совместимые адреса MiniMax, DeepSeek и MiMo обрабатываются последовательнее, устаревшие значения по умолчанию для Moonshot и DeepSeek указывают на актуальные модели, а настройки и онбординг наконец показывают один и тот же набор вариантов. Память тоже может использовать уже сохранённый совместимый ключ MiniMax и прямо сообщает, когда провайдер поддерживает только изображения или аудио.</p>

      <h2>Превью перестаёт бороться с рамкой</h2>
      <p>Мелкое трение, которое чувствуется постоянно. Широкие десктопные страницы теперь <strong>вписываются в панель, пока вы не выберете свой масштаб</strong>, старые презентации сразу отвечают на клавиши навигации, а свежий главный HTML-файл появляется сразу после завершения задачи, а не после ручного обновления. Когда ресурс заблокирован из соображений безопасности, превью называет соответствующий файл проекта, не раскрывая чувствительный системный путь.</p>
      <p>Генерация изображений тоже стала устойчивее: <strong>Nano Banana и пользовательская генерация повторяют попытку один раз, если провайдер ненадолго занят</strong>, а правки по референсу в GPT Image работают в большем числе совместимых сервисов. Сбой превращается в короткое ожидание, а не в потерянный творческий ход.</p>

      <h2>Что ещё вошло в 0.16.0</h2>
      <ul>
        <li><strong>Галереи начинают с того, чем действительно пользуются</strong> — галереи слайдов, изображений, видео и другие непрототипные разделы поднимают наверх шаблоны с реальным использованием, а пустые записи и карточки без превью перестают забивать верх списка. У прототипов остаётся своя редакционная витрина, а полный каталог сохраняется в каждой категории.</li>
        <li><strong>Дизайн-системы импортируются точнее</strong> — импорт из репозитория выбирает правильный сценарий, разнесённые пакеты токенов сохраняют значения раскладки, а привычные форматы списков и многострочных значений в YAML сохраняют метаданные, которые написали авторы.</li>
        <li><strong>Более строгие локальные границы безопасности</strong> — импортированные проекты держат скрытые учётные данные при себе, удаление плагина не выходит за его собственные файлы, содержимое маркетплейса и сохранённых сайтов обрабатывается аккуратнее, а каждый разговор остаётся привязанным к нужному проекту.</li>
        <li><strong>Превью перед публикацией</strong> — деплой в Cloudflare Pages выносит Preview и Production в явные цели и в интерфейсе, и в <code>od deploy --target … --json</code>, так что превью возвращает собственный URL, а не подменяет ваш боевой домен.</li>
        <li><strong>Kiro появился в выборе настройки MCP</strong> — скопируйте правильный фрагмент общего сервера из настроек вместо ручного перевода формата другого клиента.</li>
        <li><strong>Тихие исправления, которые стоит назвать</strong> — уточняющие запросы MCP получают последнее сообщение, история ACP перестала обрастать пустыми строками после обновления, а устройства Windows со старыми процессорами снова запускают OpenCode обычным путём обновления.</li>
      </ul>

      <h2>Уже исправлено: 0.16.1</h2>
      <p>На следующий день <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> принёс одно точечное исправление для превью дизайна: <strong>статус выполнения больше не закрывает созданную работу.</strong> Статусы сборки, завершения и восстановления доставки остаются в чате — там же вы по-прежнему следите за прогрессом и повторяете неудавшуюся доставку, — а холст остаётся вашим. Если скачиваете сегодня, берите 0.16.1.</p>

      <h2>Что с этим делать сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните отсюда</th></tr>
        </thead>
        <tbody>
          <tr><td>только знакомитесь с Open Design</td><td>Скачайте десктопное приложение, начните проект и выберите визуальное направление под тот формат, в котором работаете</td></tr>
          <tr><td>запускаете длинные задачи</td><td>Продвиньте длинный прогон дальше — упор в потолок контекста теперь продолжается со свежим полезным контекстом, файлы на месте</td></tr>
          <tr><td>сидите на старой сборке</td><td>Запустите «Проверить обновления…» — состояние теперь явное, а экспорт в PPTX после обновления работает</td></tr>
          <tr><td>используете свои ключи</td><td>Перепроверьте своих BYOK-провайдеров: ошибки всплывают на этапе настройки, а черновики не затирают рабочую конфигурацию</td></tr>
          <tr><td>живёте в превью</td><td>Откройте заново широкую десктопную страницу или старую презентацию — рамка подстроится, а клавиши ответят</td></tr>
        </tbody>
      </table>

      <h2>Что дальше</h2>
      <p>Релиз, которому можно доверять, — это в основном релиз, который перестал терять вещи. 0.16.0 тратит бюджет именно здесь: обновление, которое доезжает, длинная задача, которая держит файлы, стиль, подходящий формату, превью, которое уходит с дороги. Скачайте десктопное приложение, перезапустите самую длинную свою задачу и посмотрите, как она доходит целиком.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Скачать Open Design</a>.</p>
      <p>92 PR за пять дней от 20 человек, каждый из которых закрыл ещё один разрыв между готовым результатом и доставленным. Надёжность — работа без блеска, и именно она делает всё остальное убедительным. Мы вас видим. 🚀</p>

      <h2>Что почитать дальше</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — чётче взгляд, длиннее поток</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — дешевле и быстрее</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — машина времени для вдохновения</a></li>
      </ul>
  es:
    title: 'Open Design 0.16.0: entrega fiable'
    summary: 'open-design-v0.16.0 — 92 PR de 20 personas en cinco días. Nombre en clave «Reliable Delivery». La dirección visual ahora sigue a lo que estás haciendo de verdad, las actualizaciones automáticas surten efecto, las tareas largas conservan su resultado y los archivos que lo acompañan, y las vistas previas dejan de pelearse con el marco. Además, un centro de mensajes dentro de la app y el parche 0.16.1 que despejó lo último que tapaba el lienzo.'
    category: 'Producto'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, publicado el 22 de julio de 2026. <strong>92 PR de 20 personas en cinco días.</strong> Nombre en clave «Reliable Delivery». La versión anterior fue a por lo que cuesta cada ejecución. Esta va a por lo que ocurre entre un resultado terminado y el momento en que de verdad llega a tus manos: la actualización aplicada a medias, la tarea larga que perdió sus archivos, la vista previa contra la que había que pelear, la exportación a la que le faltaba una diapositiva.</p>
      <p>El changelog completo vive en las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">notas de la versión en GitHub</a>. Esta es la versión corta: qué cambió por debajo, qué puedes hacer con ello hoy y por dónde empezar.</p>

      <h2>La dirección visual sigue a lo que realmente estás haciendo</h2>
      <p>El estilo fue durante mucho tiempo una decisión reservada a presentaciones y prototipos. Todo lo demás — un documento, un póster, un vídeo, un Web Clone, un wireframe, una pantalla móvil, un Hyperframe — arrancaba con lo que al modelo le apeteciera.</p>
      <p>En 0.16.0, <strong>cada formato tiene su propia dirección visual</strong>, con vistas previas renderizadas tal y como ese formato se ve de verdad. Cuatro opciones rápidas se quedan donde estás trabajando y la biblioteca completa de estilos está a un clic. Eliges un aspecto para lo que tienes delante en vez de traducir mentalmente un tema de presentación a un póster.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Un boceto de varios formatos de salida — documento, póster, vídeo, pantalla móvil — que se convierten cada uno en su propia vista previa de estilo con las proporciones correctas dentro de una interfaz verde salvia serena, en ilustración editorial cálida" />
        <figcaption>Documentos, pósteres, vídeos, Web Clones, wireframes, trabajo móvil e Hyperframes reciben vistas previas adecuadas a su formato: cuatro opciones a mano y la biblioteca completa a un clic.</figcaption>
      </figure>

      <h2>Actualizaciones que sí surten efecto</h2>
      <p>Una actualización aplicada a medias es peor que ninguna: la app anuncia una versión nueva mientras una función sigue corriendo en la vieja. 0.16.0 hace que la actualización aterrice. <strong>Tras actualizar, la nueva versión surte efecto de forma más fiable y las funciones que una actualización incompleta rompía — la exportación a PPTX entre ellas — vuelven a funcionar.</strong></p>
      <p>En macOS, «Buscar actualizaciones…» ahora dice en qué estado estás: al día, descargando, listo para reiniciar, esperando a que termine el trabajo en curso o con necesidad de descarga manual. La fiabilidad de las actualizaciones también mejora en Windows. Gracias a <a href="https://github.com/PerishCode">@PerishCode</a> por una larga tanda de trabajo aquí.</p>

      <h2>Las tareas largas conservan su respuesta — y sus archivos</h2>
      <p>El trabajo más valioso vive en las ejecuciones largas, y ahí era donde más se perdía. En 0.16.0, una tarea que se acerca al límite de conversación <strong>continúa con el contexto útil más reciente en lugar de fallar de golpe</strong>, y los archivos generados antes en la ejecución <strong>siguen unidos al resultado</strong> en vez de desaparecer con la compactación.</p>
      <p>Las rutas de fallo también se volvieron más honestas: los agentes auxiliares recuperados ya no convierten un trabajo correcto en un fallo declarado, las tareas interrumpidas muestran un estado exacto tras reiniciar, el trabajo cancelado sigue cancelado y los errores que de verdad no se pueden recuperar se detienen con una explicación accionable en lugar de un indicador girando sin fin.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Un hilo largo e ininterrumpido lleva una pila de fichas de archivos generados a través de una compuerta que se estrecha y llega intacta a una interfaz verde salvia serena, en ilustración editorial cálida" />
        <figcaption>Acercarse al límite de contexto ya no termina la ejecución: la tarea continúa con el contexto útil más reciente y los archivos ya producidos llegan con ella.</figcaption>
      </figure>

      <h2>Las novedades del producto tienen su sitio dentro de la app</h2>
      <p>Nuevo en 0.16.0: <strong>un centro de mensajes detrás de una campana en las cabeceras de Inicio y de proyecto</strong>, con contadores de no leídos, filtros, marcar todo como leído y enlaces directos a aquello de lo que se habla. El estado de lectura se queda en el dispositivo en uso anónimo y sigue a tu cuenta al iniciar sesión, las fechas se muestran en tu idioma y el botón de cerrar está siempre donde lo esperas. Gracias <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>BYOK detecta los problemas de configuración antes de interrumpirte</h2>
      <p>Traer tu propia clave debería fallar al configurarla, no tres minutos después de empezar una tarea. <strong>Las ediciones incompletas ahora quedan como borradores recuperables en lugar de sobrescribir una configuración que funciona</strong>, así que un cambio a medias ya no puede tumbar un proveedor del que dependes.</p>
      <p>Las pruebas de conexión se comportan más como tareas reales, muestran el error auténtico del proveedor y conservan su propio orden de modelos: se acabó la lista alfabética que entierra el modelo que querías. Las direcciones compatibles de MiniMax, DeepSeek y MiMo se tratan de forma más uniforme, los valores por defecto obsoletos de Moonshot y DeepSeek apuntan a modelos actuales, y Ajustes y el onboarding por fin muestran las mismas opciones. La memoria también puede usar una clave compatible de MiniMax que ya tengas guardada, y dice con claridad cuándo un proveedor solo admite imagen o audio.</p>

      <h2>Las vistas previas dejan de pelearse con el marco</h2>
      <p>Fricción pequeña, sentida a diario. Las páginas de escritorio anchas ahora <strong>encajan en el panel hasta que eliges tu propio zoom</strong>, las presentaciones antiguas responden de inmediato a las teclas de navegación y el último archivo HTML principal aparece en cuanto termina la tarea, sin refrescar a mano. Cuando un recurso se bloquea por seguridad, la vista previa nombra el archivo de proyecto implicado sin exponer una ruta de sistema sensible.</p>
      <p>La generación de imágenes también ganó solidez: <strong>Nano Banana y la generación de imágenes personalizada reintentan una vez cuando un proveedor está brevemente ocupado</strong>, y las ediciones por referencia de GPT Image funcionan en más servicios compatibles. Un tropiezo pasa a ser una espera corta en lugar de un turno creativo perdido.</p>

      <h2>Qué más llega en 0.16.0</h2>
      <ul>
        <li><strong>Las galerías empiezan por lo que la gente usa de verdad</strong>: las galerías de Slides, imagen, vídeo y otras que no son de prototipo destacan las plantillas con uso real, mientras que las entradas en blanco y las tarjetas sin vista previa dejan de ocupar la cabecera. Prototype conserva su escaparate editorial y cada categoría mantiene su catálogo completo.</li>
        <li><strong>Los design systems se importan con más fidelidad</strong>: las importaciones de repositorio eligen el flujo correcto, los paquetes de tokens divididos conservan sus valores de maquetación y los formatos habituales de listas y valores multilínea en YAML preservan los metadatos que escribieron sus autores.</li>
        <li><strong>Fronteras de seguridad locales más firmes</strong>: los proyectos importados mantienen privadas las credenciales ocultas, eliminar un plugin se queda dentro de los archivos de ese plugin, el contenido del marketplace y de los sitios guardados se maneja con más cuidado y cada conversación sigue ligada al proyecto correcto.</li>
        <li><strong>Previsualiza antes de publicar</strong>: el despliegue en Cloudflare Pages expone Preview y Production como destinos explícitos en la interfaz y en <code>od deploy --target … --json</code>, de modo que una vista previa devuelve su propia URL en lugar de sustituir tu dominio en producción.</li>
        <li><strong>Kiro entra en el selector de configuración MCP</strong>: copia el fragmento correcto de servidor compartido desde Ajustes en vez de traducir a mano el formato de otro cliente.</li>
        <li><strong>Correcciones discretas que merecen mención</strong>: los seguimientos de MCP reciben el último mensaje, los historiales ACP dejan de acumular filas vacías tras refrescar y los equipos Windows con procesadores antiguos vuelven a ejecutar OpenCode por la ruta normal de actualización.</li>
      </ul>

      <h2>Ya parcheado: 0.16.1</h2>
      <p>Al día siguiente, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> trajo una corrección concreta para la vista previa de diseño: <strong>el estado de ejecución ya no tapa tu trabajo generado.</strong> Los estados de construcción, finalización y recuperación de entrega se quedan en el chat — que sigue siendo el lugar para seguir el progreso o reintentar una entrega fallida — y el lienzo vuelve a ser tuyo. Si descargas hoy, coge la 0.16.1.</p>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>nuevo en Open Design</td><td>Descarga la app de escritorio, empieza un proyecto y elige una dirección visual pensada para el formato en el que trabajas</td></tr>
          <tr><td>de tareas largas</td><td>Lleva una ejecución larga más lejos: llegar al techo de contexto ahora continúa con el contexto útil más reciente, con los archivos intactos</td></tr>
          <tr><td>usuario de una build antigua</td><td>Ejecuta «Buscar actualizaciones…»: el estado ahora es explícito y la exportación a PPTX funciona tras actualizar</td></tr>
          <tr><td>de los que usan sus propias claves</td><td>Vuelve a probar tus proveedores BYOK: los errores aparecen al configurar y los borradores no pisan una configuración que funciona</td></tr>
          <tr><td>de vivir en la vista previa</td><td>Reabre una página de escritorio ancha o una presentación antigua: el marco encaja y las teclas responden</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer ahora</h2>
      <p>Una versión en la que confiar es, sobre todo, una versión que deja de perder cosas. 0.16.0 gasta ahí su presupuesto: una actualización que aterriza, una tarea larga que conserva sus archivos, un estilo acorde al formato y una vista previa que se aparta. Descarga la app de escritorio, vuelve a lanzar la tarea más larga que tengas y mírala llegar entera.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Descargar Open Design</a>.</p>
      <p>92 PR en cinco días, de 20 personas que cerraron cada una un hueco más entre un resultado terminado y uno entregado. La fiabilidad es un trabajo poco vistoso, y es el trabajo que hace creíble todo lo demás. Os vemos. 🚀</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — visión más nítida, flow más largo</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — cuesta menos, entrega antes</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — la máquina del tiempo de la inspiración</a></li>
      </ul>
  pt-br:
    title: 'Open Design 0.16.0: entrega confiável'
    summary: 'open-design-v0.16.0 — 92 PRs de 20 pessoas em cinco dias. Codinome “Reliable Delivery”. A direção visual agora acompanha o que você está realmente criando, as atualizações automáticas passam a valer de fato, tarefas longas guardam o resultado e os arquivos que vieram com ele, e as prévias param de brigar com a moldura. Além de uma central de mensagens dentro do app — e o patch 0.16.1, que tirou a última coisa em cima do canvas.'
    category: 'Produto'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, publicado em 22 de julho de 2026. <strong>92 PRs de 20 pessoas em cinco dias.</strong> Codinome “Reliable Delivery”. A versão anterior atacou o custo de cada execução. Esta ataca o que acontece entre um resultado pronto e o momento em que ele realmente chega até você: a atualização aplicada pela metade, a tarefa longa que perdeu os arquivos, a prévia com que era preciso brigar, a exportação que deixou um slide para trás.</p>
      <p>O changelog completo está nas <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">notas de versão no GitHub</a>. Aqui vai a versão curta: o que mudou por baixo, o que dá para fazer com isso hoje e por onde começar.</p>

      <h2>A direção visual acompanha o que você está realmente criando</h2>
      <p>Por muito tempo, estilo era uma decisão possível apenas para apresentações e protótipos. Todo o resto — um documento, um pôster, um vídeo, um Web Clone, um wireframe, uma tela mobile, um Hyperframe — começava com o que o modelo tivesse vontade de fazer.</p>
      <p>No 0.16.0, <strong>cada formato ganha a própria direção visual</strong>, com prévias renderizadas do jeito que aquele formato é realmente visto. Quatro escolhas rápidas ficam onde você está trabalhando e a biblioteca completa de estilos está a um clique. Você escolhe uma cara para o que está à sua frente em vez de traduzir mentalmente um tema de apresentação para um pôster.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Um esboço de vários formatos de saída — documento, pôster, vídeo, tela de celular — virando cada um a própria prévia de estilo com as proporções certas dentro de uma interface verde-sálvia serena, em ilustração editorial acolhedora" />
        <figcaption>Documentos, pôsteres, vídeos, Web Clones, wireframes, trabalhos mobile e Hyperframes ganham prévias adequadas ao seu formato — quatro escolhas à mão e a biblioteca inteira a um clique.</figcaption>
      </figure>

      <h2>Atualizações que realmente passam a valer</h2>
      <p>Uma atualização aplicada pela metade é pior do que nenhuma: o app anuncia uma versão nova enquanto um recurso continua silenciosamente na antiga. O 0.16.0 faz a atualização aterrissar. <strong>Depois de atualizar, a nova versão passa a valer com mais confiabilidade, e recursos quebrados por uma atualização incompleta — inclusive a exportação para PPTX — voltam a funcionar.</strong></p>
      <p>No macOS, “Verificar atualizações…” agora diz em que estado você está: atualizado, baixando, pronto para reiniciar, aguardando o trabalho em andamento terminar ou precisando de download manual. A confiabilidade das atualizações também melhora no Windows. Obrigado a <a href="https://github.com/PerishCode">@PerishCode</a> por uma longa sequência de trabalho aqui.</p>

      <h2>Tarefas longas guardam a resposta — e os arquivos</h2>
      <p>O trabalho mais valioso mora nas execuções longas, e era ali que ele mais sumia. No 0.16.0, uma tarefa que se aproxima do limite da conversa <strong>continua com o contexto útil mais recente em vez de falhar de repente</strong>, e os arquivos gerados antes na execução <strong>continuam presos ao resultado</strong> em vez de sumirem junto com a compactação.</p>
      <p>Os caminhos de falha também ficaram mais honestos: agentes auxiliares recuperados não transformam mais trabalho bem-sucedido em falha reportada, tarefas interrompidas mostram um estado exato depois de reiniciar, trabalho cancelado permanece cancelado, e erros que realmente não têm recuperação param com uma explicação acionável em vez de um carregando infinito.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Um fio longo e sem rupturas levando uma pilha de fichas de arquivos gerados por um portal que se estreita e chegando inteiro a uma interface verde-sálvia serena, em ilustração editorial acolhedora" />
        <figcaption>Chegar perto do limite de contexto não encerra mais a execução — a tarefa segue com o contexto útil mais recente, e os arquivos já produzidos chegam junto.</figcaption>
      </figure>

      <h2>As novidades do produto ganharam um lugar dentro do app</h2>
      <p>Novo no 0.16.0: <strong>uma central de mensagens atrás de um sino nos cabeçalhos da Home e do projeto</strong> — contadores de não lidos, filtros, marcar tudo como lido e links direto para o que está sendo anunciado. O estado de leitura fica no dispositivo no uso anônimo e acompanha sua conta quando você entra, as datas aparecem no seu idioma e o botão de fechar está sempre onde você espera. Obrigado, <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>O BYOK pega problemas de configuração antes de te interromper</h2>
      <p>Trazer a própria chave deveria falhar na hora de configurar, não três minutos depois do início de uma tarefa. <strong>Edições incompletas agora ficam como rascunhos recuperáveis em vez de sobrescrever uma configuração que funciona</strong>, então uma mudança pela metade não derruba mais um provedor do qual você depende.</p>
      <p>Os testes de conexão se comportam mais como tarefas reais, mostram o erro real do provedor e preservam a ordem de modelos de cada um — chega de lista alfabética que enterra o modelo que você queria. Endereços compatíveis de MiniMax, DeepSeek e MiMo são tratados com mais consistência, padrões desatualizados de Moonshot e DeepSeek passam a apontar para modelos atuais, e as Configurações e o onboarding finalmente mostram as mesmas opções. A memória também consegue usar uma chave MiniMax compatível já salva e diz claramente quando um provedor só suporta imagem ou áudio.</p>

      <h2>As prévias param de brigar com a moldura</h2>
      <p>Atrito pequeno, sentido o tempo todo. Páginas desktop largas agora <strong>cabem no painel até você escolher o próprio zoom</strong>, apresentações antigas respondem às teclas de navegação na hora e o arquivo HTML principal mais recente aparece assim que a tarefa termina, sem atualizar na mão. Quando um recurso é bloqueado por segurança, a prévia aponta o arquivo de projeto envolvido sem expor um caminho de sistema sensível.</p>
      <p>A geração de imagens também ficou mais firme: <strong>Nano Banana e a geração de imagens personalizada tentam de novo uma vez quando um provedor está brevemente ocupado</strong>, e as edições por referência do GPT Image funcionam em mais serviços compatíveis. Um soluço vira uma espera curta em vez de um turno criativo perdido.</p>

      <h2>O que mais entra no 0.16.0</h2>
      <ul>
        <li><strong>As galerias começam pelo que as pessoas realmente usam</strong> — as galerias de slides, imagem, vídeo e outras que não são de protótipo destacam modelos com uso real, enquanto entradas em branco e cards sem prévia deixam de ocupar o topo. Protótipo mantém sua vitrine editorial e cada categoria mantém o catálogo completo.</li>
        <li><strong>Design systems são importados com mais fidelidade</strong> — importações de repositório escolhem o fluxo certo, pacotes de tokens divididos preservam seus valores de layout, e os formatos comuns de lista e multilinha em YAML preservam os metadados que os autores escreveram.</li>
        <li><strong>Fronteiras locais de segurança mais firmes</strong> — projetos importados mantêm credenciais ocultas em sigilo, remover um plugin fica dentro dos arquivos daquele plugin, conteúdos do marketplace e de sites salvos são tratados com mais cuidado, e cada conversa continua ligada ao projeto certo.</li>
        <li><strong>Prévia antes de publicar</strong> — o deploy no Cloudflare Pages expõe Preview e Production como destinos explícitos na interface e em <code>od deploy --target … --json</code>, então uma prévia devolve a própria URL em vez de substituir seu domínio em produção.</li>
        <li><strong>Kiro entra no seletor de configuração MCP</strong> — copie o trecho certo de servidor compartilhado nas Configurações em vez de traduzir o formato de outro cliente na mão.</li>
        <li><strong>Correções silenciosas que merecem menção</strong> — follow-ups de MCP recebem a mensagem mais recente, históricos ACP param de criar linhas vazias após atualizar, e máquinas Windows com processadores mais antigos voltam a rodar o OpenCode pelo caminho normal de atualização.</li>
      </ul>

      <h2>Já corrigido: 0.16.1</h2>
      <p>No dia seguinte, o <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> trouxe uma correção focada para a prévia de design: <strong>o status de execução não cobre mais o trabalho gerado.</strong> Os status de construção, conclusão e recuperação de entrega ficam no Chat — que segue sendo o lugar de acompanhar o progresso ou tentar de novo uma entrega que falhou — e o canvas volta a ser seu. Se for baixar hoje, pegue o 0.16.1.</p>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>é novo no Open Design</td><td>Baixe o app de desktop, comece um projeto e escolha uma direção visual feita para o formato em que está trabalhando</td></tr>
          <tr><td>roda tarefas longas</td><td>Leve uma execução longa mais adiante — bater no teto de contexto agora segue com o contexto útil mais recente, com os arquivos intactos</td></tr>
          <tr><td>está numa build antiga</td><td>Rode “Verificar atualizações…” — o estado agora é explícito e a exportação para PPTX funciona depois de atualizar</td></tr>
          <tr><td>usa as próprias chaves</td><td>Teste de novo seus provedores BYOK: os erros aparecem na configuração e rascunhos não atropelam uma config que funciona</td></tr>
          <tr><td>vive na prévia</td><td>Reabra uma página desktop larga ou uma apresentação antiga — a moldura encaixa e as teclas respondem</td></tr>
        </tbody>
      </table>

      <h2>O que fazer em seguida</h2>
      <p>Uma versão em que dá para confiar é, na maior parte, uma versão que parou de perder coisas. O 0.16.0 gasta o orçamento aí — uma atualização que aterrissa, uma tarefa longa que guarda os arquivos, um estilo que combina com o formato, uma prévia que sai da frente. Baixe o app de desktop, rode de novo a tarefa mais longa que você tem e veja-a chegar inteira.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Baixar o Open Design</a>.</p>
      <p>92 PRs em cinco dias, de 20 pessoas que fecharam cada uma mais uma fresta entre um resultado pronto e um resultado entregue. Confiabilidade é um trabalho sem glamour, e é o trabalho que torna todo o resto crível. A gente vê vocês. 🚀</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — visão mais nítida, flow mais longo</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — custe menos, entregue mais rápido</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — a máquina do tempo da inspiração</a></li>
      </ul>
  it:
    title: 'Open Design 0.16.0: consegna affidabile'
    summary: 'open-design-v0.16.0 — 92 PR da 20 contributori in cinque giorni. Nome in codice «Reliable Delivery». La direzione visiva ora segue ciò che stai davvero costruendo, gli aggiornamenti automatici hanno davvero effetto, le attività lunghe conservano il risultato e i file che lo accompagnano, e le anteprime smettono di litigare con la cornice. In più un centro messaggi dentro l''app e la patch 0.16.1, che ha liberato l''ultima cosa rimasta sopra la canvas.'
    category: 'Prodotto'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, pubblicato il 22 luglio 2026. <strong>92 PR da 20 contributori in cinque giorni.</strong> Nome in codice «Reliable Delivery». La release precedente puntava a quanto costa un'esecuzione. Questa punta a ciò che accade tra un risultato finito e il momento in cui ti raggiunge davvero: l'aggiornamento applicato a metà, l'attività lunga che ha perso i suoi file, l'anteprima con cui bisognava combattere, l'esportazione a cui mancava una slide.</p>
      <p>Il changelog completo vive nelle <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">note di rilascio su GitHub</a>. Qui la versione breve: cosa è cambiato sotto, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>La direzione visiva segue ciò che stai davvero costruendo</h2>
      <p>Per molto tempo lo stile è stato una decisione possibile solo per deck e prototipi. Tutto il resto — un documento, un poster, un video, un Web Clone, un wireframe, una schermata mobile, un Hyperframe — partiva da qualunque cosa passasse per la testa al modello.</p>
      <p>In 0.16.0 <strong>ogni formato ottiene la propria direzione visiva</strong>, con anteprime renderizzate nel modo in cui quel formato viene davvero visto. Quattro scelte rapide restano dove stai lavorando e l'intera libreria di stili è a un clic. Scegli un look per la cosa che hai davanti invece di tradurre mentalmente un tema da deck in un poster.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Uno schizzo di diversi formati di output — documento, poster, video, schermata mobile — che diventano ciascuno la propria anteprima di stile con le proporzioni corrette dentro un'interfaccia verde salvia pacata, illustrazione editoriale calda" />
        <figcaption>Documenti, poster, video, Web Clone, wireframe, lavori mobile e Hyperframe ricevono anteprime adatte al loro formato: quattro scelte a portata di mano, la libreria completa a un clic.</figcaption>
      </figure>

      <h2>Aggiornamenti che hanno davvero effetto</h2>
      <p>Un aggiornamento applicato a metà è peggio di nessun aggiornamento: l'app dichiara una versione nuova mentre una funzione gira silenziosamente su quella vecchia. 0.16.0 fa atterrare l'upgrade. <strong>Dopo l'aggiornamento la nuova versione entra in vigore in modo più affidabile e le funzioni rotte da un aggiornamento incompleto — tra cui l'esportazione PPTX — tornano a funzionare.</strong></p>
      <p>Su macOS, «Verifica aggiornamenti…» ora dice in quale stato ti trovi: aggiornato, in download, pronto al riavvio, in attesa che finisca il lavoro in corso oppure bisognoso di un download manuale. Anche su Windows l'affidabilità degli aggiornamenti migliora. Grazie a <a href="https://github.com/PerishCode">@PerishCode</a> per una lunga serie di interventi qui.</p>

      <h2>Le attività lunghe conservano la risposta — e i loro file</h2>
      <p>Il lavoro più prezioso vive nelle esecuzioni lunghe, ed è lì che spariva più spesso. In 0.16.0 un'attività che si avvicina al limite della conversazione <strong>prosegue con il contesto utile più recente invece di fallire di colpo</strong>, e i file generati nelle fasi iniziali <strong>restano attaccati al risultato</strong> invece di svanire con la compattazione.</p>
      <p>Anche i percorsi di errore sono diventati più onesti: gli agenti ausiliari recuperati non trasformano più un lavoro riuscito in un fallimento dichiarato, le attività interrotte mostrano uno stato corretto dopo il riavvio, il lavoro annullato resta annullato, e gli errori davvero irrecuperabili si fermano con una spiegazione su cui puoi agire invece che con uno spinner infinito.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Un lungo filo ininterrotto porta una pila di schede di file generati attraverso un varco che si restringe e arriva intatto in un'interfaccia verde salvia pacata, illustrazione editoriale calda" />
        <figcaption>Avvicinarsi al limite di contesto non chiude più l'esecuzione: l'attività prosegue con il contesto utile più recente e i file già prodotti arrivano insieme a lei.</figcaption>
      </figure>

      <h2>Le novità di prodotto hanno una casa dentro l'app</h2>
      <p>Nuovo in 0.16.0: <strong>un centro messaggi dietro una campanella nelle intestazioni di Home e progetto</strong>, con contatori dei non letti, filtri, segna tutto come letto e link diretti a ciò di cui si parla. Lo stato di lettura resta sul dispositivo nell'uso anonimo e segue il tuo account una volta effettuato l'accesso, le date usano la tua lingua e il pulsante di chiusura è sempre dove te lo aspetti. Grazie <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>BYOK intercetta i problemi di configurazione prima che ti interrompano</h2>
      <p>Portare la propria chiave dovrebbe fallire in fase di configurazione, non tre minuti dopo l'inizio di un'attività. <strong>Le modifiche incomplete ora restano bozze recuperabili invece di sovrascrivere una configurazione funzionante</strong>: una modifica lasciata a metà non può più far cadere un provider da cui dipendi.</p>
      <p>I test di connessione si comportano più come attività reali, mostrano l'errore effettivo del provider e conservano l'ordine dei modelli scelto da ciascuno — niente più elenco alfabetico che seppellisce il modello che volevi. Gli indirizzi compatibili MiniMax, DeepSeek e MiMo sono gestiti in modo più coerente, i default obsoleti di Moonshot e DeepSeek puntano a modelli attuali, e Impostazioni e onboarding mostrano finalmente le stesse scelte. Anche Memory può usare una chiave MiniMax compatibile già salvata e dice chiaramente quando un provider supporta solo immagini o audio.</p>

      <h2>Le anteprime smettono di litigare con la cornice</h2>
      <p>Attrito piccolo, ma percepito di continuo. Le pagine desktop larghe ora <strong>si adattano al riquadro finché non scegli tu lo zoom</strong>, i deck più vecchi rispondono subito ai tasti di navigazione e l'ultimo file HTML principale compare appena l'attività finisce, senza aggiornare a mano. Quando un asset viene bloccato per sicurezza, l'anteprima indica il file di progetto coinvolto senza esporre un percorso di sistema sensibile.</p>
      <p>Anche la generazione di immagini è più solida: <strong>Nano Banana e la generazione personalizzata riprovano una volta quando un provider è momentaneamente occupato</strong>, e le modifiche per riferimento di GPT Image funzionano su più servizi compatibili. Un intoppo diventa una breve attesa invece di un giro creativo perso.</p>

      <h2>Cos'altro arriva in 0.16.0</h2>
      <ul>
        <li><strong>Le gallerie partono da ciò che le persone usano davvero</strong> — le gallerie di slide, immagini, video e le altre non-prototipo mettono in cima i template con uso reale, mentre le voci vuote e le schede senza anteprima smettono di affollare la testa dell'elenco. Prototype conserva la sua vetrina editoriale e ogni categoria mantiene il catalogo completo.</li>
        <li><strong>I design system si importano in modo più fedele</strong> — le importazioni da repository scelgono il flusso giusto, i pacchetti di token suddivisi mantengono i valori di layout e i formati YAML più comuni per liste e valori multilinea preservano i metadati scritti dagli autori.</li>
        <li><strong>Confini di sicurezza locali più solidi</strong> — i progetti importati tengono private le credenziali nascoste, la rimozione di un plugin resta all'interno dei file di quel plugin, i contenuti del marketplace e dei siti salvati sono trattati con più cautela, e ogni conversazione resta agganciata al progetto corretto.</li>
        <li><strong>Anteprima prima di pubblicare</strong> — il deploy su Cloudflare Pages espone Preview e Production come target espliciti sia nell'interfaccia sia in <code>od deploy --target … --json</code>, così un'anteprima restituisce il proprio URL invece di sostituire il tuo hostname di produzione.</li>
        <li><strong>Kiro entra nel selettore di configurazione MCP</strong> — copia lo snippet corretto del server condiviso dalle Impostazioni invece di tradurre a mano il formato di un altro client.</li>
        <li><strong>Correzioni silenziose che vale la pena citare</strong> — i follow-up MCP ricevono il messaggio più recente, le cronologie ACP non generano più righe vuote dopo un refresh, e i dispositivi Windows con processori più vecchi possono di nuovo eseguire OpenCode tramite il normale percorso di aggiornamento.</li>
      </ul>

      <h2>Già corretto: 0.16.1</h2>
      <p>Il giorno dopo, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a> ha portato una correzione mirata per l'anteprima di design: <strong>lo stato dell'esecuzione non copre più il lavoro generato.</strong> Gli stati di build, completamento e recupero della consegna restano in Chat — che rimane il posto dove seguire l'avanzamento o ritentare una consegna fallita — e la canvas torna tua. Se scarichi oggi, prendi 0.16.1.</p>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Parti da qui</th></tr>
        </thead>
        <tbody>
          <tr><td>nuovo su Open Design</td><td>Scarica l'app desktop, avvia un progetto e scegli una direzione visiva pensata per il formato su cui stai lavorando</td></tr>
          <tr><td>uno che lancia attività lunghe</td><td>Spingi più in là un'esecuzione lunga: toccare il tetto del contesto ora prosegue con il contesto utile più recente, file intatti</td></tr>
          <tr><td>fermo a una build vecchia</td><td>Lancia «Verifica aggiornamenti…»: lo stato ora è esplicito e l'esportazione PPTX funziona dopo l'upgrade</td></tr>
          <tr><td>uno che usa le proprie chiavi</td><td>Ritesta i tuoi provider BYOK: gli errori emergono in configurazione e le bozze non travolgono una config funzionante</td></tr>
          <tr><td>uno che vive nell'anteprima</td><td>Riapri una pagina desktop larga o un deck datato: la cornice si adatta e i tasti rispondono</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare ora</h2>
      <p>Una release di cui fidarsi è soprattutto una release che smette di perdere pezzi. 0.16.0 spende lì il suo budget: un aggiornamento che atterra, un'attività lunga che conserva i file, uno stile che corrisponde al formato, un'anteprima che si toglie di mezzo. Scarica l'app desktop, rilancia l'attività più lunga che hai e guardala arrivare intera.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Scarica Open Design</a>.</p>
      <p>92 PR in cinque giorni, da 20 persone che hanno chiuso ciascuna un altro varco tra un risultato finito e uno consegnato. L'affidabilità è un lavoro poco appariscente, ed è il lavoro che rende credibile tutto il resto. Vi vediamo. 🚀</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — sguardo più nitido, flow più lungo</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — costa meno, consegna prima</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — la macchina del tempo dell'ispirazione</a></li>
      </ul>
  tr:
    title: 'Open Design 0.16.0: güvenilir teslimat'
    summary: 'open-design-v0.16.0 — beş günde 20 katkıcıdan 92 PR. Kod adı “Reliable Delivery”. Görsel yön artık gerçekten ürettiğiniz şeyi izliyor, otomatik güncellemeler gerçekten devreye giriyor, uzun görevler sonucu ve yanındaki dosyaları koruyor, önizlemeler çerçeveyle boğuşmayı bırakıyor. Ayrıca uygulama içinde bir mesaj merkezi ve tuvalin üzerindeki son şeyi kaldıran 0.16.1 yaması.'
    category: 'Ürün'
    bodyHtml: |
      <p><code>open-design-v0.16.0</code>, 22 Temmuz 2026'da yayımlandı. <strong>Beş günde 20 katkıcıdan 92 PR.</strong> Kod adı “Reliable Delivery”. Önceki sürüm bir koşunun maliyetini hedeflemişti. Bu sürüm, biten bir sonuç ile onun gerçekten size ulaştığı an arasında olan biteni hedefliyor: yarım uygulanan güncelleme, dosyalarını yitiren uzun görev, boğuşmak zorunda kaldığınız önizleme, bir slaydı düşüren dışa aktarma.</p>
      <p>Tüm değişiklik listesi <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0">GitHub'daki sürüm notlarında</a>. Burada kısa hâli var: altta ne değişti, bugün bununla ne yapabilirsiniz ve nereden başlamalı.</p>

      <h2>Görsel yön, gerçekten ürettiğiniz şeyi izliyor</h2>
      <p>Stil uzun süre yalnızca sunumlar ve prototipler için verilebilen bir karardı. Geri kalan her şey — bir belge, bir afiş, bir video, bir Web Clone, bir tel kafes, bir mobil ekran, bir Hyperframe — modelin canı ne isterse ondan başlıyordu.</p>
      <p>0.16.0'da <strong>her biçim kendi görsel yönünü kazanıyor</strong> ve önizlemeler o biçimin gerçekten göründüğü şekilde işleniyor. Dört hızlı seçenek çalıştığınız yerde duruyor, tam stil kitaplığı ise bir tık ötede. Bir sunum temasını kafanızda afişe çevirmek yerine, önünüzdeki şeye uygun görünümü doğrudan seçiyorsunuz.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="Belge, afiş, video, mobil ekran gibi farklı çıktı biçimlerinin taslağı; her biri sakin adaçayı yeşili bir arayüzde doğru oranlı kendi stil önizlemesine dönüşüyor, sıcak editoryal illüstrasyon" />
        <figcaption>Belgeler, afişler, videolar, Web Clone'lar, tel kafesler, mobil işler ve Hyperframe'ler kendi biçimine uygun önizlemeler alıyor — dört seçenek elinizin altında, kitaplığın tamamı bir tık ötede.</figcaption>
      </figure>

      <h2>Gerçekten devreye giren güncellemeler</h2>
      <p>Yarım uygulanan bir güncelleme, hiç güncellememekten kötüdür: uygulama yeni sürümü bildirirken bir özellik sessizce eskisi üzerinde çalışır. 0.16.0 yükseltmeyi yere indiriyor. <strong>Güncellemeden sonra yeni sürüm daha güvenilir biçimde etkinleşiyor ve eksik güncellemenin bozduğu özellikler — PPTX dışa aktarma dahil — yeniden çalışıyor.</strong></p>
      <p>macOS'ta “Güncellemeleri Denetle…” artık hangi durumda olduğunuzu açıkça söylüyor: güncel, indiriliyor, yeniden başlatmaya hazır, süren işin bitmesini bekliyor ya da elle indirme gerekiyor. Windows'ta da güncelleme güvenilirliği artıyor. Bu alandaki uzun soluklu çalışması için <a href="https://github.com/PerishCode">@PerishCode</a>'a teşekkürler.</p>

      <h2>Uzun görevler yanıtını — ve dosyalarını — koruyor</h2>
      <p>En değerli iş uzun koşuların içinde yaşar; en çok da orada kaybolurdu. 0.16.0'da konuşma sınırına yaklaşan bir görev <strong>ani bir hatayla düşmek yerine en güncel yararlı bağlamla devam ediyor</strong>, koşunun erken aşamalarında üretilen dosyalar da <strong>sonuca bağlı kalıyor</strong>, sıkıştırmayla birlikte yok olmuyor.</p>
      <p>Hata yolları da dürüstleşti: kurtarılan yardımcı ajanlar başarılı işi bildirilen bir başarısızlığa çevirmiyor, kesintiye uğrayan görevler yeniden başlatmadan sonra doğru durumu gösteriyor, iptal edilen iş iptal kalıyor ve gerçekten kurtarılamayan hatalar sonsuz bir bekleme çemberi yerine üzerine hareket edebileceğiniz bir açıklamayla duruyor.</p>
      <figure>
        <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="Kopmayan uzun bir iplik, üretilmiş dosya kartlarından oluşan bir yığını daralan bir geçitten taşıyıp sakin adaçayı yeşili bir arayüze eksiksiz ulaştırıyor, sıcak editoryal illüstrasyon" />
        <figcaption>Bağlam sınırına yaklaşmak koşuyu artık bitirmiyor — görev en güncel yararlı bağlamla sürüyor ve halihazırda üretilmiş dosyalar da onunla birlikte varıyor.</figcaption>
      </figure>

      <h2>Ürün haberleri uygulamanın içinde bir yer edindi</h2>
      <p>0.16.0'da yeni: <strong>Ana sayfa ve proje başlıklarındaki zilin arkasında bir mesaj merkezi</strong> — okunmamış sayaçları, filtreler, tümünü okundu işaretle ve anlatılan şeye doğrudan giden bağlantılar. Okunma durumu anonim kullanımda cihazda kalıyor, oturum açtığınızda hesabınızı izliyor; tarihler dilinize göre görünüyor ve kapatma düğmesi her zaman beklediğiniz yerde. Teşekkürler <a href="https://github.com/nettee">@nettee</a>.</p>

      <h2>BYOK, sizi kesintiye uğratmadan önce kurulum sorunlarını yakalıyor</h2>
      <p>Kendi anahtarınızı getirmek, bir görev üç dakika koştuktan sonra değil, kurulum sırasında hata vermeli. <strong>Tamamlanmamış düzenlemeler artık çalışan bir yapılandırmanın üzerine yazmak yerine kurtarılabilir taslak olarak duruyor</strong>; yarım kalmış bir değişiklik güvendiğiniz bir sağlayıcıyı deviremiyor.</p>
      <p>Bağlantı testleri gerçek görevlere daha çok benziyor, sağlayıcının asıl hatasını gösteriyor ve her sağlayıcının kendi model sırasını koruyor — istediğiniz modeli gömen alfabetik liste tarihe karıştı. Uyumlu MiniMax, DeepSeek ve MiMo adresleri daha tutarlı işleniyor, eskimiş Moonshot ve DeepSeek varsayılanları güncel modelleri gösteriyor, Ayarlar ile ilk kurulum nihayet aynı seçenekleri sunuyor. Bellek de kayıtlı uyumlu bir MiniMax anahtarını kullanabiliyor ve bir sağlayıcı yalnızca görsel veya ses destekliyorsa bunu açıkça söylüyor.</p>

      <h2>Önizlemeler çerçeveyle boğuşmayı bırakıyor</h2>
      <p>Küçük bir sürtünme ama sürekli hissediliyor. Geniş masaüstü sayfaları artık <strong>siz kendi yakınlaştırmanızı seçene kadar bölmeye sığıyor</strong>, eski sunumlar gezinme tuşlarına anında yanıt veriyor ve en güncel ana HTML dosyası elle yenilemeye gerek kalmadan görev biter bitmez beliriyor. Bir varlık güvenlik nedeniyle engellendiğinde önizleme, hassas bir sistem yolunu açığa çıkarmadan ilgili proje dosyasını adlandırıyor.</p>
      <p>Görsel üretimi de sağlamlaştı: <strong>Nano Banana ve özel görsel üretimi, bir sağlayıcı kısa süreliğine meşgulse bir kez yeniden deniyor</strong>, GPT Image referans düzenlemeleri daha fazla uyumlu serviste çalışıyor. Bir kesinti, kaybedilmiş bir yaratıcı tur değil, kısa bir bekleme oluyor.</p>

      <h2>0.16.0'a giren diğer şeyler</h2>
      <ul>
        <li><strong>Galeriler gerçekten kullanılan şeylerle başlıyor</strong> — slayt, görsel, video ve prototip dışı diğer galeriler gerçek kullanımı olan şablonları öne çıkarıyor; boş kayıtlar ve önizlemesiz kartlar üst sıraları tıkamıyor. Prototip kendi editoryal vitrinini koruyor, her kategori de tam kataloğunu.</li>
        <li><strong>Tasarım sistemleri daha sadık içe aktarılıyor</strong> — depo içe aktarmaları doğru akışı seçiyor, bölünmüş token paketleri yerleşim değerlerini koruyor, yaygın YAML liste ve çok satırlı biçimleri yazarlarının girdiği meta verileri saklıyor.</li>
        <li><strong>Daha güçlü yerel güvenlik sınırları</strong> — içe aktarılan projeler gizli kimlik bilgilerini saklı tutuyor, bir eklentiyi kaldırmak o eklentinin dosyalarıyla sınırlı kalıyor, pazar yeri ve kayıtlı site içerikleri daha dikkatli işleniyor, her konuşma doğru projeye bağlı kalıyor.</li>
        <li><strong>Yayınlamadan önce önizleyin</strong> — Cloudflare Pages dağıtımı, hem arayüzde hem <code>od deploy --target … --json</code> içinde Preview ve Production'ı açık hedefler olarak sunuyor; önizleme canlı alan adınızın yerine geçmek yerine kendi URL'sini döndürüyor.</li>
        <li><strong>Kiro, MCP kurulum seçicisine katıldı</strong> — başka bir istemcinin biçimini elle çevirmek yerine doğru paylaşılan sunucu parçacığını Ayarlar'dan kopyalayın.</li>
        <li><strong>Adı anılmayı hak eden sessiz düzeltmeler</strong> — MCP takip istekleri en son mesajı alıyor, ACP geçmişleri yenilemeden sonra boş satır üretmiyor ve eski işlemcili Windows cihazlar OpenCode'u normal güncelleme yolundan yeniden çalıştırabiliyor.</li>
      </ul>

      <h2>Zaten yamalandı: 0.16.1</h2>
      <p>Ertesi gün <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1">0.16.1</a>, tasarım önizlemesi için odaklı bir düzeltme getirdi: <strong>çalışma durumu artık ürettiğiniz işi örtmüyor.</strong> Derleme, tamamlanma ve teslimat kurtarma durumları Sohbet'te kalıyor — ilerlemeyi izlediğiniz ya da başarısız bir teslimatı yeniden denediğiniz yer hâlâ orası — tuval ise tamamen sizin oluyor. Bugün indirecekseniz 0.16.1'i alın.</p>

      <h2>Bugün bununla ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'a yeniyseniz</td><td>Masaüstü uygulamasını indirin, bir proje başlatın ve çalıştığınız biçime uygun bir görsel yön seçin</td></tr>
          <tr><td>Uzun görevler koşuyorsanız</td><td>Uzun bir koşuyu daha ileri götürün — bağlam tavanına çarpmak artık en güncel yararlı bağlamla, dosyalar yerinde devam ediyor</td></tr>
          <tr><td>Eski bir yapıdaysanız</td><td>“Güncellemeleri Denetle…”yi çalıştırın — durum artık açık ve yükseltmeden sonra PPTX dışa aktarma çalışıyor</td></tr>
          <tr><td>Kendi anahtarlarınızı kullanıyorsanız</td><td>BYOK sağlayıcılarınızı yeniden test edin: hatalar kurulumda ortaya çıkıyor, taslaklar çalışan yapılandırmayı ezmiyor</td></tr>
          <tr><td>Önizlemede yaşıyorsanız</td><td>Geniş bir masaüstü sayfasını ya da eski bir sunumu yeniden açın — çerçeve oturuyor, tuşlar yanıt veriyor</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne var</h2>
      <p>Güvenebileceğiniz bir sürüm, çoğunlukla bir şeyleri kaybetmeyi bırakmış bir sürümdür. 0.16.0 bütçesini tam oraya harcıyor: yere inen bir güncelleme, dosyalarını koruyan uzun bir görev, biçimle örtüşen bir stil, yoldan çekilen bir önizleme. Masaüstü uygulamasını indirin, elinizdeki en uzun görevi yeniden çalıştırın ve eksiksiz vardığını görün.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_16_0&amp;utm_content=official">Open Design'ı indir</a>.</p>
      <p>Beş günde 92 PR; biten bir sonuçla teslim edilmiş bir sonuç arasındaki boşluğu birer birer kapatan 20 kişiden. Güvenilirlik gösterişsiz bir iştir ve geri kalan her şeyi inandırıcı kılan iştir. Sizi görüyoruz. 🚀</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 — daha keskin görüş, daha uzun akış</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 — daha az maliyet, daha hızlı teslim</a></li>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 — ilham zaman makinesi</a></li>
      </ul>
---

`open-design-v0.16.0`, published on July 22, 2026. **92 PRs from 20 contributors in five days.** Codename "Reliable Delivery." The last release went after what a run costs you. This one goes after what happens between a finished result and the moment it actually reaches you: the update that half-applied, the long task that lost its files, the preview you had to fight, the export that dropped a slide.

Want the full changelog? It lives in the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.0). This is the short version: what changed underneath, what you can do with it today, and where to start.

## Visual direction follows what you're actually making

Style used to be a decision you could only make for decks and prototypes. Everything else — a document, a poster, a video, a Web Clone, a wireframe, a mobile screen, a Hyperframe — started from whatever the model felt like.

In 0.16.0, **every format gets its own visual direction**, with previews rendered the way that format is actually seen. Four quick choices sit inline where you're working, and the full style library is one click away. You pick a look for the thing in front of you instead of translating a deck theme into a poster in your head.

<figure>
  <img src="/blog/open-design-0-16-0-reliable-delivery-style.webp" alt="A sketched grid of different output formats — document, poster, video, mobile screen — each turning into its own correctly-shaped style preview inside a calm sage-green interface, in a warm editorial illustration" />
  <figcaption>Documents, posters, videos, Web Clones, wireframes, mobile work and Hyperframes each get previews suited to their format — four choices inline, the full library one click away.</figcaption>
</figure>

## Updates that actually take effect

An update that half-applies is worse than no update: the app reports a new version while a feature quietly runs on the old one. 0.16.0 makes the upgrade land. **After updating, the new version takes effect more reliably, and features broken by an incomplete update — PPTX export among them — work again.**

On macOS, "Check for Updates…" now says which state you're in: current, downloading, ready to restart, waiting for active work to finish, or in need of a manual download. Windows update reliability improves too. Thanks to [@PerishCode](https://github.com/PerishCode) for a long run of work here.

## Long tasks keep their answer — and their files

Extended runs are where the most valuable work lives, and where the most work used to disappear. In 0.16.0, a task approaching a conversation limit **continues with the newest useful context instead of failing abruptly**, and files generated earlier in the run **stay attached to the result** rather than vanishing with the compaction.

The failure paths got more honest as well: recovered helper agents no longer turn successful work into a reported failure, interrupted tasks show an accurate state after a restart, canceled work stays canceled, and errors that genuinely can't be recovered stop with an explanation you can act on instead of a spinner.

<figure>
  <img src="/blog/open-design-0-16-0-reliable-delivery-flow.webp" alt="A long unbroken thread carrying a stack of generated file cards past a narrowing gate and arriving intact in a calm sage-green interface, in a warm editorial illustration" />
  <figcaption>Approaching a context limit no longer ends the run — the task continues with the newest useful context, and the files it already produced arrive with it.</figcaption>
</figure>

## Product news has a home inside the app

New in 0.16.0: **a message center behind a bell in the Home and project headers** — unread counts, filters, mark-all-read, and links straight to the thing being announced. Read state stays on the device when you're anonymous and follows your account when you're signed in, dates render in your locale, and the close button is always where you expect it. Thanks [@nettee](https://github.com/nettee).

## BYOK catches setup problems before they interrupt you

Bringing your own key should fail at setup time, not three minutes into a task. **Incomplete edits now stay as recoverable drafts instead of overwriting a working configuration**, so a half-finished change can't take down a provider you rely on.

Connection tests behave more like real tasks, surface the provider's actual error, and preserve each provider's own model ordering — no more alphabetized list that buries the model you wanted. Compatible MiniMax, DeepSeek and MiMo addresses are handled more consistently, outdated Moonshot and DeepSeek defaults now point at current models, and Settings and onboarding finally show the same choices. Memory can also use a compatible MiniMax key you already saved, and says plainly when a provider only supports image or audio.

## Previews stop fighting the frame

Small friction, felt constantly. Wide desktop pages now **fit the pane until you choose your own zoom**, older decks respond to navigation keys immediately, and the latest main HTML file appears as soon as a task finishes instead of after a manual refresh. When an asset is blocked for safety, the preview names the project file involved without exposing a sensitive system path.

Image generation got steadier too: **Nano Banana and custom image generation retry once when a provider is briefly busy**, and GPT Image reference edits work across more compatible services. A blip becomes a short wait instead of a lost creative turn.

## What else lands in 0.16.0

- **Galleries lead with what people actually use** — Slides, image, video and other non-prototype galleries surface templates with real usage, while blank entries and preview-less cards stop crowding the top. Prototype keeps its editorial showcase, and every category keeps its full catalog.
- **Design systems import more faithfully** — repository imports pick the right flow, split token packages keep their layout values, and common YAML list and multiline formats preserve the metadata their authors wrote.
- **Stronger local safety boundaries** — imported projects keep hidden credentials private, removing a plugin stays inside that plugin's files, marketplace and saved-site content are handled more carefully, and each conversation stays attached to the correct project.
- **Preview before you publish** — Cloudflare Pages deployment now exposes Preview and Production as explicit targets in the interface and in `od deploy --target … --json`, so a preview returns its own URL instead of replacing your live hostname.
- **Kiro joins the MCP setup picker** — copy the correct shared-server snippet from Settings instead of hand-translating another client's format.
- **Quieter fixes worth naming** — MCP follow-ups receive the latest message, ACP histories stop growing blank rows after a refresh, and Windows devices with older processors can run OpenCode again through the normal update path.

## Already patched: 0.16.1

The next day, [0.16.1](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.16.1) shipped one focused fix for the design preview: **run status no longer covers your generated work.** Building, completion, and delivery-recovery status stay in Chat — which is still where you follow progress or retry a failed delivery — and the canvas stays yours. If you're downloading today, take 0.16.1.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app, start a project, and pick a visual direction made for the format you're working in |
| Running long tasks | Push a long run further — hitting the context ceiling now continues with the newest useful context, files intact |
| On an older build | Run "Check for Updates…" — the update state is now explicit, and PPTX export works after upgrading |
| Using your own keys | Re-test your BYOK providers: errors surface at setup, drafts no longer clobber a working config |
| Living in the preview | Reopen a wide desktop page or an older deck — the frame fits, and the keys respond |

## What to do next

A release you can trust is mostly a release that stops losing things. 0.16.0 spends its budget there — an update that lands, a long task that keeps its files, a style that matches the format, a preview that gets out of the way. Download the desktop app, rerun the longest task you've got, and see it arrive whole.

[Download Open Design](https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_16_0&utm_content=official).

92 PRs in five days, from 20 people who each closed one more gap between a finished result and a delivered one. Reliability is unglamorous work, and it is the work that makes everything else believable. We see you. 🚀

## Related reading

- [Open Design 0.15.1: sharper vision, longer flow](/blog/open-design-0-15-1/)
- [Open Design 0.15.0: cost less, ship faster](/blog/open-design-0-15-0-cost-less-ship-faster/)
- [Open Design 0.14.0: the inspiration time machine](/blog/open-design-0-14-0-inspiration-time-machine/)
