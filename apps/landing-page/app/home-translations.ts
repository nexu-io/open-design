/*
 * Per-locale copy for the homepage's visual modules (hero, about, capabilities,
 * labs, method, cta, testimonial, faq). The layout, images, and module
 * structure are authored once as the Chinese design; this table supplies the
 * translated text so every locale renders the SAME structure with localized
 * copy. Missing keys fall back to English per-key (see `getHomeExtra`).
 *
 * Two-line strings use `\n`; render them with the `BreakText` helper.
 */
import type { LandingLocaleCode } from './i18n';

export interface HomeExtra {
  heroLead: string;
  heroTitleSub: string;
  heroSub: string; // 2 lines (\n)
  aboutKicker: string;
  aboutStatement: string;
  aboutTab1: string;
  aboutTab2: string;
  aboutTab3: string;
  aboutCap1: string; // 2 lines (\n)
  aboutCap2: string; // 2 lines (\n)
  aboutCap3: string;
  stepTitle1: string;
  stepTitle2: string;
  stepTitle3: string;
  stepTitle4: string;
  stepDesc1: string;
  stepDesc2: string;
  stepDesc3: string;
  stepDesc4: string;
  capTitle: string;
  labsPre: string; // before <em>Open Design</em>
  labsPost: string; // after <em>Open Design</em> (incl. punctuation)
  methodTitle: string;
  ctaTitle: string;
  testiPre: string; // before the contributor count
  testiMid: string; // after the count, before the line break
  testiPost: string; // after the line break
  // Newsletter band (between the CTA and FAQ modules).
  newsTitle: string;
  newsDesc: string;
  newsBtn: string;
  newsDone: string; // shown by the inline enhancer after submit
  newsError?: string; // shown when the /subscribe POST fails (falls back to EN)
  faqTitle: string;
  // Footer column headings. The link labels inside the columns stay in
  // English across locales (proper nouns: Download, Plugins, GitHub, ...).
  footProduct: string;
  footCommunity: string;
  footLegal: string;
  footPartners: string;
}

const en: HomeExtra = {
  heroLead:
    'From idea to prototype, web, slides, and HTML video — the entire product-design flow, finished on your own machine.',
  heroTitleSub: 'The Open-source Claude Design alternative',
  heroSub:
    'Open Design is the open-source, local, agent-native design platform — and an agent-native Figma alternative. Desktop-first, with 21 coding agents, 129 design systems, and an Apache-2.0 license.',
  aboutKicker: 'Why Open Design?',
  aboutStatement:
    'In April 2026, Claude Design first proved an LLM can truly design — not write copy, but produce real design work. But it’s closed-source, paid, and cloud-only, locked to Anthropic models — no agent switching, no self-hosting, no BYOK. Open Design opens that capability up.',
  aboutTab1: 'Desktop-native',
  aboutTab2: 'We don’t build agents, we plug them in',
  aboutTab3: 'It learns you over time',
  aboutCap1:
    'Design happens on the desktop.\nLocal files, Figma exports, and code repos are directly readable, and the agent has full terminal-execution power.',
  aboutCap2:
    'The Claude Code / Codex / Cursor on your machine are already strong enough.\nOpen Design wires them into a complete design workflow.',
  aboutCap3:
    'Every choice settles into a design system, preferences, and memory, so the next generation lands closer to what you want.',
  stepTitle1: 'Choose a starting point',
  stepTitle2: 'Set the visual direction',
  stepTitle3: 'Generate the artifact',
  stepTitle4: 'Deliver or make a video',
  stepDesc1: 'Describe your goal in one line, or start from a template / plugin.',
  stepDesc2: 'Once a direction is set, palette, type, and spacing flow into generation automatically.',
  stepDesc3: 'The agent reads all context, produces real runnable files, and previews and edits them live in a sandbox.',
  stepDesc4: 'Export it to engineering to keep building, or turn it into a marketing video with HyperFrames.',
  capTitle: 'From idea to delivery, done with ease',
  labsPre: 'What can you make with ',
  labsPost: '?',
  methodTitle: 'Plug in 21+ coding agents, zero config',
  ctaTitle: 'Bring frontier AI design power back to every creator’s desk',
  testiPre: 'From around the world, ',
  testiMid: ' contributors',
  testiPost: 'are building Open Design together',
  newsTitle: 'The Open Design newsletter',
  newsDesc:
    'New templates, design-system updates, ambassador events, and product news — straight to your inbox.',
  newsBtn: 'Subscribe',
  newsDone: 'Thanks — you’re on the list!',
  newsError: 'Couldn’t subscribe just now — please try again.',
  faqTitle: 'FAQ',
  footProduct: 'Product',
  footCommunity: 'Community',
  footLegal: 'Legal',
  footPartners: 'Partners',
};

const zh: HomeExtra = {
  heroLead: '从想法到原型、网页、Slides、HTML 视频——产品设计全流程，在你自己的设备上完成。',
  heroTitleSub: 'Claude Design最佳开源平替',
  heroSub:
    'Figma 和 Claude Design 的 Agent-native 替代。\n桌面客户端优先，接入 21 个 Coding Agent，129 个 Design System，Apache-2.0。',
  aboutKicker: '为什么选择 Open Design？',
  aboutStatement:
    '2026 年 4 月，Claude Design 首次证明 LLM 能真正做设计，不是写文章，是直接产出设计稿。但它闭源、付费、只跑在云端，模型锁 Anthropic，换 Agent、自部署、BYOK 全做不到。Open Design 让这套能力变得开放。',
  aboutTab1: '桌面端原生',
  aboutTab2: '不造 Agent，接入 Agent',
  aboutTab3: '越用越懂你',
  aboutCap1: '设计在桌面端发生。\n本地文件、Figma 导出、代码仓库直接可读，Agent 拥有终端执行全部能力',
  aboutCap2: '你电脑上的 Claude Code / Codex / Cursor 已经够强。\nOpen Design 做的是把它们接进完整设计工作流',
  aboutCap3: '每次选择都沉淀为 Design System、偏好和记忆，下次生成更接近你要的结果',
  stepTitle1: '选择起点',
  stepTitle2: '确定视觉方向',
  stepTitle3: '生成 Artifact',
  stepTitle4: '交付或制作视频',
  stepDesc1: '一句话描述目标，或从模板 / Plugin 直接选起点',
  stepDesc2: '选定方向后，色板、字体、间距自动带入生成流程',
  stepDesc3: 'Agent 读取所有 context，产出真实可运行的文件，沙盒内即时预览和修改',
  stepDesc4: '导出给工程继续开发，或用 HyperFrames 直接转为营销视频',
  capTitle: '从想法到交付，轻松搞定',
  labsPre: '用 ',
  labsPost: ' 能产出什么？',
  methodTitle: '接入 21+ Coding Agent，零配置',
  ctaTitle: '让最前沿的 AI 设计能力回到每一个创作者的桌上',
  testiPre: '来自全球，',
  testiMid: ' 贡献者',
  testiPost: '正在一起构建 Open Design',
  newsTitle: 'Open Design 订阅',
  newsDesc: '新模板、设计系统更新、大使活动与产品动态，直接发到你的邮箱。',
  newsBtn: '订阅',
  newsDone: '已收到，感谢关注！',
  newsError: '订阅失败，请稍后重试。',
  faqTitle: '常见问题',
  footProduct: '产品',
  footCommunity: '社区',
  footLegal: '法律',
  footPartners: '伙伴',
};

