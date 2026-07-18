# Design System Inspired by Uber

> Category: Media & Konsument
> Platforma mobilności. Pogrubiona czerń i biel, zwięzła typografia, miejska energia.

## 1. Motyw wizualny i atmosfera

Język designu Uber to prawdziwy wzorzec pewnego minimalizmu — czarno-biały wszechświat, w którym każdy piksel służy konkretnemu celowi, a żaden element nie dekoruje bez uzasadnienia. Całe doświadczenie opiera się na wyrazistej dualności: głębokiej czerni (`#000000`) i czystej bieli (`#ffffff`), bez żadnych pośrednich szarości rozmywających przekaz. To nie jałowy minimalizm startupu, który nie skończył projektować — to świadoma powściągliwość marki tak ugruntowanej, że może sobie pozwolić na szept.

Charakterystyczny krój pisma, UberMove, to autorski geometryczny sans-serif o wyraźnie kwadratowym, inżynieryjnym charakterze. Nagłówki w UberMove Bold o rozmiarze 52px mają ciężar billboardu — autorytatywne, bezpośrednie, bezkompromisowe. Towarzyszący krój UberMoveText obsługuje treść główną i przyciski z nieco łagodniejszym, bardziej czytelnym charakterem przy średniej wadze (500). Razem tworzą system typograficzny przypominający mapę tranzytową: czytelny, efektywny, stworzony do szybkiego skanowania.

To, co czyni design Uber naprawdę wyjątkowym, to wykorzystanie pełnoekranowej fotografii i ilustracji w połączeniu z interaktywnymi elementami w kształcie pigułek (border-radius 999px). Chipy nawigacyjne, przyciski CTA i selektory kategorii — wszystkie mają ten kapsułkowy kształt, tworząc dotykowy, przyjazny dla kciuka język interfejsu, który jest niezaprzeczalnie Uber. Ilustracje — ciepłe, lekko stylizowane sceny kierowców, pasażerów i pejzaży miejskich — wprowadzają ludzkość do systemu, który mógłby być zimny i monochromatyczny. Strona alternuje między białymi sekcjami treści a całkowicie czarnym stopką, z kartami używającymi najdelikatniejszych możliwych cieni (rgba(0,0,0,0.12-0.16)) dla subtelnego uniesienia bez zburzenia płaskiej estetyki.

**Kluczowe cechy charakterystyczne:**
- Czysto czarno-biała podstawa bez pośrednich szarości w chromie interfejsu
- UberMove (nagłówki) + UberMoveText (treść/UI) — autorska rodzina geometrycznych sans-serif
- Kształt pigułki wszędzie: przyciski, chipy i elementy nawigacyjne używają border-radius 999px
- Ciepłe, ludzkie ilustracje kontrastujące z surowym monochromatycznym interfejsem
- Układ oparty na kartach z delikatnymi jak szelest cieniami (krycie 0.12-0.16)
- Siatka odstępów 8px z kompaktowymi, gęstymi informacyjnie układami
- Pogrubiona fotografia zintegrowana jako tła hero na pełną szerokość
- Czarna stopka zakotwiczająca stronę w ciemnym, wysokokonturowym środowisku

## 2. Paleta kolorów i ich role

### Podstawowe
- **Uber Black** (`#000000`): Definiujący kolor marki — używany do podstawowych przycisków, nagłówków, tekstu nawigacji i stopki. Nie „prawie czarny" ani „ciemnoszary", lecz prawdziwa, bezkompromisowa czerń.
- **Pure White** (`#ffffff`): Podstawowy kolor powierzchni i tekstu odwróconego. Używany do teł stron, powierzchni kart i tekstu na czarnych elementach.

### Stany interaktywne i przyciski
- **Hover Gray** (`#e2e2e2`): Stan hover białego przycisku — czysta, chłodna jasnoszara, zapewniająca wyraźną informację zwrotną bez ciepłego odcienia.
- **Hover Light** (`#f3f3f3`): Subtelny hover dla uniesionych białych przycisków — ledwo widoczna szara dla delikatnej informacji zwrotnej przy interakcji.
- **Chip Gray** (`#efefef`): Tło dla drugorzędnych przycisków filtrów i chipów nawigacyjnych — neutralna, ultra-jasna szara.

