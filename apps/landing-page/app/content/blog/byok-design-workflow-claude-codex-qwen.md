---
title: "BYOK design workflow: run Claude, Codex, or Qwen on your own key"
date: 2026-05-13
category: "Guides"
readingTime: 8
summary: "Most AI design tools quietly add a margin to every token you spend. Open Design takes the opposite stance — bring your own model key, pay the provider directly, and keep full control of where inference runs. Here's how the BYOK layer actually works."
i18n:
  zh:
    title: "BYOK 设计工作流：用你自己的密钥运行 Claude、Codex 或 Qwen"
    summary: "大多数 AI 设计工具都会在你花掉的每一个 token 上悄悄加一道差价。Open Design 的立场恰恰相反——自带模型密钥，直接向服务商付费，并完全掌控推理在哪里运行。下面讲讲 BYOK 这一层到底是怎么工作的。"
    bodyHtml: |
      <p>如果你在 2026 年用过托管式 AI 设计产品，多半已经注意到账单在悄悄往上走。一层订阅费，叠加按席位的收费，再叠加一道没人公开的推理加价。这笔账故意算不清楚。</p>
      <p>Open Design 不运行推理。我们在 token 上没有差价。整个工作流都是围绕 <strong>自带密钥（BYOK）</strong> 构建的——你把 daemon 指向任意一个兼容 OpenAI 的端点，粘贴你自己的 API 密钥，就完成了。</p>
      <p>这篇文章会解释我们为什么做出这个选择、它在底层是怎么工作的，以及它在日常工作流中究竟改变了什么。如果你想了解背后更宏观的理念论证，<a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a> 是配套的姊妹篇——这一篇则是上手实操版。</p>
      <h2>这里说的「BYOK」到底是什么意思</h2>
      <p>在 AI 工具领域，「BYOK」其实有两种定义，它们并不是一回事：</p>
      <ul>
      <li><strong>表面 BYOK</strong>——工具允许你粘贴一个密钥，但推理仍然经过它们的服务器，会记录你的 prompt，还可能施加速率限制。</li>
      <li><strong>真正的 BYOK</strong>——工具直接从你的机器（或你的基础设施）调用模型服务商。你的 prompt 从不接触厂商的服务器。厂商不抽取任何差价。</li>
      </ul>
      <p>Open Design 属于第二种。daemon 用你的密钥、从你的机器，向你配置的任意端点发起 HTTP 调用。我们不做代理。我们不记录。我们看不到你的 prompt。</p>
      <h3>这个调用实际去了哪里</h3>
      <p>当 daemon 拿到一个任务时，它会组装 prompt——把该任务相关的 <code>SKILL.md</code> 和 <code>DESIGN.md</code> 文件拉进来——然后向你设置的 base URL 发起一次 HTTP 请求。响应流式回到你的机器，agent 把产物写到磁盘，整个循环就这样。这条链路里没有 Open Design 的服务器。发现你 skill 的那个 daemon，也同时掌管着这次网络调用，所以「它在哪里运行？」是一个设置项，而不是一场销售对话。</p>
      <h2>兼容 OpenAI 的适配器</h2>
      <p>2026 年大多数 AI 推理端点都讲 OpenAI Chat Completions API。我们把它当作最大公约数的协议。如果你的服务商讲这套（几乎所有服务商都讲），那它默认就被支持——不需要插件，也不用等待针对单个服务商的集成。</p>
      <h3>你可以把它指向哪些服务商</h3>













































      <table><thead><tr><th>服务商</th><th>典型 base URL 形态</th><th>适合用于</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>、<code>gpt-5.x</code>，最强的通用环节</td></tr><tr><td>Anthropic</td><td>OpenAI 兼容垫片，或专用的 Claude 适配器</td><td>偏审美的精修、长篇 brief</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>高性价比的长上下文起稿</td></tr><tr><td>Groq</td><td>服务商 base URL</td><td>低延迟的草稿迭代循环</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>任意前沿模型，一套计费关系</td></tr><tr><td>自托管 vLLM / TGI / Ollama</td><td>你自己的主机，例如 <code>http://localhost:11434/v1</code></td><td>完全本地、涉客户机密的工作</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>服务商 base URL</td><td>带 OAI 兼容端点的区域性模型</td></tr></tbody></table>
      <p>这份清单不是硬编码的白名单——它只是大家通常会用到的那些。任何能回应 Chat Completions 形态的端点都能用。</p>
      <h3>两个字段，然后重启</h3>
      <p>配置就是两个字段：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>把它们放进 <code>.env.local</code>，重启 daemon，你就切到了另一个模型。为某个敏感项目切换到本地的 Ollama 机器，也是同样的两行：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>没有需要更新的模型注册表，没有需要重新关联的账户，没有迁移。密钥和端点就是全部的操作面。</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="一把密钥接到一排三个可互换的模型引擎上，中间那个被绿色框选中，背景是近白色的编辑风底纹">
        <figcaption>一把密钥，任意模型——适配器让 Claude、Codex 和 Qwen 在同一套工作流背后可以互换。</figcaption>
      </figure>
      <h2>这对设计工作为什么重要</h2>
      <p>设计工作流有一种特定的成本结构，而托管推理产品恰恰应付不来：</p>
      <ol>
      <li><strong>迭代才是工作的基本单位。</strong>一次真正的设计环节意味着 30–50 个 prompt 循环，而不是三个。托管套餐在 50 次循环这道坎上会硬性限流。</li>
      <li><strong>长上下文是常态。</strong>一份严肃的 brief 涉及品牌文档、过往作品、系统规范和参考图像。这种上下文会远远撑爆托管 UI 里的 token 预算。</li>
      <li><strong>选模型应当是随手的。</strong>有些环节想要又快又便宜的模型。有些想要当下最强的。有些想要为敏感内容上一个本地模型。托管产品替你选好了一个。</li>
      </ol>
      <p>BYOK 把这三点全解决了。你按 token 付费，你来选模型，你不会被限流。</p>
      <h3>迭代不再被定量配给</h3>
      <p>这一点会悄无声息地改变你的工作方式。当每多一次循环都要从套餐里被计量扣除时，你会开始自我审查——你拿了第三稿，因为第四稿感觉太贵。在 BYOK 上，多跑一个环节的边际成本只是模型服务商那边的几美分，于是这个决定重新回到了「为了作品」而不是「为了表盘读数」。第三稿通常正是设计变好的地方；一个对迭代征税的工具，恰恰是在对那一步关键步骤征税。</p>
      <h2>那成本呢？</h2>
      <p>一个常见的担忧：「如果我直接付费，难道不会更贵吗？」</p>
      <p>实际上，不会。下面是我们内部使用中一个典型的设计工作日：</p>









































      <table><thead><tr><th>任务</th><th>Token</th><th>服务商</th><th>成本</th></tr></thead><tbody><tr><td>Brief 录入（3 份文档）</td><td>30K 输入</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>初稿环节</td><td>80K 输入 + 20K 输出</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 个迭代循环</td><td>250K 输入 + 80K 输出</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>最终精修</td><td>50K 输入 + 30K 输出</td><td>Claude Opus（一个环节）</td><td>$1.35</td></tr><tr><td><strong>当日合计</strong></td><td></td><td></td><td><strong>约 $3.93</strong></td></tr></tbody></table>
      <p>这一天产出了一套 deck、两个落地页变体，外加一次品牌探索。托管方案的等价物——假设是月费 $30 的「creator」套餐加超量费——同样的工作大约要 $50，给你更少的迭代次数，还把你锁死在一个模型上。</p>
      <p>如果你想更省，把 Claude Sonnet 换成 DeepSeek V3.2，这一天的花费就降到 $1 以下。重点不在于哪个模型才对——而在于价格/质量这个旋钮握在你自己手里，而不是被烤进某个订阅档位里。</p>
      <h2>隐私与合规</h2>
      <p>BYOK 之所以重要还有第二个原因：<strong>prompt 里包含着你客户的品牌。</strong></p>
      <p>托管推理意味着把品牌文档、尚未公布的产品名、内部定价、未发布的创意，统统经由第三方的服务器来回传输。大多数公司对此都有自己的看法。有些公司对此甚至有合同约束。</p>
      <p>有了 BYOK，prompt 的往返就只发生在你的笔记本和你早已审查过（或自托管）的模型服务商之间。Open Design 不在这条链路里。我们没有可被传唤的日志，没有可被泄露的攻击面，没有需要解释的审计缺口。</p>
      <h3>「无日志」在实践中给你买来了什么</h3>
      <p>对于代理机构的工作、受监管的行业，或者任何未发布的内容来说，这是唯一站得住脚的立场。如果一次安全审查问「我们的品牌资产去了哪里？」，答案是「去了我们合同里的那家模型服务商，别无他处」——而不是「去了一个我们无法掌控的厂商仪表盘」。自托管一个 Ollama 或 vLLM 端点会把它收得更紧：字节根本不会离开你的网络。这正是 <a href="/blog/byok-reality-check-5-things-that-break/">BYOK 现实检验</a> 中探讨的同一组权衡，那篇文章很坦诚地讲了哪些地方仍有毛刺——本地模型和前沿模型在审美上并不可互换，而 prompt 注入这块攻击面要由你自己来扛。</p>
      <h2>如何在项目进行中切换服务商</h2>
      <p>BYOK 一个被低估的好处，是在项目过程中做服务商套利：</p>
      <ul>
      <li><strong>起稿</strong>——在提问环节和首轮迭代上用便宜的模型（DeepSeek V3.2、Qwen 3）</li>
      <li><strong>精修</strong>——在审美起决定作用的中段环节切到 Claude Sonnet 或 GPT-5</li>
      <li><strong>敏感内容</strong>——为涉客户机密的 prompt 换上一个本地 Ollama 模型</li>
      <li><strong>最终精修</strong>——在当下最强的模型上烧掉一个环节（Opus、GPT-5 Pro）</li>
      </ul>
      <p>在 Open Design 里，切换就是在 <code>.env.local</code> 里改两行。没有迁移，没有重新上手，没有套餐升级。</p>
      <h3>针对一份 brief 的一条实操路由</h3>
      <p>具体来说，一份单页落地页 brief 可能这样跑：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>同样的 skill、同样落在磁盘上的设计系统、同样的产物——只有工作流背后的引擎换了。因为 skill 和 system 不过是文件（<code>SKILL.md</code> 和 <code>DESIGN.md</code>），你的整套配置没有任何一部分被绑死在某个特定模型上。这才是「拥有工作流」的真正含义：工具让到一边，而模型只是一个你随 brief 需要而更改的参数。</p>
      <h2>动手试试</h2>
      <p>克隆这个仓库，在 <code>.env.local</code> 里设好 <code>OPENAI_BASE_URL</code> 和 <code>OPENAI_API_KEY</code>，运行 <code>pnpm tools-dev</code>。daemon 会使用你把它指向的任意端点、你付费的任意模型、按你想要的任意节奏运行。</p>
      <p>这就是 BYOK 故事的全部。没有特别的档位，没有升级流程，没有跟我们之间的计费关系。你付费给模型服务商，你保管你的密钥，你保管你的 prompt。我们提供这一层。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a>——选择交付一个薄薄的层、而非一款托管应用，背后的赌注</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK 现实检验：会出问题的 5 件事</a>——自带密钥诚实的权衡取舍与毛刺所在</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 个 skill、72 个 system：Open Design 库是怎么运作的</a>——无论你跑哪个模型都保持不变的那些 <code>SKILL.md</code> / <code>DESIGN.md</code> 文件</li>
      </ul>
  zh-tw:
    title: "BYOK 設計工作流程：用你自己的金鑰跑 Claude、Codex 或 Qwen"
    summary: "大多數 AI 設計工具都會在你花掉的每個 token 上悄悄加一層利潤。Open Design 採取相反的立場——自備你自己的模型金鑰，直接向供應商付費，並完全掌控推論在哪裡執行。以下說明 BYOK 這一層實際上是怎麼運作的。"
    bodyHtml: |
      <p>如果你在 2026 年用過代管式 AI 設計產品，你大概已經注意到帳單一直往上爬。訂閱費疊在按席位收費之上，再疊上一層誰都不公開的推論加價。這套數學是故意算得不透明的。</p>
      <p>Open Design 不跑推論。我們不在 token 上抽利潤。整個工作流程都圍繞著<strong>自備金鑰（BYOK）</strong>打造——你把 daemon 指向任何 OpenAI 相容的端點，貼上你自己的 API 金鑰，就完成了。</p>
      <p>這篇文章說明我們為什麼做出這個選擇、它在底層如何運作，以及它在你的日常工作流程中到底改變了什麼。如果你想了解背後更大的理念論述，<a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>是它的姊妹篇——這一篇則是實作版。</p>
      <h2>這裡的「BYOK」到底是什麼意思</h2>
      <p>在 AI 工具圈裡，BYOK 有兩種定義在流傳，而它們並不是同一回事：</p>
      <ul>
      <li><strong>表面 BYOK</strong>——工具讓你貼上金鑰，但推論仍然透過它們的伺服器路由、記錄你的提示，還可能套用速率限制。</li>
      <li><strong>真正的 BYOK</strong>——工具直接從你的機器（或你的基礎設施）呼叫模型供應商。你的提示永遠不會碰到廠商的伺服器。廠商不抽任何利潤。</li>
      </ul>
      <p>Open Design 屬於第二種。daemon 用你的金鑰、從你的機器，對你設定的任何端點發出 HTTP 呼叫。我們不做代理。我們不做記錄。我們看不到你的提示。</p>
      <h3>呼叫實際上送到哪裡</h3>
      <p>當 daemon 接下一項工作時，它會組出提示——拉進該任務相關的 <code>SKILL.md</code> 和 <code>DESIGN.md</code> 檔案——然後對你設定的 base URL 發出單一一個 HTTP 請求。回應串流回你的機器，agent 把產物寫到磁碟，這就是整個迴圈。這條路徑上沒有任何 Open Design 伺服器。同一個發現你技能的 daemon 也掌管著這個網路呼叫，這正是為什麼「這會跑在哪裡？」是一個設定項，而不是一場銷售對話。</p>
      <h2>OpenAI 相容轉接器</h2>
      <p>到了 2026 年，大多數 AI 推論端點都講 OpenAI Chat Completions API。我們把它當作最低共同標準的協定。如果你的供應商會講它（而幾乎所有供應商都會），那你預設就被支援了——不需要外掛、不需要等待逐家供應商的整合。</p>
      <h3>你可以把它指向的供應商</h3>













































      <table><thead><tr><th>供應商</th><th>典型 base URL 形式</th><th>適合用於</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>、<code>gpt-5.x</code>，最強的通用處理</td></tr><tr><td>Anthropic</td><td>OpenAI 相容墊片，或專用的 Claude 轉接器</td><td>重品味的精修、長篇簡報</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>成本效益高的長上下文草稿</td></tr><tr><td>Groq</td><td>供應商 base URL</td><td>低延遲的草稿循環</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>任何前沿模型，單一一個帳務關係</td></tr><tr><td>自架 vLLM / TGI / Ollama</td><td>你自己的主機，例如 <code>http://localhost:11434/v1</code></td><td>完全在地、客戶機密的工作</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>供應商 base URL</td><td>具備 OAI 相容端點的區域性模型</td></tr></tbody></table>
      <p>這份清單不是一份寫死的允許名單——它只是大家常落腳的地方。任何能回應 Chat Completions 形式的端點都行。</p>
      <h3>兩個欄位，然後重啟</h3>
      <p>設定就是兩個欄位：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>把它們放進 <code>.env.local</code>，重啟 daemon，你就換到另一個模型了。為某個敏感專案切換到本機的 Ollama 機器，也是同樣這兩行：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>沒有模型登錄要更新、沒有帳號要重新連結、沒有遷移。金鑰和端點就是全部的操作面。</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="一把金鑰接到一排三個可互換的模型引擎，中間那個被一個綠色框選中，襯在近白色的編輯風底色上">
        <figcaption>一把金鑰，任何模型——轉接器讓 Claude、Codex 和 Qwen 在同一套工作流程後面可以互換。</figcaption>
      </figure>
      <h2>這對設計工作為什麼重要</h2>
      <p>設計工作流程有一種特定的成本形態，而代管式推論產品很不擅長應付：</p>
      <ol>
      <li><strong>迭代才是工作的單位。</strong>一輪真正的設計過程意味著 30–50 個提示循環，而不是三個。代管方案在 50 循環那一關會狠狠地限速。</li>
      <li><strong>長上下文是常態。</strong>一份認真的簡報會牽涉到品牌文件、過往作品、系統規格和參考圖像。那樣的上下文會遠遠衝破代管 UI 裡的 token 預算。</li>
      <li><strong>模型選擇應該是隨機應變的。</strong>有些處理想要一個快又便宜的模型。有些想要當下最強的。有些則想要一個本機模型來處理敏感內容。代管產品替你選定了一個。</li>
      </ol>
      <p>BYOK 把這三點都解決了。你按 token 付費、你選模型、你不會被限速。</p>
      <h3>迭代不再被配給</h3>
      <p>這一點會悄悄改變你工作的方式。當每一個額外循環都要對著方案計量時，你會開始自我審查——你接受了第三版，因為第四版感覺很貴。在 BYOK 上，多跑一輪的邊際成本是在模型供應商那邊幾分錢，所以這個決定又回到了關乎作品本身，而不是關乎計量表。第三版通常正是設計變好的地方；一個對迭代課稅的工具，就是在對最關鍵的那一步課稅。</p>
      <h2>那成本呢？</h2>
      <p>一個常見的擔憂：「如果我直接付費，難道不會更貴嗎？」</p>
      <p>實務上，不會。以下是我們內部使用中，典型一天的設計工作：</p>









































      <table><thead><tr><th>任務</th><th>Token</th><th>供應商</th><th>成本</th></tr></thead><tbody><tr><td>簡報吸收（3 份文件）</td><td>30K 輸入</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>初稿處理</td><td>80K 輸入 + 20K 輸出</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 個迭代循環</td><td>250K 輸入 + 80K 輸出</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>最終打磨</td><td>50K 輸入 + 30K 輸出</td><td>Claude Opus（一輪）</td><td>$1.35</td></tr><tr><td><strong>當日總計</strong></td><td></td><td></td><td><strong>約 $3.93</strong></td></tr></tbody></table>
      <p>這是一份簡報、兩個落地頁變體，外加一次品牌探索。代管版的等價工作——假設是一個有超量收費的每月 $30「creator」方案——做同樣的工作大約要花 $50、給你更少的迭代次數，還把你綁死在一個模型上。</p>
      <p>如果你想更省，把 Claude Sonnet 換成 DeepSeek V3.2，這一天的成本就會降到 $1 以下。重點不在於某一個模型才對——而在於價格／品質的旋鈕握在你手裡，而不是被烤進某個訂閱層級裡。</p>
      <h2>隱私與合規</h2>
      <p>BYOK 之所以重要還有第二個原因：<strong>提示裡含有你客戶的品牌。</strong></p>
      <p>代管式推論意味著把品牌文件、尚未公布的產品名稱、內部定價，以及上市前的創意，路由穿過第三方的伺服器。大多數公司對這件事都有意見。有些公司則對此立有合約。</p>
      <p>有了 BYOK，提示的來回往返只發生在你的筆電和你已經審核過（或自架）的模型供應商之間。Open Design 不在這個迴圈裡。我們沒有日誌可被傳喚、沒有可外洩的入侵面、沒有需要解釋的稽核缺口。</p>
      <h3>「無日誌」實務上替你換來什麼</h3>
      <p>對於代理商工作、受監管產業，或任何上市前的事物，這是唯一站得住腳的立場。如果一場安全審查問「我們的品牌資產去了哪裡？」，答案是「去到我們合約裡的模型供應商，別處都不去」——而不是「去到一個我們無法掌控的廠商儀表板」。自架一個 Ollama 或 vLLM 端點會把它收得更緊：那些位元組根本不會離開你的網路。這正是<a href="/blog/byok-reality-check-5-things-that-break/">那篇 BYOK 現實檢驗</a>所探討的同一種取捨，它誠實地談了還有哪些粗糙的邊角——本機模型和前沿模型在品味上並不能互換，而且提示注入的防護面是你自己要扛的。</p>
      <h2>如何在專案進行中切換供應商</h2>
      <p>BYOK 一個被低估的好處，是在一個專案進行中做供應商套利：</p>
      <ul>
      <li><strong>草稿</strong>——在問題表單和第一輪迭代上用一個便宜的模型（DeepSeek V3.2、Qwen 3）</li>
      <li><strong>精修</strong>——在品味攸關的中段處理上，切換到 Claude Sonnet 或 GPT-5</li>
      <li><strong>敏感內容</strong>——對客戶機密的提示，換成一個本機 Ollama 模型</li>
      <li><strong>最終打磨</strong>——在當下最強的模型（Opus、GPT-5 Pro）上燒掉一輪</li>
      </ul>
      <p>在 Open Design 裡，切換就是編輯 <code>.env.local</code> 裡的兩行。沒有遷移、沒有重新上手、沒有方案升級。</p>
      <h3>一份簡報的一套實際路由</h3>
      <p>具體來說，一份單一的落地頁簡報可能會這樣跑：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>一樣的技能、磁碟上一樣的設計系統、一樣的產物——改變的只有工作流程後面的引擎。因為技能和系統都只是檔案（<code>SKILL.md</code> 和 <code>DESIGN.md</code>），你的設定沒有任何一處被綁在某個特定模型上。這就是擁有工作流程真正的意義：工具讓開路，而模型是一個你隨簡報需求而變的參數。</p>
      <h2>試試看</h2>
      <p>複製 repo，在 <code>.env.local</code> 裡設定 <code>OPENAI_BASE_URL</code> 和 <code>OPENAI_API_KEY</code>，執行 <code>pnpm tools-dev</code>。daemon 會用你指向的任何端點、你付費的任何模型，按你想要的任何節奏運作。</p>
      <p>這就是 BYOK 的全部故事。沒有特殊層級、沒有升級流程、沒有跟我們的帳務關係。你付費給模型供應商，你保有你的金鑰，你保有你的提示。我們提供的是那一層。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>——選擇出貨一層薄層而非一個代管 app 背後的賭注</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK 現實檢驗：會出問題的 5 件事</a>——自備金鑰誠實的取捨與粗糙邊角</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 個系統：Open Design 函式庫如何運作</a>——不管你跑哪個模型都保持不變的 <code>SKILL.md</code> / <code>DESIGN.md</code> 檔案</li>
      </ul>
  ja:
    title: "BYOK デザインワークフロー：自分のキーで Claude、Codex、Qwen を動かす"
    summary: "ほとんどの AI デザインツールは、消費するトークンごとにこっそりマージンを上乗せしています。Open Design はその逆の立場を取ります。自分のモデルキーを持ち込み、プロバイダーに直接支払い、推論がどこで動くかを完全にコントロールできるのです。BYOK レイヤーが実際にどう機能するのかを解説します。"
    bodyHtml: |
      <p>2026 年にホスト型の AI デザイン製品を使ったことがあるなら、請求額がじわじわ増えていることに気づいているはずです。シート単位の課金の上にサブスクリプションが乗り、さらにその上に誰も公表していない推論マークアップが重なる。この計算は意図的に不透明になっています。</p>
      <p>Open Design は推論を実行しません。トークンにマージンを乗せることもありません。ワークフロー全体が <strong>bring-your-own-key（BYOK）</strong> を中心に構築されています。daemon を任意の OpenAI 互換エンドポイントに向け、自分の API キーを貼り付ければ、それで完了です。</p>
      <p>この記事では、なぜその選択をしたのか、内部でどう動くのか、そして日々のワークフローで実際に何が変わるのかを説明します。その背景にあるより大きな哲学的な議論を知りたい方には、<a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a>が対になる記事です。こちらは実践編になります。</p>
      <h2>ここでの「BYOK」が本当に意味するもの</h2>
      <p>AI ツールの分野には BYOK の定義が 2 つ出回っており、両者は同じものではありません。</p>
      <ul>
      <li><strong>表面的な BYOK</strong> — キーを貼り付けさせてはくれるが、依然として推論は自社サーバー経由でルーティングされ、プロンプトはログに記録され、レート制限がかかる場合もある。</li>
      <li><strong>本物の BYOK</strong> — ツールがあなたのマシン（またはあなたのインフラ）からモデルプロバイダーを直接呼び出す。プロンプトがベンダーのサーバーに触れることはない。ベンダーはマージンを取らない。</li>
      </ul>
      <p>Open Design は後者です。daemon は、あなたが設定したエンドポイントに対して、あなたのキーで、あなたのマシンから HTTP 呼び出しを行います。プロキシしません。ログを取りません。あなたのプロンプトを見ません。</p>
      <h3>呼び出しが実際に向かう先</h3>
      <p>daemon がジョブを拾うと、プロンプトを構成します。タスクに関連する <code>SKILL.md</code> と <code>DESIGN.md</code> ファイルを取り込み、あなたが設定したベース URL に対して 1 回の HTTP リクエストを行います。レスポンスはあなたのマシンにストリーミングで返り、エージェントが成果物をディスクに書き込む。これがループの全体です。経路の中に Open Design のサーバーは存在しません。スキルを発見するのと同じ daemon がネットワーク呼び出しも担うため、「これはどこで動くのか？」は設定項目であって、営業との会話にはならないのです。</p>
      <h2>OpenAI 互換アダプター</h2>
      <p>2026 年のほとんどの AI 推論エンドポイントは OpenAI Chat Completions API を話します。私たちはこれを最小公倍数的なプロトコルとして使っています。あなたのプロバイダーがこれを話すなら（そしてほぼすべてが話します）、デフォルトでサポートされます。プラグインもなく、プロバイダーごとの統合を待つ必要もありません。</p>
      <h3>向けられるプロバイダー</h3>




      <table><thead><tr><th>プロバイダー</th><th>典型的なベース URL の形</th><th>得意なこと</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>、<code>gpt-5.x</code>、最も強力な汎用パス</td></tr><tr><td>Anthropic</td><td>OpenAI 互換シム、または専用の Claude アダプター</td><td>センスが重要な仕上げ、長文ブリーフ</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>コスト効率の高い長コンテキストのドラフト作成</td></tr><tr><td>Groq</td><td>プロバイダーのベース URL</td><td>低レイテンシのドラフトサイクル</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>あらゆるフロンティアモデルを 1 つの請求関係で</td></tr><tr><td>セルフホスト型 vLLM / TGI / Ollama</td><td>自前のホスト、例：<code>http://localhost:11434/v1</code></td><td>完全ローカル、クライアント機密の作業</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>プロバイダーのベース URL</td><td>OAI 互換エンドポイントを持つ地域モデル</td></tr></tbody></table>
      <p>このリストはハードコードされた許可リストではなく、人々がよく行き着く先にすぎません。Chat Completions の形に応答するものなら何でも動きます。</p>
      <h3>2 つのフィールド、そして再起動</h3>
      <p>設定は 2 つのフィールドです。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>これらを <code>.env.local</code> に入れ、daemon を再起動すれば、別のモデルに切り替わります。機密性の高いプロジェクトのためにローカルの Ollama マシンへ切り替えるのも、同じ 2 行です。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>更新すべきモデルレジストリも、再リンクするアカウントも、マイグレーションもありません。キーとエンドポイントが接点のすべてです。</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="1 本のキーが、入れ替え可能な 3 つのモデルエンジンの列に配線され、真ん中のものが緑のフレームで選択されている、ほぼ白の編集的な地の上で">
        <figcaption>1 つのキーで、あらゆるモデルを — アダプターが Claude、Codex、Qwen を同じワークフローの背後で入れ替え可能にします。</figcaption>
      </figure>
      <h2>これがデザイン作業にとってなぜ重要なのか</h2>
      <p>デザインワークフローには、ホスト型推論製品が苦手とする特有のコスト構造があります。</p>
      <ol>
      <li><strong>反復こそが作業の単位である。</strong>本物のデザインパスは 3 回ではなく 30〜50 回のプロンプトサイクルを意味します。ホスト型プランは 50 サイクルあたりで激しくスロットルをかけてきます。</li>
      <li><strong>長コンテキストが当たり前。</strong>真剣なブリーフにはブランド文書、過去の作業、システム仕様、参照画像が関わります。そのコンテキストはホスト型 UI のトークン予算を軽々と超えていきます。</li>
      <li><strong>モデルの選択はその場で行えるべき。</strong>速くて安いモデルを使いたいパスもあれば、利用可能な最強のものを使いたいパスもある。機密コンテンツにはローカルモデルを使いたいパスもある。ホスト型製品はそれをあなたの代わりに 1 つに決めてしまいます。</li>
      </ol>
      <p>BYOK はこの 3 つすべてを解決します。トークン単位で支払い、モデルを選び、スロットルされません。</p>
      <h3>反復が配給制でなくなる</h3>
      <p>これこそが、働き方を静かに変えるものです。すべての追加サイクルがプランに対して計量されていると、自己検閲が始まります。4 案目が高くつくように感じるから 3 案目で手を打つ、というように。BYOK では、もう 1 パスの限界費用はモデルプロバイダーでの数セントなので、判断が再びメーターではなく作業そのものについてのものに戻ります。デザインが良くなるのはたいてい 3 案目であり、反復に課税するツールは、まさに重要なステップに課税しているのです。</p>
      <h2>コストはどうなのか？</h2>
      <p>よくある懸念：「直接払うなら、かえって高くつくのでは？」</p>
      <p>実際にはそうはなりません。私たちの社内利用における典型的な 1 日のデザイン作業はこうです。</p>


      <table><thead><tr><th>タスク</th><th>トークン</th><th>プロバイダー</th><th>コスト</th></tr></thead><tbody><tr><td>ブリーフの読み込み（3 文書）</td><td>30K 入力</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>初稿パス</td><td>80K 入力 + 20K 出力</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 回の反復サイクル</td><td>250K 入力 + 80K 出力</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>最終仕上げ</td><td>50K 入力 + 30K 出力</td><td>Claude Opus（1 パス）</td><td>$1.35</td></tr><tr><td><strong>1 日の合計</strong></td><td></td><td></td><td><strong>〜$3.93</strong></td></tr></tbody></table>
      <p>これでデッキ 1 つ、ランディングのバリアント 2 つ、ブランド探索 1 つが作れます。ホスト型で同等の作業をすると — 超過課金付きの月額 $30 の「クリエイター」プランを想定して — 同じ作業に約 $50 かかり、反復回数は少なく、1 つのモデルに縛られます。</p>
      <p>もっと安くしたければ、Claude Sonnet を DeepSeek V3.2 に替えると 1 日が $1 を切ります。要点は、どれか 1 つのモデルが正解だということではなく、価格と品質のダイヤルがサブスクリプションの階層に焼き込まれているのではなく、あなたの手の中にあるということです。</p>
      <h2>プライバシーとコンプライアンス</h2>
      <p>BYOK が重要なもう 1 つの理由：<strong>プロンプトにはクライアントのブランドが含まれている。</strong></p>
      <p>ホスト型推論は、ブランド文書、未発表の製品名、社内価格、ローンチ前のクリエイティブを第三者のサーバー経由でルーティングすることを意味します。ほとんどの企業はそれについて意見を持っています。なかには契約上の規定を持つところもあります。</p>
      <p>BYOK では、プロンプトの往復はあなたのノート PC と、すでに精査済み（あるいはセルフホスト）のモデルプロバイダーとの間で行われます。Open Design はその経路にいません。召喚状を出されるログもなく、漏洩する侵害面もなく、説明すべき監査の穴もありません。</p>
      <h3>「ログなし」が実際に何をもたらすか</h3>
      <p>エージェンシーの仕事、規制業界、あるいはローンチ前のあらゆるものにとって、これが唯一耐えうる立場です。セキュリティレビューで「我々のブランドアセットはどこへ行くのか？」と問われたら、答えは「契約しているモデルプロバイダーへ、そしてそれ以外のどこへも行かない」となります。「我々がコントロールできないベンダーのダッシュボードへ」ではありません。Ollama や vLLM のエンドポイントをセルフホストすれば、さらに締まります。バイトがネットワークの外に出ることが一切なくなるのです。これは <a href="/blog/byok-reality-check-5-things-that-break/">BYOK の現実チェック</a>で掘り下げているのと同じトレードオフであり、そこでは粗い部分がまだどこにあるかについて正直に書いています。ローカルモデルとフロンティアモデルはセンスの面で互換ではなく、プロンプトインジェクションの面はあなた自身が負うことになります。</p>
      <h2>プロジェクトの途中でプロバイダーを切り替える方法</h2>
      <p>BYOK の過小評価されている利点の 1 つが、プロジェクト進行中のプロバイダーアービトラージです。</p>
      <ul>
      <li><strong>ドラフト作成</strong> — 質問フォームと最初の反復には安いモデル（DeepSeek V3.2、Qwen 3）を使う</li>
      <li><strong>仕上げ</strong> — センスが重要になる中盤のパスでは Claude Sonnet や GPT-5 に切り替える</li>
      <li><strong>機密コンテンツ</strong> — クライアント機密のプロンプトにはローカルの Ollama モデルに替える</li>
      <li><strong>最終仕上げ</strong> — 利用可能な最強のモデル（Opus、GPT-5 Pro）に 1 パスを投じる</li>
      </ul>
      <p>Open Design では、切り替えは <code>.env.local</code> の 2 行を編集することです。マイグレーションも、再オンボーディングも、プランのアップグレードもありません。</p>
      <h3>1 つのブリーフに対する実際のルーティング例</h3>
      <p>具体的には、1 つのランディングページのブリーフはこんなふうに進められます。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>同じスキル、ディスク上の同じデザインシステム、同じ成果物 — 変わったのはワークフローの背後にあるエンジンだけです。スキルとシステムは単なるファイル（<code>SKILL.md</code> と <code>DESIGN.md</code>）なので、あなたのセットアップは特定のモデルに縛られません。これこそがワークフローを所有するということの本当の意味です。ツールが邪魔をせず退き、モデルはブリーフの求めに応じて変えるパラメータになるのです。</p>
      <h2>試してみる</h2>
      <p>リポジトリをクローンし、<code>.env.local</code> に <code>OPENAI_BASE_URL</code> と <code>OPENAI_API_KEY</code> を設定し、<code>pnpm tools-dev</code> を実行します。daemon は、あなたが向けたエンドポイントを、あなたが支払うモデルで、あなたの望むスケジュールで使います。</p>
      <p>これが BYOK のすべてです。特別な階層も、アップグレードのフローも、私たちとの請求関係もありません。あなたはモデルプロバイダーに支払い、自分のキーを保持し、自分のプロンプトを保持します。私たちはレイヤーを提供するだけです。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a> — ホスト型アプリではなく薄いレイヤーを出すという賭けの裏側</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK の現実チェック：壊れる 5 つのこと</a> — 自分のキーを持ち込むことの正直なトレードオフと粗い部分</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 のスキル、72 のシステム：Open Design ライブラリの仕組み</a> — どのモデルを動かしても変わらない <code>SKILL.md</code> / <code>DESIGN.md</code> ファイル</li>
      </ul>
  ko:
    title: "BYOK 디자인 워크플로: 자신의 키로 Claude, Codex, Qwen 실행하기"
    summary: "대부분의 AI 디자인 도구는 여러분이 쓰는 모든 토큰에 슬그머니 마진을 붙입니다. Open Design은 정반대 입장을 취합니다 — 자신의 모델 키를 가져와 공급자에게 직접 결제하고, 추론이 어디에서 실행되는지에 대한 통제권을 온전히 유지하세요. BYOK 레이어가 실제로 어떻게 작동하는지 살펴봅니다."
    bodyHtml: |
      <p>2026년에 호스팅형 AI 디자인 제품을 써봤다면, 청구서가 슬금슬금 올라가는 것을 아마 눈치챘을 것입니다. 좌석당 요금 위에 구독료가 얹히고, 그 위에 아무도 공개하지 않는 추론 마진이 또 한 겹 쌓입니다. 그 계산은 일부러 불투명하게 만들어진 것입니다.</p>
      <p>Open Design은 추론을 실행하지 않습니다. 우리는 토큰에 마진을 붙이지 않습니다. 전체 워크플로는 <strong>자신의 키 가져오기(BYOK)</strong>를 중심으로 설계되어 있습니다 — daemon을 OpenAI 호환 엔드포인트 어디로든 가리키고, 자신의 API 키를 붙여넣으면 끝입니다.</p>
      <p>이 글에서는 우리가 왜 그런 선택을 했는지, 내부에서 어떻게 작동하는지, 그리고 그것이 일상 워크플로에서 실제로 무엇을 바꾸는지 설명합니다. 그 뒤에 깔린 더 큰 철학적 논의가 궁금하다면, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아닌 스킬 레이어로 만든 이유</a>가 짝이 되는 글입니다 — 이 글은 직접 손으로 해보는 버전입니다.</p>
      <h2>여기서 “BYOK”가 정말로 의미하는 것</h2>
      <p>AI 도구 업계에는 BYOK에 대한 두 가지 정의가 떠돌고 있는데, 둘은 같은 것이 아닙니다:</p>
      <ul>
      <li><strong>표면적 BYOK</strong> — 도구가 키를 붙여넣게 해주지만, 추론은 여전히 자기네 서버를 거쳐 라우팅하고, 여러분의 프롬프트를 로그에 남기며, 속도 제한을 적용할 수 있습니다.</li>
      <li><strong>진짜 BYOK</strong> — 도구가 여러분의 머신(또는 인프라)에서 모델 공급자를 직접 호출합니다. 여러분의 프롬프트는 결코 벤더의 서버에 닿지 않습니다. 벤더는 마진을 가져가지 않습니다.</li>
      </ul>
      <p>Open Design은 두 번째 종류입니다. daemon은 여러분이 구성한 엔드포인트로, 여러분의 키로, 여러분의 머신에서 HTTP 호출을 합니다. 우리는 프록시하지 않습니다. 우리는 로그를 남기지 않습니다. 우리는 여러분의 프롬프트를 보지 않습니다.</p>
      <h3>호출이 실제로 가는 곳</h3>
      <p>daemon이 작업을 집어 들면, 프롬프트를 구성합니다 — 그 작업에 해당하는 <code>SKILL.md</code>와 <code>DESIGN.md</code> 파일을 끌어옵니다 — 그런 다음 여러분이 설정한 base URL로 단 한 번의 HTTP 요청을 보냅니다. 응답은 여러분의 머신으로 스트리밍되어 돌아오고, 에이전트는 산출물을 디스크에 기록합니다. 그것이 루프의 전부입니다. 경로 안에 Open Design 서버는 없습니다. 여러분의 스킬을 발견하는 그 동일한 daemon이 네트워크 호출도 소유합니다. 그렇기 때문에 “이건 어디에서 실행되나요?”가 영업 대화가 아니라 하나의 설정이 됩니다.</p>
      <h2>OpenAI 호환 어댑터</h2>
      <p>2026년 대부분의 AI 추론 엔드포인트는 OpenAI Chat Completions API를 말합니다. 우리는 그것을 최소공통분모 프로토콜로 사용합니다. 여러분의 공급자가 그것을 말한다면(거의 모두가 그렇습니다), 기본으로 지원됩니다 — 플러그인도, 기다려야 할 공급자별 통합도 없습니다.</p>
      <h3>가리킬 수 있는 공급자들</h3>




      <table><thead><tr><th>공급자</th><th>일반적인 base URL 형태</th><th>적합한 용도</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, 가장 강력한 범용 패스</td></tr><tr><td>Anthropic</td><td>OpenAI 호환 shim, 또는 전용 Claude 어댑터</td><td>취향이 중요한 정교화, 긴 브리프</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>비용 효율적인 롱컨텍스트 초안 작성</td></tr><tr><td>Groq</td><td>공급자 base URL</td><td>저지연 초안 사이클</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>모든 프런티어 모델, 하나의 청구 관계</td></tr><tr><td>자체 호스팅 vLLM / TGI / Ollama</td><td>여러분 자신의 호스트, 예: <code>http://localhost:11434/v1</code></td><td>완전 로컬, 고객 기밀 작업</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>공급자 base URL</td><td>OAI 호환 엔드포인트를 갖춘 지역 모델</td></tr></tbody></table>
      <p>이 목록은 하드코딩된 허용 목록이 아닙니다 — 그저 사람들이 흔히 자리 잡는 곳일 뿐입니다. Chat Completions 형태에 응답하는 것이라면 무엇이든 작동합니다.</p>
      <h3>두 개의 필드, 그다음 재시작</h3>
      <p>구성은 두 개의 필드입니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>그것을 <code>.env.local</code>에 넣고, daemon을 재시작하면, 다른 모델로 전환됩니다. 민감한 프로젝트를 위해 로컬 Ollama 박스로 전환하는 것도 똑같은 두 줄입니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>업데이트할 모델 레지스트리도, 다시 연결할 계정도, 마이그레이션도 없습니다. 키와 엔드포인트가 표면의 전부입니다.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="거의 흰색에 가까운 에디토리얼 바탕 위에서, 하나의 키가 교체 가능한 세 개의 모델 엔진 줄에 연결되어 있고, 가운데 것이 녹색 프레임으로 선택되어 있다">
        <figcaption>하나의 키, 어떤 모델이든 — 어댑터는 동일한 워크플로 뒤에서 Claude, Codex, Qwen을 서로 교체 가능하게 만든다.</figcaption>
      </figure>
      <h2>이것이 디자인 작업에 중요한 이유</h2>
      <p>디자인 워크플로에는 호스팅형 추론 제품이 잘 다루지 못하는 특유의 비용 구조가 있습니다:</p>
      <ol>
      <li><strong>반복이 작업의 단위입니다.</strong> 진짜 디자인 패스는 세 번이 아니라 30~50회의 프롬프트 사이클을 의미합니다. 호스팅 플랜은 50사이클 지점에서 강하게 속도를 조입니다.</li>
      <li><strong>롱컨텍스트가 표준입니다.</strong> 진지한 브리프에는 브랜드 문서, 이전 작업물, 시스템 사양, 참고 이미지가 포함됩니다. 그 컨텍스트는 호스팅 UI의 토큰 예산을 훌쩍 넘어섭니다.</li>
      <li><strong>모델 선택은 그때그때 정해질 수 있어야 합니다.</strong> 어떤 패스는 빠르고 저렴한 모델을 원합니다. 어떤 패스는 사용 가능한 가장 강력한 모델을 원합니다. 어떤 패스는 민감한 콘텐츠를 위해 로컬 모델을 원합니다. 호스팅형 제품은 여러분 대신 하나를 골라버립니다.</li>
      </ol>
      <p>BYOK는 이 세 가지를 모두 해결합니다. 여러분은 토큰당 결제하고, 모델을 선택하며, 속도 제한에 걸리지 않습니다.</p>
      <h3>반복이 더 이상 배급되지 않게 됩니다</h3>
      <p>이것이야말로 여러분의 작업 방식을 조용히 바꿔놓는 지점입니다. 추가 사이클 하나하나가 플랜에 대해 계량될 때, 여러분은 스스로를 검열하기 시작합니다 — 네 번째 초안이 비싸게 느껴져서 세 번째 초안을 택하게 됩니다. BYOK에서는 한 번 더 패스를 도는 한계 비용이 모델 공급자에서 몇 센트에 불과하므로, 결정은 다시 계량기가 아니라 작업 자체에 관한 것으로 돌아갑니다. 보통 디자인이 좋아지는 지점은 세 번째 초안입니다. 반복에 세금을 매기는 도구는 정확히 가장 중요한 그 단계에 세금을 매기는 셈입니다.</p>
      <h2>비용은 어떨까요?</h2>
      <p>흔한 걱정: “직접 결제하면 더 비싸지 않을까?”</p>
      <p>실제로는 아닙니다. 우리 내부 사용에서 나온 전형적인 하루치 디자인 작업은 다음과 같습니다:</p>


      <table><thead><tr><th>작업</th><th>토큰</th><th>공급자</th><th>비용</th></tr></thead><tbody><tr><td>브리프 인테이크(문서 3건)</td><td>30K 입력</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>첫 초안 패스</td><td>80K 입력 + 20K 출력</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>반복 사이클 5회</td><td>250K 입력 + 80K 출력</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>최종 마감</td><td>50K 입력 + 30K 출력</td><td>Claude Opus(한 패스)</td><td>$1.35</td></tr><tr><td><strong>하루 합계</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>그것은 덱 하나, 랜딩 변형 두 개, 그리고 브랜드 탐색 하나입니다. 호스팅형으로 동일하게 하면 — 초과 사용 요금이 붙는 월 $30 “크리에이터” 플랜을 가정할 때 — 같은 작업에 약 $50가 들고, 반복은 더 적으며, 하나의 모델에 묶이게 됩니다.</p>
      <p>더 저렴하게 가고 싶다면, Claude Sonnet을 DeepSeek V3.2로 바꾸면 하루치가 $1 아래로 떨어집니다. 핵심은 어느 한 모델이 옳다는 것이 아닙니다 — 가격/품질 다이얼이 구독 등급에 박혀 있는 게 아니라 여러분의 손에 있다는 것입니다.</p>
      <h2>프라이버시와 컴플라이언스</h2>
      <p>BYOK가 중요한 두 번째 이유가 있습니다: <strong>프롬프트에는 여러분 고객의 브랜드가 담겨 있습니다.</strong></p>
      <p>호스팅형 추론은 브랜드 문서, 미발표 제품명, 내부 가격, 출시 전 크리에이티브를 제3자의 서버를 거쳐 라우팅한다는 뜻입니다. 대부분의 회사는 그에 대해 나름의 입장이 있습니다. 일부는 그에 관한 계약을 두고 있습니다.</p>
      <p>BYOK에서는 프롬프트 왕복이 여러분의 노트북과, 여러분이 이미 검증한(혹은 자체 호스팅한) 모델 공급자 사이에서만 일어납니다. Open Design은 그 경로 안에 없습니다. 우리에게는 소환장을 받을 로그도, 유출될 침해 표면도, 해명할 감사 공백도 없습니다.</p>
      <h3>“로그 없음”이 실제로 가져다주는 것</h3>
      <p>에이전시 작업, 규제 산업, 또는 출시 전 모든 것에 있어서 이것은 버텨낼 수 있는 유일한 입장입니다. 보안 검토에서 “우리 브랜드 자산이 어디로 가나요?”라고 물으면, 답은 “우리 계약 안의 모델 공급자로, 그 외 어디로도 가지 않습니다”입니다 — “우리가 통제하지 못하는 벤더 대시보드로”가 아닙니다. Ollama나 vLLM 엔드포인트를 자체 호스팅하면 더욱 조여집니다: 바이트가 여러분의 네트워크를 아예 떠나지 않습니다. 이는 <a href="/blog/byok-reality-check-5-things-that-break/">BYOK 현실 점검</a>에서 탐구한 것과 같은 트레이드오프이며, 그 글은 거친 부분이 여전히 어디에 있는지에 대해 솔직합니다 — 로컬 모델과 프런티어 모델은 취향 면에서 서로 교체 가능하지 않으며, 프롬프트 인젝션 표면은 여러분 스스로 소유하게 됩니다.</p>
      <h2>프로젝트 도중에 공급자를 전환하는 방법</h2>
      <p>BYOK의 과소평가된 이점 중 하나는 프로젝트 진행 중의 공급자 차익 거래입니다:</p>
      <ul>
      <li><strong>초안 작성</strong> — 질문 양식과 첫 반복에는 저렴한 모델(DeepSeek V3.2, Qwen 3)을 사용</li>
      <li><strong>정교화</strong> — 취향이 중요한 중간 패스에는 Claude Sonnet이나 GPT-5로 전환</li>
      <li><strong>민감한 콘텐츠</strong> — 고객 기밀 프롬프트에는 로컬 Ollama 모델로 교체</li>
      <li><strong>최종 마감</strong> — 사용 가능한 가장 강력한 모델(Opus, GPT-5 Pro)에 한 패스를 투입</li>
      </ul>
      <p>Open Design에서 전환은 <code>.env.local</code>의 두 줄을 편집하는 일입니다. 마이그레이션도, 다시 온보딩하는 것도, 플랜 업그레이드도 없습니다.</p>
      <h3>하나의 브리프를 위한 실제 라우팅 예시</h3>
      <p>구체적으로, 하나의 랜딩 페이지 브리프는 이렇게 진행될 수 있습니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>같은 스킬, 디스크에 있는 같은 디자인 시스템, 같은 산출물 — 바뀐 것은 워크플로 뒤의 엔진뿐입니다. 스킬과 시스템은 그저 파일(<code>SKILL.md</code>와 <code>DESIGN.md</code>)이기 때문에, 여러분의 설정 중 어떤 것도 특정 모델에 묶여 있지 않습니다. 이것이 워크플로를 소유한다는 것의 실제 의미입니다: 도구는 길을 비켜주고, 모델은 브리프가 요구하는 대로 바꾸는 하나의 파라미터가 됩니다.</p>
      <h2>직접 해보기</h2>
      <p>리포지토리를 클론하고, <code>.env.local</code>에 <code>OPENAI_BASE_URL</code>과 <code>OPENAI_API_KEY</code>를 설정한 뒤, <code>pnpm tools-dev</code>를 실행하세요. daemon은 여러분이 가리키는 어떤 엔드포인트든, 여러분이 결제하는 어떤 모델이든, 여러분이 원하는 어떤 일정으로든 사용할 것입니다.</p>
      <p>그것이 BYOK 이야기의 전부입니다. 특별한 등급도, 업그레이드 흐름도, 우리와의 청구 관계도 없습니다. 여러분은 모델 공급자에게 결제하고, 키를 직접 보관하며, 프롬프트를 직접 지킵니다. 우리는 레이어를 제공합니다.</p>
      <h2>관련 읽을거리</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아닌 스킬 레이어로 만든 이유</a> — 호스팅형 앱 대신 얇은 레이어를 출시한 데 깔린 베팅</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK 현실 점검: 깨지는 5가지</a> — 자신의 키를 가져올 때의 솔직한 트레이드오프와 거친 부분들</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">스킬 31개, 시스템 72개: Open Design 라이브러리가 작동하는 방식</a> — 어떤 모델을 돌리든 변하지 않는 <code>SKILL.md</code> / <code>DESIGN.md</code> 파일들</li>
      </ul>
  de:
    title: "BYOK-Design-Workflow: Claude, Codex oder Qwen mit deinem eigenen Key betreiben"
    summary: "Die meisten KI-Design-Tools schlagen still und leise eine Marge auf jeden Token auf, den du ausgibst. Open Design vertritt die gegenteilige Haltung — bring deinen eigenen Modell-Key mit, zahle direkt beim Anbieter und behalte die volle Kontrolle darüber, wo die Inferenz läuft. So funktioniert die BYOK-Ebene wirklich."
    bodyHtml: |
      <p>Wenn du 2026 ein gehostetes KI-Design-Produkt genutzt hast, ist dir wahrscheinlich aufgefallen, dass die Rechnung schleichend steigt. Ein Abo obendrauf auf eine Pro-Platz-Gebühr, geschichtet über einen Inferenz-Aufschlag, den niemand veröffentlicht. Die Rechnung ist absichtlich undurchsichtig.</p>
      <p>Open Design führt keine Inferenz aus. Wir haben keine Marge auf Tokens. Der gesamte Workflow ist um <strong>Bring-your-own-Key (BYOK)</strong> herum gebaut — du richtest den daemon auf einen beliebigen OpenAI-kompatiblen Endpunkt, fügst deinen eigenen API-Key ein, und das war's.</p>
      <p>Dieser Beitrag erklärt, warum wir diese Entscheidung getroffen haben, wie sie unter der Haube funktioniert und was sie in deinem Arbeitsalltag tatsächlich verändert. Wenn du das größere philosophische Argument dahinter willst, ist <a href="/blog/why-we-built-open-design-as-a-skill-layer/">warum wir Open Design als Skill-Layer gebaut haben, nicht als Produkt</a> das begleitende Stück — dieses hier ist die praktische Version.</p>
      <h2>Was „BYOK“ hier wirklich bedeutet</h2>
      <p>Im Bereich der KI-Tools kursieren zwei Definitionen von BYOK, und sie sind nicht dasselbe:</p>
      <ul>
      <li><strong>Oberflächliches BYOK</strong> — das Tool lässt dich einen Key einfügen, leitet die Inferenz aber weiterhin über seine eigenen Server, protokolliert deine Prompts und wendet möglicherweise Rate Limits an.</li>
      <li><strong>Echtes BYOK</strong> — das Tool ruft den Modellanbieter direkt von deiner Maschine (oder deiner Infrastruktur) aus auf. Deine Prompts berühren nie die Server des Anbieters. Der Anbieter nimmt keine Marge.</li>
      </ul>
      <p>Open Design ist die zweite Art. Der daemon macht HTTP-Aufrufe an den von dir konfigurierten Endpunkt, mit deinem Key, von deiner Maschine aus. Wir proxyen nicht. Wir protokollieren nicht. Wir sehen deine Prompts nicht.</p>
      <h3>Wohin der Aufruf tatsächlich geht</h3>
      <p>Wenn der daemon einen Job aufnimmt, stellt er den Prompt zusammen — er zieht die für die Aufgabe relevanten <code>SKILL.md</code>- und <code>DESIGN.md</code>-Dateien heran — und macht dann eine einzige HTTP-Anfrage an die von dir gesetzte Basis-URL. Die Antwort streamt zurück zu deiner Maschine, der Agent schreibt das Artefakt auf die Festplatte, und das ist die gesamte Schleife. Es gibt keinen Open-Design-Server im Pfad. Derselbe daemon, der deine Skills entdeckt, ist auch für den Netzwerkaufruf zuständig — deshalb ist „Wo läuft das?“ eine Einstellung und kein Verkaufsgespräch.</p>
      <h2>Der OpenAI-kompatible Adapter</h2>
      <p>Die meisten KI-Inferenz-Endpunkte sprechen 2026 die OpenAI Chat Completions API. Wir nutzen das als kleinsten gemeinsamen Nenner als Protokoll. Wenn dein Anbieter es spricht (und fast alle tun das), wirst du standardmäßig unterstützt — kein Plugin, keine anbieterspezifische Integration, auf die du warten müsstest.</p>
      <h3>Anbieter, auf die du es richten kannst</h3>
      <table><thead><tr><th>Anbieter</th><th>Typische Form der Basis-URL</th><th>Gut für</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, stärkste allgemeine Durchläufe</td></tr><tr><td>Anthropic</td><td>OpenAI-Kompatibilitäts-Shim oder der dedizierte Claude-Adapter</td><td>geschmacksintensive Verfeinerung, lange Briefings</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>kosteneffizientes Long-Context-Drafting</td></tr><tr><td>Groq</td><td>Anbieter-Basis-URL</td><td>Draft-Zyklen mit geringer Latenz</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>jedes Frontier-Modell, eine einzige Abrechnungsbeziehung</td></tr><tr><td>Selbst gehostetes vLLM / TGI / Ollama</td><td>dein eigener Host, z. B. <code>http://localhost:11434/v1</code></td><td>vollständig lokal, mandantenvertrauliche Arbeit</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>Anbieter-Basis-URL</td><td>regionale Modelle mit OAI-kompatiblen Endpunkten</td></tr></tbody></table>
      <p>Die Liste ist keine fest codierte Allowlist — sie zeigt nur, wo die Leute üblicherweise landen. Alles, was die Chat-Completions-Form beantwortet, funktioniert.</p>
      <h3>Zwei Felder, dann neu starten</h3>
      <p>Die Konfiguration besteht aus zwei Feldern:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Trag sie in <code>.env.local</code> ein, starte den daemon neu, und du bist auf einem anderen Modell. Der Wechsel zu einer lokalen Ollama-Box für ein sensibles Projekt sind dieselben zwei Zeilen:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Es gibt keine Modell-Registry zu aktualisieren, kein Konto neu zu verknüpfen, keine Migration. Der Key und der Endpunkt sind die gesamte Oberfläche.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Ein einzelner Key, verdrahtet mit einer Reihe von drei austauschbaren Modell-Engines, die mittlere in einem grünen Rahmen ausgewählt, auf einem fast weißen, editorial wirkenden Untergrund">
        <figcaption>Ein Key, jedes Modell — der Adapter macht Claude, Codex und Qwen hinter demselben Workflow austauschbar.</figcaption>
      </figure>
      <h2>Warum das für Designarbeit zählt</h2>
      <p>Design-Workflows haben eine spezifische Kostenform, mit der gehostete Inferenzprodukte schlecht umgehen:</p>
      <ol>
      <li><strong>Iteration ist die Arbeitseinheit.</strong> Ein echter Design-Durchlauf bedeutet 30–50 Prompt-Zyklen, nicht drei. Gehostete Pläne drosseln hart an der 50-Zyklen-Marke.</li>
      <li><strong>Langer Kontext ist die Norm.</strong> Ein ernsthaftes Briefing umfasst Markendokumente, frühere Arbeiten, Systemspezifikationen und Referenzbilder. Dieser Kontext sprengt die Token-Budgets in gehosteten Oberflächen.</li>
      <li><strong>Die Modellwahl sollte ad hoc sein.</strong> Manche Durchläufe wollen ein schnelles, günstiges Modell. Manche wollen das stärkste verfügbare. Manche wollen ein lokales Modell für sensible Inhalte. Ein gehostetes Produkt wählt eines für dich aus.</li>
      </ol>
      <p>BYOK behebt alle drei. Du zahlst pro Token, du wählst das Modell, du wirst nicht gedrosselt.</p>
      <h3>Iteration wird nicht länger rationiert</h3>
      <p>Das ist der Punkt, der leise verändert, wie du arbeitest. Wenn jeder zusätzliche Zyklus gegen einen Plan abgerechnet wird, fängst du an, dich selbst zu zensieren — du nimmst den dritten Entwurf, weil sich der vierte teuer anfühlt. Bei BYOK sind die Grenzkosten eines weiteren Durchlaufs ein paar Cent beim Modellanbieter, also wird die Entscheidung wieder zu einer Frage der Arbeit, nicht des Zählers. Der dritte Entwurf ist meist der Punkt, an dem das Design gut wird; ein Tool, das Iteration besteuert, besteuert genau den Schritt, der zählt.</p>
      <h2>Und die Kosten?</h2>
      <p>Eine verbreitete Sorge: „Wenn ich direkt zahle, wird es dann nicht teurer?“</p>
      <p>In der Praxis nein. Hier ist ein typischer Tag Designarbeit in unserer internen Nutzung:</p>
      <table><thead><tr><th>Aufgabe</th><th>Tokens</th><th>Anbieter</th><th>Kosten</th></tr></thead><tbody><tr><td>Briefing-Aufnahme (3 Dokumente)</td><td>30K Input</td><td>Claude Sonnet</td><td>$0,09</td></tr><tr><td>Erster Entwurfsdurchlauf</td><td>80K Input + 20K Output</td><td>Claude Sonnet</td><td>$0,54</td></tr><tr><td>5 Iterationszyklen</td><td>250K Input + 80K Output</td><td>Claude Sonnet</td><td>$1,95</td></tr><tr><td>Letzter Feinschliff</td><td>50K Input + 30K Output</td><td>Claude Opus (ein Durchlauf)</td><td>$1,35</td></tr><tr><td><strong>Tagessumme</strong></td><td></td><td></td><td><strong>~$3,93</strong></td></tr></tbody></table>
      <p>Das ist ein Deck, zwei Landing-Page-Varianten und eine Brand-Exploration. Das gehostete Äquivalent — angenommen ein „Creator“-Plan für $30/Monat mit Überziehungsgebühren — würde für dieselbe Arbeit rund $50 kosten, dir weniger Iterationen geben und dich an ein Modell binden.</p>
      <p>Willst du günstiger werden, tausch Claude Sonnet gegen DeepSeek V3.2 und der Tag fällt unter $1. Der Punkt ist nicht, dass ein Modell das richtige ist — es ist, dass der Preis-/Qualitäts-Regler in deinen Händen liegt, statt in einer Abo-Stufe einbetoniert zu sein.</p>
      <h2>Datenschutz und Compliance</h2>
      <p>Es gibt einen zweiten Grund, warum BYOK zählt: <strong>die Prompts enthalten die Marke deines Kunden.</strong></p>
      <p>Gehostete Inferenz bedeutet, Markendokumente, noch nicht angekündigte Produktnamen, interne Preise und Pre-Launch-Kreatives durch die Server eines Dritten zu leiten. Die meisten Unternehmen haben dazu eine Meinung. Manche haben dazu einen Vertrag.</p>
      <p>Mit BYOK findet der Prompt-Round-Trip zwischen deinem Laptop und dem Modellanbieter statt, den du bereits geprüft (oder selbst gehostet) hast. Open Design ist nicht im Loop. Wir haben kein Log, das vorgeladen werden könnte, keine Angriffsfläche, von der etwas durchsickern könnte, keine Audit-Lücke, die wir erklären müssten.</p>
      <h3>Was „kein Log“ in der Praxis bringt</h3>
      <p>Für Agenturarbeit, regulierte Branchen oder alles Pre-Launch ist das die einzige Haltung, die standhält. Wenn ein Security-Review fragt „Wohin gehen unsere Markenassets?“, lautet die Antwort „zum Modellanbieter in unserem Vertrag, und sonst nirgendwohin“ — nicht „in ein Anbieter-Dashboard, das wir nicht kontrollieren“. Das Selbst-Hosten eines Ollama- oder vLLM-Endpunkts zieht es weiter an: Die Bytes verlassen dein Netzwerk überhaupt nicht. Dies ist derselbe Trade-off, der in <a href="/blog/byok-reality-check-5-things-that-break/">dem BYOK-Reality-Check</a> untersucht wird, der ehrlich darüber ist, wo die rauen Kanten noch sind — lokale Modelle und Frontier-Modelle sind im Geschmack nicht austauschbar, und die Prompt-Injection-Fläche gehört dir selbst.</p>
      <h2>Wie man mitten im Projekt den Anbieter wechselt</h2>
      <p>Einer der unterschätzten Vorteile von BYOK ist die Anbieter-Arbitrage während eines Projekts:</p>
      <ul>
      <li><strong>Drafting</strong> — nutze ein günstiges Modell (DeepSeek V3.2, Qwen 3) für das Frageformular und die erste Iteration</li>
      <li><strong>Verfeinerung</strong> — wechsle zu Claude Sonnet oder GPT-5 für die mittleren Durchläufe, bei denen der Geschmack zählt</li>
      <li><strong>Sensible Inhalte</strong> — wechsle zu einem lokalen Ollama-Modell für mandantenvertrauliche Prompts</li>
      <li><strong>Letzter Feinschliff</strong> — verbrenne einen Durchlauf auf dem stärksten verfügbaren Modell (Opus, GPT-5 Pro)</li>
      </ul>
      <p>In Open Design bedeutet ein Wechsel, zwei Zeilen in <code>.env.local</code> zu bearbeiten. Es gibt keine Migration, kein erneutes Onboarding, kein Plan-Upgrade.</p>
      <h3>Ein durchgespieltes Routing für ein Briefing</h3>
      <p>Konkret könnte ein einzelnes Landing-Page-Briefing so ablaufen:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Dieselben Skills, dasselbe Designsystem auf der Festplatte, dieselben Artefakte — nur die Engine hinter dem Workflow hat sich geändert. Weil Skills und Systeme einfach Dateien sind (<code>SKILL.md</code> und <code>DESIGN.md</code>), ist nichts an deinem Setup an ein bestimmtes Modell gebunden. Genau das bedeutet es, den Workflow zu besitzen: Das Tool geht aus dem Weg, und das Modell ist ein Parameter, den du änderst, wie es das Briefing verlangt.</p>
      <h2>Probier es aus</h2>
      <p>Klone das Repo, setze <code>OPENAI_BASE_URL</code> und <code>OPENAI_API_KEY</code> in <code>.env.local</code>, führe <code>pnpm tools-dev</code> aus. Der daemon nutzt den Endpunkt, auf den du ihn richtest, mit dem Modell, für das du zahlst, nach dem Zeitplan, den du willst.</p>
      <p>Das ist die gesamte BYOK-Geschichte. Es gibt keine spezielle Stufe, keinen Upgrade-Flow, keine Abrechnungsbeziehung mit uns. Du zahlst den Modellanbieter, du behältst deine Keys, du behältst deine Prompts. Wir liefern die Ebene.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Layer gebaut haben, nicht als Produkt</a> — die Wette dahinter, eine dünne Ebene auszuliefern statt einer gehosteten App</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Der BYOK-Reality-Check: 5 Dinge, die kaputtgehen</a> — die ehrlichen Trade-offs und rauen Kanten, wenn man seinen eigenen Key mitbringt</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 Skills, 72 Systeme: wie die Open-Design-Bibliothek funktioniert</a> — die <code>SKILL.md</code>-/<code>DESIGN.md</code>-Dateien, die konstant bleiben, egal welches Modell du betreibst</li>
      </ul>
  fr:
    title: "Workflow de design BYOK : faites tourner Claude, Codex ou Qwen sur votre propre clé"
    summary: "La plupart des outils de design IA ajoutent discrètement une marge sur chaque token que vous dépensez. Open Design adopte la position inverse — apportez la clé de votre propre modèle, payez directement le fournisseur et gardez le contrôle total de l'endroit où s'exécute l'inférence. Voici comment fonctionne réellement la couche BYOK."
    bodyHtml: |
      <p>Si vous avez utilisé un produit de design IA hébergé en 2026, vous avez probablement remarqué la facture qui grimpe. Un abonnement par-dessus une facturation par siège, le tout superposé à une majoration d'inférence que personne ne publie. Le calcul est opaque, et c'est voulu.</p>
      <p>Open Design n'exécute pas d'inférence. Nous n'avons aucune marge sur les tokens. L'ensemble du workflow est construit autour du <strong>bring-your-own-key (BYOK)</strong> — vous pointez le daemon vers n'importe quel endpoint compatible OpenAI, vous collez votre propre clé API, et c'est terminé.</p>
      <p>Cet article explique pourquoi nous avons fait ce choix, comment cela fonctionne en coulisses, et ce que cela change réellement dans votre workflow au quotidien. Si vous voulez l'argument philosophique plus large derrière tout ça, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">pourquoi nous avons conçu Open Design comme une couche de skills</a> en est le pendant — celui-ci est la version pratique.</p>
      <h2>Ce que « BYOK » signifie vraiment ici</h2>
      <p>Il y a deux définitions de BYOK qui circulent dans l'univers de l'outillage IA, et ce ne sont pas la même chose :</p>
      <ul>
      <li><strong>BYOK de surface</strong> — l'outil vous laisse coller une clé, mais achemine quand même l'inférence via ses serveurs, journalise vos prompts et peut appliquer des limites de débit.</li>
      <li><strong>BYOK réel</strong> — l'outil appelle directement le fournisseur du modèle depuis votre machine (ou votre infrastructure). Vos prompts ne touchent jamais les serveurs du fournisseur. Le fournisseur ne prend aucune marge.</li>
      </ul>
      <p>Open Design est du second type. Le daemon effectue des appels HTTP vers l'endpoint que vous configurez, avec votre clé, depuis votre machine. Nous ne faisons pas de proxy. Nous ne journalisons pas. Nous ne voyons pas vos prompts.</p>
      <h3>Où part réellement l'appel</h3>
      <p>Lorsque le daemon prend en charge une tâche, il compose le prompt — en récupérant les fichiers <code>SKILL.md</code> et <code>DESIGN.md</code> pertinents pour la tâche — puis effectue une unique requête HTTP vers la base URL que vous avez définie. La réponse est renvoyée en streaming vers votre machine, l'agent écrit l'artefact sur le disque, et voilà toute la boucle. Il n'y a aucun serveur Open Design sur le chemin. Le même daemon qui découvre vos skills possède aussi l'appel réseau, c'est pourquoi « où cela s'exécute-t-il ? » est un paramètre et non une conversation commerciale.</p>
      <h2>L'adaptateur compatible OpenAI</h2>
      <p>La plupart des endpoints d'inférence IA en 2026 parlent l'API OpenAI Chat Completions. Nous l'utilisons comme protocole plus petit dénominateur commun. Si votre fournisseur la parle (et presque tous le font), vous êtes pris en charge par défaut — aucun plugin, aucune intégration par fournisseur à attendre.</p>
      <h3>Fournisseurs vers lesquels vous pouvez le pointer</h3>













































      <table><thead><tr><th>Fournisseur</th><th>Forme typique de la base URL</th><th>Idéal pour</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, les passes générales les plus solides</td></tr><tr><td>Anthropic</td><td>shim de compatibilité OpenAI, ou l'adaptateur Claude dédié</td><td>raffinement axé sur le goût, briefs longs</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>rédaction long-contexte économique</td></tr><tr><td>Groq</td><td>base URL du fournisseur</td><td>cycles de brouillon à faible latence</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>n'importe quel modèle de pointe, une seule relation de facturation</td></tr><tr><td>vLLM / TGI / Ollama auto-hébergés</td><td>votre propre hôte, p. ex. <code>http://localhost:11434/v1</code></td><td>travail entièrement local, confidentiel pour le client</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL du fournisseur</td><td>modèles régionaux avec endpoints compatibles OAI</td></tr></tbody></table>
      <p>La liste n'est pas une liste d'autorisation codée en dur — c'est simplement là où les gens atterrissent couramment. Tout ce qui répond à la forme Chat Completions fonctionne.</p>
      <h3>Deux champs, puis redémarrage</h3>
      <p>La configuration tient en deux champs :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Placez-les dans <code>.env.local</code>, redémarrez le daemon, et vous êtes sur un autre modèle. Basculer vers une instance Ollama locale pour un projet sensible tient aux deux mêmes lignes :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Il n'y a aucun registre de modèles à mettre à jour, aucun compte à relier, aucune migration. La clé et l'endpoint constituent toute la surface.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Une clé unique reliée à une rangée de trois moteurs de modèles interchangeables, celui du milieu sélectionné dans un cadre vert, sur un fond éditorial presque blanc">
        <figcaption>Une clé, n'importe quel modèle — l'adaptateur rend Claude, Codex et Qwen interchangeables derrière le même workflow.</figcaption>
      </figure>
      <h2>Pourquoi cela compte pour le travail de design</h2>
      <p>Les workflows de design ont une structure de coût particulière que les produits à inférence hébergée gèrent mal :</p>
      <ol>
      <li><strong>L'itération est l'unité de travail.</strong> Une vraie passe de design signifie 30 à 50 cycles de prompts, pas trois. Les forfaits hébergés brident durement autour des 50 cycles.</li>
      <li><strong>Le long contexte est la norme.</strong> Un brief sérieux implique des documents de marque, des travaux antérieurs, des spécifications de système et de l'imagerie de référence. Ce contexte dépasse largement les budgets de tokens des interfaces hébergées.</li>
      <li><strong>Le choix du modèle devrait être ad hoc.</strong> Certaines passes veulent un modèle rapide et bon marché. D'autres veulent le plus puissant disponible. D'autres veulent un modèle local pour du contenu sensible. Un produit hébergé en choisit un pour vous.</li>
      </ol>
      <p>Le BYOK règle les trois. Vous payez au token, vous choisissez le modèle, vous n'êtes pas bridé.</p>
      <h3>L'itération cesse d'être rationnée</h3>
      <p>C'est ce qui change discrètement votre façon de travailler. Quand chaque cycle supplémentaire est décompté sur un forfait, vous commencez à vous auto-censurer — vous prenez le troisième brouillon parce que le quatrième semble coûteux. En BYOK, le coût marginal d'une passe de plus représente quelques centimes chez le fournisseur du modèle, donc la décision redevient une question de travail, pas de compteur. Le troisième brouillon est généralement là où le design devient bon ; un outil qui taxe l'itération taxe précisément l'étape qui compte.</p>
      <h2>Et le coût ?</h2>
      <p>Une inquiétude fréquente : « Si je paie directement, est-ce que ça ne sera pas plus cher ? »</p>
      <p>En pratique, non. Voici une journée type de travail de design dans notre usage interne :</p>









































      <table><thead><tr><th>Tâche</th><th>Tokens</th><th>Fournisseur</th><th>Coût</th></tr></thead><tbody><tr><td>Réception du brief (3 docs)</td><td>30K en entrée</td><td>Claude Sonnet</td><td>0,09 $</td></tr><tr><td>Première passe de brouillon</td><td>80K en entrée + 20K en sortie</td><td>Claude Sonnet</td><td>0,54 $</td></tr><tr><td>5 cycles d'itération</td><td>250K en entrée + 80K en sortie</td><td>Claude Sonnet</td><td>1,95 $</td></tr><tr><td>Peaufinage final</td><td>50K en entrée + 30K en sortie</td><td>Claude Opus (une passe)</td><td>1,35 $</td></tr><tr><td><strong>Total de la journée</strong></td><td></td><td></td><td><strong>~3,93 $</strong></td></tr></tbody></table>
      <p>Cela représente un deck, deux variantes de landing et une exploration de marque. L'équivalent hébergé — en supposant un forfait « créateur » à 30 $/mois avec frais de dépassement — coûterait environ 50 $ pour le même travail, vous donnerait moins d'itérations et vous enfermerait dans un seul modèle.</p>
      <p>Si vous voulez réduire les coûts, remplacez Claude Sonnet par DeepSeek V3.2 et la journée tombe sous le dollar. L'enjeu n'est pas qu'un modèle soit le bon — c'est que le curseur prix/qualité est entre vos mains plutôt que figé dans un palier d'abonnement.</p>
      <h2>Confidentialité et conformité</h2>
      <p>Il y a une seconde raison pour laquelle le BYOK compte : <strong>les prompts contiennent la marque de votre client.</strong></p>
      <p>L'inférence hébergée signifie faire transiter des documents de marque, des noms de produits non annoncés, des tarifs internes et de la création avant lancement par les serveurs d'un tiers. La plupart des entreprises ont un avis là-dessus. Certaines ont un contrat à ce sujet.</p>
      <p>Avec le BYOK, l'aller-retour du prompt se fait entre votre ordinateur portable et le fournisseur du modèle que vous avez déjà validé (ou auto-hébergé). Open Design n'est pas dans la boucle. Nous n'avons aucun journal à assigner, aucune surface de fuite à exposer, aucun trou d'audit à expliquer.</p>
      <h3>Ce que « pas de journal » vous apporte en pratique</h3>
      <p>Pour le travail d'agence, les secteurs réglementés ou tout ce qui précède un lancement, c'est la seule position qui tienne. Si une revue de sécurité demande « où vont nos actifs de marque ? », la réponse est « vers le fournisseur du modèle prévu dans notre contrat, et nulle part ailleurs » — pas « vers le tableau de bord d'un fournisseur que nous ne contrôlons pas ». Auto-héberger un endpoint Ollama ou vLLM resserre encore les choses : les octets ne quittent jamais votre réseau. C'est le même arbitrage exploré dans <a href="/blog/byok-reality-check-5-things-that-break/">le bilan de réalité du BYOK</a>, qui est honnête sur les aspérités qui subsistent — les modèles locaux et les modèles de pointe ne sont pas interchangeables sur le goût, et vous êtes propriétaire de la surface d'injection de prompts.</p>
      <h2>Comment changer de fournisseur en cours de projet</h2>
      <p>L'un des avantages sous-estimés du BYOK est l'arbitrage de fournisseur pendant un projet :</p>
      <ul>
      <li><strong>Brouillon</strong> — utilisez un modèle bon marché (DeepSeek V3.2, Qwen 3) pour le formulaire de questions et la première itération</li>
      <li><strong>Raffinement</strong> — passez à Claude Sonnet ou GPT-5 pour les passes intermédiaires où le goût compte</li>
      <li><strong>Contenu sensible</strong> — basculez vers un modèle Ollama local pour les prompts confidentiels du client</li>
      <li><strong>Peaufinage final</strong> — consacrez une passe au modèle le plus puissant disponible (Opus, GPT-5 Pro)</li>
      </ul>
      <p>Dans Open Design, changer revient à modifier deux lignes dans <code>.env.local</code>. Aucune migration, aucun ré-onboarding, aucune montée en gamme de forfait.</p>
      <h3>Un routage détaillé pour un brief</h3>
      <p>Concrètement, un seul brief de landing-page pourrait se dérouler ainsi :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Mêmes skills, même design system sur le disque, mêmes artefacts — seul le moteur derrière le workflow a changé. Parce que les skills et les systems ne sont que des fichiers (<code>SKILL.md</code> et <code>DESIGN.md</code>), rien dans votre configuration n'est lié à un modèle particulier. C'est ce que signifie réellement posséder le workflow : l'outil s'efface, et le modèle est un paramètre que vous changez selon les exigences du brief.</p>
      <h2>Essayez-le</h2>
      <p>Clonez le dépôt, définissez <code>OPENAI_BASE_URL</code> et <code>OPENAI_API_KEY</code> dans <code>.env.local</code>, lancez <code>pnpm tools-dev</code>. Le daemon utilisera l'endpoint que vous lui indiquez, avec le modèle que vous payez, selon le rythme que vous voulez.</p>
      <p>Voilà toute l'histoire du BYOK. Aucun palier spécial, aucun parcours de mise à niveau, aucune relation de facturation avec nous. Vous payez le fournisseur du modèle, vous gardez vos clés, vous gardez vos prompts. Nous fournissons la couche.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a> — le pari derrière le fait de livrer une couche fine plutôt qu'une application hébergée</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Le bilan de réalité du BYOK : 5 choses qui cassent</a> — les compromis honnêtes et les aspérités du fait d'apporter sa propre clé</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems : comment fonctionne la bibliothèque Open Design</a> — les fichiers <code>SKILL.md</code> / <code>DESIGN.md</code> qui restent constants quel que soit le modèle que vous exécutez</li>
      </ul>
  ru:
    title: "Рабочий процесс дизайна по модели BYOK: запускайте Claude, Codex или Qwen на собственном ключе"
    summary: "Большинство ИИ-инструментов для дизайна незаметно добавляют наценку к каждому потраченному вами токену. Open Design занимает противоположную позицию — используйте собственный ключ модели, платите провайдеру напрямую и сохраняйте полный контроль над тем, где выполняется инференс. Вот как на самом деле работает слой BYOK."
    bodyHtml: |
      <p>Если вы пользовались каким-либо облачным ИI-продуктом для дизайна в 2026 году, вы наверняка заметили, что счёт постепенно растёт. Подписка поверх платы за каждое рабочее место, а сверху ещё и наценка за инференс, которую никто не публикует. Расчёты непрозрачны намеренно.</p>
      <p>Open Design не выполняет инференс. У нас нет наценки на токены. Весь рабочий процесс построен вокруг принципа <strong>bring-your-own-key (BYOK)</strong> — вы направляете daemon на любой совместимый с OpenAI эндпоинт, вставляете собственный API-ключ, и на этом всё.</p>
      <p>В этой статье объясняется, почему мы сделали такой выбор, как это работает под капотом и что это на самом деле меняет в вашей повседневной работе. Если вас интересует более широкий философский аргумент, стоящий за этим, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">почему мы построили Open Design как слой навыков, а не как продукт</a> — это сопутствующая статья, а эта — её практическая версия.</p>
      <h2>Что на самом деле здесь означает «BYOK»</h2>
      <p>В сфере ИИ-инструментов ходят два определения BYOK, и это не одно и то же:</p>
      <ul>
      <li><strong>Поверхностный BYOK</strong> — инструмент позволяет вставить ключ, но по-прежнему маршрутизирует инференс через свои серверы, логирует ваши промпты и может применять ограничения по частоте запросов.</li>
      <li><strong>Настоящий BYOK</strong> — инструмент обращается к провайдеру модели напрямую с вашей машины (или из вашей инфраструктуры). Ваши промпты никогда не попадают на серверы вендора. Вендор не берёт наценку.</li>
      </ul>
      <p>Open Design относится ко второму типу. Daemon выполняет HTTP-вызовы к тому эндпоинту, который вы настроили, с вашим ключом, с вашей машины. Мы не проксируем. Мы не логируем. Мы не видим ваши промпты.</p>
      <h3>Куда на самом деле уходит вызов</h3>
      <p>Когда daemon берёт задачу в работу, он формирует промпт — подтягивая релевантные файлы <code>SKILL.md</code> и <code>DESIGN.md</code> для этой задачи — а затем выполняет единственный HTTP-запрос к заданному вами base URL. Ответ потоком возвращается на вашу машину, агент записывает артефакт на диск — и в этом весь цикл. На этом пути нет сервера Open Design. Тот же daemon, который обнаруживает ваши навыки, владеет и сетевым вызовом, поэтому вопрос «а где это выполняется?» — это настройка, а не разговор с отделом продаж.</p>
      <h2>Адаптер, совместимый с OpenAI</h2>
      <p>Большинство эндпоинтов ИИ-инференса в 2026 году говорят на языке OpenAI Chat Completions API. Мы используем его как протокол наименьшего общего знаменателя. Если ваш провайдер его поддерживает (а почти все поддерживают), вы поддерживаетесь по умолчанию — никаких плагинов, никакой интеграции под конкретного провайдера, которую нужно ждать.</p>
      <h3>Провайдеры, на которые можно его направить</h3>




















































      <table><thead><tr><th>Провайдер</th><th>Типичный вид base URL</th><th>Подходит для</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, самые сильные общие проходы</td></tr><tr><td>Anthropic</td><td>OpenAI compat shim или выделенный адаптер Claude</td><td>доработка, требующая вкуса, длинные брифы</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>экономичные черновики с длинным контекстом</td></tr><tr><td>Groq</td><td>base URL провайдера</td><td>циклы черновиков с низкой задержкой</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>любая фронтирная модель, одни биллинговые отношения</td></tr><tr><td>Self-hosted vLLM / TGI / Ollama</td><td>ваш собственный хост, например <code>http://localhost:11434/v1</code></td><td>полностью локально, конфиденциальная клиентская работа</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL провайдера</td><td>региональные модели с OAI-совместимыми эндпоинтами</td></tr></tbody></table>
      <p>Этот список не является жёстко заданным белым списком — это просто то, к чему обычно приходят люди. Работает всё, что отвечает в формате Chat Completions.</p>
      <h3>Два поля, затем перезапуск</h3>
      <p>Конфигурация — это два поля:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Поместите их в <code>.env.local</code>, перезапустите daemon — и вы уже на другой модели. Переключение на локальную машину с Ollama для чувствительного проекта — это те же две строки:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Нет реестра моделей, который нужно обновлять, нет аккаунта, который нужно перепривязывать, нет миграции. Ключ и эндпоинт — это вся поверхность.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Единственный ключ, подключённый к ряду из трёх взаимозаменяемых модельных движков, средний из которых выбран в зелёной рамке, на почти белом редакционном фоне">
        <figcaption>Один ключ, любая модель — адаптер делает Claude, Codex и Qwen взаимозаменяемыми в рамках одного и того же рабочего процесса.</figcaption>
      </figure>
      <h2>Почему это важно для работы дизайнера</h2>
      <p>У дизайнерских рабочих процессов есть специфическая структура затрат, с которой облачные продукты инференса справляются плохо:</p>
      <ol>
      <li><strong>Итерация — это единица работы.</strong> Настоящий дизайнерский проход означает 30–50 циклов промптов, а не три. Облачные тарифы жёстко тормозят на отметке в 50 циклов.</li>
      <li><strong>Длинный контекст — это норма.</strong> Серьёзный бриф включает брендовые документы, предыдущие работы, спецификации систем и референсные изображения. Этот контекст выходит далеко за пределы токеновых бюджетов в облачных интерфейсах.</li>
      <li><strong>Выбор модели должен быть ситуативным.</strong> Для одних проходов нужна быстрая дешёвая модель. Для других — самая сильная из доступных. Для третьих — локальная модель для чувствительного контента. Облачный продукт выбирает одну за вас.</li>
      </ol>
      <p>BYOK решает все три проблемы. Вы платите за токен, вы выбираете модель, вас не тормозят.</p>
      <h3>Итерации перестают нормироваться</h3>
      <p>Именно это незаметно меняет то, как вы работаете. Когда каждый лишний цикл засчитывается в счёт тарифа, вы начинаете заниматься самоцензурой — берёте третий черновик, потому что четвёртый кажется дорогим. На BYOK предельная стоимость ещё одного прохода — это несколько центов у провайдера модели, поэтому решение снова становится вопросом работы, а не счётчика. Третий черновик — это обычно то место, где дизайн становится хорошим; инструмент, который облагает итерации налогом, облагает налогом именно тот шаг, который важен.</p>
      <h2>А как насчёт стоимости?</h2>
      <p>Распространённое опасение: «Если я плачу напрямую, разве это не будет дороже?»</p>
      <p>На практике — нет. Вот типичный день дизайнерской работы по нашему внутреннему опыту:</p>




































      <table><thead><tr><th>Задача</th><th>Токены</th><th>Провайдер</th><th>Стоимость</th></tr></thead><tbody><tr><td>Приём брифа (3 документа)</td><td>30K на входе</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>Первый черновой проход</td><td>80K на входе + 20K на выходе</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 циклов итераций</td><td>250K на входе + 80K на выходе</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>Финальная шлифовка</td><td>50K на входе + 30K на выходе</td><td>Claude Opus (один проход)</td><td>$1.35</td></tr><tr><td><strong>Итого за день</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>Это презентация, два варианта лендинга и брендовое исследование. Облачный эквивалент — при условии тарифа «creator» за $30 в месяц с доплатами за превышение — обошёлся бы примерно в $50 за ту же работу, дал бы меньше итераций и привязал бы вас к одной модели.</p>
      <p>Если хотите дешевле, замените Claude Sonnet на DeepSeek V3.2 — и день обойдётся меньше чем в $1. Дело не в том, что одна модель правильная, — а в том, что ручка регулировки цены/качества находится в ваших руках, а не зашита в уровень подписки.</p>
      <h2>Приватность и комплаенс</h2>
      <p>Есть и вторая причина, по которой BYOK важен: <strong>промпты содержат бренд вашего клиента.</strong></p>
      <p>Облачный инференс означает маршрутизацию брендовых документов, ещё не анонсированных названий продуктов, внутренних цен и креативов до запуска через серверы третьей стороны. У большинства компаний есть своё мнение об этом. У некоторых есть на этот счёт контракт.</p>
      <p>При BYOK обмен данными по промпту происходит между вашим ноутбуком и провайдером модели, которого вы уже проверили (или развернули у себя). Open Design в этом не участвует. У нас нет лога, который можно затребовать по повестке, нет поверхности для утечки данных, нет аудиторского пробела, который пришлось бы объяснять.</p>
      <h3>Что на практике даёт «отсутствие логов»</h3>
      <p>Для агентской работы, регулируемых отраслей или чего угодно до запуска это единственная позиция, которая выдерживает критику. Если в ходе проверки безопасности спрашивают «куда уходят наши брендовые активы?», ответ — «провайдеру модели, указанному в нашем контракте, и больше никуда», а не «в дашборд вендора, который мы не контролируем». Самостоятельное размещение эндпоинта Ollama или vLLM усиливает это ещё больше: байты вообще не покидают вашу сеть. Это тот же компромисс, который рассматривается в <a href="/blog/byok-reality-check-5-things-that-break/">честной проверке реальности BYOK</a>, где откровенно говорится о том, где всё ещё есть шероховатости — локальные модели и фронтирные модели не взаимозаменяемы по вкусу, и поверхность для prompt-инъекций вы контролируете сами.</p>
      <h2>Как переключать провайдеров посреди проекта</h2>
      <p>Одно из недооценённых преимуществ BYOK — арбитраж провайдеров в ходе проекта:</p>
      <ul>
      <li><strong>Черновики</strong> — используйте дешёвую модель (DeepSeek V3.2, Qwen 3) для формы вопросов и первой итерации</li>
      <li><strong>Доработка</strong> — переключитесь на Claude Sonnet или GPT-5 для средних проходов, где важен вкус</li>
      <li><strong>Чувствительный контент</strong> — перейдите на локальную модель Ollama для конфиденциальных клиентских промптов</li>
      <li><strong>Финальная шлифовка</strong> — потратьте один проход на самую сильную доступную модель (Opus, GPT-5 Pro)</li>
      </ul>
      <p>В Open Design переключение — это редактирование двух строк в <code>.env.local</code>. Нет миграции, нет повторного онбординга, нет апгрейда тарифа.</p>
      <h3>Готовая маршрутизация для одного брифа</h3>
      <p>Конкретно: один бриф на лендинг мог бы выполняться так:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Те же навыки, та же дизайн-система на диске, те же артефакты — изменился лишь движок за рабочим процессом. Поскольку навыки и системы — это просто файлы (<code>SKILL.md</code> и <code>DESIGN.md</code>), ничто в вашей настройке не привязано к конкретной модели. Вот что на самом деле означает владеть рабочим процессом: инструмент уходит с пути, а модель — это параметр, который вы меняете по требованию брифа.</p>
      <h2>Попробуйте</h2>
      <p>Склонируйте репозиторий, задайте <code>OPENAI_BASE_URL</code> и <code>OPENAI_API_KEY</code> в <code>.env.local</code>, запустите <code>pnpm tools-dev</code>. Daemon будет использовать тот эндпоинт, на который вы его направите, с той моделью, за которую вы платите, по тому графику, который вам нужен.</p>
      <p>Это вся история BYOK. Нет особого уровня, нет процесса апгрейда, нет биллинговых отношений с нами. Вы платите провайдеру модели, вы сохраняете свои ключи, вы сохраняете свои промпты. Мы предоставляем слой.</p>
      <h2>Дополнительное чтение</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не как продукт</a> — ставка, стоящая за решением выпустить тонкий слой вместо облачного приложения</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Проверка реальности BYOK: 5 вещей, которые ломаются</a> — честные компромиссы и шероховатости использования собственного ключа</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навык, 72 системы: как работает библиотека Open Design</a> — файлы <code>SKILL.md</code> / <code>DESIGN.md</code>, которые остаются неизменными независимо от того, какую модель вы запускаете</li>
      </ul>
  es:
    title: "Flujo de diseño BYOK: ejecuta Claude, Codex o Qwen con tu propia clave"
    summary: "La mayoría de las herramientas de diseño con IA añaden discretamente un margen a cada token que gastas. Open Design adopta la postura opuesta: trae tu propia clave de modelo, paga directamente al proveedor y mantén el control total de dónde se ejecuta la inferencia. Así funciona realmente la capa BYOK."
    bodyHtml: |
      <p>Si has usado un producto de diseño con IA alojado en 2026, probablemente hayas notado que la factura va subiendo. Una suscripción sobre un cargo por puesto, superpuesto a un margen de inferencia que nadie publica. Las cuentas son opacas a propósito.</p>
      <p>Open Design no ejecuta inferencia. No tenemos un margen sobre los tokens. Todo el flujo de trabajo está construido en torno a <strong>bring-your-own-key (BYOK)</strong>: apuntas el daemon a cualquier endpoint compatible con OpenAI, pegas tu propia clave de API y listo.</p>
      <p>Este artículo explica por qué tomamos esa decisión, cómo funciona internamente y qué cambia realmente en tu flujo de trabajo diario. Si quieres el argumento filosófico más amplio detrás de esto, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">por qué construimos Open Design como una capa de skills, no como un producto</a> es la pieza complementaria; esta es la versión práctica.</p>
      <h2>Qué significa realmente «BYOK» aquí</h2>
      <p>Hay dos definiciones de BYOK dando vueltas en el espacio de las herramientas de IA, y no son lo mismo:</p>
      <ul>
      <li><strong>BYOK superficial</strong>: la herramienta te deja pegar una clave, pero sigue enrutando la inferencia a través de sus servidores, registra tus prompts y puede aplicar límites de tasa.</li>
      <li><strong>BYOK real</strong>: la herramienta llama al proveedor del modelo directamente desde tu máquina (o tu infraestructura). Tus prompts nunca tocan los servidores del proveedor de la herramienta. El proveedor no se queda ningún margen.</li>
      </ul>
      <p>Open Design es del segundo tipo. El daemon hace llamadas HTTP a cualquier endpoint que configures, con tu clave, desde tu máquina. No hacemos de proxy. No registramos nada. No vemos tus prompts.</p>
      <h3>A dónde va realmente la llamada</h3>
      <p>Cuando el daemon recoge un trabajo, compone el prompt —incorporando los archivos <code>SKILL.md</code> y <code>DESIGN.md</code> relevantes para la tarea— y luego hace una única solicitud HTTP a la base URL que hayas configurado. La respuesta vuelve en streaming a tu máquina, el agente escribe el artefacto en disco, y ese es todo el ciclo. No hay ningún servidor de Open Design en la ruta. El mismo daemon que descubre tus skills también es dueño de la llamada de red, por eso «¿dónde se ejecuta esto?» es un ajuste y no una conversación de ventas.</p>
      <h2>El adaptador compatible con OpenAI</h2>
      <p>La mayoría de los endpoints de inferencia de IA en 2026 hablan la API OpenAI Chat Completions. La usamos como el protocolo de mínimo común denominador. Si tu proveedor la habla (y casi todos lo hacen), tienes soporte por defecto: sin plugin, sin integración por proveedor que esperar.</p>
      <h3>Proveedores a los que puedes apuntarlo</h3>




















































      <table><thead><tr><th>Proveedor</th><th>Forma típica de la base URL</th><th>Bueno para</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, las pasadas generales más potentes</td></tr><tr><td>Anthropic</td><td>shim de compatibilidad OpenAI, o el adaptador dedicado de Claude</td><td>refinamiento con mucho criterio, briefs largos</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>borradores de contexto largo a bajo coste</td></tr><tr><td>Groq</td><td>base URL del proveedor</td><td>ciclos de borrador de baja latencia</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>cualquier modelo de frontera, una sola relación de facturación</td></tr><tr><td>vLLM / TGI / Ollama autoalojados</td><td>tu propio host, p. ej. <code>http://localhost:11434/v1</code></td><td>trabajo totalmente local y confidencial del cliente</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL del proveedor</td><td>modelos regionales con endpoints compatibles con OAI</td></tr></tbody></table>
      <p>La lista no es una allowlist con valores fijos: es simplemente donde la gente suele acabar. Cualquier cosa que responda a la forma de Chat Completions funciona.</p>
      <h3>Dos campos, y luego reiniciar</h3>
      <p>La configuración son dos campos:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Colócalos en <code>.env.local</code>, reinicia el daemon, y ya estás en un modelo distinto. Cambiar a una máquina local con Ollama para un proyecto sensible son las mismas dos líneas:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>No hay ningún registro de modelos que actualizar, ninguna cuenta que volver a vincular, ninguna migración. La clave y el endpoint son toda la superficie.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Una única clave conectada a una fila de tres motores de modelo intercambiables, con el del medio seleccionado en un marco verde, sobre un fondo editorial casi blanco">
        <figcaption>Una clave, cualquier modelo: el adaptador hace que Claude, Codex y Qwen sean intercambiables detrás del mismo flujo de trabajo.</figcaption>
      </figure>
      <h2>Por qué esto importa para el trabajo de diseño</h2>
      <p>Los flujos de trabajo de diseño tienen una forma de coste específica que a los productos de inferencia alojada se les da mal:</p>
      <ol>
      <li><strong>La iteración es la unidad de trabajo.</strong> Una pasada de diseño real significa entre 30 y 50 ciclos de prompt, no tres. Los planes alojados imponen límites duros al llegar a la marca de los 50 ciclos.</li>
      <li><strong>El contexto largo es la norma.</strong> Un brief serio implica documentos de marca, trabajo previo, especificaciones de sistema e imágenes de referencia. Ese contexto desborda los presupuestos de tokens de las interfaces alojadas.</li>
      <li><strong>La elección de modelo debería ser ad hoc.</strong> Algunas pasadas quieren un modelo rápido y barato. Algunas quieren el más potente disponible. Algunas quieren un modelo local para contenido sensible. Un producto alojado elige uno por ti.</li>
      </ol>
      <p>BYOK soluciona los tres. Pagas por token, eliges el modelo y no te limitan.</p>
      <h3>La iteración deja de estar racionada</h3>
      <p>Este es el que cambia discretamente tu forma de trabajar. Cuando cada ciclo extra se contabiliza contra un plan, empiezas a autocensurarte: te quedas con el tercer borrador porque el cuarto se siente caro. Con BYOK, el coste marginal de una pasada más son unos pocos céntimos en el proveedor del modelo, así que la decisión vuelve a ser sobre el trabajo, no sobre el contador. El tercer borrador suele ser donde el diseño se pone bueno; una herramienta que grava la iteración está gravando justo el paso que importa.</p>
      <h2>¿Y el coste?</h2>
      <p>Una preocupación habitual: «Si pago directamente, ¿no saldrá más caro?».</p>
      <p>En la práctica, no. Aquí tienes un día típico de trabajo de diseño en nuestro uso interno:</p>


































      <table><thead><tr><th>Tarea</th><th>Tokens</th><th>Proveedor</th><th>Coste</th></tr></thead><tbody><tr><td>Recepción del brief (3 documentos)</td><td>30K de entrada</td><td>Claude Sonnet</td><td>$0,09</td></tr><tr><td>Pasada del primer borrador</td><td>80K de entrada + 20K de salida</td><td>Claude Sonnet</td><td>$0,54</td></tr><tr><td>5 ciclos de iteración</td><td>250K de entrada + 80K de salida</td><td>Claude Sonnet</td><td>$1,95</td></tr><tr><td>Pulido final</td><td>50K de entrada + 30K de salida</td><td>Claude Opus (una pasada)</td><td>$1,35</td></tr><tr><td><strong>Total del día</strong></td><td></td><td></td><td><strong>~$3,93</strong></td></tr></tbody></table>
      <p>Eso es una presentación, dos variantes de landing y una exploración de marca. El equivalente alojado —asumiendo un plan «creator» de $30/mes con cargos por exceso— costaría alrededor de $50 por el mismo trabajo, te daría menos iteraciones y te ataría a un solo modelo.</p>
      <p>Si quieres abaratarlo, cambia Claude Sonnet por DeepSeek V3.2 y el día baja por debajo de $1. La cuestión no es que un modelo sea el correcto, sino que el dial de precio/calidad está en tus manos en lugar de venir cocinado en un nivel de suscripción.</p>
      <h2>Privacidad y cumplimiento</h2>
      <p>Hay una segunda razón por la que BYOK importa: <strong>los prompts contienen la marca de tu cliente.</strong></p>
      <p>La inferencia alojada significa enrutar documentos de marca, nombres de producto aún no anunciados, precios internos y creatividades previas al lanzamiento a través de los servidores de un tercero. La mayoría de las empresas tienen una opinión al respecto. Algunas tienen un contrato sobre ello.</p>
      <p>Con BYOK, el viaje de ida y vuelta del prompt es entre tu portátil y el proveedor del modelo que ya has verificado (o autoalojado). Open Design no está en el bucle. No tenemos ningún registro que pueda ser citado judicialmente, ninguna superficie de brecha de la que filtrar, ningún hueco de auditoría que explicar.</p>
      <h3>Qué te aporta «sin registro» en la práctica</h3>
      <p>Para el trabajo de agencia, las industrias reguladas o cualquier cosa previa al lanzamiento, esta es la única postura que se sostiene. Si una revisión de seguridad pregunta «¿a dónde van nuestros activos de marca?», la respuesta es «al proveedor del modelo de nuestro contrato, y a ningún otro sitio», no «a un panel de un proveedor que no controlamos». Autoalojar un endpoint de Ollama o vLLM lo aprieta aún más: los bytes nunca salen de tu red en absoluto. Este es el mismo compromiso que se explora en <a href="/blog/byok-reality-check-5-things-that-break/">el examen de realidad de BYOK</a>, que es honesto sobre dónde siguen estando las aristas: los modelos locales y los modelos de frontera no son intercambiables en cuanto a criterio, y la superficie de inyección de prompts la asumes tú.</p>
      <h2>Cómo cambiar de proveedor a mitad de proyecto</h2>
      <p>Uno de los beneficios infravalorados de BYOK es el arbitraje de proveedores durante un proyecto:</p>
      <ul>
      <li><strong>Borrador</strong>: usa un modelo barato (DeepSeek V3.2, Qwen 3) para el formulario de preguntas y la primera iteración</li>
      <li><strong>Refinamiento</strong>: cambia a Claude Sonnet o GPT-5 para las pasadas intermedias donde el criterio importa</li>
      <li><strong>Contenido sensible</strong>: pásate a un modelo local de Ollama para prompts confidenciales del cliente</li>
      <li><strong>Pulido final</strong>: gasta una pasada en el modelo más potente disponible (Opus, GPT-5 Pro)</li>
      </ul>
      <p>En Open Design, cambiar es editar dos líneas en <code>.env.local</code>. No hay migración, ni reincorporación, ni mejora de plan.</p>
      <h3>Un enrutamiento trabajado para un brief</h3>
      <p>Concretamente, un único brief de landing page podría desarrollarse así:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Los mismos skills, el mismo sistema de diseño en disco, los mismos artefactos: solo cambió el motor detrás del flujo de trabajo. Como los skills y los sistemas son simplemente archivos (<code>SKILL.md</code> y <code>DESIGN.md</code>), nada de tu configuración está atado a un modelo concreto. Esto es lo que significa realmente ser dueño del flujo de trabajo: la herramienta se quita de en medio, y el modelo es un parámetro que cambias según lo exija el brief.</p>
      <h2>Pruébalo</h2>
      <p>Clona el repositorio, configura <code>OPENAI_BASE_URL</code> y <code>OPENAI_API_KEY</code> en <code>.env.local</code>, ejecuta <code>pnpm tools-dev</code>. El daemon usará el endpoint al que lo apuntes, con el modelo que pagues, en el horario que quieras.</p>
      <p>Esa es toda la historia de BYOK. No hay ningún nivel especial, ningún flujo de mejora, ninguna relación de facturación con nosotros. Pagas al proveedor del modelo, conservas tus claves, conservas tus prompts. Nosotros proporcionamos la capa.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a>: la apuesta detrás de enviar una capa fina en lugar de una app alojada</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">El examen de realidad de BYOK: 5 cosas que se rompen</a>: los compromisos honestos y las aristas de traer tu propia clave</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: cómo funciona la biblioteca de Open Design</a>: los archivos <code>SKILL.md</code> / <code>DESIGN.md</code> que permanecen constantes sin importar qué modelo ejecutes</li>
      </ul>
  pt-br:
    title: "Fluxo de design BYOK: rode Claude, Codex ou Qwen com sua própria chave"
    summary: "A maioria das ferramentas de design com IA adiciona discretamente uma margem a cada token que você gasta. O Open Design adota a postura oposta — traga a chave do seu próprio modelo, pague o provedor diretamente e mantenha controle total sobre onde a inferência roda. Veja como a camada BYOK funciona de verdade."
    bodyHtml: |
      <p>Se você usou algum produto de design com IA hospedado em 2026, provavelmente notou a conta subindo aos poucos. Uma assinatura em cima de uma cobrança por assento, sobreposta a uma margem de inferência que ninguém divulga. A conta é opaca de propósito.</p>
      <p>O Open Design não roda inferência. Não temos margem sobre tokens. Todo o fluxo de trabalho é construído em torno de <strong>bring-your-own-key (BYOK)</strong> — você aponta o daemon para qualquer endpoint compatível com OpenAI, cola sua própria API key e pronto.</p>
      <p>Este post explica por que fizemos essa escolha, como ela funciona por baixo dos panos e o que ela realmente muda no seu dia a dia. Se você quer o argumento filosófico mais amplo por trás disso, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">por que construímos o Open Design como uma camada de skills, não um produto</a> é o texto complementar — este aqui é a versão prática.</p>
      <h2>O que “BYOK” realmente significa aqui</h2>
      <p>Existem duas definições de BYOK circulando pelo espaço de ferramentas de IA, e elas não são a mesma coisa:</p>
      <ul>
      <li><strong>BYOK de fachada</strong> — a ferramenta deixa você colar uma chave, mas ainda roteia a inferência pelos servidores dela, registra seus prompts e pode aplicar limites de taxa.</li>
      <li><strong>BYOK de verdade</strong> — a ferramenta chama o provedor do modelo diretamente da sua máquina (ou da sua infraestrutura). Seus prompts nunca tocam os servidores do fornecedor. O fornecedor não tira margem.</li>
      </ul>
      <p>O Open Design é do segundo tipo. O daemon faz chamadas HTTP para o endpoint que você configurar, com a sua chave, a partir da sua máquina. Não fazemos proxy. Não registramos nada. Não vemos seus prompts.</p>
      <h3>Para onde a chamada realmente vai</h3>
      <p>Quando o daemon pega um job, ele compõe o prompt — reunindo os arquivos <code>SKILL.md</code> e <code>DESIGN.md</code> relevantes para a tarefa — e então faz uma única requisição HTTP para a base URL que você definiu. A resposta volta em streaming para a sua máquina, o agente grava o artefato em disco, e esse é o ciclo inteiro. Não há nenhum servidor do Open Design no caminho. O mesmo daemon que descobre suas skills também é dono da chamada de rede, e é por isso que “onde isso roda?” é uma configuração, não uma conversa de vendas.</p>
      <h2>O adaptador compatível com OpenAI</h2>
      <p>A maioria dos endpoints de inferência de IA em 2026 fala a API OpenAI Chat Completions. Usamos isso como o protocolo de menor denominador comum. Se o seu provedor a fala (e quase todos falam), você já é suportado por padrão — sem plugin, sem integração por provedor para esperar.</p>
      <h3>Provedores para os quais você pode apontá-lo</h3>













































      <table><thead><tr><th>Provedor</th><th>Formato típico de base URL</th><th>Bom para</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, as passadas gerais mais fortes</td></tr><tr><td>Anthropic</td><td>shim de compatibilidade OpenAI, ou o adaptador dedicado do Claude</td><td>refinamento que exige bom gosto, briefings longos</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>rascunho de contexto longo com bom custo-benefício</td></tr><tr><td>Groq</td><td>base URL do provedor</td><td>ciclos de rascunho de baixa latência</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>qualquer modelo de fronteira, uma única relação de faturamento</td></tr><tr><td>vLLM / TGI / Ollama auto-hospedados</td><td>seu próprio host, ex.: <code>http://localhost:11434/v1</code></td><td>trabalho totalmente local e confidencial do cliente</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL do provedor</td><td>modelos regionais com endpoints compatíveis com OAI</td></tr></tbody></table>
      <p>A lista não é uma allowlist codificada — é apenas onde as pessoas costumam parar. Qualquer coisa que responda ao formato Chat Completions funciona.</p>
      <h3>Dois campos, depois reinicie</h3>
      <p>A configuração são dois campos:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Coloque-os no <code>.env.local</code>, reinicie o daemon e você está em outro modelo. Mudar para uma caixa Ollama local em um projeto sensível são as mesmas duas linhas:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Não há registro de modelo para atualizar, nenhuma conta para revincular, nenhuma migração. A chave e o endpoint são toda a superfície.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Uma única chave conectada a uma fileira de três motores de modelo intercambiáveis, o do meio selecionado em uma moldura verde, sobre um fundo editorial quase branco">
        <figcaption>Uma chave, qualquer modelo — o adaptador torna Claude, Codex e Qwen intercambiáveis por trás do mesmo fluxo de trabalho.</figcaption>
      </figure>
      <h2>Por que isso importa para o trabalho de design</h2>
      <p>Os fluxos de design têm um formato de custo específico em que os produtos de inferência hospedada vão mal:</p>
      <ol>
      <li><strong>A iteração é a unidade de trabalho.</strong> Uma passada de design de verdade significa de 30 a 50 ciclos de prompt, não três. Os planos hospedados limitam pesado na marca dos 50 ciclos.</li>
      <li><strong>Contexto longo é a norma.</strong> Um briefing sério envolve documentos de marca, trabalhos anteriores, especificações de sistema e imagens de referência. Esse contexto estoura os orçamentos de token das UIs hospedadas.</li>
      <li><strong>A escolha do modelo deveria ser ad-hoc.</strong> Algumas passadas pedem um modelo rápido e barato. Algumas pedem o mais forte disponível. Algumas pedem um modelo local para conteúdo sensível. Um produto hospedado escolhe um por você.</li>
      </ol>
      <p>O BYOK resolve os três. Você paga por token, escolhe o modelo e não é estrangulado por limites.</p>
      <h3>A iteração deixa de ser racionada</h3>
      <p>Esta é a que muda discretamente como você trabalha. Quando cada ciclo extra é medido contra um plano, você começa a se autocensurar — fica com o terceiro rascunho porque o quarto parece caro. No BYOK, o custo marginal de mais uma passada é alguns centavos no provedor do modelo, então a decisão volta a ser sobre o trabalho, não sobre o medidor. O terceiro rascunho costuma ser onde o design fica bom; uma ferramenta que tributa a iteração está tributando exatamente o passo que importa.</p>
      <h2>E quanto ao custo?</h2>
      <p>Uma preocupação comum: “Se eu estou pagando diretamente, não vai sair mais caro?”</p>
      <p>Na prática, não. Veja um dia típico de trabalho de design no nosso uso interno:</p>









































      <table><thead><tr><th>Tarefa</th><th>Tokens</th><th>Provedor</th><th>Custo</th></tr></thead><tbody><tr><td>Recepção do briefing (3 docs)</td><td>30K de entrada</td><td>Claude Sonnet</td><td>US$ 0,09</td></tr><tr><td>Primeira passada de rascunho</td><td>80K de entrada + 20K de saída</td><td>Claude Sonnet</td><td>US$ 0,54</td></tr><tr><td>5 ciclos de iteração</td><td>250K de entrada + 80K de saída</td><td>Claude Sonnet</td><td>US$ 1,95</td></tr><tr><td>Polimento final</td><td>50K de entrada + 30K de saída</td><td>Claude Opus (uma passada)</td><td>US$ 1,35</td></tr><tr><td><strong>Total do dia</strong></td><td></td><td></td><td><strong>~US$ 3,93</strong></td></tr></tbody></table>
      <p>Isso dá um deck, duas variações de landing e uma exploração de marca. O equivalente hospedado — supondo um plano “creator” de US$ 30/mês com cobranças por excedente — custaria cerca de US$ 50 pelo mesmo trabalho, daria menos iterações e prenderia você a um único modelo.</p>
      <p>Se você quiser ficar mais barato, troque o Claude Sonnet pelo DeepSeek V3.2 e o dia cai para menos de US$ 1. A questão não é que um modelo seja o certo — é que o controle de preço/qualidade está nas suas mãos, em vez de embutido em um nível de assinatura.</p>
      <h2>Privacidade e conformidade</h2>
      <p>Há um segundo motivo pelo qual o BYOK importa: <strong>os prompts contêm a marca do seu cliente.</strong></p>
      <p>Inferência hospedada significa rotear documentos de marca, nomes de produtos não anunciados, preços internos e criações pré-lançamento pelos servidores de um terceiro. A maioria das empresas tem uma opinião sobre isso. Algumas têm um contrato sobre isso.</p>
      <p>Com BYOK, a ida e volta do prompt é entre o seu laptop e o provedor de modelo que você já avaliou (ou auto-hospedou). O Open Design não está no circuito. Não temos log para intimar, nenhuma superfície de violação para vazar, nenhuma lacuna de auditoria para explicar.</p>
      <h3>O que “sem log” compra na prática</h3>
      <p>Para trabalho de agência, setores regulados ou qualquer coisa pré-lançamento, esta é a única postura que se sustenta. Se uma revisão de segurança perguntar “para onde vão nossos ativos de marca?”, a resposta é “para o provedor de modelo no nosso contrato, e para mais lugar nenhum” — não “para o dashboard de um fornecedor que não controlamos.” Auto-hospedar um endpoint Ollama ou vLLM aperta isso ainda mais: os bytes nunca saem da sua rede. Esse é o mesmo trade-off explorado no <a href="/blog/byok-reality-check-5-things-that-break/">teste de realidade do BYOK</a>, que é honesto sobre onde as arestas ainda estão — modelos locais e modelos de fronteira não são intercambiáveis em bom gosto, e você é dono da superfície de prompt injection por conta própria.</p>
      <h2>Como trocar de provedor no meio do projeto</h2>
      <p>Um dos benefícios subestimados do BYOK é a arbitragem de provedores durante um projeto:</p>
      <ul>
      <li><strong>Rascunho</strong> — use um modelo barato (DeepSeek V3.2, Qwen 3) no formulário de perguntas e na primeira iteração</li>
      <li><strong>Refinamento</strong> — mude para Claude Sonnet ou GPT-5 nas passadas intermediárias em que o bom gosto importa</li>
      <li><strong>Conteúdo sensível</strong> — troque para um modelo Ollama local para prompts confidenciais do cliente</li>
      <li><strong>Polimento final</strong> — gaste uma passada no modelo mais forte disponível (Opus, GPT-5 Pro)</li>
      </ul>
      <p>No Open Design, trocar é editar duas linhas no <code>.env.local</code>. Não há migração, nenhum reonboarding, nenhum upgrade de plano.</p>
      <h3>Um roteamento trabalhado para um briefing</h3>
      <p>Concretamente, um único briefing de landing-page poderia rodar assim:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>As mesmas skills, o mesmo design system em disco, os mesmos artefatos — só o motor por trás do fluxo de trabalho mudou. Como skills e sistemas são apenas arquivos (<code>SKILL.md</code> e <code>DESIGN.md</code>), nada na sua configuração está atrelado a um modelo específico. É isso que realmente significa ser dono do fluxo de trabalho: a ferramenta sai do caminho, e o modelo é um parâmetro que você muda conforme o briefing exige.</p>
      <h2>Experimente</h2>
      <p>Clone o repositório, defina <code>OPENAI_BASE_URL</code> e <code>OPENAI_API_KEY</code> no <code>.env.local</code>, rode <code>pnpm tools-dev</code>. O daemon usará qualquer endpoint para o qual você apontá-lo, com qualquer modelo que você pague, na agenda que você quiser.</p>
      <p>Essa é toda a história do BYOK. Não há nível especial, nenhum fluxo de upgrade, nenhuma relação de faturamento conosco. Você paga o provedor do modelo, você mantém suas chaves, você mantém seus prompts. Nós fornecemos a camada.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a> — a aposta por trás de entregar uma camada fina em vez de um app hospedado</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">O teste de realidade do BYOK: 5 coisas que quebram</a> — os trade-offs honestos e as arestas de trazer sua própria chave</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: como funciona a biblioteca do Open Design</a> — os arquivos <code>SKILL.md</code> / <code>DESIGN.md</code> que permanecem constantes não importa qual modelo você rode</li>
      </ul>
  it:
    title: "Flusso di lavoro di design BYOK: usa Claude, Codex o Qwen con la tua chiave"
    summary: "La maggior parte degli strumenti di design AI aggiunge in silenzio un margine a ogni token che spendi. Open Design adotta la posizione opposta: porta la chiave del tuo modello, paga direttamente il provider e mantieni il pieno controllo su dove gira l'inferenza. Ecco come funziona davvero il livello BYOK."
    bodyHtml: |
      <p>Se hai usato un prodotto di design AI ospitato nel 2026, probabilmente hai notato la bolletta che lievita. Un abbonamento sopra un costo per postazione, stratificato sopra un ricarico sull'inferenza che nessuno pubblica. La matematica è opaca di proposito.</p>
      <p>Open Design non esegue inferenza. Non abbiamo un margine sui token. L'intero flusso di lavoro è costruito attorno al <strong>bring-your-own-key (BYOK)</strong>: punti il daemon a qualsiasi endpoint compatibile con OpenAI, incolli la tua API key e hai finito.</p>
      <p>Questo articolo spiega perché abbiamo fatto questa scelta, come funziona sotto il cofano e cosa cambia davvero nel tuo flusso di lavoro quotidiano. Se vuoi l'argomentazione filosofica più ampia che ci sta dietro, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a> è il pezzo complementare: questo è la versione pratica.</p>
      <h2>Cosa significa davvero "BYOK" qui</h2>
      <p>Ci sono due definizioni di BYOK che circolano nel mondo degli strumenti AI, e non sono la stessa cosa:</p>
      <ul>
      <li><strong>BYOK di superficie</strong>: lo strumento ti permette di incollare una chiave, ma instrada comunque l'inferenza attraverso i propri server, registra i tuoi prompt e può applicare limiti di frequenza.</li>
      <li><strong>BYOK reale</strong>: lo strumento chiama il provider del modello direttamente dalla tua macchina (o dalla tua infrastruttura). I tuoi prompt non toccano mai i server del fornitore. Il fornitore non prende alcun margine.</li>
      </ul>
      <p>Open Design è il secondo tipo. Il daemon effettua chiamate HTTP a qualunque endpoint configuri, con la tua chiave, dalla tua macchina. Non facciamo da proxy. Non registriamo nulla. Non vediamo i tuoi prompt.</p>
      <h3>Dove va davvero la chiamata</h3>
      <p>Quando il daemon prende un job, compone il prompt — recuperando i file <code>SKILL.md</code> e <code>DESIGN.md</code> rilevanti per l'attività — e poi effettua una singola richiesta HTTP al base URL che hai impostato. La risposta torna in streaming alla tua macchina, l'agente scrive l'artefatto su disco, e questo è l'intero ciclo. Non c'è alcun server Open Design nel percorso. Lo stesso daemon che scopre le tue skill possiede anche la chiamata di rete, ed è per questo che "dove gira questo?" è un'impostazione e non una trattativa commerciale.</p>
      <h2>L'adattatore compatibile con OpenAI</h2>
      <p>La maggior parte degli endpoint di inferenza AI nel 2026 parla l'API OpenAI Chat Completions. La usiamo come protocollo minimo comune denominatore. Se il tuo provider la parla (e quasi tutti lo fanno), sei supportato per impostazione predefinita: nessun plugin, nessuna integrazione per provider da aspettare.</p>
      <h3>Provider a cui puoi puntarlo</h3>




      <table><thead><tr><th>Provider</th><th>Forma tipica del base URL</th><th>Adatto a</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, i passaggi generali più forti</td></tr><tr><td>Anthropic</td><td>shim di compatibilità OpenAI, o l'adattatore Claude dedicato</td><td>raffinamento ad alta sensibilità estetica, brief lunghi</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>bozze a contesto lungo a costi contenuti</td></tr><tr><td>Groq</td><td>base URL del provider</td><td>cicli di bozza a bassa latenza</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>qualsiasi modello di frontiera, un'unica relazione di fatturazione</td></tr><tr><td>vLLM / TGI / Ollama self-hosted</td><td>il tuo host, ad es. <code>http://localhost:11434/v1</code></td><td>lavoro completamente locale, riservato al cliente</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL del provider</td><td>modelli regionali con endpoint compatibili OAI</td></tr></tbody></table>
      <p>La lista non è una allowlist codificata: è semplicemente dove le persone finiscono di solito. Qualsiasi cosa risponda alla forma Chat Completions funziona.</p>
      <h3>Due campi, poi riavvia</h3>
      <p>La configurazione sono due campi:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Inseriscili in <code>.env.local</code>, riavvia il daemon, e sei su un modello diverso. Passare a una macchina Ollama locale per un progetto sensibile sono le stesse due righe:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Non c'è alcun registro di modelli da aggiornare, nessun account da ricollegare, nessuna migrazione. La chiave e l'endpoint sono l'intera superficie.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Una singola chiave cablata a una fila di tre motori di modello intercambiabili, quello centrale selezionato in una cornice verde, su uno sfondo editoriale quasi bianco">
        <figcaption>Una chiave, qualsiasi modello: l'adattatore rende Claude, Codex e Qwen intercambiabili dietro lo stesso flusso di lavoro.</figcaption>
      </figure>
      <h2>Perché questo conta per il lavoro di design</h2>
      <p>I flussi di lavoro di design hanno una specifica forma di costo con cui i prodotti a inferenza ospitata sono in difficoltà:</p>
      <ol>
      <li><strong>L'iterazione è l'unità di lavoro.</strong> Un vero passaggio di design significa 30-50 cicli di prompt, non tre. I piani ospitati strozzano duramente intorno alla soglia dei 50 cicli.</li>
      <li><strong>Il contesto lungo è la norma.</strong> Un brief serio coinvolge documenti di brand, lavori precedenti, specifiche di sistema e immagini di riferimento. Quel contesto sfonda i budget di token nelle UI ospitate.</li>
      <li><strong>La scelta del modello dovrebbe essere ad-hoc.</strong> Alcuni passaggi vogliono un modello veloce ed economico. Alcuni vogliono il più forte disponibile. Alcuni vogliono un modello locale per contenuti sensibili. Un prodotto ospitato ne sceglie uno al posto tuo.</li>
      </ol>
      <p>BYOK risolve tutti e tre. Paghi per token, scegli il modello, non vieni strozzato.</p>
      <h3>L'iterazione smette di essere razionata</h3>
      <p>Questo è quello che cambia silenziosamente il modo in cui lavori. Quando ogni ciclo in più viene conteggiato su un piano, inizi ad autocensurarti: prendi la terza bozza perché la quarta sembra costosa. Con BYOK il costo marginale di un altro passaggio è qualche centesimo presso il provider del modello, quindi la decisione torna a riguardare il lavoro, non il contatore. La terza bozza è di solito dove il design diventa buono; uno strumento che tassa l'iterazione sta tassando esattamente il passaggio che conta.</p>
      <h2>E i costi?</h2>
      <p>Una preoccupazione comune: "Se pago direttamente, non sarà più costoso?"</p>
      <p>In pratica, no. Ecco una tipica giornata di lavoro di design nel nostro utilizzo interno:</p>




      <table><thead><tr><th>Attività</th><th>Token</th><th>Provider</th><th>Costo</th></tr></thead><tbody><tr><td>Acquisizione del brief (3 documenti)</td><td>30K input</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>Passaggio di prima bozza</td><td>80K input + 20K output</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 cicli di iterazione</td><td>250K input + 80K output</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>Rifinitura finale</td><td>50K input + 30K output</td><td>Claude Opus (un passaggio)</td><td>$1.35</td></tr><tr><td><strong>Totale giornata</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>Si tratta di un deck, due varianti di landing e un'esplorazione di brand. L'equivalente ospitato — ipotizzando un piano "creator" da $30/mese con addebiti per superamento — costerebbe circa $50 per lo stesso lavoro, ti darebbe meno iterazioni e ti legherebbe a un solo modello.</p>
      <p>Se vuoi spendere meno, sostituisci Claude Sonnet con DeepSeek V3.2 e la giornata scende sotto $1. Il punto non è che un modello sia quello giusto: è che il quadrante prezzo/qualità è nelle tue mani anziché incorporato in un livello di abbonamento.</p>
      <h2>Privacy e conformità</h2>
      <p>C'è una seconda ragione per cui BYOK conta: <strong>i prompt contengono il brand del tuo cliente.</strong></p>
      <p>L'inferenza ospitata significa instradare documenti di brand, nomi di prodotti non ancora annunciati, prezzi interni e creatività pre-lancio attraverso i server di una terza parte. La maggior parte delle aziende ha un'opinione al riguardo. Alcune hanno un contratto al riguardo.</p>
      <p>Con BYOK, il viaggio di andata e ritorno del prompt è tra il tuo laptop e il provider del modello che hai già verificato (o ospitato in proprio). Open Design non è nel percorso. Non abbiamo alcun log da citare in giudizio, nessuna superficie di violazione da cui far trapelare dati, nessuna lacuna di audit da spiegare.</p>
      <h3>Cosa ti dà in pratica il "nessun log"</h3>
      <p>Per il lavoro di agenzia, i settori regolamentati o qualsiasi cosa pre-lancio, questa è l'unica posizione che regge. Se una revisione di sicurezza chiede "dove vanno i nostri asset di brand?", la risposta è "al provider del modello nel nostro contratto, e da nessun'altra parte", non "a una dashboard di un fornitore che non controlliamo". Ospitare in proprio un endpoint Ollama o vLLM stringe ulteriormente: i byte non lasciano mai affatto la tua rete. Questo è lo stesso compromesso esplorato in <a href="/blog/byok-reality-check-5-things-that-break/">la verifica della realtà di BYOK</a>, che è onesto su dove ci sono ancora gli spigoli grezzi: i modelli locali e i modelli di frontiera non sono intercambiabili sul gusto, e la superficie di prompt injection è tua da gestire.</p>
      <h2>Come cambiare provider a metà progetto</h2>
      <p>Uno dei vantaggi sottovalutati di BYOK è l'arbitraggio dei provider durante un progetto:</p>
      <ul>
      <li><strong>Bozza</strong>: usa un modello economico (DeepSeek V3.2, Qwen 3) per la fase di domande e la prima iterazione</li>
      <li><strong>Raffinamento</strong>: passa a Claude Sonnet o GPT-5 per i passaggi intermedi dove conta il gusto</li>
      <li><strong>Contenuti sensibili</strong>: passa a un modello Ollama locale per i prompt riservati al cliente</li>
      <li><strong>Rifinitura finale</strong>: brucia un passaggio sul modello più forte disponibile (Opus, GPT-5 Pro)</li>
      </ul>
      <p>In Open Design, cambiare significa modificare due righe in <code>.env.local</code>. Non c'è migrazione, nessun nuovo onboarding, nessun upgrade di piano.</p>
      <h3>Un instradamento concreto per un singolo brief</h3>
      <p>Concretamente, un singolo brief di landing page potrebbe svolgersi così:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Stesse skill, stesso design system su disco, stessi artefatti: è cambiato solo il motore dietro il flusso di lavoro. Poiché skill e sistemi sono solo file (<code>SKILL.md</code> e <code>DESIGN.md</code>), nulla del tuo setup è legato a un modello particolare. Questo è ciò che significa davvero possedere il flusso di lavoro: lo strumento si toglie di mezzo, e il modello è un parametro che cambi a seconda di ciò che il brief richiede.</p>
      <h2>Provalo</h2>
      <p>Clona il repository, imposta <code>OPENAI_BASE_URL</code> e <code>OPENAI_API_KEY</code> in <code>.env.local</code>, esegui <code>pnpm tools-dev</code>. Il daemon userà qualunque endpoint gli punti, con qualunque modello paghi, con qualunque cadenza tu voglia.</p>
      <p>Questa è l'intera storia del BYOK. Non c'è un livello speciale, nessun flusso di upgrade, nessuna relazione di fatturazione con noi. Paghi il provider del modello, conservi le tue chiavi, conservi i tuoi prompt. Noi forniamo il livello.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>: la scommessa dietro il rilasciare un livello sottile anziché un'app ospitata</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">La verifica della realtà di BYOK: 5 cose che si rompono</a>: i compromessi onesti e gli spigoli grezzi del portare la tua chiave</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistemi: come funziona la libreria di Open Design</a>: i file <code>SKILL.md</code> / <code>DESIGN.md</code> che restano costanti indipendentemente dal modello che esegui</li>
      </ul>
  vi:
    title: "Quy trình thiết kế BYOK: chạy Claude, Codex hay Qwen bằng key của riêng bạn"
    summary: "Hầu hết các công cụ thiết kế AI đều âm thầm cộng thêm một khoản chênh lệch vào mỗi token bạn tiêu. Open Design chọn lập trường ngược lại — mang theo key model của riêng bạn, trả tiền trực tiếp cho nhà cung cấp, và giữ toàn quyền kiểm soát nơi suy luận chạy. Đây là cách lớp BYOK thực sự hoạt động."
    bodyHtml: |
      <p>Nếu bạn đã dùng một sản phẩm thiết kế AI được host trong năm 2026, có lẽ bạn đã nhận ra hóa đơn cứ tăng dần. Một gói thuê bao chồng lên phí tính theo từng chỗ ngồi, lại chồng tiếp lên một khoản markup suy luận mà chẳng ai công bố. Phép toán cố tình mờ ám.</p>
      <p>Open Design không chạy suy luận. Chúng tôi không lấy chênh lệch trên token. Toàn bộ quy trình được xây dựng quanh <strong>bring-your-own-key (BYOK)</strong> — bạn trỏ daemon tới bất kỳ endpoint tương thích OpenAI nào, dán API key của riêng bạn vào, thế là xong.</p>
      <p>Bài viết này giải thích vì sao chúng tôi chọn cách đó, nó hoạt động ra sao bên dưới, và nó thực sự thay đổi điều gì trong quy trình hằng ngày của bạn. Nếu bạn muốn lập luận triết lý lớn hơn đằng sau nó, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> là bài đồng hành — còn bài này là phiên bản thực hành.</p>
      <h2>“BYOK” thực sự nghĩa là gì ở đây</h2>
      <p>Có hai định nghĩa về BYOK đang lan truyền trong không gian công cụ AI, và chúng không phải là một:</p>
      <ul>
      <li><strong>BYOK bề mặt</strong> — công cụ cho bạn dán key, nhưng vẫn định tuyến suy luận qua máy chủ của họ, ghi log prompt của bạn, và có thể áp giới hạn tốc độ.</li>
      <li><strong>BYOK thật</strong> — công cụ gọi thẳng tới nhà cung cấp model từ máy của bạn (hoặc hạ tầng của bạn). Prompt của bạn không bao giờ chạm tới máy chủ của nhà cung cấp công cụ. Nhà cung cấp công cụ không lấy chênh lệch nào.</li>
      </ul>
      <p>Open Design thuộc loại thứ hai. Daemon thực hiện các lệnh gọi HTTP tới bất kỳ endpoint nào bạn cấu hình, bằng key của bạn, từ máy của bạn. Chúng tôi không làm proxy. Chúng tôi không ghi log. Chúng tôi không thấy prompt của bạn.</p>
      <h3>Lệnh gọi thực sự đi về đâu</h3>
      <p>Khi daemon nhận một tác vụ, nó soạn prompt — kéo vào các tệp <code>SKILL.md</code> và <code>DESIGN.md</code> liên quan tới tác vụ — rồi thực hiện một lệnh gọi HTTP duy nhất tới base URL bạn đã đặt. Phản hồi truyền ngược về máy của bạn, agent ghi artifact xuống đĩa, và đó là toàn bộ vòng lặp. Không có máy chủ Open Design nào trên đường đi. Cùng một daemon khám phá các skill của bạn cũng sở hữu lệnh gọi mạng, đó là lý do “cái này chạy ở đâu?” là một thiết lập chứ không phải một cuộc trò chuyện bán hàng.</p>
      <h2>Bộ chuyển đổi tương thích OpenAI</h2>
      <p>Hầu hết các endpoint suy luận AI trong năm 2026 đều nói chuyện bằng OpenAI Chat Completions API. Chúng tôi dùng nó làm giao thức mẫu số chung thấp nhất. Nếu nhà cung cấp của bạn nói được nó (và gần như tất cả đều nói được), bạn được hỗ trợ mặc định — không plugin, không phải chờ tích hợp riêng cho từng nhà cung cấp.</p>
      <h3>Các nhà cung cấp bạn có thể trỏ tới</h3>




















































      <table><thead><tr><th>Nhà cung cấp</th><th>Dạng base URL điển hình</th><th>Tốt cho</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, các lượt xử lý tổng quát mạnh nhất</td></tr><tr><td>Anthropic</td><td>Lớp shim tương thích OpenAI, hoặc bộ chuyển đổi Claude chuyên dụng</td><td>tinh chỉnh nặng về gu thẩm mỹ, brief dài</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>soạn thảo ngữ cảnh dài tiết kiệm chi phí</td></tr><tr><td>Groq</td><td>base URL của nhà cung cấp</td><td>các chu kỳ soạn thảo độ trễ thấp</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>bất kỳ model tiên phong nào, một mối quan hệ thanh toán</td></tr><tr><td>vLLM / TGI / Ollama tự host</td><td>host của riêng bạn, ví dụ <code>http://localhost:11434/v1</code></td><td>hoàn toàn cục bộ, công việc bảo mật cho khách hàng</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL của nhà cung cấp</td><td>các model khu vực với endpoint tương thích OAI</td></tr></tbody></table>
      <p>Danh sách này không phải là allowlist được mã hóa cứng — nó chỉ là nơi mọi người thường dừng chân. Bất cứ thứ gì trả lời đúng dạng Chat Completions đều dùng được.</p>
      <h3>Hai trường, rồi khởi động lại</h3>
      <p>Cấu hình là hai trường:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Đặt chúng vào <code>.env.local</code>, khởi động lại daemon, và bạn đã ở trên một model khác. Chuyển sang một máy Ollama cục bộ cho một dự án nhạy cảm cũng là cùng hai dòng đó:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Không có model registry nào phải cập nhật, không có tài khoản nào phải liên kết lại, không có di chuyển. Key và endpoint là toàn bộ bề mặt.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Một key duy nhất nối với một hàng ba engine model có thể hoán đổi cho nhau, cái ở giữa được chọn trong khung xanh lá, trên nền biên tập gần như trắng">
        <figcaption>Một key, bất kỳ model nào — bộ chuyển đổi khiến Claude, Codex và Qwen có thể hoán đổi cho nhau đằng sau cùng một quy trình.</figcaption>
      </figure>
      <h2>Vì sao điều này quan trọng với công việc thiết kế</h2>
      <p>Các quy trình thiết kế có một hình thái chi phí đặc thù mà các sản phẩm suy luận được host xử lý rất kém:</p>
      <ol>
      <li><strong>Lặp lại là đơn vị công việc.</strong> Một lượt thiết kế thực sự nghĩa là 30–50 chu kỳ prompt, không phải ba. Các gói được host bóp mạnh ở mốc 50 chu kỳ.</li>
      <li><strong>Ngữ cảnh dài là chuyện bình thường.</strong> Một brief nghiêm túc liên quan tới tài liệu thương hiệu, công việc trước đó, đặc tả hệ thống và hình ảnh tham chiếu. Ngữ cảnh đó vượt xa hạn mức token trong các UI được host.</li>
      <li><strong>Việc chọn model nên là tùy hứng.</strong> Có lượt cần một model rẻ và nhanh. Có lượt cần model mạnh nhất hiện có. Có lượt cần một model cục bộ cho nội dung nhạy cảm. Một sản phẩm được host chọn sẵn một cái cho bạn.</li>
      </ol>
      <p>BYOK khắc phục cả ba. Bạn trả tiền theo token, bạn chọn model, bạn không bị bóp.</p>
      <h3>Lặp lại thôi bị phân phối định mức</h3>
      <p>Đây là điều âm thầm thay đổi cách bạn làm việc. Khi mỗi chu kỳ thêm đều bị tính trừ vào một gói, bạn bắt đầu tự kiểm duyệt — bạn nhận bản nháp thứ ba vì bản thứ tư cảm giác đắt. Trên BYOK, chi phí biên của thêm một lượt nữa chỉ là vài xu ở nhà cung cấp model, nên quyết định trở lại là về công việc, không phải về cái đồng hồ đo. Bản nháp thứ ba thường là chỗ thiết kế trở nên đẹp; một công cụ đánh thuế lên việc lặp lại chính là đánh thuế lên đúng bước quan trọng nhất.</p>
      <h2>Còn chi phí thì sao?</h2>
      <p>Một nỗi lo phổ biến: “Nếu tôi trả trực tiếp, chẳng phải sẽ đắt hơn sao?”</p>
      <p>Thực tế thì không. Đây là một ngày công việc thiết kế điển hình trong cách dùng nội bộ của chúng tôi:</p>


































      <table><thead><tr><th>Tác vụ</th><th>Token</th><th>Nhà cung cấp</th><th>Chi phí</th></tr></thead><tbody><tr><td>Tiếp nhận brief (3 tài liệu)</td><td>30K đầu vào</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>Lượt nháp đầu tiên</td><td>80K đầu vào + 20K đầu ra</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 chu kỳ lặp lại</td><td>250K đầu vào + 80K đầu ra</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>Hoàn thiện cuối</td><td>50K đầu vào + 30K đầu ra</td><td>Claude Opus (một lượt)</td><td>$1.35</td></tr><tr><td><strong>Tổng cả ngày</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>Đó là một bộ slide, hai biến thể landing, và một khám phá thương hiệu. Bản tương đương được host — giả sử một gói “creator” $30/tháng có phí vượt mức — sẽ tốn khoảng $50 cho cùng công việc đó, cho bạn ít lượt lặp hơn, và khóa bạn vào một model.</p>
      <p>Nếu bạn muốn rẻ hơn, đổi Claude Sonnet sang DeepSeek V3.2 và cả ngày tụt xuống dưới $1. Điểm mấu chốt không phải là một model nào đó đúng — mà là núm chỉnh giá/chất lượng nằm trong tay bạn chứ không bị nung sẵn vào một bậc thuê bao.</p>
      <h2>Quyền riêng tư và tuân thủ</h2>
      <p>Còn một lý do thứ hai khiến BYOK quan trọng: <strong>các prompt chứa thương hiệu của khách hàng bạn.</strong></p>
      <p>Suy luận được host nghĩa là định tuyến tài liệu thương hiệu, tên sản phẩm chưa công bố, bảng giá nội bộ và sáng tạo trước ra mắt qua máy chủ của một bên thứ ba. Hầu hết công ty đều có quan điểm về chuyện đó. Một số có hợp đồng về chuyện đó.</p>
      <p>Với BYOK, vòng đi-về của prompt là giữa laptop của bạn và nhà cung cấp model bạn đã thẩm định (hoặc tự host). Open Design không nằm trong vòng lặp. Chúng tôi không có log nào để bị triệu tập, không có bề mặt vi phạm nào để rò rỉ, không có lỗ hổng kiểm toán nào phải giải trình.</p>
      <h3>“Không log” mang lại gì trong thực tế</h3>
      <p>Với công việc agency, các ngành chịu quản lý, hay bất cứ thứ gì trước ra mắt, đây là lập trường duy nhất trụ vững. Nếu một cuộc rà soát bảo mật hỏi “tài sản thương hiệu của chúng tôi đi đâu?”, câu trả lời là “tới nhà cung cấp model trong hợp đồng của chúng tôi, và không đi đâu khác” — chứ không phải “tới một dashboard của nhà cung cấp mà chúng tôi không kiểm soát.” Tự host một endpoint Ollama hay vLLM còn siết chặt hơn: các byte không bao giờ rời khỏi mạng của bạn. Đây cũng chính là sự đánh đổi được khám phá trong <a href="/blog/byok-reality-check-5-things-that-break/">bài kiểm tra thực tế BYOK</a>, vốn thành thật về chỗ vẫn còn gồ ghề — model cục bộ và model tiên phong không thể hoán đổi cho nhau về mặt gu thẩm mỹ, và bạn tự sở hữu bề mặt prompt-injection.</p>
      <h2>Cách chuyển nhà cung cấp giữa chừng dự án</h2>
      <p>Một trong những lợi ích bị đánh giá thấp của BYOK là việc kinh doanh chênh lệch nhà cung cấp ngay trong một dự án:</p>
      <ul>
      <li><strong>Soạn nháp</strong> — dùng một model rẻ (DeepSeek V3.2, Qwen 3) cho phần đặt câu hỏi và lượt lặp đầu tiên</li>
      <li><strong>Tinh chỉnh</strong> — chuyển sang Claude Sonnet hoặc GPT-5 cho các lượt giữa nơi gu thẩm mỹ quyết định</li>
      <li><strong>Nội dung nhạy cảm</strong> — đổi sang một model Ollama cục bộ cho các prompt bảo mật cho khách hàng</li>
      <li><strong>Hoàn thiện cuối</strong> — đốt một lượt trên model mạnh nhất hiện có (Opus, GPT-5 Pro)</li>
      </ul>
      <p>Trong Open Design, việc chuyển đổi là sửa hai dòng trong <code>.env.local</code>. Không có di chuyển, không có onboarding lại, không có nâng cấp gói.</p>
      <h3>Một định tuyến đã chạy thử cho một brief</h3>
      <p>Cụ thể, một brief landing-page đơn lẻ có thể chạy như thế này:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Cùng các skill, cùng design system trên đĩa, cùng các artifact — chỉ có engine đằng sau quy trình thay đổi. Vì các skill và system chỉ là tệp (<code>SKILL.md</code> và <code>DESIGN.md</code>), không có gì trong thiết lập của bạn bị buộc vào một model cụ thể. Đây mới là ý nghĩa thực sự của việc sở hữu quy trình: công cụ lùi sang một bên, và model là một tham số bạn thay đổi tùy theo brief đòi hỏi.</p>
      <h2>Hãy thử nó</h2>
      <p>Clone repo, đặt <code>OPENAI_BASE_URL</code> và <code>OPENAI_API_KEY</code> trong <code>.env.local</code>, chạy <code>pnpm tools-dev</code>. Daemon sẽ dùng bất kỳ endpoint nào bạn trỏ tới, với bất kỳ model nào bạn trả tiền, theo bất kỳ lịch trình nào bạn muốn.</p>
      <p>Đó là toàn bộ câu chuyện BYOK. Không có bậc đặc biệt, không có luồng nâng cấp, không có mối quan hệ thanh toán nào với chúng tôi. Bạn trả tiền cho nhà cung cấp model, bạn giữ key của mình, bạn giữ prompt của mình. Chúng tôi cung cấp lớp ở giữa.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> — canh bạc đằng sau việc ship một lớp mỏng thay vì một ứng dụng được host</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Kiểm tra thực tế BYOK: 5 thứ dễ hỏng</a> — những đánh đổi thành thật và các chỗ gồ ghề của việc mang theo key của riêng bạn</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 system: thư viện Open Design hoạt động ra sao</a> — các tệp <code>SKILL.md</code> / <code>DESIGN.md</code> giữ nguyên bất kể bạn chạy model nào</li>
      </ul>
  pl:
    title: "Workflow projektowy BYOK: uruchom Claude, Codex lub Qwen na własnym kluczu"
    summary: "Większość narzędzi do projektowania z AI po cichu dolicza marżę do każdego wydanego tokena. Open Design przyjmuje odwrotne stanowisko — przynieś własny klucz do modelu, płać dostawcy bezpośrednio i zachowaj pełną kontrolę nad tym, gdzie działa wnioskowanie. Oto jak naprawdę działa warstwa BYOK."
    bodyHtml: |
      <p>Jeśli korzystałeś z hostowanego produktu projektowego z AI w 2026 roku, prawdopodobnie zauważyłeś, że rachunek rośnie. Subskrypcja na wierzchu opłaty za stanowisko, nałożona na narzut za wnioskowanie, którego nikt nie publikuje. Ta matematyka jest nieprzejrzysta celowo.</p>
      <p>Open Design nie uruchamia wnioskowania. Nie mamy marży na tokenach. Cały workflow jest zbudowany wokół zasady <strong>bring-your-own-key (BYOK)</strong> — wskazujesz daemon dowolnemu endpointowi zgodnemu z OpenAI, wklejasz własny klucz API i gotowe.</p>
      <p>Ten wpis wyjaśnia, dlaczego dokonaliśmy tego wyboru, jak to działa pod maską i co tak naprawdę zmienia w Twoim codziennym workflow. Jeśli chcesz poznać szerszy argument filozoficzny stojący za tym, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> to tekst towarzyszący — ten jest wersją praktyczną.</p>
      <h2>Co tak naprawdę oznacza tutaj „BYOK”</h2>
      <p>W przestrzeni narzędzi AI krążą dwie definicje BYOK i nie są one tym samym:</p>
      <ul>
      <li><strong>Powierzchowny BYOK</strong> — narzędzie pozwala wkleić klucz, ale wciąż kieruje wnioskowanie przez swoje serwery, loguje Twoje prompty i może stosować limity przepustowości.</li>
      <li><strong>Prawdziwy BYOK</strong> — narzędzie wywołuje dostawcę modelu bezpośrednio z Twojej maszyny (lub Twojej infrastruktury). Twoje prompty nigdy nie trafiają na serwery dostawcy. Dostawca nie pobiera marży.</li>
      </ul>
      <p>Open Design jest tym drugim rodzajem. Daemon wykonuje wywołania HTTP do dowolnego skonfigurowanego endpointu, z Twoim kluczem, z Twojej maszyny. Nie pośredniczymy. Nie logujemy. Nie widzimy Twoich promptów.</p>
      <h3>Gdzie naprawdę trafia wywołanie</h3>
      <p>Gdy daemon podejmuje zadanie, komponuje prompt — wciągając odpowiednie pliki <code>SKILL.md</code> i <code>DESIGN.md</code> dla danego zadania — a następnie wykonuje pojedyncze żądanie HTTP do ustawionego przez Ciebie base URL. Odpowiedź strumieniuje z powrotem na Twoją maszynę, agent zapisuje artefakt na dysk i to cała pętla. Na tej ścieżce nie ma żadnego serwera Open Design. Ten sam daemon, który odkrywa Twoje umiejętności, jest też właścicielem wywołania sieciowego, dlatego „gdzie to działa?” jest ustawieniem, a nie rozmową handlową.</p>
      <h2>Adapter zgodny z OpenAI</h2>
      <p>Większość endpointów wnioskowania AI w 2026 roku mówi w API OpenAI Chat Completions. Używamy go jako protokołu o najmniejszym wspólnym mianowniku. Jeśli Twój dostawca nim mówi (a niemal wszyscy mówią), jesteś obsługiwany domyślnie — żadnej wtyczki, żadnej integracji per dostawca, na którą trzeba czekać.</p>
      <h3>Dostawcy, których możesz wskazać</h3>













































      <table><thead><tr><th>Dostawca</th><th>Typowy kształt base URL</th><th>Dobry do</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, najmocniejsze ogólne przebiegi</td></tr><tr><td>Anthropic</td><td>shim zgodności z OpenAI lub dedykowany adapter Claude</td><td>dopracowanie wymagające gustu, długie briefy</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>opłacalne kosztowo szkice z długim kontekstem</td></tr><tr><td>Groq</td><td>base URL dostawcy</td><td>cykle szkicowe o niskiej latencji</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>dowolny czołowy model, jedna relacja rozliczeniowa</td></tr><tr><td>Self-hosted vLLM / TGI / Ollama</td><td>Twój własny host, np. <code>http://localhost:11434/v1</code></td><td>w pełni lokalna, poufna praca dla klienta</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL dostawcy</td><td>modele regionalne z endpointami zgodnymi z OAI</td></tr></tbody></table>
      <p>Ta lista nie jest zakodowaną na sztywno listą dozwolonych — to po prostu miejsca, w których ludzie zwykle lądują. Wszystko, co odpowiada na kształt Chat Completions, działa.</p>
      <h3>Dwa pola, potem restart</h3>
      <p>Konfiguracja to dwa pola:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Wrzuć je do <code>.env.local</code>, zrestartuj daemon i jesteś na innym modelu. Przełączenie się na lokalną maszynę z Ollama dla wrażliwego projektu to te same dwie linie:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Nie ma rejestru modeli do aktualizacji, konta do ponownego połączenia ani migracji. Klucz i endpoint to cała powierzchnia.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Pojedynczy klucz podłączony do rzędu trzech wymiennych silników modeli, środkowy zaznaczony zieloną ramką, na niemal białym, redakcyjnym tle">
        <figcaption>Jeden klucz, dowolny model — adapter sprawia, że Claude, Codex i Qwen są wymienne w ramach tego samego workflow.</figcaption>
      </figure>
      <h2>Dlaczego to ma znaczenie dla pracy projektowej</h2>
      <p>Workflow projektowe mają specyficzny kształt kosztów, z którym produkty z hostowanym wnioskowaniem radzą sobie źle:</p>
      <ol>
      <li><strong>Iteracja jest jednostką pracy.</strong> Prawdziwy przebieg projektowy oznacza 30–50 cykli promptów, a nie trzy. Hostowane plany mocno dławią przy granicy 50 cykli.</li>
      <li><strong>Długi kontekst jest normą.</strong> Poważny brief obejmuje dokumenty marki, wcześniejsze prace, specyfikacje systemu i materiały referencyjne. Ten kontekst przekracza budżety tokenów w hostowanych interfejsach.</li>
      <li><strong>Wybór modelu powinien być doraźny.</strong> Niektóre przebiegi chcą szybkiego, taniego modelu. Niektóre chcą najmocniejszego dostępnego. Niektóre chcą lokalnego modelu dla wrażliwych treści. Hostowany produkt wybiera jeden za Ciebie.</li>
      </ol>
      <p>BYOK naprawia wszystkie trzy. Płacisz za token, wybierasz model, nie jesteś dławiony.</p>
      <h3>Iteracja przestaje być racjonowana</h3>
      <p>To ta jedna rzecz, która po cichu zmienia sposób, w jaki pracujesz. Gdy każdy dodatkowy cykl jest odliczany od planu, zaczynasz cenzurować samego siebie — bierzesz trzeci szkic, bo czwarty wydaje się drogi. Przy BYOK koszt krańcowy jednego dodatkowego przebiegu to kilka centów u dostawcy modelu, więc decyzja znów dotyczy pracy, a nie licznika. Trzeci szkic to zwykle moment, w którym projekt staje się dobry; narzędzie, które opodatkowuje iterację, opodatkowuje dokładnie ten krok, który ma znaczenie.</p>
      <h2>A co z kosztami?</h2>
      <p>Częsta obawa: „Jeśli płacę bezpośrednio, czy nie będzie drożej?”</p>
      <p>W praktyce — nie. Oto typowy dzień pracy projektowej w naszym wewnętrznym użyciu:</p>









































      <table><thead><tr><th>Zadanie</th><th>Tokeny</th><th>Dostawca</th><th>Koszt</th></tr></thead><tbody><tr><td>Przyjęcie briefu (3 dokumenty)</td><td>30K wejścia</td><td>Claude Sonnet</td><td>$0,09</td></tr><tr><td>Przebieg pierwszego szkicu</td><td>80K wejścia + 20K wyjścia</td><td>Claude Sonnet</td><td>$0,54</td></tr><tr><td>5 cykli iteracji</td><td>250K wejścia + 80K wyjścia</td><td>Claude Sonnet</td><td>$1,95</td></tr><tr><td>Finalne dopracowanie</td><td>50K wejścia + 30K wyjścia</td><td>Claude Opus (jeden przebieg)</td><td>$1,35</td></tr><tr><td><strong>Suma dzienna</strong></td><td></td><td></td><td><strong>~$3,93</strong></td></tr></tbody></table>
      <p>To prezentacja, dwa warianty landing page'a i eksploracja marki. Hostowany odpowiednik — zakładając plan „creator” za $30/miesiąc z opłatami za przekroczenie — kosztowałby około $50 za tę samą pracę, dałby mniej iteracji i zamknąłby Cię w jednym modelu.</p>
      <p>Jeśli chcesz taniej, zamień Claude Sonnet na DeepSeek V3.2, a dzień spadnie poniżej $1. Nie chodzi o to, że jeden model jest właściwy — chodzi o to, że pokrętło ceny/jakości jest w Twoich rękach, a nie wbudowane w poziom subskrypcji.</p>
      <h2>Prywatność i zgodność</h2>
      <p>Jest drugi powód, dla którego BYOK ma znaczenie: <strong>prompty zawierają markę Twojego klienta.</strong></p>
      <p>Hostowane wnioskowanie oznacza przekazywanie dokumentów marki, nieogłoszonych nazw produktów, wewnętrznych cen i kreacji sprzed premiery przez serwery strony trzeciej. Większość firm ma na ten temat zdanie. Niektóre mają na to umowę.</p>
      <p>Przy BYOK podróż promptu w obie strony odbywa się między Twoim laptopem a dostawcą modelu, którego już sprawdziłeś (lub hostujesz samodzielnie). Open Design nie bierze w tym udziału. Nie mamy żadnego logu do wezwania sądowego, żadnej powierzchni naruszenia, z której coś by wyciekło, żadnej luki audytowej do wyjaśnienia.</p>
      <h3>Co w praktyce daje Ci „brak logów”</h3>
      <p>Dla pracy agencyjnej, branż regulowanych lub czegokolwiek sprzed premiery to jedyne stanowisko, które się broni. Jeśli przegląd bezpieczeństwa pyta „dokąd trafiają nasze zasoby marki?”, odpowiedź brzmi „do dostawcy modelu w naszej umowie i nigdzie indziej” — a nie „do dashboardu dostawcy, którego nie kontrolujemy”. Samodzielne hostowanie endpointu Ollama lub vLLM zacieśnia to jeszcze bardziej: bajty w ogóle nie opuszczają Twojej sieci. To ten sam kompromis omawiany w <a href="/blog/byok-reality-check-5-things-that-break/">teście rzeczywistości BYOK</a>, który uczciwie mówi, gdzie wciąż są chropowate krawędzie — modele lokalne i czołowe nie są wymienne pod względem gustu, a powierzchnię prompt injection posiadasz sam.</p>
      <h2>Jak zmienić dostawcę w trakcie projektu</h2>
      <p>Jedną z niedocenianych korzyści BYOK jest arbitraż dostawców w trakcie projektu:</p>
      <ul>
      <li><strong>Szkicowanie</strong> — użyj taniego modelu (DeepSeek V3.2, Qwen 3) na formularzu pytań i pierwszej iteracji</li>
      <li><strong>Dopracowanie</strong> — przełącz się na Claude Sonnet lub GPT-5 dla środkowych przebiegów, gdzie liczy się gust</li>
      <li><strong>Wrażliwe treści</strong> — zamień na lokalny model Ollama dla promptów poufnych dla klienta</li>
      <li><strong>Finalne dopracowanie</strong> — spal jeden przebieg na najmocniejszym dostępnym modelu (Opus, GPT-5 Pro)</li>
      </ul>
      <p>W Open Design przełączenie to edycja dwóch linii w <code>.env.local</code>. Nie ma migracji, ponownego wdrażania ani aktualizacji planu.</p>
      <h3>Rozpisany routing dla jednego briefu</h3>
      <p>Konkretnie, pojedynczy brief landing page'a mógłby przebiegać tak:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Te same umiejętności, ten sam system projektowy na dysku, te same artefakty — zmienił się tylko silnik stojący za workflow. Ponieważ umiejętności i systemy to po prostu pliki (<code>SKILL.md</code> i <code>DESIGN.md</code>), nic w Twojej konfiguracji nie jest przywiązane do konkretnego modelu. To właśnie znaczy posiadanie workflow: narzędzie schodzi z drogi, a model jest parametrem, który zmieniasz zależnie od wymagań briefu.</p>
      <h2>Wypróbuj</h2>
      <p>Sklonuj repozytorium, ustaw <code>OPENAI_BASE_URL</code> i <code>OPENAI_API_KEY</code> w <code>.env.local</code>, uruchom <code>pnpm tools-dev</code>. Daemon użyje dowolnego endpointu, który mu wskażesz, z dowolnym modelem, za który płacisz, w dowolnym rytmie, jakiego chcesz.</p>
      <p>To cała historia BYOK. Nie ma specjalnego poziomu, procesu aktualizacji ani relacji rozliczeniowej z nami. Płacisz dostawcy modelu, zachowujesz swoje klucze, zachowujesz swoje prompty. My dostarczamy warstwę.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — zakład stojący za dostarczeniem cienkiej warstwy zamiast hostowanej aplikacji</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Test rzeczywistości BYOK: 5 rzeczy, które się psują</a> — uczciwe kompromisy i chropowate krawędzie przynoszenia własnego klucza</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy: jak działa biblioteka Open Design</a> — pliki <code>SKILL.md</code> / <code>DESIGN.md</code>, które pozostają stałe niezależnie od tego, który model uruchamiasz</li>
      </ul>
  id:
    title: "Alur kerja desain BYOK: jalankan Claude, Codex, atau Qwen dengan key Anda sendiri"
    summary: "Sebagian besar tool desain AI diam-diam menambahkan margin pada setiap token yang Anda keluarkan. Open Design mengambil sikap sebaliknya — bawa key model Anda sendiri, bayar langsung ke penyedia, dan pertahankan kontrol penuh atas tempat inferensi berjalan. Berikut cara kerja lapisan BYOK yang sebenarnya."
    bodyHtml: |
      <p>Jika Anda pernah memakai produk desain AI berbasis hosting pada tahun 2026, Anda mungkin sudah menyadari tagihan yang terus merangkak naik. Langganan di atas biaya per kursi, ditumpuk lagi di atas markup inferensi yang tidak pernah dipublikasikan siapa pun. Matematikanya sengaja dibuat tidak transparan.</p>
      <p>Open Design tidak menjalankan inferensi. Kami tidak mengambil margin atas token. Seluruh alur kerja dibangun di sekitar <strong>bring-your-own-key (BYOK)</strong> — Anda mengarahkan daemon ke endpoint apa pun yang kompatibel dengan OpenAI, menempelkan API key Anda sendiri, dan selesai.</p>
      <p>Tulisan ini menjelaskan mengapa kami membuat pilihan itu, bagaimana cara kerjanya di balik layar, dan apa yang sebenarnya berubah dalam alur kerja sehari-hari Anda. Jika Anda ingin argumen filosofis yang lebih besar di baliknya, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> adalah tulisan pendampingnya — yang ini adalah versi praktiknya.</p>
      <h2>Apa arti “BYOK” yang sebenarnya di sini</h2>
      <p>Ada dua definisi BYOK yang beredar di ruang tooling AI, dan keduanya bukan hal yang sama:</p>
      <ul>
      <li><strong>BYOK permukaan</strong> — tool mengizinkan Anda menempelkan key, tetapi tetap merutekan inferensi melalui server mereka, mencatat prompt Anda, dan mungkin menerapkan batas laju.</li>
      <li><strong>BYOK sejati</strong> — tool memanggil penyedia model secara langsung dari mesin Anda (atau infrastruktur Anda). Prompt Anda tidak pernah menyentuh server vendor. Vendor tidak mengambil margin.</li>
      </ul>
      <p>Open Design adalah jenis yang kedua. Daemon melakukan panggilan HTTP ke endpoint mana pun yang Anda konfigurasikan, dengan key Anda, dari mesin Anda. Kami tidak menjadi proxy. Kami tidak mencatat. Kami tidak melihat prompt Anda.</p>
      <h3>Ke mana panggilan itu sebenarnya pergi</h3>
      <p>Ketika daemon mengambil sebuah job, ia menyusun prompt — menarik file <code>SKILL.md</code> dan <code>DESIGN.md</code> yang relevan untuk tugas tersebut — lalu melakukan satu permintaan HTTP ke base URL yang Anda atur. Respons mengalir kembali ke mesin Anda, agent menulis artefak ke disk, dan itulah keseluruhan loop-nya. Tidak ada server Open Design di jalurnya. Daemon yang sama yang menemukan skill Anda juga yang memiliki panggilan jaringan tersebut, itulah sebabnya “di mana ini berjalan?” adalah sebuah pengaturan dan bukan percakapan penjualan.</p>
      <h2>Adapter yang kompatibel dengan OpenAI</h2>
      <p>Sebagian besar endpoint inferensi AI pada tahun 2026 berbicara dengan OpenAI Chat Completions API. Kami menggunakannya sebagai protokol penyebut terkecil yang sama. Jika penyedia Anda berbicara dengannya (dan hampir semuanya begitu), Anda didukung secara default — tanpa plugin, tanpa integrasi per-penyedia yang harus ditunggu.</p>
      <h3>Penyedia yang bisa Anda arahkan</h3>













































      <table><thead><tr><th>Penyedia</th><th>Bentuk base URL umum</th><th>Cocok untuk</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, lintasan umum terkuat</td></tr><tr><td>Anthropic</td><td>shim kompatibel OpenAI, atau adapter Claude khusus</td><td>penyempurnaan yang menuntut selera, brief panjang</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>penyusunan draf konteks panjang yang hemat biaya</td></tr><tr><td>Groq</td><td>base URL penyedia</td><td>siklus draf latensi rendah</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>model frontier apa pun, satu hubungan penagihan</td></tr><tr><td>vLLM / TGI / Ollama yang di-host sendiri</td><td>host Anda sendiri, mis. <code>http://localhost:11434/v1</code></td><td>sepenuhnya lokal, pekerjaan rahasia klien</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base URL penyedia</td><td>model regional dengan endpoint kompatibel OAI</td></tr></tbody></table>
      <p>Daftar ini bukan allowlist yang di-hard-code — ini hanya tempat orang umumnya mendarat. Apa pun yang menjawab bentuk Chat Completions akan berfungsi.</p>
      <h3>Dua kolom, lalu restart</h3>
      <p>Konfigurasinya adalah dua kolom:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Letakkan keduanya di <code>.env.local</code>, restart daemon, dan Anda sudah berada pada model yang berbeda. Beralih ke kotak Ollama lokal untuk proyek yang sensitif sama saja dengan dua baris ini:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Tidak ada registri model yang harus diperbarui, tidak ada akun yang harus dihubungkan ulang, tidak ada migrasi. Key dan endpoint adalah keseluruhan permukaannya.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Satu key yang terhubung ke deretan tiga mesin model yang dapat dipertukarkan, yang di tengah terpilih dalam bingkai hijau, di atas latar editorial nyaris putih">
        <figcaption>Satu key, model apa pun — adapter membuat Claude, Codex, dan Qwen dapat dipertukarkan di balik alur kerja yang sama.</figcaption>
      </figure>
      <h2>Mengapa ini penting untuk pekerjaan desain</h2>
      <p>Alur kerja desain memiliki bentuk biaya khusus yang tidak ditangani dengan baik oleh produk inferensi berbasis hosting:</p>
      <ol>
      <li><strong>Iterasi adalah unit kerja.</strong> Sebuah lintasan desain yang sungguhan berarti 30–50 siklus prompt, bukan tiga. Paket hosting membatasi dengan keras pada batas 50 siklus.</li>
      <li><strong>Konteks panjang adalah hal yang lumrah.</strong> Sebuah brief serius melibatkan dokumen merek, pekerjaan sebelumnya, spesifikasi sistem, dan citra referensi. Konteks itu melampaui anggaran token di UI berbasis hosting.</li>
      <li><strong>Pemilihan model seharusnya bersifat ad-hoc.</strong> Beberapa lintasan membutuhkan model yang cepat dan murah. Beberapa membutuhkan yang terkuat yang tersedia. Beberapa membutuhkan model lokal untuk konten sensitif. Produk berbasis hosting memilihkannya untuk Anda.</li>
      </ol>
      <p>BYOK memperbaiki ketiganya. Anda membayar per token, Anda memilih model, Anda tidak dibatasi.</p>
      <h3>Iterasi berhenti dijatah</h3>
      <p>Inilah yang diam-diam mengubah cara Anda bekerja. Ketika setiap siklus tambahan diukur terhadap sebuah paket, Anda mulai menyensor diri sendiri — Anda mengambil draf ketiga karena draf keempat terasa mahal. Pada BYOK biaya marginal dari satu lintasan tambahan adalah beberapa sen di penyedia model, jadi keputusannya kembali tentang pekerjaan, bukan tentang meterannya. Draf ketiga biasanya adalah tempat desain menjadi bagus; sebuah tool yang memajaki iterasi sedang memajaki langkah yang justru penting.</p>
      <h2>Bagaimana dengan biaya?</h2>
      <p>Kekhawatiran yang umum: “Jika saya membayar langsung, bukankah akan lebih mahal?”</p>
      <p>Dalam praktiknya, tidak. Berikut adalah satu hari pekerjaan desain yang khas dalam penggunaan internal kami:</p>









































      <table><thead><tr><th>Tugas</th><th>Token</th><th>Penyedia</th><th>Biaya</th></tr></thead><tbody><tr><td>Penerimaan brief (3 dokumen)</td><td>30K input</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>Lintasan draf pertama</td><td>80K input + 20K output</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 siklus iterasi</td><td>250K input + 80K output</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>Pemolesan akhir</td><td>50K input + 30K output</td><td>Claude Opus (satu lintasan)</td><td>$1.35</td></tr><tr><td><strong>Total hari</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>Itu adalah sebuah deck, dua varian landing, dan satu eksplorasi merek. Padanan berbasis hosting — dengan asumsi paket “creator” seharga $30/bulan dengan biaya kelebihan pemakaian — akan menghabiskan sekitar $50 untuk pekerjaan yang sama, memberi Anda lebih sedikit iterasi, dan mengunci Anda ke satu model.</p>
      <p>Jika Anda ingin lebih hemat, ganti Claude Sonnet dengan DeepSeek V3.2 dan biaya satu harinya turun di bawah $1. Intinya bukan bahwa satu model itu benar — intinya adalah tombol harga/kualitas ada di tangan Anda alih-alih sudah terpatok di dalam tingkatan langganan.</p>
      <h2>Privasi dan kepatuhan</h2>
      <p>Ada alasan kedua mengapa BYOK penting: <strong>prompt berisi merek klien Anda.</strong></p>
      <p>Inferensi berbasis hosting berarti merutekan dokumen merek, nama produk yang belum diumumkan, harga internal, dan kreatif pra-peluncuran melalui server pihak ketiga. Sebagian besar perusahaan punya pendapat soal itu. Sebagian punya kontrak soal itu.</p>
      <p>Dengan BYOK, perjalanan bolak-balik prompt terjadi antara laptop Anda dan penyedia model yang sudah Anda periksa (atau yang Anda host sendiri). Open Design tidak berada dalam loop. Kami tidak punya log untuk dipanggil pengadilan, tidak punya permukaan kebocoran untuk membocorkan, tidak punya celah audit untuk dijelaskan.</p>
      <h3>Apa yang dibeli oleh “tanpa log” dalam praktiknya</h3>
      <p>Untuk pekerjaan agensi, industri yang teregulasi, atau apa pun yang pra-peluncuran, ini adalah satu-satunya sikap yang bertahan. Jika sebuah tinjauan keamanan bertanya “ke mana aset merek kami pergi?”, jawabannya adalah “ke penyedia model dalam kontrak kami, dan tidak ke tempat lain” — bukan “ke dasbor vendor yang tidak kami kendalikan.” Meng-host sendiri endpoint Ollama atau vLLM mengencangkannya lebih jauh: byte-nya sama sekali tidak pernah meninggalkan jaringan Anda. Ini adalah trade-off yang sama yang dibahas dalam <a href="/blog/byok-reality-check-5-things-that-break/">pemeriksaan realitas BYOK</a>, yang jujur tentang di mana sisi kasarnya masih berada — model lokal dan model frontier tidak dapat dipertukarkan dalam hal selera, dan Anda memiliki sendiri permukaan injeksi prompt.</p>
      <h2>Cara berpindah penyedia di tengah proyek</h2>
      <p>Salah satu manfaat BYOK yang kurang diapresiasi adalah arbitrase penyedia selama sebuah proyek:</p>
      <ul>
      <li><strong>Penyusunan draf</strong> — gunakan model murah (DeepSeek V3.2, Qwen 3) pada formulir pertanyaan dan iterasi pertama</li>
      <li><strong>Penyempurnaan</strong> — beralih ke Claude Sonnet atau GPT-5 untuk lintasan tengah tempat selera berperan</li>
      <li><strong>Konten sensitif</strong> — beralih ke model Ollama lokal untuk prompt yang rahasia bagi klien</li>
      <li><strong>Pemolesan akhir</strong> — habiskan satu lintasan pada model terkuat yang tersedia (Opus, GPT-5 Pro)</li>
      </ul>
      <p>Di Open Design, beralih berarti mengedit dua baris di <code>.env.local</code>. Tidak ada migrasi, tidak ada onboarding ulang, tidak ada upgrade paket.</p>
      <h3>Contoh perutean nyata untuk satu brief</h3>
      <p>Secara konkret, satu brief landing-page mungkin berjalan seperti ini:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Skill yang sama, sistem desain yang sama di disk, artefak yang sama — hanya mesin di balik alur kerja yang berubah. Karena skill dan sistem hanyalah file (<code>SKILL.md</code> dan <code>DESIGN.md</code>), tidak ada bagian dari pengaturan Anda yang terikat pada model tertentu. Inilah arti sebenarnya dari memiliki alur kerja: tool-nya menyingkir, dan model menjadi parameter yang Anda ubah sesuai tuntutan brief.</p>
      <h2>Cobalah</h2>
      <p>Klon repo, atur <code>OPENAI_BASE_URL</code> dan <code>OPENAI_API_KEY</code> di <code>.env.local</code>, jalankan <code>pnpm tools-dev</code>. Daemon akan menggunakan endpoint apa pun yang Anda arahkan, dengan model apa pun yang Anda bayar, pada jadwal apa pun yang Anda inginkan.</p>
      <p>Itulah keseluruhan cerita BYOK. Tidak ada tingkatan khusus, tidak ada alur upgrade, tidak ada hubungan penagihan dengan kami. Anda membayar penyedia model, Anda menyimpan key Anda, Anda menyimpan prompt Anda. Kami menyediakan lapisannya.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> — taruhan di balik pengiriman lapisan tipis alih-alih aplikasi berbasis hosting</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Pemeriksaan realitas BYOK: 5 hal yang rusak</a> — trade-off jujur dan sisi-sisi kasar dari membawa key Anda sendiri</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistem: cara kerja pustaka Open Design</a> — file <code>SKILL.md</code> / <code>DESIGN.md</code> yang tetap konstan tidak peduli model mana yang Anda jalankan</li>
      </ul>
  nl:
    title: "BYOK-ontwerpworkflow: draai Claude, Codex of Qwen op je eigen sleutel"
    summary: "De meeste AI-ontwerptools tellen stilletjes een marge op bij elk token dat je uitgeeft. Open Design neemt het tegenovergestelde standpunt in — breng je eigen modelsleutel mee, betaal de provider rechtstreeks en houd volledige controle over waar inferentie draait. Zo werkt de BYOK-laag echt."
    bodyHtml: |
      <p>Als je in 2026 een gehost AI-ontwerpproduct hebt gebruikt, is het je waarschijnlijk opgevallen dat de rekening steeds hoger wordt. Een abonnement bovenop een tarief per stoel, gestapeld op een inferentie-opslag die niemand publiceert. De rekensom is opzettelijk ondoorzichtig.</p>
      <p>Open Design draait geen inferentie. We hebben geen marge op tokens. De hele workflow is opgebouwd rond <strong>bring-your-own-key (BYOK)</strong> — je richt de daemon op elk OpenAI-compatibel endpoint, plakt je eigen API-sleutel en je bent klaar.</p>
      <p>Dit bericht legt uit waarom we die keuze hebben gemaakt, hoe het onder de motorkap werkt en wat het daadwerkelijk verandert in je dagelijkse workflow. Als je het grotere filosofische argument erachter wilt, dan is <a href="/blog/why-we-built-open-design-as-a-skill-layer/">waarom we Open Design als een skill-laag bouwden, niet als een product</a> het bijbehorende stuk — dit is de praktische versie.</p>
      <h2>Wat “BYOK” hier echt betekent</h2>
      <p>Er zijn twee definities van BYOK die rondzweven in de wereld van AI-tooling, en ze zijn niet hetzelfde:</p>
      <ul>
      <li><strong>Oppervlakkige BYOK</strong> — de tool laat je een sleutel plakken, maar routeert inferentie nog steeds via hun servers, logt je prompts en past mogelijk rate limits toe.</li>
      <li><strong>Echte BYOK</strong> — de tool roept de modelprovider rechtstreeks aan vanaf jouw machine (of jouw infrastructuur). Je prompts raken nooit de servers van de leverancier. De leverancier neemt geen marge.</li>
      </ul>
      <p>Open Design is de tweede soort. De daemon maakt HTTP-aanroepen naar het endpoint dat jij configureert, met jouw sleutel, vanaf jouw machine. Wij proxyen niet. Wij loggen niet. Wij zien je prompts niet.</p>
      <h3>Waar de aanroep daadwerkelijk heen gaat</h3>
      <p>Wanneer de daemon een taak oppakt, stelt hij de prompt samen — door de relevante <code>SKILL.md</code>- en <code>DESIGN.md</code>-bestanden voor de taak op te halen — en doet vervolgens één HTTP-verzoek naar de base-URL die jij instelt. De respons stroomt terug naar jouw machine, de agent schrijft het artefact naar schijf, en dat is de hele lus. Er staat geen Open Design-server in het pad. Dezelfde daemon die je skills ontdekt, beheert ook de netwerkaanroep, en daarom is “waar draait dit?” een instelling en geen verkoopgesprek.</p>
      <h2>De OpenAI-compatibele adapter</h2>
      <p>De meeste AI-inferentie-endpoints in 2026 spreken de OpenAI Chat Completions API. We gebruiken dat als het laagste-gemene-deler-protocol. Als jouw provider het spreekt (en bijna allemaal doen ze dat), word je standaard ondersteund — geen plugin, geen integratie per provider om op te wachten.</p>
      <h3>Providers waar je het op kunt richten</h3>




















































      <table><thead><tr><th>Provider</th><th>Typische vorm van base-URL</th><th>Goed voor</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, sterkste algemene passes</td></tr><tr><td>Anthropic</td><td>OpenAI-compat shim, of de speciale Claude-adapter</td><td>verfijning waar smaak telt, lange briefings</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>kostenefficiënt schrijven met lange context</td></tr><tr><td>Groq</td><td>base-URL van de provider</td><td>concept-cycli met lage latentie</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>elk frontier-model, één facturatierelatie</td></tr><tr><td>Zelf-gehoste vLLM / TGI / Ollama</td><td>je eigen host, bijv. <code>http://localhost:11434/v1</code></td><td>volledig lokaal, client-vertrouwelijk werk</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>base-URL van de provider</td><td>regionale modellen met OAI-compatibele endpoints</td></tr></tbody></table>
      <p>De lijst is geen hard-gecodeerde allowlist — het is gewoon waar mensen meestal belanden. Alles dat de Chat Completions-vorm beantwoordt, werkt.</p>
      <h3>Twee velden, dan opnieuw opstarten</h3>
      <p>Configuratie bestaat uit twee velden:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Zet ze in <code>.env.local</code>, herstart de daemon, en je draait op een ander model. Overschakelen naar een lokale Ollama-machine voor een gevoelig project is dezelfde twee regels:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Er is geen modelregister om bij te werken, geen account om opnieuw te koppelen, geen migratie. De sleutel en het endpoint vormen het hele oppervlak.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Eén sleutel bedraad naar een rij van drie verwisselbare modelmotoren, met de middelste geselecteerd in een groen kader, op een bijna-witte redactionele achtergrond">
        <figcaption>Eén sleutel, elk model — de adapter maakt Claude, Codex en Qwen onderling verwisselbaar achter dezelfde workflow.</figcaption>
      </figure>
      <h2>Waarom dit belangrijk is voor ontwerpwerk</h2>
      <p>Ontwerpworkflows hebben een specifieke kostenvorm waar producten met gehoste inferentie slecht mee omgaan:</p>
      <ol>
      <li><strong>Iteratie is de werkeenheid.</strong> Een echte ontwerppass betekent 30–50 promptcycli, geen drie. Gehoste plannen knijpen hard af bij de grens van 50 cycli.</li>
      <li><strong>Lange context is de norm.</strong> Een serieuze briefing omvat merkdocumenten, eerder werk, systeemspecificaties en referentiebeelden. Die context blaast door de tokenbudgetten in gehoste UI's heen.</li>
      <li><strong>Modelkeuze moet ad-hoc zijn.</strong> Sommige passes willen een snel, goedkoop model. Sommige willen het sterkste dat beschikbaar is. Sommige willen een lokaal model voor gevoelige inhoud. Een gehost product kiest er één voor je.</li>
      </ol>
      <p>BYOK lost alle drie op. Je betaalt per token, je kiest het model, je wordt niet afgeknepen.</p>
      <h3>Iteratie wordt niet langer gerantsoeneerd</h3>
      <p>Dit is degene die stilletjes verandert hoe je werkt. Wanneer elke extra cyclus wordt afgemeten tegen een plan, ga je jezelf censureren — je neemt het derde concept omdat het vierde duur aanvoelt. Met BYOK zijn de marginale kosten van nog één pass een paar cent bij de modelprovider, dus de beslissing gaat weer over het werk en niet over de meter. Het derde concept is meestal waar het ontwerp goed wordt; een tool die iteratie belast, belast precies de stap die ertoe doet.</p>
      <h2>En de kosten dan?</h2>
      <p>Een veelvoorkomende zorg: “Als ik rechtstreeks betaal, wordt het dan niet duurder?”</p>
      <p>In de praktijk niet. Hier is een typische dag ontwerpwerk in ons interne gebruik:</p>






































      <table><thead><tr><th>Taak</th><th>Tokens</th><th>Provider</th><th>Kosten</th></tr></thead><tbody><tr><td>Briefing verwerken (3 documenten)</td><td>30K input</td><td>Claude Sonnet</td><td>$0,09</td></tr><tr><td>Eerste conceptpass</td><td>80K input + 20K output</td><td>Claude Sonnet</td><td>$0,54</td></tr><tr><td>5 iteratiecycli</td><td>250K input + 80K output</td><td>Claude Sonnet</td><td>$1,95</td></tr><tr><td>Laatste afwerking</td><td>50K input + 30K output</td><td>Claude Opus (één pass)</td><td>$1,35</td></tr><tr><td><strong>Dagtotaal</strong></td><td></td><td></td><td><strong>~$3,93</strong></td></tr></tbody></table>
      <p>Dat is een deck, twee landingsvarianten en een merkverkenning. Het gehoste equivalent — uitgaande van een “creator”-plan van $30/maand met overschrijdingskosten — zou ongeveer $50 kosten voor hetzelfde werk, je minder iteraties geven en je vastzetten aan één model.</p>
      <p>Als je goedkoper wilt, vervang dan Claude Sonnet door DeepSeek V3.2 en de dag zakt onder de $1. Het punt is niet dat één model het juiste is — het is dat de prijs/kwaliteit-knop in jouw handen ligt in plaats van ingebakken in een abonnementsniveau.</p>
      <h2>Privacy en compliance</h2>
      <p>Er is een tweede reden waarom BYOK belangrijk is: <strong>de prompts bevatten het merk van je klant.</strong></p>
      <p>Gehoste inferentie betekent dat je merkdocumenten, niet-aangekondigde productnamen, interne prijzen en pre-launch-creatief door de servers van een derde partij routeert. De meeste bedrijven hebben daar een mening over. Sommige hebben er een contract over.</p>
      <p>Met BYOK is de heen-en-terugreis van de prompt tussen jouw laptop en de modelprovider die je al hebt gescreend (of zelf hebt gehost). Open Design zit niet in de lus. We hebben geen log om te dagvaarden, geen aanvalsoppervlak voor datalekken, geen auditgat om uit te leggen.</p>
      <h3>Wat “geen log” je in de praktijk oplevert</h3>
      <p>Voor bureauwerk, gereguleerde sectoren of alles wat pre-launch is, is dit het enige standpunt dat standhoudt. Als een beveiligingsreview vraagt “waar gaan onze merkmiddelen heen?”, dan is het antwoord “naar de modelprovider in ons contract, en nergens anders” — niet “naar een leveranciersdashboard waar we geen controle over hebben.” Het zelf hosten van een Ollama- of vLLM-endpoint maakt het nog strakker: de bytes verlaten je netwerk helemaal niet. Dit is dezelfde afweging die wordt onderzocht in <a href="/blog/byok-reality-check-5-things-that-break/">de BYOK-realiteitscheck</a>, die eerlijk is over waar de ruwe randjes nog zitten — lokale modellen en frontier-modellen zijn niet onderling verwisselbaar wat smaak betreft, en je bezit het prompt-injectie-oppervlak zelf.</p>
      <h2>Hoe je halverwege een project van provider wisselt</h2>
      <p>Een van de ondergewaardeerde voordelen van BYOK is provider-arbitrage tijdens een project:</p>
      <ul>
      <li><strong>Concept opstellen</strong> — gebruik een goedkoop model (DeepSeek V3.2, Qwen 3) voor het vragenformulier en de eerste iteratie</li>
      <li><strong>Verfijning</strong> — schakel over naar Claude Sonnet of GPT-5 voor de middelste passes waar smaak telt</li>
      <li><strong>Gevoelige inhoud</strong> — wissel naar een lokaal Ollama-model voor client-vertrouwelijke prompts</li>
      <li><strong>Laatste afwerking</strong> — besteed één pass aan het sterkste beschikbare model (Opus, GPT-5 Pro)</li>
      </ul>
      <p>In Open Design is wisselen het bewerken van twee regels in <code>.env.local</code>. Er is geen migratie, geen heronboarding, geen plan-upgrade.</p>
      <h3>Een uitgewerkte routing voor één briefing</h3>
      <p>Concreet zou een enkele landingspagina-briefing er zo uit kunnen zien:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Dezelfde skills, hetzelfde designsysteem op schijf, dezelfde artefacten — alleen de motor achter de workflow veranderde. Omdat skills en systemen gewoon bestanden zijn (<code>SKILL.md</code> en <code>DESIGN.md</code>), is niets aan je setup gebonden aan een bepaald model. Dit is wat het bezitten van de workflow daadwerkelijk betekent: de tool gaat uit de weg, en het model is een parameter die je verandert zoals de briefing het vereist.</p>
      <h2>Probeer het</h2>
      <p>Kloon de repo, stel <code>OPENAI_BASE_URL</code> en <code>OPENAI_API_KEY</code> in in <code>.env.local</code>, draai <code>pnpm tools-dev</code>. De daemon gebruikt welk endpoint je er ook op richt, met welk model je ook voor betaalt, op welk schema je ook wilt.</p>
      <p>Dat is het hele BYOK-verhaal. Er is geen speciaal niveau, geen upgrade-flow, geen facturatierelatie met ons. Je betaalt de modelprovider, je houdt je sleutels, je houdt je prompts. Wij leveren de laag.</p>
      <h2>Gerelateerde lectuur</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — de gok achter het leveren van een dunne laag in plaats van een gehoste app</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">De BYOK-realiteitscheck: 5 dingen die stukgaan</a> — de eerlijke afwegingen en ruwe randjes van het meebrengen van je eigen sleutel</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systemen: hoe de Open Design-bibliotheek werkt</a> — de <code>SKILL.md</code>- / <code>DESIGN.md</code>-bestanden die constant blijven, ongeacht welk model je draait</li>
      </ul>
  ar:
    title: "سير عمل التصميم بنظام BYOK: شغّل Claude أو Codex أو Qwen على مفتاحك الخاص"
    summary: "معظم أدوات التصميم بالذكاء الاصطناعي تضيف بهدوء هامش ربح على كل رمز (token) تنفقه. يتخذ Open Design الموقف المعاكس — أحضر مفتاح نموذجك الخاص، وادفع للمزوّد مباشرة، واحتفظ بالتحكم الكامل في مكان تشغيل الاستدلال. وإليك كيف تعمل طبقة BYOK فعليًا."
    bodyHtml: |
      <p>إذا كنت قد استخدمت منتج تصميم بالذكاء الاصطناعي مُستضافًا في عام 2026، فلا بد أنك لاحظت الفاتورة وهي تتسلل نحو الأعلى. اشتراك فوق رسوم لكل مقعد، مُكدّسة فوق هامش استدلال لا يُعلنه أحد. الحسابات غامضة عن قصد.</p>
      <p>لا يُشغّل Open Design الاستدلال. ليس لدينا هامش ربح على الرموز (tokens). سير العمل بأكمله مبني حول مبدأ <strong>أحضر مفتاحك الخاص (BYOK)</strong> — تُوجّه الـ daemon إلى أي نقطة نهاية متوافقة مع OpenAI، وتلصق مفتاح API الخاص بك، وانتهى الأمر.</p>
      <p>تشرح هذه المقالة لماذا اتخذنا هذا الخيار، وكيف يعمل تحت الغطاء، وما الذي يغيّره فعليًا في سير عملك اليومي. وإذا أردت الحجة الفلسفية الأكبر وراءه، فإن مقالة <a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> هي القطعة المُرافقة — وهذه هي النسخة العملية التطبيقية.</p>
      <h2>ما الذي يعنيه «BYOK» حقًا هنا</h2>
      <p>هناك تعريفان لـ BYOK يدوران في فضاء أدوات الذكاء الاصطناعي، وهما ليسا الشيء نفسه:</p>
      <ul>
      <li><strong>BYOK السطحي</strong> — تتيح لك الأداة لصق مفتاح، لكنها لا تزال توجّه الاستدلال عبر خوادمها، وتُسجّل مُحثّاتك (prompts)، وقد تطبّق حدودًا على المعدّل.</li>
      <li><strong>BYOK الحقيقي</strong> — تستدعي الأداة مزوّد النموذج مباشرة من جهازك (أو بنيتك التحتية). مُحثّاتك لا تلمس خوادم المورّد أبدًا. ولا يأخذ المورّد أي هامش ربح.</li>
      </ul>
      <p>Open Design من النوع الثاني. تُجري الـ daemon استدعاءات HTTP إلى أي نقطة نهاية تُعدّها، بمفتاحك، من جهازك. نحن لا نعمل كوكيل (proxy). ولا نُسجّل. ولا نرى مُحثّاتك.</p>
      <h3>إلى أين يذهب الاستدعاء فعليًا</h3>
      <p>عندما تلتقط الـ daemon مهمة، فإنها تُؤلّف المُحثّ — مُستحضرةً ملفات <code>SKILL.md</code> و<code>DESIGN.md</code> ذات الصلة بالمهمة — ثم تُجري طلب HTTP واحدًا إلى عنوان URL الأساسي الذي ضبطته. ترتد الاستجابة كتدفّق إلى جهازك، ويكتب العميل المُخرَج (artifact) إلى القرص، وهذه هي الحلقة بأكملها. لا يوجد خادم Open Design في المسار. الـ daemon نفسها التي تكتشف مهاراتك تمتلك أيضًا استدعاء الشبكة، ولهذا فإن «أين يُشغَّل هذا؟» إعداد وليس محادثة مبيعات.</p>
      <h2>المُحوّل المتوافق مع OpenAI</h2>
      <p>معظم نقاط نهاية الاستدلال بالذكاء الاصطناعي في عام 2026 تتحدث بلغة واجهة OpenAI Chat Completions API. نستخدم ذلك كبروتوكول القاسم المشترك الأدنى. إذا كان مزوّدك يتحدث بها (وكلهم تقريبًا يفعلون)، فأنت مدعوم افتراضيًا — لا إضافة (plugin)، ولا تكامل خاص بكل مزوّد عليك انتظاره.</p>
      <h3>المزوّدون الذين يمكنك توجيهها إليهم</h3>
      <table><thead><tr><th>المزوّد</th><th>الشكل النموذجي لعنوان URL الأساسي</th><th>مناسب لـ</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>، <code>gpt-5.x</code>، أقوى التمريرات العامة</td></tr><tr><td>Anthropic</td><td>طبقة توافق OpenAI، أو مُحوّل Claude المخصّص</td><td>الصقل القائم على الذوق، الملخّصات الطويلة</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>صياغة المسودّات الفعّالة من حيث التكلفة بسياق طويل</td></tr><tr><td>Groq</td><td>عنوان URL الأساسي للمزوّد</td><td>دورات المسودّات منخفضة الكمون</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>أي نموذج رائد، علاقة فوترة واحدة</td></tr><tr><td>الاستضافة الذاتية vLLM / TGI / Ollama</td><td>مُضيفك الخاص، مثل <code>http://localhost:11434/v1</code></td><td>عمل محلي بالكامل، سرّي خاص بالعميل</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>عنوان URL الأساسي للمزوّد</td><td>نماذج إقليمية بنقاط نهاية متوافقة مع OAI</td></tr></tbody></table>
      <p>القائمة ليست قائمة سماح مُثبَّتة في الشيفرة — بل هي فقط حيث يستقرّ الناس عادةً. أي شيء يستجيب لشكل Chat Completions يعمل.</p>
      <h3>حقلان، ثم إعادة التشغيل</h3>
      <p>الإعداد حقلان:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>ضعهما في <code>.env.local</code>، وأعد تشغيل الـ daemon، فتكون على نموذج مختلف. التبديل إلى جهاز Ollama محلي لمشروع حسّاس هو السطران نفسهما:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>لا يوجد سجلّ نماذج لتحديثه، ولا حساب لإعادة ربطه، ولا ترحيل. المفتاح ونقطة النهاية هما السطح بأكمله.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="مفتاح واحد موصول بصفّ من ثلاثة محرّكات نماذج قابلة للتبادل، الأوسط منها محدّد بإطار أخضر، على أرضية تحريرية شبه بيضاء">
        <figcaption>مفتاح واحد، أي نموذج — يجعل المُحوّل من Claude وCodex وQwen قابلة للتبادل خلف سير العمل نفسه.</figcaption>
      </figure>
      <h2>لماذا يهمّ هذا في عمل التصميم</h2>
      <p>لسير عمل التصميم شكل تكلفة محدّد تُبلي فيه منتجات الاستدلال المُستضافة بلاءً سيّئًا:</p>
      <ol>
      <li><strong>التكرار هو وحدة العمل.</strong> تمريرة تصميم حقيقية تعني 30–50 دورة من المُحثّات، لا ثلاثًا. الخطط المُستضافة تخنق بشدّة عند علامة الخمسين دورة.</li>
      <li><strong>السياق الطويل هو القاعدة.</strong> الملخّص الجادّ يتضمّن مستندات العلامة التجارية، والأعمال السابقة، ومواصفات النظام، والصور المرجعية. ذلك السياق يتجاوز ميزانيات الرموز في الواجهات المُستضافة.</li>
      <li><strong>اختيار النموذج يجب أن يكون بحسب الحاجة.</strong> بعض التمريرات تريد نموذجًا سريعًا رخيصًا. وبعضها يريد الأقوى المتاح. وبعضها يريد نموذجًا محليًا للمحتوى الحسّاس. والمنتج المُستضاف يختار لك واحدًا.</li>
      </ol>
      <p>يُصلح BYOK الثلاثة كلها. تدفع لكل رمز، وتختار النموذج، ولا تُخنق.</p>
      <h3>التكرار يتوقّف عن كونه مُقنّنًا</h3>
      <p>هذا هو الأمر الذي يُغيّر بهدوء طريقة عملك. عندما تُحتسب كل دورة إضافية على حساب خطة، تبدأ في فرض رقابة ذاتية — تكتفي بالمسودّة الثالثة لأن الرابعة تبدو مكلفة. مع BYOK، تكلفة التمريرة الإضافية الواحدة هي بضعة سنتات عند مزوّد النموذج، لذا يعود القرار ليكون عن العمل، لا عن العدّاد. المسودّة الثالثة هي عادةً المكان الذي يجود فيه التصميم؛ وأداة تفرض ضريبة على التكرار إنما تفرض الضريبة على الخطوة المهمّة بالضبط.</p>
      <h2>ماذا عن التكلفة؟</h2>
      <p>قلق شائع: «إن كنت أدفع مباشرة، أفلن يكون ذلك أكثر تكلفة؟»</p>
      <p>عمليًا، لا. وإليك يومًا نموذجيًا من عمل التصميم في استخدامنا الداخلي:</p>
      <table><thead><tr><th>المهمة</th><th>الرموز</th><th>المزوّد</th><th>التكلفة</th></tr></thead><tbody><tr><td>استيعاب الملخّص (3 مستندات)</td><td>30 ألف إدخال</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>تمريرة المسودّة الأولى</td><td>80 ألف إدخال + 20 ألف إخراج</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 دورات تكرار</td><td>250 ألف إدخال + 80 ألف إخراج</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>الصقل النهائي</td><td>50 ألف إدخال + 30 ألف إخراج</td><td>Claude Opus (تمريرة واحدة)</td><td>$1.35</td></tr><tr><td><strong>إجمالي اليوم</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>هذا عرض تقديمي، ونسختان من صفحة هبوط، واستكشاف للعلامة التجارية. المُكافئ المُستضاف — بافتراض خطة «مُبدع» بـ 30 دولارًا/شهريًا مع رسوم التجاوز — سيكلّف نحو 50 دولارًا للعمل نفسه، ويمنحك تكرارات أقل، ويقيّدك بنموذج واحد.</p>
      <p>إذا أردت أن تذهب أرخص، استبدل Claude Sonnet بـ DeepSeek V3.2 فينخفض اليوم إلى ما دون الدولار الواحد. المغزى ليس أن نموذجًا واحدًا هو الصواب — بل أن مفتاح السعر/الجودة بين يديك بدلًا من أن يكون مدمجًا في طبقة اشتراك.</p>
      <h2>الخصوصية والامتثال</h2>
      <p>هناك سبب ثانٍ لأهمية BYOK: <strong>المُحثّات تحتوي على علامة عميلك التجارية.</strong></p>
      <p>الاستدلال المُستضاف يعني توجيه مستندات العلامة التجارية، وأسماء منتجات لم تُعلن بعد، والتسعير الداخلي، والأعمال الإبداعية قبل الإطلاق عبر خوادم طرف ثالث. لدى معظم الشركات رأي في ذلك. ولدى بعضها عقد بشأنه.</p>
      <p>مع BYOK، تكون رحلة المُحثّ ذهابًا وإيابًا بين حاسوبك المحمول ومزوّد النموذج الذي سبق أن دقّقت فيه (أو استضفته ذاتيًا). Open Design ليس في الحلقة. ليس لدينا سجلّ يُستدعى قضائيًا، ولا سطح اختراق يتسرّب منه، ولا فجوة تدقيق نُفسّرها.</p>
      <h3>ماذا يشتري لك «لا سجلّ» عمليًا</h3>
      <p>لعمل الوكالات، أو الصناعات المُنظّمة، أو أي شيء قبل الإطلاق، هذا هو الموقف الوحيد الذي يصمد. إذا سألت مراجعة أمنية «إلى أين تذهب أصول علامتنا التجارية؟»، فالجواب هو «إلى مزوّد النموذج في عقدنا، ولا مكان آخر» — لا «إلى لوحة تحكّم مورّد لا نتحكّم بها». استضافة نقطة نهاية Ollama أو vLLM ذاتيًا تُحكِم الأمر أكثر: البايتات لا تغادر شبكتك على الإطلاق. هذه هي المفاضلة نفسها التي تستكشفها <a href="/blog/byok-reality-check-5-things-that-break/">مراجعة الواقع لـ BYOK</a>، وهي صريحة بشأن أين لا تزال الحواف الخشنة — النماذج المحلية والنماذج الرائدة ليست قابلة للتبادل من حيث الذوق، وأنت تمتلك سطح حقن المُحثّات بنفسك.</p>
      <h2>كيف تبدّل المزوّدين في منتصف المشروع</h2>
      <p>من المزايا التي لا تُقدَّر حقّ قدرها في BYOK هي مراجحة المزوّدين أثناء المشروع:</p>
      <ul>
      <li><strong>الصياغة</strong> — استخدم نموذجًا رخيصًا (DeepSeek V3.2، Qwen 3) في استمارة الأسئلة والتكرار الأول</li>
      <li><strong>الصقل</strong> — انتقل إلى Claude Sonnet أو GPT-5 للتمريرات الوسطى حيث يهمّ الذوق</li>
      <li><strong>المحتوى الحسّاس</strong> — بدّل إلى نموذج Ollama محلي للمُحثّات السرّية الخاصة بالعميل</li>
      <li><strong>الصقل النهائي</strong> — أنفق تمريرة واحدة على أقوى نموذج متاح (Opus، GPT-5 Pro)</li>
      </ul>
      <p>في Open Design، التبديل هو تحرير سطرين في <code>.env.local</code>. لا ترحيل، ولا إعادة تأهيل، ولا ترقية خطة.</p>
      <h3>توجيه عملي لملخّص واحد</h3>
      <p>على نحو ملموس، قد يجري ملخّص صفحة هبوط واحدة هكذا:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>المهارات نفسها، نظام التصميم نفسه على القرص، المُخرَجات نفسها — تغيّر المحرّك خلف سير العمل فقط. ولأن المهارات والأنظمة ليست سوى ملفات (<code>SKILL.md</code> و<code>DESIGN.md</code>)، فلا شيء في إعدادك مرتبط بنموذج بعينه. هذا هو ما يعنيه امتلاك سير العمل فعليًا: تبتعد الأداة عن الطريق، ويصبح النموذج مُعاملًا (parameter) تُغيّره وفق ما يقتضيه الملخّص.</p>
      <h2>جرّبه</h2>
      <p>استنسخ المستودع، اضبط <code>OPENAI_BASE_URL</code> و<code>OPENAI_API_KEY</code> في <code>.env.local</code>، وشغّل <code>pnpm tools-dev</code>. ستستخدم الـ daemon أي نقطة نهاية توجّهها إليها، بأي نموذج تدفع مقابله، وفق أي جدول تريده.</p>
      <p>هذه هي قصة BYOK بأكملها. لا طبقة خاصة، ولا تدفّق ترقية، ولا علاقة فوترة معنا. تدفع لمزوّد النموذج، وتحتفظ بمفاتيحك، وتحتفظ بمُحثّاتك. ونحن نوفّر الطبقة.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> — الرهان وراء شحن طبقة رفيعة بدلًا من تطبيق مُستضاف</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">مراجعة الواقع لـ BYOK: 5 أشياء تتعطّل</a> — المفاضلات الصريحة والحواف الخشنة لإحضار مفتاحك الخاص</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة، 72 نظامًا: كيف تعمل مكتبة Open Design</a> — ملفات <code>SKILL.md</code> / <code>DESIGN.md</code> التي تبقى ثابتة بغضّ النظر عن النموذج الذي تُشغّله</li>
      </ul>
  tr:
    title: "BYOK tasarım iş akışı: Claude, Codex veya Qwen'i kendi anahtarınızla çalıştırın"
    summary: "Çoğu yapay zeka tasarım aracı, harcadığınız her token'a sessizce bir kâr payı ekler. Open Design ise tam tersi bir tutum sergiler — kendi model anahtarınızı getirin, doğrudan sağlayıcıya ödeme yapın ve çıkarımın nerede çalıştığı üzerinde tam kontrolü elinizde tutun. İşte BYOK katmanının gerçekte nasıl çalıştığı."
    bodyHtml: |
      <p>2026'da barındırılan bir yapay zeka tasarım ürünü kullandıysanız, faturanın yavaşça arttığını muhtemelen fark etmişsinizdir. Koltuk başına ücretin üzerine bir abonelik, onun da üzerine kimsenin açıklamadığı bir çıkarım kâr marjı. Hesap, bilerek belirsizdir.</p>
      <p>Open Design çıkarım çalıştırmaz. Token'lar üzerinde bir kâr marjımız yok. Tüm iş akışı <strong>bring-your-own-key (BYOK)</strong> etrafında kuruludur — daemon'u OpenAI uyumlu herhangi bir uç noktaya yöneltir, kendi API anahtarınızı yapıştırır ve işiniz biter.</p>
      <p>Bu yazı, bu tercihi neden yaptığımızı, perde arkasında nasıl çalıştığını ve günlük iş akışınızda gerçekte neyi değiştirdiğini açıklıyor. Bunun arkasındaki daha geniş felsefi argümanı isterseniz, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> tamamlayıcı yazıdır — bu ise uygulamaya dönük versiyonudur.</p>
      <h2>"BYOK" burada gerçekte ne anlama geliyor</h2>
      <p>Yapay zeka araç ekosisteminde dolaşan BYOK'un iki tanımı var ve bunlar aynı şey değil:</p>
      <ul>
      <li><strong>Yüzeysel BYOK</strong> — araç bir anahtar yapıştırmanıza izin verir, ancak çıkarımı yine kendi sunucuları üzerinden yönlendirir, istemlerinizi kaydeder ve hız sınırları uygulayabilir.</li>
      <li><strong>Gerçek BYOK</strong> — araç, model sağlayıcısını doğrudan kendi makinenizden (veya altyapınızdan) çağırır. İstemleriniz hiçbir zaman tedarikçinin sunucularına dokunmaz. Tedarikçi hiçbir kâr marjı almaz.</li>
      </ul>
      <p>Open Design ikinci türdendir. Daemon, yapılandırdığınız uç noktaya, kendi anahtarınızla, kendi makinenizden HTTP çağrıları yapar. Proxy yapmayız. Kayıt tutmayız. İstemlerinizi görmeyiz.</p>
      <h3>Çağrı gerçekte nereye gidiyor</h3>
      <p>Daemon bir işi aldığında, istemi oluşturur — görev için ilgili <code>SKILL.md</code> ve <code>DESIGN.md</code> dosyalarını çeker — ardından ayarladığınız base URL'e tek bir HTTP isteği yapar. Yanıt makinenize akış halinde geri döner, ajan eseri diske yazar ve tüm döngü bundan ibarettir. Yolda hiçbir Open Design sunucusu yoktur. Becerilerinizi keşfeden aynı daemon ağ çağrısının da sahibidir; bu yüzden "bu nerede çalışıyor?" sorusu bir satış görüşmesi değil, bir ayardır.</p>
      <h2>OpenAI uyumlu adaptör</h2>
      <p>2026'daki çoğu yapay zeka çıkarım uç noktası OpenAI Chat Completions API'sini konuşur. Biz bunu en düşük ortak payda protokolü olarak kullanırız. Sağlayıcınız bunu konuşuyorsa (ki neredeyse hepsi konuşur), varsayılan olarak desteklenirsiniz — eklenti yok, beklenecek sağlayıcıya özel entegrasyon yok.</p>
      <h3>Yönlendirebileceğiniz sağlayıcılar</h3>




















































      <table><thead><tr><th>Sağlayıcı</th><th>Tipik base URL biçimi</th><th>Şunun için iyi</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, en güçlü genel geçişler</td></tr><tr><td>Anthropic</td><td>OpenAI uyumluluk katmanı veya özel Claude adaptörü</td><td>zevk ağırlıklı rötuşlar, uzun brief'ler</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>maliyet açısından verimli uzun bağlamlı taslaklar</td></tr><tr><td>Groq</td><td>sağlayıcı base URL'i</td><td>düşük gecikmeli taslak döngüleri</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>herhangi bir öncü model, tek faturalandırma ilişkisi</td></tr><tr><td>Kendi sunucunuzdaki vLLM / TGI / Ollama</td><td>kendi sunucunuz, örn. <code>http://localhost:11434/v1</code></td><td>tamamen yerel, müşteri gizliliği gerektiren işler</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>sağlayıcı base URL'i</td><td>OAI uyumlu uç noktalara sahip bölgesel modeller</td></tr></tbody></table>
      <p>Liste, sabit kodlanmış bir izin listesi değil — sadece insanların yaygın olarak tercih ettiği yerler. Chat Completions biçimine yanıt veren her şey çalışır.</p>
      <h3>İki alan, sonra yeniden başlatma</h3>
      <p>Yapılandırma iki alandan ibaret:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Bunları <code>.env.local</code> içine bırakın, daemon'u yeniden başlatın ve farklı bir modeldesiniz. Hassas bir proje için yerel bir Ollama kutusuna geçmek de aynı iki satırdır:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Güncellenecek bir model kayıt defteri, yeniden bağlanacak bir hesap, bir geçiş süreci yok. Anahtar ve uç nokta, tüm yüzeyi oluşturur.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, birbirinin yerine geçebilen üç model motorundan oluşan bir sıraya bağlı tek bir anahtar; ortadaki yeşil bir çerçeveyle seçilmiş">
        <figcaption>Tek anahtar, herhangi bir model — adaptör, Claude, Codex ve Qwen'i aynı iş akışının arkasında birbirinin yerine geçebilir kılar.</figcaption>
      </figure>
      <h2>Bunun tasarım işi için neden önemli olduğu</h2>
      <p>Tasarım iş akışlarının, barındırılan çıkarım ürünlerinin başa çıkamadığı belirli bir maliyet yapısı vardır:</p>
      <ol>
      <li><strong>İterasyon, işin birimidir.</strong> Gerçek bir tasarım geçişi, üç değil 30–50 istem döngüsü demektir. Barındırılan planlar 50 döngü noktasında sert şekilde kısıtlar.</li>
      <li><strong>Uzun bağlam normaldir.</strong> Ciddi bir brief; marka belgelerini, önceki çalışmaları, sistem spesifikasyonlarını ve referans görsellerini içerir. Bu bağlam, barındırılan arayüzlerdeki token bütçelerini fazlasıyla aşar.</li>
      <li><strong>Model seçimi anlık olmalıdır.</strong> Bazı geçişler hızlı ve ucuz bir model ister. Bazıları mevcut en güçlüsünü ister. Bazıları hassas içerik için yerel bir model ister. Barındırılan bir ürün, sizin yerinize birini seçer.</li>
      </ol>
      <p>BYOK üçünü de çözer. Token başına ödersiniz, modeli siz seçersiniz, kısıtlanmazsınız.</p>
      <h3>İterasyon artık tayınlanmıyor</h3>
      <p>Çalışma şeklinizi sessizce değiştiren şey budur. Her ek döngü bir plana karşı sayaçlandığında, kendi kendinizi sansürlemeye başlarsınız — dördüncüsü pahalı geldiği için üçüncü taslağı alırsınız. BYOK'ta bir geçiş daha yapmanın marjinal maliyeti, model sağlayıcısında birkaç sent olduğundan, karar tekrar sayaçla ilgili olmaktan çıkıp işle ilgili olur. Tasarımın iyileştiği yer genellikle üçüncü taslaktır; iterasyonu vergilendiren bir araç, tam olarak önemli olan adımı vergilendiriyor demektir.</p>
      <h2>Peki ya maliyet?</h2>
      <p>Yaygın bir endişe: "Doğrudan ödüyorsam, daha pahalı olmaz mı?"</p>
      <p>Pratikte hayır. İşte iç kullanımımızda tipik bir tasarım iş günü:</p>




































      <table><thead><tr><th>Görev</th><th>Token</th><th>Sağlayıcı</th><th>Maliyet</th></tr></thead><tbody><tr><td>Brief alımı (3 belge)</td><td>30K girdi</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>İlk taslak geçişi</td><td>80K girdi + 20K çıktı</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 iterasyon döngüsü</td><td>250K girdi + 80K çıktı</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>Son rötuş</td><td>50K girdi + 30K çıktı</td><td>Claude Opus (tek geçiş)</td><td>$1.35</td></tr><tr><td><strong>Günlük toplam</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>Bu; bir sunum, iki açılış sayfası varyantı ve bir marka keşfi demek. Barındırılan eşdeğeri — aşım ücretleri olan aylık 30 dolarlık bir "creator" planı varsayarsak — aynı iş için yaklaşık 50 dolara çıkar, size daha az iterasyon verir ve sizi tek bir modele kilitler.</p>
      <p>Daha ucuza gitmek isterseniz, Claude Sonnet'i DeepSeek V3.2 ile değiştirin ve gün 1 doların altına iner. Mesele bir modelin doğru olması değil — mesele, fiyat/kalite ayarının bir abonelik kademesine gömülmek yerine sizin elinizde olmasıdır.</p>
      <h2>Gizlilik ve uyumluluk</h2>
      <p>BYOK'un önemli olmasının ikinci bir nedeni var: <strong>istemler müşterinizin markasını içerir.</strong></p>
      <p>Barındırılan çıkarım, marka belgelerini, henüz duyurulmamış ürün adlarını, dahili fiyatlandırmayı ve lansman öncesi yaratıcı çalışmaları üçüncü bir tarafın sunucuları üzerinden yönlendirmek demektir. Çoğu şirketin bu konuda bir görüşü vardır. Bazılarının ise bir sözleşmesi.</p>
      <p>BYOK ile istem gidiş-dönüşü, dizüstü bilgisayarınız ile zaten incelediğiniz (veya kendiniz barındırdığınız) model sağlayıcısı arasındadır. Open Design devrede değildir. Mahkeme celbi çıkarılacak bir kaydımız, sızdıracak bir ihlal yüzeyimiz, açıklayacak bir denetim boşluğumuz yoktur.</p>
      <h3>"Kayıt tutmamanın" pratikte size sağladığı şey</h3>
      <p>Ajans işleri, düzenlemeye tabi sektörler veya lansman öncesi herhangi bir şey için ayakta kalabilen tek tutum budur. Bir güvenlik incelemesi "marka varlıklarımız nereye gidiyor?" diye sorarsa, yanıt "sözleşmemizdeki model sağlayıcısına, başka hiçbir yere değil" olur — "kontrol etmediğimiz bir tedarikçi panosuna" değil. Bir Ollama veya vLLM uç noktasını kendiniz barındırmak bunu daha da sıkılaştırır: baytlar ağınızdan hiç çıkmaz. Bu, <a href="/blog/byok-reality-check-5-things-that-break/">BYOK gerçeklik kontrolünde</a> incelenen aynı ödünleşimdir ve o yazı, pürüzlerin hâlâ nerede olduğu konusunda dürüsttür — yerel modeller ve öncü modeller zevk açısından birbirinin yerine geçemez ve istem enjeksiyonu yüzeyinin sahibi sizsinizdir.</p>
      <h2>Proje ortasında sağlayıcı değiştirme</h2>
      <p>BYOK'un hak ettiği değeri görmeyen avantajlarından biri, bir proje sırasında sağlayıcı arbitrajıdır:</p>
      <ul>
      <li><strong>Taslak</strong> — soru formunda ve ilk iterasyonda ucuz bir model kullanın (DeepSeek V3.2, Qwen 3)</li>
      <li><strong>Rötuş</strong> — zevkin önemli olduğu orta geçişler için Claude Sonnet veya GPT-5'e geçin</li>
      <li><strong>Hassas içerik</strong> — müşteri gizliliği gerektiren istemler için yerel bir Ollama modeline geçin</li>
      <li><strong>Son rötuş</strong> — mevcut en güçlü modelde bir geçiş harcayın (Opus, GPT-5 Pro)</li>
      </ul>
      <p>Open Design'da geçiş yapmak, <code>.env.local</code> içindeki iki satırı düzenlemektir. Geçiş süreci yok, yeniden katılım yok, plan yükseltmesi yok.</p>
      <h3>Tek bir brief için işlenmiş bir yönlendirme</h3>
      <p>Somut olarak, tek bir açılış sayfası brief'i şöyle işleyebilir:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Aynı beceriler, diskteki aynı tasarım sistemi, aynı eserler — yalnızca iş akışının arkasındaki motor değişti. Beceriler ve sistemler sadece dosya olduğu için (<code>SKILL.md</code> ve <code>DESIGN.md</code>), kurulumunuzla ilgili hiçbir şey belirli bir modele bağlı değildir. İş akışına sahip olmanın gerçek anlamı budur: araç yoldan çekilir ve model, brief'in gerektirdiğinde değiştirdiğiniz bir parametredir.</p>
      <h2>Deneyin</h2>
      <p>Depoyu klonlayın, <code>.env.local</code> içinde <code>OPENAI_BASE_URL</code> ve <code>OPENAI_API_KEY</code> değerlerini ayarlayın, <code>pnpm tools-dev</code> komutunu çalıştırın. Daemon, yönelttiğiniz uç noktayı, ödediğiniz modeli, istediğiniz zaman çizelgesiyle kullanacaktır.</p>
      <p>Tüm BYOK hikayesi bundan ibaret. Özel bir kademe, yükseltme akışı, bizimle bir faturalandırma ilişkisi yok. Model sağlayıcısına ödersiniz, anahtarlarınızı saklarsınız, istemlerinizi saklarsınız. Biz katmanı sağlarız.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — barındırılan bir uygulama yerine ince bir katman sunma bahsi</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK gerçeklik kontrolü: bozulan 5 şey</a> — kendi anahtarınızı getirmenin dürüst ödünleşimleri ve pürüzleri</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır</a> — hangi modeli çalıştırırsanız çalıştırın sabit kalan <code>SKILL.md</code> / <code>DESIGN.md</code> dosyaları</li>
      </ul>
  uk:
    title: "BYOK-робочий процес дизайну: запускайте Claude, Codex чи Qwen на власному ключі"
    summary: "Більшість AI-інструментів для дизайну тихо додають націнку до кожного витраченого токена. Open Design дотримується протилежної позиції — приносьте власний ключ моделі, платіть провайдеру напряму та зберігайте повний контроль над тим, де виконується інференс. Ось як насправді працює рівень BYOK."
    bodyHtml: |
      <p>Якщо ви користувалися хмарним AI-продуктом для дизайну у 2026 році, ви, ймовірно, помітили, що рахунок повзе вгору. Підписка поверх плати за кожне місце, накладена поверх націнки на інференс, яку ніхто не публікує. Ця математика непрозора навмисно.</p>
      <p>Open Design не виконує інференс. У нас немає націнки на токени. Увесь робочий процес побудований навколо <strong>принципу «приноси власний ключ» (BYOK)</strong> — ви спрямовуєте daemon на будь-яку сумісну з OpenAI кінцеву точку, вставляєте власний API-ключ, і все готово.</p>
      <p>Цей допис пояснює, чому ми зробили такий вибір, як це працює під капотом і що це насправді змінює у вашій щоденній роботі. Якщо вам потрібен ширший філософський аргумент за цим, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">чому ми побудували Open Design як рівень навичок, а не продукт</a> — це супутній матеріал, а цей є практичною версією.</p>
      <h2>Що насправді означає «BYOK» тут</h2>
      <p>У просторі AI-інструментів циркулюють два визначення BYOK, і це не одне й те саме:</p>
      <ul>
      <li><strong>Поверхневий BYOK</strong> — інструмент дозволяє вставити ключ, але все одно маршрутизує інференс через свої сервери, логує ваші запити та може застосовувати обмеження за швидкістю.</li>
      <li><strong>Справжній BYOK</strong> — інструмент звертається до провайдера моделі напряму з вашої машини (або вашої інфраструктури). Ваші запити ніколи не торкаються серверів вендора. Вендор не бере жодної націнки.</li>
      </ul>
      <p>Open Design належить до другого типу. Daemon робить HTTP-виклики до тієї кінцевої точки, яку ви налаштуєте, з вашим ключем, з вашої машини. Ми не проксуємо. Ми не логуємо. Ми не бачимо ваших запитів.</p>
      <h3>Куди насправді йде виклик</h3>
      <p>Коли daemon бере завдання, він складає запит — підтягуючи відповідні файли <code>SKILL.md</code> та <code>DESIGN.md</code> для цього завдання — а потім робить єдиний HTTP-запит до базової URL-адреси, яку ви задали. Відповідь стримиться назад на вашу машину, агент записує артефакт на диск, і це весь цикл. На цьому шляху немає сервера Open Design. Той самий daemon, який виявляє ваші навички, також володіє мережевим викликом — саме тому «де це виконується?» є налаштуванням, а не темою для розмови з відділом продажів.</p>
      <h2>Сумісний з OpenAI адаптер</h2>
      <p>Більшість кінцевих точок AI-інференсу у 2026 році розмовляють мовою OpenAI Chat Completions API. Ми використовуємо це як протокол найменшого спільного знаменника. Якщо ваш провайдер ним володіє (а майже всі володіють), ви підтримані за замовчуванням — жодного плагіна, жодної інтеграції під конкретного провайдера, на яку доводиться чекати.</p>
      <h3>Провайдери, на яких можна його налаштувати</h3>













































      <table><thead><tr><th>Провайдер</th><th>Типовий вигляд базової URL-адреси</th><th>Підходить для</th></tr></thead><tbody><tr><td>OpenAI</td><td><code>https://api.openai.com/v1</code></td><td><code>gpt-image-2</code>, <code>gpt-5.x</code>, найсильніші загальні проходи</td></tr><tr><td>Anthropic</td><td>сумісний з OpenAI shim або спеціальний адаптер Claude</td><td>доопрацювання з акцентом на смак, довгі брифи</td></tr><tr><td>DeepSeek</td><td><code>https://api.deepseek.com/v1</code></td><td>економне чернеткування з довгим контекстом</td></tr><tr><td>Groq</td><td>базова URL-адреса провайдера</td><td>цикли чернеток з низькою затримкою</td></tr><tr><td>OpenRouter</td><td><code>https://openrouter.ai/api/v1</code></td><td>будь-яка передова модель, одні білінгові відносини</td></tr><tr><td>Самостійно розгорнуті vLLM / TGI / Ollama</td><td>ваш власний хост, напр. <code>http://localhost:11434/v1</code></td><td>повністю локальна, конфіденційна для клієнта робота</td></tr><tr><td>Qwen / Kimi / Hermes</td><td>базова URL-адреса провайдера</td><td>регіональні моделі з сумісними з OAI кінцевими точками</td></tr></tbody></table>
      <p>Цей список не є жорстко закодованим переліком дозволених — це просто те, де люди зазвичай опиняються. Працює все, що відповідає формату Chat Completions.</p>
      <h3>Два поля, потім перезапуск</h3>
      <p>Конфігурація — це два поля:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Вставте їх у <code>.env.local</code>, перезапустіть daemon — і ви вже на іншій моделі. Перехід на локальний бокс Ollama для чутливого проєкту — це ті самі два рядки:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=http://localhost:11434/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=ollama</span></span></code></pre>
      <p>Немає реєстру моделей, який потрібно оновлювати, немає акаунта, який треба перепідв’язувати, немає міграції. Ключ і кінцева точка — це вся поверхня.</p>
      <figure>
        <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="Єдиний ключ, під’єднаний до ряду з трьох взаємозамінних рушіїв моделей, середній з яких виділено зеленою рамкою, на майже білому редакційному тлі">
        <figcaption>Один ключ, будь-яка модель — адаптер робить Claude, Codex та Qwen взаємозамінними за тим самим робочим процесом.</figcaption>
      </figure>
      <h2>Чому це важливо для дизайнерської роботи</h2>
      <p>Дизайнерські робочі процеси мають специфічну структуру витрат, з якою хмарні продукти інференсу погано справляються:</p>
      <ol>
      <li><strong>Ітерація — це одиниця роботи.</strong> Справжній дизайнерський прохід означає 30–50 циклів запитів, а не три. Хмарні плани жорстко обмежують десь на позначці 50 циклів.</li>
      <li><strong>Довгий контекст — це норма.</strong> Серйозний бриф включає брендові документи, попередню роботу, специфікації систем і референсні зображення. Цей контекст легко виходить за межі токенових бюджетів у хмарних інтерфейсах.</li>
      <li><strong>Вибір моделі має бути спонтанним.</strong> Деякі проходи потребують швидкої дешевої моделі. Деякі — найсильнішої з доступних. Деякі — локальної моделі для чутливого вмісту. Хмарний продукт обирає одну за вас.</li>
      </ol>
      <p>BYOK виправляє всі три. Ви платите за токен, ви обираєте модель, вас не обмежують.</p>
      <h3>Ітерація перестає бути нормованою</h3>
      <p>Саме це непомітно змінює те, як ви працюєте. Коли кожен зайвий цикл відлічується від плану, ви починаєте самоцензуруватися — ви беретеся за третю чернетку, бо четверта здається дорогою. На BYOK маржинальна вартість ще одного проходу — це кілька центів у провайдера моделі, тож рішення знову стосується роботи, а не лічильника. Третя чернетка зазвичай і є тим місцем, де дизайн стає хорошим; інструмент, який оподатковує ітерацію, оподатковує саме той крок, який має значення.</p>
      <h2>А як щодо вартості?</h2>
      <p>Поширене занепокоєння: «Якщо я плачу напряму, чи не вийде дорожче?»</p>
      <p>На практиці — ні. Ось типовий день дизайнерської роботи в нашому внутрішньому використанні:</p>









































      <table><thead><tr><th>Завдання</th><th>Токени</th><th>Провайдер</th><th>Вартість</th></tr></thead><tbody><tr><td>Прийом брифу (3 документи)</td><td>30K вхідних</td><td>Claude Sonnet</td><td>$0.09</td></tr><tr><td>Прохід першої чернетки</td><td>80K вхідних + 20K вихідних</td><td>Claude Sonnet</td><td>$0.54</td></tr><tr><td>5 циклів ітерацій</td><td>250K вхідних + 80K вихідних</td><td>Claude Sonnet</td><td>$1.95</td></tr><tr><td>Фінальне доопрацювання</td><td>50K вхідних + 30K вихідних</td><td>Claude Opus (один прохід)</td><td>$1.35</td></tr><tr><td><strong>Разом за день</strong></td><td></td><td></td><td><strong>~$3.93</strong></td></tr></tbody></table>
      <p>Це презентація, два варіанти лендингу та брендове дослідження. Хмарний еквівалент — припускаючи план «creator» за $30/місяць із доплатами за перевищення — обійшовся б приблизно у $50 за ту саму роботу, дав би менше ітерацій і прив’язав би вас до однієї моделі.</p>
      <p>Якщо ви хочете здешевити, замініть Claude Sonnet на DeepSeek V3.2, і день впаде нижче $1. Суть не в тому, що якась одна модель є правильною — суть у тому, що регулятор ціна/якість у ваших руках, а не вшитий у рівень підписки.</p>
      <h2>Приватність і відповідність вимогам</h2>
      <p>Є й друга причина, чому BYOK має значення: <strong>запити містять бренд вашого клієнта.</strong></p>
      <p>Хмарний інференс означає маршрутизацію брендових документів, неоголошених назв продуктів, внутрішнього ціноутворення та дозапускового креативу через сервери третьої сторони. Більшість компаній мають свою думку щодо цього. Дехто має щодо цього контракт.</p>
      <p>З BYOK обмін запитами туди-назад відбувається між вашим ноутбуком і провайдером моделі, якого ви вже перевірили (або розгорнули самостійно). Open Design не бере в цьому участі. У нас немає логу, який можна вимагати за повісткою, немає поверхні для витоку даних, немає аудиторської прогалини, яку треба пояснювати.</p>
      <h3>Що «жодного логу» дає на практиці</h3>
      <p>Для агентської роботи, регульованих галузей чи будь-чого дозапускового це єдина позиція, яка витримує перевірку. Якщо аудит безпеки запитує «куди потрапляють наші брендові активи?», відповідь — «до провайдера моделі за нашим контрактом, і більше нікуди», а не «до панелі вендора, яку ми не контролюємо». Самостійне розгортання кінцевої точки Ollama чи vLLM посилює це ще більше: байти взагалі не залишають вашу мережу. Це той самий компроміс, що розглядається в <a href="/blog/byok-reality-check-5-things-that-break/">перевірці реальності BYOK</a>, де чесно описано, де ще лишаються гострі кути — локальні моделі та передові моделі не взаємозамінні за смаком, а поверхня для prompt-injection належить вам самим.</p>
      <h2>Як перемкнути провайдерів посеред проєкту</h2>
      <p>Одна з недооцінених переваг BYOK — це арбітраж провайдерів під час проєкту:</p>
      <ul>
      <li><strong>Чернеткування</strong> — використовуйте дешеву модель (DeepSeek V3.2, Qwen 3) для форми питань і першої ітерації</li>
      <li><strong>Доопрацювання</strong> — перемкніться на Claude Sonnet чи GPT-5 для проміжних проходів, де важить смак</li>
      <li><strong>Чутливий вміст</strong> — перейдіть на локальну модель Ollama для конфіденційних для клієнта запитів</li>
      <li><strong>Фінальне доопрацювання</strong> — спаліть один прохід на найсильнішій доступній моделі (Opus, GPT-5 Pro)</li>
      </ul>
      <p>В Open Design перемикання — це редагування двох рядків у <code>.env.local</code>. Жодної міграції, жодного повторного онбордингу, жодного апгрейду плану.</p>
      <h3>Опрацьована маршрутизація для одного брифу</h3>
      <p>Конкретно, окремий бриф для лендингу міг би проходити так:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span># draft + first iterations — cheap and fast</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span># then, for the passes where taste decides the outcome:</span></span>
      <span class="line"><span>OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-ant-…</span></span></code></pre>
      <p>Ті самі навички, та сама дизайн-система на диску, ті самі артефакти — змінився лише рушій за робочим процесом. Оскільки навички та системи — це просто файли (<code>SKILL.md</code> та <code>DESIGN.md</code>), ніщо у вашому налаштуванні не прив’язане до конкретної моделі. Ось що насправді означає володіти робочим процесом: інструмент відступає з дороги, а модель стає параметром, який ви змінюєте, як того вимагає бриф.</p>
      <h2>Спробуйте</h2>
      <p>Клонуйте репозиторій, задайте <code>OPENAI_BASE_URL</code> та <code>OPENAI_API_KEY</code> у <code>.env.local</code>, запустіть <code>pnpm tools-dev</code>. Daemon використає ту кінцеву точку, на яку ви його спрямуєте, з тією моделлю, за яку ви платите, за тим розкладом, який ви захочете.</p>
      <p>Це вся історія BYOK. Немає жодного особливого рівня, жодного процесу апгрейду, жодних білінгових відносин з нами. Ви платите провайдеру моделі, ви зберігаєте свої ключі, ви зберігаєте свої запити. Ми надаємо рівень.</p>
      <h2>Пов’язане для читання</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a> — ставка за рішенням постачати тонкий рівень замість хмарного застосунку</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Перевірка реальності BYOK: 5 речей, які ламаються</a> — чесні компроміси та гострі кути використання власного ключа</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи: як працює бібліотека Open Design</a> — файли <code>SKILL.md</code> / <code>DESIGN.md</code>, що лишаються незмінними незалежно від того, яку модель ви запускаєте</li>
      </ul>