const zhTw: HomeExtra = {
  heroLead: '從想法到原型、網頁、Slides、HTML 影片——產品設計全流程，在你自己的裝置上完成。',
  heroTitleSub: 'Claude Design 最佳開源替代方案',
  heroSub:
    'Figma 與 Claude Design 的 Agent-native 替代方案。\n桌面用戶端優先，接入 21 個 Coding Agent、129 個 Design System，Apache-2.0。',
  aboutKicker: '為什麼選擇 Open Design？',
  aboutStatement:
    '2026 年 4 月，Claude Design 首次證明 LLM 能真正做設計，不是寫文章，而是直接產出設計稿。但它閉源、付費、只跑在雲端，模型鎖 Anthropic，換 Agent、自部署、BYOK 全做不到。Open Design 讓這套能力變得開放。',
  aboutTab1: '桌面端原生',
  aboutTab2: '不造 Agent，接入 Agent',
  aboutTab3: '越用越懂你',
  aboutCap1: '設計在桌面端發生。\n本地檔案、Figma 匯出、程式碼倉庫直接可讀，Agent 擁有終端執行全部能力',
  aboutCap2: '你電腦上的 Claude Code / Codex / Cursor 已經夠強。\nOpen Design 做的是把它們接進完整設計工作流',
  aboutCap3: '每次選擇都沉澱為 Design System、偏好與記憶，下次生成更接近你要的結果',
  stepTitle1: '選擇起點',
  stepTitle2: '確定視覺方向',
  stepTitle3: '生成 Artifact',
  stepTitle4: '交付或製作影片',
  stepDesc1: '一句話描述目標，或從範本 / Plugin 直接選起點',
  stepDesc2: '選定方向後，色票、字型、間距自動帶入生成流程',
  stepDesc3: 'Agent 讀取所有 context，產出真實可執行的檔案，沙盒內即時預覽與修改',
  stepDesc4: '匯出給工程繼續開發，或用 HyperFrames 直接轉為行銷影片',
  capTitle: '從想法到交付，輕鬆搞定',
  labsPre: '用 ',
  labsPost: ' 能產出什麼？',
  methodTitle: '接入 21+ Coding Agent，零設定',
  ctaTitle: '讓最前沿的 AI 設計能力回到每一個創作者的桌上',
  testiPre: '來自全球，',
  testiMid: ' 貢獻者',
  testiPost: '正在一起打造 Open Design',
  newsTitle: 'Open Design 訂閱',
  newsDesc: '新範本、設計系統更新、大使活動與產品動態，直接寄到你的信箱。',
  newsBtn: '訂閱',
  newsDone: '已收到，感謝關注！',
  faqTitle: '常見問題',
  footProduct: '產品',
  footCommunity: '社區',
  footLegal: '法律',
  footPartners: '夥伴',
};

const ja: HomeExtra = {
  heroLead:
    'アイデアからプロトタイプ、Web、スライド、HTML 動画まで——プロダクトデザインの全工程を、あなたの手元のマシンで完結。',
  heroTitleSub: 'Claude Design の最良のオープンソース代替',
  heroSub:
    'Figma と Claude Design のエージェントネイティブな代替。\nデスクトップ優先、21 のコーディングエージェント、129 のデザインシステム、Apache-2.0。',
  aboutKicker: 'なぜ Open Design なのか？',
  aboutStatement:
    '2026 年 4 月、Claude Design は LLM が本当にデザインできることを初めて証明しました。文章ではなく、実際のデザイン成果物を生み出すのです。しかしクローズドソースで有料、クラウド専用、Anthropic モデルに固定——エージェントの切り替え、セルフホスト、BYOK はすべて不可。Open Design はその能力をオープンにします。',
  aboutTab1: 'デスクトップネイティブ',
  aboutTab2: 'エージェントは作らず、つなぐ',
  aboutTab3: '使うほどあなたを理解する',
  aboutCap1:
    'デザインはデスクトップで起こる。\nローカルファイル、Figma エクスポート、コードリポジトリを直接読み取り、エージェントはターミナル実行のすべての権限を持つ。',
  aboutCap2:
    'あなたのマシンにある Claude Code / Codex / Cursor はすでに十分強力。\nOpen Design はそれらを完全なデザインワークフローにつなぎ込む。',
  aboutCap3: 'すべての選択がデザインシステム・好み・記憶として蓄積され、次の生成があなたの望みに近づく。',
  stepTitle1: '起点を選ぶ',
  stepTitle2: 'ビジュアルの方向を決める',
  stepTitle3: 'Artifact を生成',
  stepTitle4: '納品、または動画化',
  stepDesc1: '目標を一言で説明するか、テンプレート / プラグインから起点を選ぶ。',
  stepDesc2: '方向が決まれば、カラーパレット・フォント・余白が自動で生成フローに反映される。',
  stepDesc3: 'エージェントがすべてのコンテキストを読み、実際に動くファイルを生成。サンドボックス内で即時プレビューと編集。',
  stepDesc4: 'エンジニアリングにエクスポートして開発を続けるか、HyperFrames でそのままマーケティング動画に。',
  capTitle: 'アイデアから納品まで、らくらく',
  labsPre: '',
  labsPost: ' で何が作れる？',
  methodTitle: '21+ のコーディングエージェントを設定ゼロで接続',
  ctaTitle: '最先端の AI デザイン能力を、すべての作り手の手元へ',
  testiPre: '世界中から、',
  testiMid: ' 人のコントリビューター',
  testiPost: 'が一緒に Open Design を作っています',
  newsTitle: 'Open Design ニュースレター',
  newsDesc:
    '新しいテンプレート、デザインシステムの更新、アンバサダーイベント、プロダクトの最新情報を、あなたの受信箱へ直接お届けします。',
  newsBtn: '購読する',
  newsDone: 'ご登録ありがとうございます！',
  faqTitle: 'よくある質問',
  footProduct: '製品',
  footCommunity: 'コミュニティ',
  footLegal: '法的情報',
  footPartners: 'パートナー',
};

const ko: HomeExtra = {
  heroLead:
    '아이디어에서 프로토타입, 웹, 슬라이드, HTML 영상까지 — 제품 디자인 전 과정을 내 컴퓨터에서 완성합니다.',
  heroTitleSub: 'Claude Design의 최고의 오픈소스 대안',
  heroSub:
    'Figma와 Claude Design의 에이전트 네이티브 대안.\n데스크톱 우선, 21개 코딩 에이전트, 129개 디자인 시스템, Apache-2.0.',
  aboutKicker: '왜 Open Design인가?',
  aboutStatement:
    '2026년 4월, Claude Design은 LLM이 글이 아니라 실제 디자인 결과물을 만들 수 있음을 처음으로 증명했습니다. 하지만 폐쇄형에 유료, 클라우드 전용이며 Anthropic 모델에 묶여 있어 에이전트 교체, 셀프 호스팅, BYOK가 모두 불가능합니다. Open Design은 그 능력을 개방합니다.',
  aboutTab1: '데스크톱 네이티브',
  aboutTab2: '에이전트를 만들지 않고, 연결합니다',
  aboutTab3: '쓸수록 당신을 이해합니다',
  aboutCap1:
    '디자인은 데스크톱에서 일어납니다.\n로컬 파일, Figma 내보내기, 코드 저장소를 직접 읽고, 에이전트는 터미널 실행의 모든 권한을 가집니다.',
  aboutCap2:
    '당신의 컴퓨터에 있는 Claude Code / Codex / Cursor는 이미 충분히 강력합니다.\nOpen Design은 이를 완전한 디자인 워크플로에 연결합니다.',
  aboutCap3: '모든 선택이 디자인 시스템, 취향, 기억으로 쌓여 다음 생성이 원하는 결과에 더 가까워집니다.',
  stepTitle1: '시작점 선택',
  stepTitle2: '비주얼 방향 결정',
  stepTitle3: 'Artifact 생성',
  stepTitle4: '전달 또는 영상 제작',
  stepDesc1: '목표를 한 문장으로 설명하거나 템플릿 / 플러그인에서 시작점을 고르세요.',
  stepDesc2: '방향이 정해지면 팔레트, 폰트, 간격이 자동으로 생성 흐름에 반영됩니다.',
  stepDesc3: '에이전트가 모든 컨텍스트를 읽어 실제로 실행 가능한 파일을 생성하고, 샌드박스에서 즉시 미리보기·수정합니다.',
  stepDesc4: '엔지니어링으로 내보내 계속 개발하거나, HyperFrames로 바로 마케팅 영상으로 만드세요.',
  capTitle: '아이디어에서 전달까지, 손쉽게',
  labsPre: '',
  labsPost: '(으)로 무엇을 만들 수 있나요?',
  methodTitle: '21개 이상의 코딩 에이전트를 설정 없이 연결',
  ctaTitle: '최첨단 AI 디자인 역량을 모든 창작자의 책상으로',
  testiPre: '전 세계에서, ',
  testiMid: '명의 기여자',
  testiPost: '가 함께 Open Design을 만들고 있습니다',
  newsTitle: 'Open Design 뉴스레터',
  newsDesc:
    '새 템플릿, 디자인 시스템 업데이트, 앰배서더 이벤트, 제품 소식을 받은편지함으로 바로 보내드립니다.',
  newsBtn: '구독',
  newsDone: '구독해 주셔서 감사합니다!',
  faqTitle: '자주 묻는 질문',
  footProduct: '제품',
  footCommunity: '커뮤니티',
  footLegal: '법적 고지',
  footPartners: '파트너',
};