### Tekst i treść
- **Body Gray** (`#4b4b4b`): Drugorzędny tekst i linki w stopce — czysta średnia szara bez ciepłych ani chłodnych odcieni.
- **Muted Gray** (`#afafaf`): Trzeciorzędny tekst, mniej wyeksponowane linki w stopce i zawartość zastępcza.

### Obramowania i separacja
- **Border Black** (`#000000`): Cienkie obramowania 1px do strukturalnego zamknięcia — używane oszczędnie na separatorach i kontenerach formularzy.

### Cienie i głębia
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Standardowe uniesienie karty — nieważkie uniesienie dla kart z treścią.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Nieco silniejsze uniesienie dla pływających przycisków akcji i nakładek.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Cień wewnętrzny dla aktywnych/wciśniętych stanów drugorzędnych przycisków.

### Stany linków
- **Default Link Blue** (`#0000ee`): Standardowy niebieski przeglądarki dla linków tekstowych z podkreśleniem — używany w treści głównej.
- **Link White** (`#ffffff`): Linki na ciemnych powierzchniach — używane w stopce i ciemnych sekcjach.
- **Link Black** (`#000000`): Linki na jasnych powierzchniach z dekoracją podkreślenia.

### System gradientów
- Design Uber jest **całkowicie wolny od gradientów**. Dualność czerni i bieli oraz płaskie bloki kolorów tworzą wszelką hierarchię wizualną. Żadne gradienty nie pojawiają się w systemie — każda powierzchnia ma jednolity kolor, każde przejście to ostre krawędź lub cień.

## 3. Zasady typografii

### Rodzina czcionek
- **Nagłówek / Display**: `UberMove`, z zamiennikami: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Treść / UI**: `UberMoveText`, z zamiennikami: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Uwaga: UberMove i UberMoveText to autorskie kroje pisma. W zewnętrznych implementacjach używaj `system-ui` lub Inter jako najbliższego dostępnego zamiennika. Geometryczny, kwadratowy charakter UberMove można przybliżyć za pomocą Inter lub DM Sans.*

### Hierarchia

| Rola | Czcionka | Rozmiar | Waga | Wysokość linii | Uwagi |
|------|----------|---------|------|----------------|-------|
| Display / Hero | UberMove | 52px (3.25rem) | 700 | 1.23 (ciasna) | Maksymalny impact, obecność billboardu |
| Nagłówek sekcji | UberMove | 36px (2.25rem) | 700 | 1.22 (ciasna) | Kotwice głównych sekcji |
| Tytuł karty | UberMove | 32px (2rem) | 700 | 1.25 (ciasna) | Nagłówki kart i funkcji |
| Podnagłówek | UberMove | 24px (1.5rem) | 700 | 1.33 | Drugorzędne nagłówki sekcji |
| Mały nagłówek | UberMove | 20px (1.25rem) | 700 | 1.40 | Kompaktowe nagłówki, tytuły list |
| Nawigacja / UI duże | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Linki nawigacyjne, wyeksponowany tekst UI |
| Treść / Przycisk | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Standardowy tekst treści, etykiety przycisków |
| Podpis | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Metadane, opisy, małe linki |
| Micro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (luźna) | Drobny druk, tekst prawny |

### Zasady
- **Pogrubione nagłówki, średnia treść**: Nagłówki UberMove mają wyłącznie wagę 700 (pogrubienie) — każdy nagłówek uderza z siłą billboardu. Tekst treści i UI w UberMoveText używa wag 400-500, tworząc wyraźną hierarchię wizualną przez kontrast wagi.
- **Ciasne wysokości linii nagłówków**: Wszystkie nagłówki używają wysokości linii między 1.22-1.40 — kompaktowe i dynamiczne, zaprojektowane do skanowania, nie czytania.
- **Typografia funkcjonalna**: Nie ma tu żadnych dekoracyjnych zabiegów typograficznych. Brak letter-spacing, text-transform ani ornamentacyjnych rozmiarów. Każdy element tekstowy służy bezpośredniemu celowi komunikacyjnemu.
- **Dwie czcionki, ścisłe role**: UberMove przeznaczony jest wyłącznie do nagłówków. UberMoveText przeznaczony jest wyłącznie do treści, przycisków, linków i UI. Granica nigdy nie jest przekraczana.

