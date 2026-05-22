import {
  DEFAULT_LOCALE,
  getLocaleDefinition,
  type LandingLocaleCode,
  type LocalizedStringValue,
} from './i18n';

type ContentCopy = {
  skillNoun: string;
  systemNoun: string;
  templateNoun: string;
  craftNoun: string;
  pluginNoun: string;
  blogNoun: string;
  unknownTag: string;
  skillDescription: (name: string, labels: string[]) => string;
  systemTagline: (name: string, category: string) => string;
  systemAtmosphere: (name: string, category: string, paletteCount: number) => string;
  craftName: (name: string) => string;
  craftSummary: (name: string) => string;
  templateName: (name: string) => string;
  templateSummary: (name: string) => string;
  pluginTitle: (kind: string, id: string) => string;
  pluginDescription: (kind: string, labels: string[]) => string;
  pluginExample: (kind: string) => string;
  blogTitle: (topic: string) => string;
  blogSummary: (topic: string) => string;
  blogBody: (topic: string, summary: string) => string;
};

const CONTENT_COPY: Record<Exclude<LandingLocaleCode, 'en'>, ContentCopy> = {
  zh: {
    skillNoun: 'Skill',
    systemNoun: '设计系统',
    templateNoun: '模板',
    craftNoun: '工艺规则',
    pluginNoun: '插件',
    blogNoun: '文章',
    unknownTag: '分类',
    skillDescription: (name, labels) => `${name} 是一个可组合的 Open Design Skill，用于${labels.join('、') || '设计产出'}工作流；可由本地代理调用，并和仓库中的设计系统一起复用。`,
    systemTagline: (name, category) => `${name} 设计系统将${category}风格整理成可移植的 DESIGN.md 规则，供每个 Skill 复用。`,
    systemAtmosphere: (name, category, paletteCount) => `${name} 以${category}为视觉方向，包含 ${paletteCount} 个核心色板、排版节奏、组件边界和反模式约束。`,
    craftName: (name) => `${name}工艺规则`,
    craftSummary: (name) => `这条 Open Design 工艺规则定义 ${name} 的执行标准，帮助代理在生成 artifact 时保持一致、可读和可交付。`,
    templateName: (name) => `${name}模板`,
    templateSummary: (name) => `${name} 是可复用的 Open Design Live Artifact 模板，包含渲染入口、示例数据和可 fork 的文件结构。`,
    pluginTitle: (kind, id) => `${kind}插件 · ${id}`,
    pluginDescription: (kind, labels) => `用于${kind}工作流的 Open Design 插件。安装后可在本地 daemon 和 od CLI 中复用${labels.length ? `，覆盖${labels.join('、')}` : ''}。`,
    pluginExample: (kind) => `使用该插件创建一个${kind}任务，并在本地 Open Design 工作区中查看生成结果。`,
    blogTitle: (topic) => `Open Design 指南：${topic}`,
    blogSummary: (topic) => `这篇本地化摘要说明 ${topic} 与 Open Design 的本地优先、BYOK 和可组合 Skill 工作流之间的关系。`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>本地化摘要</h2><p>这篇文章围绕 ${topic} 展开，说明 Open Design 如何把设计 artifact、Skill、设计系统和本地代理工作流连接起来。</p><p>当前页面使用站内 i18n fallback 渲染本地化正文；完整人工翻译可继续通过 frontmatter 的 <code>i18n.bodyHtml</code> 覆盖。</p>`,
  },
  'zh-tw': {
    skillNoun: 'Skill',
    systemNoun: '設計系統',
    templateNoun: '模板',
    craftNoun: '工藝規則',
    pluginNoun: '外掛',
    blogNoun: '文章',
    unknownTag: '分類',
    skillDescription: (name, labels) => `${name} 是一個可組合的 Open Design Skill，用於${labels.join('、') || '設計產出'}工作流；可由本地代理呼叫，並和 repo 中的設計系統一起複用。`,
    systemTagline: (name, category) => `${name} 設計系統將${category}風格整理成可攜式 DESIGN.md 規則，供每個 Skill 複用。`,
    systemAtmosphere: (name, category, paletteCount) => `${name} 以${category}為視覺方向，包含 ${paletteCount} 個核心色板、排版節奏、元件邊界和反模式約束。`,
    craftName: (name) => `${name}工藝規則`,
    craftSummary: (name) => `這條 Open Design 工藝規則定義 ${name} 的執行標準，幫助代理在生成 artifact 時保持一致、可讀和可交付。`,
    templateName: (name) => `${name}模板`,
    templateSummary: (name) => `${name} 是可複用的 Open Design Live Artifact 模板，包含渲染入口、示例資料和可 fork 的檔案結構。`,
    pluginTitle: (kind, id) => `${kind}外掛 · ${id}`,
    pluginDescription: (kind, labels) => `用於${kind}工作流的 Open Design 外掛。安裝後可在本地 daemon 和 od CLI 中複用${labels.length ? `，覆蓋${labels.join('、')}` : ''}。`,
    pluginExample: (kind) => `使用該外掛建立一個${kind}任務，並在本地 Open Design 工作區中查看生成結果。`,
    blogTitle: (topic) => `Open Design 指南：${topic}`,
    blogSummary: (topic) => `這篇本地化摘要說明 ${topic} 與 Open Design 的本地優先、BYOK 和可組合 Skill 工作流之間的關係。`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>本地化摘要</h2><p>這篇文章圍繞 ${topic} 展開，說明 Open Design 如何把設計 artifact、Skill、設計系統和本地代理工作流連接起來。</p><p>目前頁面使用站內 i18n fallback 渲染本地化正文；完整人工翻譯可繼續透過 frontmatter 的 <code>i18n.bodyHtml</code> 覆蓋。</p>`,
  },
  ja: {
    skillNoun: 'スキル',
    systemNoun: 'デザインシステム',
    templateNoun: 'テンプレート',
    craftNoun: 'クラフトルール',
    pluginNoun: 'プラグイン',
    blogNoun: '記事',
    unknownTag: '分類',
    skillDescription: (name, labels) => `${name} は、${labels.join('、') || 'デザイン制作'}のための Open Design スキルです。ローカルエージェントから呼び出せ、リポジトリ内のデザインシステムと一緒に再利用できます。`,
    systemTagline: (name, category) => `${name} は ${category} の方向性を DESIGN.md として整理した、移植可能なデザインシステムです。`,
    systemAtmosphere: (name, category, paletteCount) => `${name} は ${category} を基調に、${paletteCount} 個のパレット、タイポグラフィ、コンポーネント境界、避けるべきパターンを定義します。`,
    craftName: (name) => `${name} のクラフトルール`,
    craftSummary: (name) => `${name} の実行基準を定義し、エージェントが一貫して読みやすく納品可能な artifact を生成できるようにします。`,
    templateName: (name) => `${name} テンプレート`,
    templateSummary: (name) => `${name} は再利用可能な Open Design Live Artifact テンプレートで、レンダー入口、サンプルデータ、fork 可能な構成を含みます。`,
    pluginTitle: (kind, id) => `${kind} プラグイン · ${id}`,
    pluginDescription: (kind, labels) => `${kind} ワークフロー向けの Open Design プラグインです。インストール後はローカル daemon と od CLI から再利用できます${labels.length ? `。対象: ${labels.join('、')}` : ''}。`,
    pluginExample: (kind) => `このプラグインで ${kind} タスクを作成し、ローカルの Open Design ワークスペースで結果を確認します。`,
    blogTitle: (topic) => `Open Design ガイド: ${topic}`,
    blogSummary: (topic) => `${topic} と、Open Design のローカルファースト、BYOK、構成可能なスキルワークフローの関係をまとめます。`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>ローカライズ概要</h2><p>この記事は ${topic} を起点に、Open Design が artifact、スキル、デザインシステム、ローカルエージェントをどう接続するかを説明します。</p><p>このページは i18n fallback で本文を表示しています。完全な人手翻訳は frontmatter の <code>i18n.bodyHtml</code> で上書きできます。</p>`,
  },
  ko: {
    skillNoun: '스킬',
    systemNoun: '디자인 시스템',
    templateNoun: '템플릿',
    craftNoun: '크래프트 규칙',
    pluginNoun: '플러그인',
    blogNoun: '글',
    unknownTag: '분류',
    skillDescription: (name, labels) => `${name}은 ${labels.join(', ') || '디자인 산출물'} 워크플로를 위한 조합 가능한 Open Design 스킬입니다. 로컬 에이전트가 호출하고 저장소의 디자인 시스템과 함께 재사용할 수 있습니다.`,
    systemTagline: (name, category) => `${name} 디자인 시스템은 ${category} 방향을 이식 가능한 DESIGN.md 규칙으로 정리합니다.`,
    systemAtmosphere: (name, category, paletteCount) => `${name}은 ${category} 분위기를 바탕으로 ${paletteCount}개의 팔레트, 타이포그래피 리듬, 컴포넌트 경계, 안티패턴을 정의합니다.`,
    craftName: (name) => `${name} 크래프트 규칙`,
    craftSummary: (name) => `${name}의 실행 기준을 정의해 에이전트가 일관되고 읽기 쉬운 artifact를 만들도록 돕습니다.`,
    templateName: (name) => `${name} 템플릿`,
    templateSummary: (name) => `${name}은 재사용 가능한 Open Design Live Artifact 템플릿이며 렌더링入口, 샘플 데이터, fork 가능한 구조를 포함합니다.`,
    pluginTitle: (kind, id) => `${kind} 플러그인 · ${id}`,
    pluginDescription: (kind, labels) => `${kind} 워크플로용 Open Design 플러그인입니다. 설치 후 로컬 daemon과 od CLI에서 재사용할 수 있습니다${labels.length ? `: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `이 플러그인으로 ${kind} 작업을 만들고 로컬 Open Design 워크스페이스에서 결과를 확인합니다.`,
    blogTitle: (topic) => `Open Design 가이드: ${topic}`,
    blogSummary: (topic) => `${topic}이 Open Design의 로컬 우선, BYOK, 조합 가능한 스킬 워크플로와 어떻게 연결되는지 요약합니다.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>현지화 요약</h2><p>이 글은 ${topic}을 중심으로 Open Design이 artifact, 스킬, 디자인 시스템, 로컬 에이전트를 어떻게 연결하는지 설명합니다.</p><p>현재 본문은 i18n fallback으로 렌더링됩니다. 완전한 번역은 frontmatter의 <code>i18n.bodyHtml</code>로 덮어쓸 수 있습니다.</p>`,
  },
  de: {
    skillNoun: 'Skill',
    systemNoun: 'Designsystem',
    templateNoun: 'Vorlage',
    craftNoun: 'Gestaltungsregel',
    pluginNoun: 'Plugin',
    blogNoun: 'Artikel',
    unknownTag: 'Kategorie',
    skillDescription: (name, labels) => `${name} ist ein kombinierbarer Open-Design-Skill fuer ${labels.join(', ') || 'Design-Artefakte'}. Er laesst sich lokal vom Agenten ausfuehren und mit DESIGN.md-Systemen wiederverwenden.`,
    systemTagline: (name, category) => `${name} buendelt die Richtung ${category} als portables DESIGN.md-System fuer alle Skills.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} uebersetzt ${category} in ${paletteCount} Kernfarben, Typografie, Komponentenregeln und Anti-Patterns.`,
    craftName: (name) => `${name}-Gestaltungsregel`,
    craftSummary: (name) => `Diese Open-Design-Regel definiert Standards fuer ${name}, damit Agenten konsistente und lieferbare Artefakte erzeugen.`,
    templateName: (name) => `${name}-Vorlage`,
    templateSummary: (name) => `${name} ist eine wiederverwendbare Live-Artifact-Vorlage mit Render-Einstieg, Beispieldaten und forkbarer Struktur.`,
    pluginTitle: (kind, id) => `${kind}-Plugin · ${id}`,
    pluginDescription: (kind, labels) => `Open-Design-Plugin fuer ${kind}-Workflows. Nach der Installation ist es lokal ueber daemon und od CLI nutzbar${labels.length ? `; Schwerpunkte: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Erstelle mit diesem Plugin eine ${kind}-Aufgabe und pruefe das Ergebnis im lokalen Open-Design-Workspace.`,
    blogTitle: (topic) => `Open-Design-Leitfaden: ${topic}`,
    blogSummary: (topic) => `Lokalisierte Zusammenfassung zu ${topic} und dem lokalen BYOK-Skill-Workflow von Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Lokalisierte Zusammenfassung</h2><p>Dieser Beitrag erklaert, wie Open Design ${topic} mit Artefakten, Skills, Designsystemen und lokalen Agenten verbindet.</p><p>Der Text nutzt aktuell einen i18n-Fallback. Eine vollstaendige Uebersetzung kann ueber <code>i18n.bodyHtml</code> im Frontmatter hinterlegt werden.</p>`,
  },
  fr: {
    skillNoun: 'skill',
    systemNoun: 'systeme de design',
    templateNoun: 'modele',
    craftNoun: 'regle de conception',
    pluginNoun: 'plugin',
    blogNoun: 'article',
    unknownTag: 'categorie',
    skillDescription: (name, labels) => `${name} est un skill Open Design composable pour les flux ${labels.join(', ') || 'de production design'}. Il s'execute avec l'agent local et se reutilise avec les systemes DESIGN.md.`,
    systemTagline: (name, category) => `${name} transforme la direction ${category} en systeme DESIGN.md portable pour tous les skills.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} formalise ${category} avec ${paletteCount} couleurs, une hierarchie typographique, des composants et des anti-patterns.`,
    craftName: (name) => `Regle de conception ${name}`,
    craftSummary: (name) => `Cette regle Open Design definit les standards ${name} pour produire des artefacts coherents, lisibles et livrables.`,
    templateName: (name) => `Modele ${name}`,
    templateSummary: (name) => `${name} est un modele Live Artifact reutilisable avec point de rendu, donnees d'exemple et structure forkable.`,
    pluginTitle: (kind, id) => `Plugin ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin Open Design pour les flux ${kind}. Une fois installe, il fonctionne avec le daemon local et la CLI od${labels.length ? `; portee: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Utilisez ce plugin pour lancer une tache ${kind} et verifier le resultat dans l'espace de travail Open Design local.`,
    blogTitle: (topic) => `Guide Open Design : ${topic}`,
    blogSummary: (topic) => `Resume localise de ${topic} dans le contexte local-first, BYOK et skills composables d'Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Resume localise</h2><p>Cet article explique comment Open Design relie ${topic}, les artefacts, les skills, les systemes de design et les agents locaux.</p><p>Cette page utilise un fallback i18n. Une traduction complete peut etre fournie via <code>i18n.bodyHtml</code> dans le frontmatter.</p>`,
  },
  ru: {
    skillNoun: 'навык',
    systemNoun: 'дизайн-система',
    templateNoun: 'шаблон',
    craftNoun: 'правило качества',
    pluginNoun: 'плагин',
    blogNoun: 'статья',
    unknownTag: 'категория',
    skillDescription: (name, labels) => `${name} — составной навык Open Design для сценариев ${labels.join(', ') || 'дизайн-артефактов'}. Его запускает локальный агент, а правила DESIGN.md переиспользуются между задачами.`,
    systemTagline: (name, category) => `${name} превращает направление ${category} в переносимую DESIGN.md дизайн-систему для всех навыков.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} описывает ${category}: ${paletteCount} основных цветов, типографику, компоненты и анти-паттерны.`,
    craftName: (name) => `Правило качества: ${name}`,
    craftSummary: (name) => `Это правило Open Design задает стандарт ${name}, чтобы агент создавал согласованные и пригодные к передаче артефакты.`,
    templateName: (name) => `Шаблон ${name}`,
    templateSummary: (name) => `${name} — переиспользуемый Live Artifact шаблон с точкой рендера, примером данных и структурой для fork.`,
    pluginTitle: (kind, id) => `Плагин ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Плагин Open Design для сценариев ${kind}. После установки доступен локально через daemon и CLI od${labels.length ? `; охват: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Создайте задачу ${kind} с этим плагином и проверьте результат в локальном рабочем пространстве Open Design.`,
    blogTitle: (topic) => `Гид Open Design: ${topic}`,
    blogSummary: (topic) => `Локализованное резюме о ${topic} и о том, как это связано с local-first, BYOK и составными навыками Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Локализованное резюме</h2><p>Статья объясняет, как Open Design связывает ${topic}, артефакты, навыки, дизайн-системы и локальных агентов.</p><p>Сейчас страница использует i18n fallback. Полный перевод можно задать через <code>i18n.bodyHtml</code> во frontmatter.</p>`,
  },
  es: {
    skillNoun: 'skill',
    systemNoun: 'sistema de diseño',
    templateNoun: 'plantilla',
    craftNoun: 'regla de oficio',
    pluginNoun: 'plugin',
    blogNoun: 'articulo',
    unknownTag: 'categoria',
    skillDescription: (name, labels) => `${name} es un skill componible de Open Design para flujos de ${labels.join(', ') || 'artefactos de diseño'}. Lo ejecuta el agente local y reutiliza sistemas DESIGN.md.`,
    systemTagline: (name, category) => `${name} convierte la direccion ${category} en un sistema DESIGN.md portable para todos los skills.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} expresa ${category} con ${paletteCount} colores base, ritmo tipografico, componentes y anti-patrones.`,
    craftName: (name) => `Regla de oficio ${name}`,
    craftSummary: (name) => `Esta regla de Open Design define el estandar ${name} para producir artefactos coherentes, legibles y entregables.`,
    templateName: (name) => `Plantilla ${name}`,
    templateSummary: (name) => `${name} es una plantilla Live Artifact reutilizable con entrada de render, datos de ejemplo y estructura lista para fork.`,
    pluginTitle: (kind, id) => `Plugin de ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin de Open Design para flujos de ${kind}. Tras instalarlo, funciona con el daemon local y la CLI od${labels.length ? `; cubre: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Usa este plugin para crear una tarea de ${kind} y revisar el resultado en el workspace local de Open Design.`,
    blogTitle: (topic) => `Guia Open Design: ${topic}`,
    blogSummary: (topic) => `Resumen localizado sobre ${topic} dentro del flujo local-first, BYOK y de skills componibles de Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Resumen localizado</h2><p>Este articulo explica como Open Design conecta ${topic}, artefactos, skills, sistemas de diseño y agentes locales.</p><p>La pagina usa un fallback i18n; una traduccion completa puede sobrescribirse con <code>i18n.bodyHtml</code> en el frontmatter.</p>`,
  },
  'pt-br': {
    skillNoun: 'skill',
    systemNoun: 'sistema de design',
    templateNoun: 'modelo',
    craftNoun: 'regra de craft',
    pluginNoun: 'plugin',
    blogNoun: 'artigo',
    unknownTag: 'categoria',
    skillDescription: (name, labels) => `${name} e um skill componivel do Open Design para fluxos de ${labels.join(', ') || 'artefatos de design'}. Ele roda com o agente local e reutiliza sistemas DESIGN.md.`,
    systemTagline: (name, category) => `${name} transforma a direcao ${category} em um sistema DESIGN.md portavel para todos os skills.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} traduz ${category} em ${paletteCount} cores principais, tipografia, componentes e anti-padroes.`,
    craftName: (name) => `Regra de craft ${name}`,
    craftSummary: (name) => `Esta regra do Open Design define o padrao ${name} para gerar artefatos consistentes, legiveis e entregaveis.`,
    templateName: (name) => `Modelo ${name}`,
    templateSummary: (name) => `${name} e um modelo Live Artifact reutilizavel com entrada de renderizacao, dados de exemplo e estrutura pronta para fork.`,
    pluginTitle: (kind, id) => `Plugin de ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin do Open Design para fluxos de ${kind}. Depois de instalado, funciona no daemon local e na CLI od${labels.length ? `; cobre: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Use este plugin para criar uma tarefa de ${kind} e revisar o resultado no workspace local do Open Design.`,
    blogTitle: (topic) => `Guia Open Design: ${topic}`,
    blogSummary: (topic) => `Resumo localizado sobre ${topic} no fluxo local-first, BYOK e de skills componiveis do Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Resumo localizado</h2><p>Este artigo explica como o Open Design conecta ${topic}, artefatos, skills, sistemas de design e agentes locais.</p><p>A pagina usa um fallback i18n; uma traducao completa pode ser sobrescrita por <code>i18n.bodyHtml</code> no frontmatter.</p>`,
  },
  it: {
    skillNoun: 'skill',
    systemNoun: 'sistema di design',
    templateNoun: 'modello',
    craftNoun: 'regola di craft',
    pluginNoun: 'plugin',
    blogNoun: 'articolo',
    unknownTag: 'categoria',
    skillDescription: (name, labels) => `${name} e uno skill componibile di Open Design per flussi ${labels.join(', ') || 'di artefatti design'}. Viene eseguito dall'agente locale e riusa sistemi DESIGN.md.`,
    systemTagline: (name, category) => `${name} traduce la direzione ${category} in un sistema DESIGN.md portabile per tutti gli skill.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} definisce ${category} con ${paletteCount} colori base, tipografia, componenti e anti-pattern.`,
    craftName: (name) => `Regola di craft ${name}`,
    craftSummary: (name) => `Questa regola Open Design definisce lo standard ${name} per produrre artefatti coerenti, leggibili e consegnabili.`,
    templateName: (name) => `Modello ${name}`,
    templateSummary: (name) => `${name} e un modello Live Artifact riutilizzabile con ingresso di rendering, dati di esempio e struttura forkabile.`,
    pluginTitle: (kind, id) => `Plugin ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin Open Design per flussi ${kind}. Dopo l'installazione funziona con il daemon locale e la CLI od${labels.length ? `; copre: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Usa questo plugin per creare un task ${kind} e controllare il risultato nel workspace locale Open Design.`,
    blogTitle: (topic) => `Guida Open Design: ${topic}`,
    blogSummary: (topic) => `Sintesi localizzata di ${topic} nel flusso local-first, BYOK e skill componibili di Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Sintesi localizzata</h2><p>Questo articolo spiega come Open Design collega ${topic}, artefatti, skill, sistemi di design e agenti locali.</p><p>La pagina usa un fallback i18n; una traduzione completa puo essere fornita con <code>i18n.bodyHtml</code> nel frontmatter.</p>`,
  },
  vi: {
    skillNoun: 'skill',
    systemNoun: 'he thong thiet ke',
    templateNoun: 'mau',
    craftNoun: 'quy tac craft',
    pluginNoun: 'plugin',
    blogNoun: 'bai viet',
    unknownTag: 'phan loai',
    skillDescription: (name, labels) => `${name} la skill Open Design co the ghep noi cho luong ${labels.join(', ') || 'artifact thiet ke'}. Skill chay voi agent cuc bo va tai su dung cac he DESIGN.md.`,
    systemTagline: (name, category) => `${name} bien huong ${category} thanh he DESIGN.md di dong cho moi skill.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} mo ta ${category} voi ${paletteCount} mau cot loi, nhip chu, thanh phan va cac mau can tranh.`,
    craftName: (name) => `Quy tac craft ${name}`,
    craftSummary: (name) => `Quy tac Open Design nay dat chuan ${name} de agent tao artifact nhat quan, de doc va co the ban giao.`,
    templateName: (name) => `Mau ${name}`,
    templateSummary: (name) => `${name} la mau Live Artifact co the tai su dung, gom diem render, du lieu mau va cau truc co the fork.`,
    pluginTitle: (kind, id) => `Plugin ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin Open Design cho luong ${kind}. Sau khi cai dat, plugin chay voi daemon cuc bo va CLI od${labels.length ? `; pham vi: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Dung plugin nay de tao tac vu ${kind} va xem ket qua trong workspace Open Design cuc bo.`,
    blogTitle: (topic) => `Huong dan Open Design: ${topic}`,
    blogSummary: (topic) => `Tom tat ban dia hoa ve ${topic} trong luong local-first, BYOK va skill co the ghep noi cua Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Tom tat ban dia hoa</h2><p>Bai viet nay giai thich cach Open Design ket noi ${topic}, artifact, skill, he thiet ke va agent cuc bo.</p><p>Trang dang dung fallback i18n; ban dich day du co the ghi de bang <code>i18n.bodyHtml</code> trong frontmatter.</p>`,
  },
  pl: {
    skillNoun: 'skill',
    systemNoun: 'system projektowy',
    templateNoun: 'szablon',
    craftNoun: 'regula craft',
    pluginNoun: 'plugin',
    blogNoun: 'artykul',
    unknownTag: 'kategoria',
    skillDescription: (name, labels) => `${name} to komponowalny skill Open Design dla przeplywow ${labels.join(', ') || 'artefaktow designu'}. Dziala z lokalnym agentem i wykorzystuje systemy DESIGN.md.`,
    systemTagline: (name, category) => `${name} zamienia kierunek ${category} w przenosny system DESIGN.md dla wszystkich skillow.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} opisuje ${category}: ${paletteCount} kolorow, typografie, komponenty i antywzorce.`,
    craftName: (name) => `Regula craft ${name}`,
    craftSummary: (name) => `Ta regula Open Design definiuje standard ${name}, aby agent tworzyl spojne i gotowe do przekazania artefakty.`,
    templateName: (name) => `Szablon ${name}`,
    templateSummary: (name) => `${name} to wielorazowy szablon Live Artifact z punktem renderowania, danymi przykladowymi i struktura do forkowania.`,
    pluginTitle: (kind, id) => `Plugin ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin Open Design dla przeplywow ${kind}. Po instalacji dziala lokalnie przez daemon i CLI od${labels.length ? `; zakres: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Utworz zadanie ${kind} tym pluginem i sprawdz wynik w lokalnym workspace Open Design.`,
    blogTitle: (topic) => `Przewodnik Open Design: ${topic}`,
    blogSummary: (topic) => `Zlokalizowane podsumowanie ${topic} w przeplywie local-first, BYOK i komponowalnych skillow Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Zlokalizowane podsumowanie</h2><p>Ten artykul pokazuje, jak Open Design laczy ${topic}, artefakty, skille, systemy projektowe i lokalnych agentow.</p><p>Strona uzywa fallbacku i18n; pelne tlumaczenie mozna podac przez <code>i18n.bodyHtml</code> we frontmatter.</p>`,
  },
  id: {
    skillNoun: 'skill',
    systemNoun: 'sistem desain',
    templateNoun: 'templat',
    craftNoun: 'aturan craft',
    pluginNoun: 'plugin',
    blogNoun: 'artikel',
    unknownTag: 'kategori',
    skillDescription: (name, labels) => `${name} adalah skill Open Design yang dapat dikomposisi untuk alur ${labels.join(', ') || 'artifact desain'}. Skill ini berjalan lewat agen lokal dan memakai ulang sistem DESIGN.md.`,
    systemTagline: (name, category) => `${name} mengubah arah ${category} menjadi sistem DESIGN.md portabel untuk semua skill.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} merumuskan ${category} dengan ${paletteCount} warna inti, tipografi, komponen, dan anti-pola.`,
    craftName: (name) => `Aturan craft ${name}`,
    craftSummary: (name) => `Aturan Open Design ini menetapkan standar ${name} agar agen menghasilkan artifact yang konsisten, terbaca, dan siap diserahkan.`,
    templateName: (name) => `Templat ${name}`,
    templateSummary: (name) => `${name} adalah templat Live Artifact yang dapat dipakai ulang, berisi entry render, data contoh, dan struktur yang bisa di-fork.`,
    pluginTitle: (kind, id) => `Plugin ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Plugin Open Design untuk alur ${kind}. Setelah dipasang, plugin berjalan di daemon lokal dan CLI od${labels.length ? `; cakupan: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Gunakan plugin ini untuk membuat tugas ${kind} dan memeriksa hasilnya di workspace Open Design lokal.`,
    blogTitle: (topic) => `Panduan Open Design: ${topic}`,
    blogSummary: (topic) => `Ringkasan lokal tentang ${topic} dalam alur local-first, BYOK, dan skill yang dapat dikomposisi di Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Ringkasan lokal</h2><p>Artikel ini menjelaskan cara Open Design menghubungkan ${topic}, artifact, skill, sistem desain, dan agen lokal.</p><p>Halaman ini memakai fallback i18n; terjemahan lengkap dapat ditimpa lewat <code>i18n.bodyHtml</code> di frontmatter.</p>`,
  },
  nl: {
    skillNoun: 'skill',
    systemNoun: 'designsysteem',
    templateNoun: 'sjabloon',
    craftNoun: 'craftregel',
    pluginNoun: 'plugin',
    blogNoun: 'artikel',
    unknownTag: 'categorie',
    skillDescription: (name, labels) => `${name} is een composeerbare Open Design-skill voor ${labels.join(', ') || 'designartefacten'}. De lokale agent voert hem uit en hergebruikt DESIGN.md-systemen.`,
    systemTagline: (name, category) => `${name} vertaalt ${category} naar een draagbaar DESIGN.md-designsysteem voor elke skill.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} beschrijft ${category} met ${paletteCount} kernkleuren, typografie, componentregels en anti-patronen.`,
    craftName: (name) => `Craftregel ${name}`,
    craftSummary: (name) => `Deze Open Design-regel definieert ${name}, zodat agenten consistente, leesbare en overdraagbare artefacten maken.`,
    templateName: (name) => `Sjabloon ${name}`,
    templateSummary: (name) => `${name} is een herbruikbaar Live Artifact-sjabloon met render-ingang, voorbeelddata en een forkbare structuur.`,
    pluginTitle: (kind, id) => `${kind}-plugin · ${id}`,
    pluginDescription: (kind, labels) => `Open Design-plugin voor ${kind}-workflows. Na installatie werkt hij lokaal via de daemon en od CLI${labels.length ? `; bereik: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Gebruik deze plugin om een ${kind}-taak te maken en het resultaat in de lokale Open Design-workspace te bekijken.`,
    blogTitle: (topic) => `Open Design-gids: ${topic}`,
    blogSummary: (topic) => `Gelokaliseerde samenvatting van ${topic} binnen de local-first, BYOK en composeerbare skill-workflow van Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Gelokaliseerde samenvatting</h2><p>Dit artikel legt uit hoe Open Design ${topic}, artefacten, skills, designsystemen en lokale agenten verbindt.</p><p>Deze pagina gebruikt een i18n-fallback. Een volledige vertaling kan via <code>i18n.bodyHtml</code> in de frontmatter worden geplaatst.</p>`,
  },
  ar: {
    skillNoun: 'مهارة',
    systemNoun: 'نظام تصميم',
    templateNoun: 'قالب',
    craftNoun: 'قاعدة جودة',
    pluginNoun: 'إضافة',
    blogNoun: 'مقال',
    unknownTag: 'تصنيف',
    skillDescription: (name, labels) => `${name} مهارة قابلة للتركيب في Open Design لسير عمل ${labels.join('، ') || 'إنتاج التصميم'}. تعمل مع الوكيل المحلي وتعيد استخدام أنظمة DESIGN.md.`,
    systemTagline: (name, category) => `${name} يحول اتجاه ${category} إلى نظام DESIGN.md قابل للنقل لكل المهارات.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} يصف ${category} عبر ${paletteCount} ألوان أساسية وإيقاع طباعي وقواعد مكونات وأنماط يجب تجنبها.`,
    craftName: (name) => `قاعدة جودة ${name}`,
    craftSummary: (name) => `تحدد هذه القاعدة معيار ${name} حتى ينتج الوكيل ملفات متسقة وقابلة للتسليم.`,
    templateName: (name) => `قالب ${name}`,
    templateSummary: (name) => `${name} قالب Live Artifact قابل لإعادة الاستخدام، مع مدخل عرض وبيانات مثال وبنية قابلة للتفرع.`,
    pluginTitle: (kind, id) => `إضافة ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `إضافة Open Design لسير عمل ${kind}. بعد التثبيت تعمل محليا عبر daemon و od CLI${labels.length ? `؛ النطاق: ${labels.join('، ')}` : ''}.`,
    pluginExample: (kind) => `استخدم هذه الإضافة لإنشاء مهمة ${kind} ومراجعة النتيجة في مساحة عمل Open Design المحلية.`,
    blogTitle: (topic) => `دليل Open Design: ${topic}`,
    blogSummary: (topic) => `ملخص محلي حول ${topic} ضمن سير Open Design المحلي و BYOK والمهارات القابلة للتركيب.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>ملخص محلي</h2><p>تشرح هذه المقالة كيف يصل Open Design بين ${topic} والملفات والمهارات وأنظمة التصميم والوكلاء المحليين.</p><p>تعرض الصفحة حاليا نصا عبر i18n fallback؛ يمكن توفير ترجمة كاملة عبر <code>i18n.bodyHtml</code> في frontmatter.</p>`,
  },
  tr: {
    skillNoun: 'skill',
    systemNoun: 'tasarim sistemi',
    templateNoun: 'sablon',
    craftNoun: 'craft kurali',
    pluginNoun: 'eklenti',
    blogNoun: 'yazi',
    unknownTag: 'kategori',
    skillDescription: (name, labels) => `${name}, ${labels.join(', ') || 'tasarim artifact'} akislarinda kullanilan birlesebilir bir Open Design skillidir. Yerel ajanla calisir ve DESIGN.md sistemlerini yeniden kullanir.`,
    systemTagline: (name, category) => `${name}, ${category} yonunu tum skilllerin kullanabilecegi tasinabilir bir DESIGN.md sistemine donusturur.`,
    systemAtmosphere: (name, category, paletteCount) => `${name}, ${category} icin ${paletteCount} ana renk, tipografi, bilesen sinirlari ve anti-pattern kurallari tanimlar.`,
    craftName: (name) => `${name} craft kurali`,
    craftSummary: (name) => `Bu Open Design kurali ${name} standardini belirler; ajanlarin tutarli, okunabilir ve teslim edilebilir artifact uretmesine yardim eder.`,
    templateName: (name) => `${name} sablonu`,
    templateSummary: (name) => `${name}, render girisi, ornek veri ve fork edilebilir dosya yapisi iceren yeniden kullanilabilir bir Live Artifact sablonudur.`,
    pluginTitle: (kind, id) => `${kind} eklentisi · ${id}`,
    pluginDescription: (kind, labels) => `${kind} akislari icin Open Design eklentisi. Kurulumdan sonra yerel daemon ve od CLI ile calisir${labels.length ? `; kapsam: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Bu eklentiyle bir ${kind} gorevi olusturun ve sonucu yerel Open Design workspace'inde inceleyin.`,
    blogTitle: (topic) => `Open Design rehberi: ${topic}`,
    blogSummary: (topic) => `${topic} konusunu Open Design'in local-first, BYOK ve birlesebilir skill akisi baglaminda ozetler.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Yerellestirilmis ozet</h2><p>Bu yazi Open Design'in ${topic}, artifact, skill, tasarim sistemi ve yerel ajanlari nasil bagladigini aciklar.</p><p>Sayfa su anda i18n fallback kullanir. Tam ceviri frontmatter icindeki <code>i18n.bodyHtml</code> ile verilebilir.</p>`,
  },
  uk: {
    skillNoun: 'навичка',
    systemNoun: 'дизайн-система',
    templateNoun: 'шаблон',
    craftNoun: 'правило якості',
    pluginNoun: 'плагін',
    blogNoun: 'стаття',
    unknownTag: 'категорія',
    skillDescription: (name, labels) => `${name} — компонована навичка Open Design для сценаріїв ${labels.join(', ') || 'дизайн-артефактів'}. Її запускає локальний агент, а системи DESIGN.md можна перевикористовувати.`,
    systemTagline: (name, category) => `${name} перетворює напрям ${category} на переносну DESIGN.md дизайн-систему для всіх навичок.`,
    systemAtmosphere: (name, category, paletteCount) => `${name} описує ${category}: ${paletteCount} основних кольорів, типографіку, компоненти й анти-патерни.`,
    craftName: (name) => `Правило якості: ${name}`,
    craftSummary: (name) => `Це правило Open Design задає стандарт ${name}, щоб агент створював послідовні й готові до передачі артефакти.`,
    templateName: (name) => `Шаблон ${name}`,
    templateSummary: (name) => `${name} — багаторазовий Live Artifact шаблон із точкою рендеру, прикладом даних і структурою для fork.`,
    pluginTitle: (kind, id) => `Плагін ${kind} · ${id}`,
    pluginDescription: (kind, labels) => `Плагін Open Design для сценаріїв ${kind}. Після встановлення працює локально через daemon і CLI od${labels.length ? `; охоплення: ${labels.join(', ')}` : ''}.`,
    pluginExample: (kind) => `Створіть завдання ${kind} цим плагіном і перевірте результат у локальному workspace Open Design.`,
    blogTitle: (topic) => `Гід Open Design: ${topic}`,
    blogSummary: (topic) => `Локалізоване резюме про ${topic} у local-first, BYOK і компонованому skill-процесі Open Design.`,
    blogBody: (topic, summary) => `<p>${summary}</p><h2>Локалізоване резюме</h2><p>Стаття пояснює, як Open Design поєднує ${topic}, артефакти, навички, дизайн-системи й локальних агентів.</p><p>Зараз сторінка використовує i18n fallback. Повний переклад можна задати через <code>i18n.bodyHtml</code> у frontmatter.</p>`,
  },
};

