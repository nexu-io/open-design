# System Projektowania Inspirowany Notion

> Category: Produktywność i SaaS
> Kompleksowa przestrzeń robocza. Ciepły minimalizm, nagłówki z szeryfami, miękkie powierzchnie.

## 1. Motyw wizualny i atmosfera

Strona internetowa Notion ucieleśnia filozofię samego narzędzia: czyste płótno, które usuwa się z drogi. System projektowy opiera się na ciepłych barwach neutralnych zamiast zimnych szarości, tworząc wyraźnie przystępny minimalizm, który przypomina raczej dobrej jakości papier niż sterylne szkło. Płótno strony jest czysto białe (`#ffffff`), ale tekst nie jest czysto czarny -- to ciepła, niemal czarna barwa (`rgba(0,0,0,0.95)`), która niezauważalnie łagodzi doświadczenie czytania. Skala ciepłych szarości (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) niesie subtelne żółto-brązowe podtony, nadając interfejsowi namacalne, niemal analogowe ciepło.

Niestandardowy font NotionInter (zmodyfikowany Inter) jest kręgosłupem systemu. W rozmiarach wyświetlania (64px) stosuje agresywny ujemny odstęp międzyliterowy (-2.125px), tworząc nagłówki, które wydają się skompresowane i precyzyjne. Zakres grubości jest szerszy niż w typowych systemach: 400 dla tekstu podstawowego, 500 dla elementów UI, 600 dla półpogrubionych etykiet i 700 dla nagłówków wyświetlania. Funkcje OpenType `"lnum"` (cyfry nautyczne) i `"locl"` (formy zlokalizowane) są włączone dla większego tekstu, dodając wyrafinowania typograficznego, które wynagradza uważne czytanie.

To, co czyni język wizualny Notion wyjątkowym, to jego filozofia obramowań. Zamiast ciężkich obramowań czy cieni, Notion stosuje ultracienkie obramowania `1px solid rgba(0,0,0,0.1)` -- obramowania istniejące jako szepty, ledwo zauważalne linie podziału, które tworzą strukturę bez ciężaru. System cieni jest równie powściągliwy: wielowarstwowe stosy o skumulowanej nieprzezroczystości nigdy nieprzekraczającej 0.05, tworzące głębię, którą się raczej wyczuwa niż widzi.

**Kluczowe cechy:**
- NotionInter (zmodyfikowany Inter) z ujemnym odstępem międzyliterowym w rozmiarach wyświetlania (-2.125px przy 64px)
- Ciepła neutralna paleta: szarości niosą żółto-brązowe podtony (`#f6f5f4` ciepła biel, `#31302e` ciepła ciemność)
- Niemal czarny tekst przez `rgba(0,0,0,0.95)` -- nie czysta czerń, tworząca mikrociepło
- Ultracienkie obramowania: `1px solid rgba(0,0,0,0.1)` wszędzie -- podział o wadze szeptu
- Wielowarstwowe stosy cieni o nieprzezroczystości poniżej 0.05 dla ledwo obecnej głębi
- Notion Blue (`#0075de`) jako jedyny kolor akcentu dla CTA i elementów interaktywnych
- Plakietki w kształcie pigułki (promień 9999px) z zabarwionymi niebieskimi tłami dla wskaźników statusu
- Bazowa jednostka odstępu 8px z organiczną, niesztywną skalą

## 2. Paleta kolorów i role

### Podstawowe
- **Notion Black** (`rgba(0,0,0,0.95)` / `#000000f2`): Główny tekst, nagłówki, treść podstawowa. 95% nieprzezroczystości łagodzi czystą czerń bez utraty czytelności.
- **Pure White** (`#ffffff`): Tło strony, powierzchnie kart, tekst przycisku na niebieskim.
- **Notion Blue** (`#0075de`): Główne CTA, kolor linku, akcent interaktywny -- jedyny nasycony kolor w podstawowej obudowie UI.

### Drugorzędne marki
- **Deep Navy** (`#213183`): Drugorzędny kolor marki, używany oszczędnie do podkreślenia i ciemnych sekcji funkcji.
- **Active Blue** (`#005bab`): Stan aktywny/wciśnięty przycisku -- ciemniejszy wariant Notion Blue.