## 4. Style komponentów

### Przyciski

**Podstawowy czarny (CTA)**
- Tło: Uber Black (`#000000`)
- Tekst: Pure White (`#ffffff`)
- Padding: 10px 12px
- Radius: 999px (pełna pigułka)
- Outline: brak
- Focus: wewnętrzny pierścień `rgb(255,255,255) 0px 0px 0px 2px`
- Podstawowy przycisk akcji — pogrubiony, wysokokonturowy, nie do przeoczenia

**Drugorzędny biały**
- Tło: Pure White (`#ffffff`)
- Tekst: Uber Black (`#000000`)
- Padding: 10px 12px
- Radius: 999px (pełna pigułka)
- Hover: tło zmienia się na Hover Gray (`#e2e2e2`)
- Focus: tło zmienia się na Hover Gray, pojawia się wewnętrzny pierścień
- Używany na ciemnych powierzchniach lub jako drugorzędna akcja obok podstawowego czarnego

**Chip / Filtr**
- Tło: Chip Gray (`#efefef`)
- Tekst: Uber Black (`#000000`)
- Padding: 14px 16px
- Radius: 999px (pełna pigułka)
- Aktywny: cień wewnętrzny `rgba(0,0,0,0.08)`
- Chipy nawigacyjne, selektory kategorii, przełączniki filtrów

**Pływający przycisk akcji**
- Tło: Pure White (`#ffffff`)
- Tekst: Uber Black (`#000000`)
- Padding: 14px
- Radius: 999px (pełna pigułka)
- Cień: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` lekkie przesunięcie
- Hover: tło zmienia się na `#f3f3f3`
- Sterowanie mapą, przewijanie do góry, pływające CTA

### Karty i kontenery
- Tło: Pure White (`#ffffff`) na białych stronach; brak wyraźnego zróżnicowania tła kart
- Obramowanie: brak domyślnie — karty są definiowane przez cień, nie obrys
- Radius: 8px dla standardowych kart z treścią; 12px dla wyróżnionych/promowanych kart
- Cień: `rgba(0,0,0,0.12) 0px 4px 16px 0px` dla standardowego uniesienia
- Karty są informacyjnie gęste z minimalnym wewnętrznym paddingiem
- Karty prowadzone obrazem używają zdjęć na pełne krwawienie z tekstem nakładanym lub pod spodem

### Pola wejściowe i formularze
- Tekst: Uber Black (`#000000`)
- Tło: Pure White (`#ffffff`)
- Obramowanie: 1px solid Black (`#000000`) — jedyne miejsce, gdzie widoczne obramowania pojawiają się wyraźnie
- Radius: 8px
- Padding: standardowe wygodne odstępy
- Focus: brak wyodrębnionego niestandardowego stanu focus — opiera się na standardowym pierścieniu focus przeglądarki

### Nawigacja
- Przyklejona górna nawigacja z białym tłem
- Logo: wordmark/ikona Uber o rozmiarze 24x24px w kolorze czarnym
- Linki: UberMoveText przy 14-18px, waga 500, w Uber Black
- Chipy nawigacyjne w kształcie pigułek z tłem Chip Gray (`#efefef`) do nawigacji kategorii („Ride", „Drive", „Business", „Uber Eats")
- Przełącznik menu: okrągły przycisk z border-radius 50%
- Mobilnie: wzorzec menu hamburgerowego

### Obróbka obrazów
- Ciepłe, ręcznie ilustrowane sceny (nie fotografie dla sekcji funkcji)
- Styl ilustracji: lekko stylizowane postacie, ciepła paleta kolorów w ilustracjach, współczesny klimat
- Sekcje hero używają odważnej fotografii lub ilustracji jako tła na pełną szerokość
- Kody QR dla CTA pobierania aplikacji
- Wszystkie obrazy używają standardowego border-radius 8px lub 12px, gdy są zawarte w kartach

### Wyróżniające się komponenty

