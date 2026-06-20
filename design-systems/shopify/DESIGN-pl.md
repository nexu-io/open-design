# System projektowania inspirowany Shopify

> Category: E-Commerce i handel detaliczny
> Platforma e-commerce. Ciemny motyw kinowy, neonowo-zielony akcent, ultradelikatna typografia.

## 1. Motyw wizualny i atmosfera

Shopify.com to ciemny cyfrowy teatr — strona, która prezentuje swoją platformę handlową jak kinową premierę. Całe doświadczenie rozgrywa się na tle głęboko czarnych powierzchni niosących najdelikatniejszy ślad ciemnej, leśnej zieleni (`#02090A`, `#061A1C`, `#102620`), tworząc nocną atmosferę, która przypomina bardziej ekskluzywną prezentację produktu na targach technologicznych niż typową stronę marketingową SaaS. Ta ciemność nie jest zimna ani korporacyjna — to ciepła, otulająca ciemność luksusowego doznania, jak siedzenie w pierwszym rzędzie zaciemnionej sali.

Typografia jest niekwestionowaną gwiazdą. NeueHaasGrotesk — wyrafinowany potomek Helvetiki — pojawia się w monumentalnej skali (96px) z niemożliwie lekką grubością (330-400), tworząc nagłówki, które zdają się być wyryte w świetle, a nie zadrukowane tuszem. Funkcja OpenType `ss03` nadaje literom wyraźny charakter, wyróżniający typografię Shopify spośród zwykłego zastosowania Helvetiki. Na poziomie treści Inter Variable obsługuje tekst główny z chirurgiczną precyzją, używając równie nietypowych zmiennych grubości (420, 450, 550), które mieszczą się pomiędzy tradycyjnymi stopniami grubości. Ta precyzja sygnalizuje firmę dbającą o każdy detal.

Kolor stosowany jest z ekstremalną powściągliwością. Główny akcent to Neonowa Zieleń Shopify (`#36F4A4`) — elektryczna mięta pojawiająca się wyłącznie na pierścieniach fokusa i akcentowych podświetleniach, pulsująca jak bioluminescencyjny sygnał na tle ciemnego płótna. Delikatniejsze odcienie zieleni (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) tworzą atmosferyczne tła. Biały jest jedynym kolorem tekstu, który ma znaczenie na ciemnych powierzchniach, podczas gdy neutralna skala oparta na cynku (`#A1A1AA` do `#3F3F46`) obsługuje hierarchię cichych informacji. Rezultatem jest projekt, dzięki któremu technologia handlowa wydaje się należeć do science-fiction przyszłości.

**Kluczowe cechy:**
- Ciemny motyw z głębokimi podtonami leśnej zieleni (nie czysta czerń)
- Ultradelikatna typografia displayowa (grubość 330) w monumentalnej skali (96px) tworząca eteryczną obecność
- Neonowa Zieleń (`#36F4A4`) jako jedyny wysokoenergetyczny akcent na tle ciemności
- Przyciski z pełnym zaokrągleniem (promień 9999px) jako podstawowy kształt interaktywny
- Warstwowe, wielostopniowe cienie nadające fotograficzną głębię
- Zrzuty ekranu produktu osadzone w ciemnym kontekście UI, dopasowanym do otaczającej ciemności
- Neutralna skala cynkowa dla hierarchii tekstu — balans między ciepłem a chłodem

## 2. Paleta kolorów i role

### Podstawowe

- **Shopify White** (`#FFFFFF`): Podstawowy tekst na ciemnych powierzchniach, wypełnienia przycisków, elementy wysokiego kontrastu
- **Shopify Black** (`#000000`): Tło główne, tekst przycisków na białym, baza maksymalnego kontrastu (--color-shade-100)

### Drugorzędne i akcenty

- **Neonowa Zieleń** (`#36F4A4`): Charakterystyczny akcent — pierścienie fokusa, interaktywne podświetlenia, wskaźniki aktywnego stanu. Elektryczny i bioluminescencyjny
- **Aloe** (`#C1FBD4`): Delikatny zielony wash na dekoracyjne tła i atmosferyczne karty (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): Najjaśniejszy odcień zieleni na subtelne różnicowanie powierzchni (--color-pistachio-10)

### Powierzchnie i tła

