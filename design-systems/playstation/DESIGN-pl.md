# System Projektowy Inspirowany PlayStation

> Category: Media i Rozrywka Konsumencka
> Handel detaliczny konsolami do gier. Układ trzech naprzemiennych powierzchni, elegancka typografia display o spokojnym autorytecie, cyjanowy efekt hover ze skalowaniem.

## 1. Motyw Wizualny i Atmosfera

PlayStation.com sprawia wrażenie działu marketingu premium marki elektroniki użytkowej, która przy okazji sprzedaje rozrywkę. Strona zorganizowana jest jako **pionowy kanał naprzemiennych powierzchni**: prawie czarny nagłówek i sekcja hero, ciąg biało-papierowych paneli redakcyjnych w środku oraz głęboki kobaltowo-niebieski stopka, która zakotwicza całe doświadczenie. Między tymi trybami powierzchni witryna opiera się mocno na fotografii i renderach 3D produktów — konsola PS5, okładki gier, kontrolery DualSense — pozwalając sprzętowi wykonywać emocjonalną pracę, podczas gdy sama oprawa pozostaje powściągliwa.

Charakterystycznym zabiegiem typograficznym jest **SST Light (waga 300) w dużych rozmiarach**. Własna rodzina czcionek SST firmy Sony używana jest od 22px do 54px w wadze 300, nadając nagłówkom display wyszeptaną, elegancką jakość, która bardziej przypomina reklamę luksusowego zegarka niż sklep z grami. Ten „spokojny autorytet" jest dokładnym przeciwieństwem krzykliwości The Verge z Manuką czy zagęszczenia Wired — PlayStation chce, by typografia ustępowała miejsca produktowi. Treść i interfejs użytkownika opierają się na wagach 500–700, ale głos *display* jest konsekwentnie cienki i spokojny.

Jedynym miejscem, gdzie powściągliwość ustępuje, jest **interakcja**. Każdy główny przycisk ma ten sam efekt hover: wypełnienie zmienia się na elektryczny cyjan `#1eaedb`, pojawia się 2px biała ramka, za przyciskiem rozkwita 2px zewnętrzny pierścień w kolorze PlayStation-blue, a cały przycisk **skaluje się 1,2×**. Ta kombinacja wybuchu koloru, ramki, pierścienia i uniesienia przez skalowanie to charakterystyczny ruch unikalny wśród głównych marek dla Sony — miniaturowa animacja „włączenia zasilania", którą witryna powtarza setki razy na jednej stronie.

**Kluczowe Cechy:**
- Układ trzech naprzemiennych powierzchni: prawie czarne hero, biało-papierowa treść, kobaltowo-niebieski stopka — na przemian, nigdy zmieszane
- SST waga 300 w zakresie 22–54px dla display — nagłówki o „spokojnym autorytecie", które pozwalają prowadzić fotografii produktowej
- PlayStation Blue `#0070cc` jako kolor-kotwica marki; cyjan `#1eaedb` zarezerwowany wyłącznie dla stanów hover/focus
- Każdy element interaktywny skaluje się 1,2× przy hover — charakterystyczne „włączenie zasilania" unikalne dla PlayStation
- Przyciski-pigułki o promieniu 999px; grafiki kart w zaokrąglonych prostokątach 12–24px
- Commerce Orange `#d53b00` używany wyłącznie dla CTA PlayStation Store / stanów zakupu
- Szeroki zasięg breakpointów do 2120px — witryna skaluje się aż do kontekstów przeglądania w rozdzielczości 4K-TV

## 2. Paleta Kolorów i Role

### Podstawowe (Kotwica Marki)
- **PlayStation Blue** (`#0070cc`): Kolor-kotwica marki. Używany w głównym stopce, linkach inline, wypełnieniach głównych przycisków na ciemnych powierzchniach oraz każdym „oficjalnym" znaczniku. Traktuj go jako niezmienny — jest to kolor, z którym marka jest najbardziej kojarzona w pamięci konsumentów.
- **Console Black** (`#000000`): Czysta czerń dla paska nawigacyjnego, tła sekcji hero i stref prezentacji produktów. PlayStation używa czerni do oprawiania sprzętu tak, jak muzeum używa czerni do oprawiania rzeźby.

