---
title: "Open Design 0.15.0: cost less, ship faster"
date: 2026-07-14
category: "Product"
readingTime: 7
summary: "Tag open-design-v0.15.0 — 118 PRs from 34 contributors in four days. Codename \"Cost Less. Ship Faster.\" A leaner Design System Prompt cut time-to-first-token by 49.5%, end-to-end duration by 21.2%, and average input tokens by 25.1% in representative runs. The rest of the release smooths the whole creative loop: decks that feel like a workspace, website clone from a URL, conversations turned into motion, and failures that finally explain what to do next."
i18n:
  zh:
    title: 'Open Design 0.15.0：更省成本，更快交付'
    summary: '标签 open-design-v0.15.0 —— 四天内 34 位贡献者提交了 118 个 PR。代号「更省成本，更快交付（Cost Less. Ship Faster.）」。一个更精简的 Design System Prompt 在代表性运行中把首个 token 的等待时间缩短了 49.5%、端到端时长缩短了 21.2%、平均输入 token 减少了 25.1%。本次发布的其余部分让整条创作循环更顺滑：像工作区一样的演示文稿、从 URL 克隆网站、把对话变成动态效果，以及终于会告诉你下一步该怎么办的失败提示。'
    category: '产品'
    bodyHtml: |
      <p>标签 <code>open-design-v0.15.0</code>，于 2026 年 7 月 14 日发布。<strong>四天内 34 位贡献者提交了 118 个 PR。</strong>代号「更省成本，更快交付（Cost Less. Ship Faster.）」。前两次发布让你的工作在中断之间保持存活，也留住了心流过去容易丢失的想法。这一次针对的是你为每一次运行所付出的「税」：首个 token 之前的等待、抵达那里所花掉的 token，以及一份做完的结果与一份可交付成果之间的摩擦。</p>
      <p>想看完整的更新日志？它就在 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">GitHub 上的发布说明</a>里。本文是精简版：底层改了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>更精简的提示，更快的循环</h2>
      <p>这条头条很安静，但每一个任务都能感受到。通过优化 Design System Prompt，代表性的评测运行显示<strong>首个 token 的等待时间减少了 49.5%</strong>、<strong>端到端时长减少了 21.2%</strong>、<strong>平均输入 token 用量降低了 25.1%</strong>。日常的设计任务现在开始得更早、抵达那里花掉的 token 更少、也完成得更快——同样的工作，成本更低，而你不必对自己写提示的方式做任何改变。</p>
      <p>这正是代号的用意。更省成本：每个任务用更少的 token。更快交付：从提出到得到答案之间等待更少。一种你无需主动开启的效率。</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>一个更精简的 Design System Prompt：首个 token 快 49.5%、端到端短 21.2%、输入 token 少 25.1%——在同样的日常任务上。</figcaption>
      </figure>

      <h2>像工作区一样的演示文稿</h2>
      <p>一份做完的演示文稿，应该表现得像一份你能操控的文档，而不是一段你滑过去的静态预览。在 0.15.0 中，<strong>多页演示文稿获得了缩略图导航、直接选页，以及方向键 / Home / End 的键盘控制</strong>——再也不用四处找控件了。<strong>演讲者备注会跟着它所属的那张幻灯片</strong>：在当前幻灯片旁边阅读和编辑它们、让它们各就各位，并在 Presenter View 中查看它们，而不会遮住面向观众的那块屏幕。</p>
      <p>演示现在是一个头等模式——在当前标签页或全屏进入一场沉浸式演示，然后前进、后退、暂停、继续或重新开始，都不会丢失演示文稿的状态。而当到了交接的时候，<strong>导出你已确认的那个确切版本</strong>为 PDF、图片、ZIP 或 HTML，而不是悄悄地把最新的改动发出去（演讲者备注不会出现在导出的幻灯片里）。</p>

      <h2>从一个 URL 克隆网站</h2>
      <p>重建一个网站，过去要从一个空白提示和一大段描述开始。<strong>Website Clone 现在是一个头等入口</strong>，出现在首页和 Library 里：选择该能力、粘贴一个公开的 URL，Open Design 就会带着已经就位的正确上下文创建项目。</p>
      <p>它还会留下一条审计线索。这套工作流会先检查页面结构、路由、资源和交互，生成的项目会保留一份 NOTES.md 风格的文档，描述它的做法、资源来源和已知差异。结果可以直接本地预览，并且<strong>不会带过来任何第三方分析或广告脚本</strong>——而对于像有登录墙的站点这类难啃的目标，Open Design 会说明其局限，而不是假装克隆已经完成。</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone 从一个 URL 开始，检查真实的页面，并留下一条 NOTES.md 风格的线索，记录它是如何重建的。</figcaption>
      </figure>

      <h2>把对话变成动态效果</h2>
      <p>本次发布的新东西：<strong>Chat Motion Overlay 技能</strong>能把一段两人对话变成一个动画式的聊天叠层——WeChat、Telegram 和 Messenger 风格的容器，外加面向后期制作的透明输出选项。首页也让正确的起点更容易找到：更清晰的入口、开箱即用的示例，以及能更可靠地打开正确预览的模板与插件卡片。</p>

      <h2>失败会解释下一步该怎么办</h2>
      <p>一个完成的任务应该意味着一份真实的可交付成果，而一个失败的任务应该告诉你原因。在 0.15.0 中，<strong>那些未能生成或保存可用项目文件的运行，不再被显示为已成功完成</strong>——而缺失的本地 agent、过大的输入、不可用的模型、耗尽的额度、超时、空输出、保存失败和工具循环，每一种都会给出一条具体的恢复路径，而不是一个包罗万象的错误。</p>
      <p>底层的恢复也变得更稳固了：停止一个任务或删除一个项目，现在会取消该运行及其子进程，而不是任由它们烧掉时间和额度；重试不再从失败的进程继承状态；当渲染进程反复崩溃时，桌面应用会打开一个恢复界面（带有诊断日志导出），而不是在无尽的重新加载里打转。</p>

      <h2>0.15.0 中还有什么</h2>
      <ul>
        <li><strong>BYOK 与第三方 agent 更准确了</strong>——一个全新的 Atlas Cloud 预设、经由兼容的 chat-completions 路径路由的 OpenAI 兼容端点、把嵌入和重排模型排除在聊天选择器之外，以及对 Kiro、Reasonix、Antigravity、Grok Build 和 OpenRouter 更清晰的反馈。</li>
        <li><strong>隐私选择更容易理解了</strong>——同意与设置现在会区分匿名的运行时指标和已脱敏的质量审查内容。</li>
        <li><strong>Library 更像它本该有的样子了</strong>——更稳定的插件类别计数与翻译、与其模板相匹配的预烘焙预览、保持正确宽高比的演示文稿预览，以及在缩放时表现正常的 WebGL 预览。</li>
      </ul>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用并开始一个项目——同样的任务现在默认开始得更快、花掉的 token 更少</td></tr>
          <tr><td>要交付一份演示文稿</td><td>用缩略图和键盘导航来操控演示文稿、让演讲者备注各就各位，并导出你已确认的那个确切版本</td></tr>
          <tr><td>正在重建一个站点</td><td>打开 Website Clone、粘贴一个公开的 URL，从一次真实的检查和一条 NOTES.md 线索开始</td></tr>
          <tr><td>要做社交动态效果</td><td>试试 Chat Motion Overlay 技能，把一段对话变成一个动画叠层</td></tr>
          <tr><td>遇到了一次失败的运行</td><td>读一读失败提示——它会指出原因和一条恢复路径，而现在一个「已完成」的任务意味着一份真实的文件</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>最便宜的提速，是那种你永远不必去想的提速。0.15.0 把预算花在了那里——每个任务上更精简的提示、一份你真正能操控的演示文稿、一个从 URL 开始的克隆，以及一个会告诉你下一步该怎么办的失败提示。下载桌面应用，跑一跑你经常跑的东西，感受一下首个 token 出现得早了多少。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>四天 118 个 PR，来自 34 个人，他们每个人都从日常循环里削掉了又一秒、又一个 token，或又一次绕路。一场运动不会从某一个团队的笔记本电脑里发布出来；它从每一个让这条常走的路变得便宜一点、快一点的人手中发布出来。我们看见你们了。🚀</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0：灵感时光机</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0：保持心流</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0：你的品牌就是一套设计系统</a></li>
      </ul>
  ja:
    title: 'Open Design 0.15.0：コストを抑え、より速く届ける'
    summary: 'タグ open-design-v0.15.0 — 4日間で34人のコントリビューターから118件のPR。コードネームは「Cost Less. Ship Faster.（コストを抑え、より速く届ける）」。よりスリムになった Design System Prompt により、代表的な実行で最初のトークンまでの時間が49.5%、エンドツーエンドの所要時間が21.2%、平均入力トークンが25.1%削減されました。リリースの残りの部分は、クリエイティブなループ全体をなめらかにします：ワークスペースのように扱えるデッキ、URL からのウェブサイトクローン、会話をモーションに変える機能、そしてついに次に何をすべきかを説明してくれる失敗表示。'
    category: 'プロダクト'
    bodyHtml: |
      <p>タグ <code>open-design-v0.15.0</code>、2026年7月14日にリリース。<strong>4日間で34人のコントリビューターから118件のPR。</strong>コードネームは「Cost Less. Ship Faster.（コストを抑え、より速く届ける）」。直近の2つのリリースは、中断をまたいであなたの作業を生き続けさせ、フローが失いがちだったアイデアを守りました。今回のリリースが狙うのは、あらゆる実行であなたが支払っている「税」です：最初のトークンまでの待ち時間、そこへたどり着くまでに費やされるトークン、そして完成した結果と出荷された成果物のあいだにある摩擦。</p>
      <p>詳細な変更履歴が知りたい方は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">GitHub のリリースノート</a>にあります。本記事は短縮版です：内部で何が変わったか、今日それで何ができるか、そしてどこから始めればよいか。</p>

      <h2>よりスリムなプロンプト、より速いループ</h2>
      <p>この見出しは静かですが、あらゆるタスクで感じられます。Design System Prompt を最適化したことで、代表的な評価実行では<strong>最初のトークンまでの時間が49.5%短縮</strong>、<strong>エンドツーエンドの所要時間が21.2%短縮</strong>、<strong>平均入力トークンの使用量が25.1%削減</strong>されました。日々のデザインタスクは、より早く始まり、そこへたどり着くまでに費やすトークンが減り、より速く終わります——同じ作業を、より低いコストで、プロンプトの書き方を何一つ変えることなく。</p>
      <p>それがコードネームの狙いです。コストを抑える：タスクあたりのトークンを減らす。より速く届ける：問いと答えのあいだの待ち時間を減らす。あなたがわざわざ有効にする必要のない効率です。</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>よりスリムな Design System Prompt：最初のトークンまで49.5%速く、エンドツーエンドで21.2%短く、入力トークンが25.1%少ない——同じ日々のタスクで。</figcaption>
      </figure>

      <h2>ワークスペースのように扱えるデッキ</h2>
      <p>完成したデッキは、スクロールして通り過ぎる静的なプレビューではなく、あなたが操作できるドキュメントのように振る舞うべきです。0.15.0 では、<strong>複数ページのデッキにサムネイルナビゲーション、ページの直接選択、矢印 / Home / End のキーボード操作が加わりました</strong>——もうコントロールを探し回る必要はありません。<strong>スピーカーノートは、それが属するスライドに寄り添ったままです</strong>：現在のスライドの横で読んで編集し、その場に留め、観客に向けた画面を覆うことなく Presenter View で確認できます。</p>
      <p>プレゼンはいまや一級のモードです——現在のタブまたはフルスクリーンで没入型のプレゼンテーションに入り、デッキの状態を失うことなく、前後に移動したり、一時停止・再開・最初からやり直したりできます。そして受け渡しのときが来たら、最新の編集をこっそり出荷するのではなく、<strong>あなたが承認したまさにそのバージョンを</strong> PDF、画像、ZIP、または HTML としてエクスポートできます（スピーカーノートはエクスポートされたスライドには含まれません）。</p>

      <h2>URL からウェブサイトをクローンする</h2>
      <p>サイトを作り直すのは、以前は空白のプロンプトと大量の説明から始まっていました。<strong>Website Clone はいまやホームと Library の一級の入口です</strong>：その機能を選び、公開 URL を貼り付ければ、Open Design は正しいコンテキストがすでに揃った状態でプロジェクトを作成します。</p>
      <p>それは監査証跡も残します。このワークフローはまずページ構造、ルート、アセット、インタラクションを検査し、生成されたプロジェクトは、そのアプローチ、アセットの出所、既知の差異を記した NOTES.md 形式のドキュメントを保持します。結果はローカルプレビューの準備が整っており、<strong>サードパーティの分析や広告スクリプトを引き継ぎません</strong>——そしてログインの壁があるサイトのような手ごわい対象については、Open Design はクローンが完全であるかのように装うのではなく、その限界を説明します。</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone は URL から始まり、実際のページを検査し、どのように作り直したかを記した NOTES.md 形式の証跡を残します。</figcaption>
      </figure>

      <h2>会話をモーションに変える</h2>
      <p>今回の新機能：<strong>Chat Motion Overlay スキル</strong>は、二人の会話をアニメーション化されたチャットオーバーレイに変えます——WeChat、Telegram、Messenger 風のコンテナに加え、ポストプロダクション向けの透過出力オプションも。ホームも、より明確な入口、すぐ使えるサンプル、そして正しいプレビューをより確実に開くテンプレートとプラグインのカードによって、正しい出発点を見つけやすくしています。</p>

      <h2>失敗が次に何をすべきかを説明する</h2>
      <p>完了したタスクは本物の成果物を意味すべきで、失敗したタスクはその理由を教えてくれるべきです。0.15.0 では、<strong>使用可能なプロジェクトファイルの生成や保存に失敗した実行が、正常に完了したものとして表示されなくなりました</strong>——そして、見つからないローカルエージェント、大きすぎる入力、利用できないモデル、使い果たされたクォータ、タイムアウト、空の出力、保存の失敗、ツールループのそれぞれが、一括りのエラーではなく、具体的な回復経路を提示します。</p>
      <p>内部での回復もより頑丈になりました：タスクを停止したりプロジェクトを削除したりすると、時間とクォータを浪費させ続ける代わりに、その実行と子プロセスをキャンセルするようになりました。リトライは失敗したプロセスから状態を引き継がなくなり、レンダラーが繰り返しクラッシュしたときには、デスクトップアプリが果てしないリロードを繰り返す代わりに、（診断ログのエクスポート付きの）回復画面を開きます。</p>

      <h2>0.15.0 に含まれるその他の変更</h2>
      <ul>
        <li><strong>BYOK とサードパーティのエージェントがより正確に</strong>——新しい Atlas Cloud プリセット、互換の chat-completions パス経由でルーティングされる OpenAI 互換エンドポイント、チャットセレクターから除外された埋め込み・再ランクモデル、そして Kiro、Reasonix、Antigravity、Grok Build、OpenRouter へのより明確なフィードバック。</li>
        <li><strong>プライバシーの選択がより理解しやすく</strong>——同意と設定が、匿名のランタイムメトリクスと、秘匿処理された品質レビューの内容とを区別するようになりました。</li>
        <li><strong>Library がよりあるべき姿に</strong>——より安定したプラグインのカテゴリ数と翻訳、テンプレートに合致する事前生成プレビュー、正しいアスペクト比を保つデッキプレビュー、そしてサイズ変更時に正しく振る舞う WebGL プレビュー。</li>
      </ul>

      <h2>今日それで何をするか</h2>
      <table>
        <thead>
          <tr><th>あなたが…</th><th>ここから始める</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design が初めて</td><td>デスクトップアプリをダウンロードしてプロジェクトを始めましょう——同じタスクがいまや、デフォルトでより速く始まり、より少ないトークンで済みます</td></tr>
          <tr><td>プレゼンを出荷する</td><td>サムネイルとキーボードナビでデッキを操作し、スピーカーノートをその場に留め、あなたが承認したまさにそのバージョンをエクスポートしましょう</td></tr>
          <tr><td>サイトを作り直す</td><td>Website Clone を開き、公開 URL を貼り付けて、NOTES.md 証跡を伴う実際の検査から始めましょう</td></tr>
          <tr><td>ソーシャル向けのモーションを作る</td><td>Chat Motion Overlay スキルを試して、会話をアニメーションオーバーレイに変えましょう</td></tr>
          <tr><td>失敗した実行に見舞われた</td><td>失敗表示を読みましょう——原因と回復経路を名指しし、いまや「完了」したタスクは本物のファイルを意味します</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>最も安上がりな高速化は、あなたが決して考えなくてよい高速化です。0.15.0 はそこに予算を費やします——あらゆるタスクでのよりスリムなプロンプト、実際に操作できるデッキ、URL から始まるクローン、そして次に何をすべきかを教えてくれる失敗表示。デスクトップアプリをダウンロードし、よく実行するものを実行して、最初のトークンがどれほど早く現れるかに気づいてください。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>4日間で118件のPR、日々のループから、もう1秒、もう1トークン、もう1つの回り道を削り取った34人から。ムーブメントは一つのチームのノートパソコンから出荷されるのではありません。共通の道を少しだけ安く、少しだけ速くした、すべての人から出荷されるのです。私たちはあなたを見ています。🚀</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0：インスピレーションのタイムマシン</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0：フローにとどまる</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0：あなたのブランドはデザインシステムである</a></li>
      </ul>
  ko:
    title: 'Open Design 0.15.0: 비용은 줄이고, 더 빠르게 출시하기'
    summary: '태그 open-design-v0.15.0 — 나흘 동안 34명의 기여자가 만든 118개의 PR. 코드명 "Cost Less. Ship Faster.(비용은 줄이고, 더 빠르게)". 더 가벼워진 Design System Prompt는 대표적인 실행에서 첫 토큰까지의 시간을 49.5%, 엔드투엔드 소요 시간을 21.2%, 평균 입력 토큰을 25.1% 줄였습니다. 이번 릴리스의 나머지는 창작 루프 전체를 매끄럽게 다듬습니다: 작업 공간처럼 다룰 수 있는 덱, URL로부터의 웹사이트 클론, 대화를 모션으로 바꾸기, 그리고 마침내 다음에 무엇을 해야 할지 알려주는 실패 표시.'
    category: '제품'
    bodyHtml: |
      <p>태그 <code>open-design-v0.15.0</code>, 2026년 7월 14일 출시. <strong>나흘 동안 34명의 기여자가 만든 118개의 PR.</strong> 코드명 "Cost Less. Ship Faster.(비용은 줄이고, 더 빠르게)". 지난 두 번의 릴리스는 중단을 가로질러 당신의 작업을 살아 있게 하고, 흐름이 잃곤 하던 아이디어를 지켜냈습니다. 이번 릴리스는 당신이 매 실행마다 치르는 "세금"을 겨냥합니다: 첫 토큰이 나오기까지의 기다림, 거기에 이르기까지 쓰이는 토큰, 그리고 완성된 결과와 출시된 결과물 사이의 마찰.</p>
      <p>전체 변경 로그가 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">GitHub의 릴리스 노트</a>에 담겨 있습니다. 이 글은 짧은 버전입니다: 내부에서 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작하면 되는지.</p>

      <h2>더 가벼운 프롬프트, 더 빠른 루프</h2>
      <p>이 헤드라인은 조용하지만 모든 작업에서 느껴집니다. Design System Prompt를 최적화함으로써, 대표적인 평가 실행에서 <strong>첫 토큰까지의 시간이 49.5% 감소</strong>, <strong>엔드투엔드 소요 시간이 21.2% 감소</strong>, <strong>평균 입력 토큰 사용량이 25.1% 감소</strong>했습니다. 일상적인 디자인 작업이 이제 더 일찍 시작되고, 거기에 이르기까지 더 적은 토큰을 쓰며, 더 빨리 끝납니다 — 같은 작업을, 더 낮은 비용으로, 당신이 프롬프트를 쓰는 방식은 하나도 바꾸지 않고서.</p>
      <p>그것이 바로 코드명의 요점입니다. 비용은 줄이고: 작업당 더 적은 토큰. 더 빠르게 출시: 요청과 답변 사이의 더 적은 기다림. 당신이 굳이 켤 필요가 없는 효율입니다.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>더 가벼운 Design System Prompt: 첫 토큰까지 49.5% 더 빠르게, 엔드투엔드로 21.2% 더 짧게, 입력 토큰 25.1% 더 적게 — 같은 일상 작업에서.</figcaption>
      </figure>

      <h2>작업 공간처럼 느껴지는 덱</h2>
      <p>완성된 덱은 스크롤해 지나치는 정적인 미리보기가 아니라, 당신이 다룰 수 있는 문서처럼 행동해야 합니다. 0.15.0에서는 <strong>여러 페이지 덱에 썸네일 내비게이션, 직접 페이지 선택, 그리고 화살표 / Home / End 키보드 제어가 추가됐습니다</strong> — 더 이상 컨트롤을 찾아 헤맬 필요가 없습니다. <strong>발표자 노트는 그것이 속한 슬라이드에 붙어 있습니다</strong>: 현재 슬라이드 옆에서 읽고 편집하고, 제자리에 두고, 청중을 향한 화면을 가리지 않고 Presenter View에서 확인하세요.</p>
      <p>이제 발표는 일급 모드입니다 — 현재 탭이나 전체 화면에서 몰입형 프레젠테이션에 들어가, 덱 상태를 잃지 않고 앞뒤로 이동하고, 일시정지·재개·다시 시작할 수 있습니다. 그리고 넘겨줄 때가 되면, 최신 편집본을 슬그머니 출시하는 대신 <strong>당신이 승인한 바로 그 버전을</strong> PDF, 이미지, ZIP 또는 HTML로 내보내세요(발표자 노트는 내보낸 슬라이드에서 제외됩니다).</p>

      <h2>URL로부터 웹사이트 클론하기</h2>
      <p>사이트를 다시 만드는 일은 예전엔 빈 프롬프트와 많은 설명에서 시작했습니다. <strong>Website Clone은 이제 홈과 Library의 일급 진입점입니다</strong>: 해당 기능을 고르고, 공개 URL을 붙여 넣으면, Open Design이 올바른 컨텍스트가 이미 갖춰진 상태로 프로젝트를 만듭니다.</p>
      <p>그것은 또한 감사 추적을 남깁니다. 이 워크플로는 먼저 페이지 구조, 라우트, 에셋, 인터랙션을 검사하고, 생성된 프로젝트는 그 접근 방식, 에셋 출처, 알려진 차이를 설명하는 NOTES.md 형식의 문서를 보관합니다. 결과는 로컬 미리보기 준비가 되어 있고 <strong>제3자 분석이나 광고 스크립트를 가져오지 않습니다</strong> — 그리고 로그인 장벽이 있는 사이트 같은 까다로운 대상에 대해서는, Open Design이 클론이 완전한 척하는 대신 그 한계를 설명합니다.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone은 URL에서 시작해 실제 페이지를 검사하고, 그것을 어떻게 다시 만들었는지에 대한 NOTES.md 형식의 흔적을 남깁니다.</figcaption>
      </figure>

      <h2>대화를 모션으로 바꾸기</h2>
      <p>이번 릴리스의 새 기능: <strong>Chat Motion Overlay 스킬</strong>은 두 사람의 대화를 애니메이션 채팅 오버레이로 바꿉니다 — WeChat, Telegram, Messenger 스타일의 컨테이너에 더해, 후반 작업을 위한 투명 출력 옵션까지. 홈도 더 명확한 진입점, 바로 쓸 수 있는 예시, 그리고 올바른 미리보기를 더 안정적으로 여는 템플릿·플러그인 카드로 올바른 출발점을 더 쉽게 찾게 해줍니다.</p>

      <h2>실패가 다음에 무엇을 할지 설명한다</h2>
      <p>완료된 작업은 진짜 결과물을 뜻해야 하고, 실패한 작업은 그 이유를 말해줘야 합니다. 0.15.0에서는 <strong>사용 가능한 프로젝트 파일을 생성하거나 저장하지 못한 실행이 더 이상 성공적으로 완료된 것으로 표시되지 않습니다</strong> — 그리고 누락된 로컬 에이전트, 너무 큰 입력, 사용할 수 없는 모델, 소진된 할당량, 타임아웃, 빈 출력, 저장 실패, 도구 루프 각각이 하나의 포괄적 오류 대신 구체적인 복구 경로를 제공합니다.</p>
      <p>내부의 복구도 더 튼튼해졌습니다: 작업을 멈추거나 프로젝트를 삭제하면, 이제 시간과 할당량을 계속 태우게 두는 대신 그 실행과 자식 프로세스를 취소합니다. 재시도는 더 이상 실패한 프로세스로부터 상태를 물려받지 않으며, 렌더러가 반복적으로 크래시하면 데스크톱 앱이 끝없는 새로고침을 반복하는 대신 (진단 로그 내보내기가 포함된) 복구 화면을 엽니다.</p>

      <h2>0.15.0에 또 무엇이 담겼나</h2>
      <ul>
        <li><strong>BYOK와 제3자 에이전트가 더 정확해졌습니다</strong> — 새로운 Atlas Cloud 사전 설정, 호환 chat-completions 경로로 라우팅되는 OpenAI 호환 엔드포인트, 채팅 선택기에서 제외된 임베딩·리랭크 모델, 그리고 Kiro, Reasonix, Antigravity, Grok Build, OpenRouter에 대한 더 명확한 피드백.</li>
        <li><strong>개인정보 선택이 더 이해하기 쉬워졌습니다</strong> — 동의와 설정이 이제 익명 런타임 지표와 비식별 처리된 품질 검토 콘텐츠를 구분합니다.</li>
        <li><strong>Library가 더 제 모습다워졌습니다</strong> — 더 안정적인 플러그인 카테고리 수와 번역, 템플릿과 일치하는 사전 생성 미리보기, 올바른 종횡비를 유지하는 덱 미리보기, 그리고 크기 조정 시 제대로 동작하는 WebGL 미리보기.</li>
      </ul>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead>
          <tr><th>당신이…</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 다운로드하고 프로젝트를 시작하세요 — 같은 작업이 이제 기본적으로 더 빨리 시작되고 더 적은 토큰을 씁니다</td></tr>
          <tr><td>프레젠테이션을 출시한다면</td><td>썸네일과 키보드 내비로 덱을 다루고, 발표자 노트를 제자리에 두고, 당신이 승인한 바로 그 버전을 내보내세요</td></tr>
          <tr><td>사이트를 다시 만든다면</td><td>Website Clone을 열고 공개 URL을 붙여 넣어, NOTES.md 흔적과 함께 실제 검사에서 시작하세요</td></tr>
          <tr><td>소셜용 모션을 만든다면</td><td>Chat Motion Overlay 스킬을 써서 대화를 애니메이션 오버레이로 바꿔 보세요</td></tr>
          <tr><td>실패한 실행에 부딪혔다면</td><td>실패 표시를 읽어보세요 — 원인과 복구 경로를 짚어주고, 이제 "완료"된 작업은 진짜 파일을 뜻합니다</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>가장 값싼 속도 향상은 당신이 결코 신경 쓸 필요 없는 속도 향상입니다. 0.15.0은 바로 거기에 예산을 씁니다 — 모든 작업에서 더 가벼운 프롬프트, 실제로 다룰 수 있는 덱, URL에서 시작하는 클론, 그리고 다음에 무엇을 할지 알려주는 실패 표시. 데스크톱 앱을 다운로드하고, 자주 실행하는 것을 실행해, 첫 토큰이 얼마나 더 일찍 나타나는지 느껴보세요.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>나흘 동안 118개의 PR, 일상 루프에서 1초, 1토큰, 혹은 한 번의 우회를 각자 더 깎아낸 34명에게서. 운동은 한 팀의 노트북에서 출시되지 않습니다; 공통의 길을 조금 더 싸고 조금 더 빠르게 만든 모든 이에게서 출시됩니다. 우리는 당신을 보고 있습니다. 🚀</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: 영감의 타임머신</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: 흐름 속에 머물기</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: 당신의 브랜드가 곧 디자인 시스템</a></li>
      </ul>
  de:
    title: 'Open Design 0.15.0: weniger Kosten, schneller ausliefern'
    summary: 'Tag open-design-v0.15.0 — 118 PRs von 34 Mitwirkenden in vier Tagen. Codename „Cost Less. Ship Faster." (Weniger Kosten, schneller ausliefern). Ein schlankerer Design System Prompt senkte in repräsentativen Läufen die Zeit bis zum ersten Token um 49.5%, die Ende-zu-Ende-Dauer um 21.2% und die durchschnittlichen Eingabe-Tokens um 25.1%. Der Rest des Releases glättet die gesamte kreative Schleife: Decks, die sich wie ein Arbeitsbereich anfühlen, Website-Klon aus einer URL, in Bewegung verwandelte Gespräche und Fehler, die endlich erklären, was als Nächstes zu tun ist.'
    category: 'Produkt'
    bodyHtml: |
      <p>Tag <code>open-design-v0.15.0</code>, veröffentlicht am 14. Juli 2026. <strong>118 PRs von 34 Mitwirkenden in vier Tagen.</strong> Codename „Cost Less. Ship Faster." (Weniger Kosten, schneller ausliefern). Die letzten beiden Releases hielten deine Arbeit über Unterbrechungen hinweg am Leben und bewahrten die Ideen, die der Flow früher verlor. Dieses hier nimmt sich der Steuer an, die du bei jedem Lauf zahlst: das Warten vor dem ersten Token, die Tokens, die es kostet, dorthin zu gelangen, und die Reibung zwischen einem fertigen Ergebnis und einem ausgelieferten Liefergegenstand.</p>
      <p>Du willst das vollständige Änderungsprotokoll? Es findet sich in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">Release Notes auf GitHub</a>. Dies ist die Kurzfassung: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Ein schlankerer Prompt, eine schnellere Schleife</h2>
      <p>Die Schlagzeile ist leise, aber bei jeder Aufgabe spürbar. Durch die Optimierung des Design System Prompt zeigten repräsentative Evaluierungsläufe eine <strong>Reduktion der Zeit bis zum ersten Token um 49.5%</strong>, eine <strong>Reduktion der Ende-zu-Ende-Dauer um 21.2%</strong> und einen <strong>um 25.1% geringeren durchschnittlichen Eingabe-Token-Verbrauch</strong>. Alltägliche Design-Aufgaben starten jetzt früher, verbrauchen weniger Tokens auf dem Weg dorthin und sind schneller fertig — dieselbe Arbeit, zu geringeren Kosten, ohne dass du irgendetwas an deiner Art zu prompten änderst.</p>
      <p>Das ist der Sinn des Codenamens. Weniger Kosten: weniger Tokens pro Aufgabe. Schneller ausliefern: weniger Warten zwischen Frage und Antwort. Effizienz, für die du dich nicht extra entscheiden musst.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Ein schlankerer Design System Prompt: 49.5% schneller bis zum ersten Token, 21.2% kürzer von Anfang bis Ende, 25.1% weniger Eingabe-Tokens — bei denselben alltäglichen Aufgaben.</figcaption>
      </figure>

      <h2>Decks, die sich wie ein Arbeitsbereich anfühlen</h2>
      <p>Ein fertiges Deck sollte sich wie ein Dokument verhalten, das du steuern kannst, nicht wie eine statische Vorschau, an der du vorbeiscrollst. In 0.15.0 <strong>erhalten mehrseitige Decks Thumbnail-Navigation, direkte Seitenauswahl und Pfeil- / Home- / End-Tastatursteuerung</strong> — kein Suchen mehr nach den Bedienelementen. <strong>Sprechernotizen bleiben bei der Folie, zu der sie gehören</strong>: Lies und bearbeite sie neben der aktuellen Folie, halte sie an Ort und Stelle und sieh sie in der Presenter View, ohne den zum Publikum gerichteten Bildschirm zu verdecken.</p>
      <p>Präsentieren ist jetzt ein erstklassiger Modus — starte im aktuellen Tab oder im Vollbild eine immersive Präsentation, bewege dich dann vor und zurück, pausiere, setze fort oder beginne neu, ohne den Deck-Zustand zu verlieren. Und wenn es Zeit für die Übergabe ist, <strong>exportiere genau die Version, die du freigegeben hast</strong>, als PDF, Bilder, ZIP oder HTML, statt stillschweigend die neuesten Änderungen auszuliefern (Sprechernotizen bleiben aus den exportierten Folien heraus).</p>

      <h2>Eine Website aus einer URL klonen</h2>
      <p>Eine Website nachzubauen begann früher mit einem leeren Prompt und viel Beschreibung. <strong>Website Clone ist jetzt ein erstklassiger Einstiegspunkt</strong> auf der Startseite und in der Library: Wähle die Fähigkeit, füge eine öffentliche URL ein, und Open Design erstellt das Projekt mit bereits vorhandenem, passendem Kontext.</p>
      <p>Es hinterlässt außerdem eine Prüfspur. Der Workflow inspiziert zuerst Seitenstruktur, Routen, Assets und Interaktionen, und das erzeugte Projekt bewahrt eine Dokumentation im NOTES.md-Stil, die seinen Ansatz, die Asset-Quellen und bekannte Unterschiede beschreibt. Ergebnisse sind bereit für die lokale Vorschau und <strong>übernehmen keine Analyse- oder Werbeskripte von Drittanbietern</strong> — und bei schwierigen Zielen wie Seiten hinter einer Login-Wand erklärt Open Design die Grenzen, statt vorzugeben, der Klon sei vollständig.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone startet von einer URL, inspiziert die echte Seite und hinterlässt eine Spur im NOTES.md-Stil, wie es sie neu aufgebaut hat.</figcaption>
      </figure>

      <h2>Gespräche in Bewegung verwandeln</h2>
      <p>Neu in diesem Release: Die <strong>Chat Motion Overlay-Fähigkeit</strong> verwandelt ein Gespräch zwischen zwei Personen in ein animiertes Chat-Overlay — Container im Stil von WeChat, Telegram und Messenger, plus Optionen für transparente Ausgabe zur Nachbearbeitung. Auch die Startseite macht es leichter, den richtigen Ausgangspunkt zu finden, mit klareren Einstiegspunkten, sofort einsetzbaren Beispielen und Template- und Plugin-Karten, die die richtige Vorschau zuverlässiger öffnen.</p>

      <h2>Fehler erklären, was als Nächstes zu tun ist</h2>
      <p>Eine abgeschlossene Aufgabe sollte einen echten Liefergegenstand bedeuten, und eine fehlgeschlagene sollte dir sagen, warum. In 0.15.0 <strong>werden Läufe, die keine brauchbaren Projektdateien erzeugen oder speichern können, nicht länger als erfolgreich abgeschlossen angezeigt</strong> — und fehlende lokale Agenten, übergroße Eingaben, nicht verfügbare Modelle, erschöpfte Kontingente, Timeouts, leere Ausgaben, Speicherfehler und Tool-Schleifen bieten jeweils einen konkreten Wiederherstellungspfad statt eines Sammelfehlers.</p>
      <p>Auch die Wiederherstellung wurde darunter robuster: Eine Aufgabe zu stoppen oder ein Projekt zu löschen bricht jetzt den Lauf und seine Kindprozesse ab, statt sie Zeit und Kontingent verbrennen zu lassen; Wiederholungen erben keinen Zustand mehr von fehlgeschlagenen Prozessen; und die Desktop-App öffnet einen Wiederherstellungsbildschirm (mit einem Export des Diagnoseprotokolls), wenn der Renderer wiederholt abstürzt, statt in einem endlosen Neuladen zu kreisen.</p>

      <h2>Was sonst noch in 0.15.0 landet</h2>
      <ul>
        <li><strong>BYOK und Drittanbieter-Agenten sind genauer</strong> — ein neues Atlas Cloud-Preset, OpenAI-kompatible Endpunkte, die über den kompatiblen chat-completions-Pfad geroutet werden, Embedding- und Rerank-Modelle, die aus dem Chat-Selektor herausgehalten werden, und klareres Feedback für Kiro, Reasonix, Antigravity, Grok Build und OpenRouter.</li>
        <li><strong>Datenschutz-Entscheidungen sind leichter zu verstehen</strong> — Einwilligung und Einstellungen unterscheiden jetzt anonyme Laufzeit-Metriken von geschwärzten Inhalten der Qualitätsprüfung.</li>
        <li><strong>Die Library sieht mehr so aus, wie sie sollte</strong> — stabilere Plugin-Kategoriezahlen und Übersetzungen, vorberechnete Vorschauen, die zu ihren Templates passen, Deck-Vorschauen, die das richtige Seitenverhältnis beibehalten, und WebGL-Vorschauen, die sich beim Skalieren korrekt verhalten.</li>
      </ul>

      <h2>Was du heute damit machen kannst</h2>
      <table>
        <thead>
          <tr><th>Wenn du…</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>Neu bei Open Design bist</td><td>Lade die Desktop-App herunter und starte ein Projekt — dieselben Aufgaben starten jetzt standardmäßig schneller und kosten weniger Tokens</td></tr>
          <tr><td>Eine Präsentation ausspielst</td><td>Steuere das Deck mit Thumbnails und Tastaturnavigation, halte Sprechernotizen an Ort und Stelle und exportiere genau die Version, die du freigegeben hast</td></tr>
          <tr><td>Eine Website neu aufbaust</td><td>Öffne Website Clone, füge eine öffentliche URL ein und starte von einer echten Inspektion mit einer NOTES.md-Spur</td></tr>
          <tr><td>Social-Bewegung erstellst</td><td>Probiere die Chat Motion Overlay-Fähigkeit, um ein Gespräch in ein animiertes Overlay zu verwandeln</td></tr>
          <tr><td>Von einem fehlgeschlagenen Lauf getroffen wurdest</td><td>Lies den Fehler — er benennt die Ursache und einen Wiederherstellungspfad, und eine „abgeschlossene" Aufgabe bedeutet jetzt eine echte Datei</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Die günstigste Beschleunigung ist die, über die du nie nachdenken musst. 0.15.0 gibt sein Budget genau dort aus — ein schlankerer Prompt bei jeder Aufgabe, ein Deck, das du wirklich steuern kannst, ein Klon, der von einer URL startet, und ein Fehler, der dir sagt, was als Nächstes zu tun ist. Lade die Desktop-App herunter, starte etwas, das du oft ausführst, und bemerke, wie viel früher das erste Token erscheint.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>118 PRs in vier Tagen, von 34 Menschen, die jeweils eine weitere Sekunde, ein weiteres Token oder einen weiteren Umweg aus der alltäglichen Schleife herausgeschnitten haben. Eine Bewegung wird nicht von den Laptops eines einzelnen Teams ausgeliefert; sie wird von allen ausgeliefert, die den gemeinsamen Pfad ein bisschen billiger und ein bisschen schneller gemacht haben. Wir sehen euch. 🚀</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: die Inspirations-Zeitmaschine</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: im Flow bleiben</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: deine Marke ist ein Designsystem</a></li>
      </ul>
  fr:
    title: 'Open Design 0.15.0 : coûter moins, livrer plus vite'
    summary: 'Tag open-design-v0.15.0 — 118 PR de 34 contributeurs en quatre jours. Nom de code « Cost Less. Ship Faster. » (Coûter moins, livrer plus vite). Un Design System Prompt allégé a réduit, sur des exécutions représentatives, le temps jusqu''au premier token de 49.5%, la durée de bout en bout de 21.2% et les tokens d''entrée moyens de 25.1%. Le reste de la version fluidifie toute la boucle créative : des decks qui se comportent comme un espace de travail, le clonage de site web depuis une URL, des conversations transformées en animation, et des échecs qui expliquent enfin quoi faire ensuite.'
    category: 'Produit'
    bodyHtml: |
      <p>Tag <code>open-design-v0.15.0</code>, publié le 14 juillet 2026. <strong>118 PR de 34 contributeurs en quatre jours.</strong> Nom de code « Cost Less. Ship Faster. » (Coûter moins, livrer plus vite). Les deux dernières versions ont gardé votre travail en vie à travers les interruptions et sauvé les idées que le flow avait l'habitude de perdre. Celle-ci s'attaque à l'impôt que vous payez sur chaque exécution : l'attente avant le premier token, les tokens dépensés pour y arriver, et la friction entre un résultat terminé et un livrable expédié.</p>
      <p>Vous voulez le changelog complet ? Il se trouve dans les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">notes de version sur GitHub</a>. Ceci est la version courte : ce qui a changé sous le capot, ce que vous pouvez en faire dès aujourd'hui, et par où commencer.</p>

      <h2>Un prompt allégé, une boucle plus rapide</h2>
      <p>Le titre est discret, mais il se ressent sur chaque tâche. En optimisant le Design System Prompt, des exécutions d'évaluation représentatives ont montré une <strong>réduction de 49.5% du temps jusqu'au premier token</strong>, une <strong>réduction de 21.2% de la durée de bout en bout</strong> et une <strong>utilisation moyenne de tokens d'entrée inférieure de 25.1%</strong>. Les tâches de conception quotidiennes démarrent désormais plus tôt, dépensent moins de tokens pour y arriver et se terminent plus vite — le même travail, à moindre coût, sans que vous changiez quoi que ce soit à votre façon de prompter.</p>
      <p>C'est tout l'intérêt du nom de code. Coûter moins : moins de tokens par tâche. Livrer plus vite : moins d'attente entre la demande et la réponse. Une efficacité à laquelle vous n'avez pas à souscrire.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Un Design System Prompt allégé : 49.5% plus rapide jusqu'au premier token, 21.2% plus court de bout en bout, 25.1% de tokens d'entrée en moins — sur les mêmes tâches quotidiennes.</figcaption>
      </figure>

      <h2>Des decks qui se comportent comme un espace de travail</h2>
      <p>Un deck terminé devrait se comporter comme un document que vous pouvez piloter, pas comme un aperçu statique que vous faites défiler. Dans la 0.15.0, <strong>les decks multipages gagnent une navigation par vignettes, la sélection directe de page et un contrôle clavier flèches / Home / End</strong> — fini la chasse aux commandes. <strong>Les notes de l'intervenant restent avec la diapositive à laquelle elles appartiennent</strong> : lisez-les et modifiez-les à côté de la diapositive courante, gardez-les en place, et voyez-les dans le Presenter View sans couvrir l'écran tourné vers le public.</p>
      <p>Présenter est désormais un mode de premier plan — entrez dans une présentation immersive dans l'onglet courant ou en plein écran, puis avancez et reculez, mettez en pause, reprenez ou recommencez sans perdre l'état du deck. Et quand vient le moment de la passation, <strong>exportez exactement la version que vous avez approuvée</strong> en PDF, images, ZIP ou HTML au lieu d'expédier discrètement les dernières modifications (les notes de l'intervenant sont exclues des diapositives exportées).</p>

      <h2>Cloner un site web depuis une URL</h2>
      <p>Recréer un site commençait autrefois par un prompt vierge et beaucoup de description. <strong>Website Clone est désormais un point d'entrée de premier plan</strong> sur l'accueil et dans la Library : choisissez la capacité, collez une URL publique, et Open Design crée le projet avec le bon contexte déjà en place.</p>
      <p>Il laisse aussi une piste d'audit. Le flux inspecte d'abord la structure de la page, les routes, les assets et les interactions, et le projet généré conserve une documentation de style NOTES.md décrivant son approche, ses sources d'assets et les différences connues. Les résultats sont prêts pour un aperçu local et <strong>ne reprennent pas les scripts d'analyse ou de publicité tiers</strong> — et pour les cibles difficiles comme les sites protégés par un mur de connexion, Open Design explique les limites au lieu de prétendre que le clone est complet.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone part d'une URL, inspecte la vraie page, et laisse une piste de style NOTES.md sur la façon dont il l'a reconstruite.</figcaption>
      </figure>

      <h2>Transformer les conversations en animation</h2>
      <p>Nouveau dans cette version : la <strong>compétence Chat Motion Overlay</strong> transforme une conversation à deux en une superposition de chat animée — des conteneurs de style WeChat, Telegram et Messenger, plus des options de sortie transparente pour la post-production. L'accueil facilite aussi la recherche du bon point de départ, avec des points d'entrée plus clairs, des exemples prêts à l'emploi, et des cartes de template et de plugin qui ouvrent le bon aperçu de manière plus fiable.</p>

      <h2>Les échecs expliquent quoi faire ensuite</h2>
      <p>Une tâche terminée devrait signifier un vrai livrable, et une tâche échouée devrait vous dire pourquoi. Dans la 0.15.0, <strong>les exécutions qui échouent à générer ou à enregistrer des fichiers de projet utilisables ne sont plus affichées comme terminées avec succès</strong> — et les agents locaux manquants, les entrées surdimensionnées, les modèles indisponibles, les quotas épuisés, les délais dépassés, la sortie vide, les échecs d'enregistrement et les boucles d'outils fournissent chacun un chemin de récupération spécifique au lieu d'une erreur fourre-tout.</p>
      <p>La récupération est aussi devenue plus solide en dessous : arrêter une tâche ou supprimer un projet annule désormais l'exécution et ses processus enfants au lieu de les laisser brûler du temps et du quota ; les nouvelles tentatives n'héritent plus de l'état des processus échoués ; et l'application de bureau ouvre un écran de récupération (avec un export du journal de diagnostic) lorsque le moteur de rendu plante à répétition, au lieu de tourner en boucle sur un rechargement sans fin.</p>

      <h2>Quoi d'autre arrive dans la 0.15.0</h2>
      <ul>
        <li><strong>Le BYOK et les agents tiers sont plus précis</strong> — un nouveau préréglage Atlas Cloud, des endpoints compatibles OpenAI routés via le chemin chat-completions compatible, des modèles d'embedding et de rerank tenus à l'écart du sélecteur de chat, et un retour plus clair pour Kiro, Reasonix, Antigravity, Grok Build et OpenRouter.</li>
        <li><strong>Les choix de confidentialité sont plus faciles à comprendre</strong> — le consentement et les paramètres distinguent désormais les métriques d'exécution anonymes du contenu de revue qualité expurgé.</li>
        <li><strong>La Library ressemble davantage à ce qu'elle devrait être</strong> — des comptes de catégories de plugins et des traductions plus stables, des aperçus précalculés qui correspondent à leurs templates, des aperçus de deck qui conservent le bon rapport d'aspect, et des aperçus WebGL qui se comportent bien lors du redimensionnement.</li>
      </ul>

      <h2>Quoi en faire dès aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau et démarrez un projet — les mêmes tâches démarrent désormais plus vite et coûtent moins de tokens par défaut</td></tr>
          <tr><td>En train de livrer une présentation</td><td>Pilotez le deck avec les vignettes et la navigation clavier, gardez les notes de l'intervenant en place, et exportez exactement la version que vous avez approuvée</td></tr>
          <tr><td>En train de reconstruire un site</td><td>Ouvrez Website Clone, collez une URL publique, et partez d'une vraie inspection avec une piste NOTES.md</td></tr>
          <tr><td>En train de créer de l'animation sociale</td><td>Essayez la compétence Chat Motion Overlay pour transformer une conversation en superposition animée</td></tr>
          <tr><td>Confronté à une exécution échouée</td><td>Lisez l'échec — il nomme la cause et un chemin de récupération, et une tâche « terminée » signifie désormais un vrai fichier</td></tr>
        </tbody>
      </table>

      <h2>Quoi faire ensuite</h2>
      <p>L'accélération la moins chère est celle à laquelle vous n'avez jamais à penser. La 0.15.0 dépense son budget là — un prompt allégé sur chaque tâche, un deck que vous pouvez réellement piloter, un clone qui part d'une URL, et un échec qui vous dit quoi faire ensuite. Téléchargez l'application de bureau, lancez quelque chose que vous lancez souvent, et remarquez à quel point le premier token apparaît plus tôt.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Téléchargez Open Design</a>.</p>
      <p>118 PR en quatre jours, de 34 personnes qui ont chacune grappillé une seconde de plus, un token de plus, ou un détour de plus sur la boucle du quotidien. Un mouvement ne se livre pas depuis les ordinateurs portables d'une seule équipe ; il se livre depuis tous ceux qui ont rendu le chemin commun un peu moins cher et un peu plus rapide. On vous voit. 🚀</p>

      <h2>Lectures associées</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0 : la machine à remonter l'inspiration</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0 : rester dans le flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0 : votre marque est un système de design</a></li>
      </ul>
  ru:
    title: 'Open Design 0.15.0: меньше затрат, быстрее релиз'
    summary: 'Тег open-design-v0.15.0 — 118 PR от 34 контрибьюторов за четыре дня. Кодовое название «Cost Less. Ship Faster.» (Меньше затрат, быстрее релиз). Облегчённый Design System Prompt сократил в репрезентативных запусках время до первого токена на 49.5%, сквозную длительность на 21.2% и среднее число входных токенов на 25.1%. Остальная часть релиза сглаживает весь творческий цикл: презентации, которые ведут себя как рабочее пространство, клонирование сайта по URL, превращение разговоров в анимацию и сбои, которые наконец объясняют, что делать дальше.'
    category: 'Продукт'
    bodyHtml: |
      <p>Тег <code>open-design-v0.15.0</code>, выпущен 14 июля 2026 года. <strong>118 PR от 34 контрибьюторов за четыре дня.</strong> Кодовое название «Cost Less. Ship Faster.» (Меньше затрат, быстрее релиз). Два последних релиза сохраняли вашу работу живой сквозь прерывания и спасали идеи, которые поток раньше терял. Этот нацелен на налог, который вы платите за каждый запуск: ожидание перед первым токеном, токены, потраченные на то, чтобы до него добраться, и трение между готовым результатом и отгруженным продуктом.</p>
      <p>Нужен полный список изменений? Он есть в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">примечаниях к релизу на GitHub</a>. Это краткая версия: что изменилось под капотом, что вы можете с этим сделать уже сегодня и с чего начать.</p>

      <h2>Более лёгкий промпт, более быстрый цикл</h2>
      <p>Заголовок тихий, но ощущается на каждой задаче. Благодаря оптимизации Design System Prompt репрезентативные оценочные запуски показали <strong>сокращение времени до первого токена на 49.5%</strong>, <strong>сокращение сквозной длительности на 21.2%</strong> и <strong>снижение среднего расхода входных токенов на 25.1%</strong>. Повседневные задачи по дизайну теперь начинаются раньше, тратят меньше токенов, чтобы до этого дойти, и завершаются быстрее — та же работа, по более низкой цене, и вам не нужно менять ничего в том, как вы пишете промпты.</p>
      <p>В этом и суть кодового названия. Меньше затрат: меньше токенов на задачу. Быстрее релиз: меньше ожидания между вопросом и ответом. Эффективность, которую не нужно специально включать.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Более лёгкий Design System Prompt: на 49.5% быстрее до первого токена, на 21.2% короче от начала до конца, на 25.1% меньше входных токенов — на тех же повседневных задачах.</figcaption>
      </figure>

      <h2>Презентации, которые ощущаются как рабочее пространство</h2>
      <p>Готовая презентация должна вести себя как документ, которым вы управляете, а не как статичный предпросмотр, мимо которого вы прокручиваете. В 0.15.0 <strong>многостраничные презентации получают навигацию по миниатюрам, прямой выбор страницы и управление клавишами стрелок / Home / End</strong> — больше не нужно искать элементы управления. <strong>Заметки докладчика остаются при том слайде, которому они принадлежат</strong>: читайте и редактируйте их рядом с текущим слайдом, держите их на месте и видьте их в Presenter View, не закрывая экран, обращённый к аудитории.</p>
      <p>Показ теперь полноценный режим — войдите в иммерсивную презентацию в текущей вкладке или на полном экране, затем двигайтесь вперёд и назад, ставьте на паузу, возобновляйте или начинайте заново, не теряя состояния презентации. А когда придёт время передачи, <strong>экспортируйте именно ту версию, которую вы утвердили</strong>, в PDF, изображения, ZIP или HTML вместо того, чтобы молча отгрузить последние правки (заметки докладчика в экспортируемые слайды не попадают).</p>

      <h2>Клонировать сайт по URL</h2>
      <p>Воссоздание сайта раньше начиналось с пустого промпта и множества описаний. <strong>Website Clone теперь полноценная точка входа</strong> на главной и в Library: выберите возможность, вставьте публичный URL, и Open Design создаст проект с уже готовым нужным контекстом.</p>
      <p>Он также оставляет контрольный след. Рабочий процесс сначала исследует структуру страницы, маршруты, ресурсы и взаимодействия, а сгенерированный проект хранит документацию в стиле NOTES.md, описывающую его подход, источники ресурсов и известные различия. Результаты готовы к локальному предпросмотру и <strong>не переносят сторонние скрипты аналитики или рекламы</strong> — а для сложных целей, таких как сайты за стеной входа, Open Design объясняет ограничения вместо того, чтобы делать вид, что клон завершён.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone начинает с URL, исследует реальную страницу и оставляет след в стиле NOTES.md о том, как он её пересобрал.</figcaption>
      </figure>

      <h2>Превращать разговоры в анимацию</h2>
      <p>Новое в этом релизе: <strong>навык Chat Motion Overlay</strong> превращает разговор двух человек в анимированный чат-оверлей — контейнеры в стиле WeChat, Telegram и Messenger, плюс варианты прозрачного вывода для постобработки. Главная тоже упрощает поиск нужной отправной точки: более понятные точки входа, готовые к использованию примеры и карточки шаблонов и плагинов, которые надёжнее открывают правильный предпросмотр.</p>

      <h2>Сбои объясняют, что делать дальше</h2>
      <p>Завершённая задача должна означать настоящий результат, а неудавшаяся — сообщать вам почему. В 0.15.0 <strong>запуски, которым не удалось сгенерировать или сохранить пригодные файлы проекта, больше не показываются как успешно завершённые</strong> — а отсутствующие локальные агенты, слишком большие входные данные, недоступные модели, исчерпанные квоты, тайм-ауты, пустой вывод, сбои сохранения и циклы инструментов — каждый из них даёт конкретный путь восстановления вместо одной универсальной ошибки.</p>
      <p>Восстановление под капотом тоже стало крепче: остановка задачи или удаление проекта теперь отменяет запуск и его дочерние процессы, вместо того чтобы позволять им жечь время и квоту; повторные попытки больше не наследуют состояние от неудавшихся процессов; а десктопное приложение открывает экран восстановления (с экспортом диагностического журнала), когда рендерер многократно падает, вместо того чтобы бесконечно перезагружаться по кругу.</p>

      <h2>Что ещё входит в 0.15.0</h2>
      <ul>
        <li><strong>BYOK и сторонние агенты стали точнее</strong> — новый пресет Atlas Cloud, OpenAI-совместимые эндпойнты, маршрутизируемые через совместимый путь chat-completions, модели эмбеддингов и переранжирования, убранные из селектора чата, и более понятная обратная связь для Kiro, Reasonix, Antigravity, Grok Build и OpenRouter.</li>
        <li><strong>Выбор настроек приватности легче понять</strong> — согласие и настройки теперь различают анонимные метрики выполнения и отредактированное содержимое проверки качества.</li>
        <li><strong>Library выглядит больше так, как должна</strong> — более стабильные счётчики категорий плагинов и переводы, предрассчитанные предпросмотры, соответствующие своим шаблонам, предпросмотры презентаций, сохраняющие правильное соотношение сторон, и предпросмотры WebGL, которые корректно ведут себя при изменении размера.</li>
      </ul>

      <h2>Что с этим делать сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктопное приложение и начните проект — те же задачи теперь по умолчанию начинаются быстрее и стоят меньше токенов</td></tr>
          <tr><td>Отгружаете презентацию</td><td>Управляйте презентацией миниатюрами и клавиатурной навигацией, держите заметки докладчика на месте и экспортируйте именно ту версию, которую вы утвердили</td></tr>
          <tr><td>Пересобираете сайт</td><td>Откройте Website Clone, вставьте публичный URL и начните с реального обследования со следом NOTES.md</td></tr>
          <tr><td>Создаёте анимацию для соцсетей</td><td>Попробуйте навык Chat Motion Overlay, чтобы превратить разговор в анимированный оверлей</td></tr>
          <tr><td>Столкнулись с неудавшимся запуском</td><td>Прочитайте сообщение о сбое — оно называет причину и путь восстановления, а «завершённая» задача теперь означает настоящий файл</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Самое дешёвое ускорение — то, о котором вам никогда не приходится думать. 0.15.0 тратит свой бюджет именно там — более лёгкий промпт на каждой задаче, презентация, которой вы действительно можете управлять, клон, начинающийся с URL, и сбой, который говорит вам, что делать дальше. Скачайте десктопное приложение, запустите то, что запускаете часто, и заметьте, насколько раньше появляется первый токен.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>118 PR за четыре дня, от 34 человек, каждый из которых срезал ещё одну секунду, ещё один токен или ещё один обходной путь с повседневного цикла. Движение не отгружается с ноутбуков одной команды; оно отгружается всеми, кто сделал общий путь чуть дешевле и чуть быстрее. Мы вас видим. 🚀</p>

      <h2>Дополнительное чтение</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: машина времени для вдохновения</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: оставаться в потоке</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: ваш бренд — это дизайн-система</a></li>
      </ul>
  es:
    title: 'Open Design 0.15.0: cuesta menos, entrega más rápido'
    summary: 'Etiqueta open-design-v0.15.0 — 118 PR de 34 colaboradores en cuatro días. Nombre en clave «Cost Less. Ship Faster.» (Cuesta menos. Entrega más rápido). Un Design System Prompt más ligero redujo, en ejecuciones representativas, el tiempo hasta el primer token en un 49.5%, la duración de extremo a extremo en un 21.2% y los tokens de entrada promedio en un 25.1%. El resto de la versión suaviza todo el bucle creativo: presentaciones que se sienten como un espacio de trabajo, clonación de sitios web desde una URL, conversaciones convertidas en animación y fallos que por fin explican qué hacer a continuación.'
    category: 'Producto'
    bodyHtml: |
      <p>Etiqueta <code>open-design-v0.15.0</code>, publicado el 14 de julio de 2026. <strong>118 PR de 34 colaboradores en cuatro días.</strong> Nombre en clave «Cost Less. Ship Faster.» (Cuesta menos. Entrega más rápido). Las dos últimas versiones mantuvieron tu trabajo vivo a través de las interrupciones y salvaron las ideas que el flow solía perder. Esta va tras el impuesto que pagas en cada ejecución: la espera antes del primer token, los tokens que gastas para llegar allí y la fricción entre un resultado terminado y un entregable enviado.</p>
      <p>¿Quieres el registro de cambios completo? Está en las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">notas de la versión en GitHub</a>. Esta es la versión corta: qué cambió por debajo, qué puedes hacer con ello hoy y por dónde empezar.</p>

      <h2>Un prompt más ligero, un bucle más rápido</h2>
      <p>El titular es discreto, pero se siente en cada tarea. Al optimizar el Design System Prompt, ejecuciones de evaluación representativas mostraron una <strong>reducción del 49.5% en el tiempo hasta el primer token</strong>, una <strong>reducción del 21.2% en la duración de extremo a extremo</strong> y un <strong>uso promedio de tokens de entrada un 25.1% menor</strong>. Las tareas de diseño cotidianas ahora empiezan antes, gastan menos tokens para llegar allí y terminan más rápido — el mismo trabajo, a un coste menor, sin que cambies nada en tu forma de escribir prompts.</p>
      <p>Ese es el sentido del nombre en clave. Cuesta menos: menos tokens por tarea. Entrega más rápido: menos espera entre la petición y la respuesta. Una eficiencia a la que no tienes que suscribirte.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Un Design System Prompt más ligero: un 49.5% más rápido hasta el primer token, un 21.2% más corto de extremo a extremo, un 25.1% menos de tokens de entrada — en las mismas tareas cotidianas.</figcaption>
      </figure>

      <h2>Presentaciones que se sienten como un espacio de trabajo</h2>
      <p>Una presentación terminada debería comportarse como un documento que puedes pilotar, no como una vista previa estática por la que te desplazas. En la 0.15.0, <strong>las presentaciones de varias páginas obtienen navegación por miniaturas, selección directa de página y control por teclado de flechas / Home / End</strong> — se acabó buscar los controles. <strong>Las notas del ponente se quedan con la diapositiva a la que pertenecen</strong>: léelas y edítalas junto a la diapositiva actual, mantenlas en su sitio y velas en el Presenter View sin cubrir la pantalla orientada al público.</p>
      <p>Presentar es ahora un modo de primera clase — entra en una presentación inmersiva en la pestaña actual o a pantalla completa, y luego avanza y retrocede, pausa, reanuda o reinicia sin perder el estado de la presentación. Y cuando llega el momento de la entrega, <strong>exporta exactamente la versión que aprobaste</strong> como PDF, imágenes, ZIP o HTML en lugar de enviar en silencio las últimas ediciones (las notas del ponente quedan fuera de las diapositivas exportadas).</p>

      <h2>Clonar un sitio web desde una URL</h2>
      <p>Recrear un sitio solía empezar con un prompt en blanco y mucha descripción. <strong>Website Clone es ahora un punto de entrada de primera clase</strong> en el Inicio y en la Library: elige la capacidad, pega una URL pública y Open Design crea el proyecto con el contexto correcto ya en su sitio.</p>
      <p>También deja un rastro de auditoría. El flujo inspecciona primero la estructura de la página, las rutas, los recursos y las interacciones, y el proyecto generado conserva documentación al estilo NOTES.md que describe su enfoque, las fuentes de los recursos y las diferencias conocidas. Los resultados están listos para la vista previa local y <strong>no arrastran scripts de analítica ni de publicidad de terceros</strong> — y para objetivos difíciles como sitios protegidos por un muro de inicio de sesión, Open Design explica los límites en lugar de fingir que el clon está completo.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone parte de una URL, inspecciona la página real y deja un rastro al estilo NOTES.md de cómo la reconstruyó.</figcaption>
      </figure>

      <h2>Convertir conversaciones en animación</h2>
      <p>Nuevo en esta versión: la <strong>habilidad Chat Motion Overlay</strong> convierte una conversación entre dos personas en una superposición de chat animada — contenedores al estilo de WeChat, Telegram y Messenger, además de opciones de salida transparente para la posproducción. El Inicio también facilita encontrar el punto de partida correcto, con puntos de entrada más claros, ejemplos listos para usar y tarjetas de plantilla y de plugin que abren la vista previa correcta de forma más fiable.</p>

      <h2>Los fallos explican qué hacer a continuación</h2>
      <p>Una tarea completada debería significar un entregable real, y una fallida debería decirte por qué. En la 0.15.0, <strong>las ejecuciones que no logran generar o guardar archivos de proyecto utilizables ya no se muestran como completadas con éxito</strong> — y los agentes locales ausentes, las entradas demasiado grandes, los modelos no disponibles, las cuotas agotadas, los tiempos de espera, la salida vacía, los fallos de guardado y los bucles de herramientas ofrecen cada uno una ruta de recuperación específica en lugar de un único error genérico.</p>
      <p>La recuperación también se volvió más sólida por debajo: detener una tarea o eliminar un proyecto ahora cancela la ejecución y sus procesos hijos en lugar de dejar que quemen tiempo y cuota; los reintentos ya no heredan el estado de los procesos fallidos; y la aplicación de escritorio abre una pantalla de recuperación (con una exportación del registro de diagnóstico) cuando el renderizador se bloquea repetidamente, en lugar de dar vueltas en una recarga infinita.</p>

      <h2>Qué más llega en la 0.15.0</h2>
      <ul>
        <li><strong>El BYOK y los agentes de terceros son más precisos</strong> — un nuevo preajuste de Atlas Cloud, endpoints compatibles con OpenAI enrutados por la ruta compatible de chat-completions, modelos de embedding y de rerank mantenidos fuera del selector de chat, y una retroalimentación más clara para Kiro, Reasonix, Antigravity, Grok Build y OpenRouter.</li>
        <li><strong>Las opciones de privacidad son más fáciles de entender</strong> — el consentimiento y los ajustes ahora distinguen las métricas de tiempo de ejecución anónimas del contenido de revisión de calidad redactado.</li>
        <li><strong>La Library se parece más a lo que debería</strong> — recuentos de categorías de plugins y traducciones más estables, vistas previas precalculadas que coinciden con sus plantillas, vistas previas de presentaciones que mantienen la proporción correcta y vistas previas WebGL que se comportan bien al cambiar de tamaño.</li>
      </ul>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio y empieza un proyecto — las mismas tareas ahora empiezan más rápido y cuestan menos tokens por defecto</td></tr>
          <tr><td>Entregando una presentación</td><td>Pilota la presentación con miniaturas y navegación por teclado, mantén las notas del ponente en su sitio y exporta exactamente la versión que aprobaste</td></tr>
          <tr><td>Reconstruyendo un sitio</td><td>Abre Website Clone, pega una URL pública y parte de una inspección real con un rastro NOTES.md</td></tr>
          <tr><td>Creando animación para redes sociales</td><td>Prueba la habilidad Chat Motion Overlay para convertir una conversación en una superposición animada</td></tr>
          <tr><td>Golpeado por una ejecución fallida</td><td>Lee el fallo — nombra la causa y una ruta de recuperación, y una tarea «completada» ahora significa un archivo real</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>La aceleración más barata es aquella en la que nunca tienes que pensar. La 0.15.0 gasta su presupuesto ahí — un prompt más ligero en cada tarea, una presentación que realmente puedes pilotar, un clon que parte de una URL y un fallo que te dice qué hacer a continuación. Descarga la aplicación de escritorio, ejecuta algo que ejecutes a menudo y fíjate en cuánto antes aparece el primer token.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>118 PR en cuatro días, de 34 personas que cada una recortó un segundo más, un token más o un rodeo más del bucle cotidiano. Un movimiento no se entrega desde los portátiles de un solo equipo; se entrega desde todos los que hicieron el camino común un poco más barato y un poco más rápido. Te vemos. 🚀</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: la máquina del tiempo de la inspiración</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: mantente en el flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: tu marca es un sistema de diseño</a></li>
      </ul>
  pt-br:
    title: 'Open Design 0.15.0: custe menos, entregue mais rápido'
    summary: 'Tag open-design-v0.15.0 — 118 PRs de 34 contribuidores em quatro dias. Codinome «Cost Less. Ship Faster.» (Custe menos. Entregue mais rápido). Um Design System Prompt mais enxuto reduziu, em execuções representativas, o tempo até o primeiro token em 49.5%, a duração de ponta a ponta em 21.2% e os tokens de entrada médios em 25.1%. O resto da versão suaviza todo o ciclo criativo: apresentações que parecem um espaço de trabalho, clonagem de site a partir de uma URL, conversas transformadas em animação e falhas que finalmente explicam o que fazer a seguir.'
    category: 'Produto'
    bodyHtml: |
      <p>Tag <code>open-design-v0.15.0</code>, publicado em 14 de julho de 2026. <strong>118 PRs de 34 contribuidores em quatro dias.</strong> Codinome «Cost Less. Ship Faster.» (Custe menos. Entregue mais rápido). As duas últimas versões mantiveram seu trabalho vivo através das interrupções e salvaram as ideias que o flow costumava perder. Esta vai atrás do imposto que você paga em cada execução: a espera antes do primeiro token, os tokens gastos para chegar lá e o atrito entre um resultado pronto e um entregável despachado.</p>
      <p>Quer o changelog completo? Ele está nas <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">notas de versão no GitHub</a>. Esta é a versão curta: o que mudou por baixo, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Um prompt mais enxuto, um ciclo mais rápido</h2>
      <p>A manchete é discreta, mas é sentida em cada tarefa. Ao otimizar o Design System Prompt, execuções de avaliação representativas mostraram uma <strong>redução de 49.5% no tempo até o primeiro token</strong>, uma <strong>redução de 21.2% na duração de ponta a ponta</strong> e um <strong>uso médio de tokens de entrada 25.1% menor</strong>. As tarefas de design do dia a dia agora começam mais cedo, gastam menos tokens para chegar lá e terminam mais rápido — o mesmo trabalho, a um custo menor, sem que você mude nada na forma como escreve prompts.</p>
      <p>É esse o ponto do codinome. Custe menos: menos tokens por tarefa. Entregue mais rápido: menos espera entre o pedido e a resposta. Uma eficiência à qual você não precisa aderir.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Um Design System Prompt mais enxuto: 49.5% mais rápido até o primeiro token, 21.2% mais curto de ponta a ponta, 25.1% menos tokens de entrada — nas mesmas tarefas do dia a dia.</figcaption>
      </figure>

      <h2>Apresentações que parecem um espaço de trabalho</h2>
      <p>Uma apresentação pronta deveria se comportar como um documento que você pode pilotar, não como uma prévia estática pela qual você rola. Na 0.15.0, <strong>apresentações de várias páginas ganham navegação por miniaturas, seleção direta de página e controle de teclado por setas / Home / End</strong> — chega de caçar os controles. <strong>As notas do apresentador ficam com o slide ao qual pertencem</strong>: leia-as e edite-as ao lado do slide atual, mantenha-as no lugar e veja-as no Presenter View sem cobrir a tela voltada para o público.</p>
      <p>Apresentar agora é um modo de primeira classe — entre em uma apresentação imersiva na aba atual ou em tela cheia, depois avance e volte, pause, retome ou recomece sem perder o estado da apresentação. E quando chegar a hora da entrega, <strong>exporte exatamente a versão que você aprovou</strong> como PDF, imagens, ZIP ou HTML em vez de despachar silenciosamente as edições mais recentes (as notas do apresentador ficam de fora dos slides exportados).</p>

      <h2>Clonar um site a partir de uma URL</h2>
      <p>Recriar um site costumava começar com um prompt em branco e muita descrição. <strong>O Website Clone agora é um ponto de entrada de primeira classe</strong> na Home e na Library: escolha a capacidade, cole uma URL pública e o Open Design cria o projeto com o contexto certo já no lugar.</p>
      <p>Ele também deixa uma trilha de auditoria. O fluxo primeiro inspeciona a estrutura da página, as rotas, os assets e as interações, e o projeto gerado mantém uma documentação no estilo NOTES.md descrevendo sua abordagem, as fontes dos assets e as diferenças conhecidas. Os resultados estão prontos para a prévia local e <strong>não carregam scripts de analytics ou de publicidade de terceiros</strong> — e para alvos difíceis como sites protegidos por login, o Open Design explica os limites em vez de fingir que o clone está completo.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>O Website Clone parte de uma URL, inspeciona a página real e deixa uma trilha no estilo NOTES.md de como a reconstruiu.</figcaption>
      </figure>

      <h2>Transformar conversas em animação</h2>
      <p>Novidade nesta versão: a <strong>skill Chat Motion Overlay</strong> transforma uma conversa entre duas pessoas em uma sobreposição de chat animada — contêineres no estilo WeChat, Telegram e Messenger, além de opções de saída transparente para a pós-produção. A Home também facilita encontrar o ponto de partida certo, com pontos de entrada mais claros, exemplos prontos para usar e cartões de template e de plugin que abrem a prévia correta de forma mais confiável.</p>

      <h2>As falhas explicam o que fazer a seguir</h2>
      <p>Uma tarefa concluída deveria significar um entregável real, e uma que falhou deveria dizer por quê. Na 0.15.0, <strong>execuções que falham em gerar ou salvar arquivos de projeto utilizáveis não são mais exibidas como concluídas com sucesso</strong> — e agentes locais ausentes, entradas grandes demais, modelos indisponíveis, cotas esgotadas, tempos esgotados, saída vazia, falhas de salvamento e loops de ferramentas oferecem cada um um caminho de recuperação específico em vez de um único erro genérico.</p>
      <p>A recuperação também ficou mais robusta por baixo: parar uma tarefa ou excluir um projeto agora cancela a execução e seus processos filhos em vez de deixá-los queimar tempo e cota; as novas tentativas não herdam mais o estado de processos que falharam; e o aplicativo de desktop abre uma tela de recuperação (com uma exportação do log de diagnóstico) quando o renderizador trava repetidamente, em vez de ficar em loop num recarregamento sem fim.</p>

      <h2>O que mais chega na 0.15.0</h2>
      <ul>
        <li><strong>O BYOK e os agentes de terceiros estão mais precisos</strong> — um novo preset do Atlas Cloud, endpoints compatíveis com OpenAI roteados pelo caminho compatível de chat-completions, modelos de embedding e de rerank mantidos fora do seletor de chat, e um feedback mais claro para Kiro, Reasonix, Antigravity, Grok Build e OpenRouter.</li>
        <li><strong>As escolhas de privacidade são mais fáceis de entender</strong> — o consentimento e as configurações agora distinguem métricas de tempo de execução anônimas do conteúdo de revisão de qualidade redigido.</li>
        <li><strong>A Library se parece mais com o que deveria</strong> — contagens de categorias de plugins e traduções mais estáveis, prévias pré-geradas que combinam com seus templates, prévias de apresentação que mantêm a proporção correta e prévias WebGL que se comportam bem ao serem redimensionadas.</li>
      </ul>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você é…</th><th>Comece aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o app de desktop e comece um projeto — as mesmas tarefas agora começam mais rápido e custam menos tokens por padrão</td></tr>
          <tr><td>Entregando uma apresentação</td><td>Pilote a apresentação com miniaturas e navegação por teclado, mantenha as notas do apresentador no lugar e exporte exatamente a versão que você aprovou</td></tr>
          <tr><td>Reconstruindo um site</td><td>Abra o Website Clone, cole uma URL pública e parta de uma inspeção real com uma trilha NOTES.md</td></tr>
          <tr><td>Criando animação para redes sociais</td><td>Experimente a skill Chat Motion Overlay para transformar uma conversa em uma sobreposição animada</td></tr>
          <tr><td>Atingido por uma execução que falhou</td><td>Leia a falha — ela nomeia a causa e um caminho de recuperação, e uma tarefa «concluída» agora significa um arquivo real</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>A aceleração mais barata é aquela na qual você nunca precisa pensar. A 0.15.0 gasta seu orçamento aí — um prompt mais enxuto em cada tarefa, uma apresentação que você realmente pode pilotar, um clone que parte de uma URL e uma falha que diz o que fazer a seguir. Baixe o app de desktop, rode algo que você roda com frequência e repare em quanto mais cedo o primeiro token aparece.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>118 PRs em quatro dias, de 34 pessoas que cada uma cortou mais um segundo, mais um token ou mais um desvio do ciclo do dia a dia. Um movimento não é entregue a partir dos laptops de uma única equipe; ele é entregue por todos que tornaram o caminho comum um pouco mais barato e um pouco mais rápido. Nós vemos você. 🚀</p>

      <h2>Leituras relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: a máquina do tempo da inspiração</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: mantenha o flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: sua marca é um sistema de design</a></li>
      </ul>
  it:
    title: 'Open Design 0.15.0: costa meno, spedisci più veloce'
    summary: 'Tag open-design-v0.15.0 — 118 PR da 34 contributori in quattro giorni. Nome in codice «Cost Less. Ship Faster.» (Costa meno. Spedisci più veloce). Un Design System Prompt più snello ha ridotto, in esecuzioni rappresentative, il tempo al primo token del 49.5%, la durata end-to-end del 21.2% e i token di input medi del 25.1%. Il resto della release rende più fluido l''intero ciclo creativo: presentazioni che sembrano un''area di lavoro, clonazione di siti web da un URL, conversazioni trasformate in animazione e fallimenti che finalmente spiegano cosa fare dopo.'
    category: 'Prodotto'
    bodyHtml: |
      <p>Tag <code>open-design-v0.15.0</code>, pubblicato il 14 luglio 2026. <strong>118 PR da 34 contributori in quattro giorni.</strong> Nome in codice «Cost Less. Ship Faster.» (Costa meno. Spedisci più veloce). Le ultime due release hanno tenuto vivo il tuo lavoro attraverso le interruzioni e salvato le idee che il flow tendeva a perdere. Questa punta alla tassa che paghi a ogni esecuzione: l'attesa prima del primo token, i token spesi per arrivarci e l'attrito tra un risultato finito e un deliverable spedito.</p>
      <p>Vuoi il changelog completo? Si trova nelle <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">note di rilascio su GitHub</a>. Questa è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Un prompt più snello, un ciclo più veloce</h2>
      <p>Il titolo è sommesso, ma si sente in ogni attività. Ottimizzando il Design System Prompt, esecuzioni di valutazione rappresentative hanno mostrato una <strong>riduzione del 49.5% del tempo al primo token</strong>, una <strong>riduzione del 21.2% della durata end-to-end</strong> e un <strong>uso medio di token di input inferiore del 25.1%</strong>. Le attività di design di tutti i giorni ora iniziano prima, spendono meno token per arrivarci e finiscono più in fretta — lo stesso lavoro, a un costo minore, senza che tu cambi nulla nel modo in cui scrivi i prompt.</p>
      <p>È questo il senso del nome in codice. Costa meno: meno token per attività. Spedisci più veloce: meno attesa tra la richiesta e la risposta. Un'efficienza a cui non devi aderire.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Un Design System Prompt più snello: 49.5% più rapido al primo token, 21.2% più corto end-to-end, 25.1% di token di input in meno — sulle stesse attività di tutti i giorni.</figcaption>
      </figure>

      <h2>Presentazioni che sembrano un'area di lavoro</h2>
      <p>Una presentazione finita dovrebbe comportarsi come un documento che puoi pilotare, non come un'anteprima statica che scorri. Nella 0.15.0, <strong>le presentazioni multipagina ottengono la navigazione per miniature, la selezione diretta della pagina e il controllo da tastiera con frecce / Home / End</strong> — basta cercare i comandi. <strong>Le note del relatore restano con la diapositiva a cui appartengono</strong>: leggile e modificale accanto alla diapositiva corrente, tienile al loro posto e vedile nel Presenter View senza coprire lo schermo rivolto al pubblico.</p>
      <p>Presentare è ora una modalità di prima classe — entra in una presentazione immersiva nella scheda corrente o a schermo intero, poi vai avanti e indietro, metti in pausa, riprendi o ricomincia senza perdere lo stato della presentazione. E quando è il momento della consegna, <strong>esporta esattamente la versione che hai approvato</strong> come PDF, immagini, ZIP o HTML invece di spedire silenziosamente le ultime modifiche (le note del relatore restano fuori dalle diapositive esportate).</p>

      <h2>Clonare un sito web da un URL</h2>
      <p>Ricreare un sito iniziava una volta da un prompt vuoto e da tanta descrizione. <strong>Website Clone è ora un punto d'ingresso di prima classe</strong> nella Home e nella Library: scegli la capacità, incolla un URL pubblico e Open Design crea il progetto con il giusto contesto già al suo posto.</p>
      <p>Lascia anche una traccia di controllo. Il flusso prima ispeziona la struttura della pagina, le route, gli asset e le interazioni, e il progetto generato conserva una documentazione in stile NOTES.md che descrive il suo approccio, le fonti degli asset e le differenze note. I risultati sono pronti per l'anteprima locale e <strong>non riportano script di analisi o pubblicità di terze parti</strong> — e per obiettivi difficili come i siti protetti da login, Open Design spiega i limiti invece di fingere che il clone sia completo.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone parte da un URL, ispeziona la pagina reale e lascia una traccia in stile NOTES.md di come l'ha ricostruita.</figcaption>
      </figure>

      <h2>Trasformare le conversazioni in animazione</h2>
      <p>Novità di questa release: la <strong>skill Chat Motion Overlay</strong> trasforma una conversazione tra due persone in un overlay di chat animato — contenitori in stile WeChat, Telegram e Messenger, più opzioni di output trasparente per la post-produzione. Anche la Home rende più facile trovare il punto di partenza giusto, con punti d'ingresso più chiari, esempi pronti all'uso e schede di template e plugin che aprono l'anteprima corretta in modo più affidabile.</p>

      <h2>I fallimenti spiegano cosa fare dopo</h2>
      <p>Un'attività completata dovrebbe significare un deliverable reale, e una fallita dovrebbe dirti perché. Nella 0.15.0, <strong>le esecuzioni che non riescono a generare o salvare file di progetto utilizzabili non vengono più mostrate come completate con successo</strong> — e agenti locali mancanti, input troppo grandi, modelli non disponibili, quote esaurite, timeout, output vuoto, errori di salvataggio e loop degli strumenti forniscono ciascuno un percorso di recupero specifico invece di un unico errore generico.</p>
      <p>Anche il recupero è diventato più solido sotto il cofano: fermare un'attività o eliminare un progetto ora annulla l'esecuzione e i suoi processi figli invece di lasciarli bruciare tempo e quota; i nuovi tentativi non ereditano più lo stato dai processi falliti; e l'app desktop apre una schermata di recupero (con un'esportazione del log diagnostico) quando il renderer va in crash ripetutamente, invece di girare in loop su un ricaricamento infinito.</p>

      <h2>Cos'altro arriva nella 0.15.0</h2>
      <ul>
        <li><strong>Il BYOK e gli agenti di terze parti sono più accurati</strong> — un nuovo preset Atlas Cloud, endpoint compatibili con OpenAI instradati attraverso il percorso compatibile chat-completions, modelli di embedding e rerank tenuti fuori dal selettore della chat, e un feedback più chiaro per Kiro, Reasonix, Antigravity, Grok Build e OpenRouter.</li>
        <li><strong>Le scelte sulla privacy sono più facili da capire</strong> — consenso e impostazioni ora distinguono le metriche di runtime anonime dai contenuti di revisione qualità oscurati.</li>
        <li><strong>La Library assomiglia di più a come dovrebbe essere</strong> — conteggi delle categorie di plugin e traduzioni più stabili, anteprime pre-generate che corrispondono ai loro template, anteprime delle presentazioni che mantengono le proporzioni corrette e anteprime WebGL che si comportano bene al ridimensionamento.</li>
      </ul>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Inizia da qui</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuovo su Open Design</td><td>Scarica l'app desktop e avvia un progetto — le stesse attività ora iniziano più velocemente e costano meno token per impostazione predefinita</td></tr>
          <tr><td>In procinto di spedire una presentazione</td><td>Pilota la presentazione con le miniature e la navigazione da tastiera, tieni le note del relatore al loro posto ed esporta esattamente la versione che hai approvato</td></tr>
          <tr><td>In procinto di ricostruire un sito</td><td>Apri Website Clone, incolla un URL pubblico e parti da un'ispezione reale con una traccia NOTES.md</td></tr>
          <tr><td>In procinto di creare animazioni per i social</td><td>Prova la skill Chat Motion Overlay per trasformare una conversazione in un overlay animato</td></tr>
          <tr><td>Colpito da un'esecuzione fallita</td><td>Leggi il fallimento — nomina la causa e un percorso di recupero, e un'attività «completata» ora significa un file reale</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>L'accelerazione più economica è quella a cui non devi mai pensare. La 0.15.0 spende lì il suo budget — un prompt più snello su ogni attività, una presentazione che puoi davvero pilotare, un clone che parte da un URL e un fallimento che ti dice cosa fare dopo. Scarica l'app desktop, esegui qualcosa che esegui spesso e nota quanto prima compare il primo token.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>118 PR in quattro giorni, da 34 persone che hanno ciascuna tagliato un altro secondo, un altro token o un'altra deviazione dal ciclo di tutti i giorni. Un movimento non viene spedito dai laptop di un solo team; viene spedito da tutti coloro che hanno reso il percorso comune un po' più economico e un po' più veloce. Ti vediamo. 🚀</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: la macchina del tempo dell'ispirazione</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: resta nel flow</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: il tuo brand è un design system</a></li>
      </ul>
  tr:
    title: 'Open Design 0.15.0: daha az maliyet, daha hızlı teslimat'
    summary: 'Etiket open-design-v0.15.0 — dört günde 34 katkıda bulunandan 118 PR. Kod adı «Cost Less. Ship Faster.» (Daha az maliyet. Daha hızlı teslimat). Daha yalın bir Design System Prompt, temsili çalışmalarda ilk token''a kadar geçen süreyi 49.5%, uçtan uca süreyi 21.2% ve ortalama girdi token''larını 25.1% azalttı. Sürümün geri kalanı tüm yaratıcı döngüyü pürüzsüzleştiriyor: bir çalışma alanı gibi hissettiren sunumlar, bir URL''den web sitesi klonlama, harekete dönüştürülen sohbetler ve sonunda bundan sonra ne yapılacağını açıklayan hatalar.'
    category: 'Ürün'
    bodyHtml: |
      <p><code>open-design-v0.15.0</code> etiketi, 14 Temmuz 2026'da yayınlandı. <strong>Dört günde 34 katkıda bulunandan 118 PR.</strong> Kod adı «Cost Less. Ship Faster.» (Daha az maliyet. Daha hızlı teslimat). Son iki sürüm, çalışmanızı kesintiler boyunca canlı tuttu ve akışın eskiden kaybettiği fikirleri kurtardı. Bu sürüm ise her çalışmada ödediğiniz vergiyi hedef alıyor: ilk token'dan önceki bekleme, oraya ulaşmak için harcanan token'lar ve bitmiş bir sonuç ile teslim edilmiş bir çıktı arasındaki sürtünme.</p>
      <p>Tam değişiklik günlüğünü mü istiyorsunuz? <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0">GitHub'daki sürüm notlarında</a>. Bu, kısa sürüm: kaputun altında ne değişti, bugün onunla ne yapabilirsiniz ve nereden başlayacaksınız.</p>

      <h2>Daha yalın bir prompt, daha hızlı bir döngü</h2>
      <p>Başlık sessiz ama her görevde hissediliyor. Design System Prompt'u optimize ederek, temsili değerlendirme çalışmaları <strong>ilk token'a kadar geçen sürede 49.5% azalma</strong>, <strong>uçtan uca sürede 21.2% azalma</strong> ve <strong>ortalama girdi token'ı kullanımında 25.1% düşüş</strong> gösterdi. Günlük tasarım görevleri artık daha erken başlıyor, oraya ulaşmak için daha az token harcıyor ve daha hızlı bitiyor — aynı iş, daha düşük maliyetle ve prompt yazma şeklinizde hiçbir şeyi değiştirmeden.</p>
      <p>Kod adının amacı da bu. Daha az maliyet: görev başına daha az token. Daha hızlı teslimat: istek ile yanıt arasında daha az bekleme. Devreye almanız gerekmeyen bir verimlilik.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Daha yalın bir Design System Prompt: ilk token'a kadar 49.5% daha hızlı, uçtan uca 21.2% daha kısa, 25.1% daha az girdi token'ı — aynı günlük görevlerde.</figcaption>
      </figure>

      <h2>Bir çalışma alanı gibi hissettiren sunumlar</h2>
      <p>Bitmiş bir sunum, kaydırıp geçtiğiniz statik bir önizleme değil, sürebileceğiniz bir belge gibi davranmalı. 0.15.0'da, <strong>çok sayfalı sunumlar küçük resim gezinmesi, doğrudan sayfa seçimi ve ok / Home / End klavye kontrolü kazanıyor</strong> — artık kontrolleri aramak yok. <strong>Konuşmacı notları ait oldukları slaytla birlikte kalıyor</strong>: bunları geçerli slaydın yanında okuyup düzenleyin, yerlerinde tutun ve izleyiciye dönük ekranı kapatmadan Presenter View'da görün.</p>
      <p>Sunum yapmak artık birinci sınıf bir mod — geçerli sekmede veya tam ekranda sürükleyici bir sunuma girin, ardından sunum durumunu kaybetmeden ileri geri gidin, duraklatın, sürdürün veya yeniden başlayın. Ve devretme zamanı geldiğinde, en son düzenlemeleri sessizce göndermek yerine <strong>onayladığınız tam sürümü</strong> PDF, görsel, ZIP veya HTML olarak dışa aktarın (konuşmacı notları dışa aktarılan slaytların dışında bırakılır).</p>

      <h2>Bir URL'den web sitesi klonlama</h2>
      <p>Bir siteyi yeniden oluşturmak eskiden boş bir prompt ve bir sürü açıklamayla başlardı. <strong>Website Clone artık Home'da ve Library'de birinci sınıf bir giriş noktası</strong>: yeteneği seçin, herkese açık bir URL yapıştırın ve Open Design projeyi doğru bağlam zaten yerinde olacak şekilde oluştursun.</p>
      <p>Ayrıca bir denetim izi bırakır. İş akışı önce sayfa yapısını, rotaları, varlıkları ve etkileşimleri inceler ve oluşturulan proje, yaklaşımını, varlık kaynaklarını ve bilinen farklılıkları anlatan NOTES.md tarzı bir belgeyi saklar. Sonuçlar yerel önizleme için hazırdır ve <strong>üçüncü taraf analiz veya reklam betiklerini taşımaz</strong> — ve giriş duvarıyla korunan siteler gibi zorlu hedefler için Open Design, klonun tamamlanmış gibi davranmak yerine sınırları açıklar.</p>
      <figure>
        <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
        <figcaption>Website Clone bir URL'den başlar, gerçek sayfayı inceler ve onu nasıl yeniden oluşturduğuna dair NOTES.md tarzı bir iz bırakır.</figcaption>
      </figure>

      <h2>Sohbetleri harekete dönüştürün</h2>
      <p>Bu sürümde yeni: <strong>Chat Motion Overlay becerisi</strong>, iki kişilik bir sohbeti animasyonlu bir sohbet katmanına dönüştürür — WeChat, Telegram ve Messenger tarzı kapsayıcılar, ayrıca post prodüksiyon için şeffaf çıktı seçenekleri. Home da daha net giriş noktaları, kullanıma hazır örnekler ve doğru önizlemeyi daha güvenilir biçimde açan şablon ve eklenti kartlarıyla doğru başlangıç noktasını bulmayı kolaylaştırıyor.</p>

      <h2>Hatalar bundan sonra ne yapılacağını açıklıyor</h2>
      <p>Tamamlanmış bir görev gerçek bir çıktı anlamına gelmeli, başarısız olan biri ise size nedenini söylemeli. 0.15.0'da, <strong>kullanılabilir proje dosyaları üretemeyen veya kaydedemeyen çalışmalar artık başarıyla tamamlanmış olarak gösterilmiyor</strong> — ve eksik yerel ajanlar, aşırı büyük girdiler, kullanılamayan modeller, tükenmiş kotalar, zaman aşımları, boş çıktı, kaydetme hataları ve araç döngüleri, tek bir kapsayıcı hata yerine her biri belirli bir kurtarma yolu sunuyor.</p>
      <p>Kurtarma alttan da daha sağlam hale geldi: bir görevi durdurmak veya bir projeyi silmek, onların zaman ve kota yakmasına izin vermek yerine artık çalışmayı ve alt süreçlerini iptal ediyor; yeniden denemeler artık başarısız süreçlerden durum devralmıyor; ve oluşturucu tekrar tekrar çöktüğünde masaüstü uygulaması, sonsuz bir yeniden yükleme döngüsüne girmek yerine (tanılama günlüğü dışa aktarımıyla birlikte) bir kurtarma ekranı açıyor.</p>

      <h2>0.15.0'a başka neler geliyor</h2>
      <ul>
        <li><strong>BYOK ve üçüncü taraf ajanlar daha doğru</strong> — yeni bir Atlas Cloud ön ayarı, uyumlu chat-completions yolu üzerinden yönlendirilen OpenAI uyumlu uç noktalar, sohbet seçicisinden uzak tutulan gömme ve yeniden sıralama modelleri ve Kiro, Reasonix, Antigravity, Grok Build ve OpenRouter için daha net geri bildirim.</li>
        <li><strong>Gizlilik seçimlerini anlamak daha kolay</strong> — onay ve ayarlar artık anonim çalışma zamanı ölçümlerini, düzenlenmiş kalite inceleme içeriğinden ayırıyor.</li>
        <li><strong>Library olması gerektiği gibi görünüyor</strong> — daha istikrarlı eklenti kategori sayıları ve çevirileri, şablonlarıyla eşleşen önceden oluşturulmuş önizlemeler, doğru en boy oranını koruyan sunum önizlemeleri ve yeniden boyutlandırıldığında düzgün davranan WebGL önizlemeleri.</li>
      </ul>

      <h2>Bugün onunla ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'da yeniyseniz</td><td>Masaüstü uygulamasını indirin ve bir projeye başlayın — aynı görevler artık varsayılan olarak daha hızlı başlıyor ve daha az token harcıyor</td></tr>
          <tr><td>Bir sunum teslim ediyorsanız</td><td>Sunumu küçük resimler ve klavye gezinmesiyle sürün, konuşmacı notlarını yerinde tutun ve onayladığınız tam sürümü dışa aktarın</td></tr>
          <tr><td>Bir siteyi yeniden oluşturuyorsanız</td><td>Website Clone'u açın, herkese açık bir URL yapıştırın ve NOTES.md iziyle gerçek bir incelemeden başlayın</td></tr>
          <tr><td>Sosyal medya için hareket oluşturuyorsanız</td><td>Bir sohbeti animasyonlu bir katmana dönüştürmek için Chat Motion Overlay becerisini deneyin</td></tr>
          <tr><td>Başarısız bir çalışmaya çarptıysanız</td><td>Hatayı okuyun — nedeni ve bir kurtarma yolunu adlandırıyor ve «tamamlanmış» bir görev artık gerçek bir dosya anlamına geliyor</td></tr>
        </tbody>
      </table>

      <h2>Sonra ne yapmalı</h2>
      <p>En ucuz hızlanma, hakkında hiç düşünmek zorunda kalmadığınız hızlanmadır. 0.15.0 bütçesini oraya harcıyor — her görevde daha yalın bir prompt, gerçekten sürebileceğiniz bir sunum, bir URL'den başlayan bir klon ve size bundan sonra ne yapacağınızı söyleyen bir hata. Masaüstü uygulamasını indirin, sık çalıştırdığınız bir şeyi çalıştırın ve ilk token'ın ne kadar daha erken göründüğünü fark edin.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indirin</a>.</p>
      <p>Dört günde 118 PR, her biri günlük döngüden bir saniye, bir token veya bir dolambaç daha kesip atan 34 kişiden. Bir hareket tek bir ekibin dizüstü bilgisayarlarından teslim edilmez; ortak yolu biraz daha ucuz ve biraz daha hızlı yapan herkesten teslim edilir. Sizi görüyoruz. 🚀</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-14-0-inspiration-time-machine/">Open Design 0.14.0: ilham zaman makinesi</a></li>
        <li><a href="/blog/open-design-0-13-0-stay-in-flow/">Open Design 0.13.0: akışta kalın</a></li>
        <li><a href="/blog/open-design-0-12-0-brand-backed-design-system/">Open Design 0.12.0: markanız bir tasarım sistemidir</a></li>
      </ul>
