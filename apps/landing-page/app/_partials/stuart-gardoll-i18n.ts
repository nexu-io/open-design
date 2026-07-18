/*
 * i18n data for the Stuart Gardoll customer story (/stories/stuart-gardoll)
 * and its card on the stories index (/stories/). One entry per ACTIVE landing
 * locale; callers fall back to `en`. The share/H1 title and the card title stay
 * in English in every locale (the customer's verbatim words); descriptions and
 * card blurbs are localized. Regenerate if copy changes.
 */
import en from "./stuart-gardoll-main.html?raw";
import zh from "./stuart-gardoll-main.zh.html?raw";
import ja from "./stuart-gardoll-main.ja.html?raw";
import ko from "./stuart-gardoll-main.ko.html?raw";
import de from "./stuart-gardoll-main.de.html?raw";
import fr from "./stuart-gardoll-main.fr.html?raw";
import ru from "./stuart-gardoll-main.ru.html?raw";
import es from "./stuart-gardoll-main.es.html?raw";
import ptbr from "./stuart-gardoll-main.pt-br.html?raw";
import it from "./stuart-gardoll-main.it.html?raw";
import tr from "./stuart-gardoll-main.tr.html?raw";

export const STORY_BODY: Record<string, string> = { en, zh, ja, ko, de, fr, ru, es, "pt-br": ptbr, it, tr };

export interface StoryMeta { title: string; description: string }
export const STORY_META: Record<string, StoryMeta> = {
  "en": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, AI engineer and consultant, founder of Connect I/O, uses Open Design to ship app UI, motion graphics, and prototypes on the models he chooses." },
  "zh": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll,AI 工程师兼顾问、Connect I/O 创始人,用 Open Design 在自己选择的模型上交付应用 UI、动态图形和原型。" },
  "ja": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll — AI エンジニア兼コンサルタントで Connect I/O の創業者 — は、Open Design を使って、自分で選んだモデルの上でアプリ UI、モーショングラフィックス、プロトタイプを作り上げている。" },
  "ko": { title: "“I go to Open Design first” — Stuart Gardoll", description: "AI 엔지니어이자 컨설턴트이며 Connect I/O의 창업자인 Stuart Gardoll은 Open Design으로 앱 UI, 모션 그래픽, 프로토타입을 자신이 고른 모델 위에서 만들어 냅니다." },
  "de": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, KI-Ingenieur und Berater, Gründer von Connect I/O, nutzt Open Design, um App-UI, Motion Graphics und Prototypen auf den Modellen seiner Wahl auszuliefern." },
  "fr": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, ingénieur et consultant en IA, fondateur de Connect I/O, utilise Open Design pour livrer l'UI d'application, le motion design et les prototypes sur les modèles qu'il choisit." },
  "ru": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, инженер и консультант по ИИ, основатель Connect I/O, использует Open Design, чтобы создавать интерфейсы приложений, моушн-графику и прототипы на моделях, которые выбирает сам." },
  "es": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, ingeniero y consultor de IA, fundador de Connect I/O, usa Open Design para crear la UI de apps, motion graphics y prototipos con los modelos que él elige." },
  "pt-br": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, engenheiro de IA e consultor, fundador da Connect I/O, usa o Open Design para criar UI de apps, motion graphics e protótipos nos modelos que ele escolhe." },
  "it": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Stuart Gardoll, ingegnere e consulente AI, fondatore di Connect I/O, usa Open Design per realizzare UI di app, motion graphics e prototipi sui modelli che sceglie lui." },
  "tr": { title: "“I go to Open Design first” — Stuart Gardoll", description: "Yapay zekâ mühendisi ve danışman, Connect I/O'nun kurucusu Stuart Gardoll, kendi seçtiği modeller üzerinde uygulama arayüzü, hareketli grafikler ve prototipler geliştirmek için Open Design'ı kullanıyor." },
};

export interface StoryCard { title: string; blurb: string }
export const STORY_CARD: Record<string, StoryCard> = {
  "en": { title: "“I go to Open Design first”", blurb: "An AI engineer and Connect I/O founder builds apps and motion graphics in Open Design — the creative surface he opens first, on whatever model he chooses." },
  "zh": { title: "“I go to Open Design first”", blurb: "一位 AI 工程师、Connect I/O 创始人,在 Open Design 里做应用和动态图形 —— 这是他第一个打开的创作画布,想用哪个模型就用哪个。" },
  "ja": { title: "“I go to Open Design first”", blurb: "AI エンジニアであり Connect I/O の創業者が、Open Design でアプリやモーショングラフィックスを作る — 真っ先に開くクリエイティブの土台で、選んだどんなモデルの上でも。" },
  "ko": { title: "“I go to Open Design first”", blurb: "AI 엔지니어이자 Connect I/O 창업자가 Open Design에서 앱과 모션 그래픽을 만듭니다 — 어떤 모델을 고르든, 그가 가장 먼저 여는 크리에이티브 작업 공간에서요." },
  "de": { title: "“I go to Open Design first”", blurb: "Ein KI-Ingenieur und Connect I/O-Gründer baut Apps und Motion Graphics in Open Design — der kreativen Oberfläche, die er als Erstes öffnet, auf welchem Modell auch immer er wählt." },
  "fr": { title: "“I go to Open Design first”", blurb: "Ingénieur en IA et fondateur de Connect I/O, il crée applications et motion design dans Open Design — la surface créative qu'il ouvre en premier, quel que soit le modèle qu'il choisit." },
  "ru": { title: "“I go to Open Design first”", blurb: "Инженер по ИИ и основатель Connect I/O создаёт приложения и моушн-графику в Open Design — творческом пространстве, которое он открывает первым, на любой модели по своему выбору." },
  "es": { title: "“I go to Open Design first”", blurb: "Un ingeniero de IA y fundador de Connect I/O crea apps y motion graphics en Open Design — la superficie creativa que abre primero, sea cual sea el modelo que elija." },
  "pt-br": { title: "“I go to Open Design first”", blurb: "Um engenheiro de IA e fundador da Connect I/O cria apps e motion graphics no Open Design — a superfície criativa que ele abre primeiro, no modelo que ele escolher." },
  "it": { title: "“I go to Open Design first”", blurb: "Un ingegnere AI e fondatore di Connect I/O costruisce app e motion graphics in Open Design — la superficie creativa che apre per prima, su qualsiasi modello scelga." },
  "tr": { title: "“I go to Open Design first”", blurb: "Bir yapay zekâ mühendisi ve Connect I/O kurucusu, uygulamalarını ve hareketli grafiklerini Open Design'da geliştiriyor — ilk açtığı yaratıcı yüzey, hangi modeli seçerse onun üzerinde." },
};
