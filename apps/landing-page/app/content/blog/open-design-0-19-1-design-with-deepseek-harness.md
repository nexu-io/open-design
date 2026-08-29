---
title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
date: 2026-08-14
category: 'Product'
readingTime: 6
summary: 'OpenDesign 0.19.1 makes DeepSeek Harness a first-class native design runtime, with live model and reasoning discovery, structured streaming, session resume, reliable cancellation, faster project creation, and steadier team workspaces.'
socialImage: '/blog/open-design-0-19-1-design-with-deepseek-harness-cover.webp'
ctaKind: download-app
i18n:
  zh:
    title: 'OpenDesign 0.19.1：Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1 将 DeepSeek Harness 变成一等原生设计运行时，支持实时模型与推理档位发现、结构化流式输出、会话恢复和可靠取消，同时让项目启动更快、团队工作区更稳定。'
    category: '产品'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>，代号「Design with DeepSeek Harness」。这一版让官方 <code>dsh</code> CLI 不只是 OpenDesign 可以连接的另一个 Agent，而是可以直接启动、持续对话并完成设计交付的一等原生运行时。</p>
      <p>完整的稳定性与工作区变更见 <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/zh-CN.md">0.19.1 changelog</a>。这里重点讲 DeepSeek Harness 如何进入 OpenDesign 的设计循环，以及从首页到项目的等待如何继续缩短。</p>

      <h2>DeepSeek Harness 成为原生设计运行时</h2>
      <p>OpenDesign 现在可以通过官方 <code>dsh</code> CLI 直接启动 DeepSeek Harness。连接使用结构化 JSONL 流，而不是把终端文本当作黑盒解析；模型列表与推理档位来自 Harness 的实时能力，运行中的进度、结果与错误也能以明确事件进入项目。</p>
      <p>会话可以原生恢复，取消会贯穿启动、执行和恢复阶段，并在 macOS 与 Windows 上清理对应进程树。缺少密钥、版本不匹配或 OpenDesign profile 不兼容时，界面会给出具体诊断，而不是让运行无声失败。</p>
      <figure>
        <img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="命令行输入通过蓝色原生运行时连接进入设计画布，四周表示模型发现、推理选择、会话恢复与取消控制" />
        <figcaption>模型发现、推理档位、结构化流、恢复与取消，都属于同一条原生运行时连接。</figcaption>
      </figure>

      <h2>一条命令安装或修复连接组件</h2>
      <p>先安装官方 DeepSeek Harness，再运行 <code>od agent setup deepseek-harness</code>。OpenDesign 会安装随桌面应用一起验证和校验的连接组件；如果 profile 已存在但不兼容，同一条命令会修复它。之后在 Models 页面加入 DeepSeek API key，或向 daemon 暴露 <code>DEEPSEEK_API_KEY</code>。</p>
      <p>准备完成后，可以像选择其他 Agent 一样选择 DeepSeek Harness，并直接在 composer 中选择它公开的模型和推理强度。查看完整接入流程，请阅读 <a href="/agents/deepseek-harness-design/">DeepSeek Harness 设计指南</a>。</p>

      <h2>从一个想法更快进入项目</h2>
      <p>0.19.1 同时刷新了 Home 的创建入口与 workspace 控件。本地项目不再等待 Cloud workspace identity；提交后会直接进入新项目的 Preparing 状态，创建失败时再干净地回滚。Cloud 项目仍会保留必要的余额与身份检查。</p>
      <figure>
        <img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="一个想法经过 Preparing 门径直接进入可工作的设计项目，下方有限队列维持团队资源同步" />
        <figcaption>提交后立即进入项目；有边界的后台任务让大型 workspace 也能保持响应。</figcaption>
      </figure>

      <h2>恢复能力与团队规模一起变强</h2>
      <p>Cloud 会话过期时，无效凭据会被清理并回到现有登录流程；无界面环境也可以使用 <code>od amr status</code> 与 <code>od amr logout</code>。短暂的 workspace authority 故障会安全重试，但不会重复提交原请求。</p>
      <p>大型团队项目的共享资源改为批量拉取，同步 fan-out、扫描、归档与 push queue 都有明确上限，workspace authority 读取也会安全缓存。工作区变大后，同步更稳，内存压力更可控。</p>

      <h2>0.19.1 的其他改进</h2>
      <ul>
        <li><strong>生成结果自动进入预览</strong>——新图像与视频完成后会直接打开；Agent 明确指定已有 artifact 时会原地更新，不再创建编号副本。</li>
        <li><strong>独立 HTML 导出更可靠</strong>——导出的单文件更适合直接交付与离线打开。</li>
        <li><strong>Design system 新增 Cloudflare Kumo UI</strong>，可以直接作为生成界面的视觉基础。</li>
        <li><strong>Claude Desktop 接入更简单</strong>——macOS 与 Windows 可使用 <code>od mcp install claude-desktop</code>。</li>
        <li><strong>项目上下文更准确</strong>——Home 搜索包含个人项目，Community template 会保留原项目类型，MCP resource 读取遵循当前 workspace。</li>
        <li><strong>运行恢复更可信</strong>——重复提交被拦截，成功的 run 不会被旧错误改回失败，过期消息也不能覆盖 daemon 的标准事件。</li>
      </ul>

      <h2>接下来做什么</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">下载 OpenDesign 0.19.1</a>，安装官方 <code>dsh</code> CLI，运行 <code>od agent setup deepseek-harness</code>，然后把第一个真实设计 brief 交给 DeepSeek Harness。</p>
      <p>感谢参与 0.19.1 的每一位贡献者。实现细节可查看 <a href="https://github.com/nexu-io/open-design/commit/f9fe73c8">DeepSeek Harness 原生运行时变更</a>与<a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/zh-CN.md">完整 changelog</a>。</p>

      <h2>相关阅读</h2>
      <ul>
        <li><a href="/agents/deepseek-harness-design/">使用 DeepSeek Harness 进行 Agent 原生设计</a></li>
        <li><a href="/blog/open-design-0-18-0-design-team-workspace-codex/">OpenDesign 0.18.0：设计团队工作区，现已进入 Codex</a></li>
        <li><a href="/blog/open-design-0-17-0-open-design-for-codex/">OpenDesign 0.17.0：为 Codex 打造的设计工作区</a></li>
      </ul>
  ja:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1 は DeepSeek Harness を第一級のネイティブ・デザインランタイムとして統合し、モデルと推論設定の検出、構造化ストリーミング、セッション再開、確実なキャンセル、より速いプロジェクト作成を実現します。'
    category: 'プロダクト'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>、コードネームは「Design with DeepSeek Harness」。公式 <code>dsh</code> CLI を、単なる接続先ではなく、OpenDesign が直接起動し、会話を継続し、デザインを完成まで運べるネイティブランタイムとして統合します。</p>
      <p>安定性と workspace の全変更は <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">0.19.1 changelog</a> を参照してください。ここでは DeepSeek Harness と、Home からプロジェクトへ進む新しい流れに焦点を当てます。</p>
      <h2>DeepSeek Harness がネイティブランタイムに</h2>
      <p>OpenDesign は公式 <code>dsh</code> CLI を直接起動し、構造化 JSONL ストリームで通信します。モデル一覧と推論レベルは Harness のライブ能力から取得され、進捗、成果、エラーも明確なイベントとしてプロジェクトに届きます。</p>
      <p>セッション再開とキャンセルは起動・実行・復旧の全段階で機能します。API key、対応バージョン、OpenDesign profile に問題がある場合は、具体的な診断と修復手順が表示されます。</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="コマンドラインから青いネイティブランタイムを通ってデザインキャンバスへ流れる構造化ストリーム" /><figcaption>モデル検出、推論設定、構造化ストリーム、再開、キャンセルが一つの接続にまとまります。</figcaption></figure>
      <h2>一つのコマンドで接続をセットアップ</h2>
      <p>公式 DeepSeek Harness をインストールしてから <code>od agent setup deepseek-harness</code> を実行します。OpenDesign は検証済みの接続コンポーネントをインストールまたは修復します。API key は Models ページ、または daemon の <code>DEEPSEEK_API_KEY</code> で設定できます。</p>
      <p>セットアップ後は composer から Harness のモデルと推論強度を選択できます。詳しくは <a href="/agents/deepseek-harness-design/">DeepSeek Harness デザインガイド</a>をご覧ください。</p>
      <h2>アイデアからプロジェクトへ、すぐに移動</h2>
      <p>Home の作成タイプと workspace コントロールも刷新されました。ローカルプロジェクトは Cloud identity を待たず、送信直後に Preparing 状態へ進みます。失敗した場合は遷移がきれいに戻されます。</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Home のアイデアが Preparing を通って作業中のデザインプロジェクトへ入る流れ" /><figcaption>送信後すぐにプロジェクトへ。制限されたバックグラウンド処理が大きな workspace を安定させます。</figcaption></figure>
      <h2>復旧と大規模チームの安定性</h2>
      <p>期限切れの Cloud 認証は既存のサインインへ戻り、CLI では <code>od amr status</code> と <code>od amr logout</code> が使えます。共有リソースの pull はバッチ化され、sync fan-out、scan、archive、push queue に上限が設けられました。</p>
      <h2>その他の 0.19.1</h2>
      <ul><li>新しい画像と動画は自動的に preview で開き、指定済み artifact はその場で更新されます。</li><li>standalone HTML export の信頼性が向上しました。</li><li>Cloudflare Kumo UI が design-system catalog に追加されました。</li><li><code>od mcp install claude-desktop</code> が macOS と Windows に対応しました。</li><li>重複送信、古い recovery card、workspace scope の不整合が修正されました。</li></ul>
      <h2>次にすること</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">OpenDesign 0.19.1 をダウンロード</a>し、公式 <code>dsh</code> CLI と接続コンポーネントをセットアップして、最初のデザイン brief を実行してください。</p>
  ko:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1은 DeepSeek Harness를 일급 네이티브 디자인 런타임으로 통합해 실시간 모델·추론 옵션 검색, 구조화 스트리밍, 세션 재개, 신뢰할 수 있는 취소, 더 빠른 프로젝트 생성을 제공합니다.'
    category: '제품'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, 코드명 “Design with DeepSeek Harness.” 공식 <code>dsh</code> CLI가 단순한 연결 대상이 아니라 OpenDesign이 직접 실행하고 대화를 이어가며 디자인을 완성하는 네이티브 런타임이 됩니다.</p>
      <p>전체 안정성 변경은 <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">0.19.1 changelog</a>에서 확인할 수 있습니다. 여기서는 DeepSeek Harness와 Home에서 프로젝트로 더 빠르게 들어가는 흐름을 다룹니다.</p>
      <h2>DeepSeek Harness, 네이티브 런타임이 되다</h2>
      <p>OpenDesign은 공식 <code>dsh</code> CLI를 직접 실행하고 구조화 JSONL 스트림으로 통신합니다. 모델 목록과 추론 강도는 Harness가 실시간으로 공개하는 기능에서 가져오며, 진행 상황·결과·오류는 명확한 이벤트로 프로젝트에 전달됩니다.</p>
      <p>세션 재개와 취소는 시작, 실행, 복구 단계 전체에서 동작합니다. API key, 버전, OpenDesign profile에 문제가 있으면 구체적인 진단과 복구 안내를 제공합니다.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="명령줄 입력이 파란 네이티브 런타임을 지나 디자인 캔버스로 흐르는 구조" /><figcaption>모델 검색, 추론 선택, 구조화 스트림, 재개, 취소가 하나의 네이티브 연결에 들어갑니다.</figcaption></figure>
      <h2>한 명령으로 연결 구성</h2>
      <p>공식 DeepSeek Harness를 설치한 뒤 <code>od agent setup deepseek-harness</code>를 실행하세요. OpenDesign은 검증된 연결 구성 요소를 설치하거나 복구합니다. Models 페이지 또는 daemon의 <code>DEEPSEEK_API_KEY</code>에서 키를 설정할 수 있습니다.</p>
      <p>이후 composer에서 Harness의 모델과 추론 강도를 선택할 수 있습니다. 전체 과정은 <a href="/agents/deepseek-harness-design/">DeepSeek Harness 디자인 가이드</a>에서 확인하세요.</p>
      <h2>아이디어에서 프로젝트로 바로 이동</h2>
      <p>Home의 생성 유형과 workspace 제어도 새로워졌습니다. 로컬 프로젝트는 Cloud identity를 기다리지 않고 제출 직후 Preparing 상태로 들어가며, 생성이 실패하면 전환을 깔끔하게 되돌립니다.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Home의 아이디어가 Preparing을 지나 작업 가능한 디자인 프로젝트에 도착하는 흐름" /><figcaption>제출 즉시 프로젝트로 이동하고, 제한된 백그라운드 작업이 큰 workspace의 응답성을 지킵니다.</figcaption></figure>
      <h2>복구와 대규모 팀 안정성</h2>
      <p>만료된 Cloud 자격 증명은 기존 로그인 흐름으로 돌아가며 CLI에서는 <code>od amr status</code>와 <code>od amr logout</code>을 사용할 수 있습니다. 공유 리소스 pull은 배치 처리되고 sync fan-out, scan, archive, push queue에는 명확한 한계가 적용됩니다.</p>
      <h2>그 밖의 0.19.1</h2>
      <ul><li>새 이미지와 비디오는 자동으로 preview에서 열리고, 지정한 artifact는 제자리에서 갱신됩니다.</li><li>standalone HTML export가 더 안정적입니다.</li><li>Cloudflare Kumo UI가 design-system catalog에 추가되었습니다.</li><li><code>od mcp install claude-desktop</code>이 macOS와 Windows를 지원합니다.</li><li>중복 제출, 오래된 recovery card, workspace scope 오류가 수정되었습니다.</li></ul>
      <h2>다음 단계</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">OpenDesign 0.19.1을 다운로드</a>하고 공식 <code>dsh</code> CLI와 연결 구성 요소를 설치한 뒤 첫 디자인 brief를 실행해 보세요.</p>
  de:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1 integriert DeepSeek Harness als native Design-Runtime erster Klasse – mit Live-Modell- und Reasoning-Erkennung, strukturiertem Streaming, Sitzungsfortsetzung, zuverlässigem Abbruch und schnellerem Projektstart.'
    category: 'Produkt'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, Codename „Design with DeepSeek Harness“. Die offizielle <code>dsh</code>-CLI ist nicht nur ein weiteres verbundenes Agent-Tool, sondern eine native Runtime, die OpenDesign direkt startet, fortsetzt und bis zur Designausgabe begleitet.</p>
      <p>Alle Stabilitätsänderungen stehen im <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">0.19.1 changelog</a>. Hier geht es um DeepSeek Harness und den kürzeren Weg von Home ins Projekt.</p>
      <h2>DeepSeek Harness als native Runtime</h2>
      <p>OpenDesign startet die offizielle <code>dsh</code>-CLI direkt und kommuniziert über einen strukturierten JSONL-Stream. Modelle und Reasoning-Stufen werden live aus Harness gelesen; Fortschritt, Ergebnisse und Fehler gelangen als klare Ereignisse in das Projekt.</p>
      <p>Sitzungen lassen sich nativ fortsetzen. Abbruch funktioniert während Start, Ausführung und Wiederherstellung. Bei fehlendem API key, falscher Version oder inkompatiblem Open-Design-Profil erscheinen konkrete Diagnosen und Reparaturschritte.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Ein Kommandozeilen-Impuls fließt durch eine blaue native Runtime in eine Designfläche" /><figcaption>Modellerkennung, Reasoning-Auswahl, strukturierter Stream, Resume und Cancel liegen in einer nativen Verbindung.</figcaption></figure>
      <h2>Verbindung mit einem Befehl einrichten</h2>
      <p>Nach der offiziellen DeepSeek-Harness-Installation genügt <code>od agent setup deepseek-harness</code>. OpenDesign installiert oder repariert die geprüfte Verbindungskomponente. Der Schlüssel wird auf der Models-Seite oder als <code>DEEPSEEK_API_KEY</code> für den daemon hinterlegt.</p>
      <p>Danach stehen Harness-Modelle und Reasoning-Stufen direkt im composer bereit. Die vollständige Anleitung findest du im <a href="/agents/deepseek-harness-design/">DeepSeek-Harness-Design-Guide</a>.</p>
      <h2>Vom Gedanken sofort ins Projekt</h2>
      <p>Home erhält klarere Erstellungstypen und direktere workspace controls. Lokale Projekte warten nicht mehr auf eine Cloud identity; nach dem Absenden öffnet sich sofort der Preparing-Zustand und wird bei einem Fehler sauber zurückgerollt.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Eine Idee gelangt über Preparing direkt in ein arbeitsfähiges Designprojekt" /><figcaption>Sofort ins Projekt; begrenzte Hintergrundarbeit hält große workspaces reaktionsfähig.</figcaption></figure>
      <h2>Wiederherstellung und Stabilität für große Teams</h2>
      <p>Abgelaufene Cloud-Anmeldungen führen zurück zum Sign-in; in headless Umgebungen helfen <code>od amr status</code> und <code>od amr logout</code>. Gemeinsame Ressourcen werden gebündelt geladen, während sync fan-out, Scans, Archive und push queues feste Grenzen erhalten.</p>
      <h2>Weitere Verbesserungen in 0.19.1</h2>
      <ul><li>Neue Bilder und Videos öffnen automatisch in der preview; benannte artifacts werden direkt aktualisiert.</li><li>Standalone-HTML-Export ist zuverlässiger.</li><li>Cloudflare Kumo UI ergänzt den Design-System-Katalog.</li><li><code>od mcp install claude-desktop</code> unterstützt macOS und Windows.</li><li>Doppelte Sends, alte Recovery-Karten und workspace-scope-Fehler wurden behoben.</li></ul>
      <h2>Der nächste Schritt</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">OpenDesign 0.19.1 herunterladen</a>, die offizielle <code>dsh</code>-CLI installieren, die Verbindung einrichten und den ersten echten Design-Brief starten.</p>
  fr:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: "OpenDesign 0.19.1 fait de DeepSeek Harness un runtime de design natif de premier plan, avec découverte en direct des modèles et du raisonnement, streaming structuré, reprise de session, annulation fiable et création de projet plus rapide."
    category: 'Produit'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, nom de code « Design with DeepSeek Harness ». Le CLI officiel <code>dsh</code> n’est plus un simple Agent connecté : OpenDesign peut le lancer directement, poursuivre la conversation et mener le design jusqu’à sa livraison.</p>
      <p>Les changements complets de stabilité figurent dans le <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">changelog 0.19.1</a>. Ici, nous nous concentrons sur DeepSeek Harness et le passage plus rapide de Home au projet.</p>
      <h2>DeepSeek Harness devient un runtime natif</h2>
      <p>OpenDesign lance directement le CLI officiel <code>dsh</code> et communique par flux JSONL structuré. Les modèles et niveaux de raisonnement viennent des capacités publiées en direct par Harness ; progression, résultats et erreurs arrivent dans le projet sous forme d’événements explicites.</p>
      <p>La reprise de session est native et l’annulation couvre le démarrage, l’exécution et la récupération. Une clé absente, une version non testée ou un profil incompatible déclenche un diagnostic précis avec une action corrective.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Une commande traverse un runtime natif bleu avant d’atteindre un canvas de design" /><figcaption>Modèles, niveau de raisonnement, flux structuré, reprise et annulation partagent la même connexion native.</figcaption></figure>
      <h2>Installer ou réparer la connexion en une commande</h2>
      <p>Après avoir installé DeepSeek Harness, lancez <code>od agent setup deepseek-harness</code>. OpenDesign installe ou répare son composant de connexion vérifié. La clé se configure sur la page Models ou via <code>DEEPSEEK_API_KEY</code> dans le daemon.</p>
      <p>Les modèles et niveaux de raisonnement Harness deviennent ensuite disponibles dans le composer. Le parcours complet est décrit dans le <a href="/agents/deepseek-harness-design/">guide de design DeepSeek Harness</a>.</p>
      <h2>De l’idée au projet sans attendre</h2>
      <p>Home propose aussi des types de création plus clairs et des contrôles workspace plus directs. Un projet local n’attend plus l’identité Cloud ; après l’envoi, il passe immédiatement à Preparing et revient proprement en arrière si la création échoue.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Une idée traverse Preparing et entre directement dans un projet de design actif" /><figcaption>Entrée immédiate dans le projet ; des tâches de fond bornées gardent les grands workspaces réactifs.</figcaption></figure>
      <h2>Récupération et stabilité à l’échelle</h2>
      <p>Une session Cloud expirée revient au sign-in ; <code>od amr status</code> et <code>od amr logout</code> couvrent les environnements headless. Les ressources partagées sont récupérées par lots, avec des limites sur le sync fan-out, les scans, les archives et les push queues.</p>
      <h2>Les autres améliorations de 0.19.1</h2>
      <ul><li>Les nouvelles images et vidéos s’ouvrent automatiquement en preview ; un artifact nommé est mis à jour sur place.</li><li>L’export HTML autonome devient plus fiable.</li><li>Cloudflare Kumo UI rejoint le catalogue de design systems.</li><li><code>od mcp install claude-desktop</code> fonctionne sur macOS et Windows.</li><li>Les envois en double, anciennes cartes de récupération et erreurs de scope workspace sont corrigés.</li></ul>
      <h2>La suite</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">Téléchargez OpenDesign 0.19.1</a>, installez le CLI officiel <code>dsh</code>, configurez la connexion et confiez votre premier brief réel à DeepSeek Harness.</p>
  ru:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1 превращает DeepSeek Harness в полноценный нативный дизайн-рантайм с живым обнаружением моделей и режимов рассуждения, структурированным стримингом, продолжением сессий, надёжной отменой и более быстрым созданием проектов.'
    category: 'Продукт'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, кодовое имя «Design with DeepSeek Harness». Официальный CLI <code>dsh</code> становится не просто подключённым Agent, а нативным рантаймом, который OpenDesign запускает напрямую, продолжает между ходами и ведёт до готового дизайна.</p>
      <p>Все изменения стабильности описаны в <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">changelog 0.19.1</a>. Здесь — DeepSeek Harness и более быстрый переход с Home в проект.</p>
      <h2>DeepSeek Harness как нативный рантайм</h2>
      <p>OpenDesign напрямую запускает официальный <code>dsh</code> и общается через структурированный JSONL-поток. Модели и уровни рассуждения берутся из живых возможностей Harness, а прогресс, результаты и ошибки приходят в проект как явные события.</p>
      <p>Сессии продолжаются нативно, а отмена охватывает запуск, выполнение и восстановление. При проблемах с ключом, версией или профилем OpenDesign показывает точную диагностику и способ исправления.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Команда проходит через синий нативный рантайм в дизайн-холст" /><figcaption>Обнаружение моделей, выбор рассуждения, поток, resume и cancel объединены одной нативной связью.</figcaption></figure>
      <h2>Настройка одной командой</h2>
      <p>После установки официального DeepSeek Harness выполните <code>od agent setup deepseek-harness</code>. OpenDesign установит или восстановит проверенный компонент связи. Ключ задаётся на странице Models или через <code>DEEPSEEK_API_KEY</code> для daemon.</p>
      <p>После этого модели и уровни рассуждения Harness доступны в composer. Полный путь описан в <a href="/agents/deepseek-harness-design/">руководстве по дизайну с DeepSeek Harness</a>.</p>
      <h2>От идеи сразу к проекту</h2>
      <p>На Home появились более ясные типы создания и прямые workspace controls. Локальный проект больше не ждёт Cloud identity: после отправки сразу открывается Preparing, а при ошибке переход аккуратно откатывается.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Идея проходит через Preparing прямо в рабочий дизайн-проект" /><figcaption>Мгновенный вход в проект и ограниченная фоновая работа для стабильности больших workspace.</figcaption></figure>
      <h2>Восстановление и масштаб команды</h2>
      <p>Просроченная Cloud-сессия возвращает к sign-in; для headless доступны <code>od amr status</code> и <code>od amr logout</code>. Общие ресурсы загружаются пакетами, а sync fan-out, сканы, архивы и push queues получили чёткие пределы.</p>
      <h2>Другие улучшения 0.19.1</h2>
      <ul><li>Новые изображения и видео автоматически открываются в preview, а названный artifact обновляется на месте.</li><li>Standalone HTML export стал надёжнее.</li><li>Cloudflare Kumo UI добавлен в каталог design systems.</li><li><code>od mcp install claude-desktop</code> работает на macOS и Windows.</li><li>Исправлены дубли отправок, устаревшие recovery cards и ошибки workspace scope.</li></ul>
      <h2>Что дальше</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">Скачайте OpenDesign 0.19.1</a>, установите официальный <code>dsh</code>, настройте соединение и передайте DeepSeek Harness первый реальный дизайн-бриф.</p>
  es:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1 convierte DeepSeek Harness en un runtime de diseño nativo de primera clase, con detección en vivo de modelos y razonamiento, streaming estructurado, reanudación de sesión, cancelación fiable y creación de proyectos más rápida.'
    category: 'Producto'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, nombre en clave «Design with DeepSeek Harness». El CLI oficial <code>dsh</code> deja de ser otro Agent conectado y se convierte en un runtime nativo que OpenDesign inicia directamente, continúa entre turnos y lleva hasta la entrega.</p>
      <p>Todos los cambios de estabilidad están en el <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">changelog de 0.19.1</a>. Aquí nos centramos en DeepSeek Harness y en el paso más rápido de Home al proyecto.</p>
      <h2>DeepSeek Harness como runtime nativo</h2>
      <p>OpenDesign ejecuta el <code>dsh</code> oficial y se comunica mediante un flujo JSONL estructurado. Los modelos y niveles de razonamiento proceden de las capacidades en vivo de Harness; el progreso, los resultados y los errores llegan al proyecto como eventos claros.</p>
      <p>Las sesiones se reanudan de forma nativa y la cancelación cubre inicio, ejecución y recuperación. Si faltan credenciales o hay incompatibilidad de versión o perfil, OpenDesign muestra un diagnóstico concreto y cómo solucionarlo.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Una orden pasa por un runtime nativo azul hasta un lienzo de diseño" /><figcaption>Modelos, razonamiento, streaming, reanudación y cancelación comparten una conexión nativa.</figcaption></figure>
      <h2>Configura la conexión con un comando</h2>
      <p>Tras instalar DeepSeek Harness, ejecuta <code>od agent setup deepseek-harness</code>. OpenDesign instala o repara el componente de conexión verificado. La clave se configura en Models o con <code>DEEPSEEK_API_KEY</code> para el daemon.</p>
      <p>Después podrás elegir modelos y niveles de razonamiento de Harness en el composer. Consulta la <a href="/agents/deepseek-harness-design/">guía de diseño con DeepSeek Harness</a>.</p>
      <h2>De la idea al proyecto sin esperar</h2>
      <p>Home incorpora tipos de creación más claros y controles workspace más directos. Los proyectos locales ya no esperan una Cloud identity: tras enviar, entran directamente en Preparing y revierten limpiamente si la creación falla.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Una idea cruza Preparing y llega directamente a un proyecto de diseño activo" /><figcaption>Entrada inmediata al proyecto y trabajo de fondo limitado para mantener ágiles los workspace grandes.</figcaption></figure>
      <h2>Recuperación y estabilidad a escala</h2>
      <p>Una sesión Cloud caducada vuelve al sign-in; en entornos headless están disponibles <code>od amr status</code> y <code>od amr logout</code>. Los recursos compartidos se obtienen por lotes y sync fan-out, escaneos, archivos y push queues tienen límites definidos.</p>
      <h2>Más mejoras de 0.19.1</h2>
      <ul><li>Las imágenes y vídeos nuevos se abren automáticamente en preview y un artifact nombrado se actualiza en su lugar.</li><li>El standalone HTML export es más fiable.</li><li>Cloudflare Kumo UI llega al catálogo de design systems.</li><li><code>od mcp install claude-desktop</code> funciona en macOS y Windows.</li><li>Se corrigen envíos duplicados, recovery cards antiguas y errores de workspace scope.</li></ul>
      <h2>Qué hacer ahora</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">Descarga OpenDesign 0.19.1</a>, instala el <code>dsh</code> oficial, configura la conexión y entrega tu primer brief real a DeepSeek Harness.</p>
  pt-br:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'O OpenDesign 0.19.1 transforma o DeepSeek Harness em runtime de design nativo de primeira classe, com descoberta ao vivo de modelos e raciocínio, streaming estruturado, retomada de sessão, cancelamento confiável e criação de projetos mais rápida.'
    category: 'Produto'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, codinome “Design with DeepSeek Harness”. O CLI oficial <code>dsh</code> deixa de ser apenas outro Agent conectado e passa a ser um runtime nativo que o OpenDesign inicia, continua entre turnos e conduz até a entrega.</p>
      <p>Todas as mudanças de estabilidade estão no <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">changelog do 0.19.1</a>. Aqui, o foco é DeepSeek Harness e a passagem mais rápida da Home para o projeto.</p>
      <h2>DeepSeek Harness como runtime nativo</h2>
      <p>O OpenDesign inicia o <code>dsh</code> oficial e se comunica por um fluxo JSONL estruturado. Modelos e níveis de raciocínio vêm das capacidades ao vivo do Harness; progresso, resultados e erros chegam ao projeto como eventos claros.</p>
      <p>As sessões retomam nativamente, e o cancelamento cobre inicialização, execução e recuperação. Problemas de chave, versão ou profile mostram diagnóstico específico e uma ação de correção.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Um comando passa por um runtime nativo azul até um canvas de design" /><figcaption>Modelos, raciocínio, streaming, retomada e cancelamento compartilham uma conexão nativa.</figcaption></figure>
      <h2>Configure a conexão com um comando</h2>
      <p>Depois de instalar o DeepSeek Harness oficial, rode <code>od agent setup deepseek-harness</code>. O OpenDesign instala ou repara o componente de conexão verificado. A chave entra na página Models ou em <code>DEEPSEEK_API_KEY</code> para o daemon.</p>
      <p>Em seguida, modelos e níveis de raciocínio ficam disponíveis no composer. Veja o <a href="/agents/deepseek-harness-design/">guia de design com DeepSeek Harness</a>.</p>
      <h2>Da ideia ao projeto sem esperar</h2>
      <p>A Home ganha tipos de criação mais claros e controles workspace mais diretos. Projetos locais não esperam mais uma Cloud identity: após o envio, entram direto em Preparing e fazem rollback limpo se a criação falhar.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Uma ideia atravessa Preparing e entra diretamente em um projeto de design ativo" /><figcaption>Entrada imediata no projeto e trabalho em segundo plano limitado para workspaces grandes.</figcaption></figure>
      <h2>Recuperação e estabilidade em escala</h2>
      <p>Uma sessão Cloud expirada volta ao sign-in; ambientes headless ganham <code>od amr status</code> e <code>od amr logout</code>. Recursos compartilhados são puxados em lotes, e sync fan-out, scans, archives e push queues recebem limites claros.</p>
      <h2>Outras melhorias do 0.19.1</h2>
      <ul><li>Novas imagens e vídeos abrem automaticamente no preview, e um artifact nomeado é atualizado no lugar.</li><li>O standalone HTML export está mais confiável.</li><li>Cloudflare Kumo UI entra no catálogo de design systems.</li><li><code>od mcp install claude-desktop</code> funciona no macOS e Windows.</li><li>Envios duplicados, recovery cards antigas e erros de workspace scope foram corrigidos.</li></ul>
      <h2>Próximo passo</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">Baixe o OpenDesign 0.19.1</a>, instale o <code>dsh</code> oficial, configure a conexão e entregue seu primeiro brief real ao DeepSeek Harness.</p>
  it:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1 rende DeepSeek Harness un runtime di design nativo di prima classe, con rilevamento live di modelli e reasoning, streaming strutturato, ripresa delle sessioni, annullamento affidabile e creazione dei progetti più rapida.'
    category: 'Prodotto'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, nome in codice “Design with DeepSeek Harness”. La CLI ufficiale <code>dsh</code> non è più soltanto un altro Agent collegato: diventa un runtime nativo che OpenDesign avvia direttamente, riprende tra i turni e accompagna fino alla consegna.</p>
      <p>Tutte le modifiche di stabilità sono nel <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">changelog 0.19.1</a>. Qui ci concentriamo su DeepSeek Harness e sul percorso più rapido da Home al progetto.</p>
      <h2>DeepSeek Harness come runtime nativo</h2>
      <p>OpenDesign avvia la CLI ufficiale <code>dsh</code> e comunica con un flusso JSONL strutturato. Modelli e livelli di reasoning arrivano dalle capacità live di Harness; avanzamento, risultati ed errori entrano nel progetto come eventi chiari.</p>
      <p>Le sessioni riprendono in modo nativo e l’annullamento copre avvio, esecuzione e recupero. Problemi con chiave, versione o profile producono una diagnosi precisa e un’azione di riparazione.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Un comando attraversa un runtime nativo blu e raggiunge un canvas di design" /><figcaption>Modelli, reasoning, streaming, ripresa e annullamento condividono una connessione nativa.</figcaption></figure>
      <h2>Configura la connessione con un comando</h2>
      <p>Dopo aver installato DeepSeek Harness, esegui <code>od agent setup deepseek-harness</code>. OpenDesign installa o ripara il componente di connessione verificato. La chiave si imposta nella pagina Models o tramite <code>DEEPSEEK_API_KEY</code> per il daemon.</p>
      <p>Poi modelli e livelli di reasoning sono disponibili nel composer. Consulta la <a href="/agents/deepseek-harness-design/">guida al design con DeepSeek Harness</a>.</p>
      <h2>Dall’idea al progetto senza attese</h2>
      <p>Home offre tipi di creazione più chiari e controlli workspace più diretti. I progetti locali non aspettano più una Cloud identity: dopo l’invio entrano subito in Preparing e tornano indietro in modo pulito se la creazione fallisce.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Un’idea attraversa Preparing ed entra direttamente in un progetto di design attivo" /><figcaption>Ingresso immediato nel progetto e lavoro in background limitato per mantenere reattivi i workspace grandi.</figcaption></figure>
      <h2>Recupero e stabilità su larga scala</h2>
      <p>Una sessione Cloud scaduta torna al sign-in; in headless sono disponibili <code>od amr status</code> e <code>od amr logout</code>. Le risorse condivise vengono caricate in batch, con limiti per sync fan-out, scansioni, archivi e push queue.</p>
      <h2>Altri miglioramenti di 0.19.1</h2>
      <ul><li>Nuove immagini e video si aprono automaticamente in preview; un artifact nominato viene aggiornato sul posto.</li><li>Lo standalone HTML export è più affidabile.</li><li>Cloudflare Kumo UI entra nel catalogo dei design system.</li><li><code>od mcp install claude-desktop</code> funziona su macOS e Windows.</li><li>Corretti invii duplicati, recovery card obsolete ed errori di workspace scope.</li></ul>
      <h2>Prossimo passo</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">Scarica OpenDesign 0.19.1</a>, installa il <code>dsh</code> ufficiale, configura la connessione e affida a DeepSeek Harness il primo brief reale.</p>
  tr:
    title: 'OpenDesign 0.19.1: Design with DeepSeek Harness'
    summary: 'OpenDesign 0.19.1, DeepSeek Harness’ı canlı model ve reasoning keşfi, yapılandırılmış akış, oturum devamı, güvenilir iptal ve daha hızlı proje oluşturma ile birinci sınıf yerel tasarım runtime’ına dönüştürüyor.'
    category: 'Ürün'
    bodyHtml: |
      <p><code>open-design-v0.19.1</code>, kod adı “Design with DeepSeek Harness”. Resmî <code>dsh</code> CLI artık yalnızca bağlı başka bir Agent değil; OpenDesign’ın doğrudan başlattığı, turlar arasında sürdürdüğü ve tasarımı teslimata taşıdığı yerel bir runtime.</p>
      <p>Tüm kararlılık değişiklikleri <a href="https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md">0.19.1 changelog</a> içinde. Burada DeepSeek Harness ve Home’dan projeye daha hızlı geçişe odaklanıyoruz.</p>
      <h2>Yerel runtime olarak DeepSeek Harness</h2>
      <p>OpenDesign resmî <code>dsh</code> CLI’ı doğrudan başlatır ve yapılandırılmış JSONL akışıyla iletişim kurar. Modeller ve reasoning seviyeleri Harness’ın canlı yeteneklerinden gelir; ilerleme, sonuç ve hatalar projeye açık olaylar olarak ulaşır.</p>
      <p>Oturumlar yerel olarak sürdürülür; iptal başlatma, yürütme ve kurtarma aşamalarını kapsar. Anahtar, sürüm veya profile sorunu varsa açık tanı ve onarım adımı gösterilir.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="Bir komut mavi yerel runtime üzerinden tasarım tuvaline akar" /><figcaption>Model keşfi, reasoning seçimi, yapılandırılmış akış, devam ve iptal tek yerel bağlantıda buluşur.</figcaption></figure>
      <h2>Bağlantıyı tek komutla kurun</h2>
      <p>Resmî DeepSeek Harness’ı yükledikten sonra <code>od agent setup deepseek-harness</code> çalıştırın. OpenDesign doğrulanmış bağlantı bileşenini yükler veya onarır. Anahtar Models sayfasından ya da daemon için <code>DEEPSEEK_API_KEY</code> ile verilir.</p>
      <p>Ardından Harness modelleri ve reasoning seviyeleri composer içinde seçilebilir. Ayrıntılar için <a href="/agents/deepseek-harness-design/">DeepSeek Harness tasarım rehberine</a> bakın.</p>
      <h2>Fikirden projeye beklemeden</h2>
      <p>Home daha anlaşılır oluşturma türleri ve doğrudan workspace kontrolleri sunuyor. Yerel projeler Cloud identity beklemiyor; gönderimden sonra hemen Preparing durumuna giriyor ve oluşturma başarısız olursa temizce geri dönüyor.</p>
      <figure><img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="Bir fikir Preparing üzerinden doğrudan aktif tasarım projesine girer" /><figcaption>Projeye anında giriş; sınırlı arka plan işi büyük workspace’leri duyarlı tutar.</figcaption></figure>
      <h2>Kurtarma ve ölçekli ekip kararlılığı</h2>
      <p>Süresi dolan Cloud oturumu sign-in akışına döner; headless ortamlar <code>od amr status</code> ve <code>od amr logout</code> kullanabilir. Paylaşılan kaynaklar toplu çekilir; sync fan-out, tarama, arşiv ve push queue’lar net sınırlar kazanır.</p>
      <h2>0.19.1’deki diğer iyileştirmeler</h2>
      <ul><li>Yeni görsel ve videolar preview’da otomatik açılır; adı verilen artifact yerinde güncellenir.</li><li>Standalone HTML export daha güvenilirdir.</li><li>Cloudflare Kumo UI design-system kataloğuna eklendi.</li><li><code>od mcp install claude-desktop</code> macOS ve Windows’ta çalışır.</li><li>Yinelenen gönderimler, eski recovery card’lar ve workspace scope hataları düzeltildi.</li></ul>
      <h2>Sıradaki adım</h2>
      <p><a href="/download/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202608_0_19_1&amp;utm_content=official">OpenDesign 0.19.1’i indirin</a>, resmî <code>dsh</code> CLI’ı yükleyin, bağlantıyı kurun ve ilk gerçek tasarım brief’ini DeepSeek Harness’a verin.</p>
