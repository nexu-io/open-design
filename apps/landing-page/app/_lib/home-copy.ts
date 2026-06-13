/*
 * Editorial copy for the Atelier Zero landing page (`app/page.tsx`).
 *
 * Why a separate file: `i18n.ts` is the dictionary for chrome UI labels
 * (nav, footer columns, blog labels) used by every Astro page. The
 * homepage marketing copy is much larger and only lives on `/` and
 * `/{locale}/`, so it ships as its own structured bundle to keep
 * `i18n.ts` skimmable.
 *
 * English (`en`) is canonical — it's the only locale guaranteed to have
 * a complete translation. Other locales provide a `Partial<HomeCopy>`
 * override; any missing field falls back to the English value via
 * `resolveHomeCopy()`. This lets us ship Simplified Chinese end-to-end
 * without blocking on the remaining 17 locales — each can land in its
 * own PR with no migration work.
 *
 * String shape rules:
 *   - Plain text only. JSX-flavoured emphasis (<em>, <code>) is applied
 *     by `page.tsx` at render time using a separate key per emphasised
 *     fragment when needed.
 *   - `{skills}` / `{systems}` placeholders are replaced via simple
 *     `String.replace(/{skills}/g, …)` at render time. Keep them ASCII
 *     so the regex stays trivial.
 */

import type { Locale } from './i18n';

export interface HomeCopy {
  /** Hero — line 1: editorial label above the H1. */
  heroLabel: string;
  /** Hero — H1 broken into 6 fragments to preserve the editorial italics. */
  heroTitleA: string;
  heroTitleEmphasis1: string;
  heroTitleB: string;
  heroTitleEmphasis2: string;
  heroTitleC: string;
  heroTitleEmphasis3: string;
  /** Hero lead. May contain `{skills}` and `{systems}` placeholders. */
  heroLead: string;
  heroJoinDiscord: string;
  heroCtaStar: string;
  heroCtaDownload: string;
  heroStatSkillsLabel: string;
  heroStatSkillsBold: string;
  heroStatSystemsLabel: string;
  heroStatSystemsBold: string;
  heroStatCLIsLabel: string;
  heroStatCLIsBold: string;
  heroFootCommands: string;

  /** Section II — About. */
  aboutLabel: string;
  aboutTitleA: string;
  aboutTitleEmphasis1: string;
  aboutTitleB: string;
  aboutTitleEmphasis2: string;
  aboutTitleC: string;
  /** Lead paragraph; `{cmd}` is replaced with the inline `pnpm tools-dev` code chip. */
  aboutLead: string;
  aboutCtaApproach: string;
  aboutFooterRow: string;
  aboutSideNote: string;
  /** Bold lead of the caption, followed by `aboutCaptionCredit`. */
  aboutCaption: string;
  /** Parenthetical credit rendered after the bold caption. */
  aboutCaptionCredit: string;

  /** Section III — Capabilities. */
  capLabel: string;
  capTitleA: string;
  capTitleEmphasis: string;
  capTitleB: string;
  capLead: string;
  /** 4 cards. */
  capCard1Tag: string;
  capCard1Title: string;
  /** `{skills}` placeholder for live count. */
  capCard1Body: string;
  capCard2Tag: string;
  capCard2Title: string;
  /** `{systems}` placeholder. */
  capCard2Body: string;
  capCard3Tag: string;
  capCard3Title: string;
  capCard3Body: string;
  capCard4Tag: string;
  capCard4Title: string;
  capCard4Body: string;

  /** Section IV — Labs. */
  labsLabel: string;
  labsTitleA: string;
  labsTitleEmphasis: string;
  labsTitleB: string;
  labsFilterAll: string;
  labsFilterPrototype: string;
  labsFilterDeck: string;
  labsFilterMobile: string;
  labsFilterOffice: string;
  labsMetaBold: string;
  labsMetaText: string;
  lab1Title: string;
  lab1Body: string;
  lab2Title: string;
  lab2Body: string;
  lab3Title: string;
  lab3Body: string;
  lab4Title: string;
  lab4Body: string;
  lab5Title: string;
  lab5Body: string;
  /** "VIEW FULL LIBRARY →" link label, used after `05 / N SKILLS · `. */
  labsViewFullLibrary: string;

  /** Section V — Method. */
  methodLabel: string;
  methodTitleA: string;
  methodTitleEmphasis: string;
  methodTitleB: string;
  methodLead: string;
  method1Title: string;
  /** `{skills}` and `{systems}` placeholders. */
  method1Body: string;
  method2Title: string;
  method2Body: string;
  method3Title: string;
  method3Body: string;
  method4Title: string;
  method4Body: string;
  methodFootText: string;

  /** Section VI — Selected work. */
  workLabel: string;
  workTitleA: string;
  workTitleEmphasis1: string;
  workTitleB: string;
  workTitleEmphasis2: string;
  /** `{skills}` placeholder. */
  workViewAll: string;
  workFeaturedTag: string;
  workCompanionTag: string;
  work1Body: string;
  work2Body: string;

  /** Section VII — Testimonial. */
  testimonialLabel: string;
  testimonialQuotePre: string;
  testimonialQuoteEm1: string;
  testimonialQuoteMid: string;
  testimonialQuoteEm2: string;
  testimonialQuotePost: string;
  testimonialAuthorRole: string;
  testimonialPartnersText: string;
  partnerHuashu: string;
  partnerGuizang: string;
  partnerCodesign: string;
  partnerDevin: string;
  partnerHyperframes: string;
  testimonialReadMore: string;

  /** Section VIII — CTA. */
  ctaLabel: string;
  ctaTitleA: string;
  ctaTitleEmphasis1: string;
  ctaTitleB: string;
  ctaTitleEmphasis2: string;
  ctaTitleC: string;
  /** `{cmd}` placeholder for `pnpm tools-dev` chip. */
  ctaLead: string;
  ctaPrimary: string;
  ctaSecondary: string;
  ctaFootLive: string;

  /** Footer — column headings. */
  footStudio: string;
  footLibrary: string;
  footConnect: string;
  footDocs: string;
  footCapabilities: string;
  footLabs: string;
  footMethod: string;
  footManifesto: string;
  footContributors: string;
  footQuickstart: string;
  footArchitecture: string;
  footSkillProtocol: string;
  footRoadmap: string;
  footDownloadDesktop: string;
  footDownloadMeta: string;
  footPitch: string;
}

const en: HomeCopy = {
  heroLabel: 'Open-source design studio · Nº 01',
  heroTitleA: 'Designing',
  heroTitleEmphasis1: 'intelligence',
  heroTitleB: 'with skills,',
  heroTitleEmphasis2: 'taste,',
  heroTitleC: 'and',
  heroTitleEmphasis3: 'code',
  heroLead:
    'The open-source alternative to Claude Design. Your existing coding agent — Claude · Codex · Cursor · Gemini · OpenCode · Qwen — becomes the design engine, driven by {skills} composable skills and {systems} brand-grade design systems.',
  heroJoinDiscord: 'Join Discord',
  heroCtaStar: 'Star us on GitHub',
  heroCtaDownload: 'Download desktop',
  heroStatSkillsBold: 'skills',
  heroStatSkillsLabel: 'shippable',
  heroStatSystemsBold: 'systems',
  heroStatSystemsLabel: 'portable',
  heroStatCLIsBold: 'CLIs',
  heroStatCLIsLabel: 'BYO agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 commands to start',

  aboutLabel: 'About the studio · Nº 02',
  aboutTitleA: 'We treat',
  aboutTitleEmphasis1: 'your agent',
  aboutTitleB: 'as a creative',
  aboutTitleEmphasis2: 'collaborator,',
  aboutTitleC: 'not a black box',
  aboutLead:
    'The strongest coding agents already live on your laptop. We don’t ship one — we wire them into a skill-driven design workflow that runs locally with {cmd}, deploys the web layer to Vercel, and stays BYOK at every layer.',
  aboutCtaApproach: 'Read our approach',
  aboutFooterRow: 'Research · Design · Engineering · Repeat',
  aboutSideNote:
    'From model behavior to visual taste, we prototype the full stack of creative systems.',
  aboutCaption: 'Studies in form · perception · machine imagination.',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: 'Capabilities · Nº 03',
  capTitleA: 'Skills, systems, and surfaces',
  capTitleEmphasis: 'for creative',
  capTitleB: 'intelligence',
  capLead:
    'We blend human taste with whichever agent you already trust to ship interfaces, decks, and editorial pages that feel intentional, expressive, and alive.',
  capCard1Tag: 'Skills',
  capCard1Title: 'Skills, not plugins',
  capCard1Body:
    '{skills} file-based SKILL.md bundles. Drop a folder in, restart the daemon, it appears.',
  capCard2Tag: 'Systems',
  capCard2Title: 'Design Systems as Markdown',
  capCard2Body:
    '{systems} portable DESIGN.md systems — Linear, Vercel, Stripe, Apple, Cursor, Figma…',
  capCard3Tag: 'Adapters',
  capCard3Title: '12 Agent Adapters',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — auto-detected on $PATH.',
  capCard4Tag: 'BYOK',
  capCard4Title: 'BYOK at every layer',
  capCard4Body:
    'OpenAI-compatible proxy. DeepSeek, Groq, OpenRouter, your self-hosted vLLM — paste a baseUrl + key, ship.',

  labsLabel: 'Labs · Nº 04',
  labsTitleA: 'A living archive of',
  labsTitleEmphasis: 'experiments',
  labsTitleB: 'in skills, decks, and machine-made form',
  labsFilterAll: 'All',
  labsFilterPrototype: 'Prototype',
  labsFilterDeck: 'Deck',
  labsFilterMobile: 'Mobile',
  labsFilterOffice: 'Office',
  labsMetaBold: 'Ongoing experiments',
  labsMetaText: 'documenting ideas in flux\nbuilding intelligence\nthrough making',
  lab1Title: 'Magazine Decks',
  lab1Body:
    'Editorial-grade slide decks with guizang-ppt. Magazine layout, WebGL hero.',
  lab2Title: 'Synthetic Matter',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames. Image, video, audio — same chat surface as code.',
  lab3Title: 'Prompt Choreography',
  lab3Body:
    'The interactive question form pops before a single pixel is improvised. 30s of radios beats 30min of redirects.',
  lab4Title: 'Visual Reasoning',
  lab4Body:
    '5-dim self-critique gates every artifact: philosophy · hierarchy · execution · specificity · restraint.',
  lab5Title: 'Soft Systems',
  lab5Body:
    'Sandboxed iframe preview. Streaming todos. Real-cwd filesystem. Adaptive loops between human and machine.',
  labsViewFullLibrary: 'VIEW FULL LIBRARY →',

  methodLabel: 'Method · Nº 05',
  methodTitleA: 'From',
  methodTitleEmphasis: 'signals',
  methodTitleB: 'to systems',
  methodLead:
    'Every stage is iterative, visual, and research-driven — composable files, not opaque prompts.',
  method1Title: 'Detect',
  method1Body:
    'The daemon scans your $PATH for 12 coding agents and auto-loads {skills} skills + {systems} systems on boot.',
  method2Title: 'Discover',
  method2Body:
    'Turn 1 is a question form — surface, audience, tone, scale, brand context. Locked in 30 seconds.',
  method3Title: 'Direct',
  method3Body:
    'Pick one of 5 deterministic visual directions. Palette in OKLch, font stack, layout posture cues.',
  method4Title: 'Deliver',
  method4Body:
    'The agent writes to disk, you preview in a sandboxed iframe, export HTML / PDF / PPTX / ZIP / Markdown.',
  methodFootText: 'Skills inform everything. Files make it real.',

  workLabel: 'Selected work',
  workTitleA: 'Skills that turn briefs into',
  workTitleEmphasis1: 'memorable',
  workTitleB: 'shippable',
  workTitleEmphasis2: 'artifacts',
  workViewAll: 'View all {skills} skills',
  workFeaturedTag: 'Featured skill',
  workCompanionTag: 'Companion system',
  work1Body:
    'Magazine-style web PPT for product launches and pitch decks. Bundled verbatim, original LICENSE preserved.',
  work2Body:
    'An editorial paper system. Warm parchment canvas, ink-blue accent, serif-led hierarchy — multilingual by design (EN · zh-CN · ja).',

  testimonialLabel: 'Collaborators · Nº 06',
  testimonialQuotePre: '“Open Design helped us turn vague',
  testimonialQuoteEm1: 'AI ideas',
  testimonialQuoteMid: 'into a visual system that felt',
  testimonialQuoteEm2: 'sharp, believable,',
  testimonialQuotePost: 'and genuinely new.”',
  testimonialAuthorRole: 'Creative Director · North Form',
  testimonialPartnersText:
    'Standing on the shoulders of teams shipping open-source design culture.',
  partnerHuashu: 'Philosophy',
  partnerGuizang: 'Decks',
  partnerCodesign: 'UX',
  partnerDevin: 'Terminal',
  partnerHyperframes: 'Frames',
  testimonialReadMore: 'Read more stories',

  ctaLabel: 'Start a conversation · Nº 07',
  ctaTitleA: 'Let’s build something',
  ctaTitleEmphasis1: 'open',
  ctaTitleB: 'and',
  ctaTitleEmphasis2: 'visually',
  ctaTitleC: 'unforgettable',
  ctaLead:
    'Star us on GitHub, drop into the issues, or run {cmd} tonight. Three commands and the loop is yours.',
  ctaPrimary: 'Star on GitHub',
  ctaSecondary: 'Open an issue',
  ctaFootLive: '● Live',

  footStudio: 'Studio',
  footLibrary: 'Library',
  footConnect: 'Connect',
  footDocs: 'Docs',
  footCapabilities: 'Capabilities',
  footLabs: 'Labs',
  footMethod: 'Method',
  footManifesto: 'Manifesto',
  footContributors: 'Contributors',
  footQuickstart: 'Quickstart',
  footArchitecture: 'Architecture',
  footSkillProtocol: 'Skill Protocol',
  footRoadmap: 'Roadmap',
  footDownloadDesktop: 'Download desktop',
  footDownloadMeta: 'macOS',
  footPitch:
    'The open-source alternative to Claude Design. Built on the shoulders of huashu-design, guizang-ppt, multica-ai, and open-codesign.',
};

