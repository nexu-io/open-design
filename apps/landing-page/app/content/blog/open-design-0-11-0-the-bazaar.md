---
title: "Open Design 0.11.0: the Bazaar"
date: 2026-06-17
category: "Product"
readingTime: 7
summary: "Tag open-design-v0.11.0 — 137 PRs from 57 contributors in four days. Codename \"the Bazaar.\" The plugin gallery now plays a live clip of every real output, whatever coding agent you already use just snaps in, and a newcomer's first run is a guided welcome instead of a locked gate."
i18n:
  zh:
    title: 'Open Design 0.11.0：集市'
    summary: '标签 open-design-v0.11.0 —— 四天内 57 位贡献者提交了 137 个 PR。代号「集市」。插件画廊现在会为每一个真实产出播放一段实时片段，你已经在用的任何 coding agent 都能即插即用，而新人的第一次运行是一段有引导的欢迎之旅，而不再是一道上锁的关卡。'
    bodyHtml: |
      <p>标签 <code>open-design-v0.11.0</code>，于 2026 年 6 月 17 日发布。<strong>四天内 57 位贡献者提交了 137 个 PR。</strong>代号「集市」。大教堂由少数被选中的人闭门建造；而集市则在开放之中由所有人同时建造 —— 而这次发布把 Open Design 变成了那座集市。走进来，逛逛摊位，看中什么就拿起什么，让它成为你自己的。</p>
      <p>想看完整版本，可以查阅 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub 上的发布说明</a>。本文是精简版：这次发布开放了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>一个终于会展示自己的画廊</h2>
      <p>一张静止的缩略图只能让你靠猜。0.11.0 里的画廊不一样 —— <strong>每一张插件卡片和详情页现在都会播放一段真实产出的实时片段</strong>，于是你在挑选之前就能看到一套演示文稿或一个模板实际能做什么。</p>
      <p>货架也摆满了。全部 <strong>56 套官方演示文稿</strong>都围绕同一条产品叙事做了贴合品牌的焕新，<strong>23 套社区幻灯片套件</strong>取自最优秀的开源幻灯片技能，也加入了行列，HyperFrames 视频模板也焕然一新。社区演示文稿现在就直接显示在 Home 主屏上，配以无黑边的 16:9 预览。逛逛这些行列，点击播放，挑走你喜欢的，再在它的基础上即兴发挥。</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="一面由插件画廊卡片排成网格的墙，每张卡片都在播放一小段实时预览片段，其中一张卡片被抽出并被框在一个绿色选择框内，背景为近白色的编辑风底色" />
        <figcaption>每张卡片都播放一段真实产出的实时片段 —— 浏览、点击播放、让它成为你自己的。</figcaption>
      </figure>

      <h2>带上你已经在用的 coding agent</h2>
      <p>Open Design 从来不是要把你锁死在某一个工具里，而这次发布把门开得更大了。<strong>无论你已经把哪个 coding agent 接进了日常，它现在都能就在 Claude 旁边即插即用。</strong></p>
      <p>为 <strong>Amp</strong> 和 <strong>Codebuddy Code</strong> 新增了两个全新适配器，<strong>Kimi Code</strong> 运行时得到修复，<strong>Codex</strong> 用上了订阅版媒体生成，<strong>Antigravity</strong> 获得支持，<strong>GitHub Copilot</strong> 的上限更宽裕了，<code>reasonix</code> 1.x 也拿到了它的 MCP 环境变量。任何厂商都可以来摆摊 —— 你永远不必为了使用围绕它的工作空间，而换掉你信赖的那个工具。</p>

      <h2>是欢迎，而非高墙</h2>
      <p>过去，第一次运行会把你直接丢进一个控制面板。在 0.11.0 里，它变成了<strong>一条有引导的路径。</strong>带门槛的 Connect 步骤现在配有一个提示气泡，解释它<em>为什么</em>被设了门槛，一个清爽的顺序步进器引导你完成设置，BYOK 自动检查和 CLI 检测都更聪明了，而在引导开始之前那一下突兀的主屏闪烁也消失了。</p>
      <p>结果就是，头五分钟感觉像一份邀请，而不是一道上锁的关卡 —— 一个新人可以信步走进来，直达自己第一次真正的运行，而不会撞上一堵墙。</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="一道敞开的门廊，一排清爽的顺序引导步骤通向内部，当前所在的步骤被框在一个绿色选择框内，背景为近白色的编辑风底色" />
        <figcaption>上手引导现在是一段循序渐进的流程 —— 是欢迎，而非上锁的关卡。</figcaption>
      </figure>

      <h2>迄今最稳的版本</h2>
      <p>这是 Open Design 至今发布过的最大一次稳定性整治。当渲染进程崩溃或加载失败时，桌面窗口会<strong>自我修复</strong>，运行<strong>绝不会</strong>因为等待一个问题而<strong>卡死</strong>，而当你正在标注、截图或评论时，<strong>预览也不再在你脚下自顾自地重新加载</strong>。一处文件描述符泄漏被堵上了，更新器不再以零延迟空转，一长串对话框、选择器和截图的小毛病也都消失了。那个你整天开着的版本，就是会<em>一直稳稳运行。</em></p>
      <p>同一次整治里还磨平了另外两处棱角。<strong>你自己的密钥不再跟你对着干</strong> —— Composio 的密钥门槛现在是一键搞定，而不是一条死路，Gemini BYOK 模型跟随当前的 API（已停用的 2.0 移除、3.x 加入），编辑器的模型切换终于能保持住了。而且<strong>不会有任何东西泄漏出去</strong> —— 预览 URL 的处理做了加固，本地预览服务器默认绑定到 <strong>loopback</strong>，因此一个项目预览绝不会漫游到你的网络上。</p>

      <h2>0.11.0 中还有什么</h2>
      <p>这次发布覆盖面很广。值得拎出来说的几块：</p>
      <ul>
        <li><strong>Open Design 现在在网络上有了一个真正的家。</strong>为全部 <strong>21 个受支持的 agent</strong>准备的设计页面，一整套信任页面（关于、FAQ、隐私、条款，以及一个真正的 404）配上重建的页脚，一张全站通用、专门打造的分享卡片，让你粘贴出去的每一个链接都显得精致，一个带目录和完整 i18n 的重建博客，以及对插件页面的一轮 SEO + UX 整治。</li>
        <li><strong>两篇新的社区教程</strong>，帮新人快速上手。</li>
        <li><strong>更快的冷启动。</strong>OpenCode 的引导加载现在会被缓存，以缩短首次运行的等待。</li>
        <li><strong>为成长而建。</strong>沙箱契约的形态和归属守卫被固定下来，显式根目录导入获得允许，模型编排器的临时工作空间也落地了 —— 这些都是为接下来的东西打下的地基。</li>
      </ul>
      <p>完整清单长达 137 个 PR。其余内容都在 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub 上的发布说明</a>里。</p>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用，跟随有引导的欢迎流程 —— 带门槛的 Connect 步骤和顺序步进器会一路带你抵达第一次真正的运行，而不会撞墙</td></tr>
          <tr><td>已经在用 Open Design</td><td>让打包内置的自动更新把你升级到 0.11.0，然后打开画廊点击播放 —— 每张卡片现在都会预览它的真实产出</td></tr>
          <tr><td>在用别的 coding agent</td><td>接入 Amp、Codebuddy Code、Kimi、Codex、Antigravity 或 Copilot —— 你已经信赖的任何一个都能在 Claude 旁边即插即用</td></tr>
          <tr><td>要交付一套演示文稿</td><td>浏览 56 套官方演示文稿和 23 套社区幻灯片套件，挑走那段实时片段你喜欢的那一套，让它成为你自己的</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>集市之所以成立，是因为你能走进来、随手把东西拿起来。下载桌面应用，打开画廊，让其中一套带实时预览的演示文稿吸引你的目光 —— 然后带上你已经在用的任何 coding agent，让它成为你自己的。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>四天 137 个 PR，来自 57 个在开放之中摆起摊位的人。集市之所以存在，是因为如此多的贡献者在公开之处一起建造 —— 新的适配器、焕新的演示文稿、更顺滑的欢迎流程 —— 全部同时发生，就在所有人都看得见的地方。一场运动不会从某一个团队的笔记本电脑里发布出来；它从那些挺身而出、动手去建的人手中发布出来。我们看见你们了。🫡</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0：一体化设计工作空间</a> —— 本次发布所开放的那次单窗口发布</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0：人人皆可设计</a> —— 欢迎流程底下那次「安装即创作」发布</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0：万物皆插件</a> —— 画廊所构建于其上的那个插件引擎</li>
      </ul>
  ja:
    title: 'Open Design 0.11.0：バザール'
    summary: 'タグ open-design-v0.11.0 — 4日間で57人のコントリビューターから137件のPR。コードネームは「バザール」。プラグインギャラリーは、実際のアウトプットすべてのライブクリップを再生するようになり、あなたがすでに使っているコーディングエージェントが何であれそのまま組み込め、新規ユーザーの初回起動は、閉ざされたゲートではなくガイド付きのウェルカムになります。'
    bodyHtml: |
      <p>タグ <code>open-design-v0.11.0</code>、2026年6月17日にリリース。<strong>4日間で57人のコントリビューターから137件のPR。</strong>コードネームは「バザール」。伽藍は、選ばれた少数の手によって密やかに建てられます。一方バザールは、みんなの手で、一斉に、開かれた場所で築かれます——そして今回のリリースは、Open Design をそのバザールへと変えます。足を踏み入れ、露店を見て回り、目に留まったものを手に取り、自分のものにしてください。</p>
      <p>詳細版が読みたい方は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub のリリースノート</a>をご覧ください。本記事は短縮版です：今回のリリースで何が開かれたか、今日それで何ができるか、そしてどこから始めればよいか。</p>

      <h2>ついに本領を発揮するギャラリー</h2>
      <p>静止したサムネイルは、あなたに想像を強います。0.11.0 のギャラリーは違います——<strong>すべてのプラグインカードと詳細ページが、実際のアウトプットのライブクリップを再生するようになりました</strong>。だから、デッキやテンプレートが実際に何をするのかを、選ぶ前に目で確かめられます。</p>
      <p>棚も充実しています。<strong>56 種の公式デッキ</strong>はすべて、ひとつのプロダクトナラティブのもとに統一されたオンブランドの刷新を受け、最良のオープンソースのスライドスキルから生まれた<strong>23 種のコミュニティスライドキット</strong>が新たに列に加わり、HyperFrames の動画テンプレートも一新されました。コミュニティデッキは、レターボックスなしの 16:9 プレビューで Home 画面に直接表示されるようになりました。棚を眺め、再生ボタンを押し、気に入ったものを手に取り、そこから自由にアレンジしてください。</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="グリッド状に並んだプラグインギャラリーカードの壁。各カードが小さなライブプレビュークリップを再生しており、1枚のカードが引き出されて緑の選択フレーム内に保持されている、ほぼ白のエディトリアルな地" />
        <figcaption>どのカードも実際のアウトプットのライブクリップを再生する——眺めて、再生して、自分のものに。</figcaption>
      </figure>

      <h2>あなたがすでに使っているコーディングエージェントを持ち込む</h2>
      <p>Open Design はこれまで一度も、あなたを一つのツールに縛りつけることを目指してきませんでした。今回のリリースは、その扉をさらに広げます。<strong>あなたがすでに日々の作業に組み込んでいるコーディングエージェントが何であれ、いまや Claude のすぐ隣にそのまま収まります。</strong></p>
      <p><strong>Amp</strong> と <strong>Codebuddy Code</strong> 向けの真新しいアダプターが2つ登場し、<strong>Kimi Code</strong> ランタイムが修正され、<strong>Codex</strong> はサブスクリプションメディアに対応し、<strong>Antigravity</strong> がサポートされ、<strong>GitHub Copilot</strong> の上限はより広くなり、<code>reasonix</code> 1.x はその MCP 環境を手にします。どんなベンダーも店を構えられます——その周りのワークスペースを使うために、信頼するツールを切り替える必要は決してありません。</p>

      <h2>壁ではなく、ウェルカム</h2>
      <p>これまで初回起動は、あなたをいきなりコントロールパネルへ放り込んでいました。0.11.0 では、代わりに<strong>ガイド付きの道筋になります。</strong>ゲート付きの Connect ステップには、<em>なぜ</em>ゲートされているのかを説明するツールチップが付き、すっきりと順を追うステッパーがセットアップを案内し、BYOK の自動チェックと CLI 検出はより賢くなり、オンボーディングが始まる前の耳障りなホーム画面のちらつきはなくなりました。</p>
      <p>その結果、最初の5分間は、閉ざされたゲートではなく招待のように感じられます——新規ユーザーは通りすがりにふらりと入ってきて、壁にぶつかることなく最初の本物の実行までたどり着けます。</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="開かれた門口。すっきりと順を追って並んだオンボーディングステップが奥へと続き、アクティブなステップが緑の選択フレーム内に保持されている、ほぼ白のエディトリアルな地" />
        <figcaption>オンボーディングはいまやガイド付きのシーケンス——閉ざされたゲートではなく、ウェルカムです。</figcaption>
      </figure>

      <h2>これまでで最も安定したビルド</h2>
      <p>これは Open Design がこれまでに出荷した中で最大の安定化対応です。デスクトップウィンドウは、レンダラーが落ちたり読み込みが失敗したりしても<strong>自ら回復し</strong>、実行は質問を待って<strong>ハングすることが決してなく</strong>、マークアップやスクリーンショット、コメントをしている最中に<strong>プレビューが勝手にリロードされることもなくなりました</strong>。ファイルディスクリプタのリークがふさがれ、アップデーターは遅延ゼロで回り続けることをやめ、ダイアログ・ピッカー・スクリーンショットにまつわる長く尾を引く不具合の数々が消えました。一日中開きっぱなしにしておくビルドが、ただ<em>立ち続けます。</em></p>
      <p>同じ対応で、さらに2つの角が滑らかになりました。<strong>あなた自身のキーがあなたに歯向かうのをやめます</strong>——Composio のキーゲートは行き止まりではなくワンクリックになり、Gemini の BYOK モデルは現行の API に追従し（終了した 2.0 は外れ、3.x が入ります）、コンポーザーのモデル切り替えがようやく定着します。そして<strong>何も漏れません</strong>——プレビュー URL の扱いが強化され、ローカルプレビューサーバーはデフォルトで<strong>ループバック</strong>にバインドするので、プロジェクトのプレビューがあなたのネットワークへさまよい出ることは決してありません。</p>

      <h2>0.11.0 に含まれるその他の変更</h2>
      <p>このリリースは幅広い内容です。前面に押し出す価値のあるものは次のとおり：</p>
      <ul>
        <li><strong>Open Design がいまや、ウェブ上に本物の拠点を持ちました。</strong>サポートする<strong>21 のエージェント</strong>すべてのデザインページ、刷新したフッターを備えた一通りの信頼ページ群（about、FAQ、プライバシー、利用規約、本物の 404）、貼り付けたどのリンクも見栄えよく見えるようサイト全体に用意した専用シェアカード、目次と完全な多言語対応を備えて作り直したブログ、そしてプラグインページ全体にわたる SEO + UX の見直し。</li>
        <li>新規ユーザーが動き出せるようにする、<strong>2本の新しいコミュニティチュートリアル</strong>。</li>
        <li><strong>より速いコールドスタート。</strong>OpenCode のブートストラップ読み込みがキャッシュされるようになり、初回起動時の待ち時間を削減します。</li>
        <li><strong>成長を見据えた設計。</strong>サンドボックスのコントラクト形状と所有権ガードが固定され、明示的なルートからのインポートが許可され、モデルオーケストレーターのスクラッチワークスペースが登場します——次に来るものへの地ならしです。</li>
      </ul>
      <p>全リストは137件のPRに及びます。残りは<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub のリリースノート</a>に記載されています。</p>

      <h2>今日それで何をするか</h2>
      <table>
        <thead>
          <tr><th>あなたが…</th><th>ここから始める</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design が初めて</td><td>デスクトップアプリをダウンロードして、ガイド付きのウェルカムに従いましょう——ゲート付きの Connect ステップと順を追うステッパーが、壁にぶつかることなく最初の本物の実行まで導きます</td></tr>
          <tr><td>すでに Open Design を使っている</td><td>パッケージ版の自動アップデートで 0.11.0 へ。そしてギャラリーを開いて再生ボタンを押しましょう——どのカードもいまや実際のアウトプットをプレビューします</td></tr>
          <tr><td>別のコーディングエージェントを使っている</td><td>Amp、Codebuddy Code、Kimi、Codex、Antigravity、または Copilot を組み込みましょう——あなたがすでに信頼しているものが、Claude の隣にそのまま収まります</td></tr>
          <tr><td>デッキを出荷する</td><td>56 種の公式デッキと 23 種のコミュニティスライドキットを眺め、ライブクリップが気に入ったものを手に取り、自分のものにしましょう</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>バザールが機能するのは、足を踏み入れてものを手に取り始められるときだけです。デスクトップアプリをダウンロードし、ギャラリーを開き、ライブプレビューのデッキのどれかに目を留めてみてください——そして、あなたがすでに使っているコーディングエージェントが何であれ持ち込み、自分のものにしてください。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>4日間で137件のPR、開かれた場所に露店を構えた57人から。バザールが存在するのは、これほど多くのコントリビューターが公の場で——新しいアダプター、刷新したデッキ、より滑らかなウェルカムを——みんなの目に見えるところで一斉に作り上げたからです。ムーブメントは一つのチームのノートパソコンから出荷されるのではありません。現れて、作り上げた人々から出荷されるのです。私たちはあなたを見ています。🫡</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0：オールインワンのデザインワークスペース</a> — 今回が切り開く、そのワンウィンドウのリリース</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0：すべての人のためのデザイン</a> — ウェルカムの下にある、インストールして作るリリース</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0：すべてはプラグイン</a> — ギャラリーが築かれている、そのプラグインエンジン</li>
      </ul>
  ko:
    title: 'Open Design 0.11.0: 바자르'
    summary: '태그 open-design-v0.11.0 — 4일 동안 57명의 기여자가 만든 137개의 PR. 코드명 "바자르(Bazaar)". 이제 플러그인 갤러리는 모든 실제 결과물의 라이브 클립을 재생하고, 이미 쓰고 있는 어떤 코딩 에이전트든 그대로 끼워 넣을 수 있으며, 새 사용자의 첫 실행은 잠긴 관문이 아니라 안내가 있는 환영입니다.'
    bodyHtml: |
      <p>태그 <code>open-design-v0.11.0</code>, 2026년 6월 17일 출시. <strong>4일 동안 57명의 기여자가 만든 137개의 PR.</strong> 코드명 "바자르(Bazaar)". 대성당은 선택받은 소수가 비공개로 짓고, 바자르는 모두가 공개된 곳에서 한꺼번에 짓습니다 — 그리고 이번 릴리스는 Open Design을 바로 그 바자르로 만듭니다. 안으로 들어와 좌판을 둘러보고, 눈길을 끄는 무엇이든 집어 들어 당신의 것으로 만드세요.</p>
      <p>긴 버전이 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub의 릴리스 노트</a>에 담겨 있습니다. 이 글은 짧은 버전입니다: 이번 릴리스에서 무엇이 열렸는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작하면 되는지.</p>

      <h2>마침내 제 실력을 뽐내는 갤러리</h2>
      <p>죽은 썸네일은 당신을 추측하게 만듭니다. 0.11.0의 갤러리는 그렇지 않습니다 — <strong>이제 모든 플러그인 카드와 상세 페이지가 실제 결과물의 라이브 클립을 재생</strong>하므로, 덱이나 템플릿이 실제로 무엇을 하는지 고르기 전에 직접 봅니다.</p>
      <p>선반도 가득 찼습니다. <strong>56개의 공식 덱</strong> 전부가 하나의 제품 내러티브를 중심으로 통일된 온브랜드 단장을 거쳤고, 최고의 오픈소스 슬라이드 스킬에서 추려낸 <strong>23개의 커뮤니티 슬라이드 키트</strong>가 대열에 합류했으며, HyperFrames 비디오 템플릿도 새로워졌습니다. 이제 커뮤니티 덱은 레터박스 없는 16:9 프리뷰와 함께 Home 화면에 바로 표시됩니다. 대열을 둘러보고, 재생을 누르고, 마음에 드는 것을 집어, 자유롭게 변주해 보세요.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="격자로 배열된 플러그인 갤러리 카드들의 벽, 각 카드가 작은 라이브 프리뷰 클립을 재생하고 있고, 그중 한 카드가 빠져나와 녹색 선택 프레임 안에 담겨 있으며, 거의 흰색에 가까운 편집 배경 위에 놓여 있다" />
        <figcaption>모든 카드가 실제 결과물의 라이브 클립을 재생합니다 — 둘러보고, 재생을 누르고, 당신의 것으로 만드세요.</figcaption>
      </figure>

      <h2>이미 쓰고 있는 코딩 에이전트를 그대로 가져오세요</h2>
      <p>Open Design은 한 번도 당신을 하나의 도구에 가두려 한 적이 없으며, 이번 릴리스는 그 문을 한층 더 넓힙니다. <strong>이미 당신의 하루에 엮어 둔 어떤 코딩 에이전트든 이제 Claude 바로 옆에 그대로 끼워집니다.</strong></p>
      <p><strong>Amp</strong>와 <strong>Codebuddy Code</strong>를 위한 완전히 새로운 어댑터 두 개가 도착하고, <strong>Kimi Code</strong> 런타임이 수정되었으며, <strong>Codex</strong>는 구독 미디어를 얻고, <strong>Antigravity</strong>가 지원되며, <strong>GitHub Copilot</strong>의 상한이 더 넉넉해지고, <code>reasonix</code> 1.x는 MCP 환경을 갖춥니다. 어떤 벤더든 좌판을 펼 수 있습니다 — 그 주위의 워크스페이스를 쓰겠다고 신뢰하는 도구를 바꿀 필요가 결코 없습니다.</p>

      <h2>벽이 아니라 환영</h2>
      <p>예전에는 첫 실행이 당신을 제어판으로 떨어뜨렸습니다. 0.11.0에서는 <strong>대신 안내가 있는 경로</strong>입니다. 이제 제한된 Connect 단계에는 <em>왜</em> 제한되는지를 설명하는 툴팁이 딸려 오고, 깔끔한 순차 스테퍼가 설정 과정을 안내하며, BYOK 자동 확인과 CLI 감지가 더 똑똑해졌고, 온보딩이 시작되기도 전에 번쩍이던 거슬리는 홈 화면 깜빡임이 사라졌습니다.</p>
      <p>그 결과 처음 5분은 잠긴 관문이 아니라 초대처럼 느껴집니다 — 새 사용자는 거리에서 그냥 걸어 들어와 벽에 부딪히지 않고 자신의 첫 실제 실행에 다다를 수 있습니다.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="안쪽으로 이어지는 온보딩 단계들이 깔끔하게 순차적으로 늘어선 열린 관문, 활성 단계가 녹색 선택 프레임 안에 담겨 있으며, 거의 흰색에 가까운 편집 배경 위에 놓여 있다" />
        <figcaption>이제 온보딩은 안내가 있는 순서입니다 — 잠긴 관문이 아니라 환영입니다.</figcaption>
      </figure>

      <h2>지금까지 가장 안정적인 빌드</h2>
      <p>이것은 Open Design이 내놓은 가장 큰 안정성 개선입니다. 데스크톱 창은 렌더러가 죽거나 로드가 실패할 때 <strong>스스로 회복</strong>하고, 실행은 질문을 기다리며 <strong>결코 멈추지 않으며</strong>, 당신이 마크업하거나 스크린샷을 찍거나 코멘트를 다는 동안 <strong>프리뷰가 발밑에서 다시 로드되는 일이 멈춥니다</strong>. 파일 디스크립터 누수가 막혔고, 업데이터가 지연 없이 헛도는 일이 멈췄으며, 다이얼로그·피커·스크린샷의 자잘한 결함들이 길게 줄지어 사라졌습니다. 하루 종일 열어 두는 빌드가 그냥 <em>켜진 채로 있습니다.</em></p>
      <p>같은 개선에서 두 가지 모서리가 더 다듬어졌습니다. <strong>당신의 키가 당신과 싸우기를 멈춥니다</strong> — Composio 키 관문은 막다른 길 대신 한 번의 클릭이 되었고, Gemini BYOK 모델은 현재 API를 따라가며(종료된 2.0은 빠지고, 3.x가 들어옴), 컴포저 모델 전환이 마침내 유지됩니다. 그리고 <strong>아무것도 새지 않습니다</strong> — 프리뷰 URL 처리가 강화되었고 로컬 프리뷰 서버는 기본적으로 <strong>루프백</strong>에 바인딩되므로, 프로젝트 프리뷰가 당신의 네트워크로 떠도는 일이 결코 없습니다.</p>

      <h2>0.11.0에 또 무엇이 담겼나</h2>
      <p>이번 릴리스는 폭이 넓습니다. 앞으로 끌어올릴 만한 조각 몇 가지:</p>
      <ul>
        <li><strong>이제 Open Design이 웹에 진짜 보금자리를 갖췄습니다.</strong> <strong>21개의 지원 에이전트</strong> 전부를 위한 디자인 페이지, 새로 만든 푸터와 함께 갖춘 완전한 신뢰 페이지 모음(소개, FAQ, 개인정보 처리방침, 이용약관, 진짜 404), 붙여 넣는 모든 링크가 깔끔하게 보이도록 사이트 전반에 맞춤 제작된 공유 카드, 목차와 완전한 i18n을 갖춰 새로 만든 블로그, 그리고 플러그인 페이지 전반에 걸친 SEO + UX 개선.</li>
        <li>새 사용자가 시작할 수 있도록 돕는 <strong>두 개의 새 커뮤니티 튜토리얼</strong>.</li>
        <li><strong>더 빠른 콜드 스타트.</strong> 이제 OpenCode 부트스트랩 로딩이 캐시되어 첫 실행의 대기 시간을 줄입니다.</li>
        <li><strong>성장할 수 있도록 설계.</strong> 샌드박스 계약 형태와 소유권 가드가 고정되고, 명시적 루트 임포트가 허용되며, 모델 오케스트레이터 스크래치 워크스페이스가 도착합니다 — 다음에 올 것을 위한 토대입니다.</li>
      </ul>
      <p>전체 목록은 137개의 PR에 이릅니다. 나머지는 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub의 릴리스 노트</a>에 담겨 있습니다.</p>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead>
          <tr><th>당신이…</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 다운로드하고 안내가 있는 환영을 따라가세요 — 제한된 Connect 단계와 순차 스테퍼가 벽 없이 당신을 첫 실제 실행으로 안내합니다</td></tr>
          <tr><td>이미 Open Design을 쓰고 있다면</td><td>패키지된 자동 업데이트가 당신을 0.11.0으로 데려가게 한 뒤, 갤러리를 열고 재생을 누르세요 — 이제 모든 카드가 실제 결과물을 미리 보여줍니다</td></tr>
          <tr><td>다른 코딩 에이전트를 쓰고 있다면</td><td>Amp, Codebuddy Code, Kimi, Codex, Antigravity, 또는 Copilot을 엮으세요 — 이미 신뢰하는 무엇이든 Claude 옆에 그대로 끼워집니다</td></tr>
          <tr><td>덱을 출시한다면</td><td>56개의 공식 덱과 23개의 커뮤니티 슬라이드 키트를 둘러보고, 라이브 클립이 마음에 드는 것을 집어, 당신의 것으로 만드세요</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>바자르는 당신이 걸어 들어와 물건을 집어 들기 시작할 수 있어야 비로소 작동합니다. 데스크톱 앱을 다운로드하고, 갤러리를 열고, 라이브 프리뷰 덱 하나가 당신의 눈길을 끌게 하세요 — 그런 다음 이미 쓰고 있는 어떤 코딩 에이전트든 가져와 당신의 것으로 만드세요.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>4일 동안 137개의 PR, 공개된 곳에서 좌판을 펼친 57명에게서. 바자르가 존재하는 이유는, 그토록 많은 기여자가 모두가 볼 수 있는 곳에서 한꺼번에 공개적으로 만들었기 때문입니다 — 새 어댑터, 새단장한 덱, 더 매끄러운 환영. 운동은 한 팀의 노트북에서 출시되지 않습니다; 나타나서 만든 사람들에게서 출시됩니다. 우리는 당신을 보고 있습니다. 🫡</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: 올인원 디자인 워크스페이스</a> — 이번 릴리스가 열어젖히는 단일 창 릴리스</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: 모두를 위한 디자인</a> — 환영 밑에 자리한 설치-그리고-생성 릴리스</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: 만물은 플러그인</a> — 갤러리가 그 위에 지어진 플러그인 엔진</li>
      </ul>
  de:
    title: 'Open Design 0.11.0: der Basar'
    summary: 'Tag open-design-v0.11.0 — 137 PRs von 57 Mitwirkenden in vier Tagen. Codename „der Basar”. Die Plugin-Galerie spielt jetzt einen Live-Clip jeder echten Ausgabe ab, jeder Coding-Agent, den du bereits nutzt, lässt sich einfach einklinken, und der erste Lauf für Neulinge ist ein geführtes Willkommen statt eines verriegelten Tors.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.11.0</code>, veröffentlicht am 17. Juni 2026. <strong>137 PRs von 57 Mitwirkenden in vier Tagen.</strong> Codename „der Basar”. Eine Kathedrale wird im Verborgenen von wenigen Auserwählten gebaut; ein Basar wird offen gebaut, von allen, alle zugleich — und dieses Release macht Open Design zum Basar. Tritt ein, schlendere an den Ständen vorbei, greif dir, was dein Auge fängt, und mach es zu deinem.</p>
      <p>Wenn du die ausführliche Version möchtest, findest du sie in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">Release Notes auf GitHub</a>. Dieser Beitrag ist die Kurzfassung: was sich in diesem Release geöffnet hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Eine Galerie, die endlich zeigt, was sie kann</h2>
      <p>Ein totes Vorschaubild lässt dich raten. Die Galerie in 0.11.0 tut das nicht — <strong>jede Plugin-Karte und Detailseite spielt jetzt einen Live-Clip der echten Ausgabe ab</strong>, sodass du siehst, was ein Deck oder Template tatsächlich macht, bevor du es auswählst.</p>
      <p>Auch die Regale sind voll. Alle <strong>56 offiziellen Decks</strong> haben eine markengerechte Auffrischung erhalten, geeint um ein einziges Produktnarrativ, <strong>23 Community-Slide-Kits</strong>, aus den besten Open-Source-Slide-Skills gezogen, sind in die Reihen gerückt, und die HyperFrames-Videovorlagen sind frisch. Community-Decks erscheinen jetzt direkt auf dem Home-Bildschirm mit letterbox-freien 16:9-Vorschauen. Stöbere durch die Reihen, drück auf Play, schnapp dir, was dir gefällt, und spinn es weiter.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Eine Wand aus Plugin-Galerie-Karten in einem Raster angeordnet, jede Karte spielt einen kleinen Live-Vorschau-Clip ab, eine Karte ist herausgehoben und in einem grünen Auswahlrahmen gehalten, auf einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Jede Karte spielt einen Live-Clip der echten Ausgabe ab — stöbern, Play drücken, zu deinem machen.</figcaption>
      </figure>

      <h2>Bring den Coding-Agent mit, den du bereits nutzt</h2>
      <p>Bei Open Design ging es nie darum, dich an ein einziges Tool zu binden, und dieses Release öffnet die Tür noch weiter. <strong>Welchen Coding-Agent du auch immer schon in deinen Arbeitsalltag eingebunden hast — er klinkt sich jetzt direkt neben Claude ein.</strong></p>
      <p>Zwei brandneue Adapter kommen für <strong>Amp</strong> und <strong>Codebuddy Code</strong>, die <strong>Kimi Code</strong>-Runtime ist repariert, <strong>Codex</strong> erhält Abo-Medien, <strong>Antigravity</strong> wird unterstützt, das <strong>GitHub Copilot</strong>-Limit ist großzügiger, und <code>reasonix</code> 1.x bekommt seine MCP-Umgebung. Jeder Anbieter kann hier seinen Stand aufschlagen — du musst nie das Tool wechseln, dem du vertraust, um den Workspace darum herum zu nutzen.</p>

      <h2>Ein Willkommen, keine Mauer</h2>
      <p>Ein erster Lauf hat dich früher in ein Bedienfeld geworfen. In 0.11.0 ist es <strong>stattdessen ein geführter Weg.</strong> Ein gesperrter Connect-Schritt kommt jetzt mit einem Tooltip, der erklärt, <em>warum</em> er gesperrt ist, ein sauberer sequenzieller Stepper führt dich durch die Einrichtung, BYOK-Auto-Checks und CLI-Erkennung sind cleverer, und das störende Aufblitzen des Home-Bildschirms, noch bevor das Onboarding überhaupt beginnt, ist verschwunden.</p>
      <p>Das Ergebnis: Die ersten fünf Minuten fühlen sich wie eine Einladung an statt wie ein verriegeltes Tor — ein Neuling kann von der Straße hereinspazieren und zu seinem ersten echten Lauf gelangen, ohne gegen eine Mauer zu laufen.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="Ein offenes Tor mit einer sauberen sequenziellen Reihe von Onboarding-Schritten, die nach innen führt, der aktive Schritt in einem grünen Auswahlrahmen gehalten, auf einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Onboarding ist jetzt eine geführte Abfolge — ein Willkommen, kein verriegeltes Tor.</figcaption>
      </figure>

      <h2>Der stabilste Build bisher</h2>
      <p>Dies ist der größte Stabilitätsdurchlauf, den Open Design ausgeliefert hat. Das Desktop-Fenster <strong>heilt sich selbst</strong>, wenn der Renderer abstürzt oder ein Laden fehlschlägt, Läufe <strong>hängen nie</strong> in Erwartung einer Frage, und die <strong>Vorschau lädt nicht mehr unter dir weg</strong>, während du markierst, Screenshots machst oder kommentierst. Ein File-Descriptor-Leck ist gestopft, der Updater dreht nicht mehr bei null Verzögerung durch, und ein langer Rattenschwanz an Dialog-, Picker- und Screenshot-Macken ist verschwunden. Der Build, den du den ganzen Tag offen hältst, <em>bleibt einfach stehen.</em></p>
      <p>Zwei weitere Kanten wurden im selben Durchlauf geglättet. <strong>Deine eigenen Keys kämpfen nicht mehr gegen dich</strong> — das Composio-Key-Gate ist ein Klick statt einer Sackgasse, Gemini-BYOK-Modelle folgen der aktuellen API (das abgeschaltete 2.0 raus, 3.x rein), und der Modellwechsel im Composer bleibt endlich bestehen. Und <strong>nichts dringt nach außen</strong> — die Handhabung der Vorschau-URLs ist gehärtet, und der lokale Vorschauserver bindet sich standardmäßig an <strong>Loopback</strong>, sodass eine Projektvorschau nie in dein Netzwerk wandert.</p>

      <h2>Was sonst noch in 0.11.0 landet</h2>
      <p>Das Release ist breit. Ein paar weitere Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
        <li><strong>Open Design hat jetzt ein echtes Zuhause im Web.</strong> Design-Seiten für alle <strong>21 unterstützten Agents</strong>, ein vollständiger Satz Vertrauensseiten (Über uns, FAQ, Datenschutz, AGB, eine echte 404) mit neu aufgebautem Footer, eine eigens gebaute Share-Card für die ganze Website, sodass jeder Link, den du einfügst, scharf aussieht, ein neu aufgebauter Blog mit Inhaltsverzeichnis und voller i18n, sowie ein SEO- + UX-Durchlauf über alle Plugin-Seiten hinweg.</li>
        <li><strong>Zwei neue Community-Tutorials</strong>, um Neulinge in Schwung zu bringen.</li>
        <li><strong>Schnellere Kaltstarts.</strong> Das OpenCode-Bootstrap-Laden wird jetzt zwischengespeichert, um die Wartezeit beim ersten Lauf zu verkürzen.</li>
        <li><strong>Auf Wachstum gebaut.</strong> Sandbox-Contract-Formen und Ownership-Guards sind fixiert, explizite Root-Importe sind erlaubt, und Scratch-Workspaces für den Model-Orchestrator kommen hinzu — die Grundlage für das, was als Nächstes kommt.</li>
      </ul>
      <p>Die vollständige Liste umfasst 137 PRs. Die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">Release Notes auf GitHub</a> enthalten den Rest.</p>

      <h2>Was du heute damit machen kannst</h2>
      <table>
        <thead>
          <tr><th>Wenn du…</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>Neu bei Open Design bist</td><td>Lade die Desktop-App herunter und folge dem geführten Willkommen — der gesperrte Connect-Schritt und der sequenzielle Stepper führen dich ohne Mauer zu deinem ersten echten Lauf</td></tr>
          <tr><td>Open Design bereits nutzt</td><td>Lass das integrierte Auto-Update dich auf 0.11.0 bringen, öffne dann die Galerie und drück auf Play — jede Karte zeigt jetzt eine Vorschau ihrer echten Ausgabe</td></tr>
          <tr><td>Einen anderen Coding-Agent nutzt</td><td>Binde Amp, Codebuddy Code, Kimi, Codex, Antigravity oder Copilot ein — was auch immer du bereits vertraust, klinkt sich neben Claude ein</td></tr>
          <tr><td>Ein Deck ausspielst</td><td>Stöbere durch die 56 offiziellen Decks und 23 Community-Slide-Kits, schnapp dir das, dessen Live-Clip dir gefällt, und mach es zu deinem</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Ein Basar funktioniert nur, wenn du hereinspazieren und Dinge in die Hand nehmen kannst. Lade die Desktop-App herunter, öffne die Galerie und lass eines der Live-Vorschau-Decks dein Auge fangen — bring dann den Coding-Agent mit, den du bereits nutzt, und mach es zu deinem.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>137 PRs in vier Tagen, von 57 Menschen, die offen ihre Stände aufschlagen. Der Basar existiert, weil so viele Mitwirkende in der Öffentlichkeit gebaut haben — neue Adapter, aufgefrischte Decks, ein sanfteres Willkommen — alle zugleich, wo jeder es sehen kann. Eine Bewegung wird nicht von den Laptops eines einzelnen Teams ausgeliefert; sie wird von den Menschen ausgeliefert, die aufgetaucht sind und gebaut haben. Wir sehen euch. 🫡</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: der All-in-One-Design-Workspace</a> — das Ein-Fenster-Release, das dieses hier weiter öffnet</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: Design für alle</a> — das Installieren-und-Erstellen-Release unter dem Willkommen</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: alles ist ein Plugin</a> — die Plugin-Engine, auf der die Galerie aufbaut</li>
      </ul>
  fr:
    title: 'Open Design 0.11.0 : le Bazar'
    summary: 'Tag open-design-v0.11.0 — 137 PR de 57 contributeurs en quatre jours. Nom de code « le Bazar ». La galerie de plugins lit désormais un extrait en direct de chaque sortie réelle, l''agent de codage que vous utilisez déjà s''y intègre d''un clic, et le premier lancement d''un nouveau venu est un accueil guidé plutôt qu''une porte verrouillée.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.11.0</code>, publié le 17 juin 2026. <strong>137 PR de 57 contributeurs en quatre jours.</strong> Nom de code « le Bazar ». Une cathédrale se bâtit en privé par quelques élus ; un bazar se bâtit à ciel ouvert, par tout le monde, tous à la fois — et cette version transforme Open Design en bazar. Entrez, parcourez les étals, attrapez ce qui attire votre regard, et faites-le vôtre.</p>
      <p>Si vous voulez la version longue, les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">notes de version sur GitHub</a> la contiennent. Cet article est la version courte : ce qui s'est ouvert dans cette version, ce que vous pouvez en faire dès aujourd'hui, et par où commencer.</p>

      <h2>Une galerie qui se montre enfin</h2>
      <p>Une vignette figée vous laisse deviner. La galerie de la 0.11.0, non — <strong>chaque carte de plugin et page de détail lit désormais un extrait en direct de la sortie réelle</strong>, pour que vous voyiez ce que fait vraiment un deck ou un template avant de le choisir.</p>
      <p>Les rayons sont pleins, eux aussi. Les <strong>56 decks officiels</strong> ont tous reçu un coup de neuf fidèle à la marque, unifié autour d'un seul récit produit, <strong>23 kits de slides communautaires</strong> tirés des meilleures slide skills open source ont rejoint les rangs, et les templates vidéo HyperFrames sont tout frais. Les decks communautaires apparaissent désormais directement sur l'écran d'accueil Home avec des aperçus 16:9 sans bandes noires. Parcourez les rangs, appuyez sur lecture, attrapez ce qui vous plaît, et improvisez dessus.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Un mur de cartes de la galerie de plugins disposées en grille, chaque carte lisant un petit extrait d'aperçu en direct, avec une carte extraite et maintenue à l'intérieur d'un cadre de sélection vert, sur un fond éditorial presque blanc" />
        <figcaption>Chaque carte lit un extrait en direct de la sortie réelle — parcourez, appuyez sur lecture, faites-le vôtre.</figcaption>
      </figure>

      <h2>Apportez l'agent de codage que vous utilisez déjà</h2>
      <p>Open Design n'a jamais cherché à vous enfermer dans un seul outil, et cette version ouvre la porte encore plus grand. <strong>Quel que soit l'agent de codage que vous avez déjà intégré à votre quotidien, il s'installe désormais juste à côté de Claude.</strong></p>
      <p>Deux adaptateurs tout neufs arrivent pour <strong>Amp</strong> et <strong>Codebuddy Code</strong>, l'environnement d'exécution <strong>Kimi Code</strong> est corrigé, <strong>Codex</strong> gagne les médias par abonnement, <strong>Antigravity</strong> est pris en charge, le plafond de <strong>GitHub Copilot</strong> est plus large, et <code>reasonix</code> 1.x obtient son environnement MCP. N'importe quel fournisseur peut installer son stand — vous n'avez jamais à changer l'outil auquel vous faites confiance pour utiliser l'espace de travail qui l'entoure.</p>

      <h2>Un accueil, pas un mur</h2>
      <p>Un premier lancement vous larguait autrefois dans un panneau de contrôle. Dans la 0.11.0, c'est <strong>un parcours guidé à la place.</strong> Une étape Connect sous condition s'accompagne désormais d'une infobulle qui explique <em>pourquoi</em> elle est verrouillée, un séquenceur d'étapes net vous accompagne dans la configuration, les vérifications automatiques BYOK et la détection de CLI sont plus intelligentes, et le flash brutal de l'écran d'accueil avant même le début de l'onboarding a disparu.</p>
      <p>Résultat : les cinq premières minutes ressemblent à une invitation plutôt qu'à une porte verrouillée — un nouveau venu peut entrer comme on entre dans la rue et atteindre son premier vrai lancement sans se heurter à un mur.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="Un portail ouvert avec une rangée séquentielle nette d'étapes d'onboarding menant vers l'intérieur, l'étape active maintenue à l'intérieur d'un cadre de sélection vert, sur un fond éditorial presque blanc" />
        <figcaption>L'onboarding est désormais une séquence guidée — un accueil, pas une porte verrouillée.</figcaption>
      </figure>

      <h2>Le build le plus stable à ce jour</h2>
      <p>C'est la plus grande passe de stabilité qu'Open Design ait livrée. La fenêtre de bureau <strong>se répare d'elle-même</strong> quand le moteur de rendu meurt ou qu'un chargement échoue, les exécutions <strong>ne se figent jamais</strong> en attendant une question, et l'<strong>aperçu cesse de se recharger sous vos yeux</strong> pendant que vous annotez, faites une capture ou commentez. Une fuite de descripteur de fichier est colmatée, le programme de mise à jour cesse de tourner en boucle sans délai, et une longue traîne de bugs de dialogues, de sélecteurs et de captures d'écran a disparu. Le build que vous gardez ouvert toute la journée <em>tient, tout simplement.</em></p>
      <p>Deux autres aspérités ont été lissées dans la même passe. <strong>Vos propres clés cessent de vous résister</strong> — la barrière de clé Composio se franchit d'un clic au lieu d'une impasse, les modèles Gemini BYOK suivent l'API actuelle (la 2.0 arrêtée sort, la 3.x entre), et le changement de modèle dans le composeur tient enfin. Et <strong>rien ne fuit</strong> — la gestion des URL d'aperçu est renforcée et le serveur d'aperçu local se lie à la <strong>boucle locale</strong> par défaut, de sorte qu'un aperçu de projet ne s'égare jamais sur votre réseau.</p>

      <h2>Quoi d'autre arrive dans la 0.11.0</h2>
      <p>La version est vaste. Quelques éléments de plus qui méritent d'être mis en avant :</p>
      <ul>
        <li><strong>Open Design a désormais un véritable foyer sur le web.</strong> Des pages de présentation pour les <strong>21 agents pris en charge</strong>, un ensemble complet de pages de confiance (à propos, FAQ, confidentialité, conditions, une vraie page 404) avec un pied de page reconstruit, une carte de partage dédiée sur tout le site pour que chaque lien que vous collez ait fière allure, un blog reconstruit avec une table des matières et une i18n complète, et une passe SEO + UX sur les pages de plugins.</li>
        <li><strong>Deux nouveaux tutoriels communautaires</strong> pour aider les nouveaux venus à se lancer.</li>
        <li><strong>Des démarrages à froid plus rapides.</strong> Le chargement d'amorçage d'OpenCode est désormais mis en cache pour réduire l'attente au premier lancement.</li>
        <li><strong>Conçu pour grandir.</strong> Les formes de contrat de la sandbox et les garde-fous de propriété sont fixés, les imports à racine explicite sont autorisés, et les espaces de travail temporaires de l'orchestrateur de modèles arrivent — les fondations de ce qui vient ensuite.</li>
      </ul>
      <p>La liste complète compte 137 PR. Les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">notes de version sur GitHub</a> contiennent le reste.</p>

      <h2>Quoi en faire dès aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau et suivez l'accueil guidé — l'étape Connect sous condition et le séquenceur d'étapes vous mènent à votre premier vrai lancement sans mur</td></tr>
          <tr><td>Déjà utilisateur d'Open Design</td><td>Laissez la mise à jour automatique intégrée vous amener à la 0.11.0, puis ouvrez la galerie et appuyez sur lecture — chaque carte affiche désormais un aperçu de sa sortie réelle</td></tr>
          <tr><td>Utilisateur d'un autre agent de codage</td><td>Intégrez Amp, Codebuddy Code, Kimi, Codex, Antigravity ou Copilot — celui auquel vous faites déjà confiance s'installe à côté de Claude</td></tr>
          <tr><td>En train de livrer un deck</td><td>Parcourez les 56 decks officiels et les 23 kits de slides communautaires, attrapez celui dont l'extrait en direct vous plaît, et faites-le vôtre</td></tr>
        </tbody>
      </table>

      <h2>Quoi faire ensuite</h2>
      <p>Un bazar ne fonctionne que si vous pouvez y entrer et commencer à attraper des choses. Téléchargez l'application de bureau, ouvrez la galerie, et laissez l'un des decks à aperçu en direct attirer votre regard — puis apportez l'agent de codage que vous utilisez déjà et faites-le vôtre.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Téléchargez Open Design</a>.</p>
      <p>137 PR en quatre jours, de 57 personnes installant leurs étals à ciel ouvert. Le bazar existe parce que tant de contributeurs ont construit en public — de nouveaux adaptateurs, des decks rafraîchis, un accueil plus fluide — tous à la fois, là où tout le monde peut voir. Un mouvement ne se livre pas depuis les ordinateurs portables d'une seule équipe ; il se livre depuis les personnes qui se sont présentées et ont construit. On vous voit. 🫡</p>

      <h2>Lectures associées</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0 : l'espace de travail de conception tout-en-un</a> — la version une seule fenêtre que celle-ci ouvre</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0 : la conception pour tous</a> — la version installer-et-créer sous l'accueil</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0 : tout est un plugin</a> — le moteur de plugins sur lequel la galerie est bâtie</li>
      </ul>
  ru:
    title: 'Open Design 0.11.0: базар'
    summary: 'Тег open-design-v0.11.0 — 137 PR от 57 контрибьюторов за четыре дня. Кодовое название «базар». Галерея плагинов теперь проигрывает живой ролик каждого реального результата, любой кодинг-агент, которым вы уже пользуетесь, просто подключается, а первый запуск для новичка — это сопровождаемое приветствие вместо запертых ворот.'
    bodyHtml: |
      <p>Тег <code>open-design-v0.11.0</code>, выпущен 17 июня 2026 года. <strong>137 PR от 57 контрибьюторов за четыре дня.</strong> Кодовое название «базар». Собор строится в тиши избранными немногими; базар строится открыто, всеми и сразу — и этот релиз превращает Open Design в базар. Войдите, пройдитесь по рядам, возьмите всё, что приглянулось, и сделайте это своим.</p>
      <p>Если вам нужна развёрнутая версия, она есть в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">примечаниях к релизу на GitHub</a>. Этот пост — краткая версия: что открылось в этом релизе, что вы можете сделать с этим уже сегодня и с чего начать.</p>

      <h2>Галерея, которая наконец показывает себя</h2>
      <p>Мёртвая миниатюра заставляет гадать. Галерея в 0.11.0 — нет: <strong>каждая карточка плагина и страница с деталями теперь проигрывают живой ролик реального результата</strong>, так что вы видите, что на самом деле делает презентация или шаблон, прежде чем выбрать его.</p>
      <p>Полки тоже полны. Все <strong>56 официальных презентаций</strong> получили фирменное обновление, объединённое вокруг одного продуктового нарратива, <strong>23 набора слайдов от сообщества</strong>, собранных из лучших open-source-навыков для слайдов, встали в ряды, а видеошаблоны HyperFrames — свежие. Презентации сообщества теперь появляются прямо на экране Home с превью 16:9 без чёрных полос. Пройдитесь по рядам, нажмите play, хватайте что нравится и импровизируйте на этой основе.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Стена карточек галереи плагинов, разложенных сеткой, каждая карточка проигрывает небольшой живой ролик-превью, одна карточка вынута и удержана внутри зелёной рамки выделения, на почти белом редакторском фоне" />
        <figcaption>Каждая карточка проигрывает живой ролик реального результата — просматривайте, нажимайте play, делайте своим.</figcaption>
      </figure>

      <h2>Принесите тот кодинг-агент, которым уже пользуетесь</h2>
      <p>Open Design никогда не был про то, чтобы запереть вас в одном инструменте, и этот релиз открывает дверь ещё шире. <strong>Любой кодинг-агент, который вы уже встроили в свой день, теперь подключается прямо рядом с Claude.</strong></p>
      <p>Появляются два совершенно новых адаптера для <strong>Amp</strong> и <strong>Codebuddy Code</strong>, исправлена среда выполнения <strong>Kimi Code</strong>, <strong>Codex</strong> получает медиа по подписке, поддерживается <strong>Antigravity</strong>, потолок <strong>GitHub Copilot</strong> стал просторнее, а <code>reasonix</code> 1.x получает своё MCP-окружение. Любой вендор может открыть лавку — вам никогда не придётся менять инструмент, которому вы доверяете, чтобы пользоваться рабочим пространством вокруг него.</p>

      <h2>Приветствие, а не стена</h2>
      <p>Раньше первый запуск бросал вас в панель управления. В 0.11.0 это <strong>вместо этого сопровождаемый путь.</strong> Закрытый шаг Connect теперь снабжён подсказкой, объясняющей, <em>почему</em> он закрыт, аккуратный последовательный пошаговый мастер проводит вас через настройку, авто-проверки BYOK и определение CLI стали умнее, а резкая вспышка домашнего экрана ещё до начала онбординга исчезла.</p>
      <p>В результате первые пять минут ощущаются как приглашение, а не как запертые ворота — новичок может зайти прямо с улицы и добраться до своего первого настоящего запуска, не упёршись в стену.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="Открытые ворота с аккуратным последовательным рядом шагов онбординга, ведущих внутрь, активный шаг удержан внутри зелёной рамки выделения, на почти белом редакторском фоне" />
        <figcaption>Онбординг теперь — сопровождаемая последовательность: приветствие, а не запертые ворота.</figcaption>
      </figure>

      <h2>Самая стабильная сборка на сегодня</h2>
      <p>Это крупнейший заход на стабильность, который выпускал Open Design. Окно десктопа <strong>исцеляет само себя</strong>, когда рендерер падает или загрузка не удаётся, запуски <strong>больше не зависают</strong> в ожидании вопроса, а <strong>превью перестаёт перезагружаться у вас из-под рук</strong>, пока вы размечаете, делаете скриншоты или комментируете. Заткнута утечка файловых дескрипторов, апдейтер перестаёт крутиться с нулевой задержкой, и исчез длинный хвост глюков диалогов, пикеров и скриншотов. Сборка, которую вы держите открытой весь день, просто <em>остаётся на ногах.</em></p>
      <p>В том же заходе сгладились ещё два края. <strong>Ваши собственные ключи перестают бороться с вами</strong> — гейт ключа Composio теперь в один клик вместо тупика, BYOK-модели Gemini следуют за текущим API (отключённая 2.0 уходит, 3.x приходит), а переключение модели в композере наконец держится. И <strong>ничего не утекает</strong> — обработка URL превью усилена, а локальный сервер превью по умолчанию привязывается к <strong>loopback</strong>, так что превью проекта никогда не выходит в вашу сеть.</p>

      <h2>Что ещё вошло в 0.11.0</h2>
      <p>Релиз обширный. Вот ещё несколько частей, которые стоит вынести вперёд:</p>
      <ul>
        <li><strong>Теперь у Open Design есть настоящий дом в вебе.</strong> Страницы дизайна для всех <strong>21 поддерживаемого агента</strong>, полный набор страниц доверия (о проекте, FAQ, конфиденциальность, условия, настоящая 404) с перестроенным футером, специально сделанная карточка для шеринга по всему сайту, чтобы любая ссылка, которую вы вставляете, выглядела чётко, перестроенный блог с оглавлением и полной i18n, а также проход по SEO и UX по страницам плагинов.</li>
        <li><strong>Два новых обучающих руководства от сообщества</strong>, чтобы новички начали двигаться.</li>
        <li><strong>Более быстрые холодные старты.</strong> Загрузка инициализации OpenCode теперь кешируется, чтобы сократить ожидание при первом запуске.</li>
        <li><strong>Построено, чтобы расти.</strong> Зафиксированы формы контрактов песочницы и стражи владения, разрешён импорт с явным корнем, и появляются черновые рабочие пространства оркестратора моделей — фундамент для того, что будет дальше.</li>
      </ul>
      <p>Полный список насчитывает 137 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">Примечания к релизу на GitHub</a> содержат остальное.</p>

      <h2>Что делать с этим уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктопное приложение и пройдите сопровождаемое приветствие — закрытый шаг Connect и последовательный пошаговый мастер доведут вас до первого настоящего запуска без стены</td></tr>
          <tr><td>Уже используете Open Design</td><td>Позвольте встроенному автообновлению поднять вас до 0.11.0, затем откройте галерею и нажмите play — каждая карточка теперь показывает превью своего реального результата</td></tr>
          <tr><td>Используете другой кодинг-агент</td><td>Подключите Amp, Codebuddy Code, Kimi, Codex, Antigravity или Copilot — то, чему вы уже доверяете, встаёт рядом с Claude</td></tr>
          <tr><td>Готовите презентацию</td><td>Пройдитесь по 56 официальным презентациям и 23 наборам слайдов от сообщества, возьмите ту, чей живой ролик вам понравился, и сделайте её своей</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Базар работает, только если можно войти и начать брать вещи в руки. Скачайте десктопное приложение, откройте галерею и дайте одной из презентаций с живым превью зацепить ваш взгляд — затем принесите тот кодинг-агент, которым вы уже пользуетесь, и сделайте всё своим.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>137 PR за четыре дня от 57 человек, что разложили свои лавки на открытом воздухе. Базар существует потому, что столько контрибьюторов строили на виду — новые адаптеры, обновлённые презентации, более гладкое приветствие — всё сразу, там, где видно каждому. Движение не выпускается с ноутбуков одной команды; оно выпускается людьми, которые пришли и строили. Мы видим вас. 🫡</p>

      <h2>Похожие материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: единое рабочее пространство для дизайна</a> — релиз одного окна, который этот раскрывает</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: дизайн для всех</a> — релиз «установи-и-создавай» под этим приветствием</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: всё — это плагин</a> — движок плагинов, на котором построена галерея</li>
      </ul>
  es:
    title: 'Open Design 0.11.0: el Bazar'
    summary: 'Tag open-design-v0.11.0: 137 PRs de 57 colaboradores en cuatro días. Nombre en clave «el Bazar». La galería de plugins ahora reproduce un clip en vivo de cada resultado real, cualquier coding agent que ya uses simplemente encaja, y el primer arranque de un recién llegado es una bienvenida guiada en lugar de una puerta cerrada.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.11.0</code>, publicado el 17 de junio de 2026. <strong>137 PRs de 57 colaboradores en cuatro días.</strong> Nombre en clave «el Bazar». Una catedral la construyen en privado unos pocos elegidos; un bazar se construye a la vista, entre todos, a la vez, y esta versión convierte Open Design en el bazar. Entra, recorre los puestos, toma lo que te llame la atención y hazlo tuyo.</p>
      <p>Si quieres la versión larga, las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">notas de la versión en GitHub</a> la tienen. Esta publicación es la versión corta: qué se abrió en esta versión, qué puedes hacer con ello hoy y por dónde empezar.</p>

      <h2>Una galería que por fin se luce</h2>
      <p>Una miniatura muerta te obliga a adivinar. La galería de 0.11.0 no lo hace: <strong>cada tarjeta de plugin y cada página de detalle ahora reproduce un clip en vivo del resultado real</strong>, así que ves lo que hace de verdad una presentación o una plantilla antes de elegirla.</p>
      <p>Y los estantes están llenos. Las <strong>56 presentaciones oficiales</strong> recibieron un lavado de cara fiel a la marca unificado en torno a una sola narrativa de producto, <strong>23 kits de diapositivas de la comunidad</strong> tomados de las mejores slide skills de código abierto se sumaron a las filas, y las plantillas de vídeo de HyperFrames están recién hechas. Las presentaciones de la comunidad ahora aparecen directamente en la pantalla de inicio con vistas previas 16:9 sin bandas negras. Recorre las filas, dale al play, toma lo que te guste y reinterprétalo.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Un muro de tarjetas de la galería de plugins dispuestas en una cuadrícula, cada tarjeta reproduciendo un pequeño clip de vista previa en vivo, con una tarjeta levantada y sostenida dentro de un marco de selección verde, sobre un fondo editorial casi blanco" />
        <figcaption>Cada tarjeta reproduce un clip en vivo del resultado real: recorre, dale al play, hazlo tuyo.</figcaption>
      </figure>

      <h2>Trae el coding agent que ya usas</h2>
      <p>Open Design nunca ha pretendido encerrarte en una sola herramienta, y esta versión abre aún más la puerta. <strong>Cualquier coding agent que ya hayas integrado en tu día a día ahora encaja justo al lado de Claude.</strong></p>
      <p>Llegan dos adaptadores nuevecitos para <strong>Amp</strong> y <strong>Codebuddy Code</strong>, el runtime de <strong>Kimi Code</strong> queda arreglado, <strong>Codex</strong> obtiene medios por suscripción, <strong>Antigravity</strong> es compatible, el tope de <strong>GitHub Copilot</strong> es más holgado, y <code>reasonix</code> 1.x recibe su entorno MCP. Cualquier proveedor puede montar su puesto: nunca tienes que cambiar la herramienta en la que confías para usar el espacio de trabajo a su alrededor.</p>

      <h2>Una bienvenida, no un muro</h2>
      <p>Antes, el primer arranque te dejaba caer en un panel de control. En 0.11.0 es <strong>un camino guiado.</strong> Un paso de Conexión bloqueado ahora viene con una indicación que explica <em>por qué</em> está bloqueado, un asistente secuencial limpio te lleva paso a paso por la configuración, las comprobaciones automáticas de BYOK y la detección de CLI son más inteligentes, y el desconcertante parpadeo de la pantalla de inicio antes de que siquiera empiece la incorporación desapareció.</p>
      <p>El resultado es que los primeros cinco minutos se sienten como una invitación en lugar de una puerta cerrada: un recién llegado puede entrar desde la calle y llegar a su primera ejecución real sin chocar contra un muro.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="Una puerta abierta con una fila secuencial y limpia de pasos de incorporación que llevan hacia dentro, con el paso activo sostenido dentro de un marco de selección verde, sobre un fondo editorial casi blanco" />
        <figcaption>La incorporación ahora es una secuencia guiada: una bienvenida, no una puerta cerrada.</figcaption>
      </figure>

      <h2>La versión más estable hasta ahora</h2>
      <p>Esta es la mayor pasada de estabilidad que Open Design ha publicado. La ventana de escritorio <strong>se cura sola</strong> cuando el renderizador muere o falla una carga, las ejecuciones <strong>nunca se cuelgan</strong> esperando una pregunta, y la <strong>vista previa deja de recargarse bajo tus pies</strong> mientras anotas, capturas o comentas. Se tapa una fuga de descriptores de archivo, el actualizador deja de girar en bucle con retardo cero, y desaparece una larga cola de fallos de diálogos, selectores y capturas. La versión que mantienes abierta todo el día simplemente <em>se queda en pie.</em></p>
      <p>En la misma pasada se pulieron otros dos bordes. <strong>Tus propias claves dejan de pelearse contigo</strong>: la puerta de la clave de Composio es un clic en vez de un callejón sin salida, los modelos BYOK de Gemini siguen la API actual (fuera el 2.0 descontinuado, dentro el 3.x), y el cambio de modelo en el compositor por fin se mantiene. Y <strong>nada se filtra</strong>: el manejo de las URLs de vista previa está reforzado y el servidor de vista previa local se enlaza a <strong>loopback</strong> de forma predeterminada, así que una vista previa de proyecto nunca se cuela en tu red.</p>

      <h2>Qué más llega en 0.11.0</h2>
      <p>La versión es amplia. Algunas piezas más que vale la pena destacar:</p>
      <ul>
        <li><strong>Open Design ahora tiene un hogar de verdad en la web.</strong> Páginas de diseño para los <strong>21 agentes compatibles</strong>, un conjunto completo de páginas de confianza (about, FAQ, privacidad, términos, una página 404 de verdad) con un pie de página reconstruido, una tarjeta para compartir diseñada a propósito en todo el sitio para que cada enlace que pegues luzca nítido, un blog reconstruido con tabla de contenidos e i18n completo, y una pasada de SEO + UX por las páginas de plugins.</li>
        <li><strong>Dos nuevos tutoriales de la comunidad</strong> para que los recién llegados arranquen.</li>
        <li><strong>Arranques en frío más rápidos.</strong> La carga de arranque de OpenCode ahora se cachea para recortar la espera en la primera ejecución.</li>
        <li><strong>Construido para crecer.</strong> Las formas del contrato del sandbox y las guardas de propiedad están fijadas, se permiten importaciones de raíz explícita, y llegan los espacios de trabajo temporales del orquestador de modelos: los cimientos de lo que viene a continuación.</li>
      </ul>
      <p>La lista completa llega a 137 PRs. Las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">notas de la versión en GitHub</a> tienen el resto.</p>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio y sigue la bienvenida guiada: el paso de Conexión bloqueado y el asistente secuencial te llevan hasta tu primera ejecución real sin un muro</td></tr>
          <tr><td>Ya usas Open Design</td><td>Deja que la actualización automática empaquetada te lleve a 0.11.0, luego abre la galería y dale al play: cada tarjeta ahora muestra una vista previa de su resultado real</td></tr>
          <tr><td>Usas un coding agent distinto</td><td>Integra Amp, Codebuddy Code, Kimi, Codex, Antigravity o Copilot: lo que ya confías encaja justo al lado de Claude</td></tr>
          <tr><td>Vas a entregar una presentación</td><td>Recorre las 56 presentaciones oficiales y los 23 kits de diapositivas de la comunidad, toma aquella cuyo clip en vivo te guste y hazla tuya</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>Un bazar solo funciona si puedes entrar y empezar a tomar cosas. Descarga la aplicación de escritorio, abre la galería y deja que una de las presentaciones con vista previa en vivo te llame la atención; luego trae el coding agent que ya uses y hazlo tuyo.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>137 PRs en cuatro días, de 57 personas montando puestos a la vista de todos. El bazar existe porque tantísimos colaboradores construyeron en público —nuevos adaptadores, presentaciones renovadas, una bienvenida más fluida— todo a la vez, donde todos pueden verlo. Un movimiento no se entrega desde los portátiles de un solo equipo; se entrega desde las personas que se presentaron y construyeron. Os vemos. 🫡</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: el espacio de trabajo de diseño todo en uno</a> — la versión de una sola ventana que esta abre</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: diseño para todos</a> — la versión de instalar y crear que está debajo de la bienvenida</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: todo es un plugin</a> — el motor de plugins sobre el que está construida la galería</li>
      </ul>
  pt-br:
    title: 'Open Design 0.11.0: o Bazar'
    summary: 'Tag open-design-v0.11.0 — 137 PRs de 57 contribuidores em quatro dias. Codinome "o Bazar". A galeria de plugins agora reproduz um clipe ao vivo de cada saída real, qualquer agente de programação que você já usa simplesmente se encaixa, e a primeira execução de um recém-chegado é um acolhimento guiado em vez de um portão trancado.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.11.0</code>, lançada em 17 de junho de 2026. <strong>137 PRs de 57 contribuidores em quatro dias.</strong> Codinome "o Bazar". Uma catedral é construída em segredo por uns poucos escolhidos; um bazar é construído à vista de todos, por todo mundo, tudo de uma vez — e esta versão transforma o Open Design no bazar. Entre, percorra as barracas, pegue o que chamar sua atenção e torne-o seu.</p>
      <p>Se você quer a versão longa, as <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">notas de versão no GitHub</a> têm tudo. Este post é a versão curta: o que se abriu nesta versão, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Uma galeria que finalmente se exibe</h2>
      <p>Uma miniatura sem vida obriga você a adivinhar. A galeria do 0.11.0 não — <strong>cada cartão de plugin e página de detalhes agora reproduz um clipe ao vivo da saída real</strong>, para que você veja o que um deck ou template realmente faz antes de escolhê-lo.</p>
      <p>As prateleiras também estão cheias. Todos os <strong>56 decks oficiais</strong> ganharam uma repaginada fiel à marca, unificada em torno de uma única narrativa de produto, <strong>23 kits de slides da comunidade</strong> extraídos das melhores skills de slides open-source entraram nas fileiras, e os templates de vídeo HyperFrames estão novinhos. Os decks da comunidade agora aparecem direto na tela Home, com pré-visualizações 16:9 sem tarjas. Percorra as fileiras, aperte play, pegue o que você gosta e crie a partir dali.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Uma parede de cartões da galeria de plugins dispostos em grade, cada cartão reproduzindo um pequeno clipe de pré-visualização ao vivo, com um cartão erguido e contido dentro de um quadro de seleção verde, sobre um fundo editorial quase branco" />
        <figcaption>Cada cartão reproduz um clipe ao vivo da saída real — percorra, aperte play, torne-o seu.</figcaption>
      </figure>

      <h2>Traga o agente de programação que você já usa</h2>
      <p>O Open Design nunca teve a ver com prender você a uma única ferramenta, e esta versão abre a porta ainda mais. <strong>Qualquer agente de programação que você já integrou ao seu dia agora se encaixa bem ao lado do Claude.</strong></p>
      <p>Dois adaptadores totalmente novos chegam para o <strong>Amp</strong> e o <strong>Codebuddy Code</strong>, o runtime do <strong>Kimi Code</strong> foi corrigido, o <strong>Codex</strong> ganha mídia por assinatura, o <strong>Antigravity</strong> é suportado, o teto do <strong>GitHub Copilot</strong> ficou mais espaçoso, e o <code>reasonix</code> 1.x recebe seu ambiente MCP. Qualquer fornecedor pode montar sua barraca — você nunca precisa trocar a ferramenta em que confia para usar o espaço de trabalho ao redor dela.</p>

      <h2>Um acolhimento, não um muro</h2>
      <p>Uma primeira execução costumava jogar você em um painel de controle. No 0.11.0, em vez disso, ela é <strong>um caminho guiado.</strong> Uma etapa Connect com bloqueio agora vem com uma dica de contexto que explica <em>por que</em> ela está bloqueada, um passo a passo sequencial e limpo conduz você pela configuração, as verificações automáticas de BYOK e a detecção de CLI estão mais inteligentes, e o flash perturbador da tela inicial antes mesmo de a integração começar acabou.</p>
      <p>O resultado é que os primeiros cinco minutos parecem um convite, e não um portão trancado — um recém-chegado pode entrar direto da rua e chegar à sua primeira execução de verdade sem esbarrar em um muro.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="Um portal aberto com uma fileira sequencial e limpa de etapas de integração levando para dentro, com a etapa ativa contida dentro de um quadro de seleção verde, sobre um fundo editorial quase branco" />
        <figcaption>A integração agora é uma sequência guiada — um acolhimento, não um portão trancado.</figcaption>
      </figure>

      <h2>O build mais estável até agora</h2>
      <p>Esta é a maior leva de estabilidade que o Open Design já lançou. A janela do desktop <strong>se cura sozinha</strong> quando o renderizador morre ou um carregamento falha, as execuções <strong>nunca travam</strong> esperando por uma pergunta, e a <strong>pré-visualização para de recarregar por baixo de você</strong> enquanto você marca, captura telas ou comenta. Um vazamento de descritor de arquivo foi tampado, o atualizador para de girar com atraso zero, e uma longa cauda de falhas em diálogos, seletores e capturas de tela acabou. O build que você deixa aberto o dia todo simplesmente <em>permanece de pé.</em></p>
      <p>Mais duas arestas foram aparadas na mesma leva. <strong>Suas próprias chaves param de brigar com você</strong> — o bloqueio de chave do Composio agora é um clique em vez de um beco sem saída, os modelos Gemini BYOK acompanham a API atual (o 2.0 desativado sai, o 3.x entra), e a troca de modelo no compositor finalmente fica. E <strong>nada vaza</strong> — o tratamento de URLs de pré-visualização foi reforçado e o servidor de pré-visualização local se vincula ao <strong>loopback</strong> por padrão, de modo que uma pré-visualização de projeto nunca escapa para a sua rede.</p>

      <h2>O que mais chega no 0.11.0</h2>
      <p>A versão é ampla. Mais algumas partes que vale a pena destacar:</p>
      <ul>
        <li><strong>O Open Design agora tem um lar de verdade na web.</strong> Páginas de design para todos os <strong>21 agentes suportados</strong>, um conjunto completo de páginas de confiança (sobre, FAQ, privacidade, termos, um 404 de verdade) com um rodapé reconstruído, um cartão de compartilhamento feito sob medida em todo o site para que cada link que você cola fique impecável, um blog reconstruído com sumário e i18n completo, e uma leva de SEO + UX em todas as páginas de plugins.</li>
        <li><strong>Dois novos tutoriais da comunidade</strong> para colocar os recém-chegados em ação.</li>
        <li><strong>Inicializações a frio mais rápidas.</strong> O carregamento de bootstrap do OpenCode agora é armazenado em cache para reduzir a espera na primeira execução.</li>
        <li><strong>Feito para crescer.</strong> Os formatos de contrato do sandbox e as proteções de propriedade foram fixados, as importações de raiz explícita são permitidas, e os espaços de trabalho temporários do orquestrador de modelos chegam — a base para o que vem a seguir.</li>
      </ul>
      <p>A lista completa chega a 137 PRs. As <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">notas de versão no GitHub</a> trazem o resto.</p>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você é…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o aplicativo desktop e siga o acolhimento guiado — a etapa Connect com bloqueio e o passo a passo sequencial conduzem você à sua primeira execução de verdade sem nenhum muro</td></tr>
          <tr><td>Já usa o Open Design</td><td>Deixe a atualização automática do pacote levar você ao 0.11.0, depois abra a galeria e aperte play — cada cartão agora pré-visualiza sua saída real</td></tr>
          <tr><td>Usando um agente de programação diferente</td><td>Integre o Amp, o Codebuddy Code, o Kimi, o Codex, o Antigravity ou o Copilot — aquele em que você já confia se encaixa ao lado do Claude</td></tr>
          <tr><td>Entregando um deck</td><td>Percorra os 56 decks oficiais e os 23 kits de slides da comunidade, pegue aquele cujo clipe ao vivo você gostar e torne-o seu</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>Um bazar só funciona se você puder entrar e começar a pegar as coisas. Baixe o aplicativo desktop, abra a galeria e deixe que um dos decks de pré-visualização ao vivo chame sua atenção — depois traga qualquer agente de programação que você já usa e torne-o seu.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>137 PRs em quatro dias, de 57 pessoas montando barracas à vista de todos. O bazar existe porque tantos contribuidores construíram em público — novos adaptadores, decks repaginados, um acolhimento mais suave — tudo de uma vez, onde todos podem ver. Um movimento não é lançado a partir dos laptops de uma única equipe; ele é lançado pelas pessoas que apareceram e construíram. Nós vemos você. 🫡</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: o espaço de trabalho de design tudo-em-um</a> — a versão de janela única que esta aqui abre</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design para todos</a> — a versão de instalar-e-criar por baixo do acolhimento</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: tudo é um plugin</a> — o motor de plugins sobre o qual a galeria é construída</li>
      </ul>
  it:
    title: 'Open Design 0.11.0: il Bazaar'
    summary: 'Tag open-design-v0.11.0 — 137 PR da 57 contributori in quattro giorni. Nome in codice "il Bazaar". La galleria di plugin ora riproduce una clip live di ogni output reale, qualunque coding agent tu già usi si aggancia all''istante, e la prima esecuzione di un nuovo arrivato è un benvenuto guidato invece di un cancello bloccato.'
    bodyHtml: |
      <p>Tag <code>open-design-v0.11.0</code>, rilasciato il 17 giugno 2026. <strong>137 PR da 57 contributori in quattro giorni.</strong> Nome in codice "il Bazaar". Una cattedrale viene costruita in privato da pochi eletti; un bazar viene costruito allo scoperto, da tutti, tutti insieme — e questa release trasforma Open Design nel bazar. Entra, scorri le bancarelle, prendi qualunque cosa ti colpisca e fallo tuo.</p>
      <p>Se vuoi la versione lunga, le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">note di rilascio su GitHub</a> ce l'hanno. Questo post è la versione breve: cosa si è aperto in questa release, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Una galleria che finalmente si mette in mostra</h2>
      <p>Una miniatura morta ti costringe a indovinare. La galleria in 0.11.0 no — <strong>ogni scheda di plugin e ogni pagina di dettaglio ora riproduce una clip live dell'output reale</strong>, così vedi cosa fa davvero un deck o un template prima di sceglierlo.</p>
      <p>Anche gli scaffali sono pieni. Tutti i <strong>56 deck ufficiali</strong> hanno ricevuto un restyling on-brand unificato attorno a un'unica narrazione di prodotto, <strong>23 kit di slide della community</strong> tratti dalle migliori slide skill open-source si sono aggiunti alle file, e i template video di HyperFrames sono freschi di giornata. I deck della community ora compaiono direttamente nella schermata Home con anteprime 16:9 senza bande nere. Scorri le file, premi play, prendi ciò che ti piace e rielaboralo.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Una parete di schede della galleria di plugin disposte in griglia, ognuna che riproduce una piccola clip di anteprima live, con una scheda sollevata e tenuta dentro una cornice di selezione verde, su uno sfondo editoriale quasi bianco" />
        <figcaption>Ogni scheda riproduce una clip live dell'output reale — sfoglia, premi play, fallo tuo.</figcaption>
      </figure>

      <h2>Porta il coding agent che già usi</h2>
      <p>Open Design non ha mai puntato a vincolarti a un solo strumento, e questa release allarga ulteriormente la porta. <strong>Qualunque coding agent tu abbia già integrato nella tua giornata ora si aggancia proprio accanto a Claude.</strong></p>
      <p>Arrivano due adattatori nuovi di zecca per <strong>Amp</strong> e <strong>Codebuddy Code</strong>, il runtime di <strong>Kimi Code</strong> è stato sistemato, <strong>Codex</strong> ottiene i media in abbonamento, <strong>Antigravity</strong> è supportato, il tetto di <strong>GitHub Copilot</strong> è più ampio, e <code>reasonix</code> 1.x riceve il suo env MCP. Qualsiasi vendor può aprire bottega — non devi mai cambiare lo strumento di cui ti fidi per usare lo spazio di lavoro che gli sta intorno.</p>

      <h2>Un benvenuto, non un muro</h2>
      <p>Una prima esecuzione ti scaricava in un pannello di controllo. In 0.11.0 è <strong>invece un percorso guidato.</strong> Uno step Connect bloccato ora arriva con un tooltip che spiega <em>perché</em> è bloccato, uno stepper sequenziale pulito ti accompagna nella configurazione, i controlli automatici BYOK e il rilevamento della CLI sono più intelligenti, e il fastidioso lampo della schermata home prima ancora che inizi l'onboarding è sparito.</p>
      <p>Il risultato è che i primi cinque minuti sembrano un invito piuttosto che un cancello bloccato — un nuovo arrivato può entrare dalla strada e arrivare alla sua prima esecuzione reale senza sbattere contro un muro.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="Un varco aperto con una pulita fila sequenziale di step di onboarding che conduce verso l'interno, lo step attivo tenuto dentro una cornice di selezione verde, su uno sfondo editoriale quasi bianco" />
        <figcaption>Ora l'onboarding è una sequenza guidata — un benvenuto, non un cancello bloccato.</figcaption>
      </figure>

      <h2>La build più stabile di sempre</h2>
      <p>Questa è la più grande revisione di stabilità che Open Design abbia mai rilasciato. La finestra desktop <strong>si auto-ripara</strong> quando il renderer muore o un caricamento fallisce, le esecuzioni <strong>non si bloccano mai</strong> in attesa di una domanda, e l'<strong>anteprima smette di ricaricarsi sotto i tuoi occhi</strong> mentre annoti, fai screenshot o commenti. Una perdita di file descriptor è tappata, l'updater smette di girare a vuoto a ritardo zero, e una lunga coda di glitch in dialog, picker e screenshot è sparita. La build che tieni aperta tutto il giorno semplicemente <em>resta su.</em></p>
      <p>Altri due bordi sono stati smussati nella stessa revisione. <strong>Le tue chiavi smettono di remarti contro</strong> — il gate della chiave Composio è un clic invece di un vicolo cieco, i modelli BYOK di Gemini seguono l'API attuale (fuori i 2.0 dismessi, dentro i 3.x), e il cambio di modello nel composer finalmente regge. E <strong>nulla trapela</strong> — la gestione degli URL di anteprima è irrobustita e il server di anteprima locale si lega al <strong>loopback</strong> per impostazione predefinita, così l'anteprima di un progetto non finisce mai a vagare sulla tua rete.</p>

      <h2>Cos'altro arriva in 0.11.0</h2>
      <p>La release è ampia. Ancora qualche pezzo che vale la pena mettere in primo piano:</p>
      <ul>
        <li><strong>Ora Open Design ha una vera casa sul web.</strong> Pagine di design per tutti i <strong>21 agent supportati</strong>, un set completo di pagine di fiducia (about, FAQ, privacy, termini, un vero 404) con un footer ricostruito, una share card costruita su misura in tutto il sito così ogni link che incolli appare curato, un blog ricostruito con un indice dei contenuti e i18n completo, e una revisione SEO + UX su tutte le pagine dei plugin.</li>
        <li><strong>Due nuovi tutorial della community</strong> per mettere in moto i nuovi arrivati.</li>
        <li><strong>Avvii a freddo più rapidi.</strong> Il caricamento del bootstrap di OpenCode è ora memorizzato in cache per ridurre l'attesa alla prima esecuzione.</li>
        <li><strong>Costruito per crescere.</strong> Le forme dei contratti sandbox e le guardie di ownership sono fissate, gli import a root esplicita sono consentiti, e arrivano gli spazi di lavoro scratch del model-orchestrator — le fondamenta per ciò che verrà dopo.</li>
      </ul>
      <p>L'elenco completo arriva a 137 PR. Le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">note di rilascio su GitHub</a> contengono il resto.</p>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Inizia qui</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuovo su Open Design</td><td>Scarica l'app desktop e segui il benvenuto guidato — lo step Connect bloccato e lo stepper sequenziale ti accompagnano alla tua prima esecuzione reale senza alcun muro</td></tr>
          <tr><td>Già in esecuzione con Open Design</td><td>Lascia che l'auto-aggiornamento incluso ti porti a 0.11.0, poi apri la galleria e premi play — ogni scheda ora mostra in anteprima il suo output reale</td></tr>
          <tr><td>Già su un altro coding agent</td><td>Integra Amp, Codebuddy Code, Kimi, Codex, Antigravity o Copilot — qualunque cosa di cui ti fidi già si aggancia accanto a Claude</td></tr>
          <tr><td>In procinto di consegnare un deck</td><td>Sfoglia i 56 deck ufficiali e i 23 kit di slide della community, prendi quello la cui clip live ti piace, e fallo tuo</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>Un bazar funziona solo se puoi entrare e iniziare a prendere le cose. Scarica l'app desktop, apri la galleria e lascia che uno dei deck con anteprima live ti catturi l'occhio — poi porta il coding agent che già usi e fallo tuo.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>137 PR in quattro giorni, da 57 persone che hanno aperto bancarelle allo scoperto. Il bazar esiste perché così tanti contributori hanno costruito in pubblico — nuovi adattatori, deck rinfrescati, un benvenuto più fluido — tutto in una volta, dove tutti possono vedere. Un movimento non viene rilasciato dai laptop di un solo team; viene rilasciato dalle persone che si sono presentate e hanno costruito. Vi vediamo. 🫡</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: lo spazio di lavoro per il design tutto-in-uno</a> — la release a finestra unica che questa apre</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design per tutti</a> — la release "installa-e-crea" che sta sotto al benvenuto</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: tutto è un plugin</a> — il motore di plugin su cui è costruita la galleria</li>
      </ul>
  tr:
    title: 'Open Design 0.11.0: Pazar Yeri'
    summary: 'Etiket open-design-v0.11.0 — dört günde 57 katkıda bulunandan 137 PR. Kod adı "Pazar Yeri." Eklenti galerisi artık her gerçek çıktının canlı bir klibini oynatıyor, hâlihazırda kullandığınız hangi kodlama agent''ı olursa olsun doğrudan yerine oturuyor ve yeni gelen birinin ilk çalıştırması kilitli bir kapı yerine rehberli bir karşılama oluyor.'
    bodyHtml: |
      <p>Etiket <code>open-design-v0.11.0</code>, 17 Haziran 2026'da yayınlandı. <strong>Dört günde 57 katkıda bulunandan 137 PR.</strong> Kod adı "Pazar Yeri." Bir katedral, seçilmiş birkaç kişi tarafından gizlice inşa edilir; bir pazar yeri ise açıkta, herkes tarafından, hep birlikte inşa edilir — ve bu sürüm Open Design'ı pazar yerine dönüştürüyor. İçeri girin, tezgâhlara göz atın, gözünüze ne çarparsa alın ve onu kendinizinki yapın.</p>
      <p>Uzun versiyonunu istiyorsanız, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub'daki sürüm notları</a> hepsini içeriyor. Bu yazı kısa versiyon: bu sürümde neler açıldı, bununla bugün ne yapabilirsiniz ve nereden başlamalısınız.</p>

      <h2>Sonunda hünerini sergileyen bir galeri</h2>
      <p>Ölü bir küçük resim, tahmin yürütmenize neden olur. 0.11.0'daki galeri buna mecbur bırakmıyor — <strong>her eklenti kartı ve detay sayfası artık gerçek çıktının canlı bir klibini oynatıyor</strong>, böylece bir sunumun ya da şablonun gerçekte ne yaptığını seçmeden önce görürsünüz.</p>
      <p>Raflar da dolu. <strong>56 resmi sunumun</strong> tamamı, tek bir ürün anlatısı etrafında birleşen markaya uygun bir yenilenme aldı, en iyi açık kaynak slayt becerilerinden derlenen <strong>23 topluluk slayt kiti</strong> sıralara katıldı ve HyperFrames video şablonları tertemiz. Topluluk sunumları artık letterbox'sız 16:9 önizlemelerle doğrudan Home ekranında görünüyor. Sıralara göz atın, oynat'a basın, beğendiğinizi alın ve üzerine bir şeyler katın.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="Bir ızgara hâlinde dizilmiş, her biri küçük bir canlı önizleme klibi oynatan eklenti galerisi kartlarından oluşan bir duvar; bir kartı dışarı çıkarılmış ve yeşil bir seçim çerçevesi içinde tutulmuş hâlde, neredeyse beyaz bir editöryel zemin üzerinde" />
        <figcaption>Her kart, gerçek çıktının canlı bir klibini oynatır — göz atın, oynat'a basın, onu kendinizinki yapın.</figcaption>
      </figure>

      <h2>Hâlihazırda kullandığınız kodlama agent'ını getirin</h2>
      <p>Open Design hiçbir zaman sizi tek bir araca kilitlemekle ilgili olmadı ve bu sürüm kapıyı daha da genişletiyor. <strong>Gününüze hâlihazırda dahil ettiğiniz hangi kodlama agent'ı olursa olsun, artık tam da Claude'un yanına oturuyor.</strong></p>
      <p><strong>Amp</strong> ve <strong>Codebuddy Code</strong> için iki yepyeni adaptör geliyor, <strong>Kimi Code</strong> çalışma zamanı düzeltildi, <strong>Codex</strong> abonelik medyası alıyor, <strong>Antigravity</strong> destekleniyor, <strong>GitHub Copilot</strong> tavanı daha ferah ve <code>reasonix</code> 1.x kendi MCP env'ini alıyor. Herhangi bir sağlayıcı tezgâhını kurabilir — etrafındaki çalışma alanını kullanmak için güvendiğiniz aracı asla değiştirmek zorunda kalmazsınız.</p>

      <h2>Bir duvar değil, bir karşılama</h2>
      <p>İlk çalıştırma eskiden sizi bir kontrol paneline bırakırdı. 0.11.0'da bunun yerine <strong>rehberli bir yol var.</strong> Kapılı bir Connect adımı artık <em>neden</em> kapılı olduğunu açıklayan bir ipucu balonuyla geliyor, temiz bir sıralı adımlayıcı sizi kurulum boyunca yönlendiriyor, BYOK otomatik kontrolleri ve CLI algılaması daha akıllı ve katılım daha başlamadan önceki o rahatsız edici ana ekran parlaması ortadan kalktı.</p>
      <p>Sonuç olarak ilk beş dakika, kilitli bir kapıdan çok bir davet gibi hissettiriyor — yeni gelen biri sokaktan içeri dalıp bir duvara toslamadan ilk gerçek çalıştırmasına ulaşabiliyor.</p>
      <figure>
        <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="İçeriye doğru ilerleyen, temiz ve sıralı bir katılım adımları dizisine sahip açık bir geçit; etkin adım yeşil bir seçim çerçevesi içinde tutuluyor, neredeyse beyaz bir editöryel zemin üzerinde" />
        <figcaption>Katılım artık rehberli bir sıralama — kilitli bir kapı değil, bir karşılama.</figcaption>
      </figure>

      <h2>Şimdiye kadarki en istikrarlı derleme</h2>
      <p>Bu, Open Design'ın yayınladığı en büyük istikrar iyileştirmesi. Masaüstü penceresi, oluşturucu çöktüğünde ya da bir yükleme başarısız olduğunda <strong>kendini iyileştiriyor</strong>, çalıştırmalar bir soruyu beklerken <strong>asla takılıp kalmıyor</strong> ve siz işaretleme yaparken, ekran görüntüsü alırken ya da yorum yazarken <strong>önizleme ayağınızın altından yeniden yüklenmeyi bırakıyor</strong>. Bir dosya tanımlayıcısı sızıntısı kapatıldı, güncelleyici sıfır gecikmeyle dönüp durmayı bıraktı ve uzun bir diyalog, seçici ve ekran görüntüsü hatası kuyruğu ortadan kalktı. Gün boyu açık tuttuğunuz derleme artık sadece <em>ayakta kalıyor.</em></p>
      <p>Aynı geçişte iki kenar daha pürüzsüzleştirildi. <strong>Kendi anahtarlarınız sizinle savaşmayı bırakıyor</strong> — Composio anahtar kapısı bir çıkmaz yerine tek tık, Gemini BYOK modelleri güncel API'yi takip ediyor (kapatılan 2.0 çıktı, 3.x girdi) ve besteci model değiştirme nihayet kalıcı oluyor. Ve <strong>hiçbir şey sızmıyor</strong> — önizleme URL işleme sağlamlaştırıldı ve yerel önizleme sunucusu varsayılan olarak <strong>loopback</strong>'e bağlanıyor, böylece bir proje önizlemesi asla ağınıza dağılmıyor.</p>

      <h2>0.11.0'da başka neler var</h2>
      <p>Sürüm geniş kapsamlı. Öne çıkarılmaya değer birkaç parça daha:</p>
      <ul>
        <li><strong>Open Design'ın artık web'de gerçek bir yuvası var.</strong> <strong>Desteklenen 21 agent'ın</strong> tamamı için tasarım sayfaları, yeniden inşa edilmiş bir alt bilgiyle birlikte eksiksiz bir güven sayfaları seti (hakkında, FAQ, gizlilik, koşullar, gerçek bir 404), yapıştırdığınız her bağlantının net görünmesi için site genelinde özel olarak tasarlanmış bir paylaşım kartı, içindekiler tablosu ve tam i18n'e sahip yeniden inşa edilmiş bir blog ve eklenti sayfaları genelinde bir SEO + UX iyileştirmesi.</li>
        <li>Yeni gelenleri yola koyacak <strong>iki yeni topluluk öğreticisi</strong>.</li>
        <li><strong>Daha hızlı soğuk başlatmalar.</strong> OpenCode önyükleme yüklemesi, ilk çalıştırmadaki bekleyişi azaltmak için artık önbelleğe alınıyor.</li>
        <li><strong>Büyümek için inşa edildi.</strong> Sandbox sözleşme şekilleri ve sahiplik korumaları sabitlendi, açık kök içe aktarmalarına izin verildi ve model orkestratörü taslak çalışma alanları geldi — sıradakiler için temel.</li>
      </ul>
      <p>Tam liste 137 PR'a ulaşıyor. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0">GitHub'daki sürüm notları</a> geri kalanını içeriyor.</p>

      <h2>Bununla bugün ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer şuysanız…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'da yeni</td><td>Masaüstü uygulamasını indirin ve rehberli karşılamayı izleyin — kapılı Connect adımı ve sıralı adımlayıcı, bir duvara toslamadan ilk gerçek çalıştırmanıza kadar size eşlik eder</td></tr>
          <tr><td>Zaten Open Design kullanıyor</td><td>Paketlenmiş otomatik güncellemenin sizi 0.11.0'a getirmesine izin verin, ardından galeriyi açın ve oynat'a basın — her kart artık gerçek çıktısını önizliyor</td></tr>
          <tr><td>Farklı bir kodlama agent'ı kullanıyor</td><td>Amp, Codebuddy Code, Kimi, Codex, Antigravity ya da Copilot'u bağlayın — hâlihazırda güvendiğiniz her ne ise Claude'un yanına oturur</td></tr>
          <tr><td>Bir sunum gönderiyor</td><td>56 resmi sunuma ve 23 topluluk slayt kitine göz atın, canlı klibini beğendiğinizi alın ve onu kendinizinki yapın</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne yapmalı</h2>
      <p>Bir pazar yeri ancak içeri girip bir şeyler almaya başlayabiliyorsanız işe yarar. Masaüstü uygulamasını indirin, galeriyi açın ve canlı önizlemeli sunumlardan birinin gözünüze çarpmasına izin verin — sonra hâlihazırda kullandığınız hangi kodlama agent'ı olursa olsun getirin ve onu kendinizinki yapın.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indirin</a>.</p>
      <p>Dört günde 137 PR, açıkta tezgâh kuran 57 kişiden. Pazar yeri var çünkü pek çok katkıda bulunan herkesin görebileceği bir yerde, hep birlikte açıkça inşa etti — yeni adaptörler, tazelenmiş sunumlar, daha sorunsuz bir karşılama. Bir hareket tek bir ekibin dizüstü bilgisayarlarından çıkmaz; ortaya çıkıp inşa eden insanlardan çıkar. Sizi görüyoruz. 🫡</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-10-0-all-in-one-workspace/">Open Design 0.10.0: hepsi bir arada tasarım çalışma alanı</a> — bunun açtığı tek pencere sürümü</li>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: herkes için tasarım</a> — karşılamanın altındaki kur-ve-yarat sürümü</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: her şey bir eklenti</a> — galerinin üzerine inşa edildiği eklenti motoru</li>
      </ul>
