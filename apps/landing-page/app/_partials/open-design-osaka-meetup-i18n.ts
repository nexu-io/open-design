import en from './open-design-osaka-meetup-main.html?raw';
import zh from './open-design-osaka-meetup-main.zh.html?raw';
import ja from './open-design-osaka-meetup-main.ja.html?raw';
import ko from './open-design-osaka-meetup-main.ko.html?raw';
import de from './open-design-osaka-meetup-main.de.html?raw';
import fr from './open-design-osaka-meetup-main.fr.html?raw';
import ru from './open-design-osaka-meetup-main.ru.html?raw';
import es from './open-design-osaka-meetup-main.es.html?raw';
import ptbr from './open-design-osaka-meetup-main.pt-br.html?raw';
import it from './open-design-osaka-meetup-main.it.html?raw';
import tr from './open-design-osaka-meetup-main.tr.html?raw';

export const EVENT_BODY: Record<string, string> = { en, zh, ja, ko, de, fr, ru, es, 'pt-br': ptbr, it, tr };

export interface EventMeta { title: string; description: string }
export const EVENT_META: Record<string, EventMeta> = {
  en: { title: 'OpenDesign Osaka Meetup Recap', description: 'A warm offline meetup in Osaka where designers, developers, educators, founders, and community organizers explored practical AI-powered PPT and website workflows.' },
  zh: { title: 'OpenDesign 大阪线下聚会回顾', description: '一场温暖的大阪线下聚会：设计师、开发者、教育工作者、创业者与社区组织者，一起探索实用的 AI PPT 和网站工作流。' },
  ja: { title: 'OpenDesign 大阪ミートアップ レポート', description: 'デザイナー、開発者、教育関係者、起業家、コミュニティ運営者が、実践的な AI PPT とウェブサイトのワークフローを試した大阪の温かなオフラインミートアップ。' },
  ko: { title: 'OpenDesign 오사카 밋업 후기', description: '디자이너, 개발자, 교육자, 창업가와 커뮤니티 운영자가 실용적인 AI PPT 및 웹사이트 워크플로를 함께 살펴본 따뜻한 오사카 오프라인 밋업입니다.' },
  de: { title: 'Rückblick auf das OpenDesign-Meetup in Osaka', description: 'Ein persönliches Meetup in Osaka, bei dem Designer, Entwickler, Lehrende, Gründer und Community-Organisatoren praktische KI-Workflows für PPT und Websites erkundeten.' },
  fr: { title: 'Retour sur le meetup OpenDesign d’Osaka', description: 'Un meetup chaleureux à Osaka où designers, développeurs, enseignants, fondateurs et organisateurs de communautés ont exploré des workflows pratiques de PPT et de sites web assistés par l’IA.' },
  ru: { title: 'Итоги митапа OpenDesign в Осаке', description: 'Тёплая офлайн-встреча в Осаке, где дизайнеры, разработчики, преподаватели, основатели и организаторы сообществ изучали практические AI-процессы для презентаций и сайтов.' },
  es: { title: 'Resumen del meetup OpenDesign de Osaka', description: 'Un cálido encuentro presencial en Osaka donde diseñadores, desarrolladores, educadores, fundadores y organizadores de comunidades exploraron flujos prácticos de PPT y sitios web con IA.' },
  'pt-br': { title: 'Retrospectiva do meetup OpenDesign em Osaka', description: 'Um encontro presencial e acolhedor em Osaka, no qual designers, desenvolvedores, educadores, fundadores e organizadores de comunidades exploraram fluxos práticos de PPT e sites com IA.' },
  it: { title: 'Riepilogo del meetup OpenDesign di Osaka', description: 'Un caloroso incontro dal vivo a Osaka, dove designer, sviluppatori, docenti, founder e community organizer hanno esplorato workflow pratici per PPT e siti web con l’AI.' },
  tr: { title: 'OpenDesign Osaka Buluşması Özeti', description: "Osaka'daki sıcak yüz yüze buluşmada tasarımcılar, geliştiriciler, eğitimciler, kurucular ve topluluk yöneticileri pratik yapay zekâ destekli PPT ve web sitesi iş akışlarını keşfetti." },
};