const zhCN: Partial<HomeCopy> = {
  heroLabel: '开源设计工作室 · Nº 01',
  heroTitleA: '用技能、',
  heroTitleEmphasis1: '审美',
  heroTitleB: '与',
  heroTitleEmphasis2: '代码',
  heroTitleC: '设计',
  heroTitleEmphasis3: '智能',
  heroLead:
    'Claude Design 的开源替代品。让你已有的编码 Agent —— Claude · Codex · Cursor · Gemini · OpenCode · Qwen —— 直接成为设计引擎，由 {skills} 个可组合的技能和 {systems} 套品牌级设计系统驱动。',
  heroJoinDiscord: '加入 Discord',
  heroCtaStar: '到 GitHub 点 Star',
  heroCtaDownload: '下载桌面版',
  heroStatSkillsBold: '技能',
  heroStatSkillsLabel: '可上线',
  heroStatSystemsBold: '系统',
  heroStatSystemsLabel: '可迁移',
  heroStatCLIsBold: 'CLI',
  heroStatCLIsLabel: '自带 Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 条命令即可启动',

  aboutLabel: '关于工作室 · Nº 02',
  aboutTitleA: '我们把',
  aboutTitleEmphasis1: '你的 Agent',
  aboutTitleB: '当作创意上的',
  aboutTitleEmphasis2: '合作者，',
  aboutTitleC: '而不是黑盒',
  aboutLead:
    '最强的编码 Agent 已经在你的笔记本上。我们不再发一个新的——而是把它们接入一套以技能为中心的设计工作流，用 {cmd} 在本地运行，Web 层部署到 Vercel，每一层都坚持 BYOK。',
  aboutCtaApproach: '了解我们的方法',
  aboutFooterRow: '调研 · 设计 · 工程 · 循环',
  aboutSideNote: '从模型行为到视觉品味，我们把整个创意系统当作原型来打磨。',
  aboutCaption: '关于形态 · 感知 · 机器想象的研究。',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: '能力 · Nº 03',
  capTitleA: '为创意智能打造的',
  capTitleEmphasis: '技能、系统',
  capTitleB: '与表层',
  capLead:
    '我们让人的品味与你信任的 Agent 协作，交付界面、Deck 与编辑级页面——刻意、有表达、活着。',
  capCard1Tag: '技能',
  capCard1Title: '是技能，不是插件',
  capCard1Body:
    '{skills} 个基于文件的 SKILL.md 包。把文件夹拖进去、重启 daemon，就会出现。',
  capCard2Tag: '系统',
  capCard2Title: '以 Markdown 写的设计系统',
  capCard2Body:
    '{systems} 套可迁移的 DESIGN.md 系统——Linear、Vercel、Stripe、Apple、Cursor、Figma……',
  capCard3Tag: 'Adapter',
  capCard3Title: '12 个 Agent 适配器',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen —— 自动在 $PATH 上探测。',
  capCard4Tag: 'BYOK',
  capCard4Title: '每一层都 BYOK',
  capCard4Body:
    '兼容 OpenAI 协议的代理。DeepSeek、Groq、OpenRouter、你自托管的 vLLM —— 粘 baseUrl 加 key 就能跑。',

  labsLabel: '实验室 · Nº 04',
  labsTitleA: '一个仍在生长的',
  labsTitleEmphasis: '实验',
  labsTitleB: '档案——关于技能、Deck 与机器制造的形态',
  labsFilterAll: '全部',
  labsFilterPrototype: '原型',
  labsFilterDeck: 'Deck',
  labsFilterMobile: '移动端',
  labsFilterOffice: '办公',
  labsMetaBold: '进行中的实验',
  labsMetaText: '记录变动中的想法\n通过制造\n来构建智能',
  lab1Title: '杂志级 Deck',
  lab1Body: '配合 guizang-ppt 的编辑级幻灯片。杂志版式 + WebGL 主图。',
  lab2Title: '合成物质',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames。图像、视频、音频——和代码同一个聊天界面。',
  lab3Title: '提示编排',
  lab3Body:
    '在生成第一像素之前，先弹出一个交互问题表单。30 秒的选择，胜过 30 分钟的反复改稿。',
  lab4Title: '视觉推理',
  lab4Body:
    '5 个维度的自我批评把关每一件作品：哲学 · 层级 · 执行 · 具体 · 克制。',
  lab5Title: '柔性系统',
  lab5Body:
    'iframe 沙盒预览。流式 Todos。基于真实 cwd 的文件系统。人和机器之间的自适应循环。',
  labsViewFullLibrary: '查看完整库 →',

  methodLabel: '方法 · Nº 05',
  methodTitleA: '从',
  methodTitleEmphasis: '信号',
  methodTitleB: '到系统',
  methodLead: '每个阶段都是迭代的、视觉的、研究驱动的——是可组合的文件，而不是不透明的提示词。',
  method1Title: '探测',
  method1Body:
    'Daemon 扫描你的 $PATH，识别 12 个编码 Agent，启动时自动加载 {skills} 个技能 + {systems} 套系统。',
  method2Title: '发现',
  method2Body: '第 1 轮是一个问题表单——表层、受众、调性、规模、品牌语境。30 秒内锁定。',
  method3Title: '指引',
  method3Body:
    '从 5 个确定性的视觉方向里挑一个。OKLch 色板、字体栈、版式姿态全都给好。',
  method4Title: '交付',
  method4Body:
    'Agent 把结果写进磁盘，你在 iframe 沙盒里预览，导出 HTML / PDF / PPTX / ZIP / Markdown。',
  methodFootText: '技能定义一切。文件让它成真。',

  workLabel: '精选作品',
  workTitleA: '让技能把简报变成',
  workTitleEmphasis1: '令人记住、',
  workTitleB: '可交付的',
  workTitleEmphasis2: '作品',
  workViewAll: '查看全部 {skills} 个技能',
  workFeaturedTag: '精选技能',
  workCompanionTag: '搭配系统',
  work1Body:
    '面向产品发布与路演 Deck 的杂志风 Web PPT。原样收录，保留原始 LICENSE。',
  work2Body:
    '一套编辑级的纸面系统。暖羊皮纸底色、墨蓝点缀、衬线主导的层级——天生支持多语言（EN · zh-CN · ja）。',

  testimonialLabel: '合作者 · Nº 06',
  testimonialQuotePre: '“Open Design 帮我们把模糊的',
  testimonialQuoteEm1: 'AI 想法',
  testimonialQuoteMid: '变成了一个视觉系统——',
  testimonialQuoteEm2: '锐利、可信、',
  testimonialQuotePost: '而且真正崭新。”',
  testimonialAuthorRole: '创意总监 · North Form',
  testimonialPartnersText:
    '站在那些把开源设计文化推向世界的团队的肩膀上。',
  partnerHuashu: '哲学',
  partnerGuizang: 'Deck',
  partnerCodesign: 'UX',
  partnerDevin: '终端',
  partnerHyperframes: 'Frame',
  testimonialReadMore: '阅读更多故事',

  ctaLabel: '开启一段对话 · Nº 07',
  ctaTitleA: '让我们一起做点',
  ctaTitleEmphasis1: '开源',
  ctaTitleB: '又',
  ctaTitleEmphasis2: '视觉上',
  ctaTitleC: '难以忘记的事',
  ctaLead:
    '到 GitHub 点 Star、提一个 issue，或者今晚就跑一下 {cmd}。三条命令，循环交给你。',
  ctaPrimary: '到 GitHub 点 Star',
  ctaSecondary: '提一个 issue',
  ctaFootLive: '● 在线',

  footStudio: '工作室',
  footLibrary: '资源库',
  footConnect: '连接',
  footDocs: '文档',
  footCapabilities: '能力',
  footLabs: '实验室',
  footMethod: '方法',
  footManifesto: '宣言',
  footContributors: '贡献者',
  footQuickstart: '快速开始',
  footArchitecture: '架构',
  footSkillProtocol: '技能协议',
  footRoadmap: '路线图',
  footDownloadDesktop: '下载桌面版',
  footDownloadMeta: 'macOS',
  footPitch:
    'Claude Design 的开源替代品。站在 huashu-design、guizang-ppt、multica-ai 和 open-codesign 的肩膀上。',
};

