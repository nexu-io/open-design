# System Projektowania Inspirowany Airbnb

> Category: E-commerce i handel detaliczny
> Platforma turystyczna. Ciepły koralowy akcent, dominacja fotografii, zaokrąglony interfejs.

## 1. Temat Wizualny i Atmosfera

Projekt Airbnb z 2026 roku przypomina magazyn podróżniczy, który przypadkiem stał się aplikacją — czyste białe płótna ustępują miejsca pełnoekranowej fotografii, a sam interfejs znika, by ogłoszenia mogły oddychać. Charakterystyczny koralowo-różowy kolor Rausch (`#ff385c`) używany jest oszczędnie, ale w sposób nie do pomylenia: CTA wyszukiwania, wskaźnik aktywnej zakładki, przycisk głównej akcji, od czasu do czasu cena lub serduszko listy życzeń. Wszystko pozostałe to zdyscyplinowana skala szarości, gdzie `#222222` niesie niemal każdą linię tekstu.

To, co sprawia, że system jest niezaprzeczalnie Airbnb, to ilość *wiary*, jaką pokłada w treści. Zdjęcia nieruchomości wyświetlane są w skali hero, 4:3 z pełnoekranowym zaokrągleniem krawędzi. Przełączanie kategorii odbywa się przez selektor trzech zakładek (Homes / Experiences / Services) wykorzystujący trójwymiarowe ilustrowane ikony (dom ze spadzistym dachem, balon na ogrzane powietrze, dzwonek serwisowy) — fizyczne, dotykowe, niemal zabawkowe — w połączeniu z precyzyjnymi etykietami `Airbnb Cereal VF`. Jest to rzadki produkt konsumencki, w którym renderowania 3D i czysto typograficzny interfejs współistnieją bez napięcia.

Najnowszą powierzchnią jest linia produktów **Experiences** — ten sam chrom, ale gęstsze karty, więcej fotografii i centralnie zakotwiony panel rezerwacji ze stałą prawą sztywnością cenową. Strony szczegółów ogłoszeń (zarówno pokojów, jak i doświadczeń) podążają za ścisłym szablonem: pełnoekranowa siatka obrazów hero → nakładająca się zaokrąglona karta rezerwacji (przyklejona podczas przewijania) → udogodnienia → recenzje (nagrody Guest Favorite używają dużej wyśrodkowanej oceny `4.81` z wieńcem laurowym) → mapa → profil hosta → ujawnienia. Rytm jest spójny niezależnie od tego, czy rezerwujesz pokój, czy rejs jachtem.

**Kluczowe Cechy:**
- Koralowo-różowy Rausch (`#ff385c`) jako jedyny kolor akcentowy marki, używany wyłącznie dla głównych CTA i przycisku wyszukiwania
- Pełnoekranowa fotografia w proporcjach 4:3 / 16:9 z delikatnym zaokrągleniem narożników (14–20px) jako podstawowe słownictwo wizualne
- Trójwymiarowe ikony kategorii sparowane z typograficznymi zakładkami — jedyne miejsce, w którym system pozwala na ilustrację
- Okrągłe przyciski ikon `50%` (strzałka wstecz, udostępnianie, ulubione, strzałki karuzeli) rozsiane po całym interfejsie
- `Airbnb Cereal VF` nosi każdą etykietę, od prawnego przypisu 8px do nagłówka sekcji 28px — system jednej rodziny
- Kodowanie kolorów według tier produktu: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (głęboki fiolet `#460479`), Airbnb (koral Rausch)
- Lockup nagrody Guest Favorite — wyśrodkowany olbrzymi numer oceny między dwoma wieńcami laurowymi, jeden z najbardziej rozpoznawalnych momentów w systemie
- Przyklejony panel rezerwacji z układem cena → daty → goście, przypięty do prawej szyny na pulpicie, przekształcający się w dolny pasek "Reserve" na urządzeniach mobilnych
- Przyklejona dolna nawigacja mobilna (Explore / Wishlists / Log in) z aktywnym odcieniem Rausch

## 2. Paleta Kolorów i Role

### Podstawowy
- **Rausch** (`#ff385c`): Charakterystyczny koralowo-różowy kolor marki. Zmienna CSS `--palette-bg-primary-core`. Używany dla: głównego przycisku "Reserve", przycisku submit wyszukiwania, podkreślenia aktywnej zakładki, wypełnienia serduszka listy życzeń, akcentowania ceny. Jedyny kolor o najwyższej widoczności na każdej stronie.

### Drugorzędny i Akcentowy
- **Deep Rausch** (`#e00b41`): Bardziej nasycony wariant. Zmienna CSS `--palette-bg-tertiary-core`. Używany dla wciśniętych/aktywnych stanów przycisku i punktów końcowych gradientu.
- **Plus Magenta** (`#92174d`): Zmienna CSS `--palette-bg-primary-plus`. Kolor marki dla tiera produktu Airbnb Plus — oferty z wyselekcjonowanymi ogłoszeniami wyższego rzędu.
- **Luxe Purple** (`#460479`): Zmienna CSS `--palette-bg-primary-luxe`. Kolor marki dla tiera produktu Airbnb Luxe — wynajem willi/posiadłości.
- **Info Blue** (`#428bff`): Zmienna CSS `--palette-text-legal`. Używany dla prawnych/informacyjnych linków (regulamin, prywatność, ujawnienia) — jedyny niemonochromatyczny kolor linku w systemie.

