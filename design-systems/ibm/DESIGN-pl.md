# System Projektowania Inspirowany IBM

> Category: Media & Consumer
> Technologia korporacyjna. System projektowania Carbon, strukturowana paleta niebieskiego.

## 1. Motyw Wizualny i Atmosfera

Strona internetowa IBM jest cyfrowym wcieleniem korporacyjnego autorytetu zbudowanego na systemie projektowania Carbon — języku wizualnym tak metodycznie ustrukturyzowanym, że przypomina specyfikację inżynieryjną przetworzoną na stronę WWW. Strona opiera się na wyraźnej dwoistości: jasnobiałe (`#ffffff`) tło z niemal czarnym (`#161616`) tekstem, akcentowane pojedynczym, niezmiennym kolorem — IBM Blue 60 (`#0f62fe`). To nie jest beztroskie minimalistyczne podejście startupu technologicznego; to korporacyjna precyzja skondensowana w pikselach. Każdy element istnieje w ramach sztywnej siatki 2x systemu Carbon, każdy kolor odpowiada tokenowi semantycznemu, każda wartość odstępu zatrzaskuje się na bazowej jednostce 8px.

Rodzina krojów IBM Plex stanowi kręgosłup systemu. IBM Plex Sans w lekkiej wadze (300) dla nagłówków wyświetlaczowych tworzy nieoczekiwanie zwiewną, niemal delikatną jakość przy dużych rozmiarach — celowy kontrapunkt do korporacyjnego ciężaru IBM. Przy rozmiarach akapitowych, regularna waga (400) z odstępem liter 0.16px na podpisach 14px wprowadza skrupulatne mikro-śledzenie, które sprawia, że tekst Carbon wydaje się zaprojektowany inżynieryjnie, a nie typograficznie. IBM Plex Mono służy do kodu, danych i etykiet technicznych, dopełniając trójcę rodziny obok rzadko używanego IBM Plex Serif.

To, co definiuje tożsamość wizualną IBM poza monochromatyką i niebieskim, to poleganie na systemie tokenów komponentów Carbon. Każdy stan interaktywny mapuje się na właściwość niestandardową CSS poprzedzoną `--cds-` (Carbon Design System). Przyciski nie mają zakodowanych na stałe kolorów; odwołują się do `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Ta stokenizowana architektura oznacza, że cała warstwa wizualna jest cienką powłoką nad głęboko systematycznym fundamentem — projektowym odpowiednikiem dobrze otypowanego API.

**Kluczowe Cechy Charakterystyczne:**
- IBM Plex Sans w wadze 300 (Light) do wyświetlaczy — korporacyjna powaga przez typograficzną powściągliwość
- IBM Plex Mono do kodu i treści technicznych ze stałym odstępem liter 0.16px przy małych rozmiarach
- Jeden kolor akcentowy: IBM Blue 60 (`#0f62fe`) — każdy element interaktywny, każde CTA, każdy link
- System tokenów Carbon (`--cds-*`) sterujący wszystkimi kolorami semantycznymi, umożliwiający przełączanie motywów na poziomie zmiennych
- Siatka odstępów 8px z ścisłym przestrzeganiem — żadnych dowolnych wartości, wszystko wyrównane
- Płaskie, pozbawione obramowań karty na powierzchni `#f4f4f4` Gray 10 — głębia przez warstwowanie kolorów tła, nie cienie
- Pola formularzy z dolnym obramowaniem (nie obwiedzione) — charakterystyczny wzorzec formularzy Carbon
- Promień zaokrąglenia 0px dla przycisków głównych — bezkompromisowo prostokątny, bez zmiękczania

## 2. Paleta Kolorów i Role

### Podstawowe
- **IBM Blue 60** (`#0f62fe`): Jedyny kolor interaktywny. Przyciski główne, linki, stany fokusa, wskaźniki aktywności. To jedyna chromatyczna barwa w podstawowej palecie UI.
- **Biały** (`#ffffff`): Tło strony, powierzchnie kart, tekst przycisku na niebieskim tle, `--cds-background`.
- **Gray 100** (`#161616`): Tekst główny, nagłówki, ciemne tła powierzchni, pasek nawigacyjny, stopka. `--cds-text-primary`.