### Skala ciepłych barw neutralnych
- **Warm White** (`#f6f5f4`): Zabarwienie powierzchni tła, naprzemienność sekcji, subtelne wypełnienie karty. Żółty podton jest kluczowy.
- **Warm Dark** (`#31302e`): Tło ciemnej powierzchni, tekst ciemnej sekcji. Cieplejszy niż standardowe szarości.
- **Warm Gray 500** (`#615d59`): Tekst drugorzędny, opisy, wyciszone etykiety.
- **Warm Gray 300** (`#a39e98`): Tekst zastępczy, stany wyłączone, tekst podpisów.

### Semantyczne kolory akcentu
- **Teal** (`#2a9d99`): Stany powodzenia, pozytywne wskaźniki.
- **Green** (`#1aae39`): Potwierdzenie, plakietki ukończenia.
- **Orange** (`#dd5b00`): Stany ostrzeżenia, wskaźniki uwagi.
- **Pink** (`#ff64c8`): Akcent dekoracyjny, wyróżnienia funkcji.
- **Purple** (`#391c57`): Funkcje premium, głębokie akcenty.
- **Brown** (`#523410`): Akcent ziemisty, ciepłe sekcje funkcji.

### Interaktywne
- **Link Blue** (`#0075de`): Główny kolor linku z podkreśleniem przy najechaniu.
- **Link Light Blue** (`#62aef0`): Jaśniejszy wariant linku dla ciemnych teł.
- **Focus Blue** (`#097fe8`): Pierścień fokusa na elementach interaktywnych.
- **Badge Blue Bg** (`#f2f9ff`): Tło plakietki w kształcie pigułki, zabarwiona niebieska powierzchnia.
- **Badge Blue Text** (`#097fe8`): Tekst plakietki w kształcie pigułki, ciemniejszy niebieski dla czytelności.

### Cienie i głębia
- **Card Shadow** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Wielowarstwowe uniesienie karty.
- **Deep Shadow** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Pięciowarstwowe głębokie uniesienie dla okien modalnych i wyróżnionej treści.
- **Whisper Border** (`1px solid rgba(0,0,0,0.1)`): Standardowe obramowanie podziału -- karty, separatory, sekcje.

## 3. Reguły typografii

### Rodzina fontów
- **Główna**: `NotionInter`, z fontami zastępczymi: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Funkcje OpenType**: `"lnum"` (cyfry nautyczne) i `"locl"` (formy zlokalizowane) włączone dla tekstu wyświetlania i nagłówków.

### Hierarchia

| Rola | Font | Rozmiar | Grubość | Wysokość wiersza | Odstęp międzyliterowy | Uwagi |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NotionInter | 64px (4.00rem) | 700 | 1.00 (ciasna) | -2.125px | Maksymalna kompresja, nagłówki billboardowe |
| Display Secondary | NotionInter | 54px (3.38rem) | 700 | 1.04 (ciasna) | -1.875px | Drugorzędny hero, nagłówki funkcji |
| Section Heading | NotionInter | 48px (3.00rem) | 700 | 1.00 (ciasna) | -1.5px | Tytuły sekcji funkcji, z `"lnum"` |
| Sub-heading Large | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Nagłówki kart, podsekcje funkcji |
| Sub-heading | NotionInter | 26px (1.63rem) | 700 | 1.23 (ciasna) | -0.625px | Podtytuły sekcji, nagłówki treści |
| Card Title | NotionInter | 22px (1.38rem) | 700 | 1.27 (ciasna) | -0.25px | Karty funkcji, tytuły list |
| Body Large | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Wprowadzenia, opisy funkcji |
| Body | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Standardowy tekst do czytania |
| Body Medium | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Nawigacja, podkreślony tekst UI |
| Body Semibold | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Mocne etykiety, stany aktywne |
| Body Bold | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Nagłówki w rozmiarze tekstu podstawowego |
| Nav / Button | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Linki nawigacyjne, tekst przycisku |
| Caption | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Metadane, etykiety drugorzędne |
| Caption Light | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Podpisy treści, opisy |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Plakietki w kształcie pigułki, tagi, etykiety statusu |
| Micro Label | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Małe metadane, znaczniki czasu |

