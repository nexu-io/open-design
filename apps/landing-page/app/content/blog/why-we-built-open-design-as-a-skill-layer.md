---
title: "Why we built Open Design as a skill layer, not a product"
date: 2026-05-13
category: "Product"
readingTime: 8
summary: "Most AI design tools try to replace the agent already on your laptop. Open Design takes the opposite bet: ship a thin layer of skills, systems, and adapters that turn any coding agent into a design engine — without locking you into a new app."
i18n:
  zh:
    title: "我们为什么把 Open Design 做成 skill 层，而不是一款产品"
    summary: "大多数 AI 设计工具都想取代你笔记本上已有的那个 agent。Open Design 押了相反的一注：交付一层薄薄的 skills、systems 和适配器，把任何 coding agent 变成一台设计引擎——而不会把你锁进一款新 app。"
    bodyHtml: |
      <p>此刻你笔记本上最强的 coding agent，无非是 Claude、Codex、Cursor、Gemini、OpenCode 或 Qwen。我们不认为你还需要再来一个。真正缺的不是原始智能——而是<strong>品味、结构，以及一套把设计当作手艺来尊重的工作流</strong>。</p>
      <p>Open Design 就是我们对那一缺失层的尝试。它不是一款聊天产品，也不是一款「底层用了 AI」的设计工具。它是一层薄薄的 skill 层——一个装满 <code>SKILL.md</code> 文件的文件夹、一座可移植的设计系统库，以及一个 daemon：它会自动检测你已有的 CLI agent，并把它们串联起来。</p>
      <p>这篇文章会解释我们为什么这么选，它对你使用 Open Design 的方式意味着什么，以及为什么「做层，而不是做产品」是一场押注于长久、而非走捷径的赌局。</p>
      <h2>做成产品会是错误的形态</h2>
      <p>2026 年启动一个 AI 设计项目时，本能反应是去做一款新 app：一个聊天界面、一块画布、一套计费系统，外加一笔随用户数线性增长的模型账单。这条路我们考虑过，又因为三个原因否决了它。</p>
      <h3>聊天界面是一种大路货</h3>
      <p>每个用户都已经有了一个能干的 agent 和一个他们信任的聊天框。再塞给他们一个更差的——裹着我们的品牌、又少了他们已经练成的肌肉记忆——对谁都没好处。价值不在界面上。价值在你按下回车<em>之后</em>那个 agent 做了什么：它产出的，是一份看起来经过设计的演示稿，还是一面堆满 div 的墙。</p>
      <h3>模型账单是对创造力征的税</h3>
      <p>把推理捆进产品，经济账就会逼着你出手。你不得不给 token 加价、给长会话限速、对最新模型的访问配额化，好让你的利润率活下去。而这每一步动作，恰恰惩罚了一款设计工具本应奖励的那些行为：迭代、探索，以及因为第三稿才是出活的地方而再跑一遍 agent。</p>
      <h3>锁定是错误的默认值</h3>
      <p>设计师应该能带着自己的文件、系统和 skill 完整地离开。一款产品会把一切裹进专有状态——导出来，你拿到的只是真实之物被压平后的影子。一层 skill 层没什么可裹的，因为产物<em>就是</em>那些文件。离开毫无成本，而这恰恰是留下来才有分量的原因。</p>
      <p>所以我们改去做那一层。放进一个文件夹，重启 daemon，skill 就出现了。带着这个文件夹走，把它放进另一个 agent，skill 在那里照样能用。</p>
      <h2>一个 skill 到底是什么</h2>
      <p>在 Open Design 里，一个 skill 就是一个 <code>SKILL.md</code> 文件，外加同一文件夹里可选的配套资源。这个 Markdown 文件描述：</p>
      <ul>
      <li><strong>这个 skill 做什么</strong>——一段话，用大白话讲清</li>
      <li><strong>什么时候调用它</strong>——触发条件，写得让 agent 能正确路由</li>
      <li><strong>输出的形态</strong>——HTML、PDF、幻灯片，或一份 Markdown 简报</li>
      <li><strong>约束</strong>——用 OKLch 表示的配色、字体栈、版式姿态、品牌词汇</li>
      </ul>
      <p>agent 读这个文件，决定要不要调用，然后把输出写到磁盘上。没有插件系统，没有 API 面，没有版本兼容矩阵。只要你会写 Markdown，你就能交付一个 skill。</p>
      <h3>一个 skill 的解剖</h3>
      <p>具体来说，一个 skill 就是 daemon 在启动时发现的一个目录：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p><code>SKILL.md</code> 的 front matter 给出 skill 的名字和它的触发条件；正文则是 agent 像读简报一样阅读的指引。让 skill 注册生效的，唯有它出现在磁盘上这件事本身——没有要更新的 manifest，没有构建步骤，没有审核队列。</p>
      <h3>为什么文件胜过插件</h3>
      <p>这是有意为之的。十五年来，我们眼看着一个个插件生态走向衰朽——每一个都是表达力与长久之间的一笔交易，而两头都没赢。一个插件是某人某一年 API 的一张快照；运行时往前走，API 就坏掉，你赖以为生的那套工作流也就没了。文件不会坏。今天写下的一份 <code>SKILL.md</code>，两年后对一个 agent 读起来分毫不差，对一个手头没有任何工具的人也一样。</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="一张单页的 markdown 文档，上面是纯文本行，在近乎纯白的编辑底色上被一个绿色框选中">
        <figcaption>一个 skill 就只是一个文件——agent 读的纯 Markdown，而不是被锁在某款产品里的一项功能。</figcaption>
      </figure>
      <h2>为什么 systems 也是 Markdown</h2>
      <p>Open Design 以 <code>DESIGN.md</code> 文件的形式，交付了数十套设计系统——Linear、Vercel、Stripe、Apple、Cursor、Figma 等等。思路一样：可移植、可阅读、可被 agent 摄入。</p>
      <p>在这个语境里，一套设计系统不是一个 Figma 库。它是一份契约：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>agent 读这份契约，产出尊重它的作品——颜色用 OKLch，好让它们在感知上保持均匀；一条它不会偏离的字号阶梯；一套版式姿态，让十屏生成的画面感觉像同一款产品。</p>
      <h3>混搭、分叉、占为己有</h3>
      <p>因为一套系统只是文本，你可以把它分叉了就地编辑，交付一个变体，或者三十分钟内从零写一套自己的。你甚至可以在项目中途混搭系统——从 Linear 取排版，从 Vercel 取配色逻辑，从一份自家定制规范取版式——因为没有任何二进制格式横在你和规则之间。skill 与 system 如何组合的完整机制，在 <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> 中有详述。</p>
      <h2>BYOK 是唯一诚实的模式</h2>
      <p>Open Design 以 <strong>bring-your-own-key（自带密钥）</strong> 的方式运行。你为任何兼容 OpenAI 的端点粘贴一个 base URL 和一个 API key——DeepSeek、Groq、OpenRouter，或你自己自托管的 vLLM——就搞定了：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>我们不跑推理。我们不在 token 上抽成。我们和你之间没有计费关系。这不是一个可持续性的问题——它是对「agent 跑起来时谁来付钱？」这个问题唯一诚实的回答。</p>
      <h3>隐私是同一选择的自然结果</h3>
      <p>因为 daemon 是从你的机器上直接调用供应商，你的 prompt 从不途经我们的服务器。没有代理去记录它们，没有分析管线在悄悄留存你尚未发布的作品。对于代理机构的活儿，或任何受 NDA 约束的事，「这东西在哪里跑？」不再是一场采购谈判，而变成了一个设置项。更深一层的取舍——以及至今仍存在的粗糙之处——在 <a href="/blog/byok-reality-check-5-things-that-break/">the BYOK reality check</a> 里。</p>
      <p>谁来付钱的答案是：你来，直接付给你选定的模型供应商。我们让开。</p>
      <h2>这对你意味着什么</h2>
      <p>如果你想要一款打磨精良、带着漂亮聊天框、一份订阅搞定的 SaaS，那我们不是合适的工具。市面上有这种形态的好产品——用它们就好。</p>
      <p>如果你想要一套这样的工作流：</p>
      <ul>
      <li>由你本就信任的那个 agent 来干活，</li>
      <li>skill 是你能读、能改的文件，</li>
      <li>设计系统在不同项目和不同 agent 之间可移植，</li>
      <li>账单去到模型供应商那里，而不是我们这里——</li>
      </ul>
      <p>那么 Open Design 就是为你而造的。进到 GitHub 仓库，运行 <code>pnpm tools-dev</code>，把你的 agent 指向某个 skill，然后交付。</p>
      <p>skill 层之所以会赢，是因为它不跟你笔记本上的那个 agent 竞争。它是在增强它。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> ——这一层赖以构建的四个原语</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> ——自带密钥模式的实战</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> ——「做层，而不是做产品」这场赌局在面对老牌玩家时落到了哪里</li>
      </ul>
  zh-tw:
    title: "為什麼我們把 Open Design 做成技能層，而非一款產品"
    summary: "多數 AI 設計工具都想取代你筆電上既有的 agent。Open Design 押了相反的賭注：交付一層輕薄的技能、系統與轉接器，把任何 coding agent 變成一台設計引擎——而不會把你鎖進一款新 app。"
    bodyHtml: |
      <p>此刻你筆電上最強的 coding agent，是 Claude、Codex、Cursor、Gemini、OpenCode 或 Qwen。我們不認為你還需要再來一個。真正缺的不是純粹的智慧——而是<strong>品味、結構，以及一套尊重設計這門手藝的工作流</strong>。</p>
      <p>Open Design 就是我們對這個缺失層的嘗試。它不是一款聊天產品。它不是一款「底層偷用 AI」的設計工具。它是一層輕薄的技能層——一個裝著 <code>SKILL.md</code> 檔案的資料夾、一套可攜帶的設計系統函式庫，以及一個會自動偵測你既有 CLI agent 並把它們串接起來的 daemon。</p>
      <p>這篇文章解釋我們為什麼做出這個選擇、它對你使用 Open Design 的方式意味著什麼，以及為什麼「是層，不是產品」是一場押注長壽、而非抄捷徑的賭注。</p>
      <h2>產品會是錯的形狀</h2>
      <p>在 2026 年啟動一個 AI 設計專案時，直覺是去打造一款新 app：一個聊天介面、一塊畫布、一套計費系統，還有一筆隨用戶數線性增長的模型帳單。我們考慮過這條路，但基於三個理由否決了它。</p>
      <h3>聊天介面是大宗商品</h3>
      <p>每個用戶早已擁有一個能幹的 agent，以及一個他們信任的聊天框。再塞一個更差的給他們——包著我們的品牌、缺了他們累積出來的肌肉記憶——對誰都沒幫助。價值不在介面。價值在於你按下 enter <em>之後</em> agent 做了什麼：它產出的究竟是一份看起來經過設計的簡報，還是一牆 div。</p>
      <h3>模型帳單是對創意的課稅</h3>
      <p>把推理綁進產品裡，經濟邏輯就會逼你出手。你不得不對 token 加價、限制長時間的工作階段，並對最新的模型實施配額管控，好讓你的毛利活下來。而這每一步，懲罰的恰恰是設計工具本該獎勵的行為：迭代、探索、以及一次次重新跑 agent——因為作品往往是在第三版才真正變好。</p>
      <h3>鎖定是錯誤的預設值</h3>
      <p>設計師應該能帶著他們的檔案、系統與技能完整離開。一款產品會把一切包進專有狀態裡——把它匯出，你拿到的只是真實事物被壓扁的影子。技能層沒有什麼可包，因為這些產物<em>本身就是</em>檔案。離開不需付出任何代價，這恰恰是為什麼留下來才有意義。</p>
      <p>所以我們轉而打造了這一層。丟進一個資料夾、重啟 daemon，技能就出現了。把資料夾帶走、丟進另一個 agent，技能在那裡一樣能用。</p>
      <h2>一個技能究竟是什麼</h2>
      <p>在 Open Design 裡，一個技能是一個 <code>SKILL.md</code> 檔案，外加同一資料夾內可選的輔助資產。這份 Markdown 檔描述：</p>
      <ul>
      <li><strong>這個技能做什麼</strong>——一段話，用平實的語言寫</li>
      <li><strong>何時調用它</strong>——觸發條件，寫得讓 agent 能正確路由</li>
      <li><strong>輸出的形狀</strong>——HTML、PDF、投影片、一份 Markdown 摘要</li>
      <li><strong>各項約束</strong>——以 OKLch 表示的配色、字體堆疊、版面姿態、品牌詞彙</li>
      </ul>
      <p>agent 讀取檔案、決定是否調用，然後把輸出寫到磁碟。沒有外掛系統、沒有 API 表面、沒有版本相容性矩陣。只要你會寫 Markdown，你就能交付一個技能。</p>
      <h3>一個技能的解剖</h3>
      <p>具體來說，技能就是 daemon 在啟動時發現的一個目錄：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p><code>SKILL.md</code> 的前置資料命名了技能及其觸發條件；正文則是 agent 像讀一份簡報那樣讀取的指引。除了它在磁碟上的存在，沒有任何東西去註冊這個技能——沒有要更新的 manifest、沒有建置步驟、沒有審查佇列。</p>
      <h3>為什麼檔案勝過外掛</h3>
      <p>這是刻意為之。我們看著外掛生態系統腐朽了十五年——每一個都是表達力與長壽之間的取捨，而兩者皆未勝出。一個外掛是某人某一年的 API 的快照；執行環境往前走、API 壞掉，你所依賴的工作流就此消失。檔案不會壞。一份今天寫下的 <code>SKILL.md</code>，兩年後對一個 agent 讀起來一字不差，對一個手邊毫無工具的人類也是如此。</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="一張帶有純文字行的單頁 Markdown 文件，在近乎全白的編輯版面上被一個綠色框選中">
        <figcaption>技能就只是一個檔案——agent 讀取的純 Markdown，而不是被鎖在產品裡的某項功能。</figcaption>
      </figure>
      <h2>為什麼系統也是 Markdown</h2>
      <p>Open Design 以 <code>DESIGN.md</code> 檔案的形式，交付數十套設計系統——Linear、Vercel、Stripe、Apple、Cursor、Figma 等等。一樣的思路：可攜帶、可閱讀、可被 agent 吸收。</p>
      <p>在這個脈絡下，一套設計系統不是一個 Figma 函式庫。它是一份契約：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>agent 讀取這份契約，產出尊重它的作品——以 OKLch 表示的顏色，使其在知覺上維持均勻；一套它不會偏離的字級階梯；以及一種版面姿態，讓十個生成出來的畫面感覺像同一款產品。</p>
      <h3>混搭、分支、據為己有</h3>
      <p>因為一套系統就只是文字，你可以分支一份並就地編輯、交付一個變體，或在三十分鐘內從零寫出自己的一套。你甚至可以在專案進行中混搭多套系統——從 Linear 取字體排印、從 Vercel 取色彩邏輯、從一份自訂的內部規格取版面——因為沒有任何二進位格式擋在你與這些規則之間。技能與系統如何組合的完整機制，詳見 <a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 套系統：Open Design 函式庫如何運作</a>。</p>
      <h2>BYOK 是唯一誠實的模式</h2>
      <p>Open Design 以<strong>自備金鑰（bring-your-own-key）</strong>運作。你貼上任何 OpenAI 相容端點的 base URL 與一把 API 金鑰——DeepSeek、Groq、OpenRouter、你自架的 vLLM——就大功告成：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>我們不跑推理。我們不在 token 上抽成。我們和你之間沒有計費關係。這不是一個永續性的問題——它是對「agent 跑起來時誰買單？」這個問題唯一誠實的答案。</p>
      <h3>隱私由同一個選擇自然而來</h3>
      <p>因為 daemon 是從你的機器直接呼叫供應商，你的提示詞從不經過我們的伺服器。沒有代理伺服器去記錄它們，沒有分析管線悄悄保留你尚未發布的作品。對於代理商的工作或任何受 NDA 約束的事，「這東西在哪裡跑？」不再是一場採購對話，而變成一個設定選項。更深層的權衡——以及目前仍存在的粗糙之處——詳見 <a href="/blog/byok-reality-check-5-things-that-break/">BYOK 現實檢驗</a>。</p>
      <p>誰買單的答案是：你買單，直接付給你所選的模型供應商。我們讓開，不擋路。</p>
      <h2>這對你意味著什麼</h2>
      <p>如果你想要的是一款打磨精緻、有個漂亮聊天框、單一訂閱制的 SaaS，那我們不是對的工具。市面上有這種形狀的好產品——用它們就好。</p>
      <p>如果你想要的是這樣一套工作流：</p>
      <ul>
      <li>由你早已信任的 agent 來做事，</li>
      <li>技能是你能讀、能改的檔案，</li>
      <li>設計系統可跨專案、跨 agent 攜帶，</li>
      <li>帳單寄給模型供應商，而不是我們——</li>
      </ul>
      <p>那麼 Open Design 就是為你打造的。進到 GitHub 儲存庫、執行 <code>pnpm tools-dev</code>、把你的 agent 指向一個技能，然後交付。</p>
      <p>技能層之所以勝出，是因為它不和你筆電上的 agent 競爭。它增強它。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 套系統：Open Design 函式庫如何運作</a>——構成這一層的四個原語</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流：用你自己的金鑰跑 Claude、Codex 或 Qwen</a>——自備金鑰模式的實務操作</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma 的開源替代方案</a>——「是層，不是產品」這場賭注對上現任霸主時落點何在</li>
      </ul>
  ja:
    title: "なぜ私たちは Open Design を製品ではなくスキルレイヤーとして作ったのか"
    summary: "ほとんどの AI デザインツールは、すでにあなたのノート PC 上にあるエージェントを置き換えようとします。Open Design は逆の賭けに出ます。スキル、システム、アダプターの薄いレイヤーを提供し、新しいアプリに縛り付けることなく、あらゆるコーディングエージェントをデザインエンジンに変えるのです。"
    bodyHtml: |
      <p>今あなたのノート PC 上にある最強のコーディングエージェントは、Claude、Codex、Cursor、Gemini、OpenCode、あるいは Qwen でしょう。私たちは、もう一つ別のエージェントが必要だとは考えていません。足りないのは生の知能ではなく、<strong>センス、構造、そしてデザインを一つの技芸として尊重するワークフロー</strong>です。</p>
      <p>Open Design は、その欠けているレイヤーを埋めようとする私たちの試みです。これはチャット製品ではありません。「裏側で AI を使う」デザインツールでもありません。薄いスキルレイヤー——<code>SKILL.md</code> ファイルが入ったフォルダ、ポータブルなデザインシステムのライブラリ、そして既存の CLI エージェントを自動検出して相互に結びつける daemon です。</p>
      <p>この記事では、なぜ私たちがその選択をしたのか、それが Open Design の使い方にとって何を意味するのか、そしてなぜ「製品ではなくレイヤー」が近道ではなく長期的な持続性への賭けなのかを説明します。</p>
      <h2>製品という形は誤りだった</h2>
      <p>2026 年に AI デザインプロジェクトを始めるとき、本能的に作りたくなるのは新しいアプリです。チャットインターフェース、キャンバス、課金システム、そしてユーザー数に比例して増えていくモデル利用料。私たちはその道を検討し、三つの理由から退けました。</p>
      <h3>チャットインターフェースはコモディティだ</h3>
      <p>どのユーザーもすでに有能なエージェントと、信頼するチャットボックスを持っています。そこに——私たちのブランドでくるまれ、ユーザーが築いてきた操作感を欠いた——より劣るものを追加しても、誰の役にも立ちません。価値があるのはインターフェースではありません。価値は、Enter を押した<em>後</em>にエージェントが何をするか——デザインされたように見えるデッキを生み出すのか、それとも div の壁を吐き出すのか——にあります。</p>
      <h3>モデル利用料は創造性への課税だ</h3>
      <p>推論を製品に組み込めば、経済性があなたの手を縛ります。トークンに上乗せし、長いセッションを絞り、利益が残るように最新モデルへのアクセスを配給制にせざるを得なくなります。そのどの一手も、デザインツールが本来報いるべき行動——反復し、探索し、三稿目こそ作品が良くなるからこそもう一度エージェントを走らせること——を罰してしまうのです。</p>
      <h3>ロックインは誤ったデフォルトだ</h3>
      <p>デザイナーは、自分のファイル、システム、スキルを損なわれることなく持って去れるべきです。製品はすべてを独自の状態でくるみ込みます——書き出せば、本物の平板な影しか得られません。スキルレイヤーにはくるむものが何もありません。なぜなら、その成果物<em>こそ</em>がファイルだからです。去るのにコストがかからない、まさにそれこそが、留まることに意味を持たせるのです。</p>
      <p>だから私たちは代わりにレイヤーを作りました。フォルダを置き、daemon を再起動すれば、スキルが現れます。そのフォルダを持って行き、別のエージェントに置けば、そこでもスキルは動きます。</p>
      <h2>スキルとは実際には何か</h2>
      <p>Open Design におけるスキルとは、<code>SKILL.md</code> ファイルと、同じフォルダ内の任意の補助アセットです。この Markdown ファイルは次を記述します。</p>
      <ul>
      <li><strong>そのスキルが何をするか</strong>——プレーンな英語で一段落</li>
      <li><strong>いつ呼び出すか</strong>——エージェントが正しくルーティングできるように書かれた、起動条件</li>
      <li><strong>出力の形</strong>——HTML、PDF、スライド、Markdown のブリーフ</li>
      <li><strong>制約</strong>——OKLch のパレット、フォントスタック、レイアウトの姿勢、ブランドの語彙</li>
      </ul>
      <p>エージェントはこのファイルを読み、呼び出すかどうかを判断し、出力をディスクに書き出します。プラグインシステムも、API のサーフェスも、バージョン互換性のマトリックスもありません。Markdown を書けるなら、スキルを世に出せます。</p>
      <h3>スキルの解剖</h3>
      <p>具体的には、スキルとは daemon が起動時に発見するディレクトリです。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p><code>SKILL.md</code> の front matter はスキル名とそのトリガーを定め、本文はエージェントがブリーフのように読むガイダンスです。スキルを登録するものは、ディスク上にそれが存在することだけです——上げるべきマニフェストも、ビルドステップも、レビュー待ち行列もありません。</p>
      <h3>なぜファイルはプラグインに勝るのか</h3>
      <p>これは意図的なものです。私たちは 15 年にわたってプラグインのエコシステムが朽ちていくのを見てきました——どれもが表現力と長寿命のあいだの取引であり、そのどちらも勝ち取れませんでした。プラグインとは、ある特定の年における誰かの API のスナップショットです。ランタイムが動き、API が壊れ、頼っていたワークフローは消え去ります。ファイルは壊れません。今日書かれた <code>SKILL.md</code> は、2 年後のエージェントにとっても、そしてツールを一切持たない人間にとっても、まったく同じように読めるのです。</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="ほぼ白い編集系の地に、緑のフレームで選択された、プレーンテキストの行が並ぶ一枚の markdown ドキュメントのシート">
        <figcaption>スキルとは単なるファイルです——製品の中に閉じ込められた機能ではなく、エージェントが読むプレーンな Markdown です。</figcaption>
      </figure>
      <h2>なぜシステムもまた Markdown なのか</h2>
      <p>Open Design は数十のデザインシステム——Linear、Vercel、Stripe、Apple、Cursor、Figma など——を <code>DESIGN.md</code> ファイルとして提供します。考え方は同じです。ポータブルで、読みやすく、エージェントが取り込める。</p>
      <p>この文脈におけるデザインシステムとは、Figma のライブラリではありません。それは一つの契約です。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>エージェントはこの契約を読み、それを尊重する仕事を生み出します——知覚的に均一であり続けるよう OKLch で指定された色、そこから外れていかないタイプのスケール、生成された 10 枚の画面が一つの製品として感じられ続けるレイアウトの姿勢です。</p>
      <h3>混ぜ、フォークし、自分のものにする</h3>
      <p>システムは単なるテキストなので、フォークしてその場で編集したり、バリアントを出したり、30 分でゼロから自分のものを書いたりできます。プロジェクトの途中でシステムを混ぜることさえできます——タイポグラフィを Linear から、色のロジックを Vercel から、レイアウトを社内のカスタム仕様から引っ張ってくる——なぜなら、あなたとルールのあいだに立ちはだかるバイナリ形式が存在しないからです。スキルとシステムがどのように組み合わさるのか、その仕組みの全容は <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> で扱っています。</p>
      <h2>BYOK だけが誠実なモデルだ</h2>
      <p>Open Design は <strong>bring-your-own-key</strong> で動きます。OpenAI 互換のあらゆるエンドポイント——DeepSeek、Groq、OpenRouter、あなた自身がセルフホストする vLLM——のベース URL と API キーを貼り付ければ、それで完了です。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>私たちは推論を実行しません。トークンに利益を上乗せしません。あなたとの課金関係を持ちません。これは持続可能性の問題ではなく——「エージェントが走るとき、誰が支払うのか」という問いに対する唯一誠実な答えなのです。</p>
      <h3>プライバシーは同じ選択から導かれる</h3>
      <p>daemon はあなたのマシンから直接プロバイダーを呼び出すため、あなたのプロンプトが私たちのサーバーを経由することは決してありません。それを記録するプロキシも、未公開の作品をひそかに保持する分析パイプラインもありません。エージェンシーの仕事や NDA の下にあるものにとって、「これはどこで走るのか」はもはや調達の議論ではなく、一つの設定になります。より踏み込んだトレードオフ——そして今なお残るざらついた部分——については <a href="/blog/byok-reality-check-5-things-that-break/">the BYOK reality check</a> にあります。</p>
      <p>誰が支払うのかという問いへの答えは、こうです。あなたが、直接、あなたが選んだモデルプロバイダーに支払うのです。私たちは脇に退きます。</p>
      <h2>これがあなたにとって何を意味するか</h2>
      <p>洗練された SaaS と、気の利いたチャットボックスと、一つのサブスクリプションが欲しいなら、私たちは適したツールではありません。その形には良い製品があります——それを使ってください。</p>
      <p>もしあなたが、次のようなワークフローを求めているなら——</p>
      <ul>
      <li>すでに信頼しているエージェントが仕事をこなし、</li>
      <li>スキルは読んで編集できるファイルであり、</li>
      <li>デザインシステムはプロジェクトとエージェントをまたいでポータブルであり、</li>
      <li>そして請求書は私たちではなくモデルプロバイダーに届く——</li>
      </ul>
      <p>そのときこそ、Open Design はあなたのために作られています。GitHub リポジトリに入り、<code>pnpm tools-dev</code> を実行し、エージェントをスキルに向けて、世に出してください。</p>
      <p>スキルレイヤーが勝つのは、それがあなたのノート PC 上のエージェントと競争しないからです。それを増強するのです。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a>——このレイヤーを構成する四つのプリミティブ</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a>——実践における bring-your-own-key モデル</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a>——「製品ではなくレイヤー」という賭けが、既存勢力に対してどこに着地するか</li>
      </ul>
  ko:
    title: "우리가 Open Design을 제품이 아닌 스킬 레이어로 만든 이유"
    summary: "대부분의 AI 디자인 도구는 이미 당신의 노트북에 있는 에이전트를 대체하려 합니다. Open Design은 정반대에 베팅합니다. 스킬, 시스템, 어댑터로 이루어진 얇은 레이어를 제공해, 어떤 코딩 에이전트든 디자인 엔진으로 바꿔 줍니다 — 새로운 앱에 종속되지 않으면서요."
    bodyHtml: |
      <p>지금 당신의 노트북에서 가장 강력한 코딩 에이전트는 Claude, Codex, Cursor, Gemini, OpenCode, 또는 Qwen입니다. 우리는 당신에게 또 하나의 에이전트가 필요하다고 생각하지 않습니다. 부족한 것은 순수한 지능이 아니라 — <strong>안목, 구조, 그리고 디자인을 하나의 공예로 존중하는 워크플로</strong>입니다.</p>
      <p>Open Design은 그 빠진 레이어에 대한 우리의 시도입니다. 채팅 제품이 아닙니다. "내부적으로 AI를 사용하는" 디자인 도구도 아닙니다. 그것은 얇은 스킬 레이어입니다 — <code>SKILL.md</code> 파일들이 담긴 폴더, 이식 가능한 디자인 시스템 라이브러리, 그리고 당신의 기존 CLI 에이전트를 자동 감지해 서로 연결해 주는 daemon입니다.</p>
      <p>이 글은 우리가 왜 그런 선택을 했는지, 그것이 당신이 Open Design을 사용하는 방식에 무엇을 의미하는지, 그리고 왜 "제품이 아닌 레이어"가 지름길이 아니라 지속성에 대한 베팅인지를 설명합니다.</p>
      <h2>제품은 잘못된 형태일 것입니다</h2>
      <p>2026년에 AI 디자인 프로젝트를 시작할 때의 본능은 새 앱을 만드는 것입니다. 채팅 인터페이스, 캔버스, 결제 시스템, 그리고 사용자 수에 비례해 선형으로 증가하는 모델 청구서. 우리는 그 길을 고려했지만 세 가지 이유로 거부했습니다.</p>
      <h3>채팅 인터페이스는 범용재입니다</h3>
      <p>모든 사용자는 이미 유능한 에이전트와 신뢰하는 채팅 창을 가지고 있습니다. 거기에 더 못한 것을 — 우리 브랜드로 포장하고, 사용자가 쌓아 온 손에 익은 감각을 잃어버린 채로 — 추가하는 것은 누구에게도 도움이 되지 않습니다. 가치는 인터페이스에 있지 않습니다. 가치는 당신이 엔터를 누른 <em>후에</em> 에이전트가 무엇을 하느냐에 있습니다. 디자인된 것처럼 보이는 덱을 만들어 내느냐, 아니면 div의 벽을 만들어 내느냐.</p>
      <h3>모델 청구서는 창의성에 부과되는 세금입니다</h3>
      <p>추론을 제품에 묶으면 경제 구조가 당신의 손을 강제합니다. 토큰에 마진을 붙여야 하고, 긴 세션을 제한해야 하며, 마진을 지키기 위해 최신 모델에 대한 접근을 배급해야 합니다. 그 모든 조치는 디자인 도구가 보상해야 할 바로 그 행동을 처벌합니다. 반복하고, 탐색하고, 세 번째 초안에서 작업이 비로소 좋아지기 때문에 에이전트를 다시 돌리는 행동 말입니다.</p>
      <h3>종속은 잘못된 기본값입니다</h3>
      <p>디자이너는 자신의 파일, 시스템, 스킬을 온전히 가진 채로 떠날 수 있어야 합니다. 제품은 모든 것을 독점적인 상태로 감싸 버립니다 — 내보내면 실제의 납작해진 그림자만 얻게 됩니다. 스킬 레이어는 감쌀 것이 없습니다. 산출물이 곧 파일 <em>그 자체이기</em> 때문입니다. 떠나는 데 아무 비용이 들지 않으며, 바로 그렇기 때문에 머무르는 것이 의미를 갖습니다.</p>
      <p>그래서 우리는 대신 레이어를 만들었습니다. 폴더를 떨어뜨리고, daemon을 재시작하면, 스킬이 나타납니다. 그 폴더를 가지고 가서 다른 에이전트에 떨어뜨리면, 거기서도 스킬이 작동합니다.</p>
      <h2>스킬이란 실제로 무엇인가</h2>
      <p>Open Design에서 스킬은 <code>SKILL.md</code> 파일과, 같은 폴더에 있는 선택적인 보조 자산들입니다. 그 Markdown 파일은 다음을 기술합니다.</p>
      <ul>
      <li><strong>스킬이 하는 일</strong> — 평이한 영어로, 한 문단</li>
      <li><strong>언제 호출할지</strong> — 트리거 조건. 에이전트가 올바르게 라우팅할 수 있도록 작성</li>
      <li><strong>출력의 형태</strong> — HTML, PDF, 슬라이드, Markdown 브리프</li>
      <li><strong>제약 조건</strong> — OKLch 팔레트, 폰트 스택, 레이아웃 자세, 브랜드 어휘</li>
      </ul>
      <p>에이전트는 그 파일을 읽고, 호출할지 결정한 다음, 출력을 디스크에 씁니다. 플러그인 시스템도, API 표면도, 버전 호환성 매트릭스도 없습니다. Markdown을 쓸 수 있다면, 스킬을 출시할 수 있습니다.</p>
      <h3>스킬의 해부</h3>
      <p>구체적으로, 스킬은 daemon이 부팅 시 발견하는 디렉터리입니다.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p><code>SKILL.md</code>의 프런트 매터는 스킬과 그 트리거의 이름을 지정합니다. 본문은 에이전트가 브리프처럼 읽는 안내문입니다. 스킬을 등록하는 것은 디스크상의 존재 그 자체뿐입니다 — 올려야 할 매니페스트도, 빌드 단계도, 리뷰 대기열도 없습니다.</p>
      <h3>왜 파일이 플러그인을 이기는가</h3>
      <p>이것은 의도적입니다. 우리는 15년 동안 플러그인 생태계가 쇠퇴하는 것을 지켜봐 왔습니다 — 각각이 표현력과 지속성 사이의 거래였고, 어느 쪽도 이기지 못했습니다. 플러그인은 특정 연도의 누군가의 API를 찍은 스냅숏입니다. 런타임이 움직이고, API가 깨지면, 당신이 의존하던 워크플로는 사라집니다. 파일은 깨지지 않습니다. 오늘 작성된 <code>SKILL.md</code>는 2년 후의 에이전트에게도, 그리고 아무 도구도 없는 사람에게도 정확히 똑같이 읽힙니다.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="거의 흰색에 가까운 편집 디자인 바탕 위에, 평문 텍스트 줄들이 담긴 한 장의 마크다운 문서 시트가 녹색 프레임으로 선택되어 있는 모습">
        <figcaption>스킬은 그저 파일입니다 — 제품 안에 갇힌 기능이 아니라, 에이전트가 읽는 평이한 Markdown입니다.</figcaption>
      </figure>
      <h2>왜 시스템도 Markdown인가</h2>
      <p>Open Design은 수십 개의 디자인 시스템을 — Linear, Vercel, Stripe, Apple, Cursor, Figma 등 — <code>DESIGN.md</code> 파일로 제공합니다. 같은 발상입니다. 이식 가능하고, 읽을 수 있으며, 에이전트가 섭취할 수 있습니다.</p>
      <p>이 맥락에서 디자인 시스템은 Figma 라이브러리가 아닙니다. 그것은 하나의 계약입니다.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>에이전트는 그 계약을 읽고 그것을 존중하는 작업물을 만들어 냅니다 — 지각적으로 고르게 유지되도록 OKLch로 표현된 색상, 벗어나지 않을 타입 램프, 생성된 열 개의 화면이 하나의 제품처럼 느껴지게 하는 레이아웃 자세.</p>
      <h3>섞고, 포크하고, 소유하라</h3>
      <p>시스템은 그저 텍스트이기 때문에, 하나를 포크해서 그 자리에서 편집하거나, 변형판을 출시하거나, 30분 만에 처음부터 직접 작성할 수 있습니다. 심지어 프로젝트 도중에 시스템들을 섞을 수도 있습니다 — 타이포그래피는 Linear에서, 색상 로직은 Vercel에서, 레이아웃은 사내 맞춤 사양에서 가져오는 식으로 — 당신과 규칙 사이를 가로막는 바이너리 포맷이 없기 때문입니다. 스킬과 시스템이 어떻게 조합되는지에 대한 전체 메커니즘은 <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a>에서 다룹니다.</p>
      <h2>BYOK는 유일하게 정직한 모델입니다</h2>
      <p>Open Design은 <strong>자기 키 가져오기(bring-your-own-key)</strong> 방식으로 작동합니다. 어떤 OpenAI 호환 엔드포인트든 — DeepSeek, Groq, OpenRouter, 직접 자체 호스팅한 vLLM 등 — 그 base URL과 API key를 붙여 넣으면, 끝입니다.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>우리는 추론을 돌리지 않습니다. 토큰에 마진을 붙이지 않습니다. 당신과 결제 관계를 맺지 않습니다. 그것은 지속가능성의 문제가 아닙니다 — "에이전트가 돌아갈 때 누가 지불하는가?"라는 질문에 대한 유일하게 정직한 답입니다.</p>
      <h3>프라이버시는 같은 선택에서 따라옵니다</h3>
      <p>daemon이 당신의 머신에서 제공자를 직접 호출하기 때문에, 당신의 프롬프트는 결코 우리 서버를 거치지 않습니다. 그것을 로깅할 프록시도 없고, 당신의 미공개 작업물을 조용히 보관하는 분석 파이프라인도 없습니다. 에이전시 업무나 NDA 하의 어떤 것이든, "이게 어디서 돌아가는가?"는 더 이상 조달 협의가 아니라 하나의 설정이 됩니다. 더 깊은 트레이드오프 — 그리고 여전히 존재하는 거친 모서리들 — 은 <a href="/blog/byok-reality-check-5-things-that-break/">the BYOK reality check</a>에 있습니다.</p>
      <p>누가 지불하느냐에 대한 답은 이것입니다. 당신이, 직접, 당신이 선택한 모델 제공자에게 지불합니다. 우리는 길을 비켜 줍니다.</p>
      <h2>이것이 당신에게 의미하는 것</h2>
      <p>멋진 채팅 창과 단일 구독을 갖춘 잘 다듬어진 SaaS를 원한다면, 우리는 맞는 도구가 아닙니다. 그런 형태의 좋은 제품들이 있습니다 — 그것들을 쓰세요.</p>
      <p>다음과 같은 워크플로를 원한다면,</p>
      <ul>
      <li>이미 신뢰하는 에이전트가 작업을 하고,</li>
      <li>스킬은 읽고 편집할 수 있는 파일이며,</li>
      <li>디자인 시스템은 프로젝트와 에이전트를 넘나들며 이식 가능하고,</li>
      <li>청구서는 우리가 아니라 모델 제공자에게 가는 —</li>
      </ul>
      <p>그렇다면 Open Design은 당신을 위해 만들어졌습니다. GitHub 저장소로 들어가서, <code>pnpm tools-dev</code>를 실행하고, 에이전트를 스킬로 향하게 한 다음, 출시하세요.</p>
      <p>스킬 레이어가 이기는 이유는 그것이 당신의 노트북에 있는 에이전트와 경쟁하지 않기 때문입니다. 그것을 증강합니다.</p>
      <h2>관련해서 읽어 볼 글</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — 이 레이어가 만들어진 네 가지 기본 요소</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> — 실제로 적용된 자기 키 가져오기 모델</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — "제품이 아닌 레이어" 베팅이 기존 강자를 상대로 안착하는 지점</li>
      </ul>
  de:
    title: "Warum wir Open Design als Skill-Schicht gebaut haben, nicht als Produkt"
    summary: "Die meisten KI-Design-Tools versuchen, den Agenten zu ersetzen, der bereits auf deinem Laptop läuft. Open Design setzt auf das Gegenteil: eine dünne Schicht aus Skills, Systemen und Adaptern ausliefern, die jeden Coding-Agenten in eine Design-Engine verwandelt — ohne dich in eine neue App zu sperren."
    bodyHtml: |
      <p>Der stärkste Coding-Agent auf deinem Laptop ist gerade Claude, Codex, Cursor, Gemini, OpenCode oder Qwen. Wir glauben nicht, dass du noch einen weiteren brauchst. Was fehlt, ist nicht rohe Intelligenz — es sind <strong>Geschmack, Struktur und ein Workflow, der Design als Handwerk respektiert</strong>.</p>
      <p>Open Design ist unser Versuch, genau diese fehlende Schicht zu liefern. Es ist kein Chat-Produkt. Es ist kein Design-Tool, das „unter der Haube KI nutzt“. Es ist eine dünne Skill-Schicht — ein Ordner mit <code>SKILL.md</code>-Dateien, eine portable Bibliothek von Design-Systemen und ein daemon, der deine vorhandenen CLI-Agenten automatisch erkennt und miteinander verdrahtet.</p>
      <p>Dieser Beitrag erklärt, warum wir diese Entscheidung getroffen haben, was sie dafür bedeutet, wie du Open Design nutzen wirst, und warum „Schicht, nicht Produkt“ eine Wette auf Langlebigkeit ist statt einer Abkürzung.</p>
      <h2>Ein Produkt hätte die falsche Form</h2>
      <p>Der erste Impuls, wenn man 2026 ein KI-Design-Projekt startet, ist es, eine neue App zu bauen: ein Chat-Interface, eine Canvas, ein Abrechnungssystem, eine Modellrechnung, die linear mit der Nutzerzahl wächst. Wir haben diesen Weg erwogen und ihn aus drei Gründen verworfen.</p>
      <h3>Das Chat-Interface ist eine Massenware</h3>
      <p>Jeder Nutzer hat bereits einen leistungsfähigen Agenten und ein Chatfenster, dem er vertraut. Ein schlechteres hinzuzufügen — verpackt in unsere Marke, ohne das Muskelgedächtnis, das sie aufgebaut haben — hilft niemandem. Das Interface ist nicht der Ort, an dem der Wert liegt. Der Wert liegt in dem, was der Agent tut, <em>nachdem</em> du Enter gedrückt hast: ob er ein Deck erzeugt, das gestaltet aussieht, oder eine Wand aus Divs.</p>
      <h3>Die Modellrechnung ist eine Steuer auf Kreativität</h3>
      <p>Bündelt man die Inferenz ins Produkt, zwingt einen die Ökonomie zum Handeln. Du musst die Tokens mit Aufschlag verkaufen, lange Sitzungen drosseln und den Zugang zu den neuesten Modellen rationieren, damit deine Marge überlebt. Jeder dieser Schritte bestraft genau das Verhalten, das ein Design-Tool belohnen sollte: iterieren, erkunden und den Agenten erneut laufen lassen, weil die dritte Fassung der Punkt ist, an dem die Arbeit gut wird.</p>
      <h3>Lock-in ist die falsche Voreinstellung</h3>
      <p>Designer sollten gehen können, ohne dass ihre Dateien, ihre Systeme und ihre Skills Schaden nehmen. Ein Produkt verpackt alles in proprietären Zustand — exportiere es, und du erhältst einen flachgedrückten Schatten des Originals. Eine Skill-Schicht hat nichts zu verpacken, denn die Artefakte <em>sind</em> die Dateien. Das Gehen kostet nichts, und genau deshalb bedeutet das Bleiben etwas.</p>
      <p>Also haben wir stattdessen die Schicht gebaut. Lege einen Ordner ab, starte den daemon neu, der Skill erscheint. Nimm den Ordner mit, lege ihn in einen anderen Agenten — und der Skill funktioniert auch dort.</p>
      <h2>Was ein Skill tatsächlich ist</h2>
      <p>Ein Skill in Open Design ist eine <code>SKILL.md</code>-Datei plus optionale unterstützende Assets im selben Ordner. Die Markdown-Datei beschreibt:</p>
      <ul>
      <li><strong>Was der Skill tut</strong> — ein Absatz, in klarer Sprache</li>
      <li><strong>Wann er aufzurufen ist</strong> — die Auslösebedingungen, so geschrieben, dass der Agent korrekt routen kann</li>
      <li><strong>Die Form der Ausgabe</strong> — HTML, PDF, Folien, ein Markdown-Briefing</li>
      <li><strong>Die Vorgaben</strong> — Palette in OKLch, Font-Stack, Layout-Haltung, Markenvokabular</li>
      </ul>
      <p>Der Agent liest die Datei, entscheidet, ob er sie aufruft, und schreibt die Ausgabe auf die Festplatte. Es gibt kein Plugin-System, keine API-Oberfläche, keine Versions-Kompatibilitätsmatrix. Wenn du Markdown schreiben kannst, kannst du einen Skill ausliefern.</p>
      <h3>Anatomie eines Skills</h3>
      <p>Konkret ist ein Skill ein Verzeichnis, das der daemon beim Start entdeckt:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Das <code>SKILL.md</code>-Front-Matter benennt den Skill und seine Trigger; der Textkörper ist Anleitung, die der Agent wie ein Briefing liest. Nichts registriert den Skill außer seiner Präsenz auf der Festplatte — kein Manifest, das man hochzählen muss, kein Build-Schritt, keine Review-Warteschlange.</p>
      <h3>Warum Dateien Plugins schlagen</h3>
      <p>Das ist Absicht. Wir haben fünfzehn Jahre lang zugesehen, wie Plugin-Ökosysteme verfallen — jedes ein Kompromiss zwischen Ausdrucksstärke und Langlebigkeit, bei dem keine von beiden gewinnt. Ein Plugin ist eine Momentaufnahme der API von jemandem in einem bestimmten Jahr; die Laufzeit bewegt sich, die API bricht, und der Workflow, auf den du angewiesen warst, ist weg. Dateien brechen nicht. Eine heute geschriebene <code>SKILL.md</code> liest sich für einen Agenten in zwei Jahren exakt gleich — und für einen Menschen ganz ohne Werkzeuge ebenso.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Ein einzelnes Markdown-Dokumentblatt mit einfachen Textzeilen, ausgewählt in einem grünen Rahmen auf einem fast weißen redaktionellen Grund">
        <figcaption>Ein Skill ist einfach nur eine Datei — schlichtes Markdown, das ein Agent liest, kein Feature, das in einem Produkt eingeschlossen ist.</figcaption>
      </figure>
      <h2>Warum auch Systeme Markdown sind</h2>
      <p>Open Design liefert Dutzende von Design-Systemen aus — Linear, Vercel, Stripe, Apple, Cursor, Figma und mehr — als <code>DESIGN.md</code>-Dateien. Dieselbe Idee: portabel, lesbar, für Agenten verarbeitbar.</p>
      <p>Ein Design-System ist in diesem Kontext keine Figma-Bibliothek. Es ist ein Vertrag:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Der Agent liest den Vertrag und produziert Arbeit, die ihn respektiert — Farben in OKLch, damit sie wahrnehmungsmäßig gleichmäßig bleiben, eine Typo-Rampe, von der er nicht abweicht, eine Layout-Haltung, die zehn generierte Screens wie ein einziges Produkt wirken lässt.</p>
      <h3>Mischen, forken und besitzen</h3>
      <p>Weil ein System einfach nur Text ist, kannst du eines forken und an Ort und Stelle bearbeiten, eine Variante ausliefern oder in dreißig Minuten dein eigenes von Grund auf schreiben. Du kannst Systeme sogar mitten im Projekt mischen — die Typografie von Linear ziehen, die Farblogik von Vercel, das Layout aus einer eigenen internen Spezifikation — denn es steht kein Binärformat zwischen dir und den Regeln. Die vollständige Mechanik, wie Skills und Systeme sich zusammensetzen, behandelt <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a>.</p>
      <h2>BYOK ist das einzig ehrliche Modell</h2>
      <p>Open Design läuft nach dem Prinzip <strong>bring-your-own-key</strong>. Du fügst eine Basis-URL und einen API-Schlüssel für einen beliebigen OpenAI-kompatiblen Endpunkt ein — DeepSeek, Groq, OpenRouter, dein eigenes selbst gehostetes vLLM — und fertig:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Wir betreiben keine Inferenz. Wir nehmen keine Marge auf Tokens. Wir haben keine Abrechnungsbeziehung mit dir. Das ist kein Nachhaltigkeitsproblem — es ist die einzig ehrliche Antwort auf die Frage „Wer zahlt, wenn der Agent läuft?“</p>
      <h3>Datenschutz ergibt sich aus derselben Entscheidung</h3>
      <p>Weil der daemon den Anbieter direkt von deiner Maschine aus aufruft, durchlaufen deine Prompts niemals unsere Server. Es gibt keinen Proxy, der sie protokolliert, keine Analyse-Pipeline, die im Stillen deine unveröffentlichte Arbeit aufbewahrt. Für Agenturarbeit oder alles unter NDA wird aus „Wo läuft das?“ keine Beschaffungsdiskussion mehr, sondern eine Einstellung. Die tiefer liegenden Abwägungen — und die rauen Kanten, die es noch gibt — stehen im <a href="/blog/byok-reality-check-5-things-that-break/">BYOK Reality Check</a>.</p>
      <p>Die Antwort auf die Frage, wer zahlt, lautet: du, direkt, an den Modellanbieter, den du gewählt hast. Wir gehen aus dem Weg.</p>
      <h2>Was das für dich bedeutet</h2>
      <p>Wenn du ein poliertes SaaS mit einem hübschen Chatfenster und einem einzigen Abonnement willst, sind wir nicht das richtige Tool. Es gibt gute Produkte dieser Form — nutze sie.</p>
      <p>Wenn du einen Workflow willst, in dem:</p>
      <ul>
      <li>der Agent, dem du bereits vertraust, die Arbeit erledigt,</li>
      <li>die Skills Dateien sind, die du lesen und bearbeiten kannst,</li>
      <li>die Design-Systeme über Projekte und Agenten hinweg portabel sind,</li>
      <li>und die Rechnung an den Modellanbieter geht, nicht an uns —</li>
      </ul>
      <p>dann ist Open Design für dich gebaut. Spring ins GitHub-Repo, führe <code>pnpm tools-dev</code> aus, richte deinen Agenten auf einen Skill und liefere aus.</p>
      <p>Die Skill-Schicht gewinnt, weil sie nicht mit dem Agenten auf deinem Laptop konkurriert. Sie erweitert ihn.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — die vier Primitive, aus denen diese Schicht gebaut ist</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> — das Bring-your-own-key-Modell in der Praxis</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — wo die Wette „Schicht, nicht Produkt“ gegen den Platzhirsch landet</li>
      </ul>
  fr:
    title: "Pourquoi nous avons conçu Open Design comme une couche de compétences, et non comme un produit"
    summary: "La plupart des outils de design IA cherchent à remplacer l’agent déjà présent sur votre ordinateur. Open Design fait le pari inverse : livrer une fine couche de compétences, de systèmes et d’adaptateurs qui transforme n’importe quel agent de code en moteur de design — sans vous enfermer dans une nouvelle application."
    bodyHtml: |
      <p>L’agent de code le plus puissant sur votre ordinateur en ce moment, c’est Claude, Codex, Cursor, Gemini, OpenCode ou Qwen. Nous ne pensons pas que vous en ayez besoin d’un de plus. Ce qui manque, ce n’est pas l’intelligence brute — c’est <strong>le goût, la structure et un flux de travail qui respecte le design comme un métier</strong>.</p>
      <p>Open Design est notre tentative de combler cette couche manquante. Ce n’est pas un produit de chat. Ce n’est pas un outil de design qui « utilise l’IA en coulisses ». C’est une fine couche de compétences — un dossier de fichiers <code>SKILL.md</code>, une bibliothèque portable de systèmes de design, et un daemon qui détecte automatiquement vos agents CLI existants et les relie entre eux.</p>
      <p>Cet article explique pourquoi nous avons fait ce choix, ce qu’il implique pour votre manière d’utiliser Open Design, et pourquoi « une couche, pas un produit » est un pari sur la longévité plutôt qu’un raccourci.</p>
      <h2>Un produit aurait la mauvaise forme</h2>
      <p>L’instinct, lorsqu’on lance un projet de design IA en 2026, est de construire une nouvelle application : une interface de chat, un canevas, un système de facturation, une facture de modèle qui croît linéairement avec votre nombre d’utilisateurs. Nous avons envisagé cette voie et l’avons rejetée pour trois raisons.</p>
      <h3>L’interface de chat est une commodité</h3>
      <p>Chaque utilisateur dispose déjà d’un agent compétent et d’une zone de chat en laquelle il a confiance. En ajouter une moins bonne — habillée de notre marque, dépourvue des automatismes qu’il a acquis — n’aide personne. L’interface n’est pas là où réside la valeur. La valeur réside dans ce que l’agent fait <em>après</em> que vous avez appuyé sur entrée : produire une présentation qui a l’air conçue ou un mur de divs.</p>
      <h3>La facture de modèle est une taxe sur la créativité</h3>
      <p>Intégrez l’inférence dans le produit et l’économie vous force la main. Vous devez majorer les tokens, brider les longues sessions et rationner l’accès aux modèles les plus récents pour préserver votre marge. Chacun de ces choix punit précisément le comportement qu’un outil de design devrait récompenser : itérer, explorer et relancer l’agent parce que c’est au troisième brouillon que le travail devient bon.</p>
      <h3>Le verrouillage est le mauvais réglage par défaut</h3>
      <p>Les designers devraient pouvoir partir avec leurs fichiers, leurs systèmes et leurs compétences intacts. Un produit enveloppe tout dans un état propriétaire — exportez-le et vous obtenez une ombre aplatie de la chose réelle. Une couche de compétences n’a rien à envelopper, parce que les artefacts <em>sont</em> les fichiers. Partir ne coûte rien, et c’est précisément pour cela que rester signifie quelque chose.</p>
      <p>Nous avons donc construit la couche à la place. Déposez un dossier, redémarrez le daemon, la compétence apparaît. Emportez le dossier avec vous, déposez-le dans un autre agent, et la compétence y fonctionne aussi.</p>
      <h2>Ce qu’est réellement une compétence</h2>
      <p>Une compétence dans Open Design est un fichier <code>SKILL.md</code> accompagné d’éventuels fichiers de support dans le même dossier. Le fichier Markdown décrit :</p>
      <ul>
      <li><strong>Ce que fait la compétence</strong> — un paragraphe, en langage clair</li>
      <li><strong>Quand l’invoquer</strong> — les conditions de déclenchement, rédigées de sorte que l’agent puisse router correctement</li>
      <li><strong>La forme de la sortie</strong> — HTML, PDF, diapositives, un brief en Markdown</li>
      <li><strong>Les contraintes</strong> — palette en OKLch, pile de polices, posture de mise en page, vocabulaire de marque</li>
      </ul>
      <p>L’agent lit le fichier, décide s’il doit l’invoquer, et écrit la sortie sur le disque. Il n’y a pas de système de plugins, pas de surface d’API, pas de matrice de compatibilité de versions. Si vous savez écrire du Markdown, vous savez livrer une compétence.</p>
      <h3>Anatomie d’une compétence</h3>
      <p>Concrètement, une compétence est un répertoire que le daemon découvre au démarrage :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Le front matter du fichier <code>SKILL.md</code> nomme la compétence et ses déclencheurs ; le corps est une consigne que l’agent lit comme un brief. Rien n’enregistre la compétence si ce n’est sa présence sur le disque — pas de manifeste à incrémenter, pas d’étape de build, pas de file d’attente de revue.</p>
      <h3>Pourquoi les fichiers l’emportent sur les plugins</h3>
      <p>C’est intentionnel. Nous avons vu des écosystèmes de plugins se dégrader pendant quinze ans — chacun un compromis entre expressivité et longévité, remporté par aucune des deux. Un plugin est un instantané de l’API de quelqu’un à une année donnée ; le runtime évolue, l’API casse, et le flux de travail dont vous dépendiez disparaît. Les fichiers ne cassent pas. Un <code>SKILL.md</code> écrit aujourd’hui se lira exactement de la même façon pour un agent dans deux ans, et pour un humain sans aucun outil.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Une feuille de document markdown unique avec des lignes de texte brut, sélectionnée dans un cadre vert sur un fond éditorial presque blanc">
        <figcaption>Une compétence n’est qu’un fichier — du simple Markdown que lit un agent, et non une fonctionnalité enfermée dans un produit.</figcaption>
      </figure>
      <h2>Pourquoi les systèmes sont aussi du Markdown</h2>
      <p>Open Design livre des dizaines de systèmes de design — Linear, Vercel, Stripe, Apple, Cursor, Figma, et bien d’autres — sous forme de fichiers <code>DESIGN.md</code>. Même idée : portables, lisibles, assimilables par l’agent.</p>
      <p>Un système de design, dans ce contexte, n’est pas une bibliothèque Figma. C’est un contrat :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>L’agent lit le contrat et produit un travail qui le respecte — des couleurs en OKLch pour qu’elles restent perceptuellement uniformes, une échelle typographique dont il ne déviera pas, une posture de mise en page qui fait que dix écrans générés donnent l’impression d’un seul produit.</p>
      <h3>Mélangez, forkez et appropriez-vous</h3>
      <p>Parce qu’un système n’est que du texte, vous pouvez en forker un et le modifier sur place, livrer une variante, ou écrire le vôtre de toutes pièces en trente minutes. Vous pouvez même mélanger des systèmes en cours de projet — prendre la typographie de Linear, la logique de couleur de Vercel, la mise en page d’une spécification interne sur mesure — parce qu’aucun format binaire ne s’interpose entre vous et les règles. Tous les mécanismes de composition des compétences et des systèmes sont détaillés dans <a href="/blog/31-skills-72-systems-how-the-library-works/">31 compétences, 72 systèmes : comment fonctionne la bibliothèque Open Design</a>.</p>
      <h2>Le BYOK est le seul modèle honnête</h2>
      <p>Open Design fonctionne en <strong>bring-your-own-key</strong>. Vous collez une URL de base et une clé d’API pour n’importe quel endpoint compatible OpenAI — DeepSeek, Groq, OpenRouter, votre propre vLLM auto-hébergé — et c’est terminé :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Nous n’exécutons pas l’inférence. Nous ne prenons pas de marge sur les tokens. Nous n’avons aucune relation de facturation avec vous. Ce n’est pas un problème de viabilité — c’est la seule réponse honnête à la question « qui paie quand l’agent tourne ? ».</p>
      <h3>La confidentialité découle du même choix</h3>
      <p>Parce que le daemon appelle le fournisseur directement depuis votre machine, vos prompts ne transitent jamais par nos serveurs. Il n’y a aucun proxy pour les journaliser, aucun pipeline d’analytique qui conserve discrètement vos travaux non publiés. Pour le travail en agence ou tout ce qui relève d’un NDA, « où cela tourne-t-il ? » cesse d’être une conversation d’achat pour devenir un réglage. Les compromis plus profonds — et les aspérités qui subsistent encore — sont abordés dans <a href="/blog/byok-reality-check-5-things-that-break/">le bilan de réalité du BYOK</a>.</p>
      <p>La réponse à la question de qui paie est : vous, directement, au fournisseur de modèle que vous avez choisi. Nous nous écartons du chemin.</p>
      <h2>Ce que cela signifie pour vous</h2>
      <p>Si vous voulez un SaaS soigné avec une jolie zone de chat et un abonnement unique, nous ne sommes pas le bon outil. Il existe de bons produits de cette forme — utilisez-les.</p>
      <p>Si vous voulez un flux de travail où :</p>
      <ul>
      <li>l’agent auquel vous faites déjà confiance accomplit le travail,</li>
      <li>les compétences sont des fichiers que vous pouvez lire et modifier,</li>
      <li>les systèmes de design sont portables d’un projet et d’un agent à l’autre,</li>
      <li>et la facture va au fournisseur de modèle, pas à nous —</li>
      </ul>
      <p>alors Open Design est fait pour vous. Plongez dans le dépôt GitHub, lancez <code>pnpm tools-dev</code>, pointez votre agent vers une compétence, et livrez.</p>
      <p>La couche de compétences l’emporte parce qu’elle ne rivalise pas avec l’agent sur votre ordinateur. Elle l’augmente.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 compétences, 72 systèmes : comment fonctionne la bibliothèque Open Design</a> — les quatre primitives sur lesquelles repose cette couche</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flux de travail de design BYOK : exécutez Claude, Codex ou Qwen avec votre propre clé</a> — le modèle bring-your-own-key en pratique</li>
      <li><a href="/blog/figma-alternative-open-design/">L’alternative open source à Figma</a> — où le pari « une couche, pas un produit » se situe face à l’acteur dominant</li>
      </ul>
  ru:
    title: "Почему мы сделали Open Design слоем навыков, а не продуктом"
    summary: "Большинство AI-инструментов для дизайна пытаются заменить агента, который уже стоит у вас на ноутбуке. Open Design делает противоположную ставку: поставляет тонкий слой навыков, систем и адаптеров, которые превращают любого coding-агента в дизайн-движок — не привязывая вас к новому приложению."
    bodyHtml: |
      <p>Самый сильный coding-агент на вашем ноутбуке прямо сейчас — это Claude, Codex, Cursor, Gemini, OpenCode или Qwen. Мы не считаем, что вам нужен ещё один. Не хватает не сырого интеллекта, а <strong>вкуса, структуры и рабочего процесса, который относится к дизайну как к ремеслу</strong>.</p>
      <p>Open Design — это наша попытка создать тот самый недостающий слой. Это не чат-продукт. Это не дизайн-инструмент, который «использует AI под капотом». Это тонкий слой навыков — папка с файлами <code>SKILL.md</code>, переносимая библиотека дизайн-систем и daemon, который автоматически обнаруживает ваших уже установленных CLI-агентов и связывает их вместе.</p>
      <p>В этом материале мы объясняем, почему сделали такой выбор, что он означает для того, как вы будете пользоваться Open Design, и почему «слой, а не продукт» — это ставка на долговечность, а не короткий путь.</p>
      <h2>Продукт был бы неправильной формой</h2>
      <p>Инстинкт при запуске AI-проекта в области дизайна в 2026 году — построить новое приложение: чат-интерфейс, холст, систему биллинга, счёт за модель, который растёт линейно с числом ваших пользователей. Мы рассматривали этот путь и отказались от него по трём причинам.</p>
      <h3>Чат-интерфейс — это товар широкого потребления</h3>
      <p>У каждого пользователя уже есть способный агент и чат-окно, которому он доверяет. Добавление худшего — обёрнутого в наш бренд, лишённого мышечной памяти, которую он наработал, — никому не поможет. Ценность не в интерфейсе. Ценность в том, что агент делает <em>после</em> того, как вы нажали Enter: создаёт ли он презентацию, которая выглядит продуманно спроектированной, или стену из div-ов.</p>
      <h3>Счёт за модель — это налог на творчество</h3>
      <p>Встройте инференс в продукт — и экономика вынудит вас действовать определённым образом. Вам придётся накручивать наценку на токены, ограничивать длинные сессии и нормировать доступ к новейшим моделям, чтобы ваша маржа выжила. Каждый из этих шагов наказывает ровно то поведение, которое дизайн-инструмент должен поощрять: итерации, эксперименты и повторный запуск агента, потому что именно в третьем черновике работа становится хорошей.</p>
      <h3>Привязка — неправильное значение по умолчанию</h3>
      <p>Дизайнеры должны иметь возможность уйти, сохранив свои файлы, свои системы и свои навыки в целости. Продукт оборачивает всё в проприетарное состояние — экспортируйте его, и вы получите уплощённую тень настоящего. Слою навыков нечего оборачивать, потому что артефакты <em>и есть</em> файлы. Уход не стоит ничего — и именно поэтому то, что вы остаётесь, что-то значит.</p>
      <p>Поэтому мы построили слой. Положите папку, перезапустите daemon — навык появляется. Заберите папку с собой, положите её в другого агента — навык работает и там.</p>
      <h2>Что на самом деле представляет собой навык</h2>
      <p>Навык в Open Design — это файл <code>SKILL.md</code> плюс необязательные вспомогательные ресурсы в той же папке. Файл Markdown описывает:</p>
      <ul>
      <li><strong>Что делает навык</strong> — один абзац, на простом языке</li>
      <li><strong>Когда его вызывать</strong> — условия срабатывания, написанные так, чтобы агент мог корректно маршрутизировать</li>
      <li><strong>Форму вывода</strong> — HTML, PDF, слайды, бриф в Markdown</li>
      <li><strong>Ограничения</strong> — палитра в OKLch, набор шрифтов, манера вёрстки, словарь бренда</li>
      </ul>
      <p>Агент читает файл, решает, вызывать ли его, и записывает результат на диск. Нет системы плагинов, нет поверхности API, нет матрицы совместимости версий. Если вы умеете писать на Markdown, вы можете выпустить навык.</p>
      <h3>Анатомия навыка</h3>
      <p>Конкретно, навык — это каталог, который daemon обнаруживает при запуске:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Front matter в <code>SKILL.md</code> задаёт имя навыка и его триггеры; тело — это инструкции, которые агент читает как бриф. Ничто не регистрирует навык, кроме его наличия на диске — нет манифеста, который надо обновлять, нет шага сборки, нет очереди на ревью.</p>
      <h3>Почему файлы лучше плагинов</h3>
      <p>Это сделано намеренно. Мы наблюдали, как экосистемы плагинов приходят в упадок на протяжении пятнадцати лет — каждая из них компромисс между выразительностью и долговечностью, в котором не выигрывает ни то, ни другое. Плагин — это снимок чьего-то API в конкретном году; среда выполнения меняется, API ломается, и рабочий процесс, на который вы полагались, исчезает. Файлы не ломаются. <code>SKILL.md</code>, написанный сегодня, через два года читается агентом ровно так же — и человеком вообще без всяких инструментов.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Один лист markdown-документа со строками обычного текста, выделенный зелёной рамкой на почти белом редакционном фоне">
        <figcaption>Навык — это просто файл: обычный Markdown, который читает агент, а не функция, запертая внутри продукта.</figcaption>
      </figure>
      <h2>Почему системы — это тоже Markdown</h2>
      <p>Open Design поставляет десятки дизайн-систем — Linear, Vercel, Stripe, Apple, Cursor, Figma и другие — в виде файлов <code>DESIGN.md</code>. Та же идея: переносимые, читаемые, доступные для восприятия агентом.</p>
      <p>Дизайн-система в этом контексте — это не библиотека Figma. Это контракт:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Агент читает контракт и выдаёт работу, которая его соблюдает — цвета в OKLch, чтобы они оставались перцептивно ровными, шкалу шрифтов, от которой он не отклонится, манеру вёрстки, благодаря которой десять сгенерированных экранов ощущаются как один продукт.</p>
      <h3>Смешивайте, форкайте и владейте</h3>
      <p>Поскольку система — это просто текст, вы можете форкнуть её и отредактировать на месте, выпустить вариант или написать собственную с нуля за тридцать минут. Вы можете даже смешивать системы посреди проекта — взять типографику из Linear, логику цвета из Vercel, вёрстку из собственной внутренней спецификации — потому что между вами и правилами нет двоичного формата. Полная механика того, как навыки и системы компонуются, описана в статье <a href="/blog/31-skills-72-systems-how-the-library-works/">31 навык, 72 системы: как работает библиотека Open Design</a>.</p>
      <h2>BYOK — единственная честная модель</h2>
      <p>Open Design работает по принципу <strong>принеси свой ключ</strong>. Вы вставляете базовый URL и API-ключ для любой совместимой с OpenAI конечной точки — DeepSeek, Groq, OpenRouter, ваш собственный самостоятельно размещённый vLLM — и готово:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Мы не запускаем инференс. Мы не берём маржу с токенов. У нас нет с вами биллинговых отношений. Это не проблема устойчивости — это единственный честный ответ на вопрос «кто платит, когда работает агент?».</p>
      <h3>Приватность следует из того же выбора</h3>
      <p>Поскольку daemon обращается к провайдеру напрямую с вашей машины, ваши запросы никогда не проходят через наши серверы. Нет прокси, который бы их логировал, нет аналитического конвейера, тихо удерживающего вашу неопубликованную работу. Для агентской работы или чего угодно под NDA вопрос «где это выполняется?» перестаёт быть темой закупочного разговора и становится настройкой. Более глубокие компромиссы — и шероховатости, которые всё ещё существуют, — описаны в <a href="/blog/byok-reality-check-5-things-that-break/">проверке реальностью для BYOK</a>.</p>
      <p>Ответ на вопрос, кто платит, таков: вы, напрямую, провайдеру модели, которого выбрали. Мы уходим с дороги.</p>
      <h2>Что это значит для вас</h2>
      <p>Если вам нужен отполированный SaaS с приятным чат-окном и единой подпиской, мы — не тот инструмент. Есть хорошие продукты такой формы — пользуйтесь ими.</p>
      <p>Если вам нужен рабочий процесс, где:</p>
      <ul>
      <li>работу делает агент, которому вы уже доверяете,</li>
      <li>навыки — это файлы, которые вы можете читать и редактировать,</li>
      <li>дизайн-системы переносимы между проектами и агентами,</li>
      <li>а счёт идёт провайдеру модели, а не нам, —</li>
      </ul>
      <p>тогда Open Design создан для вас. Зайдите в репозиторий на GitHub, запустите <code>pnpm tools-dev</code>, направьте своего агента на навык — и выпускайте.</p>
      <p>Слой навыков побеждает, потому что он не конкурирует с агентом на вашем ноутбуке. Он его дополняет.</p>
      <h2>Что почитать ещё</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навык, 72 системы: как работает библиотека Open Design</a> — четыре примитива, из которых построен этот слой</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Дизайн-процесс по модели BYOK: запускайте Claude, Codex или Qwen на собственном ключе</a> — модель «принеси свой ключ» на практике</li>
      <li><a href="/blog/figma-alternative-open-design/">Open-source-альтернатива Figma</a> — где ставка «слой, а не продукт» оказывается против действующего игрока рынка</li>
      </ul>
  es:
    title: "Por qué construimos Open Design como una capa de skills, no como un producto"
    summary: "La mayoría de las herramientas de diseño con IA intentan reemplazar el agente que ya tienes en tu portátil. Open Design apuesta por lo contrario: ofrecer una capa ligera de skills, sistemas y adaptadores que convierten cualquier coding agent en un motor de diseño, sin atarte a una nueva aplicación."
    bodyHtml: |
      <p>El coding agent más potente que tienes ahora mismo en tu portátil es Claude, Codex, Cursor, Gemini, OpenCode o Qwen. No creemos que necesites otro. Lo que falta no es inteligencia bruta, sino <strong>gusto, estructura y un flujo de trabajo que respete el diseño como un oficio</strong>.</p>
      <p>Open Design es nuestro intento de aportar esa capa que falta. No es un producto de chat. No es una herramienta de diseño que «usa IA por debajo». Es una capa ligera de skills: una carpeta de archivos <code>SKILL.md</code>, una biblioteca portátil de sistemas de diseño y un daemon que detecta automáticamente tus agentes CLI existentes y los conecta entre sí.</p>
      <p>Este artículo explica por qué tomamos esa decisión, qué implica para la forma en que usarás Open Design y por qué «capa, no producto» es una apuesta por la longevidad y no un atajo.</p>
      <h2>Un producto tendría la forma equivocada</h2>
      <p>El instinto, al iniciar un proyecto de diseño con IA en 2026, es construir una nueva aplicación: una interfaz de chat, un lienzo, un sistema de facturación, una factura de modelo que crece linealmente con tu número de usuarios. Consideramos ese camino y lo descartamos por tres razones.</p>
      <h3>La interfaz de chat es un commodity</h3>
      <p>Cada usuario ya tiene un agente capaz y un cuadro de chat en el que confía. Añadir uno peor —envuelto en nuestra marca, sin la memoria muscular que han construido— no ayuda a nadie. El valor no está en la interfaz. El valor está en lo que el agente hace <em>después</em> de que pulsas enter: si produce una presentación que parece diseñada o un muro de divs.</p>
      <h3>La factura del modelo es un impuesto sobre la creatividad</h3>
      <p>Si integras la inferencia en el producto, la economía te fuerza la mano. Tienes que aplicar un margen a los tokens, limitar las sesiones largas y racionar el acceso a los modelos más nuevos para que tu margen sobreviva. Cada uno de esos movimientos castiga precisamente el comportamiento que una herramienta de diseño debería premiar: iterar, explorar y volver a ejecutar el agente porque el tercer borrador es donde el trabajo se vuelve bueno.</p>
      <h3>El lock-in es el valor por defecto equivocado</h3>
      <p>Los diseñadores deberían poder marcharse con sus archivos, sus sistemas y sus skills intactos. Un producto envuelve todo en un estado propietario: lo exportas y obtienes una sombra aplanada de lo real. Una capa de skills no tiene nada que envolver, porque los artefactos <em>son</em> los archivos. Marcharse no cuesta nada, y por eso precisamente quedarse significa algo.</p>
      <p>Así que construimos la capa en su lugar. Suelta una carpeta, reinicia el daemon y la skill aparece. Llévate la carpeta contigo, suéltala en un agente distinto y la skill también funciona allí.</p>
      <h2>Qué es realmente una skill</h2>
      <p>Una skill en Open Design es un archivo <code>SKILL.md</code> más recursos de apoyo opcionales en la misma carpeta. El archivo Markdown describe:</p>
      <ul>
      <li><strong>Qué hace la skill</strong>: un párrafo, en lenguaje sencillo</li>
      <li><strong>Cuándo invocarla</strong>: las condiciones de activación, escritas para que el agente pueda enrutar correctamente</li>
      <li><strong>La forma de la salida</strong>: HTML, PDF, diapositivas, un brief en Markdown</li>
      <li><strong>Las restricciones</strong>: paleta en OKLch, pila tipográfica, postura de maquetación, vocabulario de marca</li>
      </ul>
      <p>El agente lee el archivo, decide si invocarla y escribe la salida en disco. No hay sistema de plugins, ni superficie de API, ni matriz de compatibilidad de versiones. Si sabes escribir Markdown, puedes publicar una skill.</p>
      <h3>Anatomía de una skill</h3>
      <p>En concreto, una skill es un directorio que el daemon descubre al arrancar:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>El front matter de <code>SKILL.md</code> nombra la skill y sus activadores; el cuerpo es la guía que el agente lee como un brief. Nada registra la skill salvo su presencia en disco: ningún manifiesto que actualizar, ningún paso de compilación, ninguna cola de revisión.</p>
      <h3>Por qué los archivos ganan a los plugins</h3>
      <p>Esto es intencionado. Hemos visto cómo los ecosistemas de plugins se deterioran desde hace quince años, cada uno un compromiso entre expresividad y longevidad, sin ganar ninguna de las dos. Un plugin es una instantánea de la API de alguien en un año concreto; el runtime evoluciona, la API se rompe y el flujo de trabajo del que dependías desaparece. Los archivos no se rompen. Un <code>SKILL.md</code> escrito hoy se leerá exactamente igual para un agente dentro de dos años, y para un humano sin herramienta alguna.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Una sola hoja de documento markdown con líneas de texto plano, seleccionada en un marco verde sobre un fondo editorial casi blanco">
        <figcaption>Una skill es solo un archivo: Markdown plano que un agente lee, no una función encerrada dentro de un producto.</figcaption>
      </figure>
      <h2>Por qué los sistemas también son Markdown</h2>
      <p>Open Design incluye decenas de sistemas de diseño —Linear, Vercel, Stripe, Apple, Cursor, Figma y más— como archivos <code>DESIGN.md</code>. La misma idea: portátiles, legibles, ingeribles por el agente.</p>
      <p>Un sistema de diseño, en este contexto, no es una biblioteca de Figma. Es un contrato:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>El agente lee el contrato y produce un trabajo que lo respeta: colores en OKLch para que se mantengan perceptualmente uniformes, una escala tipográfica de la que no se desvía y una postura de maquetación que hace que diez pantallas generadas se sientan como un solo producto.</p>
      <h3>Mezcla, bifurca y hazlo tuyo</h3>
      <p>Como un sistema es solo texto, puedes bifurcar uno y editarlo en su sitio, publicar una variante o escribir el tuyo desde cero en treinta minutos. Incluso puedes mezclar sistemas a mitad de proyecto —tomar la tipografía de Linear, la lógica de color de Vercel, la maquetación de una especificación interna a medida— porque no hay ningún formato binario interponiéndose entre tú y las reglas. La mecánica completa de cómo se componen las skills y los sistemas se cubre en <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: cómo funciona la biblioteca de Open Design</a>.</p>
      <h2>BYOK es el único modelo honesto</h2>
      <p>Open Design funciona con <strong>bring-your-own-key</strong>. Pegas una URL base y una API key de cualquier endpoint compatible con OpenAI —DeepSeek, Groq, OpenRouter, tu propio vLLM autoalojado— y listo:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>No ejecutamos inferencia. No aplicamos margen a los tokens. No tenemos una relación de facturación contigo. Eso no es un problema de sostenibilidad: es la única respuesta honesta a la pregunta «¿quién paga cuando el agente se ejecuta?».</p>
      <h3>La privacidad se deriva de la misma decisión</h3>
      <p>Como el daemon llama al proveedor directamente desde tu máquina, tus prompts nunca pasan por nuestros servidores. No hay ningún proxy que los registre, ni una canalización de analítica que retenga en silencio tu trabajo aún sin publicar. Para el trabajo de agencia o cualquier cosa bajo NDA, «¿dónde se ejecuta esto?» deja de ser una conversación de compras y se convierte en una opción de configuración. Las concesiones más profundas —y las asperezas que aún existen— están en <a href="/blog/byok-reality-check-5-things-that-break/">el chequeo de realidad de BYOK</a>.</p>
      <p>La respuesta a quién paga es: tú, directamente, al proveedor del modelo que elegiste. Nosotros nos apartamos del camino.</p>
      <h2>Qué significa esto para ti</h2>
      <p>Si quieres un SaaS pulido con un bonito cuadro de chat y una única suscripción, no somos la herramienta adecuada. Hay buenos productos con esa forma; úsalos.</p>
      <p>Si quieres un flujo de trabajo donde:</p>
      <ul>
      <li>el agente en el que ya confías hace el trabajo,</li>
      <li>las skills son archivos que puedes leer y editar,</li>
      <li>los sistemas de diseño son portátiles entre proyectos y agentes,</li>
      <li>y la factura va al proveedor del modelo, no a nosotros,</li>
      </ul>
      <p>entonces Open Design está hecho para ti. Entra en el repositorio de GitHub, ejecuta <code>pnpm tools-dev</code>, apunta tu agente a una skill y publica.</p>
      <p>La capa de skills gana porque no compite con el agente de tu portátil. Lo potencia.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: cómo funciona la biblioteca de Open Design</a>: las cuatro primitivas con las que se construye esta capa</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flujo de trabajo de diseño BYOK: ejecuta Claude, Codex o Qwen con tu propia key</a>: el modelo bring-your-own-key en la práctica</li>
      <li><a href="/blog/figma-alternative-open-design/">La alternativa de código abierto a Figma</a>: dónde aterriza la apuesta de «capa, no producto» frente al titular del sector</li>
      </ul>
  pt-br:
    title: "Por que construímos o Open Design como uma camada de skills, e não como um produto"
    summary: "A maioria das ferramentas de design com IA tenta substituir o agente que você já tem no seu laptop. O Open Design faz a aposta oposta: entregar uma camada fina de skills, sistemas e adaptadores que transforma qualquer coding agent em um motor de design — sem prender você a um novo aplicativo."
    bodyHtml: |
      <p>O coding agent mais forte no seu laptop neste momento é o Claude, Codex, Cursor, Gemini, OpenCode ou Qwen. Não achamos que você precise de mais um. O que falta não é inteligência bruta — é <strong>bom gosto, estrutura e um fluxo de trabalho que respeite o design como um ofício</strong>.</p>
      <p>O Open Design é nossa tentativa de preencher essa camada que falta. Não é um produto de chat. Não é uma ferramenta de design que “usa IA por baixo dos panos”. É uma camada fina de skills — uma pasta de arquivos <code>SKILL.md</code>, uma biblioteca portátil de design systems e um daemon que detecta automaticamente seus agentes de CLI existentes e os conecta entre si.</p>
      <p>Este post explica por que fizemos essa escolha, o que ela implica para a forma como você vai usar o Open Design e por que “camada, não produto” é uma aposta na longevidade, e não um atalho.</p>
      <h2>Um produto teria o formato errado</h2>
      <p>O instinto, ao iniciar um projeto de design com IA em 2026, é construir um novo aplicativo: uma interface de chat, um canvas, um sistema de cobrança, uma conta de modelo que cresce linearmente com o número de usuários. Consideramos esse caminho e o rejeitamos por três motivos.</p>
      <h3>A interface de chat é uma commodity</h3>
      <p>Todo usuário já tem um agente capaz e uma caixa de chat em que confia. Adicionar uma pior — embrulhada na nossa marca, sem a memória muscular que ele já construiu — não ajuda ninguém. O valor não está na interface. O valor está no que o agente faz <em>depois</em> que você aperta enter: se ele produz um deck com cara de algo bem desenhado ou uma parede de divs.</p>
      <h3>A conta do modelo é um imposto sobre a criatividade</h3>
      <p>Inclua a inferência no produto e a economia força a sua mão. Você tem que marcar um lucro sobre os tokens, limitar sessões longas e racionar o acesso aos modelos mais novos para que sua margem sobreviva. Cada uma dessas medidas pune exatamente o comportamento que uma ferramenta de design deveria recompensar: iterar, explorar e rodar o agente de novo, porque é no terceiro rascunho que o trabalho fica bom.</p>
      <h3>Lock-in é o padrão errado</h3>
      <p>Designers deveriam poder ir embora com seus arquivos, seus sistemas e suas skills intactos. Um produto embrulha tudo em estado proprietário — exporte e você recebe uma sombra achatada da coisa real. Uma camada de skills não tem nada para embrulhar, porque os artefatos <em>são</em> os arquivos. Sair não custa nada, e é exatamente por isso que ficar significa algo.</p>
      <p>Então construímos a camada em vez disso. Largue uma pasta, reinicie o daemon, a skill aparece. Leve a pasta com você, largue-a em um agente diferente, e a skill funciona lá também.</p>
      <h2>O que uma skill realmente é</h2>
      <p>Uma skill no Open Design é um arquivo <code>SKILL.md</code> mais ativos de apoio opcionais na mesma pasta. O arquivo Markdown descreve:</p>
      <ul>
      <li><strong>O que a skill faz</strong> — um parágrafo, em linguagem simples</li>
      <li><strong>Quando invocá-la</strong> — as condições de gatilho, escritas de modo que o agente consiga rotear corretamente</li>
      <li><strong>O formato da saída</strong> — HTML, PDF, slides, um briefing em Markdown</li>
      <li><strong>As restrições</strong> — paleta em OKLch, pilha de fontes, postura de layout, vocabulário da marca</li>
      </ul>
      <p>O agente lê o arquivo, decide se deve invocá-la e grava a saída em disco. Não há sistema de plugins, nenhuma superfície de API, nenhuma matriz de compatibilidade de versões. Se você sabe escrever Markdown, você sabe entregar uma skill.</p>
      <h3>Anatomia de uma skill</h3>
      <p>Concretamente, uma skill é um diretório que o daemon descobre na inicialização:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>O front matter do <code>SKILL.md</code> nomeia a skill e seus gatilhos; o corpo é a orientação que o agente lê como um briefing. Nada registra a skill além da sua presença em disco — nenhum manifesto para atualizar, nenhuma etapa de build, nenhuma fila de revisão.</p>
      <h3>Por que arquivos vencem plugins</h3>
      <p>Isso é intencional. Vimos ecossistemas de plugins decaírem por quinze anos — cada um deles uma troca entre expressividade e longevidade, vencida por nenhuma das duas. Um plugin é um instantâneo da API de alguém em um ano específico; o runtime muda, a API quebra e o fluxo de trabalho do qual você dependia some. Arquivos não quebram. Um <code>SKILL.md</code> escrito hoje será lido exatamente da mesma forma por um agente daqui a dois anos, e por um humano sem nenhuma ferramenta.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Uma única folha de documento markdown com linhas de texto simples, selecionada em um quadro verde sobre um fundo editorial quase branco">
        <figcaption>Uma skill é apenas um arquivo — Markdown simples que um agente lê, e não um recurso preso dentro de um produto.</figcaption>
      </figure>
      <h2>Por que os sistemas também são Markdown</h2>
      <p>O Open Design entrega dezenas de design systems — Linear, Vercel, Stripe, Apple, Cursor, Figma e mais — como arquivos <code>DESIGN.md</code>. Mesma ideia: portátil, legível, assimilável por agentes.</p>
      <p>Um design system, nesse contexto, não é uma biblioteca do Figma. É um contrato:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>O agente lê o contrato e produz um trabalho que o respeita — cores em OKLch para que permaneçam perceptualmente uniformes, uma escala tipográfica da qual ele não vai se desviar, uma postura de layout que mantém dez telas geradas com a cara de um único produto.</p>
      <h3>Misture, faça um fork e seja dono</h3>
      <p>Como um sistema é apenas texto, você pode fazer um fork e editá-lo no lugar, entregar uma variante ou escrever o seu próprio do zero em trinta minutos. Você pode até misturar sistemas no meio de um projeto — puxar a tipografia do Linear, a lógica de cor da Vercel, o layout de uma especificação interna personalizada — porque não há formato binário entre você e as regras. A mecânica completa de como skills e sistemas se compõem está coberta em <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: como funciona a biblioteca do Open Design</a>.</p>
      <h2>BYOK é o único modelo honesto</h2>
      <p>O Open Design roda no modelo <strong>bring-your-own-key</strong>. Você cola uma base URL e uma API key de qualquer endpoint compatível com OpenAI — DeepSeek, Groq, OpenRouter, seu próprio vLLM auto-hospedado — e pronto:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Nós não rodamos a inferência. Nós não tiramos uma margem sobre os tokens. Nós não temos uma relação de cobrança com você. Isso não é um problema de sustentabilidade — é a única resposta honesta para a pergunta “quem paga quando o agente roda?”</p>
      <h3>A privacidade decorre da mesma escolha</h3>
      <p>Como o daemon chama o provedor diretamente da sua máquina, seus prompts nunca transitam pelos nossos servidores. Não há proxy para registrá-los, nenhum pipeline de analytics retendo silenciosamente seu trabalho ainda não publicado. Para trabalho de agência ou qualquer coisa sob NDA, “onde isso roda?” deixa de ser uma conversa de compras e vira uma configuração. As compensações mais profundas — e as arestas que ainda existem — estão no <a href="/blog/byok-reality-check-5-things-that-break/">teste de realidade do BYOK</a>.</p>
      <p>A resposta para quem paga é: você paga, diretamente, ao provedor de modelo que escolheu. Nós saímos do caminho.</p>
      <h2>O que isso significa para você</h2>
      <p>Se você quer um SaaS polido com uma caixa de chat bonita e uma única assinatura, não somos a ferramenta certa. Existem bons produtos nesse formato — use-os.</p>
      <p>Se você quer um fluxo de trabalho em que:</p>
      <ul>
      <li>o agente em que você já confia faz o trabalho,</li>
      <li>as skills são arquivos que você pode ler e editar,</li>
      <li>os design systems são portáteis entre projetos e agentes,</li>
      <li>e a conta vai para o provedor de modelo, não para nós —</li>
      </ul>
      <p>então o Open Design foi feito para você. Entre no repositório do GitHub, rode <code>pnpm tools-dev</code>, aponte seu agente para uma skill e entregue.</p>
      <p>A camada de skills vence porque não compete com o agente no seu laptop. Ela o potencializa.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: como funciona a biblioteca do Open Design</a> — os quatro primitivos a partir dos quais esta camada é construída</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Fluxo de design BYOK: rode Claude, Codex ou Qwen com sua própria key</a> — o modelo bring-your-own-key na prática</li>
      <li><a href="/blog/figma-alternative-open-design/">A alternativa open-source ao Figma</a> — onde a aposta de “camada, não produto” se posiciona contra o incumbente</li>
      </ul>
  it:
    title: "Perché abbiamo costruito Open Design come uno strato di skill, non come un prodotto"
    summary: "La maggior parte degli strumenti di design basati sull'AI cerca di sostituire l'agente che hai già sul tuo laptop. Open Design fa la scommessa opposta: distribuire un sottile strato di skill, system e adapter che trasformano qualsiasi coding agent in un motore di design — senza vincolarti a una nuova app."
    bodyHtml: |
      <p>Il coding agent più potente che hai sul tuo laptop in questo momento è Claude, Codex, Cursor, Gemini, OpenCode o Qwen. Non pensiamo che ti serva un altro. Ciò che manca non è l'intelligenza grezza — è <strong>il gusto, la struttura e un flusso di lavoro che rispetta il design come un mestiere</strong>.</p>
      <p>Open Design è il nostro tentativo di colmare quello strato mancante. Non è un prodotto di chat. Non è uno strumento di design che “usa l'AI sotto il cofano”. È un sottile strato di skill — una cartella di file <code>SKILL.md</code>, una libreria portatile di design system e un daemon che rileva automaticamente i tuoi CLI agent esistenti e li collega tra loro.</p>
      <p>Questo articolo spiega perché abbiamo fatto questa scelta, cosa implica per il modo in cui userai Open Design e perché “strato, non prodotto” è una scommessa sulla longevità anziché una scorciatoia.</p>
      <h2>Un prodotto avrebbe la forma sbagliata</h2>
      <p>L'istinto, quando si avvia un progetto di design basato sull'AI nel 2026, è costruire una nuova app: un'interfaccia di chat, un canvas, un sistema di fatturazione, una bolletta dei modelli che cresce in modo lineare con il numero di utenti. Abbiamo considerato questa strada e l'abbiamo respinta per tre motivi.</p>
      <h3>L'interfaccia di chat è una commodity</h3>
      <p>Ogni utente ha già un agente capace e una casella di chat di cui si fida. Aggiungerne una peggiore — avvolta nel nostro marchio, priva della memoria muscolare che si è costruito — non aiuta nessuno. Il valore non è nell'interfaccia. Il valore è in ciò che l'agente fa <em>dopo</em> che hai premuto invio: se produce una presentazione dall'aspetto curato o un muro di div.</p>
      <h3>La bolletta dei modelli è una tassa sulla creatività</h3>
      <p>Includi l'inferenza nel prodotto e l'economia ti forza la mano. Devi ricaricare i token, limitare le sessioni lunghe e razionare l'accesso ai modelli più recenti per far sopravvivere il tuo margine. Ognuna di queste mosse punisce esattamente il comportamento che uno strumento di design dovrebbe premiare: iterare, esplorare ed eseguire di nuovo l'agente perché è alla terza bozza che il lavoro diventa buono.</p>
      <h3>Il lock-in è l'impostazione predefinita sbagliata</h3>
      <p>I designer dovrebbero poter andarsene con i loro file, i loro system e le loro skill intatti. Un prodotto avvolge tutto in uno stato proprietario — esportalo e ottieni un'ombra appiattita della cosa reale. Uno strato di skill non ha nulla da avvolgere, perché gli artefatti <em>sono</em> i file. Andarsene non costa nulla, ed è proprio per questo che restare significa qualcosa.</p>
      <p>Così abbiamo costruito invece lo strato. Inserisci una cartella, riavvia il daemon, la skill compare. Porta la cartella con te, inseriscila in un agente diverso, la skill funziona anche lì.</p>
      <h2>Cos'è davvero una skill</h2>
      <p>Una skill in Open Design è un file <code>SKILL.md</code> più eventuali asset di supporto nella stessa cartella. Il file Markdown descrive:</p>
      <ul>
      <li><strong>Cosa fa la skill</strong> — un paragrafo, in linguaggio semplice</li>
      <li><strong>Quando invocarla</strong> — le condizioni di attivazione, scritte in modo che l'agente possa instradare correttamente</li>
      <li><strong>La forma dell'output</strong> — HTML, PDF, slide, un brief in Markdown</li>
      <li><strong>I vincoli</strong> — palette in OKLch, stack di font, postura di layout, vocabolario del marchio</li>
      </ul>
      <p>L'agente legge il file, decide se invocarla e scrive l'output su disco. Non c'è alcun sistema di plugin, nessuna superficie API, nessuna matrice di compatibilità delle versioni. Se sai scrivere Markdown, sai distribuire una skill.</p>
      <h3>Anatomia di una skill</h3>
      <p>Concretamente, una skill è una directory che il daemon scopre all'avvio:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Il front matter di <code>SKILL.md</code> dà il nome alla skill e ai suoi trigger; il corpo è una guida che l'agente legge come un brief. Niente registra la skill se non la sua presenza su disco — nessun manifest da aggiornare, nessuna fase di build, nessuna coda di revisione.</p>
      <h3>Perché i file battono i plugin</h3>
      <p>È una scelta intenzionale. Abbiamo osservato gli ecosistemi di plugin decadere per quindici anni — ognuno un compromesso tra espressività e longevità, vinto da nessuno dei due. Un plugin è un'istantanea dell'API di qualcuno in un anno particolare; il runtime si evolve, l'API si rompe e il flusso di lavoro da cui dipendevi sparisce. I file non si rompono. Un <code>SKILL.md</code> scritto oggi si legge esattamente allo stesso modo per un agente tra due anni, e per un essere umano senza alcuno strumento.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Un singolo foglio di documento markdown con righe di testo semplice, selezionato in una cornice verde su uno sfondo editoriale quasi bianco">
        <figcaption>Una skill è solo un file — semplice Markdown che un agente legge, non una funzionalità bloccata dentro un prodotto.</figcaption>
      </figure>
      <h2>Perché anche i system sono Markdown</h2>
      <p>Open Design distribuisce decine di design system — Linear, Vercel, Stripe, Apple, Cursor, Figma e altri ancora — come file <code>DESIGN.md</code>. Stessa idea: portatili, leggibili, assimilabili dall'agente.</p>
      <p>Un design system, in questo contesto, non è una libreria Figma. È un contratto:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>L'agente legge il contratto e produce un lavoro che lo rispetta — colori in OKLch così da restare percettivamente uniformi, una scala tipografica da cui non si discosterà, una postura di layout che fa sì che dieci schermate generate sembrino un unico prodotto.</p>
      <h3>Mescola, fai il fork e rendili tuoi</h3>
      <p>Poiché un system è solo testo, puoi farne il fork e modificarlo sul posto, distribuire una variante o scriverne uno tuo da zero in trenta minuti. Puoi persino mescolare più system a metà progetto — prendere la tipografia da Linear, la logica dei colori da Vercel, il layout da una specifica interna personalizzata — perché non c'è alcun formato binario tra te e le regole. L'intero meccanismo di come skill e system si compongono è descritto in <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a>.</p>
      <h2>BYOK è l'unico modello onesto</h2>
      <p>Open Design funziona con il <strong>bring-your-own-key</strong>. Incolli un base URL e una API key per qualsiasi endpoint compatibile con OpenAI — DeepSeek, Groq, OpenRouter, il tuo vLLM self-hosted — e hai finito:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Non eseguiamo l'inferenza. Non prendiamo un margine sui token. Non abbiamo un rapporto di fatturazione con te. Non è un problema di sostenibilità — è l'unica risposta onesta alla domanda “chi paga quando l'agente gira?”</p>
      <h3>La privacy deriva dalla stessa scelta</h3>
      <p>Poiché il daemon chiama il provider direttamente dalla tua macchina, i tuoi prompt non transitano mai sui nostri server. Non c'è alcun proxy a registrarli, nessuna pipeline di analytics che trattiene silenziosamente il tuo lavoro non ancora pubblicato. Per il lavoro di agenzia o per qualsiasi cosa coperta da NDA, “dove gira tutto questo?” smette di essere una conversazione di procurement e diventa un'impostazione. I compromessi più profondi — e gli spigoli che ancora esistono — sono in <a href="/blog/byok-reality-check-5-things-that-break/">the BYOK reality check</a>.</p>
      <p>La risposta a chi paga è: paghi tu, direttamente, al provider di modelli che hai scelto. Noi ci togliamo di mezzo.</p>
      <h2>Cosa significa questo per te</h2>
      <p>Se vuoi un SaaS rifinito con una bella casella di chat e un unico abbonamento, non siamo lo strumento giusto. Ci sono buoni prodotti di quella forma — usali.</p>
      <p>Se vuoi un flusso di lavoro in cui:</p>
      <ul>
      <li>l'agente di cui ti fidi già fa il lavoro,</li>
      <li>le skill sono file che puoi leggere e modificare,</li>
      <li>i design system sono portatili tra progetti e agenti,</li>
      <li>e la bolletta va al provider di modelli, non a noi —</li>
      </ul>
      <p>allora Open Design è costruito per te. Entra nel repository GitHub, esegui <code>pnpm tools-dev</code>, punta il tuo agente su una skill e distribuisci.</p>
      <p>Lo strato di skill vince perché non compete con l'agente sul tuo laptop. Lo potenzia.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — i quattro primitivi da cui è costruito questo strato</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> — il modello bring-your-own-key nella pratica</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — dove la scommessa “strato, non prodotto” si colloca rispetto all'incumbent</li>
      </ul>
  vi:
    title: "Vì sao chúng tôi xây dựng Open Design như một lớp kỹ năng, chứ không phải một sản phẩm"
    summary: "Hầu hết các công cụ thiết kế AI đều cố thay thế agent đã có sẵn trên máy bạn. Open Design đặt cược theo hướng ngược lại: cung cấp một lớp mỏng gồm các kỹ năng, hệ thống và bộ chuyển đổi giúp biến bất kỳ coding agent nào thành một cỗ máy thiết kế — mà không trói bạn vào một ứng dụng mới."
    bodyHtml: |
      <p>Coding agent mạnh nhất trên máy bạn lúc này là Claude, Codex, Cursor, Gemini, OpenCode hoặc Qwen. Chúng tôi không nghĩ bạn cần thêm một cái nữa. Thứ còn thiếu không phải là trí thông minh thô — mà là <strong>gu thẩm mỹ, cấu trúc, và một quy trình tôn trọng thiết kế như một nghề thủ công</strong>.</p>
      <p>Open Design là nỗ lực của chúng tôi để bù đắp cái lớp còn thiếu đó. Nó không phải một sản phẩm chat. Nó cũng không phải một công cụ thiết kế “dùng AI ẩn bên dưới”. Nó là một lớp kỹ năng mỏng — một thư mục chứa các tệp <code>SKILL.md</code>, một thư viện hệ thống thiết kế khả chuyển, và một daemon tự động phát hiện các CLI agent bạn đang có rồi kết nối chúng lại với nhau.</p>
      <p>Bài viết này giải thích vì sao chúng tôi đưa ra lựa chọn đó, nó hàm ý điều gì cho cách bạn sẽ dùng Open Design, và vì sao “lớp, không phải sản phẩm” là một sự đặt cược vào tuổi thọ chứ không phải một lối tắt.</p>
      <h2>Sản phẩm sẽ là hình thái sai</h2>
      <p>Bản năng khi khởi động một dự án thiết kế AI vào năm 2026 là dựng một ứng dụng mới: một giao diện chat, một canvas, một hệ thống thanh toán, một hóa đơn mô hình tăng tuyến tính theo số lượng người dùng. Chúng tôi đã cân nhắc con đường đó và từ chối nó vì ba lý do.</p>
      <h3>Giao diện chat là hàng hóa phổ thông</h3>
      <p>Mọi người dùng đều đã có sẵn một agent đủ năng lực và một ô chat mà họ tin tưởng. Thêm vào một cái tệ hơn — gói trong thương hiệu của chúng tôi, thiếu đi trí nhớ cơ bắp mà họ đã rèn luyện — chẳng giúp ích cho ai. Giá trị không nằm ở giao diện. Giá trị nằm ở những gì agent làm <em>sau khi</em> bạn nhấn enter: liệu nó tạo ra một bộ slide trông được thiết kế hay một mớ div lộn xộn.</p>
      <h3>Hóa đơn mô hình là một thứ thuế đánh vào sự sáng tạo</h3>
      <p>Gói suy luận vào sản phẩm và bài toán kinh tế sẽ buộc tay bạn. Bạn phải đội giá token, bóp băng thông các phiên dài, và phân phối hạn chế quyền truy cập vào những mô hình mới nhất để biên lợi nhuận của bạn còn sống. Mỗi động thái đó đều trừng phạt đúng cái hành vi mà một công cụ thiết kế đáng lẽ phải khích lệ: lặp lại, khám phá, và chạy lại agent một lần nữa bởi bản nháp thứ ba mới là nơi tác phẩm trở nên hay.</p>
      <h3>Khóa chân là một mặc định sai</h3>
      <p>Nhà thiết kế phải có quyền rời đi với tệp, hệ thống và kỹ năng của họ còn nguyên vẹn. Một sản phẩm gói mọi thứ trong trạng thái độc quyền — xuất nó ra và bạn chỉ nhận được một cái bóng bị làm phẳng của thứ thực sự. Một lớp kỹ năng thì chẳng có gì để gói cả, bởi các sản phẩm tạo ra <em>chính là</em> các tệp. Rời đi không tốn gì cả, mà đó chính là lý do việc ở lại trở nên có ý nghĩa.</p>
      <p>Vậy nên chúng tôi xây dựng cái lớp thay vì sản phẩm. Thả một thư mục vào, khởi động lại daemon, kỹ năng xuất hiện. Mang thư mục đó theo, thả nó vào một agent khác, kỹ năng cũng hoạt động ở đó.</p>
      <h2>Một kỹ năng thực chất là gì</h2>
      <p>Một kỹ năng trong Open Design là một tệp <code>SKILL.md</code> cộng với các tài nguyên hỗ trợ tùy chọn trong cùng thư mục. Tệp Markdown đó mô tả:</p>
      <ul>
      <li><strong>Kỹ năng làm gì</strong> — một đoạn văn, bằng tiếng Anh giản dị</li>
      <li><strong>Khi nào kích hoạt nó</strong> — các điều kiện kích hoạt, viết sao cho agent có thể định tuyến chính xác</li>
      <li><strong>Hình thái của đầu ra</strong> — HTML, PDF, slide, một bản tóm tắt Markdown</li>
      <li><strong>Các ràng buộc</strong> — bảng màu theo OKLch, ngăn xếp font, tư thế bố cục, từ vựng thương hiệu</li>
      </ul>
      <p>Agent đọc tệp, quyết định có nên kích hoạt hay không, rồi ghi đầu ra ra đĩa. Không có hệ thống plugin, không có bề mặt API, không có ma trận tương thích phiên bản. Nếu bạn viết được Markdown, bạn có thể xuất bản một kỹ năng.</p>
      <h3>Giải phẫu một kỹ năng</h3>
      <p>Cụ thể, một kỹ năng là một thư mục mà daemon phát hiện khi khởi động:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Phần front matter của <code>SKILL.md</code> đặt tên cho kỹ năng và các điều kiện kích hoạt của nó; phần thân là hướng dẫn mà agent đọc như một bản brief. Chẳng có gì đăng ký kỹ năng ngoài sự hiện diện của nó trên đĩa — không có manifest để cập nhật, không có bước build, không có hàng đợi duyệt.</p>
      <h3>Vì sao tệp thắng plugin</h3>
      <p>Điều này là có chủ ý. Chúng tôi đã chứng kiến các hệ sinh thái plugin lụi tàn suốt mười lăm năm — mỗi cái là một sự đánh đổi giữa khả năng biểu đạt và tuổi thọ, mà chẳng bên nào thắng. Một plugin là một bản chụp nhanh API của ai đó trong một năm cụ thể; runtime dịch chuyển, API hỏng, và quy trình bạn phụ thuộc vào biến mất. Tệp thì không hỏng. Một tệp <code>SKILL.md</code> viết hôm nay sẽ được một agent đọc y hệt vào hai năm sau, và cả với một con người không có công cụ gì trong tay.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Một tờ tài liệu markdown đơn lẻ với những dòng văn bản thuần, được chọn trong một khung xanh lá trên nền biên tập gần như trắng">
        <figcaption>Một kỹ năng chỉ là một tệp — Markdown thuần mà agent đọc, không phải một tính năng bị khóa bên trong một sản phẩm.</figcaption>
      </figure>
      <h2>Vì sao các hệ thống cũng là Markdown</h2>
      <p>Open Design cung cấp hàng chục hệ thống thiết kế — Linear, Vercel, Stripe, Apple, Cursor, Figma, và nhiều hơn nữa — dưới dạng các tệp <code>DESIGN.md</code>. Cùng một ý tưởng: khả chuyển, dễ đọc, agent tiêu thụ được.</p>
      <p>Trong bối cảnh này, một hệ thống thiết kế không phải là một thư viện Figma. Nó là một hợp đồng:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Agent đọc hợp đồng và tạo ra tác phẩm tôn trọng nó — màu sắc theo OKLch để chúng giữ được sự đồng đều về mặt cảm thụ, một thang kiểu chữ mà nó sẽ không trôi dạt khỏi, một tư thế bố cục giữ cho mười màn hình được tạo ra vẫn cảm thấy như cùng một sản phẩm.</p>
      <h3>Pha trộn, fork, và sở hữu</h3>
      <p>Bởi vì một hệ thống chỉ là văn bản, bạn có thể fork một cái rồi chỉnh sửa tại chỗ, xuất bản một biến thể, hoặc tự viết từ đầu trong ba mươi phút. Bạn thậm chí có thể pha trộn các hệ thống giữa chừng dự án — lấy phần kiểu chữ từ Linear, logic màu từ Vercel, bố cục từ một quy chuẩn nội bộ riêng — bởi không có định dạng nhị phân nào đứng chắn giữa bạn và các quy tắc. Toàn bộ cơ chế về cách các kỹ năng và hệ thống kết hợp với nhau được trình bày trong <a href="/blog/31-skills-72-systems-how-the-library-works/">31 kỹ năng, 72 hệ thống: thư viện Open Design hoạt động ra sao</a>.</p>
      <h2>BYOK là mô hình trung thực duy nhất</h2>
      <p>Open Design chạy theo nguyên tắc <strong>mang khóa của chính bạn</strong>. Bạn dán vào một base URL và một API key cho bất kỳ điểm cuối tương thích OpenAI nào — DeepSeek, Groq, OpenRouter, hoặc vLLM tự lưu trữ của riêng bạn — và thế là xong:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Chúng tôi không chạy suy luận. Chúng tôi không lấy biên lợi nhuận trên token. Chúng tôi không có quan hệ thanh toán với bạn. Đó không phải là một vấn đề về tính bền vững — đó là câu trả lời trung thực duy nhất cho câu hỏi “ai trả tiền khi agent chạy?”</p>
      <h3>Quyền riêng tư đi liền từ cùng một lựa chọn</h3>
      <p>Bởi vì daemon gọi nhà cung cấp trực tiếp từ máy của bạn, các prompt của bạn không bao giờ đi qua máy chủ của chúng tôi. Không có proxy nào để ghi log chúng, không có đường ống phân tích nào âm thầm lưu giữ tác phẩm chưa công bố của bạn. Với công việc agency hay bất cứ thứ gì thuộc diện NDA, câu “cái này chạy ở đâu?” thôi không còn là một cuộc đối thoại mua sắm mà trở thành một thiết lập. Những đánh đổi sâu hơn — và những gờ cạnh vẫn còn tồn tại — nằm trong <a href="/blog/byok-reality-check-5-things-that-break/">bài kiểm chứng thực tế về BYOK</a>.</p>
      <p>Câu trả lời cho việc ai trả tiền là: bạn trả, trực tiếp, cho nhà cung cấp mô hình bạn đã chọn. Chúng tôi tránh sang một bên.</p>
      <h2>Điều này có ý nghĩa gì với bạn</h2>
      <p>Nếu bạn muốn một SaaS bóng bẩy với một ô chat đẹp và một gói đăng ký duy nhất, chúng tôi không phải công cụ phù hợp. Có những sản phẩm tốt theo hình thái đó — hãy dùng chúng.</p>
      <p>Nếu bạn muốn một quy trình nơi mà:</p>
      <ul>
      <li>agent bạn vốn đã tin tưởng làm phần việc,</li>
      <li>các kỹ năng là những tệp bạn có thể đọc và chỉnh sửa,</li>
      <li>các hệ thống thiết kế khả chuyển qua các dự án và agent,</li>
      <li>và hóa đơn đi tới nhà cung cấp mô hình, chứ không phải chúng tôi —</li>
      </ul>
      <p>thì Open Design được xây dựng cho bạn. Nhảy vào repo GitHub, chạy <code>pnpm tools-dev</code>, trỏ agent của bạn vào một kỹ năng, và xuất bản.</p>
      <p>Lớp kỹ năng thắng bởi nó không cạnh tranh với agent trên máy bạn. Nó tăng cường cho agent đó.</p>
      <h2>Đọc thêm liên quan</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 kỹ năng, 72 hệ thống: thư viện Open Design hoạt động ra sao</a> — bốn thành phần nguyên thủy mà lớp này được dựng nên từ đó</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Quy trình thiết kế BYOK: chạy Claude, Codex, hoặc Qwen bằng khóa của chính bạn</a> — mô hình mang khóa của chính bạn trong thực tế</li>
      <li><a href="/blog/figma-alternative-open-design/">Giải pháp thay thế mã nguồn mở cho Figma</a> — nơi sự đặt cược “lớp, không phải sản phẩm” chạm trán với kẻ đương nhiệm</li>
      </ul>
  pl:
    title: "Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt"
    summary: "Większość narzędzi projektowych opartych na AI próbuje zastąpić agenta, który już działa na Twoim laptopie. Open Design stawia na coś przeciwnego: dostarcza cienką warstwę umiejętności, systemów i adapterów, które zamieniają dowolnego agenta do kodowania w silnik projektowy — bez przywiązywania Cię do nowej aplikacji."
    bodyHtml: |
      <p>Najsilniejszy agent do kodowania na Twoim laptopie to dziś Claude, Codex, Cursor, Gemini, OpenCode lub Qwen. Nie sądzimy, że potrzebujesz kolejnego. Brakuje nie surowej inteligencji — brakuje <strong>gustu, struktury i przepływu pracy, który traktuje projektowanie jako rzemiosło</strong>.</p>
      <p>Open Design to nasza próba dostarczenia tej brakującej warstwy. To nie jest produkt czatowy. To nie jest narzędzie projektowe, które „pod maską korzysta z AI”. To cienka warstwa umiejętności — folder z plikami <code>SKILL.md</code>, przenośna biblioteka systemów projektowych oraz daemon, który automatycznie wykrywa Twoich istniejących agentów CLI i łączy je ze sobą.</p>
      <p>Ten wpis wyjaśnia, dlaczego dokonaliśmy takiego wyboru, co oznacza on dla sposobu, w jaki będziesz korzystać z Open Design, i dlaczego „warstwa, nie produkt” to zakład o trwałość, a nie droga na skróty.</p>
      <h2>Produkt miałby niewłaściwy kształt</h2>
      <p>Instynkt, gdy zaczyna się projekt projektowy oparty na AI w 2026 roku, każe zbudować nową aplikację: interfejs czatu, kanwę, system rozliczeń, rachunek za modele, który rośnie liniowo wraz z liczbą użytkowników. Rozważyliśmy tę drogę i odrzuciliśmy ją z trzech powodów.</p>
      <h3>Interfejs czatu to towar masowy</h3>
      <p>Każdy użytkownik ma już sprawnego agenta i okno czatu, któremu ufa. Dodanie gorszego — owiniętego w naszą markę, pozbawionego pamięci mięśniowej, którą sobie wypracował — nikomu nie pomaga. Wartość nie leży w interfejsie. Wartość leży w tym, co agent robi <em>po</em> naciśnięciu Enter: czy tworzy prezentację, która wygląda na zaprojektowaną, czy ścianę divów.</p>
      <h3>Rachunek za modele to podatek od kreatywności</h3>
      <p>Wbuduj wnioskowanie w produkt, a ekonomia wymusi Twoje ruchy. Musisz doliczyć marżę do tokenów, ograniczać długie sesje i racjonować dostęp do najnowszych modeli, żeby Twoja marża przetrwała. Każdy z tych ruchów karze dokładnie te zachowania, które narzędzie projektowe powinno nagradzać: iterowanie, eksplorowanie i ponowne uruchamianie agenta, bo to przy trzeciej wersji praca staje się naprawdę dobra.</p>
      <h3>Uwięzienie to niewłaściwe ustawienie domyślne</h3>
      <p>Projektanci powinni móc odejść z nienaruszonymi plikami, systemami i umiejętnościami. Produkt owija wszystko w zastrzeżony stan — wyeksportuj go, a dostaniesz spłaszczony cień prawdziwej rzeczy. Warstwa umiejętności nie ma czego owijać, bo artefaktami <em>są</em> pliki. Odejście nic nie kosztuje, i właśnie dlatego pozostanie coś znaczy.</p>
      <p>Zbudowaliśmy więc warstwę. Wrzuć folder, zrestartuj daemona, umiejętność się pojawia. Zabierz folder ze sobą, wrzuć go do innego agenta, a umiejętność działa również tam.</p>
      <h2>Czym właściwie jest umiejętność</h2>
      <p>Umiejętność w Open Design to plik <code>SKILL.md</code> plus opcjonalne zasoby pomocnicze w tym samym folderze. Plik Markdown opisuje:</p>
      <ul>
      <li><strong>Co umiejętność robi</strong> — jeden akapit, prostym językiem</li>
      <li><strong>Kiedy ją wywołać</strong> — warunki wyzwalające, zapisane tak, by agent mógł poprawnie kierować</li>
      <li><strong>Kształt wyniku</strong> — HTML, PDF, slajdy, brief w Markdown</li>
      <li><strong>Ograniczenia</strong> — paleta w OKLch, zestaw fontów, postawa układu, słownictwo marki</li>
      </ul>
      <p>Agent czyta plik, decyduje, czy go wywołać, i zapisuje wynik na dysk. Nie ma systemu wtyczek, nie ma powierzchni API, nie ma macierzy zgodności wersji. Jeśli potrafisz pisać w Markdown, potrafisz wydać umiejętność.</p>
      <h3>Anatomia umiejętności</h3>
      <p>Konkretnie, umiejętność to katalog, który daemon odkrywa podczas startu:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Front matter w <code>SKILL.md</code> nadaje nazwę umiejętności i jej wyzwalaczom; treść to wskazówki, które agent czyta jak brief. Nic nie rejestruje umiejętności poza jej obecnością na dysku — żadnego manifestu do zaktualizowania, żadnego kroku budowania, żadnej kolejki recenzji.</p>
      <h3>Dlaczego pliki biją wtyczki</h3>
      <p>To celowy zabieg. Od piętnastu lat obserwujemy, jak ekosystemy wtyczek niszczeją — każdy z nich to kompromis między ekspresyjnością a trwałością, w którym nie wygrywa żadna ze stron. Wtyczka to migawka czyjegoś API z konkretnego roku; środowisko uruchomieniowe się zmienia, API się psuje, a przepływ pracy, na którym polegałeś, znika. Pliki się nie psują. <code>SKILL.md</code> napisany dzisiaj będzie czytany przez agenta za dwa lata dokładnie tak samo — i przez człowieka bez żadnych narzędzi.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Pojedyncza kartka dokumentu markdown z liniami zwykłego tekstu, zaznaczona zieloną ramką na niemal białym, redakcyjnym tle">
        <figcaption>Umiejętność to po prostu plik — zwykły Markdown, który czyta agent, a nie funkcja zamknięta wewnątrz produktu.</figcaption>
      </figure>
      <h2>Dlaczego systemy też są w Markdown</h2>
      <p>Open Design dostarcza dziesiątki systemów projektowych — Linear, Vercel, Stripe, Apple, Cursor, Figma i więcej — jako pliki <code>DESIGN.md</code>. Ta sama idea: przenośne, czytelne, możliwe do przyswojenia przez agenta.</p>
      <p>System projektowy w tym kontekście to nie biblioteka Figma. To kontrakt:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Agent czyta kontrakt i tworzy pracę, która go respektuje — kolory w OKLch, by pozostawały percepcyjnie równe, skalę typografii, od której nie odbiega, oraz postawę układu, dzięki której dziesięć wygenerowanych ekranów sprawia wrażenie jednego produktu.</p>
      <h3>Mieszaj, forkuj i posiadaj</h3>
      <p>Ponieważ system to zwykły tekst, możesz go sforkować i edytować w miejscu, wydać wariant albo napisać własny od zera w trzydzieści minut. Możesz nawet mieszać systemy w trakcie projektu — wziąć typografię z Linear, logikę kolorów z Vercel, układ z własnej, wewnętrznej specyfikacji — bo między Tobą a regułami nie stoi żaden format binarny. Pełną mechanikę składania umiejętności i systemów opisano w <a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy: jak działa biblioteka Open Design</a>.</p>
      <h2>BYOK to jedyny uczciwy model</h2>
      <p>Open Design działa w modelu <strong>bring-your-own-key</strong>. Wklejasz bazowy adres URL i klucz API dowolnego punktu końcowego zgodnego z OpenAI — DeepSeek, Groq, OpenRouter, własny, samodzielnie hostowany vLLM — i gotowe:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Nie uruchamiamy wnioskowania. Nie pobieramy marży od tokenów. Nie łączy nas z Tobą relacja rozliczeniowa. To nie jest problem z modelem biznesowym — to jedyna uczciwa odpowiedź na pytanie „kto płaci, gdy agent działa?”.</p>
      <h3>Prywatność wynika z tego samego wyboru</h3>
      <p>Ponieważ daemon wywołuje dostawcę bezpośrednio z Twojej maszyny, Twoje prompty nigdy nie przechodzą przez nasze serwery. Nie ma proxy, które by je logowało, ani potoku analitycznego po cichu przechowującego Twoją niewydaną jeszcze pracę. Dla pracy agencyjnej lub czegokolwiek objętego NDA pytanie „gdzie to się uruchamia?” przestaje być rozmową z działem zakupów, a staje się ustawieniem. Głębsze kompromisy — i wciąż istniejące szorstkie krawędzie — opisaliśmy w <a href="/blog/byok-reality-check-5-things-that-break/">teście rzeczywistości BYOK</a>.</p>
      <p>Odpowiedź na pytanie, kto płaci, brzmi: Ty, bezpośrednio, wybranemu przez siebie dostawcy modelu. My schodzimy z drogi.</p>
      <h2>Co to oznacza dla Ciebie</h2>
      <p>Jeśli chcesz dopracowanego SaaS-a z ładnym oknem czatu i jedną subskrypcją, nie jesteśmy właściwym narzędziem. Istnieją dobre produkty w takim kształcie — korzystaj z nich.</p>
      <p>Jeśli chcesz przepływu pracy, w którym:</p>
      <ul>
      <li>pracę wykonuje agent, któremu już ufasz,</li>
      <li>umiejętności to pliki, które możesz czytać i edytować,</li>
      <li>systemy projektowe są przenośne między projektami i agentami,</li>
      <li>a rachunek trafia do dostawcy modelu, a nie do nas —</li>
      </ul>
      <p>to Open Design jest stworzony dla Ciebie. Wejdź do repozytorium na GitHub, uruchom <code>pnpm tools-dev</code>, wskaż agentowi umiejętność i wydawaj.</p>
      <p>Warstwa umiejętności wygrywa, bo nie konkuruje z agentem na Twoim laptopie. Wzmacnia go.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy: jak działa biblioteka Open Design</a> — cztery prymitywy, z których zbudowana jest ta warstwa</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Przepływ pracy projektowej BYOK: uruchom Claude, Codex lub Qwen na własnym kluczu</a> — model bring-your-own-key w praktyce</li>
      <li><a href="/blog/figma-alternative-open-design/">Otwartoźródłowa alternatywa dla Figma</a> — gdzie zakład „warstwa, nie produkt” wypada w starciu z liderem rynku</li>
      </ul>
  id:
    title: "Mengapa kami membangun Open Design sebagai lapisan skill, bukan produk"
    summary: "Sebagian besar alat desain AI berusaha menggantikan agent yang sudah ada di laptop Anda. Open Design mengambil taruhan yang berlawanan: menghadirkan lapisan tipis berisi skill, sistem, dan adapter yang mengubah coding agent apa pun menjadi mesin desain — tanpa mengunci Anda ke aplikasi baru."
    bodyHtml: |
      <p>Coding agent terkuat di laptop Anda saat ini adalah Claude, Codex, Cursor, Gemini, OpenCode, atau Qwen. Kami rasa Anda tidak butuh satu lagi. Yang kurang bukanlah kecerdasan mentah — melainkan <strong>selera, struktur, dan alur kerja yang menghormati desain sebagai sebuah keahlian</strong>.</p>
      <p>Open Design adalah upaya kami menghadirkan lapisan yang hilang itu. Ini bukan produk chat. Ini bukan alat desain yang “menggunakan AI di balik layar.” Ini adalah lapisan skill yang tipis — sebuah folder berisi file <code>SKILL.md</code>, pustaka design system yang portabel, dan daemon yang otomatis mendeteksi agent CLI Anda yang sudah ada lalu menyambungkannya.</p>
      <p>Tulisan ini menjelaskan mengapa kami membuat pilihan tersebut, apa implikasinya terhadap cara Anda menggunakan Open Design, dan mengapa “lapisan, bukan produk” adalah taruhan pada ketahanan jangka panjang, bukan jalan pintas.</p>
      <h2>Sebuah produk akan menjadi bentuk yang keliru</h2>
      <p>Naluri saat memulai proyek desain AI pada 2026 adalah membangun aplikasi baru: antarmuka chat, kanvas, sistem penagihan, dan tagihan model yang tumbuh linier seiring jumlah pengguna Anda. Kami mempertimbangkan jalur itu dan menolaknya karena tiga alasan.</p>
      <h3>Antarmuka chat adalah komoditas</h3>
      <p>Setiap pengguna sudah memiliki agent yang mumpuni dan kotak chat yang mereka percayai. Menambahkan yang lebih buruk — dibungkus merek kami, kehilangan kebiasaan yang sudah mereka bangun — tidak membantu siapa pun. Antarmuka bukanlah tempat nilai berada. Nilai ada pada apa yang dilakukan agent <em>setelah</em> Anda menekan enter: apakah ia menghasilkan deck yang tampak terdesain atau sekadar tumpukan div.</p>
      <h3>Tagihan model adalah pajak atas kreativitas</h3>
      <p>Bungkus inferensi ke dalam produk dan ekonominya akan memaksa tangan Anda. Anda harus menaikkan harga token, membatasi sesi panjang, dan menjatah akses ke model terbaru agar margin Anda bertahan. Setiap langkah itu menghukum justru perilaku yang seharusnya dihargai oleh sebuah alat desain: melakukan iterasi, mengeksplorasi, dan menjalankan agent lagi karena draf ketigalah tempat karya menjadi bagus.</p>
      <h3>Lock-in adalah default yang keliru</h3>
      <p>Desainer harus bisa pergi dengan file, sistem, dan skill mereka tetap utuh. Sebuah produk membungkus semuanya dalam state berhak milik — ekspor lah, dan Anda hanya mendapat bayangan datar dari hal yang sebenarnya. Lapisan skill tidak punya apa pun untuk dibungkus, karena artefaknya <em>adalah</em> file itu sendiri. Pergi tidak menelan biaya apa pun, dan justru itulah sebabnya bertahan menjadi bermakna.</p>
      <p>Maka kami membangun lapisannya. Letakkan sebuah folder, jalankan ulang daemon, skill pun muncul. Bawa folder itu, letakkan di agent yang berbeda, dan skill itu bekerja di sana juga.</p>
      <h2>Apa sebenarnya sebuah skill itu</h2>
      <p>Sebuah skill di Open Design adalah file <code>SKILL.md</code> ditambah aset pendukung opsional di folder yang sama. File Markdown tersebut menjelaskan:</p>
      <ul>
      <li><strong>Apa yang dilakukan skill</strong> — satu paragraf, dalam bahasa yang jelas</li>
      <li><strong>Kapan harus memanggilnya</strong> — kondisi pemicu, ditulis agar agent dapat merutekannya dengan benar</li>
      <li><strong>Bentuk keluarannya</strong> — HTML, PDF, slide, atau ringkasan Markdown</li>
      <li><strong>Batasan-batasannya</strong> — palet warna dalam OKLch, font stack, postur tata letak, kosakata merek</li>
      </ul>
      <p>Agent membaca file itu, memutuskan apakah akan memanggilnya, lalu menulis keluaran ke disk. Tidak ada sistem plugin, tidak ada permukaan API, tidak ada matriks kompatibilitas versi. Jika Anda bisa menulis Markdown, Anda bisa menghadirkan sebuah skill.</p>
      <h3>Anatomi sebuah skill</h3>
      <p>Secara konkret, sebuah skill adalah sebuah direktori yang ditemukan daemon saat boot:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Front matter <code>SKILL.md</code> menamai skill beserta pemicunya; bagian isinya adalah panduan yang dibaca agent layaknya sebuah brief. Tidak ada yang mendaftarkan skill selain keberadaannya di disk — tidak ada manifest yang perlu dinaikkan, tidak ada langkah build, tidak ada antrean review.</p>
      <h3>Mengapa file mengalahkan plugin</h3>
      <p>Ini disengaja. Kami telah menyaksikan ekosistem plugin membusuk selama lima belas tahun — masing-masing merupakan kompromi antara ekspresivitas dan ketahanan, yang tak satu pun benar-benar memenangkannya. Sebuah plugin adalah potret API seseorang pada tahun tertentu; runtime bergerak, API rusak, dan alur kerja yang Anda andalkan pun lenyap. File tidak rusak. Sebuah <code>SKILL.md</code> yang ditulis hari ini akan terbaca persis sama oleh agent dua tahun dari sekarang, dan oleh manusia tanpa alat apa pun.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Selembar dokumen markdown tunggal dengan baris teks polos, terseleksi dalam bingkai hijau di atas latar editorial nyaris putih">
        <figcaption>Sebuah skill hanyalah sebuah file — Markdown polos yang dibaca agent, bukan fitur yang terkunci di dalam sebuah produk.</figcaption>
      </figure>
      <h2>Mengapa sistem juga berupa Markdown</h2>
      <p>Open Design menghadirkan puluhan design system — Linear, Vercel, Stripe, Apple, Cursor, Figma, dan lainnya — sebagai file <code>DESIGN.md</code>. Idenya sama: portabel, mudah dibaca, dan dapat dicerna agent.</p>
      <p>Sebuah design system, dalam konteks ini, bukanlah pustaka Figma. Ia adalah sebuah kontrak:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Agent membaca kontrak itu dan menghasilkan karya yang menghormatinya — warna dalam OKLch agar tetap merata secara persepsi, tangga tipografi yang tak akan ia menyimpang darinya, dan postur tata letak yang membuat sepuluh layar yang dihasilkan terasa seperti satu produk.</p>
      <h3>Campur, fork, dan miliki</h3>
      <p>Karena sebuah sistem hanyalah teks, Anda bisa mem-fork-nya dan menyuntingnya langsung, menghadirkan variannya, atau menulis milik Anda sendiri dari nol dalam tiga puluh menit. Anda bahkan bisa mencampur beberapa sistem di tengah proyek — ambil tipografi dari Linear, logika warna dari Vercel, tata letak dari spesifikasi internal khusus — karena tidak ada format biner yang menghalangi Anda dari aturan-aturannya. Mekanisme lengkap tentang bagaimana skill dan sistem disusun bersama dibahas di <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a>.</p>
      <h2>BYOK adalah satu-satunya model yang jujur</h2>
      <p>Open Design berjalan dengan <strong>bring-your-own-key</strong>. Anda menempelkan base URL dan API key untuk endpoint apa pun yang kompatibel dengan OpenAI — DeepSeek, Groq, OpenRouter, atau vLLM yang Anda host sendiri — dan selesai:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Kami tidak menjalankan inferensi. Kami tidak mengambil margin atas token. Kami tidak punya hubungan penagihan dengan Anda. Itu bukan masalah keberlanjutan — itu adalah satu-satunya jawaban jujur atas pertanyaan “siapa yang membayar saat agent berjalan?”</p>
      <h3>Privasi mengikuti dari pilihan yang sama</h3>
      <p>Karena daemon memanggil penyedia langsung dari mesin Anda, prompt Anda tidak pernah melintasi server kami. Tidak ada proxy untuk mencatatnya, tidak ada pipeline analitik yang diam-diam menyimpan karya Anda yang belum dirilis. Untuk pekerjaan agensi atau apa pun yang berada di bawah NDA, “di mana ini berjalan?” berhenti menjadi percakapan pengadaan dan berubah menjadi sebuah pengaturan. Kompromi yang lebih dalam — dan sisi-sisi kasar yang masih ada — dibahas di <a href="/blog/byok-reality-check-5-things-that-break/">the BYOK reality check</a>.</p>
      <p>Jawaban atas siapa yang membayar adalah: Anda, secara langsung, kepada penyedia model yang Anda pilih. Kami menyingkir dari jalan.</p>
      <h2>Apa artinya ini bagi Anda</h2>
      <p>Jika Anda menginginkan SaaS yang rapi dengan kotak chat yang manis dan langganan tunggal, kami bukan alat yang tepat. Ada produk-produk bagus dalam bentuk itu — gunakan mereka.</p>
      <p>Jika Anda menginginkan alur kerja di mana:</p>
      <ul>
      <li>agent yang sudah Anda percayai mengerjakan pekerjaannya,</li>
      <li>skill-nya berupa file yang bisa Anda baca dan sunting,</li>
      <li>design system-nya portabel antarproyek dan antaragent,</li>
      <li>dan tagihannya jatuh ke penyedia model, bukan ke kami —</li>
      </ul>
      <p>maka Open Design dibangun untuk Anda. Masuk ke repo GitHub, jalankan <code>pnpm tools-dev</code>, arahkan agent Anda ke sebuah skill, dan luncurkan.</p>
      <p>Lapisan skill menang karena ia tidak bersaing dengan agent di laptop Anda. Ia memperkuatnya.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — empat primitif yang menjadi dasar lapisan ini</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> — model bring-your-own-key dalam praktik</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — ke mana taruhan “lapisan, bukan produk” mendarat melawan sang petahana</li>
      </ul>
  nl:
    title: "Waarom we Open Design hebben gebouwd als een skill-laag, niet als een product"
    summary: "De meeste AI-designtools proberen de agent die al op je laptop staat te vervangen. Open Design zet in op het tegenovergestelde: een dunne laag van skills, systemen en adapters die elke coding agent in een design-engine verandert — zonder je vast te zetten in een nieuwe app."
    bodyHtml: |
      <p>De sterkste coding agent op je laptop is op dit moment Claude, Codex, Cursor, Gemini, OpenCode of Qwen. Wij denken niet dat je er nog een nodig hebt. Wat ontbreekt is geen ruwe intelligentie — het is <strong>smaak, structuur en een workflow die design als ambacht respecteert</strong>.</p>
      <p>Open Design is onze poging om die ontbrekende laag in te vullen. Het is geen chatproduct. Het is geen designtool die “onder de motorkap AI gebruikt”. Het is een dunne skill-laag — een map met <code>SKILL.md</code>-bestanden, een draagbare bibliotheek van design systems en een daemon die je bestaande CLI-agents automatisch detecteert en met elkaar verbindt.</p>
      <p>Dit artikel legt uit waarom we die keuze hebben gemaakt, wat dat betekent voor hoe je Open Design gebruikt, en waarom “laag, niet product” een weddenschap is op duurzaamheid in plaats van een sluiproute.</p>
      <h2>Een product zou de verkeerde vorm zijn</h2>
      <p>Het instinct, wanneer je in 2026 een AI-designproject start, is om een nieuwe app te bouwen: een chatinterface, een canvas, een facturatiesysteem, een modelrekening die lineair groeit met je aantal gebruikers. We hebben dat pad overwogen en om drie redenen verworpen.</p>
      <h3>De chatinterface is een commodity</h3>
      <p>Elke gebruiker heeft al een capabele agent en een chatvenster dat hij vertrouwt. Er een slechtere aan toevoegen — verpakt in ons merk, zonder het spiergeheugen dat hij heeft opgebouwd — helpt niemand. De interface is niet waar de waarde zit. De waarde zit in wat de agent doet <em>nadat</em> je op enter drukt: of hij een deck oplevert dat ontworpen oogt, of een muur van divs.</p>
      <h3>De modelrekening is een belasting op creativiteit</h3>
      <p>Bundel inference in het product en de economie dwingt je hand. Je moet de tokens met een marge doorberekenen, lange sessies afknijpen en toegang tot de nieuwste modellen rantsoeneren zodat je marge overleeft. Elk van die maatregelen straft precies het gedrag dat een designtool zou moeten belonen: itereren, verkennen en de agent opnieuw laten draaien omdat het werk pas bij de derde versie echt goed wordt.</p>
      <h3>Lock-in is de verkeerde default</h3>
      <p>Designers zouden moeten kunnen vertrekken met hun bestanden, hun systemen en hun skills intact. Een product verpakt alles in proprietary state — exporteer het en je krijgt een platgeslagen schaduw van het echte ding. Een skill-laag heeft niets om te verpakken, want de artefacten <em>zijn</em> de bestanden. Vertrekken kost niets, en juist daarom betekent blijven iets.</p>
      <p>Dus bouwden we in plaats daarvan de laag. Plaats een map, herstart de daemon, de skill verschijnt. Neem de map mee, plaats hem in een andere agent, en de skill werkt daar ook.</p>
      <h2>Wat een skill eigenlijk is</h2>
      <p>Een skill in Open Design is een <code>SKILL.md</code>-bestand plus optionele ondersteunende assets in dezelfde map. Het Markdown-bestand beschrijft:</p>
      <ul>
      <li><strong>Wat de skill doet</strong> — één alinea, in gewoon Nederlands</li>
      <li><strong>Wanneer hij wordt aangeroepen</strong> — de triggervoorwaarden, zo geschreven dat de agent correct kan routeren</li>
      <li><strong>De vorm van de output</strong> — HTML, PDF, slides, een Markdown-brief</li>
      <li><strong>De beperkingen</strong> — palet in OKLch, font stack, layout-houding, merkvocabulaire</li>
      </ul>
      <p>De agent leest het bestand, beslist of hij het aanroept en schrijft de output naar schijf. Er is geen pluginsysteem, geen API-oppervlak, geen versie-compatibiliteitsmatrix. Als je Markdown kunt schrijven, kun je een skill uitbrengen.</p>
      <h3>Anatomie van een skill</h3>
      <p>Concreet is een skill een map die de daemon bij het opstarten ontdekt:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>De front matter van <code>SKILL.md</code> benoemt de skill en zijn triggers; de body is begeleiding die de agent leest als een brief. Niets registreert de skill behalve zijn aanwezigheid op schijf — geen manifest om op te hogen, geen build-stap, geen reviewwachtrij.</p>
      <h3>Waarom bestanden plugins verslaan</h3>
      <p>Dit is bewust. We hebben plugin-ecosystemen vijftien jaar lang zien vervallen — elk een afweging tussen expressiviteit en duurzaamheid, door geen van beide gewonnen. Een plugin is een momentopname van iemands API in een bepaald jaar; de runtime verschuift, de API breekt, en de workflow waarvan je afhankelijk was is weg. Bestanden breken niet. Een <code>SKILL.md</code> die vandaag is geschreven, leest over twee jaar precies hetzelfde voor een agent, en voor een mens zonder enige tools.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Eén markdown-documentvel met platte tekstregels, geselecteerd in een groen kader op een bijna-witte editoriale ondergrond">
        <figcaption>Een skill is gewoon een bestand — platte Markdown die een agent leest, geen feature opgesloten in een product.</figcaption>
      </figure>
      <h2>Waarom systemen ook Markdown zijn</h2>
      <p>Open Design levert tientallen design systems — Linear, Vercel, Stripe, Apple, Cursor, Figma en meer — als <code>DESIGN.md</code>-bestanden. Hetzelfde idee: draagbaar, leesbaar, door agents te verwerken.</p>
      <p>Een design system is in deze context geen Figma-bibliotheek. Het is een contract:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>De agent leest het contract en produceert werk dat het respecteert — kleuren in OKLch zodat ze perceptueel gelijkmatig blijven, een type-ramp waar hij niet van zal afdrijven, een layout-houding die tien gegenereerde schermen laat aanvoelen als één product.</p>
      <h3>Mix, fork en bezit</h3>
      <p>Omdat een systeem gewoon tekst is, kun je er een forken en ter plekke bewerken, een variant uitbrengen, of er in dertig minuten zelf een vanaf nul schrijven. Je kunt zelfs systemen middenin een project mixen — haal de typografie uit Linear, de kleurlogica uit Vercel, de layout uit een eigen interne spec — omdat er geen binair formaat tussen jou en de regels staat. De volledige mechaniek van hoe skills en systemen samengaan wordt behandeld in <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a>.</p>
      <h2>BYOK is het enige eerlijke model</h2>
      <p>Open Design draait op <strong>bring-your-own-key</strong>. Je plakt een base-URL en een API-key voor elk OpenAI-compatibel endpoint — DeepSeek, Groq, OpenRouter, je eigen self-hosted vLLM — en je bent klaar:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Wij draaien geen inference. We nemen geen marge op tokens. We hebben geen facturatierelatie met jou. Dat is geen duurzaamheidsprobleem — het is het enige eerlijke antwoord op de vraag “wie betaalt er wanneer de agent draait?”</p>
      <h3>Privacy volgt uit dezelfde keuze</h3>
      <p>Omdat de daemon de provider rechtstreeks vanaf jouw machine aanroept, passeren je prompts nooit onze servers. Er is geen proxy om ze te loggen, geen analytics-pijplijn die stilletjes je nog niet uitgebrachte werk bewaart. Voor bureauwerk of alles onder NDA houdt “waar draait dit?” op een inkoopgesprek te zijn en wordt het een instelling. De diepere afwegingen — en de ruwe randjes die er nog steeds zijn — staan in <a href="/blog/byok-reality-check-5-things-that-break/">the BYOK reality check</a>.</p>
      <p>Het antwoord op wie er betaalt is: jij, rechtstreeks, aan de modelprovider die je hebt gekozen. Wij gaan opzij.</p>
      <h2>Wat dit voor jou betekent</h2>
      <p>Als je een gepolijste SaaS wilt met een mooi chatvenster en één abonnement, dan zijn wij niet de juiste tool. Er zijn goede producten in die vorm — gebruik die.</p>
      <p>Als je een workflow wilt waarin:</p>
      <ul>
      <li>de agent die je al vertrouwt het werk doet,</li>
      <li>de skills bestanden zijn die je kunt lezen en bewerken,</li>
      <li>de design systems draagbaar zijn over projecten en agents heen,</li>
      <li>en de rekening naar de modelprovider gaat, niet naar ons —</li>
      </ul>
      <p>dan is Open Design voor jou gebouwd. Duik in de GitHub-repo, draai <code>pnpm tools-dev</code>, richt je agent op een skill en breng het uit.</p>
      <p>De skill-laag wint omdat hij niet concurreert met de agent op je laptop. Hij versterkt hem.</p>
      <h2>Verder lezen</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — de vier primitieven waaruit deze laag is opgebouwd</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> — het bring-your-own-key-model in de praktijk</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — waar de weddenschap “laag, niet product” landt tegenover de gevestigde partij</li>
      </ul>
  ar:
    title: "لماذا بنينا Open Design كطبقة مهارات لا كمنتج"
    summary: "تحاول معظم أدوات التصميم بالذكاء الاصطناعي أن تحل محل الوكيل الموجود أصلاً على جهازك. أما Open Design فيراهن على العكس: يقدّم طبقة رقيقة من المهارات والأنظمة والمحوّلات تحوّل أي وكيل برمجي إلى محرك تصميم — دون أن تحبسك داخل تطبيق جديد."
    bodyHtml: |
      <p>أقوى وكيل برمجي على جهازك الآن هو Claude أو Codex أو Cursor أو Gemini أو OpenCode أو Qwen. ولا نظن أنك بحاجة إلى وكيل آخر. فما ينقص ليس الذكاء الخام — بل <strong>الذوق والبنية وسير عمل يحترم التصميم باعتباره حرفة</strong>.</p>
      <p>إن Open Design هو محاولتنا لتوفير تلك الطبقة المفقودة. فهو ليس منتج محادثة، وليس أداة تصميم «تستخدم الذكاء الاصطناعي خلف الكواليس». إنه طبقة مهارات رقيقة — مجلد من ملفات <code>SKILL.md</code>، ومكتبة محمولة من أنظمة التصميم، وdaemon يكتشف تلقائياً وكلاء CLI الموجودين لديك ويربط بينهم.</p>
      <p>تشرح هذه التدوينة لماذا اتخذنا هذا الخيار، وما الذي يعنيه لطريقة استخدامك لـ Open Design، ولماذا يُعدّ شعار «طبقة لا منتج» رهاناً على الديمومة لا اختصاراً للطريق.</p>
      <h2>المنتج سيكون بالشكل الخاطئ</h2>
      <p>الغريزة عند البدء بمشروع تصميم بالذكاء الاصطناعي في عام 2026 هي بناء تطبيق جديد: واجهة محادثة، ولوحة رسم، ونظام فوترة، وفاتورة نماذج تنمو خطياً مع عدد مستخدميك. لقد نظرنا في هذا المسار ورفضناه لثلاثة أسباب.</p>
      <h3>واجهة المحادثة سلعة عامة</h3>
      <p>كل مستخدم يملك بالفعل وكيلاً قادراً وصندوق محادثة يثق به. وإضافة واحد أسوأ — مغلّف بعلامتنا التجارية، وتعوزه الذاكرة العضلية التي بنوها — لا تفيد أحداً. القيمة ليست في الواجهة. القيمة في ما يفعله الوكيل <em>بعد</em> أن تضغط Enter: أيُنتج عرضاً يبدو مصمّماً بعناية أم جداراً من العناصر؟</p>
      <h3>فاتورة النموذج ضريبة على الإبداع</h3>
      <p>إذا ضمّنت الاستدلال داخل المنتج، فإن الاقتصاد يفرض عليك يدك. عليك أن تربح هامشاً على الرموز، وتخنق الجلسات الطويلة، وتقنّن الوصول إلى أحدث النماذج كي يبقى هامشك حياً. وكل حركة من هذه يعاقب السلوك ذاته الذي ينبغي لأداة تصميم أن تكافئه: التكرار والاستكشاف وإعادة تشغيل الوكيل لأن المسودة الثالثة هي حيث يصير العمل جيداً.</p>
      <h3>الاحتجاز هو الإعداد الافتراضي الخاطئ</h3>
      <p>ينبغي أن يكون بإمكان المصممين المغادرة ومعهم ملفاتهم وأنظمتهم ومهاراتهم سليمة. المنتج يغلّف كل شيء في حالة احتكارية — صدّرها فلا تحصل إلا على ظلٍّ مسطّح للشيء الحقيقي. أما طبقة المهارات فليس لديها ما تغلّفه، لأن المخرجات <em>هي</em> الملفات. لا تكلّف المغادرة شيئاً، وهذا بالضبط ما يجعل للبقاء معنى.</p>
      <p>لذلك بنينا الطبقة عوضاً عن ذلك. أَسقِط مجلداً، أعد تشغيل الـ daemon، فتظهر المهارة. خذ المجلد معك، أَسقِطه في وكيل آخر، فتعمل المهارة هناك أيضاً.</p>
      <h2>ما المهارة في حقيقتها</h2>
      <p>المهارة في Open Design هي ملف <code>SKILL.md</code> إضافة إلى أصول داعمة اختيارية في المجلد نفسه. ويصف ملف Markdown:</p>
      <ul>
      <li><strong>ما تفعله المهارة</strong> — فقرة واحدة بلغة بسيطة</li>
      <li><strong>متى تُستدعى</strong> — شروط التحفيز، مكتوبة بحيث يستطيع الوكيل التوجيه على نحو صحيح</li>
      <li><strong>شكل المخرَج</strong> — HTML أو PDF أو شرائح أو موجز Markdown</li>
      <li><strong>القيود</strong> — لوحة الألوان بصيغة OKLch، ومجموعة الخطوط، ووضعية التخطيط، ومفردات العلامة التجارية</li>
      </ul>
      <p>يقرأ الوكيل الملف، ويقرر ما إذا كان سيستدعيه، ويكتب المخرَج إلى القرص. لا يوجد نظام إضافات، ولا سطح API، ولا مصفوفة توافق إصدارات. إن كنت تستطيع كتابة Markdown، فأنت تستطيع إطلاق مهارة.</p>
      <h3>تشريح المهارة</h3>
      <p>تحديداً، المهارة هي دليل (directory) يكتشفه الـ daemon عند الإقلاع:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>تسمّي مقدمة (front matter) ملف <code>SKILL.md</code> المهارةَ ومحفّزاتها؛ أما المتن فهو إرشاد يقرؤه الوكيل كما يقرأ موجزاً. لا شيء يسجّل المهارة سوى وجودها على القرص — لا بيان (manifest) لترقيته، ولا خطوة بناء، ولا طابور مراجعة.</p>
      <h3>لماذا تتفوق الملفات على الإضافات</h3>
      <p>هذا مقصود. لقد شاهدنا أنظمة الإضافات تتهالك على مدى خمسة عشر عاماً — كل واحدة منها مقايضة بين قوة التعبير والديمومة، لم تفز بأيٍّ منهما. الإضافة لقطة لـ API أحدهم في سنة بعينها؛ تتحرك بيئة التشغيل، فينكسر الـ API، ويختفي سير العمل الذي اعتمدت عليه. أما الملفات فلا تنكسر. ملف <code>SKILL.md</code> مكتوب اليوم يُقرأ بالطريقة نفسها تماماً لوكيلٍ بعد سنتين من الآن، ولإنسانٍ لا يملك أي أدوات على الإطلاق.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="ورقة مستند markdown واحدة بأسطر نصية عادية، محدَّدة داخل إطار أخضر على أرضية تحريرية شبه بيضاء">
        <figcaption>المهارة ليست سوى ملف — نص Markdown عادي يقرؤه الوكيل، لا ميزة محبوسة داخل منتج.</figcaption>
      </figure>
      <h2>لماذا الأنظمة أيضاً Markdown</h2>
      <p>يقدّم Open Design عشرات من أنظمة التصميم — Linear وVercel وStripe وApple وCursor وFigma وغيرها — بصيغة ملفات <code>DESIGN.md</code>. الفكرة نفسها: محمولة وقابلة للقراءة وقابلة لاستيعاب الوكيل لها.</p>
      <p>نظام التصميم، في هذا السياق، ليس مكتبة Figma. إنه عقد:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>يقرأ الوكيل العقد ويُنتج عملاً يحترمه — ألوان بصيغة OKLch لتبقى متجانسة إدراكياً، وسلّم خطوط لن ينحرف عنه، ووضعية تخطيط تُبقي عشر شاشات مولَّدة وكأنها منتج واحد.</p>
      <h3>اخلط وتفرّع وامتلك</h3>
      <p>لأن النظام ليس سوى نص، يمكنك أن تتفرّع عن واحد وتحرّره في مكانه، أو تُطلق نسخة متغايرة، أو تكتب نظامك الخاص من الصفر في ثلاثين دقيقة. بل يمكنك حتى أن تخلط الأنظمة في منتصف المشروع — تأخذ الطباعة من Linear، ومنطق الألوان من Vercel، والتخطيط من مواصفة داخلية مخصّصة — لأنه ليس هناك صيغة ثنائية تقف بينك وبين القواعد. تتناول التدوينة <a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة و72 نظاماً: كيف تعمل مكتبة Open Design</a> الآليةَ الكاملة لكيفية تركّب المهارات والأنظمة معاً.</p>
      <h2>BYOK هو النموذج الصادق الوحيد</h2>
      <p>يعمل Open Design على مبدأ <strong>أحضِر مفتاحك الخاص</strong>. تلصق عنوان URL أساسياً ومفتاح API لأي نقطة نهاية متوافقة مع OpenAI — DeepSeek أو Groq أو OpenRouter أو vLLM المستضاف ذاتياً لديك — وانتهيت:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>نحن لا نُجري الاستدلال. ولا نأخذ هامشاً على الرموز. وليست لدينا علاقة فوترة معك. وهذا ليس مشكلة في الاستدامة — بل هو الإجابة الصادقة الوحيدة عن سؤال «من يدفع حين يعمل الوكيل؟».</p>
      <h3>الخصوصية تنبع من الخيار نفسه</h3>
      <p>لأن الـ daemon يستدعي المزوّد مباشرة من جهازك، فإن مطالباتك لا تمرّ أبداً عبر خوادمنا. لا يوجد وسيط (proxy) لتسجيلها، ولا خط معالجة تحليلات يحتفظ بهدوء بعملك غير المنشور. ففي عمل الوكالات أو أي شيء تحت اتفاقية عدم إفشاء، يكفّ سؤال «أين يعمل هذا؟» عن كونه محادثة شراء ويصير إعداداً. أما المقايضات الأعمق — والحواف الخشنة التي ما زالت قائمة — فتجدها في <a href="/blog/byok-reality-check-5-things-that-break/">مراجعة واقع BYOK</a>.</p>
      <p>الإجابة عن سؤال من يدفع هي: أنت، مباشرة، لمزوّد النموذج الذي اخترته. ونحن نتنحّى عن الطريق.</p>
      <h2>ماذا يعني هذا لك</h2>
      <p>إن كنت تريد منتج SaaS مصقولاً بصندوق محادثة لطيف واشتراك واحد، فلسنا الأداة المناسبة. توجد منتجات جيدة بهذا الشكل — استخدمها.</p>
      <p>أما إن كنت تريد سير عمل حيث:</p>
      <ul>
      <li>الوكيل الذي تثق به أصلاً يقوم بالعمل،</li>
      <li>والمهارات ملفات تستطيع قراءتها وتحريرها،</li>
      <li>وأنظمة التصميم محمولة عبر المشاريع والوكلاء،</li>
      <li>وتذهب الفاتورة إلى مزوّد النموذج، لا إلينا —</li>
      </ul>
      <p>فإن Open Design مبني لأجلك. انتقل إلى مستودع GitHub، وشغّل <code>pnpm tools-dev</code>، ووجّه وكيلك نحو مهارة، وأطلِق.</p>
      <p>تنتصر طبقة المهارات لأنها لا تنافس الوكيل الموجود على جهازك. بل تعزّزه.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة و72 نظاماً: كيف تعمل مكتبة Open Design</a> — العناصر الأولية الأربعة التي بُنيت منها هذه الطبقة</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل التصميم بمبدأ BYOK: شغّل Claude أو Codex أو Qwen بمفتاحك الخاص</a> — نموذج أحضِر مفتاحك الخاص في الممارسة العملية</li>
      <li><a href="/blog/figma-alternative-open-design/">البديل مفتوح المصدر لـ Figma</a> — أين يستقر رهان «طبقة لا منتج» في مواجهة المنافس الراسخ</li>
      </ul>
  tr:
    title: "Open Design'ı neden bir ürün değil de bir beceri katmanı olarak inşa ettik"
    summary: "Çoğu yapay zeka tasarım aracı, dizüstü bilgisayarınızda zaten bulunan ajanın yerini almaya çalışır. Open Design tam tersine bahse girer: herhangi bir kodlama ajanını bir tasarım motoruna dönüştüren ince bir beceri, sistem ve adaptör katmanı sunar — sizi yeni bir uygulamaya kilitlemeden."
    bodyHtml: |
      <p>Şu anda dizüstü bilgisayarınızdaki en güçlü kodlama ajanı Claude, Codex, Cursor, Gemini, OpenCode ya da Qwen. Bir tane daha edinmeniz gerektiğini düşünmüyoruz. Eksik olan ham zeka değil — eksik olan <strong>zevk, yapı ve tasarımı bir zanaat olarak gören bir iş akışı</strong>.</p>
      <p>Open Design, işte o eksik katmanı doldurma denememizdir. Bir sohbet ürünü değildir. "Arka planda yapay zeka kullanan" bir tasarım aracı da değildir. İnce bir beceri katmanıdır — bir klasör dolusu <code>SKILL.md</code> dosyası, taşınabilir bir tasarım sistemleri kütüphanesi ve mevcut CLI ajanlarınızı otomatik algılayıp birbirine bağlayan bir daemon.</p>
      <p>Bu yazı, bu tercihi neden yaptığımızı, bunun Open Design'ı nasıl kullanacağınız açısından ne anlama geldiğini ve "ürün değil katman" yaklaşımının neden bir kısayol değil de kalıcılığa oynanmış bir bahis olduğunu anlatıyor.</p>
      <h2>Bir ürün yanlış biçim olurdu</h2>
      <p>2026'da bir yapay zeka tasarım projesine başlarken içgüdüsel tepki, yeni bir uygulama inşa etmektir: bir sohbet arayüzü, bir tuval, bir faturalandırma sistemi ve kullanıcı sayınızla doğrusal olarak büyüyen bir model faturası. Bu yolu düşündük ve üç nedenle reddettik.</p>
      <h3>Sohbet arayüzü bir emtiadır</h3>
      <p>Her kullanıcının zaten yetenekli bir ajanı ve güvendiği bir sohbet kutusu var. Bunlara daha kötü bir tanesini eklemek — bizim markamıza sarılı, geliştirdikleri kas hafızasından yoksun — kimseye yaramaz. Değer arayüzde değildir. Değer, enter tuşuna bastıktan <em>sonra</em> ajanın yaptığındadır: tasarlanmış görünen bir sunum mu üretiyor, yoksa bir div yığını mı?</p>
      <h3>Model faturası yaratıcılığa konan bir vergidir</h3>
      <p>Çıkarımı ürüne dahil edin, ekonomi sizi köşeye sıkıştırır. Token'lara zam yapmak, uzun oturumları kısıtlamak ve marjınız ayakta kalsın diye en yeni modellere erişimi karne usulü dağıtmak zorunda kalırsınız. Bu hamlelerin her biri, bir tasarım aracının tam da ödüllendirmesi gereken davranışı cezalandırır: yinelemeyi, keşfetmeyi ve işin asıl iyi olduğu yerin üçüncü taslak olması nedeniyle ajanı yeniden çalıştırmayı.</p>
      <h3>Kilitlenme yanlış bir varsayılandır</h3>
      <p>Tasarımcılar; dosyaları, sistemleri ve becerileri zarar görmeden yanlarında alarak ayrılabilmelidir. Bir ürün her şeyi tescilli bir duruma sarar — dışa aktarın, elinizde gerçeğin yassılaştırılmış bir gölgesi kalır. Bir beceri katmanının saracağı hiçbir şey yoktur, çünkü yapıtların kendisi zaten dosyalardır. Ayrılmanın bir bedeli yoktur, ki kalmanın bir anlam taşıması da tam olarak bu yüzdendir.</p>
      <p>Bu yüzden onun yerine katmanı inşa ettik. Bir klasör bırakın, daemon'ı yeniden başlatın, beceri ortaya çıksın. Klasörü yanınızda götürün, farklı bir ajana bırakın, beceri orada da çalışır.</p>
      <h2>Bir beceri aslında nedir</h2>
      <p>Open Design'da bir beceri, bir <code>SKILL.md</code> dosyası ile aynı klasördeki isteğe bağlı destekleyici varlıklardan oluşur. Markdown dosyası şunları tanımlar:</p>
      <ul>
      <li><strong>Becerinin ne yaptığı</strong> — sade bir dille, tek paragraf</li>
      <li><strong>Ne zaman çağrılacağı</strong> — ajanın doğru yönlendirme yapabilmesi için yazılmış tetikleme koşulları</li>
      <li><strong>Çıktının biçimi</strong> — HTML, PDF, slaytlar, bir Markdown özeti</li>
      <li><strong>Kısıtlar</strong> — OKLch cinsinden palet, font yığını, yerleşim duruşu, marka söz dağarcığı</li>
      </ul>
      <p>Ajan dosyayı okur, çağırıp çağırmayacağına karar verir ve çıktıyı diske yazar. Eklenti sistemi yoktur, API yüzeyi yoktur, sürüm uyumluluğu matrisi yoktur. Markdown yazabiliyorsanız, bir beceri yayınlayabilirsiniz.</p>
      <h3>Bir becerinin anatomisi</h3>
      <p>Somut olarak bir beceri, daemon'ın açılışta keşfettiği bir dizindir:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p><code>SKILL.md</code> ön bilgisi (front matter) beceriyi ve tetikleyicilerini adlandırır; gövde ise ajanın bir özet gibi okuduğu yönlendirmedir. Beceriyi kaydeden tek şey, onun diskte var olmasıdır — yükseltilecek bir manifest, derleme adımı veya inceleme kuyruğu yoktur.</p>
      <h3>Dosyalar neden eklentileri yener</h3>
      <p>Bu bilinçli bir tercihtir. On beş yıldır eklenti ekosistemlerinin çürümesini izledik — her biri ifade gücü ile kalıcılık arasında bir takas, ikisini de kazanamadan. Bir eklenti, birinin belirli bir yıldaki API'sinin anlık görüntüsüdür; çalışma zamanı ilerler, API bozulur ve bel bağladığınız iş akışı yok olur. Dosyalar bozulmaz. Bugün yazılan bir <code>SKILL.md</code>, iki yıl sonra bir ajana da, hiçbir aracı olmayan bir insana da tam olarak aynı şekilde okunur.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Düz metin satırlarından oluşan tek bir markdown belge sayfası, neredeyse beyaz editöryel bir zeminde yeşil bir çerçeveyle seçilmiş">
        <figcaption>Bir beceri sadece bir dosyadır — bir ajanın okuduğu sade Markdown, bir ürünün içine kilitlenmiş bir özellik değil.</figcaption>
      </figure>
      <h2>Sistemler neden o da Markdown</h2>
      <p>Open Design onlarca tasarım sistemini — Linear, Vercel, Stripe, Apple, Cursor, Figma ve daha fazlasını — <code>DESIGN.md</code> dosyaları olarak sunar. Aynı fikir: taşınabilir, okunabilir, ajan tarafından sindirilebilir.</p>
      <p>Bu bağlamda bir tasarım sistemi, bir Figma kütüphanesi değildir. O bir sözleşmedir:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Ajan sözleşmeyi okur ve ona saygı gösteren bir iş üretir — algısal olarak dengeli kalsınlar diye OKLch cinsinden renkler, sapmayacağı bir tipografi ölçeği, üretilen on ekranın tek bir ürün gibi hissettirmesini sağlayan bir yerleşim duruşu.</p>
      <h3>Karıştırın, çatallayın ve sahiplenin</h3>
      <p>Bir sistem sadece metin olduğu için, birini çatallayıp yerinde düzenleyebilir, bir varyant yayınlayabilir ya da otuz dakikada sıfırdan kendi sisteminizi yazabilirsiniz. Hatta proje ortasında sistemleri karıştırabilirsiniz — tipografiyi Linear'dan, renk mantığını Vercel'den, yerleşimi şirket içi özel bir spesifikasyondan çekebilirsiniz — çünkü sizinle kurallar arasında duran hiçbir ikili (binary) format yoktur. Becerilerin ve sistemlerin nasıl bir araya geldiğinin tüm mekaniği <a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır</a> yazısında ele alınıyor.</p>
      <h2>BYOK tek dürüst modeldir</h2>
      <p>Open Design <strong>kendi anahtarını getir</strong> ilkesiyle çalışır. OpenAI uyumlu herhangi bir uç nokta için — DeepSeek, Groq, OpenRouter, kendi barındırdığınız vLLM — bir temel URL ve bir API anahtarı yapıştırırsınız, işte bu kadar:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Çıkarım çalıştırmıyoruz. Token'lar üzerinden marj almıyoruz. Sizinle bir faturalandırma ilişkimiz yok. Bu bir sürdürülebilirlik sorunu değildir — "ajan çalıştığında parayı kim öder?" sorusunun tek dürüst cevabıdır.</p>
      <h3>Gizlilik aynı tercihten doğar</h3>
      <p>Daemon sağlayıcıyı doğrudan makinenizden çağırdığı için, istemleriniz hiçbir zaman sunucularımızdan geçmez. Onları kaydedecek bir proxy yok, yayımlanmamış işlerinizi sessizce saklayan bir analitik hattı yok. Ajans işleri ya da NDA altındaki herhangi bir şey için, "bu nerede çalışıyor?" sorusu bir tedarik görüşmesi olmaktan çıkıp bir ayara dönüşür. Daha derin ödünleşimler — ve hâlâ var olan pürüzler — <a href="/blog/byok-reality-check-5-things-that-break/">BYOK gerçeklik kontrolü</a> yazısında.</p>
      <p>Parayı kimin ödediğinin cevabı şudur: siz, doğrudan, seçtiğiniz model sağlayıcısına. Biz aradan çekiliriz.</p>
      <h2>Bunun sizin için anlamı</h2>
      <p>Hoş bir sohbet kutusu ve tek bir abonelikle gelen cilalı bir SaaS istiyorsanız, doğru araç biz değiliz. Bu biçimde iyi ürünler var — onları kullanın.</p>
      <p>Şöyle bir iş akışı istiyorsanız:</p>
      <ul>
      <li>işi zaten güvendiğiniz ajan yapsın,</li>
      <li>beceriler okuyup düzenleyebileceğiniz dosyalar olsun,</li>
      <li>tasarım sistemleri projeler ve ajanlar arasında taşınabilir olsun,</li>
      <li>ve fatura bize değil, model sağlayıcısına gitsin —</li>
      </ul>
      <p>o halde Open Design tam size göre. GitHub deposuna girin, <code>pnpm tools-dev</code> komutunu çalıştırın, ajanınızı bir beceriye yönlendirin ve yayınlayın.</p>
      <p>Beceri katmanı kazanır, çünkü dizüstü bilgisayarınızdaki ajanla rekabet etmez. Onu güçlendirir.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır</a> — bu katmanın inşa edildiği dört temel ilke</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı: Claude, Codex ya da Qwen'i kendi anahtarınızla çalıştırın</a> — kendi anahtarını getir modeli pratikte</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma'ya açık kaynaklı alternatif</a> — "ürün değil katman" bahsinin mevcut devle karşılaştığı nokta</li>
      </ul>
  uk:
    title: "Чому ми побудували Open Design як шар навичок, а не як продукт"
    summary: "Більшість інструментів дизайну на основі ШІ намагаються замінити агента, який уже працює на вашому ноутбуці. Open Design робить протилежну ставку: постачає тонкий шар навичок, систем і адаптерів, який перетворює будь-якого кодувального агента на дизайнерський рушій — не прив’язуючи вас до нового застосунку."
    bodyHtml: |
      <p>Найпотужніший кодувальний агент на вашому ноутбуці прямо зараз — це Claude, Codex, Cursor, Gemini, OpenCode або Qwen. Ми не вважаємо, що вам потрібен ще один. Бракує не сирого інтелекту — бракує <strong>смаку, структури та робочого процесу, який поважає дизайн як ремесло</strong>.</p>
      <p>Open Design — це наша спроба створити той відсутній шар. Це не чат-продукт. Це не дизайнерський інструмент, який «використовує ШІ під капотом». Це тонкий шар навичок — тека з файлами <code>SKILL.md</code>, портативна бібліотека дизайн-систем і daemon, який автоматично виявляє ваших наявних CLI-агентів і зв’язує їх разом.</p>
      <p>Ця стаття пояснює, чому ми зробили такий вибір, що це означає для того, як ви користуватиметеся Open Design, і чому «шар, а не продукт» — це ставка на довговічність, а не швидкий обхідний шлях.</p>
      <h2>Продукт мав би неправильну форму</h2>
      <p>Інстинкт, коли ви починаєте проєкт дизайну на основі ШІ у 2026 році, — побудувати новий застосунок: чат-інтерфейс, полотно, систему білінгу, рахунок за модель, що зростає лінійно з кількістю ваших користувачів. Ми розглянули цей шлях і відкинули його з трьох причин.</p>
      <h3>Чат-інтерфейс — це товар широкого вжитку</h3>
      <p>У кожного користувача вже є здібний агент і чат-вікно, якому він довіряє. Додавання гіршого — загорнутого в наш бренд, позбавленого набутої ним м’язової пам’яті — нікому не допомагає. Цінність не в інтерфейсі. Цінність у тому, що агент робить <em>після</em> того, як ви натиснули Enter: чи створює він презентацію, яка виглядає продуманою, чи стіну з div-ів.</p>
      <h3>Рахунок за модель — це податок на креативність</h3>
      <p>Вбудуйте інференс у продукт — і економіка змусить вас діяти певним чином. Доведеться накручувати ціну на токени, обмежувати тривалі сесії та нормувати доступ до найновіших моделей, щоб ваша маржа вижила. Кожен із цих кроків карає саме ту поведінку, яку дизайнерський інструмент мав би заохочувати: ітерувати, досліджувати та запускати агента знову, бо саме на третьому чернетковому варіанті робота стає вдалою.</p>
      <h3>Прив’язка — це неправильне значення за замовчуванням</h3>
      <p>Дизайнери повинні мати змогу піти, зберігши свої файли, свої системи та свої навички цілими. Продукт загортає все у пропрієтарний стан — експортуйте його, і ви отримаєте сплющену тінь справжньої речі. Шару навичок нічого загортати, бо артефакти <em>і є</em> файлами. Піти не коштує нічого — і саме тому залишитися щось та й означає.</p>
      <p>Тож натомість ми побудували шар. Закиньте теку, перезапустіть daemon — і навичка з’явиться. Заберіть теку з собою, закиньте її в іншого агента — і навичка працює й там.</p>
      <h2>Чим насправді є навичка</h2>
      <p>Навичка в Open Design — це файл <code>SKILL.md</code> плюс необов’язкові допоміжні ресурси в тій самій теці. Файл Markdown описує:</p>
      <ul>
      <li><strong>Що робить навичка</strong> — один абзац простою мовою</li>
      <li><strong>Коли її викликати</strong> — умови спрацювання, написані так, щоб агент міг правильно маршрутизувати</li>
      <li><strong>Форму результату</strong> — HTML, PDF, слайди, бриф у Markdown</li>
      <li><strong>Обмеження</strong> — палітра в OKLch, набір шрифтів, поведінка макета, лексика бренду</li>
      </ul>
      <p>Агент читає файл, вирішує, чи викликати навичку, і записує результат на диск. Немає системи плагінів, немає поверхні API, немає матриці сумісності версій. Якщо ви вмієте писати Markdown — ви вмієте постачати навичку.</p>
      <h3>Анатомія навички</h3>
      <p>Конкретно, навичка — це каталог, який daemon виявляє під час запуску:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  magazine-poster/</span></span>
      <span class="line"><span>    SKILL.md          # the contract: trigger, output shape, constraints</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      launch.html     # a known-good artifact the agent can pattern-match</span></span></code></pre>
      <p>Front matter у <code>SKILL.md</code> називає навичку та її тригери; тіло — це настанови, які агент читає, наче бриф. Навичку нічого не реєструє, окрім її наявності на диску — немає маніфесту, який треба оновлювати, немає кроку збірки, немає черги на рев’ю.</p>
      <h3>Чому файли кращі за плагіни</h3>
      <p>Це навмисно. Ми спостерігали, як екосистеми плагінів занепадають упродовж п’ятнадцяти років — кожна з них є компромісом між виразністю та довговічністю, у якому не перемагає жодна сторона. Плагін — це знімок чийогось API в певний рік; середовище виконання змінюється, API ламається, і робочий процес, на який ви покладалися, зникає. Файли не ламаються. <code>SKILL.md</code>, написаний сьогодні, через два роки читатиметься агентом точно так само — і людиною взагалі без жодних інструментів.</p>
      <figure>
        <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="Один аркуш документа в Markdown із рядками простого тексту, виділений зеленою рамкою на майже білому редакційному тлі">
        <figcaption>Навичка — це просто файл — звичайний Markdown, який читає агент, а не функція, замкнена всередині продукту.</figcaption>
      </figure>
      <h2>Чому системи — це теж Markdown</h2>
      <p>Open Design постачає десятки дизайн-систем — Linear, Vercel, Stripe, Apple, Cursor, Figma та інші — у вигляді файлів <code>DESIGN.md</code>. Та сама ідея: портативні, читабельні, придатні для споживання агентом.</p>
      <p>Дизайн-система в цьому контексті — це не бібліотека Figma. Це контракт:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>## Color</span></span>
      <span class="line"><span>--bg: oklch(98% 0.01 95);</span></span>
      <span class="line"><span>--ink: oklch(20% 0.02 260);</span></span>
      <span class="line"><span>--accent: oklch(72% 0.19 35);</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Type</span></span>
      <span class="line"><span>Display — Albert Sans, 600, -0.02em</span></span>
      <span class="line"><span>Body — Albert Sans, 400, 1.7 line-height</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>## Posture</span></span>
      <span class="line"><span>Generous whitespace. One accent, used sparingly. No drop shadows.</span></span></code></pre>
      <p>Агент читає контракт і створює роботу, яка його поважає — кольори в OKLch, щоб вони залишалися перцептивно рівними, шкалу типографіки, від якої він не відхилятиметься, поведінку макета, завдяки якій десять згенерованих екранів відчуваються як один продукт.</p>
      <h3>Змішуйте, форкайте і володійте</h3>
      <p>Оскільки система — це просто текст, ви можете форкнути одну і відредагувати її на місці, постачити варіант або написати власну з нуля за тридцять хвилин. Ви навіть можете змішувати системи посеред проєкту — узяти типографіку з Linear, логіку кольору з Vercel, макет із власної внутрішньої специфікації — бо між вами та правилами не стоїть жодного двійкового формату. Повну механіку того, як компонуються навички та системи, описано в статті <a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи: як працює бібліотека Open Design</a>.</p>
      <h2>BYOK — єдина чесна модель</h2>
      <p>Open Design працює за принципом <strong>принеси власний ключ</strong>. Ви вставляєте базовий URL та ключ API для будь-якої OpenAI-сумісної кінцевої точки — DeepSeek, Groq, OpenRouter, ваш власний самостійно розгорнутий vLLM — і готово:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>OPENAI_BASE_URL=https://api.deepseek.com/v1</span></span>
      <span class="line"><span>OPENAI_API_KEY=sk-…</span></span></code></pre>
      <p>Ми не запускаємо інференс. Ми не беремо маржу на токенах. У нас немає з вами білінгових відносин. Це не проблема стійкості — це єдина чесна відповідь на запитання «хто платить, коли агент працює?».</p>
      <h3>Приватність випливає з того самого вибору</h3>
      <p>Оскільки daemon викликає провайдера безпосередньо з вашої машини, ваші запити ніколи не проходять крізь наші сервери. Немає проксі, щоб їх логувати, немає аналітичного конвеєра, який тихо зберігає вашу ще не випущену роботу. Для агенційної роботи чи будь-чого під NDA «де це працює?» перестає бути темою закупівельних перемовин і стає налаштуванням. Глибші компроміси — і шорсткі краї, які все ще існують, — описано в <a href="/blog/byok-reality-check-5-things-that-break/">перевірці реальності BYOK</a>.</p>
      <p>Відповідь на запитання, хто платить, така: ви, безпосередньо, обраному вами провайдеру моделі. Ми відходимо вбік.</p>
      <h2>Що це означає для вас</h2>
      <p>Якщо вам потрібен відполірований SaaS із приємним чат-вікном та єдиною підпискою — ми не той інструмент. Є хороші продукти такої форми — користуйтеся ними.</p>
      <p>Якщо ж вам потрібен робочий процес, у якому:</p>
      <ul>
      <li>роботу виконує агент, якому ви вже довіряєте,</li>
      <li>навички — це файли, які ви можете прочитати й відредагувати,</li>
      <li>дизайн-системи портативні між проєктами та агентами,</li>
      <li>а рахунок надходить провайдеру моделі, а не нам, —</li>
      </ul>
      <p>тоді Open Design створено для вас. Заходьте в репозиторій GitHub, запустіть <code>pnpm tools-dev</code>, націльте свого агента на навичку — і постачайте.</p>
      <p>Шар навичок перемагає, бо не конкурує з агентом на вашому ноутбуці. Він його доповнює.</p>
      <h2>Дотичні матеріали</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи: як працює бібліотека Open Design</a> — чотири примітиви, з яких побудовано цей шар</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Робочий процес дизайну за BYOK: запускайте Claude, Codex або Qwen на власному ключі</a> — модель «принеси власний ключ» на практиці</li>
      <li><a href="/blog/figma-alternative-open-design/">Альтернатива Figma з відкритим кодом</a> — як ставка «шар, а не продукт» спрацьовує проти лідера ринку</li>
      </ul>