const de: HomeExtra = {
  heroLead:
    'Von der Idee zu Prototyp, Web, Slides und HTML-Video — der gesamte Produktdesign-Flow, fertig auf deinem eigenen Rechner.',
  heroTitleSub: 'Die beste Open-Source-Alternative zu Claude Design',
  heroSub:
    'Eine agent-native Alternative zu Figma und Claude Design.\nDesktop-first, mit 21 Coding-Agents, 129 Design-Systemen und Apache-2.0-Lizenz.',
  aboutKicker: 'Warum Open Design?',
  aboutStatement:
    'Im April 2026 bewies Claude Design erstmals, dass ein LLM wirklich gestalten kann — keine Texte, sondern echte Design-Arbeit. Aber es ist Closed Source, kostenpflichtig und nur in der Cloud, an Anthropic-Modelle gebunden — kein Agent-Wechsel, kein Self-Hosting, kein BYOK. Open Design öffnet diese Fähigkeit.',
  aboutTab1: 'Desktop-nativ',
  aboutTab2: 'Wir bauen keine Agents, wir binden sie ein',
  aboutTab3: 'Es lernt dich mit der Zeit',
  aboutCap1:
    'Design passiert auf dem Desktop.\nLokale Dateien, Figma-Exporte und Code-Repos sind direkt lesbar, und der Agent hat volle Terminal-Ausführungsrechte.',
  aboutCap2:
    'Die Claude Code / Codex / Cursor auf deinem Rechner sind bereits stark genug.\nOpen Design bindet sie in einen kompletten Design-Workflow ein.',
  aboutCap3: 'Jede Entscheidung wird zu Design-System, Vorlieben und Gedächtnis, sodass die nächste Generierung näher an dem liegt, was du willst.',
  stepTitle1: 'Startpunkt wählen',
  stepTitle2: 'Visuelle Richtung festlegen',
  stepTitle3: 'Artefakt generieren',
  stepTitle4: 'Ausliefern oder Video erstellen',
  stepDesc1: 'Beschreibe dein Ziel in einem Satz oder starte aus einer Vorlage / einem Plugin.',
  stepDesc2: 'Sobald die Richtung steht, fließen Palette, Typo und Abstände automatisch in die Generierung ein.',
  stepDesc3: 'Der Agent liest den gesamten Kontext, erzeugt echte lauffähige Dateien und zeigt sie live in einer Sandbox zum Bearbeiten.',
  stepDesc4: 'Exportiere ins Engineering zum Weiterbauen oder mach mit HyperFrames direkt ein Marketing-Video daraus.',
  capTitle: 'Von der Idee zur Auslieferung, mühelos',
  labsPre: 'Was kannst du mit ',
  labsPost: ' erstellen?',
  methodTitle: '21+ Coding-Agents anbinden, ohne Konfiguration',
  ctaTitle: 'Modernste KI-Designkraft zurück auf den Schreibtisch jedes Kreativen',
  testiPre: 'Aus aller Welt bauen ',
  testiMid: ' Mitwirkende',
  testiPost: 'gemeinsam an Open Design',
  newsTitle: 'Der Open-Design-Newsletter',
  newsDesc:
    'Neue Vorlagen, Design-System-Updates, Ambassador-Events und Produktneuigkeiten — direkt in dein Postfach.',
  newsBtn: 'Abonnieren',
  newsDone: 'Danke — du bist dabei!',
  faqTitle: 'FAQ',
  footProduct: 'Produkt',
  footCommunity: 'Community',
  footLegal: 'Rechtliches',
  footPartners: 'Partner',
};

const fr: HomeExtra = {
  heroLead:
    'De l’idée au prototype, au web, aux slides et à la vidéo HTML — tout le flux de design produit, réalisé sur votre propre machine.',
  heroTitleSub: "La meilleure alternative open source à Claude Design",
  heroSub:
    'Une alternative agent-native à Figma et Claude Design.\nDesktop d’abord, avec 21 agents de code, 129 design systems et une licence Apache-2.0.',
  aboutKicker: 'Pourquoi Open Design ?',
  aboutStatement:
    'En avril 2026, Claude Design a prouvé pour la première fois qu’un LLM pouvait vraiment concevoir — non pas écrire, mais produire un véritable travail de design. Mais il est propriétaire, payant et uniquement cloud, verrouillé aux modèles Anthropic — pas de changement d’agent, pas d’auto-hébergement, pas de BYOK. Open Design ouvre cette capacité.',
  aboutTab1: 'Natif desktop',
  aboutTab2: 'On ne crée pas d’agents, on les branche',
  aboutTab3: 'Il vous comprend avec le temps',
  aboutCap1:
    'Le design se passe sur le desktop.\nFichiers locaux, exports Figma et dépôts de code directement lisibles, et l’agent dispose de tous les pouvoirs d’exécution du terminal.',
  aboutCap2:
    'Les Claude Code / Codex / Cursor sur votre machine sont déjà assez puissants.\nOpen Design les branche dans un flux de design complet.',
  aboutCap3: 'Chaque choix se sédimente en design system, préférences et mémoire, pour que la prochaine génération soit plus proche de ce que vous voulez.',
  stepTitle1: 'Choisir un point de départ',
  stepTitle2: 'Définir la direction visuelle',
  stepTitle3: 'Générer l’artefact',
  stepTitle4: 'Livrer ou créer une vidéo',
  stepDesc1: 'Décrivez votre objectif en une phrase, ou partez d’un modèle / plugin.',
  stepDesc2: 'Une fois la direction choisie, palette, typo et espacements alimentent automatiquement la génération.',
  stepDesc3: 'L’agent lit tout le contexte, produit de vrais fichiers exécutables et les prévisualise et édite en direct dans un bac à sable.',
  stepDesc4: 'Exportez vers l’ingénierie pour continuer, ou transformez-le en vidéo marketing avec HyperFrames.',
  capTitle: 'De l’idée à la livraison, en toute simplicité',
  labsPre: 'Que pouvez-vous créer avec ',
  labsPost: ' ?',
  methodTitle: 'Branchez 21+ agents de code, sans configuration',
  ctaTitle: 'Ramener la puissance du design IA de pointe sur le bureau de chaque créateur',
  testiPre: 'Du monde entier, ',
  testiMid: ' contributeurs',
  testiPost: 'construisent Open Design ensemble',
  newsTitle: 'La newsletter Open Design',
  newsDesc:
    'Nouveaux modèles, mises à jour des design systems, événements ambassadeurs et actualités produit — directement dans votre boîte mail.',
  newsBtn: 'S’abonner',
  newsDone: 'Merci — vous êtes inscrit !',
  faqTitle: 'FAQ',
  footProduct: 'Produit',
  footCommunity: 'Communauté',
  footLegal: 'Mentions légales',
  footPartners: 'Partenaires',
};

