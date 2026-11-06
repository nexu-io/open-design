# System Projektowania Inspirowany Vercel

> Category: Narzędzia Deweloperskie
> Wdrożenia frontendowe. Czarno-biała precyzja, czcionka Geist.

## 1. Motyw Wizualny i Atmosfera

Strona Vercel to wizualny manifest infrastruktury deweloperskiej uczynionej niewidzialną — system projektowania tak powściągliwy, że graniczy z filozoficznym. Strona jest przytłaczająco biała (`#ffffff`) z niemal czarnym (`#171717`) tekstem, tworząc galeryjną pustkę, w której każdy element zasługuje na swój piksel. To nie minimalizm jako dekoracja; to minimalizm jako zasada inżynierska. System projektowania Geist traktuje interfejs jak kompilator traktuje kod — każdy zbędny token jest usuwany, aż pozostaje wyłącznie struktura.

Rodzina czcionek Geist to klejnot koronny. Geist Sans używa agresywnego ujemnego śledzenia liter (-2,4px do -2,88px przy rozmiarach wyświetlania), tworząc nagłówki, które wyglądają na skompresowane, pilne i inżynierskie — jak kod zminifikowany do produkcji. Przy rozmiarach treści śledzenie rozluźnia się, ale geometryczna precyzja pozostaje. Geist Mono dopełnia system jako monospacowy towarzysz kodu, danych wyjściowych terminala i etykiet technicznych. Obie czcionki włączają globalnie OpenType `"liga"` (ligatury), dodając warstwę typograficznej wyrafinowania, która nagradza uważne czytanie.

To, co odróżnia Vercel od innych monochromatycznych systemów projektowania, to filozofia cienia-jako-obramowania. Zamiast tradycyjnych obramowań CSS, Vercel używa `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — cienia o zerowym przesunięciu, zerowym rozmyciu i 1px rozproszeniu, który tworzy linię podobną do obramowania bez implikacji dla modelu pudełkowego. Ta technika pozwala obramowaniom istnieć w warstwie cienia, umożliwiając płynniejsze przejścia, zaokrąglone narożniki bez przycinania i subtelniejszy wizualny ciężar niż tradycyjne obramowania. Cały system głębokości opiera się na warstwowych, wielowartościowych stosach cieni, gdzie każda warstwa służy konkretnemu celowi: jedna dla obramowania, jedna dla miękkiego uniesienia, jedna dla otaczającej głębokości.

**Kluczowe Cechy Charakterystyczne:**
- Geist Sans z ekstremalnym ujemnym śledzeniem liter (-2,4px do -2,88px przy wyświetlaniu) — tekst jako skompresowana infrastruktura
- Geist Mono dla kodu i etykiet technicznych z globalnym OpenType `"liga"`
- Technika cienia-jako-obramowania: `box-shadow 0px 0px 0px 1px` zastępuje tradycyjne obramowania wszędzie
- Wielowarstwowe stosy cieni dla niuansowanej głębokości (obramowanie + uniesienie + otaczające w pojedynczych deklaracjach)
- Niemal czysto biała kanwa z tekstem `#171717` — nie zupełnie czarny, tworząc mikro-kontrastową miękkość
- Kolory akcentów specyficzne dla przepływu pracy: Czerwień Wysyłki (`#ff5b4f`), Różowy Podglądu (`#de1d8d`), Niebieski Dewelopmentu (`#0a72ef`)
- System pierścieni fokusu używający `hsla(212, 100%, 48%, 1)` — nasycony niebieski dla dostępności
- Znaczniki pigułkowe (9999px) z odcieniowanymi tłami dla wskaźników statusu

## 2. Paleta Kolorów i Role

### Podstawowe
- **Czerń Vercel** (`#171717`): Podstawowy tekst, nagłówki, ciemne tła powierzchni. Nie czysta czerń — lekkie ciepło zapobiega surowości.
- **Czysta Biel** (`#ffffff`): Tło strony, powierzchnie kart, tekst przycisków na ciemnym tle.
- **Prawdziwa Czerń** (`#000000`): Użycie drugorzędne, `--geist-console-text-color-default`, stosowane w konkretnych kontekstach konsoli/kodu.

