/*
 * Localised copy for the Launch Week Vol.01 event page.
 *
 * The campaign lockup ("Launch Week Vol.01"), the kill questions — which read
 * against a competitor's brand name — the ticket furniture and the rubber
 * stamps stay English in every locale on purpose: they are the campaign's
 * identity, not its copy. Everything else is translated.
 *
 * Machine-drafted; each locale still wants a native read before it ships.
 */
import en from "./launch-week-main.html?raw";
import zh from "./launch-week-main.zh.html?raw";
import ja from "./launch-week-main.ja.html?raw";
import ko from "./launch-week-main.ko.html?raw";
import de from "./launch-week-main.de.html?raw";
import ru from "./launch-week-main.ru.html?raw";
import fr from "./launch-week-main.fr.html?raw";
import es from "./launch-week-main.es.html?raw";
import ptbr from "./launch-week-main.pt-br.html?raw";
import it from "./launch-week-main.it.html?raw";
import tr from "./launch-week-main.tr.html?raw";

export const LW_BODY: { en: string } & Record<string, string | undefined> = { en, zh, ja, ko, de, ru, fr, es, "pt-br": ptbr, it, tr };

export interface LaunchWeekMeta { title: string; description: string }
export const LW_META: { en: LaunchWeekMeta } & Record<string, LaunchWeekMeta | undefined> = {
  en: { title: "Launch Week Vol.01: five design launches in five days — Open Design", description: "Open Design Launch Week runs Aug 10–14: one new design capability a day, each aimed at a tool your team already pays for. Five days, five design jobs, five targets." },
  zh: { title: "Launch Week Vol.01：五天，五场设计发布 — Open Design", description: "Open Design Launch Week 于 8 月 10–14 日举行：每天上线一项新的设计能力，每一项都对准你的团队已经在付费的工具。五天，五项设计任务，五个目标。" },
  ja: { title: "Launch Week Vol.01：5日間で5つのデザイン・ローンチ — Open Design", description: "Open Design Launch Week は8月10〜14日開催。毎日ひとつ、新しいデザイン機能を公開します。狙うのは、あなたのチームがすでに課金しているツール。5日間、5つのデザイン業務、5つの標的。" },
  ko: { title: "Launch Week Vol.01: 5일간 다섯 번의 디자인 출시 — Open Design", description: "Open Design Launch Week는 8월 10–14일에 열립니다. 매일 하나씩 새로운 디자인 기능을 공개하며, 각각은 팀이 이미 비용을 지불하고 있는 도구를 겨냥합니다. 5일, 다섯 가지 디자인 작업, 다섯 개의 표적." },
  de: { title: "Launch Week Vol.01: fünf Design-Launches in fünf Tagen — Open Design", description: "Open Design Launch Week läuft vom 10. bis 14. August: jeden Tag eine neue Design-Fähigkeit, jede auf ein Tool gerichtet, für das dein Team bereits zahlt. Fünf Tage, fünf Design-Aufgaben, fünf Ziele." },
  ru: { title: "Launch Week Vol.01: пять дизайн-запусков за пять дней — Open Design", description: "Open Design Launch Week пройдёт 10–14 августа: каждый день — новая дизайн-возможность, и каждая нацелена на инструмент, за который ваша команда уже платит. Пять дней, пять задач, пять целей." },
  fr: { title: "Launch Week Vol.01 : cinq lancements design en cinq jours — Open Design", description: "L'Open Design Launch Week se tient du 10 au 14 août : chaque jour une nouvelle capacité de design, chacune visant un outil que votre équipe paie déjà. Cinq jours, cinq métiers du design, cinq cibles." },
  es: { title: "Launch Week Vol.01: cinco lanzamientos de diseño en cinco días — Open Design", description: "Open Design Launch Week se celebra del 10 al 14 de agosto: cada día una nueva capacidad de diseño, cada una apuntando a una herramienta que tu equipo ya paga. Cinco días, cinco trabajos de diseño, cinco objetivos." },
  "pt-br": { title: "Launch Week Vol.01: cinco lançamentos de design em cinco dias — Open Design", description: "A Open Design Launch Week acontece de 10 a 14 de agosto: a cada dia uma nova capacidade de design, cada uma mirando uma ferramenta que seu time já paga. Cinco dias, cinco trabalhos de design, cinco alvos." },
  it: { title: "Launch Week Vol.01: cinque lanci di design in cinque giorni — Open Design", description: "L'Open Design Launch Week si tiene dal 10 al 14 agosto: ogni giorno una nuova capacità di design, ognuna puntata su uno strumento che il tuo team già paga. Cinque giorni, cinque lavori di design, cinque bersagli." },
  tr: { title: "Launch Week Vol.01: beş günde beş tasarım lansmanı — Open Design", description: "Open Design Launch Week 10–14 Ağustos'ta: her gün yeni bir tasarım yeteneği, her biri ekibinizin zaten para ödediği bir araca nişan alıyor. Beş gün, beş tasarım işi, beş hedef." },
};