---

If you've used a hosted AI design product in 2026, you've probably noticed the bill creeping up. A subscription on top of a per-seat charge, layered on top of an inference markup that nobody publishes. The math is opaque on purpose.

Open Design doesn't run inference. We don't have a margin on tokens. The entire workflow is built around **bring-your-own-key (BYOK)** — you point the daemon at any OpenAI-compatible endpoint, paste your own API key, and you're done.

This post explains why we made that choice, how it works under the hood, and what it actually changes in your day-to-day workflow. If you want the bigger philosophical argument behind it, [why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) is the companion piece — this one is the hands-on version.

## What "BYOK" really means here

There are two definitions of BYOK floating around the AI tooling space, and they're not the same thing:

- **Surface BYOK** — the tool lets you paste a key, but still routes inference through their servers, logs your prompts, and may apply rate limits.
- **Real BYOK** — the tool calls the model provider directly from your machine (or your infrastructure). Your prompts never touch the vendor's servers. The vendor takes no margin.

Open Design is the second kind. The daemon makes HTTP calls to whichever endpoint you configure, with your key, from your machine. We don't proxy. We don't log. We don't see your prompts.

### Where the call actually goes

When the daemon picks up a job, it composes the prompt — pulling in the relevant `SKILL.md` and `DESIGN.md` files for the task — and then makes a single HTTP request to the base URL you set. The response streams back to your machine, the agent writes the artifact to disk, and that's the whole loop. There is no Open Design server in the path. The same daemon that discovers your skills also owns the network call, which is why "where does this run?" is a setting and not a sales conversation.