### Pomocnicze i Akcentowe
- **PlayStation Cyan** (`#1eaedb`): Kolor interakcji. Stosowany WYŁĄCZNIE dla stanów hover, focus i active przycisków i linków. Nigdy nie pojawia się jako domyślne tło lub kolor tekstu w stanie spoczynku. W celu uzyskania pełnego charakterystycznego efektu połącz z 2px ramką `#ffffff` i 2px zewnętrznym pierścieniem `#0070cc` przy hover.
- **Link Hover Blue** (`#1883fd`): Jaśniejszy wariant używany przy hover na linkach tekstowych inline. Różni się od Cyjan — to jest kolor linku, Cyjan jest kolorem przycisku.
- **Dark Link Blue** (`#0068bd`): Kolor linku w stanie spoczynku na jasnych powierzchniach — nieco bardziej nasycony kuzyn koloru marki.

### Powierzchnie i Tła
- **Paper White** (`#ffffff`): Główne płótno treści dla paneli redakcyjnych między nagłówkiem a stopką.
- **Ice Mist** (`#f5f7fa`): Atmosferyczny kres gradientu jasnej sekcji. Używany subtelnie za niektórymi panelami, by unieść je ponad czystą biel.
- **Divider Tint** (`#f3f3f3`): Spokojny kolor poziomych linii oddzielających wiersze treści.
- **Masthead Black** (`#000000`): Płótno nawigacji górnej i sekcji hero — zarezerwowane dla stref skoncentrowanych na produkcie.
- **Shadow Black** (`#121314`): Punkt startowy kotwicy ciemnego gradientu sekcji, gdy panel wymaga atmosferycznej głębi.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Półprzezroczyste tło używane za przyklejonymi paskami filtrów — jedyny moment „glassmorphism" na witrynie.

### Neutralne i Tekstowe
- **Display Ink** (`#000000`): Główne nagłówki display na białych powierzchniach.
- **Deep Charcoal** (`#1f1f1f`): Nagłówki treści i kolor linków w stanie spoczynku — nieco łagodniejszy od czystej czerni, by zredukować wizualne efekty na dużych blokach.
- **Body Gray** (`#6b6b6b`): Drugi tekst główny i metadane.
- **Mute Gray** (`#cccccc`): Trzeciorzędne etykiety, stany wyłączone.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Tekst zastępczy formularzy — 60% czerni, nie osobna wartość szarości.
- **Inverse White** (`#ffffff`): Główny tekst na ciemnych i niebieskich powierzchniach.
- **Dark-Link Blue** (`#53b1ff`): Kolor linku w stanie spoczynku na ciemnych/czarnych powierzchniach — jaśniejszy, unoszący się wariant PlayStation Blue dla czytelności na czarnym tle.

### Semantyczne i Handlowe
- **Commerce Orange** (`#d53b00`): Zarezerwowany dla CTA stanu zakupu PlayStation Store, wyróżnień cen i odznak „w promocji". Jedyny ciepły kolor na witrynie — używaj oszczędnie i nigdy poza kontekstem handlowym.
- **Commerce Orange Active** (`#aa2f00`): Stan wciśnięcia/aktywny przycisków handlowych.
- **Warning Red** (`#c81b3a`): Błędy formularzy i ostrzeżenia o destrukcyjnych akcjach.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): Dramatyczna zasłona używana za tekstem hero na fotografii produktowej.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Lekki pierścień elewacji na kartach.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Pierzasta elewacja kart — ledwo widoczna, ale oddziela białe panele od białego tła.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): Najlżejszy cień w systemie.

### System Gradientów
PlayStation używa **dwóch gradientów sekcji** i niczego więcej:
- **Gradient Jasnej Sekcji**: od `#ffffff` → `#f5f7fa` — prawie niewidoczne przemycie, które subtelnie unosi panel ponad płótno.
- **Gradient Ciemnej Sekcji**: od `#121314` → `#000000` — krótkie pionowe przemycie nadające panelom hero subtelną winietę bez wprowadzania jakiegokolwiek przesunięcia barwnego.

Oba gradienty używane są **wyłącznie jako tła sekcji**, nigdy wewnątrz komponentów. Nie ma gradientowych przycisków, gradientowego tekstu ani świecących halo. Marka jest niebieska — nie niebiesko-fioletowa, nie niebiesko-cyjanowa.

## 3. Zasady Typografii

### Rodzina Czcionek
- **SST** / **Playstation SST** (Sony, zastrzeżona) — fallback: `Arial`, `Helvetica`. Własny globalny krój Sony, zaprojektowany przez Toshi Omagariego i Akirę Kobayashiego. Obejmuje wagi 300 / 500 / 600 / 700 na stronie głównej. Waga **300 w zakresie 22–54px** to typograficzny podpis PlayStation.
- **SST (kondensowana / alternatywna)** — fallback: `helvetica`, `arial`. Skompresowany wariant używany w kilku modułach UI, gdzie ważna jest szerokość.
- **Arial** — zastępcza czcionka użytkowa dla rzadkiego wariantu przycisku renderowanego w systemowym sans.

