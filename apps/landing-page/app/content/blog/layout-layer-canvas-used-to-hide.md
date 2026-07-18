---
title: "The layout layer the canvas used to hide"
date: 2026-05-18
category: "Community"
readingTime: 7
summary: "A community reply on the 0.8.0 preview named the real question behind agent-native design: if the canvas stops being the work unit, how do users still understand layout?"
i18n:
  zh:
    title: "画布曾经藏起来的那一层版式"
    summary: "0.8.0 preview 下的一条社区回复，点出了 agent 原生设计背后真正的问题：如果画布不再是工作单位，用户又该如何理解版式？"
    bodyHtml: |
      <p>一条有用的社区回复不会要一个更大的按钮。它会点出那个缺失的层。</p>
      <p>这就是 <a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview 讨论</a> 下发生的事。发布帖主张了两个转变：别再把画布当作主要的工作单位，并让 agent 成为一等的设计工作者。一条回复认同这个方向，然后指向了难的那部分：当画布消失时，用户在能够有把握地编辑 agent 做出来的东西之前，仍然需要一种方式去理解它。</p>
      <p>那条回复里的说法是「版式理解层（Layout Understanding Layer）」。这是个好名字，因为它拒绝了那个偷懒的答案。agent 原生设计不能意味着「相信那张截图」。它需要一个可读的产物模型：分节、意图、可编辑的部分、稳定的引用，以及建议的编辑动作。这篇文章是认真对待那条回复的一次尝试——勾勒这样一个层可以承载什么、它在 Open Design 里应该住在哪里，以及为什么它是一条贡献路径、而非一项路线图承诺。</p>
      <h2>画布给了设计师空间上的笃定</h2>
      <p>Figma 的画布不只是一块绘图表面。它也是一块解释表面。你可以缩小看页面层级，点击一个 frame，检视约束，重命名图层，并理解工作的一块从哪里结束、另一块从哪里开始。</p>
      <h3>当画布消失时你真正失去的是什么</h3>
      <p>这种理解在它还在时很容易被低估，直到它没了。一个生成出来的落地页在沙箱预览里看起来可以是正确的，却仍然难以指挥。问题不在像素——在于人与 agent 之间缺少一套共享的词汇。</p>
      <p>「让 hero 更自信一点」只有在 agent 和人对 hero 是什么达成一致时才有用。「收紧 pricing 这一节」只有在产物跨修订版携带着稳定的分节身份时才管用。没有这些，每一条指令都退化成指指点点：设计师用位置来描述一个区域（「从上往下第二块」），agent 从渲染输出里去猜，而下一次重新生成又悄悄把一切重新编了号。画布过去把这个成本默默地吸收掉了。它替你给各部分命了名，在你工作时让那些名字保持稳定，并让你不用描述就能选中其中一个。</p>
      <h3>即便工作单位错了，那份清晰仍值得留下</h3>
      <p>这是 #DeFigma 论点里需要小心的部分。对一个 agent 原生的系统来说，画布也许是错误的工作单位——它假定的是一个人在拖矩形，而不是一个 agent 在写文件——但人们从画布那里得到的清晰仍然是有价值的。错误会是把「丢掉画布」和「丢掉画布所提供的那份理解」当成同一个决定。它们不是。Open Design 必须把那份清晰挪进产物模型里，而不是把它扔掉。版式层就是这次挪移的名字。</p>
      <h2>Open Design 已经有了正确的原语</h2>
      <p>这个提案契合 Open Design 的原因，在于这个项目本就是围绕显式契约构建的。一个 skill 是一个 <code>SKILL.md</code> 文件。一个设计系统是一个 <code>DESIGN.md</code> 文件。一个插件添上一个 <code>open-design.json</code> 伴随文件。系统里没有任何东西是你必须逆向工程的二进制 blob；契约就是文本，而文本是 agent 和人类都能读的东西。机制在 <a href="/blog/31-skills-72-systems-how-the-library-works/">31 个 skill、72 个 system：Open Design 库是怎么运作的</a> 里讲过，产品论点在 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a> 里。</p>
      <p>版式层应当遵循同样的模式。它应当是 agent 能读的文本、UI 能渲染的状态、另一个 agent 能复用的元数据。如果它没法同时满足这三点，那它就是错误的形状。</p>
      <p>用仓库的话说，这指向三个面：</p>





















      <table><thead><tr><th>面</th><th>它应当承载什么</th></tr></thead><tbody><tr><td>产物清单</td><td>分节、组件、资源和生成文件的稳定 ID</td></tr><tr><td>插件快照</td><td>是哪个 skill、设计系统、输入和流水线阶段产出了这个产物</td></tr><tr><td>审查 UI / 无头输出</td><td>一张版式地图、可编辑的方面，以及建议的编辑意图</td></tr></tbody></table>
      <p>重要的约束：这个层不应变成第二块专有画布。要避免的失败模式是给 Figma 的场景图换个名字重建一遍——一个丰富的、应用专属的结构，只有 Open Design 的 UI 能渲染它，而你一离开这个应用它就死掉。版式层应当反过来是一张随文件一起走的、朴素的产物地图，这样一个贡献者能在文本编辑器里读它，另一个 agent 也能在没有 SDK 的情况下消费它。</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="一具线框版式骨架作为它自己可选中的一层、从一块空白画布上方抬出，在近白色的编辑风底纹上被绿色框选中">
        <figcaption>版式层是画布保持隐含的那个结构——被拽出来放到 agent 和人类都能读到的地方。</figcaption>
      </figure>
      <h2>版式层一个实用的形状</h2>
      <p>这里是能让 agent 原生设计感觉不那么不透明的最小版本：</p>
      <ol>
      <li>每个生成出来的产物都拿到稳定的语义 ID：<code>hero</code>、<code>proof-strip</code>、<code>pricing</code>、<code>faq</code>、<code>final-cta</code>。</li>
      <li>每个 ID 携带一句意图：「在一屏里说清产品承诺」，而不是「顶部那一节」。</li>
      <li>每一节列出可编辑的方面：文案、密度、布局、颜色、媒体、动效、数据源。</li>
      <li>每个生成文件回链到产出它的那个分节 ID。</li>
      <li>每一轮审查发出建议的编辑意图：「缩短 hero 标题」、「提高 pricing 卡片的对比度」、「拆分 testimonial 块」。</li>
      <li>UI 把这渲染成一个导航器，而无头用户拿到的是同样结构的 JSON 或 Markdown。</li>
      </ol>
      <h3>一份清单实际可能长什么样</h3>
      <p>把它写下来的意义在于：这个结构平平无奇——这恰恰是为什么它能成为一份公开契约、而非一个私有花招。一份生成出来的落地页的清单可能读起来像这样：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>这些 key 没有一个是奇异的。<code>sections</code> 是一个列表，<code>editable</code> 是一个枚举，<code>files</code> 是一个反向引用。价值不在 schema 有多聪明——而在于这些 ID 能在一次重新生成中存活下来，所以那同一个 <code>pricing</code> 块在 agent 重写它两次之后仍然是 <code>pricing</code>。</p>
      <p>这就足以让一位设计师说出「把 <code>pricing</code> 从三个套餐改成两个」，也足以让一个代码 agent 在不靠像素去猜的情况下打补丁到正确的文件上。指令解析到一个分节 ID，分节 ID 解析到一组文件，编辑就落在了它本该落的地方。</p>
      <h3>为什么这是一条贡献路径、而非一项功能请求</h3>
      <p>它还给了社区一条干净的贡献路径。一个贡献者不需要重新设计整个产品才能在这里帮上忙。他们可以写一个为某一种产物类型发出清单的 skill、一个提出编辑意图的审查原子、一个添上某个字段让其他 skill 能读的清单扩展，或者一个断言分节 ID 跨重新生成保持稳定的测试用例。这其中每一个都是一处小的、可合并的改动，让某一个输出不那么不透明——并且因为这个层是纯文本，两位分别在做一套 deck 和一个移动端屏幕的贡献者不必去协调一种共享的二进制格式。版式层成了一份公开契约，而不是埋在应用内部的一项私有能力。</p>
      <h2>接下来该做什么</h2>
      <p>如果这是你想攻克的那类问题，就贡献一个让某一个产物更容易检视的小 skill 或插件。从一个具体的输出起步：一个落地页、一套 deck，或一个移动端屏幕。添上稳定的分节 ID，描述可编辑的方面，把它们作为 JSON 或 Markdown 与产物一并发出，然后开 PR 时附上一个前/后产物，好让审查者看到一个可检视的层带来的差别。</p>
      <p>这仍然是一个方向、而非一项已交付的功能——现在就给它命名的价值在于：那些原语已经存在，所以这项工作是加法、而非一次重写。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">贡献一个 skill</a>。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 个 skill、72 个 system：Open Design 库是怎么运作的</a>——这个提案底下当前那些文件驱动的原语</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a>——让公开产物契约成为可能的那种产品形态</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma 的开源替代品</a>——「丢掉画布」相对于那个把画布奉为核心的老牌玩家落在哪里</li>
      </ul>
  zh-tw:
    title: "畫布過去藏起來的那一層版面"
    summary: "0.8.0 預覽下的一則社群回覆，點名了 agent 原生設計背後真正的問題：如果畫布不再是工作的單位，使用者要如何依然理解版面？"
    bodyHtml: |
      <p>一則有用的社群回覆不會要求一個更大的按鈕。它會點名那一層缺失的東西。</p>
      <p>這正是在 <a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview 討論</a>底下發生的事。那條發表討論串主張了兩個轉變：別再把畫布當成主要的工作單位，並讓 agent 成為一等的設計工作者。一則回覆認同這個方向，接著指向了困難的部分：當畫布消失時，使用者仍然需要一種辦法去理解 agent 做了什麼，然後才能有信心地編輯它。</p>
      <p>那則回覆裡的措辭是「版面理解層（Layout Understanding Layer）」。這是個好名字，因為它拒絕了那個偷懶的答案。agent 原生設計不能意味著「相信那張截圖」。它需要一個產物的可讀模型：區段、意圖、可編輯的部分、穩定的參照，以及建議的編輯動作。這篇文章是一次認真看待那則回覆的嘗試——勾勒這樣的一層可以承載什麼、它在 Open Design 裡應該活在哪裡，以及為什麼它是一條貢獻路徑，而不是一個路線圖承諾。</p>
      <h2>畫布給了設計師空間上的信心</h2>
      <p>Figma 的畫布不只是一個繪圖表面。它也是一個解釋的表面。你可以縮小、看到頁面層級、點一個框架、檢視限制、重新命名圖層，並理解工作的一塊在哪裡結束、另一塊在哪裡開始。</p>
      <h3>當畫布消失時，你實際上失去了什麼</h3>
      <p>那份理解很容易被低估，直到它不見為止。一個生成出來的落地頁在沙盒化的預覽裡可能看起來正確，卻仍然很難去指揮。問題不在像素——而在人類與 agent 之間缺乏一套共享的詞彙。</p>
      <p>「讓 hero 更有自信」只有在 agent 和人類對 hero 是什麼達成共識時才有用。「把定價區段收緊」只有在產物跨修訂版攜帶一個穩定的區段識別時才行得通。沒有那個，每一條指令都退化成用手指：設計師用某個區域的位置來描述它（「從上面數來第二塊」），agent 從渲染輸出來猜，而下一次重新生成又悄悄把一切重新編號。畫布過去默默地吸收了這個成本。它替你替那些部分命名、在你工作時讓那些名字保持穩定，並讓你不必描述就能選取其中一個。</p>
      <h3>即使單位選錯了，那份清晰也值得留住</h3>
      <p>這是 #DeFigma 論述裡需要小心的部分。對一個 agent 原生系統而言，畫布或許是錯誤的工作單位——它假設一個人類在拖拉矩形，而不是一個 agent 在寫檔案——但人們從畫布裡得到的那份清晰仍然有價值。錯誤會是把「丟掉畫布」和「丟掉畫布所提供的那份理解」當成同一個決定。它們不是。Open Design 必須把那份清晰搬進產物模型裡，而不是把它扔掉。版面層正是這次搬遷的名字。</p>
      <h2>Open Design 已經擁有正確的基本元件</h2>
      <p>這個提案之所以契合 Open Design，是因為這個專案本來就圍繞著明確的契約而打造。一個技能是一個 <code>SKILL.md</code> 檔案。一個設計系統是一個 <code>DESIGN.md</code> 檔案。一個外掛加上一個 <code>open-design.json</code> 隨附檔。系統裡沒有任何東西是你必須逆向工程的二進位塊；那些契約是文字，而文字是 agent 和人類都能讀的東西。機制涵蓋在 <a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 個系統：Open Design 函式庫如何運作</a>裡，產品論述則在 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>裡。</p>
      <p>版面層應該遵循同樣的模式。它應該是 agent 能讀的文字、UI 能渲染的狀態，以及另一個 agent 能重複使用的中介資料。如果它沒辦法同時滿足這三者，那它的形態就錯了。</p>
      <p>用 repo 的話來說，這指向三個載體：</p>





















      <table><thead><tr><th>載體</th><th>它應該承載什麼</th></tr></thead><tbody><tr><td>產物清單（manifest）</td><td>給區段、元件、素材和生成檔案的穩定 ID</td></tr><tr><td>外掛快照</td><td>哪個技能、設計系統、輸入和管線階段產生了這個產物</td></tr><tr><td>審查 UI／無頭輸出</td><td>一張版面地圖、可編輯的面向，以及建議的編輯意圖</td></tr></tbody></table>
      <p>重要的限制是：這一層不應該變成第二個專屬的畫布。要避免的失敗模式是用一個新名字重建 Figma 的場景圖——一個豐富、應用程式專屬的結構，只有 Open Design 的 UI 能渲染它，而且你一離開那個 app 它就死了。版面層應該改為一張隨檔案一起旅行的純粹產物地圖，這樣一個貢獻者能在文字編輯器裡讀它，而一個不同的 agent 能不用 SDK 就消費它。</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="一個線框版面骨架從一塊空白畫布上方舉出來、成為它自己一層可選取的圖層，置於一個綠色框中，襯在近白色的編輯風底色上">
        <figcaption>版面層就是畫布過去保持隱含的那個結構——被拉出來放在 agent 和人類兩者都能讀到的地方。</figcaption>
      </figure>
      <h2>版面層一個實務上的形態</h2>
      <p>以下是會讓 agent 原生設計感覺不那麼不透明的最小版本：</p>
      <ol>
      <li>每個生成出來的產物都拿到穩定的語意 ID：<code>hero</code>、<code>proof-strip</code>、<code>pricing</code>、<code>faq</code>、<code>final-cta</code>。</li>
      <li>每個 ID 攜帶一句意圖：「在一個畫面裡解釋產品的承諾」，而不是「最上面的區段」。</li>
      <li>每個區段列出可編輯的面向：文案、密度、版面、色彩、媒體、動態、資料來源。</li>
      <li>每個生成檔案連回產生它的那個區段 ID。</li>
      <li>每一輪審查都發出建議的編輯意圖：「縮短 hero 標題」、「提高定價卡片的對比」、「拆開推薦見證區塊」。</li>
      <li>UI 把這個渲染成一個導覽器，而無頭使用者則以 JSON 或 Markdown 收到同樣的結構。</li>
      </ol>
      <h3>一份 manifest 實際上可能長什麼樣</h3>
      <p>把它寫下來的重點在於，這個結構平淡無奇——而這正是為什麼它能成為一份公開契約，而不是一個私有的把戲。一個生成出來的落地頁的 manifest 可能讀起來像這樣：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>那些鍵沒有一個是奇特的。<code>sections</code> 是一個清單，<code>editable</code> 是一個列舉，<code>files</code> 是一個反向參照。價值不在於這個 schema 的巧妙——而在於那些 ID 能撐過一次重新生成，所以同一個 <code>pricing</code> 區塊在 agent 把它重寫兩次之後，仍然是 <code>pricing</code>。</p>
      <p>這就足以讓一位設計師說：「把 <code>pricing</code> 從三個方案改成兩個」，也足以讓一個程式碼 agent 去修補正確的檔案，而不必從像素去猜。指令解析到一個區段 ID，區段 ID 解析到一組檔案，而那個編輯就落在它本來該落的地方。</p>
      <h3>為什麼這是一條貢獻路徑，而不是一個功能請求</h3>
      <p>它也給了社群一條乾淨的貢獻路徑。一個貢獻者不需要重新設計整個產品才能在這裡幫上忙。他們可以寫一個為某種產物類型發出 manifest 的技能、一個提出編輯意圖的審查原子、一個增加其他技能能讀的欄位的 manifest 擴充，或一個斷言區段 ID 跨重新生成保持穩定的測試案例。其中每一個都是一個小巧、可合併的改動，讓某一個輸出不那麼不透明——而且因為這一層是純文字，兩個分別在做一份簡報和一個行動裝置畫面的貢獻者，不必去協調一個共享的二進位格式。版面層成為一份公開契約，而不是一個埋在 app 裡的私有能力。</p>
      <h2>接下來該做什麼</h2>
      <p>如果這是你想投入的那種問題，那就貢獻一個小型技能或外掛，讓某一個產物更容易檢視。從一個具體的輸出開始：一個落地頁、一份簡報，或一個行動裝置畫面。加上穩定的區段 ID、描述可編輯的面向、把它們以 JSON 或 Markdown 隨產物一起發出，並用一份前後對照的產物開 PR，這樣審查者就能看到一個可檢視的層所帶來的差別。</p>
      <p>這仍然是一個方向，而不是一個已出貨的功能——現在替它命名的價值在於那些基本元件已經存在，所以這份工作是加法式的，而不是一次重寫。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">貢獻一個技能</a>。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 個系統：Open Design 函式庫如何運作</a>——這個提案底下目前那些檔案驅動的基本元件</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>——讓公開產物契約成為可能的那個產品形態</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma 的開源替代方案</a>——「丟掉畫布」相對於那個把畫布奉為核心的既有者，會落在哪裡</li>
      </ul>
  ja:
    title: "キャンバスが隠していたレイアウトレイヤー"
    summary: "0.8.0 プレビューへのコミュニティからの返信が、エージェントネイティブなデザインの背後にある本当の問いを名指ししました：キャンバスが作業の単位でなくなるなら、ユーザーはどうやってレイアウトを理解し続けるのか？"
    bodyHtml: |
      <p>有用なコミュニティの返信は、もっと大きなボタンを求めたりしません。欠けているレイヤーを名指しします。</p>
      <p>それが <a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview のディスカッション</a>の下で起きたことです。ローンチのスレッドは 2 つのシフトを主張しました：キャンバスを主要な作業単位として扱うのをやめること、そしてエージェントを第一級のデザイン作業者にすること。ある返信はその方向性に同意し、それから難しい部分を指し示しました：キャンバスが消えても、ユーザーは自信を持って編集できるようになる前に、エージェントが何を作ったのかを理解する手段を依然として必要とする、と。</p>
      <p>その返信の中のフレーズは「レイアウト理解レイヤー（Layout Understanding Layer）」でした。これは良い名前です。なぜなら、安易な答えを拒んでいるからです。エージェントネイティブなデザインは「スクリーンショットを信じろ」を意味することはできません。それには成果物の読みやすいモデルが必要です：セクション、意図、編集可能な部分、安定した参照、そして推奨される編集の手。この記事は、その返信を真剣に受け止める試みです ── そのようなレイヤーが何を運びうるか、Open Design のどこに宿るべきか、そしてなぜそれがロードマップの約束ではなくコントリビューションの道筋なのかを素描します。</p>
      <h2>キャンバスはデザイナーに空間的な自信を与えた</h2>
      <p>Figma のキャンバスは描画のためのサーフェスであるだけではありません。説明のためのサーフェスでもあります。ズームアウトして、ページの階層を見て、フレームをクリックし、制約を検査し、レイヤーの名前を変え、作業のある一片がどこで終わり、別の一片がどこで始まるかを理解できます。</p>
      <h3>キャンバスが消えると実際に何を失うのか</h3>
      <p>その理解は、失われるまで過小評価しがちです。生成されたランディングページは、サンドボックス化されたプレビューでは正しく見えても、依然として指揮するのが難しいことがあります。問題はピクセルではありません ── 人間とエージェントの間の共有された語彙の不在です。</p>
      <p>「ヒーローをもっと自信に満ちたものにして」が有用なのは、エージェントと人間がヒーローとは何かで合意している場合だけです。「価格セクションを締めて」がうまくいくのは、成果物がリビジョンをまたいで安定したセクションのアイデンティティを運んでいる場合だけです。それがなければ、すべての指示は指差しへと退化します：デザイナーは領域をその位置で記述し（「上から 2 番目のブロック」）、エージェントはレンダリングされた出力から推測し、次の再生成がこっそりすべての番号を振り直します。キャンバスはかつてこのコストを静かに吸収していました。あなたのために各部に名前を付け、作業している間その名前を安定に保ち、記述することなく 1 つを選ばせてくれたのです。</p>
      <h3>単位が間違っていても、その明晰さは保つ価値がある</h3>
      <p>これは #DeFigma の議論のうち、注意を要する部分です。キャンバスはエージェントネイティブなシステムにとって間違った作業の単位かもしれません ── それはエージェントがファイルを書くのではなく、人間が長方形をドラッグすることを前提としています ── が、人々がキャンバスから得ていた明晰さは依然として価値があります。間違いは、「キャンバスを捨てる」と「キャンバスが提供していた理解を捨てる」を同じ決定として扱うことです。それらは同じではありません。Open Design はその明晰さを成果物のモデルへと移さねばならず、捨ててはなりません。レイアウトレイヤーは、その移転の名前です。</p>
      <h2>Open Design はすでに正しいプリミティブを持っている</h2>
      <p>この提案が Open Design に合う理由は、プロジェクトがすでに明示的な契約を中心に構築されているからです。スキルは <code>SKILL.md</code> ファイルです。デザインシステムは <code>DESIGN.md</code> ファイルです。プラグインは <code>open-design.json</code> のサイドカーを追加します。システム内のどれも、リバースエンジニアリングしなければならないバイナリの塊ではありません。契約はテキストであり、テキストはエージェントも人間も読めるものです。その仕組みは <a href="/blog/31-skills-72-systems-how-the-library-works/">31 のスキル、72 のシステム：Open Design ライブラリの仕組み</a>でカバーされており、製品としての議論は <a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a>にあります。</p>
      <p>レイアウトレイヤーは同じパターンに従うべきです。それはエージェントが読めるテキストであり、UI がレンダリングできる状態であり、別のエージェントが再利用できるメタデータであるべきです。その 3 つを同時に満たせないなら、それは間違った形です。</p>
      <p>リポジトリの言葉で言えば、それは 3 つのサーフェスを指し示します：</p>


      <table><thead><tr><th>サーフェス</th><th>何を運ぶべきか</th></tr></thead><tbody><tr><td>成果物マニフェスト</td><td>セクション、コンポーネント、アセット、生成されたファイルの安定した ID</td></tr><tr><td>プラグインスナップショット</td><td>どのスキル、デザインシステム、入力、パイプラインの段階が成果物を生んだか</td></tr><tr><td>レビュー UI / ヘッドレス出力</td><td>レイアウトマップ、編集可能な側面、推奨される編集の意図</td></tr></tbody></table>
      <p>重要な制約：このレイヤーは 2 つ目の独自のキャンバスになってはなりません。避けるべき失敗の形は、新しい名前のもとで Figma のシーングラフを再構築することです ── Open Design の UI だけがレンダリングでき、アプリを離れた瞬間に死ぬ、リッチでアプリ固有の構造です。レイアウトレイヤーは代わりに、ファイルとともに移動するプレーンな成果物マップであるべきです。そうすればコントリビューターはテキストエディタでそれを読め、別のエージェントは SDK なしでそれを消費できます。</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="ワイヤーフレームのレイアウトの骨格が、空白のキャンバスの上に、それ自体の選択可能なレイヤーとして持ち上がっている、ほぼ白の編集的な地の上の緑のフレームの中で">
        <figcaption>レイアウトレイヤーは、キャンバスが暗黙に保っていた構造です ── エージェントと人間の両方が読める場所へと引き出されています。</figcaption>
      </figure>
      <h2>レイアウトレイヤーの実用的な形</h2>
      <p>ここに、エージェントネイティブなデザインを今より不透明でなく感じさせる最小のバージョンを示します：</p>
      <ol>
      <li>各生成された成果物は安定した意味的な ID を得る：<code>hero</code>、<code>proof-strip</code>、<code>pricing</code>、<code>faq</code>、<code>final-cta</code>。</li>
      <li>各 ID は意図の文を運ぶ：「上のセクション」ではなく「製品の約束を 1 画面で説明する」。</li>
      <li>各セクションは編集可能な側面を列挙する：コピー、密度、レイアウト、色、メディア、モーション、データソース。</li>
      <li>各生成されたファイルは、それを生んだセクション ID にさかのぼってリンクする。</li>
      <li>各レビューのパスは推奨される編集の意図を発する：「ヒーローの見出しを短くする」「価格カードのコントラストを上げる」「証言ブロックを分割する」。</li>
      <li>UI はこれをナビゲーターとしてレンダリングし、一方ヘッドレスのユーザーは同じ構造を JSON または Markdown として受け取る。</li>
      </ol>
      <h3>マニフェストが実際にどう見えるか</h3>
      <p>書き下す意義は、その構造が平凡だということにあります ── まさにそれが、プライベートな仕掛けではなく公開された契約になりうる理由です。生成されたランディングページのマニフェストはこのように読めるかもしれません：</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>これらのキーのどれも風変わりではありません。<code>sections</code> はリスト、<code>editable</code> は列挙、<code>files</code> はバック参照です。価値はスキーマの賢さにあるのではありません ── ID が再生成を生き延びるという事実にあります。だからエージェントが 2 回書き直した後でも、同じ <code>pricing</code> ブロックは依然 <code>pricing</code> なのです。</p>
      <p>それだけで、デザイナーは「<code>pricing</code> を 3 プランから 2 つに変えて」と言えるようになり、コードエージェントはピクセルから推測することなく正しいファイルにパッチを当てられるようになります。指示はセクション ID に解決され、セクション ID はファイルの集合に解決され、編集は意図された場所に着地します。</p>
      <h3>なぜこれが機能リクエストではなくコントリビューションの道筋なのか</h3>
      <p>これはコミュニティにきれいなコントリビューションの道筋も与えます。コントリビューターはここで手伝うために製品を再設計する必要はありません。1 つの成果物タイプのためのマニフェストを発するスキル、編集の意図を提案するレビューのアトム、他のスキルが読めるフィールドを追加するマニフェストの拡張、あるいはセクション ID が再生成をまたいで安定に保たれることをアサートするテストケースを書けます。そのそれぞれが、1 つの出力を今より不透明でなくする、小さくマージ可能な変更です ── そしてレイヤーがプレーンテキストなので、デッキとモバイル画面に取り組む 2 人のコントリビューターは、共有されたバイナリ形式を調整する必要がありません。レイアウトレイヤーは、アプリの中に埋もれたプライベートな能力ではなく、公開された契約になります。</p>
      <h2>次に何をするか</h2>
      <p>これがあなたが取り組みたい類の問題なら、1 つの成果物を検査しやすくする小さなスキルやプラグインをコントリビュートしてください。具体的な出力から始めてください：ランディングページ、デッキ、あるいはモバイル画面。安定したセクション ID を追加し、編集可能な側面を記述し、成果物のかたわらに JSON または Markdown として発し、そしてレビュアーが検査可能なレイヤーがもたらす違いを見られるように、ビフォー/アフターの成果物とともに PR を開いてください。</p>
      <p>これは依然として方向性であって、出荷された機能ではありません ── 今それを名指しする価値は、プリミティブがすでに存在しているので、作業が書き直しではなく追加的だということにあります。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">スキルをコントリビュートする</a>。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 のスキル、72 のシステム：Open Design ライブラリの仕組み</a> — この提案の下にある、現在のファイル駆動のプリミティブ</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a> — 公開された成果物の契約を可能にする製品の形</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma のオープンソースの代替</a> — 「キャンバスを捨てる」が、キャンバスを中心に据えた既存勢力に対してどこに着地するか</li>
      </ul>
  ko:
    title: "캔버스가 숨겨두었던 레이아웃 레이어"
    summary: "0.8.0 프리뷰에 달린 한 커뮤니티 답글이 에이전트 네이티브 디자인의 진짜 질문을 짚어냈다. 캔버스가 더 이상 작업 단위가 아니게 되면, 사용자는 레이아웃을 어떻게 계속 이해할 수 있을까?"
    bodyHtml: |
      <p>유용한 커뮤니티 답글은 더 큰 버튼을 요구하지 않는다. 빠져 있는 레이어를 지목한다.</p>
      <p>그것이 <a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview 디스커션</a>에서 일어난 일이다. 출시 스레드는 두 가지 전환을 주장했다. 캔버스를 일차적인 작업 단위로 취급하기를 멈추는 것, 그리고 에이전트를 일급(first-class) 디자인 작업자로 만드는 것이다. 한 답글은 그 방향에는 동의하면서도, 가장 어려운 지점을 짚었다. 캔버스가 사라지면, 사용자는 그것을 자신 있게 편집하기 전에 여전히 에이전트가 무엇을 만들었는지 이해할 방법이 필요하다는 것이다.</p>
      <p>그 답글에 등장한 표현이 “Layout Understanding Layer(레이아웃 이해 레이어)”였다. 이는 안일한 답을 거부하기 때문에 좋은 이름이다. 에이전트 네이티브 디자인이 “스크린샷을 믿어라”를 의미할 수는 없다. 그것은 산출물에 대한 읽을 수 있는 모델을 필요로 한다. 섹션, 의도, 편집 가능한 부분, 안정적인 참조, 그리고 권장 편집 동작들 말이다. 이 글은 그 답글을 진지하게 받아들이려는 시도다 — 그런 레이어가 무엇을 담을 수 있는지, Open Design 안에서 어디에 위치해야 하는지, 그리고 왜 그것이 로드맵 약속이 아니라 기여 경로인지를 그려보려 한다.</p>
      <h2>캔버스는 디자이너에게 공간적 확신을 주었다</h2>
      <p>Figma의 캔버스는 단지 그리기 표면이 아니다. 그것은 설명 표면이기도 하다. 줌 아웃해서 페이지 계층을 보고, 프레임을 클릭하고, 제약 조건을 검사하고, 레이어 이름을 바꾸고, 작업의 한 조각이 어디서 끝나고 다른 조각이 어디서 시작되는지 이해할 수 있다.</p>
      <h3>캔버스가 사라질 때 실제로 잃는 것</h3>
      <p>그 이해는 사라지기 전까지는 과소평가하기 쉽다. 생성된 랜딩 페이지는 샌드박스 미리보기에서는 올바르게 보이면서도 여전히 지시하기 어려울 수 있다. 문제는 픽셀이 아니다 — 사람과 에이전트 사이에 공유된 어휘가 없다는 점이다.</p>
      <p>“히어로를 더 자신감 있게 만들어”는 에이전트와 사람이 히어로가 무엇인지에 대해 합의했을 때만 유용하다. “가격 섹션을 더 빡빡하게 다듬어”는 산출물이 개정을 거쳐도 안정적인 섹션 정체성을 유지할 때만 작동한다. 그것이 없으면 모든 지시는 가리키기로 전락한다. 디자이너는 영역을 위치로 설명하고(“위에서 두 번째 블록”), 에이전트는 렌더링된 출력에서 추측하며, 다음 재생성은 조용히 모든 것의 번호를 다시 매긴다. 캔버스는 이 비용을 조용히 흡수해왔다. 캔버스는 당신을 위해 부분들에 이름을 붙여주었고, 작업하는 동안 그 이름들을 안정적으로 유지했으며, 설명하지 않고도 하나를 선택할 수 있게 해주었다.</p>
      <h3>단위가 틀렸더라도 그 명료함은 지킬 가치가 있다</h3>
      <p>이것이 #DeFigma 주장에서 신중해야 하는 부분이다. 캔버스는 에이전트 네이티브 시스템에는 잘못된 작업 단위일 수 있다 — 그것은 파일을 작성하는 에이전트가 아니라 사각형을 드래그하는 사람을 전제하기 때문이다 — 하지만 사람들이 캔버스에서 얻었던 명료함은 여전히 가치 있다. “캔버스를 버린다”와 “캔버스가 제공하던 이해를 버린다”를 같은 결정으로 취급하는 것이 실수일 것이다. 그 둘은 같지 않다. Open Design은 그 명료함을 던져버릴 게 아니라 산출물 모델 안으로 옮겨야 한다. 레이아웃 레이어는 그 이전(relocation)을 가리키는 이름이다.</p>
      <h2>Open Design은 이미 올바른 기본 요소를 갖추고 있다</h2>
      <p>이 제안이 Open Design에 들어맞는 이유는, 이 프로젝트가 이미 명시적인 계약(contract)을 중심으로 구축되어 있기 때문이다. 스킬은 <code>SKILL.md</code> 파일이다. 디자인 시스템은 <code>DESIGN.md</code> 파일이다. 플러그인은 <code>open-design.json</code> 사이드카를 추가한다. 시스템 안의 어떤 것도 리버스 엔지니어링해야 하는 바이너리 덩어리가 아니다. 계약은 텍스트이고, 텍스트는 에이전트와 사람 모두 읽을 수 있는 것이다. 그 메커니즘은 <a href="/blog/31-skills-72-systems-how-the-library-works/">스킬 31개, 시스템 72개: Open Design 라이브러리는 어떻게 작동하는가</a>에서 다루며, 제품 차원의 주장은 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아니라 스킬 레이어로 만든 이유</a>에 있다.</p>
      <p>레이아웃 레이어는 같은 패턴을 따라야 한다. 에이전트가 읽을 수 있는 텍스트, UI가 렌더링할 수 있는 상태, 그리고 다른 에이전트가 재사용할 수 있는 메타데이터여야 한다. 이 세 가지를 한꺼번에 만족시키지 못한다면, 그것은 잘못된 형태다.</p>
      <p>레포 관점에서 보면, 이는 세 가지 표면을 가리킨다:</p>




















      <table><thead><tr><th>표면</th><th>담아야 할 것</th></tr></thead><tbody><tr><td>산출물 매니페스트</td><td>섹션, 컴포넌트, 에셋, 생성된 파일에 대한 안정적인 ID</td></tr><tr><td>플러그인 스냅샷</td><td>어떤 스킬, 디자인 시스템, 입력, 파이프라인 단계가 산출물을 만들었는지</td></tr><tr><td>리뷰 UI / 헤드리스 출력</td><td>레이아웃 맵, 편집 가능한 측면, 그리고 권장 편집 의도</td></tr></tbody></table>
      <p>중요한 제약: 이 레이어는 또 하나의 독점 캔버스가 되어서는 안 된다. 피해야 할 실패 모드는 새 이름으로 Figma의 씬 그래프를 다시 만드는 것이다 — Open Design UI만 렌더링할 수 있고 앱을 떠나는 순간 죽어버리는, 풍부하지만 앱 전용인 구조 말이다. 레이아웃 레이어는 대신 파일과 함께 이동하는 평범한 산출물 맵이어야 하며, 그래야 기여자가 텍스트 편집기에서 그것을 읽을 수 있고 다른 에이전트가 SDK 없이도 그것을 소비할 수 있다.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="빈 캔버스 위로 와이어프레임 레이아웃 골격이 선택 가능한 자체 레이어로 떠오르는 모습, 거의 흰색에 가까운 에디토리얼 바탕 위 녹색 프레임 안에">
        <figcaption>레이아웃 레이어는 캔버스가 암묵적으로 유지하던 구조다 — 에이전트와 사람이 둘 다 읽을 수 있는 곳으로 끄집어낸 것이다.</figcaption>
      </figure>
      <h2>레이아웃 레이어의 실용적인 형태</h2>
      <p>에이전트 네이티브 디자인을 덜 불투명하게 느끼게 해줄 가장 작은 버전은 다음과 같다:</p>
      <ol>
      <li>생성된 각 산출물은 안정적인 시맨틱 ID를 갖는다: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>각 ID는 의도 문장을 담는다: “상단 섹션”이 아니라 “제품의 약속을 한 화면에서 설명한다”.</li>
      <li>각 섹션은 편집 가능한 측면을 나열한다: 카피, 밀도, 레이아웃, 색상, 미디어, 모션, 데이터 소스.</li>
      <li>생성된 각 파일은 그것을 만든 섹션 ID로 다시 연결된다.</li>
      <li>각 리뷰 패스는 권장 편집 의도를 내보낸다: “히어로 헤드라인을 줄여라”, “가격 카드의 대비를 높여라”, “고객 후기 블록을 나눠라”.</li>
      <li>UI는 이를 내비게이터로 렌더링하고, 헤드리스 사용자는 같은 구조를 JSON 또는 Markdown으로 받는다.</li>
      </ol>
      <h3>매니페스트가 실제로 어떻게 생겼을지</h3>
      <p>이것을 글로 적어두는 핵심은 그 구조가 평범하다는 점이다 — 바로 그 때문에 그것이 비공개 트릭이 아니라 공개 계약이 될 수 있다. 생성된 랜딩 페이지의 매니페스트는 다음과 같을 수 있다:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>이 키들 중 어느 것도 특이하지 않다. <code>sections</code>는 리스트이고, <code>editable</code>은 열거형이며, <code>files</code>는 역참조다. 가치는 스키마의 영리함에 있는 것이 아니다 — ID가 재생성을 거쳐도 살아남는다는 사실에 있다. 그래서 에이전트가 두 번 다시 작성해도 같은 <code>pricing</code> 블록은 여전히 <code>pricing</code>이다.</p>
      <p>그것만으로도 디자이너가 “<code>pricing</code>을 세 개 플랜에서 두 개로 바꿔”라고 말할 수 있게 하기에 충분하고, 코드 에이전트가 픽셀에서 추측하지 않고 올바른 파일을 패치하게 하기에 충분하다. 지시는 섹션 ID로 해석되고, 섹션 ID는 파일 집합으로 해석되며, 편집은 의도된 곳에 안착한다.</p>
      <h3>이것이 기능 요청이 아니라 기여 경로인 이유</h3>
      <p>그것은 또한 커뮤니티에 깔끔한 기여 경로를 제공한다. 기여자는 여기서 돕기 위해 제품을 재설계할 필요가 없다. 한 산출물 유형에 대한 매니페스트를 내보내는 스킬, 편집 의도를 제안하는 리뷰 아톰, 다른 스킬이 읽을 수 있는 필드를 추가하는 매니페스트 확장, 또는 재생성을 거쳐도 섹션 ID가 안정적으로 유지되는지 단언하는 테스트 케이스를 작성할 수 있다. 이들 각각은 하나의 출력을 덜 불투명하게 만드는 작고 머지 가능한 변경이다 — 그리고 이 레이어는 평범한 텍스트이므로, 덱과 모바일 화면을 작업하는 두 기여자는 공유 바이너리 포맷을 조율할 필요가 없다. 레이아웃 레이어는 앱 안에 묻힌 비공개 기능이 아니라 공개 계약이 된다.</p>
      <h2>다음에 할 일</h2>
      <p>이런 종류의 문제에 작업하고 싶다면, 하나의 산출물을 검사하기 쉽게 만드는 작은 스킬이나 플러그인을 기여하라. 구체적인 출력에서 시작하라: 랜딩 페이지, 덱, 또는 모바일 화면. 안정적인 섹션 ID를 추가하고, 편집 가능한 측면을 설명하고, 산출물과 함께 JSON 또는 Markdown으로 내보내고, 리뷰어가 검사 가능한 레이어가 만드는 차이를 볼 수 있도록 before/after 산출물과 함께 PR을 열어라.</p>
      <p>이것은 여전히 출시된 기능이 아니라 방향이다 — 지금 그것에 이름을 붙이는 가치는, 기본 요소가 이미 존재하기 때문에 그 작업이 재작성이 아니라 추가적이라는 데 있다.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">스킬을 기여하라</a>.</p>
      <h2>관련 읽을거리</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">스킬 31개, 시스템 72개: Open Design 라이브러리는 어떻게 작동하는가</a> — 이 제안 밑에 깔린 현재의 파일 기반 기본 요소들</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아니라 스킬 레이어로 만든 이유</a> — 공개 산출물 계약을 가능하게 하는 제품 형태</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma의 오픈소스 대안</a> — “캔버스를 버린다”가 캔버스를 중심에 둔 기존 강자에 맞서 어디에 안착하는지</li>
      </ul>
  de:
    title: "Die Layout-Ebene, die der Canvas früher verbarg"
    summary: "Eine Community-Antwort zur 0.8.0-Preview benannte die eigentliche Frage hinter Agent-nativem Design: Wenn der Canvas nicht mehr die Arbeitseinheit ist, wie verstehen Nutzer dann noch das Layout?"
    bodyHtml: |
      <p>Eine nützliche Community-Antwort verlangt nicht nach einem größeren Button. Sie benennt die fehlende Ebene.</p>
      <p>Genau das geschah unter der <a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview-Diskussion</a>. Der Launch-Thread plädierte für zwei Verschiebungen: den Canvas nicht länger als primäre Arbeitseinheit zu behandeln und den Agenten zum erstklassigen Design-Arbeiter zu machen. Eine Antwort stimmte der Richtung zu und zeigte dann auf den schwierigen Teil: Wenn der Canvas verschwindet, brauchen Nutzer weiterhin eine Möglichkeit zu verstehen, was der Agent erstellt hat, bevor sie es mit Zuversicht bearbeiten können.</p>
      <p>Die Formulierung in der Antwort lautete „Layout Understanding Layer“. Das ist ein guter Name, weil er die bequeme Antwort verweigert. Agent-natives Design kann nicht bedeuten, „dem Screenshot zu vertrauen“. Es braucht ein lesbares Modell des Artefakts: Abschnitte, Intention, bearbeitbare Teile, stabile Referenzen und vorgeschlagene Bearbeitungsschritte. Dieser Beitrag ist ein Versuch, diese Antwort ernst zu nehmen — zu skizzieren, was eine solche Ebene tragen könnte, wo sie in Open Design angesiedelt sein sollte und warum sie ein Beitragspfad ist und kein Roadmap-Versprechen.</p>
      <h2>Der Canvas gab Designern räumliche Zuversicht</h2>
      <p>Figmas Canvas ist nicht nur eine Zeichenfläche. Er ist auch eine Erklärungsfläche. Man kann herauszoomen, die Seitenhierarchie sehen, einen Frame anklicken, Constraints inspizieren, Ebenen umbenennen und verstehen, wo ein Teil der Arbeit endet und ein anderer beginnt.</p>
      <h3>Was man tatsächlich verliert, wenn der Canvas verschwindet</h3>
      <p>Dieses Verständnis lässt sich leicht unterschätzen, bis es weg ist. Eine generierte Landingpage kann in einer abgeschotteten Vorschau korrekt aussehen und trotzdem schwer zu steuern sein. Das Problem sind nicht die Pixel — es ist das Fehlen eines gemeinsamen Vokabulars zwischen Mensch und Agent.</p>
      <p>„Mach den Hero selbstbewusster“ ist nur nützlich, wenn Agent und Mensch sich einig sind, was der Hero ist. „Strafft den Pricing-Abschnitt“ funktioniert nur, wenn das Artefakt über Revisionen hinweg eine stabile Abschnittsidentität trägt. Ohne sie verkommt jede Anweisung zum Zeigen: Der Designer beschreibt eine Region über ihre Position („der zweite Block von oben“), der Agent rät anhand der gerenderten Ausgabe, und die nächste Neugenerierung nummeriert klammheimlich alles um. Der Canvas absorbierte diese Kosten früher stillschweigend. Er benannte die Teile für einen, hielt diese Namen während der Arbeit stabil und ließ einen davon auswählen, ohne ihn beschreiben zu müssen.</p>
      <h3>Die Klarheit lohnt sich, selbst wenn die Einheit falsch ist</h3>
      <p>Das ist der Teil des #DeFigma-Arguments, der Sorgfalt verlangt. Der Canvas mag die falsche Arbeitseinheit für ein Agent-natives System sein — er setzt einen Menschen voraus, der Rechtecke zieht, nicht einen Agenten, der Dateien schreibt —, aber die Klarheit, die Menschen aus dem Canvas zogen, ist weiterhin wertvoll. Der Fehler wäre, „den Canvas fallen lassen“ und „das vom Canvas gelieferte Verständnis fallen lassen“ als dieselbe Entscheidung zu behandeln. Das sind sie nicht. Open Design muss diese Klarheit in das Artefaktmodell verlagern, nicht wegwerfen. Die Layout-Ebene ist der Name für diese Verlagerung.</p>
      <h2>Open Design hat bereits die richtigen Primitive</h2>
      <p>Der Grund, warum dieser Vorschlag zu Open Design passt, ist, dass das Projekt bereits um explizite Verträge herum gebaut ist. Eine Skill ist eine <code>SKILL.md</code>-Datei. Ein Design-System ist eine <code>DESIGN.md</code>-Datei. Ein Plugin fügt ein <code>open-design.json</code>-Sidecar hinzu. Nichts im System ist ein binärer Blob, den man rückentwickeln muss; die Verträge sind Text, und Text ist etwas, das sowohl ein Agent als auch ein Mensch lesen kann. Die Mechanik wird in <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> behandelt, und das Produktargument steht in <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a>.</p>
      <p>Die Layout-Ebene sollte demselben Muster folgen. Sie sollte Text sein, den der Agent lesen kann, Zustand, den die UI rendern kann, und Metadaten, die ein anderer Agent wiederverwenden kann. Wenn sie nicht alle drei zugleich erfüllen kann, hat sie die falsche Form.</p>
      <p>In Repo-Begriffen verweist das auf drei Flächen:</p>




      <table><thead><tr><th>Fläche</th><th>Was sie tragen sollte</th></tr></thead><tbody><tr><td>Artefakt-Manifest</td><td>Stabile IDs für Abschnitte, Komponenten, Assets und generierte Dateien</td></tr><tr><td>Plugin-Snapshot</td><td>Welche Skill, welches Design-System, welche Eingaben und welche Pipeline-Stufen das Artefakt erzeugt haben</td></tr><tr><td>Review-UI / Headless-Ausgabe</td><td>Eine Layout-Karte, bearbeitbare Aspekte und vorgeschlagene Bearbeitungsintentionen</td></tr></tbody></table>
      <p>Die wichtige Einschränkung: Die Ebene sollte nicht zu einem zweiten proprietären Canvas werden. Der zu vermeidende Fehlermodus ist, Figmas Szenengraph unter einem neuen Namen wiederaufzubauen — eine reichhaltige, app-spezifische Struktur, die nur die Open Design UI rendern kann und die in dem Moment stirbt, in dem man die App verlässt. Die Layout-Ebene sollte stattdessen eine schlichte Artefaktkarte sein, die mit den Dateien reist, sodass ein Beitragender sie in einem Texteditor lesen und ein anderer Agent sie ohne SDK konsumieren kann.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Ein Wireframe-Layout-Skelett, das sich als eigene auswählbare Ebene über einem leeren Canvas heraushebt, in einem grünen Rahmen auf einem fast weißen redaktionellen Untergrund">
        <figcaption>Die Layout-Ebene ist die Struktur, die der Canvas implizit hielt — herausgezogen an einen Ort, an dem ein Agent und ein Mensch sie beide lesen können.</figcaption>
      </figure>
      <h2>Eine praktische Form für die Layout-Ebene</h2>
      <p>Hier ist die kleinste Version, die Agent-natives Design weniger undurchsichtig wirken ließe:</p>
      <ol>
      <li>Jedes generierte Artefakt erhält stabile semantische IDs: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Jede ID trägt einen Intentionssatz: „Erkläre das Produktversprechen auf einem Bildschirm“, nicht „oberer Abschnitt“.</li>
      <li>Jeder Abschnitt listet bearbeitbare Aspekte auf: Text, Dichte, Layout, Farbe, Medien, Bewegung, Datenquelle.</li>
      <li>Jede generierte Datei verweist zurück auf die Abschnitts-ID, die sie erzeugt hat.</li>
      <li>Jeder Review-Durchgang gibt vorgeschlagene Bearbeitungsintentionen aus: „Hero-Überschrift kürzen“, „Kontrast in den Pricing-Karten erhöhen“, „Testimonial-Block aufteilen“.</li>
      <li>Die UI rendert dies als Navigator, während Headless-Nutzer dieselbe Struktur als JSON oder Markdown erhalten.</li>
      </ol>
      <h3>Wie ein Manifest tatsächlich aussehen könnte</h3>
      <p>Der Sinn, es niederzuschreiben, ist, dass die Struktur unspektakulär ist — was genau der Grund ist, warum sie ein öffentlicher Vertrag statt eines privaten Tricks sein kann. Ein Manifest für eine generierte Landingpage könnte so aussehen:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Keiner dieser Schlüssel ist exotisch. <code>sections</code> ist eine Liste, <code>editable</code> ist ein Enum, <code>files</code> ist eine Rückreferenz. Der Wert liegt nicht in der Cleverness des Schemas — er liegt in der Tatsache, dass die IDs eine Neugenerierung überleben, sodass derselbe <code>pricing</code>-Block auch nach zwei Umschreibungen durch den Agenten noch <code>pricing</code> ist.</p>
      <p>Das reicht aus, damit ein Designer sagen kann: „Ändere <code>pricing</code> von drei Plänen auf zwei“, und es reicht aus, damit ein Code-Agent die richtige Datei patchen kann, ohne aus Pixeln zu raten. Die Anweisung löst sich zu einer Abschnitts-ID auf, die Abschnitts-ID löst sich zu einer Menge von Dateien auf, und die Bearbeitung landet dort, wo sie gemeint war.</p>
      <h3>Warum dies ein Beitragspfad ist, kein Feature-Request</h3>
      <p>Es gibt der Community außerdem einen sauberen Beitragspfad. Ein Beitragender muss das Produkt nicht neu entwerfen, um hier zu helfen. Er kann eine Skill schreiben, die ein Manifest für einen Artefakttyp ausgibt, ein Review-Atom, das Bearbeitungsintentionen vorschlägt, eine Manifest-Erweiterung, die ein Feld hinzufügt, das andere Skills lesen können, oder einen Testfall, der sicherstellt, dass Abschnitts-IDs über eine Neugenerierung hinweg stabil bleiben. Jede davon ist eine kleine, mergebare Änderung, die eine Ausgabe weniger undurchsichtig macht — und weil die Ebene schlichter Text ist, müssen sich zwei Beitragende, die an einem Deck und einem Mobile-Screen arbeiten, nicht auf ein gemeinsames Binärformat abstimmen. Die Layout-Ebene wird zu einem öffentlichen Vertrag, nicht zu einer privaten, tief in der App vergrabenen Fähigkeit.</p>
      <h2>Was als Nächstes zu tun ist</h2>
      <p>Wenn dies die Art von Problem ist, an der du arbeiten möchtest, trag eine kleine Skill oder ein Plugin bei, das ein Artefakt leichter inspizierbar macht. Beginne mit einer konkreten Ausgabe: einer Landingpage, einem Deck oder einem Mobile-Screen. Füge stabile Abschnitts-IDs hinzu, beschreibe die bearbeitbaren Aspekte, gib sie als JSON oder Markdown neben dem Artefakt aus und öffne den PR mit einem Vorher-/Nachher-Artefakt, damit ein Reviewer den Unterschied sehen kann, den eine inspizierbare Ebene macht.</p>
      <p>Das ist immer noch eine Richtung, kein ausgeliefertes Feature — der Wert, es jetzt zu benennen, liegt darin, dass die Primitive bereits existieren, sodass die Arbeit additiv ist statt eines Neuschreibens.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Trag eine Skill bei</a>.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems: how the Open Design library works</a> — die aktuellen dateigetriebenen Primitive, die dem Vorschlag zugrunde liegen</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a> — die Produktform, die öffentliche Artefaktverträge möglich macht</li>
      <li><a href="/blog/figma-alternative-open-design/">The open-source alternative to Figma</a> — wo „den Canvas fallen lassen“ gegen den Platzhirsch landet, der den Canvas zentral machte</li>
      </ul>
  fr:
    title: "La couche de mise en page que le canvas masquait"
    summary: "Une réponse de la communauté sur la préversion 0.8.0 a nommé la vraie question derrière le design agent-native : si le canvas cesse d'être l'unité de travail, comment les utilisateurs comprennent-ils encore la mise en page ?"
    bodyHtml: |
      <p>Une réponse utile de la communauté ne demande pas un plus gros bouton. Elle nomme la couche manquante.</p>
      <p>C'est ce qui s'est passé sous la <a href="https://github.com/nexu-io/open-design/discussions/1727">discussion Open Design 0.8.0-preview</a>. Le fil de lancement plaidait pour deux changements : cesser de traiter le canvas comme l'unité de travail principale, et faire de l'agent le travailleur de design de première classe. Une réponse était d'accord avec la direction, puis a pointé la partie difficile : quand le canvas disparaît, les utilisateurs ont toujours besoin d'un moyen de comprendre ce que l'agent a fait avant de pouvoir l'éditer en confiance.</p>
      <p>L'expression dans la réponse était « Layout Understanding Layer ». C'est un bon nom car il refuse la réponse paresseuse. Le design agent-native ne peut pas signifier « faites confiance à la capture d'écran ». Il lui faut un modèle lisible de l'artefact : sections, intention, parties éditables, références stables et mouvements d'édition suggérés. Cet article est une tentative de prendre cette réponse au sérieux — d'esquisser ce qu'une telle couche pourrait porter, où elle devrait vivre dans Open Design, et pourquoi c'est un chemin de contribution plutôt qu'une promesse de roadmap.</p>
      <h2>Le canvas donnait aux designers une confiance spatiale</h2>
      <p>Le canvas de Figma n'est pas seulement une surface de dessin. C'est aussi une surface d'explication. Vous pouvez dézoomer, voir la hiérarchie de la page, cliquer sur un frame, inspecter les contraintes, renommer les calques, et comprendre où une partie du travail finit et où une autre commence.</p>
      <h3>Ce que vous perdez réellement quand le canvas disparaît</h3>
      <p>Cette compréhension est facile à sous-estimer jusqu'à ce qu'elle disparaisse. Une landing page générée peut paraître correcte dans un aperçu en bac à sable et rester difficile à diriger. Le problème n'est pas les pixels — c'est l'absence d'un vocabulaire partagé entre l'humain et l'agent.</p>
      <p>« Rends le hero plus assuré » n'est utile que si l'agent et l'humain s'accordent sur ce qu'est le hero. « Resserre la section tarifs » ne fonctionne que si l'artefact porte une identité de section stable à travers les révisions. Sans cela, chaque instruction se dégrade en désignation : le designer décrit une région par sa position (« le deuxième bloc à partir du haut »), l'agent devine à partir de la sortie rendue, et la régénération suivante renumérote discrètement tout. Le canvas absorbait ce coût en silence. Il nommait les parties pour vous, gardait ces noms stables pendant que vous travailliez, et vous laissait en sélectionner une sans avoir à la décrire.</p>
      <h3>La clarté vaut la peine d'être conservée même si l'unité est mauvaise</h3>
      <p>C'est la partie de l'argument #DeFigma qui demande de la prudence. Le canvas est peut-être la mauvaise unité de travail pour un système agent-native — il suppose un humain faisant glisser des rectangles, pas un agent écrivant des fichiers — mais la clarté que les gens obtenaient du canvas reste précieuse. L'erreur serait de traiter « abandonner le canvas » et « abandonner la compréhension que le canvas apportait » comme la même décision. Ce n'en est pas une. Open Design doit déplacer cette clarté dans le modèle d'artefact, et non la jeter. La couche de mise en page est le nom de ce déplacement.</p>
      <h2>Open Design a déjà les bonnes primitives</h2>
      <p>La raison pour laquelle cette proposition convient à Open Design est que le projet est déjà construit autour de contrats explicites. Un skill est un fichier <code>SKILL.md</code>. Un design system est un fichier <code>DESIGN.md</code>. Un plugin ajoute un fichier d'accompagnement <code>open-design.json</code>. Rien dans le système n'est un blob binaire que vous devez désosser ; les contrats sont du texte, et le texte est quelque chose qu'un agent comme un humain peuvent lire. La mécanique est couverte dans <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems : comment fonctionne la bibliothèque Open Design</a>, et l'argument produit se trouve dans <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a>.</p>
      <p>La couche de mise en page devrait suivre le même modèle. Elle devrait être du texte que l'agent peut lire, un état que l'UI peut rendre, et des métadonnées qu'un autre agent peut réutiliser. Si elle ne peut pas satisfaire les trois à la fois, c'est qu'elle a la mauvaise forme.</p>
      <p>En termes de dépôt, cela pointe vers trois surfaces :</p>





















      <table><thead><tr><th>Surface</th><th>Ce qu'elle devrait porter</th></tr></thead><tbody><tr><td>Manifeste d'artefact</td><td>IDs stables pour les sections, composants, actifs et fichiers générés</td></tr><tr><td>Instantané du plugin</td><td>Quel skill, design system, entrées et étapes de pipeline ont produit l'artefact</td></tr><tr><td>UI de revue / sortie headless</td><td>Une carte de mise en page, les aspects éditables et les intentions d'édition suggérées</td></tr></tbody></table>
      <p>La contrainte importante : la couche ne doit pas devenir un second canvas propriétaire. Le mode de défaillance à éviter est de reconstruire le graphe de scène de Figma sous un nouveau nom — une structure riche et spécifique à l'application que seule l'UI d'Open Design peut rendre et qui meurt dès que vous quittez l'application. La couche de mise en page devrait au contraire être une simple carte d'artefact qui voyage avec les fichiers, afin qu'un contributeur puisse la lire dans un éditeur de texte et qu'un autre agent puisse la consommer sans SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Un squelette de mise en page filaire se soulevant comme sa propre couche sélectionnable au-dessus d'un canvas vierge, dans un cadre vert sur un fond éditorial presque blanc">
        <figcaption>La couche de mise en page est la structure que le canvas gardait implicite — extraite là où un agent et un humain peuvent tous deux la lire.</figcaption>
      </figure>
      <h2>Une forme concrète pour la couche de mise en page</h2>
      <p>Voici la plus petite version qui rendrait le design agent-native moins opaque :</p>
      <ol>
      <li>Chaque artefact généré reçoit des IDs sémantiques stables : <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Chaque ID porte une phrase d'intention : « Expliquer la promesse du produit en un écran », pas « section du haut ».</li>
      <li>Chaque section liste les aspects éditables : texte, densité, mise en page, couleur, média, animation, source de données.</li>
      <li>Chaque fichier généré renvoie à l'ID de section qui l'a produit.</li>
      <li>Chaque passe de revue émet des intentions d'édition suggérées : « raccourcir le titre du hero », « augmenter le contraste dans les cartes de tarifs », « scinder le bloc de témoignages ».</li>
      <li>L'UI rend cela comme un navigateur, tandis que les utilisateurs headless reçoivent la même structure en JSON ou en Markdown.</li>
      </ol>
      <h3>À quoi un manifeste pourrait réellement ressembler</h3>
      <p>L'intérêt de l'écrire est que la structure est banale — ce qui est précisément pourquoi elle peut être un contrat public plutôt qu'une astuce privée. Un manifeste pour une landing page générée pourrait se lire ainsi :</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Aucune de ces clés n'est exotique. <code>sections</code> est une liste, <code>editable</code> est une énumération, <code>files</code> est une référence arrière. La valeur ne réside pas dans l'astuce du schéma — elle réside dans le fait que les IDs survivent à une régénération, de sorte que le même bloc <code>pricing</code> reste <code>pricing</code> après que l'agent l'a réécrit deux fois.</p>
      <p>C'est suffisant pour permettre à un designer de dire « Passe <code>pricing</code> de trois plans à deux », et suffisant pour permettre à un agent de code de patcher le bon fichier sans deviner à partir des pixels. L'instruction se résout en un ID de section, l'ID de section se résout en un ensemble de fichiers, et l'édition atterrit là où elle était censée.</p>
      <h3>Pourquoi c'est un chemin de contribution, pas une demande de fonctionnalité</h3>
      <p>Cela donne aussi à la communauté un chemin de contribution propre. Un contributeur n'a pas besoin de redéfinir le produit pour aider ici. Il peut écrire un skill qui émet un manifeste pour un type d'artefact, un atome de revue qui propose des intentions d'édition, une extension de manifeste qui ajoute un champ que d'autres skills peuvent lire, ou un cas de test qui vérifie que les IDs de section restent stables à travers une régénération. Chacune de ces contributions est un petit changement fusionnable qui rend une sortie moins opaque — et parce que la couche est en texte brut, deux contributeurs travaillant sur un deck et un écran mobile n'ont pas à coordonner un format binaire partagé. La couche de mise en page devient un contrat public, et non une capacité privée enfouie dans l'application.</p>
      <h2>Quoi faire ensuite</h2>
      <p>Si c'est le genre de problème sur lequel vous voulez travailler, contribuez un petit skill ou plugin qui rend un artefact plus facile à inspecter. Commencez par une sortie concrète : une landing page, un deck ou un écran mobile. Ajoutez des IDs de section stables, décrivez les aspects éditables, émettez-les en JSON ou en Markdown aux côtés de l'artefact, et ouvrez la PR avec un artefact avant/après pour qu'un relecteur puisse voir la différence qu'apporte une couche inspectable.</p>
      <p>C'est encore une direction, pas une fonctionnalité livrée — l'intérêt de la nommer maintenant est que les primitives existent déjà, donc le travail est additif plutôt qu'une réécriture.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Contribuez un skill</a>.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems : comment fonctionne la bibliothèque Open Design</a> — les primitives actuelles pilotées par fichiers sous la proposition</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a> — la forme de produit qui rend possibles les contrats d'artefact publics</li>
      <li><a href="/blog/figma-alternative-open-design/">L'alternative open-source à Figma</a> — où « abandonner le canvas » atterrit face à l'acteur en place qui a rendu le canvas central</li>
      </ul>
  ru:
    title: "Слой макета, который холст прежде скрывал"
    summary: "Ответ участника сообщества на preview 0.8.0 назвал настоящий вопрос, стоящий за agent-native дизайном: если холст перестаёт быть единицей работы, как пользователи по-прежнему понимают макет?"
    bodyHtml: |
      <p>Полезный ответ сообщества не просит кнопку побольше. Он называет недостающий слой.</p>
      <p>Именно это и произошло в <a href="https://github.com/nexu-io/open-design/discussions/1727">обсуждении Open Design 0.8.0-preview</a>. Стартовая ветка отстаивала два сдвига: перестать относиться к холсту как к основной единице работы и сделать агента первоклассным дизайн-работником. Один из ответов согласился с направлением, а затем указал на сложную часть: когда холст исчезает, пользователям всё равно нужен способ понять, что именно сделал агент, прежде чем они смогут уверенно это редактировать.</p>
      <p>Фраза в ответе была «Layout Understanding Layer» (слой понимания макета). Это хорошее название, потому что оно отвергает ленивый ответ. Agent-native дизайн не может означать «доверяй скриншоту». Ему нужна читаемая модель артефакта: секции, замысел, редактируемые части, стабильные ссылки и предлагаемые правки. Этот пост — попытка отнестись к тому ответу всерьёз: набросать, что мог бы нести такой слой, где ему место в Open Design и почему это путь для вклада, а не обещание в дорожной карте.</p>
      <h2>Холст давал дизайнерам пространственную уверенность</h2>
      <p>Холст Figma — это не только поверхность для рисования. Это ещё и поверхность для объяснения. Вы можете отдалить вид, увидеть иерархию страницы, кликнуть по фрейму, проверить ограничения, переименовать слои и понять, где заканчивается один кусок работы и начинается другой.</p>
      <h3>Что вы на самом деле теряете, когда холст исчезает</h3>
      <p>Это понимание легко недооценить, пока его не лишишься. Сгенерированный лендинг может выглядеть правильно в изолированном превью и всё равно оставаться трудным для управления. Проблема не в пикселях — она в отсутствии общего словаря между человеком и агентом.</p>
      <p>«Сделай hero увереннее» полезно только в том случае, если агент и человек сходятся в том, что такое hero. «Подтяни секцию цен» работает только тогда, когда артефакт несёт стабильную идентичность секции между ревизиями. Без этого каждая инструкция вырождается в указывание пальцем: дизайнер описывает область по её положению («второй блок сверху»), агент догадывается по отрендеренному результату, а следующая регенерация тихо перенумеровывает всё заново. Холст раньше молча поглощал эту цену. Он называл части за вас, удерживал эти имена стабильными, пока вы работали, и позволял выбрать одну из них без описания.</p>
      <h3>Ясность стоит сохранить, даже если единица выбрана неверно</h3>
      <p>Это та часть аргумента #DeFigma, которая требует осторожности. Холст, возможно, неверная единица работы для agent-native системы — он предполагает человека, перетаскивающего прямоугольники, а не агента, пишущего файлы — но ясность, которую люди получали от холста, по-прежнему ценна. Ошибкой было бы относиться к «отказаться от холста» и «отказаться от понимания, которое холст давал» как к одному и тому же решению. Это не так. Open Design должен перенести эту ясность в модель артефакта, а не выбросить её. Слой макета — это название для такого переноса.</p>
      <h2>У Open Design уже есть нужные примитивы</h2>
      <p>Причина, по которой это предложение вписывается в Open Design, в том, что проект уже построен вокруг явных контрактов. Навык — это файл <code>SKILL.md</code>. Дизайн-система — это файл <code>DESIGN.md</code>. Плагин добавляет сопроводительный файл <code>open-design.json</code>. Ничто в системе не является бинарным блобом, который приходится реверс-инжинирить; контракты — это текст, а текст может прочитать и агент, и человек. Механика описана в <a href="/blog/31-skills-72-systems-how-the-library-works/">31 навык, 72 системы: как работает библиотека Open Design</a>, а продуктовый аргумент — в <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не как продукт</a>.</p>
      <p>Слой макета должен следовать тому же паттерну. Это должен быть текст, который может прочитать агент, состояние, которое может отрендерить интерфейс, и метаданные, которые может переиспользовать другой агент. Если он не может удовлетворить все три условия одновременно, у него неправильная форма.</p>
      <p>В терминах репозитория это указывает на три поверхности:</p>




















      <table><thead><tr><th>Поверхность</th><th>Что она должна нести</th></tr></thead><tbody><tr><td>Манифест артефакта</td><td>Стабильные ID для секций, компонентов, ассетов и сгенерированных файлов</td></tr><tr><td>Снимок плагина</td><td>Какой навык, дизайн-система, входные данные и стадии конвейера произвели артефакт</td></tr><tr><td>Интерфейс проверки / headless-вывод</td><td>Карта макета, редактируемые аспекты и предлагаемые правки</td></tr></tbody></table>
      <p>Важное ограничение: слой не должен превратиться во второй проприетарный холст. Режим отказа, которого нужно избегать, — это перестроить граф сцены Figma под новым именем: богатую, специфичную для приложения структуру, которую может отрендерить только интерфейс Open Design и которая умирает в тот момент, когда вы покидаете приложение. Вместо этого слой макета должен быть простой картой артефакта, которая путешествует вместе с файлами, чтобы участник мог прочитать её в текстовом редакторе, а другой агент мог потребить её без SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Каркас-скелет макета поднимается как собственный выбираемый слой над пустым холстом, выделенный зелёной рамкой на почти белом редакторском фоне">
        <figcaption>Слой макета — это структура, которую холст держал неявной, вынесенная туда, где её могут прочитать и агент, и человек.</figcaption>
      </figure>
      <h2>Практическая форма слоя макета</h2>
      <p>Вот наименьшая версия, которая сделала бы agent-native дизайн менее непрозрачным:</p>
      <ol>
      <li>Каждый сгенерированный артефакт получает стабильные семантические ID: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Каждый ID несёт предложение о замысле: «Объяснить обещание продукта на одном экране», а не «верхняя секция».</li>
      <li>Каждая секция перечисляет редактируемые аспекты: текст, плотность, макет, цвет, медиа, движение, источник данных.</li>
      <li>Каждый сгенерированный файл ссылается обратно на ID секции, которая его произвела.</li>
      <li>Каждый проход проверки выдаёт предлагаемые правки: «сократить заголовок hero», «увеличить контраст в карточках цен», «разделить блок отзывов».</li>
      <li>Интерфейс рендерит это как навигатор, а headless-пользователи получают ту же структуру в виде JSON или Markdown.</li>
      </ol>
      <h3>Как мог бы выглядеть манифест</h3>
      <p>Смысл того, чтобы записать это, в том, что структура ничем не примечательна — и именно поэтому она может быть публичным контрактом, а не приватным трюком. Манифест для сгенерированного лендинга мог бы выглядеть так:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Ни один из этих ключей не является экзотическим. <code>sections</code> — это список, <code>editable</code> — это enum, <code>files</code> — обратная ссылка. Ценность не в изобретательности схемы — она в том факте, что ID переживают регенерацию, поэтому тот же блок <code>pricing</code> остаётся <code>pricing</code> после того, как агент перепишет его дважды.</p>
      <p>Этого достаточно, чтобы дизайнер мог сказать: «Измени <code>pricing</code> с трёх планов на два», и достаточно, чтобы код-агент пропатчил нужный файл, не догадываясь по пикселям. Инструкция разрешается в ID секции, ID секции разрешается в набор файлов, и правка приземляется там, где и было задумано.</p>
      <h3>Почему это путь для вклада, а не запрос функции</h3>
      <p>Это также даёт сообществу чистый путь для вклада. Участнику не нужно перепроектировать продукт, чтобы помочь здесь. Он может написать навык, который выдаёт манифест для одного типа артефакта, атом проверки, который предлагает правки, расширение манифеста, которое добавляет поле, читаемое другими навыками, или тестовый кейс, который утверждает, что ID секций остаются стабильными между регенерациями. Каждое из этих — небольшое, способное к слиянию изменение, которое делает один результат менее непрозрачным — и поскольку слой представляет собой простой текст, два участника, работающие над презентацией и мобильным экраном, не должны согласовывать общий бинарный формат. Слой макета становится публичным контрактом, а не приватной возможностью, закопанной внутри приложения.</p>
      <h2>Что делать дальше</h2>
      <p>Если это та проблема, над которой вы хотите работать, внесите небольшой навык или плагин, который облегчает осмотр одного артефакта. Начните с конкретного результата: лендинга, презентации или мобильного экрана. Добавьте стабильные ID секций, опишите редактируемые аспекты, выдайте их в виде JSON или Markdown рядом с артефактом и откройте PR с артефактом «до/после», чтобы проверяющий увидел разницу, которую вносит осматриваемый слой.</p>
      <p>Это всё ещё направление, а не выпущенная функция — ценность того, чтобы назвать его сейчас, в том, что примитивы уже существуют, поэтому работа аддитивна, а не является переписыванием.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Внесите навык</a>.</p>
      <h2>Связанное чтение</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навык, 72 системы: как работает библиотека Open Design</a> — текущие файл-ориентированные примитивы, лежащие в основе предложения</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не как продукт</a> — форма продукта, которая делает возможными публичные контракты артефактов</li>
      <li><a href="/blog/figma-alternative-open-design/">Альтернатива Figma с открытым исходным кодом</a> — где оказывается «отказаться от холста» по отношению к действующему лидеру, сделавшему холст центральным</li>
      </ul>
  es:
    title: "La capa de layout que el lienzo solía ocultar"
    summary: "Una respuesta de la comunidad en la preview de 0.8.0 nombró la verdadera pregunta detrás del diseño agent-native: si el lienzo deja de ser la unidad de trabajo, ¿cómo siguen entendiendo el layout los usuarios?"
    bodyHtml: |
      <p>Una respuesta útil de la comunidad no pide un botón más grande. Nombra la capa que falta.</p>
      <p>Eso fue lo que pasó en la <a href="https://github.com/nexu-io/open-design/discussions/1727">discusión de Open Design 0.8.0-preview</a>. El hilo de lanzamiento defendía dos cambios: dejar de tratar el lienzo como la unidad de trabajo principal y convertir al agente en el trabajador de diseño de primera clase. Una respuesta estuvo de acuerdo con la dirección y luego señaló la parte difícil: cuando el lienzo desaparece, los usuarios siguen necesitando una forma de entender lo que hizo el agente antes de poder editarlo con confianza.</p>
      <p>La frase en la respuesta fue «Layout Understanding Layer» (capa de comprensión del layout). Es un buen nombre porque rechaza la respuesta perezosa. El diseño agent-native no puede significar «confía en la captura de pantalla». Necesita un modelo legible del artefacto: secciones, intención, partes editables, referencias estables y movimientos de edición sugeridos. Esta publicación es un intento de tomarse esa respuesta en serio: esbozar qué podría cargar una capa así, dónde debería vivir en Open Design y por qué es una vía de contribución y no una promesa de roadmap.</p>
      <h2>El lienzo le daba a los diseñadores confianza espacial</h2>
      <p>El lienzo de Figma no es solo una superficie de dibujo. También es una superficie de explicación. Puedes alejar el zoom, ver la jerarquía de la página, hacer clic en un frame, inspeccionar restricciones, renombrar capas y entender dónde termina una pieza del trabajo y empieza otra.</p>
      <h3>Lo que realmente pierdes cuando el lienzo desaparece</h3>
      <p>Esa comprensión es fácil de subestimar hasta que ya no está. Una página de aterrizaje generada puede verse correcta en una vista previa aislada y aun así ser difícil de dirigir. El problema no son los píxeles, es la ausencia de un vocabulario compartido entre la persona y el agente.</p>
      <p>«Haz el hero más seguro de sí mismo» solo es útil si el agente y la persona coinciden en qué es el hero. «Aprieta la sección de precios» solo funciona si el artefacto conserva una identidad de sección estable a través de las revisiones. Sin eso, cada instrucción degenera en señalar con el dedo: el diseñador describe una región por su posición («el segundo bloque desde arriba»), el agente adivina a partir de la salida renderizada, y la siguiente regeneración renumera todo en silencio. El lienzo solía absorber este coste de forma silenciosa. Nombraba las partes por ti, mantenía esos nombres estables mientras trabajabas y te permitía seleccionar una sin describirla.</p>
      <h3>La claridad vale la pena conservarla aunque la unidad sea equivocada</h3>
      <p>Esta es la parte del argumento #DeFigma que requiere cuidado. El lienzo puede ser la unidad de trabajo equivocada para un sistema agent-native —asume a una persona arrastrando rectángulos, no a un agente escribiendo archivos—, pero la claridad que la gente obtenía del lienzo sigue siendo valiosa. El error sería tratar «descartar el lienzo» y «descartar la comprensión que el lienzo proporcionaba» como la misma decisión. No lo son. Open Design tiene que trasladar esa claridad al modelo del artefacto, no tirarla. La capa de layout es el nombre de ese traslado.</p>
      <h2>Open Design ya tiene las primitivas correctas</h2>
      <p>La razón por la que esta propuesta encaja en Open Design es que el proyecto ya está construido en torno a contratos explícitos. Una skill es un archivo <code>SKILL.md</code>. Un sistema de diseño es un archivo <code>DESIGN.md</code>. Un plugin añade un sidecar <code>open-design.json</code>. Nada en el sistema es un blob binario que tengas que aplicar ingeniería inversa; los contratos son texto, y el texto es algo que tanto un agente como una persona pueden leer. La mecánica está cubierta en <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: cómo funciona la biblioteca de Open Design</a>, y el argumento de producto está en <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a>.</p>
      <p>La capa de layout debería seguir el mismo patrón. Debería ser texto que el agente pueda leer, estado que la UI pueda renderizar y metadatos que otro agente pueda reutilizar. Si no puede satisfacer las tres cosas a la vez, tiene la forma equivocada.</p>
      <p>En términos del repositorio, eso apunta a tres superficies:</p>




















      <table><thead><tr><th>Superficie</th><th>Qué debería cargar</th></tr></thead><tbody><tr><td>Manifiesto del artefacto</td><td>IDs estables para secciones, componentes, recursos y archivos generados</td></tr><tr><td>Snapshot del plugin</td><td>Qué skill, sistema de diseño, entradas y etapas del pipeline produjeron el artefacto</td></tr><tr><td>UI de revisión / salida headless</td><td>Un mapa de layout, aspectos editables e intenciones de edición sugeridas</td></tr></tbody></table>
      <p>La restricción importante: la capa no debe convertirse en un segundo lienzo propietario. El modo de fallo a evitar es reconstruir el grafo de escena de Figma bajo un nombre nuevo: una estructura rica y específica de la aplicación que solo la UI de Open Design puede renderizar y que muere en el momento en que sales de la aplicación. La capa de layout debería ser, en cambio, un mapa de artefacto plano que viaje con los archivos, de modo que un colaborador pueda leerlo en un editor de texto y un agente distinto pueda consumirlo sin un SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Un esqueleto de layout en wireframe que se levanta como su propia capa seleccionable sobre un lienzo en blanco, en un marco verde sobre un fondo editorial casi blanco">
        <figcaption>La capa de layout es la estructura que el lienzo mantenía implícita, extraída a un lugar donde tanto un agente como una persona pueden leerla.</figcaption>
      </figure>
      <h2>Una forma práctica para la capa de layout</h2>
      <p>Esta es la versión más pequeña que haría que el diseño agent-native se sintiera menos opaco:</p>
      <ol>
      <li>Cada artefacto generado obtiene IDs semánticos estables: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Cada ID carga una frase de intención: «Explicar la promesa del producto en una sola pantalla», no «sección superior».</li>
      <li>Cada sección enumera aspectos editables: texto, densidad, layout, color, medios, movimiento, fuente de datos.</li>
      <li>Cada archivo generado enlaza de vuelta al ID de sección que lo produjo.</li>
      <li>Cada pasada de revisión emite intenciones de edición sugeridas: «acortar el titular del hero», «aumentar el contraste en las tarjetas de precios», «dividir el bloque de testimonios».</li>
      <li>La UI renderiza esto como un navegador, mientras que los usuarios headless reciben la misma estructura como JSON o Markdown.</li>
      </ol>
      <h3>Cómo podría verse en realidad un manifiesto</h3>
      <p>El sentido de ponerlo por escrito es que la estructura no tiene nada de extraordinario, que es exactamente por lo que puede ser un contrato público en lugar de un truco privado. Un manifiesto para una página de aterrizaje generada podría leerse así:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Ninguna de esas claves es exótica. <code>sections</code> es una lista, <code>editable</code> es un enum, <code>files</code> es una referencia hacia atrás. El valor no está en la astucia del esquema, sino en el hecho de que los IDs sobreviven a una regeneración, de modo que el mismo bloque <code>pricing</code> sigue siendo <code>pricing</code> después de que el agente lo reescriba dos veces.</p>
      <p>Eso basta para permitir que un diseñador diga «Cambia <code>pricing</code> de tres planes a dos», y basta para permitir que un agente de código parchee el archivo correcto sin adivinar a partir de los píxeles. La instrucción se resuelve en un ID de sección, el ID de sección se resuelve en un conjunto de archivos, y la edición aterriza donde se pretendía.</p>
      <h3>Por qué esto es una vía de contribución, no una solicitud de función</h3>
      <p>También le da a la comunidad una vía de contribución limpia. Un colaborador no necesita rediseñar el producto para ayudar aquí. Puede escribir una skill que emita un manifiesto para un tipo de artefacto, un átomo de revisión que proponga intenciones de edición, una extensión de manifiesto que añada un campo que otras skills puedan leer, o un caso de prueba que verifique que los IDs de sección se mantienen estables a través de una regeneración. Cada uno de esos es un cambio pequeño y mergeable que hace que una salida sea menos opaca, y como la capa es texto plano, dos colaboradores trabajando en una presentación y en una pantalla móvil no tienen que coordinar un formato binario compartido. La capa de layout se convierte en un contrato público, no en una capacidad privada enterrada dentro de la aplicación.</p>
      <h2>Qué hacer a continuación</h2>
      <p>Si este es el tipo de problema en el que quieres trabajar, contribuye con una pequeña skill o plugin que haga que un artefacto sea más fácil de inspeccionar. Empieza con una salida concreta: una página de aterrizaje, una presentación o una pantalla móvil. Añade IDs de sección estables, describe los aspectos editables, emítelos como JSON o Markdown junto al artefacto, y abre el PR con un artefacto de antes/después para que quien revise pueda ver la diferencia que aporta una capa inspeccionable.</p>
      <p>Esto sigue siendo una dirección, no una función entregada; el valor de nombrarla ahora es que las primitivas ya existen, así que el trabajo es aditivo en lugar de una reescritura.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Contribuye con una skill</a>.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: cómo funciona la biblioteca de Open Design</a> — las primitivas actuales basadas en archivos que sustentan la propuesta</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a> — la forma de producto que hace posibles los contratos públicos de artefactos</li>
      <li><a href="/blog/figma-alternative-open-design/">La alternativa de código abierto a Figma</a> — dónde aterriza «descartar el lienzo» frente al referente que hizo del lienzo el centro</li>
      </ul>
  pt-br:
    title: "A camada de layout que o canvas costumava esconder"
    summary: "Uma resposta da comunidade no preview do 0.8.0 nomeou a verdadeira pergunta por trás do design agent-native: se o canvas deixa de ser a unidade de trabalho, como os usuários ainda entendem o layout?"
    bodyHtml: |
      <p>Uma resposta útil da comunidade não pede um botão maior. Ela nomeia a camada que falta.</p>
      <p>Foi isso que aconteceu na <a href="https://github.com/nexu-io/open-design/discussions/1727">discussão do Open Design 0.8.0-preview</a>. A thread de lançamento defendia duas mudanças: parar de tratar o canvas como a unidade primária de trabalho e fazer do agente o trabalhador de design de primeira classe. Uma resposta concordou com a direção e então apontou a parte difícil: quando o canvas desaparece, os usuários ainda precisam de um jeito de entender o que o agente fez antes de poder editá-lo com confiança.</p>
      <p>A expressão na resposta foi “Camada de Compreensão de Layout” (Layout Understanding Layer). É um bom nome porque recusa a resposta preguiçosa. Design agent-native não pode significar “confie no screenshot.” Ele precisa de um modelo legível do artefato: seções, intenção, partes editáveis, referências estáveis e movimentos de edição sugeridos. Este post é uma tentativa de levar essa resposta a sério — de esboçar o que tal camada poderia carregar, onde ela deveria viver no Open Design e por que ela é um caminho de contribuição, não uma promessa de roadmap.</p>
      <h2>O canvas dava aos designers confiança espacial</h2>
      <p>O canvas do Figma não é só uma superfície de desenho. É também uma superfície de explicação. Você pode dar zoom-out, ver a hierarquia da página, clicar num frame, inspecionar constraints, renomear layers e entender onde uma parte do trabalho termina e outra começa.</p>
      <h3>O que você de fato perde quando o canvas vai embora</h3>
      <p>Essa compreensão é fácil de subestimar até que ela some. Uma landing page gerada pode parecer correta em uma prévia em sandbox e ainda assim ser difícil de dirigir. O problema não são os pixels — é a ausência de um vocabulário compartilhado entre o humano e o agente.</p>
      <p>“Deixe o hero mais confiante” só é útil se o agente e o humano concordarem sobre o que é o hero. “Aperte a seção de preços” só funciona se o artefato carregar uma identidade de seção estável entre revisões. Sem isso, toda instrução degenera em apontar: o designer descreve uma região pela sua posição (“o segundo bloco de cima para baixo”), o agente adivinha a partir da saída renderizada, e a próxima regeneração silenciosamente renumera tudo. O canvas costumava absorver esse custo silenciosamente. Ele nomeava as partes para você, mantinha esses nomes estáveis enquanto você trabalhava e deixava você selecionar uma sem descrevê-la.</p>
      <h3>A clareza vale a pena manter mesmo que a unidade esteja errada</h3>
      <p>Esta é a parte do argumento do #DeFigma que precisa de cuidado. O canvas pode ser a unidade errada de trabalho para um sistema agent-native — ele pressupõe um humano arrastando retângulos, não um agente escrevendo arquivos — mas a clareza que as pessoas obtinham do canvas ainda é valiosa. O erro seria tratar “abandonar o canvas” e “abandonar a compreensão que o canvas fornecia” como a mesma decisão. Não são. O Open Design precisa mover essa clareza para o modelo do artefato, não jogá-la fora. A camada de layout é o nome dessa realocação.</p>
      <h2>O Open Design já tem as primitivas certas</h2>
      <p>A razão pela qual esta proposta encaixa no Open Design é que o projeto já é construído em torno de contratos explícitos. Uma skill é um arquivo <code>SKILL.md</code>. Um design system é um arquivo <code>DESIGN.md</code>. Um plugin adiciona um sidecar <code>open-design.json</code>. Nada no sistema é um blob binário que você precise fazer engenharia reversa; os contratos são texto, e texto é algo que tanto um agente quanto um humano podem ler. A mecânica está coberta em <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: como funciona a biblioteca do Open Design</a>, e o argumento de produto está em <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a>.</p>
      <p>A camada de layout deveria seguir o mesmo padrão. Deveria ser texto que o agente possa ler, estado que a UI possa renderizar e metadados que outro agente possa reutilizar. Se não conseguir satisfazer as três coisas ao mesmo tempo, está com o formato errado.</p>
      <p>Em termos de repositório, isso aponta para três superfícies:</p>





















      <table><thead><tr><th>Superfície</th><th>O que deveria carregar</th></tr></thead><tbody><tr><td>Manifesto do artefato</td><td>IDs estáveis para seções, componentes, ativos e arquivos gerados</td></tr><tr><td>Snapshot do plugin</td><td>Qual skill, design system, entradas e estágios de pipeline produziram o artefato</td></tr><tr><td>UI de revisão / saída headless</td><td>Um mapa de layout, aspectos editáveis e intenções de edição sugeridas</td></tr></tbody></table>
      <p>A restrição importante: a camada não deveria virar um segundo canvas proprietário. O modo de falha a evitar é reconstruir o scene graph do Figma com um novo nome — uma estrutura rica e específica do app que só a UI do Open Design consegue renderizar e que morre no momento em que você sai do app. A camada de layout deveria ser, em vez disso, um mapa de artefato simples que viaja com os arquivos, para que um contribuidor possa lê-lo em um editor de texto e um agente diferente possa consumi-lo sem um SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Um esqueleto de layout em wireframe se erguendo como sua própria camada selecionável acima de um canvas em branco, em uma moldura verde sobre um fundo editorial quase branco">
        <figcaption>A camada de layout é a estrutura que o canvas mantinha implícita — extraída para onde um agente e um humano possam ambos lê-la.</figcaption>
      </figure>
      <h2>Um formato prático para a camada de layout</h2>
      <p>Aqui está a menor versão que tornaria o design agent-native menos opaco:</p>
      <ol>
      <li>Cada artefato gerado recebe IDs semânticos estáveis: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Cada ID carrega uma frase de intenção: “Explicar a promessa do produto em uma tela”, não “seção do topo”.</li>
      <li>Cada seção lista aspectos editáveis: texto, densidade, layout, cor, mídia, movimento, fonte de dados.</li>
      <li>Cada arquivo gerado faz referência de volta ao ID da seção que o produziu.</li>
      <li>Cada passada de revisão emite intenções de edição sugeridas: “encurtar o título do hero”, “aumentar o contraste nos cards de preços”, “dividir o bloco de depoimentos”.</li>
      <li>A UI renderiza isso como um navegador, enquanto usuários headless recebem a mesma estrutura como JSON ou Markdown.</li>
      </ol>
      <h3>Como um manifesto poderia realmente parecer</h3>
      <p>O sentido de escrevê-lo é que a estrutura é nada notável — que é exatamente por que ela pode ser um contrato público em vez de um truque privado. Um manifesto para uma landing page gerada poderia se ler assim:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Nenhuma dessas chaves é exótica. <code>sections</code> é uma lista, <code>editable</code> é um enum, <code>files</code> é uma referência de volta. O valor não está na esperteza do schema — está no fato de que os IDs sobrevivem a uma regeneração, de modo que o mesmo bloco <code>pricing</code> ainda é <code>pricing</code> depois que o agente o reescreve duas vezes.</p>
      <p>Isso é suficiente para deixar um designer dizer “Mude <code>pricing</code> de três planos para dois”, e suficiente para deixar um agente de código corrigir o arquivo certo sem adivinhar a partir dos pixels. A instrução resolve para um ID de seção, o ID de seção resolve para um conjunto de arquivos, e a edição aterrissa onde foi destinada.</p>
      <h3>Por que isso é um caminho de contribuição, não um pedido de recurso</h3>
      <p>Isso também dá à comunidade um caminho de contribuição limpo. Um contribuidor não precisa redesenhar o produto para ajudar aqui. Ele pode escrever uma skill que emite um manifesto para um tipo de artefato, um átomo de revisão que propõe intenções de edição, uma extensão de manifesto que adiciona um campo que outras skills possam ler, ou um caso de teste que afirma que os IDs de seção permanecem estáveis ao longo de uma regeneração. Cada um deles é uma mudança pequena e mergeável que torna uma saída menos opaca — e como a camada é texto puro, dois contribuidores trabalhando em um deck e numa tela mobile não precisam coordenar um formato binário compartilhado. A camada de layout vira um contrato público, não uma capacidade privada enterrada dentro do app.</p>
      <h2>O que fazer a seguir</h2>
      <p>Se esse é o tipo de problema em que você quer trabalhar, contribua com uma pequena skill ou plugin que torne um artefato mais fácil de inspecionar. Comece com uma saída concreta: uma landing page, um deck ou uma tela mobile. Adicione IDs de seção estáveis, descreva os aspectos editáveis, emita-os como JSON ou Markdown junto ao artefato e abra o PR com um artefato de antes/depois para que um revisor possa ver a diferença que uma camada inspecionável faz.</p>
      <p>Isso ainda é uma direção, não um recurso entregue — o valor de nomeá-la agora é que as primitivas já existem, então o trabalho é aditivo em vez de uma reescrita.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Contribua com uma skill</a>.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas: como funciona a biblioteca do Open Design</a> — as primitivas atuais orientadas a arquivo por baixo da proposta</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a> — o formato de produto que torna possíveis os contratos públicos de artefato</li>
      <li><a href="/blog/figma-alternative-open-design/">A alternativa open-source ao Figma</a> — onde “abandonar o canvas” aterrissa contra o incumbente que tornou o canvas central</li>
      </ul>
  it:
    title: "Il livello di layout che il canvas nascondeva"
    summary: "Una risposta della community sulla preview di 0.8.0 ha dato un nome alla vera domanda dietro il design agent-native: se il canvas smette di essere l'unità di lavoro, come fanno gli utenti a capire ancora il layout?"
    bodyHtml: |
      <p>Una risposta utile della community non chiede un pulsante più grande. Dà un nome al livello mancante.</p>
      <p>È quello che è successo sotto la <a href="https://github.com/nexu-io/open-design/discussions/1727">discussione su Open Design 0.8.0-preview</a>. Il thread di lancio sosteneva due cambiamenti: smettere di trattare il canvas come l'unità di lavoro primaria, e rendere l'agente un lavoratore di design di prima classe. Una risposta concordava con la direzione, poi indicava la parte difficile: quando il canvas scompare, gli utenti hanno ancora bisogno di un modo per capire cosa l'agente ha creato prima di poterlo modificare con fiducia.</p>
      <p>L'espressione nella risposta era "Layout Understanding Layer". È un buon nome perché rifiuta la risposta pigra. Il design agent-native non può significare "fidati dello screenshot". Ha bisogno di un modello leggibile dell'artefatto: sezioni, intento, parti modificabili, riferimenti stabili e mosse di modifica suggerite. Questo articolo è un tentativo di prendere sul serio quella risposta: abbozzare cosa potrebbe trasportare un tale livello, dove dovrebbe vivere in Open Design e perché è un percorso di contribuzione piuttosto che una promessa di roadmap.</p>
      <h2>Il canvas dava ai designer fiducia spaziale</h2>
      <p>Il canvas di Figma non è solo una superficie di disegno. È anche una superficie di spiegazione. Puoi rimpicciolire, vedere la gerarchia della pagina, cliccare un frame, ispezionare i vincoli, rinominare i livelli e capire dove un pezzo di lavoro finisce e un altro inizia.</p>
      <h3>Cosa perdi davvero quando il canvas scompare</h3>
      <p>Quella comprensione è facile da sottovalutare finché non è andata. Una landing page generata può sembrare corretta in un'anteprima in sandbox ed essere comunque difficile da dirigere. Il problema non sono i pixel: è l'assenza di un vocabolario condiviso tra l'umano e l'agente.</p>
      <p>"Rendi l'hero più sicuro" è utile solo se l'agente e l'umano concordano su cosa sia l'hero. "Stringi la sezione dei prezzi" funziona solo se l'artefatto porta un'identità di sezione stabile attraverso le revisioni. Senza quello, ogni istruzione degenera in un indicare: il designer descrive una regione per la sua posizione ("il secondo blocco dall'alto"), l'agente indovina dall'output renderizzato, e la rigenerazione successiva rinumera silenziosamente tutto. Il canvas assorbiva questo costo silenziosamente. Nominava le parti per te, manteneva quei nomi stabili mentre lavoravi, e ti lasciava selezionarne una senza descriverla.</p>
      <h3>La chiarezza vale la pena di essere conservata anche se l'unità è sbagliata</h3>
      <p>Questa è la parte dell'argomentazione #DeFigma che richiede attenzione. Il canvas può essere l'unità di lavoro sbagliata per un sistema agent-native — presuppone un umano che trascina rettangoli, non un agente che scrive file — ma la chiarezza che le persone ottenevano dal canvas è ancora preziosa. L'errore sarebbe trattare "abbandona il canvas" e "abbandona la comprensione che il canvas forniva" come la stessa decisione. Non lo sono. Open Design deve spostare quella chiarezza nel modello dell'artefatto, non buttarla via. Il livello di layout è il nome per quel trasloco.</p>
      <h2>Open Design ha già le primitive giuste</h2>
      <p>Il motivo per cui questa proposta si adatta a Open Design è che il progetto è già costruito attorno a contratti espliciti. Una skill è un file <code>SKILL.md</code>. Un design system è un file <code>DESIGN.md</code>. Un plugin aggiunge un file laterale <code>open-design.json</code>. Nulla nel sistema è un blob binario che devi decodificare; i contratti sono testo, e il testo è qualcosa che sia un agente sia un umano possono leggere. I meccanismi sono trattati in <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistemi: come funziona la libreria di Open Design</a>, e l'argomentazione di prodotto è in <a href="/blog/why-we-built-open-design-as-a-skill-layer/">perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>.</p>
      <p>Il livello di layout dovrebbe seguire lo stesso schema. Dovrebbe essere testo che l'agente può leggere, stato che la UI può renderizzare e metadati che un altro agente può riutilizzare. Se non può soddisfare tutti e tre contemporaneamente, ha la forma sbagliata.</p>
      <p>In termini di repository, questo punta a tre superfici:</p>




      <table><thead><tr><th>Superficie</th><th>Cosa dovrebbe trasportare</th></tr></thead><tbody><tr><td>Manifest dell'artefatto</td><td>ID stabili per sezioni, componenti, asset e file generati</td></tr><tr><td>Snapshot del plugin</td><td>Quale skill, design system, input e fasi della pipeline hanno prodotto l'artefatto</td></tr><tr><td>UI di revisione / output headless</td><td>Una mappa del layout, gli aspetti modificabili e gli intenti di modifica suggeriti</td></tr></tbody></table>
      <p>Il vincolo importante: il livello non dovrebbe diventare un secondo canvas proprietario. La modalità di fallimento da evitare è ricostruire lo scene graph di Figma sotto un nuovo nome — una struttura ricca e specifica dell'app che solo la UI di Open Design può renderizzare e che muore nel momento in cui lasci l'app. Il livello di layout dovrebbe invece essere una semplice mappa dell'artefatto che viaggia con i file, così un contributore può leggerla in un editor di testo e un agente diverso può consumarla senza un SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Uno scheletro wireframe di layout che si solleva come un proprio livello selezionabile sopra un canvas vuoto, in una cornice verde su uno sfondo editoriale quasi bianco">
        <figcaption>Il livello di layout è la struttura che il canvas teneva implicita, estratta dove un agente e un umano possono entrambi leggerla.</figcaption>
      </figure>
      <h2>Una forma pratica per il livello di layout</h2>
      <p>Ecco la versione più piccola che renderebbe il design agent-native meno opaco:</p>
      <ol>
      <li>Ogni artefatto generato ottiene ID semantici stabili: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Ogni ID porta una frase di intento: "Spiega la promessa del prodotto in una schermata", non "sezione superiore".</li>
      <li>Ogni sezione elenca gli aspetti modificabili: testi, densità, layout, colore, media, motion, fonte dati.</li>
      <li>Ogni file generato si ricollega all'ID della sezione che lo ha prodotto.</li>
      <li>Ogni passaggio di revisione emette intenti di modifica suggeriti: "accorcia il titolo dell'hero", "aumenta il contrasto nelle card dei prezzi", "dividi il blocco delle testimonianze".</li>
      <li>La UI lo renderizza come un navigatore, mentre gli utenti headless ricevono la stessa struttura come JSON o Markdown.</li>
      </ol>
      <h3>Come potrebbe apparire davvero un manifest</h3>
      <p>Il punto di scriverlo è che la struttura è poco notevole — il che è esattamente il motivo per cui può essere un contratto pubblico invece di un trucco privato. Un manifest per una landing page generata potrebbe leggersi così:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Nessuna di quelle chiavi è esotica. <code>sections</code> è una lista, <code>editable</code> è un enum, <code>files</code> è un riferimento all'indietro. Il valore non sta nell'ingegnosità dello schema: sta nel fatto che gli ID sopravvivono a una rigenerazione, così lo stesso blocco <code>pricing</code> è ancora <code>pricing</code> dopo che l'agente lo ha riscritto due volte.</p>
      <p>Questo basta per permettere a un designer di dire "Cambia <code>pricing</code> da tre piani a due", e basta per permettere a un agente di codice di applicare la patch al file giusto senza indovinare dai pixel. L'istruzione si risolve in un ID di sezione, l'ID di sezione si risolve in un insieme di file, e la modifica arriva dove era destinata.</p>
      <h3>Perché questo è un percorso di contribuzione, non una richiesta di funzionalità</h3>
      <p>Dà anche alla community un percorso di contribuzione pulito. Un contributore non ha bisogno di riprogettare il prodotto per aiutare qui. Può scrivere una skill che emette un manifest per un tipo di artefatto, un atomo di revisione che propone intenti di modifica, un'estensione di manifest che aggiunge un campo che altre skill possono leggere, o un caso di test che afferma che gli ID di sezione restano stabili attraverso una rigenerazione. Ognuna di queste è una modifica piccola e mergeabile che rende un output meno opaco — e poiché il livello è testo semplice, due contributori che lavorano su un deck e una schermata mobile non devono coordinare un formato binario condiviso. Il livello di layout diventa un contratto pubblico, non una capacità privata sepolta dentro l'app.</p>
      <h2>Cosa fare dopo</h2>
      <p>Se questo è il tipo di problema su cui vuoi lavorare, contribuisci con una piccola skill o un plugin che renda un artefatto più facile da ispezionare. Inizia con un output concreto: una landing page, un deck o una schermata mobile. Aggiungi ID di sezione stabili, descrivi gli aspetti modificabili, emettili come JSON o Markdown insieme all'artefatto, e apri la PR con un artefatto prima/dopo così un revisore può vedere la differenza che fa un livello ispezionabile.</p>
      <p>Questa è ancora una direzione, non una funzionalità rilasciata — il valore di nominarla ora è che le primitive esistono già, quindi il lavoro è additivo anziché una riscrittura.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Contribuisci con una skill</a>.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistemi: come funziona la libreria di Open Design</a>: le attuali primitive basate su file sotto la proposta</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>: la forma di prodotto che rende possibili i contratti pubblici sugli artefatti</li>
      <li><a href="/blog/figma-alternative-open-design/">L'alternativa open-source a Figma</a>: dove finisce "abbandona il canvas" rispetto al leader di mercato che ha reso il canvas centrale</li>
      </ul>
  vi:
    title: "Lớp bố cục mà canvas từng che giấu"
    summary: "Một phản hồi của cộng đồng trên bản 0.8.0 preview đã gọi đúng tên câu hỏi thực sự đằng sau thiết kế agent-native: nếu canvas thôi là đơn vị công việc, người dùng vẫn hiểu bố cục bằng cách nào?"
    bodyHtml: |
      <p>Một phản hồi hữu ích của cộng đồng không đòi một cái nút to hơn. Nó gọi đúng tên cái lớp còn thiếu.</p>
      <p>Đó là điều đã xảy ra dưới <a href="https://github.com/nexu-io/open-design/discussions/1727">cuộc thảo luận Open Design 0.8.0-preview</a>. Luồng ra mắt lập luận cho hai dịch chuyển: thôi coi canvas là đơn vị công việc chính, và biến agent thành người làm thiết kế hạng nhất. Một phản hồi đồng ý với hướng đi, rồi chỉ vào phần khó: khi canvas biến mất, người dùng vẫn cần một cách để hiểu agent đã làm gì trước khi họ có thể tự tin chỉnh sửa nó.</p>
      <p>Cụm từ trong phản hồi là “Layout Understanding Layer” (Lớp Hiểu Bố Cục). Đó là một cái tên hay vì nó từ chối câu trả lời lười biếng. Thiết kế agent-native không thể nghĩa là “tin vào ảnh chụp màn hình.” Nó cần một mô hình đọc được của artifact: các section, ý đồ, các phần có thể chỉnh sửa, các tham chiếu ổn định, và các nước chỉnh sửa gợi ý. Bài viết này là một nỗ lực coi trọng phản hồi đó — phác họa lớp như vậy có thể mang theo gì, nó nên nằm ở đâu trong Open Design, và vì sao nó là một con đường đóng góp chứ không phải một lời hứa lộ trình.</p>
      <h2>Canvas đã cho nhà thiết kế sự tự tin về không gian</h2>
      <p>Canvas của Figma không chỉ là một bề mặt vẽ. Nó còn là một bề mặt giải thích. Bạn có thể thu nhỏ, thấy phân cấp trang, nhấp một frame, xem các ràng buộc, đổi tên các layer, và hiểu nơi một mảnh công việc kết thúc và một mảnh khác bắt đầu.</p>
      <h3>Bạn thực sự mất gì khi canvas biến mất</h3>
      <p>Sự hiểu biết đó dễ bị đánh giá thấp cho đến khi nó mất đi. Một trang landing được tạo ra có thể trông đúng trong một bản xem trước sandbox mà vẫn khó điều hướng. Vấn đề không phải ở các pixel — nó là sự vắng mặt của một vốn từ vựng chung giữa con người và agent.</p>
      <p>“Làm cho hero tự tin hơn” chỉ hữu ích nếu agent và con người đồng ý hero là cái gì. “Siết chặt section pricing” chỉ hoạt động nếu artifact mang theo một danh tính section ổn định qua các bản chỉnh sửa. Không có điều đó, mọi chỉ dẫn suy thoái thành chỉ trỏ: nhà thiết kế mô tả một vùng bằng vị trí của nó (“khối thứ hai từ trên xuống”), agent đoán từ đầu ra đã render, và lần tạo lại tiếp theo âm thầm đánh số lại mọi thứ. Canvas từng âm thầm hấp thụ cái chi phí này. Nó đặt tên các phần cho bạn, giữ những cái tên đó ổn định trong khi bạn làm việc, và để bạn chọn một cái mà không phải mô tả nó.</p>
      <h3>Sự rõ ràng đáng giữ ngay cả khi đơn vị là sai</h3>
      <p>Đây là phần của lập luận #DeFigma cần thận trọng. Canvas có thể là đơn vị công việc sai cho một hệ thống agent-native — nó giả định một con người kéo các hình chữ nhật, không phải một agent viết các tệp — nhưng sự rõ ràng mà người ta có được từ canvas vẫn quý giá. Sai lầm sẽ là coi “bỏ canvas” và “bỏ sự hiểu biết mà canvas cung cấp” là cùng một quyết định. Chúng không phải vậy. Open Design phải dời sự rõ ràng đó vào mô hình artifact, không phải vứt nó đi. Lớp bố cục là cái tên cho sự dời chỗ đó.</p>
      <h2>Open Design đã có sẵn các nguyên tố đúng</h2>
      <p>Lý do đề xuất này hợp với Open Design là vì dự án đã được xây quanh các hợp đồng tường minh. Một skill là một tệp <code>SKILL.md</code>. Một design system là một tệp <code>DESIGN.md</code>. Một plugin thêm một tệp đi kèm <code>open-design.json</code>. Không gì trong hệ thống là một khối nhị phân bạn phải dịch ngược; các hợp đồng là văn bản, và văn bản là thứ mà cả agent lẫn con người đều đọc được. Cơ chế được trình bày trong <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 system: thư viện Open Design hoạt động ra sao</a>, và lập luận sản phẩm nằm trong <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a>.</p>
      <p>Lớp bố cục nên theo cùng mẫu hình. Nó nên là văn bản mà agent có thể đọc, trạng thái mà UI có thể render, và metadata mà một agent khác có thể tái sử dụng. Nếu nó không thể thỏa cả ba cùng lúc, nó là hình dạng sai.</p>
      <p>Nói theo ngôn ngữ repo, điều đó chỉ vào ba bề mặt:</p>


















      <table><thead><tr><th>Bề mặt</th><th>Nó nên mang theo gì</th></tr></thead><tbody><tr><td>Manifest artifact</td><td>Các ID ổn định cho các section, component, tài sản, và tệp được tạo ra</td></tr><tr><td>Ảnh chụp plugin</td><td>Skill nào, design system nào, đầu vào nào, và các giai đoạn pipeline nào đã tạo ra artifact</td></tr><tr><td>UI rà soát / đầu ra headless</td><td>Một bản đồ bố cục, các khía cạnh có thể chỉnh sửa, và các ý đồ chỉnh sửa gợi ý</td></tr></tbody></table>
      <p>Ràng buộc quan trọng: lớp này không nên trở thành một canvas độc quyền thứ hai. Chế độ thất bại cần tránh là dựng lại scene graph của Figma dưới một cái tên mới — một cấu trúc phong phú, đặc thù ứng dụng mà chỉ UI của Open Design render được và sẽ chết ngay khoảnh khắc bạn rời ứng dụng. Thay vào đó, lớp bố cục nên là một bản đồ artifact thuần đi cùng các tệp, để một người đóng góp có thể đọc nó trong một trình soạn thảo văn bản và một agent khác có thể tiêu thụ nó mà không cần SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Một bộ khung bố cục wireframe nhấc ra thành lớp riêng có thể chọn được phía trên một canvas trống, trong khung xanh lá trên nền biên tập gần như trắng">
        <figcaption>Lớp bố cục là cấu trúc mà canvas giữ ngầm — được kéo ra nơi cả agent lẫn con người đều có thể đọc.</figcaption>
      </figure>
      <h2>Một hình dạng thực tế cho lớp bố cục</h2>
      <p>Đây là phiên bản nhỏ nhất khiến thiết kế agent-native bớt mờ đục:</p>
      <ol>
      <li>Mỗi artifact được tạo ra nhận các ID ngữ nghĩa ổn định: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Mỗi ID mang theo một câu ý đồ: “Giải thích lời hứa sản phẩm trong một màn hình,” không phải “section trên cùng.”</li>
      <li>Mỗi section liệt kê các khía cạnh có thể chỉnh sửa: nội dung, mật độ, bố cục, màu, media, chuyển động, nguồn dữ liệu.</li>
      <li>Mỗi tệp được tạo ra liên kết ngược về ID section đã tạo ra nó.</li>
      <li>Mỗi lượt rà soát phát ra các ý đồ chỉnh sửa gợi ý: “rút ngắn tiêu đề hero,” “tăng tương phản trong các thẻ pricing,” “tách khối testimonial.”</li>
      <li>UI render cái này thành một bộ điều hướng, trong khi người dùng headless nhận cùng cấu trúc dưới dạng JSON hoặc Markdown.</li>
      </ol>
      <h3>Một manifest thực sự có thể trông như thế nào</h3>
      <p>Mục đích của việc viết nó ra là cấu trúc thì chẳng có gì đặc biệt — vốn chính là lý do nó có thể là một hợp đồng công khai thay vì một mánh riêng. Một manifest cho một trang landing được tạo ra có thể đọc như thế này:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Không khóa nào trong số đó là lạ lẫm. <code>sections</code> là một danh sách, <code>editable</code> là một enum, <code>files</code> là một tham chiếu ngược. Giá trị không nằm ở sự khôn ngoan của schema — nó nằm ở chuyện các ID sống sót qua một lần tạo lại, nên cùng khối <code>pricing</code> vẫn là <code>pricing</code> sau khi agent viết lại nó hai lần.</p>
      <p>Thế là đủ để một nhà thiết kế nói, “Đổi <code>pricing</code> từ ba gói xuống hai,” và đủ để một code agent vá đúng tệp mà không phải đoán từ các pixel. Chỉ dẫn phân giải thành một ID section, ID section phân giải thành một tập tệp, và bản chỉnh sửa đáp xuống đúng nơi nó được dành cho.</p>
      <h3>Vì sao đây là một con đường đóng góp, không phải một yêu cầu tính năng</h3>
      <p>Nó cũng cho cộng đồng một con đường đóng góp gọn gàng. Một người đóng góp không cần thiết kế lại sản phẩm để giúp ở đây. Họ có thể viết một skill phát ra một manifest cho một loại artifact, một nguyên tử rà soát đề xuất các ý đồ chỉnh sửa, một phần mở rộng manifest thêm một trường mà các skill khác có thể đọc, hoặc một ca kiểm thử khẳng định các ID section giữ ổn định qua một lần tạo lại. Mỗi cái trong số đó là một thay đổi nhỏ, có thể merge, khiến một đầu ra bớt mờ đục — và vì lớp này là văn bản thuần, hai người đóng góp làm trên một bộ slide và một màn hình di động không phải phối hợp một định dạng nhị phân chung. Lớp bố cục trở thành một hợp đồng công khai, không phải một năng lực riêng tư chôn bên trong ứng dụng.</p>
      <h2>Làm gì tiếp theo</h2>
      <p>Nếu đây là loại vấn đề bạn muốn làm, hãy đóng góp một skill hoặc plugin nhỏ khiến một artifact dễ kiểm tra hơn. Bắt đầu với một đầu ra cụ thể: một trang landing, một bộ slide, hoặc một màn hình di động. Thêm các ID section ổn định, mô tả các khía cạnh có thể chỉnh sửa, phát chúng dưới dạng JSON hoặc Markdown bên cạnh artifact, và mở PR kèm một artifact trước/sau để người rà soát thấy sự khác biệt mà một lớp kiểm tra được tạo ra.</p>
      <p>Đây vẫn là một hướng đi, không phải một tính năng đã ship — giá trị của việc gọi tên nó ngay bây giờ là các nguyên tố đã tồn tại sẵn, nên công việc mang tính cộng thêm chứ không phải viết lại.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Đóng góp một skill</a>.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 system: thư viện Open Design hoạt động ra sao</a> — các nguyên tố hiện tại dựa trên tệp nằm dưới đề xuất</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> — hình dạng sản phẩm khiến các hợp đồng artifact công khai trở nên khả thi</li>
      <li><a href="/blog/figma-alternative-open-design/">Giải pháp thay thế mã nguồn mở cho Figma</a> — nơi “bỏ canvas” đáp xuống so với kẻ đương nhiệm đã đặt canvas làm trung tâm</li>
      </ul>
  pl:
    title: "Warstwa układu, którą płótno kiedyś ukrywało"
    summary: "Odpowiedź społeczności w wątku 0.8.0 preview nazwała prawdziwe pytanie stojące za projektowaniem agent-native: jeśli płótno przestaje być jednostką pracy, jak użytkownicy wciąż rozumieją układ?"
    bodyHtml: |
      <p>Użyteczna odpowiedź społeczności nie prosi o większy przycisk. Nazywa brakującą warstwę.</p>
      <p>To właśnie wydarzyło się pod <a href="https://github.com/nexu-io/open-design/discussions/1727">dyskusją o Open Design 0.8.0-preview</a>. Wątek premierowy argumentował za dwiema zmianami: przestać traktować płótno jako podstawową jednostkę pracy i uczynić agenta projektantem pierwszej klasy. Jedna odpowiedź zgodziła się z kierunkiem, a potem wskazała trudną część: gdy płótno znika, użytkownicy wciąż potrzebują sposobu, by zrozumieć, co agent stworzył, zanim będą mogli to z pewnością edytować.</p>
      <p>Sformułowanie w odpowiedzi brzmiało „warstwa rozumienia układu” (Layout Understanding Layer). To dobra nazwa, bo odrzuca leniwą odpowiedź. Projektowanie agent-native nie może oznaczać „zaufaj zrzutowi ekranu”. Potrzebuje czytelnego modelu artefaktu: sekcji, intencji, edytowalnych części, stabilnych referencji i sugerowanych ruchów edycyjnych. Ten wpis to próba potraktowania tej odpowiedzi poważnie — naszkicowania, co taka warstwa mogłaby nieść, gdzie powinna żyć w Open Design i dlaczego jest ścieżką kontrybucji, a nie obietnicą z roadmapy.</p>
      <h2>Płótno dawało projektantom pewność przestrzenną</h2>
      <p>Płótno Figmy to nie tylko powierzchnia do rysowania. To także powierzchnia wyjaśniająca. Możesz oddalić widok, zobaczyć hierarchię strony, kliknąć ramkę, zbadać ograniczenia, zmienić nazwy warstw i zrozumieć, gdzie jedna część pracy się kończy, a zaczyna druga.</p>
      <h3>Co naprawdę tracisz, gdy płótno znika</h3>
      <p>To rozumienie łatwo niedocenić, dopóki go nie ma. Wygenerowany landing page może wyglądać poprawnie w piaskownicowym podglądzie, a wciąż być trudny do kierowania. Problemem nie są piksele — to brak wspólnego słownika między człowiekiem a agentem.</p>
      <p>„Spraw, by hero był pewniejszy siebie” jest użyteczne tylko wtedy, gdy agent i człowiek zgadzają się co do tego, czym jest hero. „Ściśnij sekcję cennika” działa tylko wtedy, gdy artefakt niesie stabilną tożsamość sekcji między rewizjami. Bez tego każda instrukcja degraduje się do wskazywania: projektant opisuje region przez jego pozycję („drugi blok od góry”), agent zgaduje z wyrenderowanego wyjścia, a następna regeneracja po cichu przenumerowuje wszystko. Płótno kiedyś milcząco pochłaniało ten koszt. Nazywało za Ciebie części, utrzymywało te nazwy stabilne, gdy pracowałeś, i pozwalało wybrać jedną bez opisywania jej.</p>
      <h3>Klarowność warto zachować, nawet jeśli jednostka jest błędna</h3>
      <p>To część argumentu #DeFigma, która wymaga ostrożności. Płótno może być błędną jednostką pracy dla systemu agent-native — zakłada człowieka przeciągającego prostokąty, a nie agenta piszącego pliki — ale klarowność, którą ludzie czerpali z płótna, wciąż jest cenna. Błędem byłoby traktowanie „porzuć płótno” i „porzuć rozumienie, które dawało płótno” jako tej samej decyzji. To nie jest to samo. Open Design musi przenieść tę klarowność do modelu artefaktu, a nie ją wyrzucić. Warstwa układu to nazwa tej relokacji.</p>
      <h2>Open Design już ma właściwe prymitywy</h2>
      <p>Powodem, dla którego ta propozycja pasuje do Open Design, jest to, że projekt jest już zbudowany wokół jawnych kontraktów. Umiejętność to plik <code>SKILL.md</code>. System projektowy to plik <code>DESIGN.md</code>. Wtyczka dodaje plik towarzyszący <code>open-design.json</code>. Nic w systemie nie jest binarnym blobem, który trzeba odkodować wstecznie; kontrakty to tekst, a tekst to coś, co i agent, i człowiek mogą przeczytać. Mechanika jest omówiona w <a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy: jak działa biblioteka Open Design</a>, a argument produktowy w <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a>.</p>
      <p>Warstwa układu powinna podążać za tym samym wzorcem. Powinna być tekstem, który agent może przeczytać, stanem, który UI może wyrenderować, i metadanymi, które inny agent może reużyć. Jeśli nie może spełnić wszystkich trzech naraz, ma zły kształt.</p>
      <p>W kategoriach repozytorium wskazuje to na trzy powierzchnie:</p>





















      <table><thead><tr><th>Powierzchnia</th><th>Co powinna nieść</th></tr></thead><tbody><tr><td>Manifest artefaktu</td><td>Stabilne ID dla sekcji, komponentów, zasobów i wygenerowanych plików</td></tr><tr><td>Migawka wtyczki</td><td>Która umiejętność, system projektowy, wejścia i etapy pipeline'u wyprodukowały artefakt</td></tr><tr><td>UI recenzji / wyjście headless</td><td>Mapa układu, edytowalne aspekty i sugerowane intencje edycji</td></tr></tbody></table>
      <p>Ważne ograniczenie: warstwa nie powinna stać się drugim zastrzeżonym płótnem. Trybem awarii, którego należy unikać, jest odbudowanie grafu sceny Figmy pod nową nazwą — bogatej, specyficznej dla aplikacji struktury, którą tylko UI Open Design potrafi wyrenderować i która umiera w chwili, gdy opuszczasz aplikację. Warstwa układu powinna zamiast tego być zwykłą mapą artefaktu, która podróżuje z plikami, tak by kontrybutor mógł przeczytać ją w edytorze tekstu, a inny agent mógł ją skonsumować bez SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Szkielet układu wireframe'u unoszący się jako własna wybieralna warstwa nad pustym płótnem, w zielonej ramce na niemal białym, redakcyjnym tle">
        <figcaption>Warstwa układu to struktura, którą płótno trzymało domyślnie — wyciągnięta tam, gdzie i agent, i człowiek mogą ją przeczytać.</figcaption>
      </figure>
      <h2>Praktyczny kształt warstwy układu</h2>
      <p>Oto najmniejsza wersja, która sprawiłaby, że projektowanie agent-native byłoby mniej nieprzejrzyste:</p>
      <ol>
      <li>Każdy wygenerowany artefakt dostaje stabilne semantyczne ID: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Każde ID niesie zdanie intencji: „Wyjaśnij obietnicę produktu na jednym ekranie”, a nie „sekcja na górze”.</li>
      <li>Każda sekcja wymienia edytowalne aspekty: tekst, gęstość, układ, kolor, media, ruch, źródło danych.</li>
      <li>Każdy wygenerowany plik odsyła z powrotem do ID sekcji, która go wyprodukowała.</li>
      <li>Każdy przebieg recenzji emituje sugerowane intencje edycji: „skróć nagłówek hero”, „zwiększ kontrast w kartach cennika”, „rozdziel blok opinii”.</li>
      <li>UI renderuje to jako nawigator, podczas gdy użytkownicy headless otrzymują tę samą strukturę jako JSON lub Markdown.</li>
      </ol>
      <h3>Jak mógłby wyglądać manifest</h3>
      <p>Sensem zapisania tego jest to, że struktura jest niczym niezwykłym — i właśnie dlatego może być publicznym kontraktem zamiast prywatnej sztuczki. Manifest dla wygenerowanego landing page'a mógłby wyglądać tak:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Żaden z tych kluczy nie jest egzotyczny. <code>sections</code> to lista, <code>editable</code> to enum, <code>files</code> to odsyłacz wsteczny. Wartość nie tkwi w sprycie schematu — tkwi w tym, że ID przeżywają regenerację, więc ten sam blok <code>pricing</code> wciąż jest <code>pricing</code> po tym, jak agent przepisze go dwa razy.</p>
      <p>To wystarczy, by projektant mógł powiedzieć „Zmień <code>pricing</code> z trzech planów na dwa” i wystarczy, by agent kodu mógł załatać właściwy plik bez zgadywania z pikseli. Instrukcja rozwiązuje się do ID sekcji, ID sekcji rozwiązuje się do zestawu plików, a edycja ląduje tam, gdzie miała.</p>
      <h3>Dlaczego to ścieżka kontrybucji, a nie prośba o funkcję</h3>
      <p>Daje to też społeczności czystą ścieżkę kontrybucji. Kontrybutor nie musi przeprojektowywać produktu, by tu pomóc. Może napisać umiejętność, która emituje manifest dla jednego typu artefaktu, atom recenzji, który proponuje intencje edycji, rozszerzenie manifestu, które dodaje pole czytelne dla innych umiejętności, albo przypadek testowy, który zapewnia, że ID sekcji pozostają stabilne podczas regeneracji. Każda z nich to mała, scalalna zmiana, która czyni jedno wyjście mniej nieprzejrzystym — a ponieważ warstwa to zwykły tekst, dwóch kontrybutorów pracujących nad prezentacją i ekranem mobilnym nie musi koordynować wspólnego formatu binarnego. Warstwa układu staje się publicznym kontraktem, a nie prywatną zdolnością zakopaną wewnątrz aplikacji.</p>
      <h2>Co robić dalej</h2>
      <p>Jeśli to rodzaj problemu, nad którym chcesz pracować, wnieś małą umiejętność lub wtyczkę, która ułatwia inspekcję jednego artefaktu. Zacznij od konkretnego wyjścia: landing page, prezentacji lub ekranu mobilnego. Dodaj stabilne ID sekcji, opisz edytowalne aspekty, emituj je jako JSON lub Markdown obok artefaktu i otwórz PR z artefaktem przed/po, by recenzent mógł zobaczyć różnicę, jaką robi inspekcjonowalna warstwa.</p>
      <p>To wciąż kierunek, a nie dostarczona funkcja — wartością nazwania tego teraz jest to, że prymitywy już istnieją, więc praca jest addytywna, a nie przepisywaniem.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Wnieś umiejętność</a>.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy: jak działa biblioteka Open Design</a> — obecne prymitywy oparte na plikach pod tą propozycją</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — kształt produktu, który umożliwia publiczne kontrakty artefaktów</li>
      <li><a href="/blog/figma-alternative-open-design/">Otwartoźródłowa alternatywa dla Figma</a> — gdzie ląduje „porzuć płótno” wobec zasiedziałego gracza, który uczynił płótno centralnym</li>
      </ul>
  id:
    title: "Lapisan tata letak yang dulu disembunyikan oleh kanvas"
    summary: "Sebuah balasan komunitas pada pratinjau 0.8.0 menamai pertanyaan sebenarnya di balik desain agent-native: jika kanvas berhenti menjadi unit kerja, bagaimana pengguna tetap memahami tata letak?"
    bodyHtml: |
      <p>Sebuah balasan komunitas yang berguna tidak meminta tombol yang lebih besar. Ia menamai lapisan yang hilang.</p>
      <p>Itulah yang terjadi di bawah <a href="https://github.com/nexu-io/open-design/discussions/1727">diskusi Open Design 0.8.0-preview</a>. Thread peluncuran berargumen untuk dua pergeseran: berhenti memperlakukan kanvas sebagai unit kerja utama, dan jadikan agent sebagai pekerja desain kelas satu. Satu balasan setuju dengan arahnya, lalu menunjuk pada bagian yang sulit: ketika kanvas menghilang, pengguna masih membutuhkan cara untuk memahami apa yang dibuat agent sebelum mereka dapat mengeditnya dengan percaya diri.</p>
      <p>Frasa dalam balasan itu adalah “Layout Understanding Layer.” Itu adalah nama yang bagus karena ia menolak jawaban malas. Desain agent-native tidak bisa berarti “percayai tangkapan layar.” Ia membutuhkan model artefak yang dapat dibaca: seksi, niat, bagian yang dapat diedit, referensi yang stabil, dan saran langkah pengeditan. Tulisan ini adalah upaya untuk menanggapi balasan itu secara serius — untuk menggambarkan apa yang bisa dibawa lapisan semacam itu, di mana ia seharusnya berada di Open Design, dan mengapa ia adalah jalur kontribusi alih-alih janji roadmap.</p>
      <h2>Kanvas memberi desainer kepercayaan spasial</h2>
      <p>Kanvas Figma bukan hanya permukaan menggambar. Ia juga permukaan penjelasan. Anda dapat memperkecil tampilan, melihat hierarki halaman, mengklik sebuah frame, memeriksa constraint, mengganti nama layer, dan memahami di mana satu bagian pekerjaan berakhir dan yang lain dimulai.</p>
      <h3>Apa yang sebenarnya Anda kehilangan ketika kanvas menghilang</h3>
      <p>Pemahaman itu mudah diremehkan sampai ia hilang. Sebuah landing page yang dihasilkan bisa terlihat benar di pratinjau yang ter-sandbox dan tetap sulit diarahkan. Masalahnya bukan piksel — melainkan ketiadaan kosakata bersama antara manusia dan agent.</p>
      <p>“Buat hero lebih percaya diri” hanya berguna jika agent dan manusia sepakat tentang apa itu hero. “Rapatkan seksi pricing” hanya berfungsi jika artefak membawa identitas seksi yang stabil di seluruh revisi. Tanpa itu, setiap instruksi merosot menjadi penunjukan: desainer mendeskripsikan sebuah area dengan posisinya (“blok kedua dari atas”), agent menebak dari output yang ter-render, dan regenerasi berikutnya diam-diam menomori ulang segalanya. Kanvas dulu menyerap biaya ini secara senyap. Ia menamai bagian-bagian untuk Anda, menjaga nama-nama itu stabil saat Anda bekerja, dan membiarkan Anda memilih satu tanpa mendeskripsikannya.</p>
      <h3>Kejelasan itu layak dipertahankan bahkan jika unitnya keliru</h3>
      <p>Ini adalah bagian dari argumen #DeFigma yang membutuhkan kehati-hatian. Kanvas mungkin adalah unit kerja yang keliru untuk sistem agent-native — ia mengasumsikan manusia yang menyeret persegi panjang, bukan agent yang menulis file — tetapi kejelasan yang orang dapatkan dari kanvas tetap berharga. Kesalahannya adalah memperlakukan “buang kanvas” dan “buang pemahaman yang disediakan kanvas” sebagai keputusan yang sama. Keduanya tidak sama. Open Design harus memindahkan kejelasan itu ke dalam model artefak, bukan membuangnya. Lapisan tata letak adalah nama untuk pemindahan itu.</p>
      <h2>Open Design sudah memiliki primitif yang tepat</h2>
      <p>Alasan usulan ini cocok dengan Open Design adalah karena proyek ini sudah dibangun di sekitar kontrak yang eksplisit. Sebuah skill adalah file <code>SKILL.md</code>. Sebuah sistem desain adalah file <code>DESIGN.md</code>. Sebuah plugin menambahkan sidecar <code>open-design.json</code>. Tidak ada apa pun dalam sistem yang berupa blob biner yang harus Anda balik-rekayasa; kontraknya adalah teks, dan teks adalah sesuatu yang dapat dibaca oleh agent dan manusia. Mekanismenya dibahas dalam <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistem: cara kerja pustaka Open Design</a>, dan argumen produknya ada di <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a>.</p>
      <p>Lapisan tata letak seharusnya mengikuti pola yang sama. Ia seharusnya berupa teks yang dapat dibaca agent, state yang dapat di-render UI, dan metadata yang dapat digunakan ulang agent lain. Jika ia tidak dapat memenuhi ketiganya sekaligus, ia memiliki bentuk yang keliru.</p>
      <p>Dalam istilah repo, itu menunjuk pada tiga permukaan:</p>





















      <table><thead><tr><th>Permukaan</th><th>Apa yang seharusnya dibawanya</th></tr></thead><tbody><tr><td>Manifest artefak</td><td>ID yang stabil untuk seksi, komponen, aset, dan file yang dihasilkan</td></tr><tr><td>Snapshot plugin</td><td>Skill, sistem desain, input, dan tahap pipeline mana yang menghasilkan artefak</td></tr><tr><td>UI tinjauan / output headless</td><td>Peta tata letak, aspek yang dapat diedit, dan saran niat pengeditan</td></tr></tbody></table>
      <p>Batasan penting: lapisan ini tidak boleh menjadi kanvas proprietary kedua. Mode kegagalan yang harus dihindari adalah membangun ulang scene graph Figma dengan nama baru — struktur yang kaya dan spesifik-aplikasi yang hanya dapat di-render oleh UI Open Design dan yang mati begitu Anda meninggalkan aplikasi. Lapisan tata letak sebaliknya seharusnya berupa peta artefak biasa yang ikut bersama file, sehingga seorang kontributor dapat membacanya di editor teks dan agent yang berbeda dapat mengonsumsinya tanpa SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Kerangka tata letak wireframe yang terangkat menjadi lapisannya sendiri yang dapat dipilih di atas kanvas kosong, dalam bingkai hijau di atas latar editorial nyaris putih">
        <figcaption>Lapisan tata letak adalah struktur yang dibiarkan implisit oleh kanvas — ditarik keluar ke tempat agent dan manusia sama-sama dapat membacanya.</figcaption>
      </figure>
      <h2>Bentuk praktis untuk lapisan tata letak</h2>
      <p>Berikut versi terkecil yang akan membuat desain agent-native terasa kurang buram:</p>
      <ol>
      <li>Setiap artefak yang dihasilkan mendapat ID semantik yang stabil: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Setiap ID membawa satu kalimat niat: “Jelaskan janji produk dalam satu layar,” bukan “seksi atas.”</li>
      <li>Setiap seksi mendaftarkan aspek yang dapat diedit: teks, kepadatan, tata letak, warna, media, gerak, sumber data.</li>
      <li>Setiap file yang dihasilkan tertaut kembali ke ID seksi yang menghasilkannya.</li>
      <li>Setiap lintasan tinjauan memancarkan saran niat pengeditan: “perpendek judul hero,” “tingkatkan kontras pada kartu pricing,” “pisahkan blok testimoni.”</li>
      <li>UI me-render ini sebagai navigator, sementara pengguna headless menerima struktur yang sama sebagai JSON atau Markdown.</li>
      </ol>
      <h3>Seperti apa sebuah manifest sebenarnya</h3>
      <p>Inti dari menuliskannya adalah bahwa strukturnya biasa saja — yang justru sebabnya ia bisa menjadi kontrak publik alih-alih trik pribadi. Sebuah manifest untuk landing page yang dihasilkan mungkin terbaca seperti ini:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Tidak satu pun dari kunci-kunci itu eksotis. <code>sections</code> adalah sebuah daftar, <code>editable</code> adalah sebuah enum, <code>files</code> adalah sebuah referensi balik. Nilainya bukan pada kecerdasan skema — melainkan pada fakta bahwa ID-nya bertahan melewati sebuah regenerasi, sehingga blok <code>pricing</code> yang sama tetap <code>pricing</code> setelah agent menulisnya ulang dua kali.</p>
      <p>Itu cukup untuk membiarkan seorang desainer berkata, “Ubah <code>pricing</code> dari tiga paket menjadi dua,” dan cukup untuk membiarkan agent kode menambal file yang tepat tanpa menebak dari piksel. Instruksinya terurai ke sebuah ID seksi, ID seksi terurai ke sekumpulan file, dan pengeditan mendarat di tempat yang dimaksudkan.</p>
      <h3>Mengapa ini adalah jalur kontribusi, bukan permintaan fitur</h3>
      <p>Ia juga memberi komunitas jalur kontribusi yang bersih. Seorang kontributor tidak perlu mendesain ulang produk untuk membantu di sini. Mereka dapat menulis sebuah skill yang memancarkan manifest untuk satu jenis artefak, sebuah atom tinjauan yang mengusulkan niat pengeditan, sebuah ekstensi manifest yang menambahkan kolom yang dapat dibaca skill lain, atau sebuah kasus uji yang menegaskan ID seksi tetap stabil melewati sebuah regenerasi. Masing-masing adalah perubahan kecil yang dapat di-merge yang membuat satu output kurang buram — dan karena lapisannya berupa teks biasa, dua kontributor yang mengerjakan sebuah deck dan sebuah layar mobile tidak harus mengoordinasikan format biner bersama. Lapisan tata letak menjadi kontrak publik, bukan kapabilitas pribadi yang terkubur di dalam aplikasi.</p>
      <h2>Apa yang harus dilakukan selanjutnya</h2>
      <p>Jika ini adalah jenis masalah yang ingin Anda kerjakan, kontribusikan sebuah skill atau plugin kecil yang membuat satu artefak lebih mudah diperiksa. Mulailah dengan output yang konkret: sebuah landing page, sebuah deck, atau sebuah layar mobile. Tambahkan ID seksi yang stabil, deskripsikan aspek yang dapat diedit, pancarkan sebagai JSON atau Markdown bersama artefak, dan buka PR dengan artefak sebelum/sesudah sehingga peninjau dapat melihat perbedaan yang dibuat oleh lapisan yang dapat diperiksa.</p>
      <p>Ini masih sebuah arah, bukan fitur yang sudah dikirim — nilai dari menamainya sekarang adalah bahwa primitif-primitifnya sudah ada, jadi pekerjaannya bersifat aditif alih-alih penulisan ulang.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Kontribusikan sebuah skill</a>.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistem: cara kerja pustaka Open Design</a> — primitif yang digerakkan-file saat ini di bawah usulan</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> — bentuk produk yang membuat kontrak artefak publik menjadi mungkin</li>
      <li><a href="/blog/figma-alternative-open-design/">Alternatif sumber terbuka untuk Figma</a> — ke mana “buang kanvas” mendarat melawan pemain lama yang menjadikan kanvas sentral</li>
      </ul>
  nl:
    title: "De lay-outlaag die het canvas vroeger verborg"
    summary: "Een reactie uit de community op de 0.8.0-preview benoemde de echte vraag achter agent-native ontwerpen: als het canvas niet langer de werkeenheid is, hoe begrijpen gebruikers de lay-out dan nog?"
    bodyHtml: |
      <p>Een nuttige reactie uit de community vraagt niet om een grotere knop. Het benoemt de ontbrekende laag.</p>
      <p>Dat is wat er gebeurde onder de <a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview-discussie</a>. De launch-thread pleitte voor twee verschuivingen: stop met het canvas als de primaire werkeenheid te behandelen, en maak de agent de eersteklas ontwerper. Eén reactie was het eens met de richting en wees toen op het lastige deel: wanneer het canvas verdwijnt, hebben gebruikers nog steeds een manier nodig om te begrijpen wat de agent heeft gemaakt voordat ze het met vertrouwen kunnen bewerken.</p>
      <p>De uitdrukking in de reactie was “Layout Understanding Layer.” Het is een goede naam omdat hij het luie antwoord weigert. Agent-native ontwerpen kan niet betekenen “vertrouw op de screenshot.” Het heeft een leesbaar model van het artefact nodig: secties, intentie, bewerkbare delen, stabiele referenties en voorgestelde bewerkingsacties. Dit bericht is een poging om die reactie serieus te nemen — om te schetsen wat zo'n laag zou kunnen dragen, waar het in Open Design zou moeten leven, en waarom het een bijdragepad is in plaats van een roadmap-belofte.</p>
      <h2>Het canvas gaf ontwerpers ruimtelijk vertrouwen</h2>
      <p>Het canvas van Figma is niet alleen een tekenoppervlak. Het is ook een verklaringsoppervlak. Je kunt uitzoomen, de paginahiërarchie zien, op een frame klikken, beperkingen inspecteren, lagen hernoemen, en begrijpen waar het ene stuk werk eindigt en het andere begint.</p>
      <h3>Wat je daadwerkelijk verliest wanneer het canvas verdwijnt</h3>
      <p>Dat begrip is gemakkelijk te onderschatten totdat het weg is. Een gegenereerde landingspagina kan er correct uitzien in een sandboxed voorbeeld en toch moeilijk aan te sturen zijn. Het probleem zijn niet de pixels — het is de afwezigheid van een gedeeld vocabulaire tussen de mens en de agent.</p>
      <p>“Maak de hero zelfverzekerder” is alleen nuttig als de agent en de mens het eens zijn over wat de hero is. “Maak de prijssectie strakker” werkt alleen als het artefact een stabiele sectie-identiteit draagt over revisies heen. Zonder dat verwordt elke instructie tot wijzen: de ontwerper beschrijft een regio op basis van zijn positie (“het tweede blok van boven”), de agent gist op basis van de gerenderde output, en de volgende regeneratie hernummert stilletjes alles. Het canvas absorbeerde deze kosten vroeger stilletjes. Het benoemde de delen voor je, hield die namen stabiel terwijl je werkte, en liet je er één selecteren zonder hem te beschrijven.</p>
      <h3>De duidelijkheid is het behouden waard, zelfs als de eenheid verkeerd is</h3>
      <p>Dit is het deel van het #DeFigma-argument dat zorg vereist. Het canvas is misschien de verkeerde werkeenheid voor een agent-native systeem — het gaat uit van een mens die rechthoeken sleept, niet van een agent die bestanden schrijft — maar de duidelijkheid die mensen uit het canvas haalden, is nog steeds waardevol. De fout zou zijn om “laat het canvas vallen” en “laat het begrip vallen dat het canvas bood” als dezelfde beslissing te behandelen. Dat zijn ze niet. Open Design moet die duidelijkheid in het artefactmodel verplaatsen, niet weggooien. De lay-outlaag is de naam voor die verplaatsing.</p>
      <h2>Open Design heeft al de juiste primitieven</h2>
      <p>De reden dat dit voorstel bij Open Design past, is dat het project al is opgebouwd rond expliciete contracten. Een skill is een <code>SKILL.md</code>-bestand. Een designsysteem is een <code>DESIGN.md</code>-bestand. Een plugin voegt een <code>open-design.json</code>-sidecar toe. Niets in het systeem is een binaire blob die je moet reverse-engineeren; de contracten zijn tekst, en tekst is iets dat zowel een agent als een mens kan lezen. De mechaniek wordt behandeld in <a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systemen: hoe de Open Design-bibliotheek werkt</a>, en het productargument staat in <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a>.</p>
      <p>De lay-outlaag zou hetzelfde patroon moeten volgen. Het zou tekst moeten zijn die de agent kan lezen, staat die de UI kan renderen, en metadata die een andere agent kan hergebruiken. Als het niet alle drie tegelijk kan bevredigen, heeft het de verkeerde vorm.</p>
      <p>In repo-termen wijst dat op drie oppervlakken:</p>


















      <table><thead><tr><th>Oppervlak</th><th>Wat het zou moeten dragen</th></tr></thead><tbody><tr><td>Artefactmanifest</td><td>Stabiele ID's voor secties, componenten, middelen en gegenereerde bestanden</td></tr><tr><td>Plugin-snapshot</td><td>Welke skill, designsysteem, invoer en pipeline-fasen het artefact produceerden</td></tr><tr><td>Review-UI / headless output</td><td>Een lay-outkaart, bewerkbare aspecten en voorgestelde bewerkingsintenties</td></tr></tbody></table>
      <p>De belangrijke beperking: de laag zou geen tweede propriëtair canvas moeten worden. De faalmodus die je moet vermijden is het herbouwen van de scene graph van Figma onder een nieuwe naam — een rijke, app-specifieke structuur die alleen de Open Design-UI kan renderen en die sterft op het moment dat je de app verlaat. De lay-outlaag zou in plaats daarvan een gewone artefactkaart moeten zijn die met de bestanden meereist, zodat een bijdrager hem in een teksteditor kan lezen en een andere agent hem kan consumeren zonder een SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Een wireframe-lay-outskelet dat zich als zijn eigen selecteerbare laag boven een leeg canvas uittilt, in een groen kader op een bijna-witte redactionele achtergrond">
        <figcaption>De lay-outlaag is de structuur die het canvas impliciet hield — eruit getrokken waar een agent en een mens beide kunnen lezen.</figcaption>
      </figure>
      <h2>Een praktische vorm voor de lay-outlaag</h2>
      <p>Hier is de kleinste versie die agent-native ontwerpen minder ondoorzichtig zou laten aanvoelen:</p>
      <ol>
      <li>Elk gegenereerd artefact krijgt stabiele semantische ID's: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Elk ID draagt een intentiezin: “Leg de productbelofte uit op één scherm,” niet “bovenste sectie.”</li>
      <li>Elke sectie somt bewerkbare aspecten op: tekst, dichtheid, lay-out, kleur, media, beweging, gegevensbron.</li>
      <li>Elk gegenereerd bestand linkt terug naar het sectie-ID dat het produceerde.</li>
      <li>Elke reviewpass zendt voorgestelde bewerkingsintenties uit: “verkort hero-kop,” “verhoog contrast in prijskaarten,” “splits testimonial-blok.”</li>
      <li>De UI rendert dit als een navigator, terwijl headless-gebruikers dezelfde structuur ontvangen als JSON of Markdown.</li>
      </ol>
      <h3>Hoe een manifest er daadwerkelijk uit zou kunnen zien</h3>
      <p>Het punt van het opschrijven is dat de structuur onopvallend is — wat precies de reden is dat het een publiek contract kan zijn in plaats van een privétruc. Een manifest voor een gegenereerde landingspagina zou er zo uit kunnen zien:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Geen van die sleutels is exotisch. <code>sections</code> is een lijst, <code>editable</code> is een enum, <code>files</code> is een terugverwijzing. De waarde zit niet in de slimheid van het schema — het zit in het feit dat de ID's een regeneratie overleven, zodat hetzelfde <code>pricing</code>-blok nog steeds <code>pricing</code> is nadat de agent het twee keer heeft herschreven.</p>
      <p>Dat is genoeg om een ontwerper te laten zeggen: “Wijzig <code>pricing</code> van drie plannen naar twee,” en genoeg om een code-agent het juiste bestand te laten patchen zonder vanuit pixels te gissen. De instructie lost op naar een sectie-ID, het sectie-ID lost op naar een set bestanden, en de bewerking belandt waar hij bedoeld was.</p>
      <h3>Waarom dit een bijdragepad is, geen feature request</h3>
      <p>Het geeft de community ook een schoon bijdragepad. Een bijdrager hoeft het product niet opnieuw te ontwerpen om hier te helpen. Ze kunnen een skill schrijven die een manifest uitzendt voor één artefacttype, een review-atoom dat bewerkingsintenties voorstelt, een manifest-uitbreiding die een veld toevoegt dat andere skills kunnen lezen, of een testcase die bevestigt dat sectie-ID's stabiel blijven over een regeneratie heen. Elk daarvan is een kleine, mergebare wijziging die één output minder ondoorzichtig maakt — en omdat de laag platte tekst is, hoeven twee bijdragers die aan een deck en een mobiel scherm werken geen gedeeld binair formaat te coördineren. De lay-outlaag wordt een publiek contract, geen privécapaciteit begraven in de app.</p>
      <h2>Wat je hierna moet doen</h2>
      <p>Als dit het soort probleem is waar je aan wilt werken, draag dan een kleine skill of plugin bij die één artefact gemakkelijker te inspecteren maakt. Begin met een concrete output: een landingspagina, een deck of een mobiel scherm. Voeg stabiele sectie-ID's toe, beschrijf de bewerkbare aspecten, zend ze uit als JSON of Markdown naast het artefact, en open de PR met een voor/na-artefact zodat een reviewer het verschil kan zien dat een inspecteerbare laag maakt.</p>
      <p>Dit is nog steeds een richting, geen geleverde functie — de waarde van het nu benoemen ervan is dat de primitieven al bestaan, dus het werk is additief in plaats van een herschrijving.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Draag een skill bij</a>.</p>
      <h2>Gerelateerde lectuur</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systemen: hoe de Open Design-bibliotheek werkt</a> — de huidige bestandsgedreven primitieven onder het voorstel</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — de productvorm die publieke artefactcontracten mogelijk maakt</li>
      <li><a href="/blog/figma-alternative-open-design/">Het open-source alternatief voor Figma</a> — waar “laat het canvas vallen” belandt tegenover de gevestigde speler die het canvas centraal maakte</li>
      </ul>
  ar:
    title: "طبقة التخطيط التي اعتاد الكانفاس إخفاءها"
    summary: "ردّ مجتمعي على معاينة 0.8.0 سمّى السؤال الحقيقي وراء التصميم المتمحور حول العميل: إذا توقّف الكانفاس عن كونه وحدة العمل، فكيف يظلّ المستخدمون يفهمون التخطيط؟"
    bodyHtml: |
      <p>الردّ المجتمعي المفيد لا يطلب زرًّا أكبر. بل يُسمّي الطبقة المفقودة.</p>
      <p>هذا ما حدث ضمن <a href="https://github.com/nexu-io/open-design/discussions/1727">نقاش Open Design 0.8.0-preview</a>. سلسلة الإطلاق دافعت عن تحوّلين: التوقّف عن معاملة الكانفاس كوحدة العمل الأساسية، وجعل العميل عامل التصميم من الدرجة الأولى. أحد الردود وافق على الاتجاه، ثم أشار إلى الجزء الصعب: عندما يختفي الكانفاس، لا يزال المستخدمون بحاجة إلى طريقة لفهم ما صنعه العميل قبل أن يتمكّنوا من تحريره بثقة.</p>
      <p>العبارة في الردّ كانت «طبقة فهم التخطيط» (Layout Understanding Layer). إنه اسم جيد لأنه يرفض الجواب الكسول. التصميم المتمحور حول العميل لا يمكن أن يعني «ثق بلقطة الشاشة». إنه يحتاج إلى نموذج قابل للقراءة للمُخرَج: الأقسام، والنيّة، والأجزاء القابلة للتحرير، والمراجع المستقرّة، وحركات التحرير المُقترحة. هذه المقالة محاولة لأخذ ذلك الردّ على محمل الجدّ — لرسم ما يمكن لطبقة كهذه أن تحمله، وأين ينبغي أن تقيم في Open Design، ولماذا هي مسار مساهمة لا وعد خارطة طريق.</p>
      <h2>الكانفاس منح المصمّمين ثقة مكانية</h2>
      <p>كانفاس Figma ليس سطح رسم فحسب. إنه أيضًا سطح تفسير. يمكنك التصغير، ورؤية تسلسل الصفحة الهرمي، والنقر على إطار، وفحص القيود، وإعادة تسمية الطبقات، وفهم أين تنتهي قطعة من العمل وتبدأ أخرى.</p>
      <h3>ما الذي تفقده فعلًا عندما يختفي الكانفاس</h3>
      <p>من السهل التقليل من شأن ذلك الفهم حتى يزول. صفحة هبوط مُولّدة قد تبدو صحيحة في معاينة معزولة وتظلّ صعبة التوجيه. المشكلة ليست في البكسلات — بل في غياب مفردات مشتركة بين الإنسان والعميل.</p>
      <p>عبارة «اجعل الـ hero أكثر ثقة» مفيدة فقط إن اتّفق العميل والإنسان على ما هو الـ hero. وعبارة «أحكِم قسم التسعير» تعمل فقط إن كان المُخرَج يحمل هوية قسم مستقرّة عبر المراجعات. بدون ذلك، تتدهور كل تعليمة إلى إشارة: المصمّم يصف منطقة بموقعها («الكتلة الثانية من الأعلى»)، والعميل يُخمّن من المُخرَج المعروض، والتوليد التالي يُعيد ترقيم كل شيء بهدوء. اعتاد الكانفاس امتصاص هذه التكلفة بصمت. فقد سمّى لك الأجزاء، وأبقى تلك الأسماء مستقرّة أثناء عملك، وأتاح لك انتقاء واحد دون وصفه.</p>
      <h3>الوضوح يستحقّ الحفاظ عليه حتى لو كانت الوحدة خاطئة</h3>
      <p>هذا هو الجزء من حجّة #DeFigma الذي يحتاج إلى عناية. قد يكون الكانفاس الوحدة الخاطئة للعمل في نظام متمحور حول العميل — فهو يفترض إنسانًا يسحب المستطيلات، لا عميلًا يكتب الملفات — لكن الوضوح الذي حصل عليه الناس من الكانفاس لا يزال قيّمًا. الخطأ سيكون في معاملة «إسقاط الكانفاس» و«إسقاط الفهم الذي وفّره الكانفاس» كقرار واحد. وهما ليسا كذلك. على Open Design أن ينقل ذلك الوضوح إلى نموذج المُخرَج، لا أن يرميه. طبقة التخطيط هي الاسم لذلك النقل.</p>
      <h2>Open Design لديه بالفعل العناصر الأساسية الصحيحة</h2>
      <p>السبب في ملاءمة هذا الاقتراح لـ Open Design هو أن المشروع مبنيّ أصلًا حول عقود صريحة. المهارة هي ملف <code>SKILL.md</code>. ونظام التصميم هو ملف <code>DESIGN.md</code>. والإضافة تُضيف ملفًا مُرافقًا <code>open-design.json</code>. لا شيء في النظام كتلة ثنائية عليك تفكيكها عكسيًّا؛ فالعقود نصّ، والنصّ شيء يستطيع كلٌّ من العميل والإنسان قراءته. الآليات مشروحة في <a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة، 72 نظامًا: كيف تعمل مكتبة Open Design</a>، وحجّة المنتج في <a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a>.</p>
      <p>ينبغي لطبقة التخطيط أن تتبع النمط نفسه. ينبغي أن تكون نصًّا يستطيع العميل قراءته، وحالةً تستطيع الواجهة عرضها، وبياناتٍ وصفية يستطيع عميل آخر إعادة استخدامها. وإن لم تستطع تلبية الثلاثة دفعةً واحدة، فهي الشكل الخاطئ.</p>
      <p>بلغة المستودع، يشير ذلك إلى ثلاثة أسطح:</p>
      <table><thead><tr><th>السطح</th><th>ما ينبغي أن يحمله</th></tr></thead><tbody><tr><td>بيان المُخرَج (manifest)</td><td>مُعرّفات مستقرّة للأقسام، والمكوّنات، والأصول، والملفات المُولّدة</td></tr><tr><td>لقطة الإضافة</td><td>أي مهارة، ونظام تصميم، ومدخلات، ومراحل خطّ إنتاج أنتجت المُخرَج</td></tr><tr><td>واجهة المراجعة / المُخرَج بلا واجهة (headless)</td><td>خريطة تخطيط، وجوانب قابلة للتحرير، ونوايا تحرير مُقترحة</td></tr></tbody></table>
      <p>القيد المهمّ: ينبغي ألّا تصبح الطبقة كانفاسًا مملوكًا ثانيًا. نمط الفشل الذي يجب تجنّبه هو إعادة بناء مخطّط مشهد Figma باسم جديد — بنية غنيّة خاصة بالتطبيق لا تستطيع سوى واجهة Open Design عرضها وتموت لحظة مغادرتك للتطبيق. ينبغي لطبقة التخطيط أن تكون عوضًا عن ذلك خريطة مُخرَج صِرفة تُسافر مع الملفات، بحيث يستطيع مساهم قراءتها في محرّر نصوص ويستطيع عميل مختلف استهلاكها دون SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="هيكل تخطيط شبكي (wireframe) يرتفع كطبقة قابلة للانتقاء خاصة به فوق كانفاس فارغ، في إطار أخضر على أرضية تحريرية شبه بيضاء">
        <figcaption>طبقة التخطيط هي البنية التي أبقاها الكانفاس ضمنية — مُنتزَعةً إلى حيث يستطيع كلٌّ من العميل والإنسان قراءتها.</figcaption>
      </figure>
      <h2>شكل عملي لطبقة التخطيط</h2>
      <p>إليك أصغر نسخة من شأنها أن تجعل التصميم المتمحور حول العميل يبدو أقلّ غموضًا:</p>
      <ol>
      <li>يحصل كل مُخرَج مُولّد على مُعرّفات دلالية مستقرّة: <code>hero</code>، <code>proof-strip</code>، <code>pricing</code>، <code>faq</code>، <code>final-cta</code>.</li>
      <li>يحمل كل مُعرّف جملة نيّة: «اشرح وعد المنتج في شاشة واحدة»، لا «القسم العلوي».</li>
      <li>يُدرج كل قسم جوانبه القابلة للتحرير: النصّ، والكثافة، والتخطيط، واللون، والوسائط، والحركة، ومصدر البيانات.</li>
      <li>يربط كل ملف مُولّد رجوعًا بمُعرّف القسم الذي أنتجه.</li>
      <li>تُصدر كل تمريرة مراجعة نوايا تحرير مُقترحة: «اختصر عنوان الـ hero»، «زِد التباين في بطاقات التسعير»، «قسّم كتلة الشهادة».</li>
      <li>تعرض الواجهة هذا كمُتصفّح، بينما يتلقّى مستخدمو الوضع بلا واجهة البنية نفسها بصيغة JSON أو Markdown.</li>
      </ol>
      <h3>كيف يمكن أن يبدو البيان (manifest) فعلًا</h3>
      <p>الغرض من كتابته هو أن البنية غير مُلفتة — وهو بالضبط سبب قدرتها على أن تكون عقدًا عامًّا بدلًا من حيلة خاصة. قد يبدو بيان لصفحة هبوط مُولّدة هكذا:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>لا شيء من تلك المفاتيح غريب. <code>sections</code> قائمة، و<code>editable</code> تعداد (enum)، و<code>files</code> إشارة رجوع. القيمة ليست في ذكاء المخطّط (schema) — بل في حقيقة أن المُعرّفات تنجو من إعادة توليد، بحيث تظلّ كتلة <code>pricing</code> نفسها <code>pricing</code> بعد أن يُعيد العميل كتابتها مرتين.</p>
      <p>هذا يكفي لأن يقول مصمّم: «غيّر <code>pricing</code> من ثلاث خطط إلى اثنتين»، ويكفي لأن يُرقّع عميل شيفرة الملف الصحيح دون تخمين من البكسلات. التعليمة تُحلّ إلى مُعرّف قسم، ومُعرّف القسم يُحلّ إلى مجموعة ملفات، ويصل التحرير حيث قُصد له.</p>
      <h3>لماذا هذا مسار مساهمة، لا طلب ميزة</h3>
      <p>كما أنه يمنح المجتمع مسار مساهمة نظيفًا. لا يحتاج المساهم إلى إعادة تصميم المنتج للمساعدة هنا. بإمكانه كتابة مهارة تُصدر بيانًا لنوع مُخرَج واحد، أو ذرّة مراجعة تقترح نوايا تحرير، أو امتداد بيان يُضيف حقلًا تستطيع مهارات أخرى قراءته، أو حالة اختبار تؤكّد أن مُعرّفات الأقسام تبقى مستقرّة عبر إعادة توليد. كلٌّ من هذه تغيير صغير قابل للدمج يجعل مُخرَجًا واحدًا أقلّ غموضًا — ولأن الطبقة نصّ صِرف، فإن مساهمَين يعملان على عرض وشاشة هاتف محمول ليسا مضطرّين لتنسيق صيغة ثنائية مشتركة. تصبح طبقة التخطيط عقدًا عامًّا، لا قدرة خاصة مدفونة داخل التطبيق.</p>
      <h2>ما الذي تفعله بعد ذلك</h2>
      <p>إن كان هذا نوع المشكلة التي تريد العمل عليها، فساهم بمهارة أو إضافة صغيرة تجعل مُخرَجًا واحدًا أسهل فحصًا. ابدأ بمُخرَج ملموس: صفحة هبوط، أو عرض، أو شاشة هاتف محمول. أضف مُعرّفات أقسام مستقرّة، وصِف الجوانب القابلة للتحرير، وأصدرها بصيغة JSON أو Markdown إلى جانب المُخرَج، وافتح PR بمُخرَج قبل/بعد كي يرى المُراجع الفرق الذي تُحدثه طبقة قابلة للفحص.</p>
      <p>هذا لا يزال اتجاهًا، لا ميزة مشحونة — وقيمة تسميته الآن هي أن العناصر الأساسية موجودة بالفعل، فيكون العمل إضافيًّا لا إعادة كتابة.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">ساهم بمهارة</a>.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة، 72 نظامًا: كيف تعمل مكتبة Open Design</a> — العناصر الأساسية الحالية المُحرَّكة بالملفات أسفل الاقتراح</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> — شكل المنتج الذي يجعل عقود المُخرَجات العامة ممكنة</li>
      <li><a href="/blog/figma-alternative-open-design/">البديل مفتوح المصدر لـ Figma</a> — أين يستقرّ «إسقاط الكانفاس» في مواجهة المُهيمن الذي جعل الكانفاس مركزيًّا</li>
      </ul>
  tr:
    title: "Tuvalin gizlemeye alışık olduğu yerleşim katmanı"
    summary: "0.8.0 önizlemesindeki bir topluluk yanıtı, ajan-yerel tasarımın arkasındaki asıl soruyu adlandırdı: tuval iş birimi olmaktan çıkarsa, kullanıcılar yerleşimi nasıl hâlâ anlayacak?"
    bodyHtml: |
      <p>Faydalı bir topluluk yanıtı, daha büyük bir buton istemez. Eksik katmanı adlandırır.</p>
      <p><a href="https://github.com/nexu-io/open-design/discussions/1727">Open Design 0.8.0-preview tartışmasının</a> altında olan tam da budur. Lansman başlığı iki kaymayı savundu: tuvali birincil iş birimi olarak görmeyi bırakmak ve ajanı birinci sınıf tasarım çalışanı yapmak. Bir yanıt yöne katıldı, sonra zor kısmı işaret etti: tuval kaybolduğunda, kullanıcılar onu güvenle düzenleyebilmeden önce ajanın ne yaptığını anlamak için hâlâ bir yola ihtiyaç duyar.</p>
      <p>Yanıttaki ifade "Yerleşim Anlama Katmanı" idi. İyi bir isim, çünkü tembel cevabı reddediyor. Ajan-yerel tasarım, "ekran görüntüsüne güven" anlamına gelemez. Eserin okunabilir bir modeline ihtiyacı vardır: bölümler, niyet, düzenlenebilir parçalar, kararlı referanslar ve önerilen düzenleme hamleleri. Bu yazı, o yanıtı ciddiye alma denemesidir — böyle bir katmanın neyi taşıyabileceğini, Open Design'da nerede yaşaması gerektiğini ve neden bir yol haritası vaadi değil de bir katkı yolu olduğunu çizmek için.</p>
      <h2>Tuval, tasarımcılara mekânsal güven verdi</h2>
      <p>Figma'nın tuvali yalnızca bir çizim yüzeyi değildir. Aynı zamanda bir açıklama yüzeyidir. Uzaklaştırabilir, sayfa hiyerarşisini görebilir, bir çerçeveye tıklayabilir, kısıtlamaları inceleyebilir, katmanları yeniden adlandırabilir ve işin bir parçasının nerede bitip diğerinin nerede başladığını anlayabilirsiniz.</p>
      <h3>Tuval ortadan kalktığında gerçekte ne kaybedersiniz</h3>
      <p>O anlayışı, kaybolana kadar küçümsemek kolaydır. Üretilen bir açılış sayfası, korumalı bir önizlemede doğru görünebilir ama yine de yönlendirmesi zor olabilir. Sorun pikseller değil — insan ile ajan arasında ortak bir kelime dağarcığının yokluğudur.</p>
      <p>"Hero'yu daha kendinden emin yap" yalnızca ajan ile insan hero'nun ne olduğu konusunda hemfikirse faydalıdır. "Fiyatlandırma bölümünü sıkılaştır" yalnızca eser revizyonlar arasında kararlı bir bölüm kimliği taşıyorsa işe yarar. Bu olmadan, her talimat işaret etmeye dönüşür: tasarımcı bir bölgeyi konumuyla tanımlar ("üstten ikinci blok"), ajan işlenen çıktıdan tahmin eder ve sonraki yeniden üretim her şeyi sessizce yeniden numaralandırır. Tuval bu maliyeti sessizce soğurmaya alışıktı. Parçaları sizin için adlandırdı, siz çalışırken o adları kararlı tuttu ve onu tanımlamadan birini seçmenize izin verdi.</p>
      <h3>Birim yanlış olsa bile bu netlik korumaya değer</h3>
      <p>Bu, #DeFigma argümanının dikkat gerektiren kısmı. Tuval, ajan-yerel bir sistem için yanlış iş birimi olabilir — dosya yazan bir ajanı değil, dikdörtgenleri sürükleyen bir insanı varsayar — ama insanların tuvalden aldığı netlik hâlâ değerlidir. Hata, "tuvali bırak" ile "tuvalin sağladığı anlayışı bırak"ı aynı karar olarak görmek olurdu. Değiller. Open Design, o netliği atmak yerine esir modeline taşımak zorundadır. Yerleşim katmanı, o taşımanın adıdır.</p>
      <h2>Open Design'da zaten doğru ilkel öğeler var</h2>
      <p>Bu önerinin Open Design'a uymasının nedeni, projenin zaten açık sözleşmeler etrafında kurulmuş olmasıdır. Bir beceri, bir <code>SKILL.md</code> dosyasıdır. Bir tasarım sistemi, bir <code>DESIGN.md</code> dosyasıdır. Bir eklenti, bir <code>open-design.json</code> yan dosyası ekler. Sistemde tersine mühendislik yapmanız gereken hiçbir ikili blob yoktur; sözleşmeler metindir ve metin, hem bir ajanın hem de bir insanın okuyabileceği bir şeydir. Mekanikler <a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır</a> yazısında ele alınır ve ürün argümanı <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> yazısındadır.</p>
      <p>Yerleşim katmanı aynı örüntüyü izlemelidir. Ajanın okuyabileceği metin, arayüzün işleyebileceği durum ve başka bir ajanın yeniden kullanabileceği meta veri olmalıdır. Üçünü birden aynı anda karşılayamıyorsa, yanlış biçimdir.</p>
      <p>Depo açısından bu, üç yüzeyi işaret eder:</p>

















      <table><thead><tr><th>Yüzey</th><th>Neyi taşımalı</th></tr></thead><tbody><tr><td>Eser bildirimi</td><td>Bölümler, bileşenler, varlıklar ve üretilen dosyalar için kararlı kimlikler</td></tr><tr><td>Eklenti anlık görüntüsü</td><td>Eseri hangi beceri, tasarım sistemi, girdiler ve işlem hattı aşamalarının ürettiği</td></tr><tr><td>Gözden geçirme arayüzü / başsız çıktı</td><td>Bir yerleşim haritası, düzenlenebilir yönler ve önerilen düzenleme niyetleri</td></tr></tbody></table>
      <p>Önemli kısıtlama: katman ikinci bir tescilli tuvale dönüşmemelidir. Kaçınılacak başarısızlık modu, Figma'nın sahne grafiğini yeni bir adla yeniden inşa etmektir — yalnızca Open Design arayüzünün işleyebileceği ve uygulamadan çıktığınız anda ölen, zengin, uygulamaya özgü bir yapı. Yerleşim katmanı bunun yerine, dosyalarla birlikte seyahat eden düz bir eser haritası olmalıdır, böylece bir katkıda bulunan onu bir metin düzenleyicide okuyabilir ve farklı bir ajan onu bir SDK olmadan tüketebilir.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, boş bir tuvalin üzerinde kendi seçilebilir katmanı olarak yükselen, yeşil bir çerçevedeki bir wireframe yerleşim iskeleti">
        <figcaption>Yerleşim katmanı, tuvalin örtük tuttuğu yapıdır — hem bir ajanın hem de bir insanın okuyabileceği yere çıkarılmış.</figcaption>
      </figure>
      <h2>Yerleşim katmanı için pratik bir biçim</h2>
      <p>İşte ajan-yerel tasarımı daha az opak hissettirecek en küçük versiyon:</p>
      <ol>
      <li>Üretilen her eser kararlı anlamsal kimlikler alır: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Her kimlik bir niyet cümlesi taşır: "Ürün vaadini tek bir ekranda açıkla", "üst bölüm" değil.</li>
      <li>Her bölüm düzenlenebilir yönleri listeler: metin, yoğunluk, yerleşim, renk, medya, hareket, veri kaynağı.</li>
      <li>Üretilen her dosya, onu üreten bölüm kimliğine geri bağlanır.</li>
      <li>Her gözden geçirme turu önerilen düzenleme niyetleri yayar: "hero başlığını kısalt", "fiyatlandırma kartlarında kontrastı artır", "referans bloğunu böl".</li>
      <li>Arayüz bunu bir gezgin olarak işler, başsız kullanıcılar ise aynı yapıyı JSON veya Markdown olarak alır.</li>
      </ol>
      <h3>Bir bildirimin gerçekte nasıl görünebileceği</h3>
      <p>Bunu yazıya dökmenin amacı, yapının sıradan olmasıdır — ki bu da tam olarak onun özel bir numara yerine herkese açık bir sözleşme olabilmesinin nedenidir. Üretilen bir açılış sayfası için bir bildirim şöyle okunabilir:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Bu anahtarların hiçbiri egzotik değil. <code>sections</code> bir liste, <code>editable</code> bir enum, <code>files</code> bir geri referans. Değer şemanın zekiliğinde değil — değer, kimliklerin bir yeniden üretimde hayatta kalmasında; böylece aynı <code>pricing</code> bloğu, ajan onu iki kez yeniden yazdıktan sonra hâlâ <code>pricing</code>'tir.</p>
      <p>Bu, bir tasarımcının "<code>pricing</code>'i üç plandan ikiye değiştir" demesine ve bir kod ajanının piksellerden tahmin etmeden doğru dosyaya yama yapmasına izin vermeye yeter. Talimat bir bölüm kimliğine çözümlenir, bölüm kimliği bir dizi dosyaya çözümlenir ve düzenleme amaçlanan yere düşer.</p>
      <h3>Bunun neden bir özellik isteği değil, bir katkı yolu olduğu</h3>
      <p>Ayrıca topluluğa temiz bir katkı yolu verir. Bir katkıda bulunanın burada yardımcı olmak için ürünü yeniden tasarlamasına gerek yoktur. Bir eser türü için bildirim yayan bir beceri, düzenleme niyetleri öneren bir gözden geçirme atomu, diğer becerilerin okuyabileceği bir alan ekleyen bir bildirim uzantısı veya bölüm kimliklerinin bir yeniden üretim boyunca kararlı kaldığını öne süren bir test durumu yazabilirler. Bunların her biri, bir çıktıyı daha az opak yapan küçük, birleştirilebilir bir değişikliktir — ve katman düz metin olduğu için, bir sunum ve bir mobil ekran üzerinde çalışan iki katkıda bulunanın paylaşılan bir ikili formatı koordine etmesine gerek yoktur. Yerleşim katmanı, uygulamanın içine gömülü özel bir yetenek değil, herkese açık bir sözleşme haline gelir.</p>
      <h2>Sırada ne yapılmalı</h2>
      <p>Üzerinde çalışmak istediğiniz türden bir problem buysa, bir eseri incelemeyi kolaylaştıran küçük bir beceri veya eklenti katkısında bulunun. Somut bir çıktıyla başlayın: bir açılış sayfası, bir sunum veya bir mobil ekran. Kararlı bölüm kimlikleri ekleyin, düzenlenebilir yönleri tanımlayın, bunları eserle birlikte JSON veya Markdown olarak yayın ve bir gözden geçirenin incelenebilir bir katmanın yarattığı farkı görebilmesi için öncesi/sonrası eseriyle PR'ı açın.</p>
      <p>Bu hâlâ bir yön, gönderilmiş bir özellik değil — şimdi adlandırmanın değeri, ilkel öğelerin zaten var olması, böylece işin bir yeniden yazım değil, ek niteliğinde olmasıdır.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Bir beceri katkısında bulunun</a>.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem: Open Design kütüphanesi nasıl çalışır</a> — önerinin altındaki mevcut dosya odaklı ilkel öğeler</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — herkese açık eser sözleşmelerini mümkün kılan ürün biçimi</li>
      <li><a href="/blog/figma-alternative-open-design/">Figma'ya açık kaynaklı alternatif</a> — "tuvali bırak"ın, tuvali merkezi yapan mevcut lidere göre nereye düştüğü</li>
      </ul>
  uk:
    title: "Рівень макета, який полотно колись приховувало"
    summary: "Відповідь спільноти на превʼю 0.8.0 назвала справжнє питання за агентно-орієнтованим дизайном: якщо полотно перестає бути одиницею роботи, як користувачам усе одно розуміти макет?"
    bodyHtml: |
      <p>Корисна відповідь спільноти не просить більшу кнопку. Вона називає відсутній рівень.</p>
      <p>Саме це й сталося в <a href="https://github.com/nexu-io/open-design/discussions/1727">обговоренні Open Design 0.8.0-preview</a>. Гілка запуску обстоювала два зрушення: припинити ставитися до полотна як до первинної одиниці роботи й зробити агента першокласним дизайнером. Одна відповідь погодилася з напрямом, а потім вказала на складну частину: коли полотно зникає, користувачам усе одно потрібен спосіб зрозуміти, що зробив агент, перш ніж вони зможуть упевнено це редагувати.</p>
      <p>Фраза у відповіді була «Рівень розуміння макета» (Layout Understanding Layer). Це гарна назва, бо вона відкидає ліниву відповідь. Агентно-орієнтований дизайн не може означати «довіряй скриншоту». Йому потрібна читабельна модель артефакту: секції, намір, редаговані частини, стабільні посилання та запропоновані дії редагування. Цей допис — спроба поставитися до тієї відповіді серйозно — окреслити, що такий рівень міг би нести, де йому слід жити в Open Design і чому це шлях для внеску, а не обіцянка дорожньої карти.</p>
      <h2>Полотно давало дизайнерам просторову впевненість</h2>
      <p>Полотно Figma — це не лише поверхня для малювання. Це також поверхня для пояснення. Ви можете віддалитися, побачити ієрархію сторінки, клікнути на фрейм, переглянути обмеження, перейменувати шари й зрозуміти, де закінчується один шматок роботи й починається інший.</p>
      <h3>Що ви насправді втрачаєте, коли полотно зникає</h3>
      <p>Це розуміння легко недооцінити, доки воно не зникне. Згенерований лендинг може виглядати коректним в ізольованому попередньому перегляді й усе одно бути важким для керування. Проблема не в пікселях — це відсутність спільного словника між людиною й агентом.</p>
      <p>«Зроби героя впевненішим» корисно лише тоді, коли агент і людина погоджуються щодо того, що таке герой. «Підтягни секцію цін» працює лише тоді, коли артефакт несе стабільну ідентичність секцій крізь ревізії. Без цього кожна інструкція деградує до вказування пальцем: дизайнер описує область за її позицією («другий блок згори»), агент здогадується з відрендереного результату, а наступна регенерація тихо перенумеровує все. Полотно колись поглинало цю вартість безшумно. Воно називало частини за вас, тримало ці назви стабільними, поки ви працювали, і дозволяло обрати одну, не описуючи її.</p>
      <h3>Цю ясність варто зберегти, навіть якщо одиниця неправильна</h3>
      <p>Це та частина аргументу #DeFigma, що потребує обережності. Полотно може бути неправильною одиницею роботи для агентно-орієнтованої системи — воно припускає людину, що перетягує прямокутники, а не агента, що пише файли — але ясність, яку люди отримували від полотна, усе ще цінна. Помилкою було б ставитися до «прибрати полотно» й «прибрати розуміння, що його давало полотно» як до одного й того самого рішення. Це не так. Open Design має перемістити цю ясність у модель артефакту, а не викинути її. Рівень макета — це назва для такого переміщення.</p>
      <h2>В Open Design уже є правильні примітиви</h2>
      <p>Причина, чому ця пропозиція пасує Open Design, у тому, що проєкт уже побудований навколо явних контрактів. Навичка — це файл <code>SKILL.md</code>. Дизайн-система — це файл <code>DESIGN.md</code>. Плагін додає супутній файл <code>open-design.json</code>. Ніщо в системі не є бінарним блобом, який треба реверс-інженерити; контракти — це текст, а текст — це те, що можуть прочитати і агент, і людина. Механіка розглянута в <a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи: як працює бібліотека Open Design</a>, а продуктовий аргумент — у <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a>.</p>
      <p>Рівень макета має йти за тим самим патерном. Це має бути текст, який агент може прочитати, стан, який UI може відрендерити, і метадані, які інший агент може повторно використати. Якщо він не може задовольнити всі три одразу, це неправильна форма.</p>
      <p>У термінах репозиторію це вказує на три поверхні:</p>





















      <table><thead><tr><th>Поверхня</th><th>Що вона має нести</th></tr></thead><tbody><tr><td>Маніфест артефакту</td><td>Стабільні ID для секцій, компонентів, активів і згенерованих файлів</td></tr><tr><td>Знімок плагіна</td><td>Яка навичка, дизайн-система, входи й етапи конвеєра створили артефакт</td></tr><tr><td>UI перегляду / безголовий вивід</td><td>Мапа макета, редаговані аспекти й запропоновані наміри редагування</td></tr></tbody></table>
      <p>Важливе обмеження: рівень не повинен стати другим пропрієтарним полотном. Режим збою, якого слід уникати, — це перебудова графа сцени Figma під новою назвою — багата, специфічна для застосунку структура, яку може відрендерити лише UI Open Design і яка вмирає тієї миті, коли ви залишаєте застосунок. Натомість рівень макета має бути звичайною мапою артефакту, що мандрує разом із файлами, тож контриб’ютор може прочитати її в текстовому редакторі, а інший агент може спожити її без SDK.</p>
      <figure>
        <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="Скелет каркаса макета, що піднімається як власний обираний шар над порожнім полотном, у зеленій рамці на майже білому редакційному тлі">
        <figcaption>Рівень макета — це структура, яку полотно тримало неявною, витягнута туди, де її можуть прочитати і агент, і людина.</figcaption>
      </figure>
      <h2>Практична форма для рівня макета</h2>
      <p>Ось найменша версія, що зробила б агентно-орієнтований дизайн менш непрозорим:</p>
      <ol>
      <li>Кожен згенерований артефакт отримує стабільні семантичні ID: <code>hero</code>, <code>proof-strip</code>, <code>pricing</code>, <code>faq</code>, <code>final-cta</code>.</li>
      <li>Кожен ID несе речення наміру: «Пояснити обіцянку продукту на одному екрані», а не «верхня секція».</li>
      <li>Кожна секція перелічує редаговані аспекти: текст, щільність, макет, колір, медіа, рух, джерело даних.</li>
      <li>Кожен згенерований файл посилається назад на ID секції, що його створила.</li>
      <li>Кожен прохід перегляду видає запропоновані наміри редагування: «скоротити заголовок героя», «збільшити контраст у картках цін», «розділити блок відгуків».</li>
      <li>UI рендерить це як навігатор, тоді як безголові користувачі отримують ту саму структуру у вигляді JSON чи Markdown.</li>
      </ol>
      <h3>Як міг би насправді виглядати маніфест</h3>
      <p>Сенс того, щоб це записати, у тому, що структура нічим не примітна — і саме тому вона може бути публічним контрактом, а не приватним трюком. Маніфест для згенерованого лендингу міг би читатися так:</p>
      <pre class="astro-code open-design-editorial" style="background-color:#f7f1de;color:#15140f; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line"><span style="color:#5A5448">{</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">artifact</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/index.html</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">producedBy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">skill</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">magazine-poster</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">system</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">linear</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">stage</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">compose</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">sections</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Explain the product promise in one screen</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">density</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">media</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/hero.css</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">id</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">Let a visitor self-select a plan without scrolling back</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">editable</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">copy</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">layout</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">data-source</span><span style="color:#5A5448">"</span><span style="color:#5A5448">],</span></span>
      <span class="line"><span style="color:#5A5448">      "</span><span style="color:#15140F">files</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span><span style="color:#5A5448">"</span><span style="color:#6E7448">landing/index.html#pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">landing/pricing.json</span><span style="color:#5A5448">"</span><span style="color:#5A5448">]</span></span>
      <span class="line"><span style="color:#5A5448">    }</span></span>
      <span class="line"><span style="color:#5A5448">  ],</span></span>
      <span class="line"><span style="color:#5A5448">  "</span><span style="color:#15140F">suggestedEdits</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> [</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">hero</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">shorten headline to one line</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> },</span></span>
      <span class="line"><span style="color:#5A5448">    {</span><span style="color:#5A5448"> "</span><span style="color:#15140F">target</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">pricing</span><span style="color:#5A5448">"</span><span style="color:#5A5448">,</span><span style="color:#5A5448"> "</span><span style="color:#15140F">intent</span><span style="color:#5A5448">"</span><span style="color:#5A5448">:</span><span style="color:#5A5448"> "</span><span style="color:#6E7448">drop from three plans to two</span><span style="color:#5A5448">"</span><span style="color:#5A5448"> }</span></span>
      <span class="line"><span style="color:#5A5448">  ]</span></span>
      <span class="line"><span style="color:#5A5448">}</span></span></code></pre>
      <p>Жоден з цих ключів не екзотичний. <code>sections</code> — це список, <code>editable</code> — це enum, <code>files</code> — це зворотне посилання. Цінність не в хитрості схеми — вона в тому факті, що ID переживають регенерацію, тож той самий блок <code>pricing</code> усе ще лишається <code>pricing</code> після того, як агент переписав його двічі.</p>
      <p>Цього достатньо, щоб дозволити дизайнеру сказати «Зміни <code>pricing</code> з трьох планів на два», і достатньо, щоб дозволити код-агенту пропатчити правильний файл, не здогадуючись з пікселів. Інструкція розв’язується в ID секції, ID секції розв’язується в набір файлів, а редагування потрапляє туди, куди й малося на меті.</p>
      <h3>Чому це шлях для внеску, а не запит на функцію</h3>
      <p>Це також дає спільноті чистий шлях для внеску. Контриб’ютору не потрібно перепроєктовувати продукт, щоб тут допомогти. Він може написати навичку, що видає маніфест для одного типу артефакту, атом перегляду, що пропонує наміри редагування, розширення маніфесту, що додає поле, яке можуть прочитати інші навички, або тест-кейс, що стверджує, що ID секцій лишаються стабільними крізь регенерацію. Кожне з цього — невелика, придатна до злиття зміна, що робить один результат менш непрозорим — і оскільки рівень є звичайним текстом, два контриб’ютори, що працюють над презентацією й мобільним екраном, не мусять координувати спільний бінарний формат. Рівень макета стає публічним контрактом, а не приватною можливістю, похованою всередині застосунку.</p>
      <h2>Що робити далі</h2>
      <p>Якщо це той вид проблеми, над яким ви хочете працювати, зробіть внесок у вигляді невеликої навички чи плагіна, що робить один артефакт легшим для огляду. Почніть з конкретного результату: лендинг, презентація чи мобільний екран. Додайте стабільні ID секцій, опишіть редаговані аспекти, видайте їх як JSON чи Markdown поряд з артефактом і відкрийте PR з артефактом «до/після», щоб рецензент міг побачити різницю, яку дає оглядний рівень.</p>
      <p>Це досі напрям, а не випущена функція — цінність того, щоб назвати це зараз, у тому, що примітиви вже існують, тож робота є додатковою, а не переписуванням.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Зробіть внесок у вигляді навички</a>.</p>
      <h2>Пов’язане для читання</h2>
      <ul>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи: як працює бібліотека Open Design</a> — поточні керовані файлами примітиви під цією пропозицією</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a> — форма продукту, що уможливлює публічні контракти артефактів</li>
      <li><a href="/blog/figma-alternative-open-design/">Опенсорсна альтернатива Figma</a> — де опиняється «прибрати полотно» проти лідера ринку, що зробив полотно центральним</li>
      </ul>
