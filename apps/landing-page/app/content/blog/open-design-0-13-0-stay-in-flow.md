---
title: "Open Design 0.13.0: stay in flow"
date: 2026-07-02
category: "Product"
readingTime: 7
summary: "Tag open-design-v0.13.0 — 116 PRs from 26 contributors in six days. Codename \"Stay in Flow.\" Long design sessions used to break on every interruption: a run lost its place, a model picker made you guess, a Cloud balance check hid behind a retry, a finished deck needed one more export detour. 0.13.0 turns those into a calmer loop — resume the work, see what's happening, pick the right model faster, and hand off real files without leaving Open Design."
i18n:
  zh:
    title: 'Open Design 0.13.0：保持心流'
    summary: '标签 open-design-v0.13.0 —— 六天内 26 位贡献者提交了 116 个 PR。代号「保持心流」。长时间的设计会话曾经会在每一次中断时被打断：一次运行会跑丢进度、模型选择器让你只能瞎猜、Cloud 余额检查藏在一次重试背后、做完的演示文稿还要多绕一步才能导出。0.13.0 把这些都变成了一个更从容的循环——恢复工作、看清正在发生什么、更快地选对模型，并且不必离开 Open Design 就能交出真实的文件。'
    bodyHtml: |
      <p>标签 <code>open-design-v0.13.0</code>，于 2026 年 7 月 2 日发布。<strong>六天内 26 位贡献者提交了 116 个 PR。</strong>代号「保持心流」。过去几次发布教会了 Open Design 为<em>你</em>设计、捕获你的品牌、把货架摆满。这一次讲的是两者之间的节奏：那些曾经会打断一次会话、让下一条提示感觉像是从头再来的小小中断。</p>
      <p>想看完整版本，可以查阅 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">GitHub 上的发布说明</a>。本文是精简版：底层改了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>恢复会话，而不是重新搭建它</h2>
      <p>这是本次发布的头牌。过去，长时间的设计会话会因每一次中断而受罚——切换工具、稍后回来，下一轮对话可能会感觉像冷启动，因为那次运行已经跑丢了自己的位置。<strong>原生会话恢复现在能让 Codex、OpenCode、Pi 和 Open Design Cloud 的运行跨轮次保持连接</strong>，让后续工作从同一条实时线程继续，而不是从一份重建的近似版本继续。</p>
      <p>在底层，运行现在带有生命周期追踪和已改动文件追踪，因此重新打开一个会话时，它知道自己当时在做什么、又改动了什么。效果很简单：你可以离开，再回来，而不必为此付出代价。</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="两个对话气泡被一条不间断的线连接起来，这条线在时间线上的一处缺口间划出弧线，重新连接的线被框在一个绿色选择框内，背景为近白色的编辑风底色" />
        <figcaption>原生恢复让同一条实时线程在中断之间保持连接——下一轮对话不会冷重启。</figcaption>
      </figure>

      <h2>表现得像交付物的导出</h2>
      <p>完成的作品离开工作区时，应该是一份真实的文件，而不是一道生产工序。0.13.0 加入了<strong>程序化、以截图为底的 PPTX 与 PDF 导出</strong>，让一份做完的 HTML 演示文稿或文档，能直接变成可以发送的东西。演示文稿的键盘导航也不再一次跳两张幻灯片，因此导出之前的检查不再是一场跟方向键的搏斗。</p>
      <p>关键在于，导出路径现在感觉像是一次交接。你在 Open Design 里构建，交付物从另一端出来时已经准备好可以分享。</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="一套做完的幻灯片从画布上抬起，分裂成一个 PPTX 文件和一个 PDF 文件，这两个输出文件被框在一个绿色选择框内，背景为近白色的编辑风底色" />
        <figcaption>一套做完的演示文稿直接导出为以截图为底的 PPTX 与 PDF——更接近交接，而不是另一道单独的生产工序。</figcaption>
      </figure>

      <h2>带上你自己的密钥，不必再去考古</h2>
      <p>带上自己的密钥应该是一种选择，而不是在服务商的怪癖和模型名称里挖掘。<strong>BYOK 服务商预设</strong>让配置更容易被发现，而 CLI 和 BYOK 两条流程的首个产物交接也都更干净了。</p>
      <p>模型选择在变得更广泛的同时也变得更不容易出错：Open Design 现在能识别独立的 Codex 应用程序包、附带了更新版本的 Vela CLI、支持 Mimo Code，并修复了会因环境原因让 agent 设置失败的 Cogito 输出上限问题。更少的配置会以耸肩收场。</p>

      <h2>出错时，一个更好的起点</h2>
      <p>那个什么都往里装的 <code>execution_failed</code>，正在持续让位给<strong>会说出自己原因</strong>的失败——启动崩溃、恢复会话过期、agent 卡在工具循环里、服务商配置过期——这样你就知道该重试还是该上报。更清晰的任务失败卡片、更简单的错误来源诊断，以及不再超过 100% 的缓存计数，让一次失败或恢复的运行更容易理解，而不必把 UI 变成一个日志查看器。</p>
      <p>Open Design Cloud 在金钱这件事上得到了同样的对待：设置卡片更清楚地显示钱包状态、把操作保持在同一处、恢复了后续处理，并提升了重试状态的可见度，这样一次临时的余额查询读起来是可恢复的，而不是一头雾水。</p>

      <h2>0.13.0 中还有什么</h2>
      <p>这次发布覆盖面很广。值得拎出来说的几块：</p>
      <ul>
        <li><strong>团队与官方渠道更容易找到了。</strong> Workspace-for-Teams 有了一个可见的入口，以及一个面向企业的线索页面，产品/资源导航也不太会再抢走你本来想点开的那个页面的点击。</li>
        <li><strong>官方社交链接补齐了</strong> —— Instagram、LinkedIn 和小红书，再加上刷新过的 Discord。</li>
        <li><strong>设计系统预览变得更丰富、也更可信了</strong> —— 品牌页面在预取之后仍可预览，丰富的设计系统标签更容易扫读，徽标预览的表现正常了，随附的插件示例也会以真实项目的形式打开。</li>
        <li><strong>Azure 部署支持</strong>，面向在 Azure App Service 或 ACI 上运行 Open Design 的团队。</li>
        <li><strong>一个更从容的桌面端</strong> —— 启动画面始终一致地显示「Open Design」，并使用对深色模式友好的卡片 token。</li>
        <li><strong>一项安全修复</strong>，覆盖多处子进程调用，稳定版发布的发布流程也已恢复，让发布能从「空跑校验」推进到真正面向公众的构建。</li>
      </ul>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用，连接一个 agent（或者通过全新的预设带上你自己的密钥），然后开始一个项目——现在的设置更容易被发现了</td></tr>
          <tr><td>正深陷一次长会话</td><td>继续做下去就好——Codex、OpenCode、Pi 和 Cloud 的运行现在会跨轮次恢复，而不是冷启动</td></tr>
          <tr><td>要交付一套演示文稿或一份文档</td><td>先把它构建出来，再直接导出为以截图为底的 PPTX 或 PDF——不需要另外绕一道生产工序</td></tr>
          <tr><td>在使用 Open Design Cloud</td><td>看看设置卡片——钱包余额、重试和下一步都清晰可见，不再藏在一次重试背后</td></tr>
          <tr><td>遇到一次失败的运行</td><td>读一读失败卡片——它现在会说出原因，而可恢复的运行会自行退避并重试</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>一个设计工具的信任，是在那些缝隙里赢得的：中断的那一刻、交接的那一刻、运行失败的那一刻、你回来的那一刻。0.13.0 把预算都花在了这些缝隙上，好让会话在它们周围保持存活。下载桌面应用，开始做一件真实的事，然后感受一下：当你离开又回来时，需要重建的东西有多么少。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>六天 116 个 PR，来自 26 个人，他们每个人都弥合了「我被打断了」和「我依然在心流里」之间的一处小小缝隙。一场运动不会从某一个团队的笔记本电脑里发布出来；它从那些挺身而出、又抚平了一处毛刺的人手中发布出来。我们看见你们了。🚀</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0：你的品牌就是一套设计系统</a> —— 本次发布让你在其之上保持心流的那次品牌捕获发布</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0：集市</a> —— 底下那次「画廊与欢迎」发布</li>
        <li><a href="/blog/what-is-vibe-design/">什么是 vibe design？</a> —— 关于「以意图来设计」更长的展开，也正是这些发布一直在延续的那套工作流</li>
      </ul>
  ja:
    title: 'Open Design 0.13.0：フローにとどまる'
    summary: 'タグ open-design-v0.13.0 — 6日間で26人のコントリビューターから116件のPR。コードネームは「フローにとどまる（Stay in Flow）」。長いデザインセッションは、以前はあらゆる中断でつまずいていました——実行が自分の位置を見失う、モデルピッカーで当てずっぽうを強いられる、Cloud の残高確認がリトライの裏に隠れる、完成したデッキにさらにもう一手間のエクスポート作業が要る。0.13.0 はそれらを、より落ち着いたループへと変えます——作業を再開し、何が起きているかを見て、より速く適切なモデルを選び、Open Design を離れることなく本物のファイルを受け渡せるように。'
    bodyHtml: |
      <p>タグ <code>open-design-v0.13.0</code>、2026年7月2日にリリース。<strong>6日間で26人のコントリビューターから116件のPR。</strong>コードネームは「フローにとどまる（Stay in Flow）」。ここ数回のリリースは、Open Design にあなたの<em>ために</em>デザインすること、あなたのブランドを捉えること、棚を埋めることを教えてきました。今回はその合間にあるリズムについての話です：セッションを壊し、次のプロンプトを最初からやり直すように感じさせていた、あの小さな中断のことです。</p>
      <p>詳細な変更履歴が読みたい方は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">GitHub のリリースノート</a>にあります。本記事は短縮版です：内部で何が変わったか、今日それで何ができるか、そしてどこから始めればよいか。</p>

      <h2>セッションを作り直すのではなく再開する</h2>
      <p>これが目玉です。長いデザインセッションは、これまであらゆる中断に罰を受けてきました——ツールを切り替え、あとで戻ってくると、実行が自分の位置を見失っているせいで、次のターンがコールドスタートのように感じられることがありました。<strong>ネイティブなセッション再開により、Codex、OpenCode、Pi、Open Design Cloud の実行がターンをまたいで接続されたままになる</strong>ので、フォローアップの作業は再構築された近似物ではなく、同じライブなスレッドから続きます。</p>
      <p>内部では、実行はいまやライフサイクルのトレースと変更ファイルの追跡を保持しているため、セッションを再度開いたとき、それが何をしていて何を変更したかが分かります。効果はシンプルです：立ち去って、また戻ってきても、そのための代償を払う必要がありません。</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="タイムラインの隙間をまたいで弧を描く、途切れないスレッドでつながれた2つの会話の吹き出し。再接続されたスレッドは緑の選択ボックスの中に収められ、ほぼ白のエディトリアルな背景に置かれている" />
        <figcaption>ネイティブな再開は、中断をまたいで同じライブなスレッドをつなげたままにします——次のターンでのコールド再起動はありません。</figcaption>
      </figure>

      <h2>成果物のように振る舞うエクスポート</h2>
      <p>完成した作業は、生産工程の手間としてではなく、本物のファイルとしてワークスペースを離れるべきです。0.13.0 は<strong>プログラム的で、スクリーンショットに基づく PPTX と PDF のエクスポート</strong>を追加し、完成した HTML デッキやドキュメントが、そのまま送れるものへと直接姿を変えます。デッキのキーボードナビゲーションもスライドを二重に飛ばさなくなったので、エクスポート前のレビューは、もはや矢印キーとの戦いではありません。</p>
      <p>要点は、エクスポートの経路がいまや受け渡しのように感じられることです。あなたは Open Design の中で作り、成果物は反対側から共有できる状態で出てきます。</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="完成したスライドデッキがキャンバスから持ち上がり、PPTX ファイルと PDF ファイルに分かれていく様子。2つの出力ファイルは緑の選択ボックスの中に収められ、ほぼ白のエディトリアルな背景に置かれている" />
        <figcaption>完成したデッキは、スクリーンショットに基づく PPTX と PDF へ直接エクスポートされます——別個の生産工程というより、受け渡しに近いものになりました。</figcaption>
      </figure>

      <h2>発掘作業なしで自分の鍵を持ち込む</h2>
      <p>自分の鍵を持ち込むことは、プロバイダーの癖やモデル名を掘り起こす作業ではなく、選択であるべきです。<strong>BYOK プロバイダーのプリセット</strong>により、セットアップが見つけやすくなり、CLI と BYOK の両方のフローで最初の成果物の受け渡しもよりすっきりしました。</p>
      <p>モデルの選択肢は、より広くなると同時に脆さも減りました：Open Design はいまやスタンドアロンの Codex アプリバンドルを認識し、より新しいバンドル済みの Vela CLI を同梱し、Mimo Code をサポートし、環境的な理由でエージェントのセットアップを失敗させかねなかった Cogito の出力上限を修正しました。肩をすくめて終わるセットアップは減りました。</p>

      <h2>何かが失敗したときの、より良い出発点</h2>
      <p>何でも一括りにしていた <code>execution_failed</code> は、<strong>その原因を名指しする</strong>失敗へと引き続き道を譲っています——起動時のクラッシュ、期限切れの再開、ツールループに陥ったエージェント、古いプロバイダー設定——ので、リトライすべきか、エスカレーションすべきかが分かります。よりくっきりしたタスク失敗カード、よりシンプルなエラー原因の診断、そしてもう 100% を超えないキャッシュ計算により、失敗または再開された実行が、UI をログビューアに変えることなく理解しやすくなりました。</p>
      <p>Open Design Cloud も、お金についても同じ扱いを受けました：設定カードはウォレットの状態をより明確に示し、操作をインラインに保ち、フォローアップの処理を復元し、リトライのステータスを前面に押し出すので、一時的な残高照会が謎めいたものではなく、回復可能なものとして読めます。</p>

      <h2>0.13.0 に含まれるその他の変更</h2>
      <p>このリリースは幅広い内容です。前面に押し出す価値のあるものはあと数点：</p>
      <ul>
        <li><strong>チームと公式チャンネルが見つけやすくなりました。</strong> Workspace-for-Teams には目に見える入口とエンタープライズ向けのリード獲得ページがあり、プロダクト／リソースのナビゲーションが、あなたが開こうとしていたページからクリックを奪う可能性が低くなりました。</li>
        <li><strong>公式ソーシャルリンクが追いつきました</strong>——Instagram、LinkedIn、小紅書（Xiaohongshu）、それに刷新された Discord。</li>
        <li><strong>デザインシステムのプレビューがより豊かに、より信頼できるようになりました</strong>——ブランドページはプリフェッチ後もプレビュー可能なままで、リッチなデザインシステムのチップは一目で把握しやすくなり、ロゴのプレビューは正しく動作し、同梱されたプラグインの例は本物のプロジェクトとして開きます。</li>
        <li><strong>Azure デプロイのサポート</strong>——Azure App Service や ACI 上で Open Design を運用するチーム向けです。</li>
        <li><strong>より落ち着いたデスクトップ</strong>——起動時のスプラッシュは一貫して「Open Design」と表示し、ダークモードに配慮したカードトークンを使用します。</li>
        <li><strong>セキュリティ修正</strong>——複数のサブプロセス呼び出しにわたるもので、安定版リリースの公開も復旧し、リリースがドライラン検証から実際の一般公開ビルドへと進めるようになりました。</li>
      </ul>

      <h2>今日それで何をするか</h2>
      <table>
        <thead>
          <tr><th>あなたが…</th><th>ここから始める</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design が初めて</td><td>デスクトップアプリをダウンロードし、エージェントを接続する（あるいは新しいプリセットで自分の鍵を持ち込む）、そしてプロジェクトを始めましょう——セットアップはいまやより見つけやすくなっています</td></tr>
          <tr><td>長いセッションの真っ最中</td><td>そのまま続けましょう——Codex、OpenCode、Pi、Cloud の実行はいまや、コールドスタートする代わりにターンをまたいで再開します</td></tr>
          <tr><td>デッキやドキュメントを出荷する</td><td>まず作り、それからスクリーンショットに基づく PPTX または PDF へ直接エクスポートしましょう——別個の生産工程に回り道する必要はありません</td></tr>
          <tr><td>Open Design Cloud を使っている</td><td>設定カードを確認しましょう——ウォレットの残高、リトライ、次のステップが、リトライの裏に隠れることなく見えるようになっています</td></tr>
          <tr><td>失敗した実行に見舞われた</td><td>失敗カードを読みましょう——いまや原因を名指ししており、回復可能な実行は自ら退避して再試行します</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>デザインツールへの信頼は、その隙間で獲得されます：中断の瞬間、受け渡しの瞬間、失敗した実行の瞬間、あなたが戻ってくる瞬間。0.13.0 はその予算をこれらの隙間に費やし、セッションがその周りで生き続けるようにします。デスクトップアプリをダウンロードし、何か本物のことを始めて、立ち去ってからまた戻ってきたときに、作り直す必要があるものがどれほど少ないかに気づいてください。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>6日間で116件のPR、それぞれが「中断された」と「まだフローの中にいる」のあいだにあるひとつの小さな隙間を埋めた26人から。ムーブメントは一つのチームのノートパソコンから出荷されるのではありません。現れて、もう一つの粗さを滑らかにした人々から出荷されるのです。私たちはあなたを見ています。🚀</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0：あなたのブランドはデザインシステムである</a> — 今回がその上でフローにとどまらせてくれる、ブランドキャプチャのリリース</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0：バザール</a> — その下にある、ギャラリーとウェルカムのリリース</li>
        <li><a href="/blog/what-is-vibe-design/">vibe design とは？</a> — 意図によってデザインすることについてのより長い考察。これらのリリースが生かし続けているワークフローです</li>
      </ul>
  ko:
    title: 'Open Design 0.13.0: 흐름 속에 머물기'
    summary: '태그 open-design-v0.13.0 — 6일 동안 26명의 기여자가 만든 116개의 PR. 코드명 "흐름 속에 머물기(Stay in Flow)". 긴 디자인 세션은 예전엔 매번 방해받을 때마다 끊겼습니다 — 실행이 자기 위치를 잃고, 모델 선택기 때문에 그저 짐작만 해야 하고, Cloud 잔액 확인은 재시도 뒤에 숨어 있고, 완성된 덱은 내보내려면 한 단계를 더 거쳐야 했죠. 0.13.0은 이것들을 더 차분한 루프로 바꿉니다 — 작업을 재개하고, 무슨 일이 일어나고 있는지 보고, 더 빠르게 올바른 모델을 고르고, Open Design을 떠나지 않고도 실제 파일을 건네줄 수 있게요.'
    bodyHtml: |
      <p>태그 <code>open-design-v0.13.0</code>, 2026년 7월 2일 출시. <strong>6일 동안 26명의 기여자가 만든 116개의 PR.</strong> 코드명 "흐름 속에 머물기(Stay in Flow)". 지난 몇 번의 릴리스는 Open Design에게 당신을 <em>위해</em> 디자인하는 법, 당신의 브랜드를 캡처하는 법, 선반을 채우는 법을 가르쳤습니다. 이번 릴리스는 그 사이의 리듬에 관한 것입니다: 세션을 깨뜨리고 다음 프롬프트가 처음부터 다시 시작하는 것처럼 느껴지게 만들던 그 작은 방해들 말이죠.</p>
      <p>전체 변경 로그가 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">GitHub의 릴리스 노트</a>에 담겨 있습니다. 이 글은 짧은 버전입니다: 내부에서 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작하면 되는지.</p>

      <h2>세션을 다시 만드는 대신 재개하기</h2>
      <p>이것이 이번 릴리스의 간판입니다. 긴 디자인 세션은 예전엔 매번 방해받을 때마다 벌을 받았습니다 — 도구를 전환하고, 나중에 돌아오면, 실행이 자기 위치를 잃어버린 탓에 다음 턴이 콜드 스타트처럼 느껴질 수 있었죠. <strong>이제 네이티브 세션 재개가 Codex, OpenCode, Pi, Open Design Cloud의 실행을 턴 전반에 걸쳐 연결된 상태로 유지</strong>하므로, 후속 작업은 재구성된 근사치가 아니라 동일한 라이브 스레드에서 이어집니다.</p>
      <p>내부적으로 실행은 이제 라이프사이클 추적과 변경된 파일 추적을 함께 가지고 다니므로, 세션을 다시 열면 그것이 무엇을 하고 있었고 무엇을 변경했는지 알 수 있습니다. 효과는 단순합니다: 자리를 비웠다가 돌아와도 그에 대한 대가를 치를 필요가 없습니다.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="타임라인의 간격을 가로질러 호를 그리며 끊기지 않는 하나의 실로 연결된 두 개의 대화 말풍선. 다시 연결된 그 실이 녹색 선택 상자 안에 담겨, 거의 흰색에 가까운 편집 배경 위에 놓여 있다" />
        <figcaption>네이티브 재개는 방해 구간을 가로질러 동일한 라이브 스레드를 계속 연결된 상태로 유지합니다 — 다음 턴에서의 콜드 재시작이 없습니다.</figcaption>
      </figure>

      <h2>결과물처럼 행동하는 내보내기</h2>
      <p>완성된 작업은 생산 공정의 잡무가 아니라 실제 파일로서 작업 공간을 떠나야 합니다. 0.13.0은 <strong>프로그래밍 방식의, 스크린샷 기반 PPTX 및 PDF 내보내기</strong>를 추가하여, 완성된 HTML 덱이나 문서가 곧바로 보낼 수 있는 무언가로 바뀝니다. 덱 키보드 내비게이션도 더 이상 슬라이드를 두 칸씩 건너뛰지 않아서, 내보내기 전 검토가 더 이상 화살표 키와의 씨름이 아닙니다.</p>
      <p>핵심은 이제 내보내기 경로가 핸드오프처럼 느껴진다는 것입니다. 당신은 Open Design 안에서 만들고, 결과물은 반대편에서 공유할 준비를 마친 채로 나옵니다.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="완성된 슬라이드 덱이 캔버스에서 들려 올라와 PPTX 파일과 PDF 파일로 나뉘는 모습. 두 개의 출력 파일이 녹색 선택 상자 안에 담겨, 거의 흰색에 가까운 편집 배경 위에 놓여 있다" />
        <figcaption>완성된 덱은 스크린샷 기반 PPTX와 PDF로 곧바로 내보내집니다 — 별도의 생산 단계라기보다 핸드오프에 더 가깝습니다.</figcaption>
      </figure>

      <h2>발굴 작업 없이 자신의 키 가져오기</h2>
      <p>자신의 키를 가져오는 일은 공급자의 특이한 점과 모델 이름을 파헤치는 일이 아니라 하나의 선택이어야 합니다. <strong>BYOK 공급자 사전 설정</strong>이 설정을 더 쉽게 발견할 수 있게 해주고, CLI와 BYOK 흐름 모두에서 첫 산출물 핸드오프도 더 깔끔해졌습니다.</p>
      <p>모델 선택은 더 넓어지는 동시에 더 견고해졌습니다: Open Design은 이제 독립형 Codex 앱 번들을 인식하고, 더 새로운 번들 Vela CLI를 제공하며, Mimo Code를 지원하고, 환경적인 이유로 에이전트 설정을 실패하게 만들 수 있었던 Cogito 출력 상한을 수정했습니다. 어깨를 으쓱하며 끝나는 설정이 줄었습니다.</p>

      <h2>무언가 실패했을 때, 더 나은 출발점</h2>
      <p>모든 것을 뭉뚱그리던 <code>execution_failed</code>는 계속해서 <strong>원인을 이름으로 짚어주는</strong> 실패에 자리를 내주고 있습니다 — 시작 시 크래시, 만료된 재개, 도구 루프에 갇힌 에이전트, 오래된 제공자 설정 — 그래서 재시도할지 에스컬레이션할지 알 수 있습니다. 더 명확한 작업 실패 카드, 더 단순한 오류 원인 진단, 그리고 더 이상 100%를 넘지 않는 캐시 계산 덕분에, 실패했거나 재개된 실행을 UI를 로그 뷰어로 바꾸지 않고도 이해하기 쉬워졌습니다.</p>
      <p>Open Design Cloud도 돈에 관해서는 같은 대우를 받았습니다: 설정 카드가 지갑 상태를 더 명확하게 보여주고, 작업을 인라인으로 유지하며, 후속 처리를 복원하고, 재시도 상태를 앞세워서, 일시적인 잔액 조회가 알쏭달쏭하게 느껴지는 대신 복구 가능한 것으로 읽힙니다.</p>

      <h2>0.13.0에 또 무엇이 담겼나</h2>
      <p>이번 릴리스는 폭이 넓습니다. 앞으로 끌어올릴 만한 조각 몇 가지:</p>
      <ul>
        <li><strong>팀과 공식 채널을 더 쉽게 찾을 수 있습니다.</strong> Workspace-for-Teams에는 눈에 보이는 진입점과 엔터프라이즈 리드 페이지가 생겼고, 제품/리소스 내비게이션이 당신이 열려던 페이지에서 클릭을 가로챌 가능성이 줄었습니다.</li>
        <li><strong>공식 소셜 링크가 따라잡았습니다</strong> — Instagram, LinkedIn, 그리고 샤오홍슈(Xiaohongshu), 여기에 새로워진 Discord까지.</li>
        <li><strong>디자인 시스템 미리보기가 더 풍부해지고 더 신뢰할 수 있게 되었습니다</strong> — 브랜드 페이지는 프리페치 이후에도 미리보기가 가능하게 유지되고, 풍부한 디자인 시스템 칩은 훑어보기 더 쉬워졌으며, 로고 미리보기가 제대로 작동하고, 번들된 플러그인 예제가 실제 프로젝트로 열립니다.</li>
        <li><strong>Azure 배포 지원</strong> — Azure App Service나 ACI에서 Open Design을 운영하는 팀을 위한 것입니다.</li>
        <li><strong>더 차분해진 데스크톱</strong> — 시작 스플래시가 일관되게 "Open Design"이라고 표시하며, 다크 모드 친화적인 카드 토큰을 사용합니다.</li>
        <li><strong>보안 수정</strong>, 여러 서브프로세스 호출에 걸쳐 이루어졌고, 안정판 릴리스 게시도 복구되어 릴리스가 드라이런 검증에서 실제 공개 빌드로 넘어갈 수 있게 되었습니다.</li>
      </ul>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead>
          <tr><th>당신이…</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 다운로드하고, 에이전트를 연결하거나(또는 새 사전 설정을 통해 자신의 키를 가져오고), 프로젝트를 시작하세요 — 설정이 이제 더 쉽게 발견됩니다</td></tr>
          <tr><td>긴 세션에 깊이 빠져 있다면</td><td>그냥 계속하세요 — Codex, OpenCode, Pi, Cloud 실행이 이제 콜드 스타트하는 대신 턴 전반에 걸쳐 재개됩니다</td></tr>
          <tr><td>덱이나 문서를 출시한다면</td><td>만든 다음, 스크린샷 기반 PPTX나 PDF로 곧바로 내보내세요 — 별도의 생산 단계로 돌아갈 필요가 없습니다</td></tr>
          <tr><td>Open Design Cloud를 사용 중이라면</td><td>설정 카드를 확인하세요 — 지갑 잔액, 재시도, 다음 단계가 재시도 뒤에 숨는 대신 보입니다</td></tr>
          <tr><td>실패한 실행에 부딪혔다면</td><td>실패 카드를 읽어보세요 — 이제 원인을 이름으로 짚어주고, 복구 가능한 실행은 스스로 물러났다가 재시도합니다</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>디자인 도구에 대한 신뢰는 그 틈새에서 얻어집니다: 방해받는 순간, 핸드오프의 순간, 실패한 실행의 순간, 당신이 돌아오는 순간. 0.13.0은 세션이 그 주변에서 계속 살아 있도록 그 틈새들에 예산을 씁니다. 데스크톱 앱을 다운로드하고, 진짜 무언가를 시작하고, 자리를 비웠다가 돌아왔을 때 다시 만들어야 할 것이 얼마나 적은지 느껴보세요.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>6일 동안 116개의 PR, "방해받았다"와 "여전히 흐름 속에 있다" 사이의 작은 틈 하나씩을 각자 메운 26명에게서. 운동은 한 팀의 노트북에서 출시되지 않습니다; 나타나서 거친 모서리를 하나 더 다듬은 사람들에게서 출시됩니다. 우리는 당신을 보고 있습니다. 🚀</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: 당신의 브랜드가 곧 디자인 시스템</a> — 이번 릴리스가 그 위에서 당신을 흐름 속에 머물게 해주는, 브랜드 캡처 릴리스</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: 바자르</a> — 그 아래에 있는 갤러리-그리고-환영 릴리스</li>
        <li><a href="/blog/what-is-vibe-design/">바이브 디자인이란 무엇인가?</a> — 의도로 디자인하기에 대한 더 긴 이야기, 이 릴리스들이 계속 살아 있게 하는 그 워크플로</li>
      </ul>
  de:
    title: 'Open Design 0.13.0: im Flow bleiben'
    summary: 'Tag open-design-v0.13.0 — 116 PRs von 26 Mitwirkenden in sechs Tagen. Codename „Im Flow bleiben" (Stay in Flow). Lange Design-Sessions brachen früher bei jeder Unterbrechung ab: Ein Lauf verlor seinen Faden, ein Modell-Picker zwang zum Raten, eine Cloud-Guthabenprüfung versteckte sich hinter einem erneuten Versuch, ein fertiges Deck brauchte noch einen zusätzlichen Export-Umweg. 0.13.0 macht daraus eine ruhigere Schleife — Arbeit fortsetzen, sehen, was passiert, schneller das richtige Modell wählen und echte Dateien übergeben, ohne Open Design zu verlassen.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.13.0</code>, veröffentlicht am 2. Juli 2026. <strong>116 PRs von 26 Mitwirkenden in sechs Tagen.</strong> Codename „Im Flow bleiben" (Stay in Flow). Die letzten Releases haben Open Design beigebracht, <em>für</em> dich zu gestalten, deine Marke zu erfassen und die Regale zu füllen. Dieses hier dreht sich um den Rhythmus dazwischen: die kleinen Unterbrechungen, die früher eine Session zerstörten und den nächsten Prompt wie einen Neuanfang wirken ließen.</p>
      <p>Wenn du das vollständige Änderungsprotokoll willst, findest du es in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">Release Notes auf GitHub</a>. Dieser Beitrag ist die Kurzfassung: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Die Session fortsetzen, statt sie neu aufzubauen</h2>
      <p>Das ist das Glanzstück. Eine lange Design-Session wurde bislang für jede Unterbrechung bestraft — Tools wechseln, später zurückkommen, und der nächste Turn konnte sich wie ein Kaltstart anfühlen, weil der Lauf seinen Faden verloren hatte. <strong>Natives Session-Resume hält Codex-, OpenCode-, Pi- und Open-Design-Cloud-Läufe jetzt über Turns hinweg verbunden</strong>, sodass Folgearbeit vom selben Live-Thread weitergeht, statt von einer neu zusammengesetzten Annäherung daran.</p>
      <p>Unter der Haube tragen Läufe jetzt Lifecycle-Tracing und die Verfolgung berührter Dateien mit sich, sodass eine wiedereröffnete Session weiß, was sie getan und was sie verändert hat. Der Effekt ist einfach: Du kannst weggehen und zurückkommen, ohne dafür eine Steuer zu zahlen.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Zwei Gesprächsblasen, verbunden durch einen ununterbrochenen Faden, der sich über eine Lücke in der Zeitleiste bogenförmig spannt, der wiederverbundene Faden gerahmt in einem grünen Auswahlkasten vor einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Natives Resume hält denselben Live-Thread über Unterbrechungen hinweg verbunden — kein Kaltstart beim nächsten Turn.</figcaption>
      </figure>

      <h2>Exporte, die sich wie Liefergegenstände verhalten</h2>
      <p>Fertige Arbeit sollte den Arbeitsbereich als echte Datei verlassen, nicht als Produktionsaufgabe. 0.13.0 fügt <strong>programmatischen, screenshot-basierten PPTX- und PDF-Export</strong> hinzu, sodass ein fertiges HTML-Deck oder -Dokument direkt in etwas übergeht, das du verschicken kannst. Die Tastaturnavigation im Deck springt auch nicht mehr doppelt durch die Folien, sodass die Durchsicht vor dem Export kein Kampf mit den Pfeiltasten mehr ist.</p>
      <p>Der Punkt ist, dass sich der Export-Pfad jetzt wie eine Übergabe anfühlt. Du baust in Open Design, und der Liefergegenstand kommt auf der anderen Seite fertig zum Teilen heraus.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Ein fertiges Foliendeck hebt sich von der Leinwand ab und teilt sich in eine PPTX-Datei und eine PDF-Datei, die beiden Ausgabedateien gerahmt in einem grünen Auswahlkasten vor einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Ein fertiges Deck wird direkt als screenshot-basiertes PPTX und PDF exportiert — näher an einer Übergabe als an einem separaten Produktionsschritt.</figcaption>
      </figure>

      <h2>Bring deinen eigenen Schlüssel mit, ohne Archäologie</h2>
      <p>Den eigenen Schlüssel mitzubringen sollte eine Entscheidung sein, kein Graben durch Anbieter-Eigenheiten und Modellnamen. <strong>BYOK-Anbieter-Presets</strong> machen das Setup leichter auffindbar, und die Übergabe des ersten Artefakts ist sowohl für CLI- als auch für BYOK-Abläufe sauberer.</p>
      <p>Die Modellauswahl wurde zugleich breiter und weniger anfällig: Open Design erkennt jetzt das eigenständige Codex-App-Bundle, liefert eine neuere gebündelte Vela-CLI mit, unterstützt Mimo Code und behebt das Cogito-Ausgabelimit, das das Agent-Setup aus umgebungsbedingten Gründen scheitern lassen konnte. Weniger Setups enden mit einem Achselzucken.</p>

      <h2>Wenn etwas fehlschlägt, ein besserer Ausgangspunkt</h2>
      <p>Das Sammelbecken <code>execution_failed</code> weicht weiterhin Fehlern, die <strong>ihre Ursache benennen</strong> — ein Absturz beim Start, ein abgelaufener Resume, ein Agent, der in einer Tool-Schleife feststeckt, eine veraltete Anbieter-Konfiguration —, sodass du weißt, ob du es erneut versuchen oder eskalieren solltest. Klarere Task-Fehlerkarten, einfachere Diagnosen der Fehlerquelle und eine Cache-Abrechnung, die nicht mehr über 100 % hinausgeht, machen einen fehlgeschlagenen oder fortgesetzten Lauf leichter verständlich, ohne die UI in einen Log-Viewer zu verwandeln.</p>
      <p>Open Design Cloud bekam beim Thema Geld dieselbe Behandlung: Die Einstellungskarte zeigt den Wallet-Status klarer an, hält Aktionen inline, stellt die Folgebehandlung wieder her und hebt Retry-Status hervor, sodass eine vorübergehende Guthabenabfrage sich als behebbar liest statt als rätselhaft.</p>

      <h2>Was sonst noch in 0.13.0 landet</h2>
      <p>Das Release ist breit. Ein paar weitere Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
        <li><strong>Teams und offizielle Kanäle sind leichter zu finden.</strong> Workspace-for-Teams hat einen sichtbaren Einstiegspunkt und eine Enterprise-Lead-Seite, und die Produkt-/Ressourcen-Navigation stiehlt der Seite, die du eigentlich öffnen wolltest, seltener die Klicks.</li>
        <li><strong>Offizielle Social-Links haben aufgeholt</strong> — Instagram, LinkedIn und Xiaohongshu, plus ein aufgefrischtes Discord.</li>
        <li><strong>Designsystem-Vorschauen wurden reichhaltiger und vertrauenswürdiger</strong> — Markenseiten bleiben nach dem Prefetch weiterhin vorschaubar, reichhaltige Designsystem-Chips lassen sich leichter überfliegen, Logo-Vorschauen verhalten sich korrekt, und gebündelte Plugin-Beispiele öffnen sich als echte Projekte.</li>
        <li><strong>Azure-Deployment-Unterstützung</strong> für Teams, die Open Design auf Azure App Service oder ACI betreiben.</li>
        <li><strong>Ein ruhigerer Desktop</strong> — der Startbildschirm zeigt durchgängig „Open Design” an und verwendet dark-mode-freundliche Karten-Tokens.</li>
        <li><strong>Ein Sicherheitsfix</strong> über mehrere Subprozess-Aufrufe hinweg, und die Veröffentlichung stabiler Releases wurde wiederhergestellt, sodass Releases von der Dry-Run-Validierung zu echten öffentlichen Builds übergehen.</li>
      </ul>

      <h2>Was du heute damit machen kannst</h2>
      <table>
        <thead>
          <tr><th>Wenn du…</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>Neu bei Open Design bist</td><td>Lade die Desktop-App herunter, verbinde einen Agenten (oder bring über die neuen Presets deinen eigenen Schlüssel mit) und starte ein Projekt — das Setup ist jetzt leichter auffindbar</td></tr>
          <tr><td>Tief in einer langen Session steckst</td><td>Mach einfach weiter — Codex-, OpenCode-, Pi- und Cloud-Läufe setzen jetzt über Turns hinweg fort, statt kaltzustarten</td></tr>
          <tr><td>Ein Deck oder Dokument ausspielst</td><td>Baue es, dann exportiere direkt als screenshot-basiertes PPTX oder PDF — kein separater Produktionsumweg</td></tr>
          <tr><td>Auf Open Design Cloud unterwegs bist</td><td>Sieh dir die Einstellungskarte an — Wallet-Guthaben, Wiederholungen und nächste Schritte sind sichtbar, statt sich hinter einem erneuten Versuch zu verstecken</td></tr>
          <tr><td>Von einem fehlgeschlagenen Lauf getroffen wurdest</td><td>Lies die Fehlerkarte — sie benennt jetzt die Ursache, und behebbare Läufe warten ab und versuchen es von selbst erneut</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Ein Design-Tool gewinnt Vertrauen in den Lücken: der Unterbrechung, der Übergabe, dem fehlgeschlagenen Lauf, dem Moment, in dem du zurückkommst. 0.13.0 gibt sein Budget für genau diese Lücken aus, damit die Session um sie herum am Leben bleibt. Lade die Desktop-App herunter, fang etwas Echtes an, und bemerke, wie wenig du neu aufbauen musst, wenn du weggehst und zurückkehrst.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>116 PRs in sechs Tagen, von 26 Menschen, die jeweils eine kleine Lücke zwischen „ich wurde unterbrochen” und „ich bin immer noch im Flow” geschlossen haben. Eine Bewegung wird nicht von den Laptops eines einzelnen Teams ausgeliefert; sie wird von den Menschen ausgeliefert, die aufgetaucht sind und eine weitere raue Kante geglättet haben. Wir sehen euch. 🚀</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: deine Marke ist ein Designsystem</a> — das Marken-Erfassungs-Release, auf dem dieses aufbaut, um dich im Flow zu halten</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: der Basar</a> — das darunterliegende Galerie-und-Willkommen-Release</li>
        <li><a href="/blog/what-is-vibe-design/">Was ist Vibe Design?</a> — die ausführlichere Betrachtung des Gestaltens nach Absicht, der Workflow, den diese Releases am Leben halten</li>
      </ul>
  fr:
    title: 'Open Design 0.13.0 : rester dans le flow'
    summary: 'Tag open-design-v0.13.0 — 116 PR de 26 contributeurs en six jours. Nom de code « Rester dans le flow » (Stay in Flow). Les longues sessions de conception cassaient autrefois à chaque interruption : une exécution perdait le fil, un sélecteur de modèle vous forçait à deviner, une vérification du solde Cloud se cachait derrière une nouvelle tentative, un deck terminé nécessitait un détour d''export supplémentaire. La 0.13.0 transforme tout cela en une boucle plus sereine — reprenez le travail, voyez ce qui se passe, choisissez le bon modèle plus vite, et transmettez de vrais fichiers sans quitter Open Design.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.13.0</code>, publié le 2 juillet 2026. <strong>116 PR de 26 contributeurs en six jours.</strong> Nom de code « Rester dans le flow » (Stay in Flow). Les dernières versions ont appris à Open Design à concevoir <em>pour</em> vous, à capturer votre marque et à garnir les rayons. Celle-ci parle du rythme entre les deux : les petites interruptions qui cassaient autrefois une session et faisaient sentir le prompt suivant comme un nouveau départ.</p>
      <p>Vous voulez le changelog complet ? Il se trouve dans les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">notes de version sur GitHub</a>. Cet article est la version courte : ce qui a changé sous le capot, ce que vous pouvez en faire dès aujourd'hui, et par où commencer.</p>

      <h2>Reprendre la session plutôt que la reconstruire</h2>
      <p>C'est la vedette de cette version. Une longue session de conception était autrefois pénalisée par chaque interruption — changer d'outil, revenir plus tard, et le tour suivant pouvait ressembler à un démarrage à froid parce que l'exécution avait perdu le fil. <strong>La reprise native de session garde désormais les exécutions Codex, OpenCode, Pi et Open Design Cloud connectées d'un tour à l'autre</strong>, si bien que le travail de suivi continue depuis le même fil en direct plutôt que depuis une approximation reconstruite de celui-ci.</p>
      <p>Sous le capot, les exécutions portent désormais un traçage du cycle de vie et un suivi des fichiers touchés, si bien que rouvrir une session sait ce qu'elle faisait et ce qu'elle a modifié. L'effet est simple : vous pouvez partir et revenir sans en payer le prix.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Deux bulles de conversation reliées par un fil ininterrompu qui dessine un arc au-dessus d'un vide dans la chronologie, le fil reconnecté encadré à l'intérieur d'une boîte de sélection verte sur un fond éditorial presque blanc" />
        <figcaption>La reprise native garde le même fil en direct connecté à travers les interruptions — pas de redémarrage à froid au tour suivant.</figcaption>
      </figure>

      <h2>Des exports qui se comportent comme des livrables</h2>
      <p>Un travail terminé devrait quitter l'espace de travail sous forme de vrai fichier, pas comme une corvée de production. La 0.13.0 ajoute un <strong>export PPTX et PDF programmatique, basé sur des captures d'écran</strong>, si bien qu'un deck ou document HTML achevé se transforme directement en quelque chose que vous pouvez envoyer. La navigation au clavier dans le deck ne saute plus deux diapositives à la fois, si bien que la relecture avant l'export n'est plus un combat avec les flèches du clavier.</p>
      <p>L'essentiel est que le chemin d'export ressemble désormais à une passation. Vous construisez dans Open Design, et le livrable ressort de l'autre côté prêt à être partagé.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Un deck de diapositives terminé se soulevant du canevas et se divisant en un fichier PPTX et un fichier PDF, les deux fichiers de sortie encadrés à l'intérieur d'une boîte de sélection verte sur un fond éditorial presque blanc" />
        <figcaption>Un deck terminé s'exporte directement en PPTX et PDF basés sur des captures d'écran — plus proche d'une passation que d'une étape de production séparée.</figcaption>
      </figure>

      <h2>Apportez votre propre clé sans faire d'archéologie</h2>
      <p>Apporter ses propres clés devrait être un choix, pas une fouille dans les particularités des fournisseurs et les noms de modèles. Les <strong>préréglages de fournisseurs BYOK</strong> rendent la configuration plus facile à découvrir, et la passation du premier artefact est plus propre tant pour les flux CLI que BYOK.</p>
      <p>Le choix de modèle est devenu à la fois plus large et moins fragile : Open Design reconnaît désormais le bundle d'application Codex autonome, embarque une CLI Vela plus récente, prend en charge Mimo Code, et corrige le plafond de sortie de Cogito qui pouvait faire échouer la configuration d'un agent pour des raisons environnementales. Moins de configurations se terminent par un haussement d'épaules.</p>

      <h2>Quand quelque chose échoue, un meilleur point de départ</h2>
      <p>Le fourre-tout <code>execution_failed</code> continue de céder la place à des échecs qui <strong>nomment leur cause</strong> — un plantage au démarrage, une reprise expirée, un agent coincé dans une boucle d'outil, une configuration de fournisseur obsolète — pour que vous sachiez s'il faut réessayer ou escalader. Des cartes d'échec de tâche plus claires, des diagnostics de source d'erreur plus simples, et une comptabilité de cache qui ne dépasse plus 100 % rendent une exécution échouée ou reprise plus facile à comprendre sans transformer l'interface en visionneuse de logs.</p>
      <p>Open Design Cloud a reçu le même traitement pour l'argent : la carte de paramètres affiche l'état du portefeuille plus clairement, garde les actions en ligne, restaure le traitement de suivi et met en avant les statuts de nouvelle tentative, si bien qu'une vérification de solde transitoire se lit comme récupérable plutôt que mystérieuse.</p>

      <h2>Quoi d'autre arrive dans la 0.13.0</h2>
      <p>La version est vaste. Quelques éléments de plus qui méritent d'être mis en avant :</p>
      <ul>
        <li><strong>Les équipes et les canaux officiels sont plus faciles à trouver.</strong> Workspace-for-Teams dispose d'un point d'entrée visible et d'une page de génération de leads entreprise, et la navigation produit/ressources a moins tendance à voler des clics à la page que vous vouliez ouvrir.</li>
        <li><strong>Les liens sociaux officiels se sont mis à jour</strong> — Instagram, LinkedIn et Xiaohongshu, plus un Discord rafraîchi.</li>
        <li><strong>Les aperçus de systèmes de design sont devenus plus riches et plus fiables</strong> — les pages de marque restent prévisualisables après préchargement, les puces de système de design enrichies sont plus faciles à parcourir, les aperçus de logo se comportent correctement, et les exemples de plugins fournis s'ouvrent comme de vrais projets.</li>
        <li><strong>Prise en charge du déploiement Azure</strong> pour les équipes qui font fonctionner Open Design sur Azure App Service ou ACI.</li>
        <li><strong>Un bureau plus serein</strong> — l'écran de démarrage affiche systématiquement « Open Design » et utilise des tokens de carte adaptés au mode sombre.</li>
        <li><strong>Un correctif de sécurité</strong> sur plusieurs appels de sous-processus, et la publication des versions stables a été rétablie, si bien que les releases passent de la validation en mode simulation à de vraies builds publiques.</li>
      </ul>

      <h2>Quoi en faire dès aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau, connectez un agent (ou apportez votre propre clé via les nouveaux préréglages), et démarrez un projet — la configuration est désormais plus facile à découvrir</td></tr>
          <tr><td>Plongé dans une longue session</td><td>Continuez simplement — les exécutions Codex, OpenCode, Pi et Cloud reprennent désormais d'un tour à l'autre au lieu de redémarrer à froid</td></tr>
          <tr><td>En train de livrer un deck ou un document</td><td>Construisez-le, puis exportez directement en PPTX ou PDF basé sur des captures d'écran — pas de détour de production séparé</td></tr>
          <tr><td>Sur Open Design Cloud</td><td>Consultez la carte Paramètres — le solde du portefeuille, les nouvelles tentatives et les prochaines étapes sont visibles au lieu d'être cachés derrière une nouvelle tentative</td></tr>
          <tr><td>Confronté à une exécution échouée</td><td>Lisez la carte d'échec — elle nomme désormais la cause, et les exécutions récupérables temporisent et réessaient d'elles-mêmes</td></tr>
        </tbody>
      </table>

      <h2>Quoi faire ensuite</h2>
      <p>Un outil de conception gagne la confiance dans les interstices : l'interruption, la passation, l'exécution échouée, le moment où vous revenez. La 0.13.0 dépense son budget sur ces interstices pour que la session reste vivante autour d'eux. Téléchargez l'application de bureau, commencez quelque chose de réel, et remarquez à quel point vous avez peu à reconstruire quand vous vous éloignez puis revenez.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Téléchargez Open Design</a>.</p>
      <p>116 PR en six jours, de 26 personnes qui ont chacune comblé un petit écart entre « j'ai été interrompu » et « je suis toujours dans le flow ». Un mouvement ne se livre pas depuis les ordinateurs portables d'une seule équipe ; il se livre depuis les personnes qui se sont présentées et ont lissé une aspérité de plus. On vous voit. 🚀</p>

      <h2>Lectures associées</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0 : votre marque est un système de design</a> — la version de capture de marque sur laquelle celle-ci s'appuie pour vous garder dans le flow</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0 : le Bazar</a> — la version galerie-et-accueil en dessous</li>
        <li><a href="/blog/what-is-vibe-design/">Qu'est-ce que le vibe design ?</a> — la réflexion plus longue sur la conception par intention, le flux de travail que ces versions maintiennent en vie</li>
      </ul>
  ru:
    title: 'Open Design 0.13.0: оставаться в потоке'
    summary: 'Тег open-design-v0.13.0 — 116 PR от 26 контрибьюторов за шесть дней. Кодовое название «Оставаться в потоке» (Stay in Flow). Долгие дизайн-сессии раньше ломались на каждом прерывании: запуск терял своё место, выбор модели заставлял гадать, проверка баланса Cloud пряталась за повторной попыткой, готовая презентация требовала ещё одного обходного шага для экспорта. 0.13.0 превращает всё это в более спокойный цикл — продолжайте работу, видьте, что происходит, быстрее выбирайте нужную модель и передавайте настоящие файлы, не покидая Open Design.'
    bodyHtml: |
      <p>Тег <code>open-design-v0.13.0</code>, выпущен 2 июля 2026 года. <strong>116 PR от 26 контрибьюторов за шесть дней.</strong> Кодовое название «Оставаться в потоке» (Stay in Flow). Последние несколько релизов научили Open Design проектировать <em>для</em> вас, захватывать ваш бренд и заполнять полки. Этот — о ритме между ними: о мелких прерываниях, которые раньше ломали сессию и заставляли следующий запрос ощущаться как начало с нуля.</p>
      <p>Нужен полный список изменений? Он есть в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">примечаниях к релизу на GitHub</a>. Этот пост — краткая версия: что изменилось под капотом, что вы можете сделать с этим уже сегодня и с чего начать.</p>

      <h2>Возобновить сессию, а не перестраивать её</h2>
      <p>Это главная фишка. Долгая дизайн-сессия раньше наказывалась за каждое прерывание — переключаешь инструменты, возвращаешься позже, и следующий ход мог ощущаться как холодный старт, потому что запуск потерял своё место. <strong>Теперь нативное возобновление сессии держит запуски Codex, OpenCode, Pi и Open Design Cloud подключёнными между ходами</strong>, так что последующая работа продолжается с того же живого потока, а не с перестроенного приближения к нему.</p>
      <p>Под капотом запуски теперь несут трассировку жизненного цикла и отслеживание затронутых файлов, так что повторное открытие сессии знает, что она делала и что изменила. Эффект прост: вы можете уйти и вернуться, не платя за это налог.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Два пузыря переписки, соединённых непрерывной нитью, которая изгибается дугой над разрывом на временной шкале, воссоединённая нить обрамлена внутри зелёной рамки выделения на почти белом редакторском фоне" />
        <figcaption>Нативное возобновление держит один и тот же живой поток подключённым сквозь прерывания — без холодного перезапуска на следующем ходу.</figcaption>
      </figure>

      <h2>Экспорт, который ведёт себя как готовый результат</h2>
      <p>Завершённая работа должна покидать рабочее пространство как настоящий файл, а не как производственная рутина. 0.13.0 добавляет <strong>программный экспорт в PPTX и PDF на основе скриншотов</strong>, так что готовая HTML-презентация или документ напрямую превращается в то, что можно отправить. Клавиатурная навигация по презентации тоже перестала перескакивать через слайд, так что просмотр перед экспортом больше не борьба со стрелками.</p>
      <p>Суть в том, что путь экспорта теперь ощущается как передача. Вы строите в Open Design, а результат выходит с другой стороны уже готовым к тому, чтобы им поделиться.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Готовая презентация приподнимается над холстом и разделяется на файл PPTX и файл PDF, оба выходных файла обрамлены внутри зелёной рамки выделения на почти белом редакторском фоне" />
        <figcaption>Готовая презентация экспортируется напрямую в PPTX и PDF на основе скриншотов — это ближе к передаче, чем к отдельному производственному шагу.</figcaption>
      </figure>

      <h2>Принесите свой ключ без археологии</h2>
      <p>Принести свои ключи должно быть выбором, а не раскопками в особенностях провайдеров и названиях моделей. <strong>Пресеты провайдеров BYOK</strong> делают настройку более доступной для обнаружения, а передача первого артефакта стала чище как для потока CLI, так и для потока BYOK.</p>
      <p>Выбор модели одновременно стал шире и надёжнее: Open Design теперь распознаёт автономный пакет приложения Codex, поставляется с более новой встроенной CLI Vela, поддерживает Mimo Code и исправляет ограничение вывода Cogito, которое могло приводить к сбою настройки агента по экологическим (средовым) причинам. Меньше настроек заканчивается пожатием плечами.</p>

      <h2>Когда что-то идёт не так — лучшая отправная точка</h2>
      <p>Всеохватное «execution_failed» продолжает уступать место сбоям, которые <strong>называют свою причину</strong> — крах при старте, истечение возобновления, агент, застрявший в цикле инструмента, устаревшая конфигурация провайдера — так что вы знаете, повторить попытку или эскалировать. Более понятные карточки сбоя задачи, более простая диагностика источника ошибки и учёт кэша, который больше не превышает 100%, делают неудавшийся или возобновлённый запуск проще для понимания без превращения интерфейса в просмотрщик логов.</p>
      <p>Open Design Cloud получил такое же отношение к деньгам: карточка настроек яснее показывает состояние кошелька, держит действия на месте, восстанавливает обработку последующих шагов и выдвигает статусы повторных попыток на первый план, так что временная проверка баланса читается как поддающаяся восстановлению, а не как загадка.</p>

      <h2>Что ещё вошло в 0.13.0</h2>
      <p>Релиз обширный. Вот ещё несколько частей, которые стоит вынести вперёд:</p>
      <ul>
        <li><strong>Команды и официальные каналы стало проще найти.</strong> У Workspace-for-Teams появилась видимая точка входа и страница для корпоративных лидов, а навигация по продукту/ресурсам теперь реже перехватывает клики у страницы, которую вы хотели открыть.</li>
        <li><strong>Официальные ссылки на соцсети догнали остальное</strong> — Instagram, LinkedIn и Xiaohongshu, плюс обновлённый Discord.</li>
        <li><strong>Превью дизайн-систем стали богаче и надёжнее</strong> — страницы брендов остаются доступными для превью после предзагрузки, насыщенные чипы дизайн-систем легче просматривать, превью логотипов ведут себя корректно, а встроенные примеры плагинов открываются как настоящие проекты.</li>
        <li><strong>Поддержка развёртывания в Azure</strong> для команд, запускающих Open Design на Azure App Service или ACI.</li>
        <li><strong>Более спокойный десктоп</strong> — стартовый экран последовательно показывает «Open Design» и использует токены карточек, дружественные к тёмному режиму.</li>
        <li><strong>Исправление безопасности</strong> в нескольких вызовах подпроцессов, а публикация стабильных релизов восстановлена, так что релизы переходят от проверки в режиме сухого прогона к настоящим публичным сборкам.</li>
      </ul>

      <h2>Что делать с этим уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктопное приложение, подключите агента (или принесите свой ключ через новые пресеты) и начните проект — настройку теперь легче обнаружить</td></tr>
          <tr><td>Глубоко в долгой сессии</td><td>Просто продолжайте — запуски Codex, OpenCode, Pi и Cloud теперь возобновляются между ходами вместо холодного старта</td></tr>
          <tr><td>Готовите презентацию или документ</td><td>Постройте её, затем экспортируйте напрямую в PPTX или PDF на основе скриншотов — без отдельного производственного обхода</td></tr>
          <tr><td>Работаете в Open Design Cloud</td><td>Проверьте карточку настроек — баланс кошелька, повторные попытки и следующие шаги видны, а не спрятаны за повторной попыткой</td></tr>
          <tr><td>Столкнулись с неудавшимся запуском</td><td>Прочитайте карточку сбоя — теперь она называет причину, а восстановимые запуски сами отступают и повторяют попытку</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Инструмент дизайна зарабатывает доверие в промежутках: прерывание, передача, неудавшийся запуск, момент вашего возвращения. 0.13.0 тратит свой бюджет именно на эти промежутки, чтобы сессия оставалась живой вокруг них. Скачайте десктопное приложение, начните что-то настоящее и заметьте, как мало вам приходится перестраивать, когда вы отходите и возвращаетесь.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>116 PR за шесть дней от 26 человек, каждый из которых закрыл один маленький разрыв между «меня прервали» и «я всё ещё в потоке». Движение не выпускается с ноутбуков одной команды; оно выпускается людьми, которые пришли и сгладили ещё одну шероховатость. Мы видим вас. 🚀</p>

      <h2>Похожие материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: ваш бренд — это дизайн-система</a> — релиз захвата бренда, на основе которого этот держит вас в потоке</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: базар</a> — релиз галереи-и-приветствия под ним</li>
        <li><a href="/blog/what-is-vibe-design/">Что такое vibe-дизайн?</a> — более развёрнутый взгляд на проектирование по намерению, рабочий процесс, который эти релизы поддерживают живым</li>
      </ul>
  es:
    title: 'Open Design 0.13.0: mantente en el flow'
    summary: 'Tag open-design-v0.13.0: 116 PRs de 26 colaboradores en seis días. Nombre en clave «Mantente en el flow» (Stay in Flow). Las sesiones largas de diseño solían romperse con cada interrupción: una ejecución perdía su lugar, un selector de modelo te obligaba a adivinar, una comprobación de saldo de Cloud se escondía detrás de un reintento, un deck terminado necesitaba un desvío más para exportarse. La 0.13.0 convierte todo eso en un ciclo más tranquilo: retoma el trabajo, ve qué está pasando, elige el modelo correcto más rápido, y entrega archivos reales sin salir de Open Design.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.13.0</code>, publicado el 2 de julio de 2026. <strong>116 PRs de 26 colaboradores en seis días.</strong> Nombre en clave «Mantente en el flow» (Stay in Flow). Las últimas versiones le enseñaron a Open Design a diseñar <em>para</em> ti, capturar tu marca y llenar los estantes. Esta trata sobre el ritmo entre medias: las pequeñas interrupciones que solían romper una sesión y hacer que el siguiente prompt se sintiera como empezar de cero.</p>
      <p>¿Quieres el registro de cambios completo? Está en las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">notas de la versión en GitHub</a>. Esta publicación es la versión corta: qué cambió por dentro, qué puedes hacer con ello hoy, y por dónde empezar.</p>

      <h2>Retomar la sesión en lugar de reconstruirla</h2>
      <p>Este es el plato fuerte. Una sesión larga de diseño solía ser castigada por cada interrupción: cambias de herramienta, vuelves más tarde, y el siguiente turno podía sentirse como un arranque en frío porque la ejecución había perdido su lugar. <strong>La reanudación nativa de sesión ahora mantiene conectadas entre turnos las ejecuciones de Codex, OpenCode, Pi y Open Design Cloud</strong>, de modo que el trabajo de seguimiento continúa desde el mismo hilo en vivo en lugar de una aproximación reconstruida de él.</p>
      <p>Por debajo, las ejecuciones ahora llevan trazabilidad de ciclo de vida y seguimiento de archivos tocados, de modo que reabrir una sesión sabe qué estaba haciendo y qué cambió. El efecto es simple: puedes irte y volver sin pagar un impuesto por ello.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Dos burbujas de conversación conectadas por un hilo ininterrumpido que forma un arco sobre un hueco en la línea de tiempo, el hilo reconectado enmarcado dentro de un cuadro de selección verde sobre un fondo editorial casi blanco" />
        <figcaption>La reanudación nativa mantiene el mismo hilo en vivo conectado a través de las interrupciones: sin reinicio en frío en el siguiente turno.</figcaption>
      </figure>

      <h2>Exportaciones que se comportan como entregables</h2>
      <p>El trabajo terminado debería salir del espacio de trabajo como un archivo real, no como una tarea de producción. La 0.13.0 añade <strong>exportación programática de PPTX y PDF respaldada por capturas de pantalla</strong>, de modo que un deck o documento HTML terminado se convierte directamente en algo que puedes enviar. La navegación por teclado del deck también dejó de saltarse diapositivas dobles, así que revisar antes de exportar ya no es una pelea con las teclas de flecha.</p>
      <p>El punto es que la ruta de exportación ahora se siente como una entrega. Construyes en Open Design, y el entregable sale del otro lado listo para compartir.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Un deck de diapositivas terminado se eleva del lienzo y se divide en un archivo PPTX y un archivo PDF, los dos archivos de salida enmarcados dentro de un cuadro de selección verde sobre un fondo editorial casi blanco" />
        <figcaption>Un deck terminado se exporta directamente a PPTX y PDF respaldados por capturas de pantalla, más cerca de una entrega que de un paso de producción separado.</figcaption>
      </figure>

      <h2>Trae tu propia clave sin hacer arqueología</h2>
      <p>Traer tus propias claves debería ser una elección, no una excavación entre las peculiaridades de los proveedores y los nombres de los modelos. Los <strong>ajustes preestablecidos de proveedores BYOK</strong> hacen que la configuración sea más fácil de descubrir, y la entrega del primer artefacto es más limpia tanto para los flujos de CLI como de BYOK.</p>
      <p>La elección de modelo se volvió más amplia y menos frágil al mismo tiempo: Open Design ahora reconoce el paquete de aplicación Codex independiente, incluye una CLI de Vela empaquetada más reciente, admite Mimo Code, y corrige el límite de salida de Cogito que podía hacer fallar la configuración del agente por razones ambientales. Menos configuraciones terminan en un encogimiento de hombros.</p>

      <h2>Cuando algo falla, un mejor punto de partida</h2>
      <p>El «execution_failed» genérico para todo sigue cediendo paso a fallos que <strong>nombran su causa</strong>: un fallo de arranque, una reanudación caducada, un agente atascado en un bucle de herramientas, una configuración de proveedor obsoleta, para que sepas si reintentar o escalar. Tarjetas de fallo de tarea más claras, diagnósticos de origen de error más simples, y una contabilidad de caché que ya no supera el 100% hacen que una ejecución fallida o reanudada sea más fácil de entender sin convertir la interfaz en un visor de registros.</p>
      <p>Open Design Cloud recibió el mismo tratamiento en cuanto al dinero: la tarjeta de configuración muestra el estado de la billetera con más claridad, mantiene las acciones en línea, restaura el manejo de seguimiento y destaca los estados de reintento, de modo que una consulta de saldo transitoria se lee como recuperable en lugar de misteriosa.</p>

      <h2>Qué más llega en la 0.13.0</h2>
      <p>La versión es amplia. Algunas piezas más que vale la pena destacar:</p>
      <ul>
        <li><strong>Los equipos y los canales oficiales son más fáciles de encontrar.</strong> Workspace-for-Teams tiene un punto de entrada visible y una página de captación de clientes empresariales, y la navegación de producto/recursos tiene menos probabilidades de robarle clics a la página que querías abrir.</li>
        <li><strong>Los enlaces sociales oficiales se pusieron al día</strong>: Instagram, LinkedIn y Xiaohongshu, además de un Discord renovado.</li>
        <li><strong>Las vistas previas de sistemas de diseño se volvieron más ricas y confiables</strong>: las páginas de marca siguen siendo previsualizables después de la precarga, las fichas enriquecidas de sistemas de diseño son más fáciles de escanear, las vistas previas de logos se comportan bien, y los ejemplos de plugins incluidos se abren como proyectos reales.</li>
        <li><strong>Soporte de despliegue en Azure</strong> para equipos que ejecutan Open Design en Azure App Service o ACI.</li>
        <li><strong>Un escritorio más tranquilo</strong>: la pantalla de bienvenida dice «Open Design» de forma consistente y usa tokens de tarjeta compatibles con el modo oscuro.</li>
        <li><strong>Una corrección de seguridad</strong> en varias llamadas a subprocesos, y la publicación de versiones estables se restauró, de modo que las versiones pasan de la validación en modo de ensayo a compilaciones públicas reales.</li>
      </ul>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio, conecta un agente (o trae tu propia clave a través de los nuevos ajustes preestablecidos), y comienza un proyecto: la configuración ahora es más fácil de descubrir</td></tr>
          <tr><td>Metido de lleno en una sesión larga</td><td>Simplemente sigue adelante: las ejecuciones de Codex, OpenCode, Pi y Cloud ahora se reanudan entre turnos en lugar de arrancar en frío</td></tr>
          <tr><td>Vas a entregar un deck o un documento</td><td>Constrúyelo, luego exporta directamente a PPTX o PDF respaldado por capturas de pantalla: sin un desvío de producción separado</td></tr>
          <tr><td>Estás en Open Design Cloud</td><td>Revisa la tarjeta de Configuración: el saldo de la billetera, los reintentos y los próximos pasos son visibles en lugar de estar ocultos detrás de un reintento</td></tr>
          <tr><td>Te topaste con una ejecución fallida</td><td>Lee la tarjeta de fallo: ahora nombra la causa, y las ejecuciones recuperables se repliegan y reintentan por su cuenta</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>Una herramienta de diseño gana confianza en los huecos: la interrupción, la entrega, la ejecución fallida, el momento en que vuelves. La 0.13.0 gasta su presupuesto en esos huecos para que la sesión siga viva a su alrededor. Descarga la aplicación de escritorio, empieza algo real, y nota lo poco que tienes que reconstruir cuando te alejas y regresas.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>116 PRs en seis días, de 26 personas que cada una cerró una pequeña brecha entre «me interrumpieron» y «sigo en el flow». Un movimiento no se entrega desde los portátiles de un solo equipo; se entrega desde las personas que se presentaron y suavizaron una aspereza más. Os vemos. 🚀</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: tu marca es un sistema de diseño</a>: la versión de captura de marca sobre la que esta te mantiene en el flow</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: el Bazar</a>: la versión de galería y bienvenida debajo</li>
        <li><a href="/blog/what-is-vibe-design/">¿Qué es el vibe design?</a>: la mirada más extensa sobre diseñar por intención, el flujo de trabajo que estas versiones mantienen vivo</li>
      </ul>
  pt-br:
    title: 'Open Design 0.13.0: continue no flow'
    summary: 'Tag open-design-v0.13.0 — 116 PRs de 26 contribuidores em seis dias. Codinome "Continue no flow" (Stay in Flow). Sessões longas de design costumavam quebrar a cada interrupção: uma execução perdia o rumo, um seletor de modelo forçava você a adivinhar, uma verificação de saldo no Cloud se escondia atrás de uma nova tentativa, um deck pronto exigia mais um desvio para exportação. A 0.13.0 transforma tudo isso em um ciclo mais tranquilo — retome o trabalho, veja o que está acontecendo, escolha o modelo certo mais rápido e entregue arquivos reais sem sair do Open Design.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.13.0</code>, lançada em 2 de julho de 2026. <strong>116 PRs de 26 contribuidores em seis dias.</strong> Codinome "Continue no flow" (Stay in Flow). As últimas versões ensinaram o Open Design a projetar <em>para</em> você, capturar sua marca e abastecer as prateleiras. Esta é sobre o ritmo no meio disso: as pequenas interrupções que costumavam quebrar uma sessão e fazer o próximo prompt parecer um recomeço do zero.</p>
      <p>Quer o changelog completo? Ele está nas <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">notas de versão no GitHub</a>. Este post é a versão curta: o que mudou por baixo dos panos, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Retomar a sessão em vez de reconstruí-la</h2>
      <p>Este é o destaque. Uma sessão longa de design costumava ser penalizada a cada interrupção — você troca de ferramenta, volta depois, e o próximo turno podia parecer uma partida a frio porque a execução tinha perdido o rumo. <strong>A retomada nativa de sessão agora mantém as execuções do Codex, OpenCode, Pi e Open Design Cloud conectadas entre turnos</strong>, de modo que o trabalho de acompanhamento continua a partir do mesmo fio ao vivo, em vez de uma aproximação reconstruída dele.</p>
      <p>Por baixo dos panos, as execuções agora carregam rastreamento de ciclo de vida e rastreamento de arquivos tocados, de modo que reabrir uma sessão sabe o que ela estava fazendo e o que mudou. O efeito é simples: você pode se afastar e voltar sem pagar um pedágio por isso.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Dois balões de conversa conectados por um fio ininterrupto que forma um arco sobre uma lacuna na linha do tempo, o fio reconectado emoldurado dentro de uma caixa de seleção verde sobre um fundo editorial quase branco" />
        <figcaption>A retomada nativa mantém o mesmo fio ao vivo conectado através de interrupções — sem reinício a frio no próximo turno.</figcaption>
      </figure>

      <h2>Exportações que se comportam como entregáveis</h2>
      <p>O trabalho concluído deveria sair do workspace como um arquivo de verdade, não como uma tarefa de produção. A 0.13.0 adiciona <strong>exportação programática de PPTX e PDF baseada em capturas de tela</strong>, de modo que um deck ou documento HTML concluído se transforma diretamente em algo que você pode enviar. A navegação por teclado do deck também parou de pular slides em dobro, então revisar antes de exportar não é mais uma briga com as setas do teclado.</p>
      <p>O ponto é que o caminho de exportação agora parece uma entrega. Você constrói no Open Design, e o entregável sai do outro lado pronto para compartilhar.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Um deck de slides concluído se erguendo do canvas e se dividindo em um arquivo PPTX e um arquivo PDF, os dois arquivos de saída emoldurados dentro de uma caixa de seleção verde sobre um fundo editorial quase branco" />
        <figcaption>Um deck concluído é exportado diretamente para PPTX e PDF baseados em capturas de tela — mais perto de uma entrega do que de uma etapa de produção separada.</figcaption>
      </figure>

      <h2>Traga sua própria chave sem precisar garimpar</h2>
      <p>Trazer suas próprias chaves deveria ser uma escolha, não um garimpo pelas peculiaridades dos provedores e nomes de modelos. Os <strong>presets de provedores BYOK</strong> tornam a configuração mais fácil de descobrir, e a entrega do primeiro artefato ficou mais limpa tanto para os fluxos de CLI quanto de BYOK.</p>
      <p>A escolha de modelo ficou mais ampla e menos frágil ao mesmo tempo: o Open Design agora reconhece o pacote de aplicativo Codex independente, traz uma CLI Vela empacotada mais recente, oferece suporte ao Mimo Code, e corrige o limite de saída do Cogito que podia fazer a configuração do agente falhar por motivos ambientais. Menos configurações terminam em um dar de ombros.</p>

      <h2>Quando algo falha, um ponto de partida melhor</h2>
      <p>O "execution_failed" genérico continua dando lugar a falhas que <strong>nomeiam sua causa</strong> — uma falha de inicialização, uma retomada expirada, um agente preso em um loop de ferramenta, uma configuração de provedor desatualizada — para que você saiba se deve repetir ou escalar. Cartões de falha de tarefa mais claros, diagnósticos de origem de erro mais simples e uma contabilidade de cache que não passa mais de 100% tornam uma execução falha ou retomada mais fácil de entender sem transformar a interface em um visualizador de logs.</p>
      <p>O Open Design Cloud recebeu o mesmo tratamento em relação a dinheiro: o cartão de configurações mostra o estado da carteira com mais clareza, mantém as ações inline, restaura o tratamento de acompanhamento e destaca os status de nova tentativa, de modo que uma consulta de saldo transitória soa como recuperável em vez de misteriosa.</p>

      <h2>O que mais chega na 0.13.0</h2>
      <p>A versão é ampla. Mais algumas partes que vale a pena destacar:</p>
      <ul>
        <li><strong>Equipes e canais oficiais ficaram mais fáceis de encontrar.</strong> O Workspace-for-Teams tem um ponto de entrada visível e uma página de captação de leads empresariais, e a navegação de produto/recursos tem menos chance de roubar cliques da página que você queria abrir.</li>
        <li><strong>Os links sociais oficiais se atualizaram</strong> — Instagram, LinkedIn e Xiaohongshu, além de um Discord renovado.</li>
        <li><strong>As pré-visualizações de sistemas de design ficaram mais ricas e confiáveis</strong> — páginas de marca continuam pré-visualizáveis após o prefetch, chips ricos de sistema de design são mais fáceis de escanear, as pré-visualizações de logo se comportam corretamente, e os exemplos de plugins inclusos abrem como projetos de verdade.</li>
        <li><strong>Suporte de implantação no Azure</strong> para equipes que rodam o Open Design no Azure App Service ou ACI.</li>
        <li><strong>Um desktop mais tranquilo</strong> — a tela de abertura sempre diz "Open Design" e usa tokens de cartão amigáveis ao modo escuro.</li>
        <li><strong>Uma correção de segurança</strong> em várias chamadas de subprocesso, e a publicação de versões estáveis foi restaurada, de modo que os lançamentos avançam da validação em modo dry-run para builds públicas reais.</li>
      </ul>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você é…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o aplicativo desktop, conecte um agente (ou traga sua própria chave pelos novos presets) e comece um projeto — a configuração agora é mais fácil de descobrir</td></tr>
          <tr><td>Mergulhado em uma sessão longa</td><td>Simplesmente continue — as execuções do Codex, OpenCode, Pi e Cloud agora retomam entre turnos em vez de partir a frio</td></tr>
          <tr><td>Entregando um deck ou documento</td><td>Construa, depois exporte diretamente para PPTX ou PDF baseado em capturas de tela — sem um desvio de produção separado</td></tr>
          <tr><td>No Open Design Cloud</td><td>Confira o cartão de Configurações — o saldo da carteira, as novas tentativas e os próximos passos ficam visíveis em vez de escondidos atrás de uma nova tentativa</td></tr>
          <tr><td>Atingido por uma execução com falha</td><td>Leia o cartão de falha — agora ele nomeia a causa, e as execuções recuperáveis recuam e tentam de novo sozinhas</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>Uma ferramenta de design conquista confiança nas lacunas: a interrupção, a entrega, a execução com falha, o momento em que você volta. A 0.13.0 gasta seu orçamento nessas lacunas para que a sessão continue viva ao redor delas. Baixe o aplicativo desktop, comece algo real, e note o quão pouco você precisa reconstruir quando se afasta e retorna.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>116 PRs em seis dias, de 26 pessoas que cada uma fechou uma pequena lacuna entre "fui interrompido" e "ainda estou no flow". Um movimento não é lançado a partir dos laptops de uma única equipe; ele é lançado pelas pessoas que apareceram e suavizaram mais uma aresta. Nós vemos você. 🚀</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: sua marca é um sistema de design</a> — a versão de captura de marca sobre a qual esta mantém você no flow</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: o Bazar</a> — a versão de galeria-e-acolhimento por baixo</li>
        <li><a href="/blog/what-is-vibe-design/">O que é vibe design?</a> — a abordagem mais longa sobre projetar por intenção, o fluxo de trabalho que estas versões mantêm vivo</li>
      </ul>
  it:
    title: 'Open Design 0.13.0: resta nel flow'
    summary: 'Tag open-design-v0.13.0 — 116 PR da 26 contributori in sei giorni. Nome in codice "Resta nel flow" (Stay in Flow). Le lunghe sessioni di design una volta si interrompevano a ogni interruzione: un''esecuzione perdeva il suo posto, un selettore di modello ti costringeva a indovinare, un controllo del saldo Cloud si nascondeva dietro un nuovo tentativo, un deck finito richiedeva un''altra deviazione per l''esportazione. La 0.13.0 trasforma tutto questo in un ciclo più tranquillo — riprendi il lavoro, vedi cosa sta succedendo, scegli il modello giusto più velocemente, e consegna file reali senza lasciare Open Design.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.13.0</code>, rilasciato il 2 luglio 2026. <strong>116 PR da 26 contributori in sei giorni.</strong> Nome in codice "Resta nel flow" (Stay in Flow). Le ultime release hanno insegnato a Open Design a progettare <em>per</em> te, catturare il tuo brand e riempire gli scaffali. Questa parla del ritmo che sta nel mezzo: le piccole interruzioni che una volta rompevano una sessione e facevano sentire il prompt successivo come un ricominciare da capo.</p>
      <p>Vuoi il changelog completo? Lo trovi nelle <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">note di rilascio su GitHub</a>. Questo post è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Riprendere la sessione invece di ricostruirla</h2>
      <p>Questo è il piatto forte. Una lunga sessione di design una volta veniva penalizzata a ogni interruzione — cambi strumento, torni più tardi, e il turno successivo poteva sembrare un avvio a freddo perché l'esecuzione aveva perso il suo posto. <strong>La ripresa nativa della sessione ora mantiene le esecuzioni di Codex, OpenCode, Pi e Open Design Cloud connesse tra i turni</strong>, così il lavoro di follow-up continua dallo stesso thread live invece che da un'approssimazione ricostruita di esso.</p>
      <p>Sotto il cofano, le esecuzioni ora portano con sé il tracciamento del ciclo di vita e il tracciamento dei file toccati, così riaprire una sessione sa cosa stava facendo e cosa ha cambiato. L'effetto è semplice: puoi allontanarti e tornare senza pagarne il prezzo.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Due fumetti di conversazione collegati da un filo ininterrotto che disegna un arco su un vuoto nella timeline, il filo riconnesso incorniciato dentro una casella di selezione verde su uno sfondo editoriale quasi bianco" />
        <figcaption>La ripresa nativa mantiene lo stesso thread live connesso attraverso le interruzioni — nessun riavvio a freddo al turno successivo.</figcaption>
      </figure>

      <h2>Esportazioni che si comportano come deliverable</h2>
      <p>Il lavoro finito dovrebbe lasciare il workspace come un file vero, non come una commessa di produzione. La 0.13.0 aggiunge l'<strong>esportazione programmatica in PPTX e PDF basata su screenshot</strong>, così un deck HTML o un documento completato si trasforma direttamente in qualcosa che puoi inviare. Anche la navigazione da tastiera del deck ha smesso di saltare due slide alla volta, quindi la revisione prima di esportare non è più una lotta con le frecce.</p>
      <p>Il punto è che il percorso di esportazione ora sembra un handoff. Costruisci in Open Design, e il deliverable esce dall'altra parte pronto da condividere.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Un deck di diapositive finito che si solleva dal canvas e si divide in un file PPTX e un file PDF, i due file di output incorniciati dentro una casella di selezione verde su uno sfondo editoriale quasi bianco" />
        <figcaption>Un deck finito viene esportato direttamente in PPTX e PDF basati su screenshot — più vicino a un handoff che a uno step di produzione separato.</figcaption>
      </figure>

      <h2>Porta la tua chiave senza fare archeologia</h2>
      <p>Portare le proprie chiavi dovrebbe essere una scelta, non uno scavo tra le stranezze dei provider e i nomi dei modelli. I <strong>preset dei provider BYOK</strong> rendono la configurazione più facile da scoprire, e la consegna del primo artefatto è più pulita sia per i flussi CLI che BYOK.</p>
      <p>La scelta del modello è diventata contemporaneamente più ampia e meno fragile: Open Design ora riconosce il bundle dell'app Codex standalone, include una CLI Vela in bundle più recente, supporta Mimo Code, e corregge il limite di output di Cogito che poteva far fallire la configurazione dell'agent per motivi ambientali. Meno configurazioni finiscono con un'alzata di spalle.</p>

      <h2>Quando qualcosa fallisce, un punto di partenza migliore</h2>
      <p>Il fallimento generico "execution_failed" continua a lasciare spazio a errori che <strong>danno un nome alla loro causa</strong> — un crash all'avvio, la scadenza di un resume, un agent bloccato in un loop di strumenti, una configurazione di provider obsoleta — così sai se riprovare o fare escalation. Card di fallimento delle task più chiare, diagnosi della fonte dell'errore più semplici, e una contabilità della cache che non supera più il 100% rendono un'esecuzione fallita o ripresa più facile da capire senza trasformare l'interfaccia in un visualizzatore di log.</p>
      <p>Open Design Cloud ha ricevuto lo stesso trattamento per il denaro: la card delle impostazioni mostra lo stato del wallet più chiaramente, mantiene le azioni inline, ripristina la gestione dei follow-up, e mette in evidenza gli stati di retry, così una verifica temporanea del saldo si legge come recuperabile invece che misteriosa.</p>

      <h2>Cos'altro arriva nella 0.13.0</h2>
      <p>La release è ampia. Ancora qualche pezzo che vale la pena mettere in primo piano:</p>
      <ul>
        <li><strong>Team e canali ufficiali sono più facili da trovare.</strong> Workspace-for-Teams ha un punto di ingresso visibile e una pagina di lead enterprise, e la navigazione prodotto/risorse ha meno probabilità di rubare i clic alla pagina che volevi aprire.</li>
        <li><strong>I link social ufficiali si sono aggiornati</strong> — Instagram, LinkedIn e Xiaohongshu, oltre a un Discord rinnovato.</li>
        <li><strong>Le anteprime dei design system sono diventate più ricche e affidabili</strong> — le pagine brand restano visualizzabili in anteprima dopo il prefetch, i chip ricchi dei design system sono più facili da scorrere, le anteprime dei loghi si comportano correttamente, e gli esempi di plugin inclusi si aprono come progetti veri.</li>
        <li><strong>Supporto al deployment su Azure</strong> per i team che eseguono Open Design su Azure App Service o ACI.</li>
        <li><strong>Un desktop più tranquillo</strong> — la schermata di avvio dice sempre "Open Design" in modo coerente e usa token delle card compatibili con la dark mode.</li>
        <li><strong>Una correzione di sicurezza</strong> su più chiamate a subprocessi, e la pubblicazione delle release stabili è stata ripristinata, così le release passano dalla validazione in dry-run a vere build pubbliche.</li>
      </ul>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Inizia qui</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuovo su Open Design</td><td>Scarica l'app desktop, connetti un agent (oppure porta la tua chiave tramite i nuovi preset), e avvia un progetto — la configurazione ora è più facile da scoprire</td></tr>
          <tr><td>Immerso in una lunga sessione</td><td>Continua semplicemente — le esecuzioni di Codex, OpenCode, Pi e Cloud ora riprendono tra i turni invece di ripartire a freddo</td></tr>
          <tr><td>In procinto di consegnare un deck o un documento</td><td>Costruiscilo, poi esporta direttamente in PPTX o PDF basato su screenshot — nessuna deviazione di produzione separata</td></tr>
          <tr><td>Su Open Design Cloud</td><td>Controlla la card delle Impostazioni — saldo del wallet, retry e passi successivi sono visibili invece che nascosti dietro un nuovo tentativo</td></tr>
          <tr><td>Colpito da un'esecuzione fallita</td><td>Leggi la card di fallimento — ora dà un nome alla causa, e le esecuzioni recuperabili arretrano e riprovano da sole</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>Uno strumento di design guadagna fiducia negli interstizi: l'interruzione, l'handoff, l'esecuzione fallita, il momento in cui torni. La 0.13.0 spende il suo budget su questi interstizi così che la sessione resti viva intorno a essi. Scarica l'app desktop, inizia qualcosa di reale, e nota quanto poco devi ricostruire quando ti allontani e torni.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>116 PR in sei giorni, da 26 persone che hanno ciascuna colmato un piccolo divario tra "sono stato interrotto" e "sono ancora nel flow". Un movimento non viene rilasciato dai laptop di un solo team; viene rilasciato dalle persone che si sono presentate e hanno smussato un altro spigolo. Vi vediamo. 🚀</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: il tuo brand è un design system</a> — la release di cattura del brand su cui questa ti mantiene nel flow</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: il Bazaar</a> — la release galleria-e-benvenuto sottostante</li>
        <li><a href="/blog/what-is-vibe-design/">Cos'è il vibe design?</a> — l'approfondimento sul progettare per intento, il flusso di lavoro che queste release mantengono vivo</li>
      </ul>
  tr:
    title: 'Open Design 0.13.0: akışta kalın'
    summary: 'Etiket open-design-v0.13.0 — altı günde 26 katkıda bulunandan 116 PR. Kod adı "Akışta Kalın" (Stay in Flow). Uzun tasarım oturumları eskiden her kesintide bozulurdu: bir çalıştırma yerini kaybederdi, bir model seçici sizi tahmin etmeye zorlardı, bir Cloud bakiye kontrolü bir yeniden deneme arkasına saklanırdı, tamamlanmış bir deste dışa aktarma için bir ek dolambaç gerektirirdi. 0.13.0 bunların hepsini daha sakin bir döngüye dönüştürüyor — işi devam ettirin, neler olduğunu görün, doğru modeli daha hızlı seçin ve Open Design''dan ayrılmadan gerçek dosyalar teslim edin.'
    bodyHtml: |
      <p>Etiket <code>open-design-v0.13.0</code>, 2 Temmuz 2026'da yayınlandı. <strong>Altı günde 26 katkıda bulunandan 116 PR.</strong> Kod adı "Akışta Kalın" (Stay in Flow). Son birkaç sürüm Open Design'a sizin <em>için</em> tasarlamayı, markanızı yakalamayı ve rafları doldurmayı öğretti. Bu sürüm ise ikisi arasındaki ritimle ilgili: bir oturumu bozan ve bir sonraki istemi baştan başlıyormuş gibi hissettiren o küçük kesintilerle.</p>
      <p>Tam değişiklik günlüğünü mü istiyorsunuz? <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0">GitHub'daki sürüm notlarında</a> bulunuyor. Bu yazı kısa versiyon: kaputun altında ne değişti, bununla bugün ne yapabilirsiniz ve nereden başlamalısınız.</p>

      <h2>Oturumu yeniden inşa etmek yerine devam ettirmek</h2>
      <p>Bu, sürümün yıldızı. Uzun bir tasarım oturumu eskiden her kesintide cezalandırılırdı — araç değiştirirsiniz, sonra geri dönersiniz ve çalıştırma yerini kaybettiği için bir sonraki tur soğuk bir başlangıç gibi hissettirebilirdi. <strong>Yerel oturum devam ettirme artık Codex, OpenCode, Pi ve Open Design Cloud çalıştırmalarını turlar arasında bağlı tutuyor</strong>, böylece takip işi, onun yeniden inşa edilmiş bir yaklaşımından değil, aynı canlı iş parçacığından devam ediyor.</p>
      <p>Kaputun altında, çalıştırmalar artık yaşam döngüsü izlemesi ve dokunulan dosya izlemesi taşıyor, böylece bir oturumu yeniden açmak ne yaptığını ve neyi değiştirdiğini biliyor. Etki basit: uzaklaşıp geri dönebilirsiniz, bunun için bir bedel ödemeden.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Zaman çizelgesindeki bir boşluğun üzerinden kavis çizen, kesintisiz bir iplikle birbirine bağlanmış iki konuşma balonu; yeniden bağlanan iplik, neredeyse beyaz bir editöryel zemin üzerinde yeşil bir seçim kutusu içinde çerçevelenmiş" />
        <figcaption>Yerel devam ettirme, aynı canlı iş parçacığını kesintiler boyunca bağlı tutar — bir sonraki turda soğuk yeniden başlatma olmaz.</figcaption>
      </figure>

      <h2>Teslim edilebilir gibi davranan dışa aktarmalar</h2>
      <p>Tamamlanmış bir iş, bir üretim angaryası olarak değil, gerçek bir dosya olarak çalışma alanından ayrılmalıdır. 0.13.0, <strong>programatik, ekran görüntüsü destekli PPTX ve PDF dışa aktarma</strong> ekliyor, böylece tamamlanmış bir HTML deste veya belge doğrudan gönderebileceğiniz bir şeye dönüşüyor. Deste klavye navigasyonu da artık slaytları iki kez atlamıyor, böylece dışa aktarmadan önce gözden geçirmek artık ok tuşlarıyla bir mücadele değil.</p>
      <p>Önemli olan, dışa aktarma yolunun artık bir teslim gibi hissettirmesi. Open Design içinde inşa edersiniz ve teslim edilebilir öğe diğer taraftan paylaşıma hazır şekilde çıkar.</p>
      <figure>
        <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="Tamamlanmış bir slayt destesinin tuvalden kalkıp bir PPTX dosyası ve bir PDF dosyasına ayrılması, iki çıktı dosyası neredeyse beyaz bir editöryel zemin üzerinde yeşil bir seçim kutusu içinde çerçevelenmiş" />
        <figcaption>Tamamlanmış bir deste doğrudan ekran görüntüsü destekli PPTX ve PDF'e dışa aktarılır — ayrı bir üretim adımından çok bir teslime yakın.</figcaption>
      </figure>

      <h2>Kazı yapmadan kendi anahtarınızı getirin</h2>
      <p>Kendi anahtarlarınızı getirmek, sağlayıcı tuhaflıkları ve model adları arasında kazı yapmak değil, bir seçim olmalı. <strong>BYOK sağlayıcı ön ayarları</strong> kurulumu daha kolay keşfedilebilir hale getiriyor ve hem CLI hem de BYOK akışları için ilk çıktı teslimi daha temiz.</p>
      <p>Model seçimi aynı anda hem daha geniş hem de daha az kırılgan hale geldi: Open Design artık bağımsız Codex uygulama paketini tanıyor, daha yeni bir paketlenmiş Vela CLI ile geliyor, Mimo Code'u destekliyor ve ortamsal nedenlerle agent kurulumunu başarısız kılabilecek Cogito çıktı sınırını düzeltiyor. Daha az kurulum omuz silkmeyle sonuçlanıyor.</p>

      <h2>Bir şey başarısız olduğunda, daha iyi bir başlangıç noktası</h2>
      <p>Her şeyi kapsayan "execution_failed" hatası, <strong>nedenlerini adlandıran</strong> hatalara yerini vermeye devam ediyor — bir başlangıç çökmesi, süresi dolmuş bir devam ettirme, bir araç döngüsünde takılı kalan bir agent, eski bir sağlayıcı yapılandırması — böylece yeniden mi deneyeceğinizi yoksa yükseltecek mi olduğunuzu bilirsiniz. Daha net görev başarısızlık kartları, daha basit hata kaynağı tanıları ve artık %100'ü aşmayan önbellek muhasebesi, arayüzü bir günlük görüntüleyiciye dönüştürmeden başarısız veya devam ettirilen bir çalıştırmayı anlamayı kolaylaştırıyor.</p>
      <p>Open Design Cloud, para konusunda da aynı muameleyi gördü: ayarlar kartı cüzdan durumunu daha net gösteriyor, işlemleri satır içinde tutuyor, takip işlemesini geri getiriyor ve yeniden deneme durumlarını öne çıkarıyor, böylece geçici bir bakiye sorgusu gizemli değil kurtarılabilir olarak okunuyor.</p>

      <h2>0.13.0'da başka neler var</h2>
      <p>Sürüm geniş kapsamlı. Öne çıkarılmaya değer birkaç parça daha:</p>
      <ul>
        <li><strong>Takımlar ve resmi kanallar daha kolay bulunuyor.</strong> Workspace-for-Teams'in görünür bir giriş noktası ve bir kurumsal potansiyel müşteri sayfası var, ürün/kaynak navigasyonu ise açmak istediğiniz sayfadan tıklamaları çalma olasılığı daha düşük.</li>
        <li><strong>Resmi sosyal medya bağlantıları güncellendi</strong> — Instagram, LinkedIn ve Xiaohongshu, artı yenilenmiş Discord.</li>
        <li><strong>Tasarım sistemi önizlemeleri daha zengin ve daha güvenilir hale geldi</strong> — marka sayfaları ön yüklemeden sonra önizlenebilir kalıyor, zengin tasarım sistemi çipleri taranması daha kolay, logo önizlemeleri düzgün davranıyor ve paketlenmiş eklenti örnekleri gerçek projeler olarak açılıyor.</li>
        <li><strong>Azure dağıtım desteği</strong>, Open Design'ı Azure App Service veya ACI üzerinde çalıştıran takımlar için.</li>
        <li><strong>Daha sakin bir masaüstü</strong> — açılış ekranı tutarlı bir şekilde "Open Design" diyor ve karanlık moda uygun kart token'ları kullanıyor.</li>
        <li><strong>Birden fazla alt süreç çağrısını kapsayan bir güvenlik düzeltmesi</strong> ve kararlı sürüm yayınlaması geri getirildi, böylece sürümler kuru çalıştırma doğrulamasından gerçek herkese açık derlemelere ilerliyor.</li>
      </ul>

      <h2>Bununla bugün ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer şuysanız…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'da yeni</td><td>Masaüstü uygulamasını indirin, bir agent bağlayın (ya da yeni ön ayarlar aracılığıyla kendi anahtarınızı getirin) ve bir proje başlatın — kurulum artık daha kolay keşfedilebilir</td></tr>
          <tr><td>Uzun bir oturuma derinlemesine dalmış</td><td>Sadece devam edin — Codex, OpenCode, Pi ve Cloud çalıştırmaları artık soğuk başlamak yerine turlar arasında devam ediyor</td></tr>
          <tr><td>Bir deste veya belge gönderiyor</td><td>Onu inşa edin, ardından doğrudan ekran görüntüsü destekli PPTX veya PDF'e dışa aktarın — ayrı bir üretim dolambacı yok</td></tr>
          <tr><td>Open Design Cloud'da</td><td>Ayarlar kartına bakın — cüzdan bakiyesi, yeniden denemeler ve sonraki adımlar bir yeniden deneme arkasına gizlenmek yerine görünür</td></tr>
          <tr><td>Başarısız bir çalıştırmaya takıldı</td><td>Hata kartını okuyun — artık nedenini adlandırıyor ve kurtarılabilir çalıştırmalar kendi kendine geri çekilip yeniden deniyor</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne yapmalı</h2>
      <p>Bir tasarım aracı güveni boşluklarda kazanır: kesinti, teslim, başarısız çalıştırma, geri döndüğünüz an. 0.13.0 bütçesini tam da bu boşluklara harcıyor, böylece oturum bunların etrafında canlı kalıyor. Masaüstü uygulamasını indirin, gerçek bir şeye başlayın ve uzaklaşıp geri döndüğünüzde ne kadar az şey yeniden inşa etmeniz gerektiğine dikkat edin.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indirin</a>.</p>
      <p>Altı günde 116 PR, her biri "kesintiye uğradım" ile "hâlâ akıştayım" arasındaki küçük bir boşluğu kapatan 26 kişiden. Bir hareket tek bir ekibin dizüstü bilgisayarlarından çıkmaz; ortaya çıkıp bir pürüzü daha gideren insanlardan çıkar. Sizi görüyoruz. 🚀</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: markanız bir tasarım sistemidir</a> — bunun üzerine sizi akışta tuttuğu marka yakalama sürümü</li>
        <li><a href="/blog/open-design-0-11-0-the-bazaar/">Open Design 0.11.0: Pazar Yeri</a> — altındaki galeri-ve-karşılama sürümü</li>
        <li><a href="/blog/what-is-vibe-design/">Vibe design nedir?</a> — niyetle tasarlamaya dair daha uzun bir bakış, bu sürümlerin canlı tuttuğu iş akışı</li>
      </ul>