---

Tag `open-design-v0.11.0`, shipped 17 June 2026. **137 PRs from 57 contributors in four days.** Codename "the Bazaar." A cathedral is built in private by a chosen few; a bazaar is built in the open, by everyone, all at once — and this release turns Open Design into the bazaar. Walk in, browse the stalls, pick up whatever catches your eye, and make it yours.

If you want the long version, the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0) have it. This post is the short version: what opened up in this release, what you can do with it today, and where to start.

## A gallery that finally shows off

A dead thumbnail makes you guess. The gallery in 0.11.0 doesn't — **every plugin card and detail page now plays a live clip of the real output**, so you see what a deck or template actually does before you pick it.

The shelves are full, too. All **56 official decks** got an on-brand glow-up unified around one product narrative, **23 community slide kits** drawn from the best open-source slide skills joined the rows, and the HyperFrames video templates are fresh. Community decks now surface right on the Home screen with letterbox-free 16:9 previews. Browse the rows, hit play, grab what you like, and riff on it.

<figure>
  <img src="/blog/open-design-0-11-0-the-bazaar-gallery.webp" alt="A warm editorial illustration of an app window holding a grid of preview cards, each a small thumbnail with a play triangle, one card lifted forward, on a cream paper ground with soft plants" />
  <figcaption>Every card plays a live clip of the real output — browse, hit play, make it yours.</figcaption>
