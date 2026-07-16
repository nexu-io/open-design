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
  premiumModels: string;
  standardModels: string;
  recommended: string;
  // Lead benefit rows. `{amount}` `{pct}` filled at render.
  creditBenefit: string;
  creditBonus: string;
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

// Model rosters are proper nouns — identical across locales, mirrored 1:1 from
// the vela modal (names byte-identical so the two surfaces read the same).
// Every paid tier shares one hosted-model roster (plans differ by credit
// grant, not by model access). `trial: true` marks models the Free trial pool
// also opens up; the Free card sorts those first and greys out the rest.
export interface PricingModel {
  name: string;
  trial?: boolean;
}

export const PREMIUM_MODELS: readonly PricingModel[] = [
  { name: 'Claude-Fable-5' },
  { name: 'Claude-Opus-4.8' },
  { name: 'Claude-Opus-4.7' },
  { name: 'GPT-5.5-Pro' },
  { name: 'GPT-5.5' },
  { name: 'Gemini-3.1-Pro' },
  { name: 'Grok-4.5', trial: true },
] as const;

export const STANDARD_MODELS = [
  'GLM-5.2',
  'Kimi-K2.7',
  'DeepSeek-V4',
  'MiMo-V2.5-Pro',
  'MiniMax-M2.7',
  'Qwen-3.7-Max',
] as const;