### Powierzchnia i Tło
- **Canvas White** (`#ffffff`): Domyślne tło strony. Każda karta, każdy kontener, każda strona szczegółów zaczyna się tutaj.
- **Soft Cloud** (`#f7f7f7`): Subtelny odcień powierzchni używany na tłach stopek, opakowaniach widoku mapy i sekcjach "wszystko inne", które chcą ustąpić miejsca głównemu białemu.
- **Hairline Gray** (`#dddddd`): Wszechobecny kolor obramowania 1px — oddziela karty, wiersze udogodnień, panele recenzji, kolumny stopek. Koń roboczy systemu układu.

### Neutralne i Tekstowe
- **Ink Black** (`#222222`): Zmienna CSS `--palette-text-primary`. Quasi-czarny systemu. Każdy nagłówek, każdy akapit treści, każda etykieta nawigacyjna, każda cena. Używany dla ~90% całego tekstu na stronie.
- **Charcoal** (`#3f3f3f`): Zmienna CSS `--palette-text-focused`. Używany w tekście pola wejściowego w stanie fokusa i kopii akcentowej o jeden stopień niżej.
- **Ash Gray** (`#6a6a6a`): Zmienna CSS `--palette-bg-tertiary-hover`. Drugorzędne etykiety, kopia w stylu podtytułu "Cottage rentals" pod nazwami miast, wyciszone linki stopki.
- **Mute Gray** (`#929292`): Zmienna CSS `--palette-text-link-disabled`. Wyłączone przyciski i metadane niskiego priorytetu.
- **Stone Gray** (`#c1c1c1`): Trzeciorzędne separatory, obrys ikon, awatary zastępcze.

### Semantyczne i Akcentowe
- **Error Red** (`#c13515`): Zmienna CSS `--palette-text-primary-error`. Błędy walidacji formularzy, ostrzeżenia o destrukcyjnych akcjach.
- **Deep Error** (`#b32505`): Zmienna CSS `--palette-text-secondary-error-hover`. Wciśnięte/aktywne warianty stanów błędów.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Zmienna CSS `--palette-text-material-disabled`. Wyłączone etykiety w stylu material.

### System Gradientów
Gradient marki Airbnb pojawia się rzadko, zazwyczaj tylko na wordmarku i markowym momencie przycisku wyszukiwania:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

To koralowo-magentowe przejście to "markowy moment" — nigdy nie używane jako pełna powierzchnia, jedynie jako wąskie wypełnienie pilułki lub traktowanie logotypu.

## 3. Zasady Typografii

### Rodzina Fontów
- **Airbnb Cereal VF** (podstawowy i jedyny): Zastrzeżony bezszeryfowy font o zmiennej wadze, który niesie cały system. Zapasowe (w kolejności): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Wagi obserwowane w wyekstrahowanych tokenach: 500, 600, 700. Brak 400-regular — "body" wagą systemu jest 500, co nadaje każdemu blokowi tekstu subtelną dodatkową gęstość, która odczytuje się jako pewna i zamierzona.

Funkcje OpenType: `salt` (alternatywy stylistyczne) używane jest na kompaktowych etykietach 11px i 14px o wadze 600 — prawdopodobnie dla ściślejszych cyfr i kształtowania znaków specjalnych. Nie zaobserwowano funkcji ligatur ani ułamkowych cyfr.

### Hierarchia

| Rola | Rozmiar | Waga | Wysokość linii | Odstęp liter | Notatki |
|------|------|--------|-------------|----------------|-------|
| Section Heading | 28px / 1.75rem | 700 | 1.43 | 0 | "Inspiration for future getaways" — nagłówki na poziomie strony |
| Subsection Heading | 22px / 1.38rem | 500 | 1.18 | -0.44px | "What this place offers", "Meet the hosts" — separatory treści |
| Card Title | 21px / 1.31rem | 700 | 1.43 | 0 | Nagłówki panelu recenzji, nagłówki wiodące kart |
| Listing Title | 20px / 1.25rem | 600 | 1.20 | -0.18px | "Small Group Yacht Tour, Unlimited Wine & Fruits" — nagłówki ogłoszeń na stronach szczegółów |
| Subtitle Bold | 16px / 1.00rem | 600 | 1.25 | 0 | Nazwa hosta, nazwa miasta |
| Body Medium | 16px / 1.00rem | 500 | 1.25 | 0 | Główna treść body na stronach szczegółów |
| Button Large | 16px / 1.00rem | 500 | 1.25 | 0 | "Reserve", "Become a host" |
| Button Default | 14px / 0.88rem | 500 | 1.29 | 0 | Standardowe etykiety przycisków |
| Link | 14px / 0.88rem | 500 | 1.43 | 0 | Linki nawigacyjne, linki stopki |
| Caption Medium | 14px / 0.88rem | 500 | 1.29 | 0 | Metadane, linie podtytułów ("Cottage rentals", "Villa rentals") |
| Caption Bold | 14px / 0.88rem | 600 | 1.43 | 0 | Włączona funkcja `salt` — statystyki liczbowe, akcent małego tekstu |
| Caption Small | 13px / 0.81rem | 400 | 1.23 | 0 | Daty recenzji, mikro-metadane |
| Micro Default | 12px / 0.75rem | 400 | 1.33 | 0 | Zastrzeżenia stopki, prawny mikro-tekst |
| Micro Bold | 12px / 0.75rem | 700 | 1.33 | 0 | Etykiety pilułek "NEW" |
| Badge Uppercase | 11px / 0.69rem | 600 | 1.18 | 0 | Funkcja `salt` — kompaktowe odznaki kategorii/statusu |
| Superscript | 8px / 0.50rem | 700 | 1.25 | 0.32px | Wielkie litery — przypisy cenowe, końcówki dziesiętne |

