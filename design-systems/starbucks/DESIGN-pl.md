# System Projektowania Inspirowany Starbucks

> Category: E-Commerce i Handel Detaliczny
> Globalna marka kawiarni. Czterostopniowy system zieleni, ciepłe kremowe tło, przyciski w pełni zaokrąglone.

## 1. Temat Wizualny i Atmosfera

System projektowania Starbucks to **ciepła, pewna siebie wizytówka sieci detalicznej**, w której zieleń fartuchów sklepowych przenika każdy element. Tło naprzemiennie łączy neutralno-ciepły krem (`#f2f0eb`) z ceramiczną bielą (`#edebe9`) — barwy te nawiązują do prawdziwych materiałów użytych w kawiarniach: papierowych serwetek, ścian, wykończeń drewnianych — podczas gdy sygnaturowa **Starbucks Green** (`#006241`) zakotwicza markę w strefach hero, CTA oraz w doświadczeniu Rewards. Zieleń występuje w czterech kalibrowanych odcieniach (Starbucks, Accent, House, Uplift), z których każdy jest przypisany do konkretnej roli powierzchni, a złoto (`#cba258`) pojawia się wyłącznie w ceremoniach statusu Rewards — nie jako ogólny kolor akcentowy.

Typografia niesie większość głosu marki. Firmowy krój **SoDoSans** (własność Starbucks) pokrywa niemal każdą powierzchnię z ciasnym odstępem `-0.16px` między literami — czyta się pewnie i przyjaźnie, bez surowości typową dla magazynów modowych. Co ciekawe: strona Rewards przełącza się na ciepły szeryfowy krój (`"Lander Tall", "Iowan Old Style", Georgia`) dla wybranych nagłówków, subtelnie nawiązując do nostalgicznego klimatu tablicy kredowej w kawiarni. Natomiast strony Careers stosują odręczny skrypt (`"Kalam", "Comic Sans MS", cursive`) do personalizowanych dotknięć z nazwą na kubku. Trzy kroje, trzy konteksty — system jest zdyscyplinowany co do tego, kiedy każdy z nich się pojawia.

Powierzchnie oddychają dzięki zaokrąglonej geometrii. Każdy przycisk to pełna pigułka o promieniu 50px. Karty mają zaokrąglone prostokąty 12px. Pływający przycisk CTA „Frap" — okrągły przycisk zamówienia o średnicy 56px w kolorze Green Accent (`#00754A`) — to sygnaturowy element głębi produktu: unosi się w prawym dolnym rogu z warstwową stertą cieni (`0 0 6px rgba(0,0,0,0.24)` bazowy + `0 8px 12px rgba(0,0,0,0.14)` otoczenie) i kurczy się przez `scale(0.95)` po naciśnięciu. Poza tym cienie są powściągliwe — cienie kart pozostają przy szeptanej przezroczystości `0.14/0.24`, a globalna nawigacja ma spokojny trójwarstwowy stos cieni. Cały system sprawia wrażenie czystego szyldowania kawiarni: czytelny, ciepły i nigdy nie krzyczący.

**Kluczowe Cechy Charakterystyczne:**
- Czterostopniowy system zieleni marki (Starbucks / Accent / House / Uplift), z których każdy jest przypisany do odrębnej roli powierzchni — nie ma jednej „zieleni marki"
- Złoto zarezerwowane wyłącznie dla momentów statusu Rewards; nigdy jako ogólny kolor akcentowy
- Ciepło-neutralne tło (`#f2f0eb` / `#edebe9`) zamiast zimnej bieli — nawiązanie do materiałów kawiarni
- Firmowy krój (SoDoSans) z ciasnym odstępem `-0.16px` jako powszechny głos
- Kontekstowe zmiany kroju: szeryfowy (Lander Tall) dla Rewards, skrypt (Kalam) dla nazw na kubkach w Careers
- Przyciski w pełni zaokrąglone (`50px` promień) wszędzie, `scale(0.95)` przy aktywnym naciśnięciu jako sygnaturowa mikrointerakcja
- Pływający okrągły przycisk CTA „Frap" (`56px`, wypełnienie Green Accent, warstwowy stos cieni) — sygnaturowy element elewacji produktu
- Powierzchnie kart podarunkowych zaprojektowane jako **sfotografowany fizyczny produkt** — każda karta to oddzielna ilustrowana fotografia, a nie wygenerowana grafika
- Promień kart 12px + szeptanie miękkich cieni utrzymują karty płasko z subtelnym uniesieniem
- Skala odstępów oparta na rem zakotwiczona przy 1.6rem (~16px) = `--space-3`, sięgając do 6.4rem (~64px)

**Rytm strony w blokach kolorystycznych:** Kremowe hero → Białe sekcje treści → Ciemnozielony pas (`#1E3932`) z białym tekstem → Kremowa strefa użytkowa → Ciemnozielona stopka (`#1E3932`) ze złotym/białym tekstem — espresso-ciemne obramowanie wokół jasnego korpusu.

## 2. Paleta Barw i Role

**Analizowane strony źródłowe:** strona główna, rewards, karty podarunkowe, szczegóły produktu (Pink Energy Drink), wartości odżywcze produktu (Cold Brew).

### Podstawowe

- **Starbucks Green** (`#006241`): Historyczna zieleń marki. Używana w nagłówkach h1, głównych nagłówkach sekcji na stronie Rewards i jako główny sygnał marki wszędzie tam, gdzie potrzebny jest jeden dominujący kolor.
- **Green Accent** (`#00754A`): Nieco jaśniejsza, bardziej świetlista zieleń. Główny kolor wypełnionych CTA („Explore our afternoon menu", „See the spring menu") oraz wypełnienie pływającego okrągłego przycisku Frap.
- **House Green** (`#1E3932`): Głęboka, niemal czarna zieleń marki. Powierzchnia stopki, tła pasów funkcji, ciemne powierzchnie statusu reward oraz pas hero z nagłówkiem „Free coffee is just the beginning" na stronie Rewards.
- **Green Uplift** (`#2b5148`): Pomocnicza ciemnozielona zieleń, stosowana oszczędnie w dekoracyjnych akcentach i momentach ciemnego gradientu.
- **Green Light** (`#d4e9e2`): Blado-miętowe wypełnienie stosowane do odcieni stanu poprawnego formularza i jasnych zielonych powierzchni użytkowych.