/*
 * Japanese (ja). Editorial / polite-direct register, mirroring the
 * confident-but-warm voice of the English original. Verb-final
 * sentence flow forced the hero/H2 fragments to be split slightly
 * differently from English; visually each `<em>` still lands on the
 * most-emphasised noun.
 */
const ja: Partial<HomeCopy> = {
  heroLabel: 'オープンソースのデザインスタジオ · Nº 01',
  heroTitleA: 'スキルと',
  heroTitleEmphasis1: 'テイスト',
  heroTitleB: '、そして',
  heroTitleEmphasis2: 'コード',
  heroTitleC: 'で、',
  heroTitleEmphasis3: '知性をデザイン',
  heroLead:
    'Claude Design のオープンソース代替。Claude · Codex · Cursor · Gemini · OpenCode · Qwen — すでに使っているコーディング Agent をそのままデザインエンジンに。{skills} 個の組み合わせ可能なスキルと {systems} 個のブランド級デザインシステムが駆動します。',
  heroJoinDiscord: 'Discord に参加',
  heroCtaStar: 'GitHub で Star する',
  heroCtaDownload: 'デスクトップ版をダウンロード',
  heroStatSkillsBold: 'スキル',
  heroStatSkillsLabel: '即出荷',
  heroStatSystemsBold: 'システム',
  heroStatSystemsLabel: '移植可能',
  heroStatCLIsBold: 'CLI',
  heroStatCLIsLabel: 'BYO Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 コマンドで開始',

  aboutLabel: 'スタジオについて · Nº 02',
  aboutTitleA: '私たちは',
  aboutTitleEmphasis1: 'あなたの Agent',
  aboutTitleB: 'をブラックボックスではなく、',
  aboutTitleEmphasis2: '創造の共作者',
  aboutTitleC: 'として扱う',
  aboutLead:
    '最も強力なコーディング Agent はすでにあなたのノート PC にいる。私たちはそれをもう一つ作るのではなく、スキル中心のデザインワークフローに繋ぐ。{cmd} でローカル実行し、Web レイヤーは Vercel にデプロイ。すべてのレイヤーで BYOK を貫きます。',
  aboutCtaApproach: 'アプローチを読む',
  aboutFooterRow: 'リサーチ · デザイン · エンジニアリング · 繰り返す',
  aboutSideNote:
    'モデルの振る舞いからビジュアルの審美まで、創造的システムのフルスタックをプロトタイプします。',
  aboutCaption: '形態 · 知覚 · 機械的想像力をめぐる研究。',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: '能力 · Nº 03',
  capTitleA: '創造的知性のための',
  capTitleEmphasis: 'スキル、システム、',
  capTitleB: 'そして表層',
  capLead:
    '人のテイストと、あなたが信頼する Agent を掛け合わせ、意図的で、表現に富み、生きているインターフェース、デッキ、エディトリアルなページを出荷します。',
  capCard1Tag: 'スキル',
  capCard1Title: 'プラグインではなくスキル',
  capCard1Body:
    'ファイルベースの SKILL.md パッケージが {skills} 個。フォルダを置いて daemon を再起動するだけで現れます。',
  capCard2Tag: 'システム',
  capCard2Title: 'Markdown で書くデザインシステム',
  capCard2Body:
    '{systems} 個の移植可能な DESIGN.md システム — Linear、Vercel、Stripe、Apple、Cursor、Figma…',
  capCard3Tag: 'アダプター',
  capCard3Title: '12 個の Agent アダプター',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — $PATH 上で自動検出。',
  capCard4Tag: 'BYOK',
  capCard4Title: 'すべてのレイヤーで BYOK',
  capCard4Body:
    'OpenAI 互換のプロキシ。DeepSeek、Groq、OpenRouter、セルフホストの vLLM — baseUrl と key を貼るだけで出荷。',

  labsLabel: 'ラボ · Nº 04',
  labsTitleA: '生き続ける',
  labsTitleEmphasis: '実験',
  labsTitleB: 'のアーカイブ — スキル、デッキ、機械が作る形について',
  labsFilterAll: 'すべて',
  labsFilterPrototype: 'プロトタイプ',
  labsFilterDeck: 'デッキ',
  labsFilterMobile: 'モバイル',
  labsFilterOffice: 'オフィス',
  labsMetaBold: '進行中の実験',
  labsMetaText: '流動するアイデアを記録し\n作ることを通して\n知性を構築する',
  lab1Title: 'マガジン・デッキ',
  lab1Body:
    'guizang-ppt と組み合わせるエディトリアル級スライド。マガジン版面と WebGL ヒーロー。',
  lab2Title: '合成物質',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames。画像、動画、音声 — コードと同じチャット面で。',
  lab3Title: 'プロンプトの振付',
  lab3Body:
    '最初の 1 ピクセルを描く前に、対話的な質問フォームが現れる。30 秒の選択肢は、30 分の手戻りに勝る。',
  lab4Title: 'ビジュアル推論',
  lab4Body:
    '5 次元のセルフ批評がすべての成果物を通過させる:哲学 · 階層 · 実行 · 具体性 · 抑制。',
  lab5Title: 'ソフトシステム',
  lab5Body:
    'iframe サンドボックスのプレビュー、ストリーミング Todo、実 cwd のファイルシステム。人と機械の適応的ループ。',
  labsViewFullLibrary: 'ライブラリ全体を見る →',

  methodLabel: 'メソッド · Nº 05',
  methodTitleA: '',
  methodTitleEmphasis: 'シグナル',
  methodTitleB: 'からシステムへ',
  methodLead:
    'すべての段階が反復的で、視覚的で、リサーチ駆動 — 組み合わせ可能なファイルであって、不透明なプロンプトではない。',
  method1Title: '検出',
  method1Body:
    'daemon があなたの $PATH をスキャンし、12 個のコーディング Agent を識別。起動時に {skills} 個のスキル + {systems} 個のシステムを自動ロードします。',
  method2Title: '発見',
  method2Body:
    '最初のターンは質問フォーム — サーフェス、オーディエンス、トーン、スケール、ブランド文脈。30 秒で確定。',
  method3Title: '方向付け',
  method3Body:
    '5 つの決定論的なビジュアル方向から 1 つを選ぶ。OKLch のカラーパレット、フォントスタック、レイアウトの姿勢。',
  method4Title: '配信',
  method4Body:
    'Agent がディスクに書き込み、iframe サンドボックスでプレビュー、HTML / PDF / PPTX / ZIP / Markdown でエクスポート。',
  methodFootText: 'スキルがすべてを定義する。ファイルがそれを現実にする。',

  workLabel: '選ばれた仕事',
  workTitleA: 'ブリーフを',
  workTitleEmphasis1: '記憶に残る、',
  workTitleB: '配信可能な',
  workTitleEmphasis2: '作品',
  workViewAll: '全 {skills} スキルを見る',
  workFeaturedTag: 'フィーチャー・スキル',
  workCompanionTag: 'コンパニオン・システム',
  work1Body:
    'プロダクトローンチとピッチデッキ向けのマガジン風 Web PPT。そのまま同梱、オリジナルの LICENSE を保持。',
  work2Body:
    'エディトリアルな紙のシステム。暖かい羊皮紙のキャンバス、墨青のアクセント、セリフ主導の階層 — 多言語で生まれた(EN · zh-CN · ja)。',

  testimonialLabel: 'コラボレーター · Nº 06',
  testimonialQuotePre: '「Open Design は私たちの曖昧な',
  testimonialQuoteEm1: 'AI のアイデア',
  testimonialQuoteMid: 'を、',
  testimonialQuoteEm2: '鋭く、信じられて、',
  testimonialQuotePost: '本当に新しいビジュアルシステムへと変えた。」',
  testimonialAuthorRole: 'クリエイティブディレクター · North Form',
  testimonialPartnersText:
    'オープンソースのデザイン文化を進めるチームの肩の上に立っています。',
  partnerHuashu: '哲学',
  partnerGuizang: 'デッキ',
  partnerCodesign: 'UX',
  partnerDevin: 'ターミナル',
  partnerHyperframes: 'フレーム',
  testimonialReadMore: 'さらに読む',

  ctaLabel: '対話を始める · Nº 07',
  ctaTitleA: '何か',
  ctaTitleEmphasis1: 'オープンで',
  ctaTitleB: '、',
  ctaTitleEmphasis2: 'ビジュアル的に',
  ctaTitleC: '忘れがたいものを作りましょう',
  ctaLead:
    'GitHub で Star、issue を開く、または今夜 {cmd} を実行する。3 つのコマンドで、ループはあなたのものに。',
  ctaPrimary: 'GitHub で Star',
  ctaSecondary: 'issue を開く',
  ctaFootLive: '● オンライン',

  footStudio: 'スタジオ',
  footLibrary: 'ライブラリ',
  footConnect: '接続',
  footDocs: 'ドキュメント',
  footCapabilities: '能力',
  footLabs: 'ラボ',
  footMethod: 'メソッド',
  footManifesto: '宣言',
  footContributors: 'コントリビューター',
  footQuickstart: 'クイックスタート',
  footArchitecture: 'アーキテクチャ',
  footSkillProtocol: 'スキルプロトコル',
  footRoadmap: 'ロードマップ',
  footDownloadDesktop: 'デスクトップ版をダウンロード',
  footDownloadMeta: 'macOS',
  footPitch:
    'Claude Design のオープンソース代替。huashu-design、guizang-ppt、multica-ai、open-codesign の肩の上に立って構築しました。',
};

/*
 * Korean (ko). 합니다 polite register matched to editorial tone.
 * Em-fragments fall on nouns the eye should land on (취향, 코드, 시그널 …).
 */