---

Tag `open-design-v0.15.0`, published on July 14, 2026. **118 PRs from 34 contributors in four days.** Codename "Cost Less. Ship Faster." The last two releases kept your work alive across interruptions and saved the ideas flow used to lose. This one goes after the tax you pay on every run: the wait before the first token, the tokens spent getting there, and the friction between a finished result and a shipped deliverable.

Want the full changelog? It lives in the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.0). This is the short version: what changed underneath, what you can do with it today, and where to start.

## A leaner prompt, a faster loop

The headline is quiet but it's felt on every task. By optimizing the Design System Prompt, representative evaluation runs showed a **49.5% reduction in time to first token**, a **21.2% reduction in end-to-end duration**, and **25.1% lower average input-token use**. Everyday design tasks now start sooner, spend fewer tokens getting there, and finish faster — the same work, at a lower cost, without you changing a thing about how you prompt.

That is the point of the codename. Cost less: fewer tokens per task. Ship faster: less waiting between the ask and the answer. Efficiency you don't have to opt into.

<figure>
  <img src="/blog/open-design-0-15-0-cost-less-ship-faster-speed.webp" alt="A long prompt document compressed into a leaner one, next to a shrinking timer and a falling token counter, the faster result shown as a calm sage-green interface in a warm editorial illustration" />
  <figcaption>A leaner Design System Prompt: 49.5% faster to first token, 21.2% shorter end to end, 25.1% fewer input tokens — on the same everyday tasks.</figcaption>
