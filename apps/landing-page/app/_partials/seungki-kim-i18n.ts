/*
 * i18n data for the Seungki Kim / FABOR user story (/stories/seungki-kim)
 * and its card on the stories index (/stories/). One entry per ACTIVE landing
 * locale; callers fall back to `en`. The share/H1 title and the card title stay
 * in English in every locale (the customer's verbatim words); descriptions and
 * card blurbs are localized. Regenerate if copy changes.
 */
import en from "./seungki-kim-main.html?raw";
import zh from "./seungki-kim-main.zh.html?raw";
import ja from "./seungki-kim-main.ja.html?raw";
import ko from "./seungki-kim-main.ko.html?raw";
import de from "./seungki-kim-main.de.html?raw";
import fr from "./seungki-kim-main.fr.html?raw";
import ru from "./seungki-kim-main.ru.html?raw";
import es from "./seungki-kim-main.es.html?raw";
import ptbr from "./seungki-kim-main.pt-br.html?raw";
import it from "./seungki-kim-main.it.html?raw";
import tr from "./seungki-kim-main.tr.html?raw";

export const STORY_BODY: Record<string, string> = { en, zh, ja, ko, de, fr, ru, es, "pt-br": ptbr, it, tr };

export interface StoryMeta { title: string; description: string }
export const STORY_META: Record<string, StoryMeta> = {
  "en": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — KAIST-trained designer and founder of FABOR, a 3D-print craft studio — builds his brand, site, and social content in Open Design, in parallel with the work." },
  "zh": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim 是 KAIST 科班出身的设计师,也是 3D-print 手艺工作室 FABOR 的创始人。他在 Open Design 里做出自己的品牌、网站和社交内容,与手上的创作并行推进。" },
  "ja": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim は KAIST で学んだデザイナーであり、3D-print クラフトのスタジオ FABOR の創業者。ブランド、サイト、ソーシャルコンテンツを、制作と並行して Open Design でつくり上げている。" },
  "ko": { title: "“My hands stay on the craft” — Seungki Kim", description: "KAIST에서 교육받은 디자이너이자 3D-print 공예 스튜디오 FABOR의 창업자인 Seungki Kim은 브랜드와 사이트, 소셜 콘텐츠를 본업과 나란히 Open Design에서 만듭니다." },
  "de": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — an der KAIST ausgebildeter Designer und Gründer von FABOR, einem 3D-print-Handwerksstudio — baut seine Marke, Website und Social-Content in Open Design, parallel zur Arbeit." },
  "fr": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — designer formé à KAIST et fondateur de FABOR, un studio d'artisanat 3D-print — crée sa marque, son site et son contenu social dans Open Design, en parallèle de son travail." },
  "ru": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — дизайнер с образованием KAIST и основатель FABOR, студии ремесленного 3D-print — создаёт свой бренд, сайт и контент для соцсетей в Open Design, параллельно с основной работой." },
  "es": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim —diseñador formado en KAIST y fundador de FABOR, un estudio de artesanía en impresión 3D— construye su marca, su sitio y su contenido social en Open Design, en paralelo con el trabajo." },
  "pt-br": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — designer formado na KAIST e fundador da FABOR, um estúdio de artesanato em impressão 3D — constrói a sua marca, o seu site e o seu conteúdo social no Open Design, em paralelo com o trabalho." },
  "it": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — designer formatosi al KAIST e fondatore di FABOR, uno studio di artigianato in 3D-print — costruisce il suo brand, il sito e i contenuti social in Open Design, in parallelo con il lavoro." },
  "tr": { title: "“My hands stay on the craft” — Seungki Kim", description: "Seungki Kim — KAIST'te yetişmiş bir tasarımcı ve bir 3D-print zanaat stüdyosu olan FABOR'un kurucusu — markasını, sitesini ve sosyal içeriğini işle paralel olarak Open Design'da oluşturuyor." },
};

export interface StoryCard { title: string; blurb: string }
export const STORY_CARD: Record<string, StoryCard> = {
  "en": { title: "“My hands stay on the craft”", blurb: "A KAIST-trained designer and FABOR founder builds his brand site and social card-news in Open Design — in parallel with the 3D-print craft his hands stay on." },
  "zh": { title: "“My hands stay on the craft”", blurb: "一位 KAIST 科班出身的设计师、FABOR 创始人,在 Open Design 里做出自己的品牌官网和社交卡片图文——与他亲手放不下的 3D-print 手艺并行推进。" },
  "ja": { title: "“My hands stay on the craft”", blurb: "KAIST 出身のデザイナーであり FABOR の創業者が、ブランドサイトとソーシャルのカードニュースを Open Design で制作——手を離さない 3D-print クラフトと並行して。" },
  "ko": { title: "“My hands stay on the craft”", blurb: "KAIST 출신 디자이너이자 FABOR 창업자가 브랜드 사이트와 소셜 카드뉴스를 Open Design에서 만듭니다 — 손을 떼지 않는 3D-print 공예와 나란히요." },
  "de": { title: "“My hands stay on the craft”", blurb: "Ein an der KAIST ausgebildeter Designer und FABOR-Gründer baut seine Marken-Website und Social-Card-News in Open Design — parallel zum 3D-print-Handwerk, bei dem seine Hände bleiben." },
  "fr": { title: "“My hands stay on the craft”", blurb: "Un designer formé à KAIST et fondateur de FABOR crée le site de sa marque et ses card-news pour les réseaux dans Open Design — en parallèle de l'artisanat 3D-print que ses mains ne quittent pas." },
  "ru": { title: "“My hands stay on the craft”", blurb: "Дизайнер с образованием KAIST и основатель FABOR создаёт сайт своего бренда и card-news для соцсетей в Open Design — параллельно с ремеслом 3D-print, от которого не отрывает рук." },
  "es": { title: "“My hands stay on the craft”", blurb: "Un diseñador formado en KAIST y fundador de FABOR construye el sitio de su marca y sus card-news sociales en Open Design, en paralelo con la artesanía en impresión 3D en la que siguen puestas sus manos." },
  "pt-br": { title: "“My hands stay on the craft”", blurb: "Um designer formado na KAIST e fundador da FABOR constrói o site da marca e as card-news sociais no Open Design — em paralelo com o artesanato em impressão 3D em que as mãos dele continuam." },
  "it": { title: "“My hands stay on the craft”", blurb: "Un designer formatosi al KAIST e fondatore di FABOR costruisce il sito del suo brand e le card-news social in Open Design — in parallelo con l'artigianato in 3D-print su cui restano le sue mani." },
  "tr": { title: "“My hands stay on the craft”", blurb: "KAIST'te yetişmiş bir tasarımcı ve FABOR kurucusu, markasının sitesini ve sosyal card-news içeriğini Open Design'da oluşturuyor — üstelik ellerinin üzerinde kaldığı 3D-print zanaatıyla paralel olarak." },
};