---

`open-design-v0.19.1`, codename **“Design with DeepSeek Harness.”** This release makes the official `dsh` CLI more than another agent OpenDesign can connect to. DeepSeek Harness is now a first-class native runtime that OpenDesign can launch directly, continue across turns, and carry all the way to a finished design.

The [complete 0.19.1 changelog](https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md) covers every stability and workspace change. This is the product story: how DeepSeek Harness enters the OpenDesign loop, and how the wait between an idea on Home and a working project gets shorter again.

## DeepSeek Harness is a native design runtime

OpenDesign now launches DeepSeek Harness through the official `dsh` CLI. The connection uses a structured JSONL stream instead of treating terminal text as an opaque transcript. The model catalog and reasoning options come from the capabilities Harness publishes live, while progress, artifacts, and errors arrive in the project as explicit events.

Sessions resume natively. Cancellation stays authoritative through startup, execution, and recovery, and it cleans up the corresponding process tree on macOS and Windows. If the API key is missing, the installed version is untested, or the OpenDesign profile is incompatible, the app surfaces a specific diagnostic and a repair action instead of letting the run fail silently.

<figure>
  <img src="/blog/open-design-0-19-1-design-with-deepseek-harness-runtime.webp" alt="A command-line prompt passes through a blue native runtime connection into a design canvas, surrounded by controls for model discovery, reasoning selection, session resume, and cancellation" />
  <figcaption>Live model discovery, reasoning selection, structured streaming, resume, and cancel all belong to one native runtime connection.</figcaption>
