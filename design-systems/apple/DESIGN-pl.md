# System projektowy inspirowany Apple

> Category: Media i konsument
> Elektronika użytkowa. Premium white space, SF Pro, kinowe obrazy.

## 1. Motyw wizualny i atmosfera

Język webowy Apple to precyzyjny system redakcyjny, który przeplata galeryjny spokój z gęstymi, sklepowymi blokami informacji. Ton wizualny pozostaje powściągliwy: szerokie neutralne płótna, ciche elementy chromu i obrazy produktów, którym przypada niemal cały ciężar ekspresji. Interfejs jest tak zaprojektowany, by zniknąć, aby sprzęt, materiały i opcje wykończenia stały się narracyjnym pierwszym planem.

W pięciu przeanalizowanych stronach rytm jest spójny, ale nie monolityczny. Powierzchnie marketingowe (strona główna i Environment) stosują kinowe rozdziały utrzymane w czerni i świetle, podczas gdy powierzchnie handlowe (Store i ścieżki Shop) wprowadzają ciaśniejsze odstępy, więcej kontrolek użytkowych i gęstsze stosy kart, nie łamiąc przy tym podstawowej gramatyki marki. Rezultatem jest jeden system z dwoma biegami: trybem prezentacji i trybem transakcyjnym.

Typografia jest stabilizatorem. SF Pro Display niesie hierarchię hero i merchandisingu z kompaktową interlinią i kontrolowanym trackingiem, podczas gdy SF Pro Text obsługuje metadane produktów, nawigację, filtry i gęste interfejsy wyboru. Typografia pozostaje stonowana, ale zakres skali jest na tyle szeroki, by obsłużyć zarówno billboardowe przekazy hero, jak i mikroskopijne etykiety użytkowe.

**Kluczowe cechy:**
- Binarny rytm sekcji: głębokie czarne sceny (`#000000`) przeplatane bladymi neutralnymi polami (`#f5f5f7`)
- Pojedyncza niebieska rodzina akcentu dla semantyki akcji i linków (`#0071e3`, `#0066cc`, `#2997ff`)
- Dwa tryby pracy w jednym systemie: kinowe moduły prezentacyjne i gęste konfiguratory handlowe
- Silne poleganie na obrazach i wykończeniach materiałów; chrom interfejsu pozostaje wizualnie cienki
- Ciasne metryki nagłówków (SF Pro Display, semibold) w parze z kompaktową typografią tekstu/linków (SF Pro Text)
- Geometria pigułek i kapsuł jako charakterystyczny język akcji (`18px` do `980px` oraz okrągłe kontrolki)
- Głębia stosowana oszczędnie; kontrast i separacja powierzchni wykonują większość pracy warstwowania
- Wielostronicowy rytm bloków kolorystycznych: czarne rozdziały hero -> blade neutralne pola merchandisingowe -> użytkowe białe powierzchnie sklepowe -> ciemne mikropowierzchnie dla kontrolek

## 2. Paleta kolorów i role

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Podstawowe
- **Absolutna czerń** (`#000000`): Immersyjne płótna hero, dramatyczne rozdziały produktowe, głębokie kotwice interfejsu.
- **Blada szarość Apple** (`#f5f5f7`): Główna jasna powierzchnia dla pasów funkcji, bloków porównawczych i redakcyjnych przejść.
- **Niemal czarny atrament** (`#1d1d1f`): Podstawowy kolor tekstu i ciemnego wypełnienia kontrolek na jasnych płótnach.

### Drugorzędne i akcentowe
- **Niebieski akcji Apple** (`#0071e3`): Podstawowe wypełnienie akcji i sygnalizujący fokus akcent marki.
- **Niebieski linku tekstowego** (`#0066cc`): Kolor linku w tekście zoptymalizowany pod czytelność długich treści.
- **Wysokoluminancyjny niebieski linku** (`#2997ff`): Jasne traktowanie linku na ciemniejszych scenach, gdzie wymagany jest mocniejszy kontrast.