### Hierarchia

| Rola | Czcionka | Rozmiar | Waga | Wysokość Linii | Odstęp Liter | Uwagi |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Największy moment SST na stronie — nagłówek luxury o spokojnej wadze |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Drugorzędne nagłówki hero |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Nagłówki paneli feature |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Nagłówki sekcji |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Tytuły modułów — nadal w lekkiej wadze 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Promocyjny pod-nagłówek |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Zwarte nagłówki UI |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Etykieta głównego przycisku |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTA o wyższym nacisku (kup, subskrybuj) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Etykieta drugorzędnego przycisku |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Standardowy tekst do czytania |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Tekst linku inline |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini CTA w kartach |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Podpisy, etykiety tagów |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Standardowe metadane |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Wyróżniony podpis |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Półgrubosty podpis |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Przycisk UI z ciasnym interliniowaniem |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Etykieta zakładki/pigułki |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Najmniejszy podpis UI |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Mikrotekst stopki, tekst prawny |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Wyróżniony mikrotekst |

### Zasady
- **Waga 300 w dużych rozmiarach to głos.** PlayStation jest jedyną główną marką konsolową, która używa lekkiej wagi dla nagłówków hero. Oprzyj się pokusie „ulepszania" typografii display do 500 lub 700 — ciszość jest osobowością.
- **Skoki wagi na poziomie UI.** Poniżej 18px system przechodzi na 500–700 dla czytelności. Gradient wag od 300 (display) → 400 (treść) → 500 (podpisy) → 700 (przyciski) to hierarchia.
- **Odstępy liter są ledwo zauważalne.** Większość wartości mieści się w 0,1–0,45px, zarówno dodatnich, jak i lekko ujemnych. Wartość `-0.1px` przy hero 54px lekko zwęża typografię display — wystarczająco, by czytać jako „zaprojektowane", bez stawania się typograficznym oświadczeniem.
- **Dwa style SST.** „SST" i „Playstation SST" to funkcjonalnie ta sama rodzina z nieco różnymi metrykami (Playstation SST jest ciaśniejszy przy małych rozmiarach). Traktuj je jako wymienne do celów innych niż wewnętrzne licencjonowanie Sony.
- **Bez wersalików.** W przeciwieństwie do The Verge czy Wired, PlayStation rzadko używa WIELKICH LITER. Kickery i tagi pozostają w stylu tytułowym lub zdaniowym — kolejny ruch „spokojnego autorytetu".
- **Brak szeryfów gdziekolwiek.** Cały system jest sans. Nie ma żadnego kontrapunktu w stylu drukowanym.

## 4. Stylizacje Komponentów

### Przyciski

