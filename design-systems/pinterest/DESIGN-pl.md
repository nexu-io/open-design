# System Projektowania Inspirowany Pinterestem

> Category: Media & Consumer
> Wizualne odkrywanie. Czerwony akcent, siatka masonry, obraz na pierwszym planie.

## 1. Motyw Wizualny i Atmosfera

Witryna Pinteresta to ciepłe, inspirujące płótno, które traktuje wizualne odkrywanie jak magazyn lifestyle'owy. Projekt opiera się na miękkim, lekko ciepłym białym tle, z Pinterest Red (`#e60023`) jako jedynym, wyrazistym akcentem marki. W przeciwieństwie do chłodnych błękitów większości platform technologicznych, skala neutralna Pinteresta ma wyraźnie ciepły podton — szarości przechylają się ku oliwce/piaskowi (`#91918c`, `#62625b`, `#e5e5e0`), a nie ku chłodnej stali, tworząc przytulną, rzemieślniczą atmosferę sprzyjającą przeglądaniu.

Typografia używa Pin Sans — niestandardowego, zastrzeżonego kroju pisma z szerokim stosem awaryjnym, obejmującym japońskie czcionki, co odzwierciedla globalny zasięg Pinteresta. W skali wyświetlania (70px, grubość 600) Pin Sans tworzy duże, zachęcające nagłówki. W mniejszych rozmiarach system jest kompaktowy: przyciski 12px, podpisy 12–14px. System nazewnictwa zmiennych CSS (`--comp-*`, `--sema-*`, `--base-*`) ujawnia zaawansowaną, trójpoziomową architekturę tokenów projektowych: tokeny na poziomie komponentu, semantycznym i bazowym.

To, co wyróżnia Pinterest, to hojny system zaokrągleń (12px–40px plus 50% dla kół) oraz ciepło zabarwione tła przycisków. Przycisk drugorzędny (`#e5e5e0`) ma wyraźnie ciepły, piaskowobeżowy ton, a nie zimną szarość. Główny czerwony przycisk używa promienia 16px — zaokrąglony, ale nie w kształcie pigułki. W połączeniu z ciepłymi tłami odznak (`hsla(60,20%,98%,.5)` — subtelna żółtawa poświata) i układami zdominowanymi przez fotografię efektem jest projekt, który wygląda rzemieślniczo i osobiście, a nie korporacyjnie i sterylnie.

**Kluczowe Cechy:**
- Ciepłe białe płótno z neutralnymi tonami oliwkowymi/piaskowymi — przytulne, nie kliniczne
- Pinterest Red (`#e60023`) jako jedyny wyrazisty akcent — nigdy subtelny, zawsze pewny siebie
- Niestandardowa czcionka Pin Sans z globalnym stosem awaryjnym (w tym CJK)
- Trójpoziomowa architektura tokenów: `--comp-*` / `--sema-*` / `--base-*`
- Ciepłe powierzchnie drugorzędne: piaskowa szarość (`#e5e5e0`), ciepła odznaka (`hsla(60,20%,98%,.5)`)
- Hojne zaokrąglenia: 16px standardowe, do 40px dla dużych kontenerów
- Treść na pierwszym planie — piny/obrazy są głównym elementem wizualnym
- Ciemnofioletowy tekst (`#211922`) — ciepły, z nutą śliwki

## 2. Paleta Kolorów i Role

### Główna Marka
- **Pinterest Red** (`#e60023`): Główne CTA, akcent marki — odważna, pewna siebie czerwień
- **Green 700** (`#103c25`): `--base-color-green-700`, akcent sukcesu/natury
- **Green 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, wciśnięta zieleń

### Tekst
- **Śliwkowa Czerń** (`#211922`): Tekst główny — ciepła, prawie czarna z podtonem śliwki
- **Czerń** (`#000000`): Tekst drugorzędny, tekst przycisków
- **Oliwkowa Szarość** (`#62625b`): Opisy drugorzędne, wyciszony tekst
- **Ciepłe Srebro** (`#91918c`): `--comp-button-color-text-transparent-disabled`, tekst wyłączony, obramowania pól
- **Biel** (`#ffffff`): Tekst na ciemnych/kolorowych powierzchniach