### Kolory Akcentów Przepływu Pracy
- **Czerwień Wysyłki** (`#ff5b4f`): `--ship-text`, etap przepływu pracy "wyślij do produkcji" — ciepły, pilny koral-czerwień.
- **Różowy Podglądu** (`#de1d8d`): `--preview-text`, przepływ wdrożenia podglądu — żywy magentowo-różowy.
- **Niebieski Dewelopmentu** (`#0a72ef`): `--develop-text`, przepływ pracy deweloperskiej — jasny, skupiony niebieski.

### Kolory Konsoli / Kodu
- **Niebieski Konsoli** (`#0070f3`): `--geist-console-text-color-blue`, niebieski podświetlenia składni.
- **Fiolet Konsoli** (`#7928ca`): `--geist-console-text-color-purple`, fiolet podświetlenia składni.
- **Różowy Konsoli** (`#eb367f`): `--geist-console-text-color-pink`, różowy podświetlenia składni.

### Interaktywne
- **Niebieski Linku** (`#0072f5`): Podstawowy kolor linku z dekoracją podkreślenia.
- **Niebieski Fokusu** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, pierścień fokusu na elementach interaktywnych.
- **Niebieski Pierścienia** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, narzędzie pierścienia Tailwind.

### Skala Neutralna
- **Szary 900** (`#171717`): Podstawowy tekst, nagłówki, tekst nawigacji.
- **Szary 600** (`#4d4d4d`): Tekst drugorzędny, tekst opisowy.
- **Szary 500** (`#666666`): Tekst trzeciorzędny, przyciemnione linki.
- **Szary 400** (`#808080`): Tekst zastępczy, stany wyłączone.
- **Szary 100** (`#ebebeb`): Obramowania, kontury kart, separatory.
- **Szary 50** (`#fafafa`): Subtelny odcień powierzchni, wewnętrzne podświetlenie cienia.

### Powierzchnia i Nakładka
- **Tło Nakładki** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, tło modalnego/okna dialogowego.
- **Tekst Zaznaczenia** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, podświetlenie zaznaczenia tekstu.
- **Tło Niebieskiej Odznaki** (`#ebf5ff`): Tło znacznika pigułkowego, odcieniowana niebieska powierzchnia.
- **Tekst Niebieskiej Odznaki** (`#0068d6`): Tekst znacznika pigułkowego, ciemniejszy niebieski dla czytelności.

### Cienie i Głębokość
- **Cień Obramowania** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): Charakterystyczny — zastępuje tradycyjne obramowania.
- **Subtelne Uniesienie** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Minimalne uniesienie dla kart.
- **Stos Kart** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Pełny wielowarstwowy cień karty.
- **Obramowanie Pierścieniowe** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Jasnoszare obramowanie pierścieniowe dla zakładek i obrazów.

## 3. Zasady Typografii

### Rodzina Czcionek
- **Podstawowa**: `Geist`, z zamiennikami: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospacowa**: `Geist Mono`, z zamiennikami: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Funkcje OpenType**: `"liga"` włączone globalnie na całym tekście Geist; `"tnum"` dla tabelarycznych liczb na konkretnych podpisach.

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość Linii | Odstęp Liter | Uwagi |
|------|----------|---------|---------|----------------|--------------|-------|
| Główny Wyświetlacz | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (ciasno) | -2.4px do -2.88px | Maksymalna kompresja, efekt billboardowy |
| Nagłówek Sekcji | Geist | 40px (2.50rem) | 600 | 1.20 (ciasno) | -2.4px | Tytuły sekcji funkcji |
| Duży Podnagłówek | Geist | 32px (2.00rem) | 600 | 1.25 (ciasno) | -1.28px | Nagłówki kart, podsekcje |
| Podnagłówek | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Lżejsze podnagłówki |
| Tytuł Karty | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Karty funkcji |
| Lekki Tytuł Karty | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Drugorzędne nagłówki kart |
| Duże Ciało | Geist | 20px (1.25rem) | 400 | 1.80 (rozluźnione) | normal | Wprowadzenia, opisy funkcji |
| Ciało | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Standardowy tekst do czytania |
| Małe Ciało | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Standardowy tekst UI |
| Średnie Ciało | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Nawigacja, podkreślony tekst |
| Półgrube Ciało | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Mocne etykiety, aktywne stany |
| Przycisk / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Przyciski, linki, podpisy |
| Mały Przycisk | Geist | 14px (0.88rem) | 400 | 1.00 (ciasno) | normal | Kompaktowe przyciski |
| Podpis | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Metadane, tagi |
| Mono Ciało | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Bloki kodu |
| Mono Podpis | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Etykiety kodu |
| Mono Małe | Geist Mono | 12px (0.75rem) | 500 | 1.00 (ciasno) | normal | `text-transform: uppercase`, etykiety techniczne |
| Mikro Odznaka | Geist | 7px (0.44rem) | 700 | 1.00 (ciasno) | normal | `text-transform: uppercase`, małe odznaki |