---

The strongest coding agent on your laptop right now is Claude, Codex, Cursor, Gemini, OpenCode, or Qwen. We don't think you need another one. What's missing is not raw intelligence — it's **taste, structure, and a workflow that respects design as a craft**.

Open Design is our attempt at that missing layer. It's not a chat product. It's not a design tool that "uses AI under the hood." It's a thin skill layer — a folder of `SKILL.md` files, a portable library of design systems, and a daemon that auto-detects your existing CLI agents and wires them together.

This post explains why we made that choice, what it implies for how you'll use Open Design, and why "layer, not product" is a bet on longevity rather than a shortcut.

## A product would be the wrong shape

The instinct, when starting an AI design project in 2026, is to build a new app: a chat interface, a canvas, a billing system, a model bill that grows linearly with your user count. We considered that path and rejected it for three reasons.

### The chat interface is a commodity

Every user already has a capable agent and a chat box they trust. Adding a worse one — wrapped in our brand, missing the muscle memory they've built — helps nobody. The interface is not where the value is. The value is in what the agent does *after* you hit enter: whether it produces a deck that looks designed or a wall of divs.

### The model bill is a tax on creativity

Bundle inference into the product and the economics force your hand. You have to mark the tokens up, throttle long sessions, and ration access to the newest models so your margin survives. Every one of those moves punishes the exact behavior a design tool should reward: iterating, exploring, and running the agent again because the third draft is where the work gets good.