### Zasady
- **Jedna rodzina, wiele wag.** Airbnb Cereal VF obsługuje wszystko od 8px prawniczego do 28px nagłówka strony — tożsamość wizualna pochodzi z samej rodziny, a nie z mieszania krojów pisma.
- **500 to nowe 400.** "Regularna" waga systemu to 500, nadająca każdemu akapitowi nieco bardziej pewną fakturę niż domyślna webowa.
- **Ujemny tracking tylko dla typografii displayowej.** Nagłówki 20px+ kompresują tracking o -0.18 do -0.44px, by wyglądały dłutowato; rozmiary body zachowują tracking 0 dla czytelności.
- **Ciasne interlinie dla nagłówków, luźne dla body.** Typografia display działa przy 1.18–1.25 (ciasno); body i podpisy otwierają się do 1.43 dla komfortu długoformatowego.
- **Bez wielkich liter poza 8px.** Jedyna transformacja wielkich liter w systemie to superscript 8px — wszędzie indziej zdaniowe wielkie litery z subtelnymi zmianami wagi wykonują pracę.

### Uwaga na Temat Zamienników Fontów
Airbnb Cereal VF jest zastrzeżony. Najbliższym zamiennikiem open-source jest **Circular Std** (nadal komercyjny) lub **Inter** (bezpłatny, Google Fonts) z letter-spacing zmniejszonym o -0.01em przy rozmiarach display. Dla ścisłej wierności marki, udokumentowany łańcuch zapasowy (`Circular, -apple-system, system-ui`) renderuje się akceptowalnie na macOS/iOS, gdzie `system-ui` rozwiązuje do San Francisco, który ma podobne proporcje.

## 4. Stylizacja Komponentów

### Przyciski

**Główny CTA** ("Reserve", "Search", "Add dates")
- Tło: Rausch `#ff385c`
- Tekst: Canvas White `#ffffff`, Airbnb Cereal 500, 16px
- Padding: ~14px pionowo, 24px poziomo
- Radius: 8px (prostokątny) lub 50% (okrągły wariant ikonowy)
- Obramowanie: brak
- Aktywny/wciśnięty: `transform: scale(0.92)` plus pierścień fokusu 2px `#222222` przy `0 0 0 2px`

**Przycisk Drugorzędny** ("Become a host", zarysowane akcje trzeciorzędne)
- Tło: `#ffffff`
- Tekst: Ink Black `#222222`, Airbnb Cereal 500, 14–16px
- Padding: 10px 16px
- Radius: 20px (pilułka) lub 8px (prostokątny)
- Obramowanie: 1px solid Hairline Gray `#dddddd`

**Okrągły Przycisk Tylko z Ikoną** (strzałka wstecz, udostępnianie, ulubione, kontrolki karuzeli)
- Tło: `#f2f2f2` (lekko off-white) lub biały z przezroczystym czarnym obramowaniem 1px
- Ikona: obrys `#222222`, 16–20px
- Rozmiar: średnica 32–44px
- Radius: 50%
- Aktywny/wciśnięty: `transform: scale(0.92)`; subtelny biały pierścień 4px `0 0 0 4px rgb(255,255,255)` dla oddzielenia od kolorowych fotograficznych teł

**Wyłączony Przycisk**
- Tło: `#f2f2f2`
- Tekst: Stone Gray `#c1c1c1`
- Przezroczystość: 0.5

**Przycisk Zakładki Pilułki** (selektor kategorii "Homes / Experiences / Services")
- Tło: przezroczyste
- Tekst: Ink Black `#222222`, Airbnb Cereal 500, 16px
- Padding: 8px 14px
- Stan aktywny: podkreślenie Ink Black 2px pod etykietą
- Sparowany z ilustrowaną ikoną 3D 36–48px nad etykietą

### Karty i Kontenery