</figure>

## Install or repair the connection with one command

Install the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), then run:

```bash
od agent setup deepseek-harness
```

OpenDesign installs the verified connection component bundled with the desktop app. If the `open-design` profile is already present but incompatible, the same command repairs it. Add your DeepSeek API key on the Models page, or expose `DEEPSEEK_API_KEY` to the OpenDesign daemon.

Once setup completes, choose DeepSeek Harness like any other agent. Its live models and supported reasoning efforts appear in the composer. The [DeepSeek Harness design guide](/agents/deepseek-harness-design/) walks through installation, workflow, visual direction, critique, and delivery.

## Move from an idea into the project immediately

0.19.1 also refreshes the creation-type row and workspace controls on Home. A local project no longer waits for a Cloud workspace identity before it can start. After you submit, OpenDesign moves directly into the new project’s Preparing state and rolls the transition back cleanly if creation fails. Cloud projects keep the balance and identity checks they actually need.

<figure>
  <img src="/blog/open-design-0-19-1-design-with-deepseek-harness-flow.webp" alt="An idea card moves through a Preparing doorway into a working design project while bounded queues keep shared workspace resources synchronized below" />
  <figcaption>Enter the project as soon as you submit; bounded background work keeps a growing workspace responsive.</figcaption>
</figure>