</figure>

## Bring the coding agent you already use

Open Design has never been about locking you into one tool, and this release widens the door further. **Whatever coding agent you already wired into your day now snaps in right beside Claude.**

Two brand-new adapters land for **Amp** and **Codebuddy Code**, the **Kimi Code** runtime is fixed, **Codex** gets subscription media, **Antigravity** is supported, the **GitHub Copilot** ceiling is roomier, and `reasonix` 1.x gets its MCP env. Any vendor can set up shop — you never have to switch the tool you trust to use the workspace around it.

## A welcome, not a wall

A first run used to drop you into a control panel. In 0.11.0 it's **a guided path instead.** A gated Connect step now comes with a tooltip that explains *why* it's gated, a clean sequential stepper walks you through setup, BYOK auto-checks and CLI detection are smarter, and the jarring home-screen flash before onboarding even starts is gone.

The result is that the first five minutes feel like an invitation rather than a locked gate — a newcomer can wander in off the street and get to their first real run without hitting a wall.

<figure>
  <img src="/blog/open-design-0-11-0-the-bazaar-welcome.webp" alt="A warm editorial illustration of an open archway with a gentle path of stepping-stone dots leading inward and a small figure stepping in, on a cream paper ground" />
  <figcaption>Onboarding is a guided sequence now — a welcome, not a locked gate.</figcaption>
