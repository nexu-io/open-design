/*
 * Localized copy for the /pricing/ plan cards.
 *
 * Mirrors the vela subscription modal (`apps/web/src/components/commerce/
 * plans/pricing-plans.tsx`: `PLANS_BY_LOCALE` + the copy tables). The card body
 * renders the FULLY-EXPANDED benefit list per tier — the credit and concurrency
 * rows lead, then every included benefit, with no "includes all <tier> plan"
 * heading — matching the modal's rendered output. Only the NUMBERS sync from
 * the public pricing contract (see app/_lib/pricing.ts); this file holds the
 * localized TEXT (taglines, feature bullets, section labels, and the
 * number-formatting templates). When vela revises that copy, mirror it here.
 *
 * vela ships 10 plan locales; this module ports all of them — en-US, zh-CN,
 * zh-TW, ja, ko, de, fr, ru, es, pt — and falls back to English for every
 * other landing locale.
 */
import type { LandingLocaleCode } from '../i18n';

export type PlanTierId = 'plus' | 'pro' | 'max';

export interface PlanCopy {
  tagline: string;
  ctaLabel: string;
  /** Localized concurrent-task benefit row (count baked in per tier). */
  concurrency: string;
  /**
   * Fully-expanded benefit bullets, shown under the credit + concurrency lead
   * rows — no "includes all <tier>" heading. Each string is one ✓ bullet and
   * may include `{skillsCount}` / `{systemsCount}` catalog placeholders.
   */
  features: string[];
}

/** Free-tier card copy. The Free tier is not part of the paid pricing
 * contract; its card is content-only ($0, no billing interval). */
export interface FreePlanCopy {
  tagline: string;
  ctaLabel: string;
  concurrency: string;
  features: string[];
}

export interface PricingLabels {
  heroTitle: string;
  monthly: string;
  yearly: string;
  yearlySave: string;
  perMonth: string;
  topTextModels: string;
  topImageModels: string;
  topVideoModels: string;
  /**
   * Marks a modality that is presented but not yet purchasable. Hosted video
   * generation has no server-owned entitlement/billing path yet, so its models
   * render greyed-out behind this tag instead of as an included benefit.
   */
  comingSoon: string;
  recommended: string;
  // Lead benefit rows. `{amount}` `{pct}` filled at render.
  creditBenefit: string;
  creditBonus: string;
  /** Hosted multimodal benefit shared by every paid creator plan. */
  multimodalBenefit: string;
  /** Shared multimodal explainer shown once below the creator plan grid. */
  multimodalTitle: string;
  multimodalDescription: string;
  designAgent: string;
  imageGeneration: string;
  videoGeneration: string;
  /** Free card price subline ($0 · forever). */
  freeForever: string;
  /** Free card lead benefit row (trial credit grant). */
  freeTrialCreditLabel: string;
  // Number-formatting templates. Placeholders: {pct} {totalUsd} {savingsUsd}
  // {amountUsd}. Filled at build time and re-filled by the inline sync script.
  firstMonthTag: string;
  yearlyDiscountTag: string;
  yearlySubline: string;
  monthlyRenewal: string;
  /** Monthly-tab nudge to switch to yearly billing. `{savingsUsd}` filled at render. */
  yearlySaveCta: string;
  /** Footer line. `{console}` is replaced by the linked `consoleLabel`. */
  footnote: string;
  /** Linked text inside the footnote, pointing at the cloud console. */
  consoleLabel: string;
}

export interface PricingContent {
  labels: PricingLabels;
  free: FreePlanCopy;
  plans: Record<PlanTierId, PlanCopy>;
}

/**
 * Mirrors vela's `TRIAL_CREDIT_PROMO_ENABLED` kill switch
 * (`apps/web/src/lib/commerce/trial-credit.ts`, powerformer/vela#912): the
 * new-user signup trial-credit promotion is temporarily offline while output
 * quality catches up, and is expected to return later.
 *
 * While `false`, the /pricing/ Free card hides its trial-credit benefit row
 * and its premium/standard model lists, swaps the "limited-time free trial"
 * tagline for the no-promo variant below, and the FAQ drops/rewrites its
 * trial-credit entries (see `getFaqs`). Flip back to `true` together with the
 * vela switch on relaunch — the promo copy below stays in place untouched.
 */
export const TRIAL_CREDIT_PROMO_ENABLED = false;

/** Free-card tagline used while the trial promotion is offline. */
const FREE_TAGLINE_TRIAL_OFF: Partial<Record<LandingLocaleCode, string>> = {
  en: 'Free with your own agent setup or BYOK',
  zh: '配置自己的 Agent 或 BYOK，免费使用',
  'zh-tw': '配置自己的 Agent 或 BYOK，免費使用',
  ja: '自分の Agent 設定または BYOK で無料利用',
  ko: '직접 구성한 Agent 또는 BYOK로 무료 사용',
  de: 'Kostenlos mit eigenem Agent-Setup oder BYOK',
  fr: 'Gratuit avec votre propre agent ou BYOK',
  ru: 'Бесплатно с собственным агентом или BYOK',
  es: 'Gratis con tu propio agent o BYOK',
  'pt-br': 'Grátis com seu próprio agent ou BYOK',
};

