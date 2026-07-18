# System Projektowania Inspirowany Nike

> Category: E-Commerce & Retail
> Sprzedaż sportowa. Monochromatyczny interfejs, masywna typografia wersalikami, fotografia pełnokadrowa.

## 1. Motyw Wizualny i Atmosfera

Nike.com to kinetyczna katedra handlu detalicznego — witryna, która przekształca wybuchową energię sportu w cyfrowe doświadczenie zakupowe. Projekt opiera się na zasadzie radykalnej prostoty: wszystko sprowadza się do czerni, bieli i szarości, by fotografii sportowej i kolorom produktów dać przestrzeń do dominowania bez konkurencji. Efekt przypomina nie tyle stronę internetową, co sportową edycję magazynu złożoną z precyzją luksusowego periodyku. Każdy piksel powierzchni albo sprzedaje produkt, albo ku niemu kieruje.

„Podium CDS" (wewnętrzny Core Design System Nike) ustanawia agresywnie monochromatyczną podstawę. Interfejs znika w tekście w kolorze czerni (`#111111`) i białych powierzchniach, pozwalając fotografii bohaterów — pocącym się atletom, butom w locie, energii stadionu — nieść ciężar emocjonalny. Gdy kolor pojawia się w interfejsie, pełni niemal wyłącznie funkcję informacyjną: czerwony dla błędów, niebieski dla linków, zielony dla potwierdzeń. Sam produkt jest historią koloru. Ta powściągliwość tworzy wizualny paradoks: najbardziej kolorowe strony w internecie wyglądają najbardziej minimalistycznie, bo wszelka żywość pochodzi z towaru, a nie z interfejsu.

System typograficzny to druga połowa wizualnej tożsamości Nike. Masywne nagłówki wersalikami w Nike Futura ND — specjalnie skrojonej, zwężonej odmianie Futury z niemożliwie ciasną interlinią (0.90) — przebijają się przez obrazy bohaterów niczym typograficzny wstrząs. Poniżej nagłówków rodzina Helvetica Now obsługuje wszystko — od nawigacji po opisy produktów — ze szwajcarską precyzją i czytelnością. Ten podział między ekspresywną typografią wyświetlaczy a funkcjonalnym tekstem podstawowym odzwierciedla dwoistość marki Nike: inspiracja spotyka się z wykonaniem.

**Kluczowe Cechy Charakterystyczne:**
- Monochromatyczny interfejs (czerń/biel/szarość), w którym jedynym źródłem koloru jest fotografia produktowa
- Masywna typografia wyświetlaczy wersalikami (96px, interlinia 0.90), przebijająca się przez obrazy bohaterów
- Fotografia pełnokadrowa bez zaokrągleń narożników — obraz wypełnia każdą dostępną krawędź
- Przyciski w kształcie pigułki (promień 30px) jako główny element interaktywny
- Siatka odstępów 8px z atletyczną dyscypliną — każdy pomiar wpasowuje się w system
- Architektura zakupowa oparta na kategoriach z dużymi kartami nawigacyjnymi ze zdjęciami
- Model głębokości bez cieni i z minimalną ilością obramowań — zróżnicowanie powierzchni wyłącznie przez przesunięcia w skali szarości

## 2. Paleta Kolorów i Role

### Podstawowe