### Zasady
- **Kompresja w skali**: NotionInter w rozmiarach wyświetlania stosuje odstęp międzyliterowy -2.125px przy 64px, stopniowo łagodniejąc do -0.625px przy 26px i normalnego przy 16px. Kompresja tworzy gęstość w nagłówkach przy zachowaniu czytelności w rozmiarach tekstu podstawowego.
- **System czterech grubości**: 400 (tekst/czytanie), 500 (UI/interaktywne), 600 (podkreślenie/nawigacja), 700 (nagłówki/wyświetlanie). Szerszy zakres grubości w porównaniu z większością systemów pozwala na niuansową hierarchię.
- **Ciepłe skalowanie**: Wysokość wiersza zacieśnia się wraz ze wzrostem rozmiaru -- 1.50 w tekście podstawowym (16px), 1.23-1.27 w podtytułach, 1.00-1.04 w wyświetlaniu. Tworzy to gęstsze, bardziej oddziałujące nagłówki.
- **Mikrotraking plakietek**: Tekst plakietki 12px stosuje dodatni odstęp międzyliterowy (0.125px) -- jedyny dodatni traking w systemie, tworzący szerszy, bardziej czytelny mały tekst.

## 4. Stylizacje komponentów

### Przyciski

**Primary Blue**
- Tło: `#0075de` (Notion Blue)
- Tekst: `#ffffff`
- Wypełnienie: 8px 16px
- Promień: 4px (subtelny)
- Obramowanie: `1px solid transparent`
- Najechanie: tło ciemnieje do `#005bab`
- Aktywny: transformacja scale(0.9)
- Fokus: kontur fokusa `2px solid`, cień `var(--shadow-level-200)`
- Użycie: Główne CTA ("Get Notion free", "Try it")

**Secondary / Tertiary**
- Tło: `rgba(0,0,0,0.05)` (półprzezroczysta ciepła szarość)
- Tekst: `#000000` (niemal czarny)
- Wypełnienie: 8px 16px
- Promień: 4px
- Najechanie: zmiana koloru tekstu, scale(1.05)
- Aktywny: transformacja scale(0.9)
- Użycie: Działania drugorzędne, przesyłanie formularzy

**Ghost / Link Button**
- Tło: przezroczyste
- Tekst: `rgba(0,0,0,0.95)`
- Dekoracja: podkreślenie przy najechaniu
- Użycie: Działania trzeciorzędne, linki wbudowane

**Pill Badge Button**
- Tło: `#f2f9ff` (zabarwiony niebieski)
- Tekst: `#097fe8`
- Wypełnienie: 4px 8px
- Promień: 9999px (pełna pigułka)
- Font: 12px grubość 600
- Użycie: Plakietki statusu, etykiety funkcji, tagi "New"

### Karty i kontenery
- Tło: `#ffffff`
- Obramowanie: `1px solid rgba(0,0,0,0.1)` (obramowanie szeptu)
- Promień: 12px (karty standardowe), 16px (karty wyróżnione/hero)
- Cień: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Najechanie: subtelne wzmocnienie cienia
- Karty obrazkowe: promień górny 12px, obraz wypełnia górną połowę

### Pola wprowadzania i formularze
- Tło: `#ffffff`
- Tekst: `rgba(0,0,0,0.9)`
- Obramowanie: `1px solid #dddddd`
- Wypełnienie: 6px
- Promień: 4px
- Fokus: niebieski pierścień konturu
- Tekst zastępczy: ciepła szarość `#a39e98`

### Nawigacja
- Czysta pozioma nawigacja na białym, nieprzyklejona
- Logo marki wyrównane do lewej (ikona 33x34px + wordmark)
- Linki: NotionInter 15px grubość 500-600, niemal czarny tekst
- Najechanie: zmiana koloru na `var(--color-link-primary-text-hover)`
- CTA: niebieski przycisk w kształcie pigułki ("Get Notion free") wyrównany do prawej
- Mobilna: zwijanie menu hamburgerowego
- Rozwijane menu produktów z wielopoziomowymi skategoryzowanymi menu