// Model rosters are proper nouns — identical across locales, mirrored 1:1 from
// the vela modal (names byte-identical so the two surfaces read the same).
// Every paid tier shares one hosted-model roster (plans differ by credit
// grant, not by model access). `trial: true` marks models the Free trial pool
// also opens up; the Free card sorts those first and greys out the rest.
export interface PricingModel {
  name: string;
  icon: string;
  trial?: boolean;
}

export const PREMIUM_MODELS: readonly PricingModel[] = [
  { name: 'Claude-Fable-5', icon: '/agents/anthropic.svg' },
  { name: 'GPT-5.6 (Sol/Terra/Luna)', icon: '/agents/openai.svg' },
  { name: 'Grok-4.5', icon: '/agents/xai.svg', trial: true },
] as const;

/**
 * Hosted image roster, mirrored from the shipped Open Design Cloud catalogue
 * in `apps/daemon/src/media/models.ts` (`provider: 'vela'`, `credentialsRequired:
 * false`): `vela/seedream-5.0`, `vela/seedream-5.0-pro`, `vela/nano-banana-2`
 * (+ `-lite`), and `vela/gpt-image-2`. Variant suffixes are grouped so one model
 * family reads as one benefit. Keep this list in step with that registry — it is
 * the source of truth for what a paid plan can actually reach.
 */
export const IMAGE_MODELS = [
  { name: 'Seedream 5 / Pro', icon: '/model-icons/bytedance.svg' },
  { name: 'Nano Banana 2', icon: '/agents/gemini.svg' },
  { name: 'GPT Image 2', icon: '/agents/openai.svg' },
] as const;

/**
 * Video roster. Cloud currently ships only `vela/doubao-seedance-2-0-260128`
 * (seedance 2.0), so none of the families below are reachable yet — the pricing
 * page renders this list muted behind `labels.comingSoon`.
 */
export const VIDEO_MODELS = [
  { name: 'Seedance 2.5', icon: '/model-icons/bytedance.svg' },
  { name: 'MiniMax H3', icon: '/agents/minimax.svg' },
  { name: 'Kling 3.0 Standard / Pro / Turbo', icon: '/model-icons/kling.svg' },
] as const;

/**
 * Limited-time credit bonus represented by the current grant itself and
 * surfaced as a badge next to the amount (Pro $120 / +20%, Max $300 / +50%).
 * `grantUsd` is already the final advertised grant, so consumers must not
 * apply this percentage to it a second time. `null` = no bonus badge.
 */
export const CREDIT_BONUS_PCT: Record<PlanTierId, number | null> = {
  plus: null,
  pro: 20,
  max: 50,
};

/**
 * Canonical, locale-independent keys for the team-lead-form selects. Index-aligned
 * with each locale's `teamSizeOptions` / `budgetOptions` (which hold only the
 * visible labels), so the `<option value>` is a stable enum while the text stays
 * localized. The backend maps these back to readable strings for the lead card.
 */
export const TEAM_SIZE_VALUES = ['1-10', '11-50', '51-200', '200+'] as const;
export const BUDGET_VALUES = ['lt_1k', 'usd_1k_5k', 'usd_5k_20k', 'usd_20k_plus', 'unsure'] as const;

const EN: PricingContent = {
  labels: {
    heroTitle: 'Pay only for AI tasks that deliver results',
    footnote: 'Prices shown in USD. Checkout, billing, and auto top-up are handled in the {console}. Adjust or cancel your plan anytime.',
    consoleLabel: 'Open Design Cloud console',
    monthly: 'Monthly',
    yearly: 'Yearly',
    yearlySave: 'Save up to 51%',
    perMonth: '/ mo',
    topTextModels: 'Top text models',
    topImageModels: 'Top image models',
    topVideoModels: 'Top video models',
    comingSoon: ' (Coming soon)',
    recommended: 'Recommended',
    creditBenefit: '{amount} model credits / mo',
    creditBonus: 'Limited +{pct}% bonus',
    multimodalBenefit: 'Top models, ready to use for agents and images',
    multimodalTitle: 'One credit balance powers agents and multimodal creation',
    multimodalDescription: 'From understanding a brief and executing design work to generating images—without configuring provider API keys. See an estimate before generation; successful generations are charged by actual usage. Video generation is coming soon.',
    designAgent: 'Professional design agent',
    imageGeneration: 'Image generation',
    videoGeneration: 'Video generation',
    freeForever: 'Free forever',
    freeTrialCreditLabel: 'Limited trial model credits (valid for 7 days)',
    firstMonthTag: '{pct}% off 1st month',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Billed yearly · {totalUsd} / year (save {savingsUsd})',
    monthlyRenewal: 'Then {amountUsd} / mo',
    yearlySaveCta: 'Save {savingsUsd} yearly',
  },
  free: {
    tagline: 'Limited-time free trial; configure your own agent or BYOK afterwards',
    ctaLabel: 'Start free',
    concurrency: '1 concurrent task',
    features: ['BYOK provider keys · Local coding agents', 'Community support'],
  },
  plans: {
    plus: {
      tagline: 'Independent projects, solo delivery · Zero-config',
      ctaLabel: 'Upgrade to Plus',
      concurrency: '2 concurrent tasks',
      features: [
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        'Email support',
      ],
    },
    pro: {
      tagline: 'One person, a whole design team · Zero-config',
      ctaLabel: 'Upgrade to Pro',
      concurrency: '5 concurrent tasks',
      features: [
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        'Priority email support',
      ],
    },
    max: {
      tagline: 'Outsourced design costs, slashed · Zero-config',
      ctaLabel: 'Upgrade to Max',
      concurrency: '10 concurrent tasks',
      features: [
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        'Peak-time priority compute · lower latency',
        'Dedicated customer success',
      ],
    },
  },
};