### Lock-in is the wrong default

Designers should be able to leave with their files, their systems, and their skills intact. A product wraps everything in proprietary state — export it and you get a flattened shadow of the real thing. A skill layer has nothing to wrap, because the artifacts *are* the files. Leaving costs nothing, which is exactly why staying means something.

So we built the layer instead. Drop a folder, restart the daemon, the skill appears. Take the folder with you, drop it into a different agent, the skill works there too.

## What a skill actually is

A skill in Open Design is a `SKILL.md` file plus optional supporting assets in the same folder. The Markdown file describes:

- **What the skill does** — one paragraph, in plain English
- **When to invoke it** — the trigger conditions, written so the agent can route correctly
- **The shape of the output** — HTML, PDF, slides, a Markdown brief
- **The constraints** — palette in OKLch, font stack, layout posture, brand vocabulary

The agent reads the file, decides whether to invoke, and writes the output to disk. There is no plugin system, no API surface, no version compatibility matrix. If you can write Markdown, you can ship a skill.

### Anatomy of a skill

Concretely, a skill is a directory the daemon discovers at boot:

```
skills/
  magazine-poster/
    SKILL.md          # the contract: trigger, output shape, constraints
    examples/
      launch.html     # a known-good artifact the agent can pattern-match
```

The `SKILL.md` front matter names the skill and its triggers; the body is guidance the agent reads like a brief. Nothing registers the skill but its presence on disk — no manifest to bump, no build step, no review queue.

