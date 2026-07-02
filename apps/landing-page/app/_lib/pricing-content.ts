/*
 * Localized copy for the /pricing/ plan cards.
 *
 * Mirrors the vela subscription modal (`apps/web/src/components/commerce/
 * plans/pricing-plans.tsx`: `PLANS_BY_LOCALE` + the copy tables). The card body
 * now renders the FULLY-EXPANDED benefit list per tier — the credit and
 * deliverable rows lead, then every included benefit, with no "includes all
 * <tier> plan" heading — matching the modal's rendered output. Only the NUMBERS
 * sync from the public pricing contract (see app/_lib/pricing.ts); this file
 * holds the localized TEXT (taglines, feature bullets, section labels, and the
 * number-formatting templates). When vela revises that copy, mirror it here.
 *
 * vela ships 10 plan locales; this module ports the three the marketing site
 * needs first — en-US, zh-CN, zh-TW — and falls back to English for every
 * other landing locale. To add another (ja/ko/de/fr/ru/es/pt all exist in
 * vela), copy its `PLANS_BY_LOCALE` + copy-table entry into a new
 * `PricingContent` below and register it in `CONTENT_BY_LOCALE`.
 */
import type { LandingLocaleCode } from '../i18n';

export type PlanTierId = 'plus' | 'pro' | 'max';

export interface PlanCopy {
  tagline: string;
  /** Green savings anchor line. */
  costAnchor: string;
  ctaLabel: string;
  /**
   * Fully-expanded benefit bullets, shown under the credit + deliverable lead
   * rows — no "includes all <tier>" heading. Each string is one ✓ bullet and
   * may include `{skillsCount}` / `{systemsCount}` catalog placeholders.
   */
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
  // Lead benefit rows. `{amount}` `{pct}` `{range}` filled at render.
  creditBenefit: string;
  creditBonus: string;
  deliverableBenefit: string;
  /** Hover tooltip explaining how a "design deliverable" is counted. */
  taskTooltip: { line1: string; line2: string; note: string };
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
  plans: Record<PlanTierId, PlanCopy>;
}

// Model rosters are proper nouns — identical across locales.
export const PREMIUM_MODELS = [
  'Claude Opus 4.8',
  'Claude Opus 4.7',
  'GPT-5.5 Pro',
  'GPT-5.5',
  'Gemini 3.1 Pro',
] as const;

export const STANDARD_MODELS = [
  'GLM-5.2',
  'Kimi K2.7',
  'DeepSeek V4',
  'MiMo V2.5 Pro',
  'MiniMax M2.7',
] as const;

/**
 * Monthly delivery-capacity range per tier (locale-independent). Scales with
 * the credit multiplier: Plus $20 → Pro $120 (6×) → Max $300 (15×).
 */