### Zasady
- **Kompresja jako tożsamość**: Geist Sans przy rozmiarach wyświetlania używa odstępu liter -2,4px do -2,88px — najbardziej agresywne ujemne śledzenie spośród wszystkich głównych systemów projektowania. Tworzy to tekst, który czuje się _zminifikowany_, jak kod zoptymalizowany do produkcji. Śledzenie stopniowo rozluźnia się wraz ze zmniejszaniem rozmiaru: -1,28px przy 32px, -0,96px przy 24px, -0,32px przy 16px, a normal przy 14px.
- **Ligatury wszędzie**: Każdy element tekstowy Geist włącza OpenType `"liga"`. Ligatury nie są dekoracją — są strukturalne, tworząc ciaśniejsze, bardziej efektywne kombinacje glifów.
- **Trzy grubości, ściśle określone role**: 400 (ciało/czytanie), 500 (UI/interaktywne), 600 (nagłówki/podkreślenie). Brak pogrubienia (700) poza małymi mikro-odznakami. Ten wąski zakres grubości tworzy hierarchię poprzez rozmiar i śledzenie, a nie grubość.
- **Mono dla tożsamości**: Geist Mono pisane wielkimi literami z `"tnum"` lub `"liga"` służy jako głos "konsoli deweloperskiej" — kompaktowe etykiety techniczne łączące stronę marketingową z produktem.

## 4. Stylizacje Komponentów

### Przyciski

**Podstawowy Biały (Z Obramowaniem Cieniowym)**
- Tło: `#ffffff`
- Tekst: `#171717`
- Wypełnienie: 0px 6px (minimalne — szerokość uzależniona od treści)
- Promień: 6px (delikatnie zaokrąglony)
- Cień: `rgb(235, 235, 235) 0px 0px 0px 1px` (obramowanie pierścieniowe)
- Po najechaniu: tło zmienia się na `var(--ds-gray-1000)` (ciemne)
- Fokus: kontur `2px solid var(--ds-focus-color)` + cień `var(--ds-focus-ring)`
- Zastosowanie: Standardowy przycisk drugorzędny

**Podstawowy Ciemny (Wywnioskowany z systemu Geist)**
- Tło: `#171717`
- Tekst: `#ffffff`
- Wypełnienie: 8px 16px
- Promień: 6px
- Zastosowanie: Główne wezwanie do działania ("Start Deploying", "Get Started")

**Przycisk Pigułkowy / Odznaka**
- Tło: `#ebf5ff` (odcieniony niebieski)
- Tekst: `#0068d6`
- Wypełnienie: 0px 10px
- Promień: 9999px (pełna pigułka)
- Czcionka: 12px grubość 500
- Zastosowanie: Odznaki statusu, tagi, etykiety funkcji

**Duża Pigułka (Nawigacja)**
- Tło: przezroczyste lub `#171717`
- Promień: 64px–100px
- Zastosowanie: Nawigacja zakładkowa, selektory sekcji

### Karty i Kontenery
- Tło: `#ffffff`
- Obramowanie: poprzez cień — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Promień: 8px (standardowy), 12px (wyróżnione/karty z obrazem)
- Stos cieni: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Karty z obrazem: `1px solid #ebebeb` z górnym promieniem 12px
- Po najechaniu: subtelne intensyfikowanie cienia

### Pola Wejściowe i Formularze
- Przycisk radiowy: standardowa stylizacja z tłem `var(--ds-gray-200)` przy fokusu
- Cień fokusu: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Kontur fokusu: `2px solid var(--ds-focus-color)` — spójny niebieski pierścień fokusu
- Obramowanie: poprzez technikę cieniową, nie tradycyjne obramowanie

### Nawigacja
- Czysta pozioma nawigacja na białym tle, przyklejona
- Logotyp Vercel wyrównany do lewej, 262x52px
- Linki: Geist 14px grubość 500, tekst `#171717`
- Aktywny: grubość 600 lub podkreślenie
- Wezwanie do działania: ciemne przyciski pigułkowe ("Start Deploying", "Contact Sales")
- Urządzenia mobilne: zwijane menu hamburgerowe
- Rozwijane menu produktów z wielopoziomowymi menu

