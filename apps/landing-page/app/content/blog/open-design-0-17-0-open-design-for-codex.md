---
title: "Open Design 0.17.0: Open Design for Codex"
date: 2026-08-03
category: "Product"
readingTime: 7
summary: "open-design-v0.17.0 — 62 PRs from 23 contributors in 11 days. Codex now has its own design workspace: call @open-design from a conversation, turn a brief into a real Preview or Studio artifact, and finish the visual details directly on the canvas instead of prompting around every small correction."
socialImage: "/blog/open-design-0-17-0-open-design-for-codex-cover-v2.webp"
ctaKind: download-app
i18n:
  zh:
    title: 'Open Design 0.17.0：为 Codex 打造的设计工作区'
    summary: 'open-design-v0.17.0 —— 11 天内 23 位贡献者提交了 62 个 PR。Codex 现在有了自己的设计工作区：从对话中调用 @open-design，把简报变成真正的 Preview 或 Studio 成果，并直接在画布上完成视觉细节，不必再通过提示词反复描述每一个细微修改。'
    category: '产品'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>，于 2026 年 8 月 3 日发布。<strong>11 天内 23 位贡献者提交了 62 个 PR。</strong>Codex 现在有了自己的设计工作区。从 Codex 对话中调用 <code>@open-design</code>，把一个想法或简报变成真正可编辑的成果，然后无需离开 Codex 工作流，就能在 Open Design Studio 中继续创作和完善。</p>
      <p>想看所有变更？请阅读 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">GitHub 上的完整发布说明</a>。本文讲的是产品故事：Codex 如何从一次对话走向视觉成果、为什么最后 10% 不再需要另一条提示词，以及整个过程如何变得更加可靠。</p>

      <h2>Codex 有了自己的设计工作区</h2>
      <p>编程 Agent 擅长把意图变成文件，但视觉工作始终需要第二个环境：在聊天中解释想法，把结果移到设计工具中，再把每一次修改重新翻译成另一条提示词。在 0.17.0 中，<strong>Codex Desktop 和 CLI 可以把 Open Design 作为一套完整的创作引擎来调用。</strong>对话与设计工作区从此成为一个连续的工作流。</p>
      <p>从 <code>@open-design</code> 开始。确认一份视觉简报，选择 Open Design Cloud 或受支持的本地运行时，就能获得真正的 Preview 或 Studio 结果。这个结果不是粘贴进对话的一张截图，而是一个可以打开、检查、编辑、导出并持续完善的成果。</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="一次 Agent 对话流入可编辑的设计画布与稳定预览，相连的成果被精准的绿色选区框包围，置于近白色编辑背景上" />
        <figcaption>从 Codex 调用 Open Design，确认简报，得到真正的 Preview 或 Studio 成果，而不是一张成果的图片。</figcaption>
      </figure>

      <h2>创作运行时不再碍事</h2>
      <p>你不该仅仅为了让集成工作，就必须打开第二个应用。<strong>当 Codex 需要时，已签名的 Open Design 运行时会以无头模式启动</strong>，因此无需盯着额外的窗口，也不用手动把本地技术栈接起来。</p>
      <p>失败路径同样务实。如果 Studio 无法在外部宿主中顺利加载，Codex 仍会立即交付稳定预览。你会先拿到成果，需要时再在完整工作区中打开它，而不是因为某个展示界面未能初始化，就眼看着整次运行失败。</p>
      <p>本地始终留在本地。当你明确选择 Local Codex 时，运行不再绕回插件，也不会把你带入 Cloud 登录流程。Open Design Cloud 与 Local Codex 依旧是两个清晰独立的选项；BYOK 提供商配置会保存在本设备的浏览器存储中，并且只传递给当前的本地运行。</p>

      <h2>亲手完成，而不是再写一条提示词</h2>
      <p>视觉工作的最后 10% 通常非常具体：移动这个元素、收紧那段文字、裁剪图片、对齐两个对象。通过聊天传达每一次修改，让小改动变得比应有的更慢。</p>
      <p>在 0.17.0 中，<strong>Manual Edit 成为完整的收尾工作流</strong>。直接选择元素，移动或缩放它，编辑文本，改变颜色和对齐方式，复制或删除它，以及替换、裁剪、粘贴或拖放图片。实时对齐参考线帮助各个元素准确落位。撤销和重做会保留画布，不再让界面在重新加载中闪烁。</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="设计画布中的一个选中元素被缩放手柄包围，周围带有对齐参考线、文本控件和图片裁剪工具，整体以精准线稿呈现在近白色编辑背景上" />
        <figcaption>用提示词确定方向；用直接操作完成双手能更快表达的细微视觉修改。</figcaption>
      </figure>
      <p>导出结果会忠实呈现你的构图。图片导出会遵循当前 Preview 视口，框架式演示文稿也会按其创作尺寸捕获，而不会被桌面框架重新塑形。</p>

      <h2>清晰的简报会立即开始执行</h2>
      <p>只有当答案会改变结果时，Agent 才应该提问，而不是让每个任务都从一场访谈开始。<strong>如果第一条提示词已经包含足够明确的方向，Open Design 现在会立即开始。</strong>当确实缺少关键决定时，它会在该决定真正产生影响的时刻提出一个聚焦的问题。</p>
      <p>这改变了工作的节奏。一份有力的简报会立刻变成实际成果。模糊的简报依然会获得必要的澄清，但问题会附着在流程中的具体分岔点，而不是横在你与第一个有用结果之间。</p>

      <h2>不合适的模型选择会在浪费一次运行前失败</h2>
      <p>有些 Codex 模型与 CLI 组合已知无法协同工作。0.17.0 会在启动前识别这些组合，提供实用的切换模型路径，并更准确地诊断工具调用后的超时，避免让你陷入误导性的重试。</p>
      <p>其余模型能力继续扩展，同时保持清晰边界：GPT-5.5 Fast 作为明确的速度优先选项加入，Raven 支持一键 MCP 设置，Open Design 也能在 Windows 上自动发现 Grok Build 的官方安装。</p>

      <h2>卡住的更新不再是死路</h2>
      <p>更新问题应当有一条恢复路径，而不是要求你手动寻找缓存目录。现在可以在设置中清除损坏的更新缓存，在已安装版本被确认不安全时重新安装，并从下载载荷导致的崩溃中恢复。<strong>应用会回滚到最后一个可用版本，并在下一次健康更新时自行修复。</strong>感谢 <a href="https://github.com/PerishCode">@PerishCode</a> 在这方面持续投入。</p>
      <p>当 Web 界面退出时，打包应用也能自行恢复：它会在有界策略下重启失败的 sidecar，并重新连接 <code>od://</code> 请求，无需强制重启整个应用。</p>

      <h2>用五十种方式赋予 Codex 设计品味</h2>
      <p>全新的公开 <strong>Codex Design 合集汇聚了 50 个精心挑选、可直接安装的技能</strong>，覆盖界面设计、视觉系统、Figma-to-code、动效、图像生成和前端工艺。每个条目都包含来源信息、实用指导和本地化详情页，让「让 Codex 更有品味」从模糊的承诺变成一套具体的工作流。</p>
      <p>Codex Slides 也加入了这个家族，覆盖从提示词到演示文稿的完整工作流：选择场景与风格、打磨大纲、直接编辑并导出。新的社区工作流进一步拓展了范围——Humanize PPT 能把粗糙的源材料变成一份拥有明确简报且经过导出验证的演示文稿，Atelier Zero 则提供一套可用于生产的图像提示词库。</p>

      <h2>0.17.0 还带来了什么</h2>
      <ul>
        <li><strong>Chat 展示工作过程，却不再像终端</strong>——更安静的执行披露、隐藏的空工具行，以及更忠实的 ACP 工具活动。感谢 <a href="https://github.com/mrcfps">@mrcfps</a> 和 <a href="https://github.com/thatditsyboy">@thatditsyboy</a>。</li>
        <li><strong>工作区标签页准确说明其中内容</strong>——较长的标签仍然清晰可见，Design System 的命名也保持一致。感谢 <a href="https://github.com/BigBandaid2">@BigBandaid2</a>。</li>
        <li><strong>深色优先的品牌继续保持深色优先</strong>——衍生主题会保留预期的画布，而不会悄悄把它变亮。感谢 <a href="https://github.com/wiggdevin">@wiggdevin</a>。</li>
        <li><strong>项目不再不断增加标签页</strong>——重复打开同一个项目不会再创建重复标签。感谢 <a href="https://github.com/pcherkashin">@pcherkashin</a>。</li>
        <li><strong>被中断的工作会清除过期进度</strong>——已完成的后续任务不会再在 Chat 上方留下过时的 Todo 快照。感谢 <a href="https://github.com/Siri-Ray">@Siri-Ray</a>。</li>
        <li><strong>ACP Agent 会留下完整轨迹</strong>——真实的工具名称、输入、结果、耗时与用量都会保留到 Chat 和诊断信息中。</li>
        <li><strong>打包运行时启动得更可靠</strong>——Linux 载荷会在首次使用前预热，打包包装器也会使用随其一同发布的运行时。</li>
      </ul>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>已经在使用 Codex</td><td>安装 Open Design 插件，用一份具体的视觉简报调用 <code>@open-design</code>，并在 Preview 或 Studio 中打开结果</td></tr>
          <tr><td>正在完善生成的成果</td><td>选择一个元素，直接完成最后的视觉修改，而不是再用另一条提示词描述它们</td></tr>
          <tr><td>在本地工作</td><td>明确选择 Local Codex，并确认运行使用设备中保存的 BYOK 配置保持在本地</td></tr>
          <tr><td>制作演示文稿</td><td>尝试用 Codex Slides 完成从简报到大纲、编辑再到导出的完整工作流</td></tr>
          <tr><td>从异常更新中恢复</td><td>打开设置，清除损坏的缓存或重新安装，让应用回到最后一个可用版本</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>Codex 已经是一个可以描述你想构建什么的地方。0.17.0 又为它提供了一个看见并塑造成果的地方。从真实对话中调用 Open Design，让清晰的简报立即启动，然后亲手完成一次小修改，不必再写一整段提示词。</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">下载 Open Design</a>。</p>
      <p>11 天内 62 个 PR，来自 23 位贡献者。他们把对话、成果与画布连接成一条工作流。设计工作区不再只是位于 Codex 旁边，Codex 已经可以直接触达它。我们看见你。🚀</p>

      <h2>相关阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0：可靠交付</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1：更清晰的视野，更持久的心流</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0：更低成本，更快交付</a></li>
      </ul>
  ja:
    title: 'Open Design 0.17.0：Codex のための Open Design'
    summary: 'open-design-v0.17.0 — 11 日間で 23 人のコントリビューターから 62 件の PR。Codex に専用のデザインワークスペースが加わりました。会話から @open-design を呼び出し、ブリーフを実際の Preview または Studio アーティファクトに変え、細かな修正のたびにプロンプトを書くことなく、キャンバス上でビジュアルの仕上げまで行えます。'
    category: 'プロダクト'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>、2026 年 8 月 3 日公開。<strong>11 日間で、23 人のコントリビューターから 62 件の PR が寄せられました。</strong>Codex に専用のデザインワークスペースが加わりました。Codex の会話から <code>@open-design</code> を呼び出し、アイデアやブリーフを実際に編集できるアーティファクトへ変え、そのまま Codex のワークフローを離れることなく Open Design Studio で制作と改善を続けられます。</p>
      <p>すべての変更を確認したいですか？<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">GitHub の完全なリリースノート</a>をご覧ください。この記事で扱うのはプロダクトの物語です。Codex が会話からビジュアルアーティファクトへどう進むのか、なぜ最後の 10% に新たなプロンプトが要らなくなったのか、そしてその過程で何がより安定したのかを紹介します。</p>

      <h2>Codex に専用のデザインワークスペース</h2>
      <p>コーディング Agent は意図をファイルに変えることに長けていますが、ビジュアル制作には常に二つ目の環境が必要でした。チャットでアイデアを説明し、結果をデザインツールへ移し、修正のたびに内容を別のプロンプトへ翻訳し直す必要があったのです。0.17.0 では、<strong>Codex Desktop と CLI が Open Design を完全なクリエイティブエンジンとして呼び出せます。</strong>会話とデザインワークスペースが、一続きのワークフローになります。</p>
      <p><code>@open-design</code> から始めましょう。ビジュアルブリーフを確認し、Open Design Cloud または対応するローカルランタイムを選ぶと、実際の Preview または Studio の結果が届きます。それは会話に貼り付けられたスクリーンショットではありません。開いて確認し、編集し、書き出し、さらに改善を続けられるアーティファクトです。</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Agent との会話が編集可能なデザインキャンバスと安定したプレビューへ流れ、つながったアーティファクトがほぼ白い編集背景の上で精密な緑の選択枠に収められている様子" />
        <figcaption>Codex から Open Design を呼び出し、ブリーフに合意して、完成物の画像ではなく実際の Preview または Studio アーティファクトを受け取りましょう。</figcaption>
      </figure>

      <h2>制作ランタイムが邪魔をしない</h2>
      <p>連携を動かすためだけに、別のアプリを開いておく必要はありません。<strong>署名済みの Open Design ランタイムは、Codex が必要としたときにヘッドレスで起動します。</strong>見守るための余分なウィンドウも、手作業でつなぐローカルスタックも不要です。</p>
      <p>失敗時の経路も実用的です。Studio が外部ホスト内で正常に読み込めない場合でも、Codex は安定したプレビューをすぐに届けます。一つの表示面が初期化できなかったために実行全体が失敗するのを眺めるのではなく、まず成果を受け取り、必要なときに完全なワークスペースで開けます。</p>
      <p>ローカルはローカルのままです。Local Codex を明示的に選ぶと、実行がプラグインへ戻ったり、Cloud のサインインフローへ送られたりすることはありません。Open Design Cloud と Local Codex は別々の選択肢として維持され、BYOK プロバイダー設定はこのデバイスのブラウザストレージに保存され、実行中のローカル処理にだけ渡されます。</p>

      <h2>もう一度プロンプトを書くのではなく、手で仕上げる</h2>
      <p>ビジュアル制作の最後の 10% は、たいてい具体的です。この要素を動かす、そのテキストを詰める、画像を切り抜く、二つのオブジェクトをそろえる。修正のたびにチャットを介すると、小さな変更が必要以上に遅くなっていました。</p>
      <p>0.17.0 では、<strong>Manual Edit が完全な仕上げワークフローになります。</strong>要素を直接選択して移動やサイズ変更を行い、テキストを編集し、色や配置を変え、複製または削除し、画像を差し替え、切り抜き、貼り付け、ドロップできます。ライブの整列ガイドが各要素を適切な位置へ導きます。取り消しとやり直しでは、再読み込みのちらつきを起こさずキャンバスが保たれます。</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="デザインキャンバス上で選択された要素をリサイズハンドルが囲み、整列ガイド、テキストコントロール、画像切り抜きツールがほぼ白い編集背景の上に精密な線画として構成されている様子" />
        <figcaption>方向づけにはプロンプトを使い、手のほうが素早く表現できる細かなビジュアル修正には直接操作を使いましょう。</figcaption>
      </figure>
      <p>書き出しには、構成した結果がそのまま反映されます。画像の書き出しは現在の Preview ビューポートに従い、フレームワーク製のデッキはデスクトップフレームに合わせて変形されるのではなく、制作時のサイズでキャプチャされます。</p>

      <h2>明確なブリーフなら、すぐに始まる</h2>
      <p>Agent が質問すべきなのは、答えによって結果が変わるときです。すべてのタスクを面談から始める必要はありません。<strong>最初のプロンプトに十分な方向性が含まれていれば、Open Design はすぐに開始します。</strong>本当に判断が足りない場合は、その判断が重要になる瞬間に、焦点を絞った質問を一つだけ行います。</p>
      <p>これによりリズムが変わります。力強いブリーフは、すぐに制作へ移ります。曖昧なブリーフには必要な確認が入りますが、最初の有用な結果を妨げるのではなく、プロセス上の具体的な分岐に結び付いた質問になります。</p>

      <h2>適さないモデルの選択は、実行を無駄にする前に失敗する</h2>
      <p>一部の Codex モデルと CLI の組み合わせは、互いに動作しないことが分かっています。0.17.0 は起動前にその組み合わせを検出し、役に立つモデル切り替え経路を提示するとともに、ツール実行後のタイムアウトをより正確に診断します。誤解を招く再試行に送り込まれることはありません。</p>
      <p>モデルの選択肢は境界を曖昧にすることなく広がります。GPT-5.5 Fast が明確な速度優先の選択肢として加わり、Raven がワンクリックの MCP セットアップに対応し、Open Design は Windows 上の公式 Grok Build インストールを自動検出します。</p>

      <h2>止まったアップデートが行き止まりにならない</h2>
      <p>アップデートの問題には、キャッシュディレクトリを手作業で探さなくても済む復旧経路が必要です。設定から壊れたアップデートキャッシュを消去し、インストール済みの世代が安全でないと判明した場合は再インストールし、ダウンロード済みペイロードによるクラッシュから復旧できるようになりました。<strong>アプリは最後に動作したバージョンへロールバックし、次の正常なアップデートで自らを修復します。</strong>継続的に取り組んでくれた <a href="https://github.com/PerishCode">@PerishCode</a> に感謝します。</p>
      <p>パッケージ版アプリは Web 表示が終了した場合も復旧します。制限付きポリシーのもとで失敗した sidecar を再起動し、アプリ全体の再起動を強制することなく <code>od://</code> リクエストを再接続します。</p>

      <h2>Codex にデザインのセンスを与える五十の方法</h2>
      <p>新しい公開 <strong>Codex Design コレクションには、厳選されたインストール可能な 50 のスキルが集まっています。</strong>インターフェースデザイン、ビジュアルシステム、Figma-to-code、モーション、画像生成、フロントエンドのクラフトを網羅します。各項目には出典、実践的なガイダンス、ローカライズされた詳細ページがあり、「Codex のセンスを高める」という言葉が、曖昧な約束ではなく具体的なワークフローになります。</p>
      <p>Codex Slides も加わり、プロンプトからデッキまでの全ワークフローを網羅します。シナリオとスタイルの選択、アウトラインの調整、直接編集、そして書き出しです。新しいコミュニティワークフローはさらに幅を広げます。Humanize PPT はラフな素材を意図のあるブリーフと検証済みの書き出しを備えたプレゼンテーションへ変え、Atelier Zero は本番で使える画像プロンプトライブラリを提供します。</p>

      <h2>0.17.0 に含まれるその他の変更</h2>
      <ul>
        <li><strong>Chat はターミナルのように見せずに作業を表示します</strong> — 控えめな実行開示、空のツール行の非表示、より忠実な ACP ツールアクティビティ。<a href="https://github.com/mrcfps">@mrcfps</a> と <a href="https://github.com/thatditsyboy">@thatditsyboy</a> に感謝します。</li>
        <li><strong>ワークスペースのタブが内容を正しく伝えます</strong> — 長いラベルも見える状態を保ち、Design System の命名も一貫します。<a href="https://github.com/BigBandaid2">@BigBandaid2</a> に感謝します。</li>
        <li><strong>ダーク優先のブランドはダーク優先のままです</strong> — 派生テーマが意図したキャンバスを保ち、勝手に明るくすることはありません。<a href="https://github.com/wiggdevin">@wiggdevin</a> に感謝します。</li>
        <li><strong>プロジェクトがタブを増殖させません</strong> — 同じプロジェクトを繰り返し開いても重複は生まれません。<a href="https://github.com/pcherkashin">@pcherkashin</a> に感謝します。</li>
        <li><strong>中断された作業は古い進捗を消去します</strong> — 完了したフォローアップが、Chat の上に古い Todo スナップショットを残しません。<a href="https://github.com/Siri-Ray">@Siri-Ray</a> に感謝します。</li>
        <li><strong>ACP Agent は完全な履歴を残します</strong> — 実際のツール名、入力、結果、タイミング、使用量が Chat と診断に記録されます。</li>
        <li><strong>パッケージ版ランタイムがより確実に起動します</strong> — Linux ペイロードは初回使用前にウォームアップされ、パッケージ版ラッパーは同梱されたランタイムを使います。</li>
      </ul>

      <h2>今日からできること</h2>
      <table>
        <thead>
          <tr><th>あなたが……</th><th>ここから始めましょう</th></tr>
        </thead>
        <tbody>
          <tr><td>すでに Codex を使っている</td><td>Open Design プラグインをインストールし、具体的なビジュアルブリーフで <code>@open-design</code> を呼び出して、結果を Preview または Studio で開く</td></tr>
          <tr><td>生成された成果を仕上げている</td><td>一つの要素を選択し、別のプロンプトで説明する代わりに、最後のビジュアル修正を直接行う</td></tr>
          <tr><td>ローカルで作業している</td><td>Local Codex を明示的に選び、デバイスに保存された BYOK 設定を使って実行がローカルに留まることを確認する</td></tr>
          <tr><td>プレゼンテーションを制作している</td><td>ブリーフからアウトライン、編集、書き出しまでの全ワークフローに Codex Slides を試す</td></tr>
          <tr><td>問題のあるアップデートから復旧している</td><td>設定を開き、壊れたキャッシュを消去するか再インストールして、アプリを最後に動作した世代へ戻す</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>Codex はすでに、作りたいものを言葉にできる場所でした。0.17.0 は、その結果を見て形づくる場所を与えます。実際の会話から Open Design を呼び出し、明確なブリーフならすぐに開始し、もう一段落を書く代わりに一つの小さな修正を手で加えてみてください。</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Open Design をダウンロード</a>。</p>
      <p>11 日間で 62 件の PR。会話、アーティファクト、キャンバスを一つのワークフローにつないだ 23 人から寄せられました。デザインワークスペースはもう Codex の隣にあるだけではありません。Codex がそこへ到達できます。私たちは見ています。🚀</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0：確実なデリバリー</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1：より鮮明な視界、より長いフロー</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0：コストを抑え、より速く届ける</a></li>
      </ul>
  ko:
    title: 'Open Design 0.17.0: Codex를 위한 Open Design'
    summary: 'open-design-v0.17.0 — 11일 동안 23명의 기여자가 만든 62개 PR. 이제 Codex에 자체 디자인 워크스페이스가 생겼습니다. 대화에서 @open-design을 호출하고, 브리프를 실제 Preview 또는 Studio 아티팩트로 바꾼 뒤, 작은 수정마다 프롬프트를 다시 쓰지 않고 캔버스에서 시각적 디테일을 직접 마무리하세요.'
    category: '제품'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, 2026년 8월 3일 공개. <strong>11일 동안 23명의 기여자가 62개의 PR을 만들었습니다.</strong> 이제 Codex에 자체 디자인 워크스페이스가 생겼습니다. Codex 대화에서 <code>@open-design</code>을 호출해 아이디어나 브리프를 실제로 편집할 수 있는 아티팩트로 바꾸고, Codex 워크플로를 떠나지 않은 채 Open Design Studio에서 계속 만들고 다듬으세요.</p>
      <p>모든 변경 사항이 궁금한가요? <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">GitHub의 전체 릴리스 노트</a>를 읽어 보세요. 이 글은 제품에 관한 이야기입니다. Codex가 대화에서 시각적 아티팩트까지 어떻게 이어지는지, 마지막 10%를 위해 더는 다른 프롬프트가 필요하지 않은 이유, 그리고 그 과정에서 무엇이 더 안정적으로 바뀌었는지를 살펴봅니다.</p>

      <h2>Codex에 자체 디자인 워크스페이스가 생겼습니다</h2>
      <p>코딩 Agent는 의도를 파일로 바꾸는 데 능하지만, 시각 작업에는 늘 두 번째 환경이 필요했습니다. 채팅에서 아이디어를 설명하고, 결과를 디자인 도구로 옮긴 다음, 수정할 때마다 내용을 다시 다른 프롬프트로 바꿔 전달해야 했습니다. 0.17.0에서는 <strong>Codex Desktop과 CLI가 Open Design을 완전한 크리에이티브 엔진으로 호출할 수 있습니다.</strong> 대화와 디자인 워크스페이스가 하나의 연속된 워크플로가 됩니다.</p>
      <p><code>@open-design</code>으로 시작하세요. 비주얼 브리프를 확인하고 Open Design Cloud 또는 지원되는 로컬 런타임을 선택하면 실제 Preview 또는 Studio 결과를 받을 수 있습니다. 대화에 붙여 넣은 스크린샷이 아닙니다. 열어서 살펴보고, 편집하고, 내보내고, 계속 다듬을 수 있는 아티팩트입니다.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Agent 대화가 편집 가능한 디자인 캔버스와 안정적인 프리뷰로 이어지고, 연결된 아티팩트가 미색의 편집 배경 위 정밀한 초록색 선택 프레임에 담긴 모습" />
        <figcaption>Codex에서 Open Design을 호출하고 브리프를 합의한 뒤, 결과물의 그림이 아니라 실제 Preview 또는 Studio 아티팩트를 받으세요.</figcaption>
      </figure>

      <h2>크리에이티브 런타임이 방해하지 않습니다</h2>
      <p>연동을 작동시키기 위해 두 번째 앱을 열어 둘 필요는 없습니다. <strong>Codex가 필요로 할 때 서명된 Open Design 런타임이 헤드리스로 시작됩니다.</strong> 지켜봐야 할 별도 창도 없고, 로컬 스택을 손으로 연결할 일도 없습니다.</p>
      <p>실패 경로도 실용적입니다. Studio가 외부 호스트 안에서 원활히 로드되지 않더라도 Codex는 안정적인 프리뷰를 즉시 전달합니다. 한 표시 화면이 초기화되지 않아 전체 실행이 실패하는 것을 지켜보는 대신, 먼저 결과를 받고 필요할 때 전체 워크스페이스에서 열 수 있습니다.</p>
      <p>로컬은 로컬로 남습니다. Local Codex를 명시적으로 선택하면 실행이 플러그인으로 되돌아가거나 Cloud 로그인 흐름으로 보내지지 않습니다. Open Design Cloud와 Local Codex는 서로 다른 선택지로 유지되며, BYOK 제공자 설정은 이 기기의 브라우저 저장소에 보관되고 활성 로컬 실행에만 전달됩니다.</p>

      <h2>다른 프롬프트가 아니라 손으로 마무리하세요</h2>
      <p>시각 작업의 마지막 10%는 대개 구체적입니다. 이 요소를 옮기고, 저 텍스트를 좁히고, 이미지를 자르고, 두 개체를 정렬하는 일입니다. 수정할 때마다 채팅을 거치면서 작은 변경이 필요 이상으로 느려졌습니다.</p>
      <p>0.17.0에서는 <strong>Manual Edit가 완전한 마무리 워크플로가 됩니다.</strong> 요소를 직접 선택하고, 이동하거나 크기를 조정하고, 텍스트를 편집하고, 색상과 정렬을 바꾸고, 복제하거나 삭제하고, 이미지를 교체하거나 자르고, 붙여 넣거나 드롭하세요. 실시간 정렬 가이드가 요소를 제자리에 놓도록 돕습니다. 실행 취소와 다시 실행은 재로딩으로 화면을 번쩍이게 하지 않고 캔버스를 보존합니다.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="디자인 캔버스에서 선택된 요소가 크기 조절 핸들에 둘러싸이고 정렬 가이드, 텍스트 컨트롤, 이미지 자르기 도구가 미색의 편집 배경 위 정밀한 선화로 구성된 모습" />
        <figcaption>방향을 정할 때는 프롬프트를 사용하고, 손이 더 빠르게 표현할 수 있는 작은 시각적 수정에는 직접 조작을 사용하세요.</figcaption>
      </figure>
      <p>내보내기는 구성한 결과를 그대로 따릅니다. 이미지 내보내기는 활성 Preview 뷰포트를 존중하고, 프레임워크 덱은 데스크톱 프레임에 맞춰 변형되지 않고 제작된 크기로 캡처됩니다.</p>

      <h2>명확한 브리프는 즉시 시작됩니다</h2>
      <p>Agent는 답에 따라 결과가 달라질 때 질문해야 합니다. 모든 작업을 인터뷰로 시작할 필요는 없습니다. <strong>첫 프롬프트에 이미 충분한 방향이 담겨 있다면 이제 Open Design이 즉시 시작합니다.</strong> 실제로 결정이 빠져 있다면, 그 결정이 중요한 순간에 하나의 초점 있는 질문을 합니다.</p>
      <p>작업의 리듬이 달라집니다. 좋은 브리프는 즉시 작업이 됩니다. 모호한 브리프는 여전히 필요한 확인을 거치지만, 그 질문은 첫 유용한 결과를 가로막는 대신 프로세스의 구체적인 갈림길에 연결됩니다.</p>

      <h2>잘못된 모델 선택은 실행을 낭비하기 전에 실패합니다</h2>
      <p>일부 Codex 모델과 CLI 조합은 함께 작동하지 않는 것으로 알려져 있습니다. 0.17.0은 실행 전에 그런 조합을 감지하고, 유용한 모델 전환 경로를 제공하며, 도구 호출 후 발생하는 타임아웃을 더 정확히 진단합니다. 더는 잘못된 재시도로 유도하지 않습니다.</p>
      <p>나머지 모델 영역은 경계를 흐리지 않으면서 확장됩니다. GPT-5.5 Fast가 명확한 속도 우선 선택지로 추가되고, Raven이 원클릭 MCP 설정에 합류하며, Open Design은 Windows에서 공식 Grok Build 설치를 자동으로 찾습니다.</p>

      <h2>멈춘 업데이트가 더는 막다른 길이 아닙니다</h2>
      <p>업데이트 문제에는 캐시 디렉터리를 손으로 찾지 않아도 되는 복구 경로가 있어야 합니다. 이제 설정에서 손상된 업데이트 캐시를 지우고, 설치된 세대가 안전하지 않은 것으로 확인되면 다시 설치하며, 다운로드된 페이로드로 인한 충돌에서 복구할 수 있습니다. <strong>앱은 마지막으로 작동한 버전으로 롤백한 뒤 다음 정상 업데이트에서 스스로 복구합니다.</strong> 이 작업을 꾸준히 이어 온 <a href="https://github.com/PerishCode">@PerishCode</a>에게 감사드립니다.</p>
      <p>패키지 앱은 웹 화면이 종료되어도 복구합니다. 제한된 정책 아래 실패한 sidecar를 다시 시작하고, 앱 전체를 재실행하지 않아도 <code>od://</code> 요청을 다시 연결합니다.</p>

      <h2>Codex에 디자인 감각을 더하는 쉰 가지 방법</h2>
      <p>새로운 공개 <strong>Codex Design 컬렉션에는 엄선된 설치 가능한 스킬 50개가 모여 있습니다.</strong> 인터페이스 디자인, 비주얼 시스템, Figma-to-code, 모션, 이미지 생성, 프런트엔드 크래프트를 아우릅니다. 각 항목에는 출처, 실용적인 안내, 현지화된 상세 페이지가 있어 “Codex에 더 나은 감각을 준다”는 말을 모호한 약속이 아닌 구체적인 워크플로로 바꿉니다.</p>
      <p>Codex Slides도 이 제품군에 합류해 프롬프트에서 덱까지 전체 워크플로를 다룹니다. 시나리오와 스타일 선택, 개요 다듬기, 직접 편집, 내보내기까지 이어집니다. 새로운 커뮤니티 워크플로는 범위를 더욱 넓힙니다. Humanize PPT는 거친 원본 자료를 의도적인 브리프와 검증된 내보내기를 갖춘 프레젠테이션으로 바꾸고, Atelier Zero는 프로덕션에 바로 쓸 수 있는 이미지 프롬프트 라이브러리를 제공합니다.</p>

      <h2>0.17.0에 함께 담긴 것들</h2>
      <ul>
        <li><strong>Chat이 터미널처럼 보이지 않으면서 작업을 보여 줍니다</strong> — 더 조용한 실행 공개, 빈 도구 행 숨김, 더 충실한 ACP 도구 활동. <a href="https://github.com/mrcfps">@mrcfps</a>와 <a href="https://github.com/thatditsyboy">@thatditsyboy</a>에게 감사드립니다.</li>
        <li><strong>워크스페이스 탭이 내용을 제대로 알려 줍니다</strong> — 긴 라벨도 계속 보이고 Design System 명명도 일관되게 유지됩니다. <a href="https://github.com/BigBandaid2">@BigBandaid2</a>에게 감사드립니다.</li>
        <li><strong>다크 퍼스트 브랜드는 다크 퍼스트를 유지합니다</strong> — 파생 테마가 의도한 캔버스를 보존하고 몰래 밝게 바꾸지 않습니다. <a href="https://github.com/wiggdevin">@wiggdevin</a>에게 감사드립니다.</li>
        <li><strong>프로젝트가 탭을 계속 늘리지 않습니다</strong> — 같은 프로젝트를 반복해서 열어도 중복이 생기지 않습니다. <a href="https://github.com/pcherkashin">@pcherkashin</a>에게 감사드립니다.</li>
        <li><strong>중단된 작업이 오래된 진행 상황을 지웁니다</strong> — 완료된 후속 작업이 Chat 위에 낡은 Todo 스냅샷을 남기지 않습니다. <a href="https://github.com/Siri-Ray">@Siri-Ray</a>에게 감사드립니다.</li>
        <li><strong>ACP Agent가 완전한 기록을 남깁니다</strong> — 실제 도구 이름, 입력, 결과, 타이밍, 사용량이 Chat과 진단에 보존됩니다.</li>
        <li><strong>패키지 런타임이 더 안정적으로 시작됩니다</strong> — Linux 페이로드는 처음 사용하기 전에 워밍업되고, 패키지 래퍼는 함께 배포된 런타임을 사용합니다.</li>
      </ul>

      <h2>오늘 무엇을 할 수 있나</h2>
      <table>
        <thead>
          <tr><th>당신이……</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>이미 Codex를 사용하고 있다면</td><td>Open Design 플러그인을 설치하고, 구체적인 비주얼 브리프로 <code>@open-design</code>을 호출한 뒤 결과를 Preview 또는 Studio에서 여세요</td></tr>
          <tr><td>생성된 작업을 다듬고 있다면</td><td>다른 프롬프트로 설명하는 대신 요소 하나를 선택하고 마지막 시각적 수정을 직접 마무리하세요</td></tr>
          <tr><td>로컬에서 작업한다면</td><td>Local Codex를 명시적으로 선택하고, 기기에 저장된 BYOK 설정으로 실행이 로컬에 머무는지 확인하세요</td></tr>
          <tr><td>프레젠테이션을 만든다면</td><td>브리프에서 개요, 편집, 내보내기까지 전체 워크플로에 Codex Slides를 사용해 보세요</td></tr>
          <tr><td>잘못된 업데이트에서 복구한다면</td><td>설정을 열고 손상된 캐시를 지우거나 다시 설치해 앱이 마지막으로 작동한 세대로 돌아가게 하세요</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>Codex는 이미 만들고 싶은 것을 설명하는 곳이었습니다. 0.17.0은 결과를 보고 다듬을 수 있는 공간을 제공합니다. 실제 대화에서 Open Design을 호출하고, 명확한 브리프라면 바로 시작한 뒤, 또 다른 문단을 쓰는 대신 손으로 작은 수정 하나를 해 보세요.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Open Design 다운로드</a>.</p>
      <p>11일 동안 62개의 PR. 대화, 아티팩트, 캔버스를 하나의 워크플로로 연결한 23명이 만들었습니다. 디자인 워크스페이스는 더 이상 Codex 옆에 따로 있지 않습니다. Codex가 그곳에 닿을 수 있습니다. 보고 있습니다. 🚀</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: 확실한 전달</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: 더 또렷한 시야, 더 긴 몰입</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: 비용은 줄이고 출시는 빠르게</a></li>
      </ul>
  de:
    title: 'Open Design 0.17.0: Open Design für Codex'
    summary: 'open-design-v0.17.0 — 62 PRs von 23 Mitwirkenden in 11 Tagen. Codex hat jetzt einen eigenen Design-Workspace: Rufen Sie @open-design aus einer Unterhaltung auf, verwandeln Sie ein Briefing in ein echtes Preview- oder Studio-Artefakt und vollenden Sie die visuellen Details direkt auf der Canvas, statt jede kleine Korrektur mit einem neuen Prompt zu umschreiben.'
    category: 'Produkt'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, veröffentlicht am 3. August 2026. <strong>62 PRs von 23 Mitwirkenden in 11 Tagen.</strong> Codex hat jetzt einen eigenen Design-Workspace. Rufen Sie <code>@open-design</code> aus einer Codex-Unterhaltung auf, verwandeln Sie eine Idee oder ein Briefing in ein echtes bearbeitbares Artefakt und gestalten und verfeinern Sie es anschließend in Open Design Studio weiter, ohne den Codex-Workflow zu verlassen.</p>
      <p>Sie möchten jede Änderung sehen? Lesen Sie die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">vollständigen Release Notes auf GitHub</a>. Hier geht es um die Produktgeschichte: wie Codex von einer Unterhaltung zu einem visuellen Artefakt gelangt, warum die letzten 10 % keinen weiteren Prompt mehr brauchen und was auf diesem Weg zuverlässiger geworden ist.</p>

      <h2>Codex hat einen eigenen Design-Workspace</h2>
      <p>Coding-Agents können Absichten gut in Dateien verwandeln, doch visuelle Arbeit verlangte bisher immer nach einer zweiten Umgebung: die Idee im Chat erklären, das Ergebnis in ein Design-Tool übertragen und dann jede Korrektur wieder in einen weiteren Prompt übersetzen. In 0.17.0 <strong>können Codex Desktop und CLI Open Design als vollständige Kreativ-Engine aufrufen.</strong> Die Unterhaltung und der Design-Workspace werden zu einem durchgängigen Workflow.</p>
      <p>Beginnen Sie mit <code>@open-design</code>. Bestätigen Sie ein visuelles Briefing, wählen Sie Open Design Cloud oder eine unterstützte lokale Runtime und erhalten Sie ein echtes Preview- oder Studio-Ergebnis. Das Ergebnis ist kein Screenshot, der in die Unterhaltung eingefügt wird. Es ist ein Artefakt, das Sie öffnen, prüfen, bearbeiten, exportieren und weiter verfeinern können.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Eine Agent-Unterhaltung geht in eine bearbeitbare Design-Canvas und eine stabile Vorschau über; das verbundene Artefakt liegt in einem präzisen grünen Auswahlrahmen auf nahezu weißem redaktionellem Grund" />
        <figcaption>Rufen Sie Open Design aus Codex auf, stimmen Sie das Briefing ab und erhalten Sie ein echtes Preview- oder Studio-Artefakt statt eines Bildes davon.</figcaption>
      </figure>

      <h2>Die Kreativ-Runtime tritt in den Hintergrund</h2>
      <p>Sie sollten nicht noch eine zweite App geöffnet haben müssen, nur damit die Integration funktioniert. <strong>Die signierte Open Design-Runtime startet ohne Oberfläche, wenn Codex sie braucht</strong>; es gibt also kein zusätzliches Fenster, das beaufsichtigt werden muss, und keinen lokalen Stack, den Sie von Hand verdrahten müssen.</p>
      <p>Auch der Fehlerpfad ist praktisch. Wenn Studio in einem externen Host nicht sauber geladen werden kann, liefert Codex trotzdem sofort die stabile Vorschau. Sie erhalten zuerst die Arbeit und können sie bei Bedarf im vollständigen Workspace öffnen, statt zuzusehen, wie der gesamte Lauf fehlschlägt, weil eine einzelne Darstellungsoberfläche nicht initialisiert wurde.</p>
      <p>Lokal bleibt lokal. Wenn Sie ausdrücklich Local Codex wählen, führt der Lauf nicht mehr zurück in das Plugin und schickt Sie nicht in einen Cloud-Anmeldeprozess. Open Design Cloud und Local Codex bleiben klar getrennte Optionen, und die BYOK-Provider-Konfiguration verbleibt im Browser-Speicher dieses Geräts und wird nur an den aktiven lokalen Lauf übergeben.</p>

      <h2>Vollenden Sie die Arbeit mit den Händen, nicht mit einem weiteren Prompt</h2>
      <p>Die letzten 10 % visueller Arbeit sind meist konkret: dieses Element verschieben, jenen Text straffen, das Bild zuschneiden, diese beiden Objekte ausrichten. Jede Korrektur über den Chat zu senden, machte kleine Änderungen langsamer als nötig.</p>
      <p>In 0.17.0 wird <strong>Manual Edit zu einem vollständigen Workflow für den letzten Schliff</strong>. Wählen Sie ein Element direkt aus, verschieben Sie es oder ändern Sie seine Größe, bearbeiten Sie Text, ändern Sie Farbe und Ausrichtung, duplizieren oder löschen Sie es und ersetzen, beschneiden, fügen oder ziehen Sie Bilder ein. Live-Ausrichtungshilfen helfen dabei, alles an die richtige Stelle zu setzen. Rückgängig und Wiederholen erhalten die Canvas, statt sie bei jedem Neuladen aufblitzen zu lassen.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Eine Design-Canvas mit einem ausgewählten Element, umgeben von Ziehpunkten, Ausrichtungshilfen, Textsteuerungen und Werkzeugen zum Zuschneiden von Bildern, als präzise Linienzeichnung auf nahezu weißem redaktionellem Grund komponiert" />
        <figcaption>Nutzen Sie Prompts für die Richtung und direkte Bearbeitung für kleine visuelle Korrekturen, die sich mit den Händen schneller ausdrücken lassen.</figcaption>
      </figure>
      <p>Exporte folgen dem Ergebnis, das Sie komponiert haben. Der Bildexport berücksichtigt den aktiven Preview-Viewport, und Framework-Decks werden in ihrer vorgesehenen Größe erfasst, statt durch den Desktop-Rahmen umgeformt zu werden.</p>

      <h2>Klare Briefings starten sofort</h2>
      <p>Ein Agent sollte eine Frage stellen, wenn die Antwort das Ergebnis verändert, nicht weil jede Aufgabe mit einem Interview beginnen muss. <strong>Open Design startet jetzt sofort, wenn der erste Prompt bereits genügend Richtung vorgibt.</strong> Fehlt eine echte Entscheidung, stellt es genau in dem Moment eine fokussierte Frage, in dem diese Entscheidung relevant wird.</p>
      <p>Das verändert den Rhythmus. Aus einem starken Briefing wird sofort Arbeit. Ein mehrdeutiges Briefing erhält weiterhin die nötige Klärung, doch die Frage ist an eine konkrete Verzweigung im Prozess gebunden, statt zwischen Ihnen und dem ersten nützlichen Ergebnis zu stehen.</p>

      <h2>Ungeeignete Modellkombinationen scheitern, bevor sie einen Lauf verschwenden</h2>
      <p>Einige Kombinationen aus Codex-Modell und CLI funktionieren bekanntermaßen nicht miteinander. 0.17.0 erkennt diese Kombinationen vor dem Start, bietet einen hilfreichen Weg zum Modellwechsel und diagnostiziert Timeouts nach Tool-Aufrufen genauer, statt Sie durch irreführende Wiederholungsversuche zu schicken.</p>
      <p>Die übrige Modelloberfläche wächst, ohne die Grenzen zu verwischen: GPT-5.5 Fast kommt als ausdrücklich geschwindigkeitsorientierte Option hinzu, Raven ergänzt die MCP-Einrichtung mit einem Klick, und Open Design erkennt die offizielle Grok Build-Installation unter Windows automatisch.</p>

      <h2>Ein festgefahrenes Update ist keine Sackgasse mehr</h2>
      <p>Ein Update-Problem sollte einen Wiederherstellungsweg bieten, bei dem Sie nicht von Hand nach einem Cache-Verzeichnis suchen müssen. In den Einstellungen lässt sich jetzt ein beschädigter Update-Cache leeren, eine bekanntermaßen unsichere installierte Generation neu installieren und nach dem Absturz eines heruntergeladenen Payloads wiederherstellen. <strong>Die App kehrt zur letzten funktionierenden Version zurück und repariert sich beim nächsten fehlerfreien Update selbst.</strong> Danke <a href="https://github.com/PerishCode">@PerishCode</a> für die ausdauernde Arbeit daran.</p>
      <p>Die paketierte App erholt sich auch, wenn ihre Weboberfläche beendet wird: Sie startet den ausgefallenen Sidecar nach einer begrenzten Richtlinie neu und verbindet <code>od://</code>-Anfragen wieder, ohne einen vollständigen Neustart der App zu erzwingen.</p>

      <h2>Fünfzig Wege, Codex Designgeschmack zu geben</h2>
      <p>Die neue öffentliche <strong>Codex Design-Sammlung vereint 50 kuratierte, installierbare Skills</strong> für Interface-Design, visuelle Systeme, Figma-to-Code, Motion, Bildgenerierung und Frontend-Handwerk. Jeder Eintrag enthält Herkunftsnachweise, praktische Anleitungen und lokalisierte Detailseiten, sodass „Codex besseren Geschmack geben“ zu einer Reihe konkreter Workflows statt eines vagen Versprechens wird.</p>
      <p>Codex Slides ergänzt die Familie ebenfalls und deckt den vollständigen Workflow vom Prompt bis zum Deck ab: Auswahl von Szenario und Stil, Ausarbeitung der Gliederung, direkte Bearbeitung und Export. Neue Community-Workflows erweitern die Bandbreite zusätzlich — Humanize PPT verwandelt grobes Ausgangsmaterial in eine Präsentation mit bewusstem Briefing und geprüftem Export, während Atelier Zero eine produktionsreife Bibliothek für Bild-Prompts bereitstellt.</p>

      <h2>Was sonst noch in 0.17.0 landet</h2>
      <ul>
        <li><strong>Der Chat zeigt die Arbeit, ohne wie ein Terminal zu wirken</strong> — ruhigere Ausführungsdetails, ausgeblendete leere Tool-Zeilen und eine originalgetreuere ACP-Tool-Aktivität. Danke <a href="https://github.com/mrcfps">@mrcfps</a> und <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>Workspace-Tabs sagen, was sie enthalten</strong> — lange Beschriftungen bleiben sichtbar, und die Benennung von Design System bleibt einheitlich. Danke <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>Dark-first-Marken bleiben dark-first</strong> — abgeleitete Themes bewahren die vorgesehene Canvas, statt sie stillschweigend auf hell umzustellen. Danke <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>Projekte vervielfachen keine Tabs mehr</strong> — das wiederholte Öffnen desselben Projekts erzeugt keine Duplikate mehr. Danke <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>Unterbrochene Arbeit entfernt veralteten Fortschritt</strong> — ein abgeschlossener Folgeschritt lässt keinen überholten Todo-Snapshot mehr über dem Chat stehen. Danke <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>ACP-Agents hinterlassen eine vollständige Spur</strong> — echte Tool-Namen, Eingaben, Ergebnisse, Zeitangaben und Nutzung bleiben in Chat und Diagnose erhalten.</li>
        <li><strong>Paketierte Runtimes starten zuverlässiger</strong> — Linux-Payloads werden vor der ersten Nutzung vorgewärmt, und paketierte Wrapper verwenden die Runtime, mit der sie ausgeliefert wurden.</li>
      </ul>

      <h2>Was Sie heute damit tun können</h2>
      <table>
        <thead>
          <tr><th>Wenn Sie …</th><th>Fangen Sie hier an</th></tr>
        </thead>
        <tbody>
          <tr><td>Codex bereits verwenden</td><td>Installieren Sie das Open Design-Plugin, rufen Sie <code>@open-design</code> mit einem konkreten visuellen Briefing auf und öffnen Sie das Ergebnis in Preview oder Studio.</td></tr>
          <tr><td>generierte Arbeit verfeinern</td><td>Wählen Sie ein Element aus und nehmen Sie die letzten visuellen Korrekturen direkt vor, statt sie in einem weiteren Prompt zu beschreiben.</td></tr>
          <tr><td>lokal arbeiten</td><td>Wählen Sie ausdrücklich Local Codex und bestätigen Sie, dass der Lauf mit Ihrer auf dem Gerät gespeicherten BYOK-Konfiguration lokal bleibt.</td></tr>
          <tr><td>Präsentationen erstellen</td><td>Probieren Sie Codex Slides für den vollständigen Workflow vom Briefing über die Gliederung und Bearbeitung bis zum Export aus.</td></tr>
          <tr><td>sich von einem fehlerhaften Update erholen</td><td>Öffnen Sie die Einstellungen, leeren Sie den beschädigten Cache oder installieren Sie neu und lassen Sie die App zur letzten funktionierenden Generation zurückkehren.</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Codex war bereits ein Ort, um zu beschreiben, was Sie bauen wollten. 0.17.0 gibt Codex einen Ort, an dem Sie das Ergebnis sehen und gestalten können. Rufen Sie Open Design aus einer echten Unterhaltung auf, lassen Sie ein klares Briefing sofort starten und nehmen Sie dann eine kleine Korrektur mit den Händen statt mit einem weiteren Absatz vor.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Open Design herunterladen</a>.</p>
      <p>62 PRs in 11 Tagen von 23 Menschen, die Unterhaltung, Artefakt und Canvas zu einem Workflow verbunden haben. Der Design-Workspace steht nicht länger neben Codex. Codex kann ihn erreichen. Wir sehen Sie. 🚀</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: verlässliche Auslieferung</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: schärfere Sicht, längerer Flow</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: weniger Kosten, schneller ausliefern</a></li>
      </ul>
  fr:
    title: 'Open Design 0.17.0 : Open Design pour Codex'
    summary: 'open-design-v0.17.0 — 62 PR de 23 contributeurs en 11 jours. Codex dispose désormais de son propre espace de design : appelez @open-design depuis une conversation, transformez un brief en véritable artefact Preview ou Studio, puis finalisez les détails visuels directement sur le canvas au lieu de reformuler chaque petite correction dans un nouveau prompt.'
    category: 'Produit'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, publié le 3 août 2026. <strong>62 PR de 23 contributeurs en 11 jours.</strong> Codex dispose désormais de son propre espace de design. Appelez <code>@open-design</code> depuis une conversation Codex, transformez une idée ou un brief en véritable artefact modifiable, puis continuez à le créer et à l'affiner dans Open Design Studio sans quitter le workflow Codex.</p>
      <p>Vous voulez connaître chaque changement ? Consultez les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">notes de version complètes sur GitHub</a>. Voici l'histoire du produit : comment Codex passe d'une conversation à un artefact visuel, pourquoi les derniers 10 % ne nécessitent plus un nouveau prompt et ce qui est devenu plus fiable en chemin.</p>

      <h2>Codex dispose de son propre espace de design</h2>
      <p>Les agents de code savent transformer une intention en fichiers, mais le travail visuel a toujours exigé un second environnement : expliquer l'idée dans le chat, déplacer le résultat dans un outil de design, puis traduire chaque correction en un nouveau prompt. Dans 0.17.0, <strong>Codex Desktop et CLI peuvent appeler Open Design comme un moteur créatif complet.</strong> La conversation et l'espace de design deviennent un seul workflow continu.</p>
      <p>Commencez avec <code>@open-design</code>. Validez un brief visuel, choisissez Open Design Cloud ou un runtime local pris en charge et obtenez un véritable résultat dans Preview ou Studio. Le résultat n'est pas une capture d'écran collée dans la conversation. C'est un artefact que vous pouvez ouvrir, inspecter, modifier, exporter et continuer à affiner.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Une conversation avec un agent se prolonge dans un canvas de design modifiable et un aperçu stable ; l'artefact connecté est contenu dans un cadre de sélection vert précis sur un fond éditorial presque blanc" />
        <figcaption>Appelez Open Design depuis Codex, mettez-vous d'accord sur le brief et obtenez un véritable artefact Preview ou Studio plutôt qu'une image de celui-ci.</figcaption>
      </figure>

      <h2>Le runtime créatif sait se faire oublier</h2>
      <p>Vous ne devriez pas avoir besoin d'ouvrir une deuxième app uniquement pour faire fonctionner l'intégration. <strong>Le runtime Open Design signé démarre sans interface lorsque Codex en a besoin</strong> : aucune fenêtre supplémentaire à surveiller et aucune stack locale à connecter à la main.</p>
      <p>Le parcours en cas d'échec est lui aussi pragmatique. Si Studio ne peut pas se charger correctement dans un hôte externe, Codex livre tout de même immédiatement l'aperçu stable. Vous obtenez d'abord le travail et pouvez l'ouvrir dans l'espace complet si nécessaire, au lieu de voir toute l'exécution échouer parce qu'une seule surface de présentation ne s'est pas initialisée.</p>
      <p>Le local reste local. Lorsque vous choisissez explicitement Local Codex, l'exécution ne reboucle plus vers le plugin et ne vous envoie pas dans un parcours de connexion Cloud. Open Design Cloud et Local Codex restent deux choix distincts, et la configuration du fournisseur BYOK demeure dans le stockage du navigateur de cet appareil, transmise uniquement à l'exécution locale active.</p>

      <h2>Finalisez avec vos mains, pas avec un nouveau prompt</h2>
      <p>Les derniers 10 % du travail visuel sont généralement concrets : déplacer cet élément, resserrer ce texte, recadrer l'image, aligner ces deux objets. Envoyer chaque correction via le chat rendait les petits changements plus lents qu'ils ne devraient l'être.</p>
      <p>Dans 0.17.0, <strong>Manual Edit devient un workflow complet de finition</strong>. Sélectionnez directement un élément, déplacez-le ou redimensionnez-le, modifiez son texte, sa couleur et son alignement, dupliquez-le ou supprimez-le, puis remplacez, recadrez, collez ou déposez des images. Les guides d'alignement en direct aident chaque pièce à trouver sa place. Annuler et Rétablir préservent le canvas au lieu de le faire clignoter au fil des rechargements.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Un canvas de design avec un élément sélectionné entouré de poignées de redimensionnement, de guides d'alignement, de commandes de texte et d'outils de recadrage d'image, composé en dessin au trait précis sur un fond éditorial presque blanc" />
        <figcaption>Utilisez les prompts pour donner la direction ; utilisez la manipulation directe pour les petites corrections visuelles que vos mains expriment plus vite.</figcaption>
      </figure>
      <p>Les exports respectent le résultat que vous avez composé. L'export d'image suit le viewport Preview actif, et les decks basés sur un framework sont capturés dans leur taille d'origine au lieu d'être remodelés par le cadre du desktop.</p>

      <h2>Les briefs clairs démarrent immédiatement</h2>
      <p>Un agent devrait poser une question lorsque la réponse change le résultat, pas parce que chaque tâche doit commencer par un entretien. <strong>Open Design démarre désormais immédiatement lorsque le premier prompt donne déjà assez de direction.</strong> Lorsqu'une véritable décision manque, il pose une question ciblée au moment où cette décision devient pertinente.</p>
      <p>Le rythme change. Un brief solide se transforme tout de suite en travail. Un brief ambigu reçoit toujours les précisions nécessaires, mais la question est liée à une bifurcation concrète du processus au lieu de se dresser entre vous et le premier résultat utile.</p>

      <h2>Les mauvais choix de modèle échouent avant de gaspiller une exécution</h2>
      <p>Certaines combinaisons de modèle Codex et de CLI sont connues pour être incompatibles. 0.17.0 les détecte avant le lancement, propose un parcours utile pour changer de modèle et diagnostique plus précisément les timeouts après un appel d'outil au lieu de vous entraîner dans des tentatives trompeuses.</p>
      <p>Le reste de la gamme de modèles s'élargit sans brouiller les frontières : GPT-5.5 Fast arrive comme choix explicite privilégiant la vitesse, Raven rejoint la configuration MCP en un clic, et Open Design détecte automatiquement l'installation officielle de Grok Build sous Windows.</p>

      <h2>Une mise à jour bloquée n'est plus une impasse</h2>
      <p>Un problème de mise à jour devrait offrir une voie de récupération qui n'exige pas de trouver un dossier de cache à la main. Les réglages peuvent désormais vider un cache de mise à jour défectueux, réinstaller lorsqu'une génération installée est connue pour être dangereuse et récupérer après le crash d'un payload téléchargé. <strong>L'app revient à la dernière version fonctionnelle et se répare lors de la prochaine mise à jour saine.</strong> Merci à <a href="https://github.com/PerishCode">@PerishCode</a> pour ce travail soutenu.</p>
      <p>L'app packagée récupère également lorsque sa surface web s'arrête : elle redémarre le sidecar défaillant selon une politique limitée et reconnecte les requêtes <code>od://</code> sans imposer un redémarrage complet de l'app.</p>

      <h2>Cinquante façons de donner du goût à Codex en matière de design</h2>
      <p>La nouvelle collection publique <strong>Codex Design réunit 50 skills sélectionnés et installables</strong> couvrant le design d'interface, les systèmes visuels, le Figma-to-code, le motion design, la génération d'images et le savoir-faire frontend. Chaque entrée précise sa provenance, propose des conseils pratiques et dispose de pages de détail localisées : « donner plus de goût à Codex » devient ainsi un ensemble de workflows concrets plutôt qu'une vague promesse.</p>
      <p>Codex Slides rejoint lui aussi la famille et couvre tout le workflow du prompt au deck : choix du scénario et du style, élaboration du plan, modification directe et export. De nouveaux workflows de la communauté élargissent encore les possibilités — Humanize PPT transforme des sources brutes en présentation dotée d'un brief intentionnel et d'un export vérifié, tandis qu'Atelier Zero fournit une bibliothèque de prompts d'image prête pour la production.</p>

      <h2>Ce qui arrive aussi dans 0.17.0</h2>
      <ul>
        <li><strong>Le chat montre le travail sans ressembler à un terminal</strong> — des détails d'exécution plus discrets, les lignes d'outil vides masquées et une activité des outils ACP plus fidèle. Merci à <a href="https://github.com/mrcfps">@mrcfps</a> et <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>Les onglets du workspace indiquent ce qu'ils contiennent</strong> — les libellés longs restent visibles et la terminologie Design System demeure cohérente. Merci à <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>Les marques dark-first restent dark-first</strong> — les thèmes dérivés préservent le canvas prévu au lieu de le rendre discrètement clair. Merci à <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>Les projets cessent de multiplier les onglets</strong> — ouvrir plusieurs fois le même projet ne crée plus de doublons. Merci à <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>Un travail interrompu efface les anciennes progressions</strong> — un suivi terminé ne laisse plus un snapshot Todo obsolète au-dessus du chat. Merci à <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>Les agents ACP laissent une trace complète</strong> — les vrais noms d'outils, entrées, résultats, durées et données d'utilisation sont conservés dans le chat et les diagnostics.</li>
        <li><strong>Les runtimes packagés démarrent de façon plus fiable</strong> — les payloads Linux préchauffent avant leur première utilisation, et les wrappers packagés utilisent le runtime avec lequel ils ont été livrés.</li>
      </ul>

      <h2>Ce que vous pouvez en faire aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Utilisez déjà Codex</td><td>Installez le plugin Open Design, appelez <code>@open-design</code> avec un brief visuel concret et ouvrez le résultat dans Preview ou Studio.</td></tr>
          <tr><td>Affinez un travail généré</td><td>Sélectionnez un élément et terminez directement les dernières corrections visuelles au lieu de les décrire dans un nouveau prompt.</td></tr>
          <tr><td>Travaillez en local</td><td>Choisissez explicitement Local Codex et vérifiez que l'exécution reste locale avec votre configuration BYOK stockée sur l'appareil.</td></tr>
          <tr><td>Créez des présentations</td><td>Essayez Codex Slides pour le workflow complet, du brief au plan, puis de la modification à l'export.</td></tr>
          <tr><td>Récupérez après une mauvaise mise à jour</td><td>Ouvrez les réglages, videz le cache défectueux ou réinstallez, puis laissez l'app revenir à la dernière génération fonctionnelle.</td></tr>
        </tbody>
      </table>

      <h2>La suite</h2>
      <p>Codex était déjà un endroit où décrire ce que vous vouliez créer. 0.17.0 lui offre un endroit où voir et façonner le résultat. Appelez Open Design depuis une vraie conversation, laissez un brief clair démarrer immédiatement, puis effectuez une petite correction avec vos mains plutôt qu'avec un paragraphe supplémentaire.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Télécharger Open Design</a>.</p>
      <p>62 PR en 11 jours, par 23 personnes qui ont relié la conversation, l'artefact et le canvas en un seul workflow. L'espace de design ne se trouve plus à côté de Codex. Codex peut y accéder. Nous vous voyons. 🚀</p>

      <h2>À lire aussi</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0 : une livraison fiable</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1 : une vision plus nette, un flow plus long</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0 : moins de coûts, une livraison plus rapide</a></li>
      </ul>
  ru:
    title: 'Open Design 0.17.0: Open Design для Codex'
    summary: 'open-design-v0.17.0 — 62 PR от 23 участников за 11 дней. Теперь у Codex есть собственное пространство для дизайна: вызовите @open-design из диалога, превратите бриф в настоящий артефакт Preview или Studio и завершите визуальные детали прямо на холсте, вместо того чтобы описывать каждую небольшую правку новым промптом.'
    category: 'Продукт'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, опубликован 3 августа 2026 года. <strong>62 PR от 23 участников за 11 дней.</strong> Теперь у Codex есть собственное пространство для дизайна. Вызовите <code>@open-design</code> из диалога с Codex, превратите идею или бриф в настоящий редактируемый артефакт, а затем продолжайте создавать и дорабатывать его в Open Design Studio, не покидая рабочий процесс Codex.</p>
      <p>Хотите увидеть все изменения? Прочитайте <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">полные примечания к релизу на GitHub</a>. А здесь — история продукта: как Codex переходит от диалога к визуальному артефакту, почему последние 10 % больше не требуют нового промпта и что по пути стало надёжнее.</p>

      <h2>У Codex есть собственное пространство для дизайна</h2>
      <p>Агенты для программирования хорошо превращают намерения в файлы, но визуальная работа всегда требовала второй среды: объяснить идею в чате, перенести результат в инструмент дизайна, а затем снова переводить каждую правку в очередной промпт. В 0.17.0 <strong>Codex Desktop и CLI могут вызывать Open Design как полноценный творческий движок.</strong> Диалог и пространство для дизайна превращаются в единый непрерывный рабочий процесс.</p>
      <p>Начните с <code>@open-design</code>. Подтвердите визуальный бриф, выберите Open Design Cloud или поддерживаемый локальный runtime и получите настоящий результат в Preview или Studio. Результат — не скриншот, вставленный в диалог. Это артефакт, который можно открыть, проверить, отредактировать, экспортировать и продолжить дорабатывать.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Диалог с агентом переходит в редактируемый дизайн-холст и стабильный предпросмотр; связанный артефакт заключён в точную зелёную рамку выделения на почти белом редакционном фоне" />
        <figcaption>Вызовите Open Design из Codex, согласуйте бриф и получите настоящий артефакт Preview или Studio, а не его изображение.</figcaption>
      </figure>

      <h2>Творческий runtime не мешает работе</h2>
      <p>Вам не должно требоваться открывать второе приложение только ради работы интеграции. <strong>Подписанный runtime Open Design запускается без интерфейса, когда он нужен Codex</strong>, поэтому следить за лишним окном не приходится, а локальный стек не нужно соединять вручную.</p>
      <p>Сценарий сбоя тоже практичен. Если Studio не удаётся корректно загрузить во внешнем хосте, Codex всё равно сразу предоставляет стабильный предпросмотр. Сначала вы получаете результат и при необходимости можете открыть его в полном рабочем пространстве, вместо того чтобы наблюдать, как весь запуск завершается неудачей из-за того, что одна поверхность представления не инициализировалась.</p>
      <p>Локальное остаётся локальным. Когда вы явно выбираете Local Codex, запуск больше не возвращается в плагин и не перенаправляет вас в процесс входа в Cloud. Open Design Cloud и Local Codex остаются отдельными вариантами, а конфигурация провайдера BYOK хранится в браузере этого устройства и передаётся только активному локальному запуску.</p>

      <h2>Завершайте работу руками, а не новым промптом</h2>
      <p>Последние 10 % визуальной работы обычно вполне конкретны: передвинуть этот элемент, сделать этот текст плотнее, обрезать изображение, выровнять два объекта. Отправка каждой правки через чат замедляла небольшие изменения сильнее, чем следовало.</p>
      <p>В 0.17.0 <strong>Manual Edit становится полноценным процессом финальной доработки</strong>. Выберите элемент напрямую, переместите его или измените размер, отредактируйте текст, поменяйте цвет и выравнивание, продублируйте или удалите его, а также заменяйте, обрезайте, вставляйте или перетаскивайте изображения. Интерактивные направляющие помогают деталям занять свои места. Отмена и повтор сохраняют холст, а не заставляют его мигать при перезагрузке.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Дизайн-холст с выбранным элементом, окружённым маркерами изменения размера, направляющими выравнивания, элементами управления текстом и инструментами обрезки изображений; композиция выполнена точной линейной графикой на почти белом редакционном фоне" />
        <figcaption>Используйте промпты, чтобы задать направление, а прямое управление — для небольших визуальных правок, которые руки выражают быстрее.</figcaption>
      </figure>
      <p>Экспорт следует созданному вами результату. Экспорт изображений учитывает активный viewport Preview, а deck-файлы на основе фреймворков захватываются в авторском размере, а не подгоняются под рамку desktop-приложения.</p>

      <h2>Чёткие брифы запускаются сразу</h2>
      <p>Агент должен задавать вопрос, когда ответ влияет на результат, а не потому, что каждая задача обязана начинаться с интервью. <strong>Теперь Open Design начинает работу сразу, если уже в первом промпте достаточно указаний.</strong> Если важного решения не хватает, он задаёт один конкретный вопрос именно в тот момент, когда это решение становится существенным.</p>
      <p>Это меняет ритм. Сильный бриф сразу превращается в работу. Неоднозначный бриф по-прежнему получает необходимые уточнения, но вопрос привязан к конкретной развилке процесса, а не стоит между вами и первым полезным результатом.</p>

      <h2>Неудачный выбор модели останавливается до того, как запуск будет потрачен впустую</h2>
      <p>Известно, что некоторые сочетания модели Codex и CLI не работают вместе. 0.17.0 выявляет их до запуска, предлагает полезный способ переключить модель и точнее диагностирует таймауты после вызова инструмента, вместо того чтобы направлять вас по кругу ошибочных повторных попыток.</p>
      <p>Остальная поверхность моделей расширяется, не размывая границы: GPT-5.5 Fast становится отдельным выбором с приоритетом скорости, Raven присоединяется к настройке MCP в один клик, а Open Design автоматически обнаруживает официальную установку Grok Build в Windows.</p>

      <h2>Зависшее обновление больше не тупик</h2>
      <p>Проблема с обновлением должна иметь путь восстановления, не требующий вручную искать папку кэша. Теперь в настройках можно очистить повреждённый кэш обновлений, выполнить переустановку, если установленная генерация признана небезопасной, и восстановиться после сбоя загруженного payload. <strong>Приложение откатывается до последней рабочей версии и самостоятельно восстанавливается при следующем исправном обновлении.</strong> Спасибо <a href="https://github.com/PerishCode">@PerishCode</a> за продолжительную работу над этим.</p>
      <p>Пакетное приложение также восстанавливается после остановки своей web-поверхности: оно перезапускает отказавший sidecar по ограниченной политике и заново подключает запросы <code>od://</code>, не требуя полного перезапуска приложения.</p>

      <h2>Пятьдесят способов привить Codex вкус к дизайну</h2>
      <p>Новая публичная <strong>коллекция Codex Design объединяет 50 отобранных skills, готовых к установке</strong>, в областях дизайна интерфейсов, визуальных систем, Figma-to-code, motion-дизайна, генерации изображений и frontend-мастерства. У каждого элемента указано происхождение, есть практические рекомендации и локализованные подробные страницы, поэтому «сделать вкус Codex лучше» превращается в набор конкретных рабочих процессов, а не остаётся расплывчатым обещанием.</p>
      <p>Codex Slides тоже присоединяется к семейству и охватывает весь путь от промпта до deck-файла: выбор сценария и стиля, построение структуры, прямое редактирование и экспорт. Новые процессы сообщества ещё больше расширяют возможности — Humanize PPT превращает грубые исходные материалы в презентацию с продуманным брифом и проверенным экспортом, а Atelier Zero предоставляет готовую к production библиотеку промптов для изображений.</p>

      <h2>Что ещё вошло в 0.17.0</h2>
      <ul>
        <li><strong>Чат показывает работу, не превращаясь в терминал</strong> — более спокойное раскрытие деталей выполнения, скрытые пустые строки инструментов и более точное отображение активности инструментов ACP. Спасибо <a href="https://github.com/mrcfps">@mrcfps</a> и <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>Вкладки рабочего пространства сообщают, что в них находится</strong> — длинные подписи остаются видимыми, а название Design System используется последовательно. Спасибо <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>Бренды dark-first остаются dark-first</strong> — производные темы сохраняют задуманный холст, а не переводят его незаметно в светлый режим. Спасибо <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>Проекты перестают множить вкладки</strong> — повторное открытие одного проекта больше не создаёт дубликаты. Спасибо <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>Прерванная работа очищает устаревший прогресс</strong> — завершённое продолжение больше не оставляет над чатом устаревший snapshot Todo. Спасибо <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>Агенты ACP оставляют полный след</strong> — настоящие названия инструментов, входные данные, результаты, время и использование сохраняются в чате и диагностике.</li>
        <li><strong>Пакетные runtime запускаются надёжнее</strong> — payload для Linux прогревается перед первым использованием, а пакетные wrapper используют runtime, с которым поставлялись.</li>
      </ul>

      <h2>Что можно сделать уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Уже используете Codex</td><td>Установите плагин Open Design, вызовите <code>@open-design</code> с конкретным визуальным брифом и откройте результат в Preview или Studio.</td></tr>
          <tr><td>Дорабатываете сгенерированный результат</td><td>Выберите один элемент и внесите последние визуальные правки напрямую, вместо того чтобы описывать их в новом промпте.</td></tr>
          <tr><td>Работаете локально</td><td>Явно выберите Local Codex и убедитесь, что запуск остаётся локальным с вашей конфигурацией BYOK, сохранённой на устройстве.</td></tr>
          <tr><td>Создаёте презентации</td><td>Попробуйте Codex Slides для полного процесса: от брифа к структуре, затем к редактированию и экспорту.</td></tr>
          <tr><td>Восстанавливаетесь после неудачного обновления</td><td>Откройте настройки, очистите повреждённый кэш или переустановите приложение и позвольте ему вернуться к последней рабочей генерации.</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Codex уже был местом, где можно описать, что вы хотите создать. 0.17.0 даёт ему место, где можно увидеть и сформировать результат. Вызовите Open Design из настоящего диалога, позвольте чёткому брифу запуститься сразу, а затем внесите одну небольшую правку руками, а не ещё одним абзацем.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Скачать Open Design</a>.</p>
      <p>62 PR за 11 дней от 23 человек, которые соединили диалог, артефакт и холст в один рабочий процесс. Пространство для дизайна больше не находится рядом с Codex. Codex может до него дотянуться. Мы вас видим. 🚀</p>

      <h2>Дополнительные материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: надёжная доставка</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: более чёткое зрение, более длинный поток</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: меньше затрат, быстрее выпуск</a></li>
      </ul>
  es:
    title: 'Open Design 0.17.0: Open Design para Codex'
    summary: 'open-design-v0.17.0 — 62 PR de 23 personas en 11 días. Codex ya tiene su propio espacio de trabajo de diseño: llama a @open-design desde una conversación, convierte un brief en un artefacto real de Preview o Studio y remata los detalles visuales directamente en el lienzo en lugar de describir cada pequeña corrección en otro prompt.'
    category: 'Producto'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, publicado el 3 de agosto de 2026. <strong>62 PR de 23 personas en 11 días.</strong> Codex ya tiene su propio espacio de trabajo de diseño. Llama a <code>@open-design</code> desde una conversación de Codex, convierte una idea o un brief en un artefacto real y editable, y sigue creándolo y refinándolo en Open Design Studio sin salir del flujo de trabajo de Codex.</p>
      <p>¿Quieres ver todos los cambios? Lee las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">notas completas de la versión en GitHub</a>. Esta es la historia del producto: cómo pasa Codex de una conversación a un artefacto visual, por qué el último 10 % ya no necesita otro prompt y qué se ha vuelto más fiable por el camino.</p>

      <h2>Codex ya tiene su propio espacio de trabajo de diseño</h2>
      <p>Los agentes de programación son buenos convirtiendo la intención en archivos, pero el trabajo visual siempre ha exigido un segundo entorno: explicar la idea en el chat, llevar el resultado a una herramienta de diseño y traducir después cada corrección en otro prompt. En 0.17.0, <strong>Codex Desktop y CLI pueden llamar a Open Design como un motor creativo completo.</strong> La conversación y el espacio de trabajo de diseño se convierten en un único flujo continuo.</p>
      <p>Empieza con <code>@open-design</code>. Confirma un brief visual, elige Open Design Cloud o un runtime local compatible y recibe un resultado real en Preview o Studio. El resultado no es una captura pegada en la conversación. Es un artefacto que puedes abrir, inspeccionar, editar, exportar y seguir refinando.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Una conversación con un agente que fluye hacia un lienzo de diseño editable y una vista previa estable, con el artefacto conectado dentro de un marco de selección verde preciso sobre un fondo editorial casi blanco" />
        <figcaption>Llama a Open Design desde Codex, acuerda el brief y recibe un artefacto real de Preview o Studio en vez de una imagen del mismo.</figcaption>
      </figure>

      <h2>El runtime creativo deja de estorbar</h2>
      <p>No deberías tener que mantener abierta una segunda app solo para que la integración funcione. <strong>El runtime firmado de Open Design arranca sin interfaz cuando Codex lo necesita</strong>, así que no hay otra ventana que vigilar ni un stack local que conectar a mano.</p>
      <p>La ruta de error también es práctica. Si Studio no puede cargarse correctamente dentro de un host externo, Codex entrega de inmediato la vista previa estable. Recibes primero el trabajo y puedes abrirlo en el espacio completo cuando lo necesites, en vez de ver fallar toda la ejecución porque una superficie de presentación no se inicializó.</p>
      <p>Lo local se queda en local. Cuando eliges explícitamente Local Codex, la ejecución deja de volver al plugin o de enviarte a un flujo de inicio de sesión en Cloud. Open Design Cloud y Local Codex siguen siendo opciones diferenciadas, y la configuración del proveedor BYOK permanece en el almacenamiento del navegador de este dispositivo y solo se transmite a la ejecución local activa.</p>

      <h2>Termina con las manos, no con otro prompt</h2>
      <p>El último 10 % del trabajo visual suele ser concreto: mueve este elemento, ajusta ese texto, recorta la imagen, alinea estos dos objetos. Enviar cada corrección por el chat hacía que los pequeños cambios tardaran más de lo necesario.</p>
      <p>En 0.17.0, <strong>Manual Edit se convierte en un flujo completo de acabado</strong>. Selecciona un elemento directamente, muévelo o cambia su tamaño, edita el texto, modifica el color y la alineación, duplícalo o elimínalo, y sustituye, recorta, pega o suelta imágenes. Las guías de alineación en vivo ayudan a encajar las piezas. Deshacer y rehacer conservan el lienzo en lugar de hacerlo parpadear con una recarga.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Un lienzo de diseño con un elemento seleccionado rodeado de tiradores de tamaño, guías de alineación, controles de texto y herramientas de recorte de imagen, compuesto como un preciso dibujo lineal sobre un fondo editorial casi blanco" />
        <figcaption>Usa prompts para marcar la dirección; usa la manipulación directa para las pequeñas correcciones visuales que tus manos pueden expresar más rápido.</figcaption>
      </figure>
      <p>Las exportaciones respetan el resultado que has compuesto. La exportación de imágenes conserva el viewport activo de la vista previa, y las presentaciones basadas en frameworks se capturan en el tamaño con el que fueron creadas en vez de quedar deformadas por el marco del escritorio.</p>

      <h2>Los briefs claros empiezan de inmediato</h2>
      <p>Un agente debería hacer una pregunta cuando la respuesta cambie el resultado, no porque toda tarea deba empezar con una entrevista. <strong>Open Design ahora empieza de inmediato cuando el primer prompt ya contiene suficiente dirección.</strong> Si falta una decisión real, formula una sola pregunta concreta en el momento en que esa decisión importa.</p>
      <p>Eso cambia el ritmo. Un buen brief se convierte enseguida en trabajo. Un brief ambiguo sigue recibiendo la aclaración que necesita, pero la pregunta queda vinculada a una bifurcación concreta del proceso en vez de interponerse entre tú y el primer resultado útil.</p>

      <h2>Las malas elecciones de modelo fallan antes de desperdiciar una ejecución</h2>
      <p>Se sabe que algunas combinaciones de modelo y CLI de Codex no funcionan juntas. 0.17.0 detecta esas combinaciones antes de arrancar, ofrece una vía útil para cambiar de modelo y diagnostica con más precisión los timeouts posteriores a una herramienta en lugar de hacerte pasar por reintentos engañosos.</p>
      <p>El resto de la oferta de modelos se amplía sin desdibujar los límites: GPT-5.5 Fast llega como una opción explícita que prioriza la velocidad, Raven se incorpora a la configuración MCP con un clic y Open Design detecta automáticamente la instalación oficial de Grok Build en Windows.</p>

      <h2>Una actualización bloqueada ya no es un callejón sin salida</h2>
      <p>Un problema de actualización debería tener una vía de recuperación que no obligue a localizar a mano un directorio de caché. Settings ahora puede borrar una caché de actualización dañada, reinstalar cuando se sabe que una generación instalada no es segura y recuperarse si un payload descargado falla. <strong>La app vuelve a la última versión que funcionaba y se repara con la siguiente actualización correcta.</strong> Gracias a <a href="https://github.com/PerishCode">@PerishCode</a> por el trabajo constante en esta área.</p>
      <p>La app empaquetada también se recupera cuando su superficie web se cierra: reinicia el sidecar que ha fallado bajo una política limitada y vuelve a conectar las solicitudes <code>od://</code> sin obligar a reiniciar toda la app.</p>

      <h2>Cincuenta formas de dar criterio de diseño a Codex</h2>
      <p>La nueva colección pública <strong>Codex Design reúne 50 skills seleccionadas e instalables</strong> que abarcan diseño de interfaces, sistemas visuales, Figma-to-code, motion, generación de imágenes y oficio frontend. Cada entrada incluye procedencia, orientación práctica y páginas de detalle localizadas, de modo que «dar mejor criterio a Codex» se convierte en un conjunto de flujos concretos en vez de una promesa vaga.</p>
      <p>Codex Slides también se incorpora a la familia y cubre todo el flujo desde el prompt hasta la presentación: selección de escenario y estilo, construcción del esquema, edición directa y exportación. Los nuevos flujos de la comunidad amplían aún más el alcance: Humanize PPT convierte material de partida sin pulir en una presentación con un brief intencionado y una exportación verificada, mientras que Atelier Zero ofrece una biblioteca de prompts para imágenes lista para producción.</p>

      <h2>Qué más llega en 0.17.0</h2>
      <ul>
        <li><strong>El chat muestra el trabajo sin parecer un terminal</strong>: mensajes de ejecución más discretos, filas de herramientas vacías ocultas y actividad de herramientas ACP más fiel. Gracias a <a href="https://github.com/mrcfps">@mrcfps</a> y <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>Las pestañas del espacio de trabajo dicen qué contienen</strong>: las etiquetas largas siguen visibles y la nomenclatura de Design System se mantiene coherente. Gracias a <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>Las marcas concebidas para el modo oscuro siguen así</strong>: los temas derivados conservan el lienzo previsto en vez de volverlo claro sin avisar. Gracias a <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>Los proyectos dejan de multiplicar pestañas</strong>: abrir repetidamente el mismo proyecto ya no crea duplicados. Gracias a <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>El trabajo interrumpido borra el progreso obsoleto</strong>: un seguimiento completado ya no deja una instantánea antigua de Todo encima del Chat. Gracias a <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>Los agentes ACP dejan un rastro completo</strong>: los nombres reales de las herramientas, las entradas, los resultados, los tiempos y el uso se conservan en el Chat y los diagnósticos.</li>
        <li><strong>Los runtimes empaquetados arrancan con más fiabilidad</strong>: los payloads de Linux se preparan antes del primer uso y los wrappers empaquetados emplean el runtime con el que se distribuyeron.</li>
      </ul>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>usuario de Codex</td><td>Instala el plugin de Open Design, llama a <code>@open-design</code> con un brief visual concreto y abre el resultado en Preview o Studio</td></tr>
          <tr><td>alguien que refina trabajo generado</td><td>Selecciona un elemento y termina directamente las últimas correcciones visuales en vez de describirlas en otro prompt</td></tr>
          <tr><td>alguien que trabaja en local</td><td>Elige Local Codex explícitamente y confirma que la ejecución se mantiene local con la configuración BYOK guardada en tu dispositivo</td></tr>
          <tr><td>alguien que crea presentaciones</td><td>Prueba Codex Slides para cubrir todo el flujo de brief, esquema, edición y exportación</td></tr>
          <tr><td>alguien que se recupera de una mala actualización</td><td>Abre Settings, borra la caché dañada o reinstala y deja que la app vuelva a la última generación que funcionaba</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer ahora</h2>
      <p>Codex ya era un lugar donde describir lo que querías crear. 0.17.0 le da un lugar donde ver y dar forma al resultado. Llama a Open Design desde una conversación real, deja que un brief claro empiece de inmediato y haz después una pequeña corrección con las manos en lugar de escribir otro párrafo.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Descargar Open Design</a>.</p>
      <p>62 PR en 11 días, de 23 personas que conectaron conversación, artefacto y lienzo en un único flujo. El espacio de trabajo de diseño ya no está al lado de Codex. Codex puede acceder a él. Os vemos. 🚀</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: entrega fiable</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: visión más nítida, flow más largo</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: menor coste, entregas más rápidas</a></li>
      </ul>
  pt-br:
    title: 'Open Design 0.17.0: Open Design para Codex'
    summary: 'open-design-v0.17.0 — 62 PRs de 23 pessoas em 11 dias. O Codex agora tem seu próprio workspace de design: chame @open-design em uma conversa, transforme um brief em um artefato real no Preview ou Studio e finalize os detalhes visuais diretamente no canvas em vez de descrever cada pequeno ajuste em outro prompt.'
    category: 'Produto'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, publicado em 3 de agosto de 2026. <strong>62 PRs de 23 pessoas em 11 dias.</strong> O Codex agora tem seu próprio workspace de design. Chame <code>@open-design</code> em uma conversa do Codex, transforme uma ideia ou um brief em um artefato real e editável e continue criando e refinando no Open Design Studio sem sair do fluxo do Codex.</p>
      <p>Quer ver todas as mudanças? Leia as <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">notas completas da versão no GitHub</a>. Esta é a história do produto: como o Codex passa de uma conversa para um artefato visual, por que os últimos 10% já não precisam de outro prompt e o que ficou mais confiável ao longo do caminho.</p>

      <h2>O Codex tem seu próprio workspace de design</h2>
      <p>Agentes de programação são bons em transformar intenção em arquivos, mas o trabalho visual sempre exigiu um segundo ambiente: explicar a ideia no chat, levar o resultado para uma ferramenta de design e então traduzir cada correção em outro prompt. No 0.17.0, <strong>o Codex Desktop e a CLI podem chamar o Open Design como um motor criativo completo.</strong> A conversa e o workspace de design se tornam um único fluxo contínuo.</p>
      <p>Comece com <code>@open-design</code>. Confirme um brief visual, escolha o Open Design Cloud ou um runtime local compatível e receba um resultado real no Preview ou Studio. O resultado não é uma captura colada na conversa. É um artefato que você pode abrir, inspecionar, editar, exportar e continuar refinando.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Uma conversa com um agente fluindo para um canvas de design editável e uma visualização estável, com o artefato conectado dentro de uma moldura de seleção verde precisa sobre um fundo editorial quase branco" />
        <figcaption>Chame o Open Design no Codex, alinhe o brief e receba um artefato real no Preview ou Studio em vez de uma imagem dele.</figcaption>
      </figure>

      <h2>O runtime criativo sai do caminho</h2>
      <p>Você não deveria precisar manter um segundo app aberto só para a integração funcionar. <strong>O runtime assinado do Open Design inicia sem interface quando o Codex precisa dele</strong>, então não há uma janela extra para vigiar nem uma stack local para conectar na mão.</p>
      <p>O caminho de falha também é prático. Se o Studio não carregar corretamente dentro de um host externo, o Codex ainda entrega a visualização estável imediatamente. Você recebe o trabalho primeiro e pode abri-lo no workspace completo quando precisar, em vez de ver toda a execução falhar porque uma superfície de apresentação não foi inicializada.</p>
      <p>O que é local continua local. Quando você escolhe Local Codex explicitamente, a execução não volta mais para o plugin nem leva você a um fluxo de login no Cloud. Open Design Cloud e Local Codex continuam sendo opções distintas, e a configuração do provedor BYOK permanece no armazenamento do navegador deste dispositivo, sendo transmitida somente para a execução local ativa.</p>

      <h2>Finalize com as mãos, não com outro prompt</h2>
      <p>Os últimos 10% do trabalho visual costumam ser concretos: mova este elemento, ajuste aquele texto, recorte a imagem, alinhe estes dois objetos. Enviar cada correção pelo chat tornava pequenas mudanças mais lentas do que precisavam ser.</p>
      <p>No 0.17.0, <strong>o Manual Edit se torna um fluxo completo de finalização</strong>. Selecione um elemento diretamente, mova ou redimensione, edite o texto, mude a cor e o alinhamento, duplique ou exclua, e substitua, recorte, cole ou solte imagens. Guias de alinhamento ao vivo ajudam as peças a se encaixar. Desfazer e refazer preservam o canvas em vez de fazê-lo piscar durante uma recarga.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Um canvas de design com um elemento selecionado cercado por alças de redimensionamento, guias de alinhamento, controles de texto e ferramentas de recorte de imagem, composto como line art precisa sobre um fundo editorial quase branco" />
        <figcaption>Use prompts para definir a direção; use a manipulação direta para os pequenos ajustes visuais que suas mãos conseguem expressar mais rápido.</figcaption>
      </figure>
      <p>As exportações acompanham o resultado que você compôs. A exportação de imagem respeita o viewport ativo da visualização, e apresentações baseadas em frameworks são capturadas no tamanho em que foram criadas, em vez de serem remodeladas pela moldura do desktop.</p>

      <h2>Briefs claros começam imediatamente</h2>
      <p>Um agente deve fazer uma pergunta quando a resposta mudar o resultado, não porque toda tarefa precisa começar com uma entrevista. <strong>O Open Design agora começa imediatamente quando o primeiro prompt já contém direcionamento suficiente.</strong> Quando falta uma decisão real, ele faz uma única pergunta focada no momento em que essa decisão importa.</p>
      <p>Isso muda o ritmo. Um bom brief vira trabalho na mesma hora. Um brief ambíguo ainda recebe o esclarecimento necessário, mas a pergunta fica ligada a uma bifurcação concreta do processo em vez de ficar entre você e o primeiro resultado útil.</p>

      <h2>Escolhas ruins de modelo falham antes de desperdiçar uma execução</h2>
      <p>Algumas combinações de modelo e CLI do Codex são conhecidas por não funcionarem juntas. O 0.17.0 detecta essas combinações antes do início, oferece um caminho útil para trocar de modelo e diagnostica timeouts após ferramentas com mais precisão, em vez de encaminhar você para tentativas enganosas.</p>
      <p>O restante da oferta de modelos cresce sem confundir os limites: GPT-5.5 Fast chega como uma opção explícita que prioriza velocidade, Raven entra na configuração MCP com um clique e o Open Design encontra automaticamente a instalação oficial do Grok Build no Windows.</p>

      <h2>Uma atualização travada não é mais um beco sem saída</h2>
      <p>Um problema de atualização deve ter um caminho de recuperação que não exija procurar uma pasta de cache na mão. Settings agora pode limpar um cache de atualização corrompido, reinstalar quando uma geração instalada é conhecida como insegura e se recuperar após a falha de um payload baixado. <strong>O app volta à última versão funcional e se corrige na próxima atualização saudável.</strong> Obrigado a <a href="https://github.com/PerishCode">@PerishCode</a> pelo trabalho contínuo nessa área.</p>
      <p>O app empacotado também se recupera quando sua superfície web encerra: reinicia o sidecar que falhou sob uma política limitada e reconecta solicitações <code>od://</code> sem exigir o reinício completo do app.</p>

      <h2>Cinquenta maneiras de dar repertório de design ao Codex</h2>
      <p>A nova coleção pública <strong>Codex Design reúne 50 skills selecionadas e instaláveis</strong> de design de interfaces, sistemas visuais, Figma-to-code, motion, geração de imagens e craft de frontend. Cada item traz procedência, orientação prática e páginas de detalhes localizadas, para que “dar mais repertório ao Codex” se torne um conjunto de fluxos concretos em vez de uma promessa vaga.</p>
      <p>O Codex Slides também entra para a família, cobrindo todo o fluxo do prompt à apresentação: seleção de cenário e estilo, construção do roteiro, edição direta e exportação. Novos fluxos da comunidade ampliam ainda mais o alcance — o Humanize PPT transforma material inicial bruto em uma apresentação com um brief intencional e exportação verificada, enquanto o Atelier Zero oferece uma biblioteca de prompts de imagem pronta para produção.</p>

      <h2>O que mais entra no 0.17.0</h2>
      <ul>
        <li><strong>O Chat mostra o trabalho sem parecer um terminal</strong> — avisos de execução mais discretos, linhas vazias de ferramentas ocultas e atividade de ferramentas ACP mais fiel. Obrigado a <a href="https://github.com/mrcfps">@mrcfps</a> e <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>As abas do workspace dizem o que contêm</strong> — rótulos longos continuam visíveis e a nomenclatura de Design System permanece consistente. Obrigado a <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>Marcas pensadas para o escuro continuam assim</strong> — temas derivados preservam o canvas pretendido em vez de transformá-lo silenciosamente em claro. Obrigado a <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>Projetos param de multiplicar abas</strong> — abrir o mesmo projeto repetidamente não cria mais duplicatas. Obrigado a <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>Trabalho interrompido limpa o progresso obsoleto</strong> — um acompanhamento concluído não deixa mais um snapshot antigo de Todo acima do Chat. Obrigado a <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>Agentes ACP deixam um rastro completo</strong> — nomes reais de ferramentas, entradas, resultados, tempos e uso permanecem no Chat e nos diagnósticos.</li>
        <li><strong>Runtimes empacotados iniciam com mais confiabilidade</strong> — payloads do Linux são preparados antes do primeiro uso e wrappers empacotados usam o runtime com que foram distribuídos.</li>
      </ul>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você…</th><th>Comece aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>já usa o Codex</td><td>Instale o plugin do Open Design, chame <code>@open-design</code> com um brief visual concreto e abra o resultado no Preview ou Studio</td></tr>
          <tr><td>está refinando um trabalho gerado</td><td>Selecione um elemento e finalize diretamente os últimos ajustes visuais em vez de descrevê-los em outro prompt</td></tr>
          <tr><td>trabalha localmente</td><td>Escolha Local Codex explicitamente e confirme que a execução continua local com sua configuração BYOK armazenada no dispositivo</td></tr>
          <tr><td>está criando apresentações</td><td>Experimente o Codex Slides para o fluxo completo de brief, roteiro, edição e exportação</td></tr>
          <tr><td>está se recuperando de uma atualização ruim</td><td>Abra Settings, limpe o cache corrompido ou reinstale e deixe o app voltar à última geração funcional</td></tr>
        </tbody>
      </table>

      <h2>O que fazer agora</h2>
      <p>O Codex já era um lugar para descrever o que você queria criar. O 0.17.0 oferece um lugar para ver e dar forma ao resultado. Chame o Open Design em uma conversa real, deixe um brief claro começar imediatamente e faça um pequeno ajuste com as mãos em vez de escrever outro parágrafo.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Baixe o Open Design</a>.</p>
      <p>62 PRs em 11 dias, de 23 pessoas que conectaram conversa, artefato e canvas em um único fluxo. O workspace de design não fica mais ao lado do Codex. O Codex consegue acessá-lo. Vemos vocês. 🚀</p>

      <h2>Leituras relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: entrega confiável</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: visão mais nítida, flow mais longo</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: menos custo, entregas mais rápidas</a></li>
      </ul>
  it:
    title: 'Open Design 0.17.0: Open Design per Codex'
    summary: 'open-design-v0.17.0 — 62 PR da 23 persone in 11 giorni. Codex ora ha il proprio spazio di lavoro per il design: richiama @open-design da una conversazione, trasforma un brief in un vero artefatto Preview o Studio e rifinisci i dettagli visivi direttamente sul canvas invece di descrivere ogni piccola correzione in un altro prompt.'
    category: 'Prodotto'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, pubblicato il 3 agosto 2026. <strong>62 PR da 23 persone in 11 giorni.</strong> Codex ora ha il proprio spazio di lavoro per il design. Richiama <code>@open-design</code> da una conversazione in Codex, trasforma un'idea o un brief in un vero artefatto modificabile, poi continua a crearlo e rifinirlo in Open Design Studio senza uscire dal flusso di Codex.</p>
      <p>Vuoi conoscere ogni cambiamento? Leggi le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">note di rilascio complete su GitHub</a>. Questa è la storia del prodotto: come Codex passa da una conversazione a un artefatto visivo, perché l'ultimo 10% non richiede più un altro prompt e cosa è diventato più affidabile nel frattempo.</p>

      <h2>Codex ha il proprio spazio di lavoro per il design</h2>
      <p>Gli agenti di programmazione sanno trasformare bene l'intento in file, ma il lavoro visivo ha sempre richiesto un secondo ambiente: spiegare l'idea in chat, spostare il risultato in uno strumento di design, quindi tradurre ogni correzione in un altro prompt. In 0.17.0, <strong>Codex Desktop e CLI possono richiamare Open Design come motore creativo completo.</strong> La conversazione e lo spazio di lavoro per il design diventano un unico flusso continuo.</p>
      <p>Inizia con <code>@open-design</code>. Conferma un brief visivo, scegli Open Design Cloud o un runtime locale supportato e ricevi un vero risultato Preview o Studio. Il risultato non è uno screenshot incollato nella conversazione. È un artefatto che puoi aprire, ispezionare, modificare, esportare e continuare a rifinire.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Una conversazione con un agente che confluisce in un canvas di design modificabile e in un'anteprima stabile, con l'artefatto collegato racchiuso in una precisa cornice di selezione verde su uno sfondo editoriale quasi bianco" />
        <figcaption>Richiama Open Design da Codex, concorda il brief e ricevi un vero artefatto Preview o Studio invece della sua immagine.</figcaption>
      </figure>

      <h2>Il runtime creativo si toglie di mezzo</h2>
      <p>Non dovrebbe servire una seconda app aperta solo per far funzionare l'integrazione. <strong>Il runtime firmato di Open Design si avvia senza interfaccia quando Codex ne ha bisogno</strong>, quindi non c'è una finestra aggiuntiva da sorvegliare né uno stack locale da collegare a mano.</p>
      <p>Anche il percorso in caso di errore è pratico. Se Studio non riesce a caricarsi correttamente dentro un host esterno, Codex consegna comunque subito l'anteprima stabile. Ricevi prima il lavoro e puoi aprirlo nello spazio completo quando serve, invece di vedere fallire l'intera esecuzione perché una superficie di presentazione non si è inizializzata.</p>
      <p>Ciò che è locale resta locale. Quando scegli esplicitamente Local Codex, l'esecuzione non torna più al plugin né ti porta in un flusso di accesso a Cloud. Open Design Cloud e Local Codex restano opzioni distinte, mentre la configurazione del provider BYOK rimane nello spazio di archiviazione del browser di questo dispositivo e viene passata soltanto all'esecuzione locale attiva.</p>

      <h2>Rifinisci con le mani, non con un altro prompt</h2>
      <p>L'ultimo 10% del lavoro visivo è solitamente concreto: sposta questo elemento, stringi quel testo, ritaglia l'immagine, allinea questi due oggetti. Inviare ogni correzione attraverso la chat rendeva le piccole modifiche più lente del necessario.</p>
      <p>In 0.17.0, <strong>Manual Edit diventa un flusso di rifinitura completo</strong>. Seleziona direttamente un elemento, spostalo o ridimensionalo, modifica il testo, cambia colore e allineamento, duplicalo o eliminalo e sostituisci, ritaglia, incolla o trascina le immagini. Le guide di allineamento in tempo reale aiutano gli elementi a posizionarsi. Annulla e Ripristina preservano il canvas invece di farlo lampeggiare durante un ricaricamento.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Un canvas di design con un elemento selezionato circondato da maniglie di ridimensionamento, guide di allineamento, controlli di testo e strumenti per ritagliare le immagini, composto come una precisa illustrazione lineare su uno sfondo editoriale quasi bianco" />
        <figcaption>Usa i prompt per la direzione; usa la manipolazione diretta per le piccole correzioni visive che le tue mani esprimono più velocemente.</figcaption>
      </figure>
      <p>Le esportazioni seguono il risultato che hai composto. L'esportazione delle immagini rispetta il viewport attivo dell'anteprima e le presentazioni basate su framework vengono acquisite nelle dimensioni con cui sono state create, invece di essere rimodellate dalla cornice desktop.</p>

      <h2>I brief chiari partono subito</h2>
      <p>Un agente dovrebbe fare una domanda quando la risposta cambia il risultato, non perché ogni attività debba iniziare con un'intervista. <strong>Open Design ora parte immediatamente quando il primo prompt contiene già indicazioni sufficienti.</strong> Quando manca una vera decisione, pone un'unica domanda mirata nel momento in cui quella decisione conta.</p>
      <p>Questo cambia il ritmo. Un buon brief diventa subito lavoro. Un brief ambiguo riceve ancora il chiarimento necessario, ma la domanda è legata a un bivio concreto del processo invece di frapporsi tra te e il primo risultato utile.</p>

      <h2>Le scelte di modello sbagliate falliscono prima di sprecare un'esecuzione</h2>
      <p>Alcune combinazioni di modello e CLI di Codex sono note per non funzionare insieme. 0.17.0 le intercetta prima dell'avvio, offre un percorso utile per cambiare modello e diagnostica con maggiore precisione i timeout successivi agli strumenti invece di indirizzarti verso tentativi fuorvianti.</p>
      <p>Il resto dell'offerta di modelli si amplia senza confondere i confini: GPT-5.5 Fast arriva come scelta esplicita orientata alla velocità, Raven entra nella configurazione MCP con un clic e Open Design rileva automaticamente l'installazione ufficiale di Grok Build su Windows.</p>

      <h2>Un aggiornamento bloccato non è più un vicolo cieco</h2>
      <p>Un problema di aggiornamento dovrebbe avere un percorso di ripristino che non richieda di cercare a mano una directory della cache. Settings ora può cancellare una cache di aggiornamento danneggiata, reinstallare quando una generazione installata è nota come non sicura e recuperare dopo il crash di un payload scaricato. <strong>L'app torna all'ultima versione funzionante e si ripara con il successivo aggiornamento corretto.</strong> Grazie a <a href="https://github.com/PerishCode">@PerishCode</a> per il lavoro costante in quest'area.</p>
      <p>L'app distribuita recupera anche quando la sua superficie web si chiude: riavvia il sidecar guasto secondo una policy limitata e riconnette le richieste <code>od://</code> senza imporre il riavvio completo dell'app.</p>

      <h2>Cinquanta modi per dare gusto nel design a Codex</h2>
      <p>La nuova raccolta pubblica <strong>Codex Design riunisce 50 skill selezionate e installabili</strong> tra design di interfacce, sistemi visivi, Figma-to-code, motion, generazione di immagini e craft frontend. Ogni voce include provenienza, indicazioni pratiche e pagine di dettaglio localizzate, così «dare più gusto a Codex» diventa un insieme di flussi concreti invece di una promessa vaga.</p>
      <p>Anche Codex Slides entra nella famiglia e copre l'intero flusso dal prompt alla presentazione: scelta di scenario e stile, definizione della scaletta, modifica diretta ed esportazione. I nuovi flussi della community ampliano ulteriormente la gamma: Humanize PPT trasforma materiale di partenza grezzo in una presentazione con un brief intenzionale e un'esportazione verificata, mentre Atelier Zero offre una libreria di prompt per immagini pronta per la produzione.</p>

      <h2>Cos'altro arriva in 0.17.0</h2>
      <ul>
        <li><strong>La Chat mostra il lavoro senza sembrare un terminale</strong> — indicazioni di esecuzione più discrete, righe vuote degli strumenti nascoste e attività degli strumenti ACP più fedele. Grazie <a href="https://github.com/mrcfps">@mrcfps</a> e <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>Le tab dello spazio di lavoro dicono cosa contengono</strong> — le etichette lunghe restano visibili e la terminologia Design System rimane coerente. Grazie <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>I brand pensati per il tema scuro restano tali</strong> — i temi derivati preservano il canvas previsto invece di renderlo chiaro in silenzio. Grazie <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>I progetti smettono di moltiplicare le tab</strong> — aprire più volte lo stesso progetto non crea più duplicati. Grazie <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>Il lavoro interrotto cancella l'avanzamento obsoleto</strong> — un follow-up completato non lascia più una vecchia istantanea Todo sopra la Chat. Grazie <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>Gli agenti ACP lasciano una traccia completa</strong> — nomi reali degli strumenti, input, risultati, tempi e utilizzo restano nella Chat e nella diagnostica.</li>
        <li><strong>I runtime distribuiti si avviano in modo più affidabile</strong> — i payload Linux vengono preparati prima del primo utilizzo e i wrapper distribuiti usano il runtime con cui sono stati forniti.</li>
      </ul>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Parti da qui</th></tr>
        </thead>
        <tbody>
          <tr><td>già su Codex</td><td>Installa il plugin Open Design, richiama <code>@open-design</code> con un brief visivo concreto e apri il risultato in Preview o Studio</td></tr>
          <tr><td>impegnato a rifinire un lavoro generato</td><td>Seleziona un elemento e completa direttamente le ultime correzioni visive invece di descriverle in un altro prompt</td></tr>
          <tr><td>al lavoro in locale</td><td>Scegli esplicitamente Local Codex e verifica che l'esecuzione resti locale con la configurazione BYOK memorizzata sul dispositivo</td></tr>
          <tr><td>impegnato a creare presentazioni</td><td>Prova Codex Slides per l'intero flusso da brief a scaletta, modifica ed esportazione</td></tr>
          <tr><td>in fase di ripristino da un aggiornamento difettoso</td><td>Apri Settings, cancella la cache danneggiata o reinstalla e lascia che l'app torni all'ultima generazione funzionante</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare ora</h2>
      <p>Codex era già un luogo in cui descrivere ciò che volevi creare. 0.17.0 gli dà un luogo in cui vedere e dare forma al risultato. Richiama Open Design da una conversazione reale, lascia che un brief chiaro parta subito, poi apporta una piccola correzione con le mani invece di scrivere un altro paragrafo.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Scarica Open Design</a>.</p>
      <p>62 PR in 11 giorni, da 23 persone che hanno collegato conversazione, artefatto e canvas in un unico flusso. Lo spazio di lavoro per il design non è più accanto a Codex. Codex può raggiungerlo. Vi vediamo. 🚀</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: consegna affidabile</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: sguardo più nitido, flow più lungo</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: meno costi, rilasci più rapidi</a></li>
      </ul>
  tr:
    title: 'Open Design 0.17.0: Codex için Open Design'
    summary: 'open-design-v0.17.0 — 11 günde 23 katkıcıdan 62 PR. Codex artık kendi tasarım çalışma alanına sahip: bir sohbetten @open-design çağrısı yapın, brief''i gerçek bir Preview veya Studio artefaktına dönüştürün ve her küçük düzeltmeyi yeniden prompt''la tarif etmek yerine görsel ayrıntıları doğrudan tuval üzerinde tamamlayın.'
    category: 'Ürün'
    bodyHtml: |
      <p><code>open-design-v0.17.0</code>, 3 Ağustos 2026'da yayımlandı. <strong>11 günde 23 katkıcıdan 62 PR.</strong> Codex artık kendi tasarım çalışma alanına sahip. Bir Codex sohbetinden <code>@open-design</code> çağrısı yapın, bir fikri ya da brief'i gerçek ve düzenlenebilir bir artefakta dönüştürün, ardından Codex iş akışından ayrılmadan Open Design Studio'da üretmeye ve iyileştirmeye devam edin.</p>
      <p>Her değişikliği görmek ister misiniz? <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0">GitHub'daki tam sürüm notlarını</a> okuyun. Bu, ürünün hikâyesi: Codex'in bir sohbetten görsel artefakta nasıl ulaştığı, son %10'un neden artık başka bir prompt gerektirmediği ve bu sırada nelerin daha güvenilir hâle geldiği.</p>

      <h2>Codex kendi tasarım çalışma alanına kavuştu</h2>
      <p>Kodlama ajanları niyeti dosyalara dönüştürmede iyidir, ancak görsel işler hep ikinci bir ortam gerektirdi: fikri sohbette anlatmak, sonucu bir tasarım aracına taşımak ve ardından her düzeltmeyi başka bir prompt'a çevirmek. 0.17.0'da <strong>Codex Desktop ve CLI, Open Design'ı eksiksiz bir yaratıcı motor olarak çağırabiliyor.</strong> Sohbet ile tasarım çalışma alanı kesintisiz tek bir iş akışına dönüşüyor.</p>
      <p><code>@open-design</code> ile başlayın. Görsel brief'i onaylayın, Open Design Cloud'u ya da desteklenen yerel bir runtime'ı seçin ve gerçek bir Preview veya Studio sonucu alın. Sonuç, sohbete yapıştırılmış bir ekran görüntüsü değildir. Açabileceğiniz, inceleyebileceğiniz, düzenleyebileceğiniz, dışa aktarabileceğiniz ve geliştirmeyi sürdürebileceğiniz bir artefakttır.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="Bir ajan sohbetinin düzenlenebilir tasarım tuvaline ve kararlı önizlemeye aktığı; bağlı artefaktın neredeyse beyaz editoryal zemin üzerinde hassas yeşil bir seçim çerçevesi içinde tutulduğu görünüm" />
        <figcaption>Open Design'ı Codex içinden çağırın, brief üzerinde anlaşın ve yalnızca bir resim yerine gerçek bir Preview veya Studio artefaktı alın.</figcaption>
      </figure>

      <h2>Yaratıcı runtime aradan çekiliyor</h2>
      <p>Yalnızca entegrasyon çalışsın diye ikinci bir uygulamayı açık tutmanız gerekmemeli. <strong>İmzalı Open Design runtime'ı Codex ihtiyaç duyduğunda arayüzsüz olarak başlıyor</strong>; dolayısıyla göz kulak olmanız gereken ek bir pencere veya elle bağlamanız gereken yerel bir stack yok.</p>
      <p>Hata yolu da kullanışlı. Studio dış bir host içinde düzgün yüklenemezse Codex kararlı önizlemeyi yine hemen teslim ediyor. Bir sunum yüzeyi başlatılamadığı için tüm çalıştırmanın başarısız olmasını izlemek yerine önce işi alıyor, gerektiğinde tam çalışma alanında açabiliyorsunuz.</p>
      <p>Yerel, yerelde kalıyor. Local Codex'i açıkça seçtiğinizde çalıştırma artık eklentiye geri dönmüyor veya sizi Cloud oturum açma akışına göndermiyor. Open Design Cloud ve Local Codex ayrı seçenekler olarak kalıyor; BYOK sağlayıcı yapılandırması da bu cihazın tarayıcı depolamasında tutulup yalnızca etkin yerel çalıştırmaya aktarılıyor.</p>

      <h2>Başka bir prompt yerine ellerinizle tamamlayın</h2>
      <p>Görsel işlerin son %10'u çoğunlukla somuttur: bu öğeyi taşı, şu metni sıkıştır, görseli kırp, şu iki nesneyi hizala. Her düzeltmeyi sohbet üzerinden göndermek küçük değişiklikleri gerekenden daha yavaş hâle getiriyordu.</p>
      <p>0.17.0'da <strong>Manual Edit eksiksiz bir son rötuş iş akışına dönüşüyor</strong>. Bir öğeyi doğrudan seçin; taşıyın veya yeniden boyutlandırın, metni düzenleyin, rengi ve hizalamayı değiştirin, çoğaltın ya da silin; görselleri değiştirin, kırpın, yapıştırın veya sürükleyip bırakın. Canlı hizalama kılavuzları parçaların yerine oturmasına yardımcı oluyor. Geri alma ve yineleme, yeniden yükleme sırasında yanıp sönmek yerine tuvali koruyor.</p>
      <figure>
        <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="Seçili bir öğenin yeniden boyutlandırma tutamaçları, hizalama kılavuzları, metin kontrolleri ve görsel kırpma araçlarıyla çevrelendiği; neredeyse beyaz editoryal zemin üzerinde hassas çizgi sanatı olarak oluşturulmuş tasarım tuvali" />
        <figcaption>Yön için prompt'ları, ellerinizin daha hızlı ifade edebildiği küçük görsel düzeltmeler için doğrudan müdahaleyi kullanın.</figcaption>
      </figure>
      <p>Dışa aktarımlar oluşturduğunuz sonucu izliyor. Görsel dışa aktarımı etkin önizleme viewport'unu koruyor; framework sunumları da masaüstü çerçevesi tarafından yeniden şekillendirilmek yerine oluşturuldukları boyutta yakalanıyor.</p>

      <h2>Açık brief'ler hemen başlıyor</h2>
      <p>Bir ajan, her görev bir görüşmeyle başlamalı diye değil, yanıt sonucu değiştireceğinde soru sormalıdır. <strong>İlk prompt zaten yeterli yönlendirmeyi içerdiğinde Open Design artık hemen başlıyor.</strong> Gerçek bir karar eksikse tam o kararın önem kazandığı anda tek bir odaklı soru soruyor.</p>
      <p>Bu, ritmi değiştiriyor. Güçlü bir brief hemen işe dönüşüyor. Belirsiz bir brief yine ihtiyaç duyduğu açıklamayı alıyor, ancak soru ilk yararlı sonuçla aranıza girmek yerine süreçteki somut bir yol ayrımına bağlanıyor.</p>

      <h2>Kötü model seçimleri bir çalıştırmayı boşa harcamadan önce başarısız oluyor</h2>
      <p>Bazı Codex model ve CLI kombinasyonlarının birlikte çalışmadığı biliniyor. 0.17.0 bu kombinasyonları başlatmadan önce yakalıyor, işe yarar bir model değiştirme yolu sunuyor ve sizi yanıltıcı yeniden denemelere göndermek yerine araç sonrasında oluşan zaman aşımlarını daha doğru teşhis ediyor.</p>
      <p>Model seçeneklerinin geri kalanı sınırları bulandırmadan genişliyor: GPT-5.5 Fast açıkça hız odaklı bir seçenek olarak geliyor, Raven tek tıklamalı MCP kurulumuna katılıyor ve Open Design Windows'taki resmî Grok Build kurulumunu otomatik olarak keşfediyor.</p>

      <h2>Takılan bir güncelleme artık çıkmaz sokak değil</h2>
      <p>Bir güncelleme sorununun, elle önbellek dizini bulmayı gerektirmeyen bir kurtarma yolu olmalı. Settings artık bozuk bir güncelleme önbelleğini temizleyebiliyor, yüklü bir neslin güvenli olmadığı biliniyorsa yeniden kurabiliyor ve indirilen bir payload çöktüğünde kurtarma yapabiliyor. <strong>Uygulama son çalışan sürüme geri dönüyor ve bir sonraki sağlıklı güncellemede kendini iyileştiriyor.</strong> Buradaki sürekli çalışması için <a href="https://github.com/PerishCode">@PerishCode</a>'a teşekkürler.</p>
      <p>Paketlenmiş uygulama, web yüzeyi kapandığında da toparlanıyor: başarısız sidecar'ı sınırlı bir politika altında yeniden başlatıyor ve uygulamanın tamamını yeniden açmaya zorlamadan <code>od://</code> isteklerini yeniden bağlıyor.</p>

      <h2>Codex'e tasarım zevki kazandırmanın elli yolu</h2>
      <p>Yeni herkese açık <strong>Codex Design koleksiyonu; arayüz tasarımı, görsel sistemler, Figma-to-code, motion, görsel üretimi ve frontend craft alanlarında seçilmiş, kurulabilir 50 skill'i bir araya getiriyor</strong>. Her öğe köken bilgisi, pratik rehberlik ve yerelleştirilmiş ayrıntı sayfaları taşıyor; böylece “Codex'e daha iyi bir zevk kazandırmak” muğlak bir vaat yerine somut iş akışlarına dönüşüyor.</p>
      <p>Codex Slides da aileye katılarak prompt'tan sunuma uzanan tüm iş akışını kapsıyor: senaryo ve stil seçimi, taslak oluşturma, doğrudan düzenleme ve dışa aktarma. Yeni topluluk iş akışları kapsamı daha da genişletiyor — Humanize PPT ham kaynak malzemeyi amaçlı bir brief ve doğrulanmış dışa aktarımla sunuma dönüştürürken Atelier Zero üretime hazır bir görsel prompt kitaplığı sunuyor.</p>

      <h2>0.17.0'a giren diğer şeyler</h2>
      <ul>
        <li><strong>Chat, işi terminal gibi görünmeden gösteriyor</strong> — daha sessiz çalıştırma açıklamaları, gizlenmiş boş araç satırları ve ACP araç etkinliğinin daha sadık gösterimi. Teşekkürler <a href="https://github.com/mrcfps">@mrcfps</a> ve <a href="https://github.com/thatditsyboy">@thatditsyboy</a>.</li>
        <li><strong>Çalışma alanı sekmeleri ne içerdiklerini söylüyor</strong> — uzun etiketler görünür kalıyor ve Design System adlandırması tutarlı oluyor. Teşekkürler <a href="https://github.com/BigBandaid2">@BigBandaid2</a>.</li>
        <li><strong>Karanlık öncelikli markalar karanlık öncelikli kalıyor</strong> — türetilmiş temalar amaçlanan tuvali sessizce aydınlığa çevirmek yerine koruyor. Teşekkürler <a href="https://github.com/wiggdevin">@wiggdevin</a>.</li>
        <li><strong>Projeler sekmeleri çoğaltmayı bırakıyor</strong> — aynı projeyi tekrar tekrar açmak artık kopyalar oluşturmuyor. Teşekkürler <a href="https://github.com/pcherkashin">@pcherkashin</a>.</li>
        <li><strong>Kesintiye uğrayan iş eski ilerlemeyi temizliyor</strong> — tamamlanmış bir takip işi artık Chat'in üzerinde güncelliğini yitirmiş bir Todo anlık görüntüsü bırakmıyor. Teşekkürler <a href="https://github.com/Siri-Ray">@Siri-Ray</a>.</li>
        <li><strong>ACP ajanları eksiksiz bir iz bırakıyor</strong> — gerçek araç adları, girdiler, sonuçlar, zamanlama ve kullanım Chat ile tanılama kayıtlarında korunuyor.</li>
        <li><strong>Paketlenmiş runtime'lar daha güvenilir başlıyor</strong> — Linux payload'ları ilk kullanımdan önce hazırlanıyor ve paketlenmiş wrapper'lar birlikte gönderildikleri runtime'ı kullanıyor.</li>
      </ul>

      <h2>Bugün bununla ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>zaten Codex kullanıyorsanız</td><td>Open Design eklentisini yükleyin, somut bir görsel brief ile <code>@open-design</code> çağrısı yapın ve sonucu Preview ya da Studio'da açın</td></tr>
          <tr><td>üretilmiş işi geliştiriyorsanız</td><td>Bir öğe seçin ve son görsel düzeltmeleri başka bir prompt'ta tarif etmek yerine doğrudan tamamlayın</td></tr>
          <tr><td>yerel olarak çalışıyorsanız</td><td>Local Codex'i açıkça seçin ve cihazınızda saklanan BYOK yapılandırmasıyla çalıştırmanın yerel kaldığını doğrulayın</td></tr>
          <tr><td>sunum hazırlıyorsanız</td><td>Brief'ten taslak, düzenleme ve dışa aktarmaya uzanan eksiksiz akış için Codex Slides'ı deneyin</td></tr>
          <tr><td>kötü bir güncellemeden kurtuluyorsanız</td><td>Settings'i açın, bozuk önbelleği temizleyin veya yeniden kurun ve uygulamanın son çalışan nesle dönmesini sağlayın</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne var</h2>
      <p>Codex zaten ne üretmek istediğinizi tarif edebileceğiniz bir yerdi. 0.17.0 ona sonucu görüp şekillendirebileceği bir yer veriyor. Open Design'ı gerçek bir sohbetten çağırın, açık bir brief'in hemen başlamasını sağlayın ve ardından başka bir paragraf yerine ellerinizle küçük bir düzeltme yapın.</p>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_17_0&amp;utm_content=official">Open Design'ı indir</a>.</p>
      <p>11 günde 62 PR; sohbeti, artefaktı ve tuvali tek bir iş akışında buluşturan 23 kişiden. Tasarım çalışma alanı artık Codex'in yanında durmuyor. Codex ona ulaşabiliyor. Sizi görüyoruz. 🚀</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-16-0-reliable-delivery/">Open Design 0.16.0: güvenilir teslimat</a></li>
        <li><a href="/blog/open-design-0-15-1/">Open Design 0.15.1: daha keskin görüş, daha uzun akış</a></li>
        <li><a href="/blog/open-design-0-15-0-cost-less-ship-faster/">Open Design 0.15.0: daha az maliyet, daha hızlı teslimat</a></li>
      </ul>
