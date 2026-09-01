---
title: "OpenDesign 0.18.0: design team workspace, now in Codex"
date: 2026-08-05
category: "Product"
readingTime: 7
summary: "open-design-v0.18.0 — 115 PRs from 22 contributors in two days. Codename \"Design Team Workspace. Now in Codex.\" OpenDesign gives design teams a shared home for projects, comments, design systems, plugins, skills, and workspace billing — then brings that creative engine directly into Codex."
socialImage: "/blog/open-design-0-18-0-design-team-workspace-codex-cover-v2.webp"
ctaKind: download-app
i18n:
  zh:
    title: 'OpenDesign 0.18.0：设计团队工作区，现已进入 Codex'
    summary: 'open-design-v0.18.0 —— 两天内 22 位贡献者提交了 115 个 PR。代号「Design Team Workspace. Now in Codex.」。OpenDesign 为设计团队提供了一个共享空间，用来管理项目、评论、设计系统、插件、技能和工作区账单——并将同一套创作引擎直接带入 Codex。'
    category: '产品'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>，于 2026 年 8 月 5 日发布。<strong>两天内 22 位贡献者提交了 115 个 PR。</strong>代号「Design Team Workspace. Now in Codex.」。OpenDesign 曾经是一个让个人尽情创作的强大空间。这个版本为整个设计团队提供了一个共同的家——并把同一套创作引擎放进 Codex。</p>
      <p>想看所有变更？请阅读 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">GitHub 上的完整发布说明</a>。本文讲的是产品故事：新工作区改变了什么、Codex 如何融入，以及今天可以从哪里开始。</p>

      <h2>你的设计团队有了一个共享空间</h2>
      <p>过去，协作往往从离开 OpenDesign 开始：导出文件，把截图贴进聊天，询问哪版文案才是最新的，然后为下一个人重复同样的设置。到了 0.18.0，<strong>你的个人工作区旁边有了 Team workspace</strong>。创建一个、切换进去，再通过感知席位的流程邀请同事并分配角色。所有人都通过同一个 OpenDesign Cloud 账号体系登录，并来到同一个地方。</p>
      <p>边界依然清晰。个人工作仍属于个人；团队项目、共享资源和支出属于当前启用的 Team workspace。方案铭牌会显示你正在使用哪个工作区，因此共享工作时不必再猜究竟涉及哪个账号或余额。</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="近白色编辑背景上，一个共享设计工作区以中央项目画布为核心，周围分布着多个协作者光标和评论标记，整体被精准的绿色选区框包围" />
        <figcaption>Team workspace 把项目、成员、评论和当前方案放在同一个共享空间里——就在你的个人工作旁边。</figcaption>
      </figure>

      <h2>OpenDesign 现在可以在 Codex 中使用</h2>
      <p>0.17.0 打开了入口；0.18.0 则确保没有人会错过。<strong>Codex Desktop 和 CLI 可以把 OpenDesign 作为一套完整的创作引擎来调用。</strong>确认视觉简报，选择 OpenDesign Cloud 或受支持的本地运行时，就能获得真正的 Preview 或 Studio 成果，无需手动再搭一套技术栈。</p>
      <p>当 Codex 需要时，已签名的 OpenDesign 运行时会以无头模式启动，因此不必再盯着一个额外的应用窗口。外部 MCP 主机也不会因为本地服务重启后换了端口就失去 OpenDesign：连接会自动找到归途，<code>@open-design</code> 无需重新设置便能继续工作。</p>
      <p>如果你从 0.16.x 直接升级到这个版本，<a href="/blog/open-design-0-17-0-open-design-for-codex/">0.17.0 版本</a>的内容也包含在这次升级中——OpenDesign 已经成为 Codex 可以直接触达的设计层。</p>

      <h2>共享项目会自行保持最新</h2>
      <p>把项目移入 Team workspace 后，每位成员都会获得一份实时只读镜像。<strong>所有者工作时内容会自动拉取，在线头像会显示谁正在查看，传输进度始终可见，评论也能双向流动——包括来自只读模式查看者的评论。</strong>不需要任何人重新发送项目，「这是最新版吗？」也不再是会议里的固定话题。</p>
      <p>这个模型刻意保持简单：所有者保留编辑权限，其他人则可以跟随当前状态并在上下文中进行审阅。这样一来，项目不必等到「完成」之后才值得共享，也不会把每次评审都变成一场合并难题。</p>

      <h2>共享整套工具，而不只是产出</h2>
      <p>共享文件只完成了一半工作流。另一半，是产生它的系统与习惯。在 0.18.0 中，<strong>设计系统、插件和技能都可以共享到 Team workspace</strong>，因此团队成员无需再开一次设置说明会，就能接手同一套品牌工具包和可重复使用的工作流。</p>
      <p>账单也遵循同样的边界。余额、充值和运行费用都归属当前启用的工作区：团队工作由团队付费，个人探索仍然属于个人。共享的创作工具包与为其买单的账号，终于可以一起流转。</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="一个模块化设计系统卡片、插件磁贴和技能卡片接入同一个共享团队工作区，组合后的工具包被精准的绿色选区框包围，置于近白色编辑背景上" />
        <figcaption>共享工作背后的设计系统、插件和技能——而不只是最终文件。</figcaption>
      </figure>

      <h2>一个真正有工作区感的工作区</h2>
      <p>新的协作模型与重新设计的首页一同到来：全新的主视觉、侧栏、标签页、模板与插件详情界面，外加消息中心、由真实发布数据驱动的「最新动态」面板，以及更安静的更新提醒。目前应用以浅色模式为先，因此在这些新界面逐步形成统一观感期间，主题设置暂时退出。</p>
      <p>细节承载着这套模型。工作区切换清晰可见，共享工作与个人工作彼此分明，当前方案会一路跟随你。产品动态就住在产品里，不再依赖某个人转发链接。</p>

      <h2>Agent 能把更多已经开始的工作真正做完</h2>
      <p>如果长时间运行的工作仍在终点线前停下，团队层就没有意义。过去在工具调用后立刻卡住的会话，现在会自行恢复。Kiro 运行能够干净地完成当前轮次；当 AMR 运行确实停滞时，应用也能解释原因。</p>
      <p>必答问题也不再像一扇锁死的门。<strong>如果 Agent 问了一个你无法或不想回答的问题，可以跳过它并继续。</strong>Agent 会使用已有上下文工作，而不是让整个运行被一个问题绑架。</p>

      <h2>0.18.0 还带来了什么</h2>
      <ul>
        <li><strong>Clone Audit 加入社区插件库</strong>——检查克隆网站的视觉还原度、残留追踪代码、源品牌或语言残留、占位内容和高风险外部依赖，然后给出有证据支撑的部署结论，并附上文件与行号凭据。感谢 <a href="https://github.com/bestthanapon">@bestthanapon</a>。</li>
        <li><strong>插件目录有了正式入口</strong>——独立落地页会在用户安装应用之前介绍 OpenDesign 插件。</li>
        <li><strong>Codex Agent 页面回应了真实的搜索意图</strong>——为寻找 Codex UI 及其周边设计工作流的人提供更清晰的定位。</li>
        <li><strong>应用内浏览器会记住你的视口</strong>——设备尺寸只需选择一次，后续会话会继续沿用。感谢 <a href="https://github.com/HD-L">@HD-L</a>。</li>
        <li><strong>已删除的项目不再纠缠标签页</strong>——移除项目时，也会一并清除其保存的标签页布局。感谢 <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>。</li>
        <li><strong>Azure 部署名称又可以编辑了</strong>——BYOK 用户可以直接修正部署名称，不必再与表单较劲。感谢 <a href="https://github.com/mturac">@mturac</a>。</li>
        <li><strong>账单失败会礼貌退避</strong>——当 Cloud 账单端点不可访问时，应用会按退避曲线重试，而不是持续冲击一条已经失败的连接。</li>
      </ul>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>设计负责人</td><td>创建一个 Team workspace，邀请一位同事，再把一个进行中的项目移进去，让团队能在上下文中审阅当前状态</td></tr>
          <tr><td>已经在使用 Codex</td><td>安装或更新 OpenDesign 插件，然后让 Codex 生成一份视觉简报，并在 Preview 或 Studio 中打开结果</td></tr>
          <tr><td>正在维护品牌系统</td><td>共享团队应当复用的设计系统、插件和技能，而不是分别发送设置说明</td></tr>
          <tr><td>正在审阅工作</td><td>打开共享镜像，查看在线状态并留下评论，无需要求所有者再导出一份快照</td></tr>
          <tr><td>正在管理团队支出</td><td>运行前切换到 Team workspace，并确认方案铭牌，让费用计入正确的余额</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>设计团队不应该靠导出文件、聊天线程和重复的设置说明会来拼出协作。0.18.0 给工作一个共享空间，给这个空间一套共享工具，也让 Codex 能够直接触达同一套创作引擎。创建一个 Team workspace，把一个真实项目移进去，再邀请那个原本会来问你要最新截图的人。</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">下载 OpenDesign</a>。</p>
      <p>两天内 115 个 PR，来自 22 位贡献者。他们把 OpenDesign 从个人工作区变成团队可以共同身处的空间——也让 Codex 能够调用这个空间。协作不是一个分享按钮，而是工作、上下文和工具一同抵达。我们看到你们了。🚀</p>

      <h2>相关阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">OpenDesign 0.17.0：为 Codex 打造的设计工作区</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0：可靠交付</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1：视野更清晰，流程更持久</a></li>
      </ul>
  ja:
    title: 'OpenDesign 0.18.0 — デザインチームのワークスペースが Codex に'
    summary: 'open-design-v0.18.0 — 2 日間で 22 人のコントリビューターから 115 の PR。コードネームは「Design Team Workspace. Now in Codex.」。OpenDesign は、プロジェクト、コメント、デザインシステム、プラグイン、スキル、ワークスペース請求をまとめる共有の場をデザインチームに提供し、そのクリエイティブエンジンを直接 Codex に届けます。'
    category: 'プロダクト'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>、2026 年 8 月 5 日公開。<strong>2 日間で 22 人のコントリビューターから 115 の PR。</strong>コードネームは「Design Team Workspace. Now in Codex.」。OpenDesign はこれまで、一人がものを作るための強力な場所でした。このリリースはデザインチーム全体に居場所をつくり、同じクリエイティブエンジンを Codex の中に置きます。</p>
      <p>すべての変更を確認するなら、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">GitHub の完全なリリースノート</a>へ。ここでお伝えするのはプロダクトの物語です。新しいワークスペースが何を変え、Codex がどう関わり、今日どこから始められるのか。</p>

      <h2>デザインチームに共有の居場所を</h2>
      <p>これまでのコラボレーションは、OpenDesign を離れるところから始まっていました。ファイルを書き出し、スクリーンショットをチャットに貼り、どのコピーが最新かを尋ね、次の人のために同じセットアップを繰り返す。0.18.0 では、<strong>個人ワークスペースの隣に Team workspace が並びます</strong>。作成して切り替え、席数を踏まえたフローで役割を付けて同僚を招待できます。全員が同じ OpenDesign Cloud のアカウント基盤からサインインし、同じ場所にたどり着きます。</p>
      <p>境界は明確なままです。個人の作業は個人のもの。チームのプロジェクト、共有リソース、支出は、現在の Team workspace に属します。プランのネームプレートが使用中のワークスペースを示すため、共有するときにどのアカウントや残高が関係するのか迷うことはありません。</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="オフホワイトのエディトリアルな背景に、中央のプロジェクトキャンバス、複数の共同編集カーソルとコメントピンを備え、精密な緑の選択枠に収められた共有デザインワークスペース" />
        <figcaption>Team workspace は、プロジェクト、メンバー、コメント、現在のプランを一つの共有空間に置きます。個人の作業のすぐ隣に。</figcaption>
      </figure>

      <h2>OpenDesign が Codex の中で動く</h2>
      <p>0.17.0 が扉を開き、0.18.0 は誰もその扉を見落とさないようにします。<strong>Codex Desktop と CLI は、OpenDesign を完全なクリエイティブエンジンとして呼び出せます。</strong>ビジュアルブリーフを確認し、OpenDesign Cloud または対応するローカルランタイムを選べば、別のスタックを手作業で組むことなく、本物の Preview または Studio の成果を受け取れます。</p>
      <p>署名済みの OpenDesign ランタイムは Codex が必要とするときにヘッドレスで起動するため、もう一つのアプリウィンドウを見張る必要はありません。また、再起動後にローカルサービスが別のポートで戻っても、外部 MCP ホストが OpenDesign を見失うことはなくなりました。接続は自動で帰り道を見つけ、<code>@open-design</code> は一から設定し直さなくても動き続けます。</p>
      <p>0.16.x からこのリリースへ移るなら、<a href="/blog/open-design-0-17-0-open-design-for-codex/">0.17.0 リリース</a>もアップグレードに含まれます。OpenDesign は Codex が直接アクセスできるデザインレイヤーになりました。</p>

      <h2>共有プロジェクトは自動で最新の状態に</h2>
      <p>プロジェクトを Team workspace に移すと、全メンバーがリアルタイムの読み取り専用ミラーを得ます。<strong>オーナーの作業に合わせてコンテンツが自動でプルされ、プレゼンスアバターが閲覧中の人を示し、転送の進捗が見え続け、コメントは双方向に流れます。読み取り専用モードの閲覧者からのコメントも含まれます。</strong>プロジェクトを送り直す必要はなく、「これは最新版？」が会議の定番議題になることもありません。</p>
      <p>モデルは意図的にシンプルです。オーナーが編集権限を保ち、それ以外のメンバーは現在の状態を追いながら文脈の中でレビューできます。プロジェクトが「完成」する前から共有を役立てられ、レビューのたびにマージ問題を抱えることもありません。</p>

      <h2>成果だけでなく、ツールキットも共有する</h2>
      <p>ファイルの共有はワークフローの半分にすぎません。もう半分は、それを生み出したシステムと習慣です。0.18.0 では、<strong>デザインシステム、プラグイン、スキルを Team workspace に共有できます</strong>。チームメイトはセットアップの打ち合わせなしで、同じブランドキットと再利用可能なワークフローを手にできます。</p>
      <p>請求も同じ境界に従います。残高、チャージ、実行料金は現在のワークスペースに紐づきます。チームの仕事はチームに請求され、個人の試行は個人のままです。共有のクリエイティブツールキットと、その費用を負担するアカウントが、ついに一緒に動くようになりました。</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="モジュール式のデザインシステムカード、プラグインタイル、スキルカードが一つの共有チームワークスペースに接続され、まとまったツールキットがオフホワイトのエディトリアルな背景上で精密な緑の選択枠に収められている" />
        <figcaption>最終ファイルだけでなく、その仕事を支えるデザインシステム、プラグイン、スキルも共有できます。</figcaption>
      </figure>

      <h2>ワークスペースらしく感じられるワークスペース</h2>
      <p>新しいコラボレーションモデルとともに、ホームも再設計されました。新しいヒーロー、レール、タブ、テンプレートとプラグインの詳細画面に加え、メッセージセンター、実際のリリースデータを使う「新着情報」パネル、より控えめな更新リマインダーが加わります。現在のアプリはライト表示を優先しているため、新しい画面が一つの統一された外観に落ち着くまでテーマ設定は廃止されます。</p>
      <p>小さなディテールがこのモデルを支えます。ワークスペースの切り替えは見える場所にあり、共有の作業と個人の作業は区別され、現在のプランはどこへ行ってもついてきます。プロダクトニュースは誰かがリンクを転送するのを待たず、プロダクトの中にあります。</p>

      <h2>エージェントが始めた仕事を、もっと最後まで終えられる</h2>
      <p>長時間の作業が最後の一歩で止まるままなら、チームレイヤーに意味はありません。ツール呼び出しの直後に止まっていたセッションは、自力で再開するようになりました。Kiro の実行はハングせずにターンをきれいに完了し、AMR の実行が本当に停止したときは、アプリが理由を説明できます。</p>
      <p>必須の質問も、以前ほど固く閉ざされた扉ではありません。<strong>エージェントから答えられない、または答えたくない質問をされたら、その質問をスキップして先に進めます。</strong>一つの質問が実行全体を止めるのではなく、エージェントは手元のコンテキストで作業します。</p>

      <h2>0.18.0 に含まれるその他の変更</h2>
      <ul>
        <li><strong>Clone Audit がコミュニティプラグインライブラリに参加</strong> — クローンサイトのビジュアル忠実度、残ったトラッキング、元ブランドや言語の痕跡、プレースホルダー、危険な外部依存を調べ、ファイルと行番号の証拠を添えたデプロイ判定を返します。<a href="https://github.com/bestthanapon">@bestthanapon</a> に感謝。</li>
        <li><strong>プラグインカタログに入口ができた</strong> — 専用のランディングページが、アプリをインストールする前に OpenDesign プラグインを紹介します。</li>
        <li><strong>Codex エージェントページが本当の検索意図に答える</strong> — Codex UI と、その周りのデザインワークフローを探す人へ、より明確な位置づけを伝えます。</li>
        <li><strong>アプリ内ブラウザがビューポートを記憶</strong> — デバイスサイズを一度選べば、セッションをまたいでもそのままです。<a href="https://github.com/HD-L">@HD-L</a> に感謝。</li>
        <li><strong>削除したプロジェクトがタブに残らない</strong> — プロジェクトを削除すると、保存済みのタブレイアウトも消去されます。<a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a> に感謝。</li>
        <li><strong>Azure のデプロイ名が再び編集可能に</strong> — BYOK ユーザーはフォームと格闘せずにデプロイ名を修正できます。<a href="https://github.com/mturac">@mturac</a> に感謝。</li>
        <li><strong>請求の失敗時は穏やかにバックオフ</strong> — Cloud の請求エンドポイントに到達できないとき、失敗中の接続へリクエストを殺到させず、バックオフ曲線に沿って再試行します。</li>
      </ul>

      <h2>今日それで何ができるか</h2>
      <table>
        <thead>
          <tr><th>あなたが……</th><th>ここから</th></tr>
        </thead>
        <tbody>
          <tr><td>デザインリードなら</td><td>Team workspace を作り、同僚を一人招待し、進行中のプロジェクトを移して、チームが現在の状態を文脈の中でレビューできるようにする</td></tr>
          <tr><td>すでに Codex を使っているなら</td><td>OpenDesign プラグインをインストールまたは更新し、Codex にビジュアルブリーフを依頼して、結果を Preview または Studio で開く</td></tr>
          <tr><td>ブランドシステムを管理しているなら</td><td>セットアップ手順を別々に送らず、チームが再利用すべきデザインシステム、プラグイン、スキルを共有する</td></tr>
          <tr><td>作業をレビューするなら</td><td>共有ミラーを開き、プレゼンスを確認して、オーナーに別のスナップショットを書き出してもらわずにコメントを残す</td></tr>
          <tr><td>チームの支出を管理するなら</td><td>実行前に Team workspace へ切り替え、プランのネームプレートを確認して、正しい残高に料金が計上されるようにする</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>デザインチームが、書き出し、チャットスレッド、繰り返されるセットアップの打ち合わせを組み合わせてコラボレーションを作る必要はありません。0.18.0 は作業に共有の居場所を与え、そこに共有のツールキットを用意し、Codex から同じクリエイティブエンジンへ直接アクセスできるようにします。Team workspace を作り、実際のプロジェクトを一つ移し、そうでなければ最新のスクリーンショットを求めてくる人を招待してください。</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">OpenDesign をダウンロード</a>。</p>
      <p>2 日間で 115 の PR。OpenDesign を個人のワークスペースからチームが共に過ごせる場所へ変え、その場所を Codex から呼び出せるようにした 22 人から。コラボレーションは共有ボタンではありません。仕事、コンテキスト、ツールが一緒に届くことです。見ています。🚀</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">OpenDesign 0.17.0：Codex のための OpenDesign</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0 — 確実に届く</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1 — より鮮明な視界、より長いフロー</a></li>
      </ul>
  ko:
    title: 'OpenDesign 0.18.0: 디자인 팀 워크스페이스가 Codex에'
    summary: 'open-design-v0.18.0 — 이틀 동안 22명의 기여자가 115개의 PR을 보냈습니다. 코드명 “Design Team Workspace. Now in Codex.” OpenDesign은 프로젝트, 댓글, 디자인 시스템, 플러그인, 스킬, 워크스페이스 청구를 위한 공동의 공간을 디자인 팀에 제공하고, 그 크리에이티브 엔진을 Codex 안으로 직접 가져옵니다.'
    category: '제품'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, 2026년 8월 5일 공개. <strong>이틀 동안 22명의 기여자가 115개의 PR을 보냈습니다.</strong> 코드명 “Design Team Workspace. Now in Codex.” OpenDesign은 지금까지 한 사람이 무언가를 만드는 강력한 공간이었습니다. 이번 릴리스는 디자인 팀 전체에 하나의 집을 마련하고, 같은 크리에이티브 엔진을 Codex 안에 놓습니다.</p>
      <p>모든 변경 사항이 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">GitHub의 전체 릴리스 노트</a>를 읽어 보세요. 여기서는 제품의 이야기를 다룹니다. 새 워크스페이스가 무엇을 바꾸고, Codex가 어떻게 연결되며, 오늘 어디서 시작할 수 있는지.</p>

      <h2>디자인 팀에 공동의 공간이 생겼습니다</h2>
      <p>예전에는 OpenDesign을 떠나는 순간부터 협업이 시작됐습니다. 파일을 내보내고, 스크린샷을 채팅에 붙이고, 어떤 문구가 최신인지 물은 다음, 다음 사람을 위해 같은 설정을 반복했습니다. 0.18.0에서는 <strong>개인 워크스페이스 옆에 Team workspace가 자리합니다.</strong> 하나를 만들고 전환한 뒤, 좌석 수를 반영하는 흐름에서 역할과 함께 동료를 초대하세요. 모두 같은 OpenDesign Cloud 계정 체계로 로그인해 같은 장소에 도착합니다.</p>
      <p>경계는 계속 분명합니다. 개인 작업은 개인의 것으로 남습니다. 팀 프로젝트, 공유 리소스, 지출은 현재 활성화된 Team workspace에 속합니다. 플랜 명패가 사용 중인 워크스페이스를 보여 주므로, 작업을 공유하면서 어느 계정이나 잔액이 관련되는지 추측할 필요가 없습니다.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="미색의 편집 배경 위에 중앙 프로젝트 캔버스, 여러 협업자 커서와 댓글 핀이 놓이고 정밀한 초록색 선택 프레임으로 둘러싸인 공유 디자인 워크스페이스" />
        <figcaption>Team workspace는 프로젝트, 사람, 댓글, 현재 플랜을 하나의 공유 공간에 둡니다. 개인 작업 바로 옆에.</figcaption>
      </figure>

      <h2>이제 OpenDesign이 Codex 안에서 동작합니다</h2>
      <p>0.17.0이 문을 열었고, 0.18.0은 아무도 그 문을 놓치지 않게 합니다. <strong>Codex Desktop과 CLI는 OpenDesign을 완전한 크리에이티브 엔진으로 호출할 수 있습니다.</strong> 비주얼 브리프를 확인하고 OpenDesign Cloud 또는 지원되는 로컬 런타임을 선택하면, 두 번째 스택을 손으로 조립하지 않고 실제 Preview 또는 Studio 결과를 받을 수 있습니다.</p>
      <p>서명된 OpenDesign 런타임은 Codex가 필요로 할 때 헤드리스로 시작되므로, 별도의 앱 창을 지켜볼 필요가 없습니다. 다시 시작한 로컬 서비스가 다른 포트로 돌아와도 외부 MCP 호스트가 더는 OpenDesign을 잃지 않습니다. 연결은 자동으로 돌아갈 길을 찾고, <code>@open-design</code>은 모든 설정을 다시 하지 않아도 계속 동작합니다.</p>
      <p>0.16.x에서 이 릴리스로 바로 넘어왔다면 <a href="/blog/open-design-0-17-0-open-design-for-codex/">0.17.0 릴리스</a>도 이번 업그레이드에 포함됩니다. OpenDesign은 Codex가 직접 닿을 수 있는 디자인 레이어가 됐습니다.</p>

      <h2>공유 프로젝트가 스스로 최신 상태를 지킵니다</h2>
      <p>프로젝트를 Team workspace로 옮기면 모든 멤버가 실시간 읽기 전용 미러를 얻습니다. <strong>소유자가 작업할 때 콘텐츠가 자동으로 가져와지고, 프레즌스 아바타가 누가 보고 있는지 보여 주며, 전송 진행 상황은 계속 보이고, 댓글은 양방향으로 흐릅니다. 읽기 전용 모드의 뷰어가 남긴 댓글도 포함됩니다.</strong> 누구도 프로젝트를 다시 보낼 필요가 없고, “이게 최신인가요?”가 회의의 반복 주제가 되지 않습니다.</p>
      <p>이 모델은 의도적으로 단순합니다. 소유자는 편집 권한을 유지하고, 나머지는 현재 상태를 따라가며 맥락 안에서 검토할 수 있습니다. 프로젝트가 “완성”되기 전부터 유용하게 공유하면서도 모든 리뷰를 병합 문제로 만들지 않습니다.</p>

      <h2>결과물만이 아니라 툴킷을 공유하세요</h2>
      <p>파일 공유는 워크플로의 절반일 뿐입니다. 나머지 절반은 그 파일을 만든 시스템과 습관입니다. 0.18.0에서는 <strong>디자인 시스템, 플러그인, 스킬을 Team workspace에 공유할 수 있습니다.</strong> 팀원은 설정 회의 없이 같은 브랜드 키트와 반복 가능한 워크플로를 이어받습니다.</p>
      <p>청구도 같은 경계를 따릅니다. 잔액, 충전, 실행 요금은 현재 워크스페이스에 귀속됩니다. 팀 작업은 팀에 청구되고 개인적인 탐색은 개인의 것으로 남습니다. 공유 크리에이티브 툴킷과 그 비용을 내는 계정이 마침내 함께 움직입니다.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="모듈식 디자인 시스템 카드, 플러그인 타일, 스킬 카드가 하나의 공유 팀 워크스페이스에 연결되고, 묶인 툴킷이 미색의 편집 배경 위 정밀한 초록색 선택 프레임에 담겨 있는 모습" />
        <figcaption>최종 파일만이 아니라 작업 뒤의 디자인 시스템, 플러그인, 스킬을 공유하세요.</figcaption>
      </figure>

      <h2>워크스페이스답게 느껴지는 워크스페이스</h2>
      <p>새 협업 모델은 새롭게 디자인된 홈과 함께 옵니다. 새 히어로, 레일, 탭, 템플릿과 플러그인 상세 화면에 더해 메시지 센터, 실제 릴리스 데이터로 채워지는 “새로운 소식” 패널, 더 조용한 업데이트 알림이 추가됩니다. 당분간 앱은 라이트 모드를 우선하므로, 새 화면들이 하나의 일관된 모습으로 자리 잡는 동안 테마 설정은 사라집니다.</p>
      <p>작은 디테일이 이 모델을 이어 줍니다. 워크스페이스 전환이 눈에 보이고, 공유 작업과 개인 작업이 구분되며, 현재 플랜이 사용자를 따라옵니다. 제품 소식은 누군가 링크를 전달해 주기를 기다리지 않고 제품 안에 머뭅니다.</p>

      <h2>에이전트가 시작한 일을 더 많이 끝냅니다</h2>
      <p>오래 실행되는 작업이 여전히 결승선에서 멈춘다면 팀 레이어는 의미가 없습니다. 도구 호출 직후 멈추던 세션은 이제 스스로 다시 이어집니다. Kiro 실행은 멈추지 않고 턴을 깔끔하게 마치며, AMR 실행이 실제로 정체되면 앱이 그 이유를 설명할 수 있습니다.</p>
      <p>필수 질문도 더는 잠긴 문과 같지 않습니다. <strong>에이전트가 답할 수 없거나 답하고 싶지 않은 것을 물으면, 질문을 건너뛰고 계속 진행하세요.</strong> 하나의 질문이 전체 실행을 붙잡는 대신 에이전트는 가진 컨텍스트로 작업합니다.</p>

      <h2>0.18.0에 함께 담긴 것들</h2>
      <ul>
        <li><strong>Clone Audit가 커뮤니티 플러그인 라이브러리에 합류합니다</strong> — 복제한 사이트의 시각적 충실도, 남은 추적 코드, 원본 브랜드나 언어의 흔적, 플레이스홀더, 위험한 외부 의존성을 검사하고, 파일과 줄 번호 근거가 담긴 증거 기반 배포 판정을 받으세요. <a href="https://github.com/bestthanapon">@bestthanapon</a>에게 감사드립니다.</li>
        <li><strong>플러그인 카탈로그에 정문이 생겼습니다</strong> — 전용 랜딩 페이지가 앱을 설치하기 전에 OpenDesign 플러그인을 소개합니다.</li>
        <li><strong>Codex 에이전트 페이지가 실제 검색 의도에 답합니다</strong> — Codex UI와 그 주변의 디자인 워크플로를 찾는 사람들에게 더 명확한 포지셔닝을 제공합니다.</li>
        <li><strong>앱 내 브라우저가 뷰포트를 기억합니다</strong> — 기기 크기를 한 번 고르면 세션이 바뀌어도 그대로 유지됩니다. <a href="https://github.com/HD-L">@HD-L</a>에게 감사드립니다.</li>
        <li><strong>삭제한 프로젝트가 탭에 남아 따라다니지 않습니다</strong> — 프로젝트를 제거하면 저장된 탭 레이아웃도 함께 지워집니다. <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>에게 감사드립니다.</li>
        <li><strong>Azure 배포 이름을 다시 편집할 수 있습니다</strong> — BYOK 사용자는 폼과 씨름하지 않고 배포 이름을 바로잡을 수 있습니다. <a href="https://github.com/mturac">@mturac</a>에게 감사드립니다.</li>
        <li><strong>청구 실패는 정중하게 백오프합니다</strong> — Cloud 청구 엔드포인트에 닿을 수 없을 때 실패 중인 연결에 요청을 쏟아붓지 않고 백오프 곡선에 따라 재시도합니다.</li>
      </ul>

      <h2>오늘 무엇을 할 수 있나</h2>
      <table>
        <thead>
          <tr><th>당신이……</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>디자인 리드라면</td><td>Team workspace를 만들고 동료 한 명을 초대한 뒤, 진행 중인 프로젝트를 옮겨 팀이 현재 상태를 맥락 안에서 검토할 수 있게 하세요</td></tr>
          <tr><td>이미 Codex를 쓰고 있다면</td><td>OpenDesign 플러그인을 설치하거나 업데이트하고, Codex에 비주얼 브리프를 요청한 뒤 결과를 Preview 또는 Studio에서 여세요</td></tr>
          <tr><td>브랜드 시스템을 관리한다면</td><td>설정 지침을 따로 보내지 말고 팀이 재사용해야 할 디자인 시스템, 플러그인, 스킬을 공유하세요</td></tr>
          <tr><td>작업을 검토한다면</td><td>공유 미러를 열고 프레즌스를 확인한 뒤, 소유자에게 다른 스냅샷을 내보내 달라고 하지 않고 댓글을 남기세요</td></tr>
          <tr><td>팀 지출을 관리한다면</td><td>실행 전에 Team workspace로 전환하고 플랜 명패를 확인해 요금이 올바른 잔액에 반영되게 하세요</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>디자인 팀이 내보내기, 채팅 스레드, 반복되는 설정 회의를 조립해 협업을 만들 필요는 없습니다. 0.18.0은 작업에 공유 공간을 주고, 그 공간에 공유 툴킷을 제공하며, Codex가 같은 크리에이티브 엔진에 직접 닿게 합니다. Team workspace를 만들고, 실제 프로젝트 하나를 옮긴 뒤, 그렇지 않았다면 최신 스크린샷을 요청했을 사람을 초대하세요.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">OpenDesign 다운로드</a>.</p>
      <p>이틀 동안 115개의 PR. OpenDesign을 개인 워크스페이스에서 팀이 함께 머물 수 있는 장소로 바꾸고, 그 장소를 Codex가 호출할 수 있게 만든 22명에게서 왔습니다. 협업은 공유 버튼이 아닙니다. 작업, 컨텍스트, 도구가 함께 도착하는 것입니다. 보고 있습니다. 🚀</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">OpenDesign 0.17.0: Codex를 위한 OpenDesign</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: 확실한 전달</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: 더 또렷한 시야, 더 긴 몰입</a></li>
      </ul>
  de:
    title: 'OpenDesign 0.18.0: der Workspace fürs Designteam, jetzt in Codex'
    summary: 'open-design-v0.18.0 — 115 PRs von 22 Mitwirkenden in zwei Tagen. Codename „Design Team Workspace. Now in Codex.“ OpenDesign gibt Designteams einen gemeinsamen Ort für Projekte, Kommentare, Designsysteme, Plugins, Skills und Workspace-Abrechnung — und bringt diese Kreativ-Engine direkt in Codex.'
    category: 'Produkt'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, veröffentlicht am 5. August 2026. <strong>115 PRs von 22 Mitwirkenden in zwei Tagen.</strong> Codename „Design Team Workspace. Now in Codex.“ OpenDesign war bisher ein leistungsstarker Ort, an dem eine Person gestalten konnte. Dieses Release gibt dem gesamten Designteam ein Zuhause — und bringt dieselbe Kreativ-Engine in Codex.</p>
      <p>Sie möchten jede Änderung sehen? Lesen Sie die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">vollständigen Release Notes auf GitHub</a>. Hier geht es um die Produktgeschichte: was der neue Workspace verändert, wie Codex hineinpasst und womit Sie heute anfangen können.</p>

      <h2>Ihr Designteam bekommt ein gemeinsames Zuhause</h2>
      <p>Zusammenarbeit begann bisher damit, OpenDesign zu verlassen: eine Datei exportieren, einen Screenshot in den Chat kopieren, fragen, welche Fassung aktuell ist, und dann dieselbe Einrichtung für die nächste Person wiederholen. In 0.18.0 <strong>liegt ein Team-Workspace direkt neben Ihrem persönlichen Workspace</strong>. Erstellen Sie einen, wechseln Sie hinein und laden Sie Kolleginnen und Kollegen in einem sitzplatzbewussten Ablauf mit einer Rolle ein. Alle melden sich über dasselbe OpenDesign Cloud-Konto an und landen am selben Ort.</p>
      <p>Die Grenze bleibt klar. Persönliche Arbeit bleibt persönlich. Teamprojekte, geteilte Ressourcen und Ausgaben gehören zum aktiven Team-Workspace. Das Plan-Schild zeigt, welchen Workspace Sie gerade verwenden, damit beim Teilen nie unklar ist, welches Konto oder Guthaben betroffen ist.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Ein gemeinsamer Design-Workspace mit einer zentralen Projekt-Canvas, mehreren Cursors von Mitwirkenden und Kommentar-Pins, eingefasst von einem präzisen grünen Auswahlrahmen auf nahezu weißem redaktionellem Grund" />
        <figcaption>Ein Team-Workspace bringt Projekte, Menschen, Kommentare und den aktiven Plan an einem gemeinsamen Ort zusammen — direkt neben Ihrer persönlichen Arbeit.</figcaption>
      </figure>

      <h2>OpenDesign arbeitet jetzt innerhalb von Codex</h2>
      <p>0.17.0 öffnete die Tür; 0.18.0 sorgt dafür, dass sie niemand übersieht. <strong>Codex Desktop und CLI können OpenDesign als vollständige Kreativ-Engine aufrufen.</strong> Bestätigen Sie ein visuelles Briefing, wählen Sie OpenDesign Cloud oder eine unterstützte lokale Runtime und erhalten Sie ein echtes Ergebnis in Preview oder Studio, ohne von Hand einen zweiten Stack zusammenzustellen.</p>
      <p>Die signierte OpenDesign-Runtime startet ohne Oberfläche, wenn Codex sie braucht; es gibt also kein zusätzliches App-Fenster, das beaufsichtigt werden muss. Und externe MCP-Hosts verlieren OpenDesign nicht mehr, wenn der lokale Dienst nach einem Neustart auf einem anderen Port zurückkehrt: Die Verbindung findet automatisch nach Hause, und <code>@open-design</code> funktioniert weiter, ohne dass alles noch einmal eingerichtet werden muss.</p>
      <p>Wenn Sie von 0.16.x direkt zu diesem Release gewechselt sind, gehört das <a href="/blog/open-design-0-17-0-open-design-for-codex/">Release 0.17.0</a> ebenfalls zu Ihrem Upgrade — OpenDesign ist zur Designschicht geworden, die Codex direkt erreichen kann.</p>

      <h2>Geteilte Projekte bleiben von selbst aktuell</h2>
      <p>Wenn Sie ein Projekt in den Team-Workspace verschieben, erhält jedes Mitglied einen aktuellen, schreibgeschützten Spiegel. <strong>Inhalte werden während der Arbeit des Eigentümers automatisch abgerufen, Anwesenheits-Avatare zeigen, wer zusieht, der Übertragungsfortschritt bleibt sichtbar und Kommentare fließen in beide Richtungen — auch von Personen im Nur-Lesen-Modus.</strong> Niemand muss das Projekt erneut senden, und „Ist das die neueste Fassung?“ ist kein wiederkehrendes Besprechungsthema mehr.</p>
      <p>Das Modell ist bewusst einfach: Der Eigentümer behält die Bearbeitungsrechte, während alle anderen den aktuellen Stand verfolgen und im Kontext prüfen können. So ist Teilen schon nützlich, bevor ein Projekt „fertig“ ist, ohne jede Überprüfung in ein Merge-Problem zu verwandeln.</p>

      <h2>Teilen Sie das Toolkit, nicht nur das Ergebnis</h2>
      <p>Eine geteilte Datei ist nur die Hälfte eines Workflows. Die andere Hälfte sind das System und die Gewohnheiten, mit denen sie entstanden ist. In 0.18.0 <strong>lassen sich Designsysteme, Plugins und Skills im Team-Workspace teilen</strong>, sodass Teammitglieder dasselbe Brand-Kit und dieselben wiederholbaren Workflows übernehmen können, ohne einen Einrichtungstermin zu brauchen.</p>
      <p>Die Abrechnung folgt derselben Grenze. Guthaben, Aufladungen und Laufgebühren werden dem aktiven Workspace zugerechnet: Teamarbeit wird dem Team berechnet, persönliche Erkundung bleibt persönlich. Das gemeinsame Kreativ-Toolkit und das Konto, das dafür bezahlt, reisen endlich zusammen.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Eine modulare Designsystem-Karte, eine Plugin-Kachel und eine Skill-Karte docken an einen gemeinsamen Team-Workspace an; das gruppierte Toolkit liegt in einem präzisen grünen Auswahlrahmen auf nahezu weißem redaktionellem Grund" />
        <figcaption>Teilen Sie das Designsystem, die Plugins und die Skills hinter der Arbeit — nicht nur die fertige Datei.</figcaption>
      </figure>

      <h2>Ein Workspace, der sich wie ein Workspace anfühlt</h2>
      <p>Das neue Zusammenarbeitsmodell kommt mit einer neu gestalteten Startseite: ein neuer Hero-Bereich, eine Seitenleiste, Tabs sowie Detailansichten für Vorlagen und Plugins, dazu ein Nachrichtencenter, ein mit echten Release-Daten gespeistes What's New-Panel und eine zurückhaltendere Update-Erinnerung. Die App setzt vorerst auf eine helle Darstellung; deshalb entfällt die Theme-Einstellung, während sich diese neuen Oberflächen zu einem einheitlichen Erscheinungsbild zusammenfügen.</p>
      <p>Kleine Details tragen das Modell. Der Workspace-Wechsel ist sichtbar. Geteilte und persönliche Arbeit sind klar getrennt. Der aktuelle Plan begleitet Sie. Produktneuigkeiten leben im Produkt, statt davon abzuhängen, dass jemand einen Link weiterleitet.</p>

      <h2>Agents bringen mehr von dem zu Ende, was sie anfangen</h2>
      <p>Die Teamschicht wäre bedeutungslos, wenn lang laufende Arbeit noch immer kurz vor dem Ziel anhielte. Sitzungen, die direkt nach einem Tool-Aufruf stecken blieben, nehmen sich jetzt selbst wieder auf. Kiro-Läufe schließen ihre Schritte sauber ab, statt zu hängen, und wenn ein AMR-Lauf tatsächlich feststeckt, kann die App erklären, warum.</p>
      <p>Auch Pflichtfragen sind weniger eine verschlossene Tür. <strong>Wenn ein Agent etwas fragt, das Sie nicht beantworten können oder möchten, überspringen Sie die Frage und machen Sie weiter.</strong> Der Agent arbeitet mit dem vorhandenen Kontext, statt den gesamten Lauf als Geisel zu nehmen.</p>

      <h2>Was sonst noch in 0.18.0 landet</h2>
      <ul>
        <li><strong>Clone Audit ergänzt die Community-Plugin-Bibliothek</strong> — prüfen Sie eine geklonte Website auf visuelle Treue, verbliebenes Tracking, Rückstände der Quellmarke oder -sprache, Platzhalter und riskante externe Abhängigkeiten; anschließend erhalten Sie ein evidenzbasiertes Deployment-Urteil mit Datei- und Zeilenbelegen. Danke <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>Der Plugin-Katalog hat einen eigenen Eingang</strong> — eine eigene Landingpage stellt OpenDesign-Plugins vor, bevor jemand die App installiert.</li>
        <li><strong>Die Codex-Agent-Seite beantwortet die eigentliche Suchabsicht</strong> — klarere Positionierung für Menschen, die nach einer Codex-UI und einem dazugehörigen Design-Workflow suchen.</li>
        <li><strong>Der In-App-Browser merkt sich Ihren Viewport</strong> — wählen Sie einmal eine Gerätegröße, und sie bleibt zwischen Sitzungen erhalten. Danke <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>Gelöschte Projekte suchen Tabs nicht länger heim</strong> — beim Entfernen eines Projekts wird auch sein gespeichertes Tab-Layout gelöscht. Danke <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>Azure-Deployment-Namen lassen sich wieder bearbeiten</strong> — BYOK-Nutzer können einen Deployment-Namen korrigieren, ohne gegen das Formular anzukämpfen. Danke <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Abrechnungsfehler ziehen sich höflich zurück</strong> — die App versucht einen nicht erreichbaren Cloud-Abrechnungsendpunkt mit wachsendem Abstand erneut, statt eine fehlerhafte Verbindung zu überfluten.</li>
      </ul>

      <h2>Was Sie heute damit tun können</h2>
      <table>
        <thead>
          <tr><th>Wenn Sie …</th><th>Fangen Sie hier an</th></tr>
        </thead>
        <tbody>
          <tr><td>ein Designteam leiten</td><td>Erstellen Sie einen Team-Workspace, laden Sie eine Person ein und verschieben Sie ein aktives Projekt dorthin, damit das Team den aktuellen Stand im Kontext prüfen kann.</td></tr>
          <tr><td>Codex bereits verwenden</td><td>Installieren oder aktualisieren Sie das OpenDesign-Plugin, bitten Sie Codex dann um ein visuelles Briefing und öffnen Sie das Ergebnis in Preview oder Studio.</td></tr>
          <tr><td>ein Markensystem pflegen</td><td>Teilen Sie das Designsystem, die Plugins und die Skills, die Ihr Team wiederverwenden soll, statt Einrichtungsanweisungen separat zu verschicken.</td></tr>
          <tr><td>Arbeit prüfen</td><td>Öffnen Sie den geteilten Spiegel, beobachten Sie die Anwesenheit und hinterlassen Sie einen Kommentar, ohne den Eigentümer um einen weiteren Export-Snapshot zu bitten.</td></tr>
          <tr><td>Teamausgaben verwalten</td><td>Wechseln Sie vor einem Lauf in den Team-Workspace und prüfen Sie das Plan-Schild, damit die Gebühren dem richtigen Guthaben zugerechnet werden.</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Ein Designteam sollte Zusammenarbeit nicht aus Exporten, Chat-Threads und wiederholten Einrichtungsterminen zusammensetzen müssen. 0.18.0 gibt der Arbeit ein gemeinsames Zuhause, stattet dieses Zuhause mit einem gemeinsamen Toolkit aus und lässt Codex dieselbe Kreativ-Engine direkt erreichen. Erstellen Sie einen Team-Workspace, verschieben Sie ein echtes Projekt hinein und laden Sie die Person ein, die sonst nach dem neuesten Screenshot fragen würde.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">OpenDesign herunterladen</a>.</p>
      <p>115 PRs in zwei Tagen von 22 Menschen, die OpenDesign von einem persönlichen Workspace in einen Ort verwandelt haben, den ein Team bewohnen kann — und diesen Ort aus Codex aufrufbar gemacht haben. Zusammenarbeit ist kein Teilen-Button. Sie bedeutet, dass die Arbeit, der Kontext und die Werkzeuge gemeinsam ankommen. Wir sehen Sie. 🚀</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">Release Notes zu OpenDesign 0.17.0: OpenDesign für Codex</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: verlässliche Auslieferung</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: schärfere Sicht, längerer Flow</a></li>
      </ul>
  fr:
    title: 'OpenDesign 0.18.0 : l''espace de l''équipe design, désormais dans Codex'
    summary: 'open-design-v0.18.0 — 115 PR de 22 contributeurs en deux jours. Nom de code « Design Team Workspace. Now in Codex. » OpenDesign offre aux équipes design un espace commun pour les projets, les commentaires, les systèmes de design, les plugins, les skills et la facturation de l''espace de travail — puis apporte ce même moteur créatif directement dans Codex.'
    category: 'Produit'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, publié le 5 août 2026. <strong>115 PR de 22 contributeurs en deux jours.</strong> Nom de code « Design Team Workspace. Now in Codex. » OpenDesign était déjà un endroit puissant où une personne pouvait créer. Cette version offre un espace à toute l'équipe design — et place ce même moteur créatif dans Codex.</p>
      <p>Vous voulez connaître chaque changement ? Consultez les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">notes de version complètes sur GitHub</a>. Voici l'histoire du produit : ce que change le nouvel espace de travail, comment Codex s'y intègre et par où commencer aujourd'hui.</p>

      <h2>Votre équipe design dispose d'un espace commun</h2>
      <p>Jusqu'ici, collaborer commençait par quitter OpenDesign : exporter un fichier, coller une capture d'écran dans le chat, demander quelle copie était à jour, puis recommencer la même configuration pour la personne suivante. Dans 0.18.0, <strong>un espace de travail Team se trouve à côté de votre espace personnel</strong>. Créez-en un, basculez dessus et invitez des collègues avec un rôle via un parcours tenant compte des sièges. Tout le monde se connecte avec le même compte OpenDesign Cloud et arrive au même endroit.</p>
      <p>La frontière reste nette. Le travail personnel reste personnel. Les projets d'équipe, les ressources partagées et les dépenses appartiennent à l'espace Team actif. Le cartouche du forfait indique l'espace que vous utilisez : partager un travail ne demande donc jamais de deviner quel compte ou quel solde est concerné.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Un espace de design partagé avec un canvas de projet central, plusieurs curseurs de collaborateurs et des repères de commentaires, contenus dans un cadre de sélection vert précis sur un fond éditorial presque blanc" />
        <figcaption>Un espace Team réunit projets, personnes, commentaires et forfait actif au même endroit — juste à côté de votre travail personnel.</figcaption>
      </figure>

      <h2>OpenDesign fonctionne désormais dans Codex</h2>
      <p>0.17.0 a ouvert la porte ; 0.18.0 veille à ce que personne ne la manque. <strong>Codex Desktop et CLI peuvent appeler OpenDesign comme un moteur créatif complet.</strong> Validez un brief visuel, choisissez OpenDesign Cloud ou un runtime local pris en charge et obtenez un véritable résultat dans Preview ou Studio sans assembler une seconde stack à la main.</p>
      <p>Le runtime OpenDesign signé démarre sans interface lorsque Codex en a besoin : aucune fenêtre d'app supplémentaire à surveiller. Et les hôtes MCP externes ne perdent plus OpenDesign lorsque son service local revient sur un autre port après un redémarrage : la connexion retrouve automatiquement son chemin, et <code>@open-design</code> continue de fonctionner sans tout reconfigurer.</p>
      <p>Si vous êtes passé directement de 0.16.x à cette version, la <a href="/blog/open-design-0-17-0-open-design-for-codex/">version 0.17.0</a> fait également partie de votre mise à niveau — OpenDesign est devenu la couche design à laquelle Codex peut accéder directement.</p>

      <h2>Les projets partagés restent à jour tout seuls</h2>
      <p>Déplacer un projet dans l'espace Team donne à chaque membre un miroir en direct et en lecture seule. <strong>Le contenu se récupère automatiquement pendant que le propriétaire travaille, les avatars de présence indiquent qui regarde, la progression du transfert reste visible et les commentaires circulent dans les deux sens — y compris depuis les personnes en lecture seule.</strong> Plus besoin de renvoyer le projet, et « est-ce bien la dernière version ? » cesse d'être un sujet récurrent en réunion.</p>
      <p>Le modèle est volontairement simple : le propriétaire conserve les droits d'édition, tandis que tous les autres peuvent suivre l'état actuel et le relire dans son contexte. Le partage devient ainsi utile avant même qu'un projet soit « terminé », sans transformer chaque revue en problème de fusion.</p>

      <h2>Partagez la boîte à outils, pas seulement le résultat</h2>
      <p>Un fichier partagé ne représente que la moitié d'un workflow. L'autre moitié, ce sont le système et les habitudes qui l'ont produit. Dans 0.18.0, <strong>les systèmes de design, plugins et skills peuvent être partagés dans l'espace Team</strong> : un collègue retrouve le même kit de marque et les mêmes workflows reproductibles, sans appel de configuration.</p>
      <p>La facturation respecte la même frontière. Les soldes, rechargements et frais d'exécution sont attribués à l'espace actif : le travail d'équipe est facturé à l'équipe, tandis que l'exploration personnelle reste personnelle. La boîte à outils créative partagée et le compte qui la paie avancent enfin ensemble.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Une carte de système de design modulaire, une tuile de plugin et une carte de skill viennent s'ancrer dans un espace de travail d'équipe partagé ; la boîte à outils regroupée est contenue dans un cadre de sélection vert précis sur un fond éditorial presque blanc" />
        <figcaption>Partagez le système de design, les plugins et les skills derrière le travail — pas seulement le fichier final.</figcaption>
      </figure>

      <h2>Un espace de travail qui en a vraiment l'air</h2>
      <p>Le nouveau modèle de collaboration s'accompagne d'un accueil repensé : un nouveau hero, un rail, des onglets et des surfaces de détail pour les modèles et les plugins, auxquels s'ajoutent un centre de messages, un panneau What's New alimenté par de vraies données de version et un rappel de mise à jour plus discret. Pour l'instant, l'app privilégie le thème clair ; le réglage du thème est donc retiré le temps que ces nouvelles surfaces s'installent dans une apparence cohérente.</p>
      <p>Les petits détails portent le modèle. Le changement d'espace est visible. Le travail partagé et le travail personnel sont distincts. Le forfait actuel vous suit. Les actualités du produit vivent dans le produit, plutôt que de dépendre de quelqu'un qui transfère un lien.</p>

      <h2>Les agents terminent davantage ce qu'ils commencent</h2>
      <p>La couche d'équipe n'aurait guère de valeur si les longues tâches s'arrêtaient encore sur la ligne d'arrivée. Les sessions qui se bloquaient juste après un appel d'outil se relancent désormais toutes seules. Les exécutions Kiro terminent proprement leur tour au lieu de rester suspendues, et lorsqu'une exécution AMR se bloque réellement, l'app peut en expliquer la raison.</p>
      <p>Les questions obligatoires ressemblent elles aussi moins à une porte fermée. <strong>Si un agent pose une question à laquelle vous ne pouvez ou ne voulez pas répondre, passez-la et continuez.</strong> L'agent travaille avec le contexte dont il dispose au lieu de prendre toute l'exécution en otage.</p>

      <h2>Ce qui arrive aussi dans 0.18.0</h2>
      <ul>
        <li><strong>Clone Audit rejoint la bibliothèque de plugins communautaires</strong> — inspectez un site cloné pour vérifier sa fidélité visuelle, les restes de suivi, les résidus de marque source ou de langue, les placeholders et les dépendances externes risquées, puis obtenez un verdict de déploiement étayé par des preuves et des références précises aux fichiers et aux lignes. Merci <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>Le catalogue de plugins a sa propre porte d'entrée</strong> — une landing page dédiée présente les plugins OpenDesign avant même d'installer l'app.</li>
        <li><strong>La page de l'agent Codex répond à la véritable intention de recherche</strong> — un positionnement plus clair pour les personnes qui cherchent une UI Codex et un workflow de design autour.</li>
        <li><strong>Le navigateur intégré mémorise votre viewport</strong> — choisissez une taille d'appareil une fois, elle restera sélectionnée entre les sessions. Merci <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>Les projets supprimés cessent de hanter les onglets</strong> — supprimer un projet efface aussi sa disposition d'onglets enregistrée. Merci <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>Les noms de déploiement Azure sont de nouveau modifiables</strong> — les utilisateurs BYOK peuvent corriger un nom de déploiement sans lutter avec le formulaire. Merci <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Les échecs de facturation reculent poliment</strong> — l'app réessaie de joindre un endpoint de facturation Cloud inaccessible selon une courbe de temporisation, au lieu d'inonder une connexion défaillante.</li>
      </ul>

      <h2>Ce que vous pouvez en faire aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Responsable design</td><td>Créez un espace Team, invitez une personne et déplacez-y un projet actif afin que l'équipe puisse relire l'état actuel dans son contexte.</td></tr>
          <tr><td>Déjà utilisateur de Codex</td><td>Installez ou mettez à jour le plugin OpenDesign, demandez ensuite à Codex un brief visuel et ouvrez le résultat dans Preview ou Studio.</td></tr>
          <tr><td>Responsable d'un système de marque</td><td>Partagez le système de design, les plugins et les skills que votre équipe doit réutiliser au lieu d'envoyer séparément les instructions de configuration.</td></tr>
          <tr><td>En train de relire un travail</td><td>Ouvrez le miroir partagé, observez la présence et laissez un commentaire sans demander au propriétaire d'exporter une nouvelle capture.</td></tr>
          <tr><td>Responsable des dépenses de l'équipe</td><td>Basculez vers l'espace Team avant une exécution et vérifiez le cartouche du forfait pour que les frais soient prélevés sur le bon solde.</td></tr>
        </tbody>
      </table>

      <h2>La suite</h2>
      <p>Une équipe design ne devrait pas avoir à bricoler la collaboration avec des exports, des fils de discussion et des appels de configuration répétés. 0.18.0 donne au travail un espace commun, donne à cet espace une boîte à outils partagée et permet à Codex d'accéder directement au même moteur créatif. Créez un espace Team, déplacez-y un vrai projet et invitez la personne qui, sinon, demanderait la dernière capture d'écran.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">Télécharger OpenDesign</a>.</p>
      <p>115 PR en deux jours, par 22 personnes qui ont transformé OpenDesign : d'un espace personnel, il devient un lieu qu'une équipe peut habiter — et ce lieu peut désormais être appelé depuis Codex. La collaboration n'est pas un bouton Partager. C'est le travail, le contexte et les outils qui arrivent ensemble. Nous vous voyons. 🚀</p>

      <h2>À lire aussi</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">Notes de version d'OpenDesign 0.17.0 : OpenDesign pour Codex</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0 : une livraison fiable</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1 : une vision plus nette, un flow plus long</a></li>
      </ul>
  ru:
    title: 'OpenDesign 0.18.0: рабочее пространство дизайн-команды — теперь в Codex'
    summary: 'open-design-v0.18.0 — 115 PR от 22 участников за два дня. Кодовое имя «Design Team Workspace. Now in Codex.» OpenDesign даёт дизайн-командам общее пространство для проектов, комментариев, дизайн-систем, плагинов, skills и оплаты рабочего пространства, а затем переносит этот творческий движок прямо в Codex.'
    category: 'Продукт'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, опубликован 5 августа 2026 года. <strong>115 PR от 22 участников за два дня.</strong> Кодовое имя «Design Team Workspace. Now in Codex.» Раньше OpenDesign был мощным местом, где мог творить один человек. Этот релиз даёт общий дом всей дизайн-команде — и помещает тот же творческий движок внутрь Codex.</p>
      <p>Хотите увидеть все изменения? Прочитайте <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">полные примечания к релизу на GitHub</a>. А здесь — история продукта: что меняет новое рабочее пространство, какую роль играет Codex и с чего начать уже сегодня.</p>

      <h2>У вашей дизайн-команды появляется общий дом</h2>
      <p>Раньше совместная работа начиналась с выхода из OpenDesign: экспортировать файл, вставить скриншот в чат, спросить, какая копия актуальна, а затем повторить ту же настройку для следующего человека. В 0.18.0 <strong>рабочее пространство Team находится рядом с вашим личным пространством</strong>. Создайте его, переключитесь в него и пригласите коллег с назначением ролей через процесс, учитывающий количество мест. Все входят через одну и ту же учётную запись OpenDesign Cloud и оказываются в одном месте.</p>
      <p>Граница остаётся чёткой. Личная работа остаётся личной. Командные проекты, общие ресурсы и расходы относятся к активному рабочему пространству Team. Табличка тарифа показывает, какое пространство вы используете, поэтому при совместной работе не приходится гадать, с какой учётной записью или балансом она связана.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Общее пространство для дизайна с центральным холстом проекта, несколькими курсорами участников и метками комментариев, заключёнными в точную зелёную рамку выделения на почти белом редакционном фоне" />
        <figcaption>Рабочее пространство Team объединяет проекты, людей, комментарии и активный тариф в одном общем месте — рядом с вашей личной работой.</figcaption>
      </figure>

      <h2>OpenDesign теперь работает внутри Codex</h2>
      <p>0.17.0 открыл дверь; 0.18.0 не даёт никому её не заметить. <strong>Codex Desktop и CLI могут вызывать OpenDesign как полноценный творческий движок.</strong> Подтвердите визуальный бриф, выберите OpenDesign Cloud или поддерживаемый локальный runtime и получите настоящий результат в Preview или Studio, не собирая второй стек вручную.</p>
      <p>Подписанный runtime OpenDesign запускается без интерфейса, когда он нужен Codex, поэтому следить за лишним окном приложения не приходится. А внешние хосты MCP больше не теряют OpenDesign, если после перезапуска локальный сервис возвращается на другом порту: соединение автоматически находит путь домой, и <code>@open-design</code> продолжает работать без повторной настройки.</p>
      <p>Если вы перешли на этот релиз сразу с 0.16.x, <a href="/blog/open-design-0-17-0-open-design-for-codex/">релиз 0.17.0</a> тоже является частью обновления — OpenDesign стал дизайн-слоем, к которому Codex может обращаться напрямую.</p>

      <h2>Общие проекты остаются актуальными сами</h2>
      <p>Перенос проекта в рабочее пространство Team даёт каждому участнику живое зеркало в режиме чтения. <strong>Контент автоматически подтягивается по мере работы владельца, аватары присутствия показывают, кто просматривает проект, прогресс передачи остаётся видимым, а комментарии идут в обе стороны — в том числе от зрителей в режиме чтения.</strong> Никому не нужно отправлять проект заново, а вопрос «это последняя версия?» перестаёт регулярно возникать на встречах.</p>
      <p>Модель намеренно проста: владелец сохраняет право редактирования, а все остальные могут следить за текущим состоянием и проверять его в контексте. Так совместный доступ приносит пользу ещё до того, как проект «завершён», не превращая каждое ревью в проблему слияния.</p>

      <h2>Делитесь набором инструментов, а не только результатом</h2>
      <p>Общий файл — лишь половина рабочего процесса. Вторая половина — система и привычки, которые помогли его создать. В 0.18.0 <strong>дизайн-системами, плагинами и skills можно делиться в рабочем пространстве Team</strong>, чтобы коллега получал тот же бренд-набор и те же повторяемые процессы без отдельного созвона по настройке.</p>
      <p>Оплата подчиняется той же границе. Балансы, пополнения и плата за запуски относятся к активному рабочему пространству: командную работу оплачивает команда, а личные эксперименты остаются личными. Общий творческий набор инструментов и оплачивающая его учётная запись наконец перемещаются вместе.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Модульная карточка дизайн-системы, плитка плагина и карточка skill присоединяются к общему рабочему пространству команды; сгруппированный набор инструментов заключён в точную зелёную рамку выделения на почти белом редакционном фоне" />
        <figcaption>Делитесь дизайн-системой, плагинами и skills, стоящими за работой, — не только итоговым файлом.</figcaption>
      </figure>

      <h2>Рабочее пространство, которое ощущается рабочим пространством</h2>
      <p>Новая модель совместной работы приходит с обновлённой главной: новый hero-блок, боковая панель, вкладки и подробные страницы шаблонов и плагинов, а также центр сообщений, панель What's New с реальными данными о релизах и более спокойное напоминание об обновлении. Пока приложение в первую очередь рассчитано на светлую тему, поэтому настройка темы убрана, чтобы новые поверхности сложились в единый визуальный образ.</p>
      <p>Модель держится на мелочах. Переключение рабочих пространств заметно. Общая и личная работа чётко разделены. Текущий тариф следует за вами. Новости продукта живут внутри продукта и не зависят от того, перешлёт ли кто-нибудь ссылку.</p>

      <h2>Агенты завершают больше из того, что начинают</h2>
      <p>Командный слой не имел бы значения, если бы длительная работа по-прежнему останавливалась у самой финишной черты. Сессии, зависавшие сразу после вызова инструмента, теперь возобновляются сами. Запуски Kiro корректно завершают свои ходы вместо зависания, а когда запуск AMR действительно застревает, приложение может объяснить почему.</p>
      <p>Обязательные вопросы тоже меньше похожи на запертую дверь. <strong>Если агент спрашивает о чём-то, на что вы не можете или не хотите отвечать, пропустите вопрос и двигайтесь дальше.</strong> Агент работает с имеющимся контекстом, вместо того чтобы удерживать в заложниках весь запуск.</p>

      <h2>Что ещё вошло в 0.18.0</h2>
      <ul>
        <li><strong>Clone Audit пополнил библиотеку плагинов сообщества</strong> — проверьте клонированный сайт на визуальное соответствие, оставшийся трекинг, следы исходного бренда или языка, плейсхолдеры и рискованные внешние зависимости, а затем получите подкреплённый доказательствами вердикт о готовности к развёртыванию со ссылками на файлы и строки. Спасибо <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>У каталога плагинов появился парадный вход</strong> — отдельная landing page знакомит с плагинами OpenDesign ещё до установки приложения.</li>
        <li><strong>Страница агента Codex отвечает реальному поисковому намерению</strong> — более ясное позиционирование для тех, кто ищет UI для Codex и связанный с ним дизайн-процесс.</li>
        <li><strong>Встроенный браузер запоминает viewport</strong> — выберите размер устройства один раз, и он останется выбранным между сессиями. Спасибо <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>Удалённые проекты больше не преследуют вкладки</strong> — при удалении проекта очищается и сохранённая раскладка его вкладок. Спасибо <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>Имена развёртываний Azure снова можно редактировать</strong> — пользователи BYOK могут исправить имя развёртывания, не сражаясь с формой. Спасибо <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Ошибки оплаты вежливо отступают</strong> — приложение повторяет обращение к недоступному endpoint оплаты Cloud с увеличивающимися интервалами, а не заваливает запросами сбойное соединение.</li>
      </ul>

      <h2>Что можно сделать уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Руководитель дизайн-команды</td><td>Создайте рабочее пространство Team, пригласите одного коллегу и перенесите туда активный проект, чтобы команда могла проверить текущее состояние в контексте.</td></tr>
          <tr><td>Уже используете Codex</td><td>Установите или обновите плагин OpenDesign, затем попросите Codex составить визуальный бриф и откройте результат в Preview или Studio.</td></tr>
          <tr><td>Поддерживаете бренд-систему</td><td>Поделитесь дизайн-системой, плагинами и skills, которые ваша команда должна использовать повторно, вместо того чтобы отдельно рассылать инструкции по настройке.</td></tr>
          <tr><td>Проверяете работу</td><td>Откройте общее зеркало, следите за присутствием и оставьте комментарий, не прося владельца экспортировать ещё один снимок.</td></tr>
          <tr><td>Управляете расходами команды</td><td>Перед запуском переключитесь в рабочее пространство Team и проверьте табличку тарифа, чтобы списание прошло с правильного баланса.</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Дизайн-команда не должна собирать совместную работу из экспортов, веток чата и повторяющихся созвонов по настройке. 0.18.0 даёт работе общий дом, этому дому — общий набор инструментов, а Codex — прямой доступ к тому же творческому движку. Создайте рабочее пространство Team, перенесите в него настоящий проект и пригласите человека, который иначе попросил бы прислать последний скриншот.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">Скачать OpenDesign</a>.</p>
      <p>115 PR за два дня от 22 человек, превративших OpenDesign из личного рабочего пространства в место, где может жить команда, — и сделавших это место доступным для вызова из Codex. Совместная работа — не кнопка «Поделиться». Это работа, контекст и инструменты, которые приходят вместе. Мы вас видим. 🚀</p>

      <h2>Дополнительные материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">Примечания к релизу OpenDesign 0.17.0: OpenDesign для Codex</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: надёжная доставка</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: более чёткое зрение, более длинный поток</a></li>
      </ul>
  es:
    title: 'OpenDesign 0.18.0: el espacio de trabajo del equipo de diseño, ahora en Codex'
    summary: 'open-design-v0.18.0 — 115 PR de 22 personas en dos días. Nombre en clave «Design Team Workspace. Now in Codex». OpenDesign ofrece a los equipos de diseño un hogar compartido para proyectos, comentarios, sistemas de diseño, plugins, skills y facturación del espacio de trabajo, y lleva después ese motor creativo directamente a Codex.'
    category: 'Producto'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, publicado el 5 de agosto de 2026. <strong>115 PR de 22 personas en dos días.</strong> Nombre en clave «Design Team Workspace. Now in Codex». OpenDesign ya era un lugar potente para que una persona creara. Esta versión da un hogar a todo el equipo de diseño y pone ese mismo motor creativo dentro de Codex.</p>
      <p>¿Quieres ver todos los cambios? Lee las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">notas completas de la versión en GitHub</a>. Esta es la historia del producto: qué cambia con el nuevo espacio de trabajo, cómo encaja Codex y por dónde empezar hoy.</p>

      <h2>Tu equipo de diseño gana un hogar compartido</h2>
      <p>Antes, colaborar empezaba saliendo de OpenDesign: exportar un archivo, pegar una captura en el chat, preguntar qué texto era el vigente y repetir la misma configuración para la siguiente persona. En 0.18.0, <strong>un espacio de trabajo Team vive junto a tu espacio personal</strong>. Créalo, entra en él e invita a colegas con un rol mediante un flujo que tiene en cuenta las plazas. Todo el mundo inicia sesión con la misma cuenta de OpenDesign Cloud y llega al mismo lugar.</p>
      <p>El límite sigue claro. El trabajo personal continúa siendo personal. Los proyectos del equipo, los recursos compartidos y el gasto pertenecen al espacio de trabajo Team activo. La etiqueta del plan muestra qué espacio estás usando, así que compartir trabajo nunca implica adivinar qué cuenta o saldo está en juego.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Un espacio de trabajo de diseño compartido con un lienzo de proyecto central, varios cursores de colaboradores y marcadores de comentarios, contenido dentro de un marco de selección verde preciso sobre un fondo editorial casi blanco" />
        <figcaption>Un espacio de trabajo Team reúne proyectos, personas, comentarios y el plan activo en un mismo lugar compartido, justo al lado de tu trabajo personal.</figcaption>
      </figure>

      <h2>OpenDesign ahora funciona dentro de Codex</h2>
      <p>0.17.0 abrió la puerta; 0.18.0 se asegura de que nadie la pase por alto. <strong>Codex Desktop y CLI pueden llamar a OpenDesign como un motor creativo completo.</strong> Confirma un brief visual, elige OpenDesign Cloud o un runtime local compatible y recibe un resultado real en Preview o Studio sin montar a mano un segundo stack.</p>
      <p>El runtime firmado de OpenDesign arranca sin interfaz cuando Codex lo necesita, así que no hay otra ventana de la app que vigilar. Además, los hosts MCP externos ya no pierden OpenDesign cuando su servicio local vuelve en otro puerto después de reiniciar: la conexión encuentra el camino de vuelta automáticamente y <code>@open-design</code> sigue funcionando sin repetir toda la configuración.</p>
      <p>Si saltaste de 0.16.x a esta versión, la <a href="/blog/open-design-0-17-0-open-design-for-codex/">versión 0.17.0</a> también forma parte de tu actualización: OpenDesign se ha convertido en la capa de diseño a la que Codex puede acceder directamente.</p>

      <h2>Los proyectos compartidos se mantienen al día por sí solos</h2>
      <p>Mover un proyecto al espacio de trabajo Team ofrece a cada miembro un espejo en vivo y de solo lectura. <strong>El contenido se sincroniza automáticamente mientras trabaja el propietario, los avatares de presencia muestran quién está mirando, el progreso de la transferencia permanece visible y los comentarios fluyen en ambos sentidos, incluso desde quienes ven el proyecto en modo de solo lectura.</strong> Nadie tiene que volver a enviar el proyecto y «¿esta es la última versión?» deja de ser un tema recurrente en las reuniones.</p>
      <p>El modelo es deliberadamente sencillo: el propietario conserva la autoridad de edición y las demás personas pueden seguir el estado actual y revisarlo en contexto. Así, compartir resulta útil antes de que un proyecto esté «terminado», sin convertir cada revisión en un problema de merge.</p>

      <h2>Comparte el kit de herramientas, no solo el resultado</h2>
      <p>Un archivo compartido es solo la mitad de un flujo de trabajo. La otra mitad son el sistema y los hábitos que lo produjeron. En 0.18.0, <strong>los sistemas de diseño, plugins y skills se pueden compartir en el espacio de trabajo Team</strong>, de modo que otra persona del equipo recibe el mismo kit de marca y los mismos flujos repetibles sin una llamada de configuración.</p>
      <p>La facturación sigue el mismo límite. Los saldos, las recargas y los cargos de las ejecuciones se atribuyen al espacio de trabajo activo: el trabajo del equipo se factura al equipo, mientras que la exploración personal sigue siendo personal. El kit creativo compartido y la cuenta que lo paga por fin viajan juntos.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Una tarjeta modular de sistema de diseño, una pieza de plugin y una tarjeta de skill que se acoplan a un espacio de trabajo de equipo compartido, con el kit agrupado dentro de un marco de selección verde preciso sobre un fondo editorial casi blanco" />
        <figcaption>Comparte el sistema de diseño, los plugins y las skills que hay detrás del trabajo, no solo el archivo final.</figcaption>
      </figure>

      <h2>Un espacio de trabajo que se siente como tal</h2>
      <p>El nuevo modelo de colaboración llega con una Home rediseñada: nuevo hero, rail, pestañas y superficies de detalle para plantillas y plugins, además de un centro de mensajes, un panel What's New alimentado con datos reales de las versiones y un recordatorio de actualización más discreto. Por ahora, la app prioriza el tema claro, así que el ajuste de tema se retira mientras estas nuevas superficies se asientan en una apariencia coherente.</p>
      <p>Los pequeños detalles sostienen el modelo. El cambio de espacio de trabajo está a la vista. El trabajo compartido y el personal son distintos. El plan actual te acompaña. Las novedades del producto viven dentro del producto en vez de depender de que alguien reenvíe un enlace.</p>

      <h2>Los agentes terminan más de lo que empiezan</h2>
      <p>La capa de equipo no importaría si el trabajo de larga duración siguiera deteniéndose justo antes de la meta. Las sesiones que se quedaban bloqueadas inmediatamente después de llamar a una herramienta ahora se reanudan solas. Las ejecuciones de Kiro completan sus turnos limpiamente en lugar de quedarse colgadas y, cuando una ejecución de AMR se atasca de verdad, la app puede explicar por qué.</p>
      <p>Las preguntas obligatorias también se parecen menos a una puerta cerrada. <strong>Si un agente pregunta algo que no puedes o no quieres responder, salta la pregunta y sigue adelante.</strong> El agente trabaja con el contexto disponible en vez de mantener como rehén toda la ejecución.</p>

      <h2>Qué más llega en 0.18.0</h2>
      <ul>
        <li><strong>Clone Audit se incorpora a la biblioteca comunitaria de plugins</strong>: inspecciona un sitio clonado para comprobar su fidelidad visual, rastreo residual, restos de la marca o el idioma de origen, placeholders y dependencias externas arriesgadas; después entrega un veredicto de despliegue respaldado por evidencias con referencias de archivo y línea. Gracias, <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>El catálogo de plugins ya tiene puerta de entrada</strong>: una landing page específica presenta los plugins de OpenDesign antes de que alguien instale la app.</li>
        <li><strong>La página del agente Codex responde a la intención de búsqueda real</strong>: un posicionamiento más claro para quienes buscan una interfaz de Codex y un flujo de diseño a su alrededor.</li>
        <li><strong>El navegador dentro de la app recuerda tu viewport</strong>: elige una vez el tamaño de dispositivo y se mantendrá entre sesiones. Gracias, <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>Los proyectos eliminados dejan de rondar las pestañas</strong>: al borrar un proyecto, también se elimina la disposición de pestañas guardada. Gracias, <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>Los nombres de despliegue de Azure vuelven a ser editables</strong>: quienes usan BYOK pueden corregir un nombre de despliegue sin pelearse con el formulario. Gracias, <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Los fallos de facturación retroceden con educación</strong>: la app reintenta un endpoint inaccesible de facturación de Cloud siguiendo una curva de espera progresiva, en vez de inundar una conexión fallida.</li>
      </ul>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>responsable de diseño</td><td>Crea un espacio de trabajo Team, invita a una persona y mueve allí un proyecto activo para que el equipo pueda revisar su estado actual en contexto</td></tr>
          <tr><td>usuario de Codex</td><td>Instala o actualiza el plugin de OpenDesign, pide después a Codex un brief visual y abre el resultado en Preview o Studio</td></tr>
          <tr><td>responsable de un sistema de marca</td><td>Comparte el sistema de diseño, los plugins y las skills que tu equipo debería reutilizar en vez de enviar las instrucciones de configuración por separado</td></tr>
          <tr><td>revisor de trabajos</td><td>Abre el espejo compartido, observa la presencia y deja un comentario sin pedir al propietario que exporte otra captura</td></tr>
          <tr><td>responsable del gasto del equipo</td><td>Cambia al espacio de trabajo Team antes de una ejecución y confirma la etiqueta del plan para que los cargos lleguen al saldo correcto</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer ahora</h2>
      <p>Un equipo de diseño no debería tener que montar la colaboración a base de exportaciones, hilos de chat y llamadas de configuración repetidas. 0.18.0 da al trabajo un hogar compartido, da a ese hogar un kit de herramientas común y permite que Codex acceda directamente al mismo motor creativo. Crea un espacio de trabajo Team, mueve allí un proyecto real e invita a la persona que, de otro modo, pediría la última captura.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">Descargar OpenDesign</a>.</p>
      <p>115 PR en dos días, de 22 personas que convirtieron OpenDesign de un espacio personal en un lugar que un equipo puede habitar y que hicieron que Codex pudiera llamar a ese lugar. La colaboración no es un botón de compartir. Es el trabajo, el contexto y las herramientas llegando juntos. Os vemos. 🚀</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">Notas de la versión OpenDesign 0.17.0: OpenDesign para Codex</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: entrega fiable</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: visión más nítida, flow más largo</a></li>
      </ul>
  pt-br:
    title: 'OpenDesign 0.18.0: o workspace da equipe de design, agora no Codex'
    summary: 'open-design-v0.18.0 — 115 PRs de 22 pessoas em dois dias. Codinome “Design Team Workspace. Now in Codex”. O OpenDesign oferece às equipes de design uma casa compartilhada para projetos, comentários, design systems, plugins, skills e faturamento do workspace — e depois leva esse motor criativo diretamente para o Codex.'
    category: 'Produto'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, publicado em 5 de agosto de 2026. <strong>115 PRs de 22 pessoas em dois dias.</strong> Codinome “Design Team Workspace. Now in Codex”. O OpenDesign já era um lugar poderoso para uma pessoa criar. Esta versão dá uma casa à equipe de design inteira — e coloca o mesmo motor criativo dentro do Codex.</p>
      <p>Quer ver todas as mudanças? Leia as <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">notas completas da versão no GitHub</a>. Esta é a história do produto: o que o novo workspace muda, como o Codex se encaixa e por onde começar hoje.</p>

      <h2>Sua equipe de design ganha uma casa compartilhada</h2>
      <p>Antes, colaborar começava saindo do OpenDesign: exportar um arquivo, colar uma captura no chat, perguntar qual texto era o atual e repetir a mesma configuração para a próxima pessoa. No 0.18.0, <strong>um workspace Team fica ao lado do seu workspace pessoal</strong>. Crie um, entre nele e convide colegas com uma função por um fluxo que considera as vagas. Todo mundo entra pela mesma conta do OpenDesign Cloud e chega ao mesmo lugar.</p>
      <p>O limite continua claro. O trabalho pessoal permanece pessoal. Projetos da equipe, recursos compartilhados e gastos pertencem ao workspace Team ativo. A identificação do plano mostra qual workspace você está usando, então compartilhar trabalho nunca significa adivinhar qual conta ou saldo está envolvido.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Um workspace de design compartilhado com um canvas de projeto central, vários cursores de colaboradores e marcadores de comentários, contido em uma moldura de seleção verde precisa sobre um fundo editorial quase branco" />
        <figcaption>Um workspace Team reúne projetos, pessoas, comentários e o plano ativo em um só lugar compartilhado — bem ao lado do seu trabalho pessoal.</figcaption>
      </figure>

      <h2>O OpenDesign agora funciona dentro do Codex</h2>
      <p>O 0.17.0 abriu a porta; o 0.18.0 garante que ninguém deixe de vê-la. <strong>O Codex Desktop e a CLI podem chamar o OpenDesign como um motor criativo completo.</strong> Confirme um brief visual, escolha o OpenDesign Cloud ou um runtime local compatível e receba um resultado real no Preview ou Studio sem montar uma segunda stack na mão.</p>
      <p>O runtime assinado do OpenDesign inicia sem interface quando o Codex precisa dele, então não há outra janela do app para ficar vigiando. E hosts MCP externos não perdem mais o OpenDesign quando o serviço local volta em outra porta após reiniciar: a conexão encontra o caminho de casa automaticamente e <code>@open-design</code> continua funcionando sem refazer toda a configuração.</p>
      <p>Se você pulou do 0.16.x para esta versão, a <a href="/blog/open-design-0-17-0-open-design-for-codex/">versão 0.17.0</a> também faz parte da sua atualização — o OpenDesign se tornou a camada de design que o Codex consegue acessar diretamente.</p>

      <h2>Projetos compartilhados se mantêm atualizados sozinhos</h2>
      <p>Mover um projeto para o workspace Team dá a cada integrante um espelho ao vivo e somente leitura. <strong>O conteúdo é sincronizado automaticamente enquanto o proprietário trabalha, avatares de presença mostram quem está olhando, o progresso da transferência continua visível e os comentários fluem nos dois sentidos — inclusive de quem está no modo somente leitura.</strong> Ninguém precisa reenviar o projeto, e “esta é a versão mais recente?” deixa de ser um assunto recorrente nas reuniões.</p>
      <p>O modelo é simples de propósito: o proprietário mantém a autoridade de edição, enquanto todo o resto da equipe pode acompanhar o estado atual e revisá-lo em contexto. Assim, compartilhar já é útil antes de um projeto estar “pronto”, sem transformar cada revisão em um problema de merge.</p>

      <h2>Compartilhe o kit de ferramentas, não apenas o resultado</h2>
      <p>Um arquivo compartilhado é só metade de um fluxo de trabalho. A outra metade é o sistema e os hábitos que o produziram. No 0.18.0, <strong>design systems, plugins e skills podem ser compartilhados no workspace Team</strong>, para que outra pessoa da equipe receba o mesmo kit de marca e os mesmos fluxos repetíveis sem uma chamada de configuração.</p>
      <p>O faturamento segue o mesmo limite. Saldos, recargas e cobranças de execução são atribuídos ao workspace ativo: o trabalho da equipe é cobrado da equipe, enquanto a exploração pessoal continua pessoal. O kit criativo compartilhado e a conta que paga por ele finalmente viajam juntos.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Um card modular de design system, uma peça de plugin e um card de skill encaixando em um workspace de equipe compartilhado, com o kit agrupado dentro de uma moldura de seleção verde precisa sobre um fundo editorial quase branco" />
        <figcaption>Compartilhe o design system, os plugins e as skills por trás do trabalho — não apenas o arquivo final.</figcaption>
      </figure>

      <h2>Um workspace com jeito de workspace</h2>
      <p>O novo modelo de colaboração chega com uma Home redesenhada: novo hero, rail, abas e superfícies de detalhes de templates e plugins, além de uma central de mensagens, um painel What's New alimentado por dados reais de versão e um lembrete de atualização mais discreto. Por enquanto, o app prioriza o tema claro, então a configuração de tema foi retirada enquanto essas novas superfícies se acomodam em uma aparência coerente.</p>
      <p>Os pequenos detalhes sustentam o modelo. A troca de workspace está visível. O trabalho compartilhado e o pessoal são distintos. O plano atual acompanha você. As novidades do produto vivem dentro do produto em vez de depender de alguém encaminhar um link.</p>

      <h2>Os agentes terminam mais do que começam</h2>
      <p>A camada de equipe não faria diferença se trabalhos longos ainda parassem na linha de chegada. Sessões que travavam logo depois de uma chamada de ferramenta agora retomam sozinhas. Execuções do Kiro completam seus turnos sem ficar penduradas e, quando uma execução AMR realmente trava, o app consegue explicar por quê.</p>
      <p>Perguntas obrigatórias também parecem menos uma porta trancada. <strong>Se um agente perguntar algo que você não consegue ou não quer responder, pule a pergunta e siga em frente.</strong> O agente trabalha com o contexto que tem em vez de manter a execução inteira como refém.</p>

      <h2>O que mais entra no 0.18.0</h2>
      <ul>
        <li><strong>Clone Audit entra na biblioteca comunitária de plugins</strong> — inspecione um site clonado em busca de fidelidade visual, rastreamento restante, resíduos da marca ou do idioma de origem, placeholders e dependências externas arriscadas; depois receba um veredito de deploy apoiado por evidências com referências de arquivo e linha. Obrigado, <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>O catálogo de plugins ganhou uma porta de entrada</strong> — uma landing page dedicada apresenta os plugins do OpenDesign antes de alguém instalar o app.</li>
        <li><strong>A página do agente Codex responde à intenção de busca real</strong> — posicionamento mais claro para quem procura uma interface do Codex e um fluxo de design ao redor dela.</li>
        <li><strong>O navegador dentro do app lembra do seu viewport</strong> — escolha uma vez o tamanho do dispositivo e ele continua escolhido entre as sessões. Obrigado, <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>Projetos excluídos param de assombrar as abas</strong> — remover um projeto também limpa o layout de abas salvo. Obrigado, <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>Os nomes de deploy do Azure voltam a ser editáveis</strong> — usuários de BYOK podem corrigir um nome de deploy sem brigar com o formulário. Obrigado, <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Falhas de faturamento recuam com educação</strong> — o app tenta novamente um endpoint inacessível de faturamento do Cloud em uma curva de espera progressiva, em vez de inundar uma conexão com falha.</li>
      </ul>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>lidera design</td><td>Crie um workspace Team, convide uma pessoa e mova um projeto em andamento para lá, para a equipe revisar o estado atual em contexto</td></tr>
          <tr><td>já usa o Codex</td><td>Instale ou atualize o plugin do OpenDesign, peça ao Codex um brief visual e abra o resultado no Preview ou Studio</td></tr>
          <tr><td>mantém um sistema de marca</td><td>Compartilhe o design system, os plugins e as skills que sua equipe deve reutilizar, em vez de enviar instruções de configuração separadamente</td></tr>
          <tr><td>revisa trabalhos</td><td>Abra o espelho compartilhado, acompanhe a presença e deixe um comentário sem pedir ao proprietário para exportar outra captura</td></tr>
          <tr><td>gerencia os gastos da equipe</td><td>Mude para o workspace Team antes de uma execução e confirme a identificação do plano para as cobranças caírem no saldo certo</td></tr>
        </tbody>
      </table>

      <h2>O que fazer em seguida</h2>
      <p>Uma equipe de design não deveria precisar montar a colaboração com exportações, threads de chat e chamadas de configuração repetidas. O 0.18.0 dá ao trabalho uma casa compartilhada, dá a essa casa um kit de ferramentas comum e permite que o Codex alcance diretamente o mesmo motor criativo. Crie um workspace Team, mova um projeto real para lá e convide a pessoa que, de outro modo, pediria a captura mais recente.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">Baixar o OpenDesign</a>.</p>
      <p>115 PRs em dois dias, de 22 pessoas que transformaram o OpenDesign de um workspace pessoal em um lugar que uma equipe pode habitar — e fizeram esse lugar poder ser chamado pelo Codex. Colaboração não é um botão de compartilhar. É o trabalho, o contexto e as ferramentas chegando juntos. A gente vê vocês. 🚀</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">Notas da versão OpenDesign 0.17.0: OpenDesign para Codex</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: entrega confiável</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: visão mais nítida, flow mais longo</a></li>
      </ul>
  it:
    title: 'OpenDesign 0.18.0: lo spazio di lavoro del team di design, ora in Codex'
    summary: 'open-design-v0.18.0 — 115 PR da 22 contributori in due giorni. Nome in codice «Design Team Workspace. Now in Codex». OpenDesign offre ai team di design una casa condivisa per progetti, commenti, design system, plugin, skill e fatturazione dello spazio di lavoro, poi porta quel motore creativo direttamente in Codex.'
    category: 'Prodotto'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, pubblicato il 5 agosto 2026. <strong>115 PR da 22 contributori in due giorni.</strong> Nome in codice «Design Team Workspace. Now in Codex». OpenDesign era già un luogo potente in cui una persona poteva creare. Questa release dà una casa all'intero team di design e mette lo stesso motore creativo dentro Codex.</p>
      <p>Vuoi vedere ogni cambiamento? Leggi le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">note di rilascio complete su GitHub</a>. Questa è la storia del prodotto: cosa cambia con il nuovo spazio di lavoro, come si inserisce Codex e da dove iniziare oggi.</p>

      <h2>Il tuo team di design ottiene una casa condivisa</h2>
      <p>Prima, collaborare iniziava uscendo da OpenDesign: esportare un file, incollare uno screenshot in chat, chiedere quale testo fosse quello corrente e ripetere la stessa configurazione per la persona successiva. In 0.18.0, <strong>uno spazio di lavoro Team vive accanto al tuo spazio personale</strong>. Creane uno, passa al suo interno e invita i colleghi con un ruolo tramite un flusso che tiene conto dei posti disponibili. Tutti accedono con lo stesso account OpenDesign Cloud e arrivano nello stesso posto.</p>
      <p>Il confine resta chiaro. Il lavoro personale rimane personale. I progetti del team, le risorse condivise e la spesa appartengono allo spazio di lavoro Team attivo. L'etichetta del piano mostra quale spazio stai usando, quindi condividere il lavoro non significa mai dover indovinare quale account o saldo sia coinvolto.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Uno spazio di lavoro di design condiviso con una canvas di progetto centrale, diversi cursori dei collaboratori e pin dei commenti, racchiuso in una precisa cornice di selezione verde su uno sfondo editoriale quasi bianco" />
        <figcaption>Uno spazio di lavoro Team riunisce progetti, persone, commenti e il piano attivo in un unico luogo condiviso, proprio accanto al tuo lavoro personale.</figcaption>
      </figure>

      <h2>OpenDesign ora funziona dentro Codex</h2>
      <p>0.17.0 ha aperto la porta; 0.18.0 fa in modo che nessuno se la perda. <strong>Codex Desktop e CLI possono chiamare OpenDesign come motore creativo completo.</strong> Conferma un brief visivo, scegli OpenDesign Cloud o un runtime locale supportato e ricevi un vero risultato in Preview o Studio senza assemblare a mano un secondo stack.</p>
      <p>Il runtime firmato di OpenDesign parte senza interfaccia quando Codex ne ha bisogno, quindi non c'è un'altra finestra dell'app da sorvegliare. Inoltre, gli host MCP esterni non perdono più OpenDesign quando il servizio locale torna su una porta diversa dopo un riavvio: la connessione ritrova automaticamente la strada di casa e <code>@open-design</code> continua a funzionare senza rifare tutta la configurazione.</p>
      <p>Se sei passato da 0.16.x direttamente a questa release, anche la <a href="/blog/open-design-0-17-0-open-design-for-codex/">release 0.17.0</a> fa parte del tuo aggiornamento: OpenDesign è diventato il livello di design che Codex può raggiungere direttamente.</p>

      <h2>I progetti condivisi restano aggiornati da soli</h2>
      <p>Spostare un progetto nello spazio di lavoro Team offre a ogni membro uno specchio live in sola lettura. <strong>I contenuti si sincronizzano automaticamente mentre il proprietario lavora, gli avatar di presenza mostrano chi sta guardando, l'avanzamento del trasferimento resta visibile e i commenti scorrono in entrambe le direzioni, anche dagli utenti in modalità sola lettura.</strong> Nessuno deve rimandare il progetto e «è questa la versione più recente?» smette di essere un argomento ricorrente delle riunioni.</p>
      <p>Il modello è volutamente semplice: il proprietario conserva l'autorità di modifica, mentre tutti gli altri possono seguire lo stato corrente e rivederlo nel suo contesto. Così la condivisione è utile prima che un progetto sia «finito», senza trasformare ogni revisione in un problema di merge.</p>

      <h2>Condividi il kit di strumenti, non solo il risultato</h2>
      <p>Un file condiviso è solo metà di un flusso di lavoro. L'altra metà è il sistema e le abitudini che lo hanno prodotto. In 0.18.0, <strong>design system, plugin e skill possono essere condivisi nello spazio di lavoro Team</strong>, così un collega riceve lo stesso kit del brand e gli stessi flussi ripetibili senza una chiamata di configurazione.</p>
      <p>La fatturazione segue lo stesso confine. Saldi, ricariche e addebiti delle esecuzioni sono attribuiti allo spazio di lavoro attivo: il lavoro del team viene addebitato al team, mentre l'esplorazione personale resta personale. Il kit creativo condiviso e l'account che lo paga finalmente viaggiano insieme.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Una scheda modulare di design system, una tessera di plugin e una scheda di skill che si agganciano a uno spazio di lavoro condiviso del team, con il kit raggruppato dentro una precisa cornice di selezione verde su uno sfondo editoriale quasi bianco" />
        <figcaption>Condividi il design system, i plugin e le skill dietro il lavoro, non soltanto il file finale.</figcaption>
      </figure>

      <h2>Uno spazio di lavoro che sembra davvero tale</h2>
      <p>Il nuovo modello di collaborazione arriva con una Home riprogettata: un nuovo hero, rail, tab e superfici di dettaglio per template e plugin, oltre a un centro messaggi, un pannello What's New alimentato da dati reali delle release e un promemoria di aggiornamento più discreto. Per ora l'app dà priorità al tema chiaro, quindi l'impostazione del tema è stata ritirata mentre queste nuove superfici si assestano in un aspetto coerente.</p>
      <p>I piccoli dettagli sostengono il modello. Il cambio di spazio di lavoro è visibile. Il lavoro condiviso e quello personale sono distinti. Il piano corrente ti segue. Le novità del prodotto vivono dentro il prodotto invece di dipendere da qualcuno che inoltri un link.</p>

      <h2>Gli agenti portano a termine più di ciò che iniziano</h2>
      <p>Il livello dedicato al team non avrebbe importanza se i lavori lunghi si fermassero ancora sulla linea del traguardo. Le sessioni che si bloccavano subito dopo una chiamata a uno strumento ora ripartono da sole. Le esecuzioni Kiro completano i turni senza restare sospese e, quando un'esecuzione AMR si blocca davvero, l'app può spiegarne il motivo.</p>
      <p>Anche le domande obbligatorie assomigliano meno a una porta chiusa. <strong>Se un agente chiede qualcosa a cui non puoi o non vuoi rispondere, salta la domanda e vai avanti.</strong> L'agente lavora con il contesto che ha invece di tenere in ostaggio l'intera esecuzione.</p>

      <h2>Cos'altro arriva in 0.18.0</h2>
      <ul>
        <li><strong>Clone Audit entra nella libreria di plugin della community</strong> — ispeziona un sito clonato per verificarne la fedeltà visiva, il tracking residuo, i resti del brand o della lingua di origine, i placeholder e le dipendenze esterne rischiose, poi ottieni un verdetto di deploy sostenuto da prove con riferimenti a file e righe. Grazie <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>Il catalogo dei plugin ha una porta d'ingresso</strong> — una landing page dedicata presenta i plugin di OpenDesign prima che qualcuno installi l'app.</li>
        <li><strong>La pagina dell'agente Codex risponde al vero intento di ricerca</strong> — un posizionamento più chiaro per chi cerca un'interfaccia di Codex e un flusso di design costruito intorno a essa.</li>
        <li><strong>Il browser interno all'app ricorda il tuo viewport</strong> — scegli una volta la dimensione del dispositivo e resta selezionata tra le sessioni. Grazie <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>I progetti eliminati smettono di infestare le tab</strong> — rimuovere un progetto cancella anche il layout delle tab salvato. Grazie <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>I nomi dei deployment Azure sono di nuovo modificabili</strong> — gli utenti BYOK possono correggere il nome di un deployment senza lottare con il modulo. Grazie <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Gli errori di fatturazione fanno un passo indietro con garbo</strong> — l'app ritenta un endpoint di fatturazione Cloud non raggiungibile secondo una curva di backoff, invece di sommergere una connessione che non funziona.</li>
      </ul>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Parti da qui</th></tr>
        </thead>
        <tbody>
          <tr><td>responsabile di un team di design</td><td>Crea uno spazio di lavoro Team, invita una persona e sposta al suo interno un progetto attivo, così il team può rivedere lo stato corrente nel suo contesto</td></tr>
          <tr><td>già su Codex</td><td>Installa o aggiorna il plugin OpenDesign, poi chiedi a Codex un brief visivo e apri il risultato in Preview o Studio</td></tr>
          <tr><td>responsabile di un sistema di brand</td><td>Condividi il design system, i plugin e le skill che il tuo team dovrebbe riutilizzare invece di inviare separatamente le istruzioni di configurazione</td></tr>
          <tr><td>impegnato nella revisione del lavoro</td><td>Apri lo specchio condiviso, osserva la presenza e lascia un commento senza chiedere al proprietario di esportare un'altra istantanea</td></tr>
          <tr><td>responsabile delle spese del team</td><td>Passa allo spazio di lavoro Team prima di un'esecuzione e controlla l'etichetta del piano, così gli addebiti finiscono sul saldo corretto</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare ora</h2>
      <p>Un team di design non dovrebbe dover assemblare la collaborazione con esportazioni, thread di chat e chiamate di configurazione ripetute. 0.18.0 dà al lavoro una casa condivisa, dà a quella casa un kit di strumenti comune e permette a Codex di raggiungere direttamente lo stesso motore creativo. Crea uno spazio di lavoro Team, spostaci un progetto reale e invita la persona che altrimenti chiederebbe lo screenshot più recente.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">Scarica OpenDesign</a>.</p>
      <p>115 PR in due giorni, da 22 persone che hanno trasformato OpenDesign da uno spazio personale in un luogo che un team può abitare e hanno reso quel luogo richiamabile da Codex. Collaborare non è un pulsante di condivisione. È il lavoro, il contesto e gli strumenti che arrivano insieme. Vi vediamo. 🚀</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">Note di rilascio di OpenDesign 0.17.0: OpenDesign per Codex</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: consegna affidabile</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: sguardo più nitido, flow più lungo</a></li>
      </ul>
  tr:
    title: 'OpenDesign 0.18.0: tasarım ekibi çalışma alanı, şimdi Codex içinde'
    summary: 'open-design-v0.18.0 — iki günde 22 katkıcıdan 115 PR. Kod adı “Design Team Workspace. Now in Codex”. OpenDesign; tasarım ekiplerine projeler, yorumlar, tasarım sistemleri, eklentiler, skill''ler ve çalışma alanı faturalandırması için ortak bir yuva sunuyor, ardından bu yaratıcı motoru doğrudan Codex içine getiriyor.'
    category: 'Ürün'
    bodyHtml: |
      <p><code>open-design-v0.18.0</code>, 5 Ağustos 2026'da yayımlandı. <strong>İki günde 22 katkıcıdan 115 PR.</strong> Kod adı “Design Team Workspace. Now in Codex”. OpenDesign zaten tek bir kişinin üretmesi için güçlü bir yerdi. Bu sürüm tüm tasarım ekibine bir yuva veriyor ve aynı yaratıcı motoru Codex'in içine yerleştiriyor.</p>
      <p>Her değişikliği görmek ister misiniz? <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0">GitHub'daki tam sürüm notlarını</a> okuyun. Bu, ürünün hikâyesi: yeni çalışma alanının neyi değiştirdiği, Codex'in buna nasıl uyduğu ve bugün nereden başlayabileceğiniz.</p>

      <h2>Tasarım ekibiniz ortak bir yuvaya kavuşuyor</h2>
      <p>Eskiden iş birliği OpenDesign'dan çıkarak başlardı: bir dosyayı dışa aktarır, ekran görüntüsünü sohbete yapıştırır, hangi metnin güncel olduğunu sorar, ardından aynı kurulumu sıradaki kişi için tekrarlardınız. 0.18.0'da <strong>kişisel çalışma alanınızın yanında bir Team çalışma alanı yer alıyor</strong>. Bir tane oluşturun, ona geçin ve kontenjanı dikkate alan akış üzerinden iş arkadaşlarınızı bir rolle davet edin. Herkes aynı OpenDesign Cloud hesabıyla oturum açıp aynı yere varıyor.</p>
      <p>Sınır açık kalıyor. Kişisel çalışma kişisel kalıyor. Ekip projeleri, paylaşılan kaynaklar ve harcamalar etkin Team çalışma alanına ait. Plan etiketi hangi çalışma alanını kullandığınızı gösteriyor; böylece iş paylaşmak, hangi hesap ya da bakiyenin devrede olduğunu tahmin etmek anlamına gelmiyor.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="Ortada tek bir proje tuvali, çevresinde birkaç iş birliği imleci ve yorum iğnesi bulunan, neredeyse beyaz editoryal zemin üzerinde hassas yeşil bir seçim çerçevesi içine alınmış ortak tasarım çalışma alanı" />
        <figcaption>Bir Team çalışma alanı; projeleri, insanları, yorumları ve etkin planı kişisel işlerinizin hemen yanında, ortak tek bir yerde buluşturur.</figcaption>
      </figure>

      <h2>OpenDesign artık Codex'in içinde çalışıyor</h2>
      <p>0.17.0 kapıyı açtı; 0.18.0 ise kimsenin bunu gözden kaçırmamasını sağlıyor. <strong>Codex Desktop ve CLI, OpenDesign'ı eksiksiz bir yaratıcı motor olarak çağırabiliyor.</strong> Görsel brief'i onaylayın, OpenDesign Cloud'u ya da desteklenen yerel bir runtime'ı seçin ve ikinci bir stack'i elle kurmadan gerçek bir Preview veya Studio sonucu alın.</p>
      <p>İmzalı OpenDesign runtime'ı Codex ihtiyaç duyduğunda arayüzsüz olarak başlıyor; dolayısıyla göz kulak olmanız gereken ek bir uygulama penceresi yok. Ayrıca dış MCP host'ları, yerel servis yeniden başlatıldıktan sonra farklı bir porttan döndüğünde OpenDesign'ı artık kaybetmiyor: bağlantı evinin yolunu otomatik olarak buluyor ve <code>@open-design</code> baştan kurulum gerektirmeden çalışmayı sürdürüyor.</p>
      <p>0.16.x'ten doğrudan bu sürüme geçtiyseniz <a href="/blog/open-design-0-17-0-open-design-for-codex/">0.17.0 sürümü</a> de yükseltmenizin bir parçası: OpenDesign, Codex'in doğrudan erişebildiği tasarım katmanına dönüştü.</p>

      <h2>Paylaşılan projeler kendi kendine güncel kalıyor</h2>
      <p>Bir projeyi Team çalışma alanına taşımak her üyeye canlı, salt okunur bir ayna sunuyor. <strong>Proje sahibi çalışırken içerik otomatik olarak çekiliyor, varlık avatarları kimin baktığını gösteriyor, aktarım ilerlemesi görünür kalıyor ve yorumlar salt okunur moddaki izleyicilerden gelenler dahil iki yönlü akıyor.</strong> Kimsenin projeyi yeniden göndermesi gerekmiyor ve “bu en günceli mi?” sorusu toplantıların tekrar eden konusu olmaktan çıkıyor.</p>
      <p>Model bilinçli olarak basit tutuldu: düzenleme yetkisi proje sahibinde kalırken diğer herkes güncel durumu takip edip bağlamı içinde inceleyebiliyor. Böylece bir projeyi paylaşmak, proje “bitmeden” önce de yararlı hâle geliyor ve her incelemeyi bir merge sorununa dönüştürmüyor.</p>

      <h2>Yalnızca çıktıyı değil, araç setini paylaşın</h2>
      <p>Paylaşılan bir dosya, iş akışının yalnızca yarısıdır. Diğer yarısı ise onu üreten sistem ve alışkanlıklardır. 0.18.0'da <strong>tasarım sistemleri, eklentiler ve skill'ler Team çalışma alanıyla paylaşılabiliyor</strong>; böylece ekip arkadaşınız bir kurulum görüşmesi yapmadan aynı marka kitini ve aynı tekrarlanabilir iş akışlarını kullanabiliyor.</p>
      <p>Faturalandırma da aynı sınırı izliyor. Bakiyeler, yüklemeler ve çalıştırma ücretleri etkin çalışma alanına yazılıyor: ekip işi ekibe fatura edilirken kişisel keşif kişisel kalıyor. Paylaşılan yaratıcı araç seti ile onun ücretini ödeyen hesap sonunda birlikte hareket ediyor.</p>
      <figure>
        <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="Modüler bir tasarım sistemi kartı, eklenti kutucuğu ve skill kartının ortak ekip çalışma alanına kenetlenmesi; gruplanmış araç seti neredeyse beyaz editoryal zemin üzerinde hassas yeşil bir seçim çerçevesi içinde" />
        <figcaption>Yalnızca son dosyayı değil, işin arkasındaki tasarım sistemini, eklentileri ve skill'leri paylaşın.</figcaption>
      </figure>

      <h2>Çalışma alanı gibi hissettiren bir çalışma alanı</h2>
      <p>Yeni iş birliği modeli, yeniden tasarlanmış bir Ana Sayfa ile geliyor: yeni hero, rail, sekmeler, şablon ve eklenti ayrıntı yüzeylerinin yanında bir mesaj merkezi, gerçek sürüm verileriyle beslenen What's New paneli ve daha sessiz bir güncelleme hatırlatıcısı. Uygulama şimdilik açık temayı önceliklendiriyor; bu yeni yüzeyler tutarlı tek bir görünüme yerleşirken tema ayarı kaldırıldı.</p>
      <p>Küçük ayrıntılar modeli taşıyor. Çalışma alanı geçişi görünür. Paylaşılan iş ile kişisel iş birbirinden ayrı. Geçerli plan sizi izliyor. Ürün haberleri, birinin bağlantıyı iletmesine bağlı kalmak yerine ürünün içinde yaşıyor.</p>

      <h2>Ajanlar başladıkları işlerin daha fazlasını bitiriyor</h2>
      <p>Uzun süren işler hâlâ bitiş çizgisinde dursaydı ekip katmanının bir anlamı olmazdı. Bir araç çağrısından hemen sonra takılan oturumlar artık kendi kendine devam ediyor. Kiro çalıştırmaları askıda kalmak yerine turlarını temiz biçimde tamamlıyor; bir AMR çalıştırması gerçekten takıldığında ise uygulama bunun nedenini açıklayabiliyor.</p>
      <p>Zorunlu sorular da artık kilitli bir kapıya daha az benziyor. <strong>Bir ajan yanıtlayamadığınız ya da yanıtlamak istemediğiniz bir şey sorarsa soruyu atlayın ve ilerleyin.</strong> Ajan, tüm çalıştırmayı rehin tutmak yerine elindeki bağlamla çalışıyor.</p>

      <h2>0.18.0'a giren diğer şeyler</h2>
      <ul>
        <li><strong>Clone Audit topluluk eklenti kitaplığına katılıyor</strong> — klonlanmış bir siteyi görsel doğruluk, geride kalmış izleme kodları, kaynak marka veya dil kalıntıları, yer tutucular ve riskli dış bağımlılıklar açısından inceleyin; ardından dosya ve satır referanslarıyla kanıtlanmış bir dağıtım kararı alın. Teşekkürler <a href="https://github.com/bestthanapon">@bestthanapon</a>.</li>
        <li><strong>Eklenti kataloğunun artık bir giriş kapısı var</strong> — özel bir landing page, birisi uygulamayı yüklemeden önce OpenDesign eklentilerini tanıtıyor.</li>
        <li><strong>Codex ajan sayfası gerçek arama niyetini yanıtlıyor</strong> — Codex arayüzü ve onun çevresinde bir tasarım iş akışı arayanlar için daha açık bir konumlandırma.</li>
        <li><strong>Uygulama içi tarayıcı viewport'unuzu hatırlıyor</strong> — cihaz boyutunu bir kez seçin, oturumlar arasında seçili kalsın. Teşekkürler <a href="https://github.com/HD-L">@HD-L</a>.</li>
        <li><strong>Silinen projeler sekmeleri rahatsız etmeyi bırakıyor</strong> — bir projeyi kaldırmak kayıtlı sekme yerleşimini de temizliyor. Teşekkürler <a href="https://github.com/EthanGuo-coder">@EthanGuo-coder</a>.</li>
        <li><strong>Azure deployment adları yeniden düzenlenebiliyor</strong> — BYOK kullanıcıları formla boğuşmadan bir deployment adını düzeltebiliyor. Teşekkürler <a href="https://github.com/mturac">@mturac</a>.</li>
        <li><strong>Faturalandırma hataları nazikçe geri çekiliyor</strong> — uygulama, ulaşılamayan bir Cloud faturalandırma endpoint'ini başarısız bir bağlantıyı istek yağmuruna tutmak yerine artan bekleme eğrisiyle yeniden deniyor.</li>
      </ul>

      <h2>Bugün bununla ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>tasarım lideriyseniz</td><td>Bir Team çalışma alanı oluşturun, bir ekip arkadaşınızı davet edin ve ekibin güncel durumu bağlamı içinde inceleyebilmesi için etkin bir projeyi oraya taşıyın</td></tr>
          <tr><td>zaten Codex kullanıyorsanız</td><td>OpenDesign eklentisini yükleyin veya güncelleyin, ardından Codex'ten bir görsel brief isteyin ve sonucu Preview ya da Studio'da açın</td></tr>
          <tr><td>bir marka sistemi yönetiyorsanız</td><td>Kurulum yönergelerini ayrı ayrı göndermek yerine ekibinizin yeniden kullanması gereken tasarım sistemini, eklentileri ve skill'leri paylaşın</td></tr>
          <tr><td>iş inceliyorsanız</td><td>Paylaşılan aynayı açın, varlığı izleyin ve proje sahibinden başka bir anlık görüntü dışa aktarmasını istemeden yorum bırakın</td></tr>
          <tr><td>ekip harcamalarını yönetiyorsanız</td><td>Bir çalıştırmadan önce Team çalışma alanına geçin ve ücretlerin doğru bakiyeye yazılması için plan etiketini doğrulayın</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne var</h2>
      <p>Bir tasarım ekibi iş birliğini dışa aktarımlar, sohbet başlıkları ve tekrarlanan kurulum görüşmeleriyle bir araya getirmek zorunda kalmamalı. 0.18.0 işe ortak bir yuva, bu yuvaya ortak bir araç seti veriyor ve Codex'in aynı yaratıcı motora doğrudan erişmesini sağlıyor. Bir Team çalışma alanı oluşturun, gerçek bir projeyi oraya taşıyın ve aksi hâlde en güncel ekran görüntüsünü isteyecek kişiyi davet edin.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_18_0&amp;utm_content=official">OpenDesign'ı indir</a>.</p>
      <p>İki günde 115 PR; OpenDesign'ı kişisel bir çalışma alanından ekibin yaşayabileceği bir yere dönüştüren ve bu yeri Codex tarafından çağrılabilir hâle getiren 22 kişiden. İş birliği bir paylaş düğmesi değildir. İşin, bağlamın ve araçların birlikte varmasıdır. Sizi görüyoruz. 🚀</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">OpenDesign 0.17.0 sürüm notları: Codex için OpenDesign</a></li>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">OpenDesign 0.16.0: güvenilir teslimat</a></li>
        <li><a href="/blog/open-design-0-15-1/">OpenDesign 0.15.1: daha keskin görüş, daha uzun akış</a></li>
      </ul>