### Skala Neutralna (Rodzina Szarości)
- **Gray 100** (`#161616`): Tekst główny, nagłówki, ciemne elementy UI, tło stopki.
- **Gray 90** (`#262626`): Wtórne ciemne powierzchnie, stany najechania na ciemnych tłach.
- **Gray 80** (`#393939`): Trzeciorzędna ciemna, stany aktywne.
- **Gray 70** (`#525252`): Tekst wtórny, tekst pomocniczy, opisy. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Tekst zastępczy, tekst wyłączony.
- **Gray 50** (`#8d8d8d`): Wyłączone ikony, przytłumione etykiety.
- **Gray 30** (`#c6c6c6`): Obramowania, linie podziału, dolne obramowania pól formularzy. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Subtelne obramowania, kontury kart.
- **Gray 10** (`#f4f4f4`): Tło powierzchni wtórnej, wypełnienia kart, naprzemienne wiersze. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Stan najechania dla powierzchni Gray 10.

### Interaktywne
- **Blue 60** (`#0f62fe`): Główny interaktywny — przyciski, linki, fokus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Stan najechania na link. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Stan aktywny/wciśnięty dla niebieskich elementów.
- **Blue 10** (`#edf5ff`): Powierzchnia odcienia niebieskiego, tło wybranego wiersza.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — wewnętrzne obramowanie 2px na sfokusowanych elementach.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — biały pierścień wewnętrzny dla fokusa na ciemnych tłach.

### Wsparcie i Status
- **Red 60** (`#da1e28`): Błąd, niebezpieczeństwo. `--cds-support-error`.
- **Green 50** (`#24a148`): Sukces. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Ostrzeżenie. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informacyjny. `--cds-support-info`.

### Ciemny Motyw (Motyw Gray 100)
- **Tło**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Powierzchnie kart i kontenerów.
- **Layer 02**: Gray 80 (`#393939`). Podwyższone powierzchnie.
- **Tekst główny**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Tekst wtórny**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Subtelne obramowanie**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interaktywny**: Blue 40 (`#78a9ff`). Linki i elementy interaktywne przesuwają się w stronę jaśniejszych odcieni dla kontrastu.

## 3. Zasady Typografii

### Rodzina Czcionek
- **Podstawowa**: `IBM Plex Sans`, z zastępnikami: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, z zastępnikami: `Menlo, Courier, monospace`
- **Szeryfowa** (ograniczone użycie): `IBM Plex Serif`, do kontekstów redakcyjnych/ekspresywnych
- **Czcionka Ikon**: `ibm_icons` — własnościowe glify ikon przy 20px

### Hierarchia

| Rola | Czcionka | Rozmiar | Waga | Wysokość Wiersza | Odstęp Liter | Uwagi |
|------|----------|---------|------|------------------|--------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Maksymalny efekt, lekka waga dla elegancji |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Wtórne hero, responsywna alternatywa |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Ekspresywny nagłówek |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Nagłówki sekcji |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Tytuły podsekcji |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Tytuły kart, nagłówki funkcji |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Lżejsze nagłówki kart |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Standardowy tekst do czytania |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Wyróżniony akapit, etykiety |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Zwięzły akapit, podpisy |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Pogrubione podpisy, elementy nawigacji |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadane, znaczniki czasu |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Kod inline, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Bloki kodu |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Dekoracyjne mono dla hero |

### Zasady
- **Lekka waga przy rozmiarach wyświetlaczowych**: Ekspresywny zestaw typograficzny Carbon używa wagi 300 (Light) przy 42px+. Tworzy to charakterystyczne napięcie — treść przemawia z korporacyjnym autorytetem, podczas gdy litery szepczą typograficzną lekkością.
- **Mikro-śledzenie przy małych rozmiarach**: Odstęp liter 0.16px przy 14px i 0.32px przy 12px. Te pozornie nieistotne wartości to tajemna broń Carbon w zakresie czytelności przy kompaktowych rozmiarach — otwierają ciasne formy liter IBM Plex dokładnie o tyle, ile trzeba.
- **Trzy funkcjonalne wagi**: 300 (wyświetlacz/ekspresywny), 400 (akapit/do czytania), 600 (wyróżnienie/etykiety UI). Waga 700 jest celowo nieobecna w produkcyjnej skali typograficznej.
- **Produktywny vs. Ekspresywny**: Zestawy produktywne używają ściślejszych wysokości wierszy (1.29) dla gęstego UI. Zestawy ekspresywne oddychają swobodniej (1.40-1.50) dla treści marketingowych i redakcyjnych.

