/*
 * Localized copy for the /pricing/ plan cards.
 *
 * Mirrors the vela subscription modal (`apps/web/src/components/commerce/
 * plans/pricing-plans.tsx`: `PLANS_BY_LOCALE` + `PRICING_LABELS`). Only the
 * NUMBERS sync from the public pricing contract (see app/_lib/pricing.ts);
 * this file holds the localized TEXT (taglines, feature bullets,
 * section/metric labels, and the number-formatting templates). When vela
 * revises that copy, mirror it here.
 *
 * vela ships 10 plan locales; this module ports the three the marketing site
 * needs first — en-US, zh-CN, zh-TW — and falls back to English for every
 * other landing locale. To add another (ja/ko/de/fr/ru/es/pt all exist in
 * vela), copy its `PLANS_BY_LOCALE` + `PRICING_LABELS` entry into a new
 * `PricingContent` below and register it in `CONTENT_BY_LOCALE`.
 */
import type { LandingLocaleCode } from '../i18n';

export type PlanTierId = 'plus' | 'pro' | 'max';

export interface PlanFeature {
  /** Section/intro heading ("Includes all … plan benefits, plus:"). */
  heading?: boolean;
  /** May include `{skillsCount}` and `{systemsCount}` catalog placeholders. */
  label: string;
}

export interface PlanCopy {
  tagline: string;
  /** Static "Design tasks" throughput, e.g. "~4-8/mo" — not in plans.json. */
  deliverablesValue: string;
  /** Green savings anchor line. */
  costAnchor: string;
  ctaLabel: string;
  features: PlanFeature[];
}