## The OpenAI-compatible adapter

Most AI inference endpoints in 2026 speak the OpenAI Chat Completions API. We use that as the lowest-common-denominator protocol. If your provider speaks it (and almost all of them do), you're supported by default — no plugin, no per-provider integration to wait on.

### Providers you can point it at

| Provider | Typical base URL shape | Good for |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-image-2`, `gpt-5.x`, strongest general passes |
| Anthropic | OpenAI compat shim, or the dedicated Claude adapter | taste-heavy refinement, long briefs |
| DeepSeek | `https://api.deepseek.com/v1` | cost-efficient long-context drafting |
| Groq | provider base URL | low-latency draft cycles |
| OpenRouter | `https://openrouter.ai/api/v1` | any frontier model, one billing relationship |
| Self-hosted vLLM / TGI / Ollama | your own host, e.g. `http://localhost:11434/v1` | fully local, client-confidential work |
| Qwen / Kimi / Hermes | provider base URL | regional models with OAI-compatible endpoints |

The list isn't a hard-coded allowlist — it's just where people commonly land. Anything that answers the Chat Completions shape works.

### Two fields, then restart

Configuration is two fields:

```
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-…
```

Drop them in `.env.local`, restart the daemon, and you're on a different model. Switching to a local Ollama box for a sensitive project is the same two lines:

```
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
```

There's no model registry to update, no account to re-link, no migration. The key and the endpoint are the entire surface.

<figure>
  <img src="/blog/byok-design-workflow-claude-codex-qwen-inline.webp" alt="A single key wired to a row of three interchangeable model engines, the middle one selected in a green frame, on a near-white editorial ground" />
  <figcaption>One key, any model — the adapter makes Claude, Codex, and Qwen interchangeable behind the same workflow.</figcaption>
</figure>

## Why this matters for design work

Design workflows have a specific cost shape that hosted-inference products are bad at:

1. **Iteration is the unit of work.** A real design pass means 30–50 prompt cycles, not three. Hosted plans throttle hard at the 50-cycle mark.
2. **Long context is the norm.** A serious brief involves brand documents, prior work, system specs, and reference imagery. That context blows past the token budgets in hosted UIs.
3. **Model choice should be ad-hoc.** Some passes want a fast cheap model. Some want the strongest available. Some want a local model for sensitive content. A hosted product picks one for you.

BYOK fixes all three. You pay per token, you choose the model, you don't get throttled.

### Iteration stops being rationed

This is the one that quietly changes how you work. When every extra cycle is metered against a plan, you start self-censoring — you take the third draft because the fourth feels expensive. On BYOK the marginal cost of one more pass is a few cents at the model provider, so the decision goes back to being about the work, not the meter. The third draft is usually where the design gets good; a tool that taxes iteration is taxing the exact step that matters.

