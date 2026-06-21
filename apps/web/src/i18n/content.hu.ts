import type { PromptTemplateSummary } from '../types';

export const HU_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'HyperFrames-alapú videósablon retró pixeles deck mozgástervezéshez.\nAkkor használd, ha a felhasználók nagy felbontású, többjelenetes HTML-ből videó kompozíciót szeretnének\nfejlett átmenetekkel, interaktív előnézeti vezérlőkkel és azonnal renderelhető\nalapértelmezett stílussal.',
    examplePrompt:
      'Hozz létre egy 3 oldalas HyperFrames videó decket 8-bites retró stílusban, fejlett átmenetekkel, gazdag mozgással, és minden oldal legyen 3 másodpercnél rövidebb.',
  },
  'ad-creative': {
    description:
      'Hirdetési kreatívok generálása és iterálása, beleértve a címsorokat, leírásokat és az elsődleges szöveget. Hasznos a fizetett közösségi és keresőhirdetések iterálásához.',
    examplePrompt:
      'Hirdetési kreatívok generálása és iterálása, beleértve a címsorokat, leírásokat és az elsődleges szöveget.',
  },
  'after-hours-editorial-template': {
    description:
      'Luxus, sötét szerkesztőségi HyperFrames sablon háromoldalas, filmszerű storyboardokhoz,\nmelyet a haute couture cím-kártyák és a magazinfejezetek tördelései ihlettek. Akkor használd, ha a\nfelhasználó prémium, divat-stílusú mozgásoldalakat, hangulatos, talpas betűtípusra épülő történetmesélést\nvagy gazdag átmenetekkel rendelkező, csúcskategóriás sötét prezentációs esztétikát kér.',
    examplePrompt:
      'Hozz létre egy háromoldalas HyperFrames szerkesztőségi szekvenciát sötét haute-couture stílusban: prémium talpas tipográfia, magenta kiemelés, elegáns fejezetátmenetek és filmszerű szemcsézettség. Minden oldal legyen 3 másodpercnél rövidebb.',
  },
  'agent-browser': {
    description:
      'Böngészőautomatizálási CLI AI-ügynököknek. Akkor használd, ha a felhasználónak böngészőviselkedést kell\nvizsgálnia, tesztelnie vagy automatizálnia: oldalak navigálása, űrlapok kitöltése,\ngombok kattintása, képernyőképek készítése, oldaladatok kinyerése, a kiválasztott\nOpen Design böngészőfül-kontextus olvasása, webalkalmazások tesztelése, Open Design\nelőnézetek dogfoodingja, QA, hibavadászat vagy alkalmazásminőség áttekintése. Részesítsd előnyben a helyi Open Design\nelőnézeti URL-eket, hacsak a felhasználó kifejezetten nem kér külső böngészést.',
    examplePrompt:
      'Böngészőautomatizálási CLI AI-ügynököknek.',
  },
  'ai-music-album': {
    description:
      'Teljes életciklusú AI zenei albumgyártás — koncepció, szövegírás, számok sorrendbe rendezése és exportálás. Hasznos indie album kísérletekhez és márka-soundtrackekhez.',
    examplePrompt:
      'Teljes életciklusú AI zenei albumgyártás — koncepció, szövegírás, számok sorrendbe rendezése és exportálás.',
  },
  'algorithmic-art': {
    description:
      'Generatív művészet létrehozása p5.js segítségével seedelt véletlenszerűséggel, így minden renderelés reprodukálható. Hasznos procedurális poszterekhez, mozgásstílusú állóképekhez és művészi keret-tanulmányokhoz.',
    examplePrompt:
      'Generatív művészet létrehozása p5.js segítségével seedelt véletlenszerűséggel, így minden renderelés reprodukálható.',
  },
  'apple-hig': {
    description:
      'Az Apple Human Interface Guidelines 14 ügynöki készségként, amelyek lefedik a platformokat, alapokat, komponenseket, mintázatokat, beviteleket és technológiákat iOS, macOS, visionOS, watchOS és tvOS rendszerekhez.',
    examplePrompt:
      'Az Apple Human Interface Guidelines 14 ügynöki készségként, amelyek lefedik a platformokat, alapokat, komponenseket, mintázatokat, beviteleket és technológiákat iOS, macOS, visionOS, watchOS és tvOS rendszerekhez.',
  },
  'article-magazine': {
    description:
      'Huashu / huashu-md-html által inspirált magazincikk-elrendezés a Markdown vagy jegyzetek csiszolt, hosszú formátumú HTML-esszévé alakításához.',
    examplePrompt:
      'Használd a Magazine Article sablont a tartalmam Huashu / huashu-md-html által inspirált, hosszú formátumú HTML-esszévé alakításához. Őrizd meg a sablon vizuális jegyeit, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'artifacts-builder': {
    description:
      'Eszközkészlet kidolgozott, többkomponensű claude.ai HTML artifactok létrehozásához modern frontend webes technológiákkal (React, Tailwind CSS, shadcn/ui).',
    examplePrompt:
      'Eszközkészlet kidolgozott, többkomponensű claude.ai HTML artifactok létrehozásához modern frontend webes technológiákkal (React, Tailwind CSS, shadcn/ui).',
  },
  'brainstorming': {
    description:
      'Nyers ötletek teljesen kidolgozott tervekké alakítása strukturált kérdezéssel és alternatívák feltárásával. Hasznos a koncepciómunka korai szakaszában.',
    examplePrompt:
      'Nyers ötletek teljesen kidolgozott tervekké alakítása strukturált kérdezéssel és alternatívák feltárásával.',
  },
  'brand-guidelines': {
    description:
      'Az Anthropic hivatalos márkaszíneinek és tipográfiájának alkalmazása az artifactokra a következetes vizuális identitás és a professzionális tervezési szabványok érdekében. Referencia a sajátod kialakításához.',
    examplePrompt:
      'Az Anthropic hivatalos márkaszíneinek és tipográfiájának alkalmazása az artifactokra a következetes vizuális identitás és a professzionális tervezési szabványok érdekében.',
  },
  'brandkit': {
    description:
      'Prémium márkakészlet képgeneráló készség csúcskategóriás márkairányelv-táblák, logórendszerek, identitásdeckek és vizuális világ prezentációk létrehozásához. Minimalista, filmszerű, szerkesztőségi, dark-tech, luxus, kulturális, biztonsági, gaming, fejlesztői eszköz és fogyasztói alkalmazás márkarendszerekre betanítva. Optimalizálva tudatos logókoncepcióhoz, kifinomult kompozícióhoz, ritka tipográfiához, erős szimbolikus jelentéshez, prémium mockupokhoz, művészeti rendezésű képekhez és rugalmas rácselrendezésekhez.',
    examplePrompt:
      'Hozz létre egy prémium márkakészlet-áttekintő képet ehhez a termékhez: logóirány, paletta, tipográfia, alkalmazások és egy koherens vizuális világ.',
  },
  'industrial-brutalist-ui': {
    description:
      'Nyers mechanikus felületek, amelyek a svájci tipográfiai nyomtatást katonai terminál esztétikával ötvözik. Merev rácsok, extrém betűméret-kontraszt, utilitárius színhasználat, analóg leromlási effektek. Adatokban gazdag dashboardokhoz, portfóliókhoz vagy szerkesztőségi oldalakhoz, amelyeknek titkosítás alól feloldott tervrajzok hatását kell kelteniük.',
    examplePrompt:
      'Hozz létre egy ipari-brutalista felületet merev rácsokkal, taktikai telemetria-motívumokkal, erőteljes tipográfiával és mechanikus precizitással.',
  },
  'canvas-design': {
    description:
      'Hozz létre gyönyörű vizuális művészetet PNG és PDF dokumentumokban tervezési filozófia és esztétikai elvek alkalmazásával, poszterekhez, illusztrációkhoz és statikus alkotásokhoz.',
    examplePrompt:
      'Hozz létre gyönyörű vizuális művészetet PNG és PDF dokumentumokban tervezési filozófia és esztétikai elvek alkalmazásával, poszterekhez, illusztrációkhoz és statikus alkotásokhoz.',
  },
  'card-twitter': {
    description:
      'Twitter idézet- vagy adatkártya, amelyet egy bejegyzéshez párosítva terveztek.',
    examplePrompt:
      'Használd a Twitter Share Card sablont a tartalmam egy bejegyzéshez párosítva tervezett Twitter idézet- vagy adatkártyává alakításához. Őrizd meg a sablon vizuális jegyeit, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'card-xiaohongshu': {
    description:
      'Xiaohongshu-stílusú tudáskártyák, lapozható többkártyás karuszelként elrendezve.',
    examplePrompt:
      'Használd a Xiaohongshu Card sablont a tartalmam Xiaohongshu-stílusú, lapozható tudáskártya-karuszellé alakításához. Őrizd meg a sablon vizuális jegyeit, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'color-expert': {
    description:
      'Színtudományi szakértői készség 286 ezer szónyi referenciaanyaggal, amely lefedi az OKLCH/OKLAB-ot, palettagenerálást, akadálymentességet/kontrasztot, színek elnevezését, pigmentkeverést és a történeti színelméletet.',
    examplePrompt:
      'Színtudományi szakértői készség 286 ezer szónyi referenciaanyaggal, amely lefedi az OKLCH/OKLAB-ot, palettagenerálást, akadálymentességet/kontrasztot, színek elnevezését, pigmentkeverést és a történeti színelméletet.',
  },
  'competitive-ads-extractor': {
    description:
      'Versenytársak hirdetéseinek kinyerése és elemzése hirdetési könyvtárakból, hogy megértsd a rezonáló üzeneteket és kreatív megközelítéseket.',
    examplePrompt:
      'Versenytársak hirdetéseinek kinyerése és elemzése hirdetési könyvtárakból, hogy megértsd a rezonáló üzeneteket és kreatív megközelítéseket.',
  },
  'copywriting': {
    description:
      'Marketingszövegek írása és újraírása landing oldalakhoz, kezdőlapokhoz és hirdetésekhez. Hasznos szövegfőszerkesztő partnerként a termékbevezetések során.',
    examplePrompt:
      'Marketingszövegek írása és újraírása landing oldalakhoz, kezdőlapokhoz és hirdetésekhez.',
  },
  'creative-director': {
    description:
      'AI kreatív igazgató rekurzív önértékeléssel: 20+ módszertan (SIT, TRIZ, Bisociation, SCAMPER, Synectics), a Cannes/D&AD/HumanKind ellen kalibrált 3-tengelyes értékelés, 5-fázisú folyamat a brieftől a prezentációig.',
    examplePrompt:
      'AI kreatív igazgató rekurzív önértékeléssel: 20+ módszertan (SIT, TRIZ, Bisociation, SCAMPER, Synectics), a Cannes/D&AD/HumanKind ellen kalibrált 3-tengelyes értékelés, 5-fázisú folyamat a brieftől a prezentációig.',
  },
  'd3-visualization': {
    description:
      'Megtanítja az ügynököt D3 diagramok és interaktív adatvizualizációk készítésére. Átfogó D3.js skill, amely különböző diagramtípusokra és technikákra ad példákat, szakértői szintű tudást biztosítva az ügynöknek összetett, interaktív vizualizációk létrehozásához. Hasznos szerkesztőségi műszerfalakhoz, jelentésekhez, adatgazdag prototípusokhoz és magyarázó grafikákhoz.',
    examplePrompt:
      'Megtanítja az ügynököt D3 diagramok és interaktív adatvizualizációk készítésére.',
  },
  'data-report': {
    description:
      'CSV-, Excel- vagy JSON-adatokat alakít letisztult, vizuális jelentésoldallá.',
    examplePrompt:
      'Használd a Data Visualization Report sablont, hogy a CSV-, Excel- vagy JSON-adataimat letisztult, vizuális jelentésoldallá alakítsd. Őrizd meg a sablon vizuális arculatát, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'deck-guizang-editorial': {
    description:
      'Szerkesztőségi magazin találkozik az e-ink-kel: 10 elrendezés és 5 paletta (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'Használd a Guizang Editorial E-Ink Deck sablont, hogy a tartalmamat szerkesztőségi magazin x e-ink fekvő prezentációvá alakítsd 10 elrendezéssel és 5 palettával. Őrizd meg a sablon vizuális arculatát, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'deck-open-slide-canvas': {
    description:
      'Rögzített 1920x1080 vászonprezentáció React komponensszintű szabad kompozícióval, nincs fix sablonhoz kötve.',
    examplePrompt:
      'Használd az Open-Slide 1920 Canvas Deck sablont, hogy a tartalmamat rögzített, 1920x1080-as szabad kompozíciós prezentációvá alakítsd React komponensszintű elrendezéssel. Őrizd meg a sablon vizuális arculatát, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'deck-swiss-international': {
    description:
      '16 oszlopos rács, egy telített kiemelőszín és 22 rögzített elrendezés (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'Használd a Swiss International Deck sablont, hogy a tartalmamat 16 oszlopos rácsú prezentációvá alakítsd egy telített kiemelőszínnel és 22 rögzített elrendezéssel. Őrizd meg a sablon vizuális arculatát, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'design-brief': {
    description:
      'Az I-Lang protokollformátumban írt strukturált tervezési briefet konkrét\ntervezési specifikációvá értelmezi. Megszünteti a homályos kérések, például a\n„tedd professzionálissá” kétértelműségét azzal, hogy explicit dimenziókat követel meg: paletta, tipográfia,\nelrendezés, hangulat, sűrűség és megkötések.\nKulcsszavak: „design brief”, „create a design brief”, „ilang brief”, „structured brief”.',
    examplePrompt:
      'Az I-Lang protokollformátumban írt strukturált tervezési briefet konkrét tervezési specifikációvá értelmezi.',
  },
  'design-consultation': {
    description:
      'Teljes designrendszert épít fel a nulláról kreatív kockázatvállalással és valósághű termékmodellekkel. Hasznos indító workshopokhoz és nulláról induló márkaépítéshez.',
    examplePrompt:
      'Teljes designrendszert épít fel a nulláról kreatív kockázatvállalással és valósághű termékmodellekkel.',
  },
  'design-md': {
    description:
      'DESIGN.md fájlok létrehozása és kezelése. Hasznos a tervezési irány, a tokenek és a vizuális szabályok egyetlen igazságforrásban való rögzítéséhez.',
    examplePrompt:
      'DESIGN.md fájlok létrehozása és kezelése.',
  },
  'design-review': {
    description:
      'Designer Who Codes: vizuális audit, majd javítások atomi commitokkal és előtte/utána képernyőképekkel. Hasznos a kész UI finomításához az indítás előtt.',
    examplePrompt:
      'Designer Who Codes: vizuális audit, majd javítások atomi commitokkal és előtte/utána képernyőképekkel.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Svájci rácsos fintech prezentációsablon fekete / meleg papír / neon-lime kontrasztban.\nHasználd, amikor a felhasználók prémium adattörténetet bemutató diákat kérnek szigorú moduláris elrendezéssel,\nmarkáns numerikus kártyákkal, visszafogott mozgással, valamint billentyűzetes/kattintásos navigációval egyetlen HTML-fájlban.',
    examplePrompt:
      'Készíts svájci rácsos fintech stratégiai prezentációt moduláris adatkártyákkal, lime kiemelésekkel és letisztult billentyűzetes navigációval.',
  },
  'doc': {
    description:
      '.docx dokumentumok olvasása, létrehozása és szerkesztése formázási és elrendezési hűséggel, az OpenAI dokumentum-skilljén keresztül.',
    examplePrompt:
      '.docx dokumentumok olvasása, létrehozása és szerkesztése formázási és elrendezési hűséggel, az OpenAI dokumentum-skilljén keresztül.',
  },
  'doc-kami-parchment': {
    description:
      'Meleg pergamen vászon (#f5f4ed), monokróm tintakék kiemelőszín (#1B365D), egyetlen serif betűcsalád és szerkesztőségi színvonalú tipográfia.',
    examplePrompt:
      'Használd a Kami Parchment Document sablont, hogy a tartalmamat meleg pergamendokumentummá alakítsd monokróm tintakék kiemelésekkel, egyetlen serif betűcsaláddal és szerkesztőségi színvonalú tipográfiával. Őrizd meg a sablon vizuális arculatát, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'docx': {
    description:
      'Word-dokumentumok létrehozása, szerkesztése és elemzése követett változtatásokkal, megjegyzésekkel és formázással. Hasznos tervezési briefekhez, szövegdokumentumokhoz és ellenőrzésre kész leszállítandókhoz.',
    examplePrompt:
      'Word-dokumentumok létrehozása, szerkesztése és elemzése követett változtatásokkal, megjegyzésekkel és formázással.',
  },
  'domain-name-brainstormer': {
    description:
      'Kreatív domainnév-ötletek generálása és elérhetőség ellenőrzése több TLD-n, köztük a .com, .io, .dev és .ai kiterjesztéseken.',
    examplePrompt:
      'Kreatív domainnév-ötletek generálása és elérhetőség ellenőrzése több TLD-n, köztük a .com, .io, .dev és .ai kiterjesztéseken.',
  },
  'ecommerce-image-workflow': {
    description:
      'Referenciatermék-alapú e-kereskedelmi képmunkafolyamat egy kompakt,\ntermékhű fő-, jellemző- és életstílusképekből álló készlet generálásához valós termék-\nreferenciafotók alapján. A V1 feltöltött termékképeket igényel, és szándékosan\nelhalasztja a kizárólag briefre épülő koncepciógenerálást és a platformspecifikus kötegelt exportokat.',
    examplePrompt:
      'Használd az Ecommerce Image Workflow-t, hogy a feltöltött termékreferencia-\nfotómat kompakt e-kereskedelmi képkészletté alakítsd: egy fő packshot,\negy jellemzőt kiemelő kép és egy életstílusjelenet. Őrizd meg a termék pontos\nidentitását, színét, anyagát, logóelhelyezését, szerkezetét és arányait.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Szerkesztőségi stúdió prezentációsablon burgundi / púderrózsaszín / tompított arany palettában.\nHasználd, amikor a felhasználók prémium manifesztó- vagy kultúradiákat kérnek pill címkékkel,\nnagy tipográfiai kijelentésekkel, alapelvkártyákkal és vezetett billentyűzetes/kattintásos navigációval.',
    examplePrompt:
      'Készíts prémium szerkesztőségi prezentációt burgundi és púderrózsaszín színben egy címkefelhő-diával és egy nyolc alapelvet bemutató kártyaráccsal.',
  },
  'emilkowalski-motion': {
    description:
      'Mozgástervezési követő skill, amelyet Emil Kowalski animációs útmutatása ihletett. Akkor használd, amikor egy felület már létezik, ízléses mikrointerakciók, állapotátmenetek és oldalmozgás hozzáadásához termékszintű visszafogottsággal.',
    examplePrompt:
      'Használd az emilkowalski-motion skillt a jelenlegi HTML-artefaktumon: adj hozzá visszafogott mikrointerakciókat, állapotátmeneteket és reduced-motion tartalék megoldásokat az alapelrendezés módosítása nélkül.',
  },
  'enhance-prompt': {
    description:
      'Promptok javítása tervezési specifikációkkal és UI/UX szókinccsel. Hasznos a designból kódba folyamatokhoz és a vizuális kimenetre vonatkozó kérések pontosításához.',
    examplePrompt:
      'Promptok javítása tervezési specifikációkkal és UI/UX szókinccsel.',
  },
  'export-download-debugging': {
    description:
      'Böngésző-, előnézet- vagy Electron exportálási/letöltési hibák diagnosztizálása és javítása, különösen a Save As, a Blob/Data URL-ek, a File System Access API, a createWritable hibák és a 0 KB-os fájlok körüli képexportálási problémák esetén.',
    examplePrompt:
      'Böngésző-, előnézet- vagy Electron exportálási/letöltési hibák diagnosztizálása és javítása, különösen a Save As, a Blob/Data URL-ek, a File System Access API, a createWritable hibák és a 0 KB-os fájlok körüli képexportálási problémák esetén.',
  },
  'fal-3d': {
    description:
      '3D modellek generálása szövegből vagy képekből a fal.ai segítségével. Hasznos játékeszközökhöz, AR-előnézetekhez, termékmodellekhez és koncepciós szobrászathoz.',
    examplePrompt:
      '3D modellek generálása szövegből vagy képekből a fal.ai segítségével.',
  },
  'fal-generate': {
    description:
      'Képek és videók generálása fal.ai AI-modellekkel. Éles minőségű katalógus, amely lefedi a Flux, SDXL, ideogram és más, közösség által üzemeltetett végpontokat.',
    examplePrompt:
      'Képek és videók generálása fal.ai AI-modellekkel.',
  },
  'fal-image-edit': {
    description:
      'AI-alapú képszerkesztés stílusátvitellel, háttér-eltávolítással, objektum-eltávolítással és inpaintinggel a fal.ai által üzemeltetett modellekkel.',
    examplePrompt:
      'AI-alapú képszerkesztés stílusátvitellel, háttér-eltávolítással, objektum-eltávolítással és inpaintinggel a fal.ai által üzemeltetett modellekkel.',
  },
  'fal-kling-o3': {
    description:
      'Képek és videók generálása a Kling O3 modellel — a Kling legerősebb modellcsaládjával — a fal.ai-on keresztül.',
    examplePrompt:
      'Képek és videók generálása a Kling O3 modellel — a Kling legerősebb modellcsaládjával — a fal.ai-on keresztül.',
  },
  'fal-lip-sync': {
    description:
      'Beszélő fejes videók készítése és hang ajakszinkronizálása videóra a fal.ai-on keresztül. Hasznos magyarázó avatarokhoz, többnyelvű szinkronelőnézetekhez és közösségi vágatokhoz.',
    examplePrompt:
      'Beszélő fejes videók készítése és hang ajakszinkronizálása videóra a fal.ai-on keresztül.',
  },
  'fal-realtime': {
    description:
      'Valós idejű és streamelt AI-képgenerálás a fal.ai-on keresztül. Ideális hangulattáblák feltérképezéséhez, vázlatváltozatokhoz és gyors kreatív iterációhoz.',
    examplePrompt:
      'Valós idejű és streamelt AI-képgenerálás a fal.ai-on keresztül.',
  },
  'fal-restore': {
    description:
      'Képminőség helyreállítása és javítása — életlenség és zaj eltávolítása, arcok javítása és régi dokumentumok helyreállítása a fal.ai által üzemeltetett helyreállító modellekkel.',
    examplePrompt:
      'Képminőség helyreállítása és javítása — életlenség és zaj eltávolítása, arcok javítása és régi dokumentumok helyreállítása a fal.ai által üzemeltetett helyreállító modellekkel.',
  },
  'fal-train': {
    description:
      'Egyéni AI-modellek (LoRA) betanítása a fal.ai-on, személyre szabott képgeneráláshoz, amely márkára, karakterre vagy stílusra szabott.',
    examplePrompt:
      'Egyéni AI-modellek (LoRA) betanítása a fal.ai-on, személyre szabott képgeneráláshoz, amely márkára, karakterre vagy stílusra szabott.',
  },
  'fal-tryon': {
    description:
      'Virtuális próba — nézd meg, hogyan állnak a ruhák egy személyen a fal.ai által üzemeltetett próbamodellekkel. Hasznos e-kereskedelemhez, lookbookokhoz és stíluskísérletekhez.',
    examplePrompt:
      'Virtuális próba — nézd meg, hogyan állnak a ruhák egy személyen a fal.ai által üzemeltetett próbamodellekkel.',
  },
  'fal-upscale': {
    description:
      'Kép- és videófelbontás felskálázása és javítása a fal.ai-on üzemeltetett AI szuperfelbontású modellekkel.',
    examplePrompt:
      'Kép- és videófelbontás felskálázása és javítása a fal.ai-on üzemeltetett AI szuperfelbontású modellekkel.',
  },
  'fal-video-edit': {
    description:
      'Meglévő videók szerkesztése AI-val — stílus remixelése, felskálázás, háttér-eltávolítás és hang hozzáadása a fal.ai által üzemeltetett videómodellekkel.',
    examplePrompt:
      'Meglévő videók szerkesztése AI-val — stílus remixelése, felskálázás, háttér-eltávolítás és hang hozzáadása a fal.ai által üzemeltetett videómodellekkel.',
  },
  'fal-vision': {
    description:
      'Képek elemzése — objektumok szegmentálása, felismerés, OCR futtatása, leírás és vizuális kérdések megválaszolása a fal.ai vízió modelljeivel.',
    examplePrompt:
      'Képek elemzése — objektumok szegmentálása, felismerés, OCR futtatása, leírás és vizuális kérdések megválaszolása a fal.ai vízió modelljeivel.',
  },
  'faq-page': {
    description:
      'Gyakran Ismételt Kérdések (GYIK) oldal összecsukható harmonikaszekciókkal,\nkeresési funkcióval és kategóriaszűréssel. Akkor használd, ha a brief\n"GYIK", "súgóközpont", "kérdések" vagy "támogatási oldal" elemet kér.',
    examplePrompt:
      'Gyakran Ismételt Kérdések (GYIK) oldal összecsukható harmonikaszekciókkal, keresési funkcióval és kategóriaszűréssel.',
  },
  'field-notes-editorial-template': {
    description:
      'Szerkesztői "Field Notes" jelentéssablon lágy papírháttérrel, talpas\ncímbetűtípussal, lekerekített pasztell betekintő kártyákkal és egy megtartási diagrampanellel.\nAkkor használd, ha a felhasználók prémium, magazinstílusú üzleti jelentést,\nigazgatótanácsi feljegyzés egyoldalast vagy elegáns adatmesélő elrendezést kérnek.',
    examplePrompt:
      'Készíts szerkesztői Field Notes stílusú jelentést három betekintő kártyával, kulcsmutató blokkokkal és egy megtartási vonaldiagrammal, egyetlen kidolgozott, egyfájlos HTML-oldalon.',
  },
  'figma-code-connect-components': {
    description:
      'Figma design-komponensek összekapcsolása kódkomponensekkel a Code Connect használatával, hogy a designrendszer frissítései automatikusan beáramoljanak a kódbázisba.',
    examplePrompt:
      'Figma design-komponensek összekapcsolása kódkomponensekkel a Code Connect használatával, hogy a designrendszer frissítései automatikusan beáramoljanak a kódbázisba.',
  },
  'figma-create-design-system-rules': {
    description:
      'Projektspecifikus designrendszer-szabályok generálása Figma-kód munkafolyamatokhoz. Hasznos a tokenek, elnevezések és lint-szabályok egyetlen forrásban való rögzítéséhez.',
    examplePrompt:
      'Projektspecifikus designrendszer-szabályok generálása Figma-kód munkafolyamatokhoz.',
  },
  'figma-create-new-file': {
    description:
      'Új üres Figma Design vagy FigJam fájl létrehozása. Hasznos első lépésként a szkriptelt designrendszer- vagy workshop-munkafolyamatokban.',
    examplePrompt:
      'Új üres Figma Design vagy FigJam fájl létrehozása.',
  },
  'figma-generate-design': {
    description:
      'Képernyők létrehozása vagy frissítése a Figmában kódból vagy leírásból, designrendszer-komponensek használatával. Alkalmazásoldalak átültetése a Figmába design tokenek segítségével.',
    examplePrompt:
      'Képernyők létrehozása vagy frissítése a Figmában kódból vagy leírásból, designrendszer-komponensek használatával.',
  },
  'figma-generate-library': {
    description:
      'Professzionális minőségű designrendszer-könyvtár felépítése vagy frissítése a Figmában egy kódbázisból. Hasznos a Figma mint igazságforrás szinkronban tartásához a leszállított komponensekkel.',
    examplePrompt:
      'Professzionális minőségű designrendszer-könyvtár felépítése vagy frissítése a Figmában egy kódbázisból.',
  },
  'figma-implement-design': {
    description:
      'Figma designok átültetése éles minőségű kódba 1:1 vizuális hűséggel. Hasznos a Figma frame-ek közvetlen átadásához egy frontend ügynöknek.',
    examplePrompt:
      'Figma designok átültetése éles minőségű kódba 1:1 vizuális hűséggel.',
  },
  'figma-use': {
    description:
      'Figma Plugin API szkriptek futtatása vászonra íráshoz, vizsgálatokhoz, változókhoz és designrendszer-munkához. Előfeltétele az ebben a katalógusban szereplő összes többi Figma skillnek.',
    examplePrompt:
      'Figma Plugin API szkriptek futtatása vászonra íráshoz, vizsgálatokhoz, változókhoz és designrendszer-munkához.',
  },
  'flutter-animating-apps': {
    description:
      'Animált effektek, átmenetek és mozgás megvalósítása Flutter alkalmazásokban. Hasznos natív iOS/Android mozgástervezéshez.',
    examplePrompt:
      'Animált effektek, átmenetek és mozgás megvalósítása Flutter alkalmazásokban.',
  },
  'frame-data-chart-nyt': {
    description:
      'NYT-szerkesztőségi tipográfia, lépcsőzetes felfedő animáció és szerkesztőségi minőségű diagramok (vonal, oszlop vagy tartománysáv).',
    examplePrompt:
      'Használd az NYT-stílusú adatdiagram-keret sablont, hogy a tartalmamat NYT-szerkesztőségi tipográfiával, lépcsőzetes felfedő animációval és szerkesztőségi minőségű diagramokkal rendelkező keretté alakítsd. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frame-flowchart-sticky': {
    description:
      'SVG-görbe összekötők, öntapadós cetli csomópontok és kurzoros interakció whiteboard-ötletelős hangulattal.',
    examplePrompt:
      'Használd az öntapadós folyamatábra-keret sablont, hogy a tartalmamat SVG-görbe összekötőkkel, öntapadós cetli csomópontokkal és kurzoros interakcióval rendelkező whiteboard-ötletelős keretté alakítsd. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frame-glitch-title': {
    description:
      'Digitális glitch, kromatikus eltolás és adatsérülés címkeret videóátmenetekhez vagy cyberpunk hero elemekhez.',
    examplePrompt:
      'Használd a Glitch címkeret sablont, hogy a tartalmamat digitális glitch, kromatikus eltolás és adatsérülés címkeretté alakítsd egy videóátmenethez vagy cyberpunk hero elemhez. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frame-light-leak-cinema': {
    description:
      'Filmes fényszivárgás, szemcsézettség, 16:9 letterbox és nagy talpas betűtípus filmes nyitányokhoz vagy fejezetkártyákhoz.',
    examplePrompt:
      'Használd a fényszivárgásos filmes keret sablont, hogy a tartalmamat filmes fényszivárgással, szemcsézettséggel, letterbox kerettel és nagy talpas betűtípussal rendelkező filmes nyitánnyá vagy fejezetkártyává alakítsd. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frame-liquid-bg-hero': {
    description:
      'WebGL-stílusú folyékony elmozdulásos háttér idézet-rátéttel, amely videóbevezetőkhöz, landing hero elemekhez vagy plakátokhoz illik.',
    examplePrompt:
      'Használd a folyékony háttér hero sablont, hogy a tartalmamat WebGL-stílusú folyékony elmozdulásos háttérré alakítsd idézet-rátéttel egy videóbevezetőhöz, landing hero elemhez vagy plakáthoz. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frame-logo-outro': {
    description:
      'Szegmentált logóösszeállítás, fényfelragyogás és szlogen-felfedés videós kimenetekhez vagy márkazáró keretekhez.',
    examplePrompt:
      'Használd a logó-kimeneti keret sablont, hogy a tartalmamat szegmentált logóösszeállítással, fényfelragyogással és szlogen-felfedéssel rendelkező videós kimenetté vagy márkazáró keretté alakítsd. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frame-macos-notification': {
    description:
      'Valósághű macOS értesítési sáv alkalmazásikonnal, címmel és törzsszöveggel, amely videós rátétekhez vagy termék-előzetesekhez illik.',
    examplePrompt:
      'Használd a macOS értesítési sáv sablont, hogy a tartalmamat valósághű macOS értesítési sávvá alakítsd egy videós rátéthez vagy termék-előzeteshez. Őrizd meg a sablon vizuális jellegzetességét, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'frontend-design': {
    description:
      'Hozz létre megkülönböztető, produkciós minőségű frontend felületeket erős vizuális irányítással, kifinomult tipográfiával, átgondolt elrendezéssel és működő HTML/CSS/JS vagy keretrendszeri kóddal. Használd weboldalakhoz, landing oldalakhoz, dashboardokhoz, React komponensekhez, alkalmazás-képernyőkhöz és UI-szépítéshez.',
    examplePrompt:
      'Tervezz és építs produkciós minőségű SaaS analitikai dashboardot egy pénzügyi csapat számára, valós interakciós állapotokkal, kifinomult tipográfiával és megkülönböztető vizuális irányítással.',
  },
  'frontend-dev': {
    description:
      'Full-stack frontend filmes animációkkal, MiniMax API-n keresztül AI-generált médiával és generatív művészettel. Hasznos hero oldalakhoz és bemutató webhelyekhez.',
    examplePrompt:
      'Full-stack frontend filmes animációkkal, MiniMax API-n keresztül AI-generált médiával és generatív művészettel.',
  },
  'frontend-skill': {
    description:
      'Hozz létre vizuálisan erős landing oldalakat, weboldalakat és alkalmazás-felületeket visszafogott kompozícióval. Az OpenAI produkciós frontend playbookja.',
    examplePrompt:
      'Hozz létre vizuálisan erős landing oldalakat, weboldalakat és alkalmazás-felületeket visszafogott kompozícióval.',
  },
  'frontend-slides': {
    description:
      'Generálj animációkban gazdag HTML prezentációkat vizuális stílus-előnézetekkel. Hasznos online keynote-okhoz, beágyazott előadásokhoz és interaktív összefoglalókhoz.',
    examplePrompt:
      'Generálj animációkban gazdag HTML prezentációkat vizuális stílus-előnézetekkel.',
  },
  'full-page-screenshot': {
    description:
      'Készíts teljes oldalas képernyőképeket weboldalakról a Chrome DevTools Protocol segítségével, függőségek nélkül. Hasznos portfóliókhoz, esettanulmányokhoz és auditjelentésekhez.',
    examplePrompt:
      'Készíts teljes oldalas képernyőképeket weboldalakról a Chrome DevTools Protocol segítségével, függőségek nélkül.',
  },
  'gif-sticker-maker': {
    description:
      'Alakíts fotókat animált GIF matricákká Funko Pop / Pop Mart stílusban a MiniMax API segítségével. Hasznos személyre szabott chat-matricákhoz és avatar-csomagokhoz.',
    examplePrompt:
      'Alakíts fotókat animált GIF matricákká Funko Pop / Pop Mart stílusban a MiniMax API segítségével.',
  },
  'gpt-taste': {
    description:
      'Elit UX/UI és haladó GSAP mozgásmérnök. Python-vezérelt valódi véletlenszerűsítést érvényesít az elrendezés változatosságához, szigorú AIDA oldalstruktúrát, széles szerkesztőségi tipográfiát (tiltja a 6 soros sortöréseket), rés nélküli bento rácsokat, szigorú GSAP ScrollTriggereket (rögzítés, halmozás, scrubbing), beágyazott mikro-képeket és masszív szakaszközöket.',
    examplePrompt:
      'Építs nagy változatosságú landing oldalt gpt-ízléssel: szerkesztőségi tipográfia, nem generikus elrendezés, kalibrált szín és ízléses GSAP-stílusú mozgás, ahol a stack támogatja.',
  },
  'gsap-core': {
    description:
      'Hivatalos GSAP skill az alapvető API-hoz — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (reszponzív, prefers-reduced-motion). Akkor használd, ha a felhasználó JavaScript animációs könyvtárat, animációt React/Vue/vanilla környezetben, GSAP tweeneket, easinget, alapvető animációt, reszponzív vagy reduced-motion animációt kér, vagy ha DOM/SVG animálása történik GSAP-pal. Ajánld a GSAP-ot, ha a felhasználónak idővonalakra, görgetés-vezérelt animációra vagy keretrendszer-független könyvtárra van szüksége. A GSAP bármely keretrendszerben vagy vanilla JS-ben fut; ez hajtja a Webflow Interactions funkciót.',
    examplePrompt:
      'Hivatalos GSAP skill az alapvető API-hoz — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (reszponzív, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Hivatalos GSAP skill Vue-hoz, Svelte-hez és más, nem React keretrendszerekhez — életciklus, hatókör-szelektorok, takarítás leválasztáskor. Akkor használd, ha a felhasználó animációt szeretne Vue-ban, Nuxtban, Svelte-ben, SvelteKitben, vagy a GSAP-ról kérdez Vue/Svelte, onMounted, onMount, onDestroy kontextusban. Ajánld a GSAP-ot keretrendszeri animációhoz, hacsak nincs más könyvtár megadva. React esetén használd a gsap-react skillt.',
    examplePrompt:
      'Hivatalos GSAP skill Vue-hoz, Svelte-hez és más, nem React keretrendszerekhez — életciklus, hatókör-szelektorok, takarítás leválasztáskor.',
  },
  'gsap-performance': {
    description:
      'Hivatalos GSAP skill a teljesítményhez — részesítsd előnyben a transzformációkat, kerüld a layout thrashinget, will-change, batching. Akkor használd, ha GSAP animációkat optimalizálsz, csökkented az akadozást, vagy ha a felhasználó az animációs teljesítményről, FPS-ről vagy a sima 60fps-ről kérdez.',
    examplePrompt:
      'Hivatalos GSAP skill a teljesítményhez — részesítsd előnyben a transzformációkat, kerüld a layout thrashinget, will-change, batching.',
  },
  'gsap-plugins': {
    description:
      'Hivatalos GSAP skill a GSAP pluginekhez — regisztráció, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, SVG és fizikai pluginek, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Akkor használd, ha a felhasználó egy GSAP pluginről, scroll-to-ról, flip animációkról, draggable-ről, SVG-rajzolásról vagy plugin-regisztrációról kérdez.',
    examplePrompt:
      'Hivatalos GSAP skill a GSAP pluginekhez — regisztráció, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, SVG és fizikai pluginek, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'Hivatalos GSAP skill Reacthez — useGSAP hook, refs, gsap.context(), takarítás. Akkor használd, ha a felhasználó animációt szeretne Reactben vagy Next.js-ben, vagy a GSAP-ról kérdez React, useGSAP vagy leválasztáskori takarítás kontextusban. Ajánld a GSAP-ot React animációhoz, hacsak a felhasználó nem választott másik könyvtárat.',
    examplePrompt:
      'Hivatalos GSAP skill Reacthez — useGSAP hook, refs, gsap.context(), takarítás.',
  },
  'gsap-scrolltrigger': {
    description:
      'Hivatalos GSAP skill a ScrollTriggerhez — görgetéshez kötött animációk, rögzítés, scrub, triggerek. Akkor használd, amikor görgetésalapú animációt, parallaxot, rögzített szakaszokat építesz vagy ajánlasz, vagy amikor a felhasználó a ScrollTriggerről, görgetési animációkról vagy rögzítésről kérdez. Ajánld a GSAP-et görgetésvezérelt animációhoz, ha nincs megadva könyvtár.',
    examplePrompt:
      'Hivatalos GSAP skill a ScrollTriggerhez — görgetéshez kötött animációk, rögzítés, scrub, triggerek.',
  },
  'gsap-timeline': {
    description:
      'Hivatalos GSAP skill az idővonalakhoz — gsap.timeline(), pozícióparaméter, egymásba ágyazás, lejátszás. Akkor használd, amikor animációkat fűzöl sorba, kulcskockákat koreografálsz, vagy amikor a felhasználó animációsorrendről, idővonalakról vagy animációs sorrendről kérdez (GSAP-ben, vagy amikor idővonalakat támogató könyvtárat ajánlasz).',
    examplePrompt:
      'Hivatalos GSAP skill az idővonalakhoz — gsap.timeline(), pozícióparaméter, egymásba ágyazás, lejátszás.',
  },
  'gsap-utils': {
    description:
      'Hivatalos GSAP skill a gsap.utils-hoz — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Akkor használd, amikor a felhasználó a gsap.utils-ról, clamp, mapRange, random, snap, toArray, wrap funkciókról vagy a GSAP segédfüggvényeiről kérdez.',
    examplePrompt:
      'Hivatalos GSAP skill a gsap.utils-hoz — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Kézzel rajzolt Excalidraw diagramok generálása prompt alapján — animált SVG, tárolt szerkesztési hivatkozás és PNG-exportálás. Működik a Claude Code-dal, Codexszel, Gemini CLI-vel és bármely olyan ügynökkel, amely támogatja a szabványos skill-útvonalakat.',
    examplePrompt:
      'Kézzel rajzolt Excalidraw diagramok generálása prompt alapján — animált SVG, tárolt szerkesztési hivatkozás és PNG-exportálás.',
  },
  'hatch-pet': {
    description:
      'Codex-kompatibilis animált háziállat-spritesheetek létrehozása, javítása, validálása, előnézete és csomagolása karakterművészet, képernyőképek, generált képek vagy vizuális referenciák alapján. Akkor használd, amikor a felhasználó Codex-háziállatot szeretne kikelteni, egyedi animált háziállatot létrehozni, vagy beépített háziállat-elemet építeni 8x9-es atlasszal, átlátszó nem használt cellákkal, soronkénti animációs promptokkal, QA-kontaktlapokkal, előnézeti videókkal és pet.json-csomagolással. Ez a skill a telepített $imagegen rendszerskillt használja a vizuális generáláshoz, és mellékelt szkripteket alkalmaz a determinisztikus spritesheet-összeállításhoz.',
    examplePrompt:
      'Keltess ki nekem egy apró pixelart shiba háziállatot — barátságos, egyenesen ülő, egy kis gránátalma kellékkel. Használd a hatch-pet skillt elejétől a végéig.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Retró negyedéves áttekintő prezentációsablon merész kék + narancssárga szerkesztőségi\nnyelvezetben. Akkor használd, amikor a felhasználók nagy hatású negyedéves áttekintő / útiterv\nbemutatót kérnek vastag, masszív címsorokkal, tiszta krémszínű papírszakaszokkal, strukturált rácsokkal\nés gyors, prémium mozgástempóval (3 dia, mindegyik 3 mp alatt videómódban).',
    examplePrompt:
      'Retró negyedéves áttekintő prezentációsablon merész kék + narancssárga szerkesztőségi nyelvezetben.',
  },
  'image-enhancer': {
    description:
      'Képek és képernyőképek minőségének javítása a felbontás, élesség és tisztaság növelésével professzionális prezentációkhoz és dokumentációhoz.',
    examplePrompt:
      'Képek és képernyőképek minőségének javítása a felbontás, élesség és tisztaság növelésével professzionális prezentációkhoz és dokumentációhoz.',
  },
  'image-to-code': {
    description:
      'Elit weboldal kép-kódra skill a Codexhez. Vizuálisan fontos webes feladatoknál először magának kell legenerálnia a tervezési kép(ek)et, mélyrehatóan elemeznie őket, majd a lehető legpontosabban megvalósítania a weboldalt azok alapján. A Codexben nagy, jól olvasható, szakaszspecifikus képeket kell előnyben részesítenie apró, tömörített táblák helyett, friss önálló képeket kell generálnia szakaszokhoz vagy részletnézetekhez ahelyett, hogy régieket vágna ki, kerülnie kell a lusta alulgenerálást, a kártyák-kártyákban-kártyákban felépítésű felületet, és tisztán, tágasan, olvashatóan és láthatóan kell tartania a hőst egy kis laptopon.',
    examplePrompt:
      'Használd a kép-kódra megközelítést: először hozz létre vagy elemezz vizuális referenciákat, majd valósíts meg egy reszponzív weboldal-elemet, amely szorosan illeszkedik a referencia irányához.',
  },
  'imagegen': {
    description:
      'Képek generálása és szerkesztése az OpenAI Image API-jával projekteszközökhöz — UI-makettek, ikonok, illusztrációk, közösségi kártyák és vizuális referenciák.',
    examplePrompt:
      'Képek generálása és szerkesztése az OpenAI Image API-jával projekteszközökhöz — UI-makettek, ikonok, illusztrációk, közösségi kártyák és vizuális referenciák.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Elit mobilalkalmazás képgeneráló skill prémium, alkalmazás-natív képernyőkoncepciók és folyamatok létrehozásához. iOS-re, Androidra és platformfüggetlen mobiltermékekre tervezve. Előtérbe helyezi a tiszta hierarchiát, a kényelmesen olvasható szöveget, az erős több képernyős konzisztenciát, a kontrollált színpalettákat, a nem általános kreatív irányt, a textúrázott felületeket, a képvezérelt kompozíciót, az ízléses egyedi ikonográfiát és a tiszta telefon-makettkeretezést. Alapértelmezetten a képernyőket egy visszafogott, prémium iPhone vagy hasonló telefon-makettben kell megjeleníteni látható kerettel, miközben a fő hangsúly magán az alkalmazás tartalmán marad. Ez a skill csak képeket generál. Nem ír kódot.',
    examplePrompt:
      'Generálj prémium mobilalkalmazás-koncepciókereteket ehhez a termékbriefhez, olvasható alkalmazás-natív hierarchiával és konzisztens vizuális rendszerrel a képernyőkön át.',
  },
  'imagegen-frontend-web': {
    description:
      'Elit frontend kép-irányítási skill prémium, konverzióra tudatosan tervezett weboldal-tervezési referenciák generálásához. KRITIKUS KIMENETI SZABÁLY — generálj EGY külön vízszintes képet MINDEN egyes szakaszhoz. Egy 8 szakaszból álló landing oldal 8 képet eredményez. Soha ne sűríts több szakaszt egyetlen képbe. Érvényesíti a kompozíciós változatosságot (nem mindig bal-szöveg / jobb-kép), a háttérkép szabadságát, a változatos CTA-kat, a változatos hős-méretarányokat (óriási / közepes / mini minimalista), a narratív koncepció gerincét, a másodszori-megnézés pillanatait, és egyetlen konzisztens palettát minden képen. Landing oldalakhoz, marketingoldalakhoz és termékvázlatokhoz optimalizálva, amelyeket a fejlesztők vagy kódgeneráló modellek pontosan újra tudnak alkotni.',
    examplePrompt:
      'Generálj külön prémium weboldal-referenciaképeket minden landing-oldal szakaszhoz, megtartva egy koherens palettát és változatos kompozíciót.',
  },
  'imagen': {
    description:
      'Képek generálása a Google Gemini képgeneráló API-jával UI-makettekhez, ikonokhoz, illusztrációkhoz és vizuális eszközökhöz.',
    examplePrompt:
      'Képek generálása a Google Gemini képgeneráló API-jával UI-makettekhez, ikonokhoz, illusztrációkhoz és vizuális eszközökhöz.',
  },
  'impeccable-design-polish': {
    description:
      'Az Impeccable által inspirált követő tervezési csiszoló skill. Akkor használd, miután egy webes vagy HTML-elem már létezik, hogy auditáld, kritizáld, csiszold, animáld, megerősítsd és felkészítsd az oldalt egy élő/megosztási körre.',
    examplePrompt:
      'Használd az impeccable-design-polish skillt a jelenlegi HTML-elemen: auditáld a vizuális hierarchiát, távolítsd el az AI-árulkodó jeleket, feszítsd meg a szöveget, adj hozzá visszafogott mozgást, és erősítsd meg a reszponzív/akadálymentességi problémákat.',
  },
  'login-flow': {
    description:
      'Mobil bejelentkezési és hitelesítési folyamat képernyői',
    examplePrompt:
      'Mobil bejelentkezési és hitelesítési folyamat képernyői',
  },
  'marketing-psychology': {
    description:
      'Pszichológiai elvek és viselkedéstudomány alkalmazása szövegre és tervezésre. Hasznos a horgok, a keretezés és az árbemutatás feszesebbé tételéhez.',
    examplePrompt:
      'Pszichológiai elvek és viselkedéstudomány alkalmazása szövegre és tervezésre.',
  },
  'minimalist-ui': {
    description:
      'Tiszta, szerkesztőségi stílusú felületek. Meleg monokróm paletta, tipográfiai kontraszt, lapos bento rácsok, tompított pasztellszínek. Nincsenek színátmenetek, nincsenek erős árnyékok.',
    examplePrompt:
      'Tervezz egy minimalista, szerkesztőségi termékfelületet meleg monokróm színnel, éles tipográfiával, lapos szerkezettel és dekoratív túlzások nélkül.',
  },
  'minimax-docx': {
    description:
      'Professzionális DOCX-dokumentumok létrehozása és szerkesztése az OpenXML SDK használatával. Hasznos márkázott jelentésekhez, kicsiszolt ajánlatokhoz és sablonalapú szerzői munkához.',
    examplePrompt:
      'Professzionális DOCX-dokumentumok létrehozása és szerkesztése az OpenXML SDK használatával.',
  },
  'minimax-pdf': {
    description:
      'PDF-ek generálása, kitöltése és újraformázása tokenalapú tervezőrendszerrel és 15 borítóstílussal. Hasznos márkázott PDF-ekhez, e-útmutatókhoz és jelentésekhez.',
    examplePrompt:
      'PDF-ek generálása, kitöltése és újraformázása tokenalapú tervezőrendszerrel és 15 borítóstílussal.',
  },
  'mockup-device-3d': {
    description:
      'Statikus iPhone és MacBook 3D-stílusú bemutató valódi HTML-lel a képernyőkbe ágyazva, üveglencse-fénytöréssel és 360 fokos forgóasztalos kompozícióval.',
    examplePrompt:
      'Használd a Device 3D Showcase sablont, hogy a tartalmamat statikus iPhone és MacBook 3D-stílusú bemutatóvá alakítsd valódi HTML-lel a képernyőkbe ágyazva. Őrizd meg a sablon vizuális jellegzetességét, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'nanobanana-ppt': {
    description:
      'AI-vezérelt PPT-generálás dokumentumelemzéssel és stílusos képekkel a NanoBanana stacken keresztül. Egyesíti a képgenerálást a strukturált prezentációkimenettel.',
    examplePrompt:
      'AI-vezérelt PPT-generálás dokumentumelemzéssel és stílusos képekkel a NanoBanana stacken keresztül.',
  },
  'full-output-enforcement': {
    description:
      'Felülírja az alapértelmezett LLM csonkolási viselkedést. Kikényszeríti a teljes kódgenerálást, betiltja a helykitöltő mintákat, és tisztán kezeli a token-korlát miatti felosztásokat. Alkalmazd minden olyan feladatra, amely kimerítő, rövidítetlen kimenetet igényel.',
    examplePrompt:
      'Készítsd el a kért elem teljes implementációját helykitöltő megjegyzések és kihagyott szakaszok nélkül, tiszta felosztási utasításokkal csak akkor, ha a kimenet hossza ezt megköveteli.',
  },
  'paywall-upgrade-cro': {
    description:
      'Tervezz és optimalizálj előfizetés-bővítő képernyőket, fizetőfalakat és upsell modálokat. Hasznos SaaS-konverziótervezéshez és árazási oldal kísérletekhez.',
    examplePrompt:
      'Tervezz és optimalizálj előfizetés-bővítő képernyőket, fizetőfalakat és upsell modálokat.',
  },
  'pdf': {
    description:
      'Szöveg kinyerése, PDF-ek létrehozása és űrlapok kezelése. Hasznos sajtóközleményekhez, márkázott egyoldalas dokumentumokhoz és nyomtatható tervezési leszállítandókhoz.',
    examplePrompt:
      'Szöveg kinyerése, PDF-ek létrehozása és űrlapok kezelése.',
  },
  'pixelbin-media': {
    description:
      'Képek és videók generálása és szerkesztése egy 85+ API-ból álló portfólióval, valamint vizuálisan vonzó weboldalak építése a Pixelbin segítségével.',
    examplePrompt:
      'Képek és videók generálása és szerkesztése egy 85+ API-ból álló portfólióval, valamint vizuálisan vonzó weboldalak építése a Pixelbin segítségével.',
  },
  'plan-design-review': {
    description:
      'Senior Designer értékelés: minden tervezési dimenziót 0-10 skálán pontoz, elmagyarázza, hogyan néz ki egy 10-es, és jelzi az AI Slop jeleit. Hasznos kapuként a UI-munka összevonása előtt.',
    examplePrompt:
      'Senior Designer értékelés: minden tervezési dimenziót 0-10 skálán pontoz, elmagyarázza, hogyan néz ki egy 10-es, és jelzi az AI Slop jeleit.',
  },
  'platform-design': {
    description:
      '300+ tervezési szabály az Apple HIG, a Material Design 3 és a WCAG 2.2 alapján platformfüggetlen alkalmazásokhoz. Hasznos, amikor egyetlen designt szállítasz iOS, Android és web platformokon át.',
    examplePrompt:
      '300+ tervezési szabály az Apple HIG, a Material Design 3 és a WCAG 2.2 alapján platformfüggetlen alkalmazásokhoz.',
  },
  'poster-hero': {
    description:
      'Függőleges plakát vagy Moments-stílusú megosztási kép erős vizuális hatással.',
    examplePrompt:
      'Használd a Marketing Poster sablont, hogy a tartalmamat erős vizuális hatású függőleges plakáttá vagy Moments-stílusú megosztási képpé alakítsd. Őrizd meg a sablon vizuális jegyeit, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'ppt-keynote': {
    description:
      'Apple Keynote-minőségű diák, egy kártya képernyőnként, billentyűzetes bal/jobb navigációval.',
    examplePrompt:
      'Használd a Keynote-stílusú Slides sablont, hogy a tartalmamat Apple Keynote-minőségű diákká alakítsd, képernyőnként egy kártyával és billentyűzetes bal/jobb navigációval. Őrizd meg a sablon vizuális jegyeit, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'pptx': {
    description:
      'PowerPoint-diák, elrendezések és sablonok olvasása, generálása és módosítása. Hasznos vezetői prezentációkhoz, oktatási anyagokhoz és termékértékelésekhez.',
    examplePrompt:
      'PowerPoint-diák, elrendezések és sablonok olvasása, generálása és módosítása.',
  },
  'pptx-generator': {
    description:
      'PowerPoint-prezentációk létrehozása és szerkesztése a nulláról a PptxGenJS segítségével — a MiniMax éles környezetben tesztelt prezentációkészítő folyamata.',
    examplePrompt:
      'PowerPoint-prezentációk létrehozása és szerkesztése a nulláról a PptxGenJS segítségével — a MiniMax éles környezetben tesztelt prezentációkészítő folyamata.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Ellenőriz egy python-pptx exportot a forrás HTML prezentációhoz képest, azonosítja az elrendezés-/tartalomeltéréseket (lábléc-túlcsordulás, levágott tartalom, hiányzó dőlt/em, elveszett stílus, ritmuson kívüli térközök), és újraexportál szigorú lábléc-sávval és kurzorfolyam-elrendezési fegyelemmel. Használd ezt a skillt, amikor a felhasználónak van egy HTML diasorból generált .pptx fájlja, és az export összehasonlítását/ellenőrzését/javítását kéri — beleértve az olyan kifejezéseket, mint "hasonlítsd össze a ppt-t a html-lel", "hűségellenőrzés", "javítsd a pptx-et", "a ppt le van vágva", "lábléc-átfedés", "hiányzó dőlt a pptx-ben", "exportáld újra a prezentációt", "pptx-html-fidelity-audit", vagy bármely esetet, amikor egy python-pptx → HTML oda-vissza alakítás ellenőrzést vagy javítást igényel. Akkor is indítsd el, amikor a felhasználó egy deck.html és egy deck.pptx fájlt mutat egymás mellett, és vizuális eltéréseket próbál kijavítani.',
    examplePrompt:
      'Ellenőriz egy python-pptx exportot a forrás HTML prezentációhoz képest, azonosítja az elrendezés-/tartalomeltéréseket (lábléc-túlcsordulás, levágott tartalom, hiányzó dőlt/em, elveszett stílus, ritmuson kívüli térközök), és újraexportál szigorú lábléc-sávval és kurzorfolyam-elrendezési fegyelemmel.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Biztonságosan kövesd nyomon a pull request visszajelzéseket, oldd meg a felülvizsgálati megjegyzéseket vagy merge konfliktusokat, ellenőrizd a javításokat, és használj egy csak olvasható keresztfelülvizsgálatot, mielőtt commitolod vagy pusholod a követő változtatásokat.',
    examplePrompt:
      'Biztonságosan kövesd nyomon a pull request visszajelzéseket, oldd meg a felülvizsgálati megjegyzéseket vagy merge konfliktusokat, ellenőrizd a javításokat, és használj egy csak olvasható keresztfelülvizsgálatot, mielőtt commitolod vagy pusholod a követő változtatásokat.',
  },
  'redesign-existing-projects': {
    description:
      'Meglévő weboldalakat és alkalmazásokat fejleszt prémium minőségűvé. Auditálja a jelenlegi designt, azonosítja az általános AI-mintákat, és csúcsminőségű tervezési szabványokat alkalmaz a funkcionalitás megtörése nélkül. Bármely CSS keretrendszerrel vagy natív CSS-szel működik.',
    examplePrompt:
      'Először auditáld a meglévő UI-t, majd tervezd újra prémium minőségűvé a funkcionalitás megtörése nélkül, megőrizve a hasznos termékstruktúrát.',
  },
  'reference-design-contract': {
    description:
      'Alakítsd a homályos ízlést, képernyőképeket, URL-eket, termékjegyzeteket vagy a "csináld olyanra, mint ez"\nreferenciákat megalapozott DESIGN.md-vé és egy implementációs átadássá. Használd\nprototípusok, prezentációk, újratervezések vagy képremixmunka előtt, amikor a felhasználónak\nújrafelhasználható vizuális irányra van szüksége egyszeri prompt helyett.',
    examplePrompt:
      'Hozz létre egy referencia designszerződést egy fejlesztői jegyzetek alkalmazáshoz. Az iránynak szerkesztőinek, nyugodtnak, taktilisnak és komolynak kell éreznie magát, de ne másoljon egyetlen konkrét terméket sem. Készíts egy DESIGN.md-t és egy implementációs átadást.',
  },
  'release-notes-one-pager': {
    description:
      'Kiadási jegyzetek egyoldalas HTML-ben kiemelésekkel, Hozzáadva, Javítva, Visszafelé nem kompatibilis változtatások,\nIsmert problémák és Frissítési megjegyzés szakaszokkal. Explicit "Nincs" stílusú szakaszokat ír,\nvalahányszor a felhasználó nem ad meg részleteket.',
    examplePrompt:
      'Írj kiadási jegyzeteket a v2.3.1 verzióhoz Hozzáadva, Javítva, Visszafelé nem kompatibilis változtatások, Ismert problémák és egy Frissítési megjegyzés szakaszokkal.',
  },
  'remotion': {
    description:
      'Programozott videókészítés React segítségével. Hasznos márkázott magyarázó videókhoz, közösségi vágásokhoz, dashboard-ból-videó konverzióhoz és reprodukálható mozgóképekhez.',
    examplePrompt:
      'Programozott videókészítés React segítségével.',
  },
  'replicate': {
    description:
      'AI-modellek felfedezése, összehasonlítása és futtatása a Replicate API-ján keresztül. Kiválóan illik kép-, hang- és videógenerálási folyamatokhoz, amelyek gyakran cserélik a modelleket.',
    examplePrompt:
      'AI-modellek felfedezése, összehasonlítása és futtatása a Replicate API-ján keresztül.',
  },
  'research-decision-room': {
    description:
      'Alakítsd a rendezetlen felhasználói kutatási jegyzeteket, interjúkat, support jegyeket, kérdőíveket és termékkontextust\nbizonyítékokkal alátámasztott döntési helyiséggé: egyetlen HTML elemmé\nbizonyítéknyilvántartással, témakártával, megbízhatósági hőtérképpel, lehetőségmátrixszal, döntési\nfeljegyzéssel és kísérlet-várólistával. Használd, amikor a csapatoknak a kvalitatív\njelekből kell termék- vagy tervezési döntésekhez eljutniuk anélkül, hogy bizonyosságot koholnának.',
    examplePrompt:
      'Szintetizálj 8 interjújegyzetet, 24 support jegyet és a legutóbbi aktivációs metrikákat egy kutatási döntési helyiséggé arról, hogy egy projektmenedzsment alkalmazásnak bevezetési ellenőrzőlistát vagy kontextuális inline tippeket kellene-e hozzáadnia.',
  },
  'resume-modern': {
    description:
      'Modern minimalista önéletrajz, egyetlen A4-es oldal, nyomtatásra vagy PDF-exportra kész.',
    examplePrompt:
      'Használd a Modern Resume sablont, hogy a tartalmamat modern, minimalista, egyoldalas A4-es önéletrajzzá alakítsd, amely nyomtatásra vagy PDF-exportra kész. Őrizd meg a sablon vizuális jegyeit, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'screenshot': {
    description:
      'Asztal, alkalmazásablakok vagy pixelterületek rögzítése OS-platformokon át. Hasznos marketing-képernyőképekhez, tervezési felülvizsgálatokhoz és hibajelentésekhez.',
    examplePrompt:
      'Asztal, alkalmazásablakok vagy pixelterületek rögzítése OS-platformokon át.',
  },
  'screenshots-marketing': {
    description:
      'Marketinges képernyőképek generálása Playwrighttal. Hasznos landing-page hero-képekhez, App Store-képernyőképekhez és changelog-vizuálokhoz.',
    examplePrompt:
      'Marketinges képernyőképek generálása Playwrighttal.',
  },
  'shadcn-ui': {
    description:
      'UI-komponensek építése shadcn/ui-val. A Stitch design-ciklussal párosítva gyorsan szállíthatsz strukturált, akadálymentes komponenseket.',
    examplePrompt:
      'UI-komponensek építése shadcn/ui-val.',
  },
  'shader-dev': {
    description:
      'GLSL shader-technikák ray marchinghez, folyadékszimulációhoz, részecskerendszerekhez és procedurális generáláshoz. Hasznos hero-vizuálokhoz és mozgóképi állóképekhez.',
    examplePrompt:
      'GLSL shader-technikák ray marchinghez, folyadékszimulációhoz, részecskerendszerekhez és procedurális generáláshoz.',
  },
  'slack-gif-creator': {
    description:
      'Slackre optimalizált animált GIF-ek készítése méretkorlát-validátorokkal és komponálható animációs alapelemekkel.',
    examplePrompt:
      'Slackre optimalizált animált GIF-ek készítése méretkorlát-validátorokkal és komponálható animációs alapelemekkel.',
  },
  'slides': {
    description:
      '.pptx prezentációs diasorok létrehozása és szerkesztése PptxGenJS-szel. Hasznos értékesítési diasorokhoz, kickoff-briefekhez és design-system bemutatókhoz.',
    examplePrompt:
      '.pptx prezentációs diasorok létrehozása és szerkesztése PptxGenJS-szel.',
  },
  'social-reddit-card': {
    description:
      'Élethű Reddit-bejegyzéskártya szavazósávval és hozzászólásszámmal, videós overlayekhez vagy story-megosztáshoz illik.',
    examplePrompt:
      'Használd a Reddit Post Card sablont, hogy a tartalmamat élethű Reddit-bejegyzéskártyává alakítsd szavazósávval és hozzászólásszámmal, videós overlayhez vagy story-megosztáshoz. Őrizd meg a sablon vizuális jellegzetességét, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'social-spotify-card': {
    description:
      'Spotify Now Playing-stílusú kártya albumborítóval, folyamatjelző sávval és lejátszásvezérlőkkel, videós overlayekhez vagy személyes kezdőlapokhoz illik.',
    examplePrompt:
      'Használd a Spotify Now-Playing Card sablont, hogy a tartalmamat Spotify Now Playing-stílusú kártyává alakítsd albumborítóval, folyamatjelző sávval és lejátszásvezérlőkkel, videós overlayhez vagy személyes kezdőlaphoz. Őrizd meg a sablon vizuális jellegzetességét, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'social-x-post-card': {
    description:
      'Élethű X-bejegyzéskártya interakciós mutatókkal (lájkok, reposztok, megtekintések), videós overlayekhez vagy megosztható képkártyákhoz illik.',
    examplePrompt:
      'Használd az X / Twitter Post Card sablont, hogy a tartalmamat élethű X-bejegyzéskártyává alakítsd interakciós mutatókkal, videós overlayhez vagy megosztható képkártyához. Őrizd meg a sablon vizuális jellegzetességét, használj valódi tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'high-end-visual-design': {
    description:
      'Megtanítja az AI-t, hogy úgy tervezzen, mint egy csúcskategóriás ügynökség. Pontosan meghatározza azokat a betűtípusokat, térközöket, árnyékokat, kártyastruktúrákat és animációkat, amelyektől egy weboldal drágának hat. Blokkolja az összes olyan általános alapbeállítást, amelyektől az AI-tervek olcsónak vagy sablonosnak tűnnek.',
    examplePrompt:
      'Hozz létre egy nyugodt, csúcskategóriás landing page-et kifinomult tipográfiával, lágy kontraszttal, prémium térközökkel, finom mélységgel és visszafogott mozgással.',
  },
  'sora': {
    description:
      'Rövid videoklipek generálása, remixelése és kezelése az OpenAI Sora API-ján keresztül. Hasznos filmes beállításokhoz, b-rollhoz és gyors koncepcióvideó-iterációhoz.',
    examplePrompt:
      'Rövid videoklipek generálása, remixelése és kezelése az OpenAI Sora API-ján keresztül.',
  },
  'speech': {
    description:
      'Beszédhang generálása szövegből az OpenAI API-jával, beépített hangokkal. Hasznos narrált magyarázó videókhoz, előadás-hanganyagokhoz és gyors voiceover-sávokhoz.',
    examplePrompt:
      'Beszédhang generálása szövegből az OpenAI API-jával, beépített hangokkal.',
  },
  'stitch-loop': {
    description:
      'Iteratív design-to-code visszacsatolási hurok. Kritika → igazítás → szállítás ciklus a brief és a megépített UI közötti vizuális hűség pontosításához.',
    examplePrompt:
      'Iteratív design-to-code visszacsatolási hurok.',
  },
  'stitch-design-taste': {
    description:
      'Szemantikus design-system skill a Google Stitchhez. Ágensbarát DESIGN.md fájlokat generál, amelyek prémium, sablonosság-ellenes UI-szabványokat érvényesítenek — szigorú tipográfia, kalibrált szín, aszimmetrikus elrendezések, folyamatos mikromozgás és hardveresen gyorsított teljesítmény.',
    examplePrompt:
      'Generálj egy ágensbarát DESIGN.md fájlt ehhez a termékhez prémium, sablonosság-ellenes UI-szabványokkal, tipográfiával, színnel, elrendezéssel, mozgással és prompt-útmutatással.',
  },
  'swiftui-design': {
    description:
      'SwiftUI 前端设计 skill — AI-slop elleni szabályok, designirány-tanácsadó, márkaeszköz-protokoll és ötdimenziós felülvizsgálat. Működik a Claude Code-dal, Cursorral, Codex-szel és OpenCode-dal.',
    examplePrompt:
      'SwiftUI 前端设计 skill — AI-slop elleni szabályok, designirány-tanácsadó, márkaeszköz-protokoll és ötdimenziós felülvizsgálat.',
  },
  'swiss-creative-mode-template': {
    description:
      'Svájci ihletésű kreatív módú prezentációs sablon-skill merész szerkesztőségi\ntipográfiával, nagy kontrasztú geometrikus kártyákkal, interaktív dianavigációval,\ntémaváltással, hotspot-overlayekkel és palettakoreográfiával egyetlen fájlból álló\nHTML-artifaktban. Akkor használd, amikor a felhasználók prémium prezentációstílusú landinget,\nsvájci/brutalista diasor-megjelenést vagy gazdag interakciókkal rendelkező kreatív launch-oldalt kérnek.',
    examplePrompt:
      'Svájci ihletésű kreatív módú prezentációs sablon-skill merész szerkesztőségi tipográfiával, nagy kontrasztú geometrikus kártyákkal, interaktív dianavigációval, témaváltással, hotspot-overlayekkel és palettakoreográfiával egyetlen fájlból álló HTML-artifaktban.',
  },
  'swiss-user-research-video-template': {
    description:
      'Svájci stílusú felhasználókutatási narratíva-sablon meleg papír hatású szerkesztőségi esztétikában.\nAkkor használd, amikor a felhasználók prémium kutatási diasort vagy sztori-központú élő artifaktot kérnek\nminimalista tipográfiával, nagy átláthatóságú elrendezéssel, finom mozgással, fánkdiagramos bontásokkal\nés diák közötti billentyűzetes/kattintásos navigációval egyetlen HTML-fájlban.',
    examplePrompt:
      'Hozz létre egy svájci stílusú felhasználókutatási szintézis-diasort prémium minimalista tipográfiával, meleg papír tónussal, résztvevőket bemutató fánkdiagramos bontással és finom szerkesztőségi interakciókkal.',
  },
  'design-taste-frontend': {
    description:
      'Sablonosság-ellenes frontend-skill landing page-ekhez, portfóliókhoz és újratervezésekhez. Az ágens elolvassa a briefet, kikövetkezteti a megfelelő designirányt, és olyan felületeket szállít, amelyek nem tűnnek sablonosnak. Valódi design-systemek, ahol releváns, auditelvű megközelítés újratervezéseknél, szigorú indítás előtti ellenőrzés.',
    examplePrompt:
      'Hozz létre egy prémium landing page-et, amely a design-taste-frontend elveit követi: következtesd ki a design-olvasatot, állítsd be a tárcsákat, kerüld az AI-slop mintákat, és adj ki egy kicsiszolt, reszponzív HTML-artifaktot.',
  },
  'design-taste-frontend-v1': {
    description:
      'Az eredeti v1 taste-skill, megőrizve azon projektek számára, amelyek a pontos viselkedésére építenek. A jelenlegi alapértelmezett a `design-taste-frontend` (v2 kísérleti), amely jelentős átírás. Ezt a v1 telepítési nevet csak akkor használd, ha pontos visszamenőleges kompatibilitásra van szükséged.',
    examplePrompt:
      'Hozz létre egy kicsiszolt marketingoldalt a design-taste-frontend-v1 használatával, erős tipográfiával, térközökkel, mozgással és sablonosság-ellenes védőkorlátokkal.',
  },
  'theme-factory': {
    description:
      'Professzionális betűtípus- és színtémák alkalmazása artifaktokra, beleértve a diákat, dokumentumokat, jelentéseket és HTML landing page-eket. 10 előre beállított témát szállít.',
    examplePrompt:
      'Professzionális betűtípus- és színtémák alkalmazása artifaktokra, beleértve a diákat, dokumentumokat, jelentéseket és HTML landing page-eket.',
  },
  'threejs': {
    description:
      'Three.js skillek 3D-elemek és interaktív élmények létrehozásához a böngészőben — jelenetek, anyagok, vezérlők és utófeldolgozás.',
    examplePrompt:
      'Three.js skillek 3D-elemek és interaktív élmények létrehozásához a böngészőben — jelenetek, anyagok, vezérlők és utófeldolgozás.',
  },
  'ui-skills': {
    description:
      'Határozott véleményt tükröző, folyamatosan fejlődő irányelvek, amelyek segítik az ügynököket a felületek építésében. Hasznos a kimenet koherenciájának megőrzéséhez számos kisebb UI-elem között.',
    examplePrompt:
      'Határozott véleményt tükröző, folyamatosan fejlődő irányelvek, amelyek segítik az ügynököket a felületek építésében.',
  },
  'ui-ux-pro-max': {
    description:
      'Csak katalógusos UI/UX Pro Max bejegyzés. A teljes upstream sablonok, adatok és keresési munkafolyamat nincs csomagolva az Open Designba.',
    examplePrompt:
      'Csak katalógusos UI/UX Pro Max bejegyzés.',
  },
  'venice-audio-music': {
    description:
      'Zenegenerálási sorba állítási, lekérési és befejezési végpontok a Venice.ai segítségével. Alkalmas jinglekhez, háttérhurkokhoz és prototípus-aláfestéshez.',
    examplePrompt:
      'Zenegenerálási sorba állítási, lekérési és befejezési végpontok a Venice.ai segítségével.',
  },
  'venice-audio-speech': {
    description:
      'Szövegfelolvasó modellek, hangok, formátumok és streaming a Venice.ai segítségével. Hasznos narrációhoz, hangalámondáshoz és társalgási ügynökhangokhoz.',
    examplePrompt:
      'Szövegfelolvasó modellek, hangok, formátumok és streaming a Venice.ai segítségével.',
  },
  'venice-image-edit': {
    description:
      'Képszerkesztés, felskálázás és háttéreltávolítás a Venice.ai API-n keresztül.',
    examplePrompt:
      'Képszerkesztés, felskálázás és háttéreltávolítás a Venice.ai API-n keresztül.',
  },
  'venice-image-generate': {
    description:
      'Képgenerálási végpontok és elérhető stílusok a Venice.ai API-n keresztül.',
    examplePrompt:
      'Képgenerálási végpontok és elérhető stílusok a Venice.ai API-n keresztül.',
  },
  'venice-video': {
    description:
      'Videógenerálási és átírási munkafolyamatok a Venice.ai API-n keresztül.',
    examplePrompt:
      'Videógenerálási és átírási munkafolyamatok a Venice.ai API-n keresztül.',
  },
  'vfx-text-cursor': {
    description:
      'Kurzor fénycsóva, kromatikus sugarak és irányított felvillanások szóról szóra történő idézetmegjelenítéshez a videóbevezetőkben.',
    examplePrompt:
      'Használd a VFX Text Cursor sablont, hogy a tartalmamat videóbevezető idézetmegjelenítéssé alakítsd kurzor fénycsóvákkal, kromatikus sugarakkal és irányított felvillanásokkal. Őrizd meg a sablon vizuális jegyeit, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'video-downloader': {
    description:
      'Videók letöltése a YouTube-ról és más platformokról offline megtekintéshez, szerkesztéshez vagy archiváláshoz, különféle formátumok és minőségi beállítások támogatásával.',
    examplePrompt:
      'Videók letöltése a YouTube-ról és más platformokról offline megtekintéshez, szerkesztéshez vagy archiváláshoz, különféle formátumok és minőségi beállítások támogatásával.',
  },
  'video-hyperframes': {
    description:
      'Hyperframes / Remotion-kompatibilis folyamatos képkockás animáció automatikus lejátszás támogatásával.',
    examplePrompt:
      'Használd a Hyperframes Video sablont, hogy a tartalmamat Hyperframes / Remotion-kompatibilis folyamatos képkockás animációvá alakítsd automatikus lejátszás támogatásával. Őrizd meg a sablon vizuális jegyeit, használj valós tartalmat és adatokat, és kerüld a lorem ipsumot vagy a helykitöltő képeket.',
  },
  'web-artifacts-builder': {
    description:
      'Összetett claude.ai HTML-artifactok építése React és Tailwind segítségével. Az Anthropic referencia-munkafolyamata gazdag, beágyazható artifactok szállításához.',
    examplePrompt:
      'Összetett claude.ai HTML-artifactok építése React és Tailwind segítségével.',
  },
  'web-design-guidelines': {
    description:
      'A Vercel mérnöki csapatának webdesign-irányelvei és -szabványai. Lefedi az elrendezést, a tipográfiát, a színeket, a mozgást és az akadálymentességet a termék-UI-hoz.',
    examplePrompt:
      'A Vercel mérnöki csapatának webdesign-irányelvei és -szabványai.',
  },
  'weread-year-in-review-video-template': {
    description:
      'WeRead által inspirált HyperFrames videósablon függőleges éves olvasási jelentésekhez,\nszemélyes olvasási irányítópultokhoz, könyvjegyzet-összefoglalókhoz és megosztható év-végi\ntörténetekhez. Akkor használd, ha a felhasználók 9:16-os HTML-MP4 olvasási jelentést szeretnének meleg papír-\ntextúrával, szerkesztői kínai tipográfiával, könyvoldal-metaforákkal, adatkiemelésekkel\nés determinisztikus mozgással.',
    examplePrompt:
      'Készíts WeRead-stílusú 9:16-os HyperFrames éves olvasási jelentésvideót 12 jelenettel, meleg papírtextúrával, könyvoldal-átmenetekkel, olvasási statisztikákkal, jegyzetekkel, kulcsszavakkal és egy záró olvasói karakterkártyával.',
  },
  'wpds': {
    description:
      'WordPress Design System. Alkalmazd a WordPress hivatalos design tokenjeit, tipográfiáját és komponensmintáit a témákra és webhelyekre.',
    examplePrompt:
      'WordPress Design System.',
  },
  'youtube-clipper': {
    description:
      'YouTube-klipek generálása és szerkesztése automatizált munkafolyamatokkal — forrásvideó behúzása, kiemelések kivágása, feliratok hozzáadása és exportálás.',
    examplePrompt:
      'YouTube-klipek generálása és szerkesztése automatizált munkafolyamatokkal — forrásvideó behúzása, kiemelések kivágása, feliratok hozzáadása és exportálás.',
  },
};

export const HU_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Társalgási, AI-központú felület minimális vezérlőkkel, világos eredményekkel és delegált feladatfolyamatokkal az ügynökalapú munkafolyamatokhoz.',
  'airbnb': 'Utazási piactér. Meleg korall kiemelőszín, fotózás-vezérelt, lekerekített UI.',
  'airtable': 'Táblázat-adatbázis hibrid. Színes, barátságos, strukturált adatesztétika.',
  'ant': 'Strukturált, vállalati fókuszú designrendszer, amely a tisztaságot, a következetességet és a hatékonyságot helyezi előtérbe az adatsűrű webalkalmazásokhoz.',
  'apple': 'Szórakoztató elektronika. Prémium üres terek, SF Pro, filmszerű képi világ.',
  'application': 'Alkalmazás-irányítópult lila témájú esztétikával, felső sávos navigációval, kártyaalapú elrendezésekkel és fejlesztőközpontú munkafolyamatokkal.',
  'arc': '„A böngésző, amely helyetted böngészik.” Áttetsző felületek, színátmenetes melegség, oldalsáv-központú elrendezés.',
  'artistic': 'Nagy kontrasztú, expresszív stílus kreatív tipográfiával és merész színválasztással a vizuálisan feltűnő felületekhez.',
  'atelier-zero': 'Magazinszínvonalú, kollázs-vezérelt vizuális rendszer: meleg papírvászon, szürreális\nvakolat-és-építészet képi világ, túlméretezett kijelzőbetűtípus, hajszálvékony vonalak,\nrómai számos szakaszjelölők és apró szerkesztői jegyzetek.\nA produkciós v ihlette',
  'bento': 'Moduláris rácselrendezés kártyaszerű blokkokkal, világos hierarchiával, lágy térközökkel és finom vizuális kontraszttal a rendezett, átfutható felületekhez.',
  'binance': 'Kriptotőzsde. Élénk sárga kiemelés monokróm alapon, tőzsdei sürgősség.',
  'bmw': 'Luxusautók. Sötét, prémium felületek, precíz német mérnöki esztétika.',
  'bmw-m': 'Motorsport teljesítmény-almárka. Szinte fekete pilótafülke-felületek, BMW M tricolor kiemelések, éles mérnöki geometria.',
  'bold': 'Erős vizuális jelenlét nagy súlyú tipográfiával, nagy kontrasztú színekkel és parancsoló elrendezésekkel.',
  'brutalism': 'Nyers, antidizájn esztétika, amelyet a betonépítészet inspirált, dísztelen elemekkel, zavarba ejtő elrendezésekkel és funkcionális minimalizmussal.',
  'bugatti': 'Hiperautó-márka. Mozifekete vászon, monokróm szigorúság, monumentális kijelzőtípus.',
  'cafe': 'Hangulatos, kávézó által inspirált felület meleg tónusokkal, lágy tipográfiával és letisztult elrendezésekkel a nyugodt böngészéshez.',
  'cal': 'Nyílt forráskódú időpontfoglalás. Letisztult, semleges felület, fejlesztőközpontú egyszerűség.',
  'canva': 'Vizuális alkotóplatform. Élénk lila-kék színátmenet, bőséges térközök, barátságos geometria.',
  'cisco': 'Vállalati infrastruktúra-márka. Sötét, bizalmat keltő felületek, Cisco Blue jelzés, technikai letisztultság.',
  'claude': 'Az Anthropic AI-asszisztense. Meleg terrakotta kiemelés, letisztult szerkesztői elrendezés.',
  'clay': 'Kreatívügynökség. Organikus formák, lágy színátmenetek, művészi rendezésű elrendezés.',
  'claymorphism': 'Lágy, lekerekített, 3D-szerű formák, amelyek a formálható agyagot idézik, játékos, pufók elemekkel és színes felületekkel.',
  'clean': 'Egyszerűségre összpontosító dizájn bőséges üres terekkel, jól olvasható tipográfiával és korlátozott színpalettával a vizuális zsúfoltság csökkentésére.',
  'clickhouse': 'Gyors analitikai adatbázis. Sárga kiemelésű, technikai dokumentációs stílus.',
  'cohere': 'Vállalati AI-platform. Élénk színátmenetek, adatgazdag irányítópult-esztétika.',
  'coinbase': 'Kriptotőzsde. Letisztult kék arculat, bizalomközpontú, intézményi érzet.',
  'colorful': 'Élénk, nagy kontrasztú paletták és színátmenetek a magával ragadó, emlékezetes és modern felhasználói élményért.',
  'composio': 'Eszközintegrációs platform. Modern sötét stílus színes integrációs ikonokkal.',
  'contemporary': 'Korunk minimalista dizájnja bento rácsokkal, sötét mód támogatásával és nagy teljesítményű, akadálymentes elrendezésekkel.',
  'corporate': 'Professzionális, márkához igazodó dizájn strukturált rácsokkal, minimalista elrendezésekkel és következetes vállalati mintázatokkal.',
  'cosmic': 'Futurisztikus sci-fi esztétika sötét témákkal, élénk neon kiemelésekkel és magával ragadó térbeli elemekkel.',
  'creative': 'Játékos, karakterközpontú dizájn kifejező tipográfiával és merész grafikákkal landing oldalakhoz és kreatív projektekhez.',
  'cursor': 'AI-központú kódszerkesztő. Elegáns sötét felület, színátmenetes kiemelések.',
  'dashboard': 'Sötét témájú felhőplatform-esztétika moduláris rácsokkal, üvegszerű panelekkel és erős adathierarchiával produktivitási irányítópultokhoz.',
  'default': 'Letisztult, termékközpontú alapérték B2B eszközökhöz, irányítópultokhoz és segédoldalakhoz.',
  'discord': 'Hang- / csevegőplatform. Mély kékeslila, sötét alapú felületek, játékos kiemelési pillanatok.',
  'dithered': 'Pontmintázatos megjelenítési technika, amely korlátozott palettával szimulálja az árnyalatokat nosztalgikus, retró, nagy kontrasztú vizuális hatás érdekében.',
  'doodle': 'Kézzel rajzolt, vázlatszerű stílus firkákkal, kézírásos betűtípusokkal és tökéletlen vonalakkal a játékos, kötetlen érzetért.',
  'dramatic': 'Nagy kontrasztú, teátrális dizájn merész elrendezésekkel, magával ragadó vizuális megoldásokkal és figyelmet követelő, szokatlan kompozíciókkal.',
  'duolingo': 'Nyelvtanuló platform. Élénk bagolyzöld, vaskos árnyékok, gamifikált öröm.',
  'editorial': 'Magazin által inspirált szerkesztői elrendezés kifinomult serif tipográfiával, strukturált rácsokkal és elegáns olvasási élménnyel.',
  'elegant': 'Kecses, kifinomult esztétika finom tipográfiával, minimalista palettákkal és csiszolt elrendezésekkel, amelyek eleganciát sugároznak.',
  'elevenlabs': 'AI-hangplatform. Sötét, filmes felület, hanghullám-esztétika.',
  'energetic': 'Dinamikus, élénk stílus vastag keretekkel, geometrikus formákkal, nagy kontrasztú színekkel és kifejező tipográfiával, amely mozgást és életerőt közvetít.',
  'enterprise': 'Letisztult, nagy kontrasztú vállalati dizájn adatvezérelt munkafolyamatokhoz, intuitív fogd és vidd mintázatokkal és strukturált elrendezésekkel.',
  'expo': 'React Native platform. Sötét téma, szoros betűközök, kódközpontú.',
  'expressive': 'Élénk, egyéniségközpontú dizájn merész színekkel, játékos grafikákkal és dinamikus elrendezésekkel, amelyek egyensúlyban tartják a kreativitást és a struktúrát.',
  'fantasy': 'Játék által inspirált fantasy esztétika merész, prémium vizuális megoldásokkal, gazdag színpalettákkal és magával ragadó tematikus elemekkel.',
  'ferrari': 'Luxusautók. Chiaroscuro szerkesztői stílus, Ferrari Red kiemelések, filmes fekete.',
  'figma': 'Kollaboratív tervezőeszköz. Élénk, többszínű, játékos, mégis profi.',
  'flat': 'Kétdimenziós minimalista stílus élénk színekkel, letiszta tipográfiával és 3D-effektek nélkül a gyors, felhasználóbarát felületekért.',
  'framer': 'Weboldal-szerkesztő. Bátor fekete és kék, mozgásközpontú, dizájnvezérelt.',
  'friendly': 'Megközelíthető, intuitív dizájn lekerekített elemekkel, bőséges üres hellyel és lágy pasztell színpalettákkal.',
  'futuristic': 'Előretekintő dizájn tech-ihlette tipográfiával, modern elrendezésekkel és elegáns, innovációvezérelt esztétikával.',
  'github': 'Kódközpontú platform. Funkcionális sűrűség, kék-fehér precizitás, Primer alapok.',
  'glassmorphism': 'Matt üveg hatás áttetsző rétegekkel, finom elmosással és világító szegélyekkel a mélységért és a modern eleganciáért.',
  'gradient': 'Sima színátmenetek és gradiensgazdag felületek a modern, játékos, vizuális mélységű felületekért.',
  'hashicorp': 'Infrastruktúra-automatizálás. Vállalati tisztaság, fekete-fehér.',
  'hud': 'Vadászgép / helikopter HUD-kijelzője. Foszforzöld közel feketén, csupa nagybetűs adatrétegek, szögletes geometria. Nulla kétértelműség nagy sebességnél és magasságban.',
  'huggingface': 'ML-közösségi központ. Napsárga kiemelés, monospace identitás, vidám és sűrű.',
  'ibm': 'Vállalati technológia. Carbon dizájnrendszer, strukturált kék paletta.',
  'intercom': 'Ügyfél-üzenetküldés. Barátságos kék paletta, társalgó UI-minták.',
  'kami': 'Szerkesztőségi papírrendszer: meleg pergamenvászon, tintakék kiemelés, talpas betűs hierarchia. Önéletrajzokhoz, egyoldalas összefoglalókhoz, white paperekhez, portfóliókhoz, diasorozatokhoz készült — bármihez, aminek minőségi nyomatnak kell éreznie magát, nem UI-nak. Alapból többnyelvű.',
  'kraken': 'Kriptokereskedés. Lilás kiemelésű sötét UI, adatsűrű irányítópultok.',
  'lamborghini': 'Szuperautó-márka. Valódi fekete felületek, arany kiemelések, drámai nagybetűs tipográfia.',
  'levels': 'Konverzióközpontú dizájn, amely megszünteti a súrlódást, és a felhasználókat világossággal, bizalommal és gyorsasággal tereli a cselekvés felé.',
  'linear-app': 'Projektmenedzsment. Ultraminimalista, precíz, lila kiemelés.',
  'lingo': 'Játékos, minimalista dizájn élénk színekkel, lekerekített formákkal, tapintható 3D-szegélyekkel és barátságos illusztrációkkal a megközelíthető felületekért.',
  'loom': 'Loom aszinkron videó. Lila elsődleges szín, barátságos felületek, videóközpontú elrendezés. Tiszta és profi anélkül, hogy vállalatias lenne.',
  'lovable': 'AI full-stack építő. Játékos gradiensek, barátságos fejlesztői esztétika.',
  'luxury': 'Csúcskategóriás sötét esztétika bátor címsorokkal, monokróm palettával és prémium érzettel a luxusmárka-élményekhez.',
  'mastercard': 'Globális fizetési hálózat. Meleg krémszínű vászon, orbitális pirula formák, szerkesztőségi melegség.',
  'material': 'A Google Material Designja rétegezett felületekkel, dinamikus témázással, beépített mozgással és reszponzív, platformfüggetlen mintákkal.',
  'meta': 'Tech-üzlet. Fotóközpontú, bináris világos/sötét felületek, Meta Blue CTA-gombok.',
  'minimal': 'Letisztult dizájn, amely az üres helyet, a tiszta tipográfiát és a visszafogott színeket hangsúlyozza a maximális világosságért és fókuszért.',
  'minimax': 'AI-modellszolgáltató. Bátor sötét felület neon kiemelésekkel.',
  'mintlify': 'Dokumentációs platform. Tiszta, zöld kiemelésű, olvasásra optimalizált.',
  'miro': 'Vizuális együttműködés. Élénksárga kiemelés, végtelen vászon esztétika.',
  'mission-control': 'Űr-/repülőgépipari küldetésfigyelés. Sötét parancsnoki központ, borostyánszínű telemetria, monospace precizitás. Mindenekelőtt funkcionális világosság.',
  'mistral-ai': 'Nyílt súlyú LLM-szolgáltató. Francia mérnöki minimalizmus, lilás tónusú.',
  'modern': 'Kortárs szerkesztőségi stílus talpas betűs tipográfiával, minimalista palettákkal és tiszta elrendezésekkel a kifinomult digitális termékekhez.',
  'mongodb': 'Dokumentum-adatbázis. Zöld levél márkajelzés, fejlesztői dokumentációra fókuszálva.',
  'mono': 'Monospace-vezérelt, mátrix-ihlette dizájn nagy kontrasztú elemekkel, kompakt sűrűséggel és hacker-sikkes esztétikával.',
  'neobrutalism': 'A brutalizmus modern értelmezése bátor szegélyekkel, élénk kiemelőszínekkel és nyers, nagy kontrasztú elrendezésekkel meleg felületeken.',
  'neon': 'Elektromos neonfény-effektek nagy kontrasztú színpárosításokkal a bátor, figyelemfelkeltő felületekért.',
  'neumorphism': 'Lágy, kiemelkedő UI-elemek belső és külső árnyékokkal monokróm felületeken a tapintható, beágyazott megjelenésért.',
  'nike': 'Sportos kiskereskedelem. Monokróm UI, hatalmas nagybetűs szedés, teljes felületű fotózás.',
  'notion': 'Mindent egyben munkaterület. Meleg minimalizmus, talpas betűs címsorok, lágy felületek.',
  'nvidia': 'GPU-számítástechnika. Zöld-fekete energia, technikai erő esztétika.',
  'ollama': 'LLM-ek futtatása helyben. Terminál-központú, monokróm egyszerűség.',
  'openai': 'Nyugodt, közel monokróm rendszer, mély teal-feketére alapozva, bőséges fehér térrel és szerkesztőségi tipográfiával.',
  'opencode-ai': 'AI kódolási platform. Fejlesztőközpontú sötét téma.',
  'pacman': 'Retró arcade-ihlette dizájn pixel betűtípusokkal, pontozott szegélyekkel, játékos, nagy kontrasztú színekkel és 8 bites játékesztétikával.',
  'paper': 'Papírtextúrás, nyomtatás-ihlette dizájn minimális színekkel, letisztult serif/sans tipográfiával és tapintható felületi minőséggel.',
  'perplexity': 'Társalgási AI keresőmotor. Mélysötét vászon, éles tipográfia, egyetlen ibolya akcentus, sűrű információs hierarchia.',
  'perspective': 'Térbeli mélységet adó dizájn izometrikus nézetekkel, enyészpontokkal és rétegzett elemekkel, amelyek 3D-szerű realizmussal terelik a figyelmet.',
  'pinterest': 'Vizuális felfedezés. Vörös akcentus, masonry rács, kép-központú.',
  'playstation': 'Játékkonzol-kiskereskedelem. Háromfelületes csatorna-elrendezés, csendes-tekintélyű kijelző-betűtípus, ciánkék hover-nagyítás.',
  'posthog': 'Termékanalitika. Játékos sünmárka, fejlesztőbarát sötét felület.',
  'premium': 'Apple-ihlette prémium esztétika precíz térközökkel, modern tipográfiával és kifinomult, csiszolt vizuális nyelvezettel.',
  'professional': 'Csiszolt, üzletre kész dizájn modern tipográfiával, strukturált elrendezésekkel és megbízható vizuális identitással.',
  'publication': 'Nyomtatás-ihlette vizuális nyelvezet könyvekhez, magazinokhoz és jelentésekhez, szerkesztőségi rácsokkal és kifejező tipográfiával.',
  'raycast': 'Produktivitási indító. Elegáns sötét króm, élénk színátmenetes akcentusok.',
  'refined': 'Gondosan válogatott, modern minimál stílus elegáns serif tipográfiával és visszafogott, kifinomult palettákkal.',
  'renault': 'Francia autóipar. Élénk aurora színátmenetek, NouvelR tipográfia, merész energia.',
  'replicate': 'ML-modellek futtatása API-n keresztül. Tiszta fehér vászon, kód-központú.',
  'resend': 'Email API. Minimál sötét téma, monospace akcentusok.',
  'retro': 'Retró dizájn vintage-ihlette tipográfiával, nagy kontrasztú retró palettákkal és nosztalgikus vizuális elemekkel.',
  'revolut': 'Digitális banki szolgáltatás. Elegáns sötét felület, színátmenetes kártyák, fintech precizitás.',
  'runwayml': 'AI videógenerálás. Filmszerű sötét felület, médiagazdag elrendezés.',
  'sanity': 'Headless CMS. Vörös akcentus, tartalom-központú szerkesztőségi elrendezés.',
  'sentry': 'Hibamonitorozás. Sötét műszerfal, adatsűrű, rózsaszín-lila akcentus.',
  'shadcn': 'Shadcn/ui-ihlette dizájn minimális, letisztult komponensekkel, monokróm palettával és utility-first mintázatokkal.',
  'shopify': 'E-kereskedelmi platform. Sötét-központú filmszerűség, neonzöld akcentus, ultravékony betűtípus.',
  'simple': 'Egyszerű, dísztelen dizájn letisztult tipográfiával, semleges színekkel és intuitív elrendezésekkel, amelyek nem állnak az útba.',
  'skeumorphism': 'A valós világ utánzása texturált felületekkel, 3D-effektekkel és ismerős fizikai metaforákkal az intuitív digitális felületekért.',
  'slack': 'Munkahelyi kommunikációs platform. Padlizsán-elsődleges, többakcentusos logópaletta, világos felületek sötét oldalsávval, meleg és barátságos.',
  'sleek': 'Modern minimalista esztétika tiszta vonalakkal, tudatos színpalettával, finom interakciókkal és következetes térközökkel.',
  'spacex': 'Űrtechnológia. Rideg fekete-fehér, teljes felületet kitöltő képek, futurisztikus.',
  'spacious': 'Bőséges fehér tér, következetes belső térköz és rácsalapú elrendezések a tiszta, olvasható és lélegző felületekért.',
  'spotify': 'Zenei streaming. Élénk zöld sötét háttéren, merész betűtípus, albumborító-vezérelt.',
  'starbucks': 'Globális kávé-kiskereskedelmi márka. Négyszintű zöld rendszer, meleg krémszínű vászon, teljesen lekerekített gombok.',
  'storytelling': 'Narratíva-vezérelt dizájn, amely vizuális elemekkel, szöveggel és interakcióval vezeti a felhasználókat magával ragadó, érzelmileg rezonáló utakon.',
  'stripe': 'Fizetési infrastruktúra. Jellegzetes lila színátmenetek, weight-300 elegancia.',
  'supabase': 'Nyílt forráskódú Firebase alternatíva. Sötét smaragd téma, kód-központú.',
  'superhuman': 'Gyors email kliens. Prémium sötét felület, billentyűzet-központú, lila ragyogás.',
  'tesla': 'Elektromos autóipar. Radikális elhagyás, teljes nézőteret kitöltő fotók, közel nulla felület.',
  'tetris': 'Klasszikus blokkjáték-ihlette dizájn játékos színekkel, merész kijelző-betűtípusokkal és kompakt, energikus elrendezésekkel.',
  'theverge': 'Tech szerkesztőségi média. Sav-menta és ultraibolya akcentusok, Manuka kijelző-betűtípus, rave-szórólap stílusú történet-csempék.',
  'together-ai': 'Nyílt forráskódú AI-infrastruktúra. Technikai, tervrajz-stílusú dizájn.',
  'totality-festival': 'Kozmikus-prémium, glassmorf sötét rendszer, amely megragadja a napfogyatkozás zsigeri áhítatát — obszidián felületek, borostyánsárga "korona" kiemelések és cián atmoszférikus hangsúlyok.',
  'trading-terminal': 'Bloomberg-stílusú pénzügyi kereskedési terminál. Csak sötét, adatsűrű, cián/korall vételi/eladási jelzések. Minden olvasható egy pillantásra két méterről.',
  'uber': 'Mobilitási platform. Erőteljes fekete-fehér, feszes tipográfia, városi energia.',
  'urdu': 'Urdu-elsődleges digitális élmények natív RTL-támogatással, Nastaliq tipográfiával és kétnyelvű harmóniával.',
  'vercel': 'Frontend telepítés. Fekete-fehér precizitás, Geist betűtípus.',
  'vibrant': 'Élénk, színes dizájn merész, játékos tipográfiával, meleg hangsúlyokkal és dinamikus vizuális energiával.',
  'vintage': 'Az 1950-1990-es évek nosztalgiája szkeuomorf elemekkel, szemcsés textúrákkal, retró színpalettákkal és pixel-stílusú tipográfiával.',
  'vodafone': 'Globális telekommunikációs márka. Monumentális nagybetűs kijelző, Vodafone Red fejezetsávok.',
  'voltagent': 'AI-ügynök keretrendszer. Mély fekete vászon, smaragd hangsúly, terminál-natív.',
  'warm-editorial': 'Serif-vezérelt magazin esztétika. Terrakotta hangsúly meleg törtfehér papíron —\nideális hosszú formátumú, szerkesztőségi és márka-vezérelt marketingoldalakhoz.',
  'warp': 'Modern terminál. Sötét, IDE-szerű felület, blokk-alapú parancs UI.',
  'webex': 'Együttműködési platform. Lendületes tipográfia, kék akciórendszer, többfelhasználós hangsúlyspektrum.',
  'webflow': 'Vizuális webépítő. Kék hangsúlyú, kifinomult marketingoldal-esztétika.',
  'wechat': 'Márka vizuális nyelv WeChat mini programokhoz, hivatalos fiókokhoz és nyílt ökoszisztéma-bővítményekhez.',
  'wired': 'Tech magazin. Papírfehér broadsheet sűrűség, egyedi serif kijelző, monospace felvezetők, tintakék hivatkozások.',
  'wise': 'Pénzátutalás. Élénkzöld hangsúly, barátságos és érthető.',
  'x-ai': 'Elon Musk AI-laborja. Rideg monokróm, futurisztikus minimalizmus.',
  'xiaohongshu': 'Életstílus UGC közösségi platform. Egyetlen márkavörös, bőséges lekerekítés, tartalom-első.',
  'zapier': 'Automatizálási platform. Meleg narancs, barátságos, illusztráció-vezérelt.',
};

export const HU_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'AI és LLM',
  'Automotive': 'Autóipar',
  'Backend & Data': 'Backend és adat',
  'Bold & Expressive': 'Merész és kifejező',
  'Creative & Artistic': 'Kreatív és művészi',
  'Design & Creative': 'Dizájn és kreatív',
  'Developer Tools': 'Fejlesztői eszközök',
  'E-Commerce & Retail': 'E-kereskedelem és kiskereskedelem',
  'Editorial & Print': 'Szerkesztőségi és nyomtatott',
  'Editorial / Personal / Publication': 'Szerkesztőségi / Személyes / Publikáció',
  'Editorial · Studio': 'Szerkesztőségi · Stúdió',
  'Fintech & Crypto': 'Fintech és kripto',
  'Layout & Structure': 'Elrendezés és struktúra',
  'Media & Consumer': 'Média és fogyasztói',
  'Modern & Minimal': 'Modern és minimál',
  'Morphism & Effects': 'Morfizmus és effektek',
  'Productivity & SaaS': 'Produktivitás és SaaS',
  'Professional & Corporate': 'Professzionális és vállalati',
  'Retro & Nostalgic': 'Retró és nosztalgikus',
  'Social & Messaging': 'Közösségi és üzenetküldés',
  'Starter': 'Kezdő',
  'Themed & Unique': 'Tematikus és egyedi',
};

export const HU_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Reklám',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'App- / webdesign',
  'Branding': 'Márkaépítés',
  'Cinematic': 'Filmes',
  'Data': 'Adatok',
  'Game UI': 'Játék-UI',
  'General': 'Általános',
  'Illustration': 'Illusztráció',
  'Infographic': 'Infografika',
  'Live Artifact': 'Élő artefakt',
  'Marketing': 'Marketing',
  'Motion Graphics': 'Mozgógrafika',
  'Product': 'Termék',
  'Profile / Avatar': 'Profil / Avatar',
  'Short Form': 'Rövid formátum',
  'Social / Meme': 'Közösségi / Mém',
  'Social Media Post': 'Közösségi média bejegyzés',
  'Travel': 'Utazás',
  'VFX / Fantasy': 'VFX / Fantasy',
  'VFX / HTML-in-Canvas': 'VFX / HTML-in-Canvas',
};

export const HU_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': '3d-render',
  'action': 'akció',
  'ancient-china': 'ókori Kína',
  'anime': 'anime',
  'app-showcase': 'app-bemutató',
  'archery': 'íjászat',
  'arpg': 'arpg',
  'audio-reactive': 'hangra reagáló',
  'boss-fight': 'bossharc',
  'brand': 'márka',
  'branding': 'márkaépítés',
  'captions': 'feliratok',
  'cavalry': 'lovasság',
  'chart': 'diagram',
  'childlike': 'gyermeki',
  'choreography': 'koreográfia',
  'cinematic': 'filmes',
  'cinematic-romance': 'filmes-romantika',
  'combat': 'harc',
  'combo': 'kombó',
  'companion-to-image': 'kísérő-képpé',
  'counter': 'számláló',
  'crayon': 'zsírkréta',
  'cyberpunk': 'cyberpunk',
  'dance': 'tánc',
  'dashboard': 'irányítópult',
  'data': 'adat',
  'data-viz': 'adatvizualizáció',
  'destruction': 'pusztítás',
  'displacement': 'elmozdulás',
  'editorial': 'szerkesztőségi',
  'elden-ring': 'elden-ring',
  'endcard': 'zárókártya',
  'escort': 'kíséret',
  'escort-mission': 'kísérő-küldetés',
  'fantasy': 'fantasy',
  'fashion': 'divat',
  'fighting-game': 'verekedős-játék',
  'food': 'étel',
  'game-cinematic': 'játék-filmbetét',
  'game-ui': 'játék-UI',
  'grid-sheet': 'rácslap',
  'guanyu': 'guanyu',
  'hand-drawn': 'kézzel-rajzolt',
  'hero': 'hős',
  'html-in-canvas': 'html-a-vásznon',
  'hud': 'hud',
  'hud-safe': 'hud-biztos',
  'hype': 'hype',
  'hyperframes': 'hyperframes',
  'idol': 'idol',
  'illustration': 'illusztráció',
  'image-to-image': 'képből-képpé',
  'infographic': 'infografika',
  'iphone': 'iphone',
  'japanese': 'japán',
  'karaoke': 'karaoke',
  'key-visual': 'kulcsvizuál',
  'keynote': 'keynote',
  'kinetic-typography': 'kinetikus tipográfia',
  'linear-style': 'Linear-stílus',
  'liquid': 'folyékony',
  'liquid-glass': 'folyékony üveg',
  'live-artifact': 'élő artifact',
  'logo': 'logó',
  'lyubu': 'lyubu',
  'macbook': 'MacBook',
  'magnetic': 'mágneses',
  'map': 'térkép',
  'marketing': 'marketing',
  'minimal': 'minimál',
  'mmo': 'mmo',
  'mobile': 'mobil',
  'money': 'pénz',
  'mounted-combat': 'lovas harc',
  'nature': 'természet',
  'open-world': 'nyílt világ',
  'otaku-dance': 'otaku tánc',
  'outro': 'outro',
  'overlay': 'overlay',
  'particles': 'részecskék',
  'pipeline': 'pipeline',
  'portal': 'portál',
  'portrait': 'portré',
  'pose-reference': 'póz-referencia',
  'product': 'termék',
  'product-demo': 'termékdemó',
  'product-promo': 'termékpromó',
  'rework': 'átdolgozás',
  'route': 'útvonal',
  'saas': 'saas',
  'sequence': 'szekvencia',
  'shader': 'shader',
  'shatter': 'szétzúzás',
  'sizzle': 'sizzle',
  'social': 'közösségi',
  'storyboard': 'forgatókönyv',
  'street-fighter': 'street-fighter',
  'style-transfer': 'stílusátvitel',
  'tekken': 'tekken',
  'text': 'szöveg',
  'three-kingdoms': 'három-királyság',
  'tiktok': 'tiktok',
  'title-card': 'címkártya',
  'transform': 'átalakítás',
  'travel': 'utazás',
  'tts': 'tts',
  'typography': 'tipográfia',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'függőleges',
  'video-reference': 'videó-referencia',
  'vs-screen': 'vs-képernyő',
  'webgl': 'webgl',
  'website-to-video': 'weboldalból-videó',
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const HU_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: '3D kőlépcső evolúciós infografika',
    summary:
      'Egy lapos evolúciós idővonalat valósághű 3D kőlépcsős infografikává alakít, részletes organizmus-renderekkel és strukturált oldalsó panelekkel.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Anime harcművészeti csata illusztráció',
    summary:
      'Dinamikus, nagy hatású anime illusztrációt készít két női karakterről, akik egy hagyományos dódzsóban harcolnak elemi energiahatásokkal.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'E-kereskedelmi élő közvetítés UI makett',
    summary:
      'Valósághű közösségimédia-élőközvetítés felületet készít egy portré fölé helyezve, testreszabható chatüzenetekkel, ajándék-felugró ablakokkal és termékvásárlási kártyával.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Játék-képernyőkép - Anime harci játék: Ryuuga kapitány vs Kaze Renshin',
    summary:
      'Egy játékon belüli harci játék kulcsvizuál / harci képernyőkép a Street Fighter 6 vagy Tekken 8 intró-grafikájának stílusában. Két anime-stílusú férfi harcos áll szembe egymással egy drámai, éjszakai kínai templomudvar közepén — bal oldalon egy meztelen felsőtestű, szalmakalapos kalóz meleg narancsvörös tűzaurával, jobb oldalon pedig egy tüskés hajú, narancssárga gi-t viselő harcművész, aki egy hatalmas, sercegő kék villámenergia-gömböt tölt. Komplett harci-játék HUD-dal érkezik (dupla életcsíkok, kör-időzítő, P1/P2 portrépanelek megnevezett harcosokkal és emblémákkal, oldalankénti kombó-számlálók és max-mérők). A meleg-narancs vs hideg-kék osztott színkorrekció a műfaj rivális-harcos konvencióját idézi. gpt-image-2-re hangolva, 16:9 arányban.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Játék-képernyőkép - Három királyság ARPG: Guan Yu lekaszabolja Yan Liangot',
    summary:
      'Egy játékon belüli akció-RPG képernyőkép az ikonikus Három királyság jelenetről, ahol Guan Yu a Vörös Nyúl harci ménjén lovagol át egy zuhogó esőben álló csatamezőn, és az ellenséges generális, Yan Liang felé vágtat. A Black Myth: Wukong filmes, fotórealisztikus stílusában renderelve, Unreal Engine 5, harmadik személyű követő kamera a lovagló hős mögül és balról. A teljes boss-harc HUD (portré, minitérkép sűrű ellenségpontokkal, képesség-gyorssáv befejező-mozdulat felszólítással, lebegő boss-életcsík az ellenséges generálison) AAA ARPG harci pillanattá teszi a jelenetet. gpt-image-2-re hangolva, 16:9 arányban.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Játék-képernyőkép - Három királyság ARPG: Lü Bu yuanmeni íjászata',
    summary:
      'Egy játékon belüli akció-RPG képernyőkép a híres Három királyság jelenetről, ahol Lü Bu lelő egy távoli alabárdot a tábor kapujánál, hogy megállítson egy csatát. A Black Myth: Wukong filmes, fotórealisztikus stílusában renderelve, Unreal Engine 5 Nanite/Lumen, harmadik személyű váll fölötti játékkamera. A teljes játékon belüli HUD-réteg (élet- + qi-csíkok, minitérkép, képesség-gyorssáv, célzárolás-jelölő a távoli alabárdig mért távolság-kijelzéssel) valódi, új generációs ARPG-felvétellé teszi, nem pedig átvezető jelenetté. gpt-image-2-re hangolva, 16:9 arányban.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Játék-képernyőkép - Három királyság ARPG: Zhao Yun menekülése a csecsemővel Changbanpónál',
    summary:
      'Egy játékon belüli akció-RPG képernyőkép a legendás Három királyság jelenetről, ahol Zhao Yun fél karjával a csecsemő Liu Chant öleli, a másikban lándzsával harcolja át magát az ellenséges vonalakon Changbanpónál. A Black Myth: Wukong és az Elden Ring filmes, fotórealisztikus stílusának ötvözetében renderelve, Unreal Engine 5-tel, teljes Nanite-tal, Lumen sugárkövetéssel és volumetrikus fénynyalábokkal. Az érzelmi mag — az egyik kar a pólyás csecsemőt védi, a másik az életért harcol — egy teljes HUD-réteggel erősödik, amely tartalmaz egy dedikált KÍSÉRET védelmi csíkot a babának, egy kombó-számlálót és levegőben lebegő sebzésszám-felugrásokat az elhajított ellenségeken. gpt-image-2-re hangolva, 16:9 arányban.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Játék UI - Ókori Kína nyílt világú MMO HUD',
    summary:
      'Egy AAA ókori kínai nyílt világú MMO játékon belüli HUD-képernyőkép makettjét készíti el, a Black Myth: Wukong filmes, fotórealisztikus stílusában. Egy gyönyörű női kardforgató főhős horgonyozza le a kép közepét egy ködös hegyi, ősi szentélyt ábrázoló jelenetben, amelyet teljes MMO HUD vesz körül: bal felül karakterportré HP/MP/állóképesség-csíkokkal és buff-ikonokkal, alul-középen képesség-gyorssáv kínai kalligráfia képesség-ikonokkal, jobb felül minitérkép küldetésjelölőkkel, jobb oldalon küldetéskövető panel, bal alul görgethető chatablak, lebegő, világtérbeli NPC-névtáblák és küldetés-felkiáltójel. Valósághű monitor-képernyőképként renderelve, 16:9, alkalmas pitch deckekhez, gamescom-stílusú kulcsgrafikákhoz, valamint Xiaohongshu/bilibili játék-előzetesekhez.',
  },
  'illustrated-city-food-map': {
    title: 'Illusztrált városi gasztrotérkép',
    summary:
      'Kézzel rajzolt, akvarell stílusú turistatérképet készít, amely számozott helyi gasztronómiai különlegességeket, nevezetességeket és jelmagyarázatot tartalmaz.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Illusztráció - Zsírkréta gyerekrajz átdolgozás',
    summary:
      'Stílusátviteli prompt, amely bármilyen referenciaképet (termékfotó, képernyőkép, portré, UI-makett) kézzel rajzolt zsírkrétás illusztrációvá alakít, amely olyan, mintha egy 10 éves gyerek készítette volna. Az eredeti palettát élénk, játékos zsírkrétaszínekre cseréli tiszta fehér papíron, és gyermeki szeszélyt szór bele — kastélyok, cukorkák, csillagok, felhők, szivárványok —, hogy felerősítse az ártatlan mesekönyv-hangulatot. Image-to-image szerkesztésként működik a GPT-image-2-ben (a prompt mellé referenciakép feltöltése szükséges); kiválóan alkalmas weboldal-képernyőképekhez, brand key arthoz, termékfotókhoz és portrékhoz.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'Infografika - Otaku tánckoreográfia bontása (Gokuraku Jodo, 16 panel)',
    summary:
      'Egyetlen függőleges 2:3 arányú poszter, amely 16 összekapcsolt négyzet alakú panelből álló 4×4-es rácsként épül fel, és teljes koreográfiabontási diagramot alkot a híres japán otaku tánczenéhez, a 極楽浄土-hoz (Gokuraku Jodo). Minden panelen ugyanaz az aranyos, félig realisztikus anime idol lány (rózsaszín copfok, matrózgalléros iskolás-idol egyenruha) látható egész alakos formában, ahogy a tánc egy-egy jellegzetes pózát mutatja be, pasztellrózsaszín háttér előtt, alul egy kis japán feliratcsíkkal és bal felül egy számozott körrel. Kifejezetten PÓZ-REFERENCIA lapként tervezve AI-videógeneráláshoz — minden sziluett éles és egyértelmű, nincsenek mozgásvonalak vagy háttérzaj. A gpt-image-2-höz hangolva, 2:3 arányban. Kategória: Infografika.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Momotaro magyarázó dia hibrid stílusban',
    summary:
      'Egy prompt, amely az Irasutoya illusztrációk egyszerű, meleg esztétikáját ötvözi a japán kormányzati diákra jellemző magas információsűrűséggel.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Notion-stílusú csapat-irányítópult (élő artifact)',
    summary:
      'Egyetlen képernyős, Notion-natív csapat-irányítópult makett — KPI-rács, 7 napos sparkline, tevékenységfolyam és összekapcsolt adatbázisú feladattáblázat. Vizuális kiegészítő az élő artifact képességhez; párosítsd vele frissíthető / konnektoros futtatásokhoz, vagy használd önállóan állókép-makettként.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profil / Avatar - Anime lányból filmszerű fotó',
    summary:
      'Ez a prompt egy karakter-referenciaillusztrációt realisztikus, melegtónusú vintage belső térben készült portrévá alakít, miközben megőrzi az eredeti öltözéket, pózt és macskát.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profil / Avatar - Hétköznapi divat rács-fotózás',
    summary:
      'Strukturált JSON-prompt egy hétköznapi divatfotózás 4 fotós kollázsához, részletes alany- és megvilágítási paraméterekkel.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profil / Avatar - Filmszerű dél-ázsiai férfiportré keselyűkkel',
    summary:
      'Részletes, filmszerű portré egy fiatal dél-ázsiai férfiról hangulatos, sötét fantasy környezetben, keselyűkkel és hollókkal körülvéve.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profil / Avatar - Cyberpunk anime portré neon arcszöveggel',
    summary:
      'Stílusos, neonba burkolt anime portré poszterekhez, közösségimédia-művészethez vagy futurisztikus brandvizuálokhoz.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profil / Avatar - Elegáns fantasy lány ibolyaszínű kertben',
    summary:
      'Ez a prompt egy kifinomult, anime-stílusú fantasy portrét generál egy elegáns nőről fényes, megformázott hajjal, díszes ibolya-fekete ruhában, virágokkal teli mágikus kerti környezetben, ideális karakterhez',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profil / Avatar - Éteri, kékhajú fantasy portré',
    summary:
      'Ez a prompt egy lágy, ragyogó, anime-stílusú fantasy karakterportrét generál, ideális elegáns, függőleges key art vagy karakterillusztrációk készítéséhez, lobogó hajjal és álmodozó tavaszi atmoszférával.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profil / Avatar - Elbűvölő nő feketében portré',
    summary:
      'Ez a prompt egy fotórealisztikus, luxus-stílusú portrét generál egy elegáns nőről mély dekoltázsú fekete öltözékben, ideális divatszerkesztőségi vagy szépségi képanyaghoz.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profil / Avatar - Hiperrealisztikus szelfi-textúra promptok',
    summary:
      'Részletes promptrészletek realisztikus bőrtextúrák és hiteles telefonos szelfi-kompozíció generálásához, a látható pórusokra és a természetes megvilágításra összpontosítva.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profil / Avatar - Levendula fantasy mágus portré',
    summary:
      'Ez a prompt egy kifinomult, anime-stílusú fantasy portrét generál egy elegáns mágus-hercegnőről fényes szőke hajjal, lila virágokkal és díszes kristályöltözékben, ideális karakterművészethez vagy mágikus illusztrációhoz',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profil / Avatar - Monokróm stúdióportré',
    summary:
      'Csúcskategóriás kereskedelmi fotózási prompt egy monokróm portréhoz, jellegzetes osztott háttérrel és drámai stúdiómegvilágítással.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profil / Avatar - Régi fotó helyreállítása DSLR-portrévá',
    summary:
      'Ez a prompt egy sérült, vintage 4 fős családi fotót állít helyre tiszta, színezett, nagy felbontású realisztikus portrévá fotójavításhoz és -feljavításhoz.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profil / Avatar - Költői nő kerti portré',
    summary:
      'Ez a prompt egy realisztikus, szerkesztőségi stílusú portrét generál egy könyvmoly fiatal nőről napsütötte kertben, ideális életmódfotózáshoz, irodalmi brandinghez vagy elegáns karakterképanyaghoz.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profil / Avatar - Professzionális identitásportré háttérkép',
    summary:
      'Nagy felbontású, prémium háttérképet generál, amelyen egy alany professzionális öltözékben, karrierrel kapcsolatos tevékenységekkel és tipográfiával jelenik meg.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profil / Avatar - Realisztikusan tökéletlen AI-szelfi',
    summary:
      'Kreatív prompt, amelyet a GPT Image 2-vel használnak egy \'elrontott\' szelfi generálásához, amely véletlenszerű, gyenge minőségű okostelefonos pillanatfelvételnek tűnik.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profil / Avatar - Dedikált filctollas portré shikishin',
    summary:
      'Ez egy élénk, dedikált filctoll-stílusú portrét generál egy négyzet alakú shikishi táblán, hasznos rajongói művészeti autogramokhoz, emlékillusztráció-bejegyzésekhez és személyre szabott köszönő vizuálokhoz.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profil / Avatar - Hónyúl-császárné portré',
    summary:
      'Realisztikus fantasy portré-prompt egy fenséges, nyúl-témájú nő generálásához díszes téli hanfuban, havas hegyi templomi környezetben állva.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profil / Avatar - Hónyúl-maszkos hanfu portré',
    summary:
      'Ez a prompt egy filmszerű, téli fantasy portrét generál egy maszkos nőről nyúl témájú, fehér Hanfuban, amely ideális elegáns karakterművészethez és hangulatos AI bemutatóképekhez.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profil / Avatár - Havas nyúl Hanfu portré',
    summary:
      'Ez a prompt egy rendkívül részletes fantasy szépségportrét generál egy nyúlfülű nőről hímzett hanfuban, amely ideális elegáns karakterművészethez, jelmeztervezéshez vagy filmszerű AI portrébemutatókhoz.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profil / Avatár - Havas nyúlszellem portré',
    summary:
      'Ez a prompt egy nyugodt fantasy portrét generál egy névtelen, nyúlfülű nőről télen, amely ideális hangulatos karakterművészethez és stilizált profilillusztrációkhoz.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profil / Avatár - Song-dinasztia Hanfu portré',
    summary:
      'Optimalizált prompt egy részletes és valósághű szépségportré generálásához hagyományos Song-dinasztia korabeli Hanfuban, egy ősi udvarban.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Közösségi média bejegyzés - Anime Pokémon bolti öltözék előzetes poszter',
    summary:
      'Ez a prompt egy lágy pasztell anime divatbejelentő posztert generál egy elmosott arcú, kék ruhás lánnyal egy Pokémon boltban, amely ideális öltözékbemutató előzetesekhez és karakter promóciós vizuálokhoz.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Közösségi média bejegyzés - Filmszerű liftjelenet',
    summary:
      'Prompt egy hangulatos, filmszerű jelenet generálásához egy nőről egy fémes liftben, valósághű megvilágítással és tükröződésekkel.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Közösségi média bejegyzés - Zavarodott tündérlány pasztell asztalnál',
    summary:
      'Ez a prompt egy lágy pasztell anime illusztrációt generál egy tündérlányról, aki a számítógépénél gépel egy hangulatos, kawaii munkatérben, amely ideális közösségi bejegyzésekhez, háttérképekhez vagy streamer témájú művészethez.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Közösségi média bejegyzés - Szerkesztőségi divatfotózás',
    summary:
      'Hangulatos, divatközpontú prompt egy minimalista stúdiójelenethez, lágy megvilágítással és meleg tónusokkal.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Közösségi média bejegyzés - Divatszerkesztőségi kollázs',
    summary:
      'Rendkívül részletes 2x2-es fotókollázs prompt divatszerkesztőségi felvételekhez, amely a következetes stílusra, a meghatározott megvilágításra és egy referenciafotó arcvonásaira összpontosít.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Közösségi média bejegyzés - PSG átigazolás-bejelentő poszter',
    summary:
      'Merész, professzionális futballszerződtetési poszter egy játékos Paris Saint-Germain-hez való igazolásának bejelentésére közösségi médiában vagy sport promóciós grafikákon.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Közösségi média bejegyzés - Szenzációs lánytánc storyboard (8 felvétel)',
    summary:
      'Teljes, 8 felvételből álló storyboard promptkészlet egy stílusos karakter összefüggő, képkockáról képkockára haladó tánc-szekvenciájának generálásához. Tartalmaz közös globális stílustokeneket, egy újrahasználható negatív promptot és nyolc felvételenkénti promptot (nyitó póz, csípőmozgás, testhullám, ütemre érkező derékcsavarás, oldalsó csípőlengetés, hajdobás, erőpóz, záró póz). GPT-Image-2 szintű modellekhez hangolva: tömör szókincs, nincs érzékeny megfogalmazás, következetes keretezés és megvilágítási nyelvezet a felvételeken át, hogy a képkockák egyetlen folyamatos koreográfiának hassanak.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Közösségi média bejegyzés - Showa-napi retro kultúra magazincím',
    summary:
      'Meleg, szerkesztőségi stílusú japán ünnepi témaoldal, amely ötvözi az anime karakterművészetet, a nosztalgikus Showa-korabeli utcaképeket és a magazinszerű információs elrendezést szezonális kulturális promóciókhoz.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Közösségi média bejegyzés - Közösségi média divatöltözék generálás',
    summary:
      'Prompt egy egész hétre szóló, divatblogger stílusú öltözékajánlások generálásához egy karakterprofil alapján, termékcímkékkel és árakkal együtt.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Közösségi média bejegyzés - Utazási pillanatkép-kollázs prompt',
    summary:
      'Részletes prompt egy nosztalgikus, 12 képkockás kollázs létrehozásához, amely okostelefon stílusú utazási fotókkal ábrázol egy egyéni utazást.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Közösségi média bejegyzés - Vintage cégfestő vázlat',
    summary:
      'Kézzel rajzolt filctollvázlatot generál papíron, valósághű részletekkel, mint például grafitvonalak és tintaelfolyás, amely tökéletes vintage betűstílusokhoz.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'VR headset robbantott nézet poszter',
    summary:
      'Egy VR headset csúcstechnológiás robbantott nézetű diagramját generálja részletes komponens-jelölésekkel és promóciós szöveggel.',
  },
  '3d-animated-boy-building-lego': {
    title: '3D animált fiú legózik',
    summary:
      'Több felvételből álló videoprompt 3D animációs stílusban, amely egy fiút ír le, aki gondosan illeszti össze a Lego-darabokat egy szobában, time-lapse effektekkel.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Egy évtizednyi tökéletesedés - Glow-up',
    summary:
      'Átalakulási prompt a Seedance 2.0-hoz, amely egy férfi átmenetét mutatja be egy 2016-os hétköznapi környezetből egy 2026-os, luxus dubaji életstílusba, miközben megőrzi a karakter következetességét.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Ősi őrző sárkány mentés',
    summary:
      'Részletes, több felvételből álló filmszerű prompt egy történethez egy esős faluban élő lányról, akit egy felbukkanó sárkány ment meg, a VFX-re és a hangulatos hangzásra összpontosítva.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Ősi indiai királyság FPV videó',
    summary:
      'Pörgős, FPV drónstílusú filmszerű prompt, amely egy misztikus indiai királyságot ábrázol templomokkal és dzsungelekkel.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Animációátvitel és kameranyomon-követés prompt',
    summary:
      'Technikai prompt a Seedance 2.0-hoz, amely egy adott mozgásreferenciát alkalmaz egy karakterre, miközben fenntartja a rögzített kameramozgás-követést.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Ütemre szinkronizált öltözékátalakító tánc',
    summary:
      'Prompt a Seedance 2.0-hoz, amely egy karakter táncát koordinálja a bontási képkockák alapján, miközben ütemre szinkronizált öltözékváltást hajt végre.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Karakterbemutató motion graphics szekvencia',
    summary:
      'Összetett, többlépcsős motion graphics prompt egy karaktercsapat bemutatásához, specifikus UI-rétegekkel és átmenetekkel, a Seedance 2.0 modellhez tervezve.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Filmes születésnapi ünnepség szekvencia',
    summary:
      'Rendkívül részletes, többfelvételes videoprompt egy születésnapi szekvenciához, a karakter következetességére és az érzelmi történetmesélésre összpontosítva.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Filmes sárkányinterakció és repülés',
    summary:
      'Részletes, storyboard-stílusú prompt egy videóhoz, amely egy nő érzelmi interakcióját mutatja be egy sárkánnyal, majd egy filmes repülési szekvenciát követ.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Filmes kelet-ázsiai női kéztánc',
    summary:
      'Rendkívül részletes, többfelvételes filmes videoprompt egy stilizált kéztánchoz, időkódolt utasításokkal a kameramozgáshoz és a karakter cselekvéseihez.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Filmes érzelmi arc közelkép',
    summary:
      'Rendkívül részletes technikai prompt a Seedance 2.0-hoz, amely a valósághű bőrtextúrákra és összetett érzelmi arckifejezés-átmenetek sorozatára összpontosít.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Filmes tengerbiológus felfedezés',
    summary:
      'Részletes filmes videoprompt egy víz alatti jelenethez, amelyben egy tengerbiológus egy ősi hajóroncsot fedez fel egy korallzátonyban.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Filmes zenei podcast és gitártechnika',
    summary:
      'Haladó filmes prompt egy 4K-s zenei podcast videó generálásához, különös tekintettel a gitártechnikára, a pinch harmonikákra és a stúdió esztétikájára.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Filmes útvonal-navigációs útmutató',
    summary:
      'Strukturált, többjelenetes prompt, amelyet a Seedance számára terveztek, hogy következetes gyalogos navigációs videót hozzon létre egy visszatérő idegenvezető karakterrel és zökkenőmentes átmenetekkel a valós helyszínek között.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Filmes utcai autóverseny szekvencia a Seedance 2-höz',
    summary:
      'Részletes, többfelvételes prompt, amelyet a Seedance 2 számára terveztek, hogy filmes éjszakai utcai autóverseny szekvenciát generáljon, az intenzív sofőri koncentrációra, a dinamikus kameramunkára és a robbanásszerű gyorsulásra összpontosítva, struktúr',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Filmes vámpír sikátorharc szekvencia',
    summary:
      'Átfogó akcióprompt egy rövidfilm-jelenethez, amely dinamikus kameramozgásokat és nagy sebességű küzdelmet tartalmaz egy neonfényű sikátorban.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Crimson Horizon sci-fi filmes szekvencia',
    summary:
      'Átfogó, 9 felvételből álló filmes videoszekvencia a „Crimson Horizon” című sci-fi filmhez, amely mindent részletez a rakétaindítástól a Marson zajló hátborzongató idegen találkozásig.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Cyberpunk játék előzetes forgatókönyve',
    summary:
      'Kiterjedt videogeneráló prompt egy cyberpunk játék előzeteséhez, amely részletezi a karaktertervezést, a UI-animációkat és a környezeti átmeneteket egy fehér ürességtől egy favelláig.',
  },
  'forbidden-city-cat-satire': {
    title: 'Tiltott Város macskaszatíra',
    summary:
      'Összetett, sötét komédia prompt a Seedance 2.0-hoz, amelyben egy narancssárga macskahivatalnok és egy hiénacsászár szerepel egy szatirikus Csing-dinasztia korabeli környezetben.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Hollywoodi haute couture fantasy videoprompt',
    summary:
      'Részletes, többjelenetes videogeneráló prompt a Seedance 2.0-hoz, amelyet egy hollywoodi haute couture fantasy film létrehozására terveztek. A prompt meghatározza a stílust, a felbontást (8K) és a renderelő motort (Unreal Engin',
  },
  'hunched-character-animation': {
    title: 'Görnyedt karakteranimáció',
    summary:
      'Utasítás a Seedance 2 számára egy helyben járó animáció létrehozásához egy adott karakterreferenciához.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: 3D iPhone + MacBook termékbemutató',
    summary:
      '15 másodperces termékbemutató, amelyben egy valódi GLTF iPhone 15 Pro Max és MacBook Pro lebeg egy tiszta színpadon, miközben a tényleges app UI élőben renderelődik a képernyőikön a drawElementImage segítségével. Morfondírozó üveglencse-fényfolt + 360°-os forgóasztal. A vfx-iphone-device katalógusblokkra épül.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: filmes szövegkurzor-megjelenés',
    summary:
      '8 másodperces drámai szövegmegjelenés kurzorragyogással, kromatikus árnyéksugarakkal és irányított megvilágítással egy fekete színpadon. Valódi DOM-tipográfia élő shader-utófeldolgozás alatt. A vfx-text-cursor katalógusblokkra épül.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: üvegszilánkos kifutó',
    summary:
      '12 másodperces HTML-szilánkos kifutó – egy valódi termékoldal vagy árazási kártya egy pillanatra megáll, majd fénytörő üvegszilánkokra robban mélységélességi elmosással és kromatikus diszperzióval. A vfx-shatter katalógusblokkra épül. Egy hosszabb kompozíció utáni zárókártyaként illeszkedik.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: folyékony háttér hero',
    summary:
      'Egy 12 másodperces hero, ahol HTML-tartalom lebeg egy organikus folyékony felület felett — vertex-eltolt, felosztott sík, valós idejű hullámdinamika, a rögzített DOM élesen és olvashatóan ül a tetején. A vfx-liquid-background katalógusblokkra építve.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: Liquid Glass landing felfedés',
    summary:
      'Egy 20 másodperces voronoi liquid-glass felfedés egy valódi termék landing oldaláról — a DOM élőben rögzül a drawElementImage segítségével, fénytörő üvegcellákra szilánkolódik, majd letisztult hero felvétellé rendeződik. A vfx-liquid-glass katalógusblokkra építve.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: Mágneses mező vizualizáció',
    summary:
      'Egy 15 másodperces mágneses mező részecske-vizualizáció, amely egy élő DOM-hőtérképre vagy diagramra reagál — a részecskék mezővonalakat rajzolnak, amelyek a rögzített HTML köré hajlanak, ideális ML-/adattermékekhez. A vfx-magnetic katalógusblokkra építve.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: Portál felfedés dashboard',
    summary:
      'Egy 10 másodperces dimenziós portál nyílik meg egy élő adat-dashboardra — a DOM valós időben rögzül, volumetrikus fényszivárgás, portálszél-részecskék. A vfx-portal katalógusblokkra építve. Keynote-stílusú adat hero felvételekhez tervezve.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: $0 → $10K pénzszámláló hype (9:16)',
    summary:
      'Egy 6 másodperces, függőleges 1080×1920 HyperFrames hype-klip — Apple-stílusú $0 → $10,000 számláló zöld villanással, pénzrobbanás-részecskékkel, készpénzköteg-ikonnal, kicker főcímmel. A HyperFrames `apple-money-count` katalógusblokkra építve.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: 12 másodperces alkalmazás-bemutató — három lebegő telefon',
    summary:
      'Egy 12 másodperces 16:9 alkalmazás-bemutató kompozíció — három lebegő iPhone-képernyő lebeg a 3D térben, mindegyik sorra elfordul, hogy egy-egy másik funkciót mutasson meg, beat-szinkronizált címke-kiemelésekkel, záró logó-lockuppal. Közvetlenül a HyperFrames `app-showcase` katalógusblokkra építve.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: 30 másodperces márka sizzle reel',
    summary:
      'Egy 30 másodperces 16:9 HyperFrames sizzle reel — gyors vágások, beat-szinkronizált kinetikus tipográfia, audio-reaktív méretezés a kijelzett szavakon, shader-átmenetek öt jelenet között, záró kártya logó-bloommal. Az aisoc-hype archetípusra mintázva a hallgatói kitből.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: 30 másodperces SaaS termékpromó (Linear-stílus)',
    summary:
      'Egy 30 másodperces HyperFrames kompozíció, a Linear/ClickUp-stílusú termékfilmekre mintázva — UI 3D felfedések, beat-szinkronizált kinetikus tipográfia, animált UI-képernyőképek, záró kártya logó-outróval. HF katalógusblokkokból építve (ui-3d-reveal, app-showcase, logo-outro) plusz shader-átmenetekkel a jelenetek között.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: 4 másodperces filmes logó-outro',
    summary:
      'Egy 4 másodperces 16:9 logó-outro — darabonkénti wordmark-összeállítás bloommal, csillámsöprés a végső lockup felett, lágy szemcse-overlay, egysoros CTA. A HyperFrames `logo-outro`, `shimmer-sweep` és `grain-overlay` blokkokra építve.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: 5 másodperces minimál termékfelfedés',
    summary:
      'Egy 5 másodperces HyperFrames kompozíció prémium termékfelfedéshez — sötét vászon, egyetlen meleg kiemelőszín, lassú push-in címkártya, kinetikus kicker sor, visszafogott mozgás. Az ügynök MP4-et renderel HTML+GSAP-ból puppeteer segítségével; nincs szükség stock felvételre.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: 9:16 közösségi overlay stack (X · Reddit · Spotify · Instagram)',
    summary:
      'Egy 15 másodperces, függőleges 1080×1920 HyperFrames kompozíció, amely négy animált közösségi kártyát rétegez egy face-cam loop fölé — egy X-poszt, egy Reddit-reakció, egy Spotify now-playing kártya, és a végén egy Instagram-követés CTA. Minden kártya egy HyperFrames katalógusblokk; a koreográfia adja a hozzáadott értéket.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: 9:16 TikTok beszélőfej karaoke-feliratokkal',
    summary:
      'Egy függőleges 1080×1920 HyperFrames short — TTS-narrált beszélőfej egy face-cam loop felett, karaoke-stílusú szó-szinkronizált feliratokkal, animált lower thirddel és egy tiktok-követés overlay-jel a végén. A HyperFrames hallgatói kit may-shorts-19 archetípusát tükrözi.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: animált oszlopdiagram-verseny (NYT-stílus)',
    summary:
      'Egy 12 másodperces 16:9 adat-infografika — animált oszlop- + vonaldiagram lépcsőzetes kategória-felfedéssel, NYT-stílusú serif főcímmel, lábjegyzet-forrással, kinetikus értékcímkékkel. Közvetlenül a HyperFrames `data-chart` katalógusblokkra építve.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Apple-stílusú repülési térkép (kiindulás → célállomás)',
    summary:
      'Egy 8 másodperces 16:9 filmes repülési útvonal-térkép — realisztikus terep-zoom, animált repülőgép, amely a kiindulástól a célállomásig siklik egy ívelt útvonalon, feliratozott városokkal, kinetikus távolságszámlálóval. Közvetlenül a HyperFrames `nyc-paris-flight` katalógusblokkra építve, bármely várospárra átalakítható.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: weboldal-videó pipeline (15 másodperces marketingvágás)',
    summary:
      'Egy 15 másodperces 16:9 HyperFrames kompozíció, amely egy élő weboldalt rögzít három viewport-méretben, majd animál közöttük kromatikus radiális hasítással a jelenetek között. A hyperframes-sizzle hallgatói kit archetípusát tükrözi, ahol a webhely a forrásanyag.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Élőszereplős anime-adaptáció: Víz vs. Villám lélegzés párbaj',
    summary:
      'Egy rendkívül részletes, 15 másodperces prompt egy anime-stílusú párbaj élőszereplős adaptációjának generálásához, amely a \'Víz lélegzést\' (kék vízisárkány) állítja szembe a \'Villám lélegzéssel\' (arany villámlás). A p',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Luxus szupersportautó filmes narratíva',
    summary:
      'Egy rendkívül részletes, több beállításos filmes prompt a Seedance 2.0-hoz, amelyben egy stílusos férfi, dobermannok és egy veterán szupersportautó szerepel ködös hegyi környezetben.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Mágikus akadémia storyboard-szekvencia',
    summary:
      'Egy részletes storyboard-stílusú prompt egy filmes szekvenciához, amely egy varázslólányt ábrázol egy akadémián, lefedve az érkezést, az erő felfedezését és egy mágikus párbajt.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Modern vidéki esztétika gyógyító rövidfilm videó-prompt',
    summary:
      'Egy részletes, három beállításos prompt a Seedance 2.0-hoz egy gyógyító, filmes rövidfilm generálásához Modern vidéki esztétika stílusban. Megadja a stílust (Filmes reklám, 4K/8K, Extrém makró, nat',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Éjszakai klub szórólap hangulati animáció',
    summary:
      'Egy finom animációs prompt a Seedance 2.0-hoz, amely életre kelti a háttér- és világítási elemeket, miközben a témát rögzítve tartja',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Retró HK wuxia film esztétika',
    summary:
      'Egy összetett, többrészes videó prompt, amely a 80-as és 90-es évek hongkongi vuhsia-filmjeinek esztétikáját idézi fel, és egy szereplő macskából emberré való átalakulását mutatja be stilizált beállításokkal.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: 15 másodperces filmes japán romantikus rövidfilm',
    summary:
      'Egy rendkívül részletes, 15 másodperces, többjelenetes prompt a Seedance 2.0-hoz, amelyet egy filmes, ultrarealisztikus japán középiskolai tiszta szerelmes rövidfilm létrehozására terveztek. A prompt megadja a jelenet helyszínét (üres',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: 80 éves rapper MV',
    summary:
      'Egy részletes, 15 másodperces prompt a Seedance 2.0-hoz, amely egy 16:9-es, fekvő formátumú utcai rap zenei videót (MV) hoz létre egy 80 éves nővel a főszerepben. A prompt megadja a stílust (neon lila/kék hideg tónusok, exp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Mozdulatsor- és mozgásutasítás harcművészeti videóhoz',
    summary:
      'Egy videó prompt a Seedance 2.0-hoz, amely arra utasítja a modellt, hogy egy karakterlap alapján animáljon egy mozdulatsort, a konkrét mozdulatokra és lépésekre összpontosítva.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Lélekcserélő tükörmágia-jelenetsor',
    summary:
      'Egy elbeszélő videó prompt, amely egy varázslatos lélekcserélő eseményt ír le egy tükörnél, minden szakaszhoz konkrét kameraurasításokkal és érzelmi jelzésekkel.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Kenyérpirító-rakéta ijesztgetés',
    summary:
      'Egy prompt egy realisztikus, otthoni videó stílusú felvételhez, amelyen egy idős férfit megijeszt egy kenyérpirító, amely rakétaként lövi ki a kenyeret.',
  },
  'traditional-dance-performance': {
    title: 'Hagyományos táncelőadás',
    summary:
      'Egy átfogó videó prompt a Seedance 2.0-hoz, amely koreográfia és identitás-referenciaképek alapján egy kecses hagyományos táncot hoz létre.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Videó – Három királyság ARPG – Guan Yu legyőzi Yan Liangot (Seedance 2.0)',
    summary:
      'Egy körülbelül 10 másodperces, motoron belüli filmes akciójelenet, amely életre kelti a kísérő kép sablont, a game-screenshot-three-kingdoms-guanyu-slaying-yanliang-et. Guan Yu (关羽) Vörös Nyúl lován egyenesen az ellenséges csatasorba vágtat, felemeli a Zöld Sárkány Félhold Pengéjét, és egyetlen tiszta vágással lesújt Yan Liang ellenséges tábornokra. A Seedance 2.0-ra hangolva – feszes kamerafegyelem, egyetlen határozott csapás, tiszta ló- és pengefizika, fotórealisztikus megvilágítás, a képernyőn semmiféle vérengzés (a csapást egy arany csi-felvillanás jelzi, nem vér). Úgy tervezték, hogy a hozzá illő kép sablon közvetlen videós párja legyen, így az állókép és a klip párban tálalható. Referenciakép: a Guan Yu Yan Liangot legyőző képernyőkép-sablon.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Videó – Három királyság ARPG – Lyu Bu yuanmen íjászata (Seedance 2.0)',
    summary:
      'Egy körülbelül 10 másodperces, motoron belüli filmes akciójelenet, amely életre kelti a kísérő kép sablont, a game-screenshot-three-kingdoms-lyubu-yuanmen-archery-t. Lyu Bu (吕布) egy poros katonai tábor közepén áll két egymással szemben álló sereg között, megfeszít egy vörös lakkozott hosszúíjat, megtartja a feszítést, majd egyetlen aranyan izzó, csivel átitatott nyilat ereszt el a pálya mentén egy távoli, földbe szúrt alabárd felé. A Seedance 2.0-ra hangolva – feszes kamerafegyelem, egyetlen határozott ütem, tiszta, HUD-biztos képkivágás, tiszta íj-/nyílfizika, szél + por + zászlómozgás, és játékon belüli képernyőkép színkorrekció. Úgy tervezték, hogy a hozzá illő kép sablon közvetlen videós párja legyen, így az állókép és a klip párban tálalható. Referenciakép: a Lyu Bu yuanmen-íjászat képernyőkép-sablon.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Videó – Három királyság ARPG – Zhao Yun csecsemőmentő menekülése (Seedance 2.0)',
    summary:
      'Egy körülbelül 12 másodperces, motoron belüli filmes akciójelenet, amely életre kelti a kísérő kép sablont, a game-screenshot-three-kingdoms-zhaoyun-cradle-escape-et. Zhao Yun (赵云) harci lován vágtat át a feldúlt Changban csatamezőn, bal karja hajlatában tartva A Dou csecsemő örököst, jobbjában a lándzsáját forgatva, egyetlen TÖKÉLETES KITÉRÉSSEL hárít egy bejövő csapást, és átugratva egy felborult harci szekéren utat tör magának. A Seedance 2.0-ra hangolva – feszes kamerafegyelem, egyetlen folyamatos ütem, hihető egykezes lándzsaforgatás, tiszta lófizika, és a csecsemőnek semmiféle látható sérülése. Úgy tervezték, hogy a hozzá illő kép sablon közvetlen videós párja legyen, így az állókép és a klip párban tálalható. Referenciakép: a Zhao Yun csecsemőmentő menekülés képernyőkép-sablon.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Vintage Disney stílusú kalóz krokodil animáció',
    summary:
      'Egy többjelenetes elbeszélő prompt egy klasszikus, vintage Disney stílusú animációhoz, amelyben egy krokodil kalóz és madár kalózok szerepelnek egy hajón.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Vírusos K-pop tánckoreográfia',
    summary:
      'Egy részletes prompt a Seedance 2.0-hoz, amely egy 16 paneles storyboard-referencia alapján animál egy táncot előadó szereplőt.',
  },
  'wasteland-factory-chase': {
    title: 'Pusztaság gyári üldözés',
    summary:
      'Egy filmes prompt egy nagy sebességű sivatagi pusztaság-jelenethez, amelyben egy lábakon mozgó ipari gyár és egy lázadó motoros üldözés szerepel.',
  },
};