</figure>

## The steadiest build yet

This is the biggest stability pass Open Design has shipped. The desktop window **heals itself** when the renderer dies or a load fails, runs **never hang** waiting on a question, and the **preview stops reloading out from under you** while you mark up, screenshot, or comment. A file-descriptor leak is plugged, the updater stops spinning at zero delay, and a long tail of dialog, picker, and screenshot glitches is gone. The build you keep open all day just *stays up.*

Two more edges got smoothed in the same pass. **Your own keys stop fighting you** — the Composio key gate is one click instead of a dead end, Gemini BYOK models track the current API (shut-down 2.0 out, 3.x in), and composer model switching finally sticks. And **nothing leaks** — preview URL handling is hardened and the local preview server binds to **loopback** by default, so a project preview never wanders onto your network.

## What else lands in 0.11.0

The release is wide. A few more pieces worth pulling forward:

- **Open Design has a real home on the web now.** Design pages for all **21 supported agents**, a full set of trust pages (about, FAQ, privacy, terms, a real 404) with a rebuilt footer, a purpose-built share card site-wide so every link you paste looks sharp, a rebuilt blog with a table of contents and full i18n, and an SEO + UX pass across the plugin pages.
- **Two new community tutorials** to get newcomers rolling.
- **Faster cold starts.** OpenCode bootstrap loading is now cached to cut the wait on the first run.
- **Built to grow.** Sandbox contract shapes and ownership guards are pinned, explicit-root imports are allowed, and model-orchestrator scratch workspaces land — the groundwork for what comes next.