---

`open-design-v0.18.0`, published on August 5, 2026. **115 PRs from 22 contributors in two days.** Codename "Design Team Workspace. Now in Codex." OpenDesign used to be a powerful place for one person to make. This release gives the whole design team a home — and puts that same creative engine inside Codex.

Want every change? Read the [full release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.18.0). This is the product story: what the new workspace changes, how Codex fits in, and where to start today.

## Your design team gets a shared home

Collaboration used to start by leaving OpenDesign: export a file, paste a screenshot into chat, ask which copy is current, then repeat the same setup for the next person. In 0.18.0, **a Team workspace lives beside your personal workspace**. Create one, switch into it, and invite colleagues with a role through a seat-aware flow. Everyone signs in through the same OpenDesign Cloud account and lands in the same place.

The boundary stays clear. Personal work remains personal. Team projects, shared resources, and spend belong to the active Team workspace. The plan nameplate shows which workspace you are using, so sharing work never means guessing which account or balance is involved.

<figure>
  <img src="/blog/open-design-0-18-0-design-team-workspace-codex-collaboration.webp" alt="A shared design workspace with one central project canvas, several collaborator cursors and comment pins, held inside a precise green selection frame on a near-white editorial ground" />
  <figcaption>A Team workspace puts projects, people, comments, and the active plan in one shared place — right beside your personal work.</figcaption>
