# System Projektowania Inspirowany Stripe

> Category: Fintech i Krypto
> Infrastruktura płatności. Charakterystyczne fioletowe gradienty, elegancja weight-300.

## 1. Motyw Wizualny i Atmosfera

Strona internetowa Stripe jest złotym standardem projektowania fintech — system, który potrafi być jednocześnie techniczny i luksusowy, precyzyjny i ciepły. Strona otwiera się na czystym białym płótnie (`#ffffff`) z ciemno-granatowymi nagłówkami (`#061b31`) i charakterystycznym fioletowym kolorem (`#533afd`), który pełni funkcję zarówno kotwicy marki, jak i interaktywnego akcentu. Nie jest to zimny, kliniczny fiolet oprogramowania dla przedsiębiorstw; to bogaty, nasycony fiolet, który sprawia wrażenie pewnego siebie i premium. Ogólne wrażenie to instytucja finansowa przeprojektowana przez światowej klasy odlewnię czcionek.

Niestandardowy krój `sohne-var` to zmienna czcionka definiująca tożsamość wizualną Stripe. Każdy element tekstowy włącza zestaw stylistyczny OpenType `"ss01"`, który modyfikuje kształty znaków, nadając im wyraźnie geometryczny, nowoczesny charakter. Przy rozmiarach displayowych (48px–56px), sohne-var używa grubości 300 — niezwykle lekkiej grubości dla nagłówków, która tworzy eteryczny, wręcz szeptany autorytet. Jest to przeciwieństwo konwencji "pogrubionego nagłówka bohatera"; nagłówki Stripe nie potrzebują krzyczeć. Ujemny odstęp między literami (-1,4px przy 56px, -0,96px przy 48px) zagęszcza tekst w gęste, inżynieryjne bloki. Przy mniejszych rozmiarach system używa grubości 300 z proporcjonalnie zredukowanym kerningiem oraz cyframi tabelarycznymi za pomocą `"tnum"` do wyświetlania danych finansowych.

To, co naprawdę wyróżnia Stripe, to system cieni. Zamiast płaskiego lub jednowarstwowego podejścia większości stron, Stripe używa wielowarstwowych cieni z niebieskim odcieniem: charakterystyczne `rgba(50,50,93,0.25)` w połączeniu z `rgba(0,0,0,0.1)` tworzy cienie o chłodnej, niemal atmosferycznej głębi — jakby elementy unosiły się na zmierzchowym niebie. Niebieskoszary odcień koloru podstawowego cienia (50,50,93) bezpośrednio nawiązuje do granatowo-fioletowej palety marki, sprawiając, że nawet głębia uniesienia wydaje się zgodna z identyfikacją wizualną.

**Kluczowe Cechy:**
- sohne-var z OpenType `"ss01"` na całym tekście — niestandardowy zestaw stylistyczny definiujący kształty liter marki
- Grubość 300 jako charakterystyczna grubość nagłówków — lekka, pewna siebie, wbrew konwencji
- Ujemny odstęp między literami przy rozmiarach displayowych (-1,4px przy 56px, stopniowe rozluźnienie w dół)
- Wielowarstwowe cienie z niebieskim odcieniem używające `rgba(50,50,93,0.25)` — uniesienie, które czuć jako kolor marki
- Ciemno-granatowe (`#061b31`) nagłówki zamiast czarnych — ciepłe, premium, klasy finansowej
- Zachowawcze zaokrąglenie narożników (4px–8px) — nic w kształcie pigułki, nic surowego
- Akcenty rubinowy (`#ea2261`) i magenta (`#f96bee`) dla gradientów i elementów dekoracyjnych
- `SourceCodePro` jako towarzyszący krój monospacingowy dla kodu i etykiet technicznych

## 2. Paleta Kolorów i Role

### Podstawowe
- **Stripe Purple** (`#533afd`): Podstawowy kolor marki, tła CTA, tekst linków, interaktywne wyróżnienia. Nasycony niebieskofioletowy, który zakotwicza cały system.
- **Deep Navy** (`#061b31`): `--hds-color-heading-solid`. Podstawowy kolor nagłówków. Nie czarny, nie szary — bardzo ciemny niebieski, który dodaje ciepła i głębi tekstowi.
- **Pure White** (`#ffffff`): Tło strony, powierzchnie kart, tekst przycisków na ciemnych tłach.