---

A useful community reply does not ask for a bigger button. It names the missing layer.

That is what happened under the [Open Design 0.8.0-preview discussion](https://github.com/nexu-io/open-design/discussions/1727). The launch thread argued for two shifts: stop treating the canvas as the primary work unit, and make the agent the first-class design worker. One reply agreed with the direction, then pointed at the hard part: when the canvas disappears, users still need a way to understand what the agent made before they can edit it with confidence.

The phrase in the reply was "Layout Understanding Layer." It is a good name because it refuses the lazy answer. Agent-native design cannot mean "trust the screenshot." It needs a readable model of the artifact: sections, intent, editable parts, stable references, and suggested edit moves. This post is an attempt to take that reply seriously — to sketch what such a layer could carry, where it should live in Open Design, and why it is a contribution path rather than a roadmap promise.

## The canvas gave designers spatial confidence

Figma's canvas is not only a drawing surface. It is also an explanation surface. You can zoom out, see the page hierarchy, click a frame, inspect constraints, rename layers, and understand where one piece of the work ends and another begins.

### What you actually lose when the canvas goes away

That understanding is easy to underestimate until it is gone. A generated landing page can look correct in a sandboxed preview and still be hard to direct. The problem is not the pixels — it is the absence of a shared vocabulary between the human and the agent.

"Make the hero more confident" is useful only if the agent and the human agree on what the hero is. "Tighten the pricing section" works only if the artifact carries a stable section identity across revisions. Without that, every instruction degrades into pointing: the designer describes a region by its position ("the second block from the top"), the agent guesses from the rendered output, and the next regeneration quietly renumbers everything. The canvas used to absorb this cost silently. It named the parts for you, kept those names stable while you worked, and let you select one without describing it.

### The clarity is worth keeping even if the unit is wrong

This is the part of the #DeFigma argument that needs care. The canvas may be the wrong unit of work for an agent-native system — it assumes a human dragging rectangles, not an agent writing files — but the clarity people got from the canvas is still valuable. The mistake would be to treat "drop the canvas" and "drop the understanding the canvas provided" as the same decision. They are not. Open Design has to move that clarity into the artifact model, not throw it away. The layout layer is the name for that relocation.

## Open Design already has the right primitives

The reason this proposal fits Open Design is that the project is already built around explicit contracts. A skill is a `SKILL.md` file. A design system is a `DESIGN.md` file. A plugin adds an `open-design.json` sidecar. Nothing in the system is a binary blob you have to reverse-engineer; the contracts are text, and text is something both an agent and a human can read. The mechanics are covered in [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/), and the product argument is in [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/).

The layout layer should follow the same pattern. It should be text the agent can read, state the UI can render, and metadata another agent can reuse. If it cannot satisfy all three at once, it is the wrong shape.

In repo terms, that points at three surfaces:

| Surface | What it should carry |
|---|---|
| Artifact manifest | Stable IDs for sections, components, assets, and generated files |
| Plugin snapshot | Which skill, design system, inputs, and pipeline stages produced the artifact |
| Review UI / headless output | A layout map, editable aspects, and suggested edit intents |

The important constraint: the layer should not become a second proprietary canvas. The failure mode to avoid is rebuilding Figma's scene graph under a new name — a rich, app-specific structure that only the Open Design UI can render and that dies the moment you leave the app. The layout layer should instead be a plain artifact map that travels with the files, so a contributor can read it in a text editor and a different agent can consume it without an SDK.

<figure>
  <img src="/blog/layout-layer-canvas-used-to-hide-inline.webp" alt="A wireframe layout skeleton lifting out as its own selectable layer above a blank canvas, in a green frame on a near-white editorial ground" />
  <figcaption>The layout layer is the structure the canvas kept implicit — pulled out where an agent and a human can both read it.</figcaption>
</figure>

## A practical shape for the layout layer

Here is the smallest version that would make agent-native design feel less opaque:

1. Each generated artifact gets stable semantic IDs: `hero`, `proof-strip`, `pricing`, `faq`, `final-cta`.
2. Each ID carries an intent sentence: "Explain the product promise in one screen," not "top section."
3. Each section lists editable aspects: copy, density, layout, color, media, motion, data source.
4. Each generated file links back to the section ID that produced it.
5. Each review pass emits suggested edit intents: "shorten hero headline," "increase contrast in pricing cards," "split testimonial block."
6. The UI renders this as a navigator, while headless users receive the same structure as JSON or Markdown.

### What a manifest could actually look like

The point of writing it down is that the structure is unremarkable — which is exactly why it can be a public contract instead of a private trick. A manifest for a generated landing page might read like this:

```json
{
  "artifact": "landing/index.html",
  "producedBy": { "skill": "magazine-poster", "system": "linear", "stage": "compose" },
  "sections": [
    {
      "id": "hero",
      "intent": "Explain the product promise in one screen",
      "editable": ["copy", "density", "media"],
      "files": ["landing/index.html#hero", "landing/hero.css"]
    },
    {
      "id": "pricing",
      "intent": "Let a visitor self-select a plan without scrolling back",
      "editable": ["copy", "layout", "data-source"],
      "files": ["landing/index.html#pricing", "landing/pricing.json"]
    }
  ],
  "suggestedEdits": [
    { "target": "hero", "intent": "shorten headline to one line" },
    { "target": "pricing", "intent": "drop from three plans to two" }
  ]
}
```

None of those keys are exotic. `sections` is a list, `editable` is an enum, `files` is a back-reference. The value is not in the schema's cleverness — it is in the fact that the IDs survive a regeneration, so the same `pricing` block is still `pricing` after the agent rewrites it twice.

That is enough to let a designer say, "Change `pricing` from three plans to two," and enough to let a code agent patch the right file without guessing from pixels. The instruction resolves to a section ID, the section ID resolves to a set of files, and the edit lands where it was meant to.

### Why this is a contribution path, not a feature request

It also gives the community a clean contribution path. A contributor does not need to redesign the product to help here. They can write a skill that emits a manifest for one artifact type, a review atom that proposes edit intents, a manifest extension that adds a field other skills can read, or a test case that asserts section IDs stay stable across a regeneration. Each of those is a small, mergeable change that makes one output less opaque — and because the layer is plain text, two contributors working on a deck and a mobile screen do not have to coordinate a shared binary format. The layout layer becomes a public contract, not a private capability buried inside the app.

## What to do next

If this is the kind of problem you want to work on, contribute a small skill or plugin that makes one artifact easier to inspect. Start with a concrete output: a landing page, a deck, or a mobile screen. Add stable section IDs, describe the editable aspects, emit them as JSON or Markdown alongside the artifact, and open the PR with a before/after artifact so a reviewer can see the difference an inspectable layer makes.

This is still a direction, not a shipped feature — the value of naming it now is that the primitives already exist, so the work is additive rather than a rewrite.

[Contribute a skill](https://github.com/nexu-io/open-design/tree/main/skills).

## Related reading

- [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/) — the current file-driven primitives underneath the proposal
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the product shape that makes public artifact contracts possible
- [The open-source alternative to Figma](/blog/figma-alternative-open-design/) — where "drop the canvas" lands against the incumbent that made the canvas central
