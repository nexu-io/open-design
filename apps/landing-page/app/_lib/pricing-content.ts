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

export interface PricingPlanActionLabels {
  subscribe: string;
  current: string;
  currentCanceling: string;
  downgrade: string;
  upgrade: string;
  intervalUpgrade: string;
  switchBackToInterval: string;
  intervalDowngradeUnavailable: string;
  checkoutUnavailable: string;
  scheduled: string;
}

const EN_PLAN_ACTION_LABELS: PricingPlanActionLabels = {
  subscribe: 'Subscribe',
  current: 'Current plan',
  currentCanceling: 'Current plan · Cancels at period end',
  downgrade: 'Downgrade to {plan}',
  upgrade: 'Upgrade to {plan}',
  intervalUpgrade: 'Switch {plan} to {interval}',
  switchBackToInterval: 'Switch back to {interval} before upgrading',
  intervalDowngradeUnavailable: 'Cancel your subscription to change plans',
  checkoutUnavailable: 'Personal checkout unavailable for this account',
  scheduled: '{plan} · Scheduled',
};

const PLAN_ACTION_LABELS: Partial<Record<LandingLocaleCode, Partial<PricingPlanActionLabels>>> = {
  en: EN_PLAN_ACTION_LABELS,
  zh: {
    subscribe: '订阅', current: '当前套餐', currentCanceling: '当前套餐 · 将在周期结束时取消', downgrade: '降级至 {plan}', upgrade: '升级 {plan}', intervalUpgrade: '将 {plan} 改为{interval}', switchBackToInterval: '请先切回{interval}再升级', intervalDowngradeUnavailable: '取消订阅后可变更套餐', checkoutUnavailable: '此账户暂不能购买个人套餐', scheduled: '{plan} · 已安排',
  },
  'zh-tw': {
    subscribe: '訂閱', current: '目前方案', currentCanceling: '目前方案 · 將於週期結束時取消', downgrade: '降級至 {plan}', upgrade: '升級 {plan}', intervalUpgrade: '將 {plan} 改為{interval}', switchBackToInterval: '請先切回{interval}再升級', intervalDowngradeUnavailable: '取消訂閱後可變更方案', checkoutUnavailable: '此帳戶暫不能購買個人方案', scheduled: '{plan} · 已排程',
  },
  ja: {
    subscribe: '購読', current: '現在のプラン', currentCanceling: '現在のプラン · 期間終了時に解約', downgrade: '{plan} にダウングレード', upgrade: '{plan} にアップグレード', intervalUpgrade: '{plan} を{interval}に変更', switchBackToInterval: 'アップグレードする前に{interval}へ戻してください', intervalDowngradeUnavailable: 'プランを変更するにはサブスクリプションを解約してください', checkoutUnavailable: 'このアカウントでは個人プランを購入できません', scheduled: '{plan} · 予約済み',
  },
  ko: {
    subscribe: '구독', current: '현재 요금제', currentCanceling: '현재 요금제 · 기간 종료 시 해지', downgrade: '{plan}(으)로 다운그레이드', upgrade: '{plan}(으)로 업그레이드', intervalUpgrade: '{plan}을(를) {interval}(으)로 변경', switchBackToInterval: '업그레이드 전에 {interval}(으)로 돌아가세요', intervalDowngradeUnavailable: '요금제를 변경하려면 구독을 취소하세요', checkoutUnavailable: '이 계정에서는 개인 요금제를 구매할 수 없습니다', scheduled: '{plan} · 예약됨',
  },
  de: {
    subscribe: 'Abonnieren', current: 'Aktueller Tarif', currentCanceling: 'Aktueller Tarif · Endet zum Periodenende', downgrade: 'Auf {plan} downgraden', upgrade: 'Auf {plan} upgraden', intervalUpgrade: '{plan} auf {interval} umstellen', switchBackToInterval: 'Vor dem Upgrade zu {interval} zurückwechseln', intervalDowngradeUnavailable: 'Kündige dein Abonnement, um den Tarif zu wechseln', checkoutUnavailable: 'Persönliche Tarife sind für dieses Konto nicht verfügbar', scheduled: '{plan} · Geplant',
  },
  fr: {
    subscribe: 'S’abonner', current: 'Offre actuelle', currentCanceling: 'Offre actuelle · Résiliation en fin de période', downgrade: 'Rétrograder vers {plan}', upgrade: 'Passer à {plan}', intervalUpgrade: 'Passer {plan} en {interval}', switchBackToInterval: 'Revenez à {interval} avant la mise à niveau', intervalDowngradeUnavailable: 'Résiliez votre abonnement pour changer d’offre', checkoutUnavailable: 'Les offres personnelles sont indisponibles pour ce compte', scheduled: '{plan} · Planifié',
  },
  ru: {
    subscribe: 'Подписаться', current: 'Текущий тариф', currentCanceling: 'Текущий тариф · Отмена в конце периода', downgrade: 'Понизить до {plan}', upgrade: 'Повысить до {plan}', intervalUpgrade: 'Перевести {plan} на {interval}', switchBackToInterval: 'Перед повышением вернитесь на {interval}', intervalDowngradeUnavailable: 'Отмените подписку, чтобы изменить тариф', checkoutUnavailable: 'Личные тарифы недоступны для этого аккаунта', scheduled: '{plan} · Запланировано',
  },
  es: {
    subscribe: 'Suscribirse', current: 'Plan actual', currentCanceling: 'Plan actual · Se cancela al final del periodo', downgrade: 'Bajar a {plan}', upgrade: 'Subir a {plan}', intervalUpgrade: 'Cambiar {plan} a {interval}', switchBackToInterval: 'Vuelve a {interval} antes de subir de plan', intervalDowngradeUnavailable: 'Cancela tu suscripción para cambiar de plan', checkoutUnavailable: 'Los planes personales no están disponibles para esta cuenta', scheduled: '{plan} · Programado',
  },
  'pt-br': {
    subscribe: 'Assinar', current: 'Plano atual', currentCanceling: 'Plano atual · Cancela ao fim do período', downgrade: 'Fazer downgrade para {plan}', upgrade: 'Fazer upgrade para {plan}', intervalUpgrade: 'Mudar {plan} para {interval}', switchBackToInterval: 'Volte para {interval} antes de fazer upgrade', intervalDowngradeUnavailable: 'Cancele a assinatura para mudar de plano', checkoutUnavailable: 'Planos pessoais não estão disponíveis para esta conta', scheduled: '{plan} · Agendado',
  },
  it: { subscribe: 'Abbonati' },
  tr: { subscribe: 'Abone ol' },
};

export function getCurrentPlanLabel(locale: LandingLocaleCode): string {
  return getPricingPlanActionLabels(locale).current;
}