- **Void** (`#000000`): Tło strony głównej — czysta czerń dla maksymalnej głębi
- **Głęboka zieleń** (`#02090A`): Powierzchnie kart, kontenery treści — prawie czarny z zielonym podtonem
- **Ciemny las** (`#061A1C`): Tła sekcji z wyraźnym zielonym charakterem
- **Las** (`#102620`): Uniesione ciemne powierzchnie, tła nagłówków — najcieplejszy ciemny odcień
- **Obramowanie ciemnej karty** (`#1E2C31`): Obramowania kart na ciemnych powierzchniach, subtelne wyznaczanie granic

### Neutralne i tekst (skala cynkowa)

- **Shade-30** (`#D4D4D8`): Najjaśniejszy neutralny, ledwo widoczne obramowania na ciemnym (--color-shade-30)
- **Tekst wyciszony** (`#A1A1AA`): Tekst drugorzędny, metadane, opisy — cichy głos
- **Shade-50** (`#71717A`): Tekst trzeciorzędny, znaczniki czasu, najmniej ważne informacje (--color-shade-50)
- **Shade-60** (`#52525B`): Tekst wyłączony, dekoracyjne neutralne (--color-shade-60)
- **Shade-70** (`#3F3F46`): Subtelne dzielniki, ledwo widoczne granice UI (--color-shade-70)
- **Jasne obramowanie** (`#E4E4E7`): Obramowania na jasnych powierzchniach (rzadko — tylko w modalach trybu jasnego)

### Semantyczne i akcentowe

- **Link wyciszony** (`#9797A2`): Wyciszony tekst linku z dekoracją podkreślenia
- **Link szałwia** (`#9DABAD`): Wyciszone linki z odcieniem zieleni
- **Link lawenda** (`#BDBDCA`): Jaśniejszy wariant linku
- **Link mięta** (`#99B3AD`): Wariant linku z zielonym odcieniem dla tematycznych sekcji

### System gradientów

- **Ciemny wash zieleni**: Radialny gradient od centrum `#102620` do krawędzi `#02090A` — stosowany za prezentacjami produktów
- **Zielona atmosfera**: Subtelne atmosferyczne gradienty z zielonym odcieniem za sekcjami hero, tworzące głębię bez jednolitych kolorów
- **Reflektor**: Skupiony jasny obszar zanikający do czerni — tworzy oświetlenie w stylu keynote

## 3. Zasady typografii

### Rodzina czcionek

**Displayowa:** NeueHaasGrotesk (wyrafinowany potomek Helvetiki, zmienna czcionka)
- Zamienniki: Helvetica, Arial, sans-serif
- Funkcje OpenType: `ss03` (zestaw stylistyczny 3 — charakterystyczne alternatywy liter)
- Dostępne grubości: 330, 360, 400, 500, 750 (zmienna)
- Używana dla wszystkich nagłówków, tekstu hero i dużych elementów displayowych

**Treść:** Inter-Variable
- Zamienniki: Helvetica, Arial, sans-serif
- Funkcje OpenType: `ss03`
- Dostępne grubości: 400, 420, 450, 500, 550 (zmienna)
- Używana dla tekstu głównego, linków, przycisków, elementów UI

**Mono:** ui-monospace
- Zamienniki: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Używana dla fragmentów kodu, etykiet danych, treści technicznych

### Hierarchia

| Rola | Rozmiar | Grubość | Wysokość linii | Odstęp liter | Uwagi |
|------|---------|---------|----------------|--------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, nagłówki hero, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, wyróżniony display |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, rozstrzelony display |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, eteryczny display |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, tytuły sekcji |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, podsekcje |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, tytuły funkcji |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, nagłówki kart |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, małe nagłówki |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, pomniejsze nagłówki |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, wiodące akapity |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, standardowa treść |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, wyróżniona treść |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, kompaktowa treść |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, lekko wyróżniona |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, tekst CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, elementy nawigacji |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadane |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, wyróżniony podpis |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, szerokorozstrzelone etykiety |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, ciasno rozstrzelony mały tekst |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, etykiety z wielkimi literami |
| Code | 16px | 400 | 1.50 | — | ui-monospace, wielkie litery, bloki kodu |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, wielkie litery, kod inline |

### Zasady