### Marka i Ciemne
- **Brand Dark** (`#1c1e54`): `--hds-color-util-brand-900`. Głęboki indygo dla ciemnych sekcji, tła stopki i intensywnych momentów marki.
- **Dark Navy** (`#0d253d`): `--hds-color-core-neutral-975`. Najciemniejszy neutralny — prawie czarny z niebieskim podtonem dla maksymalnej głębi bez surowości.

### Kolory Akcentowe
- **Ruby** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Ciepły różowo-czerwony dla ikon, alertów i elementów akcentowych.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Żywy różowofioletowy dla gradientów i dekoracyjnych wyróżnień.
- **Magenta Light** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Zabarwiona powierzchnia dla kart i odznak w tonacji magenty.

### Interaktywne
- **Primary Purple** (`#533afd`): Podstawowy kolor linków, stany aktywne, zaznaczone elementy.
- **Purple Hover** (`#4434d4`): Ciemniejszy fiolet dla stanów hover na elementach podstawowych.
- **Purple Deep** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Ciemny fiolet dla stanów hover ikon.
- **Purple Light** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Miękka lawenda dla stonowanych teł hover.
- **Purple Mid** (`#665efd`): `--hds-color-input-selector-text-range`. Kolor suwaka zakresu i wyróżnienia pola input.

### Skala Neutralna
- **Heading** (`#061b31`): Podstawowe nagłówki, tekst nawigacji, wyraźne etykiety.
- **Label** (`#273951`): `--hds-color-input-text-label`. Etykiety formularzy, drugorzędne nagłówki.
- **Body** (`#64748d`): Tekst drugorzędny, opisy, podpisy.
- **Success Green** (`#15be53`): Odznaki statusu, wskaźniki sukcesu (z przezroczystością 0,2–0,4 dla teł/obramowań).
- **Success Text** (`#108c3d`): Kolor tekstu odznaki sukcesu.
- **Lemon** (`#9b6829`): `--hds-color-core-lemon-500`. Akcent ostrzeżenia i wyróżnienia.

### Powierzchnie i Obramowania
- **Border Default** (`#e5edf5`): Standardowy kolor obramowania dla kart, separatorów i kontenerów.
- **Border Purple** (`#b9b9f9`): Obramowania stanów aktywnych/zaznaczonych na przyciskach i polach input.
- **Border Soft Purple** (`#d6d9fc`): Subtelne obramowania z fioletowym odcieniem dla elementów drugorzędnych.
- **Border Magenta** (`#ffd7ef`): Różowe obramowania dla elementów w tonacji magenty.
- **Border Dashed** (`#362baa`): Przerywane obramowania dla stref upuszczania i elementów zastępczych.

### Kolory Cieni
- **Shadow Blue** (`rgba(50,50,93,0.25)`): Charakterystyczny — podstawowy kolor cienia z niebieskim odcieniem.
- **Shadow Dark Blue** (`rgba(3,3,39,0.25)`): Głębszy niebieski cień dla uniesionych elementów.
- **Shadow Black** (`rgba(0,0,0,0.1)`): Drugorzędna warstwa cienia wzmacniająca głębię.
- **Shadow Ambient** (`rgba(23,23,23,0.08)`): Miękki cień otoczenia dla subtelnego uniesienia.
- **Shadow Soft** (`rgba(23,23,23,0.06)`): Minimalny cień otoczenia dla lekkiego efektu uniesienia.

## 3. Reguły Typografii