---

`open-design-v0.17.0`, published on August 3, 2026. **62 PRs from 23 contributors in 11 days.** Codex now has its own design workspace. Call `@open-design` from a Codex conversation, turn an idea or brief into a real editable artifact, then keep creating and refining it in Open Design Studio without leaving the Codex workflow.

Want every change? Read the [full release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0). This is the product story: how Codex gets from a conversation to a visual artifact, why the last 10% no longer needs another prompt, and what became more reliable along the way.

## Codex has its own design workspace

Coding agents are good at turning intent into files, but visual work has always asked for a second environment: explain the idea in chat, move the result into a design tool, then translate every correction back into another prompt. In 0.17.0, **Codex Desktop and CLI can call Open Design as a complete creative engine.** The conversation and the design workspace become one continuous workflow.

Start with `@open-design`. Confirm a visual brief, choose Open Design Cloud or a supported local runtime, and receive a real Preview or Studio result. The result is not a screenshot pasted into the conversation. It is an artifact you can open, inspect, edit, export, and keep refining.

<figure>
  <img src="/blog/open-design-0-17-0-open-design-for-codex-workflow.webp" alt="An agent conversation flowing into an editable design canvas and stable preview, with the connected artifact held inside a precise green selection frame on a near-white editorial ground" />
  <figcaption>Call Open Design from Codex, agree on the brief, and receive a real Preview or Studio artifact instead of a picture of one.</figcaption>