const TAXONOMY_TERMS: Record<string, Partial<Record<LandingLocaleCode, string>>> = {
  prototype: { zh: '原型', 'zh-tw': '原型', ja: 'プロトタイプ', ko: '프로토타입', de: 'Prototyp', fr: 'prototype', ru: 'прототип', es: 'prototipo', 'pt-br': 'prototipo', it: 'prototipo', vi: 'nguyen mau', pl: 'prototyp', id: 'prototipe', nl: 'prototype', ar: 'نموذج أولي', tr: 'prototip', uk: 'прототип' },
  template: { zh: '模板', 'zh-tw': '模板', ja: 'テンプレート', ko: '템플릿', de: 'Vorlage', fr: 'modele', ru: 'шаблон', es: 'plantilla', 'pt-br': 'modelo', it: 'modello', vi: 'mau', pl: 'szablon', id: 'templat', nl: 'sjabloon', ar: 'قالب', tr: 'sablon', uk: 'шаблон' },
  deck: { zh: '演示文稿', 'zh-tw': '簡報', ja: 'スライド', ko: '슬라이드', de: 'Deck', fr: 'presentation', ru: 'презентация', es: 'presentacion', 'pt-br': 'apresentacao', it: 'presentazione', vi: 'slide', pl: 'prezentacja', id: 'presentasi', nl: 'presentatie', ar: 'عرض تقديمي', tr: 'sunum', uk: 'презентація' },
  image: { zh: '图像', 'zh-tw': '影像', ja: '画像', ko: '이미지', de: 'Bild', fr: 'image', ru: 'изображение', es: 'imagen', 'pt-br': 'imagem', it: 'immagine', vi: 'hinh anh', pl: 'obraz', id: 'gambar', nl: 'afbeelding', ar: 'صورة', tr: 'gorsel', uk: 'зображення' },
  video: { zh: '视频', 'zh-tw': '影片', ja: '動画', ko: '비디오', de: 'Video', fr: 'video', ru: 'видео', es: 'video', 'pt-br': 'video', it: 'video', vi: 'video', pl: 'wideo', id: 'video', nl: 'video', ar: 'فيديو', tr: 'video', uk: 'відео' },
  audio: { zh: '音频', 'zh-tw': '音訊', ja: '音声', ko: '오디오', de: 'Audio', fr: 'audio', ru: 'аудио', es: 'audio', 'pt-br': 'audio', it: 'audio', vi: 'am thanh', pl: 'audio', id: 'audio', nl: 'audio', ar: 'صوت', tr: 'ses', uk: 'аудіо' },
  utility: { zh: '工具', 'zh-tw': '工具', ja: 'ユーティリティ', ko: '유틸리티', de: 'Werkzeug', fr: 'outil', ru: 'утилита', es: 'utilidad', 'pt-br': 'utilitario', it: 'utility', vi: 'tien ich', pl: 'narzedzie', id: 'utilitas', nl: 'hulpmiddel', ar: 'أداة', tr: 'arac', uk: 'утиліта' },
  design: { zh: '设计', 'zh-tw': '設計', ja: 'デザイン', ko: '디자인', de: 'Design', fr: 'design', ru: 'дизайн', es: 'diseño', 'pt-br': 'design', it: 'design', vi: 'thiet ke', pl: 'design', id: 'desain', nl: 'design', ar: 'تصميم', tr: 'tasarim', uk: 'дизайн' },
  marketing: { zh: '营销', 'zh-tw': '行銷', ja: 'マーケティング', ko: '마케팅', de: 'Marketing', fr: 'marketing', ru: 'маркетинг', es: 'marketing', 'pt-br': 'marketing', it: 'marketing', vi: 'marketing', pl: 'marketing', id: 'pemasaran', nl: 'marketing', ar: 'تسويق', tr: 'pazarlama', uk: 'маркетинг' },
  operations: { zh: '运营', 'zh-tw': '營運', ja: '運用', ko: '운영', de: 'Betrieb', fr: 'operations', ru: 'операции', es: 'operaciones', 'pt-br': 'operacoes', it: 'operazioni', vi: 'van hanh', pl: 'operacje', id: 'operasi', nl: 'operaties', ar: 'عمليات', tr: 'operasyon', uk: 'операції' },
  product: { zh: '产品', 'zh-tw': '產品', ja: 'プロダクト', ko: '제품', de: 'Produkt', fr: 'produit', ru: 'продукт', es: 'producto', 'pt-br': 'produto', it: 'prodotto', vi: 'san pham', pl: 'produkt', id: 'produk', nl: 'product', ar: 'منتج', tr: 'urun', uk: 'продукт' },
  personal: { zh: '个人', 'zh-tw': '個人', ja: '個人', ko: '개인', de: 'Persoenlich', fr: 'personnel', ru: 'личное', es: 'personal', 'pt-br': 'pessoal', it: 'personale', vi: 'ca nhan', pl: 'osobiste', id: 'personal', nl: 'persoonlijk', ar: 'شخصي', tr: 'kisisel', uk: 'особисте' },
  finance: { zh: '金融', 'zh-tw': '金融', ja: '金融', ko: '금융', de: 'Finanzen', fr: 'finance', ru: 'финансы', es: 'finanzas', 'pt-br': 'financas', it: 'finanza', vi: 'tai chinh', pl: 'finanse', id: 'keuangan', nl: 'financien', ar: 'مالية', tr: 'finans', uk: 'фінанси' },
  docs: { zh: '文档', 'zh-tw': '文件', ja: 'ドキュメント', ko: '문서', de: 'Dokumente', fr: 'documents', ru: 'документы', es: 'documentos', 'pt-br': 'documentos', it: 'documenti', vi: 'tai lieu', pl: 'dokumenty', id: 'dokumen', nl: 'documenten', ar: 'مستندات', tr: 'belgeler', uk: 'документи' },
};