const ru: HomeExtra = {
  heroLead:
    'От идеи до прототипа, веба, слайдов и HTML-видео — весь процесс продуктового дизайна, завершённый на вашей машине.',
  heroTitleSub: 'Лучшая open-source альтернатива Claude Design',
  heroSub:
    'Agent-native альтернатива Figma и Claude Design.\nDesktop-first, 21 кодинг-агентов, 129 дизайн-систем, лицензия Apache-2.0.',
  aboutKicker: 'Почему Open Design?',
  aboutStatement:
    'В апреле 2026 года Claude Design впервые доказал, что LLM может действительно проектировать — не писать тексты, а создавать настоящую дизайн-работу. Но он закрытый, платный и только в облаке, привязан к моделям Anthropic — никакой смены агента, самостоятельного хостинга или BYOK. Open Design делает эту возможность открытой.',
  aboutTab1: 'Нативно для десктопа',
  aboutTab2: 'Мы не создаём агентов, мы их подключаем',
  aboutTab3: 'Со временем он понимает вас',
  aboutCap1:
    'Дизайн происходит на десктопе.\nЛокальные файлы, экспорты Figma и репозитории кода читаются напрямую, а агент имеет все права на выполнение в терминале.',
  aboutCap2:
    'Claude Code / Codex / Cursor на вашей машине уже достаточно сильны.\nOpen Design встраивает их в полный дизайн-процесс.',
  aboutCap3: 'Каждый выбор оседает в дизайн-систему, предпочтения и память, и следующая генерация ближе к тому, что вам нужно.',
  stepTitle1: 'Выбрать отправную точку',
  stepTitle2: 'Задать визуальное направление',
  stepTitle3: 'Сгенерировать артефакт',
  stepTitle4: 'Сдать или сделать видео',
  stepDesc1: 'Опишите цель одной фразой или начните с шаблона / плагина.',
  stepDesc2: 'Когда направление задано, палитра, шрифты и отступы автоматически попадают в генерацию.',
  stepDesc3: 'Агент читает весь контекст, создаёт реально работающие файлы и тут же показывает и редактирует их в песочнице.',
  stepDesc4: 'Экспортируйте в разработку для продолжения или превратите в маркетинговое видео с HyperFrames.',
  capTitle: 'От идеи до сдачи — легко',
  labsPre: 'Что можно создать с ',
  labsPost: '?',
  methodTitle: 'Подключите 21+ кодинг-агентов без настройки',
  ctaTitle: 'Вернуть передовую силу ИИ-дизайна на стол каждого автора',
  testiPre: 'Со всего мира ',
  testiMid: ' участников',
  testiPost: 'вместе создают Open Design',
  newsTitle: 'Рассылка Open Design',
  newsDesc:
    'Новые шаблоны, обновления дизайн-систем, события амбассадоров и новости продукта — прямо на вашу почту.',
  newsBtn: 'Подписаться',
  newsDone: 'Спасибо — вы подписаны!',
  faqTitle: 'Частые вопросы',
  footProduct: 'Продукт',
  footCommunity: 'Сообщество',
  footLegal: 'Правовая информация',
  footPartners: 'Партнёры',
};

const es: HomeExtra = {
  heroLead:
    'De la idea al prototipo, web, slides y vídeo HTML — todo el flujo de diseño de producto, terminado en tu propia máquina.',
  heroTitleSub: 'La mejor alternativa open source a Claude Design',
  heroSub:
    'Una alternativa agent-native a Figma y Claude Design.\nDesktop-first, con 21 agentes de código, 129 design systems y licencia Apache-2.0.',
  aboutKicker: '¿Por qué Open Design?',
  aboutStatement:
    'En abril de 2026, Claude Design demostró por primera vez que un LLM puede diseñar de verdad — no escribir textos, sino producir trabajo de diseño real. Pero es de código cerrado, de pago y solo en la nube, atado a los modelos de Anthropic — sin cambio de agente, sin self-hosting, sin BYOK. Open Design abre esa capacidad.',
  aboutTab1: 'Nativo de escritorio',
  aboutTab2: 'No creamos agentes, los conectamos',
  aboutTab3: 'Te entiende con el tiempo',
  aboutCap1:
    'El diseño ocurre en el escritorio.\nArchivos locales, exportaciones de Figma y repos de código directamente legibles, y el agente tiene todo el poder de ejecución en terminal.',
  aboutCap2:
    'Los Claude Code / Codex / Cursor de tu máquina ya son lo bastante potentes.\nOpen Design los conecta en un flujo de diseño completo.',
  aboutCap3: 'Cada elección se sedimenta en un design system, preferencias y memoria, para que la siguiente generación se acerque más a lo que quieres.',
  stepTitle1: 'Elige un punto de partida',
  stepTitle2: 'Define la dirección visual',
  stepTitle3: 'Genera el artefacto',
  stepTitle4: 'Entrega o crea un vídeo',
  stepDesc1: 'Describe tu objetivo en una frase, o empieza desde una plantilla / plugin.',
  stepDesc2: 'Una vez fijada la dirección, paleta, tipografía y espaciado entran automáticamente en la generación.',
  stepDesc3: 'El agente lee todo el contexto, produce archivos reales ejecutables y los previsualiza y edita en vivo en un sandbox.',
  stepDesc4: 'Expórtalo a ingeniería para seguir construyendo, o conviértelo en un vídeo de marketing con HyperFrames.',
  capTitle: 'De la idea a la entrega, sin esfuerzo',
  labsPre: '¿Qué puedes crear con ',
  labsPost: '?',
  methodTitle: 'Conecta 21+ agentes de código, sin configuración',
  ctaTitle: 'Devuelve el poder del diseño con IA de vanguardia al escritorio de cada creador',
  testiPre: 'Desde todo el mundo, ',
  testiMid: ' colaboradores',
  testiPost: 'construyen Open Design juntos',
  newsTitle: 'La newsletter de Open Design',
  newsDesc:
    'Nuevas plantillas, actualizaciones de design systems, eventos de embajadores y novedades del producto — directo a tu bandeja de entrada.',
  newsBtn: 'Suscribirse',
  newsDone: '¡Gracias — ya estás en la lista!',
  faqTitle: 'Preguntas frecuentes',
  footProduct: 'Producto',
  footCommunity: 'Comunidad',
  footLegal: 'Legal',
  footPartners: 'Socios',
};

