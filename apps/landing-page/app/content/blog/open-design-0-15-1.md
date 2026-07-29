---
title: "Open Design 0.15.1 — Sharper Vision, Longer Flow"
date: 2026-07-17
category: "Product"
readingTime: 3
summary: "0.15.1 sharpens the OpenDesign Agent: finer image detail, smoother long-session recovery, in-chat clarifying questions, and more model runtimes — plus HTML, deck-export, and desktop fixes."
socialImage: "/blog/open-design-0-15-1-cover.webp"
ctaKind: download-app
ctaTitle: "Update to Open Design 0.15.1"
ctaBody: "Free, open-source, local-first. macOS and Windows builds are live."
ctaLabel: "Download 0.15.1"
ctaHref: "https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_15_1&utm_content=official"
i18n:
  zh:
    title: 'Open Design 0.15.1：看得更清，跑得更久'
    summary: '0.15.1 打磨的是 OpenDesign Agent：图像细节更清晰、长会话更扛得住、也更容易恢复，需要跟你确认的问题直接留在对话里、可用的模型运行时更多——另有 HTML、演示导出与桌面端的一批修复。'
    category: '产品'
    bodyHtml: |
      <p>Open Design 0.15.1 是一次围绕运行时的发布。我们升级了内置的 <strong>OpenDesign Agent</strong>：多模态模型能看到图像里更多的细节，长时间的工作会话更不容易散架、也更容易恢复，而日常流程——确认追问、模型选择、导出——则安静地退到一边。它让 <a href="/blog/what-is-vibe-design/">vibe design</a> 的循环——提出、查看、打磨——一路无摩擦地转下去。</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">下载 0.15.1</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">完整发布说明</a></p>

      <h2>你的 agent 把图看得更清楚了</h2>
      <p>OpenDesign Agent 现在会把图像里真正存在的细节更完整地交给多模态模型。截图分析、视觉评审、以图驱动的设计任务因此更可靠——模型依据的是你眼睛看到的那张图，而不是它的模糊版本。</p>

      <h2>长会话保持连贯，也能自己恢复</h2>
      <p>长时间的工作更不容易丢失上下文。本次发布改进了会话回放、流式与上下文溢出的恢复方式，以及有用的上下文在压缩后如何存活，让一次长时间的 agent 运行能沿着正轨走完，而不是中途提前结束。真的被打断时——比如运行时瞬间关闭、恢复过程读到 EOF——agent 会清掉失效会话并沿恢复路径继续，而不是直接把这次任务丢掉。</p>

      <h2>需要确认的问题就留在对话里</h2>
      <p>关于演示与原型方向的追问，现在用的是可以对比、刷新、展开的可视化选项，全程不用离开对话。提交后的答案——包括多选的那种——会折叠成一段可读的简报，于是这些来回本身成了记录的一部分，而不是一段岔路。</p>

      <h2>更多模型，更干净的记忆</h2>
      <p>把合适的模型和资料带进项目：0.15.1 新增 <strong>AtomCode</strong> 作为 agent 运行时、一份 <strong>SiliconFlow Global BYOK</strong> 预设——这方面可以看我们的 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 设计工作流</a>指南——以及 AMR 的<strong>并行网页搜索</strong>。记忆也从更干净的状态起步，并且由你说了算——「从对话中学习」现在默认关闭，而你已有的记忆、工作画像、手动条目和连接器导入的内容都原样保留。</p>

      <h2>一大批修复</h2>
      <p>在这些重点工作之下，0.15.1 还清掉了一长串毛刺：</p>
      <ul>
        <li><strong>HTML 与预览</strong>——分析成功不再被显示成任务失败（纯文本回答不再出现 <code>ARTIFACT_NOT_FOUND</code>），plan 模式的 HTML 会自动打开，大型预览会带着完整源码刷新，重定向循环也不再卡死预览。</li>
        <li><strong>演示与导出</strong>——多页 PPT/PDF 导出会包含每一页，图片和 PDF 不再和文字叠在一起，可编辑的 PPTX 保留中日韩字体，缩略图也不会再消失。</li>
        <li><strong>BYOK 与模型</strong>——权限弹窗不再挡住已支持的 BYOK 运行，服务商返回「Not Found」时会干净地停下，<code>od media generate</code> 也按文档所写接受提示词文件。</li>
        <li><strong>桌面端稳定性</strong>——内置数据库二进制与打包运行时匹配，重新启动可以先结束掉不兼容的旧进程，并发的素材库导入会去重而不是直接报错。</li>
      </ul>

      <h2>今天就更新</h2>
      <p>0.15.1 免费、开源、本地优先。</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">下载 0.15.1</a></p>
  ja:
    title: 'Open Design 0.15.1 — より鮮明な視界、より長いフロー'
    summary: '0.15.1 は OpenDesign Agent を磨き上げます。画像のディテールをより細かく捉え、長時間セッションの復帰がスムーズになり、確認のための質問がチャット内に収まり、対応するモデルランタイムも増えました。あわせて HTML・スライド書き出し・デスクトップの修正も。'
    category: 'プロダクト'
    bodyHtml: |
      <p>Open Design 0.15.1 はランタイムに焦点を当てたリリースです。組み込みの <strong>OpenDesign Agent</strong> を強化し、マルチモーダルモデルが画像のディテールをより多く読み取れるようにしました。長時間の作業セッションはまとまりを保ち、より確実に復帰します。そして日々の流れ — 確認のための質問、モデルの選択、書き出し — は邪魔をしません。<a href="/blog/what-is-vibe-design/">vibe design</a> のループ — 指示し、見て、磨く — が摩擦なく回り続けます。</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1 をダウンロード</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">リリースノート全文</a></p>

      <h2>エージェントが画像をより鮮明に見る</h2>
      <p>OpenDesign Agent は、画像に実際に含まれているディテールをより多くマルチモーダルモデルへ渡すようになりました。スクリーンショットの分析、ビジュアルの批評、画像起点のデザイン作業がより頼れるものになります。モデルが見ているのは、ぼやけた版ではなく、あなたが見ているそのままの画像です。</p>

      <h2>長いセッションは筋を保ち、そして復帰する</h2>
      <p>長時間の作業で現在地を見失いにくくなりました。本リリースではセッションの再生、ストリームとコンテキスト溢れからの復帰、そして圧縮後に有用なコンテキストがどれだけ残るかを改善しています。長いエージェント実行が途中で打ち切られず、道筋を保ったまま進みます。実際に中断が起きたとき — 一時的なランタイム終了や再開時の EOF — もエージェントは古いセッションを片付け、復帰経路をたどって作業を続けます。</p>

      <h2>確認の質問はチャットの中で完結する</h2>
      <p>スライドやプロトタイプの方向性を尋ねる質問は、見比べ・更新・展開ができるビジュアルな選択肢になりました。チャットを離れる必要はありません。送信した回答は — 複数選択も含めて — 読みやすいブリーフとしてたたまれ、このやりとり自体が記録の一部になります。寄り道ではなくなりました。</p>

      <h2>モデルを増やし、記憶をきれいに</h2>
      <p>ふさわしいモデルとリサーチをプロジェクトへ。0.15.1 では <strong>AtomCode</strong> がエージェントランタイムとして加わり、<strong>SiliconFlow Global の BYOK</strong> プリセット（詳しくは <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK デザインワークフロー</a>のガイドで）と、AMR の<strong>並列ウェブ検索</strong>が入りました。メモリーもきれいな状態から始まり、主導権はあなたにあります。「チャットから学習」は既定でオフになり、既存のメモリー、ワークプロファイル、手動で追加した項目、コネクタからの取り込みはそのまま残ります。</p>

      <h2>幅広い修正</h2>
      <p>目立つ変更の下で、0.15.1 は長い引っかかりのリストを片付けています。</p>
      <ul>
        <li><strong>HTML とプレビュー</strong> — 成功した分析が失敗したタスクのように見えることはなくなり（テキスト回答での <code>ARTIFACT_NOT_FOUND</code> は解消）、プランモードの HTML は自動で開き、大きなプレビューは完全なソースで更新され、リダイレクトループがプレビューを固めることもありません。</li>
        <li><strong>スライドと書き出し</strong> — 複数ページの PPT/PDF 書き出しに全ページが含まれ、画像と PDF がテキストと重ならず、編集可能な PPTX は日中韓のフォントを保ち、サムネイルが消えなくなりました。</li>
        <li><strong>BYOK とモデル</strong> — 権限の確認が対応済みの BYOK 実行を止めることはなくなり、プロバイダーの「Not Found」応答はきれいに終了し、<code>od media generate</code> はドキュメント通りプロンプトファイルを受け付けます。</li>
        <li><strong>デスクトップの信頼性</strong> — 同梱データベースのバイナリがパッケージのランタイムと一致し、再起動時に互換性のない古いプロセスを停止でき、同時に走るライブラリの取り込みはエラーではなく重複排除で処理されます。</li>
      </ul>

      <h2>今日アップデートを</h2>
      <p>0.15.1 は無料、オープンソース、ローカルファーストです。</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1 をダウンロード</a></p>
  ko:
    title: 'Open Design 0.15.1 — 더 또렷한 시야, 더 긴 몰입'
    summary: '0.15.1은 OpenDesign Agent를 다듬습니다. 이미지 디테일을 더 세밀하게 보고, 긴 세션의 복구가 매끄러워지고, 확인 질문이 채팅 안에 머물며, 사용할 수 있는 모델 런타임도 늘었습니다. 여기에 HTML·덱 내보내기·데스크톱 수정까지.'
    category: '제품'
    bodyHtml: |
      <p>Open Design 0.15.1은 런타임에 집중한 릴리스입니다. 내장 <strong>OpenDesign Agent</strong>를 개선해 멀티모달 모델이 이미지의 디테일을 더 많이 보도록 했고, 긴 작업 세션이 흐트러지지 않고 더 잘 복구되도록 했습니다. 그리고 일상의 흐름 — 확인 질문, 모델 선택, 내보내기 — 은 방해되지 않게 물러납니다. <a href="/blog/what-is-vibe-design/">vibe design</a> 루프 — 요청하고, 보고, 다듬는 — 가 마찰 없이 계속 돌아갑니다.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1 다운로드</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">전체 릴리스 노트</a></p>

      <h2>에이전트가 이미지를 더 또렷하게 봅니다</h2>
      <p>이제 OpenDesign Agent는 이미지에 실제로 담긴 디테일을 멀티모달 모델에 더 많이 넘깁니다. 스크린샷 분석, 비주얼 크리틱, 이미지 기반 디자인 작업이 한층 믿을 만해집니다. 모델이 보는 것은 흐릿한 사본이 아니라 여러분이 보는 그 화면입니다.</p>

      <h2>긴 세션이 맥락을 지키고, 스스로 복구합니다</h2>
      <p>오래 이어지는 작업이 자기 자리를 잃을 가능성이 줄었습니다. 이번 릴리스는 세션 재생, 스트림과 컨텍스트 오버플로 복구, 그리고 압축 이후 유용한 컨텍스트가 얼마나 살아남는지를 개선했습니다. 덕분에 긴 에이전트 실행이 도중에 끊기지 않고 궤도를 유지합니다. 실제로 무언가가 끼어들 때 — 일시적인 런타임 종료, 재개 중의 EOF — 에이전트는 낡은 세션을 정리하고 복구 경로를 따라 계속 진행합니다.</p>

      <h2>확인 질문은 대화 안에 남습니다</h2>
      <p>덱과 프로토타입 방향을 묻는 질문은 이제 비교하고, 새로고침하고, 펼쳐 볼 수 있는 시각적 선택지로 제시됩니다. 채팅을 떠날 필요가 없습니다. 제출한 답변은 — 다중 선택도 포함해 — 읽기 좋은 브리프로 접히고, 이 주고받음 자체가 기록의 일부가 됩니다. 더 이상 곁길이 아닙니다.</p>

      <h2>더 많은 모델, 더 깨끗한 메모리</h2>
      <p>알맞은 모델과 자료를 프로젝트로 가져오세요. 0.15.1은 <strong>AtomCode</strong>를 에이전트 런타임으로 추가하고, <strong>SiliconFlow Global BYOK</strong> 프리셋(자세한 내용은 <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK 디자인 워크플로</a> 가이드에서)과 AMR의 <strong>병렬 웹 검색</strong>을 더했습니다. 메모리도 더 깨끗하게 시작하고 통제권은 여러분에게 있습니다. “대화에서 학습”이 기본으로 꺼지고, 기존 메모리와 업무 프로필, 직접 추가한 항목, 커넥터로 가져온 내용은 그대로 남습니다.</p>

      <h2>폭넓은 수정</h2>
      <p>눈에 띄는 변화 아래에서 0.15.1은 긴 목록의 거친 부분을 정리했습니다.</p>
      <ul>
        <li><strong>HTML과 미리보기</strong> — 성공한 분석이 실패한 작업처럼 보이지 않고(텍스트 답변의 <code>ARTIFACT_NOT_FOUND</code> 해결), 플랜 모드 HTML이 자동으로 열리며, 큰 미리보기는 전체 소스와 함께 새로고침되고, 리디렉션 루프가 미리보기를 멈춰 세우지 않습니다.</li>
        <li><strong>덱과 내보내기</strong> — 여러 페이지 PPT/PDF 내보내기에 모든 슬라이드가 포함되고, 이미지와 PDF가 텍스트와 겹치지 않으며, 편집 가능한 PPTX가 CJK 서체를 유지하고, 썸네일이 사라지지 않습니다.</li>
        <li><strong>BYOK와 모델</strong> — 권한 확인창이 지원되는 BYOK 실행을 막지 않고, 제공자의 “Not Found” 응답이 깔끔하게 종료되며, <code>od media generate</code>가 문서대로 프롬프트 파일을 받습니다.</li>
        <li><strong>데스크톱 안정성</strong> — 번들 데이터베이스 바이너리가 패키징된 런타임과 일치하고, 재실행 시 호환되지 않는 이전 프로세스를 정리할 수 있으며, 동시에 진행되는 라이브러리 가져오기가 오류 대신 중복 제거로 처리됩니다.</li>
      </ul>

      <h2>오늘 업데이트하세요</h2>
      <p>0.15.1은 무료이고, 오픈소스이며, 로컬 우선입니다.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1 다운로드</a></p>
  de:
    title: 'Open Design 0.15.1 — schärferer Blick, längerer Flow'
    summary: '0.15.1 schärft den OpenDesign Agent: mehr Bilddetails, sanftere Wiederherstellung langer Sitzungen, Rückfragen direkt im Chat und mehr Modell-Runtimes — dazu Korrekturen an HTML, Deck-Export und Desktop.'
    category: 'Produkt'
    bodyHtml: |
      <p>Open Design 0.15.1 ist ein Release rund um die Runtime. Wir haben den eingebauten <strong>OpenDesign Agent</strong> überarbeitet: Multimodale Modelle sehen mehr von den Details eines Bildes, lange Arbeitssitzungen halten zusammen und erholen sich besser, und der Alltag — Rückfragen, Modellwahl, Exporte — bleibt einem aus dem Weg. Die <a href="/blog/what-is-vibe-design/">Vibe-Design</a>-Schleife — anfragen, sehen, verfeinern — läuft ohne Reibung weiter.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1 herunterladen</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Vollständige Release Notes</a></p>

      <h2>Ihr Agent sieht Bilder klarer</h2>
      <p>Der OpenDesign Agent übergibt multimodalen Modellen jetzt mehr von dem, was tatsächlich im Bild steckt. Screenshot-Analysen, visuelle Kritik und bildgetriebene Designaufgaben werden dadurch verlässlicher — das Modell arbeitet mit dem, was Sie sehen, und nicht mit einer verwaschenen Fassung davon.</p>

      <h2>Lange Sitzungen bleiben schlüssig — und erholen sich</h2>
      <p>Ausgedehnte Arbeit verliert seltener den Faden. Dieses Release verbessert die Wiedergabe von Sitzungen, die Erholung nach Stream- und Kontextüberläufen sowie das Überleben nützlichen Kontexts nach der Kompaktierung, damit ein langer Agent-Lauf auf Kurs bleibt statt vorzeitig zu enden. Und wenn doch etwas dazwischenkommt — ein kurzzeitig geschlossener Runtime, ein EOF beim Fortsetzen — räumt der Agent die veraltete Sitzung ab und läuft über seinen Wiederherstellungspfad weiter, statt den Auftrag fallen zu lassen.</p>

      <h2>Rückfragen bleiben im Gespräch</h2>
      <p>Fragen zur Richtung von Decks und Prototypen nutzen jetzt visuelle Auswahlmöglichkeiten, die Sie vergleichen, neu laden und aufklappen können, ohne den Chat zu verlassen. Abgeschickte Antworten — auch Mehrfachauswahlen — klappen zu einem lesbaren Briefing zusammen, sodass das Hin und Her Teil der Aufzeichnung wird statt ein Umweg.</p>

      <h2>Mehr Modelle, sauberere Erinnerungen</h2>
      <p>Holen Sie das passende Modell und die passende Recherche ins Projekt: 0.15.1 ergänzt <strong>AtomCode</strong> als Agent-Runtime, ein <strong>SiliconFlow Global BYOK</strong>-Preset — mehr dazu in unserem Leitfaden zum <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-Design-Workflow</a> — sowie <strong>parallele Websuche</strong> für AMR. Auch Memory startet sauberer und bleibt unter Ihrer Kontrolle: „Aus Chats lernen“ ist jetzt standardmäßig aus, während vorhandene Erinnerungen, Arbeitsprofil, manuelle Einträge und Connector-Importe erhalten bleiben.</p>

      <h2>Ein breiter Schwung an Korrekturen</h2>
      <p>Unter den großen Themen räumt 0.15.1 eine lange Liste rauer Kanten ab:</p>
      <ul>
        <li><strong>HTML &amp; Vorschauen</strong> — eine erfolgreiche Analyse sieht nicht länger wie eine gescheiterte Aufgabe aus (<code>ARTIFACT_NOT_FOUND</code> bei Textantworten ist weg), HTML aus dem Plan-Modus öffnet sich automatisch, große Vorschauen laden mit vollständigem Quelltext neu, und Weiterleitungsschleifen frieren die Vorschau nicht mehr ein.</li>
        <li><strong>Decks &amp; Export</strong> — mehrseitige PPT/PDF-Exporte enthalten jede Folie, Bilder und PDFs überlappen keinen Text mehr, editierbare PPTX behalten CJK-Schriften, und Miniaturansichten verschwinden nicht mehr.</li>
        <li><strong>BYOK &amp; Modelle</strong> — Berechtigungsabfragen blockieren unterstützte BYOK-Läufe nicht mehr, „Not Found“-Antworten von Anbietern enden sauber, und <code>od media generate</code> akzeptiert Prompt-Dateien wie dokumentiert.</li>
        <li><strong>Zuverlässigkeit auf dem Desktop</strong> — die mitgelieferte Datenbank-Binary passt zur paketierten Runtime, ein Neustart kann einen älteren inkompatiblen Prozess beenden, und gleichzeitige Bibliotheksimporte werden dedupliziert statt mit einem Fehler abgebrochen.</li>
      </ul>

      <h2>Heute aktualisieren</h2>
      <p>0.15.1 ist kostenlos, quelloffen und local-first.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1 herunterladen</a></p>
  fr:
    title: 'Open Design 0.15.1 — vision plus nette, flow plus long'
    summary: '0.15.1 affûte l''OpenDesign Agent : plus de détails dans les images, une meilleure reprise des longues sessions, des questions de clarification qui restent dans le chat et davantage de runtimes de modèles — plus des correctifs HTML, export de deck et bureau.'
    category: 'Produit'
    bodyHtml: |
      <p>Open Design 0.15.1 est une version centrée sur le runtime. Nous avons amélioré l'<strong>OpenDesign Agent</strong> intégré : les modèles multimodaux voient davantage des détails d'une image, les longues sessions de travail tiennent mieux et se rétablissent plus proprement, et le quotidien — questions de clarification, choix du modèle, exports — reste hors du chemin. La boucle du <a href="/blog/what-is-vibe-design/">vibe design</a> — demander, voir, affiner — continue de tourner sans friction.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Télécharger 0.15.1</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Notes de version complètes</a></p>

      <h2>Votre agent voit les images plus nettement</h2>
      <p>L'OpenDesign Agent transmet désormais aux modèles multimodaux une plus grande part de ce que contient réellement une image. L'analyse de captures d'écran, la critique visuelle et les tâches de design guidées par l'image deviennent plus fiables : le modèle travaille sur ce que vous voyez, pas sur une version floutée.</p>

      <h2>Les longues sessions gardent leur cohérence — et se rétablissent</h2>
      <p>Un travail prolongé perd moins souvent le fil. Cette version améliore la relecture de session, la reprise après un dépassement de flux ou de contexte, et la survie du contexte utile après compactage : une longue exécution d'agent reste sur sa trajectoire au lieu de s'arrêter prématurément. Et quand quelque chose interrompt vraiment — une fermeture passagère du runtime, un EOF à la reprise — l'agent efface la session périmée et poursuit par son chemin de récupération plutôt que d'abandonner la tâche.</p>

      <h2>Les questions de clarification restent dans la conversation</h2>
      <p>Les questions sur la direction d'un deck ou d'un prototype utilisent maintenant des choix visuels que vous pouvez comparer, rafraîchir et déplier sans quitter le chat. Les réponses envoyées — y compris les choix multiples — se replient en un brief lisible : ces allers-retours font partie du dossier au lieu d'être un détour.</p>

      <h2>Plus de modèles, une mémoire plus propre</h2>
      <p>Amenez le bon modèle et la bonne recherche dans un projet : 0.15.1 ajoute <strong>AtomCode</strong> comme runtime d'agent, un preset <strong>SiliconFlow Global BYOK</strong> — nous en disons plus dans notre guide du <a href="/blog/byok-design-workflow-claude-codex-qwen/">workflow de design BYOK</a> — et la <strong>recherche web parallèle</strong> pour AMR. La mémoire démarre aussi plus propre et reste sous votre contrôle : « Apprendre des conversations » est désormais désactivé par défaut, tandis que vos mémoires existantes, votre profil de travail, vos entrées manuelles et vos imports de connecteurs restent en place.</p>

      <h2>Un large balayage de correctifs</h2>
      <p>Sous les grands chantiers, 0.15.1 élimine une longue liste d'aspérités :</p>
      <ul>
        <li><strong>HTML et aperçus</strong> — une analyse réussie ne ressemble plus à une tâche échouée (fini <code>ARTIFACT_NOT_FOUND</code> pour les réponses textuelles), le HTML du mode plan s'ouvre automatiquement, les grands aperçus se rafraîchissent avec la source complète, et les boucles de redirection ne figent plus l'aperçu.</li>
        <li><strong>Decks et export</strong> — les exports PPT/PDF multipages contiennent toutes les diapositives, images et PDF ne chevauchent plus le texte, les PPTX éditables conservent les polices CJK, et les vignettes ne disparaissent plus.</li>
        <li><strong>BYOK et modèles</strong> — les demandes d'autorisation ne bloquent plus les exécutions BYOK prises en charge, les réponses « Not Found » d'un fournisseur s'arrêtent proprement, et <code>od media generate</code> accepte les fichiers de prompt comme documenté.</li>
        <li><strong>Fiabilité du bureau</strong> — le binaire de base de données livré correspond au runtime empaqueté, un redémarrage peut arrêter un ancien processus incompatible, et les imports de bibliothèque simultanés sont dédupliqués au lieu d'échouer.</li>
      </ul>

      <h2>Mettez à jour aujourd'hui</h2>
      <p>0.15.1 est gratuit, open source et local-first.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Télécharger 0.15.1</a></p>
  ru:
    title: 'Open Design 0.15.1 — чётче взгляд, длиннее поток'
    summary: '0.15.1 затачивает OpenDesign Agent: больше деталей на изображениях, аккуратное восстановление длинных сессий, уточняющие вопросы прямо в чате и новые рантаймы моделей — плюс исправления в HTML, экспорте презентаций и десктопе.'
    category: 'Продукт'
    bodyHtml: |
      <p>Open Design 0.15.1 — релиз про рантайм. Мы доработали встроенный <strong>OpenDesign Agent</strong>: мультимодальные модели видят больше деталей изображения, длинные рабочие сессии держатся вместе и лучше восстанавливаются, а повседневное — уточняющие вопросы, выбор модели, экспорт — не мешается под ногами. Петля <a href="/blog/what-is-vibe-design/">vibe design</a> — запрос, взгляд, доводка — продолжает крутиться без трения.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Скачать 0.15.1</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Полные заметки о релизе</a></p>

      <h2>Агент видит изображения чётче</h2>
      <p>Теперь OpenDesign Agent передаёт мультимодальным моделям больше того, что на самом деле есть на изображении. Разбор скриншотов, визуальная критика и задачи, отталкивающиеся от картинки, стали надёжнее: модель работает с тем, что видите вы, а не с размытой копией.</p>

      <h2>Длинные сессии сохраняют связность — и восстанавливаются</h2>
      <p>Долгая работа реже теряет нить. В этом релизе улучшены воспроизведение сессии, восстановление после переполнения потока и контекста, а также то, какая полезная часть контекста переживает уплотнение: длинный прогон агента идёт по курсу, а не обрывается раньше времени. А если что-то всё же прерывает работу — кратковременное закрытие рантайма, EOF при возобновлении — агент убирает устаревшую сессию и продолжает по пути восстановления, а не бросает задачу.</p>

      <h2>Уточняющие вопросы остаются в разговоре</h2>
      <p>Вопросы о направлении презентации или прототипа теперь оформлены как визуальные варианты, которые можно сравнивать, обновлять и разворачивать, не покидая чат. Отправленные ответы — включая множественный выбор — сворачиваются в читаемое резюме, так что этот обмен становится частью записи, а не отступлением.</p>

      <h2>Больше моделей, чище память</h2>
      <p>Приносите в проект нужную модель и нужные материалы: 0.15.1 добавляет <strong>AtomCode</strong> как рантайм агента, пресет <strong>SiliconFlow Global BYOK</strong> — подробнее в нашем руководстве по <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK-процессу дизайна</a> — и <strong>параллельный веб-поиск</strong> для AMR. Память тоже стартует чище и остаётся под вашим контролем: «Учиться из чатов» теперь выключено по умолчанию, а существующие воспоминания, рабочий профиль, ручные записи и импорт из коннекторов остаются на месте.</p>

      <h2>Широкая волна исправлений</h2>
      <p>Под крупными изменениями 0.15.1 разбирает длинный список шероховатостей:</p>
      <ul>
        <li><strong>HTML и превью</strong> — успешный анализ больше не выглядит как проваленная задача (<code>ARTIFACT_NOT_FOUND</code> для текстовых ответов исчез), HTML из режима плана открывается автоматически, крупные превью обновляются с полным исходником, а циклы редиректов больше не подвешивают превью.</li>
        <li><strong>Презентации и экспорт</strong> — многостраничный экспорт в PPT/PDF содержит все слайды, изображения и PDF не наезжают на текст, редактируемый PPTX сохраняет CJK-шрифты, а миниатюры не пропадают.</li>
        <li><strong>BYOK и модели</strong> — запросы разрешений больше не блокируют поддерживаемые BYOK-запуски, ответы провайдера «Not Found» завершаются корректно, а <code>od media generate</code> принимает файлы с промптами, как описано в документации.</li>
        <li><strong>Надёжность десктопа</strong> — встроенный бинарник базы данных совпадает с упакованным рантаймом, перезапуск может остановить старый несовместимый процесс, а параллельные импорты библиотеки дедуплицируются вместо ошибки.</li>
      </ul>

      <h2>Обновитесь сегодня</h2>
      <p>0.15.1 бесплатен, открыт и local-first.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Скачать 0.15.1</a></p>
  es:
    title: 'Open Design 0.15.1 — visión más nítida, flow más largo'
    summary: '0.15.1 afina el OpenDesign Agent: más detalle en las imágenes, mejor recuperación de sesiones largas, preguntas de aclaración dentro del chat y más runtimes de modelos, además de correcciones en HTML, exportación de presentaciones y escritorio.'
    category: 'Producto'
    bodyHtml: |
      <p>Open Design 0.15.1 es una versión centrada en el runtime. Hemos mejorado el <strong>OpenDesign Agent</strong> integrado: los modelos multimodales ven más detalle de una imagen, las sesiones largas de trabajo aguantan mejor y se recuperan con más solidez, y el día a día — preguntas de aclaración, elección de modelo, exportaciones — se aparta del camino. El bucle del <a href="/blog/what-is-vibe-design/">vibe design</a> — pedir, ver, refinar — sigue girando sin fricción.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Descargar 0.15.1</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Notas de la versión completas</a></p>

      <h2>Tu agente ve las imágenes con más nitidez</h2>
      <p>El OpenDesign Agent ahora entrega a los modelos multimodales más del detalle que realmente hay en una imagen. El análisis de capturas, la crítica visual y las tareas de diseño guiadas por imagen se vuelven más fiables: el modelo trabaja con lo que tú ves, no con una versión borrosa.</p>

      <h2>Las sesiones largas mantienen el hilo — y se recuperan</h2>
      <p>El trabajo prolongado pierde el sitio con menos frecuencia. Esta versión mejora la reproducción de sesiones, la recuperación ante desbordes de stream y de contexto, y cuánto contexto útil sobrevive a la compactación, de modo que una ejecución larga del agente se mantiene en su curso en lugar de terminar antes de tiempo. Y cuando algo sí interrumpe — un cierre pasajero del runtime, un EOF al reanudar — el agente limpia la sesión obsoleta y continúa por su ruta de recuperación en vez de abandonar el trabajo.</p>

      <h2>Las preguntas de aclaración se quedan en la conversación</h2>
      <p>Las preguntas sobre la dirección de una presentación o un prototipo usan ahora opciones visuales que puedes comparar, actualizar y desplegar sin salir del chat. Las respuestas enviadas — incluidas las de selección múltiple — se pliegan en un brief legible, así que ese ida y vuelta pasa a formar parte del registro en lugar de ser un desvío.</p>

      <h2>Más modelos, memoria más limpia</h2>
      <p>Lleva el modelo y la investigación adecuados a cada proyecto: 0.15.1 añade <strong>AtomCode</strong> como runtime de agente, un preset de <strong>SiliconFlow Global BYOK</strong> — lo contamos con más detalle en nuestra guía del <a href="/blog/byok-design-workflow-claude-codex-qwen/">flujo de diseño con BYOK</a> — y <strong>búsqueda web en paralelo</strong> para AMR. La memoria también arranca más limpia y sigue bajo tu control: «Aprender de los chats» ahora viene desactivado, mientras que tus memorias existentes, tu perfil de trabajo, las entradas manuales y las importaciones de conectores se quedan donde estaban.</p>

      <h2>Una amplia tanda de correcciones</h2>
      <p>Bajo el trabajo principal, 0.15.1 limpia una larga lista de asperezas:</p>
      <ul>
        <li><strong>HTML y vistas previas</strong> — un análisis correcto ya no parece una tarea fallida (se acabó el <code>ARTIFACT_NOT_FOUND</code> en respuestas de texto), el HTML del modo plan se abre solo, las vistas previas grandes se refrescan con el código completo y los bucles de redirección dejan de congelar la vista previa.</li>
        <li><strong>Presentaciones y exportación</strong> — las exportaciones PPT/PDF de varias páginas incluyen todas las diapositivas, las imágenes y los PDF no se solapan con el texto, el PPTX editable conserva tipografías CJK y las miniaturas dejan de desaparecer.</li>
        <li><strong>BYOK y modelos</strong> — los avisos de permiso ya no bloquean ejecuciones BYOK compatibles, las respuestas «Not Found» del proveedor terminan de forma limpia y <code>od media generate</code> acepta archivos de prompt tal como está documentado.</li>
        <li><strong>Fiabilidad del escritorio</strong> — el binario de base de datos incluido coincide con el runtime empaquetado, un reinicio puede detener un proceso antiguo incompatible y las importaciones de biblioteca simultáneas se deduplican en lugar de fallar.</li>
      </ul>

      <h2>Actualiza hoy</h2>
      <p>0.15.1 es gratuito, de código abierto y local-first.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Descargar 0.15.1</a></p>
  pt-br:
    title: 'Open Design 0.15.1 — visão mais nítida, flow mais longo'
    summary: '0.15.1 afia o OpenDesign Agent: mais detalhe nas imagens, recuperação mais suave de sessões longas, perguntas de esclarecimento dentro do chat e mais runtimes de modelos — além de correções em HTML, exportação de apresentações e desktop.'
    category: 'Produto'
    bodyHtml: |
      <p>O Open Design 0.15.1 é um lançamento focado no runtime. Melhoramos o <strong>OpenDesign Agent</strong> embutido: modelos multimodais enxergam mais do detalhe de uma imagem, sessões longas de trabalho se mantêm inteiras e se recuperam melhor, e o cotidiano — perguntas de esclarecimento, escolha de modelo, exportações — sai do seu caminho. O ciclo do <a href="/blog/what-is-vibe-design/">vibe design</a> — pedir, ver, refinar — continua girando sem atrito.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Baixar 0.15.1</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Notas de versão completas</a></p>

      <h2>Seu agente enxerga imagens com mais clareza</h2>
      <p>O OpenDesign Agent agora entrega aos modelos multimodais mais do detalhe que realmente existe em uma imagem. Análise de capturas de tela, crítica visual e tarefas de design guiadas por imagem ficam mais confiáveis: o modelo trabalha com o que você vê, não com uma versão borrada.</p>

      <h2>Sessões longas mantêm a coerência — e se recuperam</h2>
      <p>Trabalhos prolongados perdem o fio com menos frequência. Este lançamento melhora a reprodução de sessões, a recuperação de estouros de stream e de contexto e quanto do contexto útil sobrevive à compactação, para que uma execução longa do agente siga no rumo em vez de terminar antes da hora. E quando algo de fato interrompe — um fechamento momentâneo do runtime, um EOF ao retomar — o agente limpa a sessão obsoleta e segue pelo caminho de recuperação em vez de abandonar a tarefa.</p>

      <h2>Perguntas de esclarecimento ficam na conversa</h2>
      <p>Perguntas sobre a direção de uma apresentação ou de um protótipo agora usam opções visuais que você pode comparar, atualizar e expandir sem sair do chat. As respostas enviadas — inclusive as de múltipla escolha — se dobram em um briefing legível, de modo que essa troca vira parte do registro em vez de um desvio.</p>

      <h2>Mais modelos, memória mais limpa</h2>
      <p>Traga o modelo e a pesquisa certos para o projeto: o 0.15.1 adiciona o <strong>AtomCode</strong> como runtime de agente, um preset <strong>SiliconFlow Global BYOK</strong> — falamos mais sobre isso no nosso guia de <a href="/blog/byok-design-workflow-claude-codex-qwen/">fluxo de design com BYOK</a> — e <strong>busca web paralela</strong> para o AMR. A memória também começa mais limpa e continua sob seu controle: “Aprender com as conversas” agora vem desligado, enquanto suas memórias existentes, perfil de trabalho, entradas manuais e importações de conectores permanecem intactos.</p>

      <h2>Uma ampla leva de correções</h2>
      <p>Abaixo do trabalho principal, o 0.15.1 resolve uma longa lista de arestas:</p>
      <ul>
        <li><strong>HTML e prévias</strong> — uma análise bem-sucedida não parece mais uma tarefa que falhou (fim do <code>ARTIFACT_NOT_FOUND</code> em respostas de texto), o HTML do modo plano abre sozinho, prévias grandes recarregam com o código-fonte completo e loops de redirecionamento deixam de travar a prévia.</li>
        <li><strong>Apresentações e exportação</strong> — exportações PPT/PDF de várias páginas incluem todos os slides, imagens e PDFs não se sobrepõem ao texto, o PPTX editável preserva fontes CJK e as miniaturas param de sumir.</li>
        <li><strong>BYOK e modelos</strong> — avisos de permissão não bloqueiam mais execuções BYOK suportadas, respostas “Not Found” do provedor terminam de forma limpa e <code>od media generate</code> aceita arquivos de prompt como documentado.</li>
        <li><strong>Confiabilidade no desktop</strong> — o binário de banco de dados embarcado corresponde ao runtime empacotado, o relançamento consegue encerrar um processo antigo incompatível e importações simultâneas de biblioteca são deduplicadas em vez de gerar erro.</li>
      </ul>

      <h2>Atualize hoje</h2>
      <p>O 0.15.1 é gratuito, open source e local-first.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Baixar 0.15.1</a></p>
  it:
    title: 'Open Design 0.15.1 — sguardo più nitido, flow più lungo'
    summary: '0.15.1 affina l''OpenDesign Agent: più dettaglio nelle immagini, ripresa più fluida delle sessioni lunghe, domande di chiarimento dentro la chat e più runtime di modelli, oltre a correzioni su HTML, esportazione delle presentazioni e desktop.'
    category: 'Prodotto'
    bodyHtml: |
      <p>Open Design 0.15.1 è una release incentrata sul runtime. Abbiamo migliorato l'<strong>OpenDesign Agent</strong> integrato: i modelli multimodali vedono più dettaglio di un'immagine, le lunghe sessioni di lavoro reggono meglio e si riprendono più solidamente, e la quotidianità — domande di chiarimento, scelta del modello, esportazioni — resta fuori dai piedi. Il ciclo del <a href="/blog/what-is-vibe-design/">vibe design</a> — chiedere, vedere, rifinire — continua a girare senza attrito.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Scarica 0.15.1</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Note di rilascio complete</a></p>

      <h2>Il tuo agente vede le immagini più nitide</h2>
      <p>L'OpenDesign Agent ora passa ai modelli multimodali una parte maggiore del dettaglio realmente presente in un'immagine. Analisi di screenshot, critica visiva e attività di design guidate dall'immagine diventano più affidabili: il modello lavora su ciò che vedi tu, non su una versione sfocata.</p>

      <h2>Le sessioni lunghe restano coerenti — e si riprendono</h2>
      <p>Il lavoro prolungato perde il filo più di rado. Questa release migliora la riproduzione della sessione, il recupero da overflow di stream e di contesto e quanto contesto utile sopravvive alla compattazione, così una lunga esecuzione dell'agente resta in rotta invece di chiudersi in anticipo. E quando qualcosa interrompe davvero — una chiusura momentanea del runtime, un EOF alla ripresa — l'agente ripulisce la sessione obsoleta e prosegue lungo il proprio percorso di recupero invece di lasciar cadere il lavoro.</p>

      <h2>Le domande di chiarimento restano nella conversazione</h2>
      <p>Le domande sulla direzione di un deck o di un prototipo usano ora scelte visive che puoi confrontare, aggiornare ed espandere senza uscire dalla chat. Le risposte inviate — comprese quelle a scelta multipla — si ripiegano in un brief leggibile, così quel botta e risposta entra a far parte del resoconto invece di essere una deviazione.</p>

      <h2>Più modelli, memoria più pulita</h2>
      <p>Porta nel progetto il modello e la ricerca giusti: 0.15.1 aggiunge <strong>AtomCode</strong> come runtime dell'agente, un preset <strong>SiliconFlow Global BYOK</strong> — ne parliamo più a fondo nella nostra guida al <a href="/blog/byok-design-workflow-claude-codex-qwen/">workflow di design in BYOK</a> — e la <strong>ricerca web parallela</strong> per AMR. Anche la memoria parte più pulita e resta sotto il tuo controllo: «Impara dalle chat» ora è disattivato per impostazione predefinita, mentre le memorie esistenti, il profilo di lavoro, le voci manuali e le importazioni dai connettori restano al loro posto.</p>

      <h2>Un ampio giro di correzioni</h2>
      <p>Sotto il lavoro principale, 0.15.1 elimina una lunga lista di asperità:</p>
      <ul>
        <li><strong>HTML e anteprime</strong> — un'analisi riuscita non sembra più un'attività fallita (via l'<code>ARTIFACT_NOT_FOUND</code> per le risposte testuali), l'HTML in modalità piano si apre da solo, le anteprime grandi si aggiornano con il sorgente completo e i loop di redirect non congelano più l'anteprima.</li>
        <li><strong>Presentazioni ed esportazione</strong> — le esportazioni PPT/PDF multipagina includono ogni slide, immagini e PDF non si sovrappongono al testo, il PPTX modificabile mantiene i caratteri CJK e le miniature non spariscono più.</li>
        <li><strong>BYOK e modelli</strong> — le richieste di permesso non bloccano più le esecuzioni BYOK supportate, le risposte «Not Found» del provider terminano in modo pulito e <code>od media generate</code> accetta i file di prompt come documentato.</li>
        <li><strong>Affidabilità sul desktop</strong> — il binario del database incluso corrisponde al runtime del pacchetto, il riavvio può chiudere un vecchio processo incompatibile e le importazioni simultanee della libreria vengono deduplicate invece di andare in errore.</li>
      </ul>

      <h2>Aggiorna oggi</h2>
      <p>0.15.1 è gratuito, open source e local-first.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">Scarica 0.15.1</a></p>
  tr:
    title: 'Open Design 0.15.1 — daha keskin görüş, daha uzun akış'
    summary: '0.15.1 OpenDesign Agent''ı keskinleştiriyor: görsellerde daha ince ayrıntı, uzun oturumlarda daha pürüzsüz toparlanma, sohbetin içinde kalan netleştirme soruları ve daha fazla model çalışma zamanı — ayrıca HTML, sunum dışa aktarma ve masaüstü düzeltmeleri.'
    category: 'Ürün'
    bodyHtml: |
      <p>Open Design 0.15.1, çalışma zamanına odaklanan bir sürüm. Yerleşik <strong>OpenDesign Agent</strong>'ı geliştirdik: çok kipli modeller bir görselin ayrıntısını daha fazla görüyor, uzun çalışma oturumları dağılmadan sürüyor ve daha iyi toparlanıyor, günlük akış — netleştirme soruları, model seçimi, dışa aktarmalar — ise yolunuzdan çekiliyor. <a href="/blog/what-is-vibe-design/">Vibe design</a> döngüsü — iste, gör, inceltip düzelt — sürtünmesiz dönmeye devam ediyor.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1'i indir</a> · <a href="https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1">Tüm sürüm notları</a></p>

      <h2>Ajanınız görselleri daha net görüyor</h2>
      <p>OpenDesign Agent artık bir görselde gerçekten var olan ayrıntının daha fazlasını çok kipli modellere aktarıyor. Ekran görüntüsü çözümlemesi, görsel kritik ve görselden yürüyen tasarım işleri daha güvenilir hale geliyor: model, bulanık bir kopyayla değil, sizin gördüğünüz şeyle çalışıyor.</p>

      <h2>Uzun oturumlar tutarlı kalıyor — ve toparlanıyor</h2>
      <p>Uzayan çalışmalar yerini daha seyrek kaybediyor. Bu sürüm oturum yeniden oynatmayı, akış ve bağlam taşmasından toparlanmayı ve sıkıştırmadan sonra hangi yararlı bağlamın hayatta kaldığını iyileştiriyor; böylece uzun bir ajan koşusu erkenden bitmek yerine rotasında kalıyor. Bir şey gerçekten araya girdiğinde — geçici bir çalışma zamanı kapanması, sürdürmede bir EOF — ajan bayat oturumu temizleyip kurtarma yolundan devam ediyor, işi düşürmüyor.</p>

      <h2>Netleştirme soruları sohbetin içinde kalıyor</h2>
      <p>Sunum ve prototip yönüne dair sorular artık karşılaştırabileceğiniz, yenileyebileceğiniz ve genişletebileceğiniz görsel seçenekler kullanıyor; sohbetten çıkmanız gerekmiyor. Gönderilen yanıtlar — çoklu seçim olanlar dahil — okunabilir bir brief'e katlanıyor, böylece bu gidiş geliş bir sapma değil, kaydın parçası oluyor.</p>

      <h2>Daha fazla model, daha temiz bellek</h2>
      <p>Doğru modeli ve araştırmayı projeye getirin: 0.15.1, ajan çalışma zamanı olarak <strong>AtomCode</strong>'u, bir <strong>SiliconFlow Global BYOK</strong> hazır ayarını — bu konuda daha fazlası <a href="/blog/byok-design-workflow-claude-codex-qwen/">BYOK tasarım akışı</a> rehberimizde — ve AMR için <strong>paralel web araması</strong>nı ekliyor. Bellek de daha temiz başlıyor ve denetimi sizde kalıyor: “Sohbetlerden öğren” artık varsayılan olarak kapalı, mevcut anılarınız, çalışma profiliniz, elle eklediğiniz kayıtlar ve bağlayıcı içe aktarmaları ise yerinde duruyor.</p>

      <h2>Geniş bir düzeltme turu</h2>
      <p>Başlıktaki işlerin altında 0.15.1 uzun bir pürüz listesini topluyor:</p>
      <ul>
        <li><strong>HTML ve önizlemeler</strong> — başarılı bir çözümleme artık başarısız bir iş gibi görünmüyor (metin yanıtlarında <code>ARTIFACT_NOT_FOUND</code> yok), plan modundaki HTML kendiliğinden açılıyor, büyük önizlemeler tam kaynakla yenileniyor ve yönlendirme döngüleri önizlemeyi dondurmuyor.</li>
        <li><strong>Sunumlar ve dışa aktarma</strong> — çok sayfalı PPT/PDF dışa aktarmaları her slaydı içeriyor, görseller ve PDF'ler metinle üst üste binmiyor, düzenlenebilir PPTX CJK yazı tiplerini koruyor ve küçük resimler kaybolmuyor.</li>
        <li><strong>BYOK ve modeller</strong> — izin istemleri desteklenen BYOK koşularını engellemiyor, sağlayıcının “Not Found” yanıtları temiz biçimde sonlanıyor ve <code>od media generate</code> belgelendiği gibi istem dosyalarını kabul ediyor.</li>
        <li><strong>Masaüstü güvenilirliği</strong> — paketle gelen veritabanı ikilisi paketlenmiş çalışma zamanıyla eşleşiyor, yeniden başlatma eski ve uyumsuz bir süreci durdurabiliyor, eşzamanlı kitaplık içe aktarmaları hata vermek yerine yinelenenleri ayıklıyor.</li>
      </ul>

      <h2>Bugün güncelleyin</h2>
      <p>0.15.1 ücretsiz, açık kaynak ve yerel öncelikli.</p>
      <p><a href="https://releases.open-design.ai/?utm_source=blog&amp;utm_medium=docs&amp;utm_campaign=202607_0_15_1&amp;utm_content=official">0.15.1'i indir</a></p>
---

Open Design 0.15.1 is a runtime-focused release. We upgraded the built-in **OpenDesign Agent** so multimodal models see more of an image's detail, long working sessions hold together and recover better, and the everyday flow — clarifying questions, model choice, exports — stays out of your way. It keeps the [vibe-design](/blog/what-is-vibe-design/) loop — prompt, see, refine — moving without friction.

[Download 0.15.1](https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_15_1&utm_content=official) · [Full release notes](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1)

## Your agent sees images more clearly

The OpenDesign Agent now hands multimodal models more of the detail that's actually in an image. Screenshot analysis, visual critique, and image-led design tasks become more dependable — the model is working from what you can see, not a blurred version of it.

## Long sessions stay coherent — and recover

Extended work is less likely to lose its place. This release improves session replay, stream and context-overflow recovery, and how useful context survives compaction, so a long agent run stays on track instead of ending prematurely. When something does interrupt — a transient runtime closure, a resume EOF — the agent clears the stale session and continues through its recovery path rather than dropping the job.

## Clarifying questions stay in the conversation

Deck and prototype direction questions now use visual choices you can compare, refresh, and expand without leaving the chat. Submitted answers — including multi-select ones — collapse into a readable brief, so the back-and-forth becomes part of the record instead of a detour.

## More models, cleaner memory

Bring the right model and research into a project: 0.15.1 adds **AtomCode** as an agent runtime, a **SiliconFlow Global BYOK** preset — more on that in our [BYOK design workflow](/blog/byok-design-workflow-claude-codex-qwen/) guide — and **parallel web search** for AMR. Memory also starts cleaner and stays under your control — "Learn from chats" now defaults off, while your existing memories, work profile, manual entries, and connector imports stay put.

## A wide sweep of fixes

Under the headline work, 0.15.1 clears a long list of rough edges:

- **HTML & previews** — a successful analysis no longer looks like a failed task (`ARTIFACT_NOT_FOUND` gone for text answers), plan-mode HTML opens automatically, large previews refresh with full source, and redirect loops stop freezing the preview.
- **Decks & export** — multi-page PPT/PDF exports include every slide, images and PDFs avoid overlapping text, editable PPTX keeps CJK typefaces, and thumbnails stop disappearing.
- **BYOK & models** — permission prompts no longer block supported BYOK runs, provider "Not Found" responses stop cleanly, and `od media generate` accepts prompt files as documented.
- **Desktop reliability** — the bundled database binary matches the packaged runtime, relaunch can stop an older incompatible process, and concurrent library imports dedupe instead of erroring.

## Update today

0.15.1 is free, open-source, and local-first.

[Download 0.15.1](https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_15_1&utm_content=official)
