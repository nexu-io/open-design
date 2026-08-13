import type { Locale } from '../i18n';

export interface DeepSeekV4ProCampaignCopy {
  headline: string; description: string; badge: string; benefit: string;
  paidEyebrow: string; unpaidEyebrow: string; paidStatus: string; unpaidStatus: string;
  paidCta: string; unpaidCta: string; later: string; unlocked: string; locked: string;
  countdown: string; week: string; close: string; topBadge: string;
  paidTooltip: string; unpaidTooltip: string; restrictedBadge: string; restrictedTooltip: string;
  boundary: string;
}

const en: DeepSeekV4ProCampaignCopy = {
  headline: 'Put top-tier intelligence to work—without limits.', description: 'Landing pages, websites, slides and images—create until it is right.',
  badge: 'Unlimited', benefit: 'Unlimited DeepSeek V4 Pro and V4 Flash', paidEyebrow: 'Free for two weeks', unpaidEyebrow: 'Free for paid users',
  paidStatus: 'Unlocked', unpaidStatus: 'Upgrade to unlock', paidCta: 'Use now', unpaidCta: 'Upgrade and use now',
  later: 'Maybe later', unlocked: 'Unlocked', locked: 'Locked', countdown: 'Campaign countdown', week: 'Aug 13—Aug 27 · FREE for two weeks', close: 'Close',
  topBadge: 'DeepSeek V4 Pro + V4 Flash · Unlimited free', paidTooltip: 'Free for paid users from Aug 13 through Aug 27.', unpaidTooltip: 'Subscribe during the campaign to unlock access through Aug 27.',
  restrictedBadge: 'Paused', restrictedTooltip: 'Campaign access is paused due to abnormal large-scale usage. Contact support if needed.',
  boundary: 'Unlimited model quota and free generations included in a plan are available only in Open Design; they cannot be used through MCP/CLI/API or in other scenarios. Some models may require queuing during peak hours. The organizer reserves the right of final interpretation.',
};

const zh: DeepSeekV4ProCampaignCopy = {
  headline: '这次，顶级智能无限用。', description: '落地页、网站、幻灯片、图片，无限做，做到满意', badge: '无限使用', benefit: 'DeepSeek V4 Pro 与 V4 Flash 无限使用',
  paidEyebrow: '两周免费开放', unpaidEyebrow: '付费用户免费开放', paidStatus: '已解锁', unpaidStatus: '升级后可用',
  paidCta: '立即使用', unpaidCta: '升级套餐，立即使用', later: '稍后再说', unlocked: '已解锁', locked: '待解锁', countdown: '活动倒计时',
  week: '8 月 13 日—8 月 27 日 · 两周免费用', close: '关闭', topBadge: 'DeepSeek V4 Pro + V4 Flash 无限免费用',
  paidTooltip: '8 月 13 日至 8 月 27 日，付费用户可在产品内免费使用。', unpaidTooltip: '活动窗口内订阅付费套餐后可用，统一于 8 月 27 日结束。',
  restrictedBadge: '已暂停', restrictedTooltip: '检测到异常的大规模使用，本活动权益已暂停；如有疑问请联系支持。',
  boundary: '套餐内的无限制模型额度与免费生成次数，仅可通过Open Design使用；无法在MCP/CLI/API及其他场景使用。部分模型高峰期需要排队。解释权归官方所有。',
};

const local = (headline: string, unlimited: string, week: string, countdown: string): DeepSeekV4ProCampaignCopy => ({ ...en, headline, badge: unlimited, benefit: `DeepSeek V4 Pro + V4 Flash · ${unlimited}`, week, countdown, topBadge: `DeepSeek V4 Pro + V4 Flash · FREE · ${unlimited}` });

export const DEEPSEEK_V4_PRO_COPY: Record<Locale, DeepSeekV4ProCampaignCopy> = {
  en, 'zh-CN': zh, 'zh-TW': { ...zh, headline: '這次，頂級智能無限用。', badge: '無限使用', benefit: 'DeepSeek V4 Pro 與 V4 Flash 無限使用', paidStatus: '已解鎖', unpaidStatus: '升級後可用', topBadge: 'DeepSeek V4 Pro + V4 Flash 無限免費用' },
  ja: local('最高峰の知性を、思いきり使おう。', '無制限', '8月13日〜8月27日 · 2週間無料', 'キャンペーン終了まで'),
  ko: local('최고 수준의 지능을 마음껏 사용하세요.', '무제한', '8월 13일—8월 27일 · 2주 무료', '이벤트 남은 시간'),
  de: local('Spitzenintelligenz – ohne Zurückhaltung.', 'Unbegrenzt', '13.—27. August · zwei Wochen kostenlos', 'Aktions-Countdown'),
  fr: local('Libérez une intelligence de premier plan.', 'Illimité', 'Du 13 au 27 août · gratuits pendant deux semaines', 'Compte à rebours'),
  'es-ES': local('Inteligencia de primer nivel, sin límites.', 'Ilimitado', 'Del 13 al 27 de agosto · gratis durante dos semanas', 'Cuenta atrás'),
  'pt-BR': local('Inteligência de ponta, sem limites.', 'Ilimitado', '13 a 27 de agosto · grátis por duas semanas', 'Contagem regressiva'),
  it: local('Intelligenza di alto livello, senza limiti.', 'Illimitato', '13—27 agosto · gratis per due settimane', 'Conto alla rovescia'),
  ru: local('Интеллект высшего уровня — без ограничений.', 'Без ограничений', '13—27 августа · две недели бесплатно', 'До конца акции'),
  tr: local('Üst düzey zekâyı sınırsızca kullanın.', 'Sınırsız', '13—27 Ağustos · iki hafta ücretsiz', 'Kampanya geri sayımı'),
  id: local('Gunakan kecerdasan kelas atas tanpa batas.', 'Tanpa batas', '13—27 Agustus · gratis dua minggu', 'Hitung mundur kampanye'),
  pl: local('Korzystaj z najwyższej klasy inteligencji bez ograniczeń.', 'Bez limitu', '13—27 sierpnia · dwa tygodnie za darmo', 'Koniec kampanii za'),
  hu: local('Használd szabadon a csúcskategóriás intelligenciát.', 'Korlátlan', 'Augusztus 13–27. · két hét ingyen', 'Kampány visszaszámlálás'),
  uk: local('Використовуйте інтелект найвищого рівня без обмежень.', 'Без обмежень', '13—27 серпня · два тижні безкоштовно', 'До завершення акції'),
  th: local('ใช้ความอัจฉริยะระดับสูงได้อย่างเต็มที่', 'ไม่จำกัด', '13—27 สิงหาคม · ฟรีสองสัปดาห์', 'เวลาที่เหลือ'),
  ar: local('استخدم ذكاءً من أعلى مستوى بلا حدود.', 'غير محدود', '13–27 أغسطس · مجانًا لمدة أسبوعين', 'الوقت المتبقي'),
  fa: local('هوشمندی سطح‌بالا را بدون محدودیت به کار بگیرید.', 'نامحدود', '۱۳ تا ۲۷ اوت · دو هفته رایگان', 'زمان باقی‌مانده'),
};

export const getDeepSeekV4ProCopy = (locale: Locale): DeepSeekV4ProCampaignCopy => DEEPSEEK_V4_PRO_COPY[locale];