const ptBr: HomeExtra = {
  heroLead:
    'Da ideia ao protótipo, web, slides e vídeo HTML — todo o fluxo de design de produto, finalizado na sua própria máquina.',
  heroTitleSub: 'A melhor alternativa open source ao Claude Design',
  heroSub:
    'Uma alternativa agent-native ao Figma e ao Claude Design.\nDesktop-first, com 21 agentes de código, 129 design systems e licença Apache-2.0.',
  aboutKicker: 'Por que Open Design?',
  aboutStatement:
    'Em abril de 2026, o Claude Design provou pela primeira vez que um LLM pode realmente projetar — não escrever textos, mas produzir trabalho de design real. Mas é de código fechado, pago e só na nuvem, preso aos modelos da Anthropic — sem troca de agente, sem self-hosting, sem BYOK. O Open Design abre essa capacidade.',
  aboutTab1: 'Nativo de desktop',
  aboutTab2: 'Não criamos agentes, nós os conectamos',
  aboutTab3: 'Ele entende você com o tempo',
  aboutCap1:
    'O design acontece no desktop.\nArquivos locais, exportações do Figma e repositórios de código diretamente legíveis, e o agente tem todo o poder de execução no terminal.',
  aboutCap2:
    'Os Claude Code / Codex / Cursor na sua máquina já são fortes o suficiente.\nO Open Design os conecta em um fluxo de design completo.',
  aboutCap3: 'Cada escolha se consolida em design system, preferências e memória, para que a próxima geração chegue mais perto do que você quer.',
  stepTitle1: 'Escolha um ponto de partida',
  stepTitle2: 'Defina a direção visual',
  stepTitle3: 'Gere o artefato',
  stepTitle4: 'Entregue ou faça um vídeo',
  stepDesc1: 'Descreva seu objetivo em uma frase, ou comece a partir de um template / plugin.',
  stepDesc2: 'Definida a direção, paleta, tipografia e espaçamento entram automaticamente na geração.',
  stepDesc3: 'O agente lê todo o contexto, produz arquivos reais executáveis e os pré-visualiza e edita ao vivo em um sandbox.',
  stepDesc4: 'Exporte para a engenharia continuar, ou transforme em vídeo de marketing com o HyperFrames.',
  capTitle: 'Da ideia à entrega, sem esforço',
  labsPre: 'O que você pode criar com ',
  labsPost: '?',
  methodTitle: 'Conecte 21+ agentes de código, sem configuração',
  ctaTitle: 'Traga o poder do design com IA de ponta de volta à mesa de cada criador',
  testiPre: 'De todo o mundo, ',
  testiMid: ' colaboradores',
  testiPost: 'constroem o Open Design juntos',
  newsTitle: 'A newsletter do Open Design',
  newsDesc:
    'Novos templates, atualizações de design systems, eventos de embaixadores e novidades do produto — direto na sua caixa de entrada.',
  newsBtn: 'Assinar',
  newsDone: 'Obrigado — você está na lista!',
  faqTitle: 'Perguntas frequentes',
  footProduct: 'Produto',
  footCommunity: 'Comunidade',
  footLegal: 'Legal',
  footPartners: 'Parceiros',
};

const it: HomeExtra = {
  heroLead:
    'Dall’idea al prototipo, web, slide e video HTML — l’intero flusso di product design, completato sulla tua macchina.',
  heroTitleSub: "La migliore alternativa open source a Claude Design",
  heroSub:
    'Un’alternativa agent-native a Figma e Claude Design.\nDesktop-first, con 21 coding agent, 129 design system e licenza Apache-2.0.',
  aboutKicker: 'Perché Open Design?',
  aboutStatement:
    'Ad aprile 2026, Claude Design ha dimostrato per la prima volta che un LLM può davvero progettare — non scrivere testi, ma produrre vero lavoro di design. Ma è closed-source, a pagamento e solo cloud, legato ai modelli Anthropic — niente cambio di agente, niente self-hosting, niente BYOK. Open Design apre questa capacità.',
  aboutTab1: 'Nativo desktop',
  aboutTab2: 'Non costruiamo agenti, li colleghiamo',
  aboutTab3: 'Ti capisce col tempo',
  aboutCap1:
    'Il design accade sul desktop.\nFile locali, export da Figma e repository di codice direttamente leggibili, e l’agente ha pieni poteri di esecuzione da terminale.',
  aboutCap2:
    'I Claude Code / Codex / Cursor sulla tua macchina sono già abbastanza potenti.\nOpen Design li collega in un flusso di design completo.',
  aboutCap3: 'Ogni scelta si sedimenta in design system, preferenze e memoria, così la generazione successiva è più vicina a ciò che vuoi.',
  stepTitle1: 'Scegli un punto di partenza',
  stepTitle2: 'Definisci la direzione visiva',
  stepTitle3: 'Genera l’artefatto',
  stepTitle4: 'Consegna o crea un video',
  stepDesc1: 'Descrivi il tuo obiettivo in una frase, o parti da un template / plugin.',
  stepDesc2: 'Definita la direzione, palette, font e spaziature entrano automaticamente nella generazione.',
  stepDesc3: 'L’agente legge tutto il contesto, produce file realmente eseguibili e li mostra e modifica in tempo reale in una sandbox.',
  stepDesc4: 'Esportalo all’ingegneria per continuare, o trasformalo in un video marketing con HyperFrames.',
  capTitle: 'Dall’idea alla consegna, senza sforzo',
  labsPre: 'Cosa puoi creare con ',
  labsPost: '?',
  methodTitle: 'Collega 21+ coding agent, zero configurazione',
  ctaTitle: 'Riporta la potenza del design con AI di frontiera sulla scrivania di ogni creativo',
  testiPre: 'Da tutto il mondo, ',
  testiMid: ' contributori',
  testiPost: 'costruiscono Open Design insieme',
  newsTitle: 'La newsletter di Open Design',
  newsDesc:
    'Nuovi template, aggiornamenti dei design system, eventi ambassador e novità di prodotto — direttamente nella tua casella.',
  newsBtn: 'Iscriviti',
  newsDone: 'Grazie — sei in lista!',
  faqTitle: 'FAQ',
  footProduct: 'Prodotto',
  footCommunity: 'Community',
  footLegal: 'Note legali',
  footPartners: 'Partner',
};

const vi: HomeExtra = {
  heroLead:
    'Từ ý tưởng đến prototype, web, slide và video HTML — toàn bộ quy trình thiết kế sản phẩm, hoàn tất ngay trên máy của bạn.',
  heroTitleSub: 'Lựa chọn mã nguồn mở tốt nhất thay Claude Design',
  heroSub:
    'Giải pháp agent-native thay thế cho Figma và Claude Design.\nƯu tiên desktop, với 21 coding agent, 129 design system và giấy phép Apache-2.0.',
  aboutKicker: 'Vì sao chọn Open Design?',
  aboutStatement:
    'Tháng 4 năm 2026, Claude Design lần đầu chứng minh rằng LLM có thể thực sự thiết kế — không phải viết chữ, mà tạo ra sản phẩm thiết kế thật. Nhưng nó đóng mã nguồn, trả phí và chỉ chạy trên đám mây, khóa vào mô hình Anthropic — không đổi agent, không self-host, không BYOK. Open Design mở khả năng đó ra.',
  aboutTab1: 'Gốc desktop',
  aboutTab2: 'Chúng tôi không tạo agent, mà kết nối chúng',
  aboutTab3: 'Càng dùng càng hiểu bạn',
  aboutCap1:
    'Thiết kế diễn ra trên desktop.\nFile cục bộ, bản xuất Figma và kho mã đọc được trực tiếp, agent có toàn quyền thực thi terminal.',
  aboutCap2:
    'Claude Code / Codex / Cursor trên máy bạn đã đủ mạnh.\nOpen Design kết nối chúng vào một quy trình thiết kế hoàn chỉnh.',
  aboutCap3: 'Mỗi lựa chọn lắng lại thành design system, sở thích và ký ức, để lần tạo sau gần hơn với điều bạn muốn.',
  stepTitle1: 'Chọn điểm bắt đầu',
  stepTitle2: 'Xác định hướng hình ảnh',
  stepTitle3: 'Tạo Artifact',
  stepTitle4: 'Bàn giao hoặc dựng video',
  stepDesc1: 'Mô tả mục tiêu trong một câu, hoặc bắt đầu từ template / plugin.',
  stepDesc2: 'Khi đã chọn hướng, bảng màu, font và khoảng cách tự động đưa vào luồng tạo.',
  stepDesc3: 'Agent đọc toàn bộ ngữ cảnh, tạo ra file thật chạy được, xem trước và chỉnh sửa ngay trong sandbox.',
  stepDesc4: 'Xuất sang kỹ thuật để phát triển tiếp, hoặc chuyển thẳng thành video marketing bằng HyperFrames.',
  capTitle: 'Từ ý tưởng đến bàn giao, nhẹ nhàng',
  labsPre: 'Bạn có thể tạo gì với ',
  labsPost: '?',
  methodTitle: 'Kết nối 21+ coding agent, không cần cấu hình',
  ctaTitle: 'Đưa sức mạnh thiết kế AI tiên tiến về bàn của mọi nhà sáng tạo',
  testiPre: 'Từ khắp thế giới, ',
  testiMid: ' người đóng góp',
  testiPost: 'đang cùng xây dựng Open Design',
  newsTitle: 'Bản tin Open Design',
  newsDesc:
    'Template mới, cập nhật design system, sự kiện đại sứ và tin tức sản phẩm — gửi thẳng vào hộp thư của bạn.',
  newsBtn: 'Đăng ký',
  newsDone: 'Cảm ơn — bạn đã đăng ký!',
  faqTitle: 'Câu hỏi thường gặp',
  footProduct: 'Sản phẩm',
  footCommunity: 'Cộng đồng',
  footLegal: 'Pháp lý',
  footPartners: 'Đối tác',
};

