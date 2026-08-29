import en from './open-design-hong-kong-workshop-main.html?raw';
import zh from './open-design-hong-kong-workshop-main.zh.html?raw';
import ja from './open-design-hong-kong-workshop-main.ja.html?raw';
import ko from './open-design-hong-kong-workshop-main.ko.html?raw';
import de from './open-design-hong-kong-workshop-main.de.html?raw';
import fr from './open-design-hong-kong-workshop-main.fr.html?raw';
import ru from './open-design-hong-kong-workshop-main.ru.html?raw';
import es from './open-design-hong-kong-workshop-main.es.html?raw';
import ptbr from './open-design-hong-kong-workshop-main.pt-br.html?raw';
import it from './open-design-hong-kong-workshop-main.it.html?raw';
import tr from './open-design-hong-kong-workshop-main.tr.html?raw';

export const EVENT_BODY: Record<string, string> = { en, zh, ja, ko, de, fr, ru, es, 'pt-br': ptbr, it, tr };

export interface EventMeta { title: string; description: string }
export const EVENT_META: Record<string, EventMeta> = {
  en: { title: 'OpenDesign Hong Kong Workshop Recap', description: 'A hands-on OpenDesign workshop in Hong Kong where participants connected design systems, live data, models, and skills to build interactive, shareable artifacts.' },
  zh: { title: 'OpenDesign 香港工作坊回顾', description: '一场在香港举办的 OpenDesign 动手工作坊：参与者连接设计系统、实时数据、模型与技能，制作可交互、可分享的作品。' },
  ja: { title: 'OpenDesign 香港ワークショップ レポート', description: '香港で行われた OpenDesign の実践型ワークショップ。参加者はデザインシステム、ライブデータ、モデル、スキルを組み合わせ、インタラクティブで共有できる成果物を制作しました。' },
  ko: { title: 'OpenDesign 홍콩 워크숍 후기', description: '홍콩에서 열린 OpenDesign 실습 워크숍에서 참가자들은 디자인 시스템, 실시간 데이터, 모델과 스킬을 연결해 인터랙티브하고 공유 가능한 결과물을 만들었습니다.' },
  de: { title: 'Rückblick auf den OpenDesign-Workshop in Hongkong', description: 'Ein praxisnaher OpenDesign-Workshop in Hongkong, bei dem die Teilnehmenden Designsysteme, Live-Daten, Modelle und Skills zu interaktiven, teilbaren Ergebnissen verbanden.' },
  fr: { title: 'Retour sur l’atelier OpenDesign à Hong Kong', description: 'Un atelier pratique OpenDesign à Hong Kong où les participants ont relié design systems, données en direct, modèles et skills pour créer des réalisations interactives et partageables.' },
  ru: { title: 'Итоги воркшопа OpenDesign в Гонконге', description: 'Практический воркшоп OpenDesign в Гонконге, где участники объединили дизайн-системы, данные в реальном времени, модели и навыки в интерактивные материалы, которыми можно делиться.' },
  es: { title: 'Resumen del taller OpenDesign de Hong Kong', description: 'Un taller práctico de OpenDesign en Hong Kong donde los participantes conectaron sistemas de diseño, datos en vivo, modelos y habilidades para crear piezas interactivas y compartibles.' },
  'pt-br': { title: 'Retrospectiva do workshop OpenDesign em Hong Kong', description: 'Um workshop prático do OpenDesign em Hong Kong, no qual participantes conectaram sistemas de design, dados ao vivo, modelos e skills para criar materiais interativos e compartilháveis.' },
  it: { title: 'Riepilogo del workshop OpenDesign di Hong Kong', description: 'Un workshop pratico di OpenDesign a Hong Kong, dove i partecipanti hanno unito design system, dati live, modelli e skill per creare risultati interattivi e condivisibili.' },
  tr: { title: 'OpenDesign Hong Kong Atölyesi Özeti', description: "Hong Kong'daki uygulamalı OpenDesign atölyesinde katılımcılar tasarım sistemlerini, canlı verileri, modelleri ve becerileri birleştirerek etkileşimli ve paylaşılabilir çalışmalar üretti." },
};
