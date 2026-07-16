---
title: "Open Design 0.14.0: the inspiration time machine"
date: 2026-07-08
category: "Product"
readingTime: 7
summary: "Tag open-design-v0.14.0 — 125 PRs from 36 contributors in five days. Codename \"Inspiration Time Machine.\" Too many good ideas still vanished into the flow: a promising sketch, a useful source, a better earlier version, or the exact moment a draft started to go wrong. 0.14.0 keeps more of the work alive — sketch first in plan mode, trace the inputs feeding the composer, step back through HTML version history, and recover the thread instead of losing the spark."
i18n:
  zh:
    title: 'Open Design 0.14.0：灵感时光机'
    summary: '标签 open-design-v0.14.0 —— 五天内 36 位贡献者提交了 125 个 PR。代号「灵感时光机」。太多好点子依然消失在心流之中：一张有潜力的草图、一个有用的来源、一个更好的早期版本，或者一份草稿开始走偏的那个确切瞬间。0.14.0 让更多工作留存下来——先在 plan mode 里画草图、追溯喂给 composer 的输入、在 HTML 版本历史里回退，并找回那条线索，而不是弄丢那点火花。'
    category: '产品'
    bodyHtml: |
      <p>标签 <code>open-design-v0.14.0</code>，于 2026 年 7 月 8 日发布。<strong>五天内 36 位贡献者提交了 125 个 PR。</strong>代号「灵感时光机」。上一次发布教会了 Open Design 在中断之间保持心流。这一次讲的是心流依然可能弄丢的那些点子：一张从未落地的粗略草图、喂出一个好结果的那个来源、一份更好的早期草稿、一次运行开始跑偏的那个瞬间。0.14.0 让更多工作留存下来，好让你回过头去，重新拾起那点火花。</p>
      <p>想看完整的更新日志？它就在 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">GitHub 上的发布说明</a>里。本文是精简版：底层改了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>先画草图，再正式动工</h2>
      <p>从一个念头直接跳到一长串提示，会让早期探索显得滑不留手——想法跑得飞快，可真正在用的方案始终看不见，于是第一次真正的运行往往只是在猜你自己的意图。<strong>Plan mode，配上 Excalidraw 草图流程，给了一个粗略想法先落脚的地方。</strong>用提纲、形状和下一步来思考；在你看得见的地方把概念塑形；然后才投入一次完整的构建。</p>
      <p>关键在于，一个想法那段乱糟糟的中间地带，如今在 Open Design 里有了归宿，而不再只待在你脑子里或另一个白板标签页里。你起草方案，看着它稳定下来，再从某个你真的能指着说清的东西开始构建。</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Plan mode 和 Excalidraw 草图流程，在你投入一次完整运行之前，给粗略想法一个落脚的地方。</figcaption>
      </figure>

      <h2>可以回退的 HTML 工作</h2>
      <p>生成或编辑过的 HTML 曾经让人觉得脆弱：改一次，之前的样子就可能随之消失。<strong>HTML 文件版本历史让迭代更安全</strong>——比较各个版本、恢复某个更早的版本，一路往前推进，而不必把每一次编辑都当成一扇单向门。你十分钟前那份更好的草稿依然还在。</p>
      <p>与此同时，<strong>composer 的上下文不再躲在答案背后。</strong>当一个结果看起来对或不对时，过去要费太多猜测才能想起模型到底看到了什么。上下文来源现在会显示喂给 composer 的材料，并更清晰地追踪那条线索，于是后续编辑感觉是有根据的，而不是模模糊糊的。</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>HTML 版本历史让你比较、恢复、继续前进——更早的那份草稿永远不是一扇单向门。</figcaption>
      </figure>

      <h2>设计系统变成可用的工作材料</h2>
      <p>不必再在截图、样式片段和一套套独立的套件之间四处翻找，你现在可以把更丰富的系统上下文直接拉进心流里。<strong>Design System Source Context 插件</strong>把系统材料带到离当前设计更近的地方，<strong>Glass Design System UI Kit</strong> 又添了一套开箱即用的视觉方向，而<strong>带灯箱浏览的更丰富的实时预览</strong>让大批图片集更容易查看和应用。设计系统正在变成一种你用来构建的东西，而不只是一种你参考的东西。</p>

      <h2>模型选择不再藏起取舍</h2>
      <p>选一个模型过去感觉像一场记忆测试：哪个选项更新、哪个更贵，又是哪个服务商即将因为一个小小的配置原因而挂掉？<strong>Cloud 模型的费用档位、刷新过的定价，以及更干净的服务商错误处理</strong>，让选择——以及信任——一个模型不再那么盲目。而自带密钥现在也适配更多真实世界的配置：BYOK 通过 OpenCode 的路由更干净，内部服务商端点更容易被安全地放行，本地鉴权也更不容易被误读成坏掉了。</p>

      <h2>正在进行的工作更难丢失</h2>
      <p>一次断掉的数据流、一次重新加载，或者一次随手的搜索，仍可能把一场好好的会话打乱节奏。现在重连更有韧性，看起来失败了的消息在运行其实成功时能够重新挂回，预览重新加载表现正常，composer 在快速交互中也更稳当。而当真有东西出错时，Open Design 会留下更好的线索：<strong>具体的导出错误码、运行工作区的来源信息，以及打包好的崩溃现场证据</strong>，让失败更容易解释、复现和恢复。</p>

      <h2>0.14.0 里还有什么</h2>
      <p>这次发布覆盖面很广。还有几块值得拎出来说：</p>
      <ul>
        <li><strong>社区浏览不再那么随机</strong>——模板画廊新增了「趋势 / 最新」排序，让分享出来的作品更容易探索。</li>
        <li><strong>公开站点持续本地化</strong>——社区页面和一个更大的教程库，已经落地到 keep-11 语言。</li>
        <li><strong>一个招聘页面，以及更强的团队访问入口</strong>，服务于那些要带着更大一群人来评估 Open Design 的人。</li>
        <li><strong>一个更清晰、更快的入口</strong>——首页、定价和社区入口浏览起来更快，导航更有力，套餐定位也更新了。</li>
        <li><strong>模型支持和定价沟通更加与时俱进</strong>，包括刷新过的 cloud 选项和更清晰的高级阵容。</li>
      </ul>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用，连接一个 agent（或者自带你的密钥），然后打开 Plan mode——在投入一次完整构建之前，先把想法画成草图</td></tr>
          <tr><td>在追一个模糊的想法</td><td>从 Plan mode 加一张 Excalidraw 草图开始，把提纲塑形，然后把它交给一次运行</td></tr>
          <tr><td>在迭代 HTML</td><td>放手去改——版本历史让你比较和恢复，所以没有哪次改动是一扇单向门</td></tr>
          <tr><td>在用某套设计系统构建</td><td>用 Design System Source Context 插件把系统上下文直接拉进心流里</td></tr>
          <tr><td>在比较模型</td><td>看看费用档位和徽标——价格和可用性在你投入之前就一目了然</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>灵感来得便宜，留住却昂贵。0.14.0 把预算都花在了留住它上面——那张草图、那个来源、那份更早的草稿、那条你差点弄丢的线索。下载桌面应用，故意从某个粗糙的东西开始，然后留意一下，早期思考有多少能一路存活到成品里。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>五天 125 个 PR，来自 36 个人，他们每个人都又留住了一个好点子，没让它消失在心流里。一场运动不会从某一个团队的笔记本电脑里发布出来；它从每一个挺身而出、又多守住一点火花的人手中发布出来。我们看见你们了。🚀</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0：保持心流</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0：你的品牌就是一套设计系统</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0：集市</a></li>
      </ul>
  ja:
    title: 'Open Design 0.14.0：インスピレーションのタイムマシン'
    summary: 'タグ open-design-v0.14.0 — 5日間で36人のコントリビューターから125件のPR。コードネームは「インスピレーションのタイムマシン（Inspiration Time Machine）」。あまりに多くの良いアイデアが、いまだにフローの中へ消えていきました：見込みのあるスケッチ、役に立つソース、より良い以前のバージョン、あるいは下書きが逸れ始めたまさにその瞬間。0.14.0 は、より多くの作業を生かしておきます——まず plan mode でスケッチし、composer に流れ込む入力をたどり、HTML のバージョン履歴をさかのぼって、ひらめきを失う代わりにその糸を取り戻せるように。'
    category: 'プロダクト'
    bodyHtml: |
      <p>タグ <code>open-design-v0.14.0</code>、2026年7月8日にリリース。<strong>5日間で36人のコントリビューターから125件のPR。</strong>コードネームは「インスピレーションのタイムマシン（Inspiration Time Machine）」。前回のリリースは、Open Design に中断をまたいでフローにとどまることを教えました。今回は、フローがいまだに失いかねないアイデアについての話です：どこにも着地しなかった粗いスケッチ、良い結果を生んだソース、より良い以前の下書き、実行が逸れ始めた瞬間。0.14.0 はより多くの作業を生かしておくので、あなたは戻って、そのひらめきをもう一度拾い上げられます。</p>
      <p>詳細な変更履歴が読みたい方は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">GitHub のリリースノート</a>にあります。本記事は短縮版です：内部で何が変わったか、今日それで何ができるか、そしてどこから始めればよいか。</p>

      <h2>本格的に作り始める前に、まずスケッチ</h2>
      <p>ある思いつきからいきなり長いプロンプトへ飛ぶと、初期の探索はつかみどころなく感じられました——アイデアは速く動くのに、実際の作業計画は見えないままで、最初の本物の実行はしばしば自分自身の意図への当て推量でした。<strong>Plan mode は、Excalidraw のスケッチフローとともに、粗いアイデアがまず着地できる場所を与えてくれます。</strong>アウトライン、形、次のステップで考え、見える場所でコンセプトを形にし、そのうえで初めて本格的なビルドに踏み切りましょう。</p>
      <p>要点は、アイデアの散らかった中間地帯が、いまやあなたの頭の中や別のホワイトボードのタブではなく、Open Design の中に居場所を持つということです。計画を下書きし、それがじっと落ち着くのを見届け、実際に指し示せる何かからビルドを始めます。</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Plan mode と Excalidraw のスケッチフローは、本格的な実行に踏み切る前に、粗いアイデアが着地できる場所を与えます。</figcaption>
      </figure>

      <h2>さかのぼれる HTML 作業</h2>
      <p>生成した、あるいは編集した HTML は、これまで壊れやすく感じられました：一度変えると、以前の姿がそれと一緒に消えてしまいかねなかったのです。<strong>HTML ファイルのバージョン履歴が反復をより安全にします</strong>——バージョンを比較し、以前のものを復元し、すべての編集を一方通行の扉として扱うことなく前進し続けられます。10分前に持っていたより良い下書きは、まだそこにあります。</p>
      <p>それと並んで、<strong>composer のコンテキストが答えの陰に隠れるのをやめます。</strong>結果が正しく見えたり間違って見えたりしたとき、モデルが実際に何を見ていたのかを思い出すのに、これまでは当て推量が多すぎました。コンテキストソースはいまや composer に流れ込む素材を示し、その道筋をより明確にたどるので、フォローアップの編集は曖昧ではなく地に足がついたものに感じられます。</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>HTML のバージョン履歴は、比較し、復元し、前進し続けさせてくれます——以前の下書きが一方通行の扉になることは決してありません。</figcaption>
      </figure>

      <h2>デザインシステムが作業素材になる</h2>
      <p>スクリーンショット、スタイルの断片、別々のキットを探し回る代わりに、いまやより豊かなシステムコンテキストをそのままフローに引き込めます。<strong>Design System Source Context プラグイン</strong>はシステム素材を作業中のデザインの近くへ運び、<strong>Glass Design System UI Kit</strong> はすぐ使えるもう一つのビジュアルの方向性を加え、<strong>ライトボックス閲覧付きのより豊かなライブプレビュー</strong>は大きな画像セットを検分し適用しやすくします。デザインシステムは、ただ参照するものではなく、あなたがそれを使って作るものへと変わりつつあります。</p>

      <h2>モデルの選択がトレードオフを隠さなくなる</h2>
      <p>モデルを選ぶことは、これまで記憶力テストのように感じられました：どの選択肢が新しく、どれがより高くつき、どのプロバイダーが小さな設定上の理由でいまにも失敗しそうか？<strong>Cloud モデルのコスト階層、刷新された価格、そしてよりすっきりしたプロバイダーのエラー処理</strong>により、モデルを選ぶこと——そして信頼すること——がずっと手探りでなくなります。そして持ち込み方式は、いまやより多くの現実的な構成に適合します：BYOK は OpenCode をよりきれいに経由し、内部のプロバイダーエンドポイントは安全に許可しやすくなり、ローカル認証が壊れていると誤読されることも減りました。</p>

      <h2>進行中の作業が失われにくくなる</h2>
      <p>途切れたストリーム、リロード、あるいは素早い検索は、なお良いセッションのリズムを崩しかねませんでした。再接続はいまやより粘り強く、失敗したように見えるメッセージは実行が実際には成功したときに再アタッチでき、プレビューのリロードは正しく振る舞い、composer は速い操作の間もより安定しています。そして何かが実際に壊れたとき、Open Design はより良い痕跡を残します：<strong>具体的なエクスポートのエラーコード、実行ワークスペースの出所、そしてパッケージ化されたクラッシュ現場の証拠</strong>により、失敗は説明し、再現し、回復するのがより容易になります。</p>

      <h2>0.14.0 に含まれるその他の変更</h2>
      <p>このリリースは幅広い内容です。前面に押し出す価値のあるものはあと数点：</p>
      <ul>
        <li><strong>コミュニティの閲覧がより脈絡のあるものに</strong>——テンプレートギャラリーに「トレンド／最新」の並べ替えが加わり、共有された作品を探索しやすくなりました。</li>
        <li><strong>公開サイトのローカライズが続きました</strong>——コミュニティページとより大きなチュートリアルライブラリが、keep-11 のロケール全体にわたって着地しました。</li>
        <li><strong>採用ページと、より強力なチームアクセスの入口</strong>——より大きなグループで Open Design を評価する人たちのためのものです。</li>
        <li><strong>より明快で、より速い玄関口</strong>——ホームページ、価格、コミュニティの入口がより速く閲覧でき、ナビゲーションがより強力になり、プランの位置づけも更新されました。</li>
        <li><strong>モデルのサポートと価格の伝え方がより最新に</strong>——刷新された cloud の選択肢と、より明確なプレミアムの陣容を含みます。</li>
      </ul>

      <h2>今日それで何をするか</h2>
      <table>
        <thead>
          <tr><th>あなたが…</th><th>ここから始める</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design が初めて</td><td>デスクトップアプリをダウンロードし、エージェントを接続し（あるいは自分の鍵を持ち込み）、Plan mode を開きましょう——本格的なビルドに踏み切る前に、アイデアをスケッチします</td></tr>
          <tr><td>曖昧なアイデアを追いかけている</td><td>Plan mode で Excalidraw のスケッチから始め、アウトラインを形にし、それを実行に手渡しましょう</td></tr>
          <tr><td>HTML を反復している</td><td>自由に編集しましょう——バージョン履歴が比較と復元をさせてくれるので、どの変更も一方通行の扉ではありません</td></tr>
          <tr><td>デザインシステムで作っている</td><td>Design System Source Context プラグインで、システムコンテキストをそのままフローに引き込みましょう</td></tr>
          <tr><td>モデルを比較している</td><td>コスト階層とバッジを確認しましょう——価格と可用性が、踏み切る前に見えています</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>インスピレーションは手に入れるのは安く、保つのは高くつきます。0.14.0 はその予算を、それを保つことに費やします——スケッチ、ソース、以前の下書き、あなたがもう少しで失いかけた糸。デスクトップアプリをダウンロードし、あえて粗い何かから始め、初期の思考がどれほど完成した作品まで生き残るかに気づいてください。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>5日間で125件のPR、それぞれがもう一つの良いアイデアをフローの中へ消えさせずに守った36人から。ムーブメントは一つのチームのノートパソコンから出荷されるのではありません。現れて、もう一つのひらめきを救ったすべての人から出荷されるのです。私たちはあなたを見ています。🚀</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0：フローにとどまる</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0：あなたのブランドはデザインシステムである</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0：バザール</a></li>
      </ul>
  ko:
    title: 'Open Design 0.14.0: 영감의 타임머신'
    summary: '태그 open-design-v0.14.0 — 5일 동안 36명의 기여자가 만든 125개의 PR. 코드명 "영감의 타임머신(Inspiration Time Machine)". 너무 많은 좋은 아이디어가 여전히 흐름 속으로 사라졌습니다: 가능성 있는 스케치, 유용한 출처, 더 나은 이전 버전, 혹은 초안이 어긋나기 시작한 바로 그 순간. 0.14.0은 더 많은 작업을 살려 둡니다 — 먼저 plan mode에서 스케치하고, composer로 흘러드는 입력을 추적하고, HTML 버전 기록을 되짚어, 불꽃을 잃는 대신 그 실마리를 되찾을 수 있게요.'
    category: '제품'
    bodyHtml: |
      <p>태그 <code>open-design-v0.14.0</code>, 2026년 7월 8일 출시. <strong>5일 동안 36명의 기여자가 만든 125개의 PR.</strong> 코드명 "영감의 타임머신(Inspiration Time Machine)". 지난 릴리스는 Open Design에게 방해 구간을 가로질러 흐름 속에 머무는 법을 가르쳤습니다. 이번 릴리스는 흐름이 여전히 잃어버릴 수 있는 아이디어에 관한 것입니다: 어디에도 안착하지 못한 거친 스케치, 좋은 결과를 만들어 낸 출처, 더 나은 이전 초안, 실행이 어긋나기 시작한 순간. 0.14.0은 더 많은 작업을 살려 두어, 당신이 되돌아가 그 불꽃을 다시 집어 들 수 있게 합니다.</p>
      <p>전체 변경 로그가 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">GitHub의 릴리스 노트</a>에 담겨 있습니다. 이 글은 짧은 버전입니다: 내부에서 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작하면 되는지.</p>

      <h2>본격적으로 만들기 전에, 먼저 스케치</h2>
      <p>어떤 생각에서 곧바로 긴 프롬프트로 건너뛰면 초기 탐색이 미끄럽게 느껴졌습니다 — 아이디어는 빠르게 움직이는데 실제 작업 계획은 보이지 않은 채여서, 첫 진짜 실행은 종종 당신 자신의 의도에 대한 추측이었죠. <strong>Plan mode는 Excalidraw 스케치 흐름과 함께, 거친 아이디어가 먼저 안착할 곳을 마련해 줍니다.</strong> 개요와 형태, 다음 단계로 생각하고, 눈에 보이는 곳에서 개념을 다듬은 다음, 그제야 본격적인 빌드에 뛰어드세요.</p>
      <p>핵심은, 아이디어의 어수선한 중간 지대가 이제 당신의 머릿속이나 별도의 화이트보드 탭이 아니라 Open Design 안에 자리를 잡는다는 것입니다. 계획을 초안으로 잡고, 그것이 가만히 자리 잡는 것을 지켜본 뒤, 실제로 가리켜 보일 수 있는 무언가에서 빌드를 시작합니다.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Plan mode와 Excalidraw 스케치 흐름은, 당신이 본격적인 실행에 뛰어들기 전에 거친 아이디어가 안착할 곳을 마련해 줍니다.</figcaption>
      </figure>

      <h2>되짚어 갈 수 있는 HTML 작업</h2>
      <p>생성했거나 편집한 HTML은 예전엔 부서지기 쉽게 느껴졌습니다: 한 번 바꾸면 이전 모습이 그와 함께 사라질 수 있었죠. <strong>HTML 파일 버전 기록이 반복 작업을 더 안전하게 만듭니다</strong> — 버전을 비교하고, 이전 것을 복원하고, 모든 편집을 일방통행 문처럼 다루지 않고도 계속 나아갈 수 있습니다. 10분 전에 갖고 있던 더 나은 초안은 여전히 거기 있습니다.</p>
      <p>그와 나란히, <strong>composer의 컨텍스트가 더 이상 답변 뒤에 숨지 않습니다.</strong> 결과가 맞아 보이거나 틀려 보였을 때, 모델이 실제로 무엇을 보았는지 떠올리려면 예전엔 너무 많은 추측이 필요했습니다. 컨텍스트 출처는 이제 composer로 흘러드는 자료를 보여 주고 그 자취를 더 명확하게 추적하므로, 후속 편집이 흐릿하지 않고 근거 있게 느껴집니다.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>HTML 버전 기록은 당신이 비교하고, 복원하고, 계속 나아가게 해 줍니다 — 이전 초안은 결코 일방통행 문이 아닙니다.</figcaption>
      </figure>

      <h2>디자인 시스템이 작업 재료가 되다</h2>
      <p>스크린샷, 스타일 조각, 따로 노는 키트들을 뒤지는 대신, 이제 더 풍부한 시스템 컨텍스트를 곧바로 흐름 속으로 끌어올 수 있습니다. <strong>Design System Source Context 플러그인</strong>은 시스템 자료를 작업 중인 디자인에 더 가까이 가져오고, <strong>Glass Design System UI Kit</strong>은 바로 쓸 수 있는 또 하나의 비주얼 방향을 더하며, <strong>라이트박스 탐색이 되는 더 풍부한 라이브 미리보기</strong>는 큰 이미지 세트를 살펴보고 적용하기 쉽게 만듭니다. 디자인 시스템은 그저 참조하는 것이 아니라, 당신이 그것으로 만들어 내는 무언가로 바뀌고 있습니다.</p>

      <h2>모델 선택이 트레이드오프를 숨기지 않다</h2>
      <p>모델을 고르는 일은 예전엔 기억력 시험처럼 느껴졌습니다: 어느 선택지가 더 새롭고, 어느 것이 더 비싸며, 어느 공급자가 작은 구성 문제로 곧 실패할 참인가? <strong>Cloud 모델의 비용 등급, 새로워진 가격, 그리고 더 깔끔한 공급자 오류 처리</strong> 덕분에 모델을 고르는 일 — 그리고 신뢰하는 일 — 이 훨씬 덜 막막해집니다. 그리고 자체 키 가져오기는 이제 더 많은 실제 환경 구성에 들어맞습니다: BYOK는 OpenCode를 통해 더 깔끔하게 경로를 잡고, 내부 공급자 엔드포인트는 안전하게 허용하기 더 쉬워졌으며, 로컬 인증이 고장 난 것으로 오독될 가능성도 줄었습니다.</p>

      <h2>진행 중인 작업을 잃기가 더 어려워지다</h2>
      <p>끊긴 스트림, 리로드, 또는 잠깐의 검색이 여전히 좋은 세션의 리듬을 흐트러뜨릴 수 있었습니다. 이제 재연결이 더 끈질기고, 실패한 것처럼 보이는 메시지는 실행이 실제로 성공했을 때 다시 붙을 수 있으며, 미리보기 리로드가 제대로 동작하고, composer는 빠른 상호작용 중에도 더 안정적으로 유지됩니다. 그리고 무언가 실제로 깨졌을 때, Open Design은 더 나은 자취를 남깁니다: <strong>구체적인 내보내기 오류 코드, 실행 작업 공간의 출처 정보, 그리고 패키징된 크래시 현장 증거</strong> 덕분에 실패를 설명하고, 재현하고, 복구하기가 더 쉬워집니다.</p>

      <h2>0.14.0에 또 무엇이 담겼나</h2>
      <p>이번 릴리스는 폭이 넓습니다. 앞으로 끌어올릴 만한 조각 몇 가지:</p>
      <ul>
        <li><strong>커뮤니티 둘러보기가 덜 무작위하게 느껴집니다</strong> — 템플릿 갤러리에 "트렌딩 / 최신" 정렬이 생겨, 공유된 작업을 탐색하기 더 쉬워졌습니다.</li>
        <li><strong>공개 사이트가 계속 현지화되었습니다</strong> — 커뮤니티 페이지와 더 큰 튜토리얼 라이브러리가 keep-11 로케일 전반에 걸쳐 안착했습니다.</li>
        <li><strong>채용 페이지와 더 강력한 팀 액세스 진입점</strong> — 더 큰 그룹과 함께 Open Design을 평가하는 사람들을 위한 것입니다.</li>
        <li><strong>더 명확하고 더 빠른 현관</strong> — 홈페이지, 가격, 커뮤니티 진입점이 더 빠르게 열리고, 내비게이션이 더 강력해졌으며, 요금제 포지셔닝도 업데이트되었습니다.</li>
        <li><strong>모델 지원과 가격 안내가 더 최신입니다</strong> — 새로워진 cloud 선택지와 더 명확한 프리미엄 라인업을 포함합니다.</li>
      </ul>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead>
          <tr><th>당신이…</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 다운로드하고, 에이전트를 연결하거나(또는 자신의 키를 가져오고), Plan mode를 여세요 — 본격적인 빌드에 뛰어들기 전에 아이디어를 스케치하세요</td></tr>
          <tr><td>흐릿한 아이디어를 쫓고 있다면</td><td>Plan mode에서 Excalidraw 스케치로 시작해, 개요를 다듬은 다음, 그것을 실행에 넘기세요</td></tr>
          <tr><td>HTML을 반복 작업 중이라면</td><td>마음껏 편집하세요 — 버전 기록이 비교와 복원을 해 주므로, 어떤 변경도 일방통행 문이 아닙니다</td></tr>
          <tr><td>디자인 시스템으로 만들고 있다면</td><td>Design System Source Context 플러그인으로 시스템 컨텍스트를 곧바로 흐름 속으로 끌어오세요</td></tr>
          <tr><td>모델을 비교하고 있다면</td><td>비용 등급과 배지를 확인하세요 — 가격과 가용성이 뛰어들기 전에 보입니다</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>영감은 갖기엔 싸고 지키기엔 비쌉니다. 0.14.0은 그 예산을 그것을 지키는 데 씁니다 — 스케치, 출처, 이전 초안, 당신이 하마터면 잃을 뻔한 실마리. 데스크톱 앱을 다운로드하고, 일부러 거친 무언가로 시작해, 초기의 사고가 완성된 작업까지 얼마나 많이 살아남는지 느껴보세요.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>5일 동안 125개의 PR, 저마다 좋은 아이디어 하나를 흐름 속으로 사라지지 않게 지켜 낸 36명에게서. 운동은 한 팀의 노트북에서 출시되지 않습니다; 나타나서 불꽃을 하나 더 구해 낸 모든 사람에게서 출시됩니다. 우리는 당신을 보고 있습니다. 🚀</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: 흐름 속에 머물기</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: 당신의 브랜드가 곧 디자인 시스템</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: 바자르</a></li>
      </ul>
  de:
    title: 'Open Design 0.14.0: die Zeitmaschine für Inspiration'
    summary: 'Tag open-design-v0.14.0 — 125 PRs von 36 Mitwirkenden in fünf Tagen. Codename „Inspiration Time Machine" (Zeitmaschine für Inspiration). Zu viele gute Ideen verschwanden immer noch im Flow: eine vielversprechende Skizze, eine nützliche Quelle, eine bessere frühere Version oder genau der Moment, in dem ein Entwurf abzudriften begann. 0.14.0 hält mehr von der Arbeit am Leben — erst im Plan mode skizzieren, den Eingaben nachgehen, die den Composer speisen, durch die HTML-Versionshistorie zurückgehen und den Faden wiederfinden, statt den Funken zu verlieren.'
    category: 'Produkt'
    bodyHtml: |
      <p>Tag <code>open-design-v0.14.0</code>, veröffentlicht am 8. Juli 2026. <strong>125 PRs von 36 Mitwirkenden in fünf Tagen.</strong> Codename „Inspiration Time Machine" (Zeitmaschine für Inspiration). Das letzte Release brachte Open Design bei, über Unterbrechungen hinweg im Flow zu bleiben. In diesem geht es um die Ideen, die der Flow trotzdem noch verlieren kann: eine grobe Skizze, die nirgends landete, die Quelle, die ein gutes Ergebnis speiste, ein besserer früherer Entwurf, der Moment, in dem ein Lauf abzudriften begann. 0.14.0 hält mehr von der Arbeit am Leben, damit du zurückgehen und den Funken erneut aufgreifen kannst.</p>
      <p>Willst du das vollständige Änderungsprotokoll? Es findet sich in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">Release Notes auf GitHub</a>. Dieser Beitrag ist die Kurzfassung: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Erst skizzieren, vor dem echten Bauen</h2>
      <p>Direkt von einem Gedanken zu einem langen Prompt zu springen ließ die frühe Erkundung glitschig wirken — die Idee bewegte sich schnell, aber der eigentliche Arbeitsplan blieb unsichtbar, sodass der erste echte Lauf oft ein Raten über die eigene Absicht war. <strong>Der Plan mode, mit Excalidraw-Skizzenabläufen, gibt einer groben Idee zuerst irgendwo Platz zum Landen.</strong> Denke in Gliederungen, Formen und nächsten Schritten; forme das Konzept dort, wo du es sehen kannst; und verpflichte dich erst dann zu einem vollständigen Build.</p>
      <p>Der Punkt ist, dass die unordentliche Mitte einer Idee jetzt ein Zuhause in Open Design hat, statt in deinem Kopf oder einem separaten Whiteboard-Tab zu leben. Du entwirfst den Plan, siehst ihn stillhalten und startest den Build von etwas aus, auf das du tatsächlich zeigen kannst.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Der Plan mode und Excalidraw-Skizzenabläufe geben einer groben Idee Platz zum Landen, bevor du dich zu einem vollständigen Lauf verpflichtest.</figcaption>
      </figure>

      <h2>HTML-Arbeit, durch die du zurückgehen kannst</h2>
      <p>Generiertes oder bearbeitetes HTML fühlte sich früher zerbrechlich an: Ändere es einmal, und die vorherige Form konnte damit verschwinden. <strong>Die HTML-Dateiversionshistorie macht das Iterieren sicherer</strong> — Versionen vergleichen, eine frühere wiederherstellen und weiterkommen, ohne jede Bearbeitung wie eine Einbahntür zu behandeln. Der bessere Entwurf, den du vor zehn Minuten hattest, ist noch da.</p>
      <p>Daneben <strong>hört der Composer-Kontext auf, sich hinter der Antwort zu verstecken.</strong> Wenn ein Ergebnis richtig oder falsch aussah, brauchte es früher zu viel Raten, um sich zu erinnern, was das Modell tatsächlich gesehen hatte. Kontextquellen zeigen jetzt das Material, das den Composer speist, und verfolgen diese Spur klarer, sodass sich Folgebearbeitungen fundiert statt verschwommen anfühlen.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Die HTML-Versionshistorie lässt dich vergleichen, wiederherstellen und weiterkommen — der frühere Entwurf ist nie eine Einbahntür.</figcaption>
      </figure>

      <h2>Designsysteme werden zu Arbeitsmaterial</h2>
      <p>Statt über Screenshots, Style-Schnipsel und separate Kits hinweg zu suchen, kannst du jetzt reicheren Systemkontext direkt in den Flow ziehen. Das <strong>Design System Source Context Plugin</strong> bringt Systemmaterial näher an das aktive Design, das <strong>Glass Design System UI Kit</strong> fügt eine weitere einsatzbereite visuelle Richtung hinzu, und <strong>reichere Live-Vorschauen mit Lightbox-Durchsicht</strong> machen große Bildersätze leichter zu inspizieren und anzuwenden. Designsysteme verwandeln sich in etwas, mit dem du baust, nicht nur in etwas, auf das du verweist.</p>

      <h2>Modellauswahl versteckt die Kompromisse nicht mehr</h2>
      <p>Ein Modell zu wählen fühlte sich früher wie ein Gedächtnistest an: Welche Option ist neuer, welche kostet mehr, und welcher Anbieter versagt gleich aus einem kleinen Konfigurationsgrund? <strong>Kostenstufen für Cloud-Modelle, aufgefrischte Preise und eine sauberere Anbieter-Fehlerbehandlung</strong> machen das Wählen — und Vertrauen — eines Modells deutlich weniger blind. Und Bring-your-own passt jetzt zu mehr realen Setups: BYOK routet sauberer durch OpenCode, interne Anbieter-Endpunkte lassen sich leichter sicher freigeben, und lokale Authentifizierung wird seltener fälschlich als defekt gelesen.</p>

      <h2>Laufende Arbeit ist schwerer zu verlieren</h2>
      <p>Ein abgebrochener Stream, ein Reload oder eine schnelle Suche konnten eine gute Session immer noch aus dem Takt bringen. Die Wiederverbindung ist jetzt widerstandsfähiger, fehlgeschlagen aussehende Nachrichten können sich wieder anhängen, wenn der Lauf tatsächlich erfolgreich war, der Vorschau-Reload verhält sich korrekt, und der Composer bleibt bei schneller Interaktion stabiler. Und wenn doch etwas kaputtgeht, hinterlässt Open Design eine bessere Spur: <strong>spezifische Export-Fehlercodes, die Herkunft des Lauf-Arbeitsbereichs und gebündelte Beweise vom Absturzort</strong> machen Fehler leichter erklärbar, reproduzierbar und behebbar.</p>

      <h2>Was sonst noch in 0.14.0 landet</h2>
      <p>Das Release ist breit. Ein paar weitere Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
        <li><strong>Das Stöbern in der Community wirkt weniger zufällig</strong> — die Vorlagengalerie erhielt eine Sortierung nach „Trending / Neueste", sodass geteilte Arbeit leichter zu erkunden ist.</li>
        <li><strong>Die öffentliche Website wurde weiter lokalisiert</strong> — Community-Seiten und eine größere Tutorial-Bibliothek landeten über die keep-11-Locales hinweg.</li>
        <li><strong>Eine Karriereseite und stärkere Einstiegspunkte für Teamzugang</strong> für Menschen, die Open Design mit einer größeren Gruppe evaluieren.</li>
        <li><strong>Ein klareres, schnelleres Eingangstor</strong> — Homepage, Preise und Community-Einstiegspunkte lassen sich schneller durchstöbern, mit stärkerer Navigation und aktualisierter Plan-Positionierung.</li>
        <li><strong>Modellunterstützung und Preiskommunikation sind aktueller</strong>, einschließlich aufgefrischter Cloud-Optionen und eines klareren Premium-Aufgebots.</li>
      </ul>

      <h2>Was du heute damit machen kannst</h2>
      <table>
        <thead>
          <tr><th>Wenn du…</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>Neu bei Open Design bist</td><td>Lade die Desktop-App herunter, verbinde einen Agenten (oder bring deinen eigenen Schlüssel mit) und öffne den Plan mode — skizziere die Idee, bevor du dich zu einem vollständigen Build verpflichtest</td></tr>
          <tr><td>Einer vagen Idee nachjagst</td><td>Starte im Plan mode mit einer Excalidraw-Skizze, forme die Gliederung und übergib sie dann einem Lauf</td></tr>
          <tr><td>An HTML iterierst</td><td>Bearbeite frei — die Versionshistorie lässt dich vergleichen und wiederherstellen, sodass keine Änderung eine Einbahntür ist</td></tr>
          <tr><td>Mit einem Designsystem baust</td><td>Zieh den Systemkontext mit dem Design System Source Context Plugin direkt in den Flow</td></tr>
          <tr><td>Modelle vergleichst</td><td>Sieh dir die Kostenstufen und Badges an — Preis und Verfügbarkeit sind sichtbar, bevor du dich festlegst</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Inspiration ist billig zu haben und teuer zu behalten. 0.14.0 gibt sein Budget dafür aus, sie zu behalten — die Skizze, die Quelle, den früheren Entwurf, den Faden, den du fast verloren hättest. Lade die Desktop-App herunter, fang absichtlich mit etwas Grobem an, und bemerke, wie viel vom frühen Denken bis zur fertigen Arbeit überlebt.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>125 PRs in fünf Tagen, von 36 Menschen, die jeweils eine weitere gute Idee davor bewahrten, im Flow zu verschwinden. Eine Bewegung wird nicht von den Laptops eines einzelnen Teams ausgeliefert; sie wird von allen ausgeliefert, die aufgetaucht sind und einen weiteren Funken gerettet haben. Wir sehen euch. 🚀</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: im Flow bleiben</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: deine Marke ist ein Designsystem</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: der Basar</a></li>
      </ul>
  fr:
    title: 'Open Design 0.14.0 : la machine à remonter l''inspiration'
    summary: 'Tag open-design-v0.14.0 — 125 PR de 36 contributeurs en cinq jours. Nom de code « Inspiration Time Machine » (la machine à remonter l''inspiration). Trop de bonnes idées se perdaient encore dans le flow : une esquisse prometteuse, une source utile, une meilleure version antérieure, ou l''instant précis où un brouillon a commencé à déraper. La 0.14.0 garde vivante une plus grande part du travail — esquissez d''abord en plan mode, remontez les entrées qui alimentent le composer, revenez en arrière dans l''historique des versions HTML, et retrouvez le fil au lieu de perdre l''étincelle.'
    category: 'Produit'
    bodyHtml: |
      <p>Tag <code>open-design-v0.14.0</code>, publié le 8 juillet 2026. <strong>125 PR de 36 contributeurs en cinq jours.</strong> Nom de code « Inspiration Time Machine » (la machine à remonter l'inspiration). La dernière version a appris à Open Design à rester dans le flow à travers les interruptions. Celle-ci parle des idées que le flow peut encore perdre : une esquisse grossière qui n'a jamais atterri nulle part, la source qui a nourri un bon résultat, un meilleur brouillon antérieur, l'instant où une exécution a commencé à dériver. La 0.14.0 garde vivante une plus grande part du travail pour que vous puissiez revenir en arrière et ressaisir l'étincelle.</p>
      <p>Vous voulez le changelog complet ? Il se trouve dans les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">notes de version sur GitHub</a>. Cet article est la version courte : ce qui a changé sous le capot, ce que vous pouvez en faire dès aujourd'hui, et par où commencer.</p>

      <h2>Esquisser d'abord, avant la vraie construction</h2>
      <p>Sauter directement d'une pensée à un long prompt rendait l'exploration précoce glissante — l'idée avançait vite, mais le plan de travail réel restait invisible, si bien que la première vraie exécution était souvent une supposition sur votre propre intention. <strong>Le plan mode, avec les flux d'esquisse Excalidraw, donne d'abord à une idée grossière un endroit où atterrir.</strong> Pensez en grandes lignes, en formes et en prochaines étapes ; façonnez le concept là où vous pouvez le voir ; et ce n'est qu'alors que vous vous engagez dans une construction complète.</p>
      <p>L'essentiel, c'est que le milieu brouillon d'une idée a désormais un foyer dans Open Design au lieu de vivre dans votre tête ou dans un onglet de tableau blanc séparé. Vous ébauchez le plan, vous le regardez se stabiliser, et vous démarrez la construction à partir de quelque chose que vous pouvez réellement désigner.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Le plan mode et les flux d'esquisse Excalidraw donnent à une idée grossière un endroit où atterrir avant que vous ne vous engagiez dans une exécution complète.</figcaption>
      </figure>

      <h2>Un travail HTML dans lequel vous pouvez revenir en arrière</h2>
      <p>Le HTML généré ou modifié semblait autrefois fragile : changez-le une fois, et la forme précédente pouvait disparaître avec. <strong>L'historique des versions de fichiers HTML rend l'itération plus sûre</strong> — comparez les versions, récupérez-en une antérieure, et continuez d'avancer sans traiter chaque modification comme une porte à sens unique. Le meilleur brouillon que vous aviez il y a dix minutes est toujours là.</p>
      <p>À côté de cela, <strong>le contexte du composer cesse de se cacher derrière la réponse.</strong> Quand un résultat semblait bon ou mauvais, il fallait autrefois trop de suppositions pour se rappeler ce que le modèle avait réellement vu. Les sources de contexte montrent désormais le matériau qui alimente le composer et suivent cette piste plus clairement, si bien que les modifications de suivi semblent ancrées plutôt que floues.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>L'historique des versions HTML vous laisse comparer, récupérer et continuer d'avancer — le brouillon antérieur n'est jamais une porte à sens unique.</figcaption>
      </figure>

      <h2>Les systèmes de design deviennent de la matière de travail</h2>
      <p>Au lieu de fouiller à travers des captures d'écran, des bouts de style et des kits séparés, vous pouvez désormais tirer un contexte de système plus riche directement dans le flow. Le <strong>plugin Design System Source Context</strong> rapproche le matériau du système du design actif, le <strong>Glass Design System UI Kit</strong> ajoute une autre direction visuelle prête à l'emploi, et des <strong>aperçus en direct plus riches avec navigation en lightbox</strong> rendent les grands ensembles d'images plus faciles à inspecter et à appliquer. Les systèmes de design se transforment en quelque chose avec quoi vous construisez, pas seulement en quelque chose que vous consultez.</p>

      <h2>Le choix de modèle cesse de cacher les compromis</h2>
      <p>Choisir un modèle ressemblait autrefois à un test de mémoire : quelle option est la plus récente, laquelle coûte plus cher, et quel fournisseur est sur le point d'échouer pour une petite raison de configuration ? <strong>Les paliers de coût des modèles Cloud, une tarification rafraîchie et une gestion plus propre des erreurs de fournisseur</strong> rendent le choix — et la confiance — d'un modèle beaucoup moins aveugle. Et l'apport de sa propre clé s'adapte désormais à davantage de configurations réelles : le BYOK est routé plus proprement à travers OpenCode, les points de terminaison de fournisseurs internes sont plus faciles à autoriser en toute sécurité, et l'authentification locale risque moins d'être interprétée à tort comme cassée.</p>

      <h2>Le travail en cours est plus difficile à perdre</h2>
      <p>Un flux interrompu, un rechargement ou une recherche rapide pouvaient encore désynchroniser une bonne session. La reconnexion est désormais plus résiliente, les messages qui semblaient échoués peuvent se rattacher quand l'exécution a en réalité réussi, le rechargement de l'aperçu se comporte correctement, et le composer reste plus stable lors d'interactions rapides. Et quand quelque chose casse vraiment, Open Design laisse une meilleure piste derrière lui : <strong>des codes d'erreur d'export spécifiques, la provenance de l'espace de travail d'exécution et des preuves empaquetées de la scène du crash</strong> rendent les échecs plus faciles à expliquer, à reproduire et à corriger.</p>

      <h2>Quoi d'autre arrive dans la 0.14.0</h2>
      <p>La version est vaste. Quelques éléments de plus qui méritent d'être mis en avant :</p>
      <ul>
        <li><strong>Parcourir la communauté semble moins aléatoire</strong> — la galerie de modèles a gagné un tri « Tendances / Plus récents », si bien que le travail partagé est plus facile à explorer.</li>
        <li><strong>Le site public a continué de se localiser</strong> — les pages communautaires et une bibliothèque de tutoriels plus grande sont arrivées à travers les locales keep-11.</li>
        <li><strong>Une page carrières et des points d'entrée d'accès équipe plus solides</strong> pour les personnes qui évaluent Open Design avec un groupe plus large.</li>
        <li><strong>Une porte d'entrée plus claire et plus rapide</strong> — la page d'accueil, les tarifs et les points d'entrée communautaires se parcourent plus vite, avec une navigation plus solide et un positionnement des offres mis à jour.</li>
        <li><strong>La prise en charge des modèles et la communication tarifaire sont plus à jour</strong>, y compris des choix cloud rafraîchis et une gamme premium plus claire.</li>
      </ul>

      <h2>Quoi en faire dès aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau, connectez un agent (ou apportez votre propre clé), et ouvrez le plan mode — esquissez l'idée avant de vous engager dans une construction complète</td></tr>
          <tr><td>À la poursuite d'une idée floue</td><td>Commencez en plan mode avec une esquisse Excalidraw, façonnez le plan, puis confiez-le à une exécution</td></tr>
          <tr><td>En train d'itérer sur du HTML</td><td>Modifiez librement — l'historique des versions vous laisse comparer et récupérer, si bien qu'aucun changement n'est une porte à sens unique</td></tr>
          <tr><td>En train de construire avec un système de design</td><td>Tirez le contexte du système directement dans le flow avec le plugin Design System Source Context</td></tr>
          <tr><td>En train de comparer des modèles</td><td>Vérifiez les paliers de coût et les badges — le prix et la disponibilité sont visibles avant que vous ne vous engagiez</td></tr>
        </tbody>
      </table>

      <h2>Quoi faire ensuite</h2>
      <p>L'inspiration est bon marché à avoir et chère à garder. La 0.14.0 dépense son budget à la garder — l'esquisse, la source, le brouillon antérieur, le fil que vous avez failli perdre. Téléchargez l'application de bureau, commencez quelque chose de grossier exprès, et remarquez à quel point une grande part de la réflexion initiale survit jusqu'au travail fini.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Téléchargez Open Design</a>.</p>
      <p>125 PR en cinq jours, de 36 personnes qui ont chacune empêché une bonne idée de plus de s'évanouir dans le flow. Un mouvement ne se livre pas depuis les ordinateurs portables d'une seule équipe ; il se livre depuis tous ceux qui se sont présentés et ont sauvé une étincelle de plus. On vous voit. 🚀</p>

      <h2>Lectures associées</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0 : rester dans le flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0 : votre marque est un système de design</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0 : le Bazar</a></li>
      </ul>
  ru:
    title: 'Open Design 0.14.0: машина времени для вдохновения'
    summary: 'Тег open-design-v0.14.0 — 125 PR от 36 контрибьюторов за пять дней. Кодовое название «Inspiration Time Machine» (машина времени для вдохновения). Слишком много хороших идей всё ещё исчезало в потоке: многообещающий набросок, полезный источник, лучшая ранняя версия или тот самый момент, когда черновик начал уходить не туда. 0.14.0 сохраняет живой большую часть работы — сначала набросайте в plan mode, проследите за входными данными, питающими composer, отступите назад по истории версий HTML и восстановите нить вместо того, чтобы потерять искру.'
    category: 'Продукт'
    bodyHtml: |
      <p>Тег <code>open-design-v0.14.0</code>, выпущен 8 июля 2026 года. <strong>125 PR от 36 контрибьюторов за пять дней.</strong> Кодовое название «Inspiration Time Machine» (машина времени для вдохновения). Прошлый релиз научил Open Design оставаться в потоке сквозь прерывания. Этот — об идеях, которые поток всё ещё может потерять: грубый набросок, который так никуда и не приземлился, источник, что питал хороший результат, лучший ранний черновик, момент, когда запуск начал уходить не туда. 0.14.0 сохраняет живой большую часть работы, чтобы вы могли вернуться и снова подхватить искру.</p>
      <p>Нужен полный список изменений? Он есть в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">примечаниях к релизу на GitHub</a>. Этот пост — краткая версия: что изменилось под капотом, что вы можете сделать с этим уже сегодня и с чего начать.</p>

      <h2>Сначала набросок, до настоящей сборки</h2>
      <p>Прыжок напрямую от мысли к длинному запросу делал раннее исследование скользким — идея двигалась быстро, но рабочий план оставался невидимым, так что первый настоящий запуск часто был догадкой о вашем же собственном замысле. <strong>Plan mode вместе с потоками набросков Excalidraw даёт грубой идее место, куда сначала приземлиться.</strong> Думайте набросками, формами и следующими шагами; придавайте концепции форму там, где вы её видите; и только затем беритесь за полноценную сборку.</p>
      <p>Суть в том, что беспорядочная середина идеи теперь обрела дом внутри Open Design, а не живёт у вас в голове или в отдельной вкладке с доской. Вы набрасываете план, видите, как он замирает на месте, и начинаете сборку с чего-то, на что действительно можно указать.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Plan mode и потоки набросков Excalidraw дают грубой идее место, куда приземлиться, прежде чем вы возьмётесь за полноценный запуск.</figcaption>
      </figure>

      <h2>Работа с HTML, по которой можно отступить назад</h2>
      <p>Сгенерированный или отредактированный HTML раньше ощущался хрупким: измени его один раз — и прежняя форма могла исчезнуть вместе с ним. <strong>История версий HTML-файлов делает итерации безопаснее</strong> — сравнивайте версии, восстанавливайте более раннюю и продолжайте двигаться, не относясь к каждой правке как к двери в один конец. Тот лучший черновик, что был у вас десять минут назад, всё ещё на месте.</p>
      <p>Рядом с этим <strong>контекст composer перестаёт прятаться за ответом.</strong> Когда результат выглядел правильным или неправильным, раньше требовалось слишком много догадок, чтобы вспомнить, что модель на самом деле видела. Источники контекста теперь показывают материал, питающий composer, и отслеживают этот след яснее, так что последующие правки ощущаются обоснованными, а не размытыми.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>История версий HTML позволяет сравнивать, восстанавливать и продолжать двигаться — ранний черновик никогда не бывает дверью в один конец.</figcaption>
      </figure>

      <h2>Дизайн-системы становятся рабочим материалом</h2>
      <p>Вместо того чтобы рыться среди скриншотов, обрывков стилей и отдельных китов, вы теперь можете втянуть более богатый контекст системы прямо в поток. <strong>Плагин Design System Source Context</strong> приближает материал системы к активному дизайну, <strong>Glass Design System UI Kit</strong> добавляет ещё одно готовое к использованию визуальное направление, а <strong>более богатые живые превью с просмотром в лайтбоксе</strong> делают большие наборы изображений проще для изучения и применения. Дизайн-системы превращаются в то, из чего вы строите, а не только в то, на что вы ссылаетесь.</p>

      <h2>Выбор модели перестаёт прятать компромиссы</h2>
      <p>Выбрать модель раньше ощущалось как проверка памяти: какой вариант новее, какой стоит дороже и какой провайдер вот-вот откажет из-за мелкой причины в настройке? <strong>Уровни стоимости облачных моделей, обновлённое ценообразование и более чистая обработка ошибок провайдеров</strong> делают выбор — и доверие — модели куда менее слепым. А «принеси своё» теперь подходит для большего числа реальных конфигураций: BYOK маршрутизируется чище через OpenCode, внутренние эндпойнты провайдеров проще безопасно разрешить, а локальную аутентификацию реже ошибочно принимают за сломанную.</p>

      <h2>Текущую работу труднее потерять</h2>
      <p>Оборвавшийся поток, перезагрузка или быстрый поиск всё ещё могли выбить хорошую сессию из ритма. Переподключение теперь устойчивее, сообщения, выглядящие как сбойные, могут снова прикрепиться, когда запуск на самом деле удался, перезагрузка превью ведёт себя правильно, а composer остаётся стабильнее при быстром взаимодействии. И когда что-то всё же ломается, Open Design оставляет за собой лучший след: <strong>конкретные коды ошибок экспорта, происхождение рабочего пространства запуска и упакованные улики с места сбоя</strong> делают сбои проще для объяснения, воспроизведения и восстановления.</p>

      <h2>Что ещё вошло в 0.14.0</h2>
      <p>Релиз обширный. Вот ещё несколько частей, которые стоит вынести вперёд:</p>
      <ul>
        <li><strong>Просмотр сообщества ощущается менее случайным</strong> — в галерее шаблонов появилась сортировка «В тренде / Новейшие», так что делиться работой стало проще для изучения.</li>
        <li><strong>Публичный сайт продолжил локализоваться</strong> — страницы сообщества и увеличенная библиотека руководств приземлились во всех локалях keep-11.</li>
        <li><strong>Страница вакансий и более сильные точки входа для доступа команды</strong> — для тех, кто оценивает Open Design более широкой группой.</li>
        <li><strong>Более понятная и быстрая входная дверь</strong> — главная страница, цены и точки входа сообщества просматриваются быстрее, с более сильной навигацией и обновлённым позиционированием планов.</li>
        <li><strong>Поддержка моделей и информирование о ценах стали актуальнее</strong>, включая обновлённые облачные варианты и более чёткий премиум-ряд.</li>
      </ul>

      <h2>Что делать с этим уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктопное приложение, подключите агента (или принесите свой ключ) и откройте plan mode — набросайте идею, прежде чем браться за полноценную сборку</td></tr>
          <tr><td>Гонитесь за смутной идеей</td><td>Начните в plan mode с наброска Excalidraw, придайте форму плану, а затем передайте его запуску</td></tr>
          <tr><td>Итерируете HTML</td><td>Редактируйте свободно — история версий позволяет сравнивать и восстанавливать, так что ни одно изменение не дверь в один конец</td></tr>
          <tr><td>Строите с дизайн-системой</td><td>Втяните контекст системы прямо в поток с помощью плагина Design System Source Context</td></tr>
          <tr><td>Сравниваете модели</td><td>Проверьте уровни стоимости и значки — цена и доступность видны, прежде чем вы возьмётесь</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Вдохновение дёшево иметь и дорого удержать. 0.14.0 тратит свой бюджет на то, чтобы его удержать — набросок, источник, ранний черновик, нить, которую вы едва не потеряли. Скачайте десктопное приложение, намеренно начните с чего-то грубого и заметьте, как много раннего мышления доживает до готовой работы.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>125 PR за пять дней от 36 человек, каждый из которых уберёг ещё одну хорошую идею от исчезновения в потоке. Движение не выпускается с ноутбуков одной команды; оно выпускается всеми, кто пришёл и спас ещё одну искру. Мы видим вас. 🚀</p>

      <h2>Похожие материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: оставаться в потоке</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: ваш бренд — это дизайн-система</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: базар</a></li>
      </ul>
  es:
    title: 'Open Design 0.14.0: la máquina del tiempo de la inspiración'
    summary: 'Tag open-design-v0.14.0: 125 PRs de 36 colaboradores en cinco días. Nombre en clave «Inspiration Time Machine» (la máquina del tiempo de la inspiración). Demasiadas buenas ideas seguían desvaneciéndose en el flow: un boceto prometedor, una fuente útil, una versión anterior mejor, o el instante exacto en que un borrador empezó a torcerse. La 0.14.0 mantiene viva una mayor parte del trabajo: primero bocetas en plan mode, rastreas las entradas que alimentan el composer, retrocedes por el historial de versiones HTML, y recuperas el hilo en lugar de perder la chispa.'
    category: 'Producto'
    bodyHtml: |
      <p>Tag <code>open-design-v0.14.0</code>, publicado el 8 de julio de 2026. <strong>125 PRs de 36 colaboradores en cinco días.</strong> Nombre en clave «Inspiration Time Machine» (la máquina del tiempo de la inspiración). La última versión le enseñó a Open Design a mantenerse en el flow a través de las interrupciones. Esta trata sobre las ideas que el flow todavía puede perder: un boceto tosco que nunca aterrizó en ningún lado, la fuente que alimentó un buen resultado, un borrador anterior mejor, el momento en que una ejecución empezó a desviarse. La 0.14.0 mantiene viva una mayor parte del trabajo para que puedas volver atrás y recoger la chispa de nuevo.</p>
      <p>¿Quieres el registro de cambios completo? Está en las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">notas de la versión en GitHub</a>. Esta publicación es la versión corta: qué cambió por dentro, qué puedes hacer con ello hoy, y por dónde empezar.</p>

      <h2>Boceta primero, antes de la construcción de verdad</h2>
      <p>Saltar directamente de un pensamiento a un prompt largo hacía que la exploración temprana se sintiera resbaladiza: la idea se movía rápido, pero el plan de trabajo real permanecía invisible, así que la primera ejecución de verdad era a menudo una conjetura sobre tu propia intención. <strong>El plan mode, con los flujos de boceto de Excalidraw, le da primero a una idea tosca un lugar donde aterrizar.</strong> Piensa en esquemas, formas y siguientes pasos; da forma al concepto donde puedas verlo; y solo entonces comprométete con una construcción completa.</p>
      <p>El punto es que el desordenado punto medio de una idea ahora tiene un hogar dentro de Open Design en lugar de vivir en tu cabeza o en una pestaña de pizarra aparte. Esbozas el plan, lo ves quedarse quieto, y empiezas la construcción a partir de algo que realmente puedes señalar.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>El plan mode y los flujos de boceto de Excalidraw le dan a una idea tosca un lugar donde aterrizar antes de que te comprometas con una ejecución completa.</figcaption>
      </figure>

      <h2>Trabajo en HTML por el que puedes retroceder</h2>
      <p>El HTML generado o editado solía sentirse frágil: cámbialo una vez, y la forma anterior podía desaparecer con él. <strong>El historial de versiones de archivos HTML hace que iterar sea más seguro</strong>: compara versiones, recupera una anterior, y sigue avanzando sin tratar cada edición como una puerta de un solo sentido. El mejor borrador que tenías hace diez minutos sigue ahí.</p>
      <p>Junto a ello, <strong>el contexto del composer deja de esconderse detrás de la respuesta.</strong> Cuando un resultado parecía correcto o incorrecto, solía costar demasiadas conjeturas recordar qué vio realmente el modelo. Las fuentes de contexto ahora muestran el material que alimenta al composer y siguen ese rastro con más claridad, así que las ediciones de seguimiento se sienten fundamentadas en lugar de difusas.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>El historial de versiones HTML te deja comparar, recuperar y seguir avanzando: el borrador anterior nunca es una puerta de un solo sentido.</figcaption>
      </figure>

      <h2>Los sistemas de diseño se vuelven material de trabajo</h2>
      <p>En lugar de rebuscar entre capturas de pantalla, fragmentos de estilo y kits separados, ahora puedes tirar de un contexto de sistema más rico directamente hacia el flow. El <strong>plugin Design System Source Context</strong> acerca el material del sistema al diseño activo, el <strong>Glass Design System UI Kit</strong> añade otra dirección visual lista para usar, y unas <strong>vistas previas en vivo más ricas con navegación en lightbox</strong> hacen que los grandes conjuntos de imágenes sean más fáciles de inspeccionar y aplicar. Los sistemas de diseño se están convirtiendo en algo con lo que construyes, no solo en algo que consultas.</p>

      <h2>La elección de modelo deja de esconder las concesiones</h2>
      <p>Elegir un modelo solía sentirse como una prueba de memoria: qué opción es más nueva, cuál cuesta más, y qué proveedor está a punto de fallar por una pequeña razón de configuración. <strong>Los niveles de coste de los modelos Cloud, los precios renovados y un manejo de errores de proveedor más limpio</strong> hacen que elegir —y confiar en— un modelo sea mucho menos a ciegas. Y traer el tuyo propio ahora encaja en más configuraciones del mundo real: el BYOK se enruta de forma más limpia a través de OpenCode, los endpoints de proveedores internos son más fáciles de permitir con seguridad, y es menos probable que la autenticación local se malinterprete como rota.</p>

      <h2>El trabajo en curso es más difícil de perder</h2>
      <p>Un stream caído, una recarga o una búsqueda rápida todavía podían sacar de ritmo a una buena sesión. La reconexión ahora es más resistente, los mensajes que parecen fallidos pueden volver a adjuntarse cuando la ejecución en realidad tuvo éxito, la recarga de la vista previa se comporta correctamente, y el composer se mantiene más firme durante la interacción rápida. Y cuando algo sí se rompe, Open Design deja un mejor rastro: <strong>códigos de error de exportación específicos, la procedencia del espacio de trabajo de ejecución, y evidencia empaquetada de la escena del fallo</strong> hacen que los fallos sean más fáciles de explicar, reproducir y recuperar.</p>

      <h2>Qué más llega en la 0.14.0</h2>
      <p>La versión es amplia. Algunas piezas más que vale la pena destacar:</p>
      <ul>
        <li><strong>Explorar la comunidad se siente menos aleatorio</strong>: la galería de plantillas ganó un ordenamiento «Tendencia / Más recientes», así que el trabajo compartido es más fácil de explorar.</li>
        <li><strong>El sitio público siguió localizándose</strong>: las páginas de comunidad y una biblioteca de tutoriales más grande llegaron a través de las locales keep-11.</li>
        <li><strong>Una página de empleo y puntos de entrada de acceso de equipo más sólidos</strong> para quienes evalúan Open Design con un grupo más amplio.</li>
        <li><strong>Una puerta de entrada más clara y más rápida</strong>: la página de inicio, los precios y los puntos de entrada de comunidad se navegan más rápido, con una navegación más sólida y un posicionamiento de planes actualizado.</li>
        <li><strong>El soporte de modelos y la comunicación de precios están más al día</strong>, incluyendo opciones cloud renovadas y una lista premium más clara.</li>
      </ul>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio, conecta un agente (o trae tu propia clave), y abre el plan mode: boceta la idea antes de comprometerte con una construcción completa</td></tr>
          <tr><td>Persiguiendo una idea difusa</td><td>Empieza en plan mode con un boceto de Excalidraw, da forma al esquema, y luego entrégaselo a una ejecución</td></tr>
          <tr><td>Iterando sobre HTML</td><td>Edita con libertad: el historial de versiones te deja comparar y recuperar, así que ningún cambio es una puerta de un solo sentido</td></tr>
          <tr><td>Construyendo con un sistema de diseño</td><td>Tira del contexto del sistema directamente hacia el flow con el plugin Design System Source Context</td></tr>
          <tr><td>Comparando modelos</td><td>Consulta los niveles de coste y las insignias: el precio y la disponibilidad son visibles antes de que te comprometas</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>La inspiración es barata de tener y cara de conservar. La 0.14.0 gasta su presupuesto en conservarla: el boceto, la fuente, el borrador anterior, el hilo que casi pierdes. Descarga la aplicación de escritorio, empieza algo tosco a propósito, y fíjate en cuánto del pensamiento temprano sobrevive hasta el trabajo terminado.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>125 PRs en cinco días, de 36 personas que cada una evitó que una buena idea más se desvaneciera en el flow. Un movimiento no se entrega desde los portátiles de un solo equipo; se entrega desde todos los que aparecieron y salvaron una chispa más. Os vemos. 🚀</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: mantente en el flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: tu marca es un sistema de diseño</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: el Bazar</a></li>
      </ul>
  pt-br:
    title: 'Open Design 0.14.0: a máquina do tempo da inspiração'
    summary: 'Tag open-design-v0.14.0 — 125 PRs de 36 contribuidores em cinco dias. Codinome "Inspiration Time Machine" (a máquina do tempo da inspiração). Boas ideias demais ainda se perdiam no flow: um esboço promissor, uma fonte útil, uma versão anterior melhor, ou o exato momento em que um rascunho começou a se desviar. A 0.14.0 mantém viva uma parte maior do trabalho — primeiro você esboça no plan mode, rastreia as entradas que alimentam o composer, volta pelo histórico de versões HTML, e recupera o fio em vez de perder a faísca.'
    category: 'Produto'
    bodyHtml: |
      <p>Tag <code>open-design-v0.14.0</code>, lançada em 8 de julho de 2026. <strong>125 PRs de 36 contribuidores em cinco dias.</strong> Codinome "Inspiration Time Machine" (a máquina do tempo da inspiração). A última versão ensinou o Open Design a continuar no flow através das interrupções. Esta é sobre as ideias que o flow ainda pode perder: um esboço tosco que nunca chegou a lugar nenhum, a fonte que alimentou um bom resultado, um rascunho anterior melhor, o momento em que uma execução começou a se desviar. A 0.14.0 mantém viva uma parte maior do trabalho para que você possa voltar e pegar a faísca de novo.</p>
      <p>Quer o changelog completo? Ele está nas <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">notas de versão no GitHub</a>. Este post é a versão curta: o que mudou por baixo dos panos, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Esboce primeiro, antes da construção de verdade</h2>
      <p>Pular direto de um pensamento para um prompt longo fazia a exploração inicial parecer escorregadia — a ideia se movia rápido, mas o plano de trabalho real permanecia invisível, então a primeira execução de verdade era muitas vezes um chute sobre a sua própria intenção. <strong>O plan mode, com os fluxos de esboço do Excalidraw, dá primeiro a uma ideia tosca um lugar para pousar.</strong> Pense em tópicos, formas e próximos passos; dê forma ao conceito onde você possa vê-lo; e só então parta para uma construção completa.</p>
      <p>O ponto é que o meio bagunçado de uma ideia agora tem um lar dentro do Open Design em vez de morar na sua cabeça ou em uma aba de quadro branco separada. Você rascunha o plano, vê ele ficar parado, e começa a construção a partir de algo que você realmente consegue apontar.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>O plan mode e os fluxos de esboço do Excalidraw dão a uma ideia tosca um lugar para pousar antes de você partir para uma execução completa.</figcaption>
      </figure>

      <h2>Trabalho em HTML pelo qual você pode voltar</h2>
      <p>O HTML gerado ou editado costumava parecer frágil: mude-o uma vez, e a forma anterior podia desaparecer junto. <strong>O histórico de versões de arquivos HTML torna a iteração mais segura</strong> — compare versões, recupere uma anterior, e continue avançando sem tratar cada edição como uma porta de mão única. O rascunho melhor que você tinha dez minutos atrás ainda está lá.</p>
      <p>Ao lado disso, <strong>o contexto do composer para de se esconder atrás da resposta.</strong> Quando um resultado parecia certo ou errado, costumava exigir chute demais para lembrar o que o modelo realmente viu. As fontes de contexto agora mostram o material que alimenta o composer e rastreiam essa trilha com mais clareza, então as edições de acompanhamento parecem fundamentadas em vez de nebulosas.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>O histórico de versões HTML deixa você comparar, recuperar e continuar avançando — o rascunho anterior nunca é uma porta de mão única.</figcaption>
      </figure>

      <h2>Sistemas de design viram material de trabalho</h2>
      <p>Em vez de garimpar entre capturas de tela, trechos de estilo e kits separados, você agora pode puxar um contexto de sistema mais rico direto para o flow. O <strong>plugin Design System Source Context</strong> traz o material do sistema para mais perto do design ativo, o <strong>Glass Design System UI Kit</strong> adiciona mais uma direção visual pronta para usar, e <strong>pré-visualizações ao vivo mais ricas com navegação em lightbox</strong> tornam grandes conjuntos de imagens mais fáceis de inspecionar e aplicar. Os sistemas de design estão virando algo com que você constrói, não apenas algo que você consulta.</p>

      <h2>A escolha de modelo para de esconder os trade-offs</h2>
      <p>Escolher um modelo costumava parecer um teste de memória: qual opção é mais nova, qual custa mais, e qual provedor está prestes a falhar por um pequeno motivo de configuração? <strong>As faixas de custo dos modelos Cloud, os preços renovados e um tratamento de erros de provedor mais limpo</strong> tornam escolher — e confiar em — um modelo bem menos às cegas. E trazer o seu próprio agora se encaixa em mais configurações do mundo real: o BYOK é roteado de forma mais limpa através do OpenCode, os endpoints de provedores internos são mais fáceis de permitir com segurança, e a autenticação local tem menos chance de ser mal interpretada como quebrada.</p>

      <h2>O trabalho em andamento é mais difícil de perder</h2>
      <p>Um stream caído, um recarregamento ou uma busca rápida ainda podiam tirar do ritmo uma boa sessão. A reconexão agora é mais resiliente, mensagens que pareciam ter falhado podem se reanexar quando a execução na verdade teve sucesso, o recarregamento da pré-visualização se comporta corretamente, e o composer se mantém mais firme durante a interação rápida. E quando algo realmente quebra, o Open Design deixa uma trilha melhor para trás: <strong>códigos de erro de exportação específicos, a procedência do workspace de execução e evidências empacotadas da cena da falha</strong> tornam as falhas mais fáceis de explicar, reproduzir e recuperar.</p>

      <h2>O que mais chega na 0.14.0</h2>
      <p>A versão é ampla. Mais algumas partes que vale a pena destacar:</p>
      <ul>
        <li><strong>Navegar pela comunidade parece menos aleatório</strong> — a galeria de templates ganhou uma ordenação "Em alta / Mais recentes", então o trabalho compartilhado fica mais fácil de explorar.</li>
        <li><strong>O site público continuou se localizando</strong> — páginas de comunidade e uma biblioteca de tutoriais maior chegaram em todas as localidades keep-11.</li>
        <li><strong>Uma página de carreiras e pontos de entrada de acesso de equipe mais fortes</strong> para quem avalia o Open Design com um grupo maior.</li>
        <li><strong>Uma porta de entrada mais clara e mais rápida</strong> — página inicial, preços e pontos de entrada de comunidade navegam mais rápido, com uma navegação mais forte e um posicionamento de planos atualizado.</li>
        <li><strong>O suporte a modelos e a comunicação de preços estão mais atuais</strong>, incluindo escolhas cloud renovadas e um elenco premium mais claro.</li>
      </ul>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você é…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o aplicativo desktop, conecte um agente (ou traga sua própria chave) e abra o plan mode — esboce a ideia antes de partir para uma construção completa</td></tr>
          <tr><td>Atrás de uma ideia vaga</td><td>Comece no plan mode com um esboço do Excalidraw, dê forma ao roteiro, e então entregue-o a uma execução</td></tr>
          <tr><td>Iterando em HTML</td><td>Edite à vontade — o histórico de versões deixa você comparar e recuperar, então nenhuma mudança é uma porta de mão única</td></tr>
          <tr><td>Construindo com um sistema de design</td><td>Puxe o contexto do sistema direto para o flow com o plugin Design System Source Context</td></tr>
          <tr><td>Comparando modelos</td><td>Confira as faixas de custo e os selos — preço e disponibilidade ficam visíveis antes de você se comprometer</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>Inspiração é barata de ter e cara de manter. A 0.14.0 gasta seu orçamento em mantê-la — o esboço, a fonte, o rascunho anterior, o fio que você quase perdeu. Baixe o aplicativo desktop, comece algo tosco de propósito, e note o quanto do pensamento inicial sobrevive até o trabalho finalizado.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>125 PRs em cinco dias, de 36 pessoas que cada uma impediu mais uma boa ideia de sumir no flow. Um movimento não é lançado a partir dos laptops de uma única equipe; ele é lançado por todos que apareceram e salvaram mais uma faísca. Nós vemos você. 🚀</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: continue no flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: sua marca é um sistema de design</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: o Bazar</a></li>
      </ul>
  it:
    title: 'Open Design 0.14.0: la macchina del tempo dell''ispirazione'
    summary: 'Tag open-design-v0.14.0 — 125 PR da 36 contributori in cinque giorni. Nome in codice "Inspiration Time Machine" (la macchina del tempo dell''ispirazione). Troppe buone idee svanivano ancora nel flow: uno schizzo promettente, una fonte utile, una versione precedente migliore, o l''istante esatto in cui una bozza ha cominciato a sbandare. La 0.14.0 mantiene viva una parte maggiore del lavoro — prima schizzi in plan mode, ripercorri gli input che alimentano il composer, torni indietro nella cronologia delle versioni HTML, e recuperi il filo invece di perdere la scintilla.'
    category: 'Prodotto'
    bodyHtml: |
      <p>Tag <code>open-design-v0.14.0</code>, rilasciato l'8 luglio 2026. <strong>125 PR da 36 contributori in cinque giorni.</strong> Nome in codice "Inspiration Time Machine" (la macchina del tempo dell'ispirazione). L'ultima release ha insegnato a Open Design a restare nel flow attraverso le interruzioni. Questa parla delle idee che il flow può ancora perdere: uno schizzo grezzo che non è mai atterrato da nessuna parte, la fonte che ha alimentato un buon risultato, una bozza precedente migliore, il momento in cui un'esecuzione ha cominciato a sbandare. La 0.14.0 mantiene viva una parte maggiore del lavoro così puoi tornare indietro e raccogliere di nuovo la scintilla.</p>
      <p>Vuoi il changelog completo? Lo trovi nelle <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">note di rilascio su GitHub</a>. Questo post è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Prima schizza, prima della vera costruzione</h2>
      <p>Saltare dritto da un pensiero a un prompt lungo faceva sembrare sfuggente l'esplorazione iniziale — l'idea si muoveva veloce, ma il piano di lavoro effettivo restava invisibile, così la prima esecuzione vera era spesso un tiro a indovinare sulla tua stessa intenzione. <strong>Il plan mode, con i flussi di schizzo di Excalidraw, dà prima a un'idea grezza un posto dove atterrare.</strong> Pensa per scalette, forme e passi successivi; dai forma al concetto dove puoi vederlo; e solo allora impegnati in una build completa.</p>
      <p>Il punto è che il caotico mezzo di un'idea ora ha una casa dentro Open Design invece di vivere nella tua testa o in una scheda lavagna separata. Abbozzi il piano, lo guardi fermarsi, e inizi la build da qualcosa che puoi davvero indicare.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Il plan mode e i flussi di schizzo di Excalidraw danno a un'idea grezza un posto dove atterrare prima che tu ti impegni in un'esecuzione completa.</figcaption>
      </figure>

      <h2>Un lavoro HTML in cui puoi tornare indietro</h2>
      <p>L'HTML generato o modificato prima sembrava fragile: cambialo una volta, e la forma precedente poteva sparire con esso. <strong>La cronologia delle versioni dei file HTML rende l'iterazione più sicura</strong> — confronta le versioni, recuperane una precedente, e continua ad andare avanti senza trattare ogni modifica come una porta a senso unico. La bozza migliore che avevi dieci minuti fa è ancora lì.</p>
      <p>Accanto a questo, <strong>il contesto del composer smette di nascondersi dietro la risposta.</strong> Quando un risultato sembrava giusto o sbagliato, prima serviva troppo indovinare per ricordare cosa il modello avesse effettivamente visto. Le fonti di contesto ora mostrano il materiale che alimenta il composer e ne tracciano la scia più chiaramente, così le modifiche di follow-up sembrano fondate invece che sfocate.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>La cronologia delle versioni HTML ti lascia confrontare, recuperare e continuare ad andare avanti — la bozza precedente non è mai una porta a senso unico.</figcaption>
      </figure>

      <h2>I design system diventano materiale di lavoro</h2>
      <p>Invece di frugare tra screenshot, frammenti di stile e kit separati, ora puoi tirare un contesto di sistema più ricco direttamente nel flow. Il <strong>plugin Design System Source Context</strong> porta il materiale del sistema più vicino al design attivo, il <strong>Glass Design System UI Kit</strong> aggiunge un'altra direzione visiva pronta all'uso, e <strong>anteprime live più ricche con navigazione lightbox</strong> rendono i grandi set di immagini più facili da ispezionare e applicare. I design system si stanno trasformando in qualcosa con cui costruisci, non solo in qualcosa a cui fai riferimento.</p>

      <h2>La scelta del modello smette di nascondere i compromessi</h2>
      <p>Scegliere un modello prima sembrava un test di memoria: quale opzione è più nuova, quale costa di più, e quale provider sta per fallire per un piccolo motivo di configurazione? <strong>Le fasce di costo dei modelli Cloud, i prezzi rinfrescati e una gestione più pulita degli errori dei provider</strong> rendono la scelta — e la fiducia — di un modello molto meno alla cieca. E il porta-il-tuo ora si adatta a più configurazioni del mondo reale: il BYOK viene instradato in modo più pulito attraverso OpenCode, gli endpoint dei provider interni sono più facili da consentire in sicurezza, e l'autenticazione locale ha meno probabilità di essere fraintesa come rotta.</p>

      <h2>Il lavoro in corso è più difficile da perdere</h2>
      <p>Uno stream caduto, un ricaricamento o una ricerca veloce potevano ancora far perdere il ritmo a una buona sessione. La riconnessione ora è più resiliente, i messaggi che sembrano falliti possono riagganciarsi quando l'esecuzione in realtà è riuscita, il ricaricamento dell'anteprima si comporta correttamente, e il composer resta più stabile durante l'interazione veloce. E quando qualcosa si rompe davvero, Open Design lascia dietro di sé una scia migliore: <strong>codici di errore di esportazione specifici, la provenienza del workspace di esecuzione e prove impacchettate della scena del crash</strong> rendono i fallimenti più facili da spiegare, riprodurre e recuperare.</p>

      <h2>Cos'altro arriva nella 0.14.0</h2>
      <p>La release è ampia. Ancora qualche pezzo che vale la pena mettere in primo piano:</p>
      <ul>
        <li><strong>Sfogliare la community sembra meno casuale</strong> — la galleria dei template ha guadagnato un ordinamento "Di tendenza / Più recenti", così il lavoro condiviso è più facile da esplorare.</li>
        <li><strong>Il sito pubblico ha continuato a localizzarsi</strong> — pagine della community e una libreria di tutorial più grande sono atterrate in tutte le locale keep-11.</li>
        <li><strong>Una pagina carriere e punti d'ingresso più forti per l'accesso del team</strong> per chi valuta Open Design con un gruppo più ampio.</li>
        <li><strong>Una porta d'ingresso più chiara e più veloce</strong> — home page, prezzi e punti d'ingresso della community si sfogliano più velocemente, con una navigazione più forte e un posizionamento dei piani aggiornato.</li>
        <li><strong>Il supporto ai modelli e la comunicazione dei prezzi sono più attuali</strong>, comprese scelte cloud rinfrescate e una rosa premium più chiara.</li>
      </ul>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Inizia qui</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuovo su Open Design</td><td>Scarica l'app desktop, connetti un agent (oppure porta la tua chiave) e apri il plan mode — schizza l'idea prima di impegnarti in una build completa</td></tr>
          <tr><td>A caccia di un'idea nebulosa</td><td>Inizia in plan mode con uno schizzo Excalidraw, dai forma alla scaletta, poi consegnala a un'esecuzione</td></tr>
          <tr><td>In fase di iterazione su HTML</td><td>Modifica liberamente — la cronologia delle versioni ti lascia confrontare e recuperare, così nessuna modifica è una porta a senso unico</td></tr>
          <tr><td>In costruzione con un design system</td><td>Tira il contesto del sistema direttamente nel flow con il plugin Design System Source Context</td></tr>
          <tr><td>In fase di confronto tra modelli</td><td>Controlla le fasce di costo e i badge — prezzo e disponibilità sono visibili prima che tu ti impegni</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>L'ispirazione è economica da avere e costosa da conservare. La 0.14.0 spende il suo budget nel conservarla — lo schizzo, la fonte, la bozza precedente, il filo che hai quasi perso. Scarica l'app desktop, inizia qualcosa di grezzo di proposito, e nota quanto del pensiero iniziale sopravvive fino al lavoro finito.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>125 PR in cinque giorni, da 36 persone che ciascuna ha impedito a un'altra buona idea di svanire nel flow. Un movimento non viene rilasciato dai laptop di un solo team; viene rilasciato da tutti quelli che si sono presentati e hanno salvato un'altra scintilla. Vi vediamo. 🚀</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: resta nel flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: il tuo brand è un design system</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: il Bazaar</a></li>
      </ul>
  tr:
    title: 'Open Design 0.14.0: ilham zaman makinesi'
    summary: 'Etiket open-design-v0.14.0 — beş günde 36 katkıda bulunandan 125 PR. Kod adı "Inspiration Time Machine" (ilham zaman makinesi). Hâlâ çok fazla iyi fikir akışın içinde kayboluyordu: umut vaat eden bir eskiz, işe yarar bir kaynak, daha iyi bir önceki sürüm ya da bir taslağın sapmaya başladığı tam o an. 0.14.0 işin daha büyük bir kısmını canlı tutuyor — önce plan mode''da eskiz yapın, composer''ı besleyen girdileri izleyin, HTML sürüm geçmişinde geri gidin ve kıvılcımı kaybetmek yerine ipin ucunu yeniden yakalayın.'
    category: 'Ürün'
    bodyHtml: |
      <p>Etiket <code>open-design-v0.14.0</code>, 8 Temmuz 2026'da yayınlandı. <strong>Beş günde 36 katkıda bulunandan 125 PR.</strong> Kod adı "Inspiration Time Machine" (ilham zaman makinesi). Son sürüm Open Design'a kesintiler boyunca akışta kalmayı öğretti. Bu sürüm ise akışın hâlâ kaybedebileceği fikirlerle ilgili: hiçbir yere konmamış kaba bir eskiz, iyi bir sonucu besleyen kaynak, daha iyi bir önceki taslak, bir çalıştırmanın sapmaya başladığı an. 0.14.0 işin daha büyük bir kısmını canlı tutuyor, böylece geri dönüp kıvılcımı yeniden alabilirsiniz.</p>
      <p>Tam değişiklik günlüğünü mü istiyorsunuz? <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0">GitHub'daki sürüm notlarında</a> bulunuyor. Bu yazı kısa versiyon: kaputun altında ne değişti, bununla bugün ne yapabilirsiniz ve nereden başlamalısınız.</p>

      <h2>Gerçek yapıdan önce, önce eskiz</h2>
      <p>Bir düşünceden doğrudan uzun bir isteme atlamak, erken keşfi kaygan hissettiriyordu — fikir hızlı hareket ediyordu ama asıl çalışma planı görünmez kalıyordu, bu yüzden ilk gerçek çalıştırma çoğu zaman kendi niyetiniz hakkında bir tahmindi. <strong>Plan mode, Excalidraw eskiz akışlarıyla birlikte, kaba bir fikre önce konacak bir yer verir.</strong> Ana hatlar, şekiller ve sonraki adımlarla düşünün; kavramı görebildiğiniz yerde şekillendirin; ve ancak o zaman tam bir yapıya girişin.</p>
      <p>Önemli olan şu: bir fikrin dağınık orta bölgesi artık kafanızın içinde ya da ayrı bir beyaz tahta sekmesinde yaşamak yerine Open Design içinde bir yuvaya sahip. Planı taslak olarak çizersiniz, onun yerinde durmasını izlersiniz ve yapıya gerçekten işaret edebileceğiniz bir şeyden başlarsınız.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Plan mode ve Excalidraw eskiz akışları, tam bir çalıştırmaya girişmeden önce kaba bir fikre konacak bir yer verir.</figcaption>
      </figure>

      <h2>Geri gidebileceğiniz HTML çalışması</h2>
      <p>Üretilen veya düzenlenen HTML eskiden kırılgan hissettiriyordu: bir kez değiştirin, önceki biçim onunla birlikte kaybolabilirdi. <strong>HTML dosyası sürüm geçmişi yinelemeyi daha güvenli kılar</strong> — sürümleri karşılaştırın, daha eskisini geri getirin ve her düzenlemeyi tek yönlü bir kapı gibi ele almadan ilerlemeye devam edin. On dakika önce sahip olduğunuz daha iyi taslak hâlâ orada.</p>
      <p>Bunun yanı sıra, <strong>composer bağlamı cevabın arkasına saklanmayı bırakıyor.</strong> Bir sonuç doğru ya da yanlış göründüğünde, modelin gerçekte ne gördüğünü hatırlamak eskiden çok fazla tahmin gerektiriyordu. Bağlam kaynakları artık composer'ı besleyen materyali gösteriyor ve o izi daha net takip ediyor, böylece takip düzenlemeleri bulanık değil sağlam temelli hissettiriyor.</p>
      <figure>
        <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>HTML sürüm geçmişi karşılaştırmanıza, geri getirmenize ve ilerlemeye devam etmenize olanak tanır — önceki taslak asla tek yönlü bir kapı değildir.</figcaption>
      </figure>

      <h2>Tasarım sistemleri çalışma malzemesine dönüşüyor</h2>
      <p>Ekran görüntüleri, stil parçacıkları ve ayrı kitler arasında aramak yerine, artık daha zengin bir sistem bağlamını doğrudan akışa çekebilirsiniz. <strong>Design System Source Context eklentisi</strong> sistem malzemesini etkin tasarıma yaklaştırır, <strong>Glass Design System UI Kit</strong> kullanıma hazır bir başka görsel yön ekler ve <strong>ışık kutusu (lightbox) gezinmeli daha zengin canlı önizlemeler</strong> büyük görsel kümelerini incelemeyi ve uygulamayı kolaylaştırır. Tasarım sistemleri yalnızca başvurduğunuz bir şey değil, onunla inşa ettiğiniz bir şeye dönüşüyor.</p>

      <h2>Model seçimi ödünleşimleri gizlemeyi bırakıyor</h2>
      <p>Bir model seçmek eskiden bir hafıza testi gibi hissettiriyordu: hangi seçenek daha yeni, hangisi daha pahalı ve hangi sağlayıcı küçük bir yapılandırma nedeniyle birazdan başarısız olacak? <strong>Cloud model maliyet katmanları, yenilenmiş fiyatlandırma ve daha temiz sağlayıcı hata işleme</strong> bir modeli seçmeyi — ve ona güvenmeyi — çok daha az körlemesine hâle getiriyor. Ve kendi anahtarını getirme artık daha fazla gerçek dünya kurulumuna uyuyor: BYOK, OpenCode üzerinden daha temiz yönlendiriliyor, dahili sağlayıcı uç noktalarına güvenli şekilde izin vermek daha kolay ve yerel kimlik doğrulamanın bozuk olarak yanlış okunma olasılığı daha düşük.</p>

      <h2>Devam eden işi kaybetmek daha zor</h2>
      <p>Düşen bir akış, bir yeniden yükleme veya hızlı bir arama, iyi bir oturumu yine de ritminden çıkarabiliyordu. Yeniden bağlanma artık daha dayanıklı, başarısız görünen mesajlar çalıştırma aslında başarılı olduğunda yeniden iliştirilebiliyor, önizleme yeniden yüklemesi düzgün davranıyor ve composer hızlı etkileşim sırasında daha kararlı kalıyor. Ve bir şey gerçekten bozulduğunda, Open Design arkasında daha iyi bir iz bırakıyor: <strong>belirli dışa aktarma hata kodları, çalıştırma çalışma alanının kökeni ve paketlenmiş çökme yeri kanıtları</strong> başarısızlıkları açıklamayı, yeniden üretmeyi ve kurtarmayı kolaylaştırıyor.</p>

      <h2>0.14.0'da başka neler var</h2>
      <p>Sürüm geniş kapsamlı. Öne çıkarılmaya değer birkaç parça daha:</p>
      <ul>
        <li><strong>Topluluğa göz atmak daha az rastgele geliyor</strong> — şablon galerisi "Trend / En Yeni" sıralaması kazandı, böylece paylaşılan işi keşfetmek daha kolay.</li>
        <li><strong>Herkese açık site yerelleştirilmeye devam etti</strong> — topluluk sayfaları ve daha büyük bir eğitim kütüphanesi keep-11 dillerinin tümüne indi.</li>
        <li><strong>Bir kariyer sayfası ve daha güçlü takım erişim giriş noktaları</strong> — Open Design'ı daha geniş bir grupla değerlendiren kişiler için.</li>
        <li><strong>Daha net, daha hızlı bir ön kapı</strong> — ana sayfa, fiyatlandırma ve topluluk giriş noktaları daha hızlı geziliyor, daha güçlü gezinme ve güncellenmiş plan konumlandırmasıyla.</li>
        <li><strong>Model desteği ve fiyat iletişimi daha güncel</strong>, yenilenmiş cloud seçenekleri ve daha net bir premium kadro dâhil.</li>
      </ul>

      <h2>Bununla bugün ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer şuysanız…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'da yeni</td><td>Masaüstü uygulamasını indirin, bir agent bağlayın (ya da kendi anahtarınızı getirin) ve plan mode'u açın — tam bir yapıya girişmeden önce fikri eskizleyin</td></tr>
          <tr><td>Bulanık bir fikrin peşinde</td><td>Plan mode'da bir Excalidraw eskiziyle başlayın, ana hattı şekillendirin, sonra onu bir çalıştırmaya teslim edin</td></tr>
          <tr><td>HTML üzerinde yineleme yapıyor</td><td>Serbestçe düzenleyin — sürüm geçmişi karşılaştırmanıza ve geri getirmenize izin verir, böylece hiçbir değişiklik tek yönlü bir kapı değildir</td></tr>
          <tr><td>Bir tasarım sistemiyle inşa ediyor</td><td>Design System Source Context eklentisiyle sistem bağlamını doğrudan akışa çekin</td></tr>
          <tr><td>Modelleri karşılaştırıyor</td><td>Maliyet katmanlarına ve rozetlere bakın — fiyat ve kullanılabilirlik siz girişmeden önce görünür</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne yapmalı</h2>
      <p>İlham, sahip olması ucuz ama elde tutması pahalıdır. 0.14.0 bütçesini onu elde tutmaya harcıyor — eskiz, kaynak, önceki taslak, az kalsın kaybedeceğiniz ipin ucu. Masaüstü uygulamasını indirin, bilerek kaba bir şeyle başlayın ve erken düşüncenin ne kadarının bitmiş işe kadar hayatta kaldığına dikkat edin.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indirin</a>.</p>
      <p>Beş günde 125 PR, her biri bir iyi fikri daha akışın içinde kaybolmaktan koruyan 36 kişiden. Bir hareket tek bir ekibin dizüstü bilgisayarlarından çıkmaz; ortaya çıkıp bir kıvılcımı daha kurtaran herkesten çıkar. Sizi görüyoruz. 🚀</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: akışta kalın</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: markanız bir tasarım sistemidir</a></li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: Pazar Yeri</a></li>
      </ul>