### Rodzina Czcionek
- **Podstawowa**: `sohne-var`, z fallbackiem: `SF Pro Display`
- **Monospacingowa**: `SourceCodePro`, z fallbackiem: `SFMono-Regular`
- **Funkcje OpenType**: `"ss01"` włączone globalnie na całym tekście sohne-var; `"tnum"` dla cyfr tabelarycznych w danych finansowych i podpisach.

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość wiersza | Odstęp liter | Funkcje | Uwagi |
|------|------|------|--------|-------------|----------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (ciasno) | -1.4px | ss01 | Maksymalny rozmiar, autorytet szeptu |
| Display Large | sohne-var | 48px (3.00rem) | 300 | 1.15 (ciasno) | -0.96px | ss01 | Drugorzędne nagłówki bohaterów |
| Section Heading | sohne-var | 32px (2.00rem) | 300 | 1.10 (ciasno) | -0.64px | ss01 | Tytuły sekcji funkcji |
| Sub-heading Large | sohne-var | 26px (1.63rem) | 300 | 1.12 (ciasno) | -0.26px | ss01 | Nagłówki kart, podsekcje |
| Sub-heading | sohne-var | 22px (1.38rem) | 300 | 1.10 (ciasno) | -0.22px | ss01 | Mniejsze nagłówki sekcji |
| Body Large | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Opisy funkcji, tekst wprowadzający |
| Body | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Standardowy tekst do czytania |
| Button | sohne-var | 16px (1.00rem) | 400 | 1.00 (ciasno) | normal | ss01 | Tekst przycisku podstawowego |
| Button Small | sohne-var | 14px (0.88rem) | 400 | 1.00 (ciasno) | normal | ss01 | Przyciski drugorzędne/kompaktowe |
| Link | sohne-var | 14px (0.88rem) | 400 | 1.00 (ciasno) | normal | ss01 | Linki nawigacyjne |
| Caption | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Małe etykiety, metadane |
| Caption Small | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | Drobny druk, znaczniki czasu |
| Caption Tabular | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Dane finansowe, liczby |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (ciasno) | 0.1px | ss01 | Bardzo małe etykiety, znaczniki osi |
| Micro Tabular | sohne-var | 10px (0.63rem) | 300 | 1.15 (ciasno) | -0.3px | tnum | Dane wykresów, małe liczby |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (ciasno) | normal | ss01 | Najmniejsze etykiety |
| Code Body | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (luźno) | normal | -- | Bloki kodu, składnia |
| Code Bold | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (luźno) | normal | -- | Pogrubiony kod, słowa kluczowe |
| Code Label | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (luźno) | normal | uppercase | Etykiety techniczne |
| Code Micro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (ciasno) | normal | ss01 | Małe adnotacje kodu |

### Zasady
- **Lekka grubość jako sygnatura**: Grubość 300 przy rozmiarach displayowych to najbardziej charakterystyczny wybór typograficzny Stripe. Tam, gdzie inni używają 600–700, by przykuwać uwagę, Stripe używa lekkości jako luksusu — tekst jest tak pewny siebie, że nie potrzebuje grubości, by być autorytatywny.
- **ss01 wszędzie**: Zestaw stylistyczny `"ss01"` jest nieodzowny. Modyfikuje konkretne glify (prawdopodobnie alternatywne formy `a`, `g`, `l`), tworząc bardziej geometryczny, współczesny charakter w całym tekście sohne-var.
- **Dwa tryby OpenType**: `"ss01"` dla tekstu displayowego/treści, `"tnum"` dla cyfr tabelarycznych w danych finansowych. Nigdy się nie nakładają — liczba w akapicie używa ss01, liczba w tabeli danych używa tnum.
- **Progresywny tracking**: Odstęp liter zagęszcza się proporcjonalnie do rozmiaru: -1,4px przy 56px, -0,96px przy 48px, -0,64px przy 32px, -0,26px przy 26px, normalny przy 16px i poniżej.
- **Prostota dwóch grubości**: Głównie 300 (treść i nagłówki) i 400 (UI/przyciski). Brak pogrubienia (700) w głównym kroju — SourceCodePro używa 500/700 dla kontrastu kodu.

## 4. Style Komponentów

### Przyciski

**Primary Purple**
- Tło: `#533afd`
- Tekst: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Czcionka: 16px sohne-var grubość 400, `"ss01"`
- Hover: tło `#4434d4`
- Użycie: Podstawowe CTA ("Start now", "Contact sales")

**Ghost / Outlined**
- Tło: transparent
- Tekst: `#533afd`
- Padding: 8px 16px
- Radius: 4px
- Obramowanie: `1px solid #b9b9f9`
- Czcionka: 16px sohne-var grubość 400, `"ss01"`
- Hover: tło zmienia się na `rgba(83,58,253,0.05)`
- Użycie: Działania drugorzędne

**Transparent Info**
- Tło: transparent
- Tekst: `#2874ad`
- Padding: 8px 16px
- Radius: 4px
- Obramowanie: `1px solid rgba(43,145,223,0.2)`
- Użycie: Działania trzeciorzędne/informacyjne

**Neutral Ghost**
- Tło: transparent (`rgba(255,255,255,0)`)
- Tekst: `rgba(16,16,16,0.3)`
- Padding: 8px 16px
- Radius: 4px
- Obrys: `1px solid rgb(212,222,233)`
- Użycie: Działania wyłączone lub stonowane

### Karty i Kontenery
- Tło: `#ffffff`
- Obramowanie: `1px solid #e5edf5` (standardowe) lub `1px solid #061b31` (ciemny akcent)
- Radius: 4px (ciasny), 5px (standardowy), 6px (wygodny), 8px (wyróżniony)
- Cień (standardowy): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Cień (otoczenia): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: cień się intensyfikuje, często dodając warstwę z niebieskim odcieniem