const CRAFT_LABELS: Record<string, Partial<Record<LandingLocaleCode, string>>> = {
  color: { zh: '色彩', 'zh-tw': '色彩', ja: 'カラー', ko: '색상', de: 'Farbe', fr: 'couleur', ru: 'цвет', es: 'color', 'pt-br': 'cor', it: 'colore', vi: 'mau sac', pl: 'kolor', id: 'warna', nl: 'kleur', ar: 'اللون', tr: 'renk', uk: 'колір' },
  typography: { zh: '排版', 'zh-tw': '排版', ja: 'タイポグラフィ', ko: '타이포그래피', de: 'Typografie', fr: 'typographie', ru: 'типографика', es: 'tipografia', 'pt-br': 'tipografia', it: 'tipografia', vi: 'kieu chu', pl: 'typografia', id: 'tipografi', nl: 'typografie', ar: 'الطباعة', tr: 'tipografi', uk: 'типографіка' },
  'rtl-and-bidi': { zh: 'RTL 与双向文本', 'zh-tw': 'RTL 與雙向文字', ja: 'RTL と双方向テキスト', ko: 'RTL 및 양방향 텍스트', de: 'RTL und bidirektionaler Text', fr: 'RTL et texte bidirectionnel', ru: 'RTL и двунаправленный текст', es: 'RTL y texto bidireccional', 'pt-br': 'RTL e texto bidirecional', it: 'RTL e testo bidirezionale', vi: 'RTL va van ban hai chieu', pl: 'RTL i tekst dwukierunkowy', id: 'RTL dan teks dua arah', nl: 'RTL en bidirectionele tekst', ar: 'النص من اليمين والاتجاه المزدوج', tr: 'RTL ve cift yonlu metin', uk: 'RTL і двонапрямний текст' },
};