### Interaktywne
- **Niebieski Fokus** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, pierścienie fokusu
- **Fiolet Wydajności** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, funkcje wydajności
- **Fiolet Rekomendacji** (`#7e238b`): `--sema-color-hover-text-recommendation`, rekomendacja AI
- **Niebieski Linków** (`#2b48d4`): Kolor tekstu linków
- **Niebieski Facebooka** (`#0866ff`): `--facebook-background-color`, logowanie społecznościowe
- **Wciśnięty Niebieski** (`#617bff`): `--base-color-pressed-blue-200`, stan wciśnięty

### Powierzchnia i Obramowanie
- **Piaskowa Szarość** (`#e5e5e0`): Tło przycisku drugorzędnego — ciepłe, rzemieślnicze
- **Ciepłe Światło** (`#e0e0d9`): Tła okrągłych przycisków, odznaki
- **Ciepły Napar** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, subtelne ciepłe tło odznaki
- **Mgła** (`#f6f6f3`): Jasna powierzchnia (przy 50% kryciu)
- **Obramowanie Wyłączone** (`#c8c8c1`): `--sema-color-border-disabled`, wyłączone obramowania
- **Szarość Hover** (`#bcbcb3`): `--base-color-hover-grayscale-150`, obramowanie hover
- **Ciemna Powierzchnia** (`#33332e`): Tła ciemnych sekcji

### Semantyczne
- **Czerwień Błędu** (`#9e0a0a`): Stany błędów pól wyboru/formularzy

## 3. Zasady Typografii

### Rodzina Czcionek
- **Główna**: `Pin Sans`, zamienniki: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość Linii | Odstęp Liter | Uwagi |
|------|----------|---------|---------|----------------|--------------|-------|
| Nagłówek Główny | Pin Sans | 70px (4.38rem) | 600 | normalny | normalny | Maksymalny impact |
| Nagłówek Sekcji | Pin Sans | 28px (1.75rem) | 700 | normalny | -1.2px | Ujemne śledzenie |
| Treść | Pin Sans | 16px (1.00rem) | 400 | 1.40 | normalny | Standardowy odczyt |
| Pogrubiony Podpis | Pin Sans | 14px (0.88rem) | 700 | normalny | normalny | Wyraziste metadane |
| Podpis | Pin Sans | 12px (0.75rem) | 400–500 | 1.50 | normalny | Mały tekst, tagi |
| Przycisk | Pin Sans | 12px (0.75rem) | 400 | normalny | normalny | Etykiety przycisków |

### Zasady
- **Kompaktowa skala typograficzna**: Zakres to 12px–70px z dramatycznym skokiem — większość tekstu funkcjonalnego to 12–16px, tworząc gęstą, aplikacyjną hierarchię informacji.
- **Ciepły rozkład grubości**: 600–700 dla nagłówków, 400–500 dla treści. Bez ultralekkich grubości — typografia zawsze wydaje się solidna.
- **Ujemne śledzenie w nagłówkach**: -1.2px w nagłówkach 28px tworzy przytulne, bliskie tytuły sekcji.
- **Pojedyncza rodzina czcionek**: Pin Sans obsługuje wszystko — nie wykryto drugorzędnej czcionki wyświetlania ani o stałej szerokości.

## 4. Stylizacja Komponentów

### Przyciski

**Główny Czerwony**
- Tło: `#e60023` (Pinterest Red)
- Tekst: `#000000` (czarny — niezwykły wybór dla kontrastu na czerwonym)
- Padding: 6px 14px
- Promień: 16px (hojnie zaokrąglony, nie w kształcie pigułki)
- Obramowanie: `2px solid rgba(255, 255, 255, 0)` (przezroczysty)
- Fokus: semantyczne obramowanie + kontur przez zmienne CSS

**Drugorzędny Piaskowy**
- Tło: `#e5e5e0` (ciepła piaskowa szarość)
- Tekst: `#000000`
- Padding: 6px 14px
- Promień: 16px
- Fokus: ten sam semantyczny system obramowania