const ko: Partial<HomeCopy> = {
  heroLabel: '오픈소스 디자인 스튜디오 · Nº 01',
  heroTitleA: '스킬과',
  heroTitleEmphasis1: '취향',
  heroTitleB: ', 그리고',
  heroTitleEmphasis2: '코드',
  heroTitleC: '로',
  heroTitleEmphasis3: '지능을 디자인',
  heroLead:
    'Claude Design 의 오픈소스 대안. 이미 사용 중인 코딩 Agent — Claude · Codex · Cursor · Gemini · OpenCode · Qwen — 이 그대로 디자인 엔진이 됩니다. {skills} 개의 조합 가능한 스킬과 {systems} 개의 브랜드급 디자인 시스템이 구동합니다.',
  heroJoinDiscord: 'Discord 참여',
  heroCtaStar: 'GitHub 에서 Star',
  heroCtaDownload: '데스크톱 다운로드',
  heroStatSkillsBold: '스킬',
  heroStatSkillsLabel: '출시 가능',
  heroStatSystemsBold: '시스템',
  heroStatSystemsLabel: '이식 가능',
  heroStatCLIsBold: 'CLI',
  heroStatCLIsLabel: 'BYO Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 개 명령어로 시작',

  aboutLabel: '스튜디오 소개 · Nº 02',
  aboutTitleA: '우리는',
  aboutTitleEmphasis1: '당신의 Agent',
  aboutTitleB: '를 블랙박스가 아니라',
  aboutTitleEmphasis2: '창의적 협업자',
  aboutTitleC: '로 다룹니다',
  aboutLead:
    '가장 강력한 코딩 Agent 는 이미 당신의 노트북에 있습니다. 우리는 새로 만드는 대신, 그것을 스킬 중심의 디자인 워크플로에 연결합니다. {cmd} 로 로컬에서 실행하고, 웹 레이어는 Vercel 에 배포하며, 모든 레이어에서 BYOK 를 유지합니다.',
  aboutCtaApproach: '우리의 접근 읽기',
  aboutFooterRow: '리서치 · 디자인 · 엔지니어링 · 반복',
  aboutSideNote:
    '모델의 행동에서 시각적 취향까지, 창의적 시스템의 풀스택을 프로토타입합니다.',
  aboutCaption: '형태 · 지각 · 기계의 상상에 관한 연구.',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: '능력 · Nº 03',
  capTitleA: '창의적 지능을 위한',
  capTitleEmphasis: '스킬, 시스템',
  capTitleB: '그리고 표면',
  capLead:
    '사람의 취향과 당신이 신뢰하는 Agent 를 결합해, 의도적이고, 표현적이며, 살아있는 인터페이스, 덱, 에디토리얼 페이지를 출시합니다.',
  capCard1Tag: '스킬',
  capCard1Title: '플러그인이 아니라 스킬',
  capCard1Body:
    '파일 기반의 SKILL.md 번들 {skills} 개. 폴더를 넣고 daemon 을 재시작하면 나타납니다.',
  capCard2Tag: '시스템',
  capCard2Title: 'Markdown 으로 쓰는 디자인 시스템',
  capCard2Body:
    '{systems} 개의 이식 가능한 DESIGN.md 시스템 — Linear, Vercel, Stripe, Apple, Cursor, Figma…',
  capCard3Tag: '어댑터',
  capCard3Title: '12 개의 Agent 어댑터',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — $PATH 에서 자동 감지.',
  capCard4Tag: 'BYOK',
  capCard4Title: '모든 레이어에서 BYOK',
  capCard4Body:
    'OpenAI 호환 프록시. DeepSeek, Groq, OpenRouter, 셀프 호스팅 vLLM — baseUrl 과 key 를 붙여넣으면 출시 끝.',

  labsLabel: '랩 · Nº 04',
  labsTitleA: '살아있는',
  labsTitleEmphasis: '실험',
  labsTitleB: '의 아카이브 — 스킬, 덱, 기계가 만드는 형태에 관한',
  labsFilterAll: '전체',
  labsFilterPrototype: '프로토타입',
  labsFilterDeck: '덱',
  labsFilterMobile: '모바일',
  labsFilterOffice: '오피스',
  labsMetaBold: '진행 중인 실험',
  labsMetaText: '흐름 속 아이디어를 기록하고\n만들기를 통해\n지능을 구축합니다',
  lab1Title: '매거진 덱',
  lab1Body:
    'guizang-ppt 와 함께하는 에디토리얼급 슬라이드. 매거진 레이아웃, WebGL 히어로.',
  lab2Title: '합성 물질',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames. 이미지, 비디오, 오디오 — 코드와 같은 채팅 표면에서.',
  lab3Title: '프롬프트 안무',
  lab3Body:
    '첫 픽셀을 그리기 전에 인터랙티브 질문 폼이 먼저 뜹니다. 30 초의 라디오 버튼이 30 분의 리다이렉트보다 낫습니다.',
  lab4Title: '시각적 추론',
  lab4Body:
    '5 차원의 셀프 비평이 모든 결과물을 통과시킵니다: 철학 · 위계 · 실행 · 구체성 · 절제.',
  lab5Title: '소프트 시스템',
  lab5Body:
    '샌드박스 iframe 프리뷰. 스트리밍 Todo. 실제 cwd 파일 시스템. 사람과 기계 사이의 적응적 루프.',
  labsViewFullLibrary: '전체 라이브러리 보기 →',

  methodLabel: '메소드 · Nº 05',
  methodTitleA: '',
  methodTitleEmphasis: '시그널',
  methodTitleB: '에서 시스템으로',
  methodLead:
    '모든 단계는 반복적이고, 시각적이며, 리서치 기반 — 조합 가능한 파일이지, 불투명한 프롬프트가 아닙니다.',
  method1Title: '감지',
  method1Body:
    'daemon 이 $PATH 를 스캔해 12 개의 코딩 Agent 를 인식하고, 부팅 시 {skills} 개의 스킬 + {systems} 개의 시스템을 자동 로드합니다.',
  method2Title: '발견',
  method2Body:
    '첫 턴은 질문 폼 — 표면, 청중, 톤, 스케일, 브랜드 컨텍스트. 30 초 안에 확정.',
  method3Title: '방향 제시',
  method3Body:
    '5 개의 결정론적 비주얼 방향 중 하나를 선택. OKLch 팔레트, 폰트 스택, 레이아웃 자세.',
  method4Title: '전달',
  method4Body:
    'Agent 가 디스크에 쓰고, iframe 샌드박스에서 프리뷰, HTML / PDF / PPTX / ZIP / Markdown 으로 내보냅니다.',
  methodFootText: '스킬이 모든 것을 정의합니다. 파일이 그것을 현실로 만듭니다.',

  workLabel: '선별된 작업',
  workTitleA: '브리프를',
  workTitleEmphasis1: '기억에 남는,',
  workTitleB: '전달 가능한',
  workTitleEmphasis2: '결과물',
  workViewAll: '전체 {skills} 스킬 보기',
  workFeaturedTag: '피처드 스킬',
  workCompanionTag: '컴패니언 시스템',
  work1Body:
    '제품 출시와 피치 덱을 위한 매거진 스타일 웹 PPT. 그대로 번들, 원본 LICENSE 유지.',
  work2Body:
    '에디토리얼한 종이 시스템. 따뜻한 양피지 캔버스, 잉크 블루 악센트, 세리프 중심 위계 — 다국어 설계(EN · zh-CN · ja).',

  testimonialLabel: '협력자 · Nº 06',
  testimonialQuotePre: '"Open Design 은 우리의 모호한',
  testimonialQuoteEm1: 'AI 아이디어',
  testimonialQuoteMid: '를',
  testimonialQuoteEm2: '날카롭고, 신뢰할 수 있으며,',
  testimonialQuotePost: '진정으로 새로운 시각 시스템으로 바꾸어 주었습니다."',
  testimonialAuthorRole: '크리에이티브 디렉터 · North Form',
  testimonialPartnersText:
    '오픈소스 디자인 문화를 만들어 가는 팀들의 어깨 위에 서 있습니다.',
  partnerHuashu: '철학',
  partnerGuizang: '덱',
  partnerCodesign: 'UX',
  partnerDevin: '터미널',
  partnerHyperframes: '프레임',
  testimonialReadMore: '더 많은 이야기 읽기',

  ctaLabel: '대화 시작하기 · Nº 07',
  ctaTitleA: '뭔가',
  ctaTitleEmphasis1: '오픈',
  ctaTitleB: '되고',
  ctaTitleEmphasis2: '시각적으로',
  ctaTitleC: '잊을 수 없는 것을 만듭시다',
  ctaLead:
    'GitHub 에서 Star, issue 열기, 또는 오늘 밤 {cmd} 실행. 세 개의 명령으로 루프가 당신의 것이 됩니다.',
  ctaPrimary: 'GitHub 에서 Star',
  ctaSecondary: 'issue 열기',
  ctaFootLive: '● 라이브',

  footStudio: '스튜디오',
  footLibrary: '라이브러리',
  footConnect: '연결',
  footDocs: '문서',
  footCapabilities: '능력',
  footLabs: '랩',
  footMethod: '메소드',
  footManifesto: '선언',
  footContributors: '기여자',
  footQuickstart: '퀵스타트',
  footArchitecture: '아키텍처',
  footSkillProtocol: '스킬 프로토콜',
  footRoadmap: '로드맵',
  footDownloadDesktop: '데스크톱 다운로드',
  footDownloadMeta: 'macOS',
  footPitch:
    'Claude Design 의 오픈소스 대안. huashu-design, guizang-ppt, multica-ai, open-codesign 의 어깨 위에서 만들었습니다.',
};

/*
 * Traditional Chinese (zh-TW). Same editorial tone as zh-CN but with
 * Taiwan-flavoured vocabulary (檔案 vs 文件, 軟體 vs 软件, 程式 vs
 * 程序, 終端機 vs 终端) and full-form characters throughout.
 */