## 4. Style Komponentów

### Przyciski

**Przycisk Główny (Niebieski)**
- Tło: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Tekst: `#ffffff` (White)
- Dopełnienie: 14px 63px 14px 15px (asymetryczne — miejsce na ikonę końcową)
- Obramowanie: 1px solid transparent
- Promień zaokrąglenia: 0px (ostry prostokąt — sygnatura Carbon)
- Wysokość: 48px (domyślna), 40px (kompaktowa), 64px (ekspresywna)
- Najechanie: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Aktywny: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Fokus: `2px solid #0f62fe` inset + `1px solid #ffffff` wewnętrzny

**Przycisk Wtórny (Szary)**
- Tło: `#393939` (Gray 80)
- Tekst: `#ffffff`
- Najechanie: `#4c4c4c` (Gray 70)
- Aktywny: `#6f6f6f` (Gray 60)
- Takie samo dopełnienie/promień jak główny

**Przycisk Trzeciorzędny (Ghost Niebieski)**
- Tło: transparent
- Tekst: `#0f62fe` (Blue 60)
- Obramowanie: 1px solid `#0f62fe`
- Najechanie: tekst `#0353e9` + odcień tła Blue 10
- Promień zaokrąglenia: 0px

**Przycisk Ghost**
- Tło: transparent
- Tekst: `#0f62fe` (Blue 60)
- Dopełnienie: 14px 16px
- Obramowanie: brak
- Najechanie: odcień tła `#e8e8e8`

**Przycisk Niebezpieczeństwa**
- Tło: `#da1e28` (Red 60)
- Tekst: `#ffffff`
- Najechanie: `#b81921` (Red 70)

### Karty i Kontenery
- Tło: `#ffffff` w jasnym motywie, `#f4f4f4` (Gray 10) dla podwyższonych kart
- Obramowanie: brak (płaski design — brak obramowania lub cienia na większości kart)
- Promień zaokrąglenia: 0px (dopasowany do prostokątnej estetyki przycisków)
- Najechanie: tło zmienia się na `#e8e8e8` (Gray 10 Hover) dla klikalnych kart
- Dopełnienie treści: 16px
- Separacja: warstwowanie kolorów tła (biały → gray 10 → biały) zamiast cieni

### Pola Formularzy
- Tło: `#f4f4f4` (Gray 10) — `--cds-field`
- Tekst: `#161616` (Gray 100)
- Dopełnienie: 0px 16px (tylko poziome)
- Wysokość: 40px (domyślna), 48px (duża)
- Obramowanie: brak na bokach/górze — `2px solid transparent` na dole
- Aktywne dolne obramowanie: `2px solid #161616` (Gray 100)
- Fokus: dolne obramowanie `2px solid #0f62fe` (Blue 60) — `--cds-focus`
- Błąd: dolne obramowanie `2px solid #da1e28` (Red 60)
- Etykieta: 12px IBM Plex Sans, odstęp liter 0.32px, Gray 70
- Tekst pomocniczy: 12px, Gray 60
- Tekst zastępczy: Gray 60 (`#6f6f6f`)
- Promień zaokrąglenia: 0px (góra) — pola mają ostre rogi

### Nawigacja
- Tło: `#161616` (Gray 100) — ciemny masthead pełnej szerokości
- Wysokość: 48px
- Logo: logo IBM 8-pasków, białe na ciemnym, wyrównane do lewej
- Linki: 14px IBM Plex Sans, waga 400, `#c6c6c6` (Gray 30) domyślny
- Najechanie na link: tekst `#ffffff`
- Aktywny link: `#ffffff` z dolnym wskaźnikiem obramowania
- Przełącznik platformy: poziome zakładki wyrównane do lewej
- Wyszukiwanie: pole wyszukiwania wysuwane po kliknięciu ikony
- Mobile: hamburger z przesuwanym panelem z lewej

