---
title: "Open Design 0.9.0: design for everyone"
date: 2026-06-02
category: "Product"
readingTime: 6
summary: "Open Design 0.9.0 is the install-and-create release. No API-key scavenger hunt, no three-CLI setup — open the app, sign in once, pick a model, and start building. Plus a bigger agent bench, a real plugin library, and easier installs on Windows and Linux."
i18n:
  zh:
    title: "Open Design 0.9.0:设计,给每一个人"
    summary: "Open Design 0.9.0 是「装完即创作」的版本。不用再到处找 API key,不用装三个 CLI——打开应用、登录一次、选一个模型,就能开始做东西。再加上更大的 agent 阵容、一个真正的插件库,以及在 Windows 和 Linux 上更顺的安装。"
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>,于 2026 年 6 月 2 日发布。<strong>7 天里 310 个 PR,98 位贡献者。</strong>代号「Design for everyone」——这是我们的<strong>「装完即创作」版本</strong>。前面三个版本,我们一直在请你「先干活,才能干活」:装一个 CLI、找一个 API key、粘贴密钥、测认证、从一份得现查的列表里挑对模型名。每一步,都是有人在真正做出第一个东西之前就放弃的地方。</p>
      <p>0.9.0 把这些步骤删掉了。</p>
      <p>如果你想看长版本,<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub 上的发布说明</a>有全部细节。这篇是短版本:底层改了什么、今天能拿它做什么、以及从哪开始。</p>

      <h2>为什么是「上手」这件事</h2>
      <p>设计工具的第一印象,几乎从不发生在画布上,而发生在画布之前——那段没人愿意经历的配置环节。我们盯着自己的 onboarding 漏斗看了很久,结论很扎心:大量的人在做出任何东西<em>之前</em>就走了。不是因为产品不行,是因为「开始」本身太贵。</p>
      <p>0.9.0 把开始这件事,砍成了人们真正想要的那一句话:</p>
      <blockquote><strong>打开应用 → 登录一次 → 选一个模型 → 开始创作。</strong></blockquote>
      <p>不用配置。不用装 CLI。不需要 API key。</p>

      <h2>三块主线</h2>
      <p><strong>Open Design AMR——官方 AI,装完就在。</strong>过去「开始」是一种税:装 CLI、翻 API key、粘密钥、测认证、跟 shell 较劲,然后才轮到设计。0.9.0 把 <a href="https://open-design.ai/amr">Open Design AMR</a> 直接做进了安装包——AI 引擎随安装器一起来,不用再单独装 CLI 或配 key。onboarding 现在以 AMR 打头,桌面端登录永远是一键的距离,可用模型自动保持最新,账户和余额状态就在界面上。图片附件开箱即用。登录一次,选个模型,就走。</p>
      <p><strong>agent 阵容大了一圈。</strong>Aider、Trae CLI、Antigravity、DeepSeek Reasonix 全都进了选择器,给到的是更多<em>真实的</em>本地 agent 路径,而不是一条被钦定的工作流。Aider 拿到了一等公民级的品牌呈现,Trae 通过 ACP 在 yolo 模式下跑,这些新 adapter 让 Open Design 越来越不像「一个 agent 集成」,而更像「agent 们来干活的地方」。模型选择也不再像翻电话本:列表里能直接搜,Settings 和行内切换器共享同一份 BYOK 目录,切模型变得快而不是磨叽。</p>
      <p><strong>skill 变成了一个真正的插件生态。</strong>skill bundle 现在正式毕业成一等公民的 Plugins:在抽屉里看得见、能从 CLI 列出来、在站点上被索引,也更好向用户解释。一套扩展模型、一个库、一种心智模型。官方 GSAP 插件把正经的 web 动画带进了 agent 循环;Research Decision Room 把研究类提示词变成结构化的多角色评审,而不是一长段答案。站点上的插件库现在跟应用内的分类对齐、按各语言原生阅读,插件和模板的详情页也从静态列表变成了能真正动手的发现面——预览、安装、试用、分享。</p>

      <h2>0.9.0 还带来了什么</h2>
      <p>这个版本很宽。值得拎出来的几块:</p>
      <ul>
        <li><strong>边出片边对话。</strong>模型还在跑的时候就能把下一句排队发出去,当前这轮一结束,Open Design 立刻接上。Studio 和 Draw 也走同一套流程——记下一个念头,不再得等上一条回复结束。</li>
        <li><strong>设计系统从文件变成活资产。</strong>可以重命名、把自己的钉到最上面、从颜色表里读出真实色板,还能把设计系统项目直接连到 GitHub,不用再来回倒腾 zip。</li>
        <li><strong>评审能跟着产物一起动。</strong>评论模式支持附件、实时预览更新、干净的取消选中——截图和批注始终挂在作品上,而不是把评审流程冻住。</li>
        <li><strong>自动化感觉像被排程,而不是被脚本。</strong>真正的时间选择器、自然语言摘要、最新优先排序、创建后自动聚焦、本地化、重复槽位清理,让自动化更值得信任。</li>
        <li><strong>MCP 客户端能干真正的工作区活了。</strong>写文件、删文件、删项目、解析当前项目目录、跑生成循环、一键 bootstrap Codex——外部客户端现在能参与到 Open Design 的工作区里,而不只是旁观。</li>
        <li><strong>在 Windows 和 Linux 上试用更容易了。</strong>Windows 多了一条免安装的 portable zip 路径;Linux 有了 Docker / Podman Compose 一键启动。安装摩擦更小,首跑更快。</li>
      </ul>
      <p>完整清单是 310 个 PR。<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub 上的发布说明</a>装着其余的部分。</p>

      <h2>今天拿它做什么</h2>
      <table>
        <thead><tr><th>如果你是…</th><th>从这开始</th></tr></thead>
        <tbody>
          <tr><td>第一次用 Open Design</td><td>下载桌面应用,用 AMR 登录一次,选个模型,直接发第一条提示词——这一版整条路上没有 API key 这一步</td></tr>
          <tr><td>已经在跑 Open Design</td><td>让打包好的自动更新把你带到 0.9.0;之后 onboarding 会以 AMR 打头</td></tr>
          <tr><td>已经在终端里驱动 Claude Code、Codex、Aider 或 Trae</td><td>把它们指向桌面应用自带的同一个 OD CLI,你已有的 agent 就是设计引擎,skill 层在不引入新应用的前提下补上品味和结构</td></tr>
          <tr><td>在 Windows 或 Linux 上</td><td>抓 Windows portable zip,或用 Linux 的 Docker / Podman Compose 一键起——不碰系统安装器也能首跑</td></tr>
        </tbody>
      </table>

      <h2>接下来</h2>
      <p>如果你一直在等「装完就能创作」这件事真的成立,这就是那个版本。下载桌面应用,用 AMR 登录,跑一个你本来要做的简报——从打开应用到第一个产物之间,这一次没有配置环节。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>310 个 PR,7 天。这个「装完即创作」的版本之所以存在,是因为那么多人从那么多不同的角度出现、补上了缺失的那一块。一场运动不是从一个团队的笔记本里发出去的,是从那些到场、动手造出零件的人手里发出去的。我们看见你们了。🫡</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0:一切皆插件</a>——0.9.0 这一版立在其上的引擎重写</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">为什么我们把 Open Design 做成 skill 层,而不是一个产品</a>——「是层,不是产品」这个押注背后更长的宣言</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design 的开源替代方案</a>——这一版落在 agent 原生设计版图里的位置</li>
      </ul>
  zh-tw:
    title: "Open Design 0.9.0：設計，給每一個人"
    summary: "Open Design 0.9.0 是「裝完即創作」的版本。不用再到處找 API key，不用裝三個 CLI——打開應用程式、登入一次、選一個模型，就能開始做東西。再加上更大的 agent 陣容、一個真正的外掛程式庫，以及在 Windows 和 Linux 上更順的安裝體驗。"
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>，於 2026 年 6 月 2 日發布。<strong>7 天裡 310 個 PR，98 位貢獻者。</strong>代號「Design for everyone」——這是我們的<strong>「裝完即創作」版本</strong>。前面三個版本，我們一直在請你「先幹活，才能幹活」：裝一個 CLI、找一個 API key、貼上密鑰、測認證、從一份得現查的清單裡挑對模型名稱。每一步，都是有人在真正做出第一個東西之前就放棄的地方。</p>
      <p>0.9.0 把這些步驟刪掉了。</p>
      <p>如果你想看長版本，<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub 上的發布說明</a>有全部細節。這篇是短版本：底層改了什麼、今天能拿它做什麼、以及從哪開始。</p>

      <h2>為什麼是「上手」這件事</h2>
      <p>設計工具的第一印象，幾乎從不發生在畫布上，而發生在畫布之前——那段沒人願意經歷的設定環節。我們盯著自己的 onboarding 漏斗看了很久，結論很扎心：大量的人在做出任何東西<em>之前</em>就走了。不是因為產品不行，是因為「開始」本身太貴。</p>
      <p>0.9.0 把開始這件事，砍成了人們真正想要的那一句話：</p>
      <blockquote><strong>打開應用程式 → 登入一次 → 選一個模型 → 開始創作。</strong></blockquote>
      <p>不用設定。不用裝 CLI。不需要 API key。</p>

      <h2>三塊主線</h2>
      <p><strong>Open Design AMR——官方 AI，裝完就在。</strong>過去「開始」是一種稅：裝 CLI、翻 API key、貼密鑰、測認證、跟 shell 較勁，然後才輪到設計。0.9.0 把 <a href="https://open-design.ai/amr">Open Design AMR</a> 直接做進了安裝包——AI 引擎隨安裝器一起來，不用再單獨裝 CLI 或配 key。onboarding 現在以 AMR 打頭，桌面端登入永遠是一鍵的距離，可用模型自動保持最新，帳戶和餘額狀態就在介面上。圖片附件開箱即用。登入一次，選個模型，就走。</p>
      <p><strong>agent 陣容大了一圈。</strong>Aider、Trae CLI、Antigravity、DeepSeek Reasonix 全都進了選擇器，給到的是更多<em>真實的</em>本地 agent 路徑，而不是一條被欽定的工作流程。Aider 拿到了一等公民級的品牌呈現，Trae 透過 ACP 在 yolo 模式下跑，這些新 adapter 讓 Open Design 越來越不像「一個 agent 整合」，而更像「agent 們來幹活的地方」。模型選擇也不再像翻電話簿：清單裡能直接搜尋，Settings 和行內切換器共享同一份 BYOK 目錄，切模型變得快而不是磨蹭。</p>
      <p><strong>skill 變成了一個真正的外掛程式生態。</strong>skill bundle 現在正式畢業成一等公民的 Plugins：在抽屜裡看得見、能從 CLI 列出來、在站點上被索引，也更好向使用者解釋。一套擴充模型、一個程式庫、一種心智模型。官方 GSAP 外掛程式把正經的 web 動畫帶進了 agent 迴圈；Research Decision Room 把研究類提示詞變成結構化的多角色評審，而不是一長段答案。站點上的外掛程式庫現在跟應用程式內的分類對齊、按各語言原生閱讀，外掛程式和範本的詳情頁也從靜態清單變成了能真正動手的探索面——預覽、安裝、試用、分享。</p>

      <h2>0.9.0 還帶來了什麼</h2>
      <p>這個版本很寬。值得拎出來的幾塊：</p>
      <ul>
        <li><strong>邊出片邊對話。</strong>模型還在跑的時候就能把下一句排隊發出去，當前這輪一結束，Open Design 立刻接上。Studio 和 Draw 也走同一套流程——記下一個念頭，不再得等上一條回覆結束。</li>
        <li><strong>設計系統從檔案變成活資產。</strong>可以重新命名、把自己的釘到最上面、從顏色表裡讀出真實色票，還能把設計系統專案直接連到 GitHub，不用再來回倒騰 zip。</li>
        <li><strong>評審能跟著產物一起動。</strong>評論模式支援附件、即時預覽更新、乾淨的取消選取——截圖和批註始終掛在作品上，而不是把評審流程凍住。</li>
        <li><strong>自動化感覺像被排程，而不是被腳本。</strong>真正的時間選擇器、自然語言摘要、最新優先排序、建立後自動聚焦、本地化、重複槽位清理，讓自動化更值得信任。</li>
        <li><strong>MCP 客戶端能幹真正的工作區活了。</strong>寫檔案、刪檔案、刪專案、解析當前專案目錄、跑生成迴圈、一鍵 bootstrap Codex——外部客戶端現在能參與到 Open Design 的工作區裡，而不只是旁觀。</li>
        <li><strong>在 Windows 和 Linux 上試用更容易了。</strong>Windows 多了一條免安裝的 portable zip 路徑；Linux 有了 Docker / Podman Compose 一鍵啟動。安裝摩擦更小，首跑更快。</li>
      </ul>
      <p>完整清單是 310 個 PR。<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub 上的發布說明</a>裝著其餘的部分。</p>

      <h2>今天拿它做什麼</h2>
      <table>
        <thead><tr><th>如果你是…</th><th>從這開始</th></tr></thead>
        <tbody>
          <tr><td>第一次用 Open Design</td><td>下載桌面應用程式，用 AMR 登入一次，選個模型，直接發第一條提示詞——這一版整條路上沒有 API key 這一步</td></tr>
          <tr><td>已經在跑 Open Design</td><td>讓打包好的自動更新把你帶到 0.9.0；之後 onboarding 會以 AMR 打頭</td></tr>
          <tr><td>已經在終端機裡驅動 Claude Code、Codex、Aider 或 Trae</td><td>把它們指向桌面應用程式自帶的同一個 OD CLI，你已有的 agent 就是設計引擎，skill 層在不引入新應用程式的前提下補上品味和結構</td></tr>
          <tr><td>在 Windows 或 Linux 上</td><td>抓 Windows portable zip，或用 Linux 的 Docker / Podman Compose 一鍵起——不碰系統安裝器也能首跑</td></tr>
        </tbody>
      </table>

      <h2>接下來</h2>
      <p>如果你一直在等「裝完就能創作」這件事真的成立，這就是那個版本。下載桌面應用程式，用 AMR 登入，跑一個你本來要做的簡報——從打開應用程式到第一個產物之間，這一次沒有設定環節。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下載 Open Design</a>。</p>
      <p>310 個 PR，7 天。這個「裝完即創作」的版本之所以存在，是因為那麼多人從那麼多不同的角度出現、補上了缺失的那一塊。一場運動不是從一個團隊的筆電裡發出去的，是從那些到場、動手造出零件的人手裡發出去的。我們看見你們了。🫡</p>

      <h2>延伸閱讀</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0：一切皆外掛程式</a>——0.9.0 這一版立在其上的引擎重寫</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">為什麼我們把 Open Design 做成 skill 層，而不是一個產品</a>——「是層，不是產品」這個押注背後更長的宣言</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design 的開源替代方案</a>——這一版落在 agent 原生設計版圖裡的位置</li>
      </ul>
  ja:
    title: "Open Design 0.9.0:すべての人のためのデザイン"
    summary: "Open Design 0.9.0 は「インストールしたらすぐ作れる」リリースです。API キーを探し回る必要も、3 つの CLI をセットアップする必要もありません。アプリを開き、一度サインインし、モデルを選んで、作り始めるだけ。さらに、より充実した agent の布陣、本格的なプラグインライブラリ、そして Windows と Linux でのよりスムーズなインストールも。"
    bodyHtml: |
      <p>タグ <code>open-design-v0.9.0</code>、2026 年 6 月 2 日にリリース。<strong>7 日間で 98 人のコントリビューターによる 310 件の PR。</strong>コードネームは「Design for everyone」——これは<strong>「インストールしたらすぐ作れる」リリース</strong>です。これまでの 3 つのリリースでは、作業をするためにまず作業をしてくださいとお願いしていました。CLI をインストールし、API キーを探し、シークレットを貼り付け、認証をテストし、いちいち調べないとわからないリストから正しいモデル名を選ぶ。そのどのステップも、誰かが何かを作る前に離脱してしまう場所でした。</p>
      <p>0.9.0 はそれらのステップを削除します。</p>
      <p>詳しいバージョンが知りたい場合は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub のリリースノート</a>にすべて載っています。この記事は短いバージョンです。内部で何が変わったのか、今日それで何ができるのか、そしてどこから始めればいいのか。</p>

      <h2>なぜ「使い始めること」自体が作業だったのか</h2>
      <p>デザインツールの第一印象は、ほとんどの場合キャンバス上では生まれません。それはキャンバスの前——誰もやりたがらないセットアップの中で生まれます。私たちは自分たちの onboarding ファネルを十分に長く見つめ、居心地の悪い結論にたどり着きました。多くの人が何かを作る<em>前に</em>離れていたのです。製品が間違っていたからではなく、「始める」コストが高すぎたからでした。</p>
      <p>0.9.0 は、始めることを、人々が本当に求めていたあの一文にまで削ぎ落としました。</p>
      <blockquote><strong>アプリを開く → 一度サインインする → モデルを選ぶ → 作り始める。</strong></blockquote>
      <p>設定は不要。CLI のインストールも不要。API キーも不要です。</p>

      <h2>3 つの柱</h2>
      <p><strong>Open Design AMR——公式 AI、インストールした瞬間にそこにある。</strong>かつて「始めること」は一種の税金でした。CLI をインストールし、API キーを探し出し、シークレットを貼り付け、認証をテストし、シェルと格闘し——そこでようやくデザインに取りかかれる。0.9.0 はインストーラーの中に <a href="https://open-design.ai/amr">Open Design AMR</a> を同梱しました。AI エンジンがアプリと一緒に届くので、別途 CLI や API キーをセットアップする必要はありません。onboarding は今や AMR で始まり、デスクトップでのサインインは常にワンクリックの距離にあり、利用可能なモデルは自動的に最新に保たれ、アカウントと残高のステータスは UI 上にそのまま表示されます。画像の添付も箱から出してすぐ使えます。一度サインインし、モデルを選んで、進むだけ。</p>
      <p><strong>agent の布陣がぐっと大きくなった。</strong>Aider、Trae CLI、Antigravity、DeepSeek Reasonix がすべてセレクターに加わり、唯一の選ばれたワークフローではなく、より多くの<em>本物の</em>ローカル agent の道筋を提供します。Aider は一級市民レベルのブランディングを得て、Trae は ACP 経由で yolo モードで動作します。これらの新しい adapter によって、Open Design は「一つの agent を統合したもの」というより「agent たちが働きに来る場所」へと近づいていきます。モデル選びも電話帳をめくるような感覚ではなくなりました。検索で長いリストを切り抜けられ、共有された BYOK カタログによって Settings とインラインの切り替え器が揃うので、モデルの切り替えはもたつかず速くなります。</p>
      <p><strong>skill が本格的なプラグインエコシステムになった。</strong>skill bundle は正式に一級市民の Plugins へと卒業しました。ドロワーで見え、CLI から一覧でき、サイト上でインデックスされ、ユーザーにも説明しやすくなりました。一つの拡張モデル、一つのライブラリ、一つのメンタルモデルです。公式 GSAP プラグインは本格的な web アニメーションを agent ループの中に持ち込み、Research Decision Room はリサーチ系のプロンプトを、一続きの長い回答ではなく、構造化された複数ロールのレビューへと変えます。サイト上のプラグインライブラリは今やアプリ内の分類と揃い、各言語でネイティブに読めるようになりました。プラグインとテンプレートの詳細ページも、静的な一覧から実際に手を動かせる発見の場へと変わりました——プレビュー、インストール、お試し、共有。</p>

      <h2>0.9.0 がほかに何をもたらすか</h2>
      <p>このリリースは幅広いものです。取り上げる価値のあるいくつかを。</p>
      <ul>
        <li><strong>出力しながら対話を続ける。</strong>モデルがまだ動いている最中に次の発言をキューに入れておけて、今のターンが終わった瞬間に Open Design がすぐに続けます。Studio と Draw も同じ流れに従うので、アイデアを書き留めるのに前の返答が終わるのを待つ必要はありません。</li>
        <li><strong>デザインシステムがファイルから生きた資産へ。</strong>名前を変えたり、自分のものを一番上にピン留めしたり、カラーテーブルから本物の色見本を読み出したりでき、さらにデザインシステムプロジェクトを GitHub に直接つなげられるので、zip ファイルを行ったり来たり運ぶ必要はありません。</li>
        <li><strong>成果物が変わってもレビューが動き続ける。</strong>コメントモードが添付、ライブプレビューの更新、きれいな選択解除に対応し、スクリーンショットとメモが作品に貼り付いたままになるので、フローが凍りつくことはありません。</li>
        <li><strong>自動化がスクリプトではなくスケジュールのように感じられる。</strong>本物のピッカー、自然言語の要約、新しいもの優先の並び順、作成後の自動フォーカス、ローカライズ、重複スロットの掃除によって、自動化がより信頼できるものになります。</li>
        <li><strong>MCP クライアントが本物のワークスペース作業をこなせるように。</strong>ファイルの書き込み、ファイルの削除、プロジェクトの削除、アクティブなプロジェクトディレクトリの解決、生成ループの実行、そして Codex のワンクリック bootstrap が一か所からできます。外部クライアントは、ただ傍観するのではなく、Open Design のワークスペースに参加できるようになりました。</li>
        <li><strong>Windows と Linux で Open Design を試すのがより簡単に。</strong>Windows にはインストール不要の portable zip という道が、Linux には Docker / Podman Compose のワンクリックセットアップが用意されました。インストールの摩擦が減り、初回起動が速くなります。</li>
      </ul>
      <p>完全なリストは 310 件の PR に及びます。残りは <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub のリリースノート</a>が引き受けています。</p>

      <h2>今日それで何をするか</h2>
      <table>
        <thead><tr><th>あなたが…なら</th><th>ここから始める</th></tr></thead>
        <tbody>
          <tr><td>Open Design がはじめて</td><td>デスクトップアプリをダウンロードし、AMR で一度サインインし、モデルを選んで、最初のプロンプトを送るだけ——このリリースでは、その道筋にもう API キーのステップはありません</td></tr>
          <tr><td>すでに Open Design を動かしている</td><td>同梱の自動アップデートに 0.9.0 まで連れて行ってもらいましょう。以降の onboarding は AMR で始まります</td></tr>
          <tr><td>すでにターミナルで Claude Code、Codex、Aider、Trae を動かしている</td><td>それらを、デスクトップアプリに同梱されている同じ OD CLI に向けてください。すでに持っている agent がデザインエンジンになり、skill 層が新しいアプリを持ち込むことなくセンスと構造を補います</td></tr>
          <tr><td>Windows か Linux 上にいる</td><td>Windows の portable zip を入手するか、Linux の Docker / Podman Compose ワンクリックセットアップを使えば、システムのインストーラーに触れずに初回起動できます</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>「インストールしたらすぐ作れる」が本当に成り立つのを待っていたなら、これがそのリリースです。デスクトップアプリをダウンロードし、AMR でサインインして、もともとやるつもりだった簡単な作業を走らせてみてください——今回は、アプリを開いてから最初の成果物までの間に、設定の段階はありません。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>7 日間で 310 件の PR。この「インストールしたらすぐ作れる」リリースが存在するのは、これほど多くの人がこれほど多くの異なる角度から現れ、欠けていたピースを作ってくれたからです。ムーブメントは一つのチームのノートパソコンから出荷されるのではなく、現れて手を動かして作った人々の手から出荷されます。私たちはあなたたちを見ています。🫡</p>

      <h2>関連する読み物</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0:すべてはプラグイン</a>——0.9.0 がその上に立っているエンジンの作り直し</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ私たちは Open Design を製品ではなく skill 層として作ったのか</a>——「製品ではなく層」という賭けの背後にある、より長いマニフェスト</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design のオープンソース代替</a>——このリリースが agent ネイティブなデザインの地図の中で占める位置</li>
      </ul>
  ko:
    title: "Open Design 0.9.0: 모두를 위한 디자인"
    summary: "Open Design 0.9.0은 「설치하면 곧바로 창작」 릴리스입니다. API 키를 찾아 헤맬 필요도, CLI 세 개를 깔 필요도 없습니다. 앱을 열고, 한 번 로그인하고, 모델을 고르고, 바로 만들기 시작하세요. 여기에 더 커진 에이전트 라인업, 진짜 플러그인 라이브러리, 그리고 Windows와 Linux에서 한층 수월해진 설치까지 더했습니다."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, 2026년 6월 2일 출시. <strong>7일 동안 98명의 기여자가 보낸 310개의 PR.</strong> 코드네임 「Design for everyone」 — 이번은 <strong>「설치하면 곧바로 창작」 릴리스</strong>입니다. 지난 세 번의 릴리스 동안 우리는 여러분에게 일을 하기 전에 먼저 일을 하라고 요구해 왔습니다. CLI를 설치하고, API 키를 찾고, 비밀 키를 붙여넣고, 인증을 테스트하고, 일일이 찾아봐야 하는 목록에서 올바른 모델 이름을 고르는 일. 그 단계 하나하나가 누군가는 무언가를 만들어 보기도 전에 떠나 버리는 지점이었습니다.</p>
      <p>0.9.0은 그 단계들을 삭제합니다.</p>
      <p>긴 버전을 원한다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub의 릴리스 노트</a>에 전부 담겨 있습니다. 이 글은 짧은 버전입니다. 내부적으로 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서부터 시작하면 되는지.</p>

      <h2>왜 「시작하기」가 곧 일이었는가</h2>
      <p>디자인 도구의 첫인상은 캔버스 위에서 생기는 일이 거의 없습니다. 캔버스에 닿기 전에 — 아무도 하고 싶어 하지 않는 그 설정 과정에서 생깁니다. 우리는 우리 자신의 온보딩 퍼널을 오래도록 들여다보았고, 불편한 결론에 이르렀습니다. 많은 사람들이 무언가를 만들기 <em>전에</em> 떠났다는 것. 제품이 잘못돼서가 아니라, 「시작」 그 자체가 너무 비쌌기 때문입니다.</p>
      <p>0.9.0은 시작이라는 일을, 사람들이 진짜로 원했던 그 한 줄로 줄였습니다.</p>
      <blockquote><strong>앱을 연다 → 한 번 로그인한다 → 모델을 고른다 → 창작을 시작한다.</strong></blockquote>
      <p>설정 불필요. CLI 설치 불필요. API 키 불필요.</p>

      <h2>세 개의 큰 줄기</h2>
      <p><strong>Open Design AMR — 공식 AI, 설치하면 바로 거기에.</strong> 예전에 「시작」은 일종의 세금이었습니다. CLI를 설치하고, API 키를 찾아내고, 비밀 키를 붙여넣고, 인증을 테스트하고, 셸과 씨름하고 — 그러고 나서야 비로소 디자인 차례였죠. 0.9.0은 <a href="https://open-design.ai/amr">Open Design AMR</a>을 설치 프로그램 안에 직접 담았습니다. AI 엔진이 앱과 함께 옵니다. 따로 설치할 CLI도, 설정할 API 키도 없습니다. 이제 온보딩은 AMR로 시작하고, 데스크톱에서 로그인은 언제나 클릭 한 번 거리에 있으며, 사용 가능한 모델은 자동으로 최신 상태를 유지하고, 계정과 잔액 상태는 UI 안에 그대로 있습니다. 이미지 첨부도 별도 설정 없이 바로 작동합니다. 한 번 로그인하고, 모델을 고르고, 출발.</p>
      <p><strong>에이전트 라인업이 한층 커졌습니다.</strong> Aider, Trae CLI, Antigravity, DeepSeek Reasonix가 모두 선택기에 들어와, 정해진 단 하나의 워크플로 대신 더 많은 <em>진짜</em> 로컬 에이전트 경로를 제공합니다. Aider는 일급 시민 수준의 브랜드 표현을 받았고, Trae는 ACP를 통해 yolo 모드로 돌아가며, 이 새 어댑터들은 Open Design을 점점 「하나의 에이전트 통합」이 아니라 「에이전트들이 일하러 오는 곳」처럼 느껴지게 합니다. 모델 선택도 더 이상 전화번호부를 넘기는 일 같지 않습니다. 긴 목록도 검색으로 바로 뚫고 들어가고, Settings와 인라인 전환기가 같은 BYOK 카탈로그를 공유해 모델 전환이 굼뜨지 않고 빠릅니다.</p>
      <p><strong>skill이 진짜 플러그인 생태계가 됩니다.</strong> skill 번들이 이제 정식으로 일급 시민 Plugins로 졸업합니다. 서랍에서 보이고, CLI로 나열할 수 있고, 사이트에서 색인되며, 사용자에게 설명하기도 더 쉽습니다. 하나의 확장 모델, 하나의 라이브러리, 하나의 정신 모델. 공식 GSAP 플러그인은 제대로 된 웹 애니메이션을 에이전트 루프 안으로 가져오고, Research Decision Room은 리서치 프롬프트를 한 덩어리의 긴 답변이 아니라 구조화된 다중 역할 리뷰로 바꿉니다. 사이트의 플러그인 라이브러리는 이제 앱 내 분류 체계와 정렬되고 각 언어로 자연스럽게 읽히며, 플러그인과 템플릿 상세 페이지도 정적인 목록에서 진짜로 손을 움직일 수 있는 발견의 공간으로 바뀝니다 — 미리 보기, 설치, 시험, 공유.</p>

      <h2>0.9.0이 더 가져온 것들</h2>
      <p>이번 릴리스는 폭이 넓습니다. 끌어올려 둘 만한 몇 가지.</p>
      <ul>
        <li><strong>출력이 나오는 동안에도 계속 대화하기.</strong> 모델이 아직 돌아가는 중에 다음 한마디를 대기열에 넣어 두면, 지금 차례가 끝나는 순간 Open Design이 곧바로 이어받습니다. Studio와 Draw도 같은 흐름을 따르므로, 떠오른 생각을 적어 두는 일이 더 이상 이전 응답이 끝나기를 기다리는 데 묶이지 않습니다.</li>
        <li><strong>디자인 시스템이 파일에서 살아 있는 자산으로.</strong> 이름을 바꾸고, 내 것을 맨 위에 고정하고, 컬러 테이블에서 진짜 색 견본을 읽어 내고, 디자인 시스템 프로젝트를 GitHub에 바로 연결할 수 있습니다 — zip 파일을 이리저리 옮길 필요 없이.</li>
        <li><strong>리뷰가 산출물과 함께 움직입니다.</strong> 코멘트 모드가 첨부, 실시간 미리 보기 업데이트, 깔끔한 선택 해제를 지원하므로, 스크린샷과 메모가 흐름을 멈춰 세우는 대신 작업물에 계속 붙어 있습니다.</li>
        <li><strong>자동화가 스크립트가 아니라 스케줄처럼 느껴집니다.</strong> 제대로 된 시간 선택기, 자연어 요약, 최신 우선 정렬, 생성 후 자동 포커스, 현지화, 중복 슬롯 정리가 자동화를 더 믿을 만하게 만듭니다.</li>
        <li><strong>MCP 클라이언트가 진짜 워크스페이스 작업을 할 수 있게 됐습니다.</strong> 파일 쓰기, 파일 삭제, 프로젝트 삭제, 현재 프로젝트 디렉터리 해석, 생성 루프 실행, 한곳에서 Codex 부트스트랩 — 외부 클라이언트가 이제 그저 지켜보는 것이 아니라 Open Design 워크스페이스에 참여할 수 있습니다.</li>
        <li><strong>Windows와 Linux에서 Open Design을 써 보기가 더 쉬워졌습니다.</strong> Windows에는 설치가 필요 없는 portable zip 경로가 생겼고, Linux에는 Docker / Podman Compose 원클릭 설정이 생겼습니다. 설치 마찰은 더 적게, 첫 실행은 더 빠르게.</li>
      </ul>
      <p>전체 목록은 310개의 PR에 달합니다. 나머지는 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub의 릴리스 노트</a>에 담겨 있습니다.</p>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead><tr><th>당신이…</th><th>여기서 시작하세요</th></tr></thead>
        <tbody>
          <tr><td>Open Design을 처음 쓴다면</td><td>데스크톱 앱을 내려받아 AMR로 한 번 로그인하고, 모델을 고른 뒤 첫 프롬프트를 바로 보내세요 — 이번 버전에서는 그 경로 어디에도 API 키 단계가 없습니다</td></tr>
          <tr><td>이미 Open Design을 돌리고 있다면</td><td>패키징된 자동 업데이트가 당신을 0.9.0으로 데려가게 하세요. 이후 온보딩은 AMR로 시작합니다</td></tr>
          <tr><td>이미 터미널에서 Claude Code, Codex, Aider 또는 Trae를 구동하고 있다면</td><td>그것들을 데스크톱 앱이 함께 제공하는 바로 그 OD CLI에 연결하세요. 당신이 이미 가진 에이전트가 곧 디자인 엔진이고, skill 층은 새 앱을 들이지 않고도 안목과 구조를 더해 줍니다</td></tr>
          <tr><td>Windows 또는 Linux를 쓰고 있다면</td><td>Windows portable zip을 받거나 Linux의 Docker / Podman Compose 원클릭 설정을 쓰세요 — 시스템 설치 프로그램을 건드리지 않고도 첫 실행이 됩니다</td></tr>
        </tbody>
      </table>

      <h2>다음 단계</h2>
      <p>「설치하면 곧바로 창작」이 진짜로 성립하기를 기다려 왔다면, 바로 그 릴리스입니다. 데스크톱 앱을 내려받아 AMR로 로그인하고, 어차피 돌리려던 그 브리프를 돌려 보세요 — 이번에는 앱을 여는 일과 첫 산출물 사이에 설정 과정이 없습니다.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>7일 동안 310개의 PR. 이 「설치하면 곧바로 창작」 릴리스가 존재하는 까닭은, 그토록 많은 사람이 그토록 다른 각도에서 나타나 빠져 있던 조각들을 만들어 넣었기 때문입니다. 운동은 한 팀의 노트북에서 출시되지 않습니다. 직접 나타나 부품을 만들어 낸 사람들의 손에서 출시됩니다. 우리는 여러분을 보고 있습니다. 🫡</p>

      <h2>더 읽을거리</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: 모든 것은 플러그인이다</a> — 0.9.0이 그 위에 올라선 엔진 재작성</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아니라 skill 층으로 만든 이유</a> — 「제품이 아니라 층」이라는 베팅 뒤의 더 긴 선언문</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design의 오픈소스 대안</a> — 이번 릴리스가 에이전트 네이티브 디자인 지형 안에서 놓이는 자리</li>
      </ul>
  de:
    title: "Open Design 0.9.0: Design für alle"
    summary: "Open Design 0.9.0 ist das Installieren-und-loslegen-Release. Keine API-Key-Schnitzeljagd, kein Setup mit drei CLIs – App öffnen, einmal anmelden, ein Modell wählen und loslegen. Dazu eine größere Agent-Auswahl, eine echte Plugin-Bibliothek und einfachere Installation unter Windows und Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, veröffentlicht am 2. Juni 2026. <strong>310 PRs von 98 Mitwirkenden in sieben Tagen.</strong> Codename „Design for everyone" – das ist das <strong>Installieren-und-loslegen-Release</strong>. Drei Releases lang haben wir dich gebeten, Arbeit zu erledigen, bevor du arbeiten konntest: ein CLI installieren, einen API-Key finden, Secrets einfügen, die Authentifizierung testen, den richtigen Modellnamen aus einer Liste auswählen, die du erst nachschlagen musstest. Jeder dieser Schritte war eine Stelle, an der jemand absprang, bevor er je etwas gemacht hatte.</p>
      <p>0.9.0 streicht diese Schritte.</p>
      <p>Wenn du die lange Fassung willst: Die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Release Notes auf GitHub</a> haben sie. Dieser Beitrag ist die Kurzfassung: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Warum der Einstieg selbst die Arbeit war</h2>
      <p>Der erste Eindruck eines Design-Tools entsteht fast nie auf der Leinwand. Er entsteht vor der Leinwand – in dem Setup, das niemand machen will. Wir haben lange genug auf unseren eigenen Onboarding-Funnel gestarrt, um zu einer unbequemen Erkenntnis zu kommen: Viele Leute gingen, <em>bevor</em> sie irgendetwas gemacht hatten. Nicht weil das Produkt falsch war, sondern weil „Start" zu teuer war.</p>
      <p>0.9.0 reduziert das Starten auf die eine Zeile, die die Leute eigentlich wollten:</p>
      <blockquote><strong>App öffnen → einmal anmelden → ein Modell wählen → loslegen.</strong></blockquote>
      <p>Keine Konfiguration. Keine CLI-Installation. Kein API-Key erforderlich.</p>

      <h2>Die drei Bausteine</h2>
      <p><strong>Open Design AMR – offizielle AI, einsatzbereit ab dem Moment der Installation.</strong> Der Einstieg war früher eine Steuer: ein CLI installieren, einen API-Key aufspüren, Secrets einfügen, die Auth testen, mit der Shell kämpfen – und erst dann mit dem Designen anfangen. 0.9.0 liefert <a href="https://open-design.ai/amr">Open Design AMR</a> direkt im Installer. Die AI-Engine kommt mit der App; es gibt kein separates CLI und keinen API-Key einzurichten. Das Onboarding führt jetzt mit AMR an, die Anmeldung ist auf dem Desktop immer nur einen Klick entfernt, deine verfügbaren Modelle bleiben automatisch aktuell, und Konto- und Guthaben-Status leben direkt in der UI. Bildanhänge funktionieren von Haus aus. Einmal anmelden, ein Modell wählen, los.</p>
      <p><strong>Die Agent-Auswahl wird deutlich größer.</strong> Aider, Trae CLI, Antigravity und DeepSeek Reasonix sind alle in der Auswahl gelandet und geben Erstellenden mehr <em>echte</em> lokale Agent-Pfade statt eines einzigen abgesegneten Workflows. Aider bekommt eine erstklassige Markendarstellung, Trae läuft über ACP im Yolo-Modus, und die neuen Adapter lassen Open Design weniger wie eine einzelne Agent-Integration wirken und mehr wie der Ort, an dem Agents zum Arbeiten kommen. Auch die Modellauswahl fühlt sich nicht mehr wie das Durchblättern eines Telefonbuchs an: Die Suche schneidet durch lange Listen, und ein gemeinsamer BYOK-Katalog hält Settings und den Inline-Umschalter im Einklang, sodass das Wechseln von Modellen schnell statt fummelig ist.</p>
      <p><strong>Skills werden zu einem echten Plugin-Ökosystem.</strong> Skill-Bundles steigen zu erstklassigen Plugins auf: sichtbar in der Schublade, auflistbar über das CLI, auf der Website indexiert und Nutzern leichter zu erklären. Ein Erweiterungsmodell, eine Bibliothek, ein mentales Modell. Das offizielle GSAP-Plugin bringt ernsthafte Web-Animation in die Agent-Schleife, und Research Decision Room verwandelt Recherche-Prompts in strukturierte Reviews mit mehreren Rollen statt einer langen Antwort. Die Plugin-Bibliothek auf der Website spiegelt jetzt die In-App-Taxonomie wider und liest sich nativ über alle Sprachen hinweg, und die Detailseiten für Plugins und Templates werden aus statischen Auflistungen zu einer echten Discovery-Fläche – Vorschau, Installation, Ausprobieren, Teilen.</p>

      <h2>Was sonst noch in 0.9.0 kommt</h2>
      <p>Das Release ist breit. Die Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
        <li><strong>Weiterreden, während das Modell noch arbeitet.</strong> Stelle den nächsten Versand mitten im Stream in die Warteschlange, und Open Design macht weiter, sobald die aktuelle Runde fertig ist. Studio und Draw folgen demselben Ablauf, sodass das Festhalten einer Idee nicht davon abhängt, auf das Ende der vorherigen Antwort zu warten.</li>
        <li><strong>Designsysteme werden von Dateien zu lebendigen Assets.</strong> Benenne sie um, hefte deine eigenen nach oben, lies echte Farbmuster aus ihren Farbtabellen und verbinde Designsystem-Projekte mit GitHub ohne das Zip-Datei-Geschiebe.</li>
        <li><strong>Reviews bleiben in Bewegung, während sich das Artefakt ändert.</strong> Der Kommentarmodus unterstützt jetzt Anhänge, Live-Vorschau-Updates und sauberes Abwählen, sodass Screenshots und Notizen an der Arbeit hängen bleiben, statt den Ablauf einzufrieren.</li>
        <li><strong>Routinen fühlen sich geplant an, nicht geskriptet.</strong> Ein echter Picker, Zusammenfassungen in natürlicher Sprache, neueste-zuerst-Sortierung, Auto-Fokus nach dem Erstellen, Lokalisierung und das Aufräumen doppelter Slots machen Automatisierungen vertrauenswürdiger.</li>
        <li><strong>MCP-Clients können echte Workspace-Arbeit leisten.</strong> Dateien schreiben, Dateien löschen, Projekte löschen, das aktive Projektverzeichnis auflösen, Generierungsschleifen laufen lassen und Codex von einer Stelle aus bootstrappen. Externe Clients können jetzt am Workspace teilnehmen, statt ihn nur zu beobachten.</li>
        <li><strong>Open Design auszuprobieren wird unter Windows und Linux einfacher.</strong> Windows bekommt einen Pfad über eine portable Zip; Linux bekommt ein Docker-/Podman-Compose-Setup mit einem Klick. Weniger Installationsreibung, schnellerer erster Lauf.</li>
      </ul>
      <p>Die vollständige Liste umfasst 310 PRs. Die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Release Notes auf GitHub</a> tragen den Rest.</p>

      <h2>Was du heute damit machst</h2>
      <table>
        <thead><tr><th>Wenn du …</th><th>Hier anfangen</th></tr></thead>
        <tbody>
          <tr><td>Neu bei Open Design</td><td>Lade die Desktop-App herunter, melde dich einmal mit AMR an, wähle ein Modell und sende deinen ersten Prompt – auf diesem Weg gibt es keinen API-Key-Schritt mehr</td></tr>
          <tr><td>Bereits Open Design am Laufen</td><td>Lass das gepackte Auto-Update dich auf 0.9.0 bringen; das Onboarding führt jetzt mit AMR an</td></tr>
          <tr><td>Bereits Claude Code, Codex, Aider oder Trae im Terminal steuerst</td><td>Richte sie auf dasselbe OD CLI, das die Desktop-App mitliefert; dein Agent ist die Design-Engine, und die Skill-Schicht fügt Geschmack und Struktur hinzu, ohne eine neue App</td></tr>
          <tr><td>Unter Windows oder Linux</td><td>Schnapp dir die Windows-Portable-Zip oder nutze das Linux-Docker-/Podman-Compose-Setup mit einem Klick für einen ersten Lauf, ohne einen Systeminstaller anzufassen</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Wenn du darauf gewartet hast, dass „Installieren und loslegen" tatsächlich wahr wird, dann ist das das Release. Lade die Desktop-App herunter, melde dich mit AMR an und führe das Briefing aus, das du ohnehin ausführen wolltest – diesmal gibt es kein Setup zwischen dem Öffnen der App und dem ersten Artefakt.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>310 PRs in 7 Tagen. Das Installieren-und-loslegen-Release existiert nur, weil so viele Menschen aus so vielen verschiedenen Richtungen auftauchten und die fehlenden Teile bauten. Eine Bewegung wird nicht von den Laptops eines einzigen Teams aus ausgeliefert; sie wird von den Menschen ausgeliefert, die auftauchten und bauten. Wir sehen euch. 🫡</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: Alles ist ein Plugin</a> – der Engine-Neubau, auf dem 0.9.0 aufbaut</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Schicht gebaut haben, nicht als Produkt</a> – das längere Manifest hinter der Wette „Schicht, nicht Produkt"</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Die Open-Source-Alternative zu Claude Design</a> – wo dieses Release in die Agent-native Design-Landschaft passt</li>
      </ul>
  fr:
    title: "Open Design 0.9.0 : le design, pour tout le monde"
    summary: "Open Design 0.9.0, c'est la version « installer et créer ». Plus de chasse au trésor pour trouver une clé API, plus de configuration à trois CLI — vous ouvrez l'application, vous vous connectez une fois, vous choisissez un modèle, et vous commencez à construire. Avec, en plus, un banc d'agents plus large, une vraie bibliothèque de plugins, et des installations plus simples sur Windows et Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, publié le 2 juin 2026. <strong>310 PR par 98 contributeurs en sept jours.</strong> Nom de code « Design for everyone » — c'est notre <strong>version « installer et créer »</strong>. Pendant trois versions, nous vous avons demandé de faire du travail avant de pouvoir faire du travail : installer un CLI, trouver une clé API, coller des secrets, tester l'authentification, choisir le bon nom de modèle dans une liste qu'il fallait aller chercher. Chacune de ces étapes était un endroit où quelqu'un abandonnait avant d'avoir jamais rien créé.</p>
      <p>0.9.0 supprime ces étapes.</p>
      <p>Si vous voulez la version longue, les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">notes de version sur GitHub</a> la contiennent. Ce billet est la version courte : ce qui a changé sous le capot, ce que vous pouvez en faire aujourd'hui, et par où commencer.</p>

      <h2>Pourquoi « démarrer » était devenu le travail</h2>
      <p>La première impression d'un outil de design ne se produit presque jamais sur le canevas. Elle se produit avant le canevas — dans la configuration que personne ne veut faire. Nous avons observé notre propre tunnel d'onboarding assez longtemps pour arriver à une conclusion inconfortable : beaucoup de gens partaient <em>avant</em> d'avoir rien créé. Non pas parce que le produit était mauvais, mais parce que « démarrer » coûtait trop cher.</p>
      <p>0.9.0 ramène le démarrage à la seule phrase que les gens voulaient vraiment :</p>
      <blockquote><strong>Ouvrir l'application → se connecter une fois → choisir un modèle → commencer à créer.</strong></blockquote>
      <p>Aucune configuration. Aucune installation de CLI. Aucune clé API requise.</p>

      <h2>Les trois grands axes</h2>
      <p><strong>Open Design AMR — l'IA officielle, prête dès l'installation.</strong> Démarrer était autrefois un impôt : installer un CLI, dénicher une clé API, coller des secrets, tester l'authentification, se battre avec le shell — et seulement ensuite commencer à concevoir. 0.9.0 embarque <a href="https://open-design.ai/amr">Open Design AMR</a> directement dans l'installateur. Le moteur d'IA arrive avec l'application ; il n'y a plus de CLI ni de clé API séparés à configurer. L'onboarding commence désormais par AMR, la connexion reste à un clic sur le bureau, vos modèles disponibles restent à jour automatiquement, et l'état du compte et du solde s'affiche directement dans l'interface. Les pièces jointes images fonctionnent d'emblée. Connectez-vous une fois, choisissez un modèle, c'est parti.</p>
      <p><strong>Le banc d'agents s'élargit nettement.</strong> Aider, Trae CLI, Antigravity et DeepSeek Reasonix rejoignent tous le sélecteur, offrant aux créateurs davantage de chemins d'agents locaux <em>réels</em> plutôt qu'un unique flux de travail béni. Aider bénéficie d'une présentation de marque de premier ordre, Trae tourne via ACP en mode yolo, et les nouveaux adaptateurs font qu'Open Design ressemble moins à une intégration d'un seul agent et davantage à l'endroit où les agents viennent travailler. Le choix d'un modèle cesse aussi de ressembler à feuilleter un annuaire : la recherche tranche dans les longues listes, et un catalogue BYOK partagé maintient les Settings et le sélecteur en ligne alignés, de sorte que changer de modèle est rapide au lieu d'être fastidieux.</p>
      <p><strong>Les skills deviennent un véritable écosystème de plugins.</strong> Les bundles de skills sont promus au rang de Plugins de premier ordre : visibles dans le tiroir, listables depuis le CLI, indexés sur le site, et plus faciles à expliquer aux utilisateurs. Un seul modèle d'extension, une seule bibliothèque, un seul modèle mental. Le plugin officiel GSAP apporte une vraie animation web dans la boucle de l'agent, et Research Decision Room transforme les prompts de recherche en évaluations structurées multi-rôles au lieu d'une seule longue réponse. La bibliothèque de plugins du site reflète désormais la taxonomie de l'application et se lit nativement dans chaque langue, et les pages de détail des plugins et des templates passent de listes statiques à une véritable surface de découverte — prévisualiser, installer, essayer, partager.</p>

      <h2>Quoi d'autre arrive dans 0.9.0</h2>
      <p>Cette version est large. Les morceaux qui valent la peine d'être mis en avant :</p>
      <ul>
        <li><strong>Continuer à dialoguer pendant que le modèle travaille encore.</strong> Mettez en file le prochain envoi en plein flux, et Open Design enchaîne dès que le tour en cours se termine. Studio et Draw suivent le même flux, de sorte que capturer une idée ne dépend plus d'attendre la fin de la réponse précédente.</li>
        <li><strong>Les design systems passent de fichiers à des actifs vivants.</strong> Renommez-les, épinglez les vôtres en haut, lisez de vrais échantillons depuis leurs tables de couleurs, et connectez les projets de design system à GitHub sans plus jongler avec des fichiers zip.</li>
        <li><strong>La revue continue d'avancer pendant que l'artefact change.</strong> Le mode commentaire prend désormais en charge les pièces jointes, les mises à jour de prévisualisation en direct et une désélection nette, de sorte que captures d'écran et notes restent attachées au travail au lieu de figer le flux.</li>
        <li><strong>Les routines donnent l'impression d'être planifiées, pas scriptées.</strong> Un vrai sélecteur, des résumés en langage naturel, un tri du plus récent au plus ancien, une mise au point automatique après création, la localisation et le nettoyage des créneaux en double rendent les automatisations plus dignes de confiance.</li>
        <li><strong>Les clients MCP peuvent accomplir un vrai travail d'espace de travail.</strong> Écrire des fichiers, supprimer des fichiers, supprimer des projets, résoudre le répertoire du projet actif, lancer des boucles de génération et amorcer Codex depuis un seul endroit. Les clients externes peuvent désormais participer à l'espace de travail au lieu de seulement l'observer.</li>
        <li><strong>Essayer Open Design devient plus facile sur Windows et Linux.</strong> Windows reçoit un chemin via zip portable ; Linux reçoit une installation en un clic avec Docker / Podman Compose. Moins de friction à l'installation, un premier lancement plus rapide.</li>
      </ul>
      <p>La liste complète atteint 310 PR. Les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">notes de version sur GitHub</a> portent le reste.</p>

      <h2>Quoi en faire aujourd'hui</h2>
      <table>
        <thead><tr><th>Si vous êtes…</th><th>Commencez ici</th></tr></thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau, connectez-vous une fois avec AMR, choisissez un modèle et envoyez votre premier prompt — il n'y a plus d'étape de clé API sur le chemin</td></tr>
          <tr><td>Déjà en train d'utiliser Open Design</td><td>Laissez la mise à jour automatique intégrée vous amener à 0.9.0 ; l'onboarding commence désormais par AMR</td></tr>
          <tr><td>Déjà en train de piloter Claude Code, Codex, Aider ou Trae dans le terminal</td><td>Pointez-les vers le même OD CLI que l'application de bureau embarque ; votre agent est le moteur de design et la couche de skills ajoute le goût et la structure sans nouvelle application</td></tr>
          <tr><td>Sur Windows ou Linux</td><td>Récupérez le zip portable Windows, ou utilisez l'installation en un clic Docker / Podman Compose de Linux pour un premier lancement sans toucher à un installateur système</td></tr>
        </tbody>
      </table>

      <h2>Et ensuite</h2>
      <p>Si vous attendiez que « installer et créer » devienne vraiment réalité, c'est cette version-là. Téléchargez l'application de bureau, connectez-vous avec AMR, et lancez le brief que vous alliez lancer de toute façon — cette fois, il n'y a aucune configuration entre l'ouverture de l'application et le premier artefact.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Télécharger Open Design</a>.</p>
      <p>310 PR en 7 jours. La version « installer et créer » n'existe que parce que tant de gens se sont présentés sous tant d'angles différents et ont construit les pièces manquantes. Un mouvement ne s'expédie pas depuis les ordinateurs portables d'une seule équipe ; il s'expédie depuis les gens qui sont venus et qui ont construit. Nous vous voyons. 🫡</p>

      <h2>Pour aller plus loin</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0 : tout est un plugin</a> — la refonte du moteur sur laquelle 0.9.0 est bâtie</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, et non comme un produit</a> — le manifeste plus long derrière le pari « une couche, pas un produit »</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">L'alternative open source à Claude Design</a> — la place qu'occupe cette version dans le paysage du design agent-native</li>
      </ul>
  ru:
    title: "Open Design 0.9.0: дизайн для каждого"
    summary: "Open Design 0.9.0 — это релиз «установил и создаёшь». Никакой охоты за API-ключами, никакой настройки трёх CLI — откройте приложение, войдите один раз, выберите модель и начинайте создавать. А ещё — расширенная скамейка агентов, настоящая библиотека плагинов и более простая установка на Windows и Linux."
    bodyHtml: |
      <p>Тег <code>open-design-v0.9.0</code>, выпущен 2 июня 2026 года. <strong>310 PR от 98 контрибьюторов за семь дней.</strong> Кодовое имя «Design for everyone» — это наш <strong>релиз «установил и создаёшь»</strong>. На протяжении трёх релизов мы просили вас делать работу, прежде чем вы сможете делать работу: установить CLI, найти API-ключ, вставить секреты, проверить аутентификацию, выбрать правильное имя модели из списка, который ещё нужно было где-то посмотреть. Каждый из этих шагов был местом, где кто-то уходил, так и не создав ничего.</p>
      <p>0.9.0 убирает эти шаги.</p>
      <p>Если вам нужна длинная версия, в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">примечаниях к релизу на GitHub</a> есть все детали. Этот пост — короткая версия: что изменилось под капотом, что вы можете сделать с этим сегодня и с чего начать.</p>

      <h2>Почему именно «начало работы» было работой</h2>
      <p>Первое впечатление от дизайн-инструмента почти никогда не возникает на холсте. Оно возникает до холста — в той настройке, которой никто не хочет заниматься. Мы достаточно долго вглядывались в собственную воронку онбординга, чтобы прийти к неприятному выводу: множество людей уходило, <em>так и не создав</em> ничего. Не потому, что продукт был плохим, а потому, что «начать» стоило слишком дорого.</p>
      <p>0.9.0 сводит начало к одной строчке, которую люди и хотели на самом деле:</p>
      <blockquote><strong>Откройте приложение → войдите один раз → выберите модель → начинайте создавать.</strong></blockquote>
      <p>Никакой настройки. Никакой установки CLI. Никакого API-ключа.</p>

      <h2>Три опоры</h2>
      <p><strong>Open Design AMR — официальный ИИ, готовый в момент установки.</strong> Раньше начало работы было налогом: установить CLI, выследить API-ключ, вставить секреты, проверить аутентификацию, повоевать с шеллом — и только потом приступить к дизайну. 0.9.0 поставляет <a href="https://open-design.ai/amr">Open Design AMR</a> прямо внутри установщика. ИИ-движок идёт вместе с приложением; отдельный CLI или API-ключ настраивать не нужно. Онбординг теперь начинается с AMR, вход на десктопе всегда в одном клике, доступные модели автоматически остаются актуальными, а статус аккаунта и баланса виден прямо в интерфейсе. Вложения изображений работают из коробки. Войдите один раз, выберите модель — и вперёд.</p>
      <p><strong>Скамейка агентов стала заметно больше.</strong> Aider, Trae CLI, Antigravity и DeepSeek Reasonix — все они добавлены в селектор, давая создателям больше <em>реальных</em> путей локальных агентов вместо одного благословлённого рабочего процесса. Aider получил брендинг первого класса, Trae работает через ACP в режиме yolo, и новые адаптеры делают так, что Open Design всё меньше похож на «одну интеграцию агента» и всё больше на место, куда агенты приходят работать. Выбор модели тоже перестал ощущаться как пролистывание телефонной книги: поиск пробивается сквозь длинные списки, а общий каталог BYOK держит Settings и встроенный переключатель синхронными, так что смена модели стала быстрой, а не возни́стой.</p>
      <p><strong>Навыки превращаются в настоящую экосистему плагинов.</strong> Бандлы навыков выпускаются в Plugins первого класса: видны в выдвижной панели, перечисляются из CLI, индексируются на сайте и проще объясняются пользователям. Одна модель расширений, одна библиотека, одна ментальная модель. Официальный плагин GSAP приносит серьёзную веб-анимацию в цикл агента, а Research Decision Room превращает исследовательские промпты в структурированные многоролевые ревью вместо одного длинного ответа. Библиотека плагинов на сайте теперь отражает внутреннюю таксономию приложения и читается на родном языке для каждой локали, а страницы плагинов и шаблонов превращаются из статичных списков в настоящую поверхность для открытий — превью, установка, проба, шеринг.</p>

      <h2>Что ещё появилось в 0.9.0</h2>
      <p>Этот релиз широкий. Вот фрагменты, которые стоит вынести вперёд:</p>
      <ul>
        <li><strong>Продолжайте общение, пока модель ещё работает.</strong> Поставьте следующее сообщение в очередь прямо посреди потока, и Open Design продолжит в тот момент, когда текущий ход завершится. Studio и Draw следуют тому же сценарию, так что зафиксировать мысль больше не зависит от ожидания конца предыдущего ответа.</li>
        <li><strong>Дизайн-системы превращаются из файлов в живые активы.</strong> Переименовывайте их, закрепляйте свои наверху, считывайте реальные образцы цвета из их цветовых таблиц и подключайте проекты дизайн-систем к GitHub без перетасовки zip-файлов.</li>
        <li><strong>Ревью продолжает двигаться, пока меняется артефакт.</strong> Режим комментариев теперь поддерживает вложения, обновления превью в реальном времени и аккуратное снятие выделения, так что скриншоты и заметки остаются прикреплёнными к работе, а не замораживают процесс.</li>
        <li><strong>Рутины ощущаются как запланированные, а не как заскриптованные.</strong> Настоящий выбор времени, сводки на естественном языке, сортировка «новые сначала», автофокус после создания, локализация и очистка дублирующихся слотов делают автоматизацию более достойной доверия.</li>
        <li><strong>MCP-клиенты теперь могут делать настоящую работу в рабочем пространстве.</strong> Запись файлов, удаление файлов, удаление проектов, определение текущей директории проекта, запуск циклов генерации и bootstrap Codex из одного места. Внешние клиенты теперь могут участвовать в рабочем пространстве, а не только наблюдать за ним.</li>
        <li><strong>Попробовать Open Design стало проще на Windows и Linux.</strong> Для Windows появился путь с portable zip; для Linux — установка в один клик через Docker / Podman Compose. Меньше трения при установке, быстрее первый запуск.</li>
      </ul>
      <p>Полный список доходит до 310 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Примечания к релизу на GitHub</a> содержат всё остальное.</p>

      <h2>Что делать с этим сегодня</h2>
      <table>
        <thead><tr><th>Если вы…</th><th>Начните отсюда</th></tr></thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктоп-приложение, войдите один раз через AMR, выберите модель и отправьте свой первый промпт — на этом пути больше нет шага с API-ключом</td></tr>
          <tr><td>Уже работаете в Open Design</td><td>Позвольте упакованному автообновлению привести вас к 0.9.0; теперь онбординг начинается с AMR</td></tr>
          <tr><td>Уже управляете Claude Code, Codex, Aider или Trae в терминале</td><td>Направьте их на тот же OD CLI, который поставляется с десктоп-приложением; ваш агент — это дизайн-движок, а слой навыков добавляет вкус и структуру без нового приложения</td></tr>
          <tr><td>На Windows или Linux</td><td>Возьмите portable zip для Windows или используйте установку в один клик через Docker / Podman Compose на Linux — первый запуск без обращения к системному установщику</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Если вы ждали, когда «установил и создаёшь» станет правдой по-настоящему, — это тот самый релиз. Скачайте десктоп-приложение, войдите через AMR и запустите тот бриф, который вы всё равно собирались запустить, — на этот раз между открытием приложения и первым артефактом нет настройки.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>310 PR за 7 дней. Релиз «установил и создаёшь» существует только потому, что так много людей пришли с самых разных сторон и собрали недостающие части. Движение не отгружается с ноутбуков одной команды; оно отгружается людьми, которые пришли и построили. Мы вас видим. 🫡</p>

      <h2>Дополнительное чтение</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: всё — это плагин</a> — перестройка движка, на которой построен 0.9.0</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы сделали Open Design слоем навыков, а не продуктом</a> — более длинный манифест за ставкой «слой, а не продукт»</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Открытая альтернатива Claude Design</a> — где этот релиз находится в ландшафте agent-native дизайна</li>
      </ul>
  es:
    title: "Open Design 0.9.0: diseño para todos"
    summary: "Open Design 0.9.0 es la versión de instalar-y-crear. Sin búsqueda del tesoro de claves API, sin configurar tres CLI: abre la app, inicia sesión una vez, elige un modelo y empieza a construir. Además, un banco de agentes más grande, una verdadera biblioteca de plugins e instalaciones más fáciles en Windows y Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, lanzado el 2 de junio de 2026. <strong>310 PRs de 98 colaboradores en siete días.</strong> Nombre en clave «Design for everyone»: esta es la <strong>versión de instalar-y-crear</strong>. Durante tres versiones te pedimos hacer trabajo antes de poder trabajar: instalar un CLI, encontrar una clave API, pegar secretos, probar la autenticación, elegir el nombre de modelo correcto de una lista que tenías que buscar. Cada uno de esos pasos era un lugar donde alguien se rendía antes de llegar a hacer nada.</p>
      <p>0.9.0 elimina esos pasos.</p>
      <p>Si quieres la versión larga, las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">notas de lanzamiento en GitHub</a> la tienen. Este artículo es la versión corta: qué cambió bajo el capó, qué puedes hacer con ello hoy y por dónde empezar.</p>

      <h2>Por qué empezar era el trabajo</h2>
      <p>La primera impresión de una herramienta de diseño casi nunca ocurre en el lienzo. Ocurre antes del lienzo, en la configuración que nadie quiere hacer. Miramos nuestro propio embudo de onboarding el tiempo suficiente para llegar a una conclusión incómoda: mucha gente se iba <em>antes</em> de hacer nada. No porque el producto estuviera mal, sino porque «empezar» era demasiado caro.</p>
      <p>0.9.0 reduce el empezar a la única frase que la gente realmente quería:</p>
      <blockquote><strong>Abre la app → inicia sesión una vez → elige un modelo → empieza a crear.</strong></blockquote>
      <p>Sin configuración. Sin instalación de CLI. Sin clave API requerida.</p>

      <h2>Las tres piezas principales</h2>
      <p><strong>Open Design AMR: IA oficial, lista en el momento en que instalas.</strong> Empezar solía ser un impuesto: instalar un CLI, rastrear una clave API, pegar secretos, probar la autenticación, pelearte con la shell, y solo entonces empezar a diseñar. 0.9.0 incluye <a href="https://open-design.ai/amr">Open Design AMR</a> dentro del instalador. El motor de IA viene con la app; no hay un CLI o una clave API separados que configurar. El onboarding ahora arranca con AMR, el inicio de sesión queda a un clic de distancia en el escritorio, tus modelos disponibles se mantienen al día automáticamente, y el estado de la cuenta y el saldo viven directamente en la interfaz. Los adjuntos de imagen funcionan desde el primer momento. Inicia sesión una vez, elige un modelo, adelante.</p>
      <p><strong>El banco de agentes se hace mucho más grande.</strong> Aider, Trae CLI, Antigravity y DeepSeek Reasonix se unen al selector, ofreciendo a los creadores más rutas <em>reales</em> de agentes locales en lugar de un único flujo de trabajo bendecido. Aider obtiene una presentación de marca de primera clase, Trae se ejecuta sobre ACP en modo yolo, y los nuevos adaptadores hacen que Open Design se sienta menos como una integración de un solo agente y más como el lugar al que los agentes vienen a trabajar. Elegir un modelo también deja de sentirse como hojear una guía telefónica: la búsqueda corta a través de listas largas, y un catálogo BYOK compartido mantiene alineados los Settings y el conmutador en línea, de modo que cambiar de modelo es rápido en vez de engorroso.</p>
      <p><strong>Las skills se convierten en un verdadero ecosistema de plugins.</strong> Los bundles de skills se gradúan a Plugins de primera clase: visibles en el cajón, listables desde el CLI, indexados en el sitio y más fáciles de explicar a los usuarios. Un modelo de extensión, una biblioteca, un modelo mental. El plugin oficial de GSAP trae animación web seria al bucle del agente, y Research Decision Room convierte los prompts de investigación en revisiones estructuradas de múltiples roles en vez de una sola respuesta larga. La biblioteca de plugins en el sitio ahora refleja la taxonomía de la app y se lee de forma nativa en todos los idiomas, y las páginas de detalle de plugins y plantillas pasan de listados estáticos a una verdadera superficie de descubrimiento: previsualizar, instalar, probar, compartir.</p>

      <h2>Qué más llega en 0.9.0</h2>
      <p>La versión es amplia. Las piezas que vale la pena destacar:</p>
      <ul>
        <li><strong>Sigue conversando mientras el modelo aún trabaja.</strong> Pon en cola el siguiente envío a mitad del stream, y Open Design continúa en cuanto termina el turno actual. Studio y Draw siguen el mismo flujo, así que capturar una idea no depende de esperar a que termine la respuesta anterior.</li>
        <li><strong>Los sistemas de diseño pasan de archivos a activos vivos.</strong> Renómbralos, fija los tuyos arriba del todo, lee muestras reales de sus tablas de color, y conecta proyectos de sistema de diseño a GitHub sin el trajín de archivos zip.</li>
        <li><strong>La revisión sigue avanzando mientras el artefacto cambia.</strong> El modo comentario ahora admite adjuntos, actualizaciones de vista previa en vivo y una deselección limpia, de modo que las capturas y las notas permanecen ancladas al trabajo en lugar de congelar el flujo.</li>
        <li><strong>Las rutinas se sienten programadas, no scripteadas.</strong> Un selector de verdad, resúmenes en lenguaje natural, orden con lo más reciente primero, autoenfoque tras crear, localización y limpieza de ranuras duplicadas hacen que las automatizaciones sean más fáciles de confiar.</li>
        <li><strong>Los clientes MCP pueden hacer trabajo real en el espacio de trabajo.</strong> Escribir archivos, eliminar archivos, eliminar proyectos, resolver el directorio del proyecto activo, ejecutar bucles de generación y hacer bootstrap de Codex desde un solo lugar. Los clientes externos ahora pueden participar en el espacio de trabajo en vez de solo observarlo.</li>
        <li><strong>Probar Open Design se vuelve más fácil en Windows y Linux.</strong> Windows obtiene una ruta de zip portable; Linux obtiene una configuración con un clic mediante Docker / Podman Compose. Menos fricción de instalación, primera ejecución más rápida.</li>
      </ul>
      <p>La lista completa llega a 310 PRs. Las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">notas de lanzamiento en GitHub</a> tienen el resto.</p>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead><tr><th>Si eres…</th><th>Empieza aquí</th></tr></thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la app de escritorio, inicia sesión una vez con AMR, elige un modelo y envía tu primer prompt: ya no hay un paso de clave API en el camino</td></tr>
          <tr><td>Ya usas Open Design</td><td>Deja que la actualización automática empaquetada te lleve a 0.9.0; el onboarding ahora arranca con AMR</td></tr>
          <tr><td>Ya manejas Claude Code, Codex, Aider o Trae en la terminal</td><td>Apúntalos al mismo OD CLI que la app de escritorio incluye; tu agente es el motor de diseño y la capa de skills añade gusto y estructura sin una nueva app</td></tr>
          <tr><td>En Windows o Linux</td><td>Consigue el zip portable de Windows, o usa la configuración con un clic de Docker / Podman Compose de Linux para una primera ejecución sin tocar un instalador del sistema</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>Si has estado esperando a que «instalar y crear» fuera de verdad cierto, esta es la versión. Descarga la app de escritorio, inicia sesión con AMR, y ejecuta el brief que ibas a ejecutar de todos modos: esta vez no hay configuración entre abrir la app y el primer artefacto.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>310 PRs en 7 días. La versión de instalar-y-crear solo existe porque tanta gente apareció desde tantos ángulos distintos y construyó las piezas que faltaban. Un movimiento no se lanza desde los portátiles de un solo equipo; se lanza desde la gente que apareció y construyó. Os vemos. 🫡</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: todo es un plugin</a>: la reescritura del motor sobre la que se construye 0.9.0</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a>: el manifiesto más largo detrás de la apuesta «capa, no producto»</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">La alternativa de código abierto a Claude Design</a>: dónde encaja esta versión en el panorama del diseño nativo de agentes</li>
      </ul>
  pt-br:
    title: "Open Design 0.9.0: design para todo mundo"
    summary: "O Open Design 0.9.0 é a versão \"instale e crie\". Sem caça ao tesouro por chave de API, sem configurar três CLIs — abra o aplicativo, faça login uma vez, escolha um modelo e comece a construir. Além de um banco de agentes maior, uma biblioteca de plugins de verdade e instalações mais fáceis no Windows e no Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, lançada em 2 de junho de 2026. <strong>310 PRs de 98 contribuidores em sete dias.</strong> Codinome "Design for everyone" — esta é a <strong>versão "instale e crie"</strong>. Por três versões, pedimos que você fizesse trabalho antes de poder trabalhar: instalar um CLI, encontrar uma chave de API, colar segredos, testar a autenticação, escolher o nome certo do modelo numa lista que você tinha de consultar. Cada um desses passos era um lugar onde alguém desistia antes mesmo de criar qualquer coisa.</p>
      <p>O 0.9.0 elimina esses passos.</p>
      <p>Se você quer a versão longa, as <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">notas de lançamento no GitHub</a> têm tudo. Este post é a versão curta: o que mudou por baixo dos panos, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Por que começar era o trabalho</h2>
      <p>A primeira impressão de uma ferramenta de design quase nunca acontece no canvas. Ela acontece antes do canvas — na configuração que ninguém quer fazer. Olhamos para o nosso próprio funil de onboarding tempo suficiente para chegar a uma conclusão desconfortável: muita gente saía <em>antes</em> de criar qualquer coisa. Não porque o produto estivesse errado, mas porque "começar" era caro demais.</p>
      <p>O 0.9.0 reduz o começar àquela única linha que as pessoas realmente queriam:</p>
      <blockquote><strong>Abra o aplicativo → faça login uma vez → escolha um modelo → comece a criar.</strong></blockquote>
      <p>Sem configuração. Sem instalação de CLI. Sem chave de API necessária.</p>

      <h2>Os três pratos</h2>
      <p><strong>Open Design AMR — IA oficial, pronta no momento em que você instala.</strong> Começar costumava ser um imposto: instalar um CLI, caçar uma chave de API, colar segredos, testar a autenticação, brigar com o shell — e só então começar a desenhar. O 0.9.0 entrega o <a href="https://open-design.ai/amr">Open Design AMR</a> dentro do instalador. O motor de IA vem com o aplicativo; não há um CLI ou uma chave de API separada para configurar. O onboarding agora começa com o AMR, o login fica a um clique de distância no desktop, seus modelos disponíveis se mantêm atualizados automaticamente, e o status da conta e do saldo fica bem ali na interface. Anexos de imagem funcionam de imediato. Faça login uma vez, escolha um modelo, vai.</p>
      <p><strong>O banco de agentes fica muito maior.</strong> Aider, Trae CLI, Antigravity e DeepSeek Reasonix entram todos no seletor, dando aos criadores mais caminhos de agentes locais <em>reais</em> em vez de um único fluxo de trabalho abençoado. O Aider ganha branding de primeira classe, o Trae roda sobre ACP em modo yolo, e os novos adapters fazem o Open Design parecer menos uma integração de um agente e mais o lugar onde os agentes vêm trabalhar. Escolher modelos também deixa de parecer rolar uma lista telefônica: a busca corta listas longas, e um catálogo BYOK compartilhado mantém as Settings e o seletor em linha alinhados, de modo que trocar de modelo fica rápido em vez de chato.</p>
      <p><strong>As skills se tornam um ecossistema de plugins de verdade.</strong> Os bundles de skill se formam em Plugins de primeira classe: visíveis na gaveta, listáveis pelo CLI, indexados no site e mais fáceis de explicar aos usuários. Um modelo de extensão, uma biblioteca, um modelo mental. O plugin oficial GSAP traz animação web de verdade para dentro do loop do agente, e o Research Decision Room transforma prompts de pesquisa em avaliações estruturadas com múltiplos papéis em vez de uma resposta longa. A biblioteca de plugins no site agora espelha a taxonomia do aplicativo e é lida nativamente em todos os idiomas, e as páginas de detalhe de plugins e templates deixam de ser listagens estáticas para virar uma superfície de descoberta de verdade — visualizar, instalar, experimentar, compartilhar.</p>

      <h2>O que mais chega no 0.9.0</h2>
      <p>A versão é ampla. As peças que vale a pena destacar:</p>
      <ul>
        <li><strong>Continue conversando enquanto o modelo ainda trabalha.</strong> Coloque o próximo envio na fila no meio do stream, e o Open Design continua no momento em que a vez atual termina. Studio e Draw seguem o mesmo fluxo, então capturar uma ideia não depende de esperar a resposta anterior acabar.</li>
        <li><strong>Os design systems deixam de ser arquivos e viram ativos vivos.</strong> Renomeie-os, fixe os seus no topo, leia paletas reais a partir das tabelas de cores deles e conecte projetos de design system ao GitHub sem a dança de arquivos zip.</li>
        <li><strong>A revisão continua se movendo enquanto o artefato muda.</strong> O modo de comentário agora suporta anexos, atualizações de visualização ao vivo e desseleção limpa, de modo que capturas de tela e anotações permanecem coladas ao trabalho em vez de congelar o fluxo.</li>
        <li><strong>As rotinas parecem agendadas, não roteirizadas.</strong> Um seletor de verdade, resumos em linguagem natural, ordenação do mais novo primeiro, foco automático após criar, localização e limpeza de slots duplicados tornam as automações mais fáceis de confiar.</li>
        <li><strong>Os clientes MCP podem fazer trabalho de espaço de trabalho de verdade.</strong> Escreva arquivos, exclua arquivos, exclua projetos, resolva o diretório do projeto ativo, rode loops de geração e faça o bootstrap do Codex a partir de um só lugar. Os clientes externos agora podem participar do espaço de trabalho em vez de apenas observá-lo.</li>
        <li><strong>Experimentar o Open Design fica mais fácil no Windows e no Linux.</strong> O Windows ganha um caminho de zip portátil; o Linux ganha uma configuração com um clique via Docker / Podman Compose. Menos atrito de instalação, primeira execução mais rápida.</li>
      </ul>
      <p>A lista completa chega a 310 PRs. As <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">notas de lançamento no GitHub</a> carregam o resto.</p>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead><tr><th>Se você é…</th><th>Comece aqui</th></tr></thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o aplicativo desktop, faça login uma vez com o AMR, escolha um modelo e envie seu primeiro prompt — não há mais passo de chave de API no caminho</td></tr>
          <tr><td>Já usando o Open Design</td><td>Deixe a atualização automática empacotada te levar ao 0.9.0; o onboarding agora começa com o AMR</td></tr>
          <tr><td>Já conduzindo Claude Code, Codex, Aider ou Trae no terminal</td><td>Aponte-os para o mesmo OD CLI que vem com o aplicativo desktop; seu agente é o motor de design e a camada de skills adiciona gosto e estrutura sem um novo aplicativo</td></tr>
          <tr><td>No Windows ou no Linux</td><td>Pegue o zip portátil do Windows, ou use a configuração com um clique via Docker / Podman Compose do Linux para uma primeira execução sem tocar num instalador de sistema</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>Se você estava esperando que "instale e crie" fosse de fato verdade, esta é a versão. Baixe o aplicativo desktop, faça login com o AMR e rode o briefing que você ia rodar de qualquer jeito — desta vez não há configuração entre abrir o aplicativo e o primeiro artefato.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>310 PRs em 7 dias. A versão "instale e crie" só existe porque tanta gente apareceu de tantos ângulos diferentes e construiu as peças que faltavam. Um movimento não é enviado a partir dos laptops de uma única equipe; ele é enviado pelas pessoas que apareceram e construíram. Nós vemos vocês. 🫡</p>

      <h2>Leitura complementar</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: tudo é um plugin</a> — a reconstrução do motor sobre a qual o 0.9.0 está construído</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skill, não um produto</a> — o manifesto mais longo por trás da aposta "camada, não produto"</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">A alternativa open-source ao Claude Design</a> — onde esta versão se encaixa no cenário de design nativo de agentes</li>
      </ul>
  it:
    title: "Open Design 0.9.0: design per tutti"
    summary: "Open Design 0.9.0 è la release \"installa e crea\". Niente caccia al tesoro per le API key, niente configurazione di tre CLI: apri l'app, accedi una volta, scegli un modello e inizia a costruire. In più, una panchina di agent più ampia, una vera libreria di plugin e installazioni più facili su Windows e Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, rilasciato il 2 giugno 2026. <strong>310 PR da 98 contributori in sette giorni.</strong> Nome in codice "Design for everyone": questa è la <strong>release "installa e crea"</strong>. Per tre release ti abbiamo chiesto di fare del lavoro prima di poter lavorare: installare una CLI, trovare una API key, incollare segreti, testare l'autenticazione, scegliere il nome di modello giusto da una lista che dovevi cercare. Ognuno di quei passaggi era un punto in cui qualcuno abbandonava prima ancora di creare qualcosa.</p>
      <p>0.9.0 elimina quei passaggi.</p>
      <p>Se vuoi la versione lunga, le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">note di rilascio su GitHub</a> la contengono. Questo post è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Perché iniziare era il lavoro</h2>
      <p>La prima impressione di uno strumento di design non avviene quasi mai sulla tela. Avviene prima della tela, nella configurazione che nessuno vuole fare. Abbiamo fissato il nostro funnel di onboarding abbastanza a lungo da arrivare a una conclusione scomoda: molte persone se ne andavano <em>prima</em> di creare qualcosa. Non perché il prodotto fosse sbagliato, ma perché "iniziare" costava troppo.</p>
      <p>0.9.0 riduce l'inizio all'unica frase che le persone volevano davvero:</p>
      <blockquote><strong>Apri l'app → accedi una volta → scegli un modello → inizia a creare.</strong></blockquote>
      <p>Nessuna configurazione. Nessuna installazione di CLI. Nessuna API key richiesta.</p>

      <h2>I tre piatti</h2>
      <p><strong>Open Design AMR: l'AI ufficiale, pronta nel momento in cui installi.</strong> Iniziare era una tassa: installare una CLI, dare la caccia a una API key, incollare segreti, testare l'autenticazione, combattere con la shell, e solo allora iniziare a progettare. 0.9.0 include <a href="https://open-design.ai/amr">Open Design AMR</a> dentro l'installer. Il motore AI arriva con l'app; non c'è una CLI separata o una API key da configurare. L'onboarding ora parte da AMR, il login resta a un clic di distanza sul desktop, i tuoi modelli disponibili si mantengono aggiornati automaticamente, e lo stato dell'account e del saldo vive direttamente nell'interfaccia. Gli allegati immagine funzionano fuori dalla scatola. Accedi una volta, scegli un modello, vai.</p>
      <p><strong>La panchina degli agent diventa molto più ampia.</strong> Aider, Trae CLI, Antigravity e DeepSeek Reasonix entrano tutti nel selettore, offrendo ai costruttori più percorsi <em>reali</em> di agent locali invece di un unico flusso di lavoro benedetto. Aider ottiene un branding di prima classe, Trae gira su ACP in modalità yolo, e i nuovi adapter fanno sentire Open Design meno come una singola integrazione di agent e più come il luogo dove gli agent vengono a lavorare. Anche la scelta del modello smette di sembrare lo scorrere di un elenco telefonico: la ricerca taglia attraverso le liste lunghe, e un catalogo BYOK condiviso tiene allineati le Settings e lo switcher inline, così cambiare modello è veloce invece che macchinoso.</p>
      <p><strong>Le skill diventano un vero ecosistema di plugin.</strong> I bundle di skill si diplomano in Plugins di prima classe: visibili nel cassetto, elencabili dalla CLI, indicizzati sul sito e più facili da spiegare agli utenti. Un solo modello di estensione, una sola libreria, un solo modello mentale. Il plugin ufficiale GSAP porta animazioni web serie nel loop dell'agent, e Research Decision Room trasforma i prompt di ricerca in revisioni strutturate multi-ruolo invece di una lunga risposta unica. La libreria di plugin sul sito ora rispecchia la tassonomia in-app e si legge in modo nativo in tutte le lingue, e le pagine di dettaglio di plugin e template passano da elenchi statici a una vera superficie di scoperta: anteprima, installazione, prova, condivisione.</p>

      <h2>Cos'altro arriva in 0.9.0</h2>
      <p>La release è ampia. I pezzi che vale la pena mettere in primo piano:</p>
      <ul>
        <li><strong>Continua a parlare mentre il modello sta ancora lavorando.</strong> Metti in coda il prossimo invio a metà stream, e Open Design prosegue nel momento in cui il turno corrente finisce. Studio e Draw seguono lo stesso flusso, così catturare un'idea non dipende dall'aspettare la fine della risposta precedente.</li>
        <li><strong>I design system passano da file ad asset vivi.</strong> Rinominali, fissa in cima i tuoi, leggi i campioni reali dalle loro tabelle di colore, e collega i progetti di design system a GitHub senza il balletto dei file zip.</li>
        <li><strong>La revisione continua a muoversi mentre l'artefatto cambia.</strong> La modalità commento ora supporta allegati, aggiornamenti live dell'anteprima e deselezione pulita, così screenshot e note restano attaccati al lavoro invece di congelare il flusso.</li>
        <li><strong>Le routine sembrano pianificate, non programmate via script.</strong> Un vero selettore, riassunti in linguaggio naturale, ordinamento dal più recente, focus automatico dopo la creazione, localizzazione e pulizia degli slot duplicati rendono le automazioni più facili da fidarsi.</li>
        <li><strong>I client MCP possono fare vero lavoro nel workspace.</strong> Scrivere file, eliminare file, eliminare progetti, risolvere la directory del progetto attivo, eseguire loop di generazione e fare il bootstrap di Codex da un unico posto. I client esterni ora possono partecipare al workspace invece di limitarsi a osservarlo.</li>
        <li><strong>Provare Open Design diventa più facile su Windows e Linux.</strong> Windows ottiene un percorso con zip portatile; Linux ottiene una configurazione one-click con Docker / Podman Compose. Meno attrito nell'installazione, prima esecuzione più veloce.</li>
      </ul>
      <p>La lista completa arriva a 310 PR. Le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">note di rilascio su GitHub</a> contengono il resto.</p>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead><tr><th>Se sei…</th><th>Inizia qui</th></tr></thead>
        <tbody>
          <tr><td>Nuovo a Open Design</td><td>Scarica l'app desktop, accedi una volta con AMR, scegli un modello e invia il tuo primo prompt: in questo percorso non c'è più alcun passaggio con API key</td></tr>
          <tr><td>Già operativo con Open Design</td><td>Lascia che l'aggiornamento automatico integrato ti porti alla 0.9.0; l'onboarding ora parte da AMR</td></tr>
          <tr><td>Già impegnato a guidare Claude Code, Codex, Aider o Trae nel terminale</td><td>Puntali alla stessa OD CLI che l'app desktop include; il tuo agent è il motore di design e il livello di skill aggiunge gusto e struttura senza una nuova app</td></tr>
          <tr><td>Su Windows o Linux</td><td>Prendi la zip portatile per Windows, oppure usa la configurazione one-click con Docker / Podman Compose su Linux per una prima esecuzione senza toccare un installer di sistema</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>Se aspettavi che "installa e crea" diventasse davvero vero, questa è la release. Scarica l'app desktop, accedi con AMR ed esegui il brief che avresti eseguito comunque: questa volta non c'è alcuna configurazione tra l'apertura dell'app e il primo artefatto.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>310 PR in 7 giorni. La release "installa e crea" esiste solo perché tantissime persone si sono presentate da tantissime angolazioni diverse e hanno costruito i pezzi mancanti. Un movimento non si rilascia dai laptop di un solo team; si rilascia dalle persone che si sono presentate e hanno costruito. Vi vediamo. 🫡</p>

      <h2>Letture di approfondimento</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: tutto è un plugin</a>: la riscrittura del motore su cui si fonda la 0.9.0</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come livello di skill, non come prodotto</a>: il manifesto più lungo dietro la scommessa "livello, non prodotto"</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">L'alternativa open source a Claude Design</a>: dove si colloca questa release nel panorama del design agent-native</li>
      </ul>
  vi:
    title: "Open Design 0.9.0: thiết kế cho tất cả mọi người"
    summary: "Open Design 0.9.0 là phiên bản \"cài xong là tạo được\". Không còn phải đi săn lùng API key, không còn phải cài ba CLI — mở ứng dụng, đăng nhập một lần, chọn một mô hình, và bắt đầu xây dựng. Cùng với đó là dàn agent lớn hơn, một thư viện plugin thực thụ, và việc cài đặt dễ dàng hơn trên Windows và Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, phát hành ngày 2 tháng 6 năm 2026. <strong>310 PR từ 98 người đóng góp trong bảy ngày.</strong> Tên mã "Design for everyone" — đây là <strong>phiên bản "cài xong là tạo được"</strong>. Suốt ba phiên bản trước, chúng tôi đã bắt bạn phải làm việc trước khi có thể làm việc: cài một CLI, tìm một API key, dán bí mật vào, kiểm tra xác thực, chọn đúng tên mô hình từ một danh sách mà bạn phải tra cứu. Mỗi bước trong số đó đều là nơi có người bỏ cuộc trước khi kịp tạo ra bất cứ thứ gì.</p>
      <p>0.9.0 xóa bỏ những bước đó.</p>
      <p>Nếu bạn muốn bản dài, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">ghi chú phát hành trên GitHub</a> có đầy đủ chi tiết. Bài này là bản ngắn: điều gì đã thay đổi ở bên dưới, hôm nay bạn có thể làm gì với nó, và bắt đầu từ đâu.</p>

      <h2>Vì sao "bắt đầu" lại chính là phần việc khó</h2>
      <p>Ấn tượng đầu tiên về một công cụ thiết kế hầu như không bao giờ diễn ra trên khung vẽ. Nó diễn ra trước khung vẽ — trong khâu thiết lập mà chẳng ai muốn làm. Chúng tôi đã nhìn chằm chằm vào phễu onboarding của chính mình đủ lâu để rút ra một kết luận khó chịu: rất nhiều người rời đi <em>trước khi</em> kịp tạo ra bất cứ thứ gì. Không phải vì sản phẩm sai, mà vì "bắt đầu" quá đắt đỏ.</p>
      <p>0.9.0 cắt gọn việc bắt đầu xuống đúng một câu mà mọi người thực sự muốn:</p>
      <blockquote><strong>Mở ứng dụng → đăng nhập một lần → chọn một mô hình → bắt đầu tạo.</strong></blockquote>
      <p>Không cấu hình. Không cài CLI. Không cần API key.</p>

      <h2>Ba trụ cột chính</h2>
      <p><strong>Open Design AMR — AI chính thức, sẵn sàng ngay khi bạn cài.</strong> Trước đây, việc bắt đầu là một thứ thuế: cài CLI, lùng tìm API key, dán bí mật, kiểm tra xác thực, vật lộn với shell — rồi mới đến lúc thiết kế. 0.9.0 đưa <a href="https://open-design.ai/amr">Open Design AMR</a> vào ngay bên trong bộ cài. Động cơ AI đi kèm với ứng dụng; không có CLI riêng hay API key nào phải thiết lập. Onboarding giờ mở đầu bằng AMR, đăng nhập luôn chỉ cách một cú nhấp trên desktop, các mô hình khả dụng của bạn tự động luôn được cập nhật, và trạng thái tài khoản cùng số dư hiển thị ngay trong giao diện. Đính kèm hình ảnh hoạt động ngay từ đầu. Đăng nhập một lần, chọn một mô hình, và đi.</p>
      <p><strong>Dàn agent lớn hơn hẳn.</strong> Aider, Trae CLI, Antigravity và DeepSeek Reasonix đều gia nhập bộ chọn, mang lại cho người xây dựng nhiều con đường agent cục bộ <em>thực sự</em> hơn thay vì một quy trình làm việc được ấn định sẵn. Aider có cách trình bày thương hiệu hạng nhất, Trae chạy qua ACP ở chế độ yolo, và những adapter mới này khiến Open Design ngày càng giống "nơi các agent đến để làm việc" hơn là "một bản tích hợp agent đơn lẻ". Việc chọn mô hình cũng thôi giống như lật danh bạ điện thoại: tìm kiếm xuyên qua được những danh sách dài, và một danh mục BYOK dùng chung giúp Settings và bộ chuyển đổi trong dòng đồng bộ với nhau, nên đổi mô hình nhanh chứ không lích kích.</p>
      <p><strong>Skill trở thành một hệ sinh thái plugin thực thụ.</strong> Các skill bundle nay tốt nghiệp lên thành Plugins hạng nhất: nhìn thấy được trong ngăn kéo, liệt kê được từ CLI, được lập chỉ mục trên trang web, và dễ giải thích cho người dùng hơn. Một mô hình mở rộng, một thư viện, một mô hình tư duy. Plugin GSAP chính thức mang hoạt họa web nghiêm túc vào vòng lặp agent, còn Research Decision Room biến các prompt nghiên cứu thành những buổi đánh giá đa vai trò có cấu trúc thay vì một câu trả lời dài lê thê. Thư viện plugin trên trang web giờ phản chiếu đúng phân loại trong ứng dụng và đọc tự nhiên qua mọi ngôn ngữ, và các trang chi tiết plugin lẫn mẫu chuyển từ danh sách tĩnh thành một mặt khám phá thực thụ — xem trước, cài đặt, dùng thử, chia sẻ.</p>

      <h2>Còn gì nữa trong 0.9.0</h2>
      <p>Phiên bản này rất rộng. Những mảng đáng kéo lên phía trước:</p>
      <ul>
      <li><strong>Vừa ra sản phẩm vừa trò chuyện.</strong> Xếp hàng lượt gửi tiếp theo ngay giữa luồng, và Open Design tiếp tục ngay khi lượt hiện tại kết thúc. Studio và Draw cũng theo cùng một quy trình, nên việc ghi lại một ý tưởng không còn phải phụ thuộc vào việc chờ phản hồi trước đó kết thúc.</li>
      <li><strong>Hệ thống thiết kế chuyển từ tệp thành tài sản sống.</strong> Đổi tên chúng, ghim hệ thống của riêng bạn lên trên cùng, đọc bảng màu thật từ các bảng màu của chúng, và kết nối các dự án hệ thống thiết kế trực tiếp với GitHub mà không phải loay hoay với tệp zip.</li>
      <li><strong>Đánh giá tiếp tục di chuyển trong khi sản phẩm thay đổi.</strong> Chế độ bình luận giờ hỗ trợ đính kèm, cập nhật xem trước theo thời gian thực, và bỏ chọn gọn gàng, nên ảnh chụp màn hình và ghi chú luôn gắn với sản phẩm thay vì làm đóng băng cả luồng.</li>
      <li><strong>Tự động hóa có cảm giác được lên lịch, chứ không phải bị viết script.</strong> Một bộ chọn thời gian thực thụ, tóm tắt bằng ngôn ngữ tự nhiên, sắp xếp mới nhất lên trước, tự động lấy nét sau khi tạo, bản địa hóa, và dọn dẹp các khe trùng lặp khiến tự động hóa đáng tin cậy hơn.</li>
      <li><strong>Client MCP nay làm được công việc workspace thực sự.</strong> Ghi tệp, xóa tệp, xóa dự án, phân giải thư mục dự án đang hoạt động, chạy vòng lặp tạo sinh, và bootstrap Codex từ một nơi. Các client bên ngoài giờ có thể tham gia vào workspace thay vì chỉ đứng quan sát.</li>
      <li><strong>Dùng thử Open Design dễ hơn trên Windows và Linux.</strong> Windows có thêm một con đường portable zip; Linux có thiết lập một cú nhấp bằng Docker / Podman Compose. Ít ma sát khi cài đặt hơn, chạy lần đầu nhanh hơn.</li>
      </ul>
      <p>Danh sách đầy đủ lên tới 310 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Ghi chú phát hành trên GitHub</a> chứa phần còn lại.</p>

      <h2>Hôm nay làm gì với nó</h2>
      <table>
      <thead><tr><th>Nếu bạn là…</th><th>Bắt đầu từ đây</th></tr></thead>
      <tbody>
      <tr><td>Người mới với Open Design</td><td>Tải ứng dụng desktop, đăng nhập một lần bằng AMR, chọn một mô hình, và gửi prompt đầu tiên của bạn — trên con đường này không còn bước API key nào nữa</td></tr>
      <tr><td>Đã đang chạy Open Design</td><td>Để bản tự cập nhật được đóng gói đưa bạn lên 0.9.0; onboarding giờ mở đầu bằng AMR</td></tr>
      <tr><td>Đã đang điều khiển Claude Code, Codex, Aider hoặc Trae trong terminal</td><td>Trỏ chúng đến cùng một OD CLI mà ứng dụng desktop đi kèm; agent của bạn chính là động cơ thiết kế, và lớp skill bổ sung gu thẩm mỹ cùng cấu trúc mà không cần một ứng dụng mới</td></tr>
      <tr><td>Trên Windows hoặc Linux</td><td>Lấy bản portable zip cho Windows, hoặc dùng thiết lập một cú nhấp Docker / Podman Compose cho Linux để chạy lần đầu mà không phải đụng đến bộ cài hệ thống</td></tr>
      </tbody>
      </table>

      <h2>Tiếp theo làm gì</h2>
      <p>Nếu bạn đã chờ đợi "cài xong là tạo được" thực sự thành hiện thực, thì đây chính là phiên bản đó. Tải ứng dụng desktop, đăng nhập bằng AMR, và chạy bản brief mà dù sao bạn cũng định chạy — lần này không có khâu thiết lập nào nằm giữa việc mở ứng dụng và sản phẩm đầu tiên.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Tải Open Design</a>.</p>
      <p>310 PR trong 7 ngày. Phiên bản "cài xong là tạo được" chỉ tồn tại vì có quá nhiều người xuất hiện từ quá nhiều góc độ khác nhau và xây nên những mảnh ghép còn thiếu. Một phong trào không được phát đi từ laptop của một đội ngũ duy nhất; nó được phát đi từ những người đã có mặt và bắt tay vào xây dựng. Chúng tôi thấy các bạn. 🫡</p>

      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: mọi thứ đều là plugin</a> — bản viết lại động cơ mà 0.9.0 này được xây dựng lên trên</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, chứ không phải một sản phẩm</a> — bản tuyên ngôn dài hơi hơn đằng sau canh bạc "là một lớp, không phải một sản phẩm"</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Giải pháp mã nguồn mở thay thế cho Claude Design</a> — vị trí của phiên bản này trong bức tranh thiết kế agent-native</li>
      </ul>
  pl:
    title: "Open Design 0.9.0: projektowanie dla każdego"
    summary: "Open Design 0.9.0 to wydanie „zainstaluj i twórz\". Żadnego polowania na klucze API, żadnej konfiguracji trzech narzędzi CLI — otwórz aplikację, zaloguj się raz, wybierz model i zacznij budować. A do tego większa ławka agentów, prawdziwa biblioteka wtyczek oraz łatwiejsza instalacja na Windows i Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, wydany 2 czerwca 2026 r. <strong>310 PR-ów od 98 współtwórców w siedem dni.</strong> Nazwa kodowa „Design for everyone" — to nasze <strong>wydanie „zainstaluj i twórz"</strong>. Przez trzy wydania prosiliśmy Cię, żebyś wykonał pracę, zanim mógłbyś wykonać pracę: zainstaluj CLI, znajdź klucz API, wklej sekrety, przetestuj uwierzytelnianie, wybierz właściwą nazwę modelu z listy, którą musiałeś sam wyszukać. Każdy z tych kroków był miejscem, w którym ktoś odpadał, zanim cokolwiek stworzył.</p>
      <p>0.9.0 usuwa te kroki.</p>
      <p>Jeśli chcesz dłuższą wersję, mają ją <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">informacje o wydaniu na GitHub</a>. Ten wpis to wersja krótka: co zmieniło się pod maską, co możesz z tym zrobić już dziś i od czego zacząć.</p>

      <h2>Dlaczego rozpoczęcie pracy było pracą</h2>
      <p>Pierwsze wrażenie po narzędziu do projektowania prawie nigdy nie powstaje na płótnie. Powstaje przed płótnem — w konfiguracji, której nikt nie chce wykonywać. Wpatrywaliśmy się w nasz własny lejek onboardingu wystarczająco długo, by dojść do niewygodnego wniosku: wielu ludzi odchodziło, <em>zanim</em> cokolwiek stworzyli. Nie dlatego, że produkt był zły, ale dlatego, że „start" był zbyt kosztowny.</p>
      <p>0.9.0 sprowadza rozpoczęcie pracy do jednej linijki, której ludzie naprawdę chcieli:</p>
      <blockquote><strong>Otwórz aplikację → zaloguj się raz → wybierz model → zacznij tworzyć.</strong></blockquote>
      <p>Żadnej konfiguracji. Żadnej instalacji CLI. Żadnego wymaganego klucza API.</p>

      <h2>Trzy talerze</h2>
      <p><strong>Open Design AMR — oficjalna AI, gotowa w chwili instalacji.</strong> Rozpoczęcie pracy bywało podatkiem: zainstaluj CLI, wytrop klucz API, wklej sekrety, przetestuj uwierzytelnianie, powalcz z powłoką — i dopiero wtedy zacznij projektować. 0.9.0 dostarcza <a href="https://open-design.ai/amr">Open Design AMR</a> wewnątrz instalatora. Silnik AI przychodzi razem z aplikacją; nie ma osobnego CLI ani klucza API do skonfigurowania. Onboarding zaczyna się teraz od AMR, logowanie na komputerze jest zawsze o jedno kliknięcie, dostępne modele pozostają automatycznie aktualne, a status konta i salda jest widoczny wprost w interfejsie. Załączniki obrazów działają od razu. Zaloguj się raz, wybierz model i ruszaj.</p>
      <p><strong>Ławka agentów staje się znacznie większa.</strong> Aider, Trae CLI, Antigravity i DeepSeek Reasonix dołączają do selektora, dając budowniczym więcej <em>prawdziwych</em> ścieżek lokalnych agentów zamiast jednego namaszczonego przepływu pracy. Aider otrzymuje pierwszorzędną prezentację marki, Trae działa przez ACP w trybie yolo, a nowe adaptery sprawiają, że Open Design wydaje się mniej jak jedna integracja z agentem, a bardziej jak miejsce, do którego agenci przychodzą do pracy. Wybieranie modelu też przestaje przypominać przewijanie książki telefonicznej: wyszukiwanie przebija się przez długie listy, a wspólny katalog BYOK utrzymuje zgodność ustawień (Settings) i przełącznika w wierszu, więc zmiana modeli jest szybka, a nie żmudna.</p>
      <p><strong>Umiejętności (skills) stają się prawdziwym ekosystemem wtyczek.</strong> Pakiety umiejętności awansują do pierwszorzędnych wtyczek (Plugins): widoczne w szufladzie, możliwe do wylistowania z CLI, zaindeksowane na stronie i łatwiejsze do wyjaśnienia użytkownikom. Jeden model rozszerzeń, jedna biblioteka, jeden model mentalny. Oficjalna wtyczka GSAP wnosi poważną animację webową do pętli agenta, a Research Decision Room zamienia podpowiedzi badawcze w ustrukturyzowane, wieloosobowe recenzje zamiast jednej długiej odpowiedzi. Biblioteka wtyczek na stronie odzwierciedla teraz taksonomię z aplikacji i czyta się natywnie we wszystkich językach, a strony szczegółów wtyczek i szablonów zmieniają się ze statycznych list w prawdziwą powierzchnię odkrywania — podgląd, instalacja, wypróbowanie, udostępnienie.</p>

      <h2>Co jeszcze pojawia się w 0.9.0</h2>
      <p>To wydanie jest szerokie. Elementy warte wyciągnięcia na pierwszy plan:</p>
      <ul>
      <li><strong>Rozmawiaj dalej, gdy model wciąż pracuje.</strong> Ustaw kolejną wiadomość w kolejce w trakcie strumieniowania, a Open Design kontynuuje w chwili, gdy bieżąca tura się kończy. Studio i Draw idą tym samym torem, więc uchwycenie pomysłu nie zależy od oczekiwania na zakończenie poprzedniej odpowiedzi.</li>
      <li><strong>Systemy projektowe przechodzą z plików w żywe zasoby.</strong> Zmieniaj im nazwy, przypinaj własne na górę, odczytuj prawdziwe próbki z ich tabel kolorów i podłączaj projekty systemów projektowych do GitHub bez przerzucania plików zip.</li>
      <li><strong>Recenzja porusza się dalej, gdy artefakt się zmienia.</strong> Tryb komentarzy obsługuje teraz załączniki, aktualizacje podglądu na żywo i czyste odznaczanie, więc zrzuty ekranu i notatki pozostają przyczepione do pracy, zamiast zamrażać przepływ.</li>
      <li><strong>Rutyny wydają się zaplanowane, a nie zeskryptowane.</strong> Prawdziwy wybór czasu, podsumowania w języku naturalnym, sortowanie od najnowszych, automatyczny fokus po utworzeniu, lokalizacja i czyszczenie zduplikowanych slotów sprawiają, że automatyzacjom łatwiej zaufać.</li>
      <li><strong>Klienci MCP mogą wykonywać prawdziwą pracę w przestrzeni roboczej.</strong> Zapisuj pliki, usuwaj pliki, usuwaj projekty, rozwiązuj katalog aktywnego projektu, uruchamiaj pętle generowania i bootstrapuj Codex z jednego miejsca. Zewnętrzni klienci mogą teraz uczestniczyć w przestrzeni roboczej, zamiast tylko ją obserwować.</li>
      <li><strong>Wypróbowanie Open Design staje się łatwiejsze na Windows i Linux.</strong> Windows dostaje ścieżkę z przenośnym plikiem zip; Linux dostaje konfigurację jednym kliknięciem przez Docker / Podman Compose. Mniej tarcia przy instalacji, szybsze pierwsze uruchomienie.</li>
      </ul>
      <p>Pełna lista sięga 310 PR-ów. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Informacje o wydaniu na GitHub</a> niosą resztę.</p>

      <h2>Co z tym zrobić już dziś</h2>
      <table>
      <thead><tr><th>Jeśli jesteś…</th><th>Zacznij tutaj</th></tr></thead>
      <tbody>
      <tr><td>Nowy w Open Design</td><td>Pobierz aplikację desktopową, zaloguj się raz przez AMR, wybierz model i wyślij swoją pierwszą podpowiedź — na tej ścieżce nie ma już kroku z kluczem API</td></tr>
      <tr><td>Już używasz Open Design</td><td>Pozwól, by spakowana automatyczna aktualizacja doprowadziła Cię do 0.9.0; onboarding zaczyna się teraz od AMR</td></tr>
      <tr><td>Już sterujesz Claude Code, Codex, Aider lub Trae w terminalu</td><td>Skieruj je do tego samego OD CLI, które dostarcza aplikacja desktopowa; Twój agent jest silnikiem projektowym, a warstwa umiejętności dodaje smak i strukturę bez nowej aplikacji</td></tr>
      <tr><td>Na Windows lub Linux</td><td>Chwyć przenośny zip dla Windows albo użyj konfiguracji jednym kliknięciem przez Docker / Podman Compose na Linux, by uzyskać pierwsze uruchomienie bez dotykania systemowego instalatora</td></tr>
      </tbody>
      </table>

      <h2>Co dalej</h2>
      <p>Jeśli czekałeś, aż „zainstaluj i twórz" stanie się naprawdę prawdą, to jest to wydanie. Pobierz aplikację desktopową, zaloguj się przez AMR i uruchom brief, który i tak miałeś uruchomić — tym razem między otwarciem aplikacji a pierwszym artefaktem nie ma konfiguracji.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Pobierz Open Design</a>.</p>
      <p>310 PR-ów w 7 dni. Wydanie „zainstaluj i twórz" istnieje tylko dlatego, że tak wiele osób pojawiło się z tak wielu różnych stron i zbudowało brakujące elementy. Ruch nie wysyła się z laptopów jednego zespołu; wysyła się od ludzi, którzy się pojawili i zbudowali. Widzimy was. 🫡</p>

      <h2>Dalsza lektura</h2>
      <ul>
      <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: wszystko jest wtyczką</a> — przebudowa silnika, na której opiera się 0.9.0</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — dłuższy manifest stojący za zakładem „warstwa, nie produkt"</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Otwartoźródłowa alternatywa dla Claude Design</a> — gdzie to wydanie wpisuje się w krajobraz projektowania natywnego dla agentów</li>
      </ul>
  id:
    title: "Open Design 0.9.0: desain untuk semua orang"
    summary: "Open Design 0.9.0 adalah rilis pasang-dan-langsung-berkarya. Tidak perlu lagi berburu API key, tidak perlu menyiapkan tiga CLI — buka aplikasi, masuk sekali, pilih model, dan mulai membangun. Ditambah jajaran agent yang lebih luas, pustaka plugin yang sesungguhnya, serta pemasangan yang lebih mudah di Windows dan Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, dirilis pada 2 Juni 2026. <strong>310 PR dari 98 kontributor dalam tujuh hari.</strong> Nama sandi "Design for everyone" — ini adalah <strong>rilis pasang-dan-langsung-berkarya</strong>. Selama tiga rilis, kami meminta Anda mengerjakan pekerjaan sebelum bisa benar-benar bekerja: memasang CLI, mencari API key, menempelkan secret, menguji autentikasi, memilih nama model yang tepat dari daftar yang harus Anda cari sendiri. Setiap langkah itu adalah titik di mana seseorang berhenti sebelum sempat membuat apa pun.</p>
      <p>0.9.0 menghapus langkah-langkah itu.</p>
      <p>Jika Anda ingin versi panjangnya, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">catatan rilis di GitHub</a> memuat semuanya. Tulisan ini adalah versi singkatnya: apa yang berubah di balik layar, apa yang bisa Anda lakukan dengannya hari ini, dan dari mana harus mulai.</p>

      <h2>Mengapa memulai justru jadi pekerjaan tersendiri</h2>
      <p>Kesan pertama sebuah alat desain hampir tidak pernah terjadi di kanvas. Ia terjadi sebelum kanvas — pada tahap penyiapan yang tidak ingin dilakukan siapa pun. Kami menatap funnel onboarding kami sendiri cukup lama hingga sampai pada kesimpulan yang tidak menyenangkan: banyak orang pergi <em>sebelum</em> membuat apa pun. Bukan karena produknya salah, tetapi karena "memulai" terlalu mahal.</p>
      <p>0.9.0 memangkas proses memulai menjadi satu kalimat yang sebenarnya diinginkan orang:</p>
      <blockquote><strong>Buka aplikasi → masuk sekali → pilih model → mulai berkarya.</strong></blockquote>
      <p>Tanpa konfigurasi. Tanpa pemasangan CLI. Tanpa API key.</p>

      <h2>Tiga pilar utama</h2>
      <p><strong>Open Design AMR — AI resmi, siap begitu Anda memasangnya.</strong> Dulu memulai itu seperti pajak: pasang CLI, buru API key, tempel secret, uji autentikasi, bergulat dengan shell — baru setelah itu mulai mendesain. 0.9.0 menyertakan <a href="https://open-design.ai/amr">Open Design AMR</a> langsung di dalam installer. Mesin AI datang bersama aplikasi; tidak ada CLI terpisah atau API key yang perlu disiapkan. Onboarding kini diawali dengan AMR, proses masuk tetap berjarak satu klik di desktop, model yang tersedia tetap mutakhir secara otomatis, dan status akun serta saldo tampil langsung di antarmuka. Lampiran gambar berfungsi tanpa konfigurasi tambahan. Masuk sekali, pilih model, jalan.</p>
      <p><strong>Jajaran agent jadi jauh lebih besar.</strong> Aider, Trae CLI, Antigravity, dan DeepSeek Reasonix semuanya bergabung ke dalam pemilih, memberi para pembangun lebih banyak jalur agent lokal yang <em>nyata</em> alih-alih satu alur kerja tunggal yang ditahbiskan. Aider mendapat penyajian merek kelas satu, Trae berjalan melalui ACP dalam mode yolo, dan adapter baru ini membuat Open Design terasa kian bukan seperti "satu integrasi agent" melainkan lebih seperti tempat para agent datang untuk bekerja. Memilih model juga berhenti terasa seperti membolak-balik buku telepon: pencarian menembus daftar yang panjang, dan katalog BYOK bersama menjaga Settings dan pengalih inline tetap selaras sehingga berganti model jadi cepat alih-alih merepotkan.</p>
      <p><strong>Skill menjadi ekosistem plugin yang sesungguhnya.</strong> Skill bundle naik kelas menjadi Plugins kelas satu: terlihat di drawer, dapat didaftar dari CLI, terindeks di situs, dan lebih mudah dijelaskan kepada pengguna. Satu model ekstensi, satu pustaka, satu model mental. Plugin GSAP resmi membawa animasi web yang serius ke dalam loop agent, dan Research Decision Room mengubah prompt riset menjadi tinjauan multi-peran yang terstruktur alih-alih satu jawaban panjang. Pustaka plugin di situs kini mencerminkan taksonomi di dalam aplikasi dan dapat dibaca secara native di berbagai bahasa, dan halaman detail plugin serta template berubah dari daftar statis menjadi bidang penemuan yang nyata — pratinjau, pasang, coba, bagikan.</p>

      <h2>Apa lagi yang hadir di 0.9.0</h2>
      <p>Rilis ini luas. Bagian-bagian yang layak diangkat:</p>
      <ul>
        <li><strong>Terus mengobrol selagi model masih bekerja.</strong> Antrekan kiriman berikutnya di tengah aliran, dan Open Design melanjutkan begitu giliran saat ini selesai. Studio dan Draw mengikuti alur yang sama, sehingga menangkap sebuah ide tidak bergantung pada menunggu respons sebelumnya berakhir.</li>
        <li><strong>Design system berpindah dari berkas menjadi aset hidup.</strong> Ganti namanya, sematkan milik Anda sendiri di paling atas, baca swatch sungguhan dari tabel warnanya, dan hubungkan proyek design system ke GitHub tanpa repotnya bongkar-pasang berkas zip.</li>
        <li><strong>Tinjauan tetap bergerak selagi artefak berubah.</strong> Mode komentar kini mendukung lampiran, pembaruan pratinjau langsung, dan pembatalan pilihan yang rapi, sehingga tangkapan layar dan catatan tetap menempel pada karya alih-alih membekukan alurnya.</li>
        <li><strong>Otomatisasi terasa terjadwal, bukan ter-skrip.</strong> Pemilih waktu yang sungguhan, ringkasan bahasa alami, pengurutan terbaru lebih dahulu, fokus otomatis setelah dibuat, lokalisasi, dan pembersihan slot duplikat membuat otomatisasi lebih layak dipercaya.</li>
        <li><strong>Klien MCP kini bisa mengerjakan pekerjaan workspace yang nyata.</strong> Menulis berkas, menghapus berkas, menghapus proyek, menyelesaikan direktori proyek aktif, menjalankan loop generasi, dan mem-bootstrap Codex dari satu tempat. Klien eksternal kini dapat ikut serta dalam workspace alih-alih hanya mengamati.</li>
        <li><strong>Mencoba Open Design jadi lebih mudah di Windows dan Linux.</strong> Windows mendapat jalur portable zip; Linux mendapat penyiapan satu klik Docker / Podman Compose. Lebih sedikit hambatan pemasangan, jalan pertama lebih cepat.</li>
      </ul>
      <p>Daftar lengkapnya mencapai 310 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Catatan rilis di GitHub</a> memuat sisanya.</p>

      <h2>Apa yang bisa dilakukan dengannya hari ini</h2>
      <table>
        <thead><tr><th>Jika Anda…</th><th>Mulai dari sini</th></tr></thead>
        <tbody>
          <tr><td>Baru pertama kali memakai Open Design</td><td>Unduh aplikasi desktop, masuk sekali dengan AMR, pilih model, dan kirim prompt pertama Anda — di rilis ini tidak ada lagi langkah API key di sepanjang jalannya</td></tr>
          <tr><td>Sudah menjalankan Open Design</td><td>Biarkan pembaruan otomatis yang terpaket membawa Anda ke 0.9.0; setelahnya onboarding diawali dengan AMR</td></tr>
          <tr><td>Sudah menjalankan Claude Code, Codex, Aider, atau Trae di terminal</td><td>Arahkan semuanya ke OD CLI yang sama yang disertakan aplikasi desktop; agent yang sudah Anda miliki itulah mesin desainnya, dan lapisan skill menambahkan selera serta struktur tanpa aplikasi baru</td></tr>
          <tr><td>Di Windows atau Linux</td><td>Ambil portable zip Windows, atau gunakan penyiapan satu klik Docker / Podman Compose di Linux untuk jalan pertama tanpa menyentuh installer sistem</td></tr>
        </tbody>
      </table>

      <h2>Apa selanjutnya</h2>
      <p>Jika Anda menanti "pasang dan langsung berkarya" benar-benar terwujud, inilah rilisnya. Unduh aplikasi desktop, masuk dengan AMR, dan jalankan brief yang memang akan Anda jalankan — kali ini tidak ada penyiapan di antara membuka aplikasi dan artefak pertama.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Unduh Open Design</a>.</p>
      <p>310 PR dalam 7 hari. Rilis pasang-dan-langsung-berkarya ini ada justru karena begitu banyak orang muncul dari begitu banyak sudut berbeda dan membangun bagian-bagian yang hilang. Sebuah gerakan tidak dirilis dari laptop satu tim; ia dirilis dari orang-orang yang hadir dan membangun. Kami melihat kalian. 🫡</p>

      <h2>Bacaan lanjutan</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: semuanya adalah plugin</a> — penulisan ulang mesin yang menjadi landasan 0.9.0</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebuah produk</a> — manifesto yang lebih panjang di balik taruhan "lapisan, bukan produk"</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Alternatif sumber terbuka untuk Claude Design</a> — posisi rilis ini dalam lanskap desain yang agent-native</li>
      </ul>
  nl:
    title: "Open Design 0.9.0: ontwerpen voor iedereen"
    summary: "Open Design 0.9.0 is de installeer-en-creëer-release. Geen speurtocht naar API-sleutels, geen setup met drie CLI's — open de app, log één keer in, kies een model en begin te bouwen. Plus een grotere agent-bank, een echte plugin-bibliotheek en eenvoudiger installaties op Windows en Linux."
    bodyHtml: |
      <p>Tag <code>open-design-v0.9.0</code>, uitgebracht op 2 juni 2026. <strong>310 PR's van 98 bijdragers in zeven dagen.</strong> Codenaam "Design for everyone" — dit is de <strong>installeer-en-creëer-release</strong>. Drie releases lang vroegen we je om werk te doen voordat je werk kon doen: een CLI installeren, een API-sleutel zoeken, secrets plakken, authenticatie testen, de juiste modelnaam kiezen uit een lijst die je moest opzoeken. Elk van die stappen was een plek waar iemand afhaakte voordat hij ooit iets had gemaakt.</p>
      <p>0.9.0 schrapt die stappen.</p>
      <p>Wil je de lange versie, dan staat die in de <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">release notes op GitHub</a>. Dit bericht is de korte versie: wat er onder de motorkap is veranderd, wat je er vandaag mee kunt doen en waar je begint.</p>

      <h2>Waarom het op gang komen het werk was</h2>
      <p>De eerste indruk van een ontwerptool ontstaat bijna nooit op het canvas. Die ontstaat vóór het canvas — in de setup die niemand wil doen. We hebben lang genoeg naar onze eigen onboarding-funnel gestaard om tot een ongemakkelijke conclusie te komen: veel mensen vertrokken <em>voordat</em> ze iets maakten. Niet omdat het product fout was, maar omdat "starten" te duur was.</p>
      <p>0.9.0 brengt het starten terug tot de ene zin die mensen eigenlijk wilden:</p>
      <blockquote><strong>Open de app → log één keer in → kies een model → begin te creëren.</strong></blockquote>
      <p>Geen configuratie. Geen CLI-installatie. Geen API-sleutel vereist.</p>

      <h2>De drie hoofdlijnen</h2>
      <p><strong>Open Design AMR — officiële AI, klaar op het moment dat je installeert.</strong> Op gang komen was vroeger een belasting: een CLI installeren, een API-sleutel opsporen, secrets plakken, auth testen, vechten met de shell — en pas daarna ging je ontwerpen. 0.9.0 levert <a href="https://open-design.ai/amr">Open Design AMR</a> mee in het installatieprogramma. De AI-engine komt met de app; er is geen aparte CLI of API-sleutel om in te stellen. Onboarding begint nu met AMR, inloggen blijft op desktop één klik weg, je beschikbare modellen blijven automatisch actueel en de status van account en saldo staat direct in de UI. Afbeeldingsbijlagen werken meteen. Log één keer in, kies een model, ga.</p>
      <p><strong>De agent-bank wordt veel groter.</strong> Aider, Trae CLI, Antigravity en DeepSeek Reasonix komen allemaal in de kiezer en geven bouwers meer <em>echte</em> lokale-agentpaden in plaats van één gezegende workflow. Aider krijgt eersteklas branding, Trae draait via ACP in yolo-modus, en de nieuwe adapters maken dat Open Design minder aanvoelt als één agent-integratie en meer als de plek waar agents komen werken. Ook het kiezen van een model voelt niet langer als bladeren door een telefoonboek: zoeken snijdt door lange lijsten heen, en een gedeelde BYOK-catalogus houdt Settings en de inline-schakelaar op één lijn, zodat van model wisselen snel is in plaats van priegelig.</p>
      <p><strong>Skills worden een echt plugin-ecosysteem.</strong> Skill-bundels promoveren tot eersteklas Plugins: zichtbaar in de lade, op te sommen vanuit de CLI, geïndexeerd op de site en makkelijker uit te leggen aan gebruikers. Eén uitbreidingsmodel, één bibliotheek, één mentaal model. De officiële GSAP-plugin brengt serieuze webanimatie in de agent-lus, en Research Decision Room maakt van onderzoeksprompts gestructureerde reviews met meerdere rollen in plaats van één lang antwoord. De plugin-bibliotheek op de site weerspiegelt nu de taxonomie in de app en leest native in alle talen, en detailpagina's van plugins en templates veranderen van statische lijsten in een echt ontdekkingsoppervlak — voorbeeld bekijken, installeren, uitproberen, delen.</p>

      <h2>Wat er nog meer in 0.9.0 landt</h2>
      <p>De release is breed. De stukken die het waard zijn om naar voren te halen:</p>
      <ul>
        <li><strong>Blijf praten terwijl het model nog werkt.</strong> Zet de volgende verzending midden in de stream in de wachtrij, en Open Design gaat verder zodra de huidige beurt klaar is. Studio en Draw volgen dezelfde flow, dus een idee vastleggen hangt niet af van wachten tot het vorige antwoord eindigt.</li>
        <li><strong>Ontwerpsystemen gaan van bestanden naar levende assets.</strong> Hernoem ze, pin je eigen systeem bovenaan, lees echte stalen uit hun kleurtabellen, en koppel ontwerpsysteemprojecten aan GitHub zonder het gedoe met zip-bestanden.</li>
        <li><strong>Review blijft meebewegen terwijl het artefact verandert.</strong> Reactiemodus ondersteunt nu bijlagen, live preview-updates en netjes deselecteren, zodat screenshots en notities aan het werk gekoppeld blijven in plaats van de flow te bevriezen.</li>
        <li><strong>Routines voelen ingepland, niet gescript.</strong> Een echte kiezer, samenvattingen in natuurlijke taal, sortering met nieuwste eerst, automatische focus na aanmaken, lokalisatie en het opruimen van dubbele slots maken automatiseringen makkelijker te vertrouwen.</li>
        <li><strong>MCP-clients kunnen echt werk in de werkruimte doen.</strong> Bestanden schrijven, bestanden verwijderen, projecten verwijderen, de actieve projectmap bepalen, generatielussen draaien en Codex bootstrappen vanaf één plek. Externe clients kunnen nu deelnemen aan de werkruimte in plaats van die alleen te observeren.</li>
        <li><strong>Open Design uitproberen wordt makkelijker op Windows en Linux.</strong> Windows krijgt een portable zip-pad; Linux krijgt een Docker / Podman Compose one-click-setup. Minder installatiewrijving, snellere eerste run.</li>
      </ul>
      <p>De volledige lijst loopt op tot 310 PR's. De <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">release notes op GitHub</a> bevatten de rest.</p>

      <h2>Wat je er vandaag mee kunt doen</h2>
      <table>
        <thead><tr><th>Als je…</th><th>Begin hier</th></tr></thead>
        <tbody>
          <tr><td>Nieuw bent bij Open Design</td><td>Download de desktop-app, log één keer in met AMR, kies een model en stuur je eerste prompt — er zit geen API-sleutelstap meer op het pad</td></tr>
          <tr><td>Al met Open Design werkt</td><td>Laat de meegeleverde automatische update je naar 0.9.0 brengen; onboarding begint nu met AMR</td></tr>
          <tr><td>Al Claude Code, Codex, Aider of Trae aanstuurt in de terminal</td><td>Wijs ze naar dezelfde OD CLI die de desktop-app meelevert; jouw agent is de design-engine en de skill-laag voegt smaak en structuur toe zonder een nieuwe app</td></tr>
          <tr><td>Op Windows of Linux zit</td><td>Pak de Windows portable zip, of gebruik de Linux Docker / Podman Compose one-click-setup voor een eerste run zonder een systeeminstaller aan te raken</td></tr>
        </tbody>
      </table>

      <h2>Wat je hierna doet</h2>
      <p>Als je hebt gewacht tot "installeren en creëren" echt waar zou zijn, dan is dit de release. Download de desktop-app, log in met AMR en draai de brief die je toch al wilde draaien — deze keer zit er geen setup tussen het openen van de app en het eerste artefact.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Download Open Design</a>.</p>
      <p>310 PR's in 7 dagen. De installeer-en-creëer-release bestaat alleen omdat zo veel mensen uit zo veel verschillende invalshoeken opdaagden en de ontbrekende stukken bouwden. Een beweging wordt niet verstuurd vanaf de laptops van één team; ze wordt verstuurd door de mensen die kwamen opdagen en bouwden. We zien jullie. 🫡</p>

      <h2>Verder lezen</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: alles is een plugin</a> — de engine-herbouw waarop 0.9.0 is gebouwd</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — het langere manifest achter de inzet "laag, geen product"</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Het open-source-alternatief voor Claude Design</a> — waar deze release past in het agent-native ontwerplandschap</li>
      </ul>
  ar:
    title: "Open Design 0.9.0: التصميم للجميع"
    summary: "Open Design 0.9.0 هو إصدار «التثبيت والإنشاء». لا مطاردة لمفاتيح الـ API، ولا إعداد ثلاث أدوات سطر أوامر — افتح التطبيق، سجّل الدخول مرة واحدة، اختر نموذجًا، وابدأ البناء. بالإضافة إلى مجموعة وكلاء أكبر، ومكتبة إضافات حقيقية، وتثبيت أسهل على Windows وLinux."
    bodyHtml: |
      <p>الوسم <code>open-design-v0.9.0</code>، صدر في الثاني من يونيو 2026. <strong>310 طلبات سحب من 98 مساهمًا في سبعة أيام.</strong> الاسم الرمزي «Design for everyone» — هذا هو <strong>إصدار «التثبيت والإنشاء»</strong>. على مدى ثلاثة إصدارات طلبنا منك أن تعمل قبل أن تتمكن من العمل: ثبّت أداة سطر أوامر، ابحث عن مفتاح API، الصق الأسرار، اختبر المصادقة، اختر اسم النموذج الصحيح من قائمة كان عليك البحث عنها. كل خطوة من تلك الخطوات كانت مكانًا انسحب فيه أحدهم قبل أن يصنع أي شيء على الإطلاق.</p>
      <p>الإصدار 0.9.0 يحذف تلك الخطوات.</p>
      <p>إذا أردت النسخة الطويلة، <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">ملاحظات الإصدار على GitHub</a> تحتوي عليها. هذه التدوينة هي النسخة المختصرة: ما الذي تغيّر تحت الغطاء، وما الذي يمكنك فعله به اليوم، ومن أين تبدأ.</p>

      <h2>لماذا كان «البدء» هو العمل نفسه</h2>
      <p>الانطباع الأول لأداة تصميم لا يحدث أبدًا تقريبًا على لوحة الرسم. بل يحدث قبل لوحة الرسم — في الإعداد الذي لا يريد أحد القيام به. حدّقنا في قمع الإعداد الخاص بنا طويلًا بما يكفي للوصول إلى استنتاج مزعج: غادر كثير من الناس <em>قبل</em> أن يصنعوا أي شيء. ليس لأن المنتج كان خاطئًا، بل لأن «البدء» كان مكلفًا للغاية.</p>
      <p>الإصدار 0.9.0 يختصر البدء إلى السطر الواحد الذي أراده الناس فعلًا:</p>
      <blockquote><strong>افتح التطبيق ← سجّل الدخول مرة واحدة ← اختر نموذجًا ← ابدأ الإنشاء.</strong></blockquote>
      <p>لا تهيئة. لا تثبيت لأداة سطر أوامر. لا حاجة إلى مفتاح API.</p>

      <h2>المحاور الثلاثة</h2>
      <p><strong>Open Design AMR — ذكاء اصطناعي رسمي، جاهز لحظة التثبيت.</strong> كان البدء فيما مضى ضريبة: ثبّت أداة سطر أوامر، تتبّع مفتاح API، الصق الأسرار، اختبر المصادقة، صارع الـ shell — وعندها فقط تبدأ التصميم. الإصدار 0.9.0 يشحن <a href="https://open-design.ai/amr">Open Design AMR</a> داخل المثبّت. محرك الذكاء الاصطناعي يأتي مع التطبيق؛ لا توجد أداة سطر أوامر منفصلة أو مفتاح API لإعداده. أصبح الإعداد الأولي الآن يبدأ بـ AMR، ويبقى تسجيل الدخول على بُعد نقرة واحدة على سطح المكتب، وتبقى النماذج المتاحة لك محدّثة تلقائيًا، وحالة الحساب والرصيد تعيش مباشرة في الواجهة. مرفقات الصور تعمل جاهزة. سجّل الدخول مرة واحدة، اختر نموذجًا، وانطلق.</p>
      <p><strong>مجموعة الوكلاء تكبر بكثير.</strong> ينضم Aider وTrae CLI وAntigravity وDeepSeek Reasonix جميعًا إلى المنتقي، ما يمنح الباحثين عن البناء مزيدًا من مسارات الوكلاء المحلية <em>الحقيقية</em> بدلًا من سير عمل وحيد مُبارَك. يحصل Aider على هوية بصرية من الدرجة الأولى، ويعمل Trae عبر ACP في وضع yolo، وتجعل المحوّلات الجديدة Open Design يبدو أقل كأنه تكامل وكيل واحد وأكثر كأنه المكان الذي يأتي إليه الوكلاء للعمل. اختيار النموذج يتوقف أيضًا عن الشعور وكأنه تصفّح دفتر هاتف: البحث يخترق القوائم الطويلة، ويُبقي فهرس BYOK المشترك إعدادات Settings والمبدّل المضمّن متوائمين بحيث يصبح تبديل النماذج سريعًا بدلًا من أن يكون مُرهِقًا.</p>
      <p><strong>المهارات تصبح منظومة إضافات حقيقية.</strong> تتخرّج حِزَم المهارات لتصبح إضافات (Plugins) من الدرجة الأولى: مرئية في الدرج، وقابلة للسرد من سطر الأوامر، ومفهرسة على الموقع، وأسهل في الشرح للمستخدمين. نموذج توسعة واحد، ومكتبة واحدة، ونموذج ذهني واحد. تجلب إضافة GSAP الرسمية رسومًا متحركة جادة للويب إلى حلقة الوكيل، وتحوّل Research Decision Room مطالبات البحث إلى مراجعات منظّمة متعددة الأدوار بدلًا من إجابة واحدة طويلة. تعكس مكتبة الإضافات على الموقع الآن التصنيف الموجود داخل التطبيق وتُقرأ أصليًا عبر اللغات، وتتحوّل صفحات تفاصيل الإضافات والقوالب من قوائم ثابتة إلى سطح اكتشاف حقيقي — معاينة، وتثبيت، وتجربة، ومشاركة.</p>

      <h2>ما الذي يحمله الإصدار 0.9.0 أيضًا</h2>
      <p>الإصدار واسع. القطع التي تستحق إبرازها:</p>
      <ul>
        <li><strong>واصل الحديث بينما لا يزال النموذج يعمل.</strong> ضع الرسالة التالية في قائمة الانتظار أثناء البث، ويواصل Open Design لحظة انتهاء الدور الحالي. يتبع Studio وDraw التدفق نفسه، فلا يعتمد التقاط فكرة على انتظار انتهاء الرد السابق.</li>
        <li><strong>أنظمة التصميم تنتقل من ملفات إلى أصول حية.</strong> أعد تسميتها، وثبّت أنظمتك الخاصة في الأعلى، واقرأ عيّنات ألوان حقيقية من جداول ألوانها، واربط مشاريع أنظمة التصميم بـ GitHub دون عناء تبادل ملفات zip.</li>
        <li><strong>المراجعة تستمر بالتحرّك بينما يتغيّر الناتج.</strong> يدعم وضع التعليق الآن المرفقات، وتحديثات المعاينة الحية، وإلغاء التحديد النظيف، بحيث تبقى لقطات الشاشة والملاحظات مرتبطة بالعمل بدلًا من تجميد التدفق.</li>
        <li><strong>الإجراءات الروتينية تبدو مُجدوَلة، لا مكتوبة كنصوص برمجية.</strong> منتقٍ حقيقي، وملخّصات بلغة طبيعية، وترتيب الأحدث أولًا، وتركيز تلقائي بعد الإنشاء، وتعريب، وتنظيف الفتحات المكرّرة — كل ذلك يجعل الأتمتة أجدر بالثقة.</li>
        <li><strong>عملاء MCP يستطيعون القيام بعمل حقيقي في مساحة العمل.</strong> اكتب الملفات، واحذف الملفات، واحذف المشاريع، وحُلّ دليل المشروع النشط، وشغّل حلقات التوليد، وهيّئ Codex من مكان واحد. يستطيع العملاء الخارجيون الآن المشاركة في مساحة العمل بدلًا من مجرد مراقبتها.</li>
        <li><strong>تجربة Open Design تصبح أسهل على Windows وLinux.</strong> يحصل Windows على مسار zip محمول؛ ويحصل Linux على إعداد Docker / Podman Compose بنقرة واحدة. احتكاك أقل في التثبيت، وتشغيل أول أسرع.</li>
      </ul>
      <p>القائمة الكاملة تصل إلى 310 طلبات سحب. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">ملاحظات الإصدار على GitHub</a> تحمل بقية التفاصيل.</p>

      <h2>ماذا تفعل به اليوم</h2>
      <table>
        <thead><tr><th>إذا كنت…</th><th>ابدأ من هنا</th></tr></thead>
        <tbody>
          <tr><td>جديدًا على Open Design</td><td>نزّل تطبيق سطح المكتب، وسجّل الدخول مرة واحدة باستخدام AMR، واختر نموذجًا، وأرسل مطالبتك الأولى — لم يعد هناك خطوة مفتاح API على المسار</td></tr>
          <tr><td>تشغّل Open Design بالفعل</td><td>دع التحديث التلقائي المُحزَّم ينقلك إلى 0.9.0؛ أصبح الإعداد الأولي الآن يبدأ بـ AMR</td></tr>
          <tr><td>تقود بالفعل Claude Code أو Codex أو Aider أو Trae في الطرفية</td><td>وجّهها إلى نفس أداة OD CLI التي يشحنها تطبيق سطح المكتب؛ وكيلك هو محرك التصميم، وطبقة المهارات تضيف الذوق والبنية دون تطبيق جديد</td></tr>
          <tr><td>على Windows أو Linux</td><td>احصل على zip المحمول لـ Windows، أو استخدم إعداد Docker / Podman Compose بنقرة واحدة على Linux للحصول على تشغيل أول دون المساس بمثبّت النظام</td></tr>
        </tbody>
      </table>

      <h2>ماذا تفعل بعد ذلك</h2>
      <p>إذا كنت تنتظر أن يصبح «التثبيت والإنشاء» حقيقة فعلًا، فهذا هو الإصدار. نزّل تطبيق سطح المكتب، وسجّل الدخول باستخدام AMR، وشغّل المهمة التي كنت ستشغّلها على أي حال — هذه المرة لا يوجد إعداد بين فتح التطبيق وأول ناتج.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">نزّل Open Design</a>.</p>
      <p>310 طلبات سحب في 7 أيام. إصدار «التثبيت والإنشاء» موجود فقط لأن كثيرًا من الناس حضروا من زوايا مختلفة كثيرة وبنوا القطع المفقودة. الحركة لا تُشحَن من حواسيب فريق واحد؛ بل تُشحَن من الناس الذين حضروا وبنوا. نراكم. 🫡</p>

      <h2>قراءات إضافية</h2>
      <ul>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: كل شيء إضافة</a> — إعادة بناء المحرك التي يقوم عليها الإصدار 0.9.0</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات، لا كمنتج</a> — البيان الأطول وراء رهان «طبقة، لا منتج»</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">البديل مفتوح المصدر لـ Claude Design</a> — أين يقع هذا الإصدار في مشهد التصميم الأصلي للوكلاء</li>
      </ul>
  tr:
    title: "Open Design 0.9.0: herkes için tasarım"
    summary: "Open Design 0.9.0, kur-ve-üret sürümüdür. API anahtarı avına gerek yok, üç ayrı CLI kurulumu yok — uygulamayı aç, bir kez giriş yap, bir model seç ve üretmeye başla. Üstüne daha geniş bir agent kadrosu, gerçek bir eklenti kütüphanesi ve Windows ile Linux'ta daha kolay kurulum."
    bodyHtml: |
      <p><code>open-design-v0.9.0</code> etiketi, 2 Haziran 2026'da yayınlandı. <strong>Yedi günde 98 katılımcıdan 310 PR.</strong> Kod adı "Design for everyone" — bu, <strong>kur-ve-üret sürümü</strong>. Üç sürüm boyunca, iş yapabilmeniz için önce iş yapmanızı istedik: bir CLI kur, bir API anahtarı bul, gizli anahtarları yapıştır, kimlik doğrulamasını test et, bakman gereken bir listeden doğru model adını seç. Bu adımların her biri, birinin daha hiçbir şey üretemeden vazgeçtiği bir yerdi.</p>
      <p>0.9.0 bu adımları siliyor.</p>
      <p>Uzun versiyonu isterseniz, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub'daki sürüm notlarında</a> hepsi var. Bu yazı kısa versiyon: kaputun altında ne değişti, bugün bununla ne yapabilirsiniz ve nereden başlamalısınız.</p>

      <h2>Neden başlamak işin kendisiydi</h2>
      <p>Bir tasarım aracının ilk izlenimi neredeyse hiçbir zaman tuvalde gerçekleşmez. Tuvalden önce gerçekleşir — kimsenin yapmak istemediği o kurulum aşamasında. Kendi onboarding hunimize yeterince uzun süre baktıktan sonra rahatsız edici bir sonuca vardık: birçok insan herhangi bir şey üretmeden <em>önce</em> ayrılıyordu. Ürün yanlış olduğu için değil, "başlamak" çok pahalı olduğu için.</p>
      <p>0.9.0, başlamayı insanların gerçekten istediği o tek satıra indiriyor:</p>
      <blockquote><strong>Uygulamayı aç → bir kez giriş yap → bir model seç → üretmeye başla.</strong></blockquote>
      <p>Yapılandırma yok. CLI kurulumu yok. API anahtarı gerekmiyor.</p>

      <h2>Üç ana hat</h2>
      <p><strong>Open Design AMR — resmi yapay zeka, kurar kurmaz hazır.</strong> Başlamak eskiden bir vergiydi: bir CLI kur, bir API anahtarı bul, gizli anahtarları yapıştır, kimlik doğrulamasını test et, shell ile boğuş — ve ancak ondan sonra tasarıma geç. 0.9.0, <a href="https://open-design.ai/amr">Open Design AMR</a>'ı doğrudan kurulum paketinin içinde sunuyor. Yapay zeka motoru uygulamayla birlikte gelir; ayrıca kurulacak bir CLI ya da API anahtarı yoktur. Onboarding artık AMR ile başlıyor, masaüstünde giriş her zaman bir tık uzakta kalıyor, kullanılabilir modelleriniz otomatik olarak güncel kalıyor ve hesap ile bakiye durumu doğrudan arayüzde duruyor. Görsel ekleri kutudan çıkar çıkmaz çalışır. Bir kez giriş yap, bir model seç, başla.</p>
      <p><strong>Agent kadrosu çok daha büyüyor.</strong> Aider, Trae CLI, Antigravity ve DeepSeek Reasonix hepsi seçiciye katılıyor; tek bir kutsanmış iş akışı yerine üreticilere daha fazla <em>gerçek</em> yerel agent yolu sunuyor. Aider birinci sınıf bir markalaşma kazanıyor, Trae yolo modunda ACP üzerinden çalışıyor ve yeni adaptörler Open Design'ı tek bir agent entegrasyonu gibi değil, agentların çalışmaya geldiği yer gibi hissettiriyor. Model seçmek de artık bir telefon rehberini kaydırmak gibi gelmiyor: arama uzun listeleri keser, paylaşılan bir BYOK kataloğu Settings ile satır içi anahtarlayıcıyı hizalı tutar; böylece model değiştirmek didikleyici olmak yerine hızlı olur.</p>
      <p><strong>Skill'ler gerçek bir eklenti ekosistemine dönüşüyor.</strong> Skill paketleri birinci sınıf Plugins olarak mezun oluyor: çekmecede görünür, CLI'dan listelenebilir, sitede indekslenir ve kullanıcılara açıklaması daha kolay. Tek bir uzantı modeli, tek bir kütüphane, tek bir zihinsel model. Resmi GSAP eklentisi ciddi web animasyonunu agent döngüsünün içine getiriyor, Research Decision Room ise araştırma istemlerini tek bir uzun yanıt yerine yapılandırılmış çok rollü incelemelere dönüştürüyor. Sitedeki eklenti kütüphanesi artık uygulama içi sınıflandırmayı yansıtıyor ve diller arası kendi dilinde okunuyor; eklenti ve şablon ayrıntı sayfaları statik listelerden gerçek bir keşif yüzeyine dönüşüyor — önizle, kur, dene, paylaş.</p>

      <h2>0.9.0'da başka neler var</h2>
      <p>Bu sürüm geniş. Öne çıkarmaya değer parçalar:</p>
      <ul>
      <li><strong>Model hâlâ çalışırken konuşmaya devam et.</strong> Bir sonraki gönderiyi akış ortasında sıraya al, mevcut tur biter bitmez Open Design devam etsin. Studio ve Draw da aynı akışı izler; böylece bir fikri yakalamak önceki yanıtın bitmesini beklemeye bağlı olmaz.</li>
      <li><strong>Tasarım sistemleri dosyalardan yaşayan varlıklara taşınır.</strong> Onları yeniden adlandır, kendi sistemlerini en üste sabitle, renk tablolarından gerçek renk örneklerini oku ve tasarım sistemi projelerini zip-dosyası mekiğine gerek kalmadan GitHub'a bağla.</li>
      <li><strong>İnceleme, eser değişirken hareket halinde kalır.</strong> Yorum modu artık ekleri, canlı önizleme güncellemelerini ve temiz seçim kaldırmayı destekler; böylece ekran görüntüleri ve notlar akışı dondurmak yerine işe bağlı kalır.</li>
      <li><strong>Rutinler betiklenmiş değil, zamanlanmış gibi hissettirir.</strong> Gerçek bir seçici, doğal dilde özetler, en yeniden eskiye sıralama, oluşturduktan sonra otomatik odaklanma, yerelleştirme ve yinelenen yuva temizliği otomasyonlara güvenmeyi kolaylaştırır.</li>
      <li><strong>MCP istemcileri gerçek çalışma alanı işleri yapabilir.</strong> Dosya yaz, dosya sil, proje sil, etkin proje dizinini çöz, üretim döngüleri çalıştır ve Codex'i tek bir yerden bootstrap et. Harici istemciler artık çalışma alanını yalnızca izlemek yerine ona katılabilir.</li>
      <li><strong>Open Design'ı denemek Windows ve Linux'ta kolaylaşıyor.</strong> Windows taşınabilir bir zip yolu kazanıyor; Linux Docker / Podman Compose tek tıkla kurulum kazanıyor. Daha az kurulum sürtünmesi, daha hızlı ilk çalıştırma.</li>
      </ul>
      <p>Tam liste 310 PR'a ulaşıyor. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">GitHub'daki sürüm notları</a> geri kalanını taşıyor.</p>

      <h2>Bugün bununla ne yapmalı</h2>
      <table>
      <thead><tr><th>Eğer şuysanız…</th><th>Buradan başla</th></tr></thead>
      <tbody>
      <tr><td>Open Design'da yeniyseniz</td><td>Masaüstü uygulamasını indir, AMR ile bir kez giriş yap, bir model seç ve ilk isteminizi gönder — bu sürümde yol üzerinde artık API anahtarı adımı yok</td></tr>
      <tr><td>Zaten Open Design çalıştırıyorsanız</td><td>Paketlenmiş otomatik güncellemenin sizi 0.9.0'a getirmesine izin ver; onboarding artık AMR ile başlıyor</td></tr>
      <tr><td>Terminalde zaten Claude Code, Codex, Aider veya Trae sürüyorsanız</td><td>Onları masaüstü uygulamasının birlikte sunduğu aynı OD CLI'a yönlendir; agent'ınız tasarım motorudur ve skill katmanı yeni bir uygulamaya gerek kalmadan zevk ve yapı ekler</td></tr>
      <tr><td>Windows veya Linux'ta iseniz</td><td>Windows taşınabilir zip'i al ya da bir sistem kurulumcusuna dokunmadan ilk çalıştırma için Linux Docker / Podman Compose tek tıkla kurulumu kullan</td></tr>
      </tbody>
      </table>

      <h2>Sırada ne var</h2>
      <p>"Kur ve üret" sözünün gerçekten doğru olmasını bekliyorduysanız, işte o sürüm bu. Masaüstü uygulamasını indir, AMR ile giriş yap ve zaten çalıştıracak olduğun brief'i çalıştır — bu sefer uygulamayı açmakla ilk eser arasında hiçbir kurulum yok.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indir</a>.</p>
      <p>7 günde 310 PR. Kur-ve-üret sürümü yalnızca, bu kadar çok insanın bu kadar farklı açıdan ortaya çıkıp eksik parçaları inşa etmesi sayesinde var. Bir hareket tek bir ekibin dizüstü bilgisayarlarından yayınlanmaz; ortaya çıkıp inşa eden insanlardan yayınlanır. Sizi görüyoruz. 🫡</p>

      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: her şey bir eklentidir</a> — 0.9.0'ın üzerine inşa edildiği motor yeniden yazımı</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil de bir skill katmanı olarak kurduk</a> — "katman, ürün değil" bahsinin arkasındaki daha uzun manifesto</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design'a açık kaynak alternatif</a> — bu sürümün agent-yerel tasarım manzarasındaki yeri</li>
      </ul>
  uk:
    title: "Open Design 0.9.0: дизайн для кожного"
    summary: "Open Design 0.9.0 — це реліз «встанови й твори». Жодних пошуків API-ключа, жодного налаштування трьох CLI — відкрий застосунок, увійди один раз, обери модель і починай створювати. Плюс більший набір агентів, справжня бібліотека плагінів і простіше встановлення на Windows та Linux."
    bodyHtml: |
      <p>Тег <code>open-design-v0.9.0</code>, випущено 2 червня 2026 року. <strong>310 PR від 98 контрибуторів за сім днів.</strong> Кодова назва «Design for everyone» — це наш <strong>реліз «встанови й твори»</strong>. Протягом трьох релізів ми просили вас зробити роботу, перш ніж ви зможете робити роботу: встановити CLI, знайти API-ключ, вставити секрети, перевірити автентифікацію, обрати правильну назву моделі зі списку, який доводилося шукати. Кожен із цих кроків був місцем, де хтось відмовлявся, так і не створивши нічого.</p>
      <p>0.9.0 видаляє ці кроки.</p>
      <p>Якщо ви хочете довгу версію, її містять <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">примітки до релізу на GitHub</a>. Цей допис — коротка версія: що змінилося під капотом, що ви можете робити з цим сьогодні та з чого почати.</p>

      <h2>Чому «початок роботи» і був роботою</h2>
      <p>Перше враження від інструмента дизайну майже ніколи не виникає на полотні. Воно виникає до полотна — у налаштуванні, яким ніхто не хоче займатися. Ми дивилися на власну воронку онбордингу достатньо довго, щоб дійти незручного висновку: багато людей ішли <em>до того</em>, як хоч щось створити. Не тому, що продукт був поганим, а тому, що «почати» коштувало надто дорого.</p>
      <p>0.9.0 скорочує початок до того одного рядка, якого люди насправді хотіли:</p>
      <blockquote><strong>Відкрий застосунок → увійди один раз → обери модель → починай творити.</strong></blockquote>
      <p>Жодного налаштування. Жодного встановлення CLI. Жодного API-ключа.</p>

      <h2>Три головні напрями</h2>
      <p><strong>Open Design AMR — офіційний ШІ, готовий у мить установлення.</strong> Раніше початок роботи був податком: встанови CLI, розшукай API-ключ, вставляй секрети, тестуй автентифікацію, борися з оболонкою — і лише потім починай дизайн. 0.9.0 постачає <a href="https://open-design.ai/amr">Open Design AMR</a> усередині інсталятора. Рушій ШІ йде разом із застосунком; немає окремого CLI чи API-ключа, які треба налаштовувати. Онбординг тепер починається з AMR, вхід залишається за один клік на десктопі, ваші доступні моделі автоматично залишаються актуальними, а статус акаунта й балансу живе прямо в інтерфейсі. Вкладення зображень працюють «з коробки». Увійди один раз, обери модель — і вперед.</p>
      <p><strong>Набір агентів стає значно більшим.</strong> Aider, Trae CLI, Antigravity та DeepSeek Reasonix усі приєднуються до селектора, даючи творцям більше <em>справжніх</em> шляхів локальних агентів замість єдиного благословенного робочого процесу. Aider отримує брендинг першого класу, Trae працює через ACP у режимі yolo, а нові адаптери роблять так, що Open Design відчувається менше як одна інтеграція агента й більше як місце, куди агенти приходять працювати. Вибір моделі теж перестає відчуватися як гортання телефонної книги: пошук пробивається крізь довгі списки, а спільний каталог BYOK тримає Settings та вбудований перемикач узгодженими, тож зміна моделей швидка, а не марудна.</p>
      <p><strong>Skills стають справжньою екосистемою плагінів.</strong> Набори skill випускаються в першокласні Plugins: видимі у шухляді, перелічувані з CLI, проіндексовані на сайті й простіші для пояснення користувачам. Одна модель розширення, одна бібліотека, одна ментальна модель. Офіційний плагін GSAP приносить серйозну вебанімацію в цикл агента, а Research Decision Room перетворює дослідницькі промпти на структуровані багаторольові рецензії замість однієї довгої відповіді. Бібліотека плагінів на сайті тепер віддзеркалює таксономію в застосунку та читається нативно різними мовами, а сторінки деталей плагінів і шаблонів перетворюються зі статичних переліків на справжню поверхню відкриття — попередній перегляд, встановлення, проба, поширення.</p>

      <h2>Що ще з'являється в 0.9.0</h2>
      <p>Реліз широкий. Частини, які варто винести наперед:</p>
      <ul>
      <li><strong>Продовжуйте розмову, поки модель ще працює.</strong> Поставте наступне відправлення в чергу посеред потоку, і Open Design продовжить тієї миті, як завершиться поточний хід. Studio й Draw слідують тому самому потоку, тож фіксація ідеї не залежить від очікування завершення попередньої відповіді.</li>
      <li><strong>Дизайн-системи переходять із файлів у живі активи.</strong> Перейменовуйте їх, закріплюйте власні нагорі, читайте справжні зразки кольорів із їхніх таблиць кольорів і під'єднуйте проєкти дизайн-систем до GitHub без перетасовки zip-файлів.</li>
      <li><strong>Рецензування рухається далі, поки артефакт змінюється.</strong> Режим коментарів тепер підтримує вкладення, оновлення попереднього перегляду в реальному часі та чисте зняття виділення, тож скриншоти й нотатки залишаються прикріпленими до роботи, замість того щоб заморожувати потік.</li>
      <li><strong>Рутини відчуваються запланованими, а не заскриптованими.</strong> Справжній вибір часу, резюме природною мовою, упорядкування «найновіші першими», автофокус після створення, локалізація та очищення дублікатів слотів роблять автоматизації простішими для довіри.</li>
      <li><strong>MCP-клієнти можуть робити справжню роботу у робочому просторі.</strong> Записувати файли, видаляти файли, видаляти проєкти, визначати активну директорію проєкту, запускати цикли генерації та bootstrap-ити Codex з одного місця. Зовнішні клієнти тепер можуть брати участь у робочому просторі, а не лише спостерігати за ним.</li>
      <li><strong>Спробувати Open Design стає простіше на Windows і Linux.</strong> Windows отримує шлях portable zip; Linux отримує налаштування в один клік через Docker / Podman Compose. Менше тертя при встановленні, швидший перший запуск.</li>
      </ul>
      <p>Повний список сягає 310 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0">Примітки до релізу на GitHub</a> несуть решту.</p>

      <h2>Що робити з цим сьогодні</h2>
      <table>
      <thead><tr><th>Якщо ви…</th><th>Почніть звідси</th></tr></thead>
      <tbody>
      <tr><td>Новачок в Open Design</td><td>Завантажте десктопний застосунок, увійдіть один раз через AMR, оберіть модель і надішліть свій перший промпт — на цьому шляху більше немає кроку з API-ключем</td></tr>
      <tr><td>Уже працюєте з Open Design</td><td>Дозвольте запакованому автооновленню перенести вас на 0.9.0; онбординг тепер починається з AMR</td></tr>
      <tr><td>Уже керуєте Claude Code, Codex, Aider чи Trae у терміналі</td><td>Спрямуйте їх на той самий OD CLI, з яким постачається десктопний застосунок; ваш агент — це рушій дизайну, а шар skill додає смак і структуру без нового застосунку</td></tr>
      <tr><td>На Windows чи Linux</td><td>Візьміть Windows portable zip або скористайтеся налаштуванням в один клік через Docker / Podman Compose на Linux для першого запуску без дотику до системного інсталятора</td></tr>
      </tbody>
      </table>

      <h2>Що робити далі</h2>
      <p>Якщо ви чекали, поки «встанови й твори» стане справді правдою, це той реліз. Завантажте десктопний застосунок, увійдіть через AMR і запустіть той бриф, який ви все одно збиралися запустити — цього разу між відкриттям застосунку й першим артефактом немає налаштування.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Завантажити Open Design</a>.</p>
      <p>310 PR за 7 днів. Реліз «встанови й твори» існує лише тому, що так багато людей з'явилося з такою кількістю різних кутів і збудувало відсутні частини. Рух не відвантажується з ноутбуків однієї команди; він відвантажується від людей, які прийшли й будували. Ми вас бачимо. 🫡</p>

      <h2>Що почитати ще</h2>
      <ul>
      <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: усе є плагіном</a> — перебудова рушія, на якій збудовано 0.9.0</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми збудували Open Design як шар skill, а не як продукт</a> — довший маніфест за ставкою «шар, а не продукт»</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Open-source альтернатива Claude Design</a> — де цей реліз вписується в ландшафт agent-native дизайну</li>
      </ul>
