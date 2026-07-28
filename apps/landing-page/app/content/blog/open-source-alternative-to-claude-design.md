---
title: "The open-source alternative to Claude Design"
date: 2026-05-14
category: "Guides"
readingTime: 7
summary: "Claude Design is good. It's also closed-source, hosted-only, and bundled with a Claude subscription. Here's the honest read on when to pick it — and when the open-source path wins."
i18n:
  zh:
<<<<<<< HEAD
    title: "Claude Design 的开源替代方案"
    summary: "Claude Design 很不错。但它也是闭源的、只能托管运行的，而且和 Claude 订阅捆绑在一起。这里给出一份诚实的判断：什么时候该选它——什么时候开源路线更胜一筹。"
    bodyHtml: |
      <p>Claude Design 很不错。我们在真实的项目需求中用过它。我们之所以选择<a href="/blog/why-we-built-open-design-as-a-skill-layer/">构建一个开源层</a>，并不是因为 Anthropic 做出了一个糟糕的工具——他们没有。而是因为闭源、只能托管运行、每月 20 到 200 美元的设计工具，对于未来十年的设计工作来说是错误的形态。这篇文章是一支同处这个品类、同样在交付产品的团队，对 Claude Design 给出的诚实判断：它是什么、它在哪些地方把你锁住、开源替代方案到底长什么样，以及这个季度你应该选哪一个。</p>
      <h2>Claude Design 到底是什么</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> 于 2026 年 4 月从 Anthropic Labs 推出。它是一款由 Claude Opus 4.7 驱动的对话式设计工具：左侧聊天，右侧画布。你描述你想要什么，Claude 生成一份设计，你再通过评论、内联编辑和提示词调优来不断迭代。</p>
      <p>它有四件事做得很好：</p>
      <ul>
      <li><strong>从文字生成原型。</strong>引导流程、设置页、管理后台、结算页变体——从提示词到可交互界面只需五分钟。</li>
      <li><strong>代码库感知。</strong>导入一个 GitHub 仓库或挂载一个本地目录，原型就会使用你真实的组件、你的 token 系统、你的约定。</li>
      <li><strong>品牌整合。</strong>设计系统只需配置一次，之后每个项目都会自动套用其中的配色、排版和组件模式。</li>
      <li><strong>交接给 Claude Code。</strong>"构建它"按钮会在同一个浏览器标签页内把原型推进到可上线的生产代码。</li>
      </ul>
      <p>导出格式包括 Canva、PDF、PPTX、HTML 和独立 URL。定价是捆绑式的——Claude Pro 20 美元、Max 100 至 200 美元、Enterprise 则是常见的"联系我们"档位。它目前是面向付费 Claude 订阅用户的研究预览版。</p>
      <p>如果你读过<a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">官方教程</a>，会发现 Anthropic 描述的工作流，正是 Open Design 所交付的那一套：一份需求、一个方向、一件成品、一次交接。差异藏在更下面一层。</p>
      <h2>它在哪里把你锁住</h2>
      <p>Claude Design 带有四重值得开门见山指出的锁定,因为营销页面不会讲这些。</p>
      <p><strong>模型是固定的。</strong>每一次渲染都走 Claude。不是 Claude <em>或</em>某个你已经付过费的模型——只有 Claude。如果你的团队和 GPT、Gemini 或 DeepSeek 签了合同,或者你为了敏感项目在 Ollama 上自托管,那些工作流都无法迁移过来。Token 成本将永远跟着 Anthropic 的定价曲线走。</p>
      <p><strong>运行时是托管的。</strong>你的提示词、你的设计系统、你的代码库上下文,全都会被传到 Anthropic 的服务器上。对于代理公司的工作,或处于 NDA 之下的发布前创意素材而言,这每次都意味着一场采购合规讨论。在研究预览版中无法自托管,而那份公告也没有承诺会提供这一选项。</p>
      <p><strong>这些 skill 不属于你。</strong>Claude Design 的行为由活在 Anthropic 内部的提示词和工具定义。你无法 fork 它们、审计它们,或替换其中任何一个。Anthropic 在 Claude Skills 中交付的那些"skill"是相邻但独立的;设计专用的工具是内部的。</p>
      <p><strong>账单是一份订阅。</strong>每个席位每月 20 至 200 美元,对一名独立设计师来说还行,对一个二十人的团队来说就很肉疼,而对那十几位本来可能会采用同一套工作流的开源贡献者来说,则根本无从谈起。</p>
      <p>这些都不是 Claude Design 的 bug。它们是一个托管产品的固有形态。Anthropic 是为中位数的 Pro 订阅用户做的优化。而我们不是那个中位数的 Pro 订阅用户。</p>
      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="一块黑色多面体云朵实心被一条虚线拴在一个小小的地面锚点和服务器方块上,置于一块暖色调的编辑风研究图版上" />
        <figcaption>默认托管:你的提示词、设计系统和代码库上下文都会被传到别人的服务器上。</figcaption>
      </figure>
      <h2>开源替代方案</h2>
      <p><strong>Open Design</strong>(本站)是另一种押注。它不是 Claude Design 的克隆品——它是一个轻薄的 skill 层,把你已经在用的编程 agent 变成一台设计引擎。四个基本要素是 <a href="/blog/31-skills-72-systems-how-the-library-works/">skill、系统、适配器和守护进程</a>。每一个 skill 都是一个 <code>SKILL.md</code> 文件。每一个设计系统都是一个 <code>DESIGN.md</code> 文件。每一个 agent 适配器大约 80 行 TypeScript。</p>
      <p>今天开箱即用的内容:</p>
      <ul>
      <li><strong>123 个 skill</strong>——演示文稿生成器、移动端原型、编辑风页面、Word/Excel/PPT、品牌探索</li>
      <li><strong>148 套设计系统</strong>——Linear、Vercel、Stripe、Apple、Cursor、Figma 的可移植 Markdown 版本,外加一条很长的长尾</li>
      <li><strong>在你的 <code>$PATH</code> 上自动检测 16 个编程 agent CLI</strong>——Claude Code、Codex、Cursor、Gemini、OpenCode、Copilot、Devin、Hermes、Pi、Kimi、Kiro、Qwen、DeepSeek TUI、Qoder、Mistral Vibe、Kilo</li>
      <li><strong>四步锁定工作流</strong>——问题表单 → 方向选择器 → 实时方案流 → 沙箱化 iframe 预览</li>
      <li><strong>默认 BYOK</strong>——粘贴任意 OpenAI 兼容的 <code>base_url</code> 和密钥,<a href="/blog/byok-design-workflow-claude-codex-qwen/">你的 token 直接发给模型提供商</a></li>
      <li><strong>Apache-2.0、无需注册、通过 <code>pnpm tools-dev</code> 运行</strong></li>
      </ul>
      <p>这个心智模型是:Claude Design 是一个产品。Open Design 是一个层。</p>
      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="三块黑色多面体置于一条带刻度的基线上,只有一块卡进了一个支架框中,其余两块松散地搁着,置于一块暖色调的编辑风研究图版上" />
        <figcaption>Claude Design 固定了模型。开源路线让你带上你已经在付费的那一个。</figcaption>
      </figure>
      <h2>逐项对比</h2>
      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>许可证</td>
      <td>专有</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>运行时</td>
      <td>托管(Anthropic)</td>
      <td>本地守护进程(<code>pnpm tools-dev</code>)+ 可选的 Vercel 部署</td>
      </tr>
      <tr>
      <td>模型</td>
      <td>仅 Claude</td>
      <td>任意 OpenAI 兼容端点 + 检测到的 16 个 CLI</td>
      </tr>
      <tr>
      <td>Skill</td>
      <td>内部</td>
      <td>123 个可 fork 的 <code>SKILL.md</code> 文件夹</td>
      </tr>
      <tr>
      <td>设计系统</td>
      <td>按项目配置品牌</td>
      <td>148 个可移植的 <code>DESIGN.md</code> 文件</td>
      </tr>
      <tr>
      <td>代码库上下文</td>
      <td>GitHub 导入 + 本地</td>
      <td>Skill 级别,真实的工作目录</td>
      </tr>
      <tr>
      <td>定价</td>
      <td>20 / 100 / 200 美元 / Enterprise</td>
      <td>免费;你直接向你的模型提供商付费</td>
      </tr>
      <tr>
      <td>交接</td>
      <td>Claude Code(应用内)</td>
      <td><code>$PATH</code> 上的任意 agent,外加 HTML / PDF / PPTX / ZIP 导出</td>
      </tr>
      <tr>
      <td>可自托管</td>
      <td>否</td>
      <td>是(笔记本或 Vercel)</td>
      </tr>
      <tr>
      <td>数据路径</td>
      <td>提示词 → Anthropic</td>
      <td>提示词 → 你选择的提供商;没有任何东西经过我们</td>
      </tr>
      </tbody>
      </table>
      <p>诚实的总结:Claude Design 拥有最打磨过的单一产品体验。Open Design 用这种打磨过的单一产品表面,换来了一座库——更多 skill、更多系统、更多 agent,设计用来与你笔记本上已有的那个 agent 组合协作。</p>
      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="三块薄薄的黑色板材以可见的间隙等距堆叠,如同一摞分层,刻度标记着这些间隙,顶上放着一片橄榄叶,置于一块暖色调的编辑风研究图版上" />
        <figcaption>一个产品和一个层——Open Design 处在你的 agent 与设计工作之间。</figcaption>
      </figure>
      <h2>谁该选哪个</h2>
      <table>
      <thead>
      <tr>
      <th>如果你是……</th>
      <th>选择</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>一名公司已经在用 Claude Pro、需要在午饭前拿出一份原型的独立 PM</td>
      <td><strong>Claude Design。</strong>那 20 美元/月已经是沉没成本;界面是真的快。</td>
      </tr>
      <tr>
      <td>一支 Anthropic 已经通过采购审批的企业设计团队</td>
      <td><strong>Claude Design。</strong>整合成本你已经付过一次了;把它花出去。</td>
      </tr>
      <tr>
      <td>一名想要"免费版 Claude Design"的独立设计师</td>
      <td><strong>Open Design。</strong>免费,而且你拥有这套工作流而非租用它——把它指向一个你已经在付费的模型,第一份演示文稿大约十分钟搞定。</td>
      </tr>
      <tr>
      <td>一名已经从终端驱动 Claude Code、Codex 或 Cursor 的设计工程师</td>
      <td><strong>Open Design。</strong>你的 agent 就是设计引擎;skill 层在不引入新应用的情况下,补上品味与结构。</td>
      </tr>
      <tr>
      <td>任何需要 BYOK、项目进行中切换模型、或为敏感项目而仅本地运行的人</td>
      <td><strong>Open Design。</strong><a href="/blog/byok-reality-check-5-things-that-break/">现实比营销说辞更粗糙</a>,但这份契约是唯一真正站得住脚的。</td>
      </tr>
      <tr>
      <td>一名想要交付一个项目可以采纳的新设计 skill 的开源贡献者</td>
      <td><strong>Open Design。</strong>放进一个文件夹,重启守护进程,提交 PR。</td>
      </tr>
      <tr>
      <td>一支正在标准化一套能熬过工具更替的可移植设计系统的团队</td>
      <td><strong>Open Design。</strong><code>DESIGN.md</code> 文件比读取它的工具活得更久。</td>
      </tr>
      </tbody>
      </table>
      <p>对大多数团队来说,决定胜负的那一维并不是质量。而是你宁愿租用这套工作流,还是拥有它。</p>
      <h2>接下来该做什么</h2>
      <p>如果你想在掏出一份 Pro 订阅之前,先感受一下拥有工作流是什么滋味,那就运行那个三条命令的快速上手,并把它指向你已经在付费的模型。整套东西都在一个仓库里,第一份演示文稿大约十分钟搞定。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">试试开源工作流</a>。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 做成一个 skill 层,而不是一个产品</a>——"是层,不是产品"这一押注背后更长的宣言</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流——用你自己的密钥运行 Claude、Codex 或 Qwen</a>——选择你自己模型背后的成本账</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK 现实检验——会出问题的五件事</a>——开源路线今天实际会出哪些问题,以及对应的变通办法</li>
      </ul>
  zh-tw:
    title: "Claude Design 的開源替代方案"
    summary: "Claude Design 很不錯。但它同時也是閉源的、只能託管使用，並且綁定在 Claude 訂閱裡。這篇文章誠實地分析：什麼時候該選它，什麼時候開源路線才是贏家。"
    bodyHtml: |
      <p>Claude Design 很不錯。我們在真實的設計需求上用過它。我們之所以選擇<a href="/blog/why-we-built-open-design-as-a-skill-layer/">打造一層開源的方案</a>，並不是因為 Anthropic 做出了一個糟糕的工具——他們沒有。而是因為閉源、只能託管、每月 20 到 200 美元的設計工具，對於設計工作未來十年的形態而言是錯的。這篇文章是來自同一個賽道團隊對 Claude Design 的誠實解讀：它是什麼、它在哪裡把你鎖死、開源替代方案實際長什麼樣，以及這一季你該選哪一個。</p>
      <h2>Claude Design 究竟是什麼</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> 於 2026 年 4 月從 Anthropic Labs 推出。它是一款由 Claude Opus 4.7 驅動的對話式設計工具：左邊聊天、右邊畫布。你描述想要什麼，Claude 生成一份設計，然後你透過評論、行內編輯和提示詞調整來迭代。</p>
      <p>它有四件事做得很好：</p>
      <ul>
      <li><strong>從文字生成原型。</strong>引導流程、設定頁、後台管理面板、結帳變體——從提示詞到可互動畫面只要五分鐘。</li>
      <li><strong>程式碼庫感知。</strong>匯入一個 GitHub repo 或掛載本地目錄，原型就會使用你真實的元件、你的 token 系統、你的慣例。</li>
      <li><strong>品牌整合。</strong>設定好一次設計系統，之後每個專案都會自動沿用其中的顏色、字體和元件樣式。</li>
      <li><strong>交接給 Claude Code。</strong>「build this」按鈕在同一個瀏覽器分頁裡把原型帶到可上線的程式碼。</li>
      </ul>
      <p>匯出格式包含 Canva、PDF、PPTX、HTML 以及獨立 URL。定價是綁定式的——Claude Pro 20 美元、Max 100 至 200 美元、Enterprise 則是慣常的「請洽詢」等級。它目前是面向付費 Claude 訂閱者的研究預覽版。</p>
      <p>如果你讀過<a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">官方教學</a>，Anthropic 描述的工作流程跟 Open Design 提供的一模一樣：一份需求、一個方向、一件產物、一次交接。差異藏在下面一層。</p>
      <h2>它在哪裡把你鎖死</h2>
      <p>Claude Design 帶著四道值得先講清楚的鎖定，因為行銷頁面不會講。</p>
      <p><strong>模型是固定的。</strong>每一次渲染都走 Claude。不是 Claude <em>或</em>你已經付過費的某個模型——就只有 Claude。如果你的團隊跟 GPT、Gemini 或 DeepSeek 有合約，或者你為了敏感需求在 Ollama 上自架，那些工作流程都無法轉移。Token 成本永遠跟著 Anthropic 的定價曲線走。</p>
      <p><strong>執行環境是託管的。</strong>你的提示詞、你的設計系統、你的程式碼庫上下文,全都會傳到 Anthropic 的伺服器。對於代理商工作或受 NDA 約束的上市前創意而言,那每次都是一場採購對話。在研究預覽版裡自架不是一個選項,而公告也沒有承諾會有。</p>
      <p><strong>那些 skills 不屬於你。</strong>Claude Design 的行為由活在 Anthropic 內部的提示詞和工具定義。你無法 fork 它們、稽核它們,或替換其中任何一個。Anthropic 在 Claude Skills 裡推出的那些「skills」是相鄰但獨立的;設計專用的工具是內部的。</p>
      <p><strong>帳單是訂閱制。</strong>每席每月 20 至 200 美元,對單人設計師沒問題,對二十人的團隊就很痛,對於原本會採用同一套工作流程的十幾位開源貢獻者來說則根本行不通。</p>
      <p>這些都不是 Claude Design 的 bug。它們是託管產品的形態。Anthropic 是為中位數的 Pro 訂閱者做最佳化。我們不是中位數的 Pro 訂閱者。</p>
      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="一個黑色多面體雲團，以一條虛線繫在一個小小的地面錨點和伺服器方塊上，置於暖色調的編輯式研究底版上" />
        <figcaption>預設託管：你的提示詞、設計系統和程式碼庫上下文，都傳到別人的伺服器上。</figcaption>
      </figure>
      <h2>開源替代方案</h2>
      <p><strong>Open Design</strong>（就是本站）是一個不同的賭注。它不是 Claude Design 的複製品——它是一層薄薄的 skill 層,把你已經在用的編碼 agent 變成一台設計引擎。四個基本元件是 <a href="/blog/31-skills-72-systems-how-the-library-works/">skills、systems、adapters 和 daemon</a>。每個 skill 都是一個 <code>SKILL.md</code> 檔案。每個設計系統都是一個 <code>DESIGN.md</code> 檔案。每個 agent adapter 大約 80 行 TypeScript。</p>
      <p>今天開箱即附的內容：</p>
      <ul>
      <li><strong>123 個 skills</strong>——投影片產生器、行動端 mockup、編輯式頁面、Word/Excel/PPT、品牌探索</li>
      <li><strong>148 套設計系統</strong>——Linear、Vercel、Stripe、Apple、Cursor、Figma 的可攜 Markdown 版本,外加一條長尾</li>
      <li><strong>自動偵測你 <code>$PATH</code> 上的 16 個編碼 agent CLI</strong>——Claude Code、Codex、Cursor、Gemini、OpenCode、Copilot、Devin、Hermes、Pi、Kimi、Kiro、Qwen、DeepSeek TUI、Qoder、Mistral Vibe、Kilo</li>
      <li><strong>四步鎖定式工作流程</strong>——問題表單 → 方向選擇器 → 即時計畫串流 → 沙箱化的 iframe 預覽</li>
      <li><strong>預設 BYOK</strong>——貼上任何 OpenAI 相容的 <code>base_url</code> 和金鑰,<a href="/blog/byok-design-workflow-claude-codex-qwen/">你的 token 直接走向供應商</a></li>
      <li><strong>Apache-2.0、免註冊、用 <code>pnpm tools-dev</code> 就能跑</strong></li>
      </ul>
      <p>心智模型：Claude Design 是一個產品。Open Design 是一個層。</p>
      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="三個黑色多面體立於一條量好的基準線上，只有一個嵌進了支架框中，其餘的則鬆散擺放，置於暖色調的編輯式研究底版上" />
        <figcaption>Claude Design 把模型固定死。開源路線讓你帶上你已經在付費的那一個。</figcaption>
      </figure>
      <h2>並排對照</h2>
      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>授權條款</td>
      <td>專有</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>執行環境</td>
      <td>託管（Anthropic）</td>
      <td>本地 daemon（<code>pnpm tools-dev</code>）+ 可選的 Vercel 部署</td>
      </tr>
      <tr>
      <td>模型</td>
      <td>僅限 Claude</td>
      <td>任何 OpenAI 相容端點 + 16 個偵測到的 CLI</td>
      </tr>
      <tr>
      <td>Skills</td>
      <td>內部</td>
      <td>123 個可 fork 的 <code>SKILL.md</code> 資料夾</td>
      </tr>
      <tr>
      <td>設計系統</td>
      <td>逐專案的品牌設定</td>
      <td>148 個可攜的 <code>DESIGN.md</code> 檔案</td>
      </tr>
      <tr>
      <td>程式碼庫上下文</td>
      <td>GitHub 匯入 + 本地</td>
      <td>skill 層級、真實工作目錄</td>
      </tr>
      <tr>
      <td>定價</td>
      <td>20 / 100 / 200 美元 / Enterprise</td>
      <td>免費；你直接付費給你的模型供應商</td>
      </tr>
      <tr>
      <td>交接</td>
      <td>Claude Code（應用內）</td>
      <td><code>$PATH</code> 上的任何 agent,外加 HTML / PDF / PPTX / ZIP 匯出</td>
      </tr>
      <tr>
      <td>可自架</td>
      <td>否</td>
      <td>是（筆電或 Vercel）</td>
      </tr>
      <tr>
      <td>資料路徑</td>
      <td>提示詞 → Anthropic</td>
      <td>提示詞 → 你選的供應商;沒有任何東西經過我們</td>
      </tr>
      </tbody>
      </table>
      <p>誠實的總結：Claude Design 擁有最精緻的單一產品體驗。Open Design 用精緻的單一產品表層,換來一座資料庫——更多 skills、更多 systems、更多 agents,設計上就是要跟你筆電上已有的 agent 組合在一起。</p>
      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="三片薄薄的黑色板塊以可見的間隙等距堆疊，像一個分層堆疊，尺寸刻度標記著那些間隙，最上方放著一片橄欖葉，置於暖色調的編輯式研究底版上" />
        <figcaption>一個產品和一個層——Open Design 坐落在你的 agent 與設計工作之間。</figcaption>
      </figure>
      <h2>誰該選哪一個</h2>
      <table>
      <thead>
      <tr>
      <th>如果你是……</th>
      <th>選</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>一家公司裡的單人 PM,公司已經在用 Claude Pro,而你需要在午餐前生出一個原型</td>
      <td><strong>Claude Design。</strong>那 20 美元/月已經是沉沒成本;介面是真的快。</td>
      </tr>
      <tr>
      <td>一個企業設計團隊,Anthropic 已經通過了採購流程</td>
      <td><strong>Claude Design。</strong>整合成本你已經付過一次了;就把它用好。</td>
      </tr>
      <tr>
      <td>一個想要「免費版 Claude Design」的單人設計師</td>
      <td><strong>Open Design。</strong>免費,而且你擁有這套工作流程而不是在租它——把它指向一個你已經在付費的模型,第一份投影片大約十分鐘搞定。</td>
      </tr>
      <tr>
      <td>一個已經在終端機裡駕馭 Claude Code、Codex 或 Cursor 的設計工程師</td>
      <td><strong>Open Design。</strong>你的 agent 就是設計引擎;skill 層在不引入新應用的情況下加進了品味與結構。</td>
      </tr>
      <tr>
      <td>任何需要 BYOK、需要在專案中途切換模型,或為敏感需求純本地運行的人</td>
      <td><strong>Open Design。</strong><a href="/blog/byok-reality-check-5-things-that-break/">現實比行銷更粗糙</a>,但這份契約是唯一真正站得住腳的。</td>
      </tr>
      <tr>
      <td>一個想要交付一個專案能採納的新設計 skill 的開源貢獻者</td>
      <td><strong>Open Design。</strong>丟進一個資料夾、重啟 daemon、送出 PR。</td>
      </tr>
      <tr>
      <td>一個正在標準化一套能在工具更迭中存活的可攜設計系統的團隊</td>
      <td><strong>Open Design。</strong><code>DESIGN.md</code> 檔案比讀取它的工具活得更久。</td>
      </tr>
      </tbody>
      </table>
      <p>對大多數團隊而言,真正決定勝負的維度不是品質。而是你寧願租這套工作流程,還是擁有它。</p>
      <h2>接下來怎麼做</h2>
      <p>如果你想在花一筆 Pro 訂閱費之前,先感受擁有這套工作流程是什麼滋味,就跑一下這個三行指令的快速上手,然後把它指向你已經在付費的模型。整套東西就裝在一個 repo 裡,第一份投影片大約十分鐘搞定。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">試試這套開源工作流程</a>。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">為什麼我們把 Open Design 做成一個 skill 層,而不是一個產品</a>——「是層,不是產品」這個賭注背後更長的宣言</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流程——用你自己的金鑰跑 Claude、Codex 或 Qwen</a>——選你自己模型背後的成本帳</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK 現實檢驗——五件會出問題的事</a>——開源路線今天實際會壞在哪裡,以及繞過去的辦法</li>
      </ul>
  ja:
    title: "Claude Design のオープンソース代替"
    summary: "Claude Design は優れています。しかし同時に、クローズドソースであり、ホスト型のみで、Claude のサブスクリプションに抱き合わせられています。どんなときに Claude Design を選ぶべきか、そしてどんなときにオープンソースの道に軍配が上がるか——その率直な見解をお届けします。"
    bodyHtml: |
      <p>Claude Design は優れています。私たちも実際のブリーフで使ってきました。それでも私たちが代わりに<a href="/blog/why-we-built-open-design-as-a-skill-layer/">オープンソースのレイヤーを作った</a>のは、Anthropic が出来の悪いツールを出したからではありません——そんなことはありません。クローズドソースで、ホスト型のみで、月額 20 ドルから 200 ドルというデザインツールの形が、これから 10 年のデザイン作業にとって間違った形だからです。本記事は、同じカテゴリーで製品を出しているチームによる、Claude Design についての率直な見解です——それが何であるか、どこであなたをロックインするのか、オープンソースの代替が実際にはどう見えるのか、そしてこの四半期にどちらを選ぶべきか。</p>
      <h2>Claude Design とは実際のところ何か</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> は 2026 年 4 月に Anthropic Labs から登場しました。Claude Opus 4.7 を搭載した対話型デザインツールで、左にチャット、右にキャンバスという構成です。欲しいものを説明すると Claude がデザインを生成し、コメント、インライン編集、プロンプトの調整を通じて反復していきます。</p>
      <p>うまくこなすことが 4 つあります。</p>
      <ul>
      <li><strong>文章からのプロトタイプ。</strong>オンボーディングフロー、設定ページ、管理パネル、チェックアウトのバリエーション——プロンプトからインタラクティブな画面まで 5 分。</li>
      <li><strong>コードベースの認識。</strong>GitHub リポジトリをインポートするかローカルディレクトリを添付すると、プロトタイプがあなたの実際のコンポーネント、トークンシステム、規約を使います。</li>
      <li><strong>ブランド統合。</strong>デザインシステムを一度セットアップすれば、すべてのプロジェクトが自動的にカラー、タイポグラフィ、コンポーネントパターンを取り込みます。</li>
      <li><strong>Claude Code への引き渡し。</strong>「これをビルドする」ボタンで、同じブラウザタブ内でプロトタイプを本番対応のコードへ。</li>
      </ul>
      <p>エクスポートには Canva、PDF、PPTX、HTML、スタンドアロン URL が含まれます。料金は抱き合わせ——Claude Pro が 20 ドル、Max が 100〜200 ドル、Enterprise はおなじみの問い合わせ制ティア。現在は有料の Claude サブスクライバー向けのリサーチプレビューです。</p>
      <p><a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">公式チュートリアル</a>を読むと、Anthropic が説明するワークフローは Open Design が出しているものと同じです——ブリーフ、方向性、成果物、引き渡し。違いはひとつ下のレイヤーに存在します。</p>
      <h2>どこであなたをロックインするのか</h2>
      <p>Claude Design には、最初に名指ししておく価値のあるロックインが 4 つあります。マーケティングページは語ってくれないからです。</p>
      <p><strong>モデルは固定。</strong>すべてのレンダリングは Claude を通ります。Claude <em>または</em>あなたがすでに支払い済みのモデル、ではなく——ただ Claude だけです。チームが GPT、Gemini、DeepSeek と契約していたり、機密性の高いブリーフのために Ollama でセルフホストしていたりするなら、そうしたワークフローは移行できません。トークンコストは永遠に Anthropic の価格曲線に乗ります。</p>
      <p><strong>ランタイムはホスト型。</strong>あなたのプロンプト、デザインシステム、コードベースのコンテキストはすべて Anthropic のサーバーへ渡ります。エージェンシーの仕事や NDA 下のローンチ前クリエイティブにとっては、毎回が調達の話し合いになります。リサーチプレビューではセルフホストは選択肢になく、発表もそれを約束していません。</p>
      <p><strong>スキルはあなたのものではない。</strong>Claude Design の振る舞いは Anthropic の内部にあるプロンプトとツールによって定義されます。フォークすることも、監査することも、どれかを置き換えることもできません。Anthropic が Claude Skills で出している「スキル」は隣接するものですが別物で、デザイン専用のツールは内部のものです。</p>
      <p><strong>請求はサブスクリプション。</strong>1 シートあたり月額 20〜200 ドルは、ソロデザイナーには問題ありませんが、20 人のチームには痛く、同じワークフローを採用しようとするオープンソースの十数人の貢献者には論外です。</p>
      <p>これらはどれも Claude Design のバグではありません。ホスト型製品の形そのものです。Anthropic は中央値の Pro サブスクライバーに最適化しました。私たちは中央値の Pro サブスクライバーではありません。</p>
      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="黒いファセットの雲の立体が、破線で小さな地面のアンカーとサーバーブロックに繋ぎ止められている、暖色系のエディトリアルな習作プレート" />
        <figcaption>デフォルトでホスト型——あなたのプロンプト、デザインシステム、コードベースのコンテキストは、誰か他人のサーバーへ渡ります。</figcaption>
      </figure>
      <h2>オープンソースの代替</h2>
      <p><strong>Open Design</strong>（このサイト）は別の賭けです。Claude Design のクローンではありません——あなたがすでに使っているコーディングエージェントをデザインエンジンに変える、薄いスキルレイヤーです。4 つのプリミティブは<a href="/blog/31-skills-72-systems-how-the-library-works/">スキル、システム、アダプター、そしてデーモン</a>です。すべてのスキルは <code>SKILL.md</code> ファイル。すべてのデザインシステムは <code>DESIGN.md</code> ファイル。すべてのエージェントアダプターは約 80 行の TypeScript です。</p>
      <p>今日、箱に入って出荷されるもの。</p>
      <ul>
      <li><strong>123 個のスキル</strong>——デッキジェネレーター、モバイルモックアップ、エディトリアルページ、Word/Excel/PPT、ブランド探索</li>
      <li><strong>148 個のデザインシステム</strong>——Linear、Vercel、Stripe、Apple、Cursor、Figma のポータブルな Markdown 版、それにロングテール</li>
      <li><strong>16 個のコーディングエージェント CLI</strong> をあなたの <code>$PATH</code> 上で自動検出——Claude Code、Codex、Cursor、Gemini、OpenCode、Copilot、Devin、Hermes、Pi、Kimi、Kiro、Qwen、DeepSeek TUI、Qoder、Mistral Vibe、Kilo</li>
      <li><strong>4 ステップの固定ワークフロー</strong>——質問フォーム → 方向性ピッカー → ライブプランストリーム → サンドボックス化された iframe プレビュー</li>
      <li><strong>デフォルトで BYOK</strong>——任意の OpenAI 互換の <code>base_url</code> とキーを貼り付ければ、<a href="/blog/byok-design-workflow-claude-codex-qwen/">あなたのトークンはプロバイダーへ直行</a>します</li>
      <li><strong>Apache-2.0、サインアップ不要、<code>pnpm tools-dev</code> で動作</strong></li>
      </ul>
      <p>メンタルモデル：Claude Design は製品。Open Design はレイヤー。</p>
      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="計測された基準線の上に黒いファセットの多面体が 3 つ、1 つだけがブラケットフレームにはめ込まれ、残りはゆるく置かれている、暖色系のエディトリアルな習作プレート" />
        <figcaption>Claude Design はモデルを固定します。オープンな道は、あなたがすでに支払っているモデルを持ち込ませてくれます。</figcaption>
      </figure>
      <h2>並べて比較</h2>
      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>ライセンス</td>
      <td>プロプライエタリ</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>ランタイム</td>
      <td>ホスト型（Anthropic）</td>
      <td>ローカルデーモン（<code>pnpm tools-dev</code>）＋オプションの Vercel デプロイ</td>
      </tr>
      <tr>
      <td>モデル</td>
      <td>Claude のみ</td>
      <td>任意の OpenAI 互換エンドポイント＋検出された 16 個の CLI</td>
      </tr>
      <tr>
      <td>スキル</td>
      <td>内部</td>
      <td>フォーク可能な 123 個の <code>SKILL.md</code> フォルダ</td>
      </tr>
      <tr>
      <td>デザインシステム</td>
      <td>プロジェクトごとのブランドセットアップ</td>
      <td>ポータブルな 148 個の <code>DESIGN.md</code> ファイル</td>
      </tr>
      <tr>
      <td>コードベースのコンテキスト</td>
      <td>GitHub インポート＋ローカル</td>
      <td>スキルレベル、実際の作業ディレクトリ</td>
      </tr>
      <tr>
      <td>料金</td>
      <td>20 ドル / 100 ドル / 200 ドル / Enterprise</td>
      <td>無料。モデルプロバイダーに直接支払う</td>
      </tr>
      <tr>
      <td>引き渡し</td>
      <td>Claude Code（アプリ内）</td>
      <td><code>$PATH</code> 上の任意のエージェント、加えて HTML / PDF / PPTX / ZIP エクスポート</td>
      </tr>
      <tr>
      <td>セルフホスト可能</td>
      <td>不可</td>
      <td>可（ラップトップまたは Vercel）</td>
      </tr>
      <tr>
      <td>データの経路</td>
      <td>プロンプト → Anthropic</td>
      <td>プロンプト → あなたが選んだプロバイダー。私たちを経由するものは何もない</td>
      </tr>
      </tbody>
      </table>
      <p>率直なまとめ：Claude Design は最も洗練された単一製品の体験を持っています。Open Design はその洗練された単一製品の表面を、ライブラリと引き換えにします——より多くのスキル、より多くのシステム、より多くのエージェント、あなたのラップトップにすでにあるエージェントと組み合わせて使えるように設計されています。</p>
      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="薄い黒のスラブが 3 枚、レイヤースタックのように隙間を見せてアイソメトリックに積み重なり、隙間を寸法目盛りが示し、上にオリーブの葉、暖色系のエディトリアルな習作プレート" />
        <figcaption>製品とレイヤー——Open Design はあなたのエージェントとデザイン作業の間に位置します。</figcaption>
      </figure>
      <h2>誰が何を選ぶべきか</h2>
      <table>
      <thead>
      <tr>
      <th>あなたが…なら</th>
      <th>選ぶべきは</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>すでに Claude Pro を使っている会社のソロ PM で、昼食前にプロトタイプが必要</td>
      <td><strong>Claude Design。</strong>月額 20 ドルはサンクコスト。インターフェースは本当に速い。</td>
      </tr>
      <tr>
      <td>Anthropic がすでに調達を通っているエンタープライズのデザインチーム</td>
      <td><strong>Claude Design。</strong>統合コストは一度払った。使い倒そう。</td>
      </tr>
      <tr>
      <td>「無料の Claude Design」が欲しいソロデザイナー</td>
      <td><strong>Open Design。</strong>無料で、ワークフローを借りるのではなく所有できる——すでに支払っているモデルに向けて設定すれば、最初のデッキはおよそ 10 分。</td>
      </tr>
      <tr>
      <td>すでにターミナルから Claude Code、Codex、Cursor を動かしているデザインエンジニア</td>
      <td><strong>Open Design。</strong>あなたのエージェントがデザインエンジン。スキルレイヤーは新しいアプリなしにセンスと構造を加えます。</td>
      </tr>
      <tr>
      <td>BYOK、プロジェクト途中でのモデル切り替え、機密ブリーフのためのローカル専用が必要な人</td>
      <td><strong>Open Design。</strong><a href="/blog/byok-reality-check-5-things-that-break/">現実はマーケティングより荒削り</a>ですが、実際に守られる契約はこれだけです。</td>
      </tr>
      <tr>
      <td>プロジェクトが採用できる新しいデザインスキルを出したいオープンソースの貢献者</td>
      <td><strong>Open Design。</strong>フォルダを置き、デーモンを再起動し、PR を送る。</td>
      </tr>
      <tr>
      <td>ツールの入れ替わりを生き延びるポータブルなデザインシステムで標準化するチーム</td>
      <td><strong>Open Design。</strong><code>DESIGN.md</code> ファイルは、それを読むツールより長生きします。</td>
      </tr>
      </tbody>
      </table>
      <p>ほとんどのチームにとって決め手になる軸は、品質ではありません。ワークフローを借りたいか、それとも所有したいか、です。</p>
      <h2>次にすべきこと</h2>
      <p>Pro サブスクリプションにお金を使う前に、ワークフローを所有するとはどういう感覚かを見てみたいなら、3 コマンドのクイックスタートを実行し、すでに支払っているモデルに向けて設定してみてください。すべてが 1 つのリポジトリに収まっていて、最初のデッキはおよそ 10 分です。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">オープンソースのワークフローを試す</a>。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ私たちは Open Design を製品ではなくスキルレイヤーとして作ったのか</a>——「製品ではなくレイヤー」という賭けの背後にある、より長いマニフェスト</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー——自分のキーで Claude、Codex、Qwen を動かす</a>——自分のモデルを選ぶことの背後にあるコスト計算</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK の現実チェック——壊れる 5 つのこと</a>——オープンな道が今日実際に壊すもの、そしてその回避策</li>
      </ul>
  ko:
    title: "Claude Design의 오픈소스 대안"
    summary: "Claude Design은 훌륭합니다. 동시에 클로즈드 소스이고, 호스팅 전용이며, Claude 구독에 묶여 있습니다. 언제 그것을 선택해야 하는지 — 그리고 언제 오픈소스 경로가 이기는지에 대한 솔직한 분석입니다."
    bodyHtml: |
      <p>Claude Design은 훌륭합니다. 우리는 실제 브리프에서 이를 사용해 봤습니다. 우리가 대신 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">오픈소스 레이어를 만든</a> 것은 Anthropic이 나쁜 도구를 내놓았기 때문이 아닙니다 — 그렇지 않았습니다. 클로즈드 소스에 호스팅 전용이고 월 $20에서 $200에 이르는 디자인 도구가 앞으로 10년의 디자인 작업에 맞지 않는 형태이기 때문입니다. 이 글은 같은 카테고리에서 제품을 출시하는 팀이 보는 Claude Design에 대한 솔직한 분석입니다. 그것이 무엇인지, 어디에서 당신을 묶어 두는지, 오픈소스 대안이 실제로 어떤 모습인지, 그리고 이번 분기에 어느 쪽을 선택해야 하는지.</p>
      <h2>Claude Design은 실제로 무엇인가</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a>은 2026년 4월 Anthropic Labs에서 출시되었습니다. Claude Opus 4.7로 구동되는 대화형 디자인 도구로, 왼쪽에 채팅, 오른쪽에 캔버스가 있습니다. 원하는 것을 설명하면 Claude가 디자인을 생성하고, 코멘트, 인라인 편집, 프롬프트 개선을 통해 반복합니다.</p>
      <p>네 가지를 잘합니다:</p>
      <ul>
      <li><strong>산문에서 프로토타입을.</strong> 온보딩 플로우, 설정 페이지, 관리자 패널, 결제 변형 — 프롬프트에서 인터랙티브 화면까지 5분.</li>
      <li><strong>코드베이스 인식.</strong> GitHub 저장소를 가져오거나 로컬 디렉터리를 첨부하면 프로토타입이 실제 컴포넌트, 토큰 시스템, 컨벤션을 사용합니다.</li>
      <li><strong>브랜드 통합.</strong> 디자인 시스템을 한 번 설정하면 모든 프로젝트가 자동으로 색상, 타이포그래피, 컴포넌트 패턴을 가져옵니다.</li>
      <li><strong>Claude Code로의 핸드오프.</strong> "이것을 빌드하기" 버튼이 동일한 브라우저 탭에서 프로토타입을 프로덕션 준비 코드로 만듭니다.</li>
      </ul>
      <p>내보내기에는 Canva, PDF, PPTX, HTML, 독립형 URL이 포함됩니다. 가격은 번들로 제공됩니다 — Claude Pro는 $20, Max는 $100–$200, Enterprise는 일반적인 문의 티어입니다. 현재는 유료 Claude 구독자를 위한 리서치 프리뷰입니다.</p>
      <p><a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">공식 튜토리얼</a>을 읽어 보면, Anthropic이 설명하는 워크플로는 Open Design이 제공하는 것과 동일합니다: 브리프, 방향, 산출물, 핸드오프. 차이는 한 레이어 아래에 있습니다.</p>
      <h2>어디에서 당신을 묶어 두는가</h2>
      <p>Claude Design은 미리 짚어 둘 가치가 있는 네 가지 락인 요소를 안고 있습니다. 마케팅 페이지가 말해 주지 않기 때문입니다.</p>
      <p><strong>모델이 고정되어 있습니다.</strong> 모든 렌더링은 Claude를 거칩니다. Claude <em>또는</em> 당신이 이미 비용을 지불한 모델이 아니라 — 오직 Claude입니다. 당신의 팀이 GPT, Gemini, DeepSeek와 계약을 맺고 있거나, 민감한 브리프를 위해 Ollama로 자체 호스팅한다면, 그러한 워크플로는 옮겨지지 않습니다. 토큰 비용은 영원히 Anthropic의 가격 곡선을 따릅니다.</p>
      <p><strong>런타임이 호스팅됩니다.</strong> 당신의 프롬프트, 디자인 시스템, 코드베이스 컨텍스트가 모두 Anthropic의 서버로 이동합니다. 에이전시 작업이나 NDA 하의 출시 전 크리에이티브의 경우, 매번 조달 협의가 됩니다. 자체 호스팅은 리서치 프리뷰에서는 선택지가 아니며, 발표에서도 이를 약속하지 않습니다.</p>
      <p><strong>스킬이 당신의 것이 아닙니다.</strong> Claude Design의 동작은 Anthropic 내부에 있는 프롬프트와 도구로 정의됩니다. 당신은 그것을 포크하거나, 감사하거나, 하나를 교체할 수 없습니다. Anthropic이 Claude Skills에서 제공하는 "스킬"은 인접하지만 별개입니다. 디자인 특화 도구는 내부에 있습니다.</p>
      <p><strong>청구서가 구독입니다.</strong> 좌석당 월 $20–$200는 단독 디자이너에게는 괜찮고, 스무 명 규모의 팀에게는 부담스러우며, 그렇지 않았다면 동일한 워크플로를 채택했을 십수 명의 오픈소스 기여자에게는 시작조차 불가능합니다.</p>
      <p>이들 중 어느 것도 Claude Design의 버그가 아닙니다. 그것은 호스팅 제품의 형태입니다. Anthropic은 중간값 Pro 구독자에 맞춰 최적화했습니다. 우리는 중간값 Pro 구독자가 아닙니다.</p>
      <figure>
      <img src="/blog/plate-19-hosted-cloud.png" alt="작은 지면 앵커와 서버 블록에 점선으로 묶여 있는 검은 다면체 구름 입체, 따뜻한 편집풍 스터디 플레이트 위에" />
      <figcaption>기본적으로 호스팅됨: 당신의 프롬프트, 디자인 시스템, 코드베이스 컨텍스트가 다른 누군가의 서버로 이동합니다.</figcaption>
      </figure>
      <h2>오픈소스 대안</h2>
      <p><strong>Open Design</strong>(이 사이트)은 다른 베팅입니다. Claude Design 클론이 아닙니다 — 이미 사용하고 있는 코딩 에이전트를 디자인 엔진으로 바꾸는 얇은 스킬 레이어입니다. 네 가지 프리미티브는 <a href="/blog/31-skills-72-systems-how-the-library-works/">스킬, 시스템, 어댑터, 그리고 데몬</a>입니다. 모든 스킬은 <code>SKILL.md</code> 파일입니다. 모든 디자인 시스템은 <code>DESIGN.md</code> 파일입니다. 모든 에이전트 어댑터는 약 80줄의 TypeScript입니다.</p>
      <p>오늘 기본 제공되는 것:</p>
      <ul>
      <li><strong>123 skills</strong> — 덱 생성기, 모바일 목업, 편집풍 페이지, Word/Excel/PPT, 브랜드 탐색</li>
      <li><strong>148 design systems</strong> — Linear, Vercel, Stripe, Apple, Cursor, Figma의 이식 가능한 Markdown 버전, 그리고 긴 꼬리</li>
      <li><strong>당신의 <code>$PATH</code>에서 자동 감지되는 16개 코딩 에이전트 CLI</strong> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>4단계 고정 워크플로</strong> — 질문 양식 → 방향 선택기 → 라이브 플랜 스트림 → 샌드박스 iframe 프리뷰</li>
      <li><strong>기본값 BYOK</strong> — OpenAI 호환 <code>base_url</code>과 키를 붙여넣으면, <a href="/blog/byok-design-workflow-claude-codex-qwen/">당신의 토큰이 곧장 제공자에게 전달됩니다</a></li>
      <li><strong>Apache-2.0, 가입 불필요, <code>pnpm tools-dev</code>로 실행</strong></li>
      </ul>
      <p>멘탈 모델: Claude Design은 제품입니다. Open Design은 레이어입니다.</p>
      <figure>
      <img src="/blog/plate-20-model-lock.png" alt="측정된 베이스라인 위의 세 개의 검은 다면체, 하나만 브래킷 프레임에 끼워져 있고 나머지는 느슨하게 놓여 있는, 따뜻한 편집풍 스터디 플레이트 위에" />
      <figcaption>Claude Design은 모델을 고정합니다. 오픈 경로는 이미 비용을 지불하고 있는 모델을 가져올 수 있게 합니다.</figcaption>
      </figure>
      <h2>나란히 비교</h2>
      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>라이선스</td>
      <td>독점</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>런타임</td>
      <td>호스팅 (Anthropic)</td>
      <td>로컬 데몬 (<code>pnpm tools-dev</code>) + 선택적 Vercel 배포</td>
      </tr>
      <tr>
      <td>모델</td>
      <td>Claude 전용</td>
      <td>모든 OpenAI 호환 엔드포인트 + 감지된 16개 CLI</td>
      </tr>
      <tr>
      <td>스킬</td>
      <td>내부</td>
      <td>포크 가능한 123개 <code>SKILL.md</code> 폴더</td>
      </tr>
      <tr>
      <td>디자인 시스템</td>
      <td>프로젝트별 브랜드 설정</td>
      <td>이식 가능한 148개 <code>DESIGN.md</code> 파일</td>
      </tr>
      <tr>
      <td>코드베이스 컨텍스트</td>
      <td>GitHub 가져오기 + 로컬</td>
      <td>스킬 수준, 실제 작업 디렉터리</td>
      </tr>
      <tr>
      <td>가격</td>
      <td>$20 / $100 / $200 / Enterprise</td>
      <td>무료; 모델 제공자에게 직접 지불</td>
      </tr>
      <tr>
      <td>핸드오프</td>
      <td>Claude Code (앱 내)</td>
      <td><code>$PATH</code>상의 모든 에이전트, 그리고 HTML / PDF / PPTX / ZIP 내보내기</td>
      </tr>
      <tr>
      <td>자체 호스팅 가능</td>
      <td>아니오</td>
      <td>예 (노트북 또는 Vercel)</td>
      </tr>
      <tr>
      <td>데이터 경로</td>
      <td>프롬프트 → Anthropic</td>
      <td>프롬프트 → 당신이 선택한 제공자; 우리를 거치는 것은 없음</td>
      </tr>
      </tbody>
      </table>
      <p>솔직한 요약: Claude Design은 가장 다듬어진 단일 제품 경험을 가지고 있습니다. Open Design은 다듬어진 단일 제품 표면을 라이브러리와 맞바꿉니다 — 더 많은 스킬, 더 많은 시스템, 더 많은 에이전트, 이미 노트북에 있는 에이전트와 조합되도록 설계되었습니다.</p>
      <figure>
      <img src="/blog/plate-21-layer-stack.png" alt="아이소메트릭으로 레이어 스택처럼 보이는 간격을 두고 쌓인 세 개의 얇은 검은 판, 간격을 표시하는 치수 눈금, 맨 위에 올리브 잎, 따뜻한 편집풍 스터디 플레이트 위에" />
      <figcaption>제품과 레이어 — Open Design은 당신의 에이전트와 디자인 작업 사이에 자리합니다.</figcaption>
      </figure>
      <h2>누가 무엇을 선택해야 하는가</h2>
      <table>
      <thead>
      <tr>
      <th>당신이…라면</th>
      <th>선택</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>이미 Claude Pro를 쓰는 회사에서 점심 전에 프로토타입이 필요한 단독 PM</td>
      <td><strong>Claude Design.</strong> 월 $20는 이미 매몰비용이고, 인터페이스는 정말로 빠릅니다.</td>
      </tr>
      <tr>
      <td>Anthropic이 이미 조달을 통과한 엔터프라이즈 디자인 팀</td>
      <td><strong>Claude Design.</strong> 통합 비용을 한 번 지불했으니, 그것을 활용하세요.</td>
      </tr>
      <tr>
      <td>"무료 Claude Design"을 원하는 단독 디자이너</td>
      <td><strong>Open Design.</strong> 무료이며, 워크플로를 임대하는 대신 소유합니다 — 이미 비용을 지불하는 모델을 가리키면 첫 덱은 약 10분이 걸립니다.</td>
      </tr>
      <tr>
      <td>이미 터미널에서 Claude Code, Codex, Cursor를 구동하는 디자인 엔지니어</td>
      <td><strong>Open Design.</strong> 당신의 에이전트가 디자인 엔진입니다. 스킬 레이어가 새 앱 없이 안목과 구조를 더합니다.</td>
      </tr>
      <tr>
      <td>BYOK, 프로젝트 중간의 모델 선택, 또는 민감한 브리프를 위한 로컬 전용이 필요한 누구든</td>
      <td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">현실은 마케팅보다 거칠지만</a>, 실제로 지켜지는 유일한 계약입니다.</td>
      </tr>
      <tr>
      <td>프로젝트가 채택할 수 있는 새 디자인 스킬을 출시하고 싶은 오픈소스 기여자</td>
      <td><strong>Open Design.</strong> 폴더를 넣고, 데몬을 재시작하고, PR을 보내세요.</td>
      </tr>
      <tr>
      <td>도구 교체에서 살아남는 이식 가능한 디자인 시스템으로 표준화하려는 팀</td>
      <td><strong>Open Design.</strong> <code>DESIGN.md</code> 파일은 그것을 읽는 도구보다 오래 갑니다.</td>
      </tr>
      </tbody>
      </table>
      <p>대부분의 팀에게 결정을 좌우하는 차원은 품질이 아닙니다. 워크플로를 임대할 것인지 소유할 것인지입니다.</p>
      <h2>다음에 할 일</h2>
      <p>Pro 구독에 돈을 쓰기 전에 워크플로를 소유하는 느낌이 어떤지 보고 싶다면, 세 줄짜리 퀵스타트를 실행하고 이미 비용을 지불하는 모델을 가리키세요. 전체가 하나의 저장소에 들어 있고 첫 덱은 약 10분이 걸립니다.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">오픈소스 워크플로 시도하기</a>.</p>
      <h2>관련 읽을거리</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아닌 스킬 레이어로 만든 이유</a> — "레이어, 제품 아님" 베팅 뒤에 있는 더 긴 선언문</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 디자인 워크플로 — 자신의 키로 Claude, Codex, Qwen 실행하기</a> — 자신의 모델을 고르는 것 뒤에 있는 비용 계산</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK 현실 점검 — 깨지는 다섯 가지</a> — 오픈 경로가 오늘 실제로 깨뜨리는 것, 그리고 우회법</li>
      </ul>
  de:
    title: "Die Open-Source-Alternative zu Claude Design"
    summary: "Claude Design ist gut. Es ist außerdem Closed-Source, nur gehostet verfügbar und an ein Claude-Abonnement gekoppelt. Hier die ehrliche Einschätzung, wann man es wählen sollte – und wann der Open-Source-Weg gewinnt."
    bodyHtml: |
      <p>Claude Design ist gut. Wir haben es an echten Briefings eingesetzt. Dass wir stattdessen <a href="/blog/why-we-built-open-design-as-a-skill-layer/">eine Open-Source-Schicht gebaut haben</a>, liegt nicht daran, dass Anthropic ein schlechtes Werkzeug ausgeliefert hätte – das haben sie nicht. Es liegt daran, dass Closed-Source-, nur gehostete, 20-bis-200-Dollar-pro-Monat-Design-Tools die falsche Form für das nächste Jahrzehnt der Designarbeit sind. Dieser Beitrag ist die ehrliche Einschätzung von Claude Design aus Sicht eines Teams, das in derselben Kategorie ausliefert: was es ist, wo es dich bindet, wie die Open-Source-Alternative tatsächlich aussieht und für welche du dich dieses Quartal entscheiden solltest.</p>
      <h2>Was Claude Design wirklich ist</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> ging im April 2026 aus Anthropic Labs hervor. Es ist ein dialogbasiertes Design-Tool, angetrieben von Claude Opus 4.7: Chat links, Canvas rechts. Du beschreibst, was du willst, Claude generiert ein Design, und du iterierst über Kommentare, Inline-Bearbeitungen und Prompt-Verfeinerungen.</p>
      <p>Es macht vier Dinge gut:</p>
      <ul>
      <li><strong>Prototypen aus Prosa.</strong> Onboarding-Flows, Einstellungsseiten, Admin-Panels, Checkout-Varianten – fünf Minuten vom Prompt zum interaktiven Screen.</li>
      <li><strong>Codebasis-Bewusstsein.</strong> Importiere ein GitHub-Repo oder hänge ein lokales Verzeichnis an, und die Prototypen verwenden deine echten Komponenten, dein Token-System, deine Konventionen.</li>
      <li><strong>Markenintegration.</strong> Richte ein Designsystem einmal ein, und jedes Projekt übernimmt automatisch die Farben, Typografie und Komponentenmuster.</li>
      <li><strong>Übergabe an Claude Code.</strong> Der „Build this“-Button bringt den Prototyp in produktionsreifen Code – im selben Browser-Tab.</li>
      </ul>
      <p>Exporte umfassen Canva, PDF, PPTX, HTML und eigenständige URLs. Die Preisgestaltung ist gebündelt – Claude Pro für 20 $, Max für 100–200 $, Enterprise im üblichen „Ruf uns an“-Tarif. Derzeit ist es eine Research-Preview für zahlende Claude-Abonnenten.</p>
      <p>Wenn du <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">das offizielle Tutorial</a> liest, ist der Workflow, den Anthropic beschreibt, derselbe, den Open Design ausliefert: ein Briefing, eine Richtung, ein Artefakt, eine Übergabe. Die Unterschiede liegen eine Ebene tiefer.</p>
      <h2>Wo es dich bindet</h2>
      <p>Claude Design bringt vier Arten von Lock-in mit sich, die es wert sind, vorab benannt zu werden, weil die Marketingseiten es nicht tun.</p>
      <p><strong>Das Modell ist fest.</strong> Jedes Rendering läuft über Claude. Nicht Claude <em>oder</em> ein Modell, für das du bereits bezahlt hast – nur Claude. Wenn dein Team einen Vertrag mit GPT, Gemini oder DeepSeek hat oder wenn du für sensible Briefings auf Ollama selbst hostest, lassen sich diese Workflows nicht übertragen. Die Token-Kosten richten sich für immer nach Anthropics Preiskurve.</p>
      <p><strong>Die Laufzeitumgebung ist gehostet.</strong> Deine Prompts, dein Designsystem und dein Codebasis-Kontext wandern allesamt auf Anthropics Server. Für Agenturarbeit oder kreatives Material vor dem Launch unter NDA bedeutet das jedes Mal ein Beschaffungsgespräch. Self-Hosting ist in der Research-Preview keine Option, und die Ankündigung verpflichtet sich auch nicht zu einer.</p>
      <p><strong>Die Skills gehören nicht dir.</strong> Das Verhalten von Claude Design wird durch Prompts und Tools definiert, die innerhalb von Anthropic leben. Du kannst sie nicht forken, auditieren oder eines davon ersetzen. Die „Skills“, die Anthropic in Claude Skills ausliefert, sind benachbart, aber getrennt; das designspezifische Tooling ist intern.</p>
      <p><strong>Die Rechnung ist ein Abonnement.</strong> 20–200 $/Monat pro Platz ist in Ordnung für eine Solo-Designerin, schmerzhaft für ein Team von zwanzig und ein No-Go für das Dutzend Open-Source-Beitragender, die andernfalls denselben Workflow aufgreifen würden.</p>
      <p>Nichts davon sind Bugs in Claude Design. Es ist die Form eines gehosteten Produkts. Anthropic hat für den durchschnittlichen Pro-Abonnenten optimiert. Wir sind nicht der durchschnittliche Pro-Abonnent.</p>
      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Ein schwarzer facettierter Wolkenkörper, der über eine gestrichelte Linie an einem kleinen Bodenanker und Serverblock befestigt ist, auf einer warmen, redaktionellen Studienplatte" />
        <figcaption>Standardmäßig gehostet: Deine Prompts, dein Designsystem und dein Codebasis-Kontext wandern auf die Server von jemand anderem.</figcaption>
      </figure>
      <h2>Die Open-Source-Alternative</h2>
      <p><strong>Open Design</strong> (diese Seite) ist eine andere Wette. Es ist kein Claude-Design-Klon – es ist eine dünne Skill-Schicht, die den Coding-Agenten, den du ohnehin schon nutzt, in eine Design-Engine verwandelt. Die vier Primitive sind <a href="/blog/31-skills-72-systems-how-the-library-works/">Skills, Systems, Adapter und der Daemon</a>. Jeder Skill ist eine <code>SKILL.md</code>-Datei. Jedes Designsystem ist eine <code>DESIGN.md</code>-Datei. Jeder Agent-Adapter ist ~80 Zeilen TypeScript.</p>
      <p>Was heute ab Werk dabei ist:</p>
      <ul>
      <li><strong>123 skills</strong> – Deck-Generatoren, Mobile-Mockups, redaktionelle Seiten, Word/Excel/PPT, Markenexplorationen</li>
      <li><strong>148 design systems</strong> – portable Markdown-Versionen von Linear, Vercel, Stripe, Apple, Cursor, Figma, plus ein langer Schweif</li>
      <li><strong>16 automatisch erkannte Coding-Agent-CLIs</strong> in deinem <code>$PATH</code> – Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Vierstufiger, festgelegter Workflow</strong> – Fragebogen → Richtungsauswahl → Live-Plan-Stream → sandboxed iframe-Vorschau</li>
      <li><strong>BYOK standardmäßig</strong> – füge eine beliebige OpenAI-kompatible <code>base_url</code> und einen Key ein, <a href="/blog/byok-design-workflow-claude-codex-qwen/">deine Tokens gehen direkt an den Anbieter</a></li>
      <li><strong>Apache-2.0, keine Anmeldung, läuft mit <code>pnpm tools-dev</code></strong></li>
      </ul>
      <p>Das mentale Modell: Claude Design ist ein Produkt. Open Design ist eine Schicht.</p>
      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Drei schwarze facettierte Polyeder auf einer abgemessenen Grundlinie, nur eines in einen Halterungsrahmen eingesetzt, während die anderen lose liegen, auf einer warmen, redaktionellen Studienplatte" />
        <figcaption>Claude Design legt das Modell fest. Der offene Weg lässt dich das mitbringen, für das du ohnehin schon bezahlst.</figcaption>
      </figure>
      <h2>Im direkten Vergleich</h2>
      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Lizenz</td><td>Proprietär</td><td>Apache-2.0</td></tr>
      <tr><td>Laufzeitumgebung</td><td>Gehostet (Anthropic)</td><td>Lokaler Daemon (<code>pnpm tools-dev</code>) + optionales Vercel-Deployment</td></tr>
      <tr><td>Modelle</td><td>Nur Claude</td><td>Jeder OpenAI-kompatible Endpunkt + 16 erkannte CLIs</td></tr>
      <tr><td>Skills</td><td>Intern</td><td>123 forkbare <code>SKILL.md</code>-Ordner</td></tr>
      <tr><td>Designsysteme</td><td>Markeneinrichtung pro Projekt</td><td>148 portable <code>DESIGN.md</code>-Dateien</td></tr>
      <tr><td>Codebasis-Kontext</td><td>GitHub-Import + lokal</td><td>Auf Skill-Ebene, echtes Arbeitsverzeichnis</td></tr>
      <tr><td>Preisgestaltung</td><td>20 $ / 100 $ / 200 $ / Enterprise</td><td>Kostenlos; du zahlst deinen Modellanbieter direkt</td></tr>
      <tr><td>Übergabe</td><td>Claude Code (in-app)</td><td>Jeder Agent im <code>$PATH</code>, plus HTML- / PDF- / PPTX- / ZIP-Exporte</td></tr>
      <tr><td>Selbst hostbar</td><td>Nein</td><td>Ja (Laptop oder Vercel)</td></tr>
      <tr><td>Datenpfad</td><td>Prompts → Anthropic</td><td>Prompts → dein gewählter Anbieter; nichts durch uns</td></tr>
      </tbody>
      </table>
      <p>Die ehrliche Zusammenfassung: Claude Design bietet die ausgefeilteste Einzelprodukt-Erfahrung. Open Design tauscht die ausgefeilte Einzelprodukt-Oberfläche gegen eine Bibliothek – mehr Skills, mehr Systeme, mehr Agenten, darauf ausgelegt, sich mit dem Agenten zu kombinieren, der bereits auf deinem Laptop ist.</p>
      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Drei dünne schwarze Platten mit sichtbaren Lücken übereinandergestapelt wie ein Schichtstapel in isometrischer Darstellung, Maßstriche markieren die Lücken, ein Olivenblatt obenauf, auf einer warmen, redaktionellen Studienplatte" />
        <figcaption>Ein Produkt und eine Schicht – Open Design sitzt zwischen deinem Agenten und der Designarbeit.</figcaption>
      </figure>
      <h2>Wer was wählen sollte</h2>
      <table>
      <thead>
      <tr><th>Wenn du … bist</th><th>Wähle</th></tr>
      </thead>
      <tbody>
      <tr><td>Eine Solo-PM in einem Unternehmen, das bereits auf Claude Pro ist und vor dem Mittagessen einen Prototyp braucht</td><td><strong>Claude Design.</strong> Die 20 $/Monat sind versenkt; die Oberfläche ist wirklich schnell.</td></tr>
      <tr><td>Ein Enterprise-Designteam, bei dem Anthropic die Beschaffung bereits durchlaufen hat</td><td><strong>Claude Design.</strong> Du hast die Integrationskosten einmal bezahlt; nutze sie.</td></tr>
      <tr><td>Eine Solo-Designerin, die „Claude Design, aber kostenlos“ will</td><td><strong>Open Design.</strong> Kostenlos, und du besitzt den Workflow, statt ihn zu mieten – richte ihn auf ein Modell aus, für das du ohnehin schon bezahlst, und das erste Deck dauert etwa zehn Minuten.</td></tr>
      <tr><td>Ein Design-Engineer, der bereits Claude Code, Codex oder Cursor vom Terminal aus steuert</td><td><strong>Open Design.</strong> Dein Agent ist die Design-Engine; die Skill-Schicht ergänzt Geschmack und Struktur ohne eine neue App.</td></tr>
      <tr><td>Jeder, der BYOK, Modellwahl mitten im Projekt oder rein lokales Arbeiten für sensible Briefings braucht</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Die Realität ist rauer als das Marketing</a>, aber der Vertrag ist der einzige, der tatsächlich hält.</td></tr>
      <tr><td>Ein Open-Source-Beitragender, der einen neuen Design-Skill ausliefern will, den das Projekt übernehmen kann</td><td><strong>Open Design.</strong> Leg einen Ordner ab, starte den Daemon neu, schick den PR.</td></tr>
      <tr><td>Ein Team, das sich auf ein portables Designsystem standardisiert, das den Tool-Wechsel überdauert</td><td><strong>Open Design.</strong> <code>DESIGN.md</code>-Dateien überleben das Tool, das sie liest.</td></tr>
      </tbody>
      </table>
      <p>Die Dimension, die es für die meisten Teams entscheidet, ist nicht die Qualität. Es ist die Frage, ob du den Workflow lieber mieten oder besitzen möchtest.</p>
      <h2>Was als Nächstes zu tun ist</h2>
      <p>Wenn du erleben willst, wie es sich anfühlt, den Workflow zu besitzen, bevor du ein Pro-Abonnement ausgibst, führe den Drei-Befehle-Schnellstart aus und richte ihn auf das Modell aus, für das du ohnehin schon bezahlst. Das Ganze lebt in einem einzigen Repo, und das erste Deck dauert etwa zehn Minuten.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Probier den Open-Source-Workflow aus</a>.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Schicht gebaut haben, nicht als Produkt</a> – das längere Manifest hinter der „Schicht, nicht Produkt“-Wette</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-Design-Workflow – Claude, Codex oder Qwen mit deinem eigenen Key betreiben</a> – die Kostenrechnung hinter der Wahl deines eigenen Modells</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK-Realitätscheck – fünf Dinge, die kaputtgehen</a> – was der offene Weg heute tatsächlich kaputt macht und die Workarounds dazu</li>
      </ul>
  fr:
    title: "L'alternative open source à Claude Design"
    summary: "Claude Design est un bon outil. Il est aussi propriétaire, uniquement hébergé et couplé à un abonnement Claude. Voici un avis honnête sur les cas où il faut le choisir — et ceux où la voie open source l'emporte."
    bodyHtml: |
      <p>Claude Design est un bon outil. Nous l'avons utilisé sur de vrais briefs. Le fait que nous ayons <a href="/blog/why-we-built-open-design-as-a-skill-layer/">construit une couche open source</a> à la place ne tient pas au fait qu'Anthropic aurait livré un mauvais outil — ce n'est pas le cas. C'est parce qu'un outillage de design propriétaire, uniquement hébergé et facturé de 20 à 200 dollars par mois n'est pas la bonne forme pour la prochaine décennie du travail de design. Cet article est l'avis honnête sur Claude Design, rédigé par une équipe qui livre dans la même catégorie : ce qu'il est, là où il vous enferme, à quoi ressemble réellement l'alternative open source, et lequel choisir ce trimestre.</p>

      <h2>Ce qu'est réellement Claude Design</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> est sorti d'Anthropic Labs en avril 2026. C'est un outil de design conversationnel propulsé par Claude Opus 4.7 : la conversation à gauche, le canevas à droite. Vous décrivez ce que vous voulez, Claude génère un design, et vous itérez à travers commentaires, éditions en ligne et affinages de prompts.</p>

      <p>Il fait quatre choses bien :</p>

      <ul>
      <li><strong>Des prototypes à partir de texte.</strong> Parcours d'onboarding, pages de paramètres, panneaux d'administration, variantes de paiement — cinq minutes du prompt à l'écran interactif.</li>
      <li><strong>Conscience de la base de code.</strong> Importez un dépôt GitHub ou rattachez un répertoire local, et les prototypes utilisent vos vrais composants, votre système de tokens, vos conventions.</li>
      <li><strong>Intégration de marque.</strong> Configurez un design system une fois et chaque projet récupère automatiquement les couleurs, la typographie et les motifs de composants.</li>
      <li><strong>Passage à Claude Code.</strong> Le bouton « build this » fait passer le prototype à du code prêt pour la production dans le même onglet de navigateur.</li>
      </ul>

      <p>Les exports comprennent Canva, PDF, PPTX, HTML et des URL autonomes. La tarification est couplée — Claude Pro à 20 $, Max à 100–200 $, Enterprise au tarif habituel sur demande. C'est actuellement une preview de recherche pour les abonnés Claude payants.</p>

      <p>Si vous lisez <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">le tutoriel officiel</a>, le workflow décrit par Anthropic est le même que celui livré par Open Design : un brief, une direction, un artefact, un passage de relais. Les différences se logent un cran plus bas.</p>

      <h2>Là où il vous enferme</h2>

      <p>Claude Design porte quatre formes de verrouillage qui méritent d'être nommées d'emblée, parce que les pages marketing ne le font pas.</p>

      <p><strong>Le modèle est figé.</strong> Chaque rendu passe par Claude. Pas Claude <em>ou</em> un modèle que vous avez déjà payé — juste Claude. Si votre équipe a un contrat avec GPT, Gemini ou DeepSeek, ou si vous auto-hébergez sur Ollama pour des briefs sensibles, ces workflows ne se transposent pas. Le coût en tokens suit pour toujours la courbe de prix d'Anthropic.</p>

      <p><strong>Le runtime est hébergé.</strong> Vos prompts, votre design system et le contexte de votre base de code voyagent tous vers les serveurs d'Anthropic. Pour du travail d'agence ou de la création avant lancement sous NDA, c'est une discussion d'achat à chaque fois. L'auto-hébergement n'est pas une option dans la preview de recherche, et l'annonce ne s'engage pas à en proposer une.</p>

      <p><strong>Les skills ne sont pas les vôtres.</strong> Le comportement de Claude Design est défini par des prompts et des outils qui vivent à l'intérieur d'Anthropic. Vous ne pouvez pas les forker, les auditer ou en remplacer un. Les « skills » qu'Anthropic livre dans Claude Skills sont adjacents mais distincts ; l'outillage spécifique au design est interne.</p>

      <p><strong>La facture est un abonnement.</strong> 20–200 $/mois par siège, c'est correct pour un designer solo, douloureux pour une équipe de vingt, et rédhibitoire pour la douzaine de contributeurs open source qui adopteraient autrement le même workflow.</p>

      <p>Aucun de ces points n'est un bug de Claude Design. C'est la forme d'un produit hébergé. Anthropic a optimisé pour l'abonné Pro médian. Nous ne sommes pas l'abonné Pro médian.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Un solide nuageux noir à facettes relié par une ligne en pointillés à un petit ancrage au sol et un bloc serveur, sur une planche d'étude éditoriale aux tons chauds" />
        <figcaption>Hébergé par défaut : vos prompts, votre design system et le contexte de votre base de code voyagent vers les serveurs de quelqu'un d'autre.</figcaption>
      </figure>

      <h2>L'alternative open source</h2>

      <p><strong>Open Design</strong> (ce site) est un pari différent. Ce n'est pas un clone de Claude Design — c'est une fine couche de skills qui transforme l'agent de codage que vous utilisez déjà en un moteur de design. Les quatre primitives sont <a href="/blog/31-skills-72-systems-how-the-library-works/">les skills, les systems, les adapters et le daemon</a>. Chaque skill est un fichier <code>SKILL.md</code>. Chaque design system est un fichier <code>DESIGN.md</code>. Chaque adaptateur d'agent fait environ 80 lignes de TypeScript.</p>

      <p>Ce qui est livré dans la boîte aujourd'hui :</p>

      <ul>
      <li><strong>123 skills</strong> — générateurs de decks, maquettes mobiles, pages éditoriales, Word/Excel/PPT, explorations de marque</li>
      <li><strong>148 design systems</strong> — versions Markdown portables de Linear, Vercel, Stripe, Apple, Cursor, Figma, plus une longue traîne</li>
      <li><strong>16 CLI d'agents de codage détectés automatiquement</strong> sur votre <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Workflow verrouillé en quatre étapes</strong> — formulaire de questions → sélecteur de direction → flux de plan en direct → aperçu en iframe sandboxé</li>
      <li><strong>BYOK par défaut</strong> — collez n'importe quel <code>base_url</code> et clé compatibles OpenAI, <a href="/blog/byok-design-workflow-claude-codex-qwen/">vos tokens vont directement au fournisseur</a></li>
      <li><strong>Apache-2.0, sans inscription, fonctionne avec <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>Le modèle mental : Claude Design est un produit. Open Design est une couche.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Trois polyèdres noirs à facettes sur une ligne de base mesurée, un seul logé dans un cadre à équerre tandis que les autres reposent librement, sur une planche d'étude éditoriale aux tons chauds" />
        <figcaption>Claude Design fige le modèle. La voie ouverte vous laisse apporter celui que vous payez déjà.</figcaption>
      </figure>

      <h2>Comparatif côte à côte</h2>

      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Licence</td><td>Propriétaire</td><td>Apache-2.0</td></tr>
      <tr><td>Runtime</td><td>Hébergé (Anthropic)</td><td>Daemon local (<code>pnpm tools-dev</code>) + déploiement Vercel optionnel</td></tr>
      <tr><td>Modèles</td><td>Claude uniquement</td><td>N'importe quel endpoint compatible OpenAI + 16 CLI détectées</td></tr>
      <tr><td>Skills</td><td>Internes</td><td>123 dossiers <code>SKILL.md</code> forkables</td></tr>
      <tr><td>Design systems</td><td>Configuration de marque par projet</td><td>148 fichiers <code>DESIGN.md</code> portables</td></tr>
      <tr><td>Contexte de la base de code</td><td>Import GitHub + local</td><td>Au niveau du skill, répertoire de travail réel</td></tr>
      <tr><td>Tarification</td><td>20 $ / 100 $ / 200 $ / Enterprise</td><td>Gratuit ; vous payez directement votre fournisseur de modèle</td></tr>
      <tr><td>Passage de relais</td><td>Claude Code (intégré)</td><td>N'importe quel agent sur le <code>$PATH</code>, plus exports HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Auto-hébergeable</td><td>Non</td><td>Oui (ordinateur portable ou Vercel)</td></tr>
      <tr><td>Chemin des données</td><td>Prompts → Anthropic</td><td>Prompts → le fournisseur que vous avez choisi ; rien ne passe par nous</td></tr>
      </tbody>
      </table>

      <p>Le résumé honnête : Claude Design offre l'expérience mono-produit la plus aboutie. Open Design échange cette surface mono-produit soignée contre une bibliothèque — plus de skills, plus de systems, plus d'agents, conçus pour se composer avec l'agent déjà présent sur votre ordinateur portable.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Trois fines dalles noires empilées avec des espaces visibles comme une pile de couches en isométrie, des repères de cote marquant les espaces, une feuille d'olivier au sommet, sur une planche d'étude éditoriale aux tons chauds" />
        <figcaption>Un produit et une couche — Open Design se place entre votre agent et le travail de design.</figcaption>
      </figure>

      <h2>Qui devrait choisir quoi</h2>

      <table>
      <thead>
      <tr><th>Si vous êtes…</th><th>Choisissez</th></tr>
      </thead>
      <tbody>
      <tr><td>Un PM solo dans une entreprise déjà sur Claude Pro qui a besoin d'un prototype avant le déjeuner</td><td><strong>Claude Design.</strong> Les 20 $/mois sont déjà engagés ; l'interface est réellement rapide.</td></tr>
      <tr><td>Une équipe de design en entreprise où Anthropic a déjà passé les achats</td><td><strong>Claude Design.</strong> Vous avez payé le coût d'intégration une fois ; rentabilisez-le.</td></tr>
      <tr><td>Un designer solo qui veut « Claude Design mais gratuit »</td><td><strong>Open Design.</strong> Gratuit, et vous possédez le workflow au lieu de le louer — pointez-le vers un modèle que vous payez déjà et le premier deck prend environ dix minutes.</td></tr>
      <tr><td>Un design engineer qui pilote déjà Claude Code, Codex ou Cursor depuis le terminal</td><td><strong>Open Design.</strong> Votre agent est le moteur de design ; la couche de skills ajoute goût et structure sans nouvelle application.</td></tr>
      <tr><td>Quiconque a besoin de BYOK, de choisir son modèle en cours de projet, ou du local-only pour des briefs sensibles</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">La réalité est plus rugueuse que le marketing</a>, mais le contrat est le seul qui tienne vraiment.</td></tr>
      <tr><td>Un contributeur open source qui veut livrer un nouveau skill de design que le projet peut adopter</td><td><strong>Open Design.</strong> Déposez un dossier, redémarrez le daemon, envoyez la PR.</td></tr>
      <tr><td>Une équipe qui standardise sur un design system portable qui survit au roulement des outils</td><td><strong>Open Design.</strong> Les fichiers <code>DESIGN.md</code> survivent à l'outil qui les lit.</td></tr>
      </tbody>
      </table>

      <p>La dimension qui tranche pour la plupart des équipes n'est pas la qualité. C'est de savoir si vous préférez louer le workflow ou le posséder.</p>

      <h2>Que faire ensuite</h2>

      <p>Si vous voulez sentir ce que c'est de posséder le workflow avant de dépenser pour un abonnement Pro, lancez le démarrage rapide en trois commandes et pointez-le vers le modèle que vous payez déjà. Le tout tient dans un seul dépôt et le premier deck prend environ dix minutes.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Essayez le workflow open source</a>.</p>

      <h2>Lectures associées</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons construit Open Design comme une couche de skills, pas comme un produit</a> — le manifeste plus long derrière le pari « une couche, pas un produit »</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow de design BYOK — faites tourner Claude, Codex ou Qwen sur votre propre clé</a> — le calcul de coût derrière le choix de votre propre modèle</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK, vérification de la réalité — cinq choses qui cassent</a> — ce que la voie ouverte casse réellement aujourd'hui, et les contournements</li>
      </ul>
  ru:
    title: "Открытая альтернатива Claude Design"
    summary: "Claude Design — хороший инструмент. Но он также закрыт, доступен только в облаке и привязан к подписке Claude. Вот честный разбор: когда стоит выбрать его, а когда выигрывает путь с открытым исходным кодом."
    bodyHtml: |
      <p>Claude Design — хороший инструмент. Мы использовали его на реальных задачах. То, что мы <a href="/blog/why-we-built-open-design-as-a-skill-layer/">построили слой с открытым исходным кодом</a> вместо него, объясняется не тем, что Anthropic выпустила плохой инструмент — это не так. Дело в том, что закрытый, только облачный инструмент для дизайна за $20–$200 в месяц имеет неправильную форму для следующего десятилетия дизайнерской работы. Этот пост — честный разбор Claude Design от команды, которая выпускает продукты в той же категории: что это, где он привязывает вас к себе, как на самом деле выглядит альтернатива с открытым исходным кодом и что из этого вам стоит выбрать в этом квартале.</p>

      <h2>Что такое Claude Design на самом деле</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> вышел из Anthropic Labs в апреле 2026 года. Это разговорный инструмент для дизайна на базе Claude Opus 4.7: чат слева, холст справа. Вы описываете, что хотите, Claude генерирует дизайн, и вы дорабатываете его через комментарии, встроенные правки и уточнения промптов.</p>

      <p>Он хорошо делает четыре вещи:</p>

      <ul>
      <li><strong>Прототипы из текста.</strong> Онбординг-флоу, страницы настроек, админ-панели, варианты оформления заказа — пять минут от промпта до интерактивного экрана.</li>
      <li><strong>Понимание кодовой базы.</strong> Импортируйте репозиторий GitHub или подключите локальную директорию — и прототипы будут использовать ваши реальные компоненты, вашу систему токенов, ваши соглашения.</li>
      <li><strong>Интеграция бренда.</strong> Настройте дизайн-систему один раз — и каждый проект автоматически подхватит цвета, типографику и паттерны компонентов.</li>
      <li><strong>Передача в Claude Code.</strong> Кнопка «build this» доводит прототип до готового к продакшену кода в той же вкладке браузера.</li>
      </ul>

      <p>Экспорт включает Canva, PDF, PPTX, HTML и автономные URL. Цена встроена в подписку — Claude Pro за $20, Max за $100–$200, Enterprise по обычному тарифу «свяжитесь с нами». Сейчас это исследовательское превью для платных подписчиков Claude.</p>

      <p>Если вы прочитаете <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">официальное руководство</a>, рабочий процесс, который описывает Anthropic, тот же, что предлагает Open Design: бриф, направление, артефакт, передача. Различия живут одним слоем ниже.</p>

      <h2>Где он привязывает вас к себе</h2>

      <p>Claude Design несёт четыре вида привязки, которые стоит назвать сразу, потому что маркетинговые страницы этого не делают.</p>

      <p><strong>Модель зафиксирована.</strong> Каждый рендер идёт через Claude. Не через Claude <em>или</em> модель, за которую вы уже заплатили, — только через Claude. Если у вашей команды есть контракт с GPT, Gemini или DeepSeek, или если вы разворачиваете Ollama у себя для конфиденциальных брифов, эти процессы не переносятся. Стоимость токенов навсегда привязана к ценовой кривой Anthropic.</p>

      <p><strong>Среда выполнения — облачная.</strong> Ваши промпты, ваша дизайн-система и контекст вашей кодовой базы — всё уходит на серверы Anthropic. Для агентской работы или предрелизного креатива под NDA это каждый раз разговор с отделом закупок. Self-hosted в исследовательском превью недоступен, и анонс не обещает такой вариант.</p>

      <p><strong>Скиллы не ваши.</strong> Поведение Claude Design определяется промптами и инструментами, которые живут внутри Anthropic. Вы не можете их форкнуть, проаудировать или заменить хотя бы один. «Скиллы», которые Anthropic выпускает в Claude Skills, смежны, но отдельны; инструментарий, специфичный для дизайна, внутренний.</p>

      <p><strong>Счёт — это подписка.</strong> $20–$200 в месяц за место — нормально для дизайнера-одиночки, болезненно для команды из двадцати человек и непреодолимо для десятка контрибьюторов с открытым исходным кодом, которые иначе подхватили бы тот же рабочий процесс.</p>

      <p>Ничто из этого не является багами Claude Design. Это форма облачного продукта. Anthropic оптимизировала под среднего подписчика Pro. Мы не средний подписчик Pro.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Чёрное гранёное облако-тело, привязанное пунктирной линией к небольшому наземному якорю и блоку сервера, на тёплой редакторской иллюстрации" />
        <figcaption>Облако по умолчанию: ваши промпты, дизайн-система и контекст кодовой базы уходят на чужие серверы.</figcaption>
      </figure>

      <h2>Альтернатива с открытым исходным кодом</h2>

      <p><strong>Open Design</strong> (этот сайт) — это другая ставка. Это не клон Claude Design — это тонкий слой скиллов, который превращает кодинг-агента, которым вы уже пользуетесь, в дизайн-движок. Четыре примитива — это <a href="/blog/31-skills-72-systems-how-the-library-works/">скиллы, системы, адаптеры и демон</a>. Каждый скилл — это файл <code>SKILL.md</code>. Каждая дизайн-система — это файл <code>DESIGN.md</code>. Каждый адаптер агента — это ~80 строк TypeScript.</p>

      <p>Что входит в комплект сегодня:</p>

      <ul>
      <li><strong>123 skills</strong> — генераторы презентаций, мобильные макеты, редакторские страницы, Word/Excel/PPT, бренд-исследования</li>
      <li><strong>148 design systems</strong> — портативные Markdown-версии Linear, Vercel, Stripe, Apple, Cursor, Figma, плюс длинный хвост</li>
      <li><strong>16 CLI кодинг-агентов, автоматически обнаруживаемых</strong> в вашем <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Четырёхшаговый фиксированный рабочий процесс</strong> — форма вопросов → выбор направления → живой поток плана → превью в изолированном iframe</li>
      <li><strong>BYOK по умолчанию</strong> — вставьте любой совместимый с OpenAI <code>base_url</code> и ключ, <a href="/blog/byok-design-workflow-claude-codex-qwen/">ваши токены идут напрямую к провайдеру</a></li>
      <li><strong>Apache-2.0, без регистрации, запускается через <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>Ментальная модель: Claude Design — это продукт. Open Design — это слой.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Три чёрных гранёных многогранника на размеченной базовой линии, только один вставлен в рамку-держатель, остальные лежат свободно, на тёплой редакторской иллюстрации" />
        <figcaption>Claude Design фиксирует модель. Открытый путь позволяет привести ту, за которую вы уже платите.</figcaption>
      </figure>

      <h2>Сравнение бок о бок</h2>

      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Лицензия</td>
      <td>Проприетарная</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>Среда выполнения</td>
      <td>Облачная (Anthropic)</td>
      <td>Локальный демон (<code>pnpm tools-dev</code>) + опциональный деплой на Vercel</td>
      </tr>
      <tr>
      <td>Модели</td>
      <td>Только Claude</td>
      <td>Любая совместимая с OpenAI конечная точка + 16 обнаруженных CLI</td>
      </tr>
      <tr>
      <td>Скиллы</td>
      <td>Внутренние</td>
      <td>123 форкаемых папки <code>SKILL.md</code></td>
      </tr>
      <tr>
      <td>Дизайн-системы</td>
      <td>Настройка бренда под каждый проект</td>
      <td>148 портативных файлов <code>DESIGN.md</code></td>
      </tr>
      <tr>
      <td>Контекст кодовой базы</td>
      <td>Импорт из GitHub + локально</td>
      <td>На уровне скилла, реальная рабочая директория</td>
      </tr>
      <tr>
      <td>Цена</td>
      <td>$20 / $100 / $200 / Enterprise</td>
      <td>Бесплатно; вы платите своему провайдеру модели напрямую</td>
      </tr>
      <tr>
      <td>Передача</td>
      <td>Claude Code (внутри приложения)</td>
      <td>Любой агент в <code>$PATH</code>, плюс экспорт в HTML / PDF / PPTX / ZIP</td>
      </tr>
      <tr>
      <td>Возможность self-hosting</td>
      <td>Нет</td>
      <td>Да (ноутбук или Vercel)</td>
      </tr>
      <tr>
      <td>Путь данных</td>
      <td>Промпты → Anthropic</td>
      <td>Промпты → выбранный вами провайдер; ничего через нас</td>
      </tr>
      </tbody>
      </table>

      <p>Честное резюме: у Claude Design самый отполированный опыт единого продукта. Open Design меняет отполированную поверхность единого продукта на библиотеку — больше скиллов, больше систем, больше агентов, спроектированных так, чтобы компоноваться с агентом, который уже стоит на вашем ноутбуке.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Три тонкие чёрные плиты, сложенные с видимыми зазорами как стек слоёв в изометрии, размерные риски отмечают зазоры, оливковый лист сверху, на тёплой редакторской иллюстрации" />
        <figcaption>Продукт и слой — Open Design располагается между вашим агентом и дизайнерской работой.</figcaption>
      </figure>

      <h2>Кому что выбрать</h2>

      <table>
      <thead>
      <tr>
      <th>Если вы…</th>
      <th>Выбирайте</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Соло-PM в компании, которая уже на Claude Pro, и вам нужен прототип до обеда</td>
      <td><strong>Claude Design.</strong> $20 в месяц уже потрачены; интерфейс действительно быстрый.</td>
      </tr>
      <tr>
      <td>Корпоративная дизайн-команда, где Anthropic уже прошла процедуру закупок</td>
      <td><strong>Claude Design.</strong> Вы один раз оплатили стоимость интеграции; используйте её.</td>
      </tr>
      <tr>
      <td>Дизайнер-одиночка, которому нужен «Claude Design, но бесплатно»</td>
      <td><strong>Open Design.</strong> Бесплатно, и вы владеете рабочим процессом, а не арендуете его — направьте его на модель, за которую уже платите, и первая презентация займёт около десяти минут.</td>
      </tr>
      <tr>
      <td>Дизайн-инженер, который уже управляет Claude Code, Codex или Cursor из терминала</td>
      <td><strong>Open Design.</strong> Ваш агент — это дизайн-движок; слой скиллов добавляет вкус и структуру без нового приложения.</td>
      </tr>
      <tr>
      <td>Любой, кому нужен BYOK, выбор модели посреди проекта или работа только локально для конфиденциальных брифов</td>
      <td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Реальность грубее маркетинга</a>, но это единственный контракт, который действительно соблюдается.</td>
      </tr>
      <tr>
      <td>Контрибьютор с открытым исходным кодом, который хочет выпустить новый дизайн-скилл, чтобы проект его принял</td>
      <td><strong>Open Design.</strong> Закиньте папку, перезапустите демон, отправьте PR.</td>
      </tr>
      <tr>
      <td>Команда, стандартизирующаяся на портативной дизайн-системе, которая переживёт смену инструментов</td>
      <td><strong>Open Design.</strong> Файлы <code>DESIGN.md</code> переживают инструмент, который их читает.</td>
      </tr>
      </tbody>
      </table>

      <p>Параметр, который решает дело для большинства команд, — это не качество. Это то, что вы предпочтёте: арендовать рабочий процесс или владеть им.</p>

      <h2>Что делать дальше</h2>

      <p>Если вы хотите почувствовать, каково это — владеть рабочим процессом, прежде чем тратиться на подписку Pro, запустите быстрый старт из трёх команд и направьте его на модель, за которую вы уже платите. Всё это живёт в одном репозитории, и первая презентация занимает около десяти минут.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Попробовать рабочий процесс с открытым исходным кодом</a>.</p>

      <h2>Что почитать ещё</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой скиллов, а не как продукт</a> — более развёрнутый манифест за ставкой «слой, а не продукт»</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Рабочий процесс дизайна на BYOK — запускайте Claude, Codex или Qwen на своём ключе</a> — расчёт затрат за выбором собственной модели</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Проверка реальностью BYOK — пять вещей, которые ломаются</a> — что открытый путь действительно ломает сегодня и обходные пути</li>
      </ul>
  es:
    title: "La alternativa de código abierto a Claude Design"
    summary: "Claude Design es bueno. También es de código cerrado, solo alojado y viene incluido con una suscripción a Claude. Aquí tienes una lectura honesta sobre cuándo elegirlo, y cuándo gana el camino de código abierto."
    bodyHtml: |
      <p>Claude Design es bueno. Lo hemos usado en encargos reales. El hecho de que <a href="/blog/why-we-built-open-design-as-a-skill-layer/">hayamos construido una capa de código abierto</a> en su lugar no se debe a que Anthropic haya lanzado una mala herramienta: no lo hicieron. Es porque las herramientas de diseño de código cerrado, solo alojadas y de entre 20 y 200 dólares al mes tienen la forma equivocada para la próxima década del trabajo de diseño. Este artículo es la lectura honesta sobre Claude Design desde un equipo que también lanza productos en la misma categoría: qué es, dónde te ata, cómo se ve realmente la alternativa de código abierto y cuál deberías elegir este trimestre.</p>

      <h2>Qué es realmente Claude Design</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> se lanzó desde Anthropic Labs en abril de 2026. Es una herramienta de diseño conversacional impulsada por Claude Opus 4.7: el chat a la izquierda, el lienzo a la derecha. Describes lo que quieres, Claude genera un diseño y tú iteras mediante comentarios, ediciones en línea y refinamientos de instrucciones.</p>

      <p>Hace cuatro cosas bien:</p>

      <ul>
      <li><strong>Prototipos a partir de texto.</strong> Flujos de incorporación, páginas de configuración, paneles de administración, variantes de pago: cinco minutos desde la instrucción hasta una pantalla interactiva.</li>
      <li><strong>Conocimiento del código base.</strong> Importa un repositorio de GitHub o adjunta un directorio local y los prototipos usarán tus componentes reales, tu sistema de tokens y tus convenciones.</li>
      <li><strong>Integración de marca.</strong> Configura un sistema de diseño una vez y cada proyecto adopta automáticamente los colores, la tipografía y los patrones de componentes.</li>
      <li><strong>Entrega a Claude Code.</strong> El botón «construir esto» lleva el prototipo a código listo para producción en la misma pestaña del navegador.</li>
      </ul>

      <p>Las exportaciones incluyen Canva, PDF, PPTX, HTML y URL independientes. El precio viene incluido: Claude Pro a 20 dólares, Max a 100-200 dólares, Enterprise en el habitual nivel de «llámanos». Actualmente es una vista previa de investigación para suscriptores de pago de Claude.</p>

      <p>Si lees <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">el tutorial oficial</a>, el flujo de trabajo que describe Anthropic es el mismo que ofrece Open Design: un encargo, una dirección, un artefacto, una entrega. Las diferencias están una capa más abajo.</p>

      <h2>Dónde te ata</h2>

      <p>Claude Design conlleva cuatro elementos de dependencia que vale la pena nombrar de entrada, porque las páginas de marketing no lo hacen.</p>

      <p><strong>El modelo es fijo.</strong> Cada renderizado pasa por Claude. No Claude <em>o</em> un modelo que ya hayas pagado: solo Claude. Si tu equipo tiene un contrato con GPT, Gemini o DeepSeek, o si te autoalojas en Ollama para encargos sensibles, esos flujos de trabajo no se traducen. El coste por tokens va siempre atado a la curva de precios de Anthropic.</p>

      <p><strong>El entorno de ejecución está alojado.</strong> Tus instrucciones, tu sistema de diseño y el contexto de tu código base viajan todos a los servidores de Anthropic. Para trabajo de agencia o creatividad previa al lanzamiento bajo NDA, eso supone una conversación de compras cada vez. El autoalojamiento no es una opción en la vista previa de investigación, y el anuncio no se compromete a ofrecerlo.</p>

      <p><strong>Las skills no son tuyas.</strong> El comportamiento de Claude Design se define mediante instrucciones y herramientas que viven dentro de Anthropic. No puedes bifurcarlas, auditarlas ni reemplazar ninguna. Las «skills» que Anthropic está lanzando en Claude Skills son adyacentes pero independientes; las herramientas específicas de diseño son internas.</p>

      <p><strong>La factura es una suscripción.</strong> Entre 20 y 200 dólares al mes por asiento está bien para un diseñador en solitario, resulta doloroso para un equipo de veinte y es inviable para la docena de colaboradores de código abierto que de otro modo adoptarían el mismo flujo de trabajo.</p>

      <p>Ninguno de estos es un fallo de Claude Design. Son la forma de un producto alojado. Anthropic optimizó para el suscriptor Pro medio. Nosotros no somos el suscriptor Pro medio.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Un sólido de nube negra facetada atado por una línea discontinua a un pequeño ancla de suelo y un bloque de servidor, sobre una lámina de estudio editorial cálida" />
        <figcaption>Alojado por defecto: tus instrucciones, tu sistema de diseño y el contexto de tu código base viajan a los servidores de otra persona.</figcaption>
      </figure>

      <h2>La alternativa de código abierto</h2>

      <p><strong>Open Design</strong> (este sitio) es una apuesta diferente. No es un clon de Claude Design: es una fina capa de skills que convierte el agente de codificación que ya usas en un motor de diseño. Las cuatro primitivas son <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, sistemas, adaptadores y el daemon</a>. Cada skill es un archivo <code>SKILL.md</code>. Cada sistema de diseño es un archivo <code>DESIGN.md</code>. Cada adaptador de agente son unas 80 líneas de TypeScript.</p>

      <p>Lo que viene incluido hoy:</p>

      <ul>
      <li><strong>123 skills</strong>: generadores de presentaciones, maquetas móviles, páginas editoriales, Word/Excel/PPT, exploraciones de marca</li>
      <li><strong>148 sistemas de diseño</strong>: versiones portátiles en Markdown de Linear, Vercel, Stripe, Apple, Cursor, Figma, además de una larga cola</li>
      <li><strong>16 CLIs de agentes de codificación detectados automáticamente</strong> en tu <code>$PATH</code>: Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Flujo de trabajo bloqueado de cuatro pasos</strong>: formulario de preguntas → selector de dirección → transmisión del plan en vivo → vista previa en un iframe aislado</li>
      <li><strong>BYOK por defecto</strong>: pega cualquier <code>base_url</code> y clave compatible con OpenAI, <a href="/blog/byok-design-workflow-claude-codex-qwen/">tus tokens van directamente al proveedor</a></li>
      <li><strong>Apache-2.0, sin registro, se ejecuta con <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>El modelo mental: Claude Design es un producto. Open Design es una capa.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Tres poliedros negros facetados sobre una línea base medida, solo uno encajado en un marco de soporte mientras los otros quedan sueltos, sobre una lámina de estudio editorial cálida" />
        <figcaption>Claude Design fija el modelo. El camino abierto te deja traer el que ya pagas.</figcaption>
      </figure>

      <h2>Comparación lado a lado</h2>

      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Licencia</td><td>Propietaria</td><td>Apache-2.0</td></tr>
      <tr><td>Entorno de ejecución</td><td>Alojado (Anthropic)</td><td>Daemon local (<code>pnpm tools-dev</code>) + despliegue opcional en Vercel</td></tr>
      <tr><td>Modelos</td><td>Solo Claude</td><td>Cualquier endpoint compatible con OpenAI + 16 CLIs detectados</td></tr>
      <tr><td>Skills</td><td>Internas</td><td>123 carpetas <code>SKILL.md</code> bifurcables</td></tr>
      <tr><td>Sistemas de diseño</td><td>Configuración de marca por proyecto</td><td>148 archivos <code>DESIGN.md</code> portátiles</td></tr>
      <tr><td>Contexto del código base</td><td>Importación de GitHub + local</td><td>A nivel de skill, directorio de trabajo real</td></tr>
      <tr><td>Precio</td><td>20 $ / 100 $ / 200 $ / Enterprise</td><td>Gratis; pagas directamente a tu proveedor de modelo</td></tr>
      <tr><td>Entrega</td><td>Claude Code (en la app)</td><td>Cualquier agente en <code>$PATH</code>, además de exportaciones HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Autoalojable</td><td>No</td><td>Sí (portátil o Vercel)</td></tr>
      <tr><td>Ruta de datos</td><td>Instrucciones → Anthropic</td><td>Instrucciones → el proveedor que elijas; nada pasa por nosotros</td></tr>
      </tbody>
      </table>

      <p>El resumen honesto: Claude Design tiene la experiencia de producto único más pulida. Open Design cambia esa superficie de producto único pulida por una biblioteca: más skills, más sistemas, más agentes, diseñados para componerse con el agente que ya tienes en tu portátil.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Tres losas negras finas apiladas con huecos visibles como una pila de capas en isométrico, marcas de dimensión señalando los huecos, una hoja de olivo encima, sobre una lámina de estudio editorial cálida" />
        <figcaption>Un producto y una capa: Open Design se sitúa entre tu agente y el trabajo de diseño.</figcaption>
      </figure>

      <h2>Quién debería elegir qué</h2>

      <table>
      <thead>
      <tr><th>Si eres…</th><th>Elige</th></tr>
      </thead>
      <tbody>
      <tr><td>Un PM en solitario en una empresa que ya usa Claude Pro y necesita un prototipo antes del almuerzo</td><td><strong>Claude Design.</strong> Los 20 $/mes son un coste hundido; la interfaz es genuinamente rápida.</td></tr>
      <tr><td>Un equipo de diseño empresarial donde Anthropic ya pasó el proceso de compras</td><td><strong>Claude Design.</strong> Ya pagaste el coste de integración una vez; aprovéchalo.</td></tr>
      <tr><td>Un diseñador en solitario que quiere «Claude Design pero gratis»</td><td><strong>Open Design.</strong> Gratis, y eres dueño del flujo de trabajo en lugar de alquilarlo: apúntalo a un modelo que ya pagas y la primera presentación lleva unos diez minutos.</td></tr>
      <tr><td>Un ingeniero de diseño que ya maneja Claude Code, Codex o Cursor desde la terminal</td><td><strong>Open Design.</strong> Tu agente es el motor de diseño; la capa de skills aporta buen gusto y estructura sin una nueva app.</td></tr>
      <tr><td>Cualquiera que necesite BYOK, elección de modelo a mitad de proyecto, o solo local para encargos sensibles</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">La realidad es más áspera que el marketing</a>, pero el contrato es el único que realmente se sostiene.</td></tr>
      <tr><td>Un colaborador de código abierto que quiere lanzar una nueva skill de diseño que el proyecto pueda adoptar</td><td><strong>Open Design.</strong> Suelta una carpeta, reinicia el daemon, envía el PR.</td></tr>
      <tr><td>Un equipo que estandariza sobre un sistema de diseño portátil que sobreviva al cambio de herramientas</td><td><strong>Open Design.</strong> Los archivos <code>DESIGN.md</code> sobreviven a la herramienta que los lee.</td></tr>
      </tbody>
      </table>

      <p>La dimensión que lo decide para la mayoría de los equipos no es la calidad. Es si prefieres alquilar el flujo de trabajo o ser su dueño.</p>

      <h2>Qué hacer a continuación</h2>

      <p>Si quieres ver cómo se siente ser dueño del flujo de trabajo antes de gastar en una suscripción Pro, ejecuta el inicio rápido de tres comandos y apúntalo al modelo que ya pagas. Todo vive en un solo repositorio y la primera presentación lleva unos diez minutos.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Prueba el flujo de trabajo de código abierto</a>.</p>

      <h2>Lecturas relacionadas</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a>: el manifiesto más extenso detrás de la apuesta «capa, no producto»</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flujo de trabajo de diseño BYOK: ejecuta Claude, Codex o Qwen con tu propia clave</a>: las matemáticas de coste detrás de elegir tu propio modelo</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Comprobación de realidad de BYOK: cinco cosas que se rompen</a>: lo que el camino abierto realmente rompe hoy, y las soluciones alternativas</li>
      </ul>
  pt-br:
    title: "A alternativa de código aberto ao Claude Design"
    summary: "O Claude Design é bom. Ele também é de código fechado, exclusivamente hospedado e atrelado a uma assinatura do Claude. Aqui vai a leitura honesta de quando escolhê-lo — e de quando o caminho de código aberto vence."
    bodyHtml: |
      <p>O Claude Design é bom. Nós o usamos em briefs reais. O fato de termos <a href="/blog/why-we-built-open-design-as-a-skill-layer/">construído uma camada de código aberto</a> não é porque a Anthropic lançou uma ferramenta ruim — não lançou. É porque ferramentas de design fechadas, exclusivamente hospedadas e de US$ 20 a US$ 200 por mês têm o formato errado para a próxima década do trabalho de design. Este post é a leitura honesta do Claude Design feita por um time que entrega na mesma categoria: o que ele é, onde ele te prende, como a alternativa de código aberto realmente se parece e qual delas você deveria escolher neste trimestre.</p>
      <h2>O que o Claude Design realmente é</h2>
      <p>O <a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> foi lançado pelo Anthropic Labs em abril de 2026. É uma ferramenta de design conversacional movida pelo Claude Opus 4.7: chat à esquerda, canvas à direita. Você descreve o que quer, o Claude gera um design, e você itera por meio de comentários, edições in-line e refinamentos de prompt.</p>
      <p>Ele faz quatro coisas bem:</p>
      <ul>
      <li><strong>Protótipos a partir de texto.</strong> Fluxos de onboarding, páginas de configurações, painéis de administração, variações de checkout — cinco minutos do prompt à tela interativa.</li>
      <li><strong>Consciência da base de código.</strong> Importe um repositório do GitHub ou anexe um diretório local e os protótipos usam seus componentes reais, seu sistema de tokens, suas convenções.</li>
      <li><strong>Integração de marca.</strong> Configure um design system uma vez e todo projeto adota automaticamente as cores, a tipografia e os padrões de componentes.</li>
      <li><strong>Entrega para o Claude Code.</strong> O botão "build this" leva o protótipo a código pronto para produção na mesma aba do navegador.</li>
      </ul>
      <p>As exportações incluem Canva, PDF, PPTX, HTML e URLs autônomas. O preço é incluído no pacote — Claude Pro a US$ 20, Max a US$ 100–US$ 200, Enterprise no habitual nível "fale conosco". Atualmente é uma research preview para assinantes pagantes do Claude.</p>
      <p>Se você ler <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">o tutorial oficial</a>, o fluxo de trabalho que a Anthropic descreve é o mesmo que o Open Design entrega: um brief, uma direção, um artefato, uma entrega. As diferenças vivem uma camada abaixo.</p>
      <h2>Onde ele te prende</h2>
      <p>O Claude Design carrega quatro formas de aprisionamento que vale nomear de antemão, porque as páginas de marketing não o fazem.</p>
      <p><strong>O modelo é fixo.</strong> Toda renderização passa pelo Claude. Não pelo Claude <em>ou</em> por um modelo que você já pagou — apenas pelo Claude. Se o seu time tem um contrato com GPT, Gemini ou DeepSeek, ou se você roda em self-host no Ollama para briefs sensíveis, esses fluxos de trabalho não se transferem. O custo de tokens segue para sempre a curva de preços da Anthropic.</p>
      <p><strong>O runtime é hospedado.</strong> Seus prompts, seu design system e o contexto da sua base de código viajam todos para os servidores da Anthropic. Para trabalho de agência ou criação pré-lançamento sob NDA, isso vira uma conversa de procurement toda vez. Self-host não é uma opção na research preview, e o anúncio não se compromete com nenhuma.</p>
      <p><strong>As skills não são suas.</strong> O comportamento do Claude Design é definido por prompts e ferramentas que vivem dentro da Anthropic. Você não pode fazer fork delas, auditá-las nem substituir uma. As "skills" que a Anthropic está lançando no Claude Skills são adjacentes, mas separadas; o ferramental específico de design é interno.</p>
      <p><strong>A conta é uma assinatura.</strong> US$ 20–US$ 200/mês por assento é tranquilo para um designer solo, doloroso para um time de vinte pessoas e inviável para a dúzia de contribuidores de código aberto que, de outra forma, adotariam o mesmo fluxo de trabalho.</p>
      <p>Nenhum desses é um bug no Claude Design. Eles são o formato de um produto hospedado. A Anthropic otimizou para o assinante Pro mediano. Nós não somos o assinante Pro mediano.</p>
      <figure>
      <img src="/blog/plate-19-hosted-cloud.png" alt="Um sólido de nuvem facetada preta amarrado por uma linha tracejada a uma pequena âncora de chão e um bloco de servidor, em uma placa de estudo editorial em tom quente" />
      <figcaption>Hospedado por padrão: seus prompts, design system e contexto da base de código viajam para os servidores de outra pessoa.</figcaption>
      </figure>
      <h2>A alternativa de código aberto</h2>
      <p>O <strong>Open Design</strong> (este site) é uma aposta diferente. Não é um clone do Claude Design — é uma fina camada de skills que transforma o coding agent que você já usa em um motor de design. As quatro primitivas são <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters e o daemon</a>. Cada skill é um arquivo <code>SKILL.md</code>. Cada design system é um arquivo <code>DESIGN.md</code>. Cada adapter de agente tem ~80 linhas de TypeScript.</p>
      <p>O que já vem na caixa hoje:</p>
      <ul>
      <li><strong>123 skills</strong> — geradores de decks, mockups mobile, páginas editoriais, Word/Excel/PPT, explorações de marca</li>
      <li><strong>148 design systems</strong> — versões portáteis em Markdown de Linear, Vercel, Stripe, Apple, Cursor, Figma, além de uma longa cauda</li>
      <li><strong>16 CLIs de coding agent detectados automaticamente</strong> no seu <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Fluxo de trabalho travado em quatro etapas</strong> — formulário de perguntas → seletor de direção → stream de plano ao vivo → preview em iframe em sandbox</li>
      <li><strong>BYOK por padrão</strong> — cole qualquer <code>base_url</code> e chave compatível com OpenAI, <a href="/blog/byok-design-workflow-claude-codex-qwen/">seus tokens vão direto para o provedor</a></li>
      <li><strong>Apache-2.0, sem cadastro, roda com <code>pnpm tools-dev</code></strong></li>
      </ul>
      <p>O modelo mental: o Claude Design é um produto. O Open Design é uma camada.</p>
      <figure>
      <img src="/blog/plate-20-model-lock.png" alt="Três poliedros facetados pretos sobre uma linha de base medida, apenas um encaixado em uma moldura de suporte enquanto os outros estão soltos, em uma placa de estudo editorial em tom quente" />
      <figcaption>O Claude Design fixa o modelo. O caminho aberto deixa você trazer aquele que você já paga.</figcaption>
      </figure>
      <h2>Lado a lado</h2>
      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Licença</td>
      <td>Proprietária</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>Runtime</td>
      <td>Hospedado (Anthropic)</td>
      <td>Daemon local (<code>pnpm tools-dev</code>) + deploy opcional na Vercel</td>
      </tr>
      <tr>
      <td>Modelos</td>
      <td>Apenas Claude</td>
      <td>Qualquer endpoint compatível com OpenAI + 16 CLIs detectadas</td>
      </tr>
      <tr>
      <td>Skills</td>
      <td>Internas</td>
      <td>123 pastas <code>SKILL.md</code> com fork livre</td>
      </tr>
      <tr>
      <td>Design systems</td>
      <td>Configuração de marca por projeto</td>
      <td>148 arquivos <code>DESIGN.md</code> portáteis</td>
      </tr>
      <tr>
      <td>Contexto da base de código</td>
      <td>Importação do GitHub + local</td>
      <td>No nível da skill, diretório de trabalho real</td>
      </tr>
      <tr>
      <td>Preço</td>
      <td>US$ 20 / US$ 100 / US$ 200 / Enterprise</td>
      <td>Grátis; você paga seu provedor de modelo diretamente</td>
      </tr>
      <tr>
      <td>Entrega</td>
      <td>Claude Code (no app)</td>
      <td>Qualquer agente no <code>$PATH</code>, além de exportações em HTML / PDF / PPTX / ZIP</td>
      </tr>
      <tr>
      <td>Self-host</td>
      <td>Não</td>
      <td>Sim (notebook ou Vercel)</td>
      </tr>
      <tr>
      <td>Caminho dos dados</td>
      <td>Prompts → Anthropic</td>
      <td>Prompts → o provedor que você escolher; nada passa por nós</td>
      </tr>
      </tbody>
      </table>
      <p>O resumo honesto: o Claude Design tem a experiência de produto único mais polida. O Open Design troca a superfície polida de produto único por uma biblioteca — mais skills, mais systems, mais agentes, projetada para compor com o agente que já está no seu notebook.</p>
      <figure>
      <img src="/blog/plate-21-layer-stack.png" alt="Três finas lajes pretas empilhadas com lacunas visíveis como uma pilha de camadas em isométrico, marcações de dimensão indicando as lacunas, uma folha de oliveira no topo, em uma placa de estudo editorial em tom quente" />
      <figcaption>Um produto e uma camada — o Open Design fica entre o seu agente e o trabalho de design.</figcaption>
      </figure>
      <h2>Quem deve escolher o quê</h2>
      <table>
      <thead>
      <tr>
      <th>Se você é…</th>
      <th>Escolha</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Um PM solo numa empresa que já usa o Claude Pro e precisa de um protótipo antes do almoço</td>
      <td><strong>Claude Design.</strong> Os US$ 20/mês já são gasto afundado; a interface é genuinamente rápida.</td>
      </tr>
      <tr>
      <td>Um time de design enterprise onde a Anthropic já passou pelo procurement</td>
      <td><strong>Claude Design.</strong> Você já pagou o custo de integração uma vez; use-o.</td>
      </tr>
      <tr>
      <td>Um designer solo que quer "Claude Design, mas de graça"</td>
      <td><strong>Open Design.</strong> Grátis, e você é dono do fluxo de trabalho em vez de alugá-lo — aponte para um modelo que você já paga e o primeiro deck leva cerca de dez minutos.</td>
      </tr>
      <tr>
      <td>Um design engineer que já dirige Claude Code, Codex ou Cursor pelo terminal</td>
      <td><strong>Open Design.</strong> Seu agente é o motor de design; a camada de skills adiciona bom gosto e estrutura sem um novo app.</td>
      </tr>
      <tr>
      <td>Qualquer um que precise de BYOK, escolha de modelo no meio do projeto ou local-only para briefs sensíveis</td>
      <td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">A realidade é mais áspera do que o marketing</a>, mas o contrato é o único que de fato se sustenta.</td>
      </tr>
      <tr>
      <td>Um contribuidor de código aberto que quer entregar uma nova design skill que o projeto possa adotar</td>
      <td><strong>Open Design.</strong> Solte uma pasta, reinicie o daemon, envie o PR.</td>
      </tr>
      <tr>
      <td>Um time que está padronizando em um design system portátil que sobreviva à rotatividade de ferramentas</td>
      <td><strong>Open Design.</strong> Arquivos <code>DESIGN.md</code> sobrevivem à ferramenta que os lê.</td>
      </tr>
      </tbody>
      </table>
      <p>A dimensão que decide isso para a maioria dos times não é qualidade. É se você prefere alugar o fluxo de trabalho ou ser dono dele.</p>
      <h2>O que fazer em seguida</h2>
      <p>Se você quer sentir como é ser dono do fluxo de trabalho antes de gastar uma assinatura Pro, rode o quickstart de três comandos e aponte-o para o modelo que você já paga. Tudo vive em um único repositório e o primeiro deck leva cerca de dez minutos.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Experimente o fluxo de trabalho de código aberto</a>.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não como um produto</a> — o manifesto mais longo por trás da aposta "camada, não produto"</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Fluxo de trabalho de design BYOK — rode Claude, Codex ou Qwen com a sua própria chave</a> — a matemática de custo por trás de escolher seu próprio modelo</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Checagem de realidade do BYOK — cinco coisas que quebram</a> — o que o caminho aberto de fato quebra hoje, e as soluções de contorno</li>
      </ul>
  it:
    title: "L'alternativa open-source a Claude Design"
    summary: "Claude Design è buono. È anche closed-source, solo in hosting e abbinato a un abbonamento Claude. Ecco la valutazione onesta su quando sceglierlo — e quando vince invece la strada open-source."
    bodyHtml: |
      <p>Claude Design è buono. Lo abbiamo usato su brief reali. Il fatto che abbiamo <a href="/blog/why-we-built-open-design-as-a-skill-layer/">costruito uno strato open-source</a> al suo posto non è perché Anthropic abbia rilasciato uno strumento scadente — non è così. È perché un tooling di design closed-source, solo in hosting e da 20 a 200 dollari al mese ha la forma sbagliata per il prossimo decennio di lavoro di design. Questo post è la valutazione onesta di Claude Design da parte di un team che pubblica nella stessa categoria: cos'è, dove ti vincola, com'è davvero l'alternativa open-source e quale dovresti scegliere questo trimestre.</p>
      <h2>Cos'è davvero Claude Design</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> è stato lanciato da Anthropic Labs nell'aprile 2026. È uno strumento di design conversazionale alimentato da Claude Opus 4.7: chat a sinistra, canvas a destra. Descrivi ciò che vuoi, Claude genera un design e tu iteri attraverso commenti, modifiche inline e affinamenti dei prompt.</p>
      <p>Fa quattro cose bene:</p>
      <ul>
      <li><strong>Prototipi a partire dal testo.</strong> Flussi di onboarding, pagine di impostazioni, pannelli di amministrazione, varianti di checkout — cinque minuti dal prompt allo schermo interattivo.</li>
      <li><strong>Consapevolezza della codebase.</strong> Importa un repo GitHub o allega una directory locale e i prototipi useranno i tuoi componenti reali, il tuo sistema di token, le tue convenzioni.</li>
      <li><strong>Integrazione del brand.</strong> Configura un design system una volta e ogni progetto adotterà automaticamente i colori, la tipografia e i pattern dei componenti.</li>
      <li><strong>Handoff a Claude Code.</strong> Il pulsante "build this" porta il prototipo a codice pronto per la produzione nella stessa scheda del browser.</li>
      </ul>
      <p>Le esportazioni includono Canva, PDF, PPTX, HTML e URL autonomi. Il prezzo è abbinato — Claude Pro a $20, Max a $100–$200, Enterprise al solito livello call-us. Attualmente è una research preview per gli abbonati paganti di Claude.</p>
      <p>Se leggi <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">il tutorial ufficiale</a>, il flusso di lavoro descritto da Anthropic è lo stesso che propone Open Design: un brief, una direzione, un artefatto, un handoff. Le differenze stanno uno strato più in basso.</p>
      <h2>Dove ti vincola</h2>
      <p>Claude Design porta con sé quattro forme di lock-in che vale la pena nominare in apertura, perché le pagine di marketing non lo fanno.</p>
      <p><strong>Il modello è fisso.</strong> Ogni render passa attraverso Claude. Non Claude <em>o</em> un modello che hai già pagato — solo Claude. Se il tuo team ha un contratto con GPT, Gemini o DeepSeek, oppure se fai self-hosting su Ollama per brief sensibili, quei flussi di lavoro non si traducono. Il costo dei token resta agganciato per sempre alla curva di prezzo di Anthropic.</p>
      <p><strong>Il runtime è in hosting.</strong> I tuoi prompt, il tuo design system e il contesto della tua codebase viaggiano tutti verso i server di Anthropic. Per il lavoro d'agenzia o per il creativo pre-lancio sotto NDA, ogni volta è una conversazione con l'ufficio acquisti. Il self-hosting non è un'opzione nella research preview, e l'annuncio non si impegna a fornirne uno.</p>
      <p><strong>Le skill non sono tue.</strong> Il comportamento di Claude Design è definito da prompt e strumenti che vivono dentro Anthropic. Non puoi forkarli, verificarli o sostituirne uno. Le "skill" che Anthropic sta rilasciando in Claude Skills sono adiacenti ma separate; il tooling specifico per il design è interno.</p>
      <p><strong>La fattura è un abbonamento.</strong> $20–$200/mese per postazione va bene per un designer in solitaria, è doloroso per un team di venti persone ed è un non-partente per la dozzina di contributor open-source che altrimenti adotterebbero lo stesso flusso di lavoro.</p>
      <p>Nessuno di questi è un bug in Claude Design. Sono la forma di un prodotto in hosting. Anthropic ha ottimizzato per l'abbonato Pro mediano. Noi non siamo l'abbonato Pro mediano.</p>
      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Un solido a nuvola sfaccettata nera ancorato da una linea tratteggiata a un piccolo ancoraggio a terra e a un blocco server, su una tavola di studio editoriale dai toni caldi" />
        <figcaption>In hosting per impostazione predefinita: i tuoi prompt, il design system e il contesto della codebase viaggiano verso i server di qualcun altro.</figcaption>
      </figure>
      <h2>L'alternativa open-source</h2>
      <p><strong>Open Design</strong> (questo sito) è una scommessa diversa. Non è un clone di Claude Design — è un sottile strato di skill che trasforma il coding agent che già usi in un motore di design. Le quattro primitive sono <a href="/blog/31-skills-72-systems-how-the-library-works/">skill, sistemi, adapter e il daemon</a>. Ogni skill è un file <code>SKILL.md</code>. Ogni design system è un file <code>DESIGN.md</code>. Ogni adapter di agent è ~80 righe di TypeScript.</p>
      <p>Cosa arriva nella confezione oggi:</p>
      <ul>
      <li><strong>123 skills</strong> — generatori di deck, mockup mobile, pagine editoriali, Word/Excel/PPT, esplorazioni di brand</li>
      <li><strong>148 design systems</strong> — versioni Markdown portabili di Linear, Vercel, Stripe, Apple, Cursor, Figma, più una lunga coda</li>
      <li><strong>16 CLI di coding-agent rilevate automaticamente</strong> sul tuo <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Flusso di lavoro bloccato in quattro passaggi</strong> — modulo di domande → selettore di direzione → stream del piano in tempo reale → anteprima in iframe sandboxed</li>
      <li><strong>BYOK per impostazione predefinita</strong> — incolla qualsiasi <code>base_url</code> e chiave compatibile con OpenAI, <a href="/blog/byok-design-workflow-claude-codex-qwen/">i tuoi token vanno direttamente al provider</a></li>
      <li><strong>Apache-2.0, nessuna registrazione, gira su <code>pnpm tools-dev</code></strong></li>
      </ul>
      <p>Il modello mentale: Claude Design è un prodotto. Open Design è uno strato.</p>
      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Tre poliedri sfaccettati neri su una linea di base misurata, solo uno incastrato in una cornice a staffa mentre gli altri stanno liberi, su una tavola di studio editoriale dai toni caldi" />
        <figcaption>Claude Design fissa il modello. La strada aperta ti lascia portare quello che già paghi.</figcaption>
      </figure>
      <h2>Confronto fianco a fianco</h2>
      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Licenza</td><td>Proprietaria</td><td>Apache-2.0</td></tr>
      <tr><td>Runtime</td><td>In hosting (Anthropic)</td><td>Daemon locale (<code>pnpm tools-dev</code>) + deploy opzionale su Vercel</td></tr>
      <tr><td>Modelli</td><td>Solo Claude</td><td>Qualsiasi endpoint compatibile con OpenAI + 16 CLI rilevate</td></tr>
      <tr><td>Skill</td><td>Interne</td><td>123 cartelle <code>SKILL.md</code> forkabili</td></tr>
      <tr><td>Design system</td><td>Configurazione del brand per progetto</td><td>148 file <code>DESIGN.md</code> portabili</td></tr>
      <tr><td>Contesto della codebase</td><td>Import GitHub + locale</td><td>A livello di skill, directory di lavoro reale</td></tr>
      <tr><td>Prezzo</td><td>$20 / $100 / $200 / Enterprise</td><td>Gratuito; paghi direttamente il tuo provider di modelli</td></tr>
      <tr><td>Handoff</td><td>Claude Code (in-app)</td><td>Qualsiasi agent sul <code>$PATH</code>, più esportazioni HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Self-hostabile</td><td>No</td><td>Sì (laptop o Vercel)</td></tr>
      <tr><td>Percorso dei dati</td><td>Prompt → Anthropic</td><td>Prompt → il provider che scegli; nulla passa attraverso di noi</td></tr>
      </tbody>
      </table>
      <p>Il riepilogo onesto: Claude Design ha l'esperienza a prodotto singolo più rifinita. Open Design scambia la superficie rifinita a prodotto singolo con una libreria — più skill, più sistemi, più agent, progettati per comporsi con l'agent che è già sul tuo laptop.</p>
      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Tre lastre sottili nere impilate con spazi visibili come uno stack di strati in isometria, tacche dimensionali a segnare gli spazi, una foglia d'ulivo in cima, su una tavola di studio editoriale dai toni caldi" />
        <figcaption>Un prodotto e uno strato — Open Design si colloca tra il tuo agent e il lavoro di design.</figcaption>
      </figure>
      <h2>Chi dovrebbe scegliere cosa</h2>
      <table>
      <thead>
      <tr><th>Se sei…</th><th>Scegli</th></tr>
      </thead>
      <tbody>
      <tr><td>Un PM in solitaria in un'azienda già su Claude Pro che ha bisogno di un prototipo prima di pranzo</td><td><strong>Claude Design.</strong> I $20/mese sono già spesi; l'interfaccia è davvero veloce.</td></tr>
      <tr><td>Un team di design enterprise dove Anthropic ha già superato l'ufficio acquisti</td><td><strong>Claude Design.</strong> Hai pagato il costo di integrazione una volta; sfruttalo.</td></tr>
      <tr><td>Un designer in solitaria che vuole "Claude Design ma gratis"</td><td><strong>Open Design.</strong> Gratuito, e possiedi il flusso di lavoro invece di affittarlo — puntalo su un modello che già paghi e il primo deck richiede circa dieci minuti.</td></tr>
      <tr><td>Un design engineer che già guida Claude Code, Codex o Cursor dal terminale</td><td><strong>Open Design.</strong> Il tuo agent è il motore di design; lo strato di skill aggiunge gusto e struttura senza una nuova app.</td></tr>
      <tr><td>Chiunque abbia bisogno di BYOK, della scelta del modello a metà progetto o del solo-locale per brief sensibili</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">La realtà è più ruvida del marketing</a>, ma il contratto è l'unico che regge davvero.</td></tr>
      <tr><td>Un contributor open-source che vuole pubblicare una nuova skill di design che il progetto possa adottare</td><td><strong>Open Design.</strong> Lascia una cartella, riavvia il daemon, invia la PR.</td></tr>
      <tr><td>Un team che standardizza su un design system portabile che sopravvive al ricambio degli strumenti</td><td><strong>Open Design.</strong> I file <code>DESIGN.md</code> sopravvivono allo strumento che li legge.</td></tr>
      </tbody>
      </table>
      <p>La dimensione che decide per la maggior parte dei team non è la qualità. È se preferisci affittare il flusso di lavoro o possederlo.</p>
      <h2>Cosa fare adesso</h2>
      <p>Se vuoi capire cosa si prova a possedere il flusso di lavoro prima di spendere per un abbonamento Pro, esegui la quickstart a tre comandi e puntala sul modello che già paghi. Il tutto vive in un unico repo e il primo deck richiede circa dieci minuti.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Prova il flusso di lavoro open-source</a>.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come uno strato di skill, non un prodotto</a> — il manifesto più lungo dietro la scommessa "uno strato, non un prodotto"</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flusso di lavoro di design BYOK — esegui Claude, Codex o Qwen sulla tua chiave</a> — i conti sui costi dietro la scelta del tuo modello</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK reality check — cinque cose che si rompono</a> — cosa rompe davvero oggi la strada aperta, e le soluzioni alternative</li>
      </ul>
  vi:
    title: "Giải pháp mã nguồn mở thay thế Claude Design"
    summary: "Claude Design rất tốt. Nhưng nó cũng là phần mềm đóng, chỉ chạy trên đám mây, và đi kèm với gói đăng ký Claude. Đây là góc nhìn thẳng thắn về thời điểm nên chọn nó — và khi nào con đường mã nguồn mở thắng thế."
    bodyHtml: |
      <p>Claude Design rất tốt. Chúng tôi đã dùng nó cho những bản brief thực tế. Việc chúng tôi <a href="/blog/why-we-built-open-design-as-a-skill-layer/">xây dựng một lớp mã nguồn mở</a> thay vào đó không phải vì Anthropic phát hành một công cụ tồi — họ không hề làm vậy. Lý do là bởi công cụ thiết kế đóng, chỉ chạy trên đám mây, giá từ 20 đến 200 đô-la mỗi tháng là hình hài sai cho thập kỷ tới của công việc thiết kế. Bài viết này là góc nhìn thẳng thắn về Claude Design từ một đội ngũ phát hành trong cùng lĩnh vực: nó là gì, nó khóa bạn ở đâu, giải pháp mã nguồn mở thay thế thực sự trông như thế nào, và bạn nên chọn cái nào trong quý này.</p>
      <h2>Claude Design thực chất là gì</h2>
      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> ra mắt từ Anthropic Labs vào tháng 4 năm 2026. Đó là một công cụ thiết kế đối thoại được vận hành bởi Claude Opus 4.7: trò chuyện bên trái, canvas bên phải. Bạn mô tả điều bạn muốn, Claude tạo ra một thiết kế, và bạn lặp lại tinh chỉnh thông qua bình luận, chỉnh sửa nội tuyến, và làm tinh prompt.</p>
      <p>Nó làm tốt bốn việc:</p>
      <ul>
      <li><strong>Tạo nguyên mẫu từ văn xuôi.</strong> Luồng onboarding, trang cài đặt, bảng quản trị, các biến thể thanh toán — năm phút từ prompt đến màn hình tương tác.</li>
      <li><strong>Nhận biết codebase.</strong> Nhập một repo GitHub hoặc đính kèm một thư mục cục bộ và các nguyên mẫu sẽ dùng đúng các component thực, hệ thống token, và quy ước của bạn.</li>
      <li><strong>Tích hợp thương hiệu.</strong> Thiết lập một hệ thống thiết kế một lần và mọi dự án tự động lấy màu sắc, kiểu chữ, và các mẫu component.</li>
      <li><strong>Bàn giao cho Claude Code.</strong> Nút "build this" đưa nguyên mẫu đến mã sẵn sàng cho production trong cùng tab trình duyệt.</li>
      </ul>
      <p>Các định dạng xuất bao gồm Canva, PDF, PPTX, HTML, và URL độc lập. Giá được gói chung — Claude Pro với 20 đô-la, Max với 100–200 đô-la, Enterprise ở mức gọi-điện-cho-chúng-tôi thường lệ. Hiện nó là một bản xem trước nghiên cứu dành cho người đăng ký Claude trả phí.</p>
      <p>Nếu bạn đọc <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">hướng dẫn chính thức</a>, quy trình mà Anthropic mô tả chính là quy trình mà Open Design cung cấp: một bản brief, một định hướng, một sản phẩm, một bàn giao. Khác biệt nằm ở tầng bên dưới.</p>
      <h2>Nó khóa bạn ở đâu</h2>
      <p>Claude Design mang theo bốn kiểu khóa đáng được nêu rõ ngay từ đầu, vì các trang tiếp thị không làm điều đó.</p>
      <p><strong>Mô hình bị cố định.</strong> Mọi lần render đều đi qua Claude. Không phải Claude <em>hoặc</em> một mô hình mà bạn đã trả tiền — chỉ Claude. Nếu đội của bạn có hợp đồng với GPT, Gemini, hoặc DeepSeek, hoặc nếu bạn tự host trên Ollama cho những bản brief nhạy cảm, thì các quy trình đó không chuyển sang được. Chi phí token mãi mãi đi theo đường cong giá của Anthropic.</p>
      <p><strong>Runtime được host.</strong> Prompt, hệ thống thiết kế, và bối cảnh codebase của bạn đều đi đến máy chủ của Anthropic. Với công việc agency hoặc sáng tạo tiền-ra-mắt theo NDA, đó là một cuộc trao đổi về thu mua mỗi lần. Tự host không phải là một lựa chọn trong bản xem trước nghiên cứu, và thông báo không cam kết sẽ có.</p>
      <p><strong>Các skill không phải của bạn.</strong> Hành vi của Claude Design được định nghĩa bởi các prompt và công cụ nằm bên trong Anthropic. Bạn không thể fork chúng, kiểm toán chúng, hay thay thế một cái nào. Các "skill" mà Anthropic phát hành trong Claude Skills là liền kề nhưng tách biệt; công cụ chuyên cho thiết kế là nội bộ.</p>
      <p><strong>Hóa đơn là một gói đăng ký.</strong> 20–200 đô-la/tháng cho mỗi chỗ ngồi thì ổn với một nhà thiết kế đơn lẻ, đau đớn với một đội hai mươi người, và là điều bất khả thi với cả tá người đóng góp mã nguồn mở mà lẽ ra sẽ tiếp nhận cùng quy trình đó.</p>
      <p>Không cái nào trong số này là lỗi của Claude Design. Chúng là hình hài của một sản phẩm được host. Anthropic tối ưu cho người đăng ký Pro trung vị. Chúng tôi không phải người đăng ký Pro trung vị.</p>
      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Một khối đám mây đen nhiều mặt được buộc bằng một đường nét đứt vào một mỏ neo nhỏ trên mặt đất và một khối máy chủ, trên một bản nghiên cứu kiểu biên tập tông ấm" />
        <figcaption>Được host theo mặc định: prompt, hệ thống thiết kế, và bối cảnh codebase của bạn đi đến máy chủ của người khác.</figcaption>
      </figure>
      <h2>Giải pháp mã nguồn mở thay thế</h2>
      <p><strong>Open Design</strong> (trang này) là một canh bạc khác. Nó không phải một bản sao của Claude Design — nó là một lớp skill mỏng biến tác tử lập trình mà bạn đã dùng thành một cỗ máy thiết kế. Bốn nguyên thể là <a href="/blog/31-skills-72-systems-how-the-library-works/">skill, hệ thống, adapter, và daemon</a>. Mỗi skill là một tệp <code>SKILL.md</code>. Mỗi hệ thống thiết kế là một tệp <code>DESIGN.md</code>. Mỗi adapter tác tử khoảng ~80 dòng TypeScript.</p>
      <p>Những gì có sẵn trong hộp hôm nay:</p>
      <ul>
      <li><strong>123 skills</strong> — bộ tạo deck, mockup di động, trang biên tập, Word/Excel/PPT, khám phá thương hiệu</li>
      <li><strong>148 design systems</strong> — phiên bản Markdown di động của Linear, Vercel, Stripe, Apple, Cursor, Figma, cùng một đuôi dài</li>
      <li><strong>16 CLI tác tử lập trình được tự động phát hiện</strong> trên <code>$PATH</code> của bạn — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Quy trình bốn bước được khóa</strong> — biểu mẫu câu hỏi → bộ chọn định hướng → luồng kế hoạch trực tiếp → xem trước iframe trong hộp cát</li>
      <li><strong>BYOK theo mặc định</strong> — dán bất kỳ <code>base_url</code> và khóa tương thích OpenAI nào, <a href="/blog/byok-design-workflow-claude-codex-qwen/">các token của bạn đi thẳng đến nhà cung cấp</a></li>
      <li><strong>Apache-2.0, không cần đăng ký, chạy trên <code>pnpm tools-dev</code></strong></li>
      </ul>
      <p>Mô hình tư duy: Claude Design là một sản phẩm. Open Design là một lớp.</p>
      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Ba khối đa diện đen nhiều mặt trên một đường nền được đo đạc, chỉ một khối được lắp vào khung ngoặc trong khi các khối khác nằm rời, trên một bản nghiên cứu kiểu biên tập tông ấm" />
        <figcaption>Claude Design cố định mô hình. Con đường mở cho phép bạn mang theo mô hình mà bạn đã trả tiền.</figcaption>
      </figure>
      <h2>So sánh trực tiếp</h2>
      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Giấy phép</td>
      <td>Độc quyền</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>Runtime</td>
      <td>Được host (Anthropic)</td>
      <td>Daemon cục bộ (<code>pnpm tools-dev</code>) + tùy chọn triển khai Vercel</td>
      </tr>
      <tr>
      <td>Mô hình</td>
      <td>Chỉ Claude</td>
      <td>Bất kỳ endpoint tương thích OpenAI nào + 16 CLI được phát hiện</td>
      </tr>
      <tr>
      <td>Skills</td>
      <td>Nội bộ</td>
      <td>123 thư mục <code>SKILL.md</code> có thể fork</td>
      </tr>
      <tr>
      <td>Hệ thống thiết kế</td>
      <td>Thiết lập thương hiệu theo từng dự án</td>
      <td>148 tệp <code>DESIGN.md</code> di động</td>
      </tr>
      <tr>
      <td>Bối cảnh codebase</td>
      <td>Nhập GitHub + cục bộ</td>
      <td>Cấp độ skill, thư mục làm việc thực</td>
      </tr>
      <tr>
      <td>Giá</td>
      <td>$20 / $100 / $200 / Enterprise</td>
      <td>Miễn phí; bạn trả trực tiếp cho nhà cung cấp mô hình của mình</td>
      </tr>
      <tr>
      <td>Bàn giao</td>
      <td>Claude Code (trong ứng dụng)</td>
      <td>Bất kỳ tác tử nào trên <code>$PATH</code>, cùng các định dạng xuất HTML / PDF / PPTX / ZIP</td>
      </tr>
      <tr>
      <td>Có thể tự host</td>
      <td>Không</td>
      <td>Có (laptop hoặc Vercel)</td>
      </tr>
      <tr>
      <td>Đường đi dữ liệu</td>
      <td>Prompt → Anthropic</td>
      <td>Prompt → nhà cung cấp bạn chọn; không gì đi qua chúng tôi</td>
      </tr>
      </tbody>
      </table>
      <p>Tóm tắt thẳng thắn: Claude Design có trải nghiệm sản phẩm-đơn-nhất được trau chuốt nhất. Open Design đánh đổi bề mặt sản phẩm-đơn-nhất trau chuốt để lấy một thư viện — nhiều skill hơn, nhiều hệ thống hơn, nhiều tác tử hơn, được thiết kế để kết hợp với tác tử đã có trên laptop của bạn.</p>
      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Ba phiến đen mỏng xếp chồng với khoảng hở thấy rõ như một ngăn xếp lớp ở góc nhìn isometric, các vạch kích thước đánh dấu các khoảng hở, một chiếc lá ô liu trên cùng, trên một bản nghiên cứu kiểu biên tập tông ấm" />
        <figcaption>Một sản phẩm và một lớp — Open Design nằm giữa tác tử của bạn và công việc thiết kế.</figcaption>
      </figure>
      <h2>Ai nên chọn gì</h2>
      <table>
      <thead>
      <tr>
      <th>Nếu bạn là…</th>
      <th>Chọn</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Một PM đơn lẻ tại một công ty đã dùng Claude Pro và cần một nguyên mẫu trước bữa trưa</td>
      <td><strong>Claude Design.</strong> 20 đô-la/tháng đã chi rồi; giao diện thực sự nhanh.</td>
      </tr>
      <tr>
      <td>Một đội thiết kế doanh nghiệp nơi Anthropic đã thông qua khâu thu mua</td>
      <td><strong>Claude Design.</strong> Bạn đã trả chi phí tích hợp một lần; hãy tận dụng nó.</td>
      </tr>
      <tr>
      <td>Một nhà thiết kế đơn lẻ muốn "Claude Design nhưng miễn phí"</td>
      <td><strong>Open Design.</strong> Miễn phí, và bạn sở hữu quy trình thay vì thuê nó — chỉ nó vào một mô hình bạn đã trả tiền và bản deck đầu tiên mất khoảng mười phút.</td>
      </tr>
      <tr>
      <td>Một kỹ sư thiết kế đã điều khiển Claude Code, Codex, hoặc Cursor từ terminal</td>
      <td><strong>Open Design.</strong> Tác tử của bạn là cỗ máy thiết kế; lớp skill thêm gu thẩm mỹ và cấu trúc mà không cần một ứng dụng mới.</td>
      </tr>
      <tr>
      <td>Bất kỳ ai cần BYOK, lựa chọn mô hình giữa chừng dự án, hoặc chỉ-cục-bộ cho những bản brief nhạy cảm</td>
      <td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Thực tế gồ ghề hơn tiếp thị</a>, nhưng đây là cam kết duy nhất thực sự giữ vững.</td>
      </tr>
      <tr>
      <td>Một người đóng góp mã nguồn mở muốn phát hành một skill thiết kế mới mà dự án có thể tiếp nhận</td>
      <td><strong>Open Design.</strong> Thả một thư mục vào, khởi động lại daemon, gửi PR.</td>
      </tr>
      <tr>
      <td>Một đội đang chuẩn hóa trên một hệ thống thiết kế di động sống sót qua sự thay đổi công cụ</td>
      <td><strong>Open Design.</strong> Các tệp <code>DESIGN.md</code> sống lâu hơn công cụ đọc chúng.</td>
      </tr>
      </tbody>
      </table>
      <p>Yếu tố quyết định cho hầu hết các đội không phải là chất lượng. Đó là việc bạn thà thuê quy trình hay sở hữu nó.</p>
      <h2>Việc cần làm tiếp theo</h2>
      <p>Nếu bạn muốn cảm nhận việc sở hữu quy trình trông như thế nào trước khi chi tiền cho một gói đăng ký Pro, hãy chạy bản khởi động nhanh ba lệnh và chỉ nó vào mô hình bạn đã trả tiền. Toàn bộ nằm trong một repo và bản deck đầu tiên mất khoảng mười phút.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Thử quy trình mã nguồn mở</a>.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Tại sao chúng tôi xây dựng Open Design như một lớp skill, không phải một sản phẩm</a> — bản tuyên ngôn dài hơn đằng sau canh bạc "lớp, không phải sản phẩm"</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Quy trình thiết kế BYOK — chạy Claude, Codex, hoặc Qwen trên khóa của riêng bạn</a> — bài toán chi phí đằng sau việc chọn mô hình của riêng bạn</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Kiểm chứng thực tế BYOK — năm thứ bị hỏng</a> — con đường mở thực sự làm hỏng điều gì hôm nay, và các cách khắc phục</li>
      </ul>
  pl:
    title: "Otwartoźródłowa alternatywa dla Claude Design"
    summary: "Claude Design jest dobry. Jest też zamknięty, dostępny wyłącznie w chmurze i powiązany z subskrypcją Claude. Oto uczciwa ocena tego, kiedy go wybrać — a kiedy wygrywa droga otwartoźródłowa."
    bodyHtml: |
      <p>Claude Design jest dobry. Używaliśmy go przy prawdziwych zleceniach. To, że <a href="/blog/why-we-built-open-design-as-a-skill-layer/">zbudowaliśmy zamiast tego warstwę otwartoźródłową</a>, nie wynika z tego, że Anthropic wypuścił zły produkt — nie wypuścił. Wynika z tego, że zamknięte, dostępne wyłącznie w chmurze narzędzie projektowe za od 20 do 200 dolarów miesięcznie ma niewłaściwy kształt dla projektowania w nadchodzącej dekadzie. Ten wpis to uczciwa ocena Claude Design z perspektywy zespołu, który działa w tej samej kategorii: czym jest, gdzie cię uzależnia, jak naprawdę wygląda alternatywa otwartoźródłowa i który z nich powinieneś wybrać w tym kwartale.</p>

      <h2>Czym właściwie jest Claude Design</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> wystartował z Anthropic Labs w kwietniu 2026 roku. To konwersacyjne narzędzie projektowe napędzane przez Claude Opus 4.7: czat po lewej, kanwa po prawej. Opisujesz, czego chcesz, Claude generuje projekt, a ty iterujesz poprzez komentarze, edycje inline i doprecyzowywanie promptów.</p>

      <p>Robi cztery rzeczy dobrze:</p>

      <ul>
      <li><strong>Prototypy z opisu.</strong> Ścieżki onboardingu, strony ustawień, panele administracyjne, warianty kasy — pięć minut od promptu do interaktywnego ekranu.</li>
      <li><strong>Świadomość bazy kodu.</strong> Zaimportuj repozytorium GitHub lub dołącz lokalny katalog, a prototypy będą korzystać z twoich rzeczywistych komponentów, twojego systemu tokenów, twoich konwencji.</li>
      <li><strong>Integracja marki.</strong> Skonfiguruj system projektowy raz, a każdy projekt automatycznie przejmuje kolory, typografię i wzorce komponentów.</li>
      <li><strong>Przekazanie do Claude Code.</strong> Przycisk „zbuduj to” przenosi prototyp do gotowego do produkcji kodu w tej samej karcie przeglądarki.</li>
      </ul>

      <p>Eksporty obejmują Canva, PDF, PPTX, HTML oraz samodzielne adresy URL. Cennik jest powiązany — Claude Pro za 20 dolarów, Max za 100–200 dolarów, Enterprise w zwykłym poziomie „skontaktuj się z nami”. Obecnie jest to podgląd badawczy dla płacących subskrybentów Claude.</p>

      <p>Jeśli przeczytasz <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">oficjalny samouczek</a>, przepływ pracy opisywany przez Anthropic jest taki sam, jaki oferuje Open Design: brief, kierunek, artefakt, przekazanie. Różnice znajdują się o jedną warstwę niżej.</p>

      <h2>Gdzie cię uzależnia</h2>

      <p>Claude Design niesie ze sobą cztery elementy uzależnienia (lock-in), które warto nazwać wprost, bo strony marketingowe tego nie robią.</p>

      <p><strong>Model jest stały.</strong> Każde renderowanie przechodzi przez Claude. Nie Claude <em>albo</em> model, za który już zapłaciłeś — tylko Claude. Jeśli twój zespół ma umowę z GPT, Gemini lub DeepSeek, albo jeśli hostujesz u siebie na Ollama dla wrażliwych zleceń, te przepływy pracy się nie przekładają. Koszt tokenów na zawsze jedzie po krzywej cenowej Anthropic.</p>

      <p><strong>Środowisko uruchomieniowe jest w chmurze.</strong> Twoje prompty, twój system projektowy i kontekst twojej bazy kodu — wszystko podróżuje na serwery Anthropic. Przy pracy agencyjnej lub kreacji przed premierą objętej NDA to za każdym razem rozmowa z działem zakupów. Self-hosting nie jest opcją w podglądzie badawczym, a zapowiedź nie zobowiązuje się do niego.</p>

      <p><strong>Umiejętności (skills) nie są twoje.</strong> Zachowanie Claude Design jest definiowane przez prompty i narzędzia, które żyją wewnątrz Anthropic. Nie możesz ich sforkować, zaudytować ani wymienić. „Skille”, które Anthropic dostarcza w Claude Skills, są pokrewne, ale odrębne; narzędzia specyficzne dla projektowania są wewnętrzne.</p>

      <p><strong>Rachunek to subskrypcja.</strong> 20–200 dolarów miesięcznie za stanowisko jest w porządku dla samodzielnego projektanta, bolesne dla zespołu dwudziestu osób i nie do przyjęcia dla kilkunastu otwartoźródłowych kontrybutorów, którzy w innym razie podjęliby ten sam przepływ pracy.</p>

      <p>Żaden z tych elementów nie jest błędem w Claude Design. To kształt produktu hostowanego. Anthropic zoptymalizował pod medianowego subskrybenta Pro. My nie jesteśmy medianowym subskrybentem Pro.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Czarna fasetowana bryła chmury przymocowana przerywaną linią do małej kotwicy w gruncie i bloku serwera, na ciepłej, redakcyjnej planszy poglądowej" />
        <figcaption>Domyślnie w chmurze: twoje prompty, system projektowy i kontekst bazy kodu podróżują na cudze serwery.</figcaption>
      </figure>

      <h2>Alternatywa otwartoźródłowa</h2>

      <p><strong>Open Design</strong> (ta strona) to inny zakład. To nie klon Claude Design — to cienka warstwa umiejętności, która zamienia agenta kodującego, którego już używasz, w silnik projektowy. Czterema prymitywami są <a href="/blog/31-skills-72-systems-how-the-library-works/">skille, systemy, adaptery i daemon</a>. Każdy skill to plik <code>SKILL.md</code>. Każdy system projektowy to plik <code>DESIGN.md</code>. Każdy adapter agenta to około 80 linii TypeScript.</p>

      <p>Co jest w pudełku już dziś:</p>

      <ul>
      <li><strong>123 skille</strong> — generatory prezentacji, makiety mobilne, strony redakcyjne, Word/Excel/PPT, eksploracje marki</li>
      <li><strong>148 systemów projektowych</strong> — przenośne wersje w Markdown dla Linear, Vercel, Stripe, Apple, Cursor, Figma, plus długi ogon</li>
      <li><strong>16 CLI agentów kodujących automatycznie wykrywanych</strong> w twoim <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Czterostopniowy zablokowany przepływ pracy</strong> — formularz pytań → wybór kierunku → strumień planu na żywo → podgląd w piaskownicy iframe</li>
      <li><strong>BYOK domyślnie</strong> — wklej dowolny zgodny z OpenAI <code>base_url</code> i klucz, <a href="/blog/byok-design-workflow-claude-codex-qwen/">twoje tokeny trafiają prosto do dostawcy</a></li>
      <li><strong>Apache-2.0, bez rejestracji, działa na <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>Model myślowy: Claude Design to produkt. Open Design to warstwa.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Trzy czarne fasetowane wielościany na wymierzonej linii bazowej, tylko jeden wpasowany w ramę uchwytu, podczas gdy pozostałe leżą luźno, na ciepłej, redakcyjnej planszy poglądowej" />
        <figcaption>Claude Design ustala model na stałe. Otwarta droga pozwala ci przynieść ten, za który już płacisz.</figcaption>
      </figure>

      <h2>Porównanie obok siebie</h2>

      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Licencja</td><td>Własnościowa</td><td>Apache-2.0</td></tr>
      <tr><td>Środowisko uruchomieniowe</td><td>W chmurze (Anthropic)</td><td>Lokalny daemon (<code>pnpm tools-dev</code>) + opcjonalne wdrożenie na Vercel</td></tr>
      <tr><td>Modele</td><td>Tylko Claude</td><td>Dowolny punkt końcowy zgodny z OpenAI + 16 wykrytych CLI</td></tr>
      <tr><td>Skille</td><td>Wewnętrzne</td><td>123 sforkowalne foldery <code>SKILL.md</code></td></tr>
      <tr><td>Systemy projektowe</td><td>Konfiguracja marki dla każdego projektu</td><td>148 przenośnych plików <code>DESIGN.md</code></td></tr>
      <tr><td>Kontekst bazy kodu</td><td>Import z GitHub + lokalny</td><td>Na poziomie skilla, rzeczywisty katalog roboczy</td></tr>
      <tr><td>Cennik</td><td>$20 / $100 / $200 / Enterprise</td><td>Darmowy; płacisz bezpośrednio dostawcy swojego modelu</td></tr>
      <tr><td>Przekazanie</td><td>Claude Code (w aplikacji)</td><td>Dowolny agent w <code>$PATH</code>, plus eksporty HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Możliwość self-hostingu</td><td>Nie</td><td>Tak (laptop lub Vercel)</td></tr>
      <tr><td>Ścieżka danych</td><td>Prompty → Anthropic</td><td>Prompty → wybrany przez ciebie dostawca; nic przez nas</td></tr>
      </tbody>
      </table>

      <p>Uczciwe podsumowanie: Claude Design oferuje najbardziej dopracowane doświadczenie pojedynczego produktu. Open Design wymienia dopracowaną powierzchnię pojedynczego produktu na bibliotekę — więcej skilli, więcej systemów, więcej agentów, zaprojektowaną tak, by komponować się z agentem już obecnym na twoim laptopie.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Trzy cienkie czarne płyty ułożone z widocznymi przerwami niczym stos warstw w rzucie izometrycznym, znaczniki wymiarów wyznaczają przerwy, liść oliwny na szczycie, na ciepłej, redakcyjnej planszy poglądowej" />
        <figcaption>Produkt i warstwa — Open Design siedzi pomiędzy twoim agentem a pracą projektową.</figcaption>
      </figure>

      <h2>Kto co powinien wybrać</h2>

      <table>
      <thead>
      <tr><th>Jeśli jesteś…</th><th>Wybierz</th></tr>
      </thead>
      <tbody>
      <tr><td>Samodzielnym PM-em w firmie już na Claude Pro, który potrzebuje prototypu przed obiadem</td><td><strong>Claude Design.</strong> 20 dolarów miesięcznie to koszt już poniesiony; interfejs jest naprawdę szybki.</td></tr>
      <tr><td>Korporacyjnym zespołem projektowym, w którym Anthropic już przeszedł procurement</td><td><strong>Claude Design.</strong> Koszt integracji zapłaciłeś raz; wydaj go.</td></tr>
      <tr><td>Samodzielnym projektantem, który chce „Claude Design, ale za darmo”</td><td><strong>Open Design.</strong> Za darmo, i to ty jesteś właścicielem przepływu pracy, zamiast go wynajmować — wskaż mu model, za który już płacisz, a pierwsza prezentacja zajmie około dziesięciu minut.</td></tr>
      <tr><td>Inżynierem projektowym, który już steruje Claude Code, Codex lub Cursor z terminala</td><td><strong>Open Design.</strong> Twój agent jest silnikiem projektowym; warstwa umiejętności dodaje gust i strukturę bez nowej aplikacji.</td></tr>
      <tr><td>Kimkolwiek, kto potrzebuje BYOK, wyboru modelu w trakcie projektu lub trybu wyłącznie lokalnego dla wrażliwych zleceń</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Rzeczywistość jest bardziej wyboista niż marketing</a>, ale to jedyny kontrakt, który naprawdę się trzyma.</td></tr>
      <tr><td>Otwartoźródłowym kontrybutorem, który chce dostarczyć nowy skill projektowy, jaki projekt może przyjąć</td><td><strong>Open Design.</strong> Wrzuć folder, zrestartuj daemon, wyślij PR.</td></tr>
      <tr><td>Zespołem standaryzującym się na przenośnym systemie projektowym, który przetrwa wymianę narzędzi</td><td><strong>Open Design.</strong> Pliki <code>DESIGN.md</code> przeżyją narzędzie, które je odczytuje.</td></tr>
      </tbody>
      </table>

      <p>Wymiarem, który dla większości zespołów rozstrzyga sprawę, nie jest jakość. To, czy wolisz wynajmować przepływ pracy, czy być jego właścicielem.</p>

      <h2>Co robić dalej</h2>

      <p>Jeśli chcesz poczuć, jak to jest być właścicielem przepływu pracy, zanim wydasz pieniądze na subskrypcję Pro, uruchom trzykomendowy quickstart i wskaż mu model, za który już płacisz. Całość mieści się w jednym repozytorium, a pierwsza prezentacja zajmuje około dziesięciu minut.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Wypróbuj otwartoźródłowy przepływ pracy</a>.</p>

      <h2>Powiązane lektury</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — dłuższy manifest stojący za zakładem „warstwa, nie produkt”</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Przepływ pracy projektowej BYOK — uruchom Claude, Codex lub Qwen na własnym kluczu</a> — matematyka kosztów stojąca za wyborem własnego modelu</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK — sprawdzian z rzeczywistością — pięć rzeczy, które się psują</a> — co otwarta droga naprawdę dziś psuje i jak to obejść</li>
      </ul>
  id:
    title: "Alternatif open-source untuk Claude Design"
    summary: "Claude Design bagus. Ia juga closed-source, hanya hosted, dan dibundel dengan langganan Claude. Inilah pandangan jujur tentang kapan harus memilihnya — dan kapan jalur open-source yang menang."
    bodyHtml: |
      <p>Claude Design bagus. Kami sudah memakainya untuk brief sungguhan. Fakta bahwa kami justru <a href="/blog/why-we-built-open-design-as-a-skill-layer/">membangun sebuah lapisan open-source</a> bukan karena Anthropic merilis alat yang buruk — mereka tidak begitu. Itu karena perkakas desain yang closed-source, hanya hosted, dan berharga $20-hingga-$200-sebulan adalah bentuk yang keliru untuk satu dekade ke depan pekerjaan desain. Tulisan ini adalah pandangan jujur tentang Claude Design dari tim yang merilis di kategori yang sama: apa itu, di mana ia mengunci Anda, seperti apa sebenarnya alternatif open-source-nya, dan mana yang sebaiknya Anda pilih kuartal ini.</p>

      <h2>Apa sebenarnya Claude Design itu</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> diluncurkan dari Anthropic Labs pada April 2026. Ia adalah alat desain percakapan yang ditenagai Claude Opus 4.7: chat di kiri, kanvas di kanan. Anda mendeskripsikan apa yang Anda inginkan, Claude menghasilkan sebuah desain, dan Anda beriterasi lewat komentar, suntingan inline, dan penyempurnaan prompt.</p>

      <p>Ia melakukan empat hal dengan baik:</p>

      <ul>
      <li><strong>Prototipe dari prosa.</strong> Alur onboarding, halaman pengaturan, panel admin, varian checkout — lima menit dari prompt ke layar interaktif.</li>
      <li><strong>Kesadaran codebase.</strong> Impor sebuah repo GitHub atau lampirkan sebuah direktori lokal dan prototipe akan memakai komponen sungguhan Anda, sistem token Anda, konvensi Anda.</li>
      <li><strong>Integrasi merek.</strong> Siapkan sebuah design system satu kali dan setiap proyek otomatis mengambil warna, tipografi, dan pola komponennya.</li>
      <li><strong>Serah-terima ke Claude Code.</strong> Tombol "build this" membawa prototipe ke kode siap-produksi di tab browser yang sama.</li>
      </ul>

      <p>Ekspor mencakup Canva, PDF, PPTX, HTML, dan URL mandiri. Harganya dibundel — Claude Pro $20, Max $100–$200, Enterprise di tier "hubungi-kami" yang biasa. Saat ini ia adalah research preview untuk pelanggan Claude berbayar.</p>

      <p>Jika Anda membaca <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">tutorial resmi</a>, alur kerja yang Anthropic gambarkan adalah alur yang sama dengan yang dirilis Open Design: sebuah brief, sebuah arah, sebuah artefak, sebuah serah-terima. Perbedaannya berada satu lapisan di bawah.</p>

      <h2>Di mana ia mengunci Anda</h2>

      <p>Claude Design membawa empat bentuk lock-in yang layak disebut sejak awal, karena halaman pemasaran tidak menyebutkannya.</p>

      <p><strong>Modelnya tetap.</strong> Setiap render melewati Claude. Bukan Claude <em>atau</em> model yang sudah Anda bayar — hanya Claude. Jika tim Anda punya kontrak dengan GPT, Gemini, atau DeepSeek, atau jika Anda self-host di Ollama untuk brief sensitif, alur kerja itu tidak terbawa. Biaya token mengikuti kurva harga Anthropic selamanya.</p>

      <p><strong>Runtime-nya hosted.</strong> Prompt Anda, design system Anda, dan konteks codebase Anda semuanya berjalan ke server Anthropic. Untuk pekerjaan agensi atau kreatif pra-peluncuran di bawah NDA, itu jadi percakapan procurement setiap kali. Self-hosted bukan pilihan di research preview, dan pengumuman itu tidak berkomitmen untuk menyediakannya.</p>

      <p><strong>Skill-nya bukan milik Anda.</strong> Perilaku Claude Design ditentukan oleh prompt dan tools yang berada di dalam Anthropic. Anda tidak bisa mem-fork, mengaudit, atau menggantinya. "Skills" yang Anthropic rilis di Claude Skills bersebelahan tapi terpisah; perkakas khusus-desainnya bersifat internal.</p>

      <p><strong>Tagihannya adalah langganan.</strong> $20–$200/bulan per kursi memang wajar untuk seorang desainer solo, menyakitkan untuk tim dua puluh orang, dan tidak mungkin untuk belasan kontributor open-source yang seharusnya bisa mengadopsi alur kerja yang sama.</p>

      <p>Tidak satu pun dari ini adalah bug di Claude Design. Inilah bentuk dari sebuah produk hosted. Anthropic mengoptimalkan untuk pelanggan Pro rata-rata. Kami bukan pelanggan Pro rata-rata.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Sebuah awan padat berfaset hitam yang ditambatkan oleh garis putus-putus ke jangkar tanah kecil dan blok server, di atas plat studi editorial bernuansa hangat" />
        <figcaption>Hosted secara bawaan: prompt Anda, design system, dan konteks codebase berjalan ke server milik orang lain.</figcaption>
      </figure>

      <h2>Alternatif open-source-nya</h2>

      <p><strong>Open Design</strong> (situs ini) adalah taruhan yang berbeda. Ia bukan klona Claude Design — ia adalah lapisan skill tipis yang mengubah coding agent yang sudah Anda pakai menjadi sebuah mesin desain. Empat primitifnya adalah <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters, dan daemon</a>. Setiap skill adalah sebuah file <code>SKILL.md</code>. Setiap design system adalah sebuah file <code>DESIGN.md</code>. Setiap agent adapter adalah ~80 baris TypeScript.</p>

      <p>Apa yang dirilis dalam paket hari ini:</p>

      <ul>
      <li><strong>123 skills</strong> — generator deck, mockup mobile, halaman editorial, Word/Excel/PPT, eksplorasi merek</li>
      <li><strong>148 design systems</strong> — versi Markdown portabel dari Linear, Vercel, Stripe, Apple, Cursor, Figma, plus ekor panjang lainnya</li>
      <li><strong>16 CLI coding-agent terdeteksi otomatis</strong> di <code>$PATH</code> Anda — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Alur kerja terkunci empat langkah</strong> — formulir pertanyaan → pemilih arah → aliran rencana langsung → pratinjau iframe ter-sandbox</li>
      <li><strong>BYOK secara bawaan</strong> — tempelkan <code>base_url</code> dan kunci apa pun yang kompatibel-OpenAI, <a href="/blog/byok-design-workflow-claude-codex-qwen/">token Anda langsung menuju penyedianya</a></li>
      <li><strong>Apache-2.0, tanpa pendaftaran, berjalan di <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>Model mentalnya: Claude Design adalah sebuah produk. Open Design adalah sebuah lapisan.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Tiga polihedron berfaset hitam pada garis dasar terukur, hanya satu yang terpasang ke bingkai braket sementara yang lain duduk lepas, di atas plat studi editorial bernuansa hangat" />
        <figcaption>Claude Design menetapkan modelnya. Jalur terbuka membiarkan Anda membawa model yang sudah Anda bayar.</figcaption>
      </figure>

      <h2>Berdampingan</h2>

      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Lisensi</td><td>Proprietary</td><td>Apache-2.0</td></tr>
      <tr><td>Runtime</td><td>Hosted (Anthropic)</td><td>Daemon lokal (<code>pnpm tools-dev</code>) + deploy Vercel opsional</td></tr>
      <tr><td>Model</td><td>Hanya Claude</td><td>Endpoint apa pun yang kompatibel-OpenAI + 16 CLI terdeteksi</td></tr>
      <tr><td>Skills</td><td>Internal</td><td>123 folder <code>SKILL.md</code> yang bisa di-fork</td></tr>
      <tr><td>Design systems</td><td>Penyiapan merek per-proyek</td><td>148 file <code>DESIGN.md</code> portabel</td></tr>
      <tr><td>Konteks codebase</td><td>Impor GitHub + lokal</td><td>Tingkat-skill, direktori kerja sungguhan</td></tr>
      <tr><td>Harga</td><td>$20 / $100 / $200 / Enterprise</td><td>Gratis; Anda membayar penyedia model Anda secara langsung</td></tr>
      <tr><td>Serah-terima</td><td>Claude Code (dalam aplikasi)</td><td>Agent apa pun di <code>$PATH</code>, plus ekspor HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Bisa di-self-host</td><td>Tidak</td><td>Ya (laptop atau Vercel)</td></tr>
      <tr><td>Jalur data</td><td>Prompt → Anthropic</td><td>Prompt → penyedia pilihan Anda; tidak ada yang melewati kami</td></tr>
      </tbody>
      </table>

      <p>Ringkasan jujurnya: Claude Design punya pengalaman produk-tunggal yang paling halus. Open Design menukar permukaan produk-tunggal yang halus itu dengan sebuah pustaka — lebih banyak skill, lebih banyak system, lebih banyak agent, dirancang untuk dipadukan dengan agent yang sudah ada di laptop Anda.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Tiga lempeng hitam tipis ditumpuk dengan celah terlihat seperti tumpukan lapisan secara isometrik, garis dimensi menandai celahnya, sehelai daun zaitun di atasnya, di atas plat studi editorial bernuansa hangat" />
        <figcaption>Sebuah produk dan sebuah lapisan — Open Design duduk di antara agent Anda dan pekerjaan desainnya.</figcaption>
      </figure>

      <h2>Siapa sebaiknya memilih apa</h2>

      <table>
      <thead>
      <tr><th>Jika Anda adalah…</th><th>Pilih</th></tr>
      </thead>
      <tbody>
      <tr><td>Seorang PM solo di perusahaan yang sudah memakai Claude Pro dan butuh prototipe sebelum makan siang</td><td><strong>Claude Design.</strong> Biaya $20/bulan sudah terlanjur; antarmukanya benar-benar cepat.</td></tr>
      <tr><td>Sebuah tim desain enterprise di mana Anthropic sudah lolos procurement</td><td><strong>Claude Design.</strong> Anda sudah membayar biaya integrasinya sekali; manfaatkan.</td></tr>
      <tr><td>Seorang desainer solo yang ingin "Claude Design tapi gratis"</td><td><strong>Open Design.</strong> Gratis, dan Anda memiliki alur kerjanya alih-alih menyewanya — arahkan ke model yang sudah Anda bayar dan deck pertama memakan waktu sekitar sepuluh menit.</td></tr>
      <tr><td>Seorang design engineer yang sudah mengendalikan Claude Code, Codex, atau Cursor dari terminal</td><td><strong>Open Design.</strong> Agent Anda adalah mesin desainnya; lapisan skill menambahkan selera dan struktur tanpa aplikasi baru.</td></tr>
      <tr><td>Siapa pun yang butuh BYOK, pemilihan model di tengah proyek, atau lokal-saja untuk brief sensitif</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Kenyataannya lebih kasar daripada pemasarannya</a>, tetapi kontraknya adalah satu-satunya yang benar-benar berlaku.</td></tr>
      <tr><td>Seorang kontributor open-source yang ingin merilis skill desain baru yang bisa diadopsi proyek</td><td><strong>Open Design.</strong> Letakkan sebuah folder, restart daemon-nya, kirim PR.</td></tr>
      <tr><td>Sebuah tim yang menstandarkan sebuah design system portabel yang bertahan dari pergantian alat</td><td><strong>Open Design.</strong> File <code>DESIGN.md</code> berumur lebih panjang daripada alat yang membacanya.</td></tr>
      </tbody>
      </table>

      <p>Dimensi yang menentukan pilihan bagi kebanyakan tim bukanlah kualitas. Melainkan apakah Anda lebih suka menyewa alur kerjanya atau memilikinya.</p>

      <h2>Apa yang harus dilakukan selanjutnya</h2>

      <p>Jika Anda ingin merasakan seperti apa memiliki alur kerjanya sebelum Anda menghabiskan langganan Pro, jalankan quickstart tiga-perintah dan arahkan ke model yang sudah Anda bayar. Semuanya berada dalam satu repo dan deck pertama memakan waktu sekitar sepuluh menit.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Coba alur kerja open-source-nya</a>.</p>

      <h2>Bacaan terkait</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebuah produk</a> — manifesto yang lebih panjang di balik taruhan "lapisan, bukan produk"</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Alur kerja desain BYOK — jalankan Claude, Codex, atau Qwen dengan kunci Anda sendiri</a> — matematika biaya di balik memilih model Anda sendiri</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Pemeriksaan realitas BYOK — lima hal yang rusak</a> — apa yang sebenarnya rusak hari ini di jalur terbuka, dan solusi sementaranya</li>
      </ul>
  nl:
    title: "Het open-source alternatief voor Claude Design"
    summary: "Claude Design is goed. Het is ook closed-source, alleen gehost en gebundeld met een Claude-abonnement. Hier is het eerlijke verhaal over wanneer je ervoor kiest — en wanneer het open-source pad wint."
    bodyHtml: |
      <p>Claude Design is goed. We hebben het gebruikt voor echte briefings. Dat we in plaats daarvan <a href="/blog/why-we-built-open-design-as-a-skill-layer/">een open-source laag hebben gebouwd</a> komt niet doordat Anthropic een slechte tool heeft uitgebracht — dat hebben ze niet. Het komt doordat closed-source, alleen-gehoste designtooling van $20 tot $200 per maand de verkeerde vorm heeft voor het komende decennium aan designwerk. Dit bericht is het eerlijke verhaal over Claude Design vanuit een team dat in dezelfde categorie levert: wat het is, waar het je vastzet, hoe het open-source alternatief er echt uitziet, en welke je dit kwartaal zou moeten kiezen.</p>

      <h2>Wat Claude Design eigenlijk is</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> kwam in april 2026 uit Anthropic Labs. Het is een conversationele designtool aangedreven door Claude Opus 4.7: chat aan de linkerkant, canvas aan de rechterkant. Je beschrijft wat je wilt, Claude genereert een ontwerp, en je itereert via opmerkingen, inline-bewerkingen en promptverfijningen.</p>

      <p>Het doet vier dingen goed:</p>

      <ul>
      <li><strong>Prototypes vanuit proza.</strong> Onboardingflows, instellingenpagina's, adminpanelen, checkoutvarianten — vijf minuten van prompt tot interactief scherm.</li>
      <li><strong>Codebase-bewustzijn.</strong> Importeer een GitHub-repo of koppel een lokale map en de prototypes gebruiken jouw echte componenten, jouw tokensysteem, jouw conventies.</li>
      <li><strong>Merkintegratie.</strong> Stel één keer een design system in en elk project pikt automatisch de kleuren, typografie en componentpatronen op.</li>
      <li><strong>Overdracht naar Claude Code.</strong> De knop "build this" brengt het prototype naar productieklare code in hetzelfde browsertabblad.</li>
      </ul>

      <p>Exports omvatten Canva, PDF, PPTX, HTML en losstaande URL's. De prijsstelling is gebundeld — Claude Pro voor $20, Max voor $100–$200, Enterprise in de gebruikelijke neem-contact-op-laag. Het is momenteel een research preview voor betalende Claude-abonnees.</p>

      <p>Als je <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">de officiële tutorial</a> leest, is de workflow die Anthropic beschrijft dezelfde die Open Design levert: een briefing, een richting, een artefact, een overdracht. De verschillen zitten een laag dieper.</p>

      <h2>Waar het je vastzet</h2>

      <p>Claude Design draagt vier stukken lock-in die het vermelden waard zijn, omdat de marketingpagina's dat niet doen.</p>

      <p><strong>Het model ligt vast.</strong> Elke render gaat via Claude. Niet Claude <em>of</em> een model waarvoor je al hebt betaald — alleen Claude. Als jouw team een contract heeft met GPT, Gemini of DeepSeek, of als je zelf host op Ollama voor gevoelige briefings, dan vertalen die workflows niet. De tokenkosten rijden voor altijd mee op de prijscurve van Anthropic.</p>

      <p><strong>De runtime is gehost.</strong> Jouw prompts, jouw design system en jouw codebase-context reizen allemaal naar de servers van Anthropic. Voor bureauwerk of pre-launch creatief werk onder NDA is dat elke keer een inkoopgesprek. Zelf hosten is geen optie in de research preview, en de aankondiging verplicht zich er niet toe.</p>

      <p><strong>De skills zijn niet van jou.</strong> Het gedrag van Claude Design wordt bepaald door prompts en tools die binnen Anthropic leven. Je kunt ze niet forken, auditen of er een vervangen. De "skills" die Anthropic uitbrengt in Claude Skills zijn aanverwant maar apart; de design-specifieke tooling is intern.</p>

      <p><strong>De rekening is een abonnement.</strong> $20–$200/maand per seat is prima voor een solo-ontwerper, pijnlijk voor een team van twintig, en een non-starter voor de twaalf open-source-bijdragers die anders dezelfde workflow zouden oppakken.</p>

      <p>Geen van deze zijn bugs in Claude Design. Ze zijn de vorm van een gehost product. Anthropic optimaliseerde voor de mediane Pro-abonnee. Wij zijn niet de mediane Pro-abonnee.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Een zwart gefacetteerd wolkenlichaam, vastgemaakt met een stippellijn aan een klein grondanker en serverblok, op een warme redactionele studieplaat" />
        <figcaption>Standaard gehost: jouw prompts, design system en codebase-context reizen naar de servers van iemand anders.</figcaption>
      </figure>

      <h2>Het open-source alternatief</h2>

      <p><strong>Open Design</strong> (deze site) is een andere weddenschap. Het is geen kloon van Claude Design — het is een dunne skill-laag die de coding agent die je al gebruikt verandert in een designengine. De vier primitieven zijn <a href="/blog/31-skills-72-systems-how-the-library-works/">skills, systems, adapters en de daemon</a>. Elke skill is een <code>SKILL.md</code>-bestand. Elk design system is een <code>DESIGN.md</code>-bestand. Elke agent-adapter is ~80 regels TypeScript.</p>

      <p>Wat er vandaag standaard meekomt:</p>

      <ul>
      <li><strong>123 skills</strong> — deckgeneratoren, mobiele mockups, redactionele pagina's, Word/Excel/PPT, merkverkenningen</li>
      <li><strong>148 design systems</strong> — draagbare Markdown-versies van Linear, Vercel, Stripe, Apple, Cursor, Figma, plus een lange staart</li>
      <li><strong>16 coding-agent-CLI's automatisch gedetecteerd</strong> op jouw <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Vergrendelde workflow in vier stappen</strong> — vragenformulier → richtingkiezer → live planstream → gesandboxte iframe-preview</li>
      <li><strong>BYOK standaard</strong> — plak een willekeurige OpenAI-compatibele <code>base_url</code> en sleutel, <a href="/blog/byok-design-workflow-claude-codex-qwen/">jouw tokens gaan rechtstreeks naar de provider</a></li>
      <li><strong>Apache-2.0, geen aanmelding, draait op <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>Het mentale model: Claude Design is een product. Open Design is een laag.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Drie zwarte gefacetteerde veelvlakken op een gemeten basislijn, slechts één in een beugelframe geschoven terwijl de andere los zitten, op een warme redactionele studieplaat" />
        <figcaption>Claude Design legt het model vast. Het open pad laat je het meenemen waarvoor je al betaalt.</figcaption>
      </figure>

      <h2>Naast elkaar</h2>

      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Licentie</td><td>Propriëtair</td><td>Apache-2.0</td></tr>
      <tr><td>Runtime</td><td>Gehost (Anthropic)</td><td>Lokale daemon (<code>pnpm tools-dev</code>) + optionele Vercel-deploy</td></tr>
      <tr><td>Modellen</td><td>Alleen Claude</td><td>Elk OpenAI-compatibel endpoint + 16 gedetecteerde CLI's</td></tr>
      <tr><td>Skills</td><td>Intern</td><td>123 forkbare <code>SKILL.md</code>-mappen</td></tr>
      <tr><td>Design systems</td><td>Merkinstelling per project</td><td>148 draagbare <code>DESIGN.md</code>-bestanden</td></tr>
      <tr><td>Codebase-context</td><td>GitHub-import + lokaal</td><td>Op skill-niveau, echte werkmap</td></tr>
      <tr><td>Prijsstelling</td><td>$20 / $100 / $200 / Enterprise</td><td>Gratis; je betaalt je modelprovider rechtstreeks</td></tr>
      <tr><td>Overdracht</td><td>Claude Code (in-app)</td><td>Elke agent op <code>$PATH</code>, plus HTML / PDF / PPTX / ZIP exports</td></tr>
      <tr><td>Zelf te hosten</td><td>Nee</td><td>Ja (laptop of Vercel)</td></tr>
      <tr><td>Datapad</td><td>Prompts → Anthropic</td><td>Prompts → jouw gekozen provider; niets via ons</td></tr>
      </tbody>
      </table>

      <p>De eerlijke samenvatting: Claude Design heeft de meest gepolijste enkelvoudige-productervaring. Open Design ruilt het gepolijste enkelvoudige-productoppervlak in voor een bibliotheek — meer skills, meer systems, meer agents, ontworpen om te combineren met de agent die al op jouw laptop staat.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Drie dunne zwarte platen gestapeld met zichtbare tussenruimtes als een laagstapel in isometrie, maatstreepjes die de tussenruimtes markeren, een olijfblad bovenop, op een warme redactionele studieplaat" />
        <figcaption>Een product en een laag — Open Design zit tussen jouw agent en het designwerk.</figcaption>
      </figure>

      <h2>Wie zou wat moeten kiezen</h2>

      <table>
      <thead>
      <tr><th>Als je…</th><th>Kies</th></tr>
      </thead>
      <tbody>
      <tr><td>Een solo-PM bij een bedrijf dat al op Claude Pro zit en vóór de lunch een prototype nodig heeft</td><td><strong>Claude Design.</strong> De $20/maand is al uitgegeven; de interface is echt snel.</td></tr>
      <tr><td>Een enterprise-designteam waar Anthropic de inkoop al heeft goedgekeurd</td><td><strong>Claude Design.</strong> Je hebt de integratiekosten één keer betaald; benut ze.</td></tr>
      <tr><td>Een solo-ontwerper die "Claude Design maar gratis" wil</td><td><strong>Open Design.</strong> Gratis, en je bezit de workflow in plaats van hem te huren — richt het op een model waarvoor je al betaalt en het eerste deck duurt ongeveer tien minuten.</td></tr>
      <tr><td>Een design engineer die Claude Code, Codex of Cursor al vanuit de terminal aanstuurt</td><td><strong>Open Design.</strong> Jouw agent is de designengine; de skill-laag voegt smaak en structuur toe zonder een nieuwe app.</td></tr>
      <tr><td>Iedereen die BYOK, modelkeuze midden in een project of alleen-lokaal voor gevoelige briefings nodig heeft</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">De realiteit is ruwer dan de marketing</a>, maar het contract is het enige dat ook echt standhoudt.</td></tr>
      <tr><td>Een open-source-bijdrager die een nieuwe design-skill wil leveren die het project kan overnemen</td><td><strong>Open Design.</strong> Plaats een map, herstart de daemon, stuur de PR.</td></tr>
      <tr><td>Een team dat standaardiseert op een draagbaar design system dat tool-verloop overleeft</td><td><strong>Open Design.</strong> <code>DESIGN.md</code>-bestanden overleven de tool die ze leest.</td></tr>
      </tbody>
      </table>

      <p>De dimensie die het voor de meeste teams bepaalt is niet kwaliteit. Het is of je de workflow liever huurt of bezit.</p>

      <h2>Wat je nu moet doen</h2>

      <p>Als je wilt voelen hoe het is om de workflow te bezitten voordat je geld uitgeeft aan een Pro-abonnement, draai de quickstart met drie commando's en richt hem op het model waarvoor je al betaalt. Het geheel leeft in één repo en het eerste deck duurt ongeveer tien minuten.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Probeer de open-source workflow</a>.</p>

      <h2>Verwante leesstof</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design hebben gebouwd als een skill-laag, niet als een product</a> — het langere manifest achter de weddenschap "laag, geen product"</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK design-workflow — draai Claude, Codex of Qwen op je eigen sleutel</a> — het kostenplaatje achter het kiezen van je eigen model</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK reality check — vijf dingen die kapotgaan</a> — wat het open pad vandaag echt breekt, en de workarounds</li>
      </ul>
  ar:
    title: "البديل مفتوح المصدر لـ Claude Design"
    summary: "Claude Design أداة جيدة. لكنها أيضًا مغلقة المصدر، تعمل على الاستضافة فقط، ومرتبطة باشتراك Claude. إليك القراءة الصادقة لمعرفة متى تختارها — ومتى يفوز المسار مفتوح المصدر."
    bodyHtml: |
      <p>Claude Design أداة جيدة. لقد استخدمناها في مهام حقيقية. أما كوننا <a href="/blog/why-we-built-open-design-as-a-skill-layer/">بنينا طبقة مفتوحة المصدر</a> بدلاً من ذلك فليس لأن Anthropic أطلقت أداة سيئة — لم تفعل. بل لأن أدوات التصميم المغلقة المصدر، التي تعمل على الاستضافة فقط، والتي تكلّف من 20 إلى 200 دولار شهريًا، هي الشكل الخاطئ للعقد القادم من أعمال التصميم. هذه التدوينة هي القراءة الصادقة لـ Claude Design من فريق يطلق منتجات في الفئة نفسها: ما هي، وأين تقيّدك، وكيف يبدو البديل مفتوح المصدر فعليًا، وأيّهما ينبغي أن تختار هذا الربع.</p>

      <h2>ما هي Claude Design فعليًا</h2>

      <p>أُطلقت <a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> من Anthropic Labs في أبريل 2026. إنها أداة تصميم حوارية مدعومة بـ Claude Opus 4.7: المحادثة على اليسار، واللوحة على اليمين. تصف ما تريده، فيُولّد Claude تصميمًا، ثم تتكرّر عليه من خلال التعليقات والتعديلات المباشرة وتحسينات المطالبات.</p>

      <p>تؤدي أربعة أشياء بإتقان:</p>

      <ul>
      <li><strong>نماذج أولية من النصوص.</strong> تدفقات الإعداد، وصفحات الإعدادات، ولوحات الإدارة، وأشكال صفحات الدفع — خمس دقائق من المطالبة إلى شاشة تفاعلية.</li>
      <li><strong>وعي بقاعدة الشيفرة.</strong> استورد مستودع GitHub أو أرفق مجلدًا محليًا، فتستخدم النماذج الأولية مكوّناتك الحقيقية، ونظام الرموز (token) لديك، وأعرافك.</li>
      <li><strong>تكامل العلامة التجارية.</strong> أعدّ نظام تصميم مرة واحدة، فيلتقط كل مشروع تلقائيًا الألوان، والطباعة، وأنماط المكوّنات.</li>
      <li><strong>التسليم إلى Claude Code.</strong> زر «ابنِ هذا» ينقل النموذج الأولي إلى شيفرة جاهزة للإنتاج في علامة التبويب نفسها في المتصفح.</li>
      </ul>

      <p>تشمل صيغ التصدير Canva وPDF وPPTX وHTML وعناوين URL مستقلة. التسعير مجمّع — Claude Pro بسعر 20 دولارًا، وMax بسعر 100–200 دولار، وEnterprise ضمن الفئة المعتادة «اتصل بنا». وهي حاليًا معاينة بحثية لمشتركي Claude المدفوعين.</p>

      <p>إذا قرأت <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">الدليل الرسمي</a>، فإن سير العمل الذي تصفه Anthropic هو نفسه الذي تطرحه Open Design: موجز، ثم توجّه، ثم منتَج، ثم تسليم. الفروقات تكمن في طبقة أسفل.</p>

      <h2>أين تقيّدك</h2>

      <p>تحمل Claude Design أربعة أوجه من التقييد تستحق التسمية منذ البداية، لأن صفحات التسويق لا تذكرها.</p>

      <p><strong>النموذج ثابت.</strong> كل عملية تصيير تمر عبر Claude. ليس Claude <em>أو</em> نموذجًا دفعت ثمنه مسبقًا — بل Claude فقط. إن كان لدى فريقك عقد مع GPT أو Gemini أو DeepSeek، أو إن كنت تستضيف ذاتيًا على Ollama للمهام الحساسة، فإن سير العمل تلك لا تنتقل. وتظل تكلفة الرموز (token) مربوطة بمنحنى تسعير Anthropic إلى الأبد.</p>

      <p><strong>زمن التشغيل مُستضاف.</strong> مطالباتك، ونظام تصميمك، وسياق قاعدة شيفرتك، كلها تنتقل إلى خوادم Anthropic. بالنسبة لعمل الوكالات أو الأعمال الإبداعية ما قبل الإطلاق الخاضعة لاتفاقية عدم إفشاء (NDA)، يصبح ذلك محادثة شراء (procurement) في كل مرة. الاستضافة الذاتية ليست خيارًا في المعاينة البحثية، والإعلان لا يلتزم بتوفيرها.</p>

      <p><strong>المهارات ليست ملكًا لك.</strong> يُحدَّد سلوك Claude Design عبر مطالبات وأدوات تعيش داخل Anthropic. لا يمكنك تفريعها (fork)، أو تدقيقها، أو استبدال أيّ منها. أما «المهارات» التي تطرحها Anthropic ضمن Claude Skills فهي مجاورة لكن منفصلة؛ والأدوات الخاصة بالتصميم داخلية.</p>

      <p><strong>الفاتورة اشتراك.</strong> مبلغ 20–200 دولار شهريًا لكل مقعد مقبول لمصمّم منفرد، ومؤلم لفريق من عشرين، وغير وارد للعشرات من المساهمين مفتوحي المصدر الذين كانوا سيتبنّون سير العمل نفسه لولا ذلك.</p>

      <p>لا شيء من هذا يُعدّ عيبًا في Claude Design. هذه هي طبيعة منتج مُستضاف. لقد حسّنت Anthropic للمشترك الوسطي في خطة Pro. ونحن لسنا المشترك الوسطي في خطة Pro.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="سحابة صلبة سوداء متعددة الأوجه مربوطة بخط متقطع إلى مرساة أرضية صغيرة وكتلة خادم، على لوحة دراسة تحريرية بلون دافئ" />
        <figcaption>مُستضاف افتراضيًا: مطالباتك، ونظام تصميمك، وسياق قاعدة شيفرتك تنتقل إلى خوادم شخص آخر.</figcaption>
      </figure>

      <h2>البديل مفتوح المصدر</h2>

      <p><strong>Open Design</strong> (هذا الموقع) رهان مختلف. إنها ليست نسخة مقلَّدة من Claude Design — بل طبقة مهارات رفيعة تحوّل وكيل البرمجة الذي تستخدمه أصلًا إلى محرك تصميم. العناصر الأولية الأربعة هي <a href="/blog/31-skills-72-systems-how-the-library-works/">المهارات والأنظمة والمحوّلات والخادم الخفي (daemon)</a>. كل مهارة هي ملف <code>SKILL.md</code>. كل نظام تصميم هو ملف <code>DESIGN.md</code>. كل محوّل وكيل هو نحو 80 سطرًا من TypeScript.</p>

      <p>ما يأتي جاهزًا داخل العلبة اليوم:</p>

      <ul>
      <li><strong>123 مهارة</strong> — مولّدات عروض تقديمية، ونماذج محاكاة للجوال، وصفحات تحريرية، وWord/Excel/PPT، واستكشافات للعلامة التجارية</li>
      <li><strong>148 نظام تصميم</strong> — نسخ Markdown قابلة للنقل من Linear وVercel وStripe وApple وCursor وFigma، إضافةً إلى ذيل طويل</li>
      <li><strong>16 واجهة سطر أوامر (CLI) لوكلاء البرمجة يُكتشَف تلقائيًا</strong> على <code>$PATH</code> لديك — Claude Code وCodex وCursor وGemini وOpenCode وCopilot وDevin وHermes وPi وKimi وKiro وQwen وDeepSeek TUI وQoder وMistral Vibe وKilo</li>
      <li><strong>سير عمل مغلق من أربع خطوات</strong> — نموذج أسئلة ← منتقي توجّه ← بث مباشر للخطة ← معاينة في إطار iframe معزول</li>
      <li><strong>BYOK افتراضيًا</strong> — الصق أي <code>base_url</code> ومفتاح متوافق مع OpenAI، <a href="/blog/byok-design-workflow-claude-codex-qwen/">وتذهب رموزك (token) مباشرةً إلى المزوّد</a></li>
      <li><strong>Apache-2.0، بلا تسجيل، يعمل عبر <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>النموذج الذهني: Claude Design منتج. Open Design طبقة.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="ثلاثة مجسّمات سوداء متعددة الأوجه على خط أساس مقاس، واحد منها فقط مثبَّت داخل إطار حاضن بينما يجلس الآخران بحرّية، على لوحة دراسة تحريرية بلون دافئ" />
        <figcaption>Claude Design تثبّت النموذج. المسار المفتوح يتيح لك إحضار النموذج الذي تدفع ثمنه أصلًا.</figcaption>
      </figure>

      <h2>مقارنة جنبًا إلى جنب</h2>

      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>الترخيص</td>
      <td>احتكاري (مملوك)</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>زمن التشغيل</td>
      <td>مُستضاف (Anthropic)</td>
      <td>خادم خفي محلي (<code>pnpm tools-dev</code>) + نشر اختياري على Vercel</td>
      </tr>
      <tr>
      <td>النماذج</td>
      <td>Claude فقط</td>
      <td>أي نقطة نهاية متوافقة مع OpenAI + 16 واجهة CLI مكتشَفة</td>
      </tr>
      <tr>
      <td>المهارات</td>
      <td>داخلية</td>
      <td>123 مجلد <code>SKILL.md</code> قابل للتفريع (fork)</td>
      </tr>
      <tr>
      <td>أنظمة التصميم</td>
      <td>إعداد علامة تجارية لكل مشروع</td>
      <td>148 ملف <code>DESIGN.md</code> قابل للنقل</td>
      </tr>
      <tr>
      <td>سياق قاعدة الشيفرة</td>
      <td>استيراد من GitHub + محلي</td>
      <td>على مستوى المهارة، مجلد عمل حقيقي</td>
      </tr>
      <tr>
      <td>التسعير</td>
      <td>20 / 100 / 200 دولار / Enterprise</td>
      <td>مجاني؛ تدفع لمزوّد نموذجك مباشرةً</td>
      </tr>
      <tr>
      <td>التسليم</td>
      <td>Claude Code (داخل التطبيق)</td>
      <td>أي وكيل على <code>$PATH</code>، إضافةً إلى تصدير HTML / PDF / PPTX / ZIP</td>
      </tr>
      <tr>
      <td>قابلية الاستضافة الذاتية</td>
      <td>لا</td>
      <td>نعم (حاسوب محمول أو Vercel)</td>
      </tr>
      <tr>
      <td>مسار البيانات</td>
      <td>المطالبات ← Anthropic</td>
      <td>المطالبات ← المزوّد الذي تختاره؛ لا شيء يمر عبرنا</td>
      </tr>
      </tbody>
      </table>

      <p>الخلاصة الصادقة: تمتلك Claude Design التجربة الأكثر صقلًا كمنتج واحد. أما Open Design فتقايض السطح المصقول لمنتج واحد بمكتبة — مهارات أكثر، وأنظمة أكثر، ووكلاء أكثر، مصمَّمة لتتركّب مع الوكيل الموجود أصلًا على حاسوبك المحمول.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="ثلاثة ألواح سوداء رفيعة مكدّسة بفجوات ظاهرة مثل حزمة طبقات بإسقاط متساوي القياس (isometric)، مع علامات أبعاد تحدّد الفجوات، وورقة زيتون في الأعلى، على لوحة دراسة تحريرية بلون دافئ" />
        <figcaption>منتج وطبقة — تقع Open Design بين وكيلك وأعمال التصميم.</figcaption>
      </figure>

      <h2>من ينبغي أن يختار ماذا</h2>

      <table>
      <thead>
      <tr>
      <th>إذا كنت…</th>
      <th>اختر</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>مدير منتج منفرد في شركة تستخدم أصلًا Claude Pro ويحتاج إلى نموذج أولي قبل الغداء</td>
      <td><strong>Claude Design.</strong> مبلغ الـ 20 دولارًا شهريًا مدفوع بالفعل؛ والواجهة سريعة حقًا.</td>
      </tr>
      <tr>
      <td>فريق تصميم في مؤسسة سبق أن أجازت فيها Anthropic إجراءات الشراء</td>
      <td><strong>Claude Design.</strong> لقد دفعت كلفة التكامل مرة واحدة؛ فاستثمرها.</td>
      </tr>
      <tr>
      <td>مصمّم منفرد يريد «Claude Design لكن بالمجان»</td>
      <td><strong>Open Design.</strong> مجاني، وأنت تملك سير العمل بدل استئجاره — وجّهه إلى نموذج تدفع ثمنه أصلًا، وأول عرض تقديمي يستغرق نحو عشر دقائق.</td>
      </tr>
      <tr>
      <td>مهندس تصميم يقود أصلًا Claude Code أو Codex أو Cursor من الطرفية</td>
      <td><strong>Open Design.</strong> وكيلك هو محرك التصميم؛ وطبقة المهارات تضيف الذوق والبنية دون تطبيق جديد.</td>
      </tr>
      <tr>
      <td>أي شخص يحتاج إلى BYOK، أو اختيار النموذج في منتصف المشروع، أو العمل محليًا فقط للمهام الحساسة</td>
      <td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">الواقع أكثر وعورة من التسويق</a>، لكن العقد هو الوحيد الذي يصمد فعليًا.</td>
      </tr>
      <tr>
      <td>مساهم مفتوح المصدر يريد طرح مهارة تصميم جديدة يمكن للمشروع تبنّيها</td>
      <td><strong>Open Design.</strong> أسقط مجلدًا، أعد تشغيل الخادم الخفي (daemon)، أرسل طلب السحب (PR).</td>
      </tr>
      <tr>
      <td>فريق يوحّد معاييره على نظام تصميم قابل للنقل يصمد أمام تبدّل الأدوات</td>
      <td><strong>Open Design.</strong> ملفات <code>DESIGN.md</code> تعمّر أطول من الأداة التي تقرأها.</td>
      </tr>
      </tbody>
      </table>

      <p>البُعد الذي يحسم الأمر لمعظم الفرق ليس الجودة. بل ما إذا كنت تفضّل استئجار سير العمل أم امتلاكه.</p>

      <h2>ما الذي تفعله بعد ذلك</h2>

      <p>إن أردت أن ترى شعور امتلاك سير العمل قبل أن تنفق على اشتراك Pro، شغّل البدء السريع بثلاثة أوامر ووجّهه إلى النموذج الذي تدفع ثمنه أصلًا. كل شيء يعيش في مستودع واحد، وأول عرض تقديمي يستغرق نحو عشر دقائق.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">جرّب سير العمل مفتوح المصدر</a>.</p>

      <h2>قراءات ذات صلة</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات، لا كمنتج</a> — البيان الأطول وراء رهان «طبقة، لا منتج»</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل تصميم BYOK — شغّل Claude أو Codex أو Qwen على مفتاحك الخاص</a> — حسابات التكلفة وراء اختيار نموذجك بنفسك</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">فحص واقع BYOK — خمسة أشياء تتعطّل</a> — ما الذي يتعطّل فعلًا في المسار المفتوح اليوم، والحلول البديلة</li>
      </ul>
  tr:
    title: "Claude Design'a açık kaynak alternatifi"
    summary: "Claude Design iyidir. Aynı zamanda kapalı kaynaklıdır, yalnızca barındırılan bir hizmettir ve bir Claude aboneliğiyle paketlenir. İşte ne zaman onu seçmeniz gerektiğine — ve açık kaynak yolunun ne zaman kazandığına — dair dürüst bir değerlendirme."
    bodyHtml: |
      <p>Claude Design iyidir. Onu gerçek brief'lerde kullandık. Bunun yerine <a href="/blog/why-we-built-open-design-as-a-skill-layer/">açık kaynaklı bir katman inşa etmemiz</a>, Anthropic'in kötü bir araç sunmasından kaynaklanmıyor — sunmadılar. Bunun nedeni, kapalı kaynaklı, yalnızca barındırılan, aylık 20 ila 200 dolarlık tasarım araçlarının, tasarım işinin önümüzdeki on yılı için yanlış bir biçim olmasıdır. Bu yazı, aynı kategoride ürün sunan bir ekibin Claude Design hakkındaki dürüst değerlendirmesidir: ne olduğu, sizi nerede kıstırdığı, açık kaynak alternatifinin gerçekte neye benzediği ve bu çeyrekte hangisini seçmeniz gerektiği.</p>

      <h2>Claude Design aslında nedir</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a>, Nisan 2026'da Anthropic Labs'tan çıktı. Claude Opus 4.7 tarafından desteklenen, konuşmaya dayalı bir tasarım aracıdır: solda sohbet, sağda tuval. Ne istediğinizi tarif edersiniz, Claude bir tasarım üretir ve siz yorumlar, satır içi düzenlemeler ve istem iyileştirmeleri aracılığıyla üzerinde çalışırsınız.</p>

      <p>Dört şeyi iyi yapar:</p>

      <ul>
      <li><strong>Düz metinden prototipler.</strong> Onboarding akışları, ayar sayfaları, yönetim panelleri, ödeme varyantları — istemden etkileşimli ekrana beş dakika.</li>
      <li><strong>Kod tabanı farkındalığı.</strong> Bir GitHub deposunu içe aktarın veya yerel bir dizini ekleyin; prototipler sizin gerçek bileşenlerinizi, token sisteminizi ve kurallarınızı kullanır.</li>
      <li><strong>Marka entegrasyonu.</strong> Bir tasarım sistemini bir kez kurun, her proje renkleri, tipografiyi ve bileşen kalıplarını otomatik olarak alır.</li>
      <li><strong>Claude Code'a teslim.</strong> "Bunu derle" düğmesi, prototipi aynı tarayıcı sekmesinde üretime hazır koda dönüştürür.</li>
      </ul>

      <p>Dışa aktarmalar arasında Canva, PDF, PPTX, HTML ve bağımsız URL'ler bulunur. Fiyatlandırma paketlidir — Claude Pro 20 dolar, Max 100–200 dolar, Enterprise her zamanki bizi-arayın katmanında. Şu anda ücretli Claude abonelerine yönelik bir araştırma önizlemesidir.</p>

      <p><a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">Resmi eğitimi</a> okursanız, Anthropic'in anlattığı iş akışı, Open Design'ın sunduğunun aynısıdır: bir brief, bir yön, bir çıktı, bir teslim. Farklar bir katman aşağıda yaşar.</p>

      <h2>Sizi nerede kıstırıyor</h2>

      <p>Claude Design, en baştan adlandırmaya değer dört kilitlenme parçası taşır, çünkü pazarlama sayfaları bunlardan bahsetmez.</p>

      <p><strong>Model sabittir.</strong> Her render Claude üzerinden geçer. Claude <em>ya da</em> zaten parasını ödediğiniz bir model değil — yalnızca Claude. Ekibinizin GPT, Gemini veya DeepSeek ile bir sözleşmesi varsa ya da hassas brief'ler için Ollama üzerinde kendiniz barındırıyorsanız, bu iş akışları aktarılamaz. Token maliyeti sonsuza kadar Anthropic'in fiyatlandırma eğrisine bağlı kalır.</p>

      <p><strong>Çalışma ortamı barındırılır.</strong> İstemleriniz, tasarım sisteminiz ve kod tabanı bağlamınızın tamamı Anthropic'in sunucularına gider. Ajans işleri veya NDA kapsamındaki lansman öncesi yaratıcı çalışmalar için bu, her seferinde bir satın alma görüşmesidir. Araştırma önizlemesinde kendi barındırma bir seçenek değildir ve duyuru böyle bir taahhütte bulunmaz.</p>

      <p><strong>Yetenekler sizin değildir.</strong> Claude Design'ın davranışı, Anthropic'in içinde yaşayan istemler ve araçlar tarafından tanımlanır. Onları çatallayamaz, denetleyemez veya birini değiştiremezsiniz. Anthropic'in Claude Skills'te sunduğu "skill'ler" komşudur ama ayrıdır; tasarıma özgü araçlar ise dahilidir.</p>

      <p><strong>Fatura bir aboneliktir.</strong> Koltuk başına aylık 20–200 dolar, tek başına çalışan bir tasarımcı için sorun değil, yirmi kişilik bir ekip için zahmetli ve aksi takdirde aynı iş akışını benimseyecek bir düzine açık kaynak katkı sağlayıcısı için ise hiç başlamayan bir şey.</p>

      <p>Bunların hiçbiri Claude Design'da bir hata değil. Bunlar barındırılan bir ürünün biçimidir. Anthropic, ortalama Pro abonesi için optimize etti. Biz ortalama Pro abonesi değiliz.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Sıcak, editöryel bir çalışma plakası üzerinde, kesik çizgili bir hatla küçük bir yer çapasına ve sunucu bloğuna bağlanmış, siyah, çok yüzeyli katı bir bulut" />
        <figcaption>Varsayılan olarak barındırılan: istemleriniz, tasarım sisteminiz ve kod tabanı bağlamınız bir başkasının sunucularına gider.</figcaption>
      </figure>

      <h2>Açık kaynak alternatifi</h2>

      <p><strong>Open Design</strong> (bu site) farklı bir bahistir. Bir Claude Design klonu değildir — zaten kullandığınız kodlama ajanını bir tasarım motoruna dönüştüren ince bir skill katmanıdır. Dört temel öğe şunlardır: <a href="/blog/31-skills-72-systems-how-the-library-works/">skill'ler, sistemler, adaptörler ve daemon</a>. Her skill bir <code>SKILL.md</code> dosyasıdır. Her tasarım sistemi bir <code>DESIGN.md</code> dosyasıdır. Her ajan adaptörü ~80 satır TypeScript'tir.</p>

      <p>Bugün kutudan çıkanlar:</p>

      <ul>
      <li><strong>123 skill</strong> — sunum üreticileri, mobil maketler, editöryel sayfalar, Word/Excel/PPT, marka keşifleri</li>
      <li><strong>148 tasarım sistemi</strong> — Linear, Vercel, Stripe, Apple, Cursor, Figma'nın taşınabilir Markdown sürümleri, artı uzun bir kuyruk</li>
      <li><code>$PATH</code> üzerinde <strong>otomatik algılanan 16 kodlama ajanı CLI'ı</strong> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Dört adımlı kilitli iş akışı</strong> — soru formu → yön seçici → canlı plan akışı → korumalı alan içinde iframe önizlemesi</li>
      <li><strong>Varsayılan olarak BYOK</strong> — OpenAI uyumlu herhangi bir <code>base_url</code> ve anahtar yapıştırın, <a href="/blog/byok-design-workflow-claude-codex-qwen/">token'larınız doğrudan sağlayıcıya gider</a></li>
      <li><strong>Apache-2.0, kayıt yok, <code>pnpm tools-dev</code> ile çalışır</strong></li>
      </ul>

      <p>Zihinsel model: Claude Design bir üründür. Open Design bir katmandır.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Sıcak, editöryel bir çalışma plakası üzerinde, ölçülü bir temel hat üzerinde üç siyah, çok yüzeyli çokyüzlü; yalnızca biri bir braket çerçevesine yerleştirilmiş, diğerleri serbest duruyor" />
        <figcaption>Claude Design modeli sabitler. Açık yol, zaten parasını ödediğinizi getirmenize izin verir.</figcaption>
      </figure>

      <h2>Yan yana</h2>

      <table>
      <thead>
      <tr>
      <th></th>
      <th><strong>Claude Design</strong></th>
      <th><strong>Open Design</strong></th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Lisans</td>
      <td>Tescilli</td>
      <td>Apache-2.0</td>
      </tr>
      <tr>
      <td>Çalışma ortamı</td>
      <td>Barındırılan (Anthropic)</td>
      <td>Yerel daemon (<code>pnpm tools-dev</code>) + isteğe bağlı Vercel dağıtımı</td>
      </tr>
      <tr>
      <td>Modeller</td>
      <td>Yalnızca Claude</td>
      <td>OpenAI uyumlu herhangi bir uç nokta + algılanan 16 CLI</td>
      </tr>
      <tr>
      <td>Skill'ler</td>
      <td>Dahili</td>
      <td>Çatallanabilir 123 <code>SKILL.md</code> klasörü</td>
      </tr>
      <tr>
      <td>Tasarım sistemleri</td>
      <td>Proje başına marka kurulumu</td>
      <td>Taşınabilir 148 <code>DESIGN.md</code> dosyası</td>
      </tr>
      <tr>
      <td>Kod tabanı bağlamı</td>
      <td>GitHub içe aktarma + yerel</td>
      <td>Skill düzeyinde, gerçek çalışma dizini</td>
      </tr>
      <tr>
      <td>Fiyatlandırma</td>
      <td>$20 / $100 / $200 / Enterprise</td>
      <td>Ücretsiz; model sağlayıcınıza doğrudan ödersiniz</td>
      </tr>
      <tr>
      <td>Teslim</td>
      <td>Claude Code (uygulama içi)</td>
      <td><code>$PATH</code> üzerindeki herhangi bir ajan, artı HTML / PDF / PPTX / ZIP dışa aktarmaları</td>
      </tr>
      <tr>
      <td>Kendi barındırılabilir</td>
      <td>Hayır</td>
      <td>Evet (dizüstü veya Vercel)</td>
      </tr>
      <tr>
      <td>Veri yolu</td>
      <td>İstemler → Anthropic</td>
      <td>İstemler → seçtiğiniz sağlayıcı; hiçbir şey bizden geçmez</td>
      </tr>
      </tbody>
      </table>

      <p>Dürüst özet: Claude Design, en cilalı tek ürün deneyimine sahiptir. Open Design, cilalı tek ürün yüzeyini bir kütüphane karşılığında takas eder — daha fazla skill, daha fazla sistem, daha fazla ajan; zaten dizüstü bilgisayarınızdaki ajanla birleşecek şekilde tasarlanmıştır.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Sıcak, editöryel bir çalışma plakası üzerinde, izometrik olarak görünür boşluklarla bir katman yığını gibi üst üste dizilmiş üç ince siyah levha; boşlukları işaretleyen boyut çentikleri ve en üstte bir zeytin yaprağı" />
        <figcaption>Bir ürün ve bir katman — Open Design, ajanınızla tasarım işi arasında durur.</figcaption>
      </figure>

      <h2>Kim neyi seçmeli</h2>

      <table>
      <thead>
      <tr>
      <th>Eğer…</th>
      <th>Seçin</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>Zaten Claude Pro kullanan bir şirkette, öğle yemeğinden önce bir prototipe ihtiyaç duyan tek başına çalışan bir PM iseniz</td>
      <td><strong>Claude Design.</strong> Aylık 20 dolar zaten harcanmış; arayüz gerçekten hızlı.</td>
      </tr>
      <tr>
      <td>Anthropic'in satın alma sürecini zaten geçtiği bir kurumsal tasarım ekibiyseniz</td>
      <td><strong>Claude Design.</strong> Entegrasyon maliyetini bir kez ödediniz; onu kullanın.</td>
      </tr>
      <tr>
      <td>"Claude Design ama ücretsiz" isteyen tek başına çalışan bir tasarımcıysanız</td>
      <td><strong>Open Design.</strong> Ücretsiz ve iş akışını kiralamak yerine ona sahip olursunuz — onu zaten parasını ödediğiniz bir modele yönlendirin ve ilk sunum yaklaşık on dakika alsın.</td>
      </tr>
      <tr>
      <td>Zaten Claude Code, Codex veya Cursor'ı terminalden çalıştıran bir tasarım mühendisiyseniz</td>
      <td><strong>Open Design.</strong> Ajanınız tasarım motorudur; skill katmanı, yeni bir uygulama olmadan zevk ve yapı ekler.</td>
      </tr>
      <tr>
      <td>BYOK, proje ortasında model seçimi veya hassas brief'ler için yalnızca yerel çalışmaya ihtiyaç duyan herhangi biriyseniz</td>
      <td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Gerçeklik pazarlamadan daha zorludur</a>, ama gerçekten geçerli olan tek sözleşme budur.</td>
      </tr>
      <tr>
      <td>Projenin benimseyebileceği yeni bir tasarım skill'i sunmak isteyen bir açık kaynak katkı sağlayıcısıysanız</td>
      <td><strong>Open Design.</strong> Bir klasör bırakın, daemon'ı yeniden başlatın, PR'ı gönderin.</td>
      </tr>
      <tr>
      <td>Araç değişimine dayanan taşınabilir bir tasarım sistemi üzerinde standartlaşan bir ekipseniz</td>
      <td><strong>Open Design.</strong> <code>DESIGN.md</code> dosyaları, onları okuyan araçtan daha uzun yaşar.</td>
      </tr>
      </tbody>
      </table>

      <p>Çoğu ekip için kararı belirleyen boyut kalite değildir. İş akışını kiralamayı mı yoksa ona sahip olmayı mı tercih edeceğinizdir.</p>

      <h2>Sonraki adım</h2>

      <p>Bir Pro aboneliğine para harcamadan önce iş akışına sahip olmanın nasıl bir his olduğunu görmek istiyorsanız, üç komutlu hızlı başlangıcı çalıştırın ve onu zaten parasını ödediğiniz modele yönlendirin. Her şey tek bir depoda yaşar ve ilk sunum yaklaşık on dakika alır.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Açık kaynak iş akışını deneyin</a>.</p>

      <h2>İlgili okumalar</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir skill katmanı olarak inşa ettik</a> — "ürün değil, katman" bahsinin arkasındaki daha uzun manifesto</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı — Claude, Codex veya Qwen'i kendi anahtarınızla çalıştırın</a> — kendi modelinizi seçmenin arkasındaki maliyet matematiği</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">BYOK gerçeklik kontrolü — bozulan beş şey</a> — açık yolun bugün gerçekte neyi bozduğu ve geçici çözümler</li>
      </ul>
  uk:
    title: "Альтернатива з відкритим кодом до Claude Design"
    summary: "Claude Design — хороший інструмент. Він також має закритий код, працює лише в хмарі та постачається у комплекті з підпискою Claude. Ось чесний погляд на те, коли варто обрати саме його, а коли перемагає шлях з відкритим кодом."
    bodyHtml: |
      <p>Claude Design — хороший інструмент. Ми використовували його в реальних завданнях. Те, що ми <a href="/blog/why-we-built-open-design-as-a-skill-layer/">побудували шар з відкритим кодом</a>, а не пішли цим шляхом, пояснюється не тим, що Anthropic випустили поганий інструмент — це не так. Це тому, що дизайн-інструментарій із закритим кодом, доступний лише в хмарі, за $20–$200 на місяць має неправильну форму для наступного десятиліття дизайнерської роботи. Цей допис — чесний погляд на Claude Design від команди, яка випускає продукти в тій самій категорії: що це таке, де він прив'язує вас до себе, як насправді виглядає альтернатива з відкритим кодом і яку з них варто обрати цього кварталу.</p>

      <h2>Чим насправді є Claude Design</h2>

      <p><a href="https://www.anthropic.com/news/claude-design-anthropic-labs">Claude Design</a> вийшов з Anthropic Labs у квітні 2026 року. Це розмовний дизайн-інструмент на базі Claude Opus 4.7: чат ліворуч, полотно праворуч. Ви описуєте, чого хочете, Claude генерує дизайн, а ви ітеруєте через коментарі, вбудовані правки та уточнення промптів.</p>

      <p>Він добре робить чотири речі:</p>

      <ul>
      <li><strong>Прототипи з тексту.</strong> Потоки онбордингу, сторінки налаштувань, адмін-панелі, варіанти оформлення замовлення — п'ять хвилин від промпту до інтерактивного екрана.</li>
      <li><strong>Обізнаність про кодову базу.</strong> Імпортуйте репозиторій GitHub або приєднайте локальну директорію, і прототипи використовуватимуть ваші реальні компоненти, вашу систему токенів, ваші угоди.</li>
      <li><strong>Інтеграція бренду.</strong> Налаштуйте дизайн-систему один раз, і кожен проєкт автоматично підхоплює кольори, типографіку та патерни компонентів.</li>
      <li><strong>Передача в Claude Code.</strong> Кнопка «build this» переносить прототип до коду, готового до продакшену, у тій самій вкладці браузера.</li>
      </ul>

      <p>Експорт включає Canva, PDF, PPTX, HTML та окремі URL-адреси. Ціноутворення зібране в пакети — Claude Pro за $20, Max за $100–$200, Enterprise на звичному рівні «зателефонуйте нам». Наразі це дослідницький превʼю для платних підписників Claude.</p>

      <p>Якщо ви прочитаєте <a href="https://support.claude.com/en/articles/14604416-get-started-with-claude-design">офіційний посібник</a>, то робочий процес, який описує Anthropic, такий самий, як той, що пропонує Open Design: завдання, напрямок, артефакт, передача. Відмінності живуть на один шар нижче.</p>

      <h2>Де він прив'язує вас до себе</h2>

      <p>Claude Design несе чотири елементи прив'язки, які варто назвати наперед, бо маркетингові сторінки цього не роблять.</p>

      <p><strong>Модель зафіксована.</strong> Кожен рендер проходить через Claude. Не Claude <em>або</em> модель, за яку ви вже заплатили — лише Claude. Якщо у вашої команди є контракт з GPT, Gemini чи DeepSeek, або якщо ви розгортаєте Ollama на власному обладнанні для чутливих завдань, ці робочі процеси не переносяться. Вартість токенів назавжди прив'язана до цінової кривої Anthropic.</p>

      <p><strong>Середовище виконання — у хмарі.</strong> Ваші промпти, ваша дизайн-система та контекст вашої кодової бази — все мандрує на сервери Anthropic. Для агентської роботи чи допрелізного креативу під NDA це щоразу окрема розмова із закупівлями. Розгортання на власному обладнанні в дослідницькому превʼю недоступне, а в анонсі немає зобов'язань його надати.</p>

      <p><strong>Навички належать не вам.</strong> Поведінка Claude Design визначається промптами та інструментами, які живуть усередині Anthropic. Ви не можете їх форкнути, проаудитувати чи замінити хоча б один. «Навички», які Anthropic постачає в Claude Skills, є суміжними, але окремими; специфічний для дизайну інструментарій — внутрішній.</p>

      <p><strong>Рахунок — це підписка.</strong> $20–$200 на місяць за місце — це нормально для дизайнера-одинака, болісно для команди з двадцяти осіб і неприйнятно для дюжини контриб'юторів з відкритим кодом, які інакше підхопили б той самий робочий процес.</p>

      <p>Жодна з цих речей не є вадою Claude Design. Це форма хмарного продукту. Anthropic оптимізували під медіанного підписника Pro. Ми не медіанний підписник Pro.</p>

      <figure>
        <img src="/blog/plate-19-hosted-cloud.png" alt="Чорна грановита хмара-тіло, прив'язана пунктирною лінією до невеликого наземного якоря та серверного блоку, на теплій редакційній планшетній ілюстрації" />
        <figcaption>За замовчуванням у хмарі: ваші промпти, дизайн-система та контекст кодової бази мандрують на чужі сервери.</figcaption>
      </figure>

      <h2>Альтернатива з відкритим кодом</h2>

      <p><strong>Open Design</strong> (цей сайт) — це інша ставка. Це не клон Claude Design — це тонкий шар навичок, який перетворює кодувальний агент, яким ви вже користуєтесь, на дизайн-рушій. Чотири примітиви — це <a href="/blog/31-skills-72-systems-how-the-library-works/">навички, системи, адаптери та демон</a>. Кожна навичка — це файл <code>SKILL.md</code>. Кожна дизайн-система — це файл <code>DESIGN.md</code>. Кожен адаптер агента — це ~80 рядків TypeScript.</p>

      <p>Що постачається в коробці сьогодні:</p>

      <ul>
      <li><strong>123 навички</strong> — генератори презентацій, мобільні макети, редакційні сторінки, Word/Excel/PPT, дослідження бренду</li>
      <li><strong>148 дизайн-систем</strong> — портативні версії Linear, Vercel, Stripe, Apple, Cursor, Figma у форматі Markdown, плюс довгий хвіст</li>
      <li><strong>16 CLI кодувальних агентів, що визначаються автоматично</strong> у вашому <code>$PATH</code> — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo</li>
      <li><strong>Чотирикроковий зафіксований робочий процес</strong> — форма запитань → вибір напрямку → жива трансляція плану → попередній перегляд у пісочниці iframe</li>
      <li><strong>BYOK за замовчуванням</strong> — вставте будь-який сумісний з OpenAI <code>base_url</code> та ключ, <a href="/blog/byok-design-workflow-claude-codex-qwen/">ваші токени йдуть прямо до провайдера</a></li>
      <li><strong>Apache-2.0, без реєстрації, запускається через <code>pnpm tools-dev</code></strong></li>
      </ul>

      <p>Ментальна модель: Claude Design — це продукт. Open Design — це шар.</p>

      <figure>
        <img src="/blog/plate-20-model-lock.png" alt="Три чорні грановані багатогранники на виміряній базовій лінії, лише один вставлений у скобу-рамку, тоді як інші лежать вільно, на теплій редакційній планшетній ілюстрації" />
        <figcaption>Claude Design фіксує модель. Відкритий шлях дозволяє принести ту, за яку ви вже платите.</figcaption>
      </figure>

      <h2>Порівняння пліч-о-пліч</h2>

      <table>
      <thead>
      <tr><th></th><th><strong>Claude Design</strong></th><th><strong>Open Design</strong></th></tr>
      </thead>
      <tbody>
      <tr><td>Ліцензія</td><td>Пропрієтарна</td><td>Apache-2.0</td></tr>
      <tr><td>Середовище виконання</td><td>У хмарі (Anthropic)</td><td>Локальний демон (<code>pnpm tools-dev</code>) + опціональне розгортання Vercel</td></tr>
      <tr><td>Моделі</td><td>Лише Claude</td><td>Будь-яка сумісна з OpenAI кінцева точка + 16 визначених CLI</td></tr>
      <tr><td>Навички</td><td>Внутрішні</td><td>123 форкабельні теки <code>SKILL.md</code></td></tr>
      <tr><td>Дизайн-системи</td><td>Налаштування бренду для кожного проєкту</td><td>148 портативних файлів <code>DESIGN.md</code></td></tr>
      <tr><td>Контекст кодової бази</td><td>Імпорт з GitHub + локальний</td><td>На рівні навичок, реальна робоча директорія</td></tr>
      <tr><td>Ціноутворення</td><td>$20 / $100 / $200 / Enterprise</td><td>Безкоштовно; ви платите своєму провайдеру моделі напряму</td></tr>
      <tr><td>Передача</td><td>Claude Code (у застосунку)</td><td>Будь-який агент у <code>$PATH</code>, плюс експорт HTML / PDF / PPTX / ZIP</td></tr>
      <tr><td>Можливість самостійного хостингу</td><td>Ні</td><td>Так (ноутбук або Vercel)</td></tr>
      <tr><td>Шлях даних</td><td>Промпти → Anthropic</td><td>Промпти → обраний вами провайдер; нічого не проходить через нас</td></tr>
      </tbody>
      </table>

      <p>Чесне резюме: Claude Design має найвідшліфованіший досвід єдиного продукту. Open Design обмінює відшліфовану поверхню єдиного продукту на бібліотеку — більше навичок, більше систем, більше агентів, спроєктованих так, щоб компонуватися з агентом, який уже є на вашому ноутбуці.</p>

      <figure>
        <img src="/blog/plate-21-layer-stack.png" alt="Три тонкі чорні плити, складені з помітними зазорами, наче стек шарів в ізометрії, мітки розмірів позначають зазори, оливкове листя зверху, на теплій редакційній планшетній ілюстрації" />
        <figcaption>Продукт і шар — Open Design розташований між вашим агентом і дизайнерською роботою.</figcaption>
      </figure>

      <h2>Кому що варто обрати</h2>

      <table>
      <thead>
      <tr><th>Якщо ви…</th><th>Обирайте</th></tr>
      </thead>
      <tbody>
      <tr><td>PM-одинак у компанії, яка вже на Claude Pro, і вам потрібен прототип до обіду</td><td><strong>Claude Design.</strong> $20 на місяць вже витрачені; інтерфейс справді швидкий.</td></tr>
      <tr><td>Корпоративна дизайн-команда, де Anthropic уже пройшов процедуру закупівель</td><td><strong>Claude Design.</strong> Ви вже одного разу заплатили вартість інтеграції; використовуйте її.</td></tr>
      <tr><td>Дизайнер-одинак, який хоче «Claude Design, але безкоштовно»</td><td><strong>Open Design.</strong> Безкоштовно, і ви володієте робочим процесом, а не орендуєте його — спрямуйте його на модель, за яку вже платите, і перша презентація займе близько десяти хвилин.</td></tr>
      <tr><td>Дизайн-інженер, який уже керує Claude Code, Codex чи Cursor з терміналу</td><td><strong>Open Design.</strong> Ваш агент — це дизайн-рушій; шар навичок додає смак і структуру без нового застосунку.</td></tr>
      <tr><td>Будь-хто, кому потрібен BYOK, вибір моделі посеред проєкту або суто локальна робота для чутливих завдань</td><td><strong>Open Design.</strong> <a href="/blog/byok-reality-check-5-things-that-break/">Реальність грубіша за маркетинг</a>, але це єдиний контракт, який справді витримує.</td></tr>
      <tr><td>Контриб'ютор з відкритим кодом, який хоче випустити нову дизайн-навичку, що проєкт може прийняти</td><td><strong>Open Design.</strong> Киньте теку, перезапустіть демон, надішліть PR.</td></tr>
      <tr><td>Команда, яка стандартизується на портативній дизайн-системі, що переживає зміну інструментів</td><td><strong>Open Design.</strong> Файли <code>DESIGN.md</code> переживають інструмент, який їх читає.</td></tr>
      </tbody>
      </table>

      <p>Вимір, який вирішує це для більшості команд, — не якість. Це те, що ви радше — орендувати робочий процес чи володіти ним.</p>

      <h2>Що робити далі</h2>

      <p>Якщо ви хочете відчути, як це — володіти робочим процесом, перш ніж витрачати підписку Pro, запустіть швидкий старт з трьох команд і спрямуйте його на модель, за яку вже платите. Усе це живе в одному репозиторії, і перша презентація займає близько десяти хвилин.</p>

      <p><a href="https://github.com/nexu-io/open-design/releases">Спробуйте робочий процес з відкритим кодом</a>.</p>

      <h2>Дотичне читання</h2>

      <ul>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як шар навичок, а не продукт</a> — довший маніфест за ставкою «шар, а не продукт»</li>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Дизайн-процес BYOK — запускайте Claude, Codex чи Qwen на власному ключі</a> — математика витрат за вибором власної моделі</li>
      <li><a href="/blog/byok-reality-check-5-things-that-break/">Перевірка реальності BYOK — п'ять речей, що ламаються</a> — що відкритий шлях насправді ламає сьогодні та обхідні шляхи</li>
      </ul>
=======
    title: "2026 年最佳 Claude Design 替代品"
    summary: "Claude Design 确实好用——但它闭源、只能托管、锁定模型，还被打包进 Claude 订阅里。如果这几条里有哪一条让你无法接受，这里就是 2026 年最佳的 Claude Design 替代品，按真正要紧的三件事打分：产出归不归你所有、能不能落地成真代码、模型选不选得了？"
    category: "指南"
    bodyHtml: "<p>我在 Open Design 负责产品，这意味着我泡在各种 Claude Design 替代品里的时间多到不太健康——同一份需求，每个工具都跑一遍，一年来回好几次。Claude Design 本身是好东西，这篇不是要踩它。但\"好用\"和\"适合你\"从来不是同一句话。它闭源、只能托管在云端、锁定 Claude 这一个模型、又被打包进 Claude 订阅里——这几条里随便一条，都可能成为你开始搜替代品的理由。</p>\n\n<p>所以这是一份诚实的 2026 年盘点：最好的 Claude Design 替代品，按真正能决定取舍的三件事打分——<strong>产出归不归你所有、能不能落地成真代码、模型选不选得了？</strong> 先把话说在前面：这份名单里有一个工具是我们自己做的；其余工具我都给了实打实的评价，因为一份做了手脚的榜单毫无用处。</p>\n\n<h2>为什么要找 Claude Design 的替代品</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a>（Anthropic Labs，2026）是一个对话式设计工具：左边聊天，右边画布，通过 Claude Code 实现从原型到代码。它快、又精致。团队仍然会另寻他路，原因是结构性的，不是质量问题：</p>\n\n<ul>\n<li><strong>模型是固定的。</strong> 每一次渲染都要经过 Claude。如果你已经在为 GPT、Gemini 付费，或者出于敏感工作的需要自建部署，那些投入在这里都用不上。</li>\n<li><strong>只能云端托管。</strong> 你的 prompt、设计系统、代码库上下文都会被传到 Anthropic 的服务器——对代理机构或有 NDA 的工作来说，这是一场采购合规的拉锯战。</li>\n<li><strong>它是闭源的。</strong> 你没法 fork、没法审计、也没法替换它的设计行为。</li>\n<li><strong>账单是打包进订阅的。</strong> 对一个单干的 Pro 用户来说没问题，对一个团队来说就别扭，对一长串零散的贡献者来说则根本行不通。</li>\n</ul>\n\n<p>如果这些都不困扰你，那 Claude Design 是个不错的选择。如果上面有一条让你点了点头，接着往下读。</p>\n\n<h2>快速对比</h2>\n\n<table>\n<thead>\n<tr><th>工具</th><th>最适合</th><th>开源</th><th>落地真代码</th><th>模型可选</th><th>计费形态</th></tr>\n</thead>\n<tbody>\n<tr><td><strong>Open Design</strong></td><td>掌控整个闭环</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / 任意</td><td>免费，自托管</td></tr>\n<tr><td><strong>Figma (Make / AI)</strong></td><td>团队画布协作</td><td>❌</td><td>部分（导出）</td><td>❌</td><td>按席位订阅</td></tr>\n<tr><td><strong>Google Stitch</strong></td><td>免费、快速打草稿</td><td>❌</td><td>导出到代码/Figma</td><td>❌</td><td>免费（Labs）</td></tr>\n<tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → React 代码</td><td>❌</td><td>✅（React/Tailwind）</td><td>❌</td><td>免费档 + 付费</td></tr>\n<tr><td><strong>Lovable</strong></td><td>Prompt → 完整应用</td><td>❌</td><td>✅（全栈）</td><td>❌</td><td>免费档 + 付费</td></tr>\n<tr><td><strong>Bolt (bolt.new)</strong></td><td>浏览器内构建应用</td><td>部分（开源出身）</td><td>✅</td><td>部分</td><td>按额度计费</td></tr>\n</tbody>\n</table>\n\n<h2>我是怎么评估它们的</h2>\n\n<p>不靠功能数量——靠的是在真实项目里的实战中,什么能活下来。四条标准，按它们\"咬人\"的频率排序：</p>\n\n<ol>\n<li><strong>所有权。</strong> 当你停止付费、或工具发生变更时，你的成果还能以可迁移的形式留在手上，还是被困在别人的云里？</li>\n<li><strong>落地成真代码。</strong> 产出会变成一个能跑起来的界面，还是一张得让人重新手搓一遍的样稿？（也就是整个<a href=\"/blog/vibe-design-vs-vibe-coding/\">从样稿到上线之间的鸿沟</a>。）</li>\n<li><strong>模型自由。</strong> 你能带上自己已经在付费的模型，还是被锁死在某一家厂商的定价曲线上？</li>\n<li><strong>计费形态。</strong> 按席位订阅、按用量额度，还是免费且自托管——以及它扩展到整个团队时是什么走势。</li>\n</ol>\n\n<h2>最好的 Claude Design 替代品</h2>\n\n<h3>1. Open Design——开源、agent-native 之选</h3>\n\n<p><strong>它是什么。</strong> 利益相关声明：这是我们自己的。Open Design 不是 Claude Design 的克隆——它是一层薄薄的开源夹层，把你本来就在跑的那个编码 agent 变成一台设计引擎。每一项技能都是一个 <code>SKILL.md</code> 文件，每一套设计系统都是一份可迁移的 <code>DESIGN.md</code>。</p>\n\n<p><strong>核心特性</strong></p>\n<ul>\n<li>Apache-2.0、本地优先、免注册——跑一句 <code>pnpm tools-dev</code> 即可</li>\n<li>BYOK：带上任意兼容 OpenAI 接口的模型（Claude、GPT、Gemini、DeepSeek，或自建部署）</li>\n<li>自动检测你 <code>$PATH</code> 上已有的 16+ 种编码 agent CLI（Claude Code、Codex、Cursor、OpenCode、Qwen 等等）</li>\n<li>落地成真代码，而不只是样稿——设计与代码同处一个闭环</li>\n<li>开箱即带一整套技能库和可迁移的设计系统</li>\n</ul>\n\n<p><strong>优点：</strong> 一切都归你所有（文件你能 diff、能留存）；没有模型锁定；没有按席位计费的表；与你现有的 agent 协同工作。<br>\n<strong>缺点：</strong> 它是一层你自己跑的东西，不是一个托管好的精致 SaaS——有搭建步骤，而且它不是一块实时多人协作画布。<br>\n<strong>定价：</strong> 免费且开源；你只为自己接入的那个模型付费。<br>\n<strong>最适合：</strong> 拒绝把工作流、文件或模型选择权交给封闭厂商的团队。<br>\n<strong>我的看法：</strong> 如果你离开 Claude Design 的理由是\"闭源 / 托管 / 模型锁定\"，那这就是名单上最直接的答案——它在设计上就是这三件事的反面。</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>它是什么。</strong> 在位的老牌选手。Figma 的 AI 功能和 Figma Make 把生成能力带到了每个设计团队都早已熟悉的那块画布上。</p>\n\n<p><strong>核心特性：</strong> 实时多人画布、成熟的组件/变体、Dev Mode 交付、深厚的插件生态，AI 生成能力嫁接在这一切之上。<br>\n<strong>优点：</strong> 无可匹敌的协作画布；你的团队早就说着这套工作流的\"语言\"；庞大的生态。<br>\n<strong>缺点：</strong> 闭源、专有文件格式、托管在云端；按席位定价；它的 AI 是嫁接在画布工具上的附加件，而不是一个能落地代码的 agent。（参见<a href=\"/blog/figma-alternative-open-design/\">从 Figma 出发的开源路径</a>。）<br>\n<strong>定价：</strong> 按席位订阅，按角色分级。<br>\n<strong>最适合：</strong> 生活在一块共享画布上、想要 AI 在旁边帮衬的设计团队。<br>\n<strong>我的看法：</strong> 如果协作比所有权更重要，这是最稳的选择——而如果你离开 Claude Design 正是因为所有权，那它就是错的那个。</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>它是什么。</strong> Google 的 prompt-to-UI 工具，也是那个把 \"vibe design\" 塞进每个人搜索框的产品。</p>\n\n<p><strong>核心特性：</strong> 过硬的 prompt-to-UI 质量、Voice Canvas、向 Figma 与前端代码导出、在 Google Labs 里免费。<br>\n<strong>优点：</strong> 第一屏画面是真的好；免费又快；是\"按意图做设计\"成本最低的入门坡道。<br>\n<strong>缺点：</strong> Google 的围墙花园——导出是一扇单向门，你的设计系统不是事实源头，而 Labs 的定价/可用性全凭 Google 说了算。（完整的 <a href=\"/blog/vibe-design-with-stitch/\">Stitch 上手实测</a>。）<br>\n<strong>定价：</strong> 在 Labs 里免费（目前）。<br>\n<strong>最适合：</strong> 零成本地探索、勾勒方向。<br>\n<strong>我的看法：</strong> 一块出色的草稿板，但不是一个能让你拥有产品的地方——用它来探索，然后到别处去搭建。</p>\n\n<h3>4. v0 by Vercel</h3>\n\n<p><strong>它是什么。</strong> 一个代码优先的生成器：描述一个 UI，拿到能直接抬进仓库的 React 和 Tailwind。</p>\n\n<p><strong>核心特性：</strong> prompt-to-component、shadcn/Tailwind 产出、与 Vercel/Next.js 技术栈严丝合缝、从一开始就是真代码。<br>\n<strong>优点：</strong> 没有样稿断崖——产出就是可上线的代码；对工程师和设计工程师极其友好。<br>\n<strong>缺点：</strong> 闭源工具；产出和流程都偏向 Vercel 生态；你是在改代码，而不是在画布上做设计。<br>\n<strong>定价：</strong> 免费档加付费用量。<br>\n<strong>最适合：</strong> 想让设计以真前端代码的形态交到手上的开发者。<br>\n<strong>我的看法：</strong> 在闭源工具里\"落地代码\"这件事它做得最强——只是要明白，你已经报名住进代码里了。</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>它是什么。</strong> prompt-to-app：描述你想要什么，Lovable 就给你拉起一个能跑的全栈 Web 应用。</p>\n\n<p><strong>核心特性：</strong> 从一句 prompt 搭出全栈骨架、迭代快、托管预览、适合端到端原型。<br>\n<strong>优点：</strong> 你拿到的是一个能跑的产品，而不是一张图；从零到一的点子做起来速度极快。<br>\n<strong>缺点：</strong> 托管且闭源；应用和它的技术栈绑死；\"设计\"就是框架渲染出来的那个样子，所以<a href=\"/blog/vibe-design-vs-vibe-coding/\">偏移</a>得靠你自己来管。<br>\n<strong>定价：</strong> 免费档加付费套餐。<br>\n<strong>最适合：</strong> 给整个产品打原型的创始人，而不只是做一个屏幕。<br>\n<strong>我的看法：</strong> 当交付物是一个能跑的应用时去找它；当你需要对一套系统有设计掌控权时跳过它。</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>它是什么。</strong> StackBlitz 出品的一个浏览器内 AI 应用构建器，能即时生成并跑起完整的 Web 应用。</p>\n\n<p><strong>核心特性：</strong> 基于浏览器的运行时、prompt-to-app、即时预览与部署、StackBlitz 工具链里的开源出身。<br>\n<strong>优点：</strong> 什么都不用装；应用立刻就能跑；从点子到可点击的闭环很快。<br>\n<strong>缺点：</strong> 按额度计费会越积越多；产出和它的环境绑死；它更像个搭建者，而不是设计者。<br>\n<strong>定价：</strong> 按用量额度。<br>\n<strong>最适合：</strong> 想在同一个小时内就分享出去的、快速可跑的原型。<br>\n<strong>我的看法：</strong> 精神上最接近 \"vibe coding\"——论速度它很出色，论设计一致性这个目标就差些。</p>\n\n<blockquote>\n<p>也值得看一眼：做快速 AI 样稿的 <strong>Visily</strong> 和 <strong>Uizard</strong>（用来出点子很棒，但它们止步于那张图），以及做 AI 生成营销站点的 <strong>Framer AI</strong>。像 <strong>Magic Patterns</strong> 和 <strong>UX Pilot</strong> 这类工具也活跃在同一片原型设计的天地里。这些都不会改变下面那个核心抉择。</p>\n</blockquote>\n\n<h2>如何选择</h2>\n\n<p>把工具对准你离开 Claude Design 的那个理由：</p>\n\n<ul>\n<li><strong>因为它闭源 / 托管 / 模型锁定而离开？</strong> → <strong>Open Design。</strong> 它是这里唯一开源、BYOK、且归你所有的选项。</li>\n<li><strong>因为想要团队画布协作而离开？</strong> → <strong>Figma。</strong></li>\n<li><strong>因为想要免费又快而离开？</strong> → <strong>Google Stitch。</strong></li>\n<li><strong>因为想要真代码、现在就要而离开？</strong> → <strong>v0</strong>（组件）或 <strong>Lovable / Bolt</strong>（整个应用）。</li>\n</ul>\n\n<p>诚实的那个元结论：这里多数工具仍然是闭源、托管或单模型的——它们只是拿 Anthropic 的围墙换成了别人家的围墙。如果你对 Claude Design 的那类问题是锁定，那么只有开源这条路才真正解决了它，而不是把它挪了个地方。</p>\n\n<h2>FAQ</h2>\n\n<p><strong>最好的 Claude Design 替代品是哪个？</strong> 取决于你为什么要走。要所有权、要无锁定，选 Open Design（开源、BYOK）。要协作，选 Figma。要免费打草稿，选 Google Stitch。要落地代码，选 v0 或 Lovable。</p>\n\n<p><strong>有没有免费、开源的 Claude Design 替代品？</strong> 有——Open Design 是 Apache-2.0、免费、自托管；你只为自己带来的那个模型付费。Google Stitch 免费但闭源。</p>\n\n<p><strong>这些里面有哪个能像 Claude Design 那样落地真代码吗？</strong> Open Design、v0、Lovable 和 Bolt 都能产出能跑的代码。样稿工具（Visily、Uizard）和那些画布工具止步得更早。</p>\n\n<p><strong>我必须用 Claude 当模型吗？</strong> 用 Claude Design，那就是必须。用 Open Design 的 BYOK，你可以带任意兼容 OpenAI 接口的模型——Claude、GPT、Gemini、DeepSeek，或自建部署。</p>\n\n<p><strong>那个开源的去哪儿找？</strong> Open Design 在 <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> 上，本地就能跑；参见<a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">我们为什么把它做成一层技能夹层</a>。</p>\n\n<h2>结语</h2>\n\n<p>Claude Design 是个好工具，但有它特定的形状：闭源、托管、单模型、捆绑订阅。对你而言最好的替代品，就是那个能修好这个形状里你最受不了的那一块的工具。如果你缺的是某个功能，这里很多都能满足你。如果是锁定——模型、文件，或运行时——那唯一真正的解法就是那个开源的：<a href=\"/\">Open Design</a> 押的是开源、agent-native 的这一注，相信未来十年的设计工作应当归你所有，从 prompt 一路到上线的代码。</p>\n\n<p><em>准备好试试开源这条路了吗？<a href=\"/download\">打开应用</a>，或<a href=\"/plugins\">浏览技能与设计系统库</a>。</em></p>"
  zh-tw:
    title: "2026 年最佳 Claude Design 替代方案"
    summary: "Claude Design 確實夠好——但它封閉、只能託管、鎖死模型，還綁在 Claude 訂閱裡。只要其中一條讓你過不去，這就是 2026 年最值得考慮的 Claude Design 替代方案，並以真正關鍵的三件事評分：成果歸不歸你、能不能產出真正可上線的程式碼、模型選擇是不是你說了算？"
    category: "指南"
    bodyHtml: "<p>我在 Open Design 帶產品，這意味著我泡在各種 Claude Design 替代方案裡的時間，多到大概有點不健康——同一份需求,每個工具都跑一遍,一年來回幾次。Claude Design 本身很好;這篇不是要把它批倒。但「好」和「適合你」根本不是同一句話。它閉源、只能託管、鎖死在 Claude 這個模型上,還被綁進 Claude 訂閱裡——其中任何一條,都可能正是你開始搜尋替代方案的理由。</p>\n\n<p>所以這是一份誠實的 2026 盤點:最佳的 Claude Design 替代方案,以真正決定勝負的三件事評分——<strong>成果歸不歸你、能不能產出真正可上線的程式碼、模型選擇是不是你說了算?</strong> 先說清楚,這份清單裡有一個工具是我們自己做的;對其他工具的讚許我都寫得實在,因為一份灌水的清單毫無用處。</p>\n\n<h2>為什麼要找 Claude Design 替代方案</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a>(Anthropic Labs,2026)是一款對話式設計工具:左邊聊天,右邊畫布,透過 Claude Code 把原型一路做成程式碼。它快又精緻。團隊之所以還在別處找,理由是結構性的,不是品質問題:</p>\n\n<ul>\n<li><strong>模型是寫死的。</strong>每一次生成都走 Claude。如果你已經付費用 GPT、Gemini,或為了敏感工作自架模型,這些在這裡通通用不上。</li>\n<li><strong>只能託管。</strong>你的提示詞、設計系統、程式碼脈絡都會傳到 Anthropic 的伺服器——對代理商或有 NDA 的案子來說,這是一場採購對話。</li>\n<li><strong>它是封閉的。</strong>你沒辦法 fork、稽核,也換不掉它的設計行為。</li>\n<li><strong>帳單是一筆綁定的訂閱。</strong>對單獨的 Pro 使用者還好,對團隊就尷尬,對一長串零星貢獻者來說則根本行不通。</li>\n</ul>\n\n<p>如果上面這些你都不在意,Claude Design 是個不錯的選擇。如果其中有一條讓你點了頭,那就繼續往下看。</p>\n\n<h2>快速對照</h2>\n\n<table><thead><tr><th>工具</th><th>最適合</th><th>開源</th><th>產出可上線程式碼</th><th>模型選擇</th><th>計價形態</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>掌握整個閉環</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / 任意</td><td>免費,自架</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>團隊畫布協作</td><td>❌</td><td>部分(匯出)</td><td>❌</td><td>按席位訂閱</td></tr><tr><td><strong>Google Stitch</strong></td><td>免費、快速草擬</td><td>❌</td><td>匯出成程式碼/Figma</td><td>❌</td><td>免費(Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>提示詞 → React 程式碼</td><td>❌</td><td>✅(React/Tailwind)</td><td>❌</td><td>免費方案 + 付費</td></tr><tr><td><strong>Lovable</strong></td><td>提示詞 → 完整應用</td><td>❌</td><td>✅(全端)</td><td>❌</td><td>免費方案 + 付費</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>瀏覽器內建構應用</td><td>部分(OSS 出身)</td><td>✅</td><td>部分</td><td>按點數計費</td></tr></tbody></table>\n\n<h2>我是怎麼評的</h2>\n\n<p>不是數功能——而是看哪些東西能在真實專案的碰撞中存活下來。四個標準,按「踩雷頻率」排序:</p>\n\n<ol>\n<li><strong>所有權。</strong>當你停止付費、或工具改版時,你的成果還能以可攜的形式留在手上,還是被困在別人的雲端裡?</li>\n<li><strong>產出真正可上線的程式碼。</strong>產出會變成一個能跑的介面,還是一張要靠人重做一遍的設計稿?(整個<a href=\"/blog/vibe-design-vs-vibe-coding/\">設計稿到上線之間的鴻溝</a>。)</li>\n<li><strong>模型自由。</strong>你能帶上自己已經付費的模型嗎,還是被鎖死在某一家廠商的定價曲線上?</li>\n<li><strong>計價形態。</strong>按席位訂閱、用量點數,還是免費自架——以及這套到整個團隊規模時怎麼擴張。</li>\n</ol>\n\n<h2>最佳 Claude Design 替代方案</h2>\n\n<h3>1. Open Design——開源、agent-native 之選</h3>\n\n<p><strong>它是什麼。</strong>完整揭露:這是我們做的。Open Design 不是 Claude Design 的複製品——它是一層薄薄的開源層,把你手邊已經在跑的 coding agent 變成一台設計引擎。每個 skill 都是一個 <code>SKILL.md</code> 檔案,每套設計系統都是一份可攜的 <code>DESIGN.md</code>。</p>\n\n<p><strong>主要特性</strong></p>\n<ul>\n<li>Apache-2.0、本地優先、免註冊——跑 <code>pnpm tools-dev</code> 即可</li>\n<li>BYOK:帶上任何 OpenAI 相容模型(Claude、GPT、Gemini、DeepSeek,或自架的)</li>\n<li>自動偵測你 <code>$PATH</code> 上已有的 16 種以上 coding-agent CLI(Claude Code、Codex、Cursor、OpenCode、Qwen 等)</li>\n<li>產出真正可上線的程式碼,不只是設計稿——設計與程式碼留在同一個閉環裡</li>\n<li>開箱即用的 skill 庫與可攜設計系統</li>\n</ul>\n\n<p><strong>優點:</strong>所有東西都歸你(可 diff、可留存的檔案);沒有模型綁定;沒有按席位計費;與你既有的 agent 並肩工作。<br>\n<strong>缺點:</strong>它是一層你自己跑的東西,不是一套託管好的精緻 SaaS——需要設定,而且它不是即時多人協作的畫布。<br>\n<strong>計價:</strong>免費且開源;你只為自己指向的那個模型付費。<br>\n<strong>最適合:</strong>拒絕把工作流、檔案或模型選擇交給封閉廠商的團隊。<br>\n<strong>我的看法:</strong>如果你離開 Claude Design 的理由是「封閉 / 託管 / 鎖模型」,這就是清單上最直接的答案——它從設計上就是這三者的相反面。</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>它是什麼。</strong>老牌玩家。Figma 的 AI 功能與 Figma Make,把生成能力帶進了每個設計團隊早已熟悉的畫布。</p>\n\n<p><strong>主要特性:</strong>即時多人協作畫布、成熟的元件/變體、Dev Mode 交接、深厚的外掛生態,再把 AI 生成嫁接到這一切之上。<br>\n<strong>優點:</strong>無可匹敵的協作畫布;你的團隊早就在說的工作流;龐大的生態。<br>\n<strong>缺點:</strong>封閉、私有檔案格式、託管;按席位計價;那個 AI 是貼在畫布工具上的附加功能,不是一個會產出程式碼的 agent。(見<a href=\"/blog/figma-alternative-open-design/\">從 Figma 出發的開源之路</a>。)<br>\n<strong>計價:</strong>按席位訂閱,依角色分級。<br>\n<strong>最適合:</strong>活在共享畫布上、又想要 AI 就在旁邊的設計團隊。<br>\n<strong>我的看法:</strong>如果協作比所有權更重要,這是最安全的選擇——但如果你離開 Claude Design 正是為了所有權,那它就選錯了。</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>它是什麼。</strong>Google 的提示詞轉 UI 工具,也是把「vibe design」推進每個人搜尋框的那款產品。</p>\n\n<p><strong>主要特性:</strong>強悍的提示詞轉 UI 品質、Voice Canvas、可往 Figma 與前端程式碼匯出,在 Google Labs 裡免費。<br>\n<strong>優點:</strong>真的很不錯的首屏;免費又快;以意圖做設計的最佳零成本入口。<br>\n<strong>缺點:</strong>Google 的圍牆地盤——匯出是一扇單向門,你的設計系統不是真相來源,而 Labs 的定價/可用性由 Google 說了算。(完整的 <a href=\"/blog/vibe-design-with-stitch/\">Stitch 上手實測</a>。)<br>\n<strong>計價:</strong>在 Labs 裡免費(目前)。<br>\n<strong>最適合:</strong>零成本地探索與草擬方向。<br>\n<strong>我的看法:</strong>一塊極好的草稿板,而非一個能讓你擁有產品的地方——用它探索,然後到別處去建。</p>\n\n<h3>4. v0 by Vercel</h3>\n\n<p><strong>它是什麼。</strong>一款程式碼優先的生成器:描述一個 UI,拿到可以直接搬進倉庫的 React 與 Tailwind。</p>\n\n<p><strong>主要特性:</strong>提示詞轉元件、shadcn/Tailwind 輸出、與 Vercel/Next.js 技術棧緊密貼合、從一開始就是真正的程式碼。<br>\n<strong>優點:</strong>沒有設計稿斷崖——產出就是可上線的程式碼;對工程師與設計工程師極其友好。<br>\n<strong>缺點:</strong>封閉工具;產出與流程都偏向 Vercel 生態;你是在改程式碼,不是在畫布上做設計。<br>\n<strong>計價:</strong>免費方案外加付費用量。<br>\n<strong>最適合:</strong>想讓設計直接以真正的前端程式碼形式落地的開發者。<br>\n<strong>我的看法:</strong>封閉工具裡「產出可上線程式碼」最強的選項——只是要知道,你已經報名住進程式碼裡了。</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>它是什麼。</strong>提示詞轉應用:描述你想要什麼,Lovable 就生出一個能跑的全端 Web 應用。</p>\n\n<p><strong>主要特性:</strong>從一句提示詞搭出全端骨架、迭代飛快、託管預覽,適合端到端的原型。<br>\n<strong>優點:</strong>你拿到的是一個能跑的產品,不是一張圖;從零到一的點子推進速度極佳。<br>\n<strong>缺點:</strong>託管且封閉;應用與它的技術棧綁死;「設計」就是框架渲染出來的樣子,所以<a href=\"/blog/vibe-design-vs-vibe-coding/\">偏移</a>得你自己去管。<br>\n<strong>計價:</strong>免費方案外加付費方案。<br>\n<strong>最適合:</strong>要做整個產品原型、而不只是一個畫面的創辦人。<br>\n<strong>我的看法:</strong>當交付物是一個能跑的應用時就用它;當你需要對一套系統有設計掌控權時就跳過它。</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>它是什麼。</strong>來自 StackBlitz 的瀏覽器內 AI 應用建構器,能即時生成並執行完整的 Web 應用。</p>\n\n<p><strong>主要特性:</strong>瀏覽器內執行環境、提示詞轉應用、即時預覽與部署,出身自 StackBlitz 工具鏈的開源基因。<br>\n<strong>優點:</strong>不用裝任何東西;應用立刻就跑;從點子到可點擊的閉環很快。<br>\n<strong>缺點:</strong>按點數計費的成本會累積;產出綁在它的環境裡;更像建構器而非設計工具。<br>\n<strong>計價:</strong>用量點數。<br>\n<strong>最適合:</strong>想當小時就分享出去的快速、可執行原型。<br>\n<strong>我的看法:</strong>精神上最接近「vibe coding」——論速度極佳,論設計連貫性就差一些。</p>\n\n<blockquote><p>也值得一看:<strong>Visily</strong> 與 <strong>Uizard</strong> 適合快速的 AI 設計稿(發想很棒,但止步於圖片),以及 <strong>Framer AI</strong> 用於 AI 生成的行銷網站。像 <strong>Magic Patterns</strong> 與 <strong>UX Pilot</strong> 這類工具也在同一片原型製作的領域裡。它們都不會改變下面這個核心抉擇。</p></blockquote>\n\n<h2>該怎麼選</h2>\n\n<p>把工具對上你離開 Claude Design 的理由:</p>\n\n<ul>\n<li><strong>因為它封閉 / 託管 / 鎖模型而離開?</strong> → <strong>Open Design。</strong>這裡唯一一個開源、BYOK、而且歸你的選項。</li>\n<li><strong>因為想要團隊畫布協作而離開?</strong> → <strong>Figma。</strong></li>\n<li><strong>因為想要免費又快而離開?</strong> → <strong>Google Stitch。</strong></li>\n<li><strong>因為現在就想要真正的程式碼而離開?</strong> → <strong>v0</strong>(元件)或 <strong>Lovable / Bolt</strong>(整個應用)。</li>\n</ul>\n\n<p>誠實的元層級論點:這裡多數工具仍然是封閉、託管,或單一模型的——它們只是用別人的圍牆,換掉了 Anthropic 的圍牆。如果你對 Claude Design 的那<em>類</em>問題是綁定,那麼只有開源這條路才真正解決它,而不是把它搬個地方。</p>\n\n<h2>常見問答</h2>\n\n<p><strong>最好的 Claude Design 替代方案是哪個?</strong>取決於你為什麼要離開。要所有權、不要綁定,選 Open Design(開源、BYOK)。要協作,選 Figma。要免費草擬,選 Google Stitch。要產出程式碼,選 v0 或 Lovable。</p>\n\n<p><strong>有沒有免費、開源的 Claude Design 替代方案?</strong>有——Open Design 是 Apache-2.0、免費、自架的;你只為自己帶上的那個模型付費。Google Stitch 免費但封閉。</p>\n\n<p><strong>這些工具裡有沒有能像 Claude Design 一樣產出真正可上線程式碼的?</strong>Open Design、v0、Lovable 和 Bolt 都會產出能跑的程式碼。設計稿工具(Visily、Uizard)和畫布工具則更早就停下了。</p>\n\n<p><strong>我一定要用 Claude 當模型嗎?</strong>用 Claude Design 的話,是的。用 Open Design 的 BYOK,你可以帶上任何 OpenAI 相容模型——Claude、GPT、Gemini、DeepSeek,或自架的。</p>\n\n<p><strong>那個開源的去哪裡找?</strong>Open Design 在 <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> 上,並在本地執行;看看<a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">我們為什麼把它做成一層 skill 層</a>。</p>\n\n<h2>結論</h2>\n\n<p>Claude Design 是個好工具,有它特定的形狀:封閉、託管、單一模型、綁定訂閱。對你而言最好的替代方案,就是那個能修好你受不了的那一塊形狀的工具。如果你缺的是某個功能,這裡很多工具都辦得到。如果是綁定——模型、檔案,或執行環境——那麼唯一真正的解法就是那個開源的:<a href=\"/\">Open Design</a> 押的是這個開源、agent-native 的賭注:未來十年的設計工作,從提示詞一路到上線的程式碼,都該歸你自己擁有。</p>\n\n<p><em>準備好試試開源這條路了嗎?<a href=\"/download\">開啟應用</a>,或<a href=\"/plugins\">瀏覽 skill 與設計系統庫</a>。</em></p>"
  ja:
    title: "2026年版・最良の Claude Design 代替ツール"
    summary: "Claude Design は本当に良い ―― だがクローズドで、ホスト型限定、モデル固定、しかも Claude のサブスクに抱き合わされている。そのどれかが決定的に困るなら、ここに 2026 年の最良の Claude Design 代替ツールを、本当に大事なことで採点して並べた。成果物を自分のものにできるか、本物のコードを出荷できるか、そしてモデルは自分で選べるか?"
    category: "ガイド"
    bodyHtml: "<p>私は Open Design でプロダクトを統括している。つまり、健康にいいとは言えないくらいの時間を、Claude Design の代替ツールの中で過ごしてきたということだ ―― 同じ要件を、すべてのツールで、年に何度か試す。Claude Design 自体は良いツールだし、これはその粗探しではない。だが「良い」と「あなたに合っている」は同じ文章ではない。Claude Design はクローズドソースで、ホスト型限定、モデルは Claude に固定され、Claude のサブスクリプションに抱き合わせられている ―― そのどれか一つが、あなたが代替を探している理由になりうる。</p>\n<p>というわけで、これは正直な 2026 年版まとめだ。最良の Claude Design 代替ツールを、本当に決め手になる 3 つの観点で評価する ―― <strong>成果物を自分のものにできるか、本物のコードを出荷できるか、そしてモデルは自分で選べるか?</strong> 最初に言っておくと、このリストにあるツールの一つは私たちが作っている。他のツールへの評価は本音のままにしてある。出来レースのリストなど何の役にも立たないからだ。</p>\n<h2>Claude Design の代替を探す理由</h2>\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a>（Anthropic Labs、2026 年）は会話型のデザインツールだ。左側でチャット、右側でキャンバス、Claude Code 経由でプロトタイプからコードへ。速くて洗練されている。それでもチームが他を探す理由は、品質ではなく構造的なものだ。</p>\n<ul>\n<li><strong>モデルが固定されている。</strong> すべてのレンダリングは Claude を通る。すでに GPT や Gemini に課金している、あるいは機密の作業のために自前でホストしているなら、それは活かせない。</li>\n<li><strong>ホスト型限定。</strong> プロンプト、デザインシステム、コードベースのコンテキストが Anthropic のサーバーへ渡る ―― 代理店業務や NDA 案件では調達部門との話し合いになる。</li>\n<li><strong>クローズド。</strong> フォークも、監査も、デザインの振る舞いの差し替えもできない。</li>\n<li><strong>料金は抱き合わせのサブスク。</strong> 個人の Pro ユーザーなら問題ないが、チームでは扱いにくく、裾野の広い貢献者にとっては論外だ。</li>\n</ul>\n<p>これらが一つも気にならないなら、Claude Design は良い選択だ。だが今どれか一つにうなずいてしまったなら、読み進めてほしい。</p>\n<h2>クイック比較</h2>\n<table><thead><tr><th>ツール</th><th>最適な用途</th><th>オープンソース</th><th>本物のコードを出荷</th><th>モデル選択</th><th>料金の形</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>ループ全体を自分のものにする</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / 任意</td><td>無料・自前運用</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>チームのキャンバス共同作業</td><td>❌</td><td>一部（エクスポート）</td><td>❌</td><td>シート単位サブスク</td></tr><tr><td><strong>Google Stitch</strong></td><td>無料で素早いスケッチ</td><td>❌</td><td>コード/Figma へエクスポート</td><td>❌</td><td>無料（Labs）</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>プロンプト → React コード</td><td>❌</td><td>✅（React/Tailwind）</td><td>❌</td><td>無料枠 + 有料</td></tr><tr><td><strong>Lovable</strong></td><td>プロンプト → アプリ一式</td><td>❌</td><td>✅（フルスタック）</td><td>❌</td><td>無料枠 + 有料</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>ブラウザ内でのアプリ構築</td><td>一部（OSS 由来）</td><td>✅</td><td>一部</td><td>クレジット制</td></tr></tbody></table>\n<h2>評価のしかた</h2>\n<p>機能の数ではなく、実際のプロジェクトとぶつかって何が生き残るかで評価した。痛みとして効いてくる順に、4 つの基準を挙げる。</p>\n<ol>\n<li><strong>所有権。</strong> 支払いをやめたとき、あるいはツールが変わったとき、自分の作業を持ち運べる形で手元に残せるのか、それとも誰かのクラウドに取り残されるのか?</li>\n<li><strong>本物のコードへ出荷できる。</strong> 成果物は動くインターフェースになるのか、それとも誰かが手で作り直すモックアップなのか?（まさに<a href=\"/blog/vibe-design-vs-vibe-coding/\">モックアップと出荷の間のギャップ</a>だ。）</li>\n<li><strong>モデルの自由。</strong> すでに課金しているモデルを持ち込めるのか、それとも一社の料金カーブに縛られるのか?</li>\n<li><strong>料金の形。</strong> シート単位のサブスク、利用クレジット、それとも無料・自前運用か ―― そしてそれがチーム全体にどうスケールするのか。</li>\n</ol>\n<h2>最良の Claude Design 代替ツール</h2>\n<h3>1. Open Design ―― オープンソースでエージェントネイティブな本命</h3>\n<p><strong>これは何か。</strong> 全面開示しておく。これは私たちのものだ。Open Design は Claude Design のクローンではない ―― あなたがすでに走らせているコーディングエージェントを、デザインエンジンに変える薄いオープンソースのレイヤーだ。あらゆるスキルは一つの <code>SKILL.md</code> ファイルであり、あらゆるデザインシステムは持ち運べる <code>DESIGN.md</code> だ。</p>\n<p><strong>主な特徴</strong></p>\n<ul>\n<li>Apache-2.0、ローカルファースト、サインアップ不要 ―― <code>pnpm tools-dev</code> で動く</li>\n<li>BYOK: OpenAI 互換のモデルなら何でも持ち込める（Claude、GPT、Gemini、DeepSeek、または自前ホスト）</li>\n<li>すでに <code>$PATH</code> 上にある 16 種類以上のコーディングエージェント CLI を自動検出（Claude Code、Codex、Cursor、OpenCode、Qwen など）</li>\n<li>モックアップだけでなく本物のコードへ出荷 ―― デザインとコードが一つのループに収まる</li>\n<li>スキルと持ち運べるデザインシステムのライブラリを最初から同梱</li>\n</ul>\n<p><strong>長所:</strong> すべてを自分のものにできる（diff して手元に残せるファイル群）。モデルの囲い込みなし。シート単位の課金メーターもなし。既存のエージェントと並んで動く。</p>\n<p><strong>短所:</strong> 自分で走らせるレイヤーであって、ホスト型の洗練された SaaS ではない ―― セットアップが要るし、リアルタイムのマルチプレイヤーキャンバスでもない。</p>\n<p><strong>料金:</strong> 無料でオープンソース。支払うのは、向けた先のモデル分だけだ。</p>\n<p><strong>最適な相手:</strong> ワークフロー、ファイル、モデル選択をクローズドなベンダーに明け渡すのを拒むチーム。</p>\n<p><strong>私見:</strong> Claude Design を離れた理由が「クローズド／ホスト型／モデル固定」だったなら、これがこのリストで最も直接的な答えだ ―― 設計からして、その三つすべての正反対だ。</p>\n<h3>2. Figma (Make & AI)</h3>\n<p><strong>これは何か。</strong> 王者。Figma の AI 機能と Figma Make は、どのデザインチームもすでに知っているキャンバスの上に生成を持ち込む。</p>\n<p><strong>主な特徴:</strong> リアルタイムのマルチプレイヤーキャンバス、成熟したコンポーネント／バリアント、Dev Mode のハンドオフ、奥行きのあるプラグインエコシステム、そしてそのすべての上に後付けされた AI 生成。</p>\n<p><strong>長所:</strong> 比類なき共同作業キャンバス。チームがすでに話している言語そのもののワークフロー。巨大なエコシステム。</p>\n<p><strong>短所:</strong> クローズドで、独自のファイル形式、ホスト型。シート単位の料金。AI はコードを出荷するエージェントではなく、キャンバスツールへの追加機能にすぎない。（<a href=\"/blog/figma-alternative-open-design/\">Figma からのオープンソースの道</a>を参照。）</p>\n<p><strong>料金:</strong> シート単位のサブスク、役割ごとの段階制。</p>\n<p><strong>最適な相手:</strong> 共有キャンバスの上で生き、その隣に AI が欲しいデザインチーム。</p>\n<p><strong>私見:</strong> 所有権より共同作業が大事なら最も安全な選択 ―― そして所有権こそが Claude Design を離れた理由なら、間違った選択だ。</p>\n<h3>3. Google Stitch</h3>\n<p><strong>これは何か。</strong> Google のプロンプト → UI ツール。そして「vibe design」をみんなの検索バーに乗せた製品だ。</p>\n<p><strong>主な特徴:</strong> 高いプロンプト → UI 品質、Voice Canvas、Figma やフロントエンドコードへのエクスポート、Google Labs で無料。</p>\n<p><strong>長所:</strong> 本当に良い初期画面。無料で速い。意図でデザインを始めるための、最良の無コスト入口。</p>\n<p><strong>短所:</strong> Google の囲われた領域 ―― エクスポートは一方通行のドアで、デザインシステムが真実の源にはならず、Labs の料金や提供可否は Google の胸先三寸だ。（<a href=\"/blog/vibe-design-with-stitch/\">Stitch を実際に触ってみた全記録</a>。）</p>\n<p><strong>料金:</strong> Labs で無料（今のところ）。</p>\n<p><strong>最適な相手:</strong> ゼロコストで方向性を探り、スケッチすること。</p>\n<p><strong>私見:</strong> 抜群のスケッチパッドであって、プロダクトを所有する場所ではない ―― 探索に使い、構築は別の場所で。</p>\n<h3>4. v0 by Vercel</h3>\n<p><strong>これは何か。</strong> コードファーストのジェネレーター。UI を説明すれば、リポジトリにそのまま持ち込める React と Tailwind が手に入る。</p>\n<p><strong>主な特徴:</strong> プロンプト → コンポーネント、shadcn/Tailwind の出力、Vercel/Next.js スタックとの密な適合、最初から本物のコード。</p>\n<p><strong>長所:</strong> モックアップの崖がない ―― 成果物は出荷できるコードだ。エンジニアやデザインエンジニアに最適。</p>\n<p><strong>短所:</strong> クローズドなツール。出力もフローも Vercel エコシステムに寄っている。キャンバス上でデザインするのではなく、コードを編集することになる。</p>\n<p><strong>料金:</strong> 無料枠に加えて従量課金。</p>\n<p><strong>最適な相手:</strong> デザインが本物のフロントエンドコードとして届いてほしい開発者。</p>\n<p><strong>私見:</strong> クローズドなツールの中では最強の「コードへ出荷」オプション ―― ただし、コードの中で生きることに署名したのだと心得ておくこと。</p>\n<h3>5. Lovable</h3>\n<p><strong>これは何か。</strong> プロンプト → アプリ。欲しいものを説明すれば、Lovable が動くフルスタックの Web アプリを立ち上げる。</p>\n<p><strong>主な特徴:</strong> プロンプトからのフルスタックの足場づくり、速い反復、ホスト型プレビュー、エンドツーエンドのプロトタイプに向く。</p>\n<p><strong>長所:</strong> 絵ではなく動くプロダクトが手に入る。ゼロイチのアイデアには抜群の速度。</p>\n<p><strong>短所:</strong> ホスト型でクローズド。アプリはそのスタックと結婚している。「デザイン」はフレームワークがレンダリングしたもの次第なので、<a href=\"/blog/vibe-design-vs-vibe-coding/\">ドリフト</a>の管理は自分の責任だ。</p>\n<p><strong>料金:</strong> 無料枠に加えて有料プラン。</p>\n<p><strong>最適な相手:</strong> 一画面ではなくプロダクト全体のプロトタイプを作る創業者。</p>\n<p><strong>私見:</strong> 成果物が動くアプリのときに手を伸ばすツール。システムに対するデザインの制御が要るときは見送ろう。</p>\n<h3>6. Bolt (bolt.new)</h3>\n<p><strong>これは何か。</strong> StackBlitz による、ブラウザ内の AI アプリビルダー。フルの Web アプリを生成してその場でライブに動かす。</p>\n<p><strong>主な特徴:</strong> ブラウザベースのランタイム、プロンプト → アプリ、即時のプレビューとデプロイ、StackBlitz ツール群に根ざしたオープンソースの出自。</p>\n<p><strong>長所:</strong> インストール不要。アプリはすぐに動く。アイデアからクリックできるものまでの速いループ。</p>\n<p><strong>短所:</strong> クレジット制のコストは積み重なる。出力はその環境に縛られる。デザイナーというよりビルダーだ。</p>\n<p><strong>料金:</strong> 利用クレジット。</p>\n<p><strong>最適な相手:</strong> その日のうちに共有したい、素早く動くプロトタイプ。</p>\n<p><strong>私見:</strong> 精神的には「vibe coding」に最も近い ―― 速度には抜群だが、デザインの一貫性が目的のときはそうでもない。</p>\n<blockquote><p>あわせて見ておく価値あり: 素早い AI モックアップには <strong>Visily</strong> と <strong>Uizard</strong>（アイデア出しには最高だが、絵で止まる）、AI 生成のマーケティングサイトには <strong>Framer AI</strong>。<strong>Magic Patterns</strong> や <strong>UX Pilot</strong> のようなツールも同じプロトタイピング領域で勝負している。どれも、以下の核心的な判断を変えるものではない。</p></blockquote>\n<h2>選び方</h2>\n<p>Claude Design を離れた理由に、ツールを合わせよう。</p>\n<ul>\n<li><strong>クローズド／ホスト型／モデル固定が理由で離れた?</strong> → <strong>Open Design。</strong> ここでオープンソースかつ BYOK かつ自分のもの、という唯一の選択肢だ。</li>\n<li><strong>チームのキャンバス共同作業が欲しくて離れた?</strong> → <strong>Figma。</strong></li>\n<li><strong>無料で速いのが欲しくて離れた?</strong> → <strong>Google Stitch。</strong></li>\n<li><strong>本物のコードが、今すぐ欲しくて離れた?</strong> → <strong>v0</strong>（コンポーネント）または <strong>Lovable / Bolt</strong>（アプリ一式）。</li>\n</ul>\n<p>正直なメタな論点はこうだ ―― これらのほとんどは依然としてクローズド、ホスト型、または単一モデルであり、Anthropic の壁を別の誰かの壁と取り換えているにすぎない。Claude Design に対して抱える問題が<em>カテゴリーとして</em>囲い込みなのだとしたら、それを移すのではなく実際に解決するのは、オープンソースの道だけだ。</p>\n<h2>FAQ</h2>\n<p><strong>最良の Claude Design 代替ツールは?</strong> 離れる理由による。所有権と囲い込みのなさなら、Open Design（オープンソース、BYOK）。共同作業なら Figma。無料のスケッチなら Google Stitch。コードの出荷なら v0 または Lovable。</p>\n<p><strong>無料でオープンソースの Claude Design 代替はある?</strong> ある ―― Open Design は Apache-2.0 で、無料、自前ホスト。支払うのは持ち込んだモデル分だけだ。Google Stitch は無料だがクローズドだ。</p>\n<p><strong>これらのどれかは Claude Design のように本物のコードへ出荷できる?</strong> Open Design、v0、Lovable、Bolt はいずれも動くコードを生み出す。モックアップツール（Visily、Uizard）やキャンバスツールは、もっと手前で止まる。</p>\n<p><strong>モデルとして Claude を使わなければならない?</strong> Claude Design ではそうだ。Open Design の BYOK なら、OpenAI 互換のモデルなら何でも持ち込める ―― Claude、GPT、Gemini、DeepSeek、または自前ホスト。</p>\n<p><strong>オープンソースのものはどこで見つかる?</strong> Open Design は <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> にあり、ローカルで動く。<a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">なぜスキルレイヤーとして作ったのか</a>も参照。</p>\n<h2>まとめ</h2>\n<p>Claude Design は、特定の形を持った良いツールだ ―― クローズド、ホスト型、単一モデル、サブスク抱き合わせ。あなたにとって最良の代替は、その形のうち、あなたが共に生きられなかった部分を直してくれるものだ。足りないのが機能なら、これらの多くが用を足す。だが足りないのが囲い込み ―― モデル、ファイル、ランタイム ―― なら、本当に直すのはオープンなものだけだ。<a href=\"/\">Open Design</a> は、これからの 10 年のデザインの仕事が、プロンプトから出荷されるコードまで、あなた自身が所有すべきものであるべきだという、オープンソースでエージェントネイティブな賭けだ。</p>\n<p><em>オープンな道を試す準備はいい? <a href=\"/download\">アプリを開く</a>か、<a href=\"/plugins\">スキルとデザインシステムのライブラリを見て回る</a>。</em></p>"
  ko:
    title: "2026년 최고의 Claude Design 대안"
    summary: "Claude Design은 정말 괜찮은 도구다 — 다만 클로즈드 소스에, 호스팅 전용이고, 모델이 고정되어 있으며, Claude 구독에 묶여 있다. 이 중 하나라도 받아들일 수 없다면, 정말 중요한 기준으로 채점한 2026년 최고의 Claude Design 대안들을 여기 모았다: 결과물을 당신이 소유하는가, 실제로 동작하는 코드를 내놓을 수 있는가, 그리고 모델은 당신의 선택인가?"
    category: "가이드"
    bodyHtml: "<p>나는 Open Design에서 프로덕트를 총괄하고 있다. 다시 말해, 건강에 좋을 만큼보다는 훨씬 더 많은 시간을 Claude Design 대안 도구들 속에서 보냈다는 뜻이다 — 같은 브리프를 모든 도구에, 일 년에 몇 차례씩 던져 보면서 말이다. Claude Design 자체는 좋은 도구다. 이 글은 그걸 깎아내리려는 글이 아니다. 하지만 \"좋다\"와 \"당신에게 맞다\"는 같은 문장이 아니다. Claude Design은 클로즈드 소스이고, 호스팅 전용이며, 모델이 Claude로 고정되어 있고, Claude 구독에 묶여 있다 — 그리고 이 중 어느 하나라도 당신이 대안을 찾아 나서게 만든 이유일 수 있다.</p>\n\n<p>그래서 이건 솔직한 2026년 정리다. 최고의 Claude Design 대안들을, 결국 판단을 가르는 세 가지 기준으로 채점했다 — <strong>결과물을 당신이 소유하는가, 실제로 동작하는 코드를 내놓을 수 있는가, 그리고 모델은 당신의 선택인가?</strong> 먼저 밝혀 두자면, 이 목록에 오른 도구 중 하나는 우리가 만든 것이다. 나머지 도구들에 대한 칭찬은 진심으로 적었다. 조작된 목록은 아무 쓸모가 없으니까.</p>\n\n<h2>왜 Claude Design 대안을 찾는가</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a>(Anthropic Labs, 2026)은 대화형 디자인 도구다. 왼쪽에서 채팅하고, 오른쪽에 캔버스가 있으며, Claude Code를 통해 프로토타입에서 코드까지 이어진다. 빠르고 완성도가 높다. 그런데도 팀들이 여전히 다른 곳을 둘러보는 이유는 품질이 아니라 구조적인 데 있다.</p>\n\n<ul>\n<li><strong>모델이 고정되어 있다.</strong> 모든 렌더링이 Claude를 거친다. 이미 GPT, Gemini 비용을 내고 있거나 민감한 작업을 위해 자체 호스팅을 하고 있다면, 그건 여기로 옮겨지지 않는다.</li>\n<li><strong>호스팅 전용이다.</strong> 당신의 프롬프트, 디자인 시스템, 코드베이스 컨텍스트가 Anthropic의 서버로 넘어간다 — 에이전시나 NDA 업무라면 구매 부서와 한바탕 논의해야 할 일이다.</li>\n<li><strong>클로즈드 소스다.</strong> 포크하거나, 감사하거나, 디자인 동작을 바꿔치기할 수 없다.</li>\n<li><strong>청구서가 묶음 구독이다.</strong> 1인 Pro 사용자라면 괜찮지만, 팀에게는 어색하고, 길게 늘어선 기여자 무리에게는 아예 시작조차 안 되는 이야기다.</li>\n</ul>\n\n<p>이 중 어느 것도 거슬리지 않는다면 Claude Design은 괜찮은 선택이다. 방금 그중 하나에 고개를 끄덕였다면, 계속 읽어 보길.</p>\n\n<h2>한눈에 보는 비교</h2>\n\n<table>\n<thead>\n<tr><th>도구</th><th>가장 적합한 경우</th><th>오픈 소스</th><th>실제 코드 출력</th><th>모델 선택</th><th>가격 구조</th></tr>\n</thead>\n<tbody>\n<tr><td><strong>Open Design</strong></td><td>전체 루프를 소유하기</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / 무엇이든</td><td>무료, 직접 실행</td></tr>\n<tr><td><strong>Figma (Make / AI)</strong></td><td>팀 캔버스 협업</td><td>❌</td><td>일부 (내보내기)</td><td>❌</td><td>좌석당 구독</td></tr>\n<tr><td><strong>Google Stitch</strong></td><td>무료로 빠르게 스케치</td><td>❌</td><td>코드/Figma로 내보내기</td><td>❌</td><td>무료 (Labs)</td></tr>\n<tr><td><strong>v0 (Vercel)</strong></td><td>프롬프트 → React 코드</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>무료 등급 + 유료</td></tr>\n<tr><td><strong>Lovable</strong></td><td>프롬프트 → 완전한 앱</td><td>❌</td><td>✅ (풀스택)</td><td>❌</td><td>무료 등급 + 유료</td></tr>\n<tr><td><strong>Bolt (bolt.new)</strong></td><td>브라우저 내 앱 빌드</td><td>일부 (OSS 뿌리)</td><td>✅</td><td>일부</td><td>크레딧 기반</td></tr>\n</tbody>\n</table>\n\n<h2>이들을 어떻게 평가했나</h2>\n\n<p>기능 개수가 아니라 — 실제 프로젝트와 맞부딪쳐 살아남는 것이 무엇인지로 평가했다. 자주 발목을 잡는 순서대로, 네 가지 기준이다.</p>\n\n<ol>\n<li><strong>소유권.</strong> 결제를 멈추거나 도구가 바뀌었을 때, 당신의 작업을 이식 가능한 형태로 계속 보유하는가, 아니면 누군가의 클라우드에 발이 묶이는가?</li>\n<li><strong>실제 코드로 이어지는가.</strong> 결과물이 실행되는 인터페이스가 되는가, 아니면 누군가 손으로 다시 만들어야 하는 목업인가? (바로 그 <a href=\"/blog/vibe-design-vs-vibe-coding/\">목업과 출시 사이의 간극</a> 말이다.)</li>\n<li><strong>모델 자유.</strong> 이미 비용을 내고 있는 모델을 가져올 수 있는가, 아니면 한 벤더의 가격 곡선에 묶이는가?</li>\n<li><strong>가격 구조.</strong> 좌석당 구독, 사용량 크레딧, 아니면 무료-직접-실행 — 그리고 그게 팀 전체로 어떻게 확장되는가.</li>\n</ol>\n\n<h2>최고의 Claude Design 대안들</h2>\n\n<h3>1. Open Design — 오픈 소스, 에이전트 네이티브 선택</h3>\n\n<p><strong>무엇인가.</strong> 솔직히 밝히자면, 이건 우리 것이다. Open Design은 Claude Design 클론이 아니다 — 이미 돌리고 있는 코딩 에이전트를 디자인 엔진으로 바꿔 주는 얇은 오픈 소스 레이어다. 모든 스킬은 하나의 <code>SKILL.md</code> 파일이고, 모든 디자인 시스템은 이식 가능한 <code>DESIGN.md</code>다.</p>\n\n<p><strong>핵심 기능</strong></p>\n<ul>\n<li>Apache-2.0, 로컬 우선, 가입 불필요 — <code>pnpm tools-dev</code>로 실행</li>\n<li>BYOK: OpenAI 호환 모델이라면 무엇이든 가져오기 (Claude, GPT, Gemini, DeepSeek, 또는 자체 호스팅)</li>\n<li>이미 <code>$PATH</code>에 있는 16개 이상의 코딩 에이전트 CLI를 자동 감지 (Claude Code, Codex, Cursor, OpenCode, Qwen 등)</li>\n<li>목업이 아니라 실제 코드로 이어진다 — 디자인과 코드가 하나의 루프에 머문다</li>\n<li>기본 제공되는 스킬과 이식 가능한 디자인 시스템 라이브러리</li>\n</ul>\n\n<p><strong>장점:</strong> 모든 것을 당신이 소유한다(diff하고 간직할 수 있는 파일들). 모델 종속 없음. 좌석당 미터기 없음. 기존 에이전트와 나란히 동작한다.<br>\n<strong>단점:</strong> 호스팅된 매끈한 SaaS가 아니라 당신이 직접 돌리는 레이어다 — 셋업이 필요하고, 실시간 멀티플레이어 캔버스도 아니다.<br>\n<strong>가격:</strong> 무료이며 오픈 소스. 당신이 가리키는 모델 비용만 낸다.<br>\n<strong>가장 적합한 경우:</strong> 자신의 워크플로, 파일, 모델 선택을 클로즈드 벤더에게 넘기길 거부하는 팀.<br>\n<strong>내 생각:</strong> Claude Design을 떠난 이유가 \"클로즈드 / 호스팅 / 모델 고정\"이었다면, 이 목록에서 가장 직접적인 답이다 — 설계상 그 셋 모두의 정반대다.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>무엇인가.</strong> 터줏대감이다. Figma의 AI 기능과 Figma Make는 모든 디자인 팀이 이미 아는 캔버스 위로 생성 기능을 끌어온다.</p>\n\n<p><strong>핵심 기능:</strong> 실시간 멀티플레이어 캔버스, 성숙한 컴포넌트/배리언트, Dev Mode 핸드오프, 두터운 플러그인 생태계, 그리고 그 모든 것 위에 덧붙은 AI 생성.<br>\n<strong>장점:</strong> 견줄 데 없는 협업 캔버스. 당신의 팀이 이미 쓰는 워크플로. 거대한 생태계.<br>\n<strong>단점:</strong> 클로즈드, 독점 파일 포맷, 호스팅. 좌석당 가격. AI는 코드를 내놓는 에이전트가 아니라 캔버스 도구에 덧붙은 부가 기능이다. (<a href=\"/blog/figma-alternative-open-design/\">Figma에서 오픈 소스로 가는 길</a>을 보라.)<br>\n<strong>가격:</strong> 좌석당 구독, 역할별 등급제.<br>\n<strong>가장 적합한 경우:</strong> 공유 캔버스 위에서 살아가며 그 옆에 AI를 두고 싶은 디자인 팀.<br>\n<strong>내 생각:</strong> 소유권보다 협업이 더 중요하다면 가장 안전한 선택이다 — 그리고 소유권 때문에 Claude Design을 떠났다면 잘못된 선택이다.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>무엇인가.</strong> Google의 프롬프트-투-UI 도구이자, \"vibe design\"이라는 말을 모두의 검색창에 올려놓은 제품이다.</p>\n\n<p><strong>핵심 기능:</strong> 강력한 프롬프트-투-UI 품질, Voice Canvas, Figma 및 프런트엔드 코드로의 내보내기, Google Labs에서 무료.<br>\n<strong>장점:</strong> 진짜로 괜찮은 첫 화면들. 무료이고 빠르다. 의도로 디자인하기로 들어서는 가장 좋은 무료 진입로.<br>\n<strong>단점:</strong> Google의 담장 안 영역 — 내보내기는 일방통행이고, 당신의 디자인 시스템이 진실의 원천이 아니며, Labs의 가격/가용성은 Google이 결정한다. (<a href=\"/blog/vibe-design-with-stitch/\">Stitch 직접 사용기 전체</a>.)<br>\n<strong>가격:</strong> Labs에서 무료 (당분간).<br>\n<strong>가장 적합한 경우:</strong> 비용 0으로 방향을 탐색하고 스케치하기.<br>\n<strong>내 생각:</strong> 훌륭한 스케치패드일 뿐, 제품을 소유할 곳은 아니다 — 탐색에 쓰고, 빌드는 다른 곳에서 하라.</p>\n\n<h3>4. v0 by Vercel</h3>\n\n<p><strong>무엇인가.</strong> 코드 우선 생성기다. UI를 설명하면, 레포에 그대로 옮겨 담을 수 있는 React와 Tailwind를 내준다.</p>\n\n<p><strong>핵심 기능:</strong> 프롬프트-투-컴포넌트, shadcn/Tailwind 출력, Vercel/Next.js 스택과의 빈틈없는 궁합, 처음부터 실제 코드.<br>\n<strong>장점:</strong> 목업의 절벽이 없다 — 결과물이 출시 가능한 코드다. 엔지니어와 디자인 엔지니어에게 탁월하다.<br>\n<strong>단점:</strong> 클로즈드 도구. 출력과 흐름이 Vercel 생태계 쪽으로 기운다. 캔버스에서 디자인하는 게 아니라 코드를 편집하는 것이다.<br>\n<strong>가격:</strong> 무료 등급 더하기 유료 사용량.<br>\n<strong>가장 적합한 경우:</strong> 디자인이 실제 프런트엔드 코드로 도착하길 바라는 개발자.<br>\n<strong>내 생각:</strong> 클로즈드 도구들 가운데 가장 강력한 \"코드로 이어진다\" 옵션이다 — 다만 코드 속에서 살기로 등록했다는 점은 알아 두길.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>무엇인가.</strong> 프롬프트-투-앱이다. 원하는 것을 설명하면 Lovable이 동작하는 풀스택 웹 앱을 뚝딱 만들어 낸다.</p>\n\n<p><strong>핵심 기능:</strong> 프롬프트로부터의 풀스택 스캐폴딩, 빠른 반복, 호스팅 미리보기, 엔드투엔드 프로토타입에 적합.<br>\n<strong>장점:</strong> 그림이 아니라 동작하는 제품을 얻는다. 0에서 1로 가는 아이디어에 엄청난 속도.<br>\n<strong>단점:</strong> 호스팅에 클로즈드. 앱이 자기 스택에 묶여 있다. \"디자인\"은 프레임워크가 렌더링한 결과물일 뿐이라, <a href=\"/blog/vibe-design-vs-vibe-coding/\">드리프트</a>는 당신이 관리해야 할 몫이다.<br>\n<strong>가격:</strong> 무료 등급 더하기 유료 플랜.<br>\n<strong>가장 적합한 경우:</strong> 화면 하나가 아니라 제품 전체를 프로토타이핑하는 창업자.<br>\n<strong>내 생각:</strong> 결과물이 동작하는 앱일 때 손을 뻗어라. 시스템에 대한 디자인 통제가 필요할 때는 건너뛰어라.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>무엇인가.</strong> StackBlitz가 만든 브라우저 내 AI 앱 빌더로, 완전한 웹 앱을 생성하고 라이브로 실행한다.</p>\n\n<p><strong>핵심 기능:</strong> 브라우저 기반 런타임, 프롬프트-투-앱, 즉각적인 미리보기와 배포, StackBlitz 도구에 뿌리를 둔 오픈 소스.<br>\n<strong>장점:</strong> 설치할 것이 없다. 앱이 즉시 실행된다. 아이디어에서 클릭 가능한 결과까지 가는 빠른 루프.<br>\n<strong>단점:</strong> 크레딧 기반 비용이 쌓인다. 출력이 자기 환경에 묶여 있다. 디자이너라기보다 빌더에 가깝다.<br>\n<strong>가격:</strong> 사용량 크레딧.<br>\n<strong>가장 적합한 경우:</strong> 같은 시간 안에 공유하고 싶은 빠르고 실행 가능한 프로토타입.<br>\n<strong>내 생각:</strong> 정신적으로 \"vibe coding\"에 가장 가깝다 — 속도에는 탁월하지만, 디자인 일관성이 목표일 때는 덜하다.</p>\n\n<blockquote><p>한번 살펴볼 만한 것들: 빠른 AI 목업에는 <strong>Visily</strong>와 <strong>Uizard</strong>(아이데이션에는 훌륭하지만 그림에서 멈춘다), AI로 생성하는 마케팅 사이트에는 <strong>Framer AI</strong>. <strong>Magic Patterns</strong>와 <strong>UX Pilot</strong> 같은 도구도 같은 프로토타이핑 영역에서 논다. 하지만 어느 것도 아래의 핵심 판단을 바꾸지는 못한다.</p></blockquote>\n\n<h2>어떻게 고를 것인가</h2>\n\n<p>Claude Design을 떠난 이유에 도구를 맞춰라.</p>\n\n<ul>\n<li><strong>클로즈드 / 호스팅 / 모델 고정 때문에 떠났나?</strong> → <strong>Open Design.</strong> 여기서 오픈 소스이고, BYOK이며, 당신의 것인 유일한 선택지다.</li>\n<li><strong>팀 캔버스 협업을 원해서 떠났나?</strong> → <strong>Figma.</strong></li>\n<li><strong>무료에 빠른 것을 원해서 떠났나?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>실제 코드를 지금 당장 원해서 떠났나?</strong> → <strong>v0</strong>(컴포넌트) 또는 <strong>Lovable / Bolt</strong>(앱 전체).</li>\n</ul>\n\n<p>솔직한 메타적 결론: 이들 대부분은 여전히 클로즈드이거나, 호스팅 전용이거나, 단일 모델이다 — Anthropic의 담장을 다른 누군가의 담장으로 바꿔 끼울 뿐이다. Claude Design에서 당신이 겪는 문제가 종속이라는 <em>범주</em>의 문제라면, 그것을 옮겨 놓는 게 아니라 실제로 해결하는 건 오직 오픈 소스의 길뿐이다.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>최고의 Claude Design 대안은 무엇인가?</strong> 왜 떠나는지에 달려 있다. 소유권과 무종속을 위해서라면 Open Design(오픈 소스, BYOK). 협업이라면 Figma. 무료 스케치라면 Google Stitch. 코드 출시라면 v0 또는 Lovable.</p>\n\n<p><strong>무료에 오픈 소스인 Claude Design 대안이 있나?</strong> 있다 — Open Design은 Apache-2.0이고, 무료이며, 자체 호스팅이다. 가져오는 모델 비용만 낸다. Google Stitch는 무료지만 클로즈드다.</p>\n\n<p><strong>이것들 중에 Claude Design처럼 실제 코드로 이어지는 게 있나?</strong> Open Design, v0, Lovable, Bolt 모두 실행되는 코드를 만들어 낸다. 목업 도구들(Visily, Uizard)과 캔버스 도구들은 더 일찍 멈춘다.</p>\n\n<p><strong>모델로 꼭 Claude를 써야 하나?</strong> Claude Design이라면 그렇다. Open Design의 BYOK라면 OpenAI 호환 모델이라면 무엇이든 가져온다 — Claude, GPT, Gemini, DeepSeek, 또는 자체 호스팅.</p>\n\n<p><strong>오픈 소스인 그건 어디서 찾나?</strong> Open Design은 <a href=\"https://github.com/nexu-io/open-design\">GitHub</a>에 있고 로컬에서 실행된다. <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">우리가 왜 그것을 스킬 레이어로 만들었는지</a>를 보라.</p>\n\n<h2>핵심 정리</h2>\n\n<p>Claude Design은 특정한 형태를 가진 좋은 도구다 — 클로즈드, 호스팅, 단일 모델, 구독 묶음. 당신에게 최고의 대안은, 당신이 도저히 받아들일 수 없었던 그 형태의 한 부분을 고쳐 주는 바로 그것이다. 빠진 게 기능 하나라면, 이들 중 상당수가 해결해 줄 것이다. 빠진 게 종속이라면 — 모델, 파일, 또는 런타임 — 진짜 해결책은 오직 오픈된 길뿐이다. <a href=\"/\">Open Design</a>은, 다음 10년의 디자인 작업이 프롬프트에서 출시된 코드까지 온전히 당신의 소유여야 한다는, 오픈 소스이자 에이전트 네이티브한 베팅이다.</p>\n\n<p><em>오픈된 길을 시도해 볼 준비가 됐는가? <a href=\"/download\">앱을 열어 보거나</a> <a href=\"/plugins\">스킬과 디자인 시스템 라이브러리를 둘러보라</a>.</em></p>"
  de:
    title: "Die besten Claude Design-Alternativen 2026"
    summary: "Claude Design ist wirklich gut – aber es ist Closed Source, gehostet, an ein Modell gebunden und an ein Claude-Abo gekoppelt. Wenn auch nur eines davon für Sie ein Ausschlusskriterium ist, finden Sie hier die besten Claude Design-Alternativen 2026, bewertet nach dem, was wirklich zählt: Gehört es Ihnen, kann es echten Code ausliefern und ist das Modell Ihre Wahl?"
    category: "Leitfäden"
    bodyHtml: "<p>Ich leite das Produkt bei Open Design, was bedeutet, dass ich mehr Zeit in Claude Design-Alternativen verbracht habe, als wahrscheinlich gesund ist – dasselbe Briefing, jedes Tool, ein paar Mal im Jahr. Claude Design selbst ist gut; das hier ist keine Abrechnung. Aber „gut\" und „richtig für dich\" sind nicht derselbe Satz. Es ist Closed Source, nur gehostet, fest an Claude als Modell gebunden und in ein Claude-Abo eingebunden – und jeder einzelne dieser Punkte kann der Grund sein, warum du nach einer Alternative suchst.</p>\n\n<p>Das hier ist also der ehrliche 2026er-Überblick: die besten Claude Design-Alternativen, bewertet nach den drei Dingen, die wirklich den Ausschlag geben – <strong>gehört dir das Ergebnis, kann es echten Code ausliefern und ist das Modell deine Wahl?</strong> Ich sage gleich vorweg: Wir bauen eines der Tools auf dieser Liste; das Lob für die anderen habe ich ehrlich gehalten, denn eine geschönte Liste ist eine nutzlose Liste.</p>\n\n<h2>Warum nach einer Claude Design-Alternative suchen</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) ist ein dialogbasiertes Design-Tool: Chat links, Canvas rechts, vom Prototyp zum Code über Claude Code. Es ist schnell und ausgefeilt. Die Gründe, warum Teams sich trotzdem anderswo umsehen, sind struktureller Natur, keine Qualitätsfrage:</p>\n\n<ul>\n<li><strong>Das Modell ist festgelegt.</strong> Jedes Rendering läuft über Claude. Wenn du bereits für GPT oder Gemini zahlst oder für sensible Arbeit selbst hostest, lässt sich das nicht übertragen.</li>\n<li><strong>Es ist nur gehostet.</strong> Deine Prompts, dein Designsystem und der Kontext deiner Codebasis wandern auf die Server von Anthropic – ein Thema für die Beschaffung bei Agentur- oder NDA-Arbeit.</li>\n<li><strong>Es ist Closed Source.</strong> Du kannst das Designverhalten nicht forken, auditieren oder austauschen.</li>\n<li><strong>Die Rechnung ist ein gebündeltes Abo.</strong> In Ordnung für eine einzelne Pro-Nutzerin, unbequem für ein Team, ein No-Go für die lange Reihe gelegentlicher Mitwirkender.</li>\n</ul>\n\n<p>Wenn dich nichts davon stört, ist Claude Design eine gute Wahl. Wenn dich gerade einer dieser Punkte zum Nicken gebracht hat, lies weiter.</p>\n\n<h2>Schneller Vergleich</h2>\n\n<table><thead><tr><th>Tool</th><th>Am besten für</th><th>Open Source</th><th>Liefert echten Code</th><th>Modellwahl</th><th>Preismodell</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Den gesamten Loop besitzen</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / beliebig</td><td>Kostenlos, selbst betrieben</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Zusammenarbeit auf dem Team-Canvas</td><td>❌</td><td>Teilweise (Export)</td><td>❌</td><td>Abo pro Platz</td></tr><tr><td><strong>Google Stitch</strong></td><td>Kostenloses, schnelles Skizzieren</td><td>❌</td><td>Export zu Code/Figma</td><td>❌</td><td>Kostenlos (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → React-Code</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Kostenlose Stufe + kostenpflichtig</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → komplette App</td><td>❌</td><td>✅ (Full-Stack)</td><td>❌</td><td>Kostenlose Stufe + kostenpflichtig</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>App-Builds im Browser</td><td>Teilweise (OSS-Wurzeln)</td><td>✅</td><td>Teilweise</td><td>Guthabenbasiert</td></tr></tbody></table>\n\n<h2>Wie ich diese bewertet habe</h2>\n\n<p>Nicht nach Funktionsumfang – sondern danach, was den Kontakt mit einem echten Projekt übersteht. Vier Kriterien, in der Reihenfolge, wie häufig sie zubeißen:</p>\n\n<ol>\n<li><strong>Eigentum.</strong> Wenn du aufhörst zu zahlen oder sich das Tool ändert, behältst du deine Arbeit in einer portablen Form, oder steckt sie in irgendjemandes Cloud fest?</li>\n<li><strong>Liefert echten Code.</strong> Wird das Ergebnis zu einem laufenden Interface oder zu einem Mockup, das jemand von Hand neu baut? (Die ganze <a href=\"/blog/vibe-design-vs-vibe-coding/\">Lücke zwischen Mockup und ausgeliefertem Produkt</a>.)</li>\n<li><strong>Modellfreiheit.</strong> Kannst du das Modell mitbringen, für das du bereits zahlst, oder bist du an die Preiskurve eines einzigen Anbieters gebunden?</li>\n<li><strong>Preismodell.</strong> Abo pro Platz, Nutzungsguthaben oder kostenlos und selbst betrieben – und wie skaliert das auf ein ganzes Team?</li>\n</ol>\n\n<h2>Die besten Claude Design-Alternativen</h2>\n\n<h3>1. Open Design – die Open-Source-, agentennative Wahl</h3>\n\n<p><strong>Was es ist.</strong> Volle Offenlegung: Das ist unseres. Open Design ist kein Claude Design-Klon – es ist eine dünne Open-Source-Schicht, die den Coding-Agenten, den du bereits betreibst, in eine Design-Engine verwandelt. Jeder Skill ist eine <code>SKILL.md</code>-Datei, jedes Designsystem ein portables <code>DESIGN.md</code>.</p>\n\n<p><strong>Kernfunktionen</strong></p>\n<ul>\n<li>Apache-2.0, lokal zuerst, ohne Anmeldung – läuft mit <code>pnpm tools-dev</code></li>\n<li>BYOK: Bring jedes OpenAI-kompatible Modell mit (Claude, GPT, Gemini, DeepSeek oder selbst gehostet)</li>\n<li>Erkennt automatisch über 16 Coding-Agent-CLIs, die bereits in deinem <code>$PATH</code> liegen (Claude Code, Codex, Cursor, OpenCode, Qwen und mehr)</li>\n<li>Liefert echten Code, nicht nur Mockups – Design und Code bleiben in einem Loop</li>\n<li>Eine Bibliothek aus Skills und portablen Designsystemen out of the box</li>\n</ul>\n\n<p><strong>Pro:</strong> Dir gehört alles (Dateien, die du diffen und behalten kannst); kein Modell-Lock-in; kein Zähler pro Platz; läuft neben deinem bestehenden Agenten.<br>\n<strong>Contra:</strong> Es ist eine Schicht, die du betreibst, kein gehostetes, ausgefeiltes SaaS – es gibt Einrichtungsaufwand, und es ist kein Echtzeit-Multiplayer-Canvas.<br>\n<strong>Preise:</strong> kostenlos und Open Source; du zahlst nur für das Modell, auf das du es richtest.<br>\n<strong>Am besten für:</strong> Teams, die sich weigern, ihren Workflow, ihre Dateien oder ihre Modellwahl an einen Closed-Source-Anbieter abzugeben.<br>\n<strong>Meine Einschätzung:</strong> Wenn der Grund, weshalb du Claude Design verlassen hast, „Closed Source / gehostet / modellgebunden\" war, ist das die direkteste Antwort auf dieser Liste – es ist by design das Gegenteil von allen dreien.</p>\n\n<h3>2. Figma (Make &amp; AI)</h3>\n\n<p><strong>Was es ist.</strong> Der Platzhirsch. Figmas KI-Funktionen und Figma Make bringen Generierung auf das Canvas, das jedes Designteam ohnehin kennt.</p>\n\n<p><strong>Kernfunktionen:</strong> Echtzeit-Multiplayer-Canvas, ausgereifte Komponenten/Varianten, Übergabe per Dev Mode, ein tiefes Plugin-Ökosystem, KI-Generierung obendrauf geschraubt.<br>\n<strong>Pro:</strong> unerreichtes kollaboratives Canvas; der Workflow, den dein Team bereits spricht; riesiges Ökosystem.<br>\n<strong>Contra:</strong> Closed Source, proprietäres Dateiformat, gehostet; Preise pro Platz; die KI ist ein Add-on zu einem Canvas-Tool, kein Agent, der Code ausliefert. (Siehe <a href=\"/blog/figma-alternative-open-design/\">den Open-Source-Weg weg von Figma</a>.)<br>\n<strong>Preise:</strong> Abo pro Platz, gestaffelt nach Rolle.<br>\n<strong>Am besten für:</strong> Designteams, die auf einem geteilten Canvas leben und KI daneben haben wollen.<br>\n<strong>Meine Einschätzung:</strong> die sicherste Wahl, wenn Zusammenarbeit wichtiger ist als Eigentum – und die falsche, wenn Eigentum der Grund war, warum du Claude Design verlassen hast.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Was es ist.</strong> Googles Prompt-zu-UI-Tool und das Produkt, das „vibe design\" in jedermanns Suchleiste gebracht hat.</p>\n\n<p><strong>Kernfunktionen:</strong> starke Prompt-zu-UI-Qualität, Voice Canvas, Export Richtung Figma und Frontend-Code, kostenlos in Google Labs.<br>\n<strong>Pro:</strong> wirklich gute erste Screens; kostenlos und schnell; der beste kostenlose Einstieg ins Designen nach Intention.<br>\n<strong>Contra:</strong> Googles abgeschottete Oberfläche – der Export ist eine Einbahnstraße, dein Designsystem ist nicht die Quelle der Wahrheit, und Preise/Verfügbarkeit von Labs entscheidet Google. (Vollständiger <a href=\"/blog/vibe-design-with-stitch/\">Praxistest mit Stitch</a>.)<br>\n<strong>Preise:</strong> kostenlos in Labs (vorerst).<br>\n<strong>Am besten für:</strong> Richtungen erkunden und skizzieren zu null Kosten.<br>\n<strong>Meine Einschätzung:</strong> ein hervorragender Skizzenblock, kein Ort, um ein Produkt zu besitzen – nutze ihn zum Erkunden und baue dann woanders.</p>\n\n<h3>4. v0 von Vercel</h3>\n\n<p><strong>Was es ist.</strong> Ein code-first Generator: Beschreibe ein UI, bekomme React und Tailwind, die du in ein Repo heben kannst.</p>\n\n<p><strong>Kernfunktionen:</strong> Prompt-zu-Komponente, shadcn/Tailwind-Output, enge Passung mit dem Vercel/Next.js-Stack, echter Code von Anfang an.<br>\n<strong>Pro:</strong> keine Mockup-Klippe – das Ergebnis ist auslieferbarer Code; hervorragend für Engineers und Design-Engineers.<br>\n<strong>Contra:</strong> Closed-Source-Tool; Output und Flow tendieren zum Vercel-Ökosystem; du editierst Code, du designst nicht auf einem Canvas.<br>\n<strong>Preise:</strong> kostenlose Stufe plus kostenpflichtige Nutzung.<br>\n<strong>Am besten für:</strong> Entwickler, die wollen, dass Design als echter Frontend-Code ankommt.<br>\n<strong>Meine Einschätzung:</strong> die stärkste „liefert Code\"-Option unter den Closed-Source-Tools – sei dir nur bewusst, dass du dich verpflichtet hast, im Code zu leben.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Was es ist.</strong> Prompt-zu-App: Beschreibe, was du willst, und Lovable zaubert eine funktionierende Full-Stack-Web-App hervor.</p>\n\n<p><strong>Kernfunktionen:</strong> Full-Stack-Gerüst aus einem Prompt, schnelle Iteration, gehostete Vorschau, gut für End-to-End-Prototypen.<br>\n<strong>Pro:</strong> du bekommst ein laufendes Produkt, kein Bild; großartiges Tempo für Zero-to-One-Ideen.<br>\n<strong>Contra:</strong> gehostet und Closed Source; die App ist an ihren Stack gebunden; „Design\" ist das, was das Framework gerendert hat, also liegt das Management von <a href=\"/blog/vibe-design-vs-vibe-coding/\">Drift</a> bei dir.<br>\n<strong>Preise:</strong> kostenlose Stufe plus kostenpflichtige Pläne.<br>\n<strong>Am besten für:</strong> Gründer, die ein ganzes Produkt prototypisieren, nicht nur einen Screen.<br>\n<strong>Meine Einschätzung:</strong> Greif dazu, wenn das Lieferobjekt eine funktionierende App ist; lass es liegen, wenn du Designkontrolle über ein System brauchst.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Was es ist.</strong> Ein KI-App-Builder im Browser von StackBlitz, der vollständige Web-Apps live generiert und ausführt.</p>\n\n<p><strong>Kernfunktionen:</strong> browserbasierte Laufzeit, Prompt-zu-App, sofortige Vorschau und Deployment, Open-Source-Wurzeln im StackBlitz-Tooling.<br>\n<strong>Pro:</strong> nichts zu installieren; die App läuft sofort; schneller Loop von der Idee zum Klickbaren.<br>\n<strong>Contra:</strong> guthabenbasierte Kosten summieren sich; Output an seine Umgebung gebunden; mehr Builder als Designer.<br>\n<strong>Preise:</strong> Nutzungsguthaben.<br>\n<strong>Am besten für:</strong> schnelle, lauffähige Prototypen, die du noch in derselben Stunde teilen willst.<br>\n<strong>Meine Einschätzung:</strong> dem Geist von „vibe coding\" am nächsten – hervorragend für Tempo, weniger, wenn Designkohärenz das Ziel ist.</p>\n\n<blockquote><p>Auch einen Blick wert: <strong>Visily</strong> und <strong>Uizard</strong> für schnelle KI-Mockups (großartig zum Ideenfinden, aber sie hören beim Bild auf) und <strong>Framer AI</strong> für KI-generierte Marketing-Seiten. Tools wie <strong>Magic Patterns</strong> und <strong>UX Pilot</strong> spielen im selben Prototyping-Raum. Keines ändert die Grundentscheidung weiter unten.</p></blockquote>\n\n<h2>Wie man wählt</h2>\n\n<p>Passe das Tool dem Grund an, aus dem du Claude Design verlassen hast:</p>\n\n<ul>\n<li><strong>Verlassen, weil es Closed Source / gehostet / modellgebunden ist?</strong> → <strong>Open Design.</strong> Es ist die einzige Option hier, die Open Source, BYOK und dein Eigen ist.</li>\n<li><strong>Verlassen, weil du Zusammenarbeit auf dem Team-Canvas willst?</strong> → <strong>Figma.</strong></li>\n<li><strong>Verlassen, weil du kostenlos und schnell wolltest?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Verlassen, weil du echten Code wolltest, und zwar jetzt?</strong> → <strong>v0</strong> (Komponenten) oder <strong>Lovable / Bolt</strong> (ganze Apps).</li>\n</ul>\n\n<p>Der ehrliche Metapunkt: Die meisten davon sind immer noch Closed Source, gehostet oder Single-Model – sie tauschen Anthropics Mauern gegen die von jemand anderem. Wenn die <em>Kategorie</em> von Problem, das du mit Claude Design hast, Lock-in ist, dann löst nur der Open-Source-Weg es wirklich, statt es bloß umzusiedeln.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Was ist die beste Claude Design-Alternative?</strong> Das hängt davon ab, warum du gehst. Für Eigentum und kein Lock-in: Open Design (Open Source, BYOK). Für Zusammenarbeit: Figma. Für kostenloses Skizzieren: Google Stitch. Zum Ausliefern von Code: v0 oder Lovable.</p>\n\n<p><strong>Gibt es eine kostenlose, Open-Source-Claude Design-Alternative?</strong> Ja – Open Design ist Apache-2.0, kostenlos und selbst gehostet; du zahlst nur für das Modell, das du mitbringst. Google Stitch ist kostenlos, aber Closed Source.</p>\n\n<p><strong>Kann eines davon echten Code ausliefern wie Claude Design?</strong> Open Design, v0, Lovable und Bolt erzeugen alle laufenden Code. Mockup-Tools (Visily, Uizard) und die Canvas-Tools hören früher auf.</p>\n\n<p><strong>Muss ich Claude als Modell verwenden?</strong> Bei Claude Design ja. Mit dem BYOK von Open Design bringst du jedes OpenAI-kompatible Modell mit – Claude, GPT, Gemini, DeepSeek oder selbst gehostet.</p>\n\n<p><strong>Wo finde ich das Open-Source-Tool?</strong> Open Design ist auf <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> und läuft lokal; siehe <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">warum wir es als Skill-Schicht gebaut haben</a>.</p>\n\n<h2>Das Fazit</h2>\n\n<p>Claude Design ist ein gutes Tool mit einer bestimmten Form: Closed Source, gehostet, Single-Model, abo-gebündelt. Die beste Alternative für dich ist diejenige, die genau den Teil dieser Form repariert, mit dem du nicht leben konntest. Wenn es eine fehlende Funktion ist, werden viele davon es tun. Wenn es Lock-in ist – Modell, Dateien oder Laufzeit – dann ist die einzige echte Reparatur die offene: <a href=\"/\">Open Design</a> ist die Open-Source-, agentennative Wette darauf, dass das nächste Jahrzehnt der Designarbeit dir gehören sollte, vom Prompt bis hin zum ausgelieferten Code.</p>\n\n<p><em>Bereit, den offenen Weg auszuprobieren? <a href=\"/download\">Öffne die App</a> oder <a href=\"/plugins\">durchstöbere die Bibliothek aus Skills und Designsystemen</a>.</em></p>"
  fr:
    title: "Les meilleures alternatives à Claude Design en 2026"
    summary: "Claude Design est vraiment bon — mais c'est propriétaire, hébergé, verrouillé à un seul modèle, et inclus dans un abonnement Claude. Si l'un de ces points est rédhibitoire pour vous, voici les meilleures alternatives à Claude Design en 2026, notées sur ce qui compte vraiment : en êtes-vous propriétaire, peut-il livrer du vrai code, et le choix du modèle vous revient-il ?"
    category: "Guides"
    bodyHtml: "<p>Je dirige le produit chez Open Design, ce qui veut dire que j'ai passé plus de temps dans les alternatives à Claude Design qu'il n'est sans doute raisonnable — même cahier des charges, tous les outils, plusieurs fois par an. Claude Design lui-même est bon ; ceci n'est pas un règlement de comptes. Mais « bon » et « fait pour vous » ne sont pas la même phrase. C'est propriétaire, uniquement hébergé, verrouillé sur Claude comme modèle, et intégré à un abonnement Claude — et l'un quelconque de ces points peut être la raison pour laquelle vous cherchez une alternative.</p>\n\n<p>Voici donc le tour d'horizon honnête de 2026 : les meilleures alternatives à Claude Design, notées sur les trois choses qui tranchent vraiment — <strong>êtes-vous propriétaire du résultat, peut-il livrer du vrai code, et le choix du modèle vous revient-il ?</strong> Je le dis d'emblée : nous construisons l'un des outils de cette liste ; j'ai gardé des éloges sincères pour les autres, parce qu'une liste truquée ne sert à rien.</p>\n\n<h2>Pourquoi chercher une alternative à Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) est un outil de design conversationnel : le chat à gauche, le canevas à droite, du prototype au code via Claude Code. Il est rapide et soigné. Les raisons pour lesquelles les équipes regardent malgré tout ailleurs sont structurelles, pas une question de qualité :</p>\n\n<ul>\n<li><strong>Le modèle est figé.</strong> Chaque rendu passe par Claude. Si vous payez déjà pour GPT, Gemini, ou si vous hébergez vous-même pour des travaux sensibles, ça ne se transpose pas.</li>\n<li><strong>C'est uniquement hébergé.</strong> Vos prompts, votre design system et le contexte de votre base de code voyagent vers les serveurs d'Anthropic — une conversation avec les achats pour du travail d'agence ou sous NDA.</li>\n<li><strong>C'est propriétaire.</strong> Vous ne pouvez ni forker, ni auditer, ni remplacer le comportement de design.</li>\n<li><strong>La facture est un abonnement groupé.</strong> Acceptable pour un utilisateur Pro en solo, malcommode pour une équipe, rédhibitoire pour une longue traîne de contributeurs.</li>\n</ul>\n\n<p>Si aucun de ces points ne vous dérange, Claude Design est un très bon choix. Si l'un d'eux vous a fait hocher la tête, continuez à lire.</p>\n\n<h2>Comparaison rapide</h2>\n\n<table><thead><tr><th>Outil</th><th>Idéal pour</th><th>Open source</th><th>Livre du vrai code</th><th>Choix du modèle</th><th>Type de tarification</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Posséder toute la boucle</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / au choix</td><td>Gratuit, auto-hébergé</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Collaboration sur canevas d'équipe</td><td>❌</td><td>Partiel (export)</td><td>❌</td><td>Abonnement par siège</td></tr><tr><td><strong>Google Stitch</strong></td><td>Esquisse gratuite et rapide</td><td>❌</td><td>Export vers code/Figma</td><td>❌</td><td>Gratuit (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → code React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Offre gratuite + payant</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → application complète</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Offre gratuite + payant</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Construction d'apps dans le navigateur</td><td>Partiel (racines OSS)</td><td>✅</td><td>Partiel</td><td>Basée sur des crédits</td></tr></tbody></table>\n\n<h2>Comment je les ai évalués</h2>\n\n<p>Pas au nombre de fonctionnalités — mais à ce qui survit au contact d'un vrai projet. Quatre critères, dans l'ordre où ils mordent le plus souvent :</p>\n\n<ul>\n<li><strong>Propriété.</strong> Quand vous arrêtez de payer ou que l'outil change, gardez-vous votre travail sous une forme portable, ou est-il échoué dans le cloud de quelqu'un ?</li>\n<li><strong>Livre du vrai code.</strong> Le résultat devient-il une interface fonctionnelle, ou une maquette que quelqu'un reconstruit à la main ? (Tout l'<a href=\"/blog/vibe-design-vs-vibe-coding/\">écart entre la maquette et le produit livré</a>.)</li>\n<li><strong>Liberté de modèle.</strong> Pouvez-vous apporter le modèle que vous payez déjà, ou êtes-vous verrouillé sur la courbe tarifaire d'un seul fournisseur ?</li>\n<li><strong>Type de tarification.</strong> Abonnement par siège, crédits d'usage, ou gratuit-et-auto-hébergé — et comment cela passe à l'échelle d'une équipe entière.</li>\n</ul>\n\n<h2>Les meilleures alternatives à Claude Design</h2>\n\n<h3>1. Open Design — le choix open source, agent-native</h3>\n\n<p><strong>Ce que c'est.</strong> En toute transparence : c'est le nôtre. Open Design n'est pas un clone de Claude Design — c'est une fine couche open source qui transforme l'agent de codage que vous utilisez déjà en moteur de design. Chaque skill est un fichier <code>SKILL.md</code>, chaque design system un <code>DESIGN.md</code> portable.</p>\n\n<p><strong>Fonctionnalités clés</strong></p>\n<ul>\n<li>Apache-2.0, local-first, sans inscription — tourne avec <code>pnpm tools-dev</code></li>\n<li>BYOK : apportez n'importe quel modèle compatible OpenAI (Claude, GPT, Gemini, DeepSeek, ou auto-hébergé)</li>\n<li>Détecte automatiquement plus de 16 CLI d'agents de codage déjà présents dans votre <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen, et plus)</li>\n<li>Livre du vrai code, pas seulement des maquettes — design et code restent dans une seule boucle</li>\n<li>Une bibliothèque de skills et de design systems portables prête à l'emploi</li>\n</ul>\n\n<p><strong>Avantages :</strong> vous possédez tout (des fichiers que vous pouvez diff et conserver) ; aucun verrouillage de modèle ; aucun compteur par siège ; fonctionne aux côtés de votre agent existant.<br>\n<strong>Inconvénients :</strong> c'est une couche que vous exécutez, pas un SaaS hébergé et clé en main — il y a de la configuration, et ce n'est pas un canevas multijoueur en temps réel.<br>\n<strong>Tarification :</strong> gratuit et open source ; vous ne payez que pour le modèle vers lequel vous le pointez.<br>\n<strong>Idéal pour :</strong> les équipes qui refusent de confier leur flux de travail, leurs fichiers ou leur choix de modèle à un fournisseur propriétaire.<br>\n<strong>Mon avis :</strong> si la raison de votre départ de Claude Design était « propriétaire / hébergé / verrouillé sur un modèle », c'est la réponse la plus directe de la liste — c'est l'opposé des trois, par conception.</p>\n\n<h3>2. Figma (Make &amp; AI)</h3>\n\n<p><strong>Ce que c'est.</strong> Le titulaire en place. Les fonctionnalités IA de Figma et Figma Make amènent la génération sur le canevas que toute équipe de design connaît déjà.</p>\n\n<p><strong>Fonctionnalités clés :</strong> canevas multijoueur en temps réel, composants/variantes matures, transfert via Dev Mode, un écosystème de plugins profond, la génération IA greffée par-dessus tout ça.<br>\n<strong>Avantages :</strong> un canevas collaboratif sans égal ; le flux de travail que votre équipe parle déjà ; un écosystème immense.<br>\n<strong>Inconvénients :</strong> propriétaire, format de fichier fermé, hébergé ; tarification par siège ; l'IA est un ajout à un outil de canevas, pas un agent qui livre du code. (Voir <a href=\"/blog/figma-alternative-open-design/\">la voie open source depuis Figma</a>.)<br>\n<strong>Tarification :</strong> abonnement par siège, par paliers selon le rôle.<br>\n<strong>Idéal pour :</strong> les équipes de design qui vivent sur un canevas partagé et veulent de l'IA à côté.<br>\n<strong>Mon avis :</strong> le choix le plus sûr si la collaboration compte plus que la propriété — et le mauvais choix si c'est la propriété qui vous a fait quitter Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Ce que c'est.</strong> L'outil prompt-to-UI de Google, et le produit qui a mis le « vibe design » dans la barre de recherche de tout le monde.</p>\n\n<p><strong>Fonctionnalités clés :</strong> forte qualité prompt-to-UI, Voice Canvas, export vers Figma et le code front-end, gratuit dans Google Labs.<br>\n<strong>Avantages :</strong> de vrais bons premiers écrans ; gratuit et rapide ; la meilleure rampe d'accès sans frais pour concevoir par intention.<br>\n<strong>Inconvénients :</strong> la surface fermée de Google — l'export est une porte à sens unique, votre design system n'est pas la source de vérité, et la tarification/disponibilité de Labs dépend de Google. (<a href=\"/blog/vibe-design-with-stitch/\">Prise en main complète de Stitch</a>.)<br>\n<strong>Tarification :</strong> gratuit dans Labs (pour l'instant).<br>\n<strong>Idéal pour :</strong> explorer et esquisser des directions à coût nul.<br>\n<strong>Mon avis :</strong> un superbe carnet d'esquisses, pas un endroit où posséder un produit — servez-vous-en pour explorer, puis construisez ailleurs.</p>\n\n<h3>4. v0 par Vercel</h3>\n\n<p><strong>Ce que c'est.</strong> Un générateur code-first : décrivez une UI, obtenez du React et du Tailwind que vous pouvez intégrer dans un dépôt.</p>\n\n<p><strong>Fonctionnalités clés :</strong> prompt-to-component, sortie shadcn/Tailwind, ajustement serré avec la stack Vercel/Next.js, du vrai code dès le départ.<br>\n<strong>Avantages :</strong> pas de falaise de la maquette — le résultat est du code livrable ; excellent pour les ingénieurs et les design engineers.<br>\n<strong>Inconvénients :</strong> outil propriétaire ; la sortie et le flux penchent vers l'écosystème Vercel ; vous éditez du code, vous ne concevez pas sur un canevas.<br>\n<strong>Tarification :</strong> offre gratuite plus usage payant.<br>\n<strong>Idéal pour :</strong> les développeurs qui veulent que le design arrive sous forme de vrai code front-end.<br>\n<strong>Mon avis :</strong> la plus solide option « livre du code » parmi les outils propriétaires — sachez seulement que vous avez accepté de vivre dans le code.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Ce que c'est.</strong> Prompt-to-app : décrivez ce que vous voulez et Lovable monte une application web full-stack fonctionnelle.</p>\n\n<p><strong>Fonctionnalités clés :</strong> échafaudage full-stack à partir d'un prompt, itération rapide, aperçu hébergé, bon pour les prototypes de bout en bout.<br>\n<strong>Avantages :</strong> vous obtenez un produit qui tourne, pas une image ; grande vélocité pour les idées de zéro à un.<br>\n<strong>Inconvénients :</strong> hébergé et propriétaire ; l'application est mariée à sa stack ; le « design » est ce que le framework a rendu, donc le <a href=\"/blog/vibe-design-vs-vibe-coding/\">décalage</a> est à vous de gérer.<br>\n<strong>Tarification :</strong> offre gratuite plus formules payantes.<br>\n<strong>Idéal pour :</strong> les fondateurs qui prototypent un produit entier, pas seulement un écran.<br>\n<strong>Mon avis :</strong> dégainez-le quand le livrable est une application fonctionnelle ; passez votre chemin quand vous avez besoin d'un contrôle de design sur un système.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Ce que c'est.</strong> Un constructeur d'applications IA dans le navigateur, signé StackBlitz, qui génère et exécute des applications web complètes en direct.</p>\n\n<p><strong>Fonctionnalités clés :</strong> runtime dans le navigateur, prompt-to-app, aperçu et déploiement instantanés, racines open source dans l'outillage StackBlitz.<br>\n<strong>Avantages :</strong> rien à installer ; l'application tourne immédiatement ; boucle rapide de l'idée au cliquable.<br>\n<strong>Inconvénients :</strong> les coûts basés sur des crédits s'accumulent ; la sortie est liée à son environnement ; plus constructeur que designer.<br>\n<strong>Tarification :</strong> crédits d'usage.<br>\n<strong>Idéal pour :</strong> des prototypes rapides et exécutables que vous voulez partager dans l'heure.<br>\n<strong>Mon avis :</strong> le plus proche dans l'esprit du « vibe coding » — excellent pour la vitesse, moins quand la cohérence du design est l'objectif.</p>\n\n<blockquote><p>À regarder aussi : <strong>Visily</strong> et <strong>Uizard</strong> pour des maquettes IA rapides (parfaits pour l'idéation, mais ils s'arrêtent à l'image), et <strong>Framer AI</strong> pour des sites marketing générés par IA. Des outils comme <strong>Magic Patterns</strong> et <strong>UX Pilot</strong> jouent dans le même espace de prototypage. Aucun ne change la décision centrale ci-dessous.</p></blockquote>\n\n<h2>Comment choisir</h2>\n\n<p>Faites correspondre l'outil à la raison de votre départ de Claude Design :</p>\n\n<ul>\n<li><strong>Parti parce que c'est propriétaire / hébergé / verrouillé sur un modèle ?</strong> → <strong>Open Design.</strong> C'est la seule option ici qui soit open source, BYOK, et à vous.</li>\n<li><strong>Parti parce que vous voulez une collaboration sur canevas d'équipe ?</strong> → <strong>Figma.</strong></li>\n<li><strong>Parti parce que vous vouliez du gratuit et du rapide ?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Parti parce que vous vouliez du vrai code, tout de suite ?</strong> → <strong>v0</strong> (composants) ou <strong>Lovable / Bolt</strong> (applications entières).</li>\n</ul>\n\n<p>Le méta-point honnête : la plupart de ces outils restent propriétaires, hébergés ou mono-modèle — ils troquent les murs d'Anthropic contre ceux de quelqu'un d'autre. Si la <em>catégorie</em> de problème que vous avez avec Claude Design est le verrouillage, seule la voie open source le résout vraiment au lieu de le déplacer.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Quelle est la meilleure alternative à Claude Design ?</strong> Ça dépend de la raison de votre départ. Pour la propriété et l'absence de verrouillage, Open Design (open source, BYOK). Pour la collaboration, Figma. Pour l'esquisse gratuite, Google Stitch. Pour livrer du code, v0 ou Lovable.</p>\n\n<p><strong>Existe-t-il une alternative à Claude Design gratuite et open source ?</strong> Oui — Open Design est sous Apache-2.0, gratuit et auto-hébergé ; vous ne payez que pour le modèle que vous apportez. Google Stitch est gratuit mais propriétaire.</p>\n\n<p><strong>L'un de ces outils peut-il livrer du vrai code comme Claude Design ?</strong> Open Design, v0, Lovable et Bolt produisent tous du code qui tourne. Les outils de maquette (Visily, Uizard) et les outils de canevas s'arrêtent plus tôt.</p>\n\n<p><strong>Suis-je obligé d'utiliser Claude comme modèle ?</strong> Avec Claude Design, oui. Avec le BYOK d'Open Design, vous apportez n'importe quel modèle compatible OpenAI — Claude, GPT, Gemini, DeepSeek, ou auto-hébergé.</p>\n\n<p><strong>Où trouver celui qui est open source ?</strong> Open Design est sur <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> et tourne en local ; voyez <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">pourquoi nous l'avons construit comme une couche de skills</a>.</p>\n\n<h2>À retenir</h2>\n\n<p>Claude Design est un bon outil avec une forme précise : propriétaire, hébergé, mono-modèle, abonnement groupé. La meilleure alternative pour vous est celle qui corrige la partie de cette forme avec laquelle vous ne pouviez pas vivre. Si c'est une fonctionnalité qui vous manque, beaucoup de ces outils feront l'affaire. Si c'est le verrouillage — modèle, fichiers ou runtime — alors le seul vrai remède est l'ouvert : <a href=\"/\">Open Design</a> est le pari open source et agent-native que la prochaine décennie du travail de design devrait être la vôtre, du prompt jusqu'au code livré.</p>\n\n<p><em>Prêt à essayer la voie ouverte ? <a href=\"/download\">Ouvrez l'application</a> ou <a href=\"/plugins\">parcourez la bibliothèque de skills et de design systems</a>.</em></p>"
  ru:
    title: "Лучшие альтернативы Claude Design в 2026 году"
    summary: "Claude Design — действительно хороший инструмент, но он закрытый, работает только в облаке, привязан к одной модели и идёт в комплекте с подпиской на Claude. Если хотя бы один из этих пунктов для вас критичен, вот лучшие альтернативы Claude Design в 2026 году, оценённые по тому, что реально важно: владеете ли вы результатом, может ли инструмент выдавать настоящий код и сами ли вы выбираете модель?"
    category: "Руководства"
    bodyHtml: "<p>Я отвечаю за продукт в Open Design, а значит, провёл внутри альтернатив Claude Design больше времени, чем, наверное, стоило бы — один и тот же бриф, каждый инструмент, по несколько раз в год. Сам по себе Claude Design хорош; это не разоблачение. Но «хороший» и «подходящий именно вам» — далеко не одно и то же. Он закрытый, работает только в облаке, привязан к Claude как к модели и встроен в подписку Claude — и любого из этих пунктов может хватить, чтобы вы начали искать альтернативу.</p>\n\n<p>Так что перед вами честный обзор 2026 года: лучшие альтернативы Claude Design, оценённые по трём вещам, которые на самом деле всё решают — <strong>владеете ли вы результатом, может ли инструмент выдавать настоящий код и сами ли вы выбираете модель?</strong> Сразу скажу: один из инструментов в этом списке делаем мы; про остальные я писал честно, потому что список с подкрученными оценками никому не нужен.</p>\n\n<h2>Зачем искать альтернативу Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) — это диалоговый инструмент для дизайна: чат слева, холст справа, путь от прототипа к коду через Claude Code. Он быстрый и отполированный. Причины, по которым команды всё равно смотрят в сторону, структурные, а не связанные с качеством:</p>\n\n<ul>\n<li><strong>Модель зафиксирована.</strong> Каждый рендер идёт через Claude. Если вы уже платите за GPT, Gemini или держите модель на собственных серверах для чувствительной работы, это сюда не переносится.</li>\n<li><strong>Только облако.</strong> Ваши промпты, дизайн-система и контекст кодовой базы уходят на серверы Anthropic — для агентской работы или проектов под NDA это повод для разговора с отделом закупок.</li>\n<li><strong>Он закрытый.</strong> Вы не можете сделать форк, провести аудит или подменить логику дизайна.</li>\n<li><strong>Счёт — это встроенная подписка.</strong> Нормально для одиночного Pro-пользователя, неудобно для команды и совсем не вариант для длинного хвоста контрибьюторов.</li>\n</ul>\n\n<p>Если ничего из этого вас не смущает, Claude Design — отличный выбор. Если на одном из пунктов вы кивнули — читайте дальше.</p>\n\n<h2>Краткое сравнение</h2>\n\n<table><thead><tr><th>Инструмент</th><th>Лучше всего для</th><th>Открытый код</th><th>Выдаёт настоящий код</th><th>Выбор модели</th><th>Модель оплаты</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Владение всем циклом</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / любая</td><td>Бесплатно, на своём железе</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Командная работа на холсте</td><td>❌</td><td>Частично (экспорт)</td><td>❌</td><td>Подписка за место</td></tr><tr><td><strong>Google Stitch</strong></td><td>Бесплатные быстрые наброски</td><td>❌</td><td>Экспорт в код/Figma</td><td>❌</td><td>Бесплатно (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Промпт → код на React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Бесплатный тариф + платный</td></tr><tr><td><strong>Lovable</strong></td><td>Промпт → готовое приложение</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Бесплатный тариф + платный</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Сборка приложений в браузере</td><td>Частично (открытые корни)</td><td>✅</td><td>Частично</td><td>По кредитам</td></tr></tbody></table>\n\n<h2>Как я их оценивал</h2>\n\n<p>Не по числу фич — по тому, что выживает при столкновении с реальным проектом. Четыре критерия, в порядке того, как часто они кусаются:</p>\n\n<ul>\n<li><strong>Владение.</strong> Когда вы перестаёте платить или инструмент меняется, остаётся ли у вас работа в переносимом виде — или она застряла в чужом облаке?</li>\n<li><strong>Доходит до настоящего кода.</strong> Результат становится работающим интерфейсом — или макетом, который кто-то потом пересобирает вручную? (Весь тот самый <a href=\"/blog/vibe-design-vs-vibe-coding/\">разрыв между макетом и отгрузкой</a>.)</li>\n<li><strong>Свобода выбора модели.</strong> Можете ли вы подключить модель, за которую уже платите, — или вы привязаны к ценовой кривой одного вендора?</li>\n<li><strong>Модель оплаты.</strong> Подписка за место, кредиты по потреблению или бесплатно-и-на-своём-железе — и как это масштабируется на целую команду.</li>\n</ul>\n\n<h2>Лучшие альтернативы Claude Design</h2>\n\n<h3>1. Open Design — открытый, agent-native выбор</h3>\n\n<p><strong>Что это.</strong> Полная честность: это наш продукт. Open Design — не клон Claude Design, это тонкий слой с открытым кодом, который превращает уже работающего у вас coding-агента в дизайн-движок. Каждый навык — это файл <code>SKILL.md</code>, каждая дизайн-система — переносимый <code>DESIGN.md</code>.</p>\n\n<p><strong>Ключевые возможности</strong></p>\n<ul>\n<li>Apache-2.0, local-first, без регистрации — запускается через <code>pnpm tools-dev</code></li>\n<li>BYOK: подключайте любую совместимую с OpenAI модель (Claude, GPT, Gemini, DeepSeek или собственную)</li>\n<li>Автоматически находит 16+ CLI coding-агентов, уже лежащих в вашем <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen и другие)</li>\n<li>Доходит до настоящего кода, а не до макетов — дизайн и код остаются в одном цикле</li>\n<li>Библиотека навыков и переносимых дизайн-систем прямо из коробки</li>\n</ul>\n\n<p><strong>Плюсы:</strong> вы владеете всем (файлы, которые можно сравнивать через diff и хранить у себя); нет привязки к модели; нет счётчика за место; работает рядом с вашим существующим агентом.<br>\n<strong>Минусы:</strong> это слой, который вы запускаете сами, а не отполированный облачный SaaS — требуется настройка, и это не холст для совместной работы в реальном времени.<br>\n<strong>Цена:</strong> бесплатно и с открытым кодом; вы платите только за ту модель, на которую его направите.<br>\n<strong>Лучше всего для:</strong> команд, которые отказываются отдавать свой рабочий процесс, файлы или выбор модели закрытому вендору.<br>\n<strong>Моё мнение:</strong> если причина ухода от Claude Design была «закрытый / только облако / привязка к модели», это самый прямой ответ в списке — он по своей сути противоположность всех трёх пунктов.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>Что это.</strong> Игрок-старожил. AI-функции Figma и Figma Make приносят генерацию на холст, который и так знает каждая дизайн-команда.</p>\n\n<p><strong>Ключевые возможности:</strong> холст для совместной работы в реальном времени, зрелые компоненты/варианты, передача в Dev Mode, глубокая экосистема плагинов и AI-генерация, прикрученная ко всему этому.<br>\n<strong>Плюсы:</strong> непревзойдённый совместный холст; рабочий процесс, на котором ваша команда уже говорит; огромная экосистема.<br>\n<strong>Минусы:</strong> закрытый, проприетарный формат файлов, только облако; оплата за место; AI — это надстройка над инструментом-холстом, а не агент, отгружающий код. (См. <a href=\"/blog/figma-alternative-open-design/\">путь к открытому коду из Figma</a>.)<br>\n<strong>Цена:</strong> подписка за место с тарифами по ролям.<br>\n<strong>Лучше всего для:</strong> дизайн-команд, которые живут на общем холсте и хотят AI рядом с ним.<br>\n<strong>Моё мнение:</strong> самый безопасный выбор, если совместная работа важнее владения, — и неправильный, если вы ушли от Claude Design именно из-за владения.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Что это.</strong> Инструмент Google «промпт → UI» и тот самый продукт, который вписал «vibe design» в строку поиска у каждого.</p>\n\n<p><strong>Ключевые возможности:</strong> сильное качество в режиме «промпт → UI», Voice Canvas, экспорт в сторону Figma и фронтенд-кода, бесплатно в Google Labs.<br>\n<strong>Плюсы:</strong> по-настоящему хорошие первые экраны; бесплатно и быстро; лучший бесплатный заход в дизайн по намерению.<br>\n<strong>Минусы:</strong> огороженная территория Google — экспорт работает в одну сторону, ваша дизайн-система не является источником истины, а цены/доступность Labs остаются на усмотрение Google. (Полный <a href=\"/blog/vibe-design-with-stitch/\">практический обзор Stitch</a>.)<br>\n<strong>Цена:</strong> бесплатно в Labs (пока что).<br>\n<strong>Лучше всего для:</strong> исследования и набросков направлений с нулевой стоимостью.<br>\n<strong>Моё мнение:</strong> превосходный блокнот для набросков, но не место, где можно владеть продуктом — используйте его, чтобы пробовать варианты, а собирайте в другом месте.</p>\n\n<h3>4. v0 от Vercel</h3>\n\n<p><strong>Что это.</strong> Генератор с приоритетом кода: опишите UI и получите React и Tailwind, которые можно перенести в репозиторий.</p>\n\n<p><strong>Ключевые возможности:</strong> промпт → компонент, вывод в shadcn/Tailwind, плотная стыковка со стеком Vercel/Next.js, настоящий код с самого начала.<br>\n<strong>Плюсы:</strong> никакого обрыва на макете — на выходе готовый к отгрузке код; отлично для инженеров и design-инженеров.<br>\n<strong>Минусы:</strong> закрытый инструмент; вывод и сценарий тяготеют к экосистеме Vercel; вы редактируете код, а не проектируете на холсте.<br>\n<strong>Цена:</strong> бесплатный тариф плюс платное использование.<br>\n<strong>Лучше всего для:</strong> разработчиков, которые хотят, чтобы дизайн приходил в виде настоящего фронтенд-кода.<br>\n<strong>Моё мнение:</strong> самый сильный вариант «доходит до кода» среди закрытых инструментов — просто знайте, что вы подписались жить в коде.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Что это.</strong> Промпт → приложение: опишите, что вам нужно, и Lovable развернёт работающее full-stack веб-приложение.</p>\n\n<p><strong>Ключевые возможности:</strong> full-stack-каркас из промпта, быстрые итерации, облачный предпросмотр, хорошо подходит для сквозных прототипов.<br>\n<strong>Плюсы:</strong> вы получаете работающий продукт, а не картинку; отличная скорость для идей «от нуля к единице».<br>\n<strong>Минусы:</strong> в облаке и закрытый; приложение намертво срослось со своим стеком; «дизайн» — это то, что отрендерил фреймворк, так что <a href=\"/blog/vibe-design-vs-vibe-coding/\">расхождение</a> вам придётся контролировать самим.<br>\n<strong>Цена:</strong> бесплатный тариф плюс платные планы.<br>\n<strong>Лучше всего для:</strong> основателей, прототипирующих целый продукт, а не один экран.<br>\n<strong>Моё мнение:</strong> берите его, когда результат — это работающее приложение; пропустите, когда нужен дизайн-контроль над системой.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Что это.</strong> Браузерный AI-конструктор приложений от StackBlitz, который генерирует и сразу запускает полноценные веб-приложения вживую.</p>\n\n<p><strong>Ключевые возможности:</strong> рантайм в браузере, промпт → приложение, мгновенный предпросмотр и деплой, открытые корни в инструментарии StackBlitz.<br>\n<strong>Плюсы:</strong> ничего не нужно ставить; приложение запускается сразу; быстрый путь от идеи к кликабельному прототипу.<br>\n<strong>Минусы:</strong> расходы по кредитам накапливаются; вывод привязан к его окружению; это больше конструктор, чем дизайнер.<br>\n<strong>Цена:</strong> кредиты по потреблению.<br>\n<strong>Лучше всего для:</strong> быстрых работающих прототипов, которыми хочется поделиться в тот же час.<br>\n<strong>Моё мнение:</strong> ближе всех по духу к «vibe coding» — отлично для скорости и хуже, когда цель — связность дизайна.</p>\n\n<blockquote><p>Тоже стоит взглянуть: <strong>Visily</strong> и <strong>Uizard</strong> для быстрых AI-макетов (отлично для генерации идей, но они останавливаются на картинке) и <strong>Framer AI</strong> для маркетинговых сайтов, сгенерированных AI. Такие инструменты, как <strong>Magic Patterns</strong> и <strong>UX Pilot</strong>, играют в том же поле прототипирования. Ни один из них не меняет ключевого решения ниже.</p></blockquote>\n\n<h2>Как выбрать</h2>\n\n<p>Подберите инструмент под причину, по которой вы ушли от Claude Design:</p>\n\n<ul>\n<li><strong>Ушли, потому что закрытый / только облако / привязка к модели?</strong> → <strong>Open Design.</strong> Это единственный здесь вариант с открытым кодом, BYOK и принадлежащий вам.</li>\n<li><strong>Ушли, потому что хотите командную работу на холсте?</strong> → <strong>Figma.</strong></li>\n<li><strong>Ушли, потому что хотели бесплатно и быстро?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Ушли, потому что хотели настоящий код, и прямо сейчас?</strong> → <strong>v0</strong> (компоненты) или <strong>Lovable / Bolt</strong> (целые приложения).</li>\n</ul>\n\n<p>Честный вывод верхнего уровня: большинство из них по-прежнему закрытые, облачные или одномодельные — они меняют стены Anthropic на чьи-то ещё. Если <em>категория</em> вашей проблемы с Claude Design — это привязка, то по-настоящему её решает только путь с открытым кодом, а не переезд её на новое место.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Какая лучшая альтернатива Claude Design?</strong> Зависит от того, почему вы уходите. Для владения и отсутствия привязки — Open Design (открытый код, BYOK). Для совместной работы — Figma. Для бесплатных набросков — Google Stitch. Для отгрузки кода — v0 или Lovable.</p>\n\n<p><strong>Есть ли бесплатная альтернатива Claude Design с открытым кодом?</strong> Да — Open Design под Apache-2.0, бесплатный и self-hosted; вы платите только за ту модель, которую подключаете. Google Stitch бесплатен, но закрыт.</p>\n\n<p><strong>Может ли что-то из этого выдавать настоящий код, как Claude Design?</strong> Open Design, v0, Lovable и Bolt — все выдают работающий код. Инструменты для макетов (Visily, Uizard) и инструменты-холсты останавливаются раньше.</p>\n\n<p><strong>Обязательно ли использовать Claude как модель?</strong> В Claude Design — да. С BYOK от Open Design вы подключаете любую совместимую с OpenAI модель — Claude, GPT, Gemini, DeepSeek или собственную.</p>\n\n<p><strong>Где найти тот, что с открытым кодом?</strong> Open Design лежит на <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> и запускается локально; см. <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">почему мы построили его как слой навыков</a>.</p>\n\n<h2>Итог</h2>\n\n<p>Claude Design — хороший инструмент со вполне определённой формой: закрытый, облачный, одномодельный, встроенный в подписку. Лучшая альтернатива для вас — та, что чинит именно ту часть этой формы, с которой вы не смогли жить. Если вам не хватает какой-то фичи, многие из этих инструментов подойдут. Если дело в привязке — к модели, файлам или рантайму, — то единственное настоящее решение открытое: <a href=\"/\">Open Design</a> — это ставка на открытый, agent-native подход к тому, что следующее десятилетие дизайн-работы должно принадлежать вам, от промпта и до самого отгруженного кода.</p>\n\n<p><em>Готовы попробовать открытый путь? <a href=\"/download\">Откройте приложение</a> или <a href=\"/plugins\">полистайте библиотеку навыков и дизайн-систем</a>.</em></p>"
  es:
    title: "Las mejores alternativas a Claude Design en 2026"
    summary: "Claude Design es realmente bueno, pero es cerrado, alojado en la nube, está atado a un único modelo y viene incluido en una suscripción de Claude. Si cualquiera de esos puntos te frena, aquí están las mejores alternativas a Claude Design en 2026, evaluadas según lo que de verdad importa: ¿es tuyo lo que produces?, ¿genera código real? y ¿eliges tú el modelo?"
    category: "Guías"
    bodyHtml: "<p>Dirijo el área de producto en Open Design, lo que significa que he pasado más tiempo dentro de alternativas a Claude Design del que probablemente sea sano: el mismo encargo, en cada herramienta, varias veces al año. Claude Design en sí es bueno; esto no es una demolición. Pero \"bueno\" y \"adecuado para ti\" no son la misma frase. Es de código cerrado, solo en la nube, atado a Claude como modelo y empaquetado dentro de una suscripción de Claude, y cualquiera de esos puntos puede ser la razón por la que estás buscando una alternativa.</p>\n\n<p>Así que esta es la recopilación honesta de 2026: las mejores alternativas a Claude Design, evaluadas según las tres cosas que de verdad lo deciden: <strong>¿es tuyo el resultado, puede generar código real y eliges tú el modelo?</strong> Lo digo de entrada: nosotros construimos una de las herramientas de esta lista; he mantenido los elogios al resto reales, porque una lista amañada no le sirve a nadie.</p>\n\n<h2>Por qué buscar una alternativa a Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) es una herramienta de diseño conversacional: chat a la izquierda, lienzo a la derecha, del prototipo al código a través de Claude Code. Es rápida y pulida. Las razones por las que los equipos siguen mirando hacia otro lado son estructurales, no de calidad:</p>\n\n<ul>\n<li><strong>El modelo es fijo.</strong> Cada renderizado pasa por Claude. Si ya pagas por GPT, Gemini o haces self-host para trabajo sensible, eso no se traslada.</li>\n<li><strong>Solo está en la nube.</strong> Tus prompts, tu sistema de diseño y el contexto de tu base de código viajan a los servidores de Anthropic: una conversación de compras para trabajo de agencia o sujeto a NDA.</li>\n<li><strong>Es cerrado.</strong> No puedes hacer fork, auditarlo ni cambiar el comportamiento de diseño.</li>\n<li><strong>La factura es una suscripción empaquetada.</strong> Bien para un usuario Pro en solitario, incómodo para un equipo, inviable para una larga cola de colaboradores.</li>\n</ul>\n\n<p>Si nada de eso te molesta, Claude Design es una buena elección. Si uno de esos puntos te ha hecho asentir, sigue leyendo.</p>\n\n<h2>Comparación rápida</h2>\n\n<table><thead><tr><th>Herramienta</th><th>Mejor para</th><th>Código abierto</th><th>Genera código real</th><th>Elección de modelo</th><th>Forma de precio</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Ser dueño de todo el ciclo</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / cualquiera</td><td>Gratis, autoejecutado</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Colaboración en lienzo de equipo</td><td>❌</td><td>Parcial (exportar)</td><td>❌</td><td>Suscripción por asiento</td></tr><tr><td><strong>Google Stitch</strong></td><td>Bocetar gratis y rápido</td><td>❌</td><td>Exportar a código/Figma</td><td>❌</td><td>Gratis (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → código React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Plan gratuito + de pago</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → app completa</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Plan gratuito + de pago</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Construir apps en el navegador</td><td>Parcial (raíces OSS)</td><td>✅</td><td>Parcial</td><td>Basado en créditos</td></tr></tbody></table>\n\n<h2>Cómo evalué estas herramientas</h2>\n\n<p>No por número de funciones, sino por lo que sobrevive al contacto con un proyecto real. Cuatro criterios, ordenados según la frecuencia con la que muerden:</p>\n\n<ul>\n<li><strong>Propiedad.</strong> Cuando dejas de pagar o la herramienta cambia, ¿conservas tu trabajo en un formato portable, o se queda varado en la nube de otro?</li>\n<li><strong>Genera código real.</strong> ¿El resultado se convierte en una interfaz que funciona, o en un maqueta que alguien reconstruye a mano? (Toda la <a href=\"/blog/vibe-design-vs-vibe-coding/\">brecha entre la maqueta y lo entregado</a>.)</li>\n<li><strong>Libertad de modelo.</strong> ¿Puedes traer el modelo por el que ya pagas, o estás atado a la curva de precios de un único proveedor?</li>\n<li><strong>Forma de precio.</strong> Suscripción por asiento, créditos de uso o gratis y autoejecutado, y cómo escala eso a todo un equipo.</li>\n</ul>\n\n<h2>Las mejores alternativas a Claude Design</h2>\n\n<h3>1. Open Design — la opción de código abierto y nativa de agentes</h3>\n\n<p><strong>Qué es.</strong> Total transparencia: esta es la nuestra. Open Design no es un clon de Claude Design: es una fina capa de código abierto que convierte el coding agent que ya ejecutas en un motor de diseño. Cada skill es un archivo <code>SKILL.md</code>, cada sistema de diseño un <code>DESIGN.md</code> portable.</p>\n\n<p><strong>Funciones clave</strong></p>\n<ul>\n<li>Apache-2.0, local-first, sin registro: se ejecuta con <code>pnpm tools-dev</code></li>\n<li>BYOK: trae cualquier modelo compatible con OpenAI (Claude, GPT, Gemini, DeepSeek o autoalojado)</li>\n<li>Detecta automáticamente más de 16 CLIs de coding agents que ya tienes en tu <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen y más)</li>\n<li>Genera código real, no solo maquetas: el diseño y el código se mantienen en un mismo ciclo</li>\n<li>Una biblioteca de skills y sistemas de diseño portables lista para usar</li>\n</ul>\n\n<p><strong>A favor:</strong> eres dueño de todo (archivos que puedes versionar con diff y conservar); sin atadura de modelo; sin contador por asiento; funciona junto a tu agente actual.<br>\n<strong>En contra:</strong> es una capa que tú ejecutas, no un SaaS alojado y pulido: hay configuración, y no es un lienzo multijugador en tiempo real.<br>\n<strong>Precio:</strong> gratis y de código abierto; solo pagas por el modelo al que lo apuntes.<br>\n<strong>Mejor para:</strong> equipos que se niegan a entregar su flujo de trabajo, sus archivos o su elección de modelo a un proveedor cerrado.<br>\n<strong>Mi opinión:</strong> si la razón por la que dejaste Claude Design fue \"cerrado / en la nube / atado a un modelo\", esta es la respuesta más directa de la lista: es lo opuesto a los tres por diseño.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>Qué es.</strong> El titular. Las funciones de IA de Figma y Figma Make llevan la generación al lienzo que todo equipo de diseño ya conoce.</p>\n\n<p><strong>Funciones clave:</strong> lienzo multijugador en tiempo real, componentes/variantes maduros, handoff con Dev Mode, un profundo ecosistema de plugins y generación con IA atornillada sobre todo ello.<br>\n<strong>A favor:</strong> un lienzo colaborativo sin rival; el flujo de trabajo que tu equipo ya habla; un ecosistema enorme.<br>\n<strong>En contra:</strong> cerrado, formato de archivo propietario, en la nube; precio por asiento; la IA es un complemento de una herramienta de lienzo, no un agente que genera código. (Mira <a href=\"/blog/figma-alternative-open-design/\">el camino de código abierto desde Figma</a>.)<br>\n<strong>Precio:</strong> suscripción por asiento, escalonada por rol.<br>\n<strong>Mejor para:</strong> equipos de diseño que viven sobre un lienzo compartido y quieren IA al lado.<br>\n<strong>Mi opinión:</strong> la elección más segura si la colaboración importa más que la propiedad, y la equivocada si la propiedad es la razón por la que dejaste Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Qué es.</strong> La herramienta de prompt a interfaz de Google, y el producto que metió \"vibe design\" en la barra de búsqueda de todo el mundo.</p>\n\n<p><strong>Funciones clave:</strong> gran calidad de prompt a interfaz, Voice Canvas, exportación hacia Figma y código front-end, gratis en Google Labs.<br>\n<strong>A favor:</strong> primeras pantallas realmente buenas; gratis y rápido; la mejor rampa de entrada sin coste para diseñar por intención.<br>\n<strong>En contra:</strong> la superficie amurallada de Google: la exportación es una puerta de un solo sentido, tu sistema de diseño no es la fuente de verdad, y el precio/disponibilidad de Labs lo decide Google. (<a href=\"/blog/vibe-design-with-stitch/\">Prueba práctica completa con Stitch</a>.)<br>\n<strong>Precio:</strong> gratis en Labs (por ahora).<br>\n<strong>Mejor para:</strong> explorar y bocetar direcciones a coste cero.<br>\n<strong>Mi opinión:</strong> un cuaderno de bocetos magnífico, no un lugar donde ser dueño de un producto: úsalo para explorar y luego construye en otro sitio.</p>\n\n<h3>4. v0 de Vercel</h3>\n\n<p><strong>Qué es.</strong> Un generador con el código por delante: describe una interfaz y obtén React y Tailwind que puedes llevarte a un repositorio.</p>\n\n<p><strong>Funciones clave:</strong> prompt a componente, salida shadcn/Tailwind, encaje estrecho con el stack de Vercel/Next.js, código real desde el principio.<br>\n<strong>A favor:</strong> sin el precipicio de la maqueta: el resultado es código entregable; excelente para ingenieros y design engineers.<br>\n<strong>En contra:</strong> herramienta cerrada; la salida y el flujo se inclinan hacia el ecosistema de Vercel; estás editando código, no diseñando sobre un lienzo.<br>\n<strong>Precio:</strong> plan gratuito más uso de pago.<br>\n<strong>Mejor para:</strong> desarrolladores que quieren que el diseño llegue como código front-end real.<br>\n<strong>Mi opinión:</strong> la opción más fuerte de \"genera código\" entre las herramientas cerradas; solo ten en cuenta que has firmado por vivir en el código.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Qué es.</strong> Prompt a app: describe lo que quieres y Lovable levanta una aplicación web full-stack que funciona.</p>\n\n<p><strong>Funciones clave:</strong> andamiaje full-stack a partir de un prompt, iteración rápida, vista previa alojada, buena para prototipos de extremo a extremo.<br>\n<strong>A favor:</strong> obtienes un producto que funciona, no una imagen; gran velocidad para ideas de cero a uno.<br>\n<strong>En contra:</strong> alojado y cerrado; la app está casada con su stack; el \"diseño\" es lo que el framework haya renderizado, así que la <a href=\"/blog/vibe-design-vs-vibe-coding/\">deriva</a> queda en tus manos.<br>\n<strong>Precio:</strong> plan gratuito más planes de pago.<br>\n<strong>Mejor para:</strong> fundadores que prototipan un producto entero, no solo una pantalla.<br>\n<strong>Mi opinión:</strong> recurre a ella cuando el entregable es una app que funciona; sáltala cuando necesitas control de diseño sobre un sistema.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Qué es.</strong> Un constructor de apps con IA en el navegador, de StackBlitz, que genera y ejecuta apps web completas en vivo.</p>\n\n<p><strong>Funciones clave:</strong> runtime en el navegador, prompt a app, vista previa y despliegue instantáneos, raíces de código abierto en las herramientas de StackBlitz.<br>\n<strong>A favor:</strong> nada que instalar; la app se ejecuta de inmediato; ciclo rápido de la idea a lo clicable.<br>\n<strong>En contra:</strong> los costes basados en créditos se acumulan; la salida está atada a su entorno; más constructor que diseñador.<br>\n<strong>Precio:</strong> créditos de uso.<br>\n<strong>Mejor para:</strong> prototipos rápidos y ejecutables que quieres compartir en la misma hora.<br>\n<strong>Mi opinión:</strong> lo más cercano en espíritu al \"vibe coding\": excelente para la velocidad, menos cuando el objetivo es la coherencia del diseño.</p>\n\n<blockquote><p>También vale la pena echar un vistazo a: <strong>Visily</strong> y <strong>Uizard</strong> para maquetas rápidas con IA (geniales para la ideación, pero se quedan en la imagen), y <strong>Framer AI</strong> para sitios de marketing generados con IA. Herramientas como <strong>Magic Patterns</strong> y <strong>UX Pilot</strong> juegan en el mismo espacio de prototipado. Ninguna cambia la decisión central de más abajo.</p></blockquote>\n\n<h2>Cómo elegir</h2>\n\n<p>Empareja la herramienta con la razón por la que dejaste Claude Design:</p>\n\n<ul>\n<li><strong>¿La dejaste porque es cerrada / en la nube / atada a un modelo?</strong> → <strong>Open Design.</strong> Es la única opción aquí que es de código abierto, BYOK y tuya.</li>\n<li><strong>¿La dejaste porque quieres colaboración en lienzo de equipo?</strong> → <strong>Figma.</strong></li>\n<li><strong>¿La dejaste porque querías algo gratis y rápido?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>¿La dejaste porque querías código real, ahora?</strong> → <strong>v0</strong> (componentes) o <strong>Lovable / Bolt</strong> (apps enteras).</li>\n</ul>\n\n<p>El meta-punto honesto: la mayoría de estas siguen siendo cerradas, alojadas o de un solo modelo; cambian los muros de Anthropic por los de otro. Si la <em>categoría</em> de problema que tienes con Claude Design es la atadura, solo el camino de código abierto la resuelve de verdad en lugar de reubicarla.</p>\n\n<h2>Preguntas frecuentes</h2>\n\n<p><strong>¿Cuál es la mejor alternativa a Claude Design?</strong> Depende de por qué te vas. Para propiedad y sin ataduras, Open Design (código abierto, BYOK). Para colaboración, Figma. Para bocetar gratis, Google Stitch. Para entregar código, v0 o Lovable.</p>\n\n<p><strong>¿Existe una alternativa a Claude Design gratuita y de código abierto?</strong> Sí: Open Design es Apache-2.0, gratis y autoalojado; solo pagas por el modelo que traigas. Google Stitch es gratis pero cerrado.</p>\n\n<p><strong>¿Alguna de estas puede generar código real como Claude Design?</strong> Open Design, v0, Lovable y Bolt producen código que funciona. Las herramientas de maquetas (Visily, Uizard) y las de lienzo se detienen antes.</p>\n\n<p><strong>¿Tengo que usar Claude como modelo?</strong> Con Claude Design, sí. Con el BYOK de Open Design, traes cualquier modelo compatible con OpenAI: Claude, GPT, Gemini, DeepSeek o autoalojado.</p>\n\n<p><strong>¿Dónde encuentro la de código abierto?</strong> Open Design está en <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> y se ejecuta localmente; mira <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">por qué la construimos como una capa de skills</a>.</p>\n\n<h2>La conclusión</h2>\n\n<p>Claude Design es una buena herramienta con una forma concreta: cerrada, en la nube, de un solo modelo, empaquetada en suscripción. La mejor alternativa para ti es aquella que arregle la parte de esa forma con la que no podías vivir. Si es una función que echas en falta, muchas de estas servirán. Si es la atadura —de modelo, de archivos o de runtime—, entonces el único arreglo de verdad es el abierto: <a href=\"/\">Open Design</a> es la apuesta de código abierto y nativa de agentes por que la próxima década de trabajo de diseño deba ser tuya, desde el prompt hasta el código entregado.</p>\n\n<p><em>¿Listo para probar el camino abierto? <a href=\"/download\">Abre la app</a> o <a href=\"/plugins\">explora la biblioteca de skills y sistemas de diseño</a>.</em></p>"
  pt-br:
    title: "As melhores alternativas ao Claude Design em 2026"
    summary: "O Claude Design é genuinamente bom — mas é fechado, hospedado, preso ao modelo e embutido em uma assinatura do Claude. Se qualquer um desses pontos for um impeditivo, aqui estão as melhores alternativas ao Claude Design em 2026, avaliadas pelo que realmente importa: você é dono dele, ele consegue entregar código de verdade e o modelo é escolha sua?"
    category: "Guias"
    bodyHtml: "<p>Eu lidero produto na Open Design, o que significa que já passei mais tempo dentro de alternativas ao Claude Design do que provavelmente seria saudável — o mesmo briefing, em todas as ferramentas, algumas vezes por ano. O próprio Claude Design é bom; isto não é uma execução pública. Mas \"bom\" e \"certo para você\" não são a mesma frase. Ele é de código fechado, só funciona hospedado, está preso ao Claude como modelo e vem embutido em uma assinatura do Claude — e qualquer um desses pontos pode ser o motivo de você estar procurando uma alternativa.</p>\n\n<p>Então este é o panorama honesto de 2026: as melhores alternativas ao Claude Design, avaliadas pelas três coisas que de fato decidem a questão — <strong>você é dono do resultado, ele consegue entregar código de verdade e o modelo é escolha sua?</strong> Já adianto que construímos uma das ferramentas desta lista; mantive os elogios às outras genuínos, porque uma lista manipulada é uma lista inútil.</p>\n\n<h2>Por que procurar uma alternativa ao Claude Design</h2>\n\n<p>O <a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) é uma ferramenta de design conversacional: conversa à esquerda, canvas à direita, do protótipo ao código via Claude Code. É rápido e refinado. As razões pelas quais as equipes ainda buscam outras opções são estruturais, não de qualidade:</p>\n\n<ul>\n<li><strong>O modelo é fixo.</strong> Toda renderização passa pelo Claude. Se você já paga por GPT, Gemini ou roda localmente para trabalhos sensíveis, isso não se aproveita aqui.</li>\n<li><strong>Só funciona hospedado.</strong> Seus prompts, design system e contexto da base de código viajam para os servidores da Anthropic — uma conversa de compras e contratos para trabalho de agência ou sob NDA.</li>\n<li><strong>É fechado.</strong> Você não pode fazer fork, auditar nem trocar o comportamento de design.</li>\n<li><strong>A conta é uma assinatura embutida.</strong> Tudo bem para um usuário Pro solo, desconfortável para uma equipe e inviável para uma longa cauda de colaboradores.</li>\n</ul>\n\n<p>Se nada disso te incomoda, o Claude Design é uma escolha legítima. Se um desses pontos acabou de te fazer concordar com a cabeça, continue lendo.</p>\n\n<h2>Comparação rápida</h2>\n\n<table><thead><tr><th>Ferramenta</th><th>Melhor para</th><th>Código aberto</th><th>Entrega código de verdade</th><th>Escolha de modelo</th><th>Formato de preço</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Ser dono de todo o ciclo</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / qualquer um</td><td>Grátis, autogerenciado</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Colaboração em canvas de equipe</td><td>❌</td><td>Parcial (exportação)</td><td>❌</td><td>Assinatura por assento</td></tr><tr><td><strong>Google Stitch</strong></td><td>Esboço rápido e gratuito</td><td>❌</td><td>Exporta para código/Figma</td><td>❌</td><td>Grátis (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → código React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Plano grátis + pago</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → app completo</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Plano grátis + pago</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Builds de app no navegador</td><td>Parcial (raízes OSS)</td><td>✅</td><td>Parcial</td><td>Baseado em créditos</td></tr></tbody></table>\n\n<h2>Como eu avaliei essas ferramentas</h2>\n\n<p>Não pela contagem de recursos — mas pelo que sobrevive ao contato com um projeto real. Quatro critérios, na ordem em que costumam morder:</p>\n\n<ol>\n<li><strong>Propriedade.</strong> Quando você para de pagar ou a ferramenta muda, você fica com seu trabalho em um formato portátil ou ele fica preso na nuvem de outra pessoa?</li>\n<li><strong>Entrega código de verdade.</strong> O resultado vira uma interface funcionando ou um mockup que alguém reconstrói à mão? (Todo o <a href=\"/blog/vibe-design-vs-vibe-coding/\">abismo entre o mockup e o que vai ao ar</a>.)</li>\n<li><strong>Liberdade de modelo.</strong> Você pode trazer o modelo que já paga ou está preso à curva de preço de um único fornecedor?</li>\n<li><strong>Formato de preço.</strong> Assinatura por assento, créditos de uso ou grátis-e-autogerenciado — e como isso escala para uma equipe inteira.</li>\n</ol>\n\n<h2>As melhores alternativas ao Claude Design</h2>\n\n<h3>1. Open Design — a escolha de código aberto e nativa de agentes</h3>\n\n<p><strong>O que é.</strong> Divulgação completa: esta é a nossa. A Open Design não é um clone do Claude Design — é uma fina camada de código aberto que transforma o coding agent que você já roda em um motor de design. Cada skill é um arquivo <code>SKILL.md</code>, cada design system um <code>DESIGN.md</code> portátil.</p>\n\n<p><strong>Principais recursos</strong></p>\n<ul>\n<li>Apache-2.0, local-first, sem cadastro — roda com <code>pnpm tools-dev</code></li>\n<li>BYOK: traga qualquer modelo compatível com OpenAI (Claude, GPT, Gemini, DeepSeek ou auto-hospedado)</li>\n<li>Detecta automaticamente mais de 16 CLIs de coding agent já presentes no seu <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen e outros)</li>\n<li>Entrega código de verdade, não só mockups — design e código permanecem em um único ciclo</li>\n<li>Uma biblioteca de skills e design systems portáteis prontos de fábrica</li>\n</ul>\n\n<p><strong>Prós:</strong> você é dono de tudo (arquivos que você pode versionar com diff e guardar); sem aprisionamento de modelo; sem medidor por assento; funciona ao lado do seu agente existente.<br>\n<strong>Contras:</strong> é uma camada que você roda, não um SaaS hospedado e polido — há configuração inicial, e não é um canvas multiplayer em tempo real.<br>\n<strong>Preço:</strong> grátis e de código aberto; você paga apenas pelo modelo que apontar para ele.<br>\n<strong>Melhor para:</strong> equipes que se recusam a entregar seu fluxo de trabalho, seus arquivos ou sua escolha de modelo a um fornecedor fechado.<br>\n<strong>Minha opinião:</strong> se o motivo de você ter deixado o Claude Design foi \"fechado / hospedado / preso ao modelo\", esta é a resposta mais direta da lista — é o oposto dos três por design.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>O que é.</strong> A incumbente. Os recursos de IA do Figma e o Figma Make trazem a geração para o canvas que toda equipe de design já conhece.</p>\n\n<p><strong>Principais recursos:</strong> canvas multiplayer em tempo real, componentes/variantes maduros, handoff via Dev Mode, um ecossistema profundo de plugins, geração por IA acoplada a tudo isso.<br>\n<strong>Prós:</strong> canvas colaborativo sem igual; o fluxo de trabalho que sua equipe já fala; ecossistema enorme.<br>\n<strong>Contras:</strong> fechado, formato de arquivo proprietário, hospedado; preço por assento; a IA é um complemento a uma ferramenta de canvas, não um agente que entrega código. (Veja <a href=\"/blog/figma-alternative-open-design/\">o caminho de código aberto a partir do Figma</a>.)<br>\n<strong>Preço:</strong> assinatura por assento, escalonada por papel.<br>\n<strong>Melhor para:</strong> equipes de design que vivem em um canvas compartilhado e querem IA ao lado dele.<br>\n<strong>Minha opinião:</strong> a escolha mais segura se a colaboração importa mais do que a propriedade — e a escolha errada se a propriedade foi o motivo de você ter deixado o Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>O que é.</strong> A ferramenta de prompt-para-UI do Google, e o produto que colocou \"vibe design\" na barra de busca de todo mundo.</p>\n\n<p><strong>Principais recursos:</strong> forte qualidade de prompt-para-UI, Voice Canvas, exportação para Figma e código de front-end, gratuito no Google Labs.<br>\n<strong>Prós:</strong> primeiras telas genuinamente boas; grátis e rápido; a melhor porta de entrada sem custo para projetar por intenção.<br>\n<strong>Contras:</strong> a superfície murada do Google — a exportação é uma porta de mão única, seu design system não é a fonte da verdade, e o preço/disponibilidade do Labs é decisão do Google. (Veja a <a href=\"/blog/vibe-design-with-stitch/\">experiência prática com o Stitch</a>.)<br>\n<strong>Preço:</strong> grátis no Labs (por enquanto).<br>\n<strong>Melhor para:</strong> explorar e esboçar direções a custo zero.<br>\n<strong>Minha opinião:</strong> um bloco de rascunho excelente, não um lugar para ser dono de um produto — use-o para explorar e depois construa em outro lugar.</p>\n\n<h3>4. v0 da Vercel</h3>\n\n<p><strong>O que é.</strong> Um gerador code-first: descreva uma UI e receba React e Tailwind que você pode levar direto para um repositório.</p>\n\n<p><strong>Principais recursos:</strong> prompt-para-componente, saída em shadcn/Tailwind, encaixe perfeito com a stack Vercel/Next.js, código de verdade desde o início.<br>\n<strong>Prós:</strong> sem o precipício do mockup — o resultado é código pronto para produção; excelente para engenheiros e design engineers.<br>\n<strong>Contras:</strong> ferramenta fechada; saída e fluxo pendem para o ecossistema da Vercel; você está editando código, não desenhando em um canvas.<br>\n<strong>Preço:</strong> plano grátis mais uso pago.<br>\n<strong>Melhor para:</strong> desenvolvedores que querem que o design chegue como código de front-end de verdade.<br>\n<strong>Minha opinião:</strong> a opção \"entrega código\" mais forte entre as ferramentas fechadas — só saiba que você assinou para viver dentro do código.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>O que é.</strong> Prompt-para-app: descreva o que você quer e o Lovable cria um app web full-stack funcionando.</p>\n\n<p><strong>Principais recursos:</strong> scaffolding full-stack a partir de um prompt, iteração rápida, preview hospedado, bom para protótipos de ponta a ponta.<br>\n<strong>Prós:</strong> você recebe um produto funcionando, não uma imagem; ótima velocidade para ideias do zero ao um.<br>\n<strong>Contras:</strong> hospedado e fechado; o app fica casado com a stack dele; \"design\" é o que o framework renderizou, então o <a href=\"/blog/vibe-design-vs-vibe-coding/\">drift</a> fica por sua conta administrar.<br>\n<strong>Preço:</strong> plano grátis mais planos pagos.<br>\n<strong>Melhor para:</strong> fundadores prototipando um produto inteiro, não só uma tela.<br>\n<strong>Minha opinião:</strong> recorra a ele quando a entrega é um app funcionando; deixe-o de lado quando você precisa de controle de design sobre um sistema.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>O que é.</strong> Um construtor de apps com IA no navegador, da StackBlitz, que gera e roda apps web completos ao vivo.</p>\n\n<p><strong>Principais recursos:</strong> runtime baseado no navegador, prompt-para-app, preview e deploy instantâneos, raízes de código aberto no ferramental da StackBlitz.<br>\n<strong>Prós:</strong> nada para instalar; o app roda imediatamente; ciclo rápido da ideia ao clicável.<br>\n<strong>Contras:</strong> os custos baseados em créditos somam; saída atrelada ao ambiente dele; mais construtor do que designer.<br>\n<strong>Preço:</strong> créditos de uso.<br>\n<strong>Melhor para:</strong> protótipos rápidos e executáveis que você quer compartilhar na mesma hora.<br>\n<strong>Minha opinião:</strong> o mais próximo em espírito do \"vibe coding\" — excelente para velocidade, menos para quando a coerência de design é o objetivo.</p>\n\n<blockquote><p>Também vale uma olhada: <strong>Visily</strong> e <strong>Uizard</strong> para mockups rápidos com IA (ótimos para ideação, mas param na imagem), e <strong>Framer AI</strong> para sites de marketing gerados por IA. Ferramentas como <strong>Magic Patterns</strong> e <strong>UX Pilot</strong> atuam no mesmo espaço de prototipagem. Nenhuma muda a decisão central abaixo.</p></blockquote>\n\n<h2>Como escolher</h2>\n\n<p>Combine a ferramenta com o motivo pelo qual você deixou o Claude Design:</p>\n\n<ul>\n<li><strong>Saiu porque é fechado / hospedado / preso ao modelo?</strong> → <strong>Open Design.</strong> É a única opção aqui que é de código aberto, BYOK e sua.</li>\n<li><strong>Saiu porque quer colaboração em canvas de equipe?</strong> → <strong>Figma.</strong></li>\n<li><strong>Saiu porque queria algo grátis e rápido?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Saiu porque queria código de verdade, agora?</strong> → <strong>v0</strong> (componentes) ou <strong>Lovable / Bolt</strong> (apps inteiros).</li>\n</ul>\n\n<p>O meta-ponto honesto: a maioria dessas ferramentas ainda é fechada, hospedada ou de modelo único — elas trocam os muros da Anthropic pelos de outra pessoa. Se a <em>categoria</em> de problema que você tem com o Claude Design é aprisionamento, só o caminho de código aberto de fato resolve isso, em vez de apenas realocá-lo.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Qual é a melhor alternativa ao Claude Design?</strong> Depende do motivo da sua saída. Para propriedade e zero aprisionamento, Open Design (código aberto, BYOK). Para colaboração, Figma. Para esboço grátis, Google Stitch. Para entregar código, v0 ou Lovable.</p>\n\n<p><strong>Existe uma alternativa ao Claude Design gratuita e de código aberto?</strong> Sim — a Open Design é Apache-2.0, gratuita e auto-hospedada; você paga apenas pelo modelo que trouxer. O Google Stitch é grátis, mas fechado.</p>\n\n<p><strong>Alguma dessas consegue entregar código de verdade como o Claude Design?</strong> Open Design, v0, Lovable e Bolt produzem código funcionando. Ferramentas de mockup (Visily, Uizard) e as ferramentas de canvas param antes.</p>\n\n<p><strong>Sou obrigado a usar o Claude como modelo?</strong> Com o Claude Design, sim. Com o BYOK da Open Design, você traz qualquer modelo compatível com OpenAI — Claude, GPT, Gemini, DeepSeek ou auto-hospedado.</p>\n\n<p><strong>Onde encontro a de código aberto?</strong> A Open Design está no <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> e roda localmente; veja <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">por que a construímos como uma camada de skills</a>.</p>\n\n<h2>O que fica</h2>\n\n<p>O Claude Design é uma boa ferramenta com um formato específico: fechado, hospedado, modelo único, embutido em assinatura. A melhor alternativa para você é aquela que conserta a parte desse formato com a qual você não conseguia conviver. Se for um recurso que está faltando, muitas dessas dão conta. Se for o aprisionamento — modelo, arquivos ou runtime — então a única solução de verdade é a aberta: a <a href=\"/\">Open Design</a> é a aposta de código aberto e nativa de agentes de que a próxima década do trabalho de design deve ser sua, do prompt até o código que vai ao ar.</p>\n\n<p><em>Pronto para experimentar o caminho aberto? <a href=\"/download\">Abra o app</a> ou <a href=\"/plugins\">explore a biblioteca de skills e design systems</a>.</em></p>"
  it:
    title: "Le migliori alternative a Claude Design nel 2026"
    summary: "Claude Design è davvero buono — ma è chiuso, hosted, vincolato al modello e incluso in un abbonamento Claude. Se anche solo una di queste cose è un ostacolo insormontabile, ecco le migliori alternative a Claude Design nel 2026, valutate su ciò che conta davvero: lo possiedi, può produrre codice vero ed è tua la scelta del modello?"
    category: "Guide"
    bodyHtml: "<p>Mi occupo di prodotto in Open Design, il che significa che ho passato dentro alle alternative a Claude Design più tempo di quanto sia probabilmente salutare — stesso brief, ogni strumento, qualche volta all'anno. Claude Design in sé è valido; questo non è un attacco. Ma \"valido\" e \"giusto per te\" non sono la stessa frase. È closed-source, solo hosted, vincolato a Claude come modello e incluso in un abbonamento Claude — e ognuna di queste cose può essere il motivo per cui stai cercando un'alternativa.</p>\n\n<p>Quindi questa è la rassegna onesta del 2026: le migliori alternative a Claude Design, valutate sulle tre cose che davvero contano — <strong>possiedi l'output, può produrre codice vero ed è tua la scelta del modello?</strong> Lo dico subito: uno degli strumenti di questa lista lo costruiamo noi; ho mantenuto onesti gli elogi agli altri, perché una lista truccata è una lista inutile.</p>\n\n<h2>Perché cercare un'alternativa a Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) è uno strumento di design conversazionale: chat a sinistra, canvas a destra, dal prototipo al codice tramite Claude Code. È veloce e curato. I motivi per cui i team guardano comunque altrove sono strutturali, non di qualità:</p>\n\n<ul>\n<li><strong>Il modello è fisso.</strong> Ogni render passa per Claude. Se già paghi per GPT, Gemini, o fai self-hosting per lavori sensibili, quella spesa non si trasferisce.</li>\n<li><strong>È solo hosted.</strong> I tuoi prompt, il design system e il contesto del codebase viaggiano verso i server di Anthropic — una conversazione con l'ufficio acquisti per lavori di agenzia o sotto NDA.</li>\n<li><strong>È chiuso.</strong> Non puoi fare fork, audit o sostituire il comportamento di design.</li>\n<li><strong>La fattura è un abbonamento incluso.</strong> Va bene per un singolo utente Pro, scomodo per un team, un non-partente per la lunga coda di contributor.</li>\n</ul>\n\n<p>Se nessuna di queste cose ti dà fastidio, Claude Design è un'ottima scelta. Se una di queste ti ha appena fatto annuire, continua a leggere.</p>\n\n<h2>Confronto rapido</h2>\n\n<table>\n<thead>\n<tr><th>Strumento</th><th>Ideale per</th><th>Open source</th><th>Produce codice vero</th><th>Scelta del modello</th><th>Struttura dei prezzi</th></tr>\n</thead>\n<tbody>\n<tr><td><strong>Open Design</strong></td><td>Possedere l'intero ciclo</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / qualsiasi</td><td>Gratuito, self-run</td></tr>\n<tr><td><strong>Figma (Make / AI)</strong></td><td>Collaborazione su canvas in team</td><td>❌</td><td>Parziale (export)</td><td>❌</td><td>Abbonamento per postazione</td></tr>\n<tr><td><strong>Google Stitch</strong></td><td>Bozze gratuite e veloci</td><td>❌</td><td>Export verso codice/Figma</td><td>❌</td><td>Gratuito (Labs)</td></tr>\n<tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → codice React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Piano gratuito + a pagamento</td></tr>\n<tr><td><strong>Lovable</strong></td><td>Prompt → app completa</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Piano gratuito + a pagamento</td></tr>\n<tr><td><strong>Bolt (bolt.new)</strong></td><td>Build di app nel browser</td><td>Parziale (radici OSS)</td><td>✅</td><td>Parziale</td><td>A crediti</td></tr>\n</tbody>\n</table>\n\n<h2>Come le ho valutate</h2>\n\n<p>Non in base al numero di funzionalità — ma a ciò che sopravvive al contatto con un progetto reale. Quattro criteri, in ordine di quanto spesso fanno male:</p>\n\n<ol>\n<li><strong>Proprietà.</strong> Quando smetti di pagare o lo strumento cambia, conservi il tuo lavoro in forma portabile, oppure resta bloccato nel cloud di qualcun altro?</li>\n<li><strong>Arriva al codice vero.</strong> L'output diventa un'interfaccia funzionante, o un mockup che qualcuno ricostruisce a mano? (Tutto il <a href=\"/blog/vibe-design-vs-vibe-coding/\">divario tra mockup e prodotto spedito</a>.)</li>\n<li><strong>Libertà sul modello.</strong> Puoi portare il modello per cui già paghi, oppure sei vincolato alla curva dei prezzi di un solo fornitore?</li>\n<li><strong>Struttura dei prezzi.</strong> Abbonamento per postazione, crediti d'uso, oppure gratuito-e-self-run — e come si scala all'intero team.</li>\n</ol>\n\n<h2>Le migliori alternative a Claude Design</h2>\n\n<h3>1. Open Design — la scelta open-source e agent-native</h3>\n\n<p><strong>Cos'è.</strong> Massima trasparenza: questo è il nostro. Open Design non è un clone di Claude Design — è un sottile strato open-source che trasforma il coding agent che già usi in un motore di design. Ogni skill è un file <code>SKILL.md</code>, ogni design system è un <code>DESIGN.md</code> portabile.</p>\n\n<p><strong>Funzionalità chiave</strong></p>\n<ul>\n<li>Apache-2.0, local-first, nessuna registrazione — gira con <code>pnpm tools-dev</code></li>\n<li>BYOK: porta qualsiasi modello compatibile con OpenAI (Claude, GPT, Gemini, DeepSeek o self-hosted)</li>\n<li>Rileva automaticamente più di 16 CLI di coding agent già presenti nel tuo <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen e altri)</li>\n<li>Arriva al codice vero, non solo a mockup — design e codice restano in un unico ciclo</li>\n<li>Una libreria di skill e design system portabili pronta all'uso</li>\n</ul>\n\n<p><strong>Pro:</strong> possiedi tutto (file di cui puoi fare il diff e che conservi); nessun lock-in sul modello; nessun contatore per postazione; funziona insieme al tuo agent esistente.<br>\n<strong>Contro:</strong> è uno strato che esegui tu, non un SaaS hosted e levigato — c'è una configurazione da fare, e non è un canvas multiplayer in tempo reale.<br>\n<strong>Prezzi:</strong> gratuito e open-source; paghi solo per il modello a cui lo punti.<br>\n<strong>Ideale per:</strong> team che si rifiutano di affidare il proprio workflow, i propri file o la scelta del modello a un fornitore chiuso.<br>\n<strong>Il mio parere:</strong> se il motivo per cui hai lasciato Claude Design era \"chiuso / hosted / vincolato al modello\", questa è la risposta più diretta della lista — è l'opposto di tutti e tre per progettazione.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>Cos'è.</strong> Il leader storico. Le funzionalità AI di Figma e Figma Make portano la generazione sul canvas che ogni team di design già conosce.</p>\n\n<p><strong>Funzionalità chiave:</strong> canvas multiplayer in tempo reale, componenti/varianti maturi, handoff in Dev Mode, un ecosistema di plugin profondo, generazione AI innestata su tutto questo.<br>\n<strong>Pro:</strong> canvas collaborativo senza rivali; il workflow che il tuo team già parla; ecosistema enorme.<br>\n<strong>Contro:</strong> chiuso, formato di file proprietario, hosted; prezzi per postazione; l'AI è un add-on a uno strumento canvas, non un agent che produce codice. (Vedi <a href=\"/blog/figma-alternative-open-design/\">il percorso open-source da Figma</a>.)<br>\n<strong>Prezzi:</strong> abbonamento per postazione, a fasce in base al ruolo.<br>\n<strong>Ideale per:</strong> team di design che vivono su un canvas condiviso e vogliono l'AI accanto.<br>\n<strong>Il mio parere:</strong> la scelta più sicura se la collaborazione conta più della proprietà — e quella sbagliata se la proprietà è il motivo per cui hai lasciato Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Cos'è.</strong> Lo strumento prompt-to-UI di Google, e il prodotto che ha messo \"vibe design\" nella barra di ricerca di tutti.</p>\n\n<p><strong>Funzionalità chiave:</strong> ottima qualità prompt-to-UI, Voice Canvas, export verso Figma e codice front-end, gratuito in Google Labs.<br>\n<strong>Pro:</strong> prime schermate davvero buone; gratuito e veloce; la migliore rampa d'accesso a costo zero per progettare per intento.<br>\n<strong>Contro:</strong> la superficie recintata di Google — l'export è una porta a senso unico, il tuo design system non è la fonte di verità, e prezzi/disponibilità di Labs li decide Google. (Prova completa <a href=\"/blog/vibe-design-with-stitch/\">sul campo con Stitch</a>.)<br>\n<strong>Prezzi:</strong> gratuito in Labs (per ora).<br>\n<strong>Ideale per:</strong> esplorare e abbozzare direzioni a costo zero.<br>\n<strong>Il mio parere:</strong> un eccellente blocco per gli schizzi, non un posto in cui possedere un prodotto — usalo per esplorare, poi costruisci altrove.</p>\n\n<h3>4. v0 di Vercel</h3>\n\n<p><strong>Cos'è.</strong> Un generatore code-first: descrivi una UI, ottieni React e Tailwind che puoi portare in un repo.</p>\n\n<p><strong>Funzionalità chiave:</strong> prompt-to-component, output shadcn/Tailwind, ottima integrazione con lo stack Vercel/Next.js, codice vero fin dall'inizio.<br>\n<strong>Pro:</strong> nessun salto dal mockup — l'output è codice spedibile; eccellente per ingegneri e design engineer.<br>\n<strong>Contro:</strong> strumento chiuso; output e flusso pendono verso l'ecosistema Vercel; stai modificando codice, non progettando su un canvas.<br>\n<strong>Prezzi:</strong> piano gratuito più consumo a pagamento.<br>\n<strong>Ideale per:</strong> sviluppatori che vogliono che il design arrivi come codice front-end vero.<br>\n<strong>Il mio parere:</strong> l'opzione \"arriva al codice\" più forte tra gli strumenti chiusi — sappi solo che hai accettato di vivere dentro al codice.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Cos'è.</strong> Prompt-to-app: descrivi ciò che vuoi e Lovable mette su una web app full-stack funzionante.</p>\n\n<p><strong>Funzionalità chiave:</strong> scaffolding full-stack da un prompt, iterazione veloce, anteprima hosted, ottimo per prototipi end-to-end.<br>\n<strong>Pro:</strong> ottieni un prodotto funzionante, non un'immagine; grande velocità per idee zero-to-one.<br>\n<strong>Contro:</strong> hosted e chiuso; l'app è sposata al suo stack; il \"design\" è ciò che il framework ha renderizzato, quindi il <a href=\"/blog/vibe-design-vs-vibe-coding/\">drift</a> sta a te gestirlo.<br>\n<strong>Prezzi:</strong> piano gratuito più piani a pagamento.<br>\n<strong>Ideale per:</strong> founder che prototipano un intero prodotto, non solo una schermata.<br>\n<strong>Il mio parere:</strong> sceglilo quando il deliverable è un'app funzionante; saltalo quando ti serve controllo di design su un sistema.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Cos'è.</strong> Un costruttore di app AI nel browser di StackBlitz che genera ed esegue web app complete dal vivo.</p>\n\n<p><strong>Funzionalità chiave:</strong> runtime basato su browser, prompt-to-app, anteprima e deploy istantanei, radici open-source nel tooling di StackBlitz.<br>\n<strong>Pro:</strong> niente da installare; l'app gira immediatamente; ciclo veloce dall'idea al cliccabile.<br>\n<strong>Contro:</strong> i costi a crediti si accumulano; output legato al suo ambiente; più costruttore che progettista.<br>\n<strong>Prezzi:</strong> crediti d'uso.<br>\n<strong>Ideale per:</strong> prototipi rapidi e funzionanti che vuoi condividere nella stessa ora.<br>\n<strong>Il mio parere:</strong> il più vicino nello spirito al \"vibe coding\" — eccellente per la velocità, meno quando l'obiettivo è la coerenza del design.</p>\n\n<blockquote><p>Vale anche un'occhiata: <strong>Visily</strong> e <strong>Uizard</strong> per mockup AI veloci (ottimi per l'ideazione, ma si fermano all'immagine), e <strong>Framer AI</strong> per siti marketing generati dall'AI. Strumenti come <strong>Magic Patterns</strong> e <strong>UX Pilot</strong> giocano nello stesso spazio della prototipazione. Nessuno cambia la decisione di fondo qui sotto.</p></blockquote>\n\n<h2>Come scegliere</h2>\n\n<p>Abbina lo strumento al motivo per cui hai lasciato Claude Design:</p>\n\n<ul>\n<li><strong>Andato via perché è chiuso / hosted / vincolato al modello?</strong> → <strong>Open Design.</strong> È l'unica opzione qui che è open-source, BYOK e tua.</li>\n<li><strong>Andato via perché vuoi collaborazione su canvas in team?</strong> → <strong>Figma.</strong></li>\n<li><strong>Andato via perché volevi gratuito e veloce?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Andato via perché volevi codice vero, subito?</strong> → <strong>v0</strong> (componenti) o <strong>Lovable / Bolt</strong> (app intere).</li>\n</ul>\n\n<p>Il punto onesto e di fondo: la maggior parte di questi è ancora chiusa, hosted o a modello unico — barattano i muri di Anthropic con quelli di qualcun altro. Se la <em>categoria</em> di problema che hai con Claude Design è il lock-in, solo il percorso open-source lo risolve davvero invece di limitarsi a spostarlo.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Qual è la migliore alternativa a Claude Design?</strong> Dipende dal perché te ne vai. Per la proprietà e nessun lock-in, Open Design (open-source, BYOK). Per la collaborazione, Figma. Per gli schizzi gratuiti, Google Stitch. Per spedire codice, v0 o Lovable.</p>\n\n<p><strong>Esiste un'alternativa a Claude Design gratuita e open-source?</strong> Sì — Open Design è Apache-2.0, gratuito e self-hosted; paghi solo per il modello che porti. Google Stitch è gratuito ma chiuso.</p>\n\n<p><strong>Qualcuno di questi può arrivare al codice vero come Claude Design?</strong> Open Design, v0, Lovable e Bolt producono tutti codice funzionante. Gli strumenti per mockup (Visily, Uizard) e gli strumenti canvas si fermano prima.</p>\n\n<p><strong>Devo per forza usare Claude come modello?</strong> Con Claude Design, sì. Con il BYOK di Open Design, porti qualsiasi modello compatibile con OpenAI — Claude, GPT, Gemini, DeepSeek o self-hosted.</p>\n\n<p><strong>Dove trovo quello open-source?</strong> Open Design è su <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> e gira in locale; vedi <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">perché l'abbiamo costruito come skill layer</a>.</p>\n\n<h2>In conclusione</h2>\n\n<p>Claude Design è un buon strumento con una forma specifica: chiuso, hosted, a modello unico, con abbonamento incluso. La migliore alternativa per te è quella che corregge la parte di quella forma con cui non riuscivi a convivere. Se è una funzionalità che ti manca, molti di questi andranno bene. Se è il lock-in — modello, file o runtime — allora l'unica vera soluzione è quella aperta: <a href=\"/\">Open Design</a> è la scommessa open-source e agent-native sul fatto che il prossimo decennio del lavoro di design debba essere tuo da possedere, dal prompt fino al codice spedito.</p>\n\n<p><em>Pronto a provare il percorso aperto? <a href=\"/download\">Apri l'app</a> o <a href=\"/plugins\">sfoglia la libreria di skill e design system</a>.</em></p>"
  vi:
    title: "Những lựa chọn thay thế Claude Design tốt nhất năm 2026"
    summary: "Claude Design thực sự tốt — nhưng nó đóng kín, chỉ chạy trên cloud, khóa cứng mô hình và đi kèm gói đăng ký Claude. Nếu bất kỳ điều nào trong số đó là rào cản với bạn, đây là những lựa chọn thay thế Claude Design tốt nhất năm 2026, được chấm điểm dựa trên những gì thực sự quan trọng: bạn có sở hữu nó không, nó có xuất được code thật không, và mô hình có phải là lựa chọn của bạn không?"
    category: "Hướng dẫn"
    bodyHtml: "<p>Tôi phụ trách sản phẩm tại Open Design, nghĩa là tôi đã dành nhiều thời gian bên trong các lựa chọn thay thế Claude Design hơn mức có lẽ là lành mạnh — cùng một đề bài, mọi công cụ, vài lần mỗi năm. Bản thân Claude Design rất tốt; đây không phải là một bài đánh sập. Nhưng \"tốt\" và \"phù hợp với bạn\" không phải là cùng một câu chuyện. Nó đóng mã nguồn, chỉ chạy trên cloud, khóa cứng vào Claude làm mô hình, và được gộp vào gói đăng ký Claude — và bất kỳ điều nào trong số đó đều có thể là lý do khiến bạn đi tìm một lựa chọn thay thế.</p>\n\n<p>Vậy nên đây là bản tổng hợp trung thực cho năm 2026: những lựa chọn thay thế Claude Design tốt nhất, được chấm điểm trên ba thứ thực sự quyết định vấn đề — <strong>bạn có sở hữu kết quả không, nó có xuất được code thật không, và mô hình có phải là lựa chọn của bạn không?</strong> Tôi nói thẳng từ đầu rằng chúng tôi xây dựng một trong những công cụ trong danh sách này; tôi đã giữ những lời khen dành cho các công cụ khác là thật lòng, bởi một danh sách bị dàn xếp là một danh sách vô dụng.</p>\n\n<h2>Vì sao nên tìm một lựa chọn thay thế Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) là một công cụ thiết kế kiểu hội thoại: chat bên trái, canvas bên phải, đi từ prototype tới code thông qua Claude Code. Nó nhanh và chỉn chu. Lý do các đội nhóm vẫn tìm chỗ khác là về mặt cấu trúc, không phải về chất lượng:</p>\n\n<ul>\n<li><strong>Mô hình bị cố định.</strong> Mọi lần render đều đi qua Claude. Nếu bạn đã trả tiền cho GPT, Gemini, hoặc tự host cho công việc nhạy cảm, điều đó không chuyển đổi được.</li>\n<li><strong>Chỉ chạy trên cloud.</strong> Các prompt, design system và ngữ cảnh codebase của bạn đều phải đi tới máy chủ của Anthropic — một cuộc trao đổi mua sắm nội bộ đối với công việc agency hoặc có NDA.</li>\n<li><strong>Nó đóng kín.</strong> Bạn không thể fork, kiểm toán, hay thay đổi hành vi thiết kế.</li>\n<li><strong>Hóa đơn là một gói đăng ký gộp chung.</strong> Ổn với một người dùng Pro đơn lẻ, nhưng vướng víu với một đội nhóm, và là điều bất khả thi với một lượng lớn cộng tác viên rải rác.</li>\n</ul>\n\n<p>Nếu không điều nào trong số đó làm phiền bạn, Claude Design là một lựa chọn ổn. Nếu một trong số đó vừa khiến bạn gật đầu, hãy đọc tiếp.</p>\n\n<h2>So sánh nhanh</h2>\n\n<table><thead><tr><th>Công cụ</th><th>Phù hợp nhất với</th><th>Mã nguồn mở</th><th>Xuất code thật</th><th>Lựa chọn mô hình</th><th>Mô hình giá</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Sở hữu toàn bộ vòng lặp</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / bất kỳ</td><td>Miễn phí, tự chạy</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Cộng tác trên canvas nhóm</td><td>❌</td><td>Một phần (export)</td><td>❌</td><td>Đăng ký theo chỗ</td></tr><tr><td><strong>Google Stitch</strong></td><td>Phác thảo nhanh, miễn phí</td><td>❌</td><td>Export sang code/Figma</td><td>❌</td><td>Miễn phí (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → code React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Bậc miễn phí + trả phí</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → ứng dụng hoàn chỉnh</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Bậc miễn phí + trả phí</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Dựng ứng dụng ngay trong trình duyệt</td><td>Một phần (gốc OSS)</td><td>✅</td><td>Một phần</td><td>Theo tín dụng</td></tr></tbody></table>\n\n<h2>Tôi đã đánh giá những công cụ này như thế nào</h2>\n\n<p>Không phải bằng số lượng tính năng — mà bằng những gì còn trụ vững khi va chạm với một dự án thật. Bốn tiêu chí, theo thứ tự mức độ thường xuyên cắn vào bạn:</p>\n\n<ul>\n<li><strong>Quyền sở hữu.</strong> Khi bạn ngừng trả tiền hoặc công cụ thay đổi, bạn có giữ được thành quả ở dạng có thể mang đi, hay nó bị mắc kẹt trong cloud của ai đó?</li>\n<li><strong>Xuất được ra code thật.</strong> Kết quả có trở thành một giao diện đang chạy, hay một mockup mà ai đó phải dựng lại bằng tay? (Toàn bộ <a href=\"/blog/vibe-design-vs-vibe-coding/\">khoảng cách từ mockup tới sản phẩm đã ship</a>.)</li>\n<li><strong>Tự do về mô hình.</strong> Bạn có thể mang mô hình mà mình đã trả tiền sẵn, hay bị khóa vào đường cong giá của một nhà cung cấp?</li>\n<li><strong>Mô hình giá.</strong> Đăng ký theo chỗ, tín dụng theo mức dùng, hay miễn phí và tự chạy — và điều đó mở rộng ra sao cho cả một đội nhóm.</li>\n</ul>\n\n<h2>Những lựa chọn thay thế Claude Design tốt nhất</h2>\n\n<h3>1. Open Design — lựa chọn mã nguồn mở, gắn liền với agent</h3>\n\n<p><strong>Nó là gì.</strong> Nói thẳng: đây là sản phẩm của chúng tôi. Open Design không phải là một bản sao của Claude Design — nó là một lớp mã nguồn mở mỏng biến chính coding agent mà bạn đang chạy thành một cỗ máy thiết kế. Mỗi skill là một file <code>SKILL.md</code>, mỗi design system là một file <code>DESIGN.md</code> có thể mang đi.</p>\n\n<p><strong>Tính năng chính</strong></p>\n<ul>\n<li>Apache-2.0, ưu tiên local, không cần đăng ký — chạy bằng <code>pnpm tools-dev</code></li>\n<li>BYOK: mang bất kỳ mô hình tương thích OpenAI nào (Claude, GPT, Gemini, DeepSeek, hoặc tự host)</li>\n<li>Tự động phát hiện hơn 16 CLI coding-agent đã có sẵn trên <code>$PATH</code> của bạn (Claude Code, Codex, Cursor, OpenCode, Qwen, và hơn nữa)</li>\n<li>Xuất ra code thật, không chỉ mockup — thiết kế và code nằm trong cùng một vòng lặp</li>\n<li>Một thư viện skill và các design system có thể mang đi, sẵn dùng ngay</li>\n</ul>\n\n<p><strong>Ưu điểm:</strong> bạn sở hữu mọi thứ (những file bạn có thể diff và giữ lại); không khóa mô hình; không tính phí theo chỗ ngồi; hoạt động song song với agent hiện có của bạn.<br>\n<strong>Nhược điểm:</strong> nó là một lớp bạn tự chạy, không phải một SaaS đã được mài giũa và host sẵn — có chút thiết lập, và nó không phải một canvas đa người chơi thời gian thực.<br>\n<strong>Giá:</strong> miễn phí và mã nguồn mở; bạn chỉ trả tiền cho mô hình mà bạn trỏ tới.<br>\n<strong>Phù hợp nhất với:</strong> các đội nhóm từ chối giao quy trình làm việc, file, hay lựa chọn mô hình của mình cho một nhà cung cấp đóng kín.<br>\n<strong>Ý kiến của tôi:</strong> nếu lý do bạn rời Claude Design là \"đóng kín / chạy trên cloud / khóa mô hình,\" thì đây là câu trả lời trực diện nhất trong danh sách — nó là điều ngược lại với cả ba, theo đúng thiết kế.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>Nó là gì.</strong> Kẻ đương nhiệm. Các tính năng AI của Figma và Figma Make đưa khả năng tạo sinh lên chính cái canvas mà mọi đội thiết kế đều đã quen.</p>\n\n<p><strong>Tính năng chính:</strong> canvas đa người chơi thời gian thực, hệ thống component/variant trưởng thành, bàn giao qua Dev Mode, một hệ sinh thái plugin sâu rộng, cùng khả năng tạo sinh AI gắn vào tất cả những thứ đó.<br>\n<strong>Ưu điểm:</strong> canvas cộng tác không đối thủ; quy trình làm việc mà đội của bạn đã nói thạo; hệ sinh thái khổng lồ.<br>\n<strong>Nhược điểm:</strong> đóng kín, định dạng file độc quyền, chạy trên cloud; giá theo chỗ; AI là một tính năng bổ sung cho công cụ canvas, không phải một agent xuất ra code. (Xem <a href=\"/blog/figma-alternative-open-design/\">con đường mã nguồn mở từ Figma</a>.)<br>\n<strong>Giá:</strong> đăng ký theo chỗ, phân bậc theo vai trò.<br>\n<strong>Phù hợp nhất với:</strong> các đội thiết kế sống trên một canvas chung và muốn có AI bên cạnh.<br>\n<strong>Ý kiến của tôi:</strong> lựa chọn an toàn nhất nếu cộng tác quan trọng hơn quyền sở hữu — và là lựa chọn sai nếu quyền sở hữu chính là lý do bạn rời Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Nó là gì.</strong> Công cụ prompt-thành-UI của Google, và là sản phẩm đã đưa \"vibe design\" vào thanh tìm kiếm của tất cả mọi người.</p>\n\n<p><strong>Tính năng chính:</strong> chất lượng prompt-thành-UI mạnh, Voice Canvas, export sang Figma và code front-end, miễn phí trong Google Labs.<br>\n<strong>Ưu điểm:</strong> những màn hình đầu tiên thực sự tốt; miễn phí và nhanh; lối vào không tốn kém nhất để thiết kế bằng ý định.<br>\n<strong>Nhược điểm:</strong> bề mặt khép kín của Google — bản export là cánh cửa một chiều, design system của bạn không phải nguồn chân lý, và giá cả/khả năng có sẵn của Labs là do Google quyết. (Toàn bộ <a href=\"/blog/vibe-design-with-stitch/\">trải nghiệm thực tế với Stitch</a>.)<br>\n<strong>Giá:</strong> miễn phí trong Labs (hiện tại).<br>\n<strong>Phù hợp nhất với:</strong> khám phá và phác thảo các hướng đi mà không tốn xu nào.<br>\n<strong>Ý kiến của tôi:</strong> một cuốn sổ phác thảo tuyệt vời, không phải nơi để sở hữu một sản phẩm — dùng nó để khám phá, rồi xây dựng ở chỗ khác.</p>\n\n<h3>4. v0 của Vercel</h3>\n\n<p><strong>Nó là gì.</strong> Một bộ tạo sinh ưu tiên code: mô tả một UI, nhận về React và Tailwind mà bạn có thể bê thẳng vào repo.</p>\n\n<p><strong>Tính năng chính:</strong> prompt-thành-component, output shadcn/Tailwind, ăn khớp chặt với stack Vercel/Next.js, có code thật ngay từ đầu.<br>\n<strong>Ưu điểm:</strong> không có vách đá mockup — output là code có thể ship được; tuyệt vời cho kỹ sư và design engineer.<br>\n<strong>Nhược điểm:</strong> công cụ đóng kín; output và luồng làm việc nghiêng về hệ sinh thái Vercel; bạn đang chỉnh code, chứ không phải thiết kế trên canvas.<br>\n<strong>Giá:</strong> bậc miễn phí cộng với phí theo mức dùng.<br>\n<strong>Phù hợp nhất với:</strong> lập trình viên muốn thiết kế đến tay dưới dạng code front-end thật.<br>\n<strong>Ý kiến của tôi:</strong> lựa chọn \"xuất ra code\" mạnh nhất trong số các công cụ đóng kín — chỉ cần biết rằng bạn đã đăng ký sống trong code.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Nó là gì.</strong> Prompt-thành-ứng-dụng: mô tả điều bạn muốn và Lovable dựng lên một ứng dụng web full-stack đang chạy.</p>\n\n<p><strong>Tính năng chính:</strong> dựng khung full-stack từ một prompt, lặp nhanh, preview được host, tốt cho các prototype đầu-cuối.<br>\n<strong>Ưu điểm:</strong> bạn nhận về một sản phẩm đang chạy, không phải một bức tranh; tốc độ tuyệt vời cho các ý tưởng từ-không-thành-một.<br>\n<strong>Nhược điểm:</strong> được host và đóng kín; ứng dụng gắn chặt với stack của nó; \"thiết kế\" là bất cứ thứ gì framework render ra, nên <a href=\"/blog/vibe-design-vs-vibe-coding/\">sự trôi dạt</a> là việc bạn phải tự quản lý.<br>\n<strong>Giá:</strong> bậc miễn phí cộng với các gói trả phí.<br>\n<strong>Phù hợp nhất với:</strong> các nhà sáng lập làm prototype cho cả một sản phẩm, không chỉ một màn hình.<br>\n<strong>Ý kiến của tôi:</strong> hãy với tới nó khi sản phẩm bàn giao là một ứng dụng đang chạy; bỏ qua nó khi bạn cần quyền kiểm soát thiết kế trên một hệ thống.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Nó là gì.</strong> Một bộ dựng ứng dụng AI ngay trong trình duyệt từ StackBlitz, tạo sinh và chạy trực tiếp các ứng dụng web hoàn chỉnh.</p>\n\n<p><strong>Tính năng chính:</strong> runtime chạy trong trình duyệt, prompt-thành-ứng-dụng, preview và deploy tức thì, gốc mã nguồn mở trong bộ công cụ StackBlitz.<br>\n<strong>Ưu điểm:</strong> không cần cài đặt gì; ứng dụng chạy ngay lập tức; vòng lặp nhanh từ ý tưởng đến thứ bấm được.<br>\n<strong>Nhược điểm:</strong> chi phí theo tín dụng cộng dồn lại; output bị buộc vào môi trường của nó; thiên về dựng ứng dụng hơn là thiết kế.<br>\n<strong>Giá:</strong> tín dụng theo mức dùng.<br>\n<strong>Phù hợp nhất với:</strong> các prototype nhanh, chạy được mà bạn muốn chia sẻ ngay trong cùng giờ.<br>\n<strong>Ý kiến của tôi:</strong> gần với tinh thần \"vibe coding\" nhất — tuyệt vời về tốc độ, kém hơn khi mục tiêu là sự nhất quán trong thiết kế.</p>\n\n<blockquote><p>Cũng đáng ngó qua: <strong>Visily</strong> và <strong>Uizard</strong> cho việc làm mockup AI nhanh (tuyệt cho việc lên ý tưởng, nhưng chúng dừng lại ở bức tranh), và <strong>Framer AI</strong> cho các trang marketing do AI tạo sinh. Các công cụ như <strong>Magic Patterns</strong> và <strong>UX Pilot</strong> chơi trong cùng không gian làm prototype. Không công cụ nào thay đổi quyết định cốt lõi bên dưới.</p></blockquote>\n\n<h2>Cách lựa chọn</h2>\n\n<p>Hãy ghép công cụ với lý do bạn rời Claude Design:</p>\n\n<ul>\n<li><strong>Rời vì nó đóng kín / chạy trên cloud / khóa mô hình?</strong> → <strong>Open Design.</strong> Đây là lựa chọn duy nhất ở đây vừa mã nguồn mở, vừa BYOK, vừa là của bạn.</li>\n<li><strong>Rời vì bạn muốn cộng tác trên canvas nhóm?</strong> → <strong>Figma.</strong></li>\n<li><strong>Rời vì bạn muốn miễn phí và nhanh?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Rời vì bạn muốn có code thật, ngay bây giờ?</strong> → <strong>v0</strong> (component) hoặc <strong>Lovable / Bolt</strong> (ứng dụng trọn vẹn).</li>\n</ul>\n\n<p>Điểm cốt lõi thành thật: phần lớn những công cụ này vẫn đóng kín, được host, hoặc đơn-mô-hình — chúng đánh đổi những bức tường của Anthropic lấy bức tường của người khác. Nếu <em>loại</em> vấn đề mà bạn gặp với Claude Design là bị khóa, thì chỉ con đường mã nguồn mở mới thực sự giải quyết được nó thay vì dời nó đi chỗ khác.</p>\n\n<h2>Câu hỏi thường gặp</h2>\n\n<p><strong>Lựa chọn thay thế Claude Design tốt nhất là gì?</strong> Tùy vào lý do bạn ra đi. Để có quyền sở hữu và không bị khóa, Open Design (mã nguồn mở, BYOK). Để cộng tác, Figma. Để phác thảo miễn phí, Google Stitch. Để xuất code, v0 hoặc Lovable.</p>\n\n<p><strong>Có một lựa chọn thay thế Claude Design miễn phí, mã nguồn mở không?</strong> Có — Open Design dùng Apache-2.0, miễn phí, và tự host; bạn chỉ trả tiền cho mô hình mà bạn mang theo. Google Stitch miễn phí nhưng đóng kín.</p>\n\n<p><strong>Bất kỳ công cụ nào trong số này có xuất được ra code thật như Claude Design không?</strong> Open Design, v0, Lovable, và Bolt đều tạo ra code đang chạy. Các công cụ mockup (Visily, Uizard) và các công cụ canvas thì dừng lại sớm hơn.</p>\n\n<p><strong>Tôi có bắt buộc phải dùng Claude làm mô hình không?</strong> Với Claude Design thì có. Với BYOK của Open Design, bạn mang bất kỳ mô hình tương thích OpenAI nào — Claude, GPT, Gemini, DeepSeek, hoặc tự host.</p>\n\n<p><strong>Tôi tìm cái mã nguồn mở ở đâu?</strong> Open Design có trên <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> và chạy ở local; xem <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">vì sao chúng tôi xây dựng nó như một lớp skill</a>.</p>\n\n<h2>Điều đọng lại</h2>\n\n<p>Claude Design là một công cụ tốt với một hình hài cụ thể: đóng kín, được host, đơn-mô-hình, gộp vào đăng ký. Lựa chọn thay thế tốt nhất cho bạn là cái nào sửa được phần của hình hài đó mà bạn không thể chung sống. Nếu đó là một tính năng bạn còn thiếu, rất nhiều công cụ trong số này sẽ làm được. Nếu đó là sự bị khóa — về mô hình, file, hay runtime — thì cách sửa thật sự duy nhất là cái mở: <a href=\"/\">Open Design</a> là canh bạc mã nguồn mở, gắn liền với agent, đặt cược rằng thập kỷ tới của công việc thiết kế nên là của bạn để sở hữu, từ prompt cho đến code đã ship.</p>\n\n<p><em>Sẵn sàng thử con đường mở? <a href=\"/download\">Mở ứng dụng</a> hoặc <a href=\"/plugins\">duyệt thư viện skill và design-system</a>.</em></p>"
  pl:
    title: "Najlepsze alternatywy dla Claude Design w 2026 roku"
    summary: "Claude Design jest naprawdę dobre — ale jest zamknięte, dostępne wyłącznie w chmurze, przywiązane do modelu i dorzucone do subskrypcji Claude. Jeśli którakolwiek z tych rzeczy to dla ciebie warunek wykluczający, oto najlepsze alternatywy dla Claude Design w 2026 roku, oceniane według tego, co naprawdę się liczy: czy jesteś ich właścicielem, czy potrafią dostarczyć prawdziwy kod i czy wybór modelu należy do ciebie?"
    category: "Poradniki"
    bodyHtml: "<p>Kieruję produktem w Open Design, co oznacza, że spędziłem w alternatywach dla Claude Design więcej czasu, niż jest to zapewne zdrowe — ten sam brief, każde narzędzie, kilka razy w roku. Samo Claude Design jest dobre; to nie jest zjazd. Ale „dobre” i „odpowiednie dla ciebie” to nie to samo zdanie. Jest zamknięte, dostępne wyłącznie w chmurze, przywiązane do Claude jako modelu i dorzucone do subskrypcji Claude — a każda z tych rzeczy z osobna może być powodem, dla którego szukasz alternatywy.</p>\n\n<p>To zatem uczciwe zestawienie na 2026 rok: najlepsze alternatywy dla Claude Design, oceniane według trzech rzeczy, które naprawdę przesądzają o wyborze — <strong>czy jesteś właścicielem efektu pracy, czy potrafi dostarczyć prawdziwy kod i czy wybór modelu należy do ciebie?</strong> Powiem to wprost: jedno z narzędzi na tej liście budujemy my; pochwały dla pozostałych zostawiłem szczere, bo ustawiona lista jest listą bezużyteczną.</p>\n\n<h2>Dlaczego szukać alternatywy dla Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) to konwersacyjne narzędzie projektowe: czat po lewej, kanwa po prawej, droga od prototypu do kodu przez Claude Code. Jest szybkie i dopracowane. Powody, dla których zespoły wciąż rozglądają się gdzie indziej, są strukturalne, nie jakościowe:</p>\n\n<ul>\n<li><strong>Model jest narzucony.</strong> Każdy render przechodzi przez Claude. Jeśli już płacisz za GPT, Gemini albo hostujesz własny model do wrażliwych zadań, to się nie przekłada.</li>\n<li><strong>Działa wyłącznie w chmurze.</strong> Twoje prompty, system projektowy i kontekst kodu wędrują na serwery Anthropic — to temat na rozmowę z działem zakupów przy pracy agencyjnej lub objętej NDA.</li>\n<li><strong>Jest zamknięte.</strong> Nie możesz go sforkować, zaudytować ani podmienić zachowania projektowego.</li>\n<li><strong>Rachunek to dorzucona subskrypcja.</strong> W porządku dla pojedynczego użytkownika Pro, niezręczny dla zespołu, nie do przyjęcia dla długiego ogona kontrybutorów.</li>\n</ul>\n\n<p>Jeśli żadna z tych rzeczy ci nie przeszkadza, Claude Design to dobry wybór. Jeśli przy którejś właśnie pokiwałeś głową, czytaj dalej.</p>\n\n<h2>Szybkie porównanie</h2>\n\n<table><thead><tr><th>Narzędzie</th><th>Najlepsze do</th><th>Open source</th><th>Dostarcza prawdziwy kod</th><th>Wybór modelu</th><th>Model cenowy</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Posiadania całej pętli</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / dowolny</td><td>Darmowe, uruchamiane samodzielnie</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Współpracy zespołowej na kanwie</td><td>❌</td><td>Częściowo (eksport)</td><td>❌</td><td>Subskrypcja za stanowisko</td></tr><tr><td><strong>Google Stitch</strong></td><td>Darmowego, szybkiego szkicowania</td><td>❌</td><td>Eksport do kodu/Figma</td><td>❌</td><td>Darmowe (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → kod React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Darmowy plan + płatne</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → pełna aplikacja</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Darmowy plan + płatne</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Budowania aplikacji w przeglądarce</td><td>Częściowo (korzenie OSS)</td><td>✅</td><td>Częściowo</td><td>Oparty na kredytach</td></tr></tbody></table>\n\n<h2>Jak je oceniałem</h2>\n\n<p>Nie po liczbie funkcji — po tym, co przetrwa zderzenie z prawdziwym projektem. Cztery kryteria, w kolejności, w jakiej najczęściej dają się we znaki:</p>\n\n<ol>\n<li><strong>Własność.</strong> Kiedy przestaniesz płacić albo narzędzie się zmieni, czy zachowujesz swoją pracę w przenośnej formie, czy też utyka ona w czyjejś chmurze?</li>\n<li><strong>Dostarcza prawdziwy kod.</strong> Czy efekt staje się działającym interfejsem, czy makietą, którą ktoś odbudowuje ręcznie? (Cała ta <a href=\"/blog/vibe-design-vs-vibe-coding/\">przepaść między makietą a wdrożeniem</a>.)</li>\n<li><strong>Swoboda modelu.</strong> Czy możesz przynieść model, za który już płacisz, czy jesteś przywiązany do krzywej cenowej jednego dostawcy?</li>\n<li><strong>Model cenowy.</strong> Subskrypcja za stanowisko, kredyty za użycie czy darmowe i uruchamiane samodzielnie — i jak to skaluje się na cały zespół.</li>\n</ol>\n\n<h2>Najlepsze alternatywy dla Claude Design</h2>\n\n<h3>1. Open Design — wybór open source, natywnie agentowy</h3>\n\n<p><strong>Czym jest.</strong> Pełna jawność: to nasze. Open Design nie jest klonem Claude Design — to cienka warstwa open source, która zamienia agenta kodowego, którego już uruchamiasz, w silnik projektowy. Każda umiejętność to plik <code>SKILL.md</code>, każdy system projektowy to przenośny <code>DESIGN.md</code>.</p>\n\n<p><strong>Kluczowe funkcje</strong></p>\n<ul>\n<li>Apache-2.0, local-first, bez rejestracji — działa na <code>pnpm tools-dev</code></li>\n<li>BYOK: przynieś dowolny model zgodny z OpenAI (Claude, GPT, Gemini, DeepSeek lub własny hostowany)</li>\n<li>Automatycznie wykrywa 16+ CLI agentów kodowych już obecnych w twoim <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen i więcej)</li>\n<li>Dostarcza prawdziwy kod, nie tylko makiety — projekt i kod pozostają w jednej pętli</li>\n<li>Biblioteka umiejętności i przenośnych systemów projektowych od razu po wyjęciu z pudełka</li>\n</ul>\n\n<p><strong>Zalety:</strong> jesteś właścicielem wszystkiego (pliki, które możesz diffować i zachować); brak przywiązania do modelu; brak licznika za stanowisko; działa obok twojego istniejącego agenta.<br>\n<strong>Wady:</strong> to warstwa, którą sam uruchamiasz, a nie hostowany, dopracowany SaaS — wymaga konfiguracji i nie jest kanwą do współpracy wielu osób w czasie rzeczywistym.<br>\n<strong>Cennik:</strong> darmowe i open source; płacisz tylko za model, na który je skierujesz.<br>\n<strong>Najlepsze dla:</strong> zespołów, które nie chcą oddać swojego przepływu pracy, plików ani wyboru modelu zamkniętemu dostawcy.<br>\n<strong>Moje zdanie:</strong> jeśli powodem odejścia od Claude Design było „zamknięte / w chmurze / przywiązane do modelu”, to najbardziej bezpośrednia odpowiedź na liście — z założenia jest przeciwieństwem wszystkich trzech.</p>\n\n<h3>2. Figma (Make i AI)</h3>\n\n<p><strong>Czym jest.</strong> Lider. Funkcje AI w Figmie oraz Figma Make wnoszą generowanie na kanwę, którą zna już każdy zespół projektowy.</p>\n\n<p><strong>Kluczowe funkcje:</strong> kanwa do współpracy wielu osób w czasie rzeczywistym, dojrzałe komponenty/warianty, przekazanie pracy przez Dev Mode, rozbudowany ekosystem wtyczek i generowanie AI doczepione do tego wszystkiego.<br>\n<strong>Zalety:</strong> niezrównana kanwa do współpracy; przepływ pracy, którym twój zespół już mówi; ogromny ekosystem.<br>\n<strong>Wady:</strong> zamknięty, własnościowy format plików, działa w chmurze; cennik za stanowisko; AI jest dodatkiem do narzędzia kanwowego, a nie agentem dostarczającym kod. (Zobacz <a href=\"/blog/figma-alternative-open-design/\">drogę open source od Figmy</a>.)<br>\n<strong>Cennik:</strong> subskrypcja za stanowisko, w progach według roli.<br>\n<strong>Najlepsze dla:</strong> zespołów projektowych, które żyją na wspólnej kanwie i chcą mieć obok niej AI.<br>\n<strong>Moje zdanie:</strong> najbezpieczniejszy wybór, jeśli współpraca liczy się bardziej niż własność — i wybór błędny, jeśli to właśnie własność jest powodem odejścia od Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Czym jest.</strong> Narzędzie Google z promptu do UI i produkt, który wpisał „vibe design” w pasek wyszukiwania każdego z nas.</p>\n\n<p><strong>Kluczowe funkcje:</strong> wysoka jakość przejścia z promptu do UI, Voice Canvas, eksport w stronę Figmy i kodu front-endu, darmowe w Google Labs.<br>\n<strong>Zalety:</strong> naprawdę dobre pierwsze ekrany; darmowe i szybkie; najlepsza bezkosztowa rampa wejścia do projektowania według intencji.<br>\n<strong>Wady:</strong> zamknięta powierzchnia Google — eksport to drzwi w jedną stronę, twój system projektowy nie jest źródłem prawdy, a cennik/dostępność Labs zależą od decyzji Google. (Pełne <a href=\"/blog/vibe-design-with-stitch/\">praktyczne przetestowanie Stitch</a>.)<br>\n<strong>Cennik:</strong> darmowe w Labs (na razie).<br>\n<strong>Najlepsze dla:</strong> eksplorowania i szkicowania kierunków bez kosztów.<br>\n<strong>Moje zdanie:</strong> znakomity szkicownik, a nie miejsce na posiadanie produktu — użyj go do eksploracji, a potem buduj gdzie indziej.</p>\n\n<h3>4. v0 od Vercel</h3>\n\n<p><strong>Czym jest.</strong> Generator zorientowany na kod: opisz UI, dostań React i Tailwind, które możesz przenieść do repozytorium.</p>\n\n<p><strong>Kluczowe funkcje:</strong> prompt do komponentu, wynik w shadcn/Tailwind, ścisłe dopasowanie do stosu Vercel/Next.js, prawdziwy kod od samego początku.<br>\n<strong>Zalety:</strong> brak urwiska makiety — efektem jest kod gotowy do wdrożenia; doskonałe dla inżynierów i inżynierów projektowych.<br>\n<strong>Wady:</strong> narzędzie zamknięte; wynik i przepływ ciążą ku ekosystemowi Vercel; edytujesz kod, a nie projektujesz na kanwie.<br>\n<strong>Cennik:</strong> darmowy plan plus płatne użycie.<br>\n<strong>Najlepsze dla:</strong> deweloperów, którzy chcą, by projekt trafiał do nich jako prawdziwy kod front-endu.<br>\n<strong>Moje zdanie:</strong> najmocniejsza opcja „dostarcza kod” wśród narzędzi zamkniętych — tylko wiedz, że zapisałeś się na życie w kodzie.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Czym jest.</strong> Z promptu do aplikacji: opisz, czego chcesz, a Lovable postawi działającą aplikację webową full-stack.</p>\n\n<p><strong>Kluczowe funkcje:</strong> rusztowanie full-stack z promptu, szybka iteracja, hostowany podgląd, dobre do prototypów end-to-end.<br>\n<strong>Zalety:</strong> dostajesz działający produkt, a nie obrazek; świetne tempo dla pomysłów od zera do jedynki.<br>\n<strong>Wady:</strong> hostowane i zamknięte; aplikacja jest poślubiona swojemu stosowi; „projekt” to to, co wyrenderował framework, więc <a href=\"/blog/vibe-design-vs-vibe-coding/\">dryf</a> jest na twojej głowie.<br>\n<strong>Cennik:</strong> darmowy plan plus płatne pakiety.<br>\n<strong>Najlepsze dla:</strong> założycieli prototypujących cały produkt, a nie tylko jeden ekran.<br>\n<strong>Moje zdanie:</strong> sięgnij po nie, gdy efektem ma być działająca aplikacja; pomiń, gdy potrzebujesz kontroli projektowej nad systemem.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Czym jest.</strong> Działający w przeglądarce kreator aplikacji AI od StackBlitz, który generuje i uruchamia pełne aplikacje webowe na żywo.</p>\n\n<p><strong>Kluczowe funkcje:</strong> środowisko uruchomieniowe w przeglądarce, prompt do aplikacji, natychmiastowy podgląd i wdrożenie, korzenie open source w narzędziach StackBlitz.<br>\n<strong>Zalety:</strong> nic do zainstalowania; aplikacja działa od razu; szybka pętla od pomysłu do klikalności.<br>\n<strong>Wady:</strong> koszty oparte na kredytach się sumują; wynik przywiązany do swojego środowiska; bardziej kreator niż projektant.<br>\n<strong>Cennik:</strong> kredyty za użycie.<br>\n<strong>Najlepsze dla:</strong> szybkich, uruchamialnych prototypów, którymi chcesz się podzielić w tej samej godzinie.<br>\n<strong>Moje zdanie:</strong> najbliżej duchem „vibe coding” — doskonałe do szybkości, mniej do tego, gdy celem jest spójność projektowa.</p>\n\n<blockquote><p>Warto też rzucić okiem na: <strong>Visily</strong> i <strong>Uizard</strong> do szybkich makiet AI (świetne do ideacji, ale zatrzymują się na obrazku) oraz <strong>Framer AI</strong> do generowanych przez AI stron marketingowych. Narzędzia takie jak <strong>Magic Patterns</strong> i <strong>UX Pilot</strong> grają w tej samej przestrzeni prototypowania. Żadne z nich nie zmienia kluczowej decyzji poniżej.</p></blockquote>\n\n<h2>Jak wybrać</h2>\n\n<p>Dopasuj narzędzie do powodu, dla którego odszedłeś od Claude Design:</p>\n\n<ul>\n<li><strong>Odszedłeś, bo jest zamknięte / w chmurze / przywiązane do modelu?</strong> → <strong>Open Design.</strong> To jedyna opcja tutaj, która jest open source, BYOK i twoja.</li>\n<li><strong>Odszedłeś, bo chcesz zespołowej współpracy na kanwie?</strong> → <strong>Figma.</strong></li>\n<li><strong>Odszedłeś, bo chciałeś darmowo i szybko?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Odszedłeś, bo chciałeś prawdziwy kod, teraz?</strong> → <strong>v0</strong> (komponenty) lub <strong>Lovable / Bolt</strong> (całe aplikacje).</li>\n</ul>\n\n<p>Uczciwy meta-wniosek: większość z nich wciąż jest zamknięta, hostowana lub jednomodelowa — wymieniają mury Anthropic na czyjeś inne. Jeśli <em>kategorią</em> problemu, jaki masz z Claude Design, jest zamknięcie w jednym dostawcy (lock-in), to tylko droga open source faktycznie go rozwiązuje, zamiast po prostu przenosić go gdzie indziej.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Jaka jest najlepsza alternatywa dla Claude Design?</strong> To zależy, dlaczego odchodzisz. Dla własności i braku lock-inu — Open Design (open source, BYOK). Dla współpracy — Figma. Do darmowego szkicowania — Google Stitch. Do dostarczania kodu — v0 lub Lovable.</p>\n\n<p><strong>Czy istnieje darmowa, otwartoźródłowa alternatywa dla Claude Design?</strong> Tak — Open Design jest na licencji Apache-2.0, darmowe i hostowane samodzielnie; płacisz tylko za model, który przyniesiesz. Google Stitch jest darmowe, ale zamknięte.</p>\n\n<p><strong>Czy któreś z nich potrafi dostarczyć prawdziwy kod tak jak Claude Design?</strong> Open Design, v0, Lovable i Bolt wszystkie produkują działający kod. Narzędzia do makiet (Visily, Uizard) oraz narzędzia kanwowe zatrzymują się wcześniej.</p>\n\n<p><strong>Czy muszę używać Claude jako modelu?</strong> Przy Claude Design — tak. Przy BYOK w Open Design przynosisz dowolny model zgodny z OpenAI — Claude, GPT, Gemini, DeepSeek lub własny hostowany.</p>\n\n<p><strong>Gdzie znajdę tę otwartoźródłową?</strong> Open Design jest na <a href=\"https://github.com/nexu-io/open-design\">GitHubie</a> i działa lokalnie; zobacz, <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">dlaczego zbudowaliśmy je jako warstwę umiejętności</a>.</p>\n\n<h2>Wniosek na koniec</h2>\n\n<p>Claude Design to dobre narzędzie o określonym kształcie: zamknięte, w chmurze, jednomodelowe, dorzucone do subskrypcji. Najlepszą alternatywą dla ciebie jest ta, która naprawia tę część tego kształtu, z którą nie mogłeś żyć. Jeśli brakuje ci jakiejś funkcji, wiele z nich da radę. Jeśli to lock-in — model, pliki albo środowisko uruchomieniowe — wtedy jedynym prawdziwym lekarstwem jest to otwarte: <a href=\"/\">Open Design</a> to otwartoźródłowy, natywnie agentowy zakład, że kolejna dekada pracy projektowej powinna być twoja na własność, od promptu aż po wdrożony kod.</p>\n\n<p><em>Gotowy spróbować otwartej drogi? <a href=\"/download\">Otwórz aplikację</a> lub <a href=\"/plugins\">przejrzyj bibliotekę umiejętności i systemów projektowych</a>.</em></p>"
  id:
    title: "Alternatif Claude Design Terbaik di 2026"
    summary: "Claude Design memang bagus — tapi ia tertutup, hanya bisa dihosting, terkunci ke satu model, dan dibundel dengan langganan Claude. Jika salah satunya jadi pengganjal buat kamu, inilah alternatif Claude Design terbaik di 2026, dinilai berdasarkan hal yang benar-benar penting: apakah kamu memilikinya, bisakah ia menghasilkan kode sungguhan, dan apakah pilihan model ada di tanganmu?"
    category: "Panduan"
    bodyHtml: "<p>Saya mengelola produk di Open Design, yang artinya saya sudah menghabiskan lebih banyak waktu di dalam alternatif Claude Design daripada yang mungkin sehat — brief yang sama, setiap alat, beberapa kali setahun. Claude Design sendiri bagus; ini bukan upaya menjatuhkannya. Tapi \"bagus\" dan \"tepat untukmu\" bukanlah kalimat yang sama. Ia tertutup secara sumber, hanya bisa dihosting, terkunci ke Claude sebagai modelnya, dan dibundel ke dalam langganan Claude — dan salah satu dari semua itu bisa jadi alasan kamu mencari alternatif.</p>\n\n<p>Jadi inilah rangkuman jujur untuk 2026: alternatif Claude Design terbaik, dinilai berdasarkan tiga hal yang sebenarnya menentukan — <strong>apakah kamu memiliki hasilnya, bisakah ia menghasilkan kode sungguhan, dan apakah pilihan model ada di tanganmu?</strong> Saya akan berterus terang di awal bahwa kami membuat salah satu alat dalam daftar ini; saya menjaga pujian untuk yang lain tetap jujur, karena daftar yang dicurangi adalah daftar yang tak berguna.</p>\n\n<h2>Mengapa mencari alternatif Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) adalah alat desain percakapan: obrolan di kiri, kanvas di kanan, prototipe-ke-kode lewat Claude Code. Ia cepat dan rapi. Alasan tim tetap mencari ke tempat lain bersifat struktural, bukan soal kualitas:</p>\n\n<ul>\n<li><strong>Modelnya tetap.</strong> Setiap render melewati Claude. Jika kamu sudah membayar GPT, Gemini, atau menghosting sendiri untuk pekerjaan sensitif, itu tidak terbawa.</li>\n<li><strong>Hanya bisa dihosting.</strong> Prompt, design system, dan konteks codebase-mu berpindah ke server Anthropic — sebuah percakapan pengadaan untuk pekerjaan agensi atau NDA.</li>\n<li><strong>Ia tertutup.</strong> Kamu tak bisa mem-fork, mengaudit, atau menukar perilaku desainnya.</li>\n<li><strong>Tagihannya berupa langganan terbundel.</strong> Cocok untuk pengguna Pro solo, kikuk untuk satu tim, dan tak masuk akal untuk barisan panjang kontributor.</li>\n</ul>\n\n<p>Jika tak ada satu pun dari itu yang mengganggumu, Claude Design adalah pilihan yang baik. Jika salah satunya baru saja membuatmu mengangguk, teruslah membaca.</p>\n\n<h2>Perbandingan singkat</h2>\n\n<table><thead><tr><th>Alat</th><th>Paling cocok untuk</th><th>Open source</th><th>Menghasilkan kode sungguhan</th><th>Pilihan model</th><th>Bentuk harga</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Memiliki seluruh alurnya</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / apa saja</td><td>Gratis, jalankan sendiri</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Kolaborasi kanvas tim</td><td>❌</td><td>Sebagian (ekspor)</td><td>❌</td><td>Langganan per kursi</td></tr><tr><td><strong>Google Stitch</strong></td><td>Sketsa gratis dan cepat</td><td>❌</td><td>Ekspor ke kode/Figma</td><td>❌</td><td>Gratis (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → kode React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Tier gratis + berbayar</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → aplikasi penuh</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Tier gratis + berbayar</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Membangun aplikasi di browser</td><td>Sebagian (akar OSS)</td><td>✅</td><td>Sebagian</td><td>Berbasis kredit</td></tr></tbody></table>\n\n<h2>Bagaimana saya mengevaluasinya</h2>\n\n<p>Bukan dari jumlah fitur — tapi dari apa yang bertahan saat berhadapan dengan proyek nyata. Empat kriteria, diurutkan berdasarkan seberapa sering ia menggigit:</p>\n\n<ol>\n<li><strong>Kepemilikan.</strong> Ketika kamu berhenti membayar atau alatnya berubah, apakah pekerjaanmu tetap kamu pegang dalam bentuk yang portabel, atau terdampar di cloud orang lain?</li>\n<li><strong>Menghasilkan kode sungguhan.</strong> Apakah keluarannya menjadi antarmuka yang berjalan, atau sebuah mockup yang dibangun ulang seseorang dengan tangan? (Seluruh <a href=\"/blog/vibe-design-vs-vibe-coding/\">jurang mockup-ke-rilis</a>.)</li>\n<li><strong>Kebebasan model.</strong> Bisakah kamu membawa model yang sudah kamu bayar, atau kamu terkunci pada kurva harga satu vendor?</li>\n<li><strong>Bentuk harga.</strong> Langganan per kursi, kredit pemakaian, atau gratis-dan-jalankan-sendiri — dan bagaimana itu menskala ke seluruh tim.</li>\n</ol>\n\n<h2>Alternatif Claude Design terbaik</h2>\n\n<h3>1. Open Design — pilihan open-source dan agent-native</h3>\n\n<p><strong>Apa itu.</strong> Pengakuan penuh: ini milik kami. Open Design bukan klon Claude Design — ia adalah lapisan open-source tipis yang mengubah coding agent yang sudah kamu jalankan menjadi mesin desain. Setiap skill adalah berkas <code>SKILL.md</code>, setiap design system adalah <code>DESIGN.md</code> yang portabel.</p>\n\n<p><strong>Fitur utama</strong></p>\n<ul>\n<li>Apache-2.0, local-first, tanpa pendaftaran — berjalan dengan <code>pnpm tools-dev</code></li>\n<li>BYOK: bawa model apa pun yang kompatibel dengan OpenAI (Claude, GPT, Gemini, DeepSeek, atau yang dihosting sendiri)</li>\n<li>Mendeteksi otomatis 16+ CLI coding-agent yang sudah ada di <code>$PATH</code>-mu (Claude Code, Codex, Cursor, OpenCode, Qwen, dan banyak lagi)</li>\n<li>Menghasilkan kode sungguhan, bukan sekadar mockup — desain dan kode tetap dalam satu alur</li>\n<li>Pustaka skill dan design system portabel yang langsung siap pakai</li>\n</ul>\n\n<p><strong>Kelebihan:</strong> kamu memiliki segalanya (berkas yang bisa kamu diff dan simpan); tanpa keterkuncian model; tanpa meteran per kursi; bekerja berdampingan dengan agent yang sudah kamu pakai.<br>\n<strong>Kekurangan:</strong> ini adalah lapisan yang kamu jalankan, bukan SaaS terhosting yang sudah rapi — ada penyiapannya, dan ia bukan kanvas multipemain real-time.<br>\n<strong>Harga:</strong> gratis dan open-source; kamu hanya membayar untuk model apa pun yang kamu tunjuk.<br>\n<strong>Paling cocok untuk:</strong> tim yang menolak menyerahkan alur kerja, berkas, atau pilihan model mereka ke vendor tertutup.<br>\n<strong>Pendapat saya:</strong> jika alasanmu meninggalkan Claude Design adalah \"tertutup / terhosting / terkunci-model,\" ini adalah jawaban paling langsung di daftar ini — secara rancangan ia adalah kebalikan dari ketiganya.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>Apa itu.</strong> Sang penguasa lama. Fitur AI Figma dan Figma Make membawa generasi ke kanvas yang sudah dikenal setiap tim desain.</p>\n\n<p><strong>Fitur utama:</strong> kanvas multipemain real-time, komponen/variant yang matang, handoff Dev Mode, ekosistem plugin yang dalam, generasi AI yang ditempelkan di atas semuanya.<br>\n<strong>Kelebihan:</strong> kanvas kolaboratif tanpa tanding; alur kerja yang sudah dikuasai timmu; ekosistem raksasa.<br>\n<strong>Kekurangan:</strong> tertutup, format berkas berpemilik, terhosting; harga per kursi; AI-nya adalah pelengkap untuk alat kanvas, bukan agent yang menghasilkan kode. (Lihat <a href=\"/blog/figma-alternative-open-design/\">jalur open-source dari Figma</a>.)<br>\n<strong>Harga:</strong> langganan per kursi, berjenjang menurut peran.<br>\n<strong>Paling cocok untuk:</strong> tim desain yang hidup di kanvas bersama dan ingin AI di sampingnya.<br>\n<strong>Pendapat saya:</strong> pilihan teraman jika kolaborasi lebih penting daripada kepemilikan — dan pilihan yang salah jika kepemilikan adalah alasanmu meninggalkan Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Apa itu.</strong> Alat prompt-ke-UI dari Google, dan produk yang menaruh \"vibe design\" di kolom pencarian semua orang.</p>\n\n<p><strong>Fitur utama:</strong> kualitas prompt-ke-UI yang kuat, Voice Canvas, ekspor menuju Figma dan kode front-end, gratis di Google Labs.<br>\n<strong>Kelebihan:</strong> layar pertama yang benar-benar bagus; gratis dan cepat; jalur masuk tanpa biaya terbaik untuk mendesain berdasarkan intensi.<br>\n<strong>Kekurangan:</strong> permukaan bertembok milik Google — ekspornya adalah pintu satu arah, design system-mu bukan sumber kebenaran, dan harga/ketersediaan Labs adalah keputusan Google. (<a href=\"/blog/vibe-design-with-stitch/\">Praktik langsung dengan Stitch</a> selengkapnya.)<br>\n<strong>Harga:</strong> gratis di Labs (untuk saat ini).<br>\n<strong>Paling cocok untuk:</strong> menjelajah dan membuat sketsa arah tanpa biaya.<br>\n<strong>Pendapat saya:</strong> papan sketsa yang luar biasa, bukan tempat untuk memiliki produk — pakai untuk menjelajah, lalu bangun di tempat lain.</p>\n\n<h3>4. v0 dari Vercel</h3>\n\n<p><strong>Apa itu.</strong> Generator yang mengutamakan kode: jelaskan sebuah UI, dapatkan React dan Tailwind yang bisa kamu angkat ke dalam repo.</p>\n\n<p><strong>Fitur utama:</strong> prompt-ke-komponen, keluaran shadcn/Tailwind, pas erat dengan stack Vercel/Next.js, kode sungguhan sejak awal.<br>\n<strong>Kelebihan:</strong> tanpa jurang mockup — keluarannya adalah kode yang siap dirilis; sangat baik untuk engineer dan design engineer.<br>\n<strong>Kekurangan:</strong> alat tertutup; keluaran dan alurnya condong ke ekosistem Vercel; kamu menyunting kode, bukan mendesain di kanvas.<br>\n<strong>Harga:</strong> tier gratis plus pemakaian berbayar.<br>\n<strong>Paling cocok untuk:</strong> developer yang ingin desain hadir sebagai kode front-end sungguhan.<br>\n<strong>Pendapat saya:</strong> opsi \"menghasilkan kode\" terkuat di antara alat-alat tertutup — cuma ketahuilah kamu sudah mendaftar untuk hidup di dalam kode.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Apa itu.</strong> Prompt-ke-aplikasi: jelaskan apa yang kamu mau dan Lovable memunculkan aplikasi web full-stack yang berfungsi.</p>\n\n<p><strong>Fitur utama:</strong> scaffolding full-stack dari sebuah prompt, iterasi cepat, pratinjau terhosting, bagus untuk prototipe ujung-ke-ujung.<br>\n<strong>Kelebihan:</strong> kamu mendapat produk yang berjalan, bukan sebuah gambar; kecepatan luar biasa untuk ide nol-ke-satu.<br>\n<strong>Kekurangan:</strong> terhosting dan tertutup; aplikasinya menyatu dengan stack-nya; \"desain\" adalah apa pun yang dirender framework, jadi <a href=\"/blog/vibe-design-vs-vibe-coding/\">penyimpangan</a> adalah urusanmu untuk dikelola.<br>\n<strong>Harga:</strong> tier gratis plus paket berbayar.<br>\n<strong>Paling cocok untuk:</strong> founder yang membuat prototipe produk utuh, bukan sekadar satu layar.<br>\n<strong>Pendapat saya:</strong> raih ia ketika yang perlu diserahkan adalah aplikasi yang berfungsi; lewati ketika kamu butuh kendali desain atas sebuah sistem.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Apa itu.</strong> Pembangun aplikasi AI di dalam browser dari StackBlitz yang membuat dan menjalankan aplikasi web penuh secara langsung.</p>\n\n<p><strong>Fitur utama:</strong> runtime berbasis browser, prompt-ke-aplikasi, pratinjau dan deploy instan, akar open-source dalam tooling StackBlitz.<br>\n<strong>Kelebihan:</strong> tak ada yang perlu dipasang; aplikasinya langsung berjalan; alur cepat dari ide ke bisa diklik.<br>\n<strong>Kekurangan:</strong> biaya berbasis kredit menumpuk; keluaran terikat ke lingkungannya; lebih banyak membangun daripada mendesain.<br>\n<strong>Harga:</strong> kredit pemakaian.<br>\n<strong>Paling cocok untuk:</strong> prototipe cepat yang bisa dijalankan dan ingin kamu bagikan di jam yang sama.<br>\n<strong>Pendapat saya:</strong> paling dekat semangatnya dengan \"vibe coding\" — sangat baik untuk kecepatan, kurang begitu ketika koherensi desain adalah tujuannya.</p>\n\n<blockquote><p>Juga layak dilirik: <strong>Visily</strong> dan <strong>Uizard</strong> untuk mockup AI cepat (bagus untuk ideasi, tapi berhenti di gambar), dan <strong>Framer AI</strong> untuk situs marketing hasil AI. Alat seperti <strong>Magic Patterns</strong> dan <strong>UX Pilot</strong> bermain di ruang pembuatan prototipe yang sama. Tak satu pun mengubah keputusan inti di bawah ini.</p></blockquote>\n\n<h2>Cara memilih</h2>\n\n<p>Cocokkan alatnya dengan alasanmu meninggalkan Claude Design:</p>\n\n<ul>\n<li><strong>Pergi karena tertutup / terhosting / terkunci-model?</strong> → <strong>Open Design.</strong> Ia satu-satunya opsi di sini yang open-source, BYOK, dan milikmu.</li>\n<li><strong>Pergi karena ingin kolaborasi kanvas tim?</strong> → <strong>Figma.</strong></li>\n<li><strong>Pergi karena ingin gratis dan cepat?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Pergi karena ingin kode sungguhan, sekarang?</strong> → <strong>v0</strong> (komponen) atau <strong>Lovable / Bolt</strong> (aplikasi utuh).</li>\n</ul>\n\n<p>Poin meta yang jujur: kebanyakan dari ini masih tertutup, terhosting, atau model tunggal — mereka menukar tembok Anthropic dengan tembok orang lain. Jika <em>kategori</em> masalah yang kamu punya dengan Claude Design adalah keterkuncian, hanya jalur open-source yang benar-benar menyelesaikannya alih-alih sekadar memindahkannya.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Apa alternatif Claude Design terbaik?</strong> Tergantung mengapa kamu pergi. Untuk kepemilikan dan tanpa keterkuncian, Open Design (open-source, BYOK). Untuk kolaborasi, Figma. Untuk sketsa gratis, Google Stitch. Untuk menghasilkan kode, v0 atau Lovable.</p>\n\n<p><strong>Adakah alternatif Claude Design yang gratis dan open-source?</strong> Ada — Open Design berlisensi Apache-2.0, gratis, dan dihosting sendiri; kamu hanya membayar untuk model apa pun yang kamu bawa. Google Stitch gratis tapi tertutup.</p>\n\n<p><strong>Bisakah salah satu dari ini menghasilkan kode sungguhan seperti Claude Design?</strong> Open Design, v0, Lovable, dan Bolt semuanya menghasilkan kode yang berjalan. Alat mockup (Visily, Uizard) dan alat kanvas berhenti lebih awal.</p>\n\n<p><strong>Apakah saya harus memakai Claude sebagai modelnya?</strong> Dengan Claude Design, ya. Dengan BYOK milik Open Design, kamu membawa model apa pun yang kompatibel dengan OpenAI — Claude, GPT, Gemini, DeepSeek, atau yang dihosting sendiri.</p>\n\n<p><strong>Di mana saya menemukan yang open-source?</strong> Open Design ada di <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> dan berjalan secara lokal; lihat <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">mengapa kami membangunnya sebagai lapisan skill</a>.</p>\n\n<h2>Kesimpulannya</h2>\n\n<p>Claude Design adalah alat yang baik dengan bentuk yang spesifik: tertutup, terhosting, model tunggal, terbundel langganan. Alternatif terbaik untukmu adalah yang mana pun yang memperbaiki bagian dari bentuk itu yang tak bisa kamu tahan. Jika itu fitur yang kamu rindukan, banyak dari ini yang akan memenuhinya. Jika itu keterkuncian — model, berkas, atau runtime — maka satu-satunya perbaikan sungguhan adalah yang terbuka: <a href=\"/\">Open Design</a> adalah taruhan open-source dan agent-native bahwa pekerjaan desain dekade berikutnya seharusnya menjadi milikmu untuk kamu pegang, dari prompt sampai ke kode yang dirilis.</p>\n\n<p><em>Siap mencoba jalur terbuka? <a href=\"/download\">Buka aplikasinya</a> atau <a href=\"/plugins\">jelajahi pustaka skill dan design system</a>.</em></p>"
  nl:
    title: "De beste Claude Design-alternatieven in 2026"
    summary: "Claude Design is oprecht goed — maar het is closed, gehost, vastgezet op één model en gebundeld met een Claude-abonnement. Als een van die punten een dealbreaker is, dan vind je hier de beste Claude Design-alternatieven in 2026, beoordeeld op wat er echt toe doet: bezit je het, kan het echte code opleveren, en is het model jouw keuze?"
    category: "Gidsen"
    bodyHtml: "<p>Ik leid het productteam bij Open Design, wat betekent dat ik meer tijd binnen Claude Design-alternatieven heb doorgebracht dan waarschijnlijk gezond is — dezelfde briefing, elk tool, een paar keer per jaar. Claude Design zelf is goed; dit is geen afrekening. Maar \"goed\" en \"geschikt voor jou\" zijn niet dezelfde zin. Het is closed-source, alleen gehost, vastgezet op Claude als model en gebundeld in een Claude-abonnement — en elk van die punten kan de reden zijn waarom je naar een alternatief zoekt.</p>\n\n<p>Dus dit is het eerlijke overzicht voor 2026: de beste Claude Design-alternatieven, beoordeeld op de drie dingen die het écht bepalen — <strong>bezit je de output, kan het echte code opleveren en is het model jouw keuze?</strong> Ik zeg het meteen: we bouwen zelf een van de tools op deze lijst; ik heb de lof voor de anderen oprecht gehouden, want een gemanipuleerde lijst is een nutteloze lijst.</p>\n\n<h2>Waarom op zoek naar een Claude Design-alternatief</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) is een conversationeel ontwerptool: chat aan de linkerkant, canvas aan de rechterkant, prototype-naar-code via Claude Code. Het is snel en gepolijst. De redenen waarom teams toch elders kijken zijn structureel, niet kwalitatief:</p>\n\n<ul>\n<li><strong>Het model staat vast.</strong> Elke render loopt via Claude. Als je al betaalt voor GPT, Gemini, of zelf host voor gevoelig werk, dan vertaalt dat zich niet.</li>\n<li><strong>Het is alleen gehost.</strong> Je prompts, designsysteem en codebase-context reizen naar de servers van Anthropic — een gesprek met inkoop voor bureau- of NDA-werk.</li>\n<li><strong>Het is closed.</strong> Je kunt het ontwerpgedrag niet forken, auditen of vervangen.</li>\n<li><strong>De rekening is een gebundeld abonnement.</strong> Prima voor een solo Pro-gebruiker, ongemakkelijk voor een team, een no-go voor een lange staart aan bijdragers.</li>\n</ul>\n\n<p>Als geen van die punten je dwarszit, is Claude Design een prima keuze. Als je bij een ervan net knikte, lees dan verder.</p>\n\n<h2>Snelle vergelijking</h2>\n\n<table>\n<thead>\n<tr><th>Tool</th><th>Beste voor</th><th>Open source</th><th>Levert echte code</th><th>Modelkeuze</th><th>Prijsvorm</th></tr>\n</thead>\n<tbody>\n<tr><td><strong>Open Design</strong></td><td>De hele loop in eigen beheer</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / elk model</td><td>Gratis, zelf draaien</td></tr>\n<tr><td><strong>Figma (Make / AI)</strong></td><td>Samenwerking op teamcanvas</td><td>❌</td><td>Gedeeltelijk (export)</td><td>❌</td><td>Abonnement per zitplaats</td></tr>\n<tr><td><strong>Google Stitch</strong></td><td>Gratis, snel schetsen</td><td>❌</td><td>Export naar code/Figma</td><td>❌</td><td>Gratis (Labs)</td></tr>\n<tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → React-code</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Gratis niveau + betaald</td></tr>\n<tr><td><strong>Lovable</strong></td><td>Prompt → volledige app</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Gratis niveau + betaald</td></tr>\n<tr><td><strong>Bolt (bolt.new)</strong></td><td>App-builds in de browser</td><td>Gedeeltelijk (OSS-wortels)</td><td>✅</td><td>Gedeeltelijk</td><td>Op basis van credits</td></tr>\n</tbody>\n</table>\n\n<h2>Hoe ik deze heb beoordeeld</h2>\n\n<p>Niet op het aantal functies — op wat overeind blijft bij contact met een echt project. Vier criteria, op volgorde van hoe vaak ze pijn doen:</p>\n\n<ol>\n<li><strong>Eigendom.</strong> Wanneer je stopt met betalen of de tool verandert, behoud je dan je werk in een overdraagbare vorm, of zit het vast in iemands cloud?</li>\n<li><strong>Levert echte code.</strong> Wordt de output een draaiende interface, of een mockup die iemand met de hand opnieuw bouwt? (De hele <a href=\"/blog/vibe-design-vs-vibe-coding/\">kloof tussen mockup en opgeleverd</a>.)</li>\n<li><strong>Modelvrijheid.</strong> Kun je het model meenemen waar je al voor betaalt, of zit je vast aan de prijscurve van één leverancier?</li>\n<li><strong>Prijsvorm.</strong> Abonnement per zitplaats, verbruikscredits, of gratis-en-zelf-draaien — en hoe dat schaalt naar een heel team.</li>\n</ol>\n\n<h2>De beste Claude Design-alternatieven</h2>\n\n<h3>1. Open Design — de open-source, agent-native keuze</h3>\n\n<p><strong>Wat het is.</strong> Volledige openheid: deze is van ons. Open Design is geen Claude Design-kloon — het is een dunne open-source laag die de coding agent die je al draait verandert in een ontwerpmotor. Elke skill is een <code>SKILL.md</code>-bestand, elk designsysteem een overdraagbaar <code>DESIGN.md</code>.</p>\n\n<p><strong>Belangrijkste functies</strong></p>\n<ul>\n<li>Apache-2.0, local-first, geen aanmelding — draait op <code>pnpm tools-dev</code></li>\n<li>BYOK: breng elk OpenAI-compatibel model mee (Claude, GPT, Gemini, DeepSeek, of zelf gehost)</li>\n<li>Detecteert automatisch 16+ coding-agent-CLI's die al op je <code>$PATH</code> staan (Claude Code, Codex, Cursor, OpenCode, Qwen, en meer)</li>\n<li>Levert echte code, niet alleen mockups — ontwerp en code blijven in één loop</li>\n<li>Een bibliotheek met skills en overdraagbare designsystemen out of the box</li>\n</ul>\n\n<p><strong>Pluspunten:</strong> je bezit alles (bestanden die je kunt diffen en behouden); geen model-lock-in; geen meter per zitplaats; werkt naast je bestaande agent.<br>\n<strong>Minpunten:</strong> het is een laag die je zelf draait, geen gehoste gepolijste SaaS — er is wat opzet nodig, en het is geen realtime multiplayer-canvas.<br>\n<strong>Prijs:</strong> gratis en open-source; je betaalt alleen voor het model waar je het op richt.<br>\n<strong>Beste voor:</strong> teams die weigeren hun workflow, bestanden of modelkeuze uit handen te geven aan een closed leverancier.<br>\n<strong>Mijn mening:</strong> als de reden waarom je Claude Design verliet \"closed / gehost / model-vastgezet\" was, dan is dit het meest directe antwoord op de lijst — het is door zijn opzet het tegenovergestelde van alle drie.</p>\n\n<h3>2. Figma (Make & AI)</h3>\n\n<p><strong>Wat het is.</strong> De gevestigde naam. De AI-functies van Figma en Figma Make brengen generatie naar het canvas dat elk ontwerpteam al kent.</p>\n\n<p><strong>Belangrijkste functies:</strong> realtime multiplayer-canvas, volwassen componenten/varianten, Dev Mode-overdracht, een diep plugin-ecosysteem, AI-generatie bovenop dat alles geplakt.<br>\n<strong>Pluspunten:</strong> ongeëvenaard samenwerkingscanvas; de workflow die je team al spreekt; enorm ecosysteem.<br>\n<strong>Minpunten:</strong> closed, propriëtair bestandsformaat, gehost; prijs per zitplaats; de AI is een toevoeging aan een canvastool, geen agent die code oplevert. (Zie <a href=\"/blog/figma-alternative-open-design/\">het open-source pad vanaf Figma</a>.)<br>\n<strong>Prijs:</strong> abonnement per zitplaats, getrapt naar rol.<br>\n<strong>Beste voor:</strong> ontwerpteams die op een gedeeld canvas leven en daar AI naast willen.<br>\n<strong>Mijn mening:</strong> de veiligste keuze als samenwerking belangrijker is dan eigendom — en de verkeerde als eigendom de reden was waarom je Claude Design verliet.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Wat het is.</strong> Google's prompt-naar-UI-tool, en het product dat \"vibe design\" in ieders zoekbalk zette.</p>\n\n<p><strong>Belangrijkste functies:</strong> sterke prompt-naar-UI-kwaliteit, Voice Canvas, export richting Figma en front-end-code, gratis in Google Labs.<br>\n<strong>Pluspunten:</strong> oprecht goede eerste schermen; gratis en snel; de beste kosteloze opstap naar ontwerpen op intentie.<br>\n<strong>Minpunten:</strong> Google's ommuurde oppervlak — de export is een eenrichtingsdeur, je designsysteem is niet de bron van waarheid, en de prijs/beschikbaarheid van Labs is Google's beslissing. (Volledige <a href=\"/blog/vibe-design-with-stitch/\">hands-on met Stitch</a>.)<br>\n<strong>Prijs:</strong> gratis in Labs (voorlopig).<br>\n<strong>Beste voor:</strong> richtingen verkennen en schetsen tegen nul kosten.<br>\n<strong>Mijn mening:</strong> een uitstekend schetsblok, geen plek om een product te bezitten — gebruik het om te verkennen, en bouw daarna ergens anders.</p>\n\n<h3>4. v0 van Vercel</h3>\n\n<p><strong>Wat het is.</strong> Een code-first generator: beschrijf een UI, krijg React en Tailwind die je in een repo kunt tillen.</p>\n\n<p><strong>Belangrijkste functies:</strong> prompt-naar-component, shadcn/Tailwind-output, nauwe aansluiting op de Vercel/Next.js-stack, echte code vanaf het begin.<br>\n<strong>Pluspunten:</strong> geen mockup-afgrond — de output is verzendbare code; uitstekend voor engineers en design engineers.<br>\n<strong>Minpunten:</strong> closed tool; output en flow leunen richting het Vercel-ecosysteem; je bewerkt code, je ontwerpt niet op een canvas.<br>\n<strong>Prijs:</strong> gratis niveau plus betaald verbruik.<br>\n<strong>Beste voor:</strong> ontwikkelaars die willen dat ontwerp aankomt als echte front-end-code.<br>\n<strong>Mijn mening:</strong> de sterkste \"levert code\"-optie onder de closed tools — weet alleen dat je je hebt aangemeld om in code te leven.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Wat het is.</strong> Prompt-naar-app: beschrijf wat je wilt en Lovable tovert een werkende full-stack webapp tevoorschijn.</p>\n\n<p><strong>Belangrijkste functies:</strong> full-stack scaffolding vanuit een prompt, snelle iteratie, gehoste preview, goed voor end-to-end prototypes.<br>\n<strong>Pluspunten:</strong> je krijgt een draaiend product, geen plaatje; geweldige snelheid voor nul-naar-één-ideeën.<br>\n<strong>Minpunten:</strong> gehost en closed; de app is getrouwd met zijn stack; \"ontwerp\" is wat het framework rendert, dus <a href=\"/blog/vibe-design-vs-vibe-coding/\">drift</a> is aan jou om te beheren.<br>\n<strong>Prijs:</strong> gratis niveau plus betaalde abonnementen.<br>\n<strong>Beste voor:</strong> founders die een heel product prototypen, niet alleen een scherm.<br>\n<strong>Mijn mening:</strong> grijp ernaar wanneer het op te leveren resultaat een werkende app is; sla het over wanneer je ontwerpcontrole over een systeem nodig hebt.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Wat het is.</strong> Een in-browser AI-app-builder van StackBlitz die volledige webapps live genereert en draait.</p>\n\n<p><strong>Belangrijkste functies:</strong> browser-gebaseerde runtime, prompt-naar-app, directe preview en deploy, open-source wortels in de StackBlitz-tooling.<br>\n<strong>Pluspunten:</strong> niets te installeren; de app draait meteen; snelle loop van idee naar klikbaar.<br>\n<strong>Minpunten:</strong> op credits gebaseerde kosten lopen op; output gebonden aan zijn omgeving; meer builder dan designer.<br>\n<strong>Prijs:</strong> verbruikscredits.<br>\n<strong>Beste voor:</strong> snelle, draaiende prototypes die je hetzelfde uur wilt delen.<br>\n<strong>Mijn mening:</strong> qua geest het dichtst bij \"vibe coding\" — uitstekend voor snelheid, minder wanneer ontwerpsamenhang het doel is.</p>\n\n<blockquote><p>Ook een blik waard: <strong>Visily</strong> en <strong>Uizard</strong> voor snelle AI-mockups (geweldig voor ideevorming, maar ze stoppen bij het plaatje), en <strong>Framer AI</strong> voor door AI gegenereerde marketingsites. Tools als <strong>Magic Patterns</strong> en <strong>UX Pilot</strong> spelen in dezelfde prototyping-ruimte. Geen van hen verandert de kernbeslissing hieronder.</p></blockquote>\n\n<h2>Hoe te kiezen</h2>\n\n<p>Match het tool aan de reden waarom je Claude Design verliet:</p>\n\n<ul>\n<li><strong>Vertrokken omdat het closed / gehost / model-vastgezet is?</strong> → <strong>Open Design.</strong> Het is hier de enige optie die open-source, BYOK en van jou is.</li>\n<li><strong>Vertrokken omdat je samenwerking op een teamcanvas wilt?</strong> → <strong>Figma.</strong></li>\n<li><strong>Vertrokken omdat je gratis en snel wilde?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Vertrokken omdat je echte code wilde, nu?</strong> → <strong>v0</strong> (componenten) of <strong>Lovable / Bolt</strong> (hele apps).</li>\n</ul>\n\n<p>Het eerlijke metapunt: de meeste hiervan zijn nog steeds closed, gehost of single-model — ze ruilen de muren van Anthropic in voor die van iemand anders. Als de <em>categorie</em> probleem die je met Claude Design hebt lock-in is, lost alleen het open-source pad het echt op in plaats van het te verhuizen.</p>\n\n<h2>FAQ</h2>\n\n<p><strong>Wat is het beste Claude Design-alternatief?</strong> Het hangt ervan af waarom je vertrekt. Voor eigendom en geen lock-in: Open Design (open-source, BYOK). Voor samenwerking: Figma. Voor gratis schetsen: Google Stitch. Voor het opleveren van code: v0 of Lovable.</p>\n\n<p><strong>Is er een gratis, open-source Claude Design-alternatief?</strong> Ja — Open Design is Apache-2.0, gratis en zelf gehost; je betaalt alleen voor het model dat je meeneemt. Google Stitch is gratis maar closed.</p>\n\n<p><strong>Kan een van deze code opleveren zoals Claude Design?</strong> Open Design, v0, Lovable en Bolt produceren allemaal draaiende code. Mockup-tools (Visily, Uizard) en de canvastools stoppen eerder.</p>\n\n<p><strong>Moet ik Claude als model gebruiken?</strong> Bij Claude Design, ja. Bij de BYOK van Open Design breng je elk OpenAI-compatibel model mee — Claude, GPT, Gemini, DeepSeek, of zelf gehost.</p>\n\n<p><strong>Waar vind ik de open-source variant?</strong> Open Design staat op <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> en draait lokaal; zie <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">waarom we het bouwden als een skill-laag</a>.</p>\n\n<h2>De conclusie</h2>\n\n<p>Claude Design is een goed tool met een specifieke vorm: closed, gehost, single-model, abonnement-gebundeld. Het beste alternatief voor jou is degene die het deel van die vorm repareert waar je niet mee kon leven. Als het een functie is die je mist, voldoen veel van deze prima. Als het lock-in is — model, bestanden of runtime — dan is de enige echte oplossing de open variant: <a href=\"/\">Open Design</a> is de open-source, agent-native gok dat het volgende decennium aan ontwerpwerk van jou hoort te zijn, van prompt helemaal tot opgeleverde code.</p>\n\n<p><em>Klaar om het open pad te proberen? <a href=\"/download\">Open de app</a> of <a href=\"/plugins\">verken de skills- en designsysteembibliotheek</a>.</em></p>"
  ar:
    title: "أفضل بدائل Claude Design في 2026"
    summary: "Claude Design أداة جيدة فعلاً — لكنها مغلقة المصدر، ومستضافة فقط، ومقيّدة بنموذج واحد، ومدمجة ضمن اشتراك Claude. إذا كان أيٌّ من هذه نقطة حسم بالنسبة لك، فهذه أفضل بدائل Claude Design في 2026، مُقيَّمة وفق ما يهم فعلاً: هل تملكها فعلاً، وهل تستطيع إنتاج كود حقيقي قابل للنشر، وهل اختيار النموذج بيدك؟"
    category: "أدلة"
    bodyHtml: "<p>أقود فريق المنتج في Open Design، ما يعني أنني أمضيتُ داخل بدائل Claude Design وقتاً يفوق ما هو صحّي على الأرجح — نفس المهمة، وكل أداة، عدة مرات في السنة. Claude Design نفسها جيدة؛ وهذا المقال ليس هجوماً عليها. لكن \"جيدة\" و\"المناسبة لك\" ليستا الجملة ذاتها. فهي مغلقة المصدر، ومستضافة فقط، ومقيّدة بـ Claude كنموذج، ومدمجة ضمن اشتراك Claude — وأيٌّ من هذه قد يكون السبب الذي يدفعك للبحث عن بديل.</p>\n\n<p>إذاً، هذه هي الجولة الصادقة لعام 2026: أفضل بدائل Claude Design، مُقيَّمة وفق الأمور الثلاثة التي تحسم المسألة فعلاً — <strong>هل تملك المُخرَجات، وهل تستطيع إنتاج كود حقيقي قابل للنشر، وهل اختيار النموذج بيدك؟</strong> أقولها بصراحة منذ البداية: نحن نصنع إحدى الأدوات في هذه القائمة؛ وقد حرصتُ على أن يكون الثناء على البقية حقيقياً، لأن القائمة المُلفَّقة قائمة عديمة الفائدة.</p>\n\n<h2>لماذا تبحث عن بديل لـ Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs، 2026) أداة تصميم حوارية: محادثة على اليسار، ولوحة على اليمين، ومسار من النموذج الأولي إلى الكود عبر Claude Code. إنها سريعة ومصقولة. الأسباب التي تجعل الفِرق تبحث في مكان آخر بنيوية، لا متعلقة بالجودة:</p>\n\n<ul>\n<li><strong>النموذج ثابت.</strong> كل عملية توليد تمر عبر Claude. إذا كنت تدفع أصلاً مقابل GPT أو Gemini، أو تستضيف نموذجك ذاتياً للأعمال الحساسة، فهذا لا ينطبق هنا.</li>\n<li><strong>مستضافة فقط.</strong> مطالباتك ونظام التصميم وسياق قاعدة الكود لديك تنتقل إلى خوادم Anthropic — وهذا حديثٌ خاص بقسم المشتريات في أعمال الوكالات أو الأعمال الخاضعة لاتفاقيات السرية.</li>\n<li><strong>مغلقة.</strong> لا يمكنك إنشاء نسخة معدّلة (fork)، ولا تدقيقها، ولا استبدال سلوك التصميم فيها.</li>\n<li><strong>الفاتورة اشتراك مدمج.</strong> مقبولة لمستخدم Pro فردي، ومحرجة لفريق، ومستحيلة لطيف طويل من المساهمين.</li>\n</ul>\n\n<p>إن لم يزعجك أيٌّ من هذه، فإن Claude Design خيار جيد. أما إذا جعلك أحدها تومئ موافقاً للتو، فتابع القراءة.</p>\n\n<h2>مقارنة سريعة</h2>\n\n<table><thead><tr><th>الأداة</th><th>الأنسب لـ</th><th>مفتوحة المصدر</th><th>إنتاج كود حقيقي</th><th>اختيار النموذج</th><th>نموذج التسعير</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>امتلاك الحلقة كاملةً</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / أي نموذج</td><td>مجاني، تشغيل ذاتي</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>التعاون على لوحة الفريق</td><td>❌</td><td>جزئياً (تصدير)</td><td>❌</td><td>اشتراك لكل مقعد</td></tr><tr><td><strong>Google Stitch</strong></td><td>رسم تخطيطي مجاني وسريع</td><td>❌</td><td>تصدير إلى كود/Figma</td><td>❌</td><td>مجاني (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>مطالبة ← كود React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>طبقة مجانية + مدفوعة</td></tr><tr><td><strong>Lovable</strong></td><td>مطالبة ← تطبيق كامل</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>طبقة مجانية + مدفوعة</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>بناء تطبيقات داخل المتصفح</td><td>جزئياً (جذور مفتوحة المصدر)</td><td>✅</td><td>جزئياً</td><td>قائم على الأرصدة</td></tr></tbody></table>\n\n<h2>كيف قيّمتُ هذه الأدوات</h2>\n\n<p>ليس بعدد الميزات — بل بما يصمد عند الاحتكاك بمشروع حقيقي. أربعة معايير، مرتّبة بحسب كثرة لسعها لك:</p>\n\n<ol>\n<li><strong>الملكية.</strong> عندما تتوقف عن الدفع أو تتغير الأداة، هل تحتفظ بعملك في صيغة قابلة للنقل، أم يبقى عالقاً في سحابة أحدهم؟</li>\n<li><strong>الإنتاج إلى كود حقيقي.</strong> هل تتحول المُخرَجات إلى واجهة تعمل فعلاً، أم إلى نموذج محاكاة يعيد أحدهم بناءه يدوياً؟ (انظر <a href=\"/blog/vibe-design-vs-vibe-coding/\">الفجوة بين النموذج المحاكى والمنتج المنشور</a> بأكملها.)</li>\n<li><strong>حرية النموذج.</strong> هل يمكنك إحضار النموذج الذي تدفع مقابله أصلاً، أم أنك مقيّد بمنحنى تسعير مزوّد واحد؟</li>\n<li><strong>نموذج التسعير.</strong> اشتراك لكل مقعد، أم أرصدة استخدام، أم مجاني وتشغيل ذاتي — وكيف يتوسّع ذلك ليشمل فريقاً كاملاً.</li>\n</ol>\n\n<h2>أفضل بدائل Claude Design</h2>\n\n<h3>1. Open Design — الخيار المفتوح المصدر، المُصمَّم أصلاً للوكلاء</h3>\n\n<p><strong>ما هي.</strong> إفصاح كامل: هذه أداتنا. Open Design ليست نسخة مقلّدة من Claude Design — بل طبقة رقيقة مفتوحة المصدر تحوّل وكيل البرمجة الذي تشغّله أصلاً إلى محرّك تصميم. كل مهارة هي ملف <code>SKILL.md</code>، وكل نظام تصميم ملف <code>DESIGN.md</code> قابل للنقل.</p>\n\n<p><strong>أبرز الميزات</strong></p>\n<ul>\n<li>Apache-2.0، يعمل محلياً أولاً، دون تسجيل — يشتغل عبر <code>pnpm tools-dev</code></li>\n<li>BYOK: أحضر أي نموذج متوافق مع OpenAI (Claude أو GPT أو Gemini أو DeepSeek أو مستضاف ذاتياً)</li>\n<li>يكتشف تلقائياً أكثر من 16 من واجهات سطر أوامر وكلاء البرمجة الموجودة أصلاً في <code>$PATH</code> لديك (Claude Code وCodex وCursor وOpenCode وQwen وغيرها)</li>\n<li>ينتج كوداً حقيقياً، لا مجرّد نماذج محاكاة — يبقى التصميم والكود في حلقة واحدة</li>\n<li>مكتبة من المهارات وأنظمة التصميم القابلة للنقل جاهزة منذ اللحظة الأولى</li>\n</ul>\n\n<p><strong>الإيجابيات:</strong> تملك كل شيء (ملفات يمكنك مقارنة فروقها والاحتفاظ بها)؛ لا تقييد بنموذج؛ لا عدّاد لكل مقعد؛ تعمل جنباً إلى جنب مع وكيلك الحالي.<br><strong>السلبيات:</strong> إنها طبقة تشغّلها أنت، لا خدمة SaaS مستضافة ومصقولة — هناك إعداد، وليست لوحة تعاون لحظي متعدد المستخدمين.<br><strong>التسعير:</strong> مجانية ومفتوحة المصدر؛ تدفع فقط مقابل أي نموذج توجّهها إليه.<br><strong>الأنسب لـ:</strong> الفِرق التي ترفض تسليم سير عملها أو ملفاتها أو اختيار نموذجها إلى مزوّد مغلق.<br><strong>رأيي:</strong> إن كان سبب مغادرتك لـ Claude Design هو \"مغلقة / مستضافة / مقيّدة بنموذج\"، فهذا أكثر إجابة مباشرة في القائمة — إنها نقيض الثلاثة بحكم التصميم.</p>\n\n<h3>2. Figma (Make و AI)</h3>\n\n<p><strong>ما هي.</strong> صاحبة الصدارة. ميزات الذكاء الاصطناعي في Figma و Figma Make تجلب التوليد إلى اللوحة التي يعرفها كل فريق تصميم أصلاً.</p>\n\n<p><strong>أبرز الميزات:</strong> لوحة تعاون لحظي متعددة المستخدمين، ومكوّنات/متغيّرات ناضجة، وتسليم عبر Dev Mode، ومنظومة إضافات عميقة، وتوليد بالذكاء الاصطناعي مُثبَّت فوق كل ذلك.<br><strong>الإيجابيات:</strong> لوحة تعاون لا تُضاهى؛ سير العمل الذي يتقنه فريقك أصلاً؛ منظومة ضخمة.<br><strong>السلبيات:</strong> مغلقة، بصيغة ملفات احتكارية، ومستضافة؛ تسعير لكل مقعد؛ والذكاء الاصطناعي إضافة فوق أداة لوحة، لا وكيل ينتج كوداً. (انظر <a href=\"/blog/figma-alternative-open-design/\">المسار المفتوح المصدر انطلاقاً من Figma</a>.)<br><strong>التسعير:</strong> اشتراك لكل مقعد، متدرّج بحسب الدور.<br><strong>الأنسب لـ:</strong> فِرق التصميم التي تعيش على لوحة مشتركة وتريد ذكاءً اصطناعياً إلى جانبها.<br><strong>رأيي:</strong> الخيار الأكثر أماناً إن كان التعاون يهمّك أكثر من الملكية — والخيار الخاطئ إن كانت الملكية هي سبب مغادرتك لـ Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>ما هي.</strong> أداة Google لتحويل المطالبة إلى واجهة، والمنتج الذي وضع \"vibe design\" في شريط بحث الجميع.</p>\n\n<p><strong>أبرز الميزات:</strong> جودة عالية في تحويل المطالبة إلى واجهة، وVoice Canvas، وتصدير نحو Figma وكود الواجهة الأمامية، ومجاني ضمن Google Labs.<br><strong>الإيجابيات:</strong> شاشات أولى جيدة فعلاً؛ مجاني وسريع؛ أفضل مدخل بلا تكلفة للتصميم وفق القصد.<br><strong>السلبيات:</strong> سطح Google المُسوَّر — التصدير باب باتجاه واحد، ونظام تصميمك ليس مصدر الحقيقة، وتسعير Labs وتوافره قرارٌ بيد Google. (انظر <a href=\"/blog/vibe-design-with-stitch/\">التجربة العملية الكاملة مع Stitch</a>.)<br><strong>التسعير:</strong> مجاني في Labs (حالياً).<br><strong>الأنسب لـ:</strong> استكشاف اتجاهات ورسمها التخطيطي بتكلفة صفرية.<br><strong>رأيي:</strong> لوحة رسم رائعة، لا مكان لامتلاك منتج — استخدمها للاستكشاف، ثم ابنِ في مكان آخر.</p>\n\n<h3>4. v0 من Vercel</h3>\n\n<p><strong>ما هي.</strong> مولّد يضع الكود أولاً: صِف واجهة، واحصل على React وTailwind يمكنك نقله مباشرةً إلى مستودع.</p>\n\n<p><strong>أبرز الميزات:</strong> مطالبة ← مكوّن، مُخرَجات shadcn/Tailwind، تناغم محكم مع حزمة Vercel/Next.js، كود حقيقي منذ البداية.<br><strong>الإيجابيات:</strong> لا هاوية بين النموذج المحاكى والمنتج — المُخرَجات كود قابل للنشر؛ ممتاز للمهندسين ومهندسي التصميم.<br><strong>السلبيات:</strong> أداة مغلقة؛ المُخرَجات والمسار يميلان نحو منظومة Vercel؛ أنت تحرّر كوداً، لا تصمّم على لوحة.<br><strong>التسعير:</strong> طبقة مجانية بالإضافة إلى استخدام مدفوع.<br><strong>الأنسب لـ:</strong> المطوّرون الذين يريدون أن يصل التصميم بصيغة كود واجهة أمامية حقيقي.<br><strong>رأيي:</strong> أقوى خيار \"ينتج كوداً\" بين الأدوات المغلقة — لكن اعلم فقط أنك التزمتَ بأن تعيش داخل الكود.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>ما هي.</strong> مطالبة ← تطبيق: صِف ما تريد، وتُنشئ Lovable تطبيق ويب full-stack يعمل فعلاً.</p>\n\n<p><strong>أبرز الميزات:</strong> بناء هيكلي full-stack انطلاقاً من مطالبة، وتكرار سريع، ومعاينة مستضافة، ومناسب للنماذج الأولية من الطرف إلى الطرف.<br><strong>الإيجابيات:</strong> تحصل على منتج يعمل، لا مجرّد صورة؛ سرعة رائعة لأفكار الانطلاق من الصفر إلى واحد.<br><strong>السلبيات:</strong> مستضافة ومغلقة؛ التطبيق مرتبط بحزمته؛ و\"التصميم\" هو أيّاً كان ما عرضه إطار العمل، لذا فإن <a href=\"/blog/vibe-design-vs-vibe-coding/\">الانحراف</a> مسؤوليتك أنت في إدارته.<br><strong>التسعير:</strong> طبقة مجانية بالإضافة إلى خطط مدفوعة.<br><strong>الأنسب لـ:</strong> المؤسسون الذين ينشئون نموذجاً أولياً لمنتج كامل، لا مجرّد شاشة.<br><strong>رأيي:</strong> امتدّ إليها حين يكون المُسلَّم تطبيقاً يعمل؛ وتجاوزها حين تحتاج إلى تحكّم تصميمي على مستوى نظام.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>ما هي.</strong> منشئ تطبيقات بالذكاء الاصطناعي داخل المتصفح من StackBlitz، يولّد تطبيقات ويب كاملة ويشغّلها حيّةً.</p>\n\n<p><strong>أبرز الميزات:</strong> بيئة تشغيل قائمة على المتصفح، ومطالبة ← تطبيق، ومعاينة ونشر فوريان، وجذور مفتوحة المصدر في أدوات StackBlitz.<br><strong>الإيجابيات:</strong> لا شيء لتثبيته؛ التطبيق يعمل فوراً؛ حلقة سريعة من الفكرة إلى ما يمكن النقر عليه.<br><strong>السلبيات:</strong> التكاليف القائمة على الأرصدة تتراكم؛ المُخرَجات مرتبطة ببيئتها؛ هي منشئ أكثر منها مصمّمة.<br><strong>التسعير:</strong> أرصدة استخدام.<br><strong>الأنسب لـ:</strong> نماذج أولية سريعة وقابلة للتشغيل تريد مشاركتها في الساعة نفسها.<br><strong>رأيي:</strong> الأقرب روحاً إلى \"vibe coding\" — ممتازة للسرعة، وأقل في ذلك حين يكون التماسك التصميمي هو الهدف.</p>\n\n<blockquote><p>يستحق النظر أيضاً: <strong>Visily</strong> و<strong>Uizard</strong> للنماذج المحاكاة السريعة بالذكاء الاصطناعي (رائعة لتوليد الأفكار، لكنها تتوقف عند الصورة)، و<strong>Framer AI</strong> لمواقع التسويق المولَّدة بالذكاء الاصطناعي. وأدوات مثل <strong>Magic Patterns</strong> و<strong>UX Pilot</strong> تلعب في مساحة النماذج الأولية ذاتها. ولا شيء منها يغيّر القرار الجوهري أدناه.</p></blockquote>\n\n<h2>كيف تختار</h2>\n\n<p>طابِق الأداة مع السبب الذي دفعك لمغادرة Claude Design:</p>\n\n<ul>\n<li><strong>غادرتَ لأنها مغلقة / مستضافة / مقيّدة بنموذج؟</strong> ← <strong>Open Design.</strong> إنه الخيار الوحيد هنا المفتوح المصدر، وBYOK، وملكٌ لك.</li>\n<li><strong>غادرتَ لأنك تريد تعاوناً على لوحة الفريق؟</strong> ← <strong>Figma.</strong></li>\n<li><strong>غادرتَ لأنك أردت المجاني والسريع؟</strong> ← <strong>Google Stitch.</strong></li>\n<li><strong>غادرتَ لأنك أردت كوداً حقيقياً، الآن؟</strong> ← <strong>v0</strong> (مكوّنات) أو <strong>Lovable / Bolt</strong> (تطبيقات كاملة).</li>\n</ul>\n\n<p>النقطة الصادقة الأعمق: معظم هذه الأدوات ما تزال مغلقة، أو مستضافة، أو ذات نموذج واحد — إنها تستبدل أسوار Anthropic بأسوار أحدٍ آخر. إن كانت <em>فئة</em> المشكلة لديك مع Claude Design هي التقييد (lock-in)، فإن المسار المفتوح المصدر وحده هو الذي يحلّها فعلاً بدلاً من مجرّد نقلها.</p>\n\n<h2>الأسئلة الشائعة</h2>\n\n<p><strong>ما أفضل بديل لـ Claude Design؟</strong> يعتمد على سبب مغادرتك. للملكية وانعدام التقييد، Open Design (مفتوح المصدر، BYOK). للتعاون، Figma. للرسم التخطيطي المجاني، Google Stitch. لإنتاج الكود، v0 أو Lovable.</p>\n\n<p><strong>هل يوجد بديل مجاني ومفتوح المصدر لـ Claude Design؟</strong> نعم — Open Design بترخيص Apache-2.0، مجاني، ومستضاف ذاتياً؛ تدفع فقط مقابل أي نموذج تحضره. Google Stitch مجاني لكنه مغلق.</p>\n\n<p><strong>هل تستطيع أيٌّ من هذه إنتاج كود حقيقي مثل Claude Design؟</strong> Open Design وv0 وLovable وBolt جميعها تنتج كوداً يعمل. أما أدوات النماذج المحاكاة (Visily وUizard) وأدوات اللوحة فتتوقف أبكر.</p>\n\n<p><strong>هل عليّ استخدام Claude كنموذج؟</strong> مع Claude Design، نعم. مع BYOK في Open Design، تحضر أي نموذج متوافق مع OpenAI — Claude أو GPT أو Gemini أو DeepSeek أو مستضاف ذاتياً.</p>\n\n<p><strong>أين أجد الأداة المفتوحة المصدر؟</strong> Open Design متاح على <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> ويعمل محلياً؛ انظر <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">لماذا بنيناه كطبقة مهارات</a>.</p>\n\n<h2>الخلاصة</h2>\n\n<p>Claude Design أداة جيدة بشكل محدّد: مغلقة، ومستضافة، وأحادية النموذج، ومدمجة باشتراك. أفضل بديل لك هو ذاك الذي يصلح الجزء من هذا الشكل الذي لم تستطع التعايش معه. إن كان ما ينقصك ميزة، فكثير من هذه الأدوات ستفي بالغرض. أما إن كان التقييد — في النموذج أو الملفات أو بيئة التشغيل — فإن الإصلاح الحقيقي الوحيد هو المفتوح: <a href=\"/\">Open Design</a> هو الرهان المفتوح المصدر، المُصمَّم أصلاً للوكلاء، على أن العقد القادم من أعمال التصميم يجب أن يكون ملكاً لك، من المطالبة وصولاً إلى الكود المنشور.</p>\n\n<p><em>مستعد لتجربة المسار المفتوح؟ <a href=\"/download\">افتح التطبيق</a> أو <a href=\"/plugins\">تصفّح مكتبة المهارات وأنظمة التصميم</a>.</em></p>"
  tr:
    title: "2026'da En İyi Claude Design Alternatifleri"
    summary: "Claude Design gerçekten iyi — ama kapalı, barındırılan, modele kilitli ve bir Claude aboneliğiyle paketlenmiş durumda. Bunlardan herhangi biri sizin için anlaşma bozucuysa, 2026'nın en iyi Claude Design alternatifleri burada; gerçekten önemli olan şeyler üzerinden puanlandı: ürün sizin mi, gerçek kod üretebiliyor mu ve model seçimi sizde mi?"
    category: "Kılavuzlar"
    bodyHtml: "<p>Open Design'da ürün tarafını yönetiyorum; bu da demek oluyor ki Claude Design alternatiflerinin içinde muhtemelen sağlıklı sayılabilecek süreden daha fazla vakit geçirdim — aynı brief, her araç, yılda birkaç kez. Claude Design'ın kendisi iyi; bu bir karalama yazısı değil. Ama \"iyi\" ile \"sizin için doğru\" aynı cümle değil. Kapalı kaynaklı, yalnızca barındırılan, model olarak Claude'a kilitli ve bir Claude aboneliğiyle paketlenmiş durumda — ve bunlardan herhangi biri bir alternatif aramanızın nedeni olabilir.</p>\n\n<p>İşte bu yüzden bu, dürüst 2026 derlemesi: en iyi Claude Design alternatifleri, kararı gerçekten belirleyen üç şey üzerinden puanlandı — <strong>çıktının sahibi siz misiniz, gerçek kod üretebiliyor mu ve model seçimi sizde mi?</strong> Baştan söyleyeyim: bu listedeki araçlardan birini biz geliştiriyoruz; diğerlerine yönelik övgüleri gerçekçi tuttum, çünkü hileli bir liste işe yaramaz bir listedir.</p>\n\n<h2>Neden bir Claude Design alternatifi aramalı</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) sohbete dayalı bir tasarım aracı: solda sohbet, sağda tuval, Claude Code aracılığıyla prototipten koda. Hızlı ve cilalı. Ekiplerin yine de başka yerlere bakmasının nedenleri kaliteyle değil, yapıyla ilgili:</p>\n\n<ul>\n<li><strong>Model sabit.</strong> Her render Claude üzerinden geçer. Zaten GPT, Gemini için ödeme yapıyorsanız ya da hassas işler için kendi sunucunuzda barındırıyorsanız, bu durum işinize yaramaz.</li>\n<li><strong>Yalnızca barındırılan.</strong> Prompt'larınız, tasarım sisteminiz ve kod tabanı bağlamınız Anthropic'in sunucularına gider — ajans veya gizlilik sözleşmesi (NDA) gerektiren işler için bir tedarik görüşmesi konusu.</li>\n<li><strong>Kapalı.</strong> Fork'layamaz, denetleyemez veya tasarım davranışını değiştiremezsiniz.</li>\n<li><strong>Fatura, paketlenmiş bir aboneliktir.</strong> Tek başına çalışan bir Pro kullanıcısı için sorun değil, bir ekip için tuhaf, uzun bir katkıcı kuyruğu için ise baştan imkânsız.</li>\n</ul>\n\n<p>Bunların hiçbiri sizi rahatsız etmiyorsa, Claude Design gayet iyi bir seçim. Bunlardan biri az önce başınızı salladığını fark ettiyseniz, okumaya devam edin.</p>\n\n<h2>Hızlı karşılaştırma</h2>\n\n<table><thead><tr><th>Araç</th><th>En uygun olduğu durum</th><th>Açık kaynak</th><th>Gerçek kod üretir</th><th>Model seçimi</th><th>Fiyatlandırma biçimi</th></tr></thead><tbody><tr><td><strong>Open Design</strong></td><td>Tüm döngünün sahibi olmak</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / herhangi biri</td><td>Ücretsiz, kendiniz çalıştırırsınız</td></tr><tr><td><strong>Figma (Make / AI)</strong></td><td>Ekip tuvalinde işbirliği</td><td>❌</td><td>Kısmen (dışa aktarma)</td><td>❌</td><td>Kullanıcı başına abonelik</td></tr><tr><td><strong>Google Stitch</strong></td><td>Ücretsiz, hızlı taslak çıkarma</td><td>❌</td><td>Koda/Figma'ya dışa aktarma</td><td>❌</td><td>Ücretsiz (Labs)</td></tr><tr><td><strong>v0 (Vercel)</strong></td><td>Prompt → React kodu</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Ücretsiz katman + ücretli</td></tr><tr><td><strong>Lovable</strong></td><td>Prompt → tam uygulama</td><td>❌</td><td>✅ (tam yığın)</td><td>❌</td><td>Ücretsiz katman + ücretli</td></tr><tr><td><strong>Bolt (bolt.new)</strong></td><td>Tarayıcı içi uygulama derlemeleri</td><td>Kısmen (açık kaynak kökleri)</td><td>✅</td><td>Kısmen</td><td>Kredi tabanlı</td></tr></tbody></table>\n\n<h2>Bunları nasıl değerlendirdim</h2>\n\n<p>Özellik sayısıyla değil — gerçek bir projeyle temas ettiğinde neyin ayakta kaldığıyla. Dört kriter, sizi ne sıklıkla ısırdıklarına göre sıralı:</p>\n\n<ol>\n<li><strong>Sahiplik.</strong> Ödeme yapmayı bıraktığınızda ya da araç değiştiğinde, işinizi taşınabilir bir biçimde elinizde tutabiliyor musunuz, yoksa o iş birinin bulutunda mahsur mu kalıyor?</li>\n<li><strong>Gerçek koda dönüşür.</strong> Çıktı çalışan bir arayüze mi dönüşüyor, yoksa birinin elle yeniden inşa ettiği bir mockup'a mı? (Tüm o <a href=\"/blog/vibe-design-vs-vibe-coding/\">mockup'tan sevkiyata uzanan boşluk</a>.)</li>\n<li><strong>Model özgürlüğü.</strong> Zaten ödeme yaptığınız modeli getirebiliyor musunuz, yoksa tek bir sağlayıcının fiyat eğrisine mi kilitlisiniz?</li>\n<li><strong>Fiyatlandırma biçimi.</strong> Kullanıcı başına abonelik, kullanım kredisi ya da ücretsiz-ve-kendin-çalıştır — ve bunun tüm bir ekibe nasıl ölçeklendiği.</li>\n</ol>\n\n<h2>En iyi Claude Design alternatifleri</h2>\n\n<h3>1. Open Design — açık kaynaklı, ajan-yerel seçim</h3>\n\n<p><strong>Nedir.</strong> Tam şeffaflık: bu bizim ürünümüz. Open Design bir Claude Design klonu değil — zaten çalıştırdığınız kodlama ajanını bir tasarım motoruna dönüştüren ince, açık kaynaklı bir katman. Her beceri bir <code>SKILL.md</code> dosyası, her tasarım sistemi taşınabilir bir <code>DESIGN.md</code>.</p>\n\n<p><strong>Temel özellikler</strong></p>\n<ul>\n<li>Apache-2.0, yerel öncelikli, kayıt yok — <code>pnpm tools-dev</code> ile çalışır</li>\n<li>BYOK: OpenAI uyumlu herhangi bir modeli getirin (Claude, GPT, Gemini, DeepSeek veya kendi barındırdığınız)</li>\n<li><code>$PATH</code>'inizde zaten bulunan 16+ kodlama-ajanı CLI'sını otomatik algılar (Claude Code, Codex, Cursor, OpenCode, Qwen ve daha fazlası)</li>\n<li>Sadece mockup değil, gerçek kod üretir — tasarım ve kod tek bir döngüde kalır</li>\n<li>Kutudan çıkar çıkmaz bir beceri kitaplığı ve taşınabilir tasarım sistemleri</li>\n</ul>\n\n<p><strong>Artıları:</strong> her şeyin sahibi olursunuz (diff'leyip saklayabileceğiniz dosyalar); model kilidi yok; kullanıcı başına sayaç yok; mevcut ajanınızla birlikte çalışır.<br>\n<strong>Eksileri:</strong> bu, çalıştırdığınız bir katmandır, barındırılan cilalı bir SaaS değil — biraz kurulum gerektirir ve gerçek zamanlı çok oyunculu bir tuval değildir.<br>\n<strong>Fiyatlandırma:</strong> ücretsiz ve açık kaynaklı; yalnızca yönlendirdiğiniz modelin bedelini ödersiniz.<br>\n<strong>En uygun olduğu durum:</strong> iş akışlarını, dosyalarını veya model seçimlerini kapalı bir sağlayıcıya teslim etmeyi reddeden ekipler.<br>\n<strong>Benim görüşüm:</strong> Claude Design'dan ayrılma nedeniniz \"kapalı / barındırılan / modele kilitli\" idiyse, bu listedeki en doğrudan yanıt budur — tasarım gereği üçünün de tam tersi.</p>\n\n<h3>2. Figma (Make ve AI)</h3>\n\n<p><strong>Nedir.</strong> Mevcut güç. Figma'nın AI özellikleri ve Figma Make, üretimi her tasarım ekibinin zaten bildiği tuvale taşıyor.</p>\n\n<p><strong>Temel özellikler:</strong> gerçek zamanlı çok oyunculu tuval, olgun bileşenler/varyantlar, Dev Mode devir teslimi, derin bir eklenti ekosistemi ve hepsinin üzerine eklenmiş AI üretimi.<br>\n<strong>Artıları:</strong> eşsiz işbirlikçi tuval; ekibinizin zaten konuştuğu iş akışı; devasa ekosistem.<br>\n<strong>Eksileri:</strong> kapalı, tescilli dosya formatı, barındırılan; kullanıcı başına fiyatlandırma; AI, kod üreten bir ajan değil, bir tuval aracına eklenmiş bir parçadır. (Bkz. <a href=\"/blog/figma-alternative-open-design/\">Figma'dan açık kaynak yola geçiş</a>.)<br>\n<strong>Fiyatlandırma:</strong> role göre kademeli, kullanıcı başına abonelik.<br>\n<strong>En uygun olduğu durum:</strong> paylaşılan bir tuvalde yaşayan ve AI'ı yanında isteyen tasarım ekipleri.<br>\n<strong>Benim görüşüm:</strong> işbirliği sahiplikten daha önemliyse en güvenli seçim — ve Claude Design'dan ayrılma nedeniniz sahiplikse yanlış seçim.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Nedir.</strong> Google'ın prompt'tan-arayüze aracı ve \"vibe design\" ifadesini herkesin arama çubuğuna sokan ürün.</p>\n\n<p><strong>Temel özellikler:</strong> güçlü prompt'tan-arayüze kalitesi, Voice Canvas, Figma ve ön uç koduna doğru dışa aktarma, Google Labs içinde ücretsiz.<br>\n<strong>Artıları:</strong> gerçekten iyi ilk ekranlar; ücretsiz ve hızlı; niyetle tasarlamaya geçiş için bedelsiz en iyi rampa.<br>\n<strong>Eksileri:</strong> Google'ın duvarlarla çevrili yüzeyi — dışa aktarma tek yönlü bir kapı, tasarım sisteminiz gerçeğin kaynağı değil ve Labs fiyatlandırması/erişilebilirliği Google'ın kararı. (<a href=\"/blog/vibe-design-with-stitch/\">Stitch ile tam uygulamalı deneyim</a>.)<br>\n<strong>Fiyatlandırma:</strong> Labs'te ücretsiz (şimdilik).<br>\n<strong>En uygun olduğu durum:</strong> sıfır maliyetle yönleri keşfetmek ve taslak çıkarmak.<br>\n<strong>Benim görüşüm:</strong> muhteşem bir karalama defteri, bir ürünün sahibi olunacak bir yer değil — keşfetmek için kullanın, sonra başka yerde inşa edin.</p>\n\n<h3>4. Vercel'den v0</h3>\n\n<p><strong>Nedir.</strong> Kod öncelikli bir üretici: bir arayüzü tarif edin, bir repo'ya alabileceğiniz React ve Tailwind kodunu alın.</p>\n\n<p><strong>Temel özellikler:</strong> prompt'tan-bileşene, shadcn/Tailwind çıktısı, Vercel/Next.js yığınıyla sıkı uyum, ta baştan gerçek kod.<br>\n<strong>Artıları:</strong> mockup uçurumu yok — çıktı sevk edilebilir koddur; mühendisler ve tasarım mühendisleri için mükemmel.<br>\n<strong>Eksileri:</strong> kapalı araç; çıktı ve akış Vercel ekosistemine yönelir; bir tuvalde tasarlamıyorsunuz, kod düzenliyorsunuz.<br>\n<strong>Fiyatlandırma:</strong> ücretsiz katman artı ücretli kullanım.<br>\n<strong>En uygun olduğu durum:</strong> tasarımın gerçek ön uç kod olarak gelmesini isteyen geliştiriciler.<br>\n<strong>Benim görüşüm:</strong> kapalı araçlar arasındaki en güçlü \"koda sevk\" seçeneği — sadece bilin ki kodun içinde yaşamaya kaydoldunuz.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Nedir.</strong> Prompt'tan-uygulamaya: ne istediğinizi tarif edin, Lovable çalışan bir tam yığın web uygulaması ortaya çıkarsın.</p>\n\n<p><strong>Temel özellikler:</strong> bir prompt'tan tam yığın iskeleleme, hızlı yineleme, barındırılan önizleme, uçtan uca prototipler için iyi.<br>\n<strong>Artıları:</strong> bir resim değil, çalışan bir ürün elde edersiniz; sıfırdan-bire fikirler için harika hız.<br>\n<strong>Eksileri:</strong> barındırılan ve kapalı; uygulama yığınına bağlıdır; \"tasarım\", çerçevenin ne render ettiyse odur, dolayısıyla <a href=\"/blog/vibe-design-vs-vibe-coding/\">kayma</a> sorununu yönetmek size kalır.<br>\n<strong>Fiyatlandırma:</strong> ücretsiz katman artı ücretli planlar.<br>\n<strong>En uygun olduğu durum:</strong> sadece bir ekranı değil, koca bir ürünü prototipleyen kurucular.<br>\n<strong>Benim görüşüm:</strong> teslim edilecek şey çalışan bir uygulama olduğunda buna uzanın; bir sistem üzerinde tasarım kontrolüne ihtiyacınız olduğunda atlayın.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Nedir.</strong> StackBlitz'ten gelen, tam web uygulamaları üreten ve canlı çalıştıran tarayıcı içi bir AI uygulama oluşturucu.</p>\n\n<p><strong>Temel özellikler:</strong> tarayıcı tabanlı çalışma zamanı, prompt'tan-uygulamaya, anlık önizleme ve dağıtım, StackBlitz araçlarındaki açık kaynak kökleri.<br>\n<strong>Artıları:</strong> kurulacak hiçbir şey yok; uygulama anında çalışır; fikirden tıklanabilire hızlı döngü.<br>\n<strong>Eksileri:</strong> kredi tabanlı maliyetler birikir; çıktı kendi ortamına bağlı; tasarımcıdan çok oluşturucu.<br>\n<strong>Fiyatlandırma:</strong> kullanım kredileri.<br>\n<strong>En uygun olduğu durum:</strong> aynı saat içinde paylaşmak istediğiniz hızlı, çalıştırılabilir prototipler.<br>\n<strong>Benim görüşüm:</strong> ruhen \"vibe coding\"e en yakın olanı — hız için mükemmel, tasarım tutarlılığı hedef olduğunda daha az.</p>\n\n<blockquote><p>Bir göz atmaya değer diğerleri: hızlı AI mockup'ları için <strong>Visily</strong> ve <strong>Uizard</strong> (fikir geliştirme için harika, ama resimde dururlar) ve AI ile üretilmiş pazarlama siteleri için <strong>Framer AI</strong>. <strong>Magic Patterns</strong> ve <strong>UX Pilot</strong> gibi araçlar aynı prototipleme alanında oynuyor. Hiçbiri aşağıdaki temel kararı değiştirmiyor.</p></blockquote>\n\n<h2>Nasıl seçilir</h2>\n\n<p>Aracı, Claude Design'dan ayrılma nedeninizle eşleştirin:</p>\n\n<ul>\n<li><strong>Kapalı / barındırılan / modele kilitli olduğu için mi ayrıldınız?</strong> → <strong>Open Design.</strong> Buradaki açık kaynaklı, BYOK ve size ait olan tek seçenek.</li>\n<li><strong>Ekip tuvalinde işbirliği istediğiniz için mi ayrıldınız?</strong> → <strong>Figma.</strong></li>\n<li><strong>Ücretsiz ve hızlı istediğiniz için mi ayrıldınız?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Hemen şimdi gerçek kod istediğiniz için mi ayrıldınız?</strong> → <strong>v0</strong> (bileşenler) ya da <strong>Lovable / Bolt</strong> (tam uygulamalar).</li>\n</ul>\n\n<p>Dürüst meta-nokta: bunların çoğu hâlâ kapalı, barındırılan veya tek modelli — Anthropic'in duvarlarını bir başkasınınkiyle takas ediyorlar. Claude Design ile yaşadığınız sorunun <em>kategorisi</em> kilitlenmeyse, onu yalnızca açık kaynak yolu gerçekten çözer, yerini değiştirmekle yetinmez.</p>\n\n<h2>SSS</h2>\n\n<p><strong>En iyi Claude Design alternatifi nedir?</strong> Ayrılma nedeninize bağlı. Sahiplik ve kilitlenme olmaması için, Open Design (açık kaynak, BYOK). İşbirliği için, Figma. Ücretsiz taslak çıkarma için, Google Stitch. Kod sevki için, v0 ya da Lovable.</p>\n\n<p><strong>Ücretsiz, açık kaynaklı bir Claude Design alternatifi var mı?</strong> Evet — Open Design Apache-2.0, ücretsiz ve kendi sunucunuzda barındırılır; yalnızca getirdiğiniz modelin bedelini ödersiniz. Google Stitch ücretsiz ama kapalı.</p>\n\n<p><strong>Bunlardan herhangi biri Claude Design gibi gerçek koda sevk edebilir mi?</strong> Open Design, v0, Lovable ve Bolt'un hepsi çalışan kod üretir. Mockup araçları (Visily, Uizard) ve tuval araçları daha önce durur.</p>\n\n<p><strong>Model olarak Claude'u kullanmak zorunda mıyım?</strong> Claude Design ile, evet. Open Design'ın BYOK'u ile, OpenAI uyumlu herhangi bir modeli getirirsiniz — Claude, GPT, Gemini, DeepSeek veya kendi barındırdığınız.</p>\n\n<p><strong>Açık kaynaklı olanı nerede bulurum?</strong> Open Design <a href=\"https://github.com/nexu-io/open-design\">GitHub</a>'da ve yerel olarak çalışır; <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">onu neden bir beceri katmanı olarak inşa ettiğimize</a> bakın.</p>\n\n<h2>Sonuç</h2>\n\n<p>Claude Design, belirli bir biçime sahip iyi bir araç: kapalı, barındırılan, tek modelli, abonelikle paketlenmiş. Sizin için en iyi alternatif, bu biçimin birlikte yaşayamadığınız parçasını düzelten araçtır. Eksik olan bir özellikse, bunların pek çoğu işinizi görür. Kilitlenmeyse — model, dosyalar ya da çalışma zamanı — o zaman tek gerçek çözüm açık olanıdır: <a href=\"/\">Open Design</a>, tasarım işinin önümüzdeki on yılda, prompt'tan ta sevk edilen koda kadar size ait olması gerektiğine dair açık kaynaklı, ajan-yerel bahistir.</p>\n\n<p><em>Açık yolu denemeye hazır mısınız? <a href=\"/download\">Uygulamayı açın</a> ya da <a href=\"/plugins\">beceri ve tasarım sistemi kitaplığına göz atın</a>.</em></p>"
  uk:
    title: "Найкращі альтернативи Claude Design у 2026 році"
    summary: "Claude Design справді хороший — але він закритий, лише хмарний, прив'язаний до однієї моделі та постачається в комплекті з підпискою на Claude. Якщо хоч щось із цього для вас неприйнятне, ось найкращі альтернативи Claude Design у 2026 році, оцінені за тим, що насправді має значення: чи володієте ви результатом, чи вміє інструмент випускати справжній код і чи модель — ваш власний вибір?"
    category: "Посібники"
    bodyHtml: "<p>Я керую продуктом в Open Design, а це означає, що я провів усередині альтернатив Claude Design більше часу, ніж це, мабуть, корисно для здоров'я — те саме завдання, кожен інструмент, кілька разів на рік. Сам Claude Design хороший; це не розгром. Але «хороший» і «той, що підходить саме вам» — це не одне й те саме речення. Він із закритим кодом, працює лише в хмарі, прив'язаний до Claude як до моделі та постачається в комплекті з підпискою на Claude — і будь-що з цього може бути причиною, чому ви шукаєте альтернативу.</p>\n\n<p>Тож це чесний огляд 2026 року: найкращі альтернативи Claude Design, оцінені за трьома речами, що насправді вирішують справу — <strong>чи володієте ви результатом, чи вміє інструмент випускати справжній код і чи модель — ваш власний вибір?</strong> Скажу одразу: ми створюємо один з інструментів у цьому списку; я зберіг похвалу для решти щирою, бо підтасований список нічого не вартий.</p>\n\n<h2>Навіщо шукати альтернативу Claude Design</h2>\n\n<p><a href=\"https://www.anthropic.com/news/claude-design-anthropic-labs\">Claude Design</a> (Anthropic Labs, 2026) — це розмовний інструмент дизайну: чат ліворуч, полотно праворуч, шлях від прототипу до коду через Claude Code. Він швидкий і відшліфований. Причини, чому команди все одно шукають деінде, є структурними, а не пов'язаними з якістю:</p>\n\n<ul>\n<li><strong>Модель зафіксована.</strong> Кожен рендер проходить через Claude. Якщо ви вже платите за GPT, Gemini або займаєтеся самохостингом заради чутливої роботи, це сюди не переноситься.</li>\n<li><strong>Він лише хмарний.</strong> Ваші запити, дизайн-система та контекст кодової бази мандрують на сервери Anthropic — а це вже розмова з відділом закупівель для агентської роботи чи роботи під NDA.</li>\n<li><strong>Він закритий.</strong> Ви не можете форкнути його, проаудитувати чи замінити поведінку дизайну.</li>\n<li><strong>Рахунок — це комплектна підписка.</strong> Нормально для одного користувача Pro, незручно для команди, цілковито неприйнятно для довгого хвоста учасників.</li>\n</ul>\n\n<p>Якщо вас ніщо з цього не турбує, Claude Design — гідний вибір. Якщо ж щось із цього щойно змусило вас кивнути — читайте далі.</p>\n\n<h2>Швидке порівняння</h2>\n\n<table>\n<thead>\n<tr><th>Інструмент</th><th>Найкраще підходить для</th><th>Відкритий код</th><th>Випускає справжній код</th><th>Вибір моделі</th><th>Форма ціноутворення</th></tr>\n</thead>\n<tbody>\n<tr><td><strong>Open Design</strong></td><td>Володіння всім циклом</td><td>✅ Apache-2.0</td><td>✅</td><td>✅ BYOK / будь-яка</td><td>Безкоштовно, самостійний запуск</td></tr>\n<tr><td><strong>Figma (Make / AI)</strong></td><td>Командна співпраця на полотні</td><td>❌</td><td>Частково (експорт)</td><td>❌</td><td>Підписка за місце</td></tr>\n<tr><td><strong>Google Stitch</strong></td><td>Безкоштовні, швидкі начерки</td><td>❌</td><td>Експорт у код/Figma</td><td>❌</td><td>Безкоштовно (Labs)</td></tr>\n<tr><td><strong>v0 (Vercel)</strong></td><td>Запит → код на React</td><td>❌</td><td>✅ (React/Tailwind)</td><td>❌</td><td>Безкоштовний рівень + платний</td></tr>\n<tr><td><strong>Lovable</strong></td><td>Запит → повноцінний застосунок</td><td>❌</td><td>✅ (full-stack)</td><td>❌</td><td>Безкоштовний рівень + платний</td></tr>\n<tr><td><strong>Bolt (bolt.new)</strong></td><td>Збірка застосунків у браузері</td><td>Частково (коріння в OSS)</td><td>✅</td><td>Частково</td><td>На основі кредитів</td></tr>\n</tbody>\n</table>\n\n<h2>Як я це оцінював</h2>\n\n<p>Не за кількістю функцій — а за тим, що виживає при зіткненні зі справжнім проєктом. Чотири критерії, у порядку того, як часто вони даються взнаки:</p>\n\n<ul>\n<li><strong>Володіння.</strong> Коли ви перестаєте платити або інструмент змінюється, чи зберігаєте ви свою роботу в переносному вигляді, чи вона застрягає в чиїйсь хмарі?</li>\n<li><strong>Випуск у справжній код.</strong> Чи стає результат працюючим інтерфейсом, чи макетом, який хтось перебудовує вручну? (Уся ця <a href=\"/blog/vibe-design-vs-vibe-coding/\">прірва між макетом і випущеним продуктом</a>.)</li>\n<li><strong>Свобода моделі.</strong> Чи можете ви принести модель, за яку вже платите, чи прив'язані до цінової кривої одного постачальника?</li>\n<li><strong>Форма ціноутворення.</strong> Підписка за місце, кредити за використання чи безкоштовно-і-самостійно — і як це масштабується на цілу команду.</li>\n</ul>\n\n<h2>Найкращі альтернативи Claude Design</h2>\n\n<h3>1. Open Design — відкритий, агентоцентричний вибір</h3>\n\n<p><strong>Що це.</strong> Повне розкриття: це наш продукт. Open Design — не клон Claude Design, це тонкий шар з відкритим кодом, який перетворює кодувальний агент, що ви вже запускаєте, на двигун дизайну. Кожен навик — це файл <code>SKILL.md</code>, кожна дизайн-система — переносний <code>DESIGN.md</code>.</p>\n\n<p><strong>Ключові можливості</strong></p>\n<ul>\n<li>Apache-2.0, локальний за замовчуванням, без реєстрації — запускається через <code>pnpm tools-dev</code></li>\n<li>BYOK: приносьте будь-яку OpenAI-сумісну модель (Claude, GPT, Gemini, DeepSeek чи самохостинг)</li>\n<li>Автоматично виявляє 16+ CLI кодувальних агентів, які вже є у вашому <code>$PATH</code> (Claude Code, Codex, Cursor, OpenCode, Qwen та інші)</li>\n<li>Випускає у справжній код, а не лише макети — дизайн і код лишаються в одному циклі</li>\n<li>Бібліотека навичок і переносних дизайн-систем одразу з коробки</li>\n</ul>\n\n<p><strong>Переваги:</strong> ви володієте всім (файлами, які можна порівнювати через diff і зберігати); жодної прив'язки до моделі; жодного лічильника за місце; працює поруч із вашим наявним агентом.<br>\n<strong>Недоліки:</strong> це шар, який ви запускаєте, а не хмарна відшліфована SaaS — є налаштування, і це не полотно для багатокористувацької роботи в реальному часі.<br>\n<strong>Ціноутворення:</strong> безкоштовно і з відкритим кодом; ви платите лише за ту модель, на яку його спрямуєте.<br>\n<strong>Найкраще підходить для:</strong> команд, які відмовляються віддавати свій робочий процес, файли чи вибір моделі закритому постачальнику.<br>\n<strong>Моя думка:</strong> якщо причиною, чому ви пішли з Claude Design, було «закритий / хмарний / прив'язаний до моделі», це найпряміша відповідь у списку — за задумом це протилежність усіх трьох.</p>\n\n<h3>2. Figma (Make &amp; AI)</h3>\n\n<p><strong>Що це.</strong> Старожил. AI-функції Figma та Figma Make приносять генерацію на полотно, яке вже знає кожна дизайн-команда.</p>\n\n<p><strong>Ключові можливості:</strong> багатокористувацьке полотно в реальному часі, зрілі компоненти/варіанти, передача роботи через Dev Mode, глибока екосистема плагінів, AI-генерація, прикручена до всього цього.<br>\n<strong>Переваги:</strong> неперевершене полотно для співпраці; робочий процес, яким уже володіє ваша команда; величезна екосистема.<br>\n<strong>Недоліки:</strong> закритий, пропрієтарний формат файлів, хмарний; ціноутворення за місце; AI — це доповнення до інструмента-полотна, а не агент, який випускає код. (Дивіться <a href=\"/blog/figma-alternative-open-design/\">відкритий шлях від Figma</a>.)<br>\n<strong>Ціноутворення:</strong> підписка за місце, з рівнями за роллю.<br>\n<strong>Найкраще підходить для:</strong> дизайн-команд, які живуть на спільному полотні й хочуть мати AI поруч.<br>\n<strong>Моя думка:</strong> найбезпечніший вибір, якщо співпраця важливіша за володіння — і неправильний, якщо саме володіння стало причиною піти з Claude Design.</p>\n\n<h3>3. Google Stitch</h3>\n\n<p><strong>Що це.</strong> Інструмент Google «запит → UI» і продукт, який вписав «vibe design» у рядок пошуку кожного.</p>\n\n<p><strong>Ключові можливості:</strong> висока якість перетворення запиту на UI, Voice Canvas, експорт у Figma та фронтенд-код, безкоштовно в Google Labs.<br>\n<strong>Переваги:</strong> справді хороші перші екрани; безкоштовно й швидко; найкращий безкоштовний вхід у дизайн за наміром.<br>\n<strong>Недоліки:</strong> огороджена поверхня Google — експорт це двері в один бік, ваша дизайн-система не є джерелом істини, а ціноутворення/доступність Labs вирішує Google. (Повне <a href=\"/blog/vibe-design-with-stitch/\">практичне знайомство зі Stitch</a>.)<br>\n<strong>Ціноутворення:</strong> безкоштовно в Labs (наразі).<br>\n<strong>Найкраще підходить для:</strong> дослідження й накидання напрямків без жодних витрат.<br>\n<strong>Моя думка:</strong> чудовий блокнот для начерків, а не місце, щоб володіти продуктом — використовуйте його, щоб досліджувати, а будуйте деінде.</p>\n\n<h3>4. v0 від Vercel</h3>\n\n<p><strong>Що це.</strong> Генератор, орієнтований на код: опишіть UI — отримайте React і Tailwind, які можна перенести в репозиторій.</p>\n\n<p><strong>Ключові можливості:</strong> запит → компонент, вивід shadcn/Tailwind, щільна сумісність зі стеком Vercel/Next.js, справжній код від самого початку.<br>\n<strong>Переваги:</strong> жодної прірви макета — результат це код, готовий до випуску; чудово для інженерів і дизайн-інженерів.<br>\n<strong>Недоліки:</strong> закритий інструмент; результат і потік схиляються до екосистеми Vercel; ви редагуєте код, а не проєктуєте на полотні.<br>\n<strong>Ціноутворення:</strong> безкоштовний рівень плюс платне використання.<br>\n<strong>Найкраще підходить для:</strong> розробників, які хочуть, щоб дизайн надходив як справжній фронтенд-код.<br>\n<strong>Моя думка:</strong> найсильніший варіант «випускає код» серед закритих інструментів — лише знайте, що ви підписалися жити в коді.</p>\n\n<h3>5. Lovable</h3>\n\n<p><strong>Що це.</strong> Запит → застосунок: опишіть, що хочете, і Lovable розкручує працюючий full-stack вебзастосунок.</p>\n\n<p><strong>Ключові можливості:</strong> full-stack каркас із запиту, швидкі ітерації, хмарний попередній перегляд, добре підходить для наскрізних прототипів.<br>\n<strong>Переваги:</strong> ви отримуєте працюючий продукт, а не картинку; чудова швидкість для ідей «від нуля до одиниці».<br>\n<strong>Недоліки:</strong> хмарний і закритий; застосунок повінчаний зі своїм стеком; «дизайн» — це те, що відрендерив фреймворк, тож <a href=\"/blog/vibe-design-vs-vibe-coding/\">дрейф</a> доведеться контролювати вам.<br>\n<strong>Ціноутворення:</strong> безкоштовний рівень плюс платні плани.<br>\n<strong>Найкраще підходить для:</strong> засновників, що прототипують цілий продукт, а не лише екран.<br>\n<strong>Моя думка:</strong> хапайтеся за нього, коли результат — працюючий застосунок; пропустіть, коли вам потрібен контроль над дизайном системи.</p>\n\n<h3>6. Bolt (bolt.new)</h3>\n\n<p><strong>Що це.</strong> Браузерний AI-конструктор застосунків від StackBlitz, який генерує й запускає повноцінні вебзастосунки наживо.</p>\n\n<p><strong>Ключові можливості:</strong> середовище виконання на основі браузера, запит → застосунок, миттєвий перегляд і деплой, коріння з відкритим кодом в інструментарії StackBlitz.<br>\n<strong>Переваги:</strong> нічого не треба встановлювати; застосунок запускається одразу; швидкий цикл від ідеї до клікабельного.<br>\n<strong>Недоліки:</strong> витрати на основі кредитів накопичуються; результат прив'язаний до свого середовища; більше конструктор, ніж дизайнер.<br>\n<strong>Ціноутворення:</strong> кредити за використання.<br>\n<strong>Найкраще підходить для:</strong> швидких, запускних прототипів, якими ви хочете поділитися в ту саму годину.<br>\n<strong>Моя думка:</strong> найближчий за духом до «vibe coding» — чудовий для швидкості, менш чудовий, коли метою є узгодженість дизайну.</p>\n\n<blockquote><p>Також варто глянути: <strong>Visily</strong> та <strong>Uizard</strong> для швидких AI-макетів (чудові для генерування ідей, але вони зупиняються на картинці) і <strong>Framer AI</strong> для AI-генерованих маркетингових сайтів. Інструменти на кшталт <strong>Magic Patterns</strong> та <strong>UX Pilot</strong> грають у тому ж просторі прототипування. Жоден з них не змінює головного рішення нижче.</p></blockquote>\n\n<h2>Як обрати</h2>\n\n<p>Підберіть інструмент під причину, чому ви пішли з Claude Design:</p>\n\n<ul>\n<li><strong>Пішли, бо він закритий / хмарний / прив'язаний до моделі?</strong> → <strong>Open Design.</strong> Це єдиний тут варіант, що має відкритий код, BYOK і належить вам.</li>\n<li><strong>Пішли, бо хочете командну співпрацю на полотні?</strong> → <strong>Figma.</strong></li>\n<li><strong>Пішли, бо хотіли безкоштовно й швидко?</strong> → <strong>Google Stitch.</strong></li>\n<li><strong>Пішли, бо хотіли справжній код, і то зараз?</strong> → <strong>v0</strong> (компоненти) або <strong>Lovable / Bolt</strong> (цілі застосунки).</li>\n</ul>\n\n<p>Чесний мета-висновок: більшість із них усе одно закриті, хмарні чи однамодельні — вони міняють стіни Anthropic на чиїсь чужі. Якщо *категорія* проблеми, яку ви маєте з Claude Design, — це прив'язка, то лише шлях із відкритим кодом справді її вирішує, а не переносить в інше місце.</p>\n\n<h2>Поширені запитання</h2>\n\n<p><strong>Яка найкраща альтернатива Claude Design?</strong> Залежить від того, чому ви йдете. Для володіння й відсутності прив'язки — Open Design (відкритий код, BYOK). Для співпраці — Figma. Для безкоштовних начерків — Google Stitch. Для випуску коду — v0 чи Lovable.</p>\n\n<p><strong>Чи є безкоштовна альтернатива Claude Design з відкритим кодом?</strong> Так — Open Design має ліцензію Apache-2.0, безкоштовний і самохостований; ви платите лише за ту модель, яку приносите. Google Stitch безкоштовний, але закритий.</p>\n\n<p><strong>Чи може хтось із них випускати справжній код, як Claude Design?</strong> Open Design, v0, Lovable та Bolt — усі видають працюючий код. Інструменти для макетів (Visily, Uizard) і полотняні інструменти зупиняються раніше.</p>\n\n<p><strong>Чи мушу я використовувати Claude як модель?</strong> З Claude Design — так. З BYOK від Open Design ви приносите будь-яку OpenAI-сумісну модель — Claude, GPT, Gemini, DeepSeek чи самохостинг.</p>\n\n<p><strong>Де знайти той, що з відкритим кодом?</strong> Open Design є на <a href=\"https://github.com/nexu-io/open-design\">GitHub</a> і запускається локально; дивіться, <a href=\"/blog/why-we-built-open-design-as-a-skill-layer/\">чому ми побудували його як шар навичок</a>.</p>\n\n<h2>Підсумок</h2>\n\n<p>Claude Design — хороший інструмент із конкретною формою: закритий, хмарний, однамодельний, із підпискою в комплекті. Найкраща альтернатива для вас — та, що виправляє саме ту частину цієї форми, з якою ви не змогли жити. Якщо вам бракує функції, багато з них підійдуть. Якщо ж справа в прив'язці — до моделі, файлів чи середовища виконання — то єдине справжнє виправлення це відкритий варіант: <a href=\"/\">Open Design</a> — це ставка з відкритим кодом і агентоцентричністю на те, що наступне десятиліття дизайнерської роботи має належати вам, від запиту й аж до випущеного коду.</p>\n\n<p><em>Готові спробувати відкритий шлях? <a href=\"/download\">Відкрийте застосунок</a> або <a href=\"/plugins\">перегляньте бібліотеку навичок і дизайн-систем</a>.</em></p>"
>>>>>>> upstream/main
---

Claude Design is good. We've used it on real briefs. The fact that we [built an open-source layer](/blog/why-we-built-open-design-as-a-skill-layer/) instead isn't because Anthropic shipped a bad tool — they didn't. It's because closed-source, hosted-only, $20-to-$200-a-month design tooling is the wrong shape for the next decade of design work. This post is the honest read on Claude Design from a team that ships in the same category: what it is, where it locks you in, what the open-source alternative actually looks like, and which one you should pick this quarter.

## What Claude Design actually is

[Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) launched out of Anthropic Labs in April 2026. It's a conversational design tool powered by Claude Opus 4.7: chat on the left, canvas on the right. You describe what you want, Claude generates a design, and you iterate through comments, inline edits, and prompt refinements.

It does four things well:

- **Prototypes from prose.** Onboarding flows, settings pages, admin panels, checkout variants — five minutes from prompt to interactive screen.
- **Codebase awareness.** Import a GitHub repo or attach a local directory and the prototypes use your real components, your token system, your conventions.
- **Brand integration.** Set up a design system once and every project automatically picks up the colors, typography, and component patterns.
- **Handoff to Claude Code.** The "build this" button takes the prototype to production-ready code in the same browser tab.

Exports include Canva, PDF, PPTX, HTML, and standalone URLs. Pricing is bundled — Claude Pro at $20, Max at $100–$200, Enterprise at the usual call-us tier. It's currently a research preview for paying Claude subscribers.

If you read [the official tutorial](https://support.claude.com/en/articles/14604416-get-started-with-claude-design), the workflow Anthropic describes is the same one Open Design ships: a brief, a direction, an artifact, a handoff. The differences live one layer down.

## Where it locks you in

Claude Design carries four pieces of lock-in worth naming upfront, because the marketing pages don't.

**The model is fixed.** Every render goes through Claude. Not Claude *or* a model you've already paid for — just Claude. If your team has a contract with GPT, Gemini, or DeepSeek, or if you self-host on Ollama for sensitive briefs, those workflows don't translate. Token cost rides Anthropic's pricing curve forever.

**The runtime is hosted.** Your prompts, your design system, and your codebase context all travel to Anthropic's servers. For agency work or pre-launch creative under NDA, that's a procurement conversation every time. Self-hosted is not an option in the research preview, and the announcement does not commit to one.

**The skills are not yours.** Claude Design's behaviour is defined by prompts and tools that live inside Anthropic. You can't fork them, audit them, or replace one. The "skills" Anthropic is shipping in Claude Skills are adjacent but separate; the design-specific tooling is internal.

**The bill is a subscription.** $20–$200/month per seat is fine for a solo designer, painful for a team of twenty, and a non-starter for the dozen open-source contributors who would otherwise pick up the same workflow.

None of these are bugs in Claude Design. They are the shape of a hosted product. Anthropic optimised for the median Pro subscriber. We're not the median Pro subscriber.

<<<<<<< HEAD
<figure>
  <img src="/blog/plate-19-hosted-cloud.png" alt="A black faceted cloud solid tethered by a dashed line to a small ground anchor and server block, on a warm editorial study plate" />
  <figcaption>Hosted by default: your prompts, design system, and codebase context travel to someone else's servers.</figcaption>
</figure>
=======
**Key features**
- Apache-2.0, local-first, no signup — runs on `pnpm tools-dev`
- BYOK: bring any OpenAI-compatible model (Claude, GPT, Gemini, DeepSeek, or self-hosted)
- Auto-detects 16+ coding-agent CLIs already on your `$PATH` (Claude Code, Codex, Cursor, OpenCode, Qwen, and more)
- Ships to real code, not just mockups — design and code stay in one loop
- A library of skills and portable design systems out of the box
>>>>>>> upstream/main

## The open-source alternative

**Open Design** (this site) is a different bet. It's not a Claude Design clone — it's a thin skill layer that turns the coding agent you already use into a design engine. The four primitives are [skills, systems, adapters, and the daemon](/blog/31-skills-72-systems-how-the-library-works/). Every skill is a `SKILL.md` file. Every design system is a `DESIGN.md` file. Every agent adapter is ~80 lines of TypeScript.

What ships in the box today:

- **123 skills** — deck generators, mobile mockups, editorial pages, Word/Excel/PPT, brand explorations
- **148 design systems** — portable Markdown versions of Linear, Vercel, Stripe, Apple, Cursor, Figma, plus a long tail
- **16 coding-agent CLIs auto-detected** on your `$PATH` — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo
- **Four-step locked workflow** — question form → direction picker → live plan stream → sandboxed iframe preview
- **BYOK by default** — paste any OpenAI-compatible `base_url` and key, [your tokens go straight to the provider](/blog/byok-design-workflow-claude-codex-qwen/)
- **Apache-2.0, no signup, runs on `pnpm tools-dev`**

The mental model: Claude Design is a product. Open Design is a layer.

<figure>
  <img src="/blog/plate-20-model-lock.png" alt="Three black faceted polyhedra on a measured baseline, only one slotted into a bracket frame while the others sit loose, on a warm editorial study plate" />
  <figcaption>Claude Design fixes the model. The open path lets you bring the one you already pay for.</figcaption>
</figure>

## Side-by-side

| | **Claude Design** | **Open Design** |
|---|---|---|
| License | Proprietary | Apache-2.0 |
| Runtime | Hosted (Anthropic) | Local daemon (`pnpm tools-dev`) + optional Vercel deploy |
| Models | Claude only | Any OpenAI-compatible endpoint + 16 detected CLIs |
| Skills | Internal | 123 forkable `SKILL.md` folders |
| Design systems | Per-project brand setup | 148 portable `DESIGN.md` files |
| Codebase context | GitHub import + local | Skill-level, real working directory |
| Pricing | $20 / $100 / $200 / Enterprise | Free; you pay your model provider directly |
| Handoff | Claude Code (in-app) | Any agent on `$PATH`, plus HTML / PDF / PPTX / ZIP exports |
| Self-hostable | No | Yes (laptop or Vercel) |
| Data path | Prompts → Anthropic | Prompts → your chosen provider; nothing through us |

The honest summary: Claude Design has the most polished single-product experience. Open Design trades the polished single-product surface for a library — more skills, more systems, more agents, designed to compose with the agent already on your laptop.

<figure>
  <img src="/blog/plate-21-layer-stack.png" alt="Three thin black slabs stacked with visible gaps like a layer stack in isometric, dimension ticks marking the gaps, an olive leaf on top, on a warm editorial study plate" />
  <figcaption>A product and a layer — Open Design sits between your agent and the design work.</figcaption>
</figure>

## Who should pick what

| If you are… | Pick |
|---|---|
| A solo PM at a company already on Claude Pro who needs a prototype before lunch | **Claude Design.** The $20/month is sunk; the interface is genuinely fast. |
| An enterprise design team where Anthropic already cleared procurement | **Claude Design.** You've paid the integration cost once; spend it. |
| A solo designer who wants "Claude Design but free" | **Open Design.** Free, and you own the workflow instead of renting it — point it at a model you already pay for and the first deck takes about ten minutes. |
| A design engineer who already drives Claude Code, Codex, or Cursor from the terminal | **Open Design.** Your agent is the design engine; the skill layer adds taste and structure without a new app. |
| Anyone who needs BYOK, model choice mid-project, or local-only for sensitive briefs | **Open Design.** [The reality is rougher than the marketing](/blog/byok-reality-check-5-things-that-break/), but the contract is the only one that actually holds. |
| An open-source contributor who wants to ship a new design skill the project can adopt | **Open Design.** Drop a folder, restart the daemon, send the PR. |
| A team standardising on a portable design system that survives tool churn | **Open Design.** `DESIGN.md` files outlive the tool that reads them. |

The dimension that decides it for most teams isn't quality. It's whether you'd rather rent the workflow or own it.

## What to do next

If you want to see what owning the workflow feels like before you spend a Pro subscription, run the three-command quickstart and point it at the model you already pay for. The whole thing lives in one repo and the first deck takes about ten minutes.

[Try the open-source workflow](https://github.com/nexu-io/open-design/releases).

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "layer, not product" bet
- [BYOK design workflow — run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — the cost math behind picking your own model
- [BYOK reality check — five things that break](/blog/byok-reality-check-5-things-that-break/) — what the open path actually breaks today, and the workarounds