### Why files beat plugins

This is intentional. We've watched plugin ecosystems decay for fifteen years — each one a trade between expressiveness and longevity, won by neither. A plugin is a snapshot of someone's API in a particular year; the runtime moves, the API breaks, and the workflow you depended on is gone. Files don't break. A `SKILL.md` written today reads exactly the same to an agent two years from now, and to a human with no tools at all.

<figure>
  <img src="/blog/why-we-built-open-design-as-a-skill-layer-inline.webp" alt="A single markdown document sheet with plain text lines, selected in a green frame on a near-white editorial ground" />
  <figcaption>A skill is just a file — plain Markdown an agent reads, not a feature locked inside a product.</figcaption>
</figure>

## Why systems are also Markdown

Open Design ships dozens of design systems — Linear, Vercel, Stripe, Apple, Cursor, Figma, and more — as `DESIGN.md` files. Same idea: portable, readable, agent-ingestible.

A design system, in this context, is not a Figma library. It's a contract:

```
## Color
--bg: oklch(98% 0.01 95);
--ink: oklch(20% 0.02 260);
--accent: oklch(72% 0.19 35);

## Type
Display — Albert Sans, 600, -0.02em
Body — Albert Sans, 400, 1.7 line-height

## Posture
Generous whitespace. One accent, used sparingly. No drop shadows.
```