---

Tag `open-design-v0.13.0`, published on July 2, 2026. **116 PRs from 26 contributors in six days.** Codename "Stay in Flow." The last few releases taught Open Design to design *for* you, capture your brand, and stock the shelves. This one is about the rhythm in between: the small interruptions that used to break a session and make the next prompt feel like starting over.

Want the full changelog? It lives in the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0). This is the short version: what changed underneath, what you can do with it today, and where to start.

## Resume the session instead of rebuilding it

This is the headliner. A long design session used to punish every interruption — switch tools, come back later, and the next turn might feel like a cold start because the run had lost its place. **Native session resume now keeps Codex, OpenCode, Pi, and Open Design Cloud runs connected across turns**, so follow-up work continues from the same live thread instead of a rebuilt approximation of it.

Underneath, runs now carry lifecycle tracing and touched-file tracking, so reopening a session knows what it was doing and what it changed. The effect is simple: you can walk away and come back without paying a tax for it.

<figure>
  <img src="/blog/open-design-0-13-0-stay-in-flow-resume.webp" alt="Two conversation bubbles connected by an unbroken thread that arcs across a gap in the timeline, the reconnected thread framed inside a green selection box against a near-white editorial background" />
  <figcaption>Native resume keeps the same live thread connected across interruptions — no cold restart on the next turn.</figcaption>