</figure>

## The creative runtime gets out of the way

You should not need a second app open just to make the integration work. **The signed Open Design runtime starts headlessly when Codex needs it**, so there is no extra window to babysit and no local stack to wire together by hand.

The failure path is practical too. If Studio cannot load cleanly inside an external host, Codex still delivers the stable preview immediately. You get the work first and can open it in the full workspace when needed, instead of watching the entire run fail because one presentation surface did not initialize.

Local stays local. When you explicitly choose Local Codex, the run no longer loops back into the plugin or sends you into a Cloud sign-in flow. Open Design Cloud and Local Codex remain distinct choices, and BYOK provider configuration stays in this device's browser storage, passed only to the active local run.

## Finish with your hands, not another prompt

The last 10% of visual work is usually concrete: move this element, tighten that text, crop the image, align these two objects. Sending each correction through chat made small changes slower than they needed to be.

In 0.17.0, **Manual Edit becomes a complete finishing workflow**. Select an element directly, move or resize it, edit text, change color and alignment, duplicate or delete it, and replace, crop, paste, or drop images. Live alignment guides help the pieces settle into place. Undo and redo preserve the canvas instead of flashing through a reload.

<figure>
  <img src="/blog/open-design-0-17-0-open-design-for-codex-editing.webp" alt="A design canvas with one selected element surrounded by resize handles, alignment guides, text controls and image crop tools, composed as precise line art on a near-white editorial ground" />
  <figcaption>Use prompts for direction; use direct manipulation for the small visual corrections your hands can express faster.</figcaption>