</figure>

## OpenDesign now works inside Codex

0.17.0 opened the door; 0.18.0 makes sure nobody misses it. **Codex Desktop and CLI can call OpenDesign as a complete creative engine.** Confirm a visual brief, choose OpenDesign Cloud or a supported local runtime, and receive a real Preview or Studio result without assembling a second stack by hand.

The signed OpenDesign runtime starts headlessly when Codex needs it, so there is no extra app window to babysit. And external MCP hosts no longer lose OpenDesign when its local service returns on a different port after a restart: the connection finds its way home automatically, and `@open-design` keeps working without setup all over again.

If you jumped from 0.16.x to this release, the [0.17.0 release](/blog/open-design-0-17-0-open-design-for-codex/) is part of your upgrade too — OpenDesign has become the design layer Codex can reach directly.

## Shared projects stay current on their own

Moving a project into the Team workspace gives every member a live, read-only mirror. **Content auto-pulls as the owner works, presence avatars show who is looking, transfer progress stays visible, and comments flow both ways — including from viewers in read-only mode.** Nobody has to resend the project, and “is this the latest?” stops being a recurring meeting topic.

The model is deliberately simple: the owner keeps editing authority, while everyone else can follow the current state and review it in context. That makes sharing useful before a project is “finished,” without turning every review into a merge problem.