</figure>

## Exports that behave like deliverables

Finished work should leave the workspace as a real file, not a production chore. 0.13.0 adds **programmatic, screenshot-backed PPTX and PDF export**, so a completed HTML deck or document moves straight into something you can send. Deck keyboard navigation also stopped double-stepping through slides, so reviewing before you export is no longer a fight with the arrow keys.

The point is that the export path now feels like handoff. You build in Open Design, and the deliverable comes out the other side ready to share.

<figure>
  <img src="/blog/open-design-0-13-0-stay-in-flow-export.webp" alt="A finished slide deck lifting off the canvas and splitting into a PPTX file and a PDF file, the two output files framed inside a green selection box against a near-white editorial background" />
  <figcaption>A finished deck exports straight to screenshot-backed PPTX and PDF — closer to handoff than to a separate production step.</figcaption>
</figure>

## Bring your own key without the archaeology

Bringing your own keys should be a choice, not a dig through provider quirks and model names. **BYOK provider presets** make setup more discoverable, and the first-artifact handoff is cleaner for both CLI and BYOK flows.

Model choice got broader and less brittle at the same time: Open Design now recognizes the standalone Codex app bundle, ships a newer bundled Vela CLI, supports Mimo Code, and fixes the Cogito output cap that could make agent setup fail for environmental reasons. Fewer setups end in a shrug.