---

Tag `open-design-v0.14.0`, published on July 8, 2026. **125 PRs from 36 contributors in five days.** Codename "Inspiration Time Machine." The last release taught Open Design to stay in flow across interruptions. This one is about the ideas that flow can still lose: a rough sketch that never landed anywhere, the source that fed a good result, a better earlier draft, the moment a run started to drift. 0.14.0 keeps more of the work alive so you can go back and pick the spark up again.

Want the full changelog? It lives in the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.14.0). This is the short version: what changed underneath, what you can do with it today, and where to start.

## Sketch first, before the real build

Jumping straight from a thought to a long prompt made early exploration feel slippery — the idea moved fast, but the working plan stayed invisible, so the first real run was often a guess at your own intent. **Plan mode, with Excalidraw sketch flows, gives a rough idea somewhere to land first.** Think in outlines, shapes, and next steps; shape the concept where you can see it; and only then commit to a full build.

The point is that the messy middle of an idea now has a home inside Open Design instead of living in your head or a separate whiteboard tab. You draft the plan, watch it hold still, and start the build from something you can actually point at.

<figure>
  <img src="/blog/open-design-0-14-0-inspiration-time-machine-plan.webp" alt="A loose Excalidraw-style sketch of boxes and arrows resolving into a structured plan outline, the plan shown as a calm sage-green interface in a warm editorial illustration" />
  <figcaption>Plan mode and Excalidraw sketch flows give a rough idea somewhere to land before you commit to a full run.</figcaption>