## What about cost?

A common worry: "If I'm paying directly, won't it be more expensive?"

In practice, no. Here's a typical day of design work in our internal usage:

| Task | Tokens | Provider | Cost |
|---|---|---|---|
| Brief intake (3 docs) | 30K input | Claude Sonnet | $0.09 |
| First draft pass | 80K input + 20K output | Claude Sonnet | $0.54 |
| 5 iteration cycles | 250K input + 80K output | Claude Sonnet | $1.95 |
| Final polish | 50K input + 30K output | Claude Opus (one pass) | $1.35 |
| **Day total** | | | **~$3.93** |

That's a deck, two landing variants, and a brand exploration. The hosted equivalent — assuming a $30/month "creator" plan with overage charges — would run about $50 for the same work, give you fewer iterations, and lock you to one model.

If you want to go cheaper, swap Claude Sonnet for DeepSeek V3.2 and the day drops under $1. The point isn't that one model is right — it's that the price/quality dial is in your hands rather than baked into a subscription tier.

## Privacy and compliance

There's a second reason BYOK matters: **the prompts contain your client's brand.**

Hosted inference means routing brand documents, unannounced product names, internal pricing, and pre-launch creative through a third party's servers. Most companies have an opinion about that. Some have a contract about it.

With BYOK, the prompt round-trip is between your laptop and the model provider you've already vetted (or self-hosted). Open Design is not in the loop. We have no log to subpoena, no breach surface to leak from, no audit gap to explain.