const ZH_CN: PricingContent = {
  labels: {
    heroTitle: '只为实际完成的 AI 任务付费',
    footnote: '价格以美元计。结账、账单与自动充值均在 {console} 完成。可随时调整或取消套餐。',
    consoleLabel: 'Open Design Cloud 控制台',
    monthly: '月付',
    yearly: '年付',
    yearlySave: '省最多 51%',
    perMonth: '/月',
    topTextModels: '顶级文本模型',
    topImageModels: '顶级图片模型',
    topVideoModels: '顶级视频模型',
    comingSoon: '（即将上线）',
    recommended: '推荐',
    creditBenefit: '每月 {amount} 模型额度',
    creditBonus: '限时加赠 {pct}%',
    multimodalBenefit: '顶级模型开箱即用，覆盖 Agent 与图片创作',
    multimodalTitle: '一份模型额度，驱动 Agent 与多模态创作',
    multimodalDescription: '从理解需求、规划并执行设计任务，到生成图片，无需分别配置供应商 API Key。生成前展示预估费用，成功后按实际用量扣除。视频生成即将上线。',
    designAgent: '专业设计 Agent',
    imageGeneration: '图片生成',
    videoGeneration: '视频生成',
    freeForever: '永久免费',
    freeTrialCreditLabel: '有限的模型体验额度（7 天内有效）',
    firstMonthTag: '首月 {pct}% Off',
    yearlyDiscountTag: '{pct}% Off',
    yearlySubline: '按年计费 · {totalUsd}/年（省 {savingsUsd}）',
    monthlyRenewal: '次月起 {amountUsd}/月',
    yearlySaveCta: '年付立省 {savingsUsd}',
  },
  free: {
    tagline: '限时免费体验，结束后需配置 Agent 或 BYOK',
    ctaLabel: '免费开始',
    concurrency: '1 个任务并发',
    features: ['BYOK 自带密钥，支持本地 Coding Agent', '社区支持'],
  },
  plans: {
    plus: {
      tagline: '独立项目、零散需求，单人交付 · 零配置即用',
      ctaLabel: '升级 Plus',
      concurrency: '2 个任务并发',
      features: [
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '邮件支持',
      ],
    },
    pro: {
      tagline: '一个人产出整个设计团队的活 · 零配置即用',
      ctaLabel: '升级 Pro',
      concurrency: '5 个任务并发',
      features: [
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '优先邮件支持',
      ],
    },
    max: {
      tagline: '把外包设计费砸到零头 · 零配置即用',
      ctaLabel: '升级 Max',
      concurrency: '10 个任务并发',
      features: [
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '高峰优先算力 · 更低时延',
        '专属客户成功',
      ],
    },
  },
};