</figure>

## Decks that feel like a workspace

A finished deck should behave like a document you can drive, not a static preview you scroll past. In 0.15.0, **multi-page decks get thumbnail navigation, direct page selection, and arrow / Home / End keyboard control** — no more hunting for the controls. **Speaker notes stay with the slide they belong to**: read and edit them alongside the current slide, keep them in place, and see them in Presenter View without covering the audience-facing screen.

Presenting is a first-class mode now — enter an immersive presentation in the current tab or full screen, then move back and forward, pause, resume, or restart without losing deck state. And when it's time to hand off, **export the exact version you approved** as PDF, images, ZIP, or HTML instead of silently shipping the latest edits (speaker notes are left out of exported slides).

## Clone a website from a URL

Recreating a site used to start from a blank prompt and a lot of description. **Website Clone is now a first-class entry point** on Home and in the Library: choose the capability, paste a public URL, and Open Design creates the project with the right context already in place.

It also leaves an audit trail. The workflow first inspects page structure, routes, assets, and interactions, and the generated project keeps NOTES.md-style documentation describing its approach, asset sources, and known differences. Results are ready for local preview and **do not carry over third-party analytics or advertising scripts** — and for hard targets like login-walled sites, Open Design explains the limits instead of pretending the clone is complete.

<figure>
  <img src="/blog/open-design-0-15-0-cost-less-ship-faster-clone.webp" alt="A browser address bar with a pasted URL turning into a structured project folder containing a NOTES.md file and page routes, the new project shown as a calm sage-green interface in a warm editorial illustration" />
  <figcaption>Website Clone starts from a URL, inspects the real page, and leaves a NOTES.md-style trail of how it rebuilt it.</figcaption>