const zhTW: Partial<HomeCopy> = {
  heroLabel: '開源設計工作室 · Nº 01',
  heroTitleA: '用技能、',
  heroTitleEmphasis1: '審美',
  heroTitleB: '與',
  heroTitleEmphasis2: '程式碼',
  heroTitleC: '設計',
  heroTitleEmphasis3: '智慧',
  heroLead:
    'Claude Design 的開源替代品。讓你已有的編碼 Agent —— Claude · Codex · Cursor · Gemini · OpenCode · Qwen —— 直接成為設計引擎，由 {skills} 個可組合的技能與 {systems} 套品牌級設計系統驅動。',
  heroJoinDiscord: '加入 Discord',
  heroCtaStar: '到 GitHub 點 Star',
  heroCtaDownload: '下載桌面版',
  heroStatSkillsBold: '技能',
  heroStatSkillsLabel: '可上線',
  heroStatSystemsBold: '系統',
  heroStatSystemsLabel: '可遷移',
  heroStatCLIsBold: 'CLI',
  heroStatCLIsLabel: '自帶 Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 條指令即可啟動',

  aboutLabel: '關於工作室 · Nº 02',
  aboutTitleA: '我們把',
  aboutTitleEmphasis1: '你的 Agent',
  aboutTitleB: '當作創意上的',
  aboutTitleEmphasis2: '合作者，',
  aboutTitleC: '而不是黑盒',
  aboutLead:
    '最強的編碼 Agent 已經在你的筆電上。我們不再發一個新的——而是把它們接入一套以技能為中心的設計工作流，用 {cmd} 在本地運行，Web 層部署到 Vercel，每一層都堅持 BYOK。',
  aboutCtaApproach: '了解我們的方法',
  aboutFooterRow: '研究 · 設計 · 工程 · 循環',
  aboutSideNote: '從模型行為到視覺品味，我們把整個創意系統當作原型來打磨。',
  aboutCaption: '關於形態 · 感知 · 機器想像的研究。',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: '能力 · Nº 03',
  capTitleA: '為創意智慧打造的',
  capTitleEmphasis: '技能、系統',
  capTitleB: '與表層',
  capLead:
    '我們讓人的品味與你信任的 Agent 協作，交付介面、Deck 與編輯級頁面——刻意、有表達、活著。',
  capCard1Tag: '技能',
  capCard1Title: '是技能，不是外掛',
  capCard1Body:
    '{skills} 個基於檔案的 SKILL.md 包。把資料夾拖進去、重啟 daemon，就會出現。',
  capCard2Tag: '系統',
  capCard2Title: '以 Markdown 寫的設計系統',
  capCard2Body:
    '{systems} 套可遷移的 DESIGN.md 系統——Linear、Vercel、Stripe、Apple、Cursor、Figma……',
  capCard3Tag: 'Adapter',
  capCard3Title: '12 個 Agent 介接器',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen —— 自動在 $PATH 上偵測。',
  capCard4Tag: 'BYOK',
  capCard4Title: '每一層都 BYOK',
  capCard4Body:
    '相容 OpenAI 協定的代理。DeepSeek、Groq、OpenRouter、你自架的 vLLM —— 貼 baseUrl 加 key 就能跑。',

  labsLabel: '實驗室 · Nº 04',
  labsTitleA: '一個仍在生長的',
  labsTitleEmphasis: '實驗',
  labsTitleB: '檔案——關於技能、Deck 與機器製造的形態',
  labsFilterAll: '全部',
  labsFilterPrototype: '原型',
  labsFilterDeck: 'Deck',
  labsFilterMobile: '行動裝置',
  labsFilterOffice: '辦公',
  labsMetaBold: '進行中的實驗',
  labsMetaText: '記錄變動中的想法\n透過製造\n來建構智慧',
  lab1Title: '雜誌級 Deck',
  lab1Body: '搭配 guizang-ppt 的編輯級簡報。雜誌版型 + WebGL 主圖。',
  lab2Title: '合成物質',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames。圖像、影片、音訊——和程式碼同一個聊天介面。',
  lab3Title: '提示編排',
  lab3Body:
    '在生成第一像素之前，先彈出一個互動問題表單。30 秒的選擇，勝過 30 分鐘的反覆改稿。',
  lab4Title: '視覺推理',
  lab4Body:
    '5 個維度的自我批評把關每一件作品：哲學 · 層級 · 執行 · 具體 · 克制。',
  lab5Title: '柔性系統',
  lab5Body:
    'iframe 沙盒預覽。串流 Todos。基於真實 cwd 的檔案系統。人和機器之間的自適應循環。',
  labsViewFullLibrary: '查看完整資料庫 →',

  methodLabel: '方法 · Nº 05',
  methodTitleA: '從',
  methodTitleEmphasis: '訊號',
  methodTitleB: '到系統',
  methodLead:
    '每個階段都是迭代的、視覺的、研究驅動的——是可組合的檔案，而不是不透明的提示詞。',
  method1Title: '偵測',
  method1Body:
    'Daemon 掃描你的 $PATH，識別 12 個編碼 Agent，啟動時自動載入 {skills} 個技能 + {systems} 套系統。',
  method2Title: '探索',
  method2Body:
    '第 1 輪是一個問題表單——表層、受眾、調性、規模、品牌語境。30 秒內鎖定。',
  method3Title: '導向',
  method3Body:
    '從 5 個確定性的視覺方向裡挑一個。OKLch 色板、字體堆疊、版式姿態全都給好。',
  method4Title: '交付',
  method4Body:
    'Agent 把結果寫進磁碟，你在 iframe 沙盒裡預覽，匯出 HTML / PDF / PPTX / ZIP / Markdown。',
  methodFootText: '技能定義一切。檔案讓它成真。',

  workLabel: '精選作品',
  workTitleA: '讓技能把簡報變成',
  workTitleEmphasis1: '令人記住、',
  workTitleB: '可交付的',
  workTitleEmphasis2: '作品',
  workViewAll: '查看全部 {skills} 個技能',
  workFeaturedTag: '精選技能',
  workCompanionTag: '搭配系統',
  work1Body:
    '面向產品發佈與路演 Deck 的雜誌風 Web PPT。原樣收錄，保留原始 LICENSE。',
  work2Body:
    '一套編輯級的紙面系統。暖羊皮紙底色、墨藍點綴、襯線主導的層級——天生支援多語言（EN · zh-CN · ja）。',

  testimonialLabel: '合作者 · Nº 06',
  testimonialQuotePre: '「Open Design 幫我們把模糊的',
  testimonialQuoteEm1: 'AI 想法',
  testimonialQuoteMid: '變成了一個視覺系統——',
  testimonialQuoteEm2: '銳利、可信、',
  testimonialQuotePost: '而且真正嶄新。」',
  testimonialAuthorRole: '創意總監 · North Form',
  testimonialPartnersText: '站在那些把開源設計文化推向世界的團隊的肩膀上。',
  partnerHuashu: '哲學',
  partnerGuizang: 'Deck',
  partnerCodesign: 'UX',
  partnerDevin: '終端機',
  partnerHyperframes: 'Frame',
  testimonialReadMore: '閱讀更多故事',

  ctaLabel: '開啟一段對話 · Nº 07',
  ctaTitleA: '讓我們一起做點',
  ctaTitleEmphasis1: '開源',
  ctaTitleB: '又',
  ctaTitleEmphasis2: '視覺上',
  ctaTitleC: '難以忘記的事',
  ctaLead:
    '到 GitHub 點 Star、提一個 issue，或者今晚就跑一下 {cmd}。三條指令，迴圈交給你。',
  ctaPrimary: '到 GitHub 點 Star',
  ctaSecondary: '提一個 issue',
  ctaFootLive: '● 線上',

  footStudio: '工作室',
  footLibrary: '資料庫',
  footConnect: '連結',
  footDocs: '文件',
  footCapabilities: '能力',
  footLabs: '實驗室',
  footMethod: '方法',
  footManifesto: '宣言',
  footContributors: '貢獻者',
  footQuickstart: '快速開始',
  footArchitecture: '架構',
  footSkillProtocol: '技能協定',
  footRoadmap: '路線圖',
  footDownloadDesktop: '下載桌面版',
  footDownloadMeta: 'macOS',
  footPitch:
    'Claude Design 的開源替代品。站在 huashu-design、guizang-ppt、multica-ai 和 open-codesign 的肩膀上。',
};

/*
 * German (de). Du-form throughout (modern dev/design register) and
 * compound nouns preserved on emphasis words ("Geschmack", "Signalen").
 */
