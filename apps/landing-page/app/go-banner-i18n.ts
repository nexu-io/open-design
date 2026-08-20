import type { LandingLocaleCode } from './i18n';

export interface GoBannerCopy {
  badge: string;
  headline: string;
  ariaLabel: string;
  closeLabel: string;
}

const EN: GoBannerCopy = {
  badge: 'NEW',
  headline: 'Go · $5 first month · 8 popular models · ample allowance',
  ariaLabel: 'Go plan, five dollars for the first month. View pricing',
  closeLabel: 'Dismiss Go announcement',
};

const COPY: Partial<Record<LandingLocaleCode, GoBannerCopy>> = {
  en: EN,
  zh: {
    badge: 'NEW',
    headline: 'Go · 首月 $5 · 8 个热门模型 · 充裕额度',
    ariaLabel: 'Go 套餐首月五美元，查看价格方案',
    closeLabel: '关闭 Go 上线公告',
  },
  'zh-tw': {
    badge: 'NEW',
    headline: 'Go · 首月 $5 · 8 個熱門模型 · 充裕額度',
    ariaLabel: 'Go 套餐首月五美元，查看價格方案',
    closeLabel: '關閉 Go 上線公告',
  },
  ja: {
    badge: 'NEW',
    headline: 'Go · 初月 $5 · 人気モデル 8 種 · たっぷり使える',
    ariaLabel: 'Go プラン初月 5 ドル、料金を見る',
    closeLabel: 'Go のお知らせを閉じる',
  },
  ko: {
    badge: 'NEW',
    headline: 'Go · 첫 달 $5 · 인기 모델 8개 · 넉넉한 한도',
    ariaLabel: 'Go 플랜 첫 달 5달러, 요금제 보기',
    closeLabel: 'Go 출시 안내 닫기',
  },
  de: {
    badge: 'NEU',
    headline: 'Go · 5 $ im ersten Monat · 8 beliebte Modelle · großzügiges Kontingent',
    ariaLabel: 'Go-Tarif für 5 Dollar im ersten Monat, Preise ansehen',
    closeLabel: 'Go-Ankündigung schließen',
  },
  fr: {
    badge: 'NOUVEAU',
    headline: 'Go · 5 $ le premier mois · 8 modèles populaires · quota généreux',
    ariaLabel: 'Offre Go à 5 dollars le premier mois, voir les tarifs',
    closeLabel: 'Fermer l’annonce Go',
  },
  ru: {
    badge: 'НОВОЕ',
    headline: 'Go · $5 за первый месяц · 8 популярных моделей · большой лимит',
    ariaLabel: 'План Go за 5 долларов в первый месяц, посмотреть тарифы',
    closeLabel: 'Закрыть объявление Go',
  },
  es: {
    badge: 'NUEVO',
    headline: 'Go · $5 el primer mes · 8 modelos populares · capacidad amplia',
    ariaLabel: 'Plan Go por 5 dólares el primer mes, ver precios',
    closeLabel: 'Cerrar el anuncio de Go',
  },
  'pt-br': {
    badge: 'NOVO',
    headline: 'Go · $5 no primeiro mês · 8 modelos populares · franquia ampla',
    ariaLabel: 'Plano Go por 5 dólares no primeiro mês, ver preços',
    closeLabel: 'Fechar o anúncio do Go',
  },
  it: {
    badge: 'NUOVO',
    headline: 'Go · $5 il primo mese · 8 modelli popolari · quota generosa',
    ariaLabel: 'Piano Go a 5 dollari il primo mese, vedi i prezzi',
    closeLabel: 'Chiudi l’annuncio Go',
  },
  tr: {
    badge: 'YENİ',
    headline: 'Go · İlk ay $5 · 8 popüler model · yüksek kullanım kotası',
    ariaLabel: 'Go planı ilk ay 5 dolar, fiyatlandırmayı gör',
    closeLabel: 'Go duyurusunu kapat',
  },
};

export function getGoBannerCopy(locale: LandingLocaleCode): GoBannerCopy {
  return COPY[locale] ?? EN;
}