## Share the toolkit, not just the output

A shared file is only half a workflow. The other half is the system and the habits that produced it. In 0.18.0, **design systems, plugins, and skills can be shared to the Team workspace**, so a teammate picks up the same brand kit and the same repeatable workflows without a setup call.

Billing follows the same boundary. Balances, top-ups, and run charges are attributed to the active workspace: team work bills the team, while personal exploration stays personal. The shared creative toolkit and the account paying for it finally travel together.

<figure>
  <img src="/blog/open-design-0-18-0-design-team-workspace-codex-toolkit.webp" alt="A modular design system card, plugin tile and skill card docking into one shared team workspace, with the grouped toolkit held in a precise green selection frame on a near-white editorial ground" />
  <figcaption>Share the design system, plugins, and skills behind the work — not only the final file.</figcaption>
</figure>

## A workspace that feels like a workspace

The new collaboration model arrives with a redesigned home: a new hero, rail, tabs, and template and plugin detail surfaces, plus a message center, a What's New panel fed by real release data, and a quieter update reminder. The app is light-first for now, so the theme setting is retired while these new surfaces settle into one coherent appearance.

Small details carry the model. Workspace switching is visible. Shared and personal work are distinct. The current plan follows you. Product news lives inside the product instead of depending on somebody forwarding a link.

