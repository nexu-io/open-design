/*
 * Copy for the Go plan launch banner (marketing touchpoint #1).
 *
 * The banner is an UNPAID-ONLY surface: paid visitors keep seeing the DeepSeek
 * campaign that is already live, so this module carries no paid variant on
 * purpose (see the Go plan requirement doc, 「2.【1期】进行营销点位触达」).
 *
 * Same 11 locales as the rest of the landing page.
 */
import type { LandingLocaleCode } from './i18n';

export interface GoBannerCopy {
  /** Small pill in front of the headline. */
  badge: string;
  /** Headline — the positioning line, identical to the workbench modal. */
  headline: string;
  /** Supporting line: price, no-API-key, full capability. */
  detail: string;
  /** Accessible name for the whole banner link. */
  ariaLabel: string;
  /** Accessible name for the dismiss button. */
  closeLabel: string;
}

const EN: GoBannerCopy = {
  badge: 'NEW',
  headline: 'An AI design & coding plan everyone can use — Go is here',
  detail: '$5 first month · unlimited models',
  ariaLabel: 'Go plan: $5 for the first month. View pricing',
  closeLabel: 'Dismiss',
};

// Partial because LandingLocaleCode still carries the retired locales; the
// live 11 are all present and `en` backstops anything else.
const COPY: Partial<Record<LandingLocaleCode, GoBannerCopy>> = {
  en: EN,
  zh: {
    badge: 'NEW',
    headline: '人人可用的 AI 设计 Coding Plan，Go 上线',
    detail: '首月 $5 · 模型无限用',
    ariaLabel: 'Go 套餐首月 $5，查看价格方案',
    closeLabel: '关闭',
  },
  ja: {
    badge: 'NEW',
    headline: '誰もが使える AI デザイン & Coding Plan、Go 登場',
    detail: '初月 $5 · モデル無制限',
    ariaLabel: 'Go プラン初月 $5、料金プランを見る',
    closeLabel: '閉じる',
  },
  ko: {
    badge: 'NEW',
    headline: '누구나 쓸 수 있는 AI 디자인 & Coding Plan, Go 출시',
    detail: '첫 달 $5 · 모델 무제한',
    ariaLabel: 'Go 플랜 첫 달 $5, 요금제 보기',
    closeLabel: '닫기',
  },
  de: {
    badge: 'NEU',
    headline: 'Ein AI-Design- & Coding-Plan für alle — Go ist da',
    detail: '$5 im ersten Monat · Modelle unbegrenzt',
    ariaLabel: 'Go-Tarif $5 im ersten Monat, Preise ansehen',
    closeLabel: 'Schließen',
  },
  fr: {
    badge: 'NOUVEAU',
    headline: 'Un plan AI design & coding pour tous — Go est là',
    detail: '5 $ le premier mois · modèles en illimité',
    ariaLabel: 'Offre Go à 5 $ le premier mois, voir les tarifs',
    closeLabel: 'Fermer',
  },
  ru: {
    badge: 'НОВОЕ',
    headline: 'AI-план для дизайна и кода, доступный каждому — Go уже здесь',
    detail: '$5 за первый месяц · модели без лимита',
    ariaLabel: 'План Go за $5 в первый месяц, посмотреть тарифы',
    closeLabel: 'Закрыть',
  },
  es: {
    badge: 'NUEVO',
    headline: 'Un plan de diseño y coding con IA para todos: llega Go',
    detail: '$5 el primer mes · modelos ilimitados',
    ariaLabel: 'Plan Go por $5 el primer mes, ver precios',
    closeLabel: 'Cerrar',
  },
  'pt-br': {
    badge: 'NOVO',
    headline: 'Um plano de design e coding com IA para todos: chegou o Go',
    detail: '$5 no primeiro mês · modelos ilimitados',
    ariaLabel: 'Plano Go por $5 no primeiro mês, ver preços',
    closeLabel: 'Fechar',
  },
  it: {
    badge: 'NUOVO',
    headline: 'Un piano AI per design e coding alla portata di tutti: arriva Go',
    detail: '$5 il primo mese · modelli illimitati',
    ariaLabel: 'Piano Go a $5 il primo mese, vedi i prezzi',
    closeLabel: 'Chiudi',
  },
  tr: {
    badge: 'YENİ',
    headline: 'Herkesin kullanabileceği AI tasarım ve coding planı — Go geldi',
    detail: 'İlk ay $5 · modeller sınırsız',
    ariaLabel: 'Go planı ilk ay $5, fiyatlandırmayı gör',
    closeLabel: 'Kapat',
  },
};

export function getGoBannerCopy(locale: LandingLocaleCode): GoBannerCopy {
  return COPY[locale] ?? EN;
}