export function getPricingPlanActionLabels(locale: LandingLocaleCode): PricingPlanActionLabels {
  return { ...EN_PLAN_ACTION_LABELS, ...(PLAN_ACTION_LABELS[locale] ?? {}) };
}

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

export interface GoPlanCopy {
  tagline: string;
  ctaLabel: string;
  allowance: string;
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
  /** Visible failure when an explicit Cloud Console handoff is invalid. */
  checkoutDestinationUnavailable: string;
}

/** Copy owned by the live Personal comparison component. */
export interface PersonalPricingCopy {
  mostPopular: string;
  lowestUnitPrice: string;
  saveAmount: string;
  unlimitedPopularModels: string;
  customDomains: string;
  unlimitedCustomDomains: string;
  bringYourOwnApiKey: string;
  bringYourOwnApiKeyHelp: string;
  publishAndShare: string;
  goConcurrency: string;
  creatorDeveloperSupport: string;
  popularModels: string;
  flagshipModels: string;
  flagshipModelCount: string;
  imageModels: string;
  modelCount: string;
  unlimited: string;
  ample: string;
  moreAmple: string;
  notAvailable: string;
  noAccess: string;
  included: string;
  upToResolution: string;
  viewAll: string;
  showLess: string;
  viewMoreBenefits: string;
  showFewerBenefits: string;
  usageTitle: string;
  estimatedRequests: string;
  estimatedRequestsAria: string;
  usageAllowanceNote: string;
  usageEstimatesNote: string;
  modelEntitlementActivationNote: string;
  comparisonTitle: string;
  category: string;
  model: string;
  tierUse: Record<'go' | PlanTierId, string>;
  aboutPopularAllowance: string;
  aboutModelEntitlements: string;
  otherModelsTitle: string;
  otherModelsDescription: string;
}