### Obróbka obrazu
- Zrzuty ekranu produktu z obramowaniem `1px solid rgba(0,0,0,0.1)`
- Obrazy zaokrąglone u góry: promień `12px 12px 0px 0px`
- Zrzuty ekranu podglądu pulpitu/środowiska pracy dominują w sekcjach funkcji
- Ciepłe gradientowe tła za ilustracjami hero (dekoracyjne ilustracje postaci)

### Wyróżniające się komponenty

**Karty funkcji z ilustracjami**
- Duże ilustracyjne nagłówki (Wielka fala, zrzuty ekranu UI produktu)
- Karta z promieniem 12px z obramowaniem szeptu
- Tytuł 22px grubość 700, opis 16px grubość 400
- Wariant tła w ciepłej bieli (`#f6f5f4`) dla naprzemiennych sekcji

**Pasek zaufania / Siatka logo**
- Logo firm (sekcja zaufanych zespołów) w ich kolorach marki
- Przewijanie poziome lub układ siatki z liczbą zespołów
- Wyświetlanie metryki: wzorzec dużej liczby + opisu

**Karty metryk**
- Wyświetlanie dużej liczby (np. "$4,200 ROI")
- NotionInter 40px+ grubość 700 dla metryki
- Opis poniżej w tekście podstawowym w ciepłej szarości
- Kontener karty z obramowaniem szeptu

## 5. Zasady układu

### System odstępów
- Jednostka bazowa: 8px
- Skala: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Niesztywna organiczna skala z wartościami ułamkowymi (5.6px, 6.4px) do mikrokorekt

### Siatka i kontener
- Maksymalna szerokość treści: około 1200px
- Hero: wyśrodkowana pojedyncza kolumna z hojnym górnym wypełnieniem (80-120px)
- Sekcje funkcji: siatki 2-3 kolumnowe dla kart
- Tła sekcji w ciepłej bieli (`#f6f5f4`) na pełnej szerokości dla naprzemienności
- Zrzuty ekranu kodu/pulpitu jako zawarte z obramowaniem szeptu

### Filozofia białej przestrzeni
- **Hojny rytm pionowy**: 64-120px między głównymi sekcjami. Notion pozwala treści oddychać dzięki rozległemu pionowemu wypełnieniu.
- **Ciepła naprzemienność**: Białe sekcje przeplatają się z sekcjami w ciepłej bieli (`#f6f5f4`), tworząc łagodny rytm wizualny bez ostrych przerw kolorystycznych.
- **Gęstość treści przede wszystkim**: Bloki tekstu podstawowego są zwarte (wysokość wiersza 1.50), ale otoczone obfitym marginesem, tworząc wyspy czytelnej treści w morzu białej przestrzeni.

### Skala promienia obramowania
- Mikro (4px): Przyciski, pola wprowadzania, funkcjonalne elementy interaktywne
- Subtelny (5px): Linki, elementy listy, elementy menu
- Standardowy (8px): Małe karty, kontenery, elementy wbudowane
- Komfortowy (12px): Karty standardowe, kontenery funkcji, górne części obrazów
- Duży (16px): Karty hero, wyróżniona treść, bloki promocyjne
- Pełna pigułka (9999px): Plakietki, pigułki, wskaźniki statusu
- Okrąg (100%): Wskaźniki kart, awatary

## 6. Głębia i uniesienie

| Poziom | Obróbka | Użycie |
|-------|-----------|-----|
| Płaski (Level 0) | Brak cienia, brak obramowania | Tło strony, bloki tekstu |
| Szept (Level 1) | `1px solid rgba(0,0,0,0.1)` | Standardowe obramowania, kontury kart, separatory |
| Miękka karta (Level 2) | 4-warstwowy stos cieni (maks. nieprzezroczystość 0.04) | Karty treści, bloki funkcji |
| Głęboka karta (Level 3) | 5-warstwowy stos cieni (maks. nieprzezroczystość 0.05, rozmycie 52px) | Okna modalne, wyróżnione panele, elementy hero |
| Fokus (Dostępność) | Kontur `2px solid var(--focus-color)` | Fokus klawiatury na wszystkich elementach interaktywnych |

