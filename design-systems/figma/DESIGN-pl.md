# System Projektowania Inspirowany Figmą

> Kategoria: Projektowanie i Twórczość
> Narzędzie do projektowania zespołowego. Żywe, wielobarwne — figlarnie, a zarazem profesjonalnie.

## 1. Motyw Wizualny i Atmosfera

Interfejs Figmy jest narzędziem projektowym, które zaprojektowało samo siebie — mistrzowska lekcja typograficznej precyzji, w której własny, zmienny krój pisma (figmaSans) moduluje między ekstremalnie cienkim (grubość 320) a pogrubionym (grubość 700), zatrzymując się na niespotykanych wartościach pośrednich (330, 340, 450, 480, 540), których większość systemów typograficznych nigdy nie eksploruje. Ta szczegółowa kontrola grubości nadaje każdemu elementowi tekstowemu precyzyjnie dobraną wagę wizualną, budując hierarchię przez mikroróżnice zamiast tępego narzędzia „regular kontra bold".

Strona przedstawia fascynującą dwoistość: chrome interfejsu jest ściśle czarno-biały (dosłownie tylko `#000000` i `#ffffff` wykrywane jako kolory), podczas gdy sekcja hero i prezentacje produktów eksplodują żywymi, wielobarwnymi gradientami — elektryczną zielenią, jaskrawą żółcią, głębokim fioletem i gorącym różem. To rozdzielenie oznacza, że sam system projektowania jest bezbarwny i traktuje kolorowe efekty produktu jak treść pierwszoplanową. Strona marketingowa Figmy to w istocie biała galeryjna ściana, na której eksponowane są kolorowe dzieła.

To, co wyróżnia Figmę poza zmiennym krojem pisma, to geometria kółek i pigułek. Przyciski stosują promień 50px (pigułka) lub 50% (idealne koło dla przycisków ikonowych), nadając interfejsowi organiczny, paletowy charakter narzędzia do projektowania. Przerywany wskaźnik fokusu (`dashed 2px`) to świadomy wybór projektowy nawiązujący do uchwytów zaznaczenia w edytorze Figmy — język UI strony odnosi się do języka UI produktu.

**Kluczowe cechy:**
- Własny zmienny krój pisma (figmaSans) z niespotykanie precyzyjnymi wartościami grubości: 320, 330, 340, 450, 480, 540, 700
- Ściśle czarno-biały chrome interfejsu — kolor pojawia się wyłącznie w treściach produktowych
- figmaMono dla wielkich liter w etykietach technicznych z szerokim rozstępem liter
- Geometria pigułki (50px) i koła (50%) w przyciskach
- Przerywane obrysy fokusu nawiązujące do uchwytów zaznaczenia w edytorze Figmy
- Żywe, wielobarwne gradienty hero (zielony, żółty, fioletowy, różowy)
- Funkcja OpenType `"kern"` włączona globalnie
- Ujemny rozstęp liter w całym interfejsie — nawet tekst podstawowy ma -0.14px do -0.26px

## 2. Paleta Kolorów i Ich Role

### Podstawowe
- **Czysta czerń** (`#000000`): Cały tekst, wszystkie pełne przyciski, wszystkie obramowania. Jedyny „kolor" interfejsu.
- **Czysta biel** (`#ffffff`): Wszystkie tła, białe przyciski, tekst na ciemnych powierzchniach. Druga połowa dychotomii.

*Uwaga: Strona marketingowa Figmy używa WYŁĄCZNIE tych dwóch kolorów dla warstwy interfejsu. Wszystkie żywe kolory pojawiają się jedynie w zrzutach ekranu produktu, gradientach hero i treściach osadzonych.*

### Powierzchnie i Tła
- **Czysta biel** (`#ffffff`): Podstawowe tło strony i powierzchnie kart.
- **Szklana czerń** (`rgba(0, 0, 0, 0.08)`): Delikatna ciemna nakładka dla drugorzędnych okrągłych przycisków i efektów szklanych.
- **Szklana biel** (`rgba(255, 255, 255, 0.16)`): Mrożona szklana nakładka dla przycisków na ciemnych lub kolorowych powierzchniach.