/**
 * Limited-time credit bonus over the base grant, surfaced as a badge next to
 * the credit amount to pull users up (Pro +20%, Max +50%). `null` = no bonus.
 * The displayed credit is `grantUsd × (1 + pct/100)` — e.g. Pro $100 → $120.
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
    heroTitle: 'Choose the right plan',
    footnote: 'Prices shown in USD. Checkout, billing, and auto top-up are handled in the {console}. Adjust or cancel your plan anytime.',
    consoleLabel: 'Open Design Cloud console',
    monthly: 'Monthly',
    yearly: 'Yearly',
    yearlySave: 'Save up to 51%',
    perMonth: '/ mo',
    premiumModels: 'Premium models',
    standardModels: 'Standard models',
    recommended: 'Recommended',
    creditBenefit: '{amount} model credits / mo',
    creditBonus: 'Limited +{pct}% bonus',
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
    features: ['BYOK provider keys', 'Community support'],
  },
  plans: {
    plus: {
      tagline: 'Independent projects, solo delivery · Zero-config',
      ctaLabel: 'Upgrade to Plus',
      concurrency: '2 concurrent tasks',
      features: [
        'BYOK provider keys',
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        '20+ flagship model credits',
        'Email support',
      ],
    },
    pro: {
      tagline: 'One person, a whole design team · Zero-config',
      ctaLabel: 'Upgrade to Pro',
      concurrency: '5 concurrent tasks',
      features: [
        'BYOK provider keys',
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        '20+ flagship model credits',
        'Priority email support',
      ],
    },
    max: {
      tagline: 'Outsourced design costs, slashed · Zero-config',
      ctaLabel: 'Upgrade to Max',
      concurrency: '10 concurrent tasks',
      features: [
        'BYOK provider keys',
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        '20+ flagship model credits',
        'Peak-time priority compute · lower latency',
        'Dedicated customer success',
      ],
    },
  },
};

const ZH_CN: PricingContent = {
  labels: {
    heroTitle: '选择适合你的订阅计划',
    footnote: '价格以美元计。结账、账单与自动充值均在 {console} 完成。可随时调整或取消套餐。',
    consoleLabel: 'Open Design Cloud 控制台',
    monthly: '月付',
    yearly: '年付',
    yearlySave: '省最多 51%',
    perMonth: '/月',
    premiumModels: '高级模型',
    standardModels: '标准模型',
    recommended: '推荐',
    creditBenefit: '每月 {amount} 模型额度',
    creditBonus: '限时加赠 {pct}%',
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
    features: ['BYOK 自带密钥', '社区支持'],
  },
  plans: {
    plus: {
      tagline: '独立项目、零散需求，单人交付 · 零配置即用',
      ctaLabel: '升级 Plus',
      concurrency: '2 个任务并发',
      features: [
        'BYOK 自带密钥',
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '20+ 旗舰模型额度',
        '邮件支持',
      ],
    },
    pro: {
      tagline: '一个人产出整个设计团队的活 · 零配置即用',
      ctaLabel: '升级 Pro',
      concurrency: '5 个任务并发',
      features: [
        'BYOK 自带密钥',
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '20+ 旗舰模型额度',
        '优先邮件支持',
      ],
    },
    max: {
      tagline: '把外包设计费砸到零头 · 零配置即用',
      ctaLabel: '升级 Max',
      concurrency: '10 个任务并发',
      features: [
        'BYOK 自带密钥',
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '20+ 旗舰模型额度',
        '高峰优先算力 · 更低时延',
        '专属客户成功',
      ],
    },
  },
};

const ZH_TW: PricingContent = {
  labels: {
    heroTitle: '選擇適合你的訂閱方案',
    footnote: '價格以美元計。結帳、帳單與自動加值皆於 {console} 完成。可隨時調整或取消方案。',
    consoleLabel: 'Open Design Cloud 主控台',
    monthly: '月付',
    yearly: '年付',
    yearlySave: '最多省 51%',
    perMonth: '/ 月',
    premiumModels: '高級模型',
    standardModels: '標準模型',
    recommended: '推薦',
    creditBenefit: '每月 {amount} 模型額度',
    creditBonus: '限時加贈 {pct}%',
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
    features: ['BYOK 自帶密鑰', '社群支援'],
  },
  plans: {
    plus: {
      tagline: '獨立專案、零散需求，單人交付 · 零配置即用',
      ctaLabel: '升級 Plus',
      concurrency: '2 個任務並行',
      features: [
        'BYOK 自帶密鑰',
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '20+ 旗艦模型額度',
        '郵件支援',
      ],
    },
    pro: {
      tagline: '一個人產出整個設計團隊的活 · 零配置即用',
      ctaLabel: '升級 Pro',
      concurrency: '5 個任務並行',
      features: [
        'BYOK 自帶密鑰',
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '20+ 旗艦模型額度',
        '優先郵件支援',
      ],
    },
    max: {
      tagline: '把外包設計費砍到零頭 · 零配置即用',
      ctaLabel: '升級 Max',
      concurrency: '10 個任務並行',
      features: [
        'BYOK 自帶密鑰',
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ Design Systems',
        '20+ 旗艦模型額度',
        '高峰優先算力 · 更低時延',
        '專屬客戶成功',
      ],
    },
  },
};

const ES: PricingContent = {
  labels: {
    heroTitle: 'Elige el plan adecuado',
    footnote: 'Precios en USD. El pago, la facturación y la recarga automática se gestionan en la {console}. Cambia o cancela tu plan cuando quieras.',
    consoleLabel: 'consola de Open Design Cloud',
    monthly: 'Mensual',
    yearly: 'Anual',
    yearlySave: 'Ahorra hasta 51%',
    perMonth: '/ mes',
    premiumModels: 'Modelos premium',
    standardModels: 'Modelos estándar',
    recommended: 'Recomendado',
    creditBenefit: '{amount} en créditos de modelo / mes',
    creditBonus: '+{pct}% extra (limitado)',
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
    features: ['Claves BYOK de proveedores', 'Soporte de la comunidad'],
  },
  plans: {
    plus: {
      tagline: 'Proyectos independientes, entrega en solitario · Sin configuración',
      ctaLabel: 'Subir a Plus',
      concurrency: '2 tareas simultáneas',
      features: [
        'Claves BYOK de proveedores',
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ Design Systems',
        'Créditos para más de 20 modelos punteros',
        'Soporte por email',
      ],
    },
    pro: {
      tagline: 'Una persona produce el trabajo de todo un equipo · Sin configuración',
      ctaLabel: 'Subir a Pro',
      concurrency: '5 tareas simultáneas',
      features: [
        'Claves BYOK de proveedores',
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ Design Systems',
        'Créditos para más de 20 modelos punteros',
        'Soporte prioritario por email',
      ],
    },
    max: {
      tagline: 'Reduce el gasto en diseño externo a una fracción · Sin configuración',
      ctaLabel: 'Subir a Max',
      concurrency: '10 tareas simultáneas',
      features: [
        'Claves BYOK de proveedores',
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ Design Systems',
        'Créditos para más de 20 modelos punteros',
        'Cómputo prioritario en horas pico · menor latencia',
        'Customer success dedicado',
      ],
    },
  },
};

const PT_BR: PricingContent = {
  labels: {
    heroTitle: 'Escolha o plano certo',
    footnote: 'Preços em USD. Pagamento, faturamento e recarga automática são feitos no {console}. Ajuste ou cancele seu plano quando quiser.',
    consoleLabel: 'console do Open Design Cloud',
    monthly: 'Mensal',
    yearly: 'Anual',
    yearlySave: 'Economize até 51%',
    perMonth: '/ mês',
    premiumModels: 'Modelos premium',
    standardModels: 'Modelos padrão',
    recommended: 'Recomendado',
    creditBenefit: '{amount} em créditos de modelo / mês',
    creditBonus: '+{pct}% bônus (limitado)',
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
    features: ['Chaves BYOK de provedores', 'Suporte da comunidade'],
  },
  plans: {
    plus: {
      tagline: 'Projetos independentes, entrega individual · Sem configuração',
      ctaLabel: 'Atualizar para Plus',
      concurrency: '2 tarefas simultâneas',
      features: [
        'Chaves BYOK de provedores',
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ Design Systems',
        'Créditos para 20+ modelos de ponta',
        'Suporte por email',
      ],
    },
    pro: {
      tagline: 'Uma pessoa entrega o trabalho de um time inteiro · Sem configuração',
      ctaLabel: 'Atualizar para Pro',
      concurrency: '5 tarefas simultâneas',
      features: [
        'Chaves BYOK de provedores',
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ Design Systems',
        'Créditos para 20+ modelos de ponta',
        'Suporte prioritário por email',
      ],
    },
    max: {
      tagline: 'Reduza o custo de design terceirizado a uma fração · Sem configuração',
      ctaLabel: 'Atualizar para Max',
      concurrency: '10 tarefas simultâneas',
      features: [
        'Chaves BYOK de provedores',
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ Design Systems',
        'Créditos para 20+ modelos de ponta',
        'Computação prioritária em horários de pico · menor latência',
        'Customer success dedicado',
      ],
    },
  },
};

const RU: PricingContent = {
  labels: {
    heroTitle: 'Выберите подходящий план',
    footnote: 'Цены указаны в USD. Оплата, выставление счетов и автопополнение выполняются в {console}. Изменение или отмена тарифа в любое время.',
    consoleLabel: 'консоли Open Design Cloud',
    monthly: 'Месяц',
    yearly: 'Год',
    yearlySave: 'Экономия до 51%',
    perMonth: '/ мес.',
    premiumModels: 'Премиум-модели',
    standardModels: 'Стандартные модели',
    recommended: 'Рекомендуется',
    creditBenefit: '{amount} кредитов моделей / мес.',
    creditBonus: '+{pct}% бонус (ограничено)',
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
    features: ['Ключи провайдеров BYOK', 'Поддержка сообщества'],
  },
  plans: {
    plus: {
      tagline: 'Самостоятельные проекты, в одиночку · Без настройки',
      ctaLabel: 'Перейти на Plus',
      concurrency: '2 одновременные задачи',
      features: [
        'Ключи провайдеров BYOK',
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ Design Systems',
        'Кредиты для 20+ флагманских моделей',
        'Поддержка по email',
      ],
    },
    pro: {
      tagline: 'Один человек — работа целой дизайн-команды · Без настройки',
      ctaLabel: 'Перейти на Pro',
      concurrency: '5 одновременных задач',
      features: [
        'Ключи провайдеров BYOK',
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ Design Systems',
        'Кредиты для 20+ флагманских моделей',
        'Приоритетная поддержка по email',
      ],
    },
    max: {
      tagline: 'Сократите расходы на аутсорс дизайна до минимума · Без настройки',
      ctaLabel: 'Перейти на Max',
      concurrency: '10 одновременных задач',
      features: [
        'Ключи провайдеров BYOK',
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ Design Systems',
        'Кредиты для 20+ флагманских моделей',
        'Приоритетные вычисления в пик · меньше задержек',
        'Выделенный customer success',
      ],
    },
  },
};

const FR: PricingContent = {
  labels: {
    heroTitle: 'Choisir le bon plan',
    footnote: 'Prix indiqués en USD. Le paiement, la facturation et la recharge automatique se gèrent dans la {console}. Ajustez ou résiliez votre forfait à tout moment.',
    consoleLabel: 'console Open Design Cloud',
    monthly: 'Mensuel',
    yearly: 'Annuel',
    yearlySave: 'Économisez jusqu’à 51%',
    perMonth: '/ mois',
    premiumModels: 'Modèles premium',
    standardModels: 'Modèles standard',
    recommended: 'Recommandé',
    creditBenefit: '{amount} de crédits de modèle / mois',
    creditBonus: '+{pct}% bonus (limité)',
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
    features: ['Clés fournisseur BYOK', 'Support communautaire'],
  },
  plans: {
    plus: {
      tagline: 'Projets indépendants, livraison en solo · Sans configuration',
      ctaLabel: 'Passer à Plus',
      concurrency: '2 tâches simultanées',
      features: [
        'Clés fournisseur BYOK',
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ Design Systems',
        'Crédits pour 20+ modèles phares',
        'Support par email',
      ],
    },
    pro: {
      tagline: 'Une personne produit le travail de toute une équipe · Sans configuration',
      ctaLabel: 'Passer à Pro',
      concurrency: '5 tâches simultanées',
      features: [
        'Clés fournisseur BYOK',
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ Design Systems',
        'Crédits pour 20+ modèles phares',
        'Support email prioritaire',
      ],
    },
    max: {
      tagline: 'Réduisez le coût du design externalisé à une fraction · Sans configuration',
      ctaLabel: 'Passer à Max',
      concurrency: '10 tâches simultanées',
      features: [
        'Clés fournisseur BYOK',
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ Design Systems',
        'Crédits pour 20+ modèles phares',
        'Calcul prioritaire en heures de pointe · latence réduite',
        'Customer success dédié',
      ],
    },
  },
};

const KO: PricingContent = {
  labels: {
    heroTitle: '알맞은 플랜 선택',
    footnote: '가격은 USD 기준입니다. 결제, 청구, 자동 충전은 {console}에서 처리됩니다. 플랜 변경 또는 취소는 언제든 가능합니다.',
    consoleLabel: 'Open Design Cloud 콘솔',
    monthly: '월간',
    yearly: '연간',
    yearlySave: '최대 51% 절약',
    perMonth: '/월',
    premiumModels: '프리미엄 모델',
    standardModels: '표준 모델',
    recommended: '추천',
    creditBenefit: '매월 모델 크레딧 {amount}',
    creditBonus: '한정 {pct}% 추가 증정',
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
    features: ['BYOK 제공자 키', '커뮤니티 지원'],
  },
  plans: {
    plus: {
      tagline: '독립 프로젝트, 1인 납품 · 설정 없이 바로 사용',
      ctaLabel: 'Plus로 업그레이드',
      concurrency: '동시 작업 2개',
      features: [
        'BYOK 제공자 키',
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ Design Systems',
        '20+ 플래그십 모델 크레딧',
        '이메일 지원',
      ],
    },
    pro: {
      tagline: '한 사람이 디자인 팀 전체의 결과물을 · 설정 없이 바로 사용',
      ctaLabel: 'Pro로 업그레이드',
      concurrency: '동시 작업 5개',
      features: [
        'BYOK 제공자 키',
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ Design Systems',
        '20+ 플래그십 모델 크레딧',
        '우선 이메일 지원',
      ],
    },
    max: {
      tagline: '외주 디자인 비용을 푼돈 수준으로 · 설정 없이 바로 사용',
      ctaLabel: 'Max로 업그레이드',
      concurrency: '동시 작업 10개',
      features: [
        'BYOK 제공자 키',
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ Design Systems',
        '20+ 플래그십 모델 크레딧',
        '피크 시간 우선 연산 · 더 낮은 지연',
        '전담 고객 성공 지원',
      ],
    },
  },
};

const DE: PricingContent = {
  labels: {
    heroTitle: 'Wähle den passenden Plan',
    footnote: 'Preise in USD. Checkout, Abrechnung und automatisches Aufladen erfolgen in der {console}. Plan jederzeit anpassen oder kündigen.',
    consoleLabel: 'Open Design Cloud Konsole',
    monthly: 'Monatlich',
    yearly: 'Jährlich',
    yearlySave: 'Bis zu 51% sparen',
    perMonth: '/ Monat',
    premiumModels: 'Premium-Modelle',
    standardModels: 'Standardmodelle',
    recommended: 'Empfohlen',
    creditBenefit: '{amount} Modell-Credits / Monat',
    creditBonus: '+{pct}% Bonus (befristet)',
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
    features: ['BYOK-Anbieterschlüssel', 'Community-Support'],
  },
  plans: {
    plus: {
      tagline: 'Eigenständige Projekte, Lieferung im Alleingang · Ohne Einrichtung',
      ctaLabel: 'Auf Plus upgraden',
      concurrency: '2 gleichzeitige Aufgaben',
      features: [
        'BYOK-Anbieterschlüssel',
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Design Systems',
        'Credits für 20+ Flagship-Modelle',
        'E-Mail-Support',
      ],
    },
    pro: {
      tagline: 'Eine Person liefert die Arbeit eines ganzen Teams · Ohne Einrichtung',
      ctaLabel: 'Auf Pro upgraden',
      concurrency: '5 gleichzeitige Aufgaben',
      features: [
        'BYOK-Anbieterschlüssel',
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Design Systems',
        'Credits für 20+ Flagship-Modelle',
        'Priorisierter E-Mail-Support',
      ],
    },
    max: {
      tagline: 'Outsourcing-Designkosten auf einen Bruchteil senken · Ohne Einrichtung',
      ctaLabel: 'Auf Max upgraden',
      concurrency: '10 gleichzeitige Aufgaben',
      features: [
        'BYOK-Anbieterschlüssel',
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Design Systems',
        'Credits für 20+ Flagship-Modelle',
        'Priorisierte Rechenleistung zu Spitzenzeiten · geringere Latenz',
        'Dedizierter Customer Success',
      ],
    },
  },
};

const JA: PricingContent = {
  labels: {
    heroTitle: '最適なプランを選択',
    footnote: '価格は米ドル表示です。決済・請求・自動チャージは {console} で行います。プランの変更・解約はいつでも可能です。',
    consoleLabel: 'Open Design Cloud コンソール',
    monthly: '月額',
    yearly: '年額',
    yearlySave: '最大 51% オフ',
    perMonth: '/ 月',
    premiumModels: 'プレミアムモデル',
    standardModels: '標準モデル',
    recommended: 'おすすめ',
    creditBenefit: '毎月 {amount} 分のモデルクレジット',
    creditBonus: '期間限定 {pct}% 増量',
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
    features: ['BYOK プロバイダーキー', 'コミュニティサポート'],
  },
  plans: {
    plus: {
      tagline: '独立した案件を一人で納品 · 設定不要',
      ctaLabel: 'Plus にアップグレード',
      concurrency: '同時実行タスク 2 件',
      features: [
        'BYOK プロバイダーキー',
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ Design Systems',
        '20+ フラッグシップモデル用クレジット',
        'メールサポート',
      ],
    },
    pro: {
      tagline: '一人でデザインチーム一つ分の成果を · 設定不要',
      ctaLabel: 'Pro にアップグレード',
      concurrency: '同時実行タスク 5 件',
      features: [
        'BYOK プロバイダーキー',
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ Design Systems',
        '20+ フラッグシップモデル用クレジット',
        '優先メールサポート',
      ],
    },
    max: {
      tagline: '外注デザイン費を最小限に · 設定不要',
      ctaLabel: 'Max にアップグレード',
      concurrency: '同時実行タスク 10 件',
      features: [
        'BYOK プロバイダーキー',
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ Design Systems',
        '20+ フラッグシップモデル用クレジット',
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
  return CONTENT_BY_LOCALE[locale] ?? EN;
}

/** Fill `{token}` placeholders in a label template. */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);
}