**Karta Ogłoszenia** (siatka strony głównej, wyniki wyszukiwania)
- Tło: `#ffffff`
- Radius: 14px na obrazie, tekst siedzi bezpośrednio poniżej na przezroczystym tle
- Obraz: proporcje 4:3, pełnoekranowy, zaokrąglony z tym samym radiusem 14px
- Padding: brak na zewnętrznym kontenerze; 12px odstęp między obrazem a wierszami metadanych
- Cień: brak — separacja pochodzi z białej przestrzeni i wewnętrznego radiusu fotografii
- Wzorzec metadanych: miasto/region w wierszu 1 (16px 600), odległość/czas trwania w wierszu 2 (14px 500 Ash Gray), zakres dat w wierszu 3, wiersz ceny z "per night" na dole

**Panel Rezerwacji Strony Szczegółów** (przyklejona prawa szyna na stronach pokojów/doświadczeń)
- Tło: `#ffffff`
- Radius: 14–20px
- Obramowanie: 1px solid Hairline Gray `#dddddd`
- Cień: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — ułożona trójwarstwowa subtelna elewacja
- Padding: 24px
- Szerokość: ~370px, przypięta 120–140px poniżej górnej krawędzi viewportu
- Treść: nagłówek ceny → selektor dat → dropdown gości → główny CTA → przypis "You won't be charged yet"

**Karta Siatki Udogodnień** (na stronach szczegółów ogłoszeń)
- Tło: `#ffffff`
- Obramowanie: 1px solid Hairline Gray `#dddddd` na poziomie wiersza (nie per element)
- Padding: 16px pionowo na wiersz udogodnienia
- Wzorzec ikona + etykieta: ikona konturu 24px po lewej, etykieta o wadze 500 16px po prawej

**Karta Recenzji** (indywidualna recenzja na stronach szczegółów)
- Tło: `#ffffff`, bez obramowania
- Padding: 0 (polega na przerwach siatki)
- Treść: okrągły awatar 40px + nazwa o wadze 600 16px + data Ash Gray 400 14px w jednym wierszu, następnie akapit body o wadze 500 14px poniżej

### Pola Wejściowe i Formularze

**Pasek Wyszukiwania** (główna strona główna)
- Tło: `#ffffff`
- Obramowanie: 1px solid Hairline Gray `#dddddd` owijające wszystkie trzy segmenty (Where / When / Who)
- Radius: 32px (pełna pilułka)
- Cień: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — subtelne unoszące się odczucie
- Struktura: trzy segmenty podzielone cienkimi pionowymi separatorami, każdy segment ma etykietę o wadze 500 12px nad symbolem zastępczym o wadze 500 14px
- Submit: okrągły przycisk ikony Rausch na prawej krawędzi, średnica 48px

**Pole Tekstowe** (ogólne formularze)
- Tło: `#ffffff`
- Obramowanie: 1px solid Hairline Gray `#dddddd`
- Radius: 8px
- Padding: 14px 16px
- Fokus: obramowanie zmienia się na Ink Black, dodaje zewnętrzny czarny pierścień `0 0 0 2px`
- Błąd: obramowanie zmienia się na `#c13515` (Error Red), tekst pomocniczy używa tego samego koloru

**Selektor Dat**
- Siatka kalendarza: układ 7 kolumn, okrągłe `50%` komórki dni szerokie 40–44px
- Wybrany zakres: tło Ink Black `#222222` z białymi cyframi
- Kotwice początku/końca: większe wypełnione okręgi; środkowe daty używają odcienia Soft Cloud `#f7f7f7`

### Nawigacja

**Górna Nawigacja (Desktop)**
- Wysokość: ~80px
- Tło: `#ffffff`
- Lewa: wordmark+logo Airbnb w Rausch (102×32px)
- Środek: selektor kategorii trzech zakładek (Homes / Experiences / Services) z ikonami 3D 36–48px ułożonymi nad etykietami o wadze 500 16px; aktywna zakładka ma podkreślenie Ink Black 2px
- Prawa: link tekstowy "Become a host", następnie okrąg 32px (język), następnie menu awatara hamburger 36px
- Dolna krawędź: 1px solid Hairline Gray `#dddddd`

**Górna Nawigacja (Mobilna)**
- Pilułka wyszukiwania w jednym wierszu zajmuje pełną szerokość: symbol zastępczy "Start your search" z małą ikoną lupy
- Poniżej: selektor kategorii trzech zakładek pozostaje (Homes / Experiences / Services) — ikony ilustracyjne zmniejszają się do ~28px
- Dolny pasek zakładek przyklejony: Explore (aktywny stan Rausch) / Wishlists / Log in — ikony 24px nad etykietami 12px

**Drugorzędna Nawigacja Strony Szczegółów Ogłoszenia**
- Przyklejone poziome przewijanie linków kotwic (Photos · Amenities · Reviews · Location · Host) pojawia się przy przewijaniu za obrazem hero
- Wysokość: 56px
- Dolna krawędź: 1px solid Hairline Gray

### Traktowanie Obrazów