### Powierzchnia i tło
- **Czyste białe płótno** (`#ffffff`): Tła list sklepowych/produktowych oraz gęste sekcje transakcyjne.
- **Powierzchnia grafitowa A** (`#272729`): Warstwa kontekstu ciemnej karty i kontrolek mediów.
- **Powierzchnia grafitowa B** (`#262629`): Nieco głębsza ciemna warstwa użytkowa dla grupowania kontrolek.
- **Powierzchnia grafitowa C** (`#28282b`): Wyniesione ciemne powierzchnie pomocnicze.
- **Powierzchnia grafitowa D** (`#2a2a2c`): Najciemniejszy wyniesiony stopień używany do separacji w bogatszych ciemnych scenach.

### Neutralne i tekst
- **Drugorzędna neutralna szarość** (`#6e6e73`): Drugorzędny tekst, opisy pomocnicze, trzeciorzędne metadane.
- **Miękka szarość obramowania** (`#d2d2d7`): Separatory, subtelne kontury i stonowane ujęcie elementów użytkowych.
- **Średnia szarość obramowania** (`#86868b`): Mocniejsze kontury pól w kontekstach konfiguracji produktów i filtrów.
- **Użytkowa ciemna szarość** (`#424245`): Przejście tekst/powierzchnia w ciemnej neutralnej tonacji w kontekstach sklepu.

### Semantyczne i akcentowe
- **Sygnał zaznaczenia/fokusu** (`#0071e3`): Wspólny sygnał fokusu i stanu zaznaczonego w kontekstach marketingowych i handlowych.
- **Błąd/Ostrzeżenie/Sukces**: W wyodrębnionym zestawie powierzchni nie była konsekwentnie widoczna odrębna paleta semantyczna.

### System gradientów
- Wyodrębnione strony są w przeważającej mierze oparte na jednolitych powierzchniach. Bogactwo wizualne pochodzi z fotografii i renderowania wykończeń, a nie z trwałych gradientów interfejsu.

## 3. Zasady typografii

### Rodzina czcionek
- **Rodzina Display:** `SF Pro Display`, zamienniki `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Rodzina Text:** `SF Pro Text`, zamienniki `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Podział zastosowań:** Rodzina Display obsługuje nagłówki hero/produktów i nagłówki merchandisingowe; rodzina Text obsługuje nawigację, kontrolki, etykiety i gęste teksty handlowe.

### Hierarchia
| Rola | Rozmiar | Grubość | Interlinia | Odstępy liter | Uwagi |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Skala hero Environment/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Momenty hero strony głównej |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Główne nagłówki rozdziałów |
| Product Heading | 40px | 600 | 1.10 | normal | Tytuły sekcji produktów i kampanii |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Wyróżnienia urządzeń i merchandisingu |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px do 0.352px | Pod-hero na poziomie modułu |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Nazewnictwo na poziomie kafelka i kluczowe teksty |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Nagłówki konfiguratora i pogrupowanej treści |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Większe linki promocyjne |
| Subhead | 19px | 600 | 1.21 | 0.228px | Kompaktowe wstępy sekcji |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Standardowy tekst i opisy sklepowe |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Wyróżnione etykiety i kluczowe wartości |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Przyciski, etykiety pomocnicze, kompaktowy tekst nawigacji |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Drobny druk, mikroetykiety |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Gęste metadane i tekst wsparcia prawnego |

### Zasady
- **Ciągłość między typami stron:** To samo DNA typograficzne obejmuje kinowe premiery i ścieżki zakupu produktów, zapobiegając rozszczepieniu marki między marketingiem a handlem.
- **Kompresja w skali:** Poziomy Display używają ciasnej interlinii i kontrolowanego trackingu, by sprawiać wrażenie precyzyjnego i zorientowanego na produkt.
- **Czytelna gęstość na głębokość sklepową:** SF Pro Text równoważy zwartość z wystarczającym rytmem pionowym dla długich list produktów i macierzy opcji.
- **Wymierna drabina grubości:** 600 to dominująca grubość wyróżnienia; 700 pojawia się wybiórczo; 300 jest używane oszczędnie dla kontrastu w większych wierszach.