const pl: HomeExtra = {
  heroLead:
    'Od pomysłu po prototyp, web, slajdy i wideo HTML — cały proces projektowania produktu, ukończony na własnej maszynie.',
  heroTitleSub: 'Najlepsza open-source alternatywa dla Claude Design',
  heroSub:
    'Agent-native alternatywa dla Figmy i Claude Design.\nDesktop-first, z 21 agentami kodu, 129 design systemami i licencją Apache-2.0.',
  aboutKicker: 'Dlaczego Open Design?',
  aboutStatement:
    'W kwietniu 2026 Claude Design po raz pierwszy udowodnił, że LLM potrafi naprawdę projektować — nie pisać teksty, lecz tworzyć prawdziwą pracę projektową. Ale jest zamknięty, płatny i tylko w chmurze, przywiązany do modeli Anthropic — bez zmiany agenta, bez self-hostingu, bez BYOK. Open Design otwiera tę możliwość.',
  aboutTab1: 'Natywny na desktopie',
  aboutTab2: 'Nie budujemy agentów, podłączamy je',
  aboutTab3: 'Z czasem rozumie Ciebie',
  aboutCap1:
    'Projektowanie dzieje się na desktopie.\nPliki lokalne, eksporty z Figmy i repozytoria kodu są bezpośrednio czytelne, a agent ma pełne uprawnienia wykonywania w terminalu.',
  aboutCap2:
    'Claude Code / Codex / Cursor na Twoim komputerze są już wystarczająco mocne.\nOpen Design wpina je w kompletny proces projektowy.',
  aboutCap3: 'Każdy wybór osadza się w design systemie, preferencjach i pamięci, więc kolejna generacja jest bliżej tego, czego chcesz.',
  stepTitle1: 'Wybierz punkt startowy',
  stepTitle2: 'Ustal kierunek wizualny',
  stepTitle3: 'Wygeneruj artefakt',
  stepTitle4: 'Dostarcz lub zrób wideo',
  stepDesc1: 'Opisz cel w jednym zdaniu lub zacznij od szablonu / pluginu.',
  stepDesc2: 'Gdy kierunek jest ustalony, paleta, typografia i odstępy trafiają automatycznie do generowania.',
  stepDesc3: 'Agent czyta cały kontekst, tworzy realnie działające pliki i podgląda oraz edytuje je na żywo w sandboxie.',
  stepDesc4: 'Wyeksportuj do inżynierii, by budować dalej, lub zamień w wideo marketingowe z HyperFrames.',
  capTitle: 'Od pomysłu do dostarczenia, z łatwością',
  labsPre: 'Co możesz stworzyć z ',
  labsPost: '?',
  methodTitle: 'Podłącz 21+ agentów kodu, bez konfiguracji',
  ctaTitle: 'Przywróć moc nowoczesnego projektowania AI na biurko każdego twórcy',
  testiPre: 'Z całego świata ',
  testiMid: ' współtwórców',
  testiPost: 'wspólnie buduje Open Design',
  newsTitle: 'Newsletter Open Design',
  newsDesc:
    'Nowe szablony, aktualizacje design systemów, wydarzenia ambasadorskie i nowości produktowe — prosto do Twojej skrzynki.',
  newsBtn: 'Subskrybuj',
  newsDone: 'Dzięki — jesteś na liście!',
  faqTitle: 'FAQ',
  footProduct: 'Produkt',
  footCommunity: 'Społeczność',
  footLegal: 'Informacje prawne',
  footPartners: 'Partnerzy',
};

const id: HomeExtra = {
  heroLead:
    'Dari ide ke prototipe, web, slide, dan video HTML — seluruh alur desain produk, selesai di mesin Anda sendiri.',
  heroTitleSub: 'Alternatif open source terbaik untuk Claude Design',
  heroSub:
    'Alternatif agent-native untuk Figma dan Claude Design.\nDesktop-first, dengan 21 coding agent, 129 design system, dan lisensi Apache-2.0.',
  aboutKicker: 'Mengapa Open Design?',
  aboutStatement:
    'Pada April 2026, Claude Design pertama kali membuktikan bahwa LLM benar-benar bisa mendesain — bukan menulis teks, melainkan menghasilkan karya desain nyata. Tapi ia tertutup, berbayar, dan hanya cloud, terkunci pada model Anthropic — tanpa ganti agen, tanpa self-hosting, tanpa BYOK. Open Design membuka kemampuan itu.',
  aboutTab1: 'Native desktop',
  aboutTab2: 'Kami tidak membuat agen, kami menyambungkannya',
  aboutTab3: 'Makin dipakai, makin paham Anda',
  aboutCap1:
    'Desain terjadi di desktop.\nFile lokal, ekspor Figma, dan repo kode langsung terbaca, dan agen punya seluruh kuasa eksekusi terminal.',
  aboutCap2:
    'Claude Code / Codex / Cursor di mesin Anda sudah cukup kuat.\nOpen Design menyambungkannya ke alur desain yang lengkap.',
  aboutCap3: 'Setiap pilihan mengendap menjadi design system, preferensi, dan memori, sehingga generasi berikutnya lebih dekat dengan yang Anda mau.',
  stepTitle1: 'Pilih titik awal',
  stepTitle2: 'Tentukan arah visual',
  stepTitle3: 'Hasilkan artifact',
  stepTitle4: 'Kirim atau buat video',
  stepDesc1: 'Jelaskan tujuan dalam satu kalimat, atau mulai dari template / plugin.',
  stepDesc2: 'Setelah arah ditetapkan, palet, font, dan spasi otomatis masuk ke alur generasi.',
  stepDesc3: 'Agen membaca seluruh konteks, menghasilkan file nyata yang bisa dijalankan, lalu pratinjau dan edit langsung di sandbox.',
  stepDesc4: 'Ekspor ke engineering untuk lanjut dibangun, atau ubah jadi video marketing dengan HyperFrames.',
  capTitle: 'Dari ide ke pengiriman, dengan mudah',
  labsPre: 'Apa yang bisa Anda buat dengan ',
  labsPost: '?',
  methodTitle: 'Sambungkan 21+ coding agent, tanpa konfigurasi',
  ctaTitle: 'Kembalikan kekuatan desain AI mutakhir ke meja setiap kreator',
  testiPre: 'Dari seluruh dunia, ',
  testiMid: ' kontributor',
  testiPost: 'membangun Open Design bersama',
  newsTitle: 'Newsletter Open Design',
  newsDesc:
    'Template baru, pembaruan design system, acara ambassador, dan kabar produk — langsung ke kotak masuk Anda.',
  newsBtn: 'Berlangganan',
  newsDone: 'Terima kasih — Anda sudah terdaftar!',
  faqTitle: 'Pertanyaan umum',
  footProduct: 'Produk',
  footCommunity: 'Komunitas',
  footLegal: 'Legal',
  footPartners: 'Mitra',
};