const de: Partial<HomeCopy> = {
  heroLabel: 'Open-Source-Designstudio · Nº 01',
  heroTitleA: 'Intelligenz',
  heroTitleEmphasis1: 'gestalten',
  heroTitleB: 'mit Fähigkeiten,',
  heroTitleEmphasis2: 'Geschmack',
  heroTitleC: 'und',
  heroTitleEmphasis3: 'Code',
  heroLead:
    'Die Open-Source-Alternative zu Claude Design. Dein bestehender Coding-Agent — Claude · Codex · Cursor · Gemini · OpenCode · Qwen — wird zur Design-Engine, angetrieben von {skills} kombinierbaren Skills und {systems} markengerechten Designsystemen.',
  heroJoinDiscord: 'Discord beitreten',
  heroCtaStar: 'Auf GitHub mit Star markieren',
  heroCtaDownload: 'Desktop herunterladen',
  heroStatSkillsBold: 'Skills',
  heroStatSkillsLabel: 'lieferbereit',
  heroStatSystemsBold: 'Systeme',
  heroStatSystemsLabel: 'portabel',
  heroStatCLIsBold: 'CLIs',
  heroStatCLIsLabel: 'BYO Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 Befehle zum Start',

  aboutLabel: 'Über das Studio · Nº 02',
  aboutTitleA: 'Wir behandeln',
  aboutTitleEmphasis1: 'deinen Agent',
  aboutTitleB: 'als kreativen',
  aboutTitleEmphasis2: 'Kollaborateur,',
  aboutTitleC: 'nicht als Black Box',
  aboutLead:
    'Die stärksten Coding-Agents leben bereits auf deinem Laptop. Wir liefern keinen weiteren — wir verdrahten sie in einen skill-getriebenen Designworkflow, der lokal mit {cmd} läuft, die Web-Schicht auf Vercel deployt und auf jeder Ebene BYOK bleibt.',
  aboutCtaApproach: 'Unseren Ansatz lesen',
  aboutFooterRow: 'Forschung · Design · Engineering · Wiederholen',
  aboutSideNote:
    'Vom Modellverhalten bis zum visuellen Geschmack — wir prototypisieren den gesamten Stack kreativer Systeme.',
  aboutCaption: 'Studien über Form · Wahrnehmung · maschinelle Vorstellung.',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: 'Fähigkeiten · Nº 03',
  capTitleA: 'Skills, Systeme und Oberflächen',
  capTitleEmphasis: 'für kreative',
  capTitleB: 'Intelligenz',
  capLead:
    'Wir verbinden menschlichen Geschmack mit dem Agent, dem du bereits vertraust — für Interfaces, Decks und redaktionelle Seiten, die intentional, ausdrucksstark und lebendig wirken.',
  capCard1Tag: 'Skills',
  capCard1Title: 'Skills, keine Plugins',
  capCard1Body:
    '{skills} dateibasierte SKILL.md-Bundles. Ordner ablegen, Daemon neu starten, fertig.',
  capCard2Tag: 'Systeme',
  capCard2Title: 'Designsysteme als Markdown',
  capCard2Body:
    '{systems} portable DESIGN.md-Systeme — Linear, Vercel, Stripe, Apple, Cursor, Figma…',
  capCard3Tag: 'Adapter',
  capCard3Title: '12 Agent-Adapter',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — automatisch im $PATH erkannt.',
  capCard4Tag: 'BYOK',
  capCard4Title: 'BYOK auf jeder Ebene',
  capCard4Body:
    'OpenAI-kompatibler Proxy. DeepSeek, Groq, OpenRouter, dein selbst gehostetes vLLM — baseUrl und Key einsetzen, fertig.',

  labsLabel: 'Labs · Nº 04',
  labsTitleA: 'Ein lebendiges Archiv von',
  labsTitleEmphasis: 'Experimenten',
  labsTitleB: 'in Skills, Decks und maschinell geschaffener Form',
  labsFilterAll: 'Alle',
  labsFilterPrototype: 'Prototyp',
  labsFilterDeck: 'Deck',
  labsFilterMobile: 'Mobil',
  labsFilterOffice: 'Office',
  labsMetaBold: 'Laufende Experimente',
  labsMetaText:
    'fließende Ideen dokumentieren\ndurch Machen\nIntelligenz aufbauen',
  lab1Title: 'Magazine Decks',
  lab1Body:
    'Redaktionsfähige Slide-Decks mit guizang-ppt. Magazinlayout, WebGL-Hero.',
  lab2Title: 'Synthetische Materie',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames. Bild, Video, Audio — auf derselben Chat-Oberfläche wie Code.',
  lab3Title: 'Prompt-Choreografie',
  lab3Body:
    'Das interaktive Frageformular erscheint, bevor ein einziges Pixel improvisiert wird. 30 Sekunden Radio Buttons schlagen 30 Minuten Umwege.',
  lab4Title: 'Visuelles Räsonnement',
  lab4Body:
    '5-dimensionale Selbstkritik prüft jedes Artefakt: Philosophie · Hierarchie · Ausführung · Spezifität · Zurückhaltung.',
  lab5Title: 'Weiche Systeme',
  lab5Body:
    'Sandboxed-iframe-Preview. Streaming-Todos. Echtes-cwd-Dateisystem. Adaptive Schleifen zwischen Mensch und Maschine.',
  labsViewFullLibrary: 'GANZE BIBLIOTHEK ANZEIGEN →',

  methodLabel: 'Methode · Nº 05',
  methodTitleA: 'Von',
  methodTitleEmphasis: 'Signalen',
  methodTitleB: 'zu Systemen',
  methodLead:
    'Jede Phase ist iterativ, visuell und forschungsgetrieben — kombinierbare Dateien, keine undurchsichtigen Prompts.',
  method1Title: 'Erkennen',
  method1Body:
    'Der Daemon scannt deinen $PATH nach 12 Coding-Agents und lädt beim Start automatisch {skills} Skills + {systems} Systeme.',
  method2Title: 'Entdecken',
  method2Body:
    'Runde 1 ist ein Frageformular — Oberfläche, Publikum, Tonalität, Skala, Markenkontext. In 30 Sekunden fest.',
  method3Title: 'Richtung geben',
  method3Body:
    'Wähle eine von 5 deterministischen visuellen Richtungen. Palette in OKLch, Font-Stack, Layout-Haltung.',
  method4Title: 'Liefern',
  method4Body:
    'Der Agent schreibt auf die Disk, du previewst in einem Sandboxed-iframe, exportierst nach HTML / PDF / PPTX / ZIP / Markdown.',
  methodFootText: 'Skills bestimmen alles. Dateien machen es real.',

  workLabel: 'Ausgewählte Arbeiten',
  workTitleA: 'Skills, die Briefings in',
  workTitleEmphasis1: 'einprägsame,',
  workTitleB: 'lieferfähige',
  workTitleEmphasis2: 'Artefakte',
  workViewAll: 'Alle {skills} Skills anzeigen',
  workFeaturedTag: 'Featured Skill',
  workCompanionTag: 'Companion System',
  work1Body:
    'Magazinartiges Web-PPT für Produktlaunches und Pitch Decks. Unverändert gebündelt, originale LICENSE erhalten.',
  work2Body:
    'Ein redaktionelles Papier-System. Warmes Pergament als Canvas, tintenblauer Akzent, serifenbetonte Hierarchie — mehrsprachig von Anfang an (EN · zh-CN · ja).',

  testimonialLabel: 'Kollaborateure · Nº 06',
  testimonialQuotePre: '„Open Design hat uns geholfen, vage',
  testimonialQuoteEm1: 'KI-Ideen',
  testimonialQuoteMid: 'in ein visuelles System zu verwandeln, das',
  testimonialQuoteEm2: 'scharf, glaubhaft',
  testimonialQuotePost: 'und wirklich neu war."',
  testimonialAuthorRole: 'Creative Director · North Form',
  testimonialPartnersText:
    'Auf den Schultern von Teams, die Open-Source-Designkultur vorantreiben.',
  partnerHuashu: 'Philosophie',
  partnerGuizang: 'Decks',
  partnerCodesign: 'UX',
  partnerDevin: 'Terminal',
  partnerHyperframes: 'Frames',
  testimonialReadMore: 'Weitere Geschichten lesen',

  ctaLabel: 'Ein Gespräch beginnen · Nº 07',
  ctaTitleA: 'Lass uns etwas',
  ctaTitleEmphasis1: 'Offenes',
  ctaTitleB: 'und',
  ctaTitleEmphasis2: 'visuell',
  ctaTitleC: 'Unvergessliches bauen',
  ctaLead:
    'Gib uns einen Star auf GitHub, leg ein Issue an oder starte heute Abend {cmd}. Drei Befehle und der Loop gehört dir.',
  ctaPrimary: 'Star auf GitHub',
  ctaSecondary: 'Issue öffnen',
  ctaFootLive: '● Live',

  footStudio: 'Studio',
  footLibrary: 'Bibliothek',
  footConnect: 'Verbinden',
  footDocs: 'Docs',
  footCapabilities: 'Fähigkeiten',
  footLabs: 'Labs',
  footMethod: 'Methode',
  footManifesto: 'Manifest',
  footContributors: 'Mitwirkende',
  footQuickstart: 'Schnellstart',
  footArchitecture: 'Architektur',
  footSkillProtocol: 'Skill-Protokoll',
  footRoadmap: 'Roadmap',
  footDownloadDesktop: 'Desktop herunterladen',
  footDownloadMeta: 'macOS',
  footPitch:
    'Die Open-Source-Alternative zu Claude Design. Aufgebaut auf den Schultern von huashu-design, guizang-ppt, multica-ai und open-codesign.',
};

/*
 * French (fr). Tu-form, editorial cadence with em-dash flourish where
 * the English uses it (— … —). Brand and CLI literals untouched.
 */
const fr: Partial<HomeCopy> = {
  heroLabel: 'Studio de design open-source · Nº 01',
  heroTitleA: 'Concevoir',
  heroTitleEmphasis1: 'l\u2019intelligence',
  heroTitleB: 'avec des compétences,',
  heroTitleEmphasis2: 'du goût',
  heroTitleC: 'et',
  heroTitleEmphasis3: 'du code',
  heroLead:
    'L\u2019alternative open-source à Claude Design. Ton agent de coding existant — Claude · Codex · Cursor · Gemini · OpenCode · Qwen — devient le moteur de design, animé par {skills} compétences composables et {systems} design systems de qualité marque.',
  heroJoinDiscord: 'Rejoindre Discord',
  heroCtaStar: 'Star sur GitHub',
  heroCtaDownload: 'Télécharger la version desktop',
  heroStatSkillsBold: 'compétences',
  heroStatSkillsLabel: 'livrables',
  heroStatSystemsBold: 'systèmes',
  heroStatSystemsLabel: 'portables',
  heroStatCLIsBold: 'CLIs',
  heroStatCLIsLabel: 'BYO Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 commandes pour démarrer',

  aboutLabel: 'À propos du studio · Nº 02',
  aboutTitleA: 'Nous traitons',
  aboutTitleEmphasis1: 'ton agent',
  aboutTitleB: 'comme un',
  aboutTitleEmphasis2: 'collaborateur créatif,',
  aboutTitleC: 'pas comme une boîte noire',
  aboutLead:
    'Les agents de coding les plus puissants vivent déjà sur ton laptop. Nous n\u2019en livrons pas un de plus — nous les câblons dans un workflow design piloté par les compétences, qui tourne en local avec {cmd}, déploie la couche web sur Vercel, et reste BYOK à chaque étage.',
  aboutCtaApproach: 'Lire notre approche',
  aboutFooterRow: 'Recherche · Design · Ingénierie · Répéter',
  aboutSideNote:
    'Du comportement des modèles au goût visuel, nous prototypons toute la stack des systèmes créatifs.',
  aboutCaption: 'Études sur la forme · la perception · l\u2019imagination machine.',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: 'Capacités · Nº 03',
  capTitleA: 'Des compétences, systèmes et surfaces',
  capTitleEmphasis: 'pour l\u2019intelligence',
  capTitleB: 'créative',
  capLead:
    'Nous mélangeons goût humain et l\u2019agent en qui tu as déjà confiance pour livrer des interfaces, decks et pages éditoriales qui semblent intentionnelles, expressives et vivantes.',
  capCard1Tag: 'Compétences',
  capCard1Title: 'Des compétences, pas des plugins',
  capCard1Body:
    '{skills} bundles SKILL.md basés sur les fichiers. Glisse un dossier, redémarre le daemon, ça apparaît.',
  capCard2Tag: 'Systèmes',
  capCard2Title: 'Design systems en Markdown',
  capCard2Body:
    '{systems} systèmes DESIGN.md portables — Linear, Vercel, Stripe, Apple, Cursor, Figma…',
  capCard3Tag: 'Adaptateurs',
  capCard3Title: '12 adaptateurs d\u2019agent',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — détectés automatiquement dans $PATH.',
  capCard4Tag: 'BYOK',
  capCard4Title: 'BYOK à chaque couche',
  capCard4Body:
    'Proxy compatible OpenAI. DeepSeek, Groq, OpenRouter, ton vLLM auto-hébergé — colle baseUrl + clé, livre.',

  labsLabel: 'Labs · Nº 04',
  labsTitleA: 'Une archive vivante d\u2019',
  labsTitleEmphasis: 'expériences',
  labsTitleB: 'en compétences, decks et formes faites machine',
  labsFilterAll: 'Tout',
  labsFilterPrototype: 'Prototype',
  labsFilterDeck: 'Deck',
  labsFilterMobile: 'Mobile',
  labsFilterOffice: 'Office',
  labsMetaBold: 'Expériences en cours',
  labsMetaText:
    'documenter des idées en flux\nconstruire l\u2019intelligence\npar le faire',
  lab1Title: 'Magazine Decks',
  lab1Body:
    'Des slide decks de qualité éditoriale avec guizang-ppt. Mise en page magazine, hero WebGL.',
  lab2Title: 'Matière synthétique',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames. Image, vidéo, audio — sur la même surface chat que le code.',
  lab3Title: 'Chorégraphie de prompts',
  lab3Body:
    'Le formulaire interactif apparaît avant qu\u2019un seul pixel ne soit improvisé. 30 s de boutons radio valent mieux que 30 min de redirections.',
  lab4Title: 'Raisonnement visuel',
  lab4Body:
    'Une auto-critique en 5 dimensions filtre chaque artefact : philosophie · hiérarchie · exécution · spécificité · retenue.',
  lab5Title: 'Systèmes souples',
  lab5Body:
    'Aperçu en iframe sandbox. Todos en streaming. Système de fichiers cwd réel. Boucles adaptatives entre humain et machine.',
  labsViewFullLibrary: 'VOIR TOUTE LA BIBLIOTHÈQUE →',

  methodLabel: 'Méthode · Nº 05',
  methodTitleA: 'Des',
  methodTitleEmphasis: 'signaux',
  methodTitleB: 'aux systèmes',
  methodLead:
    'Chaque étape est itérative, visuelle et pilotée par la recherche — des fichiers composables, pas des prompts opaques.',
  method1Title: 'Détecter',
  method1Body:
    'Le daemon scanne ton $PATH pour 12 agents de coding et auto-charge {skills} compétences + {systems} systèmes au démarrage.',
  method2Title: 'Découvrir',
  method2Body:
    'Le tour 1 est un formulaire — surface, audience, ton, échelle, contexte de marque. Verrouillé en 30 secondes.',
  method3Title: 'Diriger',
  method3Body:
    'Choisis l\u2019une des 5 directions visuelles déterministes. Palette en OKLch, stack de fontes, posture de mise en page.',
  method4Title: 'Livrer',
  method4Body:
    'L\u2019agent écrit sur disque, tu pré-visualises dans une iframe sandbox, exportes en HTML / PDF / PPTX / ZIP / Markdown.',
  methodFootText: 'Les compétences définissent tout. Les fichiers le rendent réel.',

  workLabel: 'Travaux sélectionnés',
  workTitleA: 'Des compétences qui transforment les briefs en',
  workTitleEmphasis1: 'artefacts',
  workTitleB: 'mémorables et',
  workTitleEmphasis2: 'livrables',
  workViewAll: 'Voir les {skills} compétences',
  workFeaturedTag: 'Compétence en vedette',
  workCompanionTag: 'Système compagnon',
  work1Body:
    'Web PPT style magazine pour lancements produit et pitch decks. Inclus tel quel, LICENSE d\u2019origine préservée.',
  work2Body:
    'Un système papier éditorial. Toile parchemin chaude, accent bleu encre, hiérarchie portée par les serifs — multilingue par conception (EN · zh-CN · ja).',

  testimonialLabel: 'Collaborateurs · Nº 06',
  testimonialQuotePre: '« Open Design nous a aidés à transformer de vagues',
  testimonialQuoteEm1: 'idées IA',
  testimonialQuoteMid: 'en un système visuel qui semblait',
  testimonialQuoteEm2: 'aiguisé, crédible',
  testimonialQuotePost: 'et véritablement neuf. »',
  testimonialAuthorRole: 'Directrice de création · North Form',
  testimonialPartnersText:
    'Debout sur les épaules d\u2019équipes qui font avancer la culture design open-source.',
  partnerHuashu: 'Philosophie',
  partnerGuizang: 'Decks',
  partnerCodesign: 'UX',
  partnerDevin: 'Terminal',
  partnerHyperframes: 'Frames',
  testimonialReadMore: 'Lire d\u2019autres histoires',

  ctaLabel: 'Engager la conversation · Nº 07',
  ctaTitleA: 'Construisons quelque chose d\u2019',
  ctaTitleEmphasis1: 'ouvert',
  ctaTitleB: 'et de',
  ctaTitleEmphasis2: 'visuellement',
  ctaTitleC: 'inoubliable',
  ctaLead:
    'Mets une étoile sur GitHub, pose un issue, ou lance ce soir {cmd}. Trois commandes et la boucle est à toi.',
  ctaPrimary: 'Star sur GitHub',
  ctaSecondary: 'Ouvrir un issue',
  ctaFootLive: '● En direct',

  footStudio: 'Studio',
  footLibrary: 'Bibliothèque',
  footConnect: 'Connexion',
  footDocs: 'Docs',
  footCapabilities: 'Capacités',
  footLabs: 'Labs',
  footMethod: 'Méthode',
  footManifesto: 'Manifeste',
  footContributors: 'Contributeurs',
  footQuickstart: 'Démarrage rapide',
  footArchitecture: 'Architecture',
  footSkillProtocol: 'Protocole des compétences',
  footRoadmap: 'Roadmap',
  footDownloadDesktop: 'Télécharger la version desktop',
  footDownloadMeta: 'macOS',
  footPitch:
    'L\u2019alternative open-source à Claude Design. Construit sur les épaules de huashu-design, guizang-ppt, multica-ai et open-codesign.',
};

