---
title: "31 skills, 72 systems: how the Open Design library works"
date: 2026-05-13
category: "Guides"
readingTime: 8
summary: "A walk through the four primitives that make Open Design composable: skills, systems, adapters, and the daemon. With concrete examples of how a Markdown file becomes a pixel-perfect deliverable."
i18n:
  zh:
    title: "31 个 skill、72 个 system：Open Design 库是怎么运作的"
    summary: "带你走一遍让 Open Design 可组合的四个原语：skill、system、adapter 和 daemon。并用具体例子说明一个 Markdown 文件如何变成一份像素级精确的交付物。"
    bodyHtml: |
      <p>从机制上看，Open Design 就是四个原语层层叠起来：</p>
      <ol>
      <li><strong>Skill</strong>——agent 应该做什么</li>
      <li><strong>System</strong>——输出应该长成什么样</li>
      <li><strong>Adapter</strong>——由哪个 agent 来干活</li>
      <li><strong>daemon</strong>——把它们串接起来的那个循环</li>
      </ol>
      <p>每个原语都是一个装着文件的文件夹。它们谁都不需要数据库、插件运行时或托管服务。这就是整个库的全部——没有藏在登录墙后面的第五个概念。这篇文章会逐一走过它们，并展示当你把 agent 指向一份真实的 brief 时会发生什么。如果你想在了解「怎么做」之前先了解我们<em>为什么</em>把它塑造成这个样子，请从 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a> 读起。</p>
      <h2>Skill：能力的基本单位</h2>
      <p>一个 skill 就是一个文件夹，里面装着一个 <code>SKILL.md</code> 以及零个或多个辅助文件。这个 Markdown 文件是 agent 的契约——文件夹里其余的一切都是为了帮助 agent 兑现它。</p>
      <h3>一个 skill 文件夹的解剖</h3>
      <p>一个典型的 skill 长这样：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> 声明了这个 skill 的名字、触发条件、输入形态、输出形态，以及给 agent 的任何内联指引。<code>templates/</code> 和 <code>examples/</code> 文件夹是可选的，但分量很重：example 是已知良好的产物，agent 可以拿它来做模式匹配，这正是「给我做一套 deck」到底是产出一个连贯的东西，还是产出一个临场拼凑的东西，二者之间的区别。</p>
      <p>front matter 是 daemon 读来登记 skill 的部分；正文则是 agent 读来执行它的部分：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>为什么这个文件本身就是注册表</h3>
      <p>当 daemon 启动时，它会扫描 <code>skills/</code>，并把每一个含有 <code>SKILL.md</code> 的文件夹登记进来。没有插件清单。没有版本字段。没有上传步骤，没有审核队列，没有构建。只有这个文件，而这个文件就是事实源。丢进一个新文件夹，重启 daemon，这个 skill 就出现在选择器里。删掉它，它就没了——不会留下一条指向已不存在代码的孤儿注册项。</p>
      <p>我们目前内置 31 个 skill。有些是 deck 生成器，有些产出移动端原型，有些构建编辑风页面，有些撰写办公文档（Word、Excel、PowerPoint）。每一个都是你可以 fork、编辑或替换的文件夹。因为契约就是纯文本，「写一个 skill」和「读一个 skill 来理解它做什么」是同一件事——你审查它的方式就是打开它。</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="一张纯文本的 skill 卡片，带有标注好的标题头和寥寥几行，在近白色的编辑风底纹上被绿色框选中">
        <figcaption>skill 是能力的原子单位——一个 agent 能拿起来、读懂并运行的纯文件。</figcaption>
      </figure>
      <h2>System：审美的基本单位</h2>
      <p>如果说 skill 描述的是<em>做什么</em>，那么 system 描述的是<em>它应该长成什么样</em>。一个 system 就是一个 <code>DESIGN.md</code> 文件，外加可选的参考资源。它用机器可读的形式描述一套视觉识别：</p>
      <ul>
      <li><strong>Color</strong>——前景、背景、强调色、错误色等的 OKLch 取值</li>
      <li><strong>Type</strong>——字体栈、字重、字号阶梯、行高约定</li>
      <li><strong>Space</strong>——基础单位、间距阶梯、容器宽度、栏间距规则</li>
      <li><strong>Layout posture</strong>——网格选择、非对称规则、密度偏好</li>
      <li><strong>Voice</strong>——文字的「排版」：语气、用词、句子节奏</li>
      </ul>
      <h3>DESIGN.md 是一份契约，不是组件库</h3>
      <p>实践中，一个 <code>DESIGN.md</code> 读起来像一份简短、有主见、agent 不可能误读的品牌 brief：</p>
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
      <p>这些颜色之所以用 OKLch，是为了让它们在明暗表面上都保持知觉上的均匀；字号阶梯是一架 agent 不会偏离的梯子；而 posture 规则正是「十个生成出来的屏幕感觉像同一个产品」与「十个屏幕感觉像十个不同实习生做的」之间的差别。agent 读一遍这份契约，然后在整个任务里都遵守它。</p>
      <p>一个 system 不是 Figma 库。这里没有组件、没有变体、没有嵌套实例、没有横在你和规则之间的二进制格式。它是一份任何 agent 都能读、任何人类都能审查的契约。我们开箱内置 72 个 system，包括 Linear、Vercel、Stripe、Apple、Cursor、Figma 的可移植版本，以及一长串编辑风与品牌 system。</p>
      <h3>混搭、fork、拥有</h3>
      <p>因为一个 system 不过是文本，你可以 fork 一个并就地编辑、交付一个变体，或者用大约 30 分钟的专注工作从头写一个自己的。你甚至可以在项目进行中混搭多个 system——排版取自 Linear、配色逻辑取自 Vercel、版式取自一份内部规范——因为没有任何东西被锁进专有的二进制里。<code>skills/</code> 和 <code>design-systems/</code> 两个文件夹的拆分是刻意的：能力与审美是正交的，所以任何 skill 都能在任何 system 下运行，任何 system 也都能驱动任何 skill。</p>
      <h2>Adapter：agent 的基本单位</h2>
      <p>skill 和 system 是惰性的文本。adapter 则是把它们连接到真正干活的 agent 的那一小段代码。一个 adapter 是 <code>adapters/</code> 里一个简短的 TypeScript 文件，它懂得如何：</p>
      <ul>
      <li>检测该 agent 是否已安装在用户的 <code>$PATH</code> 上</li>
      <li>用该 agent 开启一个会话</li>
      <li>把一次 skill 调用喂进去</li>
      <li>把输出收集回来</li>
      </ul>
      <p>我们今天为 12 个 agent 提供了 adapter：Claude、Codex、Gemini、Cursor、Copilot、OpenCode、Devin、Hermes、Pi、Kimi、Kiro、Qwen。daemon 会自动检测哪些已存在，并在首次启动时以下拉菜单的形式提供它们——你什么都不用配置，只会看到你已经拥有的那些 agent。</p>





























      <table><thead><tr><th>原语</th><th>位于</th><th>文件</th><th>事实源</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>磁盘上的那个文件</td></tr><tr><td>System</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>磁盘上的那个文件</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>一个 <code>.ts</code> 文件</td><td>一次 <code>register()</code> 调用</td></tr></tbody></table>
      <p>如果你想新增一个 adapter，那个文件大约是 80 行 TypeScript 加一次 <code>register()</code> 调用。没有要学的 SDK，没有要申请的权限，没有要发布到的中心注册表。你笔记本上早已信任的那个 agent，就成了引擎——Open Design 从不取代它。（姊妹篇 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流</a> 走了一遍如何把一个 adapter 指向你自己的密钥。）</p>
      <h2>daemon：把一切系在一起的循环</h2>
      <p>daemon 是系统里唯一在运行的进程。它是你用 <code>pnpm tools-dev</code> 启动的一个小小的 Node 进程，依次做四件事：</p>
      <ol>
      <li><strong>Detect（检测）</strong>——启动时扫描 <code>$PATH</code> 查已安装的 agent、扫描 <code>skills/</code> 查已安装的 skill</li>
      <li><strong>Discover（探询）</strong>——打开一个交互式提问表单，为当前 brief 锁定载体、受众、语气、规模和品牌上下文</li>
      <li><strong>Direct（定向）</strong>——给出 5 个确定性的视觉方向（OKLch 配色、字体栈、版式 posture 提示），让用户挑一个</li>
      <li><strong>Deliver（交付）</strong>——用锁定的 system 调起选中的 skill，让 agent 写到磁盘，并在沙箱化的 iframe 里预览输出</li>
      </ol>
      <p>整个循环大约 1500 行代码就装得下。它是刻意做小的。聪明之处在 skill 里，而不在运行时——daemon 的工作就是扫描文件夹、把一份 brief 路由过这四步，然后让到一边。这种小正是要点所在：这里几乎没有什么会腐坏的东西，也几乎没有什么能把你的工作扣作人质。</p>
      <h2>实践中它是什么感受</h2>
      <p>假设你想为一个新产品功能做一套发布 deck。流程是这样的：</p>
      <ol>
      <li>你在终端里运行 <code>pnpm tools-dev</code>。daemon 在 <code>localhost:7780</code> 上启动。</li>
      <li>你打开这个 URL。daemon 给你看它找到了哪些 agent（例如 Claude、Cursor、Codex）。</li>
      <li>你从 skill 列表里挑选 <code>guizang-ppt</code>。</li>
      <li>弹出一个 30 秒的提问表单：受众是谁、语气是什么、品牌上下文是什么。</li>
      <li>你被展示了 5 个视觉方向——不同的配色、字体搭配、版式 posture。你挑一个。</li>
      <li>agent 写到磁盘。一个沙箱化的 iframe 显示出结果。你可以导出为 HTML、PDF、PPTX、ZIP 或 Markdown。</li>
      </ol>
      <p>顺着这些原语回溯，整件事就一目了然：第 3 步选了一个 <strong>skill</strong>，第 5 步锁定了一个 <strong>system</strong>，背后的那个 agent 是通过一个 <strong>adapter</strong> 接进来的，而 <strong>daemon</strong> 跑完了这四步循环。输出是真实的。文件是你的。你可以在任何编辑器里改它们，把它们交给一位设计师，或者把它们重新喂回另一个 skill。</p>
      <h2>为什么用文件，而不是数据库</h2>
      <p>每一个原语——skill、system、adapter——都是一个装着文本文件的文件夹。没有中心数据库。没有「Open Design 账户」。没有那种必须一直运转、你的工作才能一直运转的托管服务。</p>
      <p>这是一笔刻意的交换。我们放弃了做花哨的跨用户分析、跨项目记忆或托管协作的能力。换回来的是：可移植性、长寿、可审查性，以及任何人都能 fork 整个库并交付自己变体的能力。今天写下的一个 <code>SKILL.md</code>，两年后对一个 agent 读起来一模一样，对一个手头没有任何工具的人类也读起来一模一样——而一个被钉死在去年某个 API 上的插件可做不到这一点。</p>
      <p>如果你曾眼看着一代又一代设计工具死去、还把你的文件一并带走，你就会明白这笔交换为什么值得。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a>——这四个原语背后的赌注</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流：用你自己的密钥运行 Claude、Codex 或 Qwen</a>——adapter 如何连接到你早已付费的那个 agent</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">画布曾经藏起来的那一层版式</a>——为什么 DESIGN.md 里的 posture 规则胜过在画布上拖框</li>
      </ul>
  zh-tw:
    title: "31 個技能、72 個系統：Open Design 函式庫如何運作"
    summary: "帶你走過讓 Open Design 可組合的四個基本元件：技能、系統、轉接器，以及 daemon。並用具體範例說明一個 Markdown 檔案如何變成像素級精準的交付成果。"
    bodyHtml: |
      <p>從機制上看，Open Design 是四個基本元件層層堆疊而成：</p>
      <ol>
      <li><strong>技能（Skills）</strong>——agent 應該做什麼</li>
      <li><strong>系統（Systems）</strong>——輸出應該長什麼樣</li>
      <li><strong>轉接器（Adapters）</strong>——由哪個 agent 來幹活</li>
      <li><strong>daemon</strong>——把它們串接在一起的迴圈</li>
      </ol>
      <p>每個基本元件都是一個檔案資料夾。它們都不需要資料庫、外掛執行環境或代管服務。這就是整個函式庫——沒有藏在登入牆後面的第五個概念。這篇文章會逐一帶你走過每一個，並展示當你把 agent 指向一份真實簡報時會發生什麼。如果你想在了解<em>怎麼做</em>之前，先看我們<em>為什麼</em>把它塑造成這樣的論述，那就從<a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>開始。</p>
      <h2>技能：能力的單位</h2>
      <p>一個技能是一個資料夾，裡面含有一個 <code>SKILL.md</code> 以及零個或多個輔助檔案。那個 Markdown 檔案是 agent 的契約——資料夾裡其餘的一切，都是為了幫助 agent 達成它而存在的。</p>
      <h3>一個技能資料夾的解剖</h3>
      <p>一個典型的技能長這樣：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> 宣告該技能的名稱、觸發條件、輸入形態、輸出形態，以及給 agent 的任何行內指引。<code>templates/</code> 和 <code>examples/</code> 資料夾是選用的，但份量很重：examples 是已知良好的產物，agent 可以拿來做樣式比對，這正是「幫我做一份簡報」產出連貫成果與產出臨場拼湊之間的差別。</p>
      <p>front matter 是 daemon 用來註冊該技能要讀的部分；本文則是 agent 用來執行它要讀的部分：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>為什麼檔案就是登錄</h3>
      <p>當 daemon 啟動時，它會掃描 <code>skills/</code>，並註冊每一個含有 <code>SKILL.md</code> 的資料夾。沒有外掛清單檔。沒有版本欄位。沒有上傳步驟、沒有審查佇列、沒有建置。只有檔案，而檔案就是事實來源。放進一個新資料夾，重啟 daemon，這個技能就出現在選擇器裡。把它刪掉，它就不見了——不會留下一個孤兒登錄項指向不再存在的程式碼。</p>
      <p>我們目前出貨 31 個技能。有些是簡報產生器，有些產出行動裝置原型，有些建構編輯風頁面，有些撰寫辦公文件（Word、Excel、PowerPoint）。每一個都是你可以分支、編輯或替換的資料夾。因為契約是純文字，「寫一個技能」和「讀一個技能以了解它在做什麼」是同一件事——你藉由打開它來稽核它。</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="一張純文字技能卡片，有一個帶標籤的標頭和幾行內容，被一個綠色框選中，襯在近白色的編輯風底色上">
        <figcaption>技能是能力的原子單位——一個 agent 可以拿起、讀取並執行的純檔案。</figcaption>
      </figure>
      <h2>系統：品味的單位</h2>
      <p>如果說技能描述的是<em>要做什麼</em>，那麼系統描述的就是<em>它應該長什麼樣</em>。一個系統是一個 <code>DESIGN.md</code> 檔案，加上選用的參考素材。它以機器可讀的形式描述一種視覺識別：</p>
      <ul>
      <li><strong>色彩</strong>——前景、背景、強調色、錯誤色等等的 OKLch 數值</li>
      <li><strong>字體</strong>——字型堆疊、字重、字級階梯、行高慣例</li>
      <li><strong>間距</strong>——基本單位、間距尺度、容器寬度、欄距規則</li>
      <li><strong>版面姿態</strong>——網格選擇、不對稱規則、密度偏好</li>
      <li><strong>語氣</strong>——文字的排版：語調、用詞、句子節奏</li>
      </ul>
      <h3>DESIGN.md 是一份契約，不是一個元件庫</h3>
      <p>實務上，一份 <code>DESIGN.md</code> 讀起來像一份簡短、有主見、agent 無法誤讀的品牌簡報：</p>
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
      <p>這些色彩用 OKLch，所以它們在明亮與深色表面上都能保持知覺上的均勻；字級階梯是一道 agent 不會偏離的梯子；姿態規則正是十個生成出來、感覺像同一個產品的畫面，與十個感覺像十個不同實習生做的畫面之間的差別。agent 讀過一次，就會在整份工作中遵守它。</p>
      <p>一個系統不是一個 Figma 函式庫。沒有元件、沒有變體、沒有巢狀實例、沒有橫亙在你和規則之間的二進位格式。它是一份任何 agent 都能讀、任何人都能稽核的契約。我們開箱即附 72 個系統，包括 Linear、Vercel、Stripe、Apple、Cursor、Figma 的可攜版本，以及一長串編輯風與品牌系統。</p>
      <h3>混搭、分支、擁有</h3>
      <p>因為一個系統只是文字，你可以分支一個並就地編輯它、出貨一個變體，或在大約 30 分鐘專注工作裡從頭寫一個你自己的。你甚至可以在專案進行中混搭系統——字體取自 Linear、色彩邏輯取自 Vercel、版面取自一份內部規格——因為沒有任何東西被鎖進專屬的二進位裡。<code>skills/</code> 和 <code>design-systems/</code> 資料夾之間的切分是刻意的：能力與品味是正交的，所以任何技能都能在任何系統下執行，而任何系統都能驅動任何技能。</p>
      <h2>轉接器：agent 的單位</h2>
      <p>技能和系統是惰性的文字。轉接器是把它們連到實際幹活的 agent 上的那一小段程式碼。一個轉接器是 <code>adapters/</code> 裡一個短小的 TypeScript 檔案，它知道如何：</p>
      <ul>
      <li>偵測該 agent 是否安裝在使用者的 <code>$PATH</code> 上</li>
      <li>用那個 agent 啟動一個工作階段</li>
      <li>把一次技能呼叫導進去</li>
      <li>把輸出收回來</li>
      </ul>
      <p>我們如今為 12 個 agent 出貨轉接器：Claude、Codex、Gemini、Cursor、Copilot、OpenCode、Devin、Hermes、Pi、Kimi、Kiro、Qwen。daemon 會自動偵測哪些存在，並在首次啟動時以下拉選單提供它們——你什麼都不用設定，你只會看到你已經擁有的那些 agent。</p>





























      <table><thead><tr><th>基本元件</th><th>位於</th><th>檔案</th><th>事實來源</th></tr></thead><tbody><tr><td>技能</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>磁碟上的檔案</td></tr><tr><td>系統</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>磁碟上的檔案</td></tr><tr><td>轉接器</td><td><code>adapters/</code></td><td>一個 <code>.ts</code> 檔案</td><td>一次 <code>register()</code> 呼叫</td></tr></tbody></table>
      <p>如果你想新增一個轉接器，那個檔案大約是 80 行 TypeScript，外加單獨一次 <code>register()</code> 呼叫。沒有 SDK 要學、沒有權限要申請、沒有中央登錄要發布。你在筆電上已經信任的那個 agent 成為引擎——Open Design 從不取代它。（姊妹篇 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流程</a>會帶你走過如何把一個轉接器指向你自己的金鑰。）</p>
      <h2>daemon：把一切繫在一起的迴圈</h2>
      <p>daemon 是系統裡唯一在運作的行程。它是一個你用 <code>pnpm tools-dev</code> 啟動的小型 Node 行程，它依序做四件事：</p>
      <ol>
      <li><strong>偵測</strong>——啟動時掃描 <code>$PATH</code> 找已安裝的 agent，並掃描 <code>skills/</code> 找已安裝的技能</li>
      <li><strong>探詢</strong>——開啟一份互動式問題表單，釐清當前簡報的載體、受眾、語氣、規模和品牌背景</li>
      <li><strong>定向</strong>——呈現 5 個確定性的視覺方向（OKLch 調色盤、字型堆疊、版面姿態提示），並請使用者挑一個</li>
      <li><strong>交付</strong>——以鎖定的系統呼叫所選技能，讓 agent 寫到磁碟，並在沙盒化的 iframe 裡預覽輸出</li>
      </ol>
      <p>整個迴圈大約 1500 行程式碼就裝得下。它刻意保持小巧。巧妙之處在於技能，而不在執行環境——daemon 的工作就是掃描資料夾、把一份簡報路由穿過這四步，並讓開路。那份小巧正是重點：這裡幾乎沒有什麼會腐爛，也幾乎沒有什麼能挾持你的工作當人質。</p>
      <h2>實務上的感受</h2>
      <p>假設你想要一份新產品功能的發表簡報。流程是這樣的：</p>
      <ol>
      <li>你在終端機裡執行 <code>pnpm tools-dev</code>。daemon 在 <code>localhost:7780</code> 上啟動。</li>
      <li>你打開那個 URL。daemon 會告訴你它找到了哪些 agent（例如 Claude、Cursor、Codex）。</li>
      <li>你從技能清單裡挑選 <code>guizang-ppt</code>。</li>
      <li>一份 30 秒的問題表單跳出來：受眾是誰、語氣是什麼、品牌背景是什麼。</li>
      <li>你會看到 5 個視覺方向——不同的調色盤、字體搭配、版面姿態。你挑一個。</li>
      <li>agent 寫到磁碟。一個沙盒化的 iframe 顯示結果。你可以匯出成 HTML、PDF、PPTX、ZIP 或 Markdown。</li>
      </ol>
      <p>把它順著基本元件回溯，整件事就一目了然：第 3 步選了一個<strong>技能</strong>，第 5 步鎖定了一個<strong>系統</strong>，它背後的 agent 是透過一個<strong>轉接器</strong>進來的，而 <strong>daemon</strong> 跑完了那四步迴圈。輸出是真實的。檔案是你的。你可以在任何編輯器裡編輯它們、交給一位設計師，或把它們餵回另一個技能。</p>
      <h2>為什麼用檔案，而不是資料庫</h2>
      <p>每一個基本元件——技能、系統、轉接器——都是一個文字檔案的資料夾。沒有中央資料庫。沒有「Open Design 帳號」。沒有一個必須持續運作、你的工作才能持續運作的代管服務。</p>
      <p>這是一個刻意的取捨。我們放棄了做巧妙的跨使用者分析、跨專案記憶或代管協作的能力。換回來的是：可攜性、長壽、可稽核性，以及任何人都能分支整個函式庫並出貨自己變體的能力。今天寫的一份 <code>SKILL.md</code>，對兩年後的一個 agent，以及對一個完全沒有任何工具的人來說，讀起來都一模一樣——一個被釘在去年某個 API 上的外掛可說不出這樣的話。</p>
      <p>如果你看著一代又一代的設計工具死去、還把你的檔案一起帶走，你就會明白為什麼這個取捨值得。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>——這四個基本元件背後的賭注</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流程：用你自己的金鑰跑 Claude、Codex 或 Qwen</a>——轉接器如何連到你已經在付費的那個 agent</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">畫布過去藏起來的那一層版面</a>——為什麼一份 DESIGN.md 裡的姿態規則勝過在畫布上拖拉方塊</li>
      </ul>
  ja:
    title: "31 のスキル、72 のシステム：Open Design ライブラリの仕組み"
    summary: "Open Design を組み合わせ可能にしている 4 つのプリミティブ ── スキル、システム、アダプター、daemon ── を一通り見ていきます。1 つの Markdown ファイルがどのようにピクセル単位で精密な成果物になるのか、具体例とともに。"
    bodyHtml: |
      <p>Open Design は、機構的には、互いに積み重なった 4 つのプリミティブです。</p>
      <ol>
      <li><strong>スキル</strong> — エージェントが何をすべきか</li>
      <li><strong>システム</strong> — 出力がどう見えるべきか</li>
      <li><strong>アダプター</strong> — どのエージェントが作業を行うか</li>
      <li><strong>daemon</strong> — それらを結びつけるループ</li>
      </ol>
      <p>各プリミティブはファイルのフォルダです。どれもデータベース、プラグインランタイム、ホスト型サービスを必要としません。これがライブラリのすべてです。ログイン壁の裏に隠れた 5 つ目の概念はありません。この記事ではそれぞれを順に見ていき、あなたがエージェントを実際のブリーフに向けたときに何が起きるかを示します。<em>どうやって</em>の前に<em>なぜ</em>こう形作ったのかという議論を知りたい方は、<a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a>から始めてください。</p>
      <h2>スキル：能力の単位</h2>
      <p>スキルは、1 つの <code>SKILL.md</code> と 0 個以上の補助ファイルを含むフォルダです。Markdown ファイルはエージェントの契約です。フォルダ内のそれ以外のすべては、エージェントがそれを達成するのを助けるためにあります。</p>
      <h3>スキルフォルダの解剖</h3>
      <p>典型的なスキルはこのようになります。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> は、スキルの名前、トリガー条件、入力の形、出力の形、そしてエージェント向けのインラインのガイダンスを宣言します。<code>templates/</code> と <code>examples/</code> フォルダは任意ですが、大きな役割を担います。examples はエージェントがパターンマッチできる既知の良好な成果物であり、それが「デッキを作って」が一貫したものを生むか、即興的なものを生むかの違いになります。</p>
      <p>front matter は daemon がスキルを登録するために読む部分であり、本文はエージェントがそれを実行するために読む部分です。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>なぜファイルがレジストリなのか</h3>
      <p>daemon が起動すると、<code>skills/</code> をスキャンし、<code>SKILL.md</code> を含むすべてのフォルダを登録します。プラグインマニフェストはありません。バージョンフィールドもありません。アップロードのステップも、レビューのキューも、ビルドもありません。あるのはファイルであり、ファイルが信頼できる唯一の情報源です。新しいフォルダを入れて daemon を再起動すれば、スキルがピッカーに現れます。削除すれば、消えます。もはや存在しないコードを指す孤立したレジストリエントリは残りません。</p>
      <p>私たちは現在 31 のスキルを提供しています。デッキジェネレーターもあれば、モバイルモックアップを生むもの、編集的なページを作るもの、オフィス文書（Word、Excel、PowerPoint）を書くものもあります。それぞれがフォークし、編集し、置き換えられるフォルダです。契約がプレーンテキストなので、「スキルを書くこと」と「何をするのか理解するためにスキルを読むこと」は同じ行為です。開けば監査できるのです。</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="ラベル付きのヘッダーと数行を持つ 1 枚のプレーンテキストのスキルカードが、ほぼ白の編集的な地の上で緑のフレームに選択されている">
        <figcaption>スキルは能力の原子的な単位 ── エージェントが手に取り、読み、実行できる 1 つのプレーンファイルです。</figcaption>
      </figure>
      <h2>システム：センスの単位</h2>
      <p>スキルが<em>何を作るか</em>を記述するなら、システムは<em>それがどう見えるべきか</em>を記述します。システムは <code>DESIGN.md</code> ファイルに任意の参照アセットを加えたものです。ビジュアルアイデンティティを機械可読な形で記述します。</p>
      <ul>
      <li><strong>色</strong> — 前景、背景、アクセント、エラーなどの OKLch 値</li>
      <li><strong>タイプ</strong> — フォントスタック、ウェイト、タイプランプ、行間の慣習</li>
      <li><strong>スペース</strong> — 基本単位、スペーシングスケール、コンテナ幅、ガターのルール</li>
      <li><strong>レイアウトの姿勢</strong> — グリッドの選択、非対称のルール、密度の好み</li>
      <li><strong>ボイス</strong> — 言葉のタイポグラフィ：トーン、語彙、文のリズム</li>
      </ul>
      <h3>DESIGN.md は契約であって、コンポーネントライブラリではない</h3>
      <p>実際には、<code>DESIGN.md</code> はエージェントが誤解しようのない、短く、意見のはっきりしたブランドブリーフのように読めます。</p>
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
      <p>色は OKLch なので、明るい面と暗い面をまたいでも知覚的に均一に保たれます。タイプランプはエージェントが逸れないはしごです。姿勢のルールは、生成された 10 枚の画面が 1 つの製品のように感じられるか、10 人の異なるインターンのように感じられるかの違いになります。エージェントはこれを一度読み、ジョブ全体を通して尊重します。</p>
      <p>システムは Figma ライブラリではありません。コンポーネントも、バリアントも、ネストされたインスタンスも、あなたとルールの間に立ちはだかるバイナリ形式もありません。それはどんなエージェントでも読め、どんな人間でも監査できる契約です。私たちは標準で 72 のシステムを提供しており、その中には Linear、Vercel、Stripe、Apple、Cursor、Figma のポータブル版や、編集的・ブランド的システムのロングテールが含まれます。</p>
      <h3>混ぜる、フォークする、所有する</h3>
      <p>システムは単なるテキストなので、1 つをフォークしてその場で編集したり、バリアントを出したり、集中した作業でおよそ 30 分かけて自分のものをゼロから書いたりできます。プロジェクトの途中でシステムを混ぜることさえできます ── タイポグラフィは Linear から、色のロジックは Vercel から、レイアウトは社内仕様から ── 何も独自のバイナリに縛られていないからです。<code>skills/</code> と <code>design-systems/</code> フォルダの分割は意図的です。能力とセンスは直交しているので、どのスキルもどのシステムの下でも動き、どのシステムもどのスキルも駆動できます。</p>
      <h2>アダプター：エージェントの単位</h2>
      <p>スキルとシステムは不活性なテキストです。アダプターは、それらを実際に作業を行うエージェントに接続する少量のコードです。アダプターは <code>adapters/</code> にある短い TypeScript ファイルで、次のことを知っています。</p>
      <ul>
      <li>エージェントがユーザーの <code>$PATH</code> にインストールされているか検出する</li>
      <li>そのエージェントとのセッションを開始する</li>
      <li>スキルの呼び出しを流し込む</li>
      <li>出力を回収する</li>
      </ul>
      <p>私たちは現在 12 のエージェント向けにアダプターを提供しています：Claude、Codex、Gemini、Cursor、Copilot、OpenCode、Devin、Hermes、Pi、Kimi、Kiro、Qwen。daemon はどれが存在するかを自動検出し、初回起動時にドロップダウンとして提示します。何も設定する必要はなく、すでに持っているエージェントが見えるだけです。</p>


      <table><thead><tr><th>プリミティブ</th><th>存在する場所</th><th>ファイル</th><th>信頼できる情報源</th></tr></thead><tbody><tr><td>スキル</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>ディスク上のファイル</td></tr><tr><td>システム</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>ディスク上のファイル</td></tr><tr><td>アダプター</td><td><code>adapters/</code></td><td>1 つの <code>.ts</code> ファイル</td><td><code>register()</code> 呼び出し</td></tr></tbody></table>
      <p>新しいアダプターを追加したい場合、ファイルはおよそ 80 行の TypeScript と 1 回の <code>register()</code> 呼び出しです。学ぶべき SDK も、申請すべき権限も、公開先の中央レジストリもありません。あなたがすでにノート PC で信頼しているのと同じエージェントがエンジンになります ── Open Design がそれを置き換えることは決してありません。（対になる記事 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー</a>では、アダプターを自分のキーに向ける方法を解説しています。）</p>
      <h2>daemon：すべてを結びつけるループ</h2>
      <p>daemon はシステム内で唯一実行中のプロセスです。<code>pnpm tools-dev</code> で起動する小さな Node プロセスで、4 つのことを順に行います。</p>
      <ol>
      <li><strong>検出（Detect）</strong> — 起動時に、インストール済みのエージェントを求めて <code>$PATH</code> を、インストール済みのスキルを求めて <code>skills/</code> をスキャンする</li>
      <li><strong>発見（Discover）</strong> — インタラクティブな質問フォームを開き、現在のブリーフのサーフェス、オーディエンス、トーン、スケール、ブランドコンテキストを絞り込む</li>
      <li><strong>方向づけ（Direct）</strong> — 5 つの決定論的なビジュアルの方向性（OKLch のパレット、フォントスタック、レイアウト姿勢の手がかり）を提示し、1 つを選ぶようユーザーに求める</li>
      <li><strong>納品（Deliver）</strong> — 固定されたシステムで選択されたスキルを呼び出し、エージェントにディスクへ書き込ませ、サンドボックス化された iframe で出力をプレビューする</li>
      </ol>
      <p>ループ全体はおよそ 1500 行のコードに収まります。意図的に小さくしてあります。賢さはスキルにあり、ランタイムにはありません ── daemon の仕事は、フォルダをスキャンし、ブリーフを 4 つのステップに通し、邪魔をせず退いていることです。その小ささこそが要点です。ここには腐りうるものがほとんどなく、あなたの作業を人質に取りうるものはほぼ皆無です。</p>
      <h2>実際にはどう感じられるか</h2>
      <p>新しい製品機能のローンチデッキが欲しいとしましょう。流れはこうです。</p>
      <ol>
      <li>ターミナルで <code>pnpm tools-dev</code> を実行します。daemon が <code>localhost:7780</code> で起動します。</li>
      <li>URL を開きます。daemon が見つけたエージェント（例：Claude、Cursor、Codex）を表示します。</li>
      <li>スキルリストから <code>guizang-ppt</code> を選びます。</li>
      <li>30 秒の質問フォームが表示されます：オーディエンスは誰か、トーンは何か、ブランドコンテキストは何か。</li>
      <li>5 つのビジュアルの方向性が表示されます ── 異なるパレット、タイプの組み合わせ、レイアウトの姿勢。1 つを選びます。</li>
      <li>エージェントがディスクに書き込みます。サンドボックス化された iframe が結果を表示します。HTML、PDF、PPTX、ZIP、または Markdown にエクスポートできます。</li>
      </ol>
      <p>プリミティブをたどって振り返ると、全体が読み解けます：ステップ 3 は<strong>スキル</strong>を選び、ステップ 5 は<strong>システム</strong>を固定し、その背後のエージェントは<strong>アダプター</strong>を通して来て、<strong>daemon</strong> が 4 ステップのループを実行しました。出力は本物です。ファイルはあなたのものです。任意のエディタで編集したり、デザイナーに渡したり、別のスキルに戻して投入したりできます。</p>
      <h2>なぜデータベースではなくファイルなのか</h2>
      <p>すべてのプリミティブ ── スキル、システム、アダプター ── はテキストファイルのフォルダです。中央データベースはありません。「Open Design アカウント」もありません。あなたの作業が動き続けるために動き続けねばならないホスト型サービスもありません。</p>
      <p>これは意図的なトレードです。私たちは、巧妙なユーザー横断の分析、プロジェクト横断のメモリ、ホスト型のコラボレーションを行う能力を手放します。代わりに手に入れるのは、ポータビリティ、長寿命、監査可能性、そして誰もがライブラリ全体をフォークして自分のバリアントを出せる能力です。今日書かれた <code>SKILL.md</code> は、2 年後のエージェントにも、ツールを一切持たない人間にも、まったく同じように読めます ── 昨年の API に固定されたプラグインについては同じことは言えません。</p>
      <p>一世代分のデザインツールが、あなたのファイルを道連れにして死んでいくのを見てきたなら、このトレードに価値がある理由がわかるはずです。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a> — 4 つのプリミティブの裏側にある賭け</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー：自分のキーで Claude、Codex、Qwen を動かす</a> — アダプターが、あなたがすでに支払っているエージェントにどう接続するか</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">キャンバスが隠していたレイアウトレイヤー</a> — なぜ DESIGN.md の姿勢ルールが、キャンバス上でボックスをドラッグするよりも勝るのか</li>
      </ul>
  ko:
    title: "스킬 31개, 시스템 72개: Open Design 라이브러리는 어떻게 작동하는가"
    summary: "Open Design를 조합 가능하게 만드는 네 가지 기본 요소 — 스킬, 시스템, 어댑터, 그리고 daemon — 을 둘러본다. Markdown 파일 한 장이 어떻게 픽셀 단위로 완성된 결과물이 되는지 구체적인 예시와 함께 살펴본다."
    bodyHtml: |
      <p>Open Design는 구조적으로 보면 서로 차곡차곡 쌓아 올린 네 가지 기본 요소로 이루어져 있습니다:</p>
      <ol>
      <li><strong>스킬(Skills)</strong> — 에이전트가 무엇을 해야 하는가</li>
      <li><strong>시스템(Systems)</strong> — 결과물이 어떤 모습이어야 하는가</li>
      <li><strong>어댑터(Adapters)</strong> — 어떤 에이전트가 그 작업을 하는가</li>
      <li><strong>daemon</strong> — 이들을 서로 엮어 주는 루프</li>
      </ol>
      <p>각 기본 요소는 파일들이 담긴 폴더 하나입니다. 그중 어느 것도 데이터베이스, 플러그인 런타임, 호스팅 서비스를 필요로 하지 않습니다. 이것이 라이브러리의 전부입니다 — 로그인 장벽 뒤에 숨어 있는 다섯 번째 개념 같은 건 없습니다. 이 글은 각 요소를 차례로 짚어 보고, 실제 브리프를 에이전트에게 던졌을 때 어떤 일이 벌어지는지 보여 줍니다. <em>어떻게</em> 만들었는지보다 <em>왜</em> 이런 형태로 만들었는지에 대한 논거가 먼저 궁금하다면, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design를 제품이 아니라 스킬 레이어로 만든 이유</a>부터 읽어 보세요.</p>
      <h2>스킬: 역량의 단위</h2>
      <p>스킬은 하나의 <code>SKILL.md</code>와 0개 이상의 보조 파일을 담은 폴더입니다. 이 Markdown 파일이 에이전트의 계약서이며 — 폴더 안의 다른 모든 것은 에이전트가 그 계약을 충족하도록 돕기 위해 존재합니다.</p>
      <h3>스킬 폴더의 해부</h3>
      <p>전형적인 스킬은 다음과 같이 생겼습니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code>는 스킬의 이름, 트리거 조건, 입력 형태, 출력 형태, 그리고 에이전트를 위한 인라인 안내를 선언합니다. <code>templates/</code>와 <code>examples/</code> 폴더는 선택 사항이지만 큰 역할을 합니다: examples는 에이전트가 패턴을 맞춰 참고할 수 있는 검증된 좋은 산출물로, "덱 하나 만들어 줘"가 일관성 있는 결과물을 내놓느냐 즉흥적인 결과물을 내놓느냐를 가르는 차이를 만듭니다.</p>
      <p>front matter는 daemon이 스킬을 등록하기 위해 읽는 부분이고, 본문은 에이전트가 실행하기 위해 읽는 부분입니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>파일이 곧 레지스트리인 이유</h3>
      <p>daemon이 부팅하면 <code>skills/</code>를 스캔해 <code>SKILL.md</code>가 들어 있는 모든 폴더를 등록합니다. 플러그인 매니페스트도 없고, 버전 필드도 없습니다. 업로드 단계도, 리뷰 큐도, 빌드도 없습니다. 파일이 있을 뿐이며, 그 파일이 곧 단일 진실 공급원입니다. 새 폴더를 넣고 daemon을 재시작하면 스킬이 피커에 나타납니다. 폴더를 지우면 사라집니다 — 더 이상 존재하지 않는 코드를 가리키는 고아 레지스트리 항목 같은 건 없습니다.</p>
      <p>현재 우리는 스킬 31개를 제공합니다. 어떤 것은 덱 생성기이고, 어떤 것은 모바일 목업을 만들며, 어떤 것은 에디토리얼 페이지를 만들고, 어떤 것은 오피스 문서(Word, Excel, PowerPoint)를 작성합니다. 각각은 포크하거나, 편집하거나, 교체할 수 있는 폴더입니다. 계약이 평문 텍스트이기 때문에 "스킬을 작성하는 것"과 "스킬이 무엇을 하는지 이해하기 위해 읽는 것"은 같은 활동입니다 — 파일을 열어 보는 것만으로 감사할 수 있습니다.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="라벨이 붙은 헤더와 몇 줄의 텍스트로 이루어진 평문 스킬 카드 한 장이, 거의 흰색에 가까운 에디토리얼 바탕 위에서 초록색 프레임에 선택되어 있다">
        <figcaption>스킬은 역량의 원자 단위입니다 — 에이전트가 집어 들어 읽고 실행할 수 있는 평문 파일 한 장입니다.</figcaption>
      </figure>
      <h2>시스템: 취향의 단위</h2>
      <p>스킬이 <em>무엇을 만들지</em>를 기술한다면, 시스템은 <em>그것이 어떤 모습이어야 하는지</em>를 기술합니다. 시스템은 <code>DESIGN.md</code> 파일과 선택적인 참조 에셋으로 구성됩니다. 시스템은 시각적 정체성을 기계가 읽을 수 있는 형태로 기술합니다:</p>
      <ul>
      <li><strong>색상</strong> — 전경, 배경, 강조, 오류 등에 대한 OKLch 값</li>
      <li><strong>타이포그래피</strong> — 폰트 스택, 굵기, 타입 램프, 행간 규칙</li>
      <li><strong>여백</strong> — 기본 단위, 간격 스케일, 컨테이너 너비, 거터 규칙</li>
      <li><strong>레이아웃 태도</strong> — 그리드 선택, 비대칭 규칙, 밀도 선호</li>
      <li><strong>보이스</strong> — 말의 타이포그래피: 톤, 어휘, 문장의 리듬</li>
      </ul>
      <h3>DESIGN.md는 컴포넌트 라이브러리가 아니라 계약서다</h3>
      <p>실제로 <code>DESIGN.md</code>는 에이전트가 잘못 해석할 수 없는, 짧고 분명한 브랜드 브리프처럼 읽힙니다:</p>
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
      <p>색상은 OKLch이기 때문에 밝은 표면과 어두운 표면을 가로질러 지각적으로 균일하게 유지됩니다. 타입 램프는 에이전트가 벗어나지 않는 사다리이고, 태도 규칙은 생성된 화면 열 개가 하나의 제품처럼 느껴지느냐, 아니면 서로 다른 인턴 열 명처럼 느껴지느냐를 가르는 차이입니다. 에이전트는 이것을 한 번 읽고 작업 전체에 걸쳐 지킵니다.</p>
      <p>시스템은 Figma 라이브러리가 아닙니다. 컴포넌트도, 변형도, 중첩된 인스턴스도, 규칙과 당신 사이를 가로막는 바이너리 포맷도 없습니다. 시스템은 어떤 에이전트든 읽을 수 있고 어떤 사람이든 감사할 수 있는 계약서입니다. 우리는 기본 제공으로 시스템 72개를 제공하며, 여기에는 Linear, Vercel, Stripe, Apple, Cursor, Figma의 이식 가능한 버전과 에디토리얼 및 브랜드 시스템의 긴 꼬리가 포함됩니다.</p>
      <h3>섞고, 포크하고, 소유하라</h3>
      <p>시스템은 그저 텍스트이기 때문에, 하나를 포크해 그 자리에서 편집하거나, 변형을 만들어 배포하거나, 집중해서 작업하면 대략 30분 만에 자신만의 것을 처음부터 작성할 수 있습니다. 심지어 프로젝트 도중에 시스템을 섞을 수도 있습니다 — 타이포그래피는 Linear에서, 색상 로직은 Vercel에서, 레이아웃은 사내 사양에서 — 아무것도 독점 바이너리에 묶여 있지 않기 때문입니다. <code>skills/</code> 폴더와 <code>design-systems/</code> 폴더를 나눈 것은 의도적입니다: 역량과 취향은 서로 직교하므로, 어떤 스킬이든 어떤 시스템 아래에서 실행될 수 있고, 어떤 시스템이든 어떤 스킬을 구동할 수 있습니다.</p>
      <h2>어댑터: 에이전트의 단위</h2>
      <p>스킬과 시스템은 그 자체로는 비활성 텍스트입니다. 어댑터는 그것들을 실제로 작업을 수행하는 에이전트에 연결하는 소량의 코드입니다. 어댑터는 <code>adapters/</code> 안에 있는 짧은 TypeScript 파일로, 다음을 할 줄 압니다:</p>
      <ul>
      <li>해당 에이전트가 사용자의 <code>$PATH</code>에 설치되어 있는지 감지</li>
      <li>그 에이전트로 세션 시작</li>
      <li>스킬 호출을 파이프로 전달</li>
      <li>출력을 다시 수집</li>
      </ul>
      <p>오늘날 우리는 12개 에이전트에 대한 어댑터를 제공합니다: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. daemon은 어느 것이 존재하는지 자동으로 감지하고 첫 부팅 시 드롭다운으로 제시합니다 — 아무것도 설정할 필요 없이, 이미 가지고 있는 에이전트가 그냥 보일 뿐입니다.</p>










































      <table><thead><tr><th>기본 요소</th><th>위치</th><th>파일</th><th>단일 진실 공급원</th></tr></thead><tbody><tr><td>스킬</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>디스크 위의 파일</td></tr><tr><td>시스템</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>디스크 위의 파일</td></tr><tr><td>어댑터</td><td><code>adapters/</code></td><td><code>.ts</code> 파일 하나</td><td><code>register()</code> 호출</td></tr></tbody></table>
      <p>새 어댑터를 추가하고 싶다면, 그 파일은 대략 80줄의 TypeScript와 단 한 번의 <code>register()</code> 호출입니다. 배워야 할 SDK도, 요청해야 할 권한도, 게시해야 할 중앙 레지스트리도 없습니다. 노트북에서 이미 신뢰하고 있는 바로 그 에이전트가 엔진이 됩니다 — Open Design는 결코 그것을 대체하지 않습니다. (동반 글 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 디자인 워크플로</a>에서 어댑터를 당신의 키에 연결하는 방법을 짚어 봅니다.)</p>
      <h2>daemon: 모든 것을 엮는 루프</h2>
      <p>daemon은 시스템에서 실행되는 유일한 프로세스입니다. <code>pnpm tools-dev</code>로 시작하는 작은 Node 프로세스이며, 다음 네 가지를 순서대로 수행합니다:</p>
      <ol>
      <li><strong>감지(Detect)</strong> — 부팅 시 설치된 에이전트를 찾기 위해 <code>$PATH</code>를, 설치된 스킬을 찾기 위해 <code>skills/</code>를 스캔합니다</li>
      <li><strong>발견(Discover)</strong> — 인터랙티브 질문 양식을 열어 현재 브리프의 매체, 대상, 톤, 규모, 브랜드 맥락을 확정합니다</li>
      <li><strong>방향 설정(Direct)</strong> — 5개의 결정론적 시각 방향(OKLch 팔레트, 폰트 스택, 레이아웃 태도 단서)을 제시하고 사용자에게 하나를 고르게 합니다</li>
      <li><strong>전달(Deliver)</strong> — 확정된 시스템과 함께 선택된 스킬을 호출하고, 에이전트가 디스크에 쓰게 한 뒤, 샌드박스화된 iframe에서 출력을 미리 보여 줍니다</li>
      </ol>
      <p>전체 루프는 대략 1500줄의 코드에 들어맞습니다. 의도적으로 작게 만들었습니다. 영리함은 런타임이 아니라 스킬에 있습니다 — daemon의 일은 폴더를 스캔하고, 브리프를 네 단계로 라우팅하며, 방해되지 않게 비켜서 있는 것입니다. 그 작음이 핵심입니다: 여기에는 썩을 수 있는 것이 거의 없고, 당신의 작업을 인질로 잡을 수 있는 것은 거의 전무합니다.</p>
      <h2>실제로는 어떤 느낌인가</h2>
      <p>새로운 제품 기능을 위한 출시 덱을 원한다고 가정해 봅시다. 흐름은 다음과 같습니다:</p>
      <ol>
      <li>터미널에서 <code>pnpm tools-dev</code>를 실행합니다. daemon이 <code>localhost:7780</code>에서 시작됩니다.</li>
      <li>그 URL을 엽니다. daemon이 찾아낸 에이전트(예: Claude, Cursor, Codex)를 보여 줍니다.</li>
      <li>스킬 목록에서 <code>guizang-ppt</code>를 고릅니다.</li>
      <li>30초짜리 질문 양식이 뜹니다: 대상은 누구인지, 톤은 어떤지, 브랜드 맥락은 무엇인지.</li>
      <li>5개의 시각 방향이 제시됩니다 — 서로 다른 팔레트, 타입 페어링, 레이아웃 태도. 하나를 고릅니다.</li>
      <li>에이전트가 디스크에 씁니다. 샌드박스화된 iframe이 결과를 보여 줍니다. HTML, PDF, PPTX, ZIP, Markdown으로 내보낼 수 있습니다.</li>
      </ol>
      <p>이를 기본 요소들로 거슬러 추적해 보면 전체가 명료하게 읽힙니다: 3단계는 <strong>스킬</strong>을 골랐고, 5단계는 <strong>시스템</strong>을 확정했으며, 그 뒤의 에이전트는 <strong>어댑터</strong>를 통해 들어왔고, <strong>daemon</strong>이 네 단계 루프를 실행했습니다. 출력은 실재합니다. 파일은 당신의 것입니다. 어떤 에디터로든 편집하거나, 디자이너에게 건네거나, 다른 스킬에 다시 집어넣을 수 있습니다.</p>
      <h2>왜 데이터베이스가 아니라 파일인가</h2>
      <p>모든 기본 요소 — 스킬, 시스템, 어댑터 — 는 텍스트 파일이 담긴 폴더입니다. 중앙 데이터베이스는 없습니다. "Open Design 계정" 같은 것도 없습니다. 당신의 작업이 계속 작동하려면 계속 작동해야만 하는 호스팅 서비스 같은 것도 없습니다.</p>
      <p>이것은 의도적인 맞교환입니다. 우리는 영리한 사용자 간 분석, 프로젝트 간 메모리, 호스팅 협업의 가능성을 포기합니다. 그 대가로 얻는 것은: 이식성, 수명, 감사 가능성, 그리고 누구든 라이브러리 전체를 포크해 자신만의 변형을 배포할 수 있는 능력입니다. 오늘 작성한 <code>SKILL.md</code>는 2년 뒤의 에이전트에게도, 어떤 도구도 없는 사람에게도 똑같이 읽힙니다 — 작년의 API에 고정된 플러그인에 대해서는 같은 말을 할 수 없습니다.</p>
      <p>한 세대의 디자인 도구가 당신의 파일을 함께 끌고 사라지는 것을 지켜본 적이 있다면, 이 맞교환이 왜 그만한 가치가 있는지 이해할 것입니다.</p>
      <h2>함께 읽기</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design를 제품이 아니라 스킬 레이어로 만든 이유</a> — 네 가지 기본 요소 뒤에 있는 베팅</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 디자인 워크플로: Claude, Codex, Qwen을 당신의 키로 실행하기</a> — 어댑터가 이미 당신이 비용을 내고 있는 에이전트에 연결되는 방식</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">캔버스가 숨겨 온 레이아웃 레이어</a> — DESIGN.md의 태도 규칙이 캔버스 위에서 박스를 끌어다 놓는 것을 이기는 이유</li>
      </ul>
  de:
    title: "31 Skills, 72 Systeme: So funktioniert die Open Design Bibliothek"
    summary: "Ein Rundgang durch die vier Primitive, die Open Design komponierbar machen: Skills, Systeme, Adapter und der daemon. Mit konkreten Beispielen, wie aus einer Markdown-Datei ein pixelgenaues Resultat wird."
    bodyHtml: |
      <p>Open Design besteht mechanisch betrachtet aus vier Primitiven, die übereinander gestapelt sind:</p>
      <ol>
      <li><strong>Skills</strong> — was der Agent tun soll</li>
      <li><strong>Systeme</strong> — wie das Ergebnis aussehen soll</li>
      <li><strong>Adapter</strong> — welcher Agent die Arbeit erledigt</li>
      <li><strong>Der daemon</strong> — die Schleife, die sie miteinander verbindet</li>
      </ol>
      <p>Jedes Primitiv ist ein Ordner mit Dateien. Keines von ihnen erfordert eine Datenbank, eine Plugin-Runtime oder einen gehosteten Dienst. Das ist die ganze Bibliothek — es gibt kein fünftes Konzept, das sich hinter einer Login-Hürde versteckt. Dieser Beitrag geht jedes der Primitive der Reihe nach durch und zeigt, was passiert, wenn man seinen Agenten auf ein echtes Briefing ansetzt. Wer das Argument dafür sucht, <em>warum</em> wir es so geformt haben, bevor es um das <em>Wie</em> geht, beginnt am besten mit <a href="/blog/why-we-built-open-design-as-a-skill-layer/">warum wir Open Design als Skill-Schicht gebaut haben, nicht als Produkt</a>.</p>
      <h2>Skills: die Einheit der Fähigkeit</h2>
      <p>Ein Skill ist ein Ordner, der eine <code>SKILL.md</code> und null oder mehr unterstützende Dateien enthält. Die Markdown-Datei ist der Vertrag des Agenten — alles andere im Ordner ist dazu da, dem Agenten zu helfen, ihn zu erfüllen.</p>
      <h3>Anatomie eines Skill-Ordners</h3>
      <p>Ein typischer Skill sieht so aus:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> deklariert den Namen des Skills, die Auslösebedingungen, die Form der Eingabe, die Form der Ausgabe und etwaige eingebettete Hinweise für den Agenten. Die Ordner <code>templates/</code> und <code>examples/</code> sind optional, leisten aber viel: Beispiele sind als gut bekannte Artefakte, an denen der Agent sich orientieren kann, und das macht den Unterschied zwischen „bau mir ein Deck“, das etwas Kohärentes hervorbringt, und etwas Improvisiertem.</p>
      <p>Das Front Matter ist der Teil, den der daemon liest, um den Skill zu registrieren; der Body ist der Teil, den der Agent liest, um ihn auszuführen:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Warum die Datei das Register ist</h3>
      <p>Wenn der daemon startet, scannt er <code>skills/</code> und registriert jeden Ordner, der eine <code>SKILL.md</code> enthält. Es gibt kein Plugin-Manifest. Es gibt kein Versionsfeld. Es gibt keinen Upload-Schritt, keine Review-Warteschlange, keinen Build. Es gibt die Datei, und die Datei ist die Quelle der Wahrheit. Leg einen neuen Ordner hinein, starte den daemon neu, und der Skill erscheint im Picker. Lösch ihn, und er ist weg — kein verwaister Registereintrag, der auf Code zeigt, der nicht mehr existiert.</p>
      <p>Wir liefern derzeit 31 Skills aus. Manche sind Deck-Generatoren, manche erzeugen Mobile-Mockups, manche bauen redaktionelle Seiten, manche schreiben Office-Dokumente (Word, Excel, PowerPoint). Jeder davon ist ein Ordner, den du forken, bearbeiten oder ersetzen kannst. Weil der Vertrag reiner Text ist, sind „einen Skill schreiben“ und „einen Skill lesen, um zu verstehen, was er tut“ ein und dieselbe Tätigkeit — du prüfst ihn, indem du ihn öffnest.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Eine einzelne reine Text-Skill-Karte mit beschriftetem Header und ein paar Zeilen, ausgewählt in einem grünen Rahmen auf einem fast weißen redaktionellen Grund">
        <figcaption>Ein Skill ist die atomare Einheit der Fähigkeit — eine einzige reine Datei, die ein Agent aufnehmen, lesen und ausführen kann.</figcaption>
      </figure>
      <h2>Systeme: die Einheit des Geschmacks</h2>
      <p>Wenn ein Skill beschreibt, <em>was zu erstellen ist</em>, beschreibt ein System, <em>wie es aussehen soll</em>. Ein System ist eine <code>DESIGN.md</code>-Datei plus optionale Referenz-Assets. Es beschreibt eine visuelle Identität in maschinenlesbarer Form:</p>
      <ul>
      <li><strong>Farbe</strong> — OKLch-Werte für Vordergrund, Hintergrund, Akzent, Fehler und so weiter</li>
      <li><strong>Schrift</strong> — Font-Stack, Schriftstärken, die Typo-Skala, Zeilenhöhen-Konventionen</li>
      <li><strong>Raum</strong> — Basiseinheit, Abstandsskala, Container-Breiten, Spaltenabstands-Regeln</li>
      <li><strong>Layout-Haltung</strong> — Raster-Entscheidungen, Asymmetrie-Regeln, Dichte-Präferenzen</li>
      <li><strong>Stimme</strong> — Typografie der Worte: Tonfall, Wortschatz, Satzrhythmus</li>
      </ul>
      <h3>Eine DESIGN.md ist ein Vertrag, keine Komponentenbibliothek</h3>
      <p>In der Praxis liest sich eine <code>DESIGN.md</code> wie ein kurzes, dezidiertes Brand-Briefing, das ein Agent nicht missdeuten kann:</p>
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
      <p>Die Farben sind in OKLch, damit sie über helle und dunkle Flächen hinweg wahrnehmungsmäßig gleichmäßig bleiben; die Typo-Skala ist eine Leiter, von der der Agent nicht abdriftet; die Haltungsregeln machen den Unterschied zwischen zehn generierten Screens, die sich wie ein Produkt anfühlen, und zehn, die sich wie zehn verschiedene Praktikanten anfühlen. Der Agent liest dies einmal und respektiert es für den gesamten Auftrag.</p>
      <p>Ein System ist keine Figma-Bibliothek. Es gibt keine Komponenten, keine Varianten, keine verschachtelten Instanzen, kein Binärformat, das zwischen dir und den Regeln steht. Es ist ein Vertrag, den jeder Agent lesen und jeder Mensch prüfen kann. Wir liefern 72 Systeme ab Werk aus, darunter portable Versionen von Linear, Vercel, Stripe, Apple, Cursor, Figma und einen langen Schwanz redaktioneller und Marken-Systeme.</p>
      <h3>Mischen, forken, besitzen</h3>
      <p>Weil ein System nur Text ist, kannst du eines forken und an Ort und Stelle bearbeiten, eine Variante ausliefern oder in etwa 30 Minuten konzentrierter Arbeit dein eigenes von Grund auf schreiben. Du kannst Systeme sogar mitten im Projekt mischen — Typografie von Linear, Farblogik von Vercel, Layout aus einer hauseigenen Spezifikation — weil nichts in ein proprietäres Binärformat eingeschlossen ist. Die Trennung zwischen den Ordnern <code>skills/</code> und <code>design-systems/</code> ist gewollt: Fähigkeit und Geschmack sind orthogonal, also kann jeder Skill unter jedem System laufen, und jedes System kann jeden Skill antreiben.</p>
      <h2>Adapter: die Einheit des Agenten</h2>
      <p>Skills und Systeme sind inerter Text. Adapter sind die kleine Menge Code, die sie mit dem Agenten verbindet, der die Arbeit tatsächlich erledigt. Ein Adapter ist eine kurze TypeScript-Datei in <code>adapters/</code>, die weiß, wie man:</p>
      <ul>
      <li>erkennt, ob der Agent im <code>$PATH</code> des Nutzers installiert ist</li>
      <li>eine Sitzung mit diesem Agenten startet</li>
      <li>einen Skill-Aufruf hineinleitet</li>
      <li>die Ausgabe wieder einsammelt</li>
      </ul>
      <p>Wir liefern heute Adapter für 12 Agenten aus: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Der daemon erkennt automatisch, welche vorhanden sind, und bietet sie beim ersten Start als Dropdown an — du konfigurierst nichts, du siehst einfach die Agenten, die du bereits hast.</p>










































      <table><thead><tr><th>Primitiv</th><th>Lebt in</th><th>Datei</th><th>Quelle der Wahrheit</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>die Datei auf der Festplatte</td></tr><tr><td>System</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>die Datei auf der Festplatte</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>eine <code>.ts</code>-Datei</td><td>ein <code>register()</code>-Aufruf</td></tr></tbody></table>
      <p>Wenn du einen neuen Adapter hinzufügen willst, ist die Datei rund 80 Zeilen TypeScript und ein einziger <code>register()</code>-Aufruf. Kein SDK zu lernen, keine Berechtigung anzufordern, kein zentrales Register, an das man veröffentlichen muss. Derselbe Agent, dem du auf deinem Laptop bereits vertraust, wird zur Engine — Open Design ersetzt ihn nie. (Der Begleitbeitrag <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK Design-Workflow</a> zeigt, wie man einen Adapter auf den eigenen Schlüssel richtet.)</p>
      <h2>Der daemon: die Schleife, die alles zusammenbindet</h2>
      <p>Der daemon ist der einzige laufende Prozess im System. Es ist ein kleiner Node-Prozess, den du mit <code>pnpm tools-dev</code> startest, und er tut nacheinander vier Dinge:</p>
      <ol>
      <li><strong>Erkennen</strong> — scannt beim Start den <code>$PATH</code> nach installierten Agenten und <code>skills/</code> nach installierten Skills</li>
      <li><strong>Erkunden</strong> — öffnet ein interaktives Frageformular, um Oberfläche, Zielgruppe, Tonfall, Maßstab und Markenkontext für das aktuelle Briefing festzulegen</li>
      <li><strong>Lenken</strong> — präsentiert 5 deterministische visuelle Richtungen (Palette in OKLch, Font-Stack, Layout-Haltungs-Hinweise) und bittet den Nutzer, eine auszuwählen</li>
      <li><strong>Liefern</strong> — ruft den ausgewählten Skill mit dem festgelegten System auf, lässt den Agenten auf die Festplatte schreiben und zeigt die Ausgabe in einem gesandboxten iframe als Vorschau</li>
      </ol>
      <p>Die gesamte Schleife passt in rund 1500 Zeilen Code. Sie ist bewusst klein. Die Cleverness steckt in den Skills, nicht in der Runtime — die Aufgabe des daemon ist es, Ordner zu scannen, ein Briefing durch die vier Schritte zu leiten und sich herauszuhalten. Diese Kleinheit ist der Punkt: Es gibt hier sehr wenig, das verrotten kann, und fast nichts, das deine Arbeit als Geisel nehmen kann.</p>
      <h2>Wie es sich in der Praxis anfühlt</h2>
      <p>Angenommen, du willst ein Launch-Deck für eine neue Produktfunktion. So sieht der Ablauf aus:</p>
      <ol>
      <li>Du führst <code>pnpm tools-dev</code> in einem Terminal aus. Der daemon startet auf <code>localhost:7780</code>.</li>
      <li>Du öffnest die URL. Der daemon zeigt dir, welche Agenten er gefunden hat (z. B. Claude, Cursor, Codex).</li>
      <li>Du wählst <code>guizang-ppt</code> aus der Skill-Liste.</li>
      <li>Ein 30-Sekunden-Frageformular erscheint: Wer ist die Zielgruppe, wie ist der Tonfall, wie ist der Markenkontext.</li>
      <li>Dir werden 5 visuelle Richtungen gezeigt — unterschiedliche Paletten, Schriftpaarungen, Layout-Haltungen. Du wählst eine aus.</li>
      <li>Der Agent schreibt auf die Festplatte. Ein gesandboxtes iframe zeigt das Ergebnis. Du kannst nach HTML, PDF, PPTX, ZIP oder Markdown exportieren.</li>
      </ol>
      <p>Verfolge es durch die Primitive zurück, und das Ganze ist lesbar: Schritt 3 wählte einen <strong>Skill</strong>, Schritt 5 legte ein <strong>System</strong> fest, der Agent dahinter kam über einen <strong>Adapter</strong>, und der <strong>daemon</strong> ließ die vierstufige Schleife laufen. Die Ausgabe ist echt. Die Dateien gehören dir. Du kannst sie in jedem Editor bearbeiten, sie einem Designer übergeben oder sie wieder in einen anderen Skill einspeisen.</p>
      <h2>Warum Dateien, keine Datenbank</h2>
      <p>Jedes Primitiv — Skills, Systeme, Adapter — ist ein Ordner mit Textdateien. Es gibt keine zentrale Datenbank. Es gibt kein „Open Design-Konto“. Es gibt keinen gehosteten Dienst, der weiterlaufen muss, damit deine Arbeit weiterläuft.</p>
      <p>Das ist ein bewusster Kompromiss. Wir geben die Fähigkeit auf, clevere nutzerübergreifende Analysen, projektübergreifendes Gedächtnis oder gehostete Zusammenarbeit zu betreiben. Wir bekommen dafür: Portabilität, Langlebigkeit, Prüfbarkeit und die Möglichkeit für jeden, die gesamte Bibliothek zu forken und seine eigene Variante auszuliefern. Eine heute geschriebene <code>SKILL.md</code> liest sich für einen Agenten in zwei Jahren identisch wie für einen Menschen ganz ohne Tooling — dasselbe lässt sich nicht von einem Plugin sagen, das an die API des letzten Jahres gebunden ist.</p>
      <p>Wenn du miterlebt hast, wie eine ganze Generation von Design-Tools gestorben ist und deine Dateien mitgenommen hat, wirst du verstehen, warum dieser Kompromiss es wert ist.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Schicht gebaut haben, nicht als Produkt</a> — die Wette hinter den vier Primitiven</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK Design-Workflow: Claude, Codex oder Qwen mit dem eigenen Schlüssel betreiben</a> — wie Adapter sich mit dem Agenten verbinden, für den du bereits zahlst</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Die Layout-Schicht, die die Canvas früher verbarg</a> — warum Haltungsregeln in einer DESIGN.md das Ziehen von Boxen auf einer Canvas schlagen</li>
      </ul>
  fr:
    title: "31 skills, 72 systems : comment fonctionne la bibliothèque Open Design"
    summary: "Un parcours des quatre primitives qui rendent Open Design composable : skills, systems, adaptateurs et daemon. Avec des exemples concrets de la façon dont un fichier Markdown devient un livrable au pixel près."
    bodyHtml: |
      <p>Open Design, mécaniquement, ce sont quatre primitives empilées les unes sur les autres :</p>
      <ol>
      <li><strong>Skills</strong> — ce que l'agent doit faire</li>
      <li><strong>Systems</strong> — à quoi la sortie doit ressembler</li>
      <li><strong>Adaptateurs</strong> — quel agent effectue le travail</li>
      <li><strong>Le daemon</strong> — la boucle qui les relie ensemble</li>
      </ol>
      <p>Chaque primitive est un dossier de fichiers. Aucune ne nécessite de base de données, d'environnement d'exécution de plugins ou de service hébergé. C'est toute la bibliothèque — il n'y a pas de cinquième concept caché derrière un mur de connexion. Cet article parcourt chacune tour à tour et montre ce qui se passe lorsque vous pointez votre agent vers un vrai brief. Si vous voulez l'argument expliquant <em>pourquoi</em> nous l'avons façonné ainsi avant le <em>comment</em>, commencez par <a href="/blog/why-we-built-open-design-as-a-skill-layer/">pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a>.</p>
      <h2>Skills : l'unité de capacité</h2>
      <p>Un skill est un dossier contenant un <code>SKILL.md</code> et zéro ou plusieurs fichiers de support. Le fichier Markdown est le contrat de l'agent — tout le reste du dossier est là pour aider l'agent à l'honorer.</p>
      <h3>Anatomie d'un dossier de skill</h3>
      <p>Un skill typique ressemble à ceci :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> déclare le nom du skill, les conditions de déclenchement, la forme de l'entrée, la forme de la sortie et toute consigne en ligne pour l'agent. Les dossiers <code>templates/</code> et <code>examples/</code> sont optionnels mais portent beaucoup de poids : les exemples sont des artefacts reconnus comme bons sur lesquels l'agent peut s'aligner, ce qui fait la différence entre « fais-moi un deck » qui produit quelque chose de cohérent et quelque chose d'improvisé.</p>
      <p>Le front matter est la partie que le daemon lit pour enregistrer le skill ; le corps est la partie que l'agent lit pour l'exécuter :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Pourquoi le fichier est le registre</h3>
      <p>Au démarrage du daemon, celui-ci scanne <code>skills/</code> et enregistre chaque dossier contenant un <code>SKILL.md</code>. Il n'y a aucun manifeste de plugin. Il n'y a aucun champ de version. Il n'y a aucune étape d'upload, aucune file de revue, aucun build. Il y a le fichier, et le fichier est la source de vérité. Déposez un nouveau dossier, redémarrez le daemon, et le skill apparaît dans le sélecteur. Supprimez-le, et il disparaît — aucune entrée de registre orpheline pointant vers du code qui n'existe plus.</p>
      <p>Nous livrons actuellement 31 skills. Certains sont des générateurs de decks, certains produisent des maquettes mobiles, certains construisent des pages éditoriales, certains rédigent des documents bureautiques (Word, Excel, PowerPoint). Chacun est un dossier que vous pouvez forker, éditer ou remplacer. Parce que le contrat est en texte brut, « écrire un skill » et « lire un skill pour comprendre ce qu'il fait » sont la même activité — vous l'auditez en l'ouvrant.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Une carte de skill en texte brut avec un en-tête étiqueté et quelques lignes, sélectionnée dans un cadre vert sur un fond éditorial presque blanc">
        <figcaption>Un skill est l'unité atomique de capacité — un seul fichier en clair qu'un agent peut prendre, lire et exécuter.</figcaption>
      </figure>
      <h2>Systems : l'unité de goût</h2>
      <p>Si un skill décrit <em>ce qu'il faut faire</em>, un system décrit <em>à quoi cela doit ressembler</em>. Un system est un fichier <code>DESIGN.md</code> plus des actifs de référence optionnels. Il décrit une identité visuelle sous forme lisible par machine :</p>
      <ul>
      <li><strong>Couleur</strong> — valeurs OKLch pour le premier plan, l'arrière-plan, l'accent, l'erreur, etc.</li>
      <li><strong>Typographie</strong> — pile de polices, graisses, l'échelle typographique, conventions d'interlignage</li>
      <li><strong>Espace</strong> — unité de base, échelle d'espacement, largeurs de conteneur, règles de gouttière</li>
      <li><strong>Posture de mise en page</strong> — choix de grille, règles d'asymétrie, préférences de densité</li>
      <li><strong>Voix</strong> — typographie des mots : ton, vocabulaire, rythme des phrases</li>
      </ul>
      <h3>Un DESIGN.md est un contrat, pas une bibliothèque de composants</h3>
      <p>En pratique, un <code>DESIGN.md</code> se lit comme un brief de marque court et affirmé qu'un agent ne peut pas mal interpréter :</p>
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
      <p>Les couleurs sont en OKLch afin qu'elles restent perceptuellement homogènes sur les surfaces claires et sombres ; l'échelle typographique est une échelle dont l'agent ne déviera pas ; les règles de posture font la différence entre dix écrans générés qui donnent l'impression d'un seul produit et dix qui donnent l'impression de dix stagiaires différents. L'agent lit ceci une fois et le respecte pour tout le travail.</p>
      <p>Un system n'est pas une bibliothèque Figma. Il n'y a pas de composants, pas de variantes, pas d'instances imbriquées, pas de format binaire entre vous et les règles. C'est un contrat que n'importe quel agent peut lire et que n'importe quel humain peut auditer. Nous livrons 72 systems prêts à l'emploi, dont des versions portables de Linear, Vercel, Stripe, Apple, Cursor, Figma, et une longue traîne de systems éditoriaux et de marque.</p>
      <h3>Mélanger, forker, posséder</h3>
      <p>Parce qu'un system n'est que du texte, vous pouvez en forker un et l'éditer sur place, livrer une variante, ou écrire le vôtre de zéro en environ 30 minutes de travail concentré. Vous pouvez même mélanger des systems en cours de projet — la typographie de Linear, la logique de couleur de Vercel, la mise en page d'une spécification interne — parce que rien n'est enfermé dans un binaire propriétaire. La séparation entre les dossiers <code>skills/</code> et <code>design-systems/</code> est délibérée : capacité et goût sont orthogonaux, donc n'importe quel skill peut s'exécuter sous n'importe quel system, et n'importe quel system peut piloter n'importe quel skill.</p>
      <h2>Adaptateurs : l'unité d'agent</h2>
      <p>Les skills et les systems sont du texte inerte. Les adaptateurs sont la petite quantité de code qui les relie à l'agent qui effectue réellement le travail. Un adaptateur est un court fichier TypeScript dans <code>adapters/</code> qui sait comment :</p>
      <ul>
      <li>détecter si l'agent est installé sur le <code>$PATH</code> de l'utilisateur</li>
      <li>démarrer une session avec cet agent</li>
      <li>y acheminer une invocation de skill</li>
      <li>récupérer la sortie</li>
      </ul>
      <p>Nous livrons aujourd'hui des adaptateurs pour 12 agents : Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Le daemon détecte automatiquement ceux qui sont présents et les propose dans un menu déroulant au premier démarrage — vous ne configurez rien, vous voyez simplement les agents que vous avez déjà.</p>





























      <table><thead><tr><th>Primitive</th><th>Réside dans</th><th>Fichier</th><th>Source de vérité</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>le fichier sur le disque</td></tr><tr><td>System</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>le fichier sur le disque</td></tr><tr><td>Adaptateur</td><td><code>adapters/</code></td><td>un fichier <code>.ts</code></td><td>un appel <code>register()</code></td></tr></tbody></table>
      <p>Si vous voulez ajouter un nouvel adaptateur, le fichier fait environ 80 lignes de TypeScript et un seul appel <code>register()</code>. Aucun SDK à apprendre, aucune permission à demander, aucun registre central où publier. Le même agent auquel vous faites déjà confiance sur votre ordinateur portable devient le moteur — Open Design ne le remplace jamais. (Le pendant <a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow de design BYOK</a> explique comment pointer un adaptateur vers votre propre clé.)</p>
      <h2>Le daemon : la boucle qui relie le tout</h2>
      <p>Le daemon est le seul processus en cours d'exécution dans le système. C'est un petit processus Node que vous démarrez avec <code>pnpm tools-dev</code>, et il fait quatre choses en séquence :</p>
      <ol>
      <li><strong>Détecter</strong> — scanne <code>$PATH</code> à la recherche d'agents installés et <code>skills/</code> à la recherche de skills installés, au démarrage</li>
      <li><strong>Découvrir</strong> — ouvre un formulaire de questions interactif pour préciser la surface, le public, le ton, l'échelle et le contexte de marque du brief en cours</li>
      <li><strong>Diriger</strong> — présente 5 directions visuelles déterministes (palette en OKLch, pile de polices, indices de posture de mise en page) et demande à l'utilisateur d'en choisir une</li>
      <li><strong>Livrer</strong> — invoque le skill sélectionné avec le system verrouillé, laisse l'agent écrire sur le disque et prévisualise la sortie dans une iframe en bac à sable</li>
      </ol>
      <p>Toute la boucle tient en environ 1500 lignes de code. Elle est intentionnellement petite. L'intelligence est dans les skills, pas dans l'environnement d'exécution — le travail du daemon consiste à scanner des dossiers, acheminer un brief à travers les quatre étapes et rester à l'écart. Cette petitesse est l'enjeu : il y a très peu de choses ici qui peuvent pourrir, et presque rien qui puisse prendre votre travail en otage.</p>
      <h2>Ce que cela donne en pratique</h2>
      <p>Supposons que vous vouliez un deck de lancement pour une nouvelle fonctionnalité de produit. Voici le déroulé :</p>
      <ol>
      <li>Vous lancez <code>pnpm tools-dev</code> dans un terminal. Le daemon démarre sur <code>localhost:7780</code>.</li>
      <li>Vous ouvrez l'URL. Le daemon vous montre les agents qu'il a trouvés (p. ex. Claude, Cursor, Codex).</li>
      <li>Vous choisissez <code>guizang-ppt</code> dans la liste des skills.</li>
      <li>Un formulaire de questions de 30 secondes apparaît : qui est le public, quel est le ton, quel est le contexte de marque.</li>
      <li>On vous montre 5 directions visuelles — différentes palettes, associations typographiques, postures de mise en page. Vous en choisissez une.</li>
      <li>L'agent écrit sur le disque. Une iframe en bac à sable montre le résultat. Vous pouvez exporter en HTML, PDF, PPTX, ZIP ou Markdown.</li>
      </ol>
      <p>Retracez-le à travers les primitives et le tout devient lisible : l'étape 3 a choisi un <strong>skill</strong>, l'étape 5 a verrouillé un <strong>system</strong>, l'agent derrière est passé par un <strong>adaptateur</strong>, et le <strong>daemon</strong> a exécuté la boucle en quatre étapes. La sortie est réelle. Les fichiers sont les vôtres. Vous pouvez les éditer dans n'importe quel éditeur, les confier à un designer, ou les réinjecter dans un autre skill.</p>
      <h2>Pourquoi des fichiers, et non une base de données</h2>
      <p>Chaque primitive — skills, systems, adaptateurs — est un dossier de fichiers texte. Il n'y a aucune base de données centrale. Il n'y a aucun « compte Open Design ». Il n'y a aucun service hébergé qui doive continuer à fonctionner pour que votre travail continue de fonctionner.</p>
      <p>C'est un compromis délibéré. Nous renonçons à la capacité de faire des analyses transversales astucieuses entre utilisateurs, de la mémoire inter-projets ou de la collaboration hébergée. En échange nous obtenons : la portabilité, la longévité, l'auditabilité, et la possibilité pour quiconque de forker toute la bibliothèque et de livrer sa propre variante. Un <code>SKILL.md</code> écrit aujourd'hui se lira à l'identique pour un agent dans deux ans et pour un humain sans aucun outillage — on ne peut pas en dire autant d'un plugin épinglé à l'API de l'an dernier.</p>
      <p>Si vous avez vu une génération d'outils de design mourir en emportant vos fichiers avec eux, vous comprendrez pourquoi ce compromis en vaut la peine.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a> — le pari derrière les quatre primitives</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow de design BYOK : faites tourner Claude, Codex ou Qwen sur votre propre clé</a> — comment les adaptateurs se connectent à l'agent que vous payez déjà</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">La couche de mise en page que le canvas masquait</a> — pourquoi les règles de posture dans un DESIGN.md valent mieux que de faire glisser des boîtes sur un canvas</li>
      </ul>
  ru:
    title: "31 навык, 72 системы: как устроена библиотека Open Design"
    summary: "Прогулка по четырём примитивам, которые делают Open Design компонуемым: навыки, системы, адаптеры и daemon. С конкретными примерами того, как файл Markdown превращается в идеальный до пикселя результат."
    bodyHtml: |
      <p>Open Design с механической точки зрения — это четыре примитива, выстроенных друг на друге:</p>
      <ol>
      <li><strong>Навыки (Skills)</strong> — что должен делать агент</li>
      <li><strong>Системы (Systems)</strong> — как должен выглядеть результат</li>
      <li><strong>Адаптеры (Adapters)</strong> — какой агент выполняет работу</li>
      <li><strong>Daemon</strong> — цикл, который связывает их воедино</li>
      </ol>
      <p>Каждый примитив — это папка с файлами. Ни один из них не требует базы данных, среды выполнения плагинов или размещённого сервиса. Это вся библиотека целиком — за стеной входа не прячется никакой пятый концепт. Этот пост по очереди проходит по каждому из них и показывает, что происходит, когда вы направляете своего агента на реальный бриф. Если вам сначала нужны аргументы, <em>почему</em> мы придали этому именно такую форму, а уже потом — <em>как</em>, начните с <a href="/blog/why-we-built-open-design-as-a-skill-layer/">почему мы построили Open Design как слой навыков, а не как продукт</a>.</p>
      <h2>Навыки: единица возможности</h2>
      <p>Навык — это папка, содержащая один файл <code>SKILL.md</code> и ноль или больше вспомогательных файлов. Файл Markdown — это контракт агента; всё остальное в папке существует, чтобы помочь агенту его выполнить.</p>
      <h3>Анатомия папки навыка</h3>
      <p>Типичный навык выглядит так:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> объявляет имя навыка, условия срабатывания, форму входных данных, форму выходных данных и любые встроенные указания для агента. Папки <code>templates/</code> и <code>examples/</code> необязательны, но тянут на себе многое: примеры — это заведомо хорошие артефакты, по образцу которых агент может работать, и именно в этом разница между тем, что «сделай мне презентацию» выдаёт что-то связное, а не что-то импровизированное.</p>
      <p>Front matter — это та часть, которую читает daemon, чтобы зарегистрировать навык; тело — та часть, которую читает агент, чтобы его выполнить:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Почему файл и есть реестр</h3>
      <p>Когда daemon запускается, он сканирует <code>skills/</code> и регистрирует каждую папку, содержащую <code>SKILL.md</code>. Нет манифеста плагина. Нет поля версии. Нет шага загрузки, нет очереди на проверку, нет сборки. Есть файл, и файл — это источник истины. Положите внутрь новую папку, перезапустите daemon — и навык появляется в селекторе. Удалите её — и его нет; никаких осиротевших записей реестра, указывающих на код, которого больше не существует.</p>
      <p>Сейчас мы поставляем 31 навык. Одни — генераторы презентаций, другие создают мобильные макеты, третьи строят редакционные страницы, четвёртые пишут офисные документы (Word, Excel, PowerPoint). Каждый — это папка, которую можно форкнуть, отредактировать или заменить. Поскольку контракт — это простой текст, «написать навык» и «прочитать навык, чтобы понять, что он делает» — это одно и то же действие: вы проверяете его, просто открыв.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Одна карточка навыка в виде простого текста с подписанным заголовком и несколькими строками, выделенная зелёной рамкой на почти белом редакционном фоне">
        <figcaption>Навык — это атомарная единица возможности: один простой файл, который агент может взять, прочитать и выполнить.</figcaption>
      </figure>
      <h2>Системы: единица вкуса</h2>
      <p>Если навык описывает, <em>что делать</em>, то система описывает, <em>как это должно выглядеть</em>. Система — это файл <code>DESIGN.md</code> плюс необязательные референсные ресурсы. Она описывает визуальную идентичность в машиночитаемой форме:</p>
      <ul>
      <li><strong>Цвет</strong> — значения OKLch для текста, фона, акцента, ошибки и так далее</li>
      <li><strong>Типографика</strong> — стек шрифтов, начертания, типографическая шкала, соглашения о высоте строк</li>
      <li><strong>Пространство</strong> — базовая единица, шкала отступов, ширины контейнеров, правила интервалов</li>
      <li><strong>Позиция вёрстки</strong> — выбор сетки, правила асимметрии, предпочтения по плотности</li>
      <li><strong>Голос</strong> — типографика слов: тон, лексика, ритм предложений</li>
      </ul>
      <h3>DESIGN.md — это контракт, а не библиотека компонентов</h3>
      <p>На практике <code>DESIGN.md</code> читается как короткий, выраженный по позиции бренд-бриф, который агент не сможет истолковать неправильно:</p>
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
      <p>Цвета заданы в OKLch, поэтому они остаются перцептивно ровными на светлых и тёмных поверхностях; типографическая шкала — это лестница, с которой агент не сойдёт; правила позиции — это разница между десятью сгенерированными экранами, которые ощущаются как один продукт, и десятью, которые ощущаются как десять разных стажёров. Агент читает это один раз и уважает на протяжении всей работы.</p>
      <p>Система — это не библиотека Figma. Нет компонентов, нет вариантов, нет вложенных экземпляров, нет двоичного формата, стоящего между вами и правилами. Это контракт, который может прочитать любой агент и проверить любой человек. Из коробки мы поставляем 72 системы, включая портативные версии Linear, Vercel, Stripe, Apple, Cursor, Figma и длинный хвост редакционных и брендовых систем.</p>
      <h3>Смешивайте, форкайте, владейте</h3>
      <p>Поскольку система — это просто текст, вы можете форкнуть её и отредактировать на месте, выпустить вариант или написать собственную с нуля примерно за 30 минут сосредоточенной работы. Вы даже можете смешивать системы посреди проекта — типографику из Linear, логику цвета из Vercel, вёрстку из внутренней спецификации, — потому что ничто не заперто в проприетарном двоичном формате. Разделение между папками <code>skills/</code> и <code>design-systems/</code> сделано намеренно: возможность и вкус ортогональны, поэтому любой навык может работать под любой системой, и любая система может управлять любым навыком.</p>
      <h2>Адаптеры: единица агента</h2>
      <p>Навыки и системы — это инертный текст. Адаптеры — это небольшое количество кода, который связывает их с агентом, фактически выполняющим работу. Адаптер — это короткий файл TypeScript в <code>adapters/</code>, который умеет:</p>
      <ul>
      <li>определять, установлен ли агент в <code>$PATH</code> пользователя</li>
      <li>запускать сессию с этим агентом</li>
      <li>передавать вызов навыка внутрь</li>
      <li>собирать результат обратно</li>
      </ul>
      <p>Сегодня мы поставляем адаптеры для 12 агентов: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Daemon автоматически определяет, какие из них присутствуют, и предлагает их в виде выпадающего списка при первом запуске — вы ничего не настраиваете, вы просто видите агентов, которые у вас уже есть.</p>










































      <table><thead><tr><th>Примитив</th><th>Расположен в</th><th>Файл</th><th>Источник истины</th></tr></thead><tbody><tr><td>Навык</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>файл на диске</td></tr><tr><td>Система</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>файл на диске</td></tr><tr><td>Адаптер</td><td><code>adapters/</code></td><td>один файл <code>.ts</code></td><td>вызов <code>register()</code></td></tr></tbody></table>
      <p>Если вы хотите добавить новый адаптер, файл — это примерно 80 строк TypeScript и единственный вызов <code>register()</code>. Никакого SDK для изучения, никаких разрешений для запроса, никакого центрального реестра для публикации. Тот самый агент, которому вы уже доверяете на своём ноутбуке, становится движком — Open Design никогда его не заменяет. (Сопутствующий материал <a href="/blog/byok-design-workflow-claude-codex-qwen/">рабочий процесс дизайна BYOK</a> разбирает, как направить адаптер на ваш собственный ключ.)</p>
      <h2>Daemon: цикл, который связывает всё воедино</h2>
      <p>Daemon — единственный работающий процесс в системе. Это небольшой процесс Node, который вы запускаете командой <code>pnpm tools-dev</code>, и он делает четыре вещи последовательно:</p>
      <ol>
      <li><strong>Detect (Обнаружение)</strong> — сканирует <code>$PATH</code> на наличие установленных агентов и <code>skills/</code> на наличие установленных навыков при запуске</li>
      <li><strong>Discover (Выяснение)</strong> — открывает интерактивную форму с вопросами, чтобы уточнить поверхность, аудиторию, тон, масштаб и брендовый контекст текущего брифа</li>
      <li><strong>Direct (Направление)</strong> — представляет 5 детерминированных визуальных направлений (палитра в OKLch, стек шрифтов, подсказки по позиции вёрстки) и просит пользователя выбрать одно</li>
      <li><strong>Deliver (Доставка)</strong> — вызывает выбранный навык с зафиксированной системой, позволяет агенту записать на диск и показывает предпросмотр результата в изолированном iframe</li>
      </ol>
      <p>Весь цикл умещается примерно в 1500 строк кода. Он намеренно мал. Хитрость — в навыках, а не в среде выполнения: задача daemon — сканировать папки, провести бриф через четыре шага и не мешать. Эта малость и есть суть: здесь очень мало того, что может прогнить, и почти ничего, что могло бы взять вашу работу в заложники.</p>
      <h2>Каково это на практике</h2>
      <p>Предположим, вам нужна презентация о запуске новой функции продукта. Вот ход работы:</p>
      <ol>
      <li>Вы запускаете <code>pnpm tools-dev</code> в терминале. Daemon стартует на <code>localhost:7780</code>.</li>
      <li>Вы открываете URL. Daemon показывает, каких агентов он нашёл (например, Claude, Cursor, Codex).</li>
      <li>Вы выбираете <code>guizang-ppt</code> из списка навыков.</li>
      <li>Всплывает 30-секундная форма с вопросами: кто аудитория, какой тон, какой брендовый контекст.</li>
      <li>Вам показывают 5 визуальных направлений — разные палитры, шрифтовые пары, позиции вёрстки. Вы выбираете одно.</li>
      <li>Агент записывает на диск. Изолированный iframe показывает результат. Вы можете экспортировать в HTML, PDF, PPTX, ZIP или Markdown.</li>
      </ol>
      <p>Проследите это обратно через примитивы — и всё целиком становится прозрачным: шаг 3 выбрал <strong>навык</strong>, шаг 5 зафиксировал <strong>систему</strong>, агент за ним пришёл через <strong>адаптер</strong>, а <strong>daemon</strong> прогнал четырёхшаговый цикл. Результат настоящий. Файлы — ваши. Вы можете отредактировать их в любом редакторе, передать дизайнеру или скормить обратно другому навыку.</p>
      <h2>Почему файлы, а не база данных</h2>
      <p>Каждый примитив — навыки, системы, адаптеры — это папка с текстовыми файлами. Нет центральной базы данных. Нет «аккаунта Open Design». Нет размещённого сервиса, который должен продолжать работать, чтобы продолжала работать ваша работа.</p>
      <p>Это намеренный компромисс. Мы отказываемся от возможности делать хитрую кросс-пользовательскую аналитику, кросс-проектную память или размещённую совместную работу. Взамен мы получаем: портативность, долговечность, проверяемость и возможность для любого форкнуть всю библиотеку и выпустить собственный вариант. <code>SKILL.md</code>, написанный сегодня, читается одинаково для агента через два года и для человека вообще без какого-либо инструментария — чего не скажешь о плагине, привязанном к прошлогоднему API.</p>
      <p>Если вы наблюдали, как целое поколение инструментов для дизайна умирало, унося ваши файлы с собой, вы поймёте, почему этот компромисс того стоит.</p>
      <h2>Связанные материалы</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не как продукт</a> — ставка, стоящая за четырьмя примитивами</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Рабочий процесс дизайна BYOK: запускайте Claude, Codex или Qwen на собственном ключе</a> — как адаптеры подключаются к агенту, за которого вы уже платите</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Слой вёрстки, который раньше прятал холст</a> — почему правила позиции в DESIGN.md лучше перетаскивания прямоугольников по холсту</li>
      </ul>
  es:
    title: "31 skills, 72 systems: cómo funciona la biblioteca de Open Design"
    summary: "Un recorrido por las cuatro primitivas que hacen que Open Design sea componible: skills, systems, adapters y el daemon. Con ejemplos concretos de cómo un archivo Markdown se convierte en un entregable perfecto al píxel."
    bodyHtml: |
      <p>Open Design es, mecánicamente, cuatro primitivas apiladas una sobre otra:</p>
      <ol>
      <li><strong>Skills</strong> — qué debe hacer el agente</li>
      <li><strong>Systems</strong> — cómo debe verse el resultado</li>
      <li><strong>Adapters</strong> — qué agente realiza el trabajo</li>
      <li><strong>El daemon</strong> — el bucle que los conecta entre sí</li>
      </ol>
      <p>Cada primitiva es una carpeta de archivos. Ninguna de ellas requiere una base de datos, un runtime de plugins ni un servicio alojado. Eso es toda la biblioteca — no hay un quinto concepto escondido detrás de un muro de inicio de sesión. Esta publicación recorre cada una por turnos y muestra qué ocurre cuando diriges tu agente hacia un brief real. Si quieres el argumento de <em>por qué</em> lo diseñamos de esta manera antes del <em>cómo</em>, empieza por <a href="/blog/why-we-built-open-design-as-a-skill-layer/">por qué construimos Open Design como una capa de skills, no como un producto</a>.</p>
      <h2>Skills: la unidad de capacidad</h2>
      <p>Un skill es una carpeta que contiene un <code>SKILL.md</code> y cero o más archivos de apoyo. El archivo Markdown es el contrato del agente — todo lo demás en la carpeta está ahí para ayudar al agente a cumplirlo.</p>
      <h3>Anatomía de una carpeta de skill</h3>
      <p>Un skill típico se ve así:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> declara el nombre del skill, las condiciones de activación, la forma de la entrada, la forma de la salida y cualquier orientación en línea para el agente. Las carpetas <code>templates/</code> y <code>examples/</code> son opcionales pero aportan mucho: los ejemplos son artefactos conocidos y correctos con los que el agente puede hacer coincidencia de patrones, que es la diferencia entre que «hazme un deck» produzca algo coherente en lugar de algo improvisado.</p>
      <p>El front matter es la parte que el daemon lee para registrar el skill; el cuerpo es la parte que el agente lee para ejecutarlo:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Por qué el archivo es el registro</h3>
      <p>Cuando el daemon arranca, escanea <code>skills/</code> y registra cada carpeta que contenga un <code>SKILL.md</code>. No hay manifiesto de plugin. No hay campo de versión. No hay paso de subida, ni cola de revisión, ni build. Está el archivo, y el archivo es la fuente de verdad. Suelta una nueva carpeta dentro, reinicia el daemon, y el skill aparece en el selector. Bórrala, y desaparece — sin una entrada de registro huérfana apuntando a código que ya no existe.</p>
      <p>Actualmente distribuimos 31 skills. Algunos son generadores de decks, algunos producen mockups móviles, algunos construyen páginas editoriales, algunos escriben documentos de oficina (Word, Excel, PowerPoint). Cada uno es una carpeta que puedes bifurcar, editar o reemplazar. Como el contrato es texto plano, «escribir un skill» y «leer un skill para entender qué hace» son la misma actividad — lo auditas abriéndolo.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Una única tarjeta de skill en texto plano con un encabezado etiquetado y unas pocas líneas, seleccionada con un marco verde sobre un fondo editorial casi blanco">
        <figcaption>Un skill es la unidad atómica de capacidad — un archivo plano que un agente puede tomar, leer y ejecutar.</figcaption>
      </figure>
      <h2>Systems: la unidad de gusto</h2>
      <p>Si un skill describe <em>qué hacer</em>, un system describe <em>cómo debe verse</em>. Un system es un archivo <code>DESIGN.md</code> más assets de referencia opcionales. Describe una identidad visual en forma legible por máquina:</p>
      <ul>
      <li><strong>Color</strong> — valores OKLch para primer plano, fondo, acento, error, etc.</li>
      <li><strong>Tipografía</strong> — el stack de fuentes, los pesos, la escala tipográfica, las convenciones de interlineado</li>
      <li><strong>Espacio</strong> — unidad base, escala de espaciado, anchos de contenedor, reglas de canalón</li>
      <li><strong>Postura de layout</strong> — elecciones de grid, reglas de asimetría, preferencias de densidad</li>
      <li><strong>Voz</strong> — la tipografía de las palabras: tono, vocabulario, ritmo de las frases</li>
      </ul>
      <h3>Un DESIGN.md es un contrato, no una biblioteca de componentes</h3>
      <p>En la práctica, un <code>DESIGN.md</code> se lee como un brief de marca breve y con opinión que un agente no puede malinterpretar:</p>
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
      <p>Los colores son OKLch para que se mantengan perceptualmente uniformes entre superficies claras y oscuras; la escala tipográfica es una escalera de la que el agente no se desviará; las reglas de postura son la diferencia entre diez pantallas generadas que se sienten como un solo producto y diez que se sienten como diez becarios distintos. El agente lee esto una vez y lo respeta durante todo el trabajo.</p>
      <p>Un system no es una biblioteca de Figma. No hay componentes, ni variantes, ni instancias anidadas, ni formato binario interponiéndose entre tú y las reglas. Es un contrato que cualquier agente puede leer y cualquier humano puede auditar. Distribuimos 72 systems de fábrica, incluidas versiones portables de Linear, Vercel, Stripe, Apple, Cursor, Figma, y una larga cola de sistemas editoriales y de marca.</p>
      <h3>Mezcla, bifurca, hazlo tuyo</h3>
      <p>Como un system es solo texto, puedes bifurcar uno y editarlo en el sitio, distribuir una variante, o escribir el tuyo desde cero en aproximadamente 30 minutos de trabajo concentrado. Incluso puedes mezclar systems a mitad de un proyecto — tipografía de Linear, lógica de color de Vercel, layout de una especificación interna — porque nada está encerrado en un binario propietario. La división entre las carpetas <code>skills/</code> y <code>design-systems/</code> es deliberada: capacidad y gusto son ortogonales, de modo que cualquier skill puede ejecutarse bajo cualquier system, y cualquier system puede impulsar cualquier skill.</p>
      <h2>Adapters: la unidad de agente</h2>
      <p>Los skills y los systems son texto inerte. Los adapters son la pequeña cantidad de código que los conecta con el agente que realmente hace el trabajo. Un adapter es un breve archivo TypeScript en <code>adapters/</code> que sabe cómo:</p>
      <ul>
      <li>detectar si el agente está instalado en el <code>$PATH</code> del usuario</li>
      <li>iniciar una sesión con ese agente</li>
      <li>canalizar una invocación de skill hacia él</li>
      <li>recopilar la salida de vuelta</li>
      </ul>
      <p>Hoy distribuimos adapters para 12 agentes: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. El daemon detecta automáticamente cuáles están presentes y los ofrece como un desplegable en el primer arranque — no configuras nada, simplemente ves los agentes que ya tienes.</p>




      <table><thead><tr><th>Primitiva</th><th>Vive en</th><th>Archivo</th><th>Fuente de verdad</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>el archivo en disco</td></tr><tr><td>System</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>el archivo en disco</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>un archivo <code>.ts</code></td><td>una llamada a <code>register()</code></td></tr></tbody></table>
      <p>Si quieres añadir un nuevo adapter, el archivo son aproximadamente 80 líneas de TypeScript y una única llamada a <code>register()</code>. Ningún SDK que aprender, ningún permiso que solicitar, ningún registro central donde publicar. El mismo agente en el que ya confías en tu portátil se convierte en el motor — Open Design nunca lo reemplaza. (La pieza complementaria <a href="/blog/byok-design-workflow-claude-codex-qwen/">flujo de trabajo de diseño BYOK</a> recorre cómo dirigir un adapter hacia tu propia clave.)</p>
      <h2>El daemon: el bucle que lo une todo</h2>
      <p>El daemon es el único proceso en ejecución del sistema. Es un pequeño proceso de Node que inicias con <code>pnpm tools-dev</code>, y hace cuatro cosas en secuencia:</p>
      <ol>
      <li><strong>Detectar</strong> — escanea el <code>$PATH</code> en busca de agentes instalados y <code>skills/</code> en busca de skills instalados, al arrancar</li>
      <li><strong>Descubrir</strong> — abre un formulario interactivo de preguntas para precisar superficie, audiencia, tono, escala y contexto de marca del brief actual</li>
      <li><strong>Dirigir</strong> — presenta 5 direcciones visuales deterministas (paleta en OKLch, stack de fuentes, pistas de postura de layout) y pide al usuario que elija una</li>
      <li><strong>Entregar</strong> — invoca el skill seleccionado con el system fijado, deja que el agente escriba en disco, y previsualiza la salida en un iframe en sandbox</li>
      </ol>
      <p>Todo el bucle cabe en aproximadamente 1500 líneas de código. Es intencionadamente pequeño. La inteligencia está en los skills, no en el runtime — el trabajo del daemon es escanear carpetas, enrutar un brief a través de los cuatro pasos y quitarse de en medio. Esa pequeñez es el punto clave: hay muy poco aquí que pueda pudrirse, y casi nada que pueda tener tu trabajo como rehén.</p>
      <h2>Cómo se siente en la práctica</h2>
      <p>Supón que quieres un deck de lanzamiento para una nueva funcionalidad de producto. Este es el flujo:</p>
      <ol>
      <li>Ejecutas <code>pnpm tools-dev</code> en una terminal. El daemon arranca en <code>localhost:7780</code>.</li>
      <li>Abres la URL. El daemon te muestra qué agentes encontró (p. ej. Claude, Cursor, Codex).</li>
      <li>Eliges <code>guizang-ppt</code> de la lista de skills.</li>
      <li>Aparece un formulario de preguntas de 30 segundos: quién es la audiencia, cuál es el tono, cuál es el contexto de marca.</li>
      <li>Se te muestran 5 direcciones visuales — distintas paletas, emparejamientos tipográficos, posturas de layout. Eliges una.</li>
      <li>El agente escribe en disco. Un iframe en sandbox muestra el resultado. Puedes exportar a HTML, PDF, PPTX, ZIP o Markdown.</li>
      </ol>
      <p>Recórrelo de vuelta a través de las primitivas y todo el conjunto es legible: el paso 3 eligió un <strong>skill</strong>, el paso 5 fijó un <strong>system</strong>, el agente detrás vino a través de un <strong>adapter</strong>, y el <strong>daemon</strong> ejecutó el bucle de cuatro pasos. La salida es real. Los archivos son tuyos. Puedes editarlos en cualquier editor, entregárselos a un diseñador, o alimentarlos de vuelta a otro skill.</p>
      <h2>Por qué archivos, no una base de datos</h2>
      <p>Cada primitiva — skills, systems, adapters — es una carpeta de archivos de texto. No hay base de datos central. No hay «cuenta de Open Design». No hay servicio alojado que tenga que seguir funcionando para que tu trabajo siga funcionando.</p>
      <p>Esto es un compromiso deliberado. Renunciamos a la capacidad de hacer analíticas ingeniosas entre usuarios, memoria entre proyectos, o colaboración alojada. A cambio recibimos: portabilidad, longevidad, auditabilidad, y la capacidad de que cualquiera bifurque la biblioteca entera y distribuya su propia variante. Un <code>SKILL.md</code> escrito hoy se lee idéntico para un agente dentro de dos años y para un humano sin herramienta alguna — no puede decirse lo mismo de un plugin anclado a la API del año pasado.</p>
      <p>Si has visto morir a una generación de herramientas de diseño llevándose tus archivos con ellas, entenderás por qué este compromiso vale la pena.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a> — la apuesta detrás de las cuatro primitivas</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flujo de trabajo de diseño BYOK: ejecuta Claude, Codex o Qwen con tu propia clave</a> — cómo se conectan los adapters al agente que ya pagas</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">La capa de layout que el canvas solía ocultar</a> — por qué las reglas de postura en un DESIGN.md superan a arrastrar cajas en un canvas</li>
      </ul>
  pt-br:
    title: "31 skills, 72 sistemas: como funciona a biblioteca do Open Design"
    summary: "Um passeio pelas quatro primitivas que tornam o Open Design composável: skills, sistemas, adaptadores e o daemon. Com exemplos concretos de como um arquivo Markdown vira uma entrega perfeita até o último pixel."
    bodyHtml: |
      <p>O Open Design é, mecanicamente, quatro primitivas empilhadas umas sobre as outras:</p>
      <ol>
      <li><strong>Skills</strong> — o que o agente deve fazer</li>
      <li><strong>Sistemas</strong> — como a saída deve parecer</li>
      <li><strong>Adaptadores</strong> — qual agente faz o trabalho</li>
      <li><strong>O daemon</strong> — o loop que conecta tudo</li>
      </ol>
      <p>Cada primitiva é uma pasta de arquivos. Nenhuma delas exige um banco de dados, um runtime de plugin ou um serviço hospedado. Essa é a biblioteca inteira — não há um quinto conceito escondido atrás de um muro de login. Este post percorre cada uma por vez e mostra o que acontece quando você aponta seu agente para um briefing real. Se você quer o argumento de <em>por que</em> a moldamos assim antes do <em>como</em>, comece com <a href="/blog/why-we-built-open-design-as-a-skill-layer/">por que construímos o Open Design como uma camada de skills, não um produto</a>.</p>
      <h2>Skills: a unidade de capacidade</h2>
      <p>Uma skill é uma pasta contendo um <code>SKILL.md</code> e zero ou mais arquivos de apoio. O arquivo Markdown é o contrato do agente — todo o resto na pasta está ali para ajudar o agente a cumpri-lo.</p>
      <h3>Anatomia de uma pasta de skill</h3>
      <p>Uma skill típica é assim:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p>O <code>SKILL.md</code> declara o nome da skill, as condições de gatilho, o formato de entrada, o formato de saída e qualquer orientação inline para o agente. As pastas <code>templates/</code> e <code>examples/</code> são opcionais, mas carregam muito peso: os exemplos são artefatos comprovadamente bons contra os quais o agente pode fazer correspondência de padrões, o que é a diferença entre “me faça um deck” produzir algo coerente versus algo improvisado.</p>
      <p>O front matter é a parte que o daemon lê para registrar a skill; o corpo é a parte que o agente lê para executá-la:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Por que o arquivo é o registro</h3>
      <p>Quando o daemon inicia, ele varre <code>skills/</code> e registra toda pasta que contenha um <code>SKILL.md</code>. Não há manifesto de plugin. Não há campo de versão. Não há etapa de upload, fila de revisão ou build. Há o arquivo, e o arquivo é a fonte da verdade. Coloque uma nova pasta, reinicie o daemon, e a skill aparece no seletor. Apague-a, e ela some — sem entrada de registro órfã apontando para código que não existe mais.</p>
      <p>Atualmente entregamos 31 skills. Algumas são geradoras de deck, algumas produzem mockups mobile, algumas constroem páginas editoriais, algumas escrevem documentos de escritório (Word, Excel, PowerPoint). Cada uma é uma pasta que você pode forkar, editar ou substituir. Como o contrato é texto puro, “escrever uma skill” e “ler uma skill para entender o que ela faz” são a mesma atividade — você a audita abrindo-a.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Um único cartão de skill em texto puro com um cabeçalho rotulado e algumas linhas, selecionado em uma moldura verde sobre um fundo editorial quase branco">
        <figcaption>Uma skill é a unidade atômica de capacidade — um único arquivo de texto que um agente pode pegar, ler e rodar.</figcaption>
      </figure>
      <h2>Sistemas: a unidade de bom gosto</h2>
      <p>Se uma skill descreve <em>o que fazer</em>, um sistema descreve <em>como deve parecer</em>. Um sistema é um arquivo <code>DESIGN.md</code> mais ativos de referência opcionais. Ele descreve uma identidade visual em forma legível por máquina:</p>
      <ul>
      <li><strong>Cor</strong> — valores OKLch para primeiro plano, fundo, destaque, erro e assim por diante</li>
      <li><strong>Tipografia</strong> — pilha de fontes, pesos, a escala tipográfica, convenções de entrelinha</li>
      <li><strong>Espaço</strong> — unidade base, escala de espaçamento, larguras de container, regras de gutter</li>
      <li><strong>Postura de layout</strong> — escolhas de grid, regras de assimetria, preferências de densidade</li>
      <li><strong>Voz</strong> — a tipografia das palavras: tom, vocabulário, ritmo das frases</li>
      </ul>
      <h3>Um DESIGN.md é um contrato, não uma biblioteca de componentes</h3>
      <p>Na prática, um <code>DESIGN.md</code> se lê como um briefing de marca curto e opinativo que um agente não consegue interpretar errado:</p>
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
      <p>As cores são OKLch para que permaneçam perceptualmente uniformes entre superfícies claras e escuras; a escala tipográfica é uma escada da qual o agente não vai se desviar; as regras de postura são a diferença entre dez telas geradas que parecem um único produto e dez que parecem dez estagiários diferentes. O agente lê isso uma vez e respeita pelo trabalho inteiro.</p>
      <p>Um sistema não é uma biblioteca do Figma. Não há componentes, nem variantes, nem instâncias aninhadas, nem formato binário se interpondo entre você e as regras. É um contrato que qualquer agente pode ler e qualquer humano pode auditar. Entregamos 72 sistemas prontos de fábrica, incluindo versões portáteis de Linear, Vercel, Stripe, Apple, Cursor, Figma e uma longa cauda de sistemas editoriais e de marca.</p>
      <h3>Misture, forke, seja dono</h3>
      <p>Como um sistema é apenas texto, você pode forkar um e editá-lo no lugar, entregar uma variante ou escrever o seu do zero em cerca de 30 minutos de trabalho focado. Você pode até misturar sistemas no meio do projeto — tipografia do Linear, lógica de cor do Vercel, layout de uma especificação interna — porque nada está preso a um binário proprietário. A separação entre as pastas <code>skills/</code> e <code>design-systems/</code> é deliberada: capacidade e bom gosto são ortogonais, então qualquer skill pode rodar sob qualquer sistema, e qualquer sistema pode dirigir qualquer skill.</p>
      <h2>Adaptadores: a unidade de agente</h2>
      <p>Skills e sistemas são texto inerte. Adaptadores são a pequena quantidade de código que os conecta ao agente que de fato faz o trabalho. Um adaptador é um arquivo TypeScript curto em <code>adapters/</code> que sabe como:</p>
      <ul>
      <li>detectar se o agente está instalado no <code>$PATH</code> do usuário</li>
      <li>iniciar uma sessão com aquele agente</li>
      <li>encaminhar uma invocação de skill para dentro</li>
      <li>coletar a saída de volta</li>
      </ul>
      <p>Hoje entregamos adaptadores para 12 agentes: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. O daemon detecta automaticamente quais estão presentes e os oferece como um dropdown na primeira inicialização — você não configura nada, apenas vê os agentes que já tem.</p>





























      <table><thead><tr><th>Primitiva</th><th>Mora em</th><th>Arquivo</th><th>Fonte da verdade</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>o arquivo em disco</td></tr><tr><td>Sistema</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>o arquivo em disco</td></tr><tr><td>Adaptador</td><td><code>adapters/</code></td><td>um arquivo <code>.ts</code></td><td>uma chamada <code>register()</code></td></tr></tbody></table>
      <p>Se você quiser adicionar um novo adaptador, o arquivo tem cerca de 80 linhas de TypeScript e uma única chamada <code>register()</code>. Nenhum SDK para aprender, nenhuma permissão para solicitar, nenhum registro central para publicar. O mesmo agente em que você já confia no seu laptop vira o motor — o Open Design nunca o substitui. (O texto complementar <a href="/blog/byok-design-workflow-claude-codex-qwen/">fluxo de design BYOK</a> percorre como apontar um adaptador para a sua própria chave.)</p>
      <h2>O daemon: o loop que amarra tudo</h2>
      <p>O daemon é o único processo em execução no sistema. É um pequeno processo Node que você inicia com <code>pnpm tools-dev</code>, e ele faz quatro coisas em sequência:</p>
      <ol>
      <li><strong>Detectar</strong> — varre o <code>$PATH</code> em busca de agentes instalados e <code>skills/</code> em busca de skills instaladas, na inicialização</li>
      <li><strong>Descobrir</strong> — abre um formulário interativo de perguntas para fixar superfície, público, tom, escala e contexto de marca do briefing atual</li>
      <li><strong>Direcionar</strong> — apresenta 5 direções visuais determinísticas (paleta em OKLch, pilha de fontes, dicas de postura de layout) e pede que o usuário escolha uma</li>
      <li><strong>Entregar</strong> — invoca a skill selecionada com o sistema travado, deixa o agente gravar em disco e pré-visualiza a saída em um iframe em sandbox</li>
      </ol>
      <p>O loop inteiro cabe em cerca de 1500 linhas de código. Ele é intencionalmente pequeno. A esperteza está nas skills, não no runtime — o trabalho do daemon é varrer pastas, rotear um briefing pelos quatro passos e sair do caminho. Essa pequenez é o ponto: há muito pouco aqui que pode apodrecer, e quase nada que pode manter seu trabalho refém.</p>
      <h2>Como é na prática</h2>
      <p>Suponha que você queira um deck de lançamento para um novo recurso de produto. Veja o fluxo:</p>
      <ol>
      <li>Você roda <code>pnpm tools-dev</code> em um terminal. O daemon inicia em <code>localhost:7780</code>.</li>
      <li>Você abre a URL. O daemon mostra quais agentes encontrou (ex.: Claude, Cursor, Codex).</li>
      <li>Você escolhe <code>guizang-ppt</code> na lista de skills.</li>
      <li>Um formulário de perguntas de 30 segundos aparece: quem é o público, qual é o tom, qual é o contexto de marca.</li>
      <li>São mostradas 5 direções visuais — paletas diferentes, pares tipográficos, posturas de layout. Você escolhe uma.</li>
      <li>O agente grava em disco. Um iframe em sandbox mostra o resultado. Você pode exportar para HTML, PDF, PPTX, ZIP ou Markdown.</li>
      </ol>
      <p>Trace de volta pelas primitivas e a coisa toda fica legível: o passo 3 escolheu uma <strong>skill</strong>, o passo 5 travou um <strong>sistema</strong>, o agente por trás veio através de um <strong>adaptador</strong>, e o <strong>daemon</strong> rodou o loop de quatro passos. A saída é real. Os arquivos são seus. Você pode editá-los em qualquer editor, entregá-los a um designer ou realimentá-los em outra skill.</p>
      <h2>Por que arquivos, não um banco de dados</h2>
      <p>Toda primitiva — skills, sistemas, adaptadores — é uma pasta de arquivos de texto. Não há banco de dados central. Não há “conta do Open Design.” Não há serviço hospedado que precise continuar funcionando para que o seu trabalho continue funcionando.</p>
      <p>Esse é um trade-off deliberado. Abrimos mão da capacidade de fazer análises espertas entre usuários, memória entre projetos ou colaboração hospedada. Em troca, ganhamos: portabilidade, longevidade, auditabilidade e a capacidade de qualquer um forkar a biblioteca inteira e entregar a própria variante. Um <code>SKILL.md</code> escrito hoje se lê de forma idêntica para um agente daqui a dois anos e para um humano sem ferramenta nenhuma — o mesmo não se pode dizer de um plugin preso à API do ano passado.</p>
      <p>Se você viu uma geração de ferramentas de design morrer levando seus arquivos junto, vai entender por que esse trade-off vale a pena.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a> — a aposta por trás das quatro primitivas</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Fluxo de design BYOK: rode Claude, Codex ou Qwen com sua própria chave</a> — como os adaptadores se conectam ao agente que você já paga</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">A camada de layout que o canvas costumava esconder</a> — por que regras de postura num DESIGN.md ganham de arrastar caixas num canvas</li>
      </ul>
  it:
    title: "31 skill, 72 sistemi: come funziona la libreria di Open Design"
    summary: "Una panoramica delle quattro primitive che rendono Open Design componibile: skill, sistemi, adattatori e il daemon. Con esempi concreti di come un file Markdown diventa un deliverable perfetto al pixel."
    bodyHtml: |
      <p>Open Design è, meccanicamente, quattro primitive impilate una sull'altra:</p>
      <ol>
      <li><strong>Skill</strong>: cosa dovrebbe fare l'agente</li>
      <li><strong>Sistemi</strong>: come dovrebbe apparire l'output</li>
      <li><strong>Adattatori</strong>: quale agente svolge il lavoro</li>
      <li><strong>Il daemon</strong>: il ciclo che li collega tra loro</li>
      </ol>
      <p>Ogni primitiva è una cartella di file. Nessuna di esse richiede un database, un runtime di plugin o un servizio ospitato. Questa è l'intera libreria: non c'è un quinto concetto nascosto dietro un muro di login. Questo articolo passa in rassegna ognuna a turno e mostra cosa succede quando punti il tuo agente a un brief reale. Se vuoi l'argomentazione sul <em>perché</em> l'abbiamo plasmato così prima del <em>come</em>, inizia da <a href="/blog/why-we-built-open-design-as-a-skill-layer/">perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>.</p>
      <h2>Skill: l'unità di capacità</h2>
      <p>Una skill è una cartella che contiene un <code>SKILL.md</code> e zero o più file di supporto. Il file Markdown è il contratto dell'agente: tutto il resto nella cartella serve ad aiutare l'agente a rispettarlo.</p>
      <h3>Anatomia di una cartella di skill</h3>
      <p>Una skill tipica si presenta così:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> dichiara il nome della skill, le condizioni di attivazione, la forma dell'input, la forma dell'output e qualsiasi indicazione inline per l'agente. Le cartelle <code>templates/</code> ed <code>examples/</code> sono opzionali ma pesano molto: gli esempi sono artefatti noti come validi su cui l'agente può fare pattern-matching, ed è la differenza tra "fammi un deck" che produce qualcosa di coerente rispetto a qualcosa di improvvisato.</p>
      <p>Il front matter è la parte che il daemon legge per registrare la skill; il corpo è la parte che l'agente legge per eseguirla:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Perché il file è il registro</h3>
      <p>Quando il daemon si avvia, scansiona <code>skills/</code> e registra ogni cartella che contiene un <code>SKILL.md</code>. Non c'è alcun manifest di plugin. Non c'è alcun campo di versione. Non c'è alcun passo di upload, nessuna coda di revisione, nessuna build. C'è il file, e il file è la fonte di verità. Lascia cadere una nuova cartella, riavvia il daemon, e la skill appare nel selettore. Eliminala, ed è sparita: nessuna voce orfana nel registro che punta a codice che non esiste più.</p>
      <p>Al momento rilasciamo 31 skill. Alcune sono generatori di deck, alcune producono mockup mobile, alcune costruiscono pagine editoriali, alcune scrivono documenti d'ufficio (Word, Excel, PowerPoint). Ognuna è una cartella che puoi forkare, modificare o sostituire. Poiché il contratto è testo semplice, "scrivere una skill" e "leggere una skill per capire cosa fa" sono la stessa attività: la verifichi aprendola.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Una singola scheda di skill in testo semplice con un'intestazione etichettata e poche righe, selezionata in una cornice verde su uno sfondo editoriale quasi bianco">
        <figcaption>Una skill è l'unità atomica di capacità: un singolo file in chiaro che un agente può raccogliere, leggere ed eseguire.</figcaption>
      </figure>
      <h2>Sistemi: l'unità di gusto</h2>
      <p>Se una skill descrive <em>cosa creare</em>, un sistema descrive <em>come dovrebbe apparire</em>. Un sistema è un file <code>DESIGN.md</code> più asset di riferimento opzionali. Descrive un'identità visiva in forma leggibile dalla macchina:</p>
      <ul>
      <li><strong>Colore</strong>: valori OKLch per primo piano, sfondo, accento, errore e così via</li>
      <li><strong>Tipografia</strong>: stack di font, pesi, la scala tipografica, convenzioni di interlinea</li>
      <li><strong>Spazio</strong>: unità di base, scala di spaziatura, larghezze dei contenitori, regole di gutter</li>
      <li><strong>Postura del layout</strong>: scelte di griglia, regole di asimmetria, preferenze di densità</li>
      <li><strong>Voce</strong>: tipografia delle parole: tono, vocabolario, ritmo delle frasi</li>
      </ul>
      <h3>Un DESIGN.md è un contratto, non una libreria di componenti</h3>
      <p>In pratica un <code>DESIGN.md</code> si legge come un brief di brand breve e deciso che un agente non può fraintendere:</p>
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
      <p>I colori sono in OKLch così restano percettivamente uniformi su superfici chiare e scure; la scala tipografica è una scala da cui l'agente non si allontana; le regole di postura sono la differenza tra dieci schermate generate che sembrano un unico prodotto e dieci che sembrano dieci stagisti diversi. L'agente legge questo una volta e lo rispetta per l'intero lavoro.</p>
      <p>Un sistema non è una libreria Figma. Non ci sono componenti, né varianti, né istanze annidate, né formato binario che si frappone tra te e le regole. È un contratto che qualsiasi agente può leggere e qualsiasi umano può verificare. Rilasciamo 72 sistemi pronti all'uso, incluse versioni portabili di Linear, Vercel, Stripe, Apple, Cursor, Figma e una lunga coda di sistemi editoriali e di brand.</p>
      <h3>Mescola, forka, possiedi</h3>
      <p>Poiché un sistema è solo testo, puoi forkarne uno e modificarlo sul posto, rilasciare una variante o scriverne uno tuo da zero in circa 30 minuti di lavoro concentrato. Puoi persino mescolare sistemi a metà progetto — la tipografia da Linear, la logica del colore da Vercel, il layout da una specifica interna — perché nulla è bloccato in un binario proprietario. La separazione tra le cartelle <code>skills/</code> e <code>design-systems/</code> è deliberata: capacità e gusto sono ortogonali, quindi qualsiasi skill può girare sotto qualsiasi sistema, e qualsiasi sistema può pilotare qualsiasi skill.</p>
      <h2>Adattatori: l'unità di agente</h2>
      <p>Skill e sistemi sono testo inerte. Gli adattatori sono la piccola quantità di codice che li collega all'agente che fa effettivamente il lavoro. Un adattatore è un breve file TypeScript in <code>adapters/</code> che sa come:</p>
      <ul>
      <li>rilevare se l'agente è installato nel <code>$PATH</code> dell'utente</li>
      <li>avviare una sessione con quell'agente</li>
      <li>inviare un'invocazione di skill</li>
      <li>raccogliere indietro l'output</li>
      </ul>
      <p>Oggi rilasciamo adattatori per 12 agenti: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Il daemon rileva automaticamente quali sono presenti e li offre come menu a tendina al primo avvio: non configuri nulla, vedi semplicemente gli agenti che hai già.</p>




      <table><thead><tr><th>Primitiva</th><th>Risiede in</th><th>File</th><th>Fonte di verità</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>il file su disco</td></tr><tr><td>Sistema</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>il file su disco</td></tr><tr><td>Adattatore</td><td><code>adapters/</code></td><td>un file <code>.ts</code></td><td>una chiamata <code>register()</code></td></tr></tbody></table>
      <p>Se vuoi aggiungere un nuovo adattatore, il file è all'incirca 80 righe di TypeScript e una singola chiamata <code>register()</code>. Nessun SDK da imparare, nessun permesso da richiedere, nessun registro centrale su cui pubblicare. Lo stesso agente di cui ti fidi già sul tuo laptop diventa il motore: Open Design non lo sostituisce mai. (Il pezzo complementare <a href="/blog/byok-design-workflow-claude-codex-qwen/">flusso di lavoro di design BYOK</a> illustra come puntare un adattatore alla tua chiave.)</p>
      <h2>Il daemon: il ciclo che lega tutto insieme</h2>
      <p>Il daemon è l'unico processo in esecuzione nel sistema. È un piccolo processo Node che avvii con <code>pnpm tools-dev</code>, e fa quattro cose in sequenza:</p>
      <ol>
      <li><strong>Rileva</strong>: scansiona il <code>$PATH</code> per gli agenti installati e <code>skills/</code> per le skill installate, all'avvio</li>
      <li><strong>Scopri</strong>: apre un modulo di domande interattivo per definire superficie, pubblico, tono, scala e contesto di brand per il brief corrente</li>
      <li><strong>Indirizza</strong>: presenta 5 direzioni visive deterministiche (palette in OKLch, stack di font, indicazioni sulla postura del layout) e chiede all'utente di sceglierne una</li>
      <li><strong>Consegna</strong>: invoca la skill selezionata con il sistema bloccato, lascia che l'agente scriva su disco, e mostra l'anteprima dell'output in un iframe in sandbox</li>
      </ol>
      <p>L'intero ciclo sta in all'incirca 1500 righe di codice. È volutamente piccolo. L'ingegnosità è nelle skill, non nel runtime: il compito del daemon è scansionare cartelle, instradare un brief attraverso i quattro passi e togliersi di mezzo. Quella piccolezza è il punto: c'è ben poco qui che può marcire, e quasi nulla che può tenere in ostaggio il tuo lavoro.</p>
      <h2>Come ci si sente in pratica</h2>
      <p>Supponi di volere un deck di lancio per una nuova funzionalità di prodotto. Ecco il flusso:</p>
      <ol>
      <li>Esegui <code>pnpm tools-dev</code> in un terminale. Il daemon si avvia su <code>localhost:7780</code>.</li>
      <li>Apri l'URL. Il daemon ti mostra quali agenti ha trovato (es. Claude, Cursor, Codex).</li>
      <li>Scegli <code>guizang-ppt</code> dalla lista delle skill.</li>
      <li>Appare un modulo di domande di 30 secondi: chi è il pubblico, qual è il tono, qual è il contesto di brand.</li>
      <li>Ti vengono mostrate 5 direzioni visive — palette diverse, abbinamenti tipografici, posture di layout. Ne scegli una.</li>
      <li>L'agente scrive su disco. Un iframe in sandbox mostra il risultato. Puoi esportare in HTML, PDF, PPTX, ZIP o Markdown.</li>
      </ol>
      <p>Ripercorrilo attraverso le primitive e l'intera cosa è leggibile: il passo 3 ha scelto una <strong>skill</strong>, il passo 5 ha bloccato un <strong>sistema</strong>, l'agente dietro è arrivato tramite un <strong>adattatore</strong>, e il <strong>daemon</strong> ha eseguito il ciclo a quattro passi. L'output è reale. I file sono tuoi. Puoi modificarli in qualsiasi editor, consegnarli a un designer o reimmetterli in un'altra skill.</p>
      <h2>Perché file, non un database</h2>
      <p>Ogni primitiva — skill, sistemi, adattatori — è una cartella di file di testo. Non c'è alcun database centrale. Non c'è alcun "account Open Design". Non c'è alcun servizio ospitato che debba continuare a funzionare perché il tuo lavoro continui a funzionare.</p>
      <p>Questo è un compromesso deliberato. Rinunciamo alla capacità di fare analitiche cross-utente sofisticate, memoria cross-progetto o collaborazione ospitata. In cambio otteniamo: portabilità, longevità, verificabilità e la possibilità per chiunque di forkare l'intera libreria e rilasciare la propria variante. Un <code>SKILL.md</code> scritto oggi si legge in modo identico per un agente tra due anni e per un umano senza alcuno strumento: lo stesso non si può dire di un plugin ancorato all'API dell'anno scorso.</p>
      <p>Se hai visto una generazione di strumenti di design morire portandosi via i tuoi file, capirai perché questo compromesso ne vale la pena.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>: la scommessa dietro le quattro primitive</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flusso di lavoro di design BYOK: usa Claude, Codex o Qwen con la tua chiave</a>: come gli adattatori si collegano all'agente che già paghi</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Il livello di layout che il canvas nascondeva</a>: perché le regole di postura in un DESIGN.md battono il trascinare riquadri su un canvas</li>
      </ul>
  vi:
    title: "31 skill, 72 system: thư viện Open Design hoạt động ra sao"
    summary: "Một chuyến dạo qua bốn nguyên tố cốt lõi khiến Open Design có thể kết hợp linh hoạt: skill, system, adapter và daemon. Kèm ví dụ cụ thể về cách một tệp Markdown trở thành một sản phẩm chuẩn từng pixel."
    bodyHtml: |
      <p>Về mặt cơ chế, Open Design là bốn nguyên tố cốt lõi xếp chồng lên nhau:</p>
      <ol>
      <li><strong>Skill</strong> — agent nên làm gì</li>
      <li><strong>System</strong> — đầu ra nên trông như thế nào</li>
      <li><strong>Adapter</strong> — agent nào làm công việc</li>
      <li><strong>Daemon</strong> — vòng lặp nối tất cả lại với nhau</li>
      </ol>
      <p>Mỗi nguyên tố là một thư mục chứa các tệp. Không cái nào cần cơ sở dữ liệu, runtime plugin, hay dịch vụ được host. Đó là toàn bộ thư viện — không có khái niệm thứ năm nào ẩn sau một bức tường đăng nhập. Bài viết này đi qua từng cái một và cho thấy điều gì xảy ra khi bạn trỏ agent của mình vào một brief thực. Nếu bạn muốn lập luận <em>vì sao</em> chúng tôi định hình nó theo cách này trước phần <em>như thế nào</em>, hãy bắt đầu với <a href="/blog/why-we-built-open-design-as-a-skill-layer/">vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a>.</p>
      <h2>Skill: đơn vị năng lực</h2>
      <p>Một skill là một thư mục chứa một <code>SKILL.md</code> và không hoặc nhiều tệp hỗ trợ. Tệp Markdown là hợp đồng của agent — mọi thứ khác trong thư mục là để giúp agent đạt được nó.</p>
      <h3>Giải phẫu một thư mục skill</h3>
      <p>Một skill điển hình trông như thế này:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> khai báo tên của skill, các điều kiện kích hoạt, dạng đầu vào, dạng đầu ra, và mọi hướng dẫn nội tuyến cho agent. Các thư mục <code>templates/</code> và <code>examples/</code> là tùy chọn nhưng gánh vác rất nhiều: examples là các artifact đã biết là tốt để agent đối chiếu mẫu, đó là sự khác biệt giữa “làm cho tôi một bộ slide” cho ra thứ gì đó mạch lạc so với thứ gì đó ứng biến.</p>
      <p>Front matter là phần daemon đọc để đăng ký skill; phần thân là phần agent đọc để thực thi nó:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Vì sao tệp chính là registry</h3>
      <p>Khi daemon khởi động, nó quét <code>skills/</code> và đăng ký mọi thư mục chứa một <code>SKILL.md</code>. Không có manifest plugin. Không có trường phiên bản. Không có bước upload, không có hàng đợi rà soát, không có build. Chỉ có tệp, và tệp là nguồn sự thật. Thả một thư mục mới vào, khởi động lại daemon, và skill xuất hiện trong bộ chọn. Xóa nó đi, và nó biến mất — không có mục registry mồ côi nào trỏ tới mã không còn tồn tại.</p>
      <p>Hiện chúng tôi ship 31 skill. Một số là trình tạo slide, một số tạo mockup di động, một số dựng trang biên tập, một số viết tài liệu văn phòng (Word, Excel, PowerPoint). Mỗi cái là một thư mục bạn có thể fork, sửa hoặc thay thế. Vì hợp đồng là văn bản thuần, “viết một skill” và “đọc một skill để hiểu nó làm gì” là cùng một hoạt động — bạn kiểm tra nó bằng cách mở nó ra.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Một thẻ skill văn bản thuần duy nhất với phần tiêu đề có nhãn và vài dòng, được chọn trong khung xanh lá trên nền biên tập gần như trắng">
        <figcaption>Một skill là đơn vị nguyên tử của năng lực — một tệp thuần mà agent có thể cầm lên, đọc và chạy.</figcaption>
      </figure>
      <h2>System: đơn vị của gu thẩm mỹ</h2>
      <p>Nếu một skill mô tả <em>cái gì cần làm</em>, thì một system mô tả <em>nó nên trông như thế nào</em>. Một system là một tệp <code>DESIGN.md</code> cộng với các tài sản tham chiếu tùy chọn. Nó mô tả một bản sắc thị giác ở dạng máy đọc được:</p>
      <ul>
      <li><strong>Màu</strong> — các giá trị OKLch cho tiền cảnh, nền, màu nhấn, lỗi, v.v.</li>
      <li><strong>Kiểu chữ</strong> — bộ font, độ đậm, thang kích cỡ chữ, quy ước chiều cao dòng</li>
      <li><strong>Khoảng cách</strong> — đơn vị cơ sở, thang giãn cách, chiều rộng container, quy tắc rãnh</li>
      <li><strong>Tư thế bố cục</strong> — lựa chọn lưới, quy tắc bất đối xứng, ưu tiên mật độ</li>
      <li><strong>Giọng điệu</strong> — kiểu chữ của ngôn từ: tông, từ vựng, nhịp câu</li>
      </ul>
      <h3>Một DESIGN.md là một hợp đồng, không phải một thư viện component</h3>
      <p>Trong thực tế một <code>DESIGN.md</code> đọc như một brief thương hiệu ngắn gọn, có quan điểm rõ ràng mà agent không thể hiểu sai:</p>
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
      <p>Các màu là OKLch nên chúng giữ độ đồng đều về mặt cảm thụ trên cả bề mặt sáng và tối; thang kích cỡ chữ là một cái thang mà agent sẽ không trượt khỏi; các quy tắc tư thế là sự khác biệt giữa mười màn hình được tạo ra cảm giác như một sản phẩm và mười màn hình cảm giác như mười thực tập sinh khác nhau. Agent đọc cái này một lần và tôn trọng nó suốt cả công việc.</p>
      <p>Một system không phải là một thư viện Figma. Không có component, không có variant, không có instance lồng nhau, không có định dạng nhị phân nào đứng giữa bạn và các quy tắc. Nó là một hợp đồng mà bất kỳ agent nào cũng có thể đọc và bất kỳ con người nào cũng có thể kiểm tra. Chúng tôi ship 72 system sẵn dùng, bao gồm các phiên bản di động của Linear, Vercel, Stripe, Apple, Cursor, Figma, và một đuôi dài các system biên tập và thương hiệu.</p>
      <h3>Trộn, fork, sở hữu</h3>
      <p>Vì một system chỉ là văn bản, bạn có thể fork một cái và sửa tại chỗ, ship một biến thể, hoặc tự viết từ đầu trong khoảng 30 phút làm việc tập trung. Bạn thậm chí có thể trộn các system giữa chừng dự án — kiểu chữ từ Linear, logic màu từ Vercel, bố cục từ một đặc tả nội bộ — vì không gì bị khóa vào một nhị phân độc quyền. Việc tách giữa các thư mục <code>skills/</code> và <code>design-systems/</code> là có chủ ý: năng lực và gu thẩm mỹ là trực giao, nên bất kỳ skill nào cũng có thể chạy dưới bất kỳ system nào, và bất kỳ system nào cũng có thể điều khiển bất kỳ skill nào.</p>
      <h2>Adapter: đơn vị của agent</h2>
      <p>Skill và system là văn bản trơ. Adapter là một lượng nhỏ mã kết nối chúng với agent thực sự làm công việc. Một adapter là một tệp TypeScript ngắn trong <code>adapters/</code> biết cách:</p>
      <ul>
      <li>phát hiện liệu agent có được cài trong <code>$PATH</code> của người dùng không</li>
      <li>bắt đầu một phiên với agent đó</li>
      <li>đưa một lời gọi skill vào</li>
      <li>thu thập đầu ra trở lại</li>
      </ul>
      <p>Hôm nay chúng tôi ship adapter cho 12 agent: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Daemon tự động phát hiện cái nào hiện diện và cung cấp chúng dưới dạng menu thả xuống ở lần khởi động đầu tiên — bạn không cấu hình gì cả, bạn chỉ thấy các agent bạn đã có sẵn.</p>































      <table><thead><tr><th>Nguyên tố</th><th>Nằm ở</th><th>Tệp</th><th>Nguồn sự thật</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>tệp trên đĩa</td></tr><tr><td>System</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>tệp trên đĩa</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>một tệp <code>.ts</code></td><td>một lời gọi <code>register()</code></td></tr></tbody></table>
      <p>Nếu bạn muốn thêm một adapter mới, tệp này khoảng 80 dòng TypeScript và một lời gọi <code>register()</code> duy nhất. Không có SDK nào phải học, không có quyền nào phải xin, không có registry trung tâm nào phải xuất bản lên. Chính agent bạn đã tin tưởng trên laptop của mình trở thành engine — Open Design không bao giờ thay thế nó. (Bài đồng hành <a href="/blog/byok-design-workflow-claude-codex-qwen/">quy trình thiết kế BYOK</a> đi qua việc trỏ một adapter tới key của riêng bạn.)</p>
      <h2>Daemon: vòng lặp buộc tất cả lại với nhau</h2>
      <p>Daemon là tiến trình đang chạy duy nhất trong hệ thống. Nó là một tiến trình Node nhỏ bạn khởi động bằng <code>pnpm tools-dev</code>, và nó làm bốn việc theo trình tự:</p>
      <ol>
      <li><strong>Phát hiện</strong> — quét <code>$PATH</code> tìm các agent đã cài và <code>skills/</code> tìm các skill đã cài, lúc khởi động</li>
      <li><strong>Khám phá</strong> — mở một biểu mẫu câu hỏi tương tác để chốt bề mặt, đối tượng, tông giọng, quy mô và ngữ cảnh thương hiệu cho brief hiện tại</li>
      <li><strong>Định hướng</strong> — trình bày 5 hướng thị giác mang tính tất định (bảng màu bằng OKLch, bộ font, gợi ý tư thế bố cục) và yêu cầu người dùng chọn một</li>
      <li><strong>Giao</strong> — gọi skill đã chọn với system đã chốt, để agent ghi xuống đĩa, và xem trước đầu ra trong một iframe sandbox</li>
      </ol>
      <p>Toàn bộ vòng lặp gói gọn trong khoảng 1500 dòng mã. Nó cố ý nhỏ. Sự khôn ngoan nằm ở các skill, không phải ở runtime — việc của daemon là quét thư mục, định tuyến một brief qua bốn bước, và đứng ngoài lề. Cái nhỏ đó chính là điểm mấu chốt: ở đây có rất ít thứ có thể mục rữa, và gần như không có gì có thể bắt công việc của bạn làm con tin.</p>
      <h2>Cảm giác của nó trong thực tế</h2>
      <p>Giả sử bạn muốn một bộ slide ra mắt cho một tính năng sản phẩm mới. Đây là luồng:</p>
      <ol>
      <li>Bạn chạy <code>pnpm tools-dev</code> trong một terminal. Daemon khởi động trên <code>localhost:7780</code>.</li>
      <li>Bạn mở URL. Daemon cho bạn thấy nó tìm thấy những agent nào (ví dụ Claude, Cursor, Codex).</li>
      <li>Bạn chọn <code>guizang-ppt</code> từ danh sách skill.</li>
      <li>Một biểu mẫu câu hỏi 30 giây bật lên: đối tượng là ai, tông giọng ra sao, ngữ cảnh thương hiệu là gì.</li>
      <li>Bạn được cho thấy 5 hướng thị giác — các bảng màu khác nhau, ghép cặp kiểu chữ, tư thế bố cục. Bạn chọn một.</li>
      <li>Agent ghi xuống đĩa. Một iframe sandbox cho thấy kết quả. Bạn có thể xuất ra HTML, PDF, PPTX, ZIP, hoặc Markdown.</li>
      </ol>
      <p>Lần ngược lại qua các nguyên tố và toàn bộ chuyện trở nên dễ đọc: bước 3 chọn một <strong>skill</strong>, bước 5 chốt một <strong>system</strong>, agent đằng sau nó đi qua một <strong>adapter</strong>, và <strong>daemon</strong> chạy vòng lặp bốn bước. Đầu ra là thật. Các tệp là của bạn. Bạn có thể sửa chúng trong bất kỳ trình soạn thảo nào, giao chúng cho một nhà thiết kế, hoặc đưa chúng trở lại vào một skill khác.</p>
      <h2>Vì sao là tệp, không phải cơ sở dữ liệu</h2>
      <p>Mỗi nguyên tố — skill, system, adapter — là một thư mục các tệp văn bản. Không có cơ sở dữ liệu trung tâm. Không có “tài khoản Open Design.” Không có dịch vụ được host nào phải tiếp tục hoạt động để công việc của bạn tiếp tục hoạt động.</p>
      <p>Đây là một sự đánh đổi có chủ ý. Chúng tôi từ bỏ khả năng làm các phân tích chéo người dùng tinh vi, bộ nhớ chéo dự án, hay cộng tác được host. Đổi lại chúng tôi có: tính di động, tuổi thọ, khả năng kiểm tra, và khả năng để bất kỳ ai fork toàn bộ thư viện và ship biến thể của riêng họ. Một <code>SKILL.md</code> viết hôm nay đọc giống hệt đối với một agent hai năm sau và đối với một con người hoàn toàn không có công cụ gì — điều tương tự không thể nói về một plugin ghim vào API của năm ngoái.</p>
      <p>Nếu bạn từng chứng kiến một thế hệ công cụ thiết kế chết đi và mang theo cả các tệp của bạn, bạn sẽ hiểu vì sao sự đánh đổi này đáng giá.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> — canh bạc đằng sau bốn nguyên tố</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Quy trình thiết kế BYOK: chạy Claude, Codex hay Qwen bằng key của riêng bạn</a> — cách các adapter kết nối với agent bạn đã trả tiền</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Lớp bố cục mà canvas từng che giấu</a> — vì sao các quy tắc tư thế trong một DESIGN.md đánh bại việc kéo các hộp trên một canvas</li>
      </ul>
  pl:
    title: "31 umiejętności, 72 systemy: jak działa biblioteka Open Design"
    summary: "Spacer po czterech prymitywach, które czynią Open Design komponowalnym: umiejętnościach, systemach, adapterach i daemonie. Z konkretnymi przykładami tego, jak plik Markdown staje się dopracowanym co do piksela produktem."
    bodyHtml: |
      <p>Open Design to, mechanicznie rzecz biorąc, cztery prymitywy ułożone jeden na drugim:</p>
      <ol>
      <li><strong>Umiejętności</strong> — co agent powinien zrobić</li>
      <li><strong>Systemy</strong> — jak powinien wyglądać efekt</li>
      <li><strong>Adaptery</strong> — który agent wykonuje pracę</li>
      <li><strong>Daemon</strong> — pętla, która łączy je ze sobą</li>
      </ol>
      <p>Każdy prymityw to folder z plikami. Żaden z nich nie wymaga bazy danych, środowiska uruchomieniowego wtyczek ani hostowanej usługi. To cała biblioteka — nie ma piątego pojęcia ukrytego za ścianą logowania. Ten wpis omawia kolejno każdy z nich i pokazuje, co się dzieje, gdy skierujesz swojego agenta na prawdziwy brief. Jeśli chcesz poznać argument za tym, <em>dlaczego</em> nadaliśmy temu taki kształt, zanim poznasz <em>jak</em>, zacznij od <a href="/blog/why-we-built-open-design-as-a-skill-layer/">dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a>.</p>
      <h2>Umiejętności: jednostka możliwości</h2>
      <p>Umiejętność to folder zawierający jeden plik <code>SKILL.md</code> i zero lub więcej plików pomocniczych. Plik Markdown jest kontraktem agenta — wszystko inne w folderze jest po to, by pomóc agentowi go spełnić.</p>
      <h3>Anatomia folderu umiejętności</h3>
      <p>Typowa umiejętność wygląda tak:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> deklaruje nazwę umiejętności, warunki wyzwalania, kształt wejścia, kształt wyjścia oraz wszelkie inline'owe wskazówki dla agenta. Foldery <code>templates/</code> i <code>examples/</code> są opcjonalne, ale niosą duży ciężar: przykłady to znane dobre artefakty, do których agent może dopasować wzorzec, a to różnica między „zrób mi prezentację” produkującym coś spójnego a czymś improwizowanym.</p>
      <p>Front matter to część, którą czyta daemon, by zarejestrować umiejętność; treść to część, którą czyta agent, by ją wykonać:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Dlaczego plik jest rejestrem</h3>
      <p>Gdy daemon się uruchamia, skanuje <code>skills/</code> i rejestruje każdy folder zawierający <code>SKILL.md</code>. Nie ma manifestu wtyczki. Nie ma pola wersji. Nie ma kroku przesyłania, kolejki recenzji ani builda. Jest plik, a plik jest źródłem prawdy. Wrzuć nowy folder, zrestartuj daemon i umiejętność pojawia się w wybierarce. Usuń ją, a znika — żadnego osieroconego wpisu w rejestrze wskazującego na kod, który już nie istnieje.</p>
      <p>Obecnie dostarczamy 31 umiejętności. Niektóre są generatorami prezentacji, niektóre produkują makiety mobilne, niektóre budują strony redakcyjne, niektóre piszą dokumenty biurowe (Word, Excel, PowerPoint). Każda z nich to folder, który możesz sforkować, edytować lub zastąpić. Ponieważ kontrakt jest zwykłym tekstem, „pisanie umiejętności” i „czytanie umiejętności, by zrozumieć, co robi” to ta sama czynność — audytujesz ją, otwierając ją.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Pojedyncza karta umiejętności w czystym tekście z opisanym nagłówkiem i kilkoma liniami, zaznaczona zieloną ramką na niemal białym, redakcyjnym tle">
        <figcaption>Umiejętność to atomowa jednostka możliwości — jeden czysty plik, który agent może podnieść, przeczytać i uruchomić.</figcaption>
      </figure>
      <h2>Systemy: jednostka gustu</h2>
      <p>Jeśli umiejętność opisuje, <em>co zrobić</em>, system opisuje, <em>jak to powinno wyglądać</em>. System to plik <code>DESIGN.md</code> plus opcjonalne zasoby referencyjne. Opisuje tożsamość wizualną w formie czytelnej dla maszyny:</p>
      <ul>
      <li><strong>Kolor</strong> — wartości OKLch dla pierwszego planu, tła, akcentu, błędu i tak dalej</li>
      <li><strong>Typografia</strong> — stos czcionek, grubości, drabina typograficzna, konwencje interlinii</li>
      <li><strong>Przestrzeń</strong> — jednostka bazowa, skala odstępów, szerokości kontenerów, reguły rynien</li>
      <li><strong>Postawa układu</strong> — wybory siatki, reguły asymetrii, preferencje gęstości</li>
      <li><strong>Głos</strong> — typografia słów: ton, słownictwo, rytm zdań</li>
      </ul>
      <h3>DESIGN.md to kontrakt, a nie biblioteka komponentów</h3>
      <p>W praktyce <code>DESIGN.md</code> czyta się jak krótki, stanowczy brief marki, którego agent nie może źle zinterpretować:</p>
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
      <p>Kolory są w OKLch, więc pozostają percepcyjnie równe na jasnych i ciemnych powierzchniach; drabina typograficzna to schody, z których agent nie zejdzie; reguły postawy to różnica między dziesięcioma wygenerowanymi ekranami, które wyglądają jak jeden produkt, a dziesięcioma, które wyglądają jak dziesięciu różnych stażystów. Agent czyta to raz i respektuje przez całe zadanie.</p>
      <p>System to nie biblioteka Figma. Nie ma komponentów, wariantów, zagnieżdżonych instancji ani formatu binarnego stojącego między Tobą a regułami. To kontrakt, który dowolny agent może przeczytać i dowolny człowiek może zaudytować. Dostarczamy 72 systemy od ręki, w tym przenośne wersje Linear, Vercel, Stripe, Apple, Cursor, Figma oraz długi ogon systemów redakcyjnych i markowych.</p>
      <h3>Miksuj, forkuj, posiadaj</h3>
      <p>Ponieważ system to po prostu tekst, możesz sforkować jeden i edytować go na miejscu, wypuścić wariant lub napisać własny od zera w mniej więcej 30 minutach skupionej pracy. Możesz nawet miksować systemy w trakcie projektu — typografię z Linear, logikę koloru z Vercel, układ ze specyfikacji wewnętrznej — bo nic nie jest zamknięte w zastrzeżonym formacie binarnym. Podział na foldery <code>skills/</code> i <code>design-systems/</code> jest celowy: możliwość i gust są ortogonalne, więc dowolna umiejętność może działać pod dowolnym systemem, a dowolny system może napędzać dowolną umiejętność.</p>
      <h2>Adaptery: jednostka agenta</h2>
      <p>Umiejętności i systemy to bezwładny tekst. Adaptery to niewielka ilość kodu, która łączy je z agentem faktycznie wykonującym pracę. Adapter to krótki plik TypeScript w <code>adapters/</code>, który wie, jak:</p>
      <ul>
      <li>wykryć, czy agent jest zainstalowany w <code>$PATH</code> użytkownika</li>
      <li>rozpocząć sesję z tym agentem</li>
      <li>przekazać do niego wywołanie umiejętności</li>
      <li>zebrać wyjście z powrotem</li>
      </ul>
      <p>Dziś dostarczamy adaptery dla 12 agentów: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Daemon automatycznie wykrywa, które są obecne, i oferuje je jako listę rozwijaną przy pierwszym uruchomieniu — niczego nie konfigurujesz, po prostu widzisz agentów, których już masz.</p>





























      <table><thead><tr><th>Prymityw</th><th>Mieszka w</th><th>Plik</th><th>Źródło prawdy</th></tr></thead><tbody><tr><td>Umiejętność</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>plik na dysku</td></tr><tr><td>System</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>plik na dysku</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>jeden plik <code>.ts</code></td><td>wywołanie <code>register()</code></td></tr></tbody></table>
      <p>Jeśli chcesz dodać nowy adapter, plik to mniej więcej 80 linii TypeScript i jedno wywołanie <code>register()</code>. Żadnego SDK do nauki, żadnego pozwolenia do uzyskania, żadnego centralnego rejestru, do którego trzeba publikować. Ten sam agent, któremu już ufasz na swoim laptopie, staje się silnikiem — Open Design nigdy go nie zastępuje. (Tekst towarzyszący <a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow projektowy BYOK</a> omawia kierowanie adaptera na własny klucz.)</p>
      <h2>Daemon: pętla, która wszystko łączy</h2>
      <p>Daemon to jedyny działający proces w systemie. To mały proces Node, który uruchamiasz poleceniem <code>pnpm tools-dev</code>, i robi cztery rzeczy po kolei:</p>
      <ol>
      <li><strong>Wykrywa</strong> — skanuje <code>$PATH</code> w poszukiwaniu zainstalowanych agentów i <code>skills/</code> w poszukiwaniu zainstalowanych umiejętności, przy starcie</li>
      <li><strong>Odkrywa</strong> — otwiera interaktywny formularz pytań, by doprecyzować powierzchnię, odbiorców, ton, skalę i kontekst marki dla bieżącego briefu</li>
      <li><strong>Kieruje</strong> — przedstawia 5 deterministycznych kierunków wizualnych (paleta w OKLch, stos czcionek, wskazówki postawy układu) i prosi użytkownika o wybór jednego</li>
      <li><strong>Dostarcza</strong> — wywołuje wybraną umiejętność z zablokowanym systemem, pozwala agentowi zapisać na dysk i podgląda wyjście w piaskownicowym iframe</li>
      </ol>
      <p>Cała pętla mieści się w mniej więcej 1500 liniach kodu. Jest celowo mała. Spryt tkwi w umiejętnościach, a nie w środowisku uruchomieniowym — zadaniem daemona jest skanować foldery, przeprowadzić brief przez cztery kroki i schodzić z drogi. Ta małość jest sednem: jest tu bardzo niewiele, co może zgnić, i niemal nic, co może wziąć Twoją pracę jako zakładnika.</p>
      <h2>Jak to wygląda w praktyce</h2>
      <p>Załóżmy, że chcesz prezentację premierową dla nowej funkcji produktu. Oto przebieg:</p>
      <ol>
      <li>Uruchamiasz <code>pnpm tools-dev</code> w terminalu. Daemon startuje na <code>localhost:7780</code>.</li>
      <li>Otwierasz URL. Daemon pokazuje, których agentów znalazł (np. Claude, Cursor, Codex).</li>
      <li>Wybierasz <code>guizang-ppt</code> z listy umiejętności.</li>
      <li>Wyskakuje 30-sekundowy formularz pytań: kto jest odbiorcą, jaki jest ton, jaki jest kontekst marki.</li>
      <li>Pokazuje Ci się 5 kierunków wizualnych — różne palety, parowania typograficzne, postawy układu. Wybierasz jeden.</li>
      <li>Agent zapisuje na dysk. Piaskownicowy iframe pokazuje wynik. Możesz wyeksportować do HTML, PDF, PPTX, ZIP lub Markdown.</li>
      </ol>
      <p>Prześledź to wstecz przez prymitywy i całość jest czytelna: krok 3 wybrał <strong>umiejętność</strong>, krok 5 zablokował <strong>system</strong>, agent za nim przyszedł przez <strong>adapter</strong>, a <strong>daemon</strong> przeprowadził czterostopniową pętlę. Wyjście jest prawdziwe. Pliki są Twoje. Możesz je edytować w dowolnym edytorze, przekazać projektantowi albo zwrócić do innej umiejętności.</p>
      <h2>Dlaczego pliki, a nie baza danych</h2>
      <p>Każdy prymityw — umiejętności, systemy, adaptery — to folder plików tekstowych. Nie ma centralnej bazy danych. Nie ma „konta Open Design”. Nie ma hostowanej usługi, która musi działać, by Twoja praca dalej działała.</p>
      <p>To celowy kompromis. Rezygnujemy z możliwości robienia sprytnej analityki między użytkownikami, pamięci między projektami czy hostowanej współpracy. W zamian dostajemy: przenośność, długowieczność, audytowalność oraz możliwość sforkowania całej biblioteki przez kogokolwiek i wypuszczenia własnego wariantu. <code>SKILL.md</code> napisany dzisiaj czyta się identycznie dla agenta za dwa lata i dla człowieka bez żadnego oprzyrządowania — czego nie można powiedzieć o wtyczce przypiętej do zeszłorocznego API.</p>
      <p>Jeśli oglądałeś, jak całe pokolenie narzędzi projektowych umiera, zabierając ze sobą Twoje pliki, zrozumiesz, dlaczego ten kompromis jest tego wart.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — zakład stojący za czterema prymitywami</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow projektowy BYOK: uruchom Claude, Codex lub Qwen na własnym kluczu</a> — jak adaptery łączą się z agentem, za którego już płacisz</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Warstwa układu, którą płótno kiedyś ukrywało</a> — dlaczego reguły postawy w DESIGN.md biją przeciąganie pudełek po płótnie</li>
      </ul>
  id:
    title: "31 skill, 72 sistem: cara kerja pustaka Open Design"
    summary: "Telusuri empat primitif yang membuat Open Design dapat dikomposisi: skill, sistem, adapter, dan daemon. Dengan contoh konkret bagaimana sebuah file Markdown menjadi deliverable yang pixel-perfect."
    bodyHtml: |
      <p>Secara mekanis, Open Design adalah empat primitif yang ditumpuk satu di atas yang lain:</p>
      <ol>
      <li><strong>Skill</strong> — apa yang harus dilakukan agent</li>
      <li><strong>Sistem</strong> — seperti apa output-nya seharusnya</li>
      <li><strong>Adapter</strong> — agent mana yang melakukan pekerjaan</li>
      <li><strong>Daemon</strong> — loop yang merangkai semuanya</li>
      </ol>
      <p>Setiap primitif adalah sebuah folder berisi file. Tidak satu pun dari mereka memerlukan basis data, runtime plugin, atau layanan berbasis hosting. Itulah keseluruhan pustakanya — tidak ada konsep kelima yang bersembunyi di balik dinding login. Tulisan ini menelusuri masing-masing secara bergiliran dan menunjukkan apa yang terjadi ketika Anda mengarahkan agent Anda ke sebuah brief nyata. Jika Anda ingin argumen tentang <em>mengapa</em> kami membentuknya seperti ini sebelum <em>bagaimana</em>-nya, mulailah dengan <a href="/blog/why-we-built-open-design-as-a-skill-layer/">mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a>.</p>
      <h2>Skill: unit kapabilitas</h2>
      <p>Sebuah skill adalah folder yang berisi satu <code>SKILL.md</code> dan nol atau lebih file pendukung. File Markdown adalah kontrak agent — segala hal lain di dalam folder ada untuk membantu agent memenuhinya.</p>
      <h3>Anatomi sebuah folder skill</h3>
      <p>Sebuah skill yang khas terlihat seperti ini:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> mendeklarasikan nama skill, kondisi pemicu, bentuk input, bentuk output, dan panduan inline apa pun untuk agent. Folder <code>templates/</code> dan <code>examples/</code> bersifat opsional tetapi memikul banyak beban: examples adalah artefak yang sudah terbukti baik yang dapat dicocokkan polanya oleh agent, dan itulah perbedaan antara “buatkan saya sebuah deck” yang menghasilkan sesuatu yang koheren versus sesuatu yang asal jadi.</p>
      <p>Front matter adalah bagian yang dibaca daemon untuk mendaftarkan skill; body adalah bagian yang dibaca agent untuk mengeksekusinya:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Mengapa file itulah registrinya</h3>
      <p>Ketika daemon melakukan boot, ia memindai <code>skills/</code> dan mendaftarkan setiap folder yang berisi sebuah <code>SKILL.md</code>. Tidak ada manifest plugin. Tidak ada kolom versi. Tidak ada langkah unggah, tidak ada antrian tinjauan, tidak ada build. Yang ada adalah file, dan file itulah sumber kebenarannya. Letakkan folder baru, restart daemon, dan skill itu muncul di picker. Hapus dia, dan dia hilang — tanpa entri registri yatim yang menunjuk ke kode yang tak ada lagi.</p>
      <p>Saat ini kami mengirimkan 31 skill. Beberapa adalah generator deck, beberapa menghasilkan mockup mobile, beberapa membangun halaman editorial, beberapa menulis dokumen kantor (Word, Excel, PowerPoint). Masing-masing adalah folder yang dapat Anda fork, edit, atau ganti. Karena kontraknya berupa teks biasa, “menulis sebuah skill” dan “membaca sebuah skill untuk memahami apa yang dilakukannya” adalah aktivitas yang sama — Anda mengauditnya dengan membukanya.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Satu kartu skill teks biasa dengan header berlabel dan beberapa baris, terpilih dalam bingkai hijau di atas latar editorial nyaris putih">
        <figcaption>Sebuah skill adalah unit atomik dari kapabilitas — satu file biasa yang dapat diambil, dibaca, dan dijalankan oleh agent.</figcaption>
      </figure>
      <h2>Sistem: unit selera</h2>
      <p>Jika sebuah skill menjelaskan <em>apa yang harus dibuat</em>, sebuah sistem menjelaskan <em>seperti apa seharusnya tampilannya</em>. Sebuah sistem adalah file <code>DESIGN.md</code> ditambah aset referensi opsional. Ia mendeskripsikan identitas visual dalam bentuk yang dapat dibaca mesin:</p>
      <ul>
      <li><strong>Warna</strong> — nilai OKLch untuk foreground, background, aksen, error, dan sebagainya</li>
      <li><strong>Tipografi</strong> — tumpukan font, bobot, tangga tipe, konvensi tinggi baris</li>
      <li><strong>Spasi</strong> — unit dasar, skala spasi, lebar kontainer, aturan gutter</li>
      <li><strong>Postur tata letak</strong> — pilihan grid, aturan asimetri, preferensi kepadatan</li>
      <li><strong>Suara</strong> — tipografi kata: nada, kosakata, ritme kalimat</li>
      </ul>
      <h3>Sebuah DESIGN.md adalah kontrak, bukan pustaka komponen</h3>
      <p>Dalam praktiknya sebuah <code>DESIGN.md</code> terbaca seperti brief merek yang singkat dan punya pendirian yang tidak bisa disalahartikan oleh agent:</p>
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
      <p>Warnanya berupa OKLch sehingga tetap merata secara persepsi di seluruh permukaan terang dan gelap; tangga tipe adalah sebuah tangga yang tidak akan dilenceng oleh agent; aturan postur adalah perbedaan antara sepuluh layar yang dihasilkan yang terasa seperti satu produk dan sepuluh yang terasa seperti sepuluh anak magang yang berbeda. Agent membaca ini sekali dan menghormatinya untuk keseluruhan pekerjaan.</p>
      <p>Sebuah sistem bukanlah pustaka Figma. Tidak ada komponen, tidak ada varian, tidak ada instance bersarang, tidak ada format biner yang berdiri di antara Anda dan aturannya. Ini adalah kontrak yang dapat dibaca oleh agent mana pun dan dapat diaudit oleh manusia mana pun. Kami mengirimkan 72 sistem secara bawaan, termasuk versi portabel dari Linear, Vercel, Stripe, Apple, Cursor, Figma, dan deretan panjang sistem editorial dan merek.</p>
      <h3>Campur, fork, miliki</h3>
      <p>Karena sebuah sistem hanyalah teks, Anda dapat mem-fork-nya dan mengeditnya di tempat, mengirim sebuah varian, atau menulis milik Anda sendiri dari nol dalam kira-kira 30 menit kerja yang fokus. Anda bahkan dapat mencampur sistem di tengah proyek — tipografi dari Linear, logika warna dari Vercel, tata letak dari spesifikasi internal — karena tidak ada yang terkunci ke dalam biner proprietary. Pemisahan antara folder <code>skills/</code> dan <code>design-systems/</code> disengaja: kapabilitas dan selera bersifat ortogonal, jadi skill apa pun dapat berjalan di bawah sistem apa pun, dan sistem apa pun dapat menggerakkan skill apa pun.</p>
      <h2>Adapter: unit agent</h2>
      <p>Skill dan sistem adalah teks yang inert. Adapter adalah sejumlah kecil kode yang menghubungkan mereka ke agent yang benar-benar melakukan pekerjaan. Sebuah adapter adalah file TypeScript pendek di <code>adapters/</code> yang tahu cara untuk:</p>
      <ul>
      <li>mendeteksi apakah agent terpasang pada <code>$PATH</code> pengguna</li>
      <li>memulai sesi dengan agent tersebut</li>
      <li>menyalurkan invokasi skill ke dalamnya</li>
      <li>mengumpulkan kembali output-nya</li>
      </ul>
      <p>Saat ini kami mengirimkan adapter untuk 12 agent: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Daemon mendeteksi secara otomatis mana yang ada dan menawarkannya sebagai dropdown saat boot pertama — Anda tidak mengonfigurasi apa pun, Anda hanya melihat agent yang sudah Anda miliki.</p>





























      <table><thead><tr><th>Primitif</th><th>Berada di</th><th>File</th><th>Sumber kebenaran</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>file di disk</td></tr><tr><td>Sistem</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>file di disk</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>satu file <code>.ts</code></td><td>sebuah panggilan <code>register()</code></td></tr></tbody></table>
      <p>Jika Anda ingin menambahkan adapter baru, file-nya kira-kira 80 baris TypeScript dan satu panggilan <code>register()</code>. Tidak ada SDK yang harus dipelajari, tidak ada izin yang harus diminta, tidak ada registri pusat untuk dipublikasikan. Agent yang sama yang sudah Anda percayai di laptop Anda menjadi mesinnya — Open Design tidak pernah menggantikannya. (Tulisan pendamping <a href="/blog/byok-design-workflow-claude-codex-qwen/">alur kerja desain BYOK</a> menelusuri cara mengarahkan sebuah adapter ke key Anda sendiri.)</p>
      <h2>Daemon: loop yang mengikat semuanya</h2>
      <p>Daemon adalah satu-satunya proses yang berjalan dalam sistem. Ia adalah proses Node kecil yang Anda mulai dengan <code>pnpm tools-dev</code>, dan ia melakukan empat hal secara berurutan:</p>
      <ol>
      <li><strong>Detect</strong> — memindai <code>$PATH</code> untuk agent yang terpasang dan <code>skills/</code> untuk skill yang terpasang, saat boot</li>
      <li><strong>Discover</strong> — membuka formulir pertanyaan interaktif untuk memastikan permukaan, audiens, nada, skala, dan konteks merek untuk brief saat ini</li>
      <li><strong>Direct</strong> — menyajikan 5 arah visual yang deterministik (palet dalam OKLch, tumpukan font, isyarat postur tata letak) dan meminta pengguna memilih salah satu</li>
      <li><strong>Deliver</strong> — meng-invoke skill yang dipilih dengan sistem yang dikunci, membiarkan agent menulis ke disk, dan menampilkan pratinjau output dalam iframe yang ter-sandbox</li>
      </ol>
      <p>Keseluruhan loop muat dalam kira-kira 1500 baris kode. Ia sengaja dibuat kecil. Kecerdasannya ada di skill, bukan di runtime — tugas daemon adalah memindai folder, merutekan brief melalui empat langkah, dan menyingkir. Kekecilan itu adalah intinya: di sini sangat sedikit yang dapat membusuk, dan hampir tidak ada yang dapat menyandera pekerjaan Anda.</p>
      <h2>Bagaimana rasanya dalam praktik</h2>
      <p>Misalkan Anda ingin sebuah deck peluncuran untuk fitur produk baru. Berikut alurnya:</p>
      <ol>
      <li>Anda menjalankan <code>pnpm tools-dev</code> di terminal. Daemon mulai di <code>localhost:7780</code>.</li>
      <li>Anda membuka URL-nya. Daemon menunjukkan agent mana yang ditemukannya (mis. Claude, Cursor, Codex).</li>
      <li>Anda memilih <code>guizang-ppt</code> dari daftar skill.</li>
      <li>Sebuah formulir pertanyaan 30 detik muncul: siapa audiensnya, apa nadanya, apa konteks mereknya.</li>
      <li>Anda ditunjukkan 5 arah visual — palet, pasangan tipe, dan postur tata letak yang berbeda. Anda memilih satu.</li>
      <li>Agent menulis ke disk. Sebuah iframe yang ter-sandbox menampilkan hasilnya. Anda dapat mengekspor ke HTML, PDF, PPTX, ZIP, atau Markdown.</li>
      </ol>
      <p>Telusuri kembali melalui primitif-primitifnya dan keseluruhannya menjadi terbaca: langkah 3 memilih sebuah <strong>skill</strong>, langkah 5 mengunci sebuah <strong>sistem</strong>, agent di baliknya datang melalui sebuah <strong>adapter</strong>, dan <strong>daemon</strong> menjalankan loop empat langkah. Output-nya nyata. File-nya milik Anda. Anda dapat mengeditnya di editor mana pun, menyerahkannya ke seorang desainer, atau memasukkannya kembali ke skill lain.</p>
      <h2>Mengapa file, bukan basis data</h2>
      <p>Setiap primitif — skill, sistem, adapter — adalah folder berisi file teks. Tidak ada basis data pusat. Tidak ada “akun Open Design.” Tidak ada layanan berbasis hosting yang harus terus berjalan agar pekerjaan Anda terus berjalan.</p>
      <p>Ini adalah pertukaran yang disengaja. Kami melepaskan kemampuan untuk melakukan analitik lintas-pengguna yang cerdas, memori lintas-proyek, atau kolaborasi berbasis hosting. Sebagai gantinya kami mendapatkan: portabilitas, umur panjang, keterauditan, dan kemampuan bagi siapa pun untuk mem-fork seluruh pustaka dan mengirim varian mereka sendiri. Sebuah <code>SKILL.md</code> yang ditulis hari ini terbaca identik oleh sebuah agent dua tahun dari sekarang dan oleh seorang manusia yang sama sekali tanpa tooling — hal yang sama tidak bisa dikatakan tentang sebuah plugin yang dipatok ke API tahun lalu.</p>
      <p>Jika Anda pernah menyaksikan satu generasi tool desain mati membawa serta file Anda, Anda akan mengerti mengapa pertukaran ini layak.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> — taruhan di balik empat primitif</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Alur kerja desain BYOK: jalankan Claude, Codex, atau Qwen dengan key Anda sendiri</a> — cara adapter terhubung ke agent yang sudah Anda bayar</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Lapisan tata letak yang dulu disembunyikan oleh kanvas</a> — mengapa aturan postur dalam sebuah DESIGN.md mengalahkan menyeret kotak di atas kanvas</li>
      </ul>
  nl:
    title: "31 skills, 72 systemen: hoe de Open Design-bibliotheek werkt"
    summary: "Een rondleiding langs de vier primitieven die Open Design samenstelbaar maken: skills, systemen, adapters en de daemon. Met concrete voorbeelden van hoe een Markdown-bestand een pixel-perfect eindproduct wordt."
    bodyHtml: |
      <p>Open Design is, mechanisch gezien, vier primitieven die op elkaar zijn gestapeld:</p>
      <ol>
      <li><strong>Skills</strong> — wat de agent zou moeten doen</li>
      <li><strong>Systemen</strong> — hoe de output eruit zou moeten zien</li>
      <li><strong>Adapters</strong> — welke agent het werk doet</li>
      <li><strong>De daemon</strong> — de lus die ze met elkaar verbindt</li>
      </ol>
      <p>Elk primitief is een map met bestanden. Geen ervan vereist een database, een plugin-runtime of een gehoste service. Dat is de hele bibliotheek — er is geen vijfde concept dat zich achter een inlogmuur verbergt. Dit bericht loopt elk op zijn beurt door en laat zien wat er gebeurt als je je agent op een echte briefing richt. Als je het argument wilt voor <em>waarom</em> we het op deze manier hebben vormgegeven vóór het <em>hoe</em>, begin dan met <a href="/blog/why-we-built-open-design-as-a-skill-layer/">waarom we Open Design als een skill-laag bouwden, niet als een product</a>.</p>
      <h2>Skills: de eenheid van capaciteit</h2>
      <p>Een skill is een map die één <code>SKILL.md</code> bevat en nul of meer ondersteunende bestanden. Het Markdown-bestand is het contract van de agent — al het andere in de map is er om de agent te helpen het te halen.</p>
      <h3>Anatomie van een skill-map</h3>
      <p>Een typische skill ziet er zo uit:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> declareert de naam van de skill, de triggercondities, de vorm van de input, de vorm van de output en eventuele inline-richtlijnen voor de agent. De mappen <code>templates/</code> en <code>examples/</code> zijn optioneel maar dragen veel gewicht: voorbeelden zijn bekende, goede artefacten waartegen de agent patronen kan matchen, en dat is het verschil tussen “maak een deck voor me” dat iets samenhangends oplevert versus iets geïmproviseerds.</p>
      <p>De front matter is het deel dat de daemon leest om de skill te registreren; de body is het deel dat de agent leest om hem uit te voeren:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Waarom het bestand het register is</h3>
      <p>Wanneer de daemon opstart, scant hij <code>skills/</code> en registreert hij elke map die een <code>SKILL.md</code> bevat. Er is geen plugin-manifest. Er is geen versieveld. Er is geen uploadstap, geen reviewwachtrij, geen build. Er is het bestand, en het bestand is de bron van waarheid. Zet een nieuwe map erin, herstart de daemon, en de skill verschijnt in de kiezer. Verwijder hem, en hij is weg — geen verweesde registervermelding die wijst naar code die niet meer bestaat.</p>
      <p>We leveren momenteel 31 skills. Sommige zijn deck-generatoren, sommige produceren mobiele mockups, sommige bouwen redactionele pagina's, sommige schrijven kantoordocumenten (Word, Excel, PowerPoint). Elk daarvan is een map die je kunt forken, bewerken of vervangen. Omdat het contract platte tekst is, zijn “een skill schrijven” en “een skill lezen om te begrijpen wat hij doet” dezelfde activiteit — je auditeert hem door hem te openen.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Eén skill-kaart in platte tekst met een gelabelde koptekst en een paar regels, geselecteerd in een groen kader op een bijna-witte redactionele achtergrond">
        <figcaption>Een skill is de atomaire eenheid van capaciteit — één plat bestand dat een agent kan oppakken, lezen en uitvoeren.</figcaption>
      </figure>
      <h2>Systemen: de eenheid van smaak</h2>
      <p>Waar een skill beschrijft <em>wat er gemaakt moet worden</em>, beschrijft een systeem <em>hoe het eruit zou moeten zien</em>. Een systeem is een <code>DESIGN.md</code>-bestand plus optionele referentiemiddelen. Het beschrijft een visuele identiteit in machine-leesbare vorm:</p>
      <ul>
      <li><strong>Kleur</strong> — OKLch-waarden voor voorgrond, achtergrond, accent, fout, enzovoort</li>
      <li><strong>Type</strong> — fontstack, gewichten, de typeschaal, conventies voor regelhoogte</li>
      <li><strong>Ruimte</strong> — basiseenheid, afstandsschaal, containerbreedtes, gutterregels</li>
      <li><strong>Lay-outhouding</strong> — gridkeuzes, asymmetrieregels, dichtheidsvoorkeuren</li>
      <li><strong>Stem</strong> — typografie van woorden: toon, vocabulaire, zinsritme</li>
      </ul>
      <h3>Een DESIGN.md is een contract, geen componentenbibliotheek</h3>
      <p>In de praktijk leest een <code>DESIGN.md</code> als een korte, uitgesproken merkbriefing die een agent niet verkeerd kan interpreteren:</p>
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
      <p>De kleuren zijn OKLch zodat ze perceptueel gelijkmatig blijven over lichte en donkere oppervlakken; de typeschaal is een ladder waar de agent niet vanaf zal drijven; de houdingsregels zijn het verschil tussen tien gegenereerde schermen die als één product aanvoelen en tien die als tien verschillende stagiairs aanvoelen. De agent leest dit één keer en respecteert het voor de hele opdracht.</p>
      <p>Een systeem is geen Figma-bibliotheek. Er zijn geen componenten, geen varianten, geen geneste instanties, geen binair formaat dat tussen jou en de regels in staat. Het is een contract dat elke agent kan lezen en elke mens kan auditeren. We leveren standaard 72 systemen, waaronder draagbare versies van Linear, Vercel, Stripe, Apple, Cursor, Figma, en een lange staart van redactionele en merksystemen.</p>
      <h3>Mix, fork, bezit</h3>
      <p>Omdat een systeem gewoon tekst is, kun je er één forken en ter plekke bewerken, een variant leveren, of je eigen vanaf nul schrijven in ongeveer 30 minuten geconcentreerd werk. Je kunt zelfs systemen mixen halverwege een project — typografie van Linear, kleurlogica van Vercel, lay-out van een interne specificatie — omdat niets vastzit in een propriëtair binair formaat. De splitsing tussen de mappen <code>skills/</code> en <code>design-systems/</code> is doelbewust: capaciteit en smaak zijn orthogonaal, dus elke skill kan onder elk systeem draaien, en elk systeem kan elke skill aansturen.</p>
      <h2>Adapters: de eenheid van agent</h2>
      <p>Skills en systemen zijn inerte tekst. Adapters zijn de kleine hoeveelheid code die ze verbindt met de agent die het werk daadwerkelijk doet. Een adapter is een kort TypeScript-bestand in <code>adapters/</code> dat weet hoe het:</p>
      <ul>
      <li>detecteert of de agent is geïnstalleerd op de <code>$PATH</code> van de gebruiker</li>
      <li>een sessie met die agent start</li>
      <li>een skill-aanroep erin doorgeeft</li>
      <li>de output weer verzamelt</li>
      </ul>
      <p>We leveren vandaag adapters voor 12 agents: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. De daemon detecteert automatisch welke aanwezig zijn en biedt ze aan als een dropdown bij de eerste start — je configureert niets, je ziet gewoon de agents die je al hebt.</p>




























      <table><thead><tr><th>Primitief</th><th>Woont in</th><th>Bestand</th><th>Bron van waarheid</th></tr></thead><tbody><tr><td>Skill</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>het bestand op schijf</td></tr><tr><td>Systeem</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>het bestand op schijf</td></tr><tr><td>Adapter</td><td><code>adapters/</code></td><td>één <code>.ts</code>-bestand</td><td>een <code>register()</code>-aanroep</td></tr></tbody></table>
      <p>Als je een nieuwe adapter wilt toevoegen, is het bestand ongeveer 80 regels TypeScript en één <code>register()</code>-aanroep. Geen SDK om te leren, geen toestemming om aan te vragen, geen centraal register om naar te publiceren. Dezelfde agent die je al vertrouwt op je laptop wordt de motor — Open Design vervangt hem nooit. (Het bijbehorende stuk <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-ontwerpworkflow</a> behandelt het richten van een adapter op je eigen sleutel.)</p>
      <h2>De daemon: de lus die het samenbindt</h2>
      <p>De daemon is het enige draaiende proces in het systeem. Het is een klein Node-proces dat je start met <code>pnpm tools-dev</code>, en het doet vier dingen in volgorde:</p>
      <ol>
      <li><strong>Detecteren</strong> — scant <code>$PATH</code> op geïnstalleerde agents en <code>skills/</code> op geïnstalleerde skills, bij het opstarten</li>
      <li><strong>Ontdekken</strong> — opent een interactief vragenformulier om oppervlak, doelgroep, toon, schaal en merkcontext voor de huidige briefing vast te leggen</li>
      <li><strong>Sturen</strong> — presenteert 5 deterministische visuele richtingen (palet in OKLch, fontstack, lay-outhoudingssignalen) en vraagt de gebruiker er één te kiezen</li>
      <li><strong>Leveren</strong> — roept de geselecteerde skill aan met het vastgelegde systeem, laat de agent naar schijf schrijven en toont een voorbeeld van de output in een sandboxed iframe</li>
      </ol>
      <p>De hele lus past in ongeveer 1500 regels code. Hij is opzettelijk klein. De slimheid zit in de skills, niet in de runtime — de taak van de daemon is mappen scannen, een briefing door de vier stappen routeren en uit de weg blijven. Die kleinheid is het punt: er is hier heel weinig dat kan rotten, en bijna niets dat je werk kan gijzelen.</p>
      <h2>Hoe het in de praktijk voelt</h2>
      <p>Stel dat je een launch-deck wilt voor een nieuwe productfunctie. Hier is de flow:</p>
      <ol>
      <li>Je draait <code>pnpm tools-dev</code> in een terminal. De daemon start op <code>localhost:7780</code>.</li>
      <li>Je opent de URL. De daemon laat je zien welke agents hij heeft gevonden (bijv. Claude, Cursor, Codex).</li>
      <li>Je kiest <code>guizang-ppt</code> uit de skill-lijst.</li>
      <li>Een vragenformulier van 30 seconden verschijnt: wie is de doelgroep, wat is de toon, wat is de merkcontext.</li>
      <li>Je krijgt 5 visuele richtingen te zien — verschillende paletten, type-combinaties, lay-outhoudingen. Je kiest er één.</li>
      <li>De agent schrijft naar schijf. Een sandboxed iframe toont het resultaat. Je kunt exporteren naar HTML, PDF, PPTX, ZIP of Markdown.</li>
      </ol>
      <p>Volg het terug door de primitieven en het geheel is leesbaar: stap 3 koos een <strong>skill</strong>, stap 5 legde een <strong>systeem</strong> vast, de agent erachter kwam via een <strong>adapter</strong> binnen, en de <strong>daemon</strong> draaide de lus van vier stappen. De output is echt. De bestanden zijn van jou. Je kunt ze bewerken in elke editor, ze overhandigen aan een ontwerper, of ze terugvoeren in een andere skill.</p>
      <h2>Waarom bestanden, geen database</h2>
      <p>Elk primitief — skills, systemen, adapters — is een map met tekstbestanden. Er is geen centrale database. Er is geen “Open Design-account.” Er is geen gehoste service die moet blijven werken opdat jouw werk blijft werken.</p>
      <p>Dit is een doelbewuste afweging. We geven het vermogen op om slimme cross-user-analytics, cross-project-geheugen of gehoste samenwerking te doen. We krijgen terug: draagbaarheid, levensduur, auditeerbaarheid, en het vermogen voor iedereen om de hele bibliotheek te forken en hun eigen variant te leveren. Een <code>SKILL.md</code> die vandaag is geschreven, leest identiek voor een agent over twee jaar en voor een mens zonder enige tooling — hetzelfde kan niet gezegd worden van een plugin die is vastgepind aan de API van vorig jaar.</p>
      <p>Als je een generatie ontwerptools hebt zien sterven en je bestanden hebt zien meenemen, dan begrijp je waarom deze afweging het waard is.</p>
      <h2>Gerelateerde lectuur</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — de gok achter de vier primitieven</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-ontwerpworkflow: draai Claude, Codex of Qwen op je eigen sleutel</a> — hoe adapters verbinden met de agent waar je al voor betaalt</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">De lay-outlaag die het canvas vroeger verborg</a> — waarom houdingsregels in een DESIGN.md beter zijn dan vakjes slepen op een canvas</li>
      </ul>
  ar:
    title: "31 مهارة، 72 نظامًا: كيف تعمل مكتبة Open Design"
    summary: "جولة عبر العناصر الأساسية الأربعة التي تجعل Open Design قابلًا للتركيب: المهارات، والأنظمة، والمُحوّلات، والـ daemon. مع أمثلة ملموسة عن كيف يتحوّل ملف Markdown إلى مُنتَج تسليمي مثالي على مستوى البكسل."
    bodyHtml: |
      <p>Open Design، من الناحية الميكانيكية، هو أربعة عناصر أساسية مُكدّسة فوق بعضها بعضًا:</p>
      <ol>
      <li><strong>المهارات</strong> — ما الذي ينبغي أن يفعله العميل</li>
      <li><strong>الأنظمة</strong> — كيف ينبغي أن يبدو المُخرَج</li>
      <li><strong>المُحوّلات</strong> — أي عميل يقوم بالعمل</li>
      <li><strong>الـ daemon</strong> — الحلقة التي تربطها معًا</li>
      </ol>
      <p>كل عنصر أساسي هو مجلّد من الملفات. ولا يتطلّب أيٌّ منها قاعدة بيانات، أو بيئة تشغيل إضافات، أو خدمة مُستضافة. هذه هي المكتبة بأكملها — لا يوجد مفهوم خامس مختبئ خلف جدار تسجيل دخول. تتناول هذه المقالة كل عنصر بدوره وتُظهر ما يحدث عندما توجّه عميلك إلى ملخّص حقيقي. وإن أردت الحجة حول <em>لماذا</em> صمّمناه على هذا النحو قبل <em>الكيفية</em>، فابدأ بمقالة <a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a>.</p>
      <h2>المهارات: وحدة القدرة</h2>
      <p>المهارة هي مجلّد يحتوي على ملف <code>SKILL.md</code> واحد وصفر أو أكثر من الملفات المساعدة. ملف Markdown هو عقد العميل — وكل ما عداه في المجلّد موجود لمساعدة العميل على الوفاء به.</p>
      <h3>تشريح مجلّد المهارة</h3>
      <p>تبدو المهارة النموذجية هكذا:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p>يُعلن <code>SKILL.md</code> اسم المهارة، وشروط التحفيز، وشكل الإدخال، وشكل الإخراج، وأي إرشادات مُضمّنة للعميل. ومجلّدا <code>templates/</code> و<code>examples/</code> اختياريان لكنهما يحملان عبئًا كبيرًا: الأمثلة هي مُخرَجات معروفة الجودة يستطيع العميل أن يطابق أنماطه عليها، وهذا هو الفرق بين أن يُنتج «اصنع لي عرضًا» شيئًا متماسكًا مقابل شيء مُرتجل.</p>
      <p>الجزء الافتتاحي (front matter) هو الجزء الذي تقرؤه الـ daemon لتسجيل المهارة؛ والمتن هو الجزء الذي يقرؤه العميل لتنفيذها:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>لماذا الملف هو السجلّ</h3>
      <p>عندما تُقلِع الـ daemon، تفحص <code>skills/</code> وتسجّل كل مجلّد يحتوي على <code>SKILL.md</code>. لا يوجد بيان إضافة (plugin manifest). لا يوجد حقل إصدار. لا توجد خطوة رفع، ولا طابور مراجعة، ولا بناء. هناك الملف، والملف هو مصدر الحقيقة. ضع مجلّدًا جديدًا، وأعد تشغيل الـ daemon، فتظهر المهارة في المُنتقي. احذفها، فتختفي — لا مدخل سجلّ يتيم يشير إلى شيفرة لم تعد موجودة.</p>
      <p>نشحن حاليًا 31 مهارة. بعضها مُولّدات عروض، وبعضها يُنتج نماذج محاكاة للهاتف المحمول، وبعضها يبني صفحات تحريرية، وبعضها يكتب مستندات مكتبية (Word، Excel، PowerPoint). كلٌّ منها مجلّد يمكنك تفريعه (fork)، أو تحريره، أو استبداله. ولأن العقد نصّ صِرف، فإن «كتابة مهارة» و«قراءة مهارة لفهم ما تفعله» هما النشاط نفسه — تُدقّقها بفتحها.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="بطاقة مهارة واحدة بنص صِرف ذات ترويسة موسومة وبضعة أسطر، محدّدة بإطار أخضر على أرضية تحريرية شبه بيضاء">
        <figcaption>المهارة هي الوحدة الذرّية للقدرة — ملف صِرف واحد يستطيع العميل التقاطه وقراءته وتشغيله.</figcaption>
      </figure>
      <h2>الأنظمة: وحدة الذوق</h2>
      <p>إن كانت المهارة تصف <em>ما الذي يُصنع</em>، فإن النظام يصف <em>كيف ينبغي أن يبدو</em>. النظام هو ملف <code>DESIGN.md</code> بالإضافة إلى أصول مرجعية اختيارية. وهو يصف هوية بصرية بصيغة قابلة للقراءة آليًا:</p>
      <ul>
      <li><strong>اللون</strong> — قيم OKLch للمقدّمة، والخلفية، واللون المُميِّز، والخطأ، وهكذا</li>
      <li><strong>الخط</strong> — حزمة الخطوط، والأوزان، وسلّم الخط، وأعراف ارتفاع السطر</li>
      <li><strong>المسافة</strong> — الوحدة الأساسية، وسلّم التباعد، وعروض الحاويات، وقواعد الفواصل</li>
      <li><strong>وضعية التخطيط</strong> — خيارات الشبكة، وقواعد عدم التناظر، وتفضيلات الكثافة</li>
      <li><strong>الصوت</strong> — طباعة الكلمات: النبرة، والمفردات، وإيقاع الجملة</li>
      </ul>
      <h3>الـ DESIGN.md عقد، لا مكتبة مكوّنات</h3>
      <p>عمليًا، يُقرأ <code>DESIGN.md</code> كملخّص علامة تجارية قصير وحازم لا يستطيع العميل أن يُسيء تفسيره:</p>
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
      <p>الألوان بصيغة OKLch لتبقى متساوية إدراكيًا عبر الأسطح الفاتحة والداكنة؛ وسلّم الخط سُلّم لن ينحرف عنه العميل؛ وقواعد الوضعية هي الفرق بين عشر شاشات مُولّدة تبدو كأنها منتج واحد وعشر تبدو كأنها عشرة متدرّبين مختلفين. يقرأ العميل هذا مرة واحدة ويحترمه طوال المهمة كلها.</p>
      <p>النظام ليس مكتبة Figma. لا مكوّنات، ولا متغيّرات (variants)، ولا نُسخ متداخلة، ولا صيغة ثنائية تقف بينك وبين القواعد. إنه عقد يستطيع أي عميل قراءته وأي إنسان تدقيقه. نشحن 72 نظامًا جاهزة فور التشغيل، بما في ذلك نسخ محمولة من Linear، وVercel، وStripe، وApple، وCursor، وFigma، وذيل طويل من الأنظمة التحريرية وأنظمة العلامات التجارية.</p>
      <h3>امزج، فرّع، امتلك</h3>
      <p>ولأن النظام ليس سوى نصّ، يمكنك تفريع واحد وتحريره في مكانه، وشحن نسخة مُتغيّرة، أو كتابة نسختك الخاصة من الصفر في نحو 30 دقيقة من العمل المُركّز. بل يمكنك مزج الأنظمة في منتصف المشروع — الطباعة من Linear، ومنطق اللون من Vercel، والتخطيط من مواصفات داخلية — لأن لا شيء مُقيّد في صيغة ثنائية مملوكة. والفصل بين مجلّدي <code>skills/</code> و<code>design-systems/</code> مقصود: القدرة والذوق متعامدان، لذا يمكن لأي مهارة أن تعمل تحت أي نظام، ولأي نظام أن يُشغّل أي مهارة.</p>
      <h2>المُحوّلات: وحدة العميل</h2>
      <p>المهارات والأنظمة نصّ خامل. المُحوّلات هي القدر الضئيل من الشيفرة الذي يربطها بالعميل الذي يقوم بالعمل فعليًا. المُحوّل هو ملف TypeScript قصير في <code>adapters/</code> يعرف كيف:</p>
      <ul>
      <li>يكتشف ما إذا كان العميل مثبّتًا على <code>$PATH</code> الخاص بالمستخدم</li>
      <li>يبدأ جلسة مع ذلك العميل</li>
      <li>يُمرّر استدعاء مهارة إليه</li>
      <li>يجمع المُخرَج عائدًا</li>
      </ul>
      <p>نشحن اليوم مُحوّلات لـ 12 عميلًا: Claude، وCodex، وGemini، وCursor، وCopilot، وOpenCode، وDevin، وHermes، وPi، وKimi، وKiro، وQwen. تكتشف الـ daemon تلقائيًا أيّها موجود وتعرضها كقائمة منسدلة عند الإقلاع الأول — لا تُعدّ أي شيء، بل ترى فقط العملاء الذين لديك بالفعل.</p>
      <table><thead><tr><th>العنصر الأساسي</th><th>يقيم في</th><th>الملف</th><th>مصدر الحقيقة</th></tr></thead><tbody><tr><td>المهارة</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>الملف على القرص</td></tr><tr><td>النظام</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>الملف على القرص</td></tr><tr><td>المُحوّل</td><td><code>adapters/</code></td><td>ملف <code>.ts</code> واحد</td><td>استدعاء <code>register()</code></td></tr></tbody></table>
      <p>إذا أردت إضافة مُحوّل جديد، فالملف نحو 80 سطرًا من TypeScript واستدعاء <code>register()</code> واحد. لا SDK لتتعلّمه، ولا إذن لتطلبه، ولا سجلّ مركزي لتنشر إليه. العميل نفسه الذي تثق به فعلًا على حاسوبك المحمول يصبح المحرّك — Open Design لا يستبدله أبدًا. (تتناول القطعة المُرافقة <a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل التصميم بنظام BYOK</a> توجيه مُحوّل إلى مفتاحك الخاص.)</p>
      <h2>الـ daemon: الحلقة التي تربطها معًا</h2>
      <p>الـ daemon هي العملية الوحيدة قيد التشغيل في النظام. إنها عملية Node صغيرة تبدؤها بـ <code>pnpm tools-dev</code>، وتفعل أربعة أشياء بالتسلسل:</p>
      <ol>
      <li><strong>الكشف</strong> — تفحص <code>$PATH</code> بحثًا عن العملاء المثبّتين و<code>skills/</code> بحثًا عن المهارات المثبّتة، عند الإقلاع</li>
      <li><strong>الاكتشاف</strong> — تفتح استمارة أسئلة تفاعلية لتحديد السطح، والجمهور، والنبرة، والنطاق، وسياق العلامة التجارية للملخّص الحالي</li>
      <li><strong>التوجيه</strong> — تعرض 5 اتجاهات بصرية حتمية (لوحة الألوان بصيغة OKLch، وحزمة الخطوط، وإشارات وضعية التخطيط) وتطلب من المستخدم اختيار واحد</li>
      <li><strong>التسليم</strong> — تستدعي المهارة المُختارة مع النظام المُثبَّت، وتدع العميل يكتب إلى القرص، وتعرض المُخرَج معاينةً في إطار iframe معزول</li>
      </ol>
      <p>الحلقة بأكملها تتّسع في نحو 1500 سطر من الشيفرة. وهي صغيرة عن قصد. الذكاء في المهارات، لا في بيئة التشغيل — مهمة الـ daemon هي فحص المجلّدات، وتوجيه ملخّص عبر الخطوات الأربع، والابتعاد عن الطريق. هذا الصِّغر هو المغزى: هناك القليل جدًا هنا مما يمكن أن يتعفّن، ولا شيء تقريبًا يمكنه احتجاز عملك رهينة.</p>
      <h2>كيف يبدو الأمر عمليًا</h2>
      <p>افترض أنك تريد عرضًا لإطلاق ميزة منتج جديدة. إليك التدفّق:</p>
      <ol>
      <li>تُشغّل <code>pnpm tools-dev</code> في طرفية. تبدأ الـ daemon على <code>localhost:7780</code>.</li>
      <li>تفتح عنوان URL. تُريك الـ daemon أي العملاء وجدت (مثل Claude، وCursor، وCodex).</li>
      <li>تختار <code>guizang-ppt</code> من قائمة المهارات.</li>
      <li>تظهر استمارة أسئلة مدّتها 30 ثانية: من الجمهور، وما النبرة، وما سياق العلامة التجارية.</li>
      <li>تُعرض عليك 5 اتجاهات بصرية — لوحات ألوان مختلفة، وأزواج خطوط، ووضعيات تخطيط. تختار واحدًا.</li>
      <li>يكتب العميل إلى القرص. يُظهر إطار iframe معزول النتيجة. يمكنك التصدير إلى HTML، أو PDF، أو PPTX، أو ZIP، أو Markdown.</li>
      </ol>
      <p>تتبّع الأمر رجوعًا عبر العناصر الأساسية فيتّضح كله: اختارت الخطوة 3 <strong>مهارة</strong>، وثبّتت الخطوة 5 <strong>نظامًا</strong>، والعميل خلفها جاء عبر <strong>مُحوّل</strong>، و<strong>الـ daemon</strong> شغّلت الحلقة المؤلّفة من أربع خطوات. المُخرَج حقيقي. الملفات لك. يمكنك تحريرها في أي محرّر، أو تسليمها لمصمّم، أو تغذيتها عائدةً إلى مهارة أخرى.</p>
      <h2>لماذا ملفات، لا قاعدة بيانات</h2>
      <p>كل عنصر أساسي — المهارات، والأنظمة، والمُحوّلات — هو مجلّد من ملفات نصّية. لا توجد قاعدة بيانات مركزية. لا يوجد «حساب Open Design». لا توجد خدمة مُستضافة يجب أن تظلّ تعمل كي يظلّ عملك يعمل.</p>
      <p>هذه مقايضة مقصودة. نتخلّى عن القدرة على إجراء تحليلات ذكية عبر المستخدمين، أو ذاكرة عبر المشاريع، أو تعاون مُستضاف. ونستعيد بالمقابل: قابلية النقل، وطول العمر، وقابلية التدقيق، وقدرة أي شخص على تفريع المكتبة بأكملها وشحن نسخته الخاصة. ملف <code>SKILL.md</code> مكتوب اليوم يُقرأ على نحو مطابق لعميل بعد عامين من الآن ولإنسان بلا أي أدوات على الإطلاق — ولا يمكن قول الشيء نفسه عن إضافة مُثبَّتة على واجهة API العام الماضي.</p>
      <p>إذا كنت قد شاهدت جيلًا من أدوات التصميم يموت آخذًا ملفاتك معه، فستفهم لماذا تستحق هذه المقايضة العناء.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> — الرهان وراء العناصر الأساسية الأربعة</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل التصميم بنظام BYOK: شغّل Claude أو Codex أو Qwen على مفتاحك الخاص</a> — كيف تتّصل المُحوّلات بالعميل الذي تدفع مقابله بالفعل</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">طبقة التخطيط التي اعتاد الكانفاس إخفاءها</a> — لماذا تتفوّق قواعد الوضعية في DESIGN.md على سحب الصناديق على الكانفاس</li>
      </ul>
  tr:
    title: "31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır"
    summary: "Open Design'ı birleştirilebilir kılan dört ilkel öğenin incelemesi: beceriler, sistemler, adaptörler ve daemon. Bir Markdown dosyasının nasıl piksel mükemmelliğinde bir teslimata dönüştüğüne dair somut örneklerle."
    bodyHtml: |
      <p>Open Design, mekanik olarak, birbirinin üzerine yığılmış dört ilkel öğedir:</p>
      <ol>
      <li><strong>Beceriler</strong> — ajanın ne yapması gerektiği</li>
      <li><strong>Sistemler</strong> — çıktının nasıl görünmesi gerektiği</li>
      <li><strong>Adaptörler</strong> — işi hangi ajanın yaptığı</li>
      <li><strong>Daemon</strong> — bunları birbirine bağlayan döngü</li>
      </ol>
      <p>Her ilkel öğe, bir dosya klasörüdür. Hiçbiri bir veritabanı, bir eklenti çalışma zamanı veya barındırılan bir hizmet gerektirmez. Tüm kütüphane budur — bir giriş duvarının ardında saklanan beşinci bir kavram yoktur. Bu yazı, her birini sırayla inceliyor ve ajanınızı gerçek bir brief'e yönelttiğinizde neler olduğunu gösteriyor. <em>Nasıl</em>'dan önce bunu <em>neden</em> bu şekilde biçimlendirdiğimizin argümanını isterseniz, <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> yazısıyla başlayın.</p>
      <h2>Beceriler: yetenek birimi</h2>
      <p>Bir beceri, bir adet <code>SKILL.md</code> ve sıfır veya daha fazla destekleyici dosya içeren bir klasördür. Markdown dosyası ajanın sözleşmesidir — klasördeki diğer her şey, ajanın bu sözleşmeye ulaşmasına yardımcı olmak içindir.</p>
      <h3>Bir beceri klasörünün anatomisi</h3>
      <p>Tipik bir beceri şöyle görünür:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code>, becerinin adını, tetikleme koşullarını, girdi biçimini, çıktı biçimini ve ajan için satır içi yönergeleri bildirir. <code>templates/</code> ve <code>examples/</code> klasörleri isteğe bağlıdır ama büyük bir ağırlık taşır: örnekler, ajanın örüntü eşleştirmesi yapabileceği bilinen-iyi eserlerdir ve bu da "bana bir sunum yap" dediğinizde tutarlı bir şey üretilmesiyle doğaçlama bir şey üretilmesi arasındaki farktır.</p>
      <p>Ön bilgi (front matter), daemon'un beceriyi kaydetmek için okuduğu kısımdır; gövde ise ajanın onu yürütmek için okuduğu kısımdır:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Dosyanın neden kayıt defteri olduğu</h3>
      <p>Daemon başladığında, <code>skills/</code> klasörünü tarar ve <code>SKILL.md</code> içeren her klasörü kaydeder. Eklenti bildirimi yoktur. Sürüm alanı yoktur. Yükleme adımı, inceleme kuyruğu, derleme yoktur. Sadece dosya vardır ve dosya, gerçeğin kaynağıdır. Yeni bir klasör bırakın, daemon'u yeniden başlatın ve beceri seçicide görünür. Onu silin ve gider — artık var olmayan bir koda işaret eden öksüz bir kayıt defteri girişi kalmaz.</p>
      <p>Şu anda 31 beceri sunuyoruz. Bazıları sunum üreteci, bazıları mobil maket üretir, bazıları editöryel sayfalar oluşturur, bazıları ofis belgeleri (Word, Excel, PowerPoint) yazar. Her biri, çatallayabileceğiniz, düzenleyebileceğiniz veya değiştirebileceğiniz bir klasördür. Sözleşme düz metin olduğu için, "bir beceri yazmak" ve "ne yaptığını anlamak için bir beceriyi okumak" aynı etkinliktir — onu açarak denetlersiniz.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, etiketli bir başlığı ve birkaç satırı olan, yeşil bir çerçeveyle seçilmiş tek bir düz metin beceri kartı">
        <figcaption>Bir beceri, yeteneğin atomik birimidir — bir ajanın alıp okuyabileceği ve çalıştırabileceği tek bir düz dosya.</figcaption>
      </figure>
      <h2>Sistemler: zevk birimi</h2>
      <p>Bir beceri <em>ne yapılacağını</em> tanımlıyorsa, bir sistem <em>nasıl görünmesi gerektiğini</em> tanımlar. Bir sistem, bir <code>DESIGN.md</code> dosyası artı isteğe bağlı referans varlıklarıdır. Görsel bir kimliği makine tarafından okunabilir biçimde tanımlar:</p>
      <ul>
      <li><strong>Renk</strong> — ön plan, arka plan, vurgu, hata vb. için OKLch değerleri</li>
      <li><strong>Tipografi</strong> — font yığını, ağırlıklar, tipografi rampası, satır yüksekliği gelenekleri</li>
      <li><strong>Boşluk</strong> — temel birim, boşluk ölçeği, kapsayıcı genişlikleri, oluk kuralları</li>
      <li><strong>Yerleşim duruşu</strong> — ızgara seçimleri, asimetri kuralları, yoğunluk tercihleri</li>
      <li><strong>Ses</strong> — kelimelerin tipografisi: ton, kelime dağarcığı, cümle ritmi</li>
      </ul>
      <h3>Bir DESIGN.md bir sözleşmedir, bir bileşen kütüphanesi değil</h3>
      <p>Pratikte bir <code>DESIGN.md</code>, bir ajanın yanlış yorumlayamayacağı kısa, görüş sahibi bir marka brief'i gibi okunur:</p>
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
      <p>Renkler OKLch'tir, böylece açık ve koyu yüzeyler arasında algısal olarak dengeli kalırlar; tipografi rampası, ajanın dışına sapmayacağı bir merdivendir; duruş kuralları ise tek bir ürün gibi hissettiren on üretilmiş ekran ile on farklı stajyer gibi hissettiren on ekran arasındaki farktır. Ajan bunu bir kez okur ve tüm iş boyunca buna saygı gösterir.</p>
      <p>Bir sistem, bir Figma kütüphanesi değildir. Sizinle kurallar arasında duran hiçbir bileşen, varyant, iç içe örnek veya ikili format yoktur. Herhangi bir ajanın okuyabileceği ve herhangi bir insanın denetleyebileceği bir sözleşmedir. Kutudan çıktığı haliyle 72 sistem sunuyoruz; bunlara Linear, Vercel, Stripe, Apple, Cursor, Figma'nın taşınabilir sürümleri ve uzun bir editöryel ve marka sistemi listesi dahil.</p>
      <h3>Karıştırın, çatallayın, sahiplenin</h3>
      <p>Bir sistem sadece metin olduğu için, birini çatallayıp yerinde düzenleyebilir, bir varyant gönderebilir veya yaklaşık 30 dakikalık odaklanmış bir çalışmayla sıfırdan kendinizinkini yazabilirsiniz. Hatta proje ortasında sistemleri karıştırabilirsiniz — Linear'dan tipografi, Vercel'den renk mantığı, kurum içi bir spesifikasyondan yerleşim — çünkü hiçbir şey tescilli bir ikili formata kilitli değildir. <code>skills/</code> ve <code>design-systems/</code> klasörleri arasındaki ayrım kasıtlıdır: yetenek ve zevk birbirinden bağımsızdır, böylece herhangi bir beceri herhangi bir sistem altında çalışabilir ve herhangi bir sistem herhangi bir beceriyi yönlendirebilir.</p>
      <h2>Adaptörler: ajan birimi</h2>
      <p>Beceriler ve sistemler hareketsiz metinlerdir. Adaptörler ise onları işi gerçekte yapan ajana bağlayan az miktarda koddur. Bir adaptör, <code>adapters/</code> içinde şunları yapmayı bilen kısa bir TypeScript dosyasıdır:</p>
      <ul>
      <li>ajanın kullanıcının <code>$PATH</code> ortamına kurulu olup olmadığını tespit etmek</li>
      <li>o ajanla bir oturum başlatmak</li>
      <li>bir beceri çağrısını içeri aktarmak</li>
      <li>çıktıyı geri toplamak</li>
      </ul>
      <p>Bugün 12 ajan için adaptör sunuyoruz: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Daemon, hangilerinin mevcut olduğunu otomatik olarak tespit eder ve ilk açılışta bunları bir açılır menü olarak sunar — hiçbir şey yapılandırmazsınız, sadece zaten sahip olduğunuz ajanları görürsünüz.</p>




























      <table><thead><tr><th>İlkel öğe</th><th>Şurada bulunur</th><th>Dosya</th><th>Gerçeğin kaynağı</th></tr></thead><tbody><tr><td>Beceri</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>diskteki dosya</td></tr><tr><td>Sistem</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>diskteki dosya</td></tr><tr><td>Adaptör</td><td><code>adapters/</code></td><td>bir <code>.ts</code> dosyası</td><td>bir <code>register()</code> çağrısı</td></tr></tbody></table>
      <p>Yeni bir adaptör eklemek isterseniz, dosya kabaca 80 satır TypeScript ve tek bir <code>register()</code> çağrısından ibarettir. Öğrenilecek bir SDK, istenecek bir izin, yayımlanacak merkezi bir kayıt defteri yoktur. Dizüstü bilgisayarınızda zaten güvendiğiniz aynı ajan motor olur — Open Design onu asla değiştirmez. (Tamamlayıcı yazı <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı</a>, bir adaptörü kendi anahtarınıza yöneltme konusunu inceler.)</p>
      <h2>Daemon: hepsini birbirine bağlayan döngü</h2>
      <p>Daemon, sistemdeki çalışan tek süreçtir. <code>pnpm tools-dev</code> ile başlattığınız küçük bir Node sürecidir ve sırayla dört şey yapar:</p>
      <ol>
      <li><strong>Tespit</strong> — açılışta, kurulu ajanlar için <code>$PATH</code> ortamını ve kurulu beceriler için <code>skills/</code> klasörünü tarar</li>
      <li><strong>Keşif</strong> — mevcut brief için yüzeyi, hedef kitleyi, tonu, ölçeği ve marka bağlamını belirlemek üzere etkileşimli bir soru formu açar</li>
      <li><strong>Yönlendirme</strong> — 5 deterministik görsel yön (OKLch'te palet, font yığını, yerleşim duruşu ipuçları) sunar ve kullanıcıdan birini seçmesini ister</li>
      <li><strong>Teslimat</strong> — seçilen beceriyi kilitlenmiş sistemle çağırır, ajanın diske yazmasına izin verir ve çıktıyı korumalı bir iframe'de önizler</li>
      </ol>
      <p>Tüm döngü kabaca 1500 satır koda sığar. Kasıtlı olarak küçüktür. Zekâ çalışma zamanında değil, becerilerdedir — daemon'un görevi klasörleri taramak, bir brief'i dört adımdan geçirmek ve yoldan çekilmektir. Bu küçüklük asıl meseledir: burada çürüyebilecek çok az şey, çalışmanızı rehin alabilecek neredeyse hiçbir şey yoktur.</p>
      <h2>Pratikte nasıl hissettirdiği</h2>
      <p>Diyelim ki yeni bir ürün özelliği için bir lansman sunumu istiyorsunuz. İşte akış:</p>
      <ol>
      <li>Bir terminalde <code>pnpm tools-dev</code> komutunu çalıştırırsınız. Daemon <code>localhost:7780</code> üzerinde başlar.</li>
      <li>URL'i açarsınız. Daemon size bulduğu ajanları gösterir (örn. Claude, Cursor, Codex).</li>
      <li>Beceri listesinden <code>guizang-ppt</code> seçersiniz.</li>
      <li>30 saniyelik bir soru formu açılır: hedef kitle kim, ton nedir, marka bağlamı nedir.</li>
      <li>Size 5 görsel yön gösterilir — farklı paletler, tipografi eşleştirmeleri, yerleşim duruşları. Birini seçersiniz.</li>
      <li>Ajan diske yazar. Korumalı bir iframe sonucu gösterir. HTML, PDF, PPTX, ZIP veya Markdown olarak dışa aktarabilirsiniz.</li>
      </ol>
      <p>İlkel öğeler üzerinden geriye doğru izlediğinizde her şey okunaklı hale gelir: 3. adım bir <strong>beceri</strong> seçti, 5. adım bir <strong>sistem</strong> kilitledi, arkasındaki ajan bir <strong>adaptör</strong> aracılığıyla geldi ve <strong>daemon</strong> dört adımlı döngüyü çalıştırdı. Çıktı gerçektir. Dosyalar sizindir. Onları herhangi bir düzenleyicide düzenleyebilir, bir tasarımcıya verebilir veya başka bir beceriye geri besleyebilirsiniz.</p>
      <h2>Neden veritabanı değil de dosyalar</h2>
      <p>Her ilkel öğe — beceriler, sistemler, adaptörler — bir metin dosyası klasörüdür. Merkezi bir veritabanı yoktur. Bir "Open Design hesabı" yoktur. Çalışmanızın çalışmaya devam etmesi için çalışmaya devam etmesi gereken barındırılan bir hizmet yoktur.</p>
      <p>Bu kasıtlı bir ödünleşimdir. Kullanıcılar arası zekice analizler, projeler arası bellek veya barındırılan iş birliği yapma yeteneğinden vazgeçiyoruz. Karşılığında şunları kazanıyoruz: taşınabilirlik, kalıcılık, denetlenebilirlik ve herkesin tüm kütüphaneyi çatallayıp kendi varyantını gönderebilmesi. Bugün yazılan bir <code>SKILL.md</code>, iki yıl sonraki bir ajana ve hiçbir araca sahip olmayan bir insana da aynı şekilde okunur — geçen yılın API'sine sabitlenmiş bir eklenti için aynı şey söylenemez.</p>
      <p>Bir nesil tasarım aracının dosyalarınızı da yanlarında götürerek öldüğünü izlediyseniz, bu ödünleşimin neden buna değer olduğunu anlarsınız.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — dört ilkel öğenin arkasındaki bahis</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı: Claude, Codex veya Qwen'i kendi anahtarınızla çalıştırın</a> — adaptörlerin zaten ödeme yaptığınız ajana nasıl bağlandığı</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Tuvalin gizlemeye alışık olduğu yerleşim katmanı</a> — bir DESIGN.md'deki duruş kurallarının bir tuvalde kutuları sürüklemeyi neden geride bıraktığı</li>
      </ul>
  uk:
    title: "31 навичка, 72 системи: як працює бібліотека Open Design"
    summary: "Огляд чотирьох примітивів, які роблять Open Design компонованим: навичок, систем, адаптерів і daemon. З конкретними прикладами того, як файл Markdown стає піксельно точним результатом."
    bodyHtml: |
      <p>Механічно Open Design — це чотири примітиви, складені один на одного:</p>
      <ol>
      <li><strong>Навички</strong> — що агент має робити</li>
      <li><strong>Системи</strong> — як має виглядати результат</li>
      <li><strong>Адаптери</strong> — який агент виконує роботу</li>
      <li><strong>Daemon</strong> — цикл, що з’єднує їх разом</li>
      </ol>
      <p>Кожен примітив — це тека з файлами. Жоден із них не потребує бази даних, середовища виконання плагінів чи хмарного сервісу. Це вся бібліотека — немає п’ятої концепції, що ховається за стіною входу. Цей допис послідовно розглядає кожен із них і показує, що відбувається, коли ви спрямовуєте свого агента на справжній бриф. Якщо вам потрібен аргумент щодо того, <em>чому</em> ми сформували це саме так, перш ніж дізнатися <em>як</em>, почніть із <a href="/blog/why-we-built-open-design-as-a-skill-layer/">чому ми побудували Open Design як рівень навичок, а не продукт</a>.</p>
      <h2>Навички: одиниця можливостей</h2>
      <p>Навичка — це тека, що містить один <code>SKILL.md</code> і нуль або більше допоміжних файлів. Файл Markdown — це контракт агента; усе інше в теці є там, щоб допомогти агенту його виконати.</p>
      <h3>Анатомія теки навички</h3>
      <p>Типова навичка виглядає так:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>skills/</span></span>
      <span class="line"><span>  guizang-ppt/</span></span>
      <span class="line"><span>    SKILL.md</span></span>
      <span class="line"><span>    templates/</span></span>
      <span class="line"><span>      magazine.html</span></span>
      <span class="line"><span>    examples/</span></span>
      <span class="line"><span>      product-launch.html</span></span>
      <span class="line"><span>      pitch-deck.html</span></span></code></pre>
      <p><code>SKILL.md</code> оголошує назву навички, умови спрацювання, форму вхідних даних, форму результату та будь-які вбудовані вказівки для агента. Теки <code>templates/</code> та <code>examples/</code> необов’язкові, але тягнуть на собі багато: приклади — це завідомо хороші артефакти, з якими агент може зіставляти шаблони, і саме це є різницею між тим, чи «зроби мені презентацію» дасть щось цілісне, чи щось імпровізоване.</p>
      <p>Front matter — це частина, яку daemon читає, щоб зареєструвати навичку; тіло — це частина, яку агент читає, щоб її виконати:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="plaintext"><code><span class="line"><span>---</span></span>
      <span class="line"><span>name: guizang-ppt</span></span>
      <span class="line"><span>trigger: a deck, slide presentation, or pitch</span></span>
      <span class="line"><span>output: HTML (exportable to PDF, PPTX)</span></span>
      <span class="line"><span>---</span></span>
      <span class="line"><span></span></span>
      <span class="line"><span>Build a horizontal slide deck. One idea per slide.</span></span>
      <span class="line"><span>Lead with a cover, close with a call to action.</span></span>
      <span class="line"><span>Respect the locked-in design system for color, type, and spacing.</span></span>
      <span class="line"><span>Pattern-match against examples/ for layout density and rhythm.</span></span></code></pre>
      <h3>Чому файл і є реєстром</h3>
      <p>Коли daemon завантажується, він сканує <code>skills/</code> і реєструє кожну теку, що містить <code>SKILL.md</code>. Немає маніфесту плагіна. Немає поля версії. Немає кроку завантаження, немає черги перевірки, немає збірки. Є файл, і файл є джерелом істини. Покладіть нову теку, перезапустіть daemon — і навичка з’явиться в селекторі. Видаліть її — і вона зникне; жодного осиротілого запису в реєстрі, що вказує на код, якого більше немає.</p>
      <p>Наразі ми постачаємо 31 навичку. Деякі — генератори презентацій, деякі створюють мобільні макети, деякі будують редакційні сторінки, деякі пишуть офісні документи (Word, Excel, PowerPoint). Кожна з них — тека, яку ви можете форкнути, відредагувати чи замінити. Оскільки контракт є звичайним текстом, «написання навички» і «читання навички, щоб зрозуміти, що вона робить» — це одна й та сама діяльність: ви аудитуєте її, відкривши.</p>
      <figure>
        <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="Одна текстова картка навички з підписаним заголовком і кількома рядками, виділена зеленою рамкою на майже білому редакційному тлі">
        <figcaption>Навичка — це атомарна одиниця можливостей: один простий файл, який агент може взяти, прочитати й запустити.</figcaption>
      </figure>
      <h2>Системи: одиниця смаку</h2>
      <p>Якщо навичка описує, <em>що зробити</em>, то система описує, <em>як це має виглядати</em>. Система — це файл <code>DESIGN.md</code> плюс необов’язкові референсні активи. Вона описує візуальну айдентику в машинозчитуваній формі:</p>
      <ul>
      <li><strong>Колір</strong> — значення OKLch для переднього плану, тла, акценту, помилки тощо</li>
      <li><strong>Шрифт</strong> — набір шрифтів, насиченості, типографічна шкала, конвенції міжрядкового інтервалу</li>
      <li><strong>Простір</strong> — базова одиниця, шкала відступів, ширини контейнерів, правила жолобів</li>
      <li><strong>Постава макета</strong> — вибір сітки, правила асиметрії, переваги щільності</li>
      <li><strong>Голос</strong> — типографіка слів: тон, лексика, ритм речень</li>
      </ul>
      <h3>DESIGN.md — це контракт, а не бібліотека компонентів</h3>
      <p>На практиці <code>DESIGN.md</code> читається як короткий, чітко окреслений бренд-бриф, який агент не зможе хибно витлумачити:</p>
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
      <p>Кольори записані в OKLch, тож вони лишаються перцептивно рівними на світлих і темних поверхнях; типографічна шкала — це драбина, з якої агент не зіб’ється; правила постави — це різниця між десятьма згенерованими екранами, що відчуваються як один продукт, і десятьма, що відчуваються як десять різних стажерів. Агент читає це один раз і дотримується протягом усього завдання.</p>
      <p>Система — це не бібліотека Figma. Немає компонентів, немає варіантів, немає вкладених інстансів, немає бінарного формату, що стоїть між вами та правилами. Це контракт, який може прочитати будь-який агент і проаудитувати будь-яка людина. Ми постачаємо 72 системи з коробки, зокрема портативні версії Linear, Vercel, Stripe, Apple, Cursor, Figma та довгий хвіст редакційних і брендових систем.</p>
      <h3>Змішуй, форкай, володій</h3>
      <p>Оскільки система — це просто текст, ви можете форкнути одну й відредагувати її на місці, випустити варіант або написати власну з нуля приблизно за 30 хвилин зосередженої роботи. Ви навіть можете змішувати системи посеред проєкту — типографіка з Linear, логіка кольору з Vercel, макет із внутрішньої специфікації — бо ніщо не замкнене у пропрієтарному бінарному форматі. Поділ між теками <code>skills/</code> та <code>design-systems/</code> навмисний: можливість і смак ортогональні, тож будь-яка навичка може працювати під будь-якою системою, а будь-яка система може керувати будь-якою навичкою.</p>
      <h2>Адаптери: одиниця агента</h2>
      <p>Навички та системи — це інертний текст. Адаптери — це невелика кількість коду, що з’єднує їх з агентом, який власне виконує роботу. Адаптер — це короткий файл TypeScript у <code>adapters/</code>, який уміє:</p>
      <ul>
      <li>визначати, чи встановлено агент у <code>$PATH</code> користувача</li>
      <li>запускати сесію з цим агентом</li>
      <li>передавати в нього виклик навички</li>
      <li>збирати результат назад</li>
      </ul>
      <p>Сьогодні ми постачаємо адаптери для 12 агентів: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. Daemon автоматично виявляє присутні й пропонує їх у випадному списку при першому завантаженні — ви нічого не налаштовуєте, ви просто бачите агентів, які у вас уже є.</p>





























      <table><thead><tr><th>Примітив</th><th>Живе в</th><th>Файл</th><th>Джерело істини</th></tr></thead><tbody><tr><td>Навичка</td><td><code>skills/</code></td><td><code>SKILL.md</code></td><td>файл на диску</td></tr><tr><td>Система</td><td><code>design-systems/</code></td><td><code>DESIGN.md</code></td><td>файл на диску</td></tr><tr><td>Адаптер</td><td><code>adapters/</code></td><td>один файл <code>.ts</code></td><td>виклик <code>register()</code></td></tr></tbody></table>
      <p>Якщо ви хочете додати новий адаптер, файл становить приблизно 80 рядків TypeScript і єдиний виклик <code>register()</code>. Жодного SDK для вивчення, жодного дозволу для запиту, жодного центрального реєстру для публікації. Той самий агент, якому ви вже довіряєте на своєму ноутбуці, стає рушієм — Open Design ніколи його не замінює. (Супутній матеріал <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-робочий процес дизайну</a> розглядає налаштування адаптера на ваш власний ключ.)</p>
      <h2>Daemon: цикл, що зв’язує все докупи</h2>
      <p>Daemon — єдиний запущений процес у системі. Це невеликий процес Node, який ви запускаєте за допомогою <code>pnpm tools-dev</code>, і він робить чотири речі по черзі:</p>
      <ol>
      <li><strong>Виявляє</strong> — сканує <code>$PATH</code> на встановлених агентів і <code>skills/</code> на встановлені навички під час завантаження</li>
      <li><strong>Досліджує</strong> — відкриває інтерактивну форму питань, щоб точно визначити поверхню, аудиторію, тон, масштаб і брендовий контекст для поточного брифу</li>
      <li><strong>Спрямовує</strong> — представляє 5 детермінованих візуальних напрямів (палітра в OKLch, набір шрифтів, підказки щодо постави макета) і просить користувача обрати один</li>
      <li><strong>Постачає</strong> — викликає обрану навичку із зафіксованою системою, дозволяє агенту записати на диск і робить попередній перегляд результату в ізольованому iframe</li>
      </ol>
      <p>Увесь цикл вміщується приблизно в 1500 рядків коду. Він навмисно малий. Розумність — у навичках, а не в середовищі виконання; завдання daemon — сканувати теки, провести бриф через чотири кроки й не плутатися під ногами. Ця малість і є суттю: тут дуже мало того, що може зіпсуватися, і майже нічого, що могло б тримати вашу роботу в заручниках.</p>
      <h2>Як це відчувається на практиці</h2>
      <p>Припустімо, ви хочете презентацію для запуску нової функції продукту. Ось перебіг:</p>
      <ol>
      <li>Ви запускаєте <code>pnpm tools-dev</code> у терміналі. Daemon стартує на <code>localhost:7780</code>.</li>
      <li>Ви відкриваєте URL. Daemon показує, яких агентів він знайшов (напр. Claude, Cursor, Codex).</li>
      <li>Ви обираєте <code>guizang-ppt</code> зі списку навичок.</li>
      <li>Спливає 30-секундна форма питань: хто аудиторія, який тон, який брендовий контекст.</li>
      <li>Вам показують 5 візуальних напрямів — різні палітри, шрифтові пари, постави макета. Ви обираєте один.</li>
      <li>Агент записує на диск. Ізольований iframe показує результат. Ви можете експортувати в HTML, PDF, PPTX, ZIP або Markdown.</li>
      </ol>
      <p>Простежте це назад крізь примітиви — і все стає прозорим: крок 3 обрав <strong>навичку</strong>, крок 5 зафіксував <strong>систему</strong>, агент за нею прийшов через <strong>адаптер</strong>, а <strong>daemon</strong> запустив чотирикроковий цикл. Результат реальний. Файли — ваші. Ви можете редагувати їх у будь-якому редакторі, передати дизайнеру чи подати назад в іншу навичку.</p>
      <h2>Чому файли, а не база даних</h2>
      <p>Кожен примітив — навички, системи, адаптери — це тека з текстовими файлами. Немає центральної бази даних. Немає «акаунта Open Design». Немає хмарного сервісу, який має продовжувати працювати, щоб ваша робота продовжувала працювати.</p>
      <p>Це навмисний компроміс. Ми відмовляємося від здатності робити хитру міжкористувацьку аналітику, міжпроєктну пам’ять чи хмарну співпрацю. Натомість отримуємо: портативність, довговічність, можливість аудиту та здатність будь-кого форкнути всю бібліотеку й випустити власний варіант. <code>SKILL.md</code>, написаний сьогодні, читається ідентично для агента через два роки й для людини взагалі без жодного інструментарію — чого не скажеш про плагін, прив’язаний до торішнього API.</p>
      <p>Якщо ви спостерігали, як ціле покоління дизайнерських інструментів вмирало, забираючи з собою ваші файли, ви зрозумієте, чому цей компроміс того вартий.</p>
      <h2>Пов’язане для читання</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a> — ставка за чотирма примітивами</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-робочий процес дизайну: запускайте Claude, Codex чи Qwen на власному ключі</a> — як адаптери з’єднуються з агентом, за якого ви вже платите</li>
      <li><a href="/blog/layout-layer-canvas-used-to-hide/">Рівень макета, який полотно колись приховувало</a> — чому правила постави в DESIGN.md перевершують перетягування блоків на полотні</li>
      </ul>
---

Open Design is, mechanically, four primitives stacked on top of each other:

1. **Skills** — what the agent should do
2. **Systems** — what the output should look like
3. **Adapters** — which agent does the work
4. **The daemon** — the loop that wires them together

Each primitive is a folder of files. None of them require a database, a plugin runtime, or a hosted service. That's the whole library — there is no fifth concept hiding behind a login wall. This post walks through each in turn and shows what happens when you point your agent at a real brief. If you want the argument for *why* we shaped it this way before the *how*, start with [why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/).

## Skills: the unit of capability

A skill is a folder containing one `SKILL.md` and zero or more supporting files. The Markdown file is the agent's contract — everything else in the folder is there to help the agent hit it.

### Anatomy of a skill folder

A typical skill looks like this:

```
skills/
  guizang-ppt/
    SKILL.md
    templates/
      magazine.html
    examples/
      product-launch.html
      pitch-deck.html
```

`SKILL.md` declares the skill's name, the trigger conditions, the input shape, the output shape, and any inline guidance for the agent. The `templates/` and `examples/` folders are optional but pull a lot of weight: examples are known-good artifacts the agent can pattern-match against, which is the difference between "make me a deck" producing something coherent versus something improvised.

The front matter is the part the daemon reads to register the skill; the body is the part the agent reads to execute it:

```
---
name: guizang-ppt
trigger: a deck, slide presentation, or pitch
output: HTML (exportable to PDF, PPTX)
---

Build a horizontal slide deck. One idea per slide.
Lead with a cover, close with a call to action.
Respect the locked-in design system for color, type, and spacing.
Pattern-match against examples/ for layout density and rhythm.
```

### Why the file is the registry

When the daemon boots, it scans `skills/` and registers every folder containing a `SKILL.md`. There is no plugin manifest. There is no version field. There is no upload step, no review queue, no build. There is the file, and the file is the source of truth. Drop a new folder in, restart the daemon, and the skill appears in the picker. Delete it, and it's gone — no orphaned registry entry pointing at code that no longer exists.

We currently ship 31 skills. Some are deck generators, some produce mobile mockups, some build editorial pages, some write office documents (Word, Excel, PowerPoint). Each one is a folder you can fork, edit, or replace. Because the contract is plain text, "writing a skill" and "reading a skill to understand what it does" are the same activity — you audit it by opening it.

<figure>
  <img src="/blog/31-skills-72-systems-how-the-library-works-inline.webp" alt="A single plain-text skill card with a labeled header and a few lines, selected in a green frame on a near-white editorial ground" />
  <figcaption>A skill is the atomic unit of capability — one plain file an agent can pick up, read, and run.</figcaption>
</figure>

## Systems: the unit of taste

If a skill describes *what to make*, a system describes *what it should look like*. A system is a `DESIGN.md` file plus optional reference assets. It describes a visual identity in machine-readable form:

- **Color** — OKLch values for foreground, background, accent, error, and so on
- **Type** — font stack, weights, the type ramp, line-height conventions
- **Space** — base unit, spacing scale, container widths, gutter rules
- **Layout posture** — grid choices, asymmetry rules, density preferences
- **Voice** — typography of words: tone, vocabulary, sentence rhythm

### A DESIGN.md is a contract, not a component library

In practice a `DESIGN.md` reads like a short, opinionated brand brief that an agent can't misinterpret:

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

The colors are OKLch so they stay perceptually even across light and dark surfaces; the type ramp is a ladder the agent won't drift off of; the posture rules are the difference between ten generated screens that feel like one product and ten that feel like ten different interns. The agent reads this once and respects it for the whole job.

A system is not a Figma library. There are no components, no variants, no nested instances, no binary format standing between you and the rules. It is a contract that any agent can read and any human can audit. We ship 72 systems out of the box, including portable versions of Linear, Vercel, Stripe, Apple, Cursor, Figma, and a long tail of editorial and brand systems.

### Mix, fork, own

Because a system is just text, you can fork one and edit it in place, ship a variant, or write your own from scratch in roughly 30 minutes of focused work. You can even mix systems mid-project — typography from Linear, color logic from Vercel, layout from an in-house spec — because nothing is locked into a proprietary binary. The split between the `skills/` and `design-systems/` folders is deliberate: capability and taste are orthogonal, so any skill can run under any system, and any system can drive any skill.

## Adapters: the unit of agent

Skills and systems are inert text. Adapters are the small amount of code that connects them to the agent actually doing the work. An adapter is a short TypeScript file in `adapters/` that knows how to:

- detect whether the agent is installed on the user's `$PATH`
- start a session with that agent
- pipe a skill invocation in
- collect the output back

We ship adapters for 12 agents today: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. The daemon auto-detects which ones are present and offers them as a dropdown on first boot — you don't configure anything, you just see the agents you already have.

| Primitive | Lives in | File | Source of truth |
| --- | --- | --- | --- |
| Skill | `skills/` | `SKILL.md` | the file on disk |
| System | `design-systems/` | `DESIGN.md` | the file on disk |
| Adapter | `adapters/` | one `.ts` file | a `register()` call |

If you want to add a new adapter, the file is roughly 80 lines of TypeScript and a single `register()` call. No SDK to learn, no permission to request, no central registry to publish to. The same agent you already trust on your laptop becomes the engine — Open Design never replaces it. (The companion piece [BYOK design workflow](/blog/byok-design-workflow-claude-codex-qwen/) walks through pointing an adapter at your own key.)

## The daemon: the loop that ties it together

The daemon is the only running process in the system. It's a small Node process you start with `pnpm tools-dev`, and it does four things in sequence:

1. **Detect** — scans `$PATH` for installed agents and `skills/` for installed skills, on boot
2. **Discover** — opens an interactive question form to pin down surface, audience, tone, scale, and brand context for the current brief
3. **Direct** — presents 5 deterministic visual directions (palette in OKLch, font stack, layout posture cues) and asks the user to pick one
4. **Deliver** — invokes the selected skill with the locked-in system, lets the agent write to disk, and previews the output in a sandboxed iframe

The whole loop fits in roughly 1500 lines of code. It is intentionally small. The cleverness is in the skills, not in the runtime — the daemon's job is to scan folders, route a brief through the four steps, and stay out of the way. That smallness is the point: there is very little here that can rot, and almost nothing that can hold your work hostage.

## What it feels like in practice

Suppose you want a launch deck for a new product feature. Here's the flow:

1. You run `pnpm tools-dev` in a terminal. The daemon starts on `localhost:7780`.
2. You open the URL. The daemon shows you which agents it found (e.g. Claude, Cursor, Codex).
3. You pick `guizang-ppt` from the skill list.
4. A 30-second question form pops up: who's the audience, what's the tone, what's the brand context.
5. You're shown 5 visual directions — different palettes, type pairings, layout postures. You pick one.
6. The agent writes to disk. A sandboxed iframe shows the result. You can export to HTML, PDF, PPTX, ZIP, or Markdown.

Trace it back through the primitives and the whole thing is legible: step 3 chose a **skill**, step 5 locked a **system**, the agent behind it came through an **adapter**, and the **daemon** ran the four-step loop. The output is real. The files are yours. You can edit them in any editor, hand them to a designer, or feed them back into another skill.

## Why files, not a database

Every primitive — skills, systems, adapters — is a folder of text files. There is no central database. There is no "Open Design account." There is no hosted service that has to keep working for your work to keep working.

This is a deliberate trade. We give up the ability to do clever cross-user analytics, cross-project memory, or hosted collaboration. We get back: portability, longevity, auditability, and the ability for anyone to fork the entire library and ship their own variant. A `SKILL.md` written today reads identically to an agent two years from now and to a human with no tooling at all — the same can't be said of a plugin pinned to last year's API.

If you've watched a generation of design tools die taking your files with them, you'll understand why this trade is worth it.

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the bet behind the four primitives
- [BYOK design workflow: run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — how adapters connect to the agent you already pay for
- [The layout layer the canvas used to hide](/blog/layout-layer-canvas-used-to-hide/) — why posture rules in a DESIGN.md beat dragging boxes on a canvas