- **Podstawowe proporcje**: 4:3 dla siatek ogłoszeń strony głównej, 16:9 dla fotografii hero doświadczeń, 1:1 dla awatarów
- **Radius**: 14px na obrazach siatki ogłoszeń, 20px na ramkach zdjęć hero strony szczegółów, `50%` na awatarach
- **Siatka obrazów na stronach szczegółów**: pięcioobrazowa siatka z jednym dużym obrazem po lewej (szerokość 50%) i czterema mniejszymi zdjęciami w siatce 2×2 po prawej, wszystkie dzielące zewnętrzny zaokrąglony kontener 20px
- **Leniwe ładowanie**: intensywne użycie `loading="lazy"` z rozmytymi podglądami zastępczymi
- **Karuzela**: okrągłe przyciski strzałek 32px nakładają się na obraz, wyśrodkowane pionowo; wskaźniki kropek siedzą 12px powyżej dolnej krawędzi

### Charakterystyczne Komponenty

**Lockup Nagrody Guest Favorite** (widoczny na stronach szczegółów wysoko ocenionych ogłoszeń)
- Wyśrodkowany numer oceny renderowany przy 44–56px wadze 700
- Dwie ręcznie rysowane ilustracje SVG wieńca laurowego flankujące lewo i prawo przy ~48px wysokości
- Poniżej: etykieta "Guest Favorite" przy 12px 700 wielkich literach z trackowaniem `0.32px` i krótka podetkieta przy 14px 500 Ash Gray
- Blok pełnej szerokości, bez obramowania kontenera — siedzi bezpośrednio na białym płótnie

**Selektor Kategorii Trzech Zakładek** (pojawia się na górze każdej powierzchni przeglądania)
- Trzy zakładki: Homes / Experiences / Services
- Każda zakładka: ilustrowana ikona 3D (~48px wysoka) nad etykietą o wadze 500 16px
- Experiences i Services noszą małą granatową pilułkę "NEW" (biały tekst 700 12px na ciemnoniebieskim tle) unosząca się w prawym górnym rogu ikony
- Aktywna zakładka: podkreślenie Ink Black 2px pod etykietą

**Siatka Miast Inspiracyjnych** (strona główna "Inspiration for future getaways")
- 6-kolumnowa siatka linków do destynacji na pulpicie, 2-kolumnowa na mobile
- Każda komórka: nazwa miasta o wadze 600 16px w wierszu 1, podtytuł stylu wynajmu Ash Gray 500 14px w wierszu 2 ("Cottage rentals", "Villa rentals")
- Bez obrazów — siatka tylko tekstowa
- Podzielona zakładkami powyżej według kategorii (Popular / Arts & culture / Beach / Mountains / Outdoors / Things to do / Travel tips & inspiration / Airbnb-friendly apartments) — aktywna zakładka ma podkreślenie 2px i zmianę wagi

**Przyklejona Karta Reserve** (strony szczegółów ogłoszeń)
- Pozostaje przyklejona 120px poniżej górnej krawędzi viewportu na pulpicie gdy użytkownik przewija za hero
- Zwija się do dolnego pełnoszerokościowego paska na mobile z etykietą "From $X / night" i Rausch pilułką "Reserve"
- Zawsze pokazuje: nagłówek ceny → wyświetlanie dat → selektor gości → Rausch CTA → zastrzeżenie "You won't be charged yet"

**Karta Hosta Doświadczeń** (strony szczegółów doświadczeń)
- Zaokrąglony pełnoszerokościowy kontener z okładkową fotografią 3:2 na górze
- Awatar hosta (okrągły, 56px) nakładający się na dolną krawędź okładki o 50%
- Poniżej nakładki: imię hosta przy 16px 700, staż hosta przy 14px 500 Ash Gray, mały Rausch przycisk pilułkowy "Message host"
- Używany jako przejście między recenzjami a blokiem udogodnień/lokalizacji

**Pasek "Things to know"** (strony szczegółów ogłoszeń)
- 3-kolumnowa siatka bloków zasad/polityk (House rules, Safety & property, Cancellation policy)
- Każda kolumna: ikona na górze, nagłówek o wadze 600 16px, treść Ash Gray 500 14px, link "Show more" z podkreśleniem Ink Black
- Separator: górne i dolne obramowania Hairline Gray 1px na całym pasku

## 5. Zasady Układu

### System Odstępów
- **Jednostka bazowa**: 8px
- **Wyekstrahowana skala**: 2, 3, 4, 5.5, 6, 8, 10, 11, 12, 15, 16, 18.5, 22, 24, 32px — szczegółowa z garścią wartości off-grid używanych do precyzyjnego wyrównania ikon piksel po pikselu
- **Padding sekcji**: ~48–64px góra/dół na pulpicie, 24–32px na mobile
- **Wewnętrzny padding karty**: 24px na panelach rezerwacji i dużych kartach, 16px na wierszach udogodnień, 12px na metadanych karty ogłoszenia
- **Odstęp między kartami ogłoszeń**: 24px pulpit, 16px mobile
- **Między ułożonymi wierszami tekstu**: 4–8px (bardzo ciasno — wzmacnia "gęstą informację" doświadczenia z ogłoszeniami podróżniczymi)