export interface PricingLabels {
  heroTitle: string;
  monthly: string;
  yearly: string;
  yearlySave: string;
  perMonth: string;
  modelCredits: string;
  deliverablesLabel: string;
  premiumModels: string;
  standardModels: string;
  recommended: string;
  // Number-formatting templates. Placeholders: {pct} {totalUsd} {savingsUsd}
  // {amountUsd}. Filled at build time and re-filled by the inline sync script.
  firstMonthTag: string;
  yearlyDiscountTag: string;
  yearlySubline: string;
  monthlyRenewal: string;
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

const EN: PricingContent = {
  labels: {
    heroTitle: 'Choose the right plan',
    footnote: 'Prices shown in USD. Checkout, billing, and auto top-up are handled in the {console}. Adjust or cancel your plan anytime.',
    consoleLabel: 'Open Design Cloud console',
    monthly: 'Monthly',
    yearly: 'Yearly',
    yearlySave: 'Save up to 51%',
    perMonth: '/ mo',
    modelCredits: 'Open Design model credits',
    deliverablesLabel: 'Design tasks (delivery-grade)',
    premiumModels: 'Premium models',
    standardModels: 'Standard models',
    recommended: 'Recommended',
    firstMonthTag: '{pct}% off 1st month',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Billed yearly · {totalUsd} / year (save {savingsUsd})',
    monthlyRenewal: 'Then {amountUsd} / mo',
  },
  plans: {
    plus: {
      tagline: 'Independent projects, solo delivery · Zero-config',
      deliverablesValue: '~4-8/mo',
      costAnchor: 'Ship designs 10x faster, save $1,000+/mo',
      ctaLabel: 'Upgrade to Plus',
      features: [
        { heading: true, label: 'Includes all Free plan benefits, plus:' },
        { label: 'Zero-config professional design agent' },
        { label: '{skillsCount}+ Skills workflows' },
        { label: '{systemsCount}+ Design Systems' },
        { label: '20+ flagship model credits' },
        { label: 'Email support' },
      ],
    },
    pro: {
      tagline: 'One person, a whole design team · Zero-config',
      deliverablesValue: '~20-40/mo',
      costAnchor: 'Ship designs 10x faster, save $4,000+/mo',
      ctaLabel: 'Upgrade to Pro',
      features: [
        { heading: true, label: 'Includes all Plus plan benefits, plus:' },
        { label: '5× Plus plan credits' },
        { label: 'Priority email support' },
      ],
    },
    max: {
      tagline: 'Outsourced design costs, slashed · Zero-config',
      deliverablesValue: '~40-80/mo',
      costAnchor: 'Ship designs 10x faster, save $10,000+/mo',
      ctaLabel: 'Upgrade to Max',
      features: [
        { heading: true, label: 'Includes all Pro plan benefits, plus:' },
        { label: '10× Plus plan credits' },
        { label: 'Peak-time priority compute · lower latency' },
        { label: 'Dedicated customer success' },
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
    modelCredits: 'Open Design 模型额度',
    deliverablesLabel: '设计任务（商业交付标准）',
    premiumModels: '高级模型',
    standardModels: '标准模型',
    recommended: '推荐',
    firstMonthTag: '首月 {pct}% Off',
    yearlyDiscountTag: '{pct}% Off',
    yearlySubline: '按年计费 · {totalUsd}/年（省 {savingsUsd}）',
    monthlyRenewal: '次月起 {amountUsd}/月',
  },
  plans: {
    plus: {
      tagline: '独立项目、零散需求，单人交付 · 零配置即用',
      deliverablesValue: '约4-8件/月',
      costAnchor: '设计交付提速 10 倍，每月省下 $1,000+',
      ctaLabel: '升级 Plus',
      features: [
        { heading: true, label: '含 Free 套餐全部权益，以及：' },
        { label: '零配置专业设计 Agent' },
        { label: '{skillsCount}+ Skills 工作流' },
        { label: '{systemsCount}+ Design Systems' },
        { label: '20+ 旗舰模型额度' },
        { label: '邮件支持' },
      ],
    },
    pro: {
      tagline: '一个人产出整个设计团队的活 · 零配置即用',
      deliverablesValue: '约20-40件/月',
      costAnchor: '设计交付提速 10 倍，每月省下 $4,000+',
      ctaLabel: '升级 Pro',
      features: [
        { heading: true, label: '含 Plus 套餐全部权益，以及：' },
        { label: '5 倍 Plus 套餐额度' },
        { label: '优先邮件支持' },
      ],
    },
    max: {
      tagline: '把外包设计费砸到零头 · 零配置即用',
      deliverablesValue: '约40-80件/月',
      costAnchor: '设计交付提速 10 倍，每月省下 $10,000+',
      ctaLabel: '升级 Max',
      features: [
        { heading: true, label: '含 Pro 套餐全部权益，以及：' },
        { label: '10 倍 Plus 套餐额度' },
        { label: '高峰优先算力 · 更低时延' },
        { label: '专属客户成功' },
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
    modelCredits: 'Open Design 模型額度',
    deliverablesLabel: '設計任務（商業交付標準）',
    premiumModels: '高級模型',
    standardModels: '標準模型',
    recommended: '推薦',
    firstMonthTag: '首月 {pct}% Off',
    yearlyDiscountTag: '{pct}% Off',
    yearlySubline: '按年計費 · {totalUsd} / 年（省 {savingsUsd}）',
    monthlyRenewal: '次月起 {amountUsd} / 月',
  },
  plans: {
    plus: {
      tagline: '獨立專案、零散需求，單人交付 · 零配置即用',
      deliverablesValue: '約4-8件/月',
      costAnchor: '設計交付提速 10 倍，每月省下 $1,000+',
      ctaLabel: '升級 Plus',
      features: [
        { heading: true, label: '含 Free 套餐全部權益，以及：' },
        { label: '零配置專業設計 Agent' },
        { label: '{skillsCount}+ Skills 工作流' },
        { label: '{systemsCount}+ Design Systems' },
        { label: '20+ 旗艦模型額度' },
        { label: '郵件支援' },
      ],
    },
    pro: {
      tagline: '一個人產出整個設計團隊的活 · 零配置即用',
      deliverablesValue: '約20-40件/月',
      costAnchor: '設計交付提速 10 倍，每月省下 $4,000+',
      ctaLabel: '升級 Pro',
      features: [
        { heading: true, label: '含 Plus 套餐全部權益，以及：' },
        { label: '5 倍 Plus 套餐額度' },
        { label: '優先郵件支援' },
      ],
    },
    max: {
      tagline: '把外包設計費砍到零頭 · 零配置即用',
      deliverablesValue: '約40-80件/月',
      costAnchor: '設計交付提速 10 倍，每月省下 $10,000+',
      ctaLabel: '升級 Max',
      features: [
        { heading: true, label: '含 Pro 套餐全部權益，以及：' },
        { label: '10 倍 Plus 套餐額度' },
        { label: '高峰優先算力 · 更低時延' },
        { label: '專屬客戶成功' },
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
    modelCredits: 'Créditos de modelo Open Design',
    deliverablesLabel: 'Tareas de diseño (nivel de entrega)',
    premiumModels: 'Modelos premium',
    standardModels: 'Modelos estándar',
    recommended: 'Recomendado',
    firstMonthTag: '1.er mes {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Facturado anual · {totalUsd} / año (ahorra {savingsUsd})',
    monthlyRenewal: 'Luego {amountUsd} / mes',
  },
  plans: {
    plus: {
      tagline: 'Proyectos independientes, entrega en solitario · Sin configuración',
      deliverablesValue: '~4-8/mes',
      costAnchor: 'Entrega diseños 10x más rápido y ahorra $1,000+/mes',
      ctaLabel: 'Subir a Plus',
      features: [
        { heading: true, label: 'Incluye todos los beneficios del plan Free, más:' },
        { label: 'Agent de diseño profesional sin configuración' },
        { label: '{skillsCount}+ flujos de Skills' },
        { label: '{systemsCount}+ Design Systems' },
        { label: 'Créditos para más de 20 modelos punteros' },
        { label: 'Soporte por email' },
      ],
    },
    pro: {
      tagline: 'Una persona produce el trabajo de todo un equipo · Sin configuración',
      deliverablesValue: '~20-40/mes',
      costAnchor: 'Entrega diseños 10x más rápido y ahorra $4,000+/mes',
      ctaLabel: 'Subir a Pro',
      features: [
        { heading: true, label: 'Incluye todos los beneficios del plan Plus, más:' },
        { label: '5× de los créditos del plan Plus' },
        { label: 'Soporte prioritario por email' },
      ],
    },
    max: {
      tagline: 'Reduce el gasto en diseño externo a una fracción · Sin configuración',
      deliverablesValue: '~40-80/mes',
      costAnchor: 'Entrega diseños 10x más rápido y ahorra $10,000+/mes',
      ctaLabel: 'Subir a Max',
      features: [
        { heading: true, label: 'Incluye todos los beneficios del plan Pro, más:' },
        { label: '10× de los créditos del plan Plus' },
        { label: 'Cómputo prioritario en horas pico · menor latencia' },
        { label: 'Customer success dedicado' },
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
    modelCredits: 'Créditos de modelo Open Design',
    deliverablesLabel: 'Tarefas de design (nível de entrega)',
    premiumModels: 'Modelos premium',
    standardModels: 'Modelos padrão',
    recommended: 'Recomendado',
    firstMonthTag: '1º mês {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Cobrado anualmente · {totalUsd} / ano (economize {savingsUsd})',
    monthlyRenewal: 'Depois {amountUsd} / mês',
  },
  plans: {
    plus: {
      tagline: 'Projetos independentes, entrega individual · Sem configuração',
      deliverablesValue: '~4-8/mês',
      costAnchor: 'Entregue designs 10x mais rápido, economize $1,000+/mês',
      ctaLabel: 'Atualizar para Plus',
      features: [
        { heading: true, label: 'Inclui todos os benefícios do plano Free, mais:' },
        { label: 'Agent de design profissional sem configuração' },
        { label: '{skillsCount}+ fluxos de Skills' },
        { label: '{systemsCount}+ Design Systems' },
        { label: 'Créditos para 20+ modelos de ponta' },
        { label: 'Suporte por email' },
      ],
    },
    pro: {
      tagline: 'Uma pessoa entrega o trabalho de um time inteiro · Sem configuração',
      deliverablesValue: '~20-40/mês',
      costAnchor: 'Entregue designs 10x mais rápido, economize $4,000+/mês',
      ctaLabel: 'Atualizar para Pro',
      features: [
        { heading: true, label: 'Inclui todos os benefícios do plano Plus, mais:' },
        { label: '5× dos créditos do plano Plus' },
        { label: 'Suporte prioritário por email' },
      ],
    },
    max: {
      tagline: 'Reduza o custo de design terceirizado a uma fração · Sem configuração',
      deliverablesValue: '~40-80/mês',
      costAnchor: 'Entregue designs 10x mais rápido, economize $10,000+/mês',
      ctaLabel: 'Atualizar para Max',
      features: [
        { heading: true, label: 'Inclui todos os benefícios do plano Pro, mais:' },
        { label: '10× dos créditos do plano Plus' },
        { label: 'Computação prioritária em horários de pico · menor latência' },
        { label: 'Customer success dedicado' },
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
    modelCredits: 'Кредиты моделей Open Design',
    deliverablesLabel: 'Дизайн-задачи (товарного качества)',
    premiumModels: 'Премиум-модели',
    standardModels: 'Стандартные модели',
    recommended: 'Рекомендуется',
    firstMonthTag: '1-й мес. {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Оплата за год · {totalUsd} / год (экономия {savingsUsd})',
    monthlyRenewal: 'Затем {amountUsd} / мес.',
  },
  plans: {
    plus: {
      tagline: 'Самостоятельные проекты, в одиночку · Без настройки',
      deliverablesValue: '~4-8/мес.',
      costAnchor: 'Дизайн в 10 раз быстрее, экономия $1,000+/мес',
      ctaLabel: 'Перейти на Plus',
      features: [
        { heading: true, label: 'Включает все преимущества плана Free, а также:' },
        { label: 'Профессиональный design agent без настройки' },
        { label: '{skillsCount}+ рабочих процессов Skills' },
        { label: '{systemsCount}+ Design Systems' },
        { label: 'Кредиты для 20+ флагманских моделей' },
        { label: 'Поддержка по email' },
      ],
    },
    pro: {
      tagline: 'Один человек — работа целой дизайн-команды · Без настройки',
      deliverablesValue: '~20-40/мес.',
      costAnchor: 'Дизайн в 10 раз быстрее, экономия $4,000+/мес',
      ctaLabel: 'Перейти на Pro',
      features: [
        { heading: true, label: 'Включает все преимущества плана Plus, а также:' },
        { label: '5× кредитов плана Plus' },
        { label: 'Приоритетная поддержка по email' },
      ],
    },
    max: {
      tagline: 'Сократите расходы на аутсорс дизайна до минимума · Без настройки',
      deliverablesValue: '~40-80/мес.',
      costAnchor: 'Дизайн в 10 раз быстрее, экономия $10,000+/мес',
      ctaLabel: 'Перейти на Max',
      features: [
        { heading: true, label: 'Включает все преимущества плана Pro, а также:' },
        { label: '10× кредитов плана Plus' },
        { label: 'Приоритетные вычисления в пик · меньше задержек' },
        { label: 'Выделенный customer success' },
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
    modelCredits: 'Crédits de modèles Open Design',
    deliverablesLabel: 'Tâches de design (qualité livrable)',
    premiumModels: 'Modèles premium',
    standardModels: 'Modèles standard',
    recommended: 'Recommandé',
    firstMonthTag: '1er mois {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Facturé annuellement · {totalUsd} / an (économisez {savingsUsd})',
    monthlyRenewal: 'Puis {amountUsd} / mois',
  },
  plans: {
    plus: {
      tagline: 'Projets indépendants, livraison en solo · Sans configuration',
      deliverablesValue: '~4-8/mois',
      costAnchor: 'Livrez vos designs 10x plus vite, économisez $1,000+/mois',
      ctaLabel: 'Passer à Plus',
      features: [
        { heading: true, label: 'Inclut tous les avantages du plan Free, plus :' },
        { label: 'Agent de design professionnel sans configuration' },
        { label: '{skillsCount}+ workflows Skills' },
        { label: '{systemsCount}+ Design Systems' },
        { label: 'Crédits pour 20+ modèles phares' },
        { label: 'Support par email' },
      ],
    },
    pro: {
      tagline: 'Une personne produit le travail de toute une équipe · Sans configuration',
      deliverablesValue: '~20-40/mois',
      costAnchor: 'Livrez vos designs 10x plus vite, économisez $4,000+/mois',
      ctaLabel: 'Passer à Pro',
      features: [
        { heading: true, label: 'Inclut tous les avantages du plan Plus, plus :' },
        { label: '5× des crédits du plan Plus' },
        { label: 'Support email prioritaire' },
      ],
    },
    max: {
      tagline: 'Réduisez le coût du design externalisé à une fraction · Sans configuration',
      deliverablesValue: '~40-80/mois',
      costAnchor: 'Livrez vos designs 10x plus vite, économisez $10,000+/mois',
      ctaLabel: 'Passer à Max',
      features: [
        { heading: true, label: 'Inclut tous les avantages du plan Pro, plus :' },
        { label: '10× des crédits du plan Plus' },
        { label: 'Calcul prioritaire en heures de pointe · latence réduite' },
        { label: 'Customer success dédié' },
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
    modelCredits: 'Open Design 모델 크레딧',
    deliverablesLabel: '디자인 작업 (상용 납품 수준)',
    premiumModels: '프리미엄 모델',
    standardModels: '표준 모델',
    recommended: '추천',
    firstMonthTag: '첫 달 {pct}% Off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: '연간 청구 · {totalUsd} /년 ({savingsUsd} 절약)',
    monthlyRenewal: '이후 {amountUsd} /월',
  },
  plans: {
    plus: {
      tagline: '독립 프로젝트, 1인 납품 · 설정 없이 바로 사용',
      deliverablesValue: '약 4-8건/월',
      costAnchor: '디자인 작업 10배 빠르게, 월 $1,000+ 절감',
      ctaLabel: 'Plus로 업그레이드',
      features: [
        { heading: true, label: 'Free 플랜의 모든 혜택 포함, 추가로:' },
        { label: '무설정 전문 디자인 Agent' },
        { label: '{skillsCount}+ Skills 워크플로' },
        { label: '{systemsCount}+ Design Systems' },
        { label: '20+ 플래그십 모델 크레딧' },
        { label: '이메일 지원' },
      ],
    },
    pro: {
      tagline: '한 사람이 디자인 팀 전체의 결과물을 · 설정 없이 바로 사용',
      deliverablesValue: '약 20-40건/월',
      costAnchor: '디자인 작업 10배 빠르게, 월 $4,000+ 절감',
      ctaLabel: 'Pro로 업그레이드',
      features: [
        { heading: true, label: 'Plus 플랜의 모든 혜택 포함, 추가로:' },
        { label: 'Plus 플랜 크레딧의 5배' },
        { label: '우선 이메일 지원' },
      ],
    },
    max: {
      tagline: '외주 디자인 비용을 푼돈 수준으로 · 설정 없이 바로 사용',
      deliverablesValue: '약 40-80건/월',
      costAnchor: '디자인 작업 10배 빠르게, 월 $10,000+ 절감',
      ctaLabel: 'Max로 업그레이드',
      features: [
        { heading: true, label: 'Pro 플랜의 모든 혜택 포함, 추가로:' },
        { label: 'Plus 플랜 크레딧의 10배' },
        { label: '피크 시간 우선 연산 · 더 낮은 지연' },
        { label: '전담 고객 성공 지원' },
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
    modelCredits: 'Open Design Modell-Credits',
    deliverablesLabel: 'Designaufgaben (lieferfertig)',
    premiumModels: 'Premium-Modelle',
    standardModels: 'Standardmodelle',
    recommended: 'Empfohlen',
    firstMonthTag: '1. Monat {pct}% off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: 'Jährlich abgerechnet · {totalUsd} / Jahr ({savingsUsd} sparen)',
    monthlyRenewal: 'Danach {amountUsd} / Monat',
  },
  plans: {
    plus: {
      tagline: 'Eigenständige Projekte, Lieferung im Alleingang · Ohne Einrichtung',
      deliverablesValue: '~4-8/Monat',
      costAnchor: 'Designs 10x schneller liefern, spare $1,000+/Monat',
      ctaLabel: 'Auf Plus upgraden',
      features: [
        { heading: true, label: 'Enthält alle Vorteile des Free-Plans, plus:' },
        { label: 'Professioneller Design-Agent ohne Einrichtung' },
        { label: '{skillsCount}+ Skills-Workflows' },
        { label: '{systemsCount}+ Design Systems' },
        { label: 'Credits für 20+ Flagship-Modelle' },
        { label: 'E-Mail-Support' },
      ],
    },
    pro: {
      tagline: 'Eine Person liefert die Arbeit eines ganzen Teams · Ohne Einrichtung',
      deliverablesValue: '~20-40/Monat',
      costAnchor: 'Designs 10x schneller liefern, spare $4,000+/Monat',
      ctaLabel: 'Auf Pro upgraden',
      features: [
        { heading: true, label: 'Enthält alle Vorteile des Plus-Plans, plus:' },
        { label: '5× der Credits des Plus-Plans' },
        { label: 'Priorisierter E-Mail-Support' },
      ],
    },
    max: {
      tagline: 'Outsourcing-Designkosten auf einen Bruchteil senken · Ohne Einrichtung',
      deliverablesValue: '~40-80/Monat',
      costAnchor: 'Designs 10x schneller liefern, spare $10,000+/Monat',
      ctaLabel: 'Auf Max upgraden',
      features: [
        { heading: true, label: 'Enthält alle Vorteile des Pro-Plans, plus:' },
        { label: '10× der Credits des Plus-Plans' },
        { label: 'Priorisierte Rechenleistung zu Spitzenzeiten · geringere Latenz' },
        { label: 'Dedizierter Customer Success' },
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
    modelCredits: 'Open Design モデルクレジット',
    deliverablesLabel: 'デザインタスク（商用納品品質）',
    premiumModels: 'プレミアムモデル',
    standardModels: '標準モデル',
    recommended: 'おすすめ',
    firstMonthTag: '初月 {pct}% Off',
    yearlyDiscountTag: '{pct}% off',
    yearlySubline: '年額請求 · {totalUsd} / 年（{savingsUsd} 節約）',
    monthlyRenewal: '次月以降 {amountUsd} / 月',
  },
  plans: {
    plus: {
      tagline: '独立した案件を一人で納品 · 設定不要',
      deliverablesValue: '約4-8件/月',
      costAnchor: 'デザイン納品が10倍速、月 $1,000+ 節約',
      ctaLabel: 'Plus にアップグレード',
      features: [
        { heading: true, label: 'Free プランのすべての特典に加えて：' },
        { label: '設定不要のプロ向けデザイン Agent' },
        { label: '{skillsCount}+ Skills ワークフロー' },
        { label: '{systemsCount}+ Design Systems' },
        { label: '20+ フラッグシップモデル用クレジット' },
        { label: 'メールサポート' },
      ],
    },
    pro: {
      tagline: '一人でデザインチーム一つ分の成果を · 設定不要',
      deliverablesValue: '約20-40件/月',
      costAnchor: 'デザイン納品が10倍速、月 $4,000+ 節約',
      ctaLabel: 'Pro にアップグレード',
      features: [
        { heading: true, label: 'Plus プランのすべての特典に加えて：' },
        { label: 'Plus プランの 5 倍のクレジット' },
        { label: '優先メールサポート' },
      ],
    },
    max: {
      tagline: '外注デザイン費を最小限に · 設定不要',
      deliverablesValue: '約40-80件/月',
      costAnchor: 'デザイン納品が10倍速、月 $10,000+ 節約',
      ctaLabel: 'Max にアップグレード',
      features: [
        { heading: true, label: 'Pro プランのすべての特典に加えて：' },
        { label: 'Plus プランの 10 倍のクレジット' },
        { label: 'ピーク時優先コンピュート · 低レイテンシ' },
        { label: '専任カスタマーサクセス' },
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
