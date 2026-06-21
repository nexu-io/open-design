---
title: "What Is Vibe Design? The 2026 Guide to Designing by Intent"
date: 2026-06-17
category: "Guides"
readingTime: 6
summary: "Describe the feeling and direction of a UI and let AI generate it — but most tools stop at a pretty mockup. Here's what vibe design really is, vibe design vs vibe coding, and how to take it from prompt to shipped code."
ctaKind: download-app
author: mira-zhao
i18n:
  zh:
    title: "什么是 vibe design（氛围设计）？2026 年「凭意图设计」完全指南"
    summary: "描述一个界面的感觉和方向，让 AI 把它生成出来——但大多数工具止步于一张漂亮的样稿。本文讲清 vibe design 到底是什么、vibe design 与 vibe coding 的区别，以及如何把它从提示词一路推进到可上线的代码。"
    category: "指南"
    bodyHtml: |
      <p>2026 年，设计师、创始人和产品工程师不断听到「vibe design」这个词——但一半文章是厂商的推销话术，另一半则从不提及 AI 吐出一个界面<em>之后</em>会发生什么。本指南给你一个清晰的定义、它的来龙去脉、工作流如何运转，以及那个谁都不愿谈的关键缺口：上线。</p>
      <h2>什么是 vibe design？</h2>
      <p><strong>vibe design 是一种界面与产品设计方式，你最主要的输入是意图</strong>——用自然语言、一张参考图或一个网址描述出来——<strong>然后由 AI 生成设计，而你凭感觉来掌舵</strong>，而不是亲手一笔一笔地做。</p>
      <p>你不再去摆放组件、微调间距、在取色器里翻找颜色，而是直接描述那种<em>氛围（vibe）</em>：基调、布局方向、想要的感觉。你扮演的角色不太像一个埋头打磨的匠人，而更像一位创意总监，负责审阅与重新指挥。它由三件事定义：</p>
      <ul>
      <li><strong>输入意图</strong>——一段提示词、一张截图、一个参考站点，或一份草稿。</li>
      <li><strong>输出生成</strong>——AI 返回的是真正的界面，而不是一块空白画布。</li>
      <li><strong>掌舵</strong>——你用自然语言点评、调整方向，直到它对味为止。</li>
      </ul>
      <h2>vibe design 与 vibe coding 的区别</h2>
      <p>这个词直接源自 <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding（氛围编程）</strong></a>，由 Andrej Karpathy 于 2025 年提出：不要手写代码——描述你想要什么，让 AI 去实现。<strong>vibe design 把同样「意图优先」的理念用到了视觉层。</strong></p>
      <table>
      <thead>
      <tr><th></th><th>vibe coding</th><th>vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>输入</strong></td><td>意图（它应该做什么）</td><td>意图（它应该长成什么样、给人什么感觉）</td></tr>
      <tr><td><strong>输出</strong></td><td>可运行的代码</td><td>可用的界面</td></tr>
      <tr><td><strong>你掌舵的依据</strong></td><td>行为与逻辑</td><td>基调、布局、审美</td></tr>
      <tr><td><strong>带火它的</strong></td><td>Karpathy，2025 年</td><td>Google Stitch，2026 年初</td></tr>
      </tbody>
      </table>
      <p>它们是同一场变革的两端，而在 2026 年正在合流：最好用的 agent 既<em>设计</em>又<em>构建</em>。Google 在 2026 年初发布 <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a>，把「vibe design」推向了主流，给了这个品类一个名字，也带来了一波搜索需求。</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Google Stitch 根据一段文字提示生成单个界面的截图占位图" />
        <figcaption>Google Stitch 把「vibe design」带向了主流——但止步于一个生成出来的界面。</figcaption>
      </figure>
      <h2>vibe design 实际是怎么运转的</h2>
      <p>一个典型的循环由四步构成：</p>
      <ol>
      <li><strong>描述氛围</strong>——「一个沉静、值得信赖的金融科技仪表盘，大量留白，只用一种点缀色。」</li>
      <li><strong>生成</strong>——AI 返回一个真实的界面（或好几个变体）。</li>
      <li><strong>掌舵</strong>——「再密一点」「色调更暖些」「加一个空状态」。</li>
      <li><strong>迭代</strong>，直到它符合你的意图。</li>
      </ol>
      <p>回报是速度与可及性：一两个人指挥一个 AI，一周就能产出几十个打磨过的概念稿，而非设计师也能不必苦学一款重型工具，就拿到一个像模像样的界面。</p>
      <p>在像 Open Design 这样的 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">agent 原生工作空间</a>里，这个循环在同一个界面上完成——你把氛围描述给同一个 agent，而它稍后就能写出代码，于是「设计的掌舵」和「产品的构建」不再是两个互不相通的工具。<em>（利益披露：Open Design 是我们做的。）</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Open Design 界面占位图，左侧是一段自然语言提示，右侧是生成出来的界面" />
        <figcaption>意图 → 生成 → 掌舵的循环，发生在 Open Design 中。</figcaption>
      </figure>
      <h2>谁都不谈的缺口：从样稿到上线</h2>
      <p>大多数「vibe design」工具就在这里悄悄停下了——停在一张<strong>静态样稿</strong>上。你拿到一个漂亮的界面，然后又得回过头去人工把它翻译成代码，而那份设计从此再也不会更新。</p>
      <p>真正的 vibe design 不应该终结于一张图片。更难、也更有价值的版本是 <strong>agentic vibe design（agent 驱动的氛围设计）</strong>：一个 agent 生成设计，<strong>对它做自我点评与持续演进，并把它上线为生产代码</strong>——在你掌舵的过程中始终让设计与代码保持同步。</p>
      <table>
      <thead>
      <tr><th>阶段</th><th>当今大多数工具</th><th>agentic vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>生成界面</td><td>✅</td><td>✅</td></tr>
      <tr><td>自我点评与迭代</td><td>❌ 只有一张静态界面</td><td>✅ agent 自行修改</td></tr>
      <tr><td>上线为真实代码</td><td>❌ 事后人工翻译</td><td>✅ 导出可运行代码</td></tr>
      <tr><td>让设计 ↔ 代码保持同步</td><td>❌</td><td>✅</td></tr>
      <tr><td>开源 / BYOK</td><td>大多封闭</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>这正是 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> 所深耕的赛道——开源、agent 原生的设计工作空间。你描述氛围，一个 agent 设计出界面、让它演进，并<a href="/blog/31-skills-72-systems-how-the-library-works/">把它上线为真实代码</a>；它是 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a>，与你早已在用的 coding agent（Claude Code、Cursor 等）协同工作，而不会把你锁进一块封闭的画布——所以下面的演示展示的是真实工作流，而不只是空口宣称。</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Open Design 界面占位图，展示一个生成出来的设计正在导出为生产代码" />
        <figcaption>agentic vibe design 的终点是可上线的代码，而不是一张截图。</figcaption>
      </figure>
      <blockquote>
      <p>我们日常反复跑的一个具体循环：给一个仪表盘下提示 → 拿到一个可用的布局 → 「收紧间距，加上暗色模式」 → agent <em>把设计和代码一起改</em> → 导出生产 HTML。产出的东西是可上线的，而不是一张截图。</p>
      </blockquote>
      <h2>关于 vibe design 的常见误区</h2>
      <ul>
      <li><strong>「它会取代设计师。」</strong>不会——它只是把设计师推向创意指挥与审美判断，那里更需要判断力，而非更不需要。</li>
      <li><strong>「它只能做用完即弃的样稿。」</strong>只有当工具止步于样稿时才如此。agentic 工具会把它一路带到代码。</li>
      <li><strong>「你得懂技术。」</strong>恰恰相反——意图本身就是界面。</li>
      <li><strong>「它不过就是 AI 生图。」</strong>vibe design 产出的是结构化、可编辑的界面，而不是一张扁平的图片。</li>
      </ul>
      <h2>今天就开始 vibe design 的方法</h2>
      <ol>
      <li><strong>选一款意图优先、能直达代码的工具</strong>，而不只是出样稿，这样你的工作才不会走进死胡同。</li>
      <li><strong>从参考开始</strong>——粘贴一张截图或一个网址；说清哪些要保留、哪些要改。</li>
      <li><strong>用大白话掌舵</strong>——在信息密度、配色、基调和各种状态上反复迭代。</li>
      <li><strong>尽早推到代码</strong>——设计越早变成真实代码，你就越早摸清什么行得通。</li>
      <li><strong>让它保持开放、属于你自己</strong>——开源 + BYOK 能在品类高速演进时避免被锁死。（如果你是从一块封闭画布过来的，这里有<a href="/blog/figma-alternative-open-design/">告别 Figma 的开源之路</a>，以及<a href="/blog/open-source-alternative-to-claude-design/">告别 Claude Design 的路径</a>。）</li>
      </ol>
      <h2>结语</h2>
      <p>vibe design 就是意图优先的设计：你描述，AI 生成，你掌舵。它脱胎于 vibe coding，又在 2026 年被 Google Stitch 推向主流，把想法与界面之间的距离压缩到了极致。但真正要紧的那个版本不会止步于一张样稿——<strong>它是 agentic 的，而且能上线为代码。</strong>从这里起步，vibe design 才会变成真正的产出，而不只是一张好看的图片。</p>
      <p><em>准备好试试了吗？<a href="/download">打开应用</a>，或者<a href="/plugins">浏览设计系统与 skills 库</a>。</em></p>
  zh-tw:
    title: "什麼是 vibe design？2026 年用意圖做設計的完整指南"
    summary: "描述一個 UI 的感覺與方向，讓 AI 把它生成出來——但多數工具都只停在一張漂亮的設計稿。本文說清楚 vibe design 究竟是什麼、vibe design 與 vibe coding 的差別，以及如何把它從一句提示一路推進到可上線的程式碼。"
    category: "指南"
    bodyHtml: |
      <p>設計師、創辦人與產品工程師在 2026 年不斷聽到「vibe design」這個詞——但有一半的文章是廠商的業配，另一半則從來沒講清楚在 AI 吐出一個畫面<em>之後</em>會發生什麼事。這份指南會給你一個清楚的定義、它的來龍去脈、工作流程怎麼跑，以及那個沒人願意談的缺口：上線。</p>
      <h2>什麼是 vibe design？</h2>
      <p><strong>vibe design 是一種 UI 與產品設計的取徑，你最主要的輸入是意圖</strong>——用自然語言、一張參考圖或一個網址來描述——<strong>再由 AI 生成設計，而你靠感覺來掌舵</strong>，而不是親手操刀。</p>
      <p>你不再一個個擺放元件、微調間距、在調色盤裡翻找顏色，而是描述那個<em>vibe</em>：調性、版面方向、感覺。你扮演的角色少了一點工匠味，多了一點創意總監的味道——負責審視與重新指引。它由三件事構成：</p>
      <ul>
      <li><strong>輸入意圖</strong>——一句提示、一張截圖、一個參考網站，或一張粗略的草圖。</li>
      <li><strong>輸出生成</strong>——AI 回傳真正的 UI，而不是一張空白畫布。</li>
      <li><strong>掌舵</strong>——你用自然語言評點與重新指引，直到對為止。</li>
      </ul>
      <h2>vibe design 與 vibe coding 的差別</h2>
      <p>這個詞直接源自 Andrej Karpathy 在 2025 年提出的 <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>：別再親手寫程式碼——描述你想要什麼，讓 AI 來實作。<strong>vibe design 把同樣這套「意圖優先」的哲學套用到視覺層。</strong></p>
      <table>
      <thead>
      <tr><th></th><th>vibe coding</th><th>vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>輸入</strong></td><td>意圖（它該做什麼）</td><td>意圖（它該長什麼樣、給人什麼感覺）</td></tr>
      <tr><td><strong>輸出</strong></td><td>可運作的程式碼</td><td>可運作的介面</td></tr>
      <tr><td><strong>你靠什麼掌舵</strong></td><td>行為與邏輯</td><td>調性、版面、品味</td></tr>
      <tr><td><strong>由誰帶起風潮</strong></td><td>Karpathy，2025 年</td><td>Google Stitch，2026 年初</td></tr>
      </tbody>
      </table>
      <p>它們是同一場轉變的兩端，而到了 2026 年正逐漸合流：最好用的 agent 既設計<em>又</em>動手做。Google 在 2026 年初推出 <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a>，把「vibe design」推向主流，為這個品類取了名字，也帶來一波搜尋需求。</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Google Stitch 從一段文字提示生成單一 UI 畫面的截圖示意圖" />
        <figcaption>Google Stitch 讓「vibe design」走向主流——但只停在一個生成出來的畫面。</figcaption>
      </figure>
      <h2>vibe design 實際上是怎麼運作的</h2>
      <p>一個典型的循環分四步：</p>
      <ol>
      <li><strong>描述 vibe</strong>——「一個沉穩、值得信賴的金融科技儀表板，大量留白，只用一個強調色。」</li>
      <li><strong>生成</strong>——AI 回傳一個真正的畫面（或好幾個變體）。</li>
      <li><strong>掌舵</strong>——「排得密一點」、「色調再暖一些」、「加一個空狀態」。</li>
      <li><strong>反覆迭代</strong>，直到它符合意圖。</li>
      </ol>
      <p>它換來的是速度與門檻的降低：一兩個人指揮 AI，一週就能產出數十個精緻的概念，而非設計師也能不必學一套笨重的工具就做出一個像樣的介面。</p>
      <p>在像 Open Design 這樣的<a href="/blog/why-we-built-open-design-as-a-skill-layer/">agent 原生工作空間</a>裡，這個循環就活在同一個介面上——你把 vibe 描述給同一個之後能寫程式碼的 agent，所以「掌舵設計」與「打造產品」就不再是兩個互不相通的工具。<em>（利益揭露：Open Design 是我們做的。）</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Open Design 介面示意圖，左側是一段自然語言提示，右側是生成出來的 UI" />
        <figcaption>意圖 → 生成 → 掌舵的循環，在 Open Design 裡。</figcaption>
      </figure>
      <h2>沒人願意談的缺口：從設計稿到上線</h2>
      <p>多數「vibe design」工具就在這裡悄悄停下了腳步——停在一張<strong>靜態的設計稿</strong>。你拿到一個漂亮的畫面，然後又得回頭親手把它翻成程式碼，而那份設計從此再也不會更新。</p>
      <p>真正的 vibe design 不該止步於一張圖。更難、也更有價值的版本是 <strong>agentic vibe design</strong>：一個 agent 生成設計、<strong>自我評點並讓它持續演進，再把它送進生產環境的程式碼</strong>——在你掌舵的同時，讓設計與程式碼保持同步。</p>
      <table>
      <thead>
      <tr><th>階段</th><th>當今多數工具</th><th>agentic vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>生成 UI</td><td>✅</td><td>✅</td></tr>
      <tr><td>自我評點與迭代</td><td>❌ 一張靜態畫面</td><td>✅ agent 自行修改</td></tr>
      <tr><td>輸出成真正的程式碼</td><td>❌ 之後再親手翻譯</td><td>✅ 匯出可運作的程式碼</td></tr>
      <tr><td>讓設計 ↔ 程式碼保持同步</td><td>❌</td><td>✅</td></tr>
      <tr><td>開源／BYOK</td><td>多半封閉</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>這正是 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> 耕耘的賽道——開源、agent 原生的設計工作空間。你描述 vibe，agent 設計出 UI、讓它演進，再<a href="/blog/31-skills-72-systems-how-the-library-works/">把它送進真正的程式碼</a>；它走 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a>，並且與你早已在用的 coding agent（Claude Code、Cursor 等）並肩運作，而不是把你鎖進一塊封閉的畫布——所以下面的實作演示是把工作流程跑給你看，而不只是嘴上說說。</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Open Design 介面示意圖，呈現一個生成出來的設計正在匯出成生產環境的程式碼" />
        <figcaption>agentic vibe design 的終點是可上線的程式碼，而不是一張截圖。</figcaption>
      </figure>
      <blockquote>
      <p>我們經常跑的一個具體循環：對著一個儀表板下提示 → 拿到一個可運作的版面 → 「把間距收緊一點，再加上深色模式」 → agent 把<em>設計與程式碼一起</em>改 → 匯出生產環境的 HTML。產出的成品是可以直接上線的，而不是一張截圖。</p>
      </blockquote>
      <h2>關於 vibe design 的常見迷思</h2>
      <ul>
      <li><strong>「它會取代設計師。」</strong>不會——它是把設計師移往創意指導與品味的位置，在那裡判斷力更重要，而非更不重要。</li>
      <li><strong>「它只能做一次性的設計稿。」</strong>只有當工具停在設計稿時才會這樣。agentic 的工具會把它一路帶到程式碼。</li>
      <li><strong>「你得懂技術才行。」</strong>恰恰相反——意圖就是介面。</li>
      <li><strong>「它不過就是 AI 生圖。」</strong>vibe design 產出的是結構化、可編輯的 UI，而不是一張扁平的圖片。</li>
      </ul>
      <h2>今天就開始做 vibe design 的方法</h2>
      <ol>
      <li><strong>挑一個能輸出到程式碼的意圖優先工具</strong>，而不只是設計稿，這樣你的成果才不會走進死胡同。</li>
      <li><strong>從一個參考開始</strong>——貼上一張截圖或網址；說清楚哪些要保留、哪些要改。</li>
      <li><strong>用大白話掌舵</strong>——在密度、配色、調性與各種狀態上反覆迭代。</li>
      <li><strong>盡早推進到程式碼</strong>——設計愈早變成真正的程式碼，你就愈早知道什麼行得通。</li>
      <li><strong>讓它保持開放、屬於你自己</strong>——開源 + BYOK 能在這個品類快速演進時避免被綁死。（如果你是從一塊封閉畫布走過來的，這裡有<a href="/blog/figma-alternative-open-design/">從 Figma 出走的開源路徑</a>，以及<a href="/blog/open-source-alternative-to-claude-design/">從 Claude Design 出走的路徑</a>。）</li>
      </ol>
      <h2>重點總結</h2>
      <p>vibe design 是意圖優先的設計：你描述，AI 生成，你掌舵。它脫胎自 vibe coding，並在 2026 年由 Google Stitch 推向主流，把點子與介面之間的距離壓縮到幾乎為零。但真正重要的那個版本不會停在一張設計稿——<strong>它是 agentic 的，而且會輸出到程式碼。</strong>從那裡開始，vibe design 才會變成真正的產出，而不只是一張好看的圖。</p>
      <p><em>準備好試試了嗎？<a href="/download">開啟 App</a> 或<a href="/plugins">瀏覽設計系統與技能庫</a>。</em></p>
  ja:
    title: "vibe design（バイブデザイン）とは？意図でデザインする2026年版ガイド"
    summary: "UIの雰囲気と方向性を言葉で伝え、あとはAIに生成させる——けれど、ほとんどのツールは見栄えのいいモックアップで止まってしまいます。本記事では、vibe designの本当の意味、vibe designとvibe codingの違い、そしてプロンプトから実際に出荷できるコードへ持っていく方法を解説します。"
    category: "ガイド"
    bodyHtml: |
      <p>2026年、デザイナーも創業者もプロダクトエンジニアも「vibe design」という言葉を耳にし続けています——けれど記事の半分はベンダーの売り込みで、残りの半分はAIが画面を吐き出した<em>あと</em>に何が起こるのかを語りません。本ガイドでは、明確な定義、その系譜、ワークフローの回し方、そして誰も口にしないたった一つのギャップ——出荷（シッピング）について整理します。</p>
      <h2>vibe designとは？</h2>
      <p><strong>vibe designとは、主たる入力が「意図」——自然言語、参照画像、あるいはURLで表現されたもの——であり、手作業ではなく感覚で舵を取りながらAIにデザインを生成させる、UI・プロダクトデザインのアプローチです</strong>。</p>
      <p>コンポーネントを配置し、余白を微調整し、カラーピッカーを探し回る代わりに、あなたは<em>vibe（雰囲気）</em>——トーン、レイアウトの方向性、感触——を言葉で伝えます。職人というより、レビューして方向を修正するクリエイティブディレクターのように振る舞うのです。これを定義づけるのは3つの要素です。</p>
      <ul>
      <li><strong>意図を入れる</strong>——プロンプト、スクリーンショット、参照サイト、あるいはラフスケッチ。</li>
      <li><strong>生成が返る</strong>——AIは白紙のキャンバスではなく、実際のUIを返します。</li>
      <li><strong>舵取り</strong>——納得いくまで、自然言語で批評し方向を修正します。</li>
      </ul>
      <h2>vibe designとvibe codingの違い</h2>
      <p>この言葉は、2025年にAndrej Karpathyが提唱した<a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>を直接の祖先としています——コードを手で書くのではなく、欲しいものを言葉で伝えてAIに実装させる、という考え方です。<strong>vibe designは、その同じ「意図ファースト」の哲学をビジュアルレイヤーに適用したものです</strong>。</p>
      <table>
      <thead>
      <tr><th></th><th>vibe coding</th><th>vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>入力</strong></td><td>意図（何をすべきか）</td><td>意図（どう見え、どう感じさせるか）</td></tr>
      <tr><td><strong>出力</strong></td><td>動くコード</td><td>動くインターフェース</td></tr>
      <tr><td><strong>舵取りの軸</strong></td><td>振る舞いとロジック</td><td>トーン、レイアウト、センス</td></tr>
      <tr><td><strong>広めたのは</strong></td><td>Karpathy、2025年</td><td>Google Stitch、2026年初頭</td></tr>
      </tbody>
      </table>
      <p>両者は同じ大きな変化の両端であり、2026年には収束しつつあります——もっとも役に立つエージェントは、デザイン<em>と</em>ビルドの両方をこなすのです。Googleは2026年初頭の<a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a>のローンチで「vibe design」を一気に主流へと押し上げ、このカテゴリーに名前と検索需要の波をもたらしました。</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="テキストプロンプトから単一のUI画面を生成するGoogle Stitchのスクリーンショットのプレースホルダー" />
        <figcaption>Google Stitchは「vibe design」を主流にしました——ただし生成された画面で止まってしまいます。</figcaption>
      </figure>
      <h2>vibe designの実際の進め方</h2>
      <p>典型的なループは、4つの動きで回ります。</p>
      <ol>
      <li><strong>vibeを言葉にする</strong>——「落ち着いていて信頼感のあるフィンテックのダッシュボード、余白たっぷり、アクセントカラーは1色」。</li>
      <li><strong>生成する</strong>——AIが実際の画面（または複数のバリエーション）を返します。</li>
      <li><strong>舵を取る</strong>——「もっと密度を上げて」「もっと暖かいパレットに」「空の状態（エンプティステート）を追加して」。</li>
      <li><strong>反復する</strong>——意図と一致するまで繰り返します。</li>
      </ol>
      <p>見返りはスピードとアクセスのしやすさです。1人か2人がAIを指揮すれば、週に何十もの洗練されたコンセプトを生み出せますし、デザイナーでない人でも重厚なツールを覚えることなく、説得力のあるインターフェースにたどり着けます。</p>
      <p>Open Designのような<a href="/blog/why-we-built-open-design-as-a-skill-layer/">エージェントネイティブなワークスペース</a>では、このループが一つの面の上に収まります——あなたがvibeを伝える相手は、後でコードまで書けるのと同じエージェントなので、デザインの舵取りとプロダクトのビルドが分断された2つのツールに分かれることはありません。<em>（開示：私たちはOpen Designを開発しています。）</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="左に自然言語のプロンプト、右に生成されたUIを示すOpen Designインターフェースのプレースホルダー" />
        <figcaption>意図 → 生成 → 舵取りのループを、Open Designで。</figcaption>
      </figure>
      <h2>誰も語らないギャップ——モックアップから出荷へ</h2>
      <p>ここが、ほとんどの「vibe design」ツールがそっと止まってしまう場所です——<strong>静的なモックアップ</strong>のところで。美しい画面は手に入るものの、そこから先は自分の手でコードに翻訳し直す作業に逆戻りし、デザインは二度と更新されません。</p>
      <p>本物のvibe designは、絵で終わるべきではありません。より難しく、より価値のあるバージョンが<strong>エージェント型のvibe design</strong>です——デザインを生成し、<strong>それを批評して進化させ、本番コードまで出荷する</strong>エージェント。舵を取るそばから、デザインとコードを同期させ続けます。</p>
      <table>
      <thead>
      <tr><th>段階</th><th>今日のほとんどのツール</th><th>エージェント型のvibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>UIを生成する</td><td>✅</td><td>✅</td></tr>
      <tr><td>自己批評して反復する</td><td>❌ 静的な画面が1枚</td><td>✅ エージェントが修正する</td></tr>
      <tr><td>実際のコードへ出荷する</td><td>❌ あとで手作業で翻訳</td><td>✅ 動くコードを書き出す</td></tr>
      <tr><td>デザイン ↔ コードを同期させ続ける</td><td>❌</td><td>✅</td></tr>
      <tr><td>オープンソース / BYOK</td><td>たいていクローズド</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>これこそ<a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a>が走るレーンです——オープンソースで、エージェントネイティブなデザインワークスペースです。あなたがvibeを伝えると、エージェントがUIをデザインし、それを進化させ、<a href="/blog/31-skills-72-systems-how-the-library-works/">実際のコードへ出荷します</a>。<a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a>に対応し、クローズドなキャンバスに閉じ込めるのではなく、あなたがすでに使っているコーディングエージェント（Claude CodeやCursorなど）と並んで動きます——だから、下のウォークスルーはワークフローを主張するだけでなく、実際に見せます。</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="生成されたデザインを本番コードへ書き出すOpen Designインターフェースのプレースホルダー" />
        <figcaption>エージェント型のvibe designは、スクリーンショットではなく、出荷できるコードで終わります。</figcaption>
      </figure>
      <blockquote>
      <p>私たちが常に回している具体的なループ：ダッシュボードをプロンプトする → 動くレイアウトを得る → 「余白を詰めてダークモードを追加して」 → エージェントが<em>デザインとコードを一緒に</em>修正する → 本番用のHTMLを書き出す。成果物はスクリーンショットではなく、出荷できるものです。</p>
      </blockquote>
      <h2>vibe designにまつわるよくある誤解</h2>
      <ul>
      <li><strong>「デザイナーを置き換える」</strong>——いいえ。デザイナーをクリエイティブディレクションとセンスへとシフトさせるのであって、そこでは判断力がより重要になります。決して軽くはなりません。</li>
      <li><strong>「使い捨てのモックアップしか作れない」</strong>——それはツールがモックアップで止まる場合だけです。エージェント型のツールは、それをコードまで持っていきます。</li>
      <li><strong>「技術的な知識が必要」</strong>——むしろ逆です。意図こそがインターフェースなのです。</li>
      <li><strong>「ただのAI画像生成でしょ」</strong>——vibe designは平らな絵ではなく、構造化された編集可能なUIを生み出します。</li>
      </ul>
      <h2>今日からvibe designを始めるには</h2>
      <ol>
      <li><strong>モックアップだけでなく、コードまで出荷できる「意図ファースト」のツールを選ぶ</strong>——作業が行き止まりにならないように。</li>
      <li><strong>参照から始める</strong>——スクリーンショットやURLを貼り付け、何を残し何を変えるかを伝えます。</li>
      <li><strong>普段の言葉で舵を取る</strong>——密度、パレット、トーン、各状態を反復します。</li>
      <li><strong>早めにコードへ落とす</strong>——デザインが実際のコードになるのが早いほど、何がうまくいくかを早く学べます。</li>
      <li><strong>オープンで、自分のものに保つ</strong>——オープンソース + BYOKなら、カテゴリーが速く動く中でもロックインを避けられます。（クローズドなキャンバスから移ってくるなら、<a href="/blog/figma-alternative-open-design/">Figmaから離れるオープンソースの道</a>や、<a href="/blog/open-source-alternative-to-claude-design/">Claude Designからの道</a>はこちらです。）</li>
      </ol>
      <h2>まとめ</h2>
      <p>vibe designとは意図ファーストのデザインです——あなたが言葉で伝え、AIが生成し、あなたが舵を取る。vibe codingから生まれ、2026年にGoogle Stitchによって主流へと押し上げられたこの手法は、アイデアとインターフェースの距離を一気に縮めます。けれど、本当に意味を持つバージョンはモックアップで止まりません——<strong>それはエージェント型であり、コードまで出荷します。</strong>そこから始めれば、vibe designは見栄えのいい絵ではなく、本物の成果物になります。</p>
      <p><em>試してみる準備はできましたか？ <a href="/download">アプリを開く</a>か、<a href="/plugins">デザインシステムとスキルのライブラリを見る</a>。</em></p>
  ko:
    title: "바이브 디자인(Vibe Design)이란? 의도로 디자인하는 2026년 가이드"
    summary: "UI의 느낌과 방향을 말로 설명하면 AI가 디자인을 만들어 줍니다. 하지만 대부분의 도구는 그럴듯한 목업에서 멈추죠. 바이브 디자인이 진짜로 무엇인지, vibe design과 vibe coding은 어떻게 다른지, 그리고 프롬프트에서 배포 가능한 코드까지 끌고 가는 방법을 정리했습니다."
    category: "가이드"
    bodyHtml: |
      <p>2026년, 디자이너와 창업자, 프로덕트 엔지니어들이 "vibe design"이라는 말을 끊임없이 듣고 있습니다. 그런데 관련 글의 절반은 벤더의 영업 멘트이고, 나머지 절반은 AI가 화면을 뱉어낸 <em>이후</em>에 무슨 일이 벌어지는지 끝내 말해 주지 않습니다. 이 가이드에서는 명확한 정의와 그 계보, 워크플로가 돌아가는 방식, 그리고 아무도 말하지 않는 단 하나의 빈틈, 바로 배포(shipping)에 대해 짚어 봅니다.</p>
      <h2>바이브 디자인이란?</h2>
      <p><strong>바이브 디자인(vibe design)은 의도(intent)를 기본 입력으로 삼는 UI·프로덕트 디자인 방식입니다.</strong> 자연어나 참고 이미지, URL로 의도를 설명하면 <strong>AI가 디자인을 생성하고, 당신은 손으로 일일이 만지는 대신 감각으로 방향을 잡습니다.</strong></p>
      <p>컴포넌트를 배치하고 간격을 미세하게 조정하고 컬러 피커를 뒤지는 대신, 당신은 <em>바이브</em>를 설명합니다. 톤, 레이아웃의 방향, 느낌 말이죠. 장인보다는 결과물을 검토하고 방향을 다시 잡아 주는 크리에이티브 디렉터에 가깝게 일하게 됩니다. 이를 정의하는 세 가지 요소가 있습니다.</p>
      <ul>
      <li><strong>의도 입력</strong> — 프롬프트, 스크린샷, 참고 사이트, 또는 대략적인 스케치.</li>
      <li><strong>생성 출력</strong> — AI가 빈 캔버스가 아니라 실제 UI를 돌려줍니다.</li>
      <li><strong>방향 잡기</strong> — 마음에 들 때까지 자연어로 비평하고 다시 방향을 잡습니다.</li>
      </ul>
      <h2>Vibe design vs vibe coding</h2>
      <p>이 용어는 2025년 Andrej Karpathy가 만든 <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>에서 곧장 내려온 것입니다. 코드를 직접 손으로 쓰지 말고, 원하는 바를 설명한 뒤 AI가 구현하게 하라는 것이죠. <strong>바이브 디자인은 바로 그 "의도 우선" 철학을 시각적 레이어에 적용한 것입니다.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>입력</strong></td><td>의도(무엇을 해야 하는가)</td><td>의도(어떻게 보이고 느껴져야 하는가)</td></tr>
      <tr><td><strong>출력</strong></td><td>동작하는 코드</td><td>동작하는 인터페이스</td></tr>
      <tr><td><strong>방향을 잡는 기준</strong></td><td>동작과 로직</td><td>톤, 레이아웃, 취향</td></tr>
      <tr><td><strong>대중화한 주체</strong></td><td>Karpathy, 2025년</td><td>Google Stitch, 2026년 초</td></tr>
      </tbody>
      </table>
      <p>둘은 같은 변화의 양 끝이며, 2026년에는 서로 수렴하고 있습니다. 가장 쓸모 있는 에이전트는 디자인을 하는 <em>동시에</em> 만들어 냅니다. Google은 2026년 초 <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a>를 출시하며 "vibe design"을 주류로 끌어올렸고, 이 분야에 이름과 함께 검색 수요의 물결을 안겨 주었습니다.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="텍스트 프롬프트로부터 단일 UI 화면을 생성하는 Google Stitch의 스크린샷 자리표시 이미지" />
        <figcaption>Google Stitch는 "vibe design"을 주류로 만들었지만, 생성된 화면에서 멈춥니다.</figcaption>
      </figure>
      <h2>바이브 디자인은 실제로 어떻게 작동하나</h2>
      <p>전형적인 루프는 네 단계로 돌아갑니다.</p>
      <ol>
      <li><strong>바이브를 설명한다</strong> — "차분하고 신뢰감 있는 핀테크 대시보드, 여백을 넉넉하게, 강조색은 하나만."</li>
      <li><strong>생성한다</strong> — AI가 실제 화면(또는 여러 변형)을 돌려준다.</li>
      <li><strong>방향을 잡는다</strong> — "더 밀도 있게", "더 따뜻한 팔레트로", "빈 상태(empty state)도 추가해 줘."</li>
      <li>의도와 맞아떨어질 때까지 <strong>반복한다.</strong></li>
      </ol>
      <p>그 보상은 속도와 접근성입니다. 한두 사람이 AI를 지휘하면 한 주에 다듬어진 콘셉트를 수십 개씩 만들어 낼 수 있고, 디자이너가 아닌 사람도 무거운 도구를 익히지 않고 그럴듯한 인터페이스에 도달할 수 있습니다.</p>
      <p>Open Design처럼 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">에이전트 네이티브한 작업 공간</a>에서는 이 루프가 하나의 화면 안에서 살아 움직입니다. 나중에 코드를 작성할 수 있는 바로 그 에이전트에게 바이브를 설명하므로, 디자인을 다듬는 일과 프로덕트를 만드는 일이 서로 단절된 두 개의 도구가 아닙니다. <em>(고지: 우리는 Open Design을 만드는 팀입니다.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="왼쪽에 자연어 프롬프트, 오른쪽에 생성된 UI가 표시된 Open Design 인터페이스 자리표시 이미지" />
        <figcaption>의도 → 생성 → 방향 잡기 루프, Open Design에서.</figcaption>
      </figure>
      <h2>아무도 말하지 않는 빈틈: 목업에서 배포까지</h2>
      <p>바로 여기에서 대부분의 "vibe design" 도구가 조용히 멈춥니다. 바로 <strong>정적인 목업</strong>에서요. 아름다운 화면 하나를 얻지만, 그다음에는 다시 손으로 코드로 옮겨야 하고, 그 디자인은 두 번 다시 갱신되지 않습니다.</p>
      <p>진짜 바이브 디자인은 그림에서 끝나서는 안 됩니다. 더 어렵지만 더 가치 있는 버전은 <strong>에이전틱 바이브 디자인(agentic vibe design)</strong>입니다. 디자인을 생성하고, <strong>스스로 비평하며 발전시키고, 프로덕션 코드로 배포까지</strong> 해내는 에이전트, 그리고 당신이 방향을 잡는 동안 디자인과 코드를 계속 동기화 상태로 유지하는 에이전트 말이죠.</p>
      <table>
      <thead>
      <tr><th>단계</th><th>오늘날 대부분의 도구</th><th>에이전틱 바이브 디자인</th></tr>
      </thead>
      <tbody>
      <tr><td>UI 생성</td><td>✅</td><td>✅</td></tr>
      <tr><td>스스로 비평하고 반복</td><td>❌ 정적인 화면 하나</td><td>✅ 에이전트가 수정</td></tr>
      <tr><td>실제 코드로 배포</td><td>❌ 나중에 손으로 변환</td><td>✅ 동작하는 코드로 내보내기</td></tr>
      <tr><td>디자인 ↔ 코드 동기화 유지</td><td>❌</td><td>✅</td></tr>
      <tr><td>오픈소스 / BYOK</td><td>대부분 폐쇄형</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>이것이 바로 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a>이 자리 잡은 영역입니다. 오픈소스이자 에이전트 네이티브한 디자인 작업 공간이죠. 바이브를 설명하면 에이전트가 UI를 디자인하고, 발전시키며, <a href="/blog/31-skills-72-systems-how-the-library-works/">실제 코드로 배포</a>합니다. <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> 방식이고, 폐쇄형 캔버스에 당신을 가두는 대신 당신이 이미 쓰고 있는 코딩 에이전트(Claude Code, Cursor 등)와 나란히 동작합니다. 그래서 아래 따라가기 예시는 그 워크플로를 말로만 주장하지 않고 실제로 보여 줍니다.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="생성된 디자인을 프로덕션 코드로 내보내는 모습을 보여 주는 Open Design 인터페이스 자리표시 이미지" />
        <figcaption>에이전틱 바이브 디자인은 스크린샷이 아니라 배포 가능한 코드로 끝납니다.</figcaption>
      </figure>
      <blockquote>
      <p>우리가 늘 돌리는 구체적인 루프 하나: 대시보드를 프롬프트로 요청한다 → 동작하는 레이아웃을 받는다 → "간격을 더 조이고 다크 모드를 추가해 줘" → 에이전트가 <em>디자인과 코드를 함께</em> 수정한다 → 프로덕션 HTML로 내보낸다. 결과물은 스크린샷이 아니라 배포 가능한 산출물입니다.</p>
      </blockquote>
      <h2>바이브 디자인에 관한 흔한 오해</h2>
      <ul>
      <li><strong>"디자이너를 대체한다."</strong> 아닙니다. 디자이너를 크리에이티브 디렉션과 취향의 영역으로 옮겨 줄 뿐이며, 그곳에서는 판단력이 덜 중요해지는 게 아니라 더 중요해집니다.</li>
      <li><strong>"버리는 목업밖에 못 만든다."</strong> 도구가 목업에서 멈출 때만 그렇습니다. 에이전틱 도구는 그것을 코드까지 끌고 갑니다.</li>
      <li><strong>"기술에 능해야 한다."</strong> 정반대입니다. 의도 자체가 인터페이스입니다.</li>
      <li><strong>"그냥 AI 이미지 생성일 뿐이다."</strong> 바이브 디자인은 평평한 그림이 아니라 구조화되고 편집 가능한 UI를 만들어 냅니다.</li>
      </ul>
      <h2>오늘 바이브 디자인을 시작하는 법</h2>
      <ol>
      <li><strong>목업이 아니라 코드까지 배포하는, 의도 우선 도구를 고르세요.</strong> 그래야 작업이 막다른 길에서 끝나지 않습니다.</li>
      <li><strong>참고 자료에서 출발하세요.</strong> 스크린샷이나 URL을 붙여 넣고, 무엇을 유지하고 무엇을 바꿀지 말하세요.</li>
      <li><strong>평범한 말로 방향을 잡으세요.</strong> 밀도, 팔레트, 톤, 각종 상태를 반복하며 다듬으세요.</li>
      <li><strong>일찍 코드로 밀어붙이세요.</strong> 디자인이 실제 코드가 되는 순간이 빠를수록, 무엇이 통하는지를 더 빨리 배웁니다.</li>
      <li><strong>열려 있고 당신 것으로 유지하세요.</strong> 오픈소스 + BYOK는 분야가 빠르게 움직일 때 종속(lock-in)을 피하게 해 줍니다. (폐쇄형 캔버스에서 넘어오는 길이라면, 여기 <a href="/blog/figma-alternative-open-design/">Figma에서 벗어나는 오픈소스 경로</a>와 <a href="/blog/open-source-alternative-to-claude-design/">Claude Design에서 벗어나는 경로</a>가 있습니다.)</li>
      </ol>
      <h2>핵심 정리</h2>
      <p>바이브 디자인은 의도 우선의 디자인입니다. 당신이 설명하면 AI가 생성하고, 당신이 방향을 잡습니다. vibe coding에서 태어나 2026년 Google Stitch가 주류로 끌어올린 이 방식은 아이디어와 인터페이스 사이의 거리를 무너뜨립니다. 하지만 진짜 중요한 버전은 목업에서 멈추지 않습니다. <strong>그것은 에이전틱하며, 코드로 배포합니다.</strong> 거기서부터 시작하면 바이브 디자인은 그저 보기 좋은 그림이 아니라 진짜 산출물이 됩니다.</p>
      <p><em>지금 써 볼 준비가 되셨나요? <a href="/download">앱 열기</a> 또는 <a href="/plugins">디자인 시스템·스킬 라이브러리 둘러보기</a>.</em></p>
  de:
    title: "Was ist Vibe Design? Der Leitfaden 2026 zum Gestalten nach Absicht"
    summary: "Beschreibe Gefühl und Richtung einer UI und lass die KI sie erzeugen – doch die meisten Tools enden bei einem hübschen Mockup. Hier erfährst du, was Vibe Design wirklich ist, vibe design vs. vibe coding und wie du es vom Prompt bis zum ausgelieferten Code bringst."
    category: "Leitfäden"
    bodyHtml: |
      <p>Designer, Gründerinnen und Product Engineers hören 2026 ständig von „vibe design“ – aber die Hälfte der Artikel sind Werbeversprechen von Anbietern, und die andere Hälfte sagt nie, was passiert, <em>nachdem</em> die KI einen Screen ausgespuckt hat. Dieser Leitfaden liefert dir eine klare Definition, die Herkunft, den Ablauf des Workflows und die eine Lücke, über die niemand spricht: das Ausliefern.</p>
      <h2>Was ist vibe design?</h2>
      <p><strong>Vibe design ist ein Ansatz für UI- und Produktdesign, bei dem dein zentraler Input die Absicht ist</strong> – ausgedrückt in natürlicher Sprache, als Referenzbild oder als URL – <strong>und eine KI das Design erzeugt, während du nach Gefühl steuerst</strong> statt von Hand.</p>
      <p>Statt Komponenten zu platzieren, Abstände zu justieren und dich durch Farbwähler zu klicken, beschreibst du den <em>Vibe</em>: den Ton, die Layout-Richtung, das Gefühl. Du agierst weniger wie ein Handwerker und mehr wie ein Creative Director, der prüft und neu ausrichtet. Drei Dinge machen es aus:</p>
      <ul>
      <li><strong>Absicht hinein</strong> – ein Prompt, ein Screenshot, eine Referenz-Site oder eine grobe Skizze.</li>
      <li><strong>Erzeugung heraus</strong> – die KI liefert echtes UI zurück, keine leere Leinwand.</li>
      <li><strong>Steuern</strong> – du kritisierst und korrigierst in natürlicher Sprache, bis es passt.</li>
      </ul>
      <h2>Vibe design vs. vibe coding</h2>
      <p>Der Begriff stammt direkt von <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a> ab, das Andrej Karpathy 2025 geprägt hat: Schreibe Code nicht von Hand – beschreibe, was du willst, und lass die KI es umsetzen. <strong>Vibe design überträgt genau diese „Absicht zuerst“-Philosophie auf die visuelle Ebene.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Input</strong></td><td>Absicht (was es tun soll)</td><td>Absicht (wie es aussehen &amp; sich anfühlen soll)</td></tr>
      <tr><td><strong>Output</strong></td><td>Funktionierender Code</td><td>Funktionierende Oberfläche</td></tr>
      <tr><td><strong>Du steuerst über</strong></td><td>Verhalten &amp; Logik</td><td>Ton, Layout, Geschmack</td></tr>
      <tr><td><strong>Bekannt gemacht durch</strong></td><td>Karpathy, 2025</td><td>Google Stitch, Anfang 2026</td></tr>
      </tbody>
      </table>
      <p>Sie sind zwei Enden derselben Verschiebung, und 2026 wachsen sie zusammen: Die nützlichsten Agents gestalten <em>und</em> bauen. Google brachte „vibe design“ mit dem <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a>-Launch Anfang 2026 in den Mainstream und gab der Kategorie einen Namen sowie eine Welle an Suchnachfrage.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Platzhalter-Screenshot von Google Stitch, das aus einem Text-Prompt einen einzelnen UI-Screen erzeugt" />
        <figcaption>Google Stitch hat „vibe design“ in den Mainstream gebracht – endet aber bei einem erzeugten Screen.</figcaption>
      </figure>
      <h2>Wie vibe design tatsächlich funktioniert</h2>
      <p>Eine typische Schleife läuft in vier Schritten ab:</p>
      <ol>
      <li><strong>Den Vibe beschreiben</strong> – „ein ruhiges, vertrauenswürdiges Fintech-Dashboard, viel Weißraum, eine Akzentfarbe.“</li>
      <li><strong>Erzeugen</strong> – die KI liefert einen echten Screen zurück (oder mehrere Varianten).</li>
      <li><strong>Steuern</strong> – „mach es dichter“, „wärmere Palette“, „füge einen Empty State hinzu“.</li>
      <li><strong>Iterieren</strong>, bis es der Absicht entspricht.</li>
      </ol>
      <p>Der Gewinn liegt in Tempo und Zugang: Ein oder zwei Personen, die eine KI dirigieren, können Dutzende ausgefeilte Konzepte pro Woche erstellen, und Nicht-Designer kommen zu einer glaubwürdigen Oberfläche, ohne ein schwergewichtiges Tool lernen zu müssen.</p>
      <p>In einem <a href="/blog/why-we-built-open-design-as-a-skill-layer/">agent-nativen Workspace</a> wie Open Design lebt diese Schleife auf einer einzigen Oberfläche – du beschreibst den Vibe demselben Agent, der später den Code schreiben kann, sodass das Steuern des Designs und das Bauen des Produkts keine zwei getrennten Werkzeuge sind. <em>(Offenlegung: Wir entwickeln Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Platzhalter der Open-Design-Oberfläche mit einem Prompt in natürlicher Sprache links und einer erzeugten UI rechts" />
        <figcaption>Die Schleife Absicht → Erzeugen → Steuern, in Open Design.</figcaption>
      </figure>
      <h2>Die Lücke, über die niemand spricht: vom Mockup zum ausgelieferten Produkt</h2>
      <p>Hier hören die meisten „vibe design“-Tools klammheimlich auf – bei einem <strong>statischen Mockup</strong>. Du bekommst einen schönen Screen, und dann sitzt du wieder daran, ihn von Hand in Code zu übersetzen, und das Design aktualisiert sich nie wieder.</p>
      <p>Echtes vibe design sollte nicht bei einem Bild enden. Die schwierigere, wertvollere Variante ist <strong>agentic vibe design</strong>: ein Agent, der das Design erzeugt, <strong>es kritisiert und weiterentwickelt und es in produktiven Code ausliefert</strong> – und Design und Code synchron hält, während du steuerst.</p>
      <table>
      <thead>
      <tr><th>Phase</th><th>Die meisten Tools heute</th><th>Agentic vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>UI erzeugen</td><td>✅</td><td>✅</td></tr>
      <tr><td>Selbstkritik &amp; Iteration</td><td>❌ ein statischer Screen</td><td>✅ der Agent überarbeitet</td></tr>
      <tr><td>In echten Code ausliefern</td><td>❌ später von Hand übersetzen</td><td>✅ exportiert funktionierenden Code</td></tr>
      <tr><td>Design ↔ Code synchron halten</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open Source / BYOK</td><td>meist geschlossen</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Genau in dieser Spur arbeitet <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> – der quelloffene, agent-native Design-Workspace. Du beschreibst den Vibe, ein Agent gestaltet die UI, entwickelt sie weiter und <a href="/blog/31-skills-72-systems-how-the-library-works/">liefert sie in echten Code aus</a>; das Ganze ist BYOK und arbeitet zusammen mit dem Coding-Agent, den du ohnehin schon nutzt (Claude Code, Cursor und andere), statt dich in eine geschlossene Leinwand einzusperren – die Schritt-für-Schritt-Vorführung unten zeigt den Workflow also, anstatt ihn nur zu behaupten. Es ist <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> (Bring Your Own Key).</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Platzhalter der Open-Design-Oberfläche, die ein erzeugtes Design in produktiven Code exportiert" />
        <figcaption>Agentic vibe design endet in auslieferbarem Code, nicht in einem Screenshot.</figcaption>
      </figure>
      <blockquote>
      <p>Eine konkrete Schleife, die wir ständig durchlaufen: ein Dashboard prompten → ein funktionierendes Layout erhalten → „verdichte die Abstände und füge einen Dark Mode hinzu“ → der Agent überarbeitet <em>Design und Code gemeinsam</em> → produktives HTML exportieren. Das Artefakt ist auslieferbar, kein Screenshot.</p>
      </blockquote>
      <h2>Verbreitete Mythen über vibe design</h2>
      <ul>
      <li><strong>„Es ersetzt Designer.“</strong> Nein – es verschiebt sie hin zu Creative Direction und Geschmack, wo das Urteilsvermögen mehr zählt, nicht weniger.</li>
      <li><strong>„Es erzeugt nur Wegwerf-Mockups.“</strong> Nur, wenn das Tool bei Mockups stehen bleibt. Agentic-Tools bringen es bis in den Code.</li>
      <li><strong>„Man muss technisch sein.“</strong> Im Gegenteil – die Absicht ist die Schnittstelle.</li>
      <li><strong>„Das ist doch nur KI-Bildgenerierung.“</strong> Vibe design erzeugt strukturierte, editierbare UI, kein flaches Bild.</li>
      </ul>
      <h2>Wie du noch heute mit vibe design loslegst</h2>
      <ol>
      <li><strong>Wähle ein „Absicht zuerst“-Tool, das in Code ausliefert</strong>, nicht nur Mockups, damit deine Arbeit nicht in einer Sackgasse landet.</li>
      <li><strong>Starte von einer Referenz</strong> – füge einen Screenshot oder eine URL ein; sage, was beibehalten und was geändert werden soll.</li>
      <li><strong>Steuere in einfacher Sprache</strong> – iteriere über Dichte, Palette, Ton und Zustände.</li>
      <li><strong>Bring es früh in den Code</strong> – je eher das Design echter Code ist, desto eher merkst du, was funktioniert.</li>
      <li><strong>Halte es offen und in deiner Hand</strong> – Open Source + BYOK vermeidet Lock-in, während sich die Kategorie schnell bewegt. (Wenn du von einer geschlossenen Leinwand kommst: Hier ist <a href="/blog/figma-alternative-open-design/">der quelloffene Weg weg von Figma</a> und <a href="/blog/open-source-alternative-to-claude-design/">weg von Claude Design</a>.)</li>
      </ol>
      <h2>Das Fazit</h2>
      <p>Vibe design ist Design nach Absicht: Du beschreibst, die KI erzeugt, du steuerst. Aus vibe coding hervorgegangen und 2026 durch Google Stitch in den Mainstream gebracht, schrumpft es die Distanz zwischen Idee und Oberfläche zusammen. Doch die Variante, auf die es ankommt, endet nicht bei einem Mockup – <strong>sie ist agentic und liefert in Code aus.</strong> Fang dort an, und vibe design wird zu echtem Ergebnis statt nur zu einem hübschen Bild.</p>
      <p><em>Bereit, es auszuprobieren? <a href="/download">Öffne die App</a> oder <a href="/plugins">durchstöbere die Bibliothek mit Designsystemen und Skills</a>.</em></p>
  fr:
    title: "Qu'est-ce que le vibe design ? Le guide 2026 pour concevoir par l'intention"
    summary: "Décrivez le ressenti et la direction d'une interface et laissez l'IA la générer — mais la plupart des outils s'arrêtent à une jolie maquette. Voici ce qu'est vraiment le vibe design, le vibe design face au vibe coding, et comment passer du prompt au code en production."
    category: "Guides"
    bodyHtml: |
      <p>En 2026, les designers, fondateurs et ingénieurs produit entendent partout parler de « vibe design » — mais la moitié des articles sont des argumentaires d'éditeurs et l'autre moitié ne dit jamais ce qui se passe <em>après</em> que l'IA a craché un écran. Ce guide vous donne une définition claire, la filiation, le déroulé du workflow, et la seule lacune dont personne ne parle : la mise en production.</p>
      <h2>Qu'est-ce que le vibe design ?</h2>
      <p><strong>Le vibe design est une approche de la conception d'interfaces et de produits où votre entrée principale est l'intention</strong> — décrite en langage naturel, par une image de référence ou par une URL — <strong>et où une IA génère le design pendant que vous le pilotez au feeling</strong> plutôt qu'à la main.</p>
      <p>Au lieu de placer des composants, d'ajuster les espacements et de fouiller dans les sélecteurs de couleurs, vous décrivez la <em>vibe</em> : le ton, la direction de la mise en page, le ressenti. Vous agissez moins en artisan qu'en directeur de création qui passe en revue et réoriente. Trois choses la définissent :</p>
      <ul>
      <li><strong>L'intention en entrée</strong> — un prompt, une capture d'écran, un site de référence ou une esquisse sommaire.</li>
      <li><strong>La génération en sortie</strong> — l'IA renvoie une vraie interface, pas une toile blanche.</li>
      <li><strong>Le pilotage</strong> — vous critiquez et réorientez en langage naturel jusqu'à ce que ce soit juste.</li>
      </ul>
      <h2>Vibe design face au vibe coding</h2>
      <p>Le terme descend directement du <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, inventé par Karpathy en 2025 : n'écrivez pas le code à la main — décrivez ce que vous voulez et laissez l'IA l'implémenter. <strong>Le vibe design applique cette même philosophie de « l'intention d'abord » à la couche visuelle.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Entrée</strong></td><td>L'intention (ce que ça doit faire)</td><td>L'intention (le look et le ressenti voulus)</td></tr>
      <tr><td><strong>Sortie</strong></td><td>Du code fonctionnel</td><td>Une interface fonctionnelle</td></tr>
      <tr><td><strong>Vous pilotez par</strong></td><td>Le comportement et la logique</td><td>Le ton, la mise en page, le goût</td></tr>
      <tr><td><strong>Popularisé par</strong></td><td>Karpathy, 2025</td><td>Google Stitch, début 2026</td></tr>
      </tbody>
      </table>
      <p>Ce sont les deux extrémités d'un même basculement, et en 2026 elles convergent : les agents les plus utiles conçoivent <em>et</em> construisent. Google a fait entrer le « vibe design » dans le grand public avec le lancement de <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> début 2026, donnant à la catégorie un nom et une vague de demande de recherche.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Capture d'écran fictive de Google Stitch générant un unique écran d'interface à partir d'un prompt texte" />
        <figcaption>Google Stitch a popularisé le « vibe design » — mais s'arrête à un écran généré.</figcaption>
      </figure>
      <h2>Comment le vibe design fonctionne concrètement</h2>
      <p>Une boucle typique se déroule en quatre temps :</p>
      <ol>
      <li><strong>Décrire la vibe</strong> — « un tableau de bord fintech calme et rassurant, beaucoup d'espace blanc, une seule couleur d'accent ».</li>
      <li><strong>Générer</strong> — l'IA renvoie un véritable écran (ou plusieurs variantes).</li>
      <li><strong>Piloter</strong> — « rends-le plus dense », « palette plus chaude », « ajoute un état vide ».</li>
      <li><strong>Itérer</strong> jusqu'à ce que ça corresponde à l'intention.</li>
      </ol>
      <p>Le gain, c'est la vitesse et l'accessibilité : une ou deux personnes pilotant une IA peuvent produire des dizaines de concepts soignés par semaine, et des non-designers peuvent atteindre une interface crédible sans apprendre un outil complexe.</p>
      <p>Dans un <a href="/blog/why-we-built-open-design-as-a-skill-layer/">espace de travail agent-native</a> comme Open Design, cette boucle vit sur une seule surface — vous décrivez la vibe au même agent qui pourra ensuite écrire le code, de sorte que piloter le design et construire le produit ne sont pas deux outils déconnectés. <em>(Transparence : nous développons Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Aperçu fictif de l'interface d'Open Design montrant un prompt en langage naturel à gauche et une interface générée à droite" />
        <figcaption>La boucle intention → génération → pilotage, dans Open Design.</figcaption>
      </figure>
      <h2>La lacune dont personne ne parle : de la maquette à la mise en production</h2>
      <p>C'est là que la plupart des outils de « vibe design » s'arrêtent discrètement — à une <strong>maquette statique</strong>. Vous obtenez un bel écran, puis vous voilà de retour à le traduire à la main en code, et le design ne se met plus jamais à jour.</p>
      <p>Le vrai vibe design ne devrait pas s'arrêter à une image. La version plus exigeante et plus précieuse, c'est le <strong>vibe design agentique</strong> : un agent qui génère le design, <strong>le critique et le fait évoluer, puis l'expédie en code de production</strong> — en gardant le design et le code synchronisés au fil de votre pilotage.</p>
      <table>
      <thead>
      <tr><th>Étape</th><th>La plupart des outils aujourd'hui</th><th>Vibe design agentique</th></tr>
      </thead>
      <tbody>
      <tr><td>Générer l'interface</td><td>✅</td><td>✅</td></tr>
      <tr><td>Auto-critique et itération</td><td>❌ un seul écran statique</td><td>✅ l'agent révise</td></tr>
      <tr><td>Expédier en code réel</td><td>❌ traduction manuelle plus tard</td><td>✅ exporte du code fonctionnel</td></tr>
      <tr><td>Garder design ↔ code synchronisés</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open source / BYOK</td><td>majoritairement fermé</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>C'est le créneau dans lequel évolue <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — l'espace de travail de conception open source et agent-native. Vous décrivez la vibe, un agent conçoit l'interface, la fait évoluer et <a href="/blog/31-skills-72-systems-how-the-library-works/">l'expédie en code réel</a> ; c'est du <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> et ça fonctionne aux côtés de l'agent de codage que vous utilisez déjà (Claude Code, Cursor, et d'autres) au lieu de vous enfermer dans une toile propriétaire — la démonstration ci-dessous montre donc le workflow, sans se contenter de l'affirmer.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Aperçu fictif de l'interface d'Open Design montrant un design généré qui s'exporte en code de production" />
        <figcaption>Le vibe design agentique aboutit à du code expédiable, pas à une capture d'écran.</figcaption>
      </figure>
      <blockquote>
      <p>Une boucle concrète que nous exécutons en permanence : prompter un tableau de bord → obtenir une mise en page fonctionnelle → « resserre les espacements et ajoute un mode sombre » → l'agent révise <em>le design et le code ensemble</em> → exporter du HTML de production. L'artefact est expédiable, pas une capture d'écran.</p>
      </blockquote>
      <h2>Idées reçues courantes sur le vibe design</h2>
      <ul>
      <li><strong>« Ça remplace les designers. »</strong> Non — ça les déplace vers la direction de création et le goût, là où le jugement compte davantage, pas moins.</li>
      <li><strong>« Ça ne fait que des maquettes jetables. »</strong> Seulement si l'outil s'arrête aux maquettes. Les outils agentiques poussent jusqu'au code.</li>
      <li><strong>« Il faut être technique. »</strong> C'est l'inverse — l'intention est l'interface.</li>
      <li><strong>« Ce n'est que de la génération d'images par IA. »</strong> Le vibe design produit une interface structurée et modifiable, pas une image plate.</li>
      </ul>
      <h2>Comment se lancer dans le vibe design dès aujourd'hui</h2>
      <ol>
      <li><strong>Choisissez un outil « intention d'abord » qui expédie en code</strong>, pas seulement des maquettes, pour que votre travail ne soit pas une impasse.</li>
      <li><strong>Partez d'une référence</strong> — collez une capture d'écran ou une URL ; dites ce qu'il faut garder et ce qu'il faut changer.</li>
      <li><strong>Pilotez en langage clair</strong> — itérez sur la densité, la palette, le ton et les états.</li>
      <li><strong>Passez au code tôt</strong> — plus le design devient vite du vrai code, plus vite vous apprenez ce qui fonctionne.</li>
      <li><strong>Gardez-le ouvert et à vous</strong> — l'open source + le BYOK évitent le verrouillage alors que la catégorie évolue vite. (Si vous venez d'une toile propriétaire, voici <a href="/blog/figma-alternative-open-design/">la voie open source pour quitter Figma</a> et <a href="/blog/open-source-alternative-to-claude-design/">pour quitter Claude Design</a>.)</li>
      </ol>
      <h2>À retenir</h2>
      <p>Le vibe design, c'est la conception « intention d'abord » : vous décrivez, l'IA génère, vous pilotez. Né du vibe coding et propulsé dans le grand public par Google Stitch en 2026, il réduit la distance entre l'idée et l'interface. Mais la version qui compte ne s'arrête pas à une maquette — <strong>elle est agentique, et elle expédie du code.</strong> Commencez par là et le vibe design devient une véritable production, pas seulement une jolie image.</p>
      <p><em>Prêt à l'essayer ? <a href="/download">Ouvrez l'application</a> ou <a href="/plugins">parcourez la bibliothèque de design systems et de skills</a>.</em></p>
  ru:
    title: "Что такое vibe design? Гид 2026 года по дизайну через намерение"
    summary: "Опишите ощущение и направление интерфейса — и пусть AI его сгенерирует. Но большинство инструментов останавливаются на красивом макете. Разбираемся, что такое vibe design на самом деле, чем vibe design отличается от vibe coding и как пройти путь от промпта до готового кода."
    category: "Руководства"
    bodyHtml: |
      <p>Дизайнеры, основатели и продуктовые инженеры в 2026 году постоянно слышат про «vibe design», но половина статей — это рекламные питчи вендоров, а вторая половина так и не объясняет, что происходит <em>после</em> того, как AI выдаёт экран. В этом гиде вы найдёте чёткое определение, родословную термина, разбор того, как устроен сам рабочий процесс, и тот единственный пробел, о котором никто не говорит, — выпуск в продакшен.</p>
      <h2>Что такое vibe design?</h2>
      <p><strong>Vibe design — это подход к проектированию интерфейсов и продуктов, в котором главный ввод — это намерение</strong> (описанное естественным языком, референсным изображением или ссылкой), <strong>а AI генерирует дизайн, пока вы направляете его по ощущению</strong>, а не вручную.</p>
      <p>Вместо того чтобы расставлять компоненты, подкручивать отступы и копаться в палитрах, вы описываете сам <em>вайб</em>: тон, направление вёрстки, ощущение. Вы работаете не столько как ремесленник, сколько как креативный директор, который оценивает и задаёт новое направление. Подход определяют три вещи:</p>
      <ul>
      <li><strong>Намерение на входе</strong> — промпт, скриншот, референсный сайт или грубый набросок.</li>
      <li><strong>Генерация на выходе</strong> — AI возвращает реальный интерфейс, а не пустой холст.</li>
      <li><strong>Управление</strong> — вы критикуете и перенаправляете естественным языком, пока всё не станет как надо.</li>
      </ul>
      <h2>Vibe design против vibe coding</h2>
      <p>Термин напрямую происходит от <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a> — понятия, которое в 2025 году ввёл Andrej Karpathy: не пишите код руками, опишите, что вам нужно, и дайте AI это реализовать. <strong>Vibe design переносит ту же философию «сначала намерение» на визуальный слой.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Ввод</strong></td><td>Намерение (что должно делать)</td><td>Намерение (как должно выглядеть и ощущаться)</td></tr>
      <tr><td><strong>Вывод</strong></td><td>Рабочий код</td><td>Рабочий интерфейс</td></tr>
      <tr><td><strong>Чем управляете</strong></td><td>Поведением и логикой</td><td>Тоном, вёрсткой, вкусом</td></tr>
      <tr><td><strong>Кто популяризировал</strong></td><td>Karpathy, 2025</td><td>Google Stitch, начало 2026</td></tr>
      </tbody>
      </table>
      <p>Это два конца одного и того же сдвига, и в 2026 году они сходятся: самые полезные агенты <em>и</em> проектируют, <em>и</em> собирают. Google вывел «vibe design» в мейнстрим запуском <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> в начале 2026 года, дав категории имя и волну поискового спроса.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Заглушка скриншота: Google Stitch генерирует один экран интерфейса из текстового промпта" />
        <figcaption>Google Stitch вывел «vibe design» в мейнстрим — но останавливается на сгенерированном экране.</figcaption>
      </figure>
      <h2>Как vibe design работает на самом деле</h2>
      <p>Типичный цикл состоит из четырёх шагов:</p>
      <ol>
      <li><strong>Опишите вайб</strong> — «спокойный, вызывающий доверие финтех-дашборд, много воздуха, один акцентный цвет».</li>
      <li><strong>Сгенерируйте</strong> — AI возвращает реальный экран (или несколько вариантов).</li>
      <li><strong>Направляйте</strong> — «сделай плотнее», «теплее палитру», «добавь пустое состояние».</li>
      <li><strong>Итерируйте</strong>, пока результат не совпадёт с намерением.</li>
      </ol>
      <p>Выигрыш — в скорости и доступности: один-два человека, направляющие AI, могут выдавать десятки отполированных концепций в неделю, а недизайнеры способны дойти до правдоподобного интерфейса, не осваивая тяжёлый инструмент.</p>
      <p>В <a href="/blog/why-we-built-open-design-as-a-skill-layer/">agent-native-воркспейсе</a> вроде Open Design этот цикл живёт на одной поверхности — вы описываете вайб тому же агенту, который потом может написать код, так что управление дизайном и сборка продукта перестают быть двумя разрозненными инструментами. <em>(Раскрытие: мы делаем Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Заглушка интерфейса Open Design: промпт на естественном языке слева и сгенерированный интерфейс справа" />
        <figcaption>Цикл «намерение → генерация → управление» в Open Design.</figcaption>
      </figure>
      <h2>Пробел, о котором никто не говорит: от макета к продакшену</h2>
      <p>Вот где большинство инструментов «vibe design» тихо останавливается — на <strong>статичном макете</strong>. Вы получаете красивый экран, а потом снова вручную переводите его в код, и дизайн больше никогда не обновляется.</p>
      <p>Настоящий vibe design не должен заканчиваться картинкой. Более сложная и более ценная версия — это <strong>агентный vibe design</strong>: агент, который генерирует дизайн, <strong>критикует и развивает его, а затем выпускает в продакшен-код</strong>, удерживая дизайн и код в синхроне, пока вы им управляете.</p>
      <table>
      <thead>
      <tr><th>Этап</th><th>Большинство инструментов сегодня</th><th>Агентный vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>Генерация интерфейса</td><td>✅</td><td>✅</td></tr>
      <tr><td>Самокритика и итерации</td><td>❌ один статичный экран</td><td>✅ агент перерабатывает</td></tr>
      <tr><td>Выпуск в реальный код</td><td>❌ потом перевести вручную</td><td>✅ экспортирует рабочий код</td></tr>
      <tr><td>Синхрон дизайна ↔ кода</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open-source / BYOK</td><td>в основном закрытые</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Именно в этой нише работает <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — открытый, agent-native-воркспейс для дизайна. Вы описываете вайб, агент проектирует интерфейс, развивает его и <a href="/blog/31-skills-72-systems-how-the-library-works/">выпускает в реальный код</a>; он работает по модели <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> и встаёт рядом с тем кодинг-агентом, которым вы уже пользуетесь (Claude Code, Cursor и другими), вместо того чтобы запирать вас в закрытом холсте — поэтому разбор ниже показывает рабочий процесс, а не просто заявляет о нём.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Заглушка интерфейса Open Design: сгенерированный дизайн экспортируется в продакшен-код" />
        <figcaption>Агентный vibe design заканчивается готовым к выпуску кодом, а не скриншотом.</figcaption>
      </figure>
      <blockquote>
      <p>Конкретный цикл, который мы прогоняем постоянно: запросить дашборд → получить рабочую вёрстку → «уплотни отступы и добавь тёмную тему» → агент перерабатывает <em>дизайн и код вместе</em> → экспортировать продакшен-HTML. Артефакт готов к выпуску, а не скриншот.</p>
      </blockquote>
      <h2>Распространённые мифы о vibe design</h2>
      <ul>
      <li><strong>«Он заменяет дизайнеров».</strong> Нет — он смещает их в сторону креативного направления и вкуса, где суждение значит больше, а не меньше.</li>
      <li><strong>«Он годится только для одноразовых макетов».</strong> Только если инструмент останавливается на макетах. Агентные инструменты доводят дело до кода.</li>
      <li><strong>«Нужно быть технарём».</strong> Наоборот — интерфейсом является само намерение.</li>
      <li><strong>«Это просто AI-генерация картинок».</strong> Vibe design выдаёт структурированный, редактируемый интерфейс, а не плоскую картинку.</li>
      </ul>
      <h2>Как начать заниматься vibe design уже сегодня</h2>
      <ol>
      <li><strong>Выберите инструмент с приоритетом намерения, который выпускает в код</strong>, а не только в макеты, чтобы ваша работа не упёрлась в тупик.</li>
      <li><strong>Начните с референса</strong> — вставьте скриншот или ссылку; скажите, что оставить, а что изменить.</li>
      <li><strong>Управляйте простым языком</strong> — итерируйте по плотности, палитре, тону и состояниям.</li>
      <li><strong>Раньше переходите в код</strong> — чем скорее дизайн станет настоящим кодом, тем скорее вы поймёте, что работает.</li>
      <li><strong>Сохраняйте открытость и контроль</strong> — open-source + BYOK избавляют от привязки к вендору, пока категория стремительно меняется. (Если вы переходите из закрытого холста, вот <a href="/blog/figma-alternative-open-design/">открытый путь в сторону от Figma</a> и <a href="/blog/open-source-alternative-to-claude-design/">от Claude Design</a>.)</li>
      </ol>
      <h2>Главный вывод</h2>
      <p>Vibe design — это дизайн с приоритетом намерения: вы описываете, AI генерирует, вы направляете. Рождённый из vibe coding и выведенный в мейнстрим благодаря Google Stitch в 2026 году, он сокращает дистанцию между идеей и интерфейсом. Но версия, которая по-настоящему важна, не останавливается на макете — <strong>она агентная и выпускается в код.</strong> Начните с этого, и vibe design превратится в реальный результат, а не просто в красивую картинку.</p>
      <p><em>Готовы попробовать? <a href="/download">Откройте приложение</a> или <a href="/plugins">полистайте библиотеку дизайн-систем и навыков</a>.</em></p>
  es:
    title: "¿Qué es el vibe design? La guía 2026 para diseñar por intención"
    summary: "Describe la sensación y la dirección de una interfaz y deja que la IA la genere; pero la mayoría de las herramientas se quedan en un bonito mockup. Esto es lo que realmente es el vibe design, en qué se diferencia el vibe design del vibe coding y cómo llevarlo del prompt al código listo para producción."
    category: "Guías"
    bodyHtml: |
      <p>Diseñadores, founders e ingenieros de producto no paran de oír hablar del «vibe design» en 2026, pero la mitad de los artículos son discursos comerciales de proveedores y la otra mitad nunca explica qué pasa <em>después</em> de que la IA escupe una pantalla. Esta guía te da una definición clara, su linaje, cómo se ejecuta el flujo de trabajo y la única laguna de la que nadie habla: llevarlo a producción.</p>
      <h2>¿Qué es el vibe design?</h2>
      <p><strong>El vibe design es un enfoque del diseño de interfaces y de producto en el que tu insumo principal es la intención</strong> —descrita en lenguaje natural, una imagen de referencia o una URL— <strong>y una IA genera el diseño mientras tú lo guías por intuición</strong> en lugar de hacerlo a mano.</p>
      <p>En vez de colocar componentes, ajustar espaciados y rebuscar entre selectores de color, describes el <em>vibe</em>: el tono, la dirección del layout, la sensación. Actúas menos como artesano y más como director creativo que revisa y reorienta. Tres cosas lo definen:</p>
      <ul>
      <li><strong>Entra la intención</strong>: un prompt, una captura de pantalla, un sitio de referencia o un boceto rápido.</li>
      <li><strong>Sale la generación</strong>: la IA devuelve una interfaz real, no un lienzo en blanco.</li>
      <li><strong>Conducción</strong>: la criticas y reorientas en lenguaje natural hasta que queda bien.</li>
      </ul>
      <h2>Vibe design vs vibe coding</h2>
      <p>El término desciende directamente del <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, acuñado por Karpathy en 2025: no escribas código a mano, describe lo que quieres y deja que la IA lo implemente. <strong>El vibe design aplica esa misma filosofía «la intención primero» a la capa visual.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Entrada</strong></td><td>Intención (qué debe hacer)</td><td>Intención (cómo debe verse y sentirse)</td></tr>
      <tr><td><strong>Salida</strong></td><td>Código funcional</td><td>Interfaz funcional</td></tr>
      <tr><td><strong>Conduces según</strong></td><td>Comportamiento y lógica</td><td>Tono, layout, gusto</td></tr>
      <tr><td><strong>Popularizado por</strong></td><td>Karpathy, 2025</td><td>Google Stitch, principios de 2026</td></tr>
      </tbody>
      </table>
      <p>Son dos extremos del mismo cambio y, en 2026, están convergiendo: los agentes más útiles diseñan <em>y</em> construyen. Google llevó el «vibe design» al gran público con el lanzamiento de <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> a principios de 2026, dándole nombre a la categoría y desatando una ola de demanda de búsquedas.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Captura de pantalla de muestra de Google Stitch generando una sola pantalla de interfaz a partir de un prompt de texto" />
        <figcaption>Google Stitch llevó el «vibe design» al gran público, pero se detiene en una pantalla generada.</figcaption>
      </figure>
      <h2>Cómo funciona realmente el vibe design</h2>
      <p>Un ciclo típico se desarrolla en cuatro movimientos:</p>
      <ol>
      <li><strong>Describe el vibe</strong>: «un panel de control fintech tranquilo y confiable, con mucho espacio en blanco y un solo color de acento».</li>
      <li><strong>Genera</strong>: la IA devuelve una pantalla real (o varias variantes).</li>
      <li><strong>Conduce</strong>: «hazlo más denso», «paleta más cálida», «añade un estado vacío».</li>
      <li><strong>Itera</strong> hasta que coincida con la intención.</li>
      </ol>
      <p>La recompensa es velocidad y accesibilidad: una o dos personas dirigiendo una IA pueden producir docenas de conceptos pulidos a la semana, y quienes no son diseñadores pueden llegar a una interfaz creíble sin aprender una herramienta pesada.</p>
      <p>En un <a href="/blog/why-we-built-open-design-as-a-skill-layer/">espacio de trabajo nativo de agentes</a> como Open Design, este ciclo vive en una sola superficie: le describes el vibe al mismo agente que después puede escribir el código, así que conducir el diseño y construir el producto no son dos herramientas desconectadas. <em>(Aviso: nosotros desarrollamos Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Interfaz de muestra de Open Design que muestra un prompt en lenguaje natural a la izquierda y una interfaz generada a la derecha" />
        <figcaption>El ciclo intención → generar → conducir, en Open Design.</figcaption>
      </figure>
      <h2>La laguna de la que nadie habla: del mockup a producción</h2>
      <p>Aquí es donde la mayoría de las herramientas de «vibe design» se detiene en silencio: en un <strong>mockup estático</strong>. Obtienes una pantalla preciosa y luego vuelves a traducirla a código a mano, y el diseño nunca se vuelve a actualizar.</p>
      <p>El verdadero vibe design no debería terminar en una imagen. La versión más difícil y más valiosa es el <strong>vibe design agéntico</strong>: un agente que genera el diseño, <strong>lo critica y lo hace evolucionar, y lo envía a código de producción</strong>, manteniendo el diseño y el código sincronizados mientras tú conduces.</p>
      <table>
      <thead>
      <tr><th>Etapa</th><th>La mayoría de herramientas hoy</th><th>Vibe design agéntico</th></tr>
      </thead>
      <tbody>
      <tr><td>Generar interfaz</td><td>✅</td><td>✅</td></tr>
      <tr><td>Autocrítica e iteración</td><td>❌ una sola pantalla estática</td><td>✅ el agente revisa</td></tr>
      <tr><td>Enviar a código real</td><td>❌ traducir a mano después</td><td>✅ exporta código funcional</td></tr>
      <tr><td>Mantener diseño ↔ código sincronizados</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open source / BYOK</td><td>en su mayoría cerrado</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Este es el carril en el que opera <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a>: el espacio de trabajo de diseño open source y nativo de agentes. Describes el vibe, un agente diseña la interfaz, la hace evolucionar y la <a href="/blog/31-skills-72-systems-how-the-library-works/">envía a código real</a>; es <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> y funciona junto al agente de código que ya usas (Claude Code, Cursor y otros) en lugar de encerrarte en un lienzo cerrado, así que el recorrido de abajo muestra el flujo de trabajo en vez de solo afirmarlo.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Interfaz de muestra de Open Design que muestra un diseño generado exportándose a código de producción" />
        <figcaption>El vibe design agéntico termina en código listo para enviar, no en una captura de pantalla.</figcaption>
      </figure>
      <blockquote>
      <p>Un ciclo concreto que ejecutamos constantemente: pide con un prompt un panel de control → obtén un layout funcional → «aprieta el espaciado y añade modo oscuro» → el agente revisa <em>el diseño y el código a la vez</em> → exporta HTML de producción. El artefacto es listo para enviar, no una captura de pantalla.</p>
      </blockquote>
      <h2>Mitos comunes sobre el vibe design</h2>
      <ul>
      <li><strong>«Reemplaza a los diseñadores.»</strong> No: los desplaza hacia la dirección creativa y el gusto, donde el criterio importa más, no menos.</li>
      <li><strong>«Solo hace mockups desechables.»</strong> Solo si la herramienta se queda en los mockups. Las herramientas agénticas lo llevan a código.</li>
      <li><strong>«Tienes que ser técnico.»</strong> Todo lo contrario: la intención es la interfaz.</li>
      <li><strong>«No es más que generación de imágenes con IA.»</strong> El vibe design produce una interfaz estructurada y editable, no una imagen plana.</li>
      </ul>
      <h2>Cómo empezar a hacer vibe design hoy</h2>
      <ol>
      <li><strong>Elige una herramienta de «la intención primero» que envíe a código</strong>, no solo mockups, para que tu trabajo no se quede en un callejón sin salida.</li>
      <li><strong>Parte de una referencia</strong>: pega una captura de pantalla o una URL; di qué conservar y qué cambiar.</li>
      <li><strong>Conduce en lenguaje sencillo</strong>: itera sobre densidad, paleta, tono y estados.</li>
      <li><strong>Lleva todo a código pronto</strong>: cuanto antes el diseño sea código real, antes aprenderás qué funciona.</li>
      <li><strong>Mantenlo abierto y tuyo</strong>: open source + BYOK evita el lock-in a medida que la categoría avanza rápido. (Si vienes de un lienzo cerrado, aquí tienes <a href="/blog/figma-alternative-open-design/">el camino open source para alejarte de Figma</a> y <a href="/blog/open-source-alternative-to-claude-design/">de Claude Design</a>.)</li>
      </ol>
      <h2>La conclusión</h2>
      <p>El vibe design es diseño con la intención primero: tú describes, la IA genera, tú conduces. Nacido del vibe coding y llevado al gran público por Google Stitch en 2026, colapsa la distancia entre la idea y la interfaz. Pero la versión que importa no se detiene en un mockup: <strong>es agéntica y envía a código.</strong> Empieza ahí y el vibe design se convierte en resultado real, no solo en una imagen bonita.</p>
      <p><em>¿Listo para probarlo? <a href="/download">Abre la app</a> o <a href="/plugins">explora la biblioteca de sistemas de diseño y skills</a>.</em></p>
  pt-br:
    title: "O que é vibe design? O guia de 2026 para projetar por intenção"
    summary: "Descreva o clima e a direção de uma interface e deixe a IA gerá-la — mas a maioria das ferramentas para num mockup bonitinho. Veja o que vibe design realmente é, vibe design vs vibe coding e como levar do prompt ao código em produção."
    category: "Guias"
    bodyHtml: |
      <p>Designers, fundadores e engenheiros de produto não param de ouvir falar em "vibe design" em 2026 — mas metade dos artigos são propaganda de fornecedor e a outra metade nunca diz o que acontece <em>depois</em> que a IA cospe uma tela. Este guia traz uma definição clara, a linhagem, como o fluxo de trabalho funciona e a única lacuna sobre a qual ninguém fala: colocar em produção.</p>
      <h2>O que é vibe design?</h2>
      <p><strong>Vibe design é uma abordagem para o design de UI e de produto em que sua entrada principal é a intenção</strong> — descrita em linguagem natural, em uma imagem de referência ou em uma URL — <strong>e uma IA gera o design enquanto você o guia pela sensação</strong>, em vez de fazer tudo na mão.</p>
      <p>Em vez de posicionar componentes, ajustar espaçamentos e garimpar seletores de cor, você descreve a <em>vibe</em>: o tom, a direção do layout, a sensação. Você age menos como um artesão e mais como um diretor de criação que revisa e redireciona. Três coisas a definem:</p>
      <ul>
      <li><strong>Intenção na entrada</strong> — um prompt, um print, um site de referência ou um esboço grosseiro.</li>
      <li><strong>Geração na saída</strong> — a IA devolve uma UI de verdade, não uma tela em branco.</li>
      <li><strong>Direção</strong> — você critica e redireciona em linguagem natural até ficar do jeito certo.</li>
      </ul>
      <h2>Vibe design vs vibe coding</h2>
      <p>O termo descende diretamente de <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, cunhado por Karpathy em 2025: não escreva código na mão — descreva o que você quer e deixe a IA implementar. <strong>O vibe design aplica essa mesma filosofia de "intenção em primeiro lugar" à camada visual.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Entrada</strong></td><td>Intenção (o que deve fazer)</td><td>Intenção (qual deve ser a aparência e a sensação)</td></tr>
      <tr><td><strong>Saída</strong></td><td>Código funcional</td><td>Interface funcional</td></tr>
      <tr><td><strong>Você guia por</strong></td><td>Comportamento e lógica</td><td>Tom, layout, bom gosto</td></tr>
      <tr><td><strong>Popularizado por</strong></td><td>Karpathy, 2025</td><td>Google Stitch, início de 2026</td></tr>
      </tbody>
      </table>
      <p>São duas pontas da mesma virada e, em 2026, elas estão convergindo: os agentes mais úteis projetam <em>e</em> constroem. O Google levou o "vibe design" para o grande público com o lançamento do <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> no início de 2026, dando à categoria um nome e uma onda de demanda nas buscas.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Placeholder de captura de tela do Google Stitch gerando uma única tela de UI a partir de um prompt de texto" />
        <figcaption>O Google Stitch levou o "vibe design" para o grande público — mas para numa tela gerada.</figcaption>
      </figure>
      <h2>Como o vibe design funciona na prática</h2>
      <p>Um ciclo típico acontece em quatro movimentos:</p>
      <ol>
      <li><strong>Descreva a vibe</strong> — "um dashboard de fintech calmo e confiável, bastante espaço em branco, uma única cor de destaque."</li>
      <li><strong>Gere</strong> — a IA devolve uma tela de verdade (ou várias variações).</li>
      <li><strong>Guie</strong> — "deixa mais denso", "paleta mais quente", "adiciona um estado vazio".</li>
      <li><strong>Itere</strong> até bater com a intenção.</li>
      </ol>
      <p>O ganho é velocidade e acesso: uma ou duas pessoas dirigindo uma IA conseguem produzir dezenas de conceitos refinados por semana, e quem não é designer chega a uma interface convincente sem aprender uma ferramenta pesada.</p>
      <p>Em um <a href="/blog/why-we-built-open-design-as-a-skill-layer/">workspace agent-native</a> como o Open Design, esse ciclo vive em uma única superfície — você descreve a vibe para o mesmo agente que depois pode escrever o código, então conduzir o design e construir o produto não são duas ferramentas desconexas. <em>(Aviso: nós construímos o Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Placeholder da interface do Open Design mostrando um prompt em linguagem natural à esquerda e uma UI gerada à direita" />
        <figcaption>O ciclo intenção → geração → direção, no Open Design.</figcaption>
      </figure>
      <h2>A lacuna sobre a qual ninguém fala: do mockup ao código em produção</h2>
      <p>É aqui que a maioria das ferramentas de "vibe design" para discretamente — num <strong>mockup estático</strong>. Você ganha uma tela linda e, em seguida, volta a traduzi-la para código na mão, e o design nunca mais se atualiza.</p>
      <p>O vibe design de verdade não deveria terminar numa imagem. A versão mais difícil e mais valiosa é o <strong>vibe design agêntico</strong>: um agente que gera o design, <strong>o critica e o faz evoluir, e o leva até o código em produção</strong> — mantendo design e código em sincronia conforme você conduz.</p>
      <table>
      <thead>
      <tr><th>Etapa</th><th>A maioria das ferramentas hoje</th><th>Vibe design agêntico</th></tr>
      </thead>
      <tbody>
      <tr><td>Gerar UI</td><td>✅</td><td>✅</td></tr>
      <tr><td>Autocrítica e iteração</td><td>❌ uma tela estática</td><td>✅ o agente revisa</td></tr>
      <tr><td>Levar a código real</td><td>❌ traduzir na mão depois</td><td>✅ exporta código funcional</td></tr>
      <tr><td>Manter design ↔ código em sincronia</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open source / BYOK</td><td>na maioria fechadas</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>É nessa faixa que o <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> atua — o workspace de design open source e agent-native. Você descreve a vibe, um agente projeta a UI, a faz evoluir e <a href="/blog/31-skills-72-systems-how-the-library-works/">a leva até código real</a>; é <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> e funciona ao lado do agente de código que você já usa (Claude Code, Cursor e outros) em vez de prendê-lo a um canvas fechado — então o passo a passo abaixo mostra o fluxo de trabalho, não só promete.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Placeholder da interface do Open Design mostrando um design gerado sendo exportado para código em produção" />
        <figcaption>O vibe design agêntico termina em código pronto para produção, não num print.</figcaption>
      </figure>
      <blockquote>
      <p>Um ciclo concreto que rodamos o tempo todo: peça um dashboard via prompt → receba um layout funcional → "aperta o espaçamento e adiciona dark mode" → o agente revisa <em>design e código juntos</em> → exporte o HTML de produção. O artefato está pronto para produção, não é um print.</p>
      </blockquote>
      <h2>Mitos comuns sobre vibe design</h2>
      <ul>
      <li><strong>"Substitui os designers."</strong> Não — desloca-os para a direção de criação e o bom gosto, onde o julgamento importa mais, não menos.</li>
      <li><strong>"Só faz mockups descartáveis."</strong> Só se a ferramenta parar nos mockups. As ferramentas agênticas levam até o código.</li>
      <li><strong>"Você precisa ser técnico."</strong> Pelo contrário — a intenção é a interface.</li>
      <li><strong>"É só geração de imagem por IA."</strong> O vibe design produz uma UI estruturada e editável, não uma imagem chapada.</li>
      </ul>
      <h2>Como começar a fazer vibe design hoje</h2>
      <ol>
      <li><strong>Escolha uma ferramenta de intenção em primeiro lugar que leve até o código</strong>, não só mockups, para o seu trabalho não chegar a um beco sem saída.</li>
      <li><strong>Comece a partir de uma referência</strong> — cole um print ou uma URL; diga o que manter e o que mudar.</li>
      <li><strong>Conduza em linguagem simples</strong> — itere sobre densidade, paleta, tom e estados.</li>
      <li><strong>Vá para o código cedo</strong> — quanto antes o design vira código real, antes você descobre o que funciona.</li>
      <li><strong>Mantenha tudo aberto e seu</strong> — open source + BYOK evita o aprisionamento enquanto a categoria avança rápido. (Se você está vindo de um canvas fechado, aqui está <a href="/blog/figma-alternative-open-design/">o caminho open source para longe do Figma</a> e <a href="/blog/open-source-alternative-to-claude-design/">do Claude Design</a>.)</li>
      </ol>
      <h2>A conclusão</h2>
      <p>Vibe design é design com a intenção em primeiro lugar: você descreve, a IA gera, você conduz. Nascido do vibe coding e levado ao grande público pelo Google Stitch em 2026, ele encurta a distância entre a ideia e a interface. Mas a versão que importa não para num mockup — <strong>ela é agêntica e leva até o código.</strong> Comece por aí e o vibe design vira resultado de verdade, não só uma imagem bonita.</p>
      <p><em>Pronto para experimentar? <a href="/download">Abra o app</a> ou <a href="/plugins">explore a biblioteca de design systems e skills</a>.</em></p>
  it:
    title: "Che cos'è il vibe design? La guida 2026 per progettare per intenzione"
    summary: "Descrivi la sensazione e la direzione di una UI e lascia che l'AI la generi — ma la maggior parte degli strumenti si ferma a un bel mockup. Ecco cos'è davvero il vibe design, il vibe design a confronto con il vibe coding e come portarlo dal prompt al codice in produzione."
    category: "Guide"
    bodyHtml: |
      <p>Nel 2026 designer, founder e product engineer continuano a sentir parlare di "vibe design" — ma metà degli articoli sono pitch commerciali e l'altra metà non dice mai cosa succede <em>dopo</em> che l'AI ha sfornato una schermata. Questa guida ti offre una definizione chiara, le origini, come funziona il flusso di lavoro e l'unica lacuna di cui nessuno parla: la messa in produzione.</p>
      <h2>Che cos'è il vibe design?</h2>
      <p><strong>Il vibe design è un approccio alla progettazione di UI e di prodotto in cui il tuo input principale è l'intenzione</strong> — espressa in linguaggio naturale, con un'immagine di riferimento o con un URL — <strong>e un'AI genera il design mentre tu lo guidi a sensazione</strong>, anziché a mano.</p>
      <p>Invece di posizionare componenti, regolare le spaziature e cercare tra i color picker, descrivi il <em>vibe</em>: il tono, la direzione del layout, la sensazione. Agisci meno come un artigiano e più come un direttore creativo che rivede e ridirige. Tre elementi lo definiscono:</p>
      <ul>
      <li><strong>Intenzione in ingresso</strong> — un prompt, uno screenshot, un sito di riferimento o uno schizzo grezzo.</li>
      <li><strong>Generazione in uscita</strong> — l'AI restituisce una UI vera, non una tela bianca.</li>
      <li><strong>Guida</strong> — critichi e ridirigi in linguaggio naturale finché non è giusto.</li>
      </ul>
      <h2>Vibe design e vibe coding a confronto</h2>
      <p>Il termine discende direttamente dal <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, coniato da Karpathy nel 2025: non scrivere il codice a mano — descrivi cosa vuoi e lascia che l'AI lo implementi. <strong>Il vibe design applica la stessa filosofia "intent-first" al livello visivo.</strong></p>
      <table>
      <thead>
      <tr>
      <th></th>
      <th>Vibe coding</th>
      <th>Vibe design</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td><strong>Input</strong></td>
      <td>Intenzione (cosa deve fare)</td>
      <td>Intenzione (che aspetto e che sensazione deve avere)</td>
      </tr>
      <tr>
      <td><strong>Output</strong></td>
      <td>Codice funzionante</td>
      <td>Interfaccia funzionante</td>
      </tr>
      <tr>
      <td><strong>Guidi tramite</strong></td>
      <td>Comportamento e logica</td>
      <td>Tono, layout, gusto</td>
      </tr>
      <tr>
      <td><strong>Reso popolare da</strong></td>
      <td>Karpathy, 2025</td>
      <td>Google Stitch, inizio 2026</td>
      </tr>
      </tbody>
      </table>
      <p>Sono i due estremi dello stesso cambiamento e nel 2026 stanno convergendo: gli agenti più utili progettano <em>e</em> costruiscono. Google ha portato il "vibe design" verso il grande pubblico con il lancio di <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> all'inizio del 2026, dando alla categoria un nome e un'ondata di domanda nelle ricerche.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Segnaposto dello screenshot di Google Stitch che genera una singola schermata UI da un prompt testuale" />
        <figcaption>Google Stitch ha portato il "vibe design" verso il grande pubblico — ma si ferma a una schermata generata.</figcaption>
      </figure>
      <h2>Come funziona davvero il vibe design</h2>
      <p>Un ciclo tipico si svolge in quattro mosse:</p>
      <ol>
      <li><strong>Descrivi il vibe</strong> — "una dashboard fintech calma e affidabile, tanto spazio bianco, un solo colore di accento".</li>
      <li><strong>Genera</strong> — l'AI restituisce una schermata vera (o diverse varianti).</li>
      <li><strong>Guida</strong> — "rendila più densa", "palette più calda", "aggiungi uno stato vuoto".</li>
      <li><strong>Itera</strong> finché non corrisponde all'intenzione.</li>
      </ol>
      <p>Il vantaggio è velocità e accessibilità: una o due persone che guidano un'AI possono produrre decine di concept curati a settimana, e chi non è designer può arrivare a un'interfaccia credibile senza dover imparare uno strumento complesso.</p>
      <p>In uno <a href="/blog/why-we-built-open-design-as-a-skill-layer/">spazio di lavoro agent-native</a> come Open Design, questo ciclo vive in un'unica superficie — descrivi il vibe allo stesso agente che in seguito può scrivere il codice, così guidare il design e costruire il prodotto non sono due strumenti scollegati. <em>(Trasparenza: siamo noi a sviluppare Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Segnaposto dell'interfaccia di Open Design che mostra un prompt in linguaggio naturale a sinistra e una UI generata a destra" />
        <figcaption>Il ciclo intenzione → generazione → guida, in Open Design.</figcaption>
      </figure>
      <h2>La lacuna di cui nessuno parla: dal mockup alla produzione</h2>
      <p>È qui che la maggior parte degli strumenti di "vibe design" si ferma in sordina — a un <strong>mockup statico</strong>. Ottieni una bella schermata, poi sei di nuovo a tradurla a mano in codice, e il design non si aggiorna più.</p>
      <p>Il vero vibe design non dovrebbe finire a un'immagine. La versione più difficile e più preziosa è il <strong>vibe design agentico</strong>: un agente che genera il design, <strong>lo critica e lo fa evolvere, e lo porta in codice di produzione</strong> — mantenendo design e codice sincronizzati mentre lo guidi.</p>
      <table>
      <thead>
      <tr>
      <th>Fase</th>
      <th>La maggior parte degli strumenti oggi</th>
      <th>Vibe design agentico</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Generare la UI</td>
      <td>✅</td>
      <td>✅</td>
      </tr>
      <tr>
      <td>Autocritica e iterazione</td>
      <td>❌ una schermata statica</td>
      <td>✅ l'agente revisiona</td>
      </tr>
      <tr>
      <td>Portare in codice reale</td>
      <td>❌ traduzione a mano in seguito</td>
      <td>✅ esporta codice funzionante</td>
      </tr>
      <tr>
      <td>Mantenere design ↔ codice sincronizzati</td>
      <td>❌</td>
      <td>✅</td>
      </tr>
      <tr>
      <td>Open source / BYOK</td>
      <td>per lo più chiusi</td>
      <td>✅</td>
      </tr>
      </tbody>
      </table>
      <p>È questa la corsia in cui lavora <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — lo spazio di lavoro di design open source e agent-native. Descrivi il vibe, un agente progetta la UI, la fa evolvere e <a href="/blog/31-skills-72-systems-how-the-library-works/">la porta in codice reale</a>; è <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> e lavora insieme all'agente di coding che già usi (Claude Code, Cursor e altri) invece di rinchiuderti in una tela chiusa — così la guida pratica qui sotto mostra il flusso di lavoro, non si limita a dichiararlo.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Segnaposto dell'interfaccia di Open Design che mostra un design generato esportato in codice di produzione" />
        <figcaption>Il vibe design agentico finisce in codice pronto alla produzione, non in uno screenshot.</figcaption>
      </figure>
      <blockquote>
      <p>Un ciclo concreto che eseguiamo di continuo: dai un prompt per una dashboard → ottieni un layout funzionante → "stringi le spaziature e aggiungi la modalità scura" → l'agente revisiona <em>design e codice insieme</em> → esporti HTML di produzione. L'artefatto è pronto da spedire, non uno screenshot.</p>
      </blockquote>
      <h2>Falsi miti comuni sul vibe design</h2>
      <ul>
      <li><strong>"Sostituisce i designer."</strong> No — li sposta verso la direzione creativa e il gusto, dove il giudizio conta di più, non di meno.</li>
      <li><strong>"Produce solo mockup usa e getta."</strong> Solo se lo strumento si ferma ai mockup. Gli strumenti agentici lo portano fino al codice.</li>
      <li><strong>"Devi essere tecnico."</strong> Al contrario — l'intenzione è l'interfaccia.</li>
      <li><strong>"È solo generazione di immagini con l'AI."</strong> Il vibe design produce una UI strutturata e modificabile, non un'immagine piatta.</li>
      </ul>
      <h2>Come iniziare a fare vibe design oggi</h2>
      <ol>
      <li><strong>Scegli uno strumento intent-first che arrivi fino al codice</strong>, non solo a mockup, così il tuo lavoro non finisce in un vicolo cieco.</li>
      <li><strong>Parti da un riferimento</strong> — incolla uno screenshot o un URL; di' cosa tenere e cosa cambiare.</li>
      <li><strong>Guida in linguaggio semplice</strong> — itera su densità, palette, tono e stati.</li>
      <li><strong>Porta in codice presto</strong> — prima il design diventa codice reale, prima scopri cosa funziona.</li>
      <li><strong>Mantienilo aperto e tuo</strong> — open source + BYOK evita il lock-in mentre la categoria si muove in fretta. (Se arrivi da una tela chiusa, ecco <a href="/blog/figma-alternative-open-design/">il percorso open source per allontanarti da Figma</a> e <a href="/blog/open-source-alternative-to-claude-design/">da Claude Design</a>.)</li>
      </ol>
      <h2>Il punto chiave</h2>
      <p>Il vibe design è progettazione intent-first: tu descrivi, l'AI genera, tu guidi. Nato dal vibe coding e portato verso il grande pubblico da Google Stitch nel 2026, accorcia la distanza tra idea e interfaccia. Ma la versione che conta non si ferma a un mockup — <strong>è agentica, e arriva fino al codice.</strong> Parti da lì e il vibe design diventa output reale, non solo una bella immagine.</p>
      <p><em>Pronto a provarlo? <a href="/download">Apri l'app</a> oppure <a href="/plugins">esplora la libreria di design system e skill</a>.</em></p>
  vi:
    title: "Vibe design là gì? Hướng dẫn 2026 về thiết kế theo ý định"
    summary: "Bạn chỉ cần mô tả cảm giác và hướng đi của một giao diện rồi để AI tạo ra nó — nhưng phần lớn công cụ dừng lại ở một bản mockup đẹp đẽ. Đây là vibe design thực sự là gì, vibe design khác vibe coding ra sao, và cách đưa nó từ câu lệnh đến mã được triển khai."
    category: "Hướng dẫn"
    bodyHtml: |
      <p>Suốt năm 2026, các nhà thiết kế, nhà sáng lập và kỹ sư sản phẩm liên tục nghe đến "vibe design" — nhưng một nửa số bài viết là lời quảng cáo của nhà cung cấp, nửa còn lại thì chẳng bao giờ nói chuyện gì xảy ra <em>sau khi</em> AI nhả ra một màn hình. Hướng dẫn này mang đến cho bạn một định nghĩa rõ ràng, nguồn gốc của nó, cách quy trình vận hành, và một khoảng trống mà chẳng ai nhắc tới: đưa sản phẩm lên thực tế.</p>
      <h2>Vibe design là gì?</h2>
      <p><strong>Vibe design là một cách tiếp cận thiết kế giao diện và sản phẩm, trong đó đầu vào chính của bạn là ý định</strong> — được mô tả bằng ngôn ngữ tự nhiên, một hình ảnh tham chiếu, hoặc một URL — <strong>và AI sẽ tạo ra thiết kế trong khi bạn dẫn dắt bằng cảm giác</strong> thay vì làm thủ công.</p>
      <p>Thay vì đặt từng thành phần, căn chỉnh khoảng cách và lùng sục trong bảng chọn màu, bạn mô tả cái <em>vibe</em>: tông điệu, hướng bố cục, cảm giác. Bạn hành xử ít giống một người thợ thủ công, mà giống một giám đốc sáng tạo đang xem xét và điều chỉnh lại hơn. Có ba điều định nghĩa nó:</p>
      <ul>
      <li><strong>Ý định đi vào</strong> — một câu lệnh, một ảnh chụp màn hình, một trang web tham chiếu, hoặc một bản phác thảo nháp.</li>
      <li><strong>Kết quả đi ra</strong> — AI trả về giao diện thật, chứ không phải một khung trắng.</li>
      <li><strong>Dẫn dắt</strong> — bạn nhận xét và điều chỉnh bằng ngôn ngữ tự nhiên cho đến khi vừa ý.</li>
      </ul>
      <h2>Vibe design khác vibe coding như thế nào</h2>
      <p>Thuật ngữ này bắt nguồn trực tiếp từ <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, do Andrej Karpathy đặt ra vào năm 2025: đừng tự tay viết mã — hãy mô tả điều bạn muốn và để AI triển khai. <strong>Vibe design áp dụng đúng triết lý "ý định đặt lên hàng đầu" đó vào tầng giao diện.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Đầu vào</strong></td><td>Ý định (nó nên làm gì)</td><td>Ý định (nó nên trông và cảm thấy ra sao)</td></tr>
      <tr><td><strong>Đầu ra</strong></td><td>Mã chạy được</td><td>Giao diện chạy được</td></tr>
      <tr><td><strong>Bạn dẫn dắt bằng</strong></td><td>Hành vi &amp; logic</td><td>Tông điệu, bố cục, gu thẩm mỹ</td></tr>
      <tr><td><strong>Được phổ biến bởi</strong></td><td>Karpathy, 2025</td><td>Google Stitch, đầu 2026</td></tr>
      </tbody>
      </table>
      <p>Chúng là hai đầu của cùng một sự dịch chuyển, và đến năm 2026 chúng đang hội tụ lại: những agent hữu ích nhất vừa thiết kế <em>vừa</em> xây dựng. Google đã đưa "vibe design" trở thành xu hướng phổ biến với việc ra mắt <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> vào đầu năm 2026, đặt tên cho cả hạng mục này và tạo nên một làn sóng nhu cầu tìm kiếm.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Ảnh minh họa Google Stitch tạo một màn hình giao diện duy nhất từ một câu lệnh văn bản" />
        <figcaption>Google Stitch đã đưa "vibe design" trở nên phổ biến — nhưng dừng lại ở một màn hình được tạo ra.</figcaption>
      </figure>
      <h2>Vibe design thực chất hoạt động ra sao</h2>
      <p>Một vòng lặp điển hình diễn ra qua bốn bước:</p>
      <ol>
      <li><strong>Mô tả cái vibe</strong> — "một bảng điều khiển fintech điềm tĩnh, đáng tin cậy, nhiều khoảng trắng, một màu nhấn duy nhất."</li>
      <li><strong>Tạo sinh</strong> — AI trả về một màn hình thật (hoặc vài biến thể).</li>
      <li><strong>Dẫn dắt</strong> — "làm cho dày đặc hơn," "bảng màu ấm hơn," "thêm trạng thái trống."</li>
      <li><strong>Lặp lại</strong> cho đến khi khớp với ý định.</li>
      </ol>
      <p>Phần thưởng là tốc độ và khả năng tiếp cận: một hai người điều phối AI có thể tạo ra hàng chục concept chỉn chu mỗi tuần, và những người không phải nhà thiết kế cũng có thể chạm tới một giao diện đáng tin mà không cần học một công cụ nặng nề.</p>
      <p>Trong một <a href="/blog/why-we-built-open-design-as-a-skill-layer/">không gian làm việc agent-native</a> như Open Design, vòng lặp này nằm gọn trên một bề mặt duy nhất — bạn mô tả cái vibe cho chính agent mà sau này có thể viết mã, nên việc dẫn dắt thiết kế và việc xây dựng sản phẩm không còn là hai công cụ tách rời. <em>(Công bố minh bạch: chúng tôi là người làm ra Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Hình minh họa giao diện Open Design với câu lệnh ngôn ngữ tự nhiên ở bên trái và giao diện được tạo ra ở bên phải" />
        <figcaption>Vòng lặp ý định → tạo sinh → dẫn dắt, trong Open Design.</figcaption>
      </figure>
      <h2>Khoảng trống chẳng ai nhắc tới: từ mockup đến sản phẩm thật</h2>
      <p>Đây chính là chỗ mà phần lớn các công cụ "vibe design" lặng lẽ dừng lại — ở một <strong>bản mockup tĩnh</strong>. Bạn có một màn hình đẹp đẽ, rồi lại quay về tự tay chuyển nó thành mã, và thiết kế thì không bao giờ được cập nhật nữa.</p>
      <p>Vibe design thực thụ không nên kết thúc ở một bức tranh. Phiên bản khó hơn và giá trị hơn là <strong>agentic vibe design</strong>: một agent tạo ra thiết kế, <strong>tự phê bình và tiến hóa nó, rồi đưa nó thành mã sản xuất</strong> — giữ cho thiết kế và mã luôn đồng bộ trong khi bạn dẫn dắt.</p>
      <table>
      <thead>
      <tr><th>Giai đoạn</th><th>Phần lớn công cụ hiện nay</th><th>Agentic vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>Tạo giao diện</td><td>✅</td><td>✅</td></tr>
      <tr><td>Tự phê bình &amp; lặp lại</td><td>❌ một màn hình tĩnh</td><td>✅ agent chỉnh sửa</td></tr>
      <tr><td>Đưa thành mã thật</td><td>❌ tự tay chuyển đổi sau</td><td>✅ xuất ra mã chạy được</td></tr>
      <tr><td>Giữ thiết kế ↔ mã đồng bộ</td><td>❌</td><td>✅</td></tr>
      <tr><td>Mã nguồn mở / BYOK</td><td>phần lớn đóng</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Đây chính là làn đường mà <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> hoạt động — không gian thiết kế agent-native, mã nguồn mở. Bạn mô tả cái vibe, một agent thiết kế giao diện, tiến hóa nó, rồi <a href="/blog/31-skills-72-systems-how-the-library-works/">đưa nó thành mã thật</a>; nó là <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> (tự mang khóa API của bạn) và hoạt động song song với agent lập trình bạn đang dùng (Claude Code, Cursor, và những công cụ khác) thay vì nhốt bạn vào một canvas đóng — nên phần hướng dẫn từng bước dưới đây cho bạn thấy quy trình, chứ không chỉ nói suông.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Hình minh họa giao diện Open Design xuất một thiết kế được tạo ra thành mã sản xuất" />
        <figcaption>Agentic vibe design kết thúc ở mã có thể đưa lên thực tế, chứ không phải một ảnh chụp màn hình.</figcaption>
      </figure>
      <blockquote>
      <p>Một vòng lặp cụ thể chúng tôi chạy thường xuyên: ra lệnh tạo một bảng điều khiển → nhận được một bố cục chạy được → "thắt chặt khoảng cách lại và thêm chế độ tối" → agent chỉnh sửa <em>cả thiết kế lẫn mã cùng lúc</em> → xuất ra HTML sản xuất. Sản phẩm là thứ có thể đưa lên thực tế, không phải một ảnh chụp màn hình.</p>
      </blockquote>
      <h2>Những lầm tưởng phổ biến về vibe design</h2>
      <ul>
      <li><strong>"Nó thay thế nhà thiết kế."</strong> Không — nó chuyển họ sang vai trò định hướng sáng tạo và gu thẩm mỹ, nơi sự phán đoán quan trọng hơn chứ không phải ít đi.</li>
      <li><strong>"Nó chỉ tạo ra những mockup vứt đi."</strong> Chỉ khi công cụ dừng lại ở mockup. Các công cụ agentic đưa nó tới tận mã.</li>
      <li><strong>"Bạn cần phải rành kỹ thuật."</strong> Ngược lại — ý định chính là giao diện.</li>
      <li><strong>"Nó chỉ là AI tạo ảnh."</strong> Vibe design tạo ra giao diện có cấu trúc, chỉnh sửa được, chứ không phải một bức tranh phẳng.</li>
      </ul>
      <h2>Cách bắt đầu vibe design ngay hôm nay</h2>
      <ol>
      <li><strong>Chọn một công cụ đặt ý định lên hàng đầu và đưa được ra mã</strong>, chứ không chỉ dừng ở mockup, để công sức của bạn không đi vào ngõ cụt.</li>
      <li><strong>Bắt đầu từ một tham chiếu</strong> — dán một ảnh chụp màn hình hoặc URL; nói rõ cái gì giữ lại và cái gì thay đổi.</li>
      <li><strong>Dẫn dắt bằng ngôn ngữ đời thường</strong> — lặp lại trên mật độ, bảng màu, tông điệu và các trạng thái.</li>
      <li><strong>Đưa thành mã sớm</strong> — thiết kế càng sớm trở thành mã thật, bạn càng sớm biết được cái gì hiệu quả.</li>
      <li><strong>Giữ cho nó mở và thuộc về bạn</strong> — mã nguồn mở + BYOK tránh bị khóa chân khi hạng mục này dịch chuyển nhanh chóng. (Nếu bạn đang chuyển sang từ một canvas đóng, đây là <a href="/blog/figma-alternative-open-design/">con đường mã nguồn mở rời khỏi Figma</a> và <a href="/blog/open-source-alternative-to-claude-design/">rời khỏi Claude Design</a>.)</li>
      </ol>
      <h2>Điều rút ra</h2>
      <p>Vibe design là thiết kế đặt ý định lên hàng đầu: bạn mô tả, AI tạo sinh, bạn dẫn dắt. Sinh ra từ vibe coding và được Google Stitch đưa thành xu hướng phổ biến vào năm 2026, nó thu hẹp khoảng cách giữa ý tưởng và giao diện. Nhưng phiên bản thực sự quan trọng thì không dừng lại ở một bản mockup — <strong>nó mang tính agentic, và nó đưa ra được mã.</strong> Hãy bắt đầu từ đó, và vibe design sẽ trở thành kết quả thực sự, chứ không chỉ là một bức tranh đẹp.</p>
      <p><em>Sẵn sàng thử chưa? <a href="/download">Mở ứng dụng</a> hoặc <a href="/plugins">duyệt thư viện design systems và skills</a>.</em></p>
  pl:
    title: "Czym jest vibe design? Przewodnik 2026 po projektowaniu intencją"
    summary: "Opisujesz odczucie i kierunek interfejsu, a AI go generuje — ale większość narzędzi kończy na ładnym makiecie. Oto czym naprawdę jest vibe design, jak ma się vibe design do vibe coding i jak doprowadzić go od promptu do wdrożonego kodu."
    category: "Poradniki"
    bodyHtml: |
      <p>Projektanci, founderzy i product engineerzy bez przerwy słyszą w 2026 roku o „vibe design” — ale połowa artykułów to laurki sprzedawców, a druga połowa nigdy nie mówi, co dzieje się <em>po tym</em>, jak AI wypluje ekran. Ten przewodnik daje ci jasną definicję, rodowód, sposób działania całego procesu oraz tę jedną lukę, o której nikt nie mówi: wdrożenie.</p>
      <h2>Czym jest vibe design?</h2>
      <p><strong>Vibe design to podejście do projektowania interfejsów i produktów, w którym twoim głównym wejściem jest intencja</strong> — opisana w języku naturalnym, w postaci obrazu referencyjnego albo adresu URL — <strong>a AI generuje projekt, podczas gdy ty sterujesz wyczuciem</strong>, a nie ręcznie.</p>
      <p>Zamiast rozmieszczać komponenty, korygować odstępy i przekopywać się przez próbniki kolorów, opisujesz <em>vibe</em>: ton, kierunek układu, odczucie. Działasz mniej jak rzemieślnik, a bardziej jak dyrektor kreatywny, który ocenia i koryguje kierunek. Definiują go trzy rzeczy:</p>
      <ul>
      <li><strong>Intencja na wejściu</strong> — prompt, zrzut ekranu, strona referencyjna albo zgrubny szkic.</li>
      <li><strong>Generacja na wyjściu</strong> — AI zwraca prawdziwy interfejs, a nie pusty arkusz.</li>
      <li><strong>Sterowanie</strong> — krytykujesz i korygujesz kierunek w języku naturalnym, aż będzie dobrze.</li>
      </ul>
      <h2>Vibe design a vibe coding</h2>
      <p>Termin wywodzi się bezpośrednio z <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, ukutego przez Andreja Karpathy'ego w 2025 roku: nie pisz kodu ręcznie — opisz, czego chcesz, i pozwól AI to zaimplementować. <strong>Vibe design stosuje tę samą filozofię „najpierw intencja” do warstwy wizualnej.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Wejście</strong></td><td>Intencja (co ma robić)</td><td>Intencja (jak ma wyglądać i jakie dawać odczucie)</td></tr>
      <tr><td><strong>Wyjście</strong></td><td>Działający kod</td><td>Działający interfejs</td></tr>
      <tr><td><strong>Sterujesz przez</strong></td><td>Zachowanie i logikę</td><td>Ton, układ, gust</td></tr>
      <tr><td><strong>Spopularyzowane przez</strong></td><td>Karpathy, 2025</td><td>Google Stitch, początek 2026</td></tr>
      </tbody>
      </table>
      <p>To dwa końce tej samej zmiany, a w 2026 roku zaczynają się zbiegać: najbardziej użyteczne agenty <em>projektują</em> i jednocześnie budują. Google wprowadził „vibe design” do głównego nurtu wraz z premierą <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> na początku 2026 roku, nadając tej kategorii nazwę i wywołując falę zapytań w wyszukiwarce.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Przykładowy zrzut ekranu pokazujący, jak Google Stitch generuje pojedynczy ekran interfejsu z tekstowego promptu" />
        <figcaption>Google Stitch wprowadził „vibe design” do głównego nurtu — ale kończy na wygenerowanym ekranie.</figcaption>
      </figure>
      <h2>Jak vibe design działa w praktyce</h2>
      <p>Typowa pętla przebiega w czterech ruchach:</p>
      <ol>
      <li><strong>Opisz vibe</strong> — „spokojny, budzący zaufanie dashboard fintechowy, dużo wolnej przestrzeni, jeden kolor akcentu”.</li>
      <li><strong>Wygeneruj</strong> — AI zwraca prawdziwy ekran (albo kilka wariantów).</li>
      <li><strong>Steruj</strong> — „zrób to gęściej”, „cieplejsza paleta”, „dodaj stan pusty”.</li>
      <li><strong>Iteruj</strong>, aż będzie zgodne z intencją.</li>
      </ol>
      <p>Korzyścią są szybkość i dostępność: jedna lub dwie osoby kierujące AI mogą stworzyć w tydzień dziesiątki dopracowanych koncepcji, a osoby bez doświadczenia projektowego mogą dojść do wiarygodnego interfejsu bez nauki ciężkiego narzędzia.</p>
      <p>W <a href="/blog/why-we-built-open-design-as-a-skill-layer/">środowisku natywnie agentowym</a>, takim jak Open Design, ta pętla żyje na jednej powierzchni — opisujesz vibe temu samemu agentowi, który później może napisać kod, więc sterowanie projektem i budowanie produktu nie są dwoma rozłącznymi narzędziami. <em>(Dla jasności: to my tworzymy Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Przykładowy widok interfejsu Open Design pokazujący prompt w języku naturalnym po lewej i wygenerowany interfejs po prawej" />
        <figcaption>Pętla intencja → generacja → sterowanie w Open Design.</figcaption>
      </figure>
      <h2>Luka, o której nikt nie mówi: od makiety do wdrożenia</h2>
      <p>Tu właśnie większość narzędzi do „vibe design” po cichu się zatrzymuje — na <strong>statycznej makiecie</strong>. Dostajesz piękny ekran, a potem wracasz do ręcznego przekładania go na kod, i projekt już nigdy się nie aktualizuje.</p>
      <p>Prawdziwy vibe design nie powinien kończyć się na obrazku. Trudniejsza i bardziej wartościowa wersja to <strong>agentowy vibe design</strong>: agent, który generuje projekt, <strong>krytykuje go i rozwija oraz wdraża do kodu produkcyjnego</strong> — utrzymując projekt i kod w synchronizacji w miarę, jak sterujesz.</p>
      <table>
      <thead>
      <tr><th>Etap</th><th>Większość dzisiejszych narzędzi</th><th>Agentowy vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>Generowanie interfejsu</td><td>✅</td><td>✅</td></tr>
      <tr><td>Samokrytyka i iteracja</td><td>❌ jeden statyczny ekran</td><td>✅ agent poprawia</td></tr>
      <tr><td>Wdrożenie do prawdziwego kodu</td><td>❌ ręczne tłumaczenie później</td><td>✅ eksportuje działający kod</td></tr>
      <tr><td>Synchronizacja projekt ↔ kod</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open source / BYOK</td><td>przeważnie zamknięte</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>To właśnie obszar, w którym działa <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — otwartoźródłowe, natywnie agentowe środowisko projektowe. Opisujesz vibe, agent projektuje interfejs, rozwija go i <a href="/blog/31-skills-72-systems-how-the-library-works/">wdraża do prawdziwego kodu</a>; działa w modelu <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> i współpracuje z agentem do kodowania, którego już używasz (Claude Code, Cursor i inne), zamiast zamykać cię w zamkniętym arkuszu roboczym — więc poniższy przewodnik pokazuje ten proces, a nie tylko o nim opowiada.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Przykładowy widok interfejsu Open Design pokazujący eksport wygenerowanego projektu do kodu produkcyjnego" />
        <figcaption>Agentowy vibe design kończy się kodem gotowym do wdrożenia, a nie zrzutem ekranu.</figcaption>
      </figure>
      <blockquote>
      <p>Konkretna pętla, którą uruchamiamy bez przerwy: poproś o dashboard → dostań działający układ → „ściśnij odstępy i dodaj tryb ciemny” → agent poprawia <em>projekt i kod razem</em> → wyeksportuj produkcyjny HTML. Rezultat nadaje się do wdrożenia, a nie jest zrzutem ekranu.</p>
      </blockquote>
      <h2>Popularne mity o vibe design</h2>
      <ul>
      <li><strong>„To zastąpi projektantów”.</strong> Nie — przesuwa ich w stronę dyrekcji kreatywnej i gustu, gdzie osąd liczy się bardziej, a nie mniej.</li>
      <li><strong>„Robi tylko jednorazowe makiety”.</strong> Tylko jeśli narzędzie kończy na makietach. Narzędzia agentowe doprowadzają je do kodu.</li>
      <li><strong>„Trzeba być technicznym”.</strong> Wręcz przeciwnie — intencja jest interfejsem.</li>
      <li><strong>„To po prostu generowanie obrazów przez AI”.</strong> Vibe design tworzy ustrukturyzowany, edytowalny interfejs, a nie płaski obrazek.</li>
      </ul>
      <h2>Jak zacząć z vibe designem już dziś</h2>
      <ol>
      <li><strong>Wybierz narzędzie stawiające intencję na pierwszym miejscu, które wdraża do kodu</strong>, a nie tylko tworzy makiety, żeby twoja praca nie utknęła w ślepym zaułku.</li>
      <li><strong>Zacznij od referencji</strong> — wklej zrzut ekranu lub URL; powiedz, co zachować, a co zmienić.</li>
      <li><strong>Steruj prostym językiem</strong> — iteruj nad gęstością, paletą, tonem i stanami.</li>
      <li><strong>Wcześnie przechodź do kodu</strong> — im szybciej projekt staje się prawdziwym kodem, tym szybciej dowiesz się, co działa.</li>
      <li><strong>Zachowaj to otwarte i swoje</strong> — open source + BYOK chroni przed uzależnieniem od dostawcy, gdy kategoria szybko się zmienia. (Jeśli przychodzisz z zamkniętego arkusza roboczego, oto <a href="/blog/figma-alternative-open-design/">otwartoźródłowa droga od Figmy</a> oraz <a href="/blog/open-source-alternative-to-claude-design/">od Claude Design</a>.)</li>
      </ol>
      <h2>Najważniejszy wniosek</h2>
      <p>Vibe design to projektowanie zaczynające się od intencji: ty opisujesz, AI generuje, ty sterujesz. Zrodzony z vibe coding i wepchnięty do głównego nurtu przez Google Stitch w 2026 roku, skraca dystans między pomysłem a interfejsem. Ale wersja, która naprawdę się liczy, nie kończy na makiecie — <strong>jest agentowa i wdraża się do kodu.</strong> Zacznij właśnie tam, a vibe design stanie się realnym efektem, a nie tylko ładnym obrazkiem.</p>
      <p><em>Gotów, żeby spróbować? <a href="/download">Otwórz aplikację</a> albo <a href="/plugins">przejrzyj bibliotekę systemów projektowych i umiejętności</a>.</em></p>
  id:
    title: "Apa Itu Vibe Design? Panduan 2026 untuk Mendesain Berdasarkan Niat"
    summary: "Jelaskan kesan dan arah sebuah UI lalu biarkan AI menghasilkannya — tetapi kebanyakan alat berhenti di mockup yang sekadar cantik. Inilah arti sebenarnya vibe design, perbandingan vibe design vs vibe coding, dan cara membawanya dari prompt hingga menjadi kode yang siap rilis."
    category: "Panduan"
    bodyHtml: |
      <p>Para desainer, founder, dan product engineer terus mendengar istilah "vibe design" pada 2026 — tetapi separuh artikel hanyalah promosi vendor, dan separuh lainnya tidak pernah menjelaskan apa yang terjadi <em>setelah</em> AI memuntahkan sebuah layar. Panduan ini memberi Anda definisi yang jelas, asal-usulnya, cara kerja alurnya, dan satu celah yang tak pernah dibahas siapa pun: merilis ke produksi.</p>
      <h2>Apa itu vibe design?</h2>
      <p><strong>Vibe design adalah pendekatan terhadap desain UI dan produk yang menjadikan niat (intent) sebagai masukan utama Anda</strong> — dijelaskan dalam bahasa alami, gambar referensi, atau sebuah URL — <strong>dan sebuah AI menghasilkan desainnya sementara Anda mengarahkan berdasarkan kesan</strong>, bukan dengan mengerjakannya secara manual.</p>
      <p>Alih-alih menempatkan komponen, menggeser-geser jarak antar elemen, dan berkutat dengan pemilih warna, Anda menjelaskan <em>vibe</em>-nya: nuansanya, arah tata letaknya, kesannya. Anda berperan lebih sebagai creative director yang menelaah dan mengarahkan ulang, ketimbang sebagai pengrajin. Tiga hal mendefinisikannya:</p>
      <ul>
      <li><strong>Niat masuk</strong> — sebuah prompt, tangkapan layar, situs referensi, atau sketsa kasar.</li>
      <li><strong>Hasil keluar</strong> — AI mengembalikan UI yang nyata, bukan kanvas kosong.</li>
      <li><strong>Pengarahan</strong> — Anda mengkritisi dan mengarahkan ulang dengan bahasa alami sampai semuanya pas.</li>
      </ul>
      <h2>Vibe design vs vibe coding</h2>
      <p>Istilah ini berasal langsung dari <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, yang dicetuskan Andrej Karpathy pada 2025: jangan menulis kode dengan tangan — jelaskan apa yang Anda inginkan dan biarkan AI yang mengimplementasikannya. <strong>Vibe design menerapkan filosofi "niat lebih dulu" yang sama itu ke lapisan visual.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Masukan</strong></td><td>Niat (apa yang harus dilakukannya)</td><td>Niat (bagaimana tampilan & kesannya)</td></tr>
      <tr><td><strong>Keluaran</strong></td><td>Kode yang berfungsi</td><td>Antarmuka yang berfungsi</td></tr>
      <tr><td><strong>Anda mengarahkan lewat</strong></td><td>Perilaku & logika</td><td>Nuansa, tata letak, selera</td></tr>
      <tr><td><strong>Dipopulerkan oleh</strong></td><td>Karpathy, 2025</td><td>Google Stitch, awal 2026</td></tr>
      </tbody>
      </table>
      <p>Keduanya adalah dua ujung dari pergeseran yang sama, dan pada 2026 keduanya mulai menyatu: agen yang paling berguna mendesain <em>sekaligus</em> membangun. Google membawa "vibe design" ke arus utama lewat peluncuran <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> pada awal 2026, memberi kategori ini sebuah nama dan gelombang permintaan pencarian.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Placeholder tangkapan layar Google Stitch yang menghasilkan satu layar UI dari sebuah prompt teks" />
        <figcaption>Google Stitch membawa "vibe design" ke arus utama — tetapi berhenti di layar yang dihasilkan.</figcaption>
      </figure>
      <h2>Bagaimana vibe design benar-benar bekerja</h2>
      <p>Sebuah putaran umum berjalan dalam empat langkah:</p>
      <ol>
      <li><strong>Jelaskan vibe-nya</strong> — "sebuah dashboard fintech yang tenang dan tepercaya, banyak ruang putih, satu warna aksen."</li>
      <li><strong>Hasilkan</strong> — AI mengembalikan sebuah layar nyata (atau beberapa varian).</li>
      <li><strong>Arahkan</strong> — "buat lebih padat," "palet yang lebih hangat," "tambahkan empty state."</li>
      <li><strong>Iterasi</strong> sampai sesuai dengan niat Anda.</li>
      </ol>
      <p>Imbalannya adalah kecepatan dan keterjangkauan: satu atau dua orang yang mengarahkan AI dapat menghasilkan puluhan konsep yang rapi dalam seminggu, dan orang non-desainer bisa sampai pada antarmuka yang meyakinkan tanpa perlu menguasai alat yang berat.</p>
      <p>Di sebuah <a href="/blog/why-we-built-open-design-as-a-skill-layer/">workspace agent-native</a> seperti Open Design, putaran ini berlangsung dalam satu permukaan — Anda menjelaskan vibe-nya kepada agen yang sama yang nantinya bisa menulis kodenya, sehingga mengarahkan desain dan membangun produk bukan lagi dua alat yang terpisah. <em>(Pengungkapan: kami yang membangun Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Placeholder antarmuka Open Design yang menampilkan prompt bahasa alami di sebelah kiri dan UI yang dihasilkan di sebelah kanan" />
        <figcaption>Putaran niat → hasilkan → arahkan, di dalam Open Design.</figcaption>
      </figure>
      <h2>Celah yang tak pernah dibahas siapa pun: dari mockup ke produksi</h2>
      <p>Di sinilah kebanyakan alat "vibe design" diam-diam berhenti — pada sebuah <strong>mockup statis</strong>. Anda mendapatkan layar yang indah, lalu Anda kembali harus menerjemahkannya ke kode dengan tangan, dan desainnya tak pernah diperbarui lagi.</p>
      <p>Vibe design yang sesungguhnya semestinya tidak berakhir pada sebuah gambar. Versi yang lebih sulit sekaligus lebih bernilai adalah <strong>agentic vibe design</strong>: sebuah agen yang menghasilkan desain, <strong>mengkritisi serta mengembangkannya, lalu merilisnya menjadi kode produksi</strong> — menjaga desain dan kode tetap selaras saat Anda mengarahkannya.</p>
      <table>
      <thead>
      <tr><th>Tahap</th><th>Kebanyakan alat saat ini</th><th>Agentic vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>Menghasilkan UI</td><td>✅</td><td>✅</td></tr>
      <tr><td>Mengkritisi diri & beriterasi</td><td>❌ satu layar statis</td><td>✅ agen merevisi</td></tr>
      <tr><td>Merilis ke kode nyata</td><td>❌ diterjemahkan dengan tangan kemudian</td><td>✅ mengekspor kode yang berfungsi</td></tr>
      <tr><td>Menjaga desain ↔ kode tetap selaras</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open-source / BYOK</td><td>kebanyakan tertutup</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Inilah jalur yang ditempuh <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — workspace desain yang open-source dan agent-native. Anda menjelaskan vibe-nya, sebuah agen mendesain UI-nya, mengembangkannya, lalu <a href="/blog/31-skills-72-systems-how-the-library-works/">merilisnya menjadi kode nyata</a>; ia bersifat <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> dan bekerja berdampingan dengan coding agent yang sudah Anda pakai (Claude Code, Cursor, dan lainnya) alih-alih mengurung Anda dalam kanvas tertutup — jadi panduan langkah demi langkah di bawah ini menunjukkan alur kerjanya, bukan sekadar mengklaimnya.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Placeholder antarmuka Open Design yang menampilkan desain yang dihasilkan diekspor menjadi kode produksi" />
        <figcaption>Agentic vibe design berakhir pada kode yang siap dirilis, bukan tangkapan layar.</figcaption>
      </figure>
      <blockquote>
      <p>Sebuah putaran konkret yang terus kami jalankan: prompt sebuah dashboard → dapatkan tata letak yang berfungsi → "rapatkan jaraknya dan tambahkan mode gelap" → agen merevisi <em>desain dan kode sekaligus</em> → ekspor HTML produksi. Artefaknya siap dirilis, bukan tangkapan layar.</p>
      </blockquote>
      <h2>Mitos umum tentang vibe design</h2>
      <ul>
      <li><strong>"Ia menggantikan desainer."</strong> Tidak — ia menggeser mereka ke creative direction dan selera, di mana penilaian justru lebih penting, bukan kurang.</li>
      <li><strong>"Ia cuma membuat mockup sekali pakai."</strong> Hanya jika alatnya berhenti di mockup. Alat agentic membawanya hingga ke kode.</li>
      <li><strong>"Anda harus paham teknis."</strong> Justru sebaliknya — niatlah yang menjadi antarmukanya.</li>
      <li><strong>"Ini cuma pembuatan gambar oleh AI."</strong> Vibe design menghasilkan UI yang terstruktur dan dapat diedit, bukan gambar datar.</li>
      </ul>
      <h2>Cara memulai vibe design hari ini</h2>
      <ol>
      <li><strong>Pilih alat yang mengutamakan niat dan bisa merilis ke kode</strong>, bukan sekadar mockup, supaya hasil kerja Anda tidak buntu.</li>
      <li><strong>Mulailah dari sebuah referensi</strong> — tempelkan tangkapan layar atau URL; sebutkan apa yang ingin dipertahankan dan apa yang ingin diubah.</li>
      <li><strong>Arahkan dengan bahasa sehari-hari</strong> — beriterasi pada kerapatan, palet, nuansa, dan berbagai state.</li>
      <li><strong>Dorong ke kode sejak dini</strong> — semakin cepat desainnya menjadi kode nyata, semakin cepat Anda tahu apa yang berhasil.</li>
      <li><strong>Jaga agar tetap terbuka dan milik Anda</strong> — open-source + BYOK menghindarkan Anda dari lock-in saat kategori ini bergerak cepat. (Jika Anda datang dari kanvas tertutup, ini <a href="/blog/figma-alternative-open-design/">jalur open-source meninggalkan Figma</a> dan <a href="/blog/open-source-alternative-to-claude-design/">meninggalkan Claude Design</a>.)</li>
      </ol>
      <h2>Intinya</h2>
      <p>Vibe design adalah desain yang mengutamakan niat: Anda menjelaskan, AI menghasilkan, Anda mengarahkan. Lahir dari vibe coding dan didorong ke arus utama oleh Google Stitch pada 2026, ia memangkas jarak antara ide dan antarmuka. Tetapi versi yang benar-benar penting tidak berhenti di mockup — <strong>ia bersifat agentic, dan ia merilis ke kode.</strong> Mulailah dari sana dan vibe design menjadi keluaran yang nyata, bukan sekadar gambar yang cantik.</p>
      <p><em>Siap mencobanya? <a href="/download">Buka aplikasinya</a> atau <a href="/plugins">jelajahi pustaka design system dan skill</a>.</em></p>
  nl:
    title: "Wat is vibe design? De gids voor 2026 om te ontwerpen vanuit intentie"
    summary: "Beschrijf het gevoel en de richting van een UI en laat AI die genereren — maar de meeste tools blijven steken bij een mooie mockup. Dit is wat vibe design echt is, vibe design versus vibe coding, en hoe je het van prompt naar uitgeleverde code brengt."
    category: "Gidsen"
    bodyHtml: |
      <p>Ontwerpers, oprichters en product engineers horen in 2026 voortdurend de term “vibe design” — maar de helft van de artikelen is een verkooppraatje en de andere helft vertelt nooit wat er gebeurt <em>nadat</em> de AI een scherm heeft uitgespuugd. Deze gids geeft je een heldere definitie, de afkomst, hoe de workflow verloopt, en het ene gat waar niemand het over heeft: uitleveren.</p>
      <h2>Wat is vibe design?</h2>
      <p><strong>Vibe design is een benadering van UI- en productontwerp waarbij je primaire input intentie is</strong> — uitgedrukt in natuurlijke taal, een referentieafbeelding of een URL — <strong>en een AI het ontwerp genereert terwijl jij op gevoel bijstuurt</strong> in plaats van met de hand.</p>
      <p>In plaats van componenten te plaatsen, afstanden bij te schaven en door kleurkiezers te zoeken, beschrijf je de <em>vibe</em>: de toon, de richting van de layout, het gevoel. Je gedraagt je minder als een ambachtsman en meer als een creatief directeur die beoordeelt en bijstuurt. Drie dingen kenmerken het:</p>
      <ul>
      <li><strong>Intentie erin</strong> — een prompt, een screenshot, een referentiesite of een ruwe schets.</li>
      <li><strong>Generatie eruit</strong> — de AI levert echte UI op, geen leeg canvas.</li>
      <li><strong>Bijsturen</strong> — je geeft kritiek en stuurt bij in natuurlijke taal tot het klopt.</li>
      </ul>
      <h2>Vibe design versus vibe coding</h2>
      <p>De term stamt rechtstreeks af van <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, in 2025 bedacht door Andrej Karpathy: schrijf geen code met de hand — beschrijf wat je wilt en laat AI het implementeren. <strong>Vibe design past diezelfde “intentie-eerst”-filosofie toe op de visuele laag.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Input</strong></td><td>Intentie (wat het moet doen)</td><td>Intentie (hoe het eruit moet zien en aanvoelen)</td></tr>
      <tr><td><strong>Output</strong></td><td>Werkende code</td><td>Werkende interface</td></tr>
      <tr><td><strong>Je stuurt bij via</strong></td><td>Gedrag en logica</td><td>Toon, layout, smaak</td></tr>
      <tr><td><strong>Populair gemaakt door</strong></td><td>Karpathy, 2025</td><td>Google Stitch, begin 2026</td></tr>
      </tbody>
      </table>
      <p>Het zijn twee uiteinden van dezelfde verschuiving, en in 2026 komen ze samen: de nuttigste agents ontwerpen <em>én</em> bouwen. Google bracht “vibe design” naar het grote publiek met de lancering van <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> begin 2026, en gaf de categorie daarmee een naam en een golf van zoekvraag.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Screenshot-placeholder van Google Stitch dat één UI-scherm genereert vanuit een tekstprompt" />
        <figcaption>Google Stitch maakte “vibe design” mainstream — maar blijft steken bij een gegenereerd scherm.</figcaption>
      </figure>
      <h2>Hoe vibe design echt werkt</h2>
      <p>Een typische lus verloopt in vier stappen:</p>
      <ol>
      <li><strong>Beschrijf de vibe</strong> — “een rustig, betrouwbaar fintech-dashboard, veel witruimte, één accentkleur.”</li>
      <li><strong>Genereer</strong> — de AI levert een echt scherm op (of meerdere varianten).</li>
      <li><strong>Stuur bij</strong> — “maak het compacter”, “warmer kleurenpalet”, “voeg een lege toestand toe.”</li>
      <li><strong>Itereer</strong> tot het overeenkomt met de intentie.</li>
      </ol>
      <p>De winst zit in snelheid en toegankelijkheid: één of twee mensen die een AI aansturen, kunnen tientallen verfijnde concepten per week produceren, en niet-ontwerpers kunnen een geloofwaardige interface bereiken zonder een zwaar gereedschap te leren.</p>
      <p>In een <a href="/blog/why-we-built-open-design-as-a-skill-layer/">agent-native werkomgeving</a> als Open Design leeft deze lus op één oppervlak — je beschrijft de vibe aan dezelfde agent die later de code kan schrijven, zodat het bijsturen van het ontwerp en het bouwen van het product geen twee losgekoppelde tools zijn. <em>(Openheid: wij bouwen Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Placeholder van de Open Design-interface met links een prompt in natuurlijke taal en rechts een gegenereerde UI" />
        <figcaption>De lus intentie → genereren → bijsturen, in Open Design.</figcaption>
      </figure>
      <h2>Het gat waar niemand het over heeft: van mockup naar uitgeleverd</h2>
      <p>Hier stoppen de meeste “vibe design”-tools stilletjes — bij een <strong>statische mockup</strong>. Je krijgt een prachtig scherm, en daarna ben je weer terug bij het met de hand omzetten naar code, en het ontwerp wordt nooit meer bijgewerkt.</p>
      <p>Echte vibe design zou niet bij een plaatje moeten eindigen. De moeilijkere, waardevollere variant is <strong>agentic vibe design</strong>: een agent die het ontwerp genereert, <strong>het bekritiseert en laat evolueren, en het uitlevert naar productiecode</strong> — terwijl ontwerp en code synchroon blijven terwijl jij bijstuurt.</p>
      <table>
      <thead>
      <tr><th>Fase</th><th>De meeste tools vandaag</th><th>Agentic vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>UI genereren</td><td>✅</td><td>✅</td></tr>
      <tr><td>Zelfkritiek en itereren</td><td>❌ één statisch scherm</td><td>✅ agent herziet</td></tr>
      <tr><td>Uitleveren naar echte code</td><td>❌ later met de hand omzetten</td><td>✅ exporteert werkende code</td></tr>
      <tr><td>Ontwerp ↔ code synchroon houden</td><td>❌</td><td>✅</td></tr>
      <tr><td>Open source / BYOK</td><td>meestal gesloten</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Dit is de baan waarin <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> werkt — de open source, agent-native ontwerpwerkomgeving. Je beschrijft de vibe, een agent ontwerpt de UI, laat die evolueren en <a href="/blog/31-skills-72-systems-how-the-library-works/">levert die uit naar echte code</a>; het is <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> en werkt naast de coding agent die je al gebruikt (Claude Code, Cursor en andere) in plaats van je op te sluiten in een gesloten canvas — zodat de doorloop hieronder de workflow laat zien, en die niet alleen beweert.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Placeholder van de Open Design-interface met een gegenereerd ontwerp dat naar productiecode exporteert" />
        <figcaption>Agentic vibe design eindigt in uitleverbare code, niet in een screenshot.</figcaption>
      </figure>
      <blockquote>
      <p>Een concrete lus die wij voortdurend draaien: prompt een dashboard → krijg een werkende layout → “haal de afstanden strakker en voeg een donkere modus toe” → de agent herziet <em>ontwerp en code samen</em> → exporteer productie-HTML. Het resultaat is uitleverbaar, geen screenshot.</p>
      </blockquote>
      <h2>Veelvoorkomende mythes over vibe design</h2>
      <ul>
      <li><strong>“Het vervangt ontwerpers.”</strong> Nee — het verschuift hen naar creatieve regie en smaak, waar oordeel meer telt, niet minder.</li>
      <li><strong>“Het maakt alleen wegwerp-mockups.”</strong> Alleen als de tool bij mockups stopt. Agentic tools brengen het tot code.</li>
      <li><strong>“Je moet technisch zijn.”</strong> Juist andersom — intentie is de interface.</li>
      <li><strong>“Het is gewoon AI-beeldgeneratie.”</strong> Vibe design produceert gestructureerde, bewerkbare UI, geen plat plaatje.</li>
      </ul>
      <h2>Hoe je vandaag begint met vibe designen</h2>
      <ol>
      <li><strong>Kies een intentie-eerst tool dat uitlevert naar code</strong>, niet alleen mockups, zodat je werk niet doodloopt.</li>
      <li><strong>Begin vanuit een referentie</strong> — plak een screenshot of URL; zeg wat je wilt behouden en wat je wilt veranderen.</li>
      <li><strong>Stuur bij in gewone taal</strong> — itereer op dichtheid, palet, toon en toestanden.</li>
      <li><strong>Ga vroeg naar code</strong> — hoe eerder het ontwerp echte code is, hoe eerder je leert wat werkt.</li>
      <li><strong>Houd het open en van jezelf</strong> — open source + BYOK voorkomt lock-in nu de categorie snel beweegt. (Kom je van een gesloten canvas, dan vind je hier <a href="/blog/figma-alternative-open-design/">het open source-pad weg van Figma</a> en <a href="/blog/open-source-alternative-to-claude-design/">weg van Claude Design</a>.)</li>
      </ol>
      <h2>De kern</h2>
      <p>Vibe design is intentie-eerst ontwerpen: jij beschrijft, AI genereert, jij stuurt bij. Geboren uit vibe coding en door Google Stitch in 2026 naar het grote publiek gebracht, laat het de afstand tussen idee en interface ineenklappen. Maar de variant die ertoe doet, blijft niet bij een mockup steken — <strong>die is agentic, en levert uit naar code.</strong> Begin daar en vibe design wordt echte output, niet alleen een mooi plaatje.</p>
      <p><em>Klaar om het te proberen? <a href="/download">Open de app</a> of <a href="/plugins">blader door de bibliotheek met ontwerpsystemen en skills</a>.</em></p>
  ar:
    title: "ما هو تصميم الـ vibe (vibe design)؟ دليل 2026 للتصميم وفق النيّة"
    summary: "صِف إحساس واجهة المستخدم واتجاهها ودَع الذكاء الاصطناعي يولّدها — لكن معظم الأدوات تتوقف عند نموذج مبدئي أنيق فحسب. إليك ما يعنيه تصميم الـ vibe (vibe design) حقًّا، والفرق بين vibe design و vibe coding، وكيف تنقله من المُحفِّز النصّي إلى كود جاهز للإطلاق."
    category: "أدلّة إرشادية"
    bodyHtml: |
      <p>ما زال المصمِّمون والمؤسِّسون ومهندسو المنتجات يسمعون عبارة «vibe design» في عام 2026 — لكنّ نصف المقالات عروضٌ ترويجية من البائعين، والنصف الآخر لا يذكر أبدًا ما يحدث <em>بعد</em> أن يُخرج الذكاء الاصطناعي شاشةً ما. يقدّم لك هذا الدليل تعريفًا واضحًا، ونسبَ الفكرة، وكيفية سير العمل، والثغرة الوحيدة التي لا يتحدّث عنها أحد: الإطلاق.</p>
      <h2>ما هو تصميم الـ vibe (vibe design)؟</h2>
      <p><strong>تصميم الـ vibe (vibe design) هو منهجٌ في تصميم واجهات المستخدم والمنتجات يكون فيه مُدخَلك الأساسي هو النيّة</strong> — موصوفةً بلغة طبيعية، أو صورةٍ مرجعية، أو رابط — <strong>ويتولّى الذكاء الاصطناعي توليد التصميم بينما توجِّهه أنت بالإحساس</strong> بدلًا من العمل اليدوي.</p>
      <p>فبدلًا من وضع المكوّنات، وضبط المسافات بدقّة، والبحث في منتقيات الألوان، تَصِف <em>الـ vibe</em>: النبرة، واتجاه التخطيط، والإحساس. تتصرّف لا كحرفيٍّ بل كمدير إبداعي يراجع ويعيد التوجيه. ثلاثة عناصر تحدّده:</p>
      <ul>
      <li><strong>نيّة داخلة</strong> — مُحفِّز نصّي، أو لقطة شاشة، أو موقع مرجعي، أو رسمٌ تخطيطي تقريبي.</li>
      <li><strong>توليد خارج</strong> — يُعيد الذكاء الاصطناعي واجهةً حقيقية، لا لوحةً فارغة.</li>
      <li><strong>التوجيه</strong> — تنقد وتعيد التوجيه بلغةٍ طبيعية حتى يصبح الأمر على ما يُرام.</li>
      </ul>
      <h2>الفرق بين vibe design و vibe coding</h2>
      <p>ينحدر المصطلح مباشرةً من <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>، الذي صاغه Andrej Karpathy عام 2025: لا تكتب الكود بيدك — صِف ما تريد ودَع الذكاء الاصطناعي ينفّذه. <strong>ويطبّق تصميم الـ vibe (vibe design) الفلسفة ذاتها «النيّة أولًا» على الطبقة البصرية.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>vibe coding</th><th>vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>المُدخَل</strong></td><td>النيّة (ما الذي ينبغي أن يفعله)</td><td>النيّة (كيف ينبغي أن يبدو ويُحَسّ)</td></tr>
      <tr><td><strong>المُخرَج</strong></td><td>كودٌ يعمل</td><td>واجهةٌ تعمل</td></tr>
      <tr><td><strong>توجِّه عبر</strong></td><td>السلوك والمنطق</td><td>النبرة، والتخطيط، والذوق</td></tr>
      <tr><td><strong>روّج له</strong></td><td>Karpathy، 2025</td><td>Google Stitch، مطلع 2026</td></tr>
      </tbody>
      </table>
      <p>إنهما طرفان لتحوّلٍ واحد، وفي 2026 يتقاربان: أكثر الوكلاء فائدةً هم من يصمّمون <em>ويبنون</em> معًا. دفعت Google بمصطلح «vibe design» إلى التيار السائد مع إطلاق <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> في مطلع 2026، فمنحت الفئة اسمًا وموجةً من الطلب على البحث.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="لقطة شاشة توضيحية لأداة Google Stitch وهي تولّد شاشة واجهة مستخدم واحدة انطلاقًا من مُحفِّز نصّي" />
        <figcaption>أوصلت Google Stitch مصطلح «vibe design» إلى التيار السائد — لكنها تتوقّف عند شاشةٍ مولَّدة.</figcaption>
      </figure>
      <h2>كيف يعمل تصميم الـ vibe (vibe design) فعليًّا</h2>
      <p>تجري الحلقة النموذجية في أربع خطوات:</p>
      <ol>
      <li><strong>صِف الـ vibe</strong> — «لوحة تحكّم مالية هادئة وجديرة بالثقة، مساحات بيضاء وافرة، ولون تمييزي واحد».</li>
      <li><strong>ولِّد</strong> — يُعيد الذكاء الاصطناعي شاشةً حقيقية (أو عدّة تنويعات).</li>
      <li><strong>وجِّه</strong> — «اجعلها أكثر كثافة»، «لوحة ألوان أدفأ»، «أضِف حالة فارغة».</li>
      <li><strong>كرِّر</strong> حتى تطابق النيّة.</li>
      </ol>
      <p>المكسب هو السرعة والإتاحة: شخصٌ أو اثنان يوجِّهان ذكاءً اصطناعيًّا يمكنهما إنتاج عشرات المفاهيم المصقولة أسبوعيًّا، ويستطيع غير المصمِّمين الوصول إلى واجهةٍ مقنعة دون تعلّم أداةٍ ثقيلة.</p>
      <p>وفي <a href="/blog/why-we-built-open-design-as-a-skill-layer/">مساحة عملٍ أصيلة الوكيل (agent-native)</a> مثل Open Design، تعيش هذه الحلقة في سطحٍ واحد — فتصف الـ vibe للوكيل نفسه الذي يمكنه لاحقًا كتابة الكود، بحيث لا يكون توجيه التصميم وبناء المنتج أداتَين منفصلتَين. <em>(إفصاح: نحن من نبني Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="عنصر نائب لواجهة Open Design يعرض مُحفِّزًا بلغة طبيعية على اليسار وواجهة مستخدم مولَّدة على اليمين" />
        <figcaption>حلقة النيّة ← التوليد ← التوجيه، داخل Open Design.</figcaption>
      </figure>
      <h2>الثغرة التي لا يتحدّث عنها أحد: من النموذج المبدئي إلى الإطلاق</h2>
      <p>هنا تتوقّف بهدوءٍ معظم أدوات «vibe design» — عند <strong>نموذجٍ مبدئي ثابت</strong>. تحصل على شاشةٍ جميلة، ثم تعود إلى ترجمتها يدويًّا إلى كود، ولا يتحدّث التصميم بعدها أبدًا.</p>
      <p>لا ينبغي لتصميم الـ vibe الحقيقي أن ينتهي عند صورة. النسخة الأصعب والأكثر قيمةً هي <strong>تصميم الـ vibe الوكيلي (agentic vibe design)</strong>: وكيلٌ يولّد التصميم، <strong>وينقده ويطوّره، ويطلقه إلى كودٍ إنتاجي</strong> — مُبقيًا التصميم والكود متزامنَين بينما توجِّه.</p>
      <table>
      <thead>
      <tr><th>المرحلة</th><th>معظم الأدوات اليوم</th><th>تصميم الـ vibe الوكيلي</th></tr>
      </thead>
      <tbody>
      <tr><td>توليد واجهة المستخدم</td><td>✅</td><td>✅</td></tr>
      <tr><td>النقد الذاتي والتكرار</td><td>❌ شاشة ثابتة واحدة</td><td>✅ الوكيل يراجع</td></tr>
      <tr><td>الإطلاق إلى كودٍ حقيقي</td><td>❌ ترجمة يدوية لاحقًا</td><td>✅ يصدّر كودًا يعمل</td></tr>
      <tr><td>إبقاء التصميم ↔ الكود متزامنَين</td><td>❌</td><td>✅</td></tr>
      <tr><td>مفتوح المصدر / BYOK</td><td>مغلق في الغالب</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>هذا هو المسار الذي يعمل فيه <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — مساحة تصميمٍ مفتوحة المصدر وأصيلة الوكيل (agent-native). تصف الـ vibe، فيصمّم وكيلٌ واجهة المستخدم، ويطوّرها، <a href="/blog/31-skills-72-systems-how-the-library-works/">ويطلقها إلى كودٍ حقيقي</a>؛ وهو بنظام <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> ويعمل جنبًا إلى جنب مع وكيل البرمجة الذي تستخدمه أصلًا (Claude Code وCursor وغيرهما) بدلًا من حبسك داخل لوحةٍ مغلقة — لذا تعرض الجولة الإرشادية أدناه سير العمل، لا مجرّد ادّعائه.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="عنصر نائب لواجهة Open Design يعرض تصميمًا مولَّدًا وهو يُصدَّر إلى كودٍ إنتاجي" />
        <figcaption>ينتهي تصميم الـ vibe الوكيلي بكودٍ قابلٍ للإطلاق، لا بلقطة شاشة.</figcaption>
      </figure>
      <blockquote>
      <p>حلقةٌ ملموسة نجري عليها العمل باستمرار: حفِّز إنشاء لوحة تحكّم ← احصل على تخطيطٍ يعمل ← «أحكِم المسافات وأضِف الوضع الداكن» ← يراجع الوكيل <em>التصميم والكود معًا</em> ← صدِّر HTML إنتاجيًّا. المُخرَج قابلٌ للإطلاق، لا لقطة شاشة.</p>
      </blockquote>
      <h2>خرافات شائعة حول تصميم الـ vibe (vibe design)</h2>
      <ul>
      <li><strong>«إنه يحلّ محلّ المصمِّمين».</strong> كلّا — بل ينقلهم إلى التوجيه الإبداعي والذوق، حيث يصبح الحكم أكثر أهميةً لا أقل.</li>
      <li><strong>«إنه لا يصنع سوى نماذج مبدئية للرمي».</strong> فقط إن توقّفت الأداة عند النماذج المبدئية. أمّا الأدوات الوكيلية فتأخذه إلى الكود.</li>
      <li><strong>«عليك أن تكون تقنيًّا».</strong> العكس تمامًا — النيّة هي الواجهة.</li>
      <li><strong>«إنه مجرّد توليد صور بالذكاء الاصطناعي».</strong> تصميم الـ vibe ينتج واجهةً مُهيكلة وقابلة للتحرير، لا صورةً مسطّحة.</li>
      </ul>
      <h2>كيف تبدأ في تصميم الـ vibe اليوم</h2>
      <ol>
      <li><strong>اختر أداةً «النيّة أولًا» تطلق إلى كود</strong>، لا مجرّد نماذج مبدئية، حتى لا يصطدم عملك بطريقٍ مسدود.</li>
      <li><strong>ابدأ من مرجع</strong> — الصق لقطة شاشة أو رابطًا؛ وقُل ما الذي تُبقيه وما الذي تغيّره.</li>
      <li><strong>وجِّه بلغةٍ واضحة</strong> — كرِّر على الكثافة، ولوحة الألوان، والنبرة، والحالات.</li>
      <li><strong>ادفع نحو الكود مبكّرًا</strong> — كلّما صار التصميم كودًا حقيقيًّا أسرع، تعلّمت أسرع ما الذي ينجح.</li>
      <li><strong>أبقِه مفتوحًا ومُلكًا لك</strong> — المصدر المفتوح + BYOK يتجنّبان الاحتجاز مع تحرّك الفئة بسرعة. (إن كنت قادمًا من لوحةٍ مغلقة، فإليك <a href="/blog/figma-alternative-open-design/">المسار مفتوح المصدر بعيدًا عن Figma</a> و<a href="/blog/open-source-alternative-to-claude-design/">بعيدًا عن Claude Design</a>.)</li>
      </ol>
      <h2>الخلاصة</h2>
      <p>تصميم الـ vibe (vibe design) هو تصميمٌ النيّة فيه أولًا: تصف، فيولّد الذكاء الاصطناعي، فتوجِّه أنت. وُلد من vibe coding ودفعته Google Stitch إلى التيار السائد في 2026، فطوى المسافة بين الفكرة والواجهة. لكنّ النسخة التي تهمّ لا تتوقّف عند نموذجٍ مبدئي — <strong>إنها وكيلية، وتطلق إلى كود.</strong> ابدأ من هناك يصبح تصميم الـ vibe مُخرَجًا حقيقيًّا، لا مجرّد صورةٍ جميلة.</p>
      <p><em>جاهزٌ للتجربة؟ <a href="/download">افتح التطبيق</a> أو <a href="/plugins">تصفّح مكتبة أنظمة التصميم والمهارات</a>.</em></p>
  tr:
    title: "Vibe Design Nedir? Niyetle Tasarım Yapmaya Dair 2026 Rehberi"
    summary: "Bir arayüzün hissini ve yönünü tarif edin, yapay zekâ onu sizin için üretsin — ama çoğu araç şık bir taslakta durup kalıyor. İşte vibe design'ın gerçekte ne olduğu, vibe design ile vibe coding arasındaki fark ve onu istemden sevk edilen koda nasıl taşıyacağınız."
    category: "Rehberler"
    bodyHtml: |
      <p>Tasarımcılar, kurucular ve ürün mühendisleri 2026 boyunca durmadan "vibe design" lafını duyuyor — ama yazıların yarısı satıcı reklamı, diğer yarısı da yapay zekâ bir ekran çıkardıktan <em>sonra</em> ne olduğunu hiç söylemiyor. Bu rehber size net bir tanım, terimin kökeni, akışın nasıl işlediği ve kimsenin konuşmadığı tek boşluğu veriyor: ürünü sahaya almak.</p>
      <h2>Vibe design nedir?</h2>
      <p><strong>Vibe design, ana girdinizin niyet olduğu bir arayüz ve ürün tasarımı yaklaşımıdır</strong> — doğal dille, bir referans görselle ya da bir URL ile tarif edilen — <strong>ve siz işi elle yapmak yerine hisle yön verirken yapay zekânın tasarımı ürettiği</strong> bir yöntemdir.</p>
      <p>Bileşenleri yerleştirmek, boşlukları kurcalamak ve renk seçicilerde dolaşmak yerine <em>vibe</em>'ı tarif edersiniz: tonu, düzen yönünü, hissi. Bir zanaatkârdan çok, üretileni gözden geçirip yeniden yönlendiren bir yaratıcı yönetmen gibi davranırsınız. Onu üç şey tanımlar:</p>
      <ul>
      <li><strong>İçeri niyet</strong> — bir istem, bir ekran görüntüsü, bir referans site ya da kabataslak bir çizim.</li>
      <li><strong>Dışarı üretim</strong> — yapay zekâ boş bir tuval değil, gerçek bir arayüz döndürür.</li>
      <li><strong>Yönlendirme</strong> — doğru olana kadar doğal dille eleştirir ve yönü değiştirirsiniz.</li>
      </ul>
      <h2>Vibe design ile vibe coding karşılaştırması</h2>
      <p>Terim doğrudan, 2025'te Andrej Karpathy tarafından ortaya atılan <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a> kavramından geliyor: kodu elle yazma — ne istediğini tarif et, gerisini yapay zekâ uygulasın. <strong>Vibe design ise aynı "önce niyet" felsefesini görsel katmana taşır.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Girdi</strong></td><td>Niyet (ne yapması gerektiği)</td><td>Niyet (nasıl görünüp hissettirmesi gerektiği)</td></tr>
      <tr><td><strong>Çıktı</strong></td><td>Çalışan kod</td><td>Çalışan arayüz</td></tr>
      <tr><td><strong>Şununla yön verirsiniz</strong></td><td>Davranış ve mantık</td><td>Ton, düzen, zevk</td></tr>
      <tr><td><strong>Yaygınlaştıran</strong></td><td>Karpathy, 2025</td><td>Google Stitch, 2026 başı</td></tr>
      </tbody>
      </table>
      <p>İkisi de aynı dönüşümün iki ucu ve 2026'da birbirine yakınsıyorlar: en kullanışlı ajanlar hem tasarlıyor <em>hem de</em> inşa ediyor. Google, 2026 başındaki <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> lansmanıyla "vibe design"i ana akıma taşıdı; kategoriye bir ad ve büyük bir arama talebi dalgası kazandırdı.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Google Stitch'in bir metin isteminden tek bir arayüz ekranı ürettiğini gösteren ekran görüntüsü yer tutucusu" />
        <figcaption>Google Stitch, "vibe design"i ana akıma taşıdı — ama üretilen bir ekranda durup kalıyor.</figcaption>
      </figure>
      <h2>Vibe design gerçekte nasıl işler</h2>
      <p>Tipik bir döngü dört hamlede ilerler:</p>
      <ol>
      <li><strong>Vibe'ı tarif edin</strong> — "sakin, güven veren bir fintek panosu, bol beyaz alan, tek bir vurgu rengi."</li>
      <li><strong>Üretin</strong> — yapay zekâ gerçek bir ekran (ya da birkaç varyant) döndürür.</li>
      <li><strong>Yön verin</strong> — "daha yoğun yap," "daha sıcak bir palet," "bir boş durum ekle."</li>
      <li>Niyetle örtüşene kadar <strong>yineleyin</strong>.</li>
      </ol>
      <p>Kazancı hız ve erişimdir: bir yapay zekâya yön veren bir-iki kişi haftada düzinelerce cilalı konsept üretebilir ve tasarımcı olmayanlar ağır bir araç öğrenmeden inandırıcı bir arayüze ulaşabilir.</p>
      <p>Open Design gibi <a href="/blog/why-we-built-open-design-as-a-skill-layer/">ajan-yerel bir çalışma alanında</a> bu döngü tek bir yüzeyde yaşar — vibe'ı, daha sonra kodu da yazabilecek olan aynı ajana tarif edersiniz; böylece tasarıma yön vermek ile ürünü inşa etmek birbirinden kopuk iki araç olmaktan çıkar. <em>(Açıklama: Open Design'ı biz geliştiriyoruz.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Open Design arayüzü yer tutucusu: solda doğal dilde bir istem, sağda üretilmiş bir arayüz" />
        <figcaption>Niyet → üret → yön ver döngüsü, Open Design içinde.</figcaption>
      </figure>
      <h2>Kimsenin konuşmadığı boşluk: taslaktan sahaya alınmış ürüne</h2>
      <p>İşte çoğu "vibe design" aracının sessizce durakladığı yer — bir <strong>statik taslak</strong>. Güzel bir ekran elde edersiniz, sonra yine onu elle koda çevirmeye geri dönersiniz ve tasarım bir daha asla güncellenmez.</p>
      <p>Gerçek vibe design bir resimle bitmemeli. Daha zor, daha değerli olan sürüm <strong>ajansel vibe design</strong>'dır: tasarımı üreten, <strong>onu eleştirip evrilten ve üretim koduna kadar sahaya alan</strong> bir ajan — siz yön verdikçe tasarım ile kodu eşzamanlı tutar.</p>
      <table>
      <thead>
      <tr><th>Aşama</th><th>Bugünkü çoğu araç</th><th>Ajansel vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>Arayüz üretme</td><td>✅</td><td>✅</td></tr>
      <tr><td>Öz-eleştiri ve yineleme</td><td>❌ tek statik ekran</td><td>✅ ajan revize eder</td></tr>
      <tr><td>Gerçek koda taşıma</td><td>❌ sonradan elle çevir</td><td>✅ çalışan kod dışa aktarır</td></tr>
      <tr><td>Tasarım ↔ kodu eşzamanlı tutma</td><td>❌</td><td>✅</td></tr>
      <tr><td>Açık kaynak / BYOK</td><td>çoğunlukla kapalı</td><td>✅</td></tr>
      </tbody>
      </table>
      <p><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a>'ın oynadığı kulvar tam da budur — açık kaynaklı, ajan-yerel tasarım çalışma alanı. Vibe'ı tarif edersiniz, bir ajan arayüzü tasarlar, onu evriltir ve <a href="/blog/31-skills-72-systems-how-the-library-works/">gerçek koda taşır</a>; <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> esaslıdır ve sizi kapalı bir tuvale hapsetmek yerine zaten kullandığınız kodlama ajanının (Claude Code, Cursor ve diğerleri) yanında çalışır — bu yüzden aşağıdaki anlatım iş akışını sadece iddia etmekle kalmaz, gösterir.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Open Design arayüzü yer tutucusu: üretilmiş bir tasarımın üretim koduna dışa aktarılması" />
        <figcaption>Ajansel vibe design bir ekran görüntüsüyle değil, sahaya alınabilir kodla biter.</figcaption>
      </figure>
      <blockquote>
      <p>Sürekli işlettiğimiz somut bir döngü: bir pano iste → çalışan bir düzen al → "boşlukları sıkılaştır ve koyu mod ekle" → ajan <em>tasarımı ve kodu birlikte</em> revize eder → üretime hazır HTML dışa aktar. Ortaya çıkan, ekran görüntüsü değil, sahaya alınabilir bir üründür.</p>
      </blockquote>
      <h2>Vibe design hakkındaki yaygın efsaneler</h2>
      <ul>
      <li><strong>"Tasarımcıların yerini alır."</strong> Hayır — onları, muhakemenin daha az değil daha çok önem taşıdığı yaratıcı yönetim ve zevk işine kaydırır.</li>
      <li><strong>"Yalnızca tek kullanımlık taslaklar üretir."</strong> Sadece araç taslakta durursa öyle olur. Ajansel araçlar onu koda taşır.</li>
      <li><strong>"Teknik olmanız gerekir."</strong> Tam tersi — arayüz, niyetin kendisidir.</li>
      <li><strong>"Sadece yapay zekâ görsel üretimi işte."</strong> Vibe design düz bir resim değil, yapılandırılmış ve düzenlenebilir bir arayüz üretir.</li>
      </ul>
      <h2>Bugün vibe design'a nasıl başlanır</h2>
      <ol>
      <li><strong>Yalnızca taslak değil, koda taşıyan, önce niyet odaklı bir araç seçin</strong> ki işiniz çıkmaz sokağa girmesin.</li>
      <li><strong>Bir referanstan başlayın</strong> — bir ekran görüntüsü veya URL yapıştırın; neyin kalacağını, neyin değişeceğini söyleyin.</li>
      <li><strong>Sade bir dille yön verin</strong> — yoğunluk, palet, ton ve durumlar üzerinde yineleyin.</li>
      <li><strong>Erkenden koda geçin</strong> — tasarım ne kadar erken gerçek kod olursa, neyin işe yaradığını o kadar erken öğrenirsiniz.</li>
      <li><strong>Onu açık ve kendinize ait tutun</strong> — açık kaynak + BYOK, kategori hızla ilerlerken sizi bir markaya kilitlenmekten korur. (Kapalı bir tuvalden geliyorsanız, işte <a href="/blog/figma-alternative-open-design/">Figma'dan uzaklaşan açık kaynak yol</a> ve <a href="/blog/open-source-alternative-to-claude-design/">Claude Design'dan uzaklaşan yol</a>.)</li>
      </ol>
      <h2>Özetle</h2>
      <p>Vibe design, önce niyet odaklı tasarımdır: siz tarif edersiniz, yapay zekâ üretir, siz yön verirsiniz. Vibe coding'den doğan ve 2026'da Google Stitch tarafından ana akıma taşınan bu yaklaşım, fikir ile arayüz arasındaki mesafeyi yok eder. Ama asıl önemli olan sürüm bir taslakta durmaz — <strong>ajanseldir ve koda taşır.</strong> Oradan başlayın, böylece vibe design hoş bir resim olmaktan çıkıp gerçek bir çıktı olur.</p>
      <p><em>Denemeye hazır mısınız? <a href="/download">Uygulamayı açın</a> veya <a href="/plugins">tasarım sistemleri ve skill kütüphanesine göz atın</a>.</em></p>
  uk:
    title: "Що таке vibe design? Посібник 2026 року з проєктування за наміром"
    summary: "Опишіть відчуття та напрям інтерфейсу — і дозвольте ШІ згенерувати його. Та більшість інструментів зупиняються на гарному макеті. Розповідаємо, що таке vibe design насправді, чим vibe design відрізняється від vibe coding і як пройти шлях від запиту до готового коду."
    category: "Посібники"
    bodyHtml: |
      <p>Дизайнери, засновники та продуктові інженери у 2026 році постійно чують про «vibe design» — але половина статей є рекламою постачальників, а інша половина так і не пояснює, що відбувається <em>після</em> того, як ШІ видає екран. Цей посібник дає вам чітке визначення, історію походження, опис того, як працює сам процес, і вказує на одну прогалину, про яку ніхто не говорить: відвантаження в продакшн.</p>
      <h2>Що таке vibe design?</h2>
      <p><strong>Vibe design — це підхід до проєктування інтерфейсів і продуктів, у якому вашим основним вхідним сигналом є намір</strong> — описаний природною мовою, референсним зображенням або URL, — <strong>а ШІ генерує дизайн, тоді як ви скеровуєте його за відчуттям</strong>, а не вручну.</p>
      <p>Замість того щоб розставляти компоненти, підбирати відступи й копирсатися в палітрах кольорів, ви описуєте сам <em>вайб</em>: тон, напрям компонування, відчуття. Ви дієте не стільки як майстер-ремісник, скільки як креативний директор, який переглядає й коригує напрям. Цей підхід визначають три речі:</p>
      <ul>
      <li><strong>Намір на вході</strong> — запит, скриншот, референсний сайт або чорновий ескіз.</li>
      <li><strong>Генерація на виході</strong> — ШІ повертає справжній інтерфейс, а не порожнє полотно.</li>
      <li><strong>Скерування</strong> — ви критикуєте й коригуєте напрям природною мовою, доки результат не стане правильним.</li>
      </ul>
      <h2>Vibe design проти vibe coding</h2>
      <p>Цей термін походить безпосередньо від <a href="https://en.wikipedia.org/wiki/Vibe_coding"><strong>vibe coding</strong></a>, який Andrej Karpathy ввів у 2025 році: не пишіть код вручну — опишіть, що вам потрібно, і дозвольте ШІ це реалізувати. <strong>Vibe design застосовує ту саму філософію «спершу намір» до візуального шару.</strong></p>
      <table>
      <thead>
      <tr><th></th><th>Vibe coding</th><th>Vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td><strong>Вхід</strong></td><td>Намір (що це має робити)</td><td>Намір (який вигляд і відчуття має мати)</td></tr>
      <tr><td><strong>Вихід</strong></td><td>Робочий код</td><td>Робочий інтерфейс</td></tr>
      <tr><td><strong>Ви скеровуєте за</strong></td><td>Поведінкою та логікою</td><td>Тоном, компонуванням, смаком</td></tr>
      <tr><td><strong>Популяризував</strong></td><td>Karpathy, 2025</td><td>Google Stitch, початок 2026</td></tr>
      </tbody>
      </table>
      <p>Це два кінці одного й того самого зрушення, і у 2026 році вони сходяться: найкорисніші агенти <em>і</em> проєктують, <em>і</em> створюють. Google вивів «vibe design» у мейнстрім запуском <a href="https://stitch.withgoogle.com/"><strong>Stitch</strong></a> на початку 2026 року, давши цій категорії назву та хвилю пошукового попиту.</p>
      <figure>
        <img src="/blog/vibe-design-stitch.webp" alt="Заглушка-скриншот: Google Stitch генерує єдиний екран інтерфейсу з текстового запиту" />
        <figcaption>Google Stitch вивів «vibe design» у мейнстрім — але зупиняється на згенерованому екрані.</figcaption>
      </figure>
      <h2>Як vibe design працює насправді</h2>
      <p>Типовий цикл складається з чотирьох кроків:</p>
      <ol>
      <li><strong>Опишіть вайб</strong> — «спокійна, надійна фінтех-панель, багато білого простору, один акцентний колір».</li>
      <li><strong>Згенеруйте</strong> — ШІ повертає справжній екран (або кілька варіантів).</li>
      <li><strong>Скеруйте</strong> — «зроби щільніше», «тепліша палітра», «додай порожній стан».</li>
      <li><strong>Ітеруйте</strong>, доки результат не відповідатиме наміру.</li>
      </ol>
      <p>Виграш — це швидкість і доступність: одна-дві людини, скеровуючи ШІ, можуть створювати десятки відшліфованих концепцій на тиждень, а недизайнери можуть дійти до переконливого інтерфейсу, не опановуючи громіздкий інструмент.</p>
      <p>У <a href="/blog/why-we-built-open-design-as-a-skill-layer/">агентно-нативному робочому просторі</a>, як-от Open Design, цей цикл живе на одній поверхні — ви описуєте вайб тому самому агенту, який згодом може написати код, тож скерування дизайну й створення продукту не є двома роз’єднаними інструментами. <em>(Розкриття: ми створюємо Open Design.)</em></p>
      <figure>
        <img src="/blog/vibe-design-od-loop.webp" alt="Заглушка інтерфейсу Open Design: запит природною мовою ліворуч і згенерований інтерфейс праворуч" />
        <figcaption>Цикл намір → генерація → скерування в Open Design.</figcaption>
      </figure>
      <h2>Прогалина, про яку ніхто не говорить: від макета до продакшну</h2>
      <p>Саме тут більшість інструментів «vibe design» тихцем зупиняються — на <strong>статичному макеті</strong>. Ви отримуєте гарний екран, а потім знову повертаєтеся до того, щоб вручну перекладати його в код, і дизайн більше ніколи не оновлюється.</p>
      <p>Справжній vibe design не має закінчуватися картинкою. Складніша й цінніша версія — це <strong>агентний vibe design</strong>: агент, який генерує дизайн, <strong>критикує й розвиває його та відвантажує у продакшн-код</strong>, утримуючи дизайн і код синхронізованими в міру того, як ви скеровуєте процес.</p>
      <table>
      <thead>
      <tr><th>Етап</th><th>Більшість сьогоднішніх інструментів</th><th>Агентний vibe design</th></tr>
      </thead>
      <tbody>
      <tr><td>Генерація інтерфейсу</td><td>✅</td><td>✅</td></tr>
      <tr><td>Самокритика та ітерація</td><td>❌ один статичний екран</td><td>✅ агент переробляє</td></tr>
      <tr><td>Відвантаження у справжній код</td><td>❌ переклад вручну згодом</td><td>✅ експортує робочий код</td></tr>
      <tr><td>Синхронізація дизайн ↔ код</td><td>❌</td><td>✅</td></tr>
      <tr><td>Відкритий код / BYOK</td><td>здебільшого закриті</td><td>✅</td></tr>
      </tbody>
      </table>
      <p>Це саме та смуга, в якій працює <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design</a> — відкритий, агентно-нативний робочий простір для дизайну. Ви описуєте вайб, агент проєктує інтерфейс, розвиває його та <a href="/blog/31-skills-72-systems-how-the-library-works/">відвантажує у справжній код</a>; він працює за принципом <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK</a> і поєднується з тим агентом для кодування, яким ви вже користуєтеся (Claude Code, Cursor та іншими), замість того щоб замикати вас у закритому полотні — тож наведений нижче розбір показує робочий процес, а не лише обіцяє його.</p>
      <figure>
        <img src="/blog/vibe-design-od-ship.webp" alt="Заглушка інтерфейсу Open Design: згенерований дизайн експортується у продакшн-код" />
        <figcaption>Агентний vibe design завершується кодом, готовим до відвантаження, а не скриншотом.</figcaption>
      </figure>
      <blockquote>
      <p>Конкретний цикл, який ми запускаємо постійно: запит на панель → отримуємо робоче компонування → «ущільни відступи й додай темну тему» → агент переробляє <em>дизайн і код разом</em> → експортуємо продакшн-HTML. Артефакт готовий до відвантаження, а не є скриншотом.</p>
      </blockquote>
      <h2>Поширені міфи про vibe design</h2>
      <ul>
      <li><strong>«Він замінює дизайнерів».</strong> Ні — він переводить їх до креативної режисури та смаку, де судження важить більше, а не менше.</li>
      <li><strong>«Він робить лише одноразові макети».</strong> Лише якщо інструмент зупиняється на макетах. Агентні інструменти доводять справу до коду.</li>
      <li><strong>«Треба бути технічним фахівцем».</strong> Навпаки — інтерфейсом є сам намір.</li>
      <li><strong>«Це просто генерація зображень за допомогою ШІ».</strong> Vibe design створює структурований, редагований інтерфейс, а не пласку картинку.</li>
      </ul>
      <h2>Як почати займатися vibe design уже сьогодні</h2>
      <ol>
      <li><strong>Оберіть інструмент за принципом «спершу намір», який відвантажує в код</strong>, а не лише макети, щоб ваша робота не заходила в глухий кут.</li>
      <li><strong>Почніть із референсу</strong> — вставте скриншот або URL; скажіть, що зберегти, а що змінити.</li>
      <li><strong>Скеровуйте простими словами</strong> — ітеруйте над щільністю, палітрою, тоном і станами.</li>
      <li><strong>Переходьте до коду рано</strong> — що швидше дизайн стане справжнім кодом, то швидше ви дізнаєтеся, що працює.</li>
      <li><strong>Тримайте все відкритим і своїм</strong> — відкритий код + BYOK уникають вендорлоку, поки категорія стрімко розвивається. (Якщо ви переходите із закритого полотна, ось <a href="/blog/figma-alternative-open-design/">шлях на відкритий код від Figma</a> та <a href="/blog/open-source-alternative-to-claude-design/">від Claude Design</a>.)</li>
      </ol>
      <h2>Підсумок</h2>
      <p>Vibe design — це проєктування за принципом «спершу намір»: ви описуєте, ШІ генерує, ви скеровуєте. Народжений із vibe coding і виведений у мейнстрім завдяки Google Stitch у 2026 році, він стискає відстань між ідеєю та інтерфейсом. Але версія, що має значення, не зупиняється на макеті — <strong>вона агентна й відвантажує в код.</strong> Почніть саме звідси — і vibe design стане справжнім результатом, а не просто гарною картинкою.</p>
      <p><em>Готові спробувати? <a href="/download">Відкрийте застосунок</a> або <a href="/plugins">перегляньте бібліотеку дизайн-систем і навичок</a>.</em></p>
---

Designers, founders, and product engineers keep hearing "vibe design" in 2026 — but half the articles are vendor pitches and the other half never say what happens *after* the AI spits out a screen. This guide gives you a clear definition, the lineage, how the workflow runs, and the one gap nobody talks about: shipping.

## What is vibe design?

**Vibe design is an approach to UI and product design where your primary input is intent** — described in natural language, a reference image, or a URL — **and an AI generates the design while you steer by feel** rather than by hand.

Instead of placing components, nudging spacing, and hunting through color pickers, you describe the *vibe*: the tone, the layout direction, the feeling. You act less like a craftsperson and more like a creative director reviewing and redirecting. Three things define it:

- **Intent in** — a prompt, a screenshot, a reference site, or a rough sketch.
- **Generation out** — the AI returns real UI, not a blank canvas.
- **Steering** — you critique and redirect in natural language until it's right.

## Vibe design vs vibe coding

The term descends directly from [**vibe coding**](https://en.wikipedia.org/wiki/Vibe_coding), coined by Andrej Karpathy in 2025: don't hand-write code — describe what you want and let AI implement it. **Vibe design applies that same "intent-first" philosophy to the visual layer.**

| | Vibe coding | Vibe design |
| --- | --- | --- |
| **Input** | Intent (what it should do) | Intent (how it should look & feel) |
| **Output** | Working code | Working interface |
| **You steer by** | Behavior & logic | Tone, layout, taste |
| **Popularized by** | Karpathy, 2025 | Google Stitch, early 2026 |

They're two ends of the same shift, and in 2026 they're converging: the most useful agents design *and* build. Google pushed "vibe design" mainstream with its [**Stitch**](https://stitch.withgoogle.com/) launch in early 2026, giving the category a name and a wave of search demand.

<figure>
  <img src="/blog/vibe-design-stitch.webp" alt="Editorial illustration: a prompt producing a single static UI screen" />
  <figcaption>Google Stitch took "vibe design" mainstream — but stops at a generated screen.</figcaption>
</figure>

## How vibe design actually works

A typical loop runs in four moves:

1. **Describe the vibe** — "a calm, trustworthy fintech dashboard, lots of whitespace, one accent color."
2. **Generate** — the AI returns a real screen (or several variants).
3. **Steer** — "make it denser," "warmer palette," "add an empty state."
4. **Iterate** until it matches the intent.

The payoff is speed and access: one or two people directing an AI can produce dozens of polished concepts a week, and non-designers can reach a credible interface without learning a heavy tool.

In an [agent-native workspace](/blog/why-we-built-open-design-as-a-skill-layer/) like Open Design, this loop lives in one surface — you describe the vibe to the same agent that can later write the code, so steering the design and building the product aren't two disconnected tools. *(Disclosure: we build Open Design.)*

<figure>
  <img src="/blog/vibe-design-od-loop.webp" alt="Editorial illustration of the describe, generate, and steer loop in Open Design" />
  <figcaption>The intent → generate → steer loop, in Open Design.</figcaption>
</figure>

## The gap nobody talks about: from mockup to shipped

Here's where most "vibe design" tools quietly stop — at a **static mockup**. You get a beautiful screen, then you're back to hand-translating it into code, and the design never updates again.

Real vibe design shouldn't end at a picture. The harder, more valuable version is **agentic vibe design**: an agent that generates the design, **critiques and evolves it, and ships it to production code** — keeping design and code in sync as you steer.

| Stage | Most tools today | Agentic vibe design |
| --- | --- | --- |
| Generate UI | ✅ | ✅ |
| Self-critique & iterate | ❌ one static screen | ✅ agent revises |
| Ship to real code | ❌ hand-translate later | ✅ exports working code |
| Keep design ↔ code in sync | ❌ | ✅ |
| Open-source / BYOK | mostly closed | ✅ |

This is the lane [Open Design](/blog/why-we-built-open-design-as-a-skill-layer/) works in — the open-source, agent-native design workspace. You describe the vibe, an agent designs the UI, evolves it, and [ships it to real code](/blog/31-skills-72-systems-how-the-library-works/); it's [BYOK](/blog/byok-design-workflow-claude-codex-qwen/) and works alongside the coding agent you already use (Claude Code, Cursor, and others) instead of locking you into a closed canvas — so the walkthrough below shows the workflow, not just claims it.

<figure>
  <img src="/blog/vibe-design-od-ship.webp" alt="Editorial illustration of a design shipping to production code in Open Design" />
  <figcaption>Agentic vibe design ends in shippable code, not a screenshot.</figcaption>
</figure>

> A concrete loop we run constantly: prompt a dashboard → get a working layout → "tighten the spacing and add dark mode" → the agent revises *design and code together* → export production HTML. The artifact is shippable, not a screenshot.

## Common myths about vibe design

- **"It replaces designers."** No — it shifts them to creative direction and taste, where judgment matters more, not less.
- **"It only makes throwaway mockups."** Only if the tool stops at mockups. Agentic tools take it to code.
- **"You need to be technical."** The opposite — intent is the interface.
- **"It's just AI image generation."** Vibe design produces structured, editable UI, not a flat picture.

## How to start vibe designing today

1. **Pick an intent-first tool that ships to code**, not just mockups, so your work doesn't dead-end.
2. **Start from a reference** — paste a screenshot or URL; say what to keep and change.
3. **Steer in plain language** — iterate on density, palette, tone, and states.
4. **Push to code early** — the sooner the design is real code, the sooner you learn what works.
5. **Keep it open and yours** — open-source + BYOK avoids lock-in as the category moves fast. (If you're coming from a closed canvas, here's [the open-source path away from Figma](/blog/figma-alternative-open-design/) and [from Claude Design](/blog/open-source-alternative-to-claude-design/).)

## The takeaway

Vibe design is intent-first design: you describe, AI generates, you steer. Born from vibe coding and pushed mainstream by Google Stitch in 2026, it collapses the distance between idea and interface. But the version that matters doesn't stop at a mockup — **it's agentic, and it ships to code.** Start there and vibe design becomes real output, not just a nice picture.

*Ready to try it? [Open the app](/download) or [browse the design systems and skills library](/plugins).*