Typografia Shopify to mistrzowska lekcja precyzji zmiennych czcionek. Warstwa displayowa operuje niemal wyłącznie w zakresie grubości 330-400 — pierzy lekki tekst, który zdaje się unosić nad ciemnym tłem jak rzutowane światło. To przeciwieństwo pogrubionego, ciężkiego podejścia większości stron SaaS: tam gdzie inni krzyczą, Shopify szepce w skali. Nagłówki 96px przy grubości 330 tworzą paradoks ogromnego rozmiaru i delikatnych linii, jednocześnie monumentalnych i kruchych. Funkcja OpenType `ss03` aktywuje zestaw stylistyczny nadający wybranym znakom (prawdopodobnie 'a', 'g' i niektórym cyfrom) bardziej wyrafinowany wygląd, odróżniając typografię Shopify od standardowego użycia Helvetica Neue. Inter Variable obsługuje warstwę treści z chirurgiczną precyzją, używając grubości takich jak 420 i 550, które istnieją pomiędzy tradycyjnymi stopniami — każdy element tekstu ma dokładnie taką wizualną wagę, jakiej potrzebuje.

## 4. Style komponentów

### Przyciski

**Podstawowy (białe wypełnienie)**
- Tło: Biały (`#FFFFFF`)
- Tekst: Czarny (`#000000`)
- Obramowanie: 2px solid transparent
- Promień obramowania: pełna pigułka (9999px)
- Padding: 12px 26px 12px 16px (asymetryczny — więcej miejsca po prawej dla równowagi wizualnej)
- Hover: lekkie zmniejszenie krycia lub zmiana tła
- Fokus: 2px `#36F4A4` (Neonowa Zieleń) pierścień konturu
- Przejście: all 200ms ease

**Drugorzędny (ghost/obrysowany)**
- Tło: transparent
- Tekst: Biały (`#FFFFFF`)
- Obramowanie: 2px solid Biały (`#FFFFFF`)
- Promień obramowania: pełna pigułka (9999px)
- Padding: 12px 26px 12px 16px
- Hover: wypełnia się białym tłem z czarnym tekstem
- Fokus: 2px `#36F4A4` kontur

**Badge/Tag (neutralne wypełnienie)**
- Tło: `rgba(255, 255, 255, 0.2)` (mrożone szkło)
- Tekst: Biały (`#FFFFFF`)
- Obramowanie: brak
- Promień obramowania: delikatnie zaokrąglony (4px)
- Padding: 12px 16px
- Czcionka: 16px regularna

### Karty i kontenery

- Tło: Głęboka zieleń (`#02090A`) na ciemnych stronach
- Obramowanie: 1px solid `#1E2C31` (Obramowanie ciemnej karty) — ledwo widoczna granica
- Promień obramowania: 8px dla standardowych kart, 12px dla wyróżnionych kart, 20px 20px 0 0 dla kart zaokrąglonych u góry
- Cień: System wielowarstwowy:
  - Spoczynek: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - Wewnętrzne białe podświetlenie tworzy subtelną poświatę górnej krawędzi
- Hover: cień się rozszerza, karta może lekko się rozjaśnić
- Przejście: box-shadow 300ms ease, transform 200ms ease

### Pola i formularze

- Tło: transparent lub Ciemny las (`#061A1C`)
- Tekst: Biały (`#FFFFFF`)
- Obramowanie: 1px solid `#3F3F46` (Shade-70)
- Promień obramowania: 8px
- Padding: 12px 16px
- Fokus: 2px solid `#36F4A4` (pierścień fokusa Neonowej Zieleni)
- Placeholder: Shade-50 (`#71717A`)
- Przejście: border-color 200ms ease

### Nawigacja

- Tło: transparent (nałożone na ciemne hero), staje się Las (`#102620`) przy przewijaniu
- Wysokość: ~64px
- Lewo: logo słowne Shopify (SVG, białe na ciemnym)
- Środek/Prawo: linki nawigacyjne 18px/500 NeueHaasGrotesk, białe, letter-spacing 0.72px
- CTA: biały przycisk-pigułka „Zacznij za darmo" (prawo)
- Drugorzędny CTA: przycisk ghost z białym obramowaniem
- Hover: linki przechodzą do tekstu wyciszonego (`#A1A1AA`) lub zyskują podkreślenie
- Mobilny: menu hamburger, pełnoekranowa ciemna nakładka
- Przejście: background 300ms ease przy przewijaniu