### Wtórne i Akcentowe

- **Gold** (`#cba258`): Zarezerwowane niemal wyłącznie dla ceremoniałów statusu Rewards — komunikaty poziomu Gold, odznaki partnerów (SkyMiles, Bonvoy) i akcenty premium. Nigdy ogólny kolor marki.
- **Gold Light** (`#dfc49d`): Delikatniejsze złoto do wypełnień tła w sekcjach złotego poziomu.
- **Gold Lightest** (`#faf6ee`): Kremowo-złote wypełnienie powierzchni strony pod sekcjami partnerskich na stronie Rewards — łączy złoty akcent z powrotem z ciepłym neutralnym systemem.

### Powierzchnie i Tła

- **White** (`#ffffff`): Główna powierzchnia kart i modali. Również wypełnienie kart na kafelkach kart podarunkowych.
- **Neutral Cool** (`#f9f9f9`): Subtelna chłodna szara powierzchnia używana w menu rozwijanych (menu „Account"), opakowaniach kart formularzy i spokojnych kontenerach użytkowych.
- **Neutral Warm** (`#f2f0eb`): Ciepły krem jako **główne tło strony** dla stref użytkowych Rewards i pasów hero.
- **Ceramic** (`#edebe9`): Nieco cieplejszy/ciemniejszy krem do separatorów stref, delikatnych wypełnień sekcji i pasa partnerskiego Rewards.
- **Black** (`#000000`): Głęboki tusz zarezerwowany dla ciemnego pasa CTA na szczycie strony („Join now") i przycisków logowania w górnej nawigacji o wysokim kontraście.

### Neutralne i Tekst

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Główny kolor nagłówków i tekstu podstawowego na jasnych powierzchniach. Nie czysta czerń — czarny o przezroczystości 87%, który czyta się cieplej.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Tekst pomocniczy/metadane na jasnych powierzchniach.
- **Text White** (`rgba(255, 255, 255, 1)`): Główny kolor nagłówków/tekstu na ciemnozielonych powierzchniach.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Tekst pomocniczy na ciemnozielonych powierzchniach — opisy linków w stopce, tekst podpisów.
- **Rewards Green** (`#33433d`): Dedykowana stonowana łupkowo-zielona używana wyłącznie w blokach tekstowych strony Rewards — nieco „zakurzona" barwa do czytania, w odróżnieniu od Text Black, sygnalizująca „powierzchnię reward" bez korzystania z pełnej Starbucks Green.

### Semantyczne i Akcentowe

- **Red** (`#c82014`): Stan błędu i destrukcyjny (nieprawidłowy formularz, działania destrukcyjne).
- **Yellow** (`#fbbc05`): Stan ostrzeżenia, historyczny akcent marki.
- **Green Light** (`#d4e9e2` przy 33% przezroczystości = `hsl(160 32% 87% / 33%)`): Odcień tła dla pola formularza w stanie poprawnym.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Odcień pola nieprawidłowego w formularzach.

### Drabiny Alpha Czerń/Biel

Dwie równoległe półprzezroczyste skale do nakładek i tekstu pomocniczego:
- `rgba(0,0,0,0.06)` do `rgba(0,0,0,0.90)` krokami co 10% — dla ciemnych nakładek na jasnych powierzchniach
- `rgba(255,255,255,0.10)` do `rgba(255,255,255,0.90)` krokami co 10% — dla jasnych nakładek na ciemnych powierzchniach

### System Gradientów

Nie zaobserwowano strukturalnych tokenów gradientu. Hierarchia powierzchni jest przez cały czas oparta na jednolitych blokach kolorystycznych — system opiera się na swojej pięciopoziomowej palecie powierzchni krem/zieleń, a nie na gradientach.

## 3. Zasady Typografii

### Rodzina Czcionek

- **Podstawowa:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — firmowy krój korporacyjny Starbucks, stosowany niemal na każdej powierzchni
- **Zastępcza podczas ładowania:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — to, co użytkownicy widzą przed załadowaniem SoDoSans
- **Szeryfowa Rewards:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — używana w wybranych nagłówkach strony Rewards dla ciepłego, redakcyjnego odczucia
- **Skrypt Careers:** `"Kalam", "Comic Sans MS", cursive` — używana wyłącznie do dekoracyjnych „nazw na kubku" na stronach Careers, nawiązując do ręcznie pisanych imion na kubkach Starbucks

Brak jawnie aktywowanych zestawów stylów OpenType w `:root`.

### Hierarchia

| Rola | Rozmiar | Grubość | Wysokość linii | Odstęp liter | Uwagi |
|------|---------|---------|----------------|--------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | Największy display Rewards/hero |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Pomocnicze nagłówki hero |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Nagłówki sekcji landing |
| H1 | 24px | 600 | 36px | -0.16px | Główny nagłówek w kolorze Starbucks Green |
| H2 | 24px | 400 | 36px | -0.16px | Tytuł sekcji zwykłą grubością w Text Black |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Tekst wprowadzający hero, treść pasa funkcji |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Domyślny tekst podstawowy |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Etykieta przycisku, metadane, etykiety formularzy |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Aktywny stan pływającej etykiety, mikrotekst podpisów |
| Button Label | 14–16px | 400–600 | 1.2 | -0.01em | Wszystkie etykiety przycisków pigułkowych |

**Tokeny odstępu liter:**
- `letterSpacingNormal`: `-0.01em` (domyślny — ciasny, charakterystyczny)
- `letterSpacingLoose`: `0.1em` (podkreślone wielkie litery)
- `letterSpacingLooser`: `0.15em` (etykiety w stylu wersalikowym, ekstremalne podkreślenie)

**Tokeny wysokości linii:**
- `lineHeightNormal`: `1.5` (tekst podstawowy)
- `lineHeightCompact`: `1.2` (display/przyciski)

### Zasady

- **Ciasne ujemne interlinie (`-0.01em`)** są stosowane niemal powszechnie — cały produkt czyta się nieco skompresowanie, co nadaje SoDoSans pewną obecność bez poczucia ściśnięcia.
- **Zmiany grubości niosą hierarchię, nie zmiany rozmiaru.** H1 i H2 mają ten sam rozmiar 24px/36px; oddzielają je tylko grubość (600 vs 400) i kolor (Starbucks Green vs Text Black).
- **Tokeny rozmiaru używają rem, zakotwiczone przy `1rem = 10px`** na tej stronie (za pomocą sztuczki `font-size: 62.5%` na elemencie root). Zatem `1.6rem` = 16px, `2.4rem` = 24px itd. Skala jest semantyczna (textSize-1 do textSize-10), a nie oparta na arbitralnych wartościach pikselowych.
- **Kontekstowe zamiany kroju** — szeryfowy w Rewards, skrypt w Careers — są celowe i zlokalizowane. Nigdy nie należy mieszać ich z podstawowym bezszeryfowym w tej samej powierzchni.
- **Tekst podstawowy nigdy nie jest czystą czernią** — ma wartość `rgba(0,0,0,0.87)`, aby dopasować się do temperatury ciepło-neutralnego tła.

### Uwaga o Zastępczych Czcionkach

SoDoSans jest wyłączną własnością Starbucks (licencja od House Industries, niedostępna publicznie). Rozsądne open-source'owe zamienniki:
- **Inter** (Google Fonts) — podobne humanistyczne proporcje geometryczne, szeroki zakres grubości
- **Manrope** — nieco bardziej zaokrąglony, podobne pewne odczucie
- **Nunito Sans** — cieplejszy, dobry jako zamiennik dla marki w stylu „kawiarni"

Przy zastępowaniu należy sprawdzić, czy ciasny tracking `-0.01em` / `-0.16px` nadal dobrze się czyta; niektóre open-source'owe czcionki wymagają zamiast tego `-0.005em`.

Lander Tall (szeryfowy Rewards) jest niestandardowy — open-source'owe zamienniki: **Iowan Old Style** (już w zestawie zastępczym), **Lora** lub **Source Serif Pro**. Kalam (skrypt Careers) jest dostępny bezpośrednio na Google Fonts.

## 4. Stylizacja Komponentów

### Przyciski

**1. Wypełniony Podstawowy — „Explore our afternoon menu / Sign up for free"**
- Tło: `#00754A` (Green Accent)
- Tekst: `#ffffff`
- Obramowanie: `1px solid #00754A`
- Promień: `50px` (pełna pigułka)
- Padding: `7px 16px`
- Czcionka: SoDoSans, 16px, grubość 600, odstęp liter `-0.01em`
- Stan aktywny: `transform: scale(0.95)` przez `--buttonActiveScale`
- Przejście: `all 0.2s ease`

**2. Obrysowany Podstawowy — „Give them a try / Start an order"**
- Tło: transparent
- Tekst: `#00754A` (Green Accent)
- Obramowanie: `1px solid #00754A`
- Ten sam promień/padding/aktywny/przejście co Wypełniony Podstawowy

**3. Czarny Wypełniony — „Join now"**
- Tło: `#000000`
- Tekst: `#ffffff`
- Obramowanie: `1px solid #000000`
- Promień: `50px`, Padding: `7px 16px`
- Czcionka: 14px, grubość 600
- Używany na pasku dołączania u góry strony i podobnych momentach konwersji

**4. Ciemny Obrysowany — „Sign in"**
- Tło: transparent
- Tekst: `rgba(0, 0, 0, 0.87)` (Text Black)
- Obramowanie: `1px solid rgba(0, 0, 0, 0.87)`
- Promień: `50px`, Padding: `7px 16px`
- Czcionka: 14px, grubość 600

**5. Zielony na Zielonym Odwrócony — „See the spring menu"**
- Tło: `#ffffff`
- Tekst: `#00754A`
- Obramowanie: `1px solid #ffffff`
- Używany gdy powierzchnia za przyciskiem to ciemnozielony pas House Green — biały przycisk z zielonym tekstem zamiast wypełnionej zielonej pigułki na zielonym tle

**6. Obrysowany na Ciemnym — „Learn more / Order now"**
- Tło: transparent
- Tekst: `#ffffff`
- Obramowanie: `1px solid #ffffff`
- Używany na ciemnozielonych pasach funkcji dla akcji drugorzędnej sparowanej z białym wypełnionym CTA

**7. Zgoda (ciemnozielony wariant)**
- Tło: `rgb(0, 130, 72)` (specyficzny wariant zieleni używany w module zgody na cookies)
- Tekst: `#ffffff`
- Brak obramowania, promień `50px`, padding `7px 16px`, 14px / grubość 400
- Nieco jaśniejszy niż Green Accent — zarezerwowany dla akcji Zgody w banerze zgody

**8. Frap — Pływający Okrągły Przycisk Zamówienia**
- Tło: `#00754A` (Green Accent)
- Ikona: `#ffffff`
- Rozmiar: `5.6rem / 56px` (standardowy), `4rem / 40px` (wariant mini)
- Promień: `50%` (pełne koło)
- Stały dolny prawy, offset dotykowy `-0.8rem` dla dodatkowego komfortu klikania
- Stos cieni: bazowy `0 0 6px rgba(0,0,0,0.24)` + otoczeniowy `0 8px 12px rgba(0,0,0,0.14)`
- Stan aktywny: cień otoczeniowy zanika do `0 8px 12px rgba(0,0,0,0)`
- To sygnaturowy element elewacji produktu — unosi się nad każdą przewijaną powierzchnią

**9. Pełnoszerokościowa Zakładka Opinii — „Provide feedback"**
- Tło: `#00754A`
- Tekst: `#ffffff`
- Promień: `12px 12px 0px 0px` (zaokrąglony tylko od góry)
- Padding: `8px 16px`
- Czcionka: 14px, grubość 400
- Pozycjonowany stały dolny-prawy-wewnętrzny, przylegający do krawędzi okna

### Karty i Kontenery

**Karta Treści (domyślna)**
- Tło: `#ffffff` (`--cardBackgroundColor`)
- Promień: `12px` (`--cardBorderRadius`)
- Cień: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Używana dla: kart funkcji, kafelków pozycji menu, paneli statusu reward

**Kafelek Karty Podarunkowej**
- Tło: ilustrowana fotografia wypełnia kartę (bez jednolitego tła)
- Promień: podobny do kart (`~12px`, nieco mniejszy na narożnikach)
- Cień: lżejszy niż domyślna karta — są traktowane jak fizyczne karty ułożone na płótnie
- Oznaczone kategorią nad siatką kart (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Karty Statusu Rewards (sygnatura strony Rewards)**
- Trzykolumnowa siatka: Bronze / Gold / Silver — każdy ciemnozielony panel (`#1E3932`) z:
  - Kolorowym pierścieniem nagłówka gradientu/koloru
  - Numerowaną odznaką „Level"
  - Tytułem statusu dużą grubością SoDoSans 600
  - Listą gwiazdek/korzyści w białym/półprzezroczystym białym tekście
  - Podpisem postępu „As you earn more stars…" na dole

**Karta Partnerska (Rewards)**
- Tło: `#faf6ee` (Gold Lightest) ciepłokremowa powierzchnia
- Treść: logo partnerów („SkyMiles", „Bonvoy") wyśrodkowane, z opisowym tekstem poniżej
- Promień i cień zgodne ze specyfikacją domyślnej karty

**Menu Rozwijane (menu Account, górna nawigacja)**
- Tło: `#f9f9f9` (Neutral Cool)
- Pozycje menu przy `24px / grubość 400` w Text Black
- Brak obramowania — tylko zmiana powierzchni tła wobec białej nawigacji

**Modal**
- Padding: `2.4rem` (`--modalPadding`)
- Padding górny: `8.8rem` (`--modalTopPadding`) — pozostawia miejsce na przycisk zamknięcia / nagłówek
- Łączny pionowy padding: `11.2rem`
- Promień dziedziczy ze specyfikacji karty (`12px`)

### Inputy i Formularze

**Input z Pływającą Etykietą**
- Etykieta unosi się nad obramowaniem inputu po skupieniu/wypełnieniu
- Rozmiar czcionki etykiety na desktopie: `1.9rem` domyślny, animuje się do `1.4rem` gdy aktywny
- Rozmiar czcionki etykiety na urządzeniach mobilnych: `1.6rem` domyślny, animuje się do `1.3rem` gdy aktywny
- Poziomy offset etykiety: `12px` od lewej
- Tłumaczenie aktywnej etykiety: w górę do `-12px` z tłumaczeniem Y `-50%`
- Padding pola: `12px`
- Poziomy padding formularza: `1.6rem`
- Walidacja: poprawne pole otrzymuje odcień `rgba(green-light, 0.33)`; nieprawidłowe pole otrzymuje odcień `rgba(red, 0.05)`
- Przejście: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` przy zaznaczonym inpucie

**Ikona Opcji (checkbox/radio)**
- Padding: `3px` wewnętrzny
- Używa powyższej animacji cubic-bezier dla zaznaczonego inputu (krzywa z lekkim „sprężystym" przebiegnięciem 2.32)

### Nawigacja

**Globalna Nawigacja (górny pasek)**
- Stała pozycja z progresywnymi wysokościami: `64px` xs → `72px` mobile → `83px` tablet → `99px` desktop
- Stos cieni: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — trójwarstwowe miękkie uniesienie
- Lewa: logotyp Starbucks, przesunięty o `99px` (md) / `131px` (lg) od lewej krawędzi
- Podstawowe linki inline w SoDoSans grubość 400–600: Menu · Rewards · Gift Cards
- Prawa: Link „Find a store" + „Sign in" (obrysowany) + „Join now" (czarny wypełniony)

**Subnavigacja (drugi pasek, np. wewnętrzna Rewards)**
- Wysokość: `53px` (globalna subnavigacja) / `48px` (wewnętrzna subnavigacja)
- Zazwyczaj pozioma grupa zakładek poniżej globalnej nawigacji

**Nawigacja Mobilna**
- Zwija się do szuflady hamburgerowej poniżej punktu przełamania tablet
- Pływający przycisk Frap pozostaje w prawym dolnym rogu niezależnie od stanu nawigacji

### Obróbka Obrazów

- **Fotografie hero**: Zdjęcia produktów (napoje w przezroczystym szkle z kolorowymi tłami — koralowe, szałwiowe, ciepły bursztyn) zajmują ~40vw układu podzielonego hero; tekst zajmuje pozostałe 60vw (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Ilustracje kart podarunkowych**: Każda karta to oddzielna ilustrowana fotografia (malowany styl, rysunek ręczny, ciepła paleta barw). Nigdy generyczne grafiki.
- **Fotografie ceremonii Rewards**: Fotografie ekranów aplikacji Starbucks Rewards trzymanych w dłoni, kompozycje ukośne — fotografia produktu w kontekście.
- **Miniatury menu**: Kwadratowe lub 4:3 fotografie produktów na czystych białych/kremowych tłach, lekki miękki cień wokół szkła.
- **Pojawianie się obrazów**: Przejście `opacity 0.3s ease-in` przy ładowaniu obrazu (`--imageFadeTransition`).

### Pas Funkcji (ciemnozielony pas hero)

Pełnoszerokościowy pas `#1E3932` (House Green) z:
- Lewa: biały nagłówek + podtytuł + rząd CTA
- Prawa: fotografia produktu lub ilustracja
- Proporcja podziału ~40/60 lub 50/50 w zależności od sekcji
- Biały tekst przez cały czas z `rgba(255,255,255,0.70)` dla tekstu pomocniczego
- CTA zgodne z parą Zielony na Zielonym Odwrócony (biały wypełniony) + Obrysowany na Ciemnym (biały kontur)

### Expander / Akordeon

- Czas trwania: `300ms` (`--expanderDuration`)
- Krzywa czasowa: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — mierzone ease-out
- Używany w sekcjach FAQ na stronach Rewards i karty podarunkowej

### Moduł Zgody na Cookies

Ciemnozielona karta modalu u góry strony z przyciskami „Agree" (zielony wypełniony) i „Manage preferences" (obrysowany). Pojawia się przy pierwszej wizycie; możliwe do odrzucenia.

### Komponenty Szczegółów Produktu (sygnaturowy klaster PDP)

Powtarzający się klaster komponentów używany na stronach produktów menu (np. `/menu/product/40498/iced` dla szczegółów napoju, `/menu/product/.../nutrition` dla wartości odżywczych). Rozszerzają one inwentarz komponentów bez zmiany tokenów.

**Selektor Rozmiarów**
- Poziomy rząd 4 przycisków-ikon kubków (Tall / Grande / Venti / Trenta)
- Każda pozycja: sylwetka kubka u góry, nazwa rozmiaru poniżej (16/700 w kolorze Starbucks Green), podpis w uncjach płynnych (13/400 w Text Black Soft)
- Stan aktywny: zielony okrągły kontur (`2px solid #00754A`) wokół wybranej ikony kubka
- Nieaktywny: brak konturu, ta sama typografia
- Pełnoszerokościowy rząd, równe odstępy
- Promień kontenera: `12px` lub płaski; pojedyncze ikony mają kształt `50%` okrągły
- Padding: `16px 24px` wewnętrzny

**Wybór Dodatku/Mleka (obrysowany prostokąt)**
- Tło: `#ffffff`
- Obramowanie: `1px solid #d6dbde` (Input Border)
- Promień: `4px`
- Pełnoszerokościowy w swojej kolumnie
- Pływająca etykieta nad górnym obramowaniem: „Add-ins" / „Milk" / „Add-ins" — 13/700 w Text Black, wielkie litery, odstęp liter `0.325px`
- Wartość wyświetlona wyśrodkowana (np. „Ice", „Coconut", „Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Ikona chevron-down po prawej stronie w Text Black Soft
- Skupienie: obramowanie zmienia się na Green Accent (`#00754A`)

**Numeryczny Stepper**
- Osadzony wewnątrz wiersza Dodatku gdy wymagana jest ilość (np. porcja Strawberry Fruit Inclusions)
- Przycisk `−` + liczba + przycisk `+`, wszystkie inline po prawej stronie etykiety
- Przyciski: okrągłe `32×32px` z obramowaniem `1px solid #d6dbde`, neutralna szara ikona
- Liczba: 16/700 Text Black wyśrodkowana

**Przycisk Dostosowania**
- Tło: `#ffffff`
- Tekst: `#00754A` (Green Accent)
- Obramowanie: `1.5px solid #00754A`
- Promień: `50px` (pełna pigułka)
- Padding: `14px 40px` (hojnie większy niż domyślne pigułki — to drugorzędna akcja podstawowa)
- Etykieta: „Customize" z ikoną złotej iskierki ✨ wstawioną po lewej
- Używany dla: wejścia w przepływ dostosowywania napoju po wyborze rozmiaru/mleka

**Przycisk Dodania do Zamówienia (PDP)**
- Tło: `#00754A` (Green Accent)
- Tekst: `#ffffff`
- Promień: `50px`
- Padding: `14px 32px`
- Przypięty w prawym górnym rogu karty produktu i/lub wyrównany do prawej w paśmie dostępności w sklepie
- Takie samo zachowanie aktywne scale(0.95) jak inne podstawowe CTA

**Pigułka Kosztu Rewards — „200★ item"**
- Tło: transparent
- Obramowanie: `1px solid #cba258` (Gold)
- Tekst: `#cba258` (Gold)
- Promień: `50px` (pełna pigułka)
- Padding: `4px 12px`
- Treść: „200★ item" gdzie `★` to mała wypełniona gwiazdka — wskazuje wymaganą liczbę Stars Rewards do realizacji tego produktu
- Czcionka: Proxima Nova 13/700 z odstępem liter `0.5px`
- Używana tylko dla produktów realizowalnych z Rewards

**Pas Opisu Produktu**
- Pełnoszerokościowy ciemnozielony pas (`#1E3932` House Green)
- Zawiera od góry do dołu:
  1. Pigułka Kosztu Rewards (złota) jeśli dotyczy
  2. Opis produktu w białym tekście podstawowym (16/400/1.5)
  3. Podsumowanie wartości odżywczych inline („140 calories, 25g sugar, 2.5g fat") z tooltip ikony informacji — 14/700 biały
  4. Przycisk pigułkowy obrysowany biały na zielonym „Full nutrition & ingredients list"
- Padding: `32px` pionowy
- Pojawia się pod głównym pasem nagłówka produktu

**Tabela Składników/Wartości Odżywczych**
- Dwukolumnowy układ na stronie Odżywienia
- Lewa kolumna: nagłówek „Ingredients" + lista lub tekst zastępczy „Not available for this item" z wyjaśniającym akapitem w Text Black Soft 14/400
- Prawa kolumna: nagłówek „Nutrition" + wiersze etykieta/wartość
- Każdy wiersz: etykieta składnika odżywczego (Proxima Nova 14/400) po lewej, wartość (np. „140 calories", „25g", „205 mg**") po prawej, oddzielone linią `1px solid #e7e7e7` poniżej
- Przypis dla znaczników kofeiny/gwiazdki w 13/400 Text Black Soft na dole
- Wzorzec wielokrotnego użytku dla tabel wartości odżywczych zgodnych z regulacjami

**Selektor Dostępności w Sklepie**
- Pojawia się na ciemnozielonym paśmie funkcji nad wierszem opcji rozmiarów
- Pełnoszerokościowy zaokrąglony prostokąt z przezroczysto-białym wnętrzem
- Tekst: „For item availability, choose a store" w kolorze białym, 14/400
- Prawa strona: chevron-down + ikona SVG torby zakupów w białym konturze
- Promień: `4px`
- Wysokość: ~48px

**Ścieżka Nawigacyjna PDP**
- Ścieżka „Menu / Refreshers / Pink Energy Drink" nad tytułem produktu
- Separator: `/` ukośnik w kolorze Text Black Soft
- Bieżąca strona jest nieklikalna, poprzednie strony mają podkreślone zielono-akcentowe linki
- Czcionka: 14/400 Proxima Nova
- Pojawia się na wszystkich stronach PDP

**Link Wstecz z Chevronem (podstrony PDP z odżywczością/szczegółami)**
- Link tekstowy „← Back" nad nagłówkami sekcji na stronie odżywczości
- Tekst w Green Accent (`#00754A`) 14/700 Proxima Nova
- Lewy chevron `<` w tym samym kolorze zielonym
- Alternatywa dla pełnej ścieżki nawigacyjnej na głębokich podstronach

## 5. Zasady Układu

### System Odstępów

Semantyczna skala oparta na rem (zakotwiczona `1rem = 10px`):

| Token | Rem | Piksele | Typowe zastosowanie |
|-------|-----|---------|---------------------|
| `--space-1` | `0.4rem` | 4px | Najciasniejszy padding inline |
| `--space-2` | `0.8rem` | 8px | Mały odstęp, pionowy padding przycisku |
| `--space-3` | `1.6rem` | 16px | Domyślny — padding karty, zewnętrzny rynsztok xs |
| `--space-4` | `2.4rem` | 24px | Wewnętrzne odstępy sekcji, zewnętrzny rynsztok md |
| `--space-5` | `3.2rem` | 32px | Główne odstępy między sekcjami |
| `--space-6` | `4rem` | 40px | Duże odstępy, zewnętrzny rynsztok lg, krata nagłówka |
| `--space-7` | `4.8rem` | 48px | Odstępy między sekcjami |
| `--space-8` | `5.6rem` | 56px | Bardzo duże oddychanie — wysokość Frap |
| `--space-9` | `6.4rem` | 64px | Najszerszy padding sekcji |

**Tokeny rynsztoka:**
- `--outerGutter: 1.6rem` (16px, domyślny / mobilny)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Universalna stała rytmu:** `1.6rem` (16px) pojawia się na każdej stronie jako domyślny zewnętrzny rynsztok, bazowy padding karty i rozmiar tekstu podstawowego 3 — najczęstsza jednostka odstępów systemu.

### Siatka i Kontener

- Skala szerokości kolumn: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Siatka kart podarunkowych używa responsywnej siatki 3-5-up kafelków `~343px`
- Sekcja statusu Rewards: 3-up ciemnozielone panele przy punktach przełamania `lg+`
- Hero: asymetryczny podział 40% (obraz) / 60% (treść) przez `--headerCrateProportion` / `--contentCrateProportion`

### Filozofia Białej Przestrzeni

Biała przestrzeń niesie poczucie „dużej ilości miejsca w kawiarni". Padding sekcji jest hojny (40–64px). Bloki treści są oddzielone białą przestrzenią zamiast separatorami. Kremowe płótno (`#f2f0eb`) samo w sobie jest wizualnym oddechem między białymi kartami a zielonymi pasami funkcji.

### Skala Promieni Obramowania

| Wartość | Zastosowanie |
|---------|--------------|
| `12px` | Karty, modale, kafelki pozycji menu (`--cardBorderRadius`) |
| `12px 12px 0 0` | Pełnoszerokościowa zakładka opinii (zaokrąglona tylko od góry) |
| `50px` | Wszystkie przyciski — pełny promień pigułki (`--buttonBorderRadius`) |
| `50%` | Okrągłe ikony, pływający przycisk Frap, miniatury awatarów |
| Specjalny | `3.3333%/5.298%` eliptyczny dla makiet Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Głębia i Elewacja

| Poziom | Obróbka | Zastosowanie |
|--------|---------|--------------|
| Karta | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Domyślne karty treści — szeptany podwójny cień |
| Globalna Nawigacja | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Trójwarstwowe miękkie uniesienie na stałym górnym pasku |
| Frap Bazowy | `0 0 6px rgba(0,0,0,0.24)` | Bazowa aureola wokół pływającego okrągłego CTA |
| Frap Otoczeniowy | `0 8px 12px rgba(0,0,0,0.14)` | Skierowany otoczeniowy w stosie — unosi Frap ku przodowi |
| Karta Podarunkowa | Lekki cień na ilustrowanej fotografii | Efekt fizycznej karty dla kafelków podarunkowych |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Warstwowe cienie SVG dla wizualizacji Starbucks Card |

**Filozofia cieni:** Szeptane i warstwowe na solidnych powierzchniach — system nigdy nie sięga po pojedynczy ciężki cień rzutowany. Zamiast tego układa w stos 2–3 cienie z małą przezroczystością i różnymi offsetami, symulując rzeczywiste oświetlenie otoczeniowe + bezpośrednie. Przycisk Frap jest najwyżej uniesionym elementem na każdej stronie.

### Dekoracyjna Głębia

- **Brak systemu gradientów** — powierzchnie są jednolitymi blokami kolorów
- **Kolorowe bloki pasm** niosą postrzeganą głębię (ciemnozielone pasma są odbierane jako „zagłębione strefy funkcji" między kremowymi/białymi sekcjami korpusu)
- **Cienie filtrów SVG** na wizualizacjach Starbucks Card dodają odrobinę trójwymiarowej fizyczności bez cienia pudełkowego

## 7. Zalecenia i Przestrogi

### Zalecane
- Używaj Neutral Warm (`#f2f0eb`) lub Ceramic (`#edebe9`) jako tła strony zamiast czystej bieli — ciepły krem to sygnatura
- Przypisuj poziomy zieleni do przeznaczonych im ról powierzchniowych — Starbucks Green dla nagłówków, Green Accent dla CTA, House Green dla głębokich pasm, Uplift dla dekoracyjnych akcentów
- Utrzymuj ciasny tracking przy `-0.01em` / `-0.16px` na SoDoSans przez cały system
- Używaj pełnego promienia pigułki 50px na każdym przycisku bez wyjątku
- Stosuj `transform: scale(0.95)` jako powszechny stan aktywny przycisku
- Rezerwuj Gold wyłącznie dla momentów statusu Rewards
- Używaj SoDoSans niemal wszędzie; przełączaj się na szeryfowy Lander Tall tylko dla redakcyjnych nagłówków Rewards; rezerwuj skrypt Kalam dla momentów „nazwy na kubku" w Careers
- Układaj w stos 2–3 cienie z małą przezroczystością zamiast jednego ciężkiego cienia rzutowanego dla elewacji
- Używaj okrągłego CTA Frap jako stałego pływającego wejścia do zamówień na każdej powierzchni zakupowej
- Pozwól oddychać kremowemu płótnu między kartami treści — używaj białej przestrzeni, nie separatorów

### Niezalecane
- Nie używaj czystej bieli jako tła strony — temperatura ciepłego kremu jest fundamentalna
- Nie wybieraj „jednej zieleni marki" — czterozielony system jest zamierzony; używanie tylko `#006241` wszędzie spłaszcza markę
- Nie używaj Gold jako ogólnego akcentu — to sygnał Rewards
- Nie zaokrąglaj narożników przycisków kwadratowo — pigułka 50px jest powszechna
- Nie wprowadzaj gradientowych wypełnień — system jest oparty na jednolitych blokach kolorów przez cały czas
- Nie różnicuj h1 i h2 rozmiarem — hierarchia wynika z grubości + koloru (600 Starbucks Green vs 400 Text Black)
- Nie używaj czystej czerni do tekstu podstawowego — `rgba(0,0,0,0.87)` pasuje do ciepłego płótna
- Nie pomijaj aktywnego feedbacku `scale(0.95)` na przyciskach — to sygnaturowa mikrointerakcja
- Nie układaj pojedynczych ciężkich cieni; zawsze warstwuj 2–3 cienie z małą przezroczystością
- Nie wprowadzaj szeryfów ani skryptów do głównego przepływu zakupów — należą odpowiednio do kontekstów Rewards i Careers

## 8. Zachowanie Responsywne

### Punkty Przełamania

Wnioskowane z tokenów szerokości komponentów i progresywnych wysokości nawigacji:

| Nazwa | Szerokość | Kluczowe zmiany |
|-------|-----------|-----------------|
| xs | < 480px | Globalna nawigacja 64px; menu hamburgerowe; układy jednokolumnowe; przyciski pigułkowe pełnej szerokości |
| Mobile | 480–767px | Globalna nawigacja 72px; siatka kart podarunkowych 2-up; padding kart się zacieśnia |
| Tablet | 768–1023px | Globalna nawigacja 83px; siatka kart podarunkowych 3-up; zaczyna pojawiać się podział hero |
| Desktop | 1024–1439px | Globalna nawigacja 99px; siatka kart podarunkowych 4-up; pełne asymetryczne hero 40/60 |
| XLarge | 1440px+ | Treść ograniczona przez `--columnWidthXLarge`; siatka kart podarunkowych 5-up; dodatkowy kremowy margines |

### Cele Dotykowe

- Przyciski pigułkowe z paddingiem `7px 16px` mierzą ~32px wysokości — poniżej minimalnego 44px WCAG AAA dla powierzchni tylko dotykowych. Na urządzeniach mobilnych padding przycisku może być wizualnie rozszerzony do spełnienia minimum.
- Pływający okrągły przycisk Frap przy `56px` jest zdecydowanie powyżej minimum.
- Frap używa `--frapTouchOffset: calc(-1 * .8rem)` do rozszerzenia obszaru klikania o 8px poza krawędź wizualną.
- Inputy z pływającą etykietą zwiększają rozmiar czcionki etykiety na urządzeniach mobilnych (baza 1.6rem vs 1.9rem desktop) — łatwiejsze do kliknięcia i czytania z dystansu.

### Strategia Zwijania

- **Wysokość globalnej nawigacji skaluje się progresywnie**: 64 → 72 → 83 → 99px między punktami przełamania, nie jest to pojedyncza wartość
- **Podział hero się zwija**: asymetryczny podział 40/60 → ułożone (obraz na górze, treść poniżej) na urządzeniach mobilnych
- **Siatka kart podarunkowych**: 5-up → 4-up → 3-up → 2-up → 1-up między punktami przełamania z dostosowanymi szerokościami kart
- **Pasma funkcji**: pozostają pełnoszerokościowe, ale tekst + obrazy układają się pionowo na urządzeniach mobilnych
- **Zewnętrzny rynsztok skaluje się**: 16px → 24px → 40px wraz z rozszerzaniem okna
- **3-kolumnowe panele statusu Rewards**: zwijają się do pojedynczej kolumny na urządzeniach mobilnych

### Zachowanie Obrazów

- Fotografia produktów hero przycina się ciaśniej pionowo na urządzeniach mobilnych; treść staje się wizualną kotwicą
- Ilustracje kart podarunkowych zachowują proporcje; siatka kart przepływa
- Przejście zanikania `opacity 0.3s ease-in` przy ładowaniu obrazu (zapobiega nagłemu pojawieniu się)
- Fotografia aplikacji Rewards trzymanej w dłoni skaluje się proporcjonalnie; nigdy się nie rozciąga

## 9. Przewodnik po Promptach dla Agentów

### Szybki Przewodnik po Kolorach

- Podstawowy CTA: „Green Accent (`#00754A`)"
- Tekst podstawowego CTA: „White (`#ffffff`)"
- Nagłówek marki: „Starbucks Green (`#006241`)"
- Pas funkcji / stopka: „House Green (`#1E3932`)"
- Tło strony: „Neutral Warm (`#f2f0eb`)"
- Tło karty: „White (`#ffffff`)"
- Tekst nagłówka na jasnym tle: „Text Black (`rgba(0,0,0,0.87)`)"
- Tekst podstawowy na jasnym tle: „Text Black Soft (`rgba(0,0,0,0.58)`)"
- Tekst podstawowy na ciemnozielonym tle: „Text White Soft (`rgba(255,255,255,0.70)`)"
- Akcent Rewards: „Gold (`#cba258`)"
- Tekst Rewards: „Rewards Green (`#33433d`)"
- Destrukcyjny: „Red (`#c82014`)"

### Przykładowe Prompty dla Komponentów

1. „Utwórz podstawowy przycisk pigułkowy CTA Starbucks z tłem Green Accent (`#00754A`), białym tekstem 'Explore our afternoon menu', czcionką SoDoSans 16px grubość 600 z odstępem liter `-0.01em`, `50px` border-radius (pełna pigułka), padding `7px 16px`. Zastosuj `transform: scale(0.95)` jako stan aktywny z przejściem `0.2s ease`."

2. „Zaprojektuj kartę treści z tłem White (`#ffffff`) przy `12px` border-radius, warstwowym cieniem `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Wypełnij treść paddingiem `16–24px` (`--space-3` do `--space-4`). Umieść na kremowym płótnie Neutral Warm (`#f2f0eb`) z odstępem `16px` od sąsiednich elementów."

3. „Zbuduj pływający okrągły przycisk zamówienia Frap — średnica `56px`, wypełnienie Green Accent (`#00754A`), biała ikona torby zakupów wyśrodkowana. Warstwowy cień: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Stała pozycja dolna-prawa z offsetem dotykowym `-0.8rem`. Stan aktywny zapada otoczeniowy cień do `0 8px 12px rgba(0,0,0,0)` z `scale(0.95)`."

4. „Zbuduj ciemnozielony pas funkcji — sekcja pełnoszerokościowa z tłem House Green (`#1E3932`). Lewa kolumna: biały SoDoSans h2 24px grubość 600, następnie akapit Text White Soft (`rgba(255,255,255,0.70)`) i rząd CTA z dwoma przyciskami (białe wypełnienie z tekstem Green Accent dla podstawowego, Obrysowany na Ciemnym biały kontur dla drugorzędnego). Prawa kolumna: fotografia produktu. Proporcja podziału 40/60, ułożone pionowo poniżej `768px`."

5. „Utwórz kartę statusu Rewards — panel House Green (`#1E3932`) z `12px` border-radius, kolorowym gradientowym górnym paskiem (poziomy Bronze/Silver/Gold). Tytuł w SoDoSans 24px grubość 600 w kolorze białym. Lista korzyści jako białe punkty z podpisami pomocniczymi `rgba(255,255,255,0.70)`. Tekst postępu na dole w Text White Soft. Ułóż 3 panele w siatce przy `lg+`, pojedyncza kolumna na urządzeniach mobilnych."

6. „Zaprojektuj kafelek karty podarunkowej — promień karty odpowiada `12px`, wypełnij ilustrowaną fotografią (malowany akwarelą styl ręcznie rysowany) jako całą powierzchnię. Subtelny cień sprawia, że wygląda jak fizyczna karta na kremowym płótnie. Zgrupuj pod etykietą kategorii ('Spring', 'Thank You', 'Birthday') w SoDoSans 24px grubość 400 nad siatką."

7. „Utwórz nagłówek szczegółów produktu Starbucks — pas House Green (`#1E3932`) ze ścieżką nawigacyjną 'Menu / Refreshers / Pink Energy Drink' w 14/400 białym nad tytułem produktu w SoDoSans 32/700 wielkie litery biały. Fotografia produktu wyśrodkowana poniżej tytułu. Pod zdjęciem: rząd selektora rozmiaru 4-up — każdy przycisk-ikona kubka pokazuje pionową sylwetkę kubka, nazwę rozmiaru ('Tall' / 'Grande' / 'Venti' / 'Trenta') w 16/700 biały i uncje płynne w 13/400 Text White Soft. Wybrany rozmiar otacza ikonę kubka okrągłym pierścieniem `2px solid #00754A`."

8. „Zbuduj przepływ dostosowywania Starbucks — pod selektorem rozmiaru, 3 ułożone obrysowane prostokątne wiersze inputów (białe tło, obramowanie `1px solid #d6dbde`, promień `4px`). Każdy ma pływającą etykietę ('Add-ins', 'Milk', 'Add-ins') nad górnym obramowaniem w 13/700 Text Black wielkie litery. Wartość wyśrodkowana (np. 'Ice', 'Coconut'). Prawa strona: chevron-down w Text Black Soft. Dla wiersza porcji, osadź numeryczny stepper (`−` `1` `+` z okrągłymi `32px` obrysowanymi przyciskami). Pod wszystkimi trzema polami: obrysowana zielona pigułka 'Customize' z ikoną złotej iskierki, promień `50px`, padding `14px 40px`. Sparuj z wypełnioną pigułką Green Accent 'Add to Order' w tym samym rzędzie."

9. „Zaprojektuj pas opisu produktu Starbucks — pełnoszerokościowy House Green (`#1E3932`) pod nagłówkiem produktu. Na górze: złoto-obrysowana pigułka Kosztu Rewards '200★ item' (promień `50px`, padding `4px 12px`, złote obramowanie `#cba258` i tekst). Poniżej: opis produktu w białym 16/400/1.5. Podsumowanie wartości odżywczych inline w białym 14/700 ('140 calories, 25g sugar, 2.5g fat') z tooltipem ikony informacji. Obrysowana-biała-na-zielonym pigułka 'Full nutrition &amp; ingredients list'. Padding pionowy 32px."

10. „Utwórz tabelę wartości odżywczych Starbucks — dwukolumnowy układ wewnątrz białej karty. Lewa kolumna: nagłówek 'Ingredients' (24/400 Text Black), następnie lista składników lub akapit zastępczy 'Not available for this item' w 14/400 Text Black Soft. Prawa kolumna: nagłówek 'Nutrition', następnie wiersze etykieta/wartość (nazwa składnika odżywczego po lewej, wartość po prawej) oddzielone liniami `1px solid #e7e7e7`. Typografia: etykiety w 14/400 Text Black, wartości w 14/700 Text Black wyrównane do prawej. Znaczniki przypisów z gwiazdką w 13/400 Text Black Soft na dole."

### Przewodnik po Iteracjach

Podczas uściślania istniejących ekranów wygenerowanych przy użyciu tego systemu projektowania:
1. Skup się na JEDNYM komponencie na raz
2. Odwołuj się do konkretnych nazw kolorów i kodów hex z tego dokumentu
3. Używaj opisów w naturalnym języku („ciepłe kremowe płótno", „czterostopniowy system zieleni") obok dokładnych wartości
4. Zachowaj pigułkę 50px + stan aktywny `scale(0.95)` powszechnie
5. Sprawdź, czy odcienie zieleni są przypisane do właściwych ról (Green Accent dla CTA, Starbucks Green dla nagłówka, House Green dla pasm)
6. Nie wprowadzaj gradientów — system jest oparty na jednolitych blokach kolorów
7. Utrzymuj tracking SoDoSans przy `-0.01em` / `-0.16px` przez cały projekt

### Znane Braki

- SoDoSans to firmowy krój, niedostępny na Google Fonts — przy implementacji publicznej użyj Inter lub Manrope jako zamiennika i udokumentuj zamianę
- Lander Tall (szeryfowy Rewards) jest również niestandardowy — zamień na Iowan Old Style, Lora lub Source Serif Pro
- Szczegółowe czasy animacji dla poszczególnych komponentów poza kilkoma udokumentowanymi (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) nie są wychwycone dla każdej powierzchni interaktywnej
- Pełna stylizacja stanu błędu formularza (grubość czerwonego obramowania, rozmieszczenie ikon) widoczna w tokenie odcienia, ale nie wyczerpująco wyodrębniona
- Specyficzne komponenty stron Careers (karta nazwy na kubku, siatka radiowa wyszukiwania) są przywoływane w nazwach tokenów, ale nie są objęte tym wyodrębnieniem
- Starbucks Visa Card / Starbucks Card (SVC) — szczegółowe specyfikacje makiet są sygnalizowane przez tokeny `--svcRoundedCorners` i `--svcShadowFilter`, ale nie są w pełni udokumentowane