### Linki
- Domyślny: `#0f62fe` (Blue 60) bez podkreślenia
- Najechanie: `#0043ce` (Blue 70) z podkreśleniem
- Odwiedzony: pozostaje Blue 60 (bez zmiany stanu odwiedzonego)
- Linki inline: domyślnie podkreślone w treści akapitowej

### Wyróżniające Się Komponenty

**Blok Treści (Hero/Wyróżniony)**
- Naprzemienne pasy tła pełnej szerokości biały/gray-10
- Nagłówek wyrównany do lewej z typem wyświetlaczowym 60px lub 48px
- CTA jako niebieski przycisk główny z ikoną strzałki
- Ilustracja/obraz wyrównany do prawej lub poniżej na mobile

**Kafelek (Klikalna Karta)**
- Tło: `#f4f4f4` lub `#ffffff`
- Pełnoszerokie dolne obramowanie lub zmiana tła przy najechaniu
- Ikona strzałki w prawym dolnym rogu przy najechaniu
- Brak cienia — płaskość jest tożsamością

**Etykieta / Tag**
- Tło: kolor kontekstowy przy 10% kryciu (np. Blue 10, Red 10)
- Tekst: odpowiadający kolor 60-stopniowy
- Dopełnienie: 4px 8px
- Promień zaokrąglenia: 24px (pigułka — wyjątek od reguły 0px)
- Czcionka: 12px waga 400

**Baner Powiadomień**
- Pełnoszerokie pasmo, zazwyczaj tło Blue 60 lub Gray 100
- Biały tekst, 14px
- Ikona zamknięcia/odrzucenia wyrównana do prawej

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px (siatka Carbon 2x)
- Skala odstępów komponentów: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Skala odstępów układu: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Mini jednostka: 8px (najmniejszy użyteczny odstęp)
- Dopełnienie wewnątrz komponentów: zazwyczaj 16px
- Przerwa między kartami/kafelkami: 1px (linia włosowa) lub 16px (standardowa)

### Siatka i Kontener
- 16-kolumnowa siatka (system siatki 2x Carbon)
- Maksymalna szerokość treści: 1584px (maksymalny breakpoint)
- Rynny kolumn: 32px (16px na mobile)
- Margines: 16px (mobile), 32px (tablet+)
- Treść zazwyczaj zajmuje 8-12 kolumn dla czytelnych długości wierszy
- Sekcje pełnokrwiste naprzemienne z zawartą treścią

### Filozofia Białej Przestrzeni
- **Funkcjonalna gęstość**: Carbon preferuje produktywną gęstość zamiast rozległej białej przestrzeni. Sekcje są ciasno upakowane w porównaniu do konsumenckich systemów projektowania — odzwierciedla to korporacyjne DNA IBM.
- **Strefowanie kolorami tła**: Zamiast ogromnych odstępów między sekcjami, IBM używa naprzemiennych kolorów tła (biały → gray 10 → biały) do tworzenia wizualnej separacji przy minimalnej przestrzeni pionowej.
- **Stały rytm 48px**: Główne przejścia sekcji używają 48px odstępów pionowych. Sekcje hero mogą używać 80px–96px.

### Skala Promieni Zaokrągleń
- **0px**: Przyciski główne, pola formularzy, kafelki, karty — dominujące podejście. Carbon jest fundamentalnie prostokątny.
- **2px**: Okazjonalnie na małych elementach interaktywnych (etykiety)
- **24px**: Tagi/etykiety (kształt pigułki — jedyny zaokrąglony wyjątek)
- **50%**: Okręgi awatarów, kontenery ikon

## 6. Głębia i Elewacja

| Poziom | Leczenie | Zastosowanie |
|--------|----------|--------------|
| Płaski (Level 0) | Brak cienia, tło `#ffffff` | Domyślna powierzchnia strony |
| Layer 01 | Brak cienia, tło `#f4f4f4` | Karty, kafelki, naprzemienne sekcje |
| Layer 02 | Brak cienia, tło `#e0e0e0` | Podwyższone panele wewnątrz Layer 01 |
| Uniesiony | `0 2px 6px rgba(0,0,0,0.3)` | Listy rozwijane, podpowiedzi, menu przepełnienia |
| Nakładka | `0 2px 6px rgba(0,0,0,0.3)` + ciemna kurtyna | Okna modalne, boczne panele |
| Fokus | `2px solid #0f62fe` inset + `1px solid #ffffff` | Pierścień fokusa klawiatury |
| Dolne obramowanie | `2px solid #161616` na dolnej krawędzi | Aktywne pole formularza, wskaźnik aktywnej zakładki |