### Odznaki / Tagi / Pigułki
**Neutral Pill**
- Tło: `#ffffff`
- Tekst: `#000000`
- Padding: 0px 6px
- Radius: 4px
- Obramowanie: `1px solid #f6f9fc`
- Czcionka: 11px grubość 400

**Success Badge**
- Tło: `rgba(21,190,83,0.2)`
- Tekst: `#108c3d`
- Padding: 1px 6px
- Radius: 4px
- Obramowanie: `1px solid rgba(21,190,83,0.4)`
- Czcionka: 10px grubość 300

### Pola Input i Formularze
- Obramowanie: `1px solid #e5edf5`
- Radius: 4px
- Focus: `1px solid #533afd` lub fioletowa obwódka
- Etykieta: `#273951`, 14px sohne-var
- Tekst: `#061b31`
- Placeholder: `#64748d`

### Nawigacja
- Czysta pozioma nawigacja na białym, przyklejona z rozmytym tłem
- Logotyp marki wyrównany do lewej
- Linki: sohne-var 14px grubość 400, tekst `#061b31` z `"ss01"`
- Radius: 6px na kontenerze nawigacji
- CTA: fioletowy przycisk wyrównany do prawej ("Sign in", "Start now")
- Mobile: przełącznik hamburger z promieniem 6px

### Elementy Dekoracyjne
**Przerywane Obramowania**
- `1px dashed #362baa` (fioletowy) dla stref zastępczych/upuszczania
- `1px dashed #ffd7ef` (magenta) dla dekoracyjnych obramowań w tonacji magenty

**Gradienty Akcentowe**
- Gradienty od rubinu do magenty (`#ea2261` do `#f96bee`) dla dekoracji bohaterów
- Ciemne sekcje marki używają teł `#1c1e54` z białym tekstem

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px
- Skala: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Uwaga: Skala jest gęsta przy małych wartościach (co 2px od 4–12), co odzwierciedla zorientowane na precyzję UI Stripe dla danych finansowych

### Siatka i Kontener
- Maksymalna szerokość treści: około 1080px
- Bohater: wyśrodkowana pojedyncza kolumna z hojnym paddingiem, lekkie nagłówki
- Sekcje funkcji: siatki 2–3 kolumnowe dla kart funkcji
- Pełnoszerokościowe ciemne sekcje z tłem `#1c1e54` dla zanurzenia w marce
- Podglądy kodu/dashboardu jako zawarte karty z cieniami z niebieskim odcieniem

### Filozofia Przestrzeni
- **Precyzyjne odstępy**: W odróżnieniu od ogromnej pustki systemów minimalistycznych, Stripe używa mierzonej, celowej przestrzeni. Każda przerwa to świadomy wybór typograficzny.
- **Gęste dane, szczodry chrome**: Wyświetlenia danych finansowych (tabele, wykresy) są ściśle upakowane, ale otaczający je chrome UI jest szczodrze rozmieszczony. Tworzy to poczucie kontrolowanej gęstości — jak dobrze zorganizowany arkusz kalkulacyjny w pięknej ramce.
- **Rytm sekcji**: Białe sekcje przeplatają się z ciemnymi sekcjami marki (`#1c1e54`), tworząc dramatyczny kadencję jasne/ciemne, która zapobiega monotonii bez wprowadzania arbitralnych kolorów.

### Skala Zaokrąglenia Narożników
- Mikro (1px): Drobnoziarniste elementy, subtelne zaokrąglenie
- Standardowe (4px): Przyciski, pola input, odznaki, karty — koń roboczy
- Wygodne (5px): Standardowe kontenery kart
- Luźne (6px): Nawigacja, większe elementy interaktywne
- Duże (8px): Wyróżnione karty, elementy bohaterów
- Złożone: `0px 0px 6px 6px` dla kontenerów zaokrąglonych od dołu (panele zakładek, stopki rozwijane)

## 6. Głębia i Uniesienie