### Obróbka Obrazów
- Zrzuty ekranu produktu z obramowaniem `1px solid #ebebeb`
- Obrazy zaokrąglone u góry: promień `12px 12px 0px 0px`
- Zrzuty ekranu pulpitu/kodu zdominują sekcje funkcji
- Miękkie gradientowe tła za obrazami bohaterskimi (pastelowe wielokolorowe)

### Charakterystyczne Komponenty

**Potok Przepływu Pracy**
- Trzyetapowy poziomy potok: Develop → Preview → Ship
- Każdy etap ma własny kolor akcentu: Niebieski → Różowy → Czerwony
- Połączone liniami/strzałkami
- Wizualna metafora dla głównej propozycji wartości Vercel

**Pasek Zaufania / Siatka Logo**
- Logo firm (Perplexity, ChatGPT, Cursor itp.) w skali szarości
- Poziome przewijanie lub układ siatki
- Subtelne rozdzielenie obramowaniem `#ebebeb`

**Karty Metryk**
- Wyświetlanie dużej liczby (np. "10x szybciej")
- Geist 48px grubość 600 dla metryki
- Poniżej opis w szarym tekście treści
- Kontener karty z obramowaniem cieniowym

## 5. Zasady Układu

### System Odstępów
- Jednostka podstawowa: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Godny uwagi skok: przejście z 16px do 32px — brak 20px ani 24px w skali podstawowej

### Siatka i Kontener
- Maksymalna szerokość treści: około 1200px
- Bohater: wyśrodkowana pojedyncza kolumna z hojnym górnym wypełnieniem
- Sekcje funkcji: siatki 2–3 kolumn dla kart
- Pełnoszerokie separatory używające `border-bottom: 1px solid #171717`
- Zrzuty ekranu kodu/pulpitu jako pełnoszerokie lub zawarte z obramowaniem

### Filozofia Białej Przestrzeni
- **Pustka galeryjna**: Masywne pionowe wypełnienie między sekcjami (80px–120px+). Biała przestrzeń JEST projektem — komunikuje, że Vercel nie ma nic do udowodnienia ani ukrycia.
- **Skompresowany tekst, rozszerzona przestrzeń**: Agresywne ujemne śledzenie liter w nagłówkach jest zrównoważone hojną otaczającą białą przestrzenią. Tekst jest gęsty; przestrzeń wokół niego jest rozległa.
- **Rytm sekcji**: Białe sekcje przeplatają się z białymi sekcjami — między sekcjami nie ma zróżnicowania kolorystycznego. Separacja pochodzi wyłącznie z obramowań (cieni-obramowań) i odstępów.

### Skala Promieni Obramowania
- Mikro (2px): Fragmenty kodu inline, małe spany
- Subtelny (4px): Małe kontenery
- Standardowy (6px): Przyciski, linki, elementy funkcjonalne
- Wygodny (8px): Karty, elementy listy
- Obraz (12px): Wyróżnione karty, kontenery obrazów (zaokrąglone u góry)
- Duży (64px): Pigułki nawigacji zakładkowej
- XL (100px): Duże linki nawigacyjne
- Pełna Pigułka (9999px): Odznaki, pigułki statusu, tagi
- Okrąg (50%): Przełącznik menu, kontenery awatarów

## 6. Głębokość i Uniesienie