export interface PricingContent {
  labels: PricingLabels;
  free: FreePlanCopy;
  go: GoPlanCopy;
  plans: Record<PlanTierId, PlanCopy>;
  personal: PersonalPricingCopy;
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
 * Hosted image roster, mirrored from the shipped OpenDesign Cloud catalogue
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

const PERSONAL_EN: PersonalPricingCopy = {
  mostPopular: 'Most popular',
  lowestUnitPrice: 'Lowest unit price',
  saveAmount: 'Save {amount}',
  unlimitedPopularModels: '{count} popular models unlimited',
  customDomains: '{count} domains',
  unlimitedCustomDomains: 'Unlimited domains',
  bringYourOwnApiKey: 'Supports third-party API keys',
  bringYourOwnApiKeyHelp: 'Connect API keys from other model providers and use their models in Open Design. This plan does not provide public API access.',
  publishAndShare: 'Publish artifacts online and share them',
  goConcurrency: '2 concurrent tasks',
  creatorDeveloperSupport: 'Creator / developer support',
  popularModels: 'Popular models',
  flagshipModels: 'Flagship models',
  flagshipModelCount: '{count}+ flagship models',
  imageModels: 'Image models',
  modelCount: '{count} models',
  unlimited: 'Unlimited',
  ample: 'Ample',
  moreAmple: 'More ample',
  notAvailable: 'Not available',
  noAccess: 'No access',
  included: 'Included',
  upToResolution: 'Up to {resolution}',
  viewAll: 'View all {count}',
  showLess: 'Show less',
  viewMoreBenefits: 'View more benefits',
  showFewerBenefits: 'Show fewer benefits',
  usageTitle: 'Unlimited popular models',
  estimatedRequests: 'Estimated requests every 5 hours',
  estimatedRequestsAria: 'Estimated model requests every 5 hours',
  usageAllowanceNote: 'Popular models include ample allowance, roughly equivalent to $16 every 5 hours · $40 weekly · $80 monthly. Actual usage varies by model and context length.',
  usageEstimatesNote: 'Estimated request counts by model may change with model pricing, usage patterns, and user feedback.',
  modelEntitlementActivationNote: 'Model entitlements take effect after subscribing. They may appear with a delay in the client and will display normally after updating to the latest version.',
  comparisonTitle: 'Compare every model across plans',
  category: 'Category',
  model: 'Model',
  tierUse: {
    go: 'Light use',
    plus: 'Independent',
    pro: 'Most popular',
    max: 'High volume',
  },
  aboutPopularAllowance: 'About popular model allowance',
  aboutModelEntitlements: 'About model entitlement activation',
  otherModelsTitle: 'Other available models',
  otherModelsDescription: 'Flagship and other models use monthly credits and are billed by usage. Cost varies by model and task. Available to Plus, Pro, and Max in the app.',
};

const PERSONAL_ZH_CN: PersonalPricingCopy = {
  mostPopular: '最受欢迎',
  lowestUnitPrice: '最低单位价格',
  saveAmount: '省 {amount}',
  unlimitedPopularModels: '{count} 个热门模型无限使用',
  customDomains: '支持 {count} 个域名',
  unlimitedCustomDomains: '域名无限量',
  bringYourOwnApiKey: '支持接入第三方 API Key',
  bringYourOwnApiKeyHelp: '可绑定其他模型服务商的 API Key，在 Open Design 中调用对应模型；本套餐不提供对外 API 服务。',
  publishAndShare: '支持产物发布线上与分享',
  goConcurrency: '2 个并发任务',
  creatorDeveloperSupport: '创作者 / 开发者支持',
  popularModels: '热门模型',
  flagshipModels: '旗舰模型',
  flagshipModelCount: '{count}+ 个旗舰模型',
  imageModels: '图片模型',
  modelCount: '{count} 个模型',
  unlimited: '无限量',
  ample: '充裕额度',
  moreAmple: '更充裕',
  notAvailable: '不支持',
  noAccess: '不可用',
  included: '已包含',
  upToResolution: '最高 {resolution}',
  viewAll: '查看全部 {count} 个',
  showLess: '收起',
  viewMoreBenefits: '查看更多权益',
  showFewerBenefits: '收起权益',
  usageTitle: '热门模型无限使用',
  estimatedRequests: '每 5 小时预估可用次数',
  estimatedRequestsAria: '模型每 5 小时预估请求数',
  usageAllowanceNote: '热门模型提供充足额度，大致相当于每 5 小时 $16 · 每周 $40 · 每月 $80。实际用量因模型和上下文长度而异。',
  usageEstimatesNote: '各模型的预估次数可能随模型价格、使用情况与用户反馈调整。',
  modelEntitlementActivationNote: '模型权益订阅后均已生效，客户端可能延迟展示，版本升级后会正常展示。',
  comparisonTitle: '对比各套餐的全部模型',
  category: '分类',
  model: '模型',
  tierUse: {
    go: '轻量使用',
    plus: '独立创作',
    pro: '最受欢迎',
    max: '高频生产',
  },
  aboutPopularAllowance: '查看热门模型额度说明',
  aboutModelEntitlements: '查看模型权益生效说明',
  otherModelsTitle: '其他可用模型',
  otherModelsDescription: '旗舰及其他模型均按用量扣除每月模型额度，费用取决于模型和任务。Plus、Pro 和 Max 可在应用内任选。',
};

const PERSONAL_ZH_TW: PersonalPricingCopy = {
  mostPopular: '最受歡迎',
  lowestUnitPrice: '最低單位價格',
  saveAmount: '省 {amount}',
  unlimitedPopularModels: '{count} 個熱門模型無限使用',
  customDomains: '支援 {count} 個網域',
  unlimitedCustomDomains: '網域無限量',
  bringYourOwnApiKey: '支援接入第三方 API Key',
  bringYourOwnApiKeyHelp: '可綁定其他模型服務商的 API Key，在 Open Design 中調用對應模型；本方案不提供對外 API 服務。',
  publishAndShare: '支援產物上線發佈與分享',
  goConcurrency: '2 個並行任務',
  creatorDeveloperSupport: '創作者 / 開發者支援',
  popularModels: '熱門模型',
  flagshipModels: '旗艦模型',
  flagshipModelCount: '{count}+ 個旗艦模型',
  imageModels: '圖片模型',
  modelCount: '{count} 個模型',
  unlimited: '無限量',
  ample: '充裕額度',
  moreAmple: '更充裕',
  notAvailable: '不支援',
  noAccess: '不可用',
  included: '已包含',
  upToResolution: '最高 {resolution}',
  viewAll: '查看全部 {count} 個',
  showLess: '收起',
  viewMoreBenefits: '查看更多權益',
  showFewerBenefits: '收起權益',
  usageTitle: '熱門模型無限使用',
  estimatedRequests: '每 5 小時預估可用次數',
  estimatedRequestsAria: '模型每 5 小時預估請求數',
  usageAllowanceNote: '熱門模型提供充足額度，大致相當於每 5 小時 $16 · 每週 $40 · 每月 $80。實際用量依模型與上下文長度而異。',
  usageEstimatesNote: '各模型的預估次數可能依模型價格、使用情況與使用者回饋調整。',
  modelEntitlementActivationNote: '模型權益訂閱後均已生效，客戶端可能延遲顯示，版本升級後會正常顯示。',
  comparisonTitle: '比較各方案的全部模型',
  category: '分類',
  model: '模型',
  tierUse: {
    go: '輕量使用',
    plus: '獨立創作',
    pro: '最受歡迎',
    max: '高頻製作',
  },
  aboutPopularAllowance: '查看熱門模型額度說明',
  aboutModelEntitlements: '查看模型權益生效說明',
  otherModelsTitle: '其他可用模型',
  otherModelsDescription: '旗艦及其他模型皆依用量扣除每月模型額度，費用取決於模型與任務。Plus、Pro 和 Max 可在應用程式內任選。',
};

const PERSONAL_ES: PersonalPricingCopy = {
  mostPopular: 'Más popular',
  lowestUnitPrice: 'Menor precio por unidad',
  saveAmount: 'Ahorra {amount}',
  unlimitedPopularModels: '{count} modelos populares sin límite',
  customDomains: '{count} dominios personalizados',
  unlimitedCustomDomains: 'Dominios personalizados ilimitados',
  bringYourOwnApiKey: 'Usa tu propia clave API',
  bringYourOwnApiKeyHelp: 'Vincula claves API de otros proveedores de modelos y úsalas en Open Design. Este plan no ofrece acceso API público.',
  publishAndShare: 'Publica entregables en línea y compártelos',
  goConcurrency: '2 tareas simultáneas',
  creatorDeveloperSupport: 'Soporte para creadores / desarrolladores',
  popularModels: 'Modelos populares',
  flagshipModels: 'Modelos insignia',
  flagshipModelCount: '{count}+ modelos insignia',
  imageModels: 'Modelos de imagen',
  modelCount: '{count} modelos',
  unlimited: 'Ilimitado',
  ample: 'Capacidad amplia',
  moreAmple: 'Mayor capacidad',
  notAvailable: 'No disponible',
  noAccess: 'Sin acceso',
  included: 'Incluido',
  upToResolution: 'Hasta {resolution}',
  viewAll: 'Ver los {count}',
  showLess: 'Ver menos',
  viewMoreBenefits: 'Ver más ventajas',
  showFewerBenefits: 'Ver menos ventajas',
  usageTitle: 'Modelos populares ilimitados',
  estimatedRequests: 'Solicitudes estimadas cada 5 horas',
  estimatedRequestsAria: 'Solicitudes de modelo estimadas cada 5 horas',
  usageAllowanceNote: 'Los modelos populares incluyen una capacidad amplia, equivalente aproximadamente a $16 cada 5 horas · $40 por semana · $80 al mes. El uso real varía según el modelo y la longitud del contexto.',
  usageEstimatesNote: 'Las solicitudes estimadas pueden cambiar según el precio del modelo, los patrones de uso y los comentarios de los usuarios.',
  modelEntitlementActivationNote: 'Los beneficios de los modelos se activan al suscribirte. Es posible que tarden en aparecer en el cliente; se mostrarán correctamente después de actualizar a la última versión.',
  comparisonTitle: 'Compara todos los modelos entre planes',
  category: 'Categoría',
  model: 'Modelo',
  tierUse: {
    go: 'Uso ligero',
    plus: 'Independiente',
    pro: 'Más popular',
    max: 'Alto volumen',
  },
  aboutPopularAllowance: 'Acerca de la capacidad de modelos populares',
  aboutModelEntitlements: 'Acerca de la activación de los beneficios de los modelos',
  otherModelsTitle: 'Otros modelos disponibles',
  otherModelsDescription: 'Los modelos insignia y otros modelos consumen los créditos mensuales según el uso. El coste varía según el modelo y la tarea. Disponibles en la aplicación con Plus, Pro y Max.',
};

const PERSONAL_PT_BR: PersonalPricingCopy = {
  mostPopular: 'Mais popular',
  lowestUnitPrice: 'Menor preço por unidade',
  saveAmount: 'Economize {amount}',
  unlimitedPopularModels: '{count} modelos populares ilimitados',
  customDomains: '{count} domínios personalizados',
  unlimitedCustomDomains: 'Domínios personalizados ilimitados',
  bringYourOwnApiKey: 'Use sua própria chave de API',
  bringYourOwnApiKeyHelp: 'Vincule chaves de API de outros provedores de modelos e use-as no Open Design. Este plano não oferece acesso de API público.',
  publishAndShare: 'Publique entregas online e compartilhe',
  goConcurrency: '2 tarefas simultâneas',
  creatorDeveloperSupport: 'Suporte para criadores / desenvolvedores',
  popularModels: 'Modelos populares',
  flagshipModels: 'Modelos de ponta',
  flagshipModelCount: '{count}+ modelos de ponta',
  imageModels: 'Modelos de imagem',
  modelCount: '{count} modelos',
  unlimited: 'Ilimitado',
  ample: 'Franquia ampla',
  moreAmple: 'Franquia maior',
  notAvailable: 'Indisponível',
  noAccess: 'Sem acesso',
  included: 'Incluído',
  upToResolution: 'Até {resolution}',
  viewAll: 'Ver todos os {count}',
  showLess: 'Ver menos',
  viewMoreBenefits: 'Ver mais benefícios',
  showFewerBenefits: 'Ver menos benefícios',
  usageTitle: 'Modelos populares ilimitados',
  estimatedRequests: 'Solicitações estimadas a cada 5 horas',
  estimatedRequestsAria: 'Solicitações de modelo estimadas a cada 5 horas',
  usageAllowanceNote: 'Os modelos populares incluem uma franquia ampla, aproximadamente equivalente a $16 a cada 5 horas · $40 por semana · $80 por mês. O uso real varia conforme o modelo e o tamanho do contexto.',
  usageEstimatesNote: 'As solicitações estimadas podem mudar conforme o preço do modelo, os padrões de uso e o feedback dos usuários.',
  modelEntitlementActivationNote: 'Os benefícios dos modelos entram em vigor após a assinatura. Pode haver atraso na exibição no cliente; eles aparecerão normalmente após a atualização para a versão mais recente.',
  comparisonTitle: 'Compare todos os modelos entre os planos',
  category: 'Categoria',
  model: 'Modelo',
  tierUse: {
    go: 'Uso leve',
    plus: 'Independente',
    pro: 'Mais popular',
    max: 'Alto volume',
  },
  aboutPopularAllowance: 'Sobre a franquia dos modelos populares',
  aboutModelEntitlements: 'Sobre a ativação dos benefícios dos modelos',
  otherModelsTitle: 'Outros modelos disponíveis',
  otherModelsDescription: 'Modelos de ponta e outros modelos usam os créditos mensais conforme o consumo. O custo varia por modelo e tarefa. Disponíveis no aplicativo para Plus, Pro e Max.',
};

const PERSONAL_RU: PersonalPricingCopy = {
  mostPopular: 'Самый популярный',
  lowestUnitPrice: 'Минимальная цена за единицу',
  saveAmount: 'Экономия {amount}',
  unlimitedPopularModels: '{count} популярных моделей без ограничений',
  customDomains: '{count} пользовательских доменов',
  unlimitedCustomDomains: 'Неограниченные пользовательские домены',
  bringYourOwnApiKey: 'Подключение собственного API-ключа',
  bringYourOwnApiKeyHelp: 'Можно привязать API-ключи других поставщиков моделей и вызывать их в Open Design. Этот тариф не даёт внешнего API.',
  publishAndShare: 'Публикуйте результаты онлайн и делитесь ими',
  goConcurrency: '2 одновременные задачи',
  creatorDeveloperSupport: 'Поддержка авторов / разработчиков',
  popularModels: 'Популярные модели',
  flagshipModels: 'Флагманские модели',
  flagshipModelCount: '{count}+ флагманских моделей',
  imageModels: 'Модели изображений',
  modelCount: '{count} моделей',
  unlimited: 'Без ограничений',
  ample: 'Большой лимит',
  moreAmple: 'Повышенный лимит',
  notAvailable: 'Недоступно',
  noAccess: 'Нет доступа',
  included: 'Включено',
  upToResolution: 'До {resolution}',
  viewAll: 'Показать все: {count}',
  showLess: 'Свернуть',
  viewMoreBenefits: 'Показать больше преимуществ',
  showFewerBenefits: 'Показать меньше преимуществ',
  usageTitle: 'Популярные модели без ограничений',
  estimatedRequests: 'Оценка запросов каждые 5 часов',
  estimatedRequestsAria: 'Оценка запросов к моделям каждые 5 часов',
  usageAllowanceNote: 'Популярные модели включают большой лимит, примерно равный $16 каждые 5 часов · $40 в неделю · $80 в месяц. Фактический расход зависит от модели и длины контекста.',
  usageEstimatesNote: 'Оценка числа запросов может меняться вместе с ценой модели, характером использования и отзывами пользователей.',
  modelEntitlementActivationNote: 'Права на модели активируются после подписки. В клиенте они могут появиться с задержкой и будут отображаться корректно после обновления до последней версии.',
  comparisonTitle: 'Сравните все модели во всех планах',
  category: 'Категория',
  model: 'Модель',
  tierUse: {
    go: 'Лёгкое использование',
    plus: 'Самостоятельно',
    pro: 'Самый популярный',
    max: 'Высокая нагрузка',
  },
  aboutPopularAllowance: 'О лимите популярных моделей',
  aboutModelEntitlements: 'Об активации прав на модели',
  otherModelsTitle: 'Другие доступные модели',
  otherModelsDescription: 'Флагманские и другие модели расходуют ежемесячные кредиты по факту использования. Стоимость зависит от модели и задачи. Доступны в приложении на Plus, Pro и Max.',
};

const PERSONAL_FR: PersonalPricingCopy = {
  mostPopular: 'Le plus populaire',
  lowestUnitPrice: 'Prix unitaire le plus bas',
  saveAmount: 'Économisez {amount}',
  unlimitedPopularModels: '{count} modèles populaires en illimité',
  customDomains: '{count} domaines personnalisés',
  unlimitedCustomDomains: 'Domaines personnalisés illimités',
  bringYourOwnApiKey: 'Utilisez votre propre clé API',
  bringYourOwnApiKeyHelp: 'Associez des clés API d’autres fournisseurs de modèles et utilisez-les dans Open Design. Cette offre ne fournit pas d’accès API public.',
  publishAndShare: 'Publiez les livrables en ligne et partagez-les',
  goConcurrency: '2 tâches simultanées',
  creatorDeveloperSupport: 'Support créateur / développeur',
  popularModels: 'Modèles populaires',
  flagshipModels: 'Modèles phares',
  flagshipModelCount: '{count}+ modèles phares',
  imageModels: 'Modèles d’image',
  modelCount: '{count} modèles',
  unlimited: 'Illimité',
  ample: 'Quota généreux',
  moreAmple: 'Quota supérieur',
  notAvailable: 'Indisponible',
  noAccess: 'Aucun accès',
  included: 'Inclus',
  upToResolution: 'Jusqu’à {resolution}',
  viewAll: 'Voir les {count}',
  showLess: 'Voir moins',
  viewMoreBenefits: 'Voir plus d’avantages',
  showFewerBenefits: 'Voir moins d’avantages',
  usageTitle: 'Modèles populaires en illimité',
  estimatedRequests: 'Requêtes estimées toutes les 5 heures',
  estimatedRequestsAria: 'Requêtes de modèles estimées toutes les 5 heures',
  usageAllowanceNote: 'Les modèles populaires incluent un quota généreux, soit environ 16 $ toutes les 5 heures · 40 $ par semaine · 80 $ par mois. L’usage réel varie selon le modèle et la longueur du contexte.',
  usageEstimatesNote: 'Le nombre estimé de requêtes peut évoluer avec le prix des modèles, les usages et les retours des utilisateurs.',
  modelEntitlementActivationNote: 'Les droits d’accès aux modèles prennent effet après l’abonnement. Leur affichage peut être retardé dans le client et redeviendra normal après la mise à jour vers la dernière version.',
  comparisonTitle: 'Comparez tous les modèles selon les offres',
  category: 'Catégorie',
  model: 'Modèle',
  tierUse: {
    go: 'Usage léger',
    plus: 'Indépendant',
    pro: 'Le plus populaire',
    max: 'Volume élevé',
  },
  aboutPopularAllowance: 'À propos du quota des modèles populaires',
  aboutModelEntitlements: 'À propos de l’activation des droits d’accès aux modèles',
  otherModelsTitle: 'Autres modèles disponibles',
  otherModelsDescription: 'Les modèles phares et les autres modèles consomment les crédits mensuels selon l’usage. Le coût varie selon le modèle et la tâche. Disponibles dans l’application avec Plus, Pro et Max.',
};

const PERSONAL_KO: PersonalPricingCopy = {
  mostPopular: '가장 인기 있음',
  lowestUnitPrice: '최저 단가',
  saveAmount: '{amount} 절약',
  unlimitedPopularModels: '인기 모델 {count}개 무제한',
  customDomains: '사용자 지정 도메인 {count}개',
  unlimitedCustomDomains: '사용자 지정 도메인 무제한',
  bringYourOwnApiKey: '개인 API 키 사용',
  bringYourOwnApiKeyHelp: '다른 모델 제공업체의 API 키를 연결해 Open Design에서 해당 모델을 사용할 수 있습니다. 이 요금제는 대외 API 서비스를 제공하지 않습니다.',
  publishAndShare: '산출물을 온라인에 게시하고 공유',
  goConcurrency: '동시 작업 2개',
  creatorDeveloperSupport: '크리에이터 / 개발자 지원',
  popularModels: '인기 모델',
  flagshipModels: '플래그십 모델',
  flagshipModelCount: '{count}+ 플래그십 모델',
  imageModels: '이미지 모델',
  modelCount: '모델 {count}개',
  unlimited: '무제한',
  ample: '넉넉한 한도',
  moreAmple: '더 넉넉한 한도',
  notAvailable: '지원 안 함',
  noAccess: '이용 불가',
  included: '포함',
  upToResolution: '최대 {resolution}',
  viewAll: '전체 {count}개 보기',
  showLess: '접기',
  viewMoreBenefits: '혜택 더 보기',
  showFewerBenefits: '혜택 접기',
  usageTitle: '인기 모델 무제한',
  estimatedRequests: '5시간마다 예상 사용 횟수',
  estimatedRequestsAria: '5시간마다 예상 모델 요청 수',
  usageAllowanceNote: '인기 모델에는 넉넉한 한도가 포함되며, 대략 5시간마다 $16 · 주당 $40 · 월 $80에 해당합니다. 실제 사용량은 모델과 컨텍스트 길이에 따라 달라집니다.',
  usageEstimatesNote: '모델별 예상 요청 수는 모델 가격, 사용 패턴, 사용자 피드백에 따라 조정될 수 있습니다.',
  modelEntitlementActivationNote: '모델 이용 권한은 구독 후 적용됩니다. 클라이언트에는 늦게 표시될 수 있으며 최신 버전으로 업데이트하면 정상적으로 표시됩니다.',
  comparisonTitle: '요금제별 전체 모델 비교',
  category: '분류',
  model: '모델',
  tierUse: {
    go: '가벼운 사용',
    plus: '독립 작업',
    pro: '가장 인기 있음',
    max: '대량 작업',
  },
  aboutPopularAllowance: '인기 모델 한도 안내',
  aboutModelEntitlements: '모델 이용 권한 적용 안내',
  otherModelsTitle: '기타 사용 가능 모델',
  otherModelsDescription: '플래그십 및 기타 모델은 사용량에 따라 월간 모델 크레딧을 차감합니다. 비용은 모델과 작업에 따라 달라집니다. Plus, Pro, Max에서 앱 내 선택이 가능합니다.',
};

const PERSONAL_DE: PersonalPricingCopy = {
  mostPopular: 'Am beliebtesten',
  lowestUnitPrice: 'Niedrigster Stückpreis',
  saveAmount: '{amount} sparen',
  unlimitedPopularModels: '{count} beliebte Modelle unbegrenzt',
  customDomains: '{count} benutzerdefinierte Domains',
  unlimitedCustomDomains: 'Unbegrenzte benutzerdefinierte Domains',
  bringYourOwnApiKey: 'Eigenen API-Schlüssel verwenden',
  bringYourOwnApiKeyHelp: 'API-Schlüssel anderer Modellanbieter hinterlegen und die Modelle in Open Design nutzen. Dieser Tarif bietet keinen öffentlichen API-Zugang.',
  publishAndShare: 'Artefakte online veröffentlichen und teilen',
  goConcurrency: '2 gleichzeitige Aufgaben',
  creatorDeveloperSupport: 'Support für Kreative / Entwickler',
  popularModels: 'Beliebte Modelle',
  flagshipModels: 'Flaggschiffmodelle',
  flagshipModelCount: '{count}+ Flaggschiffmodelle',
  imageModels: 'Bildmodelle',
  modelCount: '{count} Modelle',
  unlimited: 'Unbegrenzt',
  ample: 'Großzügiges Kontingent',
  moreAmple: 'Größeres Kontingent',
  notAvailable: 'Nicht verfügbar',
  noAccess: 'Kein Zugriff',
  included: 'Enthalten',
  upToResolution: 'Bis zu {resolution}',
  viewAll: 'Alle {count} anzeigen',
  showLess: 'Weniger anzeigen',
  viewMoreBenefits: 'Weitere Vorteile anzeigen',
  showFewerBenefits: 'Weniger Vorteile anzeigen',
  usageTitle: 'Beliebte Modelle unbegrenzt',
  estimatedRequests: 'Geschätzte Anfragen alle 5 Stunden',
  estimatedRequestsAria: 'Geschätzte Modellanfragen alle 5 Stunden',
  usageAllowanceNote: 'Beliebte Modelle enthalten ein großzügiges Kontingent, ungefähr entsprechend $16 alle 5 Stunden · $40 pro Woche · $80 pro Monat. Die tatsächliche Nutzung variiert je nach Modell und Kontextlänge.',
  usageEstimatesNote: 'Die geschätzten Anfragen pro Modell können sich mit Modellpreisen, Nutzungsmustern und Nutzerfeedback ändern.',
  modelEntitlementActivationNote: 'Die Modellberechtigungen werden nach dem Abonnement aktiviert. Im Client können sie verzögert erscheinen und werden nach dem Update auf die neueste Version korrekt angezeigt.',
  comparisonTitle: 'Alle Modelle nach Tarif vergleichen',
  category: 'Kategorie',
  model: 'Modell',
  tierUse: {
    go: 'Leichte Nutzung',
    plus: 'Unabhängig',
    pro: 'Am beliebtesten',
    max: 'Hohes Volumen',
  },
  aboutPopularAllowance: 'Zum Kontingent beliebter Modelle',
  aboutModelEntitlements: 'Zur Aktivierung der Modellberechtigungen',
  otherModelsTitle: 'Weitere verfügbare Modelle',
  otherModelsDescription: 'Flaggschiff- und andere Modelle verbrauchen monatliche Credits nach Nutzung. Die Kosten hängen von Modell und Aufgabe ab. In der App für Plus, Pro und Max verfügbar.',
};

const PERSONAL_JA: PersonalPricingCopy = {
  mostPopular: '一番人気',
  lowestUnitPrice: '最安の単価',
  saveAmount: '{amount} 節約',
  unlimitedPopularModels: '人気モデル {count} 種が無制限',
  customDomains: 'カスタムドメイン {count} 件',
  unlimitedCustomDomains: 'カスタムドメイン無制限',
  bringYourOwnApiKey: '自分の API キーを使用',
  bringYourOwnApiKeyHelp: '他のモデル提供元の API キーを紐づけ、Open Design 内でそのモデルを利用できます。このプランは外部向け API サービスを提供しません。',
  publishAndShare: '成果物をオンラインで公開して共有',
  goConcurrency: '同時実行タスク 2 件',
  creatorDeveloperSupport: 'クリエイター / 開発者サポート',
  popularModels: '人気モデル',
  flagshipModels: 'フラッグシップモデル',
  flagshipModelCount: 'フラッグシップモデル {count} 種以上',
  imageModels: '画像モデル',
  modelCount: '{count} モデル',
  unlimited: '無制限',
  ample: 'たっぷり使える',
  moreAmple: 'さらにたっぷり',
  notAvailable: '利用不可',
  noAccess: 'アクセス不可',
  included: '含まれます',
  upToResolution: '最大 {resolution}',
  viewAll: '全 {count} 件を見る',
  showLess: '閉じる',
  viewMoreBenefits: 'さらに特典を見る',
  showFewerBenefits: '特典を閉じる',
  usageTitle: '人気モデルを無制限に利用',
  estimatedRequests: '5 時間ごとの推定リクエスト数',
  estimatedRequestsAria: '5 時間ごとのモデル推定リクエスト数',
  usageAllowanceNote: '人気モデルには十分な利用枠が含まれ、目安は 5 時間ごとに $16 · 週 $40 · 月 $80 相当です。実際の使用量はモデルとコンテキスト長によって異なります。',
  usageEstimatesNote: 'モデル別の推定回数は、モデル価格、利用状況、ユーザーフィードバックに応じて変更される場合があります。',
  modelEntitlementActivationNote: 'モデルの利用権はサブスクリプション登録後に有効になります。クライアントへの表示が遅れる場合がありますが、最新版へアップデートすると正常に表示されます。',
  comparisonTitle: 'プラン別に全モデルを比較',
  category: 'カテゴリー',
  model: 'モデル',
  tierUse: {
    go: 'ライト利用',
    plus: '個人制作',
    pro: '一番人気',
    max: '大量制作',
  },
  aboutPopularAllowance: '人気モデルの利用枠について',
  aboutModelEntitlements: 'モデル利用権の有効化について',
  otherModelsTitle: 'その他の利用可能なモデル',
  otherModelsDescription: 'フラッグシップおよびその他のモデルは、使用量に応じて毎月のモデルクレジットを消費します。料金はモデルとタスクによって異なります。Plus、Pro、Max ではアプリ内で選択できます。',
};

const EN: PricingContent = {
  personal: PERSONAL_EN,
  labels: {
    heroTitle: 'Zero setup. Pay only for results.',
    footnote: 'Prices shown in USD. Checkout, billing, and auto top-up are handled in the {console}. Adjust or cancel your plan anytime.',
    consoleLabel: 'OpenDesign Cloud console',
    checkoutDestinationUnavailable: 'Checkout destination unavailable. Return to your Cloud Console and open Pricing again.',
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
    yearlySubline: 'Billed {totalUsd}/year',
    monthlyRenewal: 'First-month price',
    yearlySaveCta: 'Save {savingsUsd} yearly',
  },
  free: {
    tagline: 'Limited-time free trial; configure your own agent or BYOK afterwards',
    ctaLabel: 'Start free',
    concurrency: '1 concurrent task',
    features: ['BYOK provider keys · Local coding agents', 'Community support'],
  },
  go: {
    tagline: 'Light needs · Easy delivery',
    ctaLabel: 'Unavailable',
    allowance: '8 popular models · ample allowance',
    features: [
      'Full design and coding capabilities',
      'No provider API key required',
      'Allowance resets automatically',
    ],
  },
  plans: {
    plus: {
      tagline: 'Everyday design · Continuous delivery',
      ctaLabel: 'Subscribe',
      concurrency: '2 concurrent tasks',
      features: [
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        'Email support',
      ],
    },
    pro: {
      tagline: 'Complex projects · Efficient production',
      ctaLabel: 'Subscribe',
      concurrency: '5 concurrent tasks',
      features: [
        'Zero-config professional design agent',
        '{skillsCount}+ Skills workflows',
        '{systemsCount}+ Design Systems',
        'Priority email support',
      ],
    },
    max: {
      tagline: 'High-volume creation · Consistent output',
      ctaLabel: 'Subscribe',
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
  personal: PERSONAL_ZH_CN,
  labels: {
    heroTitle: '零配置，只为结果付费',
    footnote: '价格以美元计。结账、账单与自动充值均在 {console} 完成。可随时调整或取消套餐。',
    consoleLabel: 'OpenDesign Cloud 控制台',
    checkoutDestinationUnavailable: '结账环境不可用。请返回 Cloud 控制台后重新打开价格页。',
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
  go: {
    tagline: '轻量需求，轻松交付',
    ctaLabel: '已停售',
    allowance: '8 个热门模型 · 充裕额度',
    features: ['完整设计与 Coding 能力', '无需配置供应商 API Key', '额度自动恢复'],
  },
  plans: {
    plus: {
      tagline: '独立项目、零散需求，单人交付',
      ctaLabel: '升级 Plus',
      concurrency: '2 个任务并发',
      features: [
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ 设计系统',
        '邮件支持',
      ],
    },
    pro: {
      tagline: '一个人产出整个设计团队的活',
      ctaLabel: '升级 Pro',
      concurrency: '5 个任务并发',
      features: [
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ 设计系统',
        '优先邮件支持',
      ],
    },
    max: {
      tagline: '把外包设计费砸到零头',
      ctaLabel: '升级 Max',
      concurrency: '10 个任务并发',
      features: [
        '零配置专业设计 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ 设计系统',
        '高峰优先算力 · 更低时延',
        '专属客户成功',
      ],
    },
  },
};

const ZH_TW: PricingContent = {
  personal: PERSONAL_ZH_TW,
  labels: {
    heroTitle: '零配置，只為結果付費',
    footnote: '價格以美元計。結帳、帳單與自動加值皆於 {console} 完成。可隨時調整或取消方案。',
    consoleLabel: 'OpenDesign Cloud 主控台',
    checkoutDestinationUnavailable: '結帳環境無法使用。請返回 Cloud 主控台後重新開啟價格頁。',
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
  go: {
    tagline: '輕量需求，輕鬆交付',
    ctaLabel: '已停售',
    allowance: '8 個熱門模型 · 充裕額度',
    features: ['完整設計與 Coding 能力', '無需配置供應商 API Key', '額度自動恢復'],
  },
  plans: {
    plus: {
      tagline: '獨立專案、零散需求，單人交付',
      ctaLabel: '升級 Plus',
      concurrency: '2 個任務並行',
      features: [
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ 設計系統',
        '郵件支援',
      ],
    },
    pro: {
      tagline: '一個人產出整個設計團隊的活',
      ctaLabel: '升級 Pro',
      concurrency: '5 個任務並行',
      features: [
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ 設計系統',
        '優先郵件支援',
      ],
    },
    max: {
      tagline: '把外包設計費砍到零頭',
      ctaLabel: '升級 Max',
      concurrency: '10 個任務並行',
      features: [
        '零配置專業設計 Agent',
        '{skillsCount}+ Skills 工作流',
        '{systemsCount}+ 設計系統',
        '高峰優先算力 · 更低時延',
        '專屬客戶成功',
      ],
    },
  },
};

const ES: PricingContent = {
  personal: PERSONAL_ES,
  labels: {
    heroTitle: 'Paga solo por tareas de IA completadas',
    footnote: 'Precios en USD. El pago, la facturación y la recarga automática se gestionan en la {console}. Cambia o cancela tu plan cuando quieras.',
    consoleLabel: 'consola de OpenDesign Cloud',
    checkoutDestinationUnavailable: 'El destino de pago no está disponible. Vuelve a la consola Cloud y abre Precios de nuevo.',
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
  go: {
    tagline: 'Necesidades ligeras, entrega fácil · Sin configuración',
    ctaLabel: 'No disponible',
    allowance: '8 modelos populares · capacidad amplia',
    features: ['Todas las funciones de diseño y coding', 'Sin configurar claves API', 'La capacidad se restablece automáticamente'],
  },
  plans: {
    plus: {
      tagline: 'Proyectos independientes, entrega en solitario · Sin configuración',
      ctaLabel: 'Subir a Plus',
      concurrency: '2 tareas simultáneas',
      features: [
        'Agent de diseño profesional sin configuración',
        '{skillsCount}+ flujos de Skills',
        '{systemsCount}+ sistemas de diseño',
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
        '{systemsCount}+ sistemas de diseño',
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
        '{systemsCount}+ sistemas de diseño',
        'Cómputo prioritario en horas pico · menor latencia',
        'Customer success dedicado',
      ],
    },
  },
};

const PT_BR: PricingContent = {
  personal: PERSONAL_PT_BR,
  labels: {
    heroTitle: 'Pague apenas por tarefas de IA concluídas',
    footnote: 'Preços em USD. Pagamento, faturamento e recarga automática são feitos no {console}. Ajuste ou cancele seu plano quando quiser.',
    consoleLabel: 'console do OpenDesign Cloud',
    checkoutDestinationUnavailable: 'O destino de pagamento não está disponível. Volte ao console Cloud e abra Preços novamente.',
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
  go: {
    tagline: 'Demandas leves, entrega fácil · Sem configuração',
    ctaLabel: 'Indisponível',
    allowance: '8 modelos populares · franquia ampla',
    features: ['Recursos completos de design e coding', 'Sem configurar chaves de API', 'A franquia é renovada automaticamente'],
  },
  plans: {
    plus: {
      tagline: 'Projetos independentes, entrega individual · Sem configuração',
      ctaLabel: 'Atualizar para Plus',
      concurrency: '2 tarefas simultâneas',
      features: [
        'Agent de design profissional sem configuração',
        '{skillsCount}+ fluxos de Skills',
        '{systemsCount}+ sistemas de design',
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
        '{systemsCount}+ sistemas de design',
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
        '{systemsCount}+ sistemas de design',
        'Computação prioritária em horários de pico · menor latência',
        'Customer success dedicado',
      ],
    },
  },
};

const RU: PricingContent = {
  personal: PERSONAL_RU,
  labels: {
    heroTitle: 'Платите только за выполненные задачи ИИ',
    footnote: 'Цены указаны в USD. Оплата, выставление счетов и автопополнение выполняются в {console}. Изменение или отмена тарифа в любое время.',
    consoleLabel: 'консоли OpenDesign Cloud',
    checkoutDestinationUnavailable: 'Среда оплаты недоступна. Вернитесь в консоль Cloud и снова откройте страницу тарифов.',
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
  go: {
    tagline: 'Небольшие задачи без лишних усилий · Без настройки',
    ctaLabel: 'Недоступно',
    allowance: '8 популярных моделей · большой лимит',
    features: ['Все функции дизайна и кодинга', 'Без настройки API-ключей', 'Лимит восстанавливается автоматически'],
  },
  plans: {
    plus: {
      tagline: 'Самостоятельные проекты, в одиночку · Без настройки',
      ctaLabel: 'Перейти на Plus',
      concurrency: '2 одновременные задачи',
      features: [
        'Профессиональный design agent без настройки',
        '{skillsCount}+ рабочих процессов Skills',
        '{systemsCount}+ дизайн-систем',
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
        '{systemsCount}+ дизайн-систем',
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
        '{systemsCount}+ дизайн-систем',
        'Приоритетные вычисления в пик · меньше задержек',
        'Выделенный customer success',
      ],
    },
  },
};

const FR: PricingContent = {
  personal: PERSONAL_FR,
  labels: {
    heroTitle: 'Payez uniquement pour les tâches IA terminées',
    footnote: 'Prix indiqués en USD. Le paiement, la facturation et la recharge automatique se gèrent dans la {console}. Ajustez ou résiliez votre forfait à tout moment.',
    consoleLabel: 'console OpenDesign Cloud',
    checkoutDestinationUnavailable: 'La destination de paiement est indisponible. Revenez à la console Cloud et rouvrez la page Tarifs.',
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
  go: {
    tagline: 'Besoins légers, livraison facile · Zéro configuration',
    ctaLabel: 'Indisponible',
    allowance: '8 modèles populaires · quota généreux',
    features: ['Toutes les fonctions design et coding', 'Aucune clé API à configurer', 'Le quota se réinitialise automatiquement'],
  },
  plans: {
    plus: {
      tagline: 'Projets indépendants, livraison en solo · Sans configuration',
      ctaLabel: 'Passer à Plus',
      concurrency: '2 tâches simultanées',
      features: [
        'Agent de design professionnel sans configuration',
        '{skillsCount}+ workflows Skills',
        '{systemsCount}+ systèmes de design',
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
        '{systemsCount}+ systèmes de design',
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
        '{systemsCount}+ systèmes de design',
        'Calcul prioritaire en heures de pointe · latence réduite',
        'Customer success dédié',
      ],
    },
  },
};

const KO: PricingContent = {
  personal: PERSONAL_KO,
  labels: {
    heroTitle: '완료된 AI 작업에만 비용을 지불하세요',
    footnote: '가격은 USD 기준입니다. 결제, 청구, 자동 충전은 {console}에서 처리됩니다. 플랜 변경 또는 취소는 언제든 가능합니다.',
    consoleLabel: 'OpenDesign Cloud 콘솔',
    checkoutDestinationUnavailable: '결제 환경을 사용할 수 없습니다. Cloud 콘솔로 돌아가 요금 페이지를 다시 여세요.',
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
  go: {
    tagline: '가벼운 요구, 간편한 완성 · 설정 없이 사용',
    ctaLabel: '이용 불가',
    allowance: '인기 모델 8개 · 넉넉한 한도',
    features: ['모든 디자인 및 Coding 기능', '공급자 API 키 설정 불필요', '한도 자동 복원'],
  },
  plans: {
    plus: {
      tagline: '독립 프로젝트, 1인 납품 · 설정 없이 바로 사용',
      ctaLabel: 'Plus로 업그레이드',
      concurrency: '동시 작업 2개',
      features: [
        '무설정 전문 디자인 Agent',
        '{skillsCount}+ Skills 워크플로',
        '{systemsCount}+ 디자인 시스템',
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
        '{systemsCount}+ 디자인 시스템',
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
        '{systemsCount}+ 디자인 시스템',
        '피크 시간 우선 연산 · 더 낮은 지연',
        '전담 고객 성공 지원',
      ],
    },
  },
};

const DE: PricingContent = {
  personal: PERSONAL_DE,
  labels: {
    heroTitle: 'Zahle nur für abgeschlossene KI-Aufgaben',
    footnote: 'Preise in USD. Checkout, Abrechnung und automatisches Aufladen erfolgen in der {console}. Plan jederzeit anpassen oder kündigen.',
    consoleLabel: 'OpenDesign Cloud Konsole',
    checkoutDestinationUnavailable: 'Das Zahlungsziel ist nicht verfügbar. Kehre zur Cloud-Konsole zurück und öffne die Preisseite erneut.',
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
  go: {
    tagline: 'Leichte Aufgaben, mühelose Ergebnisse · Ohne Einrichtung',
    ctaLabel: 'Nicht verfügbar',
    allowance: '8 beliebte Modelle · großzügiges Kontingent',
    features: ['Alle Design- und Coding-Funktionen', 'Keine API-Schlüssel nötig', 'Kontingent wird automatisch erneuert'],
  },
  plans: {
    plus: {
      tagline: 'Eigenständige Projekte, Lieferung im Alleingang · Ohne Einrichtung',
      ctaLabel: 'Auf Plus upgraden',
      concurrency: '2 gleichzeitige Aufgaben',
      features: [
        'Professioneller Design-Agent ohne Einrichtung',
        '{skillsCount}+ Skills-Workflows',
        '{systemsCount}+ Designsysteme',
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
        '{systemsCount}+ Designsysteme',
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
        '{systemsCount}+ Designsysteme',
        'Priorisierte Rechenleistung zu Spitzenzeiten · geringere Latenz',
        'Dedizierter Customer Success',
      ],
    },
  },
};

const JA: PricingContent = {
  personal: PERSONAL_JA,
  labels: {
    heroTitle: '完了した AI タスクにだけ支払う',
    footnote: '価格は米ドル表示です。決済・請求・自動チャージは {console} で行います。プランの変更・解約はいつでも可能です。',
    consoleLabel: 'OpenDesign Cloud コンソール',
    checkoutDestinationUnavailable: '決済先を利用できません。Cloud コンソールに戻り、料金ページを開き直してください。',
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
  go: {
    tagline: '軽いニーズを手軽に完了 · 設定不要',
    ctaLabel: '利用不可',
    allowance: '人気モデル 8 種 · たっぷり使える',
    features: ['すべてのデザイン・Coding 機能', 'プロバイダー API キー設定不要', '利用枠は自動回復'],
  },
  plans: {
    plus: {
      tagline: '独立した案件を一人で納品 · 設定不要',
      ctaLabel: 'Plus にアップグレード',
      concurrency: '同時実行タスク 2 件',
      features: [
        '設定不要のプロ向けデザイン Agent',
        '{skillsCount}+ Skills ワークフロー',
        '{systemsCount}+ デザインシステム',
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
        '{systemsCount}+ デザインシステム',
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
        '{systemsCount}+ デザインシステム',
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