</figure>

## HTML work you can step back through

Generated or edited HTML used to feel fragile: change it once, and the previous shape could disappear with it. **HTML file version history makes iteration safer** — compare versions, recover an earlier one, and keep moving without treating every edit as a one-way door. The better draft you had ten minutes ago is still there.

Alongside it, **composer context stops hiding behind the answer.** When a result looked right or wrong, it used to take too much guessing to remember what the model actually saw. Context sources now show the material feeding the composer and track that trail more clearly, so follow-up edits feel grounded instead of fuzzy.

<figure>
  <img src="/blog/open-design-0-14-0-inspiration-time-machine-history.webp" alt="A stack of HTML document versions arranged along a timeline with a step-back arrow returning to an earlier version, the recovered version shown as a calm sage-green interface in a warm editorial illustration" />
  <figcaption>HTML version history lets you compare, recover, and keep moving — the earlier draft is never a one-way door.</figcaption>
</figure>

## Design systems become working material

Instead of hunting across screenshots, style snippets, and separate kits, you can now pull richer system context straight into the flow. The **Design System Source Context plugin** brings system material closer to the active design, the **Glass Design System UI Kit** adds another ready-to-use visual direction, and **richer live previews with lightbox browsing** make large image sets easier to inspect and apply. Design systems are turning into something you build with, not just something you reference.

