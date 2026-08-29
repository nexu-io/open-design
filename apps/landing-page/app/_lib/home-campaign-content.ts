import type { LandingLocaleCode } from '../i18n';

export interface HomeCampaignContent {
  title: string;
  detail: string;
}

export const HOME_CAMPAIGN_CONTENT_BY_LOCALE = {
  en: { title: 'Put top-tier intelligence to work—without limits.', detail: 'DeepSeek V4 Pro and V4 Flash · FREE for two weeks' },
  zh: { title: '这次，顶级智能放开用。', detail: 'DeepSeek V4 Pro 与 V4 Flash · 两周免费用' },
  'zh-tw': { title: '這次，頂級智能放開用。', detail: 'DeepSeek V4 Pro 與 V4 Flash · 兩週免費用' },
  ja: { title: '最高峰の知性を、制限なく。', detail: 'DeepSeek V4 Pro と V4 Flash · 2週間無料' },
  ko: { title: '최고 수준의 지능, 제한 없이.', detail: 'DeepSeek V4 Pro 및 V4 Flash · 2주 무료' },
  de: { title: 'Spitzenintelligenz – ohne Zurückhaltung.', detail: 'DeepSeek V4 Pro und V4 Flash · zwei Wochen kostenlos' },
  fr: { title: 'Libérez une intelligence de premier plan.', detail: 'DeepSeek V4 Pro et V4 Flash · gratuits pendant deux semaines' },
  ru: { title: 'Используйте интеллект высшего уровня без ограничений.', detail: 'DeepSeek V4 Pro и V4 Flash · две недели бесплатно' },
  es: { title: 'Inteligencia de primer nivel, sin límites.', detail: 'DeepSeek V4 Pro y V4 Flash · gratis durante dos semanas' },
  'pt-br': { title: 'Inteligência de ponta, sem limites.', detail: 'DeepSeek V4 Pro e V4 Flash · grátis por duas semanas' },
  it: { title: 'Intelligenza di alto livello, senza limiti.', detail: 'DeepSeek V4 Pro e V4 Flash · gratis per due settimane' },
  tr: { title: 'Üst düzey zekâyı sınırsızca kullanın.', detail: 'DeepSeek V4 Pro ve V4 Flash · iki hafta ücretsiz' },
} satisfies Partial<Record<LandingLocaleCode, HomeCampaignContent>>;

export function getHomeCampaignContent(locale: LandingLocaleCode): HomeCampaignContent {
  return HOME_CAMPAIGN_CONTENT_BY_LOCALE[locale as keyof typeof HOME_CAMPAIGN_CONTENT_BY_LOCALE]
    ?? HOME_CAMPAIGN_CONTENT_BY_LOCALE.en;
}