### Uwaga o zamiennikach czcionek
- Najbliższe darmowo dostępne zamienniki: `Inter` dla implementacji bogatych w tekst oraz metryki `SF Pro Display-like` przybliżone przy użyciu `Inter Tight` dla nagłówków.
- Przy zamianie zwiększ nieco interlinię (+0.02 do +0.06) w rozmiarach tekstu i zmniejsz intensywność ujemnego trackingu, aby zachować czytelność.

## 4. Stylizacje komponentów

### Przyciski
- **Podstawowa akcja z wypełnieniem:** tło `#0071e3`, tekst `#ffffff`, promień 8px, kompaktowy poziomy padding (zwykle 8px 15px). Używane do zdecydowanych akcji zakupu/postępu.
- **Ciemna akcja z wypełnieniem:** tło `#1d1d1f`, tekst `#ffffff`, promień 8px. Używane, gdy jasne powierzchnie potrzebują powściągliwego, wysokokontrastowego elementu podstawowego.
- **Rodzina akcji pigułka/kapsuła:** duże akcje kapsułowe o promieniach `18px`-`56px` oraz skrajne linki w formie pigułek o `980px`. Ustanawia miękką, lecz precyzyjną sylwetkę wezwania do działania Apple.
- **Powłoki filtrów/przycisków użytkowych:** jasne powłoki (`#fafafc` lub półprzezroczysta biel) z subtelnymi szarymi obramowaniami (`#d2d2d7` / `#86868b`) dla gęstych kontekstów konfiguracji.
- **Zachowanie wciśnięcia:** aktywne kontrolki zwykle nieznacznie zmniejszają skalę lub lekko przesuwają wypełnienie, aby zasygnalizować fizyczne potwierdzenie naciśnięcia.

### Karty i kontenery
- **Karty redakcyjne/produktowe:** jasne karty na polach `#f5f5f7` lub białych z minimalnym kadrowaniem i kompozycją zorientowaną na obraz.
- **Ciemne karty użytkowe:** stopnie grafitowe (`#272729` do `#2a2a2c`) używane do nakładek, kontrolek mediów i modułów w ciemnym kontekście.
- **Panele konfiguratora:** zaokrąglone kontenery (często 12px-18px) z wyraźną, lecz powściągliwą definicją obramowania.
- **Moduły karuzeli/spotlight:** większe zaokrąglone powłoki (`28px`-`36px`) dla wyróżnionych pasów treści.

### Pola i formularze
- **Pola wejściowe sklepu:** półprzezroczyste lub białe tła, ciemny tekst (`#1d1d1f`), ujęcie prowadzone obramowaniem (`#86868b`).
- **Kontrolki wyboru:** okrągła/przełącznikowa geometria kontrolek pojawia się często w interfejsach wyboru produktów.
- **Strategia gęstości:** pola formularzy pozostają wizualnie ciche, aby obrazy urządzeń i hierarchia cen pozostały dominujące.

### Nawigacja
- **Globalna nawigacja marketingowa:** kompaktowy ciemny, półprzezroczysty pasek z linkami drobnym krojem i powściągliwą ikonografią.
- **Warstwy nawigacji Store/podsklepu:** dodatkowe paski użytkowe, chipy i kontrolki segmentowane do zawężania kategorii i produktów.
- **Hierarchia linków:** niebieskie odcienie linków pozostają podstawowym sygnałem interaktywnym, podczas gdy neutralny tekst wspiera gęste zestawy nawigacji.