</figure>

Exports follow the result you composed. Image export respects the active preview viewport, and framework decks are captured at their authored size instead of being reshaped by the desktop frame.

## Clear briefs start immediately

An agent should ask a question when the answer changes the result, not because every task must begin with an interview. **Open Design now starts immediately when the first prompt already contains enough direction.** When a real decision is missing, it asks one focused question at the moment that decision matters.

That changes the rhythm. A strong brief becomes work right away. An ambiguous brief still gets the clarification it needs, but the question is attached to a concrete fork in the process rather than standing between you and the first useful result.

## Bad model choices fail before they waste a run

Some Codex model and CLI combinations are known not to work together. 0.17.0 catches those combinations before launch, provides a useful switch-model path, and diagnoses post-tool timeouts more accurately instead of sending you through misleading retries.

The rest of the model surface expands without muddying the boundaries: GPT-5.5 Fast arrives as an explicit speed-first choice, Raven joins one-click MCP setup, and Open Design discovers the official Grok Build installation automatically on Windows.

## A stuck update is no longer a dead end

An update problem should have a recovery path that does not require finding a cache directory by hand. Settings can now clear a broken update cache, reinstall when an installed generation is known to be unsafe, and recover after a downloaded payload crashes. **The app rolls back to the last working version and heals on the next healthy update.** Thanks [@PerishCode](https://github.com/PerishCode) for the sustained work here.

The packaged app also recovers when its web surface exits: it restarts the failed sidecar under a bounded policy and reconnects `od://` requests without forcing a full app relaunch.

## Fifty ways to give Codex design taste

The new public **Codex Design collection gathers 50 curated, installable skills** across interface design, visual systems, Figma-to-code, motion, image generation, and frontend craft. Each entry carries provenance, practical guidance, and localized detail pages, so “give Codex better taste” becomes a set of concrete workflows rather than a vague promise.

Codex Slides joins the family too, covering the full prompt-to-deck workflow: scenario and style selection, outline shaping, direct editing, and export. New community workflows widen the range further — Humanize PPT turns rough source material into a presentation with an intentional brief and verified export, while Atelier Zero provides a production-ready image prompt library.

## What else lands in 0.17.0

- **Chat shows the work without reading like a terminal** — quieter execution disclosures, hidden empty tool rows, and more faithful ACP tool activity. Thanks [@mrcfps](https://github.com/mrcfps) and [@thatditsyboy](https://github.com/thatditsyboy).
- **Workspace tabs say what they contain** — long labels remain visible and Design System naming stays consistent. Thanks [@BigBandaid2](https://github.com/BigBandaid2).
- **Dark-first brands stay dark-first** — derived themes preserve the intended canvas instead of silently turning it light. Thanks [@wiggdevin](https://github.com/wiggdevin).
- **Projects stop multiplying tabs** — opening the same project repeatedly no longer creates duplicates. Thanks [@pcherkashin](https://github.com/pcherkashin).
- **Interrupted work clears stale progress** — a completed follow-up no longer leaves an obsolete Todo snapshot above Chat. Thanks [@Siri-Ray](https://github.com/Siri-Ray).
- **ACP agents leave a complete trail** — real tool names, inputs, results, timing, and usage survive into Chat and diagnostics.
- **Packaged runtimes start more reliably** — Linux payloads warm up before first use, and packaged wrappers use the runtime they shipped with.

## What to do with it today

| If you're… | Start here |
|---|---|
| Already using Codex | Install the Open Design plugin, call `@open-design` with a concrete visual brief, and open the result in Preview or Studio |
| Refining generated work | Select one element and finish the last visual corrections directly instead of describing them in another prompt |
| Working locally | Choose Local Codex explicitly and confirm the run stays local with your device-stored BYOK configuration |
| Building presentations | Try Codex Slides for the full brief-to-outline-to-edit-to-export workflow |
| Recovering from a bad update | Open Settings, clear the broken cache or reinstall, and let the app return to the last working generation |

## What to do next

Codex was already a place to describe what you wanted to build. 0.17.0 gives it a place to see and shape the result. Call Open Design from a real conversation, let a clear brief start immediately, then make one small correction with your hands instead of another paragraph.

[Download Open Design](/download/?utm_source=blog&utm_medium=docs&utm_campaign=202608_0_17_0&utm_content=official).

62 PRs in 11 days, from 23 people who connected conversation, artifact, and canvas into one workflow. The design workspace no longer sits beside Codex. Codex can reach it. We see you. 🚀

## Related reading

- [Open Design 0.16.0: reliable delivery](/blog/open-design-0-16-0-reliable-delivery/)
- [Open Design 0.15.1: sharper vision, longer flow](/blog/open-design-0-15-1/)
- [Open Design 0.15.0: cost less, ship faster](/blog/open-design-0-15-0-cost-less-ship-faster/)