const nl: HomeExtra = {
  heroLead:
    'Van idee tot prototype, web, slides en HTML-video — de hele productdesign-flow, afgerond op je eigen machine.',
  heroTitleSub: 'Het beste open-source alternatief voor Claude Design',
  heroSub:
    'Een agent-native alternatief voor Figma en Claude Design.\nDesktop-first, met 21 coding agents, 129 design systems en een Apache-2.0-licentie.',
  aboutKicker: 'Waarom Open Design?',
  aboutStatement:
    'In april 2026 bewees Claude Design voor het eerst dat een LLM echt kan ontwerpen — geen teksten schrijven, maar echt designwerk maken. Maar het is closed-source, betaald en alleen cloud, vastgezet op Anthropic-modellen — geen agent wisselen, geen self-hosting, geen BYOK. Open Design opent die mogelijkheid.',
  aboutTab1: 'Desktop-native',
  aboutTab2: 'We bouwen geen agents, we koppelen ze',
  aboutTab3: 'Het leert je na verloop van tijd kennen',
  aboutCap1:
    'Design gebeurt op de desktop.\nLokale bestanden, Figma-exports en code-repos zijn direct leesbaar, en de agent heeft volledige terminal-uitvoeringsrechten.',
  aboutCap2:
    'De Claude Code / Codex / Cursor op je machine zijn al sterk genoeg.\nOpen Design koppelt ze in een complete design-workflow.',
  aboutCap3: 'Elke keuze bezinkt tot een design system, voorkeuren en geheugen, zodat de volgende generatie dichter bij komt wat je wilt.',
  stepTitle1: 'Kies een startpunt',
  stepTitle2: 'Bepaal de visuele richting',
  stepTitle3: 'Genereer het artefact',
  stepTitle4: 'Lever op of maak een video',
  stepDesc1: 'Beschrijf je doel in één zin, of start vanuit een template / plugin.',
  stepDesc2: 'Zodra de richting vaststaat, stromen palet, typografie en spacing automatisch in de generatie.',
  stepDesc3: 'De agent leest alle context, produceert echt uitvoerbare bestanden en toont en bewerkt ze live in een sandbox.',
  stepDesc4: 'Exporteer naar engineering om door te bouwen, of maak er met HyperFrames direct een marketingvideo van.',
  capTitle: 'Van idee tot oplevering, moeiteloos',
  labsPre: 'Wat kun je maken met ',
  labsPost: '?',
  methodTitle: 'Koppel 21+ coding agents, zonder configuratie',
  ctaTitle: 'Breng geavanceerde AI-designkracht terug naar het bureau van elke maker',
  testiPre: 'Van over de hele wereld bouwen ',
  testiMid: ' bijdragers',
  testiPost: 'samen aan Open Design',
  newsTitle: 'De Open Design-nieuwsbrief',
  newsDesc:
    'Nieuwe templates, design-system-updates, ambassadeursevents en productnieuws — rechtstreeks in je inbox.',
  newsBtn: 'Abonneren',
  newsDone: 'Bedankt — je staat op de lijst!',
  faqTitle: 'FAQ',
  footProduct: 'Product',
  footCommunity: 'Community',
  footLegal: 'Juridisch',
  footPartners: 'Partners',
};

const ar: HomeExtra = {
  heroLead:
    'من الفكرة إلى النموذج الأولي والويب والشرائح وفيديو HTML — مسار تصميم المنتج كاملاً، منجَزاً على جهازك.',
  heroTitleSub: 'أفضل بديل مفتوح المصدر لـ Claude Design',
  heroSub:
    'بديل أصيل للوكلاء عن Figma و Claude Design.\nالأولوية لسطح المكتب، مع 21 وكيل برمجة و129 نظام تصميم ورخصة Apache-2.0.',
  aboutKicker: 'لماذا Open Design؟',
  aboutStatement:
    'في أبريل 2026، أثبت Claude Design لأول مرة أن نموذج اللغة يمكنه التصميم فعلاً — لا كتابة النصوص، بل إنتاج عمل تصميمي حقيقي. لكنه مغلق المصدر ومدفوع وسحابي فقط، مقيّد بنماذج Anthropic — لا تبديل للوكيل، ولا استضافة ذاتية، ولا BYOK. يفتح Open Design هذه القدرة.',
  aboutTab1: 'أصيل لسطح المكتب',
  aboutTab2: 'لا نصنع الوكلاء، بل نوصّلهم',
  aboutTab3: 'يفهمك أكثر مع الاستخدام',
  aboutCap1:
    'التصميم يحدث على سطح المكتب.\nالملفات المحلية وصادرات Figma ومستودعات الكود قابلة للقراءة مباشرة، وللوكيل صلاحية تنفيذ كاملة في الطرفية.',
  aboutCap2:
    'إن Claude Code / Codex / Cursor على جهازك قوية بما يكفي.\nيقوم Open Design بوصلها ضمن سير عمل تصميمي متكامل.',
  aboutCap3: 'كل اختيار يترسّب في نظام تصميم وتفضيلات وذاكرة، لتقترب النتيجة التالية أكثر مما تريد.',
  stepTitle1: 'اختر نقطة البداية',
  stepTitle2: 'حدّد الاتجاه البصري',
  stepTitle3: 'ولّد الـ Artifact',
  stepTitle4: 'سلّم أو اصنع فيديو',
  stepDesc1: 'صِف هدفك في جملة واحدة، أو ابدأ من قالب / إضافة.',
  stepDesc2: 'بعد تحديد الاتجاه، تدخل لوحة الألوان والخطوط والمسافات تلقائياً في التوليد.',
  stepDesc3: 'يقرأ الوكيل كل السياق، وينتج ملفات حقيقية قابلة للتشغيل، ويعاينها ويعدّلها فوراً في بيئة معزولة.',
  stepDesc4: 'صدّره إلى الهندسة لمواصلة البناء، أو حوّله مباشرة إلى فيديو تسويقي عبر HyperFrames.',
  capTitle: 'من الفكرة إلى التسليم، بسهولة',
  labsPre: 'ماذا يمكنك أن تصنع باستخدام ',
  labsPost: '؟',
  methodTitle: 'وصّل أكثر من 21 وكيل برمجة، بدون أي إعداد',
  ctaTitle: 'أعِد قوة تصميم الذكاء الاصطناعي المتقدّمة إلى مكتب كل مبدع',
  testiPre: 'من حول العالم، ',
  testiMid: ' مساهماً',
  testiPost: 'يبنون Open Design معاً',
  newsTitle: 'نشرة Open Design البريدية',
  newsDesc:
    'قوالب جديدة، وتحديثات أنظمة التصميم، وفعاليات السفراء، وأخبار المنتج — مباشرة إلى بريدك.',
  newsBtn: 'اشترك',
  newsDone: 'شكراً — تم اشتراكك!',
  faqTitle: 'الأسئلة الشائعة',
  footProduct: 'المنتج',
  footCommunity: 'المجتمع',
  footLegal: 'الشؤون القانونية',
  footPartners: 'الشركاء',
};