const CATEGORY_LABELS: Record<string, Partial<Record<LandingLocaleCode, string>>> = {
  'ai & llm': { zh: 'AI 与大模型', 'zh-tw': 'AI 與大模型', ja: 'AI と LLM', ko: 'AI 및 LLM', de: 'KI und LLM', fr: 'IA et LLM', ru: 'AI и LLM', es: 'IA y LLM', 'pt-br': 'IA e LLM', it: 'IA e LLM', vi: 'AI va LLM', pl: 'AI i LLM', id: 'AI dan LLM', nl: 'AI en LLM', ar: 'الذكاء الاصطناعي والنماذج اللغوية', tr: 'AI ve LLM', uk: 'AI та LLM' },
  'developer tools': { zh: '开发者工具', 'zh-tw': '開發者工具', ja: '開発者ツール', ko: '개발자 도구', de: 'Entwicklerwerkzeuge', fr: 'outils developpeur', ru: 'инструменты разработчика', es: 'herramientas de desarrollo', 'pt-br': 'ferramentas de desenvolvimento', it: 'strumenti per sviluppatori', vi: 'cong cu lap trinh', pl: 'narzedzia developerskie', id: 'alat developer', nl: 'ontwikkelaarstools', ar: 'أدوات المطورين', tr: 'gelistirici araclari', uk: 'інструменти розробника' },
  'productivity & saas': { zh: '效率与 SaaS', 'zh-tw': '效率與 SaaS', ja: '生産性と SaaS', ko: '생산성 및 SaaS', de: 'Produktivitaet und SaaS', fr: 'productivite et SaaS', ru: 'продуктивность и SaaS', es: 'productividad y SaaS', 'pt-br': 'produtividade e SaaS', it: 'produttivita e SaaS', vi: 'nang suat va SaaS', pl: 'produktywnosc i SaaS', id: 'produktivitas dan SaaS', nl: 'productiviteit en SaaS', ar: 'الإنتاجية وSaaS', tr: 'uretkenlik ve SaaS', uk: 'продуктивність і SaaS' },
  'design & creative': { zh: '设计与创意', 'zh-tw': '設計與創意', ja: 'デザインとクリエイティブ', ko: '디자인 및 크리에이티브', de: 'Design und Kreativitaet', fr: 'design et creation', ru: 'дизайн и креатив', es: 'diseño y creatividad', 'pt-br': 'design e criatividade', it: 'design e creativita', vi: 'thiet ke va sang tao', pl: 'design i kreatywnosc', id: 'desain dan kreatif', nl: 'design en creativiteit', ar: 'التصميم والإبداع', tr: 'tasarim ve yaraticilik', uk: 'дизайн і креатив' },
};