### What "no log" buys you in practice

For agency work, regulated industries, or anything pre-launch, this is the only stance that holds up. If a security review asks "where do our brand assets go?", the answer is "to the model provider in our contract, and nowhere else" — not "to a vendor dashboard we don't control." Self-hosting an Ollama or vLLM endpoint tightens it further: the bytes never leave your network at all. This is the same trade-off explored in [the BYOK reality check](/blog/byok-reality-check-5-things-that-break/), which is honest about where the rough edges still are — local models and frontier models are not interchangeable on taste, and you own the prompt-injection surface yourself.

## How to switch providers mid-project

One of the underrated benefits of BYOK is provider arbitrage during a project:

- **Drafting** — use a cheap model (DeepSeek V3.2, Qwen 3) on the question form and first iteration
- **Refinement** — switch to Claude Sonnet or GPT-5 for the middle passes where taste matters
- **Sensitive content** — swap to a local Ollama model for client-confidential prompts
- **Final polish** — burn one pass on the strongest model available (Opus, GPT-5 Pro)

In Open Design, switching is editing two lines in `.env.local`. There's no migration, no re-onboarding, no plan upgrade.

### A worked routing for one brief

Concretely, a single landing-page brief might run like this. For the draft and first iterations — cheap and fast — point at a low-cost provider:

```
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-…
```

Then, for the passes where taste decides the outcome, switch to a stronger model (via the OpenAI-compat shim):

```
OPENAI_BASE_URL=https://api.anthropic.com/v1   # via the compat shim
OPENAI_API_KEY=sk-ant-…
```

Same skills, same design system on disk, same artifacts — only the engine behind the workflow changed. Because skills and systems are just files (`SKILL.md` and `DESIGN.md`), nothing about your setup is tied to a particular model. This is what owning the workflow actually means: the tool gets out of the way, and the model is a parameter you change as the brief demands.

## Try it

Clone the repo, set `OPENAI_BASE_URL` and `OPENAI_API_KEY` in `.env.local`, run `pnpm tools-dev`. The daemon will use whatever endpoint you point it at, with whatever model you pay for, on whatever schedule you want.

That's the entire BYOK story. There's no special tier, no upgrade flow, no billing relationship with us. You pay the model provider, you keep your keys, you keep your prompts. We provide the layer.

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the bet behind shipping a thin layer instead of a hosted app
- [The BYOK reality check: 5 things that break](/blog/byok-reality-check-5-things-that-break/) — the honest trade-offs and rough edges of bringing your own key
- [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/) — the `SKILL.md` / `DESIGN.md` files that stay constant no matter which model you run