## Agents finish more of what they start

The team layer would not matter if long-running work still stopped at the finish line. Sessions that stalled immediately after a tool call now pick themselves back up. Kiro runs complete their turns cleanly instead of hanging, and when an AMR run genuinely stalls, the app can explain why.

Required questions are less of a locked door too. **If an agent asks something you cannot or do not want to answer, skip the question and keep moving.** The agent works with the context it has instead of holding the entire run hostage.

## What else lands in 0.18.0

- **Clone Audit joins the community plugin library** — inspect a cloned site for visual fidelity, leftover tracking, source-brand or language residue, placeholders, and risky external dependencies, then get an evidence-backed deployment verdict with file-and-line receipts. Thanks [@bestthanapon](https://github.com/bestthanapon).
- **The plugin catalog has a front door** — a dedicated landing page introduces OpenDesign plugins before someone installs the app.
- **The Codex agent page answers the real search intent** — clearer positioning for people looking for a Codex UI and a design workflow around it.
- **The in-app browser remembers your viewport** — choose a device size once and it stays chosen between sessions. Thanks [@HD-L](https://github.com/HD-L).
- **Deleted projects stop haunting tabs** — removing a project clears its saved tab layout too. Thanks [@EthanGuo-coder](https://github.com/EthanGuo-coder).
- **Azure deployment names are editable again** — BYOK users can correct a deployment name without fighting the form. Thanks [@mturac](https://github.com/mturac).
- **Billing failures back off politely** — the app retries an unreachable Cloud billing endpoint on a backoff curve instead of flooding a failing connection.

## What to do with it today

| If you're… | Start here |
|---|---|
| A design lead | Create a Team workspace, invite one colleague, and move a live project into it so the team can review the current state in context |
| Already using Codex | Install or update the OpenDesign plugin, then ask Codex for a visual brief and open the result in Preview or Studio |
| Maintaining a brand system | Share the design system, plugins, and skills your team should reuse instead of sending setup instructions separately |
| Reviewing work | Open the shared mirror, watch presence, and leave a comment without asking the owner to export another snapshot |
| Managing team spend | Switch to the Team workspace before a run and confirm the plan nameplate so charges land on the right balance |

## What to do next

A design team should not have to assemble collaboration out of exports, chat threads, and repeated setup calls. 0.18.0 gives the work a shared home, gives that home a shared toolkit, and lets Codex reach the same creative engine directly. Create a Team workspace, move one real project into it, and invite the person who would otherwise ask for the latest screenshot.

[Download OpenDesign](/download/?utm_source=blog&utm_medium=docs&utm_campaign=202608_0_18_0&utm_content=official).

115 PRs in two days, from 22 people who turned OpenDesign from a personal workspace into a place a team can inhabit — and made that place callable from Codex. Collaboration is not a share button. It is the work, the context, and the tools arriving together. We see you. 🚀

## Related reading

- [OpenDesign 0.17.0 release notes: OpenDesign for Codex](/blog/open-design-0-17-0-open-design-for-codex/)
- [OpenDesign 0.16.0: reliable delivery](/blog/open-design-0-16-0-reliable-delivery/)
- [OpenDesign 0.15.1: sharper vision, longer flow](/blog/open-design-0-15-1/)
