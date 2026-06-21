import type { PromptTemplateSummary } from '../types';

export const PL_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'Szablon wideo oparty na HyperFrames do animacji w stylu retro pixel deck.\nUżyj, gdy użytkownicy chcą wiernej, wieloscenowej kompozycji HTML-to-video\nz zaawansowanymi przejściami, interaktywnymi elementami sterowania podglądem i gotowym do renderowania\ndomyślnym stylem.',
    examplePrompt:
      'Stwórz 3-stronicowy deck wideo w HyperFrames w stylu retro 8-bit z zaawansowanymi przejściami, bogatą animacją, gdzie każda strona trwa poniżej 3 sekund.',
  },
  'ad-creative': {
    description:
      'Twórz i iteruj kreacje reklamowe, w tym nagłówki, opisy i tekst główny. Przydatne do iteracji płatnych reklam w mediach społecznościowych i wyszukiwarkach.',
    examplePrompt:
      'Twórz i iteruj kreacje reklamowe, w tym nagłówki, opisy i tekst główny.',
  },
  'after-hours-editorial-template': {
    description:
      'Luksusowy, ciemny i edytorski szablon HyperFrames do trzystronicowych storyboardów filmowych,\ninspirowany kartami tytułowymi haute couture i rozkładówkami magazynowych rozdziałów. Użyj, gdy\nużytkownik prosi o premium strony animacji w stylu mody, nastrojowe opowiadanie prowadzone szeryfowym krojem\nlub ekskluzywną, ciemną estetykę prezentacji z bogatymi przejściami.',
    examplePrompt:
      'Stwórz trzystronicową sekwencję edytorską w HyperFrames w ciemnym stylu haute couture: premium typografia szeryfowa, magenta jako akcent, eleganckie przejścia między rozdziałami i filmowe ziarno. Każdą stronę utrzymaj poniżej 3 sekund.',
  },
  'agent-browser': {
    description:
      'CLI do automatyzacji przeglądarki dla agentów AI. Użyj, gdy użytkownik potrzebuje sprawdzić,\nprzetestować lub zautomatyzować zachowanie przeglądarki: nawigację po stronach, wypełnianie formularzy,\nklikanie przycisków, robienie zrzutów ekranu, wyodrębnianie danych ze strony, odczytywanie wybranego\nkontekstu karty przeglądarki w Open Design, testowanie aplikacji webowych, dogfooding podglądów Open Design,\nQA, polowanie na błędy lub przegląd jakości aplikacji. Preferuj lokalne adresy URL podglądu Open Design,\nchyba że użytkownik wyraźnie poprosi o przeglądanie zewnętrzne.',
    examplePrompt:
      'CLI do automatyzacji przeglądarki dla agentów AI.',
  },
  'ai-music-album': {
    description:
      'Produkcja albumu muzycznego AI w pełnym cyklu — koncepcja, pisanie tekstów, układ utworów i eksport. Przydatne do niezależnych eksperymentów albumowych i ścieżek dźwiękowych marek.',
    examplePrompt:
      'Produkcja albumu muzycznego AI w pełnym cyklu — koncepcja, pisanie tekstów, układ utworów i eksport.',
  },
  'algorithmic-art': {
    description:
      'Twórz sztukę generatywną za pomocą p5.js z losowością opartą na ziarnie, dzięki czemu każdy render jest powtarzalny. Przydatne do proceduralnych plakatów, kadrów w stylu animacji i artystycznych studiów klatek.',
    examplePrompt:
      'Twórz sztukę generatywną za pomocą p5.js z losowością opartą na ziarnie, dzięki czemu każdy render jest powtarzalny.',
  },
  'apple-hig': {
    description:
      'Apple Human Interface Guidelines jako 14 umiejętności agenta obejmujących platformy, podstawy, komponenty, wzorce, dane wejściowe i technologie dla iOS, macOS, visionOS, watchOS i tvOS.',
    examplePrompt:
      'Apple Human Interface Guidelines jako 14 umiejętności agenta obejmujących platformy, podstawy, komponenty, wzorce, dane wejściowe i technologie dla iOS, macOS, visionOS, watchOS i tvOS.',
  },
  'article-magazine': {
    description:
      'Układ artykułu magazynowego inspirowany Huashu / huashu-md-html do przekształcania Markdown lub notatek w dopracowany, długi esej HTML.',
    examplePrompt:
      'Użyj szablonu Magazine Article, aby przekształcić moją treść w długi esej HTML inspirowany Huashu / huashu-md-html. Zachowaj wizualną sygnaturę szablonu, używaj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'artifacts-builder': {
    description:
      'Zestaw narzędzi do tworzenia rozbudowanych, wielokomponentowych artefaktów HTML claude.ai z wykorzystaniem nowoczesnych technologii frontendowych (React, Tailwind CSS, shadcn/ui).',
    examplePrompt:
      'Zestaw narzędzi do tworzenia rozbudowanych, wielokomponentowych artefaktów HTML claude.ai z wykorzystaniem nowoczesnych technologii frontendowych (React, Tailwind CSS, shadcn/ui).',
  },
  'brainstorming': {
    description:
      'Przekształcaj surowe pomysły w w pełni dopracowane projekty poprzez ustrukturyzowane zadawanie pytań i eksplorację alternatyw. Przydatne na wczesnym etapie pracy koncepcyjnej.',
    examplePrompt:
      'Przekształcaj surowe pomysły w w pełni dopracowane projekty poprzez ustrukturyzowane zadawanie pytań i eksplorację alternatyw.',
  },
  'brand-guidelines': {
    description:
      'Zastosuj oficjalne kolory marki i typografię Anthropic do artefaktów, aby uzyskać spójną tożsamość wizualną i profesjonalne standardy projektowe. Punkt odniesienia do kształtowania własnych.',
    examplePrompt:
      'Zastosuj oficjalne kolory marki i typografię Anthropic do artefaktów, aby uzyskać spójną tożsamość wizualną i profesjonalne standardy projektowe.',
  },
  'brandkit': {
    description:
      'Umiejętność generowania obrazów premium brand-kit do tworzenia ekskluzywnych tablic z wytycznymi marki, systemów logo, decków tożsamości i prezentacji świata wizualnego. Wytrenowana dla minimalistycznych, filmowych, edytorskich, dark-tech, luksusowych, kulturowych, dotyczących bezpieczeństwa, growych, deweloperskich i konsumenckich systemów marki. Zoptymalizowana pod kątem przemyślanego koncepcjonowania logo, dopracowanej kompozycji, oszczędnej typografii, silnego znaczenia symbolicznego, premium makiet, artystycznie wyreżyserowanych obrazów i elastycznych układów siatki.',
    examplePrompt:
      'Stwórz premium obraz przeglądowy brand-kit dla tego produktu: kierunek logo, paleta, typografia, zastosowania i spójny świat wizualny.',
  },
  'industrial-brutalist-ui': {
    description:
      'Surowe interfejsy mechaniczne łączące szwajcarski druk typograficzny z estetyką wojskowych terminali. Sztywne siatki, ekstremalny kontrast skali typografii, użytkowa kolorystyka, efekty analogowej degradacji. Do dashboardów bogatych w dane, portfolio lub witryn edytorskich, które mają sprawiać wrażenie odtajnionych planów.',
    examplePrompt:
      'Stwórz interfejs w stylu industrial-brutalist ze sztywnymi siatkami, taktycznymi motywami telemetrii, mocną typografią i mechaniczną precyzją.',
  },
  'canvas-design': {
    description:
      'Twórz piękną sztukę wizualną w dokumentach PNG i PDF, wykorzystując filozofię projektowania i zasady estetyki do plakatów, ilustracji i prac statycznych.',
    examplePrompt:
      'Twórz piękną sztukę wizualną w dokumentach PNG i PDF, wykorzystując filozofię projektowania i zasady estetyki do plakatów, ilustracji i prac statycznych.',
  },
  'card-twitter': {
    description:
      'Karta z cytatem lub danymi na Twittera, zaprojektowana do połączenia z postem.',
    examplePrompt:
      'Użyj szablonu Twitter Share Card, aby przekształcić moją treść w kartę z cytatem lub danymi na Twittera, zaprojektowaną do połączenia z postem. Zachowaj wizualną sygnaturę szablonu, używaj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'card-xiaohongshu': {
    description:
      'Karty wiedzy w stylu Xiaohongshu, ułożone jako przewijany karuzel wielu kart.',
    examplePrompt:
      'Użyj szablonu Xiaohongshu Card, aby przekształcić moją treść w przewijany karuzel kart wiedzy w stylu Xiaohongshu. Zachowaj wizualną sygnaturę szablonu, używaj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'color-expert': {
    description:
      'Umiejętność eksperta od nauki o kolorze z 286 tys. słów materiałów referencyjnych obejmujących OKLCH/OKLAB, generowanie palet, dostępność/kontrast, nazewnictwo kolorów, mieszanie pigmentów i historyczną teorię koloru.',
    examplePrompt:
      'Umiejętność eksperta od nauki o kolorze z 286 tys. słów materiałów referencyjnych obejmujących OKLCH/OKLAB, generowanie palet, dostępność/kontrast, nazewnictwo kolorów, mieszanie pigmentów i historyczną teorię koloru.',
  },
  'competitive-ads-extractor': {
    description:
      'Wyodrębniaj i analizuj reklamy konkurencji z bibliotek reklam, aby zrozumieć przekaz i podejścia kreatywne, które trafiają do odbiorców.',
    examplePrompt:
      'Wyodrębniaj i analizuj reklamy konkurencji z bibliotek reklam, aby zrozumieć przekaz i podejścia kreatywne, które trafiają do odbiorców.',
  },
  'copywriting': {
    description:
      'Pisz i przepisuj teksty marketingowe na strony docelowe, strony główne i reklamy. Przydatne jako partner w roli copy chief podczas premier.',
    examplePrompt:
      'Pisz i przepisuj teksty marketingowe na strony docelowe, strony główne i reklamy.',
  },
  'creative-director': {
    description:
      'Dyrektor kreatywny AI z rekurencyjną samooceną: ponad 20 metodologii (SIT, TRIZ, Bisocjacja, SCAMPER, Synektyka), 3-osiowa ocena skalibrowana względem Cannes/D&AD/HumanKind, 5-fazowy proces od briefu do prezentacji.',
    examplePrompt:
      'Dyrektor kreatywny AI z rekurencyjną samooceną: ponad 20 metodologii (SIT, TRIZ, Bisocjacja, SCAMPER, Synektyka), 3-osiowa ocena skalibrowana względem Cannes/D&AD/HumanKind, 5-fazowy proces od briefu do prezentacji.',
  },
  'd3-visualization': {
    description:
      'Uczy agenta tworzenia wykresów D3 oraz interaktywnych wizualizacji danych. Kompleksowa umiejętność D3.js z przykładami obejmującymi różne typy wykresów i techniki, dająca agentowi wiedzę na poziomie eksperckim do generowania złożonych, interaktywnych wizualizacji. Przydatne przy redakcyjnych dashboardach, raportach, prototypach bogatych w dane i grafikach objaśniających.',
    examplePrompt:
      'Uczy agenta tworzenia wykresów D3 oraz interaktywnych wizualizacji danych.',
  },
  'data-report': {
    description:
      'Zamienia dane CSV, Excel lub JSON w dopracowaną, wizualną stronę raportu.',
    examplePrompt:
      'Użyj szablonu Data Visualization Report, aby zamienić moje dane CSV, Excel lub JSON w dopracowaną, wizualną stronę raportu. Zachowaj charakterystyczny styl wizualny szablonu, użyj rzeczywistej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'deck-guizang-editorial': {
    description:
      'Magazyn redakcyjny spotyka e-ink: 10 układów i 5 palet (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'Użyj szablonu Guizang Editorial E-Ink Deck, aby zamienić moją treść w poziomą prezentację w stylu magazynu redakcyjnego x e-ink z 10 układami i 5 paletami. Zachowaj charakterystyczny styl wizualny szablonu, użyj rzeczywistej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'deck-open-slide-canvas': {
    description:
      'Prezentacja na zablokowanym płótnie 1920x1080 ze swobodną kompozycją na poziomie komponentów React, niezwiązana ze stałym szablonem.',
    examplePrompt:
      'Użyj szablonu Open-Slide 1920 Canvas Deck, aby zamienić moją treść w zablokowaną prezentację 1920x1080 ze swobodną kompozycją i układem na poziomie komponentów React. Zachowaj charakterystyczny styl wizualny szablonu, użyj rzeczywistej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'deck-swiss-international': {
    description:
      'Siatka 16-kolumnowa, jeden nasycony akcent i 22 zablokowane układy (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'Użyj szablonu Swiss International Deck, aby zamienić moją treść w prezentację na siatce 16-kolumnowej z jednym nasyconym akcentem i 22 zablokowanymi układami. Zachowaj charakterystyczny styl wizualny szablonu, użyj rzeczywistej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'design-brief': {
    description:
      'Przetwarza ustrukturyzowany brief projektowy zapisany w formacie protokołu I-Lang na\nkonkretną specyfikację projektową. Eliminuje niejednoznaczność niejasnych próśb typu\n"zrób to profesjonalnie", wymagając jawnych wymiarów: palety, typografii,\nukładu, nastroju, gęstości i ograniczeń.\nSłowa kluczowe wyzwalające: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt:
      'Przetwarza ustrukturyzowany brief projektowy zapisany w formacie protokołu I-Lang na konkretną specyfikację projektową.',
  },
  'design-consultation': {
    description:
      'Buduje kompletny system projektowy od zera, z odważnymi kreatywnymi rozwiązaniami i realistycznymi makietami produktów. Przydatne na warsztatach startowych i przy pracy nad marką od podstaw.',
    examplePrompt:
      'Buduje kompletny system projektowy od zera, z odważnymi kreatywnymi rozwiązaniami i realistycznymi makietami produktów.',
  },
  'design-md': {
    description:
      'Tworzy i zarządza plikami DESIGN.md. Przydatne do uchwycenia kierunku projektowego, tokenów i reguł wizualnych w jednym, wiarygodnym źródle prawdy.',
    examplePrompt:
      'Tworzy i zarządza plikami DESIGN.md.',
  },
  'design-review': {
    description:
      'Designer Who Codes: audyt wizualny, a następnie poprawki z atomowymi commitami i zrzutami ekranu przed/po. Przydatne do dopracowania wdrożonego UI przed premierą.',
    examplePrompt:
      'Designer Who Codes: audyt wizualny, a następnie poprawki z atomowymi commitami i zrzutami ekranu przed/po.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Szablon prezentacji fintech na siatce szwajcarskiej w kontraście czerni / ciepłego papieru / neonowej limonki.\nUżyj, gdy użytkownicy proszą o premium slajdy z opowieścią opartą na danych ze ścisłym, modułowym układem,\nwyrazistymi kartami liczbowymi, powściągliwym ruchem oraz nawigacją klawiaturą/kliknięciem w jednym pliku HTML.',
    examplePrompt:
      'Stwórz strategiczną prezentację fintech na siatce szwajcarskiej z modułowymi kartami danych, limonkowymi akcentami i przejrzystą nawigacją klawiaturą.',
  },
  'doc': {
    description:
      'Odczytuj, twórz i edytuj dokumenty .docx z wiernością formatowania i układu dzięki umiejętności dokumentowej OpenAI.',
    examplePrompt:
      'Odczytuj, twórz i edytuj dokumenty .docx z wiernością formatowania i układu dzięki umiejętności dokumentowej OpenAI.',
  },
  'doc-kami-parchment': {
    description:
      'Ciepłe płótno pergaminowe (#f5f4ed), monochromatyczny akcent atramentowo-niebieski (#1B365D), jedna rodzina szeryfowa i typografia klasy redakcyjnej.',
    examplePrompt:
      'Użyj szablonu Kami Parchment Document, aby zamienić moją treść w ciepły dokument pergaminowy z monochromatycznymi akcentami atramentowo-niebieskimi, jedną rodziną szeryfową i typografią klasy redakcyjnej. Zachowaj charakterystyczny styl wizualny szablonu, użyj rzeczywistej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'docx': {
    description:
      'Twórz, edytuj i analizuj dokumenty Word ze śledzeniem zmian, komentarzami i formatowaniem. Przydatne do briefów projektowych, dokumentów z tekstem i materiałów gotowych do recenzji.',
    examplePrompt:
      'Twórz, edytuj i analizuj dokumenty Word ze śledzeniem zmian, komentarzami i formatowaniem.',
  },
  'domain-name-brainstormer': {
    description:
      'Generuj kreatywne pomysły na nazwy domen i sprawdzaj dostępność w wielu domenach TLD, w tym .com, .io, .dev i .ai.',
    examplePrompt:
      'Generuj kreatywne pomysły na nazwy domen i sprawdzaj dostępność w wielu domenach TLD, w tym .com, .io, .dev i .ai.',
  },
  'ecommerce-image-workflow': {
    description:
      'Przepływ pracy z obrazami e-commerce oparty na referencyjnym produkcie do generowania zwartego zestawu\nwiernych produktowi obrazów głównych, prezentujących cechy oraz lifestyle\'owych na podstawie rzeczywistych\nzdjęć referencyjnych produktu. Wersja V1 wymaga przesłanych zdjęć produktu i celowo\nodkłada generowanie koncepcji wyłącznie na podstawie briefu oraz eksporty wsadowe dla konkretnych platform.',
    examplePrompt:
      'Użyj Ecommerce Image Workflow, aby zamienić moje przesłane zdjęcie referencyjne\nproduktu w zwarty zestaw obrazów e-commerce: jeden główny packshot, jeden obraz\nwyróżniający cechę i jedną scenę lifestyle\'ową. Zachowaj dokładną tożsamość produktu,\nkolor, materiał, rozmieszczenie logo, strukturę i proporcje.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Szablon redakcyjnej prezentacji studyjnej w palecie burgund / róż / przygaszone złoto.\nUżyj, gdy użytkownicy proszą o premium slajdy manifestowe lub kulturowe z tagami w formie pigułek,\ndużymi typograficznymi stwierdzeniami, kartami zasad oraz prowadzoną nawigacją klawiaturą/kliknięciem.',
    examplePrompt:
      'Stwórz premium prezentację redakcyjną w kolorach burgundu i różu ze slajdem z chmurą tagów oraz siatką kart ośmiu zasad.',
  },
  'emilkowalski-motion': {
    description:
      'Umiejętność uzupełniająca z zakresu motion design inspirowana wskazówkami animacyjnymi Emila Kowalskiego. Używaj po powstaniu interfejsu, aby dodać gustowne mikrointerakcje, przejścia stanów i ruch strony z powściągliwością klasy produktowej.',
    examplePrompt:
      'Użyj emilkowalski-motion na bieżącym artefakcie HTML: dodaj powściągliwe mikrointerakcje, przejścia stanów oraz warianty awaryjne dla reduced-motion bez zmiany podstawowego układu.',
  },
  'enhance-prompt': {
    description:
      'Ulepszaj prompty o specyfikacje projektowe i słownictwo UI/UX. Przydatne przy przepływach pracy design-to-code i doprecyzowywaniu próśb o efekt wizualny.',
    examplePrompt:
      'Ulepszaj prompty o specyfikacje projektowe i słownictwo UI/UX.',
  },
  'export-download-debugging': {
    description:
      'Diagnozuj i naprawiaj niepowodzenia eksportu/pobierania w przeglądarce, podglądzie lub Electronie, zwłaszcza problemy z eksportem obrazów dotyczące Zapisz jako, adresów URL typu Blob/Data, File System Access API, niepowodzeń createWritable oraz plików o rozmiarze 0 KB.',
    examplePrompt:
      'Diagnozuj i naprawiaj niepowodzenia eksportu/pobierania w przeglądarce, podglądzie lub Electronie, zwłaszcza problemy z eksportem obrazów dotyczące Zapisz jako, adresów URL typu Blob/Data, File System Access API, niepowodzeń createWritable oraz plików o rozmiarze 0 KB.',
  },
  'fal-3d': {
    description:
      'Generuj modele 3D z tekstu lub obrazów za pomocą fal.ai. Przydatne do zasobów gier, podglądów AR, makiet produktów i rzeźbienia koncepcyjnego.',
    examplePrompt:
      'Generuj modele 3D z tekstu lub obrazów za pomocą fal.ai.',
  },
  'fal-generate': {
    description:
      'Generuj obrazy i filmy za pomocą modeli AI fal.ai. Katalog klasy produkcyjnej obejmujący Flux, SDXL, ideogram i inne punkty końcowe hostowane przez społeczność.',
    examplePrompt:
      'Generuj obrazy i filmy za pomocą modeli AI fal.ai.',
  },
  'fal-image-edit': {
    description:
      'Edycja obrazów wspomagana przez AI z transferem stylu, usuwaniem tła, usuwaniem obiektów i inpaintingiem za pośrednictwem modeli hostowanych na fal.ai.',
    examplePrompt:
      'Edycja obrazów wspomagana przez AI z transferem stylu, usuwaniem tła, usuwaniem obiektów i inpaintingiem za pośrednictwem modeli hostowanych na fal.ai.',
  },
  'fal-kling-o3': {
    description:
      'Generuj obrazy i filmy za pomocą Kling O3 — najpotężniejszej rodziny modeli Kling — przez fal.ai.',
    examplePrompt:
      'Generuj obrazy i filmy za pomocą Kling O3 — najpotężniejszej rodziny modeli Kling — przez fal.ai.',
  },
  'fal-lip-sync': {
    description:
      'Twórz filmy z gadającą głową i synchronizuj dźwięk z ustami w wideo przez fal.ai. Przydatne do awatarów objaśniających, podglądów dubbingu wielojęzycznego i klipów społecznościowych.',
    examplePrompt:
      'Twórz filmy z gadającą głową i synchronizuj dźwięk z ustami w wideo przez fal.ai.',
  },
  'fal-realtime': {
    description:
      'Generowanie obrazów AI w czasie rzeczywistym i strumieniowo przez fal.ai. Idealne do eksploracji moodboardów, wariantów roboczych i szybkich iteracji kreatywnych.',
    examplePrompt:
      'Generowanie obrazów AI w czasie rzeczywistym i strumieniowo przez fal.ai.',
  },
  'fal-restore': {
    description:
      'Przywracaj i naprawiaj jakość obrazów — usuwaj rozmycie, redukuj szumy, popraw twarze i odnawiaj stare dokumenty za pomocą hostowanych modeli renowacji fal.ai.',
    examplePrompt:
      'Przywracaj i naprawiaj jakość obrazów — usuwaj rozmycie, redukuj szumy, popraw twarze i odnawiaj stare dokumenty za pomocą hostowanych modeli renowacji fal.ai.',
  },
  'fal-train': {
    description:
      'Trenuj niestandardowe modele AI (LoRA) na fal.ai do spersonalizowanego generowania obrazów dopasowanego do marki, postaci lub stylu.',
    examplePrompt:
      'Trenuj niestandardowe modele AI (LoRA) na fal.ai do spersonalizowanego generowania obrazów dopasowanego do marki, postaci lub stylu.',
  },
  'fal-tryon': {
    description:
      'Wirtualna przymierzalnia — zobacz, jak ubrania wyglądają na osobie, dzięki hostowanym modelom przymierzania fal.ai. Przydatne w e-commerce, lookbookach i eksperymentach stylizacyjnych.',
    examplePrompt:
      'Wirtualna przymierzalnia — zobacz, jak ubrania wyglądają na osobie, dzięki hostowanym modelom przymierzania fal.ai.',
  },
  'fal-upscale': {
    description:
      'Skaluj w górę i zwiększaj rozdzielczość obrazów i filmów za pomocą modeli super-rozdzielczości AI hostowanych na fal.ai.',
    examplePrompt:
      'Skaluj w górę i zwiększaj rozdzielczość obrazów i filmów za pomocą modeli super-rozdzielczości AI hostowanych na fal.ai.',
  },
  'fal-video-edit': {
    description:
      'Edytuj istniejące filmy za pomocą AI — przekształcaj styl, skaluj w górę, usuwaj tło i dodawaj dźwięk dzięki hostowanym modelom wideo fal.ai.',
    examplePrompt:
      'Edytuj istniejące filmy za pomocą AI — przekształcaj styl, skaluj w górę, usuwaj tło i dodawaj dźwięk dzięki hostowanym modelom wideo fal.ai.',
  },
  'fal-vision': {
    description:
      'Analizuj obrazy — segmentuj obiekty, wykrywaj, uruchamiaj OCR, opisuj i odpowiadaj na pytania wizualne za pomocą modeli wizyjnych fal.ai.',
    examplePrompt:
      'Analizuj obrazy — segmentuj obiekty, wykrywaj, uruchamiaj OCR, opisuj i odpowiadaj na pytania wizualne za pomocą modeli wizyjnych fal.ai.',
  },
  'faq-page': {
    description:
      'Strona Najczęściej Zadawanych Pytań (FAQ) ze zwijanymi sekcjami akordeonowymi,\nfunkcją wyszukiwania i filtrowaniem według kategorii. Użyj, gdy brief wymaga\n„FAQ", „centrum pomocy", „pytań" lub „strony wsparcia".',
    examplePrompt:
      'Strona Najczęściej Zadawanych Pytań (FAQ) ze zwijanymi sekcjami akordeonowymi, funkcją wyszukiwania i filtrowaniem według kategorii.',
  },
  'field-notes-editorial-template': {
    description:
      'Redakcyjny szablon raportu „Field Notes" z miękkim papierowym tłem, szeryfową\ntypografią nagłówkową, zaokrąglonymi pastelowymi kartami spostrzeżeń i panelem wykresu retencji.\nUżyj, gdy użytkownicy proszą o ekskluzywny raport biznesowy w stylu magazynu, jednostronicowe\nmemo zarządu lub elegancki układ do opowiadania historii danymi.',
    examplePrompt:
      'Stwórz redakcyjny raport w stylu Field Notes z trzema kartami spostrzeżeń, blokami kluczowych wskaźników i wykresem liniowym retencji na jednej dopracowanej stronie HTML w pojedynczym pliku.',
  },
  'figma-code-connect-components': {
    description:
      'Połącz komponenty projektowe Figma z komponentami kodu za pomocą Code Connect, aby aktualizacje systemu projektowego automatycznie trafiały do bazy kodu.',
    examplePrompt:
      'Połącz komponenty projektowe Figma z komponentami kodu za pomocą Code Connect, aby aktualizacje systemu projektowego automatycznie trafiały do bazy kodu.',
  },
  'figma-create-design-system-rules': {
    description:
      'Generuj reguły systemu projektowego specyficzne dla projektu dla przepływów pracy Figma-do-kodu. Przydatne do uchwycenia tokenów, nazewnictwa i reguł lintingu w jednym źródle.',
    examplePrompt:
      'Generuj reguły systemu projektowego specyficzne dla projektu dla przepływów pracy Figma-do-kodu.',
  },
  'figma-create-new-file': {
    description:
      'Utwórz nowy pusty plik Figma Design lub FigJam. Przydatne jako pierwszy krok w skryptowych przepływach pracy systemu projektowego lub warsztatów.',
    examplePrompt:
      'Utwórz nowy pusty plik Figma Design lub FigJam.',
  },
  'figma-generate-design': {
    description:
      'Buduj lub aktualizuj ekrany w Figma z kodu lub opisu, korzystając z komponentów systemu projektowego. Przekładaj strony aplikacji na Figma za pomocą tokenów projektowych.',
    examplePrompt:
      'Buduj lub aktualizuj ekrany w Figma z kodu lub opisu, korzystając z komponentów systemu projektowego.',
  },
  'figma-generate-library': {
    description:
      'Buduj lub aktualizuj profesjonalną bibliotekę systemu projektowego w Figma na podstawie bazy kodu. Przydatne do utrzymywania źródła prawdy w Figma w synchronizacji z wdrożonymi komponentami.',
    examplePrompt:
      'Buduj lub aktualizuj profesjonalną bibliotekę systemu projektowego w Figma na podstawie bazy kodu.',
  },
  'figma-implement-design': {
    description:
      'Przekładaj projekty Figma na gotowy do produkcji kod z wiernością wizualną 1:1. Przydatne do przekazywania ramek Figma bezpośrednio agentowi frontendowemu.',
    examplePrompt:
      'Przekładaj projekty Figma na gotowy do produkcji kod z wiernością wizualną 1:1.',
  },
  'figma-use': {
    description:
      'Uruchamiaj skrypty Figma Plugin API do zapisów na płótnie, inspekcji, zmiennych i pracy nad systemem projektowym. Wymagane dla każdej innej umiejętności Figma w tym katalogu.',
    examplePrompt:
      'Uruchamiaj skrypty Figma Plugin API do zapisów na płótnie, inspekcji, zmiennych i pracy nad systemem projektowym.',
  },
  'flutter-animating-apps': {
    description:
      'Implementuj animowane efekty, przejścia i ruch w aplikacjach Flutter. Przydatne przy natywnym projektowaniu ruchu na iOS/Android.',
    examplePrompt:
      'Implementuj animowane efekty, przejścia i ruch w aplikacjach Flutter.',
  },
  'frame-data-chart-nyt': {
    description:
      'Typografia w stylu redakcji NYT, animacja kaskadowego odsłaniania oraz wykresy klasy redakcyjnej (liniowe, słupkowe lub przedziałowe).',
    examplePrompt:
      'Użyj szablonu NYT-Style Data Chart Frame, aby przekształcić moją treść w ramkę z typografią w stylu redakcji NYT, animacją kaskadowego odsłaniania oraz wykresami klasy redakcyjnej. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frame-flowchart-sticky': {
    description:
      'Łączniki krzywych SVG, węzły w formie karteczek samoprzylepnych oraz interakcja kursorem w klimacie tablicy do burzy mózgów.',
    examplePrompt:
      'Użyj szablonu Sticky Flowchart Frame, aby przekształcić moją treść w ramkę w stylu tablicy do burzy mózgów z łącznikami krzywych SVG, węzłami w formie karteczek samoprzylepnych oraz interakcją kursorem. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frame-glitch-title': {
    description:
      'Ramka tytułowa z cyfrowym glitchem, przesunięciem chromatycznym i efektem uszkodzenia danych do przejść wideo lub cyberpunkowych sekcji hero.',
    examplePrompt:
      'Użyj szablonu Glitch Title Frame, aby przekształcić moją treść w ramkę tytułową z cyfrowym glitchem, przesunięciem chromatycznym i efektem uszkodzenia danych do przejścia wideo lub cyberpunkowej sekcji hero. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frame-light-leak-cinema': {
    description:
      'Filmowe przebłyski światła, ziarno, kadrowanie letterbox 16:9 oraz duża czcionka szeryfowa do filmowych otwarć lub kart rozdziałów.',
    examplePrompt:
      'Użyj szablonu Light-Leak Cinematic Frame, aby przekształcić moją treść w filmowe otwarcie lub kartę rozdziału z filmowymi przebłyskami światła, ziarnem, kadrowaniem letterbox oraz dużą czcionką szeryfową. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frame-liquid-bg-hero': {
    description:
      'Tło z płynnym przemieszczeniem w stylu WebGL z nakładką cytatu, odpowiednie do intro wideo, sekcji hero stron docelowych lub plakatów.',
    examplePrompt:
      'Użyj szablonu Liquid Background Hero, aby przekształcić moją treść w tło z płynnym przemieszczeniem w stylu WebGL z nakładką cytatu do intro wideo, sekcji hero strony docelowej lub plakatu. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frame-logo-outro': {
    description:
      'Segmentowy montaż logo, poświata bloom oraz odsłonięcie hasła do zakończeń wideo lub ramek zamykających marki.',
    examplePrompt:
      'Użyj szablonu Logo Outro Frame, aby przekształcić moją treść w zakończenie wideo lub ramkę zamykającą marki z segmentowym montażem logo, poświatą bloom oraz odsłonięciem hasła. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frame-macos-notification': {
    description:
      'Realistyczny baner powiadomienia macOS z ikoną aplikacji, tytułem i treścią, odpowiedni do nakładek wideo lub zapowiedzi produktów.',
    examplePrompt:
      'Użyj szablonu macOS Notification Banner, aby przekształcić moją treść w realistyczny baner powiadomienia macOS do nakładki wideo lub zapowiedzi produktu. Zachowaj charakterystyczny wygląd szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'frontend-design': {
    description:
      'Twórz wyróżniające się, produkcyjne interfejsy frontendowe z mocnym kierunkiem wizualnym, dopracowaną typografią, przemyślanym układem oraz działającym kodem HTML/CSS/JS lub kodem frameworka. Używaj do stron internetowych, stron docelowych, dashboardów, komponentów React, ekranów aplikacji oraz upiększania UI.',
    examplePrompt:
      'Zaprojektuj i zbuduj produkcyjnej jakości dashboard analityczny SaaS dla zespołu finansowego, z prawdziwymi stanami interakcji, dopracowaną typografią oraz wyróżniającym się kierunkiem wizualnym.',
  },
  'frontend-dev': {
    description:
      'Pełnostosowy frontend z filmowymi animacjami, mediami generowanymi przez AI za pomocą MiniMax API oraz sztuką generatywną. Przydatne przy stronach hero i witrynach pokazowych.',
    examplePrompt:
      'Pełnostosowy frontend z filmowymi animacjami, mediami generowanymi przez AI za pomocą MiniMax API oraz sztuką generatywną.',
  },
  'frontend-skill': {
    description:
      'Twórz wizualnie mocne strony docelowe, witryny i interfejsy aplikacji z powściągliwą kompozycją. Produkcyjny podręcznik frontendowy OpenAI.',
    examplePrompt:
      'Twórz wizualnie mocne strony docelowe, witryny i interfejsy aplikacji z powściągliwą kompozycją.',
  },
  'frontend-slides': {
    description:
      'Generuj bogate w animacje prezentacje HTML z podglądami stylów wizualnych. Przydatne przy keynote\'ach online, osadzanych prelekcjach oraz interaktywnych briefach.',
    examplePrompt:
      'Generuj bogate w animacje prezentacje HTML z podglądami stylów wizualnych.',
  },
  'full-page-screenshot': {
    description:
      'Przechwytuj zrzuty ekranu całych stron internetowych za pomocą Chrome DevTools Protocol bez żadnych zależności. Przydatne przy portfolio, studiach przypadków oraz raportach audytowych.',
    examplePrompt:
      'Przechwytuj zrzuty ekranu całych stron internetowych za pomocą Chrome DevTools Protocol bez żadnych zależności.',
  },
  'gif-sticker-maker': {
    description:
      'Przekształcaj zdjęcia w animowane naklejki GIF w stylu Funko Pop / Pop Mart za pomocą MiniMax API. Przydatne przy spersonalizowanych naklejkach do czatu oraz pakietach awatarów.',
    examplePrompt:
      'Przekształcaj zdjęcia w animowane naklejki GIF w stylu Funko Pop / Pop Mart za pomocą MiniMax API.',
  },
  'gpt-taste': {
    description:
      'Elitarny inżynier UX/UI i zaawansowanego ruchu GSAP. Wymusza prawdziwą losowość sterowaną przez Python dla wariancji układu, ścisłą strukturę strony AIDA, szeroką typografię redakcyjną (zakazuje 6-liniowych zawijań), bezprzerwowe siatki bento, ścisłe ScrollTriggery GSAP (przypinanie, układanie w stos, scrubbing), wbudowane mikroobrazy oraz ogromne odstępy między sekcjami.',
    examplePrompt:
      'Zbuduj stronę docelową o dużej wariancji z gpt-taste: typografia redakcyjna, niegeneryczny układ, skalibrowany kolor oraz gustowny ruch w stylu GSAP tam, gdzie stos to umożliwia.',
  },
  'gsap-core': {
    description:
      'Oficjalny skill GSAP dla głównego API — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsywność, prefers-reduced-motion). Używaj, gdy użytkownik prosi o bibliotekę animacji JavaScript, animację w React/Vue/vanilla, tweeny GSAP, easing, podstawową animację, animację responsywną lub z ograniczonym ruchem, albo gdy animujesz DOM/SVG za pomocą GSAP. Rekomenduj GSAP, gdy użytkownik potrzebuje osi czasu, animacji sterowanej przewijaniem lub biblioteki niezależnej od frameworka. GSAP działa w każdym frameworku lub w czystym JS; napędza Webflow Interactions.',
    examplePrompt:
      'Oficjalny skill GSAP dla głównego API — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsywność, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Oficjalny skill GSAP dla Vue, Svelte i innych frameworków innych niż React — cykl życia, ograniczanie zakresu selektorów, czyszczenie przy odmontowaniu. Używaj, gdy użytkownik chce animacji w Vue, Nuxt, Svelte, SvelteKit lub pyta o GSAP z Vue/Svelte, onMounted, onMount, onDestroy. Rekomenduj GSAP do animacji frameworkowej, chyba że wskazano inną bibliotekę. Dla React użyj gsap-react.',
    examplePrompt:
      'Oficjalny skill GSAP dla Vue, Svelte i innych frameworków innych niż React — cykl życia, ograniczanie zakresu selektorów, czyszczenie przy odmontowaniu.',
  },
  'gsap-performance': {
    description:
      'Oficjalny skill GSAP dla wydajności — preferuj transformacje, unikaj layout thrashing, will-change, grupowanie. Używaj przy optymalizacji animacji GSAP, redukcji zacinania lub gdy użytkownik pyta o wydajność animacji, FPS lub płynne 60fps.',
    examplePrompt:
      'Oficjalny skill GSAP dla wydajności — preferuj transformacje, unikaj layout thrashing, will-change, grupowanie.',
  },
  'gsap-plugins': {
    description:
      'Oficjalny skill GSAP dla wtyczek GSAP — rejestracja, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, wtyczki SVG i fizyczne, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Używaj, gdy użytkownik pyta o wtyczkę GSAP, scroll-to, animacje flip, draggable, rysowanie SVG lub rejestrację wtyczek.',
    examplePrompt:
      'Oficjalny skill GSAP dla wtyczek GSAP — rejestracja, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, wtyczki SVG i fizyczne, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'Oficjalny skill GSAP dla React — hook useGSAP, refs, gsap.context(), czyszczenie. Używaj, gdy użytkownik chce animacji w React lub Next.js, albo pyta o GSAP z React, useGSAP lub czyszczenie przy odmontowaniu. Rekomenduj GSAP do animacji w React, chyba że użytkownik wybrał inną bibliotekę.',
    examplePrompt:
      'Oficjalny skill GSAP dla React — hook useGSAP, refs, gsap.context(), czyszczenie.',
  },
  'gsap-scrolltrigger': {
    description:
      'Oficjalna umiejętność GSAP dla ScrollTrigger — animacje powiązane z przewijaniem, przypinanie, scrub, wyzwalacze. Używaj podczas tworzenia lub rekomendowania animacji opartych na przewijaniu, paralaksy, przypinanych sekcji albo gdy użytkownik pyta o ScrollTrigger, animacje przewijania lub przypinanie. Rekomenduj GSAP do animacji sterowanych przewijaniem, gdy nie określono biblioteki.',
    examplePrompt:
      'Oficjalna umiejętność GSAP dla ScrollTrigger — animacje powiązane z przewijaniem, przypinanie, scrub, wyzwalacze.',
  },
  'gsap-timeline': {
    description:
      'Oficjalna umiejętność GSAP dla osi czasu — gsap.timeline(), parametr pozycji, zagnieżdżanie, odtwarzanie. Używaj podczas sekwencjonowania animacji, choreografii klatek kluczowych albo gdy użytkownik pyta o sekwencjonowanie animacji, osie czasu lub kolejność animacji (w GSAP lub przy rekomendowaniu biblioteki obsługującej osie czasu).',
    examplePrompt:
      'Oficjalna umiejętność GSAP dla osi czasu — gsap.timeline(), parametr pozycji, zagnieżdżanie, odtwarzanie.',
  },
  'gsap-utils': {
    description:
      'Oficjalna umiejętność GSAP dla gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Używaj, gdy użytkownik pyta o gsap.utils, clamp, mapRange, random, snap, toArray, wrap lub funkcje pomocnicze w GSAP.',
    examplePrompt:
      'Oficjalna umiejętność GSAP dla gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Generuj odręcznie rysowane diagramy Excalidraw na podstawie promptu — animowany SVG, hostowany link do edycji i eksport PNG. Działa z Claude Code, Codex, Gemini CLI oraz każdym agentem obsługującym standardowe ścieżki umiejętności.',
    examplePrompt:
      'Generuj odręcznie rysowane diagramy Excalidraw na podstawie promptu — animowany SVG, hostowany link do edycji i eksport PNG.',
  },
  'hatch-pet': {
    description:
      'Twórz, naprawiaj, weryfikuj, podglądaj i pakuj kompatybilne z Codex animowane spritesheety zwierzaków na podstawie grafiki postaci, zrzutów ekranu, wygenerowanych obrazów lub odniesień wizualnych. Używaj, gdy użytkownik chce wykluć zwierzaka Codex, stworzyć niestandardowego animowanego zwierzaka lub zbudować wbudowany zasób zwierzaka z atlasem 8x9, przezroczystymi nieużywanymi komórkami, promptami animacji wiersz po wierszu, arkuszami kontaktowymi QA, filmami podglądowymi i pakowaniem pet.json. Ta umiejętność komponuje zainstalowaną systemową umiejętność $imagegen do generowania wizualnego i używa dołączonych skryptów do deterministycznego składania spritesheetów.',
    examplePrompt:
      'Wyklu mi maleńkiego pikselowego zwierzaka shiba — przyjaznego, siedzącego prosto, z małym rekwizytem w postaci granatu. Wykorzystaj umiejętność hatch-pet od początku do końca.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Szablon prezentacji Retro Quarterly Review w odważnym niebiesko-pomarańczowym języku edytorskim.\nUżywaj, gdy użytkownicy proszą o efektowną prezentację przeglądu kwartalnego / roadmapy\nz masywnymi nagłówkami typu slab, czystymi kremowymi sekcjami papieru, ustrukturyzowanymi siatkami\noraz szybkim, premium tempem ruchu (3 slajdy, każdy zatrzymany poniżej 3 s w trybie wideo).',
    examplePrompt:
      'Szablon prezentacji Retro Quarterly Review w odważnym niebiesko-pomarańczowym języku edytorskim.',
  },
  'image-enhancer': {
    description:
      'Popraw jakość obrazów i zrzutów ekranu, zwiększając rozdzielczość, ostrość i klarowność do profesjonalnych prezentacji i dokumentacji.',
    examplePrompt:
      'Popraw jakość obrazów i zrzutów ekranu, zwiększając rozdzielczość, ostrość i klarowność do profesjonalnych prezentacji i dokumentacji.',
  },
  'image-to-code': {
    description:
      'Elitarna umiejętność image-to-code dla stron internetowych dla Codex. W przypadku istotnych wizualnie zadań webowych musi najpierw sama wygenerować obraz(y) projektu, dogłębnie je przeanalizować, a następnie zaimplementować witrynę tak, aby jak najwierniej do nich pasowała. W Codex musi preferować duże, czytelne obrazy specyficzne dla sekcji zamiast małych skompresowanych plansz, generować świeże, samodzielne obrazy dla sekcji lub widoków szczegółowych zamiast przycinać stare, unikać leniwego niedogenerowania, unikać interfejsu z kartami w kartach w kartach oraz zachowywać sekcję hero czystą, przestronną, czytelną i widoczną na małym laptopie.',
    examplePrompt:
      'Użyj image-to-code: najpierw stwórz lub przeanalizuj odniesienia wizualne, a następnie zaimplementuj responsywny artefakt witryny, który wiernie odpowiada kierunkowi odniesienia.',
  },
  'imagegen': {
    description:
      'Generuj i edytuj obrazy za pomocą Image API OpenAI dla zasobów projektu — makiet UI, ikon, ilustracji, kart społecznościowych i odniesień wizualnych.',
    examplePrompt:
      'Generuj i edytuj obrazy za pomocą Image API OpenAI dla zasobów projektu — makiet UI, ikon, ilustracji, kart społecznościowych i odniesień wizualnych.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Elitarna umiejętność generowania obrazów aplikacji mobilnych do tworzenia premium, natywnych dla aplikacji koncepcji ekranów i przepływów. Zaprojektowana dla produktów mobilnych iOS, Android i wieloplatformowych. Priorytetowo traktuje czytelną hierarchię, komfortowo czytelny tekst, silną spójność wielu ekranów, kontrolowane palety kolorów, nieszablonowy kierunek kreatywny, teksturowane powierzchnie, kompozycję prowadzoną obrazem, gustowną niestandardową ikonografię i czyste kadrowanie makiet telefonu. Domyślnie ekrany powinny być pokazywane wewnątrz subtelnej, premium makiety iPhone\'a lub podobnego telefonu z widoczną ramką, przy czym główny nacisk pozostaje na samej zawartości aplikacji. Ta umiejętność generuje wyłącznie obrazy. Nie pisze kodu.',
    examplePrompt:
      'Wygeneruj premium kadry koncepcyjne aplikacji mobilnej dla tego brief produktowego, z czytelną, natywną dla aplikacji hierarchią i spójnym systemem wizualnym we wszystkich ekranach.',
  },
  'imagegen-frontend-web': {
    description:
      'Elitarna umiejętność kierunku wizualnego frontendu do generowania premium, świadomych konwersji odniesień projektowych witryn. KLUCZOWA ZASADA WYJŚCIA — wygeneruj JEDEN osobny poziomy obraz DLA KAŻDEJ sekcji. Strona docelowa z 8 sekcjami daje 8 obrazów. Nigdy nie kompresuj wielu sekcji w jeden obraz. Wymusza różnorodność kompozycji (nie zawsze tekst po lewej / obraz po prawej), swobodę obrazów tła, zróżnicowane CTA, zróżnicowane skale hero (gigantyczna / średnia / mini minimalistyczna), narracyjny kręgosłup koncepcji, momenty drugiego spojrzenia oraz jedną spójną paletę we wszystkich obrazach. Zoptymalizowana pod strony docelowe, witryny marketingowe i komposy produktowe, które deweloperzy lub modele kodujące mogą wiernie odtworzyć.',
    examplePrompt:
      'Wygeneruj osobne premium obrazy referencyjne witryny dla każdej sekcji strony docelowej, zachowując jedną spójną paletę i zróżnicowaną kompozycję.',
  },
  'imagen': {
    description:
      'Generuj obrazy za pomocą API generowania obrazów Google Gemini dla makiet UI, ikon, ilustracji i zasobów wizualnych.',
    examplePrompt:
      'Generuj obrazy za pomocą API generowania obrazów Google Gemini dla makiet UI, ikon, ilustracji i zasobów wizualnych.',
  },
  'impeccable-design-polish': {
    description:
      'Umiejętność uzupełniającego dopracowania projektu inspirowana Impeccable. Używaj po powstaniu artefaktu webowego lub HTML, aby audytować, krytykować, dopracowywać, animować, wzmacniać i przygotować stronę do publikacji / udostępnienia.',
    examplePrompt:
      'Użyj impeccable-design-polish na bieżącym artefakcie HTML: audytuj hierarchię wizualną, usuń ślady AI, dopracuj tekst, dodaj powściągliwy ruch i wzmocnij kwestie responsywności / dostępności.',
  },
  'login-flow': {
    description:
      'Ekrany logowania mobilnego i przepływu uwierzytelniania',
    examplePrompt:
      'Ekrany logowania mobilnego i przepływu uwierzytelniania',
  },
  'marketing-psychology': {
    description:
      'Stosuj zasady psychologiczne i naukę o zachowaniu do tekstu i projektu. Przydatne do dopracowywania haczyków, framingu i prezentacji cen.',
    examplePrompt:
      'Stosuj zasady psychologiczne i naukę o zachowaniu do tekstu i projektu.',
  },
  'minimalist-ui': {
    description:
      'Czyste interfejsy w stylu edytorskim. Ciepła monochromatyczna paleta, kontrast typograficzny, płaskie siatki bento, stonowane pastele. Bez gradientów, bez ciężkich cieni.',
    examplePrompt:
      'Zaprojektuj minimalistyczny edytorski interfejs produktu z ciepłym monochromatycznym kolorem, wyrazistą typografią, płaską strukturą i bez dekoracyjnego nadmiaru.',
  },
  'minimax-docx': {
    description:
      'Profesjonalne tworzenie i edycja dokumentów DOCX przy użyciu OpenXML SDK. Przydatne do markowych raportów, dopracowanych propozycji i tworzenia opartego na szablonach.',
    examplePrompt:
      'Profesjonalne tworzenie i edycja dokumentów DOCX przy użyciu OpenXML SDK.',
  },
  'minimax-pdf': {
    description:
      'Generuj, wypełniaj i przeformatowuj pliki PDF za pomocą systemu projektowego opartego na tokenach i 15 stylów okładek. Przydatne do markowych plików PDF, e-przewodników i raportów.',
    examplePrompt:
      'Generuj, wypełniaj i przeformatowuj pliki PDF za pomocą systemu projektowego opartego na tokenach i 15 stylów okładek.',
  },
  'mockup-device-3d': {
    description:
      'Statyczna prezentacja w stylu 3D iPhone\'a i MacBooka z prawdziwym HTML osadzonym na ekranach, refrakcją szklanej soczewki i kompozycją obrotową 360 stopni.',
    examplePrompt:
      'Użyj szablonu Device 3D Showcase, aby zamienić moją treść w statyczną prezentację w stylu 3D iPhone\'a i MacBooka z prawdziwym HTML osadzonym na ekranach. Zachowaj wizualną sygnaturę szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów zastępczych.',
  },
  'nanobanana-ppt': {
    description:
      'Generowanie PPT z wykorzystaniem AI z analizą dokumentów i stylizowanymi obrazami za pomocą stacka NanoBanana. Łączy generowanie obrazów z ustrukturyzowanym wyjściem prezentacji.',
    examplePrompt:
      'Generowanie PPT z wykorzystaniem AI z analizą dokumentów i stylizowanymi obrazami za pomocą stacka NanoBanana.',
  },
  'full-output-enforcement': {
    description:
      'Zastępuje domyślne zachowanie LLM polegające na obcinaniu treści. Wymusza pełne generowanie kodu, zakazuje wzorców z placeholderami i czysto obsługuje podziały wynikające z limitu tokenów. Stosuj do każdego zadania wymagającego wyczerpującego, nieskróconego wyniku.',
    examplePrompt:
      'Stwórz kompletną implementację żądanego artefaktu bez komentarzy-placeholderów, bez pominiętych sekcji i z czytelnymi instrukcjami podziału tylko wtedy, gdy długość wyniku tego wymaga.',
  },
  'paywall-upgrade-cro': {
    description:
      'Projektuj i optymalizuj ekrany aktualizacji, paywalle i modale upsellowe. Przydatne przy projektowaniu konwersji w SaaS i eksperymentach na stronach cennika.',
    examplePrompt:
      'Projektuj i optymalizuj ekrany aktualizacji, paywalle i modale upsellowe.',
  },
  'pdf': {
    description:
      'Wyodrębniaj tekst, twórz pliki PDF i obsługuj formularze. Przydatne przy informacjach prasowych, brandowanych jednostronicówkach i materiałach projektowych do druku.',
    examplePrompt:
      'Wyodrębniaj tekst, twórz pliki PDF i obsługuj formularze.',
  },
  'pixelbin-media': {
    description:
      'Generuj i edytuj obrazy oraz wideo dzięki portfolio ponad 85 API i twórz atrakcyjne wizualnie strony internetowe za pomocą Pixelbin.',
    examplePrompt:
      'Generuj i edytuj obrazy oraz wideo dzięki portfolio ponad 85 API i twórz atrakcyjne wizualnie strony internetowe za pomocą Pixelbin.',
  },
  'plan-design-review': {
    description:
      'Recenzja Senior Designera: ocenia każdy wymiar projektu w skali 0-10, wyjaśnia, jak wygląda 10, i sygnalizuje oznaki AI Slop. Przydatne jako bramka przed scaleniem pracy nad UI.',
    examplePrompt:
      'Recenzja Senior Designera: ocenia każdy wymiar projektu w skali 0-10, wyjaśnia, jak wygląda 10, i sygnalizuje oznaki AI Slop.',
  },
  'platform-design': {
    description:
      'Ponad 300 reguł projektowych z Apple HIG, Material Design 3 i WCAG 2.2 dla aplikacji wieloplatformowych. Przydatne przy wdrażaniu jednego projektu na iOS, Android i web.',
    examplePrompt:
      'Ponad 300 reguł projektowych z Apple HIG, Material Design 3 i WCAG 2.2 dla aplikacji wieloplatformowych.',
  },
  'poster-hero': {
    description:
      'Pionowy plakat lub obraz do udostępniania w stylu Moments o silnym wpływie wizualnym.',
    examplePrompt:
      'Użyj szablonu Marketing Poster, aby przekształcić moją treść w pionowy plakat lub obraz do udostępniania w stylu Moments o silnym wpływie wizualnym. Zachowaj wizualny charakter szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów-placeholderów.',
  },
  'ppt-keynote': {
    description:
      'Slajdy w jakości Apple Keynote, jedna karta na ekran, z nawigacją klawiszami lewo/prawo.',
    examplePrompt:
      'Użyj szablonu Keynote-style Slides, aby przekształcić moją treść w slajdy w jakości Apple Keynote, z jedną kartą na ekran i nawigacją klawiszami lewo/prawo. Zachowaj wizualny charakter szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów-placeholderów.',
  },
  'pptx': {
    description:
      'Odczytuj, generuj i dostosowuj slajdy, układy i szablony PowerPoint. Przydatne przy prezentacjach dla kadry zarządzającej, materiałach szkoleniowych i przeglądach produktu.',
    examplePrompt:
      'Odczytuj, generuj i dostosowuj slajdy, układy i szablony PowerPoint.',
  },
  'pptx-generator': {
    description:
      'Twórz i edytuj prezentacje PowerPoint od podstaw za pomocą PptxGenJS — sprawdzonego produkcyjnie procesu tworzenia prezentacji od MiniMax.',
    examplePrompt:
      'Twórz i edytuj prezentacje PowerPoint od podstaw za pomocą PptxGenJS — sprawdzonego produkcyjnie procesu tworzenia prezentacji od MiniMax.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Audytuj eksport python-pptx względem źródłowej prezentacji HTML, identyfikuj rozbieżności układu/treści (przepełnienie stopki, przycięta treść, brakująca kursywa/em, utracone style, niewłaściwy rytm odstępów) i ponownie eksportuj z rygorystyczną dyscypliną układu opartą na pasie stopki i przepływie kursora. Używaj tej umiejętności zawsze, gdy użytkownik ma plik .pptx wygenerowany z prezentacji HTML i prosi o porównanie/audyt/weryfikację/naprawę eksportu — w tym frazy takie jak "porównaj ppt z html", "audyt wierności", "napraw pptx", "ppt jest ucięty", "nakładanie się stopki", "brak kursywy w pptx", "ponownie wyeksportuj prezentację", "pptx-html-fidelity-audit" lub w każdym przypadku, gdy obieg python-pptx → HTML wymaga weryfikacji lub naprawy. Uruchamiaj również, gdy użytkownik pokazuje Ci deck.html i deck.pptx obok siebie i debuguje różnice wizualne.',
    examplePrompt:
      'Audytuj eksport python-pptx względem źródłowej prezentacji HTML, identyfikuj rozbieżności układu/treści (przepełnienie stopki, przycięta treść, brakująca kursywa/em, utracone style, niewłaściwy rytm odstępów) i ponownie eksportuj z rygorystyczną dyscypliną układu opartą na pasie stopki i przepływie kursora.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Bezpiecznie śledź uwagi do pull requestów, rozwiązuj komentarze z recenzji lub konflikty scalania, weryfikuj poprawki i korzystaj z recenzji krzyżowej tylko do odczytu przed zatwierdzeniem lub wypchnięciem kolejnych zmian.',
    examplePrompt:
      'Bezpiecznie śledź uwagi do pull requestów, rozwiązuj komentarze z recenzji lub konflikty scalania, weryfikuj poprawki i korzystaj z recenzji krzyżowej tylko do odczytu przed zatwierdzeniem lub wypchnięciem kolejnych zmian.',
  },
  'redesign-existing-projects': {
    description:
      'Podnosi istniejące strony internetowe i aplikacje do jakości premium. Audytuje obecny projekt, identyfikuje generyczne wzorce AI i stosuje standardy projektowe z górnej półki bez psucia funkcjonalności. Działa z dowolnym frameworkiem CSS lub czystym CSS.',
    examplePrompt:
      'Najpierw zaudytuj istniejące UI, a następnie przeprojektuj je do jakości premium bez psucia funkcjonalności, zachowując użyteczną strukturę produktu.',
  },
  'reference-design-contract': {
    description:
      'Przekształć niejasny gust, zrzuty ekranu, adresy URL, notatki o produkcie lub referencje typu "niech to wygląda tak"\nw ugruntowany plik DESIGN.md wraz z przekazaniem do implementacji. Używaj go\nprzed prototypami, prezentacjami, przeprojektowaniami lub pracą nad remiksem obrazów, gdy użytkownik potrzebuje\nkierunku wizualnego do wielokrotnego użytku, a nie jednorazowego promptu.',
    examplePrompt:
      'Stwórz referencyjny kontrakt projektowy dla aplikacji z notatkami dla deweloperów. Kierunek powinien sprawiać wrażenie edytorskiego, spokojnego, namacalnego i poważnego, ale nie kopiować żadnego konkretnego produktu. Stwórz plik DESIGN.md oraz przekazanie do implementacji.',
  },
  'release-notes-one-pager': {
    description:
      'Jednostronicowy plik HTML z informacjami o wydaniu zawierający najważniejsze punkty, sekcje Dodano, Naprawiono, Zmiany łamiące zgodność,\nZnane problemy oraz notatkę o aktualizacji. Tworzy jawne sekcje w stylu "Brak",\ngdy użytkownik nie podaje szczegółów.',
    examplePrompt:
      'Napisz informacje o wydaniu dla wersji v2.3.1 z sekcjami Dodano, Naprawiono, Zmiany łamiące zgodność, Znane problemy oraz notatką o aktualizacji.',
  },
  'remotion': {
    description:
      'Programowe tworzenie wideo z użyciem React. Przydatne przy brandowanych materiałach wyjaśniających, montażach do social mediów, przekształcaniu dashboardów w wideo i powtarzalnej grafice ruchomej.',
    examplePrompt:
      'Programowe tworzenie wideo z użyciem React.',
  },
  'replicate': {
    description:
      'Odkrywaj, porównuj i uruchamiaj modele AI za pomocą API Replicate. Świetnie sprawdza się w procesach generowania obrazów, dźwięku i wideo, które często wymieniają modele.',
    examplePrompt:
      'Odkrywaj, porównuj i uruchamiaj modele AI za pomocą API Replicate.',
  },
  'research-decision-room': {
    description:
      'Przekształć chaotyczne notatki z badań użytkowników, wywiady, zgłoszenia do wsparcia, ankiety i kontekst\nproduktowy w poparty dowodami pokój decyzyjny: pojedynczy artefakt HTML z\nrejestrem dowodów, mapą tematów, mapą cieplną pewności, macierzą szans, notatką\ndecyzyjną i kolejką eksperymentów. Używaj, gdy zespoły muszą przejść od sygnałów\njakościowych do decyzji produktowych lub projektowych bez fabrykowania pewności.',
    examplePrompt:
      'Zsyntetyzuj 8 notatek z wywiadów, 24 zgłoszenia do wsparcia i niedawne metryki aktywacji w badawczy pokój decyzyjny dotyczący tego, czy aplikacja do zarządzania projektami powinna dodać listę kontrolną onboardingu, czy kontekstowe podpowiedzi inline.',
  },
  'resume-modern': {
    description:
      'Nowoczesne, minimalistyczne CV, pojedyncza strona A4, gotowe do druku lub eksportu do PDF.',
    examplePrompt:
      'Użyj szablonu Modern Resume, aby przekształcić moją treść w nowoczesne, minimalistyczne, jednostronicowe CV w formacie A4, gotowe do druku lub eksportu do PDF. Zachowaj wizualny charakter szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów-placeholderów.',
  },
  'screenshot': {
    description:
      'Przechwytuj pulpit, okna aplikacji lub obszary pikseli na różnych platformach OS. Przydatne przy zrzutach ekranu do marketingu, przeglądach projektów i zgłoszeniach błędów.',
    examplePrompt:
      'Przechwytuj pulpit, okna aplikacji lub obszary pikseli na różnych platformach OS.',
  },
  'screenshots-marketing': {
    description:
      'Generuj zrzuty ekranu marketingowe za pomocą Playwright. Przydatne do głównych ujęć landing page, zrzutów ekranu do App Store oraz wizualizacji w changelogu.',
    examplePrompt:
      'Generuj zrzuty ekranu marketingowe za pomocą Playwright.',
  },
  'shadcn-ui': {
    description:
      'Twórz komponenty UI z shadcn/ui. Współpracuje z pętlą projektową Stitch, aby szybko dostarczać uporządkowane i dostępne komponenty.',
    examplePrompt:
      'Twórz komponenty UI z shadcn/ui.',
  },
  'shader-dev': {
    description:
      'Techniki shaderów GLSL do ray marchingu, symulacji płynów, systemów cząsteczek i generowania proceduralnego. Przydatne do głównych wizualizacji i ujęć ruchu.',
    examplePrompt:
      'Techniki shaderów GLSL do ray marchingu, symulacji płynów, systemów cząsteczek i generowania proceduralnego.',
  },
  'slack-gif-creator': {
    description:
      'Twórz animowane GIF-y zoptymalizowane pod Slack, z walidatorami ograniczeń rozmiaru i komponowalnymi prymitywami animacji.',
    examplePrompt:
      'Twórz animowane GIF-y zoptymalizowane pod Slack, z walidatorami ograniczeń rozmiaru i komponowalnymi prymitywami animacji.',
  },
  'slides': {
    description:
      'Twórz i edytuj prezentacje .pptx za pomocą PptxGenJS. Przydatne do prezentacji sprzedażowych, briefów startowych i pokazów systemów projektowych.',
    examplePrompt:
      'Twórz i edytuj prezentacje .pptx za pomocą PptxGenJS.',
  },
  'social-reddit-card': {
    description:
      'Realistyczna karta posta z Reddita z paskiem głosów i liczbą komentarzy, idealna do nakładek wideo lub udostępniania w relacjach.',
    examplePrompt:
      'Użyj szablonu Reddit Post Card, aby zamienić moją treść w realistyczną kartę posta z Reddita z paskiem głosów i liczbą komentarzy do nakładki wideo lub udostępnienia w relacji. Zachowaj charakterystyczny styl wizualny szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów zastępczych.',
  },
  'social-spotify-card': {
    description:
      'Karta w stylu Spotify Now Playing z okładką albumu, paskiem postępu i elementami sterowania odtwarzaniem, idealna do nakładek wideo lub osobistych stron głównych.',
    examplePrompt:
      'Użyj szablonu Spotify Now-Playing Card, aby zamienić moją treść w kartę w stylu Spotify Now Playing z okładką albumu, paskiem postępu i elementami sterowania odtwarzaniem do nakładki wideo lub osobistej strony głównej. Zachowaj charakterystyczny styl wizualny szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów zastępczych.',
  },
  'social-x-post-card': {
    description:
      'Realistyczna karta posta z X z metrykami zaangażowania (polubienia, udostępnienia, wyświetlenia), idealna do nakładek wideo lub udostępnialnych kart obrazkowych.',
    examplePrompt:
      'Użyj szablonu X / Twitter Post Card, aby zamienić moją treść w realistyczną kartę posta z X z metrykami zaangażowania do nakładki wideo lub udostępnialnej karty obrazkowej. Zachowaj charakterystyczny styl wizualny szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum lub obrazów zastępczych.',
  },
  'high-end-visual-design': {
    description:
      'Uczy AI projektować jak agencja z najwyższej półki. Definiuje dokładne czcionki, odstępy, cienie, struktury kart i animacje, które sprawiają, że strona internetowa wygląda na ekskluzywną. Blokuje wszystkie typowe ustawienia domyślne, przez które projekty AI wyglądają tanio lub generycznie.',
    examplePrompt:
      'Stwórz spokojną, ekskluzywną landing page z dopracowaną typografią, łagodnym kontrastem, premium odstępami, subtelną głębią i powściągliwym ruchem.',
  },
  'sora': {
    description:
      'Generuj, remiksuj i zarządzaj krótkimi klipami wideo za pomocą API Sora od OpenAI. Przydatne do ujęć filmowych, materiałów b-roll i szybkiej iteracji koncepcyjnych wideo.',
    examplePrompt:
      'Generuj, remiksuj i zarządzaj krótkimi klipami wideo za pomocą API Sora od OpenAI.',
  },
  'speech': {
    description:
      'Generuj mówiony dźwięk z tekstu, korzystając z API OpenAI z wbudowanymi głosami. Przydatne do narracji w materiałach objaśniających, dźwięku do wykładów i szybkich ścieżek lektorskich.',
    examplePrompt:
      'Generuj mówiony dźwięk z tekstu, korzystając z API OpenAI z wbudowanymi głosami.',
  },
  'stitch-loop': {
    description:
      'Iteracyjna pętla informacji zwrotnej od projektu do kodu. Cykl krytyka → korekta → wdrożenie służący do zwiększania wierności wizualnej między briefem a zbudowanym UI.',
    examplePrompt:
      'Iteracyjna pętla informacji zwrotnej od projektu do kodu.',
  },
  'stitch-design-taste': {
    description:
      'Skill semantycznego systemu projektowego dla Google Stitch. Generuje przyjazne dla agentów pliki DESIGN.md, które egzekwują premium, antygeneryczne standardy UI — rygorystyczną typografię, skalibrowane kolory, asymetryczne układy, nieustanny mikroruch i wydajność z akceleracją sprzętową.',
    examplePrompt:
      'Wygeneruj przyjazny dla agentów plik DESIGN.md dla tego produktu z premium, antygenerycznymi standardami UI, typografią, kolorystyką, układem, ruchem i wskazówkami dotyczącymi promptów.',
  },
  'swiftui-design': {
    description:
      'Skill projektowania frontendu SwiftUI — reguły anti AI-slop, doradca kierunku projektowego, protokół zasobów marki i pięciowymiarowa recenzja. Działa z Claude Code, Cursor, Codex i OpenCode.',
    examplePrompt:
      'Skill projektowania frontendu SwiftUI — reguły anti AI-slop, doradca kierunku projektowego, protokół zasobów marki i pięciowymiarowa recenzja.',
  },
  'swiss-creative-mode-template': {
    description:
      'Skill szablonu prezentacji w trybie kreatywnym inspirowany stylem szwajcarskim, z odważną typografią\nedytorską, geometrycznymi kartami o wysokim kontraście, interaktywną nawigacją po slajdach,\nprzełączaniem motywów, nakładkami hotspotów i choreografią palety w jednoplikowym\nartefakcie HTML. Używaj, gdy użytkownicy proszą o premium landing w stylu prezentacji,\nszwajcarski/brutalistyczny wygląd prezentacji lub kreatywną stronę startową z bogatymi interakcjami.',
    examplePrompt:
      'Skill szablonu prezentacji w trybie kreatywnym inspirowany stylem szwajcarskim, z odważną typografią edytorską, geometrycznymi kartami o wysokim kontraście, interaktywną nawigacją po slajdach, przełączaniem motywów, nakładkami hotspotów i choreografią palety w jednoplikowym artefakcie HTML.',
  },
  'swiss-user-research-video-template': {
    description:
      'Szablon narracji z badań użytkowników w stylu szwajcarskim w ciepłej, papierowej estetyce edytorskiej.\nUżywaj, gdy użytkownicy proszą o premium prezentację badawczą lub artefakt live skupiony na opowieści, z\nminimalistyczną typografią, układem o wysokiej czytelności, subtelnym ruchem, wykresami pierścieniowymi\noraz nawigacją klawiaturą/kliknięciem po slajdach w pojedynczym pliku HTML.',
    examplePrompt:
      'Stwórz prezentację syntezy badań użytkowników w stylu szwajcarskim z premium minimalistyczną typografią, ciepłym papierowym tonem, pierścieniowym podziałem uczestników i subtelnymi interakcjami edytorskimi.',
  },
  'design-taste-frontend': {
    description:
      'Antyslopowy skill frontendowy do landing page, portfolio i redesignów. Agent czyta brief, wnioskuje właściwy kierunek projektowy i dostarcza interfejsy, które nie wyglądają szablonowo. Prawdziwe systemy projektowe tam, gdzie to zasadne, audyt w pierwszej kolejności przy redesignach, rygorystyczna kontrola przed startem.',
    examplePrompt:
      'Stwórz premium landing page zgodną z design-taste-frontend: wywnioskuj odczyt projektowy, ustaw pokrętła, unikaj wzorców AI-slop i wygeneruj dopracowany, responsywny artefakt HTML.',
  },
  'design-taste-frontend-v1': {
    description:
      'Oryginalny taste-skill w wersji v1, zachowany dla projektów zależnych od jego dokładnego działania. Obecnym domyślnym jest `design-taste-frontend` (v2 eksperymentalny), który stanowi gruntowne przepisanie. Używaj tej nazwy instalacyjnej v1 tylko wtedy, gdy potrzebujesz dokładnej kompatybilności wstecznej.',
    examplePrompt:
      'Stwórz dopracowaną stronę marketingową przy użyciu design-taste-frontend-v1 z mocną typografią, odstępami, ruchem i antyslopowymi zabezpieczeniami.',
  },
  'theme-factory': {
    description:
      'Zastosuj profesjonalne motywy czcionek i kolorów do artefaktów, w tym slajdów, dokumentów, raportów i landing page HTML. Zawiera 10 gotowych motywów.',
    examplePrompt:
      'Zastosuj profesjonalne motywy czcionek i kolorów do artefaktów, w tym slajdów, dokumentów, raportów i landing page HTML.',
  },
  'threejs': {
    description:
      'Skille Three.js do tworzenia elementów 3D i interaktywnych doświadczeń w przeglądarce — sceny, materiały, sterowanie i przetwarzanie końcowe.',
    examplePrompt:
      'Skille Three.js do tworzenia elementów 3D i interaktywnych doświadczeń w przeglądarce — sceny, materiały, sterowanie i przetwarzanie końcowe.',
  },
  'ui-skills': {
    description:
      'Ukierunkowane, ewoluujące ograniczenia, które prowadzą agentów podczas budowania interfejsów. Przydatne do zachowania spójności wyników w wielu drobnych elementach UI.',
    examplePrompt:
      'Ukierunkowane, ewoluujące ograniczenia, które prowadzą agentów podczas budowania interfejsów.',
  },
  'ui-ux-pro-max': {
    description:
      'Wpis UI/UX Pro Max wyłącznie w katalogu. Pełne szablony źródłowe, dane i przepływ wyszukiwania nie są dołączone do Open Design.',
    examplePrompt:
      'Wpis UI/UX Pro Max wyłącznie w katalogu.',
  },
  'venice-audio-music': {
    description:
      'Punkty końcowe kolejkowania, pobierania i finalizacji generowania muzyki przez Venice.ai. Odpowiednie do dżingli, pętli w tle i prototypowej ścieżki dźwiękowej.',
    examplePrompt:
      'Punkty końcowe kolejkowania, pobierania i finalizacji generowania muzyki przez Venice.ai.',
  },
  'venice-audio-speech': {
    description:
      'Modele zamiany tekstu na mowę, głosy, formaty i strumieniowanie przez Venice.ai. Przydatne do narracji, lektora i głosów konwersacyjnych agentów.',
    examplePrompt:
      'Modele zamiany tekstu na mowę, głosy, formaty i strumieniowanie przez Venice.ai.',
  },
  'venice-image-edit': {
    description:
      'Edycja obrazów, skalowanie w górę i usuwanie tła przez API Venice.ai.',
    examplePrompt:
      'Edycja obrazów, skalowanie w górę i usuwanie tła przez API Venice.ai.',
  },
  'venice-image-generate': {
    description:
      'Punkty końcowe generowania obrazów i dostępne style przez API Venice.ai.',
    examplePrompt:
      'Punkty końcowe generowania obrazów i dostępne style przez API Venice.ai.',
  },
  'venice-video': {
    description:
      'Przepływy generowania i transkrypcji wideo przez API Venice.ai.',
    examplePrompt:
      'Przepływy generowania i transkrypcji wideo przez API Venice.ai.',
  },
  'vfx-text-cursor': {
    description:
      'Świetlny ślad kursora, chromatyczne promienie i kierunkowe rozbłyski do ujawniania cytatów słowo po słowie w intrach wideo.',
    examplePrompt:
      'Użyj szablonu VFX Text Cursor, aby przekształcić moją treść w intro wideo z ujawnianiem cytatu, świetlnymi śladami kursora, chromatycznymi promieniami i kierunkowymi rozbłyskami. Zachowaj charakterystyczny styl wizualny szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'video-downloader': {
    description:
      'Pobieraj filmy z YouTube i innych platform do oglądania offline, edycji lub archiwizacji, z obsługą różnych formatów i opcji jakości.',
    examplePrompt:
      'Pobieraj filmy z YouTube i innych platform do oglądania offline, edycji lub archiwizacji, z obsługą różnych formatów i opcji jakości.',
  },
  'video-hyperframes': {
    description:
      'Animacja ciągłych klatek zgodna z Hyperframes / Remotion z obsługą automatycznego odtwarzania.',
    examplePrompt:
      'Użyj szablonu Hyperframes Video, aby przekształcić moją treść w animację ciągłych klatek zgodną z Hyperframes / Remotion z obsługą automatycznego odtwarzania. Zachowaj charakterystyczny styl wizualny szablonu, użyj prawdziwej treści i danych oraz unikaj lorem ipsum i obrazów zastępczych.',
  },
  'web-artifacts-builder': {
    description:
      'Twórz złożone artefakty HTML dla claude.ai w React i Tailwind. Referencyjny przepływ pracy Anthropic do dostarczania bogatych, osadzalnych artefaktów.',
    examplePrompt:
      'Twórz złożone artefakty HTML dla claude.ai w React i Tailwind.',
  },
  'web-design-guidelines': {
    description:
      'Wytyczne i standardy projektowania stron internetowych opracowane przez zespół inżynierski Vercel. Obejmują układ, typografię, kolor, ruch i dostępność dla UI produktów.',
    examplePrompt:
      'Wytyczne i standardy projektowania stron internetowych opracowane przez zespół inżynierski Vercel.',
  },
  'weread-year-in-review-video-template': {
    description:
      'Szablon wideo HyperFrames inspirowany WeRead do pionowych rocznych raportów czytelniczych,\nosobistych pulpitów czytelniczych, podsumowań notatek z książek i udostępnialnych\npodsumowań roku. Użyj, gdy użytkownicy chcą raportu czytelniczego 9:16 z HTML na MP4 z ciepłą fakturą\npapieru, edytorską chińską typografią, metaforami stron książki, wyróżnieniami danych\noraz deterministycznym ruchem.',
    examplePrompt:
      'Utwórz wideo z rocznym raportem czytelniczym w stylu WeRead w formacie HyperFrames 9:16 z 12 scenami, ciepłą fakturą papieru, przejściami stron książki, statystykami czytelniczymi, notatkami, słowami kluczowymi i końcową kartą persony czytelniczej.',
  },
  'wpds': {
    description:
      'System projektowy WordPress. Zastosuj oficjalne tokeny projektowe, typografię i wzorce komponentów WordPress do motywów i witryn.',
    examplePrompt:
      'System projektowy WordPress.',
  },
  'youtube-clipper': {
    description:
      'Generowanie i edycja klipów YouTube z zautomatyzowanymi przepływami pracy — pobierz wideo źródłowe, wytnij najważniejsze fragmenty, dodaj napisy i wyeksportuj.',
    examplePrompt:
      'Generowanie i edycja klipów YouTube z zautomatyzowanymi przepływami pracy — pobierz wideo źródłowe, wytnij najważniejsze fragmenty, dodaj napisy i wyeksportuj.',
  },
};

export const PL_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Interfejs konwersacyjny stawiający AI na pierwszym miejscu, z minimalną liczbą kontrolek, jasnymi rezultatami i delegowanymi przepływami zadań dla przepływów pracy agentów.',
  'airbnb': 'Marketplace podróżniczy. Ciepły koralowy akcent, oparty na fotografii, zaokrąglone UI.',
  'airtable': 'Hybryda arkusza kalkulacyjnego i bazy danych. Kolorowa, przyjazna, ustrukturyzowana estetyka danych.',
  'ant': 'Ustrukturyzowany system projektowy zorientowany na przedsiębiorstwa, kładący nacisk na przejrzystość, spójność i wydajność w aplikacjach internetowych o dużym zagęszczeniu danych.',
  'apple': 'Elektronika użytkowa. Luksusowa biała przestrzeń, SF Pro, kinowe obrazy.',
  'application': 'Pulpit aplikacji z estetyką w odcieniach fioletu, nawigacją w górnym pasku, układami opartymi na kartach i przepływami pracy stawiającymi programistów na pierwszym miejscu.',
  'arc': '„Przeglądarka, która przegląda za Ciebie”. Półprzezroczyste powierzchnie, gradientowe ciepło, układ z paskiem bocznym na pierwszym planie.',
  'artistic': 'Wysokokontrastowy, ekspresyjny styl z kreatywną typografią i odważnymi wyborami kolorystycznymi dla efektownych wizualnie interfejsów.',
  'atelier-zero': 'Wizualny system na poziomie magazynu, oparty na kolażu: ciepłe papierowe tło, surrealistyczne\nobrazy z gipsu i architektury, ponadwymiarowa typografia displejowa, włoskowate linie,\noznaczenia sekcji cyframi rzymskimi oraz drobne edytorskie adnotacje.\nInspirowany produkcyjną wersją v',
  'bento': 'Modułowy układ siatki z blokami przypominającymi karty, jasną hierarchią, miękkimi odstępami i subtelnym kontrastem wizualnym dla uporządkowanych, łatwych do przeskanowania interfejsów.',
  'binance': 'Giełda kryptowalut. Wyrazisty żółty akcent na monochromatycznym tle, dynamika parkietu giełdowego.',
  'bmw': 'Motoryzacja klasy premium. Ciemne, ekskluzywne powierzchnie, precyzyjna estetyka niemieckiej inżynierii.',
  'bmw-m': 'Sportowa pododmarka motorsportowa. Niemal czarne powierzchnie kokpitu, trójkolorowe akcenty BMW M, ostra geometria inżynieryjna.',
  'bold': 'Mocna obecność wizualna dzięki masywnej typografii, wysokokontrastowym kolorom i imponującym układom.',
  'brutalism': 'Surowa, antyprojektowa estetyka inspirowana architekturą betonową, z nieozdobionymi elementami, niepokojącymi układami i funkcjonalnym minimalizmem.',
  'bugatti': 'Marka hipersamochodów. Kinowo czarne tło, monochromatyczna surowość, monumentalna typografia wyświetlana.',
  'cafe': 'Przytulny interfejs inspirowany kawiarnią, z ciepłymi tonami, miękką typografią i przejrzystymi układami zapewniającymi relaksujące przeglądanie.',
  'cal': 'Planowanie typu open-source. Czysty, neutralny interfejs, prostota zorientowana na deweloperów.',
  'canva': 'Platforma do tworzenia wizualnego. Żywy fioletowo-niebieski gradient, hojne odstępy, przyjazna geometria.',
  'cisco': 'Marka infrastruktury korporacyjnej. Ciemne powierzchnie budujące zaufanie, sygnałowy kolor Cisco Blue, techniczna przejrzystość.',
  'claude': 'Asystent AI firmy Anthropic. Ciepły terakotowy akcent, czysty układ redakcyjny.',
  'clay': 'Agencja kreatywna. Organiczne kształty, miękkie gradienty, układ z dyrekcją artystyczną.',
  'claymorphism': 'Miękkie, zaokrąglone, trójwymiarowe kształty imitujące plastyczną glinę, z figlarnymi, pulchnymi elementami i kolorowymi powierzchniami.',
  'clean': 'Projekt skupiony na prostocie, z obfitą przestrzenią, czytelną typografią i ograniczoną paletą kolorów, redukujący wizualny chaos.',
  'clickhouse': 'Szybka baza danych analitycznych. Akcenty w żółci, styl dokumentacji technicznej.',
  'cohere': 'Korporacyjna platforma AI. Żywe gradienty, estetyka pulpitu bogatego w dane.',
  'coinbase': 'Giełda kryptowalut. Czysta, niebieska tożsamość, nastawiona na zaufanie, instytucjonalny charakter.',
  'colorful': 'Żywe, wysokokontrastowe palety i gradienty zapewniające angażujące, zapadające w pamięć i nowoczesne doświadczenia użytkownika.',
  'composio': 'Platforma integracji narzędzi. Nowoczesna, ciemna, z kolorowymi ikonami integracji.',
  'contemporary': 'Współczesny, minimalistyczny projekt z siatkami bento, obsługą trybu ciemnego oraz wydajnymi, dostępnymi układami.',
  'corporate': 'Profesjonalny, zgodny z marką projekt ze strukturalnymi siatkami, minimalistycznymi układami i spójnymi wzorcami korporacyjnymi.',
  'cosmic': 'Futurystyczna estetyka sci-fi z ciemnymi motywami, żywymi neonowymi akcentami i wciągającymi elementami przestrzennymi.',
  'creative': 'Figlarny, oparty na postaciach projekt z ekspresyjną typografią i odważną grafiką, idealny do stron docelowych i projektów kreatywnych.',
  'cursor': 'Edytor kodu z priorytetem AI. Elegancki, ciemny interfejs, gradientowe akcenty.',
  'dashboard': 'Estetyka platformy chmurowej w ciemnym motywie z modularnymi siatkami, panelami przypominającymi szkło i wyrazistą hierarchią danych dla pulpitów produktywności.',
  'default': 'Czysty, zorientowany na produkt domyślny styl dla narzędzi B2B, pulpitów i stron użytkowych.',
  'discord': 'Platforma głosowa / czatu. Głęboki blurple, powierzchnie z priorytetem ciemnego motywu, figlarne akcenty.',
  'dithered': 'Technika renderowania wzorem kropek symulująca odcienie za pomocą ograniczonej palety, dająca nostalgiczne, retro i wysokokontrastowe efekty wizualne.',
  'doodle': 'Styl odręczny, przypominający szkic, z bazgrołami, odręcznymi czcionkami i niedoskonałymi liniami, nadający figlarny, nieformalny charakter.',
  'dramatic': 'Wysokokontrastowy, teatralny projekt z odważnymi układami, wciągającą oprawą wizualną i niekonwencjonalnymi kompozycjami przykuwającymi uwagę.',
  'duolingo': 'Platforma do nauki języków. Jasna, sowia zieleń, masywne cienie, grywalizacyjna radość.',
  'editorial': 'Redakcyjny układ inspirowany magazynem, z wyrafinowaną typografią szeryfową, strukturalnymi siatkami i eleganckimi doświadczeniami czytania.',
  'elegant': 'Pełna gracji, wyrafinowana estetyka z delikatną typografią, minimalistycznymi paletami i dopracowanymi układami emanującymi wyrafinowaniem.',
  'elevenlabs': 'Platforma głosowa AI. Ciemny, kinowy interfejs, estetyka audiowizualnej fali dźwiękowej.',
  'energetic': 'Dynamiczny, żywy styl z grubymi obramowaniami, geometrycznymi kształtami, wysokokontrastowymi kolorami i ekspresyjną typografią oddającą ruch i witalność.',
  'enterprise': 'Czysty, wysokokontrastowy projekt korporacyjny do przepływów pracy opartych na danych, z intuicyjnymi wzorcami przeciągnij i upuść oraz strukturalnymi układami.',
  'expo': 'Platforma React Native. Ciemny motyw, ciasny odstęp między literami, ukierunkowanie na kod.',
  'expressive': 'Żywy, oparty na charakterze projekt z odważnymi kolorami, figlarną grafiką i dynamicznymi układami równoważącymi kreatywność ze strukturą.',
  'fantasy': 'Estetyka fantasy inspirowana grami, z odważną, ekskluzywną oprawą wizualną, bogatymi paletami kolorów i wciągającymi elementami tematycznymi.',
  'ferrari': 'Motoryzacja klasy premium. Redakcyjne chiaroscuro, akcenty Ferrari Red, kinowa czerń.',
  'figma': 'Narzędzie do projektowania zespołowego. Żywa wielokolorowość, zabawna, a zarazem profesjonalna.',
  'flat': 'Dwuwymiarowy minimalistyczny styl z żywymi kolorami, czytelną typografią i bez efektów 3D, zapewniający szybkie i przyjazne dla użytkownika interfejsy.',
  'framer': 'Kreator stron internetowych. Wyrazista czerń i błękit, ruch na pierwszym planie, nastawienie na design.',
  'friendly': 'Przystępny, intuicyjny design z zaokrąglonymi elementami, obfitą przestrzenią i miękkimi, pastelowymi paletami kolorów.',
  'futuristic': 'Przyszłościowy design z typografią inspirowaną technologią, nowoczesnymi układami oraz elegancką, napędzaną innowacją estetyką.',
  'github': 'Platforma zorientowana na kod. Funkcjonalna gęstość, precyzja błękitu na bieli, fundamenty Primer.',
  'glassmorphism': 'Efekt matowego szkła z półprzezroczystymi warstwami, subtelnym rozmyciem i świetlistymi krawędziami dla głębi i nowoczesnej elegancji.',
  'gradient': 'Płynne przejścia kolorów i powierzchnie bogate w gradienty dla nowoczesnych, zabawnych interfejsów z wizualną głębią.',
  'hashicorp': 'Automatyzacja infrastruktury. Czysty, korporacyjny styl, czerń i biel.',
  'hud': 'Wyświetlacz przezierny (HUD) myśliwca / śmigłowca. Fosforowa zieleń na niemal czarnym tle, nakładki danych pisane wielkimi literami, kanciasta geometria. Zero niejednoznaczności przy dużej prędkości i wysokości.',
  'huggingface': 'Centrum społeczności ML. Słoneczny żółty akcent, monospace\'owa tożsamość, pogodne i gęste.',
  'ibm': 'Technologia korporacyjna. System projektowy Carbon, uporządkowana paleta błękitów.',
  'intercom': 'Komunikacja z klientami. Przyjazna paleta błękitów, konwersacyjne wzorce UI.',
  'kami': 'Redakcyjny system papierowy: ciepłe, pergaminowe płótno, akcent atramentowego błękitu, hierarchia oparta na krojach szeryfowych. Stworzony do CV, jednostronicówek, white paperów, portfolio, prezentacji — wszystkiego, co ma sprawiać wrażenie wysokiej jakości druku, a nie UI. Wielojęzyczny domyślnie.',
  'kraken': 'Handel kryptowalutami. Ciemne UI z fioletowymi akcentami, pulpity gęsto wypełnione danymi.',
  'lamborghini': 'Marka supersamochodów. Głęboko czarne powierzchnie, złote akcenty, dramatyczna typografia wielkimi literami.',
  'levels': 'Design ukierunkowany na konwersję, który usuwa tarcia i prowadzi użytkowników do działania poprzez przejrzystość, zaufanie i szybkość.',
  'linear-app': 'Zarządzanie projektami. Ultraminimalistyczny, precyzyjny, fioletowy akcent.',
  'lingo': 'Zabawny, minimalistyczny design z jasnymi kolorami, zaokrąglonymi kształtami, namacalnymi krawędziami 3D i przyjaznymi ilustracjami dla przystępnych interfejsów.',
  'loom': 'Asynchroniczne wideo Loom. Fiolet jako kolor wiodący, przyjazne powierzchnie, układ stawiający wideo na pierwszym miejscu. Czysty i profesjonalny bez korporacyjnego sztywności.',
  'lovable': 'Kreator full-stack oparty na AI. Zabawne gradienty, przyjazna estetyka deweloperska.',
  'luxury': 'Ekskluzywna ciemna estetyka z wyrazistymi nagłówkami, monochromatyczną paletą i premium charakterem dla doświadczeń luksusowych marek.',
  'mastercard': 'Globalna sieć płatności. Ciepłe, kremowe płótno, orbitalne kształty pigułek, redakcyjne ciepło.',
  'material': 'Material Design od Google z warstwowymi powierzchniami, dynamicznym motywem, wbudowanym ruchem i responsywnymi wzorcami międzyplatformowymi.',
  'meta': 'Sklep z elektroniką użytkową. Fotografia na pierwszym planie, binarne jasne/ciemne powierzchnie, przyciski CTA w kolorze Meta Blue.',
  'minimal': 'Oszczędny design podkreślający przestrzeń, czystą typografię i powściągliwy kolor dla maksymalnej przejrzystości i skupienia.',
  'minimax': 'Dostawca modeli AI. Wyrazisty ciemny interfejs z neonowymi akcentami.',
  'mintlify': 'Platforma dokumentacji. Czysta, z zielonymi akcentami, zoptymalizowana pod kątem czytania.',
  'miro': 'Współpraca wizualna. Jasnożółty akcent, estetyka nieskończonego płótna.',
  'mission-control': 'Monitorowanie misji kosmicznych / lotniczych. Ciemne centrum dowodzenia, bursztynowa telemetria, monospace\'owa precyzja. Funkcjonalna przejrzystość ponad wszystko.',
  'mistral-ai': 'Dostawca LLM o otwartych wagach. Francuski inżynieryjny minimalizm w fioletowej tonacji.',
  'modern': 'Współczesny styl redakcyjny z typografią szeryfową, minimalistycznymi paletami i czystymi układami dla dopracowanych produktów cyfrowych.',
  'mongodb': 'Baza danych dokumentowa. Branding z zielonym liściem, nacisk na dokumentację dla deweloperów.',
  'mono': 'Design oparty na monospace, inspirowany matrixem, z elementami o wysokim kontraście, kompaktową gęstością i hakersko-szykowną estetyką.',
  'neobrutalism': 'Nowoczesne ujęcie brutalizmu z wyrazistymi krawędziami, intensywnymi kolorami akcentowymi oraz surowymi, mocno kontrastowymi układami na ciepłych powierzchniach.',
  'neon': 'Elektryzujące efekty neonowej poświaty z mocno kontrastowymi zestawieniami kolorów dla wyrazistych, przyciągających uwagę interfejsów.',
  'neumorphism': 'Miękkie, wytłaczane elementy UI z cieniami wewnętrznymi i zewnętrznymi na monochromatycznych powierzchniach dla namacalnego, wtopionego wyglądu.',
  'nike': 'Handel artykułami sportowymi. Monochromatyczne UI, ogromna typografia wielkimi literami, pełnoekranowa fotografia.',
  'notion': 'Wszechstronna przestrzeń robocza. Ciepły minimalizm, szeryfowe nagłówki, miękkie powierzchnie.',
  'nvidia': 'Obliczenia na GPU. Zielono-czarna energia, estetyka technicznej mocy.',
  'ollama': 'Uruchamiaj modele LLM lokalnie. Prostota oparta na terminalu i monochromii.',
  'openai': 'Spokojny, niemal monochromatyczny system osadzony w głębokiej czerni z odcieniem morskim, z dużą ilością bieli i edytorską typografią.',
  'opencode-ai': 'Platforma do programowania z AI. Ciemny motyw skupiony na deweloperach.',
  'pacman': 'Projekt inspirowany retro automatami do gier z pikselowymi fontami, kropkowanymi obramowaniami, żywymi, kontrastowymi kolorami i estetyką gier 8-bitowych.',
  'paper': 'Projekt o teksturze papieru, inspirowany drukiem, z oszczędną paletą, czystą typografią szeryfową/bezszeryfową i wrażeniem dotykowej powierzchni.',
  'perplexity': 'Konwersacyjna wyszukiwarka oparta na AI. Głęboko ciemne tło, ostra typografia, pojedynczy fioletowy akcent, gęsta hierarchia informacji.',
  'perspective': 'Projekt z przestrzenną głębią wykorzystujący widoki izometryczne, punkty zbiegu i warstwowe elementy, które kierują uwagę poprzez realizm zbliżony do 3D.',
  'pinterest': 'Wizualne odkrywanie. Czerwony akcent, układ kafelkowy (masonry), nacisk na obraz.',
  'playstation': 'Sprzedaż konsol do gier. Trójpłaszczyznowy układ kanałów, spokojna, autorytatywna typografia ekspozycyjna, cyjanowy efekt powiększenia przy najechaniu.',
  'posthog': 'Analityka produktowa. Żartobliwy branding z jeżem, przyjazny deweloperom ciemny interfejs.',
  'premium': 'Premium estetyka inspirowana Apple, z precyzyjnymi odstępami, nowoczesną typografią i dopracowanym, eleganckim językiem wizualnym.',
  'professional': 'Dopracowany, gotowy do zastosowań biznesowych projekt z nowoczesną typografią, uporządkowanymi układami i godną zaufania tożsamością wizualną.',
  'publication': 'Inspirowany drukiem język wizualny dla książek, czasopism i raportów, z edytorskimi siatkami i ekspresyjną typografią.',
  'raycast': 'Launcher zwiększający produktywność. Elegancka ciemna obudowa, żywe gradientowe akcenty.',
  'refined': 'Starannie dobrany, nowoczesny styl minimalistyczny z elegancką typografią szeryfową i stonowanymi, wyrafinowanymi paletami.',
  'renault': 'Francuska motoryzacja. Żywe gradienty zorzy polarnej, typografia NouvelR, śmiała energia.',
  'replicate': 'Uruchamiaj modele ML przez API. Czyste białe tło, nacisk na kod.',
  'resend': 'API do poczty e-mail. Minimalistyczny ciemny motyw, akcenty w czcionce o stałej szerokości.',
  'retro': 'Projekt w stylu retro z typografią inspirowaną vintage, kontrastowymi paletami retro i nostalgicznymi elementami wizualnymi.',
  'revolut': 'Bankowość cyfrowa. Elegancki ciemny interfejs, gradientowe karty, fintechowa precyzja.',
  'runwayml': 'Generowanie wideo przez AI. Filmowy ciemny interfejs, układ bogaty w multimedia.',
  'sanity': 'Bezgłowy CMS. Czerwony akcent, edytorski układ skupiony na treści.',
  'sentry': 'Monitorowanie błędów. Ciemny dashboard, duża gęstość danych, różowo-fioletowy akcent.',
  'shadcn': 'Projekt inspirowany shadcn/ui z minimalistycznymi, czystymi komponentami, monochromatyczną paletą i wzorcami utility-first.',
  'shopify': 'Platforma e-commerce. Filmowy styl z dominacją ciemności, neonowy zielony akcent, ultralekka typografia.',
  'simple': 'Prosty, pozbawiony zbędnych ozdobników projekt z czystą typografią, neutralnymi kolorami i intuicyjnymi układami, które nie przeszkadzają.',
  'skeumorphism': 'Naśladowanie świata rzeczywistego z teksturowanymi powierzchniami, efektami 3D i znajomymi fizycznymi metaforami dla intuicyjnych interfejsów cyfrowych.',
  'slack': 'Platforma komunikacji w miejscu pracy. Dominująca barwa bakłażanowa, wieloakcentowa paleta logo, jasne powierzchnie z ciemnym panelem bocznym, ciepła i przystępna.',
  'sleek': 'Nowoczesna estetyka minimalistyczna z czystymi liniami, przemyślaną paletą kolorów, subtelnymi interakcjami i spójnymi odstępami.',
  'spacex': 'Technologia kosmiczna. Surowa czerń i biel, pełnoekranowe obrazy, futurystyczny styl.',
  'spacious': 'Duża ilość białej przestrzeni, spójne odstępy wewnętrzne i układy oparte na siatce dla czystych, czytelnych i oddychających interfejsów.',
  'spotify': 'Streaming muzyki. Żywa zieleń na ciemnym tle, śmiała typografia, oparty na okładkach albumów.',
  'starbucks': 'Globalna marka kawiarni. Czteropoziomowy system zieleni, ciepłe kremowe tło, w pełni zaokrąglone przyciski.',
  'storytelling': 'Projekt oparty na narracji, wykorzystujący grafikę, teksty i interakcję, aby prowadzić użytkowników przez angażujące, poruszające emocjonalnie podróże.',
  'stripe': 'Infrastruktura płatnicza. Charakterystyczne fioletowe gradienty, elegancja grubości 300.',
  'supabase': 'Otwartoźródłowa alternatywa dla Firebase. Ciemny szmaragdowy motyw, nacisk na kod.',
  'superhuman': 'Szybki klient poczty. Premium ciemny interfejs, sterowanie z klawiatury, fioletowa poświata.',
  'tesla': 'Motoryzacja elektryczna. Radykalna redukcja, fotografia na całą szerokość okna, niemal zerowy interfejs.',
  'tetris': 'Projekt inspirowany klasyczną grą w klocki, z żartobliwymi kolorami, śmiałymi fontami ekspozycyjnymi i zwartymi, pełnymi energii układami.',
  'theverge': 'Media o tematyce technologicznej. Akcenty w kolorze kwaśnej mięty i ultrafioletu, typografia Manuka, kafelki opowieści w stylu ulotek rave\'owych.',
  'together-ai': 'Otwartoźródłowa infrastruktura AI. Techniczny projekt w stylu planu konstrukcyjnego.',
  'totality-festival': 'Kosmiczny, premium system w stylu glassmorphism w ciemnej tonacji, oddający dojmujący zachwyt zaćmienia Słońca — obsydianowe powierzchnie, bursztynowe akcenty „korony" i cyjanowe atmosferyczne detale.',
  'trading-terminal': 'Finansowy terminal transakcyjny w stylu Bloomberg. Wyłącznie ciemny, gęsty od danych, cyjanowo-koralowe sygnały kupna/sprzedaży. Wszystko czytelne na pierwszy rzut oka z odległości dwóch metrów.',
  'uber': 'Platforma mobilności. Wyrazista czerń i biel, ciasna typografia, miejska energia.',
  'urdu': 'Cyfrowe doświadczenia w pierwszej kolejności w urdu, z natywną obsługą RTL, typografią nastaliq i dwujęzyczną harmonią.',
  'vercel': 'Wdrażanie frontendu. Czarno-biała precyzja, font Geist.',
  'vibrant': 'Żywy, kolorowy design z wyrazistą, zabawną typografią, ciepłymi akcentami i dynamiczną energią wizualną.',
  'vintage': 'Nostalgia lat 1950–1990 ze skeuomorficznymi akcentami, ziarnistymi teksturami, retro paletami kolorów i typografią w stylu pikselowym.',
  'vodafone': 'Globalna marka telekomunikacyjna. Monumentalna ekspozycyjna typografia wersalikami, pasma rozdziałów w kolorze Vodafone Red.',
  'voltagent': 'Framework agentów AI. Pustkowa czerń płótna, szmaragdowy akcent, natywnie terminalowy.',
  'warm-editorial': 'Magazynowa estetyka oparta na szeryfach. Terakotowy akcent na ciepłym, złamanym bieli papieru —\ndobry dla treści długiej formy, redakcyjnych oraz stron marketingowych prowadzonych przez markę.',
  'warp': 'Nowoczesny terminal. Ciemny interfejs przypominający IDE, blokowy interfejs poleceń.',
  'webex': 'Platforma współpracy. Dynamiczna typografia, niebieski system akcji, wielobarwne spektrum akcentów dla wielu użytkowników.',
  'webflow': 'Wizualny kreator stron WWW. Akcent w niebieskim, dopracowana estetyka strony marketingowej.',
  'wechat': 'Język wizualny marki dla Mini Programów WeChat, kont oficjalnych i rozszerzeń otwartego ekosystemu.',
  'wired': 'Magazyn technologiczny. Papierowo-biała gęstość wielkoformatowej gazety, niestandardowa ekspozycyjna typografia szeryfowa, monospace\'owe nadtytuły, atramentowo-niebieskie linki.',
  'wise': 'Przelewy pieniężne. Jasnozielony akcent, przyjazny i przejrzysty.',
  'x-ai': 'Laboratorium AI Elona Muska. Surowa monochromia, futurystyczny minimalizm.',
  'xiaohongshu': 'Lifestylowa platforma społecznościowa UGC. Charakterystyczna czerwień marki, hojne zaokrąglenia, treść na pierwszym miejscu.',
  'zapier': 'Platforma automatyzacji. Ciepły pomarańcz, przyjazna, oparta na ilustracjach.',
};

export const PL_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'AI i LLM',
  'Automotive': 'Motoryzacja',
  'Backend & Data': 'Backend i dane',
  'Bold & Expressive': 'Odważne i ekspresyjne',
  'Creative & Artistic': 'Kreatywne i artystyczne',
  'Design & Creative': 'Design i kreacja',
  'Developer Tools': 'Narzędzia dla deweloperów',
  'E-Commerce & Retail': 'E-commerce i handel detaliczny',
  'Editorial & Print': 'Redakcja i druk',
  'Editorial / Personal / Publication': 'Redakcja / Osobiste / Publikacja',
  'Editorial · Studio': 'Redakcja · Studio',
  'Fintech & Crypto': 'Fintech i krypto',
  'Layout & Structure': 'Układ i struktura',
  'Media & Consumer': 'Media i konsument',
  'Modern & Minimal': 'Nowoczesne i minimalistyczne',
  'Morphism & Effects': 'Morfizm i efekty',
  'Productivity & SaaS': 'Produktywność i SaaS',
  'Professional & Corporate': 'Profesjonalne i korporacyjne',
  'Retro & Nostalgic': 'Retro i nostalgiczne',
  'Social & Messaging': 'Społeczność i komunikatory',
  'Starter': 'Początkujący',
  'Themed & Unique': 'Tematyczne i unikalne',
};

export const PL_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Reklama',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'Projektowanie aplikacji / stron WWW',
  'Branding': 'Branding',
  'Cinematic': 'Filmowe',
  'Data': 'Dane',
  'Game UI': 'Interfejs gry',
  'General': 'Ogólne',
  'Illustration': 'Ilustracja',
  'Infographic': 'Infografika',
  'Live Artifact': 'Żywy artefakt',
  'Marketing': 'Marketing',
  'Motion Graphics': 'Grafika ruchoma',
  'Product': 'Produkt',
  'Profile / Avatar': 'Profil / Awatar',
  'Short Form': 'Krótka forma',
  'Social / Meme': 'Społecznościowe / Mem',
  'Social Media Post': 'Post w mediach społecznościowych',
  'Travel': 'Podróże',
  'VFX / Fantasy': 'VFX / Fantasy',
  'VFX / HTML-in-Canvas': 'VFX / HTML-in-Canvas',
};

export const PL_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': 'render-3d',
  'action': 'akcja',
  'ancient-china': 'starożytne-chiny',
  'anime': 'anime',
  'app-showcase': 'prezentacja-aplikacji',
  'archery': 'łucznictwo',
  'arpg': 'arpg',
  'audio-reactive': 'reagujące-na-dźwięk',
  'boss-fight': 'walka-z-bossem',
  'brand': 'marka',
  'branding': 'branding',
  'captions': 'napisy',
  'cavalry': 'kawaleria',
  'chart': 'wykres',
  'childlike': 'dziecięce',
  'choreography': 'choreografia',
  'cinematic': 'filmowy',
  'cinematic-romance': 'filmowy-romans',
  'combat': 'walka',
  'combo': 'kombo',
  'companion-to-image': 'towarzysz-do-obrazu',
  'counter': 'licznik',
  'crayon': 'kredka',
  'cyberpunk': 'cyberpunk',
  'dance': 'taniec',
  'dashboard': 'pulpit',
  'data': 'dane',
  'data-viz': 'wizualizacja-danych',
  'destruction': 'zniszczenie',
  'displacement': 'przemieszczenie',
  'editorial': 'redakcyjny',
  'elden-ring': 'elden-ring',
  'endcard': 'karta-końcowa',
  'escort': 'eskorta',
  'escort-mission': 'misja-eskorty',
  'fantasy': 'fantasy',
  'fashion': 'moda',
  'fighting-game': 'bijatyka',
  'food': 'jedzenie',
  'game-cinematic': 'filmowa-scena-gry',
  'game-ui': 'interfejs-gry',
  'grid-sheet': 'arkusz-siatki',
  'guanyu': 'guanyu',
  'hand-drawn': 'rysowany-ręcznie',
  'hero': 'baner-główny',
  'html-in-canvas': 'html-na-płótnie',
  'hud': 'hud',
  'hud-safe': 'hud-bezpieczny',
  'hype': 'hype',
  'hyperframes': 'hyperframes',
  'idol': 'idol',
  'illustration': 'ilustracja',
  'image-to-image': 'obraz-na-obraz',
  'infographic': 'infografika',
  'iphone': 'iphone',
  'japanese': 'japoński',
  'karaoke': 'karaoke',
  'key-visual': 'kluczowa grafika',
  'keynote': 'prezentacja',
  'kinetic-typography': 'typografia kinetyczna',
  'linear-style': 'styl liniowy',
  'liquid': 'płynny',
  'liquid-glass': 'płynne szkło',
  'live-artifact': 'żywy artefakt',
  'logo': 'logo',
  'lyubu': 'lyubu',
  'macbook': 'macbook',
  'magnetic': 'magnetyczny',
  'map': 'mapa',
  'marketing': 'marketing',
  'minimal': 'minimalistyczny',
  'mmo': 'mmo',
  'mobile': 'mobilny',
  'money': 'pieniądze',
  'mounted-combat': 'walka konna',
  'nature': 'natura',
  'open-world': 'otwarty świat',
  'otaku-dance': 'taniec otaku',
  'outro': 'zakończenie',
  'overlay': 'nakładka',
  'particles': 'cząsteczki',
  'pipeline': 'potok',
  'portal': 'portal',
  'portrait': 'portret',
  'pose-reference': 'wzorzec pozy',
  'product': 'produkt',
  'product-demo': 'demo produktu',
  'product-promo': 'promocja produktu',
  'rework': 'przeróbka',
  'route': 'trasa',
  'saas': 'saas',
  'sequence': 'sekwencja',
  'shader': 'shader',
  'shatter': 'rozbicie',
  'sizzle': 'sizzle',
  'social': 'społecznościowe',
  'storyboard': 'scenopis',
  'street-fighter': 'street-fighter',
  'style-transfer': 'transfer-stylu',
  'tekken': 'tekken',
  'text': 'tekst',
  'three-kingdoms': 'trzy-krolestwa',
  'tiktok': 'tiktok',
  'title-card': 'plansza-tytulowa',
  'transform': 'przeksztalcenie',
  'travel': 'podroze',
  'tts': 'tts',
  'typography': 'typografia',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'pionowe',
  'video-reference': 'referencja-wideo',
  'vs-screen': 'ekran-vs',
  'webgl': 'webgl',
  'website-to-video': 'strona-na-wideo',
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const PL_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: 'Infografika ewolucji na kamiennych schodach 3D',
    summary:
      'Przekształca płaską oś czasu ewolucji w realistyczną infografikę na kamiennych schodach 3D ze szczegółowymi renderami organizmów i ustrukturyzowanymi panelami bocznymi.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Ilustracja anime z walką sztuk walki',
    summary:
      'Generuje dynamiczną, mocną ilustrację w stylu anime przedstawiającą dwie żeńskie postacie walczące w tradycyjnym dojo z efektami energii żywiołów.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'Makieta interfejsu transmisji live e-commerce',
    summary:
      'Generuje realistyczny interfejs transmisji live z mediów społecznościowych nałożony na portret, z konfigurowalnymi wiadomościami czatu, wyskakującymi prezentami i kartą zakupu produktu.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Zrzut ekranu z gry - bijatyka anime: Captain Ryuuga vs Kaze Renshin',
    summary:
      'Kluczowy obraz bijatyki / zrzut ekranu walki w grze, w stylu grafiki wprowadzającej Street Fighter 6 lub Tekken 8. Dwóch wojowników w stylu anime staje naprzeciw siebie na środku dramatycznego dziedzińca chińskiej świątyni nocą — po lewej rozebrany pirat w słomkowym kapeluszu z ciepłą pomarańczowo-czerwoną aurą ognia, a po prawej kolczasty mistrz sztuk walki w pomarańczowym gi ładujący ogromną, trzaskającą niebieską kulę energii błyskawicy. Dostarczany z kompletnym HUD-em bijatyki (podwójne paski zdrowia, licznik rund, panele portretowe P1/P2 z nazwanymi wojownikami i emblematami, liczniki kombo dla każdej strony i maksymalne wskaźniki). Ciepło-pomarańczowy kontra chłodno-niebieski podział kolorystyki odpowiada konwencji rywalizujących wojowników w tym gatunku. Dostrojone dla gpt-image-2 w formacie 16:9.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Zrzut ekranu z gry - ARPG Trzy Królestwa: Guan Yu zabija Yan Lianga',
    summary:
      'Zrzut ekranu z gry akcji RPG przedstawiający ikoniczną scenę z Trzech Królestw, w której Guan Yu na swym rumaku bojowym Czerwonym Zającu przedziera się przez pole bitwy w ulewnym deszczu i szarżuje na wrogiego generała Yan Lianga. Wyrenderowane w kinowym, fotorealistycznym stylu Black Myth: Wukong, Unreal Engine 5, z kamerą śledzącą z trzeciej osoby z tyłu i z lewej strony konnego bohatera. Pełny HUD walki z bossem (portret, minimapa z gęstymi punktami wrogów, pasek umiejętności z monitem o cios kończący, unoszący się pasek HP bossa nad wrogim generałem) zamienia scenę w moment walki w grze AAA ARPG. Dostrojone dla gpt-image-2 w formacie 16:9.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Zrzut ekranu z gry - ARPG Trzy Królestwa: Łucznictwo Lü Bu przy Yuanmen',
    summary:
      'Zrzut ekranu z gry akcji RPG przedstawiający słynną scenę z Trzech Królestw, w której Lü Bu strąca strzałą odległą halabardę przy bramie obozu, by powstrzymać bitwę. Wyrenderowane w kinowym, fotorealistycznym stylu Black Myth: Wukong, Unreal Engine 5 Nanite/Lumen, z kamerą rozgrywki zza ramienia w trzeciej osobie. Pełna nakładka HUD w grze (paski HP + qi, minimapa, pasek umiejętności, znacznik celu z odczytem odległości do dalekiej halabardy) sprawia, że scena wygląda jak prawdziwy zrzut z gry ARPG nowej generacji, a nie przerywnik filmowy. Dostrojone dla gpt-image-2 w formacie 16:9.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Zrzut ekranu z gry - ARPG Trzy Królestwa: Ucieczka Zhao Yuna z dzieckiem pod Changbanpo',
    summary:
      'Zrzut ekranu z gry akcji RPG przedstawiający legendarną scenę z Trzech Królestw, w której Zhao Yun trzyma w jednym ramieniu niemowlę Liu Chana i przebija się przez linie wroga z włócznią w drugim ręku pod Changbanpo. Wyrenderowane w kinowym, fotorealistycznym stylu Black Myth: Wukong połączonym z Elden Ring, Unreal Engine 5 z pełnym Nanite, ray-tracingiem Lumen i wolumetrycznymi promieniami światła. Emocjonalne sedno — jedno ramię chroniące owinięte niemowlę, drugie walczące o życie — wzmacnia pełna nakładka HUD, w tym dedykowany pasek ochrony ESCORT dla dziecka, licznik kombo i wyskakujące liczby obrażeń w powietrzu nad odrzuconymi wrogami. Dostrojone dla gpt-image-2 w formacie 16:9.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Interfejs gry - HUD otwartego świata MMO ze starożytnych Chin',
    summary:
      'Generuje makietę zrzutu ekranu HUD w grze dla MMO AAA z otwartym światem ze starożytnych Chin, w kinowym, fotorealistycznym stylu Black Myth: Wukong. Piękna szermierka jako protagonistka stanowi centrum kadru w scenie mglistego górskiego starożytnego sanktuarium, otoczona kompletnym HUD-em MMO: portret postaci w lewym górnym rogu z paskami HP/MP/wytrzymałości i ikonami wzmocnień, pasek umiejętności na dole pośrodku z ikonami umiejętności w stylu chińskiej kaligrafii, minimapa w prawym górnym rogu ze znacznikami zadań, panel śledzenia zadań po prawej stronie, przewijane okno czatu w lewym dolnym rogu, unoszące się w przestrzeni świata tabliczki z imionami NPC i wykrzyknik zadania. Wyrenderowane jako realistyczny zrzut ekranu monitora, 16:9, odpowiednie do prezentacji ofertowych, grafiki kluczowej w stylu gamescom oraz teaserów gier na Xiaohongshu/bilibili.',
  },
  'illustrated-city-food-map': {
    title: 'Ilustrowana mapa kulinarna miasta',
    summary:
      'Generuje ręcznie rysowaną, akwarelową mapę turystyczną z ponumerowanymi lokalnymi specjałami kulinarnymi, punktami orientacyjnymi i legendą.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Ilustracja - Przeróbka dziecięcego rysunku kredkami',
    summary:
      'Prompt do transferu stylu, który przekształca dowolny obraz referencyjny (zdjęcie produktu, zrzut ekranu, portret, makietę UI) w ręcznie rysowaną ilustrację kredkami, wyglądającą tak, jakby stworzyło ją 10-letnie dziecko. Zastępuje oryginalną paletę jasnymi, zabawnymi kolorami kredek na czystym białym papierze i dodaje dziecięcą fantazję — zamki, słodycze, gwiazdy, chmury, tęcze — by wzmocnić niewinny, bajkowy klimat. Działa jako edycja obraz-na-obraz w GPT-image-2 (wymaga przesłania obrazu referencyjnego wraz z promptem); dobrze sprawdza się przy zrzutach ekranu stron internetowych, kluczowych grafikach marki, zdjęciach produktów i portretach.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'Infografika - Rozkład choreografii tańca otaku (Gokuraku Jodo, 16 paneli)',
    summary:
      'Pojedynczy pionowy plakat 2:3 skomponowany jako siatka 4×4 z 16 połączonych kwadratowych paneli, tworzących pełną tablicę z rozkładem choreografii słynnej japońskiej piosenki do tańca otaku 極楽浄土 (Gokuraku Jodo). Każdy panel przedstawia tę samą uroczą, półrealistyczną dziewczynę-idolkę w stylu anime (różowe kucyki, mundurek szkolnej idolki z marynarskim kołnierzem) wykonującą jedną charakterystyczną pozę z tańca, w pełnej postaci, na pastelowo-różowym tle, z małym paskiem japońskiego podpisu na dole i ponumerowanym kółkiem w lewym górnym rogu. Celowo zaprojektowany jako arkusz REFERENCYJNY POZ do generowania wideo przez AI — każda sylwetka jest wyraźna i jednoznaczna, bez linii ruchu czy bałaganu w tle. Dostrojony do gpt-image-2, proporcje 2:3. Kategoria: Infografika.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Slajd objaśniający Momotaro w stylu hybrydowym',
    summary:
      'Prompt, który łączy prostą, ciepłą estetykę ilustracji Irasutoya z wysoką gęstością informacji charakterystyczną dla japońskich slajdów rządowych.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Pulpit zespołu w stylu Notion (żywy artefakt)',
    summary:
      'Makieta jednoekranowego pulpitu zespołu natywnego dla Notion — siatka KPI, 7-dniowy wykres iskrowy, kanał aktywności i tabela zadań połączona z bazą danych. Wizualne uzupełnienie umiejętności żywego artefaktu; połącz z nią dla odświeżalnych / opartych na konektorach uruchomień lub użyj samodzielnie jako statyczną makietę.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profil / Awatar - Dziewczyna anime do zdjęcia filmowego',
    summary:
      'Ten prompt zmienia ilustrację referencyjną postaci w realistyczny, ciepły w tonacji portret w stylu vintage we wnętrzu, zachowując oryginalny strój, pozę i kota.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profil / Awatar - Sesja zdjęciowa mody casualowej w siatce',
    summary:
      'Ustrukturyzowany prompt JSON do kolażu 4 zdjęć z sesji mody casualowej ze szczegółowymi parametrami obiektu i oświetlenia.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profil / Awatar - Filmowy portret mężczyzny z Azji Południowej z sępami',
    summary:
      'Szczegółowy filmowy portret młodego mężczyzny z Azji Południowej w mrocznej, posępnej scenerii dark fantasy, otoczonego sępami i krukami.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profil / Awatar - Cyberpunkowy portret anime z neonowym tekstem na twarzy',
    summary:
      'Stylowy, nasycony neonem portret anime do plakatów, grafik na media społecznościowe lub futurystycznych wizualizacji marki.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profil / Awatar - Elegancka dziewczyna fantasy w fioletowym ogrodzie',
    summary:
      'Ten prompt generuje dopracowany portret fantasy w stylu anime przedstawiający elegancką kobietę z lśniącymi, ułożonymi włosami, ozdobnym fioletowo-czarnym strojem i scenerią magicznego ogrodu pełnego kwiatów, idealny do postaci',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profil / Awatar - Eteryczny portret fantasy z niebieskimi włosami',
    summary:
      'Ten prompt generuje delikatny, świetlisty portret postaci fantasy w stylu anime, idealny do tworzenia eleganckich pionowych grafik kluczowych lub ilustracji postaci z rozwianymi włosami i sennym wiosennym klimatem.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profil / Awatar - Efektowna kobieta w czerni',
    summary:
      'Ten prompt generuje fotorealistyczny portret w luksusowym stylu przedstawiający elegancką kobietę w czarnym stroju z głębokim dekoltem, idealny do edytorialu modowego lub fotografii kosmetycznej.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profil / Awatar - Prompty do hiperrealistycznej tekstury selfie',
    summary:
      'Szczegółowe fragmenty promptów do generowania realistycznych tekstur skóry i autentycznego kadrowania selfie z telefonu, skupiające się na widocznych porach i naturalnym oświetleniu.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profil / Awatar - Portret magini fantasy w odcieniach lawendy',
    summary:
      'Ten prompt generuje dopracowany portret fantasy w stylu anime przedstawiający elegancką księżniczkę-maginię z lśniącymi blond włosami, fioletowymi kwiatami i ozdobnym kryształowym strojem, idealny do grafik postaci lub magicznych ilustr',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profil / Awatar - Monochromatyczny portret studyjny',
    summary:
      'Prompt do fotografii komercyjnej najwyższej klasy przedstawiający monochromatyczny portret z charakterystycznym dwudzielnym tłem i dramatycznym oświetleniem studyjnym.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profil / Awatar - Renowacja starego zdjęcia do portretu z lustrzanki',
    summary:
      'Ten prompt odnawia uszkodzone, vintage\'owe zdjęcie 4-osobowej rodziny w czysty, pokolorowany, realistyczny portret w wysokiej rozdzielczości, służący do naprawy i poprawy zdjęć.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profil / Awatar - Poetycki portret kobiety w ogrodzie',
    summary:
      'Ten prompt generuje realistyczny portret w stylu edytorialowym przedstawiający oczytaną młodą kobietę w nasłonecznionym ogrodzie, idealny do fotografii lifestyle\'owej, brandingu literackiego lub eleganckich wizerunków postaci.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profil / Awatar - Profesjonalna tapeta z portretem tożsamości',
    summary:
      'Generuje wysokiej rozdzielczości, ekskluzywną tapetę przedstawiającą osobę w profesjonalnym stroju wraz z aktywnościami związanymi z karierą i typografią.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profil / Awatar - Realistycznie niedoskonałe selfie AI',
    summary:
      'Kreatywny prompt używany z GPT Image 2 do generowania „nieudanego” selfie, które wygląda jak przypadkowy, niskiej jakości kadr ze smartfona.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profil / Awatar - Podpisany portret markerem na shikishi',
    summary:
      'Generuje żywy, podpisany portret w stylu markerowym na kwadratowej tablicy shikishi, przydatny do autografów fan-artowych, pamiątkowych postów z ilustracjami oraz spersonalizowanych wizualizacji z podziękowaniami.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profil / Awatar - Portret śnieżnej królowej-królika',
    summary:
      'Prompt do realistycznego portretu fantasy generujący dostojną kobietę o motywie królika w ozdobnym zimowym hanfu, stojącą w scenerii zaśnieżonej górskiej świątyni.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profil / Awatar - Portret w hanfu z maską śnieżnego królika',
    summary:
      'Ten prompt generuje filmowy, zimowy portret fantasy zamaskowanej kobiety w białym Hanfu w króliczym motywie, idealny do eleganckiej grafiki postaci i klimatycznych prezentacji obrazów AI.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profil / Awatar - Portret w śnieżnym króliczym Hanfu',
    summary:
      'Ten prompt generuje niezwykle szczegółowy portret fantasy pięknej kobiety z króliczymi uszami w haftowanym hanfu, idealny do eleganckiej grafiki postaci, projektowania kostiumów lub filmowych prezentacji portretów AI.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profil / Awatar - Portret śnieżnego króliczego ducha',
    summary:
      'Ten prompt generuje spokojny portret fantasy anonimowej kobiety z króliczymi uszami zimą, idealny do klimatycznej grafiki postaci i stylizowanych ilustracji profilowych.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profil / Awatar - Portret w Hanfu z dynastii Song',
    summary:
      'Zoptymalizowany prompt do generowania szczegółowego i realistycznego portretu piękności w tradycyjnym Hanfu z dynastii Song na tle starożytnego dziedzińca.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Post w mediach społecznościowych - Plakat zapowiadający strój ze sklepu Pokémon w stylu anime',
    summary:
      'Ten prompt generuje plakat zapowiadający modę w stylu anime w miękkich, pastelowych barwach, przedstawiający dziewczynę z rozmytą twarzą w niebieskiej sukience wewnątrz sklepu Pokémon, idealny do zapowiedzi strojów i grafik promocyjnych postaci.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Post w mediach społecznościowych - Filmowa scena w windzie',
    summary:
      'Prompt do generowania nastrojowej, filmowej sceny przedstawiającej kobietę wewnątrz metalowej windy z realistycznym oświetleniem i odbiciami.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Post w mediach społecznościowych - Zdezorientowana dziewczyna elf przy pastelowym biurku',
    summary:
      'Ten prompt generuje miękką, pastelową ilustrację anime przedstawiającą dziewczynę elfa piszącą na komputerze w przytulnym, kawaii miejscu pracy, idealną do postów w mediach społecznościowych, tapet lub grafiki o tematyce streamerskiej.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Post w mediach społecznościowych - Edytorska fotografia mody',
    summary:
      'Nastrojowy prompt skupiony na modzie do minimalistycznej sceny studyjnej z miękkim oświetleniem i ciepłymi tonami.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Post w mediach społecznościowych - Edytorski kolaż modowy',
    summary:
      'Bardzo szczegółowy prompt do kolażu zdjęć 2x2 do edytorskich ujęć modowych, skupiony na spójnej stylizacji, określonym oświetleniu i rysach twarzy ze zdjęcia referencyjnego.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Post w mediach społecznościowych - Plakat ogłaszający transfer do PSG',
    summary:
      'Odważny, profesjonalny plakat ogłaszający podpisanie kontraktu piłkarza z Paris Saint-Germain, do mediów społecznościowych lub sportowych grafik promocyjnych.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Post w mediach społecznościowych - Storyboard sensacyjnego tańca dziewczyny (8 ujęć)',
    summary:
      'Pełny zestaw promptów storyboardu z 8 ujęciami do generowania spójnej, kadr po kadrze, sekwencji tanecznej stylowej postaci. Zawiera wspólne globalne tokeny stylu, wielokrotnego użytku negatywny prompt oraz osiem promptów na ujęcie (poza otwierająca, kołysanie biodrami, fala ciała, skręt talii na beat-drop, boczne kołysanie biodrami, odrzut włosów, mocna postawa, poza końcowa). Dostrojony do modeli klasy GPT-Image-2: zwięzłe słownictwo, brak wrażliwych sformułowań, spójny język kadrowania i oświetlenia we wszystkich ujęciach, aby kadry sprawiały wrażenie jednej ciągłej choreografii.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Post w mediach społecznościowych - Retro okładka magazynu kulturalnego na Dzień Showa',
    summary:
      'Ciepła, edytorska strona tematyczna o japońskim święcie, łącząca grafikę postaci anime, nostalgiczne uliczne obrazy z epoki Showa i magazynowy układ informacyjny do sezonowych promocji kulturalnych.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Post w mediach społecznościowych - Generowanie stroju modowego do mediów społecznościowych',
    summary:
      'Prompt do generowania tygodniowych rekomendacji strojów w stylu blogera modowego na podstawie profilu postaci, wraz z etykietami i cenami produktów.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Post w mediach społecznościowych - Prompt do kolażu z migawek podróżniczych',
    summary:
      'Szczegółowy prompt do tworzenia nostalgicznego, 12-kadrowego kolażu zdjęć podróżniczych w stylu smartfonowym, przedstawiających samotną podróż.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Post w mediach społecznościowych - Vintage szkic malarza szyldów',
    summary:
      'Generuje odręczny szkic markerem na papierze z realistycznymi detalami, takimi jak linie grafitu i rozlewanie się tuszu, idealny do stylów liternictwa vintage.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'Plakat z widokiem rozłożonym gogli VR',
    summary:
      'Generuje zaawansowany technologicznie diagram widoku rozłożonego gogli VR ze szczegółowymi opisami komponentów i tekstem promocyjnym.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Animowany 3D chłopiec budujący z Lego',
    summary:
      'Wieloujęciowy prompt wideo w stylu animacji 3D opisujący chłopca starannie składającego klocki Lego w pokoju, z efektami time-lapse.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Dekada doskonalenia - metamorfoza',
    summary:
      'Prompt transformacyjny dla Seedance 2.0 przedstawiający przemianę mężczyzny z swobodnego otoczenia z 2016 roku do luksusowego stylu życia w Dubaju w 2026 roku, przy zachowaniu spójności postaci.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Ratunek od starożytnego smoka strażnika',
    summary:
      'Szczegółowy, wieloujęciowy filmowy prompt do historii o dziewczynie w deszczowej wiosce uratowanej przez wyłaniającego się smoka, skupiony na efektach wizualnych i klimatycznym dźwięku.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Wideo FPV ze starożytnego indyjskiego królestwa',
    summary:
      'Dynamiczny, filmowy prompt w stylu drona FPV przedstawiający mistyczne indyjskie królestwo ze świątyniami i dżunglami.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt do transferu animacji i śledzenia kamery',
    summary:
      'Techniczny prompt dla Seedance 2.0, który stosuje określone odniesienie ruchu do postaci, zachowując jednocześnie stałe śledzenie kamery.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Taniec z transformacją stroju zsynchronizowaną z rytmem',
    summary:
      'Prompt dla Seedance 2.0, który koordynuje taniec postaci podążający za klatkami rozbicia ruchu, jednocześnie wykonując zmianę stroju zsynchronizowaną z rytmem.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Sekwencja grafiki ruchomej z wprowadzeniem postaci',
    summary:
      'Złożony, wieloetapowy prompt grafiki ruchomej do wprowadzenia zespołu postaci z określonymi nakładkami UI i przejściami, zaprojektowany dla modelu Seedance 2.0.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Filmowa sekwencja świętowania urodzin',
    summary:
      'Bardzo szczegółowy, wielokadrowy prompt wideo do sekwencji urodzinowej, skupiający się na spójności postaci i emocjonalnym opowiadaniu historii.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Filmowa interakcja ze smokiem i lot',
    summary:
      'Szczegółowy prompt w stylu storyboardu do wideo przedstawiającego emocjonalną interakcję kobiety ze smokiem, po której następuje filmowa sekwencja lotu.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Filmowy taniec dłoni kobiety z Azji Wschodniej',
    summary:
      'Bardzo szczegółowy, wielokadrowy filmowy prompt wideo do stylizowanego tańca dłoni, zawierający instrukcje z kodami czasowymi dotyczące ruchu kamery i działań postaci.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Filmowe zbliżenie emocjonalnej twarzy',
    summary:
      'Bardzo szczegółowy techniczny prompt dla Seedance 2.0 skupiający się na realistycznych teksturach skóry i serii złożonych emocjonalnych przejść mimicznych.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Filmowa eksploracja biologa morskiego',
    summary:
      'Szczegółowy filmowy prompt wideo do sceny podwodnej przedstawiającej biologa morskiego odkrywającego starożytny wrak statku w rafie koralowej.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Filmowy podcast muzyczny i technika gry na gitarze',
    summary:
      'Zaawansowany filmowy prompt do generowania podcastu muzycznego wideo w 4K, ze szczególnym uwzględnieniem techniki gry na gitarze, pinch harmonics i estetyki studyjnej.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Filmowy przewodnik nawigacji po trasie',
    summary:
      'Ustrukturyzowany prompt wieloscenowy zaprojektowany dla Seedance do tworzenia spójnego wideo nawigacji pieszej z powtarzającą się postacią przewodnika i płynnymi przejściami między rzeczywistymi lokalizacjami.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Filmowa sekwencja ulicznego wyścigu dla Seedance 2',
    summary:
      'Szczegółowy, wielokadrowy prompt zaprojektowany dla Seedance 2 do generowania filmowej sekwencji ulicznego wyścigu nocą, skupiający się na intensywnej koncentracji kierowcy, dynamicznej pracy kamery i wybuchowym przyspieszeniu, ustruktur',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Filmowa sekwencja walki wampirów w zaułku',
    summary:
      'Kompleksowy prompt akcji do sceny z krótkometrażowego filmu obejmującej dynamiczne ruchy kamery i szybką walkę w zaułku oświetlonym neonami.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Filmowa sekwencja science fiction Crimson Horizon',
    summary:
      'Kompleksowa, 9-kadrowa filmowa sekwencja wideo do filmu science fiction zatytułowanego „Crimson Horizon”, opisująca wszystko od startu rakiety po niesamowite spotkanie z obcymi na Marsie.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Scenariusz zwiastuna gry cyberpunkowej',
    summary:
      'Rozbudowany prompt do generowania wideo zwiastuna gry cyberpunkowej, opisujący projekt postaci, animacje UI oraz przejścia środowiskowe od białej pustki do faweli.',
  },
  'forbidden-city-cat-satire': {
    title: 'Satyra o kocie w Zakazanym Mieście',
    summary:
      'Złożony prompt czarnej komedii dla Seedance 2.0 przedstawiający rudego kota urzędnika i hienę cesarza w satyrycznej scenerii dynastii Qing.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Prompt wideo Hollywood Haute Couture Fantasy',
    summary:
      'Szczegółowy, wieloscenowy prompt do generowania wideo dla Seedance 2.0, zaprojektowany do stworzenia filmu Hollywood Haute Couture Fantasy. Prompt określa styl, rozdzielczość (8K), silnik renderujący (Unreal Engin',
  },
  'hunched-character-animation': {
    title: 'Animacja zgarbionej postaci',
    summary:
      'Instrukcja dla Seedance 2 do tworzenia animacji chodzenia w miejscu dla określonego odniesienia postaci.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: demo produktu 3D iPhone + MacBook',
    summary:
      '15-sekundowe demo produktu, w którym prawdziwy GLTF iPhone 15 Pro Max i MacBook Pro unoszą się na czystej scenie z rzeczywistym UI aplikacji renderowanym na żywo na ich ekranach za pomocą drawElementImage. Morfujący szklany flara obiektywu + obrotowa platforma 360°. Zbudowane na bloku katalogowym vfx-iphone-device.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: filmowe odsłonięcie tekstu kursorem',
    summary:
      '8-sekundowe dramatyczne odsłonięcie tekstu z poświatą kursora, chromatycznymi promieniami cienia i oświetleniem kierunkowym na czarnej scenie. Prawdziwa typografia DOM pod postprodukcją shaderów na żywo. Zbudowane na bloku katalogowym vfx-text-cursor.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: zakończenie z rozbiciem szkła',
    summary:
      '12-sekundowe zakończenie z rozbiciem HTML — prawdziwa strona produktu lub karta cenowa utrzymuje się przez chwilę, a następnie eksploduje w załamujące światło fragmenty szkła z rozmyciem głębi i dyspersją chromatyczną. Zbudowane na bloku katalogowym vfx-shatter. Pasuje jako karta końcowa po dłuższej kompozycji.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: płynne tło hero',
    summary:
      '12-sekundowy hero z treścią HTML unoszącą się nad organiczną płynną powierzchnią — podzielona płaszczyzna z przesuniętymi wierzchołkami, dynamika fal w czasie rzeczywistym, przechwycony DOM unosi się na wierzchu, ostry i czytelny. Zbudowany na bloku katalogowym vfx-liquid-background.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: Płynne odsłonięcie landingu w stylu Liquid Glass',
    summary:
      '20-sekundowe odsłonięcie prawdziwej strony docelowej produktu w stylu voronoi liquid-glass — DOM przechwytywany na żywo przez drawElementImage, rozbity na załamujące światło szklane komórki, a następnie układający się w czysty kadr hero. Zbudowany na bloku katalogowym vfx-liquid-glass.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: Wizualizacja pola magnetycznego',
    summary:
      '15-sekundowa wizualizacja cząsteczek pola magnetycznego reagująca na żywą mapę cieplną lub wykres z DOM — cząsteczki kreślą linie pola, które wyginają się wokół przechwyconego HTML, idealna dla produktów ML/danych. Zbudowana na bloku katalogowym vfx-magnetic.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: Pulpit z odsłonięciem przez portal',
    summary:
      '10-sekundowy wymiarowy portal otwiera się na żywy pulpit danych — DOM przechwytywany w czasie rzeczywistym, wolumetryczny rozlew światła, cząsteczki na krawędzi portalu. Zbudowany na bloku katalogowym vfx-portal. Zaprojektowany do kadrów hero z danymi w stylu prezentacji.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: Licznik pieniędzy $0 → $10K w stylu hype (9:16)',
    summary:
      '6-sekundowy pionowy klip hype HyperFrames 1080×1920 — licznik w stylu Apple $0 → $10 000 z zielonym błyskiem, cząsteczkami eksplozji pieniędzy, ikoną stosu gotówki i nagłówkiem kicker. Zbudowany na bloku katalogowym HyperFrames `apple-money-count`.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: 12-sekundowa prezentacja aplikacji — trzy unoszące się telefony',
    summary:
      '12-sekundowa kompozycja prezentacji aplikacji 16:9 — trzy unoszące się ekrany iPhone\'a zawieszone w przestrzeni 3D, każdy obracający się po kolei, by ukazać inną funkcję, etykiety wywoławcze zsynchronizowane z rytmem, końcowy lockup logo. Zbudowana bezpośrednio na bloku katalogowym HyperFrames `app-showcase`.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: 30-sekundowy reel sizzle marki',
    summary:
      '30-sekundowy reel sizzle HyperFrames 16:9 — szybkie cięcia, kinetyczna typografia zsynchronizowana z rytmem, skala reaktywna na dźwięk na wyświetlanych słowach, przejścia shaderowe między pięcioma scenami, karta końcowa z rozkwitem logo. Wzorowany na archetypie aisoc-hype z zestawu studenckiego.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: 30-sekundowa promocja produktu SaaS (w stylu Linear)',
    summary:
      '30-sekundowa kompozycja HyperFrames wzorowana na filmach produktowych w stylu Linear/ClickUp — odsłonięcia interfejsu 3D, kinetyczna typografia zsynchronizowana z rytmem, animowane zrzuty ekranu interfejsu, karta końcowa z outrem logo. Zbudowana z bloków katalogowych HF (ui-3d-reveal, app-showcase, logo-outro) oraz przejść shaderowych między scenami.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: 4-sekundowe kinowe outro logo',
    summary:
      '4-sekundowe outro logo 16:9 — montaż znaku słownego element po elemencie z rozkwitem, przesunięcie shimmer po finalnym lockupie, miękka nakładka ziarna, jednowierszowe CTA. Zbudowane na blokach HyperFrames `logo-outro`, `shimmer-sweep` i `grain-overlay`.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: 5-sekundowe minimalistyczne odsłonięcie produktu',
    summary:
      '5-sekundowa kompozycja HyperFrames do ekskluzywnego odsłonięcia produktu — ciemne płótno, pojedynczy ciepły akcent, powolne najechanie na kartę tytułową, kinetyczny wiersz kicker, powściągliwy ruch. Agent renderuje MP4 z HTML+GSAP przez puppeteer; nie są potrzebne materiały stockowe.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: Stos nakładek społecznościowych 9:16 (X · Reddit · Spotify · Instagram)',
    summary:
      '15-sekundowa pionowa kompozycja HyperFrames 1080×1920, która układa cztery animowane karty społecznościowe na pętli z kamerą twarzy — post na X, reakcja z Reddita, karta now-playing ze Spotify oraz CTA śledzenia na Instagramie na końcu. Każda karta to blok katalogowy HyperFrames; choreografia jest wartością dodaną.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: Gadająca głowa TikTok 9:16 z napisami karaoke',
    summary:
      'Pionowy short HyperFrames 1080×1920 — gadająca głowa z narracją TTS na pętli z kamerą twarzy, z napisami w stylu karaoke zsynchronizowanymi ze słowami, animowanym dolnym paskiem i nakładką śledzenia na TikToku na końcu. Odzwierciedla archetyp may-shorts-19 z zestawu studenckiego HyperFrames.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: Animowany wyścig wykresów słupkowych (w stylu NYT)',
    summary:
      '12-sekundowa infografika danych 16:9 — animowany wykres słupkowy + liniowy ze stopniowym odsłanianiem kategorii, nagłówek szeryfowy w stylu NYT, źródło w przypisie, kinetyczne etykiety wartości. Zbudowana bezpośrednio na bloku katalogowym HyperFrames `data-chart`.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Mapa lotu w stylu Apple (miejsce wylotu → cel)',
    summary:
      '8-sekundowa kinowa mapa trasy lotu 16:9 — realistyczne przybliżenie terenu, animowany samolot szybujący od miejsca wylotu do celu wzdłuż zakrzywionej trasy, oznaczone miasta, kinetyczny licznik odległości. Zbudowana bezpośrednio na bloku katalogowym HyperFrames `nyc-paris-flight`, do ponownego wykorzystania dla dowolnej pary miast.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: Pipeline strona-do-wideo (15-sekundowy montaż marketingowy)',
    summary:
      '15-sekundowa kompozycja HyperFrames 16:9, która przechwytuje żywą stronę internetową w trzech rozmiarach okna widoku, a następnie animuje przejścia między nimi z chromatycznym podziałem promienistym między scenami. Odzwierciedla archetyp hyperframes-sizzle z zestawu studenckiego, w którym strona jest zasobem źródłowym.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Aktorska adaptacja anime: Pojedynek oddechu wody kontra oddechu pioruna',
    summary:
      'Bardzo szczegółowy, 15-sekundowy prompt do wygenerowania aktorskiej adaptacji pojedynku w stylu anime, przedstawiający „Oddech wody” (niebieski wodny smok) kontra „Oddech pioruna” (złota błyskawica). P',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Kinowa narracja luksusowego supersamochodu',
    summary:
      'Bardzo szczegółowy, wieloujęciowy prompt kinowy dla Seedance 2.0 z eleganckim mężczyzną, dobermanami i zabytkowym supersamochodem w mglistej górskiej scenerii.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Sekwencja storyboardu magicznej akademii',
    summary:
      'Szczegółowy prompt w stylu storyboardu do kinowej sekwencji przedstawiającej magiczną dziewczynę w akademii, obejmujący przybycie, odkrycie mocy i magiczny pojedynek.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Prompt wideo do uzdrawiającego krótkiego filmu w stylu nowoczesnej estetyki wiejskiej',
    summary:
      'Szczegółowy, trójujęciowy prompt dla Seedance 2.0 do wygenerowania uzdrawiającego, kinowego krótkiego filmu w stylu nowoczesnej estetyki wiejskiej. Określa styl (kinowy reklamowy, 4K/8K, ekstremalne makro, nat',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Atmosferyczna animacja ulotki klubu nocnego',
    summary:
      'Subtelny prompt animacji dla Seedance 2.0, ożywiający elementy tła i oświetlenia przy zachowaniu zablokowanego obiektu',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Estetyka retro filmu wuxia z Hongkongu',
    summary:
      'Złożony, wieloczęściowy prompt wideo odtwarzający estetykę hongkońskich filmów wuxia z lat 80. i 90., przedstawiający transformację postaci z kota w człowieka za pomocą stylizowanych ujęć.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: 15-sekundowy kinowy japoński film krótkometrażowy o miłości',
    summary:
      'Bardzo szczegółowy, 15-sekundowy prompt wielosceniczny dla Seedance 2.0, zaprojektowany do wygenerowania kinowego, ultrarealistycznego japońskiego krótkometrażowego filmu o czystej, licealnej miłości. Prompt określa scenerię (pusta',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: Teledysk 80-letniej raperki',
    summary:
      'Szczegółowy, 15-sekundowy prompt dla Seedance 2.0 do wygenerowania poziomego teledysku rapowego (MV) w formacie 16:9 z udziałem 80-letniej kobiety. Prompt określa styl (chłodne tony neonowego fioletu/błękitu, eksp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Instrukcja sekwencji i ruchu do filmu o sztukach walki',
    summary:
      'Prompt wideo dla Seedance 2.0, który nakazuje modelowi animować sekwencję na podstawie karty postaci, skupiając się na konkretnych ruchach i krokach.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Magiczna sekwencja zamiany dusz w lustrze',
    summary:
      'Narracyjny prompt wideo opisujący magiczne wydarzenie zamiany dusz przy lustrze, z konkretnymi instrukcjami kamery i wskazówkami emocjonalnymi dla każdego segmentu.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Straszak z tosterem-rakietą',
    summary:
      'Prompt do realistycznego ujęcia w stylu domowego wideo, w którym starszy mężczyzna zostaje przestraszony przez toster wystrzeliwujący chleb niczym rakietę.',
  },
  'traditional-dance-performance': {
    title: 'Tradycyjny występ taneczny',
    summary:
      'Kompleksowy prompt wideo dla Seedance 2.0 do wygenerowania pełnego gracji tradycyjnego tańca na podstawie choreografii i referencyjnych obrazów tożsamości.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Wideo - Three Kingdoms ARPG - Guan Yu zabija Yan Lianga (Seedance 2.0)',
    summary:
      'Trwająca ok. 10 s kinowa sekwencja akcji renderowana w silniku, ożywiająca towarzyszący szablon obrazu game-screenshot-three-kingdoms-guanyu-slaying-yanliang. Guan Yu (关羽) wjeżdża na swoim koniu Czerwonym Zającu prosto w linię bojową wroga, unosi Ostrze Zielonego Smoka w Kształcie Półksiężyca i wykonuje jedno czyste cięcie przeciwnego generała Yan Lianga. Dostrojona do Seedance 2.0 — ścisła dyscyplina kamery, jedno zdecydowane uderzenie, czysta fizyka konia i ostrza, fotorealistyczne oświetlenie, absolutnie żadnej krwi na ekranie (uderzenie jest sugerowane złotym błyskiem qi, a nie krwią). Zaprojektowana jako bezpośredni odpowiednik wideo do pasującego szablonu obrazu, aby kadr i klip mogły być serwowane w parze. Obraz referencyjny: szablon zrzutu ekranu Guan Yu zabijającego Yan Lianga.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Wideo - Three Kingdoms ARPG - Lyu Bu strzela z łuku przy bramie obozu (Seedance 2.0)',
    summary:
      'Trwająca ok. 10 s kinowa sekwencja akcji renderowana w silniku, ożywiająca towarzyszący szablon obrazu game-screenshot-three-kingdoms-lyubu-yuanmen-archery. Lyu Bu (吕布) stoi pośrodku zakurzonego obozu wojskowego między dwiema stojącymi naprzeciw siebie armiami, naciąga łuk pokryty czerwoną laką, przytrzymuje napięcie cięciwy, a następnie wypuszcza pojedynczą, złociście świecącą strzałę przepełnioną qi wzdłuż toru w stronę odległej halabardy wbitej w ziemię. Dostrojona do Seedance 2.0 — ścisła dyscyplina kamery, jeden zdecydowany takt, wyraźne kadrowanie bezpieczne dla HUD, czysta fizyka łuku i strzały, ruch wiatru, pyłu i sztandarów oraz korekcja kolorów w stylu zrzutu ekranu z gry. Zaprojektowana jako bezpośredni odpowiednik wideo do pasującego szablonu obrazu, aby kadr i klip mogły być serwowane w parze. Obraz referencyjny: szablon zrzutu ekranu Lyu Bu strzelającego z łuku przy bramie obozu.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Wideo - Three Kingdoms ARPG - Ucieczka Zhao Yuna z niemowlęciem (Seedance 2.0)',
    summary:
      'Trwająca ok. 12 s kinowa sekwencja akcji renderowana w silniku, ożywiająca towarzyszący szablon obrazu game-screenshot-three-kingdoms-zhaoyun-cradle-escape. Zhao Yun (赵云) pędzi na swoim rumaku bojowym przez zrujnowane pole bitwy pod Changban, tuląc niemowlęcego następcę A Dou w zgięciu lewego ramienia i dzierżąc włócznię w prawej dłoni, parując nadchodzący cios jednym DOSKONAŁYM UNIKIEM i przeskakując nad przewróconym rydwanem bojowym, by utorować sobie drogę. Dostrojona do Seedance 2.0 — ścisła dyscyplina kamery, jeden ciągły takt, wiarygodne władanie włócznią jedną ręką, czysta fizyka konia i absolutnie żadnej widocznej krzywdy wyrządzonej niemowlęciu. Zaprojektowana jako bezpośredni odpowiednik wideo do pasującego szablonu obrazu, aby kadr i klip mogły być serwowane w parze. Obraz referencyjny: szablon zrzutu ekranu ucieczki Zhao Yuna z niemowlęciem.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Animacja krokodyla pirata w stylu retro Disneya',
    summary:
      'Wielosceniczny prompt narracyjny do klasycznej animacji w stylu retro Disneya, przedstawiającej krokodyla pirata oraz piratów-ptaki na statku.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Viralowa choreografia tańca k-pop',
    summary:
      'Szczegółowy prompt dla Seedance 2.0 do animowania postaci wykonującej taniec na podstawie referencji ze storyboardu złożonego z 16 paneli.',
  },
  'wasteland-factory-chase': {
    title: 'Pościg w fabryce na pustkowiu',
    summary:
      'Kinowy prompt do szybkiej sceny na pustynnym pustkowiu, przedstawiającej ruchomą przemysłową fabrykę kroczącą na nogach oraz pościg rebelianta na motocyklu.',
  },
};