/** Drop states are written by the client script, so they need their own table. */
export const LW_STATUS: Record<string, { en: string } & Record<string, string | undefined>> = {
  RELEASED: { en: "RELEASED", "zh": "已发布", "ja": "公開済み", "ko": "공개됨", "de": "VERÖFFENTLICHT", "ru": "ВЫШЛО", "fr": "PUBLIÉ", "es": "PUBLICADO", "pt-br": "PUBLICADO", "it": "PUBBLICATO", "tr": "YAYINLANDI" },
  LIVE: { en: "LIVE", "zh": "进行中", "ja": "公開中", "ko": "진행 중", "de": "LIVE", "ru": "В ЭФИРЕ", "fr": "EN DIRECT", "es": "EN VIVO", "pt-br": "AO VIVO", "it": "IN DIRETTA", "tr": "CANLI" },
  CLASSIFIED: { en: "CLASSIFIED", "zh": "保密中", "ja": "未公開", "ko": "비공개", "de": "GEHEIM", "ru": "ЗАСЕКРЕЧЕНО", "fr": "CLASSÉ", "es": "CLASIFICADO", "pt-br": "CONFIDENCIAL", "it": "RISERVATO", "tr": "GİZLİ" },
};

export interface LaunchWeekHomeFloatCopy {
  date: string;
  title: string;
  summary: string;
  cta: string;
  regionLabel: string;
  closeLabel: string;
}

/** Compact homepage reminder. The campaign name stays as the official lockup. */
export const LW_HOME_FLOAT_COPY = {
  en: {
    date: 'AUG 10-14',
    title: 'Launch Week Vol.01',
    summary: 'Five days. Five design drops. One live each day.',
    cta: "See today's drop",
    regionLabel: 'Launch Week event reminder',
    closeLabel: 'Dismiss Launch Week reminder',
  },
  zh: {
    date: '8月10-14日',
    title: 'Launch Week Vol.01',
    summary: '五天。五项设计任务。每天一次发布。',
    cta: '查看今天的发布',
    regionLabel: 'Launch Week 活动提醒',
    closeLabel: '关闭 Launch Week 提醒',
  },
  ja: {
    date: '8月10日-14日',
    title: 'Launch Week Vol.01',
    summary: '5日間。5つのデザイン業務。毎日ひとつ公開。',
    cta: '今日の発表を見る',
    regionLabel: 'Launch Week イベントのお知らせ',
    closeLabel: 'Launch Week のお知らせを閉じる',
  },
  ko: {
    date: '8월 10-14일',
    title: 'Launch Week Vol.01',
    summary: '5일. 다섯 가지 디자인 작업. 매일 하나씩 공개.',
    cta: '오늘의 공개 보기',
    regionLabel: 'Launch Week 이벤트 알림',
    closeLabel: 'Launch Week 알림 닫기',
  },
  de: {
    date: '10.-14. AUG',
    title: 'Launch Week Vol.01',
    summary: 'Fünf Tage. Fünf Design-Aufgaben. Jeden Tag ein Launch.',
    cta: 'Heutigen Launch ansehen',
    regionLabel: 'Hinweis zur Launch Week',
    closeLabel: 'Launch-Week-Hinweis schließen',
  },
  fr: {
    date: '10-14 AOÛT',
    title: 'Launch Week Vol.01',
    summary: 'Cinq jours. Cinq métiers du design. Un lancement par jour.',
    cta: 'Voir le lancement du jour',
    regionLabel: 'Rappel de la Launch Week',
    closeLabel: 'Fermer le rappel de la Launch Week',
  },
  ru: {
    date: '10-14 АВГ',
    title: 'Launch Week Vol.01',
    summary: 'Пять дней. Пять дизайн-задач. Каждый день новый запуск.',
    cta: 'Смотреть запуск дня',
    regionLabel: 'Напоминание о Launch Week',
    closeLabel: 'Закрыть напоминание о Launch Week',
  },
  es: {
    date: '10-14 AGO',
    title: 'Launch Week Vol.01',
    summary: 'Cinco días. Cinco trabajos de diseño. Un lanzamiento al día.',
    cta: 'Ver el lanzamiento de hoy',
    regionLabel: 'Recordatorio de Launch Week',
    closeLabel: 'Cerrar el recordatorio de Launch Week',
  },
  'pt-br': {
    date: '10-14 AGO',
    title: 'Launch Week Vol.01',
    summary: 'Cinco dias. Cinco trabalhos de design. Um lançamento por dia.',
    cta: 'Ver o lançamento de hoje',
    regionLabel: 'Lembrete da Launch Week',
    closeLabel: 'Fechar o lembrete da Launch Week',
  },
  it: {
    date: '10-14 AGO',
    title: 'Launch Week Vol.01',
    summary: 'Cinque giorni. Cinque lavori di design. Un lancio al giorno.',
    cta: 'Guarda il lancio di oggi',
    regionLabel: 'Promemoria della Launch Week',
    closeLabel: 'Chiudi il promemoria della Launch Week',
  },
  tr: {
    date: '10-14 AĞU',
    title: 'Launch Week Vol.01',
    summary: 'Beş gün. Beş tasarım işi. Her gün yeni bir lansman.',
    cta: 'Bugünkü lansmanı gör',
    regionLabel: 'Launch Week etkinlik hatırlatıcısı',
    closeLabel: 'Launch Week hatırlatıcısını kapat',
  },
} satisfies Record<string, LaunchWeekHomeFloatCopy>;

export function getLaunchWeekHomeFloatCopy(locale: string): LaunchWeekHomeFloatCopy {
  return LW_HOME_FLOAT_COPY[locale as keyof typeof LW_HOME_FLOAT_COPY] ?? LW_HOME_FLOAT_COPY.en;
}