/*
 * Spanish (es-ES). Tú-form, peninsular Spanish punctuation (« » + ¿ ¡
 * where natural, but we mostly use straight quotes for editorial feel).
 */
const esES: Partial<HomeCopy> = {
  heroLabel: 'Estudio de diseño open-source · Nº 01',
  heroTitleA: 'Diseñando',
  heroTitleEmphasis1: 'inteligencia',
  heroTitleB: 'con habilidades,',
  heroTitleEmphasis2: 'gusto',
  heroTitleC: 'y',
  heroTitleEmphasis3: 'código',
  heroLead:
    'La alternativa open-source a Claude Design. Tu agente de coding actual — Claude · Codex · Cursor · Gemini · OpenCode · Qwen — se convierte en el motor de diseño, impulsado por {skills} habilidades componibles y {systems} sistemas de diseño de calidad marca.',
  heroJoinDiscord: 'Unirse a Discord',
  heroCtaStar: 'Dar Star en GitHub',
  heroCtaDownload: 'Descargar escritorio',
  heroStatSkillsBold: 'habilidades',
  heroStatSkillsLabel: 'entregables',
  heroStatSystemsBold: 'sistemas',
  heroStatSystemsLabel: 'portables',
  heroStatCLIsBold: 'CLIs',
  heroStatCLIsLabel: 'BYO Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 comandos para empezar',

  aboutLabel: 'Sobre el estudio · Nº 02',
  aboutTitleA: 'Tratamos',
  aboutTitleEmphasis1: 'a tu agente',
  aboutTitleB: 'como un',
  aboutTitleEmphasis2: 'colaborador creativo,',
  aboutTitleC: 'no como una caja negra',
  aboutLead:
    'Los agentes de coding más potentes ya viven en tu portátil. No enviamos uno más — los conectamos a un workflow de diseño dirigido por habilidades, que corre en local con {cmd}, despliega la capa web en Vercel y se mantiene BYOK en cada capa.',
  aboutCtaApproach: 'Leer nuestro enfoque',
  aboutFooterRow: 'Investigación · Diseño · Ingeniería · Repetir',
  aboutSideNote:
    'Del comportamiento del modelo al gusto visual, prototipamos la stack completa de sistemas creativos.',
  aboutCaption: 'Estudios sobre forma · percepción · imaginación máquina.',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: 'Capacidades · Nº 03',
  capTitleA: 'Habilidades, sistemas y superficies',
  capTitleEmphasis: 'para la inteligencia',
  capTitleB: 'creativa',
  capLead:
    'Mezclamos gusto humano con el agente en el que ya confías para entregar interfaces, decks y páginas editoriales que se sienten intencionales, expresivas y vivas.',
  capCard1Tag: 'Habilidades',
  capCard1Title: 'Habilidades, no plugins',
  capCard1Body:
    '{skills} paquetes SKILL.md basados en archivos. Suelta una carpeta, reinicia el daemon, aparece.',
  capCard2Tag: 'Sistemas',
  capCard2Title: 'Design systems como Markdown',
  capCard2Body:
    '{systems} sistemas DESIGN.md portables — Linear, Vercel, Stripe, Apple, Cursor, Figma…',
  capCard3Tag: 'Adaptadores',
  capCard3Title: '12 adaptadores de agente',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — autodetectados en $PATH.',
  capCard4Tag: 'BYOK',
  capCard4Title: 'BYOK en cada capa',
  capCard4Body:
    'Proxy compatible con OpenAI. DeepSeek, Groq, OpenRouter, tu vLLM autoalojado — pega baseUrl + key y envía.',

  labsLabel: 'Labs · Nº 04',
  labsTitleA: 'Un archivo vivo de',
  labsTitleEmphasis: 'experimentos',
  labsTitleB: 'en habilidades, decks y formas hechas por máquina',
  labsFilterAll: 'Todo',
  labsFilterPrototype: 'Prototipo',
  labsFilterDeck: 'Deck',
  labsFilterMobile: 'Móvil',
  labsFilterOffice: 'Office',
  labsMetaBold: 'Experimentos en curso',
  labsMetaText:
    'documentar ideas en flujo\nconstruir inteligencia\na través del hacer',
  lab1Title: 'Magazine Decks',
  lab1Body:
    'Decks de calidad editorial con guizang-ppt. Maquetación magazine, hero WebGL.',
  lab2Title: 'Materia sintética',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames. Imagen, vídeo, audio — en la misma superficie de chat que el código.',
  lab3Title: 'Coreografía de prompts',
  lab3Body:
    'El formulario interactivo aparece antes de que se improvise un solo píxel. 30 s de radios vencen a 30 min de redirecciones.',
  lab4Title: 'Razonamiento visual',
  lab4Body:
    'Una autocrítica de 5 dimensiones filtra cada pieza: filosofía · jerarquía · ejecución · especificidad · contención.',
  lab5Title: 'Sistemas suaves',
  lab5Body:
    'Vista previa en iframe sandbox. Todos en streaming. Sistema de archivos cwd real. Bucles adaptativos entre humano y máquina.',
  labsViewFullLibrary: 'VER BIBLIOTECA COMPLETA →',

  methodLabel: 'Método · Nº 05',
  methodTitleA: 'De',
  methodTitleEmphasis: 'señales',
  methodTitleB: 'a sistemas',
  methodLead:
    'Cada etapa es iterativa, visual y dirigida por la investigación — archivos componibles, no prompts opacos.',
  method1Title: 'Detectar',
  method1Body:
    'El daemon escanea tu $PATH en busca de 12 agentes de coding y carga al arranque {skills} habilidades + {systems} sistemas.',
  method2Title: 'Descubrir',
  method2Body:
    'El turno 1 es un formulario — superficie, audiencia, tono, escala, contexto de marca. Cerrado en 30 segundos.',
  method3Title: 'Dirigir',
  method3Body:
    'Elige una de 5 direcciones visuales deterministas. Paleta en OKLch, stack de fuentes, postura de layout.',
  method4Title: 'Entregar',
  method4Body:
    'El agente escribe a disco, pré-visualizas en un iframe sandbox, exportas a HTML / PDF / PPTX / ZIP / Markdown.',
  methodFootText: 'Las habilidades definen todo. Los archivos lo hacen real.',

  workLabel: 'Trabajo seleccionado',
  workTitleA: 'Habilidades que convierten briefs en',
  workTitleEmphasis1: 'artefactos',
  workTitleB: 'memorables y',
  workTitleEmphasis2: 'entregables',
  workViewAll: 'Ver las {skills} habilidades',
  workFeaturedTag: 'Habilidad destacada',
  workCompanionTag: 'Sistema compañero',
  work1Body:
    'PPT web estilo magazine para lanzamientos de producto y pitch decks. Empaquetado tal cual, LICENSE original preservada.',
  work2Body:
    'Un sistema papel editorial. Lienzo pergamino cálido, acento azul tinta, jerarquía con serif — multilingüe por diseño (EN · zh-CN · ja).',

  testimonialLabel: 'Colaboradores · Nº 06',
  testimonialQuotePre: '«Open Design nos ayudó a convertir',
  testimonialQuoteEm1: 'ideas vagas de IA',
  testimonialQuoteMid: 'en un sistema visual que se sentía',
  testimonialQuoteEm2: 'agudo, creíble',
  testimonialQuotePost: 'y genuinamente nuevo.»',
  testimonialAuthorRole: 'Directora creativa · North Form',
  testimonialPartnersText:
    'A hombros de equipos que empujan la cultura del diseño open-source.',
  partnerHuashu: 'Filosofía',
  partnerGuizang: 'Decks',
  partnerCodesign: 'UX',
  partnerDevin: 'Terminal',
  partnerHyperframes: 'Frames',
  testimonialReadMore: 'Leer más historias',

  ctaLabel: 'Empezar una conversación · Nº 07',
  ctaTitleA: 'Construyamos algo',
  ctaTitleEmphasis1: 'abierto',
  ctaTitleB: 'y',
  ctaTitleEmphasis2: 'visualmente',
  ctaTitleC: 'inolvidable',
  ctaLead:
    'Dale star en GitHub, abre un issue o lanza esta noche {cmd}. Tres comandos y el loop es tuyo.',
  ctaPrimary: 'Star en GitHub',
  ctaSecondary: 'Abrir un issue',
  ctaFootLive: '● En vivo',

  footStudio: 'Estudio',
  footLibrary: 'Biblioteca',
  footConnect: 'Conectar',
  footDocs: 'Docs',
  footCapabilities: 'Capacidades',
  footLabs: 'Labs',
  footMethod: 'Método',
  footManifesto: 'Manifiesto',
  footContributors: 'Contribuidores',
  footQuickstart: 'Inicio rápido',
  footArchitecture: 'Arquitectura',
  footSkillProtocol: 'Protocolo de habilidades',
  footRoadmap: 'Hoja de ruta',
  footDownloadDesktop: 'Descargar escritorio',
  footDownloadMeta: 'macOS',
  footPitch:
    'La alternativa open-source a Claude Design. Construida sobre los hombros de huashu-design, guizang-ppt, multica-ai y open-codesign.',
};