**Okrągła Akcja**
- Tło: `#e0e0d9` (ciepłe światło)
- Tekst: `#211922` (śliwkowa czerń)
- Promień: 50% (koło)
- Zastosowanie: Akcje pinów, elementy sterowania nawigacją

**Duch / Przezroczysty**
- Tło: przezroczysty
- Tekst: `#000000`
- Brak obramowania
- Zastosowanie: Trzeciorzędne akcje

### Karty i Kontenery
- Karty pinów na pierwszym planie fotografii z hojnym promieniem (12px–20px)
- Brak tradycyjnego box-shadow na większości kart
- Białe lub ciepłe mgłowe tła
- Białe grube obramowanie 8px na niektórych kontenerach obrazów

### Pola Wejściowe
- Pole e-mail: białe tło, obramowanie `1px solid #91918c`, promień 16px, padding 11px 15px
- Fokus: semantyczny system obramowania + konturu przez zmienne CSS

### Nawigacja
- Czysty nagłówek na białym lub ciepłym tle
- Logo Pinteresta + pasek wyszukiwania wyśrodkowany
- Pin Sans 16px dla linków nawigacyjnych
- Akcenty Pinterest Red dla aktywnych stanów

### Obróbka Obrazów
- Siatka masonry w stylu pinów (charakterystyczny układ Pinteresta)
- Zaokrąglone rogi: 12px–20px na obrazach
- Fotografia jako główna treść — każdy pin to obraz
- Grube białe obramowania (8px) na wyróżnionych kontenerach obrazów

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px
- Skala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Duże skoki: 32px → 80px → 100px dla odstępów sekcji

### Siatka i Kontener
- Siatka masonry dla treści pinów (charakterystyczny układ)
- Wyśrodkowane sekcje treści z hojną maksymalną szerokością
- Pełnoszerokie ciemne stopka
- Pasek wyszukiwania jako główny element nawigacji

### Filozofia Białej Przestrzeni
- **Gęstość inspiracji**: Siatka masonry pakuje piny ciasno — gęstość treści JEST propozycją wartości. Biała przestrzeń istnieje między sekcjami, nie wewnątrz siatki.
- **Oddech powyżej, gęstość poniżej**: Sekcje hero/funkcje mają hojny padding; siatka pinów jest kompaktowa i immersywna.

### Skala Zaokrągleń
- Standardowe (12px): Małe karty, linki
- Przycisk (16px): Przyciski, pola wejściowe, średnie karty
- Komfortowe (20px): Karty funkcji
- Duże (28px): Duże kontenery
- Sekcja (32px): Elementy zakładek, duże panele
- Hero (40px): Kontenery hero, duże bloki funkcji
- Koło (50%): Przyciski akcji, wskaźniki zakładek

## 6. Głębokość i Elewacja

| Poziom | Leczenie | Zastosowanie |
|--------|----------|--------------|
| Płaski (Poziom 0) | Brak cienia | Domyślny — piny opierają się na treści, nie na cieniu |
| Subtelny (Poziom 1) | Minimalny cień (z tokenów) | Podwyższone nakładki, rozwijane menu |
| Fokus (Dostępność) | Pierścień `--sema-color-border-focus-outer-default` | Stany fokusu |

**Filozofia Cieni**: Pinterest używa minimalnych cieni. Siatka masonry opiera się na treści (fotografii) do tworzenia zainteresowania wizualnego, a nie na efektach elewacji. Głębokość pochodzi z ciepła kolorów powierzchni i hojnego zaokrąglenia kontenerów.

## 7. Co Robić i Czego Unikać

### Robić
- Używaj ciepłych neutralów (`#e5e5e0`, `#e0e0d9`, `#91918c`) — ciepły oliwkowo/piaskowy ton to tożsamość marki
- Stosuj Pinterest Red (`#e60023`) tylko dla głównych CTA — jest odważny i wyjątkowy
- Używaj wyłącznie Pin Sans — jedna czcionka do wszystkiego
- Stosuj hojne zaokrąglenia: 16px dla przycisków/pól, 20px+ dla kart
- Utrzymuj gęstą siatkę masonry — gęstość treści to wartość
- Używaj ciepłych teł odznak (`hsla(60,20%,98%,.5)`) dla subtelnych ciepłych przemyceń
- Używaj `#211922` (śliwkowej czerni) dla tekstu głównego — jest cieplejsza niż czysta czerń