const ZH_TW: PricingContent = {
  labels: {
    heroTitle: '只為實際完成的 AI 任務付費',
    footnote: '價格以美元計。結帳、帳單與自動加值皆於 {console} 完成。可隨時調整或取消方案。',
    consoleLabel: 'Open Design Cloud 主控台',
    monthly: '月付',
    yearly: '年付',
    yearlySave: '最多省 51%',
    perMonth: '/ 月',
    topTextModels: '頂級文字模型',
    topImageModels: '頂級圖片模型',
    topVideoModels: '頂級影片模型',
    comingSoon: '（即將上線）',
    recommended: '推薦',
    creditBenefit: '每月 {amount} 模型額度',
    creditBonus: '限時加贈 {pct}%',
    multimodalBenefit: '頂級模型開箱即用，涵蓋 Agent 與圖片創作',
    multimodalTitle: '一份模型額度，驅動 Agent 與多模態創作',
    multimodalDescription: '從理解需求、規劃並執行設計任務，到生成圖片，無需分別配置供應商 API Key。生成前顯示預估費用，成功後依實際用量扣除。影片生成即將上線。',
    designAgent: '專業設計 Agent',
    imageGeneration: '圖片生成',
    videoGeneration: '影片生成',
    freeForever: '永久免費',
    freeTrialCreditLabel: '有限的模型體驗額度（7 天內有效）',
    firstMonthTag: '首月 {pct}% Off',
    yearlyDiscountTag: '{pct}% Off',
    yearlySubline: '按年計費 · {totalUsd} / 年（省 {savingsUsd}）',
    monthlyRenewal: '次月起 {amountUsd} / 月',
    yearlySaveCta: '年付立省 {savingsUsd}',
  },
  free: {
    tagline: '限時免費體驗，結束後需配置 Agent 或 BYOK',
    ctaLabel: '免費開始',
    concurrency: '1 個任務並行',
    features: ['BYOK 自帶密鑰，支援本機 Coding Agent', '社群支援'],
  },
  plans: {
    plus: {
      tagline: '獨立專案、零散需求，單人交付 · 零配置即用',
      ctaLabel: '升級 Plus',
      concurrency: '2 個任務並行',
      features: [
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '郵件支援',
      ],
    },
    pro: {
      tagline: '一個人產出整個設計團隊的活 · 零配置即用',
      ctaLabel: '升級 Pro',
      concurrency: '5 個任務並行',
      features: [
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '優先郵件支援',
      ],
    },
    max: {
      tagline: '把外包設計費砍到零頭 · 零配置即用',
      ctaLabel: '升級 Max',
      concurrency: '10 個任務並行',
      features: [
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '高峰優先算力 · 更低時延',
        '專屬客戶成功',
      ],
    },
  },
};

const ES: PricingContent = {
  labels: {
    heroTitle: 'Paga solo por tareas de IA completadas',
    footnote: 'Precios en USD. El pago, la facturación y la recarga automática se gestionan en la {console}. Cambia o cancela tu plan cuando quieras.',
    consoleLabel: 'consola de Open Design Cloud',
    monthly: 'Mensual',
    yearly: 'Anual',
    yearlySave: 'Ahorra hasta 51%',
    perMonth: '/ mes',
    topTextModels: 'Modelos de texto líderes',
    topImageModels: 'Modelos de imagen líderes',
    topVideoModels: 'Modelos de vídeo líderes',
    comingSoon: ' (Próximamente)',
    recommended: 'Recomendado',
    creditBenefit: '{amount} en créditos de modelo / mes',
    creditBonus: '+{pct}% extra (limitado)',
    multimodalBenefit: 'Modelos de primer nivel listos para agentes e imágenes',
    multimodalTitle: 'Un saldo impulsa agentes y creación multimodal',
    multimodalDescription: 'Desde comprender el encargo y ejecutar el trabajo de diseño hasta generar imágenes, sin configurar claves API de proveedores. Consulta una estimación antes de generar; solo se cobra el uso real de las generaciones completadas. La generación de vídeo llegará pronto.',
    designAgent: 'Agente de diseño profesional',
    imageGeneration: 'Generación de imágenes',
    videoGeneration: 'Generación de vídeo',
    freeForever: 'Gratis para siempre',
    freeTrialCreditLabel: 'Créditos de prueba de modelos limitados (válidos por 7 días)',
    firstMonthTag: '1.er mes {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Facturado anual · {totalUsd} / año (ahorra {savingsUsd})',
    monthlyRenewal: 'Luego {amountUsd} / mes',
    yearlySaveCta: 'Ahorra {savingsUsd} al año',
  },
  free: {
    tagline: 'Prueba gratis por tiempo limitado; después configura tu agent o usa BYOK',
    ctaLabel: 'Empezar gratis',
    concurrency: '1 tarea simultánea',
    features: ['Claves BYOK · Coding agents locales', 'Soporte de la comunidad'],
  },
  plans: {
    plus: {
      tagline: 'Proyectos independientes, entrega en solitario · Sin configuración',
      ctaLabel: 'Subir a Plus',
      concurrency: '2 tareas simultáneas',
      features: [
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ Design Systems',
        'Soporte por email',
      ],
    },
    pro: {
      tagline: 'Una persona produce el trabajo de todo un equipo · Sin configuración',
      ctaLabel: 'Subir a Pro',
      concurrency: '5 tareas simultáneas',
      features: [
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ Design Systems',
        'Soporte prioritario por email',
      ],
    },
    max: {
      tagline: 'Reduce el gasto en diseño externo a una fracción · Sin configuración',
      ctaLabel: 'Subir a Max',
      concurrency: '10 tareas simultáneas',
      features: [
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ Design Systems',
        'Cómputo prioritario en horas pico · menor latencia',
        'Customer success dedicado',
      ],
    },
  },
};