The full list runs to 137 PRs. The [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.11.0) carry the rest.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app and follow the guided welcome — the gated Connect step and sequential stepper walk you to your first real run without a wall |
| Already running Open Design | Let the packaged auto-update bring you to 0.11.0, then open the gallery and hit play — every card now previews its real output |
| Using a different coding agent | Wire in Amp, Codebuddy Code, Kimi, Codex, Antigravity, or Copilot — whatever you already trust snaps in beside Claude |
| Shipping a deck | Browse the 56 official decks and 23 community slide kits, grab the one whose live clip you like, and make it yours |

## What to do next

A bazaar only works if you can walk in and start picking things up. Download the desktop app, open the gallery, and let one of the live-preview decks catch your eye — then bring whatever coding agent you already use and make it yours.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

137 PRs in four days, from 57 people setting up stalls in the open. The bazaar exists because so many contributors built in public — new adapters, refreshed decks, a smoother welcome — all at once, where everyone can see. A movement doesn't ship from one team's laptops; it ships from the people who showed up and built. We see you. 🫡

## Related reading

- [Open Design 0.10.0: the all-in-one design workspace](/blog/open-design-0-10-0-all-in-one-workspace/) — the one-window release this one opens up
- [Open Design 0.9.0: design for everyone](/blog/open-design-0-9-0-design-for-everyone/) — the install-and-create release underneath the welcome
- [Open Design 0.8.0: everything is a plugin](/blog/open-design-0-8-0-everything-is-a-plugin/) — the plugin engine the gallery is built on