**Nawigacja pigułkowa kategorii**
- Poziomy rząd przycisków w kształcie pigułek do nawigacji najwyższego poziomu („Ride", „Drive", „Business", „Uber Eats", „About")
- Każda pigułka: tło Chip Gray, czarny tekst, radius 999px
- Stan aktywny wskazany czarnym tłem z białym tekstem (inwersja)

**Hero z podwójną akcją**
- Podzielone hero: tekst/CTA po lewej, mapa/ilustracja po prawej
- Dwa pola wejściowe obok siebie dla miejsca odbioru/celu
- Przycisk CTA „See prices" w czarnej pigułce

**Karty planowania z wyprzedzeniem**
- Karty promujące funkcje takie jak „Uber Reserve" i planowanie podróży
- Bogato ilustrowane z ciepłymi, zorientowanymi na ludzi obrazami
- Czarne przyciski CTA z białym tekstem na dole

## 5. Zasady układu

### System odstępów
- Jednostka bazowa: 8px
- Skala: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Padding przycisków: 10px 12px (kompaktowy) lub 14px 16px (wygodny)
- Wewnętrzny padding karty: około 24-32px
- Pionowe odstępy sekcji: hojne, ale efektywne — około 64-96px między głównymi sekcjami

### Siatka i kontener
- Maksymalna szerokość kontenera: około 1136px, wyśrodkowany
- Hero: podzielony układ z tekstem po lewej, wizualizacją po prawej
- Sekcje funkcji: dwukolumnowe siatki kart lub pełnoszerokościowa pojedyncza kolumna
- Stopka: wielokolumnowa siatka linków na czarnym tle
- Sekcje na pełną szerokość rozszerzające się do krawędzi viewportu

### Filozofia białej przestrzeni
- **Efektywna, nie przestronna**: Biała przestrzeń Uber jest funkcjonalna — wystarczająca do separacji, nigdy na tyle duża, by wyglądać na pustą. To odstępowanie systemu tranzytowego: kompaktowe, czytelne, celowe.
- **Karty gęste informacyjnie**: Karty pakują informacje ciasno z minimalnym wewnętrznym odstępowaniem, opierając się na cieniu i promieniu do definiowania granic.
- **Oddech sekcji**: Główne sekcje dostają hojne pionowe odstępy, ale wewnątrz sekcji elementy są blisko zgrupowane.

### Skala promienia zaokrąglenia
- Ostry (0px): Żadnych kwadratowych narożników w elementach interaktywnych
- Standardowy (8px): Karty z treścią, pola wejściowe, listboxy
- Wygodny (12px): Wyróżnione karty, większe kontenery, karty linków
- Pełna pigułka (999px): Wszystkie przyciski, chipy, elementy nawigacyjne, pigułki
- Koło (50%): Obrazy awatarów, kontenery ikon, okrągłe elementy sterujące

## 6. Głębia i uniesienie

| Poziom | Obróbka | Zastosowanie |
|--------|---------|--------------|
| Płaski (Poziom 0) | Brak cienia, jednolite tło | Tło strony, treść inline, sekcje tekstowe |
| Subtelny (Poziom 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Standardowe karty z treścią, bloki funkcji |
| Średni (Poziom 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Uniesione karty, elementy nakładek |
| Pływający (Poziom 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Pływające przyciski akcji, sterowanie mapą |
| Wciśnięty (Poziom 4) | `rgba(0,0,0,0.08) inset` (spread 999px) | Stany aktywne/wciśnięte przycisków |
| Pierścień focus | `rgb(255,255,255) 0px 0px 0px 2px inset` | Wskaźniki focus klawiaturowego |

**Filozofia cieni**: Uber używa cienia wyłącznie jako narzędzia strukturalnego, nigdy dekoracyjnego. Cienie są zawsze czarne przy bardzo niskim kryciu (0.08-0.16), tworząc minimalne uniesienie potrzebne do separacji warstw treści. Promienie rozmycia są umiarkowane (8-16px) — wystarczające, by wyglądać naturalnie, ale nigdy dramatycznie. Nie ma kolorowych cieni, nakładanych stosów cieni ani efektów otaczającej poświaty. Głębia jest komunikowana bardziej przez kontrast sekcji czarnych/białych niż przez uniesienie cieniami.

## 7. Reguły — co robić, czego unikać

### Rób
- Używaj prawdziwej czerni (`#000000`) i czystej bieli (`#ffffff`) jako podstawowej palety — surowy kontrast TO jest Uber
- Używaj border-radius 999px dla wszystkich przycisków, chipów i elementów nawigacyjnych w kształcie pigułek
- Zachowuj wszystkie nagłówki w UberMove Bold (700) dla uderzenia na poziomie billboardu
- Używaj cieni delikatnych jak szelest (krycie 0.12-0.16) dla uniesienia kart — ledwo widocznych
- Utrzymuj kompaktowy, gęsty informacyjnie styl układu — Uber stawia efektywność nad przestronność
- Używaj ciepłych, zorientowanych na ludzi ilustracji, by złagodzić monochromatyczny interfejs
- Stosuj radius 8px dla kart z treścią i 12px dla wyróżnionych kontenerów
- Używaj UberMoveText przy wadze 500 do nawigacji i wyeksponowanego tekstu UI
- Łącz czarne podstawowe przyciski z białymi drugorzędnymi do układów z podwójną akcją

### Nie rób
- Nie wprowadzaj kolorów do chrom interfejsu — interfejs Uber jest ściśle czarno-biało-szary
- Nie używaj zaokrągleń narożników mniejszych niż 999px na przyciskach — kształt pełnej pigułki jest kluczowym elementem tożsamości
- Nie stosuj ciężkich cieni lub drop shadows o wysokim kryciu — głębia jest subtelna jak szelest
- Nie używaj czcionek szeryfowych nigdzie — typografia Uber jest wyłącznie geometrycznym sans-serif
- Nie twórz przestronnych układów z nadmierną białą przestrzenią — gęstość Uber jest zamierzona
- Nie używaj gradientów ani nakładek kolorów — każda powierzchnia jest płaskim, jednolitym kolorem
- Nie mieszaj UberMove do tekstu głównego ani UberMoveText do nagłówków — hierarchia jest ścisła
- Nie używaj dekoracyjnych obramowań — obramowania są funkcjonalne (pola wejściowe, separatory) lub nieobecne
- Nie łagodź kontrastu czarno-białego odcieniami bieli ani prawie-czerni — dualność jest celowa

## 8. Zachowanie responsywne

### Punkty przerwania
| Nazwa | Szerokość | Kluczowe zmiany |
|-------|----------|-----------------|
| Mobilny mały | 320px | Minimalny układ, pojedyncza kolumna, pola wejściowe w stosie, kompaktowa typografia |
| Mobilny | 600px | Standardowy mobilny, układ w stosie, nawigacja hamburgerowa |
| Tablet mały | 768px | Zaczynają się dwukolumnowe siatki, rozszerzone układy kart |
| Tablet | 1119px | Pełny układ tabletu, treść hero obok siebie |
| Desktop mały | 1120px | Aktywuje się siatka desktopowa, poziome pigułki nawigacyjne |
| Desktop | 1136px | Pełny układ desktopowy, maksymalna szerokość kontenera, podzielone hero |

### Cele dotykowe
- Wszystkie przyciski pigułkowe: minimalna wysokość 44px (pionowy padding 10-14px + wysokość linii)
- Chipy nawigacyjne: hojny padding 14px 16px dla wygodnego dotykania kciukiem
- Okrągłe elementy sterujące (menu, zamknięcie): radius 50% zapewnia duże, łatwe w trafieniu cele
- Powierzchnie kart służą jako pełnoobszarowe cele dotykowe na urządzeniach mobilnych

### Strategia zwijania
- **Nawigacja**: Pozioma nawigacja pigułkowa zwija się do menu hamburgerowego z okrągłym przełącznikiem
- **Hero**: Podzielony układ (tekst + mapa/wizualizacja) układa się w pojedynczą kolumnę — tekst powyżej, wizualizacja poniżej
- **Pola wejściowe**: Pola odbioru/celu obok siebie układają się pionowo
- **Karty funkcji**: Dwukolumnowa siatka zwija się do kart na pełnej szerokości w stosie
- **Nagłówki**: Display 52px skaluje się w dół przez 36px, 32px, 24px, 20px
- **Stopka**: Wielokolumnowa siatka linków zwija się do akordeonu lub pojedynczej kolumny w stosie
- **Pigułki kategorii**: Poziome przewijanie z overflow na mniejszych ekranach

### Zachowanie obrazów
- Ilustracje skalują się proporcjonalnie w swoich kontenerach
- Obrazy hero zachowują proporcje, mogą być przycinane na mniejszych ekranach
- Sekcje z kodami QR ukrywają się na urządzeniach mobilnych (pobieranie aplikacji przenosi się do bezpośrednich linków do sklepów)
- Obrazy kart zachowują border-radius 8-12px we wszystkich rozmiarach

## 9. Przewodnik po promptach dla agenta

### Szybka referencyjna paleta kolorów
- Podstawowy przycisk: „Uber Black (#000000)"
- Tło strony: „Pure White (#ffffff)"
- Tekst przycisku (na czarnym): „Pure White (#ffffff)"
- Tekst przycisku (na białym): „Uber Black (#000000)"
- Drugorzędny tekst: „Body Gray (#4b4b4b)"
- Trzeciorzędny tekst: „Muted Gray (#afafaf)"
- Tło chipa: „Chip Gray (#efefef)"
- Stan hover: „Hover Gray (#e2e2e2)"
- Cień karty: „rgba(0,0,0,0.12) 0px 4px 16px"
- Tło stopki: „Uber Black (#000000)"

### Przykładowe prompty komponentów
- „Utwórz sekcję hero na Pure White (#ffffff) z nagłówkiem przy 52px UberMove Bold (700), wysokość linii 1.23. Użyj tekstu Uber Black (#000000). Dodaj podtytuł w Body Gray (#4b4b4b) przy 16px UberMoveText waga 400 z wysokością linii 1.50. Umieść przycisk CTA pigułkowy Uber Black (#000000) z tekstem Pure White, radius 999px, padding 10px 12px."
- „Zaprojektuj pasek nawigacji kategorii z poziomymi przyciskami pigułkowymi. Każda pigułka: tło Chip Gray (#efefef), tekst Uber Black (#000000), padding 14px 16px, border-radius 999px. Aktywna pigułka odwraca się do tła Uber Black z tekstem Pure White. Użyj UberMoveText przy 14px waga 500."
- „Zbuduj kartę funkcji na Pure White (#ffffff) z border-radius 8px i cieniem rgba(0,0,0,0.12) 0px 4px 16px. Tytuł w UberMove przy 24px waga 700, opis w Body Gray (#4b4b4b) przy 16px UberMoveText. Dodaj czarny przycisk CTA pigułkowy na dole."
- „Utwórz ciemną stopkę na Uber Black (#000000) z tekstem nagłówka Pure White (#ffffff) w UberMove przy 20px waga 700. Linki stopki w Muted Gray (#afafaf) przy 14px UberMoveText. Linki przy hover zmieniają się na Pure White. Wielokolumnowy układ siatki."
- „Zaprojektuj pływający przycisk akcji z tłem Pure White (#ffffff), radius 999px, padding 14px i cieniem rgba(0,0,0,0.16) 0px 2px 8px. Hover zmienia tło na #f3f3f3. Użyj do przewijania do góry lub sterowania mapą."

### Przewodnik iteracji
1. Skupiaj się na JEDNYM komponencie na raz
2. Odwołuj się do ścisłej palety czarno-białej — „użyj Uber Black (#000000)", nie „zrób to ciemnym"
3. Zawsze określaj radius 999px dla przycisków i pigułek — to jest niezbywalne dla tożsamości Uber
4. Opisuj rodzinę czcionek explicite — „UberMove Bold dla nagłówka, UberMoveText Medium dla etykiety"
5. Dla cieni używaj „cieniu jak szelest (rgba(0,0,0,0.12) 0px 4px 16px)" — nigdy ciężkich drop shadows
6. Zachowuj układy kompaktowe i gęste informacyjnie — Uber jest efektywny, nie przestronny
7. Ilustracje powinny być ciepłe i ludzkie — opisuj „stylizowane postacie w ciepłych tonach", nie abstrakcyjne kształty
8. Łącz czarne CTA z białymi elementami drugorzędnymi dla zrównoważonych układów z podwójną akcją