const PT_BR: PricingContent = {
  labels: {
    heroTitle: 'Pague apenas por tarefas de IA concluídas',
    footnote: 'Preços em USD. Pagamento, faturamento e recarga automática são feitos no {console}. Ajuste ou cancele seu plano quando quiser.',
    consoleLabel: 'console do Open Design Cloud',
    monthly: 'Mensal',
    yearly: 'Anual',
    yearlySave: 'Economize até 51%',
    perMonth: '/ mês',
    topTextModels: 'Principais modelos de texto',
    topImageModels: 'Principais modelos de imagem',
    topVideoModels: 'Principais modelos de vídeo',
    comingSoon: ' (Em breve)',
    recommended: 'Recomendado',
    creditBenefit: '{amount} em créditos de modelo / mês',
    creditBonus: '+{pct}% bônus (limitado)',
    multimodalBenefit: 'Modelos de ponta prontos para agentes e imagens',
    multimodalTitle: 'Um saldo impulsiona agentes e criação multimodal',
    multimodalDescription: 'Da compreensão do briefing e execução do trabalho de design à geração de imagens, sem configurar chaves de API de provedores. Veja uma estimativa antes de gerar; gerações concluídas são cobradas pelo uso real. A geração de vídeo chega em breve.',
    designAgent: 'Agente de design profissional',
    imageGeneration: 'Geração de imagem',
    videoGeneration: 'Geração de vídeo',
    freeForever: 'Grátis para sempre',
    freeTrialCreditLabel: 'Créditos de teste de modelos limitados (válidos por 7 dias)',
    firstMonthTag: '1º mês {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Cobrado anualmente · {totalUsd} / ano (economize {savingsUsd})',
    monthlyRenewal: 'Depois {amountUsd} / mês',
    yearlySaveCta: 'Economize {savingsUsd} por ano',
  },
  free: {
    tagline: 'Teste grátis por tempo limitado; depois configure seu agent ou use BYOK',
    ctaLabel: 'Começar grátis',
    concurrency: '1 tarefa simultânea',
    features: ['Chaves BYOK · Coding agents locais', 'Suporte da comunidade'],
  },
  plans: {
    plus: {
      tagline: 'Projetos independentes, entrega individual · Sem configuração',
      ctaLabel: 'Atualizar para Plus',
      concurrency: '2 tarefas simultâneas',
      features: [
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ Design Systems',
        'Suporte por email',
      ],
    },
    pro: {
      tagline: 'Uma pessoa entrega o trabalho de um time inteiro · Sem configuração',
      ctaLabel: 'Atualizar para Pro',
      concurrency: '5 tarefas simultâneas',
      features: [
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ Design Systems',
        'Suporte prioritário por email',
      ],
    },
    max: {
      tagline: 'Reduza o custo de design terceirizado a uma fração · Sem configuração',
      ctaLabel: 'Atualizar para Max',
      concurrency: '10 tarefas simultâneas',
      features: [
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ Design Systems',
        'Computação prioritária em horários de pico · menor latência',
        'Customer success dedicado',
      ],
    },
  },
};

const RU: PricingContent = {
  labels: {
    heroTitle: 'Платите только за выполненные задачи ИИ',
    footnote: 'Цены указаны в USD. Оплата, выставление счетов и автопополнение выполняются в {console}. Изменение или отмена тарифа в любое время.',
    consoleLabel: 'консоли Open Design Cloud',
    monthly: 'Месяц',
    yearly: 'Год',
    yearlySave: 'Экономия до 51%',
    perMonth: '/ мес.',
    topTextModels: 'Лучшие текстовые модели',
    topImageModels: 'Лучшие модели изображений',
    topVideoModels: 'Лучшие видеомодели',
    comingSoon: ' (Скоро)',
    recommended: 'Рекомендуется',
    creditBenefit: '{amount} кредитов моделей / мес.',
    creditBonus: '+{pct}% бонус (ограничено)',
    multimodalBenefit: 'Лучшие модели сразу готовы для агентов и изображений',
    multimodalTitle: 'Единый баланс для агентов и мультимодального творчества',
    multimodalDescription: 'От понимания задачи и выполнения дизайн-работы до генерации изображений — без настройки API-ключей провайдеров. До генерации показывается оценка, а успешные генерации оплачиваются по фактическому использованию. Генерация видео скоро появится.',
    designAgent: 'Профессиональный дизайн-агент',
    imageGeneration: 'Генерация изображений',
    videoGeneration: 'Генерация видео',
    freeForever: 'Всегда бесплатно',
    freeTrialCreditLabel: 'Ограниченные пробные кредиты на модели (действуют 7 дней)',
    firstMonthTag: '1-й мес. {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Оплата за год · {totalUsd} / год (экономия {savingsUsd})',
    monthlyRenewal: 'Затем {amountUsd} / мес.',
    yearlySaveCta: 'Сэкономить {savingsUsd} за год',
  },
  free: {
    tagline: 'Бесплатный пробный период; затем настройте агента или BYOK',
    ctaLabel: 'Начать бесплатно',
    concurrency: '1 одновременная задача',
    features: ['Ключи BYOK · локальные coding-агенты', 'Поддержка сообщества'],
  },
  plans: {
    plus: {
      tagline: 'Самостоятельные проекты, в одиночку · Без настройки',
      ctaLabel: 'Перейти на Plus',
      concurrency: '2 одновременные задачи',
      features: [
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ Design Systems',
        'Поддержка по email',
      ],
    },
    pro: {
      tagline: 'Один человек — работа целой дизайн-команды · Без настройки',
      ctaLabel: 'Перейти на Pro',
      concurrency: '5 одновременных задач',
      features: [
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ Design Systems',
        'Приоритетная поддержка по email',
      ],
    },
    max: {
      tagline: 'Сократите расходы на аутсорс дизайна до минимума · Без настройки',
      ctaLabel: 'Перейти на Max',
      concurrency: '10 одновременных задач',
      features: [
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ Design Systems',
        'Приоритетные вычисления в пик · меньше задержек',
        'Выделенный customer success',
      ],
    },
  },
};