### Unikać
- Nie używaj chłodnych szarości neutralnych — zawsze ciepłe/oliwkowe tony
- Nie używaj czystej czerni (`#000000`) jako tekstu głównego — używaj śliwkowej czerni (`#211922`)
- Nie używaj przycisków w kształcie pigułki — promień 16px jest zaokrąglony, ale nie w kształcie pigułki
- Nie dodawaj ciężkich cieni — Pinterest jest z założenia płaski, głębokość pochodzi z treści
- Nie używaj małego promienia zaokrąglenia (<12px) na kartach — hojne zaokrąglenie jest podstawą
- Nie wprowadzaj dodatkowych kolorów marki — czerwień + ciepłe neutralne to kompletna paleta
- Nie używaj cienkich grubości czcionek — Pin Sans minimum 400

## 8. Responsywne Zachowanie

### Punkty Przerwania
| Nazwa | Szerokość | Kluczowe Zmiany |
|-------|-----------|-----------------|
| Mobilny | <576px | Jedna kolumna, kompaktowy układ |
| Duży Mobilny | 576–768px | Siatka pinów 2-kolumnowa |
| Tablet | 768–890px | Rozszerzona siatka |
| Mały Desktop | 890–1312px | Standardowa siatka masonry |
| Desktop | 1312–1440px | Pełny układ |
| Duży Desktop | 1440–1680px | Rozszerzone kolumny siatki |
| Ultraszeroki | >1680px | Maksymalna gęstość siatki |

### Strategia Zwijania
- Siatka pinów: 5+ kolumn → 3 → 2 → 1
- Nawigacja: pasek wyszukiwania + ikony → uproszczona nawigacja mobilna
- Sekcje funkcji: bok do boku → ułożone
- Hero: 70px → skaluje się proporcjonalnie
- Stopka: ciemna wielokolumnowa → ułożona

## 9. Przewodnik Promptów Agenta

### Szybka Referenca Kolorów
- Marka: Pinterest Red (`#e60023`)
- Tło: Biały (`#ffffff`)
- Tekst: Śliwkowa Czerń (`#211922`)
- Tekst drugorzędny: Oliwkowa Szarość (`#62625b`)
- Powierzchnia przycisku: Piaskowa Szarość (`#e5e5e0`)
- Obramowanie: Ciepłe Srebro (`#91918c`)
- Fokus: Niebieski Fokus (`#435ee5`)

### Przykładowe Prompty Komponentów
- "Stwórz hero: białe tło. Nagłówek 70px Pin Sans grubość 600, śliwkowa czerń (#211922). Czerwony przycisk CTA (#e60023, promień 16px, padding 6px 14px). Drugorzędny piaskowy przycisk (#e5e5e0, promień 16px)."
- "Zaprojektuj kartę pinu: białe tło, promień 16px, brak cienia. Fotografia wypełnia górę, opis 16px Pin Sans grubość 400 poniżej w #62625b."
- "Zbuduj okrągły przycisk akcji: tło #e0e0d9, promień 50%, ikona #211922."
- "Stwórz pole wejściowe: białe tło, 1px solid #91918c, promień 16px, padding 11px 15px. Fokus: niebieski kontur przez tokeny semantyczne."
- "Zaprojektuj ciemną stopkę: tło #33332e. Logo Pinteresta w bieli. Linki 12px Pin Sans w #91918c."

### Przewodnik Iteracji
1. Ciepłe neutralne wszędzie — oliwkowe/piaskowe szarości, nigdy chłodna stal
2. Pinterest Red tylko dla CTA — odważny i wyjątkowy
3. Promień 16px na przyciskach/polach, 20px+ na kartach — hojny, ale nie w kształcie pigułki
4. Pin Sans to jedyna czcionka — kompaktowy 12px dla UI, 70px dla wyświetlania
5. Fotografia niesie projekt — UI pozostaje ciepłe i minimalne
6. Śliwkowa czerń (#211922) dla tekstu — cieplejsza niż czysta czerń