| Poziom | Leczenie | Użycie |
|-------|-----------|-----|
| Płaski (Poziom 0) | Brak cienia | Tło strony, tekst inline |
| Otoczenia (Poziom 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Subtelne uniesienie karty, wskazówki hover |
| Standardowy (Poziom 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Standardowe karty, panele treści |
| Uniesiony (Poziom 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Wyróżnione karty, rozwijane, popovery |
| Głęboki (Poziom 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Okna modalne, pływające panele |
| Obwódka (Dostępność) | `2px solid #533afd` obrys | Obwódka fokusu klawiatury |

**Filozofia Cieni**: System cieni Stripe opiera się na zasadzie chromatycznej głębi. Tam gdzie większość systemów projektowych używa neutralnych szarych lub czarnych cieni, podstawowy kolor cienia Stripe (`rgba(50,50,93,0.25)`) to głęboki niebieskoszary, który nawiązuje do granatowej palety marki. Tworzy to cienie, które nie tylko dodają głębi — dodają atmosferę marki. Wielowarstwowe podejście łączy ten cień z niebieskim odcieniem z czystą czarną warstwą drugorzędną (`rgba(0,0,0,0.1)`) przy innym przesunięciu, tworząc efekt paralaksy, gdzie cień z marką leży dalej od elementu, a neutralny cień bliżej. Ujemne wartości rozproszenia (-30px, -18px) zapewniają, że cienie nie rozciągają się poza footprint elementu poziomo, utrzymując uniesienie pionowe i kontrolowane.

### Dekoracyjna Głębia
- Ciemne sekcje marki (`#1c1e54`) tworzą immersyjną głębię poprzez kontrast koloru tła
- Nakładki gradientowe z przejściami od rubinu do magenty dla dekoracji bohaterów
- Kolor cienia `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) dla cieni górnej krawędzi na przyklejonych elementach

## 7. Co Robić i Czego Nie Robić

### Robić
- Używać sohne-var z `"ss01"` na każdym elemencie tekstowym — zestaw stylistyczny TO jest marka
- Używać grubości 300 dla wszystkich nagłówków i tekstu treści — lekkość jest sygnaturą
- Stosować cienie z niebieskim odcieniem (`rgba(50,50,93,0.25)`) dla wszystkich uniesionych elementów
- Używać `#061b31` (głęboki granat) dla nagłówków zamiast `#000000` — ciepło ma znaczenie
- Utrzymywać zaokrąglenie narożników między 4px–8px — zachowawcze zaokrąglenie jest celowe
- Używać `"tnum"` dla każdego tabelarycznego/finansowego wyświetlenia liczb
- Warstwować cienie: niebieski odcień daleko + neutralny blisko dla paralaksy głębi
- Używać fioletu `#533afd` jako podstawowego koloru interaktywnego/CTA

### Nie Robić
- Nie używać grubości 600–700 dla nagłówków sohne-var — grubość 300 to głos marki
- Nie używać dużego zaokrąglenia narożników (12px+, kształty pigułek) na kartach lub przyciskach — Stripe jest zachowawczy
- Nie używać neutralnych szarych cieni — zawsze odcień niebieski (`rgba(50,50,93,...)`)
- Nie pomijać `"ss01"` na żadnym tekście sohne-var — alternatywne glify definiują osobowość
- Nie używać czystej czerni (`#000000`) dla nagłówków — zawsze `#061b31` głęboki granat
- Nie używać ciepłych kolorów akcentowych (pomarańczowego, żółtego) dla elementów interaktywnych — fiolet jest podstawowy
- Nie stosować dodatniego odstępu liter przy rozmiarach displayowych — Stripe śledzi ciasno
- Nie używać akcentów magenty/rubinu dla przycisków lub linków — są wyłącznie dekoracyjne/gradientowe

## 8. Zachowanie Responsywne

### Punkty Przełamania
| Nazwa | Szerokość | Kluczowe Zmiany |
|------|-------|-------------|
| Mobile | <640px | Pojedyncza kolumna, zmniejszone rozmiary nagłówków, ułożone karty |
| Tablet | 640-1024px | Siatki 2-kolumnowe, umiarkowany padding |
| Desktop | 1024-1280px | Pełny układ, 3-kolumnowe siatki funkcji |
| Large Desktop | >1280px | Wyśrodkowana treść z hojnymi marginesami |

### Obszary Dotykowe
- Przyciski używają wygodnego paddingu (8px–16px pionowo)
- Linki nawigacyjne przy 14px z odpowiednim odstępem
- Odznaki mają minimalny padding poziomy 6px dla celów dotykowych
- Przycisk przełącznika nawigacji mobilnej z promieniem 6px

### Strategia Składania
- Bohater: display 56px -> 32px na mobile, grubość 300 zachowana
- Nawigacja: poziome linki + CTA -> przełącznik hamburger
- Karty funkcji: 3-kolumnowe -> 2-kolumnowe -> ułożone w jednej kolumnie
- Ciemne sekcje marki: zachowanie pełnoszerokościowego traktowania, zmniejszenie wewnętrznego paddingu
- Tabele danych finansowych: poziome przewijanie na mobile
- Odstępy sekcji: 64px+ -> 40px na mobile
- Skala typograficzna kompresuje się: rozmiary bohaterów 56px -> 48px -> 32px w różnych punktach przełamania

### Zachowanie Obrazów
- Zrzuty ekranu dashboardu/produktu zachowują cień z niebieskim odcieniem we wszystkich rozmiarach
- Dekoracje gradientowe bohatera upraszczają się na mobile
- Bloki kodu zachowują traktowanie `SourceCodePro`, mogą przewijać się poziomo
- Obrazy kart zachowują spójne zaokrąglenie narożników 4px–6px

## 9. Przewodnik po Promptach dla Agenta

### Szybki Podgląd Kolorów
- Podstawowe CTA: Stripe Purple (`#533afd`)
- Hover CTA: Purple Dark (`#4434d4`)
- Tło: Pure White (`#ffffff`)
- Tekst nagłówka: Deep Navy (`#061b31`)
- Tekst treści: Slate (`#64748d`)
- Tekst etykiety: Dark Slate (`#273951`)
- Obramowanie: Soft Blue (`#e5edf5`)
- Link: Stripe Purple (`#533afd`)
- Ciemna sekcja: Brand Dark (`#1c1e54`)
- Sukces: Green (`#15be53`)
- Akcent dekoracyjny: Ruby (`#ea2261`), Magenta (`#f96bee`)

### Przykładowe Prompty dla Komponentów
- "Stwórz sekcję bohatera na białym tle. Nagłówek przy 48px sohne-var grubość 300, line-height 1.15, letter-spacing -0.96px, kolor #061b31, font-feature-settings 'ss01'. Podtytuł przy 18px grubość 300, line-height 1.40, kolor #64748d. Fioletowy przycisk CTA (#533afd, radius 4px, padding 8px 16px, biały tekst) i przycisk ghost (transparent, 1px solid #b9b9f9, tekst #533afd, radius 4px)."
- "Zaprojektuj kartę: białe tło, obramowanie 1px solid #e5edf5, radius 6px. Cień: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Tytuł przy 22px sohne-var grubość 300, letter-spacing -0.22px, kolor #061b31, 'ss01'. Treść przy 16px grubość 300, #64748d."
- "Zbuduj odznakę sukcesu: tło rgba(21,190,83,0.2), tekst #108c3d, radius 4px, padding 1px 6px, 10px sohne-var grubość 300, obramowanie 1px solid rgba(21,190,83,0.4)."
- "Stwórz nawigację: biały przyklejony nagłówek z backdrop-filter blur(12px). sohne-var 14px grubość 400 dla linków, tekst #061b31, 'ss01'. Fioletowe CTA 'Start now' wyrównane do prawej (#533afd bg, biały tekst, radius 4px). Kontener nawigacji radius 6px."
- "Zaprojektuj ciemną sekcję marki: tło #1c1e54, biały tekst. Nagłówek 32px sohne-var grubość 300, letter-spacing -0.64px, 'ss01'. Treść 16px grubość 300, rgba(255,255,255,0.7). Karty wewnątrz używają obramowania rgba(255,255,255,0.1) z radius 6px."

### Przewodnik po Iteracji
1. Zawsze włączaj `font-feature-settings: "ss01"` na tekście sohne-var — to jest DNA typograficzne marki
2. Grubość 300 jest domyślna; używaj 400 tylko dla przycisków/linków/nawigacji
3. Formuła cienia: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` gdzie Y1/B1 są większe (daleki cień) a Y2/B2 mniejsze (bliski cień)
4. Kolor nagłówka to `#061b31` (głęboki granat), treść to `#64748d` (łupek), etykiety to `#273951` (ciemny łupek)
5. Zaokrąglenie narożników pozostaje w zakresie 4px–8px — nigdy nie używaj kształtów pigułek ani dużego zaokrąglenia
6. Używaj `"tnum"` dla dowolnych liczb w tabelach, wykresach lub wyświetleniach finansowych
7. Ciemne sekcje używają `#1c1e54` — nie czarnego, nie szarego, ale głębokiego markowego indygo
8. SourceCodePro dla kodu przy 12px/500 z line-height 2.00 (bardzo hojny dla czytelności)