const FR: PricingContent = {
  labels: {
    heroTitle: 'Payez uniquement pour les tâches IA terminées',
    footnote: 'Prix indiqués en USD. Le paiement, la facturation et la recharge automatique se gèrent dans la {console}. Ajustez ou résiliez votre forfait à tout moment.',
    consoleLabel: 'console Open Design Cloud',
    monthly: 'Mensuel',
    yearly: 'Annuel',
    yearlySave: 'Économisez jusqu’à 51%',
    perMonth: '/ mois',
    topTextModels: 'Meilleurs modèles de texte',
    topImageModels: 'Meilleurs modèles d’image',
    topVideoModels: 'Meilleurs modèles vidéo',
    comingSoon: ' (Bientôt disponible)',
    recommended: 'Recommandé',
    creditBenefit: '{amount} de crédits de modèle / mois',
    creditBonus: '+{pct}% bonus (limité)',
    multimodalBenefit: 'Des modèles de pointe prêts pour les agents et l’image',
    multimodalTitle: 'Un seul solde pour les agents et la création multimodale',
    multimodalDescription: 'De la compréhension du brief à l’exécution du travail de design, puis à la génération d’images, sans configurer de clés API fournisseur. Une estimation s’affiche avant la génération ; les générations réussies sont facturées selon l’usage réel. La génération vidéo arrive bientôt.',
    designAgent: 'Agent de design professionnel',
    imageGeneration: 'Génération d’images',
    videoGeneration: 'Génération de vidéos',
    freeForever: 'Gratuit pour toujours',
    freeTrialCreditLabel: "Crédits d'essai de modèles limités (valables 7 jours)",
    firstMonthTag: '1er mois {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Facturé annuellement · {totalUsd} / an (économisez {savingsUsd})',
    monthlyRenewal: 'Puis {amountUsd} / mois',
    yearlySaveCta: 'Économisez {savingsUsd} par an',
  },
  free: {
    tagline: 'Essai gratuit à durée limitée ; ensuite configurez votre agent ou BYOK',
    ctaLabel: 'Commencer gratuitement',
    concurrency: '1 tâche simultanée',
    features: ['Clés BYOK · agents de code locaux', 'Support communautaire'],
  },
  plans: {
    plus: {
      tagline: 'Projets indépendants, livraison en solo · Sans configuration',
      ctaLabel: 'Passer à Plus',
      concurrency: '2 tâches simultanées',
      features: [
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ Design Systems',
        'Support par email',
      ],
    },
    pro: {
      tagline: 'Une personne produit le travail de toute une équipe · Sans configuration',
      ctaLabel: 'Passer à Pro',
      concurrency: '5 tâches simultanées',
      features: [
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ Design Systems',
        'Support email prioritaire',
      ],
    },
    max: {
      tagline: 'Réduisez le coût du design externalisé à une fraction · Sans configuration',
      ctaLabel: 'Passer à Max',
      concurrency: '10 tâches simultanées',
      features: [
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ Design Systems',
        'Calcul prioritaire en heures de pointe · latence réduite',
        'Customer success dédié',
      ],
    },
  },
};