**Główny — Pigułka PlayStation Blue**
- Tło: `#0070cc` (PlayStation Blue)
- Tekst: `#ffffff`, SST 18px / 500 / śledzenie 0.4px
- Ramka: brak w stanie spoczynku
- Promień ramki: `999px` — pełna pigułka
- Padding: ~`12px 24px` (zmienny w zależności od klasy rozmiaru)
- Kontur: `rgb(255, 255, 255) none 0px` w stanie spoczynku
- **Hover (charakterystyczny ruch)**:
  - Tło zmienia się na `#1eaedb` (PlayStation Cyan)
  - Tekst pozostaje `#ffffff`
  - Pojawia się 2px ramka `#ffffff`
  - Rozkwita 2px zewnętrzny pierścień `#0070cc` (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — przycisk faktycznie rośnie o 20%
- Aktywny: `opacity: 0.6` — szybkie przyciemnienie sygnalizujące wciśnięcie
- Focus: Tak jak hover, ale pierścień zmienia się w cień focus `rgb(0, 114, 206) 0px 0px 0px 2px`
- Przejście: ~180ms ease dla tła, transform i cienia

**Drugorzędny — Biały Kontur na Ciemnym**
- Tło: `#ffffff`
- Tekst: `#0172ce` (wariant PlayStation Blue)
- Ramka: `2px outset #000000` — genuina ramka `outset`, niezwykle rzadka we współczesnym CSS
- Promień: zmienny (często `999px` lub `36px`)
- Padding: `16px 20px`
- Hover: te same charakterystyczne cyjanowe wypełnienie + scale(1.2) + efekt pierścienia
- Focus: ten sam efekt pierścienia

**Commerce Orange**
- Tło: `#d53b00` (Commerce Orange)
- Tekst: `#ffffff`, SST 18px / 700 / śledzenie 0.45px
- Promień ramki: `999px` — pigułka
- Używany tylko dla CTA PS Store / Kup / Subskrybuj Plus
- Aktywny: tło ciemnieje do `#aa2f00`
- Hover: stosuje cyjanową regułę odwrócenia jak wszystkie inne przyciski (NIE specyficzny hover pomarańczowy)

**Przezroczysty Ghost**
- Tło: przezroczyste
- Tekst: `#1f1f1f` (Deep Charcoal)
- Ramka: `1px solid #dedede`
- Padding: `0 10px` (ciaski, zoptymalizowany pod nawigację)
- Hover: cyjanowe wypełnienie, biały tekst, 2px biała ramka, scale(1.2)
- Aktywny: tekst zmienia się na `#0072ce`, opacity 0.6

**Koło z Ikoną**
- Tło: `rgba(0, 0, 0, 0.2)` na fotografii; `#ffffff` na jasnych powierzchniach
- Promień ramki: `100%` — idealne koło
- Używany dla strzałek prev/next karuzeli i przycisków udostępniania
- Hover: rozjaśnia się do `var(--color-role-backgrounds-primary-link-hover)` (w przybliżeniu `#e5e5e5` na jasnym tle)

**Mini CTA (Wewnątrz Karty)**
- SST 14px / 700 / śledzenie 0.324px
- Padding ~8px 16px
- Promień: `999px`
- Używany wewnątrz kart gier dla mini CTA „Kup teraz" / „Dodaj do koszyka"

### Karty i Kontenery

**Karta Hero (Feature Gry)**
- Tło: fotografia/render — zazwyczaj zakotwiczone w czerni
- Promień ramki: `24px` lub `19px` dla kart feature
- Padding: 32–48px wewnętrzny
- Cień: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — dramatyczny cień używany tylko wtedy, gdy karta nakłada się na fotografię hero
- Hover: subtelna transformacja scale, cyjanowy kontur pojawia się na głównym CTA

**Kafelek Okładki Gry**
- Tło: grafika okładki gry, bez paddingu
- Promień ramki: `12px` lub `13px` (obrazy) / `19px` (ramka karty)
- Cień: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — pierzasta elewacja
- Hover: główne CTA karty zapala się cyjanem, sama karta może skalować się 1.02×
- Przejście: 200ms ease na transform

**Panel Treści (Biały)**
- Tło: `#ffffff` lub gradient jasnej sekcji `#ffffff → #f5f7fa`
- Ramka: zazwyczaj brak; oddzielony od sąsiadów przez odstępy i subtelne cienie
- Promień: `12px`–`24px` w zależności od hierarchii panelu
- Cień: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — najlżejszy w systemie

**Ciemna Karta na Ciemnym**
- Tło: `rgba(0, 0, 0, 0.2)` nad fotografią
- Promień ramki: `6px` (zwarta) lub `24px` (feature)
- Używana dla wkładek „zestawu prasowego" lub „bloku statystyk" nad hero wideo

### Pola i Formularze
- **Domyślne**: tło `#ffffff`, ramka `1px solid #cccccc`, promień ramki `3px` (ciaśniejszy niż reszta systemu — pola są jedynym miejscem, gdzie PlayStation staje się naprawdę zwarte), tekst SST 16px w `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Focus**: 2px pierścień focus `#0070cc` poprzez `box-shadow: 0 0 0 2px #0070cc`. Brak zmiany koloru ramki — pierścień wykonuje całą robotę.
- **Błąd**: ramka i tekst zmieniają się na `#c81b3a` (Warning Red), tekst błędu inline poniżej w tym samym czerwonym.
- **Przejście**: ~180ms ease na ramce i cieniu.

### Nawigacja

- **Nawigacja górna**: czarny (`#000000`) pasek na pełną szerokość z logo PlayStation (białym) wyrównanym do lewej, linkami kategorii wyśrodkowanymi w SST 14–16px / 500 i małym CTA „Zaloguj się" wyrównanym do prawej.
- **Hover na linku nawigacyjnym**: kolor przechodzi z `#ffffff` na `#1883fd` (Link Hover Blue), bez podkreślenia.
- **Aktywna sekcja**: oznaczona subtelnym 2px podkreśleniem w `#0070cc`.
- **Mobile**: nawigacja zwija się do szuflady hamburger. Wewnątrz szuflady linki układają się pionowo z odstępami 16px i poziomym paddingiem 20px.
- **Zachowanie sticky**: nawigacja pozostaje przypisana do góry podczas scrollowania; gdy wchodzi w strefę jasnej powierzchni **nie odwraca się** — przez cały czas pozostaje na czarnym tle.

### Traktowanie Obrazów

- **Proporcje**: 16:9 wideo hero/fotografia, 1:1 rendery konsoli, 3:4 grafiki okładek gier, 4:3 obrazy lifestyle.
- **Narożniki**: zaokrąglone do `12px`, `13px` lub `24px` w zależności od kontekstu karty. Okładki gier dostają `6–12px`, obrazy hero dostają `24px`.
- **Pełna szerokość**: tylko w hero nagłówka i banerach promocyjnych stopki. Wszystko inne siedzi wewnątrz wypełnionej kolumny treści.
- **Cień**: dramatyczny `rgba(0, 0, 0, 0.8) 0 5px 9px 0` na hero, pierzasty `rgba(0, 0, 0, 0.06) 0 5px 9px 0` na kafelkach siatki.
- **Hover**: obraz pozostaje statyczny, ramka karty i główne CTA reagują.
- **Lazy loading**: `loading="lazy"` na wszystkim poniżej linii zgięcia, `eager` na hero nagłówka.

### Pigułka Sklepu Gier (Charakterystyczna)
- Tło: `#ffffff`
- Tekst: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Promień: `9999px` — pełna pigułka
- Neutralna pigułka-tag znajdująca się obok okładek gier, oznaczająca platformę („PS5", „PS4", „PSVR2"). Kontrast biały-na-ciemnym.

## 5. Zasady Layoutu

### System Odstępów
- **Jednostka bazowa**: 8px.
- **Skala**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Padding sekcji**: 48–96px pionowy między głównymi panelami. Przejścia hero-do-treści używają większego końca.
- **Padding kart**: 20–32px wewnętrzny. Główne karty hero mogą rozszerzać się do 48px.
- **Odstępy inline**: 8–12px między nagłówkiem a tekstem pomocniczym, 12–16px między tekstem pomocniczym a CTA.
- **Mikro-skala**: wartości 1/2/3/4.5/5/9/10/12 są używane dla paddingu pigułek, odstępów podpisów i przesunięć ramek — nie dla rytmu redakcyjnego.

### Siatka i Kontener
- **Maksymalna szerokość**: ~1920px (wykryte breakpointy dembrandt do 2120px). Kontenery zazwyczaj ograniczone do `1280–1920px` w zależności od panelu.
- **Wzorce kolumn**: 12-kolumnowa responsywna siatka, która rozwiązuje się w wiersze kafelków gier 3/4/6-kolumnowych w zależności od hierarchii. Strefy hero często obejmują 12 kolumn; wyróżnione kafelki siedzą w konfiguracjach 6+3+3 lub 4+4+4.
- **Zewnętrzny padding**: 16px mobile → 48px tablet → 64–96px desktop.
- **Rynny**: 16–24px między kolumnami, ciaśniejsze (8–12px) wewnątrz klastrów kafelków.

### Filozofia Białej Przestrzeni
PlayStation traktuje białą przestrzeń jak marka luksusowa traktuje oświetlenie sklepu — jako sygnał premium. Między modułami jest zauważalnie więcej pionowego oddechu niż na jakiejkolwiek innej głównej witrynie handlowej, a białe panele redakcyjne często zawierają tylko jeden nagłówek + jeden obraz + jedno CTA przy paddingu w skali hero. Efekt to „tempo galerii", gdzie każdy produkt ma swój własny pokój zamiast konkurować w siatce miniaturek.

### Skala Promieni Ramki
- **2px** — przyciski banerów ciasteczkowych i małe UI administracyjne
- **3px** — pola formularzy, panele zakładek (ciaśniejsze niż wszystko inne — celowa wskazówka „funkcjonalnego UI")
- **6px** — zwarte przyciski i obrazy inline
- **12px** — standardowe obrazy okładek gier i obrazy treści
- **13px** — niektóre opakowania figure (przesunięcie o 1px od 12px dla zagnieżdżania)
- **19px** — karty feature
- **20px** — rozpiętości tagów inline
- **24px** — karty hero, główne ramki feature
- **36px** — nawigacja na pełną pigułkę i warianty przycisków drugorzędnych
- **48px** — duże przyciski feature
- **999px / 100%** — pełne pigułki głównych przycisków i okrągłe przyciski ikon

Jedenaście dyskretnych wartości promieni — jeden z najbogatszych systemów promieni jakiejkolwiek witryny w tym katalogu. Zakres istnieje, ponieważ PlayStation celowo używa różnych promieni dla różnych *hierarchii*: 3px dla użytkowości, 12px dla mediów, 24px dla feature, 999px dla CTA.

## 6. Głębia i Elewacja

| Poziom | Traktowanie | Zastosowanie |
|---|---|---|
| 0 | Brak cienia | Domyślna treść na `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Pierzasto-lekkie uniesienie panelu redakcyjnego |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Standardowa elewacja kafelka siatki |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Wyróżniona karta (hover lub aktywna) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Cień nakładki hero — dramatyczny cień używany nad fotografią |
| 5 | `0 0 0 2px #0070cc` (pierścień focus) | Stan focus głównego przycisku |
| 6 | `0 0 0 2px #000000` (pierścień hover) | Pierścień hover drugorzędnego przycisku |
| 7 | Gradient sekcji `#121314 → #000000` | Atmosferyczna głębia na ciemnych panelach hero |

Filozofia głębi PlayStation jest **warstwowa, ale powściągliwa**. Skala cieni mieści się od 0,06 do 0,16 dla normalnych stanów, następnie skacze do 0,8 dla dramatycznych cieni hero — nie ma środkowego zakresu 0,2, 0,3, 0,4. Efekt jest taki, że większość strony siedzi prawie płasko, ale gdy karta hero musi unosić się nad fotografią, naprawdę *unosi się*. Elewacja jest albo szeptana, albo wykrzyczana, nigdy mruknięta.

### Dekoracyjna Głębia
- **Gradienty sekcji** (ciemny i jasny, oba opisane powyżej) — używane tylko jako tła sekcji
- **Pierścienie focus/hover** o szerokości 2px, zawsze niebieskie lub cyjanowe w zależności od stanu
- **Brak świateł, rozmyć ani efektów atmosferycznych** poza dwoma gradientami sekcji
- **Brak gradientowych przycisków ani tekstu** — system wizualny używa jednolitych bloków kolorów wszędzie poza przejściami sekcji

## 7. Należy i Nie Należy

### Należy
- **Należy** używać PlayStation Blue (`#0070cc`) jako głównego wypełnienia CTA i kotwicy stopki. To kolor-kotwica marki.
- **Należy** używać SST wagi 300 dla każdego nagłówka display 22px i powyżej. Nagłówek o spokojnej wadze to głos.
- **Należy** stosować pełny podpis hover do każdego głównego przycisku: cyjanowe wypełnienie + 2px biała ramka + 2px niebieski zewnętrzny pierścień + `scale(1.2)`.
- **Należy** używać pełnego promienia pigułki (`999px`) na głównych i handlowych przyciskach.
- **Należy** rezerwować PlayStation Cyan (`#1eaedb`) wyłącznie dla stanów hover, focus i active — nigdy jako tło w stanie spoczynku.
- **Należy** używać Commerce Orange (`#d53b00`) tylko na CTA PlayStation Store / zakupu i wyróżnieniach cen.
- **Należy** naprzemiennie stosować ciemne panele hero z białymi panelami treści i zakotwiczać z głębokim niebieskim stopką — układ trzech naprzemiennych powierzchni to rytm strony.
- **Należy** używać dramatycznych cieni hero `rgba(0, 0, 0, 0.8)` gdy karta nakłada się na fotografię produktową.
- **Należy** utrzymywać górną nawigację czarną na każdej pozycji scrolla — nie odwraca się na biało nad jasnymi panelami.

### Nie Należy
- **Nie należy** pogrubiać nagłówków display. Waga 300 w zakresie 22–54px to głos PlayStation. Typografia display w wadze 700 czyta się jak „kolejny sprzedawca gier".
- **Nie należy** używać etykiet ani kickerów WIELKIMI LITERAMI. PlayStation rzadko używa wielkich liter — to marka o spokojnym autorytecie, nie ostrzeżenie drogowe.
- **Nie należy** używać gradientowych przycisków, tekstu ani tła poza dwoma zadeklarowanymi gradientami sekcji.
- **Nie należy** wprowadzać ciepłych kolorów poza Commerce Orange. Brak czerwonych CTA, żółtych wyróżnień, zielonych pigułek sukcesu.
- **Nie należy** używać kwadratowych narożników na przyciskach lub mediach. System ma jedenaście promieni — wybierz jeden, ale nigdy `0`.
- **Nie należy** pomijać ruchu hover `scale(1.2)` na głównych przyciskach. Uniesienie przez skalowanie to podpis interakcji marki.
- **Nie należy** używać szeryfów. System jest w 100% SST sans.
- **Nie należy** pozwalać, by cyjan `#1eaedb` pojawiał się jako kolor tekstu lub tła w stanie spoczynku. Istnieje tylko w ruchu.
- **Nie należy** projektować paneli, które walczą o uwagę. Rytm białej przestrzeni PlayStation daje każdemu modułowi własny „pokój galerii".

## 8. Zachowanie Responsywne

### Breakpointy

| Nazwa | Szerokość | Kluczowe Zmiany |
|---|---|---|
| Small Mobile | <400px | Jedna kolumna, nawigacja zwija się do hamburger, hero SST skaluje się do ~28px |
| Mobile | 400–599px | Jedna kolumna, kafelki układają się na pełną szerokość, padding otwiera się do 16px |
| Large Mobile | 600–767px | Nadal jedna kolumna, ale opcja 2-kolumnowych kafelków w wybranych modułach |
| Tablet Portrait | 768–1023px | 2-kolumnowa siatka gier, nawigacja nadal skrócona |
| Tablet Landscape | 1024–1279px | Siatka 3–4 kolumn, pełna nawigacja przywrócona |
| Desktop | 1280–1599px | Pełna siatka redakcyjna, maksymalna skala wyświetlacza hero (44–54px) |
| Large Desktop | 1600–1919px | Kontener ogranicza się do 1600px, marginesy rozszerzają się |
| 4K / Big-Screen | ≥1920px | Kontener rozszerza się do maksymalnie 1920px, treść hero skaluje się, by dopasować odległość oglądania TV |
| Ultra-Wide | ≥2120px | Skrajny breakpoint — strona pozostaje zakotwiczona, zewnętrzne marginesy absorbują dodatkową szerokość |

Skanowanie dembrandt wykryło 30 breakpointów między 320px a 2120px — niezwykle szeroki zakres responsywny. PlayStation dostosowuje się specjalnie do **kontekstów dużego ekranu** (1920–2120px), ponieważ właściciele PS5 często przeglądają witrynę na telewizorach za pośrednictwem przeglądarki konsoli lub przez cast-to-TV ze smartfona. Większość witryn handlowych zatrzymuje dostosowywanie na 1440px; PlayStation kontynuuje przez 4K.

### Cele Dotykowe
- Główne przyciski-pigułki mają ~48–56px wysokości (tekst SST 18px + ~12–16px pionowego paddingu) — wygodnie spełniające WCAG AAA.
- Linki nawigacyjne są mniejsze (~32–40px wysokości) na desktopie; na mobile wypełniają się do 48px+ wewnątrz szuflady.
- Okrągłe przyciski ikon mają 40–48px — przyjazne dla dotyku.

### Strategia Składania
- **Nawigacja**: pełna nawigacja → skrócona → szuflada hamburger w miarę zwężania się viewport. Logo pozostaje przypisane do lewej; CTA pozostaje przypisane do prawej.
- **Siatka**: 6-kol → 4-kol → 3-kol → 2-kol → 1-kol. Karty kafelków gier przepływają bez przycinania grafiki okładki.
- **Odstępy**: padding sekcji zacieśnia się od 96px → 64px → 48px → 32px → 24px w miarę zwężania się viewport.
- **Typografia**: hero SST skaluje się od 54px → 44px → 35px → 28px → 22px. Lekka waga 300 jest zachowana przy każdym rozmiarze.
- **Fotografia hero**: zmiana art-direction — desktop używa szerokich przycinań 16:9, mobile używa przycinań 4:3 lub 1:1 z produktem na środku.

### Zachowanie Obrazów
- Responsywny raster (`srcset` + `<picture>` z art-direction), proporcje zachowane na każdy breakpoint.
- Gotowość na 4K: witryna serwuje wysokogęstościowe obrazy przy 1920px+ by uniknąć upscalingu podczas przeglądania na TV.
- `loading="lazy"` na wszystkim poniżej linii zgięcia; hero jest `eager` z podpowiedzią preload.

## 9. Przewodnik po Promptach dla Agenta

### Szybki Odnośnik Kolorów
- **Główne CTA**: „PlayStation Blue (`#0070cc`)"
- **Akcent Hover / Focus**: „PlayStation Cyan (`#1eaedb`)"
- **Tło (Jasna Powierzchnia)**: „Paper White (`#ffffff`)"
- **Tło (Ciemna Powierzchnia)**: „Console Black (`#000000`)"
- **Tekst Nagłówka na Białym**: „Display Ink (`#000000`)"
- **Tekst Treści na Białym**: „Deep Charcoal (`#1f1f1f`)"
- **Tekst Treści na Czarnym**: „Inverse White (`#ffffff`)"
- **Akcent Handlowy / Kup**: „Commerce Orange (`#d53b00`)"
- **Kotwica Stopki**: „PlayStation Blue (`#0070cc`)"

### Przykładowe Prompty Komponentów
1. *„Utwórz główny przycisk CTA z wypełnieniem PlayStation Blue `#0070cc`, białym tekstem w SST 18px / 500 / śledzenie 0.4px, promieniem ramki 999px, paddingiem 12px × 24px. Przy hover tło przechodzi na `#1eaedb` PlayStation Cyan, pojawia się 2px ramka `#ffffff`, via box-shadow rozkwita 2px zewnętrzny pierścień `#0070cc`, a cały przycisk skaluje się 1,2× — wszystko w przejściu 180ms ease."*
2. *„Zaprojektuj panel hero na płótnie Console Black `#000000` z nagłówkiem 54px SST wagi 300 w `#ffffff` ze śledzeniem -0.1px i interliniowaniem 1.25. Umieść jedno główne CTA poniżej ze standardowym efektem hover PlayStation. Żadnych etykiet WIELKIMI LITERAMI gdziekolwiek."*
3. *„Zbuduj kafelek okładki gry: obraz w proporcji 3:4 z promieniem ramki 12px, pierzastym cieniem `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, tytułem 14px SST 700 poniżej, tagiem platformy 12px SST 500 i mini głównym CTA 14px / 700 / śledzenie 0.324px w PlayStation Blue."*
4. *„Utwórz przycisk-pigułkę handlową dla zakupu w PlayStation Store: wypełnienie Commerce Orange `#d53b00`, tekst `#ffffff` w SST 18px / 700 / śledzenie 0.45px, promień 999px, padding 12px × 28px. Stan aktywny ciemnieje do `#aa2f00`. Hover stosuje standardowe cyjanowe odwrócenie ze skalowaniem 1,2×."*
5. *„Zaprojektuj biały panel treści między ciemnymi sekcjami hero: tło `#ffffff` z subtelnym gradientem jasnej sekcji `#ffffff → #f5f7fa`, promieniem ramki 24px, paddingiem wewnętrznym 48px, pierzastą elewacją `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, nagłówkiem 35px SST 300, akapitem treści 18px i jednym głównym CTA."*

### Przewodnik po Iteracji
Podczas udoskonalania istniejących ekranów wygenerowanych w tym systemie projektowym:
1. **Audytuj wagę display.** Każdy nagłówek 22px i powyżej powinien być SST wagi 300. Jeśli widzisz wagę 500 lub 700 w skali hero, utraciłeś głos PlayStation.
2. **Audytuj efekt hover.** Każdy główny przycisk musi skalować się 1,2× przy hover z kombinacją cyjanowe-wypełnienie + biała-ramka + niebieski-pierścień. Pominięcie któregokolwiek z tych czterech elementów psuje podpis interakcji.
3. **Audytuj narożniki.** Każdy kontener i przycisk powinien lądować na 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 lub 999px / 100%. Kwadratowe narożniki psują głos.
4. **Audytuj rozlewanie kolorów.** W chrome powinny pojawiać się tylko PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`) oraz zadeklarowane szarości/czerni/biele. Jeśli widzisz jakikolwiek inny odcień, popraw go.
5. **Audytuj naprzemienność powierzchni.** Strona powinna naprzemiennie przechodzić ciemne hero → biała treść → ciemne hero → biała treść → niebieski stopka. Jeśli dwa panele tej samej powierzchni sąsiadują ze sobą, wstaw przejście.
6. **Audytuj wielkie litery.** Tylko styl zdaniowy i tytułowy. Żadnych etykiet, przycisków ani kickerów WIELKIMI LITERAMI. Jeśli widzisz wielkie litery, przekonwertuj je.
7. **Audytuj wagę cieni.** Krycie cieni powinno lądować na 0,06 / 0,08 / 0,16 / 0,8 — nic pomiędzy. Jeśli widzisz cienie 0,1, 0,2, 0,3, 0,5, popraw do najbliższego zadeklarowanego poziomu.
8. **Audytuj białą przestrzeń.** Jeśli dwa moduły wydają się „konkurencyjne" (walczące o uwagę), dodaj 48–96px pionowego oddechu. Rytm tempa galerii PlayStation jest nienaruszalny.