const normalizeTerm = (value: string) => value.trim().toLowerCase();

const copyFor = (locale: LandingLocaleCode): ContentCopy | undefined =>
  locale === DEFAULT_LOCALE ? undefined : CONTENT_COPY[locale];

const compactId = (value: string) =>
  value
    .split('/')
    .at(-1)!
    .replace(/^example-/, '')
    .replace(/^design-system-/, '')
    .replace(/^video-template-/, '')
    .replace(/^image-template-/, '')
    .replace(/^od-/, 'od-');

const BLOG_TOPIC_TITLES: Record<string, Partial<Record<Exclude<LandingLocaleCode, 'en'>, string>>> = {
  '31-skills-72-systems-how-the-library-works': {
    zh: '31 个 Skill 与 72 个系统的资料库运作方式',
    'zh-tw': '31 個 Skill 與 72 個系統的資料庫運作方式',
    ja: '31個のSkillと72個のシステムのライブラリ構造',
    ko: '31개 Skill과 72개 시스템 라이브러리의 작동 방식',
    de: 'wie die Bibliothek mit 31 Skills und 72 Systemen funktioniert',
    fr: 'le fonctionnement de la bibliothèque de 31 skills et 72 systèmes',
    ru: 'как работает библиотека из 31 навыка и 72 систем',
    es: 'cómo funciona la biblioteca de 31 skills y 72 sistemas',
    'pt-br': 'como funciona a biblioteca de 31 skills e 72 sistemas',
    it: 'come funziona la libreria con 31 skill e 72 sistemi',
    vi: 'cách vận hành thư viện 31 skill và 72 hệ thống',
    pl: 'jak działa biblioteka 31 skill i 72 systemów',
    id: 'cara kerja pustaka 31 skill dan 72 sistem',
    nl: 'hoe de bibliotheek met 31 skills en 72 systemen werkt',
    ar: 'طريقة عمل مكتبة تضم 31 مهارة و72 نظاما',
    tr: '31 skill ve 72 sistemden oluşan kitaplığın çalışma biçimi',
    uk: 'як працює бібліотека з 31 навички та 72 систем',
  },
  'byok-design-workflow-claude-codex-qwen': {
    zh: '面向 Claude、Codex 与 Qwen 的 BYOK 设计工作流',
    'zh-tw': '面向 Claude、Codex 與 Qwen 的 BYOK 設計工作流',
    ja: 'Claude、Codex、Qwen向けBYOKデザインワークフロー',
    ko: 'Claude, Codex, Qwen을 위한 BYOK 디자인 워크플로',
    de: 'BYOK-Designworkflow für Claude, Codex und Qwen',
    fr: 'workflow de design BYOK pour Claude, Codex et Qwen',
    ru: 'BYOK-дизайн-процесс для Claude, Codex и Qwen',
    es: 'flujo de diseño BYOK para Claude, Codex y Qwen',
    'pt-br': 'fluxo de design BYOK para Claude, Codex e Qwen',
    it: 'workflow di design BYOK per Claude, Codex e Qwen',
    vi: 'quy trình thiết kế BYOK cho Claude, Codex và Qwen',
    pl: 'workflow projektowy BYOK dla Claude, Codex i Qwen',
    id: 'alur desain BYOK untuk Claude, Codex, dan Qwen',
    nl: 'BYOK-designworkflow voor Claude, Codex en Qwen',
    ar: 'سير عمل تصميم BYOK مع Claude وCodex وQwen',
    tr: 'Claude, Codex ve Qwen için BYOK tasarım akışı',
    uk: 'BYOK дизайн-процес для Claude, Codex і Qwen',
  },
  'byok-reality-check-5-things-that-break': {
    zh: 'BYOK 现实检查：5 个容易断裂的环节',
    'zh-tw': 'BYOK 現實檢查：5 個容易斷裂的環節',
    ja: 'BYOKの現実チェック: 壊れやすい5つの点',
    ko: 'BYOK 현실 점검: 깨지기 쉬운 5가지 지점',
    de: 'BYOK-Realitätscheck: fünf Dinge, die brechen',
    fr: 'réalité BYOK : cinq points qui cassent',
    ru: 'проверка BYOK на практике: пять слабых мест',
    es: 'revisión realista de BYOK: cinco puntos que fallan',
    'pt-br': 'checagem realista do BYOK: cinco pontos que quebram',
    it: 'reality check BYOK: cinque punti che si rompono',
    vi: 'kiểm tra thực tế BYOK: 5 điểm dễ hỏng',
    pl: 'sprawdzenie BYOK w praktyce: pięć miejsc awarii',
    id: 'cek realitas BYOK: lima hal yang mudah rusak',
    nl: 'BYOK-realiteitscheck: vijf dingen die breken',
    ar: 'اختبار واقعي ل BYOK: خمسة مواضع تتعطل',
    tr: 'BYOK gerçeklik kontrolü: bozulan beş nokta',
    uk: 'реалістична перевірка BYOK: пʼять місць, які ламаються',
  },
  'layout-layer-canvas-used-to-hide': {
    zh: '过去被画布隐藏的布局层',
    'zh-tw': '過去被畫布隱藏的版面層',
    ja: 'キャンバスが隠していたレイアウト層',
    ko: '캔버스가 숨겨 왔던 레이아웃 계층',
    de: 'die Layoutschicht, die Canvas früher verborgen hat',
    fr: 'la couche de mise en page que le canvas cachait',
    ru: 'слой макета, который раньше скрывал canvas',
    es: 'la capa de layout que antes ocultaba el canvas',
    'pt-br': 'a camada de layout que o canvas escondia',
    it: 'il livello di layout che il canvas nascondeva',
    vi: 'lớp bố cục từng bị canvas che khuất',
    pl: 'warstwa layoutu, którą dawniej ukrywał canvas',
    id: 'lapisan layout yang dulu disembunyikan kanvas',
    nl: 'de layoutlaag die canvas vroeger verborg',
    ar: 'طبقة التخطيط التي كان canvas يخفيها',
    tr: 'canvasın eskiden sakladığı yerleşim katmanı',
    uk: 'шар макета, який раніше приховував canvas',
  },
  'open-source-alternative-to-claude-design': {
    zh: 'Claude Design 的开源替代方案',
    'zh-tw': 'Claude Design 的開源替代方案',
    ja: 'Claude Designのオープンソース代替',
    ko: 'Claude Design의 오픈소스 대안',
    de: 'Open-Source-Alternative zu Claude Design',
    fr: 'alternative open source à Claude Design',
    ru: 'open-source альтернатива Claude Design',
    es: 'alternativa open source a Claude Design',
    'pt-br': 'alternativa open source ao Claude Design',
    it: 'alternativa open source a Claude Design',
    vi: 'giải pháp mã nguồn mở thay cho Claude Design',
    pl: 'open source alternatywa dla Claude Design',
    id: 'alternatif open source untuk Claude Design',
    nl: 'open-source alternatief voor Claude Design',
    ar: 'بديل مفتوح المصدر ل Claude Design',
    tr: 'Claude Design için açık kaynak alternatif',
    uk: 'open-source альтернатива Claude Design',
  },
  'port-figma-workflow-open-design-plugin': {
    zh: '把 Figma 工作流迁移成 Open Design 插件',
    'zh-tw': '把 Figma 工作流遷移成 Open Design 外掛',
    ja: 'FigmaワークフローをOpen Designプラグインへ移植する',
    ko: 'Figma 워크플로를 Open Design 플러그인으로 옮기기',
    de: 'Figma-Workflows als Open-Design-Plugin portieren',
    fr: 'porter un workflow Figma en plugin Open Design',
    ru: 'перенос Figma-процесса в плагин Open Design',
    es: 'llevar un flujo de Figma a un plugin de Open Design',
    'pt-br': 'migrar um fluxo do Figma para um plugin Open Design',
    it: 'portare un workflow Figma in un plugin Open Design',
    vi: 'chuyển quy trình Figma thành plugin Open Design',
    pl: 'przenoszenie workflow Figma do pluginu Open Design',
    id: 'memindahkan alur Figma menjadi plugin Open Design',
    nl: 'een Figma-workflow omzetten naar een Open Design-plugin',
    ar: 'نقل سير عمل Figma إلى إضافة Open Design',
    tr: 'Figma akışını Open Design eklentisine taşıma',
    uk: 'перенесення Figma-процесу в плагін Open Design',
  },
  'why-we-built-open-design-as-a-skill-layer': {
    zh: '为什么把 Open Design 做成 Skill 层',
    'zh-tw': '為什麼把 Open Design 做成 Skill 層',
    ja: 'Open DesignをSkillレイヤーとして作った理由',
    ko: 'Open Design을 Skill 레이어로 만든 이유',
    de: 'warum Open Design als Skill-Schicht gebaut wurde',
    fr: 'pourquoi Open Design est une couche de skills',
    ru: 'почему Open Design построен как слой навыков',
    es: 'por qué Open Design se construyó como capa de skills',
    'pt-br': 'por que o Open Design foi criado como camada de skills',
    it: 'perché Open Design è stato costruito come livello di skill',
    vi: 'vì sao Open Design được xây như một lớp skill',
    pl: 'dlaczego Open Design powstał jako warstwa skill',
    id: 'mengapa Open Design dibangun sebagai lapisan skill',
    nl: 'waarom Open Design als skill-laag is gebouwd',
    ar: 'لماذا بنينا Open Design كطبقة مهارات',
    tr: 'Open Design neden bir skill katmanı olarak kuruldu',
    uk: 'чому Open Design створено як шар навичок',
  },
};