## When something fails, a better starting point

The catch-all `execution_failed` continues to give way to failures that **name their cause** — a startup crash, an expired resume, an agent stuck in a tool loop, a stale provider config — so you know whether to retry or escalate. Clearer task-failure cards, simpler error-source diagnostics, and cache accounting that no longer exceeds 100% make a failed or resumed run easier to understand without turning the UI into a log viewer.

Open Design Cloud got the same treatment for money: the settings card shows wallet state more clearly, keeps actions inline, restores follow-up handling, and promotes retry statuses, so a transient balance lookup reads as recoverable instead of mysterious.

## What else lands in 0.13.0

The release is broad. A few more worth calling out:

- **Teams and official channels are easier to find.** Workspace-for-Teams has a visible entry point and an enterprise lead page, and the product/resource navigation is less likely to steal clicks from the page you meant to open.
- **Official social links caught up** — Instagram, LinkedIn, and Xiaohongshu, plus refreshed Discord.
- **Design-system previews got richer and easier to trust** — brand pages stay previewable after prefetch, rich design-system chips are easier to scan, logo previews behave, and bundled plugin examples open as real projects.
- **Azure deployment support** for teams running Open Design on Azure App Service or ACI.
- **A calmer desktop** — the startup splash consistently says "Open Design" and uses dark-mode-friendly card tokens.
- **A security fix** across multiple subprocess calls, and stable release publishing restored so releases move from dry-run validation to real public builds.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app, connect an agent (or bring your own key via the new presets), and start a project — the setup is more discoverable now |
| Deep in a long session | Just keep going — Codex, OpenCode, Pi, and Cloud runs now resume across turns instead of cold-starting |
| Shipping a deck or doc | Build it, then export straight to screenshot-backed PPTX or PDF — no separate production detour |
| On Open Design Cloud | Check the Settings card — wallet balance, retries, and next steps are visible instead of hidden behind a retry |
| Hit by a failed run | Read the failure card — it names the cause now, and recoverable runs back off and retry on their own |

## What to do next

A design tool earns trust in the gaps: the interruption, the handoff, the failed run, the moment you come back. 0.13.0 spends its budget on those gaps so the session stays alive around them. Download the desktop app, start something real, and notice how little you have to rebuild when you step away and return.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

116 PRs in six days, from 26 people who each closed one small gap between "I got interrupted" and "I'm still in flow." A movement doesn't ship from one team's laptops; it ships from the people who showed up and smoothed one more rough edge. We see you. 🚀

## Related reading

- [Open Design 0.12.0: your brand is a design system](/blog/open-design-0-12-0-brand-backed-design-system/) — the brand-capture release this one keeps you in flow on top of
- [Open Design 0.11.0: the Bazaar](/blog/open-design-0-11-0-the-bazaar/) — the gallery-and-welcome release underneath
- [What is vibe design?](/blog/what-is-vibe-design/) — the longer take on designing by intent, the workflow these releases keep alive