### System Gradientów
- **Gradient hero**: Żywy, wielostopniowy gradient z elektryczną zielenią, jaskrawą żółcią, głębokim fioletem i gorącym różem. Ten gradient jest wizualnym znakiem rozpoznawczym sekcji hero — reprezentuje kreatywne możliwości narzędzia.
- **Gradienty sekcji produktowych**: Poszczególne obszary produktu (Projektowanie, Tryb deweloperski, Prototypowanie) mogą stosować własne motywy kolorystyczne w swoich prezentacjach.

## 3. Zasady Typograficzne

### Rodzina Krojów
- **Podstawowy**: `figmaSans`, z zamiennikami: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Etykiety**: `figmaMono`, z zamiennikami: `figmaMono Fallback, SF Mono, menlo`

### Hierarchia

| Rola | Krój | Rozmiar | Grubość | Wysokość linii | Rozstęp liter | Uwagi |
|------|------|---------|---------|----------------|---------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (zwarte) | -1.72px | Maksymalny efekt, ekstremalne rozstrzelenie |
| Nagłówek sekcji | figmaSans | 64px (4rem) | 400 | 1.10 (zwarte) | -0.96px | Tytuły sekcji funkcji |
| Podtytuł | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Wyróżniony tekst sekcji |
| Podtytuł lekki | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Lekki tekst sekcji |
| Tytuł funkcji | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Pogrubione nagłówki kart |
| Tekst podstawowy duży | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px do -0.14px | Opisy, wprowadzenia |
| Tekst podstawowy / Przycisk | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px do normal | Standardowy tekst, nawigacja, przyciski |
| Tekst podstawowy lekki | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px do normal | Lekki tekst podstawowy |
| Etykieta mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (zwarte) | 0.54px | Etykiety sekcji pisane wielkimi literami |
| Mono małe | figmaMono | 12px (0.75rem) | 400 | 1.00 (zwarte) | 0.6px | Małe tagi pisane wielkimi literami |