### Obróbka obrazów

- Zrzuty ekranu produktu: osadzone w ciemnym kontekście UI, dopasowane do otaczającej ciemności
- Podglądy interfejsu administracyjnego: prezentowane na ciemnych tłach z subtelnymi obramowaniami kart
- Współczynniki proporcji: zmienne — obrazy hero są szerokie (ok. 16:9), zdjęcia funkcji są elastyczne
- Wszystkie obrazy siedzą równo w ciemnych kontenerach — bez jasnych obramowań lub ramek
- Lazy loading z ciemnymi powierzchniami placeholdera

### Wskaźniki zaufania

- Statystyki prezentowane wyraźnie: „15+" (lat), „150M+" (kupujących)
- Liczby w skali displayowej w NeueHaasGrotesk
- Sekcje wyróżniające ekosystem partnerów/deweloperów
- Ciemne referencje zintegrowane z przepływem strony

## 5. Zasady układu

### System odstępów

Jednostka bazowa: 8px

| Token | Wartość | Zastosowanie |
|-------|---------|--------------|
| space-1 | 4px | Ciasne przerwy inline |
| space-2 | 8px | Jednostka bazowa, przerwy ikon |
| space-3 | 12px | Padding kart, ciasne marginesy |
| space-4 | 16px | Standardowy padding elementów |
| space-5 | 24px | Przerwy kart, padding sekcji |
| space-6 | 28px | Średni odstęp sekcji |
| space-7 | 32px | Podziały sekcji |
| space-8 | 36px | Duży padding |
| space-9 | 40px | Główny padding sekcji |
| space-10 | 64px | Padding sekcji hero, duże przerwy |

### Siatka i kontenery

- Maksymalna szerokość kontenera: ~1280px (wyśrodkowana)
- Hero: pełna szerokość, ciemne tło od krawędzi do krawędzi z wyśrodkowanym tekstem
- Sekcje funkcji: układy 2-kolumnowe z tekstem i zrzutami ekranu produktu
- Sekcje statystyk: układ poziomy z dużymi liczbami
- Poziomy padding: 64px desktop, 32px tablet, 16px mobilny
- Przerwa siatki: 24-32px między głównymi blokami treści

### Filozofia białej przestrzeni

Strategia białej przestrzeni Shopify jest teatralna. Sekcje są oddzielone ogromnymi ekspansami ciemnej przestrzeni — 80px do 120px czystej czarnej przestrzeni do oddychania — które tworzą tempo prezentacji, a nie strony internetowej. Każdy blok treści to własny „slajd" w przewijaniu w stylu keynote. Wewnątrz sekcji odstępy są ciaśniejsze i bardziej celowe, tworząc fokusową gęstość na tle rozległej pustki. Kontrast między makro-poziomową pustką a mikro-poziomową precyzją nadaje stronie jej kinowy rytm.

### Skala promieni zaokrągleń

| Wartość | Kontekst |
|---------|----------|
| 4px | Tagi, odznaki, mikro-elementy |
| 8px | Standardowe karty, pola, kontenery wideo |
| 12px | Wyróżnione karty, kontenery obrazów, przyciski (nie-pigułka) |
| 20px | Karty zaokrąglone u góry (20px 20px 0 0), nagłówki modali |
| 340px | Duże zaokrąglone elementy dekoracyjne |
| 9999px | Przyciski-pigułki, odznaki-pigułki, elementy nawigacyjne |

## 6. Głębia i uniesienie

| Poziom | Leczenie | Zastosowanie |
|--------|----------|--------------|
| Baza | Brak cienia, ciemna powierzchnia | Domyślne tło strony |
| Subtelny | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + wewnętrzna biała poświata | Spoczywające karty |
| Średni | Wielowarstwowy: pierścień 1px + cień 2px + 4px + 8px | Uniesione karty, wyróżnione sekcje |
| Wysoki | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modale, rozwijane, nakładki |
| Fokus | `0px 0px 0px 2px #36F4A4` | Pierścień fokusa klawiatury (Neonowa Zieleń) |