**Filozofia cienia**: System cieni Notion stosuje wiele warstw o niezwykle niskiej indywidualnej nieprzezroczystości (0.01 do 0.05), które kumulują się w miękkie, naturalnie wyglądające uniesienie. 4-warstwowy cień karty rozciąga się od rozmycia 1.04px do 18px, tworząc gradient głębi zamiast pojedynczego twardego cienia. 5-warstwowy głęboki cień rozciąga się do rozmycia 52px przy nieprzezroczystości 0.05, wytwarzając okluzję otoczenia, która przypomina naturalne światło, a nie głębię generowaną komputerowo. To warstwowe podejście sprawia, że elementy wydają się osadzone w stronie, a nie unoszące się nad nią.

### Dekoracyjna głębia
- Sekcja hero: dekoracyjne ilustracje postaci (zabawny styl ręcznie rysowany)
- Naprzemienność sekcji: przejścia tła z bieli do ciepłej bieli (`#f6f5f4`)
- Brak twardych obramowań sekcji -- separacja wynika ze zmian koloru tła i odstępów

## 7. Zachowanie responsywne

### Punkty graniczne
| Nazwa | Szerokość | Kluczowe zmiany |
|------|-------|-------------|
| Mobile Small | <400px | Ciasna pojedyncza kolumna, minimalne wypełnienie |
| Mobile | 400-600px | Standardowa mobilna, układ ułożony w stos |
| Tablet Small | 600-768px | Rozpoczynają się siatki 2-kolumnowe |
| Tablet | 768-1080px | Pełne siatki kart, rozszerzone wypełnienie |
| Desktop Small | 1080-1200px | Standardowy układ pulpitu |
| Desktop | 1200-1440px | Pełny układ, maksymalna szerokość treści |
| Large Desktop | >1440px | Wyśrodkowany, hojne marginesy |

### Cele dotykowe
- Przyciski używają komfortowego wypełnienia (8px-16px w pionie)
- Linki nawigacyjne przy 15px z odpowiednim odstępem
- Plakietki w kształcie pigułki mają 8px poziomego wypełnienia dla celów dotykowych
- Przełącznik menu mobilnego używa standardowego przycisku hamburgerowego

### Strategia zwijania
- Hero: wyświetlanie 64px -> skaluje do 40px -> 26px na mobilnym, zachowuje proporcjonalny odstęp międzyliterowy
- Nawigacja: poziome linki + niebieskie CTA -> menu hamburgerowe
- Karty funkcji: 3-kolumnowe -> 2-kolumnowe -> pojedyncza kolumna ułożona w stos
- Zrzuty ekranu produktu: zachowują proporcje z obrazami responsywnymi
- Logo paska zaufania: siatka -> przewijanie poziome na mobilnym
- Stopka: wielokolumnowa -> ułożona w stos pojedyncza kolumna
- Odstęp sekcji: 80px+ -> 48px na mobilnym

### Zachowanie obrazu
- Zrzuty ekranu środowiska pracy zachowują obramowanie szeptu we wszystkich rozmiarach
- Ilustracje hero skalują się proporcjonalnie
- Zrzuty ekranu produktu używają obrazów responsywnych ze spójnym promieniem obramowania
- Sekcje w ciepłej bieli na pełnej szerokości zachowują obróbkę od krawędzi do krawędzi

## 8. Dostępność i stany

### System fokusa
- Wszystkie elementy interaktywne otrzymują widoczne wskaźniki fokusa
- Kontur fokusa: `2px solid` z kolorem fokusa + cień poziom 200
- Nawigacja Tab obsługiwana we wszystkich komponentach interaktywnych
- Tekst o wysokim kontraście: niemal czarny na białym przekracza WCAG AAA (>14:1 stosunek)

### Stany interaktywne
- **Domyślny**: Standardowy wygląd z obramowaniami szeptu
- **Najechanie**: Zmiana koloru tekstu, scale(1.05) na przyciskach, podkreślenie linków
- **Aktywny/Wciśnięty**: transformacja scale(0.9), ciemniejszy wariant tła
- **Fokus**: Niebieski pierścień konturu ze wzmocnieniem cienia
- **Wyłączony**: Tekst w ciepłej szarości (`#a39e98`), zmniejszona nieprzezroczystość

