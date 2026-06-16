---
title: "Open Design 0.10.0: the all-in-one design workspace"
date: 2026-06-11
category: "Product"
readingTime: 7
summary: "Tag open-design-v0.10.0 — 405 PRs from 68 contributors in nine days. Codename \"the all-in-one Agentic design workspace.\" This release collapses the whole flow — concept, refinement, and handoff — into a single window, so the work stops living across a dozen tabs."
i18n:
  zh:
    title: "Open Design 0.10.0：一体化设计工作空间"
    summary: "标签 open-design-v0.10.0 —— 九天内 68 位贡献者提交了 405 个 PR。代号「一体化 Agentic 设计工作空间」。本次发布把从构思、精修到交付的整条流程收进同一个窗口，工作不再散落在十几个标签页之间。"
    bodyHtml: |
      <p>标签 <code>open-design-v0.10.0</code>，于 2026 年 6 月 11 日发布。<strong>九天内 68 位贡献者提交了 405 个 PR。</strong>代号「一体化 Agentic 设计工作空间」—— 这是一次<strong>单窗口发布</strong>。前三次发布让「开始」变得廉价，而这一次让「<em>持续</em>」也变得廉价。从最初的构思到最终的交付，工作不再散落在十几个标签页和三个应用之间。</p>
      <p>想看完整版本，可以查阅 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub 上的发布说明</a>。本文是精简版：底层改了什么、你今天能用它做什么，以及从哪里开始。</p>

      <h2>为什么标签页之间的反复横跳是一种税</h2>
      <p>一款设计工具的价值，体现在那些枯燥的中间环节 —— 不是第一条提示词，而是第四十次编辑。Open Design 过去正是在这个中间环节漏水。你在一个地方起草，在另一个地方运行，又在别处留下评论，然后手动导出到下一个工具里。每一次跳转都是一次小小的上下文切换，而无数次小小的上下文切换累积起来，就成了一整天忙忙碌碌却交付不出东西。</p>
      <p>0.10.0 把这个闭环补上了。整条链路 ——「<strong>构思 → 精修 → 交付</strong>」—— 都发生在同一个窗口里，状态会跟随你流转，而不是在每一道边界上重置。</p>

      <h2>一个窗口承载整条流程</h2>
      <p>工作空间现在是一个单一界面，而不是一组需要你来回穿梭的房间。</p>
      <p>一个 <strong>Lexical 驱动的编辑器</strong>取代了原来的纯文本框：你可以把原子化的 mention 胶囊作为整体 token 插入、选中和删除，光标终于能和你输入的内容对齐了。可交互的<strong>终端</strong>让你就地管理会话。浏览器风格的<strong>参考面板</strong>把你的输入随手放在手边，评论支持<strong>拖拽附件</strong>，你还可以<strong>分叉一段对话</strong>去探索某个分支，而不会丢失你原本所在的那条线索。画布以<strong>全高</strong>运行，一个<strong>常驻的手动编辑检查器</strong>让精确调整一键即达，而不再深埋在某个面板里。</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="一行编辑器输入框中包含若干圆角的 mention 胶囊 token，其中一个胶囊被绿色选择框选中，背景为近白色的编辑风底色" />
        <figcaption>编辑器把 mention 当作原子化的胶囊 —— 作为整体 token 插入、选中和删除。</figcaption>
      </figure>

      <h2>默认异步</h2>
      <p>反馈不再需要排队等待。<strong>评论队列</strong>让你在一次运行仍在进行时就堆叠预览评论 —— 你持续对作品做出反应，Open Design 会在当前这一轮完成后立即接手这些笔记。<strong>并行会话</strong>并排运行，生成过程中会随进度展示<strong>分阶段的预览反馈</strong>，而需要澄清的<strong>问题会移到专门的右侧标签页</strong>，这样它们在向你提问时不会霸占画布。</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="一叠排队中的评论卡片旁边是一条运行中的进度条，被绿色选择框选中，背景为近白色的编辑风底色" />
        <figcaption>在一次运行仍在进行时排队反馈；思考时没有任何东西会被阻塞。</figcaption>
      </figure>

      <h2>BYOK 与交付迈向生产级</h2>
      <p>流程的两端 —— 把你自己的密钥带进来，以及把成果交出去 —— 在本次发布中都成熟了。</p>
      <p><strong>BYOK 随输随验。</strong>API 密钥会获得字段级校验，草稿在保存前就会被检查，模型列表优先采用跨服务商实时拉取的模型，因此错误的密钥或过期的模型名会在表单处明确报错，而不是在运行途中悄无声息地失败。</p>
      <p><strong>交付成为真正的基础设施。</strong>一套<strong>沙箱运行时基础</strong>、<strong>运行级 MCP 工具包</strong>、<strong>项目导出清单</strong>，以及<strong>受控的预览 URL</strong>，把「设计到编辑器」和「设计到 Code Agent」从复制粘贴的苦差变成了一次定义清晰的交付。而当真的出问题时，<strong>诊断</strong>会指出原因：带 Langfuse 关联的运行失败分类、提示词栈诊断，以及安全重试策略，这样一次失败会把你指向修复方案，而不是一个耸肩。</p>

      <h2>0.10.0 中还有什么</h2>
      <p>这次发布覆盖面很广。值得拎出来说的几块：</p>
      <ul>
        <li><strong>分叉，而非重来。</strong>把一段对话分叉出去尝试另一个方向，让两条线索都保持存活，而不是覆盖掉你喜欢的那条。</li>
        <li><strong>承载上下文的评论。</strong>拖拽附件意味着一张截图或一份参考能随笔记一同附带，就在改动发生的地方。</li>
        <li><strong>一个真正可浏览的参考面板。</strong>输入安放在浏览器风格的面板里，而不是在聊天中向上滚动消失。</li>
        <li><strong>可恢复的失败。</strong>可识别的失败原因配上恢复选项，取代了死胡同；一次失败的运行会告诉你下一步该怎么做。</li>
        <li><strong>面向每一种桌面的构建。</strong>macOS（Apple Silicon 与 Intel x64）和 Windows（安装版与便携版），通过 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> 和 releases.open-design.ai 提供。</li>
      </ul>
      <p>完整清单长达 405 个 PR。其余内容都在 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub 上的发布说明</a>里。</p>

      <h2>今天就能用它做什么</h2>
      <table>
        <thead>
          <tr><th>如果你是……</th><th>从这里开始</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design 新用户</td><td>下载桌面应用，登录一次，端到端跑一个简报 —— 构思、精修和交付全部留在同一个窗口里</td></tr>
          <tr><td>已经在用 Open Design</td><td>让打包内置的自动更新把你升级到 0.10.0；编辑器、评论队列和全高画布默认开启</td></tr>
          <tr><td>把成果交付进代码</td><td>使用运行级 MCP 工具包、导出清单和受控的预览 URL，把一份设计直接交给你的编辑器或 Code Agent</td></tr>
          <tr><td>带上自己的密钥</td><td>重新检查一下设置 —— 字段级校验和实时模型列表意味着错误的密钥或过期的模型名会立刻浮现</td></tr>
        </tbody>
      </table>

      <h2>接下来做什么</h2>
      <p>如果你一直在这边一份草稿、那边一次运行、又在别处导出之间反复横跳，那么这就是把它们归拢到同一处的那次发布。下载桌面应用，跑一个你本来就打算跑的简报 —— 这一次，从构思到交付都不会离开这个窗口。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下载 Open Design</a>。</p>
      <p>9 天 405 个 PR，来自 68 个朝同一个方向使劲的人。一体化工作空间之所以存在，是因为如此多的贡献者填平了那些过去会把你赶到另一个标签页的小缝隙。一场运动不会从某一个团队的笔记本电脑里发布出来；它从那些挺身而出、动手去建的人手中发布出来。我们看见你们了。🫡</p>

      <h2>延伸阅读</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0：人人皆可设计</a> —— 本次发布所依托的那次「安装即创作」发布</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0：万物皆插件</a> —— 这一切底层的引擎重建</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我们为什么把 Open Design 做成一个技能层，而非一款产品</a> —— 「是层，不是产品」这一押注背后更长的宣言</li>
      </ul>
  zh-tw:
    title: "Open Design 0.10.0：一站式設計工作空間"
    summary: "標籤 open-design-v0.10.0 —— 九天內由 68 位貢獻者提交 405 個 PR。代號「一站式 Agentic 設計工作空間」。這個版本把整套流程 —— 構思、打磨與交付 —— 收進單一視窗，讓工作不再散落在十幾個分頁之間。"
    bodyHtml: |
      <p>標籤 <code>open-design-v0.10.0</code>，於 2026 年 6 月 11 日發佈。<strong>九天內由 68 位貢獻者提交 405 個 PR。</strong>代號「一站式 Agentic 設計工作空間」—— 這是<strong>單一視窗版本</strong>。前三個版本讓「開始」變得低成本；這個版本讓「持續」也變得低成本。從最初的構思到最終的交付，工作不再散落於十幾個分頁與三個應用程式之間。</p>
      <p>如果你想看完整版本，<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub 上的發佈說明</a>有全部內容。本文是精簡版：底層改了什麼、今天你能用它做什麼，以及從何處著手。</p>

      <h2>為什麼來回切換分頁是一種稅</h2>
      <p>設計工具真正的價值體現在枯燥的中段 —— 不是第一個提示，而是第四十次編輯。而那個中段正是 Open Design 過去漏水的地方。你在一處起草，在另一處執行，又在別的地方留下評論，然後再手動匯出到接下來要用的工具裡。每一次切換都是一次小小的脈絡切換，而這些小切換累積起來，就讓一天過得忙碌卻交付不出任何東西。</p>
      <p>0.10.0 把這個迴圈閉合了。整段流程 —— <strong>構思 → 打磨 → 交付</strong> —— 都在單一視窗中完成，狀態會跟著你走，而不是在每個邊界都重設。</p>

      <h2>整套流程一個視窗</h2>
      <p>工作空間現在是單一的介面，而不是一組讓你在其間來回穿梭的房間。</p>
      <p>一個 <strong>Lexical 驅動的編輯器</strong>取代了原本的純文字框：你可以插入、選取並刪除整個 token 的原子化提及標籤（mention pill），游標終於能跟你輸入的內容對齊。互動式<strong>終端機</strong>讓你就地管理工作階段。瀏覽器風格的<strong>參考看板</strong>讓你的輸入素材隨手可得，評論支援<strong>拖放附件</strong>，而且你可以<strong>分叉一段對話</strong>去探索某個分支，又不會失去原本的脈絡。畫布以<strong>全高</strong>運行，而<strong>釘選的手動編輯檢視器</strong>讓精細調整只需一鍵，而不是埋在某個面板裡。</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="一行編輯器輸入框中放著數個圓角的提及標籤 token，其中一個標籤被選取在綠色選取框內，背景為近乎純白的編輯版面" />
        <figcaption>編輯器把提及當成原子化標籤處理 —— 以整個 token 為單位插入、選取與刪除。</figcaption>
      </figure>

      <h2>預設即非同步</h2>
      <p>回饋不再需要排隊等候。<strong>評論佇列</strong>讓你在一次執行仍在進行時就堆疊預覽評論 —— 你持續對作品做出反應，而 Open Design 會在當前這一輪一結束時就接手這些備註。<strong>平行工作階段</strong>並排運行，生成過程會即時顯示<strong>分階段的預覽回饋</strong>，而需要釐清的<strong>問題會移到專屬的右側分頁</strong>，這樣它們既能提示你、又不會劫持畫布。</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="一疊排入佇列的評論卡片，旁邊是一條運行中的進度條，被選取在綠色框內，背景為近乎純白的編輯版面" />
        <figcaption>在一次執行仍進行時就排入回饋；思考時不會有任何東西卡住你。</figcaption>
      </figure>

      <h2>BYOK 與交付達到生產級</h2>
      <p>流程的兩端 —— 帶入你自己的金鑰，以及把成果交付出去 —— 在這個版本都成熟了。</p>
      <p><strong>BYOK 在你輸入時即時驗證。</strong>API 金鑰會做欄位層級的驗證，草稿在你儲存前就會先檢查，模型清單則偏好跨供應商即時抓取的模型，這樣錯誤的金鑰或過時的模型名稱就會在表單上明確報錯，而不是在執行中途默默失敗。</p>
      <p><strong>交付成為真正的基礎設施。</strong>一套<strong>沙箱執行環境基礎</strong>、<strong>以執行為範圍的 MCP 工具組</strong>、<strong>專案匯出清單（manifest）</strong>，以及<strong>受限的預覽 URL</strong>，把「設計到編輯器」和「設計到 Code Agent」從一件複製貼上的雜務，變成一道有明確定義的交付。而當真的出了狀況時，<strong>診斷</strong>會指出原因：帶有 Langfuse 關聯的執行失敗分類、提示堆疊（prompt-stack）診斷，以及安全重試策略，這樣失敗會把你指向修正之道，而不是一個聳肩。</p>

      <h2>0.10.0 還帶來了什麼</h2>
      <p>這個版本範圍很廣。值得特別提出的部分：</p>
      <ul>
        <li><strong>分叉，而非重新開始。</strong>分支出一段對話去嘗試另一個方向，並讓兩條脈絡都保持存活，而不是覆蓋掉你原本喜歡的那一條。</li>
        <li><strong>帶著脈絡的評論。</strong>拖放附件意味著一張截圖或一份參考素材會跟著備註一起走，就在改動發生的地方。</li>
        <li><strong>真正可以瀏覽的參考看板。</strong>輸入素材安放在瀏覽器風格的看板裡，而不是順著聊天往上捲走。</li>
        <li><strong>可復原的失敗。</strong>可辨識的失敗原因搭配復原選項，取代了死路；一次失敗的執行會告訴你下一步該怎麼做。</li>
        <li><strong>為每種桌面平台建置。</strong>macOS（Apple Silicon 與 Intel x64）與 Windows（安裝程式與免安裝版），透過 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> 與 releases.open-design.ai 取得。</li>
      </ul>
      <p>完整清單多達 405 個 PR。<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub 上的發佈說明</a>收錄了其餘部分。</p>

      <h2>今天就能用它做什麼</h2>
      <table>
        <thead>
          <tr><th>如果你是…</th><th>從這裡開始</th></tr>
        </thead>
        <tbody>
          <tr><td>初次接觸 Open Design</td><td>下載桌面應用程式，登入一次，然後從頭到尾跑一份簡報 —— 構思、打磨與交付全都留在這一個視窗裡</td></tr>
          <tr><td>已經在使用 Open Design</td><td>讓內建的自動更新把你帶到 0.10.0；編輯器、評論佇列與全高畫布皆預設開啟</td></tr>
          <tr><td>要把成果交付進程式碼</td><td>使用以執行為範圍的 MCP 工具組、匯出清單與受限預覽 URL，把一份設計直接交給你的編輯器或 Code Agent</td></tr>
          <tr><td>要帶入自己的金鑰</td><td>重新檢查設定 —— 欄位層級驗證與即時模型清單意味著錯誤的金鑰或過時的模型名稱會立刻浮現</td></tr>
        </tbody>
      </table>

      <h2>接下來該做什麼</h2>
      <p>如果你一直在這裡的草稿、那裡的執行、以及別處的匯出之間來回彈跳，這就是把它們收進同一處的版本。下載桌面應用程式，跑一份你本來就要跑的簡報 —— 這一次，從構思到交付都不會離開這個視窗。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">下載 Open Design</a>。</p>
      <p>九天 405 個 PR，來自 68 位朝同一個方向使力的人。一站式工作空間之所以存在，是因為如此多的貢獻者填補了那些過去會把你打發到另一個分頁的小縫隙。一場運動不會從某一支團隊的筆電裡發佈出來；它從那些現身並動手建造的人身上發佈出來。我們看見你了。🫡</p>

      <h2>延伸閱讀</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0：為每個人而設計</a> —— 本版本所立足的「安裝即創作」版本</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0：一切皆外掛</a> —— 這一切底層的引擎重建</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">我們為何把 Open Design 建成一個技能層，而非一項產品</a> —— 「是層，而非產品」這一賭注背後更完整的宣言</li>
      </ul>
  ja:
    title: "Open Design 0.10.0：オールインワンのデザインワークスペース"
    summary: "タグ open-design-v0.10.0 — 9日間で68人のコントリビューターから405件のPR。コードネームは「オールインワンのエージェント型デザインワークスペース」。このリリースは、コンセプト・洗練・ハンドオフという一連のフロー全体を単一のウィンドウへと集約し、作業が何枚ものタブにまたがって散らばることをなくします。"
    bodyHtml: |
      <p>タグ <code>open-design-v0.10.0</code>、2026年6月11日にリリース。<strong>9日間で68人のコントリビューターから405件のPR。</strong>コードネームは「オールインワンのエージェント型デザインワークスペース」——これは<strong>ワンウィンドウのリリース</strong>です。直近3回のリリースは始めることのコストを下げましたが、今回は<em>続ける</em>ことのコストを下げます。最初のコンセプトから最終的なハンドオフまで、作業が何枚ものタブと3つのアプリにまたがって散らばることはもうありません。</p>
      <p>詳細版が読みたい方は、<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub のリリースノート</a>をご覧ください。本記事は短縮版です：内部で何が変わったか、今日それで何ができるか、そしてどこから始めればよいか。</p>

      <h2>なぜタブの行き来が「税」だったのか</h2>
      <p>デザインツールの真価は、退屈な中盤——最初のプロンプトではなく、40回目の編集——で発揮されます。Open Design がかつて取りこぼしていたのは、まさにその中盤でした。ある場所で下書きし、別の場所で実行し、さらに別のどこかでコメントを残し、そして次に続くものへ手作業でエクスポートする。一つ一つの行き来はささやかなコンテキストの切り替えですが、ささやかなコンテキストの切り替えは積み重なり、忙しく感じるのに何も出荷できない一日になります。</p>
      <p>0.10.0 はそのループを閉じます。一連の流れ全体——<strong>コンセプト → 洗練 → ハンドオフ</strong>——が単一のウィンドウ内で起こり、状態は境界ごとにリセットされるのではなく、あなたについてきます。</p>

      <h2>フロー全体をひとつのウィンドウで</h2>
      <p>ワークスペースは、行き来する部屋の集まりではなく、ひとつの面になりました。</p>
      <p><strong>Lexical を基盤とするコンポーザー</strong>が、素朴なテキストボックスを置き換えます。挿入・選択・削除を一つのトークンとして丸ごと扱えるアトミックなメンションピル、そして入力した内容にようやくぴたりと揃うキャレットを備えています。インタラクティブな<strong>ターミナル</strong>では、その場でセッションを管理できます。ブラウザ風の<strong>リファレンスボード</strong>が入力素材を手元に保ち、コメントは<strong>ドラッグ＆ドロップの添付</strong>に対応し、元のスレッドを見失うことなく<strong>会話をフォーク</strong>して別の枝を探求できます。キャンバスは<strong>フルハイト</strong>で動作し、<strong>ピン留めされた手動編集インスペクター</strong>が、パネルに埋もれさせるのではなく、正確な微調整をワンクリックの距離に保ちます。</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="ほぼ白のエディトリアルな地に、丸みを帯びた複数のメンションピル・トークンを保持したコンポーザーの入力行。1つのピルが緑の選択フレーム内で選択されている" />
        <figcaption>コンポーザーはメンションをアトミックなピルとして扱う——挿入・選択・削除を一つのトークンとして丸ごと行えます。</figcaption>
      </figure>

      <h2>デフォルトで非同期</h2>
      <p>フィードバックはもう順番を待つ必要がありません。<strong>コメントキュー</strong>を使えば、実行がまだ進行中でもプレビューコメントを積み重ねられます——あなたは作業に反応し続け、Open Design は現在のパスが終わり次第そのメモを拾い上げます。<strong>並列セッション</strong>が並んで動作し、生成は進行に合わせて<strong>段階的なプレビューフィードバック</strong>を表示し、確認のための<strong>質問は専用の右側タブへ移動</strong>するので、キャンバスを乗っ取ることなくあなたに問いかけます。</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="ほぼ白のエディトリアルな地に、実行中のプログレスバーの横に積み重なったキュー待ちのコメントカード。緑のフレームで選択されている" />
        <figcaption>実行がまだ進行中の間にフィードバックをキューに入れる。考えている間も何もブロックされません。</figcaption>
      </figure>

      <h2>BYOK とハンドオフがプロダクション品質に</h2>
      <p>フローの両端——自分のキーを持ち込むことと、作業を外へ取り出すこと——はどちらも今回のリリースで成熟しました。</p>
      <p><strong>BYOK は入力しながら検証されます。</strong>API キーはフィールド単位で検証され、下書きは保存前にチェックされ、モデルリストはプロバイダーをまたいでライブ取得されたモデルを優先します。これにより、誤ったキーや古いモデル名は、実行の途中で静かに失敗するのではなく、フォーム上で明確に失敗します。</p>
      <p><strong>ハンドオフは本物のインフラになります。</strong><strong>サンドボックスランタイム基盤</strong>、<strong>実行スコープの MCP ツールバンドル</strong>、<strong>プロジェクトエクスポートマニフェスト</strong>、そして<strong>隔離されたプレビュー URL</strong>が、「デザインからエディターへ」「デザインから Code Agent へ」を、コピー＆ペーストの雑務から明確に定義されたハンドオフへと変えます。そして何かが実際に壊れたときには、<strong>診断</strong>が原因を名指しします：Langfuse 連携による実行失敗の分類、プロンプトスタックの診断、安全なリトライポリシー。これにより、失敗はあなたを肩すくめではなく修正へと導きます。</p>

      <h2>0.10.0 に含まれるその他の変更</h2>
      <p>このリリースは幅広い内容です。前面に押し出す価値のあるものは次のとおり：</p>
      <ul>
        <li><strong>再起動ではなく、フォーク。</strong>気に入ったものを上書きするのではなく、会話を分岐させて別の方向を試し、両方のスレッドを生かしておけます。</li>
        <li><strong>コンテキストを運ぶコメント。</strong>ドラッグ＆ドロップの添付により、スクリーンショットやリファレンスが、変更が起こるまさにその場所でメモと一緒に付いてきます。</li>
        <li><strong>実際にブラウズできるリファレンスボード。</strong>入力素材はチャットの上方へスクロールして消えていくのではなく、ブラウザ風のボードに収まります。</li>
        <li><strong>回復可能な失敗。</strong>回復オプション付きの特定可能な失敗原因が、行き止まりを置き換えます。失敗した実行は、次に何をすべきかを教えてくれます。</li>
        <li><strong>あらゆるデスクトップ向けのビルド。</strong><a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> と releases.open-design.ai 経由で、macOS（Apple Silicon および Intel x64）と Windows（インストーラーおよびポータブル）に対応。</li>
      </ul>
      <p>全リストは405件のPRに及びます。残りは<a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub のリリースノート</a>に記載されています。</p>

      <h2>今日それで何をするか</h2>
      <table>
        <thead>
          <tr><th>あなたが…</th><th>ここから始める</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design が初めて</td><td>デスクトップアプリをダウンロードし、一度サインインして、ブリーフを最初から最後まで通して実行——コンセプト、洗練、ハンドオフのすべてがひとつのウィンドウに収まります</td></tr>
          <tr><td>すでに Open Design を使っている</td><td>パッケージ版の自動アップデートで 0.10.0 へ。コンポーザー、コメントキュー、フルハイトのキャンバスはデフォルトで有効です</td></tr>
          <tr><td>作業をコードへ出荷する</td><td>実行スコープの MCP バンドル、エクスポートマニフェスト、隔離されたプレビュー URL を使って、デザインをエディターや Code Agent へそのまま渡せます</td></tr>
          <tr><td>自分のキーを持ち込む</td><td>設定を再確認——フィールド単位の検証とライブのモデルリストにより、不正なキーや古いモデル名がすぐに表面化します</td></tr>
        </tbody>
      </table>

      <h2>次にすること</h2>
      <p>こちらで下書き、あちらで実行、どこか別の場所でエクスポートと跳ね回っていたなら、これはそれらをひとつの場所にまとめるリリースです。デスクトップアプリをダウンロードして、どのみち実行するつもりだったブリーフを走らせてみてください——今回は、コンセプトからハンドオフまでウィンドウを離れることはありません。</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design をダウンロード</a>。</p>
      <p>9日間で405件のPR、同じ方向へ力を合わせた68人から。オールインワンのワークスペースが存在するのは、かつてあなたを別のタブへ追いやっていた小さな隙間を、これほど多くのコントリビューターが埋めてくれたからです。ムーブメントは一つのチームのノートパソコンから出荷されるのではありません。現れて、作り上げた人々から出荷されるのです。私たちはあなたを見ています。🫡</p>

      <h2>関連記事</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0：すべての人のためのデザイン</a> — 今回がその上に築かれた、インストールして作るリリース</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0：すべてはプラグイン</a> — その下にあるエンジンの再構築</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">なぜ私たちは Open Design をプロダクトではなくスキルレイヤーとして作ったのか</a> — 「プロダクトではなくレイヤー」という賭けの背後にある、より長いマニフェスト</li>
      </ul>
  ko:
    title: "Open Design 0.10.0: 올인원 디자인 워크스페이스"
    summary: "태그 open-design-v0.10.0 — 9일 동안 68명의 기여자가 만든 405개의 PR. 코드명은 \"올인원 에이전트 기반 디자인 워크스페이스\". 이번 릴리스는 콘셉트, 다듬기, 핸드오프로 이어지는 전체 흐름을 하나의 창으로 모아, 작업이 더 이상 수많은 탭을 넘나들지 않도록 합니다."
    bodyHtml: |
      <p>태그 <code>open-design-v0.10.0</code>, 2026년 6월 11일 출시. <strong>9일 동안 68명의 기여자가 만든 405개의 PR.</strong> 코드명 "올인원 에이전트 기반 디자인 워크스페이스" — 이것은 <strong>단일 창 릴리스</strong>입니다. 지난 세 번의 릴리스가 시작을 저렴하게 만들었다면, 이번 릴리스는 <em>머무는</em> 일을 저렴하게 만듭니다. 첫 콘셉트부터 최종 핸드오프까지, 작업은 더 이상 수많은 탭과 세 개의 앱에 흩어지지 않습니다.</p>
      <p>긴 버전이 궁금하다면 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub의 릴리스 노트</a>에 담겨 있습니다. 이 글은 짧은 버전입니다: 내부에서 무엇이 바뀌었는지, 오늘 그것으로 무엇을 할 수 있는지, 그리고 어디서 시작하면 되는지.</p>

      <h2>탭을 넘나드는 일이 왜 비용이었나</h2>
      <p>디자인 도구는 지루한 중간 구간에서 진가를 발휘합니다 — 첫 번째 프롬프트가 아니라 마흔 번째 편집에서. 바로 그 중간 구간이 Open Design이 새던 곳이었습니다. 한 곳에서 초안을 쓰고, 다른 곳에서 실행하고, 또 다른 어딘가에 코멘트를 남기고, 그다음에는 무엇이든 이어질 곳으로 손수 내보냈죠. 그 모든 이동은 작은 컨텍스트 전환이었고, 작은 컨텍스트 전환들이 쌓여 바쁘기만 하고 아무것도 출시하지 못하는 하루를 만듭니다.</p>
      <p>0.10.0은 그 고리를 닫습니다. 전체 여정 — <strong>콘셉트 → 다듬기 → 핸드오프</strong> — 이 하나의 창에서 일어나며, 상태는 경계마다 초기화되는 대신 당신을 따라옵니다.</p>

      <h2>전체 흐름을 위한 하나의 창</h2>
      <p>워크스페이스는 이제 사이를 오가는 여러 개의 방이 아니라 하나의 단일한 면입니다.</p>
      <p><strong>Lexical 기반 컴포저</strong>가 평범한 텍스트 상자를 대체합니다: 통째로 하나의 토큰처럼 삽입하고, 선택하고, 삭제할 수 있는 원자적 멘션 알약과, 마침내 입력한 내용과 일치하는 커서. 인터랙티브 <strong>터미널</strong>은 세션을 그 자리에서 관리할 수 있게 해줍니다. 브라우저 스타일의 <strong>참조 보드</strong>는 입력을 손이 닿는 곳에 두고, 코멘트는 <strong>드래그 앤 드롭 첨부</strong>를 지원하며, 떠나온 흐름을 잃지 않고 한 갈래를 탐색하도록 <strong>대화를 포크</strong>할 수 있습니다. 캔버스는 <strong>전체 높이</strong>로 동작하고, <strong>고정된 수동 편집 인스펙터</strong>는 정밀한 조정을 패널 깊숙이 묻어두는 대신 한 번의 클릭 거리에 둡니다.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="거의 흰색에 가까운 편집 배경 위에, 여러 개의 둥근 멘션 알약 토큰을 담은 컴포저 입력 줄이 있고, 그중 하나의 알약이 녹색 선택 프레임 안에 선택되어 있다" />
        <figcaption>컴포저는 멘션을 원자적 알약으로 다룹니다 — 통째로 하나의 토큰처럼 삽입하고, 선택하고, 삭제하세요.</figcaption>
      </figure>

      <h2>기본적으로 비동기</h2>
      <p>피드백은 더 이상 차례를 기다릴 필요가 없습니다. <strong>코멘트 큐</strong>는 실행이 아직 진행 중인 동안에도 프리뷰 코멘트를 쌓아둘 수 있게 해줍니다 — 당신은 작업에 계속 반응하고, Open Design은 현재 패스가 끝나는 즉시 그 메모를 집어 듭니다. <strong>병렬 세션</strong>이 나란히 실행되고, 생성은 진행되는 동안 <strong>단계별 프리뷰 피드백</strong>을 보여주며, 명확히 하기 위한 <strong>질문은 전용 오른쪽 탭으로 이동</strong>해 캔버스를 가로채지 않으면서 당신에게 물어봅니다.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="거의 흰색에 가까운 편집 배경 위에, 실행 중인 진행률 막대 옆에 큐에 쌓인 코멘트 카드 더미가 녹색 프레임 안에 선택되어 있다" />
        <figcaption>실행이 아직 진행되는 동안 피드백을 큐에 쌓으세요; 생각하는 동안 아무것도 막히지 않습니다.</figcaption>
      </figure>

      <h2>BYOK와 핸드오프가 프로덕션 수준으로</h2>
      <p>흐름의 양 끝 — 자신의 키를 가져오는 것과 작업을 밖으로 내보내는 것 — 둘 다 이번 릴리스에서 성숙해졌습니다.</p>
      <p><strong>BYOK는 입력하는 동안 검증합니다.</strong> API 키는 필드 단위 검증을 거치고, 초안은 저장하기 전에 확인되며, 모델 목록은 여러 제공자에 걸쳐 실시간으로 가져온 모델을 우선합니다. 그래서 잘못된 키나 오래된 모델 이름은 실행 도중 조용히 묻히는 대신 폼에서 큰 소리로 실패합니다.</p>
      <p><strong>핸드오프가 진짜 인프라가 됩니다.</strong> <strong>샌드박스 런타임 기반</strong>, <strong>실행 범위로 묶인 MCP 도구 번들</strong>, <strong>프로젝트 내보내기 매니페스트</strong>, 그리고 <strong>격리된 프리뷰 URL</strong>은 "디자인-투-에디터"와 "디자인-투-Code-Agent"를 복사-붙여넣기 잡일에서 명확하게 정의된 핸드오프로 바꿉니다. 그리고 무언가 정말로 깨졌을 때, <strong>진단</strong>이 원인을 짚어줍니다: Langfuse 상관관계를 활용한 실행 실패 분류, 프롬프트 스택 진단, 그리고 안전한 재시도 정책. 그래서 실패는 어깨를 으쓱하는 대신 당신에게 해결책을 가리킵니다.</p>

      <h2>0.10.0에 또 무엇이 담겼나</h2>
      <p>이번 릴리스는 폭이 넓습니다. 앞으로 끌어올릴 만한 조각들:</p>
      <ul>
        <li><strong>다시 시작하는 게 아니라 포크하기.</strong> 대화를 갈래로 나눠 대안적인 방향을 시도하면서, 마음에 들었던 갈래를 덮어쓰는 대신 두 흐름을 모두 살려두세요.</li>
        <li><strong>컨텍스트를 함께 나르는 코멘트.</strong> 드래그 앤 드롭 첨부는 스크린샷이나 참조가 메모와 함께, 변경이 일어나는 바로 그 자리에 따라온다는 뜻입니다.</li>
        <li><strong>실제로 둘러볼 수 있는 참조 보드.</strong> 입력은 채팅 위로 스크롤되어 사라지는 대신 브라우저 스타일 보드에 자리합니다.</li>
        <li><strong>복구 가능한 실패.</strong> 복구 옵션이 딸린 식별 가능한 실패 원인이 막다른 길을 대체합니다; 실패한 실행은 다음에 무엇을 해야 하는지 알려줍니다.</li>
        <li><strong>모든 데스크톱을 위한 빌드.</strong> macOS (Apple Silicon 및 Intel x64)와 Windows (인스톨러 및 포터블), <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a>와 releases.open-design.ai를 통해 제공됩니다.</li>
      </ul>
      <p>전체 목록은 405개의 PR에 이릅니다. 나머지는 <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub의 릴리스 노트</a>에 담겨 있습니다.</p>

      <h2>오늘 그것으로 무엇을 할까</h2>
      <table>
        <thead>
          <tr><th>당신이…</th><th>여기서 시작하세요</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design이 처음이라면</td><td>데스크톱 앱을 다운로드하고, 한 번 로그인한 뒤, 브리프를 처음부터 끝까지 실행해 보세요 — 콘셉트, 다듬기, 핸드오프가 모두 하나의 창 안에 머뭅니다</td></tr>
          <tr><td>이미 Open Design을 쓰고 있다면</td><td>패키지된 자동 업데이트가 당신을 0.10.0으로 데려가게 하세요; 컴포저, 코멘트 큐, 전체 높이 캔버스가 기본으로 켜져 있습니다</td></tr>
          <tr><td>작업을 코드로 출시한다면</td><td>실행 범위로 묶인 MCP 번들, 내보내기 매니페스트, 격리된 프리뷰 URL을 사용해 디자인을 곧장 에디터나 Code Agent로 넘기세요</td></tr>
          <tr><td>자신의 키를 가져온다면</td><td>설정을 다시 확인하세요 — 필드 단위 검증과 실시간 모델 목록 덕분에 잘못된 키나 오래된 모델 이름이 즉시 드러납니다</td></tr>
        </tbody>
      </table>

      <h2>다음에 할 일</h2>
      <p>여기서 초안, 저기서 실행, 또 어딘가에서 내보내기를 오가며 튕겨 다녔다면, 이번 릴리스가 그것들을 한곳에 모아줍니다. 데스크톱 앱을 다운로드하고 어차피 실행하려던 브리프를 실행해 보세요 — 이번에는 콘셉트부터 핸드오프까지 창을 벗어나지 않습니다.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design 다운로드</a>.</p>
      <p>9일 동안 405개의 PR, 같은 방향으로 끌어당긴 68명에게서. 올인원 워크스페이스가 존재하는 이유는, 그토록 많은 기여자가 예전에는 당신을 다른 탭으로 보내던 작은 틈들을 메웠기 때문입니다. 운동은 한 팀의 노트북에서 출시되지 않습니다; 나타나서 만든 사람들에게서 출시됩니다. 우리는 당신을 보고 있습니다. 🫡</p>

      <h2>함께 읽기</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design for everyone</a> — 이번 릴리스가 그 위에 쌓아 올린 설치-그리고-생성 릴리스</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: everything is a plugin</a> — 그 모든 것의 밑바탕이 된 엔진 재구축</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a> — "제품이 아니라 레이어"라는 베팅 뒤의 더 긴 선언문</li>
      </ul>
  de:
    title: "Open Design 0.10.0: der All-in-One-Design-Workspace"
    summary: "Tag open-design-v0.10.0 — 405 PRs von 68 Mitwirkenden in neun Tagen. Codename „der All-in-One Agentic Design-Workspace\". Dieses Release fasst den gesamten Ablauf — Konzept, Verfeinerung und Übergabe — in einem einzigen Fenster zusammen, sodass die Arbeit nicht mehr über ein Dutzend Tabs verstreut ist."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, veröffentlicht am 11. Juni 2026. <strong>405 PRs von 68 Mitwirkenden in neun Tagen.</strong> Codename „der All-in-One Agentic Design-Workspace" — dies ist das <strong>Ein-Fenster-Release</strong>. Die letzten drei Releases haben den Einstieg günstig gemacht; dieses macht das <em>Dranbleiben</em> günstig. Vom ersten Konzept bis zur finalen Übergabe ist die Arbeit nicht mehr über ein Dutzend Tabs und drei Apps verstreut.</p>
      <p>Wenn du die ausführliche Version möchtest, findest du sie in den <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">Release Notes auf GitHub</a>. Dieser Beitrag ist die Kurzfassung: was sich unter der Haube geändert hat, was du heute damit machen kannst und wo du anfängst.</p>

      <h2>Warum das Tab-Springen die eigentliche Steuer war</h2>
      <p>Ein Design-Tool beweist seinen Wert in der langweiligen Mitte — nicht beim ersten Prompt, sondern bei der vierzigsten Bearbeitung. Genau in dieser Mitte ist Open Design früher ausgelaufen. Man entwarf an einem Ort, ließ es an einem anderen laufen, hinterließ irgendwo sonst einen Kommentar und exportierte es dann von Hand in das, was als Nächstes kam. Jeder Sprung war ein kleiner Kontextwechsel, und kleine Kontextwechsel summieren sich zu einem Tag, der sich geschäftig anfühlt und nichts ausliefert.</p>
      <p>0.10.0 schließt den Kreis. Der gesamte Bogen — <strong>Konzept → Verfeinerung → Übergabe</strong> — findet in einem Fenster statt, mit einem Zustand, der dir folgt, anstatt an jeder Grenze zurückgesetzt zu werden.</p>

      <h2>Ein Fenster für den gesamten Ablauf</h2>
      <p>Der Workspace ist jetzt eine einzige Oberfläche, kein Satz von Räumen, zwischen denen du hin- und herläufst.</p>
      <p>Ein <strong>Lexical-gestützter Composer</strong> ersetzt das schlichte Textfeld: atomare Mention-Pills, die du als ganze Tokens einfügen, auswählen und löschen kannst, mit einem Cursor, der endlich mit dem übereinstimmt, was du eingegeben hast. Interaktive <strong>Terminals</strong> lassen dich Sitzungen direkt vor Ort verwalten. Ein browserartiges <strong>Referenz-Board</strong> hält deine Eingaben griffbereit, Kommentare nehmen <strong>Drag-and-Drop-Anhänge</strong> auf, und du kannst eine <strong>Unterhaltung forken</strong>, um einen Zweig zu erkunden, ohne den Faden zu verlieren, von dem du gekommen bist. Die Canvas läuft in <strong>voller Höhe</strong>, und ein <strong>angepinnter Inspector für manuelle Bearbeitungen</strong> hält präzise Anpassungen nur einen Klick entfernt, statt sie in einem Panel zu vergraben.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Eine Composer-Eingabezeile mit mehreren abgerundeten Mention-Pill-Tokens, von denen eine Pill innerhalb eines grünen Auswahlrahmens ausgewählt ist, auf einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Der Composer behandelt Mentions als atomare Pills — füge sie als ganze Tokens ein, wähle sie aus und lösche sie.</figcaption>
      </figure>

      <h2>Standardmäßig asynchron</h2>
      <p>Feedback muss nicht mehr warten, bis es an der Reihe ist. Eine <strong>Kommentar-Warteschlange</strong> lässt dich Vorschau-Kommentare stapeln, während ein Lauf noch im Gange ist — du reagierst weiter auf die Arbeit, und Open Design greift die Notizen auf, sobald der aktuelle Durchlauf abgeschlossen ist. <strong>Parallele Sitzungen</strong> laufen nebeneinander, die Generierung zeigt <strong>gestaffeltes Vorschau-Feedback</strong> während des Vorgangs, und klärende <strong>Fragen wandern in einen eigenen Tab auf der rechten Seite</strong>, sodass sie dich auffordern, ohne die Canvas zu kapern.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Ein Stapel von in der Warteschlange befindlichen Kommentarkarten neben einem laufenden Fortschrittsbalken, ausgewählt in einem grünen Rahmen, auf einem nahezu weißen redaktionellen Hintergrund" />
        <figcaption>Reihe Feedback ein, während ein Lauf noch läuft; nichts blockiert, während du nachdenkst.</figcaption>
      </figure>

      <h2>BYOK und Übergabe werden produktionsreif</h2>
      <p>Die Ränder des Ablaufs — den eigenen Key einbringen und die Arbeit herausbekommen — sind in diesem Release beide erwachsen geworden.</p>
      <p><strong>BYOK validiert während der Eingabe.</strong> API-Keys erhalten eine Validierung auf Feldebene, Entwürfe werden vor dem Speichern geprüft, und die Modellliste bevorzugt live abgerufene Modelle über alle Anbieter hinweg, sodass ein falscher Key oder ein veralteter Modellname schon im Formular laut scheitert, statt still mitten im Lauf.</p>
      <p><strong>Die Übergabe wird zu echter Infrastruktur.</strong> Eine <strong>Sandbox-Runtime-Grundlage</strong>, <strong>lauf-spezifische MCP-Tool-Bundles</strong>, <strong>Projekt-Export-Manifeste</strong> und <strong>abgekapselte Vorschau-URLs</strong> verwandeln „Design-zu-Editor" und „Design-zu-Code-Agent" von einer Copy-and-paste-Pflichtübung in eine klar definierte Übergabe. Und wenn doch etwas kaputtgeht, benennen <strong>Diagnosen</strong> die Ursache: Klassifizierung von Lauffehlern mit Langfuse-Korrelation, Prompt-Stack-Diagnose und Safe-Retry-Richtlinien, sodass ein Fehler dich auf die Lösung verweist statt auf ein Achselzucken.</p>

      <h2>Was sonst noch in 0.10.0 landet</h2>
      <p>Das Release ist breit. Die Teile, die es wert sind, hervorgehoben zu werden:</p>
      <ul>
        <li><strong>Forken statt neu starten.</strong> Verzweige eine Unterhaltung, um eine alternative Richtung auszuprobieren, und halte beide Stränge am Leben, statt den zu überschreiben, der dir gefallen hat.</li>
        <li><strong>Kommentare, die Kontext mitnehmen.</strong> Drag-and-Drop-Anhänge bedeuten, dass ein Screenshot oder eine Referenz mit der Notiz mitreist, genau dort, wo die Änderung passiert.</li>
        <li><strong>Ein Referenz-Board, das du wirklich durchstöbern kannst.</strong> Eingaben sitzen in einem browserartigen Board, statt im Chat nach oben wegzuscrollen.</li>
        <li><strong>Wiederherstellbare Fehler.</strong> Identifizierbare Fehlerursachen mit Wiederherstellungsoptionen ersetzen Sackgassen; ein fehlgeschlagener Lauf sagt dir, was als Nächstes zu tun ist.</li>
        <li><strong>Builds für jeden Desktop.</strong> macOS (Apple Silicon und Intel x64) und Windows (Installer und portabel) über <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> und releases.open-design.ai.</li>
      </ul>
      <p>Die vollständige Liste umfasst 405 PRs. Die <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">Release Notes auf GitHub</a> enthalten den Rest.</p>

      <h2>Was du heute damit machen kannst</h2>
      <table>
        <thead>
          <tr><th>Wenn du…</th><th>Hier anfangen</th></tr>
        </thead>
        <tbody>
          <tr><td>Neu bei Open Design bist</td><td>Lade die Desktop-App herunter, melde dich einmal an und führe einen kurzen Brief von Anfang bis Ende durch — Konzept, Verfeinerung und Übergabe bleiben alle in dem einen Fenster</td></tr>
          <tr><td>Open Design bereits nutzt</td><td>Lass das integrierte Auto-Update dich auf 0.10.0 bringen; der Composer, die Kommentar-Warteschlange und die Canvas in voller Höhe sind standardmäßig aktiviert</td></tr>
          <tr><td>Arbeit in Code überführst</td><td>Nutze die lauf-spezifischen MCP-Bundles, Export-Manifeste und abgekapselten Vorschau-URLs, um ein Design direkt an deinen Editor oder Code Agent zu übergeben</td></tr>
          <tr><td>Deinen eigenen Key einbringst</td><td>Prüfe die Einstellungen erneut — Validierung auf Feldebene und Live-Modelllisten bedeuten, dass ein fehlerhafter Key oder ein veralteter Modellname sofort auffällt</td></tr>
        </tbody>
      </table>

      <h2>Was als Nächstes zu tun ist</h2>
      <p>Wenn du bisher zwischen einem Entwurf hier, einem Lauf dort und einem Export irgendwo anders hin- und hergesprungen bist, ist dies das Release, das sie an einen Ort bringt. Lade die Desktop-App herunter und führe den Brief aus, den du ohnehin ausführen wolltest — diesmal verlässt der Weg vom Konzept zur Übergabe nie das Fenster.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design herunterladen</a>.</p>
      <p>405 PRs in 9 Tagen, von 68 Menschen, die in dieselbe Richtung ziehen. Der All-in-One-Workspace existiert, weil so viele Mitwirkende die kleinen Lücken geschlossen haben, die dich früher in einen anderen Tab geschickt haben. Eine Bewegung wird nicht von den Laptops eines einzelnen Teams ausgeliefert; sie wird von den Menschen ausgeliefert, die aufgetaucht sind und gebaut haben. Wir sehen euch. 🫡</p>

      <h2>Weiterführende Lektüre</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: Design für alle</a> — das Installieren-und-Erstellen-Release, auf dem dieses aufbaut</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: alles ist ein Plugin</a> — der Umbau der Engine, der allem zugrunde liegt</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Warum wir Open Design als Skill-Ebene gebaut haben, nicht als Produkt</a> — das längere Manifest hinter der Wette „Ebene, nicht Produkt"</li>
      </ul>
  fr:
    title: "Open Design 0.10.0 : l'espace de travail de conception tout-en-un"
    summary: "Tag open-design-v0.10.0 — 405 PR de 68 contributeurs en neuf jours. Nom de code « l'espace de travail de conception Agentic tout-en-un ». Cette version réunit l'ensemble du flux — concept, affinement et transfert — dans une seule fenêtre, pour que le travail cesse de se disperser sur une douzaine d'onglets."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, publié le 11 juin 2026. <strong>405 PR de 68 contributeurs en neuf jours.</strong> Nom de code « l'espace de travail de conception Agentic tout-en-un » — voici la <strong>version une seule fenêtre</strong>. Les trois dernières versions ont rendu le démarrage peu coûteux ; celle-ci rend le fait de <em>rester</em> peu coûteux. Du premier concept au transfert final, le travail ne se disperse plus sur une douzaine d'onglets et trois applications.</p>
      <p>Si vous voulez la version longue, les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">notes de version sur GitHub</a> la contiennent. Cet article est la version courte : ce qui a changé sous le capot, ce que vous pouvez en faire dès aujourd'hui, et par où commencer.</p>

      <h2>Pourquoi sauter d'onglet en onglet était une taxe</h2>
      <p>Un outil de conception prouve sa valeur dans le milieu ennuyeux — non pas à la première invite, mais à la quarantième modification. C'est dans ce milieu qu'Open Design avait des fuites. Vous rédigiez à un endroit, exécutiez à un autre, laissiez un commentaire ailleurs, puis exportiez à la main vers ce qui venait ensuite. Chaque saut était un petit changement de contexte, et les petits changements de contexte s'accumulent jusqu'à former une journée qui semble bien remplie mais ne livre rien.</p>
      <p>0.10.0 boucle la boucle. Tout l'arc — <strong>concept → affinement → transfert</strong> — se déroule dans une seule fenêtre, avec un état qui vous suit au lieu de se réinitialiser à chaque frontière.</p>

      <h2>Une seule fenêtre pour tout le flux</h2>
      <p>L'espace de travail est désormais une surface unique, et non un ensemble de pièces que l'on traverse.</p>
      <p>Un <strong>composeur propulsé par Lexical</strong> remplace la simple zone de texte : des pastilles de mention atomiques que vous pouvez insérer, sélectionner et supprimer en tant que jetons entiers, avec un curseur qui s'aligne enfin sur ce que vous avez saisi. Des <strong>terminaux</strong> interactifs vous permettent de gérer les sessions sur place. Un <strong>tableau de références</strong> de style navigateur garde vos entrées à portée de main, les commentaires acceptent les <strong>pièces jointes par glisser-déposer</strong>, et vous pouvez <strong>bifurquer une conversation</strong> pour explorer une branche sans perdre le fil d'où vous veniez. Le canevas s'exécute en <strong>pleine hauteur</strong>, et un <strong>inspecteur d'édition manuelle épinglé</strong> garde les ajustements précis à un clic au lieu d'être enfouis dans un panneau.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Une ligne de saisie de composeur contenant plusieurs pastilles de mention arrondies, dont une est sélectionnée à l'intérieur d'un cadre de sélection vert, sur un fond éditorial presque blanc" />
        <figcaption>Le composeur traite les mentions comme des pastilles atomiques — insérez-les, sélectionnez-les et supprimez-les en tant que jetons entiers.</figcaption>
      </figure>

      <h2>Asynchrone par défaut</h2>
      <p>Le retour n'a plus besoin d'attendre son tour. Une <strong>file d'attente de commentaires</strong> vous permet d'empiler des commentaires d'aperçu pendant qu'une exécution est encore en cours — vous continuez à réagir au travail, et Open Design reprend les notes dès que la passe en cours se termine. Des <strong>sessions parallèles</strong> s'exécutent côte à côte, la génération affiche un <strong>retour d'aperçu par étapes</strong> au fur et à mesure, et les <strong>questions</strong> de clarification <strong>passent dans un onglet dédié sur le côté droit</strong> afin qu'elles vous sollicitent sans accaparer le canevas.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Une pile de cartes de commentaires en file d'attente à côté d'une barre de progression en cours, sélectionnée dans un cadre vert, sur un fond éditorial presque blanc" />
        <figcaption>Mettez le retour en file d'attente pendant qu'une exécution est encore en cours ; rien ne bloque pendant que vous réfléchissez.</figcaption>
      </figure>

      <h2>Le BYOK et le transfert passent au niveau production</h2>
      <p>Les extrémités du flux — apporter votre propre clé, et faire sortir le travail — ont toutes deux mûri dans cette version.</p>
      <p><strong>Le BYOK se valide à mesure que vous tapez.</strong> Les clés API bénéficient d'une validation au niveau du champ, les brouillons sont vérifiés avant l'enregistrement, et la liste des modèles privilégie les modèles récupérés en direct chez les différents fournisseurs, de sorte qu'une clé erronée ou un nom de modèle obsolète échoue bruyamment au niveau du formulaire au lieu de silencieusement en pleine exécution.</p>
      <p><strong>Le transfert devient une véritable infrastructure.</strong> Une <strong>fondation d'environnement d'exécution sandbox</strong>, des <strong>bundles d'outils MCP au périmètre d'une exécution</strong>, des <strong>manifestes d'export de projet</strong> et des <strong>URL d'aperçu confinées</strong> transforment le « design vers éditeur » et le « design vers Code Agent » d'une corvée de copier-coller en un transfert défini. Et lorsque quelque chose casse effectivement, des <strong>diagnostics</strong> nomment la cause : classification des échecs d'exécution avec corrélation Langfuse, diagnostics de la pile d'invites et politiques de réessai sûr, pour qu'un échec vous oriente vers la correction au lieu d'un haussement d'épaules.</p>

      <h2>Quoi d'autre arrive dans la 0.10.0</h2>
      <p>La version est vaste. Les éléments qui méritent d'être mis en avant :</p>
      <ul>
        <li><strong>Bifurquer, pas redémarrer.</strong> Faites une branche d'une conversation pour essayer une direction alternative et gardez les deux fils vivants au lieu d'écraser celui que vous aimiez.</li>
        <li><strong>Des commentaires qui portent le contexte.</strong> Les pièces jointes par glisser-déposer signifient qu'une capture d'écran ou une référence accompagne la note, là où le changement se produit.</li>
        <li><strong>Un tableau de références que vous pouvez réellement parcourir.</strong> Les entrées se trouvent dans un tableau de style navigateur au lieu de défiler vers le haut de la conversation.</li>
        <li><strong>Des échecs récupérables.</strong> Des causes d'échec identifiables avec des options de récupération remplacent les impasses ; une exécution échouée vous dit quoi faire ensuite.</li>
        <li><strong>Des builds pour chaque bureau.</strong> macOS (Apple Silicon et Intel x64) et Windows (programme d'installation et version portable) via les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> et releases.open-design.ai.</li>
      </ul>
      <p>La liste complète compte 405 PR. Les <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">notes de version sur GitHub</a> contiennent le reste.</p>

      <h2>Quoi en faire dès aujourd'hui</h2>
      <table>
        <thead>
          <tr><th>Si vous êtes…</th><th>Commencez ici</th></tr>
        </thead>
        <tbody>
          <tr><td>Nouveau sur Open Design</td><td>Téléchargez l'application de bureau, connectez-vous une fois, et exécutez un brief de bout en bout — concept, affinement et transfert restent tous dans la même fenêtre</td></tr>
          <tr><td>Déjà utilisateur d'Open Design</td><td>Laissez la mise à jour automatique intégrée vous amener à la 0.10.0 ; le composeur, la file d'attente de commentaires et le canevas pleine hauteur sont activés par défaut</td></tr>
          <tr><td>En train de livrer du travail vers du code</td><td>Utilisez les bundles MCP au périmètre d'une exécution, les manifestes d'export et les URL d'aperçu confinées pour transmettre un design directement à votre éditeur ou à votre Code Agent</td></tr>
          <tr><td>En train d'apporter votre propre clé</td><td>Revérifiez les Paramètres — la validation au niveau du champ et les listes de modèles en direct signifient qu'une mauvaise clé ou un nom de modèle obsolète se manifeste immédiatement</td></tr>
        </tbody>
      </table>

      <h2>Quoi faire ensuite</h2>
      <p>Si vous avez fait des allers-retours entre un brouillon ici, une exécution là et un export ailleurs, c'est la version qui les réunit en un seul endroit. Téléchargez l'application de bureau et exécutez le brief que vous alliez exécuter de toute façon — cette fois, du concept au transfert, rien ne quitte la fenêtre.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Téléchargez Open Design</a>.</p>
      <p>405 PR en 9 jours, de 68 personnes tirant dans la même direction. L'espace de travail tout-en-un existe parce que tant de contributeurs ont comblé les petites lacunes qui vous envoyaient autrefois vers un autre onglet. Un mouvement ne se livre pas depuis les ordinateurs portables d'une seule équipe ; il se livre depuis les personnes qui se sont présentées et ont construit. On vous voit. 🫡</p>

      <h2>Lectures associées</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0 : la conception pour tous</a> — la version installer-et-créer sur laquelle celle-ci s'appuie</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0 : tout est un plugin</a> — la refonte du moteur qui sous-tend le tout</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Pourquoi nous avons conçu Open Design comme une couche de compétences, et non comme un produit</a> — le manifeste plus long derrière le pari « une couche, pas un produit »</li>
      </ul>
  ru:
    title: "Open Design 0.10.0: единое рабочее пространство для дизайна"
    summary: "Тег open-design-v0.10.0 — 405 PR от 68 контрибьюторов за девять дней. Кодовое название «единое агентное рабочее пространство для дизайна». Этот релиз сворачивает весь процесс — замысел, доработку и передачу — в одно окно, чтобы работа больше не была разбросана по десятку вкладок."
    bodyHtml: |
      <p>Тег <code>open-design-v0.10.0</code>, выпущен 11 июня 2026 года. <strong>405 PR от 68 контрибьюторов за девять дней.</strong> Кодовое название «единое агентное рабочее пространство для дизайна» — это <strong>релиз одного окна</strong>. Три предыдущих релиза сделали дешёвым начало работы; этот делает дешёвым <em>её продолжение</em>. От первого замысла до финальной передачи работа больше не разбросана по десятку вкладок и трём приложениям.</p>
      <p>Если вам нужна развёрнутая версия, она есть в <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">примечаниях к релизу на GitHub</a>. Этот пост — краткая версия: что изменилось под капотом, что вы можете сделать с этим уже сегодня и с чего начать.</p>

      <h2>Почему прыжки по вкладкам были налогом</h2>
      <p>Инструмент для дизайна оправдывает себя в скучной середине — не на первой подсказке, а на сороковой правке. Именно в этой середине Open Design раньше давал течь. Вы набрасывали в одном месте, запускали в другом, оставляли комментарий где-то ещё, а затем вручную экспортировали в то, что шло дальше. Каждый прыжок был небольшим переключением контекста, а небольшие переключения контекста складываются в день, который кажется насыщенным, но ничего не выпускает.</p>
      <p>0.10.0 замыкает цикл. Вся дуга — <strong>замысел → доработка → передача</strong> — происходит в одном окне, а состояние следует за вами, а не сбрасывается на каждой границе.</p>

      <h2>Одно окно для всего процесса</h2>
      <p>Рабочее пространство теперь представляет собой единую поверхность, а не набор комнат, между которыми вы ходите.</p>
      <p><strong>Композер на базе Lexical</strong> заменяет обычное текстовое поле: атомарные пилюли-упоминания, которые можно вставлять, выделять и удалять как целые токены, с кареткой, которая наконец совпадает с тем, что вы напечатали. Интерактивные <strong>терминалы</strong> позволяют управлять сессиями на месте. <strong>Доска референсов</strong> в стиле браузера держит ваши исходные материалы под рукой, комментарии принимают <strong>вложения через перетаскивание</strong>, и вы можете <strong>ответвить разговор</strong>, чтобы исследовать ветку, не теряя нить, с которой пришли. Холст работает <strong>на всю высоту</strong>, а <strong>закреплённый инспектор ручного редактирования</strong> держит точные правки в одном клике, а не погребёнными в панели.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Строка ввода композера с несколькими скруглёнными пилюлями-упоминаниями, одна из которых выделена внутри зелёной рамки выделения, на почти белом редакторском фоне" />
        <figcaption>Композер обращается с упоминаниями как с атомарными пилюлями — вставляйте, выделяйте и удаляйте их как целые токены.</figcaption>
      </figure>

      <h2>Асинхронность по умолчанию</h2>
      <p>Обратной связи больше не нужно ждать своей очереди. <strong>Очередь комментариев</strong> позволяет складывать комментарии к превью, пока запуск ещё выполняется — вы продолжаете реагировать на работу, а Open Design подхватывает заметки, как только текущий проход завершится. <strong>Параллельные сессии</strong> работают бок о бок, генерация показывает <strong>поэтапную обратную связь по превью</strong> по ходу дела, а уточняющие <strong>вопросы переезжают в отдельную вкладку справа</strong>, так что они побуждают вас к ответу, не захватывая холст.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Стопка карточек комментариев в очереди рядом с работающим индикатором прогресса, выделенная зелёной рамкой, на почти белом редакторском фоне" />
        <figcaption>Ставьте обратную связь в очередь, пока запуск ещё идёт; ничто не блокирует, пока вы думаете.</figcaption>
      </figure>

      <h2>BYOK и передача достигают промышленного уровня</h2>
      <p>Края процесса — подключение собственного ключа и вывод работы наружу — оба возмужали в этом релизе.</p>
      <p><strong>BYOK проверяется по мере ввода.</strong> API-ключи получают валидацию на уровне полей, черновики проверяются перед сохранением, а список моделей предпочитает живо подгружаемые модели у разных провайдеров, так что неверный ключ или устаревшее имя модели падает громко прямо на форме, а не молча посреди запуска.</p>
      <p><strong>Передача становится настоящей инфраструктурой.</strong> <strong>Основа песочничной среды выполнения</strong>, <strong>комплекты инструментов MCP в рамках запуска</strong>, <strong>манифесты экспорта проектов</strong> и <strong>изолированные URL превью</strong> превращают «дизайн-в-редактор» и «дизайн-в-Code-Agent» из рутины копипаста в чётко определённую передачу. А когда что-то всё же ломается, <strong>диагностика</strong> называет причину: классификация сбоев запуска с корреляцией Langfuse, диагностика стека промптов и политики безопасных повторов, так что сбой указывает вам на исправление, а не пожимает плечами.</p>

      <h2>Что ещё вошло в 0.10.0</h2>
      <p>Релиз обширный. Вот части, которые стоит вынести вперёд:</p>
      <ul>
        <li><strong>Ответвление, а не перезапуск.</strong> Ответвите разговор, чтобы попробовать альтернативное направление и сохранить обе нити живыми, вместо того чтобы перезаписать ту, что вам понравилась.</li>
        <li><strong>Комментарии, несущие контекст.</strong> Вложения через перетаскивание означают, что скриншот или референс едут вместе с заметкой, прямо там, где происходит изменение.</li>
        <li><strong>Доска референсов, которую действительно можно просматривать.</strong> Исходные материалы лежат на доске в стиле браузера, а не уплывают вверх по чату.</li>
        <li><strong>Восстановимые сбои.</strong> Идентифицируемые причины сбоев с вариантами восстановления заменяют тупики; неудавшийся запуск подсказывает, что делать дальше.</li>
        <li><strong>Сборки для любого десктопа.</strong> macOS (Apple Silicon и Intel x64) и Windows (установщик и портативная версия) через <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> и releases.open-design.ai.</li>
      </ul>
      <p>Полный список насчитывает 405 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">Примечания к релизу на GitHub</a> содержат остальное.</p>

      <h2>Что делать с этим уже сегодня</h2>
      <table>
        <thead>
          <tr><th>Если вы…</th><th>Начните здесь</th></tr>
        </thead>
        <tbody>
          <tr><td>Впервые в Open Design</td><td>Скачайте десктопное приложение, войдите один раз и проведите бриф от начала до конца — замысел, доработка и передача остаются в одном окне</td></tr>
          <tr><td>Уже используете Open Design</td><td>Позвольте встроенному автообновлению поднять вас до 0.10.0; композер, очередь комментариев и холст на всю высоту включены по умолчанию</td></tr>
          <tr><td>Передаёте работу в код</td><td>Используйте комплекты MCP в рамках запуска, манифесты экспорта и изолированные URL превью, чтобы передать дизайн прямо в ваш редактор или Code Agent</td></tr>
          <tr><td>Подключаете собственный ключ</td><td>Перепроверьте Настройки — валидация на уровне полей и живые списки моделей означают, что плохой ключ или устаревшее имя модели всплывут немедленно</td></tr>
        </tbody>
      </table>

      <h2>Что делать дальше</h2>
      <p>Если вы метались между черновиком здесь, запуском там и экспортом где-то ещё, это тот релиз, который собирает их в одном месте. Скачайте десктопное приложение и проведите тот бриф, который вы и так собирались провести — на этот раз путь от замысла до передачи никогда не покидает окно.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Скачать Open Design</a>.</p>
      <p>405 PR за 9 дней от 68 человек, тянущих в одном направлении. Единое рабочее пространство существует потому, что столько контрибьюторов закрыли те маленькие зазоры, которые раньше отправляли вас на другую вкладку. Движение не выпускается с ноутбуков одной команды; оно выпускается людьми, которые пришли и строили. Мы видим вас. 🫡</p>

      <h2>Похожие материалы</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: дизайн для всех</a> — релиз «установи-и-создавай», на котором строится этот</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: всё — это плагин</a> — перестройка движка, лежащая в основе всего</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Почему мы построили Open Design как слой навыков, а не продукт</a> — более длинный манифест за ставкой «слой, а не продукт»</li>
      </ul>
  es:
    title: "Open Design 0.10.0: el espacio de trabajo de diseño todo en uno"
    summary: "Tag open-design-v0.10.0: 405 PRs de 68 colaboradores en nueve días. Nombre en clave «el espacio de trabajo de diseño Agentic todo en uno». Esta versión condensa todo el flujo —concepto, refinamiento y entrega— en una sola ventana, para que el trabajo deje de repartirse entre una docena de pestañas."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, publicado el 11 de junio de 2026. <strong>405 PRs de 68 colaboradores en nueve días.</strong> Nombre en clave «el espacio de trabajo de diseño Agentic todo en uno»: esta es la <strong>versión de una sola ventana</strong>. Las tres versiones anteriores abarataron el empezar; esta abarata el <em>permanecer</em>. Desde el primer concepto hasta la entrega final, el trabajo ya no se dispersa entre una docena de pestañas y tres aplicaciones.</p>
      <p>Si quieres la versión larga, las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">notas de la versión en GitHub</a> la tienen. Esta publicación es la versión corta: qué cambió por dentro, qué puedes hacer con ello hoy y por dónde empezar.</p>

      <h2>Por qué saltar entre pestañas era el impuesto</h2>
      <p>Una herramienta de diseño se gana su lugar en la aburrida parte intermedia: no en la primera indicación, sino en la edición número cuarenta. Esa parte intermedia es donde Open Design solía tener fugas. Esbozabas en un lugar, ejecutabas en otro, dejabas un comentario en algún otro sitio y luego exportabas a mano hacia lo que viniera después. Cada salto era un pequeño cambio de contexto, y los pequeños cambios de contexto se acumulan hasta formar un día que se siente ajetreado pero que no entrega nada.</p>
      <p>0.10.0 cierra el ciclo. Todo el recorrido —<strong>concepto → refinamiento → entrega</strong>— ocurre en una sola ventana, con un estado que te sigue en vez de reiniciarse en cada frontera.</p>

      <h2>Una sola ventana para todo el flujo</h2>
      <p>El espacio de trabajo es ahora una única superficie, no un conjunto de salas entre las que caminas.</p>
      <p>Un <strong>compositor impulsado por Lexical</strong> reemplaza la caja de texto plano: pastillas de mención atómicas que puedes insertar, seleccionar y eliminar como tokens completos, con un cursor que por fin se alinea con lo que escribiste. Las <strong>terminales</strong> interactivas te permiten gestionar sesiones en el sitio. Un <strong>tablero de referencias</strong> estilo navegador mantiene tus entradas a mano, los comentarios aceptan <strong>adjuntos por arrastrar y soltar</strong>, y puedes <strong>bifurcar una conversación</strong> para explorar una rama sin perder el hilo del que partiste. El lienzo se ejecuta a <strong>altura completa</strong>, y un <strong>inspector de edición manual fijado</strong> mantiene los ajustes precisos a un clic en vez de enterrados en un panel.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Una línea de entrada del compositor que contiene varios tokens de pastilla de mención redondeados, con una pastilla seleccionada dentro de un marco de selección verde, sobre un fondo editorial casi blanco" />
        <figcaption>El compositor trata las menciones como pastillas atómicas: insértalas, selecciónalas y elimínalas como tokens completos.</figcaption>
      </figure>

      <h2>Asíncrono por defecto</h2>
      <p>Los comentarios ya no tienen que esperar su turno. Una <strong>cola de comentarios</strong> te permite apilar comentarios de vista previa mientras una ejecución sigue en curso: tú sigues reaccionando al trabajo y Open Design recoge las notas en cuanto termina la pasada actual. Las <strong>sesiones paralelas</strong> se ejecutan en paralelo, la generación muestra <strong>comentarios de vista previa por etapas</strong> a medida que avanza, y las <strong>preguntas</strong> aclaratorias <strong>se trasladan a una pestaña dedicada en el lado derecho</strong> para que te interpelen sin secuestrar el lienzo.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Una pila de tarjetas de comentarios en cola junto a una barra de progreso en ejecución, seleccionada en un marco verde, sobre un fondo editorial casi blanco" />
        <figcaption>Pon en cola los comentarios mientras una ejecución sigue en marcha; nada se bloquea mientras piensas.</figcaption>
      </figure>

      <h2>BYOK y la entrega alcanzan grado de producción</h2>
      <p>Los extremos del flujo —traer tu propia clave y sacar el trabajo— maduraron ambos en esta versión.</p>
      <p><strong>BYOK valida a medida que escribes.</strong> Las claves de API obtienen validación a nivel de campo, los borradores se comprueban antes de guardar, y la lista de modelos prefiere modelos obtenidos en vivo de varios proveedores, de modo que una clave incorrecta o un nombre de modelo obsoleto falla de forma ruidosa en el formulario en vez de en silencio a mitad de ejecución.</p>
      <p><strong>La entrega se convierte en infraestructura real.</strong> Una <strong>base de runtime de sandbox</strong>, <strong>paquetes de herramientas MCP delimitados por ejecución</strong>, <strong>manifiestos de exportación de proyecto</strong> y <strong>URLs de vista previa contenidas</strong> convierten el «diseño a editor» y el «diseño a Code Agent» de una tarea de copiar y pegar en una entrega bien definida. Y cuando algo sí se rompe, los <strong>diagnósticos</strong> nombran la causa: clasificación de fallos de ejecución con correlación de Langfuse, diagnósticos de pila de indicaciones y políticas de reintento seguro, de modo que un fallo te señala la solución en vez de un encogimiento de hombros.</p>

      <h2>Qué más llega en 0.10.0</h2>
      <p>La versión es amplia. Las piezas que vale la pena destacar:</p>
      <ul>
        <li><strong>Bifurcar, no reiniciar.</strong> Ramifica una conversación para probar una dirección alternativa y mantén ambos hilos vivos en vez de sobrescribir el que te gustaba.</li>
        <li><strong>Comentarios que llevan contexto.</strong> Los adjuntos por arrastrar y soltar significan que una captura de pantalla o una referencia viaja junto con la nota, justo donde ocurre el cambio.</li>
        <li><strong>Un tablero de referencias que realmente puedes navegar.</strong> Las entradas se ubican en un tablero estilo navegador en vez de desaparecer al desplazarse hacia arriba en el chat.</li>
        <li><strong>Fallos recuperables.</strong> Causas de fallo identificables con opciones de recuperación reemplazan los callejones sin salida; una ejecución fallida te dice qué hacer a continuación.</li>
        <li><strong>Compilaciones para cada escritorio.</strong> macOS (Apple Silicon e Intel x64) y Windows (instalador y portable) a través de <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> y releases.open-design.ai.</li>
      </ul>
      <p>La lista completa llega a 405 PRs. Las <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">notas de la versión en GitHub</a> tienen el resto.</p>

      <h2>Qué hacer con ello hoy</h2>
      <table>
        <thead>
          <tr><th>Si eres…</th><th>Empieza aquí</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuevo en Open Design</td><td>Descarga la aplicación de escritorio, inicia sesión una vez y ejecuta un encargo de principio a fin: concepto, refinamiento y entrega se quedan todos en una sola ventana</td></tr>
          <tr><td>Ya usas Open Design</td><td>Deja que la actualización automática empaquetada te lleve a 0.10.0; el compositor, la cola de comentarios y el lienzo a altura completa están activados por defecto</td></tr>
          <tr><td>Llevando trabajo a código</td><td>Usa los paquetes MCP delimitados por ejecución, los manifiestos de exportación y las URLs de vista previa contenidas para entregar un diseño directamente a tu editor o Code Agent</td></tr>
          <tr><td>Trayendo tu propia clave</td><td>Vuelve a revisar Ajustes: la validación a nivel de campo y las listas de modelos en vivo hacen que una clave incorrecta o un nombre de modelo obsoleto salga a la luz de inmediato</td></tr>
        </tbody>
      </table>

      <h2>Qué hacer a continuación</h2>
      <p>Si has estado rebotando entre un borrador aquí, una ejecución allá y una exportación en algún otro lugar, esta es la versión que los pone en un solo sitio. Descarga la aplicación de escritorio y ejecuta el encargo que ibas a ejecutar de todos modos: esta vez, del concepto a la entrega nunca sale de la ventana.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Descarga Open Design</a>.</p>
      <p>405 PRs en 9 días, de 68 personas tirando en la misma dirección. El espacio de trabajo todo en uno existe porque muchísimos colaboradores cerraron los pequeños huecos que antes te enviaban a otra pestaña. Un movimiento no se entrega desde los portátiles de un solo equipo; se entrega desde las personas que se presentaron y construyeron. Os vemos. 🫡</p>

      <h2>Lecturas relacionadas</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: diseño para todos</a> — la versión de instalar y crear sobre la que esta se construye</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: todo es un plugin</a> — la reconstrucción del motor que está debajo de todo</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por qué construimos Open Design como una capa de habilidades, no como un producto</a> — el manifiesto más extenso detrás de la apuesta «capa, no producto»</li>
      </ul>
  pt-br:
    title: "Open Design 0.10.0: o espaço de trabalho de design tudo-em-um"
    summary: "Tag open-design-v0.10.0 — 405 PRs de 68 contribuidores em nove dias. Codinome \"o espaço de trabalho de design Agentic tudo-em-um\". Esta versão reúne todo o fluxo — conceito, refinamento e entrega — em uma única janela, para que o trabalho deixe de viver espalhado por uma dúzia de abas."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, lançada em 11 de junho de 2026. <strong>405 PRs de 68 contribuidores em nove dias.</strong> Codinome "o espaço de trabalho de design Agentic tudo-em-um" — esta é a <strong>versão de janela única</strong>. As três últimas versões tornaram barato começar; esta torna barato <em>permanecer</em>. Do primeiro conceito à entrega final, o trabalho não se espalha mais por uma dúzia de abas e três aplicativos.</p>
      <p>Se você quer a versão longa, as <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">notas de versão no GitHub</a> têm tudo. Este post é a versão curta: o que mudou por baixo dos panos, o que você pode fazer com isso hoje e por onde começar.</p>

      <h2>Por que pular entre abas era o imposto</h2>
      <p>Uma ferramenta de design prova seu valor no meio tedioso — não no primeiro prompt, mas na quadragésima edição. É nesse meio que o Open Design costumava vazar. Você rascunhava em um lugar, executava em outro, deixava um comentário em outro lugar e depois exportava manualmente para o que viesse a seguir. Cada salto era uma pequena troca de contexto, e pequenas trocas de contexto se acumulam em um dia que parece atarefado e não entrega nada.</p>
      <p>O 0.10.0 fecha o ciclo. Todo o arco — <strong>conceito → refinamento → entrega</strong> — acontece em uma única janela, com um estado que segue você em vez de reiniciar a cada fronteira.</p>

      <h2>Uma janela para todo o fluxo</h2>
      <p>O espaço de trabalho agora é uma única superfície, não um conjunto de salas pelas quais você caminha.</p>
      <p>Um <strong>compositor com tecnologia Lexical</strong> substitui a caixa de texto simples: pílulas de menção atômicas que você pode inserir, selecionar e excluir como tokens inteiros, com um cursor que finalmente se alinha com o que você digitou. <strong>Terminais</strong> interativos permitem gerenciar sessões no local. Um <strong>quadro de referências</strong> no estilo navegador mantém suas entradas à mão, os comentários aceitam <strong>anexos por arrastar e soltar</strong>, e você pode <strong>bifurcar uma conversa</strong> para explorar uma ramificação sem perder o fio de onde veio. O canvas roda em <strong>altura total</strong>, e um <strong>inspetor de edição manual fixado</strong> mantém ajustes precisos a um clique de distância, em vez de enterrados em um painel.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Uma linha de entrada do compositor segurando vários tokens de pílulas de menção arredondadas, com uma pílula selecionada dentro de um quadro de seleção verde, sobre um fundo editorial quase branco" />
        <figcaption>O compositor trata as menções como pílulas atômicas — insira, selecione e exclua-as como tokens inteiros.</figcaption>
      </figure>

      <h2>Assíncrono por padrão</h2>
      <p>O feedback não precisa mais esperar a sua vez. Uma <strong>fila de comentários</strong> permite empilhar comentários de pré-visualização enquanto uma execução ainda está em andamento — você continua reagindo ao trabalho, e o Open Design recolhe as notas assim que a passagem atual termina. <strong>Sessões paralelas</strong> rodam lado a lado, a geração exibe <strong>feedback de pré-visualização em etapas</strong> conforme avança, e as <strong>perguntas</strong> de esclarecimento <strong>vão para uma aba dedicada do lado direito</strong>, para que solicitem sua atenção sem sequestrar o canvas.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Uma pilha de cartões de comentário enfileirados ao lado de uma barra de progresso em execução, selecionada em um quadro verde, sobre um fundo editorial quase branco" />
        <figcaption>Enfileire feedback enquanto uma execução ainda está em andamento; nada bloqueia enquanto você pensa.</figcaption>
      </figure>

      <h2>BYOK e entrega ganham nível de produção</h2>
      <p>As bordas do fluxo — trazer sua própria chave para dentro e tirar o trabalho para fora — ambas amadureceram nesta versão.</p>
      <p><strong>BYOK valida enquanto você digita.</strong> As chaves de API recebem validação em nível de campo, os rascunhos são verificados antes de você salvar, e a lista de modelos prefere modelos buscados ao vivo entre os provedores, de modo que uma chave errada ou um nome de modelo desatualizado falha de forma visível no formulário, em vez de silenciosamente no meio da execução.</p>
      <p><strong>A entrega vira infraestrutura de verdade.</strong> Uma <strong>base de runtime em sandbox</strong>, <strong>pacotes de ferramentas MCP no escopo da execução</strong>, <strong>manifestos de exportação de projeto</strong> e <strong>URLs de pré-visualização contidas</strong> transformam "design-para-editor" e "design-para-Code-Agent" de uma tarefa de copiar e colar em uma entrega bem definida. E quando algo realmente quebra, os <strong>diagnósticos</strong> apontam a causa: classificação de falhas de execução com correlação Langfuse, diagnósticos da pilha de prompts e políticas de repetição segura, de modo que uma falha aponte para a correção, em vez de um dar de ombros.</p>

      <h2>O que mais chega no 0.10.0</h2>
      <p>A versão é ampla. As partes que vale a pena destacar:</p>
      <ul>
        <li><strong>Bifurcar, não recomeçar.</strong> Ramifique uma conversa para tentar uma direção alternativa e mantenha ambos os fios vivos, em vez de sobrescrever aquele de que você gostou.</li>
        <li><strong>Comentários que carregam contexto.</strong> Anexos por arrastar e soltar significam que uma captura de tela ou uma referência acompanha a nota, exatamente onde a mudança acontece.</li>
        <li><strong>Um quadro de referências que você realmente consegue navegar.</strong> As entradas ficam em um quadro no estilo navegador, em vez de rolarem para fora chat acima.</li>
        <li><strong>Falhas recuperáveis.</strong> Causas de falha identificáveis com opções de recuperação substituem os becos sem saída; uma execução com falha diz a você o que fazer a seguir.</li>
        <li><strong>Builds para todo desktop.</strong> macOS (Apple Silicon e Intel x64) e Windows (instalador e portátil) via <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> e releases.open-design.ai.</li>
      </ul>
      <p>A lista completa chega a 405 PRs. As <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">notas de versão no GitHub</a> trazem o resto.</p>

      <h2>O que fazer com isso hoje</h2>
      <table>
        <thead>
          <tr><th>Se você é…</th><th>Comece por aqui</th></tr>
        </thead>
        <tbody>
          <tr><td>Novo no Open Design</td><td>Baixe o aplicativo desktop, faça login uma vez e execute um brief de ponta a ponta — conceito, refinamento e entrega ficam todos na mesma janela</td></tr>
          <tr><td>Já usa o Open Design</td><td>Deixe a atualização automática do pacote levar você ao 0.10.0; o compositor, a fila de comentários e o canvas de altura total vêm ativados por padrão</td></tr>
          <tr><td>Entregando trabalho para o código</td><td>Use os pacotes MCP no escopo da execução, os manifestos de exportação e as URLs de pré-visualização contidas para entregar um design diretamente ao seu editor ou Code Agent</td></tr>
          <tr><td>Trazendo sua própria chave</td><td>Reverifique as Configurações — a validação em nível de campo e as listas de modelos ao vivo fazem com que uma chave ruim ou um nome de modelo desatualizado apareça imediatamente</td></tr>
        </tbody>
      </table>

      <h2>O que fazer a seguir</h2>
      <p>Se você vinha pulando entre um rascunho aqui, uma execução ali e uma exportação em outro lugar, esta é a versão que reúne tudo em um só lugar. Baixe o aplicativo desktop e execute o brief que você ia executar de qualquer forma — desta vez, do conceito à entrega, nada deixa a janela.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Baixe o Open Design</a>.</p>
      <p>405 PRs em 9 dias, de 68 pessoas puxando na mesma direção. O espaço de trabalho tudo-em-um existe porque tantos contribuidores fecharam as pequenas lacunas que antes mandavam você para outra aba. Um movimento não é lançado a partir dos laptops de uma única equipe; ele é lançado pelas pessoas que apareceram e construíram. Nós vemos você. 🫡</p>

      <h2>Leitura relacionada</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design para todos</a> — a versão de instalar-e-criar sobre a qual esta se constrói</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: tudo é um plugin</a> — a reconstrução do motor por baixo de tudo</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Por que construímos o Open Design como uma camada de skills, e não como um produto</a> — o manifesto mais longo por trás da aposta "camada, não produto"</li>
      </ul>
  it:
    title: "Open Design 0.10.0: lo spazio di lavoro per il design tutto-in-uno"
    summary: "Tag open-design-v0.10.0 — 405 PR da 68 contributori in nove giorni. Nome in codice \"lo spazio di lavoro per il design Agentic tutto-in-uno\". Questa release comprime l'intero flusso — concept, perfezionamento e handoff — in un'unica finestra, così il lavoro smette di vivere sparso tra una dozzina di schede."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, rilasciato l'11 giugno 2026. <strong>405 PR da 68 contributori in nove giorni.</strong> Nome in codice "lo spazio di lavoro per il design Agentic tutto-in-uno" — questa è la <strong>release a finestra unica</strong>. Le ultime tre release hanno reso economico iniziare; questa rende economico <em>restare</em>. Dal primo concept all'handoff finale, il lavoro non si disperde più tra una dozzina di schede e tre applicazioni.</p>
      <p>Se vuoi la versione lunga, le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">note di rilascio su GitHub</a> ce l'hanno. Questo post è la versione breve: cosa è cambiato sotto il cofano, cosa puoi farci oggi e da dove iniziare.</p>

      <h2>Perché saltare tra le schede era la tassa</h2>
      <p>Uno strumento di design si guadagna il pane nella parte centrale noiosa — non al primo prompt, ma alla quarantesima modifica. È in quella parte centrale che Open Design perdeva colpi. Abbozzavi in un posto, eseguivi in un altro, lasciavi un commento da qualche altra parte e poi esportavi a mano in qualunque cosa venisse dopo. Ogni salto era un piccolo cambio di contesto, e i piccoli cambi di contesto si sommano in una giornata che sembra impegnata ma non produce nulla.</p>
      <p>0.10.0 chiude il cerchio. L'intero arco — <strong>concept → perfezionamento → handoff</strong> — avviene in un'unica finestra, con uno stato che ti segue invece di azzerarsi a ogni confine.</p>

      <h2>Una finestra per l'intero flusso</h2>
      <p>Lo spazio di lavoro è ora un'unica superficie, non un insieme di stanze tra cui spostarsi.</p>
      <p>Un <strong>composer basato su Lexical</strong> sostituisce la semplice casella di testo: pillole di menzione atomiche che puoi inserire, selezionare ed eliminare come token interi, con un cursore che finalmente si allinea con ciò che hai digitato. I <strong>terminali</strong> interattivi ti permettono di gestire le sessioni sul posto. Una <strong>bacheca di riferimento</strong> in stile browser tiene i tuoi input a portata di mano, i commenti accettano <strong>allegati con drag-and-drop</strong>, e puoi <strong>biforcare una conversazione</strong> per esplorare un ramo senza perdere il filo da cui sei partito. La canvas funziona a <strong>tutta altezza</strong>, e un <strong>inspector di modifica manuale fissato</strong> tiene le regolazioni precise a un clic di distanza invece che sepolte in un pannello.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Una riga di input del composer che contiene diversi token a pillola di menzione arrotondati, con una pillola selezionata dentro una cornice di selezione verde, su uno sfondo editoriale quasi bianco" />
        <figcaption>Il composer tratta le menzioni come pillole atomiche — inseriscile, selezionale ed eliminale come token interi.</figcaption>
      </figure>

      <h2>Asincrono per impostazione predefinita</h2>
      <p>Il feedback non deve più aspettare il suo turno. Una <strong>coda di commenti</strong> ti consente di accumulare commenti di anteprima mentre un'esecuzione è ancora in corso — continui a reagire al lavoro, e Open Design raccoglie le note non appena il passaggio corrente termina. Le <strong>sessioni parallele</strong> girano fianco a fianco, la generazione mostra <strong>feedback di anteprima a fasi</strong> man mano che procede, e le <strong>domande</strong> di chiarimento <strong>si spostano in una scheda dedicata sul lato destro</strong> così da sollecitarti senza dirottare la canvas.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Una pila di schede di commento in coda accanto a una barra di avanzamento in esecuzione, selezionata in una cornice verde, su uno sfondo editoriale quasi bianco" />
        <figcaption>Metti il feedback in coda mentre un'esecuzione è ancora in corso; nulla si blocca mentre rifletti.</figcaption>
      </figure>

      <h2>BYOK e handoff diventano di livello produzione</h2>
      <p>I margini del flusso — portare la tua chiave dentro, e tirare fuori il lavoro — sono entrambi cresciuti in questa release.</p>
      <p><strong>BYOK convalida mentre digiti.</strong> Le chiavi API ricevono una convalida a livello di campo, le bozze vengono verificate prima del salvataggio, e l'elenco dei modelli predilige modelli recuperati in tempo reale tra i vari provider, così una chiave sbagliata o un nome di modello obsoleto fallisce in modo evidente nel form invece che silenziosamente a metà esecuzione.</p>
      <p><strong>L'handoff diventa una vera infrastruttura.</strong> Una <strong>base di runtime sandbox</strong>, <strong>bundle di strumenti MCP a livello di esecuzione</strong>, <strong>manifest di esportazione del progetto</strong> e <strong>URL di anteprima contenuti</strong> trasformano "design-to-editor" e "design-to-Code-Agent" da una scocciatura di copia-e-incolla in un handoff definito. E quando qualcosa si rompe davvero, la <strong>diagnostica</strong> nomina la causa: classificazione dei fallimenti di esecuzione con correlazione Langfuse, diagnostica dello stack di prompt e policy di retry sicuro, così un fallimento ti indica la soluzione invece di una scrollata di spalle.</p>

      <h2>Cos'altro arriva in 0.10.0</h2>
      <p>La release è ampia. I pezzi che vale la pena mettere in primo piano:</p>
      <ul>
        <li><strong>Biforcare, non ricominciare.</strong> Ramifica una conversazione per provare una direzione alternativa e tieni entrambi i fili vivi invece di sovrascrivere quello che ti piaceva.</li>
        <li><strong>Commenti che portano contesto.</strong> Gli allegati con drag-and-drop fanno sì che uno screenshot o un riferimento viaggi insieme alla nota, proprio dove avviene la modifica.</li>
        <li><strong>Una bacheca di riferimento che puoi davvero sfogliare.</strong> Gli input stanno in una bacheca in stile browser invece di scorrere via in alto nella chat.</li>
        <li><strong>Fallimenti recuperabili.</strong> Cause di fallimento identificabili con opzioni di recupero sostituiscono i vicoli ciechi; un'esecuzione fallita ti dice cosa fare dopo.</li>
        <li><strong>Build per ogni desktop.</strong> macOS (Apple Silicon e Intel x64) e Windows (installer e portable) tramite <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> e releases.open-design.ai.</li>
      </ul>
      <p>L'elenco completo arriva a 405 PR. Le <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">note di rilascio su GitHub</a> contengono il resto.</p>

      <h2>Cosa farci oggi</h2>
      <table>
        <thead>
          <tr><th>Se sei…</th><th>Inizia qui</th></tr>
        </thead>
        <tbody>
          <tr><td>Nuovo su Open Design</td><td>Scarica l'app desktop, accedi una volta ed esegui un brief dall'inizio alla fine — concept, perfezionamento e handoff restano tutti nell'unica finestra</td></tr>
          <tr><td>Già in esecuzione con Open Design</td><td>Lascia che l'auto-aggiornamento incluso ti porti a 0.10.0; il composer, la coda di commenti e la canvas a tutta altezza sono attivi per impostazione predefinita</td></tr>
          <tr><td>In procinto di portare il lavoro nel codice</td><td>Usa i bundle MCP a livello di esecuzione, i manifest di esportazione e gli URL di anteprima contenuti per passare un design direttamente al tuo editor o Code Agent</td></tr>
          <tr><td>In procinto di portare la tua chiave</td><td>Ricontrolla le Impostazioni — la convalida a livello di campo e gli elenchi di modelli in tempo reale fanno emergere immediatamente una chiave sbagliata o un nome di modello obsoleto</td></tr>
        </tbody>
      </table>

      <h2>Cosa fare dopo</h2>
      <p>Se sei rimbalzato tra una bozza qui, un'esecuzione là e un'esportazione da qualche altra parte, questa è la release che le mette tutte in un unico posto. Scarica l'app desktop ed esegui il brief che avresti comunque eseguito — questa volta, dal concept all'handoff non si esce mai dalla finestra.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Scarica Open Design</a>.</p>
      <p>405 PR in 9 giorni, da 68 persone che tirano nella stessa direzione. Lo spazio di lavoro tutto-in-uno esiste perché così tanti contributori hanno chiuso i piccoli divari che prima ti mandavano in un'altra scheda. Un movimento non viene rilasciato dai laptop di un solo team; viene rilasciato dalle persone che si sono presentate e hanno costruito. Vi vediamo. 🫡</p>

      <h2>Letture correlate</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design for everyone</a> — la release "installa-e-crea" su cui questa si basa</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: everything is a plugin</a> — la ricostruzione del motore sotto a tutto questo</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a> — il manifesto più lungo dietro la scommessa "layer, non prodotto"</li>
      </ul>
  vi:
    title: "Open Design 0.10.0: không gian làm việc thiết kế tất-cả-trong-một"
    summary: "Tag open-design-v0.10.0 — 405 PR từ 68 người đóng góp trong chín ngày. Tên mã \"không gian làm việc thiết kế Agentic tất-cả-trong-một.\" Bản phát hành này gom toàn bộ quy trình — ý tưởng, tinh chỉnh và bàn giao — vào một cửa sổ duy nhất, để công việc không còn trải dài qua hàng chục tab."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, phát hành ngày 11 tháng 6 năm 2026. <strong>405 PR từ 68 người đóng góp trong chín ngày.</strong> Tên mã "không gian làm việc thiết kế Agentic tất-cả-trong-một" — đây là <strong>bản phát hành một-cửa-sổ</strong>. Ba bản phát hành trước làm cho việc bắt đầu trở nên ít tốn kém; bản này làm cho việc <em>ở lại</em> ít tốn kém. Từ ý tưởng đầu tiên đến bàn giao cuối cùng, công việc không còn tản mát qua hàng chục tab và ba ứng dụng.</p>
      <p>Nếu bạn muốn bản đầy đủ, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">ghi chú phát hành trên GitHub</a> có sẵn. Bài viết này là bản ngắn gọn: những gì đã thay đổi bên trong, bạn có thể làm gì với nó ngay hôm nay, và bắt đầu từ đâu.</p>

      <h2>Vì sao nhảy qua lại giữa các tab là một khoản thuế</h2>
      <p>Một công cụ thiết kế chứng minh giá trị của nó ở phần giữa nhàm chán — không phải ở lời nhắc đầu tiên, mà ở lần chỉnh sửa thứ bốn mươi. Phần giữa đó chính là nơi Open Design từng bị rò rỉ. Bạn phác thảo ở một nơi, chạy ở nơi khác, để lại bình luận ở một chỗ nào đó nữa, rồi xuất thủ công sang bất cứ thứ gì đến tiếp theo. Mỗi lần nhảy là một lần chuyển ngữ cảnh nhỏ, và những lần chuyển ngữ cảnh nhỏ cộng dồn thành một ngày trông bận rộn nhưng chẳng ra được gì.</p>
      <p>0.10.0 khép kín vòng lặp. Toàn bộ cung đường — <strong>ý tưởng → tinh chỉnh → bàn giao</strong> — diễn ra trong một cửa sổ, với trạng thái đi theo bạn thay vì đặt lại ở mỗi ranh giới.</p>

      <h2>Một cửa sổ cho toàn bộ quy trình</h2>
      <p>Không gian làm việc giờ đây là một bề mặt duy nhất, không phải một tập hợp những căn phòng bạn phải đi qua lại.</p>
      <p>Một <strong>trình soạn thảo dựa trên Lexical</strong> thay thế ô văn bản thuần: các viên mention nguyên tử mà bạn có thể chèn, chọn và xóa như những token trọn vẹn, với một con trỏ cuối cùng cũng khớp với những gì bạn đã gõ. Các <strong>terminal</strong> tương tác cho phép bạn quản lý phiên ngay tại chỗ. Một <strong>bảng tham chiếu</strong> kiểu trình duyệt giữ các đầu vào của bạn trong tầm tay, bình luận nhận <strong>tệp đính kèm kéo-và-thả</strong>, và bạn có thể <strong>tách nhánh một cuộc trò chuyện</strong> để khám phá một nhánh mà không đánh mất mạch bạn vừa rời đi. Canvas chạy <strong>toàn chiều cao</strong>, và một <strong>trình kiểm tra chỉnh sửa thủ công được ghim</strong> giữ những tinh chỉnh chính xác chỉ cách một cú nhấp thay vì bị chôn trong một panel.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Một dòng nhập của trình soạn thảo chứa vài viên token mention bo tròn, với một viên được chọn bên trong khung chọn màu xanh lá, trên nền biên tập gần trắng" />
        <figcaption>Trình soạn thảo xử lý các mention như những viên nguyên tử — chèn, chọn và xóa chúng như những token trọn vẹn.</figcaption>
      </figure>

      <h2>Bất đồng bộ theo mặc định</h2>
      <p>Phản hồi không còn phải chờ đến lượt. Một <strong>hàng đợi bình luận</strong> cho phép bạn xếp chồng các bình luận xem trước trong khi một lần chạy vẫn đang diễn ra — bạn cứ tiếp tục phản ứng với công việc, và Open Design tiếp nhận các ghi chú ngay khi lượt hiện tại hoàn tất. <strong>Các phiên song song</strong> chạy cạnh nhau, quá trình tạo hiển thị <strong>phản hồi xem trước theo từng giai đoạn</strong> khi nó tiến hành, và các <strong>câu hỏi làm rõ chuyển sang một tab riêng bên phải</strong> để chúng nhắc bạn mà không chiếm dụng canvas.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Một chồng thẻ bình luận đang xếp hàng bên cạnh một thanh tiến trình đang chạy, được chọn trong khung màu xanh lá, trên nền biên tập gần trắng" />
        <figcaption>Xếp hàng phản hồi trong khi một lần chạy vẫn đang tiếp diễn; không gì bị chặn trong lúc bạn suy nghĩ.</figcaption>
      </figure>

      <h2>BYOK và bàn giao đạt cấp độ sản xuất</h2>
      <p>Các rìa của quy trình — đưa khóa của riêng bạn vào, và đưa công việc ra ngoài — cả hai đều trưởng thành trong bản phát hành này.</p>
      <p><strong>BYOK xác thực ngay khi bạn gõ.</strong> Các khóa API nhận xác thực ở cấp trường, các bản nháp được kiểm tra trước khi bạn lưu, và danh sách model ưu tiên các model được tải trực tiếp trên khắp các nhà cung cấp, để một khóa sai hay một tên model lỗi thời sẽ báo lỗi rõ ràng tại biểu mẫu thay vì âm thầm giữa chừng khi chạy.</p>
      <p><strong>Bàn giao trở thành hạ tầng thực thụ.</strong> Một <strong>nền tảng runtime sandbox</strong>, các <strong>bộ công cụ MCP theo phạm vi lần chạy</strong>, các <strong>manifest xuất dự án</strong>, và các <strong>URL xem trước được cô lập</strong> biến "design-to-editor" và "design-to-Code-Agent" từ một việc copy-paste vặt vãnh thành một quy trình bàn giao được định nghĩa rõ. Và khi có gì đó hỏng, <strong>chẩn đoán</strong> chỉ rõ nguyên nhân: phân loại lỗi lần chạy với tương quan Langfuse, chẩn đoán ngăn xếp prompt, và các chính sách thử lại an toàn, để một thất bại chỉ cho bạn hướng khắc phục thay vì một cái nhún vai.</p>

      <h2>Còn gì khác trong 0.10.0</h2>
      <p>Bản phát hành này rất rộng. Những mảnh đáng nêu lên trước:</p>
      <ul>
        <li><strong>Tách nhánh, không khởi động lại.</strong> Phân nhánh một cuộc trò chuyện để thử một hướng khác và giữ cả hai mạch còn sống thay vì ghi đè lên cái bạn đã thích.</li>
        <li><strong>Bình luận mang theo ngữ cảnh.</strong> Tệp đính kèm kéo-và-thả nghĩa là một ảnh chụp màn hình hay một tham chiếu đi cùng ghi chú, ngay tại nơi diễn ra thay đổi.</li>
        <li><strong>Một bảng tham chiếu bạn thực sự có thể duyệt.</strong> Các đầu vào nằm trong một bảng kiểu trình duyệt thay vì trôi mất khi cuộn lên trong cuộc trò chuyện.</li>
        <li><strong>Thất bại có thể khôi phục.</strong> Nguyên nhân thất bại nhận diện được kèm các tùy chọn khôi phục thay thế cho ngõ cụt; một lần chạy thất bại cho bạn biết phải làm gì tiếp theo.</li>
        <li><strong>Bản dựng cho mọi desktop.</strong> macOS (Apple Silicon và Intel x64) và Windows (trình cài đặt và bản di động) qua <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> và releases.open-design.ai.</li>
      </ul>
      <p>Danh sách đầy đủ lên tới 405 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">Ghi chú phát hành trên GitHub</a> chứa phần còn lại.</p>

      <h2>Làm gì với nó ngay hôm nay</h2>
      <table>
        <thead>
          <tr><th>Nếu bạn…</th><th>Bắt đầu tại đây</th></tr>
        </thead>
        <tbody>
          <tr><td>Mới đến với Open Design</td><td>Tải ứng dụng desktop, đăng nhập một lần, và chạy một bản tóm tắt từ đầu đến cuối — ý tưởng, tinh chỉnh và bàn giao đều ở lại trong một cửa sổ</td></tr>
          <tr><td>Đã đang dùng Open Design</td><td>Để bản tự cập nhật đóng gói đưa bạn lên 0.10.0; trình soạn thảo, hàng đợi bình luận và canvas toàn chiều cao đều bật theo mặc định</td></tr>
          <tr><td>Đưa công việc vào code</td><td>Dùng các bộ MCP theo phạm vi lần chạy, các manifest xuất, và các URL xem trước được cô lập để bàn giao một thiết kế thẳng tới trình soạn thảo hay Code Agent của bạn</td></tr>
          <tr><td>Đưa khóa của riêng bạn vào</td><td>Kiểm tra lại Settings — xác thực ở cấp trường và danh sách model trực tiếp nghĩa là một khóa hỏng hay tên model lỗi thời lộ ra ngay lập tức</td></tr>
        </tbody>
      </table>

      <h2>Làm gì tiếp theo</h2>
      <p>Nếu bạn đã phải nhảy qua lại giữa một bản nháp ở đây, một lần chạy ở kia, và một lần xuất ở đâu đó khác, thì đây là bản phát hành đặt tất cả vào một chỗ. Tải ứng dụng desktop và chạy bản tóm tắt mà dù sao bạn cũng đã định chạy — lần này, từ ý tưởng đến bàn giao không bao giờ rời khỏi cửa sổ.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Tải Open Design</a>.</p>
      <p>405 PR trong 9 ngày, từ 68 con người cùng kéo về một hướng. Không gian làm việc tất-cả-trong-một tồn tại được là vì rất nhiều người đóng góp đã khép lại những khoảng trống nhỏ vốn từng đẩy bạn sang một tab khác. Một phong trào không được tạo ra từ laptop của một đội ngũ; nó được tạo ra từ những con người đã có mặt và cùng xây dựng. Chúng tôi thấy bạn. 🫡</p>

      <h2>Đọc thêm</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design for everyone</a> — bản phát hành cài-đặt-và-sáng-tạo mà bản này được xây dựng dựa trên</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: everything is a plugin</a> — bản tái dựng động cơ nằm bên dưới tất cả</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a> — bản tuyên ngôn dài hơn đằng sau lựa chọn "lớp, không phải sản phẩm"</li>
      </ul>
  pl:
    title: "Open Design 0.10.0: kompleksowa przestrzeń robocza do projektowania"
    summary: "Tag open-design-v0.10.0 — 405 PR-ów od 68 współtwórców w dziewięć dni. Kryptonim „kompleksowa, agentowa przestrzeń robocza do projektowania”. To wydanie zwija cały przepływ — koncepcję, dopracowanie i przekazanie — w jedno okno, dzięki czemu praca przestaje rozpraszać się po kilkunastu kartach."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, wydany 11 czerwca 2026. <strong>405 PR-ów od 68 współtwórców w dziewięć dni.</strong> Kryptonim „kompleksowa, agentowa przestrzeń robocza do projektowania” — to <strong>wydanie jednego okna</strong>. Trzy ostatnie wydania sprawiły, że rozpoczęcie pracy stało się tanie; to sprawia, że tanie staje się jej <em>kontynuowanie</em>. Od pierwszej koncepcji po finalne przekazanie praca nie rozprasza się już po kilkunastu kartach i trzech aplikacjach.</p>
      <p>Jeśli chcesz dłuższej wersji, znajdziesz ją w <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">informacjach o wydaniu na GitHub</a>. Ten wpis to wersja skrócona: co zmieniło się pod maską, co możesz z tym zrobić już dziś i od czego zacząć.</p>

      <h2>Dlaczego przeskakiwanie między kartami było podatkiem</h2>
      <p>Narzędzie do projektowania zarabia na siebie w nudnym środku — nie przy pierwszym poleceniu, ale przy czterdziestej edycji. To właśnie w tym środku Open Design dawniej przeciekał. Szkicowałeś w jednym miejscu, uruchamiałeś w innym, zostawiałeś komentarz gdzieś jeszcze, a potem ręcznie eksportowałeś do tego, co przychodziło później. Każdy przeskok był drobnym przełączeniem kontekstu, a drobne przełączenia kontekstu kumulują się w dzień, który wydaje się zapracowany, a niczego nie dostarcza.</p>
      <p>0.10.0 zamyka pętlę. Cały łuk — <strong>koncepcja → dopracowanie → przekazanie</strong> — dzieje się w jednym oknie, ze stanem, który podąża za tobą, zamiast resetować się na każdej granicy.</p>

      <h2>Jedno okno dla całego przepływu</h2>
      <p>Przestrzeń robocza jest teraz pojedynczą powierzchnią, a nie zestawem pokoi, między którymi się przechodzi.</p>
      <p><strong>Edytor oparty na Lexical</strong> zastępuje zwykłe pole tekstowe: atomowe pigułki wzmianek, które możesz wstawiać, zaznaczać i usuwać jako całe tokeny, z kursorem, który wreszcie pokrywa się z tym, co wpisałeś. Interaktywne <strong>terminale</strong> pozwalają zarządzać sesjami w miejscu. <strong>Tablica referencyjna</strong> w stylu przeglądarki trzyma twoje dane wejściowe pod ręką, komentarze przyjmują <strong>załączniki metodą przeciągnij i upuść</strong>, a rozmowę możesz <strong>rozgałęzić</strong>, by zbadać odnogę bez utraty wątku, z którego przyszedłeś. Kanwa działa na <strong>pełną wysokość</strong>, a <strong>przypięty inspektor edycji ręcznej</strong> trzyma precyzyjne poprawki o jedno kliknięcie, zamiast zakopanych w panelu.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Linia wejściowa edytora trzymająca kilka zaokrąglonych tokenów-pigułek wzmianek, z jedną pigułką zaznaczoną wewnątrz zielonej ramki zaznaczenia, na niemal białym, edytorskim tle" />
        <figcaption>Edytor traktuje wzmianki jak atomowe pigułki — wstawiaj, zaznaczaj i usuwaj je jako całe tokeny.</figcaption>
      </figure>

      <h2>Asynchroniczność domyślnie</h2>
      <p>Informacja zwrotna nie musi już czekać na swoją kolej. <strong>Kolejka komentarzy</strong> pozwala układać komentarze do podglądu, gdy przebieg jest jeszcze w toku — wciąż reagujesz na pracę, a Open Design podejmuje uwagi, gdy tylko bieżący przebieg się zakończy. <strong>Równoległe sesje</strong> działają obok siebie, generowanie pokazuje <strong>etapową informację zwrotną w podglądzie</strong> na bieżąco, a doprecyzowujące <strong>pytania przenoszą się do dedykowanej karty po prawej stronie</strong>, dzięki czemu zachęcają cię do odpowiedzi bez przejmowania kanwy.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Stos kart komentarzy w kolejce obok działającego paska postępu, zaznaczony zieloną ramką, na niemal białym, edytorskim tle" />
        <figcaption>Ustawiaj informację zwrotną w kolejce, gdy przebieg wciąż trwa; nic nie blokuje, podczas gdy myślisz.</figcaption>
      </figure>

      <h2>BYOK i przekazanie osiągają poziom produkcyjny</h2>
      <p>Brzegi przepływu — wprowadzanie własnego klucza i wyprowadzanie pracy na zewnątrz — oba dojrzały w tym wydaniu.</p>
      <p><strong>BYOK waliduje się w trakcie pisania.</strong> Klucze API otrzymują walidację na poziomie pól, wersje robocze są sprawdzane przed zapisem, a lista modeli preferuje modele pobierane na żywo u różnych dostawców, więc błędny klucz lub nieaktualna nazwa modelu zawodzi głośno przy formularzu, zamiast po cichu w trakcie przebiegu.</p>
      <p><strong>Przekazanie staje się prawdziwą infrastrukturą.</strong> <strong>Fundament środowiska uruchomieniowego typu sandbox</strong>, <strong>pakiety narzędzi MCP w zakresie przebiegu</strong>, <strong>manifesty eksportu projektu</strong> oraz <strong>izolowane adresy URL podglądu</strong> zamieniają „projekt do edytora” i „projekt do Code Agent” z mozolnego kopiuj-wklej w zdefiniowane przekazanie. A gdy coś się jednak zepsuje, <strong>diagnostyka</strong> nazywa przyczynę: klasyfikacja niepowodzeń przebiegu z korelacją Langfuse, diagnostyka stosu promptów i polityki bezpiecznych ponowień, więc niepowodzenie wskazuje ci poprawkę, a nie wzruszenie ramion.</p>

      <h2>Co jeszcze trafia do 0.10.0</h2>
      <p>To wydanie jest szerokie. Elementy warte wysunięcia na pierwszy plan:</p>
      <ul>
        <li><strong>Rozgałęzianie, nie zaczynanie od nowa.</strong> Rozgałęź rozmowę, by wypróbować alternatywny kierunek i utrzymać przy życiu oba wątki, zamiast nadpisywać ten, który ci się podobał.</li>
        <li><strong>Komentarze, które niosą kontekst.</strong> Załączniki metodą przeciągnij i upuść sprawiają, że zrzut ekranu lub referencja jadą razem z notatką, dokładnie tam, gdzie zachodzi zmiana.</li>
        <li><strong>Tablica referencyjna, którą faktycznie da się przeglądać.</strong> Dane wejściowe siedzą na tablicy w stylu przeglądarki, zamiast odjeżdżać w górę czatu.</li>
        <li><strong>Odzyskiwalne niepowodzenia.</strong> Identyfikowalne przyczyny niepowodzeń z opcjami odzyskiwania zastępują ślepe zaułki; nieudany przebieg mówi ci, co zrobić dalej.</li>
        <li><strong>Wersje na każdy pulpit.</strong> macOS (Apple Silicon i Intel x64) oraz Windows (instalator i wersja przenośna) poprzez <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> i releases.open-design.ai.</li>
      </ul>
      <p>Pełna lista sięga 405 PR-ów. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">Informacje o wydaniu na GitHub</a> niosą resztę.</p>

      <h2>Co z tym zrobić już dziś</h2>
      <table>
        <thead>
          <tr><th>Jeśli jesteś…</th><th>Zacznij tutaj</th></tr>
        </thead>
        <tbody>
          <tr><td>Nowy w Open Design</td><td>Pobierz aplikację desktopową, zaloguj się raz i przeprowadź krótki brief od początku do końca — koncepcja, dopracowanie i przekazanie pozostają w jednym oknie</td></tr>
          <tr><td>Już korzystasz z Open Design</td><td>Pozwól wbudowanej automatycznej aktualizacji doprowadzić cię do 0.10.0; edytor, kolejka komentarzy i kanwa na pełną wysokość są włączone domyślnie</td></tr>
          <tr><td>Przekazujesz pracę do kodu</td><td>Użyj pakietów MCP w zakresie przebiegu, manifestów eksportu i izolowanych adresów URL podglądu, by przekazać projekt prosto do edytora lub Code Agent</td></tr>
          <tr><td>Wprowadzasz własny klucz</td><td>Sprawdź ponownie Ustawienia — walidacja na poziomie pól i listy modeli na żywo sprawiają, że błędny klucz lub nieaktualna nazwa modelu wychodzą na jaw natychmiast</td></tr>
        </tbody>
      </table>

      <h2>Co zrobić dalej</h2>
      <p>Jeśli odbijałeś się między szkicem tu, przebiegiem tam i eksportem gdzie indziej, to jest wydanie, które umieszcza je w jednym miejscu. Pobierz aplikację desktopową i przeprowadź ten brief, który i tak miałeś przeprowadzić — tym razem droga od koncepcji do przekazania nigdy nie opuszcza okna.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Pobierz Open Design</a>.</p>
      <p>405 PR-ów w 9 dni, od 68 osób ciągnących w tym samym kierunku. Kompleksowa przestrzeń robocza istnieje, bo tylu współtwórców zamknęło drobne luki, które dawniej wysyłały cię do innej karty. Ruch nie wychodzi z laptopów jednego zespołu; wychodzi od ludzi, którzy się pojawili i zbudowali. Widzimy was. 🫡</p>

      <h2>Powiązane lektury</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design dla każdego</a> — wydanie „zainstaluj i twórz”, na którym to się opiera</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: wszystko jest wtyczką</a> — przebudowa silnika leżąca pod tym wszystkim</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Dlaczego zbudowaliśmy Open Design jako warstwę umiejętności, a nie produkt</a> — dłuższy manifest stojący za zakładem „warstwa, nie produkt”</li>
      </ul>
  id:
    title: "Open Design 0.10.0: ruang kerja desain serba-satu"
    summary: "Tag open-design-v0.10.0 — 405 PR dari 68 kontributor dalam sembilan hari. Nama kode \"ruang kerja desain Agentic serba-satu.\" Rilis ini meleburkan seluruh alur kerja — konsep, penyempurnaan, dan serah terima — ke dalam satu jendela, sehingga pekerjaan tidak lagi tersebar di belasan tab."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, dirilis 11 Juni 2026. <strong>405 PR dari 68 kontributor dalam sembilan hari.</strong> Nama kode "ruang kerja desain Agentic serba-satu" — inilah <strong>rilis satu jendela</strong>. Tiga rilis terakhir membuat memulai jadi murah; yang ini membuat <em>bertahan</em> jadi murah. Dari konsep pertama sampai serah terima akhir, pekerjaan tidak lagi tercerai-berai di belasan tab dan tiga aplikasi.</p>
      <p>Kalau ingin versi panjangnya, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">catatan rilis di GitHub</a> sudah menyediakannya. Tulisan ini adalah versi singkatnya: apa yang berubah di balik layar, apa yang bisa Anda lakukan dengannya hari ini, dan dari mana memulai.</p>

      <h2>Mengapa berpindah-pindah tab itu mahal</h2>
      <p>Sebuah alat desain membuktikan nilainya di bagian tengah yang membosankan — bukan pada prompt pertama, melainkan pada suntingan keempat puluh. Bagian tengah itulah tempat Open Design dulu bocor. Anda membuat draf di satu tempat, menjalankannya di tempat lain, meninggalkan komentar di tempat lain lagi, lalu mengekspor secara manual ke apa pun langkah berikutnya. Setiap lompatan adalah pergantian konteks kecil, dan pergantian konteks kecil menumpuk menjadi hari yang terasa sibuk tetapi tidak menghasilkan apa-apa.</p>
      <p>0.10.0 menutup lingkaran itu. Seluruh rentang — <strong>konsep → penyempurnaan → serah terima</strong> — terjadi dalam satu jendela, dengan kondisi (state) yang mengikuti Anda alih-alih mengatur ulang di setiap batas.</p>

      <h2>Satu jendela untuk seluruh alur</h2>
      <p>Ruang kerja kini menjadi satu permukaan tunggal, bukan sekumpulan ruangan yang harus Anda lalui.</p>
      <p>Sebuah <strong>composer bertenaga Lexical</strong> menggantikan kotak teks biasa: pil sebutan (mention pill) atomik yang bisa Anda sisipkan, pilih, dan hapus sebagai token utuh, dengan kursor yang akhirnya sejajar dengan apa yang Anda ketik. <strong>Terminal</strong> interaktif memungkinkan Anda mengelola sesi di tempat. Sebuah <strong>papan referensi</strong> bergaya browser menjaga input Anda tetap dalam jangkauan, komentar menerima <strong>lampiran seret-dan-lepas (drag-and-drop)</strong>, dan Anda dapat <strong>mem-fork sebuah percakapan</strong> untuk menjelajahi cabang tanpa kehilangan utas asal Anda. Kanvas berjalan <strong>setinggi penuh</strong>, dan sebuah <strong>inspektur sunting-manual yang tersemat</strong> menjaga penyesuaian presisi hanya sejauh satu klik alih-alih terkubur di dalam panel.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Baris input composer yang berisi beberapa token pil sebutan membulat, dengan satu pil terpilih di dalam bingkai seleksi hijau, di atas latar editorial nyaris putih" />
        <figcaption>Composer memperlakukan sebutan sebagai pil atomik — sisipkan, pilih, dan hapus sebagai token utuh.</figcaption>
      </figure>

      <h2>Asinkron secara bawaan</h2>
      <p>Umpan balik tidak lagi harus menunggu giliran. Sebuah <strong>antrean komentar</strong> memungkinkan Anda menumpuk komentar pratinjau selagi sebuah run masih berjalan — Anda terus bereaksi terhadap pekerjaan, dan Open Design mengambil catatan itu begitu lintasan saat ini selesai. <strong>Sesi paralel</strong> berjalan berdampingan, generasi menampilkan <strong>umpan balik pratinjau bertahap</strong> seiring berjalannya proses, dan <strong>pertanyaan</strong> klarifikasi <strong>dipindahkan ke tab khusus di sisi kanan</strong> sehingga pertanyaan itu memberi tahu Anda tanpa membajak kanvas.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Tumpukan kartu komentar yang diantrekan di samping bilah progres yang sedang berjalan, terpilih dalam bingkai hijau, di atas latar editorial nyaris putih" />
        <figcaption>Antrekan umpan balik selagi sebuah run masih berjalan; tidak ada yang terhalang selagi Anda berpikir.</figcaption>
      </figure>

      <h2>BYOK dan serah terima jadi tingkat produksi</h2>
      <p>Ujung-ujung alur kerja — memasukkan kunci Anda sendiri, dan mengeluarkan hasil pekerjaan — keduanya menjadi matang di rilis ini.</p>
      <p><strong>BYOK memvalidasi saat Anda mengetik.</strong> Kunci API mendapat validasi tingkat-bidang (field-level), draf diperiksa sebelum Anda menyimpan, dan daftar model lebih mengutamakan model yang diambil secara langsung lintas penyedia, sehingga kunci yang salah atau nama model yang usang gagal dengan terang-terangan di formulir alih-alih diam-diam di tengah run.</p>
      <p><strong>Serah terima menjadi infrastruktur sungguhan.</strong> Sebuah <strong>fondasi runtime sandbox</strong>, <strong>bundel alat MCP yang dilingkup-run (run-scoped)</strong>, <strong>manifes ekspor proyek</strong>, dan <strong>URL pratinjau terkungkung</strong> mengubah "desain-ke-editor" dan "desain-ke-Code-Agent" dari tugas salin-tempel menjadi serah terima yang terdefinisi. Dan ketika sesuatu memang rusak, <strong>diagnostik</strong> menyebutkan penyebabnya: klasifikasi kegagalan run dengan korelasi Langfuse, diagnostik prompt-stack, dan kebijakan coba-ulang yang aman, sehingga sebuah kegagalan mengarahkan Anda ke solusinya alih-alih sekadar angkat bahu.</p>

      <h2>Apa lagi yang hadir di 0.10.0</h2>
      <p>Rilis ini luas. Bagian-bagian yang layak diangkat ke depan:</p>
      <ul>
        <li><strong>Mem-fork, bukan memulai ulang.</strong> Cabangkan sebuah percakapan untuk mencoba arah alternatif dan jaga kedua utas tetap hidup alih-alih menimpa yang Anda sukai.</li>
        <li><strong>Komentar yang membawa konteks.</strong> Lampiran seret-dan-lepas berarti sebuah tangkapan layar atau referensi ikut menyertai catatan, tepat di tempat perubahan terjadi.</li>
        <li><strong>Papan referensi yang benar-benar bisa Anda telusuri.</strong> Input duduk di papan bergaya browser alih-alih menggulung hilang ke atas obrolan.</li>
        <li><strong>Kegagalan yang bisa dipulihkan.</strong> Penyebab kegagalan yang dapat diidentifikasi dengan opsi pemulihan menggantikan jalan buntu; sebuah run yang gagal memberi tahu Anda apa langkah berikutnya.</li>
        <li><strong>Build untuk setiap desktop.</strong> macOS (Apple Silicon dan Intel x64) dan Windows (installer dan portable) melalui <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> dan releases.open-design.ai.</li>
      </ul>
      <p>Daftar lengkapnya mencapai 405 PR. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">Catatan rilis di GitHub</a> memuat selebihnya.</p>

      <h2>Apa yang bisa dilakukan dengannya hari ini</h2>
      <table>
        <thead>
          <tr><th>Jika Anda…</th><th>Mulai dari sini</th></tr>
        </thead>
        <tbody>
          <tr><td>Baru mengenal Open Design</td><td>Unduh aplikasi desktop, masuk sekali, dan jalankan sebuah brief dari awal hingga akhir — konsep, penyempurnaan, dan serah terima semua tetap dalam satu jendela</td></tr>
          <tr><td>Sudah menjalankan Open Design</td><td>Biarkan pembaruan otomatis terpaket membawa Anda ke 0.10.0; composer, antrean komentar, dan kanvas setinggi penuh aktif secara bawaan</td></tr>
          <tr><td>Mengirim pekerjaan ke dalam kode</td><td>Gunakan bundel MCP yang dilingkup-run, manifes ekspor, dan URL pratinjau terkungkung untuk menyerahkan sebuah desain langsung ke editor atau Code Agent Anda</td></tr>
          <tr><td>Memakai kunci Anda sendiri</td><td>Periksa ulang Pengaturan — validasi tingkat-bidang dan daftar model langsung berarti kunci yang buruk atau nama model yang usang muncul seketika</td></tr>
        </tbody>
      </table>

      <h2>Apa langkah selanjutnya</h2>
      <p>Jika selama ini Anda terus berpindah-pindah antara draf di sini, run di sana, dan ekspor di tempat lain, inilah rilis yang menyatukan semuanya di satu tempat. Unduh aplikasi desktop dan jalankan brief yang memang sudah akan Anda jalankan — kali ini, konsep hingga serah terima tidak pernah meninggalkan jendela.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Unduh Open Design</a>.</p>
      <p>405 PR dalam 9 hari, dari 68 orang yang menarik ke arah yang sama. Ruang kerja serba-satu ini ada karena begitu banyak kontributor menutup celah-celah kecil yang dulu mengirim Anda ke tab lain. Sebuah gerakan tidak terbangun dari laptop satu tim saja; ia terbangun dari orang-orang yang hadir dan membangun. Kami melihat Anda. 🫡</p>

      <h2>Bacaan terkait</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design for everyone</a> — rilis pasang-dan-buat yang menjadi pijakan rilis ini</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: everything is a plugin</a> — pembangunan ulang mesin yang menopang semuanya</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Why we built Open Design as a skill layer, not a product</a> — manifesto yang lebih panjang di balik taruhan "lapisan, bukan produk"</li>
      </ul>
  nl:
    title: "Open Design 0.10.0: de alles-in-één designworkspace"
    summary: "Tag open-design-v0.10.0 — 405 PR's van 68 bijdragers in negen dagen. Codenaam \"de alles-in-één Agentic designworkspace.\" Deze release brengt de hele flow — concept, verfijning en overdracht — samen in één venster, zodat het werk niet langer verspreid raakt over een dozijn tabbladen."
    bodyHtml: |
      <p>Tag <code>open-design-v0.10.0</code>, uitgebracht op 11 juni 2026. <strong>405 PR's van 68 bijdragers in negen dagen.</strong> Codenaam "de alles-in-één Agentic designworkspace" — dit is de <strong>één-venster-release</strong>. De vorige drie releases maakten beginnen goedkoop; deze maakt <em>blijven</em> goedkoop. Van het eerste concept tot de uiteindelijke overdracht raakt het werk niet langer verspreid over een dozijn tabbladen en drie apps.</p>
      <p>Wil je de uitgebreide versie, dan vind je die in de <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">release notes op GitHub</a>. Dit bericht is de korte versie: wat er onder de motorkap is veranderd, wat je er vandaag mee kunt doen en waar je begint.</p>

      <h2>Waarom tabbladhoppen de prijs was</h2>
      <p>Een designtool verdient zich terug in het saaie middendeel — niet bij de eerste prompt, maar bij de veertigste bewerking. Dat middendeel is waar Open Design vroeger lekte. Je schetste op de ene plek, voerde op een andere uit, liet ergens anders een opmerking achter en exporteerde dan met de hand naar wat er daarna kwam. Elke sprong was een kleine contextwissel, en kleine contextwissels stapelen op tot een dag die druk voelt maar niets oplevert.</p>
      <p>0.10.0 sluit de lus. De hele boog — <strong>concept → verfijning → overdracht</strong> — speelt zich af in één venster, met een status die je volgt in plaats van bij elke grens te resetten.</p>

      <h2>Eén venster voor de hele flow</h2>
      <p>De workspace is nu één enkel oppervlak, geen reeks kamers waar je tussen loopt.</p>
      <p>Een <strong>composer op basis van Lexical</strong> vervangt het gewone tekstvak: atomische mention-pills die je als hele tokens kunt invoegen, selecteren en verwijderen, met een cursor die eindelijk uitlijnt met wat je typte. Interactieve <strong>terminals</strong> laten je sessies ter plekke beheren. Een <strong>referentiebord</strong> in browserstijl houdt je invoer bij de hand, opmerkingen ondersteunen <strong>drag-and-drop-bijlagen</strong>, en je kunt <strong>een gesprek forken</strong> om een aftakking te verkennen zonder de draad kwijt te raken waarvandaan je kwam. Het canvas draait op <strong>volle hoogte</strong>, en een <strong>vastgepinde inspector voor handmatige bewerking</strong> houdt precieze aanpassingen op één klik afstand in plaats van verstopt in een paneel.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Een composer-invoerregel met meerdere afgeronde mention-pill-tokens, waarvan één pill geselecteerd is binnen een groen selectiekader, op een bijna-witte redactionele ondergrond" />
        <figcaption>De composer behandelt mentions als atomische pills — voeg ze in, selecteer en verwijder ze als hele tokens.</figcaption>
      </figure>

      <h2>Asynchroon als standaard</h2>
      <p>Feedback hoeft niet langer op zijn beurt te wachten. Met een <strong>opmerkingenwachtrij</strong> kun je preview-opmerkingen opstapelen terwijl een run nog loopt — je blijft reageren op het werk, en Open Design pakt de notities op zodra de huidige doorloop klaar is. <strong>Parallelle sessies</strong> draaien naast elkaar, generatie toont onderweg <strong>gefaseerde preview-feedback</strong>, en verhelderende <strong>vragen verhuizen naar een eigen tabblad rechts</strong>, zodat ze je aansporen zonder het canvas te kapen.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Een stapel opmerkingenkaarten in de wachtrij naast een lopende voortgangsbalk, geselecteerd in een groen kader, op een bijna-witte redactionele ondergrond" />
        <figcaption>Zet feedback in de wachtrij terwijl een run nog bezig is; niets blokkeert terwijl je nadenkt.</figcaption>
      </figure>

      <h2>BYOK en overdracht worden productieklaar</h2>
      <p>De randen van de flow — je eigen sleutel inbrengen en het werk eruit krijgen — zijn deze release allebei volwassen geworden.</p>
      <p><strong>BYOK valideert terwijl je typt.</strong> API-sleutels krijgen validatie op veldniveau, concepten worden gecontroleerd voordat je opslaat, en de modellijst geeft de voorkeur aan live opgehaalde modellen bij alle providers, zodat een verkeerde sleutel of een verouderde modelnaam luidruchtig faalt bij het formulier in plaats van stilletjes midden in een run.</p>
      <p><strong>Overdracht wordt echte infrastructuur.</strong> Een <strong>basis voor een sandbox-runtime</strong>, <strong>tot een run beperkte MCP-toolbundels</strong>, <strong>exportmanifesten voor projecten</strong> en <strong>afgeschermde preview-URL's</strong> maken van "design-naar-editor" en "design-naar-Code-Agent" een gedefinieerde overdracht in plaats van een kopieer-en-plak-klus. En als er iets stukgaat, benoemt <strong>diagnostiek</strong> de oorzaak: classificatie van runfouten met Langfuse-correlatie, diagnostiek van de prompt-stack en beleid voor veilige herhaalpogingen, zodat een fout je naar de oplossing wijst in plaats van naar een schouderophalen.</p>

      <h2>Wat er nog meer in 0.10.0 zit</h2>
      <p>De release is breed. De stukken die het waard zijn om naar voren te halen:</p>
      <ul>
        <li><strong>Forken, niet opnieuw beginnen.</strong> Tak een gesprek af om een alternatieve richting te proberen en houd beide draden in leven in plaats van die te overschrijven die je beviel.</li>
        <li><strong>Opmerkingen die context meedragen.</strong> Drag-and-drop-bijlagen betekenen dat een screenshot of een referentie meereist met de notitie, precies waar de wijziging plaatsvindt.</li>
        <li><strong>Een referentiebord dat je echt kunt doorbladeren.</strong> Invoer zit in een bord in browserstijl in plaats van weg te scrollen omhoog in de chat.</li>
        <li><strong>Herstelbare fouten.</strong> Identificeerbare foutoorzaken met herstelopties vervangen doodlopende wegen; een mislukte run vertelt je wat je vervolgens moet doen.</li>
        <li><strong>Builds voor elke desktop.</strong> macOS (Apple Silicon en Intel x64) en Windows (installer en portable) via <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> en releases.open-design.ai.</li>
      </ul>
      <p>De volledige lijst loopt op tot 405 PR's. De <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">release notes op GitHub</a> bevatten de rest.</p>

      <h2>Wat je er vandaag mee kunt doen</h2>
      <table>
        <thead>
          <tr><th>Als je…</th><th>Begin hier</th></tr>
        </thead>
        <tbody>
          <tr><td>Nieuw bent bij Open Design</td><td>Download de desktop-app, log één keer in en doorloop een korte opdracht van begin tot eind — concept, verfijning en overdracht blijven allemaal in dat ene venster</td></tr>
          <tr><td>Open Design al gebruikt</td><td>Laat de ingebouwde auto-update je naar 0.10.0 brengen; de composer, de opmerkingenwachtrij en het canvas op volle hoogte staan standaard aan</td></tr>
          <tr><td>Werk naar code overdraagt</td><td>Gebruik de tot een run beperkte MCP-bundels, exportmanifesten en afgeschermde preview-URL's om een design rechtstreeks aan je editor of Code Agent door te geven</td></tr>
          <tr><td>Je eigen sleutel inbrengt</td><td>Controleer Instellingen opnieuw — validatie op veldniveau en live modellijsten betekenen dat een verkeerde sleutel of verouderde modelnaam meteen aan het licht komt</td></tr>
        </tbody>
      </table>

      <h2>Wat je nu kunt doen</h2>
      <p>Als je heen en weer hebt gestuiterd tussen hier een concept, daar een run en ergens anders een export, dan is dit de release die ze op één plek zet. Download de desktop-app en draai de opdracht die je toch al ging draaien — deze keer verlaat concept-tot-overdracht het venster nooit.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Download Open Design</a>.</p>
      <p>405 PR's in 9 dagen, van 68 mensen die dezelfde kant op trokken. De alles-in-één workspace bestaat omdat zoveel bijdragers de kleine gaten dichtten die je vroeger naar een ander tabblad stuurden. Een beweging wordt niet uitgebracht vanaf de laptops van één team; ze wordt uitgebracht door de mensen die kwamen opdagen en bouwden. We zien je. 🫡</p>

      <h2>Verder lezen</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: design voor iedereen</a> — de installeer-en-creëer-release waarop deze voortbouwt</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: alles is een plugin</a> — de motorherbouw die er onder ligt</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Waarom we Open Design als een skill-laag hebben gebouwd, niet als een product</a> — het langere manifest achter de inzet op "laag, niet product"</li>
      </ul>
  ar:
    title: "Open Design 0.10.0: مساحة عمل التصميم الشاملة في مكان واحد"
    summary: "الإصدار open-design-v0.10.0 — 405 طلب دمج من 68 مساهمًا خلال تسعة أيام. الاسم الرمزي \"مساحة عمل التصميم الوكيلية الشاملة في مكان واحد.\" يجمع هذا الإصدار التدفق بأكمله — التصور والتحسين والتسليم — داخل نافذة واحدة، حتى يتوقف العمل عن التشتت بين عشرات علامات التبويب."
    bodyHtml: |
      <p>الإصدار <code>open-design-v0.10.0</code>، صدر في 11 يونيو 2026. <strong>405 طلب دمج من 68 مساهمًا خلال تسعة أيام.</strong> الاسم الرمزي "مساحة عمل التصميم الوكيلية الشاملة في مكان واحد" — هذا هو <strong>إصدار النافذة الواحدة</strong>. جعلت الإصدارات الثلاثة الأخيرة البدء سهلاً وغير مكلف؛ أما هذا الإصدار فيجعل <em>الاستمرار</em> سهلاً وغير مكلف. من التصور الأول إلى التسليم النهائي، لم يعد العمل يتشتت بين عشرات علامات التبويب وثلاثة تطبيقات.</p>
      <p>إذا أردت النسخة المطوّلة، فإن <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">ملاحظات الإصدار على GitHub</a> تتضمنها. هذه التدوينة هي النسخة المختصرة: ما الذي تغيّر تحت الغطاء، وما الذي يمكنك فعله به اليوم، ومن أين تبدأ.</p>

      <h2>لماذا كان التنقل بين علامات التبويب ضريبة</h2>
      <p>أداة التصميم تثبت جدارتها في المنتصف الممل — ليس عند الطلب الأول، بل عند التعديل الأربعين. وذلك المنتصف هو المكان الذي كان Open Design يتسرب منه. كنت تكتب المسودة في مكان، وتشغّلها في آخر، وتترك تعليقًا في مكان ثالث، ثم تصدّر يدويًا إلى أيٍّ كان ما يأتي بعد ذلك. كل قفزة كانت تبديلاً صغيرًا للسياق، والتبديلات الصغيرة للسياق تتراكم لتصنع يومًا يبدو مزدحمًا ولا يُنجز شيئًا.</p>
      <p>يُغلق الإصدار 0.10.0 الحلقة. القوس بأكمله — <strong>التصور ← التحسين ← التسليم</strong> — يحدث في نافذة واحدة، بحالة تتبعك بدلاً من أن تُعاد ضبطها عند كل حد.</p>

      <h2>نافذة واحدة للتدفق بأكمله</h2>
      <p>أصبحت مساحة العمل الآن سطحًا واحدًا، لا مجموعة من الغرف تتنقل بينها.</p>
      <p><strong>محرّر مدعوم بـ Lexical</strong> يحل محل صندوق النص العادي: حبيبات إشارة ذرّية يمكنك إدراجها وتحديدها وحذفها كرموز كاملة، مع مؤشر إدخال يتوافق أخيرًا مع ما كتبته. تتيح لك <strong>الطرفيات</strong> التفاعلية إدارة الجلسات في مكانها. <strong>لوحة مراجع</strong> بأسلوب المتصفح تبقي مدخلاتك في متناول اليد، وتقبل التعليقات <strong>مرفقات بالسحب والإفلات</strong>، ويمكنك <strong>تفريع محادثة</strong> لاستكشاف فرع دون أن تفقد الخيط الذي أتيت منه. تعمل لوحة الرسم <strong>بكامل الارتفاع</strong>، ويُبقي <strong>مفتّش التعديل اليدوي المثبّت</strong> التعديلات الدقيقة على بُعد نقرة واحدة بدلاً من دفنها في لوحة جانبية.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="سطر إدخال في المحرّر يحمل عدة حبيبات إشارة مستديرة على شكل رموز، مع تحديد إحدى الحبيبات داخل إطار تحديد أخضر، على خلفية تحريرية قريبة من البياض" />
        <figcaption>يتعامل المحرّر مع الإشارات بوصفها حبيبات ذرّية — أدرجها وحدّدها واحذفها كرموز كاملة.</figcaption>
      </figure>

      <h2>غير متزامن افتراضيًا</h2>
      <p>لم يعد على الملاحظات أن تنتظر دورها. تتيح لك <strong>طابور التعليقات</strong> تكديس تعليقات المعاينة بينما لا تزال إحدى عمليات التشغيل جارية — فتواصل التفاعل مع العمل، ويلتقط Open Design الملاحظات بمجرد انتهاء المرور الحالي. تعمل <strong>الجلسات المتوازية</strong> جنبًا إلى جنب، ويُظهر التوليد <strong>ملاحظات معاينة مرحلية</strong> أثناء سيره، وتنتقل <strong>الأسئلة</strong> التوضيحية <strong>إلى علامة تبويب مخصصة على الجانب الأيمن</strong> حتى تستحثّك دون أن تستولي على لوحة الرسم.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="كومة من بطاقات التعليقات المصطفّة بجوار شريط تقدّم قيد التشغيل، محددة داخل إطار أخضر، على خلفية تحريرية قريبة من البياض" />
        <figcaption>اصطفّ الملاحظات بينما لا تزال إحدى عمليات التشغيل جارية؛ لا شيء يعيقك أثناء التفكير.</figcaption>
      </figure>

      <h2>BYOK والتسليم يصبحان بمستوى الإنتاج</h2>
      <p>حواف التدفق — إحضار مفتاحك الخاص، وإخراج العمل — نضجت كلتاهما في هذا الإصدار.</p>
      <p><strong>يتحقق BYOK أثناء الكتابة.</strong> تخضع مفاتيح API للتحقق على مستوى الحقل، وتُفحص المسودات قبل الحفظ، وتفضّل قائمة النماذج النماذج المجلوبة مباشرةً عبر المزوّدين، حتى يفشل المفتاح الخاطئ أو اسم النموذج القديم بشكل واضح عند النموذج بدلاً من الفشل بصمت في منتصف التشغيل.</p>
      <p><strong>يصبح التسليم بنية تحتية حقيقية.</strong> <strong>أساس بيئة تشغيل معزولة</strong>، و<strong>حزم أدوات MCP محصورة بنطاق التشغيل</strong>، و<strong>بيانات تصدير المشروع</strong>، و<strong>عناوين معاينة محتواة</strong> تحوّل "من التصميم إلى المحرّر" و"من التصميم إلى Code Agent" من مهمة نسخ ولصق إلى تسليم محدّد المعالم. وعندما ينكسر شيء بالفعل، تسمّي <strong>التشخيصات</strong> السبب: تصنيف فشل التشغيل مع ربطه بـ Langfuse، وتشخيصات حزمة المطالبات، وسياسات إعادة المحاولة الآمنة، حتى يوجّهك الفشل نحو الإصلاح بدلاً من هزّة كتفين.</p>

      <h2>ما الذي يصل أيضًا في 0.10.0</h2>
      <p>الإصدار واسع. أما الأجزاء الجديرة بالتقديم فهي:</p>
      <ul>
        <li><strong>التفريع، لا إعادة البدء.</strong> فرّع محادثة لتجربة اتجاه بديل وأبقِ كلا الخيطين حيّين بدلاً من الكتابة فوق الخيط الذي أعجبك.</li>
        <li><strong>تعليقات تحمل السياق.</strong> تعني مرفقات السحب والإفلات أن لقطة شاشة أو مرجعًا يرافق الملاحظة، تمامًا حيث يحدث التغيير.</li>
        <li><strong>لوحة مراجع يمكنك تصفّحها فعليًا.</strong> تستقر المدخلات في لوحة بأسلوب المتصفح بدلاً من أن تمرّ صعودًا في المحادثة.</li>
        <li><strong>إخفاقات قابلة للاسترداد.</strong> أسباب فشل قابلة للتحديد مع خيارات استرداد تحلّ محل الطرق المسدودة؛ التشغيل الفاشل يخبرك بما تفعله بعد ذلك.</li>
        <li><strong>إصدارات لكل سطح مكتب.</strong> macOS (‏Apple Silicon و‏Intel x64) و‏Windows (المثبّت والمحمول) عبر <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> و releases.open-design.ai.</li>
      </ul>
      <p>تمتد القائمة الكاملة إلى 405 طلب دمج. وتتضمن <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">ملاحظات الإصدار على GitHub</a> البقية.</p>

      <h2>ماذا تفعل به اليوم</h2>
      <table>
        <thead>
          <tr><th>إذا كنت…</th><th>ابدأ من هنا</th></tr>
        </thead>
        <tbody>
          <tr><td>جديدًا على Open Design</td><td>نزّل تطبيق سطح المكتب، وسجّل الدخول مرة واحدة، وشغّل موجزًا من البداية إلى النهاية — يبقى التصور والتحسين والتسليم جميعًا في النافذة الواحدة</td></tr>
          <tr><td>تستخدم Open Design بالفعل</td><td>دع التحديث التلقائي المضمّن ينقلك إلى 0.10.0؛ المحرّر وطابور التعليقات ولوحة الرسم بكامل الارتفاع مفعّلة افتراضيًا</td></tr>
          <tr><td>تنقل العمل إلى الشيفرة</td><td>استخدم حزم MCP المحصورة بنطاق التشغيل، وبيانات التصدير، وعناوين المعاينة المحتواة لتسليم تصميم مباشرةً إلى محرّرك أو Code Agent</td></tr>
          <tr><td>تحضر مفتاحك الخاص</td><td>أعد فحص الإعدادات — التحقق على مستوى الحقل وقوائم النماذج المباشرة يعنيان أن مفتاحًا سيئًا أو اسم نموذج قديمًا يظهر فورًا</td></tr>
        </tbody>
      </table>

      <h2>ماذا تفعل بعد ذلك</h2>
      <p>إذا كنت تتنقل بين مسودة هنا، وتشغيل هناك، وتصدير في مكان آخر، فهذا هو الإصدار الذي يضعها في مكان واحد. نزّل تطبيق سطح المكتب وشغّل الموجز الذي كنت ستشغّله على أي حال — هذه المرة، لا يغادر المسار من التصور إلى التسليم النافذة أبدًا.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">نزّل Open Design</a>.</p>
      <p>405 طلب دمج خلال 9 أيام، من 68 شخصًا يشدّون في الاتجاه نفسه. مساحة العمل الشاملة في مكان واحد موجودة لأن مساهمين كثيرين أغلقوا الفجوات الصغيرة التي كانت ترسلك إلى علامة تبويب أخرى. الحركة لا تنطلق من حواسيب فريق واحد؛ بل تنطلق من الناس الذين حضروا وبنوا. نراكم. 🫡</p>

      <h2>قراءات ذات صلة</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: التصميم للجميع</a> — إصدار التثبيت والإنشاء الذي يبني عليه هذا الإصدار</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: كل شيء عبارة عن إضافة</a> — إعادة بناء المحرّك الكامنة تحت كل ذلك</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">لماذا بنينا Open Design كطبقة مهارات، لا كمنتج</a> — البيان الأطول وراء رهان "طبقة، لا منتج"</li>
      </ul>
  tr:
    title: "Open Design 0.10.0: hepsi bir arada tasarım çalışma alanı"
    summary: "Etiket open-design-v0.10.0 — dokuz günde 68 katkıda bulunandan 405 PR. Kod adı \"hepsi bir arada Agentic tasarım çalışma alanı.\" Bu sürüm tüm akışı — kavram, iyileştirme ve teslim — tek bir pencerede toplar, böylece iş artık bir düzine sekmeye dağılmaz."
    bodyHtml: |
      <p>Etiket <code>open-design-v0.10.0</code>, 11 Haziran 2026'da yayınlandı. <strong>Dokuz günde 68 katkıda bulunandan 405 PR.</strong> Kod adı "hepsi bir arada Agentic tasarım çalışma alanı" — bu, <strong>tek pencere sürümü</strong>. Son üç sürüm başlamayı ucuzlattı; bu sürüm <em>devam etmeyi</em> ucuzlatıyor. İlk kavramdan son teslime kadar iş artık bir düzine sekme ile üç uygulama arasında dağılmıyor.</p>
      <p>Uzun versiyonunu istiyorsanız, <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub'daki sürüm notları</a> hepsini içeriyor. Bu yazı kısa versiyon: kaputun altında ne değişti, bununla bugün ne yapabilirsiniz ve nereden başlamalısınız.</p>

      <h2>Sekme atlamak neden bir vergiydi</h2>
      <p>Bir tasarım aracı, değerini sıkıcı orta kısımda kazanır — ilk istemde değil, kırkıncı düzenlemede. Open Design'ın eskiden sızıntı yaptığı yer işte o orta kısımdı. Bir yerde taslak hazırlar, başka bir yerde çalıştırır, başka bir yere yorum bırakır, ardından sırada ne varsa ona elle dışa aktarırdınız. Her atlama küçük bir bağlam değişimiydi ve küçük bağlam değişimleri birikerek meşgul hissettiren ama hiçbir şey teslim etmeyen bir güne dönüşür.</p>
      <p>0.10.0 döngüyü kapatıyor. Tüm yay — <strong>kavram → iyileştirme → teslim</strong> — her sınırda sıfırlanmak yerine sizi takip eden bir durumla tek bir pencerede gerçekleşiyor.</p>

      <h2>Tüm akış için tek pencere</h2>
      <p>Çalışma alanı artık aralarında dolaştığınız bir oda kümesi değil, tek bir yüzey.</p>
      <p><strong>Lexical destekli bir besteci</strong> sade metin kutusunun yerini alıyor: ekleyebileceğiniz, seçebileceğiniz ve bütün belirteçler olarak silebileceğiniz atomik bahsetme rozetleri ve nihayet yazdığınızla hizalanan bir imleç ile birlikte. Etkileşimli <strong>terminaller</strong> oturumları yerinde yönetmenizi sağlıyor. Tarayıcı tarzı bir <strong>referans panosu</strong> girdilerinizi el altında tutuyor, yorumlar <strong>sürükle-bırak ekleri</strong> alıyor ve geldiğiniz konuyu kaybetmeden bir dalı keşfetmek için <strong>bir konuşmayı çatallayabiliyorsunuz</strong>. Tuval <strong>tam yükseklikte</strong> çalışıyor ve <strong>sabitlenmiş bir elle düzenleme denetçisi</strong>, hassas ince ayarları bir panele gömmek yerine tek tık uzakta tutuyor.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, yeşil bir seçim çerçevesi içinde seçili bir rozetle birlikte birkaç yuvarlatılmış bahsetme rozeti belirteci tutan bir besteci girdi satırı" />
        <figcaption>Besteci, bahsetmeleri atomik rozetler olarak ele alır — onları bütün belirteçler olarak ekleyin, seçin ve silin.</figcaption>
      </figure>

      <h2>Varsayılan olarak asenkron</h2>
      <p>Geri bildirimin artık sırasını beklemesi gerekmiyor. Bir <strong>yorum kuyruğu</strong>, bir çalıştırma hâlâ devam ederken önizleme yorumlarını yığmanıza olanak tanır — işe tepki vermeye devam edersiniz ve Open Design, mevcut geçiş biter bitmez notları alır. <strong>Paralel oturumlar</strong> yan yana çalışır, üretim ilerledikçe <strong>aşamalı önizleme geri bildirimi</strong> gösterir ve açıklayıcı <strong>sorular özel bir sağ taraf sekmesine taşınır</strong>, böylece tuvali ele geçirmeden sizi yönlendirirler.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Neredeyse beyaz bir editöryel zemin üzerinde, yeşil bir çerçeve içinde seçili olarak, çalışan bir ilerleme çubuğunun yanında kuyruğa alınmış yorum kartlarından oluşan bir yığın" />
        <figcaption>Bir çalıştırma hâlâ devam ederken geri bildirimi kuyruğa alın; siz düşünürken hiçbir şey engellenmez.</figcaption>
      </figure>

      <h2>BYOK ve teslim üretim düzeyine ulaşıyor</h2>
      <p>Akışın kenarları — kendi anahtarınızı getirmek ve işi dışarı çıkarmak — bu sürümde olgunlaştı.</p>
      <p><strong>BYOK siz yazarken doğrular.</strong> API anahtarları alan düzeyinde doğrulama alır, taslaklar kaydetmeden önce kontrol edilir ve model listesi sağlayıcılar arasında canlı olarak getirilen modelleri tercih eder, böylece yanlış bir anahtar veya eski bir model adı, çalıştırmanın ortasında sessizce değil, formda yüksek sesle başarısız olur.</p>
      <p><strong>Teslim gerçek bir altyapıya dönüşüyor.</strong> Bir <strong>sandbox çalışma zamanı temeli</strong>, <strong>çalıştırma kapsamlı MCP araç paketleri</strong>, <strong>proje dışa aktarma manifestoları</strong> ve <strong>kapsanmış önizleme URL'leri</strong>, "tasarımdan editöre" ve "tasarımdan Code Agent'a" işlemini bir kopyala-yapıştır angaryasından tanımlı bir teslime dönüştürür. Ve bir şey gerçekten bozulduğunda, <strong>tanılamalar</strong> nedenini adlandırır: Langfuse korelasyonu ile çalıştırma hatası sınıflandırması, istem yığını tanılaması ve güvenli yeniden deneme politikaları, böylece bir hata sizi omuz silkmek yerine düzeltmeye yönlendirir.</p>

      <h2>0.10.0'da başka neler var</h2>
      <p>Sürüm geniş kapsamlı. Öne çıkarılmaya değer parçalar:</p>
      <ul>
        <li><strong>Yeniden başlatmak değil, çatallamak.</strong> Alternatif bir yön denemek için bir konuşmayı dallandırın ve beğendiğinizin üzerine yazmak yerine her iki konuyu da canlı tutun.</li>
        <li><strong>Bağlam taşıyan yorumlar.</strong> Sürükle-bırak ekleri, bir ekran görüntüsünün veya bir referansın notla birlikte, değişikliğin gerçekleştiği yere kadar gelmesi anlamına gelir.</li>
        <li><strong>Gerçekten göz atabileceğiniz bir referans panosu.</strong> Girdiler, sohbette yukarı kayıp gitmek yerine tarayıcı tarzı bir panoda durur.</li>
        <li><strong>Kurtarılabilir hatalar.</strong> Kurtarma seçenekleriyle birlikte tanımlanabilir hata nedenleri, çıkmaz sokakların yerini alır; başarısız bir çalıştırma size bundan sonra ne yapacağınızı söyler.</li>
        <li><strong>Her masaüstü için derlemeler.</strong> <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> ve releases.open-design.ai üzerinden macOS (Apple Silicon ve Intel x64) ve Windows (yükleyici ve taşınabilir).</li>
      </ul>
      <p>Tam liste 405 PR'a ulaşıyor. <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub'daki sürüm notları</a> geri kalanını içeriyor.</p>

      <h2>Bununla bugün ne yapmalı</h2>
      <table>
        <thead>
          <tr><th>Eğer şuysanız…</th><th>Buradan başlayın</th></tr>
        </thead>
        <tbody>
          <tr><td>Open Design'da yeni</td><td>Masaüstü uygulamasını indirin, bir kez oturum açın ve kısa bir özeti baştan sona çalıştırın — kavram, iyileştirme ve teslim hepsi tek pencerede kalır</td></tr>
          <tr><td>Zaten Open Design kullanıyor</td><td>Paketlenmiş otomatik güncellemenin sizi 0.10.0'a getirmesine izin verin; besteci, yorum kuyruğu ve tam yükseklikte tuval varsayılan olarak açık</td></tr>
          <tr><td>İşi koda gönderiyor</td><td>Bir tasarımı doğrudan editörünüze veya Code Agent'a teslim etmek için çalıştırma kapsamlı MCP paketlerini, dışa aktarma manifestolarını ve kapsanmış önizleme URL'lerini kullanın</td></tr>
          <tr><td>Kendi anahtarını getiriyor</td><td>Ayarlar'ı yeniden kontrol edin — alan düzeyinde doğrulama ve canlı model listeleri, kötü bir anahtarın veya eski bir model adının hemen ortaya çıkması anlamına gelir</td></tr>
        </tbody>
      </table>

      <h2>Sırada ne yapmalı</h2>
      <p>Burada bir taslak, orada bir çalıştırma ve başka bir yerde bir dışa aktarma arasında zıplayıp duruyorsanız, bu, onları tek bir yere koyan sürümdür. Masaüstü uygulamasını indirin ve zaten çalıştıracağınız özeti çalıştırın — bu sefer kavramdan teslime kadar hiçbir şey pencereden ayrılmaz.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Open Design'ı indirin</a>.</p>
      <p>9 günde 405 PR, aynı yöne çeken 68 kişiden. Hepsi bir arada çalışma alanı var çünkü pek çok katkıda bulunan, sizi başka bir sekmeye gönderen küçük boşlukları kapattı. Bir hareket tek bir ekibin dizüstü bilgisayarlarından çıkmaz; ortaya çıkıp inşa eden insanlardan çıkar. Sizi görüyoruz. 🫡</p>

      <h2>İlgili okumalar</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: herkes için tasarım</a> — bunun üzerine inşa edildiği kur-ve-yarat sürümü</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: her şey bir eklenti</a> — tüm bunların altındaki motor yeniden inşası</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Open Design'ı neden bir ürün değil, bir beceri katmanı olarak inşa ettik</a> — "ürün değil, katman" bahsinin arkasındaki daha uzun manifesto</li>
      </ul>
  uk:
    title: "Open Design 0.10.0: універсальний робочий простір для дизайну"
    summary: "Тег open-design-v0.10.0 — 405 PR від 68 контриб'юторів за дев'ять днів. Кодова назва «універсальний агентний робочий простір для дизайну». Цей реліз згортає весь процес — концепцію, доопрацювання та передачу — в одне вікно, тож робота більше не розкидана по десятку вкладок."
    bodyHtml: |
      <p>Тег <code>open-design-v0.10.0</code>, випущено 11 червня 2026 року. <strong>405 PR від 68 контриб'юторів за дев'ять днів.</strong> Кодова назва «універсальний агентний робочий простір для дизайну» — це <strong>реліз одного вікна</strong>. Останні три релізи зробили дешевим початок роботи; цей робить дешевим <em>її продовження</em>. Від першої концепції до фінальної передачі робота більше не розпорошується по десятку вкладок і трьох застосунках.</p>
      <p>Якщо вам потрібна розгорнута версія, її містять <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">примітки до релізу на GitHub</a>. Цей допис — коротка версія: що змінилося під капотом, що з цим можна зробити вже сьогодні і з чого почати.</p>

      <h2>Чому стрибки між вкладками були податком</h2>
      <p>Інструмент для дизайну виправдовує себе в нудній середині — не на першому запиті, а на сороковому редагуванні. Саме в цій середині Open Design раніше давав течу. Ви робили чернетку в одному місці, запускали в іншому, залишали коментар ще десь, а потім вручну експортували в те, що йшло далі. Кожен стрибок був невеликим перемиканням контексту, а маленькі перемикання контексту складаються в день, який здається насиченим, але нічого не випускає.</p>
      <p>0.10.0 замикає цикл. Уся дуга — <strong>концепція → доопрацювання → передача</strong> — відбувається в одному вікні, зі станом, який слідує за вами, а не скидається на кожній межі.</p>

      <h2>Одне вікно для всього процесу</h2>
      <p>Робочий простір тепер є єдиною поверхнею, а не набором кімнат, між якими ви ходите.</p>
      <p><strong>Композер на основі Lexical</strong> замінює звичайне текстове поле: атомарні пігулки згадок, які можна вставляти, виділяти й видаляти як цілісні токени, з курсором, який нарешті збігається з тим, що ви ввели. Інтерактивні <strong>термінали</strong> дають змогу керувати сеансами на місці. <strong>Дошка референсів</strong> у стилі браузера тримає ваші вхідні дані під рукою, коментарі приймають <strong>вкладення перетягуванням</strong>, а ви можете <strong>відгалузити розмову</strong>, щоб дослідити нову гілку, не втрачаючи нитку, з якої ви прийшли. Полотно працює на <strong>повну висоту</strong>, а <strong>закріплений інспектор ручного редагування</strong> тримає точні налаштування за один клік, а не похованими в панелі.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="Рядок введення композера з кількома заокругленими токенами-пігулками згадок, де одну пігулку виділено в зеленій рамці виділення, на майже білому редакційному тлі" />
        <figcaption>Композер трактує згадки як атомарні пігулки — вставляйте, виділяйте та видаляйте їх як цілісні токени.</figcaption>
      </figure>

      <h2>Асинхронний за замовчуванням</h2>
      <p>Зворотному зв'язку більше не доводиться чекати своєї черги. <strong>Черга коментарів</strong> дає змогу накопичувати коментарі до прев'ю, поки запуск ще триває — ви продовжуєте реагувати на роботу, а Open Design підхоплює нотатки щойно завершиться поточний прохід. <strong>Паралельні сеанси</strong> працюють пліч-о-пліч, генерація показує <strong>поетапний зворотний зв'язок прев'ю</strong> по ходу, а уточнювальні <strong>запитання переходять у спеціальну вкладку праворуч</strong>, тож вони звертаються до вас, не захоплюючи полотно.</p>
      <figure>
        <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="Стос карток коментарів у черзі поруч зі смугою прогресу запуску, що триває, виділений у зеленій рамці, на майже білому редакційному тлі" />
        <figcaption>Ставте зворотний зв'язок у чергу, поки запуск ще триває; ніщо не блокує, поки ви думаєте.</figcaption>
      </figure>

      <h2>BYOK і передача стають придатними для продакшену</h2>
      <p>Краї процесу — підключення власного ключа та виведення роботи назовні — обидва подорослішали в цьому релізі.</p>
      <p><strong>BYOK перевіряється під час введення.</strong> API-ключі отримують валідацію на рівні полів, чернетки перевіряються перед збереженням, а список моделей віддає перевагу моделям, завантаженим наживо в різних провайдерів, тож хибний ключ або застаріла назва моделі гучно завалюються прямо у формі, а не мовчки посеред запуску.</p>
      <p><strong>Передача стає справжньою інфраструктурою.</strong> <strong>Основа пісочничного середовища виконання</strong>, <strong>набори інструментів MCP у межах запуску</strong>, <strong>маніфести експорту проєкту</strong> та <strong>ізольовані URL-адреси прев'ю</strong> перетворюють «дизайн-у-редактор» і «дизайн-у-Code-Agent» з рутини копіювання-вставлення на чітко визначену передачу. А коли щось таки ламається, <strong>діагностика</strong> називає причину: класифікація збоїв запуску з кореляцією Langfuse, діагностика стеку запитів і політики безпечного повтору, тож збій вказує вам на виправлення, а не знизує плечима.</p>

      <h2>Що ще з'являється у 0.10.0</h2>
      <p>Реліз широкий. Частини, які варто винести наперед:</p>
      <ul>
        <li><strong>Відгалуження, а не перезапуск.</strong> Відгалужуйте розмову, щоб спробувати альтернативний напрям, і тримайте обидві нитки живими, замість перезаписувати ту, яка вам сподобалася.</li>
        <li><strong>Коментарі, що несуть контекст.</strong> Вкладення перетягуванням означають, що скриншот чи референс їде разом із нотаткою, прямо там, де відбувається зміна.</li>
        <li><strong>Дошка референсів, яку справді можна гортати.</strong> Вхідні дані лежать на дошці у стилі браузера, а не зникають угору в чаті.</li>
        <li><strong>Відновлювані збої.</strong> Ідентифіковані причини збоїв із варіантами відновлення замінюють глухі кути; невдалий запуск каже вам, що робити далі.</li>
        <li><strong>Збірки для кожного десктопу.</strong> macOS (Apple Silicon та Intel x64) і Windows (інсталятор і портативна версія) через <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">GitHub Releases</a> та releases.open-design.ai.</li>
      </ul>
      <p>Повний перелік налічує 405 PR. Решту містять <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0">примітки до релізу на GitHub</a>.</p>

      <h2>Що з цим робити вже сьогодні</h2>
      <table>
        <thead>
          <tr><th>Якщо ви…</th><th>Почніть звідси</th></tr>
        </thead>
        <tbody>
          <tr><td>Новачок в Open Design</td><td>Завантажте десктопний застосунок, увійдіть один раз і проженіть бриф від початку до кінця — концепція, доопрацювання та передача залишаються в одному вікні</td></tr>
          <tr><td>Уже користуєтеся Open Design</td><td>Дозвольте вбудованому автооновленню підняти вас до 0.10.0; композер, черга коментарів і полотно на повну висоту увімкнені за замовчуванням</td></tr>
          <tr><td>Виводите роботу в код</td><td>Використовуйте набори MCP у межах запуску, маніфести експорту та ізольовані URL-адреси прев'ю, щоб передати дизайн прямо у ваш редактор або Code Agent</td></tr>
          <tr><td>Підключаєте власний ключ</td><td>Перевірте Налаштування ще раз — валідація на рівні полів і живі списки моделей означають, що поганий ключ чи застаріла назва моделі виявляться одразу</td></tr>
        </tbody>
      </table>

      <h2>Що робити далі</h2>
      <p>Якщо ви метушилися між чернеткою тут, запуском там і експортом ще десь, це той реліз, що зводить їх в одне місце. Завантажте десктопний застосунок і проженіть той бриф, який ви все одно збиралися прогнати — цього разу шлях від концепції до передачі ніколи не покидає вікно.</p>
      <p><a href="https://github.com/nexu-io/open-design/releases">Завантажити Open Design</a>.</p>
      <p>405 PR за 9 днів від 68 людей, що тягнули в одному напрямі. Універсальний робочий простір існує тому, що так багато контриб'юторів закрили маленькі прогалини, які раніше відправляли вас до іншої вкладки. Рух не випускається з ноутбуків однієї команди; він випускається людьми, які прийшли і будували. Ми вас бачимо. 🫡</p>

      <h2>Дотичне читання</h2>
      <ul>
        <li><a href="/blog/open-design-0-9-0-design-for-everyone/">Open Design 0.9.0: дизайн для кожного</a> — реліз «встанови-і-твори», на якому будується цей</li>
        <li><a href="/blog/open-design-0-8-0-everything-is-a-plugin/">Open Design 0.8.0: усе є плагіном</a> — перебудова рушія, що лежить в основі всього</li>
        <li><a href="/blog/why-we-built-open-design-as-a-skill-layer/">Чому ми побудували Open Design як шар навичок, а не продукт</a> — розгорнутий маніфест за ставкою «шар, а не продукт»</li>
      </ul>
---

Tag `open-design-v0.10.0`, shipped 11 June 2026. **405 PRs from 68 contributors in nine days.** Codename "the all-in-one Agentic design workspace" — this is the **one-window release**. The last three releases made starting cheap; this one makes *staying* cheap. From the first concept to the final handoff, the work no longer scatters across a dozen tabs and three apps.

If you want the long version, the [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0) have it. This post is the short version: what changed under the hood, what you can do with it today, and where to start.

## Why tab-hopping was the tax

A design tool earns its keep in the boring middle — not the first prompt, but the fortieth edit. That middle is where Open Design used to leak. You'd draft in one place, run in another, leave a comment somewhere else, and then export by hand into whatever came next. Each hop was a small context-switch, and small context-switches compound into a day that feels busy and ships nothing.

0.10.0 closes the loop. The whole arc — **concept → refinement → handoff** — happens in one window, with state that follows you instead of resetting at every boundary.

## One window for the whole flow

The workspace is now a single surface, not a set of rooms you walk between.

A **Lexical-powered composer** replaces the plain text box: atomic mention pills you can insert, select, and delete as whole tokens, with a caret that finally lines up with what you typed. Interactive **terminals** let you manage sessions in place. A browser-style **reference board** keeps your inputs at hand, comments take **drag-and-drop attachments**, and you can **fork a conversation** to explore a branch without losing the thread you came from. The canvas runs **full-height**, and a **pinned manual-edit inspector** keeps precise tweaks one click away instead of buried in a panel.

<figure>
  <img src="/blog/open-design-0-10-0-all-in-one-workspace-composer.webp" alt="A composer input line holding several rounded mention pill tokens, with one pill selected inside a green selection frame, on a near-white editorial ground" />
  <figcaption>The composer treats mentions as atomic pills — insert, select, and delete them as whole tokens.</figcaption>
</figure>

## Asynchronous by default

Feedback no longer has to wait its turn. A **comment queue** lets you stack preview comments while a run is still in flight — you keep reacting to the work, and Open Design picks the notes up as soon as the current pass finishes. **Parallel sessions** run side by side, generation shows **staged preview feedback** as it goes, and clarifying **questions move to a dedicated right-side tab** so they prompt you without hijacking the canvas.

<figure>
  <img src="/blog/open-design-0-10-0-all-in-one-workspace-queue.webp" alt="A stack of queued comment cards beside a running progress bar, selected in a green frame, on a near-white editorial ground" />
  <figcaption>Queue feedback while a run is still going; nothing blocks while you think.</figcaption>
</figure>

## BYOK and handoff get production-grade

The edges of the flow — bringing your own key in, and getting the work out — both grew up this release.

**BYOK validates as you type.** API keys get field-level validation, drafts are checked before you save, and the model list prefers live-fetched models across providers, so a wrong key or a stale model name fails loudly at the form instead of silently mid-run.

**Handoff becomes real infrastructure.** A **sandbox runtime foundation**, **run-scoped MCP tool bundles**, **project export manifests**, and **contained preview URLs** turn "design-to-editor" and "design-to-Code-Agent" from a copy-paste chore into a defined handoff. And when something does break, **diagnostics** name the cause: run-failure classification with Langfuse correlation, prompt-stack diagnostics, and safe-retry policies, so a failure points you at the fix instead of a shrug.

## What else lands in 0.10.0

The release is wide. The pieces worth pulling forward:

- **Forking, not restarting.** Branch a conversation to try an alternative direction and keep both threads alive instead of overwriting the one you liked.
- **Comments that carry context.** Drag-and-drop attachments mean a screenshot or a reference rides along with the note, right where the change happens.
- **A reference board you can actually browse.** Inputs sit in a browser-style board instead of scrolling away up the chat.
- **Recoverable failures.** Identifiable failure causes with recovery options replace dead-ends; a failed run tells you what to do next.
- **Builds for every desktop.** macOS (Apple Silicon and Intel x64) and Windows (installer and portable) via [GitHub Releases](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0) and releases.open-design.ai.

The full list runs to 405 PRs. The [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.10.0) carry the rest.

## What to do with it today

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app, sign in once, and run a brief end to end — concept, refinement, and handoff all stay in the one window |
| Already running Open Design | Let the packaged auto-update bring you to 0.10.0; the composer, comment queue, and full-height canvas are on by default |
| Shipping work into code | Use the run-scoped MCP bundles, export manifests, and contained preview URLs to hand a design straight to your editor or Code Agent |
| Bringing your own key | Re-check Settings — field-level validation and live model lists mean a bad key or stale model name surfaces immediately |

## What to do next

If you've been bouncing between a draft here, a run there, and an export somewhere else, this is the release that puts them in one place. Download the desktop app and run the brief you were going to run anyway — this time, concept to handoff never leaves the window.

[Download Open Design](https://github.com/nexu-io/open-design/releases).

405 PRs in 9 days, from 68 people pulling in the same direction. The all-in-one workspace exists because so many contributors closed the small gaps that used to send you to another tab. A movement doesn't ship from one team's laptops; it ships from the people who showed up and built. We see you. 🫡

## Related reading

- [Open Design 0.9.0: design for everyone](/blog/open-design-0-9-0-design-for-everyone/) — the install-and-create release this one builds on
- [Open Design 0.8.0: everything is a plugin](/blog/open-design-0-8-0-everything-is-a-plugin/) — the engine rebuild underneath it all
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "layer, not product" bet