### Siatka i Kontener
- **Maksymalna szerokość treści**: 1760–1920px na ultra-szerokim (Airbnb pozwala siatce oddychać szerzej niż większość stron); 1280px na większości stron szczegółów
- **Siatka ogłoszeń strony głównej**: 6 kolumn przy ≥1760px, 5 przy ≥1440px, 4 przy ≥1128px, 3 przy ≥800px, 2 przy ≥550px, 1 poniżej
- **Strona szczegółów**: 2-kolumnowa asymetryczna — główna treść ~58%, przyklejony panel rezerwacji ~36% po prawej, ~6% rynna
- **Stopka**: 3-kolumnowy Support / Hosting / Airbnb

### Filozofia Białej Przestrzeni
Airbnb jest gęsto informatywny, ale nigdy zatłoczony. Biała przestrzeń używana jest do *grupowania* — karty ogłoszeń mają 24px rynny, by każda fotografia czytała się jako odrębny obiekt, ale metadane pod każdą kartą używają przerw 4–8px, by cena/miasto/data czuły się jak jedna jednostka. Panel rezerwacji strony szczegółów ma wewnętrzny padding 24px, ale wiersze w nim (selektor dat, selektor gości, CTA) są ułożone przy 12px — granica między kartą a stroną wykonuje więcej pracy separacyjnej niż treść wewnątrz.

### Skala Zaokrągleń
| Radius | Użycie |
|--------|-----|
| 4px | Wbudowane tagi kotwic, chipy tagów |
| 8px | Przyciski tekstowe, dropdowny, małe przyciski narzędziowe |
| 14px | Fotografia karty ogłoszenia, ogólne kontenery treści, odznaki |
| 20px | Główne zaokrąglone przyciski (kształt pilułki), duże obrazy, panel rezerwacji |
| 32px | Pilułka paska wyszukiwania, bardzo duże kontenery |
| 50% | Wszystkie okrągłe przyciski ikon, wszystkie awatary, serduszka listy życzeń — charakterystyczna okrągła geometria systemu |

## 6. Głębokość i Elewacja

| Poziom | Traktowanie | Użycie |
|-------|-----------|-----|
| 0 | Brak cienia | Karty ogłoszeń, treść body, sekcje tylko tekstowe |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Aktywne/wciśnięte przyciski ikon (np. wstecz, udostępnianie, ulubione) — subtelne uniesienie wskazujące na interakcję |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Przyklejona karta panelu rezerwacji, modale, menu dropdown — charakterystyczna trójwarstwowa elewacja systemu |
| Focus Ring | `0 0 0 2px #222222` | Przyciski w stanie aktywnym, skupione pole wyszukiwania |
| White Separator Ring | `rgb(255, 255, 255) 0 0 0 4px` | Okrągłe przyciski nakładane na fotografie — biały pierścień 4px wyraźnie oddziela przycisk od kolorowych teł obrazów |

Filozofia cienia: Airbnb używa **ułożonych wielowarstwowych cieni** zamiast pojedynczego cienia. Trójwarstwowy cień panelu rezerwacji czyta się jako jeden spójny uniesienie, ale w rzeczywistości to trzy oddzielne cienie przy różnych wartościach przezroczystości/rozmycia — tworząc subtelne antyaliasowanie na obwodzie cienia, które czuje się premium bez przytłaczania.

### Dekoracyjna Głębokość
- **Fotografia jako głębokość**: system w dużym stopniu polega na pełnoekranowej fotografii, aby tworzyć głębię wizualną; cienie i gradienty są używane oszczędnie, by fotografie wykonywały ciężką pracę
- **Lockup wieńca laurowego**: nagroda Guest Favorite używa dwóch ilustracji SVG wieńca laurowego, które nadają w innym przypadku płaskiej liczbie oceny ceremonialną, trofealną obecność
- **Trójwymiarowe ikony kategorii**: ikony Homes/Experiences/Services mają własne miękkie wewnętrzne oświetlenie i subtelne rzucane cienie wbudowane w dzieło — jedyne miejsce, w którym marka pozwala na "wymiarową" ilustrację

## 7. Zalecenia i Zakazy

### Zalecenia
- Zarezerwuj Rausch `#ff385c` dla głównych akcji i wskaźnika aktywnej zakładki — nigdy nie rozcieńczaj go dekoracyjnymi zastosowaniami.
- Pozwól fotografii oddychać — przycinki 4:3 z zaokrąglonymi rogami 14–20px, bez nałożonego tekstu, bez scrims gradientowych.
- Używaj Ink Black `#222222` dla każdej warstwy tekstu poniżej Rausch — to quasi-czarny systemu, nigdy prawdziwy `#000000`.
- Sparuj trójwymiarowe ilustrowane ikony selektora kategorii z płaską typografią — nie mieszaj stylów ilustracji w obrębie jednej powierzchni.
- Układaj trzy cienie o niskiej przezroczystości (~2%, 4%, 10%), aby stworzyć charakterystyczną elewację panelu rezerwacji.
- Używaj obramowania Hairline Gray `#dddddd` 1px dla każdego separatora karta-karta i wiersz-wiersz.
- Traktuj panel rezerwacji jako przyklejony na pulpicie, zwijający się do paska reserve zakotwiczonego na dole na mobile.
- Używaj odstępów 4–8px w grupach metadanych i 24px między kartami — gęstość informacji jest zamierzona.

