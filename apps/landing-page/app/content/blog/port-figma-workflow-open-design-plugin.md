---
title: "How to port a Figma workflow into an Open Design plugin"
date: 2026-05-18
category: "Use cases"
readingTime: 8
summary: "The 0.8.0-preview thread asks contributors to port old design workflows one plugin at a time. Here is the concrete path for a Figma export, token sync, or brand kit."
i18n:
  zh:
    title: "如何把一套 Figma 工作流移植成一个 Open Design 插件"
    summary: "0.8.0-preview 讨论邀请贡献者把旧的设计工作流一次一个插件地移植过来。这里给出针对 Figma 导出、token 同步或品牌套件的具体路径。"
    bodyHtml: |
      <p>一套 Figma 工作流通常起步于肌肉记忆：导出这些 frame、同步那些 token、重建那个 deck 模板、把规范交给工程。这是那种活在某个人脑子里、每次新项目开始时都要重新讲一遍的工作。</p>
      <p>0.8.0-preview 讨论提出了一个更锋利的要求：把那份肌肉记忆移植成一个插件。不是一个螺栓拧在画布上的面板。不是一个只有一个团队能跑的私有脚本。而是一套可复用的 Open Design 工作流，让 agent 能像处理任何其他设计任务一样，通过同一个本地优先的循环把它拿起、执行、审查并交接出去。</p>
      <p>这是 <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview 插件征集</a> 的实操版。如果你的团队今天有一套可重复的设计工作流，这篇文章会展示把它变成一个插件形态的贡献是什么样子——它需要哪些文件、agent 如何把它拿起、以及它发布后落在哪里。</p>
      <h2>值得移植的那套工作流比你想的要小</h2>
      <p>别从「取代 Figma」开始。从一个烦人的、可重复的小活开始。</p>
      <p>好的第一个插件候选：</p>

























      <table><thead><tr><th>现有工作流</th><th>插件形态的版本</th></tr></thead><tbody><tr><td>导出一个 Figma 营销页并用代码把它重建出来</td><td><code>figma-migration</code> 插件，提取布局、映射 token，并生成一个 web 产物</td></tr><tr><td>每个月把一个品牌套件变成发布幻灯片</td><td>一个带 <code>SKILL.md</code>、示例资源和锁定设计系统的 deck 插件</td></tr><tr><td>为每个客户做同样的移动端引导原型</td><td>一个移动端屏幕插件，带受众、语气、功能清单和平台的输入字段</td></tr><tr><td>把一份组件规范转换成 Storybook 就绪的 UI</td><td>一个代码迁移插件，读取仓库、映射组件，并写出一份可审查的 diff</td></tr></tbody></table>
      <p>单位不是整个设计部门。单位是某个人已经每周重复两次的一套工作流。如果你没法用一句话把它说清——「把 X 变成 Y，带着这些约束」——那它多半是两个插件、而不是一个，你应该在动手写一行 Markdown 之前就把它拆开。</p>
      <p>这正是为什么 Open Design 的 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">skill 层</a> 在这里很重要。一个插件不是一个不透明的运行时扩展。它是一个装着文件的文件夹：一份 <code>SKILL.md</code> 契约、可选的设计系统、可选的示例，以及一个 <code>open-design.json</code> 伴随文件，告诉 Open Design 如何展示并应用这套工作流。你和规则之间没有二进制格式，这意味着任何人都能读这个插件、fork 它，或日后修它。</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="一个设计 frame 正从画布上被提取出来、放进一个可移植的模块盒子里，在近白色的编辑风底纹上被绿色框选中">
        <figcaption>移植一套工作流，意味着把可重复的那部分从画布里抬出来、放进一个可移植的插件里。</figcaption>
      </figure>
      <h2>Open Design 的切入点是可移植性</h2>
      <p>插件规范把契约讲得很直白：<code>SKILL.md</code> 始终是那份可执行的 agent 契约，而 <code>open-design.json</code> 则添上了 marketplace 元数据、输入字段、默认值、预览和上下文接线。</p>
      <p>这给了一套工作流两条命。在 Open Design 里，它表现为一个插件，带着预览、输入、来源出处和一键「使用」的路径。在 Claude Code、Cursor、Codex、Gemini CLI、OpenClaw 或另一个 skill 目录里，同一个文件夹仍然作为一个普通的 agent skill 起作用，因为核心行为活在 Markdown 里。你不是在为一个明年就会被弃用的运行时写东西；你是在写一个文件，两年后 agent 读它的方式还是一模一样。</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">库的走读</a> 已经解释了基础原语：skill、system、adapter 和 daemon。插件在这些原语周围添上了分发与可重复性——它们是一个团队交付、审查并复用的单位，而不是 agent 碰巧在磁盘上发现的那个原始 skill。</p>
      <p>对于一套 Figma 到代码的工作流，各个面通常长这样：</p>





























      <table><thead><tr><th>面</th><th>具体文件</th></tr></thead><tbody><tr><td>agent 行为</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design 元数据</td><td><code>open-design.json</code></td></tr><tr><td>品牌或视觉契约</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>示例输出</td><td>插件文件夹里的 <code>example.html</code> 或 <code>examples/{plugin-id}/example.html</code></td></tr><tr><td>预览媒体</td><td>插件文件夹里的 <code>preview/poster.png</code> 或 <code>preview/index.html</code></td></tr></tbody></table>
      <p>结果不是一个截图生成器。它是一套可复用的 agent 工作流，带着一份可见的契约——agent 遵循的每一条规则都摆在那个文件夹里，人类可以读、可以改。</p>
      <h2>一条具体的移植路径</h2>
      <p>这里是把一套 Figma 落地页工作流移植成一个插件的最小路径。整件事六步，其中大部分都是 Markdown。</p>
      <h3>1. 给那个可重复的活起个名字</h3>
      <p>写下描述这个活的那一句话：「把一个 Figma 营销 frame 变成一个响应式 Astro 页面，用自家品牌系统，审查就绪。」如果你没法把它塞进一句话，就收窄它直到能塞进去为止。这个名字会成为你的插件 id（<code>figma-workflow</code>）以及在 marketplace 里展示的标题。</p>
      <h3>2. 写 skill 契约</h3>
      <p><code>SKILL.md</code> 是 agent 读取的那份可执行契约。front matter 命名 skill 及其触发条件；正文是 brief——输入形态、输出路径、约束，以及一份 agent 在交接前应当自查的审查清单。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. 添上 Open Design 伴随文件</h3>
      <p><code>open-design.json</code> 是把一个裸 skill 变成一个 marketplace 插件的东西：标题、描述、声明的输入、预览和来源仓库。这就是驱动「使用」面板和来源出处那一行的元数据。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. 挂上设计系统</h3>
      <p>如果这套工作流依赖品牌规则，就在 <code>design-systems/</code> 下添一个 <code>DESIGN.md</code> 文件，而不是把颜色和排版埋在散文里。agent 把这套系统当作一份契约来吸收——OKLch 调色板、字号阶梯、版式 posture——这样十个生成出来的屏幕仍然感觉像同一个产品。在项目进行中混搭多个系统也行，因为它们不过是文本。</p>
      <h3>5. 放进一个真实的示例</h3>
      <p>在 <code>examples/</code> 下存一个生成出来的产物，这样审查者能评判输出、而不只是评判承诺。一个已知良好的 <code>example.html</code> 胜过一整段描述；它给了 agent 可以拿来做模式匹配的东西，也给了维护者可以批准的东西。</p>
      <p>拼到一起，这个插件就是一个单一的、可读的文件夹：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. 校验并打包</h3>
      <p>在开 PR 之前先跑插件命令。当前的 CLI 路径使用小写的插件 id。在 scaffold 时避免用斜杠分隔的注册表名；<code>od plugin scaffold</code> 创建的是 <code>&#x3C;out>/&#x3C;id>/...</code>，所以后续命令都指向那个生成出来的文件夹：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>当插件准备好接受注册表审查时，用 <code>od plugin login</code> 和 <code>od plugin whoami --json</code> 通过 GitHub 认证，然后按当前审查路径的发布文档操作。Open Design 不存储你的 GitHub 凭证。</p>
      <h2>在一个真实的设计团队里这是什么样子</h2>
      <p>想象一个小产品团队，有一个发布页的 Figma frame、一套自家品牌系统，以及每月一次的发布节奏。</p>
      <p>在有这个插件之前，工作流是一条交接链：设计师导出 frame，工程师重建布局，PM 重写文案，有人检查 token 漂移，另一个人立 bug。这活很熟悉，但记忆活在人身上——而每当有人请假、换团队，或忘了那条关键的约束时，它就会泄漏。</p>
      <p>在有这个插件之后，工作流变成了一个可运行的产物：</p>

































      <table><thead><tr><th>步骤</th><th>由谁来主导</th></tr></thead><tbody><tr><td>选择插件</td><td>设计师或 PM</td></tr><tr><td>挂上 Figma URL / 截图 / 本地资源</td><td>设计师</td></tr><tr><td>挑选品牌系统</td><td>设计师或设计工程师</td></tr><tr><td>生成 web 产物</td><td>Claude Code、Cursor、Codex、Gemini CLI，或另一个被检测到的 agent</td></tr><tr><td>审查 section ID、文案、密度和响应式行为</td><td>在 Open Design 预览里的人类</td></tr><tr><td>导出或交接文件</td><td>同一个本地项目文件夹</td></tr></tbody></table>
      <p>团队仍然需要审美——审查这一步正是它的所在，没有任何插件能取代它。插件移除的是「重新讲一遍」：约束、token 映射和输出路径不再是部落知识，而成了仓库里的一个文件。</p>
      <h2>接下来该做什么</h2>
      <p>如果你的团队有一套老是回头找你的 Figma 导出、token 同步、品牌套件或 deck 模板，先把最小的那块可重复切片移植过来。从一个 <code>SKILL.md</code> 起步，添上 <code>open-design.json</code>，挂上品牌的 <code>DESIGN.md</code>，放进一个真实的示例，校验它，然后在这套工作流长成一个谁也没法复用的私有工具之前就开 PR。截图到原型的示例端到端地展示了插件形态的版本：一个可移植的 skill 加上一个 Open Design 伴随文件。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">试试这套工作流</a>。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 个 skill、72 个 system：Open Design 库是怎么运作的</a>——插件所包裹的那些原语</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a>——为什么工作流是文件形态、而非账户形态</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma 的开源替代品</a>——移植你的工作流相对于那个老牌玩家落在哪里</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流：用你自己的密钥运行 Claude、Codex 或 Qwen</a>——同一个插件如何跑在你团队早已信任的那条模型路径上</li>
      </ul>
  zh-tw:
    title: "如何把一個 Figma 工作流程移植成一個 Open Design 外掛"
    summary: "0.8.0-preview 討論串請貢獻者一次移植一個外掛、把舊的設計工作流程搬過來。以下是針對 Figma 匯出、token 同步或品牌套件的具體路徑。"
    bodyHtml: |
      <p>一個 Figma 工作流程通常一開始是肌肉記憶：匯出這些框架、同步那些 token、重建那個簡報範本、把規格交給工程。這正是那種活在某個人腦袋裡、每次新專案開始時都要重新解釋一遍的工作。</p>
      <p>0.8.0-preview 討論串提出了一個更銳利的請求：把那份肌肉記憶移植成一個外掛。不是一個拴在畫布上的面板。不是一個只有一個團隊能跑的私有腳本。而是一個可重複使用的 Open Design 工作流程，agent 可以拿起它、執行、審查，並透過跟其他任何設計任務相同的本機優先迴圈交接出去。</p>
      <p>這是 <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview 外掛徵集</a>的實務版本。如果你的團隊今天有一個可重複的設計工作流程，這篇文章會展示把它變成一個外掛形態的貢獻是什麼樣子——它需要哪些檔案、agent 怎麼拿起它，以及它一旦發布後會落在哪裡。</p>
      <h2>值得移植的工作流程比你想的小</h2>
      <p>不要從「取代 Figma」開始。從一個惱人、可重複的工作開始。</p>
      <p>適合當第一個外掛的候選：</p>

























      <table><thead><tr><th>目前的工作流程</th><th>外掛形態的版本</th></tr></thead><tbody><tr><td>匯出一個 Figma 行銷頁面，並用程式碼把它重建</td><td>一個 <code>figma-migration</code> 外掛，它擷取版面、對映 token，並產生一個 web 產物</td></tr><tr><td>每個月把一個品牌套件變成發表簡報</td><td>一個帶有 <code>SKILL.md</code>、範例素材和一個鎖定設計系統的簡報外掛</td></tr><tr><td>為每個客戶建立同一個行動裝置導引原型</td><td>一個行動裝置畫面外掛，帶有受眾、語氣、功能清單和平台的輸入欄位</td></tr><tr><td>把一份元件規格轉成可直接用於 Storybook 的 UI</td><td>一個程式碼遷移外掛，它讀取 repo、對映元件，並寫出一個可審查的 diff</td></tr></tbody></table>
      <p>單位不是整個設計部門。單位是某個人每週已經重複兩次的一個工作流程。如果你沒辦法用單獨一句話描述它——「把 X 變成 Y，帶上這些限制」——那它大概是兩個外掛，而不是一個，你應該在寫下一行 Markdown 之前就把它拆開。</p>
      <p>這正是 Open Design 的<a href="/blog/why-we-built-open-design-as-a-skill-layer/">技能層</a>在這裡之所以重要的原因。一個外掛不是一個不透明的執行環境擴充。它是一個檔案資料夾：一份 <code>SKILL.md</code> 契約、選用的設計系統、選用的範例，以及一個 <code>open-design.json</code> 隨附檔，它告訴 Open Design 怎麼顯示並套用這個工作流程。你和規則之間沒有二進位格式，這意味著任何人都能讀這個外掛、分支它，或之後修它。</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="一個設計框架正從一塊畫布裡被擷取出來、並放進一個可攜的模組盒裡，被一個綠色框選中，襯在近白色的編輯風底色上">
        <figcaption>移植一個工作流程，意味著把可重複的部分從畫布裡舉出來，放進一個可攜的外掛裡。</figcaption>
      </figure>
      <h2>Open Design 的切入點是可攜性</h2>
      <p>外掛規格把契約講得很白：<code>SKILL.md</code> 仍是那份可執行的 agent 契約，而 <code>open-design.json</code> 加上市集中介資料、輸入欄位、預設值、預覽，以及背景接線。</p>
      <p>這讓一個工作流程有了兩種人生。在 Open Design 裡，它以一個外掛的形式出現，帶有預覽、輸入、來源出處，和一條一鍵「使用」的路徑。在 Claude Code、Cursor、Codex、Gemini CLI、OpenClaw 或另一個技能目錄裡，同一個資料夾仍以一個純粹的 agent 技能運作，因為核心行為活在 Markdown 裡。你不是在為一個明年就會被淘汰的執行環境寫東西；你是在寫一個 agent 在兩年後仍以同樣方式讀取的檔案。</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">函式庫導覽</a>已經解釋了那些基本元件：技能、系統、轉接器，以及 daemon。外掛在那些基本元件周圍加上了散布與可重複性——它們是一個團隊出貨、審查並重複使用的單位，而不是 agent 碰巧在磁碟上發現的那個原始技能。</p>
      <p>對於一個 Figma 轉程式碼的工作流程，那些載體通常長這樣：</p>





























      <table><thead><tr><th>載體</th><th>具體檔案</th></tr></thead><tbody><tr><td>agent 行為</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design 中介資料</td><td><code>open-design.json</code></td></tr><tr><td>品牌或視覺契約</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>範例輸出</td><td>外掛資料夾內的 <code>example.html</code> 或 <code>examples/{plugin-id}/example.html</code></td></tr><tr><td>預覽媒體</td><td>外掛資料夾內的 <code>preview/poster.png</code> 或 <code>preview/index.html</code></td></tr></tbody></table>
      <p>結果不是一個截圖產生器。它是一個帶有可見契約的可重複使用 agent 工作流程——agent 遵循的每一條規則都坐在那個資料夾裡，人類在那裡可以讀也可以編輯。</p>
      <h2>一條具體的移植路徑</h2>
      <p>以下是一個移植某個 Figma 落地頁工作流程的外掛的最小路徑。整件事是六個步驟，而其中大多數都是 Markdown。</p>
      <h3>1. 替那個可重複的工作命名</h3>
      <p>寫下那句描述這個工作的單一句子：「把一個 Figma 行銷框架變成一個響應式的 Astro 頁面，採用內部品牌系統，準備好供審查。」如果你沒辦法把它塞進一句話，就把它收窄到能塞進為止。這個名稱會成為你的外掛 id（<code>figma-workflow</code>），以及市集裡顯示的標題。</p>
      <h3>2. 寫技能契約</h3>
      <p><code>SKILL.md</code> 是 agent 讀取的那份可執行契約。front matter 為技能及其觸發條件命名；本文則是那份簡報——輸入形態、輸出路徑、限制，以及一份 agent 在交接前應該自我套用的審查檢查清單。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. 加上 Open Design 隨附檔</h3>
      <p><code>open-design.json</code> 正是把一個赤裸的技能變成一個市集外掛的東西：標題、描述、宣告的輸入、預覽，以及來源 repo。這就是驅動「使用」面板與來源出處那一行的中介資料。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. 接上設計系統</h3>
      <p>如果這個工作流程依賴品牌規則，那就在 <code>design-systems/</code> 底下加一個 <code>DESIGN.md</code> 檔案，而不要把色彩和字體埋在散文裡。agent 把這個系統當成一份契約來吸收——OKLch 調色盤、字級階梯、版面姿態——這樣十個生成出來的畫面仍然感覺像一個產品。在專案進行中混搭系統也行得通，因為它們只是文字。</p>
      <h3>5. 附上一個真實範例</h3>
      <p>在 <code>examples/</code> 底下存一個生成出來的產物，這樣審查者就能評判輸出，而不只是評判那個承諾。一個已知良好的 <code>example.html</code> 比一段描述更有價值；它給 agent 某個可以做樣式比對的東西，也給維護者某個可以核准的東西。</p>
      <p>組合起來，這個外掛是一個單一、可讀的資料夾：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. 驗證並打包</h3>
      <p>在開 PR 之前先跑這些外掛指令。目前的 CLI 路徑使用小寫的外掛 id。在搭建鷹架時避免用斜線分隔的登錄名稱；<code>od plugin scaffold</code> 會建立 <code>&#x3C;out>/&#x3C;id>/...</code>，所以後續的指令指向那個生成出來的資料夾：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>當這個外掛準備好供登錄審查時，用 <code>od plugin login</code> 和 <code>od plugin whoami --json</code> 透過 GitHub 認證，然後依循發布文件走目前的審查路徑。Open Design 不會儲存你的 GitHub 憑證。</p>
      <h2>在一個真實的設計團隊裡，這長什麼樣</h2>
      <p>想像一個小型產品團隊，有一個發表頁面的 Figma 框架、一個內部品牌系統，以及一個每月一次的發布節奏。</p>
      <p>在有這個外掛之前，工作流程是一條交接鏈：設計師匯出框架、工程師重建版面、PM 重寫文案、有人檢查 token 漂移、另一個人歸檔 bug。這份工作很熟悉，但記憶活在人身上——而且每當有人請假、換團隊，或忘了那個唯一要緊的限制時，它就會漏掉。</p>
      <p>在有這個外掛之後，工作流程變成一個可執行的產物：</p>

































      <table><thead><tr><th>步驟</th><th>由誰來指揮</th></tr></thead><tbody><tr><td>選擇外掛</td><td>設計師或 PM</td></tr><tr><td>附上 Figma URL／截圖／本機素材</td><td>設計師</td></tr><tr><td>挑選品牌系統</td><td>設計師或設計工程師</td></tr><tr><td>生成 web 產物</td><td>Claude Code、Cursor、Codex、Gemini CLI，或另一個偵測到的 agent</td></tr><tr><td>審查區段 ID、文案、密度和響應式行為</td><td>在 Open Design 預覽裡的人類</td></tr><tr><td>匯出或交接檔案</td><td>同一個本機專案資料夾</td></tr></tbody></table>
      <p>這個團隊仍然需要品味——審查那一步正是它所在之處，而沒有任何外掛能取代它。外掛拿掉的是那份重新解釋：那些限制、那張 token 對映，以及那條輸出路徑，不再是部落知識，而成為 repo 裡的一個檔案。</p>
      <h2>接下來該做什麼</h2>
      <p>如果你的團隊有一個 Figma 匯出、token 同步、品牌套件，或一個一直回來糾纏的簡報範本，那就先移植那個最小的可重複切片。從一份 <code>SKILL.md</code> 開始，加上 <code>open-design.json</code>，接上品牌的 <code>DESIGN.md</code>，放進一個真實範例，驗證它，並在這個工作流程長成一個沒人能重複使用的私有工具之前就開 PR。那個截圖轉原型的範例從頭到尾展示了外掛形態的版本：一個可攜的技能，加上一個 Open Design 隨附檔。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">試試這個工作流程</a>。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 個系統：Open Design 函式庫如何運作</a>——外掛所包裹的那些基本元件</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>——為什麼工作流程是檔案形態而不是帳號形態</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma 的開源替代方案</a>——移植你的工作流程相對於那個既有者會落在哪裡</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流程：用你自己的金鑰跑 Claude、Codex 或 Qwen</a>——同一個外掛如何能在你的團隊已經信任的模型路徑上執行</li>
      </ul>
  ja:
    title: "Figma ワークフローを Open Design プラグインに移植する方法"
    summary: "0.8.0-preview のスレッドは、コントリビューターに古いデザインワークフローを 1 プラグインずつ移植するよう呼びかけています。Figma のエクスポート、トークン同期、ブランドキットのための具体的な道筋を示します。"
    bodyHtml: |
      <p>Figma のワークフローはたいてい筋肉の記憶として始まります：このフレームをエクスポートし、あのトークンを同期し、あのデッキテンプレートを再構築し、仕様をエンジニアリングに渡す。それは誰かの頭の中にあり、新しいプロジェクトが始まるたびに説明し直される類の作業です。</p>
      <p>0.8.0-preview のスレッドは、より鋭い問いを投げかけます：その筋肉の記憶をプラグインに移植せよ。キャンバスにボルトで留めたパネルではなく。1 つのチームしか実行できないプライベートなスクリプトでもなく。エージェントが手に取り、実行し、レビューし、他のあらゆるデザインタスクと同じローカルファーストのループを通して引き渡せる、再利用可能な Open Design のワークフローです。</p>
      <p>これは <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview のプラグイン募集</a>の実践版です。あなたのチームが今日 1 つの繰り返し可能なデザインワークフローを持っているなら、この記事はそれをプラグイン形のコントリビューションに変えるとはどういうことかを示します ── どんなファイルが必要か、エージェントがどうそれを手に取るか、そして公開されたらどこに着地するか。</p>
      <h2>移植する価値のあるワークフローは思っているより小さい</h2>
      <p>「Figma を置き換える」から始めないでください。1 つの面倒で繰り返し可能な仕事から始めてください。</p>
      <p>最初のプラグインの良い候補：</p>


      <table><thead><tr><th>現在のワークフロー</th><th>プラグイン形のバージョン</th></tr></thead><tbody><tr><td>Figma のマーケティングページをエクスポートしてコードで再構築する</td><td>レイアウトを抽出し、トークンをマッピングし、web 成果物を生成する <code>figma-migration</code> プラグイン</td></tr><tr><td>毎月ブランドキットをローンチスライドに変える</td><td><code>SKILL.md</code>、サンプルアセット、固定されたデザインシステムを持つデッキプラグイン</td></tr><tr><td>クライアントごとに同じモバイルオンボーディングのモックアップを作る</td><td>オーディエンス、トーン、機能リスト、プラットフォームの入力フィールドを持つモバイル画面プラグイン</td></tr><tr><td>コンポーネント仕様を Storybook 対応の UI に変換する</td><td>リポジトリを読み、コンポーネントをマッピングし、レビュー可能な差分を書くコード移植プラグイン</td></tr></tbody></table>
      <p>単位はデザイン部門全体ではありません。単位は、誰かがすでに週に 2 回繰り返している 1 つのワークフローです。それを 1 文で記述できないなら ── 「これらの制約のもとで X を Y に変える」── おそらく 1 つではなく 2 つのプラグインであり、Markdown を 1 行書く前に分割すべきです。</p>
      <p>だからこそ Open Design の<a href="/blog/why-we-built-open-design-as-a-skill-layer/">スキルレイヤー</a>がここで重要になります。プラグインは不透明なランタイム拡張ではありません。それはファイルのフォルダです：<code>SKILL.md</code> の契約、任意のデザインシステム、任意のサンプル、そして Open Design にワークフローをどう表示し適用するかを伝える <code>open-design.json</code> のサイドカー。あなたとルールの間にバイナリ形式はなく、つまり誰でもプラグインを読み、フォークし、後で修正できるのです。</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="デザインフレームがキャンバスから抽出され、ポータブルなモジュールボックスに落とし込まれ、ほぼ白の編集的な地の上で緑のフレームに選択されている">
        <figcaption>ワークフローを移植するとは、繰り返し可能な部分をキャンバスから持ち上げ、ポータブルなプラグインへと入れることです。</figcaption>
      </figure>
      <h2>Open Design の観点はポータビリティ</h2>
      <p>プラグイン仕様は契約を率直に述べています：<code>SKILL.md</code> は実行可能なエージェントの契約のままであり、一方 <code>open-design.json</code> はマーケットプレイスのメタデータ、入力フィールド、デフォルト、プレビュー、コンテキストの配線を追加します。</p>
      <p>これは 1 つのワークフローに 2 つの命を与えます。Open Design では、プレビュー、入力、来歴、ワンクリックの「使う」経路を持つプラグインとして現れます。Claude Code、Cursor、Codex、Gemini CLI、OpenClaw、あるいは別のスキルカタログでは、コアの振る舞いが Markdown に宿っているため、同じフォルダがプレーンなエージェントスキルとして依然動きます。あなたは来年廃止されるランタイム向けに書いているのではなく、2 年後にエージェントが同じように読むファイルを書いているのです。</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">ライブラリの解説</a>はすでに基本プリミティブを説明しています：スキル、システム、アダプター、そして daemon。プラグインはそれらのプリミティブの周りに配布と再現性を加えます ── プラグインは、エージェントがたまたまディスク上で発見する素のスキルではなく、チームが出荷し、レビューし、再利用する単位なのです。</p>
      <p>Figma からコードへのワークフローでは、サーフェスはたいていこのようになります：</p>


      <table><thead><tr><th>サーフェス</th><th>具体的なファイル</th></tr></thead><tbody><tr><td>エージェントの振る舞い</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design のメタデータ</td><td><code>open-design.json</code></td></tr><tr><td>ブランドまたはビジュアルの契約</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>サンプル出力</td><td>プラグインフォルダ内の <code>example.html</code> または <code>examples/{plugin-id}/example.html</code></td></tr><tr><td>プレビューメディア</td><td>プラグインフォルダ内の <code>preview/poster.png</code> または <code>preview/index.html</code></td></tr></tbody></table>
      <p>結果はスクリーンショットジェネレーターではありません。見える契約を持つ再利用可能なエージェントワークフローです ── エージェントが従うすべてのルールが、人間が読んで編集できるフォルダに座っています。</p>
      <h2>具体的な移植の道筋</h2>
      <p>ここに、1 つの Figma ランディングページのワークフローを移植するプラグインのための最小の道筋を示します。全体は 6 ステップで、そのほとんどは Markdown です。</p>
      <h3>1. 繰り返し可能な仕事を名づける</h3>
      <p>その仕事を記述する 1 文を書き出します：「1 つの Figma マーケティングフレームを、ハウスブランドシステムでレスポンシブな Astro ページに変え、レビューの準備を整える。」1 文に収まらないなら、収まるまで絞り込んでください。その名前があなたのプラグイン id（<code>figma-workflow</code>）になり、マーケットプレイスに表示されるタイトルになります。</p>
      <h3>2. スキルの契約を書く</h3>
      <p><code>SKILL.md</code> はエージェントが読む実行可能な契約です。front matter はスキルとそのトリガーを名づけ、本文はブリーフです ── 入力の形、出力パス、制約、そしてエージェントが引き渡す前に自己適用すべきレビューチェックリスト。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Open Design のサイドカーを追加する</h3>
      <p><code>open-design.json</code> は、素のスキルをマーケットプレイスのプラグインに変えるものです：タイトル、説明、宣言された入力、プレビュー、ソースリポジトリ。これが「使う」パネルと来歴の行を駆動するメタデータです。</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. デザインシステムをアタッチする</h3>
      <p>ワークフローがブランドのルールに依存する場合、色とタイポグラフィを散文に埋め込む代わりに、<code>design-systems/</code> の下に <code>DESIGN.md</code> ファイルを追加します。エージェントはシステムを契約として取り込みます ── OKLch のパレット、タイプランプ、レイアウトの姿勢 ── ので、生成された 10 枚の画面が依然 1 つの製品のように感じられます。プロジェクトの途中でシステムを混ぜるのも、それらが単なるテキストなので、うまくいきます。</p>
      <h3>5. 実物のサンプルを 1 つ含める</h3>
      <p>生成された成果物を <code>examples/</code> の下に保存し、レビュアーが約束ではなく出力を判断できるようにします。1 つの既知の良好な <code>example.html</code> は、段落 1 つ分の説明よりも価値があります。エージェントにパターンマッチする対象を与え、メンテナーに承認する対象を与えるのです。</p>
      <p>まとめると、プラグインは 1 つの読みやすいフォルダです：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. 検証してパックする</h3>
      <p>PR を開く前にプラグインのコマンドを実行します。現在の CLI の経路は小文字のプラグイン id を使います。スキャフォールド時にスラッシュ区切りのレジストリ名は避けてください。<code>od plugin scaffold</code> は <code>&#x3C;out>/&#x3C;id>/...</code> を作成するので、後続のコマンドはその生成されたフォルダを指します：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>プラグインがレジストリのレビューの準備が整ったら、<code>od plugin login</code> と <code>od plugin whoami --json</code> で GitHub を通して認証し、現在のレビュー経路については公開ドキュメントに従ってください。Open Design はあなたの GitHub の認証情報を保存しません。</p>
      <h2>実際のデザインチームではこう見える</h2>
      <p>ローンチページのための Figma フレーム、ハウスブランドシステム、そして月次のリリースリズムを持つ小さなプロダクトチームを想像してみてください。</p>
      <p>プラグインの前は、ワークフローは引き渡しの連鎖です：デザイナーがフレームをエクスポートし、エンジニアがレイアウトを再構築し、PM がコピーを書き直し、誰かがトークンのずれを確認し、別の誰かがバグをファイルする。作業は馴染みがありますが、記憶は人々の中に宿り ── 誰かが不在になったり、チームを変わったり、重要だったその 1 つの制約を忘れたりするたびに漏れていきます。</p>
      <p>プラグインの後は、ワークフローは実行可能な成果物になります：</p>


      <table><thead><tr><th>ステップ</th><th>誰が指揮するか</th></tr></thead><tbody><tr><td>プラグインを選ぶ</td><td>デザイナーまたは PM</td></tr><tr><td>Figma URL / スクリーンショット / ローカルアセットをアタッチする</td><td>デザイナー</td></tr><tr><td>ブランドシステムを選ぶ</td><td>デザイナーまたはデザインエンジニア</td></tr><tr><td>web 成果物を生成する</td><td>Claude Code、Cursor、Codex、Gemini CLI、または別の検出されたエージェント</td></tr><tr><td>セクション ID、コピー、密度、レスポンシブな振る舞いをレビューする</td><td>Open Design のプレビュー内の人間</td></tr><tr><td>ファイルをエクスポートまたは引き渡す</td><td>同じローカルプロジェクトフォルダ</td></tr></tbody></table>
      <p>チームには依然センスが必要です ── レビューのステップがそれが宿る場所であり、どんなプラグインもそれを置き換えません。プラグインが取り除くのは説明し直すことです：制約、トークンマップ、出力パスが、部族の知識であることをやめ、リポジトリの中のファイルになります。</p>
      <h2>次に何をするか</h2>
      <p>あなたのチームに、何度も戻ってくる Figma のエクスポート、トークン同期、ブランドキット、デッキテンプレートがあるなら、最も小さい繰り返し可能なスライスから先に移植してください。<code>SKILL.md</code> から始め、<code>open-design.json</code> を追加し、ブランドの <code>DESIGN.md</code> をアタッチし、実物のサンプルを 1 つ入れ、検証し、そしてそのワークフローが他の誰も再利用できないプライベートツールに育つ前に PR を開いてください。スクリーンショットからプロトタイプへのサンプルが、プラグイン形のバージョンを端から端まで示しています：ポータブルなスキルと Open Design のサイドカーです。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">このワークフローを試す</a>。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 のスキル、72 のシステム：Open Design ライブラリの仕組み</a> — プラグインが包むプリミティブ</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a> — なぜワークフローがアカウント形ではなくファイル形なのか</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma のオープンソースの代替</a> — あなたのワークフローを移植すると、既存勢力に対してどこに着地するか</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー：自分のキーで Claude、Codex、Qwen を動かす</a> — 同じプラグインを、あなたのチームがすでに信頼するモデルの経路でどう動かせるか</li>
      </ul>
  ko:
    title: "Figma 워크플로를 Open Design 플러그인으로 옮기는 방법"
    summary: "0.8.0-preview 스레드는 기여자들에게 오래된 디자인 워크플로를 플러그인 단위로 하나씩 옮겨달라고 요청합니다. Figma 내보내기, 토큰 동기화, 브랜드 키트를 위한 구체적인 경로를 소개합니다."
    bodyHtml: |
      <p>Figma 워크플로는 대개 몸에 밴 습관으로 시작합니다. 이 프레임들을 내보내고, 저 토큰들을 동기화하고, 그 덱 템플릿을 다시 만들고, 사양을 엔지니어링 팀에 넘긴다. 누군가의 머릿속에만 존재하다가 새 프로젝트가 시작될 때마다 다시 설명해야 하는 종류의 작업입니다.</p>
      <p>0.8.0-preview 스레드는 더 날카로운 요청을 합니다. 그 몸에 밴 습관을 플러그인으로 옮기라는 것입니다. 캔버스에 덧붙인 패널이 아닙니다. 한 팀만 실행할 수 있는 비공개 스크립트도 아닙니다. 에이전트가 집어 들고, 실행하고, 검토하고, 다른 디자인 작업과 동일한 로컬 우선 루프를 통해 넘길 수 있는 재사용 가능한 Open Design 워크플로입니다.</p>
      <p>이것이 <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview 플러그인 모집</a>의 실용적 버전입니다. 오늘 당신의 팀에 반복 가능한 디자인 워크플로가 하나 있다면, 이 글은 그것을 플러그인 형태의 기여로 바꾸는 모습을 보여줍니다. 어떤 파일이 필요한지, 에이전트가 어떻게 집어 드는지, 그리고 게시된 후 어디에 안착하는지 말입니다.</p>
      <h2>옮길 가치가 있는 워크플로는 생각보다 작습니다</h2>
      <p>“Figma를 대체하자”로 시작하지 마세요. 짜증나는, 반복 가능한 작업 하나로 시작하세요.</p>
      <p>좋은 첫 플러그인 후보:</p>




      <table><thead><tr><th>현재 워크플로</th><th>플러그인 형태 버전</th></tr></thead><tbody><tr><td>Figma 마케팅 페이지를 내보내 코드로 다시 만들기</td><td>레이아웃을 추출하고, 토큰을 매핑하고, 웹 아티팩트를 생성하는 <code>figma-migration</code> 플러그인</td></tr><tr><td>매달 브랜드 키트를 런칭 슬라이드로 만들기</td><td><code>SKILL.md</code>, 예시 에셋, 잠긴 디자인 시스템을 갖춘 덱 플러그인</td></tr><tr><td>모든 고객사를 위해 동일한 모바일 온보딩 목업 만들기</td><td>대상, 톤, 기능 목록, 플랫폼 입력 필드를 갖춘 모바일 화면 플러그인</td></tr><tr><td>컴포넌트 사양을 Storybook 대응 UI로 변환하기</td><td>저장소를 읽고, 컴포넌트를 매핑하고, 검토 가능한 diff를 작성하는 코드 마이그레이션 플러그인</td></tr></tbody></table>
      <p>단위는 디자인 부서 전체가 아닙니다. 단위는 누군가 이미 일주일에 두 번 반복하는 워크플로 하나입니다. 한 문장으로 설명할 수 없다면 — “이런 제약 조건으로 X를 Y로 바꾼다” — 그것은 아마 하나가 아니라 두 개의 플러그인이며, Markdown 한 줄을 쓰기 전에 나눠야 합니다.</p>
      <p>그래서 Open Design의 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">스킬 레이어</a>가 여기서 중요합니다. 플러그인은 불투명한 런타임 확장이 아닙니다. 파일들이 담긴 폴더입니다. <code>SKILL.md</code> 계약, 선택적 디자인 시스템, 선택적 예시, 그리고 Open Design에게 워크플로를 어떻게 표시하고 적용할지 알려주는 <code>open-design.json</code> 사이드카입니다. 당신과 규칙 사이에 바이너리 포맷이 없으므로, 누구나 플러그인을 읽고, 포크하고, 나중에 고칠 수 있습니다.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="거의 흰색에 가까운 편집 디자인풍 바탕에서 초록색 프레임으로 선택된 채, 캔버스에서 추출되어 휴대 가능한 모듈 상자에 담기는 디자인 프레임">
        <figcaption>워크플로를 옮긴다는 것은 반복 가능한 부분을 캔버스에서 들어내 휴대 가능한 플러그인으로 옮긴다는 뜻입니다.</figcaption>
      </figure>
      <h2>Open Design의 핵심은 이식성입니다</h2>
      <p>플러그인 사양은 계약을 명확하게 규정합니다. <code>SKILL.md</code>는 실행 가능한 에이전트 계약으로 남고, <code>open-design.json</code>은 마켓플레이스 메타데이터, 입력 필드, 기본값, 미리보기, 컨텍스트 연결을 추가합니다.</p>
      <p>이로써 하나의 워크플로가 두 개의 삶을 갖습니다. Open Design에서는 미리보기, 입력, 출처, 그리고 원클릭 “사용” 경로를 갖춘 플러그인으로 나타납니다. Claude Code, Cursor, Codex, Gemini CLI, OpenClaw, 또는 다른 스킬 카탈로그에서는, 핵심 동작이 Markdown 안에 있기 때문에 동일한 폴더가 평범한 에이전트 스킬로도 여전히 작동합니다. 내년에 사라질 런타임을 위해 작성하는 것이 아닙니다. 2년 뒤에도 에이전트가 똑같은 방식으로 읽을 파일을 작성하는 것입니다.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">라이브러리 둘러보기</a>는 이미 기본 원시 요소들을 설명합니다. 스킬, 시스템, 어댑터, 그리고 daemon입니다. 플러그인은 그 원시 요소들 주위에 배포와 반복 가능성을 더합니다. 에이전트가 디스크에서 우연히 발견하는 원시 스킬이 아니라, 팀이 출하하고, 검토하고, 재사용하는 단위입니다.</p>
      <p>Figma-투-코드 워크플로의 경우, 표면은 대개 다음과 같습니다:</p>




      <table><thead><tr><th>표면</th><th>구체적 파일</th></tr></thead><tbody><tr><td>에이전트 동작</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design 메타데이터</td><td><code>open-design.json</code></td></tr><tr><td>브랜드 또는 비주얼 계약</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>예시 출력</td><td>플러그인 폴더 내부의 <code>example.html</code> 또는 <code>examples/{plugin-id}/example.html</code></td></tr><tr><td>미리보기 미디어</td><td>플러그인 폴더 내부의 <code>preview/poster.png</code> 또는 <code>preview/index.html</code></td></tr></tbody></table>
      <p>결과물은 스크린샷 생성기가 아닙니다. 눈에 보이는 계약을 갖춘 재사용 가능한 에이전트 워크플로입니다. 에이전트가 따르는 모든 규칙이 사람이 읽고 편집할 수 있는 폴더 안에 자리하고 있습니다.</p>
      <h2>구체적인 이식 경로</h2>
      <p>여기 하나의 Figma 랜딩 페이지 워크플로를 옮기는 플러그인을 위한 최소 경로가 있습니다. 전체는 여섯 단계이며, 대부분이 Markdown입니다.</p>
      <h3>1. 반복 가능한 작업의 이름을 짓기</h3>
      <p>작업을 설명하는 한 문장을 적으세요. “하나의 Figma 마케팅 프레임을 하우스 브랜드 시스템으로, 검토 준비가 된 반응형 Astro 페이지로 바꾼다.” 한 문장에 담을 수 없다면, 담을 수 있을 때까지 좁히세요. 그 이름이 당신의 플러그인 id(<code>figma-workflow</code>)가 되고 마켓플레이스에 표시되는 제목이 됩니다.</p>
      <h3>2. 스킬 계약 작성하기</h3>
      <p><code>SKILL.md</code>는 에이전트가 읽는 실행 가능한 계약입니다. 프런트매터는 스킬과 그 트리거의 이름을 짓고, 본문은 브리프입니다. 입력 형태, 출력 경로, 제약 조건, 그리고 에이전트가 넘기기 전에 스스로 적용해야 할 검토 체크리스트입니다.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Open Design 사이드카 추가하기</h3>
      <p><code>open-design.json</code>은 벌거벗은 스킬을 마켓플레이스 플러그인으로 바꿔주는 것입니다. 제목, 설명, 선언된 입력, 미리보기, 그리고 소스 저장소입니다. 이것이 “사용” 패널과 출처 라인을 구동하는 메타데이터입니다.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. 디자인 시스템 연결하기</h3>
      <p>워크플로가 브랜드 규칙에 의존한다면, 색상과 타이포그래피를 산문 속에 묻어두는 대신 <code>design-systems/</code> 아래에 <code>DESIGN.md</code> 파일을 추가하세요. 에이전트는 그 시스템을 계약으로 흡수합니다. OKLch 팔레트, 타입 램프, 레이아웃 자세 — 그래서 생성된 열 개의 화면이 여전히 하나의 제품처럼 느껴집니다. 프로젝트 중간에 시스템을 섞는 것도 가능합니다. 그것들은 그저 텍스트이기 때문입니다.</p>
      <h3>5. 실제 예시 하나 포함하기</h3>
      <p>검토자가 약속이 아니라 출력을 판단할 수 있도록 생성된 아티팩트를 <code>examples/</code> 아래에 저장하세요. 검증된 <code>example.html</code> 하나가 한 단락의 설명보다 더 가치 있습니다. 에이전트에게는 패턴 매칭할 대상을 주고, 메인테이너에게는 승인할 대상을 줍니다.</p>
      <p>다 합치면, 플러그인은 읽기 쉬운 하나의 폴더입니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. 검증하고 패키징하기</h3>
      <p>PR을 열기 전에 플러그인 명령을 실행하세요. 현재 CLI 경로는 소문자 플러그인 id를 사용합니다. 스캐폴드 시점에 슬래시로 구분된 레지스트리 이름은 피하세요. <code>od plugin scaffold</code>는 <code>&#x3C;out>/&#x3C;id>/...</code>를 생성하므로, 후속 명령들은 그 생성된 폴더를 가리킵니다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>플러그인이 레지스트리 검토 준비가 되면, <code>od plugin login</code>과 <code>od plugin whoami --json</code>으로 GitHub를 통해 인증한 다음, 현재 검토 경로에 대한 게시 문서를 따르세요. Open Design은 당신의 GitHub 자격 증명을 저장하지 않습니다.</p>
      <h2>실제 디자인 팀에서는 어떤 모습일까</h2>
      <p>런칭 페이지를 위한 Figma 프레임, 하우스 브랜드 시스템, 그리고 매월 릴리스 리듬을 갖춘 작은 제품 팀을 상상해 보세요.</p>
      <p>플러그인이 있기 전, 워크플로는 인계 사슬입니다. 디자이너가 프레임을 내보내고, 엔지니어가 레이아웃을 다시 만들고, PM이 카피를 다시 쓰고, 누군가는 토큰 드리프트를 확인하고, 또 다른 누군가는 버그를 제기합니다. 익숙한 작업이지만, 그 기억은 사람들 안에 살아 있습니다 — 그리고 누군가 자리를 비우거나, 팀을 옮기거나, 중요했던 그 한 가지 제약을 잊을 때마다 새어 나갑니다.</p>
      <p>플러그인이 있은 후, 워크플로는 실행 가능한 아티팩트가 됩니다:</p>




      <table><thead><tr><th>단계</th><th>누가 지시하는가</th></tr></thead><tbody><tr><td>플러그인 선택</td><td>디자이너 또는 PM</td></tr><tr><td>Figma URL / 스크린샷 / 로컬 에셋 첨부</td><td>디자이너</td></tr><tr><td>브랜드 시스템 선택</td><td>디자이너 또는 디자인 엔지니어</td></tr><tr><td>웹 아티팩트 생성</td><td>Claude Code, Cursor, Codex, Gemini CLI, 또는 감지된 다른 에이전트</td></tr><tr><td>섹션 ID, 카피, 밀도, 반응형 동작 검토</td><td>Open Design 미리보기 안의 사람</td></tr><tr><td>파일 내보내기 또는 인계</td><td>동일한 로컬 프로젝트 폴더</td></tr></tbody></table>
      <p>팀은 여전히 안목이 필요합니다 — 검토 단계가 바로 그것이 머무는 곳이며, 어떤 플러그인도 그것을 대체하지 못합니다. 플러그인이 없애는 것은 다시 설명하는 일입니다. 제약 조건, 토큰 맵, 출력 경로가 부족 지식이기를 멈추고 저장소 안의 파일이 됩니다.</p>
      <h2>다음에 할 일</h2>
      <p>당신의 팀에 계속 돌아오는 Figma 내보내기, 토큰 동기화, 브랜드 키트, 또는 덱 템플릿이 있다면, 가장 작은 반복 가능한 조각을 먼저 옮기세요. <code>SKILL.md</code>로 시작하고, <code>open-design.json</code>을 추가하고, 브랜드 <code>DESIGN.md</code>를 연결하고, 실제 예시 하나를 넣고, 검증한 다음, 그 워크플로가 아무도 재사용할 수 없는 비공개 도구로 자라기 전에 PR을 여세요. 스크린샷-투-프로토타입 예시는 플러그인 형태 버전을 처음부터 끝까지 보여줍니다. 휴대 가능한 스킬 더하기 Open Design 사이드카입니다.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">이 워크플로를 시도해 보세요</a>.</p>
      <h2>관련 읽을거리</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — 플러그인이 감싸는 원시 요소들</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a> — 워크플로가 계정 형태가 아니라 파일 형태인 이유</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — 당신의 워크플로를 옮기는 것이 기존 강자 대비 어디에 안착하는가</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design workflow: run Claude, Codex, or Qwen on your own key</a> — 동일한 플러그인이 당신의 팀이 이미 신뢰하는 모델 경로에서 실행될 수 있는 방법</li>
      </ul>
  de:
    title: "So portierst du einen Figma-Workflow in ein Open Design Plugin"
    summary: "Der 0.8.0-preview-Thread fordert Mitwirkende auf, alte Design-Workflows ein Plugin nach dem anderen zu portieren. Hier ist der konkrete Weg für einen Figma-Export, eine Token-Synchronisierung oder ein Brand-Kit."
    bodyHtml: |
      <p>Ein Figma-Workflow beginnt meist als Muskelgedächtnis: diese Frames exportieren, jene Tokens synchronisieren, jenes Deck-Template neu aufbauen, die Spezifikation an die Entwicklung übergeben. Es ist die Art von Arbeit, die im Kopf einer Person lebt und bei jedem neuen Projekt aufs Neue erklärt wird.</p>
      <p>Der 0.8.0-preview-Thread stellt eine schärfere Anforderung: dieses Muskelgedächtnis in ein Plugin zu portieren. Kein Panel, das an eine Canvas geschraubt wird. Kein privates Skript, das nur ein Team ausführen kann. Ein wiederverwendbarer Open Design Workflow, den ein Agent aufgreifen, ausführen, prüfen und über dieselbe local-first-Schleife wie jede andere Design-Aufgabe weitergeben kann.</p>
      <p>Das ist die praktische Version des <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview-Aufrufs für Plugins</a>. Wenn dein Team heute einen wiederholbaren Design-Workflow hat, zeigt dieser Beitrag, wie es aussieht, ihn in einen Plugin-förmigen Beitrag zu verwandeln — welche Dateien er braucht, wie der Agent ihn aufgreift und wo er landet, sobald er veröffentlicht ist.</p>
      <h2>Der portierenswerte Workflow ist kleiner, als du denkst</h2>
      <p>Fang nicht mit „Figma ersetzen“ an. Fang mit einer einzigen lästigen, wiederholbaren Aufgabe an.</p>
      <p>Gute Kandidaten für ein erstes Plugin:</p>




      <table><thead><tr><th>Aktueller Workflow</th><th>Plugin-förmige Version</th></tr></thead><tbody><tr><td>Eine Figma-Marketingseite exportieren und im Code neu aufbauen</td><td><code>figma-migration</code>-Plugin, das das Layout extrahiert, Tokens zuordnet und ein Web-Artefakt erzeugt</td></tr><tr><td>Jeden Monat ein Brand-Kit in Launch-Slides verwandeln</td><td>Deck-Plugin mit einer <code>SKILL.md</code>, Beispiel-Assets und einem fest verankerten Design-System</td></tr><tr><td>Für jeden Kunden dasselbe Mobile-Onboarding-Mockup erstellen</td><td>Mobile-Screen-Plugin mit Eingabefeldern für Zielgruppe, Tonalität, Feature-Liste und Plattform</td></tr><tr><td>Eine Komponenten-Spezifikation in Storybook-fertiges UI umwandeln</td><td>Code-Migrations-Plugin, das das Repo liest, Komponenten zuordnet und ein prüfbares Diff schreibt</td></tr></tbody></table>
      <p>Die Einheit ist nicht die ganze Design-Abteilung. Die Einheit ist ein Workflow, den jemand bereits zweimal pro Woche wiederholt. Wenn du ihn nicht in einem einzigen Satz beschreiben kannst — „X in Y verwandeln, mit diesen Einschränkungen“ — handelt es sich wahrscheinlich um zwei Plugins, nicht um eines, und du solltest ihn aufteilen, bevor du eine Zeile Markdown schreibst.</p>
      <p>Genau deshalb ist Open Designs <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Skill-Layer</a> hier so wichtig. Ein Plugin ist keine undurchsichtige Laufzeiterweiterung. Es ist ein Ordner voller Dateien: ein <code>SKILL.md</code>-Vertrag, optionale Design-Systeme, optionale Beispiele und ein <code>open-design.json</code>-Sidecar, das Open Design mitteilt, wie der Workflow angezeigt und angewendet wird. Zwischen dir und den Regeln steht kein Binärformat, was bedeutet, dass jeder das Plugin lesen, forken oder später reparieren kann.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Ein Design-Frame, der aus einer Canvas extrahiert und in eine portable Modul-Box abgelegt wird, ausgewählt in einem grünen Rahmen auf einem nahezu weißen redaktionellen Untergrund">
        <figcaption>Einen Workflow zu portieren bedeutet, den wiederholbaren Teil aus der Canvas herauszuheben und in ein portables Plugin zu überführen.</figcaption>
      </figure>
      <h2>Der Open-Design-Aspekt ist Portabilität</h2>
      <p>Die Plugin-Spezifikation formuliert den Vertrag klar: <code>SKILL.md</code> bleibt der ausführbare Agent-Vertrag, während <code>open-design.json</code> Marketplace-Metadaten, Eingabefelder, Standardwerte, Vorschauen und Kontext-Verdrahtung hinzufügt.</p>
      <p>Das gibt einem Workflow zwei Leben. In Open Design erscheint er als Plugin mit Vorschau, Eingaben, Herkunft und einem Ein-Klick-„Verwenden“-Pfad. In Claude Code, Cursor, Codex, Gemini CLI, OpenClaw oder einem anderen Skill-Katalog funktioniert derselbe Ordner weiterhin als reiner Agent-Skill, weil das Kernverhalten in Markdown lebt. Du schreibst nicht für eine Laufzeit, die nächstes Jahr abgekündigt wird; du schreibst eine Datei, die ein Agent in zwei Jahren genauso liest.</p>
      <p>Der <a href="/blog/31-skills-72-systems-how-the-library-works/">Bibliotheks-Rundgang</a> erklärt bereits die Basis-Primitiven: Skills, Systeme, Adapter und den daemon. Plugins fügen Verteilung und Wiederholbarkeit rund um diese Primitiven hinzu — sie sind die Einheit, die ein Team ausliefert, prüft und wiederverwendet, statt des rohen Skills, den ein Agent zufällig auf der Festplatte entdeckt.</p>
      <p>Für einen Figma-zu-Code-Workflow sehen die Oberflächen meist so aus:</p>




      <table><thead><tr><th>Oberfläche</th><th>Konkrete Datei</th></tr></thead><tbody><tr><td>Agent-Verhalten</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design Metadaten</td><td><code>open-design.json</code></td></tr><tr><td>Brand- oder Visual-Vertrag</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Beispiel-Ausgabe</td><td><code>example.html</code> oder <code>examples/{plugin-id}/example.html</code> innerhalb des Plugin-Ordners</td></tr><tr><td>Vorschau-Medien</td><td><code>preview/poster.png</code> oder <code>preview/index.html</code> innerhalb des Plugin-Ordners</td></tr></tbody></table>
      <p>Das Ergebnis ist kein Screenshot-Generator. Es ist ein wiederverwendbarer Agent-Workflow mit einem sichtbaren Vertrag — jede Regel, der der Agent folgt, liegt in dem Ordner, in dem ein Mensch sie lesen und bearbeiten kann.</p>
      <h2>Ein konkreter Portierungs-Pfad</h2>
      <p>Hier ist der Minimalpfad für ein Plugin, das einen Figma-Landingpage-Workflow portiert. Das Ganze umfasst sechs Schritte, und die meisten davon sind Markdown.</p>
      <h3>1. Benenne die wiederholbare Aufgabe</h3>
      <p>Schreib den einen Satz auf, der die Aufgabe beschreibt: „Verwandle einen Figma-Marketing-Frame in eine responsive Astro-Seite, im Haus-Brand-System, bereit zur Prüfung.“ Wenn du es nicht in einen Satz bekommst, grenze es ein, bis es passt. Der Name wird zu deiner Plugin-ID (<code>figma-workflow</code>) und zum Titel, der im Marketplace angezeigt wird.</p>
      <h3>2. Schreibe den Skill-Vertrag</h3>
      <p><code>SKILL.md</code> ist der ausführbare Vertrag, den der Agent liest. Das Front Matter benennt den Skill und seinen Trigger; der Body ist das Briefing — Eingabeform, Ausgabepfad, Einschränkungen und eine Review-Checkliste, die der Agent vor der Übergabe selbst anwenden sollte.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Füge das Open Design Sidecar hinzu</h3>
      <p><code>open-design.json</code> ist das, was aus einem nackten Skill ein Marketplace-Plugin macht: Titel, Beschreibung, deklarierte Eingaben, Vorschau und Quell-Repo. Das sind die Metadaten, die das „Verwenden“-Panel und die Herkunftszeile antreiben.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Verknüpfe das Design-System</h3>
      <p>Wenn der Workflow von Brand-Regeln abhängt, füge eine <code>DESIGN.md</code>-Datei unter <code>design-systems/</code> hinzu, anstatt Farbe und Typografie in Fließtext zu vergraben. Der Agent nimmt das System als Vertrag auf — OKLch-Palette, Type-Ramp, Layout-Haltung — sodass zehn generierte Screens sich immer noch wie ein einziges Produkt anfühlen. Systeme mitten im Projekt zu mischen funktioniert ebenfalls, weil sie nur Text sind.</p>
      <h3>5. Lege ein echtes Beispiel bei</h3>
      <p>Speichere ein generiertes Artefakt unter <code>examples/</code>, damit Prüfende die Ausgabe beurteilen können und nicht nur das Versprechen. Eine bekanntermaßen gute <code>example.html</code> ist mehr wert als ein Absatz Beschreibung; sie gibt dem Agenten etwas zum Pattern-Matching und einem Maintainer etwas zum Freigeben.</p>
      <p>Zusammengesetzt ist das Plugin ein einziger, lesbarer Ordner:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Validieren und packen</h3>
      <p>Führe die Plugin-Befehle aus, bevor du einen PR öffnest. Der aktuelle CLI-Pfad verwendet eine kleingeschriebene Plugin-ID. Vermeide beim Scaffolding mit Schrägstrichen getrennte Registry-Namen; <code>od plugin scaffold</code> erstellt <code>&#x3C;out>/&#x3C;id>/...</code>, sodass die Folgebefehle auf diesen generierten Ordner zeigen:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Wenn das Plugin bereit für die Registry-Prüfung ist, authentifiziere dich über GitHub mit <code>od plugin login</code> und <code>od plugin whoami --json</code> und folge dann der Veröffentlichungsdokumentation für den aktuellen Prüfpfad. Open Design speichert deine GitHub-Anmeldedaten nicht.</p>
      <h2>Wie das in einem echten Design-Team aussieht</h2>
      <p>Stell dir ein kleines Produktteam mit einem Figma-Frame für eine Launch-Seite, einem Haus-Brand-System und einem monatlichen Release-Rhythmus vor.</p>
      <p>Vor dem Plugin ist der Workflow eine Übergabekette: Designer exportiert Frames, Entwickler baut das Layout neu auf, PM schreibt den Text um, jemand prüft Token-Drift, jemand anderes meldet Bugs. Die Arbeit ist vertraut, aber das Gedächtnis lebt in den Menschen — und es geht jedes Mal verloren, wenn jemand fehlt, das Team wechselt oder die eine Einschränkung vergisst, auf die es ankam.</p>
      <p>Nach dem Plugin wird der Workflow zu einem ausführbaren Artefakt:</p>




      <table><thead><tr><th>Schritt</th><th>Wer ihn steuert</th></tr></thead><tbody><tr><td>Das Plugin auswählen</td><td>Designer oder PM</td></tr><tr><td>Figma-URL / Screenshot / lokale Assets anhängen</td><td>Designer</td></tr><tr><td>Das Brand-System wählen</td><td>Designer oder Design-Engineer</td></tr><tr><td>Das Web-Artefakt generieren</td><td>Claude Code, Cursor, Codex, Gemini CLI oder ein anderer erkannter Agent</td></tr><tr><td>Section-IDs, Text, Dichte und responsives Verhalten prüfen</td><td>Mensch in der Open Design Vorschau</td></tr><tr><td>Dateien exportieren oder übergeben</td><td>Derselbe lokale Projektordner</td></tr></tbody></table>
      <p>Das Team braucht weiterhin Geschmack — der Review-Schritt ist der Ort, an dem er lebt, und kein Plugin ersetzt ihn. Was das Plugin beseitigt, ist das erneute Erklären: die Einschränkungen, die Token-Zuordnung und der Ausgabepfad hören auf, Stammeswissen zu sein, und werden zu einer Datei im Repo.</p>
      <h2>Was als Nächstes zu tun ist</h2>
      <p>Wenn dein Team einen Figma-Export, eine Token-Synchronisierung, ein Brand-Kit oder ein Deck-Template hat, das immer wiederkehrt, portiere zuerst die kleinste wiederholbare Scheibe. Beginne mit einer <code>SKILL.md</code>, füge <code>open-design.json</code> hinzu, verknüpfe die Brand-<code>DESIGN.md</code>, lege ein echtes Beispiel bei, validiere es und öffne den PR, bevor der Workflow zu einem privaten Tool heranwächst, das niemand sonst wiederverwenden kann. Das Beispiel „Screenshot zu Prototyp“ zeigt die Plugin-förmige Version von Anfang bis Ende: ein portabler Skill plus ein Open Design Sidecar.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Probiere diesen Workflow aus</a>.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 Skills, 72 Systeme: wie die Open Design Bibliothek funktioniert</a> — die Primitiven, die ein Plugin umschließt</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Layer gebaut haben, nicht als Produkt</a> — warum der Workflow datei-förmig statt konto-förmig ist</li>
      <li><a href="/blog/figma-alternative-open-design/">Die Open-Source-Alternative zu Figma</a> — wo das Portieren deines Workflows im Verhältnis zum Platzhirsch landet</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-Design-Workflow: betreibe Claude, Codex oder Qwen auf deinem eigenen Key</a> — wie dasselbe Plugin auf dem Modellpfad laufen kann, dem dein Team bereits vertraut</li>
      </ul>
  fr:
    title: "Comment porter un workflow Figma vers un plugin Open Design"
    summary: "Le fil 0.8.0-preview demande aux contributeurs de porter d'anciens workflows de design un plugin à la fois. Voici le chemin concret pour un export Figma, une synchronisation de tokens ou un brand kit."
    bodyHtml: |
      <p>Un workflow Figma commence généralement comme une mémoire musculaire : exporter ces frames, synchroniser ces tokens, reconstruire ce modèle de deck, remettre la spécification à l'ingénierie. C'est le genre de travail qui vit dans la tête de quelqu'un et qui doit être réexpliqué chaque fois qu'un nouveau projet démarre.</p>
      <p>Le fil 0.8.0-preview formule une demande plus précise : portez cette mémoire musculaire dans un plugin. Pas un panneau boulonné sur un canvas. Pas un script privé qu'une seule équipe peut exécuter. Un workflow Open Design réutilisable qu'un agent peut prendre, exécuter, relire et transmettre via la même boucle local-first que n'importe quelle autre tâche de design.</p>
      <p>Voici la version pratique de l'<a href="https://github.com/nexu-io/open-design/discussions/1727">appel à plugins 0.8.0-preview</a>. Si votre équipe dispose aujourd'hui d'un workflow de design reproductible, cet article montre à quoi ressemble sa transformation en contribution sous forme de plugin — les fichiers dont il a besoin, comment l'agent le prend en charge, et où il atterrit une fois publié.</p>
      <h2>Le workflow qui vaut la peine d'être porté est plus petit que vous ne le pensez</h2>
      <p>Ne commencez pas par « remplacer Figma ». Commencez par une tâche pénible et reproductible.</p>
      <p>Bons candidats pour un premier plugin :</p>

























      <table><thead><tr><th>Workflow actuel</th><th>Version sous forme de plugin</th></tr></thead><tbody><tr><td>Exporter une page marketing Figma et la reconstruire en code</td><td>plugin <code>figma-migration</code> qui extrait la mise en page, mappe les tokens et génère un artefact web</td></tr><tr><td>Transformer chaque mois un brand kit en slides de lancement</td><td>Plugin de deck avec un <code>SKILL.md</code>, des actifs d'exemple et un design system verrouillé</td></tr><tr><td>Créer la même maquette d'onboarding mobile pour chaque client</td><td>Plugin d'écran mobile avec des champs de saisie pour le public, le ton, la liste des fonctionnalités et la plateforme</td></tr><tr><td>Convertir une spécification de composant en UI prête pour Storybook</td><td>Plugin de migration de code qui lit le dépôt, mappe les composants et écrit un diff relisible</td></tr></tbody></table>
      <p>L'unité n'est pas l'ensemble du département design. L'unité est un workflow que quelqu'un répète déjà deux fois par semaine. Si vous ne pouvez pas le décrire en une seule phrase — « transformer X en Y, avec ces contraintes » — il s'agit probablement de deux plugins, pas d'un, et vous devriez le scinder avant d'écrire une ligne de Markdown.</p>
      <p>C'est pourquoi la <a href="/blog/why-we-built-open-design-as-a-skill-layer/">couche de skills</a> d'Open Design compte ici. Un plugin n'est pas une extension d'exécution opaque. C'est un dossier de fichiers : un contrat <code>SKILL.md</code>, des design systems optionnels, des exemples optionnels, et un fichier d'accompagnement <code>open-design.json</code> qui indique à Open Design comment afficher et appliquer le workflow. Il n'y a aucun format binaire entre vous et les règles, ce qui signifie que n'importe qui peut lire le plugin, le forker ou le corriger plus tard.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Un frame de design extrait d'un canvas et déposé dans une boîte de module portable, sélectionné dans un cadre vert sur un fond éditorial presque blanc">
        <figcaption>Porter un workflow, c'est extraire la partie reproductible du canvas pour la placer dans un plugin portable.</figcaption>
      </figure>
      <h2>L'angle Open Design, c'est la portabilité</h2>
      <p>La spécification du plugin énonce le contrat clairement : <code>SKILL.md</code> reste le contrat exécutable de l'agent, tandis que <code>open-design.json</code> ajoute les métadonnées de marketplace, les champs de saisie, les valeurs par défaut, les aperçus et le câblage du contexte.</p>
      <p>Cela donne deux vies à un workflow. Dans Open Design, il apparaît comme un plugin avec un aperçu, des entrées, une provenance et un chemin d'« utilisation » en un clic. Dans Claude Code, Cursor, Codex, Gemini CLI, OpenClaw ou un autre catalogue de skills, le même dossier fonctionne toujours comme un simple skill d'agent parce que le comportement central vit dans le Markdown. Vous n'écrivez pas pour un environnement d'exécution qui sera déprécié l'an prochain ; vous écrivez un fichier qu'un agent lira de la même manière dans deux ans.</p>
      <p>Le <a href="/blog/31-skills-72-systems-how-the-library-works/">parcours de la bibliothèque</a> explique déjà les primitives de base : skills, systems, adaptateurs et le daemon. Les plugins ajoutent distribution et reproductibilité autour de ces primitives — ils sont l'unité qu'une équipe livre, relit et réutilise, plutôt que le skill brut qu'un agent découvre par hasard sur le disque.</p>
      <p>Pour un workflow Figma-vers-code, les surfaces ressemblent généralement à ceci :</p>





























      <table><thead><tr><th>Surface</th><th>Fichier concret</th></tr></thead><tbody><tr><td>Comportement de l'agent</td><td><code>SKILL.md</code></td></tr><tr><td>Métadonnées Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Contrat de marque ou visuel</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Sortie d'exemple</td><td><code>example.html</code> ou <code>examples/{plugin-id}/example.html</code> dans le dossier du plugin</td></tr><tr><td>Média d'aperçu</td><td><code>preview/poster.png</code> ou <code>preview/index.html</code> dans le dossier du plugin</td></tr></tbody></table>
      <p>Le résultat n'est pas un générateur de captures d'écran. C'est un workflow d'agent réutilisable avec un contrat visible — chaque règle que l'agent suit se trouve dans le dossier où un humain peut la lire et l'éditer.</p>
      <h2>Un chemin de portage concret</h2>
      <p>Voici le chemin minimal pour un plugin qui porte un workflow de landing-page Figma. L'ensemble tient en six étapes, et la plupart sont du Markdown.</p>
      <h3>1. Nommer la tâche reproductible</h3>
      <p>Écrivez la phrase unique qui décrit la tâche : « Transformer un frame marketing Figma en une page Astro responsive, dans le design system maison, prête pour la revue. » Si vous ne pouvez pas la faire tenir en une phrase, restreignez-la jusqu'à y parvenir. Le nom devient l'id de votre plugin (<code>figma-workflow</code>) et le titre affiché dans la marketplace.</p>
      <h3>2. Écrire le contrat du skill</h3>
      <p><code>SKILL.md</code> est le contrat exécutable que l'agent lit. Le front matter nomme le skill et son déclencheur ; le corps est le brief — forme de l'entrée, chemin de sortie, contraintes, et une liste de contrôle de revue que l'agent doit s'appliquer à lui-même avant de transmettre.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Ajouter le fichier d'accompagnement Open Design</h3>
      <p><code>open-design.json</code> est ce qui transforme un skill nu en plugin de marketplace : titre, description, entrées déclarées, aperçu et dépôt source. Ce sont les métadonnées qui pilotent le panneau « use » et la ligne de provenance.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Attacher le design system</h3>
      <p>Si le workflow dépend de règles de marque, ajoutez un fichier <code>DESIGN.md</code> sous <code>design-systems/</code> plutôt que d'enfouir la couleur et la typographie dans de la prose. L'agent ingère le system comme un contrat — palette OKLch, échelle typographique, posture de mise en page — afin que dix écrans générés donnent toujours l'impression d'un seul produit. Mélanger des systems en cours de projet fonctionne aussi, parce que ce ne sont que du texte.</p>
      <h3>5. Inclure un exemple réel</h3>
      <p>Enregistrez un artefact généré sous <code>examples/</code> afin que les relecteurs puissent juger la sortie, et pas seulement la promesse. Un <code>example.html</code> reconnu comme bon vaut plus qu'un paragraphe de description ; il donne à l'agent quelque chose sur quoi s'aligner et au mainteneur quelque chose à approuver.</p>
      <p>Mis bout à bout, le plugin est un dossier unique et lisible :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Valider et empaqueter</h3>
      <p>Lancez les commandes du plugin avant d'ouvrir une PR. Le chemin actuel du CLI utilise un id de plugin en minuscules. Évitez les noms de registre séparés par des slashs au moment du scaffold ; <code>od plugin scaffold</code> crée <code>&#x3C;out>/&#x3C;id>/...</code>, donc les commandes suivantes pointent vers ce dossier généré :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Lorsque le plugin est prêt pour la revue du registre, authentifiez-vous via GitHub avec <code>od plugin login</code> et <code>od plugin whoami --json</code>, puis suivez la documentation de publication pour le chemin de revue actuel. Open Design ne stocke pas vos identifiants GitHub.</p>
      <h2>À quoi cela ressemble dans une vraie équipe de design</h2>
      <p>Imaginez une petite équipe produit avec un frame Figma pour une page de lancement, un design system maison et un rythme de release mensuel.</p>
      <p>Avant le plugin, le workflow est une chaîne de transmissions : le designer exporte les frames, l'ingénieur reconstruit la mise en page, le PM réécrit le texte, quelqu'un vérifie la dérive des tokens, quelqu'un d'autre enregistre les bugs. Le travail est familier, mais la mémoire vit dans les personnes — et elle fuit chaque fois que quelqu'un est absent, change d'équipe ou oublie la seule contrainte qui comptait.</p>
      <p>Après le plugin, le workflow devient un artefact exécutable :</p>

































      <table><thead><tr><th>Étape</th><th>Qui la dirige</th></tr></thead><tbody><tr><td>Choisir le plugin</td><td>Designer ou PM</td></tr><tr><td>Attacher l'URL Figma / capture d'écran / actifs locaux</td><td>Designer</td></tr><tr><td>Choisir le design system</td><td>Designer ou design engineer</td></tr><tr><td>Générer l'artefact web</td><td>Claude Code, Cursor, Codex, Gemini CLI, ou un autre agent détecté</td></tr><tr><td>Relire les IDs de section, le texte, la densité et le comportement responsive</td><td>Humain dans l'aperçu Open Design</td></tr><tr><td>Exporter ou transmettre les fichiers</td><td>Le même dossier de projet local</td></tr></tbody></table>
      <p>L'équipe a toujours besoin de goût — l'étape de revue est là où il vit, et aucun plugin ne le remplace. Ce que le plugin supprime, c'est la réexplication : les contraintes, la carte des tokens et le chemin de sortie cessent d'être un savoir tribal pour devenir un fichier dans le dépôt.</p>
      <h2>Quoi faire ensuite</h2>
      <p>Si votre équipe a un export Figma, une synchronisation de tokens, un brand kit ou un modèle de deck qui revient sans cesse, portez d'abord la plus petite tranche reproductible. Commencez par un <code>SKILL.md</code>, ajoutez <code>open-design.json</code>, attachez le <code>DESIGN.md</code> de la marque, déposez un exemple réel, validez-le, et ouvrez la PR avant que le workflow ne se transforme en un outil privé que personne d'autre ne peut réutiliser. L'exemple capture-d'écran-vers-prototype montre la version sous forme de plugin de bout en bout : un skill portable plus un fichier d'accompagnement Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Essayez ce workflow</a>.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems : comment fonctionne la bibliothèque Open Design</a> — les primitives qu'un plugin enveloppe</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a> — pourquoi le workflow a la forme d'un fichier plutôt que d'un compte</li>
      <li><a href="/blog/figma-alternative-open-design/">L'alternative open-source à Figma</a> — où atterrit le portage de votre workflow par rapport à l'acteur en place</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow de design BYOK : faites tourner Claude, Codex ou Qwen sur votre propre clé</a> — comment le même plugin peut tourner sur le chemin de modèle auquel votre équipe fait déjà confiance</li>
      </ul>
  ru:
    title: "Как перенести рабочий процесс Figma в плагин Open Design"
    summary: "В обсуждении 0.8.0-preview контрибьюторов просят переносить старые дизайн-процессы по одному плагину за раз. Вот конкретный путь для экспорта из Figma, синхронизации токенов или брендбука."
    bodyHtml: |
      <p>Рабочий процесс в Figma обычно начинается как мышечная память: экспортировать эти фреймы, синхронизировать те токены, пересобрать вон тот шаблон презентации, передать спецификацию инженерам. Это та самая работа, которая живёт у кого-то в голове и заново объясняется каждый раз, когда стартует новый проект.</p>
      <p>Обсуждение 0.8.0-preview ставит вопрос острее: перенесите эту мышечную память в плагин. Не панель, прикрученную к холсту. Не приватный скрипт, который может запустить только одна команда. Многоразовый рабочий процесс Open Design, который агент может подхватить, выполнить, проверить и передать дальше через тот же local-first цикл, что и любую другую задачу дизайна.</p>
      <p>Это практическая версия <a href="https://github.com/nexu-io/open-design/discussions/1727">призыва 0.8.0-preview создавать плагины</a>. Если у вашей команды сегодня есть хотя бы один повторяемый рабочий процесс дизайна, этот пост показывает, как выглядит превращение его во вклад в форме плагина — какие файлы для этого нужны, как агент его подхватывает и где он оказывается после публикации.</p>
      <h2>Рабочий процесс, который стоит переносить, меньше, чем вы думаете</h2>
      <p>Не начинайте с «заменить Figma». Начните с одной надоедливой повторяемой задачи.</p>
      <p>Хорошие кандидаты для первого плагина:</p>




















      <table><thead><tr><th>Текущий рабочий процесс</th><th>Версия в форме плагина</th></tr></thead><tbody><tr><td>Экспортировать маркетинговую страницу из Figma и пересобрать её в коде</td><td>Плагин <code>figma-migration</code>, который извлекает макет, сопоставляет токены и генерирует веб-артефакт</td></tr><tr><td>Каждый месяц превращать брендбук в слайды для запуска</td><td>Плагин для презентаций с <code>SKILL.md</code>, примерами ассетов и зафиксированной дизайн-системой</td></tr><tr><td>Создавать один и тот же макет онбординга мобильного приложения для каждого клиента</td><td>Плагин для мобильных экранов с полями ввода для аудитории, тональности, списка функций и платформы</td></tr><tr><td>Преобразовывать спецификацию компонента в готовый для Storybook интерфейс</td><td>Плагин миграции кода, который читает репозиторий, сопоставляет компоненты и пишет проверяемый diff</td></tr></tbody></table>
      <p>Единица — это не весь отдел дизайна. Единица — это один рабочий процесс, который кто-то уже повторяет дважды в неделю. Если вы не можете описать его одним предложением — «превратить X в Y с такими-то ограничениями» — то это, вероятно, два плагина, а не один, и вам стоит разделить его прежде, чем вы напишете хоть строчку Markdown.</p>
      <p>Вот почему <a href="/blog/why-we-built-open-design-as-a-skill-layer/">слой навыков</a> Open Design здесь так важен. Плагин — это не непрозрачное расширение среды выполнения. Это папка с файлами: контракт <code>SKILL.md</code>, опциональные дизайн-системы, опциональные примеры и сопроводительный файл <code>open-design.json</code>, который сообщает Open Design, как отображать и применять рабочий процесс. Между вами и правилами нет бинарного формата, а значит, любой может прочитать плагин, форкнуть его или исправить позже.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Дизайн-фрейм извлекается из холста и помещается в переносимый модуль-блок, выделенный зелёной рамкой на почти белом редакторском фоне">
        <figcaption>Перенести рабочий процесс — значит вынуть повторяемую часть из холста и поместить её в переносимый плагин.</figcaption>
      </figure>
      <h2>Угол зрения Open Design — это переносимость</h2>
      <p>Спецификация плагина излагает контракт прямо: <code>SKILL.md</code> остаётся исполняемым контрактом агента, а <code>open-design.json</code> добавляет метаданные для маркетплейса, поля ввода, значения по умолчанию, превью и подключение контекста.</p>
      <p>Это даёт одному рабочему процессу две жизни. В Open Design он появляется как плагин с превью, входными данными, происхождением и путём «использовать» в один клик. В Claude Code, Cursor, Codex, Gemini CLI, OpenClaw или другом каталоге навыков та же папка по-прежнему работает как обычный навык агента, потому что основное поведение живёт в Markdown. Вы пишете не для среды выполнения, которая устареет в следующем году; вы пишете файл, который агент прочитает точно так же и через два года.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">Обзор библиотеки</a> уже объясняет базовые примитивы: навыки, системы, адаптеры и daemon. Плагины добавляют поверх этих примитивов распространение и повторяемость — это та единица, которую команда выпускает, проверяет и переиспользует, а не сырой навык, который агент случайно обнаруживает на диске.</p>
      <p>Для рабочего процесса «из Figma в код» поверхности обычно выглядят так:</p>


























      <table><thead><tr><th>Поверхность</th><th>Конкретный файл</th></tr></thead><tbody><tr><td>Поведение агента</td><td><code>SKILL.md</code></td></tr><tr><td>Метаданные Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Контракт бренда или визуала</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Пример вывода</td><td><code>example.html</code> или <code>examples/{plugin-id}/example.html</code> внутри папки плагина</td></tr><tr><td>Медиа для превью</td><td><code>preview/poster.png</code> или <code>preview/index.html</code> внутри папки плагина</td></tr></tbody></table>
      <p>Результат — это не генератор скриншотов. Это многоразовый рабочий процесс агента с видимым контрактом: каждое правило, которому следует агент, лежит в папке, где человек может его прочитать и отредактировать.</p>
      <h2>Конкретный путь переноса</h2>
      <p>Вот минимальный путь для плагина, который переносит один рабочий процесс Figma по созданию лендинга. Всё это — шесть шагов, и большинство из них — Markdown.</p>
      <h3>1. Назовите повторяемую задачу</h3>
      <p>Запишите одно предложение, описывающее задачу: «Превратить один маркетинговый фрейм Figma в адаптивную страницу Astro в фирменной дизайн-системе, готовую к проверке». Если вы не можете уложиться в одно предложение, сужайте, пока не сможете. Название становится id вашего плагина (<code>figma-workflow</code>) и заголовком, который отображается в маркетплейсе.</p>
      <h3>2. Напишите контракт навыка</h3>
      <p><code>SKILL.md</code> — это исполняемый контракт, который читает агент. Front matter задаёт имя навыка и его триггер; тело — это бриф: форма входных данных, путь вывода, ограничения и чек-лист проверки, который агент должен применить к себе перед передачей результата.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Добавьте сопроводительный файл Open Design</h3>
      <p><code>open-design.json</code> — это то, что превращает голый навык в плагин для маркетплейса: заголовок, описание, объявленные входные данные, превью и исходный репозиторий. Это метаданные, которые управляют панелью «использовать» и строкой происхождения.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Подключите дизайн-систему</h3>
      <p>Если рабочий процесс зависит от правил бренда, добавьте файл <code>DESIGN.md</code> в <code>design-systems/</code>, вместо того чтобы закапывать цвет и типографику в прозу. Агент воспринимает систему как контракт — палитра OKLch, типографическая шкала, постура макета — поэтому десять сгенерированных экранов по-прежнему ощущаются как один продукт. Смешивать системы по ходу проекта тоже можно, потому что это просто текст.</p>
      <h3>5. Включите один реальный пример</h3>
      <p>Сохраните сгенерированный артефакт в <code>examples/</code>, чтобы проверяющие могли судить о результате, а не только об обещании. Один заведомо хороший <code>example.html</code> стоит больше, чем абзац описания; он даёт агенту что-то, на что можно ориентироваться, и даёт мейнтейнеру что-то, что можно одобрить.</p>
      <p>Собранный воедино, плагин — это одна читаемая папка:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Проверьте и упакуйте</h3>
      <p>Запустите команды плагина перед тем, как открывать PR. Текущий путь CLI использует id плагина в нижнем регистре. Избегайте имён реестра с разделителями-слешами на этапе scaffolding; <code>od plugin scaffold</code> создаёт <code>&#x3C;out>/&#x3C;id>/...</code>, поэтому последующие команды указывают на эту сгенерированную папку:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Когда плагин готов к проверке в реестре, аутентифицируйтесь через GitHub с помощью <code>od plugin login</code> и <code>od plugin whoami --json</code>, затем следуйте документации по публикации для текущего пути проверки. Open Design не хранит ваши учётные данные GitHub.</p>
      <h2>Как это выглядит в реальной команде дизайна</h2>
      <p>Представьте небольшую продуктовую команду с фреймом Figma для страницы запуска, фирменной дизайн-системой и ежемесячным ритмом релизов.</p>
      <p>До плагина рабочий процесс — это цепочка передач: дизайнер экспортирует фреймы, инженер пересобирает макет, продакт-менеджер переписывает тексты, кто-то проверяет дрейф токенов, кто-то другой заводит баги. Работа знакомая, но память живёт в людях — и она утекает каждый раз, когда кто-то отсутствует, переходит в другую команду или забывает то единственное ограничение, которое было важным.</p>
      <p>После плагина рабочий процесс становится исполняемым артефактом:</p>































      <table><thead><tr><th>Шаг</th><th>Кто им управляет</th></tr></thead><tbody><tr><td>Выбрать плагин</td><td>Дизайнер или продакт-менеджер</td></tr><tr><td>Прикрепить URL Figma / скриншот / локальные ассеты</td><td>Дизайнер</td></tr><tr><td>Выбрать дизайн-систему</td><td>Дизайнер или дизайн-инженер</td></tr><tr><td>Сгенерировать веб-артефакт</td><td>Claude Code, Cursor, Codex, Gemini CLI или другой обнаруженный агент</td></tr><tr><td>Проверить ID секций, тексты, плотность и адаптивное поведение</td><td>Человек в превью Open Design</td></tr><tr><td>Экспортировать или передать файлы</td><td>Та же локальная папка проекта</td></tr></tbody></table>
      <p>Команде по-прежнему нужен вкус — он живёт на этапе проверки, и ни один плагин его не заменит. Что плагин убирает — это повторные объяснения: ограничения, карта токенов и путь вывода перестают быть племенным знанием и становятся файлом в репозитории.</p>
      <h2>Что делать дальше</h2>
      <p>Если у вашей команды есть экспорт из Figma, синхронизация токенов, брендбук или шаблон презентации, которые продолжают возвращаться, перенесите сначала наименьший повторяемый кусок. Начните с <code>SKILL.md</code>, добавьте <code>open-design.json</code>, подключите фирменный <code>DESIGN.md</code>, вложите один реальный пример, проверьте его и откройте PR прежде, чем рабочий процесс разрастётся в приватный инструмент, который больше никто не сможет переиспользовать. Пример «из скриншота в прототип» показывает версию в форме плагина от начала до конца: переносимый навык плюс сопроводительный файл Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Попробуйте этот рабочий процесс</a>.</p>
      <h2>Связанное чтение</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навык, 72 системы: как работает библиотека Open Design</a> — примитивы, которые оборачивает плагин</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не как продукт</a> — почему рабочий процесс имеет форму файла, а не аккаунта</li>
      <li><a href="/blog/figma-alternative-open-design/">Альтернатива Figma с открытым исходным кодом</a> — где оказывается перенос вашего рабочего процесса относительно действующего лидера</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Рабочий процесс дизайна BYOK: запускайте Claude, Codex или Qwen на собственном ключе</a> — как тот же плагин может работать на том пути к модели, которому ваша команда уже доверяет</li>
      </ul>
  es:
    title: "Cómo migrar un flujo de trabajo de Figma a un plugin de Open Design"
    summary: "El hilo de 0.8.0-preview pide a los colaboradores migrar antiguos flujos de trabajo de diseño, un plugin a la vez. Aquí tienes el camino concreto para una exportación de Figma, una sincronización de tokens o un brand kit."
    bodyHtml: |
      <p>Un flujo de trabajo de Figma suele empezar como memoria muscular: exporta estos frames, sincroniza esos tokens, reconstruye esa plantilla de presentación, entrega la especificación a ingeniería. Es el tipo de trabajo que vive en la cabeza de alguien y que hay que volver a explicar cada vez que arranca un proyecto nuevo.</p>
      <p>El hilo de 0.8.0-preview plantea una petición más afilada: porta esa memoria muscular a un plugin. No un panel atornillado a un lienzo. No un script privado que solo un equipo puede ejecutar. Un flujo de trabajo de Open Design reutilizable que un agente pueda tomar, ejecutar, revisar y entregar a través del mismo bucle local-first que cualquier otra tarea de diseño.</p>
      <p>Esta es la versión práctica de la <a href="https://github.com/nexu-io/open-design/discussions/1727">convocatoria de plugins de 0.8.0-preview</a>. Si tu equipo tiene hoy un flujo de trabajo de diseño repetible, esta publicación muestra cómo se ve convertirlo en una contribución con forma de plugin: qué archivos necesita, cómo lo toma el agente y dónde termina una vez publicado.</p>
      <h2>El flujo de trabajo que vale la pena portar es más pequeño de lo que crees</h2>
      <p>No empieces por «reemplazar Figma». Empieza por un trabajo molesto y repetible.</p>
      <p>Buenos candidatos para un primer plugin:</p>







































      <table><thead><tr><th>Flujo de trabajo actual</th><th>Versión con forma de plugin</th></tr></thead><tbody><tr><td>Exportar una página de marketing de Figma y reconstruirla en código</td><td>plugin <code>figma-migration</code> que extrae el layout, mapea tokens y genera un artefacto web</td></tr><tr><td>Convertir cada mes un kit de marca en diapositivas de lanzamiento</td><td>plugin de presentación con un <code>SKILL.md</code>, recursos de ejemplo y un sistema de diseño bloqueado</td></tr><tr><td>Crear el mismo mockup de onboarding móvil para cada cliente</td><td>plugin de pantalla móvil con campos de entrada para audiencia, tono, lista de funciones y plataforma</td></tr><tr><td>Convertir una especificación de componente en UI lista para Storybook</td><td>plugin de migración de código que lee el repositorio, mapea componentes y escribe un diff revisable</td></tr></tbody></table>
      <p>La unidad no es todo el departamento de diseño. La unidad es un flujo de trabajo que alguien ya repite dos veces por semana. Si no puedes describirlo en una sola frase —«convierte X en Y, con estas restricciones»— probablemente sean dos plugins, no uno, y deberías dividirlo antes de escribir una línea de Markdown.</p>
      <p>Por eso la <a href="/blog/why-we-built-open-design-as-a-skill-layer/">capa de skills</a> de Open Design importa aquí. Un plugin no es una extensión de runtime opaca. Es una carpeta de archivos: un contrato <code>SKILL.md</code>, sistemas de diseño opcionales, ejemplos opcionales y un sidecar <code>open-design.json</code> que le dice a Open Design cómo mostrar y aplicar el flujo de trabajo. No hay formato binario entre tú y las reglas, lo que significa que cualquiera puede leer el plugin, bifurcarlo o arreglarlo después.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Un frame de diseño extraído de un lienzo y soltado en una caja de módulo portátil, seleccionado en un marco verde sobre un fondo editorial casi blanco">
        <figcaption>Portar un flujo de trabajo significa levantar la parte repetible del lienzo y llevarla a un plugin portátil.</figcaption>
      </figure>
      <h2>El enfoque de Open Design es la portabilidad</h2>
      <p>La especificación del plugin enuncia el contrato sin rodeos: <code>SKILL.md</code> sigue siendo el contrato ejecutable del agente, mientras que <code>open-design.json</code> añade metadatos de marketplace, campos de entrada, valores por defecto, vistas previas y cableado de contexto.</p>
      <p>Eso le da dos vidas a un mismo flujo de trabajo. En Open Design aparece como un plugin con vista previa, entradas, procedencia y una ruta de «usar» de un clic. En Claude Code, Cursor, Codex, Gemini CLI, OpenClaw u otro catálogo de skills, la misma carpeta sigue funcionando como una skill de agente plana porque el comportamiento central vive en Markdown. No estás escribiendo para un runtime que quedará obsoleto el año que viene; estás escribiendo un archivo que un agente leerá igual dentro de dos años.</p>
      <p>El <a href="/blog/31-skills-72-systems-how-the-library-works/">recorrido por la biblioteca</a> ya explica las primitivas base: skills, sistemas, adaptadores y el daemon. Los plugins añaden distribución y repetibilidad alrededor de esas primitivas: son la unidad que un equipo publica, revisa y reutiliza, en lugar de la skill en bruto que un agente descubre por casualidad en disco.</p>
      <p>Para un flujo de trabajo de Figma a código, las superficies suelen verse así:</p>




























      <table><thead><tr><th>Superficie</th><th>Archivo concreto</th></tr></thead><tbody><tr><td>Comportamiento del agente</td><td><code>SKILL.md</code></td></tr><tr><td>Metadatos de Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Contrato de marca o visual</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Salida de ejemplo</td><td><code>example.html</code> o <code>examples/{plugin-id}/example.html</code> dentro de la carpeta del plugin</td></tr><tr><td>Medios de vista previa</td><td><code>preview/poster.png</code> o <code>preview/index.html</code> dentro de la carpeta del plugin</td></tr></tbody></table>
      <p>El resultado no es un generador de capturas de pantalla. Es un flujo de trabajo de agente reutilizable con un contrato visible: cada regla que sigue el agente está en la carpeta donde una persona puede leerla y editarla.</p>
      <h2>Una ruta de portado concreta</h2>
      <p>Esta es la ruta mínima para un plugin que porta un flujo de trabajo de página de aterrizaje de Figma. Son seis pasos en total, y la mayoría son Markdown.</p>
      <h3>1. Nombra el trabajo repetible</h3>
      <p>Escribe la única frase que describe el trabajo: «Convierte un frame de marketing de Figma en una página Astro responsive, en el sistema de marca de la casa, lista para revisión». Si no cabe en una frase, acótalo hasta que quepa. El nombre se convierte en el id de tu plugin (<code>figma-workflow</code>) y en el título que se muestra en el marketplace.</p>
      <h3>2. Escribe el contrato de la skill</h3>
      <p><code>SKILL.md</code> es el contrato ejecutable que lee el agente. El front matter nombra la skill y su disparador; el cuerpo es el brief: forma de la entrada, ruta de salida, restricciones y una lista de revisión que el agente debe aplicarse a sí mismo antes de entregar.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Añade el sidecar de Open Design</h3>
      <p><code>open-design.json</code> es lo que convierte una skill desnuda en un plugin de marketplace: título, descripción, entradas declaradas, vista previa y repositorio de origen. Estos son los metadatos que impulsan el panel de «usar» y la línea de procedencia.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Adjunta el sistema de diseño</h3>
      <p>Si el flujo de trabajo depende de reglas de marca, añade un archivo <code>DESIGN.md</code> bajo <code>design-systems/</code> en lugar de enterrar el color y la tipografía en prosa. El agente ingiere el sistema como un contrato —paleta OKLch, escala tipográfica, postura de layout— de modo que diez pantallas generadas siguen pareciendo un solo producto. Mezclar sistemas a mitad de proyecto también funciona, porque no son más que texto.</p>
      <h3>5. Incluye un ejemplo real</h3>
      <p>Guarda un artefacto generado bajo <code>examples/</code> para que quienes revisan puedan juzgar la salida, no solo la promesa. Un <code>example.html</code> conocido y bueno vale más que un párrafo de descripción; le da al agente algo con qué hacer coincidencia de patrones y le da a un mantenedor algo que aprobar.</p>
      <p>Reunido todo, el plugin es una sola carpeta legible:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Valida y empaqueta</h3>
      <p>Ejecuta los comandos del plugin antes de abrir un PR. La ruta actual del CLI usa un id de plugin en minúsculas. Evita nombres de registro separados por barras al hacer scaffold; <code>od plugin scaffold</code> crea <code>&#x3C;out>/&#x3C;id>/...</code>, así que los comandos siguientes apuntan a esa carpeta generada:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Cuando el plugin esté listo para la revisión del registro, autentícate a través de GitHub con <code>od plugin login</code> y <code>od plugin whoami --json</code>, y luego sigue la documentación de publicación para la ruta de revisión actual. Open Design no almacena tus credenciales de GitHub.</p>
      <h2>Cómo se ve esto en un equipo de diseño real</h2>
      <p>Imagina un equipo de producto pequeño con un frame de Figma para una página de lanzamiento, un sistema de marca de la casa y un ritmo de release mensual.</p>
      <p>Antes del plugin, el flujo de trabajo es una cadena de entregas: el diseñador exporta frames, el ingeniero reconstruye el layout, el PM reescribe el texto, alguien revisa la deriva de tokens, otra persona reporta bugs. El trabajo es familiar, pero la memoria vive en las personas, y se fuga cada vez que alguien falta, cambia de equipo u olvida la única restricción que importaba.</p>
      <p>Después del plugin, el flujo de trabajo se convierte en un artefacto ejecutable:</p>


































      <table><thead><tr><th>Paso</th><th>Quién lo dirige</th></tr></thead><tbody><tr><td>Elegir el plugin</td><td>Diseñador o PM</td></tr><tr><td>Adjuntar URL de Figma / captura / recursos locales</td><td>Diseñador</td></tr><tr><td>Elegir el sistema de marca</td><td>Diseñador o ingeniero de diseño</td></tr><tr><td>Generar el artefacto web</td><td>Claude Code, Cursor, Codex, Gemini CLI u otro agente detectado</td></tr><tr><td>Revisar IDs de sección, texto, densidad y comportamiento responsive</td><td>Una persona en la vista previa de Open Design</td></tr><tr><td>Exportar o entregar los archivos</td><td>La misma carpeta de proyecto local</td></tr></tbody></table>
      <p>El equipo sigue necesitando criterio: ahí vive el paso de revisión, y ningún plugin lo reemplaza. Lo que el plugin elimina es la re-explicación: las restricciones, el mapa de tokens y la ruta de salida dejan de ser conocimiento tribal y se convierten en un archivo del repositorio.</p>
      <h2>Qué hacer a continuación</h2>
      <p>Si tu equipo tiene una exportación de Figma, una sincronización de tokens, un kit de marca o una plantilla de presentación que vuelve una y otra vez, porta primero la porción repetible más pequeña. Empieza con un <code>SKILL.md</code>, añade <code>open-design.json</code>, adjunta el <code>DESIGN.md</code> de la marca, suelta un ejemplo real, valídalo y abre el PR antes de que el flujo de trabajo crezca hasta convertirse en una herramienta privada que nadie más puede reutilizar. El ejemplo de captura de pantalla a prototipo muestra la versión con forma de plugin de principio a fin: una skill portátil más un sidecar de Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Prueba este flujo de trabajo</a>.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: cómo funciona la biblioteca de Open Design</a> — las primitivas que envuelve un plugin</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a> — por qué el flujo de trabajo tiene forma de archivo en lugar de forma de cuenta</li>
      <li><a href="/blog/figma-alternative-open-design/">La alternativa de código abierto a Figma</a> — dónde aterriza portar tu flujo de trabajo en relación con el referente del sector</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flujo de trabajo de diseño BYOK: ejecuta Claude, Codex o Qwen con tu propia clave</a> — cómo el mismo plugin puede ejecutarse en la ruta de modelo que tu equipo ya confía</li>
      </ul>
  pt-br:
    title: "Como portar um fluxo do Figma para um plugin do Open Design"
    summary: "A thread do 0.8.0-preview pede aos contribuidores que portem fluxos de design antigos, um plugin por vez. Aqui está o caminho concreto para uma exportação do Figma, sincronização de tokens ou kit de marca."
    bodyHtml: |
      <p>Um fluxo do Figma normalmente começa como memória muscular: exporte estes frames, sincronize aqueles tokens, reconstrua aquele template de deck, entregue a especificação para a engenharia. É o tipo de trabalho que mora na cabeça de alguém e é reexplicado toda vez que um projeto novo começa.</p>
      <p>A thread do 0.8.0-preview faz um pedido mais afiado: porte essa memória muscular para um plugin. Não um painel parafusado num canvas. Não um script privado que só um time consegue rodar. Um fluxo reutilizável do Open Design que um agente possa pegar, executar, revisar e repassar pelo mesmo loop local-first de qualquer outra tarefa de design.</p>
      <p>Esta é a versão prática da <a href="https://github.com/nexu-io/open-design/discussions/1727">convocação de plugins do 0.8.0-preview</a>. Se o seu time tem um fluxo de design repetível hoje, este post mostra como é transformá-lo em uma contribuição em formato de plugin — que arquivos ele precisa, como o agente o pega e onde ele aterrissa depois de publicado.</p>
      <h2>O fluxo que vale a pena portar é menor do que você pensa</h2>
      <p>Não comece com “substituir o Figma.” Comece com um trabalho chato e repetível.</p>
      <p>Bons candidatos a primeiro plugin:</p>

























      <table><thead><tr><th>Fluxo atual</th><th>Versão em formato de plugin</th></tr></thead><tbody><tr><td>Exportar uma página de marketing do Figma e reconstruí-la em código</td><td>plugin <code>figma-migration</code> que extrai layout, mapeia tokens e gera um artefato web</td></tr><tr><td>Transformar um kit de marca em slides de lançamento todo mês</td><td>plugin de deck com um <code>SKILL.md</code>, ativos de exemplo e um design system travado</td></tr><tr><td>Criar o mesmo mockup de onboarding mobile para todo cliente</td><td>plugin de tela mobile com campos de entrada para público, tom, lista de recursos e plataforma</td></tr><tr><td>Converter uma especificação de componente em UI pronta para Storybook</td><td>plugin de migração de código que lê o repositório, mapeia componentes e escreve um diff revisável</td></tr></tbody></table>
      <p>A unidade não é o departamento de design inteiro. A unidade é um fluxo que alguém já repete duas vezes por semana. Se você não consegue descrevê-lo em uma única frase — “transforme X em Y, com estas restrições” — provavelmente são dois plugins, não um, e você deveria dividi-lo antes de escrever uma linha de Markdown.</p>
      <p>É por isso que a <a href="/blog/why-we-built-open-design-as-a-skill-layer/">camada de skills</a> do Open Design importa aqui. Um plugin não é uma extensão de runtime opaca. É uma pasta de arquivos: um contrato <code>SKILL.md</code>, design systems opcionais, exemplos opcionais e um sidecar <code>open-design.json</code> que diz ao Open Design como exibir e aplicar o fluxo. Não há formato binário entre você e as regras, o que significa que qualquer um pode ler o plugin, forká-lo ou consertá-lo depois.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Um frame de design sendo extraído de um canvas e largado dentro de uma caixa de módulo portátil, selecionado em uma moldura verde sobre um fundo editorial quase branco">
        <figcaption>Portar um fluxo significa tirar a parte repetível do canvas e colocá-la em um plugin portátil.</figcaption>
      </figure>
      <h2>O ângulo do Open Design é portabilidade</h2>
      <p>A especificação de plugins enuncia o contrato com clareza: o <code>SKILL.md</code> continua sendo o contrato executável do agente, enquanto o <code>open-design.json</code> adiciona metadados de marketplace, campos de entrada, padrões, prévias e ligação de contexto.</p>
      <p>Isso dá a um fluxo duas vidas. No Open Design, ele aparece como um plugin com prévia, entradas, proveniência e um caminho de “usar” em um clique. No Claude Code, Cursor, Codex, Gemini CLI, OpenClaw ou outro catálogo de skills, a mesma pasta ainda funciona como uma skill de agente comum, porque o comportamento central mora em Markdown. Você não está escrevendo para um runtime que vai ser descontinuado no ano que vem; está escrevendo um arquivo que um agente lê do mesmo jeito daqui a dois anos.</p>
      <p>O <a href="/blog/31-skills-72-systems-how-the-library-works/">passeio pela biblioteca</a> já explica as primitivas de base: skills, sistemas, adaptadores e o daemon. Plugins adicionam distribuição e repetibilidade em torno dessas primitivas — eles são a unidade que um time entrega, revisa e reutiliza, em vez da skill bruta que um agente por acaso descobre em disco.</p>
      <p>Para um fluxo de Figma-para-código, as superfícies normalmente parecem com isto:</p>





























      <table><thead><tr><th>Superfície</th><th>Arquivo concreto</th></tr></thead><tbody><tr><td>Comportamento do agente</td><td><code>SKILL.md</code></td></tr><tr><td>Metadados do Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Contrato de marca ou visual</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Saída de exemplo</td><td><code>example.html</code> ou <code>examples/{plugin-id}/example.html</code> dentro da pasta do plugin</td></tr><tr><td>Mídia de prévia</td><td><code>preview/poster.png</code> ou <code>preview/index.html</code> dentro da pasta do plugin</td></tr></tbody></table>
      <p>O resultado não é um gerador de screenshots. É um fluxo de agente reutilizável com um contrato visível — toda regra que o agente segue está na pasta onde um humano pode ler e editar.</p>
      <h2>Um caminho concreto de portabilidade</h2>
      <p>Aqui está o caminho mínimo para um plugin que porta um fluxo de landing-page do Figma. A coisa toda são seis passos, e a maioria é Markdown.</p>
      <h3>1. Nomeie o trabalho repetível</h3>
      <p>Anote a única frase que descreve o trabalho: “Transforme um frame de marketing do Figma em uma página Astro responsiva, no sistema de marca da casa, pronta para revisão.” Se você não consegue caber em uma frase, estreite até conseguir. O nome vira o id do seu plugin (<code>figma-workflow</code>) e o título exibido no marketplace.</p>
      <h3>2. Escreva o contrato da skill</h3>
      <p>O <code>SKILL.md</code> é o contrato executável que o agente lê. O front matter nomeia a skill e seu gatilho; o corpo é o briefing — formato de entrada, caminho de saída, restrições e um checklist de revisão que o agente deve aplicar a si mesmo antes de repassar.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Adicione o sidecar do Open Design</h3>
      <p>O <code>open-design.json</code> é o que transforma uma skill nua em um plugin de marketplace: título, descrição, entradas declaradas, prévia e repositório de origem. Esses são os metadados que dirigem o painel de “usar” e a linha de proveniência.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Anexe o design system</h3>
      <p>Se o fluxo depende de regras de marca, adicione um arquivo <code>DESIGN.md</code> dentro de <code>design-systems/</code> em vez de enterrar cor e tipografia na prosa. O agente ingere o sistema como um contrato — paleta OKLch, escala tipográfica, postura de layout — para que dez telas geradas ainda pareçam um único produto. Misturar sistemas no meio do projeto também funciona, porque são apenas texto.</p>
      <h3>5. Inclua um exemplo real</h3>
      <p>Salve um artefato gerado dentro de <code>examples/</code> para que os revisores possam julgar a saída, não só a promessa. Um <code>example.html</code> comprovadamente bom vale mais que um parágrafo de descrição; ele dá ao agente algo para fazer correspondência de padrões e dá a um mantenedor algo para aprovar.</p>
      <p>Juntando tudo, o plugin é uma única pasta legível:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Valide e empacote</h3>
      <p>Rode os comandos do plugin antes de abrir um PR. O caminho atual do CLI usa um id de plugin em minúsculas. Evite nomes de registro separados por barra na hora do scaffold; <code>od plugin scaffold</code> cria <code>&#x3C;out>/&#x3C;id>/...</code>, então os comandos seguintes apontam para aquela pasta gerada:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Quando o plugin estiver pronto para a revisão do registro, autentique-se pelo GitHub com <code>od plugin login</code> e <code>od plugin whoami --json</code>, depois siga a documentação de publicação para o caminho de revisão atual. O Open Design não armazena suas credenciais do GitHub.</p>
      <h2>Como isso fica em um time de design real</h2>
      <p>Imagine um pequeno time de produto com um frame do Figma para uma página de lançamento, um sistema de marca da casa e um ritmo mensal de releases.</p>
      <p>Antes do plugin, o fluxo é uma cadeia de repasses: o designer exporta frames, o engenheiro reconstrói o layout, o PM reescreve o texto, alguém checa o desvio de tokens, outra pessoa registra bugs. O trabalho é familiar, mas a memória mora nas pessoas — e vaza toda vez que alguém está fora, troca de time ou esquece a única restrição que importava.</p>
      <p>Depois do plugin, o fluxo vira um artefato executável:</p>

































      <table><thead><tr><th>Passo</th><th>Quem dirige</th></tr></thead><tbody><tr><td>Escolher o plugin</td><td>Designer ou PM</td></tr><tr><td>Anexar URL do Figma / screenshot / ativos locais</td><td>Designer</td></tr><tr><td>Escolher o sistema de marca</td><td>Designer ou design engineer</td></tr><tr><td>Gerar o artefato web</td><td>Claude Code, Cursor, Codex, Gemini CLI ou outro agente detectado</td></tr><tr><td>Revisar IDs de seção, texto, densidade e comportamento responsivo</td><td>Humano na prévia do Open Design</td></tr><tr><td>Exportar ou repassar arquivos</td><td>A mesma pasta de projeto local</td></tr></tbody></table>
      <p>O time ainda precisa de bom gosto — o passo de revisão é onde ele mora, e nenhum plugin o substitui. O que o plugin remove é o reexplicar: as restrições, o mapa de tokens e o caminho de saída deixam de ser conhecimento tribal e viram um arquivo no repositório.</p>
      <h2>O que fazer a seguir</h2>
      <p>Se o seu time tem uma exportação do Figma, sincronização de tokens, kit de marca ou template de deck que fica voltando, porte primeiro a menor fatia repetível. Comece com um <code>SKILL.md</code>, adicione <code>open-design.json</code>, anexe o <code>DESIGN.md</code> da marca, coloque um exemplo real, valide-o e abra o PR antes de o fluxo virar uma ferramenta privada que ninguém mais consegue reutilizar. O exemplo de screenshot-para-protótipo mostra a versão em formato de plugin de ponta a ponta: uma skill portátil mais um sidecar do Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Experimente este fluxo</a>.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: como funciona a biblioteca do Open Design</a> — as primitivas que um plugin embrulha</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a> — por que o fluxo tem formato de arquivo em vez de formato de conta</li>
      <li><a href="/blog/figma-alternative-open-design/">A alternativa open-source ao Figma</a> — onde portar seu fluxo aterrissa em relação ao incumbente</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Fluxo de design BYOK: rode Claude, Codex ou Qwen com sua própria chave</a> — como o mesmo plugin pode rodar no caminho de modelo em que seu time já confia</li>
      </ul>
  it:
    title: "Come portare un flusso di lavoro Figma in un plugin Open Design"
    summary: "Il thread 0.8.0-preview chiede ai contributori di portare i vecchi flussi di lavoro di design un plugin alla volta. Ecco il percorso concreto per un export Figma, una sincronizzazione di token o un brand kit."
    bodyHtml: |
      <p>Un flusso di lavoro Figma di solito inizia come memoria muscolare: esporta questi frame, sincronizza quei token, ricostruisci quel template di deck, consegna le specifiche all'ingegneria. È il tipo di lavoro che vive nella testa di qualcuno e viene rispiegato ogni volta che inizia un nuovo progetto.</p>
      <p>Il thread 0.8.0-preview fa una richiesta più netta: porta quella memoria muscolare in un plugin. Non un pannello bullonato su un canvas. Non uno script privato che solo un team può eseguire. Un flusso di lavoro Open Design riutilizzabile che un agente può raccogliere, eseguire, rivedere e passare avanti attraverso lo stesso ciclo local-first di qualsiasi altra attività di design.</p>
      <p>Questa è la versione pratica della <a href="https://github.com/nexu-io/open-design/discussions/1727">chiamata ai plugin di 0.8.0-preview</a>. Se il tuo team ha oggi un flusso di lavoro di design ripetibile, questo articolo mostra cosa significa trasformarlo in un contributo a forma di plugin: di quali file ha bisogno, come l'agente lo raccoglie e dove finisce una volta pubblicato.</p>
      <h2>Il flusso di lavoro che vale la pena portare è più piccolo di quanto pensi</h2>
      <p>Non iniziare con "sostituisci Figma". Inizia con un singolo lavoro fastidioso e ripetibile.</p>
      <p>Buoni candidati per un primo plugin:</p>




      <table><thead><tr><th>Flusso di lavoro attuale</th><th>Versione a forma di plugin</th></tr></thead><tbody><tr><td>Esporta una pagina marketing Figma e ricostruiscila in codice</td><td>Plugin <code>figma-migration</code> che estrae il layout, mappa i token e genera un artefatto web</td></tr><tr><td>Trasforma un brand kit in slide di lancio ogni mese</td><td>Plugin di deck con un <code>SKILL.md</code>, asset di esempio e un design system bloccato</td></tr><tr><td>Crea lo stesso mockup di onboarding mobile per ogni cliente</td><td>Plugin per schermate mobile con campi di input per pubblico, tono, elenco di funzionalità e piattaforma</td></tr><tr><td>Converti una specifica di componenti in UI pronta per Storybook</td><td>Plugin di migrazione del codice che legge il repository, mappa i componenti e scrive un diff revisionabile</td></tr></tbody></table>
      <p>L'unità non è l'intero reparto di design. L'unità è un flusso di lavoro che qualcuno già ripete due volte a settimana. Se non riesci a descriverlo in una singola frase — "trasforma X in Y, con questi vincoli" — probabilmente sono due plugin, non uno, e dovresti dividerlo prima di scrivere una riga di Markdown.</p>
      <p>Ecco perché il <a href="/blog/why-we-built-open-design-as-a-skill-layer/">livello di skill</a> di Open Design conta qui. Un plugin non è un'estensione di runtime opaca. È una cartella di file: un contratto <code>SKILL.md</code>, design system opzionali, esempi opzionali e un file laterale <code>open-design.json</code> che dice a Open Design come visualizzare e applicare il flusso di lavoro. Non c'è alcun formato binario tra te e le regole, il che significa che chiunque può leggere il plugin, forkarlo o correggerlo in seguito.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Un frame di design che viene estratto da un canvas e inserito in una scatola modulare portabile, selezionato in una cornice verde su uno sfondo editoriale quasi bianco">
        <figcaption>Portare un flusso di lavoro significa sollevare la parte ripetibile dal canvas e metterla in un plugin portabile.</figcaption>
      </figure>
      <h2>L'angolazione di Open Design è la portabilità</h2>
      <p>La specifica del plugin enuncia il contratto in modo chiaro: <code>SKILL.md</code> rimane il contratto eseguibile dell'agente, mentre <code>open-design.json</code> aggiunge metadati per il marketplace, campi di input, valori predefiniti, anteprime e collegamento del contesto.</p>
      <p>Questo dà a un flusso di lavoro due vite. In Open Design, appare come un plugin con anteprima, input, provenienza e un percorso "usa" con un clic. In Claude Code, Cursor, Codex, Gemini CLI, OpenClaw o un altro catalogo di skill, la stessa cartella funziona ancora come una semplice skill di agente perché il comportamento principale vive in Markdown. Non stai scrivendo per un runtime che verrà deprecato l'anno prossimo; stai scrivendo un file che un agente leggerà allo stesso modo tra due anni.</p>
      <p>La <a href="/blog/31-skills-72-systems-how-the-library-works/">panoramica della libreria</a> spiega già le primitive di base: skill, sistemi, adattatori e il daemon. I plugin aggiungono distribuzione e ripetibilità attorno a quelle primitive: sono l'unità che un team rilascia, rivede e riutilizza, anziché la skill grezza che un agente capita di scoprire su disco.</p>
      <p>Per un flusso di lavoro da Figma a codice, le superfici di solito si presentano così:</p>




      <table><thead><tr><th>Superficie</th><th>File concreto</th></tr></thead><tbody><tr><td>Comportamento dell'agente</td><td><code>SKILL.md</code></td></tr><tr><td>Metadati di Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Contratto di brand o visivo</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Output di esempio</td><td><code>example.html</code> o <code>examples/{plugin-id}/example.html</code> dentro la cartella del plugin</td></tr><tr><td>Media di anteprima</td><td><code>preview/poster.png</code> o <code>preview/index.html</code> dentro la cartella del plugin</td></tr></tbody></table>
      <p>Il risultato non è un generatore di screenshot. È un flusso di lavoro di agente riutilizzabile con un contratto visibile: ogni regola che l'agente segue è nella cartella dove un umano può leggerla e modificarla.</p>
      <h2>Un percorso di porting concreto</h2>
      <p>Ecco il percorso minimo per un plugin che porta un flusso di lavoro Figma per landing page. L'intera cosa è sei passi, e la maggior parte di essi è Markdown.</p>
      <h3>1. Nomina il lavoro ripetibile</h3>
      <p>Scrivi la singola frase che descrive il lavoro: "Trasforma un frame marketing Figma in una pagina Astro responsive, nel sistema di brand interno, pronta per la revisione." Se non riesci a farlo stare in una frase, restringilo finché non ci riesci. Il nome diventa l'id del tuo plugin (<code>figma-workflow</code>) e il titolo mostrato nel marketplace.</p>
      <h3>2. Scrivi il contratto della skill</h3>
      <p><code>SKILL.md</code> è il contratto eseguibile che l'agente legge. Il front matter nomina la skill e il suo trigger; il corpo è il brief: forma dell'input, percorso dell'output, vincoli e una checklist di revisione che l'agente dovrebbe auto-applicare prima di passare il lavoro.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Aggiungi il file laterale di Open Design</h3>
      <p><code>open-design.json</code> è ciò che trasforma una skill nuda in un plugin di marketplace: titolo, descrizione, input dichiarati, anteprima e repository sorgente. Questi sono i metadati che guidano il pannello "usa" e la riga di provenienza.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Collega il design system</h3>
      <p>Se il flusso di lavoro dipende da regole di brand, aggiungi un file <code>DESIGN.md</code> sotto <code>design-systems/</code> invece di seppellire colore e tipografia nella prosa. L'agente ingerisce il sistema come un contratto — palette OKLch, scala tipografica, postura del layout — così dieci schermate generate sembrano ancora un unico prodotto. Anche mescolare sistemi a metà progetto funziona, perché sono solo testo.</p>
      <h3>5. Includi un esempio reale</h3>
      <p>Salva un artefatto generato sotto <code>examples/</code> così i revisori possono giudicare l'output, non solo la promessa. Un singolo <code>example.html</code> noto come valido vale più di un paragrafo di descrizione; dà all'agente qualcosa su cui fare pattern-matching e dà a un maintainer qualcosa da approvare.</p>
      <p>Messo insieme, il plugin è una singola cartella leggibile:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Valida e impacchetta</h3>
      <p>Esegui i comandi del plugin prima di aprire una PR. L'attuale percorso della CLI usa un id di plugin in minuscolo. Evita nomi di registro separati da slash al momento dello scaffold; <code>od plugin scaffold</code> crea <code>&#x3C;out>/&#x3C;id>/...</code>, quindi i comandi successivi puntano a quella cartella generata:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Quando il plugin è pronto per la revisione del registro, autenticati tramite GitHub con <code>od plugin login</code> e <code>od plugin whoami --json</code>, poi segui la documentazione di pubblicazione per l'attuale percorso di revisione. Open Design non memorizza le tue credenziali GitHub.</p>
      <h2>Come appare questo in un vero team di design</h2>
      <p>Immagina un piccolo team di prodotto con un frame Figma per una pagina di lancio, un sistema di brand interno e un ritmo di rilascio mensile.</p>
      <p>Prima del plugin, il flusso di lavoro è una catena di passaggi di consegna: il designer esporta i frame, l'ingegnere ricostruisce il layout, il PM riscrive i testi, qualcuno controlla la deriva dei token, qualcun altro segnala i bug. Il lavoro è familiare, ma la memoria vive nelle persone, e si disperde ogni volta che qualcuno è assente, cambia team o dimentica l'unico vincolo che contava.</p>
      <p>Dopo il plugin, il flusso di lavoro diventa un artefatto eseguibile:</p>




      <table><thead><tr><th>Passo</th><th>Chi lo dirige</th></tr></thead><tbody><tr><td>Scegli il plugin</td><td>Designer o PM</td></tr><tr><td>Allega URL Figma / screenshot / asset locali</td><td>Designer</td></tr><tr><td>Scegli il design system</td><td>Designer o design engineer</td></tr><tr><td>Genera l'artefatto web</td><td>Claude Code, Cursor, Codex, Gemini CLI o un altro agente rilevato</td></tr><tr><td>Rivedi ID di sezione, testi, densità e comportamento responsive</td><td>Umano nell'anteprima di Open Design</td></tr><tr><td>Esporta o consegna i file</td><td>La stessa cartella di progetto locale</td></tr></tbody></table>
      <p>Il team ha ancora bisogno del gusto: il passo di revisione è dove vive, e nessun plugin lo sostituisce. Ciò che il plugin rimuove è il rispiegare: i vincoli, la mappa dei token e il percorso dell'output smettono di essere conoscenza tribale e diventano un file nel repository.</p>
      <h2>Cosa fare dopo</h2>
      <p>Se il tuo team ha un export Figma, una sincronizzazione di token, un brand kit o un template di deck che continua a tornare, porta prima la fetta ripetibile più piccola. Inizia con un <code>SKILL.md</code>, aggiungi <code>open-design.json</code>, collega il <code>DESIGN.md</code> del brand, inserisci un esempio reale, validalo e apri la PR prima che il flusso di lavoro cresca fino a diventare uno strumento privato che nessun altro può riutilizzare. L'esempio da screenshot a prototipo mostra la versione a forma di plugin dall'inizio alla fine: una skill portabile più un file laterale di Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Prova questo flusso di lavoro</a>.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistemi: come funziona la libreria di Open Design</a>: le primitive che un plugin avvolge</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>: perché il flusso di lavoro ha la forma di un file invece che di un account</li>
      <li><a href="/blog/figma-alternative-open-design/">L'alternativa open-source a Figma</a>: dove finisce il porting del tuo flusso di lavoro rispetto al leader di mercato</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flusso di lavoro di design BYOK: usa Claude, Codex o Qwen con la tua chiave</a>: come lo stesso plugin può girare sul percorso del modello di cui il tuo team già si fida</li>
      </ul>
  vi:
    title: "Cách chuyển một quy trình Figma thành một plugin Open Design"
    summary: "Luồng 0.8.0-preview kêu gọi cộng đồng đóng góp chuyển các quy trình thiết kế cũ sang, mỗi lần một plugin. Đây là con đường cụ thể cho một export Figma, đồng bộ token, hay brand kit."
    bodyHtml: |
      <p>Một quy trình Figma thường bắt đầu như trí nhớ cơ bắp: export những frame này, đồng bộ những token kia, dựng lại template slide đó, giao spec cho kỹ thuật. Đó là loại công việc nằm trong đầu ai đó và bị giải thích lại mỗi lần một dự án mới bắt đầu.</p>
      <p>Luồng 0.8.0-preview đưa ra một yêu cầu sắc bén hơn: chuyển cái trí nhớ cơ bắp đó thành một plugin. Không phải một panel gắn bừa lên một canvas. Không phải một script riêng tư chỉ một đội chạy được. Một quy trình Open Design có thể tái sử dụng mà một agent có thể cầm lên, thực thi, rà soát và bàn giao qua cùng một vòng lặp ưu tiên cục bộ như bất kỳ tác vụ thiết kế nào khác.</p>
      <p>Đây là phiên bản thực hành của <a href="https://github.com/nexu-io/open-design/discussions/1727">lời kêu gọi plugin của 0.8.0-preview</a>. Nếu đội của bạn hôm nay có một quy trình thiết kế có thể lặp lại, bài viết này cho thấy việc biến nó thành một đóng góp dạng plugin trông như thế nào — nó cần những tệp gì, agent cầm nó lên ra sao, và nó đáp xuống đâu một khi được xuất bản.</p>
      <h2>Quy trình đáng chuyển nhỏ hơn bạn nghĩ</h2>
      <p>Đừng bắt đầu với “thay thế Figma.” Hãy bắt đầu với một công việc phiền phức, có thể lặp lại.</p>
      <p>Các ứng viên plugin đầu tiên tốt:</p>




















      <table><thead><tr><th>Quy trình hiện tại</th><th>Phiên bản dạng plugin</th></tr></thead><tbody><tr><td>Export một trang marketing Figma và dựng lại bằng mã</td><td>plugin <code>figma-migration</code> trích xuất bố cục, ánh xạ token, và tạo ra một artifact web</td></tr><tr><td>Biến một brand kit thành slide ra mắt mỗi tháng</td><td>Plugin slide với một <code>SKILL.md</code>, tài sản ví dụ, và một design system đã chốt</td></tr><tr><td>Tạo cùng một mockup onboarding di động cho mọi khách hàng</td><td>Plugin màn hình di động với các trường nhập cho đối tượng, tông giọng, danh sách tính năng và nền tảng</td></tr><tr><td>Chuyển một spec component thành UI sẵn sàng cho Storybook</td><td>Plugin chuyển đổi mã đọc repo, ánh xạ các component, và viết ra một diff có thể rà soát</td></tr></tbody></table>
      <p>Đơn vị không phải là cả phòng thiết kế. Đơn vị là một quy trình mà ai đó đã lặp lại hai lần mỗi tuần. Nếu bạn không thể mô tả nó trong một câu duy nhất — “biến X thành Y, với những ràng buộc này” — thì có lẽ nó là hai plugin, không phải một, và bạn nên tách nó ra trước khi viết một dòng Markdown.</p>
      <p>Đó là lý do <a href="/blog/why-we-built-open-design-as-a-skill-layer/">lớp skill</a> của Open Design quan trọng ở đây. Một plugin không phải là một phần mở rộng runtime mờ đục. Nó là một thư mục các tệp: một hợp đồng <code>SKILL.md</code>, các design system tùy chọn, các ví dụ tùy chọn, và một tệp đi kèm <code>open-design.json</code> nói cho Open Design biết cách hiển thị và áp dụng quy trình. Không có định dạng nhị phân nào giữa bạn và các quy tắc, nghĩa là bất kỳ ai cũng có thể đọc plugin, fork nó, hoặc sửa nó sau này.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Một frame thiết kế đang được trích xuất từ một canvas và thả vào một hộp module di động, được chọn trong khung xanh lá trên nền biên tập gần như trắng">
        <figcaption>Chuyển một quy trình nghĩa là nhấc phần có thể lặp lại ra khỏi canvas và đưa vào một plugin di động.</figcaption>
      </figure>
      <h2>Góc nhìn Open Design là tính di động</h2>
      <p>Đặc tả plugin nêu hợp đồng một cách thẳng thắn: <code>SKILL.md</code> vẫn là hợp đồng agent thực thi được, còn <code>open-design.json</code> thêm metadata cho marketplace, các trường nhập, giá trị mặc định, bản xem trước, và việc nối ngữ cảnh.</p>
      <p>Điều đó cho một quy trình hai cuộc đời. Trong Open Design, nó xuất hiện như một plugin với bản xem trước, đầu vào, nguồn gốc, và một đường “dùng” chỉ một cú nhấp. Trong Claude Code, Cursor, Codex, Gemini CLI, OpenClaw, hay một danh mục skill khác, cùng thư mục đó vẫn hoạt động như một skill agent thuần vì hành vi cốt lõi nằm trong Markdown. Bạn không viết cho một runtime sẽ bị loại bỏ vào năm sau; bạn đang viết một tệp mà một agent đọc theo cùng một cách hai năm sau.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">Chuyến dạo qua thư viện</a> đã giải thích các nguyên tố cơ sở: skill, system, adapter và daemon. Plugin thêm khả năng phân phối và lặp lại quanh các nguyên tố đó — chúng là đơn vị mà một đội ship, rà soát và tái sử dụng, thay vì cái skill thô mà một agent tình cờ khám phá trên đĩa.</p>
      <p>Với một quy trình Figma-sang-mã, các bề mặt thường trông như thế này:</p>


























      <table><thead><tr><th>Bề mặt</th><th>Tệp cụ thể</th></tr></thead><tbody><tr><td>Hành vi agent</td><td><code>SKILL.md</code></td></tr><tr><td>Metadata Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Hợp đồng thương hiệu hoặc thị giác</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Đầu ra ví dụ</td><td><code>example.html</code> hoặc <code>examples/{plugin-id}/example.html</code> bên trong thư mục plugin</td></tr><tr><td>Media xem trước</td><td><code>preview/poster.png</code> hoặc <code>preview/index.html</code> bên trong thư mục plugin</td></tr></tbody></table>
      <p>Kết quả không phải là một trình tạo ảnh chụp màn hình. Nó là một quy trình agent có thể tái sử dụng với một hợp đồng nhìn thấy được — mọi quy tắc agent tuân theo đều nằm trong thư mục nơi một con người có thể đọc và sửa.</p>
      <h2>Một con đường chuyển đổi cụ thể</h2>
      <p>Đây là con đường tối thiểu cho một plugin chuyển một quy trình landing-page Figma. Toàn bộ là sáu bước, và hầu hết chúng là Markdown.</p>
      <h3>1. Đặt tên cho công việc có thể lặp lại</h3>
      <p>Viết ra câu duy nhất mô tả công việc: “Biến một frame marketing Figma thành một trang Astro responsive, trong system thương hiệu của nhà, sẵn sàng rà soát.” Nếu bạn không thể gói nó vào một câu, hãy thu hẹp cho đến khi được. Cái tên trở thành plugin id của bạn (<code>figma-workflow</code>) và tiêu đề hiển thị trong marketplace.</p>
      <h3>2. Viết hợp đồng skill</h3>
      <p><code>SKILL.md</code> là hợp đồng thực thi mà agent đọc. Front matter đặt tên skill và trigger của nó; phần thân là brief — dạng đầu vào, đường đầu ra, các ràng buộc, và một danh sách kiểm tra rà soát mà agent nên tự áp dụng trước khi bàn giao.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Thêm tệp đi kèm Open Design</h3>
      <p><code>open-design.json</code> là cái biến một skill trơ thành một plugin marketplace: tiêu đề, mô tả, các đầu vào được khai báo, bản xem trước, và repo nguồn. Đây là metadata điều khiển panel “dùng” và dòng nguồn gốc.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Gắn design system</h3>
      <p>Nếu quy trình phụ thuộc vào các quy tắc thương hiệu, hãy thêm một tệp <code>DESIGN.md</code> dưới <code>design-systems/</code> thay vì chôn màu sắc và kiểu chữ trong văn xuôi. Agent tiêu hóa system như một hợp đồng — bảng màu OKLch, thang kích cỡ chữ, tư thế bố cục — nên mười màn hình được tạo ra vẫn cảm giác như một sản phẩm. Trộn các system giữa chừng dự án cũng được, vì chúng chỉ là văn bản.</p>
      <h3>5. Bao gồm một ví dụ thực</h3>
      <p>Lưu một artifact đã được tạo dưới <code>examples/</code> để người rà soát có thể phán xét đầu ra, không chỉ lời hứa. Một <code>example.html</code> đã biết là tốt đáng giá hơn một đoạn mô tả; nó cho agent thứ gì đó để đối chiếu mẫu và cho người bảo trì thứ gì đó để phê duyệt.</p>
      <p>Gộp lại, plugin là một thư mục duy nhất, dễ đọc:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Kiểm định và đóng gói</h3>
      <p>Chạy các lệnh plugin trước khi mở một PR. Đường CLI hiện tại dùng một plugin id viết thường. Tránh các tên registry phân tách bằng dấu gạch chéo lúc scaffold; <code>od plugin scaffold</code> tạo ra <code>&#x3C;out>/&#x3C;id>/...</code>, nên các lệnh tiếp theo trỏ vào thư mục được tạo đó:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Khi plugin sẵn sàng cho việc rà soát registry, hãy xác thực qua GitHub bằng <code>od plugin login</code> và <code>od plugin whoami --json</code>, rồi làm theo tài liệu xuất bản cho đường rà soát hiện tại. Open Design không lưu trữ thông tin đăng nhập GitHub của bạn.</p>
      <h2>Việc này trông như thế nào trong một đội thiết kế thực</h2>
      <p>Hãy hình dung một đội sản phẩm nhỏ với một frame Figma cho một trang ra mắt, một system thương hiệu của nhà, và một nhịp phát hành hằng tháng.</p>
      <p>Trước plugin, quy trình là một chuỗi bàn giao: nhà thiết kế export frame, kỹ sư dựng lại bố cục, PM viết lại nội dung, ai đó kiểm tra độ trôi token, ai đó khác mở bug. Công việc thì quen thuộc, nhưng trí nhớ nằm trong con người — và nó rò rỉ mỗi lần ai đó vắng, đổi đội, hoặc quên mất cái ràng buộc duy nhất quan trọng.</p>
      <p>Sau plugin, quy trình trở thành một artifact chạy được:</p>




























      <table><thead><tr><th>Bước</th><th>Ai điều hướng</th></tr></thead><tbody><tr><td>Chọn plugin</td><td>Nhà thiết kế hoặc PM</td></tr><tr><td>Gắn URL Figma / ảnh chụp màn hình / tài sản cục bộ</td><td>Nhà thiết kế</td></tr><tr><td>Chọn system thương hiệu</td><td>Nhà thiết kế hoặc kỹ sư thiết kế</td></tr><tr><td>Tạo artifact web</td><td>Claude Code, Cursor, Codex, Gemini CLI, hoặc một agent khác được phát hiện</td></tr><tr><td>Rà soát ID section, nội dung, mật độ, và hành vi responsive</td><td>Con người trong bản xem trước Open Design</td></tr><tr><td>Export hoặc bàn giao tệp</td><td>Cùng thư mục dự án cục bộ</td></tr></tbody></table>
      <p>Đội vẫn cần gu thẩm mỹ — bước rà soát là nơi nó cư ngụ, và không plugin nào thay thế nó. Cái plugin loại bỏ là việc giải thích lại: các ràng buộc, bản đồ token, và đường đầu ra thôi là tri thức bộ lạc và trở thành một tệp trong repo.</p>
      <h2>Làm gì tiếp theo</h2>
      <p>Nếu đội của bạn có một export Figma, đồng bộ token, brand kit, hay template slide cứ quay lại, hãy chuyển lát cắt có thể lặp lại nhỏ nhất trước. Bắt đầu với một <code>SKILL.md</code>, thêm <code>open-design.json</code>, gắn <code>DESIGN.md</code> thương hiệu, thả vào một ví dụ thực, kiểm định nó, và mở PR trước khi quy trình lớn thành một công cụ riêng tư không ai khác tái sử dụng được. Ví dụ ảnh-chụp-thành-prototype cho thấy phiên bản dạng plugin từ đầu đến cuối: một skill di động cộng với một tệp đi kèm Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Thử quy trình này</a>.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 system: thư viện Open Design hoạt động ra sao</a> — các nguyên tố mà một plugin bọc lại</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> — vì sao quy trình có dạng tệp thay vì dạng tài khoản</li>
      <li><a href="/blog/figma-alternative-open-design/">Giải pháp thay thế mã nguồn mở cho Figma</a> — nơi việc chuyển quy trình của bạn đáp xuống so với kẻ đương nhiệm</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Quy trình thiết kế BYOK: chạy Claude, Codex hay Qwen bằng key của riêng bạn</a> — cách cùng plugin đó có thể chạy trên đường model mà đội của bạn đã tin tưởng</li>
      </ul>
  pl:
    title: "Jak przenieść workflow z Figma do wtyczki Open Design"
    summary: "Wątek 0.8.0-preview prosi kontrybutorów o przenoszenie starych workflow projektowych po jednej wtyczce naraz. Oto konkretna ścieżka dla eksportu z Figma, synchronizacji tokenów lub zestawu marki."
    bodyHtml: |
      <p>Workflow w Figma zwykle zaczyna się jako pamięć mięśniowa: wyeksportuj te ramki, zsynchronizuj te tokeny, odbuduj ten szablon prezentacji, przekaż specyfikację inżynierii. To rodzaj pracy, który żyje w czyjejś głowie i jest na nowo tłumaczony za każdym razem, gdy startuje nowy projekt.</p>
      <p>Wątek 0.8.0-preview stawia ostrzejszą prośbę: przenieś tę pamięć mięśniową do wtyczki. Nie panel przykręcony do płótna. Nie prywatny skrypt, który może uruchomić tylko jeden zespół. Reużywalny workflow Open Design, który agent może podnieść, wykonać, zrecenzować i przekazać przez tę samą lokalną pętlę co każde inne zadanie projektowe.</p>
      <p>To praktyczna wersja <a href="https://github.com/nexu-io/open-design/discussions/1727">wezwania do wtyczek 0.8.0-preview</a>. Jeśli Twój zespół ma dziś jeden powtarzalny workflow projektowy, ten wpis pokazuje, jak wygląda zamiana go w kontrybucję o kształcie wtyczki — jakich plików potrzebuje, jak agent go podnosi i gdzie ląduje po opublikowaniu.</p>
      <h2>Workflow wart przeniesienia jest mniejszy, niż myślisz</h2>
      <p>Nie zaczynaj od „zastąp Figma”. Zacznij od jednej irytującej, powtarzalnej roboty.</p>
      <p>Dobrzy kandydaci na pierwszą wtyczkę:</p>

























      <table><thead><tr><th>Obecny workflow</th><th>Wersja o kształcie wtyczki</th></tr></thead><tbody><tr><td>Wyeksportuj marketingową stronę z Figma i odbuduj ją w kodzie</td><td>Wtyczka <code>figma-migration</code>, która wyciąga układ, mapuje tokeny i generuje artefakt webowy</td></tr><tr><td>Co miesiąc zamieniaj zestaw marki w slajdy premierowe</td><td>Wtyczka prezentacji z <code>SKILL.md</code>, przykładowymi zasobami i zablokowanym systemem projektowym</td></tr><tr><td>Twórz tę samą mobilną makietę onboardingu dla każdego klienta</td><td>Wtyczka ekranów mobilnych z polami wejściowymi na odbiorców, ton, listę funkcji i platformę</td></tr><tr><td>Przekształć specyfikację komponentu w UI gotowe do Storybooka</td><td>Wtyczka migracji kodu, która czyta repozytorium, mapuje komponenty i pisze recenzowalny diff</td></tr></tbody></table>
      <p>Jednostką nie jest cały dział projektowy. Jednostką jest jeden workflow, który ktoś już powtarza dwa razy w tygodniu. Jeśli nie umiesz opisać go w jednym zdaniu — „zamień X na Y, z tymi ograniczeniami” — to prawdopodobnie są to dwie wtyczki, a nie jedna, i powinieneś je rozdzielić, zanim napiszesz linijkę Markdown.</p>
      <p>Dlatego <a href="/blog/why-we-built-open-design-as-a-skill-layer/">warstwa umiejętności</a> Open Design ma tu znaczenie. Wtyczka nie jest nieprzejrzystym rozszerzeniem środowiska uruchomieniowego. To folder plików: kontrakt <code>SKILL.md</code>, opcjonalne systemy projektowe, opcjonalne przykłady i plik towarzyszący <code>open-design.json</code>, który mówi Open Design, jak wyświetlać i stosować workflow. Nie ma formatu binarnego między Tobą a regułami, co oznacza, że każdy może przeczytać wtyczkę, sforkować ją lub później naprawić.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Ramka projektowa wyciągana z płótna i upuszczana do przenośnego pudełka modułu, zaznaczona zieloną ramką na niemal białym, redakcyjnym tle">
        <figcaption>Przeniesienie workflow oznacza wyjęcie powtarzalnej części z płótna i przeniesienie jej do przenośnej wtyczki.</figcaption>
      </figure>
      <h2>Perspektywa Open Design to przenośność</h2>
      <p>Specyfikacja wtyczki podaje kontrakt wprost: <code>SKILL.md</code> pozostaje wykonywalnym kontraktem agenta, podczas gdy <code>open-design.json</code> dodaje metadane marketplace, pola wejściowe, wartości domyślne, podglądy i podłączenie kontekstu.</p>
      <p>To daje jednemu workflow dwa życia. W Open Design pojawia się jako wtyczka z podglądem, wejściami, pochodzeniem i ścieżką „użyj” jednym kliknięciem. W Claude Code, Cursor, Codex, Gemini CLI, OpenClaw lub innym katalogu umiejętności ten sam folder wciąż działa jako zwykła umiejętność agenta, bo główne zachowanie żyje w Markdown. Nie piszesz dla środowiska uruchomieniowego, które zostanie wycofane w przyszłym roku; piszesz plik, który agent przeczyta tak samo za dwa lata.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">Przewodnik po bibliotece</a> już wyjaśnia prymitywy bazowe: umiejętności, systemy, adaptery i daemon. Wtyczki dodają wokół tych prymitywów dystrybucję i powtarzalność — to jednostka, którą zespół wypuszcza, recenzuje i reużywa, a nie surowa umiejętność, na którą agent przypadkiem natrafia na dysku.</p>
      <p>Dla workflow Figma-do-kodu powierzchnie zwykle wyglądają tak:</p>





























      <table><thead><tr><th>Powierzchnia</th><th>Konkretny plik</th></tr></thead><tbody><tr><td>Zachowanie agenta</td><td><code>SKILL.md</code></td></tr><tr><td>Metadane Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Kontrakt marki lub wizualny</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Przykładowe wyjście</td><td><code>example.html</code> lub <code>examples/{plugin-id}/example.html</code> wewnątrz folderu wtyczki</td></tr><tr><td>Media podglądu</td><td><code>preview/poster.png</code> lub <code>preview/index.html</code> wewnątrz folderu wtyczki</td></tr></tbody></table>
      <p>Efektem nie jest generator zrzutów ekranu. To reużywalny workflow agenta z widocznym kontraktem — każda reguła, którą agent stosuje, leży w folderze, gdzie człowiek może ją przeczytać i edytować.</p>
      <h2>Konkretna ścieżka przenoszenia</h2>
      <p>Oto minimalna ścieżka dla wtyczki, która przenosi jeden workflow landing page'a z Figma. Całość to sześć kroków, a większość z nich to Markdown.</p>
      <h3>1. Nazwij powtarzalną robotę</h3>
      <p>Zapisz jedno zdanie opisujące robotę: „Zamień jedną marketingową ramkę z Figma w responsywną stronę Astro, w firmowym systemie marki, gotową do recenzji”. Jeśli nie mieścisz się w zdaniu, zawężaj, aż się zmieścisz. Nazwa staje się id Twojej wtyczki (<code>figma-workflow</code>) i tytułem pokazywanym w marketplace.</p>
      <h3>2. Napisz kontrakt umiejętności</h3>
      <p><code>SKILL.md</code> to wykonywalny kontrakt, który czyta agent. Front matter nazywa umiejętność i jej wyzwalacz; treść to brief — kształt wejścia, ścieżka wyjścia, ograniczenia i lista kontrolna recenzji, którą agent powinien sam zastosować przed przekazaniem.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Dodaj plik towarzyszący Open Design</h3>
      <p><code>open-design.json</code> to to, co zamienia gołą umiejętność we wtyczkę marketplace: tytuł, opis, zadeklarowane wejścia, podgląd i repozytorium źródłowe. To metadane, które napędzają panel „użyj” i linię pochodzenia.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Podłącz system projektowy</h3>
      <p>Jeśli workflow zależy od reguł marki, dodaj plik <code>DESIGN.md</code> w <code>design-systems/</code> zamiast zakopywać kolor i typografię w prozie. Agent przyjmuje system jako kontrakt — paleta OKLch, drabina typograficzna, postawa układu — więc dziesięć wygenerowanych ekranów wciąż wygląda jak jeden produkt. Miksowanie systemów w trakcie projektu też działa, bo to po prostu tekst.</p>
      <h3>5. Dołącz jeden prawdziwy przykład</h3>
      <p>Zapisz wygenerowany artefakt w <code>examples/</code>, żeby recenzenci mogli ocenić wyjście, a nie tylko obietnicę. Jeden znany dobry <code>example.html</code> jest wart więcej niż akapit opisu; daje agentowi coś do dopasowania wzorca, a maintainerowi coś do zatwierdzenia.</p>
      <p>Złożona razem wtyczka to pojedynczy, czytelny folder:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Zwaliduj i spakuj</h3>
      <p>Uruchom polecenia wtyczki przed otwarciem PR. Obecna ścieżka CLI używa id wtyczki pisanego małymi literami. Unikaj nazw rejestru rozdzielonych ukośnikami na etapie szkieletu; <code>od plugin scaffold</code> tworzy <code>&#x3C;out>/&#x3C;id>/...</code>, więc kolejne polecenia wskazują na ten wygenerowany folder:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Gdy wtyczka jest gotowa do recenzji rejestru, uwierzytelnij się przez GitHub poleceniami <code>od plugin login</code> i <code>od plugin whoami --json</code>, a następnie postępuj zgodnie z dokumentacją publikowania dla bieżącej ścieżki recenzji. Open Design nie przechowuje Twoich danych uwierzytelniających GitHub.</p>
      <h2>Jak to wygląda w prawdziwym zespole projektowym</h2>
      <p>Wyobraź sobie mały zespół produktowy z ramką Figma na stronę premierową, firmowym systemem marki i miesięcznym rytmem wydań.</p>
      <p>Przed wtyczką workflow to łańcuch przekazań: projektant eksportuje ramki, inżynier odbudowuje układ, PM przepisuje teksty, ktoś sprawdza dryf tokenów, ktoś inny zgłasza błędy. Praca jest znajoma, ale pamięć żyje w ludziach — i wycieka za każdym razem, gdy ktoś jest nieobecny, zmienia zespół albo zapomina o jednym ograniczeniu, które miało znaczenie.</p>
      <p>Po wtyczce workflow staje się uruchamialnym artefaktem:</p>

































      <table><thead><tr><th>Krok</th><th>Kto nim kieruje</th></tr></thead><tbody><tr><td>Wybierz wtyczkę</td><td>Projektant lub PM</td></tr><tr><td>Podłącz URL Figma / zrzut ekranu / lokalne zasoby</td><td>Projektant</td></tr><tr><td>Wybierz system marki</td><td>Projektant lub inżynier projektowy</td></tr><tr><td>Wygeneruj artefakt webowy</td><td>Claude Code, Cursor, Codex, Gemini CLI lub inny wykryty agent</td></tr><tr><td>Zrecenzuj ID sekcji, teksty, gęstość i zachowanie responsywne</td><td>Człowiek w podglądzie Open Design</td></tr><tr><td>Wyeksportuj lub przekaż pliki</td><td>Ten sam lokalny folder projektu</td></tr></tbody></table>
      <p>Zespół wciąż potrzebuje gustu — krok recenzji to miejsce, w którym on żyje, i żadna wtyczka go nie zastąpi. To, co wtyczka usuwa, to ponowne tłumaczenie: ograniczenia, mapa tokenów i ścieżka wyjścia przestają być wiedzą plemienną i stają się plikiem w repozytorium.</p>
      <h2>Co robić dalej</h2>
      <p>Jeśli Twój zespół ma eksport z Figma, synchronizację tokenów, zestaw marki lub szablon prezentacji, który wciąż wraca, przenieś najpierw najmniejszy powtarzalny wycinek. Zacznij od <code>SKILL.md</code>, dodaj <code>open-design.json</code>, podłącz markowy <code>DESIGN.md</code>, wrzuć jeden prawdziwy przykład, zwaliduj go i otwórz PR, zanim workflow urośnie w prywatne narzędzie, którego nikt inny nie może reużyć. Przykład zrzut-ekranu-do-prototypu pokazuje wersję o kształcie wtyczki od początku do końca: przenośna umiejętność plus plik towarzyszący Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Wypróbuj ten workflow</a>.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy: jak działa biblioteka Open Design</a> — prymitywy, które opakowuje wtyczka</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — dlaczego workflow ma kształt pliku, a nie konta</li>
      <li><a href="/blog/figma-alternative-open-design/">Otwartoźródłowa alternatywa dla Figma</a> — gdzie ląduje przeniesienie Twojego workflow względem zasiedziałego gracza</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow projektowy BYOK: uruchom Claude, Codex lub Qwen na własnym kluczu</a> — jak ta sama wtyczka może działać na ścieżce modelu, której Twój zespół już ufa</li>
      </ul>
  id:
    title: "Cara memindahkan alur kerja Figma ke dalam plugin Open Design"
    summary: "Thread 0.8.0-preview meminta kontributor memindahkan alur kerja desain lama satu plugin pada satu waktu. Berikut jalur konkret untuk ekspor Figma, sinkronisasi token, atau brand kit."
    bodyHtml: |
      <p>Sebuah alur kerja Figma biasanya dimulai sebagai ingatan otot: ekspor frame-frame ini, sinkronkan token-token itu, bangun ulang template deck itu, serahkan spesifikasinya ke engineering. Ini adalah jenis pekerjaan yang hidup di kepala seseorang dan dijelaskan ulang setiap kali sebuah proyek baru dimulai.</p>
      <p>Thread 0.8.0-preview mengajukan permintaan yang lebih tajam: pindahkan ingatan otot itu ke dalam sebuah plugin. Bukan panel yang dibautkan ke kanvas. Bukan skrip pribadi yang hanya satu tim yang bisa menjalankannya. Sebuah alur kerja Open Design yang dapat digunakan kembali yang dapat diambil, dieksekusi, ditinjau, dan diserahterimakan oleh agent melalui loop local-first yang sama seperti tugas desain lainnya.</p>
      <p>Ini adalah versi praktis dari <a href="https://github.com/nexu-io/open-design/discussions/1727">seruan plugin 0.8.0-preview</a>. Jika tim Anda memiliki satu alur kerja desain yang dapat diulang hari ini, tulisan ini menunjukkan seperti apa rupanya mengubahnya menjadi kontribusi berbentuk plugin — file apa yang dibutuhkannya, bagaimana agent mengambilnya, dan ke mana ia mendarat setelah dipublikasikan.</p>
      <h2>Alur kerja yang layak dipindahkan lebih kecil daripada yang Anda kira</h2>
      <p>Jangan mulai dengan “gantikan Figma.” Mulailah dengan satu pekerjaan yang menjengkelkan dan dapat diulang.</p>
      <p>Kandidat plugin pertama yang baik:</p>

























      <table><thead><tr><th>Alur kerja saat ini</th><th>Versi berbentuk plugin</th></tr></thead><tbody><tr><td>Ekspor halaman pemasaran Figma dan bangun ulang dalam kode</td><td>Plugin <code>figma-migration</code> yang mengekstrak tata letak, memetakan token, dan menghasilkan artefak web</td></tr><tr><td>Ubah brand kit menjadi slide peluncuran setiap bulan</td><td>Plugin deck dengan <code>SKILL.md</code>, aset contoh, dan sistem desain yang dikunci</td></tr><tr><td>Buat mockup onboarding mobile yang sama untuk setiap klien</td><td>Plugin layar-mobile dengan kolom input untuk audiens, nada, daftar fitur, dan platform</td></tr><tr><td>Konversi spesifikasi komponen menjadi UI siap-Storybook</td><td>Plugin migrasi-kode yang membaca repo, memetakan komponen, dan menulis diff yang dapat ditinjau</td></tr></tbody></table>
      <p>Unitnya bukan keseluruhan departemen desain. Unitnya adalah satu alur kerja yang sudah diulang seseorang dua kali seminggu. Jika Anda tidak bisa mendeskripsikannya dalam satu kalimat — “ubah X menjadi Y, dengan batasan-batasan ini” — kemungkinan itu dua plugin, bukan satu, dan Anda sebaiknya memecahnya sebelum menulis satu baris Markdown.</p>
      <p>Itulah sebabnya <a href="/blog/why-we-built-open-design-as-a-skill-layer/">lapisan skill</a> Open Design penting di sini. Sebuah plugin bukanlah ekstensi runtime yang buram. Ia adalah folder berisi file: sebuah kontrak <code>SKILL.md</code>, sistem desain opsional, contoh opsional, dan sebuah sidecar <code>open-design.json</code> yang memberi tahu Open Design cara menampilkan dan menerapkan alur kerja tersebut. Tidak ada format biner antara Anda dan aturannya, yang berarti siapa pun dapat membaca plugin, mem-fork-nya, atau memperbaikinya nanti.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Sebuah frame desain yang diekstrak dari kanvas dan dijatuhkan ke dalam kotak modul portabel, terpilih dalam bingkai hijau di atas latar editorial nyaris putih">
        <figcaption>Memindahkan alur kerja berarti mengangkat bagian yang dapat diulang keluar dari kanvas dan masuk ke dalam plugin portabel.</figcaption>
      </figure>
      <h2>Sudut pandang Open Design adalah portabilitas</h2>
      <p>Spesifikasi plugin menyatakan kontraknya dengan jelas: <code>SKILL.md</code> tetap menjadi kontrak agent yang dapat dieksekusi, sementara <code>open-design.json</code> menambahkan metadata marketplace, kolom input, default, pratinjau, dan pengkawatan konteks.</p>
      <p>Itu memberi satu alur kerja dua kehidupan. Di Open Design, ia muncul sebagai plugin dengan pratinjau, input, asal-usul, dan jalur “gunakan” satu klik. Di Claude Code, Cursor, Codex, Gemini CLI, OpenClaw, atau katalog skill lain, folder yang sama tetap berfungsi sebagai skill agent biasa karena perilaku intinya hidup di Markdown. Anda tidak menulis untuk runtime yang akan usang tahun depan; Anda menulis sebuah file yang dibaca agent dengan cara yang sama dua tahun dari sekarang.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">Penelusuran pustaka</a> sudah menjelaskan primitif-primitif dasarnya: skill, sistem, adapter, dan daemon. Plugin menambahkan distribusi dan keterulangan di sekitar primitif-primitif itu — mereka adalah unit yang dikirim, ditinjau, dan digunakan ulang oleh sebuah tim, alih-alih skill mentah yang kebetulan ditemukan agent di disk.</p>
      <p>Untuk alur kerja Figma-ke-kode, permukaan-permukaannya biasanya terlihat seperti ini:</p>





























      <table><thead><tr><th>Permukaan</th><th>File konkret</th></tr></thead><tbody><tr><td>Perilaku agent</td><td><code>SKILL.md</code></td></tr><tr><td>Metadata Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Kontrak merek atau visual</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Contoh output</td><td><code>example.html</code> atau <code>examples/{plugin-id}/example.html</code> di dalam folder plugin</td></tr><tr><td>Media pratinjau</td><td><code>preview/poster.png</code> atau <code>preview/index.html</code> di dalam folder plugin</td></tr></tbody></table>
      <p>Hasilnya bukan generator tangkapan layar. Ia adalah alur kerja agent yang dapat digunakan kembali dengan kontrak yang terlihat — setiap aturan yang diikuti agent berada di folder tempat manusia dapat membacanya dan mengeditnya.</p>
      <h2>Jalur pemindahan yang konkret</h2>
      <p>Berikut jalur minimum untuk sebuah plugin yang memindahkan satu alur kerja landing-page Figma. Keseluruhannya enam langkah, dan sebagian besarnya adalah Markdown.</p>
      <h3>1. Beri nama pekerjaan yang dapat diulang</h3>
      <p>Tuliskan satu kalimat yang mendeskripsikan pekerjaan itu: “Ubah satu frame pemasaran Figma menjadi halaman Astro yang responsif, dalam sistem merek internal, siap untuk ditinjau.” Jika Anda tidak bisa memuatnya dalam satu kalimat, persempit sampai Anda bisa. Namanya menjadi id plugin Anda (<code>figma-workflow</code>) dan judul yang ditampilkan di marketplace.</p>
      <h3>2. Tulis kontrak skill</h3>
      <p><code>SKILL.md</code> adalah kontrak yang dapat dieksekusi yang dibaca agent. Front matter menamai skill dan pemicunya; body adalah brief — bentuk input, jalur output, batasan, dan daftar periksa tinjauan yang harus diterapkan sendiri oleh agent sebelum menyerahterimakannya.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Tambahkan sidecar Open Design</h3>
      <p><code>open-design.json</code> adalah yang mengubah skill telanjang menjadi plugin marketplace: judul, deskripsi, input yang dideklarasikan, pratinjau, dan repo sumber. Ini adalah metadata yang menggerakkan panel “gunakan” dan baris asal-usul.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Lampirkan sistem desain</h3>
      <p>Jika alur kerja bergantung pada aturan merek, tambahkan file <code>DESIGN.md</code> di bawah <code>design-systems/</code> alih-alih mengubur warna dan tipografi dalam prosa. Agent mencerna sistem itu sebagai kontrak — palet OKLch, tangga tipe, postur tata letak — sehingga sepuluh layar yang dihasilkan tetap terasa seperti satu produk. Mencampur sistem di tengah proyek juga berfungsi, karena mereka hanyalah teks.</p>
      <h3>5. Sertakan satu contoh nyata</h3>
      <p>Simpan sebuah artefak yang dihasilkan di bawah <code>examples/</code> sehingga peninjau dapat menilai output-nya, bukan hanya janjinya. Satu <code>example.html</code> yang terbukti baik bernilai lebih dari satu paragraf deskripsi; ia memberi agent sesuatu untuk dicocokkan polanya dan memberi maintainer sesuatu untuk disetujui.</p>
      <p>Disatukan, plugin adalah satu folder tunggal yang dapat dibaca:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Validasi dan paket</h3>
      <p>Jalankan perintah plugin sebelum membuka PR. Jalur CLI saat ini menggunakan id plugin huruf kecil. Hindari nama registri yang dipisahkan-garis-miring saat scaffold; <code>od plugin scaffold</code> membuat <code>&#x3C;out>/&#x3C;id>/...</code>, jadi perintah lanjutannya menunjuk ke folder yang dihasilkan itu:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Ketika plugin siap untuk tinjauan registri, autentikasi melalui GitHub dengan <code>od plugin login</code> dan <code>od plugin whoami --json</code>, lalu ikuti dokumentasi penerbitan untuk jalur tinjauan saat ini. Open Design tidak menyimpan kredensial GitHub Anda.</p>
      <h2>Seperti apa ini di sebuah tim desain nyata</h2>
      <p>Bayangkan sebuah tim produk kecil dengan sebuah frame Figma untuk halaman peluncuran, sebuah sistem merek internal, dan ritme rilis bulanan.</p>
      <p>Sebelum plugin, alur kerjanya adalah rantai serah terima: desainer mengekspor frame, engineer membangun ulang tata letak, PM menulis ulang teks, seseorang memeriksa pergeseran token, orang lain mencatat bug. Pekerjaannya familier, tetapi ingatannya hidup di orang — dan ia bocor setiap kali seseorang tidak ada, berpindah tim, atau melupakan satu batasan yang penting.</p>
      <p>Setelah plugin, alur kerja menjadi artefak yang dapat dijalankan:</p>

































      <table><thead><tr><th>Langkah</th><th>Siapa yang mengarahkannya</th></tr></thead><tbody><tr><td>Pilih plugin</td><td>Desainer atau PM</td></tr><tr><td>Lampirkan URL Figma / tangkapan layar / aset lokal</td><td>Desainer</td></tr><tr><td>Pilih sistem merek</td><td>Desainer atau design engineer</td></tr><tr><td>Hasilkan artefak web</td><td>Claude Code, Cursor, Codex, Gemini CLI, atau agent lain yang terdeteksi</td></tr><tr><td>Tinjau ID seksi, teks, kepadatan, dan perilaku responsif</td><td>Manusia di pratinjau Open Design</td></tr><tr><td>Ekspor atau serahterimakan file</td><td>Folder proyek lokal yang sama</td></tr></tbody></table>
      <p>Tim masih membutuhkan selera — langkah tinjauan adalah tempatnya, dan tidak ada plugin yang menggantikannya. Yang dihilangkan plugin adalah penjelasan ulang: batasan, peta token, dan jalur output berhenti menjadi pengetahuan suku dan menjadi sebuah file di repo.</p>
      <h2>Apa yang harus dilakukan selanjutnya</h2>
      <p>Jika tim Anda memiliki ekspor Figma, sinkronisasi token, brand kit, atau template deck yang terus kembali, pindahkan irisan terkecil yang dapat diulang terlebih dahulu. Mulailah dengan sebuah <code>SKILL.md</code>, tambahkan <code>open-design.json</code>, lampirkan <code>DESIGN.md</code> merek, jatuhkan satu contoh nyata, validasi, dan buka PR sebelum alur kerja itu tumbuh menjadi tool pribadi yang tidak bisa digunakan ulang oleh siapa pun. Contoh tangkapan-layar-ke-prototipe menunjukkan versi berbentuk plugin dari ujung ke ujung: sebuah skill portabel ditambah sebuah sidecar Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Coba alur kerja ini</a>.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistem: cara kerja pustaka Open Design</a> — primitif-primitif yang dibungkus sebuah plugin</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> — mengapa alur kerja berbentuk-file alih-alih berbentuk-akun</li>
      <li><a href="/blog/figma-alternative-open-design/">Alternatif sumber terbuka untuk Figma</a> — ke mana memindahkan alur kerja Anda mendarat relatif terhadap pemain lama</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Alur kerja desain BYOK: jalankan Claude, Codex, atau Qwen dengan key Anda sendiri</a> — bagaimana plugin yang sama dapat berjalan pada jalur model yang sudah dipercaya tim Anda</li>
      </ul>
  nl:
    title: "Hoe je een Figma-workflow naar een Open Design-plugin overzet"
    summary: "De 0.8.0-preview-thread vraagt bijdragers om oude ontwerpworkflows één plugin per keer over te zetten. Hier is het concrete pad voor een Figma-export, token-sync of brand kit."
    bodyHtml: |
      <p>Een Figma-workflow begint meestal als spiergeheugen: exporteer deze frames, synchroniseer die tokens, herbouw die deck-template, geef de specificatie aan engineering. Het is het soort werk dat in iemands hoofd leeft en elke keer opnieuw wordt uitgelegd als een nieuw project start.</p>
      <p>De 0.8.0-preview-thread doet een scherpere vraag: zet dat spiergeheugen om in een plugin. Geen paneel vastgeschroefd aan een canvas. Geen privéscript dat maar één team kan draaien. Een herbruikbare Open Design-workflow die een agent kan oppakken, uitvoeren, reviewen en overdragen via dezelfde local-first-lus als elke andere ontwerptaak.</p>
      <p>Dit is de praktische versie van de <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview-oproep voor plugins</a>. Als je team vandaag één herhaalbare ontwerpworkflow heeft, laat dit bericht zien hoe het eruitziet om er een plugin-vormige bijdrage van te maken — welke bestanden het nodig heeft, hoe de agent het oppakt en waar het belandt zodra het is gepubliceerd.</p>
      <h2>De workflow die het waard is om over te zetten is kleiner dan je denkt</h2>
      <p>Begin niet met “vervang Figma.” Begin met één vervelende, herhaalbare klus.</p>
      <p>Goede kandidaten voor een eerste plugin:</p>




















      <table><thead><tr><th>Huidige workflow</th><th>Plugin-vormige versie</th></tr></thead><tbody><tr><td>Een Figma-marketingpagina exporteren en herbouwen in code</td><td><code>figma-migration</code>-plugin die lay-out extraheert, tokens mapt en een web-artefact genereert</td></tr><tr><td>Elke maand een brand kit omzetten in launch-slides</td><td>Deck-plugin met een <code>SKILL.md</code>, voorbeeldmiddelen en een vastgelegd designsysteem</td></tr><tr><td>Voor elke klant dezelfde mobiele onboarding-mockup maken</td><td>Mobiel-scherm-plugin met invoervelden voor doelgroep, toon, functielijst en platform</td></tr><tr><td>Een componentspecificatie omzetten in Storybook-klare UI</td><td>Code-migratie-plugin die de repo leest, componenten mapt en een reviewbare diff schrijft</td></tr></tbody></table>
      <p>De eenheid is niet de hele ontwerpafdeling. De eenheid is één workflow die iemand al twee keer per week herhaalt. Als je het niet in één zin kunt beschrijven — “zet X om in Y, met deze beperkingen” — dan zijn het waarschijnlijk twee plugins, geen één, en zou je het moeten splitsen voordat je een regel Markdown schrijft.</p>
      <p>Daarom doet de <a href="/blog/why-we-built-open-design-as-a-skill-layer/">skill-laag</a> van Open Design er hier toe. Een plugin is geen ondoorzichtige runtime-uitbreiding. Het is een map met bestanden: een <code>SKILL.md</code>-contract, optionele designsystemen, optionele voorbeelden en een <code>open-design.json</code>-sidecar die Open Design vertelt hoe de workflow weergegeven en toegepast moet worden. Er staat geen binair formaat tussen jou en de regels, wat betekent dat iedereen de plugin kan lezen, forken of later kan repareren.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Een ontwerpframe dat uit een canvas wordt geëxtraheerd en in een draagbare moduledoos wordt gedropt, geselecteerd in een groen kader op een bijna-witte redactionele achtergrond">
        <figcaption>Een workflow overzetten betekent het herhaalbare deel uit het canvas tillen en in een draagbare plugin plaatsen.</figcaption>
      </figure>
      <h2>De Open Design-invalshoek is draagbaarheid</h2>
      <p>De plugin-specificatie stelt het contract helder: <code>SKILL.md</code> blijft het uitvoerbare agent-contract, terwijl <code>open-design.json</code> marketplace-metadata, invoervelden, standaardwaarden, voorbeelden en contextbedrading toevoegt.</p>
      <p>Dat geeft één workflow twee levens. In Open Design verschijnt hij als een plugin met een voorbeeld, invoer, herkomst en een one-click “gebruik”-pad. In Claude Code, Cursor, Codex, Gemini CLI, OpenClaw of een andere skill-catalogus werkt dezelfde map nog steeds als een gewone agent-skill, omdat het kerngedrag in Markdown leeft. Je schrijft niet voor een runtime die volgend jaar wordt afgeschaft; je schrijft een bestand dat een agent over twee jaar op dezelfde manier leest.</p>
      <p>De <a href="/blog/31-skills-72-systems-how-the-library-works/">bibliotheek-rondleiding</a> legt de basisprimitieven al uit: skills, systemen, adapters en de daemon. Plugins voegen distributie en herhaalbaarheid toe rond die primitieven — ze zijn de eenheid die een team levert, reviewt en hergebruikt, in plaats van de ruwe skill die een agent toevallig op schijf ontdekt.</p>
      <p>Voor een Figma-naar-code-workflow zien de oppervlakken er meestal zo uit:</p>


























      <table><thead><tr><th>Oppervlak</th><th>Concreet bestand</th></tr></thead><tbody><tr><td>Agent-gedrag</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design-metadata</td><td><code>open-design.json</code></td></tr><tr><td>Merk- of visueel contract</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Voorbeeldoutput</td><td><code>example.html</code> of <code>examples/{plugin-id}/example.html</code> in de plugin-map</td></tr><tr><td>Voorbeeldmedia</td><td><code>preview/poster.png</code> of <code>preview/index.html</code> in de plugin-map</td></tr></tbody></table>
      <p>Het resultaat is geen screenshot-generator. Het is een herbruikbare agent-workflow met een zichtbaar contract — elke regel die de agent volgt, zit in de map waar een mens hem kan lezen en bewerken.</p>
      <h2>Een concreet pad om over te zetten</h2>
      <p>Hier is het minimale pad voor een plugin die één Figma-landingspagina-workflow overzet. Het geheel is zes stappen, en de meeste daarvan zijn Markdown.</p>
      <h3>1. Benoem de herhaalbare klus</h3>
      <p>Schrijf de enkele zin op die de klus beschrijft: “Zet één Figma-marketingframe om in een responsieve Astro-pagina, in het huismerksysteem, klaar voor review.” Als je het niet in een zin kunt vatten, versmal het tot je dat wel kunt. De naam wordt je plugin-id (<code>figma-workflow</code>) en de titel die in de marketplace wordt getoond.</p>
      <h3>2. Schrijf het skill-contract</h3>
      <p><code>SKILL.md</code> is het uitvoerbare contract dat de agent leest. De front matter benoemt de skill en zijn trigger; de body is de briefing — invoervorm, outputpad, beperkingen en een review-checklist die de agent op zichzelf moet toepassen voordat hij overdraagt.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Voeg de Open Design-sidecar toe</h3>
      <p><code>open-design.json</code> is wat een kale skill omzet in een marketplace-plugin: titel, beschrijving, gedeclareerde invoer, voorbeeld en bron-repo. Dit is de metadata die het “gebruik”-paneel en de herkomstregel aandrijft.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Koppel het designsysteem</h3>
      <p>Als de workflow afhangt van merkregels, voeg dan een <code>DESIGN.md</code>-bestand toe onder <code>design-systems/</code> in plaats van kleur en typografie te begraven in proza. De agent neemt het systeem op als een contract — OKLch-palet, typeschaal, lay-outhouding — zodat tien gegenereerde schermen nog steeds als één product aanvoelen. Systemen mixen halverwege een project werkt ook, omdat het gewoon tekst is.</p>
      <h3>5. Voeg één echt voorbeeld toe</h3>
      <p>Sla een gegenereerd artefact op onder <code>examples/</code> zodat reviewers de output kunnen beoordelen, niet alleen de belofte. Eén bekende, goede <code>example.html</code> is meer waard dan een alinea beschrijving; het geeft de agent iets om patronen tegen te matchen en geeft een maintainer iets om goed te keuren.</p>
      <p>Samengevoegd is de plugin een enkele, leesbare map:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Valideer en pak in</h3>
      <p>Draai de plugin-commando's voordat je een PR opent. Het huidige CLI-pad gebruikt een plugin-id in kleine letters. Vermijd registernamen gescheiden door schuine strepen bij het scaffolden; <code>od plugin scaffold</code> maakt <code>&#x3C;out>/&#x3C;id>/...</code>, dus de vervolgcommando's wijzen naar die gegenereerde map:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Wanneer de plugin klaar is voor registerreview, authenticeer via GitHub met <code>od plugin login</code> en <code>od plugin whoami --json</code>, en volg dan de publicatiedocumentatie voor het huidige reviewpad. Open Design slaat je GitHub-inloggegevens niet op.</p>
      <h2>Hoe dit eruitziet in een echt ontwerpteam</h2>
      <p>Stel je een klein productteam voor met een Figma-frame voor een launch-pagina, een huismerksysteem en een maandelijks release-ritme.</p>
      <p>Vóór de plugin is de workflow een overdrachtsketen: ontwerper exporteert frames, engineer herbouwt lay-out, PM herschrijft tekst, iemand controleert token-afwijking, iemand anders meldt bugs. Het werk is vertrouwd, maar het geheugen leeft in mensen — en het lekt elke keer als iemand afwezig is, van team wisselt, of de ene beperking vergeet die ertoe deed.</p>
      <p>Na de plugin wordt de workflow een uitvoerbaar artefact:</p>




























      <table><thead><tr><th>Stap</th><th>Wie stuurt het aan</th></tr></thead><tbody><tr><td>Kies de plugin</td><td>Ontwerper of PM</td></tr><tr><td>Koppel Figma-URL / screenshot / lokale middelen</td><td>Ontwerper</td></tr><tr><td>Kies het merksysteem</td><td>Ontwerper of design-engineer</td></tr><tr><td>Genereer het web-artefact</td><td>Claude Code, Cursor, Codex, Gemini CLI of een andere gedetecteerde agent</td></tr><tr><td>Review sectie-ID's, tekst, dichtheid en responsief gedrag</td><td>Mens in het Open Design-voorbeeld</td></tr><tr><td>Exporteer of draag bestanden over</td><td>Dezelfde lokale projectmap</td></tr></tbody></table>
      <p>Het team heeft nog steeds smaak nodig — de reviewstap is waar het leeft, en geen enkele plugin vervangt het. Wat de plugin verwijdert, is het opnieuw uitleggen: de beperkingen, de token-map en het outputpad houden op stammenkennis te zijn en worden een bestand in de repo.</p>
      <h2>Wat je hierna moet doen</h2>
      <p>Als je team een Figma-export, token-sync, brand kit of deck-template heeft die steeds terugkomt, zet dan eerst de kleinste herhaalbare plak over. Begin met een <code>SKILL.md</code>, voeg <code>open-design.json</code> toe, koppel de merk-<code>DESIGN.md</code>, plaats er één echt voorbeeld in, valideer het, en open de PR voordat de workflow uitgroeit tot een privétool die niemand anders kan hergebruiken. Het voorbeeld van screenshot-naar-prototype toont de plugin-vormige versie van begin tot eind: een draagbare skill plus een Open Design-sidecar.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Probeer deze workflow</a>.</p>
      <h2>Gerelateerde lectuur</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systemen: hoe de Open Design-bibliotheek werkt</a> — de primitieven die een plugin omhult</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — waarom de workflow bestand-vormig is in plaats van account-vormig</li>
      <li><a href="/blog/figma-alternative-open-design/">Het open-source alternatief voor Figma</a> — waar het overzetten van je workflow belandt ten opzichte van de gevestigde speler</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-ontwerpworkflow: draai Claude, Codex of Qwen op je eigen sleutel</a> — hoe dezelfde plugin kan draaien op het modelpad dat je team al vertrouwt</li>
      </ul>
  ar:
    title: "كيف تنقل سير عمل Figma إلى إضافة (plugin) في Open Design"
    summary: "تطلب سلسلة 0.8.0-preview من المساهمين نقل سير عمل التصميم القديم إضافةً تلو الأخرى. وإليك المسار الملموس لتصدير من Figma، أو مزامنة رموز (tokens)، أو طقم علامة تجارية."
    bodyHtml: |
      <p>عادةً ما يبدأ سير عمل Figma كذاكرة عضلية: صدّر هذه الإطارات، وزامن تلك الرموز (tokens)، وأعد بناء قالب العرض ذاك، وسلّم المواصفات للهندسة. إنه نوع العمل الذي يقيم في رأس أحدهم ويُعاد شرحه في كل مرة يبدأ فيها مشروع جديد.</p>
      <p>سلسلة 0.8.0-preview تطرح طلبًا أكثر حدّة: انقل تلك الذاكرة العضلية إلى إضافة (plugin). لا لوحة مُثبَّتة على كانفاس. ولا سكربت خاص يستطيع فريق واحد فقط تشغيله. بل سير عمل قابل لإعادة الاستخدام في Open Design يستطيع عميل التقاطه وتنفيذه ومراجعته وتسليمه عبر الحلقة المحلية أولًا نفسها كأي مهمة تصميم أخرى.</p>
      <p>هذه هي النسخة العملية من <a href="https://github.com/nexu-io/open-design/discussions/1727">دعوة 0.8.0-preview للإضافات</a>. إن كان لدى فريقك سير عمل تصميم واحد قابل للتكرار اليوم، فهذه المقالة تُظهر كيف يبدو تحويله إلى مساهمة على شكل إضافة — ما الملفات التي يحتاجها، وكيف يلتقطه العميل، وأين يستقرّ بمجرّد نشره.</p>
      <h2>سير العمل الجدير بالنقل أصغر مما تظنّ</h2>
      <p>لا تبدأ بـ «استبدل Figma». ابدأ بمهمة واحدة مزعجة قابلة للتكرار.</p>
      <p>مرشّحون جيّدون لأول إضافة:</p>
      <table><thead><tr><th>سير العمل الحالي</th><th>النسخة على شكل إضافة</th></tr></thead><tbody><tr><td>تصدير صفحة تسويقية من Figma وإعادة بنائها بالشيفرة</td><td>إضافة <code>figma-migration</code> تستخرج التخطيط، وتُطابق الرموز، وتُولّد مُخرَجًا للويب</td></tr><tr><td>تحويل طقم علامة تجارية إلى شرائح إطلاق كل شهر</td><td>إضافة عروض بملف <code>SKILL.md</code>، وأصول أمثلة، ونظام تصميم مُثبَّت</td></tr><tr><td>إنشاء نموذج محاكاة التهيئة (onboarding) للهاتف المحمول نفسه لكل عميل</td><td>إضافة شاشة هاتف محمول بحقول إدخال للجمهور، والنبرة، وقائمة الميزات، والمنصّة</td></tr><tr><td>تحويل مواصفات مكوّن إلى واجهة مستخدم جاهزة لـ Storybook</td><td>إضافة ترحيل شيفرة تقرأ المستودع، وتُطابق المكوّنات، وتكتب فرقًا (diff) قابلًا للمراجعة</td></tr></tbody></table>
      <p>الوحدة ليست قسم التصميم بأكمله. الوحدة هي سير عمل واحد يُكرّره أحدهم مرتين أسبوعيًّا بالفعل. إن لم تستطع وصفه في جملة واحدة — «حوّل X إلى Y، بهذه القيود» — فهو على الأرجح إضافتان لا واحدة، وعليك تقسيمه قبل أن تكتب سطرًا من Markdown.</p>
      <p>لهذا تهمّ <a href="/blog/why-we-built-open-design-as-a-skill-layer/">طبقة المهارات</a> في Open Design هنا. الإضافة ليست امتداد بيئة تشغيل غامضًا. إنها مجلّد من الملفات: عقد <code>SKILL.md</code>، وأنظمة تصميم اختيارية، وأمثلة اختيارية، وملف مُرافق <code>open-design.json</code> يُخبر Open Design كيف يعرض سير العمل ويُطبّقه. لا توجد صيغة ثنائية بينك وبين القواعد، ما يعني أن أي شخص يستطيع قراءة الإضافة، أو تفريعها، أو إصلاحها لاحقًا.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="إطار تصميم يُستخرَج من كانفاس ويُوضع في صندوق وحدة محمولة، محدّد بإطار أخضر على أرضية تحريرية شبه بيضاء">
        <figcaption>نقل سير العمل يعني انتزاع الجزء القابل للتكرار من الكانفاس ووضعه في إضافة محمولة.</figcaption>
      </figure>
      <h2>زاوية Open Design هي قابلية النقل</h2>
      <p>مواصفات الإضافة تُبيّن العقد بوضوح: يبقى <code>SKILL.md</code> عقد العميل القابل للتنفيذ، بينما يُضيف <code>open-design.json</code> بيانات وصفية للسوق، وحقول إدخال، وقيمًا افتراضية، ومعاينات، وتوصيل السياق.</p>
      <p>هذا يمنح سير عمل واحدًا حياتين. في Open Design، يظهر كإضافة بمعاينة، ومدخلات، ومصدر، ومسار «استخدام» بنقرة واحدة. وفي Claude Code، أو Cursor، أو Codex، أو Gemini CLI، أو OpenClaw، أو كتالوج مهارات آخر، لا يزال المجلّد نفسه يعمل كمهارة عميل صِرفة لأن السلوك الأساسي يقيم في Markdown. أنت لا تكتب لبيئة تشغيل ستُهجَر العام القادم؛ بل تكتب ملفًا يقرؤه العميل بالطريقة نفسها بعد عامين من الآن.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">جولة المكتبة</a> تشرح بالفعل العناصر الأساسية: المهارات، والأنظمة، والمُحوّلات، والـ daemon. الإضافات تُضيف التوزيع وقابلية التكرار حول تلك العناصر — فهي الوحدة التي يشحنها فريق، ويُراجعها، ويُعيد استخدامها، بدلًا من المهارة الخام التي يصادف العميل اكتشافها على القرص.</p>
      <p>بالنسبة لسير عمل Figma-إلى-شيفرة، تبدو الأسطح عادةً هكذا:</p>
      <table><thead><tr><th>السطح</th><th>الملف الملموس</th></tr></thead><tbody><tr><td>سلوك العميل</td><td><code>SKILL.md</code></td></tr><tr><td>بيانات Open Design الوصفية</td><td><code>open-design.json</code></td></tr><tr><td>عقد العلامة التجارية أو العقد البصري</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>مُخرَج مثال</td><td><code>example.html</code> أو <code>examples/{plugin-id}/example.html</code> داخل مجلّد الإضافة</td></tr><tr><td>وسائط المعاينة</td><td><code>preview/poster.png</code> أو <code>preview/index.html</code> داخل مجلّد الإضافة</td></tr></tbody></table>
      <p>النتيجة ليست مُولّد لقطات شاشة. إنها سير عمل عميل قابل لإعادة الاستخدام بعقد مرئي — فكل قاعدة يتّبعها العميل تقبع في المجلّد حيث يمكن لإنسان قراءتها وتحريرها.</p>
      <h2>مسار نقل ملموس</h2>
      <p>إليك المسار الأدنى لإضافة تنقل سير عمل صفحة هبوط واحدة من Figma. الأمر كله ستّ خطوات، ومعظمها Markdown.</p>
      <h3>1. سمِّ المهمة القابلة للتكرار</h3>
      <p>اكتب الجملة الواحدة التي تصف المهمة: «حوّل إطار تسويق واحدًا من Figma إلى صفحة Astro متجاوبة، في نظام علامة الشركة، جاهزة للمراجعة.» إن لم تستطع وضعها في جملة، فضيّقها حتى تستطيع. يصبح الاسم مُعرّف إضافتك (<code>figma-workflow</code>) والعنوان المعروض في السوق.</p>
      <h3>2. اكتب عقد المهارة</h3>
      <p><code>SKILL.md</code> هو العقد القابل للتنفيذ الذي يقرؤه العميل. يُسمّي الجزء الافتتاحي المهارة ومُحفّزها؛ والمتن هو الملخّص — شكل الإدخال، ومسار الإخراج، والقيود، وقائمة تحقّق للمراجعة ينبغي للعميل تطبيقها على نفسه قبل التسليم.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. أضف ملف Open Design المُرافق</h3>
      <p><code>open-design.json</code> هو ما يُحوّل مهارة صِرفة إلى إضافة سوق: العنوان، والوصف، والمدخلات المُعلَنة، والمعاينة، ومستودع المصدر. هذه هي البيانات الوصفية التي تُشغّل لوحة «استخدام» وسطر المصدر.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. أرفق نظام التصميم</h3>
      <p>إذا اعتمد سير العمل على قواعد العلامة التجارية، فأضف ملف <code>DESIGN.md</code> تحت <code>design-systems/</code> بدلًا من دفن اللون والطباعة في النثر. يستوعب العميل النظام كعقد — لوحة OKLch، وسلّم الخط، ووضعية التخطيط — كي تظلّ عشر شاشات مُولّدة تبدو كمنتج واحد. مزج الأنظمة في منتصف المشروع يعمل أيضًا، لأنها ليست سوى نصّ.</p>
      <h3>5. أدرج مثالًا حقيقيًّا واحدًا</h3>
      <p>احفظ مُخرَجًا مُولّدًا تحت <code>examples/</code> كي يستطيع المُراجعون الحكم على المُخرَج، لا الوعد فقط. ملف <code>example.html</code> واحد معروف الجودة يساوي أكثر من فقرة وصف؛ فهو يمنح العميل شيئًا يُطابق نمطه عليه ويمنح المُشرف شيئًا يُوافق عليه.</p>
      <p>مُجمَّعةً، الإضافة هي مجلّد واحد قابل للقراءة:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. تحقّق واحزم</h3>
      <p>شغّل أوامر الإضافة قبل فتح PR. مسار الـ CLI الحالي يستخدم مُعرّف إضافة بأحرف صغيرة. تجنّب أسماء السجلّ المفصولة بشرطة مائلة عند السقالة (scaffold)؛ فأمر <code>od plugin scaffold</code> يُنشئ <code>&#x3C;out>/&#x3C;id>/...</code>، لذا تشير الأوامر اللاحقة إلى ذلك المجلّد المُولّد:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>عندما تصبح الإضافة جاهزة لمراجعة السجلّ، استوثق عبر GitHub بـ <code>od plugin login</code> و<code>od plugin whoami --json</code>، ثم اتّبع توثيق النشر لمسار المراجعة الحالي. Open Design لا يُخزّن بيانات اعتماد GitHub الخاصة بك.</p>
      <h2>كيف يبدو هذا في فريق تصميم حقيقي</h2>
      <p>تخيّل فريق منتج صغيرًا لديه إطار Figma لصفحة إطلاق، ونظام علامة شركة، وإيقاع إصدار شهري.</p>
      <p>قبل الإضافة، سير العمل سلسلة تسليم: المصمّم يُصدّر الإطارات، والمهندس يُعيد بناء التخطيط، ومدير المنتج يُعيد كتابة النصّ، وأحدهم يفحص انحراف الرموز، وآخر يُسجّل الأخطاء. العمل مألوف، لكن الذاكرة تقيم في الناس — وتتسرّب في كل مرة يغيب أحدهم، أو يُبدّل فريقًا، أو ينسى القيد الواحد الذي كان مهمًّا.</p>
      <p>بعد الإضافة، يصبح سير العمل مُخرَجًا قابلًا للتشغيل:</p>
      <table><thead><tr><th>الخطوة</th><th>من يُوجّهها</th></tr></thead><tbody><tr><td>اختيار الإضافة</td><td>المصمّم أو مدير المنتج</td></tr><tr><td>إرفاق رابط Figma / لقطة شاشة / أصول محلية</td><td>المصمّم</td></tr><tr><td>اختيار نظام العلامة التجارية</td><td>المصمّم أو مهندس التصميم</td></tr><tr><td>توليد مُخرَج الويب</td><td>Claude Code، أو Cursor، أو Codex، أو Gemini CLI، أو عميل آخر مكتشَف</td></tr><tr><td>مراجعة مُعرّفات الأقسام، والنصّ، والكثافة، والسلوك المتجاوب</td><td>إنسان في معاينة Open Design</td></tr><tr><td>تصدير الملفات أو تسليمها</td><td>مجلّد المشروع المحلي نفسه</td></tr></tbody></table>
      <p>لا يزال الفريق يحتاج إلى الذوق — خطوة المراجعة هي حيث يقيم، ولا إضافة تستبدله. ما تزيله الإضافة هو إعادة الشرح: القيود، وخريطة الرموز، ومسار الإخراج تتوقّف عن كونها معرفة قبلية وتصبح ملفًا في المستودع.</p>
      <h2>ما الذي تفعله بعد ذلك</h2>
      <p>إن كان لدى فريقك تصدير من Figma، أو مزامنة رموز، أو طقم علامة تجارية، أو قالب عرض يظلّ يعود، فانقل أصغر شريحة قابلة للتكرار أولًا. ابدأ بـ <code>SKILL.md</code>، وأضف <code>open-design.json</code>، وأرفق <code>DESIGN.md</code> الخاص بالعلامة التجارية، وأدرج مثالًا حقيقيًّا واحدًا، وتحقّق منه، وافتح PR قبل أن ينمو سير العمل ليصبح أداة خاصة لا يستطيع غيرك إعادة استخدامها. مثال لقطة-الشاشة-إلى-النموذج الأولي يُظهر النسخة على شكل إضافة من طرف إلى طرف: مهارة محمولة بالإضافة إلى ملف Open Design مُرافق.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">جرّب سير العمل هذا</a>.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة، 72 نظامًا: كيف تعمل مكتبة Open Design</a> — العناصر الأساسية التي تلفّها الإضافة</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> — لماذا سير العمل على شكل ملف بدلًا من أن يكون على شكل حساب</li>
      <li><a href="/blog/figma-alternative-open-design/">البديل مفتوح المصدر لـ Figma</a> — أين يستقرّ نقل سير عملك نسبةً إلى المُهيمن الحالي</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل التصميم بنظام BYOK: شغّل Claude أو Codex أو Qwen على مفتاحك الخاص</a> — كيف يمكن للإضافة نفسها أن تعمل على مسار النموذج الذي يثق به فريقك بالفعل</li>
      </ul>
  tr:
    title: "Bir Figma iş akışı Open Design eklentisine nasıl taşınır"
    summary: "0.8.0-preview başlığı, katkıda bulunanlardan eski tasarım iş akışlarını her seferinde bir eklenti olarak taşımalarını istiyor. İşte bir Figma dışa aktarımı, token senkronizasyonu veya marka kiti için somut yol."
    bodyHtml: |
      <p>Bir Figma iş akışı genellikle kas hafızası olarak başlar: şu çerçeveleri dışa aktar, şu token'ları senkronize et, şu sunum şablonunu yeniden oluştur, spesifikasyonu mühendisliğe ver. Bu, birinin kafasında yaşayan ve her yeni proje başladığında yeniden anlatılan türden bir iştir.</p>
      <p>0.8.0-preview başlığı daha keskin bir talepte bulunuyor: o kas hafızasını bir eklentiye taşıyın. Bir tuvale cıvatalanmış bir panel değil. Yalnızca tek bir ekibin çalıştırabileceği özel bir betik değil. Bir ajanın diğer herhangi bir tasarım görevi gibi aynı yerel öncelikli döngüden alıp yürütebileceği, gözden geçirebileceği ve devredebileceği yeniden kullanılabilir bir Open Design iş akışı.</p>
      <p>Bu, <a href="https://github.com/nexu-io/open-design/discussions/1727">0.8.0-preview eklenti çağrısının</a> pratik versiyonudur. Ekibinizin bugün tekrarlanabilir bir tasarım iş akışı varsa, bu yazı onu eklenti biçimli bir katkıya dönüştürmenin nasıl göründüğünü gösteriyor — hangi dosyalara ihtiyaç duyduğunu, ajanın onu nasıl aldığını ve yayımlandıktan sonra nereye yerleştiğini.</p>
      <h2>Taşımaya değer iş akışı düşündüğünüzden daha küçük</h2>
      <p>"Figma'yı değiştir" ile başlamayın. Sinir bozucu, tekrarlanabilir tek bir işle başlayın.</p>
      <p>İyi ilk eklenti adayları:</p>




















      <table><thead><tr><th>Mevcut iş akışı</th><th>Eklenti biçimli versiyon</th></tr></thead><tbody><tr><td>Bir Figma pazarlama sayfasını dışa aktarıp kodda yeniden oluşturma</td><td>Yerleşimi çıkaran, token'ları eşleyen ve bir web eseri üreten <code>figma-migration</code> eklentisi</td></tr><tr><td>Bir marka kitini her ay lansman slaytlarına dönüştürme</td><td>Bir <code>SKILL.md</code>, örnek varlıklar ve kilitli bir tasarım sistemi olan sunum eklentisi</td></tr><tr><td>Her müşteri için aynı mobil onboarding maketini oluşturma</td><td>Hedef kitle, ton, özellik listesi ve platform için giriş alanları olan mobil ekran eklentisi</td></tr><tr><td>Bir bileşen spesifikasyonunu Storybook'a hazır arayüze dönüştürme</td><td>Depoyu okuyan, bileşenleri eşleyen ve gözden geçirilebilir bir diff yazan kod taşıma eklentisi</td></tr></tbody></table>
      <p>Birim, tüm tasarım departmanı değildir. Birim, birinin zaten haftada iki kez tekrarladığı tek bir iş akışıdır. Onu tek bir cümleyle tanımlayamıyorsanız — "X'i şu kısıtlamalarla Y'ye dönüştür" — muhtemelen bir değil iki eklentidir ve bir satır Markdown yazmadan önce onu bölmelisiniz.</p>
      <p>Open Design'ın <a href="/blog/why-we-built-open-design-as-a-skill-layer/">beceri katmanının</a> burada önemli olmasının nedeni budur. Bir eklenti, opak bir çalışma zamanı uzantısı değildir. Bir dosya klasörüdür: bir <code>SKILL.md</code> sözleşmesi, isteğe bağlı tasarım sistemleri, isteğe bağlı örnekler ve Open Design'a iş akışını nasıl görüntüleyip uygulayacağını söyleyen bir <code>open-design.json</code> yan dosyası. Sizinle kurallar arasında bir ikili format yoktur, bu da herkesin eklentiyi okuyabileceği, çatallayabileceği veya daha sonra düzeltebileceği anlamına gelir.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, bir tuvalden çıkarılıp taşınabilir bir modül kutusuna bırakılan, yeşil bir çerçeveyle seçilmiş bir tasarım çerçevesi">
        <figcaption>Bir iş akışını taşımak, tekrarlanabilir kısmı tuvalden alıp taşınabilir bir eklentiye yerleştirmek demektir.</figcaption>
      </figure>
      <h2>Open Design'ın bakış açısı taşınabilirliktir</h2>
      <p>Eklenti spesifikasyonu sözleşmeyi açıkça belirtir: <code>SKILL.md</code> yürütülebilir ajan sözleşmesi olarak kalır, <code>open-design.json</code> ise marketplace meta verileri, giriş alanları, varsayılanlar, önizlemeler ve bağlam bağlantısı ekler.</p>
      <p>Bu, bir iş akışına iki hayat verir. Open Design'da bir önizleme, girdiler, kaynak bilgisi ve tek tıklamayla "kullan" yoluyla bir eklenti olarak görünür. Claude Code, Cursor, Codex, Gemini CLI, OpenClaw veya başka bir beceri kataloğunda, aynı klasör hâlâ düz bir ajan becerisi olarak çalışır, çünkü temel davranış Markdown'da yaşar. Gelecek yıl kullanımdan kalkacak bir çalışma zamanı için yazmıyorsunuz; iki yıl sonra bir ajanın aynı şekilde okuyacağı bir dosya yazıyorsunuz.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">Kütüphane incelemesi</a> temel ilkel öğeleri zaten açıklıyor: beceriler, sistemler, adaptörler ve daemon. Eklentiler, bu ilkel öğelerin etrafına dağıtım ve tekrarlanabilirlik ekler — bir ajanın diskte tesadüfen keşfettiği ham beceriden ziyade, bir ekibin gönderdiği, gözden geçirdiği ve yeniden kullandığı birimdir.</p>
      <p>Bir Figma'dan koda iş akışı için yüzeyler genellikle şöyle görünür:</p>















      <table><thead><tr><th>Yüzey</th><th>Somut dosya</th></tr></thead><tbody><tr><td>Ajan davranışı</td><td><code>SKILL.md</code></td></tr><tr><td>Open Design meta verileri</td><td><code>open-design.json</code></td></tr><tr><td>Marka veya görsel sözleşme</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Örnek çıktı</td><td>eklenti klasörünün içinde <code>example.html</code> veya <code>examples/{plugin-id}/example.html</code></td></tr><tr><td>Önizleme medyası</td><td>eklenti klasörünün içinde <code>preview/poster.png</code> veya <code>preview/index.html</code></td></tr></tbody></table>
      <p>Sonuç bir ekran görüntüsü üreteci değildir. Görünür bir sözleşmesi olan yeniden kullanılabilir bir ajan iş akışıdır — ajanın izlediği her kural, bir insanın okuyup düzenleyebileceği klasörde durur.</p>
      <h2>Somut bir taşıma yolu</h2>
      <p>İşte tek bir Figma açılış sayfası iş akışını taşıyan bir eklenti için minimum yol. Tamamı altı adım ve çoğu Markdown.</p>
      <h3>1. Tekrarlanabilir işi adlandırın</h3>
      <p>İşi tanımlayan tek cümleyi yazın: "Tek bir Figma pazarlama çerçevesini, kurumsal marka sisteminde, gözden geçirmeye hazır, duyarlı bir Astro sayfasına dönüştür." Onu bir cümleye sığdıramıyorsanız, sığdırana kadar daraltın. Ad, eklenti kimliğiniz (<code>figma-workflow</code>) ve marketplace'te gösterilen başlık olur.</p>
      <h3>2. Beceri sözleşmesini yazın</h3>
      <p><code>SKILL.md</code>, ajanın okuduğu yürütülebilir sözleşmedir. Ön bilgi becerinin adını ve tetikleyicisini belirtir; gövde ise brief'tir — girdi biçimi, çıktı yolu, kısıtlamalar ve ajanın devretmeden önce kendine uygulaması gereken bir gözden geçirme kontrol listesi.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Open Design yan dosyasını ekleyin</h3>
      <p><code>open-design.json</code>, çıplak bir beceriyi bir marketplace eklentisine dönüştüren şeydir: başlık, açıklama, bildirilmiş girdiler, önizleme ve kaynak depo. Bu, "kullan" panelini ve kaynak satırını yönlendiren meta veridir.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Tasarım sistemini ekleyin</h3>
      <p>İş akışı marka kurallarına bağlıysa, rengi ve tipografiyi düzyazıya gömmek yerine <code>design-systems/</code> altına bir <code>DESIGN.md</code> dosyası ekleyin. Ajan sistemi bir sözleşme olarak alır — OKLch paleti, tipografi rampası, yerleşim duruşu — böylece üretilen on ekran hâlâ tek bir ürün gibi hisseder. Proje ortasında sistemleri karıştırmak da işe yarar, çünkü onlar sadece metindir.</p>
      <h3>5. Gerçek bir örnek ekleyin</h3>
      <p>Üretilen bir eseri <code>examples/</code> altına kaydedin, böylece gözden geçirenler yalnızca vaadi değil çıktıyı da değerlendirebilir. Bilinen-iyi tek bir <code>example.html</code>, bir paragraf açıklamadan daha değerlidir; ajana örüntü eşleştirecek bir şey verir ve bir bakım sorumlusuna onaylayacak bir şey verir.</p>
      <p>Bir araya getirildiğinde, eklenti tek, okunabilir bir klasördür:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Doğrulayın ve paketleyin</h3>
      <p>Bir PR açmadan önce eklenti komutlarını çalıştırın. Mevcut CLI yolu küçük harfli bir eklenti kimliği kullanır. İskelet oluşturma sırasında eğik çizgiyle ayrılmış kayıt defteri adlarından kaçının; <code>od plugin scaffold</code>, <code>&#x3C;out>/&#x3C;id>/...</code> oluşturur, böylece izleyen komutlar o üretilen klasöre işaret eder:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Eklenti kayıt defteri incelemesine hazır olduğunda, <code>od plugin login</code> ve <code>od plugin whoami --json</code> ile GitHub üzerinden kimlik doğrulaması yapın, ardından mevcut inceleme yolu için yayımlama dokümanlarını izleyin. Open Design, GitHub kimlik bilgilerinizi saklamaz.</p>
      <h2>Bunun gerçek bir tasarım ekibinde nasıl göründüğü</h2>
      <p>Bir lansman sayfası için bir Figma çerçevesi, bir kurumsal marka sistemi ve aylık bir yayın ritmi olan küçük bir ürün ekibi hayal edin.</p>
      <p>Eklentiden önce, iş akışı bir devir zinciridir: tasarımcı çerçeveleri dışa aktarır, mühendis yerleşimi yeniden oluşturur, PM metni yeniden yazar, biri token kaymasını kontrol eder, başka biri hata dosyalar. İş tanıdıktır, ama hafıza insanlarda yaşar — ve biri izinde olduğunda, ekip değiştirdiğinde veya önemli olan tek kısıtlamayı unuttuğunda her seferinde sızar.</p>
      <p>Eklentiden sonra, iş akışı çalıştırılabilir bir esere dönüşür:</p>




























      <table><thead><tr><th>Adım</th><th>Kim yönlendirir</th></tr></thead><tbody><tr><td>Eklentiyi seçin</td><td>Tasarımcı veya PM</td></tr><tr><td>Figma URL / ekran görüntüsü / yerel varlıkları ekleyin</td><td>Tasarımcı</td></tr><tr><td>Marka sistemini seçin</td><td>Tasarımcı veya tasarım mühendisi</td></tr><tr><td>Web eserini üretin</td><td>Claude Code, Cursor, Codex, Gemini CLI veya tespit edilen başka bir ajan</td></tr><tr><td>Bölüm kimliklerini, metni, yoğunluğu ve duyarlı davranışı gözden geçirin</td><td>Open Design önizlemesindeki insan</td></tr><tr><td>Dosyaları dışa aktarın veya devredin</td><td>Aynı yerel proje klasörü</td></tr></tbody></table>
      <p>Ekibin hâlâ zevke ihtiyacı var — gözden geçirme adımı onun yaşadığı yerdir ve hiçbir eklenti onun yerini almaz. Eklentinin kaldırdığı şey yeniden anlatmaktır: kısıtlamalar, token haritası ve çıktı yolu kabilesel bilgi olmaktan çıkar ve depoda bir dosya haline gelir.</p>
      <h2>Sırada ne yapılmalı</h2>
      <p>Ekibinizin sürekli geri dönen bir Figma dışa aktarımı, token senkronizasyonu, marka kiti veya sunum şablonu varsa, önce en küçük tekrarlanabilir dilimi taşıyın. Bir <code>SKILL.md</code> ile başlayın, <code>open-design.json</code> ekleyin, marka <code>DESIGN.md</code> dosyasını iliştirin, gerçek bir örnek bırakın, doğrulayın ve iş akışı başka kimsenin yeniden kullanamayacağı özel bir araca dönüşmeden önce PR'ı açın. Ekran görüntüsünden prototipe örneği, eklenti biçimli versiyonu baştan sona gösterir: taşınabilir bir beceri artı bir Open Design yan dosyası.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Bu iş akışını deneyin</a>.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır</a> — bir eklentinin sardığı ilkel öğeler</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — iş akışının neden hesap biçimli değil dosya biçimli olduğu</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma'ya açık kaynaklı alternatif</a> — iş akışınızı taşımanın mevcut lidere göre nereye yerleştiği</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı: Claude, Codex veya Qwen'i kendi anahtarınızla çalıştırın</a> — aynı eklentinin ekibinizin zaten güvendiği model yolunda nasıl çalışabileceği</li>
      </ul>
  uk:
    title: "Як перенести робочий процес Figma у плагін Open Design"
    summary: "Гілка 0.8.0-preview просить контриб’юторів переносити старі дизайнерські робочі процеси по одному плагіну за раз. Ось конкретний шлях для експорту Figma, синхронізації токенів чи бренд-кита."
    bodyHtml: |
      <p>Робочий процес Figma зазвичай починається як м’язова пам’ять: експортувати ці фрейми, синхронізувати ті токени, перебудувати той шаблон презентації, передати специфікацію розробці. Це той вид роботи, що живе в чиїйсь голові й переоповідається щоразу, коли стартує новий проєкт.</p>
      <p>Гілка 0.8.0-preview ставить чіткіше прохання: перенесіть цю м’язову пам’ять у плагін. Не панель, прикручену до полотна. Не приватний скрипт, який може запустити лише одна команда. Багаторазовий робочий процес Open Design, який агент може взяти, виконати, переглянути й передати далі тим самим локально-орієнтованим циклом, що й будь-яке інше дизайнерське завдання.</p>
      <p>Це практична версія <a href="https://github.com/nexu-io/open-design/discussions/1727">заклику до плагінів 0.8.0-preview</a>. Якщо у вашої команди сьогодні є один повторюваний дизайнерський робочий процес, цей допис показує, як виглядає перетворення його на внесок у формі плагіна — які файли йому потрібні, як агент його підхоплює та де він опиняється, щойно його опубліковано.</p>
      <h2>Робочий процес, який варто переносити, менший, ніж ви думаєте</h2>
      <p>Не починайте з «замінити Figma». Почніть з однієї дратівливої повторюваної роботи.</p>
      <p>Хороші кандидати на перший плагін:</p>

























      <table><thead><tr><th>Поточний робочий процес</th><th>Версія у формі плагіна</th></tr></thead><tbody><tr><td>Експортувати маркетингову сторінку Figma й перебудувати її в коді</td><td>Плагін <code>figma-migration</code>, що витягує макет, мапить токени й генерує вебартефакт</td></tr><tr><td>Щомісяця перетворювати бренд-кит на слайди для запуску</td><td>Плагін презентацій з <code>SKILL.md</code>, прикладами активів і зафіксованою дизайн-системою</td></tr><tr><td>Створювати той самий мобільний онбординг-макет для кожного клієнта</td><td>Плагін мобільних екранів з полями вводу для аудиторії, тону, списку функцій і платформи</td></tr><tr><td>Перетворювати специфікацію компонента на готовий до Storybook UI</td><td>Плагін міграції коду, що читає репозиторій, мапить компоненти й пише придатний до перегляду diff</td></tr></tbody></table>
      <p>Одиниця — це не весь дизайнерський відділ. Одиниця — це один робочий процес, який хтось уже повторює двічі на тиждень. Якщо ви не можете описати його одним реченням — «перетворити X на Y з такими обмеженнями» — то це, ймовірно, два плагіни, а не один, і вам варто розділити його, перш ніж писати хоч рядок Markdown.</p>
      <p>Саме тому <a href="/blog/why-we-built-open-design-as-a-skill-layer/">рівень навичок</a> Open Design тут важливий. Плагін — це не непрозоре розширення середовища виконання. Це тека з файлами: контракт <code>SKILL.md</code>, необов’язкові дизайн-системи, необов’язкові приклади та супутній файл <code>open-design.json</code>, що каже Open Design, як відображати й застосовувати робочий процес. Між вами та правилами немає бінарного формату, а це означає, що будь-хто може прочитати плагін, форкнути його чи виправити пізніше.</p>
      <figure>
        <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="Дизайнерський фрейм, що витягується з полотна й кладеться в коробку портативного модуля, виділений зеленою рамкою на майже білому редакційному тлі">
        <figcaption>Перенесення робочого процесу означає підняти повторювану частину з полотна в портативний плагін.</figcaption>
      </figure>
      <h2>Кут Open Design — це портативність</h2>
      <p>Специфікація плагіна формулює контракт прямо: <code>SKILL.md</code> лишається виконуваним контрактом агента, тоді як <code>open-design.json</code> додає метадані маркетплейсу, поля вводу, значення за замовчуванням, попередні перегляди та підключення контексту.</p>
      <p>Це дає одному робочому процесу два життя. В Open Design він з’являється як плагін із попереднім переглядом, входами, походженням і шляхом «використати» в один клік. У Claude Code, Cursor, Codex, Gemini CLI, OpenClaw чи іншому каталозі навичок та сама тека все одно працює як звичайна навичка агента, бо основна поведінка живе в Markdown. Ви пишете не для середовища виконання, що застаріє наступного року; ви пишете файл, який агент читатиме так само й через два роки.</p>
      <p><a href="/blog/31-skills-72-systems-how-the-library-works/">Огляд бібліотеки</a> вже пояснює базові примітиви: навички, системи, адаптери та daemon. Плагіни додають дистрибуцію й повторюваність навколо цих примітивів — це одиниця, яку команда постачає, переглядає та повторно використовує, а не сира навичка, яку агент випадково виявляє на диску.</p>
      <p>Для робочого процесу Figma-у-код поверхні зазвичай виглядають так:</p>





























      <table><thead><tr><th>Поверхня</th><th>Конкретний файл</th></tr></thead><tbody><tr><td>Поведінка агента</td><td><code>SKILL.md</code></td></tr><tr><td>Метадані Open Design</td><td><code>open-design.json</code></td></tr><tr><td>Бренд- чи візуальний контракт</td><td><code>design-systems/{brand}/DESIGN.md</code></td></tr><tr><td>Приклад результату</td><td><code>example.html</code> або <code>examples/{plugin-id}/example.html</code> всередині теки плагіна</td></tr><tr><td>Медіа попереднього перегляду</td><td><code>preview/poster.png</code> або <code>preview/index.html</code> всередині теки плагіна</td></tr></tbody></table>
      <p>Результат — не генератор скриншотів. Це багаторазовий робочий процес агента з видимим контрактом — кожне правило, якого дотримується агент, сидить у теці, де людина може його прочитати й відредагувати.</p>
      <h2>Конкретний шлях перенесення</h2>
      <p>Ось мінімальний шлях для плагіна, що переносить один робочий процес лендингу Figma. Усе це — шість кроків, і більшість з них — це Markdown.</p>
      <h3>1. Назвіть повторювану роботу</h3>
      <p>Запишіть єдине речення, що описує роботу: «Перетворити один маркетинговий фрейм Figma на адаптивну сторінку Astro у фірмовій брендовій системі, готову до перегляду». Якщо ви не можете вмістити це в одне речення, звужуйте, доки не зможете. Назва стає id вашого плагіна (<code>figma-workflow</code>) і заголовком, що показується в маркетплейсі.</p>
      <h3>2. Напишіть контракт навички</h3>
      <p><code>SKILL.md</code> — це виконуваний контракт, який читає агент. Front matter називає навичку та її тригер; тіло — це бриф: форма входу, шлях виводу, обмеження й чек-лист перегляду, який агент має застосувати до себе перед передачею далі.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="markdown"><code><span class="line"><span style="color:#15140F">---</span></span>
      <span class="line"><span style="color:#15140F">name: figma-workflow</span></span>
      <span class="line"><span style="color:#15140F">description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.</span></span>
      <span class="line"><span style="color:#15140F">trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">---</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Input</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> A Figma frame URL, a screenshot, or a folder of exported assets.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> The target brand system (defaults to </span><span style="color:#5A5448">`</span><span style="color:#2A2620">house</span><span style="color:#5A5448">`</span><span style="color:#15140F">).</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Output</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> An Astro page at </span><span style="color:#5A5448">`</span><span style="color:#2A2620">src/pages/&#x3C;slug>.astro</span><span style="color:#5A5448">`</span><span style="color:#15140F">, plus extracted tokens.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Constraints</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Map Figma styles to the brand system's tokens. Do not invent colors or type.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Preserve section order and copy. Flag any text that does not fit the grid.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> Mobile-first: every section must reflow at 360px before desktop.</span></span>
      <span class="line"></span>
      <span class="line"><span style="color:#5A5448;font-weight:bold">##</span><span style="color:#15140F;font-weight:bold"> Review checklist</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Section IDs match the source frame.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] No raw hex values — tokens only.</span></span>
      <span class="line"><span style="color:#5A5448">-</span><span style="color:#15140F"> [ ] Responsive behavior verified at 360 / 768 / 1280.</span></span></code></pre>
      <h3>3. Додайте супутній файл Open Design</h3>
      <p><code>open-design.json</code> — це те, що перетворює голу навичку на плагін маркетплейсу: заголовок, опис, оголошені входи, попередній перегляд і репозиторій-джерело. Це метадані, що керують панеллю «використати» й рядком походження.</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figma-workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">title</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">description</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Port one Figma marketing frame into a responsive Astro page.</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">inputs</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">figmaSource</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma URL or screenshot</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">required</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#ED6F5C"> true</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">key</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">brand</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">label</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Brand system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">type</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">string</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">default</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">house</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">preview</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">preview/poster.png</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">https://github.com/your-org/your-plugins</span><span style="color:#5A5448">"</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <h3>4. Приєднайте дизайн-систему</h3>
      <p>Якщо робочий процес залежить від брендових правил, додайте файл <code>DESIGN.md</code> у <code>design-systems/</code> замість того, щоб ховати колір і типографіку в прозі. Агент засвоює систему як контракт — палітра OKLch, типографічна шкала, постава макета — тож десять згенерованих екранів усе одно відчуваються як один продукт. Змішування систем посеред проєкту теж працює, бо це просто текст.</p>
      <h3>5. Включіть один справжній приклад</h3>
      <p>Збережіть згенерований артефакт у <code>examples/</code>, щоб рецензенти могли судити про результат, а не лише про обіцянку. Один завідомо хороший <code>example.html</code> вартий більше, ніж абзац опису; він дає агенту щось для зіставлення шаблонів, а мейнтейнеру — щось для затвердження.</p>
      <p>Зібраний докупи, плагін — це одна читабельна тека:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="text"><code><span class="line"><span>plugins/community/figma-workflow/</span></span>
      <span class="line"><span>  SKILL.md              # the agent contract: trigger, output, constraints, review</span></span>
      <span class="line"><span>  open-design.json      # marketplace metadata: title, inputs, preview, source</span></span>
      <span class="line"><span>  design-systems/</span></span>
      <span class="line"><span>    house/</span></span>
      <span class="line"><span>      DESIGN.md         # the brand contract the agent must respect</span></span>
      <span class="line"><span>  examples/</span></span>
      <span class="line"><span>    figma-workflow/</span></span>
      <span class="line"><span>      example.html      # one known-good artifact reviewers can judge</span></span>
      <span class="line"><span>  preview/</span></span>
      <span class="line"><span>    poster.png          # marketplace preview media</span></span></code></pre>
      <h3>6. Перевірте та запакуйте</h3>
      <p>Запустіть команди плагіна перед відкриттям PR. Поточний шлях CLI використовує id плагіна в нижньому регістрі. Уникайте назв реєстру, розділених скісними рисками, на етапі скафолдингу; <code>od plugin scaffold</code> створює <code>&#x3C;out>/&#x3C;id>/...</code>, тож подальші команди вказують на цю згенеровану теку:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="bash"><code><span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> scaffold</span><span style="color:#6E7448"> --id</span><span style="color:#6E7448"> figma-workflow</span><span style="color:#6E7448"> --title</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Figma workflow</span><span style="color:#5A5448">"</span><span style="color:#6E7448"> --out</span><span style="color:#6E7448"> ./plugins/community</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> validate</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span><span style="color:#6E7448"> --no-daemon</span></span>
      <span class="line"><span style="color:#15140F;font-weight:bold">od</span><span style="color:#6E7448"> plugin</span><span style="color:#6E7448"> pack</span><span style="color:#6E7448"> ./plugins/community/figma-workflow</span></span></code></pre>
      <p>Коли плагін готовий до перевірки в реєстрі, автентифікуйтеся через GitHub за допомогою <code>od plugin login</code> та <code>od plugin whoami --json</code>, потім дотримуйтеся документації з публікації для поточного шляху перевірки. Open Design не зберігає ваші облікові дані GitHub.</p>
      <h2>Як це виглядає в реальній дизайнерській команді</h2>
      <p>Уявіть невелику продуктову команду з фреймом Figma для сторінки запуску, фірмовою брендовою системою та щомісячним ритмом релізів.</p>
      <p>До плагіна робочий процес — це ланцюг передач: дизайнер експортує фрейми, інженер перебудовує макет, продакт-менеджер переписує тексти, хтось перевіряє дрейф токенів, ще хтось файлить баги. Робота знайома, але пам’ять живе в людях — і вона витікає щоразу, коли хтось відсутній, переходить у іншу команду чи забуває те єдине обмеження, що мало значення.</p>
      <p>Після плагіна робочий процес стає запускним артефактом:</p>

































      <table><thead><tr><th>Крок</th><th>Хто ним керує</th></tr></thead><tbody><tr><td>Обрати плагін</td><td>Дизайнер або продакт-менеджер</td></tr><tr><td>Приєднати URL Figma / скриншот / локальні активи</td><td>Дизайнер</td></tr><tr><td>Обрати брендову систему</td><td>Дизайнер або дизайн-інженер</td></tr><tr><td>Згенерувати вебартефакт</td><td>Claude Code, Cursor, Codex, Gemini CLI чи інший виявлений агент</td></tr><tr><td>Переглянути ID секцій, тексти, щільність і адаптивну поведінку</td><td>Людина в попередньому перегляді Open Design</td></tr><tr><td>Експортувати чи передати файли далі</td><td>Та сама локальна тека проєкту</td></tr></tbody></table>
      <p>Команді все одно потрібен смак — крок перегляду — це там, де він живе, і жоден плагін його не замінює. Що плагін усуває, так це переоповідання: обмеження, мапа токенів і шлях виводу перестають бути племінним знанням і стають файлом у репозиторії.</p>
      <h2>Що робити далі</h2>
      <p>Якщо у вашої команди є експорт Figma, синхронізація токенів, бренд-кит чи шаблон презентації, що постійно повертається, перенесіть спершу найменший повторюваний шматок. Почніть з <code>SKILL.md</code>, додайте <code>open-design.json</code>, приєднайте брендовий <code>DESIGN.md</code>, вкиньте один справжній приклад, перевірте його й відкрийте PR, перш ніж робочий процес виросте в приватний інструмент, який більше ніхто не зможе повторно використати. Приклад «скриншот-у-прототип» показує версію у формі плагіна від початку до кінця: портативна навичка плюс супутній файл Open Design.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype">Спробуйте цей робочий процес</a>.</p>
      <h2>Пов’язане для читання</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи: як працює бібліотека Open Design</a> — примітиви, які обгортає плагін</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a> — чому робочий процес має форму файлу, а не акаунта</li>
      <li><a href="/blog/figma-alternative-open-design/">Опенсорсна альтернатива Figma</a> — де опиняється перенесення вашого робочого процесу відносно лідера ринку</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-робочий процес дизайну: запускайте Claude, Codex чи Qwen на власному ключі</a> — як той самий плагін може працювати на шляху моделі, якому ваша команда вже довіряє</li>
      </ul>
