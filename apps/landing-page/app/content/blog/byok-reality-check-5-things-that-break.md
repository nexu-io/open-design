---
title: "BYOK reality check: 5 things that break in Open Design today"
date: 2026-05-14
category: "Guides"
readingTime: 9
summary: "We promised BYOK as first-class. Five open bug threads from this week — Gemini, DeepSeek, OpenCode, Windows — show where the seams are still rough, and what to use until each fix lands."
i18n:
  zh:
    title: "BYOK 现实检验：Open Design 当下会出问题的 5 件事"
    summary: "我们承诺把 BYOK 作为一等公民。本周来自社区的五个开放 bug 讨论——Gemini、DeepSeek、OpenCode、Windows——揭示了接缝仍然粗糙的地方，以及在每个修复落地前该用什么替代方案。"
    bodyHtml: |
      <p>我们一直在告诉大家，Open Design 从底层就是 BYOK 的。这话现在依然成立。<a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流</a> 的开篇之作走了一遍可用路径——把 daemon 指向任意兼容 OpenAI 的端点，粘贴你的密钥，就完成了。对绝大多数配置来说，这就是故事的全部，而且会一直是故事的全部。</p>
      <p>但「BYOK」不是单一的一个功能。它是一份延伸进聊天编辑器、finalize 端点、模型选择器、CLI 启动路径和分析层的契约。其中每一处都是契约可能破裂的地方——而眼下，其中有好几处正是我们 <a href="https://github.com/nexu-io/open-design/issues">公开 issue 跟踪器</a> 里的开放 issue，是用户在过去 48 小时内报上来的。</p>
      <p>我们本可以写完那篇开篇之作就此打住。但相反，这里来一次诚实的检视：本周进来的那些讨论、什么坏了、为什么坏、今天该怎么办，以及哪个 PR（或哪个路线图档位）正在修它。这些没有一个是藏着掖着的。它们都已立案、打了标签、链接在下面——比起让你在某个周五做 deck 做到一半才撞见它们，我们宁愿你从我们这里读到它们。</p>
      <h2>承诺 vs bug 清单</h2>
      <p>这个定调很重要，因为很容易误读成「BYOK 半生不熟」。它不是。下面这五个里没有一个是「BYOK 不工作」的 bug。它们每一个都活在边界上——一边是我们自己拥有的 adapter（兼容 OpenAI 的那一层、模型选择器、finalize 路径），另一边是我们不拥有的：上游服务商的 CLI、他们的打包选择，或宿主平台的进程模型。</p>
      <p>那条边界，是任何开源 CLI 编排器里「现实」所在的地方。我们不运行推理，我们不为每个服务商交付一个 fork 出来的 CLI，我们也不把一切包进一个把棱角抹平（同时悄悄给你的 token 征税）的代理里。这种姿态的代价就是：当某个服务商的 CLI 改了形态，或者 Windows 强加了一条 macOS 没有的限制时，接缝就会显出来。这一周，五道这样的接缝同时显了出来。</p>
      <p>下面是全部五个，按它们进来的先后顺序排列。</p>
      <h2>Gemini 在通往「Finish Design」的路上迷了路</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> —— <code>bug</code>，开放中</strong></p>
      <h3>症状</h3>
      <p>为 Gemini 配置好了 BYOK。Settings 里的连接测试成功了。模型选择器返回了 Gemini 模型。常规聊天能用——你能用自己的 Gemini 密钥毫无障碍地撑起一整段对话。但用户一点 <strong>Finish Design</strong>，daemon 就抛出一个 Anthropic 形态的错误，仿佛它突然忘了自己在跟哪个服务商说话。</p>
      <h3>为什么会这样</h3>
      <p>该讨论里维护者的回复证实了这一点：常规 API 模式聊天从头到尾都遵循选中的 Gemini BYOK 服务商，但 Finish Design 还没有被推广到 Anthropic 兼容的 finalize 路径之外。其余一切都走那个识得服务商的代理，它知道怎么讲每个上游各自的方言。而 Finish Design 仍然走一个遗留自更早版本的、硬编码的 Anthropic finalize 端点——所以一个以非 Anthropic 形态到达的 Gemini 响应就把解析器绊倒了。</p>
      <h3>变通办法</h3>
      <p>把 Gemini 经由 OpenRouter、放在 Anthropic 兼容的服务商槽位下来路由。这样 Finish Design 路径看到的就是一个从 OpenRouter 垫片回来的 Anthropic 形态响应，于是能正确地 finalize。这多了一跳，而且你付的是 OpenRouter 的路由费、而非直接调用 Gemini，但它今天是稳定的，并且只覆盖那条坏掉的路径，而不碰那条已经能用的聊天路径。</p>
      <h3>谁在修它</h3>
      <p>Finish Design 的推广现在以 P1 列在 BYOK 路线图上。目前还没有 PR——这是 daemon 团队接下来要拿起的事，而且它是这五个里唯一一个属于我们完全拥有的代码里的缺陷，而非边界不匹配。</p>
      <h2>Gemini 3 Flash 在 Windows 上还没等 prompt 落地就死了</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> —— <code>bug</code>，开放中</strong></p>
      <h3>症状</h3>
      <p>Gemini 3 Flash Preview 在 Windows 上的 Open Design 里失败，大约 1.5 秒后报 <code>stdin: write EOF</code>——还没等 prompt 抵达模型。同一套安装里 Gemini 3 Pro 工作正常。而直接的 Gemini CLI（<code>gemini --model gemini-3-flash-preview ...</code>）在设了 <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> 时是成功的。所以问题不在密钥、不在账户，单独看也不在 CLI。</p>
      <h3>为什么会这样</h3>
      <p>这次诊断花了两轮，值得展示一下，因为它是这类问题如何被理清的一个好例子。对报告者截图的第一遍解读看起来像是一个上游的 <code>429 RESOURCE_EXHAUSTED</code> 配额错误。在一次干净的 PowerShell 复现把 <code>OD_GEMINI_3_FLASH_OK</code> 写到 stdout 之后，画面变了：模型是可达的，CLI 是健康的，失败恰恰发生在 Open Design → Gemini CLI 的启动路径上，并且专门针对 Windows 上的 Flash 变体。Pro 走的是同一条启动路径却活下来了；Flash 没有。</p>
      <h3>变通办法</h3>
      <p>在模型选择器里选 Gemini 3 Pro Preview。它走同样的启动路径并且能用。另外——这一点比 bug 本身还耗时间——检查一下 <code>~/.gemini/hooks/</code>。在这位用户的情况里，一个慢吞吞的 <code>gsd-check-update.js</code> hook（<code>Hook execution error: Hook timed out after 60000ms</code>）给每次运行平添了大约 104 秒的开销，这跟 Flash 的失败完全无关。无论如何都把你的 Gemini hook 清理干净；一个卡住的更新检查 hook 会让任何 agent 感觉像是坏了。</p>
      <h3>谁在修它</h3>
      <p>已标记为 Flash 专属、且属 OD 侧。对 daemon 的 stdin 写入路径的调查正在进行中——<code>write EOF</code> 意味着子进程的 stdin 在 daemon 写完 prompt 之前就关了，所以修复在于这个特定变体是如何被 spawn 出来的。</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="一张检查清单矩阵，有些行通过、有几行显示破裂标记，在近白色的编辑风底纹上被绿色框选中">
        <figcaption>五道诚实的接缝——每一道都活在我们拥有的 adapter 与我们不拥有的 CLI 之间的边界上。</figcaption>
      </figure>
      <h2>DeepSeek TUI 在 Windows 上有一道 30 KB 的 prompt 上限</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> —— <code>bug</code>，开放中</strong></p>
      <h3>症状</h3>
      <p>在一个 Windows 打包构建里的 DeepSeek wrapper v0.8.33 上，一个较长的组装 prompt 没能通过我们的预检守卫，报 <code>81397 &gt; 30000 bytes</code>。用户什么都没做错——他们只是组了一个足够丰富的 prompt（系统上下文、设计系统、参考资料），结果越过了 30 KB。</p>
      <h3>为什么会这样</h3>
      <p>那道守卫是刻意设的，它正在保护你免于一个更糟的错误。DeepSeek TUI adapter 目前把 prompt 作为一个位置式命令行参数发送——绑定在 argv 上——而 Windows 给整条命令行设的上限远低于 macOS 和 Linux 的。没有这道预检的话，同样的 prompt 会在更靠后、spawn 更深处的地方失败，报一个有用得多的 <code>ENAMETOOLONG</code> 错误都谈不上，更没有任何提示说原因是 prompt 体积。所以我们提前失败，并把那个数字报出来。这个 issue 暴露出来的不匹配在文档里：高层指引暗示 Windows 的长 prompt 回退方案广泛适用，但 DeepSeek TUI 这条路径还没有一个——它的传输仍是 argv，而不是 stdin 或一个 prompt 文件。</p>
      <h3>变通办法</h3>
      <p>如果你在 Windows 上用 DeepSeek TUI adapter，就把组装出来的 prompt 控制在 30 KB 以下，或者切到一个基于 stdin 的 adapter——Claude Code、Codex 和 OpenCode 都通过 stdin 接收 prompt，没有可比的上限。在 macOS 和 Linux 上这个 issue 根本不会咬到你；那里的 argv 上限足够高，现实世界里的 prompt 触不到它。</p>
      <h3>谁在修它</h3>
      <p>正确的修法是给 DeepSeek TUI adapter 做一个 stdin 或 prompt 文件传输，这样能彻底去掉 argv 上限，让它与那些 stdin adapter 看齐。它已在 adapter 团队的队列里跟踪。</p>
      <h2>OpenCode 本地 CLI 测试在模型热起来之前就超时了</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> —— <code>bug</code>、<code>priority:p0</code>，开放中</strong></p>
      <h3>症状</h3>
      <p>在 Settings → BYOK → OpenCode 里，连接测试稳定地在 45 秒处超时。奇怪的地方是：如果用户先打开 OpenCode Desktop 的终端、在那里挂上一个本地 LLM，那么同一个 Open Design 测试在下一次尝试时就会成功。</p>
      <h3>为什么会这样</h3>
      <p>「先打开 Desktop 终端」这个细节就是全部线索。Open Design 不会附着到一个正在运行的 OpenCode Desktop 会话上。为了做一次 Settings 烟雾测试，daemon 会 spawn 它自己全新的 OpenCode CLI 子进程，并等待一个 <code>ok</code> 回复。对一个冷的本地模型——一个还没被加载进内存的——来说，那第一个回复可能比 45 秒的预算还要久，因为模型正从磁盘里被读出来、被热起来，然后才能回答任何东西。打开 Desktop 终端、让它回答一个 prompt，会以一种 daemon 全新子进程随后能立刻受益的方式，把模型热进操作系统缓存。所以这其实不是 OpenCode 的 bug；它是一个对本地模型而言错误的冷启动时序假设。</p>
      <h3>变通办法</h3>
      <p>在 Open Design 里测试 OpenCode 之前，先打开 OpenCode Desktop，挂上你的本地 LLM，让它回答一个 prompt。然后再跑 OD 的连接测试——模型是热的，回复落在预算之内。从 v0.7.0 起，连接测试的预算也是可配置的，所以如果你的本地模型加载确实慢，你可以调高那个时间窗，而不必手动去热它。</p>
      <h3>谁在修它</h3>
      <p>daemon 侧的修复是专门为本地模型 adapter 设一个更长或可配置的热身窗口，这样一个冷的本地模型就不会被用跟托管 API 一样的钟来评判。它以 p0 跟踪——是这五个里优先级最高的，因为本地模型用户恰恰是 BYOK 想要服务的那群人。</p>
      <h2>打包好的 web 应用拒绝在纯 HTTP 上加载</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> —— <code>bug</code>，开放中</strong></p>
      <h3>症状</h3>
      <p>稍微不同的 bug，同一族。报告者在一个局域网 IP 上、通过纯 HTTP 运行打包好的 web 应用，页面在加载时就抛错——它从未到达一个可用状态。</p>
      <h3>为什么会这样</h3>
      <p>在 PR #1428 之后，分析提供器和 PDF 导出 nonce 开始直接调用 <code>crypto.randomUUID()</code>，绕过了 PR #900 引入的那个分级辅助函数——后者会在安全 crypto API 不可用时优雅回退。Chromium 不在非安全上下文中暴露 <code>crypto.randomUUID</code>——而一个裸的局域网 IP 加纯 HTTP，按 Chromium 的定义，就不是安全上下文。于是这个直接调用在加载时抛错，页面也随之倒下。它严格来说不是一个 BYOK bug，但它咬的恰恰是同一群人：那些运行自己基础设施的人，常常是气隙隔离的，常常用纯 HTTP，因为为一个内部工具立一张证书不值那个麻烦。</p>
      <h3>变通办法</h3>
      <p>通过 HTTPS 或通过 <code>localhost</code> 来提供这个 web 应用。两者都满足 Chromium 的安全上下文要求——<code>localhost</code> 即使没有证书也被视为安全——页面就能正常加载。对于一个快速的内部搭建，<code>localhost</code> 是零成本的路；对于局域网访问，一张通过 HTTPS 的自签名证书是更耐久的那条。</p>
      <h3>谁在修它</h3>
      <p>PR #1621 把剩下的调用点重新导回 PR #900 的那个分级 UUID 辅助函数，这样安全上下文回退就处处适用了，而不只是在它已经接好线的地方。它已开放、正在审查中。</p>
      <h2>这件事对 Open Design 里的 BYOK 究竟说明了什么</h2>
      <p>把这份清单当作一张契约地图来读，而不是一张质量判决书。这五个 issue 里有四个坐落在 adapter 边界上——Gemini 的 CLI 启动路径、DeepSeek 绑定 argv 的 CLI 传输、OpenCode 的冷启动启动模型、宿主平台的安全上下文规则。第五个，也就是 Finish Design 那个，在我们自己的 finalize 端点上——一个版本之前我们在那里硬编码了一个 Anthropic 形态的响应，至今还没把它推广开。那一个怪我们；另外四个是你为尊重那些不是你造的工具而付的税。</p>
      <p>而这正是结构性的要点。每一个不是换了马甲的代理的 BYOK 系统，最终都会走到这里。你要么自己拥有推理——然后失去 BYOK，因为现在是你在买 token 并给它们加价——要么尊重上游工具、并继承它们的棱角：它们的 CLI、它们的打包怪癖、它们各自处理方式不同的平台限制。我们 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">刻意选了第二种姿态</a>，而且我们还会再选一次。代价就是像这样的一些星期：daemon 和 adapter 团队在两天里横跨五个面立了案。</p>
      <p>这笔交换依然是对的。一套跑在 Claude Code、Codex、Cursor、macOS 上的 Gemini Pro 以及 Linux 上的 DeepSeek 之上的配置——这个矩阵覆盖了我们大约 90% 的真实用户——今天就干净地运行着，没有代理税，也没有在你的 token 上加价。上面那五个讨论就是这个矩阵的另外 10% 在 2026 年 5 月中旬的样子：被点了名、立了案，且每一个都有修复在路上。诚实的接缝胜过一张把账单去向藏起来的光滑表面。</p>
      <h2>今天该用什么（矩阵）</h2>
      <p>这是上一节的实用版——同样的五道接缝，对照到此刻可以放心去用的东西。一个 ✓ 表示这条路径原样可用；一个 ✗ 链接到阻塞它的那个 issue，变通办法在对应的小节里。</p>




































































      <table><thead><tr><th>服务商</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish Design 路径</th></tr></thead><tbody><tr><td>Claude Code（Sonnet / Opus）</td><td>✓</td><td>✓</td><td>✓</td><td>原生</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>原生</td></tr><tr><td>Cursor（BYOK）</td><td>✓</td><td>✓</td><td>✓</td><td>原生</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter 垫片（<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>）</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗（<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>）</td><td>OpenRouter 垫片（<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>）</td></tr><tr><td>DeepSeek（API）</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter 垫片</td></tr><tr><td>DeepSeek TUI（长 prompt）</td><td>✓</td><td>✓</td><td>✗（<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>）</td><td>OpenRouter 垫片</td></tr><tr><td>OpenCode（本地模型）</td><td>✓</td><td>✓</td><td>✓（先热起来，<a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>）</td><td>不适用</td></tr></tbody></table>
      <p>这张表有两种读法。如果你的技术栈在全 ✓ 的那一块里——Claude Code、Codex、Cursor 或 Gemini Pro——你就在干净的路上，上面这些没有一条会改变你的日常。如果你在某一个 ✗ 的行上，对应的小节里有让你今天就跑起来的变通办法，同时所链接的修复也在落地途中。无论哪种情况，如果你想在某一行从 ✗ 翻成 ✓ 时收到通知，就去订阅 <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">跟踪器上的 BYOK 标签</a>。</p>
      <h2>接下来该做什么</h2>
      <p>Open Design 的 <a href="https://github.com/nexu-io/open-design/tree/main/skills">skill 库</a> 是这一切底下那个干活的层——一旦连接健康，BYOK adapter 就把数据喂进这些文件驱动的契约里。上面那些接缝讲的是怎么把字节从你的密钥送到模型再送回来；而 skill 才是模型拿这些字节真正去做的事。如果你想看看一个 skill 从模型那里消费什么、又对什么毫不在意——这也正是为什么这些 adapter 的棱角不改变输出、只改变你能否够到它——那个目录就是合适的起点。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">浏览 skill 库</a>。</p>
      <h2>延伸阅读</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流：用你自己的密钥运行 Claude、Codex 或 Qwen</a>——最初那篇 BYOK 讲解，以及上面那五道接缝所处边缘的那条可用路径</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 构建成一个 skill 层、而不是一款产品</a>——我们为什么尊重上游工具、而不是把它们包进一个代理里，这正是这些边界存在的全部原因</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 个 skill、72 个 system——库是怎么运作的</a>——一旦连接健康，BYOK 究竟把数据喂进了什么</li>
      </ul>
  zh-tw:
    title: "BYOK 現實檢驗：Open Design 今天會出問題的 5 件事"
    summary: "我們承諾 BYOK 是一等公民。本週的五個開放 bug 討論串——Gemini、DeepSeek、OpenCode、Windows——顯示出接縫還粗糙的地方，以及在每項修復落地前該改用什麼。"
    bodyHtml: |
      <p>我們一直告訴大家 Open Design 從根基起就是 BYOK。這仍然是真的。<a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流程</a>那篇種子文走過了那條可運作的路徑——把 daemon 指向任何 OpenAI 相容的端點，貼上你的金鑰，就完成了。對大多數的設定組態而言，這就是全部的故事，而且會一直是全部的故事。</p>
      <p>但「BYOK」不是單一一個功能。它是一份延伸進聊天輸入框、最終化端點、模型選擇器、CLI 啟動路徑和分析層的契約。其中每一處都是這份契約可能出問題的地方——而現在，其中好幾處都是我們<a href="https://github.com/nexu-io/open-design/issues">公開追蹤器</a>裡的開放 issue，由使用者在過去 48 小時內回報。</p>
      <p>我們大可以寫完那篇種子文就此打住。但相反地，這裡是誠實的一輪盤點：本週進來的討論串、什麼會出問題、為什麼出問題、今天該怎麼做，以及哪個 PR（或路線圖位置）正在修它。這些沒有一項是藏起來的。它們都已歸檔、貼上標籤，並連結在下方——而且比起讓你在某個星期五做簡報做到一半才發現，我們寧可你從我們這裡讀到它們。</p>
      <h2>承諾 vs bug 清單</h2>
      <p>這個框架很重要，因為一個容易的誤讀是「BYOK 半生不熟」。它不是。下面這五項沒有一項是「BYOK 不能用」的 bug。它們每一項都活在我們所擁有的某個轉接器——OpenAI 相容層、模型選擇器、最終化路徑——與我們不擁有的某個東西之間的邊界上：上游供應商的 CLI、他們的封裝選擇，或主機平台的行程模型。</p>
      <p>在任何開源 CLI 編排器裡，那個邊界正是現實所在之處。我們不跑推論、不為每家供應商出貨一個分支版 CLI，也不把一切包進一個把邊角抹平（同時悄悄對你的 token 課稅）的代理裡。採取那種立場的代價就是：當某家供應商的 CLI 換了形態，或當 Windows 強制了一個 macOS 沒有的限制時，接縫就會顯現出來。本週，這些接縫有五處同時顯現了。</p>
      <p>以下是全部五項，依它們進來的順序排列。</p>
      <h2>Gemini 在前往「Finish Design」的路上迷了路</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>，開放中</strong></p>
      <h3>症狀</h3>
      <p>BYOK 已為 Gemini 設定好。設定裡的測試連線成功。模型選擇器回傳 Gemini 模型。一般聊天可以運作——你可以毫無困難地用你自己的 Gemini 金鑰進行一整段對話。但使用者一按下 <strong>Finish Design</strong> 的那一刻，daemon 就丟出一個 Anthropic 形態的錯誤，彷彿它突然忘了自己正在跟哪個供應商對話。</p>
      <h3>為什麼會發生</h3>
      <p>討論串上維護者的回覆確認了這一點：一般 API 模式聊天從頭到尾尊重所選的 Gemini BYOK 供應商，但 Finish Design 尚未被一般化到 Anthropic 相容最終化路徑之外。其他一切都路由穿過那個了解每家上游方言怎麼講的供應商感知代理。Finish Design 仍然走一個從早期版本遺留下來、寫死的 Anthropic 最終化端點——所以一個以非 Anthropic 形態抵達的 Gemini 回應就絆倒了剖析器。</p>
      <h3>因應作法</h3>
      <p>把 Gemini 透過 OpenRouter 路由，放在 Anthropic 相容供應商位置下。Finish Design 路徑接著就會看到一個從 OpenRouter 墊片回來的 Anthropic 形態回應，並正確地最終化。這多了一跳，而且你付的是 OpenRouter 的路由費而不是直接呼叫 Gemini，但它今天是穩定的，而且它涵蓋了那條壞掉的路徑，又不會去碰那條已經能運作的聊天路徑。</p>
      <h3>誰在修它</h3>
      <p>Finish Design 的一般化現在以 P1 列在 BYOK 路線圖上。還沒有 PR——這是 daemon 團隊接下來要接手的事，而且它是這五項裡唯一一個屬於我們完全擁有的程式碼中的瑕疵，而非邊界不匹配。</p>
      <h2>Gemini 3 Flash 在 Windows 上於提示送達之前就死掉</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>，開放中</strong></p>
      <h3>症狀</h3>
      <p>Gemini 3 Flash Preview 在 Windows 上的 Open Design 內部約 1.5 秒後以 <code>stdin: write EOF</code> 失敗——在提示甚至還沒抵達模型之前。Gemini 3 Pro 在完全相同的安裝裡運作正常。而直接的 Gemini CLI（<code>gemini --model gemini-3-flash-preview ...</code>）在設定了 <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> 時會成功。所以這不是金鑰、不是帳號、也不是 CLI 本身的問題。</p>
      <h3>為什麼會發生</h3>
      <p>這個診斷花了兩輪，值得展示出來，因為它是這些問題如何被理清的一個好例子。對回報者截圖的第一輪解讀，看起來像是一個上游的 <code>429 RESOURCE_EXHAUSTED</code> 配額錯誤。在一次乾淨的 PowerShell 重現、把 <code>OD_GEMINI_3_FLASH_OK</code> 寫到 stdout 之後，畫面變了：模型是可達的、CLI 是健康的、失敗特定發生在 Open Design → Gemini CLI 啟動路徑上，而且它特定於 Windows 上的 Flash 變體。Pro 走同一條啟動路徑卻能存活；Flash 不行。</p>
      <h3>因應作法</h3>
      <p>在模型選擇器裡選 Gemini 3 Pro Preview。它跑同一條啟動路徑而且能運作。另外——而這一段比 bug 本身花了更多時間——檢查 <code>~/.gemini/hooks/</code>。一個緩慢的 <code>gsd-check-update.js</code> hook（<code>Hook execution error: Hook timed out after 60000ms</code>）在這位使用者的情況下，對每次執行都加上了大約 104 秒的額外開銷，這跟 Flash 失敗完全無關。無論如何都清理你的 Gemini hook；一個卡住的更新檢查 hook 會讓任何 agent 感覺像壞了。</p>
      <h3>誰在修它</h3>
      <p>已標記為 Flash 特有且屬 OD 這一側。調查正在 daemon 的 stdin 寫入路徑上進行中——那個 <code>write EOF</code> 表示子行程的 stdin 在 daemon 完成寫入提示之前就關閉了，所以修復就落在那個特定變體是怎麼被生成（spawn）的這件事上。</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="一個檢查清單矩陣，有些列通過、有幾列顯示斷裂標記，被一個綠色框選中，襯在近白色的編輯風底色上">
        <figcaption>五道誠實的接縫——每一道都活在我們所擁有的轉接器與我們不擁有的 CLI 之間的邊界上。</figcaption>
      </figure>
      <h2>DeepSeek TUI 在 Windows 上有一個 30 KB 的提示上限</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>，開放中</strong></p>
      <h3>症狀</h3>
      <p>在 Windows 封裝版建置裡的 DeepSeek wrapper v0.8.33 上，一個冗長的組合提示以 <code>81397 &gt; 30000 bytes</code> 沒能通過我們的飛行前防護。使用者沒做錯任何事——他們只是組了一個夠豐富的提示（系統背景、設計系統、參考資料）而越過了 30 KB。</p>
      <h3>為什麼會發生</h3>
      <p>那個防護是刻意的，而且它正在保護你免於一個更糟的錯誤。DeepSeek TUI 轉接器目前把提示當作一個位置式命令列引數來送——綁在 argv 上——而 Windows 把命令列總長度限制在遠低於 macOS 和 Linux 的地方。沒有這道飛行前檢查的話，同一個提示稍後會在生成過程更深的地方失敗，丟出一個有用得多的 <code>ENAMETOOLONG</code> 錯誤，而且完全沒提示原因是提示大小。所以我們選擇提早失敗並指明那個數字。這個 issue 暴露出的不匹配是在文件上：高層次的指引暗示 Windows 長提示的回退作法廣泛適用，但 DeepSeek TUI 路徑還沒有一個——它的傳輸仍是 argv，而不是 stdin 或一個提示檔案。</p>
      <h3>因應作法</h3>
      <p>如果你在 Windows 上用 DeepSeek TUI 轉接器，把組合提示維持在 30 KB 以下，或者改用一個基於 stdin 的轉接器——Claude Code、Codex 和 OpenCode 都透過 stdin 接收它們的提示，而且沒有可相比的上限。在 macOS 和 Linux 上，這個 issue 完全不會咬到你；那裡的 argv 限制高到現實世界的提示碰不到。</p>
      <h3>誰在修它</h3>
      <p>正確的修法是為 DeepSeek TUI 轉接器做一個 stdin 或提示檔案傳輸，它會完全移除 argv 上限，並讓它與那些 stdin 轉接器看齊。它已列在轉接器團隊的佇列上追蹤。</p>
      <h2>OpenCode 的本機 CLI 測試在模型暖機之前就逾時</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>、<code>priority:p0</code>，開放中</strong></p>
      <h3>症狀</h3>
      <p>在「設定 → BYOK → OpenCode」裡，連線測試穩定地在 45 秒逾時。奇怪的部分是：如果使用者先打開 OpenCode Desktop 的終端機，並在那裡接上一個本機 LLM，那麼同一個 Open Design 測試在下一次嘗試時就會成功。</p>
      <h3>為什麼會發生</h3>
      <p>「先打開 Desktop 終端機」這個細節就是整條線索。Open Design 不會去接上一個正在執行的 OpenCode Desktop 工作階段。為了一次設定冒煙測試，daemon 會生成它自己全新的 OpenCode CLI 子行程，並等待一個 <code>ok</code> 回覆。在一個冷的本機模型——一個還沒被載入記憶體的模型——那第一個回覆可能會花上比 45 秒預算更久的時間，因為模型正從磁碟讀取並暖機，才能回答任何東西。打開 Desktop 終端機並讓它回答一個提示，會以一種 daemon 全新子行程隨後可以立即受益的方式，把模型暖進 OS 快取裡。所以這其實不是 OpenCode 的 bug；它是一個對本機模型而言錯誤的冷啟動時間假設。</p>
      <h3>因應作法</h3>
      <p>在 Open Design 裡測試 OpenCode 之前，先打開 OpenCode Desktop、接上你的本機 LLM，並讓它回答一個提示。然後再跑 OD 連線測試——模型已經暖了，回覆會落在預算之內。從 v0.7.0 起，連線測試的預算也是可設定的，所以如果你的本機模型真的載入得很慢，你可以調高那個時間視窗，而不必手動暖機。</p>
      <h3>誰在修它</h3>
      <p>daemon 這一側的修法是專門為本機模型轉接器做一個更長或可設定的暖機視窗，這樣一個冷的本機模型就不會被拿來用跟代管 API 同一個時鐘來評判。它以 p0 追蹤——這五項裡最高的優先級，因為本機模型使用者正是 BYOK 應該服務的受眾。</p>
      <h2>封裝版 web app 拒絕透過純 HTTP 載入</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>，開放中</strong></p>
      <h3>症狀</h3>
      <p>稍微不同的 bug，同一個家族。回報者在一個 LAN IP 上透過純 HTTP 執行封裝版 web app，而頁面在載入時就丟出錯誤——它從未到達一個可用的狀態。</p>
      <h3>為什麼會發生</h3>
      <p>在 PR #1428 之後，分析供應商和 PDF 匯出 nonce 開始直接呼叫 <code>crypto.randomUUID()</code>，繞過了 PR #900 引入、會在安全 crypto API 不可用時優雅回退的分層輔助函式。Chromium 在非安全脈絡下不會曝露 <code>crypto.randomUUID</code>——而一個赤裸的 LAN IP 透過純 HTTP，依 Chromium 的定義，並不是一個安全脈絡。所以那個直接呼叫在載入時就丟出錯誤，而頁面也跟著倒下。它嚴格說來不是一個 BYOK 的 bug，但它咬的正是同一群受眾：那些執行自己基礎設施的人，常常是氣隙隔離（air-gapped）的，常常透過純 HTTP，因為為一個內部工具架起一張憑證並不值得那份麻煩。</p>
      <h3>因應作法</h3>
      <p>透過 HTTPS 或透過 <code>localhost</code> 來提供這個 web app。兩者都滿足 Chromium 的安全脈絡要求——<code>localhost</code> 即使沒有憑證也被視為安全——而頁面就會正常載入。對於一個快速的內部設定，<code>localhost</code> 是零成本的路徑；對於 LAN 存取，透過 HTTPS 的一張自簽憑證才是耐久的那條。</p>
      <h3>誰在修它</h3>
      <p>PR #1621 把剩下的那些呼叫點重新路由回 PR #900 那個分層的 UUID 輔助函式，這樣安全脈絡回退就會再次處處適用，而不只是適用於它原本就接好線的地方。它已開啟並在審查中。</p>
      <h2>這對 Open Design 裡的 BYOK 實際上說明了什麼</h2>
      <p>把這份清單當成一張契約地圖來讀，而不是一份品質裁決。這五個 issue 裡有四個坐落在轉接器邊界上——Gemini 的 CLI 啟動路徑、DeepSeek 綁在 argv 的 CLI 傳輸、OpenCode 的冷啟動啟動模型、主機平台的安全脈絡規則。第五個，也就是 Finish Design 那個，在我們自己的最終化端點上，我們一個版本前在那裡寫死了一個 Anthropic 形態的回應，而還沒把它一般化。那一個是我們的責任；其餘四個是你為了尊重你並未打造的工具而付的稅。</p>
      <p>而那正是結構性的重點。每一個不是換牌代理的 BYOK 系統最終都會走到這裡。你要嘛擁有推論——並失去 BYOK，因為現在是你在買 token 並加價了——要嘛尊重上游工具並繼承它們的邊角：它們的 CLI、它們的封裝怪癖、它們各自以不同方式處理的平台限制。我們<a href="/blog/why-we-built-open-design-as-a-skill-layer/">刻意選了第二種立場</a>，而且我們會再選一次。代價就是像本週這樣的週次，daemon 和轉接器團隊在兩天內橫跨五個載體歸檔了工作。</p>
      <p>這個取捨仍然是對的。一套在 macOS 上的 Claude Code、Codex、Cursor、Gemini Pro，以及 Linux 上的 DeepSeek 的可運作設定——這個涵蓋我們約 90% 實際使用者的矩陣——今天乾淨地運作，沒有代理稅、也沒有對你的 token 抽利潤。上面那五個討論串，就是這個矩陣裡另外那 10% 在 2026 年 5 月中旬的樣子：已命名、已歸檔，而且每一個都有一項修復在進行中。誠實的接縫勝過一個藏起帳單去向的光滑表面。</p>
      <h2>今天該用什麼（矩陣）</h2>
      <p>這是上面那一節的實務版本——同樣這五道接縫，對應到現在可以放心去用的東西。一個 ✓ 表示那條路徑現狀就能運作；一個 ✗ 連到正在擋住它的 issue，因應作法在相關章節裡。</p>




































































      <table><thead><tr><th>供應商</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish Design 路徑</th></tr></thead><tbody><tr><td>Claude Code（Sonnet / Opus）</td><td>✓</td><td>✓</td><td>✓</td><td>原生</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>原生</td></tr><tr><td>Cursor（BYOK）</td><td>✓</td><td>✓</td><td>✓</td><td>原生</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter 墊片（<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>）</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗（<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>）</td><td>OpenRouter 墊片（<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>）</td></tr><tr><td>DeepSeek（API）</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter 墊片</td></tr><tr><td>DeepSeek TUI（長提示）</td><td>✓</td><td>✓</td><td>✗（<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>）</td><td>OpenRouter 墊片</td></tr><tr><td>OpenCode（本機模型）</td><td>✓</td><td>✓</td><td>✓（先暖機，<a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>）</td><td>不適用</td></tr></tbody></table>
      <p>這張表有兩種讀法。如果你的技術堆疊在全 ✓ 的區塊裡——Claude Code、Codex、Cursor 或 Gemini Pro——你就在那條乾淨的路徑上，上面的一切都不會改變你的一天。如果你在某個 ✗ 的列上，對應的章節有那個讓你今天就能跑起來的因應作法，同時等連結的修復落地。無論如何，如果你想在某一列從 ✗ 翻成 ✓ 時收到通知，就訂閱<a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">追蹤器上的 BYOK 標籤</a>。</p>
      <h2>接下來該做什麼</h2>
      <p>Open Design 的<a href="https://github.com/nexu-io/open-design/tree/main/skills">技能函式庫</a>是這一切底下那一層在運作的層——一旦連線健康，BYOK 轉接器就會餵進去的那些檔案驅動契約。上面那些接縫是關於把位元組從你的金鑰送到模型再送回來；技能則是模型實際上拿它們去做什麼。如果你想看看一個技能從模型那裡消耗什麼、又不在乎什麼——這也正是為什麼這些轉接器邊角不會改變輸出，只會改變你能不能抵達它——那個目錄就是適合開始的地方。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">瀏覽技能函式庫</a>。</p>
      <h2>延伸閱讀</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 設計工作流程：用你自己的金鑰跑 Claude、Codex 或 Qwen</a>——最初的 BYOK 說明文，以及上面那五道接縫所在邊緣的那條可運作路徑</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為什麼把 Open Design 打造成一層技能層，而不是一個產品</a>——我們為什麼尊重上游工具而不是把它們包進一個代理裡，這正是這些邊界存在的全部原因</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 個技能、72 個系統——函式庫如何運作</a>——一旦連線健康，BYOK 實際上會餵進什麼</li>
      </ul>
  ja:
    title: "BYOK の現実チェック：今の Open Design で壊れる 5 つのこと"
    summary: "私たちは BYOK を第一級のものとして約束しました。今週上がってきた 5 つの未解決のバグスレッド ── Gemini、DeepSeek、OpenCode、Windows ── は、継ぎ目がまだ粗いのはどこか、そしてそれぞれの修正が届くまで何を使えばよいかを示しています。"
    bodyHtml: |
      <p>私たちは、Open Design が根本から BYOK であると人々に伝えてきました。それは今も本当です。<a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー</a>の種記事では、動く道筋を解説しています ── daemon を任意の OpenAI 互換エンドポイントに向け、キーを貼り付ければ完了です。大半のセットアップでは、それがすべてであり、これからもそれがすべてであり続けます。</p>
      <p>しかし「BYOK」は単一の機能ではありません。それはチャットコンポーザー、finalize エンドポイント、モデルピッカー、CLI の起動経路、そして分析レイヤーにまで及ぶ契約です。それぞれが契約の壊れうる場所であり ── 現在、そのいくつかは私たちの<a href="https://github.com/nexu-io/open-design/issues">公開トラッカー</a>で未解決の issue になっています。過去 48 時間にユーザーから報告されたものです。</p>
      <p>私たちは種記事を書いてそこで止めることもできました。代わりに、ここで正直に明かします：今週入ってきたスレッド、何が壊れるのか、なぜ壊れるのか、今日何をすべきか、そしてどの PR（あるいはロードマップの枠）がそれを修正しているのか。これらはどれも隠されていません。下にファイルされ、ラベルが付き、リンクされています ── そして金曜日のデッキ作成の最中に発見するより、私たちから読んでもらいたいのです。</p>
      <h2>約束 vs バグリスト</h2>
      <p>枠組みが重要です。なぜなら、安直な誤読は「BYOK は中途半端だ」だからです。そうではありません。下の 5 つはどれも「BYOK が動かない」というバグではありません。そのどれもが、私たちが所有するアダプター ── OpenAI 互換レイヤー、モデルピッカー、finalize 経路 ── と、私たちが所有しないもの：上流プロバイダーの CLI、彼らのパッケージングの選択、あるいはホストプラットフォームのプロセスモデル ── との境界に存在しています。</p>
      <p>その境界こそが、あらゆるオープンソースの CLI オーケストレーターにおいて現実が宿る場所です。私たちは推論を実行せず、プロバイダーごとにフォークした CLI を出荷せず、エッジを滑らかにし（そしてこっそりトークンに課税し）するプロキシですべてを包んだりしません。その姿勢の代償は、プロバイダーの CLI が形を変えたり、Windows が macOS にはない制限を課したりすると、継ぎ目が見えてしまうことです。今週は、その継ぎ目のうち 5 つが一度に見えました。</p>
      <p>5 つすべてを、入ってきた順に挙げます。</p>
      <h2>Gemini が「Finish Design」へ向かう途中で迷子になる</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>、open</strong></p>
      <h3>症状</h3>
      <p>BYOK が Gemini 向けに設定されている。設定の接続テストは成功する。モデルピッカーは Gemini のモデルを返す。通常のチャットは動く ── 自分の Gemini キーに対して問題なく完全な会話を続けられる。ところがユーザーが <strong>Finish Design</strong> を押した瞬間、daemon は Anthropic 形式のエラーを投げます。まるで、どのプロバイダーと話していたのかを突然忘れたかのように。</p>
      <h3>なぜ起きるのか</h3>
      <p>スレッド上のメンテナーの返信がそれを裏づけています：通常の API モードのチャットは選択された Gemini BYOK プロバイダーを端から端まで尊重しますが、Finish Design はまだ Anthropic 互換の finalize 経路を超えて一般化されていません。それ以外のすべては、各上流の方言を話す方法を知っているプロバイダー認識プロキシを経由してルーティングされます。Finish Design はまだ、以前のリリースから残るハードコードされた Anthropic の finalize エンドポイントを通っています ── そのため、非 Anthropic 形式で届く Gemini のレスポンスがパーサーを躓かせるのです。</p>
      <h3>回避策</h3>
      <p>Gemini を Anthropic 互換プロバイダーの枠の下で OpenRouter 経由でルーティングします。すると Finish Design の経路は OpenRouter のシムから返ってくる Anthropic 形式のレスポンスを見て、正しく finalize します。1 ホップ余分にかかり、Gemini を直接呼ぶのではなく OpenRouter のルーティングに支払うことになりますが、今日時点で安定しており、すでに動いているチャット経路に触れることなく、壊れている唯一の経路をカバーします。</p>
      <h3>誰が修正しているか</h3>
      <p>Finish Design の一般化は現在 BYOK ロードマップ上で P1 になっています。PR はまだありません ── これは daemon チームが次に取り上げるもので、5 つの中で唯一、境界の不一致ではなく、私たちが完全に所有するコードの欠陥です。</p>
      <h2>Gemini 3 Flash がプロンプトが届く前に Windows で死ぬ</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>、open</strong></p>
      <h3>症状</h3>
      <p>Gemini 3 Flash Preview は、Windows 上の Open Design 内で約 1.5 秒後に <code>stdin: write EOF</code> で失敗します ── プロンプトがモデルに届く前にです。Gemini 3 Pro はまったく同じインストールで問題なく動きます。そして直接の Gemini CLI（<code>gemini --model gemini-3-flash-preview ...</code>）は、<code>GEMINI_CLI_TRUST_WORKSPACE=true</code> が設定されていれば成功します。つまり、キーでもアカウントでも、CLI 単体でもありません。</p>
      <h3>なぜ起きるのか</h3>
      <p>診断には 2 段階かかりました。これらがどう解きほぐされるかの良い例なので示す価値があります。報告者のスクリーンショットの最初の読みは、上流の <code>429 RESOURCE_EXHAUSTED</code> クォータエラーのように見えました。<code>OD_GEMINI_3_FLASH_OK</code> を stdout に書き出すクリーンな PowerShell の再現の後、絵が変わりました：モデルには到達でき、CLI は健全で、失敗はまさに Open Design → Gemini CLI の起動経路にあり、それは Windows 上の Flash バリアントに固有です。Pro は同じ起動経路を通って生き延びますが、Flash は生き延びません。</p>
      <h3>回避策</h3>
      <p>モデルピッカーで Gemini 3 Pro Preview を選びます。同じ起動経路を通り、動きます。別件として ── そしてこの部分はバグそのものより時間を食いました ── <code>~/.gemini/hooks/</code> を確認してください。遅い <code>gsd-check-update.js</code> フック（<code>Hook execution error: Hook timed out after 60000ms</code>）が、このユーザーのケースでは実行ごとにおよそ 104 秒のオーバーヘッドを加えていました。Flash の失敗とはまったく無関係に、です。いずれにせよ Gemini のフックは掃除してください。止まった更新チェックフックは、どんなエージェントも壊れているように感じさせます。</p>
      <h3>誰が修正しているか</h3>
      <p>Flash 固有かつ OD 側としてフラグが立てられています。調査は daemon の stdin 書き込み経路で進行中です ── <code>write EOF</code> は、daemon がプロンプトを書き終える前に子プロセスの stdin が閉じたことを示しているので、修正はその特定のバリアントがどう spawn されるかに宿ります。</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="一部の行がパスし、いくつかは破断マークを示すチェックリストのマトリックスが、ほぼ白の編集的な地の上で緑のフレームに選択されている">
        <figcaption>5 つの正直な継ぎ目 ── そのそれぞれが、私たちが所有するアダプターと、私たちが所有しない CLI との境界に存在しています。</figcaption>
      </figure>
      <h2>DeepSeek TUI は Windows で 30 KB のプロンプト上限を持つ</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>、open</strong></p>
      <h3>症状</h3>
      <p>Windows のパッケージビルドにおける DeepSeek ラッパー v0.8.33 では、長い合成プロンプトが <code>81397 &gt; 30000 bytes</code> で私たちの事前チェックガードに失敗します。ユーザーは何も間違っていません ── ただ十分にリッチなプロンプト（システムコンテキスト、デザインシステム、参照）を合成して 30 KB を超えただけです。</p>
      <h3>なぜ起きるのか</h3>
      <p>そのガードは意図的なもので、より悪いエラーからあなたを守っています。DeepSeek TUI アダプターは現在、プロンプトを位置引数のコマンドライン引数として送ります ── argv に縛られている ── そして Windows はコマンドライン全体を macOS や Linux よりはるかに低いところで上限を設けます。事前チェックがなければ、同じプロンプトは後でもっと深い spawn の中で、はるかに役に立たない <code>ENAMETOOLONG</code> エラーで失敗し、原因がプロンプトサイズだという手がかりは何も得られません。だから私たちは早めに失敗させ、その数値を名指しします。この issue が露わにした不一致はドキュメントにあります：高レベルのガイダンスは Windows の長プロンプトのフォールバックが広く適用されるかのように示唆していますが、DeepSeek TUI の経路にはまだそれがありません ── その転送はまだ stdin やプロンプトファイルではなく argv なのです。</p>
      <h3>回避策</h3>
      <p>Windows で DeepSeek TUI アダプターを使っているなら、合成プロンプトを 30 KB 未満に保つか、stdin ベースのアダプターに切り替えてください ── Claude Code、Codex、OpenCode はどれもプロンプトを stdin 経由で受け取り、同等の上限はありません。macOS と Linux ではこの issue はまったく噛みつきません。そこでの argv の上限は十分に高く、現実世界のプロンプトが到達しないのです。</p>
      <h3>誰が修正しているか</h3>
      <p>正しい修正は DeepSeek TUI アダプターのための stdin またはプロンプトファイルの転送で、これは argv の上限を完全に取り除き、stdin アダプターと足並みをそろえます。アダプターチームのキューで追跡されています。</p>
      <h2>OpenCode のローカル CLI テストがモデルのウォームアップ前にタイムアウトする</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>、<code>priority:p0</code>、open</strong></p>
      <h3>症状</h3>
      <p>設定 → BYOK → OpenCode で、接続テストは確実に 45 秒でタイムアウトします。奇妙な点：ユーザーがまず OpenCode Desktop のターミナルを開いてそこでローカル LLM をアタッチすると、同じ Open Design のテストが次の試行で成功するのです。</p>
      <h3>なぜ起きるのか</h3>
      <p>その「まず Desktop ターミナルを開く」という細部が手がかりのすべてです。Open Design は実行中の OpenCode Desktop セッションにアタッチしません。設定のスモークテストでは、daemon は自前の新しい OpenCode CLI サブプロセスを spawn し、<code>ok</code> の応答を待ちます。コールドなローカルモデル ── まだメモリに読み込まれていないもの ── では、その最初の応答が 45 秒の予算より長くかかることがあります。モデルが何かに答えられるようになる前にディスクから読み出され、ウォームアップされるからです。Desktop ターミナルを開いて 1 つのプロンプトに答えさせると、daemon の新しいサブプロセスがすぐに恩恵を受けられる形で、モデルが OS キャッシュ内でウォームになります。だからこれは本当は OpenCode のバグではなく、ローカルモデルにとって間違っているコールドスタートのタイミングの仮定なのです。</p>
      <h3>回避策</h3>
      <p>Open Design で OpenCode をテストする前に、OpenCode Desktop を開き、ローカル LLM をアタッチし、1 つのプロンプトに答えさせてください。それから OD の接続テストを実行します ── モデルがウォームになり、応答が予算内に届きます。v0.7.0 以降、接続テストの予算は設定可能にもなっているので、ローカルモデルの読み込みが本当に遅い場合は、手作業でウォームアップする代わりにウィンドウを広げられます。</p>
      <h3>誰が修正しているか</h3>
      <p>daemon 側の修正は、ローカルモデルのアダプター専用の、より長い、あるいは設定可能なウォームアップウィンドウで、コールドなローカルモデルがホスト型 API と同じ時計で判定されないようにするものです。p0 で追跡されています ── 5 つの中で最高の優先度です。なぜなら、ローカルモデルのユーザーこそ BYOK が奉仕すべきまさにそのオーディエンスだからです。</p>
      <h2>パッケージ化された web アプリがプレーン HTTP 上での読み込みを拒否する</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>、open</strong></p>
      <h3>症状</h3>
      <p>少し違うバグですが、同じ系統です。報告者はパッケージ化された web アプリを LAN IP 上でプレーン HTTP で実行しており、ページが読み込み時に例外を投げます ── 使える状態に決して到達しません。</p>
      <h3>なぜ起きるのか</h3>
      <p>PR #1428 の後、分析プロバイダーと PDF エクスポートの nonce が <code>crypto.randomUUID()</code> を直接呼び始め、安全な crypto API が利用できないときに優雅にフォールバックする PR #900 で導入された段階的なヘルパーをバイパスしました。Chromium は非セキュアコンテキストで <code>crypto.randomUUID</code> を公開しません ── そしてプレーン HTTP 上の素の LAN IP は、Chromium の定義によればセキュアコンテキストではありません。だから直接呼び出しが読み込み時に例外を投げ、ページもろとも落ちます。厳密には BYOK のバグではありませんが、まさに同じオーディエンスに噛みつきます：自前のインフラを動かす人々で、しばしばエアギャップされ、しばしばプレーン HTTP 上で動かしています。内部ツールのために証明書を立てるのは手間に見合わないからです。</p>
      <h3>回避策</h3>
      <p>web アプリを HTTPS 上、または <code>localhost</code> 上で提供してください。どちらも Chromium のセキュアコンテキスト要件を満たし ── <code>localhost</code> は証明書なしでもセキュアとして扱われます ── ページは通常どおり読み込まれます。手早い内部セットアップなら <code>localhost</code> がゼロコストの道筋で、LAN アクセスなら HTTPS 上の自己署名証明書が長持ちする道筋です。</p>
      <h3>誰が修正しているか</h3>
      <p>PR #1621 は残りの呼び出し箇所を PR #900 の段階的な UUID ヘルパー経由に戻すので、セキュアコンテキストのフォールバックが、すでに配線されていた場所だけでなく、再びどこでも適用されます。open でレビュー中です。</p>
      <h2>これが Open Design の BYOK について実際に語っていること</h2>
      <p>このリストを品質の判定ではなく、契約のマップとして読んでください。これら 5 つの issue のうち 4 つはアダプターの境界に座っています ── Gemini の CLI 起動経路、DeepSeek の argv に縛られた CLI 転送、OpenCode のコールドスタートの起動モデル、ホストプラットフォームのセキュアコンテキストのルール。5 つ目、Finish Design のものは、私たち自身の finalize エンドポイントにあり、1 リリース前に Anthropic 形式のレスポンスをハードコードして、まだ一般化していない場所です。それは私たちの責任です。他の 4 つは、自分が作っていないツールを尊重することへの税金です。</p>
      <p>そしてそれが構造的な要点です。リバッジされたプロキシでないあらゆる BYOK システムは、結局ここに行き着きます。あなたは推論を所有する ── そして BYOK を失います、なぜなら今やトークンを買って値上げするのはあなただからです ── か、上流のツールを尊重してそのエッジを継承する：彼らの CLI、彼らのパッケージングの癖、それぞれが異なる扱いをするプラットフォームの制限を。私たちは<a href="/blog/why-we-built-open-design-as-a-skill-layer/">意図的に 2 つ目の姿勢を選びました</a>し、また選ぶでしょう。その代償が、今週のように見える週です。daemon チームとアダプターチームが 2 日間で 5 つのサーフェスにわたって作業をファイルした週です。</p>
      <p>そのトレードは今も正しいのです。macOS での Claude Code、Codex、Cursor、Gemini Pro、そして Linux での DeepSeek の動くセットアップ ── 私たちの実際のユーザーのおよそ 90% をカバーするマトリックス ── は今日きれいに動きます。プロキシ税もなく、あなたのトークンへのマージンもなく。上の 5 つのスレッドは、2026 年 5 月中旬におけるマトリックスの残り 10% がどう見えるかです：名指しされ、ファイルされ、それぞれ修正が進行中です。正直な継ぎ目は、請求がどこへ行くのかを隠す滑らかな表面に勝ります。</p>
      <h2>今日何を使うか（マトリックス）</h2>
      <p>これは上のセクションの実践版です ── 同じ 5 つの継ぎ目を、今すぐ手を伸ばして安全なものへとマッピングしたものです。✓ は経路がそのまま動くことを意味します。✗ はそれをブロックしている issue にリンクし、回避策は該当セクションにあります。</p>


      <table><thead><tr><th>プロバイダー</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish Design の経路</th></tr></thead><tbody><tr><td>Claude Code（Sonnet / Opus）</td><td>✓</td><td>✓</td><td>✓</td><td>ネイティブ</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>ネイティブ</td></tr><tr><td>Cursor（BYOK）</td><td>✓</td><td>✓</td><td>✓</td><td>ネイティブ</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter シム（<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>）</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗（<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>）</td><td>OpenRouter シム（<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>）</td></tr><tr><td>DeepSeek（API）</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter シム</td></tr><tr><td>DeepSeek TUI（長いプロンプト）</td><td>✓</td><td>✓</td><td>✗（<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>）</td><td>OpenRouter シム</td></tr><tr><td>OpenCode（ローカルモデル）</td><td>✓</td><td>✓</td><td>✓（先にウォーム、<a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>）</td><td>該当なし</td></tr></tbody></table>
      <p>この表の読み方は 2 通り。あなたのスタックがすべて ✓ のブロックにあるなら ── Claude Code、Codex、Cursor、あるいは Gemini Pro ── きれいな経路にいて、上記の何もあなたの 1 日を変えません。✗ の行のどれかにいるなら、対応するセクションに、リンクされた修正が届くまで今日動かすための回避策があります。いずれにせよ、行が ✗ から ✓ に変わったときに通知が欲しければ、<a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">トラッカー上の BYOK ラベル</a>を購読してください。</p>
      <h2>次に何をするか</h2>
      <p>Open Design の<a href="https://github.com/nexu-io/open-design/tree/main/skills">スキルライブラリ</a>は、これらすべての下にある動くレイヤーです ── 接続が健全になると BYOK アダプターが供給する、ファイル駆動の契約です。上の継ぎ目は、あなたのキーからモデルへ、そして戻ってくるバイトの受け渡しに関するものです。スキルは、モデルがそれを使って実際に何をするかです。スキルがモデルから何を消費し、何を気にしないのか ── これらのアダプターのエッジが出力を変えず、あなたがそこに到達できるかどうかだけを変える理由でもあります ── を見たければ、そのディレクトリが始めるのに適した場所です。</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">スキルライブラリを見る</a>。</p>
      <h2>関連する読み物</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー：自分のキーで Claude、Codex、Qwen を動かす</a> — 元の BYOK の解説と、上の 5 つの継ぎ目がそのエッジに座っている動く経路</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ Open Design を製品ではなくスキルレイヤーとして作ったのか</a> — なぜ私たちが上流のツールをプロキシで包む代わりに尊重するのか、それがこれらの境界が存在する理由のすべて</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 のスキル、72 のシステム ── ライブラリの仕組み</a> — 接続が健全になったとき、BYOK が実際に何に供給するか</li>
      </ul>
  ko:
    title: "BYOK 현실 점검: 지금 Open Design에서 깨지는 5가지"
    summary: "우리는 BYOK를 일급 기능으로 약속했습니다. 이번 주에 올라온 다섯 개의 미해결 버그 스레드 — Gemini, DeepSeek, OpenCode, Windows — 가 아직 거친 이음새가 어디에 있는지, 그리고 각 수정이 도착할 때까지 무엇을 써야 하는지 보여줍니다."
    bodyHtml: |
      <p>우리는 Open Design이 처음부터 BYOK라고 사람들에게 말해 왔습니다. 그건 지금도 사실입니다. <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 디자인 워크플로</a>에 대한 시드 글은 동작하는 경로를 안내합니다 — daemon을 OpenAI 호환 엔드포인트로 가리키고, 키를 붙여 넣으면 끝입니다. 대다수 설정에서는 이것이 이야기의 전부이며, 앞으로도 전부로 남습니다.</p>
      <p>하지만 “BYOK”는 단일 기능이 아닙니다. 그것은 채팅 작성기, finalize 엔드포인트, 모델 선택기, CLI 실행 경로, 그리고 분석 레이어까지 뻗어 있는 하나의 계약입니다. 그 각각은 계약이 깨질 수 있는 지점이며 — 지금 그 중 여럿이 우리 <a href="https://github.com/nexu-io/open-design/issues">공개 트래커</a>에 미해결 이슈로 올라와 있고, 지난 48시간 동안 사용자들이 보고한 것들입니다.</p>
      <p>우리는 시드 글을 쓰고 거기서 멈출 수도 있었습니다. 그 대신 여기 정직한 점검이 있습니다: 이번 주에 들어온 스레드들, 무엇이 깨지는지, 왜 깨지는지, 오늘 무엇을 해야 하는지, 그리고 어느 PR(또는 로드맵 슬롯)이 그것을 고치고 있는지. 이 중 어느 것도 숨겨져 있지 않습니다. 모두 등록되고, 라벨이 붙고, 아래에 링크되어 있습니다 — 그리고 우리는 여러분이 금요일에 발표 도중에 이것들을 발견하기보다 우리에게서 읽기를 바랍니다.</p>
      <h2>약속 대 버그 목록</h2>
      <p>프레이밍이 중요합니다. 쉽게 오독하면 “BYOK는 어설프게 만들어졌다”가 되기 때문입니다. 그렇지 않습니다. 아래 다섯 개 중 어느 것도 “BYOK가 동작하지 않는다”는 버그가 아닙니다. 모두가 우리가 소유한 어댑터 — OpenAI 호환 레이어, 모델 선택기, finalize 경로 — 와 우리가 소유하지 않은 것 사이의 경계에 자리합니다: 상류 공급자의 CLI, 그들의 패키징 선택, 또는 호스트 플랫폼의 프로세스 모델입니다.</p>
      <p>그 경계는 어떤 오픈소스 CLI 오케스트레이터에서든 현실이 사는 곳입니다. 우리는 추론을 실행하지 않고, 공급자마다 포크한 CLI를 제공하지 않으며, 모든 것을 모서리를 매끄럽게 다듬는(그리고 조용히 여러분의 토큰에 세금을 매기는) 프록시로 감싸지 않습니다. 그 자세의 대가는, 공급자의 CLI가 형태를 바꾸거나 Windows가 macOS에는 없는 제한을 강제할 때 이음새가 드러난다는 것입니다. 이번 주에는 그 이음새 다섯 개가 한꺼번에 드러났습니다.</p>
      <p>들어온 순서대로 다섯 개 모두 여기 있습니다.</p>
      <h2>Gemini가 “Finish Design”으로 가는 길에서 길을 잃다</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, open</strong></p>
      <h3>증상</h3>
      <p>Gemini용으로 BYOK가 구성되어 있습니다. 설정의 연결 테스트가 성공합니다. 모델 선택기가 Gemini 모델을 반환합니다. 일반 채팅도 동작합니다 — 자신의 Gemini 키로 문제없이 온전한 대화를 나눌 수 있습니다. 하지만 사용자가 <strong>Finish Design</strong>을 누르는 순간, daemon이 마치 갑자기 어느 공급자와 대화하고 있었는지 잊은 듯이 Anthropic 형태의 오류를 던집니다.</p>
      <h3>왜 일어나는가</h3>
      <p>스레드의 메인테이너 답변이 이를 확인해 줍니다: 일반 API 모드 채팅은 선택된 Gemini BYOK 공급자를 끝까지 존중하지만, Finish Design은 아직 Anthropic 호환 finalize 경로 너머로 일반화되지 않았습니다. 다른 모든 것은 각 상류의 방언을 말할 줄 아는 공급자 인식 프록시를 통해 라우팅됩니다. Finish Design은 여전히 이전 릴리스에서 남겨진 하드코딩된 Anthropic finalize 엔드포인트를 거칩니다 — 그래서 Anthropic이 아닌 형태로 도착하는 Gemini 응답이 파서를 걸려 넘어뜨립니다.</p>
      <h3>우회 방법</h3>
      <p>Gemini를 Anthropic 호환 공급자 슬롯 아래에서 OpenRouter를 통해 라우팅하세요. 그러면 Finish Design 경로는 OpenRouter의 심에서 돌아오는 Anthropic 형태의 응답을 보게 되고 올바르게 finalize합니다. 추가 홉이 생기고 Gemini를 직접 호출하는 대신 OpenRouter의 라우팅 비용을 지불하게 되지만, 오늘 안정적이며 이미 동작하는 채팅 경로를 건드리지 않고 깨진 그 한 경로만 커버합니다.</p>
      <h3>누가 고치고 있는가</h3>
      <p>Finish Design 일반화는 현재 BYOK 로드맵에 P1으로 올라 있습니다. 아직 PR은 없습니다 — 이것이 daemon 팀이 다음에 착수할 일이며, 다섯 개 중에서 경계 불일치가 아니라 우리가 온전히 소유한 코드의 결함인 유일한 항목입니다.</p>
      <h2>Gemini 3 Flash가 Windows에서 프롬프트가 도달하기 전에 죽다</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, open</strong></p>
      <h3>증상</h3>
      <p>Gemini 3 Flash Preview가 Windows에서 Open Design 내부에서 약 1.5초 후 <code>stdin: write EOF</code>와 함께 실패합니다 — 프롬프트가 모델에 도달하기도 전에 말이죠. Gemini 3 Pro는 정확히 같은 설치에서 잘 동작합니다. 그리고 직접 실행한 Gemini CLI(<code>gemini --model gemini-3-flash-preview ...</code>)는 <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>가 설정되어 있으면 성공합니다. 따라서 키 문제도, 계정 문제도, 단독으로 본 CLI의 문제도 아닙니다.</p>
      <h3>왜 일어나는가</h3>
      <p>진단에는 두 번의 시도가 필요했는데, 이런 문제들이 어떻게 풀리는지를 보여주는 좋은 사례라 보여드릴 가치가 있습니다. 보고자의 스크린샷을 처음 읽었을 때는 상류의 <code>429 RESOURCE_EXHAUSTED</code> 할당량 오류처럼 보였습니다. <code>OD_GEMINI_3_FLASH_OK</code>를 stdout에 기록하는 깨끗한 PowerShell 재현 후 그림이 바뀌었습니다: 모델은 도달 가능하고, CLI는 건강하며, 실패는 특정하게 Open Design → Gemini CLI 실행 경로에 있고, Windows의 Flash 변종에 특정적입니다. Pro는 같은 실행 경로를 거치는데도 살아남고, Flash는 그렇지 못합니다.</p>
      <h3>우회 방법</h3>
      <p>모델 선택기에서 Gemini 3 Pro Preview를 선택하세요. 같은 실행 경로를 거치며 동작합니다. 별개로 — 그리고 이 부분이 버그 자체보다 더 많은 시간을 잡아먹었는데 — <code>~/.gemini/hooks/</code>를 확인하세요. 느린 <code>gsd-check-update.js</code> 훅(<code>Hook execution error: Hook timed out after 60000ms</code>)이 이 사용자의 경우 매 실행마다 대략 104초의 오버헤드를 더하고 있었고, 이는 Flash 실패와는 완전히 무관했습니다. 어쨌든 Gemini 훅을 정리하세요. 멈춰버린 업데이트 확인 훅은 어떤 에이전트든 고장 난 것처럼 느끼게 만듭니다.</p>
      <h3>누가 고치고 있는가</h3>
      <p>Flash 특정적이고 OD 측 문제로 표시되었습니다. daemon의 stdin 쓰기 경로에 대한 조사가 진행 중입니다 — <code>write EOF</code>는 daemon이 프롬프트 쓰기를 마치기 전에 자식 프로세스의 stdin이 닫혔다는 뜻이므로, 수정은 그 특정 변종이 어떻게 spawn되는지에 있습니다.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="일부 행은 통과하고 몇몇은 깨짐 표시를 보이는 체크리스트 매트릭스, 거의 흰색에 가까운 에디토리얼 바탕에서 녹색 프레임으로 선택되어 있다">
        <figcaption>다섯 개의 정직한 이음새 — 각각은 우리가 소유한 어댑터와 우리가 만들지 않은 CLI 사이의 경계에 자리한다.</figcaption>
      </figure>
      <h2>DeepSeek TUI는 Windows에서 30 KB 프롬프트 한도가 있다</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, open</strong></p>
      <h3>증상</h3>
      <p>Windows 패키지 빌드의 DeepSeek 래퍼 v0.8.33에서, 길게 작성된 프롬프트가 우리의 사전 점검 가드에 <code>81397 > 30000 bytes</code>로 실패합니다. 사용자는 아무 잘못도 하지 않았습니다 — 단지 30 KB를 넘길 만큼 풍부한(시스템 컨텍스트, 디자인 시스템, 참조 자료) 프롬프트를 작성했을 뿐입니다.</p>
      <h3>왜 일어나는가</h3>
      <p>그 가드는 의도적이며, 더 나쁜 오류로부터 여러분을 보호하고 있습니다. DeepSeek TUI 어댑터는 현재 프롬프트를 위치 기반 명령줄 인자로 — argv에 묶여 — 보내는데, Windows는 전체 명령줄을 macOS와 Linux보다 훨씬 낮은 수준에서 제한합니다. 사전 점검이 없으면 같은 프롬프트는 나중에, spawn의 더 깊은 곳에서, 훨씬 덜 유용한 <code>ENAMETOOLONG</code> 오류와 함께, 원인이 프롬프트 크기라는 어떤 단서도 없이 실패합니다. 그래서 우리는 일찍 실패하고 그 숫자를 명시합니다. 이 이슈가 드러낸 불일치는 문서에 있습니다: 상위 수준 안내는 Windows 긴 프롬프트 폴백이 광범위하게 적용된다고 암시하지만, DeepSeek TUI 경로에는 아직 그것이 없습니다 — 그 전송 방식은 여전히 argv이지 stdin이나 프롬프트 파일이 아닙니다.</p>
      <h3>우회 방법</h3>
      <p>DeepSeek TUI 어댑터로 Windows를 쓰고 있다면, 작성한 프롬프트를 30 KB 미만으로 유지하거나, stdin 기반 어댑터로 전환하세요 — Claude Code, Codex, OpenCode는 모두 프롬프트를 stdin으로 받으며 비교할 만한 한도가 없습니다. macOS와 Linux에서는 이 이슈가 전혀 물지 않습니다. 거기서는 argv 제한이 충분히 높아 실제 프롬프트가 거기에 도달하지 않습니다.</p>
      <h3>누가 고치고 있는가</h3>
      <p>올바른 수정은 DeepSeek TUI 어댑터를 위한 stdin 또는 프롬프트 파일 전송 방식으로, argv 한도를 완전히 제거하고 stdin 어댑터들과 보조를 맞추게 합니다. 어댑터 팀의 큐에서 추적되고 있습니다.</p>
      <h2>OpenCode 로컬 CLI 테스트가 모델이 워밍업되기 전에 타임아웃되다</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, open</strong></p>
      <h3>증상</h3>
      <p>Settings → BYOK → OpenCode에서, 연결 테스트가 어김없이 45초에 타임아웃됩니다. 이상한 점: 사용자가 먼저 OpenCode Desktop의 터미널을 열고 거기에 로컬 LLM을 붙이면, 같은 Open Design 테스트가 다음 시도에서 성공합니다.</p>
      <h3>왜 일어나는가</h3>
      <p>그 “먼저 Desktop 터미널을 연다”는 디테일이 단서의 전부입니다. Open Design은 실행 중인 OpenCode Desktop 세션에 붙지 않습니다. 설정 스모크 테스트를 위해 daemon은 자신만의 새로운 OpenCode CLI 하위 프로세스를 spawn하고 <code>ok</code> 응답을 기다립니다. 차가운 로컬 모델 — 아직 메모리에 로드되지 않은 모델 — 의 경우, 그 첫 응답은 45초 예산보다 오래 걸릴 수 있는데, 모델이 무언가에 답하기 전에 디스크에서 읽혀 워밍업되고 있기 때문입니다. Desktop 터미널을 열고 프롬프트 하나에 답하게 하면 OS 캐시에서 모델이 워밍업되어, daemon의 새 하위 프로세스가 곧바로 그 이점을 누릴 수 있게 됩니다. 그래서 이것은 사실 OpenCode 버그가 아닙니다. 로컬 모델에 대해 잘못된 콜드 스타트 타이밍 가정입니다.</p>
      <h3>우회 방법</h3>
      <p>Open Design에서 OpenCode를 테스트하기 전에, OpenCode Desktop을 열고 로컬 LLM을 붙인 다음, 프롬프트 하나에 답하게 하세요. 그런 다음 OD 연결 테스트를 실행하세요 — 모델이 따뜻해져 있어 응답이 예산 안에 도착합니다. v0.7.0부터는 연결 테스트 예산도 구성 가능하므로, 로컬 모델이 정말로 느리게 로드된다면 손으로 워밍업하는 대신 그 창을 늘릴 수 있습니다.</p>
      <h3>누가 고치고 있는가</h3>
      <p>daemon 측 수정은 로컬 모델 어댑터에 특정한 더 길거나 구성 가능한 워밍업 창으로, 차가운 로컬 모델이 호스팅된 API와 같은 시계로 평가받지 않게 합니다. p0으로 추적되고 있습니다 — 다섯 개 중 최고 우선순위인데, 로컬 모델 사용자가 바로 BYOK가 봉사하려는 대상이기 때문입니다.</p>
      <h2>패키지된 웹 앱이 평문 HTTP로는 로드를 거부하다</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, open</strong></p>
      <h3>증상</h3>
      <p>약간 다른 버그, 같은 계열입니다. 보고자는 LAN IP에서 평문 HTTP로 패키지된 웹 앱을 실행하고 있는데, 페이지가 로드 시 예외를 던집니다 — 사용 가능한 상태에 결코 도달하지 못합니다.</p>
      <h3>왜 일어나는가</h3>
      <p>PR #1428 이후, 분석 공급자와 PDF 내보내기 nonce가 <code>crypto.randomUUID()</code>를 직접 호출하기 시작했고, 보안 crypto API를 사용할 수 없을 때 우아하게 폴백하는, PR #900에서 도입된 계층형 헬퍼를 우회했습니다. Chromium은 보안 컨텍스트가 아닌 곳에서는 <code>crypto.randomUUID</code>를 노출하지 않습니다 — 그리고 평문 HTTP의 맨 LAN IP는 Chromium의 정의상 보안 컨텍스트가 아닙니다. 그래서 직접 호출이 로드 시점에 예외를 던지고, 페이지가 그와 함께 다운됩니다. 엄밀히 BYOK 버그는 아니지만, 정확히 같은 대상을 뭅니다: 자신의 인프라를 운영하는 사람들, 종종 에어갭 환경에서, 종종 평문 HTTP로 — 내부 도구에 인증서를 세우는 것이 그 마찰만큼의 가치가 없기 때문입니다.</p>
      <h3>우회 방법</h3>
      <p>웹 앱을 HTTPS로 또는 <code>localhost</code>로 제공하세요. 둘 다 Chromium의 보안 컨텍스트 요구를 만족하며 — <code>localhost</code>는 인증서 없이도 보안으로 취급됩니다 — 페이지가 정상적으로 로드됩니다. 빠른 내부 설정에는 <code>localhost</code>가 비용 제로의 경로이고, LAN 접근에는 HTTPS 위의 자체 서명 인증서가 더 오래가는 경로입니다.</p>
      <h3>누가 고치고 있는가</h3>
      <p>PR #1621은 남은 호출 지점들을 PR #900의 계층형 UUID 헬퍼를 다시 거치도록 라우팅하여, 보안 컨텍스트 폴백이 이미 연결되어 있던 곳에서만이 아니라 다시 모든 곳에 적용되게 합니다. 열려 있고 리뷰 중입니다.</p>
      <h2>이것이 Open Design의 BYOK에 대해 실제로 말해주는 것</h2>
      <p>이 목록을 품질 판결이 아니라 계약 지도로 읽으세요. 이 다섯 개 중 넷은 어댑터 경계에 자리합니다 — Gemini의 CLI 실행 경로, DeepSeek의 argv에 묶인 CLI 전송, OpenCode의 콜드 스타트 실행 모델, 호스트 플랫폼의 보안 컨텍스트 규칙. 다섯 번째인 Finish Design 건은 우리 자신의 finalize 엔드포인트에 있는데, 한 릴리스 전에 Anthropic 형태의 응답을 하드코딩했고 아직 일반화하지 않았습니다. 그건 우리 책임입니다. 나머지 넷은 여러분이 만들지 않은 도구를 존중하는 대가로 치르는 세금입니다.</p>
      <p>그리고 그것이 구조적 핵심입니다. 리브랜딩된 프록시가 아닌 모든 BYOK 시스템은 결국 여기에 다다릅니다. 여러분은 추론을 소유하거나 — 그러면 BYOK를 잃습니다, 이제 토큰을 사서 마진을 붙이는 쪽이 여러분이니까 — 아니면 상류 도구를 존중하고 그 모서리들을 물려받습니다: 그들의 CLI, 그들의 패키징 별난 점들, 각자 다르게 다루는 플랫폼 제한들. 우리는 <a href="/blog/why-we-built-open-design-as-a-skill-layer/">두 번째 자세를 의도적으로 골랐고</a>, 다시 고를 것입니다. 그 비용은 이번 주 같은 주들입니다 — daemon과 어댑터 팀이 이틀 동안 다섯 개 표면에 걸쳐 작업을 등록한 그런 주 말이죠.</p>
      <p>이 거래는 여전히 옳습니다. macOS의 Claude Code, Codex, Cursor, Gemini Pro, 그리고 Linux의 DeepSeek에서 동작하는 설정 — 우리 실제 사용자의 대략 90%를 커버하는 매트릭스 — 은 오늘 깔끔하게 돌아가며, 프록시 세금도 없고 여러분의 토큰에 붙는 마진도 없습니다. 위의 다섯 스레드는 2026년 5월 중순 그 매트릭스의 나머지 10%가 어떻게 생겼는지를 보여줍니다: 이름이 붙고, 등록되고, 각각 수정이 진행 중입니다. 정직한 이음새가, 청구서가 어디로 가는지 숨기는 매끄러운 표면보다 낫습니다.</p>
      <h2>오늘 무엇을 쓸까 (매트릭스)</h2>
      <p>이것은 위 섹션의 실용 버전입니다 — 같은 다섯 이음새를, 지금 당장 손대도 안전한 것에 매핑한 것입니다. ✓는 그 경로가 있는 그대로 동작한다는 뜻이고, ✗는 그것을 막고 있는 이슈로 링크되며, 우회 방법은 해당 섹션에 있습니다.</p>










































































      <table><thead><tr><th>공급자</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish Design 경로</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>네이티브</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>네이티브</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>네이티브</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter 심 (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>OpenRouter 심 (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter 심</td></tr><tr><td>DeepSeek TUI (긴 프롬프트)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>OpenRouter 심</td></tr><tr><td>OpenCode (로컬 모델)</td><td>✓</td><td>✓</td><td>✓ (먼저 워밍업, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>해당 없음</td></tr></tbody></table>
      <p>이 표를 읽는 두 가지 방식. 여러분의 스택이 전부 ✓인 블록에 있다면 — Claude Code, Codex, Cursor, 또는 Gemini Pro — 여러분은 깔끔한 경로에 있고 위의 어떤 것도 여러분의 하루를 바꾸지 않습니다. ✗ 행 중 하나에 있다면, 해당 섹션에 링크된 수정이 도착할 때까지 오늘 돌아가게 해줄 우회 방법이 있습니다. 어느 쪽이든, 행이 ✗에서 ✓로 뒤집힐 때 알림을 받고 싶다면 <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">트래커의 BYOK 라벨</a>을 구독하세요.</p>
      <h2>다음에 할 일</h2>
      <p>Open Design의 <a href="https://github.com/nexu-io/open-design/tree/main/skills">skills 라이브러리</a>는 이 모든 것 밑에 깔린 동작 레이어입니다 — 연결이 건강해지면 BYOK 어댑터가 먹여 넣는 파일 기반 계약들입니다. 위의 이음새들은 여러분의 키에서 모델로, 다시 돌아오는 바이트를 옮기는 것에 관한 것이고, skills는 모델이 그것들로 실제로 무엇을 하는지입니다. 스킬이 모델에서 무엇을 소비하고 무엇을 신경 쓰지 않는지 — 이것이 또한 왜 이 어댑터 모서리들이 출력을 바꾸지 않고 여러분이 그것에 도달하는지 여부만 바꾸는지의 이유이기도 한데 — 보고 싶다면, 그 디렉터리가 시작하기에 알맞은 곳입니다.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">skills 라이브러리 둘러보기</a>.</p>
      <h2>관련 읽을거리</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 디자인 워크플로: 자신의 키로 Claude, Codex, 또는 Qwen 실행하기</a> — 원래의 BYOK 설명 글이자, 위 다섯 이음새가 그 가장자리에 자리한 동작 경로</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">우리가 Open Design을 제품이 아니라 스킬 레이어로 만든 이유</a> — 왜 우리가 상류 도구를 프록시로 감싸는 대신 존중하는지, 이것이 바로 이 경계들이 존재하는 이유</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31개 스킬, 72개 시스템 — 라이브러리가 동작하는 방식</a> — 연결이 건강해지면 BYOK가 실제로 무엇에 먹여 넣는지</li>
      </ul>
  de:
    title: "BYOK auf dem Prüfstand: 5 Dinge, die in Open Design heute brechen"
    summary: "Wir haben BYOK als erstklassiges Feature versprochen. Fünf offene Bug-Threads aus dieser Woche — Gemini, DeepSeek, OpenCode, Windows — zeigen, wo die Nahtstellen noch rau sind, und was du nutzen solltest, bis der jeweilige Fix einschlägt."
    bodyHtml: |
      <p>Wir erzählen den Leuten seit jeher, dass Open Design von Grund auf BYOK ist. Das stimmt nach wie vor. Der Ausgangsbeitrag zum <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-Design-Workflow</a> führt durch den funktionierenden Weg — richte den daemon auf einen beliebigen OpenAI-kompatiblen Endpunkt, füge deinen Key ein, fertig. Für die Mehrheit der Setups ist das die ganze Geschichte, und es bleibt die ganze Geschichte.</p>
      <p>Aber „BYOK“ ist kein einzelnes Feature. Es ist ein Vertrag, der bis in den Chat-Composer, den Finalize-Endpunkt, den Model-Picker, den CLI-Startpfad und die Analytics-Schicht hineinreicht. Jede dieser Stellen ist ein Ort, an dem der Vertrag brechen kann — und genau jetzt sind mehrere davon offene Issues in unserem <a href="https://github.com/nexu-io/open-design/issues">öffentlichen Tracker</a>, gemeldet von Nutzern in den letzten 48 Stunden.</p>
      <p>Wir hätten den Ausgangsbeitrag schreiben und es dabei belassen können. Stattdessen kommt hier der ehrliche Durchgang: die Threads, die diese Woche reinkamen, was bricht, warum es bricht, was heute zu tun ist und welcher PR (oder Roadmap-Slot) es behebt. Nichts davon ist versteckt. Sie sind erfasst, gelabelt und unten verlinkt — und uns ist es lieber, du liest sie von uns, als dass du sie am Freitag mitten in einer Präsentation entdeckst.</p>
      <h2>Das Versprechen vs. die Bug-Liste</h2>
      <p>Die Einordnung ist wichtig, denn die naheliegende Fehllesart lautet „BYOK ist halbgar“. Ist es nicht. Keiner der fünf folgenden Punkte ist ein „BYOK funktioniert nicht“-Bug. Jeder einzelne sitzt an der Grenze zwischen einem Adapter, der uns gehört — der OpenAI-kompatiblen Schicht, dem Model-Picker, dem Finalize-Pfad — und einem, der uns nicht gehört: dem CLI des Upstream-Anbieters, seinen Packaging-Entscheidungen oder dem Prozessmodell der Host-Plattform.</p>
      <p>Diese Grenze ist der Ort, an dem in jedem Open-Source-CLI-Orchestrator die Realität wohnt. Wir betreiben keine Inferenz, wir liefern kein geforktes CLI für jeden Anbieter, und wir wickeln nicht alles in einen Proxy, der die Kanten glättet (und still und heimlich deine Tokens besteuert). Der Preis dieser Haltung ist, dass die Naht sichtbar wird, wenn das CLI eines Anbieters seine Form ändert oder Windows ein Limit durchsetzt, das macOS nicht hat. Diese Woche zeigten sich fünf dieser Nähte auf einmal.</p>
      <p>Hier sind alle fünf, in der Reihenfolge, in der sie reinkamen.</p>
      <h2>Gemini verirrt sich auf dem Weg zu „Finish Design“</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, open</strong></p>
      <h3>Symptom</h3>
      <p>BYOK ist für Gemini konfiguriert. Der Verbindungstest in den Einstellungen ist erfolgreich. Der Model-Picker liefert Gemini-Modelle zurück. Normaler Chat funktioniert — du kannst gegen deinen eigenen Gemini-Key problemlos ein vollständiges Gespräch führen. Aber in dem Moment, in dem der Nutzer auf <strong>Finish Design</strong> klickt, wirft der daemon einen Fehler in Anthropic-Form, als hätte er plötzlich vergessen, mit welchem Anbieter er gerade sprach.</p>
      <h3>Warum es passiert</h3>
      <p>Die Antwort des Maintainers im Thread bestätigt es: Der normale API-Modus-Chat berücksichtigt den ausgewählten Gemini-BYOK-Anbieter durchgängig, aber Finish Design wurde noch nicht über den Anthropic-kompatiblen Finalize-Pfad hinaus verallgemeinert. Alles andere läuft über den anbieterbewussten Proxy, der weiß, wie er den Dialekt jedes Upstreams spricht. Finish Design läuft immer noch über einen fest verdrahteten Anthropic-Finalize-Endpunkt, der aus einem früheren Release übrig geblieben ist — also bringt eine Gemini-Antwort, die in einer Nicht-Anthropic-Form ankommt, den Parser zu Fall.</p>
      <h3>Workaround</h3>
      <p>Leite Gemini über OpenRouter im Anthropic-kompatiblen Anbieter-Slot. Der Finish-Design-Pfad sieht dann eine Antwort in Anthropic-Form, die vom Shim von OpenRouter zurückkommt, und finalisiert korrekt. Es ist ein zusätzlicher Hop, und du bezahlst das Routing von OpenRouter, statt Gemini direkt aufzurufen, aber es ist heute stabil und deckt genau den einen Pfad ab, der kaputt ist, ohne den Chat-Pfad anzutasten, der bereits funktioniert.</p>
      <h3>Wer es behebt</h3>
      <p>Die Verallgemeinerung von Finish Design steht jetzt als P1 auf der BYOK-Roadmap. Noch kein PR — das ist das Nächste, das sich das daemon-Team vornimmt, und es ist der einzige der fünf, der ein Defekt in Code ist, der vollständig uns gehört, statt eine Grenz-Inkompatibilität.</p>
      <h2>Gemini 3 Flash stirbt unter Windows, bevor der Prompt ankommt</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, open</strong></p>
      <h3>Symptom</h3>
      <p>Gemini 3 Flash Preview scheitert innerhalb von Open Design unter Windows mit <code>stdin: write EOF</code> nach etwa 1,5 Sekunden — bevor der Prompt jemals das Modell erreicht. Gemini 3 Pro funktioniert in genau derselben Installation einwandfrei. Und das direkte Gemini CLI (<code>gemini --model gemini-3-flash-preview ...</code>) ist erfolgreich, wenn <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> gesetzt ist. Es liegt also nicht am Key, nicht am Account und nicht am CLI für sich genommen.</p>
      <h3>Warum es passiert</h3>
      <p>Die Diagnose brauchte zwei Anläufe, was es wert ist zu zeigen, denn es ist ein gutes Beispiel dafür, wie solche Fälle entwirrt werden. Die erste Lesart des Screenshots des Melders sah aus wie ein Upstream-Quota-Fehler <code>429 RESOURCE_EXHAUSTED</code>. Nach einem sauberen PowerShell-Repro, das <code>OD_GEMINI_3_FLASH_OK</code> nach stdout schrieb, änderte sich das Bild: Das Modell ist erreichbar, das CLI ist gesund, der Fehler liegt speziell auf dem Startpfad Open Design → Gemini CLI, und er ist spezifisch für die Flash-Variante unter Windows. Pro nimmt denselben Startpfad und übersteht ihn; Flash nicht.</p>
      <h3>Workaround</h3>
      <p>Wähle Gemini 3 Pro Preview im Model-Picker. Es läuft über denselben Startpfad und funktioniert. Davon getrennt — und dieser Teil hat mehr Zeit gekostet als der Bug selbst — prüfe <code>~/.gemini/hooks/</code>. Ein langsamer <code>gsd-check-update.js</code>-Hook (<code>Hook execution error: Hook timed out after 60000ms</code>) fügte im Fall dieses Nutzers jedem Lauf rund 104s Overhead hinzu, völlig unabhängig vom Flash-Fehler. Säubere deine Gemini-Hooks ohnehin; ein hängengebliebener Update-Check-Hook lässt jeden Agenten kaputt erscheinen.</p>
      <h3>Wer es behebt</h3>
      <p>Markiert als Flash-spezifisch und OD-seitig. Die Untersuchung des stdin-Schreibpfads des daemon ist im Gange — das <code>write EOF</code> sagt, dass das stdin des Kindprozesses geschlossen wurde, bevor der daemon den Prompt fertig geschrieben hatte, der Fix liegt also darin, wie diese bestimmte Variante gespawnt wird.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Eine Checklisten-Matrix, in der manche Zeilen bestehen und einige eine Bruchmarkierung zeigen, ausgewählt in einem grünen Rahmen auf einem nahezu weißen, editorialen Grund">
        <figcaption>Fünf ehrliche Nähte — jede einzelne sitzt an der Grenze zwischen einem Adapter, der uns gehört, und einem CLI, das uns nicht gehört.</figcaption>
      </figure>
      <h2>Die DeepSeek-TUI hat unter Windows eine Prompt-Obergrenze von 30 KB</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, open</strong></p>
      <h3>Symptom</h3>
      <p>Beim DeepSeek-Wrapper v0.8.33 in einem gepackten Windows-Build scheitert ein langer zusammengesetzter Prompt an unserem Pre-flight-Guard mit <code>81397 > 30000 bytes</code>. Der Nutzer hat nichts falsch gemacht — er hat lediglich einen Prompt komponiert, der reichhaltig genug war (System-Kontext, Design-System, Referenzen), um die 30 KB zu überschreiten.</p>
      <h3>Warum es passiert</h3>
      <p>Dieser Guard ist beabsichtigt, und er schützt dich vor einem schlimmeren Fehler. Der DeepSeek-TUI-Adapter sendet den Prompt derzeit als positionales Kommandozeilen-Argument — argv-gebunden — und Windows deckelt die gesamte Kommandozeile deutlich unterhalb dessen, wo macOS und Linux das tun. Ohne den Pre-flight-Check würde derselbe Prompt später scheitern, tiefer im Spawn, mit einem weitaus weniger nützlichen <code>ENAMETOOLONG</code>-Fehler und ohne Hinweis darauf, dass die Ursache die Prompt-Größe war. Also scheitern wir früh und nennen die Zahl. Die Diskrepanz, die das Issue offenlegt, liegt in den Docs: Die übergeordnete Anleitung impliziert, dass Windows-Fallbacks für lange Prompts breit gelten, aber der DeepSeek-TUI-Pfad hat noch keinen — sein Transport ist immer noch argv, nicht stdin oder eine Prompt-Datei.</p>
      <h3>Workaround</h3>
      <p>Wenn du unter Windows mit dem DeepSeek-TUI-Adapter unterwegs bist, halte den zusammengesetzten Prompt unter 30 KB oder wechsle zu einem stdin-basierten Adapter — Claude Code, Codex und OpenCode nehmen ihren Prompt alle über stdin entgegen und haben keine vergleichbare Obergrenze. Auf macOS und Linux beißt dieses Issue überhaupt nicht; das argv-Limit ist dort hoch genug, dass reale Prompts es nicht erreichen.</p>
      <h3>Wer es behebt</h3>
      <p>Der richtige Fix ist ein stdin- oder Prompt-Datei-Transport für den DeepSeek-TUI-Adapter, der die argv-Obergrenze vollständig beseitigt und ihn auf eine Linie mit den stdin-Adaptern bringt. Er wird in der Warteschlange des Adapter-Teams verfolgt.</p>
      <h2>Der OpenCode-Local-CLI-Test läuft ab, bevor das Modell warmläuft</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, open</strong></p>
      <h3>Symptom</h3>
      <p>Unter Einstellungen → BYOK → OpenCode läuft der Verbindungstest zuverlässig nach 45 Sekunden ab. Das Seltsame daran: Wenn der Nutzer zuerst das Terminal von OpenCode Desktop öffnet und dort ein lokales LLM anhängt, ist derselbe Open-Design-Test beim nächsten Versuch erfolgreich.</p>
      <h3>Warum es passiert</h3>
      <p>Dieses Detail „öffne zuerst das Desktop-Terminal“ ist der ganze Hinweis. Open Design hängt sich nicht an eine laufende OpenCode-Desktop-Sitzung an. Für einen Smoke-Test in den Einstellungen spawnt der daemon seinen eigenen frischen OpenCode-CLI-Subprozess und wartet auf eine <code>ok</code>-Antwort. Bei einem kalten lokalen Modell — einem, das noch nicht in den Speicher geladen wurde — kann diese erste Antwort länger dauern als das 45-Sekunden-Budget, weil das Modell von der Festplatte gelesen und warmgelaufen wird, bevor es überhaupt etwas beantworten kann. Das Öffnen des Desktop-Terminals und es einen Prompt beantworten zu lassen, wärmt das Modell im OS-Cache auf eine Weise, von der der frische Subprozess des daemon dann sofort profitieren kann. Es ist also nicht wirklich ein OpenCode-Bug; es ist eine Cold-Start-Timing-Annahme, die für lokale Modelle falsch ist.</p>
      <h3>Workaround</h3>
      <p>Bevor du OpenCode in Open Design testest, öffne OpenCode Desktop, hänge dein lokales LLM an und lass es einen Prompt beantworten. Führe dann den OD-Verbindungstest aus — das Modell ist warm und die Antwort landet innerhalb des Budgets. Seit v0.7.0 ist das Verbindungstest-Budget außerdem konfigurierbar, also kannst du, wenn dein lokales Modell wirklich langsam lädt, das Fenster vergrößern, statt es von Hand aufzuwärmen.</p>
      <h3>Wer es behebt</h3>
      <p>Der daemon-seitige Fix ist ein längeres oder konfigurierbares Aufwärmfenster speziell für Local-Model-Adapter, damit ein kaltes lokales Modell nicht an derselben Uhr gemessen wird wie eine gehostete API. Es wird mit p0 verfolgt — der höchsten Priorität der fünf, weil Local-Model-Nutzer genau das Publikum sind, dem BYOK dienen soll.</p>
      <h2>Die gepackte Web-App weigert sich, über reines HTTP zu laden</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, open</strong></p>
      <h3>Symptom</h3>
      <p>Etwas anderer Bug, dieselbe Familie. Der Melder betreibt die gepackte Web-App auf einer LAN-IP über reines HTTP, und die Seite wirft beim Laden — sie erreicht nie einen nutzbaren Zustand.</p>
      <h3>Warum es passiert</h3>
      <p>Nach PR #1428 begannen der Analytics-Provider und die PDF-Export-Nonce, <code>crypto.randomUUID()</code> direkt aufzurufen und dabei den in PR #900 eingeführten gestuften Helper zu umgehen, der elegant zurückfällt, wenn die sichere crypto-API nicht verfügbar ist. Chromium stellt <code>crypto.randomUUID</code> in nicht-sicheren Kontexten nicht bereit — und eine nackte LAN-IP über reines HTTP ist nach der Definition von Chromium kein sicherer Kontext. Also wirft der direkte Aufruf beim Laden, und die Seite geht mit ihm unter. Es ist streng genommen kein BYOK-Bug, aber er beißt genau dasselbe Publikum: Leute, die ihre eigene Infrastruktur betreiben, oft air-gapped, oft über reines HTTP, weil das Aufsetzen eines Zertifikats für ein internes Tool die Reibung nicht wert ist.</p>
      <h3>Workaround</h3>
      <p>Liefere die Web-App über HTTPS oder über <code>localhost</code> aus. Beide erfüllen die Anforderung an einen sicheren Kontext von Chromium — <code>localhost</code> wird auch ohne Zertifikat als sicher behandelt — und die Seite lädt normal. Für ein schnelles internes Setup ist <code>localhost</code> der kostenlose Weg; für LAN-Zugriff ist ein selbstsigniertes Zertifikat über HTTPS der dauerhafte.</p>
      <h3>Wer es behebt</h3>
      <p>PR #1621 leitet die verbleibenden Aufrufstellen wieder über den gestuften UUID-Helper aus PR #900, sodass der Sicherer-Kontext-Fallback überall wieder greift, statt nur dort, wo er ohnehin schon verdrahtet war. Er ist offen und in Review.</p>
      <h2>Was das tatsächlich über BYOK in Open Design aussagt</h2>
      <p>Lies die Liste als Vertragskarte, nicht als Qualitätsurteil. Vier dieser fünf Issues sitzen an Adapter-Grenzen — Geminis CLI-Startpfad, DeepSeeks argv-gebundener CLI-Transport, OpenCodes Cold-Start-Startmodell, die Sicherer-Kontext-Regeln der Host-Plattform. Das fünfte, das Finish-Design-Issue, liegt an unserem eigenen Finalize-Endpunkt, wo wir vor einem Release eine Antwort in Anthropic-Form fest verdrahtet und sie noch nicht verallgemeinert haben. Das geht auf unsere Kappe; die anderen vier sind der Preis, den du dafür zahlst, Tools zu respektieren, die du nicht selbst gebaut hast.</p>
      <p>Und das ist der strukturelle Punkt. Jedes BYOK-System, das kein umetikettierter Proxy ist, landet hier. Entweder besitzt du die Inferenz — und verlierst BYOK, weil jetzt du derjenige bist, der Tokens kauft und mit Aufschlag verkauft — oder du respektierst die Upstream-Tools und erbst ihre Kanten: ihre CLIs, ihre Packaging-Eigenheiten, die Plattform-Limits, die sie alle unterschiedlich handhaben. Wir haben uns <a href="/blog/why-we-built-open-design-as-a-skill-layer/">bewusst für die zweite Haltung entschieden</a>, und wir würden uns wieder dafür entscheiden. Der Preis sind Wochen, die aussehen wie diese, in der die daemon- und Adapter-Teams Arbeit über fünf Oberflächen in zwei Tagen eingereicht haben.</p>
      <p>Der Tausch stimmt nach wie vor. Ein funktionierendes Setup auf Claude Code, Codex, Cursor, Gemini Pro auf macOS und DeepSeek auf Linux — die Matrix, die rund 90 % unserer tatsächlichen Nutzer abdeckt — läuft heute sauber, ohne Proxy-Steuer und ohne Marge auf deine Tokens. Die fünf Threads oben sind, wie die anderen 10 % der Matrix Mitte Mai 2026 aussehen: benannt, erfasst und jeder mit einem Fix in Arbeit. Ehrliche Nähte schlagen eine glatte Oberfläche, die verbirgt, wohin die Rechnung geht.</p>
      <h2>Was du heute nutzen solltest (Matrix)</h2>
      <p>Das ist die praktische Version des Abschnitts oben — dieselben fünf Nähte, abgebildet darauf, wonach es jetzt gerade sicher zu greifen ist. Ein ✓ bedeutet, der Pfad funktioniert so, wie er ist; ein ✗ verlinkt das Issue, das ihn blockiert, mit dem Workaround im relevanten Abschnitt.</p>










































































      <table><thead><tr><th>Anbieter</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish-Design-Pfad</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>nativ</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>nativ</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>nativ</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter-Shim (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>OpenRouter-Shim (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter-Shim</td></tr><tr><td>DeepSeek TUI (lange Prompts)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>OpenRouter-Shim</td></tr><tr><td>OpenCode (lokales Modell)</td><td>✓</td><td>✓</td><td>✓ (zuerst aufwärmen, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/a</td></tr></tbody></table>
      <p>Zwei Lesarten dieser Tabelle. Wenn dein Stack im Alles-✓-Block ist — Claude Code, Codex, Cursor oder Gemini Pro — bist du auf dem sauberen Pfad und nichts von oben ändert deinen Tag. Wenn du in einer der ✗-Zeilen bist, hat der passende Abschnitt den Workaround, der dich heute zum Laufen bringt, während der verlinkte Fix einschlägt. So oder so: Abonniere das <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">BYOK-Label im Tracker</a>, wenn du eine Benachrichtigung willst, sobald eine Zeile von ✗ auf ✓ umspringt.</p>
      <h2>Was als Nächstes zu tun ist</h2>
      <p>Die <a href="https://github.com/nexu-io/open-design/tree/main/skills">Skills-Bibliothek</a> von Open Design ist die Arbeitsschicht unter all dem — die dateigesteuerten Verträge, in die der BYOK-Adapter einspeist, sobald die Verbindung gesund ist. Bei den Nähten oben geht es darum, Bytes von deinem Key zum Modell und zurück zu bekommen; die Skills sind das, was das Modell tatsächlich damit macht. Wenn du sehen willst, was ein Skill aus dem Modell konsumiert und was ihm egal ist — was auch der Grund ist, warum diese Adapter-Kanten die Ausgabe nicht ändern, sondern nur, ob du sie erreichst — ist dieses Verzeichnis der richtige Ausgangspunkt.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Durchstöbere die Skills-Bibliothek</a>.</p>
      <h2>Weiterführende Lektüre</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-Design-Workflow: Claude, Codex oder Qwen auf deinem eigenen Key betreiben</a> — der ursprüngliche BYOK-Erklärbeitrag und der funktionierende Weg, an dessen Rand die fünf Nähte oben sitzen</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Layer gebaut haben, nicht als Produkt</a> — warum wir Upstream-Tools respektieren, statt sie in einen Proxy zu wickeln, was der ganze Grund ist, warum diese Grenzen existieren</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 Skills, 72 Systems — wie die Bibliothek funktioniert</a> — worein BYOK tatsächlich einspeist, sobald die Verbindung gesund ist</li>
      </ul>
  fr:
    title: "Bilan de réalité du BYOK : 5 choses qui cassent aujourd'hui dans Open Design"
    summary: "Nous avons promis le BYOK en première classe. Cinq fils de bugs ouverts cette semaine — Gemini, DeepSeek, OpenCode, Windows — montrent où les coutures sont encore rugueuses, et quoi utiliser jusqu'à ce que chaque correctif arrive."
    bodyHtml: |
      <p>Nous disons aux gens qu'Open Design est BYOK de fond en comble. C'est toujours vrai. L'article fondateur sur le <a href="/blog/byok-design-workflow-claude-codex-qwen/">workflow de design BYOK</a> parcourt le chemin qui fonctionne — pointez le daemon vers n'importe quel endpoint compatible OpenAI, collez votre clé, c'est terminé. Pour la majorité des configurations, c'est toute l'histoire, et cela reste toute l'histoire.</p>
      <p>Mais le « BYOK » n'est pas une fonctionnalité unique. C'est un contrat qui s'étend jusque dans le composeur de chat, l'endpoint de finalisation, le sélecteur de modèle, le chemin de lancement du CLI et la couche d'analytique. Chacun de ces éléments est un endroit où le contrat peut casser — et en ce moment plusieurs d'entre eux sont des issues ouvertes dans notre <a href="https://github.com/nexu-io/open-design/issues">tracker public</a>, signalées par des utilisateurs au cours des dernières 48 heures.</p>
      <p>Nous aurions pu écrire l'article fondateur et nous arrêter là. À la place, voici la passe d'honnêteté : les fils arrivés cette semaine, ce qui casse, pourquoi cela casse, quoi faire aujourd'hui, et quelle PR (ou créneau de roadmap) le corrige. Aucun de ces problèmes n'est caché. Ils sont enregistrés, étiquetés et liés ci-dessous — et nous préférons que vous les lisiez de notre part plutôt que de les découvrir en plein deck un vendredi.</p>
      <h2>La promesse face à la liste de bugs</h2>
      <p>Le cadrage importe, car la mauvaise lecture facile est « le BYOK est à moitié cuit ». Il ne l'est pas. Aucun des cinq cas ci-dessous n'est un bug du type « le BYOK ne fonctionne pas ». Chacun d'eux réside à la frontière entre un adaptateur que nous possédons — la couche compatible OpenAI, le sélecteur de modèle, le chemin de finalisation — et un que nous ne possédons pas : le CLI du fournisseur en amont, ses choix d'empaquetage, ou le modèle de processus de la plateforme hôte.</p>
      <p>Cette frontière est là où vit la réalité dans tout orchestrateur de CLI open-source. Nous n'exécutons pas d'inférence, nous ne livrons pas un CLI forké pour chaque fournisseur, et nous n'enveloppons pas tout dans un proxy qui lisse les bords (et taxe discrètement vos tokens). Le prix de cette posture est que lorsque le CLI d'un fournisseur change de forme, ou que Windows impose une limite que macOS n'impose pas, la couture apparaît. Cette semaine, cinq de ces coutures sont apparues d'un coup.</p>
      <p>Les voici toutes les cinq, dans l'ordre où elles sont arrivées.</p>
      <h2>Gemini se perd en chemin vers « Finish Design »</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, ouverte</strong></p>
      <h3>Symptôme</h3>
      <p>Le BYOK est configuré pour Gemini. Le test de connexion dans les Réglages réussit. Le sélecteur de modèle renvoie des modèles Gemini. Le chat ordinaire fonctionne — vous pouvez mener une conversation complète avec votre propre clé Gemini sans problème. Mais à l'instant où l'utilisateur appuie sur <strong>Finish Design</strong>, le daemon lève une erreur de forme Anthropic, comme s'il avait soudain oublié à quel fournisseur il parlait.</p>
      <h3>Pourquoi cela arrive</h3>
      <p>La réponse du mainteneur sur le fil le confirme : le chat ordinaire en mode API honore le fournisseur BYOK Gemini sélectionné de bout en bout, mais Finish Design n'a pas encore été généralisé au-delà du chemin de finalisation compatible Anthropic. Tout le reste est acheminé via le proxy conscient des fournisseurs qui sait comment parler le dialecte de chaque amont. Finish Design passe encore par un endpoint de finalisation Anthropic codé en dur, hérité d'une version antérieure — donc une réponse Gemini arrivant dans une forme non-Anthropic fait trébucher le parseur.</p>
      <h3>Contournement</h3>
      <p>Acheminez Gemini via OpenRouter dans l'emplacement de fournisseur compatible Anthropic. Le chemin Finish Design voit alors une réponse de forme Anthropic revenir du shim d'OpenRouter et finalise correctement. C'est un saut supplémentaire, et vous payez le routage d'OpenRouter plutôt que d'appeler Gemini directement, mais c'est stable aujourd'hui et cela couvre le seul chemin qui est cassé sans toucher au chemin de chat qui fonctionne déjà.</p>
      <h3>Qui le corrige</h3>
      <p>La généralisation de Finish Design est désormais sur la roadmap BYOK en tant que P1. Pas encore de PR — c'est la prochaine chose que l'équipe daemon prend en charge, et c'est le seul des cinq qui soit un défaut dans du code que nous possédons entièrement plutôt qu'une incompatibilité de frontière.</p>
      <h2>Gemini 3 Flash meurt sous Windows avant que le prompt n'arrive</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, ouverte</strong></p>
      <h3>Symptôme</h3>
      <p>Gemini 3 Flash Preview échoue dans Open Design sous Windows avec <code>stdin: write EOF</code> après environ 1,5 seconde — avant que le prompt n'atteigne jamais le modèle. Gemini 3 Pro fonctionne très bien dans exactement la même installation. Et le CLI Gemini direct (<code>gemini --model gemini-3-flash-preview ...</code>) réussit lorsque <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> est défini. Donc ce n'est pas la clé, pas le compte, et pas le CLI isolément.</p>
      <h3>Pourquoi cela arrive</h3>
      <p>Le diagnostic a pris deux passes, ce qui vaut la peine d'être montré car c'est un bon exemple de la façon dont on démêle ces problèmes. La première lecture de la capture d'écran du rapporteur ressemblait à une erreur de quota en amont <code>429 RESOURCE_EXHAUSTED</code>. Après une reproduction PowerShell propre qui a écrit <code>OD_GEMINI_3_FLASH_OK</code> sur stdout, le tableau a changé : le modèle est joignable, le CLI est sain, l'échec se situe spécifiquement sur le chemin de lancement Open Design → CLI Gemini, et il est spécifique à la variante Flash sous Windows. Pro emprunte le même chemin de lancement et survit ; Flash non.</p>
      <h3>Contournement</h3>
      <p>Sélectionnez Gemini 3 Pro Preview dans le sélecteur de modèle. Il s'exécute via le même chemin de lancement et fonctionne. Séparément — et ce point a pris plus de temps que le bug lui-même — vérifiez <code>~/.gemini/hooks/</code>. Un hook <code>gsd-check-update.js</code> lent (<code>Hook execution error: Hook timed out after 60000ms</code>) ajoutait environ 104 s de surcharge à chaque exécution dans le cas de cet utilisateur, totalement indépendamment de l'échec de Flash. Nettoyez vos hooks Gemini quoi qu'il en soit ; un hook de vérification de mise à jour bloqué fera paraître n'importe quel agent cassé.</p>
      <h3>Qui le corrige</h3>
      <p>Signalé comme spécifique à Flash et côté OD. L'investigation est en cours sur le chemin d'écriture stdin du daemon — le <code>write EOF</code> indique que le stdin de l'enfant s'est fermé avant que le daemon n'ait fini d'écrire le prompt, donc le correctif réside dans la façon dont cette variante particulière est lancée.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Une matrice de liste de contrôle où certaines lignes réussissent et quelques-unes affichent une marque de rupture, sélectionnée dans un cadre vert sur un fond éditorial presque blanc">
        <figcaption>Cinq coutures honnêtes — chacune réside à la frontière entre un adaptateur que nous possédons et un CLI que nous ne possédons pas.</figcaption>
      </figure>
      <h2>Le TUI DeepSeek a un plafond de prompt de 30 Ko sous Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, ouverte</strong></p>
      <h3>Symptôme</h3>
      <p>Sur le wrapper DeepSeek v0.8.33 dans un build empaqueté Windows, un long prompt composé échoue à notre garde-fou de pré-vol avec <code>81397 > 30000 bytes</code>. L'utilisateur n'a rien fait de mal — il a simplement composé un prompt suffisamment riche (contexte système, design system, références) pour franchir les 30 Ko.</p>
      <h3>Pourquoi cela arrive</h3>
      <p>Ce garde-fou est intentionnel, et il vous protège d'une erreur pire. L'adaptateur TUI DeepSeek envoie actuellement le prompt comme argument positionnel de ligne de commande — lié à argv — et Windows plafonne la ligne de commande totale bien en dessous de macOS et Linux. Sans la vérification de pré-vol, le même prompt échouerait plus tard, plus profondément dans le lancement, avec une erreur <code>ENAMETOOLONG</code> bien moins utile et aucune indication que la cause était la taille du prompt. Nous échouons donc tôt et nommons le nombre. L'incohérence que l'issue expose se trouve dans la documentation : les conseils de haut niveau laissent entendre que les solutions de repli pour les longs prompts sous Windows s'appliquent largement, mais le chemin TUI DeepSeek n'en a pas encore une — son transport est toujours argv, pas stdin ni un fichier de prompt.</p>
      <h3>Contournement</h3>
      <p>Si vous êtes sous Windows avec l'adaptateur TUI DeepSeek, gardez le prompt composé sous 30 Ko, ou passez à un adaptateur basé sur stdin — Claude Code, Codex et OpenCode prennent tous leur prompt via stdin et n'ont aucun plafond comparable. Sur macOS et Linux, cette issue ne mord pas du tout ; la limite argv y est assez élevée pour que les prompts du monde réel ne l'atteignent pas.</p>
      <h3>Qui le corrige</h3>
      <p>Le bon correctif est un transport stdin ou fichier de prompt pour l'adaptateur TUI DeepSeek, qui supprime entièrement le plafond argv et l'aligne sur les adaptateurs stdin. C'est suivi dans la file de l'équipe adaptateurs.</p>
      <h2>Le test du CLI local OpenCode expire avant que le modèle ne chauffe</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, ouverte</strong></p>
      <h3>Symptôme</h3>
      <p>Dans Réglages → BYOK → OpenCode, le test de connexion expire de manière fiable à 45 secondes. Le détail étrange : si l'utilisateur ouvre d'abord le terminal d'OpenCode Desktop et y attache un LLM local, le même test Open Design réussit alors à l'essai suivant.</p>
      <h3>Pourquoi cela arrive</h3>
      <p>Ce détail « ouvrez d'abord le terminal Desktop » est tout l'indice. Open Design ne s'attache pas à une session OpenCode Desktop en cours d'exécution. Pour un test de fumée des Réglages, le daemon lance son propre sous-processus CLI OpenCode tout frais et attend une réponse <code>ok</code>. Avec un modèle local froid — qui n'a pas encore été chargé en mémoire — cette première réponse peut prendre plus que le budget de 45 secondes, car le modèle est lu depuis le disque et chauffé avant de pouvoir répondre quoi que ce soit. Ouvrir le terminal Desktop et le laisser répondre à un prompt chauffe le modèle dans le cache de l'OS d'une manière dont le sous-processus frais du daemon peut alors immédiatement bénéficier. Ce n'est donc pas vraiment un bug d'OpenCode ; c'est une hypothèse de timing de démarrage à froid qui est fausse pour les modèles locaux.</p>
      <h3>Contournement</h3>
      <p>Avant de tester OpenCode dans Open Design, ouvrez OpenCode Desktop, attachez votre LLM local et laissez-le répondre à un prompt. Lancez ensuite le test de connexion OD — le modèle est chaud et la réponse arrive dans le budget. À partir de la v0.7.0, le budget du test de connexion est aussi configurable, donc si votre modèle local est réellement lent à charger, vous pouvez augmenter la fenêtre au lieu de le chauffer à la main.</p>
      <h3>Qui le corrige</h3>
      <p>Le correctif côté daemon est une fenêtre de préchauffage plus longue ou configurable spécifiquement pour les adaptateurs de modèle local, afin qu'un modèle local froid ne soit pas jugé sur la même horloge qu'une API hébergée. C'est suivi en p0 — la plus haute priorité des cinq, car les utilisateurs de modèles locaux sont exactement le public que le BYOK est censé servir.</p>
      <h2>L'application web empaquetée refuse de se charger en HTTP simple</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, ouverte</strong></p>
      <h3>Symptôme</h3>
      <p>Bug légèrement différent, même famille. Le rapporteur exécute l'application web empaquetée sur une IP de LAN en HTTP simple, et la page lève une erreur au chargement — elle n'atteint jamais un état utilisable.</p>
      <h3>Pourquoi cela arrive</h3>
      <p>Après la PR #1428, le fournisseur d'analytique et le nonce d'export PDF ont commencé à appeler <code>crypto.randomUUID()</code> directement, en contournant l'utilitaire à paliers introduit dans la PR #900 qui se replie gracieusement lorsque l'API crypto sécurisée n'est pas disponible. Chromium n'expose pas <code>crypto.randomUUID</code> dans les contextes non sécurisés — et une simple IP de LAN en HTTP simple n'est, par définition de Chromium, pas un contexte sécurisé. L'appel direct lève donc une erreur au chargement, et la page tombe avec lui. Ce n'est pas strictement un bug BYOK, mais il mord exactement le même public : les gens qui font tourner leur propre infrastructure, souvent isolée du réseau, souvent en HTTP simple parce que monter un certificat pour un outil interne ne vaut pas la friction.</p>
      <h3>Contournement</h3>
      <p>Servez l'application web en HTTPS ou via <code>localhost</code>. Les deux satisfont l'exigence de contexte sécurisé de Chromium — <code>localhost</code> est traité comme sécurisé même sans certificat — et la page se charge normalement. Pour une configuration interne rapide, <code>localhost</code> est le chemin sans coût ; pour l'accès LAN, un certificat auto-signé en HTTPS est le chemin durable.</p>
      <h3>Qui le corrige</h3>
      <p>La PR #1621 réachemine les sites d'appel restants à travers l'utilitaire UUID à paliers de la PR #900, afin que le repli de contexte sécurisé s'applique de nouveau partout au lieu de seulement là où il était déjà câblé. Elle est ouverte et en cours de revue.</p>
      <h2>Ce que cela dit réellement du BYOK dans Open Design</h2>
      <p>Lisez la liste comme une carte de contrat, pas comme un verdict de qualité. Quatre de ces cinq issues se situent aux frontières d'adaptateurs — le chemin de lancement du CLI de Gemini, le transport CLI lié à argv de DeepSeek, le modèle de lancement à froid d'OpenCode, les règles de contexte sécurisé de la plateforme hôte. La cinquième, celle de Finish Design, se situe à notre propre endpoint de finalisation, où nous avons codé en dur une réponse de forme Anthropic il y a une version et ne l'avons pas encore généralisée. Celle-là est de notre fait ; les quatre autres sont la taxe que vous payez pour respecter des outils que vous n'avez pas construits.</p>
      <p>Et c'est là le point structurel. Tout système BYOK qui n'est pas un proxy rebaptisé finit ici. Soit vous possédez l'inférence — et perdez le BYOK, car vous devenez celui qui achète les tokens et les majore — soit vous respectez les outils amont et héritez de leurs bords : leurs CLI, leurs particularités d'empaquetage, les limites de plateforme que chacun gère différemment. Nous avons <a href="/blog/why-we-built-open-design-as-a-skill-layer/">choisi la seconde posture délibérément</a>, et nous la choisirions de nouveau. Le coût, ce sont des semaines qui ressemblent à celle-ci, où les équipes daemon et adaptateurs ont enregistré du travail sur cinq surfaces en deux jours.</p>
      <p>Le compromis reste le bon. Une configuration fonctionnelle sur Claude Code, Codex, Cursor, Gemini Pro sous macOS, et DeepSeek sous Linux — la matrice qui couvre environ 90 % de nos utilisateurs réels — tourne proprement aujourd'hui, sans taxe de proxy et sans marge sur vos tokens. Les cinq fils ci-dessus sont à quoi ressemblent les 10 % restants de la matrice à la mi-mai 2026 : nommés, enregistrés, et chacun avec un correctif en cours. Des coutures honnêtes valent mieux qu'une surface lisse qui cache où va la facture.</p>
      <h2>Quoi utiliser aujourd'hui (matrice)</h2>
      <p>Voici la version pratique de la section ci-dessus — les cinq mêmes coutures, mises en correspondance avec ce qu'il est sûr d'utiliser maintenant. Un ✓ signifie que le chemin fonctionne tel quel ; un ✗ renvoie à l'issue qui le bloque, avec le contournement dans la section concernée.</p>




































































      <table><thead><tr><th>Fournisseur</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Chemin Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>natif</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>natif</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>natif</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter</td></tr><tr><td>DeepSeek TUI (longs prompts)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim OpenRouter</td></tr><tr><td>OpenCode (modèle local)</td><td>✓</td><td>✓</td><td>✓ (chauffer d'abord, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/a</td></tr></tbody></table>
      <p>Deux lectures de ce tableau. Si votre stack est dans le bloc tout-✓ — Claude Code, Codex, Cursor ou Gemini Pro — vous êtes sur le chemin propre et rien de ce qui précède ne change votre journée. Si vous êtes sur l'une des lignes ✗, la section correspondante contient le contournement qui vous fait tourner aujourd'hui en attendant que le correctif lié arrive. Dans tous les cas, abonnez-vous au <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">label BYOK sur le tracker</a> si vous voulez une notification quand une ligne bascule de ✗ à ✓.</p>
      <h2>Quoi faire ensuite</h2>
      <p>La <a href="https://github.com/nexu-io/open-design/tree/main/skills">bibliothèque de skills</a> d'Open Design est la couche de travail sous tout cela — les contrats pilotés par fichiers que l'adaptateur BYOK alimente une fois la connexion saine. Les coutures ci-dessus concernent l'acheminement des octets de votre clé au modèle et retour ; les skills sont ce que le modèle en fait réellement. Si vous voulez voir ce qu'un skill consomme du modèle et ce dont il se moque — ce qui explique aussi pourquoi ces bords d'adaptateur ne changent pas la sortie, seulement si vous l'atteignez — ce répertoire est le bon point de départ.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Parcourez la bibliothèque de skills</a>.</p>
      <h2>Lectures associées</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow de design BYOK : faites tourner Claude, Codex ou Qwen sur votre propre clé</a> — l'explication originale du BYOK, et le chemin fonctionnel au bord duquel se trouvent les cinq coutures ci-dessus</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de skills, pas un produit</a> — pourquoi nous respectons les outils amont au lieu de les envelopper dans un proxy, ce qui est toute la raison de l'existence de ces frontières</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems — comment fonctionne la bibliothèque</a> — ce que le BYOK alimente réellement une fois la connexion saine</li>
      </ul>
  ru:
    title: "BYOK без прикрас: 5 вещей, которые ломаются в Open Design сегодня"
    summary: "Мы обещали BYOK как полноценную возможность. Пять открытых баг-тредов за эту неделю — Gemini, DeepSeek, OpenCode, Windows — показывают, где швы всё ещё грубые и чем пользоваться, пока не выйдет каждое исправление."
    bodyHtml: |
      <p>Мы говорим людям, что Open Design построен на BYOK с самого основания. Это по-прежнему так. Стартовый пост о <a href="/blog/byok-design-workflow-claude-codex-qwen/">рабочем процессе BYOK</a> проходит по работающему пути — направьте daemon на любую совместимую с OpenAI конечную точку, вставьте свой ключ, и готово. Для большинства конфигураций это вся история, и она остаётся всей историей.</p>
      <p>Но «BYOK» — это не одна функция. Это контракт, который дотягивается до составителя чата, конечной точки финализации, выбора модели, пути запуска CLI и слоя аналитики. Каждое из этих мест — точка, где контракт может сломаться, и прямо сейчас несколько из них являются открытыми issue в нашем <a href="https://github.com/nexu-io/open-design/issues">публичном трекере</a>, заведёнными пользователями за последние 48 часов.</p>
      <p>Мы могли бы написать стартовый пост и на этом остановиться. Вместо этого вот честный разбор: треды, пришедшие на этой неделе, что ломается, почему ломается, что делать сегодня и какой PR (или слот в roadmap) это исправляет. Ничего из этого не скрыто. Всё заведено, размечено и приведено по ссылкам ниже — и мы предпочитаем, чтобы вы узнали об этом от нас, а не наткнулись на это посреди демонстрации в пятницу.</p>
      <h2>Обещание против списка багов</h2>
      <p>Постановка вопроса важна, потому что лёгкое неверное прочтение — «BYOK сырой». Это не так. Ни один из пяти ниже не является багом «BYOK не работает». Каждый из них живёт на границе между адаптером, который принадлежит нам — слоем совместимости с OpenAI, выбором модели, путём финализации — и тем, что нам не принадлежит: CLI вышестоящего провайдера, его решения по упаковке или модель процессов хост-платформы.</p>
      <p>Эта граница — там, где в любом open-source CLI-оркестраторе живёт реальность. Мы не запускаем инференс, мы не поставляем форкнутый CLI под каждого провайдера и мы не оборачиваем всё в прокси, который сглаживает края (и тихо облагает налогом ваши токены). Цена такой позиции в том, что когда CLI провайдера меняет форму или Windows навязывает ограничение, которого нет у macOS, шов становится виден. На этой неделе пять таких швов проявились разом.</p>
      <p>Вот все пять, в порядке поступления.</p>
      <h2>Gemini теряется по пути к «Finish Design»</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, open</strong></p>
      <h3>Симптом</h3>
      <p>BYOK настроен для Gemini. Тест подключения в настройках проходит успешно. Выбор модели возвращает модели Gemini. Обычный чат работает — вы можете провести полноценный разговор на собственном ключе Gemini без проблем. Но в тот момент, когда пользователь нажимает <strong>Finish Design</strong>, daemon выдаёт ошибку в форме Anthropic, словно он вдруг забыл, с каким провайдером он разговаривал.</p>
      <h3>Почему это происходит</h3>
      <p>Ответ мейнтейнера в треде это подтверждает: обычный чат в режиме API уважает выбранного BYOK-провайдера Gemini из конца в конец, но Finish Design ещё не обобщён за пределы пути финализации, совместимого с Anthropic. Всё остальное маршрутизируется через прокси с учётом провайдера, который умеет говорить на диалекте каждого upstream. Finish Design всё ещё идёт через жёстко прописанную конечную точку финализации Anthropic, оставшуюся от более раннего релиза — поэтому ответ Gemini, приходящий в форме, отличной от Anthropic, спотыкает парсер.</p>
      <h3>Обходное решение</h3>
      <p>Направьте Gemini через OpenRouter в слоте провайдера, совместимого с Anthropic. Тогда путь Finish Design видит ответ в форме Anthropic, возвращающийся из шима OpenRouter, и финализирует корректно. Это лишний переход, и вы платите за маршрутизацию OpenRouter, а не обращаетесь к Gemini напрямую, но это стабильно работает сегодня и покрывает тот единственный путь, который сломан, не задевая путь чата, который уже работает.</p>
      <h3>Кто это исправляет</h3>
      <p>Обобщение Finish Design теперь находится в roadmap BYOK как P1. PR пока нет — это следующее, за что возьмётся команда daemon, и это единственный из пяти, который является дефектом в коде, полностью принадлежащем нам, а не несоответствием на границе.</p>
      <h2>Gemini 3 Flash умирает на Windows ещё до того, как доходит промпт</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, open</strong></p>
      <h3>Симптом</h3>
      <p>Gemini 3 Flash Preview падает внутри Open Design на Windows с <code>stdin: write EOF</code> примерно через 1,5 секунды — ещё до того, как промпт вообще доходит до модели. Gemini 3 Pro прекрасно работает в той же самой установке. А прямой Gemini CLI (<code>gemini --model gemini-3-flash-preview ...</code>) срабатывает, когда установлено <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>. Значит, дело не в ключе, не в аккаунте и не в CLI самом по себе.</p>
      <h3>Почему это происходит</h3>
      <p>Диагностика заняла два захода, и это стоит показать, потому что это хороший пример того, как такие вещи распутываются. Первое прочтение скриншота репортёра выглядело как ошибка квоты <code>429 RESOURCE_EXHAUSTED</code> на стороне upstream. После чистого воспроизведения в PowerShell, которое записало <code>OD_GEMINI_3_FLASH_OK</code> в stdout, картина изменилась: модель доступна, CLI исправен, сбой происходит конкретно на пути запуска Open Design → Gemini CLI, и он специфичен для варианта Flash на Windows. Pro проходит тот же путь запуска и выживает; Flash — нет.</p>
      <h3>Обходное решение</h3>
      <p>Выберите Gemini 3 Pro Preview в выборе модели. Он проходит через тот же путь запуска и работает. Отдельно — и эта деталь отняла больше времени, чем сам баг — проверьте <code>~/.gemini/hooks/</code>. Медленный хук <code>gsd-check-update.js</code> (<code>Hook execution error: Hook timed out after 60000ms</code>) добавлял примерно 104 с накладных расходов на каждый запуск в случае этого пользователя, совершенно независимо от сбоя Flash. Почистите свои хуки Gemini в любом случае; зависший хук проверки обновлений заставит любой агент казаться сломанным.</p>
      <h3>Кто это исправляет</h3>
      <p>Помечено как специфичное для Flash и относящееся к стороне OD. Расследование пути записи в stdin со стороны daemon в процессе — <code>write EOF</code> говорит, что stdin дочернего процесса закрылся до того, как daemon закончил писать промпт, так что исправление лежит в том, как именно порождается этот конкретный вариант.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Матрица чек-листа, где часть строк проходит, а несколько показывают отметку поломки, выделенная зелёной рамкой на почти белом редакционном фоне">
        <figcaption>Пять честных швов — каждый живёт на границе между адаптером, который принадлежит нам, и CLI, который нам не принадлежит.</figcaption>
      </figure>
      <h2>У DeepSeek TUI на Windows потолок промпта в 30 КБ</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, open</strong></p>
      <h3>Симптом</h3>
      <p>На обёртке DeepSeek v0.8.33 в упакованной сборке для Windows длинный составленный промпт не проходит нашу предполётную проверку с <code>81397 > 30000 bytes</code>. Пользователь не сделал ничего неправильного — он просто составил промпт, достаточно насыщенный (системный контекст, дизайн-система, референсы), чтобы перешагнуть за 30 КБ.</p>
      <h3>Почему это происходит</h3>
      <p>Эта проверка намеренная, и она защищает вас от ошибки похуже. Адаптер DeepSeek TUI сейчас отправляет промпт как позиционный аргумент командной строки — привязанный к argv — а Windows ограничивает общую длину командной строки заметно ниже, чем macOS и Linux. Без предполётной проверки тот же промпт упал бы позже, глубже в порождении процесса, с куда менее полезной ошибкой <code>ENAMETOOLONG</code> и без намёка на то, что причина была в размере промпта. Поэтому мы падаем рано и называем число. Несоответствие, которое вскрывает этот issue, — в документации: высокоуровневые рекомендации подразумевают, что запасные варианты для длинных промптов на Windows применяются широко, но у пути DeepSeek TUI его пока нет — его транспорт по-прежнему argv, а не stdin или файл с промптом.</p>
      <h3>Обходное решение</h3>
      <p>Если вы на Windows с адаптером DeepSeek TUI, держите составленный промпт меньше 30 КБ или переключитесь на адаптер на основе stdin — Claude Code, Codex и OpenCode все принимают промпт через stdin и не имеют сопоставимого потолка. На macOS и Linux эта проблема вообще не кусается; лимит argv там достаточно высок, чтобы реальные промпты до него не дотягивались.</p>
      <h3>Кто это исправляет</h3>
      <p>Правильное исправление — транспорт через stdin или файл с промптом для адаптера DeepSeek TUI, что полностью убирает потолок argv и приводит его в соответствие с адаптерами на stdin. Это отслеживается в очереди команды адаптеров.</p>
      <h2>Тест локального CLI OpenCode истекает по таймауту до того, как модель прогреется</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, open</strong></p>
      <h3>Симптом</h3>
      <p>В Settings → BYOK → OpenCode тест подключения стабильно истекает по таймауту на 45 секундах. Странность в том, что если пользователь сначала открывает терминал OpenCode Desktop и подключает там локальную LLM, то тот же тест Open Design затем срабатывает со следующей попытки.</p>
      <h3>Почему это происходит</h3>
      <p>Эта деталь «сначала открой терминал Desktop» — вся разгадка. Open Design не подключается к запущенной сессии OpenCode Desktop. Для smoke-теста в настройках daemon порождает собственный свежий подпроцесс OpenCode CLI и ждёт ответа <code>ok</code>. С холодной локальной моделью — той, что ещё не загружена в память — этот первый ответ может занять дольше, чем бюджет в 45 секунд, потому что модель считывается с диска и прогревается, прежде чем она вообще сможет что-то ответить. Открытие терминала Desktop и ответ на один промпт прогревает модель в кеше ОС так, что свежий подпроцесс daemon затем может сразу же этим воспользоваться. Так что это на самом деле не баг OpenCode; это неверное предположение о времени холодного старта для локальных моделей.</p>
      <h3>Обходное решение</h3>
      <p>Перед тестированием OpenCode в Open Design откройте OpenCode Desktop, подключите свою локальную LLM и дайте ей ответить на один промпт. Затем запустите тест подключения OD — модель прогрета, и ответ укладывается в бюджет. Начиная с v0.7.0 бюджет теста подключения также настраивается, так что если ваша локальная модель действительно медленно загружается, вы можете увеличить окно вместо того, чтобы прогревать её вручную.</p>
      <h3>Кто это исправляет</h3>
      <p>Исправление на стороне daemon — это более длинное или настраиваемое окно прогрева специально для адаптеров локальных моделей, чтобы холодную локальную модель не судили по тем же часам, что и хостируемый API. Это отслеживается с приоритетом p0 — наивысшим из пяти, потому что пользователи локальных моделей — это именно та аудитория, которой призван служить BYOK.</p>
      <h2>Упакованное веб-приложение отказывается загружаться по обычному HTTP</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, open</strong></p>
      <h3>Симптом</h3>
      <p>Немного другой баг, то же семейство. Репортёр запускает упакованное веб-приложение на LAN-IP по обычному HTTP, и страница падает при загрузке — она так и не доходит до рабочего состояния.</p>
      <h3>Почему это происходит</h3>
      <p>После PR #1428 провайдер аналитики и nonce экспорта PDF начали вызывать <code>crypto.randomUUID()</code> напрямую, минуя многоуровневый помощник, введённый в PR #900, который аккуратно откатывается, когда безопасный crypto API недоступен. Chromium не выставляет <code>crypto.randomUUID</code> в небезопасных контекстах — а голый LAN-IP по обычному HTTP, по определению Chromium, не является безопасным контекстом. Поэтому прямой вызов падает на этапе загрузки, и страница уходит вместе с ним. Строго говоря, это не баг BYOK, но он кусает ровно ту же аудиторию: людей, которые запускают собственную инфраструктуру, часто изолированную от сети, часто по обычному HTTP, потому что поднимать сертификат для внутреннего инструмента не стоит возни.</p>
      <h3>Обходное решение</h3>
      <p>Раздавайте веб-приложение по HTTPS или через <code>localhost</code>. Оба варианта удовлетворяют требованию безопасного контекста Chromium — <code>localhost</code> считается безопасным даже без сертификата — и страница загружается нормально. Для быстрой внутренней настройки <code>localhost</code> — путь с нулевыми затратами; для доступа по LAN самоподписанный сертификат поверх HTTPS — путь надёжный.</p>
      <h3>Кто это исправляет</h3>
      <p>PR #1621 направляет оставшиеся места вызова обратно через многоуровневый помощник UUID из PR #900, так что запасной вариант для безопасного контекста снова применяется везде, а не только там, где он уже был подключён. Он открыт и находится на ревью.</p>
      <h2>Что это на самом деле говорит о BYOK в Open Design</h2>
      <p>Читайте этот список как карту контракта, а не как вердикт о качестве. Четыре из этих пяти issue сидят на границах адаптеров — путь запуска CLI у Gemini, транспорт CLI с привязкой к argv у DeepSeek, модель холодного старта у OpenCode, правила безопасного контекста хост-платформы. Пятый, тот что с Finish Design, — на нашей собственной конечной точке финализации, где мы релиз назад жёстко прописали ответ в форме Anthropic и пока не обобщили его. Этот на нас; остальные четыре — налог, который вы платите за уважение к инструментам, которые создали не вы.</p>
      <p>И в этом структурный смысл. Любая система BYOK, которая не является переименованным прокси, в итоге приходит сюда. Вы либо владеете инференсом — и теряете BYOK, потому что теперь это вы покупаете токены и накручиваете на них наценку — либо вы уважаете вышестоящие инструменты и наследуете их края: их CLI, их причуды упаковки, лимиты платформ, которые каждый обрабатывает по-своему. Мы <a href="/blog/why-we-built-open-design-as-a-skill-layer/">намеренно выбрали вторую позицию</a> и выбрали бы её снова. Цена — недели вроде этой, когда команды daemon и адаптеров завели работу по пяти поверхностям за два дня.</p>
      <p>Размен всё ещё правильный. Рабочая конфигурация на Claude Code, Codex, Cursor, Gemini Pro на macOS и DeepSeek на Linux — матрица, которая покрывает примерно 90% наших реальных пользователей — сегодня работает чисто, без налога прокси и без наценки на ваши токены. Пять тредов выше — это то, как выглядят остальные 10% матрицы в середине мая 2026 года: названные, заведённые, и у каждого исправление в работе. Честные швы лучше гладкой поверхности, которая прячет, куда уходит счёт.</p>
      <h2>Чем пользоваться сегодня (матрица)</h2>
      <p>Это практическая версия раздела выше — те же пять швов, наложенные на то, к чему безопасно обращаться прямо сейчас. Значок ✓ означает, что путь работает как есть; ✗ ссылается на issue, который его блокирует, с обходным решением в соответствующем разделе.</p>




































































      <table><thead><tr><th>Провайдер</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Путь Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>нативный</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>нативный</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>нативный</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>шим OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>шим OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>шим OpenRouter</td></tr><tr><td>DeepSeek TUI (длинные промпты)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>шим OpenRouter</td></tr><tr><td>OpenCode (локальная модель)</td><td>✓</td><td>✓</td><td>✓ (сначала прогрев, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/a</td></tr></tbody></table>
      <p>Два прочтения этой таблицы. Если ваш стек в блоке со сплошными ✓ — Claude Code, Codex, Cursor или Gemini Pro — вы на чистом пути, и ничего из вышесказанного не меняет ваш день. Если вы на одной из строк с ✗, в соответствующем разделе есть обходное решение, которое поможет вам работать сегодня, пока выходит связанное исправление. В любом случае подпишитесь на <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">метку BYOK в трекере</a>, если хотите уведомление, когда строка переключится с ✗ на ✓.</p>
      <h2>Что делать дальше</h2>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Библиотека skills</a> Open Design — это рабочий слой под всем этим: контракты на основе файлов, в которые подаёт данные адаптер BYOK, как только подключение исправно. Швы выше — про то, как доставить байты от вашего ключа к модели и обратно; skills — это то, что модель на самом деле с ними делает. Если вы хотите увидеть, что skill потребляет от модели, а что ему безразлично — это также и причина, по которой эти края адаптеров не меняют выход, а лишь то, дойдёте ли вы до него — эта директория и есть правильное место, чтобы начать.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Просмотреть библиотеку skills</a>.</p>
      <h2>Похожее по теме</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Рабочий процесс дизайна на BYOK: запускайте Claude, Codex или Qwen на собственном ключе</a> — исходное объяснение BYOK и рабочий путь, на краю которого сидят пять швов выше</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой skill, а не как продукт</a> — почему мы уважаем вышестоящие инструменты, а не оборачиваем их в прокси, что и есть главная причина существования этих границ</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 системы — как работает библиотека</a> — во что на самом деле подаёт данные BYOK, как только подключение исправно</li>
      </ul>
  es:
    title: "Comprobación de la realidad de BYOK: 5 cosas que fallan hoy en Open Design"
    summary: "Prometimos BYOK como ciudadano de primera clase. Cinco hilos de errores abiertos esta semana — Gemini, DeepSeek, OpenCode, Windows — muestran dónde siguen ásperas las costuras, y qué usar hasta que llegue cada corrección."
    bodyHtml: |
      <p>Llevamos tiempo diciéndole a la gente que Open Design es BYOK desde sus cimientos. Eso sigue siendo cierto. La publicación inicial sobre el <a href="/blog/byok-design-workflow-claude-codex-qwen/">flujo de diseño BYOK</a> recorre el camino que funciona: apunta el daemon a cualquier endpoint compatible con OpenAI, pega tu clave y listo. Para la mayoría de las configuraciones, esa es toda la historia, y sigue siendo toda la historia.</p>
      <p>Pero «BYOK» no es una sola función. Es un contrato que llega hasta el compositor del chat, el endpoint de finalización, el selector de modelos, la ruta de arranque de la CLI y la capa de analítica. Cada uno de esos puntos es un lugar donde el contrato puede romperse — y ahora mismo varios de ellos son issues abiertos en nuestro <a href="https://github.com/nexu-io/open-design/issues">tracker público</a>, reportados por usuarios en las últimas 48 horas.</p>
      <p>Podríamos haber escrito la publicación inicial y detenernos ahí. En cambio, aquí va la ronda de honestidad: los hilos que llegaron esta semana, qué falla, por qué falla, qué hacer hoy y qué PR (o casilla del roadmap) lo está corrigiendo. Ninguno de estos está oculto. Están registrados, etiquetados y enlazados más abajo — y preferimos que los leas de nuestra mano a que los descubras a mitad de una presentación un viernes.</p>
      <h2>La promesa frente a la lista de errores</h2>
      <p>El encuadre importa, porque la lectura fácil y equivocada es «BYOK está a medio hacer». No lo está. Ninguno de los cinco de abajo es un error del tipo «BYOK no funciona». Cada uno de ellos vive en la frontera entre un adaptador que nos pertenece — la capa compatible con OpenAI, el selector de modelos, la ruta de finalización — y otro que no: la CLI del proveedor upstream, sus decisiones de empaquetado o el modelo de procesos de la plataforma anfitriona.</p>
      <p>Esa frontera es donde vive la realidad en cualquier orquestador de CLI de código abierto. No ejecutamos inferencia, no enviamos una CLI bifurcada para cada proveedor y no envolvemos todo en un proxy que suaviza los bordes (y grava silenciosamente tus tokens). El precio de esa postura es que, cuando la CLI de un proveedor cambia de forma, o Windows impone un límite que macOS no, la costura se nota. Esta semana, cinco de esas costuras se notaron a la vez.</p>
      <p>Aquí están las cinco, en el orden en que llegaron.</p>
      <h2>Gemini se pierde camino a «Finish Design»</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, open</strong></p>
      <h3>Síntoma</h3>
      <p>BYOK está configurado para Gemini. La prueba de conexión en Ajustes tiene éxito. El selector de modelos devuelve modelos de Gemini. El chat normal funciona — puedes mantener una conversación completa contra tu propia clave de Gemini sin problema. Pero en el momento en que el usuario pulsa <strong>Finish Design</strong>, el daemon lanza un error con forma de Anthropic, como si de pronto hubiera olvidado con qué proveedor estaba hablando.</p>
      <h3>Por qué ocurre</h3>
      <p>La respuesta del maintainer en el hilo lo confirma: el chat normal en modo API respeta de extremo a extremo el proveedor BYOK de Gemini seleccionado, pero Finish Design aún no se ha generalizado más allá de la ruta de finalización compatible con Anthropic. Todo lo demás se enruta a través del proxy consciente del proveedor que sabe cómo hablar el dialecto de cada upstream. Finish Design todavía pasa por un endpoint de finalización de Anthropic codificado a mano que quedó de una versión anterior — así que una respuesta de Gemini que llega con una forma no-Anthropic hace tropezar al parser.</p>
      <h3>Solución temporal</h3>
      <p>Enruta Gemini a través de OpenRouter en la casilla de proveedor compatible con Anthropic. La ruta de Finish Design ve entonces una respuesta con forma de Anthropic que vuelve del shim de OpenRouter y finaliza correctamente. Es un salto adicional, y estás pagando el enrutamiento de OpenRouter en lugar de llamar a Gemini directamente, pero hoy es estable y cubre la única ruta que está rota sin tocar la ruta de chat que ya funciona.</p>
      <h3>Quién lo está corrigiendo</h3>
      <p>La generalización de Finish Design está ahora en el roadmap de BYOK como P1. Todavía no hay PR — esto es lo siguiente que el equipo del daemon va a abordar, y es el único de los cinco que es un defecto en código que nos pertenece por completo en lugar de un desajuste de frontera.</p>
      <h2>Gemini 3 Flash muere en Windows antes de que llegue el prompt</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, open</strong></p>
      <h3>Síntoma</h3>
      <p>Gemini 3 Flash Preview falla dentro de Open Design en Windows con <code>stdin: write EOF</code> tras aproximadamente 1,5 segundos — antes de que el prompt llegue siquiera al modelo. Gemini 3 Pro funciona bien en exactamente la misma instalación. Y la CLI directa de Gemini (<code>gemini --model gemini-3-flash-preview ...</code>) tiene éxito cuando se establece <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>. Así que no es la clave, ni la cuenta, ni la CLI por sí sola.</p>
      <h3>Por qué ocurre</h3>
      <p>El diagnóstico llevó dos pasadas, lo cual vale la pena mostrar porque es un buen ejemplo de cómo se desenredan estas cosas. La primera lectura de la captura de pantalla del reportante parecía un error de cuota upstream <code>429 RESOURCE_EXHAUSTED</code>. Tras una reproducción limpia en PowerShell que escribió <code>OD_GEMINI_3_FLASH_OK</code> en stdout, el panorama cambió: el modelo es alcanzable, la CLI está sana, el fallo está en la ruta de arranque de Open Design → Gemini CLI específicamente, y es específico de la variante Flash en Windows. Pro toma la misma ruta de arranque y sobrevive; Flash no.</p>
      <h3>Solución temporal</h3>
      <p>Selecciona Gemini 3 Pro Preview en el selector de modelos. Se ejecuta por la misma ruta de arranque y funciona. Por separado — y esta parte se llevó más tiempo que el propio error — revisa <code>~/.gemini/hooks/</code>. Un hook <code>gsd-check-update.js</code> lento (<code>Hook execution error: Hook timed out after 60000ms</code>) estaba añadiendo aproximadamente 104 s de sobrecarga a cada ejecución en el caso de este usuario, totalmente independiente del fallo de Flash. Limpia tus hooks de Gemini de todas formas; un hook de comprobación de actualizaciones atascado hará que cualquier agente parezca roto.</p>
      <h3>Quién lo está corrigiendo</h3>
      <p>Marcado como específico de Flash y del lado de OD. La investigación está en curso sobre la ruta de escritura de stdin del daemon — el <code>write EOF</code> dice que el stdin del proceso hijo se cerró antes de que el daemon terminara de escribir el prompt, así que la corrección reside en cómo se hace spawn de esa variante en particular.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Una matriz de lista de comprobación donde algunas filas pasan y unas pocas muestran una marca de fallo, seleccionada en un marco verde sobre un fondo editorial casi blanco">
        <figcaption>Cinco costuras honestas — cada una vive en la frontera entre un adaptador que nos pertenece y una CLI que no.</figcaption>
      </figure>
      <h2>La TUI de DeepSeek tiene un techo de 30 KB de prompt en Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, open</strong></p>
      <h3>Síntoma</h3>
      <p>En el wrapper de DeepSeek v0.8.33 en una compilación empaquetada de Windows, un prompt compuesto largo falla nuestra guarda previa al vuelo con <code>81397 > 30000 bytes</code>. El usuario no hizo nada mal — simplemente compuso un prompt lo bastante rico (contexto de sistema, sistema de diseño, referencias) como para superar los 30 KB.</p>
      <h3>Por qué ocurre</h3>
      <p>Esa guarda es intencional, y te está protegiendo de un error peor. El adaptador de la TUI de DeepSeek envía actualmente el prompt como un argumento posicional de línea de comandos — ligado a argv — y Windows limita la línea de comandos total muy por debajo de donde lo hacen macOS y Linux. Sin la comprobación previa al vuelo, el mismo prompt fallaría más tarde, más adentro del spawn, con un error <code>ENAMETOOLONG</code> mucho menos útil y sin pista alguna de que la causa fuera el tamaño del prompt. Así que fallamos pronto y nombramos el número. El desajuste que expone el issue está en la documentación: la guía de alto nivel da a entender que los recursos alternativos para prompts largos en Windows se aplican de forma amplia, pero la ruta de la TUI de DeepSeek aún no tiene uno — su transporte sigue siendo argv, no stdin ni un archivo de prompt.</p>
      <h3>Solución temporal</h3>
      <p>Si estás en Windows con el adaptador de la TUI de DeepSeek, mantén el prompt compuesto por debajo de 30 KB, o cambia a un adaptador basado en stdin — Claude Code, Codex y OpenCode reciben su prompt por stdin y no tienen un techo comparable. En macOS y Linux este issue no muerde en absoluto; el límite de argv allí es lo bastante alto como para que los prompts del mundo real no lo alcancen.</p>
      <h3>Quién lo está corrigiendo</h3>
      <p>La corrección correcta es un transporte por stdin o por archivo de prompt para el adaptador de la TUI de DeepSeek, que elimina por completo el techo de argv y lo alinea con los adaptadores de stdin. Está en la cola del equipo de adaptadores.</p>
      <h2>La prueba de CLI local de OpenCode agota su tiempo antes de que el modelo se caliente</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, open</strong></p>
      <h3>Síntoma</h3>
      <p>En Ajustes → BYOK → OpenCode, la prueba de conexión agota su tiempo de forma fiable a los 45 segundos. Lo extraño: si el usuario primero abre la terminal de OpenCode Desktop y conecta allí un LLM local, la misma prueba de Open Design tiene éxito en el siguiente intento.</p>
      <h3>Por qué ocurre</h3>
      <p>Ese detalle de «abre primero la terminal de Desktop» es la pista completa. Open Design no se conecta a una sesión de OpenCode Desktop en ejecución. Para una prueba rápida de Ajustes, el daemon hace spawn de su propio subproceso fresco de la CLI de OpenCode y espera una respuesta <code>ok</code>. Con un modelo local frío — uno que aún no se ha cargado en memoria — esa primera respuesta puede tardar más que el presupuesto de 45 segundos, porque el modelo se está leyendo del disco y calentando antes de poder responder cualquier cosa. Abrir la terminal de Desktop y dejar que responda un prompt calienta el modelo en la caché del SO de una forma de la que el subproceso fresco del daemon puede beneficiarse de inmediato. Así que en realidad no es un error de OpenCode; es una suposición de tiempo de arranque en frío que está equivocada para los modelos locales.</p>
      <h3>Solución temporal</h3>
      <p>Antes de probar OpenCode en Open Design, abre OpenCode Desktop, conecta tu LLM local y deja que responda un prompt. Luego ejecuta la prueba de conexión de OD — el modelo está caliente y la respuesta llega dentro del presupuesto. A partir de v0.7.0, el presupuesto de la prueba de conexión también es configurable, así que si tu modelo local es genuinamente lento de cargar puedes ampliar la ventana en lugar de calentarlo a mano.</p>
      <h3>Quién lo está corrigiendo</h3>
      <p>La corrección del lado del daemon es una ventana de calentamiento más larga o configurable específicamente para los adaptadores de modelos locales, de modo que un modelo local frío no sea juzgado con el mismo reloj que una API alojada. Está registrado como p0 — la máxima prioridad de los cinco, porque los usuarios de modelos locales son exactamente el público al que BYOK está destinado a servir.</p>
      <h2>La aplicación web empaquetada se niega a cargar por HTTP plano</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, open</strong></p>
      <h3>Síntoma</h3>
      <p>Error ligeramente distinto, misma familia. El reportante está ejecutando la aplicación web empaquetada sobre una IP de LAN por HTTP plano, y la página lanza un error al cargar — nunca alcanza un estado usable.</p>
      <h3>Por qué ocurre</h3>
      <p>Tras el PR #1428, el proveedor de analítica y el nonce de exportación a PDF empezaron a llamar a <code>crypto.randomUUID()</code> directamente, saltándose el helper por niveles introducido en el PR #900 que recurre con elegancia a una alternativa cuando la API segura de crypto no está disponible. Chromium no expone <code>crypto.randomUUID</code> en contextos no seguros — y una IP de LAN pelada por HTTP plano, según la definición de Chromium, no es un contexto seguro. Así que la llamada directa lanza un error en el momento de la carga, y la página se cae con ella. No es estrictamente un error de BYOK, pero muerde exactamente al mismo público: gente que ejecuta su propia infraestructura, a menudo aislada de la red, a menudo por HTTP plano porque montar un certificado para una herramienta interna no compensa la fricción.</p>
      <h3>Solución temporal</h3>
      <p>Sirve la aplicación web por HTTPS o por <code>localhost</code>. Ambos satisfacen el requisito de contexto seguro de Chromium — <code>localhost</code> se trata como seguro incluso sin certificado — y la página carga con normalidad. Para una configuración interna rápida, <code>localhost</code> es la vía de coste cero; para acceso por LAN, un certificado autofirmado por HTTPS es la duradera.</p>
      <h3>Quién lo está corrigiendo</h3>
      <p>El PR #1621 reencamina los sitios de llamada restantes de vuelta a través del helper de UUID por niveles del PR #900, de modo que la alternativa de contexto seguro se aplique de nuevo en todas partes en lugar de solo donde ya estaba cableada. Está abierto y en revisión.</p>
      <h2>Qué dice esto realmente sobre BYOK en Open Design</h2>
      <p>Lee la lista como un mapa de contrato, no como un veredicto de calidad. Cuatro de estos cinco issues residen en fronteras de adaptadores — la ruta de arranque de la CLI de Gemini, el transporte de CLI ligado a argv de DeepSeek, el modelo de arranque en frío de OpenCode, las reglas de contexto seguro de la plataforma anfitriona. El quinto, el de Finish Design, está en nuestro propio endpoint de finalización, donde codificamos a mano una respuesta con forma de Anthropic hace una versión y aún no la hemos generalizado. Ese es culpa nuestra; los otros cuatro son el impuesto que pagas por respetar herramientas que no construiste.</p>
      <p>Y ese es el punto estructural. Todo sistema BYOK que no sea un proxy con otra etiqueta acaba aquí. O bien posees la inferencia — y pierdes BYOK, porque ahora eres tú quien compra los tokens y les pone margen — o bien respetas las herramientas upstream y heredas sus bordes: sus CLI, sus rarezas de empaquetado, los límites de plataforma que cada una maneja de forma distinta. <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Elegimos la segunda postura deliberadamente</a>, y la elegiríamos de nuevo. El coste son semanas que se parecen a esta, en la que los equipos del daemon y de adaptadores registraron trabajo en cinco superficies en dos días.</p>
      <p>El intercambio sigue siendo el correcto. Una configuración que funciona en Claude Code, Codex, Cursor, Gemini Pro en macOS y DeepSeek en Linux — la matriz que cubre aproximadamente al 90 % de nuestros usuarios reales — corre limpiamente hoy, sin impuesto de proxy y sin margen sobre tus tokens. Los cinco hilos de arriba son cómo se ve el otro 10 % de la matriz a mediados de mayo de 2026: nombrados, registrados y cada uno con una corrección en marcha. Las costuras honestas le ganan a una superficie lisa que oculta a dónde va la factura.</p>
      <h2>Qué usar hoy (matriz)</h2>
      <p>Esta es la versión práctica de la sección anterior — las mismas cinco costuras, mapeadas sobre lo que es seguro usar ahora mismo. Un ✓ significa que la ruta funciona tal cual; un ✗ enlaza el issue que la está bloqueando, con la solución temporal en la sección correspondiente.</p>






























































































      <table><thead><tr><th>Proveedor</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Ruta de Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>nativa</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>nativa</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>nativa</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim de OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim de OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim de OpenRouter</td></tr><tr><td>DeepSeek TUI (prompts largos)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim de OpenRouter</td></tr><tr><td>OpenCode (modelo local)</td><td>✓</td><td>✓</td><td>✓ (calienta primero, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/a</td></tr></tbody></table>
      <p>Dos lecturas de esta tabla. Si tu stack está en el bloque todo-✓ — Claude Code, Codex, Cursor o Gemini Pro — estás en la ruta limpia y nada de lo anterior cambia tu día. Si estás en una de las filas con ✗, la sección correspondiente tiene la solución temporal que te pone en marcha hoy mientras llega la corrección enlazada. En cualquier caso, suscríbete a la <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">etiqueta BYOK en el tracker</a> si quieres una notificación cuando una fila pase de ✗ a ✓.</p>
      <h2>Qué hacer a continuación</h2>
      <p>La <a href="https://github.com/nexu-io/open-design/tree/main/skills">biblioteca de skills</a> de Open Design es la capa de trabajo que subyace a todo esto — los contratos basados en archivos que el adaptador de BYOK alimenta una vez que la conexión está sana. Las costuras de arriba tienen que ver con llevar bytes desde tu clave al modelo y de vuelta; las skills son lo que el modelo realmente hace con ellos. Si quieres ver qué consume una skill del modelo y qué le da igual — que es también la razón por la que estos bordes de adaptador no cambian la salida, solo si llegas a ella — ese directorio es el lugar correcto para empezar.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Explora la biblioteca de skills</a>.</p>
      <h2>Lecturas relacionadas</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flujo de diseño BYOK: ejecuta Claude, Codex o Qwen con tu propia clave</a> — la explicación original de BYOK, y la ruta que funciona en cuyo borde se sitúan las cinco costuras de arriba</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de skills, no como un producto</a> — por qué respetamos las herramientas upstream en lugar de envolverlas en un proxy, que es toda la razón por la que existen estas fronteras</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systems — cómo funciona la biblioteca</a> — qué alimenta realmente BYOK una vez que la conexión está sana</li>
      </ul>
  pt-br:
    title: "Teste de realidade do BYOK: 5 coisas que quebram hoje no Open Design"
    summary: "Prometemos BYOK como cidadão de primeira classe. Cinco threads de bugs abertos desta semana — Gemini, DeepSeek, OpenCode, Windows — mostram onde as costuras ainda estão ásperas, e o que usar até cada correção chegar."
    bodyHtml: |
      <p>Temos dito às pessoas que o Open Design é BYOK desde a base. Isso continua verdadeiro. O post inicial sobre o <a href="/blog/byok-design-workflow-claude-codex-qwen/">fluxo de design BYOK</a> percorre o caminho que funciona — aponte o daemon para qualquer endpoint compatível com OpenAI, cole sua chave, pronto. Para a maioria das configurações, essa é a história inteira, e ela continua sendo a história inteira.</p>
      <p>Mas “BYOK” não é um único recurso. É um contrato que alcança o compositor de chat, o endpoint de finalização, o seletor de modelo, o caminho de inicialização do CLI e a camada de analytics. Cada um deles é um lugar onde o contrato pode quebrar — e agora mesmo vários deles são issues abertas no nosso <a href="https://github.com/nexu-io/open-design/issues">rastreador público</a>, reportadas por usuários nas últimas 48 horas.</p>
      <p>Poderíamos ter escrito o post inicial e parado por aí. Em vez disso, aqui vai a rodada de honestidade: as threads que chegaram esta semana, o que quebra, por que quebra, o que fazer hoje e qual PR (ou slot do roadmap) está corrigindo. Nenhuma delas está escondida. Estão registradas, rotuladas e linkadas abaixo — e preferimos que você as leia da nossa boca a descobri-las no meio de um deck numa sexta-feira.</p>
      <h2>A promessa vs a lista de bugs</h2>
      <p>O enquadramento importa, porque a leitura fácil e errada é “BYOK está pela metade.” Não está. Nenhum dos cinco abaixo é um bug do tipo “BYOK não funciona.” Cada um deles vive na fronteira entre um adaptador que é nosso — a camada compatível com OpenAI, o seletor de modelo, o caminho de finalização — e um que não é: o CLI do provedor upstream, as escolhas de empacotamento dele ou o modelo de processos da plataforma host.</p>
      <p>Essa fronteira é onde a realidade mora em qualquer orquestrador de CLI open-source. Não rodamos inferência, não entregamos um CLI forkado para cada provedor e não embrulhamos tudo em um proxy que suaviza as arestas (e discretamente tributa seus tokens). O preço dessa postura é que, quando o CLI de um provedor muda de formato, ou o Windows impõe um limite que o macOS não impõe, a costura aparece. Esta semana, cinco dessas costuras apareceram de uma vez.</p>
      <p>Aqui estão as cinco, na ordem em que chegaram.</p>
      <h2>O Gemini se perde no caminho para o “Finish Design”</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, aberta</strong></p>
      <h3>Sintoma</h3>
      <p>O BYOK está configurado para Gemini. O teste de conexão em Configurações é bem-sucedido. O seletor de modelo retorna modelos Gemini. O chat normal funciona — você consegue manter uma conversa completa contra a sua própria chave Gemini sem problema. Mas no momento em que o usuário clica em <strong>Finish Design</strong>, o daemon lança um erro no formato Anthropic, como se de repente tivesse esquecido com qual provedor estava falando.</p>
      <h3>Por que acontece</h3>
      <p>A resposta do mantenedor na thread confirma: o chat em modo API normal honra o provedor BYOK Gemini selecionado de ponta a ponta, mas o Finish Design ainda não foi generalizado para além do caminho de finalização compatível com Anthropic. Todo o resto é roteado pelo proxy ciente do provedor que sabe falar o dialeto de cada upstream. O Finish Design ainda passa por um endpoint de finalização Anthropic codificado, herdado de uma release anterior — então uma resposta Gemini chegando em um formato não-Anthropic derruba o parser.</p>
      <h3>Contorno</h3>
      <p>Roteie o Gemini pelo OpenRouter no slot de provedor compatível com Anthropic. O caminho do Finish Design então vê uma resposta no formato Anthropic voltando do shim do OpenRouter e finaliza corretamente. É um salto extra, e você paga o roteamento do OpenRouter em vez de chamar o Gemini diretamente, mas é estável hoje e cobre o único caminho que está quebrado sem tocar no caminho de chat que já funciona.</p>
      <h3>Quem está corrigindo</h3>
      <p>A generalização do Finish Design está agora no roadmap do BYOK como P1. Ainda sem PR — é a próxima coisa que o time do daemon vai pegar, e é a única das cinco que é um defeito em código que possuímos por completo, em vez de um descompasso de fronteira.</p>
      <h2>O Gemini 3 Flash morre no Windows antes do prompt chegar</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, aberta</strong></p>
      <h3>Sintoma</h3>
      <p>O Gemini 3 Flash Preview falha dentro do Open Design no Windows com <code>stdin: write EOF</code> após cerca de 1,5 segundo — antes que o prompt chegue ao modelo. O Gemini 3 Pro funciona bem na mesmíssima instalação. E o CLI direto do Gemini (<code>gemini --model gemini-3-flash-preview ...</code>) é bem-sucedido quando <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> está definido. Então não é a chave, não é a conta e não é o CLI isoladamente.</p>
      <h3>Por que acontece</h3>
      <p>O diagnóstico levou duas passadas, o que vale mostrar porque é um bom exemplo de como essas coisas são desembaraçadas. A primeira leitura do print do reportante parecia um erro de cota upstream <code>429 RESOURCE_EXHAUSTED</code>. Depois de uma reprodução limpa no PowerShell que escreveu <code>OD_GEMINI_3_FLASH_OK</code> no stdout, o quadro mudou: o modelo é alcançável, o CLI está saudável, a falha está especificamente no caminho de inicialização Open Design → Gemini CLI, e é específica da variante Flash no Windows. O Pro toma o mesmo caminho de inicialização e sobrevive; o Flash não.</p>
      <h3>Contorno</h3>
      <p>Selecione o Gemini 3 Pro Preview no seletor de modelo. Ele roda pelo mesmo caminho de inicialização e funciona. Separadamente — e essa parte tomou mais tempo que o próprio bug — verifique <code>~/.gemini/hooks/</code>. Um hook <code>gsd-check-update.js</code> lento (<code>Hook execution error: Hook timed out after 60000ms</code>) estava adicionando cerca de 104s de overhead a cada execução no caso desse usuário, totalmente independente da falha do Flash. Limpe seus hooks do Gemini de qualquer jeito; um hook de checagem de update travado fará qualquer agente parecer quebrado.</p>
      <h3>Quem está corrigindo</h3>
      <p>Sinalizado como específico do Flash e do lado do OD. A investigação está em andamento no caminho de escrita no stdin do daemon — o <code>write EOF</code> diz que o stdin do filho fechou antes de o daemon terminar de escrever o prompt, então a correção vive em como essa variante específica é iniciada.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Uma matriz de checklist onde algumas linhas passam e algumas mostram uma marca de quebra, selecionada em uma moldura verde sobre um fundo editorial quase branco">
        <figcaption>Cinco costuras honestas — cada uma vive na fronteira entre um adaptador que é nosso e um CLI que não é.</figcaption>
      </figure>
      <h2>O DeepSeek TUI tem um teto de prompt de 30 KB no Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, aberta</strong></p>
      <h3>Sintoma</h3>
      <p>No wrapper DeepSeek v0.8.33 em um build empacotado para Windows, um prompt longo composto falha na nossa guarda pré-voo com <code>81397 > 30000 bytes</code>. O usuário não fez nada de errado — apenas compôs um prompt rico o suficiente (contexto de sistema, design system, referências) para passar de 30 KB.</p>
      <h3>Por que acontece</h3>
      <p>Essa guarda é intencional, e está protegendo você de um erro pior. O adaptador DeepSeek TUI atualmente envia o prompt como um argumento posicional de linha de comando — atrelado ao argv — e o Windows limita o total da linha de comando bem abaixo do que macOS e Linux limitam. Sem a checagem pré-voo, o mesmo prompt falharia mais tarde, mais fundo no spawn, com um erro <code>ENAMETOOLONG</code> muito menos útil e nenhuma dica de que a causa era o tamanho do prompt. Então falhamos cedo e nomeamos o número. O descompasso que a issue expõe está na documentação: a orientação de alto nível dá a entender que os fallbacks de prompt longo no Windows se aplicam amplamente, mas o caminho do DeepSeek TUI ainda não tem um — seu transporte ainda é argv, não stdin nem um arquivo de prompt.</p>
      <h3>Contorno</h3>
      <p>Se você está no Windows com o adaptador DeepSeek TUI, mantenha o prompt composto abaixo de 30 KB, ou troque para um adaptador baseado em stdin — Claude Code, Codex e OpenCode todos recebem o prompt via stdin e não têm um teto comparável. No macOS e no Linux essa issue não morde de jeito nenhum; o limite de argv lá é alto o suficiente para que prompts do mundo real não o alcancem.</p>
      <h3>Quem está corrigindo</h3>
      <p>A correção certa é um transporte por stdin ou arquivo de prompt para o adaptador DeepSeek TUI, o que remove o teto de argv por completo e o alinha aos adaptadores de stdin. Está rastreado na fila do time de adaptadores.</p>
      <h2>O teste de CLI local do OpenCode estoura o tempo antes de o modelo aquecer</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, aberta</strong></p>
      <h3>Sintoma</h3>
      <p>Em Configurações → BYOK → OpenCode, o teste de conexão estoura o tempo de forma confiável aos 45 segundos. A parte estranha: se o usuário primeiro abre o terminal do OpenCode Desktop e anexa um LLM local ali, o mesmo teste do Open Design então é bem-sucedido na próxima tentativa.</p>
      <h3>Por que acontece</h3>
      <p>Esse detalhe de “abra o terminal do Desktop primeiro” é a pista inteira. O Open Design não se anexa a uma sessão do OpenCode Desktop em execução. Para um smoke test de Configurações, o daemon inicia o seu próprio subprocesso novo do CLI do OpenCode e espera por uma resposta <code>ok</code>. Com um modelo local frio — um que ainda não foi carregado na memória — essa primeira resposta pode levar mais que o orçamento de 45 segundos, porque o modelo está sendo lido do disco e aquecido antes de poder responder qualquer coisa. Abrir o terminal do Desktop e deixá-lo responder um prompt aquece o modelo no cache do SO de um jeito do qual o subprocesso novo do daemon pode então se beneficiar imediatamente. Então não é realmente um bug do OpenCode; é uma suposição de timing de cold-start que está errada para modelos locais.</p>
      <h3>Contorno</h3>
      <p>Antes de testar o OpenCode no Open Design, abra o OpenCode Desktop, anexe seu LLM local e deixe-o responder um prompt. Depois rode o teste de conexão do OD — o modelo está aquecido e a resposta cai dentro do orçamento. A partir da v0.7.0, o orçamento do teste de conexão também é configurável, então se o seu modelo local é genuinamente lento para carregar você pode aumentar a janela em vez de aquecê-lo na mão.</p>
      <h3>Quem está corrigindo</h3>
      <p>A correção do lado do daemon é uma janela de aquecimento maior ou configurável especificamente para adaptadores de modelo local, para que um modelo local frio não seja julgado pelo mesmo relógio de uma API hospedada. Está rastreada como p0 — a maior prioridade das cinco, porque usuários de modelo local são exatamente o público que o BYOK pretende servir.</p>
      <h2>O web app empacotado se recusa a carregar via HTTP simples</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, aberta</strong></p>
      <h3>Sintoma</h3>
      <p>Bug ligeiramente diferente, mesma família. O reportante está rodando o web app empacotado em um IP de LAN via HTTP simples, e a página dá erro ao carregar — ela nunca atinge um estado utilizável.</p>
      <h3>Por que acontece</h3>
      <p>Depois do PR #1428, o provider de analytics e o nonce de exportação de PDF começaram a chamar <code>crypto.randomUUID()</code> diretamente, contornando o helper em camadas introduzido no PR #900 que faz fallback graciosamente quando a API de cripto segura não está disponível. O Chromium não expõe <code>crypto.randomUUID</code> em contextos não seguros — e um IP de LAN puro via HTTP simples é, pela definição do Chromium, um contexto não seguro. Então a chamada direta lança erro em tempo de carregamento, e a página cai junto. Não é estritamente um bug de BYOK, mas morde exatamente o mesmo público: pessoas rodando a própria infraestrutura, muitas vezes isolada da rede, muitas vezes via HTTP simples porque levantar um certificado para uma ferramenta interna não vale o atrito.</p>
      <h3>Contorno</h3>
      <p>Sirva o web app via HTTPS ou via <code>localhost</code>. Ambos satisfazem o requisito de contexto seguro do Chromium — <code>localhost</code> é tratado como seguro mesmo sem certificado — e a página carrega normalmente. Para uma configuração interna rápida, <code>localhost</code> é o caminho de custo zero; para acesso por LAN, um certificado autoassinado via HTTPS é o caminho durável.</p>
      <h3>Quem está corrigindo</h3>
      <p>O PR #1621 roteia os pontos de chamada restantes de volta pelo helper de UUID em camadas do PR #900, para que o fallback de contexto seguro se aplique a tudo de novo, em vez de apenas onde já estava ligado. Está aberto e em revisão.</p>
      <h2>O que isso realmente diz sobre o BYOK no Open Design</h2>
      <p>Leia a lista como um mapa de contrato, não como um veredito de qualidade. Quatro destas cinco issues ficam em fronteiras de adaptador — o caminho de inicialização do CLI do Gemini, o transporte de CLI atrelado ao argv do DeepSeek, o modelo de inicialização de cold-start do OpenCode, as regras de contexto seguro da plataforma host. A quinta, a do Finish Design, está no nosso próprio endpoint de finalização, onde codificamos uma resposta no formato Anthropic uma release atrás e ainda não a generalizamos. Essa é por nossa conta; as outras quatro são o imposto que você paga por respeitar ferramentas que você não construiu.</p>
      <p>E esse é o ponto estrutural. Todo sistema BYOK que não é um proxy reetiquetado acaba aqui. Ou você é dono da inferência — e perde o BYOK, porque agora você é quem compra os tokens e os remarca — ou você respeita as ferramentas upstream e herda as arestas delas: os CLIs delas, as peculiaridades de empacotamento delas, os limites de plataforma que cada uma trata de forma diferente. <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Escolhemos a segunda postura deliberadamente</a>, e escolheríamos de novo. O custo são semanas que parecem esta, em que os times de daemon e adaptadores registraram trabalho em cinco superfícies em dois dias.</p>
      <p>O trade-off continua certo. Uma configuração funcional em Claude Code, Codex, Cursor, Gemini Pro no macOS e DeepSeek no Linux — a matriz que cobre cerca de 90% dos nossos usuários reais — roda limpo hoje, sem imposto de proxy e sem margem sobre seus tokens. As cinco threads acima são o que os outros 10% da matriz parecem em meados de maio de 2026: nomeados, registrados e cada um com uma correção a caminho. Costuras honestas ganham de uma superfície lisa que esconde para onde a conta vai.</p>
      <h2>O que usar hoje (matriz)</h2>
      <p>Esta é a versão prática da seção acima — as mesmas cinco costuras, mapeadas para o que é seguro usar agora mesmo. Um ✓ significa que o caminho funciona como está; um ✗ linka a issue que o está bloqueando, com o contorno na seção relevante.</p>




































































      <table><thead><tr><th>Provedor</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Caminho do Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>nativo</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>nativo</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>nativo</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim do OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim do OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim do OpenRouter</td></tr><tr><td>DeepSeek TUI (prompts longos)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim do OpenRouter</td></tr><tr><td>OpenCode (modelo local)</td><td>✓</td><td>✓</td><td>✓ (aqueça primeiro, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/d</td></tr></tbody></table>
      <p>Duas leituras desta tabela. Se a sua stack está no bloco todo-✓ — Claude Code, Codex, Cursor ou Gemini Pro — você está no caminho limpo e nada acima muda o seu dia. Se você está em uma das linhas ✗, a seção correspondente tem o contorno que coloca você rodando hoje enquanto a correção linkada chega. De qualquer jeito, inscreva-se na <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">label BYOK no rastreador</a> se quiser uma notificação quando uma linha virar de ✗ para ✓.</p>
      <h2>O que fazer a seguir</h2>
      <p>A <a href="https://github.com/nexu-io/open-design/tree/main/skills">biblioteca de skills</a> do Open Design é a camada de trabalho por baixo de tudo isso — os contratos orientados a arquivo que o adaptador BYOK alimenta uma vez que a conexão está saudável. As costuras acima são sobre levar bytes da sua chave ao modelo e de volta; as skills são o que o modelo de fato faz com eles. Se você quer ver o que uma skill consome do modelo e o que não lhe importa — o que também é por que essas arestas de adaptador não mudam a saída, só se você a alcança — esse diretório é o lugar certo para começar.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Navegue pela biblioteca de skills</a>.</p>
      <h2>Leitura relacionada</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Fluxo de design BYOK: rode Claude, Codex ou Qwen com sua própria chave</a> — o explicador original do BYOK, e o caminho que funciona, na borda do qual as cinco costuras acima ficam</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, não um produto</a> — por que respeitamos as ferramentas upstream em vez de embrulhá-las em um proxy, que é a razão inteira pela qual essas fronteiras existem</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 sistemas — como funciona a biblioteca</a> — no que o BYOK de fato alimenta uma vez que a conexão está saudável</li>
      </ul>
  it:
    title: "Verifica della realtà BYOK: 5 cose che oggi si rompono in Open Design"
    summary: "Abbiamo promesso il BYOK come funzionalità di prima classe. Cinque thread di bug aperti questa settimana — Gemini, DeepSeek, OpenCode, Windows — mostrano dove le giunture sono ancora grezze, e cosa usare finché ogni correzione non arriva."
    bodyHtml: |
      <p>Abbiamo detto alle persone che Open Design è BYOK fin dalle fondamenta. Questo è ancora vero. L'articolo di partenza sul <a href="/blog/byok-design-workflow-claude-codex-qwen/">flusso di lavoro di design BYOK</a> illustra il percorso funzionante: punta il daemon a qualsiasi endpoint compatibile con OpenAI, incolla la tua chiave, e hai finito. Per la maggior parte delle configurazioni, questa è l'intera storia, e rimane l'intera storia.</p>
      <p>Ma "BYOK" non è una singola funzionalità. È un contratto che si estende fino al compositore di chat, all'endpoint di finalizzazione, al selettore di modelli, al percorso di avvio della CLI e al livello di analitica. Ognuno di questi è un punto in cui il contratto può rompersi, e in questo momento diversi di essi sono issue aperte nel nostro <a href="https://github.com/nexu-io/open-design/issues">tracker pubblico</a>, segnalate dagli utenti nelle ultime 48 ore.</p>
      <p>Avremmo potuto scrivere l'articolo di partenza e fermarci lì. Invece, ecco il passaggio di onestà: i thread arrivati questa settimana, cosa si rompe, perché si rompe, cosa fare oggi e quale PR (o slot della roadmap) lo sta correggendo. Nessuno di questi è nascosto. Sono archiviati, etichettati e collegati qui sotto, e preferiamo che li leggi da noi piuttosto che scoprirli a metà deck un venerdì.</p>
      <h2>La promessa contro la lista dei bug</h2>
      <p>L'inquadramento conta, perché la lettura sbagliata facile è "il BYOK è fatto a metà". Non lo è. Nessuno dei cinque qui sotto è un bug del tipo "il BYOK non funziona". Ognuno di essi vive al confine tra un adattatore che possediamo noi — il livello compatibile con OpenAI, il selettore di modelli, il percorso di finalizzazione — e uno che non possediamo: la CLI del provider a monte, le sue scelte di pacchettizzazione, o il modello di processo della piattaforma host.</p>
      <p>Quel confine è dove vive la realtà in qualsiasi orchestratore CLI open-source. Non eseguiamo inferenza, non rilasciamo una CLI forkata per ogni provider, e non avvolgiamo tutto in un proxy che leviga gli spigoli (e tassa silenziosamente i tuoi token). Il prezzo di questa postura è che quando la CLI di un provider cambia forma, o Windows impone un limite che macOS non impone, la giuntura si vede. Questa settimana, cinque di quelle giunture si sono viste tutte insieme.</p>
      <p>Eccole tutte e cinque, nell'ordine in cui sono arrivate.</p>
      <h2>Gemini si perde sulla strada verso "Finish Design"</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, aperta</strong></p>
      <h3>Sintomo</h3>
      <p>Il BYOK è configurato per Gemini. Il test di connessione nelle Impostazioni riesce. Il selettore di modelli restituisce i modelli Gemini. La chat normale funziona: puoi tenere un'intera conversazione contro la tua chiave Gemini senza problemi. Ma nel momento in cui l'utente preme <strong>Finish Design</strong>, il daemon genera un errore in forma Anthropic, come se avesse improvvisamente dimenticato con quale provider stava parlando.</p>
      <h3>Perché succede</h3>
      <p>La risposta del maintainer nel thread lo conferma: la chat in modalità API normale rispetta il provider BYOK Gemini selezionato dall'inizio alla fine, ma Finish Design non è ancora stato generalizzato oltre il percorso di finalizzazione compatibile con Anthropic. Tutto il resto viene instradato attraverso il proxy consapevole del provider che sa parlare il dialetto di ogni sistema a monte. Finish Design passa ancora attraverso un endpoint di finalizzazione Anthropic codificato fisso rimasto da una release precedente, quindi una risposta Gemini che arriva in una forma non-Anthropic fa inciampare il parser.</p>
      <h3>Soluzione temporanea</h3>
      <p>Instrada Gemini attraverso OpenRouter nello slot del provider compatibile con Anthropic. Il percorso Finish Design vede allora una risposta in forma Anthropic che ritorna dallo shim di OpenRouter e finalizza correttamente. È un salto in più, e stai pagando l'instradamento di OpenRouter anziché chiamare Gemini direttamente, ma è stabile oggi e copre l'unico percorso che è rotto senza toccare il percorso di chat che già funziona.</p>
      <h3>Chi lo sta correggendo</h3>
      <p>La generalizzazione di Finish Design è ora sulla roadmap BYOK come P1. Ancora nessuna PR: questa è la prossima cosa che il team del daemon prende in carico, ed è l'unica delle cinque a essere un difetto in codice che possediamo interamente anziché una discordanza di confine.</p>
      <h2>Gemini 3 Flash muore su Windows prima che il prompt arrivi</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, aperta</strong></p>
      <h3>Sintomo</h3>
      <p>Gemini 3 Flash Preview fallisce dentro Open Design su Windows con <code>stdin: write EOF</code> dopo circa 1,5 secondi, prima che il prompt raggiunga mai il modello. Gemini 3 Pro funziona bene nella stessa identica installazione. E la CLI Gemini diretta (<code>gemini --model gemini-3-flash-preview ...</code>) riesce quando <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> è impostato. Quindi non è la chiave, non è l'account e non è la CLI presa da sola.</p>
      <h3>Perché succede</h3>
      <p>La diagnosi ha richiesto due passaggi, il che vale la pena mostrare perché è un buon esempio di come questi vengano dipanati. La prima lettura dello screenshot del segnalatore sembrava un errore di quota a monte <code>429 RESOURCE_EXHAUSTED</code>. Dopo una riproduzione pulita in PowerShell che scriveva <code>OD_GEMINI_3_FLASH_OK</code> su stdout, il quadro è cambiato: il modello è raggiungibile, la CLI è sana, il fallimento è specificamente sul percorso di avvio Open Design → CLI Gemini, ed è specifico della variante Flash su Windows. Pro segue lo stesso percorso di avvio e sopravvive; Flash no.</p>
      <h3>Soluzione temporanea</h3>
      <p>Seleziona Gemini 3 Pro Preview nel selettore di modelli. Gira attraverso lo stesso percorso di avvio e funziona. Separatamente — e questo ha portato via più tempo del bug stesso — controlla <code>~/.gemini/hooks/</code>. Un hook lento <code>gsd-check-update.js</code> (<code>Hook execution error: Hook timed out after 60000ms</code>) stava aggiungendo circa 104s di overhead a ogni esecuzione nel caso di questo utente, completamente indipendente dal fallimento di Flash. Pulisci comunque i tuoi hook Gemini; un hook di controllo aggiornamenti in stallo farà sembrare rotto qualsiasi agente.</p>
      <h3>Chi lo sta correggendo</h3>
      <p>Contrassegnato come specifico di Flash e lato OD. L'indagine è in corso sul percorso di scrittura stdin del daemon: il <code>write EOF</code> dice che lo stdin del processo figlio si è chiuso prima che il daemon finisse di scrivere il prompt, quindi la correzione sta in come quella particolare variante viene avviata.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Una matrice di checklist in cui alcune righe passano e alcune mostrano un segno di rottura, selezionata in una cornice verde su uno sfondo editoriale quasi bianco">
        <figcaption>Cinque giunture oneste: ognuna vive al confine tra un adattatore che possediamo e una CLI che non possediamo.</figcaption>
      </figure>
      <h2>La TUI di DeepSeek ha un tetto di 30 KB per i prompt su Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, aperta</strong></p>
      <h3>Sintomo</h3>
      <p>Sul wrapper DeepSeek v0.8.33 in una build pacchettizzata per Windows, un lungo prompt composto fallisce il nostro guard pre-flight con <code>81397 > 30000 bytes</code>. L'utente non ha fatto nulla di sbagliato: ha solo composto un prompt abbastanza ricco (contesto di sistema, design system, riferimenti) da superare i 30 KB.</p>
      <h3>Perché succede</h3>
      <p>Quel guard è intenzionale, e ti sta proteggendo da un errore peggiore. L'adattatore DeepSeek TUI attualmente invia il prompt come argomento posizionale della riga di comando — legato ad argv — e Windows limita la riga di comando totale ben al di sotto di dove lo fanno macOS e Linux. Senza il controllo pre-flight, lo stesso prompt fallirebbe più tardi, più in profondità nello spawn, con un errore <code>ENAMETOOLONG</code> molto meno utile e nessun indizio che la causa fosse la dimensione del prompt. Quindi falliamo presto e nominiamo il numero. La discordanza che l'issue espone è nella documentazione: la guida di alto livello implica che i fallback per i prompt lunghi su Windows si applichino in generale, ma il percorso DeepSeek TUI non ne ha ancora uno: il suo trasporto è ancora argv, non stdin o un file di prompt.</p>
      <h3>Soluzione temporanea</h3>
      <p>Se sei su Windows con l'adattatore DeepSeek TUI, mantieni il prompt composto sotto i 30 KB, o passa a un adattatore basato su stdin: Claude Code, Codex e OpenCode prendono tutti il loro prompt tramite stdin e non hanno un tetto comparabile. Su macOS e Linux questa issue non morde affatto; il limite di argv lì è abbastanza alto che i prompt del mondo reale non lo raggiungono.</p>
      <h3>Chi lo sta correggendo</h3>
      <p>La correzione giusta è un trasporto stdin o file di prompt per l'adattatore DeepSeek TUI, che rimuove del tutto il tetto di argv e lo allinea agli adattatori stdin. È tracciata nella coda del team degli adattatori.</p>
      <h2>Il test della CLI locale di OpenCode va in timeout prima che il modello si scaldi</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, aperta</strong></p>
      <h3>Sintomo</h3>
      <p>In Impostazioni → BYOK → OpenCode, il test di connessione va regolarmente in timeout a 45 secondi. La parte strana: se l'utente apre prima il terminale di OpenCode Desktop e vi collega un LLM locale, lo stesso test di Open Design riesce poi al tentativo successivo.</p>
      <h3>Perché succede</h3>
      <p>Quel dettaglio "apri prima il terminale Desktop" è l'intero indizio. Open Design non si collega a una sessione OpenCode Desktop in esecuzione. Per un test rapido nelle Impostazioni, il daemon avvia il proprio sottoprocesso CLI OpenCode fresco e attende una risposta <code>ok</code>. Con un modello locale a freddo — uno che non è ancora stato caricato in memoria — quella prima risposta può richiedere più del budget di 45 secondi, perché il modello viene letto dal disco e scaldato prima di poter rispondere a qualsiasi cosa. Aprire il terminale Desktop e lasciargli rispondere a un prompt scalda il modello nella cache del sistema operativo in un modo da cui il sottoprocesso fresco del daemon può poi beneficiare immediatamente. Quindi non è davvero un bug di OpenCode; è un'assunzione sulla tempistica di avvio a freddo che è sbagliata per i modelli locali.</p>
      <h3>Soluzione temporanea</h3>
      <p>Prima di testare OpenCode in Open Design, apri OpenCode Desktop, collega il tuo LLM locale e lasciagli rispondere a un prompt. Poi esegui il test di connessione di OD: il modello è caldo e la risposta arriva entro il budget. A partire da v0.7.0, il budget del test di connessione è anche configurabile, quindi se il tuo modello locale è genuinamente lento da caricare puoi aumentare la finestra invece di scaldarlo a mano.</p>
      <h3>Chi lo sta correggendo</h3>
      <p>La correzione lato daemon è una finestra di riscaldamento più lunga o configurabile specificamente per gli adattatori di modelli locali, così un modello locale a freddo non viene giudicato sullo stesso orologio di un'API ospitata. È tracciata a p0 — la priorità più alta delle cinque, perché gli utenti di modelli locali sono esattamente il pubblico che il BYOK è pensato per servire.</p>
      <h2>L'app web pacchettizzata si rifiuta di caricarsi su HTTP semplice</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, aperta</strong></p>
      <h3>Sintomo</h3>
      <p>Bug leggermente diverso, stessa famiglia. Il segnalatore esegue l'app web pacchettizzata su un IP di LAN su HTTP semplice, e la pagina genera un errore al caricamento: non raggiunge mai uno stato utilizzabile.</p>
      <h3>Perché succede</h3>
      <p>Dopo la PR #1428, il provider di analitica e il nonce di esportazione PDF hanno iniziato a chiamare <code>crypto.randomUUID()</code> direttamente, bypassando l'helper a livelli introdotto nella PR #900 che ripiega con grazia quando l'API crypto sicura non è disponibile. Chromium non espone <code>crypto.randomUUID</code> nei contesti non sicuri, e un nudo IP di LAN su HTTP semplice non è, per definizione di Chromium, un contesto sicuro. Quindi la chiamata diretta genera un errore al momento del caricamento, e la pagina cade con essa. Non è strettamente un bug BYOK, ma morde esattamente lo stesso pubblico: le persone che eseguono la propria infrastruttura, spesso isolata dalla rete, spesso su HTTP semplice perché allestire un certificato per uno strumento interno non vale l'attrito.</p>
      <h3>Soluzione temporanea</h3>
      <p>Servi l'app web su HTTPS o su <code>localhost</code>. Entrambi soddisfano il requisito di contesto sicuro di Chromium — <code>localhost</code> è trattato come sicuro anche senza certificato — e la pagina si carica normalmente. Per una rapida configurazione interna, <code>localhost</code> è il percorso a costo zero; per l'accesso via LAN, un certificato autofirmato su HTTPS è quello duraturo.</p>
      <h3>Chi lo sta correggendo</h3>
      <p>La PR #1621 reinstrada i restanti punti di chiamata attraverso l'helper UUID a livelli della PR #900, così il fallback per il contesto sicuro si applica di nuovo ovunque invece che solo dove era già cablato. È aperta e in revisione.</p>
      <h2>Cosa dice davvero questo sul BYOK in Open Design</h2>
      <p>Leggi la lista come una mappa di contratti, non come un verdetto di qualità. Quattro di queste cinque issue stanno ai confini degli adattatori: il percorso di avvio della CLI di Gemini, il trasporto CLI legato ad argv di DeepSeek, il modello di avvio a freddo di OpenCode, le regole di contesto sicuro della piattaforma host. La quinta, quella di Finish Design, è al nostro stesso endpoint di finalizzazione, dove abbiamo codificato fissa una risposta in forma Anthropic una release fa e non l'abbiamo ancora generalizzata. Quella è colpa nostra; le altre quattro sono la tassa che paghi per rispettare strumenti che non hai costruito tu.</p>
      <p>Ed è questo il punto strutturale. Ogni sistema BYOK che non è un proxy rietichettato finisce qui. O possiedi l'inferenza — e perdi il BYOK, perché ora sei tu a comprare i token e a ricaricarli — oppure rispetti gli strumenti a monte ed erediti i loro spigoli: le loro CLI, le loro stranezze di pacchettizzazione, i limiti di piattaforma che ognuno gestisce in modo diverso. Abbiamo <a href="/blog/why-we-built-open-design-as-a-skill-layer/">scelto la seconda postura deliberatamente</a>, e la sceglieremmo di nuovo. Il costo sono settimane che assomigliano a questa, in cui i team del daemon e degli adattatori hanno archiviato lavoro su cinque superfici in due giorni.</p>
      <p>Il compromesso è ancora giusto. Una configurazione funzionante su Claude Code, Codex, Cursor, Gemini Pro su macOS e DeepSeek su Linux — la matrice che copre all'incirca il 90% dei nostri utenti reali — gira in modo pulito oggi, senza tassa da proxy e senza margine sui tuoi token. I cinque thread sopra sono come appare l'altro 10% della matrice a metà maggio 2026: nominati, archiviati e ciascuno con una correzione in arrivo. Le giunture oneste battono una superficie liscia che nasconde dove va il conto.</p>
      <h2>Cosa usare oggi (matrice)</h2>
      <p>Questa è la versione pratica della sezione sopra: le stesse cinque giunture, mappate su cosa è sicuro usare adesso. Un ✓ significa che il percorso funziona così com'è; un ✗ collega l'issue che lo sta bloccando, con la soluzione temporanea nella sezione pertinente.</p>




      <table><thead><tr><th>Provider</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Percorso Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>nativo</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>nativo</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>nativo</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter</td></tr><tr><td>DeepSeek TUI (prompt lunghi)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim OpenRouter</td></tr><tr><td>OpenCode (modello locale)</td><td>✓</td><td>✓</td><td>✓ (scalda prima, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/d</td></tr></tbody></table>
      <p>Due letture di questa tabella. Se il tuo stack è nel blocco tutto-✓ — Claude Code, Codex, Cursor o Gemini Pro — sei sul percorso pulito e nulla di quanto sopra cambia la tua giornata. Se sei su una delle righe ✗, la sezione corrispondente ha la soluzione temporanea che ti fa partire oggi mentre la correzione collegata arriva. In ogni caso, iscriviti all'<a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">etichetta BYOK sul tracker</a> se vuoi una notifica quando una riga passa da ✗ a ✓.</p>
      <h2>Cosa fare dopo</h2>
      <p>La <a href="https://github.com/nexu-io/open-design/tree/main/skills">libreria di skill</a> di Open Design è il livello operativo sotto tutto questo: i contratti basati su file in cui l'adattatore BYOK alimenta una volta che la connessione è sana. Le giunture sopra riguardano il portare byte dalla tua chiave al modello e indietro; le skill sono ciò che il modello fa effettivamente con essi. Se vuoi vedere cosa una skill consuma dal modello e cosa non le interessa — che è anche il motivo per cui questi spigoli degli adattatori non cambiano l'output, ma solo se lo raggiungi — quella directory è il posto giusto da cui iniziare.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Sfoglia la libreria di skill</a>.</p>
      <h2>Letture correlate</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Flusso di lavoro di design BYOK: usa Claude, Codex o Qwen con la tua chiave</a>: la spiegazione originale del BYOK, e il percorso funzionante al cui margine si trovano le cinque giunture sopra</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Perché abbiamo costruito Open Design come un livello di skill, non come un prodotto</a>: perché rispettiamo gli strumenti a monte invece di avvolgerli in un proxy, che è l'intero motivo per cui questi confini esistono</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistemi: come funziona la libreria</a>: cosa il BYOK alimenta effettivamente una volta che la connessione è sana</li>
      </ul>
  vi:
    title: "Kiểm tra thực tế BYOK: 5 thứ đang hỏng trong Open Design hôm nay"
    summary: "Chúng tôi đã hứa BYOK là hạng nhất. Năm luồng bug đang mở từ tuần này — Gemini, DeepSeek, OpenCode, Windows — cho thấy các đường nối còn gồ ghề ở đâu, và dùng gì cho đến khi từng bản vá đến."
    bodyHtml: |
      <p>Chúng tôi vẫn nói với mọi người rằng Open Design là BYOK từ gốc rễ. Điều đó vẫn đúng. Bài viết hạt giống về <a href="/blog/byok-design-workflow-claude-codex-qwen/">quy trình thiết kế BYOK</a> đi qua con đường hoạt động được — trỏ daemon tới bất kỳ endpoint tương thích OpenAI nào, dán key của bạn, thế là xong. Với phần lớn các thiết lập, đó là toàn bộ câu chuyện, và nó vẫn là toàn bộ câu chuyện.</p>
      <p>Nhưng “BYOK” không phải là một tính năng đơn lẻ. Nó là một hợp đồng vươn tới trình soạn chat, endpoint hoàn tất, bộ chọn model, đường khởi chạy CLI và lớp phân tích. Mỗi cái trong số đó là một nơi hợp đồng có thể vỡ — và ngay lúc này một số trong chúng là các issue đang mở trong <a href="https://github.com/nexu-io/open-design/issues">trình theo dõi công khai</a> của chúng tôi, do người dùng báo cáo trong 48 giờ qua.</p>
      <p>Chúng tôi đã có thể viết bài hạt giống rồi dừng ở đó. Thay vào đó, đây là lượt thành thật: các luồng đến trong tuần này, cái gì hỏng, vì sao nó hỏng, làm gì hôm nay, và PR nào (hoặc khe lộ trình nào) đang sửa nó. Không cái nào bị giấu. Chúng được mở, được gắn nhãn và liên kết bên dưới — và chúng tôi thà bạn đọc chúng từ chúng tôi còn hơn phát hiện ra chúng giữa chừng một bộ slide vào chiều thứ Sáu.</p>
      <h2>Lời hứa so với danh sách bug</h2>
      <p>Cách đóng khung quan trọng, vì cách đọc sai dễ nhất là “BYOK làm nửa vời.” Không phải vậy. Không cái nào trong năm cái dưới đây là bug kiểu “BYOK không hoạt động.” Mỗi cái nằm ở ranh giới giữa một adapter chúng tôi sở hữu — lớp tương thích OpenAI, bộ chọn model, đường hoàn tất — và một adapter chúng tôi không sở hữu: CLI của nhà cung cấp thượng nguồn, lựa chọn đóng gói của họ, hoặc mô hình tiến trình của nền tảng host.</p>
      <p>Cái ranh giới đó là nơi thực tế cư ngụ trong bất kỳ trình điều phối CLI mã nguồn mở nào. Chúng tôi không chạy suy luận, chúng tôi không ship một CLI fork cho từng nhà cung cấp, và chúng tôi không bọc mọi thứ trong một proxy làm mượt các cạnh (và âm thầm đánh thuế lên token của bạn). Cái giá của lập trường đó là khi CLI của một nhà cung cấp đổi hình dạng, hoặc Windows áp một giới hạn mà macOS không áp, đường nối lộ ra. Tuần này, năm trong số các đường nối đó lộ ra cùng một lúc.</p>
      <p>Đây là cả năm cái, theo thứ tự chúng đến.</p>
      <h2>Gemini lạc đường trên đường tới “Finish Design”</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, open</strong></p>
      <h3>Triệu chứng</h3>
      <p>BYOK được cấu hình cho Gemini. Kiểm tra kết nối trong Settings thành công. Bộ chọn model trả về các model Gemini. Chat thông thường hoạt động — bạn có thể giữ một cuộc trò chuyện đầy đủ với key Gemini của riêng mình mà không gặp trở ngại. Nhưng khoảnh khắc người dùng nhấn <strong>Finish Design</strong>, daemon ném ra một lỗi có dạng Anthropic, như thể nó đột nhiên quên mất đang nói chuyện với nhà cung cấp nào.</p>
      <h3>Vì sao nó xảy ra</h3>
      <p>Phản hồi của người bảo trì trên luồng xác nhận điều đó: chat ở chế độ API thông thường tôn trọng nhà cung cấp BYOK Gemini đã chọn từ đầu đến cuối, nhưng Finish Design chưa được tổng quát hóa vượt ra ngoài đường hoàn tất tương thích Anthropic. Mọi thứ khác định tuyến qua proxy nhận biết nhà cung cấp, vốn biết cách nói phương ngữ của từng thượng nguồn. Finish Design vẫn đi qua một endpoint hoàn tất Anthropic được mã hóa cứng còn sót lại từ một bản phát hành trước đó — nên một phản hồi Gemini đến ở dạng không phải Anthropic làm vấp bộ phân tích cú pháp.</p>
      <h3>Cách khắc phục tạm</h3>
      <p>Định tuyến Gemini qua OpenRouter dưới khe nhà cung cấp tương thích Anthropic. Khi đó đường Finish Design thấy một phản hồi dạng Anthropic quay về từ lớp shim của OpenRouter và hoàn tất đúng. Đó là một chặng thêm, và bạn trả tiền cho định tuyến của OpenRouter thay vì gọi thẳng Gemini, nhưng nó ổn định hôm nay và nó bao phủ đúng cái đường bị hỏng mà không động đến đường chat vốn đã hoạt động.</p>
      <h3>Ai đang sửa nó</h3>
      <p>Việc tổng quát hóa Finish Design giờ nằm trên lộ trình BYOK ở mức P1. Chưa có PR — đây là thứ tiếp theo đội daemon nhận lấy, và nó là cái duy nhất trong năm cái là khiếm khuyết trong mã chúng tôi hoàn toàn sở hữu chứ không phải là sự lệch ranh giới.</p>
      <h2>Gemini 3 Flash chết trên Windows trước khi prompt đến nơi</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, open</strong></p>
      <h3>Triệu chứng</h3>
      <p>Gemini 3 Flash Preview thất bại bên trong Open Design trên Windows với <code>stdin: write EOF</code> sau khoảng 1,5 giây — trước khi prompt từng kịp đến model. Gemini 3 Pro hoạt động bình thường trong cùng một bản cài đặt y hệt. Và CLI Gemini trực tiếp (<code>gemini --model gemini-3-flash-preview ...</code>) thành công khi đặt <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>. Vậy nên không phải key, không phải tài khoản, và không phải CLI khi tách riêng.</p>
      <h3>Vì sao nó xảy ra</h3>
      <p>Việc chẩn đoán mất hai lượt, đáng đưa ra vì đây là một ví dụ tốt về cách những thứ này được gỡ rối. Lần đọc đầu tiên ảnh chụp màn hình của người báo cáo trông giống một lỗi hạn mức <code>429 RESOURCE_EXHAUSTED</code> thượng nguồn. Sau một lần tái hiện sạch trên PowerShell ghi <code>OD_GEMINI_3_FLASH_OK</code> ra stdout, bức tranh thay đổi: model có thể tiếp cận được, CLI khỏe mạnh, lỗi nằm cụ thể trên đường khởi chạy Open Design → Gemini CLI, và nó đặc thù cho biến thể Flash trên Windows. Pro đi cùng đường khởi chạy đó và sống sót; Flash thì không.</p>
      <h3>Cách khắc phục tạm</h3>
      <p>Chọn Gemini 3 Pro Preview trong bộ chọn model. Nó chạy qua cùng đường khởi chạy và hoạt động. Riêng biệt ra — và phần này ngốn nhiều thời gian hơn cả chính cái bug — kiểm tra <code>~/.gemini/hooks/</code>. Một hook <code>gsd-check-update.js</code> chậm (<code>Hook execution error: Hook timed out after 60000ms</code>) đang cộng thêm khoảng 104 giây phụ phí vào mỗi lần chạy trong trường hợp của người dùng này, hoàn toàn độc lập với lỗi Flash. Dù sao cũng hãy dọn các hook Gemini của bạn; một hook kiểm tra cập nhật bị treo sẽ khiến bất kỳ agent nào cũng có cảm giác như hỏng.</p>
      <h3>Ai đang sửa nó</h3>
      <p>Được đánh dấu là đặc thù Flash và thuộc phía OD. Việc điều tra đang tiến hành trên đường ghi stdin của daemon — <code>write EOF</code> nói rằng stdin của tiến trình con đã đóng trước khi daemon ghi xong prompt, nên bản vá nằm ở cách biến thể cụ thể đó được spawn.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Một ma trận danh sách kiểm tra với một số hàng đạt và vài hàng hiện dấu hỏng, được chọn trong khung xanh lá trên nền biên tập gần như trắng">
        <figcaption>Năm đường nối thành thật — mỗi cái nằm ở ranh giới giữa một adapter chúng tôi sở hữu và một CLI chúng tôi không sở hữu.</figcaption>
      </figure>
      <h2>DeepSeek TUI có trần prompt 30 KB trên Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, open</strong></p>
      <h3>Triệu chứng</h3>
      <p>Trên wrapper DeepSeek v0.8.33 trong một bản build đóng gói Windows, một prompt dài đã soạn thất bại ở chốt kiểm tra trước khi chạy của chúng tôi với <code>81397 > 30000 bytes</code>. Người dùng không làm gì sai — họ chỉ soạn một prompt đủ phong phú (ngữ cảnh hệ thống, design system, tham chiếu) để vượt 30 KB.</p>
      <h3>Vì sao nó xảy ra</h3>
      <p>Cái chốt đó là có chủ ý, và nó đang bảo vệ bạn khỏi một lỗi tệ hơn. Adapter DeepSeek TUI hiện gửi prompt dưới dạng một tham số dòng lệnh theo vị trí — gắn vào argv — và Windows giới hạn tổng dòng lệnh thấp hơn nhiều so với macOS và Linux. Không có kiểm tra trước khi chạy, cùng prompt đó sẽ thất bại muộn hơn, sâu hơn trong quá trình spawn, với một lỗi <code>ENAMETOOLONG</code> ít hữu ích hơn nhiều và không gợi ý gì rằng nguyên nhân là kích cỡ prompt. Nên chúng tôi báo lỗi sớm và nêu rõ con số. Sự lệch mà issue này phơi bày nằm ở tài liệu: hướng dẫn cấp cao ngụ ý rằng các phương án dự phòng cho prompt dài trên Windows áp dụng rộng rãi, nhưng đường DeepSeek TUI chưa có cái nào — phương thức truyền của nó vẫn là argv, không phải stdin hay một tệp prompt.</p>
      <h3>Cách khắc phục tạm</h3>
      <p>Nếu bạn ở trên Windows với adapter DeepSeek TUI, giữ prompt đã soạn dưới 30 KB, hoặc chuyển sang một adapter dựa trên stdin — Claude Code, Codex và OpenCode đều nhận prompt qua stdin và không có trần tương đương. Trên macOS và Linux issue này hoàn toàn không cắn; giới hạn argv ở đó đủ cao để các prompt thực tế không chạm tới.</p>
      <h3>Ai đang sửa nó</h3>
      <p>Bản vá đúng là một phương thức truyền stdin hoặc tệp prompt cho adapter DeepSeek TUI, vốn loại bỏ hoàn toàn trần argv và đưa nó về cùng hàng với các adapter stdin. Nó được theo dõi trong hàng đợi của đội adapter.</p>
      <h2>Kiểm tra CLI cục bộ của OpenCode hết thời gian trước khi model khởi động xong</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, open</strong></p>
      <h3>Triệu chứng</h3>
      <p>Trong Settings → BYOK → OpenCode, kiểm tra kết nối luôn hết thời gian ở 45 giây. Phần lạ lùng: nếu người dùng trước tiên mở terminal của OpenCode Desktop và gắn một LLM cục bộ ở đó, thì cùng cái kiểm tra Open Design sẽ thành công ở lần thử kế tiếp.</p>
      <h3>Vì sao nó xảy ra</h3>
      <p>Chi tiết “mở terminal Desktop trước” đó chính là toàn bộ manh mối. Open Design không gắn vào một phiên OpenCode Desktop đang chạy. Với một bài kiểm tra nhanh trong Settings, daemon spawn ra tiến trình con CLI OpenCode mới tinh của riêng nó và chờ một phản hồi <code>ok</code>. Với một model cục bộ nguội — một model chưa được nạp vào bộ nhớ — phản hồi đầu tiên đó có thể mất lâu hơn ngân sách 45 giây, vì model đang được đọc từ đĩa và làm ấm trước khi nó có thể trả lời bất cứ điều gì. Mở terminal Desktop và để nó trả lời một prompt làm ấm model trong cache của hệ điều hành theo cách mà tiến trình con mới tinh của daemon sau đó có thể hưởng lợi ngay lập tức. Nên nó không thực sự là một bug của OpenCode; nó là một giả định về thời gian khởi động nguội sai đối với các model cục bộ.</p>
      <h3>Cách khắc phục tạm</h3>
      <p>Trước khi kiểm tra OpenCode trong Open Design, mở OpenCode Desktop, gắn LLM cục bộ của bạn, và để nó trả lời một prompt. Rồi chạy kiểm tra kết nối OD — model đã ấm và phản hồi đến trong ngân sách. Kể từ v0.7.0, ngân sách kiểm tra kết nối cũng có thể cấu hình được, nên nếu model cục bộ của bạn thật sự nạp chậm, bạn có thể nới cửa sổ thay vì làm ấm nó bằng tay.</p>
      <h3>Ai đang sửa nó</h3>
      <p>Bản vá phía daemon là một cửa sổ khởi động ấm dài hơn hoặc cấu hình được dành riêng cho các adapter model cục bộ, để một model cục bộ nguội không bị phán xét trên cùng cái đồng hồ như một API được host. Nó được theo dõi ở mức p0 — ưu tiên cao nhất trong năm cái, vì người dùng model cục bộ chính xác là đối tượng mà BYOK được tạo ra để phục vụ.</p>
      <h2>Ứng dụng web đóng gói từ chối nạp qua HTTP thuần</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, open</strong></p>
      <h3>Triệu chứng</h3>
      <p>Một bug hơi khác, cùng họ. Người báo cáo đang chạy ứng dụng web đóng gói trên một IP LAN qua HTTP thuần, và trang ném lỗi khi nạp — nó không bao giờ đạt tới trạng thái dùng được.</p>
      <h3>Vì sao nó xảy ra</h3>
      <p>Sau PR #1428, nhà cung cấp phân tích và nonce xuất PDF bắt đầu gọi thẳng <code>crypto.randomUUID()</code>, bỏ qua trình trợ giúp phân tầng được giới thiệu trong PR #900 vốn dự phòng một cách nhẹ nhàng khi API crypto an toàn không khả dụng. Chromium không phơi bày <code>crypto.randomUUID</code> trong các ngữ cảnh không an toàn — và một IP LAN trần qua HTTP thuần, theo định nghĩa của Chromium, không phải là một ngữ cảnh an toàn. Nên lời gọi trực tiếp ném lỗi lúc nạp, và trang sập theo. Nó không hẳn là một bug BYOK, nhưng nó cắn đúng cùng một đối tượng: những người chạy hạ tầng của riêng họ, thường air-gapped, thường qua HTTP thuần vì dựng một chứng chỉ cho một công cụ nội bộ không đáng với sự rườm rà.</p>
      <h3>Cách khắc phục tạm</h3>
      <p>Phục vụ ứng dụng web qua HTTPS hoặc qua <code>localhost</code>. Cả hai đều thỏa yêu cầu ngữ cảnh an toàn của Chromium — <code>localhost</code> được coi là an toàn ngay cả khi không có chứng chỉ — và trang nạp bình thường. Cho một thiết lập nội bộ nhanh, <code>localhost</code> là con đường không tốn chi phí; cho truy cập LAN, một chứng chỉ tự ký qua HTTPS là con đường bền vững.</p>
      <h3>Ai đang sửa nó</h3>
      <p>PR #1621 định tuyến các điểm gọi còn lại trở về qua trình trợ giúp UUID phân tầng từ PR #900, nên phương án dự phòng ngữ cảnh an toàn lại áp dụng ở mọi nơi thay vì chỉ ở nơi nó đã được nối sẵn. Nó đang mở và đang được rà soát.</p>
      <h2>Điều này thật sự nói gì về BYOK trong Open Design</h2>
      <p>Hãy đọc danh sách như một bản đồ hợp đồng, không phải một phán quyết chất lượng. Bốn trong năm issue này nằm ở các ranh giới adapter — đường khởi chạy CLI của Gemini, phương thức truyền CLI gắn argv của DeepSeek, mô hình khởi chạy nguội của OpenCode, các quy tắc ngữ cảnh an toàn của nền tảng host. Cái thứ năm, cái Finish Design, nằm ở chính endpoint hoàn tất của chúng tôi, nơi chúng tôi mã hóa cứng một phản hồi dạng Anthropic từ một bản phát hành trước và chưa tổng quát hóa nó. Cái đó là lỗi của chúng tôi; bốn cái còn lại là khoản thuế bạn trả cho việc tôn trọng những công cụ bạn không tự xây.</p>
      <p>Và đó là điểm mang tính cấu trúc. Mọi hệ thống BYOK không phải là một proxy gắn nhãn lại đều kết thúc ở đây. Bạn hoặc sở hữu suy luận — và mất BYOK, vì giờ bạn là người mua token và markup chúng — hoặc bạn tôn trọng các công cụ thượng nguồn và thừa hưởng các cạnh của chúng: các CLI của chúng, các đặc tính đóng gói của chúng, các giới hạn nền tảng mà mỗi cái xử lý khác nhau. Chúng tôi <a href="/blog/why-we-built-open-design-as-a-skill-layer/">đã chọn lập trường thứ hai một cách có chủ ý</a>, và chúng tôi sẽ chọn lại như vậy. Cái giá là những tuần trông như tuần này, khi các đội daemon và adapter mở công việc trên năm bề mặt trong hai ngày.</p>
      <p>Sự đánh đổi vẫn đúng. Một thiết lập hoạt động trên Claude Code, Codex, Cursor, Gemini Pro trên macOS, và DeepSeek trên Linux — cái ma trận bao phủ khoảng 90% người dùng thực tế của chúng tôi — chạy sạch sẽ hôm nay, không có thuế proxy và không có chênh lệch trên token của bạn. Năm luồng ở trên là cách 10% còn lại của ma trận trông ra sao vào giữa tháng 5 năm 2026: được nêu tên, được mở, và mỗi cái có một bản vá đang trên đường. Các đường nối thành thật hơn một bề mặt mượt mà che giấu nơi hóa đơn đi về.</p>
      <h2>Dùng gì hôm nay (ma trận)</h2>
      <p>Đây là phiên bản thực dụng của phần ở trên — cùng năm đường nối đó, ánh xạ lên những gì an toàn để dùng ngay lúc này. Một dấu ✓ nghĩa là đường hoạt động nguyên trạng; một dấu ✗ liên kết tới issue đang chặn nó, với cách khắc phục tạm trong phần liên quan.</p>
















































































      <table><thead><tr><th>Nhà cung cấp</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Đường Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>gốc</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>gốc</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>gốc</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter</td></tr><tr><td>DeepSeek TUI (prompt dài)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim OpenRouter</td></tr><tr><td>OpenCode (model cục bộ)</td><td>✓</td><td>✓</td><td>✓ (làm ấm trước, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/a</td></tr></tbody></table>
      <p>Hai cách đọc bảng này. Nếu stack của bạn nằm trong khối toàn-✓ — Claude Code, Codex, Cursor, hoặc Gemini Pro — bạn đang ở con đường sạch và không gì ở trên thay đổi ngày của bạn. Nếu bạn ở một trong các hàng ✗, phần tương ứng có cách khắc phục tạm giúp bạn chạy được hôm nay trong khi bản vá được liên kết đến nơi. Dù sao đi nữa, hãy đăng ký <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">nhãn BYOK trên trình theo dõi</a> nếu bạn muốn được thông báo khi một hàng lật từ ✗ sang ✓.</p>
      <h2>Làm gì tiếp theo</h2>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Thư viện skill</a> của Open Design là lớp hoạt động nằm dưới tất cả những điều này — các hợp đồng dựa trên tệp mà adapter BYOK đưa vào một khi kết nối khỏe mạnh. Các đường nối ở trên là về việc đưa byte từ key của bạn tới model và quay lại; các skill là những gì model thực sự làm với chúng. Nếu bạn muốn xem một skill tiêu thụ gì từ model và nó không quan tâm tới gì — vốn cũng là lý do các cạnh adapter này không thay đổi đầu ra, chỉ thay đổi việc bạn có chạm tới được nó hay không — thì thư mục đó là nơi đúng để bắt đầu.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Duyệt thư viện skill</a>.</p>
      <h2>Đọc thêm</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Quy trình thiết kế BYOK: chạy Claude, Codex hay Qwen bằng key của riêng bạn</a> — bài giải thích BYOK gốc, và con đường hoạt động mà năm đường nối ở trên nằm ở rìa của nó</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Vì sao chúng tôi xây Open Design như một lớp skill, không phải một sản phẩm</a> — vì sao chúng tôi tôn trọng các công cụ thượng nguồn thay vì bọc chúng trong một proxy, vốn là toàn bộ lý do các ranh giới này tồn tại</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 system — thư viện hoạt động ra sao</a> — BYOK thật sự đưa vào cái gì một khi kết nối khỏe mạnh</li>
      </ul>
  pl:
    title: "Test rzeczywistości BYOK: 5 rzeczy, które dziś psują się w Open Design"
    summary: "Obiecaliśmy BYOK jako funkcję pierwszej klasy. Pięć otwartych wątków o błędach z tego tygodnia — Gemini, DeepSeek, OpenCode, Windows — pokazuje, gdzie szwy wciąż są chropowate i czego używać, zanim każda poprawka wejdzie."
    bodyHtml: |
      <p>Mówiliśmy ludziom, że Open Design jest BYOK od podstaw. To wciąż prawda. Wpis założycielski o <a href="/blog/byok-design-workflow-claude-codex-qwen/">workflow projektowym BYOK</a> przeprowadza przez działającą ścieżkę — wskaż daemonowi dowolny endpoint zgodny z OpenAI, wklej klucz i gotowe. Dla większości konfiguracji to cała historia i tak pozostaje.</p>
      <p>Ale „BYOK” to nie pojedyncza funkcja. To kontrakt, który sięga do edytora czatu, endpointu finalizacji, wybierarki modeli, ścieżki uruchamiania CLI i warstwy analityki. Każde z tych miejsc to punkt, w którym kontrakt może się załamać — a właśnie teraz kilka z nich to otwarte zgłoszenia w naszym <a href="https://github.com/nexu-io/open-design/issues">publicznym trackerze</a>, zgłoszone przez użytkowników w ciągu ostatnich 48 godzin.</p>
      <p>Moglibyśmy napisać wpis założycielski i na tym poprzestać. Zamiast tego oto przebieg uczciwości: wątki, które wpłynęły w tym tygodniu, co się psuje, dlaczego się psuje, co robić dziś i który PR (lub miejsce w roadmapie) to naprawia. Żaden z nich nie jest ukryty. Są zarejestrowane, oznaczone i podlinkowane poniżej — i wolimy, żebyś przeczytał je od nas, niż odkrył w środku prezentacji w piątek.</p>
      <h2>Obietnica kontra lista błędów</h2>
      <p>Ujęcie ma znaczenie, bo łatwym błędnym odczytem jest „BYOK jest niedopieczony”. Nie jest. Żaden z pięciu poniższych to nie błąd „BYOK nie działa”. Każdy z nich żyje na granicy między adapterem, który posiadamy — warstwą zgodną z OpenAI, wybierarką modeli, ścieżką finalizacji — a takim, którego nie posiadamy: CLI dostawcy wyżej w łańcuchu, jego wyborami pakowania lub modelem procesów platformy hosta.</p>
      <p>Ta granica to miejsce, w którym żyje rzeczywistość w każdym otwartoźródłowym orkiestratorze CLI. Nie uruchamiamy wnioskowania, nie dostarczamy sforkowanego CLI dla każdego dostawcy i nie owijamy wszystkiego w proxy, które wygładza krawędzie (i po cichu opodatkowuje Twoje tokeny). Ceną tej postawy jest to, że gdy CLI dostawcy zmienia kształt albo Windows wymusza limit, którego macOS nie ma, szew się ujawnia. W tym tygodniu pięć takich szwów ujawniło się naraz.</p>
      <p>Oto wszystkie pięć, w kolejności, w jakiej wpłynęły.</p>
      <h2>Gemini gubi się w drodze do „Finish Design”</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, otwarte</strong></p>
      <h3>Objaw</h3>
      <p>BYOK jest skonfigurowane dla Gemini. Test połączenia w Ustawieniach przechodzi pomyślnie. Wybierarka modeli zwraca modele Gemini. Zwykły czat działa — możesz prowadzić pełną rozmowę na własnym kluczu Gemini bez kłopotu. Ale w momencie, gdy użytkownik kliknie <strong>Finish Design</strong>, daemon rzuca błąd o kształcie Anthropic, jakby nagle zapomniał, z którym dostawcą rozmawiał.</p>
      <h3>Dlaczego tak się dzieje</h3>
      <p>Odpowiedź maintainera w wątku to potwierdza: zwykły czat w trybie API honoruje wybranego dostawcę BYOK Gemini od początku do końca, ale Finish Design nie został jeszcze uogólniony poza ścieżkę finalizacji zgodną z Anthropic. Wszystko inne jest kierowane przez świadome dostawcy proxy, które wie, jak mówić w dialekcie każdego upstreamu. Finish Design wciąż przechodzi przez zakodowany na sztywno endpoint finalizacji Anthropic pozostały z wcześniejszego wydania — więc odpowiedź Gemini przychodząca w kształcie innym niż Anthropic wykłada parser.</p>
      <h3>Obejście</h3>
      <p>Kieruj Gemini przez OpenRouter w slocie dostawcy zgodnego z Anthropic. Ścieżka Finish Design widzi wtedy odpowiedź o kształcie Anthropic wracającą z shimu OpenRouter i finalizuje poprawnie. To dodatkowy przeskok i płacisz za routing OpenRouter zamiast wywoływać Gemini bezpośrednio, ale jest to stabilne dziś i pokrywa tę jedną ścieżkę, która jest zepsuta, bez ruszania ścieżki czatu, która już działa.</p>
      <h3>Kto to naprawia</h3>
      <p>Uogólnienie Finish Design jest teraz w roadmapie BYOK jako P1. Jeszcze bez PR — to następna rzecz, którą podejmie zespół daemona, i jedyny z piątki, który jest defektem w kodzie, który w pełni posiadamy, a nie niedopasowaniem na granicy.</p>
      <h2>Gemini 3 Flash umiera na Windows, zanim prompt dotrze</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, otwarte</strong></p>
      <h3>Objaw</h3>
      <p>Gemini 3 Flash Preview zawodzi wewnątrz Open Design na Windows z <code>stdin: write EOF</code> po około 1,5 sekundy — zanim prompt w ogóle dotrze do modelu. Gemini 3 Pro działa dobrze w dokładnie tej samej instalacji. A bezpośrednie CLI Gemini (<code>gemini --model gemini-3-flash-preview ...</code>) przechodzi pomyślnie, gdy ustawione jest <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>. Więc to nie klucz, nie konto i nie CLI w izolacji.</p>
      <h3>Dlaczego tak się dzieje</h3>
      <p>Diagnoza zajęła dwa podejścia, co warto pokazać, bo to dobry przykład tego, jak się to rozplątuje. Pierwszy odczyt zrzutu ekranu zgłaszającego wyglądał jak błąd przekroczenia limitu po stronie upstreamu <code>429 RESOURCE_EXHAUSTED</code>. Po czystej reprodukcji w PowerShell, która wypisała <code>OD_GEMINI_3_FLASH_OK</code> na stdout, obraz się zmienił: model jest osiągalny, CLI jest zdrowe, awaria jest konkretnie na ścieżce uruchamiania Open Design → CLI Gemini i jest specyficzna dla wariantu Flash na Windows. Pro idzie tą samą ścieżką uruchamiania i przeżywa; Flash nie.</p>
      <h3>Obejście</h3>
      <p>Wybierz Gemini 3 Pro Preview w wybierarce modeli. Idzie tą samą ścieżką uruchamiania i działa. Osobno — i ten fragment pochłonął więcej czasu niż sam błąd — sprawdź <code>~/.gemini/hooks/</code>. Powolny hook <code>gsd-check-update.js</code> (<code>Hook execution error: Hook timed out after 60000ms</code>) dodawał około 104 s narzutu do każdego uruchomienia w przypadku tego użytkownika, całkowicie niezależnie od awarii Flash. Posprzątaj swoje hooki Gemini niezależnie od tego; zawieszony hook sprawdzania aktualizacji sprawi, że dowolny agent będzie sprawiał wrażenie zepsutego.</p>
      <h3>Kto to naprawia</h3>
      <p>Oznaczone jako specyficzne dla Flash i po stronie OD. Dochodzenie trwa na ścieżce zapisu stdin daemona — <code>write EOF</code> mówi, że stdin dziecka zamknął się, zanim daemon skończył zapisywać prompt, więc poprawka żyje w tym, jak ten konkretny wariant jest spawnowany.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Macierz checklisty, gdzie niektóre wiersze przechodzą, a kilka pokazuje znak złamania, zaznaczona zieloną ramką na niemal białym, redakcyjnym tle">
        <figcaption>Pięć uczciwych szwów — każdy z nich żyje na granicy między adapterem, który posiadamy, a CLI, którego nie posiadamy.</figcaption>
      </figure>
      <h2>DeepSeek TUI ma sufit promptu 30 KB na Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, otwarte</strong></p>
      <h3>Objaw</h3>
      <p>Na wrapperze DeepSeek v0.8.33 w spakowanym buildzie Windows długi skomponowany prompt zawodzi naszą zaporę pre-flight z <code>81397 > 30000 bytes</code>. Użytkownik nie zrobił nic złego — po prostu skomponował prompt na tyle bogaty (kontekst systemowy, system projektowy, referencje), że przekroczył 30 KB.</p>
      <h3>Dlaczego tak się dzieje</h3>
      <p>Ta zapora jest celowa i chroni Cię przed gorszym błędem. Adapter DeepSeek TUI obecnie wysyła prompt jako pozycyjny argument wiersza poleceń — związany z argv — a Windows ogranicza całkowity wiersz poleceń znacznie poniżej tego, gdzie robią to macOS i Linux. Bez sprawdzenia pre-flight ten sam prompt zawiódłby później, głębiej w spawnie, z dużo mniej użytecznym błędem <code>ENAMETOOLONG</code> i bez podpowiedzi, że przyczyną był rozmiar promptu. Więc zawodzimy wcześnie i nazywamy liczbę. Niedopasowanie, które ujawnia to zgłoszenie, jest w dokumentacji: wytyczne wysokopoziomowe sugerują, że awaryjne mechanizmy dla długich promptów na Windows stosują się szeroko, ale ścieżka DeepSeek TUI jeszcze takiego nie ma — jej transport to wciąż argv, a nie stdin czy plik promptu.</p>
      <h3>Obejście</h3>
      <p>Jeśli jesteś na Windows z adapterem DeepSeek TUI, trzymaj skomponowany prompt poniżej 30 KB albo przełącz się na adapter oparty na stdin — Claude Code, Codex i OpenCode wszystkie przyjmują prompt przez stdin i nie mają porównywalnego sufitu. Na macOS i Linux ten problem w ogóle nie gryzie; limit argv jest tam na tyle wysoki, że realne prompty go nie osiągają.</p>
      <h3>Kto to naprawia</h3>
      <p>Właściwą poprawką jest transport przez stdin lub plik promptu dla adaptera DeepSeek TUI, co całkowicie usuwa sufit argv i równa go ze stdin-owymi adapterami. Jest śledzone w kolejce zespołu adapterów.</p>
      <h2>Test lokalnego CLI OpenCode wygasa, zanim model się rozgrzeje</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, otwarte</strong></p>
      <h3>Objaw</h3>
      <p>W Ustawienia → BYOK → OpenCode test połączenia niezawodnie wygasa po 45 sekundach. Dziwna część: jeśli użytkownik najpierw otworzy terminal OpenCode Desktop i podłączy tam lokalny LLM, ten sam test Open Design przechodzi pomyślnie przy następnej próbie.</p>
      <h3>Dlaczego tak się dzieje</h3>
      <p>Ten szczegół „najpierw otwórz terminal Desktop” jest całą wskazówką. Open Design nie podłącza się do działającej sesji OpenCode Desktop. Dla testu dymnego w Ustawieniach daemon spawnuje własny świeży podproces CLI OpenCode i czeka na odpowiedź <code>ok</code>. Przy zimnym modelu lokalnym — takim, który nie został jeszcze załadowany do pamięci — ta pierwsza odpowiedź może zająć dłużej niż budżet 45 sekund, bo model jest czytany z dysku i rozgrzewany, zanim cokolwiek odpowie. Otwarcie terminala Desktop i pozwolenie mu odpowiedzieć na jeden prompt rozgrzewa model w cache'u systemu w sposób, z którego świeży podproces daemona może następnie natychmiast skorzystać. Więc to nie jest naprawdę błąd OpenCode; to błędne założenie o czasie zimnego startu dla modeli lokalnych.</p>
      <h3>Obejście</h3>
      <p>Zanim przetestujesz OpenCode w Open Design, otwórz OpenCode Desktop, podłącz swój lokalny LLM i pozwól mu odpowiedzieć na jeden prompt. Następnie uruchom test połączenia OD — model jest rozgrzany, a odpowiedź mieści się w budżecie. Od wersji v0.7.0 budżet testu połączenia jest również konfigurowalny, więc jeśli Twój lokalny model naprawdę wolno się ładuje, możesz zwiększyć okno zamiast rozgrzewać go ręcznie.</p>
      <h3>Kto to naprawia</h3>
      <p>Poprawka po stronie daemona to dłuższe lub konfigurowalne okno rozgrzewki specjalnie dla adapterów modeli lokalnych, tak by zimny model lokalny nie był oceniany na tym samym zegarze co hostowane API. Jest śledzone na p0 — najwyższym priorytecie z piątki, bo użytkownicy modeli lokalnych to dokładnie ta publiczność, której BYOK ma służyć.</p>
      <h2>Spakowana aplikacja webowa odmawia ładowania przez zwykły HTTP</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, otwarte</strong></p>
      <h3>Objaw</h3>
      <p>Nieco inny błąd, ta sama rodzina. Zgłaszający uruchamia spakowaną aplikację webową na IP w sieci LAN przez zwykły HTTP, a strona rzuca błąd przy ładowaniu — nigdy nie osiąga użytecznego stanu.</p>
      <h3>Dlaczego tak się dzieje</h3>
      <p>Po PR #1428 dostawca analityki i nonce eksportu PDF zaczęły wywoływać <code>crypto.randomUUID()</code> bezpośrednio, omijając warstwowy helper wprowadzony w PR #900, który gracefully degraduje, gdy bezpieczne API crypto jest niedostępne. Chromium nie udostępnia <code>crypto.randomUUID</code> w niezabezpieczonych kontekstach — a goły IP LAN przez zwykły HTTP jest, według definicji Chromium, kontekstem niezabezpieczonym. Więc bezpośrednie wywołanie rzuca błąd w czasie ładowania, a strona pada wraz z nim. To nie jest ściśle błąd BYOK, ale gryzie dokładnie tę samą publiczność: ludzi uruchamiających własną infrastrukturę, często odizolowaną od sieci, często przez zwykły HTTP, bo postawienie certyfikatu dla wewnętrznego narzędzia nie jest warte tarcia.</p>
      <h3>Obejście</h3>
      <p>Serwuj aplikację webową przez HTTPS lub przez <code>localhost</code>. Oba spełniają wymóg bezpiecznego kontekstu Chromium — <code>localhost</code> jest traktowany jako bezpieczny nawet bez certyfikatu — i strona ładuje się normalnie. Dla szybkiej konfiguracji wewnętrznej <code>localhost</code> to ścieżka bezkosztowa; dla dostępu w sieci LAN samopodpisany certyfikat przez HTTPS to ścieżka trwała.</p>
      <h3>Kto to naprawia</h3>
      <p>PR #1621 kieruje pozostałe miejsca wywołań z powrotem przez warstwowy helper UUID z PR #900, tak by awaryjny mechanizm bezpiecznego kontekstu stosował się znów wszędzie, a nie tylko tam, gdzie był już podłączony. Jest otwarty i w trakcie recenzji.</p>
      <h2>Co to faktycznie mówi o BYOK w Open Design</h2>
      <p>Czytaj tę listę jako mapę kontraktu, a nie werdykt o jakości. Cztery z tych pięciu zgłoszeń siedzą na granicach adapterów — ścieżka uruchamiania CLI Gemini, transport CLI DeepSeek związany z argv, model uruchamiania zimnego startu OpenCode, reguły bezpiecznego kontekstu platformy hosta. Piąte, to z Finish Design, jest na naszym własnym endpoincie finalizacji, gdzie zakodowaliśmy na sztywno odpowiedź o kształcie Anthropic wydanie temu i jeszcze tego nie uogólniliśmy. To jest na naszej głowie; pozostałe cztery to podatek, który płacisz za szacunek dla narzędzi, których nie zbudowałeś.</p>
      <p>I to jest punkt strukturalny. Każdy system BYOK, który nie jest przebrandowanym proxy, kończy tutaj. Albo posiadasz wnioskowanie — i tracisz BYOK, bo teraz to Ty kupujesz tokeny i doliczasz do nich marżę — albo szanujesz narzędzia upstream i dziedziczysz ich krawędzie: ich CLI, ich osobliwości pakowania, limity platformy, z którymi każde radzi sobie inaczej. <a href="/blog/why-we-built-open-design-as-a-skill-layer/">Wybraliśmy drugą postawę celowo</a> i wybralibyśmy ją ponownie. Kosztem są tygodnie, które wyglądają jak ten, kiedy zespoły daemona i adapterów zgłosiły pracę na pięciu powierzchniach w dwa dni.</p>
      <p>Kompromis wciąż jest słuszny. Działająca konfiguracja na Claude Code, Codex, Cursor, Gemini Pro na macOS i DeepSeek na Linux — macierz pokrywająca mniej więcej 90% naszych faktycznych użytkowników — działa czysto dziś, bez podatku proxy i bez marży na Twoich tokenach. Pięć powyższych wątków to, jak wygląda pozostałe 10% macierzy w połowie maja 2026: nazwane, zarejestrowane i każde z poprawką w drodze. Uczciwe szwy biją gładką powierzchnię, która ukrywa, dokąd idzie rachunek.</p>
      <h2>Czego używać dziś (macierz)</h2>
      <p>To praktyczna wersja powyższej sekcji — te same pięć szwów, odwzorowane na to, po co bezpiecznie sięgnąć właśnie teraz. ✓ oznacza, że ścieżka działa tak, jak jest; ✗ linkuje zgłoszenie, które ją blokuje, z obejściem w odpowiedniej sekcji.</p>




































































      <table><thead><tr><th>Dostawca</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Ścieżka Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>natywna</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>natywna</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>natywna</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter</td></tr><tr><td>DeepSeek TUI (długie prompty)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim OpenRouter</td></tr><tr><td>OpenCode (model lokalny)</td><td>✓</td><td>✓</td><td>✓ (najpierw rozgrzej, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>nd.</td></tr></tbody></table>
      <p>Dwa odczyty tej tabeli. Jeśli Twój stos jest w bloku samych ✓ — Claude Code, Codex, Cursor lub Gemini Pro — jesteś na czystej ścieżce i nic powyżej nie zmienia Twojego dnia. Jeśli jesteś na jednym z wierszy ✗, pasująca sekcja ma obejście, które uruchamia Cię dziś, podczas gdy podlinkowana poprawka wejdzie. Tak czy inaczej, zasubskrybuj <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">etykietę BYOK w trackerze</a>, jeśli chcesz powiadomienie, gdy wiersz zmieni się z ✗ na ✓.</p>
      <h2>Co robić dalej</h2>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Biblioteka umiejętności</a> Open Design to warstwa robocza pod tym wszystkim — kontrakty oparte na plikach, do których adapter BYOK podaje dane, gdy połączenie jest zdrowe. Powyższe szwy dotyczą przeniesienia bajtów z Twojego klucza do modelu i z powrotem; umiejętności to, co model faktycznie z nimi robi. Jeśli chcesz zobaczyć, co umiejętność konsumuje z modelu, a czym się nie przejmuje — co jest też powodem, dla którego te krawędzie adapterów nie zmieniają wyjścia, a tylko to, czy do niego dotrzesz — ten katalog to dobre miejsce na start.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Przeglądaj bibliotekę umiejętności</a>.</p>
      <h2>Powiązane lektury</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Workflow projektowy BYOK: uruchom Claude, Codex lub Qwen na własnym kluczu</a> — oryginalne wyjaśnienie BYOK i działająca ścieżka, na której krawędzi siedzi powyższych pięć szwów</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — dlaczego szanujemy narzędzia upstream zamiast owijać je w proxy, co jest całym powodem istnienia tych granic</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 umiejętności, 72 systemy — jak działa biblioteka</a> — do czego BYOK faktycznie podaje dane, gdy połączenie jest zdrowe</li>
      </ul>
  id:
    title: "Pemeriksaan realitas BYOK: 5 hal yang rusak di Open Design hari ini"
    summary: "Kami menjanjikan BYOK sebagai fitur kelas satu. Lima thread bug yang terbuka minggu ini — Gemini, DeepSeek, OpenCode, Windows — menunjukkan di mana sambungannya masih kasar, dan apa yang harus dipakai sampai setiap perbaikan tiba."
    bodyHtml: |
      <p>Kami sudah memberi tahu orang-orang bahwa Open Design adalah BYOK dari dasar. Itu masih benar. Tulisan benih tentang <a href="/blog/byok-design-workflow-claude-codex-qwen/">alur kerja desain BYOK</a> menelusuri jalur yang berfungsi — arahkan daemon ke endpoint apa pun yang kompatibel dengan OpenAI, tempelkan key Anda, selesai. Untuk sebagian besar pengaturan, itulah keseluruhan ceritanya, dan tetap menjadi keseluruhan ceritanya.</p>
      <p>Tetapi “BYOK” bukanlah satu fitur tunggal. Ia adalah kontrak yang menjangkau ke dalam composer chat, endpoint finalize, picker model, jalur peluncuran CLI, dan lapisan analitik. Masing-masing dari itu adalah tempat di mana kontrak bisa rusak — dan saat ini beberapa di antaranya adalah issue yang terbuka di <a href="https://github.com/nexu-io/open-design/issues">tracker publik</a> kami, dilaporkan oleh pengguna dalam 48 jam terakhir.</p>
      <p>Kami bisa saja menulis tulisan benih itu dan berhenti di situ. Sebaliknya, inilah lintasan kejujurannya: thread-thread yang masuk minggu ini, apa yang rusak, mengapa rusak, apa yang harus dilakukan hari ini, dan PR (atau slot roadmap) mana yang sedang memperbaikinya. Tidak ada satu pun dari ini yang disembunyikan. Semuanya tercatat, berlabel, dan tertaut di bawah — dan kami lebih suka Anda membacanya dari kami daripada menemukannya di tengah deck pada hari Jumat.</p>
      <h2>Janji vs daftar bug</h2>
      <p>Pembingkaiannya penting, karena salah baca yang mudah adalah “BYOK setengah matang.” Bukan begitu. Tidak satu pun dari lima di bawah ini adalah bug “BYOK tidak berfungsi.” Setiap satu di antaranya berada di batas antara adapter yang kami miliki — lapisan kompatibel OpenAI, picker model, jalur finalize — dan yang tidak kami miliki: CLI penyedia hulu, pilihan pemaketan mereka, atau model proses platform host.</p>
      <p>Batas itu adalah tempat realitas berada dalam orkestrator CLI sumber terbuka mana pun. Kami tidak menjalankan inferensi, kami tidak mengirimkan CLI yang di-fork untuk setiap penyedia, dan kami tidak membungkus semuanya dalam proxy yang menghaluskan sisi-sisinya (dan diam-diam memajaki token Anda). Harga dari sikap itu adalah ketika CLI sebuah penyedia berubah bentuk, atau Windows memberlakukan batas yang tidak diberlakukan macOS, sambungannya terlihat. Minggu ini, lima dari sambungan itu terlihat sekaligus.</p>
      <p>Berikut kelimanya, dalam urutan kedatangannya.</p>
      <h2>Gemini tersesat dalam perjalanan menuju “Finish Design”</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, terbuka</strong></p>
      <h3>Gejala</h3>
      <p>BYOK dikonfigurasi untuk Gemini. Tes koneksi di Settings berhasil. Picker model mengembalikan model Gemini. Chat biasa berfungsi — Anda dapat menjalankan percakapan penuh dengan key Gemini Anda sendiri tanpa masalah. Tetapi begitu pengguna menekan <strong>Finish Design</strong>, daemon melempar error berbentuk Anthropic, seolah-olah ia tiba-tiba lupa penyedia mana yang sedang diajak bicara.</p>
      <h3>Mengapa hal itu terjadi</h3>
      <p>Balasan maintainer di thread tersebut mengonfirmasinya: chat mode-API biasa menghormati penyedia BYOK Gemini yang dipilih dari ujung ke ujung, tetapi Finish Design belum digeneralisasi melampaui jalur finalize yang kompatibel dengan Anthropic. Segala hal lain dirutekan melalui proxy yang sadar-penyedia yang tahu cara berbicara dengan dialek setiap hulu. Finish Design masih melalui endpoint finalize Anthropic yang di-hardcode dan tersisa dari rilis sebelumnya — sehingga respons Gemini yang tiba dalam bentuk non-Anthropic membuat parser tersandung.</p>
      <h3>Solusi sementara</h3>
      <p>Rutekan Gemini melalui OpenRouter di bawah slot penyedia yang kompatibel dengan Anthropic. Jalur Finish Design kemudian melihat respons berbentuk Anthropic yang kembali dari shim OpenRouter dan menyelesaikannya dengan benar. Ini adalah satu hop tambahan, dan Anda membayar perutean OpenRouter alih-alih memanggil Gemini secara langsung, tetapi ini stabil hari ini dan mencakup satu jalur yang rusak tanpa menyentuh jalur chat yang sudah berfungsi.</p>
      <h3>Siapa yang memperbaikinya</h3>
      <p>Generalisasi Finish Design kini ada di roadmap BYOK sebagai P1. Belum ada PR — ini adalah hal berikutnya yang akan diambil tim daemon, dan ini adalah satu-satunya dari lima yang merupakan cacat di kode yang sepenuhnya kami miliki, bukan ketidakcocokan batas.</p>
      <h2>Gemini 3 Flash mati di Windows sebelum prompt sampai</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, terbuka</strong></p>
      <h3>Gejala</h3>
      <p>Gemini 3 Flash Preview gagal di dalam Open Design pada Windows dengan <code>stdin: write EOF</code> setelah sekitar 1,5 detik — sebelum prompt pernah mencapai model. Gemini 3 Pro berfungsi baik di instalasi yang persis sama. Dan CLI Gemini langsung (<code>gemini --model gemini-3-flash-preview ...</code>) berhasil ketika <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> diatur. Jadi ini bukan masalah key, bukan akun, dan bukan CLI secara terpisah.</p>
      <h3>Mengapa hal itu terjadi</h3>
      <p>Diagnosisnya butuh dua kali lintasan, yang layak ditunjukkan karena ini adalah contoh bagus tentang cara hal-hal ini diurai. Pembacaan pertama atas tangkapan layar pelapor terlihat seperti error kuota hulu <code>429 RESOURCE_EXHAUSTED</code>. Setelah repro PowerShell yang bersih yang menulis <code>OD_GEMINI_3_FLASH_OK</code> ke stdout, gambarannya berubah: model dapat dijangkau, CLI sehat, kegagalan ada secara spesifik pada jalur peluncuran Open Design → Gemini CLI, dan spesifik pada varian Flash di Windows. Pro mengambil jalur peluncuran yang sama dan bertahan; Flash tidak.</p>
      <h3>Solusi sementara</h3>
      <p>Pilih Gemini 3 Pro Preview di picker model. Ia berjalan melalui jalur peluncuran yang sama dan berfungsi. Secara terpisah — dan bagian ini menyita lebih banyak waktu daripada bug itu sendiri — periksa <code>~/.gemini/hooks/</code>. Sebuah hook <code>gsd-check-update.js</code> yang lambat (<code>Hook execution error: Hook timed out after 60000ms</code>) menambahkan kira-kira 104 detik overhead pada setiap proses dalam kasus pengguna ini, sepenuhnya independen dari kegagalan Flash. Bersihkan hook Gemini Anda apa pun yang terjadi; sebuah hook pengecekan pembaruan yang macet akan membuat agent mana pun terasa rusak.</p>
      <h3>Siapa yang memperbaikinya</h3>
      <p>Ditandai sebagai spesifik-Flash dan di sisi OD. Investigasi sedang berlangsung pada jalur penulisan stdin daemon — <code>write EOF</code> mengatakan bahwa stdin anak ditutup sebelum daemon selesai menulis prompt, jadi perbaikannya berada di cara varian tertentu itu di-spawn.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Matriks daftar periksa di mana beberapa baris lolos dan beberapa menunjukkan tanda rusak, terpilih dalam bingkai hijau di atas latar editorial nyaris putih">
        <figcaption>Lima sambungan yang jujur — masing-masing berada di batas antara adapter yang kami miliki dan CLI yang tidak.</figcaption>
      </figure>
      <h2>DeepSeek TUI memiliki batas atas prompt 30 KB di Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, terbuka</strong></p>
      <h3>Gejala</h3>
      <p>Pada wrapper DeepSeek v0.8.33 dalam build Windows yang dipaketkan, sebuah prompt panjang yang tersusun gagal pada pelindung pra-penerbangan kami dengan <code>81397 > 30000 bytes</code>. Pengguna tidak melakukan kesalahan apa pun — mereka hanya menyusun prompt yang cukup kaya (konteks sistem, sistem desain, referensi) sehingga melampaui 30 KB.</p>
      <h3>Mengapa hal itu terjadi</h3>
      <p>Pelindung itu disengaja, dan ia melindungi Anda dari error yang lebih buruk. Adapter DeepSeek TUI saat ini mengirimkan prompt sebagai argumen baris-perintah posisional — terikat-argv — dan Windows membatasi total baris perintah jauh di bawah batas macOS dan Linux. Tanpa pengecekan pra-penerbangan, prompt yang sama akan gagal kemudian, lebih dalam di proses spawn, dengan error <code>ENAMETOOLONG</code> yang jauh kurang berguna dan tanpa petunjuk bahwa penyebabnya adalah ukuran prompt. Jadi kami gagal lebih awal dan menyebutkan angkanya. Ketidakcocokan yang diungkap issue ini ada di dokumentasi: panduan tingkat tinggi menyiratkan bahwa fallback prompt-panjang Windows berlaku secara luas, tetapi jalur DeepSeek TUI belum memilikinya — transportnya masih argv, bukan stdin atau file prompt.</p>
      <h3>Solusi sementara</h3>
      <p>Jika Anda di Windows dengan adapter DeepSeek TUI, pertahankan prompt yang tersusun di bawah 30 KB, atau beralih ke adapter berbasis stdin — Claude Code, Codex, dan OpenCode semuanya menerima prompt mereka melalui stdin dan tidak memiliki batas atas yang sebanding. Pada macOS dan Linux issue ini sama sekali tidak menggigit; batas argv di sana cukup tinggi sehingga prompt dunia nyata tidak mencapainya.</p>
      <h3>Siapa yang memperbaikinya</h3>
      <p>Perbaikan yang tepat adalah transport stdin atau file prompt untuk adapter DeepSeek TUI, yang menghapus batas atas argv sepenuhnya dan menyejajarkannya dengan adapter stdin. Ini terlacak di antrian tim adapter.</p>
      <h2>Tes CLI-lokal OpenCode kehabisan waktu sebelum model menghangat</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, terbuka</strong></p>
      <h3>Gejala</h3>
      <p>Di Settings → BYOK → OpenCode, tes koneksi secara andal kehabisan waktu pada 45 detik. Bagian anehnya: jika pengguna terlebih dahulu membuka terminal OpenCode Desktop dan melampirkan LLM lokal di sana, tes Open Design yang sama kemudian berhasil pada percobaan berikutnya.</p>
      <h3>Mengapa hal itu terjadi</h3>
      <p>Detail “buka terminal Desktop terlebih dahulu” itu adalah keseluruhan petunjuknya. Open Design tidak menempel ke sesi OpenCode Desktop yang sedang berjalan. Untuk smoke test di Settings, daemon men-spawn subproses CLI OpenCode-nya sendiri yang baru dan menunggu balasan <code>ok</code>. Dengan model lokal yang dingin — yang belum dimuat ke memori — balasan pertama itu bisa memakan waktu lebih lama dari anggaran 45 detik, karena model sedang dibaca dari disk dan dihangatkan sebelum ia bisa menjawab apa pun. Membuka terminal Desktop dan membiarkannya menjawab satu prompt menghangatkan model di cache OS dengan cara yang kemudian dapat langsung dimanfaatkan oleh subproses baru daemon. Jadi ini sebenarnya bukan bug OpenCode; ini adalah asumsi waktu cold-start yang salah untuk model lokal.</p>
      <h3>Solusi sementara</h3>
      <p>Sebelum menguji OpenCode di Open Design, buka OpenCode Desktop, lampirkan LLM lokal Anda, dan biarkan ia menjawab satu prompt. Lalu jalankan tes koneksi OD — modelnya hangat dan balasannya masuk dalam anggaran. Sejak v0.7.0, anggaran tes-koneksi juga dapat dikonfigurasi, jadi jika model lokal Anda memang lambat dimuat Anda dapat menaikkan jendelanya alih-alih menghangatkannya secara manual.</p>
      <h3>Siapa yang memperbaikinya</h3>
      <p>Perbaikan di sisi daemon adalah jendela pemanasan yang lebih panjang atau dapat dikonfigurasi khusus untuk adapter model-lokal, sehingga model lokal yang dingin tidak dinilai dengan jam yang sama seperti API berbasis hosting. Ini terlacak di p0 — prioritas tertinggi dari kelima, karena pengguna model-lokal justru audiens yang dimaksudkan dilayani BYOK.</p>
      <h2>Aplikasi web yang dipaketkan menolak dimuat melalui HTTP biasa</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, terbuka</strong></p>
      <h3>Gejala</h3>
      <p>Bug yang sedikit berbeda, keluarga yang sama. Pelapor menjalankan aplikasi web yang dipaketkan pada IP LAN melalui HTTP biasa, dan halaman melempar error saat dimuat — ia tidak pernah mencapai kondisi yang dapat digunakan.</p>
      <h3>Mengapa hal itu terjadi</h3>
      <p>Setelah PR #1428, penyedia analitik dan nonce ekspor PDF mulai memanggil <code>crypto.randomUUID()</code> secara langsung, melewati helper berjenjang yang diperkenalkan di PR #900 yang melakukan fallback dengan baik ketika API crypto yang aman tidak tersedia. Chromium tidak mengekspos <code>crypto.randomUUID</code> dalam konteks yang tidak aman — dan IP LAN telanjang melalui HTTP biasa, menurut definisi Chromium, bukanlah konteks yang aman. Jadi panggilan langsung itu melempar error saat dimuat, dan halaman turun bersamanya. Ini bukan secara ketat sebuah bug BYOK, tetapi ia menggigit audiens yang persis sama: orang-orang yang menjalankan infrastruktur mereka sendiri, sering kali air-gapped, sering kali melalui HTTP biasa karena menyiapkan sertifikat untuk tool internal tidak sepadan dengan kerumitannya.</p>
      <h3>Solusi sementara</h3>
      <p>Sajikan aplikasi web melalui HTTPS atau melalui <code>localhost</code>. Keduanya memenuhi persyaratan konteks-aman Chromium — <code>localhost</code> diperlakukan sebagai aman bahkan tanpa sertifikat — dan halaman dimuat secara normal. Untuk pengaturan internal yang cepat, <code>localhost</code> adalah jalur tanpa biaya; untuk akses LAN, sertifikat yang ditandatangani sendiri melalui HTTPS adalah yang tahan lama.</p>
      <h3>Siapa yang memperbaikinya</h3>
      <p>PR #1621 merutekan situs panggilan yang tersisa kembali melalui helper UUID berjenjang dari PR #900, sehingga fallback konteks-aman berlaku di mana-mana lagi alih-alih hanya di tempat yang sudah terkawat. Ini terbuka dan sedang ditinjau.</p>
      <h2>Apa yang sebenarnya dikatakan ini tentang BYOK di Open Design</h2>
      <p>Baca daftar ini sebagai peta kontrak, bukan vonis kualitas. Empat dari lima issue ini berada di batas adapter — jalur peluncuran CLI Gemini, transport CLI terikat-argv DeepSeek, model peluncuran cold-start OpenCode, aturan konteks-aman platform host. Yang kelima, yang Finish Design, ada di endpoint finalize kami sendiri, tempat kami men-hardcode respons berbentuk Anthropic satu rilis lalu dan belum menggeneralisasinya. Yang itu tanggung jawab kami; empat lainnya adalah pajak yang Anda bayar karena menghormati tool yang tidak Anda buat.</p>
      <p>Dan itulah poin strukturalnya. Setiap sistem BYOK yang bukan proxy yang diberi label ulang berakhir di sini. Anda entah memiliki inferensinya — dan kehilangan BYOK, karena sekarang Andalah yang membeli token dan memberinya markup — atau Anda menghormati tool hulu dan mewarisi sisi-sisinya: CLI mereka, keanehan pemaketan mereka, batas platform yang masing-masing mereka tangani secara berbeda. Kami <a href="/blog/why-we-built-open-design-as-a-skill-layer/">memilih sikap kedua dengan sengaja</a>, dan kami akan memilihnya lagi. Biayanya adalah minggu-minggu yang terlihat seperti minggu ini, di mana tim daemon dan adapter mencatat pekerjaan di lima permukaan dalam dua hari.</p>
      <p>Pertukarannya tetap benar. Sebuah pengaturan yang berfungsi pada Claude Code, Codex, Cursor, Gemini Pro di macOS, dan DeepSeek di Linux — matriks yang mencakup kira-kira 90% pengguna aktual kami — berjalan dengan bersih hari ini, tanpa pajak proxy dan tanpa margin atas token Anda. Lima thread di atas adalah seperti apa 10% sisanya dari matriks itu pada pertengahan Mei 2026: tersebut namanya, tercatat, dan masing-masing dengan perbaikan yang sedang berlangsung. Sambungan yang jujur mengalahkan permukaan mulus yang menyembunyikan ke mana tagihannya pergi.</p>
      <h2>Apa yang harus dipakai hari ini (matriks)</h2>
      <p>Ini adalah versi praktis dari bagian di atas — lima sambungan yang sama, dipetakan ke apa yang aman untuk dijangkau saat ini. Tanda ✓ berarti jalurnya berfungsi apa adanya; tanda ✗ menautkan issue yang menghalanginya, dengan solusi sementara di bagian yang relevan.</p>




































































      <table><thead><tr><th>Penyedia</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Jalur Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>native</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>native</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>native</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter</td></tr><tr><td>DeepSeek TUI (prompt panjang)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim OpenRouter</td></tr><tr><td>OpenCode (model lokal)</td><td>✓</td><td>✓</td><td>✓ (hangatkan dahulu, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n/a</td></tr></tbody></table>
      <p>Dua pembacaan atas tabel ini. Jika tumpukan Anda ada di blok semua-✓ — Claude Code, Codex, Cursor, atau Gemini Pro — Anda berada di jalur yang bersih dan tidak ada di atas yang mengubah hari Anda. Jika Anda berada di salah satu baris ✗, bagian yang sesuai memiliki solusi sementara yang membuat Anda berjalan hari ini sementara perbaikan yang tertaut tiba. Bagaimanapun, berlanggananlah ke <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">label BYOK di tracker</a> jika Anda ingin notifikasi ketika sebuah baris berbalik dari ✗ menjadi ✓.</p>
      <h2>Apa yang harus dilakukan selanjutnya</h2>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Pustaka skill</a> Open Design adalah lapisan kerja di bawah semua ini — kontrak yang digerakkan-file yang menjadi tempat adapter BYOK menyuapkannya begitu koneksinya sehat. Sambungan di atas adalah tentang membawa byte dari key Anda ke model dan kembali; skill adalah apa yang sebenarnya dilakukan model dengannya. Jika Anda ingin melihat apa yang dikonsumsi sebuah skill dari model dan apa yang tidak dipedulikannya — yang juga sebabnya sisi-sisi adapter ini tidak mengubah output, hanya apakah Anda mencapainya — direktori itu adalah tempat yang tepat untuk memulai.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Jelajahi pustaka skill</a>.</p>
      <h2>Bacaan terkait</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">Alur kerja desain BYOK: jalankan Claude, Codex, atau Qwen dengan key Anda sendiri</a> — penjelasan BYOK yang asli, dan jalur yang berfungsi yang menjadi tepi tempat lima sambungan di atas berada</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Mengapa kami membangun Open Design sebagai lapisan skill, bukan sebagai produk</a> — mengapa kami menghormati tool hulu alih-alih membungkusnya dalam proxy, yang merupakan keseluruhan alasan batas-batas ini ada</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skill, 72 sistem — cara kerja pustaka</a> — apa yang sebenarnya disuap BYOK begitu koneksinya sehat</li>
      </ul>
  nl:
    title: "BYOK-realiteitscheck: 5 dingen die vandaag stukgaan in Open Design"
    summary: "We beloofden BYOK als eersteklas. Vijf openstaande bugthreads van deze week — Gemini, DeepSeek, OpenCode, Windows — laten zien waar de naden nog ruw zijn, en wat je kunt gebruiken totdat elke fix is uitgerold."
    bodyHtml: |
      <p>We vertellen mensen dat Open Design vanaf de basis BYOK is. Dat klopt nog steeds. Het seed-bericht over de <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-ontwerpworkflow</a> behandelt het werkende pad — richt de daemon op elk OpenAI-compatibel endpoint, plak je sleutel, je bent klaar. Voor de meeste setups is dat het hele verhaal, en dat blijft het hele verhaal.</p>
      <p>Maar “BYOK” is geen enkele functie. Het is een contract dat reikt tot in de chat-composer, het finalize-endpoint, de modelkiezer, het CLI-startpad en de analytics-laag. Elk daarvan is een plek waar het contract kan breken — en op dit moment zijn er meerdere openstaande issues in onze <a href="https://github.com/nexu-io/open-design/issues">publieke tracker</a>, gerapporteerd door gebruikers in de afgelopen 48 uur.</p>
      <p>We hadden het seed-bericht kunnen schrijven en daar kunnen stoppen. In plaats daarvan is hier de eerlijkheidspass: de threads die deze week binnenkwamen, wat er stukgaat, waarom het stukgaat, wat je vandaag kunt doen, en welke PR (of roadmap-plek) het oplost. Geen van deze is verborgen. Ze zijn ingediend, gelabeld en hieronder gelinkt — en we lezen ze liever van ons aan jou voor dan dat je ze halverwege een deck op een vrijdag ontdekt.</p>
      <h2>De belofte versus de buglijst</h2>
      <p>De framing doet ertoe, want de gemakkelijke verkeerde lezing is “BYOK is half af.” Dat is het niet. Geen van de vijf hieronder zijn “BYOK werkt niet”-bugs. Elk daarvan leeft op de grens tussen een adapter die wij bezitten — de OpenAI-compatibele laag, de modelkiezer, het finalize-pad — en een die we niet bezitten: de CLI van de upstream-provider, hun verpakkingskeuzes of het procesmodel van het hostplatform.</p>
      <p>Die grens is waar de realiteit zit in elke open-source CLI-orkestrator. We draaien geen inferentie, we leveren geen geforkte CLI voor elke provider, en we wikkelen niet alles in een proxy die de randen gladstrijkt (en stilletjes je tokens belast). De prijs van die houding is dat wanneer de CLI van een provider van vorm verandert, of Windows een limiet afdwingt die macOS niet kent, de naad zichtbaar wordt. Deze week werden vijf van die naden tegelijk zichtbaar.</p>
      <p>Hier zijn alle vijf, in de volgorde waarin ze binnenkwamen.</p>
      <h2>Gemini raakt verdwaald op weg naar “Finish Design”</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, open</strong></p>
      <h3>Symptoom</h3>
      <p>BYOK is geconfigureerd voor Gemini. De testverbinding in Settings slaagt. De modelkiezer geeft Gemini-modellen terug. Gewone chat werkt — je kunt een volledig gesprek voeren tegen je eigen Gemini-sleutel zonder problemen. Maar zodra de gebruiker op <strong>Finish Design</strong> drukt, gooit de daemon een Anthropic-vormige fout, alsof hij ineens vergat met welke provider hij praatte.</p>
      <h3>Waarom het gebeurt</h3>
      <p>De reactie van de maintainer in de thread bevestigt het: gewone chat in API-modus respecteert de geselecteerde Gemini BYOK-provider van begin tot eind, maar Finish Design is nog niet gegeneraliseerd buiten het Anthropic-compatibele finalize-pad. Al het andere wordt gerooteerd via de provider-bewuste proxy die weet hoe het het dialect van elke upstream moet spreken. Finish Design gaat nog steeds via een hard-gecodeerd Anthropic finalize-endpoint dat is overgebleven van een eerdere release — dus een Gemini-respons die in een niet-Anthropic-vorm binnenkomt, doet de parser struikelen.</p>
      <h3>Tijdelijke oplossing</h3>
      <p>Routeer Gemini via OpenRouter onder de Anthropic-compatibele providerslot. Het Finish Design-pad ziet dan een Anthropic-vormige respons terugkomen van de shim van OpenRouter en finaliseert correct. Het is een extra hop, en je betaalt de routing van OpenRouter in plaats van Gemini rechtstreeks aan te roepen, maar het is vandaag stabiel en het dekt het ene pad dat kapot is zonder het chat-pad aan te raken dat al werkt.</p>
      <h3>Wie het oplost</h3>
      <p>De generalisatie van Finish Design staat nu op de BYOK-roadmap als een P1. Nog geen PR — dit is het volgende dat het daemon-team oppakt, en het is de enige van de vijf die een defect is in code die we volledig bezitten in plaats van een grensmismatch.</p>
      <h2>Gemini 3 Flash sterft op Windows voordat de prompt aankomt</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, open</strong></p>
      <h3>Symptoom</h3>
      <p>Gemini 3 Flash Preview faalt binnen Open Design op Windows met <code>stdin: write EOF</code> na ongeveer 1,5 seconde — voordat de prompt het model ooit bereikt. Gemini 3 Pro werkt prima in exact dezelfde installatie. En de directe Gemini CLI (<code>gemini --model gemini-3-flash-preview ...</code>) slaagt wanneer <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> is ingesteld. Het is dus niet de sleutel, niet het account, en niet de CLI op zichzelf.</p>
      <h3>Waarom het gebeurt</h3>
      <p>De diagnose kostte twee passes, wat het waard is om te laten zien omdat het een goed voorbeeld is van hoe deze worden ontward. De eerste lezing van de screenshot van de melder leek op een upstream <code>429 RESOURCE_EXHAUSTED</code> quotafout. Na een schone PowerShell-reproductie die <code>OD_GEMINI_3_FLASH_OK</code> naar stdout schreef, veranderde het beeld: het model is bereikbaar, de CLI is gezond, de fout zit specifiek op het Open Design → Gemini CLI-startpad, en het is specifiek voor de Flash-variant op Windows. Pro neemt hetzelfde startpad en overleeft het; Flash niet.</p>
      <h3>Tijdelijke oplossing</h3>
      <p>Selecteer Gemini 3 Pro Preview in de modelkiezer. Het draait via hetzelfde startpad en werkt. Daarnaast — en dit deel kostte meer tijd dan de bug zelf — controleer <code>~/.gemini/hooks/</code>. Een trage <code>gsd-check-update.js</code>-hook (<code>Hook execution error: Hook timed out after 60000ms</code>) voegde in het geval van deze gebruiker ongeveer 104 s aan overhead toe aan elke run, volledig los van het Flash-falen. Maak je Gemini-hooks hoe dan ook schoon; een vastgelopen update-check-hook laat elke agent kapot aanvoelen.</p>
      <h3>Wie het oplost</h3>
      <p>Gemarkeerd als Flash-specifiek en OD-zijdig. Het onderzoek is gaande op het stdin-schrijfpad van de daemon — de <code>write EOF</code> zegt dat de stdin van het kind sloot voordat de daemon klaar was met het schrijven van de prompt, dus de fix zit in hoe die specifieke variant wordt gespawned.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Een checklist-matrix waar sommige rijen slagen en een paar een breukmarkering tonen, geselecteerd in een groen kader op een bijna-witte redactionele achtergrond">
        <figcaption>Vijf eerlijke naden — elk daarvan leeft op de grens tussen een adapter die wij bezitten en een CLI die we niet bezitten.</figcaption>
      </figure>
      <h2>DeepSeek TUI heeft een promptplafond van 30 KB op Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, open</strong></p>
      <h3>Symptoom</h3>
      <p>Op de DeepSeek-wrapper v0.8.33 in een Windows-verpakte build faalt een lange samengestelde prompt onze pre-flight-bewaking met <code>81397 > 30000 bytes</code>. De gebruiker deed niets verkeerd — ze stelden gewoon een prompt samen die rijk genoeg was (systeemcontext, designsysteem, referenties) om de 30 KB te overschrijden.</p>
      <h3>Waarom het gebeurt</h3>
      <p>Die bewaking is opzettelijk, en hij beschermt je tegen een ergere fout. De DeepSeek TUI-adapter verstuurt de prompt momenteel als een positioneel command-line-argument — argv-gebonden — en Windows beperkt de totale commandoregel ruim onder waar macOS en Linux dat doen. Zonder de pre-flight-controle zou dezelfde prompt later falen, dieper in de spawn, met een veel minder bruikbare <code>ENAMETOOLONG</code>-fout en geen hint dat de oorzaak de promptgrootte was. Dus we falen vroeg en noemen het getal. De mismatch die het issue blootlegt zit in de documentatie: de high-level richtlijnen suggereren dat fallbacks voor lange prompts op Windows breed van toepassing zijn, maar het DeepSeek TUI-pad heeft er nog geen — het transport is nog steeds argv, niet stdin of een promptbestand.</p>
      <h3>Tijdelijke oplossing</h3>
      <p>Als je op Windows zit met de DeepSeek TUI-adapter, houd de samengestelde prompt onder de 30 KB, of schakel over naar een stdin-gebaseerde adapter — Claude Code, Codex en OpenCode nemen hun prompt allemaal via stdin en hebben geen vergelijkbaar plafond. Op macOS en Linux bijt dit issue helemaal niet; de argv-limiet daar is hoog genoeg dat prompts uit de praktijk hem niet bereiken.</p>
      <h3>Wie het oplost</h3>
      <p>De juiste fix is een stdin- of promptbestand-transport voor de DeepSeek TUI-adapter, dat het argv-plafond volledig verwijdert en het in lijn brengt met de stdin-adapters. Het staat in de wachtrij van het adapter-team.</p>
      <h2>De OpenCode lokale-CLI-test verloopt voordat het model opwarmt</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, open</strong></p>
      <h3>Symptoom</h3>
      <p>In Settings → BYOK → OpenCode verloopt de verbindingstest betrouwbaar na 45 seconden. Het vreemde deel: als de gebruiker eerst de terminal van OpenCode Desktop opent en daar een lokale LLM koppelt, slaagt dezelfde Open Design-test bij de volgende poging wel.</p>
      <h3>Waarom het gebeurt</h3>
      <p>Dat detail “open eerst de Desktop-terminal” is de hele aanwijzing. Open Design koppelt niet aan een draaiende OpenCode Desktop-sessie. Voor een smoke-test in Settings spawnt de daemon zijn eigen verse OpenCode CLI-subproces en wacht op een <code>ok</code>-antwoord. Met een koud lokaal model — een dat nog niet in het geheugen is geladen — kan dat eerste antwoord langer duren dan het budget van 45 seconden, omdat het model van schijf wordt gelezen en opgewarmd voordat het iets kan beantwoorden. Het openen van de Desktop-terminal en het laten beantwoorden van één prompt warmt het model op in de OS-cache op een manier waar het verse subproces van de daemon dan onmiddellijk van kan profiteren. Het is dus niet echt een OpenCode-bug; het is een aanname over koude-start-timing die verkeerd is voor lokale modellen.</p>
      <h3>Tijdelijke oplossing</h3>
      <p>Voordat je OpenCode test in Open Design, open OpenCode Desktop, koppel je lokale LLM en laat het één prompt beantwoorden. Draai dan de OD-verbindingstest — het model is warm en het antwoord komt binnen het budget aan. Vanaf v0.7.0 is het verbindingstestbudget ook configureerbaar, dus als je lokale model echt traag laadt, kun je het venster vergroten in plaats van het handmatig op te warmen.</p>
      <h3>Wie het oplost</h3>
      <p>De fix aan de daemon-zijde is een langer of configureerbaar opwarmvenster specifiek voor lokale-model-adapters, zodat een koud lokaal model niet op dezelfde klok wordt beoordeeld als een gehoste API. Het staat op p0 — de hoogste prioriteit van de vijf, omdat lokale-modelgebruikers precies de doelgroep zijn die BYOK bedoeld is te bedienen.</p>
      <h2>De verpakte webapp weigert te laden via gewone HTTP</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, open</strong></p>
      <h3>Symptoom</h3>
      <p>Een iets andere bug, dezelfde familie. De melder draait de verpakte webapp op een LAN-IP via gewone HTTP, en de pagina gooit een fout bij het laden — hij bereikt nooit een bruikbare staat.</p>
      <h3>Waarom het gebeurt</h3>
      <p>Na PR #1428 begonnen de analytics-provider en de PDF-export-nonce <code>crypto.randomUUID()</code> rechtstreeks aan te roepen, waarbij ze de gelaagde helper omzeilden die in PR #900 was geïntroduceerd en die netjes terugvalt wanneer de veilige crypto-API niet beschikbaar is. Chromium stelt <code>crypto.randomUUID</code> niet beschikbaar in niet-veilige contexten — en een kaal LAN-IP via gewone HTTP is, volgens de definitie van Chromium, geen veilige context. Dus de directe aanroep gooit een fout bij het laden, en de pagina gaat ermee neer. Het is strikt genomen geen BYOK-bug, maar het bijt exact dezelfde doelgroep: mensen die hun eigen infrastructuur draaien, vaak air-gapped, vaak via gewone HTTP omdat een certificaat opzetten voor een interne tool de wrijving niet waard is.</p>
      <h3>Tijdelijke oplossing</h3>
      <p>Serveer de webapp via HTTPS of via <code>localhost</code>. Beide voldoen aan de veilige-context-eis van Chromium — <code>localhost</code> wordt als veilig behandeld, zelfs zonder certificaat — en de pagina laadt normaal. Voor een snelle interne opzet is <code>localhost</code> het kostenloze pad; voor LAN-toegang is een zelf-ondertekend certificaat via HTTPS het duurzame.</p>
      <h3>Wie het oplost</h3>
      <p>PR #1621 routeert de resterende aanroepplekken terug door de gelaagde UUID-helper van PR #900, zodat de veilige-context-fallback overal weer van toepassing is in plaats van alleen waar hij al was bedraad. Het is open en in review.</p>
      <h2>Wat dit eigenlijk zegt over BYOK in Open Design</h2>
      <p>Lees de lijst als een contractkaart, geen kwaliteitsoordeel. Vier van deze vijf issues zitten op adaptergrenzen — het CLI-startpad van Gemini, het argv-gebonden CLI-transport van DeepSeek, het koude-start-startmodel van OpenCode, de veilige-context-regels van het hostplatform. De vijfde, die van Finish Design, zit op ons eigen finalize-endpoint, waar we een release geleden een Anthropic-vormige respons hard-codeerden en die we nog niet hebben gegeneraliseerd. Die ligt aan ons; de andere vier zijn de belasting die je betaalt voor het respecteren van tools die je niet hebt gebouwd.</p>
      <p>En dat is het structurele punt. Elk BYOK-systeem dat geen omgedoopte proxy is, belandt hier. Je bezit ofwel de inferentie — en verliest BYOK, want nu ben jij degene die tokens koopt en er een opslag op zet — of je respecteert de upstream-tools en erft hun randen: hun CLI's, hun verpakkingseigenaardigheden, de platformlimieten die ze elk anders afhandelen. We <a href="/blog/why-we-built-open-design-as-a-skill-layer/">kozen de tweede houding doelbewust</a>, en we zouden het opnieuw kiezen. De kosten zijn weken zoals deze, waarin de daemon- en adapter-teams in twee dagen werk indienden over vijf oppervlakken.</p>
      <p>De afweging klopt nog steeds. Een werkende setup op Claude Code, Codex, Cursor, Gemini Pro op macOS, en DeepSeek op Linux — de matrix die ongeveer 90% van onze daadwerkelijke gebruikers dekt — draait vandaag schoon, zonder proxybelasting en zonder marge op je tokens. De vijf threads hierboven zijn hoe de andere 10% van de matrix eruitziet medio mei 2026: benoemd, ingediend, en elk met een fix onderweg. Eerlijke naden verslaan een glad oppervlak dat verbergt waar de rekening heen gaat.</p>
      <h2>Wat je vandaag kunt gebruiken (matrix)</h2>
      <p>Dit is de praktische versie van de sectie hierboven — dezelfde vijf naden, in kaart gebracht op wat veilig is om nu naar te grijpen. Een ✓ betekent dat het pad werkt zoals het is; een ✗ linkt het issue dat het blokkeert, met de tijdelijke oplossing in de relevante sectie.</p>




































































      <table><thead><tr><th>Provider</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish Design-pad</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>native</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>native</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>native</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter-shim (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>OpenRouter-shim (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter-shim</td></tr><tr><td>DeepSeek TUI (lange prompts)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>OpenRouter-shim</td></tr><tr><td>OpenCode (lokaal model)</td><td>✓</td><td>✓</td><td>✓ (eerst opwarmen, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>n.v.t.</td></tr></tbody></table>
      <p>Twee lezingen van deze tabel. Als je stack in het volledig-✓-blok zit — Claude Code, Codex, Cursor of Gemini Pro — zit je op het schone pad en verandert niets hierboven je dag. Als je op een van de ✗-rijen zit, heeft de bijbehorende sectie de tijdelijke oplossing die je vandaag aan de praat krijgt terwijl de gelinkte fix wordt uitgerold. Hoe dan ook, abonneer je op het <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">BYOK-label in de tracker</a> als je een melding wilt wanneer een rij omslaat van ✗ naar ✓.</p>
      <h2>Wat je hierna moet doen</h2>
      <p>De <a href="https://github.com/nexu-io/open-design/tree/main/skills">skills-bibliotheek</a> van Open Design is de werkende laag onder dit alles — de bestandsgedreven contracten waar de BYOK-adapter in voedt zodra de verbinding gezond is. De naden hierboven gaan over het krijgen van bytes van je sleutel naar het model en terug; de skills zijn wat het model er daadwerkelijk mee doet. Als je wilt zien wat een skill van het model consumeert en wat het niet uitmaakt — wat ook de reden is dat deze adapterranden de output niet veranderen, alleen of je hem bereikt — is die directory de juiste plek om te beginnen.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Blader door de skills-bibliotheek</a>.</p>
      <h2>Gerelateerde lectuur</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-ontwerpworkflow: draai Claude, Codex of Qwen op je eigen sleutel</a> — de oorspronkelijke BYOK-uitleg, en het werkende pad waar de vijf naden hierboven aan de rand van zitten</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag bouwden, niet als een product</a> — waarom we upstream-tools respecteren in plaats van ze in een proxy te wikkelen, wat de hele reden is dat deze grenzen bestaan</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 skills, 72 systemen — hoe de bibliotheek werkt</a> — waar BYOK daadwerkelijk in voedt zodra de verbinding gezond is</li>
      </ul>
  ar:
    title: "مراجعة الواقع لـ BYOK: 5 أشياء تتعطّل في Open Design اليوم"
    summary: "وعدنا بأن يكون BYOK من الدرجة الأولى. خمسة سلاسل أخطاء مفتوحة من هذا الأسبوع — Gemini وDeepSeek وOpenCode وWindows — تُظهر أين لا تزال الوصلات خشنة، وما الذي يُستخدم إلى أن يصل كل إصلاح."
    bodyHtml: |
      <p>ما زلنا نقول للناس إن Open Design قائم على BYOK من الأساس. وهذا لا يزال صحيحًا. المقالة التأسيسية حول <a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل التصميم بنظام BYOK</a> تتناول المسار العامل — وجّه الـ daemon إلى أي نقطة نهاية متوافقة مع OpenAI، والصق مفتاحك، فتنتهي. بالنسبة لغالبية الإعدادات، هذه هي القصة بأكملها، وتبقى القصة بأكملها.</p>
      <p>لكن «BYOK» ليس ميزة واحدة. إنه عقد يمتدّ إلى مُؤلّف المحادثة، ونقطة نهاية الإنهاء، ومُنتقي النموذج، ومسار إطلاق الـ CLI، وطبقة التحليلات. وكلٌّ من هذه مكان يمكن أن ينكسر فيه العقد — والآن عدد منها مسائل (issues) مفتوحة في <a href="https://github.com/nexu-io/open-design/issues">مُتتبِّعنا العام</a>، أبلغ عنها مستخدمون خلال الـ 48 ساعة الماضية.</p>
      <p>كان بإمكاننا كتابة المقالة التأسيسية والتوقّف عند ذلك. وبدلًا من ذلك، إليك جولة الصراحة: السلاسل التي وردت هذا الأسبوع، وما الذي يتعطّل، ولماذا يتعطّل، وماذا تفعل اليوم، وأي PR (أو خانة في خارطة الطريق) يُصلحه. ولا شيء من هذا مخفيّ. إنها مُسجّلة، ومُوسومة، ومربوطة أدناه — ونُفضّل أن تقرأها منّا على أن تكتشفها في منتصف عرض يوم الجمعة.</p>
      <h2>الوعد مقابل قائمة الأخطاء</h2>
      <p>التأطير يهمّ، لأن القراءة الخاطئة السهلة هي «BYOK ناقص النضج». وهو ليس كذلك. لا شيء من الخمسة أدناه هو خطأ من نوع «BYOK لا يعمل». كلٌّ منها يقيم عند الحدّ الفاصل بين مُحوّل نمتلكه — الطبقة المتوافقة مع OpenAI، ومُنتقي النموذج، ومسار الإنهاء — وآخر لا نملكه: CLI المزوّد الأعلى (upstream)، أو خياراته في التغليف، أو نموذج العمليات في منصّة المُضيف.</p>
      <p>ذلك الحدّ الفاصل هو حيث يقيم الواقع في أي مُنسّق CLI مفتوح المصدر. نحن لا نُشغّل الاستدلال، ولا نشحن CLI مُفرَّعًا لكل مزوّد، ولا نلفّ كل شيء في وكيل (proxy) يُنعّم الحواف (ويفرض بهدوء ضريبة على رموزك). ثمن هذا الموقف هو أنه عندما يُغيّر CLI مزوّدٍ ما شكله، أو يفرض Windows حدًّا لا يفرضه macOS، تظهر الوصلة. هذا الأسبوع، ظهرت خمس من تلك الوصلات دفعة واحدة.</p>
      <p>إليك الخمس جميعًا، بالترتيب الذي وردت به.</p>
      <h2>Gemini يضلّ الطريق إلى «Finish Design»</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>، مفتوحة</strong></p>
      <h3>العَرَض</h3>
      <p>BYOK مُعدّ لـ Gemini. اختبار الاتصال في الإعدادات ينجح. مُنتقي النموذج يُعيد نماذج Gemini. المحادثة العادية تعمل — يمكنك إجراء محادثة كاملة مقابل مفتاح Gemini الخاص بك دون أي مشكلة. لكن في اللحظة التي يضغط فيها المستخدم على <strong>Finish Design</strong>، تُطلق الـ daemon خطأً بشكل Anthropic، وكأنها فجأةً نسيت أي مزوّد كانت تُحادثه.</p>
      <h3>لماذا يحدث</h3>
      <p>ردّ المُشرف على السلسلة يؤكّده: محادثة وضع API العادية تُكرّم مزوّد Gemini BYOK المُختار من طرف إلى طرف، لكن Finish Design لم يُعمَّم بعد إلى ما وراء مسار الإنهاء المتوافق مع Anthropic. كل شيء آخر يُوجَّه عبر الوكيل المُدرِك للمزوّد الذي يعرف كيف يتحدّث لهجة كل مزوّد أعلى. أما Finish Design فلا يزال يمرّ عبر نقطة نهاية إنهاء Anthropic مُثبَّتة في الشيفرة متبقّية من إصدار سابق — لذا فإن استجابة Gemini التي تصل بشكل غير Anthropic تُعثِّر المُحلِّل (parser).</p>
      <h3>الحل المؤقت</h3>
      <p>وجّه Gemini عبر OpenRouter تحت خانة المزوّد المتوافق مع Anthropic. عندئذٍ يرى مسار Finish Design استجابة بشكل Anthropic عائدةً من طبقة OpenRouter ويُنهي بشكل صحيح. إنها قفزة إضافية، وأنت تدفع توجيه OpenRouter بدلًا من استدعاء Gemini مباشرة، لكنها مستقرّة اليوم وتُغطّي المسار الوحيد المُعطَّل دون المساس بمسار المحادثة الذي يعمل بالفعل.</p>
      <h3>من يُصلحه</h3>
      <p>تعميم Finish Design الآن على خارطة طريق BYOK كأولوية P1. لا PR بعد — هذا هو الشيء التالي الذي يلتقطه فريق الـ daemon، وهو الوحيد من الخمسة الذي يُعدّ عيبًا في شيفرة نملكها بالكامل لا عدم تطابق عند الحدّ الفاصل.</p>
      <h2>Gemini 3 Flash يموت على Windows قبل وصول المُحثّ</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>، مفتوحة</strong></p>
      <h3>العَرَض</h3>
      <p>يفشل Gemini 3 Flash Preview داخل Open Design على Windows مع <code>stdin: write EOF</code> بعد نحو 1.5 ثانية — قبل أن يصل المُحثّ إلى النموذج أصلًا. Gemini 3 Pro يعمل جيدًا في التثبيت نفسه تمامًا. وواجهة Gemini CLI المباشرة (<code>gemini --model gemini-3-flash-preview ...</code>) تنجح عندما يُضبَط <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>. إذن ليس المفتاح، ولا الحساب، ولا الـ CLI بمعزل.</p>
      <h3>لماذا يحدث</h3>
      <p>استغرق التشخيص جولتين، وهو ما يستحقّ العرض لأنه مثال جيد على كيفية فكّ هذه الأمور. القراءة الأولى للقطة شاشة المُبلِّغ بدت كخطأ حصّة أعلى <code>429 RESOURCE_EXHAUSTED</code>. وبعد إعادة إنتاج نظيفة في PowerShell كتبت <code>OD_GEMINI_3_FLASH_OK</code> إلى stdout، تغيّرت الصورة: النموذج قابل للوصول، والـ CLI سليم، والفشل على مسار إطلاق Open Design ← Gemini CLI تحديدًا، وهو خاص بنسخة Flash على Windows. Pro يسلك مسار الإطلاق نفسه وينجو؛ Flash لا.</p>
      <h3>الحل المؤقت</h3>
      <p>اختر Gemini 3 Pro Preview في مُنتقي النموذج. يُشغَّل عبر مسار الإطلاق نفسه ويعمل. وبشكل منفصل — وقد استهلك هذا الجزء وقتًا أكثر من الخطأ نفسه — افحص <code>~/.gemini/hooks/</code>. خطّاف <code>gsd-check-update.js</code> بطيء (<code>Hook execution error: Hook timed out after 60000ms</code>) كان يضيف نحو 104 ثانية من العبء على كل تشغيلة في حالة هذا المستخدم، مستقلًّا تمامًا عن فشل Flash. نظّف خطّافات Gemini على أي حال؛ فخطّاف فحص تحديث مُتوقّف سيجعل أي عميل يبدو معطّلًا.</p>
      <h3>من يُصلحه</h3>
      <p>وُسِم بأنه خاص بـ Flash ومن جانب OD. التحقيق جارٍ في مسار كتابة stdin الخاص بالـ daemon — فـ <code>write EOF</code> يعني أن stdin للعملية الفرعية أُغلق قبل أن تُنهي الـ daemon كتابة المُحثّ، لذا يقيم الإصلاح في كيفية إطلاق تلك النسخة بالذات.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="مصفوفة قائمة تحقّق تنجح فيها بعض الصفوف ويُظهر عدد قليل علامة عطل، محدّدة بإطار أخضر على أرضية تحريرية شبه بيضاء">
        <figcaption>خمس وصلات صريحة — كلٌّ منها يقيم عند الحدّ الفاصل بين مُحوّل نمتلكه وCLI لا نملكه.</figcaption>
      </figure>
      <h2>واجهة DeepSeek النصّية (TUI) لديها سقف مُحثّ 30 كيلوبايت على Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>، مفتوحة</strong></p>
      <h3>العَرَض</h3>
      <p>على غلاف DeepSeek الإصدار v0.8.33 في بناء Windows مُغلَّف، يفشل مُحثّ طويل مُؤلَّف في حارس ما قبل الإقلاع لدينا مع <code>81397 > 30000 bytes</code>. المستخدم لم يُخطئ في شيء — فقد ألّف فقط مُحثًّا غنيًّا بما يكفي (سياق النظام، نظام التصميم، المراجع) ليتجاوز 30 كيلوبايت.</p>
      <h3>لماذا يحدث</h3>
      <p>ذلك الحارس مقصود، وهو يحميك من خطأ أسوأ. مُحوّل DeepSeek TUI يُرسل حاليًا المُحثّ كمُعامل سطر أوامر موضعي — مُقيَّد بـ argv — وWindows يحدّ إجمالي سطر الأوامر إلى ما دون حدّ macOS وLinux بكثير. بدون فحص ما قبل الإقلاع، سيفشل المُحثّ نفسه لاحقًا، أعمق داخل الإطلاق، بخطأ <code>ENAMETOOLONG</code> أقلّ فائدةً بكثير ودون أي تلميح إلى أن السبب هو حجم المُحثّ. لذا نفشل مبكّرًا ونُسمّي الرقم. عدم التطابق الذي تكشفه المسألة في التوثيق: الإرشاد عالي المستوى يوحي بأن حلول Windows الاحتياطية للمُحثّات الطويلة تنطبق على نطاق واسع، لكن مسار DeepSeek TUI لا يملك واحدًا بعد — فنقله لا يزال argv، لا stdin أو ملف مُحثّ.</p>
      <h3>الحل المؤقت</h3>
      <p>إذا كنت على Windows مع مُحوّل DeepSeek TUI، فأبقِ المُحثّ المُؤلَّف دون 30 كيلوبايت، أو انتقل إلى مُحوّل قائم على stdin — Claude Code وCodex وOpenCode جميعها تأخذ مُحثّها عبر stdin وليس لديها سقف مماثل. على macOS وLinux لا تعضّ هذه المسألة على الإطلاق؛ فحدّ argv هناك عالٍ بما يكفي بحيث لا تبلغه المُحثّات الواقعية.</p>
      <h3>من يُصلحه</h3>
      <p>الإصلاح الصحيح هو نقل عبر stdin أو ملف مُحثّ لمُحوّل DeepSeek TUI، وهو ما يزيل سقف argv كليًّا ويجعله متوافقًا مع مُحوّلات stdin. وهو مُتتبَّع على طابور فريق المُحوّلات.</p>
      <h2>اختبار OpenCode للـ CLI المحلي تنتهي مهلته قبل أن يُحمَّى النموذج</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>، <code>priority:p0</code>، مفتوحة</strong></p>
      <h3>العَرَض</h3>
      <p>في الإعدادات ← BYOK ← OpenCode، تنتهي مهلة اختبار الاتصال بشكل موثوق عند 45 ثانية. الجزء الغريب: إذا فتح المستخدم أولًا طرفية OpenCode Desktop وأرفق نموذج LLM محليًّا هناك، فإن اختبار Open Design نفسه ينجح في المحاولة التالية.</p>
      <h3>لماذا يحدث</h3>
      <p>تفصيلة «افتح طرفية Desktop أولًا» هي المفتاح كله. Open Design لا يرتبط بجلسة OpenCode Desktop قيد التشغيل. لاختبار تدخين في الإعدادات، تُطلق الـ daemon عمليتها الفرعية الجديدة الخاصة من OpenCode CLI وتنتظر ردّ <code>ok</code>. ومع نموذج محلي بارد — لم يُحمَّل في الذاكرة بعد — يمكن لذلك الردّ الأول أن يستغرق أطول من ميزانية الـ 45 ثانية، لأن النموذج يُقرأ من القرص ويُحمّى قبل أن يستطيع الإجابة عن أي شيء. فتح طرفية Desktop وتركها تُجيب عن مُحثّ واحد يُحمّي النموذج في ذاكرة نظام التشغيل المؤقتة على نحو يمكن للعملية الفرعية الجديدة للـ daemon الاستفادة منه فورًا. فهو إذن ليس حقًّا خطأ في OpenCode؛ بل افتراض توقيت بدء بارد خاطئ بالنسبة للنماذج المحلية.</p>
      <h3>الحل المؤقت</h3>
      <p>قبل اختبار OpenCode في Open Design، افتح OpenCode Desktop، أرفق نموذج LLM المحلي، ودعه يُجيب عن مُحثّ واحد. ثم شغّل اختبار اتصال OD — النموذج دافئ والردّ يصل ضمن الميزانية. اعتبارًا من الإصدار v0.7.0، صارت ميزانية اختبار الاتصال قابلة للضبط أيضًا، فإن كان نموذجك المحلي بطيء التحميل حقًّا فيمكنك توسيع النافذة بدلًا من تحميته يدويًّا.</p>
      <h3>من يُصلحه</h3>
      <p>الإصلاح من جانب الـ daemon هو نافذة تحمية أطول أو قابلة للضبط مخصّصة لمُحوّلات النماذج المحلية، بحيث لا يُحاكَم نموذج محلي بارد على الساعة نفسها التي تُحاكَم بها واجهة API مُستضافة. وهو مُتتبَّع عند p0 — أعلى أولوية بين الخمسة، لأن مستخدمي النماذج المحلية هم بالضبط الجمهور الذي يُفترَض أن يخدمه BYOK.</p>
      <h2>تطبيق الويب المُغلَّف يرفض التحميل عبر HTTP العادي</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>، مفتوحة</strong></p>
      <h3>العَرَض</h3>
      <p>خطأ مختلف قليلًا، من العائلة نفسها. المُبلِّغ يُشغّل تطبيق الويب المُغلَّف على عنوان IP في شبكة محلية عبر HTTP العادي، والصفحة تُطلق خطأً عند التحميل — ولا تصل أبدًا إلى حالة قابلة للاستخدام.</p>
      <h3>لماذا يحدث</h3>
      <p>بعد PR #1428، بدأ مزوّد التحليلات ورمز التصدير لمرة واحدة (nonce) الخاص بتصدير PDF يستدعيان <code>crypto.randomUUID()</code> مباشرة، متجاوزين المساعد المُتدرّج الذي قُدّم في PR #900 والذي يتراجع بأناقة عندما تكون واجهة التشفير الآمنة غير متاحة. لا يُعرّض Chromium <code>crypto.randomUUID</code> في السياقات غير الآمنة — وعنوان IP في شبكة محلية مُجرّد عبر HTTP العادي هو، بحسب تعريف Chromium، ليس سياقًا آمنًا. فالاستدعاء المباشر يُطلق خطأً عند وقت التحميل، وتسقط الصفحة معه. وهو ليس خطأ BYOK بالمعنى الدقيق، لكنه يعضّ الجمهور نفسه بالضبط: من يُشغّلون بنيتهم التحتية الخاصة، غالبًا معزولة عن الشبكة، وغالبًا عبر HTTP العادي لأن إعداد شهادة لأداة داخلية لا يستحقّ العناء.</p>
      <h3>الحل المؤقت</h3>
      <p>قدّم تطبيق الويب عبر HTTPS أو عبر <code>localhost</code>. كلاهما يُلبّي شرط السياق الآمن في Chromium — فـ <code>localhost</code> يُعامَل كآمن حتى بدون شهادة — وتُحمَّل الصفحة بشكل طبيعي. لإعداد داخلي سريع، <code>localhost</code> هو المسار عديم التكلفة؛ ولوصول الشبكة المحلية، شهادة موقّعة ذاتيًّا عبر HTTPS هي المسار الدائم.</p>
      <h3>من يُصلحه</h3>
      <p>PR #1621 يُعيد توجيه مواقع الاستدعاء المتبقّية عبر مساعد UUID المُتدرّج من PR #900، بحيث يُطبَّق التراجع للسياق الآمن في كل مكان من جديد بدلًا من حيث كان موصولًا فقط. وهو مفتوح وقيد المراجعة.</p>
      <h2>ما الذي يقوله هذا فعلًا عن BYOK في Open Design</h2>
      <p>اقرأ القائمة كخريطة عقد، لا كحُكم جودة. أربع من هذه المسائل الخمس تقع عند حدود المُحوّلات الفاصلة — مسار إطلاق Gemini CLI، ونقل DeepSeek الـ CLI المُقيَّد بـ argv، ونموذج إطلاق البدء البارد في OpenCode، وقواعد السياق الآمن في منصّة المُضيف. أما الخامسة، مسألة Finish Design، فهي عند نقطة نهاية الإنهاء الخاصة بنا، حيث ثبّتنا استجابة بشكل Anthropic في الشيفرة قبل إصدار ولم نُعمّمها بعد. تلك تقع على عاتقنا؛ والأربع الأخرى هي الضريبة التي تدفعها مقابل احترام أدوات لم تبنِها.</p>
      <p>وتلك هي النقطة البنيوية. كل نظام BYOK ليس وكيلًا مُعاد التوسيم ينتهي به الأمر هنا. فإما أن تمتلك الاستدلال — وتفقد BYOK، لأنك صرت أنت من يشتري الرموز ويفرض عليها هامشًا — أو تحترم الأدوات الأعلى وترث حوافها: واجهات الـ CLI الخاصة بها، وخصائص تغليفها الغريبة، وحدود المنصّة التي يتعامل معها كلٌّ منها بشكل مختلف. لقد <a href="/blog/why-we-built-open-design-as-a-skill-layer/">اخترنا الموقف الثاني عن قصد</a>، وسنختاره مجددًا. التكلفة أسابيع تبدو كهذا الأسبوع، حيث سجّل فريقا الـ daemon والمُحوّلات عملًا عبر خمسة أسطح في يومين.</p>
      <p>المقايضة لا تزال صحيحة. إعداد عامل على Claude Code، وCodex، وCursor، وGemini Pro على macOS، وDeepSeek على Linux — المصفوفة التي تُغطّي نحو 90% من مستخدمينا الفعليين — يعمل بنظافة اليوم، بلا ضريبة وكيل ولا هامش على رموزك. السلاسل الخمس أعلاه هي ما يبدو عليه الـ 10% الباقي من المصفوفة في منتصف مايو 2026: مُسمّاة، ومُسجّلة، ولكلٍّ منها إصلاح في الطريق. الوصلات الصريحة تتفوّق على سطح أملس يُخفي إلى أين تذهب الفاتورة.</p>
      <h2>ما الذي تستخدمه اليوم (المصفوفة)</h2>
      <p>هذه هي النسخة العملية من القسم أعلاه — الوصلات الخمس نفسها، مرسومةً على ما هو آمن للجوء إليه الآن. علامة ✓ تعني أن المسار يعمل كما هو؛ وعلامة ✗ تربط المسألة التي تحجبه، مع الحل المؤقت في القسم ذي الصلة.</p>
      <table><thead><tr><th>المزوّد</th><th>macOS</th><th>Linux</th><th>Windows</th><th>مسار Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>أصلي</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>أصلي</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>أصلي</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>طبقة OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>طبقة OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>طبقة OpenRouter</td></tr><tr><td>DeepSeek TUI (مُحثّات طويلة)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>طبقة OpenRouter</td></tr><tr><td>OpenCode (نموذج محلي)</td><td>✓</td><td>✓</td><td>✓ (حمّه أولًا، <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>غير منطبق</td></tr></tbody></table>
      <p>قراءتان لهذا الجدول. إن كانت حزمتك في كتلة كل-✓ — Claude Code، أو Codex، أو Cursor، أو Gemini Pro — فأنت على المسار النظيف ولا شيء مما سبق يُغيّر يومك. وإن كنت على أحد صفوف ✗، فإن القسم المطابق يحوي الحل المؤقت الذي يجعلك تعمل اليوم ريثما يصل الإصلاح المربوط. وفي كلتا الحالتين، اشترك في <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">وسم BYOK على المُتتبِّع</a> إن أردت إشعارًا عندما ينقلب صفّ من ✗ إلى ✓.</p>
      <h2>ما الذي تفعله بعد ذلك</h2>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">مكتبة مهارات</a> Open Design هي الطبقة العاملة تحت كل هذا — العقود المُحرَّكة بالملفات التي يُغذّيها مُحوّل BYOK بمجرّد أن يصبح الاتصال سليمًا. الوصلات أعلاه تتعلّق بإيصال البايتات من مفتاحك إلى النموذج والعودة؛ والمهارات هي ما يفعله النموذج بها فعلًا. إن أردت أن ترى ما تستهلكه مهارة من النموذج وما لا تكترث له — وهو أيضًا سبب أن حواف المُحوّلات هذه لا تُغيّر المُخرَج، بل فقط ما إذا كنت تصل إليه — فذلك المجلّد هو المكان الصحيح للبدء.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">تصفّح مكتبة المهارات</a>.</p>
      <h2>قراءات ذات صلة</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">سير عمل التصميم بنظام BYOK: شغّل Claude أو Codex أو Qwen على مفتاحك الخاص</a> — شرح BYOK الأصلي، والمسار العامل الذي تقع الوصلات الخمس أعلاه على حافّته</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات لا كمنتج</a> — لماذا نحترم الأدوات الأعلى بدلًا من لفّها في وكيل، وهو السبب الكامل لوجود هذه الحدود</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 مهارة، 72 نظامًا — كيف تعمل المكتبة</a> — ما الذي يُغذّيه BYOK فعلًا بمجرّد أن يصبح الاتصال سليمًا</li>
      </ul>
  tr:
    title: "BYOK gerçeklik kontrolü: bugün Open Design'da bozulan 5 şey"
    summary: "BYOK'u birinci sınıf bir özellik olarak vaat etmiştik. Bu haftaki beş açık hata başlığı — Gemini, DeepSeek, OpenCode, Windows — dikiş yerlerinin hâlâ nerede pürüzlü olduğunu ve her düzeltme gelene kadar ne kullanılacağını gösteriyor."
    bodyHtml: |
      <p>İnsanlara Open Design'ın temelden BYOK olduğunu söylüyoruz. Bu hâlâ doğru. <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı</a> üzerine ilk yazı, işleyen yolu anlatıyor — daemon'u OpenAI uyumlu herhangi bir uç noktaya yöneltin, anahtarınızı yapıştırın, işiniz bitti. Kurulumların çoğu için hikâyenin tamamı budur ve öyle de kalır.</p>
      <p>Ama "BYOK" tek bir özellik değildir. Sohbet düzenleyicisine, sonlandırma uç noktasına, model seçiciye, CLI başlatma yoluna ve analitik katmanına uzanan bir sözleşmedir. Bunların her biri, sözleşmenin bozulabileceği bir yerdir — ve şu anda bunlardan birkaçı, son 48 saat içinde kullanıcılar tarafından bildirilen, <a href="https://github.com/nexu-io/open-design/issues">herkese açık takipçimizdeki</a> açık sorunlardır.</p>
      <p>İlk yazıyı yazıp orada durabilirdik. Bunun yerine, işte dürüstlük turu: bu hafta gelen başlıklar, neyin bozulduğu, neden bozulduğu, bugün ne yapılacağı ve hangi PR'ın (veya yol haritası yuvasının) onu düzelttiği. Bunların hiçbiri gizli değil. Aşağıda dosyalanmış, etiketlenmiş ve bağlanmış durumda — ve bunları bir cuma günü sunumun ortasında keşfetmeniz yerine bizden okumanızı tercih ederiz.</p>
      <h2>Vaat ile hata listesi</h2>
      <p>Çerçeveleme önemli, çünkü kolay yanlış okuma "BYOK yarım pişmiş" demek. Değil. Aşağıdaki beşin hiçbiri "BYOK çalışmıyor" hatası değil. Her biri, sahip olduğumuz bir adaptör — OpenAI uyumlu katman, model seçici, sonlandırma yolu — ile sahip olmadığımız biri arasındaki sınırda yaşar: yukarı akış sağlayıcısının CLI'si, paketleme tercihleri veya barındıran platformun süreç modeli.</p>
      <p>O sınır, herhangi bir açık kaynaklı CLI orkestratöründe gerçekliğin yaşadığı yerdir. Çıkarım çalıştırmıyoruz, her sağlayıcı için çatallanmış bir CLI sunmuyoruz ve her şeyi pürüzleri yumuşatan (ve token'larınızı sessizce vergilendiren) bir proxy'ye sarmıyoruz. Bu tutumun bedeli şudur: bir sağlayıcının CLI'si biçim değiştirdiğinde veya Windows, macOS'un uygulamadığı bir sınır dayattığında, dikiş yeri belli olur. Bu hafta, bu dikiş yerlerinden beşi aynı anda belli oldu.</p>
      <p>İşte geliş sıralarına göre beşi de.</p>
      <h2>Gemini, "Finish Design"e giderken kayboluyor</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, açık</strong></p>
      <h3>Belirti</h3>
      <p>BYOK, Gemini için yapılandırılmış. Ayarlardaki bağlantı testi başarılı oluyor. Model seçici Gemini modellerini döndürüyor. Normal sohbet çalışıyor — kendi Gemini anahtarınıza karşı sorunsuz şekilde tam bir konuşma yürütebilirsiniz. Ama kullanıcı <strong>Finish Design</strong>'a bastığı anda, daemon, hangi sağlayıcıyla konuştuğunu birden unutmuş gibi, Anthropic biçimli bir hata fırlatıyor.</p>
      <h3>Neden olduğu</h3>
      <p>Başlıktaki bakım sorumlusu yanıtı bunu doğruluyor: normal API modlu sohbet, seçilen Gemini BYOK sağlayıcısını baştan sona onurlandırıyor, ancak Finish Design henüz Anthropic uyumlu sonlandırma yolunun ötesine genelleştirilmedi. Diğer her şey, her yukarı akışın lehçesini konuşmayı bilen sağlayıcı farkındalıklı proxy üzerinden yönlendiriliyor. Finish Design hâlâ daha önceki bir sürümden kalma, sabit kodlanmış bir Anthropic sonlandırma uç noktasından geçiyor — bu yüzden Anthropic dışı bir biçimde gelen bir Gemini yanıtı ayrıştırıcıyı takılıyor.</p>
      <h3>Geçici çözüm</h3>
      <p>Gemini'yi Anthropic uyumlu sağlayıcı yuvası altında OpenRouter üzerinden yönlendirin. Finish Design yolu o zaman OpenRouter'ın uyumluluk katmanından geri gelen Anthropic biçimli bir yanıt görür ve doğru şekilde sonlandırır. Ekstra bir atlama gerekir ve Gemini'yi doğrudan çağırmak yerine OpenRouter'ın yönlendirmesine ödeme yaparsınız, ama bugün kararlıdır ve zaten çalışan sohbet yoluna dokunmadan bozulan tek yolu kapsar.</p>
      <h3>Kim düzeltiyor</h3>
      <p>Finish Design genelleştirmesi artık BYOK yol haritasında P1 olarak yer alıyor. Henüz PR yok — bu, daemon ekibinin ele alacağı bir sonraki şey ve beşinin içinde, bir sınır uyuşmazlığı yerine tamamen bize ait koddaki bir kusur olan tek olanı.</p>
      <h2>Gemini 3 Flash, Windows'ta istem ulaşmadan ölüyor</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, açık</strong></p>
      <h3>Belirti</h3>
      <p>Gemini 3 Flash Preview, Windows'ta Open Design içinde yaklaşık 1,5 saniye sonra <code>stdin: write EOF</code> ile başarısız oluyor — istem modele hiç ulaşmadan önce. Gemini 3 Pro, tam olarak aynı kurulumda sorunsuz çalışıyor. Ve doğrudan Gemini CLI'si (<code>gemini --model gemini-3-flash-preview ...</code>), <code>GEMINI_CLI_TRUST_WORKSPACE=true</code> ayarlandığında başarılı oluyor. Yani sorun anahtar değil, hesap değil ve tek başına CLI değil.</p>
      <h3>Neden olduğu</h3>
      <p>Teşhis iki tur sürdü ve bunu göstermeye değer, çünkü bunların nasıl çözüldüğüne dair güzel bir örnek. Raporlayanın ekran görüntüsünün ilk okuması, bir yukarı akış <code>429 RESOURCE_EXHAUSTED</code> kota hatası gibi görünüyordu. <code>OD_GEMINI_3_FLASH_OK</code> değerini stdout'a yazan temiz bir PowerShell yeniden üretiminin ardından tablo değişti: model erişilebilir, CLI sağlıklı, başarısızlık özellikle Open Design → Gemini CLI başlatma yolunda ve Windows'taki Flash varyantına özgü. Pro aynı başlatma yolunu izliyor ve hayatta kalıyor; Flash kalamıyor.</p>
      <h3>Geçici çözüm</h3>
      <p>Model seçicide Gemini 3 Pro Preview'i seçin. Aynı başlatma yolundan geçer ve çalışır. Ayrıca — ve bu kısım hatanın kendisinden daha fazla zaman aldı — <code>~/.gemini/hooks/</code> klasörünü kontrol edin. Yavaş bir <code>gsd-check-update.js</code> hook'u (<code>Hook execution error: Hook timed out after 60000ms</code>), bu kullanıcının durumunda her çalıştırmaya kabaca 104 saniyelik ek yük ekliyordu ve bu, Flash başarısızlığından tamamen bağımsızdı. Her halükârda Gemini hook'larınızı temizleyin; takılı kalmış bir güncelleme kontrolü hook'u, herhangi bir ajanı bozuk hissettirir.</p>
      <h3>Kim düzeltiyor</h3>
      <p>Flash'a özgü ve OD tarafı olarak işaretlendi. Daemon'un stdin yazma yolu üzerinde araştırma devam ediyor — <code>write EOF</code>, daemon istemi yazmayı bitirmeden önce alt sürecin stdin'inin kapandığını söylüyor, dolayısıyla düzeltme, bu belirli varyantın nasıl başlatıldığında yatıyor.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, bazı satırların geçtiği ve birkaçının bozulma işareti gösterdiği, yeşil bir çerçeveyle seçilmiş bir kontrol listesi matrisi">
        <figcaption>Beş dürüst dikiş yeri — her biri, sahip olduğumuz bir adaptör ile sahip olmadığımız bir CLI arasındaki sınırda yaşıyor.</figcaption>
      </figure>
      <h2>DeepSeek TUI'nin Windows'ta 30 KB'lık bir istem tavanı var</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, açık</strong></p>
      <h3>Belirti</h3>
      <p>Windows paketli bir derlemedeki DeepSeek sarmalayıcısı v0.8.33'te, uzun bir oluşturulmuş istem, ön kontrol korumamızı <code>81397 > 30000 bytes</code> ile başarısız kılıyor. Kullanıcı yanlış bir şey yapmadı — sadece 30 KB'yi aşacak kadar zengin (sistem bağlamı, tasarım sistemi, referanslar) bir istem oluşturdu.</p>
      <h3>Neden olduğu</h3>
      <p>O koruma kasıtlıdır ve sizi daha kötü bir hatadan koruyor. DeepSeek TUI adaptörü şu anda istemi konumsal bir komut satırı argümanı olarak gönderiyor — argv'ye bağlı — ve Windows, toplam komut satırını macOS ve Linux'tan çok daha düşük bir seviyede sınırlıyor. Ön kontrol olmasaydı, aynı istem daha sonra, başlatmanın daha derininde, çok daha az faydalı bir <code>ENAMETOOLONG</code> hatasıyla ve nedenin istem boyutu olduğuna dair hiçbir ipucu olmadan başarısız olurdu. Bu yüzden erken başarısız oluyor ve sayıyı belirtiyoruz. Sorunun ortaya çıkardığı uyuşmazlık dokümanlarda: üst düzey yönlendirme, Windows uzun istem yedeklerinin geniş çapta uygulandığını ima ediyor, ama DeepSeek TUI yolunun henüz böyle bir yedeği yok — taşıması hâlâ argv, stdin veya bir istem dosyası değil.</p>
      <h3>Geçici çözüm</h3>
      <p>DeepSeek TUI adaptörüyle Windows'taysanız, oluşturulan istemi 30 KB'nin altında tutun veya stdin tabanlı bir adaptöre geçin — Claude Code, Codex ve OpenCode'un üçü de istemini stdin üzerinden alır ve karşılaştırılabilir bir tavanı yoktur. macOS ve Linux'ta bu sorun hiç ortaya çıkmaz; oradaki argv sınırı, gerçek dünya istemlerinin ona ulaşamayacağı kadar yüksektir.</p>
      <h3>Kim düzeltiyor</h3>
      <p>Doğru düzeltme, DeepSeek TUI adaptörü için argv tavanını tamamen kaldıran ve onu stdin adaptörleriyle aynı hizaya getiren bir stdin veya istem dosyası taşımasıdır. Adaptör ekibinin kuyruğunda takip ediliyor.</p>
      <h2>OpenCode yerel CLI testi, model ısınmadan önce zaman aşımına uğruyor</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, açık</strong></p>
      <h3>Belirti</h3>
      <p>Ayarlar → BYOK → OpenCode'da, bağlantı testi güvenilir şekilde 45 saniyede zaman aşımına uğruyor. Garip kısım: kullanıcı önce OpenCode Desktop'ın terminalini açıp orada yerel bir LLM eklerse, aynı Open Design testi bir sonraki denemede başarılı oluyor.</p>
      <h3>Neden olduğu</h3>
      <p>O "önce Desktop terminalini aç" ayrıntısı tüm ipucu. Open Design, çalışan bir OpenCode Desktop oturumuna bağlanmaz. Bir Ayarlar deneme testi için daemon, kendi taze OpenCode CLI alt sürecini başlatır ve bir <code>ok</code> yanıtı bekler. Soğuk bir yerel modelle — henüz belleğe yüklenmemiş olan biriyle — o ilk yanıt 45 saniyelik bütçeden daha uzun sürebilir, çünkü model herhangi bir şeyi yanıtlayabilmeden önce diskten okunup ısıtılıyor. Desktop terminalini açıp bir isteme yanıt vermesine izin vermek, modeli işletim sistemi önbelleğinde, daemon'un taze alt sürecinin hemen yararlanabileceği bir şekilde ısıtır. Yani bu aslında bir OpenCode hatası değil; yerel modeller için yanlış olan bir soğuk başlangıç zamanlama varsayımı.</p>
      <h3>Geçici çözüm</h3>
      <p>OpenCode'u Open Design'da test etmeden önce, OpenCode Desktop'ı açın, yerel LLM'inizi ekleyin ve bir isteme yanıt vermesine izin verin. Sonra OD bağlantı testini çalıştırın — model ısınmıştır ve yanıt bütçenin içinde gelir. v0.7.0 itibarıyla, bağlantı testi bütçesi de yapılandırılabilir, böylece yerel modeliniz gerçekten yüklenmesi yavaşsa, onu elle ısıtmak yerine pencereyi artırabilirsiniz.</p>
      <h3>Kim düzeltiyor</h3>
      <p>Daemon tarafındaki düzeltme, özellikle yerel model adaptörleri için daha uzun veya yapılandırılabilir bir ısınma penceresidir, böylece soğuk bir yerel model, barındırılan bir API ile aynı saatte değerlendirilmez. p0'da takip ediliyor — beşinin en yüksek önceliği, çünkü yerel model kullanıcıları tam olarak BYOK'un hizmet etmesi gereken kitledir.</p>
      <h2>Paketli web uygulaması düz HTTP üzerinden yüklenmeyi reddediyor</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, açık</strong></p>
      <h3>Belirti</h3>
      <p>Biraz farklı bir hata, aynı aile. Raporlayan, paketli web uygulamasını düz HTTP üzerinden bir LAN IP'sinde çalıştırıyor ve sayfa yüklenirken hata fırlatıyor — hiçbir zaman kullanılabilir bir duruma ulaşmıyor.</p>
      <h3>Neden olduğu</h3>
      <p>PR #1428'den sonra, analitik sağlayıcısı ve PDF dışa aktarma nonce'u, güvenli kripto API'si mevcut olmadığında zarif şekilde yedeğe düşen ve PR #900'de tanıtılan kademeli yardımcıyı atlayarak doğrudan <code>crypto.randomUUID()</code> çağırmaya başladı. Chromium, <code>crypto.randomUUID</code>'yi güvenli olmayan bağlamlarda açığa çıkarmaz — ve düz HTTP üzerinden çıplak bir LAN IP'si, Chromium'un tanımına göre güvenli bir bağlam değildir. Bu yüzden doğrudan çağrı yükleme anında hata fırlatır ve sayfa onunla birlikte çöker. Tam anlamıyla bir BYOK hatası değil, ama tam olarak aynı kitleyi vuruyor: kendi altyapısını çalıştıran, genellikle hava boşluklu, genellikle düz HTTP üzerinden çalışan insanlar — çünkü bir dahili araç için sertifika ayağa kaldırmak sürtünmeye değmez.</p>
      <h3>Geçici çözüm</h3>
      <p>Web uygulamasını HTTPS üzerinden veya <code>localhost</code> üzerinden sunun. Her ikisi de Chromium'un güvenli bağlam gereksinimini karşılar — <code>localhost</code>, sertifika olmadan bile güvenli sayılır — ve sayfa normal şekilde yüklenir. Hızlı bir dahili kurulum için <code>localhost</code> sıfır maliyetli yoldur; LAN erişimi için HTTPS üzerinden kendinden imzalı bir sertifika kalıcı olanıdır.</p>
      <h3>Kim düzeltiyor</h3>
      <p>PR #1621, kalan çağrı noktalarını PR #900'deki kademeli UUID yardımcısı üzerinden geri yönlendirir, böylece güvenli bağlam yedeği yalnızca zaten bağlı olduğu yerde değil, her yerde tekrar uygulanır. Açık ve inceleme altında.</p>
      <h2>Bu, Open Design'daki BYOK hakkında gerçekte ne söylüyor</h2>
      <p>Listeyi bir kalite hükmü olarak değil, bir sözleşme haritası olarak okuyun. Bu beş sorunun dördü adaptör sınırlarında yer alıyor — Gemini'nin CLI başlatma yolu, DeepSeek'in argv'ye bağlı CLI taşıması, OpenCode'un soğuk başlangıç başlatma modeli, barındıran platformun güvenli bağlam kuralları. Beşincisi, Finish Design olanı, kendi sonlandırma uç noktamızda; bir sürüm önce Anthropic biçimli bir yanıtı sabit kodladığımız ve henüz genelleştirmediğimiz yer. O bizim sorumluluğumuz; diğer dördü, sizin inşa etmediğiniz araçlara saygı duymanın bedelidir.</p>
      <p>Ve yapısal nokta budur. Yeniden markalanmış bir proxy olmayan her BYOK sistemi sonunda burada biter. Ya çıkarımın sahibi olursunuz — ve BYOK'u kaybedersiniz, çünkü artık token alıp üzerine kâr koyan siz olursunuz — ya da yukarı akış araçlarına saygı gösterip onların pürüzlerini miras alırsınız: CLI'lerini, paketleme tuhaflıklarını, her birinin farklı şekilde ele aldığı platform sınırlarını. Biz <a href="/blog/why-we-built-open-design-as-a-skill-layer/">ikinci tutumu kasıtlı olarak seçtik</a> ve tekrar seçerdik. Bedeli, daemon ve adaptör ekiplerinin iki günde beş yüzeyde iş dosyaladığı, bu hafta gibi görünen haftalardır.</p>
      <p>Ödünleşim hâlâ doğru. macOS'ta Claude Code, Codex, Cursor, Gemini Pro ve Linux'ta DeepSeek üzerinde çalışan bir kurulum — gerçek kullanıcılarımızın kabaca %90'ını kapsayan matris — bugün proxy vergisi olmadan ve token'larınızda kâr marjı olmadan temiz çalışıyor. Yukarıdaki beş başlık, mayıs 2026 ortasında matrisin diğer %10'unun nasıl göründüğüdür: adlandırılmış, dosyalanmış ve her biri yolda bir düzeltmeyle. Dürüst dikiş yerleri, faturanın nereye gittiğini gizleyen pürüzsüz bir yüzeyi yener.</p>
      <h2>Bugün ne kullanılmalı (matris)</h2>
      <p>Bu, yukarıdaki bölümün pratik versiyonu — aynı beş dikiş yeri, şu anda neye güvenle uzanılabileceğine eşlenmiş. Bir ✓, yolun olduğu gibi çalıştığı anlamına gelir; bir ✗, onu engelleyen sorunu bağlar, geçici çözüm ilgili bölümdedir.</p>




























































      <table><thead><tr><th>Sağlayıcı</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Finish Design yolu</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>yerel</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>yerel</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>yerel</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter uyumluluk katmanı (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>OpenRouter uyumluluk katmanı (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>OpenRouter uyumluluk katmanı</td></tr><tr><td>DeepSeek TUI (uzun istemler)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>OpenRouter uyumluluk katmanı</td></tr><tr><td>OpenCode (yerel model)</td><td>✓</td><td>✓</td><td>✓ (önce ısıtın, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>uygulanamaz</td></tr></tbody></table>
      <p>Bu tablonun iki okuması var. Yığınınız tümü-✓ bloğundaysa — Claude Code, Codex, Cursor veya Gemini Pro — temiz yoldasınız ve yukarıdaki hiçbir şey gününüzü değiştirmez. ✗ satırlarından birindeyseniz, eşleşen bölümde, bağlı düzeltme gelene kadar sizi bugün çalışır hale getiren geçici çözüm var. Her iki durumda da, bir satır ✗'den ✓'ye döndüğünde bildirim almak isterseniz <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">takipçideki BYOK etiketine</a> abone olun.</p>
      <h2>Sırada ne yapılmalı</h2>
      <p>Open Design'ın <a href="https://github.com/nexu-io/open-design/tree/main/skills">beceri kütüphanesi</a>, tüm bunların altındaki işleyen katmandır — bağlantı sağlıklı olduğunda BYOK adaptörünün beslediği dosya odaklı sözleşmeler. Yukarıdaki dikiş yerleri, baytları anahtarınızdan modele ve geri taşımakla ilgilidir; beceriler ise modelin onlarla gerçekte ne yaptığıdır. Bir becerinin modelden ne tükettiğini ve neyi umursamadığını görmek isterseniz — ki bu da bu adaptör pürüzlerinin neden çıktıyı değil, yalnızca ona ulaşıp ulaşmadığınızı değiştirdiğinin nedenidir — o dizin, başlanacak doğru yerdir.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Beceri kütüphanesine göz atın</a>.</p>
      <h2>İlgili okumalar</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım iş akışı: Claude, Codex veya Qwen'i kendi anahtarınızla çalıştırın</a> — orijinal BYOK açıklaması ve yukarıdaki beş dikiş yerinin kenarında durduğu işleyen yol</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — yukarı akış araçlarını bir proxy'ye sarmak yerine neden onlara saygı gösterdiğimiz, ki bu da bu sınırların var olmasının tüm nedeni</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 beceri, 72 sistem — kütüphane nasıl çalışır</a> — bağlantı sağlıklı olduğunda BYOK'un gerçekte neye beslediği</li>
      </ul>
  uk:
    title: "Перевірка реальності BYOK: 5 речей, які ламаються в Open Design сьогодні"
    summary: "Ми обіцяли BYOK як першокласну можливість. П’ять відкритих гілок з багами цього тижня — Gemini, DeepSeek, OpenCode, Windows — показують, де шви ще шорсткі та чим користуватися, доки кожне виправлення не вийде."
    bodyHtml: |
      <p>Ми розповідаємо людям, що Open Design є BYOK від самого фундаменту. Це досі правда. Початковий допис про <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-робочий процес дизайну</a> розглядає робочий шлях — спрямуйте daemon на будь-яку сумісну з OpenAI кінцеву точку, вставте ключ, і все готово. Для більшості налаштувань це вся історія, і вона лишається всією історією.</p>
      <p>Але «BYOK» — це не єдина функція. Це контракт, що сягає компонувальника чату, кінцевої точки фіналізації, селектора моделей, шляху запуску CLI та рівня аналітики. Кожне з цих місць — це там, де контракт може зламатися, і прямо зараз кілька з них є відкритими задачами в нашому <a href="https://github.com/nexu-io/open-design/issues">публічному трекері</a>, повідомленими користувачами за останні 48 годин.</p>
      <p>Ми могли б написати початковий допис і на цьому зупинитися. Натомість ось чесний прохід: гілки, які надійшли цього тижня, що ламається, чому ламається, що робити сьогодні та який PR (чи слот у дорожній карті) це виправляє. Жодне з цього не приховане. Усе зафайлено, позначено й залінковано нижче — і ми б воліли, щоб ви прочитали це від нас, а не виявили посеред презентації в п’ятницю.</p>
      <h2>Обіцянка проти списку багів</h2>
      <p>Рамка має значення, бо легке хибне прочитання — «BYOK напівсирий». Це не так. Жоден з п’яти нижче не є багом «BYOK не працює». Кожен з них живе на межі між адаптером, яким володіємо ми — сумісним з OpenAI рівнем, селектором моделей, шляхом фіналізації — і тим, яким не володіємо: CLI вищого провайдера, його рішеннями щодо пакування чи моделлю процесів хост-платформи.</p>
      <p>Ця межа — це там, де живе реальність у будь-якому опенсорсному CLI-оркестраторі. Ми не виконуємо інференс, ми не постачаємо форкнутий CLI для кожного провайдера й не загортаємо все в проксі, що згладжує кути (і тихо оподатковує ваші токени). Ціна такої позиції в тому, що коли CLI провайдера змінює форму чи Windows нав’язує обмеження, якого немає в macOS, шов стає видимим. Цього тижня п’ять таких швів стали видимими одночасно.</p>
      <p>Ось усі п’ять, у порядку надходження.</p>
      <h2>Gemini губиться на шляху до «Finish Design»</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1619">Issue #1619</a> — <code>bug</code>, відкрито</strong></p>
      <h3>Симптом</h3>
      <p>BYOK налаштовано для Gemini. Тест з’єднання в Налаштуваннях успішний. Селектор моделей повертає моделі Gemini. Звичайний чат працює — ви можете вести повноцінну розмову на власному ключі Gemini без жодних проблем. Але щойно користувач натискає <strong>Finish Design</strong>, daemon викидає помилку у формі Anthropic, ніби раптом забув, з яким провайдером розмовляв.</p>
      <h3>Чому це відбувається</h3>
      <p>Відповідь мейнтейнера в гілці це підтверджує: звичайний чат у режимі API повністю шанує обраного BYOK-провайдера Gemini від початку до кінця, але Finish Design ще не узагальнили за межі сумісного з Anthropic шляху фіналізації. Усе інше маршрутизується через проксі з урахуванням провайдера, який уміє розмовляти діалектом кожного вищого сервісу. Finish Design досі йде через жорстко закодовану кінцеву точку фіналізації Anthropic, що залишилася з попереднього релізу — тож відповідь Gemini, що надходить у не-Anthropic формі, спотикає парсер.</p>
      <h3>Обхідний шлях</h3>
      <p>Маршрутизуйте Gemini через OpenRouter у слоті сумісного з Anthropic провайдера. Тоді шлях Finish Design бачить відповідь у формі Anthropic, що повертається від shim OpenRouter, і фіналізує коректно. Це додатковий крок, і ви платите за маршрутизацію OpenRouter, а не звертаєтеся до Gemini напряму, але це стабільно сьогодні й покриває той єдиний шлях, що зламаний, не торкаючись шляху чату, який уже працює.</p>
      <h3>Хто це виправляє</h3>
      <p>Узагальнення Finish Design тепер у дорожній карті BYOK як P1. PR ще немає — це наступне, за що візьметься команда daemon, і це єдиний з п’яти, що є дефектом у коді, яким ми повністю володіємо, а не невідповідністю на межі.</p>
      <h2>Gemini 3 Flash вмирає на Windows ще до того, як долетить запит</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1611">Issue #1611</a> — <code>bug</code>, відкрито</strong></p>
      <h3>Симптом</h3>
      <p>Gemini 3 Flash Preview падає всередині Open Design на Windows з <code>stdin: write EOF</code> приблизно за 1.5 секунди — ще до того, як запит сягне моделі. Gemini 3 Pro працює чудово в тій самій інсталяції. А прямий CLI Gemini (<code>gemini --model gemini-3-flash-preview ...</code>) успішний, коли встановлено <code>GEMINI_CLI_TRUST_WORKSPACE=true</code>. Тож справа не в ключі, не в акаунті й не в CLI самому по собі.</p>
      <h3>Чому це відбувається</h3>
      <p>Діагностика зайняла два проходи, і це варто показати, бо це гарний приклад того, як такі речі розплутують. Перше прочитання скриншота репортера виглядало як помилка квоти <code>429 RESOURCE_EXHAUSTED</code> з боку вищого сервісу. Після чистого відтворення в PowerShell, що записало <code>OD_GEMINI_3_FLASH_OK</code> у stdout, картина змінилася: модель доступна, CLI здоровий, збій саме на шляху запуску Open Design → Gemini CLI, і він специфічний для варіанта Flash на Windows. Pro проходить тим самим шляхом запуску й виживає; Flash — ні.</p>
      <h3>Обхідний шлях</h3>
      <p>Оберіть Gemini 3 Pro Preview в селекторі моделей. Він проходить тим самим шляхом запуску й працює. Окремо — і ця частина забрала більше часу, ніж сам баг — перевірте <code>~/.gemini/hooks/</code>. Повільний хук <code>gsd-check-update.js</code> (<code>Hook execution error: Hook timed out after 60000ms</code>) додавав приблизно 104с накладних витрат на кожен запуск у випадку цього користувача, цілком незалежно від збою Flash. Очистіть свої хуки Gemini незалежно від цього; завислий хук перевірки оновлень змусить будь-якого агента здаватися зламаним.</p>
      <h3>Хто це виправляє</h3>
      <p>Позначено як специфічне для Flash і з боку OD. Розслідування триває щодо шляху запису stdin у daemon — <code>write EOF</code> каже, що stdin дочірнього процесу закрився до того, як daemon дописав запит, тож виправлення живе в тому, як спавниться саме цей варіант.</p>
      <figure>
        <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="Матриця чек-листа, де деякі рядки проходять, а кілька показують позначку поломки, виділена зеленою рамкою на майже білому редакційному тлі">
        <figcaption>П’ять чесних швів — кожен живе на межі між адаптером, яким володіємо ми, і CLI, яким не володіємо.</figcaption>
      </figure>
      <h2>DeepSeek TUI має стелю запиту в 30 КБ на Windows</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1610">Issue #1610</a> — <code>bug</code>, відкрито</strong></p>
      <h3>Симптом</h3>
      <p>На обгортці DeepSeek v0.8.33 у пакованій збірці для Windows довгий складений запит провалює нашу попередню перевірку з <code>81397 > 30000 bytes</code>. Користувач не зробив нічого поганого — він просто склав запит достатньо насичений (системний контекст, дизайн-система, референси), щоб перетнути 30 КБ.</p>
      <h3>Чому це відбувається</h3>
      <p>Ця перевірка навмисна, і вона захищає вас від гіршої помилки. Адаптер DeepSeek TUI наразі надсилає запит як позиційний аргумент командного рядка — прив’язаний до argv — а Windows обмежує сумарний командний рядок значно нижче, ніж macOS і Linux. Без попередньої перевірки той самий запит провалився б пізніше, глибше у спавні, з куди менш корисною помилкою <code>ENAMETOOLONG</code> і без жодного натяку, що причиною був розмір запиту. Тож ми падаємо рано й називаємо число. Невідповідність, яку оголює ця задача, — у документації: високорівневі вказівки натякають, що резервні механізми для довгих запитів на Windows застосовуються широко, але шлях DeepSeek TUI ще не має такого — його транспорт досі argv, а не stdin чи файл запиту.</p>
      <h3>Обхідний шлях</h3>
      <p>Якщо ви на Windows з адаптером DeepSeek TUI, тримайте складений запит під 30 КБ або перемкніться на адаптер на основі stdin — Claude Code, Codex та OpenCode всі приймають свій запит через stdin і не мають порівнянної стелі. На macOS і Linux ця задача взагалі не кусається; ліміт argv там достатньо високий, що реальні запити його не сягають.</p>
      <h3>Хто це виправляє</h3>
      <p>Правильне виправлення — це транспорт через stdin або файл запиту для адаптера DeepSeek TUI, який повністю усуває стелю argv і приводить його у відповідність до stdin-адаптерів. Це відстежується в черзі команди адаптерів.</p>
      <h2>Тест локального CLI OpenCode перевищує тайм-аут, перш ніж модель прогріється</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1603">Issue #1603</a> — <code>bug</code>, <code>priority:p0</code>, відкрито</strong></p>
      <h3>Симптом</h3>
      <p>У Налаштування → BYOK → OpenCode тест з’єднання надійно перевищує тайм-аут на 45 секундах. Дивна частина: якщо користувач спершу відкриває термінал OpenCode Desktop і приєднує там локальну LLM, той самий тест Open Design тоді успішний з наступної спроби.</p>
      <h3>Чому це відбувається</h3>
      <p>Та деталь «спершу відкрий термінал Desktop» — це вся підказка. Open Design не приєднується до запущеної сесії OpenCode Desktop. Для димового тесту в Налаштуваннях daemon спавнить власний свіжий підпроцес OpenCode CLI і чекає на відповідь <code>ok</code>. З холодною локальною моделлю — такою, яку ще не завантажено в пам’ять — ця перша відповідь може зайняти довше, ніж бюджет у 45 секунд, бо модель зчитується з диска й прогрівається, перш ніж зможе будь-що відповісти. Відкриття термінала Desktop і дозвіл йому відповісти на один запит прогріває модель у кеші ОС так, що свіжий підпроцес daemon потім може одразу з цього скористатися. Тож це насправді не баг OpenCode; це хибне припущення щодо часу холодного старту, неправильне для локальних моделей.</p>
      <h3>Обхідний шлях</h3>
      <p>Перш ніж тестувати OpenCode в Open Design, відкрийте OpenCode Desktop, приєднайте свою локальну LLM і дозвольте їй відповісти на один запит. Потім запустіть тест з’єднання OD — модель прогріта, і відповідь вкладається в бюджет. Починаючи з v0.7.0, бюджет тесту з’єднання також налаштовуваний, тож якщо ваша локальна модель справді повільно завантажується, ви можете збільшити вікно замість того, щоб прогрівати її вручну.</p>
      <h3>Хто це виправляє</h3>
      <p>Виправлення з боку daemon — це довше чи налаштовуване вікно прогріву спеціально для адаптерів локальних моделей, щоб холодну локальну модель не судили за тим самим годинником, що й хмарний API. Це відстежується на p0 — найвищому пріоритеті з п’яти, бо користувачі локальних моделей — це саме та аудиторія, яку BYOK покликаний обслуговувати.</p>
      <h2>Пакований вебзастосунок відмовляється завантажуватися через звичайний HTTP</h2>
      <p><strong><a href="https://github.com/nexu-io/open-design/issues/1620">Issue #1620</a> — <code>bug</code>, відкрито</strong></p>
      <h3>Симптом</h3>
      <p>Дещо інший баг, та сама сім’я. Репортер запускає пакований вебзастосунок на IP-адресі в локальній мережі через звичайний HTTP, і сторінка падає під час завантаження — вона ніколи не досягає робочого стану.</p>
      <h3>Чому це відбувається</h3>
      <p>Після PR #1428 провайдер аналітики й nonce експорту PDF почали викликати <code>crypto.randomUUID()</code> напряму, обходячи багаторівневий помічник, представлений у PR #900, який плавно переходить на резервний варіант, коли безпечне crypto API недоступне. Chromium не надає <code>crypto.randomUUID</code> у небезпечних контекстах — а гола IP-адреса локальної мережі через звичайний HTTP, за визначенням Chromium, не є безпечним контекстом. Тож прямий виклик падає під час завантаження, і сторінка падає разом з ним. Це не строго баг BYOK, але він кусає саме ту аудиторію: людей, що запускають власну інфраструктуру, часто ізольовану від мережі, часто через звичайний HTTP, бо підняти сертифікат для внутрішнього інструмента не варте тертя.</p>
      <h3>Обхідний шлях</h3>
      <p>Подавайте вебзастосунок через HTTPS або через <code>localhost</code>. Обидва задовольняють вимогу Chromium щодо безпечного контексту — <code>localhost</code> вважається безпечним навіть без сертифіката — і сторінка завантажується нормально. Для швидкого внутрішнього налаштування <code>localhost</code> — це безкоштовний шлях; для доступу з локальної мережі самопідписаний сертифікат через HTTPS — довговічний.</p>
      <h3>Хто це виправляє</h3>
      <p>PR #1621 повертає решту місць виклику назад через багаторівневий помічник UUID з PR #900, тож резервний варіант для безпечного контексту знову застосовується всюди, а не лише там, де він уже був підключений. Він відкритий і на розгляді.</p>
      <h2>Що це насправді каже про BYOK в Open Design</h2>
      <p>Читайте список як мапу контракту, а не вирок щодо якості. Чотири з цих п’яти задач сидять на межах адаптерів — шлях запуску CLI Gemini, прив’язаний до argv транспорт CLI DeepSeek, модель запуску з холодним стартом OpenCode, правила безпечного контексту хост-платформи. П’ята, та що про Finish Design, — біля нашої власної кінцевої точки фіналізації, де ми жорстко закодували відповідь у формі Anthropic релізом тому й ще не узагальнили її. Ця на нас; інші чотири — це податок, який ви платите за повагу до інструментів, які ви не будували.</p>
      <p>І це структурна суть. Кожна система BYOK, що не є переклеєним проксі, опиняється тут. Ви або володієте інференсом — і втрачаєте BYOK, бо тепер саме ви купуєте токени й накручуєте на них націнку — або поважаєте вищі інструменти й успадковуєте їхні кути: їхні CLI, їхні особливості пакування, платформенні ліміти, які кожен з них обробляє по-різному. Ми <a href="/blog/why-we-built-open-design-as-a-skill-layer/">обрали другу позицію навмисно</a>, і обрали б її знову. Ціна — це тижні, що виглядають як цей, коли команди daemon і адаптерів зафайлили роботу на п’яти поверхнях за два дні.</p>
      <p>Компроміс усе ще правильний. Робоче налаштування на Claude Code, Codex, Cursor, Gemini Pro на macOS і DeepSeek на Linux — матриця, що покриває приблизно 90% наших фактичних користувачів — працює чисто сьогодні, без податку проксі й без націнки на ваші токени. П’ять гілок вище — це те, як виглядають інші 10% матриці в середині травня 2026 року: названі, зафайлені, і кожна з виправленням у дорозі. Чесні шви кращі за гладку поверхню, що приховує, куди йде рахунок.</p>
      <h2>Чим користуватися сьогодні (матриця)</h2>
      <p>Це практична версія розділу вище — ті самі п’ять швів, накладені на те, за що безпечно братися прямо зараз. ✓ означає, що шлях працює як є; ✗ лінкує задачу, що його блокує, з обхідним шляхом у відповідному розділі.</p>




































































      <table><thead><tr><th>Провайдер</th><th>macOS</th><th>Linux</th><th>Windows</th><th>Шлях Finish Design</th></tr></thead><tbody><tr><td>Claude Code (Sonnet / Opus)</td><td>✓</td><td>✓</td><td>✓</td><td>нативний</td></tr><tr><td>Codex</td><td>✓</td><td>✓</td><td>✓</td><td>нативний</td></tr><tr><td>Cursor (BYOK)</td><td>✓</td><td>✓</td><td>✓</td><td>нативний</td></tr><tr><td>Gemini 3 Pro Preview</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>Gemini 3 Flash Preview</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1611">#1611</a>)</td><td>shim OpenRouter (<a href="https://github.com/nexu-io/open-design/issues/1619">#1619</a>)</td></tr><tr><td>DeepSeek (API)</td><td>✓</td><td>✓</td><td>✓</td><td>shim OpenRouter</td></tr><tr><td>DeepSeek TUI (довгі запити)</td><td>✓</td><td>✓</td><td>✗ (<a href="https://github.com/nexu-io/open-design/issues/1610">#1610</a>)</td><td>shim OpenRouter</td></tr><tr><td>OpenCode (локальна модель)</td><td>✓</td><td>✓</td><td>✓ (спершу прогрій, <a href="https://github.com/nexu-io/open-design/issues/1603">#1603</a>)</td><td>—</td></tr></tbody></table>
      <p>Два прочитання цієї таблиці. Якщо ваш стек у блоці суцільних ✓ — Claude Code, Codex, Cursor чи Gemini Pro — ви на чистому шляху, і ніщо вище не змінює ваш день. Якщо ви в одному з рядків ✗, у відповідному розділі є обхідний шлях, що дозволяє вам працювати сьогодні, доки залінковане виправлення не вийде. Так чи інакше, підпишіться на <a href="https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK">мітку BYOK у трекері</a>, якщо хочете сповіщення, коли рядок перемкнеться з ✗ на ✓.</p>
      <h2>Що робити далі</h2>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Бібліотека навичок</a> Open Design — це робочий рівень під усім цим: керовані файлами контракти, у які подається BYOK-адаптер, щойно з’єднання здорове. Шви вище — про те, як донести байти від вашого ключа до моделі й назад; навички — це те, що модель власне з ними робить. Якщо ви хочете побачити, що навичка споживає від моделі, а що їй байдуже — і це також причина, чому ці кути адаптерів не змінюють результат, а лише те, чи ви до нього дістанетеся — ця тека є правильним місцем для початку.</p>
      <p><a href="https://github.com/nexu-io/open-design/tree/main/skills">Перегляньте бібліотеку навичок</a>.</p>
      <h2>Пов’язане для читання</h2>
      <ul>
      <li><a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-робочий процес дизайну: запускайте Claude, Codex чи Qwen на власному ключі</a> — оригінальне пояснення BYOK і робочий шлях, на краю якого сидять п’ять швів вище</li>
      <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як рівень навичок, а не продукт</a> — чому ми поважаємо вищі інструменти замість того, щоб загортати їх у проксі, що є цілою причиною існування цих меж</li>
      <li><a href="/blog/31-skills-72-systems-how-the-library-works/">31 навичка, 72 системи — як працює бібліотека</a> — у що BYOK власне подається, щойно з’єднання здорове</li>
      </ul>
---

We've been telling people Open Design is BYOK from the ground up. That's still true. The seed post on the [BYOK design workflow](/blog/byok-design-workflow-claude-codex-qwen/) walks through the working path — point the daemon at any OpenAI-compatible endpoint, paste your key, you're done. For the majority of setups, that's the whole story, and it stays the whole story.

But "BYOK" isn't a single feature. It's a contract that reaches into the chat composer, the finalize endpoint, the model picker, the CLI launch path, and the analytics layer. Each of those is a place where the contract can break — and right now several of them are open issues in our [public tracker](https://github.com/nexu-io/open-design/issues), reported by users in the last 48 hours.

We could have written the seed post and stopped there. Instead, here's the honesty pass: the threads that came in this week, what breaks, why it breaks, what to do today, and which PR (or roadmap slot) is fixing it. None of these are hidden. They're filed, labelled, and linked below — and we'd rather you read them from us than discover them mid-deck on a Friday.

## The promise vs the bug list

The framing matters, because the easy misread is "BYOK is half-baked." It isn't. None of the five below are "BYOK doesn't work" bugs. Every one of them lives at the boundary between an adapter we own — the OpenAI-compatible layer, the model picker, the finalize path — and one we don't: the upstream provider's CLI, their packaging choices, or the host platform's process model.

That boundary is where reality lives in any open-source CLI orchestrator. We don't run inference, we don't ship a forked CLI for each provider, and we don't wrap everything in a proxy that smooths the edges (and quietly taxes your tokens). The price of that posture is that when a provider's CLI changes shape, or Windows enforces a limit macOS doesn't, the seam shows. This week, five of those seams showed at once.

Here are all five, in the order they came in.

## Gemini gets lost on the way to "Finish Design"

**[Issue #1619](https://github.com/nexu-io/open-design/issues/1619) — `bug`, open**

### Symptom

BYOK is configured for Gemini. The Settings test connection succeeds. The model picker returns Gemini models. Regular chat works — you can hold a full conversation against your own Gemini key with no trouble. But the moment the user hits **Finish Design**, the daemon throws an Anthropic-shaped error, as if it suddenly forgot which provider it was talking to.

### Why it happens

The maintainer reply on the thread confirms it: regular API-mode chat honors the selected Gemini BYOK provider end to end, but Finish Design has not yet been generalized beyond the Anthropic-compatible finalize path. Everything else routes through the provider-aware proxy that knows how to speak each upstream's dialect. Finish Design still goes through a hardcoded Anthropic finalize endpoint left over from an earlier release — so a Gemini response arriving in a non-Anthropic shape trips the parser.

### Workaround

Route Gemini through OpenRouter under the Anthropic-compatible provider slot. The Finish Design path then sees an Anthropic-shaped response coming back from OpenRouter's shim and finalizes correctly. It's an extra hop, and you're paying OpenRouter's routing rather than calling Gemini directly, but it's stable today and it covers the one path that's broken without touching the chat path that already works.

### Who's fixing it

The Finish Design generalization is now on the BYOK roadmap as a P1. No PR yet — this is the next thing the daemon team picks up, and it's the only one of the five that's a defect in code we fully own rather than a boundary mismatch.

## Gemini 3 Flash dies on Windows before the prompt lands

**[Issue #1611](https://github.com/nexu-io/open-design/issues/1611) — `bug`, open**

### Symptom

Gemini 3 Flash Preview fails inside Open Design on Windows with `stdin: write EOF` after about 1.5 seconds — before the prompt ever reaches the model. Gemini 3 Pro works fine in the exact same install. And the direct Gemini CLI (`gemini --model gemini-3-flash-preview ...`) succeeds when `GEMINI_CLI_TRUST_WORKSPACE=true` is set. So it's not the key, not the account, and not the CLI in isolation.

### Why it happens

The diagnosis took two passes, which is worth showing because it's a good example of how these get untangled. The first read of the reporter's screenshot looked like an upstream `429 RESOURCE_EXHAUSTED` quota error. After a clean PowerShell repro that wrote `OD_GEMINI_3_FLASH_OK` to stdout, the picture changed: the model is reachable, the CLI is healthy, the failure is on the Open Design → Gemini CLI launch path specifically, and it's specific to the Flash variant on Windows. Pro takes the same launch path and survives; Flash doesn't.

### Workaround

Select Gemini 3 Pro Preview in the model picker. It runs through the same launch path and works. Separately — and this bit caught more time than the bug itself — check `~/.gemini/hooks/`. A slow `gsd-check-update.js` hook (`Hook execution error: Hook timed out after 60000ms`) was adding roughly 104s of overhead to every run in this user's case, completely independent of the Flash failure. Clean your Gemini hooks regardless; a stalled update-check hook will make any agent feel broken.

### Who's fixing it

Flagged as Flash-specific and OD-side. Investigation is in progress on the daemon's stdin write path — the `write EOF` says the child's stdin closed before the daemon finished writing the prompt, so the fix lives in how that particular variant is spawned.

<figure>
  <img src="/blog/byok-reality-check-5-things-that-break-inline.webp" alt="A checklist matrix where some rows pass and a few show a break mark, selected in a green frame on a near-white editorial ground" />
  <figcaption>Five honest seams — each one lives at the boundary between an adapter we own and a CLI we don't.</figcaption>
</figure>

## DeepSeek TUI has a 30 KB prompt ceiling on Windows

**[Issue #1610](https://github.com/nexu-io/open-design/issues/1610) — `bug`, open**

### Symptom

On the DeepSeek wrapper v0.8.33 in a Windows packaged build, a long composed prompt fails our pre-flight guard with `81397 > 30000 bytes`. The user did nothing wrong — they just composed a prompt rich enough (system context, design system, references) to cross 30 KB.

### Why it happens

That guard is intentional, and it's protecting you from a worse error. The DeepSeek TUI adapter currently sends the prompt as a positional command-line argument — argv-bound — and Windows caps the total command line well below where macOS and Linux do. Without the pre-flight check, the same prompt would fail later, deeper in the spawn, with a far less useful `ENAMETOOLONG` error and no hint that the cause was prompt size. So we fail early and name the number. The mismatch the issue exposes is in the docs: the high-level guidance implies Windows long-prompt fallbacks apply broadly, but the DeepSeek TUI path doesn't have one yet — its transport is still argv, not stdin or a prompt file.

### Workaround

If you're on Windows with the DeepSeek TUI adapter, keep the composed prompt under 30 KB, or switch to a stdin-based adapter — Claude Code, Codex, and OpenCode all take their prompt over stdin and have no comparable ceiling. On macOS and Linux this issue does not bite at all; the argv limit there is high enough that real-world prompts don't reach it.

### Who's fixing it

The right fix is a stdin or prompt-file transport for the DeepSeek TUI adapter, which removes the argv ceiling entirely and brings it in line with the stdin adapters. It's tracked on the adapter team's queue.

## The OpenCode local-CLI test times out before the model warms up

**[Issue #1603](https://github.com/nexu-io/open-design/issues/1603) — `bug`, `priority:p0`, open**

### Symptom

In Settings → BYOK → OpenCode, the connection test reliably times out at 45 seconds. The strange part: if the user first opens OpenCode Desktop's terminal and attaches a local LLM there, the same Open Design test then succeeds on the next try.

### Why it happens

That "open the Desktop terminal first" detail is the whole clue. Open Design doesn't attach to a running OpenCode Desktop session. For a Settings smoke test, the daemon spawns its own fresh OpenCode CLI subprocess and waits for an `ok` reply. With a cold local model — one that hasn't been loaded into memory yet — that first reply can take longer than the 45-second budget, because the model is being read off disk and warmed before it can answer anything. Opening the Desktop terminal and letting it answer one prompt warms the model in the OS cache in a way the daemon's fresh subprocess can then immediately benefit from. So it isn't really an OpenCode bug; it's a cold-start timing assumption that's wrong for local models.

### Workaround

Before testing OpenCode in Open Design, open OpenCode Desktop, attach your local LLM, and let it answer one prompt. Then run the OD connection test — the model is warm and the reply lands inside the budget. As of v0.7.0, the connection-test budget is also configurable, so if your local model is genuinely slow to load you can bump the window instead of warming it by hand.

### Who's fixing it

The daemon-side fix is a longer or configurable warmup window specifically for local-model adapters, so a cold local model doesn't get judged on the same clock as a hosted API. It's tracked at p0 — the highest priority of the five, because local-model users are exactly the audience BYOK is meant to serve.

## The packaged web app refuses to load over plain HTTP

**[Issue #1620](https://github.com/nexu-io/open-design/issues/1620) — `bug`, open**

### Symptom

Slightly different bug, same family. The reporter is running the packaged web app on a LAN IP over plain HTTP, and the page throws on load — it never reaches a usable state.

### Why it happens

After PR #1428, the analytics provider and the PDF export nonce started calling `crypto.randomUUID()` directly, bypassing the tiered helper introduced in PR #900 that falls back gracefully when the secure crypto API isn't available. Chromium does not expose `crypto.randomUUID` in non-secure contexts — and a bare LAN IP over plain HTTP is, by Chromium's definition, not a secure context. So the direct call throws at load time, and the page goes down with it. It isn't strictly a BYOK bug, but it bites the exact same audience: people running their own infrastructure, often air-gapped, often over plain HTTP because standing up a cert for an internal tool isn't worth the friction.

### Workaround

Serve the web app over HTTPS or over `localhost`. Both satisfy Chromium's secure-context requirement — `localhost` is treated as secure even without a cert — and the page loads normally. For a quick internal setup, `localhost` is the zero-cost path; for LAN access, a self-signed cert over HTTPS is the durable one.

### Who's fixing it

PR #1621 routes the remaining call sites back through the tiered UUID helper from PR #900, so the secure-context fallback applies everywhere again instead of only where it was already wired. It's open and under review.

## What this actually says about BYOK in Open Design

Read the list as a contract map, not a quality verdict. Four of these five issues sit at adapter boundaries — Gemini's CLI launch path, DeepSeek's argv-bound CLI transport, OpenCode's cold-start launch model, the host platform's secure-context rules. The fifth, the Finish Design one, is at our own finalize endpoint, where we hardcoded an Anthropic-shaped response a release ago and haven't generalized it yet. That one's on us; the other four are the tax you pay for respecting tools you didn't build.

And that's the structural point. Every BYOK system that isn't a rebadged proxy ends up here. You either own the inference — and lose BYOK, because now you're the one buying tokens and marking them up — or you respect the upstream tools and inherit their edges: their CLIs, their packaging quirks, the platform limits they each handle differently. We [picked the second posture deliberately](/blog/why-we-built-open-design-as-a-skill-layer/), and we'd pick it again. The cost is weeks that look like this one, where the daemon and adapter teams filed work across five surfaces in two days.

The trade is still right. A working setup on Claude Code, Codex, Cursor, Gemini Pro on macOS, and DeepSeek on Linux — the matrix that covers roughly 90% of our actual users — runs cleanly today, with no proxy tax and no margin on your tokens. The five threads above are what the other 10% of the matrix looks like in mid-May 2026: named, filed, and each with a fix in flight. Honest seams beat a smooth surface that hides where the bill goes.

## What to use today (matrix)

This is the practical version of the section above — the same five seams, mapped onto what's safe to reach for right now. A ✓ means the path works as-is; an ✗ links the issue that's blocking it, with the workaround in the relevant section.

| Provider | macOS | Linux | Windows | Finish Design path |
|---|---|---|---|---|
| Claude Code (Sonnet / Opus) | ✓ | ✓ | ✓ | native |
| Codex | ✓ | ✓ | ✓ | native |
| Cursor (BYOK) | ✓ | ✓ | ✓ | native |
| Gemini 3 Pro Preview | ✓ | ✓ | ✓ | OpenRouter shim ([#1619](https://github.com/nexu-io/open-design/issues/1619)) |
| Gemini 3 Flash Preview | ✓ | ✓ | ✗ ([#1611](https://github.com/nexu-io/open-design/issues/1611)) | OpenRouter shim ([#1619](https://github.com/nexu-io/open-design/issues/1619)) |
| DeepSeek (API) | ✓ | ✓ | ✓ | OpenRouter shim |
| DeepSeek TUI (long prompts) | ✓ | ✓ | ✗ ([#1610](https://github.com/nexu-io/open-design/issues/1610)) | OpenRouter shim |
| OpenCode (local model) | ✓ | ✓ | ✓ (warm first, [#1603](https://github.com/nexu-io/open-design/issues/1603)) | n/a |

Two reads of this table. If your stack is in the all-✓ block — Claude Code, Codex, Cursor, or Gemini Pro — you're on the clean path and nothing above changes your day. If you're on one of the ✗ rows, the matching section has the workaround that gets you running today while the linked fix lands. Either way, subscribe to the [BYOK label on the tracker](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK) if you want a notification when a row flips from ✗ to ✓.

## What to do next

Open Design's [skills library](https://github.com/nexu-io/open-design/tree/main/skills) is the working layer underneath all of this — the file-driven contracts the BYOK adapter feeds into once the connection is healthy. The seams above are about getting bytes from your key to the model and back; the skills are what the model actually does with them. If you want to see what a skill consumes from the model and what it doesn't care about — which is also why these adapter edges don't change the output, only whether you reach it — that directory is the right place to start.

[Browse the skills library](https://github.com/nexu-io/open-design/tree/main/skills).

## Related reading

- [BYOK design workflow: run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — the original BYOK explainer, and the working path the five seams above sit at the edge of
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — why we respect upstream tools instead of wrapping them in a proxy, which is the whole reason these boundaries exist
- [31 skills, 72 systems — how the library works](/blog/31-skills-72-systems-how-the-library-works/) — what BYOK actually feeds into once the connection is healthy