### Zakazy
- Nie wprowadzaj drugorzędnych kolorów akcentowych poza paletą tierów produktów Rausch / Plus Magenta / Luxe Purple.
- Nie umieszczaj tekstu wewnątrz fotografii — podpisy zawsze siedzą poniżej obrazu, nigdy nałożone.
- Nie używaj etykiet wielkich liter z wyjątkiem jedynej roli superscript 8px.
- Nie zaokrąglaj przycisków ikon do czegokolwiek innego niż 50% — okrągły to charakterystyczna geometria systemu.
- Nie dodawaj cieni do kart ogłoszeń — siedzą na białym płótnie bez elewacji.
- Nie używaj gradientowych teł — jedynym gradientem w systemie jest wąski sweep Rausch → magenta na wordmarku.
- Nie używaj wagi fontu 400-regular — wagą body Airbnb Cereal jest 500.
- Nie zastępuj Airbnb Cereal VF innym krojem displayowym — system jest celowo jednorodzinny.

## 8. Zachowanie Responsywne

### Breakpointy

Airbnb deklaruje ~60 breakpointów (artefakt czasu projektowania z biblioteki komponentów), ale znaczące zmiany układu następują przy znacznie mniejszym zestawie:

| Nazwa | Szerokość | Kluczowe Zmiany |
|------|-------|-------------|
| Ultra-wide | ≥1760px | 6-kolumnowa siatka ogłoszeń, maksymalna szerokość treści 1760–1920px |
| Desktop XL | 1440–1759px | Siatka 5-kolumnowa, pełna nawigacja widoczna, przyklejony panel rezerwacji na prawej szynie |
| Desktop | 1128–1439px | Siatka 4-kolumnowa, przyklejony panel rezerwacji pozostaje |
| Laptop | 1024–1127px | Siatka 3–4 kolumnowa, nawigacja kategorii pozostaje pozioma |
| Tablet | 800–1023px | Siatka 3-kolumnowa, globalne wyszukiwanie może zwinąć się do pilułki jednolinijkowej |
| Small tablet | 550–799px | Siatka 2-kolumnowa, panel rezerwacji spada do pełnoszerokościowego bloku inline |
| Mobile | 375–549px | 1-kolumnowy ułożony układ, dolny przyklejony pasek zakładek pojawia się (Explore / Wishlists / Log in) |
| Small mobile | <375px | Padding krawędzi zacieśnia się do 16px; ikony selektora kategorii zmniejszają się do ~28px |

### Cele Dotykowe
Wszystkie interaktywne elementy spełniają lub przekraczają 44×44px. Rodzina okrągłych przycisków ikon jest specjalnie wyceniana na 32–44px z rozszerzonym paddingiem obszaru trafień 8–12px. Główny przycisk Rausch Reserve ma ~48px wysokości. Obszar trafień selektora kategorii trzech zakładek to pełny prostokąt etykieta-plus-ikona (zazwyczaj ~64×80px na zakładkę).

### Strategia Zwijania
- **Nav**: Górna nawigacja zachowuje wordmark Airbnb + selektor trzech zakładek na tablecie i powyżej; na mobile selektor przesuwa się tuż pod pilułkę wyszukiwania, a kontrolki globe/awatar przenoszą się do dolnego paska zakładek.
- **Pasek wyszukiwania**: Trójsegmentowa pilułka (Where / When / Who) z okrągłym przyciskiem submit Rausch na pulpicie; zwija się do jednolinijkowej pilułki "Start your search" na mobile, której dotknięcie otwiera pełnoekranowy arkusz wyszukiwania.
- **Panel rezerwacji**: Przyklejona prawa szyna przy ≥1128px; inline w głównej kolumnie treści między 800–1127px; dolna przyklejona pilułka "Reserve" przy <800px.
- **Siatka ogłoszeń**: Przeformatowuje 6 → 5 → 4 → 3 → 2 → 1 kolumny przez breakpointy.
- **Siatka obrazów strony szczegółów**: Pięcioobrazowy układ (1 duży + 4 małe) na pulpicie; staje się przewijaną pełnoekranową karuzelą na mobile ze wskaźnikami kropek strony.
- **Stopka**: 3-kolumnowy układ zwija się do ułożonej pojedynczej kolumny przy <800px.