---

A Figma workflow usually starts as muscle memory: export these frames, sync those tokens, rebuild that deck template, hand the spec to engineering. It is the kind of work that lives in someone's head and gets re-explained every time a new project starts.

The 0.8.0-preview thread makes a sharper ask: port that muscle memory into a plugin. Not a panel bolted onto a canvas. Not a private script only one team can run. A reusable Open Design workflow that an agent can pick up, execute, review, and hand off through the same local-first loop as any other design task.

This is the practical version of the [0.8.0-preview call for plugins](https://github.com/nexu-io/open-design/discussions/1727). If your team has one repeatable design workflow today, this post shows what it looks like to turn it into a plugin-shaped contribution — what files it needs, how the agent picks it up, and where it lands once it is published.

## The workflow worth porting is smaller than you think

Do not start with "replace Figma." Start with one annoying, repeatable job.

Good first plugin candidates:

| Current workflow | Plugin-shaped version |
|---|---|
| Export a Figma marketing page and rebuild it in code | `figma-migration` plugin that extracts layout, maps tokens, and generates a web artifact |
| Turn a brand kit into launch slides every month | Deck plugin with a `SKILL.md`, example assets, and a locked design system |
| Create the same mobile onboarding mockup for every client | Mobile-screen plugin with input fields for audience, tone, feature list, and platform |
| Convert a component spec into Storybook-ready UI | Code-migration plugin that reads the repo, maps components, and writes a reviewable diff |

The unit is not the whole design department. The unit is one workflow someone already repeats twice a week. If you cannot describe it in a single sentence — "turn X into Y, with these constraints" — it is probably two plugins, not one, and you should split it before you write a line of Markdown.

That is why Open Design's [skill layer](/blog/why-we-built-open-design-as-a-skill-layer/) matters here. A plugin is not an opaque runtime extension. It is a folder of files: a `SKILL.md` contract, optional design systems, optional examples, and an `open-design.json` sidecar that tells Open Design how to display and apply the workflow. There is no binary format between you and the rules, which means anyone can read the plugin, fork it, or fix it later.

<figure>
  <img src="/blog/port-figma-workflow-open-design-plugin-inline.webp" alt="A design frame being extracted from a canvas and dropped into a portable module box, selected in a green frame on a near-white editorial ground" />
  <figcaption>Porting a workflow means lifting the repeatable part out of the canvas and into a portable plugin.</figcaption>
</figure>

## The Open Design angle is portability

The plugin spec states the contract plainly: `SKILL.md` stays the executable agent contract, while `open-design.json` adds marketplace metadata, input fields, defaults, previews, and context wiring.

That gives one workflow two lives. In Open Design, it appears as a plugin with a preview, inputs, provenance, and a one-click "use" path. In Claude Code, Cursor, Codex, Gemini CLI, OpenClaw, or another skill catalog, the same folder still works as a plain agent skill because the core behavior lives in Markdown. You are not writing for a runtime that will deprecate next year; you are writing a file an agent reads the same way two years from now.

The [library walkthrough](/blog/31-skills-72-systems-how-the-library-works/) already explains the base primitives: skills, systems, adapters, and the daemon. Plugins add distribution and repeatability around those primitives — they are the unit a team ships, reviews, and reuses, rather than the raw skill an agent happens to discover on disk.

For a Figma-to-code workflow, the surfaces usually look like this:

| Surface | Concrete file |
|---|---|
| Agent behavior | `SKILL.md` |
| Open Design metadata | `open-design.json` |
| Brand or visual contract | `design-systems/{brand}/DESIGN.md` |
| Example output | `example.html` or `examples/{plugin-id}/example.html` inside the plugin folder |
| Preview media | `preview/poster.png` or `preview/index.html` inside the plugin folder |

The result is not a screenshot generator. It is a reusable agent workflow with a visible contract — every rule the agent follows is sitting in the folder where a human can read and edit it.

## A concrete porting path

Here is the minimum path for a plugin that ports one Figma landing-page workflow. The whole thing is six steps, and most of them are Markdown.

### 1. Name the repeatable job

Write down the single sentence that describes the job: "Turn one Figma marketing frame into a responsive Astro page, in the house brand system, ready for review." If you cannot fit it in a sentence, narrow it until you can. The name becomes your plugin id (`figma-workflow`) and the title shown in the marketplace.

### 2. Write the skill contract

`SKILL.md` is the executable contract the agent reads. Front matter names the skill and its trigger; the body is the brief — input shape, output path, constraints, and a review checklist the agent should self-apply before it hands off.

```markdown
---
name: figma-workflow
description: Turn one Figma marketing frame into a responsive Astro page in the house brand system.
trigger: When the user provides a Figma frame URL, screenshot, or exported assets for a marketing page.
---

## Input
- A Figma frame URL, a screenshot, or a folder of exported assets.
- The target brand system (defaults to `house`).

## Output
- An Astro page at `src/pages/<slug>.astro`, plus extracted tokens.

## Constraints
- Map Figma styles to the brand system's tokens. Do not invent colors or type.
- Preserve section order and copy. Flag any text that does not fit the grid.
- Mobile-first: every section must reflow at 360px before desktop.

## Review checklist
- [ ] Section IDs match the source frame.
- [ ] No raw hex values — tokens only.
- [ ] Responsive behavior verified at 360 / 768 / 1280.
```

### 3. Add the Open Design sidecar

`open-design.json` is what turns a bare skill into a marketplace plugin: title, description, declared inputs, preview, and source repo. This is the metadata that drives the "use" panel and the provenance line.

```json
{
  "id": "figma-workflow",
  "title": "Figma workflow",
  "description": "Port one Figma marketing frame into a responsive Astro page.",
  "inputs": [
    { "key": "figmaSource", "label": "Figma URL or screenshot", "type": "string", "required": true },
    { "key": "brand", "label": "Brand system", "type": "string", "default": "house" }
  ],
  "preview": "preview/poster.png",
  "source": "https://github.com/your-org/your-plugins"
}
```

### 4. Attach the design system

If the workflow depends on brand rules, add a `DESIGN.md` file under `design-systems/` instead of burying color and typography in prose. The agent ingests the system as a contract — OKLch palette, type ramp, layout posture — so ten generated screens still feel like one product. Mixing systems mid-project works too, because they are just text.

### 5. Include one real example

Save a generated artifact under `examples/` so reviewers can judge the output, not just the promise. One known-good `example.html` is worth more than a paragraph of description; it gives the agent something to pattern-match and gives a maintainer something to approve.

Put together, the plugin is a single, readable folder:

```text
plugins/community/figma-workflow/
  SKILL.md              # the agent contract: trigger, output, constraints, review
  open-design.json      # marketplace metadata: title, inputs, preview, source
  design-systems/
    house/
      DESIGN.md         # the brand contract the agent must respect
  examples/
    figma-workflow/
      example.html      # one known-good artifact reviewers can judge
  preview/
    poster.png          # marketplace preview media
```

### 6. Validate and pack

Run the plugin commands before opening a PR. The current CLI path uses a lowercase plugin id. Avoid slash-separated registry names at scaffold time; `od plugin scaffold` creates `<out>/<id>/...`, so the follow-up commands point at that generated folder:

```bash
od plugin scaffold --id figma-workflow --title "Figma workflow" --out ./plugins/community
od plugin validate ./plugins/community/figma-workflow --no-daemon
od plugin pack ./plugins/community/figma-workflow
```

When the plugin is ready for registry review, authenticate through GitHub with `od plugin login` and `od plugin whoami --json`, then follow the publishing docs for the current review path. Open Design does not store your GitHub credentials.

## What this looks like in a real design team

Imagine a small product team with a Figma frame for a launch page, a house brand system, and a monthly release rhythm.

Before the plugin, the workflow is a handoff chain: designer exports frames, engineer rebuilds layout, PM rewrites copy, someone checks token drift, someone else files bugs. The work is familiar, but the memory lives in people — and it leaks every time someone is out, switches teams, or forgets the one constraint that mattered.

After the plugin, the workflow becomes a runnable artifact:

| Step | Who directs it |
|---|---|
| Choose the plugin | Designer or PM |
| Attach Figma URL / screenshot / local assets | Designer |
| Pick the brand system | Designer or design engineer |
| Generate the web artifact | Claude Code, Cursor, Codex, Gemini CLI, or another detected agent |
| Review section IDs, copy, density, and responsive behavior | Human in the Open Design preview |
| Export or hand off files | The same local project folder |

The team still needs taste — the review step is where it lives, and no plugin replaces it. What the plugin removes is the re-explaining: the constraints, the token map, and the output path stop being tribal knowledge and become a file in the repo.

## What to do next

If your team has a Figma export, token sync, brand kit, or deck template that keeps coming back, port the smallest repeatable slice first. Start with a `SKILL.md`, add `open-design.json`, attach the brand `DESIGN.md`, drop in one real example, validate it, and open the PR before the workflow grows into a private tool nobody else can reuse. The screenshot-to-prototype example shows the plugin-shaped version end to end: a portable skill plus an Open Design sidecar.

[Try this workflow](https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype).

## Related reading

- [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/) — the primitives a plugin wraps
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — why the workflow is file-shaped instead of account-shaped
- [The open-source alternative to Figma](/blog/figma-alternative-open-design/) — where porting your workflow lands relative to the incumbent
- [BYOK design workflow: run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — how the same plugin can run on the model path your team already trusts