- **Nike Black** (`#111111`): Fundament — tekst podstawowy, tła przycisków, tekst nawigacji, nakładki na bohaterów. Celowo nie jest czystą czernią (#000000), co tworzy nieco łagodniejsze wrażenia podczas czytania
- **Nike White** (`#FFFFFF`): Główne tło strony, tekst przycisków na ciemnym tle, powierzchnie kart, tło paska nawigacji

### Powierzchnie i Tła

- **Snow** (`#FAFAFA`): Najjaśniejsza powierzchnia, subtelne zróżnicowanie zbliżone do bieli (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Tło drugorzędne, wypełnienie pól wyszukiwania, placeholder obrazu, szkielet ładowania (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Tło stanu najechania, wypełnienie wyłączonego przycisku (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Tło główne w ciemnych/odwróconych sekcjach (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Odwrócone tło podstawowe, najciemniejsza powierzchnia poza czernią (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Stan najechania na ciemnych tłach (--podium-cds-color-grey-700)

### Neutralne i Tekstowe

- **Primary Text** (`#111111`): Główny tekst podstawowy, nagłówki, linki nawigacyjne (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Tekst opisowy, metadane, znaczniki czasu, etykiety cen (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Elementy nieaktywne, opcje niedostępne (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Wyłączony tekst na ciemnych tłach (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Standardowy kolor obramowania, zgodny z tekstem drugorzędnym
- **Border Secondary** (`#CACACB`): Subtelne obramowania, obramowania pól, linie podziału (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Nieaktywny stan obramowania
- **Border Active** (`#111111`): Aktywne/skupione obramowanie, zgodne z tekstem podstawowym

### Semantyczne i Akcentowe

- **Nike Red** (`#D30005`): Krytyczne błędy, plakietki wyprzedaży, pilne powiadomienia (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, nieco jaśniejsza czerwień dla podkreślenia
- **Nike Orange Badge** (`#D33918`): Tekst plakietek, promocyjne oznaczenia (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Wyrazisty akcent pomarańczowy (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Potwierdzenie, dostępność, stany pozytywne (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Sukces na ciemnych tłach (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Linki tekstowe, informacyjne wyróżnienia (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Linki na ciemnych tłach (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Tła ostrzeżeń, banery zwracające uwagę (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Pierścień wskaźnika fokusa klawiatury

### Rozszerzone Spektrum Kolorów (Podium CDS)

Każda rampa kolorów przebiega od 50 do 900 do ekspresywnego użycia w kampaniach i stronach produktowych:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### System Gradientów

Nike unika gradientów w interfejsie. Gdy gradienty się pojawiają, mają charakter fotograficzny — nakładane na tła bohaterów produktowych (np. czerwony but na gradiencie od czerwonego do głębszej czerwieni). Sam system projektowania używa wyłącznie jednolitych kolorów.

## 3. Zasady Typografii

### Rodzina Czcionek

**Wyświetlaczy:** Nike Futura ND (specjalna zwężona odmiana Futury, ekskluzywna dla Nike)
- Zamienniki: Helvetica Now Text Medium, Helvetica, Arial
- Używana wyłącznie do dużych nagłówków wyświetlanych wersalikami
- Charakterystycznie ciasna interlinia (0.90) i transformacja na wielkie litery

**Nagłówkowa:** Helvetica Now Display Medium
- Zamienniki: Helvetica, Arial
- Używana do nagłówków sekcji i tytułów produktów przy 24–32px

**Treściowa Medium:** Helvetica Now Text Medium (waga 500)
- Zamienniki: Helvetica, Arial
- Używana do linków, przycisków, podpisów, wyróżnionego tekstu podstawowego

**Treściowa:** Helvetica Now Text (waga 400)
- Zamienniki: Helvetica, Arial
- Używana do standardowego tekstu podstawowego, opisów, metadanych

**Arabska:** Neue Frutiger Arabic — alternatywa specyficzna dla danej lokalizacji

### Hierarchia

| Rola | Rozmiar | Waga | Interlinia | Odstęp liter | Uwagi |
|------|---------|------|------------|--------------|-------|
| Wyświetlacza | 96px | 500 | 0.90 | — | Nike Futura ND, wersaliki, nagłówki bohaterów |
| Nagłówek 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, tytuły sekcji |
| Nagłówek 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, podsekcje |
| Nagłówek 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, tytuły kart |
| Treść | 16px | 400 | 1.75 | — | Helvetica Now Text, opisy produktów |
| Treść Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, wyróżniony tekst |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, linki nawigacyjne |
| Link Mały | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, linki stopki/narzędziowe |
| Przycisk | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, tekst CTA |
| Przycisk Mały | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, przyciski drugorzędne |
| Podpis | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, etykiety cen |
| Mały | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, znaczniki czasu |
| Bardzo Mały | 12px | 400 | 1.50 | — | Helvetica Now Text, tekst prawny |

### Zasady

Typografia Nike to studium napięcia. Warstwa wyświetlaczy — Nike Futura ND w 96px z druzgocącą interlinią 0.90 — jest zaprojektowana tak, by wyglądała jak tablica wyników na stadionie: masywna, zwężona, pisana wersalikami, niemożliwa do zignorowania. Zmienia nagłówki w bojowe okrzyki. Poniżej warstwy wyświetlaczy Helvetica Now stanowi kliniczny kontrapunkt: szwajcarska precyzja czytelności z hojną interlinią 1.75 dla komfortowego przeglądania produktów. Waga 500 (Medium) dominuje w całym tekście podstawowym, nadając prozie Nike nieznaczną asertywność bez ciężaru pogrubienia — każde zdanie czyta się jak pewna siebie rekomendacja, nie jak krzyk.

## 4. Style Komponentów

### Przyciski

**Podstawowy**
- Tło: Nike Black (`#111111`)
- Tekst: Biały (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Obramowanie: brak
- Promień obramowania: w pełni zaokrąglona pigułka (30px)
- Padding: ~12px 24px
- Najechanie: tło zmienia się na Grey-500 (`#707072`), kolor tekstu przy najechaniu
- Aktywny: efekt ripple scale(0) z opacity 0.5
- Fokus: 2px box-shadow ring w `rgba(39, 93, 197, 1)`
- Przejście: background 200ms ease

**Podstawowy na Ciemnym Tle**
- Tło: Biały (`#FFFFFF`)
- Tekst: Czarny (`#111111`)
- Najechanie: tło zmienia się na Grey-300 (`#CACACB`)

**Drugorzędny (Obrysowany)**
- Tło: przezroczyste
- Tekst: Nike Black (`#111111`)
- Obramowanie: 1.5px solid `#CACACB` (grey-300)
- Promień obramowania: 30px
- Najechanie: obramowanie ciemnieje do `#707072`, tło do grey-200

**Wyłączony**
- Tło: Grey-200 (`#E5E5E5`)
- Tekst: Grey-400 (`#9E9EA0`)
- Kursor: not-allowed

**Przycisk Ikonowy**
- Tło: Grey-100 (`#F5F5F5`)
- Kształt: promień 30px (lub 50% dla okrągłego)
- Padding: 6px
- Najechanie: tło Grey-500

### Karty i Kontenery

- Tło: Biały (`#FFFFFF`) — w większości przypadków bez widocznej granicy karty
- Promień obramowania: 0px dla kart produktów ze zdjęciami (obrazy krawędź do krawędzi), 20px dla interaktywnych kontenerów
- Cień: brak — Nike w ogóle nie używa cieni kart
- Najechanie: brak efektu uniesienia na kartach produktów; podkreślenie na linkach tekstowych wewnątrz kart
- Karty produktów: zdjęcie na górze (bez promienia), metadane tekstowe poniżej z odstępem 12px
- Karty kategorii: pełnokadrowa fotografia z nakładką tekstową na ciemnym gradiencie
- Przejście: opacity 200ms ease przy zamianie zdjęcia po najechaniu

### Pola Wejściowe i Formularze

- Tło: Grey-100 (`#F5F5F5`)
- Obramowanie: 1px solid `#CACACB` gdy widoczne, lub bez obramowania przy wyszukiwaniu
- Promień obramowania: 24px (pola wyszukiwania), 8px (pola formularzy)
- Czcionka: Helvetica Now Text, 16px
- Fokus: obramowanie zmienia się na `#111111` (border-active), 2px focus ring w `rgba(39, 93, 197, 1)`
- Błąd: obramowanie `#D30005` (krytyczny)
- Placeholder: Grey-500 (`#707072`)
- Przejście: border-color 200ms ease

### Nawigacja

- Tło: Biały (`#FFFFFF`), przyklejony
- Wysokość: ~60px na komputerze
- Lewa strona: logo Nike Swoosh (SVG 24x24px)
- Środek: linki kategorii (Nowości i Wyróżnione, Mężczyźni, Kobiety, Dzieci, Wyprzedaż) 16px/500 Helvetica Now Text Medium
- Prawa strona: Wyszukiwanie (pole wejściowe o promieniu 24px), Ulubione, ikony Koszyka
- Najechanie: kolor tekstu zmienia się na Grey-500 (`#707072`)
- Mobilna: hamburger menu, nakładka pełnoekranowa
- Górny baner: pasek promocyjny z ciemnym tłem (#111111) i białym tekstem

### Obróbka Obrazów

- Obrazy bohaterów: pełnokadrowe, bez promienia obramowania, krawędź do krawędzi
- Siatka produktów: proporcja kwadratowa (1:1) lub 4:3, bez promienia obramowania
- Karty kategorii: 16:9 lub 4:3, pełnokadrowe z nakładką tekstową
- Placeholder obrazu: jednolite tło Grey-100 (`#F5F5F5`)
- Leniwe ładowanie: natywne loading="lazy", szkielet używa tła #F5F5F5
- Najechanie na produkt: zamiana na zdjęcie dodatkowe (widok z przodu → z boku)

### Banery Promocyjne

- Ciemne tło pełnej szerokości (`#111111`) z białym tekstem
- Ciasny padding (8-12px pionowo)
- Tekst wyśrodkowany, 12px/500 Helvetica Now Text Medium
- Używane dla promocji wysyłkowych, korzyści członkowskich, ogłoszeń wyprzedaży

## 5. Zasady Układu

### System Odstępów

Jednostka bazowa: 4px (podstawowa siatka to wielokrotności 8px)

| Token | Wartość | Zastosowanie |
|-------|---------|--------------|
| space-1 | 4px | Ciasne odstępy ikon, odstępy inline |
| space-2 | 8px | Jednostka bazowa, odstępy ikon przycisków |
| space-3 | 12px | Wewnętrzny padding kart, ciasne marginesy |
| space-4 | 16px | Standardowy padding, odstępy nawigacji |
| space-5 | 20px | Odstępy kart produktów |
| space-6 | 24px | Wewnętrzny padding sekcji, odstępy siatki |
| space-7 | 32px | Podziały sekcji |
| space-8 | 48px | Główny padding sekcji |
| space-9 | 64px | Padding sekcji bohaterów |
| space-10 | 80px | Duże odstępy sekcji |

### Siatka i Kontener

- Maksymalna szerokość kontenera: 1920px
- Standardowa szerokość treści: ~1440px z poziomym paddingiem
- Siatka produktów: 3 kolumny na komputerze, 2 kolumny na tablecie, 1 kolumna na urządzeniu mobilnym
- Siatka kategorii: 3 kolumny z pełnokadrową fotografią
- Odstęp siatki: 4-12px między kartami produktów (celowo ciasny)
- Poziomy padding: 48px komputer, 24px tablet, 16px mobilny

### Filozofia Białej Przestrzeni

Strategia białej przestrzeni Nike jest celowo agresywna — nie w luksusowy, swobodny sposób marki modowej, lecz w sprężony, wysokogęstościowy sposób wypełniający każdy piksel treścią lub intencjonalną pustką. Siatki produktów używają minimalnych odstępów (4-12px), by tworzyć poczucie obfitości i wyboru. Podziały sekcji są hojne (48-80px), by oddzielać konteksty zakupowe. Ogólny efekt to sklep wypełniony produktami, który pozostaje jednak czytelny w nawigacji — jak dobrze zorganizowany superstore sportowy.

### Skala Promieni Obramowania

| Wartość | Kontekst |
|---------|---------|
| 0px | Zdjęcia produktów, fotografia bohaterów (ostre krawędzie) |
| 8px | Pola formularzy (inne niż wyszukiwanie) |
| 18px | Małe elementy interaktywne |
| 20px | Kontenery, karty z treścią interfejsu |
| 24px | Pola wyszukiwania, średnie pigułki |
| 30px | Przyciski, tagi, filtry (pełna pigułka) |
| 50% | Okrągłe przyciski ikonowe, placeholdery awatarów |

## 6. Głębokość i Elewacja

| Poziom | Obróbka | Zastosowanie |
|--------|---------|--------------|
| Płaski | Brak cienia, brak obramowania | Stan domyślny dla wszystkiego |
| Separator | `0px -1px 0px 0px #E5E5E5 inset` | Subtelna linia wewnętrzna między sekcjami |
| Fokus | `0 0 0 2px rgba(39, 93, 197, 1)` | Pierścień fokusa klawiatury |
| Nakładka | Ciemny scrim nad fotografią | Czytelność tekstu na obrazie |

Filozofia elewacji Nike jest radykalnie płaska. Nie ma cieni kart, uniesień po najechaniu ani unoszących się elementów. Głębokość komunikowana jest wyłącznie przez kolor — ciemne sekcje cofają się, jasne sekcje wysuwają się do przodu, przesunięcia szarości wskazują zmiany stanu. Ta płaskość wzmacnia sportową, konkretną osobowość marki: bez wizualnych ozdób, tylko bezpośrednia komunikacja. Jedynym „cieniem" w całym systemie jest 1px wbudowana linia separatora i wymagany przez dostępność pierścień fokusa.

### Dekoracyjna Głębokość

- **Nakładki na fotografię bohaterów**: Ciemne gradienty scrims na pełnokadrowej fotografii dla czytelności tekstu
- **Tła gradientowe produktów**: Kolorowe tła za głównymi zdjęciami produktowymi (np. czerwony but na czerwonym gradiencie)
- **Pasy banerów**: Jednolite ciemne paski promocyjne (#111111) na górze strony

## 7. Zasady Do i Nie Rób

### Rób

- Używaj Nike Black (#111111) dla całego tekstu podstawowego — nigdy czystego #000000
- Utrzymuj przyciski w kształcie pigułki (promień 30px) i ogranicz je do wariantów podstawowego/drugorzędnego
- Używaj pełnokadrowej fotografii krawędź do krawędzi dla sekcji bohaterów — bez promienia obramowania na obrazach
- Pozwól, by fotografia produktowa była jedynym źródłem żywości kolorów; utrzymuj interfejs monochromatycznie
- Używaj Nike Futura ND wersalikami WYŁĄCZNIE dla nagłówków wyświetlaczy (96px+)
- Zachowuj ciasne odstępy siatki produktów (4-12px) dla gęstego, obfitego wrażenia
- Używaj Grey-100 (#F5F5F5) dla wszystkich teł pól wejściowych i placeholderów
- Rezerwuj kolor wyłącznie dla znaczenia semantycznego (czerwony=błąd, zielony=sukces, niebieski=link)
- Używaj wagi 500 (Medium) dla wszystkich interaktywnych elementów tekstowych

### Nie Rób

- Nie dodawaj cieni do kart — model elewacji Nike jest całkowicie płaski
- Nie używaj promienia obramowania na zdjęciach produktów — zaokrąglone narożniki mają tylko elementy interfejsu
- Nie wprowadzaj kolorów marki spoza skali szarości dla elementów interfejsu
- Nie używaj Nike Futura ND poniżej 24px — to wyłącznie krój wyświetlaczy
- Nie dodawaj efektów uniesienia przy najechaniu — karty Nike nie animują się po najechaniu
- Nie używaj wagi zwykłej (400) dla przycisków ani linków — zawsze używaj 500
- Nie umieszczaj kolorowych teł za elementami interfejsu — kolor jest zarezerwowany dla kontekstów produktowych
- Nie używaj więcej niż dwóch poziomów hierarchii tekstu na kartę (tytuł + treść)
- Nie dodawaj dekoracyjnych separatorów — 1px wbudowana linia to jedyny wzorzec separatora
- Nie zmiękczaj kontrastu — projekt Nike celowo maksymalizuje czerń na bieli

## 8. Zachowanie Responsywne

### Punkty Przełamania

| Nazwa | Szerokość | Kluczowe Zmiany |
|-------|-----------|-----------------|
| Mobilny | <640px | Jedna kolumna, nawigacja hamburger, tekst wyświetlacza skaluje się w dół, ciasny padding 16px |
| Mały Tablet | 640-768px | Zaczyna się siatka produktów 2-kolumnowa, nawigacja nadal zwinięta |
| Tablet | 768-960px | Siatki 2-kolumnowe, karty kategorii skalują się, poziomy padding 24px |
| Mały Komputer | 960-1024px | Nawigacja rozwija się do pełnej poziomej, 3-kolumnowa siatka produktów |
| Komputer | 1024-1440px | Pełny układ, rozwinięta nawigacja, siatki 3-kolumnowe, padding 48px |
| Duży Komputer | >1440px | Kontener o maksymalnej szerokości wyśrodkowany, zwiększone marginesy, obrazy bohaterów pełnokadrowe |

### Cele Dotykowe

- Minimalny cel dotykowy: 44x44px (WCAG AAA)
- Ikony nawigacji mobilnej: obszar dotykowy 48x48px
- Karty produktów: cała powierzchnia jest dotykalna
- Pigułki filtrów: minimalna wysokość 36px z paddingiem 12px

### Strategia Zwijania

- **Nawigacja**: Pełne linki kategorii → hamburger menu poniżej 960px; ikony wyszukiwania, ulubionych i koszyka pozostają widoczne
- **Siatki produktów**: 3 kol. → 2 kol. przy 960px → 1 kol. przy 640px
- **Sekcje bohaterów**: Tekst wyświetlacza skaluje się od 96px → 64px → 48px; obrazy bohaterów pozostają pełnokadrowe we wszystkich rozmiarach
- **Karty kategorii**: 3 kol. → 2 kol. → 1 kol. z zachowaną pełnokadrową fotografią
- **Padding sekcji**: 80px → 48px → 32px → 24px w miarę zawężania okna widoku
- **Baner promocyjny**: tekst zawija lub ucina się, zachowuje ciemne tło

### Zachowanie Obrazów

- Responsywne obrazy przez Nike CDN (`c.static-nike.com`) z parametrami szerokości
- Obrazy produktów: srcset z wieloma rozdzielczościami (w_320, w_640, w_960, w_1920)
- Obrazy bohaterów: pełnokadrowe we wszystkich punktach przełamania, proporcje zmieniają się (16:9 komputer → 4:3 mobilny)
- Leniwe ładowanie: natywne loading="lazy", placeholder grey-100 podczas ładowania
- Kierowanie artystyczne: kadry bohaterów zmieniają się między kompozycjami na komputerze i urządzeniu mobilnym

## 9. Przewodnik po Promptach dla Agenta

### Szybkie Odniesienie do Kolorów

- Podstawowe CTA: Nike Black (`#111111`)
- Tło: Biały (`#FFFFFF`)
- Powierzchnia drugorzędna: Light Gray (`#F5F5F5`)
- Tekst nagłówków: Nike Black (`#111111`)
- Tekst podstawowy / najechanie: Secondary Text (`#707072`)
- Obramowanie: Border Secondary (`#CACACB`)
- Błąd: Nike Red (`#D30005`)
- Link: Link Blue (`#1151FF`)

### Przykładowe Prompty Komponentów

- "Utwórz sekcję bohatera produktowego z pełnokadrową fotografią krawędź do krawędzi, bez promienia obramowania, ciemną nakładką gradientową dla tekstu oraz masywnym nagłówkiem 96px/500 wersalikami w stylu Nike Futura z interlinią 0.90 i przyciskiem pigułką Nike Black (#111111) o promieniu 30px"
- "Zaprojektuj 3-kolumnową siatkę kart produktów z kwadratowymi obrazami (bez promienia obramowania), odstępem 4px między kartami, nazwą produktu 16px/500 Nike Black (#111111), ceną 14px/500 i tekstem drugorzędnym w Grey-500 (#707072)"
- "Zbuduj przyklejony biały pasek nawigacji z logo wyrównanym do lewej, wyśrodkowanymi linkami kategorii 16px/500 (#111111) z kolorem #707072 po najechaniu oraz wyrównanymi do prawej wyszukiwaniem (promień 24px, tło #F5F5F5), ulubionymi i ikonami koszyka"
- "Utwórz promocyjny pasek banerowy z tłem #111111, białym wyśrodkowanym tekstem 12px/500 i pionowym paddingiem 8px — pełna szerokość, bez promienia obramowania"
- "Zaprojektuj obrysowany przycisk drugorzędny z przezroczystym tłem, obramowaniem 1.5px #CACACB, promieniem pigułki 30px, tekstem 16px/500 #111111, obramowaniem ciemniejącym przy najechaniu do #707072"

### Przewodnik po Iteracji

Podczas dopracowywania istniejących ekranów wygenerowanych z tym systemem projektowania:
1. Skupiaj się na JEDNYM komponencie na raz
2. Odwołuj się do konkretnych nazw kolorów i kodów hex z tego dokumentu
3. Pamiętaj: fotografia produktowa jest kolorem — interfejs pozostaje monochromatyczny
4. Używaj skali szarości do zmian stanu: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Jeśli coś w interfejsie wydaje się zbyt kolorowe, prawdopodobnie tak jest — Nike utrzymuje interfejs w skali szarości
6. Typografia wyświetlaczy (Nike Futura) powinna ZAWSZE być pisana wersalikami i nigdy poniżej 24px
7. Typografia treści (Helvetica Now) prawie zawsze powinna mieć wagę 500 dla elementów interaktywnych