const localizedBlogTopic = (id: string, locale: LandingLocaleCode) => {
  const compact = compactId(id);
  if (locale === DEFAULT_LOCALE) return compact.replace(/-/g, ' ');
  return BLOG_TOPIC_TITLES[compact]?.[locale] ?? compact.replace(/-/g, ' ');
};

export function explicitLocalizedString(
  value: LocalizedStringValue,
  locale: LandingLocaleCode,
): string | undefined {
  if (typeof value === 'string') {
    return locale === DEFAULT_LOCALE && value.trim() ? value.trim() : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;

  const localeDef = getLocaleDefinition(locale);
  const candidates = [
    locale,
    localeDef.htmlLang,
    localeDef.htmlLang.toLowerCase(),
    localeDef.htmlLang.replace('-', '_'),
    locale === 'zh' ? 'zh-CN' : undefined,
    locale === 'zh-tw' ? 'zh-TW' : undefined,
    locale === 'pt-br' ? 'pt-BR' : undefined,
  ].filter((item): item is string => Boolean(item));

  for (const key of candidates) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  }
  return undefined;
}

export function localizeTaxonomyValue(
  value: string | undefined,
  locale: LandingLocaleCode,
): string | undefined {
  if (!value) return undefined;
  if (locale === DEFAULT_LOCALE) return value;
  const key = normalizeTerm(value);
  return (
    TAXONOMY_TERMS[key]?.[locale] ??
    CATEGORY_LABELS[key]?.[locale] ??
    copyFor(locale)?.unknownTag
  );
}