### Traktowanie obrazu
- **Fotografia zorientowana na obiekt:** sprzęt i akcesoria są eksponowane na pierwszym planie na kontrolowanych jednolitych powierzchniach.
- **Wysokiej wierności renderowanie wykończeń:** odblaskowe/materiałowe detale są kluczowe dla wizualnej perswazji.
- **Mieszane kadrowanie:** sceny hero na pełnym spadzie współistnieją z zaokrąglonymi kartami sklepowymi i ciasno przyciętymi miniaturami merchandisingowymi.

### Inne charakterystyczne komponenty
- **Macierz konfiguratora produktu:** stosy opcji i selektory łączące chipy, kontrolki w stylu radiowym oraz kontekstowe bloki cen/podsumowania.
- **Kropki/strzałki sterowania karuzelą:** okrągłe słownictwo kontrolek w stonowanych nakładkach do przewijania galerii.
- **Panele narracyjne Environment:** rozdziały narracyjne łączące redakcyjną typografię z kinowymi wizualizacjami produktu/środowiska.

## 5. Zasady układu

### System odstępów
- Jednostka bazowa to faktycznie `8px`, ale system obsługuje gęste mikrokroki dla precyzyjnego wyrównania.
- Często powtarzane wartości odstępów na różnych stronach: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Uniwersalne stałe rytmu widoczne zarówno w ścieżkach marketingowych, jak i sklepowych: rusztowanie jednostek `8px` z interwałami użytkowymi `14-20px` dla paddingu komponentów i odstępów list.

### Siatka i kontener
- **Strony prezentacyjne:** duże centralne kolumny z szerokim poziomym oddechem i pełnoszerokimi rozdziałami kolorystycznymi.
- **Strony handlowe:** ciaśniejsze wielokolumnowe siatki produktów i kontrolek z częstym modularnym układaniem w stosy.
- **Zachowanie kontenera:** ograniczony czytelny rdzeń z hojnymi marginesami zewnętrznymi przy szerokościach desktopowych.

### Filozofia białej przestrzeni
- **Tempo sceny:** główne rozdziały wizualne stosują szeroki oddech górny/dolny.
- **Zagęszczenie informacji tam, gdzie potrzeba:** strony sklepowe celowo kompresują odstępy, aby ujawnić więcej użytecznych informacji na widok.
- **Separacja prowadzona kontrastem:** przejścia między sekcjami opierają się bardziej na zmianach powierzchni niż na dekoracyjnych separatorach.

### Skala promienia obramowania
- **5px:** drobne linki/tagi użytkowe i mniejsze małe powłoki.
- **8px-12px:** standardowe kontrolki i kompaktowe pola.
- **16px-18px:** karty, ramy modułów i panele handlowe.
- **28px-36px:** większe moduły i kontenery spotlight.
- **56px / 100px / 980px:** kapsuły, duże pigułki i charakterystyczne wydłużone formy CTA.
- **50%:** okrągłe kontrolki mediów i wyboru.

## 6. Głębia i wzniesienie

| Poziom | Traktowanie | Zastosowanie |
|------|-----------|-----|
| Poziom 0 | Płaskie neutralne powierzchnie (`#ffffff`, `#f5f5f7`, `#000000`) | Główne sceny narracyjne i produktowe |
| Poziom 1 | Subtelne ujęcie obramowaniem (`#d2d2d7`, `#86868b`) | Filtry, pola wejściowe, karty użytkowe |
| Poziom 2 | Miękki cień (`rgba(0,0,0,0.08)` do `rgba(0,0,0,0.22)` tam, gdzie występuje) | Wyróżnione karty i wyniesione moduły merchandisingowe |
| Poziom 3 | Stopniowanie ciemnych powierzchni (`#272729` -> `#2a2a2c`) | Nakładki, kontrolki mediów, ciemne klastry użytkowe |
| Dostępność | Niebieski sygnał fokusu (`#0071e3`) | Wyróżnienie klawiatury i zaznaczenia |

Głębia jest celowo powściągliwa. Apple preferuje kontrast tonalny, stopniowanie powierzchni i hierarchię kompozycyjną nad ciężkimi stosami cieni.