const KO: PricingContent = {
  labels: {
    heroTitle: '완료된 AI 작업에만 비용을 지불하세요',
    footnote: '가격은 USD 기준입니다. 결제, 청구, 자동 충전은 {console}에서 처리됩니다. 플랜 변경 또는 취소는 언제든 가능합니다.',
    consoleLabel: 'Open Design Cloud 콘솔',
    monthly: '월간',
    yearly: '연간',
    yearlySave: '최대 51% 절약',
    perMonth: '/월',
    topTextModels: '최고급 텍스트 모델',
    topImageModels: '최고급 이미지 모델',
    topVideoModels: '최고급 동영상 모델',
    comingSoon: ' (출시 예정)',
    recommended: '추천',
    creditBenefit: '매월 {amount} 모델 크레딧',
    creditBonus: '한정 {pct}% 추가 증정',
    multimodalBenefit: '최상급 모델로 Agent·이미지 제작을 바로 시작',
    multimodalTitle: '하나의 크레딧으로 Agent와 멀티모달 창작',
    multimodalDescription: '요구사항을 이해하고 디자인 작업을 계획·실행하는 것부터 이미지 생성까지, 공급자 API 키를 별도로 설정할 필요가 없습니다. 생성 전 예상 비용을 확인하고, 성공한 생성은 실제 사용량만큼 차감됩니다. 동영상 생성은 출시 예정입니다.',
    designAgent: '전문 디자인 Agent',
    imageGeneration: '이미지 생성',
    videoGeneration: '동영상 생성',
    freeForever: '영구 무료',
    freeTrialCreditLabel: '제한된 모델 체험 크레딧 (7일간 유효)',
    firstMonthTag: '첫 달 {pct}% Off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: '연간 청구 · {totalUsd} /년 ({savingsUsd} 절약)',
    monthlyRenewal: '이후 {amountUsd} /월',
    yearlySaveCta: '연간 {savingsUsd} 절약',
  },
  free: {
    tagline: '기간 한정 무료 체험, 종료 후 Agent 구성 또는 BYOK 필요',
    ctaLabel: '무료로 시작',
    concurrency: '동시 작업 1개',
    features: ['BYOK 제공자 키 · 로컬 Coding Agent 지원', '커뮤니티 지원'],
  },
  plans: {
    plus: {
      tagline: '독립 프로젝트, 1인 납품 · 설정 없이 바로 사용',
      ctaLabel: 'Plus로 업그레이드',
      concurrency: '동시 작업 2개',
      features: [
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ Design Systems',
        '이메일 지원',
      ],
    },
    pro: {
      tagline: '한 사람이 디자인 팀 전체의 결과물을 · 설정 없이 바로 사용',
      ctaLabel: 'Pro로 업그레이드',
      concurrency: '동시 작업 5개',
      features: [
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ Design Systems',
        '우선 이메일 지원',
      ],
    },
    max: {
      tagline: '외주 디자인 비용을 푼돈 수준으로 · 설정 없이 바로 사용',
      ctaLabel: 'Max로 업그레이드',
      concurrency: '동시 작업 10개',
      features: [
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ Design Systems',
        '피크 시간 우선 연산 · 더 낮은 지연',
        '전담 고객 성공 지원',
      ],
    },
  },
};

const DE: PricingContent = {
  labels: {
    heroTitle: 'Zahle nur für abgeschlossene KI-Aufgaben',
    footnote: 'Preise in USD. Checkout, Abrechnung und automatisches Aufladen erfolgen in der {console}. Plan jederzeit anpassen oder kündigen.',
    consoleLabel: 'Open Design Cloud Konsole',
    monthly: 'Monatlich',
    yearly: 'Jährlich',
    yearlySave: 'Bis zu 51% sparen',
    perMonth: '/ Monat',
    topTextModels: 'Top-Textmodelle',
    topImageModels: 'Top-Bildmodelle',
    topVideoModels: 'Top-Videomodelle',
    comingSoon: ' (Demnächst)',
    recommended: 'Empfohlen',
    creditBenefit: '{amount} Modell-Credits / Monat',
    creditBonus: '+{pct}% Bonus (befristet)',
    multimodalBenefit: 'Top-Modelle sofort einsatzbereit für Agenten und Bilder',
    multimodalTitle: 'Ein Guthaben für Agenten und multimodale Kreation',
    multimodalDescription: 'Vom Verstehen des Briefings und Ausführen der Designarbeit bis zur Bildgenerierung — ohne separate Anbieter-API-Schlüssel. Vor der Generierung erscheint eine Schätzung; erfolgreiche Generierungen werden nach tatsächlicher Nutzung abgerechnet. Videogenerierung folgt in Kürze.',
    designAgent: 'Professioneller Design-Agent',
    imageGeneration: 'Bildgenerierung',
    videoGeneration: 'Videogenerierung',
    freeForever: 'Für immer kostenlos',
    freeTrialCreditLabel: 'Begrenztes Modell-Testguthaben (7 Tage gültig)',
    firstMonthTag: '1. Monat {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Jährlich abgerechnet · {totalUsd} / Jahr ({savingsUsd} sparen)',
    monthlyRenewal: 'Danach {amountUsd} / Monat',
    yearlySaveCta: '{savingsUsd} jährlich sparen',
  },
  free: {
    tagline: 'Zeitlich begrenzte Gratis-Testphase; danach eigenen Agent konfigurieren oder BYOK',
    ctaLabel: 'Kostenlos starten',
    concurrency: '1 gleichzeitige Aufgabe',
    features: ['BYOK-Anbieterschlüssel · lokale Coding Agents', 'Community-Support'],
  },
  plans: {
    plus: {
      tagline: 'Eigenständige Projekte, Lieferung im Alleingang · Ohne Einrichtung',
      ctaLabel: 'Auf Plus upgraden',
      concurrency: '2 gleichzeitige Aufgaben',
      features: [
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Design Systems',
        'E-Mail-Support',
      ],
    },
    pro: {
      tagline: 'Eine Person liefert die Arbeit eines ganzen Teams · Ohne Einrichtung',
      ctaLabel: 'Auf Pro upgraden',
      concurrency: '5 gleichzeitige Aufgaben',
      features: [
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Design Systems',
        'Priorisierter E-Mail-Support',
      ],
    },
    max: {
      tagline: 'Outsourcing-Designkosten auf einen Bruchteil senken · Ohne Einrichtung',
      ctaLabel: 'Auf Max upgraden',
      concurrency: '10 gleichzeitige Aufgaben',
      features: [
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Design Systems',
        'Priorisierte Rechenleistung zu Spitzenzeiten · geringere Latenz',
        'Dedizierter Customer Success',
      ],
    },
  },
};