---

Tag `open-design-v0.9.0`, shipped 2 June 2026. **310 PRs from 98 contributors in seven days.** Codename "Design for everyone" — this is the **install-and-create release**. For three releases we asked you to do work before you could do work: install a CLI, find an API key, paste secrets, test authentication, pick the right model name from a list you had to look up. Every one of those steps was a place where someone bounced before they ever made anything.

0.9.0 deletes those steps.

If you want the long version, the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0) have it. This post is the short version: what changed under the hood, what you can do with it today, and where to start.

## Why getting started was the work

A design tool's first impression almost never happens on the canvas. It happens before the canvas — in the setup nobody wants to do. We stared at our own onboarding funnel long enough to reach an uncomfortable conclusion: a lot of people left *before* making anything. Not because the product was wrong, but because "start" was too expensive.

0.9.0 cuts starting down to the one line people actually wanted:

> **Open the app → sign in once → pick a model → start creating.**

No configuration. No CLI installation. No API key required.

## The three plates

**Open Design AMR — official AI, ready the moment you install.** Getting started used to be a tax: install a CLI, hunt down an API key, paste secrets, test auth, fight the shell — and only then start designing. 0.9.0 ships [Open Design AMR](https://open-design.ai/amr) inside the installer. The AI engine comes with the app; there's no separate CLI or API key to set up. Onboarding now leads with AMR, sign-in stays one click away on desktop, your available models stay fresh automatically, and account and balance status live right in the UI. Image attachments work out of the box. Sign in once, pick a model, go.

**The agent bench gets much bigger.** Aider, Trae CLI, Antigravity, and DeepSeek Reasonix all join the picker, giving builders more *real* local-agent paths instead of a single blessed workflow. Aider gets first-class branding, Trae runs over ACP in yolo mode, and the new adapters make Open Design feel less like one agent integration and more like the place where agents come to work. Model picking stops feeling like scrolling a phone book, too: search cuts through long lists, and a shared BYOK catalog keeps Settings and the inline switcher aligned so switching models is fast instead of fiddly.

**Skills become a real plugin ecosystem.** Skill bundles graduate into first-class Plugins: visible in the drawer, listable from the CLI, indexed on the site, and easier to explain to users. One extension model, one library, one mental model. The official GSAP plugin brings serious web animation into the agent loop, and Research Decision Room turns research prompts into structured multi-role reviews instead of one long answer. The on-site plugin library now mirrors the in-app taxonomy and reads natively across locales, and plugin and template detail pages turn from static listings into a real discovery surface — preview, install, try, share.

## What else lands in 0.9.0

The release is wide. The pieces worth pulling forward:

- **Keep talking while the model is still working.** Queue the next send mid-stream, and Open Design continues the moment the current turn finishes. Studio and Draw follow the same flow, so capturing an idea doesn't depend on waiting for the previous response to end.
- **Design systems move from files to living assets.** Rename them, pin your own to the top, read real swatches from their color tables, and connect design-system projects to GitHub without the zip-file shuffle.
- **Review keeps moving while the artifact changes.** Comment mode now supports attachments, live preview updates, and clean deselection, so screenshots and notes stay attached to the work instead of freezing the flow.
- **Routines feel scheduled, not scripted.** A real picker, natural-language summaries, newest-first ordering, auto-focus after create, localization, and duplicate-slot cleanup make automations easier to trust.
- **MCP clients can do real workspace work.** Write files, delete files, delete projects, resolve the active project directory, run generation loops, and bootstrap Codex from one place. External clients can now participate in the workspace instead of only observing it.
- **Trying Open Design gets easier on Windows and Linux.** Windows gets a portable zip path; Linux gets a Docker / Podman Compose one-click setup. Less install friction, faster first run.

The full list runs to 310 PRs. The [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.9.0) carry the rest.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app, sign in once with AMR, pick a model, and send your first prompt — there's no API-key step on the path anymore |
| Already running Open Design | Let the packaged auto-update bring you to 0.9.0; onboarding now leads with AMR |
| Already driving Claude Code, Codex, Aider, or Trae in the terminal | Point them at the same OD CLI the desktop app ships with; your agent is the design engine and the skill layer adds taste and structure without a new app |
| On Windows or Linux | Grab the Windows portable zip, or use the Linux Docker / Podman Compose one-click setup for a first run without touching a system installer |

## What to do next

If you've been waiting for "install and create" to actually be true, this is the release. Download the desktop app, sign in with AMR, and run the brief you were going to run anyway — this time there's no setup between opening the app and the first artifact.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

310 PRs in 7 days. The install-and-create release only exists because so many people showed up from so many different angles and built the missing pieces. A movement doesn't ship from one team's laptops; it ships from the people who showed up and built. We see you. 🫡

## Related reading

- [Open Design 0.8.0: everything is a plugin](/blog/open-design-0-8-0-everything-is-a-plugin/) — the engine rebuild 0.9.0 is built on top of
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "layer, not product" bet
- [The open-source alternative to Claude Design](/blog/open-source-alternative-to-claude-design/) — where this release fits in the agent-native design landscape