| Poziom | Obróbka | Zastosowanie |
|--------|---------|--------------|
| Płaski (Poziom 0) | Brak cienia | Tło strony, bloki tekstowe |
| Pierścień (Poziom 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Cień-jako-obramowanie dla większości elementów |
| Jasny Pierścień (Poziom 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Jaśniejszy pierścień dla zakładek, obrazów |
| Subtelna Karta (Poziom 2) | Pierścień + `rgba(0,0,0,0.04) 0px 2px 2px` | Standardowe karty z minimalnym uniesieniem |
| Pełna Karta (Poziom 3) | Pierścień + Subtelny + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + wewnętrzny pierścień `#fafafa` | Wyróżnione karty, podświetlone panele |
| Fokus (Dostępność) | kontur `2px solid hsla(212, 100%, 48%, 1)` | Fokus klawiatury na wszystkich elementach interaktywnych |

**Filozofia Cienia**: Vercel posiada prawdopodobnie najbardziej wyrafinowany system cieni we współczesnym projektowaniu webowym. Zamiast używać cieni dla uniesienia w tradycyjnym sensie Material Design, Vercel używa wielowartościowych stosów cieni, gdzie każda warstwa ma odrębny cel architektoniczny: jedna tworzy "obramowanie" (0px rozproszenie, 1px), inna dodaje otaczającą miękkość (rozmycie 2px), jeszcze inna obsługuje głębokość na odległość (rozmycie 8px z ujemnym rozproszeniem), a wewnętrzny pierścień (`#fafafa`) tworzy subtelne podświetlenie sprawiające, że karta "świeci" od wewnątrz. To warstwowe podejście sprawia, że karty wyglądają na zbudowane, a nie unoszące się.

### Ozdobna Głębokość
- Gradient bohatera: miękka, pastelowa wielokolorowa mgiełka gradientowa za treścią bohatera (ledwo widoczna, atmosferyczna)
- Obramowania sekcji: `1px solid #171717` (pełna ciemna linia) między głównymi sekcjami
- Brak zróżnicowania kolorystycznego tła — głębokość pochodzi wyłącznie z warstwowania cieni i kontrastu obramowań

## 7. Co Robić i Czego Nie Robić

### Co Robić
- Używaj Geist Sans z agresywnym ujemnym śledzeniem liter przy rozmiarach wyświetlania (-2,4px do -2,88px przy 48px)
- Używaj cienia-jako-obramowania (`0px 0px 0px 1px rgba(0,0,0,0.08)`) zamiast tradycyjnych obramowań CSS
- Włączaj `"liga"` na całym tekście Geist — ligatury są strukturalne, nie opcjonalne
- Używaj systemu trzech grubości: 400 (ciało), 500 (UI), 600 (nagłówki)
- Stosuj kolory akcentów przepływu pracy (Czerwony/Różowy/Niebieski) tylko w ich kontekście przepływu pracy
- Używaj wielowarstwowych stosów cieni dla kart (obramowanie + uniesienie + otaczające + wewnętrzne podświetlenie)
- Utrzymuj paletę kolorów achromatyczną — odcienie szarości od `#171717` do `#ffffff` są systemem
- Używaj `#171717` zamiast `#000000` dla podstawowego tekstu — mikro-ciepłota ma znaczenie

### Czego Nie Robić
- Nie używaj dodatniego śledzenia liter na Geist Sans — jest zawsze ujemne lub zerowe
- Nie używaj grubości 700 (pogrubienie) na tekście treści — 600 jest maksimum, używane tylko dla nagłówków
- Nie używaj tradycyjnego CSS `border` na kartach — używaj techniki cienia-obramowania
- Nie wprowadzaj ciepłych kolorów (pomarańczowych, żółtych, zielonych) do interfejsu użytkownika
- Nie stosuj kolorów akcentów przepływu pracy (Czerwień Wysyłki, Różowy Podglądu, Niebieski Dewelopmentu) dekoracyjnie
- Nie używaj ciężkich cieni (> 0,1 krycia) — system cieni jest na poziomie szeptu
- Nie zwiększaj odstępu liter tekstu treści — Geist jest zaprojektowany do ciasnego biegu
- Nie używaj promienia pigułki (9999px) na głównych przyciskach akcji — pigułki są tylko dla odznak/tagów
- Nie pomijaj wewnętrznego pierścienia `#fafafa` w cieniach kart — to blask, który sprawia, że system działa

## 8. Zachowanie Responsywne

### Punkty Przerwania
| Nazwa | Szerokość | Kluczowe Zmiany |
|-------|-----------|-----------------|
| Małe Urządzenie Mobilne | <400px | Ciasna pojedyncza kolumna, minimalne wypełnienie |
| Urządzenie Mobilne | 400–600px | Standardowe mobilne, układ stosowany |
| Mały Tablet | 600–768px | Siatki 2-kolumnowe zaczynają się |
| Tablet | 768–1024px | Pełne siatki kart, rozszerzone wypełnienie |
| Mały Desktop | 1024–1200px | Standardowy układ desktopowy |
| Desktop | 1200–1400px | Pełny układ, maksymalna szerokość treści |
| Duży Desktop | >1400px | Wyśrodkowany, hojne marginesy |

### Cele Dotykowe
- Przyciski używają wygodnego wypełnienia (8px–16px pionowo)
- Linki nawigacyjne przy 14px z odpowiednimi odstępami
- Odznaki pigułkowe mają 10px poziomego wypełnienia dla celów dotykowych
- Przełącznik menu mobilnego używa okrągłego przycisku z promieniem 50%

### Strategia Zwijania
- Bohater: wyświetlacz 48px → skaluje się w dół, zachowując ujemne śledzenie proporcjonalnie
- Nawigacja: poziome linki + wezwania do działania → menu hamburgerowe
- Karty funkcji: 3-kolumnowe → 2-kolumnowe → pojedyncza kolumna stosowana
- Zrzuty ekranu kodu: zachowują proporcje, mogą przewijać się poziomo
- Logo paska zaufania: siatka → poziome przewijanie
- Stopka: wielokolumnowa → stosowana pojedyncza kolumna
- Odstępy sekcji: 80px+ → 48px na urządzeniach mobilnych

### Zachowanie Obrazów
- Zrzuty ekranu pulpitu zachowują obróbkę obramowania we wszystkich rozmiarach
- Gradient bohatera mięknie/upraszcza się na urządzeniach mobilnych
- Zrzuty ekranu produktu używają responsywnych obrazów ze spójnym promieniem obramowania
- Sekcje pełnoszerokie zachowują obróbkę od krawędzi do krawędzi

## 9. Przewodnik po Promptach dla Agenta

### Szybka Referencyjna Paleta Kolorów
- Główne wezwanie do działania: Czerń Vercel (`#171717`)
- Tło: Czysta Biel (`#ffffff`)
- Tekst nagłówków: Czerń Vercel (`#171717`)
- Tekst treści: Szary 600 (`#4d4d4d`)
- Obramowanie (cień): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Link: Niebieski Linku (`#0072f5`)
- Pierścień fokusu: Niebieski Fokusu (`hsla(212, 100%, 48%, 1)`)

### Przykładowe Prompty Komponentów
- "Utwórz sekcję bohatera na białym tle. Nagłówek przy 48px Geist grubość 600, wysokość linii 1.00, odstęp liter -2.4px, kolor #171717. Podtytuł przy 20px Geist grubość 400, wysokość linii 1.80, kolor #4d4d4d. Ciemny przycisk wezwania do działania (#171717, promień 6px, wypełnienie 8px 16px) i przycisk ghost (biały, cień-obramowanie rgba(0,0,0,0.08) 0px 0px 0px 1px, promień 6px)."
- "Zaprojektuj kartę: białe tło, bez obramowania CSS. Użyj stosu cieni: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Promień 8px. Tytuł przy 24px Geist grubość 600, odstęp liter -0.96px. Treść przy 16px grubość 400, #4d4d4d."
- "Zbuduj odznakę pigułkową: tło #ebf5ff, tekst #0068d6, promień 9999px, wypełnienie 0px 10px, 12px Geist grubość 500."
- "Utwórz nawigację: biały przyklejony nagłówek. Geist 14px grubość 500 dla linków, tekst #171717. Ciemne wezwanie do działania pigułkowe 'Start Deploying' wyrównane do prawej. Cień-obramowanie na dole: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Zaprojektuj sekcję przepływu pracy pokazującą trzy etapy: Develop (kolor tekstu #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Każdy etap: etykieta uppercase 14px Geist Mono + tytuł 24px Geist grubość 600 + opis 16px grubość 400 w #4d4d4d."

### Przewodnik po Iteracji
1. Zawsze używaj cienia-jako-obramowania zamiast obramowania CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` jest fundamentem
2. Odstęp liter skaluje się z rozmiarem czcionki: -2,4px przy 48px, -1,28px przy 32px, -0,96px przy 24px, normal przy 14px
3. Tylko trzy grubości: 400 (czytanie), 500 (interakcja), 600 (ogłaszanie)
4. Kolor jest funkcjonalny, nigdy dekoracyjny — kolory przepływu pracy (Czerwony/Różowy/Niebieski) oznaczają tylko etapy potoku
5. Wewnętrzny pierścień `#fafafa` w cieniach kart to to, co nadaje kartom Vercel ich subtelny wewnętrzny blask
6. Geist Mono pisane wielkimi literami dla etykiet technicznych, Geist Sans do wszystkiego innego