**Filozofia Cieni**: Carbon jest celowo niechętny cieniom. IBM osiąga głębię przede wszystkim przez warstwowanie kolorów tła — układanie powierzchni o stopniowo ciemniejszych szarościach zamiast dodawania box-shadow. Tworzy to płaską, zainspirowaną drukiem estetykę, gdzie hierarchia jest komunikowana przez wartość koloru, a nie symulowane światło. Cienie są zarezerwowane wyłącznie dla elementów pływających (listy rozwijane, podpowiedzi, modale), gdzie element rzeczywiście nakłada się na treść. Ta powściągliwość nadaje rzadkiemu cieniowi znaczący wpływ — gdy coś unosi się w Carbon, ma to znaczenie.

## 7. Co Robić i Czego Nie Robić

### Robić
- Używaj IBM Plex Sans w wadze 300 dla rozmiarów wyświetlaczowych (42px+) — lekkość jest zamierzona
- Stosuj odstęp liter 0.16px dla tekstu akapitowego 14px i 0.32px dla podpisów 12px
- Używaj promienia zaokrąglenia 0px dla przycisków, pól formularzy, kart i kafelków — prostokąty są systemem
- Odwołuj się do nazw tokenów `--cds-*` podczas implementacji (np. `--cds-button-primary`, `--cds-text-primary`)
- Używaj warstwowania kolorów tła (biały → gray 10 → gray 20) dla głębi zamiast cieni
- Używaj dolnego obramowania (nie obwiedni) dla wskaźników pól formularzy
- Zachowuj domyślną wysokość przycisku 48px i asymetryczne dopełnienie dla pomieszczenia ikon
- Stosuj Blue 60 (`#0f62fe`) jako jedyny akcent — jeden niebieski do rządzenia wszystkimi

### Nie Robić
- Nie zaokrąglaj rogów przycisków — promień 0px jest tożsamością Carbon
- Nie używaj cieni na kartach ani kafelkach — płaskość jest sednem
- Nie wprowadzaj dodatkowych kolorów akcentowych — system IBM jest monochromatyczny + niebieski
- Nie używaj wagi 700 (Bold) — skala kończy się na 600 (Semibold)
- Nie dodawaj odstępu liter do tekstu w rozmiarze wyświetlaczowym — śledzenie jest tylko dla 14px i mniejszych
- Nie obwódź pól formularzy pełnymi obramowaniami — pola Carbon używają tylko dolnego obramowania
- Nie używaj gradientowych teł — powierzchnie IBM są płaskie, jednokolorowe
- Nie odchylaj się od siatki odstępów 8px — każda wartość powinna być podzielna przez 8 (z 2px i 4px dla mikrokorekt)

## 8. Zachowanie Responsywne

### Breakpointy
| Nazwa | Szerokość | Kluczowe Zmiany |
|-------|-----------|-----------------|
| Small (sm) | 320px | Jedna kolumna, nawigacja hamburger, marginesy 16px |
| Medium (md) | 672px | Zaczyna się siatka 2-kolumnowa, rozszerzona treść |
| Large (lg) | 1056px | Pełna nawigacja widoczna, siatki 3-4 kolumnowe |
| X-Large (xlg) | 1312px | Maksymalna gęstość treści, szerokie układy |
| Max | 1584px | Maksymalna szerokość treści, wyśrodkowana z marginesami |

### Obszary Dotyku
- Wysokość przycisku: 48px domyślna, minimum 40px (kompaktowa)
- Linki nawigacyjne: wysokość wiersza 48px dla dotyku
- Wysokość pola formularza: 40px domyślna, 48px duże
- Przyciski z ikonami: obszar dotyku 48px kwadrat
- Elementy menu mobilnego: pełnoszerokie wiersze 48px

