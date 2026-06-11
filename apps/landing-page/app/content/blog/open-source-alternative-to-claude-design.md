---
title: "The open-source alternative to Claude Design"
date: 2026-05-14
category: "Guides"
readingTime: 7
summary: "Claude Design is good. It's also closed-source, hosted-only, and bundled with a Claude subscription. Here's the honest read on when to pick it — and when the open-source path wins."
i18n:
  zh:
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

<figure>
  <img src="/blog/plate-19-hosted-cloud.png" alt="A black faceted cloud solid tethered by a dashed line to a small ground anchor and server block, on a warm editorial study plate" />
  <figcaption>Hosted by default: your prompts, design system, and codebase context travel to someone else's servers.</figcaption>
</figure>

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