That shorter entry path matters with Harness. You can choose the runtime, model, and reasoning level, send a real brief, and watch the first structured events arrive without waiting at a workspace gate that does not apply to the project.

## Recovery gets stronger as the team gets larger

An expired OpenDesign Cloud session now clears invalid credentials and returns to the existing sign-in flow. Headless operators can use `od amr status` and `od amr logout` to inspect or reset authentication. Transient workspace-authority failures retry safely without duplicating the original request.

Large team projects now batch shared-resource pulls, cap sync fan-out, cache workspace-authority reads safely, and put explicit limits on scans, archives, and push queues. As the workspace grows, sync stays steadier and memory pressure stays bounded.

## What else lands in 0.19.1

- **Generated work opens where you expect it** — new image and video outputs open in preview automatically. When an agent explicitly names an existing artifact, the write updates that file in place instead of making a numbered duplicate.
- **Standalone HTML export is more reliable** — the single-file handoff path is safer to deliver and open offline.
- **Cloudflare Kumo UI joins the design-system catalog**, ready to use as a visual foundation for generated interfaces.
- **Claude Desktop setup gets a direct path** — `od mcp install claude-desktop` configures OpenDesign on macOS and Windows.
- **Project context is more accurate** — Home search includes personal projects, Community templates retain their original project type, and MCP resource reads follow the signed-in workspace.
- **Run recovery is harder to confuse** — repeated sends no longer enqueue duplicate requests, a successful run cannot be turned back into a failure by an old tool error, and stale message writes cannot replace the daemon’s canonical events.
- **Message Center stays in context** — rows expand and collapse in place instead of replacing the list.