const JA: PricingContent = {
  labels: {
    heroTitle: '完了した AI タスクにだけ支払う',
    footnote: '価格は米ドル表示です。決済・請求・自動チャージは {console} で行います。プランの変更・解約はいつでも可能です。',
    consoleLabel: 'Open Design Cloud コンソール',
    monthly: '月額',
    yearly: '年額',
    yearlySave: '最大 51% オフ',
    perMonth: '/ 月',
    topTextModels: 'トップテキストモデル',
    topImageModels: 'トップ画像モデル',
    topVideoModels: 'トップ動画モデル',
    comingSoon: '（近日公開）',
    recommended: 'おすすめ',
    creditBenefit: '毎月 {amount} のモデルクレジット',
    creditBonus: '期間限定 {pct}% 増量',
    multimodalBenefit: 'トップモデルをすぐに利用し、Agent・画像を制作',
    multimodalTitle: '1つのクレジットで Agent とマルチモーダル制作',
    multimodalDescription: '要件の理解、デザイン作業の計画・実行から画像の生成まで、プロバイダーの API キーを個別に設定する必要はありません。生成前に見積もりを表示し、成功した生成は実際の使用量に応じて課金されます。動画生成は近日公開予定です。',
    designAgent: 'プロフェッショナルデザイン Agent',
    imageGeneration: '画像生成',
    videoGeneration: '動画生成',
    freeForever: 'ずっと無料',
    freeTrialCreditLabel: '限定的なモデル体験クレジット（7 日間有効）',
    firstMonthTag: '初月 {pct}% Off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: '年額請求 · {totalUsd} / 年（{savingsUsd} 節約）',
    monthlyRenewal: '次月以降 {amountUsd} / 月',
    yearlySaveCta: '年額で {savingsUsd} 節約',
  },
  free: {
    tagline: '期間限定の無料体験。終了後は Agent 設定または BYOK が必要',
    ctaLabel: '無料で開始',
    concurrency: '同時実行タスク 1 件',
    features: ['BYOK プロバイダーキー・ローカル Coding Agent 対応', 'コミュニティサポート'],
  },
  plans: {
    plus: {
      tagline: '独立した案件を一人で納品 · 設定不要',
      ctaLabel: 'Plus にアップグレード',
      concurrency: '同時実行タスク 2 件',
      features: [
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ Design Systems',
        'メールサポート',
      ],
    },
    pro: {
      tagline: '一人でデザインチーム一つ分の成果を · 設定不要',
      ctaLabel: 'Pro にアップグレード',
      concurrency: '同時実行タスク 5 件',
      features: [
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ Design Systems',
        '優先メールサポート',
      ],
    },
    max: {
      tagline: '外注デザイン費を最小限に · 設定不要',
      ctaLabel: 'Max にアップグレード',
      concurrency: '同時実行タスク 10 件',
      features: [
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ Design Systems',
        'ピーク時優先コンピュート · 低レイテンシ',
        '専任カスタマーサクセス',
      ],
    },
  },
};

const CONTENT_BY_LOCALE: Partial<Record<LandingLocaleCode, PricingContent>> = {
  en: EN,
  zh: ZH_CN,
  'zh-tw': ZH_TW,
  ja: JA,
  ko: KO,
  de: DE,
  fr: FR,
  ru: RU,
  es: ES,
  'pt-br': PT_BR,
};

/** Resolve localized pricing copy, falling back to English. */
export function getPricingContent(locale: LandingLocaleCode): PricingContent {
  const content = CONTENT_BY_LOCALE[locale] ?? EN;
  if (TRIAL_CREDIT_PROMO_ENABLED) return content;
  return {
    ...content,
    free: {
      ...content.free,
      tagline: FREE_TAGLINE_TRIAL_OFF[locale] ?? FREE_TAGLINE_TRIAL_OFF.en!,
    },
  };
}

/** Fill `{token}` placeholders in a label template. */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);
}