## Model choices stop hiding the trade-offs

Picking a model used to feel like a memory test: which option is newer, which one costs more, and which provider is about to fail for a small configuration reason? **Cloud model cost tiers, refreshed pricing, and cleaner provider error handling** make choosing — and trusting — a model a lot less blind. And bring-your-own now fits more real-world setups: BYOK routes more cleanly through OpenCode, internal provider endpoints are easier to allow safely, and local auth is less likely to be misread as broken.

## Live work is harder to lose

A dropped stream, a reload, or a quick search could still knock a good session out of rhythm. Reconnection is more resilient now, failed-looking messages can reattach when the run actually succeeded, preview reload behaves properly, and the composer stays steadier during fast interaction. And when something does break, Open Design leaves a better trail behind: **specific export error codes, run workspace provenance, and packaged crash-scene evidence** make failures easier to explain, reproduce, and recover from.

## What else lands in 0.14.0

The release is broad. A few more worth calling out:

- **Community browsing feels less random** — the templates gallery gained Trending / Newest sorting, so shared work is easier to explore.
- **The public site kept localizing** — community pages and a larger tutorial library landed across the keep-11 locales.
- **A careers page and stronger team-access entry points** for people evaluating Open Design with a wider group.
- **A clearer, faster front door** — homepage, pricing, and community entry points browse faster, with stronger navigation and updated plan positioning.
- **Model support and pricing communication are more current**, including refreshed cloud choices and a clearer premium roster.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app, connect an agent (or bring your own key), and open Plan mode — sketch the idea before you commit to a full build |
| Chasing a fuzzy idea | Start in Plan mode with an Excalidraw sketch, shape the outline, then hand it to a run |
| Iterating on HTML | Edit freely — version history lets you compare and recover, so no change is a one-way door |
| Building with a design system | Pull system context straight into the flow with the Design System Source Context plugin |
| Comparing models | Check the cost tiers and badges — price and availability are visible before you commit |

## What to do next

Inspiration is cheap to have and expensive to keep. 0.14.0 spends its budget on keeping it — the sketch, the source, the earlier draft, the thread you almost lost. Download the desktop app, start something rough on purpose, and notice how much of the early thinking survives to the finished work.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

125 PRs in five days, from 36 people who each kept one more good idea from vanishing into the flow. A movement doesn't ship from one team's laptops; it ships from everyone who showed up and saved one more spark. We see you. 🚀

## Related reading

- [Open Design 0.13.0: stay in flow](/blog/open-design-0-13-0-stay-in-flow/)
- [Open Design 0.12.0: your brand is a design system](/blog/open-design-0-12-0-brand-backed-design-system/)
- [Open Design 0.11.0: the Bazaar](/blog/open-design-0-11-0-the-bazaar/)