export const DELIVERABLE_RANGES: Record<PlanTierId, string> = {
  plus: '4-8',
  pro: '25-50',
  max: '70-140',
};

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
    deliverableBenefit: '{range} commercial-grade design deliverables / mo',
    taskTooltip: {
      line1: '1 marketing poster / 1 landing page ≈ 1 task',
      line2: '1 multi-screen prototype ≈ 2–4 tasks',
      note: 'Actual count depends on task complexity and the model you pick',
    },
    firstMonthTag: '{pct}% off 1st month',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Billed yearly · {totalUsd} / year (save {savingsUsd})',
    monthlyRenewal: 'Then {amountUsd} / mo',
    yearlySaveCta: 'Save {savingsUsd} yearly',
  },
  plans: {
    plus: {
      tagline: 'Independent projects, solo delivery · Zero-config',
      costAnchor: 'Ship designs 10x faster, save $1,000+/mo',
      ctaLabel: 'Upgrade to Plus',
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
      costAnchor: 'Ship designs 10x faster, save $4,000+/mo',
      ctaLabel: 'Upgrade to Pro',
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
      costAnchor: 'Ship designs 10x faster, save $10,000+/mo',
      ctaLabel: 'Upgrade to Max',
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
    deliverableBenefit: '每月 {range} 份商业级设计',
    taskTooltip: {
      line1: '一张营销海报 / 一个落地页 ≈ 1 份',
      line2: '一套多页交互原型 ≈ 2–4 份',
      note: '实际任务数量取决于任务复杂度和所选模型',
    },
    firstMonthTag: '首月 {pct}% Off',
    yearlyDiscountTag: '{pct}% Off',
    yearlySubline: '按年计费 · {totalUsd}/年（省 {savingsUsd}）',
    monthlyRenewal: '次月起 {amountUsd}/月',
    yearlySaveCta: '年付立省 {savingsUsd}',
  },
  plans: {
    plus: {
      tagline: '独立项目、零散需求，单人交付 · 零配置即用',
      costAnchor: '设计交付提速 10 倍，每月省下 $1,000+',
      ctaLabel: '升级 Plus',
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
      costAnchor: '设计交付提速 10 倍，每月省下 $4,000+',
      ctaLabel: '升级 Pro',
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
      costAnchor: '设计交付提速 10 倍，每月省下 $10,000+',
      ctaLabel: '升级 Max',
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
    deliverableBenefit: '每月 {range} 份商業級設計',
    taskTooltip: {
      line1: '一張行銷海報 / 一個落地頁 ≈ 1 份',
      line2: '一套多頁互動原型 ≈ 2–4 份',
      note: '實際任務數量取決於任務複雜度與所選模型',
    },
    firstMonthTag: '首月 {pct}% Off',
    yearlyDiscountTag: '{pct}% Off',
    yearlySubline: '按年計費 · {totalUsd} / 年（省 {savingsUsd}）',
    monthlyRenewal: '次月起 {amountUsd} / 月',
    yearlySaveCta: '年付立省 {savingsUsd}',
  },
  plans: {
    plus: {
      tagline: '獨立專案、零散需求，單人交付 · 零配置即用',
      costAnchor: '設計交付提速 10 倍，每月省下 $1,000+',
      ctaLabel: '升級 Plus',
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
      costAnchor: '設計交付提速 10 倍，每月省下 $4,000+',
      ctaLabel: '升級 Pro',
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
      costAnchor: '設計交付提速 10 倍，每月省下 $10,000+',
      ctaLabel: '升級 Max',
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
    deliverableBenefit: '{range} entregables de diseño nivel comercial / mes',
    taskTooltip: {
      line1: '1 póster / 1 landing page ≈ 1 tarea',
      line2: '1 prototipo multipantalla ≈ 2–4 tareas',
      note: 'La cantidad real depende de la complejidad y del modelo elegido',
    },
    firstMonthTag: '1.er mes {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Facturado anual · {totalUsd} / año (ahorra {savingsUsd})',
    monthlyRenewal: 'Luego {amountUsd} / mes',
    yearlySaveCta: 'Ahorra {savingsUsd} al año',
  },
  plans: {
    plus: {
      tagline: 'Proyectos independientes, entrega en solitario · Sin configuración',
      costAnchor: 'Entrega diseños 10x más rápido y ahorra $1,000+/mes',
      ctaLabel: 'Subir a Plus',
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
      costAnchor: 'Entrega diseños 10x más rápido y ahorra $4,000+/mes',
      ctaLabel: 'Subir a Pro',
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
      costAnchor: 'Entrega diseños 10x más rápido y ahorra $10,000+/mes',
      ctaLabel: 'Subir a Max',
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
    deliverableBenefit: '{range} entregáveis de design nível comercial / mês',
    taskTooltip: {
      line1: '1 pôster / 1 landing page ≈ 1 tarefa',
      line2: '1 protótipo multi-tela ≈ 2–4 tarefas',
      note: 'A quantidade real depende da complexidade e do modelo escolhido',
    },
    firstMonthTag: '1º mês {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Cobrado anualmente · {totalUsd} / ano (economize {savingsUsd})',
    monthlyRenewal: 'Depois {amountUsd} / mês',
    yearlySaveCta: 'Economize {savingsUsd} por ano',
  },
  plans: {
    plus: {
      tagline: 'Projetos independentes, entrega individual · Sem configuração',
      costAnchor: 'Entregue designs 10x mais rápido, economize $1,000+/mês',
      ctaLabel: 'Atualizar para Plus',
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
      costAnchor: 'Entregue designs 10x mais rápido, economize $4,000+/mês',
      ctaLabel: 'Atualizar para Pro',
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
      costAnchor: 'Entregue designs 10x mais rápido, economize $10,000+/mês',
      ctaLabel: 'Atualizar para Max',
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
    deliverableBenefit: '{range} дизайн-результата коммерческого уровня / мес.',
    taskTooltip: {
      line1: '1 постер / 1 лендинг ≈ 1 задача',
      line2: '1 многоэкранный прототип ≈ 2–4 задачи',
      note: 'Реальное число зависит от сложности задачи и выбранной модели',
    },
    firstMonthTag: '1-й мес. {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Оплата за год · {totalUsd} / год (экономия {savingsUsd})',
    monthlyRenewal: 'Затем {amountUsd} / мес.',
    yearlySaveCta: 'Сэкономить {savingsUsd} за год',
  },
  plans: {
    plus: {
      tagline: 'Самостоятельные проекты, в одиночку · Без настройки',
      costAnchor: 'Дизайн в 10 раз быстрее, экономия $1,000+/мес',
      ctaLabel: 'Перейти на Plus',
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
      costAnchor: 'Дизайн в 10 раз быстрее, экономия $4,000+/мес',
      ctaLabel: 'Перейти на Pro',
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
      costAnchor: 'Дизайн в 10 раз быстрее, экономия $10,000+/мес',
      ctaLabel: 'Перейти на Max',
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
    deliverableBenefit: '{range} livrables de design de niveau commercial / mois',
    taskTooltip: {
      line1: '1 affiche / 1 page de destination ≈ 1 tâche',
      line2: '1 prototype multi-écran ≈ 2–4 tâches',
      note: 'Le nombre réel dépend de la complexité et du modèle choisi',
    },
    firstMonthTag: '1er mois {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Facturé annuellement · {totalUsd} / an (économisez {savingsUsd})',
    monthlyRenewal: 'Puis {amountUsd} / mois',
    yearlySaveCta: 'Économisez {savingsUsd} par an',
  },
  plans: {
    plus: {
      tagline: 'Projets indépendants, livraison en solo · Sans configuration',
      costAnchor: 'Livrez vos designs 10x plus vite, économisez $1,000+/mois',
      ctaLabel: 'Passer à Plus',
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
      costAnchor: 'Livrez vos designs 10x plus vite, économisez $4,000+/mois',
      ctaLabel: 'Passer à Pro',
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
      costAnchor: 'Livrez vos designs 10x plus vite, économisez $10,000+/mois',
      ctaLabel: 'Passer à Max',
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
    deliverableBenefit: '매월 상업 표준급 디자인 결과물 {range}건',
    taskTooltip: {
      line1: '마케팅 포스터 1개 / 랜딩 페이지 1개 ≈ 1건',
      line2: '멀티 화면 프로토타입 1세트 ≈ 2–4건',
      note: '실제 수량은 작업 복잡도와 선택한 모델에 따라 달라집니다',
    },
    firstMonthTag: '첫 달 {pct}% Off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: '연간 청구 · {totalUsd} /년 ({savingsUsd} 절약)',
    monthlyRenewal: '이후 {amountUsd} /월',
    yearlySaveCta: '연간 {savingsUsd} 절약',
  },
  plans: {
    plus: {
      tagline: '독립 프로젝트, 1인 납품 · 설정 없이 바로 사용',
      costAnchor: '디자인 작업 10배 빠르게, 월 $1,000+ 절감',
      ctaLabel: 'Plus로 업그레이드',
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
      costAnchor: '디자인 작업 10배 빠르게, 월 $4,000+ 절감',
      ctaLabel: 'Pro로 업그레이드',
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
      costAnchor: '디자인 작업 10배 빠르게, 월 $10,000+ 절감',
      ctaLabel: 'Max로 업그레이드',
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
    deliverableBenefit: '{range} Design-Ergebnisse in kommerzieller Qualität / Monat',
    taskTooltip: {
      line1: '1 Marketing-Poster / 1 Landingpage ≈ 1 Aufgabe',
      line2: '1 mehrseitiger Prototyp ≈ 2–4 Aufgaben',
      note: 'Die tatsächliche Anzahl hängt von Komplexität und gewähltem Modell ab',
    },
    firstMonthTag: '1. Monat {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Jährlich abgerechnet · {totalUsd} / Jahr ({savingsUsd} sparen)',
    monthlyRenewal: 'Danach {amountUsd} / Monat',
    yearlySaveCta: '{savingsUsd} jährlich sparen',
  },
  plans: {
    plus: {
      tagline: 'Eigenständige Projekte, Lieferung im Alleingang · Ohne Einrichtung',
      costAnchor: 'Designs 10x schneller liefern, spare $1,000+/Monat',
      ctaLabel: 'Auf Plus upgraden',
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
      costAnchor: 'Designs 10x schneller liefern, spare $4,000+/Monat',
      ctaLabel: 'Auf Pro upgraden',
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
      costAnchor: 'Designs 10x schneller liefern, spare $10,000+/Monat',
      ctaLabel: 'Auf Max upgraden',
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
    deliverableBenefit: '毎月 {range} 件の商用標準級デザイン成果物',
    taskTooltip: {
      line1: 'マーケティングポスター1点 / ランディングページ1点 ≈ 1件',
      line2: 'マルチ画面プロトタイプ1式 ≈ 2〜4件',
      note: '実際の件数はタスクの複雑さと選択モデルによって変わります',
    },
    firstMonthTag: '初月 {pct}% Off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: '年額請求 · {totalUsd} / 年（{savingsUsd} 節約）',
    monthlyRenewal: '次月以降 {amountUsd} / 月',
    yearlySaveCta: '年額で {savingsUsd} 節約',
  },
  plans: {
    plus: {
      tagline: '独立した案件を一人で納品 · 設定不要',
      costAnchor: 'デザイン納品が10倍速、月 $1,000+ 節約',
      ctaLabel: 'Plus にアップグレード',
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
      costAnchor: 'デザイン納品が10倍速、月 $4,000+ 節約',
      ctaLabel: 'Pro にアップグレード',
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
      costAnchor: 'デザイン納品が10倍速、月 $10,000+ 節約',
      ctaLabel: 'Max にアップグレード',
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