System cieni Shopify jest niezwykle wyrafinowany. Zamiast jednopoziomowych cieni, karty używają warstwowego podejścia wielopoziomowego: pierścień 1px dla definicji granicy, progresywne rozmycia 2px/4px/8px dla naturalnego opadania światła i delikatna wewnętrzna biała poświata (`rgba(255,255,255,0.03)`) symulująca szklaną powierzchnię oświetloną od góry. Na ciemnych tłach cienie przyciemniają już ciemne powierzchnie, więc funkcjonują bardziej jako „ambient occlusion" niż tradycyjne uniesienie — karta zdaje się lekko zapadać w powierzchnię zamiast unosić się nad nią.

### Dekoracyjna głębia

- **Ciemne gradienty zieleni**: Atmosferyczne radialne washi za sekcjami hero i prezentacjami produktów
- **Efekty reflektora**: Jasne wycentrowane obszary zanikające do czerni, tworzące teatralne oświetlenie w stylu keynote
- **Poświata krawędzi**: Subtelnie jasnokrawędziowe ciemne karty przez wewnętrzny box-shadow
- **Zielone atmosferyczne halos**: Słabe zielone odcienie w gradientach tła, nawiązujące do akcentu marki

## 7. Nakazy i zakazy

### Nakazy

- Używaj hierarchii ciemnych powierzchni błękitno-czarnych (Void → Głęboka zieleń → Ciemny las → Las) dla głębi
- Utrzymuj typografię displayową przy grubości 330-400 — eteryczna lekkość to znak rozpoznawczy projektu
- Używaj Neonowej Zieleni (`#36F4A4`) wyłącznie dla stanów fokusa i kluczowych akcentowych podświetleń
- Stosuj promień 9999px do wszystkich głównych przycisków CTA — pełna pigułka jest obowiązkowa
- Używaj wielowarstwowego systemu cieni do uniesienia kart — pojedyncze cienie wyglądają płasko
- Utrzymuj funkcję OpenType `ss03` w całym tekście — to część tożsamości typograficznej
- Używaj Inter Variable do tekstu treści i NeueHaasGrotesk do nagłówków — nigdy nie mieszaj ich ról
- Twórz teatralne odstępy między sekcjami (80px+) dla kinowego tempa

### Zakazy

