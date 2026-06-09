---
title: "The open-source alternative to Figma"
date: 2026-05-26
category: "Guides"
readingTime: 7
summary: "Figma is excellent and it isn't going anywhere. But the file is proprietary, the seats are a subscription, and the canvas lives in someone else's cloud. Here's the honest read on when Figma is still the answer — and when owning an agent-native, local-first workflow wins."
i18n:
  zh:
    title: "Figma 的开源替代方案"
    summary: "Figma 很优秀,也不会消失。但文件格式是专有的、席位是订阅制的、画布跑在别人的云上。这是一份诚实的判断:什么时候 Figma 仍是答案——以及什么时候,拥有一套 agent 原生、本地优先的工作流会赢。"
    bodyHtml: |
      <p>Figma 很优秀。我们用它交付真实的工作已经好几年了,这不是一篇「Figma 已死」的文章——它完全不是。我们没有再造一块画布、而是<a href="/blog/why-we-built-open-design-as-a-skill-layer/">做了一个开源的 skill 层</a>,原因并不是嫌 Figma 做得不好。这是一个押注:设计工作的下一个十年,看起来会更少地像「无限画布上的一个光标」,更多地像「一个你本来就在付费的 agent,驱动一套你真正拥有的工作流」。这篇文章,是一个同赛道团队对 Figma 的诚实判断:它最擅长什么、它在哪里把你锁住、开源路径到底长什么样、以及这个季度你该选哪一个。</p>

      <h2>Figma 到底是什么</h2>
      <p>Figma 是默认的协作设计工具。浏览器里的实时多人画布,配上面向交付的 Dev Mode、用来做白板的 FigJam、以及一组不断长出来、挂在同一个界面上的 AI 功能。定价是按席位、按月,再按角色和组织分档。</p>
      <p>有几件事,它做得比任何工具都好:</p>
      <ul>
        <li><strong>实时画布协作。</strong>五个人在同一个文件里,光标实时可见,评论就地展开。开源里没有任何东西能匹配这种多人协作的打磨度。</li>
        <li><strong>像素级矢量工作。</strong>Auto Layout、约束、变体、组件——画布原语成熟,肌肉记忆扎得很深。</li>
        <li><strong>庞大的插件生态。</strong>十年沉淀的第三方插件、社区文件和模板,拿来即用。</li>
        <li><strong>团队已经熟悉的交付方式。</strong>Dev Mode、inspect、标注红线,工程师被训练了多年的那套流程。</li>
      </ul>
      <p>如果你的工作是一名设计师在共享画布上画精确的屏幕、给其他人 review,Figma 仍然是答案,而且是个好答案。真正值得在意的差异,藏在下面一层——在于谁拥有这个文件、这套工作流和这条成本曲线。</p>

      <h2>它在哪里把你锁住</h2>
      <p>Figma 带着四重值得开门见山说清的锁定,因为定价页不会说。</p>
      <p><strong>文件是专有的。</strong>你的设计活在 Figma 的格式里、Figma 的服务器上。你能导出 PNG 和交付规格,但真正的事实来源——组件、变体、活的设计系统——只有在 Figma 里才完全可读。没有一个纯文本版本能在工具之外存活下来。</p>
      <p><strong>运行时是托管的。</strong>画布就是云。对于代理商工作、或 NDA 下的发布前创意,「这个文件存在哪」每次都是一场采购对话,而不是一个设置项。本地优先,不是一个可选模式。</p>
      <p><strong>插件不可移植。</strong>Figma 的插件生态真实且深厚——但每个插件都跑在 Figma 的运行时里、对着 Figma 的 API。你在那里搭的工作流,没法被拎出来、交给你笔记本上的一个 agent 跑,也没法被组合进一条不以 Figma 画布开头的流水线。</p>
      <p><strong>账单永远是按席位的。</strong>订阅席位对一个稳定的设计团队没问题。但对快速扩张的组织会变得别扭,对那条长尾——本来也能接手同一套工作流的贡献者、外包、一次性合作者——则根本不成立。</p>
      <p>这些都不是 bug。它们是一个托管的、协作画布产品的形状,而 Figma 是这个形状里最好的版本。我们只是不为画布而造——我们为 agent 而造。</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="一把黑色多面挂锁与文档形状融合,被一圈虚线边界包住,旁边有一把以工程图方式绘制的钥匙,呈现在暖色编辑风研究图版上" />
        <figcaption>事实来源活在一个专有文件里,在别人的云上。</figcaption>
      </figure>

      <h2>Open Design 押的那个转变</h2>
      <p>Open Design 不是 Figma 的克隆。这里没有无限画布,也没有多人光标。它是一个薄薄的 skill 层,把你本来就在用的编程 agent 变成一台设计引擎。四个原语是 <a href="/blog/31-skills-72-systems-how-the-library-works/">skills、systems、adapters 和 daemon</a>——而关键在于,它们全都只是文件:</p>
      <ul>
        <li>每个 skill 是一个 <code>SKILL.md</code> 文件,你可以读、可以 fork、可以提 PR 回来。</li>
        <li>每个设计系统是一个可移植的 <code>DESIGN.md</code> 文件——包括我们为 Figma 本身 ship 的那一份。你可以在任何编辑器里打开它、在 git 里 diff 它,它能活得比下一个读它的工具更久。</li>
        <li>每个 agent adapter 大约 80 行 TypeScript。</li>
      </ul>
      <p>这换来的,正好是上面四重锁定的反面:</p>
      <ul>
        <li><strong>文件是纯文本。</strong>skill 和 system 是 repo 里的 Markdown。你的设计系统不靠工具也能读。</li>
        <li><strong>运行时在本地。</strong>它通过 <code>pnpm tools-dev</code> 跑在你的笔记本上,或者你自己部署。提示词发给你选的模型提供商——什么都不经过我们。</li>
        <li><strong>工作流可移植。</strong>一个 skill 就是一个文件夹。它能组合进你 <code>$PATH</code> 上的任何 agent,而不是某个厂商的插件运行时。</li>
        <li><strong>默认 BYOK。</strong>粘贴任何 OpenAI 兼容的 <code>base_url</code> 和 key;<a href="/blog/byok-design-workflow-claude-codex-qwen/">你的 token 直接发给提供商</a>。Apache-2.0,无需注册,没有按席位的账单。</li>
      </ul>
      <p>心智模型是这样的:Figma 是一块你租来的画布。Open Design 是一套你拥有的工作流。</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="一叠黑色素纸和索引卡从一个打开的容器里铺展开来,有几张正飘离,呈现在暖色编辑风研究图版上" />
        <figcaption>skill 和 system 是 repo 里的纯文本文件——可移植、可 fork、不靠工具也能读。</figcaption>
      </figure>

      <h2>逐项对照</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>许可</td><td>专有</td><td>Apache-2.0</td></tr>
          <tr><td>运行时</td><td>托管(浏览器,Figma 云)</td><td>本地 daemon(<code>pnpm tools-dev</code>)+ 可选自托管</td></tr>
          <tr><td>源文件格式</td><td>专有 <code>.fig</code></td><td>repo 里的纯文本 <code>SKILL.md</code> / <code>DESIGN.md</code></td></tr>
          <tr><td>主要界面</td><td>实时多人画布</td><td>agent 驱动生成 + 沙箱预览</td></tr>
          <tr><td>模型 / AI</td><td>Figma 自家 AI 功能</td><td>任意 OpenAI 兼容端点 + 检测到的编程 agent CLI</td></tr>
          <tr><td>插件</td><td>市场,跑在 Figma 内</td><td>可 fork 的 skill 文件夹,任意 agent 都能跑</td></tr>
          <tr><td>设计系统</td><td>Figma 库(工具内)</td><td>可移植的 <code>DESIGN.md</code> 文件(含一份 Figma 的)</td></tr>
          <tr><td>定价</td><td>按席位订阅</td><td>免费;你直接付给模型提供商</td></tr>
          <tr><td>交付</td><td>Dev Mode、inspect、红线</td><td><code>$PATH</code> 上任意 agent,外加 HTML / PDF / PPTX / ZIP 导出</td></tr>
          <tr><td>可自托管</td><td>否</td><td>是(笔记本或你自己的部署)</td></tr>
          <tr><td>数据路径</td><td>文件 → Figma 云</td><td>提示词 → 你选的提供商;什么都不经过我们</td></tr>
        </tbody>
      </table>
      <p>诚实地总结:Figma 拥有市面上最打磨的协作画布体验,而对一个一起 review 精确屏幕的设计师团队来说,这份打磨就是产品本身。Open Design 则完全用画布换来了一个库——skills、systems 和 agents,设计成与你笔记本上已有的工具组合起来用。不同的形状,不同的押注。</p>

      <h2>谁该选哪个</h2>
      <table>
        <thead><tr><th>如果你是……</th><th>选</th></tr></thead>
        <tbody>
          <tr><td>做实时、多设计师画布工作、需要在线 review 的设计团队</td><td><strong>Figma。</strong>开源里没有东西能匹配那块多人画布。</td></tr>
          <tr><td>整天做像素级矢量和组件工作的设计师</td><td><strong>Figma。</strong>画布原语成熟,你的肌肉记忆值真金白银。</td></tr>
          <tr><td>已经标准化在 Figma 上、Dev Mode 进了工程环节的组织</td><td><strong>Figma。</strong>整合成本你已经付过了;把它花掉。</td></tr>
          <tr><td>已经在终端里驱动 Claude Code、Codex 或 Cursor 的设计工程师</td><td><strong>Open Design。</strong>你的 agent 就是设计引擎;skill 层加上品味和结构,不用再装一个新应用。</td></tr>
          <tr><td>任何需要 BYOK、项目中途换模型、或敏感简报要本地化处理的人</td><td><strong>Open Design。</strong><a href="/blog/byok-reality-check-5-things-that-break/">现实比宣传更粗糙</a>,但这是唯一真正成立的契约。</td></tr>
          <tr><td>想要一套能熬过工具更替的设计系统的团队</td><td><strong>Open Design。</strong><code>DESIGN.md</code> 文件比读它的工具活得更久。</td></tr>
          <tr><td>想 ship 一套项目能采纳的设计工作流的开源贡献者</td><td><strong>Open Design。</strong>放一个文件夹,重启 daemon,提 PR。</td></tr>
        </tbody>
      </table>
      <p>对大多数团队来说,定胜负的那个维度不是质量——Figma 的手艺是真的。而是:你的工作是一块用来画的画布,还是一套用来自动化的工作流。如果是后者,你会更想拥有它,而不是租它。</p>

      <h2>接下来做什么</h2>
      <p>如果你已经有一个可重复的 Figma 活儿——导出这些 frame、同步那些 token、重建那个 deck 模板——感受差异最快的方式,是把其中一个<a href="/blog/port-figma-workflow-open-design-plugin/">迁移成一个插件</a>。从一个烦人的、可重复的小任务开始,而不是「替换 Figma」。</p>
      <p>或者直接跑那条三行命令的快速上手,把它指向你本来就在付费的模型。整个东西活在一个 repo 里,第一个 deck 大约十分钟。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">试试这套开源工作流</a>。</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">如何把 Figma 工作流迁移成 Open Design 插件</a>——一次导出、token 同步或品牌套件的具体路径</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design 的开源替代方案</a>——同样诚实的判断,换一个工具</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">为什么我们把 Open Design 做成 skill 层,而不是一个产品</a>——「是层,不是产品」这个押注背后更长的宣言</li>
      </ul>
  zh-tw:
    title: "Figma 的開源替代方案"
    summary: "Figma 很優秀,也不會消失。但檔案格式是專有的、席位是訂閱制的、畫布跑在別人的雲上。這是一份誠實的判斷:什麼時候 Figma 仍是答案——以及什麼時候,擁有一套 agent 原生、本地優先的工作流會贏。"
    bodyHtml: |
      <p>Figma 很優秀。我們用它交付真實的工作已經好幾年了,這不是一篇「Figma 已死」的文章——它完全不是。我們沒有再造一塊畫布、而是<a href="/blog/why-we-built-open-design-as-a-skill-layer/">做了一個開源的 skill 層</a>,原因並不是嫌 Figma 做得不好。這是一個押注:設計工作的下一個十年,看起來會更少地像「無限畫布上的一個游標」,更多地像「一個你本來就在付費的 agent,驅動一套你真正擁有的工作流」。這篇文章,是一個同賽道團隊對 Figma 的誠實判斷:它最擅長什麼、它在哪裡把你鎖住、開源路徑到底長什麼樣、以及這個季度你該選哪一個。</p>

      <h2>Figma 到底是什麼</h2>
      <p>Figma 是預設的協作設計工具。瀏覽器裡的即時多人畫布,配上面向交付的 Dev Mode、用來做白板的 FigJam、以及一組不斷長出來、掛在同一個介面上的 AI 功能。定價是按席位、按月,再按角色和組織分檔。</p>
      <p>有幾件事,它做得比任何工具都好:</p>
      <ul>
        <li><strong>即時畫布協作。</strong>五個人在同一個檔案裡,游標即時可見,評論就地展開。開源裡沒有任何東西能匹配這種多人協作的打磨度。</li>
        <li><strong>像素級向量工作。</strong>Auto Layout、約束、變體、元件——畫布原語成熟,肌肉記憶扎得很深。</li>
        <li><strong>龐大的外掛生態。</strong>十年沉澱的第三方外掛、社群檔案和範本,拿來即用。</li>
        <li><strong>團隊已經熟悉的交付方式。</strong>Dev Mode、inspect、標註紅線,工程師被訓練了多年的那套流程。</li>
      </ul>
      <p>如果你的工作是一名設計師在共享畫布上畫精確的螢幕、給其他人 review,Figma 仍然是答案,而且是個好答案。真正值得在意的差異,藏在下面一層——在於誰擁有這個檔案、這套工作流和這條成本曲線。</p>

      <h2>它在哪裡把你鎖住</h2>
      <p>Figma 帶著四重值得開門見山說清的鎖定,因為定價頁不會說。</p>
      <p><strong>檔案是專有的。</strong>你的設計活在 Figma 的格式裡、Figma 的伺服器上。你能匯出 PNG 和交付規格,但真正的事實來源——元件、變體、活的設計系統——只有在 Figma 裡才完全可讀。沒有一個純文字版本能在工具之外存活下來。</p>
      <p><strong>執行時是託管的。</strong>畫布就是雲。對於代理商工作、或 NDA 下的發佈前創意,「這個檔案存在哪」每次都是一場採購對話,而不是一個設定項。本地優先,不是一個可選模式。</p>
      <p><strong>外掛不可移植。</strong>Figma 的外掛生態真實且深厚——但每個外掛都跑在 Figma 的執行時裡、對著 Figma 的 API。你在那裡搭的工作流,沒法被拎出來、交給你筆電上的一個 agent 跑,也沒法被組合進一條不以 Figma 畫布開頭的流水線。</p>
      <p><strong>帳單永遠是按席位的。</strong>訂閱席位對一個穩定的設計團隊沒問題。但對快速擴張的組織會變得彆扭,對那條長尾——本來也能接手同一套工作流的貢獻者、外包、一次性合作者——則根本不成立。</p>
      <p>這些都不是 bug。它們是一個託管的、協作畫布產品的形狀,而 Figma 是這個形狀裡最好的版本。我們只是不為畫布而造——我們為 agent 而造。</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="一把黑色多面掛鎖與文件形狀融合,被一圈虛線邊界包住,旁邊有一把以工程圖方式繪製的鑰匙,呈現在暖色編輯風研究圖版上" />
        <figcaption>事實來源活在一個專有檔案裡,在別人的雲上。</figcaption>
      </figure>

      <h2>Open Design 押的那個轉變</h2>
      <p>Open Design 不是 Figma 的複製品。這裡沒有無限畫布,也沒有多人游標。它是一個薄薄的 skill 層,把你本來就在用的編程 agent 變成一台設計引擎。四個原語是 <a href="/blog/31-skills-72-systems-how-the-library-works/">skills、systems、adapters 和 daemon</a>——而關鍵在於,它們全都只是檔案:</p>
      <ul>
        <li>每個 skill 是一個 <code>SKILL.md</code> 檔案,你可以讀、可以 fork、可以提 PR 回來。</li>
        <li>每個設計系統是一個可移植的 <code>DESIGN.md</code> 檔案——包括我們為 Figma 本身 ship 的那一份。你可以在任何編輯器裡打開它、在 git 裡 diff 它,它能活得比下一個讀它的工具更久。</li>
        <li>每個 agent adapter 大約 80 行 TypeScript。</li>
      </ul>
      <p>這換來的,正好是上面四重鎖定的反面:</p>
      <ul>
        <li><strong>檔案是純文字。</strong>skill 和 system 是 repo 裡的 Markdown。你的設計系統不靠工具也能讀。</li>
        <li><strong>執行時在本地。</strong>它透過 <code>pnpm tools-dev</code> 跑在你的筆電上,或者你自己部署。提示詞發給你選的模型提供商——什麼都不經過我們。</li>
        <li><strong>工作流可移植。</strong>一個 skill 就是一個資料夾。它能組合進你 <code>$PATH</code> 上的任何 agent,而不是某個廠商的外掛執行時。</li>
        <li><strong>預設 BYOK。</strong>貼上任何 OpenAI 相容的 <code>base_url</code> 和 key;<a href="/blog/byok-design-workflow-claude-codex-qwen/">你的 token 直接發給提供商</a>。Apache-2.0,無需註冊,沒有按席位的帳單。</li>
      </ul>
      <p>心智模型是這樣的:Figma 是一塊你租來的畫布。Open Design 是一套你擁有的工作流。</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="一疊黑色素紙和索引卡從一個打開的容器裡鋪展開來,有幾張正飄離,呈現在暖色編輯風研究圖版上" />
        <figcaption>skill 和 system 是 repo 裡的純文字檔案——可移植、可 fork、不靠工具也能讀。</figcaption>
      </figure>

      <h2>逐項對照</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>授權</td><td>專有</td><td>Apache-2.0</td></tr>
          <tr><td>執行時</td><td>託管(瀏覽器,Figma 雲)</td><td>本地 daemon(<code>pnpm tools-dev</code>)+ 可選自託管</td></tr>
          <tr><td>原始檔格式</td><td>專有 <code>.fig</code></td><td>repo 裡的純文字 <code>SKILL.md</code> / <code>DESIGN.md</code></td></tr>
          <tr><td>主要介面</td><td>即時多人畫布</td><td>agent 驅動生成 + 沙箱預覽</td></tr>
          <tr><td>模型 / AI</td><td>Figma 自家 AI 功能</td><td>任意 OpenAI 相容端點 + 偵測到的編程 agent CLI</td></tr>
          <tr><td>外掛</td><td>市集,跑在 Figma 內</td><td>可 fork 的 skill 資料夾,任意 agent 都能跑</td></tr>
          <tr><td>設計系統</td><td>Figma 程式庫(工具內)</td><td>可移植的 <code>DESIGN.md</code> 檔案(含一份 Figma 的)</td></tr>
          <tr><td>定價</td><td>按席位訂閱</td><td>免費;你直接付給模型提供商</td></tr>
          <tr><td>交付</td><td>Dev Mode、inspect、紅線</td><td><code>$PATH</code> 上任意 agent,外加 HTML / PDF / PPTX / ZIP 匯出</td></tr>
          <tr><td>可自託管</td><td>否</td><td>是(筆電或你自己的部署)</td></tr>
          <tr><td>資料路徑</td><td>檔案 → Figma 雲</td><td>提示詞 → 你選的提供商;什麼都不經過我們</td></tr>
        </tbody>
      </table>
      <p>誠實地總結:Figma 擁有市面上最打磨的協作畫布體驗,而對一個一起 review 精確螢幕的設計師團隊來說,這份打磨就是產品本身。Open Design 則完全用畫布換來了一個程式庫——skills、systems 和 agents,設計成與你筆電上已有的工具組合起來用。不同的形狀,不同的押注。</p>

      <h2>誰該選哪個</h2>
      <table>
        <thead><tr><th>如果你是……</th><th>選</th></tr></thead>
        <tbody>
          <tr><td>做即時、多設計師畫布工作、需要線上 review 的設計團隊</td><td><strong>Figma。</strong>開源裡沒有東西能匹配那塊多人畫布。</td></tr>
          <tr><td>整天做像素級向量和元件工作的設計師</td><td><strong>Figma。</strong>畫布原語成熟,你的肌肉記憶值真金白銀。</td></tr>
          <tr><td>已經標準化在 Figma 上、Dev Mode 進了工程環節的組織</td><td><strong>Figma。</strong>整合成本你已經付過了;把它花掉。</td></tr>
          <tr><td>已經在終端機裡驅動 Claude Code、Codex 或 Cursor 的設計工程師</td><td><strong>Open Design。</strong>你的 agent 就是設計引擎;skill 層加上品味和結構,不用再裝一個新應用。</td></tr>
          <tr><td>任何需要 BYOK、專案中途換模型、或敏感簡報要本地化處理的人</td><td><strong>Open Design。</strong><a href="/blog/byok-reality-check-5-things-that-break/">現實比宣傳更粗糙</a>,但這是唯一真正成立的契約。</td></tr>
          <tr><td>想要一套能熬過工具更替的設計系統的團隊</td><td><strong>Open Design。</strong><code>DESIGN.md</code> 檔案比讀它的工具活得更久。</td></tr>
          <tr><td>想 ship 一套專案能採納的設計工作流的開源貢獻者</td><td><strong>Open Design。</strong>放一個資料夾,重啟 daemon,提 PR。</td></tr>
        </tbody>
      </table>
      <p>對大多數團隊來說,定勝負的那個維度不是品質——Figma 的手藝是真的。而是:你的工作是一塊用來畫的畫布,還是一套用來自動化的工作流。如果是後者,你會更想擁有它,而不是租它。</p>

      <h2>接下來做什麼</h2>
      <p>如果你已經有一個可重複的 Figma 活兒——匯出這些 frame、同步那些 token、重建那個 deck 範本——感受差異最快的方式,是把其中一個<a href="/blog/port-figma-workflow-open-design-plugin/">遷移成一個外掛</a>。從一個煩人的、可重複的小任務開始,而不是「替換 Figma」。</p>
      <p>或者直接跑那條三行命令的快速上手,把它指向你本來就在付費的模型。整個東西活在一個 repo 裡,第一個 deck 大約十分鐘。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">試試這套開源工作流</a>。</p>

      <h2>延伸閱讀</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">如何把 Figma 工作流遷移成 Open Design 外掛</a>——一次匯出、token 同步或品牌套件的具體路徑</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design 的開源替代方案</a>——同樣誠實的判斷,換一個工具</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">為什麼我們把 Open Design 做成 skill 層,而不是一個產品</a>——「是層,不是產品」這個押注背後更長的宣言</li>
      </ul>
  ja:
    title: "Figma のオープンソース代替"
    summary: "Figma は優れたツールであり、なくなることはありません。しかしファイル形式は独自仕様で、シートはサブスクリプション、キャンバスは他社のクラウド上にあります。これは正直な見立てです。どんなときに Figma が依然として答えなのか——そしてどんなときに、agent ネイティブでローカルファーストのワークフローを所有することが勝つのか。"
    bodyHtml: |
      <p>Figma は優れています。私たちは何年もこれで実際の仕事を出荷してきましたし、これは「Figma は死んだ」という記事ではありません——まったくそうではありません。私たちが別のキャンバスを作るのではなく<a href="/blog/why-we-built-open-design-as-a-skill-layer/">オープンソースの skill レイヤーを作った</a>のは、Figma の作り込みへの不満からではありません。これは一つの賭けです。設計作業のこれからの十年は、「無限キャンバス上のカーソル」というよりも、「あなたがすでに料金を払っている agent が、あなたが本当に所有するワークフローを駆動する」という形に近づいていく、と。この記事は、同じカテゴリで開発しているチームによる Figma への正直な見立てです。Figma が最も得意とすること、どこであなたをロックインするのか、オープンソースの道は実際どんな形なのか、そしてこの四半期にあなたはどちらを手に取るべきか。</p>

      <h2>Figma とは実際のところ何なのか</h2>
      <p>Figma はデフォルトのコラボレーション設計ツールです。ブラウザ上のリアルタイム多人数キャンバスに、ハンドオフ向けの Dev Mode、ホワイトボード用の FigJam、そして同じ画面に次々と付け足されていく一連の AI 機能が乗っています。価格はシート単位・月単位で、役割と組織に応じて段階分けされています。</p>
      <p>いくつかの点で、Figma は他のどのツールよりもうまくこなします。</p>
      <ul>
        <li><strong>リアルタイムのキャンバス協業。</strong>5 人が同じファイルの中にいて、カーソルがリアルタイムで見え、コメントがその場で展開される。この多人数協業の完成度に匹敵するものは、オープンソースには何一つありません。</li>
        <li><strong>ピクセル精度のベクター作業。</strong>Auto Layout、制約、バリアント、コンポーネント——キャンバスのプリミティブは成熟し、手の記憶も深く染みついています。</li>
        <li><strong>巨大なプラグインエコシステム。</strong>十年積み重ねたサードパーティ製プラグイン、コミュニティファイル、テンプレートを、そのまま投入できます。</li>
        <li><strong>チームがすでに慣れたハンドオフ。</strong>Dev Mode、inspect、レッドライン、そしてエンジニアが何年も訓練されてきたあのワークフロー。</li>
      </ul>
      <p>あなたの仕事が、デザイナーが共有キャンバス上で精密な画面を描き、他の人にレビューしてもらうことであれば、Figma は今でも答えであり、しかも良い答えです。本当に気にすべき違いは、その一つ下のレイヤーに潜んでいます——このファイル、このワークフロー、このコスト曲線を誰が所有するのか、という点に。</p>

      <h2>どこであなたをロックインするのか</h2>
      <p>Figma には、最初にはっきり名指ししておく価値のある四重のロックインがあります。価格ページはそれを語らないからです。</p>
      <p><strong>ファイルは独自仕様です。</strong>あなたの設計は Figma の形式の中、Figma のサーバー上に生きています。PNG や開発仕様はエクスポートできますが、本当の事実の源——コンポーネント、バリアント、生きた設計システム——は Figma の中でしか完全には読み取れません。ツールの外で生き残るプレーンテキスト版は存在しません。</p>
      <p><strong>ランタイムはホスト型です。</strong>キャンバスがクラウドそのものです。代理店の仕事や、NDA 下のローンチ前クリエイティブにとって、「このファイルはどこに置かれるのか」は毎回、設定項目ではなく調達の交渉になります。ローカル限定は一つのモードではありません。</p>
      <p><strong>プラグインは移植できません。</strong>Figma のプラグインエコシステムは本物で奥深いものです——しかしどのプラグインも Figma のランタイムの中で、Figma の API に対して動いています。そこで組み立てたワークフローは、外へ持ち出してあなたのノートパソコン上の agent に走らせることはできませんし、Figma キャンバスから始まらないパイプラインに組み込むこともできません。</p>
      <p><strong>請求は永遠にシート単位です。</strong>サブスクリプションのシートは、安定した設計チームには問題ありません。急成長する組織にとっては窮屈になり、そして本来なら同じワークフローを引き継げたはずの貢献者・外注・一度きりの協力者というロングテールにとっては、まったく成り立ちません。</p>
      <p>これらはどれもバグではありません。これらは、ホスト型でコラボレーション・キャンバス型の製品の形であり、Figma はその形の最良の版です。私たちはただ、キャンバスのために作っていないだけです——私たちは agent のために作っています。</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="ドキュメントの形と融合した黒い多面体の南京錠が破線の境界線に囲まれ、工学図のように描かれた鍵が添えられた、暖色系のエディトリアル風スタディプレート" />
        <figcaption>事実の源は、独自仕様のファイルの中、他人のクラウド上に生きている。</figcaption>
      </figure>

      <h2>Open Design が賭けている転換</h2>
      <p>Open Design は Figma のクローンではありません。ここには無限キャンバスもなければ、多人数のカーソルもありません。これは薄い skill レイヤーで、あなたがすでに使っているコーディング agent を設計エンジンに変えます。四つのプリミティブは <a href="/blog/31-skills-72-systems-how-the-library-works/">skills、systems、adapters、daemon</a> です——そして肝心なのは、それらがすべて単なるファイルだという点です。</p>
      <ul>
        <li>どの skill も <code>SKILL.md</code> ファイルで、読むことも、fork することも、PR として送り返すこともできます。</li>
        <li>どの設計システムも移植可能な <code>DESIGN.md</code> ファイルです——私たちが Figma 自身のために出荷したものも含めて。任意のエディタで開け、git で diff でき、それを次に読むツールよりも長く生き残ります。</li>
        <li>どの agent adapter もおよそ 80 行の TypeScript です。</li>
      </ul>
      <p>これが手に入れさせてくれるのは、ちょうど上の四重ロックインの裏返しです。</p>
      <ul>
        <li><strong>ファイルはプレーンテキストです。</strong>skill と system は repo の中の Markdown です。あなたの設計システムは、ツールがなくても読み取れます。</li>
        <li><strong>ランタイムはローカルです。</strong><code>pnpm tools-dev</code> 経由であなたのノートパソコン上で動くか、あなた自身でデプロイします。プロンプトはあなたが選んだモデルプロバイダーへ送られます——何も私たちを経由しません。</li>
        <li><strong>ワークフローは移植可能です。</strong>skill とは一つのフォルダです。あなたの <code>$PATH</code> 上のどんな agent にも組み込めます。特定ベンダーのプラグインランタイムではありません。</li>
        <li><strong>デフォルトで BYOK。</strong>OpenAI 互換の <code>base_url</code> と key を貼り付けるだけ。<a href="/blog/byok-design-workflow-claude-codex-qwen/">あなたの token はまっすぐプロバイダーへ届きます</a>。Apache-2.0、登録不要、シート単位の請求なし。</li>
      </ul>
      <p>心の中のモデルはこうです。Figma はあなたが借りるキャンバス。Open Design はあなたが所有するワークフロー。</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="開いた容器から扇状に広がる黒いプレーンな紙とインデックスカードの束、数枚が自由に漂う、暖色系のエディトリアル風スタディプレート" />
        <figcaption>skill と system は repo の中のプレーンテキストファイル——移植可能で、fork でき、ツールがなくても読み取れる。</figcaption>
      </figure>

      <h2>項目ごとの対照</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>ライセンス</td><td>独自仕様</td><td>Apache-2.0</td></tr>
          <tr><td>ランタイム</td><td>ホスト型(ブラウザ、Figma クラウド)</td><td>ローカル daemon(<code>pnpm tools-dev</code>)+ 任意でセルフホスト</td></tr>
          <tr><td>ソースファイル形式</td><td>独自仕様の <code>.fig</code></td><td>repo の中のプレーンテキスト <code>SKILL.md</code> / <code>DESIGN.md</code></td></tr>
          <tr><td>主要な画面</td><td>リアルタイム多人数キャンバス</td><td>agent 駆動の生成 + サンドボックスプレビュー</td></tr>
          <tr><td>モデル / AI</td><td>Figma 自前の AI 機能</td><td>任意の OpenAI 互換エンドポイント + 検出されたコーディング agent CLI</td></tr>
          <tr><td>プラグイン</td><td>マーケットプレイス、Figma 内で動く</td><td>fork 可能な skill フォルダ、どの agent でも動く</td></tr>
          <tr><td>設計システム</td><td>Figma ライブラリ(ツール内)</td><td>移植可能な <code>DESIGN.md</code> ファイル(Figma 用も一つ含む)</td></tr>
          <tr><td>価格</td><td>シート単位のサブスクリプション</td><td>無料;モデルプロバイダーに直接支払う</td></tr>
          <tr><td>ハンドオフ</td><td>Dev Mode、inspect、レッドライン</td><td><code>$PATH</code> 上の任意の agent、加えて HTML / PDF / PPTX / ZIP エクスポート</td></tr>
          <tr><td>セルフホスト可否</td><td>不可</td><td>可(ノートパソコンまたはあなた自身のデプロイ)</td></tr>
          <tr><td>データ経路</td><td>ファイル → Figma クラウド</td><td>プロンプト → あなたが選んだプロバイダー;何も私たちを経由しない</td></tr>
        </tbody>
      </table>
      <p>正直にまとめると、Figma は市場で最も洗練されたコラボレーション・キャンバス体験を持っており、精密な画面を一緒にレビューするデザイナーのチームにとって、その洗練こそが製品そのものです。Open Design のほうは、キャンバスをまるごとライブラリと引き換えにします——skills、systems、agents は、あなたのノートパソコンにすでにあるツールと組み合わせて使うように設計されています。異なる形、異なる賭け。</p>

      <h2>誰がどちらを選ぶべきか</h2>
      <table>
        <thead><tr><th>あなたが……なら</th><th>選ぶのは</th></tr></thead>
        <tbody>
          <tr><td>リアルタイムで複数デザイナーのキャンバス作業をし、ライブレビューが必要な設計チーム</td><td><strong>Figma。</strong>あの多人数キャンバスに匹敵するものはオープンソースにはない。</td></tr>
          <tr><td>一日中ピクセル精度のベクターやコンポーネント作業をするデザイナー</td><td><strong>Figma。</strong>キャンバスのプリミティブは成熟し、あなたの手の記憶は本物のお金に値する。</td></tr>
          <tr><td>すでに Figma に標準化し、Dev Mode がエンジニアリングの流れに組み込まれている組織</td><td><strong>Figma。</strong>統合コストはもう払い終えている;それを使い切ろう。</td></tr>
          <tr><td>すでにターミナルから Claude Code、Codex、Cursor を駆動している設計エンジニア</td><td><strong>Open Design。</strong>あなたの agent こそが設計エンジン;skill レイヤーがセンスと構造を足してくれて、新しいアプリを入れる必要はない。</td></tr>
          <tr><td>BYOK、プロジェクト途中でのモデル切り替え、または機微なブリーフのローカル限定処理を必要とする人</td><td><strong>Open Design。</strong><a href="/blog/byok-reality-check-5-things-that-break/">現実は宣伝よりも荒削り</a>だが、これが本当に成り立つ唯一の契約だ。</td></tr>
          <tr><td>ツールの移り変わりを生き延びる設計システムを望むチーム</td><td><strong>Open Design。</strong><code>DESIGN.md</code> ファイルは、それを読むツールよりも長生きする。</td></tr>
          <tr><td>プロジェクトが採用できる設計ワークフローを出荷したいオープンソースの貢献者</td><td><strong>Open Design。</strong>フォルダを一つ置き、daemon を再起動し、PR を送る。</td></tr>
        </tbody>
      </table>
      <p>ほとんどのチームにとって勝敗を決める軸は、品質ではありません——Figma の手仕事は本物です。それは、あなたの仕事が描くためのキャンバスなのか、それとも自動化するためのワークフローなのか、という点です。もし後者なら、あなたはそれを借りるよりも所有したいと思うはずです。</p>

      <h2>次にすべきこと</h2>
      <p>もしあなたにすでに繰り返し可能な Figma の仕事があるなら——これらのフレームをエクスポートする、あの token を同期する、あのデッキテンプレートを作り直す——違いを最も速く実感する方法は、そのうちの一つを<a href="/blog/port-figma-workflow-open-design-plugin/">プラグインに移植する</a>ことです。「Figma を置き換える」ではなく、煩わしくて繰り返し可能な小さなタスク一つから始めましょう。</p>
      <p>あるいは、三行のコマンドのクイックスタートをそのまま走らせて、あなたがすでに料金を払っているモデルに向けるだけ。すべてが一つの repo の中に生き、最初のデッキはおよそ十分です。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">このオープンソースのワークフローを試す</a>。</p>

      <h2>さらに読む</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Figma のワークフローを Open Design プラグインに移植する方法</a>——エクスポート、token 同期、ブランドキットの具体的な道筋</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design のオープンソース代替</a>——同じく正直な見立てを、別のツールで</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ私たちは Open Design を製品ではなく skill レイヤーとして作ったのか</a>——「レイヤーであって製品ではない」という賭けの背後にある、より長い宣言</li>
      </ul>
  ko:
    title: "Figma의 오픈소스 대안"
    summary: "Figma는 훌륭하고, 사라지지 않을 것입니다. 하지만 파일 포맷은 독점이고, 좌석은 구독제이며, 캔버스는 남의 클라우드 위에서 돌아갑니다. 이것은 솔직한 판단입니다. 언제 Figma가 여전히 정답인지 — 그리고 언제 agent 네이티브하고 로컬 우선인 워크플로를 소유하는 쪽이 이기는지."
    bodyHtml: |
      <p>Figma는 훌륭합니다. 우리는 몇 년 동안 Figma로 실제 작업을 ship해 왔고, 이 글은 「Figma는 죽었다」는 글이 아닙니다 — 전혀 아닙니다. 우리가 또 하나의 캔버스를 만드는 대신 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">오픈소스 skill 층을 만든</a> 것은 Figma의 솜씨에 대한 불만이 아닙니다. 그것은 하나의 베팅입니다. 디자인 작업의 다음 10년은 「무한 캔버스 위의 커서」보다는 「당신이 이미 비용을 내고 있는 agent가, 당신이 진짜로 소유한 워크플로를 구동하는」 모습에 가까울 것이라는 베팅. 이 글은 같은 카테고리에서 제품을 만드는 팀이 내놓는 Figma에 대한 솔직한 판단입니다. 무엇을 가장 잘하는지, 어디서 당신을 가두는지, 오픈소스 경로가 실제로 어떻게 생겼는지, 그리고 이번 분기에 어느 쪽을 골라야 하는지.</p>

      <h2>Figma가 실제로 무엇인가</h2>
      <p>Figma는 기본값이 된 협업 디자인 도구입니다. 브라우저 안의 실시간 멀티플레이어 캔버스에, 핸드오프를 위한 Dev Mode, 화이트보드용 FigJam, 깊은 플러그인 마켓플레이스, 그리고 같은 표면에 계속 덧붙는 AI 기능들이 함께 있습니다. 가격은 좌석당 월 단위이며, 역할과 조직에 따라 등급이 나뉩니다.</p>
      <p>몇 가지 일은 그 어떤 도구보다도 잘합니다.</p>
      <ul>
        <li><strong>실시간 캔버스 협업.</strong> 다섯 명이 한 파일에서, 커서가 실시간으로 보이고, 코멘트가 그 자리에 달립니다. 오픈소스에는 이 멀티플레이어의 완성도에 견줄 만한 것이 없습니다.</li>
        <li><strong>픽셀 단위 벡터 작업.</strong> Auto Layout, 제약(constraint), 변형(variant), 컴포넌트 — 캔버스 원시 요소가 성숙해 있고 근육 기억이 깊이 박혀 있습니다.</li>
        <li><strong>거대한 플러그인 생태계.</strong> 10년 쌓인 서드파티 플러그인, 커뮤니티 파일, 템플릿을 바로 가져다 쓸 수 있습니다.</li>
        <li><strong>팀이 이미 익숙한 핸드오프.</strong> Dev Mode, inspect, 레드라인, 그리고 엔지니어링이 수년간 훈련받아 온 워크플로.</li>
      </ul>
      <p>당신의 일이, 공유 캔버스 위에서 다른 사람들이 review 하도록 정밀한 화면을 그리는 디자이너의 일이라면, Figma는 여전히 정답이고, 좋은 정답입니다. 신경 쓸 가치가 있는 차이는 한 층 아래에 있습니다 — 누가 파일과 워크플로와 비용 곡선을 소유하느냐에.</p>

      <h2>어디서 당신을 가두는가</h2>
      <p>Figma에는 처음부터 짚고 넘어갈 만한 네 가지 락인이 따라옵니다. 가격 페이지가 말해 주지 않기 때문입니다.</p>
      <p><strong>파일은 독점입니다.</strong> 당신의 디자인은 Figma의 포맷 안에, Figma의 서버 안에 삽니다. PNG와 개발 스펙은 내보낼 수 있지만, 진짜 사실의 원천 — 컴포넌트, 변형, 살아 있는 디자인 시스템 — 은 오직 Figma 안에서만 완전히 읽힙니다. 도구 밖에서 살아남는 당신 작업의 평문 버전은 없습니다.</p>
      <p><strong>런타임은 호스팅됩니다.</strong> 캔버스가 곧 클라우드입니다. 에이전시 작업이나 NDA 하의 출시 전 크리에이티브에서, 「이 파일이 어디에 사느냐」는 매번 설정 항목이 아니라 구매 협상의 대상입니다. 로컬 전용은 하나의 모드가 아닙니다.</p>
      <p><strong>플러그인은 이식되지 않습니다.</strong> Figma의 플러그인 생태계는 진짜이고 깊습니다 — 하지만 모든 플러그인은 Figma의 런타임 안에서, Figma의 API를 향해 돌아갑니다. 당신이 거기서 쌓은 워크플로는, 들어내서 노트북 위의 agent가 돌리게 할 수 없고, Figma 캔버스로 시작하지 않는 파이프라인에 조합해 넣을 수도 없습니다.</p>
      <p><strong>청구는 영원히 좌석당입니다.</strong> 구독 좌석은 안정적인 디자인 팀에는 괜찮습니다. 하지만 빠르게 커지는 조직에는 어색해지고, 같은 워크플로를 이어받을 수도 있었을 기여자·외주·일회성 협업자라는 긴 꼬리에는 아예 성립하지 않습니다.</p>
      <p>이 중 어느 것도 버그가 아닙니다. 호스팅된 협업 캔버스 제품의 형태이며, Figma는 그 형태의 가장 좋은 버전입니다. 우리는 그저 캔버스를 위해 만들지 않을 뿐입니다 — 우리는 agent를 위해 만듭니다.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="검은색 다면 자물쇠가 문서 형태와 융합되어 점선 경계로 둘러싸여 있고, 그 옆에 엔지니어링 도면 방식으로 그려진 열쇠가 있는, 따뜻한 색조의 에디토리얼 연구 도판" />
        <figcaption>사실의 원천이 독점 파일 안에, 남의 클라우드 위에 산다.</figcaption>
      </figure>

      <h2>Open Design가 거는 그 전환</h2>
      <p>Open Design는 Figma의 클론이 아닙니다. 여기에는 무한 캔버스도, 멀티플레이어 커서도 없습니다. 그것은 당신이 이미 쓰는 코딩 agent를 디자인 엔진으로 바꿔 주는 얇은 skill 층입니다. 네 가지 원시 요소는 <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters, 그리고 daemon</a>입니다 — 그리고 핵심은, 그것들이 전부 그냥 파일이라는 점입니다.</p>
      <ul>
        <li>모든 skill은 읽고, fork 하고, PR로 되돌려 보낼 수 있는 <code>SKILL.md</code> 파일입니다.</li>
        <li>모든 디자인 시스템은 이식 가능한 <code>DESIGN.md</code> 파일입니다 — 우리가 Figma 자체를 위해 ship 한 것을 포함해서요. 어떤 에디터에서든 열 수 있고, git에서 diff 할 수 있으며, 다음에 그것을 읽는 도구보다 더 오래 살아남습니다.</li>
        <li>모든 agent adapter는 약 80줄의 TypeScript입니다.</li>
      </ul>
      <p>그것이 사 주는 것은, 위의 네 가지 락인의 정반대입니다.</p>
      <ul>
        <li><strong>파일은 평문입니다.</strong> skill과 system은 repo 안의 Markdown입니다. 당신의 디자인 시스템은 도구 없이도 읽힙니다.</li>
        <li><strong>런타임은 로컬입니다.</strong> <code>pnpm tools-dev</code>를 통해 당신의 노트북 위에서 돌거나, 당신이 직접 배포합니다. 프롬프트는 당신이 고른 모델 제공자에게 갑니다 — 그 무엇도 우리를 거치지 않습니다.</li>
        <li><strong>워크플로는 이식 가능합니다.</strong> skill은 하나의 폴더입니다. 그것은 어떤 벤더의 플러그인 런타임이 아니라, 당신의 <code>$PATH</code> 위에 있는 어떤 agent에든 조합됩니다.</li>
        <li><strong>기본값이 BYOK입니다.</strong> OpenAI 호환 <code>base_url</code>과 key를 아무거나 붙여 넣으세요. <a href="/blog/byok-design-workflow-claude-codex-qwen/">당신의 토큰은 곧장 제공자에게 갑니다</a>. Apache-2.0, 가입 불필요, 좌석당 청구 없음.</li>
      </ul>
      <p>심성 모형은 이렇습니다. Figma는 당신이 빌린 캔버스입니다. Open Design는 당신이 소유한 워크플로입니다.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="열린 용기에서 검은색 평문 종이와 색인 카드 한 무더기가 부채꼴로 펼쳐지고 몇 장이 자유롭게 떠가는, 따뜻한 색조의 에디토리얼 연구 도판" />
        <figcaption>skill과 system은 repo 안의 평문 파일이다 — 이식 가능하고, fork 가능하며, 도구 없이도 읽힌다.</figcaption>
      </figure>

      <h2>나란히 비교</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>라이선스</td><td>독점</td><td>Apache-2.0</td></tr>
          <tr><td>런타임</td><td>호스팅됨(브라우저, Figma 클라우드)</td><td>로컬 daemon(<code>pnpm tools-dev</code>) + 선택적 셀프호스트</td></tr>
          <tr><td>소스 포맷</td><td>독점 <code>.fig</code></td><td>repo 안의 평문 <code>SKILL.md</code> / <code>DESIGN.md</code></td></tr>
          <tr><td>주요 표면</td><td>실시간 멀티플레이어 캔버스</td><td>agent 구동 생성 + 샌드박스 미리보기</td></tr>
          <tr><td>모델 / AI</td><td>Figma 자체 AI 기능</td><td>OpenAI 호환 엔드포인트 무엇이든 + 감지된 코딩 agent CLI</td></tr>
          <tr><td>플러그인</td><td>마켓플레이스, Figma 안에서 실행</td><td>fork 가능한 skill 폴더, 어떤 agent든 실행</td></tr>
          <tr><td>디자인 시스템</td><td>Figma 라이브러리(도구 내)</td><td>이식 가능한 <code>DESIGN.md</code> 파일(Figma용 한 개 포함)</td></tr>
          <tr><td>가격</td><td>좌석당 구독</td><td>무료; 모델 제공자에게 직접 지불</td></tr>
          <tr><td>핸드오프</td><td>Dev Mode, inspect, 레드라인</td><td><code>$PATH</code> 위의 어떤 agent든, 더해서 HTML / PDF / PPTX / ZIP 내보내기</td></tr>
          <tr><td>셀프호스트 가능</td><td>아니오</td><td>예(노트북 또는 당신 자신의 배포)</td></tr>
          <tr><td>데이터 경로</td><td>파일 → Figma 클라우드</td><td>프롬프트 → 당신이 고른 제공자; 그 무엇도 우리를 거치지 않음</td></tr>
        </tbody>
      </table>
      <p>솔직하게 요약하면, Figma는 시장에서 가장 잘 다듬어진 협업 캔버스 경험을 가지고 있고, 정밀한 화면을 함께 review 하는 디자이너 팀에게는 그 완성도가 곧 제품 자체입니다. Open Design는 캔버스를 통째로 라이브러리와 맞바꿉니다 — 당신의 노트북에 이미 있는 도구와 조합되도록 설계된 skills, systems, agents. 다른 형태, 다른 베팅.</p>

      <h2>누가 무엇을 골라야 하나</h2>
      <table>
        <thead><tr><th>만약 당신이……</th><th>선택</th></tr></thead>
        <tbody>
          <tr><td>실시간으로 여러 디자이너가 캔버스 작업을 하고 라이브 review가 필요한 디자인 팀이라면</td><td><strong>Figma.</strong> 오픈소스에는 그 멀티플레이어 캔버스에 견줄 만한 것이 없습니다.</td></tr>
          <tr><td>온종일 픽셀 단위 벡터와 컴포넌트 작업을 하는 디자이너라면</td><td><strong>Figma.</strong> 캔버스 원시 요소가 성숙해 있고 당신의 근육 기억은 진짜 돈값을 합니다.</td></tr>
          <tr><td>이미 Figma로 표준화되어 있고 Dev Mode가 엔지니어링 루프에 들어가 있는 조직이라면</td><td><strong>Figma.</strong> 통합 비용은 이미 치렀으니, 그것을 써먹으세요.</td></tr>
          <tr><td>이미 터미널에서 Claude Code, Codex, 또는 Cursor를 구동하는 디자인 엔지니어라면</td><td><strong>Open Design.</strong> 당신의 agent가 곧 디자인 엔진입니다. skill 층은 새 앱 없이 취향과 구조를 더해 줍니다.</td></tr>
          <tr><td>BYOK, 프로젝트 도중의 모델 교체, 또는 민감한 브리프의 로컬 전용 처리가 필요한 누구든</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">현실은 마케팅보다 거칩니다</a>, 하지만 진짜로 성립하는 유일한 계약입니다.</td></tr>
          <tr><td>도구 교체를 견뎌 내는 디자인 시스템을 원하는 팀이라면</td><td><strong>Open Design.</strong> <code>DESIGN.md</code> 파일은 그것을 읽는 도구보다 오래 삽니다.</td></tr>
          <tr><td>프로젝트가 채택할 수 있는 디자인 워크플로를 ship 하고 싶은 오픈소스 기여자라면</td><td><strong>Open Design.</strong> 폴더 하나 떨어뜨리고, daemon을 재시작하고, PR을 보내세요.</td></tr>
        </tbody>
      </table>
      <p>대부분의 팀에게 승부를 가르는 차원은 품질이 아닙니다 — Figma의 솜씨는 진짜입니다. 그것은, 당신의 일이 그릴 캔버스냐, 아니면 자동화할 워크플로냐입니다. 후자라면, 당신은 그것을 빌리기보다 소유하고 싶을 것입니다.</p>

      <h2>다음에 할 일</h2>
      <p>이미 반복되는 Figma 작업이 있다면 — 이 frame들을 내보내고, 저 token들을 동기화하고, 그 deck 템플릿을 다시 만드는 — 차이를 가장 빨리 느끼는 방법은 그중 하나를 <a href="/blog/port-figma-workflow-open-design-plugin/">플러그인으로 옮기는</a> 것입니다. 「Figma를 대체하기」가 아니라, 성가시고 반복되는 작은 작업 하나로 시작하세요.</p>
      <p>아니면 그냥 세 줄짜리 명령 빠른 시작을 돌리고, 그것을 당신이 이미 비용을 내고 있는 모델로 가리키세요. 전체가 하나의 repo 안에 살고, 첫 deck은 약 10분이면 됩니다.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">이 오픈소스 워크플로를 써 보세요</a>.</p>

      <h2>더 읽을거리</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Figma 워크플로를 Open Design 플러그인으로 옮기는 법</a> — 내보내기, token 동기화, 또는 브랜드 키트의 구체적 경로</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design의 오픈소스 대안</a> — 같은 솔직한 판단을, 도구 하나 옆에서</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">왜 우리는 Open Design를 제품이 아니라 skill 층으로 만들었나</a> — 「제품이 아니라 층」이라는 베팅 뒤에 있는 더 긴 선언문</li>
      </ul>
  de:
    title: "Die Open-Source-Alternative zu Figma"
    summary: "Figma ist hervorragend und wird nicht verschwinden. Aber das Dateiformat ist proprietär, die Plätze sind ein Abonnement, und die Leinwand lebt in jemand anderes Cloud. Hier ist die ehrliche Einschätzung: wann Figma immer noch die Antwort ist – und wann es sich auszahlt, einen agent-nativen, lokal-zuerst aufgesetzten Workflow zu besitzen."
    bodyHtml: |
      <p>Figma ist hervorragend. Wir liefern damit seit Jahren echte Arbeit aus, und dies ist kein „Figma ist tot"-Beitrag – ganz und gar nicht. Dass wir <a href="/blog/why-we-built-open-design-as-a-skill-layer/">eine Open-Source-Schicht gebaut haben</a> statt einer weiteren Leinwand, ist keine Klage über Figmas handwerkliche Qualität. Es ist eine Wette darauf, dass das nächste Jahrzehnt der Designarbeit weniger nach einem Cursor auf einer unendlichen Leinwand aussieht und mehr nach einem Agenten, für den du ohnehin schon bezahlst und der einen Workflow antreibt, den du wirklich besitzt. Dieser Beitrag ist die ehrliche Einschätzung von Figma aus der Sicht eines Teams, das in derselben Kategorie baut: was es am besten kann, wo es dich einsperrt, wie der Open-Source-Weg tatsächlich aussieht und wozu du in diesem Quartal greifen solltest.</p>

      <h2>Was Figma eigentlich ist</h2>
      <p>Figma ist das standardmäßige kollaborative Designwerkzeug. Eine Echtzeit-Multiplayer-Leinwand im Browser, mit Dev Mode für die Übergabe, FigJam fürs Whiteboarding, einem tiefen Plugin-Marktplatz und einer wachsenden Sammlung von KI-Funktionen, die an dieselbe Oberfläche angeschraubt sind. Die Preisgestaltung erfolgt pro Platz und pro Monat, gestaffelt nach Rolle und Organisation.</p>
      <p>Ein paar Dinge macht es besser als alles andere:</p>
      <ul>
        <li><strong>Echtzeit-Zusammenarbeit auf der Leinwand.</strong> Fünf Leute in einer Datei, Cursor live sichtbar, Kommentare direkt an Ort und Stelle. Nichts im Open-Source-Bereich erreicht diese Multiplayer-Politur.</li>
        <li><strong>Pixelgenaue Vektorarbeit.</strong> Auto Layout, Constraints, Varianten, Komponenten – die Leinwand-Primitive sind ausgereift und das Muskelgedächtnis sitzt tief.</li>
        <li><strong>Ein riesiges Plugin-Ökosystem.</strong> Ein Jahrzehnt an Drittanbieter-Plugins, Community-Dateien und Vorlagen, die du sofort einsetzen kannst.</li>
        <li><strong>Eine Übergabe, die Teams bereits kennen.</strong> Dev Mode, Inspect, Redlines und ein Workflow, auf den Engineering seit Jahren trainiert ist.</li>
      </ul>
      <p>Wenn deine Arbeit darin besteht, dass eine Designerin präzise Screens malt, die andere Menschen auf einer gemeinsamen Leinwand reviewen, ist Figma immer noch die Antwort, und eine gute dazu. Die Unterschiede, die wirklich zählen, liegen eine Ebene tiefer – darin, wem die Datei, der Workflow und die Kostenkurve gehören.</p>

      <h2>Wo es dich einsperrt</h2>
      <p>Figma bringt vier Formen von Lock-in mit, die man von vornherein benennen sollte, weil die Preisseiten es nicht tun.</p>
      <p><strong>Die Datei ist proprietär.</strong> Dein Design lebt in Figmas Format, auf Figmas Servern. Du kannst PNGs und Dev-Specs exportieren, aber die eigentliche Quelle der Wahrheit – Komponenten, Varianten, das lebende Designsystem – ist nur innerhalb von Figma vollständig lesbar. Es gibt keine Klartextversion deiner Arbeit, die das Werkzeug überlebt.</p>
      <p><strong>Die Laufzeit ist gehostet.</strong> Die Leinwand ist die Cloud. Bei Agenturarbeit oder Pre-Launch-Kreativarbeit unter NDA ist „wo liegt diese Datei" jedes Mal ein Beschaffungsgespräch, keine Einstellung. Nur-lokal ist kein Modus.</p>
      <p><strong>Die Plugins sind nicht portabel.</strong> Figmas Plugin-Ökosystem ist real und tief – aber jedes Plugin läuft innerhalb von Figmas Laufzeit, gegen Figmas API. Ein Workflow, den du dort baust, kann nicht herausgehoben und von einem Agenten auf deinem Laptop ausgeführt werden, und auch nicht in eine Pipeline eingebunden werden, die nicht mit der Figma-Leinwand beginnt.</p>
      <p><strong>Die Rechnung ist für immer pro Platz.</strong> Abo-Plätze sind für ein stabiles Designteam in Ordnung. Sie werden unbequem für eine schnell wachsende Organisation, und sie sind ein Ausschlusskriterium für den langen Schwanz aus Mitwirkenden, Auftragnehmern und einmaligen Mitarbeitern, die sonst denselben Workflow übernehmen würden.</p>
      <p>Nichts davon sind Bugs. Sie sind die Form eines gehosteten, kollaborativen Leinwand-Produkts, und Figma ist die beste Version dieser Form. Wir bauen einfach nicht für die Leinwand – wir bauen für den Agenten.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Ein schwarzes facettiertes Vorhängeschloss, verschmolzen mit einer Dokumentform, umringt von einer gestrichelten Begrenzung, mit einem als Konstruktionszeichnung dargestellten Schlüssel, auf einer warmen redaktionellen Studientafel" />
        <figcaption>Die Quelle der Wahrheit lebt in einer proprietären Datei, in jemand anderes Cloud.</figcaption>
      </figure>

      <h2>Der Wandel, auf den Open Design setzt</h2>
      <p>Open Design ist kein Figma-Klon. Es gibt keine unendliche Leinwand und keine Multiplayer-Cursor. Es ist eine dünne Skill-Schicht, die den Coding-Agenten, den du bereits nutzt, in eine Design-Engine verwandelt. Die vier Primitive sind <a href="/blog/31-skills-72-systems-how-the-library-works/">Skills, Systems, Adapter und der Daemon</a> – und das Wichtige daran ist, dass sie alle nur Dateien sind:</p>
      <ul>
        <li>Jeder Skill ist eine <code>SKILL.md</code>-Datei, die du lesen, forken und als PR zurückschicken kannst.</li>
        <li>Jedes Designsystem ist eine portable <code>DESIGN.md</code>-Datei – einschließlich der, die wir für Figma selbst ausliefern. Du kannst sie in jedem Editor öffnen, sie in git diffen, und sie überlebt jedes Werkzeug, das sie als Nächstes liest.</li>
        <li>Jeder Agent-Adapter umfasst etwa 80 Zeilen TypeScript.</li>
      </ul>
      <p>Was dir das einbringt, ist genau das Gegenteil der vier Lock-ins oben:</p>
      <ul>
        <li><strong>Die Datei ist Klartext.</strong> Skills und Systems sind Markdown in einem Repo. Dein Designsystem ist auch ohne das Werkzeug lesbar.</li>
        <li><strong>Die Laufzeit ist lokal.</strong> Sie läuft über <code>pnpm tools-dev</code> auf deinem Laptop, oder du deployst sie selbst. Prompts gehen an den Modellanbieter, den du gewählt hast – nichts wird über uns geleitet.</li>
        <li><strong>Der Workflow ist portabel.</strong> Ein Skill ist ein Ordner. Er fügt sich in jeden Agenten auf deinem <code>$PATH</code> ein, nicht in die Plugin-Laufzeit eines einzelnen Anbieters.</li>
        <li><strong>BYOK standardmäßig.</strong> Füge eine beliebige OpenAI-kompatible <code>base_url</code> und einen Key ein; <a href="/blog/byok-design-workflow-claude-codex-qwen/">deine Tokens gehen direkt an den Anbieter</a>. Apache-2.0, keine Registrierung, keine Rechnung pro Platz.</li>
      </ul>
      <p>Das mentale Modell: Figma ist eine Leinwand, die du mietest. Open Design ist ein Workflow, den du besitzt.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Ein Fächer aus schlichten schwarzen Papierbögen und Karteikarten, der sich aus einem offenen Behälter ausbreitet, ein paar davon lösen sich frei, auf einer warmen redaktionellen Studientafel" />
        <figcaption>Skills und Systems sind Klartextdateien in einem Repo – portabel, forkbar, auch ohne das Werkzeug lesbar.</figcaption>
      </figure>

      <h2>Direkter Vergleich</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Lizenz</td><td>Proprietär</td><td>Apache-2.0</td></tr>
          <tr><td>Laufzeit</td><td>Gehostet (Browser, Figma-Cloud)</td><td>Lokaler Daemon (<code>pnpm tools-dev</code>) + optionales Self-Hosting</td></tr>
          <tr><td>Quellformat</td><td>Proprietäres <code>.fig</code></td><td>Klartext-<code>SKILL.md</code> / <code>DESIGN.md</code> in einem Repo</td></tr>
          <tr><td>Primäre Oberfläche</td><td>Echtzeit-Multiplayer-Leinwand</td><td>Agent-gesteuerte Generierung + Sandbox-Vorschau</td></tr>
          <tr><td>Modelle / KI</td><td>Figmas eigene KI-Funktionen</td><td>Beliebiger OpenAI-kompatibler Endpunkt + erkannte Coding-Agent-CLIs</td></tr>
          <tr><td>Plugins</td><td>Marktplatz, läuft innerhalb von Figma</td><td>Forkbare Skill-Ordner, von jedem Agenten ausführbar</td></tr>
          <tr><td>Designsysteme</td><td>Figma-Bibliotheken (im Werkzeug)</td><td>Portable <code>DESIGN.md</code>-Dateien (inkl. einer für Figma)</td></tr>
          <tr><td>Preisgestaltung</td><td>Abonnement pro Platz</td><td>Kostenlos; du bezahlst deinen Modellanbieter direkt</td></tr>
          <tr><td>Übergabe</td><td>Dev Mode, Inspect, Redlines</td><td>Beliebiger Agent auf <code>$PATH</code>, dazu HTML- / PDF- / PPTX- / ZIP-Exporte</td></tr>
          <tr><td>Self-Hosting möglich</td><td>Nein</td><td>Ja (Laptop oder dein eigenes Deployment)</td></tr>
          <tr><td>Datenpfad</td><td>Dateien → Figma-Cloud</td><td>Prompts → dein gewählter Anbieter; nichts über uns</td></tr>
        </tbody>
      </table>
      <p>Die ehrliche Zusammenfassung: Figma hat die ausgereifteste kollaborative Leinwand-Erfahrung auf dem Markt, und für ein Team von Designern, die gemeinsam präzise Screens reviewen, ist diese Politur das Produkt. Open Design tauscht die Leinwand vollständig gegen eine Bibliothek – Skills, Systems und Agenten, die darauf ausgelegt sind, sich mit dem Werkzeug zu verbinden, das bereits auf deinem Laptop liegt. Andere Form, andere Wette.</p>

      <h2>Wer was wählen sollte</h2>
      <table>
        <thead><tr><th>Wenn du … bist</th><th>Wähle</th></tr></thead>
        <tbody>
          <tr><td>Ein Designteam, das Echtzeit-Leinwandarbeit mit mehreren Designern und Live-Review macht</td><td><strong>Figma.</strong> Nichts im Open-Source-Bereich erreicht die Multiplayer-Leinwand.</td></tr>
          <tr><td>Eine Designerin, die den ganzen Tag pixelgenaue Vektor- und Komponentenarbeit macht</td><td><strong>Figma.</strong> Die Leinwand-Primitive sind ausgereift und dein Muskelgedächtnis ist bares Geld wert.</td></tr>
          <tr><td>Eine Organisation, die bereits auf Figma standardisiert ist und Dev Mode im Engineering-Loop hat</td><td><strong>Figma.</strong> Du hast die Integrationskosten bereits bezahlt; nutze sie aus.</td></tr>
          <tr><td>Ein Design-Engineer, der Claude Code, Codex oder Cursor bereits vom Terminal aus steuert</td><td><strong>Open Design.</strong> Dein Agent ist die Design-Engine; die Skill-Schicht fügt Geschmack und Struktur hinzu, ohne eine neue App.</td></tr>
          <tr><td>Jeder, der BYOK, einen Modellwechsel mitten im Projekt oder Nur-lokal für sensible Briefings braucht</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Die Realität ist rauer als das Marketing</a>, aber es ist der einzige Vertrag, der wirklich hält.</td></tr>
          <tr><td>Ein Team, das ein Designsystem will, das den Werkzeugwechsel überlebt</td><td><strong>Open Design.</strong> <code>DESIGN.md</code>-Dateien überleben das Werkzeug, das sie liest.</td></tr>
          <tr><td>Ein Open-Source-Mitwirkender, der einen Design-Workflow ausliefern will, den das Projekt übernehmen kann</td><td><strong>Open Design.</strong> Leg einen Ordner ab, starte den Daemon neu, schick den PR.</td></tr>
        </tbody>
      </table>
      <p>Die Dimension, die es für die meisten Teams entscheidet, ist nicht die Qualität – Figmas Handwerk ist echt. Es ist die Frage, ob deine Arbeit eine Leinwand zum Malen ist oder ein Workflow zum Automatisieren. Wenn es Letzteres ist, willst du es lieber besitzen als mieten.</p>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Wenn du bereits eine wiederholbare Figma-Aufgabe hast – diese Frames exportieren, jene Tokens synchronisieren, jene Deck-Vorlage neu aufbauen – ist der schnellste Weg, den Unterschied zu spüren, <a href="/blog/port-figma-workflow-open-design-plugin/">eine davon in ein Plugin zu überführen</a>. Beginne mit einer nervigen, wiederholbaren Aufgabe, nicht mit „Figma ersetzen".</p>
      <p>Oder führe einfach den Drei-Befehl-Schnellstart aus und richte ihn auf das Modell, für das du ohnehin schon bezahlst. Das Ganze lebt in einem Repo und das erste Deck dauert etwa zehn Minuten.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Probiere den Open-Source-Workflow aus</a>.</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Wie man einen Figma-Workflow in ein Open-Design-Plugin überführt</a> – der konkrete Weg für einen Export, eine Token-Synchronisierung oder ein Brand Kit</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Die Open-Source-Alternative zu Claude Design</a> – dieselbe ehrliche Einschätzung, ein Werkzeug weiter</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Schicht gebaut haben, nicht als Produkt</a> – das längere Manifest hinter der Wette „Schicht, kein Produkt"</li>
      </ul>
  fr:
    title: "L'alternative open source à Figma"
    summary: "Figma est excellent et n'est pas près de disparaître. Mais le fichier est propriétaire, les sièges sont un abonnement, et le canevas vit dans le cloud de quelqu'un d'autre. Voici l'analyse honnête de quand Figma reste la bonne réponse — et de quand le fait de posséder un workflow agent-native et local-first l'emporte."
    bodyHtml: |
      <p>Figma est excellent. Cela fait des années que nous y livrons du vrai travail, et ceci n'est pas un article du genre « Figma est mort » — il ne l'est absolument pas. Le fait que nous ayons <a href="/blog/why-we-built-open-design-as-a-skill-layer/">construit une couche open source</a> au lieu d'un nouveau canevas n'est pas une critique du savoir-faire de Figma. C'est un pari : la prochaine décennie du travail de design ressemblera moins à un curseur sur un canevas infini, et davantage à un agent que vous payez déjà, pilotant un workflow que vous possédez vraiment. Cet article est l'analyse honnête de Figma par une équipe qui construit dans la même catégorie : ce qu'il fait de mieux, où il vous enferme, à quoi ressemble vraiment la voie open source, et lequel vous devriez choisir ce trimestre.</p>

      <h2>Ce qu'est réellement Figma</h2>
      <p>Figma est l'outil de design collaboratif par défaut. Un canevas multi-utilisateurs en temps réel dans le navigateur, avec le Dev Mode pour la passation, FigJam pour le tableau blanc, une vaste marketplace de plugins, et un ensemble grandissant de fonctionnalités d'IA greffées sur la même surface. La tarification est par siège et par mois, échelonnée selon le rôle et l'organisation.</p>
      <p>Il fait une poignée de choses mieux que n'importe quoi d'autre :</p>
      <ul>
        <li><strong>Collaboration en temps réel sur le canevas.</strong> Cinq personnes dans un même fichier, curseurs en direct, commentaires sur place. Rien dans l'open source n'égale ce raffinement multi-utilisateurs.</li>
        <li><strong>Travail vectoriel au pixel près.</strong> Auto Layout, contraintes, variantes, composants — les primitives du canevas sont matures et la mémoire musculaire est profondément ancrée.</li>
        <li><strong>Un immense écosystème de plugins.</strong> Une décennie de plugins tiers, de fichiers communautaires et de modèles que vous pouvez intégrer directement.</li>
        <li><strong>Une passation que les équipes connaissent déjà.</strong> Dev Mode, inspection, repères rouges, et un workflow sur lequel les ingénieurs ont été formés pendant des années.</li>
      </ul>
      <p>Si votre travail consiste, en tant que designer, à peindre des écrans précis pour que d'autres humains les passent en revue sur un canevas partagé, Figma reste la réponse, et c'en est une bonne. Les différences qui méritent qu'on s'y attarde vivent une couche plus bas — dans la question de savoir qui possède le fichier, le workflow et la courbe de coûts.</p>

      <h2>Où il vous enferme</h2>
      <p>Figma comporte quatre formes de verrouillage qu'il vaut la peine de nommer d'emblée, parce que les pages de tarification ne le font pas.</p>
      <p><strong>Le fichier est propriétaire.</strong> Votre design vit dans le format de Figma, à l'intérieur des serveurs de Figma. Vous pouvez exporter des PNG et des spécifications de développement, mais la source de vérité — composants, variantes, le système de design vivant — n'est entièrement lisible qu'à l'intérieur de Figma. Il n'existe aucune version en texte brut de votre travail qui survive à l'outil.</p>
      <p><strong>Le runtime est hébergé.</strong> Le canevas est le cloud. Pour le travail d'agence ou la création avant lancement sous NDA, « où vit ce fichier » est une conversation d'achat, pas un réglage. Le local-only n'est pas un mode.</p>
      <p><strong>Les plugins ne sont pas portables.</strong> L'écosystème de plugins de Figma est réel et profond — mais chaque plugin tourne à l'intérieur du runtime de Figma, contre l'API de Figma. Un workflow que vous y construisez ne peut pas être extrait et exécuté par un agent sur votre ordinateur portable, ni composé dans un pipeline qui ne commence pas par le canevas Figma.</p>
      <p><strong>La facture est par siège, pour toujours.</strong> Les sièges d'abonnement conviennent à une équipe de design stable. Ils deviennent gênants pour une organisation en croissance rapide, et ils sont rédhibitoires pour la longue traîne de contributeurs, sous-traitants et collaborateurs ponctuels qui reprendraient autrement le même workflow.</p>
      <p>Aucun de ces points n'est un bug. C'est la forme d'un produit de canevas collaboratif hébergé, et Figma est la meilleure version de cette forme. Nous ne construisons simplement pas pour le canevas — nous construisons pour l'agent.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Un cadenas noir à facettes fusionné avec une forme de document, cerné par une frontière en pointillés, avec une clé dessinée comme un schéma d'ingénierie, sur une planche d'étude éditoriale aux teintes chaudes" />
        <figcaption>La source de vérité vit dans un fichier propriétaire, à l'intérieur du cloud de quelqu'un d'autre.</figcaption>
      </figure>

      <h2>Le basculement sur lequel parie Open Design</h2>
      <p>Open Design n'est pas un clone de Figma. Il n'y a pas de canevas infini ni de curseurs multi-utilisateurs. C'est une fine couche de skills qui transforme l'agent de code que vous utilisez déjà en moteur de design. Les quatre primitives sont les <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters et le daemon</a> — et le point important, c'est qu'elles ne sont toutes que des fichiers :</p>
      <ul>
        <li>Chaque skill est un fichier <code>SKILL.md</code> que vous pouvez lire, forker et renvoyer sous forme de PR.</li>
        <li>Chaque système de design est un fichier <code>DESIGN.md</code> portable — y compris celui que nous livrons pour Figma lui-même. Vous pouvez l'ouvrir dans n'importe quel éditeur, le diffuser dans git, et il survit à n'importe quel outil qui le lit ensuite.</li>
        <li>Chaque agent adapter représente environ 80 lignes de TypeScript.</li>
      </ul>
      <p>Ce que cela vous achète, c'est exactement l'inverse des quatre verrouillages ci-dessus :</p>
      <ul>
        <li><strong>Le fichier est en texte brut.</strong> Les skills et systems sont du Markdown dans un repo. Votre système de design est lisible sans l'outil.</li>
        <li><strong>Le runtime est local.</strong> Il tourne sur votre ordinateur portable via <code>pnpm tools-dev</code>, ou vous le déployez vous-même. Les prompts vont au fournisseur de modèle que vous avez choisi — rien ne transite par nous.</li>
        <li><strong>Le workflow est portable.</strong> Un skill est un dossier. Il se compose dans n'importe quel agent sur votre <code>$PATH</code>, pas dans le runtime de plugins d'un seul fournisseur.</li>
        <li><strong>BYOK par défaut.</strong> Collez n'importe quels <code>base_url</code> et clé compatibles OpenAI ; <a href="/blog/byok-design-workflow-claude-codex-qwen/">vos tokens vont directement au fournisseur</a>. Apache-2.0, sans inscription, sans facture par siège.</li>
      </ul>
      <p>Le modèle mental : Figma est un canevas que vous louez. Open Design est un workflow que vous possédez.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Un éventail de feuilles de papier noir uni et de fiches s'étalant hors d'un récipient ouvert, quelques-unes s'échappant librement, sur une planche d'étude éditoriale aux teintes chaudes" />
        <figcaption>Les skills et systems sont des fichiers en texte brut dans un repo — portables, forkables, lisibles sans l'outil.</figcaption>
      </figure>

      <h2>Comparaison côte à côte</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Licence</td><td>Propriétaire</td><td>Apache-2.0</td></tr>
          <tr><td>Runtime</td><td>Hébergé (navigateur, cloud Figma)</td><td>Daemon local (<code>pnpm tools-dev</code>) + auto-hébergement optionnel</td></tr>
          <tr><td>Format des fichiers source</td><td><code>.fig</code> propriétaire</td><td><code>SKILL.md</code> / <code>DESIGN.md</code> en texte brut dans un repo</td></tr>
          <tr><td>Surface principale</td><td>Canevas multi-utilisateurs en temps réel</td><td>Génération pilotée par agent + aperçu en bac à sable</td></tr>
          <tr><td>Modèles / IA</td><td>Fonctionnalités d'IA propres à Figma</td><td>Tout endpoint compatible OpenAI + CLI d'agents de code détectés</td></tr>
          <tr><td>Plugins</td><td>Marketplace, tourne à l'intérieur de Figma</td><td>Dossiers de skills forkables, exécutables par n'importe quel agent</td></tr>
          <tr><td>Systèmes de design</td><td>Bibliothèques Figma (dans l'outil)</td><td>Fichiers <code>DESIGN.md</code> portables (dont un pour Figma)</td></tr>
          <tr><td>Tarification</td><td>Abonnement par siège</td><td>Gratuit ; vous payez directement votre fournisseur de modèle</td></tr>
          <tr><td>Passation</td><td>Dev Mode, inspection, repères rouges</td><td>Tout agent sur le <code>$PATH</code>, plus exports HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Auto-hébergeable</td><td>Non</td><td>Oui (ordinateur portable ou votre propre déploiement)</td></tr>
          <tr><td>Chemin des données</td><td>Fichiers → cloud Figma</td><td>Prompts → le fournisseur que vous choisissez ; rien ne transite par nous</td></tr>
        </tbody>
      </table>
      <p>Le résumé honnête : Figma offre l'expérience de canevas collaboratif la plus raffinée du marché, et pour une équipe de designers qui passent ensemble en revue des écrans précis, ce raffinement est le produit. Open Design échange entièrement le canevas contre une bibliothèque — skills, systems et agents conçus pour se composer avec l'outil déjà présent sur votre ordinateur portable. Une forme différente, un pari différent.</p>

      <h2>Qui devrait choisir quoi</h2>
      <table>
        <thead><tr><th>Si vous êtes…</th><th>Choisissez</th></tr></thead>
        <tbody>
          <tr><td>Une équipe de design faisant du travail sur canevas multi-designers en temps réel avec revue en direct</td><td><strong>Figma.</strong> Rien dans l'open source n'égale le canevas multi-utilisateurs.</td></tr>
          <tr><td>Un designer faisant du travail vectoriel et de composants au pixel près toute la journée</td><td><strong>Figma.</strong> Les primitives du canevas sont matures et votre mémoire musculaire vaut de l'argent bien réel.</td></tr>
          <tr><td>Une organisation déjà standardisée sur Figma avec le Dev Mode dans la boucle d'ingénierie</td><td><strong>Figma.</strong> Vous avez payé le coût d'intégration ; rentabilisez-le.</td></tr>
          <tr><td>Un design engineer qui pilote déjà Claude Code, Codex ou Cursor depuis le terminal</td><td><strong>Open Design.</strong> Votre agent est le moteur de design ; la couche de skills ajoute goût et structure sans nouvelle application.</td></tr>
          <tr><td>Quiconque a besoin de BYOK, de changer de modèle en cours de projet, ou de traitement local-only pour des briefs sensibles</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">La réalité est plus rugueuse que le marketing</a>, mais c'est le seul contrat qui tient vraiment.</td></tr>
          <tr><td>Une équipe qui veut un système de design qui survit au renouvellement des outils</td><td><strong>Open Design.</strong> Les fichiers <code>DESIGN.md</code> survivent à l'outil qui les lit.</td></tr>
          <tr><td>Un contributeur open source qui veut livrer un workflow de design que le projet peut adopter</td><td><strong>Open Design.</strong> Déposez un dossier, redémarrez le daemon, envoyez la PR.</td></tr>
        </tbody>
      </table>
      <p>La dimension qui tranche pour la plupart des équipes n'est pas la qualité — le savoir-faire de Figma est réel. C'est de savoir si votre travail est un canevas sur lequel peindre, ou un workflow à automatiser. Si c'est le second, vous préférerez le posséder plutôt que le louer.</p>

      <h2>Quoi faire ensuite</h2>
      <p>Si vous avez déjà une tâche Figma répétable — exporter ces frames, synchroniser ces tokens, reconstruire ce modèle de deck — la façon la plus rapide de sentir la différence est d'en <a href="/blog/port-figma-workflow-open-design-plugin/">porter une vers un plugin</a>. Commencez par une petite tâche agaçante et répétable, pas par « remplacer Figma ».</p>
      <p>Ou bien lancez simplement le démarrage rapide en trois commandes et pointez-le vers le modèle que vous payez déjà. Le tout vit dans un seul repo et le premier deck prend environ dix minutes.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Essayez le workflow open source</a>.</p>

      <h2>Pour aller plus loin</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Comment porter un workflow Figma vers un plugin Open Design</a> — le chemin concret pour un export, une synchro de tokens ou un kit de marque</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">L'alternative open source à Claude Design</a> — la même analyse honnête, pour un autre outil</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons fait d'Open Design une couche de skills, et non un produit</a> — le manifeste plus long derrière le pari « une couche, pas un produit »</li>
      </ul>
  ru:
    title: "Открытая альтернатива Figma с открытым исходным кодом"
    summary: "Figma великолепна, и она никуда не денется. Но формат файла проприетарный, места — это подписка, а холст живёт в чужом облаке. Вот честный разбор: когда Figma по-прежнему ответ — и когда выигрывает обладание agent-нативным, local-first рабочим процессом."
    bodyHtml: |
      <p>Figma великолепна. Мы годами делали в ней реальную работу, и это не статья в духе «Figma мертва» — совсем нет. То, что мы <a href="/blog/why-we-built-open-design-as-a-skill-layer/">построили слой с открытым исходным кодом</a>, а не ещё один холст, — это не претензия к мастерству Figma. Это ставка на то, что следующее десятилетие дизайн-работы будет меньше похоже на курсор на бесконечном холсте и больше — на agent, за который вы уже платите и который приводит в движение рабочий процесс, которым вы действительно владеете. Эта статья — честный разбор Figma от команды, строящей в той же категории: что она делает лучше всего, где она вас привязывает, как на самом деле выглядит путь open source и к чему стоит обратиться в этом квартале.</p>

      <h2>Что такое Figma на самом деле</h2>
      <p>Figma — это инструмент совместного дизайна по умолчанию. Многопользовательский холст реального времени в браузере, с Dev Mode для передачи в разработку, FigJam для вайтбординга, глубоким маркетплейсом плагинов и растущим набором AI-функций, прикрученных к той же поверхности. Цена — за место в месяц, с градацией по роли и по организации.</p>
      <p>Несколько вещей она делает лучше, чем что-либо ещё:</p>
      <ul>
        <li><strong>Совместная работа на холсте в реальном времени.</strong> Пять человек в одном файле, курсоры в реальном времени, комментарии прямо на месте. Ничто в open source не сравнится с этой отполированностью многопользовательской работы.</li>
        <li><strong>Векторная работа с точностью до пикселя.</strong> Auto Layout, ограничения, варианты, компоненты — примитивы холста зрелые, а мышечная память укоренилась глубоко.</li>
        <li><strong>Огромная экосистема плагинов.</strong> Десятилетие сторонних плагинов, файлов сообщества и шаблонов, которые можно просто взять и подключить.</li>
        <li><strong>Передача в разработку, которую команды уже знают.</strong> Dev Mode, inspect, разметка, и рабочий процесс, на котором инженеров обучали годами.</li>
      </ul>
      <p>Если ваша работа — это дизайнер, рисующий точные экраны для ревью другими людьми на общем холсте, Figma по-прежнему ответ, и хороший. Различия, которые стоит принимать во внимание, живут на слой ниже — в том, кто владеет файлом, рабочим процессом и кривой затрат.</p>

      <h2>Где она вас привязывает</h2>
      <p>Figma несёт в себе четыре вида привязки, которые стоит назвать сразу, потому что страницы с ценами этого не делают.</p>
      <p><strong>Файл проприетарный.</strong> Ваш дизайн живёт в формате Figma, внутри серверов Figma. Вы можете экспортировать PNG и спецификации для разработки, но источник истины — компоненты, варианты, живая дизайн-система — полностью читаем только внутри Figma. Не существует текстовой версии вашей работы, которая пережила бы инструмент.</p>
      <p><strong>Среда выполнения размещена в облаке.</strong> Холст и есть облако. Для агентской работы или предрелизного креатива под NDA «где живёт этот файл» — это переговоры о закупке, а не настройка. Локальный режим — не опция.</p>
      <p><strong>Плагины не переносимы.</strong> Экосистема плагинов Figma реальна и глубока — но каждый плагин работает внутри среды выполнения Figma, против API Figma. Рабочий процесс, который вы там построили, нельзя вытащить и запустить через agent на вашем ноутбуке или встроить в конвейер, который не начинается с холста Figma.</p>
      <p><strong>Счёт — за место, навсегда.</strong> Подписочные места нормальны для стабильной дизайн-команды. Они становятся неудобными для быстрорастущей организации, и они вообще не работают для длинного хвоста контрибьюторов, подрядчиков и разовых соавторов, которые иначе подхватили бы тот же рабочий процесс.</p>
      <p>Ничто из этого не баг. Это форма облачного продукта-холста для совместной работы, и Figma — лучшая версия этой формы. Мы просто строим не для холста — мы строим для agent.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Чёрный гранёный навесной замок, сплавленный с формой документа, окружённый пунктирной границей, рядом ключ, нарисованный как инженерная схема, на тёплой редакторской исследовательской плашке" />
        <figcaption>Источник истины живёт в проприетарном файле, внутри чужого облака.</figcaption>
      </figure>

      <h2>Сдвиг, на который ставит Open Design</h2>
      <p>Open Design — это не клон Figma. Здесь нет бесконечного холста и нет многопользовательских курсоров. Это тонкий skill-слой, который превращает кодинг-agent, которым вы уже пользуетесь, в дизайн-движок. Четыре примитива — это <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters и daemon</a> — и важная часть в том, что все они — просто файлы:</p>
      <ul>
        <li>Каждый skill — это файл <code>SKILL.md</code>, который вы можете прочитать, форкнуть и отправить обратно как PR.</li>
        <li>Каждая дизайн-система — это переносимый файл <code>DESIGN.md</code>, включая тот, который мы поставляем для самой Figma. Вы можете открыть его в любом редакторе, сделать diff в git, и он переживёт любой инструмент, который прочитает его следующим.</li>
        <li>Каждый agent adapter — это ~80 строк TypeScript.</li>
      </ul>
      <p>Это покупает вам ровно противоположность четырём привязкам выше:</p>
      <ul>
        <li><strong>Файл — это обычный текст.</strong> Skills и systems — это Markdown в репозитории. Ваша дизайн-система читаема без инструмента.</li>
        <li><strong>Среда выполнения локальна.</strong> Она работает на вашем ноутбуке через <code>pnpm tools-dev</code>, или вы разворачиваете её сами. Промпты идут к выбранному вами провайдеру модели — ничто не проходит через нас.</li>
        <li><strong>Рабочий процесс переносим.</strong> Skill — это папка. Она встраивается в любой agent в вашем <code>$PATH</code>, а не в среду плагинов одного вендора.</li>
        <li><strong>BYOK по умолчанию.</strong> Вставьте любой OpenAI-совместимый <code>base_url</code> и ключ; <a href="/blog/byok-design-workflow-claude-codex-qwen/">ваши токены идут напрямую к провайдеру</a>. Apache-2.0, без регистрации, без счёта за место.</li>
      </ul>
      <p>Ментальная модель такая: Figma — это холст, который вы арендуете. Open Design — это рабочий процесс, которым вы владеете.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Веер из простых чёрных листов бумаги и карточек, разворачивающийся из открытого контейнера, пара листов улетает свободно, на тёплой редакторской исследовательской плашке" />
        <figcaption>Skills и systems — это текстовые файлы в репозитории — переносимые, форкаемые, читаемые без инструмента.</figcaption>
      </figure>

      <h2>Бок о бок</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Лицензия</td><td>Проприетарная</td><td>Apache-2.0</td></tr>
          <tr><td>Среда выполнения</td><td>Размещённая (браузер, облако Figma)</td><td>Локальный daemon (<code>pnpm tools-dev</code>) + опциональный self-host</td></tr>
          <tr><td>Формат исходного файла</td><td>Проприетарный <code>.fig</code></td><td>Текстовые <code>SKILL.md</code> / <code>DESIGN.md</code> в репозитории</td></tr>
          <tr><td>Основная поверхность</td><td>Многопользовательский холст реального времени</td><td>Генерация под управлением agent + предпросмотр в песочнице</td></tr>
          <tr><td>Модели / AI</td><td>Собственные AI-функции Figma</td><td>Любая OpenAI-совместимая точка + обнаруженные CLI кодинг-агентов</td></tr>
          <tr><td>Плагины</td><td>Маркетплейс, работает внутри Figma</td><td>Форкаемые папки skill, запускаются любым agent</td></tr>
          <tr><td>Дизайн-системы</td><td>Библиотеки Figma (внутри инструмента)</td><td>Переносимые файлы <code>DESIGN.md</code> (включая Figma-версию)</td></tr>
          <tr><td>Цена</td><td>Подписка за место</td><td>Бесплатно; вы платите провайдеру модели напрямую</td></tr>
          <tr><td>Передача в разработку</td><td>Dev Mode, inspect, разметка</td><td>Любой agent в <code>$PATH</code>, плюс экспорт HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Возможность self-host</td><td>Нет</td><td>Да (ноутбук или ваш собственный деплой)</td></tr>
          <tr><td>Путь данных</td><td>Файлы → облако Figma</td><td>Промпты → выбранный вами провайдер; ничто не проходит через нас</td></tr>
        </tbody>
      </table>
      <p>Честный итог: у Figma самый отполированный опыт совместной работы на холсте на рынке, и для команды дизайнеров, вместе ревьюящих точные экраны, эта отполированность и есть продукт. Open Design же полностью меняет холст на библиотеку — skills, systems и agents, спроектированные для компоновки с инструментом, уже стоящим на вашем ноутбуке. Другая форма, другая ставка.</p>

      <h2>Кому что выбрать</h2>
      <table>
        <thead><tr><th>Если вы…</th><th>Выбирайте</th></tr></thead>
        <tbody>
          <tr><td>Дизайн-команда, делающая работу на холсте в реальном времени с несколькими дизайнерами и живым ревью</td><td><strong>Figma.</strong> Ничто в open source не сравнится с многопользовательским холстом.</td></tr>
          <tr><td>Дизайнер, целыми днями делающий пиксель-точную векторную и компонентную работу</td><td><strong>Figma.</strong> Примитивы холста зрелые, а ваша мышечная память стоит реальных денег.</td></tr>
          <tr><td>Организация, уже стандартизированная на Figma, с Dev Mode в инженерном цикле</td><td><strong>Figma.</strong> Вы уже заплатили цену интеграции; используйте её.</td></tr>
          <tr><td>Дизайн-инженер, уже управляющий Claude Code, Codex или Cursor из терминала</td><td><strong>Open Design.</strong> Ваш agent и есть дизайн-движок; skill-слой добавляет вкус и структуру без нового приложения.</td></tr>
          <tr><td>Любой, кому нужен BYOK, выбор модели посреди проекта или локальная обработка чувствительных брифов</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Реальность грубее, чем маркетинг</a>, но это единственный контракт, который действительно держится.</td></tr>
          <tr><td>Команда, которой нужна дизайн-система, переживающая смену инструментов</td><td><strong>Open Design.</strong> Файлы <code>DESIGN.md</code> переживают инструмент, который их читает.</td></tr>
          <tr><td>Контрибьютор open source, желающий выпустить дизайн-процесс, который проект сможет принять</td><td><strong>Open Design.</strong> Положите папку, перезапустите daemon, отправьте PR.</td></tr>
        </tbody>
      </table>
      <p>Измерение, которое решает дело для большинства команд, — это не качество; мастерство Figma реально. Это то, является ли ваша работа холстом, на котором рисуют, или рабочим процессом, который автоматизируют. Если последнее — вы предпочтёте владеть им, а не арендовать его.</p>

      <h2>Что делать дальше</h2>
      <p>Если у вас уже есть повторяемая задача в Figma — экспортировать эти фреймы, синхронизировать те токены, пересобрать тот шаблон дека — самый быстрый способ почувствовать разницу — это <a href="/blog/port-figma-workflow-open-design-plugin/">перенести одну из них в плагин</a>. Начните с одной раздражающей, повторяемой задачи, а не с «заменить Figma».</p>
      <p>Или просто запустите быстрый старт из трёх команд и направьте его на модель, за которую вы уже платите. Всё это живёт в одном репозитории, и первый дек занимает около десяти минут.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Попробуйте рабочий процесс с открытым исходным кодом</a>.</p>

      <h2>Дополнительное чтение</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Как перенести рабочий процесс Figma в плагин Open Design</a> — конкретный путь для экспорта, синхронизации токенов или бренд-кита</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Открытая альтернатива Claude Design</a> — тот же честный разбор, на инструмент в сторону</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы сделали Open Design skill-слоем, а не продуктом</a> — более длинный манифест за ставкой «слой, а не продукт»</li>
      </ul>
  es:
    title: "La alternativa de código abierto a Figma"
    summary: "Figma es excelente y no va a ninguna parte. Pero el archivo es propietario, los asientos son una suscripción y el lienzo vive en la nube de otra persona. Aquí tienes la lectura honesta de cuándo Figma sigue siendo la respuesta — y cuándo gana poseer un flujo de trabajo nativo de agentes y local-first."
    bodyHtml: |
      <p>Figma es excelente. Llevamos años entregando trabajo real con él, y esto no es un artículo de «Figma ha muerto» — para nada lo es. El hecho de que <a href="/blog/why-we-built-open-design-as-a-skill-layer/">hayamos construido una capa de código abierto</a> en lugar de otro lienzo no es una queja sobre el oficio de Figma. Es una apuesta: la próxima década del trabajo de diseño se parecerá menos a un cursor sobre un lienzo infinito y más a un agente que ya pagas, impulsando un flujo de trabajo que realmente posees. Este artículo es la lectura honesta de Figma desde un equipo que construye en la misma categoría: qué hace mejor, dónde te encierra, cómo es realmente el camino de código abierto y cuál deberías elegir este trimestre.</p>

      <h2>Qué es Figma realmente</h2>
      <p>Figma es la herramienta de diseño colaborativo por defecto. Un lienzo multijugador en tiempo real dentro del navegador, con Dev Mode para la entrega, FigJam para hacer pizarras, un profundo mercado de plugins y un creciente conjunto de funciones de IA atornilladas a la misma superficie. El precio es por asiento al mes, escalonado por rol y por organización.</p>
      <p>Hace unas cuantas cosas mejor que cualquier otra herramienta:</p>
      <ul>
        <li><strong>Colaboración en lienzo en tiempo real.</strong> Cinco personas en un mismo archivo, cursores en vivo, comentarios incrustados. Nada en el código abierto iguala ese pulido multijugador.</li>
        <li><strong>Trabajo vectorial con precisión de píxel.</strong> Auto Layout, restricciones, variantes, componentes — las primitivas del lienzo son maduras y la memoria muscular está profundamente arraigada.</li>
        <li><strong>Un enorme ecosistema de plugins.</strong> Una década de plugins de terceros, archivos comunitarios y plantillas que puedes incorporar al instante.</li>
        <li><strong>Una entrega que los equipos ya conocen.</strong> Dev Mode, inspect, líneas rojas y un flujo de trabajo en el que la ingeniería lleva años entrenada.</li>
      </ul>
      <p>Si tu trabajo es el de un diseñador pintando pantallas precisas para que otras personas las revisen en un lienzo compartido, Figma sigue siendo la respuesta, y es una buena respuesta. Las diferencias que vale la pena considerar viven una capa más abajo — en quién posee el archivo, el flujo de trabajo y la curva de costes.</p>

      <h2>Dónde te encierra</h2>
      <p>Figma arrastra cuatro formas de encierro que vale la pena nombrar de entrada, porque las páginas de precios no lo hacen.</p>
      <p><strong>El archivo es propietario.</strong> Tu diseño vive en el formato de Figma, dentro de los servidores de Figma. Puedes exportar PNG y especificaciones de desarrollo, pero la fuente de verdad — componentes, variantes, el sistema de diseño vivo — solo es plenamente legible dentro de Figma. No existe una versión en texto plano de tu trabajo que sobreviva a la herramienta.</p>
      <p><strong>El runtime está alojado.</strong> El lienzo es la nube. Para el trabajo de agencia o el creativo prelanzamiento bajo NDA, «dónde vive este archivo» es una conversación de compras, no un ajuste. Lo local-only no es un modo.</p>
      <p><strong>Los plugins no son portables.</strong> El ecosistema de plugins de Figma es real y profundo — pero cada plugin se ejecuta dentro del runtime de Figma, contra la API de Figma. Un flujo de trabajo que construyas ahí no puede sacarse y ejecutarse mediante un agente en tu portátil, ni componerse en una tubería que no empiece con el lienzo de Figma.</p>
      <p><strong>La factura es por asiento, para siempre.</strong> Los asientos de suscripción están bien para un equipo de diseño estable. Se vuelven incómodos para una organización de rápido crecimiento, y son un punto de partida imposible para la larga cola de colaboradores, contratistas y participantes puntuales que de otro modo adoptarían el mismo flujo de trabajo.</p>
      <p>Nada de esto son bugs. Son la forma de un producto de lienzo colaborativo alojado, y Figma es la mejor versión de esa forma. Simplemente nosotros no construimos para el lienzo — construimos para el agente.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Un candado negro facetado fusionado con la forma de un documento, rodeado por un borde de línea discontinua, con una llave dibujada como un diagrama de ingeniería, sobre una lámina de estudio editorial de tono cálido" />
        <figcaption>La fuente de verdad vive en un archivo propietario, dentro de la nube de otra persona.</figcaption>
      </figure>

      <h2>El cambio por el que apuesta Open Design</h2>
      <p>Open Design no es un clon de Figma. No hay lienzo infinito ni cursores multijugador. Es una fina capa de skills que convierte el agente de programación que ya usas en un motor de diseño. Las cuatro primitivas son <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters y el daemon</a> — y lo importante es que todas son simplemente archivos:</p>
      <ul>
        <li>Cada skill es un archivo <code>SKILL.md</code> que puedes leer, hacer fork y devolver como un PR.</li>
        <li>Cada sistema de diseño es un archivo portable <code>DESIGN.md</code> — incluyendo el que enviamos para el propio Figma. Puedes abrirlo en cualquier editor, hacerle diff en git, y sobrevive a cualquier herramienta que lo lea después.</li>
        <li>Cada agent adapter son ~80 líneas de TypeScript.</li>
      </ul>
      <p>Lo que eso te compra es exactamente lo opuesto a los cuatro encierros de arriba:</p>
      <ul>
        <li><strong>El archivo es texto plano.</strong> Los skills y systems son Markdown en un repo. Tu sistema de diseño es legible sin la herramienta.</li>
        <li><strong>El runtime es local.</strong> Se ejecuta en tu portátil mediante <code>pnpm tools-dev</code>, o lo despliegas tú mismo. Los prompts van al proveedor de modelos que elegiste — nada se enruta a través de nosotros.</li>
        <li><strong>El flujo de trabajo es portable.</strong> Un skill es una carpeta. Se compone en cualquier agente de tu <code>$PATH</code>, no en el runtime de plugins de un único proveedor.</li>
        <li><strong>BYOK por defecto.</strong> Pega cualquier <code>base_url</code> y key compatible con OpenAI; <a href="/blog/byok-design-workflow-claude-codex-qwen/">tus tokens van directos al proveedor</a>. Apache-2.0, sin registro, sin factura por asiento.</li>
      </ul>
      <p>El modelo mental es este: Figma es un lienzo que alquilas. Open Design es un flujo de trabajo que posees.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Un abanico de hojas de papel negro liso y fichas de índice desplegándose desde un contenedor abierto, con un par flotando libres, sobre una lámina de estudio editorial de tono cálido" />
        <figcaption>Los skills y systems son archivos de texto plano en un repo — portables, forkeables, legibles sin la herramienta.</figcaption>
      </figure>

      <h2>Cara a cara</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Licencia</td><td>Propietaria</td><td>Apache-2.0</td></tr>
          <tr><td>Runtime</td><td>Alojado (navegador, nube de Figma)</td><td>Daemon local (<code>pnpm tools-dev</code>) + autohospedaje opcional</td></tr>
          <tr><td>Formato de origen</td><td><code>.fig</code> propietario</td><td>Texto plano <code>SKILL.md</code> / <code>DESIGN.md</code> en un repo</td></tr>
          <tr><td>Superficie principal</td><td>Lienzo multijugador en tiempo real</td><td>Generación impulsada por agentes + vista previa en sandbox</td></tr>
          <tr><td>Modelos / IA</td><td>Funciones de IA propias de Figma</td><td>Cualquier endpoint compatible con OpenAI + CLIs de agentes de programación detectados</td></tr>
          <tr><td>Plugins</td><td>Mercado, se ejecuta dentro de Figma</td><td>Carpetas de skills forkeables, ejecutadas por cualquier agente</td></tr>
          <tr><td>Sistemas de diseño</td><td>Bibliotecas de Figma (en la herramienta)</td><td>Archivos portables <code>DESIGN.md</code> (incl. uno de Figma)</td></tr>
          <tr><td>Precio</td><td>Suscripción por asiento</td><td>Gratis; pagas directamente a tu proveedor de modelos</td></tr>
          <tr><td>Entrega</td><td>Dev Mode, inspect, líneas rojas</td><td>Cualquier agente en <code>$PATH</code>, más exportaciones HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Autohospedable</td><td>No</td><td>Sí (portátil o tu propio despliegue)</td></tr>
          <tr><td>Ruta de datos</td><td>Archivos → nube de Figma</td><td>Prompts → el proveedor que elijas; nada a través de nosotros</td></tr>
        </tbody>
      </table>
      <p>El resumen honesto: Figma tiene la experiencia de lienzo colaborativo más pulida del mercado, y para un equipo de diseñadores que revisan juntos pantallas precisas, ese pulido es el producto. Open Design cambia el lienzo por completo por una biblioteca — skills, systems y agents diseñados para componerse con la herramienta que ya tienes en tu portátil. Forma distinta, apuesta distinta.</p>

      <h2>Quién debería elegir qué</h2>
      <table>
        <thead><tr><th>Si eres…</th><th>Elige</th></tr></thead>
        <tbody>
          <tr><td>Un equipo de diseño haciendo trabajo de lienzo en tiempo real, con varios diseñadores y revisión en vivo</td><td><strong>Figma.</strong> Nada en el código abierto iguala ese lienzo multijugador.</td></tr>
          <tr><td>Un diseñador haciendo trabajo vectorial y de componentes con precisión de píxel todo el día</td><td><strong>Figma.</strong> Las primitivas del lienzo son maduras y tu memoria muscular vale dinero de verdad.</td></tr>
          <tr><td>Una organización ya estandarizada en Figma con Dev Mode dentro del bucle de ingeniería</td><td><strong>Figma.</strong> Ya pagaste el coste de integración; gástalo.</td></tr>
          <tr><td>Un ingeniero de diseño que ya impulsa Claude Code, Codex o Cursor desde la terminal</td><td><strong>Open Design.</strong> Tu agente es el motor de diseño; la capa de skills aporta gusto y estructura sin una app nueva.</td></tr>
          <tr><td>Cualquiera que necesite BYOK, cambio de modelo a mitad de proyecto o procesamiento local-only para briefs sensibles</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">La realidad es más áspera que el marketing</a>, pero es el único contrato que realmente se sostiene.</td></tr>
          <tr><td>Un equipo que quiere un sistema de diseño que sobreviva al recambio de herramientas</td><td><strong>Open Design.</strong> Los archivos <code>DESIGN.md</code> sobreviven a la herramienta que los lee.</td></tr>
          <tr><td>Un colaborador de código abierto que quiere enviar un flujo de trabajo de diseño que el proyecto pueda adoptar</td><td><strong>Open Design.</strong> Suelta una carpeta, reinicia el daemon, envía el PR.</td></tr>
        </tbody>
      </table>
      <p>La dimensión que lo decide para la mayoría de los equipos no es la calidad — el oficio de Figma es real. Es si tu trabajo es un lienzo sobre el que pintar, o un flujo de trabajo que automatizar. Si es lo segundo, preferirás poseerlo a alquilarlo.</p>

      <h2>Qué hacer a continuación</h2>
      <p>Si ya tienes una tarea repetible de Figma — exportar estos frames, sincronizar esos tokens, reconstruir esa plantilla de deck — la forma más rápida de sentir la diferencia es <a href="/blog/port-figma-workflow-open-design-plugin/">migrar una de ellas a un plugin</a>. Empieza con una tarea pequeña, molesta y repetible, no con «reemplazar Figma».</p>
      <p>O simplemente ejecuta el inicio rápido de tres comandos y apúntalo al modelo que ya pagas. Todo vive en un repo y el primer deck lleva unos diez minutos.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Prueba el flujo de trabajo de código abierto</a>.</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Cómo migrar un flujo de trabajo de Figma a un plugin de Open Design</a> — el camino concreto para una exportación, sincronización de tokens o kit de marca</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">La alternativa de código abierto a Claude Design</a> — la misma lectura honesta, con otra herramienta</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, y no como un producto</a> — el manifiesto más extenso detrás de la apuesta de «capa, no producto»</li>
      </ul>
  pt-br:
    title: "A alternativa de código aberto ao Figma"
    summary: "O Figma é excelente e não vai a lugar nenhum. Mas o arquivo é proprietário, os assentos são uma assinatura e o canvas vive na nuvem de outra pessoa. Aqui está a leitura honesta de quando o Figma ainda é a resposta — e quando ter um fluxo de trabalho agent-native e local-first é o que vence."
    bodyHtml: |
      <p>O Figma é excelente. Entregamos trabalho real nele há anos, e este não é um texto de "o Figma morreu" — está longe disso. O fato de termos <a href="/blog/why-we-built-open-design-as-a-skill-layer/">construído uma camada de código aberto</a> em vez de mais um canvas não é uma reclamação sobre a qualidade do Figma. É uma aposta de que a próxima década do trabalho de design vai se parecer menos com um cursor em um canvas infinito e mais com um agent que você já paga, conduzindo um fluxo de trabalho que você realmente possui. Este texto é a leitura honesta sobre o Figma vinda de uma equipe que constrói na mesma categoria: o que ele faz de melhor, onde ele te prende, como o caminho de código aberto realmente é, e qual deles você deve escolher neste trimestre.</p>

      <h2>O que o Figma de fato é</h2>
      <p>O Figma é a ferramenta de design colaborativo padrão. Um canvas multiplayer em tempo real no navegador, com o Dev Mode para handoff, o FigJam para quadros brancos, um marketplace de plugins profundo e um conjunto crescente de recursos de IA acoplados à mesma superfície. O preço é por assento ao mês, escalonado por papel e por organização.</p>
      <p>Há algumas coisas que ele faz melhor do que qualquer outra ferramenta:</p>
      <ul>
        <li><strong>Colaboração em canvas em tempo real.</strong> Cinco pessoas em um mesmo arquivo, cursores ao vivo, comentários inline. Nada no código aberto se compara ao polimento multiplayer.</li>
        <li><strong>Trabalho vetorial com precisão de pixel.</strong> Auto Layout, restrições, variantes, componentes — os primitivos de canvas são maduros e a memória muscular é profunda.</li>
        <li><strong>Um ecossistema enorme de plugins.</strong> Uma década de plugins de terceiros, arquivos da comunidade e templates prontos para usar.</li>
        <li><strong>Um handoff que as equipes já conhecem.</strong> Dev Mode, inspect, redlines e um fluxo de trabalho no qual a engenharia foi treinada por anos.</li>
      </ul>
      <p>Se o seu trabalho é um designer pintando telas precisas para outras pessoas revisarem em um canvas compartilhado, o Figma ainda é a resposta, e uma boa resposta. As diferenças que realmente importam vivem uma camada abaixo — em quem é dono do arquivo, do fluxo de trabalho e da curva de custo.</p>

      <h2>Onde ele te prende</h2>
      <p>O Figma carrega quatro tipos de lock-in que vale a pena nomear de cara, porque as páginas de preço não fazem isso.</p>
      <p><strong>O arquivo é proprietário.</strong> Seu design vive no formato do Figma, dentro dos servidores do Figma. Você pode exportar PNGs e especificações de dev, mas a fonte da verdade — componentes, variantes, o design system vivo — só é totalmente legível dentro do Figma. Não existe uma versão em texto puro do seu trabalho que sobreviva à ferramenta.</p>
      <p><strong>O runtime é hospedado.</strong> O canvas é a nuvem. Para trabalho de agência ou criação pré-lançamento sob NDA, "onde esse arquivo vive" é uma conversa de procurement, não uma configuração. Local-only não é um modo.</p>
      <p><strong>Os plugins não são portáveis.</strong> O ecossistema de plugins do Figma é real e profundo — mas cada plugin roda dentro do runtime do Figma, contra a API do Figma. Um fluxo de trabalho que você constrói ali não pode ser retirado e executado por um agent no seu laptop, nem composto em um pipeline que não comece pelo canvas do Figma.</p>
      <p><strong>A conta é por assento, para sempre.</strong> Assentos por assinatura são adequados para uma equipe de design estável. Eles ficam estranhos para uma organização em rápido crescimento, e são inviáveis para a cauda longa de colaboradores, freelancers e parceiros pontuais que de outra forma adotariam o mesmo fluxo de trabalho.</p>
      <p>Nada disso é um bug. É o formato de um produto de canvas colaborativo hospedado, e o Figma é a melhor versão desse formato. Nós simplesmente não estamos construindo para o canvas — estamos construindo para o agent.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Um cadeado preto facetado fundido com a forma de um documento, cercado por uma borda tracejada, com uma chave desenhada como um diagrama de engenharia, sobre uma prancha de estudo editorial em tons quentes" />
        <figcaption>A fonte da verdade vive em um arquivo proprietário, dentro da nuvem de outra pessoa.</figcaption>
      </figure>

      <h2>A mudança em que o Open Design aposta</h2>
      <p>O Open Design não é um clone do Figma. Não há canvas infinito nem cursores multiplayer. É uma camada fina de skills que transforma o agent de programação que você já usa em um motor de design. Os quatro primitivos são <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters e o daemon</a> — e a parte importante é que todos eles são apenas arquivos:</p>
      <ul>
        <li>Cada skill é um arquivo <code>SKILL.md</code> que você pode ler, fazer fork e enviar de volta como um PR.</li>
        <li>Cada design system é um arquivo <code>DESIGN.md</code> portável — incluindo o que entregamos para o próprio Figma. Você pode abri-lo em qualquer editor, fazer diff dele no git, e ele sobrevive a qualquer ferramenta que o leia em seguida.</li>
        <li>Cada agent adapter tem cerca de 80 linhas de TypeScript.</li>
      </ul>
      <p>O que isso te dá é exatamente o oposto dos quatro lock-ins acima:</p>
      <ul>
        <li><strong>O arquivo é texto puro.</strong> Skills e systems são Markdown em um repo. Seu design system é legível sem a ferramenta.</li>
        <li><strong>O runtime é local.</strong> Ele roda no seu laptop via <code>pnpm tools-dev</code>, ou você mesmo faz o deploy. Os prompts vão para o provedor de modelo que você escolheu — nada passa por nós.</li>
        <li><strong>O fluxo de trabalho é portável.</strong> Um skill é uma pasta. Ele se compõe com qualquer agent no seu <code>$PATH</code>, não com o runtime de plugins de um único fornecedor.</li>
        <li><strong>BYOK por padrão.</strong> Cole qualquer <code>base_url</code> e key compatíveis com OpenAI; <a href="/blog/byok-design-workflow-claude-codex-qwen/">seus tokens vão direto para o provedor</a>. Apache-2.0, sem cadastro, sem conta por assento.</li>
      </ul>
      <p>O modelo mental: o Figma é um canvas que você aluga. O Open Design é um fluxo de trabalho que você possui.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Um leque de folhas de papel preto liso e fichas de índice se espalhando para fora de um recipiente aberto, algumas deslizando soltas, sobre uma prancha de estudo editorial em tons quentes" />
        <figcaption>Skills e systems são arquivos de texto puro em um repo — portáveis, passíveis de fork, legíveis sem a ferramenta.</figcaption>
      </figure>

      <h2>Lado a lado</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Licença</td><td>Proprietária</td><td>Apache-2.0</td></tr>
          <tr><td>Runtime</td><td>Hospedado (navegador, nuvem do Figma)</td><td>Daemon local (<code>pnpm tools-dev</code>) + self-host opcional</td></tr>
          <tr><td>Formato de origem</td><td><code>.fig</code> proprietário</td><td><code>SKILL.md</code> / <code>DESIGN.md</code> em texto puro num repo</td></tr>
          <tr><td>Superfície principal</td><td>Canvas multiplayer em tempo real</td><td>Geração conduzida por agent + preview em sandbox</td></tr>
          <tr><td>Modelos / IA</td><td>Recursos de IA próprios do Figma</td><td>Qualquer endpoint compatível com OpenAI + CLIs de coding agent detectadas</td></tr>
          <tr><td>Plugins</td><td>Marketplace, roda dentro do Figma</td><td>Pastas de skill passíveis de fork, executadas por qualquer agent</td></tr>
          <tr><td>Design systems</td><td>Bibliotecas do Figma (na ferramenta)</td><td>Arquivos <code>DESIGN.md</code> portáveis (inclui um do Figma)</td></tr>
          <tr><td>Preço</td><td>Assinatura por assento</td><td>Gratuito; você paga seu provedor de modelo diretamente</td></tr>
          <tr><td>Handoff</td><td>Dev Mode, inspect, redlines</td><td>Qualquer agent no <code>$PATH</code>, além de exports HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Auto-hospedável</td><td>Não</td><td>Sim (laptop ou seu próprio deploy)</td></tr>
          <tr><td>Caminho dos dados</td><td>Arquivos → nuvem do Figma</td><td>Prompts → o provedor que você escolheu; nada passa por nós</td></tr>
        </tbody>
      </table>
      <p>O resumo honesto: o Figma tem a experiência de canvas colaborativo mais polida do mercado, e para uma equipe de designers revisando telas precisas juntos, esse polimento é o produto. O Open Design troca o canvas por completo por uma biblioteca — skills, systems e agents projetados para se compor com a ferramenta que você já tem no seu laptop. Formato diferente, aposta diferente.</p>

      <h2>Quem deve escolher o quê</h2>
      <table>
        <thead><tr><th>Se você é…</th><th>Escolha</th></tr></thead>
        <tbody>
          <tr><td>Uma equipe de design fazendo trabalho de canvas em tempo real, com múltiplos designers e revisão ao vivo</td><td><strong>Figma.</strong> Nada no código aberto se compara ao canvas multiplayer.</td></tr>
          <tr><td>Um designer fazendo trabalho vetorial e de componentes com precisão de pixel o dia inteiro</td><td><strong>Figma.</strong> Os primitivos de canvas são maduros e sua memória muscular vale dinheiro de verdade.</td></tr>
          <tr><td>Uma organização já padronizada no Figma com o Dev Mode dentro do loop de engenharia</td><td><strong>Figma.</strong> Você já pagou o custo de integração; aproveite-o.</td></tr>
          <tr><td>Um design engineer que já conduz Claude Code, Codex ou Cursor a partir do terminal</td><td><strong>Open Design.</strong> Seu agent é o motor de design; a camada de skills adiciona gosto e estrutura sem um novo aplicativo.</td></tr>
          <tr><td>Qualquer um que precise de BYOK, troca de modelo no meio do projeto, ou processamento local-only para briefings sensíveis</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">A realidade é mais áspera do que o marketing</a>, mas é o único contrato que realmente se sustenta.</td></tr>
          <tr><td>Uma equipe que quer um design system que sobreviva à rotatividade de ferramentas</td><td><strong>Open Design.</strong> Arquivos <code>DESIGN.md</code> sobrevivem à ferramenta que os lê.</td></tr>
          <tr><td>Um contribuidor de código aberto que quer entregar um fluxo de trabalho de design que o projeto possa adotar</td><td><strong>Open Design.</strong> Solte uma pasta, reinicie o daemon, envie o PR.</td></tr>
        </tbody>
      </table>
      <p>A dimensão que decide isso para a maioria das equipes não é qualidade — o ofício do Figma é real. É se o seu trabalho é um canvas para pintar, ou um fluxo de trabalho para automatizar. Se for o segundo, você vai preferir possuí-lo a alugá-lo.</p>

      <h2>O que fazer a seguir</h2>
      <p>Se você já tem uma tarefa repetível no Figma — exportar estes frames, sincronizar aqueles tokens, reconstruir aquele template de deck — a forma mais rápida de sentir a diferença é <a href="/blog/port-figma-workflow-open-design-plugin/">migrar uma delas para um plugin</a>. Comece com uma tarefa pequena, irritante e repetível, não com "substituir o Figma".</p>
      <p>Ou simplesmente rode o quickstart de três comandos e aponte-o para o modelo que você já paga. A coisa toda vive em um único repo e o primeiro deck leva cerca de dez minutos.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Experimente o fluxo de trabalho de código aberto</a>.</p>

      <h2>Leitura complementar</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Como migrar um fluxo de trabalho do Figma para um plugin do Open Design</a> — o caminho concreto para um export, sincronização de tokens ou kit de marca</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">A alternativa de código aberto ao Claude Design</a> — a mesma leitura honesta, uma ferramenta ao lado</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, e não como um produto</a> — o manifesto mais longo por trás da aposta "camada, não produto"</li>
      </ul>
  it:
    title: "L'alternativa open source a Figma"
    summary: "Figma è eccellente e non sparirà. Ma il file è proprietario, le postazioni sono un abbonamento e la canvas vive nel cloud di qualcun altro. Ecco una valutazione onesta su quando Figma è ancora la risposta — e quando conviene possedere un flusso di lavoro agent-native, local-first."
    bodyHtml: |
      <p>Figma è eccellente. Ci abbiamo consegnato lavoro reale per anni, e questo non è un articolo «Figma è morta» — non lo è affatto. Il fatto che abbiamo <a href="/blog/why-we-built-open-design-as-a-skill-layer/">costruito un layer open source</a> invece di un'altra canvas non è una critica all'artigianato di Figma. È una scommessa: il prossimo decennio del lavoro di design assomiglierà meno a un cursore su una canvas infinita e più a un agent che già paghi, che guida un flusso di lavoro che possiedi davvero. Questo articolo è la valutazione onesta di Figma da parte di un team che costruisce nella stessa categoria: cosa fa meglio, dove ti blocca dentro, com'è davvero il percorso open source, e quale dei due dovresti scegliere in questo trimestre.</p>

      <h2>Cos'è davvero Figma</h2>
      <p>Figma è lo strumento di design collaborativo di default. Una canvas multiplayer in tempo reale nel browser, con Dev Mode per l'handoff, FigJam per il whiteboarding, un marketplace di plugin ricco e un insieme crescente di funzioni AI innestate sulla stessa superficie. Il prezzo è per postazione al mese, suddiviso in fasce per ruolo e per organizzazione.</p>
      <p>Fa alcune cose meglio di chiunque altro:</p>
      <ul>
        <li><strong>Collaborazione su canvas in tempo reale.</strong> Cinque persone in un unico file, cursori dal vivo, commenti in linea. Niente nell'open source eguaglia la rifinitura del multiplayer.</li>
        <li><strong>Lavoro vettoriale al pixel.</strong> Auto Layout, vincoli, varianti, componenti — le primitive della canvas sono mature e la memoria muscolare è profonda.</li>
        <li><strong>Un enorme ecosistema di plugin.</strong> Un decennio di plugin di terze parti, file della community e template pronti da usare.</li>
        <li><strong>Un handoff che i team già conoscono.</strong> Dev Mode, inspect, redline e un flusso di lavoro su cui gli ingegneri sono stati addestrati per anni.</li>
      </ul>
      <p>Se il tuo lavoro è un designer che dipinge schermate precise da far revisionare ad altre persone su una canvas condivisa, Figma è ancora la risposta, ed è una buona risposta. Le differenze che vale la pena considerare vivono un livello più in basso — in chi possiede il file, il flusso di lavoro e la curva dei costi.</p>

      <h2>Dove ti blocca dentro</h2>
      <p>Figma porta con sé quattro forme di lock-in che vale la pena nominare apertamente, perché le pagine dei prezzi non lo fanno.</p>
      <p><strong>Il file è proprietario.</strong> Il tuo design vive nel formato di Figma, dentro i server di Figma. Puoi esportare PNG e specifiche per gli sviluppatori, ma la fonte di verità — componenti, varianti, il design system vivo — è pienamente leggibile solo dentro Figma. Non esiste una versione in testo semplice del tuo lavoro che sopravviva fuori dallo strumento.</p>
      <p><strong>Il runtime è ospitato.</strong> La canvas è il cloud. Per il lavoro d'agenzia o per la creatività pre-lancio sotto NDA, «dove vive questo file» è una conversazione di procurement, non un'impostazione. Il local-only non è una modalità.</p>
      <p><strong>I plugin non sono portabili.</strong> L'ecosistema di plugin di Figma è reale e profondo — ma ogni plugin gira dentro il runtime di Figma, contro le API di Figma. Un flusso di lavoro che costruisci lì non può essere estratto e fatto girare da un agent sul tuo laptop, né composto in una pipeline che non inizia con la canvas di Figma.</p>
      <p><strong>Il conto è per postazione, per sempre.</strong> Le postazioni in abbonamento vanno bene per un team di design stabile. Diventano scomode per un'organizzazione in rapida crescita, e sono un non-punto di partenza per la lunga coda di collaboratori, freelance e collaboratori occasionali che altrimenti adotterebbero lo stesso flusso di lavoro.</p>
      <p>Nessuna di queste è un bug. Sono la forma di un prodotto a canvas collaborativa ospitata, e Figma è la migliore versione di quella forma. Semplicemente noi non costruiamo per la canvas — costruiamo per l'agent.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Un lucchetto nero sfaccettato fuso con la forma di un documento, cerchiato da un confine tratteggiato, con una chiave disegnata come un diagramma tecnico, su una tavola di studio editoriale dai toni caldi" />
        <figcaption>La fonte di verità vive in un file proprietario, dentro il cloud di qualcun altro.</figcaption>
      </figure>

      <h2>Il cambiamento su cui scommette Open Design</h2>
      <p>Open Design non è un clone di Figma. Non c'è canvas infinita e non ci sono cursori multiplayer. È un sottile skill layer che trasforma l'agent di coding che già usi in un motore di design. Le quattro primitive sono <a href="/blog/31-skills-72-systems-how-the-library-works/">skill, system, adapter e daemon</a> — e la parte importante è che sono tutti solo file:</p>
      <ul>
        <li>Ogni skill è un file <code>SKILL.md</code> che puoi leggere, fare fork e rimandare indietro come PR.</li>
        <li>Ogni design system è un file <code>DESIGN.md</code> portabile — incluso quello che pubblichiamo per Figma stesso. Puoi aprirlo in qualsiasi editor, fare il diff in git, e sopravvive a qualunque strumento lo legga dopo.</li>
        <li>Ogni agent adapter è circa 80 righe di TypeScript.</li>
      </ul>
      <p>Ciò che questo ti compra è l'esatto opposto dei quattro lock-in qui sopra:</p>
      <ul>
        <li><strong>Il file è testo semplice.</strong> Skill e system sono Markdown in un repo. Il tuo design system è leggibile senza lo strumento.</li>
        <li><strong>Il runtime è locale.</strong> Gira sul tuo laptop tramite <code>pnpm tools-dev</code>, oppure lo distribuisci tu stesso. I prompt vanno al model provider che hai scelto — niente passa attraverso di noi.</li>
        <li><strong>Il flusso di lavoro è portabile.</strong> Una skill è una cartella. Si compone in qualsiasi agent sul tuo <code>$PATH</code>, non nel runtime di plugin di un singolo vendor.</li>
        <li><strong>BYOK di default.</strong> Incolla qualsiasi <code>base_url</code> e key compatibili con OpenAI; <a href="/blog/byok-design-workflow-claude-codex-qwen/">i tuoi token vanno dritti al provider</a>. Apache-2.0, nessuna registrazione, nessun conto per postazione.</li>
      </ul>
      <p>Il modello mentale: Figma è una canvas che affitti. Open Design è un flusso di lavoro che possiedi.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Un ventaglio di fogli di carta nera semplice e schede indice che si dispiega da un contenitore aperto, con un paio che fluttuano via, su una tavola di studio editoriale dai toni caldi" />
        <figcaption>Skill e system sono file in testo semplice in un repo — portabili, forkabili, leggibili senza lo strumento.</figcaption>
      </figure>

      <h2>Confronto diretto</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Licenza</td><td>Proprietaria</td><td>Apache-2.0</td></tr>
          <tr><td>Runtime</td><td>Ospitato (browser, cloud di Figma)</td><td>Daemon locale (<code>pnpm tools-dev</code>) + self-host opzionale</td></tr>
          <tr><td>Formato sorgente</td><td><code>.fig</code> proprietario</td><td><code>SKILL.md</code> / <code>DESIGN.md</code> in testo semplice in un repo</td></tr>
          <tr><td>Superficie principale</td><td>Canvas multiplayer in tempo reale</td><td>Generazione guidata da agent + anteprima in sandbox</td></tr>
          <tr><td>Modelli / AI</td><td>Funzioni AI proprie di Figma</td><td>Qualsiasi endpoint compatibile con OpenAI + CLI di coding-agent rilevate</td></tr>
          <tr><td>Plugin</td><td>Marketplace, gira dentro Figma</td><td>Cartelle skill forkabili, eseguite da qualsiasi agent</td></tr>
          <tr><td>Design system</td><td>Librerie Figma (nello strumento)</td><td>File <code>DESIGN.md</code> portabili (incluso uno per Figma)</td></tr>
          <tr><td>Prezzi</td><td>Abbonamento per postazione</td><td>Gratuito; paghi direttamente il tuo model provider</td></tr>
          <tr><td>Handoff</td><td>Dev Mode, inspect, redline</td><td>Qualsiasi agent sul <code>$PATH</code>, più export HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Self-hostable</td><td>No</td><td>Sì (laptop o il tuo deploy)</td></tr>
          <tr><td>Percorso dei dati</td><td>File → cloud di Figma</td><td>Prompt → il provider che hai scelto; niente passa attraverso di noi</td></tr>
        </tbody>
      </table>
      <p>Il riassunto onesto: Figma ha l'esperienza di canvas collaborativa più rifinita sul mercato, e per un team di designer che revisionano insieme schermate precise, quella rifinitura è il prodotto. Open Design baratta completamente la canvas per una libreria — skill, system e agent progettati per comporsi con lo strumento che hai già sul laptop. Forma diversa, scommessa diversa.</p>

      <h2>Chi dovrebbe scegliere cosa</h2>
      <table>
        <thead><tr><th>Se sei…</th><th>Scegli</th></tr></thead>
        <tbody>
          <tr><td>Un team di design che fa lavoro su canvas in tempo reale, con più designer e revisione dal vivo</td><td><strong>Figma.</strong> Niente nell'open source eguaglia la canvas multiplayer.</td></tr>
          <tr><td>Un designer che fa lavoro vettoriale e su componenti al pixel tutto il giorno</td><td><strong>Figma.</strong> Le primitive della canvas sono mature e la tua memoria muscolare vale soldi veri.</td></tr>
          <tr><td>Un'organizzazione già standardizzata su Figma con Dev Mode nel ciclo di engineering</td><td><strong>Figma.</strong> Hai già pagato il costo dell'integrazione; sfruttalo.</td></tr>
          <tr><td>Un design engineer che già guida Claude Code, Codex o Cursor dal terminale</td><td><strong>Open Design.</strong> Il tuo agent è il motore di design; lo skill layer aggiunge gusto e struttura senza una nuova app.</td></tr>
          <tr><td>Chiunque abbia bisogno di BYOK, di cambiare modello a metà progetto, o di local-only per brief sensibili</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">La realtà è più ruvida del marketing</a>, ma è l'unico contratto che regge davvero.</td></tr>
          <tr><td>Un team che vuole un design system che sopravviva al ricambio degli strumenti</td><td><strong>Open Design.</strong> I file <code>DESIGN.md</code> sopravvivono allo strumento che li legge.</td></tr>
          <tr><td>Un contributore open source che vuole pubblicare un flusso di lavoro di design che il progetto possa adottare</td><td><strong>Open Design.</strong> Metti una cartella, riavvia il daemon, manda la PR.</td></tr>
        </tbody>
      </table>
      <p>La dimensione che decide per la maggior parte dei team non è la qualità — l'artigianato di Figma è reale. È se il tuo lavoro è una canvas da dipingere, o un flusso di lavoro da automatizzare. Se è il secondo, preferiresti possederlo piuttosto che affittarlo.</p>

      <h2>Cosa fare adesso</h2>
      <p>Se hai già un lavoro Figma ripetibile — esporta questi frame, sincronizza quei token, ricostruisci quel template di deck — il modo più rapido per sentire la differenza è <a href="/blog/port-figma-workflow-open-design-plugin/">portarne uno in un plugin</a>. Inizia con un piccolo compito fastidioso e ripetibile, non con «sostituire Figma».</p>
      <p>Oppure esegui semplicemente il quickstart da tre comandi e puntalo al modello che già paghi. L'intera cosa vive in un unico repo e il primo deck richiede circa dieci minuti.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Prova il flusso di lavoro open source</a>.</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Come portare un flusso di lavoro Figma in un plugin di Open Design</a> — il percorso concreto per un export, una sincronizzazione di token o un brand kit</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">L'alternativa open source a Claude Design</a> — la stessa valutazione onesta, con uno strumento diverso</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come skill layer, non come prodotto</a> — il manifesto più lungo dietro la scommessa «layer, non prodotto»</li>
      </ul>
  vi:
    title: "Giải pháp thay thế mã nguồn mở cho Figma"
    summary: "Figma rất xuất sắc và nó sẽ không biến mất. Nhưng định dạng tệp là độc quyền, chỗ ngồi là gói thuê bao, và canvas thì sống trên đám mây của người khác. Đây là một nhận định trung thực: khi nào Figma vẫn là câu trả lời — và khi nào việc sở hữu một quy trình làm việc agent-native, ưu tiên cục bộ sẽ thắng."
    bodyHtml: |
      <p>Figma rất xuất sắc. Chúng tôi đã dùng nó để giao ra những sản phẩm thật trong nhiều năm, và đây không phải là một bài viết kiểu «Figma đã chết» — hoàn toàn không phải vậy. Việc chúng tôi <a href="/blog/why-we-built-open-design-as-a-skill-layer/">xây một lớp skill mã nguồn mở</a> thay vì làm thêm một canvas nữa không phải là lời than phiền về tay nghề của Figma. Đó là một ván cược: thập kỷ tiếp theo của công việc thiết kế sẽ trông ít giống «một con trỏ trên canvas vô hạn» hơn, và giống «một agent mà bạn vốn đã trả tiền, vận hành một quy trình làm việc mà bạn thực sự sở hữu» hơn. Bài viết này là một nhận định trung thực về Figma từ một đội ngũ đang xây dựng trong cùng phân khúc: nó làm tốt nhất điều gì, nó khóa bạn lại ở đâu, con đường mã nguồn mở thực sự trông ra sao, và quý này bạn nên chọn cái nào.</p>

      <h2>Figma thực chất là gì</h2>
      <p>Figma là công cụ thiết kế cộng tác mặc định. Một canvas đa người dùng thời gian thực ngay trong trình duyệt, kèm Dev Mode để bàn giao, FigJam để làm bảng trắng, một chợ plugin sâu rộng, và một tập hợp các tính năng AI ngày càng nhiều được gắn lên cùng một bề mặt. Định giá theo chỗ ngồi mỗi tháng, phân tầng theo vai trò và theo tổ chức.</p>
      <p>Có một vài thứ nó làm tốt hơn bất kỳ công cụ nào khác:</p>
      <ul>
      <li><strong>Cộng tác trên canvas thời gian thực.</strong> Năm người trong cùng một tệp, con trỏ hiển thị trực tiếp, bình luận ngay tại chỗ. Không có gì trong thế giới mã nguồn mở sánh được với độ hoàn thiện đa người dùng đó.</li>
      <li><strong>Công việc vector chính xác đến từng pixel.</strong> Auto Layout, ràng buộc, variant, component — các nguyên thủy của canvas đã trưởng thành và trí nhớ cơ bắp ăn sâu.</li>
      <li><strong>Một hệ sinh thái plugin khổng lồ.</strong> Một thập kỷ tích lũy plugin bên thứ ba, tệp cộng đồng và mẫu mà bạn có thể thả vào dùng ngay.</li>
      <li><strong>Quy trình bàn giao mà các đội đã quen thuộc.</strong> Dev Mode, inspect, đường đỏ chú thích, và một quy trình làm việc mà kỹ sư đã được huấn luyện nhiều năm.</li>
      </ul>
      <p>Nếu công việc của bạn là một nhà thiết kế vẽ những màn hình chính xác để người khác review trên một canvas chia sẻ, Figma vẫn là câu trả lời, và là một câu trả lời tốt. Những khác biệt đáng quan tâm nằm ở một lớp sâu hơn — ở chỗ ai sở hữu tệp, quy trình làm việc, và đường cong chi phí.</p>

      <h2>Nó khóa bạn lại ở đâu</h2>
      <p>Figma mang theo bốn mảnh khóa-vào đáng nói thẳng ngay từ đầu, vì các trang định giá sẽ không nói.</p>
      <p><strong>Tệp là độc quyền.</strong> Thiết kế của bạn sống trong định dạng của Figma, bên trong máy chủ của Figma. Bạn có thể xuất PNG và đặc tả cho dev, nhưng nguồn sự thật — component, variant, hệ thống thiết kế sống — chỉ hoàn toàn đọc được bên trong Figma. Không có một phiên bản văn bản thuần nào của công việc của bạn sống sót được bên ngoài công cụ.</p>
      <p><strong>Runtime được lưu trữ trên máy chủ.</strong> Canvas chính là đám mây. Đối với công việc của agency, hay sáng tạo trước khi ra mắt dưới NDA, «tệp này sống ở đâu» là một cuộc đàm phán mua sắm, chứ không phải một tùy chọn cài đặt. Chỉ-cục-bộ không phải là một chế độ.</p>
      <p><strong>Plugin không di động được.</strong> Hệ sinh thái plugin của Figma thật và sâu — nhưng mọi plugin đều chạy bên trong runtime của Figma, đối với API của Figma. Một quy trình làm việc bạn xây ở đó không thể được nhấc ra và chạy bởi một agent trên laptop của bạn, cũng không thể được ghép vào một pipeline không bắt đầu từ canvas của Figma.</p>
      <p><strong>Hóa đơn luôn tính theo chỗ ngồi, mãi mãi.</strong> Chỗ ngồi thuê bao thì ổn với một đội thiết kế ổn định. Chúng trở nên lúng túng với một tổ chức đang tăng trưởng nhanh, và là điều bất khả thi với cái đuôi dài gồm những người đóng góp, nhà thầu, và cộng tác viên một lần — những người vốn cũng có thể tiếp nhận cùng một quy trình làm việc.</p>
      <p>Không cái nào trong số này là lỗi. Chúng là hình hài của một sản phẩm canvas cộng tác được lưu trữ trên máy chủ, và Figma là phiên bản tốt nhất của hình hài đó. Chỉ là chúng tôi không xây cho canvas — chúng tôi xây cho agent.</p>

      <figure>
      <img src="/blog/plate-17-locked-format.png" alt="Một ổ khóa đen nhiều mặt hợp nhất với hình dạng tài liệu, được bao quanh bởi một đường biên nét đứt cùng một chiếc chìa khóa được vẽ như sơ đồ kỹ thuật, trên một tấm bản nghiên cứu phong cách biên tập tông ấm" />
      <figcaption>Nguồn sự thật sống trong một tệp độc quyền, bên trong đám mây của người khác.</figcaption>
      </figure>

      <h2>Sự chuyển dịch mà Open Design đặt cược</h2>
      <p>Open Design không phải là một bản sao của Figma. Ở đây không có canvas vô hạn và không có con trỏ đa người dùng. Nó là một lớp skill mỏng biến chính cái agent lập trình mà bạn đã dùng thành một cỗ máy thiết kế. Bốn nguyên thủy là <a href="/blog/31-skills-72-systems-how-the-library-works/">skill, system, adapter và daemon</a> — và phần quan trọng là tất cả chúng chỉ là các tệp:</p>
      <ul>
      <li>Mỗi skill là một tệp <code>SKILL.md</code> mà bạn có thể đọc, fork, và gửi lại dưới dạng PR.</li>
      <li>Mỗi hệ thống thiết kế là một tệp <code>DESIGN.md</code> di động — bao gồm cả cái mà chúng tôi ship cho chính Figma. Bạn có thể mở nó trong bất kỳ trình soạn thảo nào, diff nó trong git, và nó sống lâu hơn bất kỳ công cụ nào đọc nó kế tiếp.</li>
      <li>Mỗi agent adapter là khoảng 80 dòng TypeScript.</li>
      </ul>
      <p>Cái mà điều đó mang lại cho bạn chính là mặt đối lập của bốn mảnh khóa-vào ở trên:</p>
      <ul>
      <li><strong>Tệp là văn bản thuần.</strong> Skill và system là Markdown trong một repo. Hệ thống thiết kế của bạn đọc được mà không cần công cụ.</li>
      <li><strong>Runtime nằm cục bộ.</strong> Nó chạy trên laptop của bạn qua <code>pnpm tools-dev</code>, hoặc bạn tự triển khai. Prompt đi tới nhà cung cấp mô hình mà bạn đã chọn — không có gì đi qua chúng tôi.</li>
      <li><strong>Quy trình làm việc di động được.</strong> Một skill là một thư mục. Nó ghép được vào bất kỳ agent nào trên <code>$PATH</code> của bạn, chứ không phải runtime plugin của một nhà cung cấp duy nhất.</li>
      <li><strong>BYOK theo mặc định.</strong> Dán vào bất kỳ <code>base_url</code> và key tương thích OpenAI nào; <a href="/blog/byok-design-workflow-claude-codex-qwen/">token của bạn đi thẳng tới nhà cung cấp</a>. Apache-2.0, không cần đăng ký, không có hóa đơn tính theo chỗ ngồi.</li>
      </ul>
      <p>Mô hình tư duy là thế này: Figma là một canvas bạn thuê. Open Design là một quy trình làm việc bạn sở hữu.</p>

      <figure>
      <img src="/blog/plate-18-portable-files.png" alt="Một xấp giấy đen trơn và thẻ mục lục xòe ra từ một hộp đựng đang mở, vài tờ đang trôi tự do, trên một tấm bản nghiên cứu phong cách biên tập tông ấm" />
      <figcaption>Skill và system là những tệp văn bản thuần trong một repo — di động được, fork được, đọc được mà không cần công cụ.</figcaption>
      </figure>

      <h2>Đối chiếu song song</h2>
      <table>
      <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
      <tbody>
      <tr><td>Giấy phép</td><td>Độc quyền</td><td>Apache-2.0</td></tr>
      <tr><td>Runtime</td><td>Lưu trữ trên máy chủ (trình duyệt, đám mây Figma)</td><td>Daemon cục bộ (<code>pnpm tools-dev</code>) + tự lưu trữ tùy chọn</td></tr>
      <tr><td>Định dạng tệp nguồn</td><td><code>.fig</code> độc quyền</td><td><code>SKILL.md</code> / <code>DESIGN.md</code> văn bản thuần trong một repo</td></tr>
      <tr><td>Bề mặt chính</td><td>Canvas đa người dùng thời gian thực</td><td>Sinh ra do agent vận hành + xem trước trong sandbox</td></tr>
      <tr><td>Mô hình / AI</td><td>Các tính năng AI riêng của Figma</td><td>Bất kỳ endpoint tương thích OpenAI nào + các CLI agent lập trình được phát hiện</td></tr>
      <tr><td>Plugin</td><td>Chợ ứng dụng, chạy bên trong Figma</td><td>Thư mục skill fork được, bất kỳ agent nào cũng chạy được</td></tr>
      <tr><td>Hệ thống thiết kế</td><td>Thư viện Figma (trong công cụ)</td><td>Các tệp <code>DESIGN.md</code> di động (gồm cả một bản cho Figma)</td></tr>
      <tr><td>Định giá</td><td>Thuê bao theo chỗ ngồi</td><td>Miễn phí; bạn trả thẳng cho nhà cung cấp mô hình</td></tr>
      <tr><td>Bàn giao</td><td>Dev Mode, inspect, đường đỏ</td><td>Bất kỳ agent nào trên <code>$PATH</code>, cùng với xuất HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Tự lưu trữ được</td><td>Không</td><td>Có (laptop hoặc bản triển khai của riêng bạn)</td></tr>
      <tr><td>Đường đi dữ liệu</td><td>Tệp → đám mây Figma</td><td>Prompt → nhà cung cấp bạn chọn; không có gì đi qua chúng tôi</td></tr>
      </tbody>
      </table>
      <p>Tóm tắt một cách trung thực: Figma có trải nghiệm canvas cộng tác hoàn thiện nhất trên thị trường, và với một đội ngũ các nhà thiết kế cùng review những màn hình chính xác, độ hoàn thiện đó chính là sản phẩm. Open Design thì đánh đổi toàn bộ canvas để lấy một thư viện — skill, system và agent, được thiết kế để ghép với công cụ vốn đã có trên laptop của bạn. Hình hài khác, ván cược khác.</p>

      <h2>Ai nên chọn cái gì</h2>
      <table>
      <thead><tr><th>Nếu bạn là…</th><th>Chọn</th></tr></thead>
      <tbody>
      <tr><td>Một đội thiết kế làm công việc canvas đa nhà thiết kế thời gian thực với review trực tiếp</td><td><strong>Figma.</strong> Không có gì trong thế giới mã nguồn mở sánh được với canvas đa người dùng.</td></tr>
      <tr><td>Một nhà thiết kế làm công việc vector và component chính xác đến từng pixel cả ngày</td><td><strong>Figma.</strong> Các nguyên thủy của canvas đã trưởng thành và trí nhớ cơ bắp của bạn đáng giá tiền thật.</td></tr>
      <tr><td>Một tổ chức đã chuẩn hóa trên Figma với Dev Mode trong vòng lặp kỹ thuật</td><td><strong>Figma.</strong> Bạn đã trả chi phí tích hợp rồi; hãy tiêu nó đi.</td></tr>
      <tr><td>Một kỹ sư thiết kế vốn đã vận hành Claude Code, Codex hay Cursor từ terminal</td><td><strong>Open Design.</strong> Agent của bạn chính là cỗ máy thiết kế; lớp skill thêm gu thẩm mỹ và cấu trúc mà không cần một ứng dụng mới.</td></tr>
      <tr><td>Bất kỳ ai cần BYOK, đổi mô hình giữa chừng dự án, hoặc xử lý chỉ-cục-bộ cho những bản brief nhạy cảm</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Thực tế thô ráp hơn lời quảng cáo</a>, nhưng đây là khế ước duy nhất thực sự đứng vững.</td></tr>
      <tr><td>Một đội muốn có một hệ thống thiết kế sống sót qua các đợt thay đổi công cụ</td><td><strong>Open Design.</strong> Các tệp <code>DESIGN.md</code> sống lâu hơn công cụ đọc chúng.</td></tr>
      <tr><td>Một người đóng góp mã nguồn mở muốn ship một quy trình làm việc thiết kế mà dự án có thể tiếp nhận</td><td><strong>Open Design.</strong> Thả một thư mục vào, khởi động lại daemon, gửi PR.</td></tr>
      </tbody>
      </table>
      <p>Chiều quyết định với phần lớn các đội không phải là chất lượng — tay nghề của Figma là thật. Mà là: công việc của bạn là một canvas để vẽ lên, hay một quy trình làm việc để tự động hóa. Nếu là vế sau, bạn sẽ thích sở hữu nó hơn là thuê nó.</p>

      <h2>Làm gì tiếp theo</h2>
      <p>Nếu bạn đã có một công việc Figma lặp đi lặp lại — xuất những frame này, đồng bộ những token kia, dựng lại cái mẫu deck đó — cách nhanh nhất để cảm nhận sự khác biệt là <a href="/blog/port-figma-workflow-open-design-plugin/">chuyển một trong số chúng thành một plugin</a>. Hãy bắt đầu với một tác vụ nhỏ phiền toái, lặp đi lặp lại, chứ không phải «thay thế Figma».</p>
      <p>Hoặc chỉ cần chạy phần khởi động nhanh ba lệnh và trỏ nó tới mô hình mà bạn vốn đã trả tiền. Toàn bộ thứ này sống trong một repo và deck đầu tiên mất khoảng mười phút.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Hãy thử quy trình làm việc mã nguồn mở này</a>.</p>

      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Cách chuyển một quy trình làm việc Figma thành một plugin Open Design</a> — con đường cụ thể cho một lần xuất, đồng bộ token, hoặc bộ kit thương hiệu</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Giải pháp thay thế mã nguồn mở cho Claude Design</a> — cùng một nhận định trung thực, đổi sang một công cụ khác</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, chứ không phải một sản phẩm</a> — bản tuyên ngôn dài hơi hơn đằng sau ván cược «là lớp, không phải sản phẩm»</li>
      </ul>
  pl:
    title: "Otwartoźródłowa alternatywa dla Figmy"
    summary: "Figma jest znakomita i nigdzie się nie wybiera. Ale format pliku jest zastrzeżony, miejsca to subskrypcja, a płótno żyje w cudzej chmurze. Oto uczciwa ocena tego, kiedy Figma wciąż jest odpowiedzią — i kiedy posiadanie agent-natywnego, lokalnego workflow wygrywa."
    bodyHtml: |
      <p>Figma jest znakomita. Dostarczamy w niej realną pracę od lat i to nie jest wpis w stylu „Figma umarła" — zdecydowanie nim nie jest. Fakt, że <a href="/blog/why-we-built-open-design-as-a-skill-layer/">zbudowaliśmy otwartoźródłową warstwę</a> zamiast kolejnego płótna, nie jest narzekaniem na rzemiosło Figmy. To zakład, że następna dekada pracy projektowej będzie wyglądać mniej jak kursor na nieskończonym płótnie, a bardziej jak agent, za którego już płacisz, napędzający workflow, który naprawdę posiadasz. Ten wpis to uczciwa ocena Figmy z perspektywy zespołu budującego w tej samej kategorii: co robi najlepiej, gdzie cię zamyka, jak naprawdę wygląda otwartoźródłowa ścieżka i po które rozwiązanie powinieneś sięgnąć w tym kwartale.</p>

      <h2>Czym właściwie jest Figma</h2>
      <p>Figma to domyślne narzędzie do projektowania zespołowego. Wielodostępne płótno w czasie rzeczywistym w przeglądarce, z Dev Mode do przekazywania pracy, FigJam do pracy na tablicy, głębokim rynkiem wtyczek i rosnącym zestawem funkcji AI dokręconych do tej samej powierzchni. Cennik jest naliczany za miejsce miesięcznie, z poziomami zależnymi od roli i organizacji.</p>
      <p>Jest garść rzeczy, które robi lepiej niż cokolwiek innego:</p>
      <ul>
        <li><strong>Współpraca na płótnie w czasie rzeczywistym.</strong> Pięć osób w jednym pliku, kursory na żywo, komentarze na miejscu. Nic w open source nie dorównuje temu dopracowaniu pracy wielodostępnej.</li>
        <li><strong>Praca wektorowa z dokładnością do piksela.</strong> Auto Layout, ograniczenia, warianty, komponenty — prymitywy płótna są dojrzałe, a pamięć mięśniowa sięga głęboko.</li>
        <li><strong>Ogromny ekosystem wtyczek.</strong> Dekada wtyczek innych firm, plików społeczności i szablonów, które można od razu wykorzystać.</li>
        <li><strong>Przekazywanie pracy, które zespoły już znają.</strong> Dev Mode, inspect, czerwone linie i workflow, na którym inżynierowie byli szkoleni od lat.</li>
      </ul>
      <p>Jeśli twoja praca to projektant malujący precyzyjne ekrany, które inni ludzie mają recenzować na współdzielonym płótnie, Figma wciąż jest odpowiedzią — i to dobrą. Różnice warte uwagi żyją o warstwę niżej — w tym, kto jest właścicielem pliku, workflow i krzywej kosztów.</p>

      <h2>Gdzie cię zamyka</h2>
      <p>Figma niesie ze sobą cztery elementy uwięzienia warte nazwania wprost, bo strony z cennikiem tego nie zrobią.</p>
      <p><strong>Plik jest zastrzeżony.</strong> Twój projekt żyje w formacie Figmy, na serwerach Figmy. Możesz wyeksportować pliki PNG i specyfikacje dla deweloperów, ale źródło prawdy — komponenty, warianty, żywy system projektowy — jest w pełni czytelne tylko wewnątrz Figmy. Nie ma tekstowej wersji twojej pracy, która przetrwałaby poza narzędziem.</p>
      <p><strong>Środowisko uruchomieniowe jest hostowane.</strong> Płótno to chmura. Dla pracy agencyjnej lub kreacji przed premierą objętej NDA, „gdzie żyje ten plik" to rozmowa z działem zakupów, a nie ustawienie. Tryb wyłącznie lokalny nie istnieje.</p>
      <p><strong>Wtyczki nie są przenośne.</strong> Ekosystem wtyczek Figmy jest realny i głęboki — ale każda wtyczka działa wewnątrz środowiska uruchomieniowego Figmy, przeciwko API Figmy. Workflow, który tam zbudujesz, nie da się wyciągnąć i uruchomić przez agenta na twoim laptopie ani wkomponować w pipeline, który nie zaczyna się od płótna Figmy.</p>
      <p><strong>Rachunek jest za miejsce, na zawsze.</strong> Miejsca w subskrypcji są w porządku dla stabilnego zespołu projektowego. Stają się niewygodne dla szybko rosnącej organizacji i są nie do przyjęcia dla długiego ogona współpracowników, kontraktorów i jednorazowych partnerów, którzy w innym razie mogliby podchwycić ten sam workflow.</p>
      <p>Żadna z tych rzeczy nie jest błędem. To kształt hostowanego produktu z płótnem do współpracy, a Figma jest najlepszą wersją tego kształtu. My po prostu nie budujemy dla płótna — budujemy dla agenta.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Czarna fasetowana kłódka zespolona z kształtem dokumentu, otoczona przerywaną granicą, z kluczem narysowanym jako schemat inżynierski, na ciepłej redakcyjnej planszy studyjnej" />
        <figcaption>Źródło prawdy żyje w zastrzeżonym pliku, wewnątrz cudzej chmury.</figcaption>
      </figure>

      <h2>Zmiana, na którą stawia Open Design</h2>
      <p>Open Design nie jest klonem Figmy. Nie ma tu nieskończonego płótna ani wielodostępnych kursorów. To cienka warstwa skilli, która zamienia agenta kodującego, którego już używasz, w silnik projektowy. Cztery prymitywy to <a href="/blog/31-skills-72-systems-how-the-library-works/">skille, systemy, adaptery i daemon</a> — a istotne jest to, że wszystkie one są po prostu plikami:</p>
      <ul>
        <li>Każdy skill to plik <code>SKILL.md</code>, który możesz przeczytać, sforkować i odesłać jako PR.</li>
        <li>Każdy system projektowy to przenośny plik <code>DESIGN.md</code> — w tym ten, który dostarczamy dla samej Figmy. Możesz go otworzyć w dowolnym edytorze, zrobić diff w git i przetrwa on niezależnie od tego, jakie narzędzie odczyta go następne.</li>
        <li>Każdy adapter agenta to ~80 linii TypeScriptu.</li>
      </ul>
      <p>To, co ci to daje, jest dokładnym przeciwieństwem czterech uwięzień powyżej:</p>
      <ul>
        <li><strong>Plik jest zwykłym tekstem.</strong> Skille i systemy to Markdown w repozytorium. Twój system projektowy jest czytelny bez narzędzia.</li>
        <li><strong>Środowisko uruchomieniowe jest lokalne.</strong> Działa na twoim laptopie przez <code>pnpm tools-dev</code> albo wdrażasz je sam. Prompty trafiają do wybranego przez ciebie dostawcy modelu — nic nie przechodzi przez nas.</li>
        <li><strong>Workflow jest przenośny.</strong> Skill to folder. Komponuje się z dowolnym agentem na twoim <code>$PATH</code>, a nie ze środowiskiem wtyczek jednego dostawcy.</li>
        <li><strong>BYOK domyślnie.</strong> Wklej dowolny zgodny z OpenAI <code>base_url</code> i klucz; <a href="/blog/byok-design-workflow-claude-codex-qwen/">twoje tokeny trafiają prosto do dostawcy</a>. Apache-2.0, bez rejestracji, bez rachunku za miejsce.</li>
      </ul>
      <p>Model mentalny: Figma to płótno, które wynajmujesz. Open Design to workflow, który posiadasz.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Wachlarz zwykłych czarnych kartek papieru i kart indeksowych rozpościerający się z otwartego pojemnika, kilka z nich unosi się swobodnie, na ciepłej redakcyjnej planszy studyjnej" />
        <figcaption>Skille i systemy to tekstowe pliki w repozytorium — przenośne, gotowe do forkowania, czytelne bez narzędzia.</figcaption>
      </figure>

      <h2>Zestawienie obok siebie</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Licencja</td><td>Zastrzeżona</td><td>Apache-2.0</td></tr>
          <tr><td>Środowisko uruchomieniowe</td><td>Hostowane (przeglądarka, chmura Figmy)</td><td>Lokalny daemon (<code>pnpm tools-dev</code>) + opcjonalny self-host</td></tr>
          <tr><td>Format pliku źródłowego</td><td>Zastrzeżony <code>.fig</code></td><td>Tekstowe <code>SKILL.md</code> / <code>DESIGN.md</code> w repozytorium</td></tr>
          <tr><td>Główna powierzchnia</td><td>Wielodostępne płótno w czasie rzeczywistym</td><td>Generowanie sterowane agentem + podgląd w piaskownicy</td></tr>
          <tr><td>Modele / AI</td><td>Własne funkcje AI Figmy</td><td>Dowolny endpoint zgodny z OpenAI + wykryte CLI agentów kodujących</td></tr>
          <tr><td>Wtyczki</td><td>Rynek, działa wewnątrz Figmy</td><td>Foldery skilli gotowe do forkowania, uruchamiane przez dowolnego agenta</td></tr>
          <tr><td>Systemy projektowe</td><td>Biblioteki Figmy (w narzędziu)</td><td>Przenośne pliki <code>DESIGN.md</code> (w tym jeden dla Figmy)</td></tr>
          <tr><td>Cennik</td><td>Subskrypcja za miejsce</td><td>Darmowe; płacisz bezpośrednio swojemu dostawcy modelu</td></tr>
          <tr><td>Przekazywanie pracy</td><td>Dev Mode, inspect, czerwone linie</td><td>Dowolny agent na <code>$PATH</code>, plus eksport do HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Możliwość self-hostingu</td><td>Nie</td><td>Tak (laptop lub własne wdrożenie)</td></tr>
          <tr><td>Ścieżka danych</td><td>Pliki → chmura Figmy</td><td>Prompty → wybrany przez ciebie dostawca; nic przez nas</td></tr>
        </tbody>
      </table>
      <p>Uczciwe podsumowanie: Figma ma najbardziej dopracowane doświadczenie płótna do współpracy na rynku, a dla zespołu projektantów wspólnie recenzujących precyzyjne ekrany to dopracowanie jest produktem. Open Design całkowicie wymienia płótno na bibliotekę — skille, systemy i agentów zaprojektowanych tak, by komponować się z narzędziem, które już masz na laptopie. Inny kształt, inny zakład.</p>

      <h2>Kto powinien wybrać co</h2>
      <table>
        <thead><tr><th>Jeśli jesteś…</th><th>Wybierz</th></tr></thead>
        <tbody>
          <tr><td>Zespołem projektowym wykonującym pracę na płótnie w czasie rzeczywistym, z wieloma projektantami i recenzją na żywo</td><td><strong>Figma.</strong> Nic w open source nie dorównuje wielodostępnemu płótnu.</td></tr>
          <tr><td>Projektantem wykonującym przez cały dzień pracę wektorową i komponentową z dokładnością do piksela</td><td><strong>Figma.</strong> Prymitywy płótna są dojrzałe, a twoja pamięć mięśniowa jest warta prawdziwych pieniędzy.</td></tr>
          <tr><td>Organizacją już ustandaryzowaną na Figmie, z Dev Mode w pętli inżynieryjnej</td><td><strong>Figma.</strong> Koszt integracji już zapłaciłeś; wykorzystaj go.</td></tr>
          <tr><td>Inżynierem projektowym, który już napędza Claude Code, Codex lub Cursor z terminala</td><td><strong>Open Design.</strong> Twój agent jest silnikiem projektowym; warstwa skilli dodaje gust i strukturę bez nowej aplikacji.</td></tr>
          <tr><td>Kimś, kto potrzebuje BYOK, zmiany modelu w trakcie projektu lub trybu wyłącznie lokalnego dla wrażliwych briefów</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Rzeczywistość jest bardziej szorstka niż marketing</a>, ale to jedyny kontrakt, który naprawdę się trzyma.</td></tr>
          <tr><td>Zespołem, który chce systemu projektowego przetrwającego rotację narzędzi</td><td><strong>Open Design.</strong> Pliki <code>DESIGN.md</code> przeżywają narzędzie, które je odczytuje.</td></tr>
          <tr><td>Współpracownikiem open source, który chce dostarczyć workflow projektowy możliwy do przyjęcia przez projekt</td><td><strong>Open Design.</strong> Wrzuć folder, zrestartuj daemon, wyślij PR.</td></tr>
        </tbody>
      </table>
      <p>Wymiar, który rozstrzyga to dla większości zespołów, nie jest jakością — rzemiosło Figmy jest prawdziwe. Chodzi o to, czy twoja praca to płótno do malowania, czy workflow do zautomatyzowania. Jeśli to drugie, wolisz to posiadać niż wynajmować.</p>

      <h2>Co robić dalej</h2>
      <p>Jeśli masz już powtarzalne zadanie w Figmie — wyeksportuj te ramki, zsynchronizuj te tokeny, odbuduj ten szablon prezentacji — najszybszym sposobem, by poczuć różnicę, jest <a href="/blog/port-figma-workflow-open-design-plugin/">przeniesienie jednego z nich do wtyczki</a>. Zacznij od jednego irytującego, powtarzalnego zadania, a nie od „zastąpienia Figmy".</p>
      <p>Albo po prostu uruchom trzykomendowy szybki start i wskaż mu model, za który już płacisz. Całość żyje w jednym repozytorium, a pierwsza prezentacja zajmuje około dziesięciu minut.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Wypróbuj ten otwartoźródłowy workflow</a>.</p>

      <h2>Dalsze lektury</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Jak przenieść workflow z Figmy do wtyczki Open Design</a> — konkretna ścieżka dla eksportu, synchronizacji tokenów lub zestawu brandingowego</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Otwartoźródłowa alternatywa dla Claude Design</a> — ta sama uczciwa ocena, tylko dla innego narzędzia</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę skilli, a nie produkt</a> — dłuższy manifest stojący za zakładem „warstwa, nie produkt"</li>
      </ul>
  id:
    title: "Alternatif open-source untuk Figma"
    summary: "Figma sangat bagus dan tidak akan ke mana-mana. Tapi format file-nya proprietary, kursi (seat) berbasis langganan, dan kanvasnya hidup di cloud milik orang lain. Inilah penilaian jujur tentang kapan Figma masih jadi jawabannya — dan kapan memiliki alur kerja yang agent-native dan local-first justru menang."
    bodyHtml: |
      <p>Figma sangat bagus. Kami telah mengerjakan pekerjaan nyata di dalamnya selama bertahun-tahun, dan ini bukan tulisan "Figma sudah mati" — jelas bukan. Fakta bahwa kami <a href="/blog/why-we-built-open-design-as-a-skill-layer/">membangun sebuah lapisan open-source</a> alih-alih kanvas lain bukanlah keluhan tentang kualitas kerajinan Figma. Ini adalah taruhan bahwa dekade berikutnya dari pekerjaan desain akan terlihat lebih sedikit seperti sebuah kursor di kanvas tak terbatas dan lebih seperti sebuah agent yang sudah Anda bayar, menggerakkan alur kerja yang benar-benar Anda miliki. Tulisan ini adalah penilaian jujur tentang Figma dari sebuah tim yang membangun di kategori yang sama: apa yang paling baik dilakukannya, di mana ia mengunci Anda, seperti apa sebenarnya jalur open-source itu, dan mana yang harus Anda pilih kuartal ini.</p>

      <h2>Apa sebenarnya Figma itu</h2>
      <p>Figma adalah alat desain kolaboratif default. Sebuah kanvas multiplayer real-time di dalam browser, dengan Dev Mode untuk handoff, FigJam untuk whiteboarding, sebuah marketplace plugin yang mendalam, dan sekumpulan fitur AI yang terus bertambah yang dipasang pada permukaan yang sama. Harganya per-seat per-bulan, berjenjang menurut peran dan menurut organisasi.</p>
      <p>Ada beberapa hal yang dilakukannya lebih baik daripada apa pun yang lain:</p>
      <ul>
        <li><strong>Kolaborasi kanvas real-time.</strong> Lima orang dalam satu file, kursor langsung terlihat, komentar muncul di tempat. Tidak ada apa pun di open source yang menandingi kematangan multiplayer-nya.</li>
        <li><strong>Pekerjaan vektor presisi piksel.</strong> Auto Layout, constraint, varian, komponen — primitif kanvasnya matang dan muscle memory-nya tertanam dalam.</li>
        <li><strong>Ekosistem plugin yang besar.</strong> Satu dekade plugin pihak ketiga, file komunitas, dan template yang bisa langsung Anda pakai.</li>
        <li><strong>Handoff yang sudah dikenal tim.</strong> Dev Mode, inspect, redline, dan sebuah alur kerja yang telah dilatih oleh tim engineering selama bertahun-tahun.</li>
      </ul>
      <p>Jika pekerjaan Anda adalah seorang desainer yang melukis layar-layar presisi untuk di-review manusia lain di kanvas bersama, Figma masih jawabannya, dan itu jawaban yang baik. Perbedaan yang layak diperhatikan hidup satu lapisan di bawahnya — pada siapa yang memiliki file, alur kerja, dan kurva biaya.</p>

      <h2>Di mana ia mengunci Anda</h2>
      <p>Figma membawa empat keping lock-in yang layak disebut sejak awal, karena halaman harganya tidak menyebutkannya.</p>
      <p><strong>File-nya proprietary.</strong> Desain Anda hidup di format Figma, di dalam server Figma. Anda bisa mengekspor PNG dan spesifikasi dev, tetapi sumber kebenaran — komponen, varian, design system yang hidup — hanya sepenuhnya terbaca di dalam Figma. Tidak ada versi teks biasa dari pekerjaan Anda yang bisa bertahan di luar alat itu.</p>
      <p><strong>Runtime-nya hosted.</strong> Kanvas adalah cloud. Untuk pekerjaan agensi atau karya kreatif pra-peluncuran di bawah NDA, "di mana file ini hidup" adalah sebuah percakapan pengadaan, bukan sebuah pengaturan. Local-only bukanlah sebuah mode.</p>
      <p><strong>Plugin-nya tidak portabel.</strong> Ekosistem plugin Figma nyata dan mendalam — tetapi setiap plugin berjalan di dalam runtime Figma, terhadap API Figma. Sebuah alur kerja yang Anda bangun di sana tidak bisa diangkat keluar dan dijalankan oleh sebuah agent di laptop Anda, atau dirangkai ke dalam sebuah pipeline yang tidak diawali dengan kanvas Figma.</p>
      <p><strong>Tagihannya per-seat, selamanya.</strong> Kursi langganan tidak masalah untuk tim desain yang stabil. Mereka menjadi canggung untuk organisasi yang berkembang cepat, dan mereka mustahil untuk ekor panjang kontributor, kontraktor, dan kolaborator sekali pakai yang sebenarnya bisa mengambil alih alur kerja yang sama.</p>
      <p>Tidak ada satu pun dari ini yang merupakan bug. Mereka adalah bentuk dari sebuah produk kanvas kolaboratif yang hosted, dan Figma adalah versi terbaik dari bentuk itu. Kami hanya tidak membangun untuk kanvas — kami membangun untuk agent.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Sebuah gembok hitam bersegi yang menyatu dengan bentuk dokumen, dikelilingi batas garis putus-putus dengan sebuah kunci yang digambar sebagai diagram teknik, di atas plat studi editorial bernuansa hangat" />
        <figcaption>Sumber kebenaran hidup di sebuah file proprietary, di dalam cloud milik orang lain.</figcaption>
      </figure>

      <h2>Pergeseran yang dipertaruhkan Open Design</h2>
      <p>Open Design bukan klon Figma. Tidak ada kanvas tak terbatas dan tidak ada kursor multiplayer. Ia adalah sebuah lapisan skill tipis yang mengubah coding agent yang sudah Anda gunakan menjadi sebuah mesin desain. Empat primitifnya adalah <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters, dan daemon</a> — dan bagian pentingnya adalah bahwa semuanya hanyalah file:</p>
      <ul>
        <li>Setiap skill adalah sebuah file <code>SKILL.md</code> yang bisa Anda baca, fork, dan kirim kembali sebagai PR.</li>
        <li>Setiap design system adalah sebuah file <code>DESIGN.md</code> yang portabel — termasuk yang kami ship untuk Figma itu sendiri. Anda bisa membukanya di editor mana pun, mem-diff-nya di git, dan ia bertahan lebih lama daripada alat apa pun yang membacanya berikutnya.</li>
        <li>Setiap agent adapter sekitar 80 baris TypeScript.</li>
      </ul>
      <p>Yang Anda dapatkan dari itu adalah kebalikan tepat dari empat lock-in di atas:</p>
      <ul>
        <li><strong>File-nya teks biasa.</strong> Skill dan system adalah Markdown di dalam sebuah repo. Design system Anda terbaca tanpa alatnya.</li>
        <li><strong>Runtime-nya lokal.</strong> Ia berjalan di laptop Anda melalui <code>pnpm tools-dev</code>, atau Anda men-deploy-nya sendiri. Prompt dikirim ke penyedia model yang Anda pilih — tidak ada yang melewati kami.</li>
        <li><strong>Alur kerjanya portabel.</strong> Sebuah skill adalah sebuah folder. Ia merangkai ke dalam agent mana pun di <code>$PATH</code> Anda, bukan runtime plugin milik satu vendor.</li>
        <li><strong>BYOK secara default.</strong> Tempel <code>base_url</code> dan key apa pun yang kompatibel dengan OpenAI; <a href="/blog/byok-design-workflow-claude-codex-qwen/">token Anda dikirim langsung ke penyedia</a>. Apache-2.0, tanpa pendaftaran, tanpa tagihan per-seat.</li>
      </ul>
      <p>Model mentalnya: Figma adalah sebuah kanvas yang Anda sewa. Open Design adalah sebuah alur kerja yang Anda miliki.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Sebuah kipasan lembaran kertas hitam polos dan kartu indeks yang menyebar keluar dari wadah terbuka, beberapa di antaranya melayang bebas, di atas plat studi editorial bernuansa hangat" />
        <figcaption>Skill dan system adalah file teks biasa di dalam sebuah repo — portabel, bisa di-fork, terbaca tanpa alatnya.</figcaption>
      </figure>

      <h2>Berdampingan</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Lisensi</td><td>Proprietary</td><td>Apache-2.0</td></tr>
          <tr><td>Runtime</td><td>Hosted (browser, cloud Figma)</td><td>Daemon lokal (<code>pnpm tools-dev</code>) + self-host opsional</td></tr>
          <tr><td>Format sumber</td><td>Proprietary <code>.fig</code></td><td>Teks biasa <code>SKILL.md</code> / <code>DESIGN.md</code> di dalam repo</td></tr>
          <tr><td>Permukaan utama</td><td>Kanvas multiplayer real-time</td><td>Generasi yang digerakkan agent + pratinjau sandbox</td></tr>
          <tr><td>Model / AI</td><td>Fitur AI milik Figma sendiri</td><td>Endpoint apa pun yang kompatibel dengan OpenAI + CLI coding-agent yang terdeteksi</td></tr>
          <tr><td>Plugin</td><td>Marketplace, berjalan di dalam Figma</td><td>Folder skill yang bisa di-fork, dijalankan oleh agent mana pun</td></tr>
          <tr><td>Design system</td><td>Library Figma (di dalam alat)</td><td>File <code>DESIGN.md</code> yang portabel (termasuk satu untuk Figma)</td></tr>
          <tr><td>Harga</td><td>Langganan per-seat</td><td>Gratis; Anda membayar penyedia model Anda secara langsung</td></tr>
          <tr><td>Handoff</td><td>Dev Mode, inspect, redline</td><td>Agent apa pun di <code>$PATH</code>, ditambah ekspor HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Bisa self-host</td><td>Tidak</td><td>Ya (laptop atau deploy Anda sendiri)</td></tr>
          <tr><td>Jalur data</td><td>File → cloud Figma</td><td>Prompt → penyedia pilihan Anda; tidak ada yang melewati kami</td></tr>
        </tbody>
      </table>
      <p>Ringkasan jujurnya: Figma memiliki pengalaman kanvas kolaboratif yang paling terpoles di pasar, dan untuk sebuah tim desainer yang me-review layar-layar presisi bersama, poles itu adalah produknya. Open Design menukar kanvas sepenuhnya dengan sebuah library — skills, systems, dan agents yang dirancang untuk merangkai dengan alat yang sudah ada di laptop Anda. Bentuk yang berbeda, taruhan yang berbeda.</p>

      <h2>Siapa yang harus memilih apa</h2>
      <table>
        <thead><tr><th>Jika Anda adalah…</th><th>Pilih</th></tr></thead>
        <tbody>
          <tr><td>Sebuah tim desain yang mengerjakan pekerjaan kanvas real-time, multi-desainer dengan review langsung</td><td><strong>Figma.</strong> Tidak ada apa pun di open source yang menandingi kanvas multiplayer.</td></tr>
          <tr><td>Seorang desainer yang mengerjakan pekerjaan vektor dan komponen presisi piksel sepanjang hari</td><td><strong>Figma.</strong> Primitif kanvasnya matang dan muscle memory Anda bernilai uang sungguhan.</td></tr>
          <tr><td>Sebuah organisasi yang sudah terstandardisasi di Figma dengan Dev Mode di dalam loop engineering</td><td><strong>Figma.</strong> Anda sudah membayar biaya integrasinya; manfaatkanlah.</td></tr>
          <tr><td>Seorang design engineer yang sudah menggerakkan Claude Code, Codex, atau Cursor dari terminal</td><td><strong>Open Design.</strong> Agent Anda adalah mesin desainnya; lapisan skill menambahkan selera dan struktur tanpa aplikasi baru.</td></tr>
          <tr><td>Siapa pun yang membutuhkan BYOK, pilihan model di tengah proyek, atau local-only untuk brief sensitif</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Kenyataannya lebih kasar daripada pemasarannya</a>, tetapi itu satu-satunya kontrak yang benar-benar berlaku.</td></tr>
          <tr><td>Sebuah tim yang menginginkan design system yang bertahan melampaui pergantian alat</td><td><strong>Open Design.</strong> File <code>DESIGN.md</code> bertahan lebih lama daripada alat yang membacanya.</td></tr>
          <tr><td>Seorang kontributor open-source yang ingin men-ship sebuah alur kerja desain yang bisa diadopsi proyek</td><td><strong>Open Design.</strong> Letakkan sebuah folder, restart daemon, kirim PR.</td></tr>
        </tbody>
      </table>
      <p>Dimensi yang menentukannya bagi sebagian besar tim bukanlah kualitas — kerajinan Figma itu nyata. Melainkan apakah pekerjaan Anda adalah sebuah kanvas untuk dilukis, atau sebuah alur kerja untuk diotomatisasi. Jika yang terakhir, Anda akan lebih memilih memilikinya daripada menyewanya.</p>

      <h2>Apa yang harus dilakukan selanjutnya</h2>
      <p>Jika Anda sudah punya pekerjaan Figma yang berulang — ekspor frame-frame ini, sinkronkan token-token itu, bangun ulang template deck itu — cara tercepat untuk merasakan perbedaannya adalah <a href="/blog/port-figma-workflow-open-design-plugin/">memindahkan salah satunya menjadi sebuah plugin</a>. Mulailah dengan satu tugas kecil yang menjengkelkan dan berulang, bukan "ganti Figma".</p>
      <p>Atau cukup jalankan quickstart tiga-perintah itu dan arahkan ke model yang sudah Anda bayar. Keseluruhannya hidup di dalam satu repo dan deck pertama memakan waktu sekitar sepuluh menit.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Coba alur kerja open-source ini</a>.</p>

      <h2>Bacaan terkait</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Cara memindahkan alur kerja Figma menjadi plugin Open Design</a> — jalur konkret untuk sebuah ekspor, sinkronisasi token, atau brand kit</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Alternatif open-source untuk Claude Design</a> — penilaian jujur yang sama, untuk satu alat berbeda</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebuah produk</a> — manifesto lebih panjang di balik taruhan "lapisan, bukan produk"</li>
      </ul>
  nl:
    title: "Het open-source alternatief voor Figma"
    summary: "Figma is uitstekend en gaat nergens heen. Maar het bestand is propriëtair, de seats zijn een abonnement en het canvas leeft in andermans cloud. Hier is de eerlijke kijk op wanneer Figma nog steeds het antwoord is — en wanneer het bezitten van een agent-native, local-first workflow wint."
    bodyHtml: |
      <p>Figma is uitstekend. We leveren er al jaren echt werk mee, en dit is geen "Figma is dood"-artikel — dat is het beslist niet. Het feit dat we <a href="/blog/why-we-built-open-design-as-a-skill-layer/">een open-source laag hebben gebouwd</a> in plaats van nóg een canvas is geen klacht over het vakmanschap van Figma. Het is een weddenschap dat het volgende decennium van ontwerpwerk er minder uitziet als een cursor op een oneindig canvas en meer als een agent waar je toch al voor betaalt, die een workflow aandrijft die je echt zelf bezit. Dit artikel is de eerlijke kijk op Figma vanuit een team dat in dezelfde categorie bouwt: wat het het beste doet, waar het je vastzet, hoe het open-source pad er werkelijk uitziet, en waar je dit kwartaal naar moet grijpen.</p>

      <h2>Wat Figma eigenlijk is</h2>
      <p>Figma is de standaard tool voor collaboratief ontwerp. Een realtime multiplayer-canvas in de browser, met Dev Mode voor handoff, FigJam voor whiteboarding, een uitgebreide plugin-marktplaats en een groeiende reeks AI-functies die op hetzelfde oppervlak zijn vastgebout. De prijs is per seat per maand, in lagen op basis van rol en organisatie.</p>
      <p>Een handvol dingen doet het beter dan wat dan ook:</p>
      <ul>
      <li><strong>Realtime canvas-samenwerking.</strong> Vijf mensen in één bestand, cursors live, opmerkingen inline. Niets in open source evenaart de multiplayer-afwerking.</li>
      <li><strong>Pixelnauwkeurig vectorwerk.</strong> Auto Layout, constraints, varianten, componenten — de canvas-primitieven zijn volwassen en het spiergeheugen zit diep.</li>
      <li><strong>Een enorm plugin-ecosysteem.</strong> Een decennium aan third-party plugins, community-bestanden en templates die je zo kunt inzetten.</li>
      <li><strong>Handoff die teams al kennen.</strong> Dev Mode, inspect, redlines, en een workflow waarop engineering al jaren is getraind.</li>
      </ul>
      <p>Als jouw werk een ontwerper is die precieze schermen schildert die andere mensen op een gedeeld canvas reviewen, is Figma nog steeds het antwoord, en een goed antwoord. De verschillen die er werkelijk toe doen, leven een laag dieper — in wie het bestand, de workflow en de kostencurve bezit.</p>

      <h2>Waar het je vastzet</h2>
      <p>Figma draagt vier stukken lock-in die het waard zijn om vooraf te benoemen, want de prijspagina's doen dat niet.</p>
      <p><strong>Het bestand is propriëtair.</strong> Jouw ontwerp leeft in Figma's formaat, op Figma's servers. Je kunt PNG's en dev-specs exporteren, maar de bron van waarheid — componenten, varianten, het levende ontwerpsysteem — is alleen volledig leesbaar binnen Figma. Er is geen plain-text versie van je werk die de tool overleeft.</p>
      <p><strong>De runtime wordt gehost.</strong> Het canvas ís de cloud. Voor agencywerk of pre-launch creatief werk onder NDA is "waar leeft dit bestand" een inkoopgesprek, geen instelling. Local-only is geen modus.</p>
      <p><strong>De plugins zijn niet overdraagbaar.</strong> Figma's plugin-ecosysteem is echt en diep — maar elke plugin draait binnen Figma's runtime, tegen Figma's API. Een workflow die je daar bouwt, kan er niet uitgetild en gedraaid worden door een agent op je laptop, of samengesteld worden tot een pipeline die niet begint met het Figma-canvas.</p>
      <p><strong>De rekening is per seat, voor altijd.</strong> Abonnement-seats zijn prima voor een stabiel ontwerpteam. Ze worden onhandig voor een snelgroeiende organisatie, en ze zijn een no-go voor de lange staart van bijdragers, freelancers en eenmalige medewerkers die anders dezelfde workflow zouden oppakken.</p>
      <p>Geen van deze zijn bugs. Het zijn de vorm van een gehost, collaboratief-canvasproduct, en Figma is de beste versie van die vorm. Wij bouwen alleen niet voor het canvas — we bouwen voor de agent.</p>

      <figure>
      <img src="/blog/plate-17-locked-format.png" alt="Een zwart gefacetteerd hangslot versmolten met een documentvorm, omringd door een gestippelde grens met een sleutel getekend als een technische tekening, op een warm redactioneel studievel" />
      <figcaption>De bron van waarheid leeft in een propriëtair bestand, in andermans cloud.</figcaption>
      </figure>

      <h2>De verschuiving waar Open Design op inzet</h2>
      <p>Open Design is geen Figma-kloon. Er is geen oneindig canvas en geen multiplayer-cursors. Het is een dunne skill-laag die de coding-agent die je al gebruikt verandert in een ontwerpengine. De vier primitieven zijn <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters en de daemon</a> — en het belangrijke is dat ze allemaal gewoon bestanden zijn:</p>
      <ul>
      <li>Elke skill is een <code>SKILL.md</code>-bestand dat je kunt lezen, forken en als PR terugsturen.</li>
      <li>Elk ontwerpsysteem is een overdraagbaar <code>DESIGN.md</code>-bestand — inclusief degene die we voor Figma zelf leveren. Je kunt het openen in elke editor, het diffen in git, en het overleeft welke tool het hierna ook leest.</li>
      <li>Elke agent-adapter is ~80 regels TypeScript.</li>
      </ul>
      <p>Wat je daarmee koopt is het tegenovergestelde van de vier lock-ins hierboven:</p>
      <ul>
      <li><strong>Het bestand is plain text.</strong> Skills en systems zijn Markdown in een repo. Je ontwerpsysteem is leesbaar zonder de tool.</li>
      <li><strong>De runtime is lokaal.</strong> Het draait op je laptop via <code>pnpm tools-dev</code>, of je deployt het zelf. Prompts gaan naar de modelprovider die jij koos — niets gaat via ons.</li>
      <li><strong>De workflow is overdraagbaar.</strong> Een skill is een map. Het stelt zich samen met elke agent op je <code>$PATH</code>, niet met de plugin-runtime van één leverancier.</li>
      <li><strong>BYOK standaard.</strong> Plak elke OpenAI-compatibele <code>base_url</code> en key; <a href="/blog/byok-design-workflow-claude-codex-qwen/">jouw tokens gaan rechtstreeks naar de provider</a>. Apache-2.0, geen registratie, geen rekening per seat.</li>
      </ul>
      <p>Het mentale model: Figma is een canvas dat je huurt. Open Design is een workflow die je bezit.</p>

      <figure>
      <img src="/blog/plate-18-portable-files.png" alt="Een waaier van blanco zwarte vellen papier en indexkaarten die uit een open houder spreiden, een paar zwevend los, op een warm redactioneel studievel" />
      <figcaption>Skills en systems zijn plain-text bestanden in een repo — overdraagbaar, forkbaar, leesbaar zonder de tool.</figcaption>
      </figure>

      <h2>Naast elkaar</h2>
      <table>
      <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
      <tbody>
      <tr><td>Licentie</td><td>Propriëtair</td><td>Apache-2.0</td></tr>
      <tr><td>Runtime</td><td>Gehost (browser, Figma-cloud)</td><td>Lokale daemon (<code>pnpm tools-dev</code>) + optionele self-host</td></tr>
      <tr><td>Bronformaat</td><td>Propriëtair <code>.fig</code></td><td>Plain-text <code>SKILL.md</code> / <code>DESIGN.md</code> in een repo</td></tr>
      <tr><td>Primair oppervlak</td><td>Realtime multiplayer-canvas</td><td>Agent-gedreven generatie + sandboxed preview</td></tr>
      <tr><td>Modellen / AI</td><td>Figma's eigen AI-functies</td><td>Elk OpenAI-compatibel endpoint + gedetecteerde coding-agent-CLI's</td></tr>
      <tr><td>Plugins</td><td>Marktplaats, draait binnen Figma</td><td>Forkbare skill-mappen, gedraaid door elke agent</td></tr>
      <tr><td>Ontwerpsystemen</td><td>Figma-bibliotheken (in-tool)</td><td>Overdraagbare <code>DESIGN.md</code>-bestanden (incl. een Figma-versie)</td></tr>
      <tr><td>Prijs</td><td>Abonnement per seat</td><td>Gratis; je betaalt je modelprovider rechtstreeks</td></tr>
      <tr><td>Handoff</td><td>Dev Mode, inspect, redlines</td><td>Elke agent op <code>$PATH</code>, plus HTML / PDF / PPTX / ZIP-exports</td></tr>
      <tr><td>Self-hostbaar</td><td>Nee</td><td>Ja (laptop of je eigen deploy)</td></tr>
      <tr><td>Datapad</td><td>Bestanden → Figma-cloud</td><td>Prompts → jouw gekozen provider; niets via ons</td></tr>
      </tbody>
      </table>
      <p>De eerlijke samenvatting: Figma heeft de meest gepolijste collaboratief-canvaservaring op de markt, en voor een team ontwerpers dat samen precieze schermen reviewt, ís die afwerking het product. Open Design ruilt het canvas volledig in voor een bibliotheek — skills, systems en agents ontworpen om samen te stellen met de tool die al op je laptop staat. Andere vorm, andere weddenschap.</p>

      <h2>Wie moet wat kiezen</h2>
      <table>
      <thead><tr><th>Als je bent…</th><th>Kies</th></tr></thead>
      <tbody>
      <tr><td>Een ontwerpteam dat realtime, multi-designer canvaswerk doet met live review</td><td><strong>Figma.</strong> Niets in open source evenaart het multiplayer-canvas.</td></tr>
      <tr><td>Een ontwerper die de hele dag pixelnauwkeurig vector- en componentwerk doet</td><td><strong>Figma.</strong> De canvas-primitieven zijn volwassen en je spiergeheugen is echt geld waard.</td></tr>
      <tr><td>Een organisatie die al op Figma is gestandaardiseerd met Dev Mode in de engineering-loop</td><td><strong>Figma.</strong> Je hebt de integratiekosten al betaald; benut ze.</td></tr>
      <tr><td>Een design engineer die Claude Code, Codex of Cursor al vanuit de terminal aandrijft</td><td><strong>Open Design.</strong> Je agent ís de ontwerpengine; de skill-laag voegt smaak en structuur toe zonder een nieuwe app.</td></tr>
      <tr><td>Iedereen die BYOK, modelkeuze midden in een project, of local-only voor gevoelige briefings nodig heeft</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">De realiteit is ruwer dan de marketing</a>, maar het is het enige contract dat echt standhoudt.</td></tr>
      <tr><td>Een team dat een ontwerpsysteem wil dat tool-verloop overleeft</td><td><strong>Open Design.</strong> <code>DESIGN.md</code>-bestanden overleven de tool die ze leest.</td></tr>
      <tr><td>Een open-source bijdrager die een ontwerpworkflow wil leveren die het project kan overnemen</td><td><strong>Open Design.</strong> Plaats een map, herstart de daemon, stuur de PR.</td></tr>
      </tbody>
      </table>
      <p>De dimensie die het voor de meeste teams beslist is niet kwaliteit — Figma's vakmanschap is echt. Het is of jouw werk een canvas is om op te schilderen, of een workflow om te automatiseren. Als het het laatste is, bezit je het liever dan dat je het huurt.</p>

      <h2>Wat je vervolgens doet</h2>
      <p>Als je al een herhaalbare Figma-klus hebt — exporteer deze frames, synchroniseer die tokens, herbouw dat deck-template — is de snelste manier om het verschil te voelen om er <a href="/blog/port-figma-workflow-open-design-plugin/">één van over te zetten naar een plugin</a>. Begin met één vervelende, herhaalbare taak, niet met "vervang Figma."</p>
      <p>Of draai gewoon de quickstart van drie commando's en richt hem op het model waar je toch al voor betaalt. Het hele geheel leeft in één repo en het eerste deck duurt ongeveer tien minuten.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Probeer de open-source workflow</a>.</p>

      <h2>Verder lezen</h2>
      <ul>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Hoe je een Figma-workflow overzet naar een Open Design-plugin</a> — het concrete pad voor een export, token-sync of brand kit</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Het open-source alternatief voor Claude Design</a> — dezelfde eerlijke kijk, één tool verderop</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als skill-laag bouwden, niet als product</a> — het langere manifest achter de weddenschap "laag, geen product"</li>
      </ul>
  ar:
    title: "البديل مفتوح المصدر لـ Figma"
    summary: "Figma رائعة ولن تختفي في أي وقت قريب. لكن الملف مملوك بشكل احتكاري، والمقاعد عبارة عن اشتراك، واللوحة تعيش في سحابة شخص آخر. إليك القراءة الصادقة عن متى تظل Figma هي الإجابة — ومتى يفوز امتلاك سير عمل أصيل للوكلاء ومحلي أولاً."
    bodyHtml: |
      <p>Figma رائعة. لقد سلّمنا بها أعمالاً حقيقية لسنوات، وهذا ليس منشورًا عن «موت Figma» — إنه ليس كذلك على الإطلاق. كوننا <a href="/blog/why-we-built-open-design-as-a-skill-layer/">بنينا طبقة مفتوحة المصدر</a> بدلاً من لوحة أخرى ليس شكوى من إتقان Figma. إنه رهان على أن العقد القادم من عمل التصميم سيبدو أقل شبهًا بمؤشر فوق لوحة لا نهائية، وأكثر شبهًا بوكيل تدفع مقابله بالفعل، يقود سير عمل تملكه أنت حقًا. هذا المنشور هو القراءة الصادقة عن Figma من فريق يبني في الفئة نفسها: ما الذي تجيده أكثر من غيرها، وأين تحبسك، وكيف يبدو المسار مفتوح المصدر فعليًا، وأيهما ينبغي أن تختار هذا الربع.</p>

      <h2>ما هي Figma فعليًا</h2>
      <p>Figma هي أداة التصميم التعاونية الافتراضية. لوحة متعددة المستخدمين في الوقت الفعلي داخل المتصفح، مع Dev Mode للتسليم، وFigJam للسبورة البيضاء، وسوق إضافات عميق، ومجموعة متنامية من ميزات الذكاء الاصطناعي مثبّتة على السطح نفسه. التسعير لكل مقعد شهريًا، مقسّم إلى فئات حسب الدور والمؤسسة.</p>
      <p>تجيد حفنة من الأمور أفضل من أي شيء آخر:</p>
      <ul>
        <li><strong>التعاون على اللوحة في الوقت الفعلي.</strong> خمسة أشخاص في ملف واحد، مؤشرات حيّة، تعليقات في مكانها. لا شيء في عالم المصادر المفتوحة يضاهي صقل تعدد المستخدمين هذا.</li>
        <li><strong>عمل متجهي دقيق على مستوى البكسل.</strong> Auto Layout والقيود والمتغيرات والمكوّنات — أوّليات اللوحة ناضجة والذاكرة العضلية متجذرة بعمق.</li>
        <li><strong>منظومة إضافات ضخمة.</strong> عقد من إضافات الطرف الثالث وملفات المجتمع والقوالب الجاهزة للاستخدام مباشرة.</li>
        <li><strong>تسليم تعرفه الفرق بالفعل.</strong> Dev Mode، والمعاينة، والخطوط الحمراء، وسير عمل تدرّب عليه المهندسون لسنوات.</li>
      </ul>
      <p>إذا كان عملك مصممًا يرسم شاشات دقيقة كي يراجعها بشر آخرون على لوحة مشتركة، فإن Figma لا تزال هي الإجابة، وهي إجابة جيدة. الفروقات الجديرة بالاهتمام تعيش طبقةً أدنى — في من يملك الملف وسير العمل ومنحنى التكلفة.</p>

      <h2>أين تحبسك</h2>
      <p>تحمل Figma أربعة أشكال من الحبس تستحق التسمية بصراحة منذ البداية، لأن صفحات التسعير لا تذكرها.</p>
      <p><strong>الملف مملوك احتكاريًا.</strong> يعيش تصميمك في صيغة Figma، داخل خوادم Figma. يمكنك تصدير ملفات PNG ومواصفات المطورين، لكن مصدر الحقيقة — المكوّنات والمتغيرات ونظام التصميم الحيّ — لا يكون مقروءًا بالكامل إلا داخل Figma. لا توجد نسخة نصية صرفة من عملك تنجو خارج الأداة.</p>
      <p><strong>زمن التشغيل مُستضاف.</strong> اللوحة هي السحابة. بالنسبة لعمل الوكالات أو الإبداع السابق للإطلاق تحت اتفاقية عدم إفشاء، يصبح «أين يعيش هذا الملف» محادثة شراء في كل مرة، لا مجرد إعداد. المحلي فقط ليس وضعًا متاحًا.</p>
      <p><strong>الإضافات غير قابلة للنقل.</strong> منظومة إضافات Figma حقيقية وعميقة — لكن كل إضافة تعمل داخل زمن تشغيل Figma، مقابل واجهة برمجة Figma. سير عمل تبنيه هناك لا يمكن انتزاعه وتشغيله بواسطة وكيل على حاسوبك المحمول، أو تركيبه في خط أنابيب لا يبدأ بلوحة Figma.</p>
      <p><strong>الفاتورة لكل مقعد، إلى الأبد.</strong> مقاعد الاشتراك جيدة لفريق تصميم مستقر. تصبح محرجة لمؤسسة سريعة النمو، وتكون مستحيلة بالنسبة للذيل الطويل من المساهمين والمتعاقدين والمتعاونين لمرة واحدة الذين لولا ذلك لتولوا سير العمل نفسه.</p>
      <p>لا شيء من هذا أخطاء برمجية. إنها شكل منتج لوحة تعاونية مُستضافة، وFigma هي أفضل نسخة من ذلك الشكل. نحن فقط لا نبني للوحة — نحن نبني للوكيل.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="قفل أسود متعدد الأوجه مندمج مع شكل مستند، محاط بحدّ متقطع مع مفتاح مرسوم على هيئة مخطط هندسي، على لوح دراسة تحريري بألوان دافئة" />
        <figcaption>مصدر الحقيقة يعيش في ملف مملوك احتكاريًا، داخل سحابة شخص آخر.</figcaption>
      </figure>

      <h2>التحوّل الذي تراهن عليه Open Design</h2>
      <p>Open Design ليست نسخة مستنسخة من Figma. لا توجد لوحة لا نهائية ولا مؤشرات متعددة المستخدمين. إنها طبقة مهارات رقيقة تحوّل وكيل البرمجة الذي تستخدمه بالفعل إلى محرك تصميم. الأوّليات الأربع هي <a href="/blog/31-skills-72-systems-how-the-library-works/">skills وsystems وadapters وthe daemon</a> — والجزء المهم أنها جميعًا مجرد ملفات:</p>
      <ul>
        <li>كل skill هو ملف <code>SKILL.md</code> يمكنك قراءته وعمل fork له وإعادته كـ PR.</li>
        <li>كل نظام تصميم هو ملف <code>DESIGN.md</code> قابل للنقل — بما في ذلك الذي نشحنه لأجل Figma نفسها. يمكنك فتحه في أي محرر وعمل diff له في git، وهو يعمّر أطول من أي أداة تقرؤه لاحقًا.</li>
        <li>كل agent adapter حوالي 80 سطرًا من TypeScript.</li>
      </ul>
      <p>ما يشتريه لك ذلك هو عكس أشكال الحبس الأربعة أعلاه تمامًا:</p>
      <ul>
        <li><strong>الملف نص صرف.</strong> الـ skills والـ systems هي Markdown داخل repo. نظام تصميمك مقروء دون الأداة.</li>
        <li><strong>زمن التشغيل محلي.</strong> يعمل على حاسوبك المحمول عبر <code>pnpm tools-dev</code>، أو تنشره أنت بنفسك. تذهب المطالبات إلى مزوّد النموذج الذي اخترته — لا شيء يمرّ عبرنا.</li>
        <li><strong>سير العمل قابل للنقل.</strong> الـ skill هو مجلد. يتركّب في أي وكيل على <code>$PATH</code> لديك، لا في زمن تشغيل إضافات مورّد واحد.</li>
        <li><strong>BYOK افتراضيًا.</strong> الصق أي <code>base_url</code> ومفتاح متوافقين مع OpenAI؛ <a href="/blog/byok-design-workflow-claude-codex-qwen/">تذهب رموزك مباشرة إلى المزوّد</a>. Apache-2.0، دون تسجيل، دون فاتورة لكل مقعد.</li>
      </ul>
      <p>النموذج الذهني: Figma لوحة تستأجرها. Open Design سير عمل تملكه.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="مروحة من أوراق سوداء صرفة وبطاقات فهرسة تنتشر خارج حاوية مفتوحة، وبعضها ينجرف حرًا، على لوح دراسة تحريري بألوان دافئة" />
        <figcaption>الـ skills والـ systems ملفات نصية صرفة داخل repo — قابلة للنقل، قابلة للـ fork، مقروءة دون الأداة.</figcaption>
      </figure>

      <h2>جنبًا إلى جنب</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>الترخيص</td><td>مملوك احتكاريًا</td><td>Apache-2.0</td></tr>
          <tr><td>زمن التشغيل</td><td>مُستضاف (المتصفح، سحابة Figma)</td><td>daemon محلي (<code>pnpm tools-dev</code>) + استضافة ذاتية اختيارية</td></tr>
          <tr><td>صيغة الملف المصدري</td><td>صيغة <code>.fig</code> مملوكة احتكاريًا</td><td>نص صرف <code>SKILL.md</code> / <code>DESIGN.md</code> داخل repo</td></tr>
          <tr><td>السطح الأساسي</td><td>لوحة متعددة المستخدمين في الوقت الفعلي</td><td>توليد مدفوع بالوكلاء + معاينة في صندوق رمل</td></tr>
          <tr><td>النماذج / الذكاء الاصطناعي</td><td>ميزات الذكاء الاصطناعي الخاصة بـ Figma</td><td>أي نقطة نهاية متوافقة مع OpenAI + واجهات CLI لوكلاء البرمجة المكتشفة</td></tr>
          <tr><td>الإضافات</td><td>سوق، يعمل داخل Figma</td><td>مجلدات skill قابلة للـ fork، يشغّلها أي وكيل</td></tr>
          <tr><td>أنظمة التصميم</td><td>مكتبات Figma (داخل الأداة)</td><td>ملفات <code>DESIGN.md</code> قابلة للنقل (بما فيها واحدة لـ Figma)</td></tr>
          <tr><td>التسعير</td><td>اشتراك لكل مقعد</td><td>مجاني؛ تدفع لمزوّد نموذجك مباشرة</td></tr>
          <tr><td>التسليم</td><td>Dev Mode، المعاينة، الخطوط الحمراء</td><td>أي وكيل على <code>$PATH</code>، إضافةً إلى تصدير HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>قابل للاستضافة الذاتية</td><td>لا</td><td>نعم (حاسوب محمول أو نشرك الخاص)</td></tr>
          <tr><td>مسار البيانات</td><td>الملفات ← سحابة Figma</td><td>المطالبات ← المزوّد الذي اخترته؛ لا شيء يمرّ عبرنا</td></tr>
        </tbody>
      </table>
      <p>الخلاصة الصادقة: تمتلك Figma أكثر تجارب اللوحة التعاونية صقلاً في السوق، وبالنسبة لفريق من المصممين يراجعون شاشات دقيقة معًا، فإن هذا الصقل هو المنتج بعينه. أما Open Design فتقايض اللوحة بالكامل بمكتبة — skills وsystems وagents مصممة لتتركّب مع الأداة الموجودة أصلاً على حاسوبك المحمول. شكل مختلف، رهان مختلف.</p>

      <h2>من ينبغي أن يختار ماذا</h2>
      <table>
        <thead><tr><th>إذا كنت…</th><th>اختر</th></tr></thead>
        <tbody>
          <tr><td>فريق تصميم يقوم بعمل لوحة متعدد المصممين في الوقت الفعلي مع مراجعة حيّة</td><td><strong>Figma.</strong> لا شيء في عالم المصادر المفتوحة يضاهي اللوحة متعددة المستخدمين.</td></tr>
          <tr><td>مصمم يقوم بعمل متجهي دقيق على مستوى البكسل وعمل مكوّنات طوال اليوم</td><td><strong>Figma.</strong> أوّليات اللوحة ناضجة وذاكرتك العضلية تساوي مالاً حقيقيًا.</td></tr>
          <tr><td>مؤسسة موحّدة بالفعل على Figma مع Dev Mode داخل حلقة الهندسة</td><td><strong>Figma.</strong> لقد دفعت كلفة التكامل؛ فأنفقها.</td></tr>
          <tr><td>مهندس تصميم يقود بالفعل Claude Code أو Codex أو Cursor من الطرفية</td><td><strong>Open Design.</strong> وكيلك هو محرك التصميم؛ طبقة المهارات تضيف الذوق والبنية دون تطبيق جديد.</td></tr>
          <tr><td>أي شخص يحتاج إلى BYOK، أو تبديل النموذج في منتصف المشروع، أو المعالجة المحلية فقط للموجزات الحساسة</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">الواقع أخشن من التسويق</a>، لكنه العقد الوحيد الذي يصمد فعلاً.</td></tr>
          <tr><td>فريق يريد نظام تصميم يصمد عبر تبدّل الأدوات</td><td><strong>Open Design.</strong> ملفات <code>DESIGN.md</code> تعمّر أطول من الأداة التي تقرؤها.</td></tr>
          <tr><td>مساهم في المصادر المفتوحة يريد شحن سير عمل تصميم يمكن للمشروع تبنّيه</td><td><strong>Open Design.</strong> أسقط مجلدًا، أعد تشغيل الـ daemon، وأرسل الـ PR.</td></tr>
        </tbody>
      </table>
      <p>البُعد الذي يحسم الأمر لمعظم الفرق ليس الجودة — إتقان Figma حقيقي. بل هو: هل عملك لوحة لترسم عليها، أم سير عمل لتُؤتمته. إن كان الأخير، فستفضّل أن تملكه على أن تستأجره.</p>

      <h2>ما الذي تفعله بعد ذلك</h2>
      <p>إن كان لديك بالفعل مهمة Figma قابلة للتكرار — صدّر هذه الإطارات، زامن تلك الرموز، أعد بناء قالب العرض ذاك — فإن أسرع طريقة لتشعر بالفرق هي أن <a href="/blog/port-figma-workflow-open-design-plugin/">تنقل واحدة منها إلى إضافة</a>. ابدأ بمهمة واحدة مزعجة وقابلة للتكرار، لا بـ«استبدال Figma».</p>
      <p>أو فقط شغّل البدء السريع المكوّن من ثلاثة أوامر ووجّهه نحو النموذج الذي تدفع مقابله بالفعل. الشيء بأكمله يعيش في repo واحد، وأول عرض يستغرق نحو عشر دقائق.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">جرّب سير العمل مفتوح المصدر</a>.</p>

      <h2>قراءات إضافية</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">كيفية نقل سير عمل Figma إلى إضافة Open Design</a> — المسار الملموس لتصدير، أو مزامنة رموز، أو طقم علامة تجارية</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">البديل مفتوح المصدر لـ Claude Design</a> — القراءة الصادقة نفسها، بأداة مختلفة</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات، لا كمنتج</a> — البيان الأطول وراء رهان «طبقة، لا منتج»</li>
      </ul>
  tr:
    title: "Figma'nın açık kaynaklı alternatifi"
    summary: "Figma mükemmel ve hiçbir yere gitmiyor. Ama dosya tescilli, koltuklar abonelik, ve tuval başkasının bulutunda yaşıyor. İşte dürüst değerlendirme: Figma ne zaman hâlâ doğru cevap — ve ne zaman agent-native, yerel öncelikli bir iş akışına sahip olmak kazanır."
    bodyHtml: |
      <p>Figma mükemmel. Yıllardır onunla gerçek işler teslim ettik ve bu bir "Figma öldü" yazısı değil — kesinlikle değil. Başka bir tuval yerine <a href="/blog/why-we-built-open-design-as-a-skill-layer/">açık kaynaklı bir katman inşa etmemiz</a> Figma'nın işçiliğine yönelik bir şikâyet değil. Bu, tasarım işinin önümüzdeki on yılının, sonsuz bir tuvalin üzerindeki bir imleçten çok, halihazırda parasını ödediğiniz bir agent'ın gerçekten sahip olduğunuz bir iş akışını sürmesine benzeyeceğine dair bir bahis. Bu yazı, aynı kategoride inşa eden bir ekibin Figma hakkındaki dürüst değerlendirmesi: en iyi ne yaptığı, sizi nerede kilitlediği, açık kaynaklı yolun gerçekte nasıl göründüğü ve bu çeyrekte hangisine uzanmanız gerektiği.</p>

      <h2>Figma aslında nedir</h2>
      <p>Figma varsayılan işbirlikçi tasarım aracıdır. Tarayıcıda gerçek zamanlı çok kişilik bir tuval, teslimat için Dev Mode, beyaz tahta için FigJam, derin bir eklenti pazarı ve aynı yüzeye eklenmiş büyüyen bir AI özellikleri seti. Fiyatlandırma koltuk başına aylık, role ve organizasyona göre kademeli.</p>
      <p>Birkaç şeyi her şeyden daha iyi yapar:</p>
      <ul>
        <li><strong>Gerçek zamanlı tuval işbirliği.</strong> Tek dosyada beş kişi, imleçler canlı, yorumlar yerinde. Açık kaynakta hiçbir şey bu çok kişilik cilaya yaklaşmıyor.</li>
        <li><strong>Piksel hassasiyetinde vektör çalışması.</strong> Auto Layout, kısıtlar, varyantlar, bileşenler — tuval ilkelleri olgun ve kas hafızası derinlere işlemiş.</li>
        <li><strong>Devasa bir eklenti ekosistemi.</strong> Hemen kullanabileceğiniz on yıllık üçüncü taraf eklentiler, topluluk dosyaları ve şablonlar.</li>
        <li><strong>Ekiplerin zaten bildiği teslimat.</strong> Dev Mode, inceleme, kırmızı çizgiler ve mühendisliğin yıllardır eğitildiği bir iş akışı.</li>
      </ul>
      <p>İşiniz, paylaşılan bir tuvalde başkalarının inceleyeceği hassas ekranlar çizen bir tasarımcıysa, Figma hâlâ doğru cevap ve iyi bir cevap. Önemsenmeye değer farklar bir katman aşağıda yaşıyor — dosyaya, iş akışına ve maliyet eğrisine kimin sahip olduğunda.</p>

      <h2>Sizi nerede kilitliyor</h2>
      <p>Figma, baştan adlandırmaya değer dört parça kilitlenme taşıyor, çünkü fiyatlandırma sayfaları bunları söylemez.</p>
      <p><strong>Dosya tescilli.</strong> Tasarımınız Figma'nın formatında, Figma'nın sunucularında yaşar. PNG'leri ve geliştirici özelliklerini dışa aktarabilirsiniz, ama gerçeğin kaynağı — bileşenler, varyantlar, canlı tasarım sistemi — yalnızca Figma içinde tam olarak okunabilir. Çalışmanızın aracı aşan düz metin bir sürümü yok.</p>
      <p><strong>Çalışma zamanı barındırılan.</strong> Tuval, buluttur. Ajans işi veya NDA altındaki lansman öncesi yaratıcı çalışma için "bu dosya nerede yaşıyor" bir tedarik konuşmasıdır, bir ayar değil. Yalnızca yerel bir mod değil.</p>
      <p><strong>Eklentiler taşınabilir değil.</strong> Figma'nın eklenti ekosistemi gerçek ve derin — ama her eklenti Figma'nın çalışma zamanında, Figma'nın API'sine karşı çalışır. Orada inşa ettiğiniz bir iş akışı dışarı çıkarılıp dizüstü bilgisayarınızdaki bir agent tarafından çalıştırılamaz veya Figma tuvaliyle başlamayan bir boru hattına bestelenemez.</p>
      <p><strong>Fatura sonsuza dek koltuk başına.</strong> Abonelik koltukları istikrarlı bir tasarım ekibi için sorun değil. Hızlı büyüyen bir organizasyon için tuhaflaşırlar ve aynı iş akışını başka türlü devralacak katkıda bulunanların, dış kaynak çalışanlarının ve tek seferlik işbirlikçilerin uzun kuyruğu için baştan imkânsızdır.</p>
      <p>Bunların hiçbiri hata değil. Bunlar barındırılan, işbirlikçi tuval bir ürünün biçimidir ve Figma o biçimin en iyi versiyonudur. Biz sadece tuval için inşa etmiyoruz — agent için inşa ediyoruz.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Bir belge biçimiyle birleşmiş siyah çok yüzeyli bir asma kilit, kesik çizgili bir sınırla çevrelenmiş, mühendislik diyagramı olarak çizilmiş bir anahtarla birlikte, sıcak editöryel bir çalışma plakası üzerinde" />
        <figcaption>Gerçeğin kaynağı tescilli bir dosyada, başkasının bulutunda yaşıyor.</figcaption>
      </figure>

      <h2>Open Design'ın bahis koyduğu kayma</h2>
      <p>Open Design bir Figma klonu değil. Sonsuz tuval yok, çok kişilik imleçler yok. Halihazırda kullandığınız kodlama agent'ını bir tasarım motoruna dönüştüren ince bir skill katmanı. Dört ilkel <a href="/blog/31-skills-72-systems-how-the-library-works/">skill'ler, system'ler, adapter'lar ve daemon</a> — ve önemli olan, hepsinin yalnızca dosya olması:</p>
      <ul>
        <li>Her skill, okuyabileceğiniz, fork'layabileceğiniz ve PR olarak geri gönderebileceğiniz bir <code>SKILL.md</code> dosyasıdır.</li>
        <li>Her tasarım sistemi taşınabilir bir <code>DESIGN.md</code> dosyasıdır — Figma'nın kendisi için gönderdiğimiz dahil. Onu herhangi bir düzenleyicide açabilir, git'te diff'leyebilirsiniz ve onu bir sonraki okuyan araçtan daha uzun yaşar.</li>
        <li>Her agent adapter'ı yaklaşık 80 satır TypeScript'tir.</li>
      </ul>
      <p>Bunun size kazandırdığı, yukarıdaki dört kilitlenmenin tam tersidir:</p>
      <ul>
        <li><strong>Dosya düz metin.</strong> Skill'ler ve system'ler bir repo'daki Markdown'dır. Tasarım sisteminiz araç olmadan okunabilir.</li>
        <li><strong>Çalışma zamanı yerel.</strong> <code>pnpm tools-dev</code> aracılığıyla dizüstü bilgisayarınızda çalışır ya da kendiniz dağıtırsınız. İstemler seçtiğiniz model sağlayıcısına gider — hiçbir şey bizim üzerimizden geçmez.</li>
        <li><strong>İş akışı taşınabilir.</strong> Bir skill bir klasördür. Tek bir satıcının eklenti çalışma zamanına değil, <code>$PATH</code>'inizdeki herhangi bir agent'a bestelenir.</li>
        <li><strong>Varsayılan olarak BYOK.</strong> OpenAI uyumlu herhangi bir <code>base_url</code> ve anahtarı yapıştırın; <a href="/blog/byok-design-workflow-claude-codex-qwen/">token'larınız doğrudan sağlayıcıya gider</a>. Apache-2.0, kayıt yok, koltuk başına fatura yok.</li>
      </ul>
      <p>Zihinsel model şöyle: Figma kiraladığınız bir tuvaldir. Open Design sahip olduğunuz bir iş akışıdır.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Açık bir kaptan yelpaze gibi açılan düz siyah kâğıt sayfaları ve dizin kartları, birkaçı serbestçe süzülüyor, sıcak editöryel bir çalışma plakası üzerinde" />
        <figcaption>Skill'ler ve system'ler bir repo'daki düz metin dosyalarıdır — taşınabilir, fork'lanabilir, araç olmadan okunabilir.</figcaption>
      </figure>

      <h2>Yan yana</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Lisans</td><td>Tescilli</td><td>Apache-2.0</td></tr>
          <tr><td>Çalışma zamanı</td><td>Barındırılan (tarayıcı, Figma bulutu)</td><td>Yerel daemon (<code>pnpm tools-dev</code>) + isteğe bağlı kendi kendine barındırma</td></tr>
          <tr><td>Kaynak formatı</td><td>Tescilli <code>.fig</code></td><td>Bir repo'da düz metin <code>SKILL.md</code> / <code>DESIGN.md</code></td></tr>
          <tr><td>Birincil yüzey</td><td>Gerçek zamanlı çok kişilik tuval</td><td>Agent güdümlü üretim + korumalı önizleme</td></tr>
          <tr><td>Modeller / AI</td><td>Figma'nın kendi AI özellikleri</td><td>Herhangi bir OpenAI uyumlu uç nokta + tespit edilen kodlama agent'ı CLI'ları</td></tr>
          <tr><td>Eklentiler</td><td>Pazar, Figma içinde çalışır</td><td>Fork'lanabilir skill klasörleri, herhangi bir agent tarafından çalıştırılır</td></tr>
          <tr><td>Tasarım sistemleri</td><td>Figma kütüphaneleri (araç içi)</td><td>Taşınabilir <code>DESIGN.md</code> dosyaları (bir Figma dahil)</td></tr>
          <tr><td>Fiyatlandırma</td><td>Koltuk başına abonelik</td><td>Ücretsiz; model sağlayıcınıza doğrudan ödersiniz</td></tr>
          <tr><td>Teslimat</td><td>Dev Mode, inceleme, kırmızı çizgiler</td><td><code>$PATH</code>'teki herhangi bir agent, ayrıca HTML / PDF / PPTX / ZIP dışa aktarmaları</td></tr>
          <tr><td>Kendi kendine barındırılabilir</td><td>Hayır</td><td>Evet (dizüstü bilgisayar veya kendi dağıtımınız)</td></tr>
          <tr><td>Veri yolu</td><td>Dosyalar → Figma bulutu</td><td>İstemler → seçtiğiniz sağlayıcı; hiçbir şey bizim üzerimizden geçmez</td></tr>
        </tbody>
      </table>
      <p>Dürüst özet: Figma piyasadaki en cilalı işbirlikçi tuval deneyimine sahip ve hassas ekranları birlikte inceleyen bir tasarımcı ekibi için bu cila ürünün ta kendisidir. Open Design ise tuvali tamamen bir kütüphaneyle değiştirir — dizüstü bilgisayarınızdaki mevcut araçla bestelenmek üzere tasarlanmış skill'ler, system'ler ve agent'lar. Farklı biçim, farklı bahis.</p>

      <h2>Kim hangisini seçmeli</h2>
      <table>
        <thead><tr><th>Eğer şuysanız…</th><th>Seçin</th></tr></thead>
        <tbody>
          <tr><td>Canlı incelemeyle gerçek zamanlı, çok tasarımcılı tuval işi yapan bir tasarım ekibi</td><td><strong>Figma.</strong> Açık kaynakta hiçbir şey çok kişilik tuvale yaklaşmıyor.</td></tr>
          <tr><td>Bütün gün piksel hassasiyetinde vektör ve bileşen işi yapan bir tasarımcı</td><td><strong>Figma.</strong> Tuval ilkelleri olgun ve kas hafızanız gerçek para eder.</td></tr>
          <tr><td>Dev Mode'u mühendislik döngüsüne dahil etmiş, halihazırda Figma'da standartlaşmış bir organizasyon</td><td><strong>Figma.</strong> Entegrasyon maliyetini zaten ödediniz; harcayın.</td></tr>
          <tr><td>Terminalden halihazırda Claude Code, Codex veya Cursor'u süren bir tasarım mühendisi</td><td><strong>Open Design.</strong> Agent'ınız tasarım motorudur; skill katmanı yeni bir uygulama olmadan zevk ve yapı ekler.</td></tr>
          <tr><td>BYOK, proje ortasında model seçimi veya hassas brifingler için yalnızca yerel işlem isteyen herkes</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Gerçeklik pazarlamadan daha kaba</a>, ama gerçekten tutan tek sözleşme bu.</td></tr>
          <tr><td>Araç değişimine dayanan bir tasarım sistemi isteyen bir ekip</td><td><strong>Open Design.</strong> <code>DESIGN.md</code> dosyaları onu okuyan araçtan daha uzun yaşar.</td></tr>
          <tr><td>Projenin benimseyebileceği bir tasarım iş akışı göndermek isteyen bir açık kaynak katkıda bulunanı</td><td><strong>Open Design.</strong> Bir klasör bırakın, daemon'ı yeniden başlatın, PR'ı gönderin.</td></tr>
        </tbody>
      </table>
      <p>Çoğu ekip için kararı veren boyut kalite değil — Figma'nın işçiliği gerçek. Mesele, işinizin üzerinde çizilecek bir tuval mı yoksa otomatikleştirilecek bir iş akışı mı olduğu. İkincisiyse, kiralamaktansa sahip olmayı tercih edersiniz.</p>

      <h2>Sırada ne yapmalı</h2>
      <p>Halihazırda tekrarlanabilir bir Figma işiniz varsa — şu frame'leri dışa aktar, şu token'ları senkronize et, şu deck şablonunu yeniden inşa et — farkı en hızlı hissetmenin yolu bunlardan birini <a href="/blog/port-figma-workflow-open-design-plugin/">bir eklentiye taşımaktır</a>. "Figma'yı değiştir" ile değil, sinir bozucu, tekrarlanabilir bir görevle başlayın.</p>
      <p>Ya da sadece üç komutluk hızlı başlangıcı çalıştırın ve onu halihazırda parasını ödediğiniz modele yönlendirin. Her şey tek bir repo'da yaşıyor ve ilk deck yaklaşık on dakika sürüyor.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Açık kaynaklı iş akışını deneyin</a>.</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Bir Figma iş akışı Open Design eklentisine nasıl taşınır</a> — bir dışa aktarma, token senkronizasyonu veya marka kiti için somut yol</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design'ın açık kaynaklı alternatifi</a> — aynı dürüst değerlendirme, bir araç öteden</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir skill katmanı olarak inşa ettik</a> — "ürün değil, katman" bahsinin arkasındaki daha uzun manifesto</li>
      </ul>
  uk:
    title: "Альтернатива Figma з відкритим кодом"
    summary: "Figma чудова, і вона нікуди не подінеться. Але файл є пропрієтарним, місця — це підписка, а полотно живе в чиїйсь чужій хмарі. Ось чесна оцінка того, коли Figma все ще є відповіддю — і коли перемагає володіння agent-native, local-first робочим процесом."
    bodyHtml: |
      <p>Figma чудова. Ми роками виконували в ній реальну роботу, і це не стаття на тему «Figma мертва» — зовсім ні. Те, що ми <a href="/blog/why-we-built-open-design-as-a-skill-layer/">побудували шар з відкритим кодом</a>, а не ще одне полотно, — це не скарга на майстерність Figma. Це ставка на те, що наступне десятиліття дизайнерської роботи виглядатиме менше як курсор на нескінченному полотні і більше як agent, за якого ви вже платите, що керує робочим процесом, яким ви насправді володієте. Ця стаття — чесна оцінка Figma від команди, що будує в тій самій категорії: що вона робить найкраще, де вона прив'язує вас до себе, як насправді виглядає шлях з відкритим кодом і що вам варто обрати цього кварталу.</p>

      <h2>Що таке Figma насправді</h2>
      <p>Figma — це інструмент колаборативного дизайну за замовчуванням. Багатокористувацьке полотно в реальному часі у браузері, з Dev Mode для передачі розробникам, FigJam для роботи з дошкою, глибоким маркетплейсом плагінів і дедалі більшим набором AI-функцій, прикручених до тієї самої поверхні. Ціноутворення — за місце за місяць, з градацією за роллю та організацією.</p>
      <p>Є кілька речей, які вона робить краще за будь-що інше:</p>
      <ul>
        <li><strong>Колаборація на полотні в реальному часі.</strong> П'ятеро людей в одному файлі, курсори в реальному часі, коментарі прямо на місці. Ніщо у відкритому коді не зрівняється з відшліфованістю багатокористувацької роботи.</li>
        <li><strong>Піксельно точна векторна робота.</strong> Auto Layout, обмеження, варіанти, компоненти — примітиви полотна зрілі, а м'язова пам'ять засіла глибоко.</li>
        <li><strong>Величезна екосистема плагінів.</strong> Десятиліття сторонніх плагінів, файлів спільноти та шаблонів, які можна одразу взяти й застосувати.</li>
        <li><strong>Передача роботи, яку команди вже знають.</strong> Dev Mode, inspect, червоні лінії розмітки та робочий процес, на якому інженерів навчали роками.</li>
      </ul>
      <p>Якщо ваша робота — це дизайнер, що малює точні екрани для інших людей, щоб ті переглядали їх на спільному полотні, Figma все ще є відповіддю, і доброю відповіддю. Відмінності, на які варто звертати увагу, живуть на один шар нижче — у тому, хто володіє файлом, робочим процесом і кривою витрат.</p>

      <h2>Де вона прив'язує вас до себе</h2>
      <p>Figma несе чотири складові прив'язки, які варто назвати відразу, бо сторінки з цінами цього не зроблять.</p>
      <p><strong>Файл є пропрієтарним.</strong> Ваш дизайн живе у форматі Figma, всередині серверів Figma. Ви можете експортувати PNG і dev-специфікації, але джерело істини — компоненти, варіанти, жива дизайн-система — повністю читається лише всередині Figma. Не існує текстової версії вашої роботи, яка пережила б цей інструмент.</p>
      <p><strong>Середовище виконання є хостованим.</strong> Полотно — це і є хмара. Для агентської роботи чи дорелізного креативу під NDA «де живе цей файл» — це розмова про закупівлі, а не налаштування. Робота лише локально не є режимом.</p>
      <p><strong>Плагіни не переносні.</strong> Екосистема плагінів Figma реальна та глибока — але кожен плагін працює всередині середовища виконання Figma, проти API Figma. Робочий процес, який ви там будуєте, не можна витягнути назовні й запустити agent'ом на вашому ноутбуці чи скомпонувати в конвеєр, який не починається з полотна Figma.</p>
      <p><strong>Рахунок завжди за місце, назавжди.</strong> Місця за підпискою — це нормально для стабільної дизайнерської команди. Вони стають незручними для організації, що швидко зростає, і вони цілковито неприйнятні для довгого хвоста контрибуторів, підрядників і разових співавторів, які інакше підхопили б той самий робочий процес.</p>
      <p>Жодна з цих речей не є багом. Це форма хостованого продукту-полотна для колаборації, і Figma — найкраща версія цієї форми. Ми просто будуємо не для полотна — ми будуємо для agent'а.</p>

      <figure>
        <img src="/blog/plate-17-locked-format.png" alt="Чорний гранований навісний замок, злитий із формою документа, оточений пунктирним кордоном, з ключем, намальованим як інженерна діаграма, на теплій редакторській дослідницькій плашці" />
        <figcaption>Джерело істини живе у пропрієтарному файлі, всередині чиєїсь чужої хмари.</figcaption>
      </figure>

      <h2>Зсув, на який ставить Open Design</h2>
      <p>Open Design — не клон Figma. Тут немає нескінченного полотна і немає багатокористувацьких курсорів. Це тонкий шар skill'ів, який перетворює coding agent, яким ви вже користуєтесь, на дизайнерський рушій. Чотири примітиви — це <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters і daemon</a> — а важливо те, що всі вони — просто файли:</p>
      <ul>
        <li>Кожен skill — це файл <code>SKILL.md</code>, який ви можете читати, форкати й надсилати назад як PR.</li>
        <li>Кожна дизайн-система — це переносний файл <code>DESIGN.md</code> — включно з тим, який ми постачаємо для самої Figma. Ви можете відкрити його в будь-якому редакторі, порівняти diff'ом у git, і він переживе будь-який інструмент, що прочитає його наступним.</li>
        <li>Кожен agent adapter — це ~80 рядків TypeScript.</li>
      </ul>
      <p>Те, що це вам дає, — точна протилежність чотирьох прив'язок вище:</p>
      <ul>
        <li><strong>Файл є простим текстом.</strong> Skills і systems — це Markdown у repo. Ваша дизайн-система читається без інструмента.</li>
        <li><strong>Середовище виконання — локальне.</strong> Воно працює на вашому ноутбуці через <code>pnpm tools-dev</code>, або ви розгортаєте його самі. Промпти йдуть до провайдера моделі, якого ви обрали — нічого не маршрутизується через нас.</li>
        <li><strong>Робочий процес переносний.</strong> Skill — це папка. Вона компонується з будь-яким agent'ом у вашому <code>$PATH</code>, а не з середовищем виконання плагінів одного вендора.</li>
        <li><strong>BYOK за замовчуванням.</strong> Вставте будь-який сумісний з OpenAI <code>base_url</code> і ключ; <a href="/blog/byok-design-workflow-claude-codex-qwen/">ваші токени йдуть прямо до провайдера</a>. Apache-2.0, без реєстрації, без рахунку за місце.</li>
      </ul>
      <p>Ментальна модель така: Figma — це полотно, яке ви орендуєте. Open Design — це робочий процес, яким ви володієте.</p>

      <figure>
        <img src="/blog/plate-18-portable-files.png" alt="Віяло простих чорних аркушів паперу та індексних карток, що розгортаються з відкритого контейнера, кілька з яких відлітають убік, на теплій редакторській дослідницькій плашці" />
        <figcaption>Skills і systems — це текстові файли у repo — переносні, форкабельні, читабельні без інструмента.</figcaption>
      </figure>

      <h2>Порівняння пліч-о-пліч</h2>
      <table>
        <thead><tr><th></th><th><strong>Figma</strong></th><th><strong>Open Design</strong></th></tr></thead>
        <tbody>
          <tr><td>Ліцензія</td><td>Пропрієтарна</td><td>Apache-2.0</td></tr>
          <tr><td>Середовище виконання</td><td>Хостоване (браузер, хмара Figma)</td><td>Локальний daemon (<code>pnpm tools-dev</code>) + опційний self-host</td></tr>
          <tr><td>Формат вихідного файлу</td><td>Пропрієтарний <code>.fig</code></td><td>Текстові <code>SKILL.md</code> / <code>DESIGN.md</code> у repo</td></tr>
          <tr><td>Основна поверхня</td><td>Багатокористувацьке полотно в реальному часі</td><td>Генерація під керуванням agent'а + пісочничний preview</td></tr>
          <tr><td>Моделі / AI</td><td>Власні AI-функції Figma</td><td>Будь-який сумісний з OpenAI endpoint + виявлені CLI coding-agent'ів</td></tr>
          <tr><td>Плагіни</td><td>Маркетплейс, працює всередині Figma</td><td>Форкабельні папки skill'ів, запускаються будь-яким agent'ом</td></tr>
          <tr><td>Дизайн-системи</td><td>Бібліотеки Figma (всередині інструмента)</td><td>Переносні файли <code>DESIGN.md</code> (включно з одним для Figma)</td></tr>
          <tr><td>Ціноутворення</td><td>Підписка за місце</td><td>Безкоштовно; ви платите провайдеру моделі напряму</td></tr>
          <tr><td>Передача роботи</td><td>Dev Mode, inspect, червоні лінії</td><td>Будь-який agent у <code>$PATH</code>, плюс експорт HTML / PDF / PPTX / ZIP</td></tr>
          <tr><td>Можливість self-host</td><td>Ні</td><td>Так (ноутбук або ваше власне розгортання)</td></tr>
          <tr><td>Шлях даних</td><td>Файли → хмара Figma</td><td>Промпти → обраний вами провайдер; нічого через нас</td></tr>
        </tbody>
      </table>
      <p>Чесний підсумок: Figma має найвідшліфованіший досвід колаборативного полотна на ринку, і для команди дизайнерів, що разом переглядають точні екрани, ця відшліфованість і є продуктом. Open Design ж цілковито міняє полотно на бібліотеку — skills, systems і agents, спроєктовані так, щоб компонуватися з інструментом, який уже є на вашому ноутбуці. Інша форма, інша ставка.</p>

      <h2>Кому що обрати</h2>
      <table>
        <thead><tr><th>Якщо ви…</th><th>Оберіть</th></tr></thead>
        <tbody>
          <tr><td>Дизайнерська команда, що працює на полотні в реальному часі з кількома дизайнерами та живим переглядом</td><td><strong>Figma.</strong> Ніщо у відкритому коді не зрівняється з багатокористувацьким полотном.</td></tr>
          <tr><td>Дизайнер, що цілими днями робить піксельно точну векторну та компонентну роботу</td><td><strong>Figma.</strong> Примітиви полотна зрілі, а ваша м'язова пам'ять варта справжніх грошей.</td></tr>
          <tr><td>Організація, що вже стандартизувалася на Figma з Dev Mode в інженерному циклі</td><td><strong>Figma.</strong> Ви вже заплатили за інтеграцію; витратьте це.</td></tr>
          <tr><td>Дизайн-інженер, що вже керує Claude Code, Codex чи Cursor з терміналу</td><td><strong>Open Design.</strong> Ваш agent і є дизайнерським рушієм; шар skill'ів додає смак і структуру без нового застосунку.</td></tr>
          <tr><td>Будь-хто, кому потрібен BYOK, зміна моделі посеред проєкту чи робота лише локально для чутливих брифів</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Реальність грубіша за маркетинг</a>, але це єдиний контракт, який насправді тримається.</td></tr>
          <tr><td>Команда, що хоче дизайн-систему, яка переживе зміну інструментів</td><td><strong>Open Design.</strong> Файли <code>DESIGN.md</code> переживають інструмент, що їх читає.</td></tr>
          <tr><td>Контрибутор з відкритим кодом, що хоче випустити дизайнерський робочий процес, який проєкт може прийняти</td><td><strong>Open Design.</strong> Покладіть папку, перезапустіть daemon, надішліть PR.</td></tr>
        </tbody>
      </table>
      <p>Вимір, що вирішує справу для більшості команд, — це не якість; майстерність Figma реальна. Це те, чи ваша робота — це полотно для малювання, чи робочий процес для автоматизації. Якщо друге, ви радше володітимете ним, ніж орендуватимете.</p>

      <h2>Що робити далі</h2>
      <p>Якщо у вас уже є повторювана робота у Figma — експортувати ці frame'и, синхронізувати ті токени, перебудувати той шаблон deck'а — найшвидший спосіб відчути різницю — це <a href="/blog/port-figma-workflow-open-design-plugin/">перенести один із них у плагін</a>. Почніть з однієї дратівливої повторюваної задачі, а не з «замінити Figma».</p>
      <p>Або просто запустіть швидкий старт із трьох команд і спрямуйте його на модель, за яку ви вже платите. Уся ця штука живе в одному repo, а перший deck займає близько десяти хвилин.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Спробуйте робочий процес з відкритим кодом</a>.</p>

      <h2>Додаткове читання</h2>
      <ul>
        <li><a href="/blog/port-figma-workflow-open-design-plugin/">Як перенести робочий процес Figma у плагін Open Design</a> — конкретний шлях для експорту, синхронізації токенів чи брендового набору</li>
        <li><a href="/blog/open-source-alternative-to-claude-design/">Альтернатива Claude Design з відкритим кодом</a> — та сама чесна оцінка, на один інструмент далі</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми зробили Open Design шаром skill'ів, а не продуктом</a> — довший маніфест за ставкою «шар, а не продукт»</li>
      </ul>
---

Figma is excellent. We've shipped real work in it for years, and this isn't a "Figma is dead" post — it very much isn't. The fact that we [built an open-source layer](/blog/why-we-built-open-design-as-a-skill-layer/) instead of another canvas isn't a complaint about Figma's craft. It's a bet that the next decade of design work looks less like a cursor on an infinite canvas and more like an agent you already pay for, driving a workflow you actually own. This post is the honest read on Figma from a team building in the same category: what it does best, where it locks you in, what the open-source path actually looks like, and which one you should reach for this quarter.

## What Figma actually is

Figma is the default collaborative design tool. A real-time multiplayer canvas in the browser, with Dev Mode for handoff, FigJam for whiteboarding, a deep plugin marketplace, and a growing set of AI features bolted onto the same surface. Pricing is per-seat per-month, tiered by role and by org.

It does a handful of things better than anything else:

- **Real-time canvas collaboration.** Five people in one file, cursors live, comments inline. Nothing in open source matches the multiplayer polish.
- **Pixel-precise vector work.** Auto Layout, constraints, variants, components — the canvas primitives are mature and the muscle memory runs deep.
- **A huge plugin ecosystem.** A decade of third-party plugins, community files, and templates you can drop in.
- **Handoff that teams already know.** Dev Mode, inspect, redlines, and a workflow engineering has been trained on for years.

If your work is a designer painting precise screens for other humans to review on a shared canvas, Figma is still the answer, and it's a good one. The differences worth caring about live one layer down — in who owns the file, the workflow, and the cost curve.

## Where it locks you in

Figma carries four pieces of lock-in worth naming upfront, because the pricing pages don't.

**The file is proprietary.** Your design lives in Figma's format, inside Figma's servers. You can export PNGs and dev specs, but the source of truth — components, variants, the live design system — is only fully legible inside Figma. There is no plain-text version of your work that survives the tool.

**The runtime is hosted.** The canvas is the cloud. For agency work or pre-launch creative under NDA, "where does this file live" is a procurement conversation, not a setting. Local-only isn't a mode.

**The plugins aren't portable.** Figma's plugin ecosystem is real and deep — but every plugin runs inside Figma's runtime, against Figma's API. A workflow you build there can't be lifted out and run by an agent on your laptop, or composed into a pipeline that doesn't start with the Figma canvas.

**The bill is per-seat, forever.** Subscription seats are fine for a stable design team. They get awkward for a fast-growing org, and they're a non-starter for the long tail of contributors, contractors, and one-off collaborators who'd otherwise pick up the same workflow.

None of these are bugs. They're the shape of a hosted, collaborative-canvas product, and Figma is the best version of that shape. We're just not building for the canvas — we're building for the agent.

<figure>
  <img src="/blog/plate-17-locked-format.png" alt="A black faceted padlock fused with a document shape, ringed by a dashed boundary with a key drawn as an engineering diagram, on a warm editorial study plate" />
  <figcaption>The source of truth lives in a proprietary file, inside someone else's cloud.</figcaption>
</figure>

## The shift Open Design bets on

Open Design isn't a Figma clone. There's no infinite canvas and no multiplayer cursors. It's a thin skill layer that turns the coding agent you already use into a design engine. The four primitives are [skills, systems, adapters, and the daemon](/blog/31-skills-72-systems-how-the-library-works/) — and the important part is that they're all just files:

- Every skill is a `SKILL.md` file you can read, fork, and send back as a PR.
- Every design system is a portable `DESIGN.md` file — including the one we ship for Figma itself. You can open it in any editor, diff it in git, and it outlives whatever tool reads it next.
- Every agent adapter is ~80 lines of TypeScript.

What that buys you is the opposite of the four lock-ins above:

- **The file is plain text.** Skills and systems are Markdown in a repo. Your design system is legible without the tool.
- **The runtime is local.** It runs on your laptop via `pnpm tools-dev`, or you deploy it yourself. Prompts go to the model provider you chose — nothing routes through us.
- **The workflow is portable.** A skill is a folder. It composes into any agent on your `$PATH`, not a single vendor's plugin runtime.
- **BYOK by default.** Paste any OpenAI-compatible `base_url` and key; [your tokens go straight to the provider](/blog/byok-design-workflow-claude-codex-qwen/). Apache-2.0, no signup, no per-seat bill.

The mental model: Figma is a canvas you rent. Open Design is a workflow you own.

<figure>
  <img src="/blog/plate-18-portable-files.png" alt="A fan of plain black paper sheets and index cards spreading out of an open container, a couple drifting free, on a warm editorial study plate" />
  <figcaption>Skills and systems are plain-text files in a repo — portable, forkable, legible without the tool.</figcaption>
</figure>

## Side-by-side

| | **Figma** | **Open Design** |
|---|---|---|
| License | Proprietary | Apache-2.0 |
| Runtime | Hosted (browser, Figma cloud) | Local daemon (`pnpm tools-dev`) + optional self-host |
| Source format | Proprietary `.fig` | Plain-text `SKILL.md` / `DESIGN.md` in a repo |
| Primary surface | Real-time multiplayer canvas | Agent-driven generation + sandboxed preview |
| Models / AI | Figma's own AI features | Any OpenAI-compatible endpoint + detected coding-agent CLIs |
| Plugins | Marketplace, runs inside Figma | Forkable skill folders, run by any agent |
| Design systems | Figma libraries (in-tool) | Portable `DESIGN.md` files (incl. a Figma one) |
| Pricing | Per-seat subscription | Free; you pay your model provider directly |
| Handoff | Dev Mode, inspect, redlines | Any agent on `$PATH`, plus HTML / PDF / PPTX / ZIP exports |
| Self-hostable | No | Yes (laptop or your own deploy) |
| Data path | Files → Figma cloud | Prompts → your chosen provider; nothing through us |

The honest summary: Figma has the most polished collaborative-canvas experience on the market, and for a team of designers reviewing precise screens together, that polish is the product. Open Design trades the canvas entirely for a library — skills, systems, and agents designed to compose with the tool already on your laptop. Different shape, different bet.

## Who should pick what

| If you are… | Pick |
|---|---|
| A design team doing real-time, multi-designer canvas work with live review | **Figma.** Nothing in open source matches the multiplayer canvas. |
| A designer doing pixel-precise vector and component work all day | **Figma.** The canvas primitives are mature and your muscle memory is worth real money. |
| An org already standardised on Figma with Dev Mode in the engineering loop | **Figma.** You've paid the integration cost; spend it. |
| A design engineer who already drives Claude Code, Codex, or Cursor from the terminal | **Open Design.** Your agent is the design engine; the skill layer adds taste and structure without a new app. |
| Anyone who needs BYOK, model choice mid-project, or local-only for sensitive briefs | **Open Design.** [The reality is rougher than the marketing](/blog/byok-reality-check-5-things-that-break/), but it's the only contract that actually holds. |
| A team that wants a design system that survives tool churn | **Open Design.** `DESIGN.md` files outlive the tool that reads them. |
| An open-source contributor who wants to ship a design workflow the project can adopt | **Open Design.** Drop a folder, restart the daemon, send the PR. |

The dimension that decides it for most teams isn't quality — Figma's craft is real. It's whether your work is a canvas to paint on, or a workflow to automate. If it's the latter, you'd rather own it than rent it.

## What to do next

If you already have a repeatable Figma job — export these frames, sync those tokens, rebuild that deck template — the fastest way to feel the difference is to [port one of them into a plugin](/blog/port-figma-workflow-open-design-plugin/). Start with one annoying, repeatable task, not "replace Figma."

Or just run the three-command quickstart and point it at the model you already pay for. The whole thing lives in one repo and the first deck takes about ten minutes.

[Try the open-source workflow](https://github.com/nexu-io/open-design/releases).

## Related reading

- [How to port a Figma workflow into an Open Design plugin](/blog/port-figma-workflow-open-design-plugin/) — the concrete path for an export, token sync, or brand kit
- [The open-source alternative to Claude Design](/blog/open-source-alternative-to-claude-design/) — the same honest read, one tool over
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "layer, not product" bet
