---
title: "Open Design 0.8.0: everything is a plugin"
date: 2026-05-22
category: "Product"
readingTime: 7
summary: "Open Design 0.8.0 isn't a release, it's a rebuild. A small plugin engine, a headless-by-default CLI, packaged auto-update on macOS and Windows, and 149 design systems shipped in seven days."
i18n:
  zh:
    title: "Open Design 0.8.0：一切皆插件"
    summary: "Open Design 0.8.0 不是一次发布，而是一次重建。一个小小的插件引擎、一个默认无头的 CLI、macOS 与 Windows 上的打包自动更新，以及七天内交付的 149 套设计系统。"
    bodyHtml: |
      <p>标签 <code>open-design-v0.8.0</code>（<code>c20d156</code>），于 2026 年 5 月 22 日 12:43 UTC 交付。七天内来自 75 位贡献者的 305 个 PR。这是我们停止试图扩展旧形态、转而重建底下引擎的那一次发布。你今天下载到的桌面应用，是一个薄薄的外壳，包着一个你也能从 Claude Code、Cursor 或一个 Slack 机器人那里指过来的 CLI。设计系统、切片、原型、导出，以及那些老的 Figma 风格工作流，都不再是烤进引擎里的功能——它们是插件，写在一个小而无聊的核心之上。</p>
      <p>如果你想看长版本，讨论帖里有。这篇文章是短版本：底层改了什么、你今天能拿它做什么，以及从哪里开始。</p>
      <h2>为什么是重建，而不是又一次发布</h2>
      <p>0.7 这条线有个问题。每一套工作流都活在引擎里——设计系统导入、deck 模板、切片渲染、Figma 移植，甚至发布这一步——而要加下一样东西就意味着改核心。正是这种动态，把我们之前的每一个编辑器都变成了插件坟场：一个锁在某个版本背后的 SaaS 插件 API，一个你必须申请才能进的「creator 计划」，一个每两年就坏一次的运行时。</p>
      <p>我们本可以把 0.8 作为那个表面上的又一个小版本发布出去。但相反，我们交付了重写。</p>
      <p>在底下，现在有三件事不一样了：</p>
      <ul>
      <li>引擎保持小而无聊。它运行 skill、挂载插件、调用 agent adapter，然后让到一边。</li>
      <li>其余一切都变成了插件。设计系统、切片、原型、导出、那些老的 Figma 工作流——它们全都活在同一种插件格式里，通过同一份清单登记，经由同一个面被沙箱化。</li>
      <li>CLI 是那个权威的入口点。桌面应用调进它；OD MCP 服务器也调它；你终端里的 agent 也调它。</li>
      </ul>
      <p>这次发布里的 305 个 PR，大多是把旧世界移植进新形态的工作。其中一些就是新形态本身。</p>
      <h2>三块架构基板</h2>
      <p><strong>一切皆插件。</strong>插件注册表这个面现在有了一个带信任徽章的详情抽屉、一个识得 GitHub 速率限制的 marketplace 回退、一个打磨过的发布页脚，以及一个统一的插件 / 集成导航（#2087、#2064、#1806、#1849）。发布一个插件会在作者账户下创建一个真实的 GitHub 仓库（#2332、#2363），而 CLI 的发布路径读取的是清单里实时的版本号、而非塞一个占位（#1903）。当引擎生长时，它在这里、在公开处生长。</p>
      <p><strong>默认无头。</strong>桌面应用现在是一个薄薄的外壳，包着 OD CLI。同一个引擎从 Claude Code、OpenClaw、Hermes Agent，以及 Lark、Discord 和 Slack 里的聊天机器人那里运行起来。本次发布里带来了自定义 CLI agent 配置（#378），所以你可以把任意一个 CLI agent 插进运行时，而不必碰核心。设计不再是一个你前往的地方，而成了你的 agent 拥有的一种能力。这正是 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">skill 层宣言</a> 所指向的；0.8.0 是 agent 路径成为权威路径、而非一道侧门的第一次发布。</p>
      <p><strong>插件创造插件。</strong>OD CLI 包着 GitHub CLI，所以一个 agent 可以克隆仓库、scaffold 一个插件、校验它、打包它，并开一个 PR——替你，或替它自己。<a href="/blog/port-figma-workflow-open-design-plugin/">如何移植一套 Figma 工作流指南</a> 走的是人类路径；同一条路径的自动化版本，现在从任何一个在 <code>$PATH</code> 上有 <code>gh</code> 和 <code>od</code> 的 agent 内部都够得着。引擎自己生长自己，在公开处，且有你在这个循环里。</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="一块插件瓷砖正滑进一个引擎模块上的对接槽位，在近白色的编辑风底纹上被绿色框选中">
        <figcaption>一切皆插件——skill、system、切片和导出全都对接进同一个小小的引擎。</figcaption>
      </figure>
      <h2>0.8.0 里还落地了什么</h2>
      <p>这次发布很宽。值得拎出来的几块：</p>
      <ul>
      <li><strong>149 套带结构化 <code>tokens.css</code> + 组件清单的设计系统。</strong>Apple、Stripe、Airbnb、Vercel、Notion、Linear、GitHub、Figma、Slack、Discord、OpenAI、Shopify、Spotify、Uber、Cursor 以及另外 50 多个的品牌 token 套件——每一套都交付 <code>tokens.css</code> 和 <code>components.html</code>，通过一个默认开启的 token 通道供给（#1544、#1652、#1794、#1841、#2023、#2028、#2029、#2033）。<a href="/blog/open-source-alternative-to-claude-design/">可移植系统的论证</a> 现在是默认的面，而非一道侧门。</li>
      <li><strong>Critique Theater 推进到 Phase 16。</strong>在 0.7.0 里还只是一个可观测的单一评审者，如今成了一个全程仪表化的循环：Phase 9 带原生 de / ja / ko / zh-TW i18n 的 web 客户端包装层，Phase 11 Playwright 舞台套件，Phase 12 带 9 个 Prometheus 指标 + 6 个日志事件 + OTel span + Grafana 仪表盘，Phase 15 灰度解析器，Phase 16 M 阶段灰度棘轮以及 <code>/api/critique/conformance</code>（#1315–#1320、#1338、#1483–#1485、#1499）。默认在 M0 暗发布。</li>
      <li><strong>三个新的媒体提供器。</strong>Leonardo.ai 图像生成（#1123）、ElevenLabs 音频（#1384），以及 SenseAudio TTS 外加带图像和视频工具的 BYOK 聊天（#1633、#2065）。媒体调度器现在对你指向的任何东西都讲兼容 OpenAI 的协议。</li>
      <li><strong>macOS 与 Windows 上的打包自动更新。</strong>这是打包安装在两个平台上、通过同一个 R2 feed 端到端自更新的第一次发布，带着一个焕新的更新器弹窗、经过校验的下载 / 安装交接，以及从被中断的应用过程中恢复的能力（#2270、#2362、#2376、#2403、#2429、#2565、#2575、#2592、#2595、#2677、#2687、#2700）。Linux 打包 GUI 在我们加固这条通道期间仍然延后；无头生命周期和 Nix flake 今天都能用。</li>
      <li><strong>意大利语（it）locale + CJK 字体回退。</strong>UI 现在以 19 种语言交付，其中包括意大利语（#1323），而中文 / 日文 / 韩文文本会回退到平台原生字体、而不是走拉丁字替换（#2227）。</li>
      <li><strong>自上而下的视觉焕新。</strong>新的应用图标、品牌字形、焕新的 wordmark——一次协调好的投放，赶在这次切版之前（#2436）。</li>
      </ul>
      <p>完整清单一直排到 305 个 PR。<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">GitHub 上的发布说明</a> 承载着其余部分。</p>
      <h2>今天能拿它做什么</h2>
      <p>三条路径，取决于你从哪里开始。</p>





















      <table><thead><tr><th>如果你是……</th><th>从这里开始</th></tr></thead><tbody><tr><td>Open Design 新手</td><td>下载桌面应用，让它针对一套现有设计系统自举出一个项目</td></tr><tr><td>已经在运行 Open Design</td><td>让打包好的自动更新把你带到 0.8.0；应用内的更新器弹窗会引导你走完经过校验的安装</td></tr><tr><td>正在构建一个插件</td><td>用 <code>od plugin scaffold --id &#x3C;name></code> scaffold，用 <code>od plugin validate ./&#x3C;path> --no-daemon</code> 校验，然后经由发布 marketplace 里每一个插件用的同一条 OD 发布路径开一个 PR</td></tr></tbody></table>
      <p>如果你一直在等待 agent 原生的循环感觉起来像那个权威循环、而不是一个 demo，那就是这次发布了。把 Claude Code、Cursor、Codex，或那 16 个被检测到的 CLI agent 中的任意一个，指向桌面应用所交付的同一个 OD CLI，这两条路径在第一个 prompt 之后就汇合了。</p>
      <h2>接下来该做什么</h2>
      <p>感受 0.7 与 0.8 之间差别最快的方式，就是安装桌面应用，让它拾起你已有的 agent，然后跑一遍你上个月跑过的同一份 brief。答案的形状变了。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">下载桌面应用</a>。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a>——0.8.0 终于兑现的那个「引擎加插件」赌注背后更长的宣言</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">如何把一套 Figma 工作流移植成一个 Open Design 插件</a>——「插件创造插件」循环的实操版</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design 的开源替代品</a>——这次发布在 agent 原生设计版图里落在哪里</li>
      </ul>
  zh-tw:
    title: "Open Design 0.8.0：一切皆外掛"
    summary: "Open Design 0.8.0 不是一次發布，而是一次重建。一個小巧的外掛引擎、一個預設無頭的 CLI、macOS 與 Windows 上的封裝版自動更新，以及七天內出貨的 149 個設計系統。"
    bodyHtml: |
      <p>標籤 <code>open-design-v0.8.0</code>（<code>c20d156</code>），於 2026 年 5 月 22 日 12:43 UTC 出貨。七天內來自 75 位貢獻者的 305 個 PR。這是我們停止試圖延伸舊形態、並重建其底下引擎的那次發布。你今天會下載的桌面 app，是一層包在 CLI 外面的薄殼，而你也可以從 Claude Code、Cursor 或一個 Slack 機器人指向那個 CLI。設計系統、切片、原型、匯出，以及舊的 Figma 風格工作流程，不再是烤進引擎裡的功能——它們是外掛，對著一個小巧、無趣的核心寫成。</p>
      <p>如果你想要長版本，那條討論串裡有。這篇文章是短版本：底層改了什麼、你今天能拿它做什麼，以及從哪裡開始。</p>
      <h2>為什麼是重建，而不是又一次發布</h2>
      <p>0.7 那條線有一個問題。每一個工作流程都活在引擎裡——設計系統匯入、簡報範本、切片渲染、Figma 移植，甚至是發布步驟——而要加上下一個東西就意味著編輯核心。正是這個動態，把我們之前每一個編輯器都變成了一座外掛墳場：一個鎖在某個版本後面的 SaaS 外掛 API、一個你得申請才能加入的「創作者計畫」、一個每兩年就壞一次的執行環境。</p>
      <p>我們大可以把 0.8 當成那個表面上的又一次小版本發布出貨。但相反地，我們出貨了那次重寫。</p>
      <p>在底下，現在有三件事不一樣了：</p>
      <ul>
      <li>引擎保持小巧而無趣。它執行技能、掛載外掛、呼叫 agent 轉接器，然後讓開路。</li>
      <li>其他一切都成了外掛。設計系統、切片、原型、匯出、舊的 Figma 工作流程——它們全都活在同一個外掛格式裡，透過同一份 manifest 註冊，透過同一個表面沙盒化。</li>
      <li>CLI 是那個正典的進入點。桌面 app 呼叫進它；OD MCP 伺服器也是；你終端機裡的 agent 也是。</li>
      </ul>
      <p>這次發布裡的 305 個 PR，大多是把舊世界移植進新形態的工作。其中有些就是那個新形態本身。</p>
      <h2>三塊架構板塊</h2>
      <p><strong>一切皆外掛。</strong>外掛登錄表面現在有了一個帶信任徽章的詳情抽屜、一個能感知 GitHub 速率限制的市集回退、一個打磨過的發布頁尾，以及一個統一的外掛／整合導覽（#2087、#2064、#1806、#1849）。發布一個外掛會在作者帳號下建立一個真實的 GitHub repo（#2332、#2363），而 CLI 發布路徑讀取的是即時的 manifest 版本，而不是用樁（stub）代替它（#1903）。當引擎成長時，它就在外面、在公開處成長。</p>
      <p><strong>預設無頭。</strong>桌面 app 現在是一層包在 OD CLI 外面的薄殼。同一個引擎從 Claude Code、OpenClaw、Hermes Agent，以及 Lark、Discord 和 Slack 裡的聊天機器人執行。自訂 CLI agent 設定檔在這次發布裡出貨（#378），所以你可以把一個任意的 CLI agent 插進執行環境，而不必碰核心。設計不再是一個你前往的地方，而成為你的 agent 所擁有的一項能力。這正是<a href="/blog/why-we-built-open-design-as-a-skill-layer/">那篇技能層宣言</a>所指向的；0.8.0 是第一個讓 agent 路徑成為正典路徑、而不是側門的發布。</p>
      <p><strong>外掛建立外掛。</strong>OD CLI 包裹了 GitHub CLI，所以一個 agent 可以複製 repo、搭建一個外掛的鷹架、驗證它、打包它，並開一個 PR——替你，或替它自己。<a href="/blog/port-figma-workflow-open-design-plugin/">如何移植一個 Figma 工作流程的指南</a>走的是人類路徑；同一條路徑的自動化版本，現在從任何在 <code>$PATH</code> 上有 <code>gh</code> 和 <code>od</code> 的 agent 內部都可達。引擎自己成長，在公開處，而你在迴圈裡。</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="一個外掛方塊正滑進一個引擎模組上的對接插槽，被一個綠色框選中，襯在近白色的編輯風底色上">
        <figcaption>一切皆外掛——技能、系統、切片和匯出全都對接進同一個小巧的引擎。</figcaption>
      </figure>
      <h2>0.8.0 裡還落地了什麼</h2>
      <p>這次發布範圍很廣。值得拉到前面講的幾塊：</p>
      <ul>
      <li><strong>149 個設計系統，附有結構化的 <code>tokens.css</code> + 元件 manifest。</strong>Apple、Stripe、Airbnb、Vercel、Notion、Linear、GitHub、Figma、Slack、Discord、OpenAI、Shopify、Spotify、Uber、Cursor，外加另外 50 個的品牌 token 夾具——每一個都出貨 <code>tokens.css</code> 和 <code>components.html</code>，透過一個預設開啟的 token 通道供應（#1544、#1652、#1794、#1841、#2023、#2028、#2029、#2033）。<a href="/blog/open-source-alternative-to-claude-design/">可攜系統的推理</a>現在是預設的表面，而不是一個側門。</li>
      <li><strong>Critique Theater 推進到第 16 階段。</strong>在 0.7.0 裡還是一個單一可觀測的評判者，如今是一個完整儀表化的迴圈：第 9 階段帶原生 de / ja / ko / zh-TW i18n 的 web 客戶端外殼、第 11 階段 Playwright 階段套件、第 12 階段帶 9 個 Prometheus 指標 + 6 個日誌事件 + OTel span + Grafana 儀表板、第 15 階段推出解析器、第 16 階段 M 階段推出棘輪以及 <code>/api/critique/conformance</code>（#1315–#1320、#1338、#1483–#1485、#1499）。預設在 M0 暗發布。</li>
      <li><strong>三家新的媒體供應商。</strong>Leonardo.ai 影像生成（#1123）、ElevenLabs 音訊（#1384），以及 SenseAudio TTS，外加帶有影像與影片工具的 BYOK 聊天（#1633、#2065）。媒體調度器現在會對你指向的任何東西講 OpenAI 相容。</li>
      <li><strong>macOS 與 Windows 上的封裝版自動更新。</strong>第一個讓封裝版安裝在兩個平台上都能透過同一個 R2 feed 端對端自我更新的發布，帶有一個重新整理過的更新程式彈出視窗、經驗證的下載／安裝交接，以及從中斷的套用中恢復（#2270、#2362、#2376、#2403、#2429、#2565、#2575、#2592、#2595、#2677、#2687、#2700）。Linux 封裝版 GUI 在我們強化這條通道期間仍然延後；無頭生命週期和 Nix flake 兩者今天都能運作。</li>
      <li><strong>義大利文（it）語系 + CJK 字型回退。</strong>UI 現在以 19 種語言出貨，包括義大利文（#1323），而中文／日文／韓文文字會回退到平台原生字型，而不是走拉丁字替換（#2227）。</li>
      <li><strong>由上而下的視覺翻新。</strong>新的 app 圖示、品牌字符、重新整理過的 wordmark——一次協調的投放，趕上這次切版（#2436）。</li>
      </ul>
      <p>完整清單長達 305 個 PR。<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">GitHub 上的發布說明</a>承載了其餘的部分。</p>
      <h2>今天能拿它做什麼</h2>
      <p>三條路徑，取決於你從哪裡開始。</p>





















      <table><thead><tr><th>如果你是……</th><th>從這裡開始</th></tr></thead><tbody><tr><td>初次接觸 Open Design</td><td>下載桌面 app，讓它對著一個既有的設計系統引導出一個專案</td></tr><tr><td>已經在執行 Open Design</td><td>讓封裝版自動更新把你帶到 0.8.0；app 內的更新程式彈出視窗會帶你走過經驗證的安裝</td></tr><tr><td>正在打造一個外掛</td><td>用 <code>od plugin scaffold --id &#x3C;name></code> 搭建鷹架，用 <code>od plugin validate ./&#x3C;path> --no-daemon</code> 驗證，並透過跟市集裡每一個其他外掛相同的 OD 發布路徑開一個 PR</td></tr></tbody></table>
      <p>如果你一直在等那個 agent 原生迴圈感覺像正典迴圈、而不是一個 demo，那麼這就是那次發布。把 Claude Code、Cursor、Codex，或那 16 個偵測到的 CLI agent 裡的任何一個，指向桌面 app 出貨時所附的同一個 OD CLI，這兩條路徑就會在第一個提示之後匯合。</p>
      <h2>接下來該做什麼</h2>
      <p>感受 0.7 和 0.8 之間差別最快的辦法，就是安裝桌面 app、讓它接上你既有的 agent，並跑你上個月跑過的同一份簡報。那個答案的形態變了。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">下載桌面版</a>。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>——0.8.0 終於兌現的那個「引擎加外掛」賭注背後更長的宣言</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">如何把一個 Figma 工作流程移植成一個 Open Design 外掛</a>——「外掛建立外掛」迴圈的實務版本</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design 的開源替代方案</a>——這次發布在 agent 原生設計版圖裡的落點</li>
      </ul>
  ja:
    title: "Open Design 0.8.0：すべてはプラグイン"
    summary: "Open Design 0.8.0 はリリースではなく、作り直しです。小さなプラグインエンジン、デフォルトでヘッドレスな CLI、macOS と Windows でのパッケージ化された自動更新、そして 7 日間で出荷された 149 のデザインシステム。"
    bodyHtml: |
      <p>タグ <code>open-design-v0.8.0</code>（<code>c20d156</code>）、2026 年 5 月 22 日 12:43 UTC に出荷。7 日間で 75 人のコントリビューターから 305 件の PR。これは、私たちが古い形を拡張しようとするのをやめ、その下のエンジンを作り直したリリースです。今日あなたがダウンロードするデスクトップアプリは、Claude Code、Cursor、あるいは Slack ボットからも向けられる CLI の薄いラッパーです。デザインシステム、スライス、プロトタイプ、エクスポート、そして古い Figma スタイルのワークフローは、もはやエンジンに焼き込まれた機能ではありません ── それらは、小さくて退屈なコアに対して書かれたプラグインです。</p>
      <p>長い版が欲しければ、ディスカッションのスレッドにあります。この記事は短い版です：内部で何が変わったか、今日それで何ができるか、そしてどこから始めるか。</p>
      <h2>なぜ別のリリースではなく作り直しなのか</h2>
      <p>0.7 系列には問題がありました。あらゆるワークフローがエンジンの中に宿っていました ── デザインシステムのインポート、デッキテンプレート、スライスのレンダリング、Figma の移植、果ては publish のステップまで ── そして次のものを追加するということは、コアを編集することを意味しました。それが、私たちより前のあらゆるエディタをプラグインの墓場に変えたダイナミクスです：バージョンの裏にロックされた SaaS プラグイン API、申請しなければならない「クリエイタープログラム」、2 年ごとに壊れるランタイム。</p>
      <p>私たちは 0.8 をその表面の上での別のポイントリリースとして出荷することもできました。代わりに、書き直しを出荷しました。</p>
      <p>その下では、今、3 つのことが違っています：</p>
      <ul>
      <li>エンジンは小さく退屈なままでした。スキルを実行し、プラグインをマウントし、エージェントアダプターを呼び、そして邪魔をせず退きます。</li>
      <li>それ以外のすべてがプラグインになりました。デザインシステム、スライス、プロトタイプ、エクスポート、古い Figma ワークフロー ── それらすべてが同じプラグイン形式に宿り、同じマニフェストを通して登録され、同じサーフェスを通してサンドボックス化されます。</li>
      <li>CLI が正規のエントリーポイントです。デスクトップアプリはそれを呼び出し、OD MCP サーバーもそうし、ターミナルの中のエージェントもそうします。</li>
      </ul>
      <p>このリリースの 305 件の PR は、ほとんどが古い世界を新しい形へ移植する作業です。そのいくつかは、新しい形そのものです。</p>
      <h2>3 つのアーキテクチャの板</h2>
      <p><strong>すべてはプラグイン。</strong>プラグインレジストリのサーフェスには今、トラストバッジ付きの詳細ドロワー、GitHub のレート制限を認識するマーケットプレイスのフォールバック、洗練された publish のフッター、そして統一されたプラグイン / インテグレーションのナビ（#2087、#2064、#1806、#1849）があります。プラグインを公開すると、作者のアカウントの下に本物の GitHub リポジトリが作成され（#2332、#2363）、CLI の publish 経路はマニフェストのバージョンをスタブ化する代わりにライブのものを読みます（#1903）。エンジンが成長するとき、それはここで、公の場で成長します。</p>
      <p><strong>デフォルトでヘッドレス。</strong>デスクトップアプリは今や OD CLI の薄いラッパーです。同じエンジンが、Claude Code、OpenClaw、Hermes Agent、そして Lark、Discord、Slack のチャットボットから動きます。カスタム CLI エージェントプロファイルがこのリリースで出荷され（#378）、コアに触れることなく任意の CLI エージェントをランタイムに差し込めます。デザインはもはや、あなたが行く場所であることをやめ、あなたのエージェントが持つ能力になります。これこそ<a href="/blog/why-we-built-open-design-as-a-skill-layer/">スキルレイヤーのマニフェスト</a>が指し示していたものです。0.8.0 は、エージェントの経路が脇道ではなく正規の経路である最初のリリースです。</p>
      <p><strong>プラグインがプラグインを作る。</strong>OD CLI は GitHub CLI を包むので、エージェントはリポジトリをクローンし、プラグインをスキャフォールドし、検証し、パックし、PR を開けます ── あなたのために、あるいは自分自身のために。<a href="/blog/port-figma-workflow-open-design-plugin/">Figma ワークフローの移植方法のガイド</a>は人間の経路を解説しています。同じ経路の自動化版は今、<code>$PATH</code> に <code>gh</code> と <code>od</code> を持つあらゆるエージェントの内部から到達できます。エンジンは、あなたをループの中に置いたまま、公の場で自らを成長させます。</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="1 枚のプラグインのタイルが、エンジンモジュールのドッキングスロットに滑り込み、ほぼ白の編集的な地の上で緑のフレームに選択されている">
        <figcaption>すべてはプラグイン ── スキル、システム、スライス、エクスポートはすべて、同じ小さなエンジンにドッキングします。</figcaption>
      </figure>
      <h2>0.8.0 に他に何が着地するか</h2>
      <p>このリリースは幅広いものです。前に押し出す価値のある部分：</p>
      <ul>
      <li><strong>構造化された <code>tokens.css</code> + コンポーネントマニフェストを持つ 149 のデザインシステム。</strong>Apple、Stripe、Airbnb、Vercel、Notion、Linear、GitHub、Figma、Slack、Discord、OpenAI、Shopify、Spotify、Uber、Cursor、そしてさらに 50 のためのブランドトークンのフィクスチャ ── それぞれが <code>tokens.css</code> と <code>components.html</code> を出荷し、デフォルトオンのトークンチャネルを通して提供されます（#1544、#1652、#1794、#1841、#2023、#2028、#2029、#2033）。<a href="/blog/open-source-alternative-to-claude-design/">ポータブルシステムの論拠</a>が、今や脇道ではなくデフォルトのサーフェスです。</li>
      <li><strong>Critique Theater がフェーズ 16 まで。</strong>0.7.0 では単一の観測可能なジャッジだったものが、今や完全に計装されたループです：ネイティブの de / ja / ko / zh-TW i18n を持つフェーズ 9 の web クライアントラッパー、フェーズ 11 の Playwright ステージスイート、9 つの Prometheus メトリクス + 6 つのログイベント + OTel スパン + Grafana ダッシュボードを持つフェーズ 12、フェーズ 15 のロールアウトリゾルバー、フェーズ 16 の M フェーズのロールアウトラチェットと <code>/api/critique/conformance</code>（#1315–#1320、#1338、#1483–#1485、#1499）。デフォルトで M0 にてダークローンチ。</li>
      <li><strong>3 つの新しいメディアプロバイダー。</strong>Leonardo.ai の画像生成（#1123）、ElevenLabs のオーディオ（#1384）、そして SenseAudio の TTS に加え、画像と動画のツール付きの BYOK チャット（#1633、#2065）。メディアディスパッチャーは今、あなたが向けたものなら何にでも OpenAI 互換で話します。</li>
      <li><strong>macOS と Windows でのパッケージ化された自動更新。</strong>パッケージ化されたインストールが、両プラットフォームで同じ R2 フィードを通して端から端まで自己更新する最初のリリースです。更新された updater のポップアップ、検証されたダウンロード / インストールの受け渡し、そして中断された適用からの復旧付き（#2270、#2362、#2376、#2403、#2429、#2565、#2575、#2592、#2595、#2677、#2687、#2700）。Linux のパッケージ化された GUI は、そのレーンを堅牢化する間まだ延期されています。ヘッドレスのライフサイクルと Nix flake はどちらも今日動きます。</li>
      <li><strong>イタリア語（it）ロケール + CJK フォントフォールバック。</strong>UI は今やイタリア語を含む 19 言語で出荷され（#1323）、中国語 / 日本語 / 韓国語のテキストはラテン語の代替を通る代わりにプラットフォームネイティブのフォントにフォールバックします（#2227）。</li>
      <li><strong>上から下までのビジュアルの刷新。</strong>新しいアプリアイコン、ブランドのグリフ、刷新されたワードマーク ── カットに間に合うよう調整された 1 つのドロップ（#2436）。</li>
      </ul>
      <p>完全なリストは 305 件の PR に及びます。<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">GitHub のリリースノート</a>が残りを運んでいます。</p>
      <h2>今日それで何をするか</h2>
      <p>どこから始めるかによって、3 つの経路があります。</p>


      <table><thead><tr><th>あなたが…</th><th>ここから始める</th></tr></thead><tbody><tr><td>Open Design が初めてなら</td><td>デスクトップアプリをダウンロードし、既存のデザインシステムに対してプロジェクトをブートストラップさせる</td></tr><tr><td>すでに Open Design を動かしているなら</td><td>パッケージ化された自動更新に 0.8.0 まで連れてきてもらう。アプリ内の updater のポップアップが、検証されたインストールを案内します</td></tr><tr><td>プラグインを作っているなら</td><td><code>od plugin scaffold --id &#x3C;name></code> でスキャフォールドし、<code>od plugin validate ./&#x3C;path> --no-daemon</code> で検証し、マーケットプレイスの他のすべてのプラグインを出荷するのと同じ OD の publish 経路を通して PR を開く</td></tr></tbody></table>
      <p>エージェントネイティブなループが、デモではなく正規のループのように感じられるのを待っていたなら、これがそのリリースです。Claude Code、Cursor、Codex、あるいは検出された 16 の CLI エージェントのいずれかを、デスクトップアプリが出荷するのと同じ OD CLI に向ければ、2 つの経路は最初のプロンプトの後に収束します。</p>
      <h2>次に何をするか</h2>
      <p>0.7 と 0.8 の違いを感じる最速の方法は、デスクトップアプリをインストールし、既存のエージェントを拾わせ、先月実行したのと同じブリーフを実行することです。答えの形が変わります。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">デスクトップをダウンロード</a>。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a> — 0.8.0 が報われ終える「エンジンとプラグイン」の賭けの背後にある、より長いマニフェスト</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Figma ワークフローを Open Design プラグインに移植する方法</a> — 「プラグインがプラグインを作る」ループの実践版</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design のオープンソースの代替</a> — このリリースがエージェントネイティブなデザインの風景のどこに収まるか</li>
      </ul>
  ko:
    title: "Open Design 0.8.0: 모든 것은 플러그인이다"
    summary: "Open Design 0.8.0은 릴리스가 아니라 재구축이다. 작은 플러그인 엔진, 기본이 헤드리스인 CLI, macOS와 Windows에서의 패키지 자동 업데이트, 그리고 7일 만에 출시된 149개의 디자인 시스템."
    bodyHtml: |
      <p>태그 <code>open-design-v0.8.0</code> (<code>c20d156</code>), 2026년 5월 22일 12:43 UTC에 출시. 7일 동안 75명의 기여자가 305개의 PR을 보냈다. 이번 릴리스는 우리가 옛 형태를 확장하려는 시도를 멈추고 그 밑의 엔진을 다시 만든 릴리스다. 오늘 당신이 내려받을 데스크톱 앱은 Claude Code, Cursor, 또는 Slack 봇에서도 가리킬 수 있는 CLI를 감싼 얇은 래퍼다. 디자인 시스템, 슬라이스, 프로토타입, 내보내기, 그리고 옛 Figma 스타일 워크플로는 더 이상 엔진에 박힌 기능이 아니다 — 그것들은 작고 평범한 코어를 대상으로 작성된 플러그인이다.</p>
      <p>긴 버전을 원한다면 디스커션 스레드에 있다. 이 글은 짧은 버전이다: 내부에서 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작할지.</p>
      <h2>또 하나의 릴리스가 아니라 재구축을 택한 이유</h2>
      <p>0.7 계열에는 문제가 있었다. 모든 워크플로가 엔진 안에 살았다 — 디자인 시스템 임포트, 덱 템플릿, 슬라이스 렌더링, Figma 포트, 심지어 퍼블리시 단계까지 — 그리고 다음 것을 추가하려면 코어를 편집해야 했다. 그것이 바로 우리 이전의 모든 에디터를 플러그인 무덤으로 바꿔놓은 역학이다: 버전 뒤에 잠긴 SaaS 플러그인 API, 지원해야 통과하는 “크리에이터 프로그램”, 2년마다 깨지는 런타임.</p>
      <p>우리는 0.8을 그 표면 위의 또 다른 포인트 릴리스로 낼 수도 있었다. 대신, 우리는 다시 쓰기를 출시했다.</p>
      <p>그 밑에서, 이제 세 가지가 다르다:</p>
      <ul>
      <li>엔진은 작고 평범하게 유지되었다. 스킬을 실행하고, 플러그인을 마운트하고, 에이전트 어댑터를 호출하고, 그리고 비켜선다.</li>
      <li>그 외 모든 것은 플러그인이 되었다. 디자인 시스템, 슬라이스, 프로토타입, 내보내기, 옛 Figma 워크플로 — 모두 동일한 플러그인 포맷 안에 살고, 동일한 매니페스트를 통해 등록되며, 동일한 표면을 통해 샌드박스된다.</li>
      <li>CLI가 정식 진입점이다. 데스크톱 앱이 그것을 호출하고, OD MCP 서버도, 당신 터미널의 에이전트도 그것을 호출한다.</li>
      </ul>
      <p>이번 릴리스의 305개 PR은 대부분 옛 세계를 새 형태로 옮기는 작업이다. 그중 일부는 새 형태 그 자체다.</p>
      <h2>세 개의 아키텍처 판(plate)</h2>
      <p><strong>모든 것은 플러그인이다.</strong> 플러그인 레지스트리 표면에는 이제 신뢰 배지가 있는 상세 드로어, GitHub 레이트 리밋을 인지하는 마켓플레이스 폴백, 다듬어진 퍼블리시 푸터, 그리고 통합된 플러그인 / 인티그레이션 내비게이션이 있다(#2087, #2064, #1806, #1849). 플러그인을 퍼블리시하면 작성자 계정 아래에 실제 GitHub 레포가 생성되고(#2332, #2363), CLI 퍼블리시 경로는 버전을 임시값으로 두는 대신 라이브 매니페스트 버전을 읽는다(#1903). 엔진이 자랄 때, 그것은 여기, 공개적으로 자란다.</p>
      <p><strong>기본은 헤드리스.</strong> 데스크톱 앱은 이제 OD CLI를 감싼 얇은 래퍼다. 동일한 엔진이 Claude Code, OpenClaw, Hermes Agent, 그리고 Lark, Discord, Slack의 챗봇에서 실행된다. 커스텀 CLI 에이전트 프로파일이 이번 릴리스에 포함되어(#378), 코어를 건드리지 않고도 임의의 CLI 에이전트를 런타임에 꽂을 수 있다. 디자인은 당신이 가는 장소이기를 멈추고 당신의 에이전트가 가진 역량이 된다. 이것이 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">스킬 레이어 선언문</a>이 가리키던 것이다. 0.8.0은 에이전트 경로가 곁문이 아니라 정식 경로인 첫 릴리스다.</p>
      <p><strong>플러그인이 플러그인을 만든다.</strong> OD CLI는 GitHub CLI를 감싸므로, 에이전트가 레포를 클론하고, 플러그인을 스캐폴드하고, 검증하고, 패킹하고, PR을 열 수 있다 — 당신을 위해서든, 자기 자신을 위해서든. <a href="/blog/port-figma-workflow-open-design-plugin/">Figma 워크플로를 포팅하는 방법 가이드</a>는 사람의 경로를 따라간다. 같은 경로의 자동화된 버전은 이제 <code>gh</code>와 <code>od</code>가 <code>$PATH</code>에 있는 모든 에이전트 안에서 도달할 수 있다. 엔진은 당신을 루프에 두고, 공개적으로, 스스로를 키운다.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="하나의 플러그인 타일이 엔진 모듈의 도킹 슬롯으로 미끄러져 들어가는 모습, 거의 흰색에 가까운 에디토리얼 바탕 위 녹색 프레임 안에 선택됨">
        <figcaption>모든 것은 플러그인이다 — 스킬, 시스템, 슬라이스, 내보내기 모두 동일한 작은 엔진에 도킹된다.</figcaption>
      </figure>
      <h2>0.8.0에 또 담긴 것</h2>
      <p>이번 릴리스는 폭이 넓다. 앞으로 끌어올 가치가 있는 조각들:</p>
      <ul>
      <li><strong>구조화된 <code>tokens.css</code> + 컴포넌트 매니페스트를 갖춘 디자인 시스템 149개.</strong> Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor를 비롯한 50개 이상의 브랜드 토큰 픽스처 — 각각 <code>tokens.css</code>와 <code>components.html</code>을 제공하며, 기본으로 켜지는 토큰 채널을 통해 서빙된다(#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">이식 가능한 시스템 논리</a>가 이제 곁문이 아니라 기본 표면이다.</li>
      <li><strong>Phase 16까지 진행된 Critique Theater.</strong> 0.7.0에서 단일 관측 가능 심판이었던 것이 이제 완전히 계측된 루프가 되었다: 네이티브 de / ja / ko / zh-TW i18n을 갖춘 Phase 9 웹 클라이언트 래퍼, Phase 11 Playwright 스테이지 스위트, 9개 Prometheus 메트릭 + 6개 로그 이벤트 + OTel 스팬 + Grafana 대시보드를 갖춘 Phase 12, Phase 15 롤아웃 리졸버, Phase 16 M-phase 롤아웃 래칫과 <code>/api/critique/conformance</code>(#1315–#1320, #1338, #1483–#1485, #1499). 기본적으로 M0에서 다크 런칭됨.</li>
      <li><strong>세 개의 새 미디어 프로바이더.</strong> Leonardo.ai 이미지 생성(#1123), ElevenLabs 오디오(#1384), 그리고 SenseAudio TTS와 더불어 이미지·비디오 도구가 있는 BYOK 챗(#1633, #2065). 미디어 디스패처는 이제 당신이 가리키는 무엇에든 OpenAI 호환으로 말한다.</li>
      <li><strong>macOS와 Windows에서의 패키지 자동 업데이트.</strong> 동일한 R2 피드를 통해 두 플랫폼 모두에서 패키지 설치본이 처음부터 끝까지 스스로 업데이트되는 첫 릴리스로, 새로워진 업데이터 팝업, 검증된 다운로드 / 설치 핸드오프, 그리고 중단된 적용으로부터의 복구를 갖췄다(#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). 우리가 그 레인을 견고하게 다지는 동안 Linux 패키지 GUI는 아직 보류 중이다. 헤드리스 라이프사이클과 Nix flake는 둘 다 오늘 작동한다.</li>
      <li><strong>이탈리아어(it) 로케일 + CJK 폰트 폴백.</strong> UI는 이제 이탈리아어를 포함해 19개 언어로 제공되며(#1323), 중국어 / 일본어 / 한국어 텍스트는 라틴 대체를 거치는 대신 플랫폼 네이티브 폰트로 폴백된다(#2227).</li>
      <li><strong>위에서 아래까지의 비주얼 리프레시.</strong> 새 앱 아이콘, 브랜드 글리프, 새로워진 워드마크 — 컷에 맞춰 한 번에 조율되어 떨어진 것(#2436).</li>
      </ul>
      <p>전체 목록은 305개 PR에 이른다. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">GitHub의 릴리스 노트</a>가 나머지를 담고 있다.</p>
      <h2>오늘 그것으로 무엇을 할까</h2>
      <p>어디서 시작하느냐에 따라 세 가지 경로가 있다.</p>




















      <table><thead><tr><th>당신이…</th><th>여기서 시작하라</th></tr></thead><tbody><tr><td>Open Design을 처음 쓴다면</td><td>데스크톱 앱을 내려받아 기존 디자인 시스템을 대상으로 프로젝트를 부트스트랩하게 하라</td></tr><tr><td>이미 Open Design을 돌리고 있다면</td><td>패키지 자동 업데이트가 당신을 0.8.0으로 데려가게 하라. 인앱 업데이터 팝업이 검증된 설치 과정을 안내한다</td></tr><tr><td>플러그인을 만들고 있다면</td><td><code>od plugin scaffold --id &#x3C;name></code>으로 스캐폴드하고, <code>od plugin validate ./&#x3C;path> --no-daemon</code>으로 검증하고, 마켓플레이스의 다른 모든 플러그인을 출시하는 동일한 OD 퍼블리시 경로를 통해 PR을 열어라</td></tr></tbody></table>
      <p>에이전트 네이티브 루프가 데모가 아니라 정식 루프처럼 느껴지기를 기다려왔다면, 이번이 그 릴리스다. Claude Code, Cursor, Codex, 또는 감지된 16개 CLI 에이전트 중 어느 것이든 데스크톱 앱이 함께 제공하는 동일한 OD CLI를 가리키게 하면, 두 경로는 첫 프롬프트 이후 하나로 수렴한다.</p>
      <h2>다음에 할 일</h2>
      <p>0.7과 0.8의 차이를 가장 빠르게 느끼는 방법은 데스크톱 앱을 설치하고, 기존 에이전트를 집어 들게 한 다음, 지난달에 돌렸던 동일한 브리프를 돌려보는 것이다. 답의 형태가 바뀐다.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">데스크톱 내려받기</a>.</p>
      <h2>관련 읽을거리</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아니라 스킬 레이어로 만든 이유</a> — 0.8.0이 마침내 결실을 보는 “엔진 더하기 플러그인” 베팅 뒤의 더 긴 선언문</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Figma 워크플로를 Open Design 플러그인으로 포팅하는 방법</a> — “플러그인이 플러그인을 만든다” 루프의 실용 버전</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design의 오픈소스 대안</a> — 이번 릴리스가 에이전트 네이티브 디자인 지형에서 어디에 들어맞는지</li>
      </ul>
  de:
    title: "Open Design 0.8.0: Alles ist ein Plugin"
    summary: "Open Design 0.8.0 ist kein Release, sondern ein Neubau. Eine kleine Plugin-Engine, eine standardmäßig headless laufende CLI, paketiertes Auto-Update auf macOS und Windows und 149 Designsysteme, ausgeliefert in sieben Tagen."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), ausgeliefert am 22. Mai 2026, 12:43 UTC. 305 PRs von 75 Mitwirkenden in sieben Tagen. Dies ist das Release, in dem wir aufgehört haben, die alte Form zu erweitern, und stattdessen die darunterliegende Engine neu gebaut haben. Die Desktop-App, die du heute herunterlädst, ist ein dünner Wrapper um eine CLI, die du auch aus Claude Code, Cursor oder einem Slack-Bot ansteuern kannst. Die Designsysteme, Slices, Prototypen, Exporte und die alten Figma-artigen Workflows sind keine fest in die Engine eingebauten Features mehr — sie sind Plugins, geschrieben gegen einen kleinen, langweiligen Kern.</p>
      <p>Wenn du die lange Version willst, findest du sie im Diskussions-Thread. Dieser Beitrag ist die kurze Version: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>
      <h2>Warum ein Neubau und nicht noch ein Release</h2>
      <p>Die 0.7-Linie hatte ein Problem. Jeder Workflow lebte innerhalb der Engine — Designsystem-Importe, Deck-Vorlagen, Slice-Rendering, der Figma-Port, sogar der Publish-Schritt — und das nächste Feature hinzuzufügen bedeutete, am Kern zu schrauben. Genau diese Dynamik hat jeden Editor vor uns in einen Plugin-Friedhof verwandelt: eine SaaS-Plugin-API, die hinter einer Version eingesperrt war, ein „Creator-Programm“, für das man sich bewerben musste, eine Laufzeitumgebung, die alle zwei Jahre kaputtging.</p>
      <p>Wir hätten 0.8 als weiteres Point-Release auf dieser Oberfläche ausliefern können. Stattdessen haben wir die Neuschreibung ausgeliefert.</p>
      <p>Darunter sind jetzt drei Dinge anders:</p>
      <ul>
      <li>Die Engine blieb klein und langweilig. Sie führt Skills aus, bindet Plugins ein, ruft Agent-Adapter auf und geht ansonsten aus dem Weg.</li>
      <li>Alles andere wurde zu einem Plugin. Designsysteme, Slices, Prototypen, Exporte, die alten Figma-Workflows — sie alle leben im selben Plugin-Format, registriert über dasselbe Manifest, gesandboxt über dieselbe Oberfläche.</li>
      <li>Die CLI ist der kanonische Einstiegspunkt. Die Desktop-App ruft sie auf; ebenso der OD MCP-Server; ebenso der Agent in deinem Terminal.</li>
      </ul>
      <p>Die 305 PRs in diesem Release sind größtenteils die Arbeit, die alte Welt in die neue Form zu portieren. Einige von ihnen sind die neue Form selbst.</p>
      <h2>Die drei architektonischen Platten</h2>
      <p><strong>Alles ist ein Plugin.</strong> Die Oberfläche der Plugin-Registry hat jetzt eine Detail-Schublade mit Trust-Badges, einen GitHub-Rate-Limit-bewussten Marketplace-Fallback, eine aufgeräumte Publish-Fußzeile und eine einheitliche Plugin-/Integrations-Navigation (#2087, #2064, #1806, #1849). Das Veröffentlichen eines Plugins erstellt ein echtes GitHub-Repo unter dem Konto des Autors (#2332, #2363), und der CLI-Publish-Pfad liest die Live-Manifest-Version, statt sie zu stubben (#1903). Wenn die Engine wächst, wächst sie hier draußen, in der Öffentlichkeit.</p>
      <p><strong>Standardmäßig headless.</strong> Die Desktop-App ist jetzt ein dünner Wrapper um die OD CLI. Dieselbe Engine läuft aus Claude Code, OpenClaw, Hermes Agent sowie Chatbots in Lark, Discord und Slack. Eigene CLI-Agent-Profile sind in diesem Release enthalten (#378), sodass du einen beliebigen CLI-Agenten in die Laufzeitumgebung einklinken kannst, ohne den Kern anzufassen. Design ist kein Ort mehr, zu dem du gehst, sondern wird zu einer Fähigkeit, die deine Agenten haben. Darauf zielte <a href="/blog/why-we-built-open-design-as-a-skill-layer/">das Skill-Layer-Manifest</a> ab; 0.8.0 ist das erste Release, in dem der Agent-Pfad der kanonische Pfad ist und nicht eine Seitentür.</p>
      <p><strong>Plugins erstellen Plugins.</strong> Die OD CLI umhüllt die GitHub CLI, sodass ein Agent das Repo klonen, ein Plugin scaffolden, es validieren, packen und einen PR öffnen kann — für dich oder für sich selbst. Der <a href="/blog/port-figma-workflow-open-design-plugin/">Leitfaden zum Portieren eines Figma-Workflows</a> beschreibt den menschlichen Pfad; die automatisierte Version desselben Pfades ist jetzt aus jedem Agenten erreichbar, der <code>gh</code> und <code>od</code> im <code>$PATH</code> hat. Die Engine lässt sich selbst wachsen, in der Öffentlichkeit, mit dir im Loop.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Eine einzelne Plugin-Kachel, die in einen Docking-Slot eines Engine-Moduls gleitet, ausgewählt in einem grünen Rahmen auf einem fast weißen, editorial wirkenden Untergrund">
        <figcaption>Alles ist ein Plugin — Skills, Systeme, Slices und Exporte docken alle an dieselbe kleine Engine an.</figcaption>
      </figure>
      <h2>Was sonst noch in 0.8.0 landet</h2>
      <p>Das Release ist breit. Die Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
      <li><strong>149 Designsysteme mit strukturierten <code>tokens.css</code> + Komponenten-Manifesten.</strong> Brand-Token-Fixtures für Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor und 50 weitere — jedes liefert <code>tokens.css</code> und <code>components.html</code>, ausgeliefert über einen standardmäßig aktiven Token-Kanal (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). Die <a href="/blog/open-source-alternative-to-claude-design/">Portable-System-Logik</a> ist jetzt die Standardoberfläche und keine Seitentür mehr.</li>
      <li><strong>Critique Theater bis Phase 16.</strong> Was in 0.7.0 ein einzelner beobachtbarer Judge war, ist jetzt ein voll instrumentierter Loop: Phase-9-Web-Client-Wrapper mit nativer de-/ja-/ko-/zh-TW-i18n, Phase-11-Playwright-Stage-Suite, Phase 12 mit 9 Prometheus-Metriken + 6 Log-Events + OTel-Span + Grafana-Dashboard, Phase-15-Rollout-Resolver, Phase-16-M-Phasen-Rollout-Ratsche und <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Standardmäßig bei M0 dark-launched.</li>
      <li><strong>Drei neue Media-Provider.</strong> Leonardo.ai-Bildgenerierung (#1123), ElevenLabs-Audio (#1384) und SenseAudio-TTS plus BYOK-Chat mit Bild- und Video-Tools (#1633, #2065). Der Media-Dispatcher spricht jetzt OpenAI-kompatibel mit allem, worauf du ihn richtest.</li>
      <li><strong>Paketiertes Auto-Update auf macOS und Windows.</strong> Erstes Release, in dem sich paketierte Installationen auf beiden Plattformen End-to-End über denselben R2-Feed selbst aktualisieren, mit einem überarbeiteten Updater-Popup, validierter Download-/Install-Übergabe und Wiederherstellung nach unterbrochenen Anwendungen (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). Die paketierte Linux-GUI ist noch zurückgestellt, während wir die Spur härten; der headless Lebenszyklus und das Nix-Flake funktionieren beide schon heute.</li>
      <li><strong>Italienisches (it) Locale + CJK-Font-Fallback.</strong> Die Oberfläche wird jetzt in 19 Sprachen ausgeliefert, einschließlich Italienisch (#1323), und chinesischer/japanischer/koreanischer Text fällt auf plattformeigene Schriftarten zurück, statt durch lateinische Ersetzung zu gehen (#2227).</li>
      <li><strong>Visuelle Auffrischung von oben bis unten.</strong> Neue App-Icons, Brand-Glyphen, aufgefrischter Wordmark — ein koordinierter Drop, pünktlich zum Cut (#2436).</li>
      </ul>
      <p>Die vollständige Liste umfasst 305 PRs. Die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Release-Notes auf GitHub</a> tragen den Rest.</p>
      <h2>Was du heute damit machen kannst</h2>
      <p>Drei Pfade, je nachdem, wo du anfängst.</p>
      <table><thead><tr><th>Wenn du …</th><th>Hier anfangen</th></tr></thead><tbody><tr><td>Neu bei Open Design</td><td>Lade die Desktop-App herunter und lass sie ein Projekt gegen ein bestehendes Designsystem bootstrappen</td></tr><tr><td>Schon Open Design einsetzt</td><td>Lass das paketierte Auto-Update dich auf 0.8.0 bringen; das In-App-Updater-Popup führt dich durch die validierte Installation</td></tr><tr><td>Ein Plugin baust</td><td>Scaffolde mit <code>od plugin scaffold --id &#x3C;name></code>, validiere mit <code>od plugin validate ./&#x3C;path> --no-daemon</code> und öffne einen PR über denselben OD-Publish-Pfad, der jedes andere Plugin im Marketplace ausliefert</td></tr></tbody></table>
      <p>Wenn du darauf gewartet hast, dass sich der agentennative Loop wie der kanonische Loop anfühlt und nicht wie eine Demo, dann ist dies das Release. Richte Claude Code, Cursor, Codex oder einen der 16 erkannten CLI-Agenten auf dieselbe OD CLI, die die Desktop-App ausliefert, und die beiden Pfade laufen nach dem ersten Prompt zusammen.</p>
      <h2>Was du als Nächstes tun kannst</h2>
      <p>Der schnellste Weg, den Unterschied zwischen 0.7 und 0.8 zu spüren, ist, die Desktop-App zu installieren, sie deinen bestehenden Agenten aufgreifen zu lassen und dasselbe Briefing auszuführen, das du letzten Monat ausgeführt hast. Die Form der Antwort ändert sich.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Desktop herunterladen</a>.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Layer gebaut haben, nicht als Produkt</a> — das längere Manifest hinter der Wette „Engine plus Plugins“, die 0.8.0 endlich einlöst</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Wie man einen Figma-Workflow in ein Open-Design-Plugin portiert</a> — die praktische Version des Loops „Plugins erstellen Plugins“</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Die Open-Source-Alternative zu Claude Design</a> — wo dieses Release in die agentennative Design-Landschaft passt</li>
      </ul>
  fr:
    title: "Open Design 0.8.0 : tout est un plugin"
    summary: "Open Design 0.8.0 n'est pas une release, c'est une refonte. Un petit moteur de plugins, un CLI headless par défaut, des mises à jour automatiques empaquetées sur macOS et Windows, et 149 design systems livrés en sept jours."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), livré le 22 mai 2026, 12h43 UTC. 305 PR de 75 contributeurs en sept jours. C'est la release où nous avons cessé d'essayer d'étendre l'ancienne forme et avons reconstruit le moteur en dessous. L'application desktop que vous téléchargerez aujourd'hui est une fine enveloppe autour d'un CLI vers lequel vous pouvez aussi pointer depuis Claude Code, Cursor ou un bot Slack. Les design systems, les slices, les prototypes, les exports et les anciens workflows à la Figma ne sont plus des fonctionnalités intégrées au moteur — ce sont des plugins, écrits contre un noyau petit et ennuyeux.</p>
      <p>Si vous voulez la version longue, le fil de discussion l'a. Cet article est la version courte : ce qui a changé en coulisses, ce que vous pouvez en faire aujourd'hui, et par où commencer.</p>
      <h2>Pourquoi une refonte, et non une release de plus</h2>
      <p>La ligne 0.7 avait un problème. Chaque workflow vivait à l'intérieur du moteur — imports de design systems, modèles de decks, rendu des slices, le portage Figma, et même l'étape de publication — et ajouter la chose suivante signifiait éditer le noyau. C'est cette dynamique qui a transformé chaque éditeur avant nous en cimetière de plugins : une API de plugins SaaS verrouillée derrière une version, un « creator program » auquel il fallait postuler, un environnement d'exécution qui cassait tous les deux ans.</p>
      <p>Nous aurions pu livrer 0.8 comme une simple release ponctuelle sur cette surface. À la place, nous avons livré la réécriture.</p>
      <p>En dessous, trois choses sont désormais différentes :</p>
      <ul>
      <li>Le moteur est resté petit et ennuyeux. Il exécute des skills, monte des plugins, appelle des adaptateurs d'agents, et s'efface.</li>
      <li>Tout le reste est devenu un plugin. Les design systems, les slices, les prototypes, les exports, les anciens workflows Figma — ils vivent tous dans le même format de plugin, enregistrés via le même manifeste, mis en bac à sable via la même surface.</li>
      <li>Le CLI est le point d'entrée canonique. L'application desktop l'appelle ; le serveur OD MCP aussi ; l'agent dans votre terminal aussi.</li>
      </ul>
      <p>Les 305 PR de cette release sont essentiellement le travail de portage de l'ancien monde dans la nouvelle forme. Certaines d'entre elles sont la nouvelle forme elle-même.</p>
      <h2>Les trois plaques architecturales</h2>
      <p><strong>Tout est un plugin.</strong> La surface du registre de plugins dispose désormais d'un tiroir de détail avec des badges de confiance, une solution de repli de marketplace consciente de la limite de débit GitHub, un pied de page de publication soigné, et une navigation unifiée plugin / intégration (#2087, #2064, #1806, #1849). Publier un plugin crée un vrai dépôt GitHub sous le compte de l'auteur (#2332, #2363), et le chemin de publication du CLI lit la version réelle du manifeste au lieu de la simuler (#1903). Quand le moteur grandit, il grandit ici, en public.</p>
      <p><strong>Headless par défaut.</strong> L'application desktop est désormais une fine enveloppe autour du CLI OD. Le même moteur tourne depuis Claude Code, OpenClaw, Hermes Agent, et des chatbots dans Lark, Discord et Slack. Des profils d'agents CLI personnalisés sont livrés dans cette release (#378), donc vous pouvez brancher un agent CLI arbitraire dans le runtime sans toucher au noyau. Le design cesse d'être un endroit où l'on va et devient une capacité que possèdent vos agents. C'est ce que visait <a href="/blog/why-we-built-open-design-as-a-skill-layer/">le manifeste de la couche de skills</a> ; 0.8.0 est la première release où le chemin de l'agent est le chemin canonique, et non une porte dérobée.</p>
      <p><strong>Les plugins créent des plugins.</strong> Le CLI OD enveloppe le CLI GitHub, donc un agent peut cloner le dépôt, échafauder un plugin, le valider, l'empaqueter et ouvrir une PR — pour vous, ou pour lui-même. Le <a href="/blog/port-figma-workflow-open-design-plugin/">guide pour porter un workflow Figma</a> parcourt le chemin humain ; la version automatisée du même chemin est désormais accessible depuis n'importe quel agent qui a <code>gh</code> et <code>od</code> sur <code>$PATH</code>. Le moteur se développe lui-même, en public, avec vous dans la boucle.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Une tuile de plugin unique glissant dans un emplacement d'amarrage sur un module moteur, sélectionnée dans un cadre vert sur un fond éditorial presque blanc">
        <figcaption>Tout est un plugin — skills, systems, slices et exports s'amarrent tous dans le même petit moteur.</figcaption>
      </figure>
      <h2>Ce qui arrive d'autre dans 0.8.0</h2>
      <p>La release est vaste. Les éléments qui valent la peine d'être mis en avant :</p>
      <ul>
      <li><strong>149 design systems avec des <code>tokens.css</code> structurés + manifestes de composants.</strong> Des fixtures de tokens de marque pour Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor, et 50 autres — chacun livre <code>tokens.css</code> et <code>components.html</code>, servis via un canal de tokens activé par défaut (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). Le <a href="/blog/open-source-alternative-to-claude-design/">raisonnement sur les systems portables</a> est désormais la surface par défaut, et non une porte dérobée.</li>
      <li><strong>Critique Theater jusqu'à la Phase 16.</strong> Ce qui était un seul juge observable dans 0.7.0 est désormais une boucle entièrement instrumentée : enveloppe de client web Phase 9 avec i18n natif de / ja / ko / zh-TW, suite de scène Playwright Phase 11, Phase 12 avec 9 métriques Prometheus + 6 événements de log + span OTel + tableau de bord Grafana, résolveur de déploiement Phase 15, cliquet de déploiement de phase M et <code>/api/critique/conformance</code> en Phase 16 (#1315–#1320, #1338, #1483–#1485, #1499). Lancé en sourdine à M0 par défaut.</li>
      <li><strong>Trois nouveaux fournisseurs de médias.</strong> Génération d'images Leonardo.ai (#1123), audio ElevenLabs (#1384), et TTS SenseAudio plus chat BYOK avec outils image et vidéo (#1633, #2065). Le répartiteur de médias parle désormais compatible OpenAI à tout ce vers quoi vous le pointez.</li>
      <li><strong>Mises à jour automatiques empaquetées sur macOS et Windows.</strong> Première release où les installations empaquetées se mettent à jour de bout en bout sur les deux plateformes via le même flux R2, avec une popup de mise à jour rafraîchie, un relais téléchargement / installation validé, et une récupération après des applications interrompues (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). L'interface graphique empaquetée Linux est encore reportée pendant que nous durcissons cette voie ; le cycle de vie headless et le flake Nix fonctionnent tous deux aujourd'hui.</li>
      <li><strong>Locale italien (it) + repli de polices CJK.</strong> L'UI est désormais livrée en 19 langues dont l'italien (#1323), et le texte chinois / japonais / coréen se replie sur des polices natives de la plateforme au lieu de passer par une substitution latine (#2227).</li>
      <li><strong>Rafraîchissement visuel de haut en bas.</strong> Nouvelles icônes d'application, glyphes de marque, wordmark rafraîchi — un lot coordonné juste à temps pour le cut (#2436).</li>
      </ul>
      <p>La liste complète atteint 305 PR. Les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">notes de version sur GitHub</a> portent le reste.</p>
      <h2>Ce que vous pouvez en faire aujourd'hui</h2>
      <p>Trois chemins, selon votre point de départ.</p>





















      <table><thead><tr><th>Si vous êtes…</th><th>Commencez ici</th></tr></thead><tbody><tr><td>Nouveau venu dans Open Design</td><td>Téléchargez l'application desktop et laissez-la initialiser un projet contre un design system existant</td></tr><tr><td>Déjà sous Open Design</td><td>Laissez la mise à jour automatique empaquetée vous amener à 0.8.0 ; la popup de mise à jour intégrée vous guide à travers l'installation validée</td></tr><tr><td>En train de construire un plugin</td><td>Échafaudez avec <code>od plugin scaffold --id &#x3C;name></code>, validez avec <code>od plugin validate ./&#x3C;path> --no-daemon</code>, et ouvrez une PR via le même chemin de publication OD qui livre tous les autres plugins de la marketplace</td></tr></tbody></table>
      <p>Si vous attendiez que la boucle agent-native ressemble à la boucle canonique plutôt qu'à une démo, c'est cette release. Pointez Claude Code, Cursor, Codex, ou l'un des 16 agents CLI détectés vers le même CLI OD que l'application desktop livre, et les deux chemins convergent après le premier prompt.</p>
      <h2>Quoi faire ensuite</h2>
      <p>Le moyen le plus rapide de ressentir la différence entre 0.7 et 0.8 est d'installer l'application desktop, de la laisser prendre en charge votre agent existant, et de lancer le même brief que vous avez lancé le mois dernier. La forme de la réponse change.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Télécharger le desktop</a>.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a> — le manifeste plus long derrière le pari « moteur plus plugins » que 0.8.0 achève de concrétiser</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Comment porter un workflow Figma vers un plugin Open Design</a> — la version pratique de la boucle « les plugins créent des plugins »</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">L'alternative open-source à Claude Design</a> — où se situe cette release dans le paysage du design agent-native</li>
      </ul>
  ru:
    title: "Open Design 0.8.0: всё является плагином"
    summary: "Open Design 0.8.0 — это не релиз, это перестройка. Небольшой движок плагинов, CLI с headless-режимом по умолчанию, упакованное автообновление в macOS и Windows и 149 дизайн-систем, выпущенных за семь дней."
    bodyHtml: |
      <p>Тег <code>open-design-v0.8.0</code> (<code>c20d156</code>), выпущен 22 мая 2026 года, 12:43 UTC. 305 PR от 75 участников за семь дней. Это релиз, в котором мы перестали пытаться расширять старую форму и перестроили движок под ней. Десктопное приложение, которое вы скачаете сегодня, — это тонкая обёртка вокруг CLI, на который вы также можете указать из Claude Code, Cursor или Slack-бота. Дизайн-системы, слайсы, прототипы, экспорты и старые рабочие процессы в стиле Figma больше не являются функциями, встроенными в движок — это плагины, написанные под небольшое, скучное ядро.</p>
      <p>Если вам нужна длинная версия, она есть в ветке обсуждения. Этот пост — короткая версия: что изменилось под капотом, что вы можете с этим делать сегодня и с чего начать.</p>
      <h2>Почему перестройка, а не очередной релиз</h2>
      <p>У линейки 0.7 была проблема. Каждый рабочий процесс жил внутри движка — импорты дизайн-систем, шаблоны презентаций, рендеринг слайсов, порт из Figma, даже шаг публикации — и добавление следующей вещи означало правку ядра. Именно эта динамика превратила каждый редактор до нас в кладбище плагинов: SaaS API плагинов, заблокированный за версией, «программа для авторов», в которую нужно было подавать заявку, среда выполнения, которая ломалась каждые два года.</p>
      <p>Мы могли бы выпустить 0.8 как очередной точечный релиз на этой поверхности. Вместо этого мы выпустили переписывание.</p>
      <p>Под капотом теперь три вещи стали другими:</p>
      <ul>
      <li>Движок остался небольшим и скучным. Он запускает навыки, монтирует плагины, вызывает адаптеры агентов и уходит с дороги.</li>
      <li>Всё остальное стало плагином. Дизайн-системы, слайсы, прототипы, экспорты, старые рабочие процессы Figma — все они живут в одном формате плагинов, регистрируются через один манифест, изолируются через одну поверхность.</li>
      <li>CLI — это канонический вход. Десктопное приложение вызывает его; так же делает OD MCP-сервер; так же делает агент в вашем терминале.</li>
      </ul>
      <p>305 PR в этом релизе — это в основном работа по переносу старого мира в новую форму. Некоторые из них — это сама новая форма.</p>
      <h2>Три архитектурные плиты</h2>
      <p><strong>Всё является плагином.</strong> Поверхность реестра плагинов теперь имеет выдвижную панель с деталями, бейджи доверия, отказоустойчивый к лимитам GitHub маркетплейс, отполированный футер публикации и единую навигацию плагинов / интеграций (#2087, #2064, #1806, #1849). Публикация плагина создаёт настоящий репозиторий GitHub под аккаунтом автора (#2332, #2363), а путь публикации в CLI читает живую версию манифеста, а не подставляет заглушку (#1903). Когда движок растёт, он растёт здесь, на виду.</p>
      <p><strong>Headless по умолчанию.</strong> Десктопное приложение теперь — тонкая обёртка вокруг OD CLI. Тот же движок запускается из Claude Code, OpenClaw, Hermes Agent и чат-ботов в Lark, Discord и Slack. В этом релизе поставляются кастомные профили CLI-агентов (#378), так что вы можете подключить произвольного CLI-агента к среде выполнения, не трогая ядро. Дизайн перестаёт быть местом, куда вы идёте, и становится возможностью, которой обладают ваши агенты. Именно на это указывал <a href="/blog/why-we-built-open-design-as-a-skill-layer/">манифест слоя навыков</a>; 0.8.0 — первый релиз, где путь агента является каноническим путём, а не боковой дверью.</p>
      <p><strong>Плагины создают плагины.</strong> OD CLI оборачивает GitHub CLI, так что агент может клонировать репозиторий, создать скелет плагина, проверить его, упаковать и открыть PR — за вас или за себя. <a href="/blog/port-figma-workflow-open-design-plugin/">Руководство по переносу рабочего процесса Figma</a> проходит человеческий путь; автоматизированная версия того же пути теперь достижима изнутри любого агента, у которого <code>gh</code> и <code>od</code> есть в <code>$PATH</code>. Движок выращивает сам себя, на виду, с вами в цикле.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Одна плитка плагина вставляется в стыковочный слот на модуле движка, выделенная зелёной рамкой на почти белом редакторском фоне">
        <figcaption>Всё является плагином — навыки, системы, слайсы и экспорты все стыкуются в один небольшой движок.</figcaption>
      </figure>
      <h2>Что ещё появляется в 0.8.0</h2>
      <p>Релиз обширный. Куски, которые стоит вынести вперёд:</p>
      <ul>
      <li><strong>149 дизайн-систем со структурированными <code>tokens.css</code> + манифестами компонентов.</strong> Фикстуры бренд-токенов для Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor и ещё 50 — каждая поставляет <code>tokens.css</code> и <code>components.html</code>, обслуживается через включённый по умолчанию канал токенов (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">Логика переносимой системы</a> теперь является поверхностью по умолчанию, а не боковой дверью.</li>
      <li><strong>Critique Theater вплоть до Phase 16.</strong> То, что в 0.7.0 было одним наблюдаемым судьёй, теперь является полностью инструментированным циклом: Phase 9 — обёртка веб-клиента с нативной i18n de / ja / ko / zh-TW, Phase 11 — набор сцен Playwright, Phase 12 с 9 метриками Prometheus + 6 событиями логов + OTel span + дашбордом Grafana, Phase 15 — резолвер раскатки, Phase 16 — храповик раскатки M-фазы и <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Dark-launch на M0 по умолчанию.</li>
      <li><strong>Три новых медиа-провайдера.</strong> Генерация изображений Leonardo.ai (#1123), аудио ElevenLabs (#1384) и TTS SenseAudio плюс BYOK-чат с инструментами для изображений и видео (#1633, #2065). Медиа-диспетчер теперь говорит на OpenAI-совместимом языке со всем, на что вы его направите.</li>
      <li><strong>Упакованное автообновление в macOS и Windows.</strong> Первый релиз, в котором упакованные установки самообновляются от начала до конца на обеих платформах через один и тот же R2-фид, с обновлённым всплывающим окном апдейтера, проверенной передачей загрузки / установки и восстановлением после прерванных применений (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). Упакованный GUI для Linux всё ещё отложен, пока мы укрепляем эту дорожку; headless-жизненный цикл и Nix flake оба работают уже сегодня.</li>
      <li><strong>Итальянская (it) локаль + резервные CJK-шрифты.</strong> Интерфейс теперь поставляется на 19 языках, включая итальянский (#1323), а китайский / японский / корейский текст откатывается к платформенно-нативным шрифтам вместо латинской подстановки (#2227).</li>
      <li><strong>Визуальное обновление сверху донизу.</strong> Новые иконки приложения, бренд-глифы, обновлённый словесный знак — один скоординированный выпуск как раз к срезу (#2436).</li>
      </ul>
      <p>Полный список насчитывает 305 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Заметки о релизе на GitHub</a> несут остальное.</p>
      <h2>Что с этим делать сегодня</h2>
      <p>Три пути, в зависимости от того, откуда вы начинаете.</p>




















      <table><thead><tr><th>Если вы…</th><th>Начните здесь</th></tr></thead><tbody><tr><td>Новичок в Open Design</td><td>Скачайте десктопное приложение и позвольте ему загрузить проект на основе существующей дизайн-системы</td></tr><tr><td>Уже используете Open Design</td><td>Позвольте упакованному автообновлению поднять вас до 0.8.0; всплывающее окно апдейтера в приложении проведёт вас через проверенную установку</td></tr><tr><td>Создаёте плагин</td><td>Создайте скелет с помощью <code>od plugin scaffold --id &#x3C;name></code>, проверьте с помощью <code>od plugin validate ./&#x3C;path> --no-daemon</code> и откройте PR через тот же путь публикации OD, который выпускает каждый другой плагин в маркетплейсе</td></tr></tbody></table>
      <p>Если вы ждали, когда agent-native цикл начнёт ощущаться каноническим циклом, а не демо, — это тот самый релиз. Направьте Claude Code, Cursor, Codex или любой из 16 обнаруженных CLI-агентов на тот же OD CLI, что поставляет десктопное приложение, и оба пути сходятся после первого промпта.</p>
      <h2>Что делать дальше</h2>
      <p>Самый быстрый способ почувствовать разницу между 0.7 и 0.8 — установить десктопное приложение, позволить ему подхватить вашего существующего агента и запустить тот же бриф, который вы запускали в прошлом месяце. Форма ответа меняется.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Скачать десктоп</a>.</p>
      <h2>Связанное чтение</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не как продукт</a> — более длинный манифест, стоящий за ставкой «движок плюс плагины», которую 0.8.0 окончательно окупает</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Как перенести рабочий процесс Figma в плагин Open Design</a> — практическая версия цикла «плагины создают плагины»</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Альтернатива Claude Design с открытым исходным кодом</a> — где этот релиз вписывается в ландшафт agent-native дизайна</li>
      </ul>
  es:
    title: "Open Design 0.8.0: todo es un plugin"
    summary: "Open Design 0.8.0 no es un lanzamiento, es una reconstrucción. Un pequeño motor de plugins, un CLI headless por defecto, auto-actualización empaquetada en macOS y Windows, y 149 sistemas de diseño publicados en siete días."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), publicado el 22 de mayo de 2026, 12:43 UTC. 305 PRs de 75 colaboradores en siete días. Este es el lanzamiento en el que dejamos de intentar extender la forma antigua y reconstruimos el motor que hay debajo. La aplicación de escritorio que descargarás hoy es un envoltorio fino alrededor de un CLI al que también puedes apuntar desde Claude Code, Cursor o un bot de Slack. Los sistemas de diseño, los slices, los prototipos, las exportaciones y los antiguos flujos de trabajo estilo Figma ya no son funciones incrustadas en el motor: son plugins, escritos contra un núcleo pequeño y aburrido.</p>
      <p>Si quieres la versión larga, el hilo de la discusión la tiene. Esta publicación es la versión corta: qué cambió por dentro, qué puedes hacer con ello hoy y por dónde empezar.</p>
      <h2>Por qué una reconstrucción y no otro lanzamiento</h2>
      <p>La línea 0.7 tenía un problema. Cada flujo de trabajo vivía dentro del motor —importaciones de sistemas de diseño, plantillas de presentación, renderizado de slices, el port de Figma, incluso el paso de publicación— y añadir la siguiente cosa significaba editar el núcleo. Esa es la dinámica que convirtió a todos los editores anteriores a nosotros en un cementerio de plugins: una API de plugins SaaS bloqueada tras una versión, un «programa de creadores» al que tenías que postularte, un runtime que se rompía cada dos años.</p>
      <p>Podríamos haber publicado 0.8 como otra versión menor sobre esa superficie. En cambio, publicamos la reescritura.</p>
      <p>Por debajo, tres cosas son ahora diferentes:</p>
      <ul>
      <li>El motor se mantuvo pequeño y aburrido. Ejecuta skills, monta plugins, llama a adaptadores de agente y se quita del camino.</li>
      <li>Todo lo demás se convirtió en un plugin. Sistemas de diseño, slices, prototipos, exportaciones, los antiguos flujos de trabajo de Figma: todos viven en el mismo formato de plugin, registrados a través del mismo manifiesto, aislados a través de la misma superficie.</li>
      <li>El CLI es el punto de entrada canónico. La aplicación de escritorio lo invoca; también lo hace el servidor MCP de OD; también lo hace el agente en tu terminal.</li>
      </ul>
      <p>Los 305 PRs de este lanzamiento son en su mayoría el trabajo de portar el mundo antiguo a la nueva forma. Algunos de ellos son la nueva forma en sí.</p>
      <h2>Las tres placas arquitectónicas</h2>
      <p><strong>Todo es un plugin.</strong> La superficie del registro de plugins ahora tiene un cajón de detalles con insignias de confianza, un fallback de marketplace consciente del límite de tasa de GitHub, un pie de publicación pulido y una navegación unificada de plugins / integraciones (#2087, #2064, #1806, #1849). Publicar un plugin crea un repositorio real de GitHub bajo la cuenta del autor (#2332, #2363), y la ruta de publicación del CLI lee la versión del manifiesto en vivo en lugar de simularla (#1903). Cuando el motor crece, crece aquí afuera, en público.</p>
      <p><strong>Headless por defecto.</strong> La aplicación de escritorio es ahora un envoltorio fino alrededor del CLI de OD. El mismo motor se ejecuta desde Claude Code, OpenClaw, Hermes Agent y bots de chat en Lark, Discord y Slack. Los perfiles de agente CLI personalizados llegan en este lanzamiento (#378), así que puedes conectar un agente CLI arbitrario al runtime sin tocar el núcleo. El diseño deja de ser un lugar al que vas y se convierte en una capacidad que tus agentes tienen. Esto es a lo que apuntaba <a href="/blog/why-we-built-open-design-as-a-skill-layer/">el manifiesto de la capa de skills</a>; 0.8.0 es el primer lanzamiento en el que la ruta del agente es la ruta canónica, no una puerta lateral.</p>
      <p><strong>Los plugins crean plugins.</strong> El CLI de OD envuelve al CLI de GitHub, así que un agente puede clonar el repositorio, hacer el scaffold de un plugin, validarlo, empaquetarlo y abrir un PR, por ti o por sí mismo. La <a href="/blog/port-figma-workflow-open-design-plugin/">guía sobre cómo portar un flujo de trabajo de Figma</a> recorre la ruta humana; la versión automatizada de esa misma ruta es ahora alcanzable desde dentro de cualquier agente que tenga <code>gh</code> y <code>od</code> en <code>$PATH</code>. El motor se hace crecer a sí mismo, en público, contigo en el bucle.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Una sola pieza de plugin deslizándose en una ranura de acoplamiento de un módulo de motor, seleccionada en un marco verde sobre un fondo editorial casi blanco">
        <figcaption>Todo es un plugin: skills, sistemas, slices y exportaciones se acoplan al mismo motor pequeño.</figcaption>
      </figure>
      <h2>Qué más llega en 0.8.0</h2>
      <p>El lanzamiento es amplio. Las piezas que vale la pena destacar:</p>
      <ul>
      <li><strong>149 sistemas de diseño con <code>tokens.css</code> estructurado + manifiestos de componentes.</strong> Fixtures de tokens de marca para Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor y 50 más: cada uno incluye <code>tokens.css</code> y <code>components.html</code>, servidos a través de un canal de tokens activado por defecto (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). El <a href="/blog/open-source-alternative-to-claude-design/">razonamiento de sistemas portátiles</a> es ahora la superficie por defecto, no una puerta lateral.</li>
      <li><strong>Critique Theater hasta la Fase 16.</strong> Lo que en 0.7.0 era un único juez observable es ahora un bucle totalmente instrumentado: envoltorio de cliente web de la Fase 9 con i18n nativo de / ja / ko / zh-TW, suite de escenario Playwright de la Fase 11, Fase 12 con 9 métricas de Prometheus + 6 eventos de log + span de OTel + dashboard de Grafana, resolver de rollout de la Fase 15, trinquete de rollout de fase M de la Fase 16 y <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Lanzado en oscuro en M0 por defecto.</li>
      <li><strong>Tres nuevos proveedores de medios.</strong> Generación de imágenes de Leonardo.ai (#1123), audio de ElevenLabs (#1384) y TTS de SenseAudio más chat BYOK con herramientas de imagen y video (#1633, #2065). El despachador de medios ahora habla en formato compatible con OpenAI con cualquier cosa a la que lo apuntes.</li>
      <li><strong>Auto-actualización empaquetada en macOS y Windows.</strong> Primer lanzamiento en el que las instalaciones empaquetadas se auto-actualizan de extremo a extremo en ambas plataformas a través del mismo feed de R2, con un popup de actualizador renovado, un traspaso de descarga / instalación validado y recuperación de aplicaciones interrumpidas (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). La GUI empaquetada de Linux sigue aplazada mientras endurecemos ese carril; el ciclo de vida headless y la flake de Nix ambos funcionan hoy.</li>
      <li><strong>Locale italiano (it) + fallback de fuentes CJK.</strong> La UI ahora se ofrece en 19 idiomas, incluido el italiano (#1323), y el texto en chino / japonés / coreano recurre a fuentes nativas de la plataforma en lugar de pasar por una sustitución latina (#2227).</li>
      <li><strong>Renovación visual de arriba a abajo.</strong> Nuevos iconos de aplicación, glifos de marca, wordmark renovado: una entrega coordinada justo a tiempo para el corte (#2436).</li>
      </ul>
      <p>La lista completa llega a 305 PRs. Las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">notas de la versión en GitHub</a> tienen el resto.</p>
      <h2>Qué hacer con ello hoy</h2>
      <p>Tres rutas, según desde dónde empieces.</p>




















      <table><thead><tr><th>Si eres…</th><th>Empieza aquí</th></tr></thead><tbody><tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio y deja que arranque un proyecto contra un sistema de diseño existente</td></tr><tr><td>Ya usas Open Design</td><td>Deja que la auto-actualización empaquetada te lleve a 0.8.0; el popup del actualizador dentro de la app te guía por la instalación validada</td></tr><tr><td>Construyendo un plugin</td><td>Haz el scaffold con <code>od plugin scaffold --id &#x3C;name></code>, valida con <code>od plugin validate ./&#x3C;path> --no-daemon</code>, y abre un PR a través de la misma ruta de publicación de OD que entrega todos los demás plugins del marketplace</td></tr></tbody></table>
      <p>Si has estado esperando a que el bucle agent-native se sienta como el bucle canónico en lugar de una demo, este es el lanzamiento. Apunta Claude Code, Cursor, Codex o cualquiera de los 16 agentes CLI detectados al mismo CLI de OD que trae la aplicación de escritorio, y las dos rutas convergen después del primer prompt.</p>
      <h2>Qué hacer a continuación</h2>
      <p>La forma más rápida de sentir la diferencia entre 0.7 y 0.8 es instalar la aplicación de escritorio, dejar que detecte tu agente existente y ejecutar el mismo brief que ejecutaste el mes pasado. La forma de la respuesta cambia.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Descargar escritorio</a>.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a> — el manifiesto más largo detrás de la apuesta «motor más plugins» que 0.8.0 termina de pagar</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Cómo portar un flujo de trabajo de Figma a un plugin de Open Design</a> — la versión práctica del bucle «los plugins crean plugins»</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">La alternativa de código abierto a Claude Design</a> — dónde encaja este lanzamiento en el panorama del diseño agent-native</li>
      </ul>
  pt-br:
    title: "Open Design 0.8.0: tudo é um plugin"
    summary: "O Open Design 0.8.0 não é uma release, é uma reconstrução. Um pequeno motor de plugins, um CLI headless-by-default, auto-update empacotado no macOS e Windows, e 149 design systems entregues em sete dias."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), entregue em 22 de maio de 2026, 12:43 UTC. 305 PRs de 75 contribuidores em sete dias. Esta é a release em que paramos de tentar estender o formato antigo e reconstruímos o motor por baixo. O app desktop que você vai baixar hoje é um wrapper fino em torno de um CLI para o qual você também pode apontar a partir do Claude Code, do Cursor ou de um bot do Slack. Os design systems, slices, protótipos, exportações e os antigos fluxos no estilo Figma deixaram de ser recursos embutidos no motor — agora são plugins, escritos contra um núcleo pequeno e enfadonho.</p>
      <p>Se você quer a versão longa, a thread de discussão a tem. Este post é a versão curta: o que mudou por baixo, o que você pode fazer com isso hoje e por onde começar.</p>
      <h2>Por que uma reconstrução, não outra release</h2>
      <p>A linha 0.7 tinha um problema. Todo fluxo vivia dentro do motor — importações de design system, templates de deck, renderização de slices, o port do Figma, até a etapa de publicação — e adicionar a próxima coisa significava editar o núcleo. Essa é a dinâmica que transformou todo editor antes de nós em um cemitério de plugins: uma API de plugins SaaS trancada atrás de uma versão, um “programa de criadores” para o qual você tinha que se candidatar, um runtime que quebrava a cada dois anos.</p>
      <p>Poderíamos ter entregado o 0.8 como mais uma release pontual sobre aquele formato. Em vez disso, entregamos a reescrita.</p>
      <p>Por baixo, três coisas estão diferentes agora:</p>
      <ul>
      <li>O motor continuou pequeno e enfadonho. Ele roda skills, monta plugins, chama adaptadores de agente e sai do caminho.</li>
      <li>Todo o resto virou plugin. Design systems, slices, protótipos, exportações, os antigos fluxos do Figma — todos vivem no mesmo formato de plugin, registrados pelo mesmo manifesto, isolados pela mesma superfície.</li>
      <li>O CLI é o ponto de entrada canônico. O app desktop chama nele; o servidor MCP do OD também; o agente no seu terminal também.</li>
      </ul>
      <p>Os 305 PRs nesta release são, em sua maioria, o trabalho de portar o mundo antigo para o novo formato. Alguns deles são o próprio formato novo.</p>
      <h2>As três placas arquiteturais</h2>
      <p><strong>Tudo é um plugin.</strong> A superfície do registro de plugins agora tem uma gaveta de detalhes com selos de confiança, um fallback de marketplace ciente do rate-limit do GitHub, um rodapé de publicação refinado e uma navegação unificada de plugin / integração (#2087, #2064, #1806, #1849). Publicar um plugin cria um repositório GitHub real na conta do autor (#2332, #2363), e o caminho de publicação do CLI lê a versão do manifesto ao vivo em vez de simulá-la (#1903). Quando o motor cresce, ele cresce aqui fora, em público.</p>
      <p><strong>Headless por padrão.</strong> O app desktop agora é um wrapper fino em torno do OD CLI. O mesmo motor roda a partir do Claude Code, do OpenClaw, do Hermes Agent e de chat bots no Lark, Discord e Slack. Perfis personalizados de agente CLI chegam nesta release (#378), então você pode plugar um agente CLI arbitrário no runtime sem tocar no núcleo. Design deixa de ser um lugar aonde você vai e vira uma capacidade que seus agentes têm. Era para isso que <a href="/blog/why-we-built-open-design-as-a-skill-layer/">o manifesto da camada de skills</a> apontava; o 0.8.0 é a primeira release em que o caminho do agente é o caminho canônico, não uma porta lateral.</p>
      <p><strong>Plugins criam plugins.</strong> O OD CLI embrulha o GitHub CLI, então um agente pode clonar o repositório, fazer scaffold de um plugin, validá-lo, empacotá-lo e abrir um PR — por você, ou por si mesmo. O <a href="/blog/port-figma-workflow-open-design-plugin/">guia de como-portar-um-fluxo-do-Figma</a> percorre o caminho humano; a versão automatizada do mesmo caminho agora é alcançável de dentro de qualquer agente que tenha <code>gh</code> e <code>od</code> no <code>$PATH</code>. O motor cresce a si mesmo, em público, com você no loop.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Um único tile de plugin deslizando para um slot de encaixe em um módulo de motor, selecionado em uma moldura verde sobre um fundo editorial quase branco">
        <figcaption>Tudo é um plugin — skills, sistemas, slices e exportações todos encaixam no mesmo pequeno motor.</figcaption>
      </figure>
      <h2>O que mais chega no 0.8.0</h2>
      <p>A release é ampla. As peças que vale a pena destacar:</p>
      <ul>
      <li><strong>149 design systems com <code>tokens.css</code> estruturado + manifestos de componentes.</strong> Fixtures de brand-token para Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor e mais 50 — cada um entrega <code>tokens.css</code> e <code>components.html</code>, servidos por um canal de tokens ligado por padrão (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). O <a href="/blog/open-source-alternative-to-claude-design/">raciocínio de sistema portátil</a> agora é a superfície padrão, não uma porta lateral.</li>
      <li><strong>Critique Theater até a Fase 16.</strong> O que era um único juiz observável no 0.7.0 agora é um loop totalmente instrumentado: Fase 9 com wrapper de web client com i18n nativo de / ja / ko / zh-TW, Fase 11 com suite de stage Playwright, Fase 12 com 9 métricas Prometheus + 6 eventos de log + span OTel + dashboard Grafana, Fase 15 com resolver de rollout, Fase 16 com catraca de rollout de fase-M e <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Lançado em dark-launch no M0 por padrão.</li>
      <li><strong>Três novos provedores de mídia.</strong> Geração de imagem Leonardo.ai (#1123), áudio ElevenLabs (#1384) e TTS SenseAudio, mais chat BYOK com ferramentas de imagem e vídeo (#1633, #2065). O despachante de mídia agora fala compatível com OpenAI com qualquer coisa para a qual você o aponte.</li>
      <li><strong>Auto-update empacotado no macOS e Windows.</strong> Primeira release em que instalações empacotadas se autoatualizam de ponta a ponta nas duas plataformas pelo mesmo feed R2, com um popup de atualização renovado, handoff validado de download / instalação e recuperação de aplicações interrompidas (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). A GUI empacotada para Linux ainda está adiada enquanto endurecemos essa via; o ciclo de vida headless e o flake Nix ambos funcionam hoje.</li>
      <li><strong>Locale italiano (it) + fallback de fonte CJK.</strong> A UI agora chega em 19 idiomas, incluindo italiano (#1323), e textos em chinês / japonês / coreano recorrem a fontes nativas da plataforma em vez de passar por substituição latina (#2227).</li>
      <li><strong>Renovação visual de cima a baixo.</strong> Novos ícones do app, glifos de marca, wordmark renovado — um lançamento coordenado a tempo do corte (#2436).</li>
      </ul>
      <p>A lista completa chega a 305 PRs. As <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">notas de release no GitHub</a> trazem o resto.</p>
      <h2>O que fazer com isso hoje</h2>
      <p>Três caminhos, dependendo de onde você começa.</p>





















      <table><thead><tr><th>Se você é…</th><th>Comece aqui</th></tr></thead><tbody><tr><td>Novo no Open Design</td><td>Baixe o app desktop e deixe-o inicializar um projeto contra um design system existente</td></tr><tr><td>Já rodando o Open Design</td><td>Deixe o auto-update empacotado levá-lo ao 0.8.0; o popup do atualizador no app guia você pela instalação validada</td></tr><tr><td>Construindo um plugin</td><td>Faça scaffold com <code>od plugin scaffold --id &#x3C;name></code>, valide com <code>od plugin validate ./&#x3C;path> --no-daemon</code> e abra um PR pelo mesmo caminho de publicação do OD que entrega todos os outros plugins no marketplace</td></tr></tbody></table>
      <p>Se você estava esperando o loop agent-native parecer o loop canônico em vez de uma demo, esta é a release. Aponte o Claude Code, Cursor, Codex ou qualquer um dos 16 agentes CLI detectados para o mesmo OD CLI que o app desktop entrega, e os dois caminhos convergem após o primeiro prompt.</p>
      <h2>O que fazer a seguir</h2>
      <p>O jeito mais rápido de sentir a diferença entre o 0.7 e o 0.8 é instalar o app desktop, deixá-lo pegar seu agente existente e rodar o mesmo briefing que você rodou mês passado. O formato da resposta muda.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Baixe o desktop</a>.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a> — o manifesto mais longo por trás da aposta de “motor mais plugins” que o 0.8.0 termina de quitar</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Como portar um fluxo do Figma para um plugin do Open Design</a> — a versão prática do loop “plugins criam plugins”</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">A alternativa open-source ao Claude Design</a> — onde esta release se encaixa no cenário de design agent-native</li>
      </ul>
  it:
    title: "Open Design 0.8.0: tutto è un plugin"
    summary: "Open Design 0.8.0 non è una release, è una ricostruzione. Un piccolo motore di plugin, una CLI headless di default, l'aggiornamento automatico pacchettizzato su macOS e Windows, e 149 design system rilasciati in sette giorni."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), rilasciato il 22 maggio 2026, 12:43 UTC. 305 PR da 75 contributori in sette giorni. Questa è la release in cui abbiamo smesso di provare a estendere la vecchia forma e abbiamo ricostruito il motore sottostante. L'app desktop che scaricherai oggi è un sottile wrapper attorno a una CLI a cui puoi puntare anche da Claude Code, Cursor o un bot Slack. I design system, gli slice, i prototipi, gli export e i vecchi flussi di lavoro in stile Figma non sono più funzionalità incorporate nel motore: sono plugin, scritti contro un core piccolo e noioso.</p>
      <p>Se vuoi la versione lunga, il thread di discussione ce l'ha. Questo articolo è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>
      <h2>Perché una ricostruzione, non un'altra release</h2>
      <p>La linea 0.7 aveva un problema. Ogni flusso di lavoro viveva dentro il motore — import di design system, template di deck, rendering degli slice, il port di Figma, persino il passo di pubblicazione — e aggiungere la cosa successiva significava modificare il core. Quella è la dinamica che ha trasformato ogni editor prima di noi in un cimitero di plugin: un'API di plugin SaaS bloccata dietro una versione, un "programma per creatori" a cui dovevi candidarti, un runtime che si rompeva ogni due anni.</p>
      <p>Avremmo potuto rilasciare 0.8 come un'altra release minore su quella superficie. Invece, abbiamo rilasciato la riscrittura.</p>
      <p>Sotto, tre cose sono diverse ora:</p>
      <ul>
      <li>Il motore è rimasto piccolo e noioso. Esegue le skill, monta i plugin, chiama gli adattatori degli agenti e si toglie di mezzo.</li>
      <li>Tutto il resto è diventato un plugin. Design system, slice, prototipi, export, i vecchi flussi di lavoro Figma — vivono tutti nello stesso formato di plugin, registrati attraverso lo stesso manifest, isolati in sandbox attraverso la stessa superficie.</li>
      <li>La CLI è il punto di ingresso canonico. L'app desktop la chiama; così fa il server MCP di OD; così fa l'agente nel tuo terminale.</li>
      </ul>
      <p>Le 305 PR in questa release sono per lo più il lavoro di portare il vecchio mondo nella nuova forma. Alcune di esse sono la nuova forma stessa.</p>
      <h2>Le tre lastre architetturali</h2>
      <p><strong>Tutto è un plugin.</strong> La superficie del registro dei plugin ora ha un cassetto di dettaglio con badge di fiducia, un fallback del marketplace consapevole dei limiti di frequenza di GitHub, un footer di pubblicazione curato e una navigazione unificata plugin / integrazione (#2087, #2064, #1806, #1849). Pubblicare un plugin crea un vero repository GitHub sotto l'account dell'autore (#2332, #2363), e il percorso di pubblicazione della CLI legge la versione del manifest dal vivo invece di farne uno stub (#1903). Quando il motore cresce, cresce qui fuori, in pubblico.</p>
      <p><strong>Headless di default.</strong> L'app desktop è ora un sottile wrapper attorno alla CLI di OD. Lo stesso motore gira da Claude Code, OpenClaw, Hermes Agent e dai chat bot in Lark, Discord e Slack. I profili di agente CLI personalizzati arrivano in questa release (#378), così puoi collegare un agente CLI arbitrario al runtime senza toccare il core. Il design smette di essere un posto dove vai e diventa una capacità che i tuoi agenti hanno. Questo è ciò a cui puntava <a href="/blog/why-we-built-open-design-as-a-skill-layer/">il manifesto del livello di skill</a>; 0.8.0 è la prima release in cui il percorso dell'agente è il percorso canonico, non una porta secondaria.</p>
      <p><strong>I plugin creano plugin.</strong> La CLI di OD avvolge la CLI di GitHub, così un agente può clonare il repository, fare lo scaffold di un plugin, validarlo, impacchettarlo e aprire una PR — per te, o per sé stesso. La <a href="/blog/port-figma-workflow-open-design-plugin/">guida su come portare un flusso di lavoro Figma</a> percorre il percorso umano; la versione automatizzata dello stesso percorso è ora raggiungibile dall'interno di qualsiasi agente che abbia <code>gh</code> e <code>od</code> nel <code>$PATH</code>. Il motore cresce da sé, in pubblico, con te nel ciclo.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Una singola tessera di plugin che scivola in uno slot di aggancio su un modulo del motore, selezionata in una cornice verde su uno sfondo editoriale quasi bianco">
        <figcaption>Tutto è un plugin: skill, sistemi, slice ed export si agganciano tutti allo stesso piccolo motore.</figcaption>
      </figure>
      <h2>Cos'altro arriva in 0.8.0</h2>
      <p>La release è ampia. I pezzi che vale la pena portare in primo piano:</p>
      <ul>
      <li><strong>149 design system con <code>tokens.css</code> strutturato + manifest di componenti.</strong> Fixture di token di brand per Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor e altri 50 — ognuno rilascia <code>tokens.css</code> e <code>components.html</code>, serviti attraverso un canale di token attivo di default (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). Il <a href="/blog/open-source-alternative-to-claude-design/">ragionamento sui sistemi portabili</a> è ora la superficie predefinita, non una porta secondaria.</li>
      <li><strong>Critique Theater fino alla Fase 16.</strong> Quello che era un singolo giudice osservabile in 0.7.0 è ora un ciclo completamente strumentato: wrapper del client web di Fase 9 con i18n nativo de / ja / ko / zh-TW, suite di stage Playwright di Fase 11, Fase 12 con 9 metriche Prometheus + 6 eventi di log + span OTel + dashboard Grafana, resolver di rollout di Fase 15, ratchet di rollout della fase M e <code>/api/critique/conformance</code> di Fase 16 (#1315–#1320, #1338, #1483–#1485, #1499). Lanciato in dark a M0 di default.</li>
      <li><strong>Tre nuovi provider di media.</strong> Generazione di immagini Leonardo.ai (#1123), audio ElevenLabs (#1384) e TTS SenseAudio più chat BYOK con strumenti per immagini e video (#1633, #2065). Il dispatcher di media ora parla in modo compatibile con OpenAI a qualsiasi cosa gli punti.</li>
      <li><strong>Aggiornamento automatico pacchettizzato su macOS e Windows.</strong> Prima release in cui le installazioni pacchettizzate si auto-aggiornano dall'inizio alla fine su entrambe le piattaforme attraverso lo stesso feed R2, con un popup di aggiornamento rinnovato, un passaggio di download / installazione validato e il recupero da applicazioni interrotte (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). La GUI pacchettizzata per Linux è ancora rinviata mentre rafforziamo la corsia; il ciclo di vita headless e il flake Nix funzionano entrambi oggi.</li>
      <li><strong>Locale italiano (it) + fallback dei font CJK.</strong> La UI ora arriva in 19 lingue, incluso l'italiano (#1323), e il testo cinese / giapponese / coreano ripiega sui font nativi della piattaforma invece di passare per la sostituzione latina (#2227).</li>
      <li><strong>Rinnovamento visivo da cima a fondo.</strong> Nuove icone dell'app, glifi di brand, wordmark rinnovato — un unico rilascio coordinato in tempo per il cut (#2436).</li>
      </ul>
      <p>La lista completa arriva a 305 PR. Le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">note di rilascio su GitHub</a> contengono il resto.</p>
      <h2>Cosa farci oggi</h2>
      <p>Tre percorsi, a seconda di dove inizi.</p>




      <table><thead><tr><th>Se sei…</th><th>Inizia da qui</th></tr></thead><tbody><tr><td>Nuovo a Open Design</td><td>Scarica l'app desktop e lasciale avviare un progetto su un design system esistente</td></tr><tr><td>Già in esecuzione con Open Design</td><td>Lascia che l'aggiornamento automatico pacchettizzato ti porti a 0.8.0; il popup dell'updater in-app ti guida attraverso l'installazione validata</td></tr><tr><td>Stai costruendo un plugin</td><td>Fai lo scaffold con <code>od plugin scaffold --id &#x3C;name></code>, valida con <code>od plugin validate ./&#x3C;path> --no-daemon</code>, e apri una PR attraverso lo stesso percorso di pubblicazione di OD che rilascia ogni altro plugin nel marketplace</td></tr></tbody></table>
      <p>Se hai aspettato che il ciclo agent-native sembrasse il ciclo canonico anziché una demo, questa è la release. Punta Claude Code, Cursor, Codex o uno qualsiasi dei 16 agenti CLI rilevati alla stessa CLI di OD con cui arriva l'app desktop, e i due percorsi convergono dopo il primo prompt.</p>
      <h2>Cosa fare dopo</h2>
      <p>Il modo più veloce per sentire la differenza tra 0.7 e 0.8 è installare l'app desktop, lasciarle rilevare il tuo agente esistente, ed eseguire lo stesso brief che hai eseguito il mese scorso. La forma della risposta cambia.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Scarica desktop</a>.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>: il manifesto più lungo dietro la scommessa "motore più plugin" che 0.8.0 finisce di ripagare</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Come portare un flusso di lavoro Figma in un plugin Open Design</a>: la versione pratica del ciclo "i plugin creano plugin"</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">L'alternativa open-source a Claude Design</a>: dove si colloca questa release nel panorama del design agent-native</li>
      </ul>
  vi:
    title: "Open Design 0.8.0: mọi thứ đều là plugin"
    summary: "Open Design 0.8.0 không phải là một bản phát hành, nó là một cuộc xây lại. Một engine plugin nhỏ, một CLI mặc định headless, tự động cập nhật đóng gói trên macOS và Windows, và 149 design system được ship trong bảy ngày."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), ship ngày 22 tháng 5 năm 2026, 12:43 UTC. 305 PR từ 75 người đóng góp trong bảy ngày. Đây là bản phát hành mà chúng tôi thôi cố mở rộng hình dạng cũ và xây lại engine bên dưới. Ứng dụng desktop bạn tải hôm nay là một lớp bọc mỏng quanh một CLI mà bạn cũng có thể trỏ tới từ Claude Code, Cursor, hay một Slack bot. Các design system, slice, prototype, export, và các quy trình kiểu Figma cũ không còn là các tính năng nung sẵn vào engine — chúng là các plugin, được viết dựa trên một lõi nhỏ, nhàm chán.</p>
      <p>Nếu bạn muốn phiên bản dài, luồng thảo luận có nó. Bài viết này là phiên bản ngắn: cái gì đã thay đổi bên dưới, bạn có thể làm gì với nó hôm nay, và bắt đầu từ đâu.</p>
      <h2>Vì sao xây lại, không phải một bản phát hành nữa</h2>
      <p>Dòng 0.7 có một vấn đề. Mọi quy trình đều nằm bên trong engine — nhập design-system, template slide, render slice, port Figma, thậm chí bước xuất bản — và thêm thứ tiếp theo nghĩa là phải sửa lõi. Đó là cái động lực biến mọi trình biên tập trước chúng tôi thành một nghĩa địa plugin: một API plugin SaaS khóa sau một phiên bản, một “chương trình creator” bạn phải xin tham gia, một runtime hỏng cứ hai năm một lần.</p>
      <p>Chúng tôi đã có thể ship 0.8 như một bản phát hành điểm nữa trên bề mặt đó. Thay vào đó, chúng tôi ship bản viết lại.</p>
      <p>Bên dưới, ba thứ giờ đã khác:</p>
      <ul>
      <li>Engine giữ nhỏ và nhàm chán. Nó chạy các skill, gắn các plugin, gọi các adapter agent, và đứng ngoài lề.</li>
      <li>Mọi thứ khác trở thành một plugin. Design system, slice, prototype, export, các quy trình Figma cũ — tất cả đều nằm trong cùng định dạng plugin, đăng ký qua cùng manifest, sandbox qua cùng bề mặt.</li>
      <li>CLI là điểm vào chuẩn tắc. Ứng dụng desktop gọi vào nó; máy chủ OD MCP cũng vậy; agent trong terminal của bạn cũng vậy.</li>
      </ul>
      <p>305 PR trong bản phát hành này phần lớn là công việc chuyển thế giới cũ vào hình dạng mới. Một số trong chúng là chính cái hình dạng mới.</p>
      <h2>Ba mảng kiến trúc</h2>
      <p><strong>Mọi thứ đều là plugin.</strong> Bề mặt registry plugin giờ có một ngăn chi tiết với các huy hiệu tin cậy, một phương án dự phòng marketplace nhận biết giới hạn tốc độ GitHub, một chân trang xuất bản được trau chuốt, và một thanh điều hướng plugin / tích hợp thống nhất (#2087, #2064, #1806, #1849). Xuất bản một plugin tạo ra một repo GitHub thực dưới tài khoản của tác giả (#2332, #2363), và đường xuất bản CLI đọc phiên bản manifest trực tiếp thay vì giả lập nó (#1903). Khi engine lớn lên, nó lớn ra ngoài đây, công khai.</p>
      <p><strong>Headless theo mặc định.</strong> Ứng dụng desktop giờ là một lớp bọc mỏng quanh OD CLI. Cùng engine đó chạy từ Claude Code, OpenClaw, Hermes Agent, và các chat bot trong Lark, Discord và Slack. Các hồ sơ agent CLI tùy chỉnh được ship trong bản phát hành này (#378), nên bạn có thể cắm một agent CLI tùy ý vào runtime mà không động đến lõi. Thiết kế thôi là một nơi bạn đi tới và trở thành một năng lực mà các agent của bạn có. Đây là điều mà <a href="/blog/why-we-built-open-design-as-a-skill-layer/">tuyên ngôn lớp skill</a> đã chỉ tới; 0.8.0 là bản phát hành đầu tiên nơi đường agent là đường chuẩn tắc, không phải một cửa hông.</p>
      <p><strong>Plugin tạo ra plugin.</strong> OD CLI bọc GitHub CLI, nên một agent có thể clone repo, scaffold một plugin, kiểm định nó, đóng gói nó, và mở một PR — cho bạn, hoặc cho chính nó. <a href="/blog/port-figma-workflow-open-design-plugin/">Hướng dẫn cách-chuyển-một-quy-trình-Figma</a> đi qua đường của con người; phiên bản tự động của cùng đường đó giờ có thể tiếp cận từ bên trong bất kỳ agent nào có <code>gh</code> và <code>od</code> trên <code>$PATH</code>. Engine tự lớn lên, công khai, với bạn trong vòng lặp.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Một ô plugin duy nhất trượt vào một khe cắm trên một module engine, được chọn trong khung xanh lá trên nền biên tập gần như trắng">
        <figcaption>Mọi thứ đều là plugin — các skill, system, slice và export đều cắm vào cùng một engine nhỏ.</figcaption>
      </figure>
      <h2>Còn gì nữa đáp xuống trong 0.8.0</h2>
      <p>Bản phát hành này rộng. Các mảnh đáng kéo lên trước:</p>
      <ul>
      <li><strong>149 design system với <code>tokens.css</code> có cấu trúc + manifest component.</strong> Các fixture token thương hiệu cho Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor, và 50 cái nữa — mỗi cái ship <code>tokens.css</code> và <code>components.html</code>, được phục vụ qua một kênh token bật theo mặc định (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">Lý lẽ về system di động</a> giờ là bề mặt mặc định, không phải một cửa hông.</li>
      <li><strong>Critique Theater qua Phase 16.</strong> Cái từng là một bộ phán xét quan sát được đơn lẻ trong 0.7.0 giờ là một vòng lặp được trang bị đầy đủ: Phase 9 lớp bọc web client với i18n gốc de / ja / ko / zh-TW, bộ stage Playwright Phase 11, Phase 12 với 9 metric Prometheus + 6 sự kiện log + span OTel + dashboard Grafana, bộ phân giải rollout Phase 15, cơ chế tăng dần rollout M-phase Phase 16 và <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Ra mắt âm thầm ở M0 theo mặc định.</li>
      <li><strong>Ba nhà cung cấp media mới.</strong> Tạo ảnh Leonardo.ai (#1123), âm thanh ElevenLabs (#1384), và TTS SenseAudio cộng với chat BYOK với các công cụ ảnh và video (#1633, #2065). Bộ điều phối media giờ nói tương thích OpenAI với bất cứ thứ gì bạn trỏ tới.</li>
      <li><strong>Tự động cập nhật đóng gói trên macOS và Windows.</strong> Bản phát hành đầu tiên nơi các bản cài đóng gói tự cập nhật từ đầu đến cuối trên cả hai nền tảng qua cùng feed R2, với một popup cập nhật được làm mới, việc bàn giao tải / cài được kiểm định, và khôi phục từ các lần áp dụng bị gián đoạn (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). GUI đóng gói cho Linux vẫn bị hoãn trong khi chúng tôi củng cố làn đường; vòng đời headless và Nix flake đều hoạt động hôm nay.</li>
      <li><strong>Locale tiếng Ý (it) + dự phòng font CJK.</strong> UI giờ ship trong 19 ngôn ngữ bao gồm tiếng Ý (#1323), và văn bản tiếng Trung / Nhật / Hàn dự phòng về các font gốc nền tảng thay vì đi qua thay thế Latin (#2227).</li>
      <li><strong>Làm mới thị giác từ trên xuống dưới.</strong> Các icon ứng dụng mới, các glyph thương hiệu, wordmark được làm mới — một đợt thả phối hợp kịp cho lần cắt phiên bản (#2436).</li>
      </ul>
      <p>Danh sách đầy đủ lên tới 305 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Ghi chú phát hành trên GitHub</a> mang theo phần còn lại.</p>
      <h2>Làm gì với nó hôm nay</h2>
      <p>Ba con đường, tùy bạn bắt đầu từ đâu.</p>


















      <table><thead><tr><th>Nếu bạn…</th><th>Bắt đầu ở đây</th></tr></thead><tbody><tr><td>Mới với Open Design</td><td>Tải ứng dụng desktop và để nó khởi tạo một dự án dựa trên một design system có sẵn</td></tr><tr><td>Đã đang chạy Open Design</td><td>Để tự động cập nhật đóng gói đưa bạn lên 0.8.0; popup cập nhật trong ứng dụng dẫn bạn qua bản cài được kiểm định</td></tr><tr><td>Đang xây một plugin</td><td>Scaffold bằng <code>od plugin scaffold --id &#x3C;name></code>, kiểm định bằng <code>od plugin validate ./&#x3C;path> --no-daemon</code>, và mở một PR qua cùng đường xuất bản OD vốn ship mọi plugin khác trong marketplace</td></tr></tbody></table>
      <p>Nếu bạn đã chờ vòng lặp agent-native cảm giác như vòng lặp chuẩn tắc thay vì một bản demo, thì đây là bản phát hành đó. Trỏ Claude Code, Cursor, Codex, hay bất kỳ agent nào trong 16 agent CLI được phát hiện tới cùng OD CLI mà ứng dụng desktop ship kèm, và hai con đường hội tụ sau prompt đầu tiên.</p>
      <h2>Làm gì tiếp theo</h2>
      <p>Cách nhanh nhất để cảm nhận sự khác biệt giữa 0.7 và 0.8 là cài ứng dụng desktop, để nó nhận agent có sẵn của bạn, và chạy cùng brief bạn đã chạy tháng trước. Hình dạng của câu trả lời thay đổi.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Tải desktop</a>.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> — tuyên ngôn dài hơn đằng sau canh bạc “engine cộng plugin” mà 0.8.0 hoàn tất trả về</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Cách chuyển một quy trình Figma thành một plugin Open Design</a> — phiên bản thực hành của vòng lặp “plugin tạo ra plugin”</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Giải pháp thay thế mã nguồn mở cho Claude Design</a> — nơi bản phát hành này khớp vào bối cảnh thiết kế agent-native</li>
      </ul>
  pl:
    title: "Open Design 0.8.0: wszystko jest wtyczką"
    summary: "Open Design 0.8.0 to nie wydanie, to przebudowa. Mały silnik wtyczek, CLI domyślnie headless, spakowana automatyczna aktualizacja na macOS i Windows oraz 149 systemów projektowych dostarczonych w siedem dni."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), wydany 22 maja 2026, 12:43 UTC. 305 PR-ów od 75 kontrybutorów w siedem dni. To wydanie, w którym przestaliśmy próbować rozszerzać stary kształt i przebudowaliśmy silnik pod spodem. Aplikacja desktopowa, którą dziś pobierzesz, to cienki wrapper wokół CLI, na które możesz też wskazać z Claude Code, Cursor lub bota Slack. Systemy projektowe, slice'y, prototypy, eksporty i stare workflow w stylu Figma nie są już funkcjami wpieczonymi w silnik — to wtyczki, napisane wobec małego, nudnego rdzenia.</p>
      <p>Jeśli chcesz długiej wersji, ma ją wątek dyskusji. Ten wpis to wersja krótka: co zmieniło się pod maską, co możesz z tym zrobić dziś i od czego zacząć.</p>
      <h2>Dlaczego przebudowa, a nie kolejne wydanie</h2>
      <p>Linia 0.7 miała problem. Każdy workflow żył wewnątrz silnika — importy systemów projektowych, szablony prezentacji, renderowanie slice'ów, port Figmy, nawet krok publikowania — a dodanie kolejnej rzeczy oznaczało edycję rdzenia. To ta dynamika, która każdy edytor przed nami zamieniła w cmentarzysko wtyczek: API wtyczek SaaS zamknięte za wersją, „program twórcy”, do którego trzeba było aplikować, środowisko uruchomieniowe psujące się co dwa lata.</p>
      <p>Moglibyśmy wydać 0.8 jako kolejne pomniejsze wydanie na tej powierzchni. Zamiast tego wydaliśmy przepisanie.</p>
      <p>Pod spodem trzy rzeczy są teraz inne:</p>
      <ul>
      <li>Silnik pozostał mały i nudny. Uruchamia umiejętności, montuje wtyczki, wywołuje adaptery agentów i schodzi z drogi.</li>
      <li>Wszystko inne stało się wtyczką. Systemy projektowe, slice'y, prototypy, eksporty, stare workflow Figmy — wszystkie żyją w tym samym formacie wtyczki, rejestrowane przez ten sam manifest, izolowane w piaskownicy przez tę samą powierzchnię.</li>
      <li>CLI to kanoniczny punkt wejścia. Aplikacja desktopowa wywołuje je; tak samo robi serwer OD MCP; tak samo agent w Twoim terminalu.</li>
      </ul>
      <p>305 PR-ów w tym wydaniu to w większości praca nad przeniesieniem starego świata do nowego kształtu. Niektóre z nich to sam nowy kształt.</p>
      <h2>Trzy płyty architektoniczne</h2>
      <p><strong>Wszystko jest wtyczką.</strong> Powierzchnia rejestru wtyczek ma teraz szufladę szczegółów z odznakami zaufania, awaryjny mechanizm marketplace świadomy limitu zapytań GitHub, dopracowaną stopkę publikowania oraz ujednoliconą nawigację wtyczki / integracje (#2087, #2064, #1806, #1849). Opublikowanie wtyczki tworzy prawdziwe repozytorium GitHub na koncie autora (#2332, #2363), a ścieżka publikowania CLI czyta wersję z żywego manifestu zamiast ją zaślepiać (#1903). Gdy silnik rośnie, rośnie tutaj, publicznie.</p>
      <p><strong>Domyślnie headless.</strong> Aplikacja desktopowa to teraz cienki wrapper wokół OD CLI. Ten sam silnik działa z Claude Code, OpenClaw, Hermes Agent oraz botów czatu w Lark, Discord i Slack. Niestandardowe profile agentów CLI pojawiają się w tym wydaniu (#378), więc możesz podłączyć dowolnego agenta CLI do środowiska uruchomieniowego bez dotykania rdzenia. Projektowanie przestaje być miejscem, do którego idziesz, i staje się zdolnością, którą mają Twoi agenci. Na to wskazywał <a href="/blog/why-we-built-open-design-as-a-skill-layer/">manifest warstwy umiejętności</a>; 0.8.0 to pierwsze wydanie, w którym ścieżka agenta jest ścieżką kanoniczną, a nie bocznymi drzwiami.</p>
      <p><strong>Wtyczki tworzą wtyczki.</strong> OD CLI opakowuje GitHub CLI, więc agent może sklonować repozytorium, wygenerować szkielet wtyczki, zwalidować ją, spakować i otworzyć PR — dla Ciebie albo dla siebie. <a href="/blog/port-figma-workflow-open-design-plugin/">Przewodnik jak przenieść workflow z Figma</a> omawia ścieżkę ludzką; zautomatyzowana wersja tej samej ścieżki jest teraz osiągalna z wnętrza dowolnego agenta, który ma <code>gh</code> i <code>od</code> w <code>$PATH</code>. Silnik rozwija sam siebie, publicznie, z Tobą w pętli.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Pojedynczy kafelek wtyczki wsuwający się do slotu dokowania na module silnika, zaznaczony zieloną ramką na niemal białym, redakcyjnym tle">
        <figcaption>Wszystko jest wtyczką — umiejętności, systemy, slice'y i eksporty wszystkie dokują do tego samego małego silnika.</figcaption>
      </figure>
      <h2>Co jeszcze ląduje w 0.8.0</h2>
      <p>Wydanie jest szerokie. Elementy warte wysunięcia na pierwszy plan:</p>
      <ul>
      <li><strong>149 systemów projektowych ze strukturalnym <code>tokens.css</code> + manifestami komponentów.</strong> Fixture'y tokenów marki dla Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor i 50 kolejnych — każdy dostarcza <code>tokens.css</code> i <code>components.html</code>, serwowane przez domyślnie włączony kanał tokenów (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">Rozumowanie o systemach przenośnych</a> jest teraz powierzchnią domyślną, a nie bocznymi drzwiami.</li>
      <li><strong>Critique Theater do Fazy 16.</strong> To, co w 0.7.0 było pojedynczym obserwowalnym sędzią, jest teraz w pełni oprzyrządowaną pętlą: Faza 9 wrapper klienta webowego z natywnym i18n de / ja / ko / zh-TW, Faza 11 zestaw scen Playwright, Faza 12 z 9 metrykami Prometheus + 6 zdarzeniami logu + spanem OTel + dashboardem Grafana, Faza 15 resolver wdrożeń, Faza 16 zapadka wdrożenia fazy M oraz <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Dark-launched na M0 domyślnie.</li>
      <li><strong>Trzej nowi dostawcy mediów.</strong> Generowanie obrazów Leonardo.ai (#1123), audio ElevenLabs (#1384) oraz TTS SenseAudio plus czat BYOK z narzędziami do obrazu i wideo (#1633, #2065). Dyspozytor mediów mówi teraz w protokole zgodnym z OpenAI do wszystkiego, na co go wskażesz.</li>
      <li><strong>Spakowana automatyczna aktualizacja na macOS i Windows.</strong> Pierwsze wydanie, w którym spakowane instalacje aktualizują się same od początku do końca na obu platformach przez ten sam feed R2, z odświeżonym popupem aktualizatora, zwalidowanym przekazaniem pobierania / instalacji oraz odzyskiwaniem po przerwanych aplikacjach (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). Spakowane GUI dla Linuksa jest wciąż odroczone, gdy hartujemy ten tor; cykl życia headless oraz Nix flake działają dziś oba.</li>
      <li><strong>Lokalizacja włoska (it) + awaryjne czcionki CJK.</strong> UI dostarcza się teraz w 19 językach, w tym po włosku (#1323), a tekst chiński / japoński / koreański używa awaryjnie czcionek natywnych dla platformy zamiast przechodzić przez substytucję łacińską (#2227).</li>
      <li><strong>Odświeżenie wizualne od góry do dołu.</strong> Nowe ikony aplikacji, glify marki, odświeżony wordmark — jeden skoordynowany drop na czas cięcia (#2436).</li>
      </ul>
      <p>Pełna lista liczy 305 PR-ów. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Notatki o wydaniu na GitHub</a> niosą resztę.</p>
      <h2>Co z tym zrobić dziś</h2>
      <p>Trzy ścieżki, zależnie od tego, gdzie zaczynasz.</p>





















      <table><thead><tr><th>Jeśli jesteś…</th><th>Zacznij tutaj</th></tr></thead><tbody><tr><td>Nowy w Open Design</td><td>Pobierz aplikację desktopową i pozwól jej zbootstrapować projekt wobec istniejącego systemu projektowego</td></tr><tr><td>Już używasz Open Design</td><td>Pozwól spakowanej automatycznej aktualizacji doprowadzić Cię do 0.8.0; popup aktualizatora w aplikacji przeprowadzi Cię przez zwalidowaną instalację</td></tr><tr><td>Budujesz wtyczkę</td><td>Wygeneruj szkielet poleceniem <code>od plugin scaffold --id &#x3C;name></code>, zwaliduj poleceniem <code>od plugin validate ./&#x3C;path> --no-daemon</code> i otwórz PR przez tę samą ścieżkę publikowania OD, która dostarcza każdą inną wtyczkę w marketplace</td></tr></tbody></table>
      <p>Jeśli czekałeś, aż pętla agent-native zacznie sprawiać wrażenie pętli kanonicznej zamiast demo, to jest to wydanie. Wskaż Claude Code, Cursor, Codex lub dowolnemu z 16 wykrytych agentów CLI to samo OD CLI, z którym dostarcza się aplikacja desktopowa, a obie ścieżki zbiegają się po pierwszym prompcie.</p>
      <h2>Co robić dalej</h2>
      <p>Najszybszy sposób, by poczuć różnicę między 0.7 a 0.8, to zainstalować aplikację desktopową, pozwolić jej podchwycić Twojego istniejącego agenta i uruchomić ten sam brief, który uruchamiałeś w zeszłym miesiącu. Kształt odpowiedzi się zmienia.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Pobierz wersję desktopową</a>.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — dłuższy manifest stojący za zakładem „silnik plus wtyczki”, który 0.8.0 ostatecznie spłaca</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Jak przenieść workflow z Figma do wtyczki Open Design</a> — praktyczna wersja pętli „wtyczki tworzą wtyczki”</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Otwartoźródłowa alternatywa dla Claude Design</a> — gdzie to wydanie pasuje w krajobrazie projektowania agent-native</li>
      </ul>
  id:
    title: "Open Design 0.8.0: semuanya adalah plugin"
    summary: "Open Design 0.8.0 bukanlah sebuah rilis, melainkan sebuah pembangunan ulang. Sebuah mesin plugin yang kecil, CLI yang headless-by-default, pembaruan otomatis terpaket di macOS dan Windows, dan 149 sistem desain yang dikirim dalam tujuh hari."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), dikirim 22 Mei 2026, 12:43 UTC. 305 PR dari 75 kontributor dalam tujuh hari. Ini adalah rilis tempat kami berhenti mencoba memperluas bentuk lama dan membangun ulang mesin di bawahnya. Aplikasi desktop yang akan Anda unduh hari ini adalah pembungkus tipis di sekitar sebuah CLI yang juga dapat Anda arahkan dari Claude Code, Cursor, atau sebuah bot Slack. Sistem desain, slice, prototipe, ekspor, dan alur kerja gaya Figma yang lama bukan lagi fitur yang tertanam di dalam mesin — mereka adalah plugin, ditulis terhadap inti yang kecil dan membosankan.</p>
      <p>Jika Anda ingin versi panjangnya, thread diskusi memilikinya. Tulisan ini adalah versi pendeknya: apa yang berubah di balik layar, apa yang dapat Anda lakukan dengannya hari ini, dan dari mana memulai.</p>
      <h2>Mengapa pembangunan ulang, bukan rilis lainnya</h2>
      <p>Lini 0.7 punya masalah. Setiap alur kerja hidup di dalam mesin — impor sistem-desain, template deck, rendering slice, port Figma, bahkan langkah publikasi — dan menambahkan hal berikutnya berarti mengedit inti. Itulah dinamika yang mengubah setiap editor sebelum kami menjadi kuburan plugin: sebuah API plugin SaaS yang terkunci di balik sebuah versi, sebuah “program creator” yang harus Anda lamar, sebuah runtime yang rusak setiap dua tahun.</p>
      <p>Kami bisa saja mengirim 0.8 sebagai rilis titik lainnya pada permukaan itu. Sebaliknya, kami mengirim penulisan ulangnya.</p>
      <p>Di bawahnya, tiga hal kini berbeda:</p>
      <ul>
      <li>Mesin tetap kecil dan membosankan. Ia menjalankan skill, memuat plugin, memanggil adapter agent, dan menyingkir.</li>
      <li>Segala hal lain menjadi plugin. Sistem desain, slice, prototipe, ekspor, alur kerja Figma yang lama — semuanya hidup dalam format plugin yang sama, terdaftar melalui manifest yang sama, ter-sandbox melalui permukaan yang sama.</li>
      <li>CLI adalah titik masuk kanonis. Aplikasi desktop memanggilnya; begitu pula server OD MCP; begitu pula agent di terminal Anda.</li>
      </ul>
      <p>305 PR dalam rilis ini sebagian besar adalah pekerjaan memindahkan dunia lama ke dalam bentuk baru. Sebagian darinya adalah bentuk baru itu sendiri.</p>
      <h2>Tiga lempeng arsitektur</h2>
      <p><strong>Semuanya adalah plugin.</strong> Permukaan registri plugin kini memiliki laci detail dengan lencana kepercayaan, fallback marketplace yang sadar batas-laju GitHub, footer publikasi yang dipoles, dan navigasi plugin / integrasi yang terpadu (#2087, #2064, #1806, #1849). Memublikasikan sebuah plugin membuat repo GitHub nyata di bawah akun penulis (#2332, #2363), dan jalur publikasi CLI membaca versi manifest yang aktif alih-alih merekayasa palsu (#1903). Ketika mesin tumbuh, ia tumbuh di luar sini, secara publik.</p>
      <p><strong>Headless secara default.</strong> Aplikasi desktop kini menjadi pembungkus tipis di sekitar OD CLI. Mesin yang sama berjalan dari Claude Code, OpenClaw, Hermes Agent, dan bot chat di Lark, Discord, dan Slack. Profil agent CLI kustom dikirim dalam rilis ini (#378), sehingga Anda dapat memasang agent CLI sembarang ke dalam runtime tanpa menyentuh inti. Desain berhenti menjadi tempat yang Anda kunjungi dan menjadi kapabilitas yang dimiliki agent Anda. Inilah yang ditunjuk oleh <a href="/blog/why-we-built-open-design-as-a-skill-layer/">manifesto lapisan-skill</a>; 0.8.0 adalah rilis pertama tempat jalur agent adalah jalur kanonis, bukan pintu samping.</p>
      <p><strong>Plugin membuat plugin.</strong> OD CLI membungkus GitHub CLI, sehingga sebuah agent dapat mengklon repo, men-scaffold sebuah plugin, memvalidasinya, memaketkannya, dan membuka sebuah PR — untuk Anda, atau untuk dirinya sendiri. <a href="/blog/port-figma-workflow-open-design-plugin/">Panduan cara-memindahkan-alur-kerja-Figma</a> menelusuri jalur manusia; versi otomatis dari jalur yang sama kini dapat dijangkau dari dalam agent mana pun yang memiliki <code>gh</code> dan <code>od</code> di <code>$PATH</code>. Mesin menumbuhkan dirinya sendiri, secara publik, dengan Anda dalam loop.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Satu ubin plugin yang meluncur ke dalam slot docking pada sebuah modul mesin, terpilih dalam bingkai hijau di atas latar editorial nyaris putih">
        <figcaption>Semuanya adalah plugin — skill, sistem, slice, dan ekspor semuanya berlabuh ke dalam mesin kecil yang sama.</figcaption>
      </figure>
      <h2>Apa lagi yang hadir di 0.8.0</h2>
      <p>Rilisnya luas. Bagian-bagian yang layak ditonjolkan:</p>
      <ul>
      <li><strong>149 sistem desain dengan <code>tokens.css</code> terstruktur + manifest komponen.</strong> Fixture token-merek untuk Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor, dan 50 lainnya — masing-masing mengirim <code>tokens.css</code> dan <code>components.html</code>, disajikan melalui kanal token yang aktif-secara-default (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">Penalaran sistem-portabel</a> kini menjadi permukaan default, bukan pintu samping.</li>
      <li><strong>Critique Theater hingga Phase 16.</strong> Apa yang dulunya adalah satu juri yang dapat diamati di 0.7.0 kini menjadi loop yang sepenuhnya terinstrumentasi: pembungkus klien web Phase 9 dengan i18n native de / ja / ko / zh-TW, suite stage Playwright Phase 11, Phase 12 dengan 9 metrik Prometheus + 6 event log + span OTel + dasbor Grafana, resolver rollout Phase 15, ratchet rollout fase-M Phase 16 dan <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Diluncurkan secara dark di M0 secara default.</li>
      <li><strong>Tiga penyedia media baru.</strong> Pembuatan gambar Leonardo.ai (#1123), audio ElevenLabs (#1384), dan TTS SenseAudio ditambah chat BYOK dengan tool gambar dan video (#1633, #2065). Dispatcher media kini berbicara kompatibel-OpenAI ke apa pun yang Anda arahkan.</li>
      <li><strong>Pembaruan otomatis terpaket di macOS dan Windows.</strong> Rilis pertama tempat instalasi terpaket memperbarui diri dari ujung ke ujung pada kedua platform melalui feed R2 yang sama, dengan popup updater yang disegarkan, serah terima unduh / instal yang tervalidasi, dan pemulihan dari penerapan yang terputus (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). GUI terpaket Linux masih ditunda sementara kami mengeraskan jalurnya; siklus hidup headless dan Nix flake keduanya berfungsi hari ini.</li>
      <li><strong>Locale Italia (it) + fallback font CJK.</strong> UI kini dikirim dalam 19 bahasa termasuk Italia (#1323), dan teks Tionghoa / Jepang / Korea melakukan fallback ke font native platform alih-alih melalui substitusi Latin (#2227).</li>
      <li><strong>Penyegaran visual dari atas ke bawah.</strong> Ikon aplikasi baru, glif merek, wordmark yang disegarkan — satu peluncuran terkoordinasi tepat waktu untuk pemotongan rilis (#2436).</li>
      </ul>
      <p>Daftar lengkapnya mencapai 305 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Catatan rilis di GitHub</a> membawa sisanya.</p>
      <h2>Apa yang harus dilakukan dengannya hari ini</h2>
      <p>Tiga jalur, tergantung dari mana Anda memulai.</p>





















      <table><thead><tr><th>Jika Anda…</th><th>Mulai di sini</th></tr></thead><tbody><tr><td>Baru mengenal Open Design</td><td>Unduh aplikasi desktop dan biarkan ia mem-bootstrap sebuah proyek terhadap sistem desain yang sudah ada</td></tr><tr><td>Sudah menjalankan Open Design</td><td>Biarkan pembaruan otomatis terpaket membawa Anda ke 0.8.0; popup updater dalam aplikasi memandu Anda melalui instalasi yang tervalidasi</td></tr><tr><td>Membangun sebuah plugin</td><td>Scaffold dengan <code>od plugin scaffold --id &#x3C;name></code>, validasi dengan <code>od plugin validate ./&#x3C;path> --no-daemon</code>, dan buka sebuah PR melalui jalur publikasi OD yang sama yang mengirim setiap plugin lain di marketplace</td></tr></tbody></table>
      <p>Jika Anda sudah menunggu loop agent-native terasa seperti loop kanonis alih-alih sebuah demo, inilah rilisnya. Arahkan Claude Code, Cursor, Codex, atau salah satu dari 16 agent CLI yang terdeteksi ke OD CLI yang sama yang dikirim aplikasi desktop, dan kedua jalur menyatu setelah prompt pertama.</p>
      <h2>Apa yang harus dilakukan selanjutnya</h2>
      <p>Cara tercepat untuk merasakan perbedaan antara 0.7 dan 0.8 adalah memasang aplikasi desktop, membiarkannya mengambil agent Anda yang sudah ada, dan menjalankan brief yang sama yang Anda jalankan bulan lalu. Bentuk jawabannya berubah.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Unduh desktop</a>.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> — manifesto yang lebih panjang di balik taruhan “mesin plus plugin” yang dilunasi 0.8.0</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Cara memindahkan alur kerja Figma ke dalam plugin Open Design</a> — versi praktis dari loop “plugin membuat plugin”</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Alternatif sumber terbuka untuk Claude Design</a> — di mana rilis ini cocok dalam lanskap desain agent-native</li>
      </ul>
  nl:
    title: "Open Design 0.8.0: alles is een plugin"
    summary: "Open Design 0.8.0 is geen release, het is een herbouw. Een kleine plugin-engine, een headless-by-default CLI, verpakte auto-update op macOS en Windows, en 149 designsystemen geleverd in zeven dagen."
    bodyHtml: |
      <p>Tag <code>open-design-v0.8.0</code> (<code>c20d156</code>), geleverd op 22 mei 2026, 12:43 UTC. 305 PR's van 75 bijdragers in zeven dagen. Dit is de release waarin we stopten met het proberen uit te breiden van de oude vorm en de engine eronder herbouwden. De desktop-app die je vandaag downloadt is een dunne wrapper rond een CLI waar je ook op kunt richten vanuit Claude Code, Cursor of een Slack-bot. De designsystemen, slices, prototypes, exports en de oude Figma-stijlworkflows zijn niet langer functies die in de engine zijn gebakken — het zijn plugins, geschreven tegen een kleine, saaie kern.</p>
      <p>Als je de lange versie wilt, heeft de discussiethread die. Dit bericht is de korte versie: wat er onder de motorkap veranderde, wat je er vandaag mee kunt doen, en waar je moet beginnen.</p>
      <h2>Waarom een herbouw, geen nieuwe release</h2>
      <p>De 0.7-lijn had een probleem. Elke workflow leefde in de engine — design-system-imports, deck-templates, slice-rendering, de Figma-port, zelfs de publicatiestap — en het toevoegen van het volgende ding betekende het bewerken van de kern. Dat is de dynamiek die elke editor vóór ons veranderde in een pluginkerkhof: een SaaS-plugin-API die achter een versie vergrendelde, een “creator-programma” waarvoor je je moest aanmelden, een runtime die elke twee jaar brak.</p>
      <p>We hadden 0.8 kunnen leveren als nog een point-release op dat oppervlak. In plaats daarvan leverden we de herschrijving.</p>
      <p>Daaronder zijn drie dingen nu anders:</p>
      <ul>
      <li>De engine bleef klein en saai. Hij draait skills, mount plugins, roept agent-adapters aan en gaat uit de weg.</li>
      <li>Al het andere werd een plugin. Designsystemen, slices, prototypes, exports, de oude Figma-workflows — ze leven allemaal in hetzelfde plugin-formaat, geregistreerd via hetzelfde manifest, sandboxed via hetzelfde oppervlak.</li>
      <li>De CLI is het canonieke toegangspunt. De desktop-app roept hem aan; de OD MCP-server ook; de agent in je terminal ook.</li>
      </ul>
      <p>De 305 PR's in deze release zijn grotendeels het werk van het overzetten van de oude wereld naar de nieuwe vorm. Sommige ervan zijn de nieuwe vorm zelf.</p>
      <h2>De drie architectonische platen</h2>
      <p><strong>Alles is een plugin.</strong> Het pluginregister-oppervlak heeft nu een detaillade met vertrouwensbadges, een GitHub-rate-limit-bewuste marketplace-fallback, een gepolijste publicatie-footer en een uniforme plugin/integratie-navigatie (#2087, #2064, #1806, #1849). Het publiceren van een plugin maakt een echte GitHub-repo onder het account van de auteur (#2332, #2363), en het CLI-publicatiepad leest de live manifest-versie in plaats van hem te stubben (#1903). Wanneer de engine groeit, groeit hij hier, in het openbaar.</p>
      <p><strong>Headless by default.</strong> De desktop-app is nu een dunne wrapper rond de OD CLI. Dezelfde engine draait vanuit Claude Code, OpenClaw, Hermes Agent, en chatbots in Lark, Discord en Slack. Aangepaste CLI-agent-profielen worden in deze release geleverd (#378), zodat je een willekeurige CLI-agent in de runtime kunt pluggen zonder de kern aan te raken. Ontwerpen is niet langer een plek waar je heen gaat en wordt een capaciteit die je agents hebben. Dit is waar <a href="/blog/why-we-built-open-design-as-a-skill-layer/">het skill-laag-manifest</a> op wees; 0.8.0 is de eerste release waarin het agent-pad het canonieke pad is, geen zijdeur.</p>
      <p><strong>Plugins maken plugins.</strong> De OD CLI omhult de GitHub CLI, zodat een agent de repo kan klonen, een plugin kan scaffolden, hem kan valideren, inpakken en een PR kan openen — voor jou, of voor zichzelf. De <a href="/blog/port-figma-workflow-open-design-plugin/">how-to-port-een-Figma-workflow-gids</a> bewandelt het menselijke pad; de geautomatiseerde versie van hetzelfde pad is nu bereikbaar vanuit elke agent die <code>gh</code> en <code>od</code> op <code>$PATH</code> heeft. De engine laat zichzelf groeien, in het openbaar, met jou in de lus.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Eén plugintegel die in een dockingslot op een enginemodule schuift, geselecteerd in een groen kader op een bijna-witte redactionele achtergrond">
        <figcaption>Alles is een plugin — skills, systemen, slices en exports docken allemaal in dezelfde kleine engine.</figcaption>
      </figure>
      <h2>Wat er nog meer landt in 0.8.0</h2>
      <p>De release is breed. De stukken die het waard zijn om naar voren te halen:</p>
      <ul>
      <li><strong>149 designsystemen met gestructureerde <code>tokens.css</code> + componentmanifesten.</strong> Brand-token-fixtures voor Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor, en 50 meer — elk levert <code>tokens.css</code> en <code>components.html</code>, geserveerd via een standaard-ingeschakeld tokenkanaal (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). De <a href="/blog/open-source-alternative-to-claude-design/">redenering achter draagbare systemen</a> is nu het standaardoppervlak, geen zijdeur.</li>
      <li><strong>Critique Theater tot en met Fase 16.</strong> Wat in 0.7.0 een enkele observeerbare jury was, is nu een volledig geïnstrumenteerde lus: Fase 9 web-client-wrapper met native de/ja/ko/zh-TW i18n, Fase 11 Playwright-stage-suite, Fase 12 met 9 Prometheus-metrieken + 6 log-events + OTel-span + Grafana-dashboard, Fase 15 rollout-resolver, Fase 16 M-fase rollout-ratel en <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Dark-launched op M0 standaard.</li>
      <li><strong>Drie nieuwe media-providers.</strong> Leonardo.ai-beeldgeneratie (#1123), ElevenLabs-audio (#1384), en SenseAudio TTS plus BYOK-chat met beeld- en videotools (#1633, #2065). De media-dispatcher spreekt nu OpenAI-compatibel naar alles waar je hem op richt.</li>
      <li><strong>Verpakte auto-update op macOS en Windows.</strong> Eerste release waarin verpakte installaties zichzelf end-to-end bijwerken op beide platforms via dezelfde R2-feed, met een vernieuwde updater-pop-up, gevalideerde download-/installatieoverdracht, en herstel van onderbroken toepassingen (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). De verpakte Linux-GUI is nog steeds uitgesteld terwijl we de lijn verharden; de headless levenscyclus en de Nix-flake werken beide vandaag.</li>
      <li><strong>Italiaanse (it) locale + CJK-fontfallback.</strong> De UI wordt nu geleverd in 19 talen, waaronder Italiaans (#1323), en Chinese/Japanse/Koreaanse tekst valt terug op platform-native fonts in plaats van door Latijnse substitutie te gaan (#2227).</li>
      <li><strong>Visuele opfrissing van boven tot onder.</strong> Nieuwe app-pictogrammen, merk-glyphs, vernieuwd wordmark — één gecoördineerde drop op tijd voor de cut (#2436).</li>
      </ul>
      <p>De volledige lijst loopt op tot 305 PR's. De <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">release notes op GitHub</a> bevatten de rest.</p>
      <h2>Wat je er vandaag mee kunt doen</h2>
      <p>Drie paden, afhankelijk van waar je begint.</p>


















      <table><thead><tr><th>Als je…</th><th>Begin hier</th></tr></thead><tbody><tr><td>Nieuw bent bij Open Design</td><td>Download de desktop-app en laat hem een project bootstrappen tegen een bestaand designsysteem</td></tr><tr><td>Al Open Design draait</td><td>Laat de verpakte auto-update je naar 0.8.0 brengen; de in-app updater-pop-up leidt je door de gevalideerde installatie</td></tr><tr><td>Een plugin bouwt</td><td>Scaffold met <code>od plugin scaffold --id &#x3C;name></code>, valideer met <code>od plugin validate ./&#x3C;path> --no-daemon</code>, en open een PR via hetzelfde OD-publicatiepad dat elke andere plugin in de marketplace levert</td></tr></tbody></table>
      <p>Als je hebt gewacht tot de agent-native lus aanvoelt als de canonieke lus in plaats van een demo, dan is dit de release. Richt Claude Code, Cursor, Codex of een van de 16 gedetecteerde CLI-agents op dezelfde OD CLI die de desktop-app levert, en de twee paden convergeren na de eerste prompt.</p>
      <h2>Wat je hierna moet doen</h2>
      <p>De snelste manier om het verschil tussen 0.7 en 0.8 te voelen is de desktop-app installeren, hem je bestaande agent laten oppakken, en dezelfde briefing draaien die je vorige maand draaide. De vorm van het antwoord verandert.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Download desktop</a>.</p>
      <h2>Gerelateerde lectuur</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — het langere manifest achter de “engine plus plugins”-gok die 0.8.0 afmaakt</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Hoe je een Figma-workflow naar een Open Design-plugin overzet</a> — de praktische versie van de “plugins maken plugins”-lus</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Het open-source alternatief voor Claude Design</a> — waar deze release past in het agent-native ontwerplandschap</li>
      </ul>
  ar:
    title: "Open Design 0.8.0: كل شيء إضافة (plugin)"
    summary: "Open Design 0.8.0 ليس إصدارًا، بل إعادة بناء. محرّك إضافات صغير، وواجهة CLI بلا واجهة افتراضيًّا، وتحديث تلقائي مُغلَّف على macOS وWindows، و149 نظام تصميم شُحنت في سبعة أيام."
    bodyHtml: |
      <p>الوسم <code>open-design-v0.8.0</code> (<code>c20d156</code>)، شُحن في 22 مايو 2026، الساعة 12:43 بالتوقيت العالمي. 305 PR من 75 مساهمًا في سبعة أيام. هذا هو الإصدار الذي توقّفنا فيه عن محاولة تمديد الشكل القديم وأعدنا بناء المحرّك تحته. تطبيق سطح المكتب الذي ستُنزّله اليوم هو غلاف رفيع حول واجهة CLI يمكنك أيضًا توجيهها من Claude Code، أو Cursor، أو روبوت Slack. أنظمة التصميم، والشرائح (slices)، والنماذج الأولية، والتصديرات، وسير عمل Figma القديم بنمطه لم تعد ميزات مُدمجة في المحرّك — بل صارت إضافات، مكتوبة على نواة صغيرة ومملّة.</p>
      <p>إن أردت النسخة الطويلة، فسلسلة النقاش تحويها. هذه المقالة هي النسخة القصيرة: ما الذي تغيّر تحت الغطاء، وما الذي يمكنك فعله به اليوم، ومن أين تبدأ.</p>
      <h2>لماذا إعادة بناء، لا إصدار آخر</h2>
      <p>كان لخطّ 0.7 مشكلة. كل سير عمل يقيم داخل المحرّك — استيراد أنظمة التصميم، وقوالب العروض، وعرض الشرائح، ونقل Figma، وحتى خطوة النشر — وإضافة الشيء التالي تعني تحرير النواة. تلك هي الديناميكية التي حوّلت كل محرّر قبلنا إلى مقبرة إضافات: واجهة API لإضافات SaaS مُقفلة خلف إصدار، و«برنامج مُبدع» عليك التقديم إليه، وبيئة تشغيل تتعطّل كل عامين.</p>
      <p>كان بإمكاننا شحن 0.8 كإصدار نقطي آخر على ذلك السطح. وبدلًا من ذلك، شحنّا إعادة الكتابة.</p>
      <p>تحته، ثلاثة أشياء مختلفة الآن:</p>
      <ul>
      <li>بقي المحرّك صغيرًا ومملًّا. يُشغّل المهارات، ويُركّب الإضافات، ويستدعي مُحوّلات العملاء، ويبتعد عن الطريق.</li>
      <li>كل شيء آخر صار إضافة. أنظمة التصميم، والشرائح، والنماذج الأولية، والتصديرات، وسير عمل Figma القديم — كلها تقيم في صيغة الإضافة نفسها، مُسجّلة عبر البيان (manifest) نفسه، ومعزولة عبر السطح نفسه.</li>
      <li>الـ CLI هو نقطة الدخول القانونية. تطبيق سطح المكتب يستدعيها؛ وكذلك خادم OD MCP؛ وكذلك العميل في طرفيتك.</li>
      </ul>
      <p>الـ 305 PR في هذا الإصدار هي في معظمها عمل نقل العالم القديم إلى الشكل الجديد. وبعضها هو الشكل الجديد نفسه.</p>
      <h2>الألواح المعمارية الثلاثة</h2>
      <p><strong>كل شيء إضافة.</strong> سطح سجلّ الإضافات الآن لديه درج تفاصيل بشارات ثقة، وحلّ احتياطي للسوق مُدرِك لحدّ معدّل GitHub، وتذييل نشر مصقول، وتنقّل مُوحَّد للإضافات / التكاملات (#2087، #2064، #1806، #1849). نشر إضافة يُنشئ مستودع GitHub حقيقيًّا تحت حساب المؤلّف (#2332، #2363)، ومسار النشر في الـ CLI يقرأ إصدار البيان الحيّ بدلًا من وضع بديل وهمي له (#1903). عندما ينمو المحرّك، ينمو هنا في الخارج، علنًا.</p>
      <p><strong>بلا واجهة افتراضيًّا.</strong> تطبيق سطح المكتب الآن غلاف رفيع حول OD CLI. المحرّك نفسه يعمل من Claude Code، وOpenClaw، وHermes Agent، وروبوتات الدردشة في Lark، وDiscord، وSlack. ملفّات تعريف عميل CLI مخصّصة تُشحن في هذا الإصدار (#378)، فيمكنك توصيل أي عميل CLI اعتباطي بـبيئة التشغيل دون لمس النواة. يتوقّف التصميم عن كونه مكانًا تذهب إليه ويصبح قدرة يملكها عملاؤك. هذا ما كان <a href="/blog/why-we-built-open-design-as-a-skill-layer/">بيان طبقة المهارات</a> يشير إليه؛ و0.8.0 هو أول إصدار يكون فيه مسار العميل هو المسار القانوني، لا بابًا جانبيًّا.</p>
      <p><strong>الإضافات تُنشئ إضافات.</strong> OD CLI يلفّ GitHub CLI، فيستطيع عميل استنساخ المستودع، وسقالة (scaffold) إضافة، والتحقّق منها، وحزمها، وفتح PR — لك، أو لنفسه. <a href="/blog/port-figma-workflow-open-design-plugin/">دليل كيفية نقل سير عمل Figma</a> يمشي على المسار البشري؛ والنسخة المؤتمتة من المسار نفسه صارت الآن قابلة للوصول من داخل أي عميل لديه <code>gh</code> و<code>od</code> على <code>$PATH</code>. المحرّك يُنمّي نفسه، علنًا، وأنت في الحلقة.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="بلاطة إضافة واحدة تنزلق إلى خانة إرساء في وحدة محرّك، محدّدة بإطار أخضر على أرضية تحريرية شبه بيضاء">
        <figcaption>كل شيء إضافة — المهارات، والأنظمة، والشرائح، والتصديرات كلها ترسو في المحرّك الصغير نفسه.</figcaption>
      </figure>
      <h2>ما الذي يصل أيضًا في 0.8.0</h2>
      <p>الإصدار واسع. القطع الجديرة بالتقديم:</p>
      <ul>
      <li><strong>149 نظام تصميم مع <code>tokens.css</code> مُهيكَل + بيانات مكوّنات.</strong> تثبيتات رموز العلامة التجارية لـ Apple، وStripe، وAirbnb، وVercel، وNotion، وLinear، وGitHub، وFigma، وSlack، وDiscord، وOpenAI، وShopify، وSpotify، وUber، وCursor، و50 غيرها — كلٌّ يشحن <code>tokens.css</code> و<code>components.html</code>، مُقدَّمة عبر قناة رموز مُفعَّلة افتراضيًّا (#1544، #1652، #1794، #1841، #2023، #2028، #2029، #2033). <a href="/blog/open-source-alternative-to-claude-design/">منطق النظام المحمول</a> صار الآن السطح الافتراضي، لا بابًا جانبيًّا.</li>
      <li><strong>مسرح النقد (Critique Theater) حتى المرحلة 16.</strong> ما كان قاضيًا واحدًا قابلًا للملاحظة في 0.7.0 صار الآن حلقة مُجهَّزة بالكامل: المرحلة 9 غلاف عميل ويب بتعريب أصلي de / ja / ko / zh-TW، والمرحلة 11 مجموعة مراحل Playwright، والمرحلة 12 مع 9 مقاييس Prometheus + 6 أحداث سجلّ + مدى OTel + لوحة Grafana، والمرحلة 15 مُحلِّل الطرح، والمرحلة 16 سقّاطة طرح المرحلة-M و<code>/api/critique/conformance</code> (#1315–#1320، #1338، #1483–#1485، #1499). مُطلَقة بشكل خفيّ عند M0 افتراضيًّا.</li>
      <li><strong>ثلاثة مزوّدي وسائط جدد.</strong> توليد صور Leonardo.ai (#1123)، وصوت ElevenLabs (#1384)، وتحويل النصّ إلى كلام SenseAudio بالإضافة إلى محادثة BYOK بأدوات الصورة والفيديو (#1633، #2065). مُوزّع الوسائط الآن يتحدّث متوافقًا مع OpenAI لأي شيء توجّهه إليه.</li>
      <li><strong>تحديث تلقائي مُغلَّف على macOS وWindows.</strong> أول إصدار تُحدّث فيه التثبيتات المُغلَّفة نفسها من طرف إلى طرف على كلتا المنصّتين عبر تغذية R2 نفسها، بنافذة مُحدِّث مُجدَّدة، وتسليم تنزيل / تثبيت مُتحقَّق منه، وتعافٍ من عمليات التطبيق المُقاطَعة (#2270، #2362، #2376، #2403، #2429، #2565، #2575، #2592، #2595، #2677، #2687، #2700). واجهة Linux المُغلَّفة الرسومية لا تزال مؤجّلة بينما نُحصّن المسار؛ ودورة الحياة بلا واجهة وحزمة Nix flake كلاهما يعمل اليوم.</li>
      <li><strong>لغة إيطالية (it) + خط احتياطي لـ CJK.</strong> الواجهة الآن تُشحن بـ 19 لغة بما فيها الإيطالية (#1323)، والنصّ الصيني / الياباني / الكوري يتراجع إلى خطوط أصلية للمنصّة بدلًا من المرور عبر استبدال لاتيني (#2227).</li>
      <li><strong>تجديد بصري من الأعلى إلى الأسفل.</strong> أيقونات تطبيق جديدة، ورموز علامة تجارية، ووردمارك مُجدَّد — إصدار واحد مُنسَّق في الوقت المناسب للقطع (#2436).</li>
      </ul>
      <p>القائمة الكاملة تبلغ 305 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">ملاحظات الإصدار على GitHub</a> تحمل الباقي.</p>
      <h2>ما الذي تفعله به اليوم</h2>
      <p>ثلاثة مسارات، حسب نقطة بدئك.</p>
      <table><thead><tr><th>إن كنت…</th><th>ابدأ هنا</th></tr></thead><tbody><tr><td>جديدًا على Open Design</td><td>نزّل تطبيق سطح المكتب ودعه يُمهّد مشروعًا على نظام تصميم موجود</td></tr><tr><td>تُشغّل Open Design بالفعل</td><td>دع التحديث التلقائي المُغلَّف يأخذك إلى 0.8.0؛ نافذة المُحدِّث داخل التطبيق ترشدك عبر التثبيت المُتحقَّق منه</td></tr><tr><td>تبني إضافة</td><td>سقّل بـ <code>od plugin scaffold --id &#x3C;name></code>، وتحقّق بـ <code>od plugin validate ./&#x3C;path> --no-daemon</code>، وافتح PR عبر مسار نشر OD نفسه الذي يشحن كل إضافة أخرى في السوق</td></tr></tbody></table>
      <p>إن كنت تنتظر أن تبدو الحلقة المتمحورة حول العميل كالحلقة القانونية بدلًا من عرض توضيحي، فهذا هو الإصدار. وجّه Claude Code، أو Cursor، أو Codex، أو أيًّا من عملاء الـ CLI الـ 16 المكتشَفين إلى OD CLI نفسه الذي يشحن به تطبيق سطح المكتب، فيتقارب المساران بعد المُحثّ الأول.</p>
      <h2>ما الذي تفعله بعد ذلك</h2>
      <p>أسرع طريقة لتشعر بالفرق بين 0.7 و0.8 هي تثبيت تطبيق سطح المكتب، وتركه يلتقط عميلك الموجود، وتشغيل الملخّص نفسه الذي شغّلته الشهر الماضي. شكل الإجابة يتغيّر.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">نزّل سطح المكتب</a>.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> — البيان الأطول وراء رهان «المحرّك بالإضافة إلى الإضافات» الذي يُتمّ 0.8.0 جني ثماره</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">كيف تنقل سير عمل Figma إلى إضافة في Open Design</a> — النسخة العملية من حلقة «الإضافات تُنشئ إضافات»</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">البديل مفتوح المصدر لـ Claude Design</a> — أين يقع هذا الإصدار في مشهد التصميم المتمحور حول العميل</li>
      </ul>
  tr:
    title: "Open Design 0.8.0: her şey bir eklenti"
    summary: "Open Design 0.8.0 bir sürüm değil, bir yeniden inşa. Küçük bir eklenti motoru, varsayılan olarak başsız bir CLI, macOS ve Windows'ta paketlenmiş otomatik güncelleme ve yedi günde gönderilen 149 tasarım sistemi."
    bodyHtml: |
      <p><code>open-design-v0.8.0</code> etiketi (<code>c20d156</code>), 22 Mayıs 2026, 12:43 UTC'de gönderildi. Yedi günde 75 katkıda bulunandan 305 PR. Bu, eski biçimi genişletmeye çalışmayı bırakıp altındaki motoru yeniden inşa ettiğimiz sürüm. Bugün indireceğiniz masaüstü uygulaması, Claude Code, Cursor veya bir Slack botundan da yöneltebileceğiniz bir CLI'nin etrafındaki ince bir sarmalayıcıdır. Tasarım sistemleri, dilimler, prototipler, dışa aktarımlar ve eski Figma tarzı iş akışları artık motora gömülü özellikler değil — küçük, sıkıcı bir çekirdeğe karşı yazılmış eklentilerdir.</p>
      <p>Uzun versiyonunu isterseniz, tartışma başlığında var. Bu yazı kısa versiyon: perde arkasında neyin değiştiği, onunla bugün ne yapabileceğiniz ve nereden başlayacağınız.</p>
      <h2>Neden başka bir sürüm değil de yeniden inşa</h2>
      <p>0.7 serisinde bir sorun vardı. Her iş akışı motorun içinde yaşıyordu — tasarım sistemi içe aktarımları, sunum şablonları, dilim işleme, Figma taşıması, hatta yayımlama adımı — ve bir sonraki şeyi eklemek, çekirdeği düzenlemek demekti. Bizden önceki her editörü bir eklenti mezarlığına çeviren dinamik buydu: bir sürümün arkasına kilitlenen bir SaaS eklenti API'si, başvurmanız gereken bir "creator programı", her iki yılda bir bozulan bir çalışma zamanı.</p>
      <p>0.8'i o yüzey üzerinde başka bir ara sürüm olarak gönderebilirdik. Bunun yerine, yeniden yazımı gönderdik.</p>
      <p>Altında, şimdi üç şey farklı:</p>
      <ul>
      <li>Motor küçük ve sıkıcı kaldı. Becerileri çalıştırır, eklentileri bağlar, ajan adaptörlerini çağırır ve yoldan çekilir.</li>
      <li>Diğer her şey bir eklenti oldu. Tasarım sistemleri, dilimler, prototipler, dışa aktarımlar, eski Figma iş akışları — hepsi aynı eklenti formatında yaşar, aynı bildirim üzerinden kaydedilir, aynı yüzey üzerinden korumalı alana alınır.</li>
      <li>CLI, kanonik giriş noktasıdır. Masaüstü uygulaması onu çağırır; OD MCP sunucusu da; terminalinizdeki ajan da.</li>
      </ul>
      <p>Bu sürümdeki 305 PR'ın çoğu, eski dünyayı yeni biçime taşıma işidir. Bazıları yeni biçimin kendisidir.</p>
      <h2>Üç mimari plaka</h2>
      <p><strong>Her şey bir eklenti.</strong> Eklenti kayıt defteri yüzeyinin artık güven rozetleri olan bir ayrıntı çekmecesi, GitHub hız sınırı farkındalıklı bir marketplace yedeği, cilalı bir yayımlama altbilgisi ve birleşik bir eklenti / entegrasyon gezintisi var (#2087, #2064, #1806, #1849). Bir eklenti yayımlamak, yazarın hesabı altında gerçek bir GitHub deposu oluşturur (#2332, #2363) ve CLI yayımlama yolu, taklit etmek yerine canlı bildirim sürümünü okur (#1903). Motor büyüdüğünde, burada, herkese açık olarak büyür.</p>
      <p><strong>Varsayılan olarak başsız.</strong> Masaüstü uygulaması artık OD CLI'nin etrafındaki ince bir sarmalayıcıdır. Aynı motor; Claude Code, OpenClaw, Hermes Agent ve Lark, Discord ve Slack'teki sohbet botlarından çalışır. Bu sürümde özel CLI ajan profilleri geliyor (#378), böylece çekirdeğe dokunmadan rastgele bir CLI ajanını çalışma zamanına takabilirsiniz. Tasarım, gittiğiniz bir yer olmaktan çıkar ve ajanlarınızın sahip olduğu bir yetenek haline gelir. <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Beceri katmanı manifestosunun</a> işaret ettiği buydu; 0.8.0, ajan yolunun bir yan kapı değil, kanonik yol olduğu ilk sürümdür.</p>
      <p><strong>Eklentiler eklentiler oluşturur.</strong> OD CLI, GitHub CLI'yi sarmalar, böylece bir ajan depoyu klonlayabilir, bir eklentinin iskeletini oluşturabilir, doğrulayabilir, paketleyebilir ve bir PR açabilir — sizin için veya kendisi için. <a href="/blog/port-figma-workflow-open-design-plugin/">Bir Figma iş akışı nasıl taşınır kılavuzu</a> insan yolunu anlatır; aynı yolun otomatik versiyonu artık <code>$PATH</code> üzerinde <code>gh</code> ve <code>od</code> olan herhangi bir ajanın içinden erişilebilir. Motor kendini, herkese açık olarak, siz de döngüde olmak üzere büyütür.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, bir motor modülündeki yerleştirme yuvasına kayan, yeşil bir çerçeveyle seçilmiş tek bir eklenti karosu">
        <figcaption>Her şey bir eklenti — beceriler, sistemler, dilimler ve dışa aktarımlar, hepsi aynı küçük motora yerleşir.</figcaption>
      </figure>
      <h2>0.8.0'da başka neler geliyor</h2>
      <p>Sürüm geniş. Öne çıkarmaya değer parçalar:</p>
      <ul>
      <li><strong>Yapılandırılmış <code>tokens.css</code> + bileşen bildirimleri olan 149 tasarım sistemi.</strong> Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor ve 50 tanesi daha için marka token sabit verileri — her biri varsayılan olarak açık bir token kanalı üzerinden sunulan <code>tokens.css</code> ve <code>components.html</code> gönderir (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">Taşınabilir sistem mantığı</a> artık bir yan kapı değil, varsayılan yüzeydir.</li>
      <li><strong>Phase 16'ya kadar Critique Theater.</strong> 0.7.0'da tek bir gözlemlenebilir yargıç olan şey, artık tam olarak araçlandırılmış bir döngü: yerel de / ja / ko / zh-TW i18n ile Phase 9 web istemcisi sarmalayıcısı, Phase 11 Playwright sahne paketi, 9 Prometheus metriği + 6 günlük olayı + OTel span + Grafana panosu ile Phase 12, Phase 15 yayılım çözümleyicisi, Phase 16 M-aşaması yayılım kademesi ve <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Varsayılan olarak M0'da karanlık-lansman.</li>
      <li><strong>Üç yeni medya sağlayıcısı.</strong> Leonardo.ai görüntü üretimi (#1123), ElevenLabs ses (#1384) ve SenseAudio TTS artı görüntü ve video araçlarıyla BYOK sohbet (#1633, #2065). Medya dağıtıcısı artık yönelttiğiniz her şeye OpenAI uyumlu konuşur.</li>
      <li><strong>macOS ve Windows'ta paketlenmiş otomatik güncelleme.</strong> Paketlenmiş kurulumların her iki platformda da aynı R2 akışı üzerinden baştan sona kendini güncellediği ilk sürüm; yenilenmiş bir güncelleyici açılır penceresi, doğrulanmış indirme / kurulum devri ve kesintiye uğramış uygulamalardan kurtarma ile (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). Linux paketlenmiş GUI, biz şeridi sağlamlaştırırken hâlâ ertelendi; başsız yaşam döngüsü ve Nix flake'in ikisi de bugün çalışıyor.</li>
      <li><strong>İtalyanca (it) yerel ayarı + CJK font yedeği.</strong> Arayüz artık İtalyanca dahil 19 dilde geliyor (#1323) ve Çince / Japonca / Korece metin, Latin ikamesinden geçmek yerine platform-yerel fontlara geri döner (#2227).</li>
      <li><strong>Baştan sona görsel yenileme.</strong> Yeni uygulama simgeleri, marka glifleri, yenilenmiş wordmark — kesime tam zamanında koordineli tek bir bırakma (#2436).</li>
      </ul>
      <p>Tam liste 305 PR'a ulaşıyor. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">GitHub'daki sürüm notları</a> geri kalanını taşıyor.</p>
      <h2>Onunla bugün ne yapılmalı</h2>
      <p>Nereden başladığınıza bağlı olarak üç yol.</p>




















      <table><thead><tr><th>Eğer…</th><th>Buradan başlayın</th></tr></thead><tbody><tr><td>Open Design'a yeniyseniz</td><td>Masaüstü uygulamasını indirin ve mevcut bir tasarım sistemine karşı bir projeyi önyüklemesine izin verin</td></tr><tr><td>Zaten Open Design çalıştırıyorsanız</td><td>Paketlenmiş otomatik güncellemenin sizi 0.8.0'a getirmesine izin verin; uygulama içi güncelleyici açılır penceresi sizi doğrulanmış kurulumda yönlendirir</td></tr><tr><td>Bir eklenti oluşturuyorsanız</td><td><code>od plugin scaffold --id &#x3C;name></code> ile iskelet oluşturun, <code>od plugin validate ./&#x3C;path> --no-daemon</code> ile doğrulayın ve marketplace'teki diğer her eklentiyi gönderen aynı OD yayımlama yolu üzerinden bir PR açın</td></tr></tbody></table>
      <p>Ajan-yerel döngünün bir demo yerine kanonik döngü gibi hissetmesini bekliyorsanız, sürüm budur. Claude Code, Cursor, Codex veya tespit edilen 16 CLI ajanından herhangi birini, masaüstü uygulamasının birlikte geldiği aynı OD CLI'ye yöneltin ve iki yol ilk istemden sonra birleşir.</p>
      <h2>Sırada ne yapılmalı</h2>
      <p>0.7 ile 0.8 arasındaki farkı hissetmenin en hızlı yolu, masaüstü uygulamasını kurmak, mevcut ajanınızı algılamasına izin vermek ve geçen ay çalıştırdığınız aynı brief'i çalıştırmaktır. Cevabın biçimi değişir.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Masaüstünü indirin</a>.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — 0.8.0'ın karşılığını vermeyi tamamladığı "motor artı eklentiler" bahsinin arkasındaki daha uzun manifesto</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Bir Figma iş akışı Open Design eklentisine nasıl taşınır</a> — "eklentiler eklentiler oluşturur" döngüsünün pratik versiyonu</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Claude Design'a açık kaynaklı alternatif</a> — bu sürümün ajan-yerel tasarım manzarasında nereye uyduğu</li>
      </ul>
  uk:
    title: "Open Design 0.8.0: усе є плагіном"
    summary: "Open Design 0.8.0 — це не реліз, це перебудова. Невеликий рушій плагінів, безголовий за замовчуванням CLI, пакетне автооновлення на macOS і Windows та 149 дизайн-систем, випущених за сім днів."
    bodyHtml: |
      <p>Тег <code>open-design-v0.8.0</code> (<code>c20d156</code>), випущено 22 травня 2026, 12:43 UTC. 305 PR від 75 контриб’юторів за сім днів. Це той реліз, де ми припинили намагатися розширювати стару форму й перебудували рушій під нею. Десктопний застосунок, який ви завантажите сьогодні, — це тонка обгортка навколо CLI, на який ви також можете спрямувати Claude Code, Cursor чи бота Slack. Дизайн-системи, зрізи, прототипи, експорти та старі робочі процеси в стилі Figma більше не є функціями, вшитими в рушій — це плагіни, написані проти невеликого, нудного ядра.</p>
      <p>Якщо вам потрібна довга версія, вона є в гілці обговорення. Цей допис — коротка версія: що змінилося під капотом, що ви можете з цим робити сьогодні та з чого почати.</p>
      <h2>Чому перебудова, а не черговий реліз</h2>
      <p>Лінійка 0.7 мала проблему. Кожен робочий процес жив усередині рушія — імпорти дизайн-систем, шаблони презентацій, рендеринг зрізів, порт Figma, навіть крок публікації — і додавання наступної речі означало редагування ядра. Саме ця динаміка перетворила кожен редактор до нас на цвинтар плагінів: SaaS-API плагінів, замкнений за версією, «програма для творців», на яку треба було подавати заявку, середовище виконання, що ламалося кожні два роки.</p>
      <p>Ми могли б випустити 0.8 як черговий точковий реліз на тій поверхні. Натомість ми випустили переписування.</p>
      <p>Під капотом тепер три речі інакші:</p>
      <ul>
      <li>Рушій лишився невеликим і нудним. Він запускає навички, монтує плагіни, викликає адаптери агентів і не плутається під ногами.</li>
      <li>Усе інше стало плагіном. Дизайн-системи, зрізи, прототипи, експорти, старі робочі процеси Figma — усі вони живуть в одному форматі плагіна, реєструються через один маніфест, ізолюються через одну поверхню.</li>
      <li>CLI є канонічною точкою входу. Десктопний застосунок звертається до нього; так само й сервер OD MCP; так само й агент у вашому терміналі.</li>
      </ul>
      <p>305 PR у цьому релізі — це здебільшого робота з перенесення старого світу в нову форму. Деякі з них — це сама нова форма.</p>
      <h2>Три архітектурні плити</h2>
      <p><strong>Усе є плагіном.</strong> Поверхня реєстру плагінів тепер має детальну шухляду зі значками довіри, резервний механізм маркетплейсу з урахуванням обмежень швидкості GitHub, відполірований футер публікації та уніфіковану навігацію плагіни / інтеграції (#2087, #2064, #1806, #1849). Публікація плагіна створює справжній репозиторій GitHub під акаунтом автора (#2332, #2363), а шлях публікації CLI читає живу версію маніфесту замість того, щоб її підставляти заглушкою (#1903). Коли рушій росте, він росте тут, на видноті.</p>
      <p><strong>Безголовий за замовчуванням.</strong> Десктопний застосунок тепер є тонкою обгорткою навколо OD CLI. Той самий рушій працює з Claude Code, OpenClaw, Hermes Agent та чат-ботів у Lark, Discord і Slack. Кастомні профілі CLI-агентів виходять у цьому релізі (#378), тож ви можете під’єднати довільного CLI-агента до середовища виконання, не торкаючись ядра. Дизайн перестає бути місцем, куди ви йдете, і стає можливістю, яку мають ваші агенти. Саме на це вказував <a href="/blog/why-we-built-open-design-as-a-skill-layer/">маніфест рівня навичок</a>; 0.8.0 — це перший реліз, де шлях агента є канонічним шляхом, а не бічними дверима.</p>
      <p><strong>Плагіни створюють плагіни.</strong> OD CLI обгортає GitHub CLI, тож агент може клонувати репозиторій, скафолдити плагін, перевірити його, запакувати й відкрити PR — за вас або за себе. <a href="/blog/port-figma-workflow-open-design-plugin/">Посібник із перенесення робочого процесу Figma</a> розглядає людський шлях; автоматизована версія того самого шляху тепер доступна зсередини будь-якого агента, що має <code>gh</code> та <code>od</code> у <code>$PATH</code>. Рушій вирощує сам себе, на видноті, з вами в циклі.</p>
      <figure>
        <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="Одна плитка плагіна, що ковзає в док-слот модуля рушія, виділена зеленою рамкою на майже білому редакційному тлі">
        <figcaption>Усе є плагіном — навички, системи, зрізи й експорти всі докуються в один невеликий рушій.</figcaption>
      </figure>
      <h2>Що ще виходить у 0.8.0</h2>
      <p>Реліз широкий. Шматки, які варто винести наперед:</p>
      <ul>
      <li><strong>149 дизайн-систем зі структурованими <code>tokens.css</code> + маніфестами компонентів.</strong> Фікстури брендових токенів для Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor та ще 50 — кожна постачає <code>tokens.css</code> та <code>components.html</code>, що подаються через увімкнений за замовчуванням канал токенів (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). <a href="/blog/open-source-alternative-to-claude-design/">Логіка портативних систем</a> тепер є поверхнею за замовчуванням, а не бічними дверима.</li>
      <li><strong>Critique Theater аж до Фази 16.</strong> Те, що в 0.7.0 було єдиним спостережуваним суддею, тепер є повністю інструментованим циклом: Фаза 9 — обгортка вебклієнта з нативною i18n de / ja / ko / zh-TW, Фаза 11 — набір сценічних тестів Playwright, Фаза 12 з 9 метриками Prometheus + 6 log-подій + OTel span + дашборд Grafana, Фаза 15 — резолвер розгортання, Фаза 16 — храповик розгортання M-фази та <code>/api/critique/conformance</code> (#1315–#1320, #1338, #1483–#1485, #1499). Запущено в тіньовому режимі на M0 за замовчуванням.</li>
      <li><strong>Три нові медіапровайдери.</strong> Генерація зображень Leonardo.ai (#1123), аудіо ElevenLabs (#1384) та TTS SenseAudio плюс BYOK-чат з інструментами зображень і відео (#1633, #2065). Медіадиспетчер тепер розмовляє сумісно з OpenAI з усім, на що ви його спрямуєте.</li>
      <li><strong>Пакетне автооновлення на macOS і Windows.</strong> Перший реліз, де пакетні інсталяції самооновлюються від початку до кінця на обох платформах через один фід R2, з оновленим спливаючим вікном апдейтера, перевіреною передачею завантаження / встановлення та відновленням після перерваних застосувань (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). Пакетний GUI для Linux досі відкладено, поки ми зміцнюємо цю смугу; безголовий життєвий цикл і Nix flake обидва працюють сьогодні.</li>
      <li><strong>Італійська (it) локаль + резервний CJK-шрифт.</strong> UI тепер постачається 19 мовами, включно з італійською (#1323), а китайський / японський / корейський текст переходить на нативні для платформи шрифти замість латинської підстановки (#2227).</li>
      <li><strong>Зверху донизу візуальне оновлення.</strong> Нові іконки застосунку, брендові гліфи, оновлений вордмарк — один скоординований дроп якраз до зрізу (#2436).</li>
      </ul>
      <p>Повний список сягає 305 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Нотатки до релізу на GitHub</a> містять решту.</p>
      <h2>Що з цим робити сьогодні</h2>
      <p>Три шляхи, залежно від того, звідки ви починаєте.</p>





















      <table><thead><tr><th>Якщо ви…</th><th>Почніть тут</th></tr></thead><tbody><tr><td>Новачок в Open Design</td><td>Завантажте десктопний застосунок і дозвольте йому завести проєкт проти наявної дизайн-системи</td></tr><tr><td>Уже запускаєте Open Design</td><td>Дозвольте пакетному автооновленню привести вас до 0.8.0; спливаюче вікно апдейтера всередині застосунку проведе вас через перевірене встановлення</td></tr><tr><td>Будуєте плагін</td><td>Скафолдіть за допомогою <code>od plugin scaffold --id &#x3C;name></code>, перевірте за допомогою <code>od plugin validate ./&#x3C;path> --no-daemon</code> і відкрийте PR через той самий шлях публікації OD, що постачає кожен інший плагін у маркетплейсі</td></tr></tbody></table>
      <p>Якщо ви чекали, поки агентно-орієнтований цикл відчуватиметься як канонічний цикл, а не як демо, це той реліз. Спрямуйте Claude Code, Cursor, Codex чи будь-якого з 16 виявлених CLI-агентів на той самий OD CLI, з яким постачається десктопний застосунок, — і два шляхи сходяться після першого запиту.</p>
      <h2>Що робити далі</h2>
      <p>Найшвидший спосіб відчути різницю між 0.7 і 0.8 — встановити десктопний застосунок, дозволити йому підхопити вашого наявного агента й запустити той самий бриф, що ви запускали минулого місяця. Форма відповіді змінюється.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0">Завантажити для десктопа</a>.</p>
      <h2>Пов’язане для читання</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a> — довший маніфест за ставкою «рушій плюс плагіни», яку 0.8.0 остаточно відпрацьовує</li>
      <li><a href="/blog/port-figma-workflow-open-design-plugin/">Як перенести робочий процес Figma у плагін Open Design</a> — практична версія циклу «плагіни створюють плагіни»</li>
      <li><a href="/blog/open-source-alternative-to-claude-design/">Опенсорсна альтернатива Claude Design</a> — де цей реліз вписується в ландшафт агентно-орієнтованого дизайну</li>
      </ul>
---

Tag `open-design-v0.8.0` (`c20d156`), shipped 22 May 2026, 12:43 UTC. 305 PRs from 75 contributors in seven days. This is the release where we stopped trying to extend the old shape and rebuilt the engine underneath. The desktop app you'll download today is a thin wrapper around a CLI you can also point at from Claude Code, Cursor, or a Slack bot. The design systems, slices, prototypes, exports, and the old Figma-style workflows are no longer features baked into the engine — they're plugins, written against a small, boring core.

If you want the long version, the discussion thread has it. This post is the short version: what changed under the hood, what you can do with it today, and where to start.

## Why a rebuild, not another release

The 0.7 line had a problem. Every workflow lived inside the engine — design-system imports, deck templates, slice rendering, the Figma port, even the publish step — and adding the next thing meant editing the core. That is the dynamic that turned every editor before us into a plugin graveyard: a SaaS plugin API that locked behind a version, a "creator program" you had to apply to, a runtime that broke every two years.

We could have shipped 0.8 as another point release on that surface. Instead, we shipped the rewrite.

Underneath, three things are different now:

- The engine stayed small and boring. It runs skills, mounts plugins, calls agent adapters, and gets out of the way.
- Everything else became a plugin. Design systems, slices, prototypes, exports, the old Figma workflows — they all live in the same plugin format, registered through the same manifest, sandboxed through the same surface.
- The CLI is the canonical entry point. The desktop app calls into it; so does the OD MCP server; so does the agent in your terminal.

The 305 PRs in this release are mostly the work of porting the old world into the new shape. Some of them are the new shape itself.

## The three architectural plates

**Everything is a plugin.** The plugin registry surface now has a detail drawer with trust badges, a GitHub rate-limit-aware marketplace fallback, a polished publish footer, and a unified plugin / integration nav (#2087, #2064, #1806, #1849). Publishing a plugin creates a real GitHub repo under the author's account (#2332, #2363), and the CLI publish path reads the live manifest version instead of stubbing it (#1903). When the engine grows, it grows out here, in public.

**Headless by default.** The desktop app is now a thin wrapper around the OD CLI. The same engine runs from Claude Code, OpenClaw, Hermes Agent, and chat bots in Lark, Discord, and Slack. Custom CLI agent profiles ship in this release (#378), so you can plug an arbitrary CLI agent into the runtime without touching core. Design stops being a place you go and becomes a capability your agents have. This is what [the skill-layer manifesto](/blog/why-we-built-open-design-as-a-skill-layer/) was pointing at; 0.8.0 is the first release where the agent path is the canonical path, not a side door.

**Plugins create plugins.** OD CLI wraps GitHub CLI, so an agent can clone the repo, scaffold a plugin, validate it, pack it, and open a PR — for you, or for itself. The [how-to-port-a-Figma-workflow guide](/blog/port-figma-workflow-open-design-plugin/) walks the human path; the automated version of the same path is now reachable from inside any agent that has `gh` and `od` on `$PATH`. The engine grows itself, in public, with you in the loop.

<figure>
  <img src="/blog/open-design-0-8-0-everything-is-a-plugin-inline.webp" alt="A single plugin tile sliding into a docking slot on an engine module, selected in a green frame on a near-white editorial ground" />
  <figcaption>Everything is a plugin — skills, systems, slices, and exports all dock into the same small engine.</figcaption>
</figure>

## What else lands in 0.8.0

The release is wide. The pieces worth pulling forward:

- **149 design systems with structured `tokens.css` + components manifests.** Brand-token fixtures for Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor, and 50 more — each ships `tokens.css` and `components.html`, served through a default-on token channel (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). The [portable-system reasoning](/blog/open-source-alternative-to-claude-design/) is now the default surface, not a side door.
- **Critique Theater through Phase 16.** What was a single observable judge in 0.7.0 is now a fully-instrumented loop: Phase 9 web client wrapper with native de / ja / ko / zh-TW i18n, Phase 11 Playwright stage suite, Phase 12 with 9 Prometheus metrics + 6 log events + OTel span + Grafana dashboard, Phase 15 rollout resolver, Phase 16 M-phase rollout ratchet and `/api/critique/conformance` (#1315–#1320, #1338, #1483–#1485, #1499). Dark-launched at M0 by default.
- **Three new media providers.** Leonardo.ai image generation (#1123), ElevenLabs audio (#1384), and SenseAudio TTS plus BYOK chat with image and video tools (#1633, #2065). The media dispatcher now speaks OpenAI-compatible to anything you point it at.
- **Packaged auto-update on macOS and Windows.** First release where packaged installs self-update end-to-end on both platforms through the same R2 feed, with a refreshed updater popup, validated download / install handoff, and recovery from interrupted applies (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). The Linux packaged GUI is still deferred while we harden the lane; the headless lifecycle and the Nix flake both work today.
- **Italian (it) locale + CJK font fallback.** The UI now ships in 19 languages including Italian (#1323), and Chinese / Japanese / Korean text falls back to platform-native fonts instead of going through Latin substitution (#2227).
- **Top-to-bottom visual refresh.** New app icons, brand glyphs, refreshed wordmark — one coordinated drop in time for the cut (#2436).

The full list runs to 305 PRs. The [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0) carry the rest.

## What to do with it today

Three paths, depending on where you start.

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app and let it bootstrap a project against an existing design system |
| Already running Open Design | Let the packaged auto-update bring you to 0.8.0; the in-app updater popup walks you through the validated install |
| Building a plugin | Scaffold with `od plugin scaffold --id <name>`, validate with `od plugin validate ./<path> --no-daemon`, and open a PR through the same OD publish path that ships every other plugin in the marketplace |

If you've been waiting for the agent-native loop to feel like the canonical loop instead of a demo, this is the release. Point Claude Code, Cursor, Codex, or any of the 16 detected CLI agents at the same OD CLI the desktop app ships with, and the two paths converge after the first prompt.

## What to do next

The fastest way to feel the difference between 0.7 and 0.8 is to install the desktop app, let it pick up your existing agent, and run the same brief you ran last month. The shape of the answer changes.

[Download desktop](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0).

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "engine plus plugins" bet 0.8.0 finishes paying off
- [How to port a Figma workflow into an Open Design plugin](/blog/port-figma-workflow-open-design-plugin/) — the practical version of the "plugins create plugins" loop
- [The open-source alternative to Claude Design](/blog/open-source-alternative-to-claude-design/) — where this release fits in the agent-native design landscape