## Where to start

| If you want to… | Start here |
|---|---|
| Design with DeepSeek Harness | Install the official `dsh` CLI, run `od agent setup deepseek-harness`, add your key, then select Harness in the composer |
| Control how the model works | Choose one of the live models and a reasoning effort published for that model before sending the brief |
| Continue a design conversation | Reopen the project and send the next turn; the native Harness session resumes behind the same conversation |
| Stop a run cleanly | Cancel from OpenDesign; startup, execution, recovery, and the child process tree follow the same cancellation state |
| Start a local project quickly | Submit from Home and continue in Preparing without waiting for a Cloud workspace identity |

## What to do next

[Download OpenDesign 0.19.1](/download/?utm_source=blog&utm_medium=docs&utm_campaign=202608_0_19_1&utm_content=official), install the official `dsh` CLI, run `od agent setup deepseek-harness`, and give DeepSeek Harness your first real design brief.

Thank you to everyone who contributed to 0.19.1. See the [native DeepSeek Harness runtime change](https://github.com/nexu-io/open-design/commit/f9fe73c8) and the [complete changelog](https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.19.1/en.md) for the implementation details and credits.

## Related reading

- [Design with DeepSeek Harness: the agent-native workflow](/agents/deepseek-harness-design/)
- [OpenDesign 0.18.0: design team workspace, now in Codex](/blog/open-design-0-18-0-design-team-workspace-codex/)
- [OpenDesign 0.17.0: OpenDesign for Codex](/blog/open-design-0-17-0-open-design-for-codex/)