const tr: HomeExtra = {
  heroLead:
    'Fikirden prototipe, web’e, slaytlara ve HTML videoya — tüm ürün tasarım akışı, kendi makinende tamamlanır.',
  heroTitleSub: "Claude Design'ın en iyi açık kaynak alternatifi",
  heroSub:
    'Figma ve Claude Design’a agent-native bir alternatif.\nÖnce masaüstü; 21 kodlama ajanı, 129 tasarım sistemi ve Apache-2.0 lisansı.',
  aboutKicker: 'Neden Open Design?',
  aboutStatement:
    'Nisan 2026’da Claude Design, bir LLM’in gerçekten tasarım yapabildiğini ilk kez kanıtladı — metin yazmak değil, gerçek tasarım işi üretmek. Ama kapalı kaynak, ücretli ve yalnızca bulutta, Anthropic modellerine kilitli — ajan değiştirme yok, self-hosting yok, BYOK yok. Open Design bu yeteneği açar.',
  aboutTab1: 'Masaüstü yerel',
  aboutTab2: 'Ajan üretmiyoruz, onları bağlıyoruz',
  aboutTab3: 'Kullandıkça seni anlar',
  aboutCap1:
    'Tasarım masaüstünde olur.\nYerel dosyalar, Figma dışa aktarımları ve kod depoları doğrudan okunur; ajanın tam terminal yürütme gücü vardır.',
  aboutCap2:
    'Makinendeki Claude Code / Codex / Cursor zaten yeterince güçlü.\nOpen Design onları eksiksiz bir tasarım akışına bağlar.',
  aboutCap3: 'Her seçim bir tasarım sistemine, tercihlere ve hafızaya çöker; böylece sonraki üretim istediğine daha çok yaklaşır.',
  stepTitle1: 'Bir başlangıç noktası seç',
  stepTitle2: 'Görsel yönü belirle',
  stepTitle3: 'Artifact üret',
  stepTitle4: 'Teslim et ya da video yap',
  stepDesc1: 'Hedefini tek cümleyle anlat ya da bir şablon / eklentiden başla.',
  stepDesc2: 'Yön belirlenince palet, tipografi ve boşluklar otomatik olarak üretime akar.',
  stepDesc3: 'Ajan tüm bağlamı okur, gerçekten çalışan dosyalar üretir ve bunları bir sandbox’ta anında önizleyip düzenler.',
  stepDesc4: 'Geliştirmeyi sürdürmek için mühendisliğe aktar ya da HyperFrames ile doğrudan pazarlama videosuna dönüştür.',
  capTitle: 'Fikirden teslimata, zahmetsizce',
  labsPre: '',
  labsPost: ' ile neler üretebilirsin?',
  methodTitle: '21+ kodlama ajanını sıfır yapılandırmayla bağla',
  ctaTitle: 'İleri seviye yapay zeka tasarım gücünü her üreticinin masasına geri getir',
  testiPre: 'Dünyanın her yerinden ',
  testiMid: ' katkıcı',
  testiPost: 'birlikte Open Design’ı inşa ediyor',
  newsTitle: 'Open Design bülteni',
  newsDesc:
    'Yeni şablonlar, tasarım sistemi güncellemeleri, elçi etkinlikleri ve ürün haberleri — doğrudan gelen kutuna.',
  newsBtn: 'Abone ol',
  newsDone: 'Teşekkürler — listedesin!',
  faqTitle: 'SSS',
  footProduct: 'Ürün',
  footCommunity: 'Topluluk',
  footLegal: 'Yasal',
  footPartners: 'Ortaklar',
};

const uk: HomeExtra = {
  heroLead:
    'Від ідеї до прототипу, вебу, слайдів і HTML-відео — увесь процес продуктового дизайну, завершений на вашій машині.',
  heroTitleSub: 'Найкраща open-source альтернатива Claude Design',
  heroSub:
    'Agent-native альтернатива Figma та Claude Design.\nDesktop-first, з 21 кодинг-агентами, 129 дизайн-системами та ліцензією Apache-2.0.',
  aboutKicker: 'Чому Open Design?',
  aboutStatement:
    'У квітні 2026 року Claude Design уперше довів, що LLM може справді проєктувати — не писати тексти, а створювати реальну дизайн-роботу. Але він закритий, платний і лише в хмарі, прив’язаний до моделей Anthropic — без зміни агента, без self-hosting, без BYOK. Open Design відкриває цю можливість.',
  aboutTab1: 'Нативний для десктопа',
  aboutTab2: 'Ми не створюємо агентів, ми їх під’єднуємо',
  aboutTab3: 'З часом він розуміє вас',
  aboutCap1:
    'Дизайн відбувається на десктопі.\nЛокальні файли, експорти Figma та репозиторії коду читаються напряму, а агент має всі права на виконання в терміналі.',
  aboutCap2:
    'Claude Code / Codex / Cursor на вашій машині вже достатньо потужні.\nOpen Design вбудовує їх у повний дизайн-процес.',
  aboutCap3: 'Кожен вибір осідає в дизайн-систему, уподобання та пам’ять, тож наступна генерація ближча до того, що ви хочете.',
  stepTitle1: 'Обрати відправну точку',
  stepTitle2: 'Задати візуальний напрям',
  stepTitle3: 'Згенерувати артефакт',
  stepTitle4: 'Здати або зробити відео',
  stepDesc1: 'Опишіть мету однією фразою або почніть із шаблона / плагіна.',
  stepDesc2: 'Коли напрям задано, палітра, шрифти й відступи автоматично потрапляють у генерацію.',
  stepDesc3: 'Агент читає весь контекст, створює реально робочі файли й одразу показує та редагує їх у пісочниці.',
  stepDesc4: 'Експортуйте в розробку, щоб продовжити, або перетворіть на маркетингове відео за допомогою HyperFrames.',
  capTitle: 'Від ідеї до здачі — легко',
  labsPre: 'Що можна створити з ',
  labsPost: '?',
  methodTitle: 'Під’єднайте 21+ кодинг-агентів без налаштувань',
  ctaTitle: 'Поверніть передову силу ШІ-дизайну на стіл кожного автора',
  testiPre: 'З усього світу ',
  testiMid: ' учасників',
  testiPost: 'разом будують Open Design',
  newsTitle: 'Розсилка Open Design',
  newsDesc:
    'Нові шаблони, оновлення дизайн-систем, події амбасадорів і новини продукту — просто на вашу пошту.',
  newsBtn: 'Підписатися',
  newsDone: 'Дякуємо — ви підписані!',
  faqTitle: 'Часті запитання',
  footProduct: 'Продукт',
  footCommunity: 'Спільнота',
  footLegal: 'Правова інформація',
  footPartners: 'Партнери',
};

const TABLE: Partial<Record<LandingLocaleCode, HomeExtra>> = {
  en,
  zh,
  'zh-tw': zhTw,
  ja,
  ko,
  de,
  fr,
  ru,
  es,
  'pt-br': ptBr,
  it,
  vi,
  pl,
  id,
  nl,
  ar,
  tr,
  uk,
};

/** Localized copy for the homepage visual modules; falls back to English. */
export function getHomeExtra(locale: LandingLocaleCode): HomeExtra {
  return TABLE[locale] ?? en;
}
