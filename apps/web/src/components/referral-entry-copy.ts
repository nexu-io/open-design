export const referralEntryCopy: Record<string, readonly [string, string]> = {
  'zh-CN': ['邀请好友获重置卡', '首订后，双方各得 1 张'],
  'zh-TW': ['邀請好友獲得重設卡', '首次訂閱後，雙方各得 1 張'],
  en: ['Share OpenDesign', 'Earn reset cards'],
  pt: ['Partilhe OpenDesign', 'Ganhe cartões reset'],
  es: ['Comparte OpenDesign', 'Gana tarjetas reset'],
  ru: ['Делись OpenDesign', 'Получи карту сброса'],
  fr: ['Partager OpenDesign', 'Cartes reset offertes'],
  ko: ['OpenDesign 공유', '초대로 초기화 카드'],
  de: ['OpenDesign teilen', 'Reset-Karten erhalten'],
  ja: ['OpenDesignを共有', '紹介でリセットカード'],
};
export function getReferralEntryCopy(locale: string): readonly [string, string] {
  return referralEntryCopy[locale] ?? referralEntryCopy[locale.split('-')[0] ?? ''] ?? ['Share OpenDesign', 'Earn reset cards'];
}