The agent reads the contract and produces work that respects it — colors in OKLch so they stay perceptually even, a type ramp it won't drift from, a layout posture that keeps ten generated screens feeling like one product.

### Mix, fork, and own

Because a system is just text, you can fork one and edit it in place, ship a variant, or write your own from scratch in thirty minutes. You can even mix systems mid-project — pull the typography from Linear, the color logic from Vercel, the layout from a custom in-house spec — because there's no binary format standing between you and the rules. The full mechanics of how skills and systems compose are covered in [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/).

## BYOK is the only honest model

Open Design runs on **bring-your-own-key**. You paste a base URL and an API key for any OpenAI-compatible endpoint — DeepSeek, Groq, OpenRouter, your own self-hosted vLLM — and you're done:

```
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-…
```

We don't run inference. We don't take a margin on tokens. We don't have a billing relationship with you. That's not a sustainability problem — it's the only honest answer to the question "who pays when the agent runs?"

### Privacy follows from the same choice

Because the daemon calls the provider directly from your machine, your prompts never transit our servers. There is no proxy to log them, no analytics pipeline quietly retaining your unreleased work. For agency work or anything under NDA, "where does this run?" stops being a procurement conversation and becomes a setting. The deeper trade-offs — and the rough edges that still exist — are in [the BYOK reality check](/blog/byok-reality-check-5-things-that-break/).

The answer to who pays is: you do, directly, to the model provider you chose. We get out of the way.

## What this means for you

If you want a polished SaaS with a nice chat box and a single subscription, we're not the right tool. There are good products in that shape — use them.

If you want a workflow where:

- the agent you already trust does the work,
- the skills are files you can read and edit,
- the design systems are portable across projects and agents,
- and the bill goes to the model provider, not us —

then Open Design is built for you. Drop into the GitHub repo, run `pnpm tools-dev`, point your agent at a skill, and ship.

The skill layer wins because it doesn't compete with the agent on your laptop. It augments it.

## Related reading

- [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/) — the four primitives this layer is built from
- [BYOK design workflow: run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — the bring-your-own-key model in practice
- [The open-source alternative to Figma](/blog/figma-alternative-open-design/) — where the "layer, not product" bet lands against the incumbent