/*
 * Brazilian Portuguese (pt-BR). Você-form (neutral), Brazilian
 * orthography (e.g. "ideia", "tecnologia"), informal-warm register.
 */
const ptBR: Partial<HomeCopy> = {
  heroLabel: 'Estúdio de design open-source · Nº 01',
  heroTitleA: 'Projetando',
  heroTitleEmphasis1: 'inteligência',
  heroTitleB: 'com habilidades,',
  heroTitleEmphasis2: 'gosto',
  heroTitleC: 'e',
  heroTitleEmphasis3: 'código',
  heroLead:
    'A alternativa open-source ao Claude Design. Seu agente de coding atual — Claude · Codex · Cursor · Gemini · OpenCode · Qwen — vira o motor de design, movido por {skills} skills compostáveis e {systems} design systems de qualidade de marca.',
  heroJoinDiscord: 'Entrar no Discord',
  heroCtaStar: 'Dar Star no GitHub',
  heroCtaDownload: 'Baixar desktop',
  heroStatSkillsBold: 'skills',
  heroStatSkillsLabel: 'entregáveis',
  heroStatSystemsBold: 'sistemas',
  heroStatSystemsLabel: 'portáveis',
  heroStatCLIsBold: 'CLIs',
  heroStatCLIsLabel: 'BYO Agent',
  heroFootCommands: '↳  pnpm tools-dev  ·  3 comandos para começar',

  aboutLabel: 'Sobre o estúdio · Nº 02',
  aboutTitleA: 'Tratamos',
  aboutTitleEmphasis1: 'seu agente',
  aboutTitleB: 'como um',
  aboutTitleEmphasis2: 'colaborador criativo,',
  aboutTitleC: 'não uma caixa-preta',
  aboutLead:
    'Os agentes de coding mais fortes já vivem no seu laptop. A gente não entrega mais um — a gente os conecta a um workflow de design guiado por skills, que roda local com {cmd}, faz deploy da camada web no Vercel e fica BYOK em todas as camadas.',
  aboutCtaApproach: 'Leia nossa abordagem',
  aboutFooterRow: 'Pesquisa · Design · Engenharia · Repetir',
  aboutSideNote:
    'Do comportamento dos modelos ao gosto visual, prototipamos a stack inteira de sistemas criativos.',
  aboutCaption: 'Estudos em forma · percepção · imaginação de máquina.',
  aboutCaptionCredit: '(Open Design, MMXXVI)',

  capLabel: 'Capacidades · Nº 03',
  capTitleA: 'Skills, sistemas e superfícies',
  capTitleEmphasis: 'para a inteligência',
  capTitleB: 'criativa',
  capLead:
    'Misturamos gosto humano com o agente em que você já confia para entregar interfaces, decks e páginas editoriais que parecem intencionais, expressivas e vivas.',
  capCard1Tag: 'Skills',
  capCard1Title: 'Skills, não plugins',
  capCard1Body:
    '{skills} pacotes SKILL.md baseados em arquivos. Solte uma pasta, reinicie o daemon, aparece.',
  capCard2Tag: 'Sistemas',
  capCard2Title: 'Design systems em Markdown',
  capCard2Body:
    '{systems} sistemas DESIGN.md portáveis — Linear, Vercel, Stripe, Apple, Cursor, Figma…',
  capCard3Tag: 'Adaptadores',
  capCard3Title: '12 adaptadores de agente',
  capCard3Body:
    'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — autodetectados no $PATH.',
  capCard4Tag: 'BYOK',
  capCard4Title: 'BYOK em cada camada',
  capCard4Body:
    'Proxy compatível com OpenAI. DeepSeek, Groq, OpenRouter, seu vLLM auto-hospedado — cole baseUrl + key e mande ver.',

  labsLabel: 'Labs · Nº 04',
  labsTitleA: 'Um arquivo vivo de',
  labsTitleEmphasis: 'experimentos',
  labsTitleB: 'em skills, decks e formas feitas pela máquina',
  labsFilterAll: 'Tudo',
  labsFilterPrototype: 'Protótipo',
  labsFilterDeck: 'Deck',
  labsFilterMobile: 'Mobile',
  labsFilterOffice: 'Office',
  labsMetaBold: 'Experimentos em andamento',
  labsMetaText: 'documentando ideias em fluxo\nconstruindo inteligência\nfazendo',
  lab1Title: 'Magazine Decks',
  lab1Body:
    'Decks de qualidade editorial com guizang-ppt. Layout magazine, hero WebGL.',
  lab2Title: 'Matéria sintética',
  lab2Body:
    'Gpt-image-2 + Seedance + HyperFrames. Imagem, vídeo, áudio — na mesma superfície de chat do código.',
  lab3Title: 'Coreografia de prompts',
  lab3Body:
    'O formulário interativo aparece antes que um único pixel seja improvisado. 30 s de radios batem 30 min de redirects.',
  lab4Title: 'Raciocínio visual',
  lab4Body:
    'Uma autocrítica em 5 dimensões filtra cada artefato: filosofia · hierarquia · execução · especificidade · contenção.',
  lab5Title: 'Sistemas leves',
  lab5Body:
    'Preview em iframe sandbox. Todos em streaming. Sistema de arquivos cwd real. Loops adaptativos entre humano e máquina.',
  labsViewFullLibrary: 'VER BIBLIOTECA COMPLETA →',

  methodLabel: 'Método · Nº 05',
  methodTitleA: 'De',
  methodTitleEmphasis: 'sinais',
  methodTitleB: 'a sistemas',
  methodLead:
    'Cada etapa é iterativa, visual e movida por pesquisa — arquivos compostáveis, não prompts opacos.',
  method1Title: 'Detectar',
  method1Body:
    'O daemon varre seu $PATH em busca de 12 agentes de coding e carrega no boot {skills} skills + {systems} sistemas.',
  method2Title: 'Descobrir',
  method2Body:
    'O turno 1 é um formulário — superfície, audiência, tom, escala, contexto de marca. Travado em 30 segundos.',
  method3Title: 'Direcionar',
  method3Body:
    'Escolha uma de 5 direções visuais determinísticas. Paleta em OKLch, font stack, postura de layout.',
  method4Title: 'Entregar',
  method4Body:
    'O agente escreve em disco, você pré-visualiza em um iframe sandbox, exporta para HTML / PDF / PPTX / ZIP / Markdown.',
  methodFootText: 'Skills definem tudo. Arquivos tornam real.',

  workLabel: 'Trabalho selecionado',
  workTitleA: 'Skills que transformam briefings em',
  workTitleEmphasis1: 'artefatos',
  workTitleB: 'memoráveis e',
  workTitleEmphasis2: 'entregáveis',
  workViewAll: 'Ver todas as {skills} skills',
  workFeaturedTag: 'Skill em destaque',
  workCompanionTag: 'Sistema companheiro',
  work1Body:
    'PPT web em estilo magazine para lançamentos de produto e pitch decks. Empacotado tal e qual, LICENSE original preservada.',
  work2Body:
    'Um sistema-papel editorial. Tela pergaminho quente, acento azul tinta, hierarquia liderada por serifa — multilíngue por design (EN · zh-CN · ja).',

  testimonialLabel: 'Colaboradores · Nº 06',
  testimonialQuotePre: '"O Open Design nos ajudou a transformar',
  testimonialQuoteEm1: 'ideias vagas de IA',
  testimonialQuoteMid: 'em um sistema visual que parecia',
  testimonialQuoteEm2: 'afiado, crível',
  testimonialQuotePost: 'e genuinamente novo."',
  testimonialAuthorRole: 'Diretora criativa · North Form',
  testimonialPartnersText:
    'De pé sobre os ombros de times que empurram a cultura de design open-source.',
  partnerHuashu: 'Filosofia',
  partnerGuizang: 'Decks',
  partnerCodesign: 'UX',
  partnerDevin: 'Terminal',
  partnerHyperframes: 'Frames',
  testimonialReadMore: 'Ler mais histórias',

  ctaLabel: 'Começar uma conversa · Nº 07',
  ctaTitleA: 'Vamos construir algo',
  ctaTitleEmphasis1: 'aberto',
  ctaTitleB: 'e',
  ctaTitleEmphasis2: 'visualmente',
  ctaTitleC: 'inesquecível',
  ctaLead:
    'Dê um star no GitHub, abra uma issue, ou rode hoje à noite {cmd}. Três comandos e o loop é seu.',
  ctaPrimary: 'Star no GitHub',
  ctaSecondary: 'Abrir uma issue',
  ctaFootLive: '● Ao vivo',

  footStudio: 'Estúdio',
  footLibrary: 'Biblioteca',
  footConnect: 'Conectar',
  footDocs: 'Docs',
  footCapabilities: 'Capacidades',
  footLabs: 'Labs',
  footMethod: 'Método',
  footManifesto: 'Manifesto',
  footContributors: 'Contribuidores',
  footQuickstart: 'Início rápido',
  footArchitecture: 'Arquitetura',
  footSkillProtocol: 'Protocolo de skills',
  footRoadmap: 'Roadmap',
  footDownloadDesktop: 'Baixar desktop',
  footDownloadMeta: 'macOS',
  footPitch:
    'A alternativa open-source ao Claude Design. Construído sobre os ombros de huashu-design, guizang-ppt, multica-ai e open-codesign.',
};

const overrides: Partial<Record<Locale, Partial<HomeCopy>>> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  de,
  fr,
  'es-ES': esES,
  'pt-BR': ptBR,
};

/**
 * Resolve the full HomeCopy bundle for `locale` by merging the locale's
 * override on top of the canonical English bundle. Any key the locale
 * has not translated yet falls back to English, so a half-translated
 * locale still renders without holes.
 */
export function getHomeCopy(locale: Locale): HomeCopy {
  return { ...en, ...(overrides[locale] ?? {}) };
}