- Nie używaj czystej czerni (#000000) do tekstu na ciemnych tłach — używaj tylko bieli (#FFFFFF)
- Nie wprowadzaj ciepłych kolorów (pomarańcz, czerwień, żółć) — paleta jest ściśle chłodna (zielenie, zielono-niebieskie, neutralne)
- Nie używaj grubości czcionki powyżej 500 dla tekstu treści NeueHaasGrotesk — ciężkie grubości niszczą eteryczne odczucie
- Nie stosuj zielonych akcentów do dużych powierzchni — Neonowa Zieleń jest dla małych, precyzyjnych podświetleń
- Nie używaj ostrych rogów (promień 0px) na interaktywnych elementach — wszystko się zaokrągla
- Nie dodawaj jasnych teł — ciemny motyw jest fundamentalny, a nie opcjonalny
- Nie używaj jednopoziomowych box shadows — warstwowe podejście jest systemem
- Nie ustawiaj line-height powyżej 1.56 dla tekstu treści — tekst Shopify jest stosunkowo zwarty
- Nie mieszaj NeueHaasGrotesk i Inter w tym samym rozmiarze/roli — ich skale grubości różnią się
- Nie używaj letter-spacing poniżej 0 dla nagłówków — nagłówki Shopify śledzą neutralnie lub dodatnio

## 8. Zachowanie responsywne

### Punkty graniczne

| Nazwa | Szerokość | Kluczowe zmiany |
|-------|-----------|-----------------|
| Mobilny | <640px | Jedna kolumna, nawigacja hamburger, tekst displayowy skaluje się do 48px, padding 16px |
| Tablet | 640-1024px | Zaczynają się siatki 2-kolumnowe, tekst displayowy 70px, padding 32px |
| Desktop | 1024-1440px | Pełny układ, rozbudowana nawigacja, display 96px, padding 64px |
| Duży desktop | >1440px | Kontener max-width wyśrodkowany, zwiększone odstępy sekcji |

### Obszary dotyku

- Minimalny obszar dotyku: 44x44px (WCAG AAA)
- Przyciski-pigułki: minimalna wysokość 48px z hojnym poziomym paddingiem
- Linki nawigacyjne: obszar dotyku 44px
- Powierzchnie kart: cała karta jest tapowalna jeśli zlinkowana

### Strategia zwijania

- **Nawigacja**: Pełne poziome linki → menu hamburger poniżej 1024px; logo i przycisk CTA pozostają widoczne
- **Sekcja hero**: display 96px → 70px na tablecie → 48px na mobilnym; zachowuje wyśrodkowanie jednokolumnowe
- **Sekcje funkcji**: 2-kolumnowy tekst+obraz → ułożony pojedynczy stos poniżej 768px
- **Statystyki**: Poziomy rząd → pionowy stos na mobilnym
- **Padding sekcji**: 64px → 40px → 24px → 16px wraz ze zwężaniem viewportu
- **Karty**: Siatka → stos, zachowując pełną szerokość na mobilnym

### Zachowanie obrazów

- Zrzuty ekranu produktu: responsywne w ciemnych kontenerach, zachowują proporcje
- Obrazy hero: pełna szerokość na wszystkich punktach granicznych, lazy loaded z ciemnymi placeholderami
- Podglądy administracyjnego UI: skalują się proporcjonalnie, mogą być przycinane na mobilnym
- Wszystkie obrazy używają CDN (`cdn.shopify.com`) z responsywnym srcset

## 9. Przewodnik po promptach agenta

### Szybka paleta kolorów

- Podstawowy CTA: Shopify White (`#FFFFFF`)
- Tło strony: Void Black (`#000000`)
- Powierzchnia karty: Deep Teal (`#02090A`)
- Tło sekcji: Dark Forest (`#061A1C`)
- Uniesione tło: Forest (`#102620`)
- Akcent: Neon Green (`#36F4A4`)
- Tekst treści: White (`#FFFFFF`)
- Tekst wyciszony: Muted (`#A1A1AA`)
- Obramowanie ciemne: Dark Card Border (`#1E2C31`)

### Przykładowe prompty komponentów

- „Utwórz sekcję hero na tle prawdziwej czerni (#000000) z nagłówkiem 96px/330 NeueHaasGrotesk w bieli, podtytułem 20px/500 w #A1A1AA i dwoma przyciskami-pigułkami: białym wypełnionym (promień 9999px) i ghost z białym obramowaniem 2px"
- „Zaprojektuj kartę funkcji na Głębokiej Zieleni (#02090A) z obramowaniem 1px #1E2C31, promieniem 12px, wielowarstwowym cieniem (pierścień 1px + rozmycie 2px/4px/8px przy 10% czerni), zawierającą biały nagłówek 32px/360 i tekst treści 18px/400 #A1A1AA"
- „Zbuduj sekcję statystyk na Ciemnym Lesie (#061A1C) z białymi liczbami 96px/750 (NeueHaasGrotesk), opisowymi etykietami 16px/400 #A1A1AA i hojnymi odstępami 64px między blokami statystyk"
- „Utwórz sticky nav z transparentnym tłem (staje się #102620 przy przewijaniu), białym logo Shopify po lewej, białymi linkami nawigacyjnymi 18px/500 z letter-spacing 0.72px, i białym przyciskiem-pigułką 'Zacznij za darmo' po prawej"
- „Zaprojektuj tag/odznakę z mrożonym szkłem rgba(255,255,255,0.2), promieniem 4px, paddingiem 12px 16px, białym tekstem 16px — unoszący się nad ciemną powierzchnią karty"

### Przewodnik iteracji

Przy dopracowywaniu istniejących ekranów wygenerowanych przy tym systemie projektowania:
1. Skupiaj się na JEDNYM komponencie na raz
2. Odwołuj się do konkretnych nazw kolorów i kodów hex z tego dokumentu
3. Pamiętaj: to CIEMNY projekt — jasne powierzchnie są wyjątkiem, a nie regułą
4. Tekst displayowy powinien zawsze czuć się jak pióro (grubość 330-400) — jeśli wygląda ciężko, zmniejsz grubość
5. Neonowa Zieleń (#36F4A4) jest cenna — używaj jej oszczędnie tylko do fokusa i akcentu
6. Hierarchia ciemnych powierzchni (czerń → głęboka zieleń → ciemny las → las) tworzy subtelną głębię
7. Cienie są wielowarstwowe — pojedyncza wartość `box-shadow` nie odda klimatu kart Shopify
8. Funkcja OpenType `ss03` musi być aktywna dla całego tekstu dla spójności typograficznej