### Głębia dekoracyjna
- Głębia dekoracyjna jest tworzona głównie przez fotograficzny realizm i renderowanie materiałów, a nie przez syntetyczne efekty interfejsu.
- Półprzezroczyste nakładki i szklane paski użytkowe zapewniają łagodne atmosferyczne warstwowanie w nawigacji i kontrolkach.

## 7. Co robić i czego nie robić

### Co robić
- Używaj neutralnej triady (`#000000`, `#f5f5f7`, `#ffffff`) jako strukturalnego fundamentu.
- Rezerwuj niebieskie akcenty dla autentycznej semantyki akcji i nawigacji.
- Utrzymuj typografię ciasną i przemyślaną, zwłaszcza w skalach Display.
- Zachowaj język geometrii kapsuły/koła dla kontrolek i kluczowych akcji.
- Pozwól, by obrazy produktów niosły dramat wizualny; utrzymuj chrom stonowany.
- Stosuj ujęcie prowadzone obramowaniem w gęstych kontekstach sklepowych zamiast ciężkiej ornamentyki kart.
- Zachowaj wyraźną separację między modułami prezentacyjnymi a transakcyjnymi, utrzymując wspólne podstawowe tokeny.

### Czego nie robić
- Nie wprowadzaj szerokich drugorzędnych palet akcentowych, które konkurują z niebieskim Apple.
- Nie nadużywaj cieni, efektów poświaty ani dekoracyjnych gradientów w podstawowym chromie interfejsu.
- Nie mieszaj niepowiązanych rodzin czcionek ani nie rozluźniaj trackingu bez rozróżnienia.
- Nie spłaszczaj wszystkich narożników do jednego promienia; Apple stosuje celowe poziomy promienia.
- Nie przeciążaj modułów handlowych grubymi obramowaniami ani głośnymi efektami wizualnymi.
- Nie usuwaj neutralnego rytmu kontrastu między ciemnymi a jasnymi rozdziałami.
- Nie traktuj ścieżek marketingowych i zakupowych jako odrębnych systemów projektowych.

## 8. Zachowanie responsywne

### Punkty graniczne
| Nazwa | Szerokość | Kluczowe zmiany |
|------|-------|-------------|
| Mały mobilny | 374px i poniżej | Zacieśnione kontrolki sklepowe, jednokolumnowe stosy produktów |
| Mobilny | 375px-640px | Jednokolumnowe moduły, kompaktowe wiersze akcji, skondensowane selektory |
| Tablet | 641px-833px | Rozszerzone karty i mieszane przejścia 1-2 kolumny |
| Szeroki tablet | 834px-1023px | Stabilniejszy wielokolumnowy merchandising, większe bloki tekstu |
| Desktop | 1024px-1240px | Pełne układy sklepowe i struktury porównań produktów |
| Szeroki desktop | 1241px-1440px | Rozszerzenie hero marketingowego i szersze odstępy sekcji |
| Duży desktop | 1441px+ | Maksymalny oddech rozdziałów i szeroka kompozycja redakcyjna |

### Cele dotykowe
- Akcje podstawowe i drugorzędne są generalnie prezentowane w przyjaznych dotykowi geometriach pigułek/przycisków.
- Okrągłe kontrolki mediów i wyboru są zgodne z minimalnym zamiarem dotykowym w kontekstach mobilnych.
- Gęsty interfejs handlowy używa kompaktowych etykiet, ale zachowuje wyraźne obszary trafienia dzięki paddingowi otaczającego kształtu.

### Strategia zwijania
- Typografia hero marketingowego skaluje się w dół w dyskretnych poziomach, zachowując kontrast hierarchii.
- Siatki produktów i handlu zwijają się z wielokolumnowych do układanych w stosy kart z trwałą widocznością selektorów.
- Nawigacja użytkowa kompresuje się w prostsze grupowania linków/kontrolek, zachowując kluczowe akcje.
- Klastry opcji/konfiguracji stają się ułożone pionowo, aby ścieżka zakupu pozostała liniowa na małych ekranach.