export function localizeContentTag(
  value: string | undefined,
  locale: LandingLocaleCode,
): string | undefined {
  if (!value) return undefined;
  if (locale === DEFAULT_LOCALE) return value;
  return localizeTaxonomyValue(value, locale) ?? copyFor(locale)?.unknownTag;
}

export function localizeSkillDescription(args: {
  name: string;
  mode?: string;
  scenario?: string;
  category?: string;
  locale: LandingLocaleCode;
  fallback: string;
}): string {
  const copy = copyFor(args.locale);
  if (!copy) return args.fallback;
  const labels = [args.mode, args.scenario, args.category]
    .map((value) => localizeTaxonomyValue(value, args.locale))
    .filter((value): value is string => Boolean(value));
  return copy.skillDescription(args.name, Array.from(new Set(labels)));
}

export function localizeSystemText(args: {
  name: string;
  category: string;
  paletteCount: number;
  locale: LandingLocaleCode;
  fallbackTagline: string;
  fallbackAtmosphere: string;
}): { category: string; tagline: string; atmosphere: string } {
  const copy = copyFor(args.locale);
  if (!copy) {
    return {
      category: args.category,
      tagline: args.fallbackTagline,
      atmosphere: args.fallbackAtmosphere,
    };
  }
  const category = localizeTaxonomyValue(args.category, args.locale) ?? copy.systemNoun;
  return {
    category,
    tagline: copy.systemTagline(args.name, category),
    atmosphere: copy.systemAtmosphere(args.name, category, args.paletteCount),
  };
}