</figure>

## Turn conversations into motion

New this release: the **Chat Motion Overlay skill** turns a two-person conversation into an animated chat overlay — WeChat-, Telegram-, and Messenger-style containers, plus transparent-output options for post-production. Home also makes the right starting point easier to find, with clearer entry points, ready-to-use examples, and template and plugin cards that open the correct preview more reliably.

## Failures explain what to do next

A completed task should mean a real deliverable, and a failed one should tell you why. In 0.15.0, **runs that fail to generate or save usable project files are no longer shown as successfully completed** — and missing local agents, oversized inputs, unavailable models, exhausted quotas, timeouts, empty output, save failures, and tool loops each provide a specific recovery path instead of one catch-all error.

Recovery got sturdier underneath, too: stopping a task or deleting a project now cancels the run and its child processes instead of letting them burn time and quota; retries no longer inherit state from failed processes; and the desktop app opens a recovery screen (with a diagnostic-log export) when the renderer crashes repeatedly, instead of looping on an endless reload.

## What else lands in 0.15.0

- **BYOK and third-party agents are more accurate** — a new Atlas Cloud preset, OpenAI-compatible endpoints routed through the compatible chat-completions path, embedding and rerank models kept out of the chat selector, and clearer feedback for Kiro, Reasonix, Antigravity, Grok Build, and OpenRouter.
- **Privacy choices are easier to understand** — consent and settings now distinguish anonymous runtime metrics from redacted quality-review content.
- **The Library looks more like it should** — steadier plugin category counts and translations, baked previews that match their templates, deck previews that keep the right aspect ratio, and WebGL previews that behave when resized.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app and start a project — the same tasks now start faster and cost fewer tokens by default |
| Shipping a presentation | Drive the deck with thumbnails and keyboard nav, keep speaker notes in place, and export the exact version you approved |
| Rebuilding a site | Open Website Clone, paste a public URL, and start from a real inspection with a NOTES.md trail |
| Making social motion | Try the Chat Motion Overlay skill to turn a conversation into an animated overlay |
| Hit by a failed run | Read the failure — it names the cause and a recovery path, and a "completed" task now means a real file |

## What to do next

The cheapest speedup is the one you never have to think about. 0.15.0 spends its budget there — a leaner prompt on every task, a deck you can actually drive, a clone that starts from a URL, and a failure that tells you what to do next. Download the desktop app, run something you run often, and notice how much sooner the first token shows up.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

118 PRs in four days, from 34 people who each shaved one more second, one more token, or one more detour off the everyday loop. A movement doesn't ship from one team's laptops; it ships from everyone who made the common path a little cheaper and a little faster. We see you. 🚀

## Related reading

- [Open Design 0.14.0: the inspiration time machine](/blog/open-design-0-14-0-inspiration-time-machine/)
- [Open Design 0.13.0: stay in flow](/blog/open-design-0-13-0-stay-in-flow/)
- [Open Design 0.12.0: your brand is a design system](/blog/open-design-0-12-0-brand-backed-design-system/)