### Kontrast kolorów
- Tekst podstawowy (rgba(0,0,0,0.95)) na białym: ~18:1 stosunek
- Tekst drugorzędny (#615d59) na białym: ~5.5:1 stosunek (WCAG AA)
- Niebieskie CTA (#0075de) na białym: ~4.6:1 stosunek (WCAG AA dla dużego tekstu)
- Tekst plakietki (#097fe8) na tle plakietki (#f2f9ff): ~4.5:1 stosunek (WCAG AA dla dużego tekstu)

## 9. Przewodnik podpowiedzi dla agenta

### Szybkie odniesienie do kolorów
- Główne CTA: Notion Blue (`#0075de`)
- Tło: Pure White (`#ffffff`)
- Tło alternatywne: Warm White (`#f6f5f4`)
- Tekst nagłówka: Niemal czarny (`rgba(0,0,0,0.95)`)
- Tekst podstawowy: Niemal czarny (`rgba(0,0,0,0.95)`)
- Tekst drugorzędny: Warm Gray 500 (`#615d59`)
- Tekst wyciszony: Warm Gray 300 (`#a39e98`)
- Obramowanie: `1px solid rgba(0,0,0,0.1)`
- Link: Notion Blue (`#0075de`)
- Pierścień fokusa: Focus Blue (`#097fe8`)

### Przykładowe podpowiedzi komponentów
- "Utwórz sekcję hero na białym tle. Nagłówek 64px NotionInter grubość 700, wysokość wiersza 1.00, odstęp międzyliterowy -2.125px, kolor rgba(0,0,0,0.95). Podtytuł 20px grubość 600, wysokość wiersza 1.40, kolor #615d59. Niebieski przycisk CTA (#0075de, promień 4px, wypełnienie 8px 16px, biały tekst) i przycisk ghost (przezroczyste tło, niemal czarny tekst, podkreślenie przy najechaniu)."
- "Zaprojektuj kartę: białe tło, obramowanie 1px solid rgba(0,0,0,0.1), promień 12px. Użyj stosu cieni: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Tytuł 22px NotionInter grubość 700, odstęp międzyliterowy -0.25px. Tekst podstawowy 16px grubość 400, kolor #615d59."
- "Zbuduj plakietkę w kształcie pigułki: tło #f2f9ff, tekst #097fe8, promień 9999px, wypełnienie 4px 8px, 12px NotionInter grubość 600, odstęp międzyliterowy 0.125px."
- "Utwórz nawigację: biały nagłówek. NotionInter 15px grubość 600 dla linków, niemal czarny tekst. Niebieskie CTA w kształcie pigułki 'Get Notion free' wyrównane do prawej (tło #0075de, biały tekst, promień 4px)."
- "Zaprojektuj naprzemienny układ sekcji: białe sekcje przeplatają się z sekcjami w ciepłej bieli (#f6f5f4). Każda sekcja ma 64-80px pionowego wypełnienia, max-width 1200px wyśrodkowane. Nagłówek sekcji 48px grubość 700, wysokość wiersza 1.00, odstęp międzyliterowy -1.5px."

### Przewodnik iteracji
1. Zawsze używaj ciepłych barw neutralnych -- szarości Notion mają żółto-brązowe podtony (#f6f5f4, #31302e, #615d59, #a39e98), nigdy niebiesko-szare
2. Odstęp międzyliterowy skaluje się z rozmiarem fontu: -2.125px przy 64px, -1.875px przy 54px, -0.625px przy 26px, normalny przy 16px
3. Cztery grubości: 400 (czytanie), 500 (interakcja), 600 (podkreślenie), 700 (ogłaszanie)
4. Obramowania to szepty: 1px solid rgba(0,0,0,0.1) -- nigdy cięższe
5. Cienie używają 4-5 warstw o indywidualnej nieprzezroczystości nigdy nieprzekraczającej 0.05
6. Tło sekcji w ciepłej bieli (#f6f5f4) jest niezbędne dla rytmu wizualnego
7. Plakietki w kształcie pigułki (9999px) dla statusu/tagów, promień 4px dla przycisków i pól wprowadzania
8. Notion Blue (#0075de) to jedyny nasycony kolor w podstawowym UI -- używaj go oszczędnie dla CTA i linków