### Zachowanie Obrazów
- `loading="lazy"` powszechne, z rozmytymi podglądami miniatur parametryzowanych URL `im_w=` serwowanych jako pierwsze
- Responsywne obrazy używają CDN `muscache.com` Airbnb z parametrem zapytania `im_w` do dostarczania opartego na szerokości (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Brak przycinania artystycznego — ten sam obraz jest skalowany w górę/dół przez breakpointy
- Karuzele automatycznie dostosowują wysokość zdjęcia, aby zachować stały stosunek 4:3 niezależnie od źródłowych proporcji

## 9. Przewodnik Po Promptach Agenta

### Szybkie Odniesienie do Kolorów
- Główny CTA: "Rausch (#ff385c)"
- Tło strony: "Canvas White (#ffffff)"
- Powierzchnia podrzędna: "Soft Cloud (#f7f7f7)"
- Tekst nagłówka / body: "Ink Black (#222222)"
- Tekst drugorzędny: "Ash Gray (#6a6a6a)"
- Obramowanie / separator: "Hairline Gray (#dddddd)"
- Błąd: "Error Red (#c13515)"
- Link informacyjny: "Info Blue (#428bff)"
- Akcent tiera Luxe: "Luxe Purple (#460479)"
- Akcent tiera Plus: "Plus Magenta (#92174d)"

### Przykładowe Prompty Komponentów
- "Utwórz główny przycisk Reserve: tło Rausch (#ff385c), biała etykieta Airbnb Cereal 500-weight przy 16px, padding 14px × 24px, border-radius 8px, brak cienia. Przy aktywnym/wciśniętym dodaj `transform: scale(0.92)` z pierścieniem fokusu Ink Black 2px (`0 0 0 2px #222222`)."
- "Zbuduj kartę ogłoszenia z pełnoekranową fotografią proporcji 4:3 przy border-radius 14px, bez cienia kontenera; poniżej obrazu ułóż trzy wiersze tekstu z przerwami 4px: nazwa miasta przy 16px 600 Ink Black, typ wynajmu przy 14px 500 Ash Gray (#6a6a6a) i zakres cen przy 16px 500 Ink Black z sufiksem `per night` 14px."
- "Zaprojektuj przyklejony panel rezerwacji: białe tło, border-radius 14px, obramowanie Hairline Gray (#dddddd) 1px, 3-warstwowy cień elewacji (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), padding 24px, szerokość 370px, przypięty 120px poniżej górnej krawędzi viewportu na pulpicie. Treść: nagłówek ceny, selektor dat, dropdown gości, Rausch główny CTA i zastrzeżenie Ash Gray 12px `You won't be charged yet`."
- "Utwórz selektor kategorii trzech zakładek: trzy zakładki o równej szerokości oznaczone Homes, Experiences, Services; każda zakładka ma ilustrowaną ikonę 3D (~48px wysoka) (dom, balon, dzwonek) nad etykietą Ink Black o wadze 500 16px; aktywna zakładka ma podkreślenie Ink Black 2px; dodaj małą pilułkę `NEW` o wadze 700 białą 12px na ciemnoniebieskim tle w prawym górnym rogu ikon Experiences i Services."
- "Wyrenderuj lockup nagrody Guest Favorite: wyśrodkowany numer oceny przy 52px wadze 700 Ink Black, flankowany lewo i prawo ręcznie rysowanymi SVG wieńcami laurowymi ~48px wysokimi; poniżej etykieta `GUEST FAVORITE` wielkie litery waga 700 12px z trackowaniem 0.32px; podetkieta przy 14px 500 Ash Gray; blok pełnej szerokości siedzący bezpośrednio na białym płótnie bez obramowania kontenera."

### Przewodnik po Iteracji
Przy udoskonalaniu istniejących ekranów wygenerowanych z tym systemem projektowania:
1. Skoncentruj się na JEDNYM komponencie na raz.
2. Odwołuj się do konkretnych nazw kolorów i kodów hex z tego dokumentu (np. "Ink Black #222222", nie "ciemny szary").
3. Używaj opisów w naturalnym języku obok pomiarów ("subtelna trójwarstwowa elewacja" zamiast długiego ciągu cieni).
4. Opisz pożądane "odczucie" ("jak magazyn, z priorytetem fotografii" vs "gęsta użyteczność").
5. Zawsze domyślnie stosuj Airbnb Cereal VF wagę 500 dla body i 600–700 dla akcentu — nigdy 400.
6. Zachowaj różowy Rausch w małej ilości — jeśli więcej niż jeden element w kolorze Rausch pojawi się na viewport, rozważ, czy jeden powinien być zneutralizowany.

### Znane Luki
- **Karty siatki ogłoszeń strony głównej**: główna siatka kart nieruchomości (podstawowa powierzchnia wizualna airbnb.com) nie została w pełni uchwycona w wyekstrahowanych zrzutach ekranu strony głównej — treść załadowała się tylko częściowo. Specyfikacje Karty Ogłoszenia powyżej są wywnioskowane ze struktury siatki Inspiration i szerszych konwencji Airbnb; potwierdź dokładne proporcje i hierarchię metadanych na żywej witrynie przed użyciem produkcyjnym.
- **Ikony kategorii Experiences**: trójwymiarowe ilustrowane ikony dla Homes / Experiences / Services są serwowane jako zasoby rastrowe; ich dokładne specyfikacje pliku źródłowego (SVG vs PNG, wyrenderowane wymiary pikseli) nie są tutaj udokumentowane.
- **Czasy animacji i przejść**: nie uchwycone — zakres ekstrakcji statycznej.
- **Tryb ciemny**: Airbnb nie dostarcza natywnego trybu ciemnego w wyekstrahowanych powierzchniach produktu; ten dokument opisuje tylko jeden jasny motyw.