export function localizeCraftText(args: {
  slug: string;
  name: string;
  summary: string;
  locale: LandingLocaleCode;
}): { name: string; summary: string } {
  const copy = copyFor(args.locale);
  if (!copy) return { name: args.name, summary: args.summary };
  const baseName = CRAFT_LABELS[args.slug]?.[args.locale] ?? args.name;
  return {
    name: copy.craftName(baseName),
    summary: copy.craftSummary(baseName),
  };
}

export function localizeTemplateText(args: {
  name: string;
  summary: string;
  locale: LandingLocaleCode;
}): { name: string; summary: string } {
  const copy = copyFor(args.locale);
  if (!copy) return { name: args.name, summary: args.summary };
  return {
    name: copy.templateName(args.name),
    summary: copy.templateSummary(args.name),
  };
}

export function localizePluginText(args: {
  id: string;
  title: string;
  description: string;
  locale: LandingLocaleCode;
  mode?: string;
  taskKind?: string;
  surface?: string;
  visualKind?: string;
  labels?: string[];
}): { title: string; description: string; exampleQuery: string | undefined } {
  const copy = copyFor(args.locale);
  if (!copy) {
    return {
      title: args.title,
      description: args.description,
      exampleQuery: undefined,
    };
  }
  const kind =
    localizeTaxonomyValue(args.mode ?? args.surface ?? args.visualKind, args.locale) ??
    copy.pluginNoun;
  const labels = (args.labels ?? [])
    .map((value) => localizeTaxonomyValue(value, args.locale))
    .filter((value): value is string => Boolean(value));
  return {
    title: copy.pluginTitle(kind, compactId(args.id)),
    description: copy.pluginDescription(kind, Array.from(new Set(labels)).slice(0, 4)),
    exampleQuery: copy.pluginExample(kind),
  };
}

export function localizeBlogPostText(args: {
  id: string;
  title: string;
  summary: string;
  category: string;
  locale: LandingLocaleCode;
}): { title: string; summary: string; category: string; bodyHtml: string | undefined } {
  const copy = copyFor(args.locale);
  if (!copy) {
    return {
      title: args.title,
      summary: args.summary,
      category: args.category,
      bodyHtml: undefined,
    };
  }
  const topic = localizedBlogTopic(args.id, args.locale);
  const title = copy.blogTitle(topic);
  const summary = copy.blogSummary(topic);
  return {
    title,
    summary,
    category: localizeTaxonomyValue(args.category, args.locale) ?? copy.blogNoun,
    bodyHtml: copy.blogBody(topic, summary),
  };
}