### Strategia Zwijania
- Hero: wyświetlacz 60px → 42px → nagłówek 32px w miarę zwężania widoku
- Nawigacja: pełny poziomy masthead → hamburger z wysuwanym panelem
- Siatka: 4-kolumnowa → 2-kolumnowa → jedna kolumna
- Kafelki/karty: pozioma siatka → pionowy stos
- Obrazy: zachowanie proporcji, max-width 100%
- Stopka: wielokolumnowe grupy linków → ułożone w jednej kolumnie
- Dopełnienie sekcji: 48px → 32px → 16px

### Zachowanie Obrazów
- Responsywne obrazy z `max-width: 100%`
- Ilustracje produktów skalowane proporcjonalnie
- Obrazy hero mogą zmieniać układ z boku-do-boku na ułożony poniżej
- Wizualizacje danych zachowują proporcje z poziomym przewijaniem na mobile

## 9. Przewodnik po Promptach dla Agenta

### Szybki Podgląd Kolorów
- Główne CTA: IBM Blue 60 (`#0f62fe`)
- Tło: White (`#ffffff`)
- Tekst nagłówka: Gray 100 (`#161616`)
- Tekst akapitu: Gray 100 (`#161616`)
- Tekst wtórny: Gray 70 (`#525252`)
- Powierzchnia/Karta: Gray 10 (`#f4f4f4`)
- Obramowanie: Gray 30 (`#c6c6c6`)
- Link: Blue 60 (`#0f62fe`)
- Najechanie na link: Blue 70 (`#0043ce`)
- Pierścień fokusa: Blue 60 (`#0f62fe`)
- Błąd: Red 60 (`#da1e28`)
- Sukces: Green 50 (`#24a148`)

### Przykładowe Prompty do Komponentów
- "Utwórz sekcję hero na białym tle. Nagłówek 60px IBM Plex Sans waga 300, line-height 1.17, kolor #161616. Podtytuł 16px waga 400, line-height 1.50, kolor #525252, max-width 640px. Niebieski przycisk CTA (#0f62fe tło, #ffffff tekst, promień zaokrąglenia 0px, wysokość 48px, dopełnienie 14px 63px 14px 15px)."
- "Zaprojektuj kafelek karty: tło #f4f4f4, promień zaokrąglenia 0px, dopełnienie 16px. Tytuł 20px IBM Plex Sans waga 600, line-height 1.40, kolor #161616. Akapit 14px waga 400, odstęp liter 0.16px, line-height 1.29, kolor #525252. Najechanie: tło zmienia się na #e8e8e8."
- "Zbuduj pole formularza: tło #f4f4f4, promień zaokrąglenia 0px, wysokość 40px, poziome dopełnienie 16px. Etykieta powyżej 12px waga 400, odstęp liter 0.32px, kolor #525252. Dolne obramowanie: domyślnie 2px solid transparent, 2px solid #0f62fe na fokusie. Tekst zastępczy: #6f6f6f."
- "Utwórz ciemny pasek nawigacyjny: tło #161616, wysokość 48px. Logo IBM białe wyrównane do lewej. Linki 14px IBM Plex Sans waga 400, kolor #c6c6c6. Najechanie: tekst #ffffff. Aktywny: #ffffff z dolnym obramowaniem 2px."
- "Zbuduj komponent taga: tło Blue 10 (#edf5ff), tekst Blue 60 (#0f62fe), dopełnienie 4px 8px, promień zaokrąglenia 24px, 12px IBM Plex Sans waga 400."

### Przewodnik po Iteracji
1. Zawsze używaj promienia zaokrąglenia 0px dla przycisków, pól formularzy i kart — to jest niepodlegające negocjacji w Carbon
2. Odstęp liter tylko przy małych rozmiarach: 0.16px przy 14px, 0.32px przy 12px — nigdy dla tekstu wyświetlaczowego
3. Trzy wagi: 300 (wyświetlacz), 400 (akapit), 600 (wyróżnienie) — bez pogrubienia
4. Blue 60 to jedyny kolor akcentowy — nie wprowadzaj wtórnych kolorów akcentowych
5. Głębia pochodzi z warstwowania kolorów tła (biały → `#f4f4f4` → `#e0e0e0`), nie cieni
6. Pola formularzy mają tylko dolne obramowanie, nigdy pełne obwiednie
7. Używaj prefiksu `--cds-` do nazewnictwa tokenów, aby zachować zgodność z Carbon
8. 48px to uniwersalna wysokość elementów interaktywnych