### Zasady
- **Precyzja zmiennego kroju pisma**: figmaSans używa grubości, których większość systemów nigdy nie stosuje — 320, 330, 340, 450, 480, 540. Tworzy to hierarchię przez subtelne różnice grubości, a nie gwałtowne skoki. Różnica między 330 a 340 jest niemal nieuchwytna, lecz strukturalnie istotna.
- **Lekkość jako baza**: Większość tekstu podstawowego używa grubości 320–340 (lżejszej niż typowe 400 „regular"), tworząc eteryczne, przewiewne doświadczenie czytelnicze pasujące do estetyki narzędzia projektowego.
- **Kerning wszędzie**: Każdy element tekstowy aktywuje funkcję OpenType `"kern"` — kerning nie jest opcją, jest elementem struktury.
- **Ujemne rozstrzelenie jako domyślne**: Nawet tekst podstawowy używa rozstępu -0.1px do -0.26px, tworząc powszechnie zwarte teksty. Tekst display ściska się dalej do -0.96px i -1.72px.
- **Mono dla struktury**: figmaMono pisany wielkimi literami z dodatnim rozstępem liter (0.54px–0.6px) tworzy techniczne etykiety orientacyjne.

## 4. Style Komponentów

### Przyciski

**Czarna pełna pigułka**
- Tło: czysta czerń (`#000000`)
- Tekst: czysta biel (`#ffffff`)
- Promień: koło (50%) dla przycisków ikonowych
- Fokus: przerywany obrys 2px
- Maksymalne wyróżnienie

**Biała pigułka**
- Tło: czysta biel (`#ffffff`)
- Tekst: czysta czerń (`#000000`)
- Odstępy: 8px 18px 10px (asymetryczne pionowe)
- Promień: pigułka (50px)
- Fokus: przerywany obrys 2px
- Standardowe CTA na ciemnych lub kolorowych powierzchniach

**Szklana ciemna**
- Tło: `rgba(0, 0, 0, 0.08)` (delikatna ciemna nakładka)
- Tekst: czysta czerń
- Promień: koło (50%)
- Fokus: przerywany obrys 2px
- Drugorzędna akcja na jasnych powierzchniach

**Szklana jasna**
- Tło: `rgba(255, 255, 255, 0.16)` (mrożone szkło)
- Tekst: czysta biel
- Promień: koło (50%)
- Fokus: przerywany obrys 2px
- Drugorzędna akcja na ciemnych lub kolorowych powierzchniach

### Karty i Kontenery
- Tło: czysta biel
- Obramowanie: brak lub minimalne
- Promień: 6px (małe kontenery), 8px (obrazy, karty, okna dialogowe)
- Cień: subtelne do umiarkowanych efektów elewacji
- Zrzuty ekranu produktu jako zawartość kart

### Nawigacja
- Czysta, pozioma nawigacja na białym tle
- Logo: wordmark Figmy w kolorze czarnym
- Zakładki produktów: nawigacja zakładkowa w kształcie pigułki (50px)
- Linki: czarny tekst, dekoracja podkreślenia 1px
- CTA: czarny przycisk pigułka
- Najechanie kursorem: kolor tekstu przez zmienną CSS

### Charakterystyczne Komponenty

**Pasek zakładek produktu**
- Poziome zakładki w kształcie pigułki (promień 50px)
- Każda zakładka reprezentuje obszar produktu Figmy (Projektowanie, Tryb deweloperski, Prototypowanie itd.)
- Aktywna zakładka wyróżniona

**Sekcja z gradientem hero**
- Pełnoszerokościowe, żywe, wielobarwne tło gradientowe
- Biały tekst nakładkowy z nagłówkiem display 86px
- Zrzuty ekranu produktu unoszące się w gradiencie

**Przerywane wskaźniki fokusu**
- Wszystkie elementy interaktywne używają obrysu `dashed 2px` przy fokusie
- Nawiązuje do uchwytów zaznaczenia w edytorze Figmy
- Meta-projektowy wybór łączący stronę z produktem

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px
- Skala: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Siatka i Kontener
- Maksymalna szerokość kontenera: do 1920px
- Hero: pełnoszerokościowy gradient z wycentrowaną treścią
- Sekcje produktowe: naprzemiennie ułożone prezentacje
- Stopka: ciemna sekcja pełnej szerokości
- Responsywność od 559px do 1920px

### Filozofia Białej Przestrzeni
- **Rytm galerii**: Hojne odstępy pozwalają każdej sekcji produktowej oddychać jak osobna ekspozycja.
- **Sekcje kolorowe jako wizualny oddech**: Gradient hero i prezentacje produktów zapewniają chromatyczną ulgę między monochromatycznymi sekcjami interfejsu.

### Skala Promieni Narożników
- Minimalne (2px): Małe elementy linków
- Subtelne (6px): Małe kontenery, separatory
- Komfortowe (8px): Karty, obrazy, okna dialogowe
- Pigułka (50px): Przyciski zakładek, CTA
- Koło (50%): Przyciski ikonowe, okrągłe elementy

## 6. Głębia i Elewacja

| Poziom | Sposób | Zastosowanie |
|--------|--------|--------------|
| Płaski (Poziom 0) | Brak cienia | Tło strony, większość tekstów |
| Powierzchnia (Poziom 1) | Biała karta na gradiencie lub ciemnej sekcji | Karty, prezentacje produktów |
| Uniesiony (Poziom 2) | Subtelny cień | Pływające karty, stany hover |

**Filozofia cienia**: Figma używa cieni oszczędnie. Podstawowymi mechanizmami głębi są **kontrast tła** (biała treść na kolorowych lub ciemnych sekcjach) i inherentna wymiarowość samych zrzutów ekranu produktu.

## 7. Zalecenia i Przestrogi

### Zalecaj
- Używaj figmaSans z precyzyjnymi grubościami zmiennymi (320–540) — ta granularna kontrola grubości JEST projektem
- Utrzymuj ściśle czarno-biały interfejs — kolor pochodzi wyłącznie z treści produktowych
- Stosuj geometrię pigułki (50px) i koła (50%) dla wszystkich elementów interaktywnych
- Stosuj przerywane obrysy fokusu 2px — charakterystyczny wzorzec dostępności
- Włączaj funkcję `"kern"` dla wszystkich tekstów
- Używaj figmaMono pisanego wielkimi literami z dodatnim rozstępem liter dla etykiet
- Stosuj ujemny rozstęp liter w całym interfejsie (-0.1px do -1.72px)

### Unikaj
- Nie dodawaj kolorów interfejsu — monochromatyczna paleta jest absolutna
- Nie używaj standardowych grubości krojów pisma (400, 500, 600, 700) — stosuj unikalne wartości zmiennego kroju pisma (320, 330, 340, 450, 480, 540)
- Nie używaj ostrych narożników w przyciskach — wyłącznie geometria pigułki i koła
- Nie używaj pełnych obrysów fokusu — przerywany jest charakterystyczny
- Nie zwiększaj grubości tekstu podstawowego powyżej 450 — estetyka lekkości jest kluczowa
- Nie stosuj dodatniego rozstępu liter w tekście podstawowym — zawsze jest ujemny

## 8. Zachowanie Responsywne

### Punkty Graniczne
| Nazwa | Szerokość | Główne zmiany |
|-------|-----------|---------------|
| Małe mobile | <560px | Zwarta struktura, układanie pionowe |
| Tablet | 560–768px | Drobne korekty |
| Małe desktop | 768–960px | Układy 2-kolumnowe |
| Desktop | 960–1280px | Standardowy układ |
| Duże desktop | 1280–1440px | Rozszerzony |
| Ultra-szeroki | 1440–1920px | Maksymalna szerokość |

### Strategia Zwijania
- Tekst hero: 86px → 64px → 48px
- Zakładki produktów: poziome przewijanie na mobile
- Sekcje funkcji: układanie w jedną kolumnę
- Stopka: wielokolumnowa → układanie pionowe

## 9. Przewodnik po Promptach dla Agenta

### Szybka Referencja Kolorów
- Wszystko: „czysta czerń (#000000)" i „czysta biel (#ffffff)"
- Szklana ciemna: „rgba(0, 0, 0, 0.08)"
- Szklana jasna: „rgba(255, 255, 255, 0.16)"

### Przykładowe Prompty Komponentów
- „Utwórz hero na żywym, wielobarwnym gradiencie (zielony, żółty, fioletowy, różowy). Nagłówek 86px figmaSans grubość 400, line-height 1.0, letter-spacing -1.72px. Biały tekst. Biały przycisk pigułka CTA (promień 50px, odstępy 8px 18px)."
- „Zaprojektuj pasek zakładek produktu z przyciskami w kształcie pigułki (promień 50px). Aktywna: czarne tło, biały tekst. Nieaktywna: przezroczyste, czarny tekst. figmaSans 20px grubość 480."
- „Zbuduj etykietę sekcji: figmaMono 18px, wielkie litery, letter-spacing 0.54px, czarny tekst. Kerning włączony."
- „Utwórz tekst podstawowy 20px figmaSans grubość 330, line-height 1.40, letter-spacing -0.14px. Czysta czerń na białym tle."

### Przewodnik Iteracji
1. Używaj precyzyjnych wartości grubości zmiennego kroju pisma: 320, 330, 340, 450, 480, 540, 700
2. Interfejs jest zawsze czarno-biały — nigdy nie dodawaj kolorów do chrome
3. Przerywane obrysy fokusu, nie pełne
4. Rozstęp liter jest zawsze ujemny w tekście podstawowym, zawsze dodatni w etykietach mono
5. Pigułka (50px) dla przycisków i zakładek, koło (50%) dla przycisków ikonowych