### Zachowanie obrazu
- Obrazy produktów zachowują proporcje i centralność przez punkty graniczne.
- Wizualizacje hero pozostają dominujące na urządzeniach mobilnych, z tekstem repozycjonowanym wokół priorytetu mediów.
- Miniatury sklepowe pozostają czytelne dzięki ciaśniejszej logice kadrowania i gęstszemu układaniu kart w stosy.
- Moduły prowadzone obrazem nadal kotwiczą rytm w miarę wzrostu gęstości układu.

## 9. Przewodnik promptów dla agenta

### Szybkie odniesienie kolorów
- Niebieski akcji podstawowej: **Niebieski akcji Apple** (`#0071e3`)
- Niebieski linku tekstowego: **Niebieski linku tekstowego** (`#0066cc`)
- Płótno ciemnego rozdziału: **Absolutna czerń** (`#000000`)
- Płótno jasnego rozdziału: **Blada szarość Apple** (`#f5f5f7`)
- Tekst podstawowy na jasnym: **Niemal czarny atrament** (`#1d1d1f`)
- Tekst drugorzędny: **Drugorzędna neutralna szarość** (`#6e6e73`)
- Miękkie obramowanie sklepowe: **Miękka szarość obramowania** (`#d2d2d7`)
- Mocne obramowanie sklepowe: **Średnia szarość obramowania** (`#86868b`)

### Przykładowe prompty komponentów
- „Zaprojektuj hero produktu w stylu Apple na czarnym płótnie (`#000000`) z nagłówkiem SF Pro Display semibold (48-56px), zwięzłym tekstem wspierającym i dwoma kapsułowymi CTA używającymi `#0071e3` i `#1d1d1f`."
- „Stwórz panel konfiguracji handlowej na bieli (`#ffffff`) z kartami zaokrąglonymi na 18px, polami z obramowaniem `#86868b`, tekstem SF Pro Text 17px i kompaktowymi selektorami opcji."
- „Zbuduj siatkę kart merchandisingowych przeplatającą powierzchnie `#f5f5f7` i białe, z kartami zorientowanymi na obraz, powściągliwymi cieniami i metadanymi SF Pro Text 14-17px."
- „Wygeneruj klaster kontrolek karuzeli używający okrągłych przycisków (promień 50%), stonowanych szarych nakładek i wyraźnej informacji zwrotnej o stanie aktywnym dla nawigacji galerii."
- „Skomponuj mieszany rytm strony marketing + handel: ciemny rozdział prezentacyjny -> jasny rozdział funkcji -> gęsty moduł listy produktów, zachowując niebieskie akcenty tylko dla akcji i linków."

### Przewodnik iteracji
1. Najpierw zablokuj neutralny fundament (`#000000`, `#f5f5f7`, `#ffffff`) przed dostrajaniem akcentów.
2. Utrzymuj niebieskie akcenty rzadkie i celowe; jeśli wszystko jest niebieskie, hierarchia się załamuje.
3. Dostrajaj typografię w tej kolejności: skala Display, czytelność tekstu, a następnie mikroetykiety.
4. Dopasowuj promień według klasy komponentu (pole, karta, kapsuła, koło), a nie zaokrąglenia uniwersalnego.
5. Zwiększaj gęstość stopniowo, przechodząc od sekcji prezentacyjnych do handlowych.
6. Po każdej rewizji sprawdzaj, czy obrazy produktów pozostają najsilniejszą warstwą wizualną.

### Znane luki
- Odrębne semantyczne kolory statusu (błąd/ostrzeżenie/sukces) nie były konsekwentnie widoczne w wyodrębnionym zestawie stron.
- Niektóre mikrostany interakcji różnią się w zależności od modułu i nie są reprezentowane jako uniwersalne tokeny systemowe.
- Kilka modułów sklepowych ujawnia kontekstowe nadpisania typografii, które nie pojawiają się na wszystkich pięciu stronach.
