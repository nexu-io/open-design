# System Designu Inspirowany przez Cohere

> Kategoria: AI i LLM
> Platforma AI dla przedsiębiorstw. Żywe gradienty, estetyka pulpitu nawigacyjnego bogatego w dane.

## 1. Motyw Wizualny i Atmosfera

Interfejs Cohere to dopracowany pulpit dowodzenia klasy enterprise — pewny siebie, czysty i zaprojektowany tak, by AI sprawiało wrażenie poważnej infrastruktury, a nie produktu konsumenckiego. Doświadczenie rozgrywa się na jasnym, białym tle, gdzie treść organizowana jest w hojnie zaokrąglone karty (promień 22px), tworzące organiczny, chmuropodobny język konteneryzacji. To witryna skierowana do CTO i architektów korporacyjnych: profesjonalna, ale nie zimna; wyrafinowana, ale nie onieśmielająca.

Język projektowy łączy dwa światy dzięki systemowi podwójnych krojów pisma: CohereText — niestandardowy szeryfowy krój wyświetlaczowy o ciasnym śledztwie — nadaje nagłówkom powagę technologicznego manifestu, natomiast Unica77 Cohere Web obsługuje wszystkie teksty treści i UI z geometryczną szwajcarską precyzją. Ta para szeryfowo-bezszeryfowa tworzy osobowość „pewnego autorytetu spotkającego inżynierską klarowność", doskonale odzwierciedlającą platformę AI dla przedsiębiorstw.

Kolor stosowany jest z ekstremalnym umiarkowaniem — interfejs jest niemal całkowicie czarno-biały z chłodnymi szarymi obramowaniami (`#d9d9dd`, `#e5e7eb`). Fioletowo-śliwkowy pojawia się wyłącznie w fotograficznych pasmach hero, sekcjach gradientowych oraz interaktywnym błękicie (`#1863dc`) sygnalizującym stany hover i focus. Ta chromatyczna powściągliwość sprawia, że kiedy kolor JUŻ się pojawia — na zrzutach ekranu produktu, fotografii biznesowej i w głębokiej fioletowej sekcji — niesie maksymalną wagę wizualną.

**Kluczowe Cechy:**
- Jasne białe tło z chłodnymi szarymi obramowaniami kontenerów
- Sygnaturowy promień obramowania 22px — charakterystyczne „zaokrąglenie kart Cohere"
- Podwójny niestandardowy krój pisma: CohereText (wyświetlaczowy szeryfowy) + Unica77 (bezszeryfowy do treści)
- Chromatyczna powściągliwość klasy enterprise: czerń, biel, chłodne szarości, minimalistyczny akcent fioletowo-niebieski
- Głęboko fioletowe/śliwkowe sekcje hero zapewniające dramatyczny kontrast
- Przyciski ghost/przezroczyste, które na hover zmieniają się na niebieski
- Fotografia biznesowa ukazująca zróżnicowane zastosowania w rzeczywistym świecie
- CohereMono dla kodu i etykiet technicznych z transformacjami na wielkie litery

## 2. Paleta Kolorów i Role

### Podstawowe
- **Czerń Cohere** (`#000000`): Tekst głównych nagłówków i elementy o maksymalnym znaczeniu.
- **Prawie Czerń** (`#212121`): Standardowy kolor linków treści — nieco łagodniejszy niż czysta czerń.
- **Głęboka Ciemność** (`#17171c`): Prawie czerń z niebieskim odcieniem, przeznaczona dla nawigacji i tekstu w ciemnych sekcjach.

### Drugorzędne i Akcentowe
- **Błękit Interakcji** (`#1863dc`): Główny interaktywny akcent — pojawia się na hover przycisków, stanach focus i aktywnych linkach. Jedyny chromatyczny kolor akcji.
- **Pierścień Niebieski** (`#4c6ee6` przy 50%): Kolor pierścienia Tailwind dla wskaźników fokusa klawiaturowego.
- **Fiolet Fokusa** (`#9b60aa`): Kolor obramowania fokusa pola tekstowego — stonowany fiolet.

### Tło i Powierzchnie
- **Czysta Biel** (`#ffffff`): Główne tło strony i powierzchnia kart.
- **Śnieg** (`#fafafa`): Subtelnie wyniesione powierzchnie i jasne tła sekcji.
- **Najjaśniejsza Szarość** (`#f2f2f2`): Obramowania kart i najdelikatniejsze linie kontenerów.

### Neutralne i Tekstowe
- **Stonowany Łupek** (`#93939f`): Odpominięte linki stopki i tekst trzeciorzędny — chłodna szarość z lekkim niebiesko-fioletowym odcieniem.
- **Chłodne Obramowanie** (`#d9d9dd`): Standardowe obramowania sekcji i elementów listy — chłodna, lekko fioletowa szarość.
- **Jasne Obramowanie** (`#e5e7eb`): Jaśniejszy wariant obramowania — standardowa gray-200 z Tailwind.

### System Gradientów
- **Pasmo Hero Fioletowo-Śliwkowe**: Głęboko fioletowe sekcje gradientowe tworzące dramatyczny kontrast na tle białego tła. Pojawiają się jako pełnoszerokościowe pasma mieszczące zrzuty ekranu produktu i kluczowe komunikaty.
- **Gradient Ciemnej Stopki**: Strona przechodzi przez głęboki fiolet/antracyt do czarnej stopki, tworząc efekt „zmierzchu".

## 3. Zasady Typografii

### Rodzina Czcionek
- **Wyświetlaczowa**: `CohereText`, z rezerwowymi: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Treść / UI**: `Unica77 Cohere Web`, z rezerwowymi: `Inter, Arial, ui-sans-serif, system-ui`
- **Kod**: `CohereMono`, z rezerwowymi: `Arial, ui-sans-serif, system-ui`
- **Ikony**: `CohereIconDefault` (niestandardowa czcionka ikonograficzna)

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Interlinia | Śledzenie | Uwagi |
|------|----------|---------|---------|------------|-----------|-------|
| Wyświetlaczowy / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (ciasna) | -1.44px | Maksymalny impakt, autorytet szeryfowy |
| Wyświetlaczowy Drugorzędny | CohereText | 60px (3.75rem) | 400 | 1.00 (ciasna) | -1.2px | Duże nagłówki sekcji |
| Nagłówek Sekcji | Unica77 | 48px (3rem) | 400 | 1.20 (ciasna) | -0.48px | Tytuły sekcji funkcji |
| Podnagłówek | Unica77 | 32px (2rem) | 400 | 1.20 (ciasna) | -0.32px | Nagłówki kart, nazwy funkcji |
| Tytuł Funkcji | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Mniejsze tytuły sekcji |
| Treść Duża | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Akapity wprowadzające |
| Treść / Przycisk | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Standardowa treść, tekst przycisku |
| Przycisk Średni | Unica77 | 14px (0.88rem) | 500 | 1.71 (rozluźniona) | normal | Mniejsze przyciski, wyróżnione etykiety |
| Podpis | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Metadane, opisy |
| Etykieta Wersalikami | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Etykiety sekcji pisane wersalikami |
| Mały | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Najmniejszy tekst, linki stopki |
| Kod Mikro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Tiny uppercase code labels |

### Zasady
- **Szeryfowy do deklaracji, bezszeryfowy do użytku**: CohereText niesie głos marki w skali wyświetlaczowej — jego szeryfy nadają nagłówkom autorytet opublikowanych badań. Unica77 obsługuje wszystko, co funkcjonalne, z geometryczno-szwajcarską neutralnością.
- **Ujemne śledzenie w dużej skali**: CohereText używa śledzenia -1.2px do -1.44px przy 60–72px, tworząc gęste, efektowne bloki tekstowe.
- **Jedna grubość treści**: Niemal cały tekst Unica77 ma grubość 400. Grubość 500 pojawia się wyłącznie dla wyróżnienia małych przycisków. System opiera się na rozmiarze i odstępach, a nie na kontraście grubości.
- **Etykiety kodu wersalikami**: CohereMono używa wersalików z dodatnim śledzeniem (0.16–0.28px) dla tagów technicznych i znaczników sekcji.

## 4. Style Komponentów

### Przyciski

**Ghost / Przezroczysty**
- Tło: przezroczyste (`rgba(255, 255, 255, 0)`)
- Tekst: Czerń Cohere (`#000000`)
- Brak widocznego obramowania
- Hover: tekst zmienia się na Błękit Interakcji (`#1863dc`), krycie 0.8
- Focus: pełne obramowanie 2px w Błękicie Interakcji
- Główny styl przycisku — niewidoczny dopóki nie zostanie poddany interakcji

**Ciemny Pełny**
- Tło: ciemne/czarne
- Tekst: Czysta Biel
- Do CTA na jasnych powierzchniach
- Pigułkowy lub standardowy promień

**Obramowany**
- Kontener oparty na obramowaniu
- Używany w działaniach drugorzędnych

### Karty i Kontenery
- Tło: Czysta Biel (`#ffffff`)
- Obramowanie: cienka linia Najjaśniejszej Szarości (`1px solid #f2f2f2`) dla subtelnych kart; Chłodne Obramowanie (`#d9d9dd`) dla wyróżnionych
- Promień: **22px** — sygnaturowy promień Cohere dla głównych kart, obrazów i kontenerów dialogowych. Również 4px, 8px, 16px, 20px dla mniejszych elementów
- Cień: minimalny — Cohere opiera się na kolorze tła i obramowaniach, a nie na cieniach
- Specjalny: promień `0px 0px 22px 22px` (zaokrąglenie tylko od dołu) dla kontenerów sekcji
- Dialog: promień 8px dla okienek modalnych/dialogowych

### Pola Tekstowe i Formularze
- Tekst: biały na ciemnym polu, czarny na jasnym
- Obramowanie fokusa: Fiolet Fokusa (`#9b60aa`) z `1px solid`
- Cień fokusa: czerwony pierścień (`rgb(179, 0, 0) 0px 0px 0px 2px`) — prawdopodobnie dla sygnalizacji stanu błędu
- Obrys fokusa: Błękit Interakcji, linia 2px

### Nawigacja
- Czysta pozioma nawigacja na białym lub ciemnym tle
- Logo: wordmark Cohere (niestandardowe SVG)
- Linki: ciemny tekst, 16px Unica77
- CTA: ciemny pełny przycisk
- Mobile: zwijanie do hamburgera

### Obróbka Obrazów
- Fotografia biznesowa z różnorodną tematyką i środowiskami
- Fioletowo odcieniona fotografia hero dla dramatycznych sekcji
- Zrzuty ekranu UI produktu na ciemnych powierzchniach
- Obrazy z promieniem 22px odpowiadającym systemowi kart
- Sekcje z pełnoszerokościowym fioletowym gradientem

### Charakterystyczne Komponenty

**System Kart 22px**
- Promień obramowania 22px to sygnatura wizualna Cohere
- Wszystkie główne karty, obrazy i kontenery używają tego promienia
- Tworzy chmuropodobną, organiczną miękkość wyróżniającą się spośród typowych 8–12px

**Pasek Zaufania Enterprise**
- Logo firm wyświetlane w poziomym pasku
- Demonstruje adopcję przez przedsiębiorstwa
- Czyste, monochromatyczne traktowanie logotypów

**Fioletowe Pasma Hero**
- Pełnoszerokościowe, głęboko fioletowe sekcje mieszczące prezentacje produktów
- Tworzą dramatyczne przerwy wizualne w białym układzie strony
- Zrzuty ekranu produktu unoszą się wewnątrz fioletowego środowiska

**Tagi Kodu Wersalikami**
- CohereMono wersalikami ze śledzeniem
- Używane jako znaczniki sekcji i etykiety kategoryzacji
- Tworzy techniczną, ustrukturyzowaną hierarchię informacji

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px
- Skala: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Padding przycisku zmienia się w zależności od wariantu
- Wewnętrzny padding karty: około 24–32px
- Pionowe odstępy sekcji: hojne (56–60px między sekcjami)

### Siatka i Kontener
- Maksymalna szerokość kontenera: do 2560px (bardzo szeroka) z responsywnym skalowaniem
- Hero: wyśrodkowany z dramatyczną typografią
- Sekcje funkcji: wielokolumnowe siatki kart
- Sekcje enterprise: pełnoszerokościowe fioletowe pasma
- Wykryto 26 punktów przełamania — ekstremalnie granularny system responsywny

### Filozofia Przestrzeni Białej
- **Klarowność enterprise**: Każda sekcja prezentuje jedną wyraźną propozycję z przestrzenią do oddychania.
- **Fotografia jako bohater**: Duże sekcje fotograficzne zapewniają zainteresowanie wizualne bez potrzeby dekoracyjnych elementów projektowych.
- **Grupowanie kartami**: Powiązana treść grupowana jest w karty z zaokrągleniem 22px, tworząc naturalne klastry informacyjne.

### Skala Promienia Obramowania
- Ostry (4px): Elementy nawigacji, małe tagi, paginacja
- Komfortowy (8px): Okna dialogowe, kontenery drugorzędne, małe karty
- Hojny (16px): Wyróżnione kontenery, średnie karty
- Duży (20px): Duże karty funkcji
- Sygnaturowy (22px): Główne karty, obrazy hero, główne kontenery — TEN promień Cohere
- Pigułkowy (9999px): Przyciski, tagi, wskaźniki statusu

## 6. Głębia i Elewacja

| Poziom | Traktowanie | Zastosowanie |
|--------|-------------|--------------|
| Płaski (Poziom 0) | Brak cienia, brak obramowania | Tło strony, bloki tekstowe |
| Obramowany (Poziom 1) | `1px solid #f2f2f2` lub `#d9d9dd` | Standardowe karty, separatory listy |
| Pasmo Fioletowe (Poziom 2) | Pełnoszerokościowe ciemne fioletowe tło | Sekcje hero, prezentacje funkcji |

**Filozofia Cieni**: Cohere jest niemal wolny od cieni. Głębia komunikowana jest poprzez **kontrast koloru tła** (białe karty na fioletowych pasmach, biała powierzchnia na śniegu), **konteneryzację obramowaniem** (chłodne szare obramowania) i dramatyczne **naprzemienne przejścia sekcji od jasnych do ciemnych**. Gdy elementy wymagają elewacji, osiągają ją przez bycie białymi na ciemnym tle, a nie przez rzucanie cieni.

## 7. Nakazy i Zakazy

### Nakazy
- Używaj promienia obramowania 22px na wszystkich głównych kartach i kontenerach — to sygnatura wizualna
- Używaj CohereText dla nagłówków wyświetlaczowych (72px, 60px) z ujemnym śledzeniem
- Używaj Unica77 dla całego tekstu treści i UI przy grubości 400
- Utrzymuj paletę czarno-białą z chłodnymi szarymi obramowaniami
- Używaj Błękitu Interakcji (#1863dc) wyłącznie dla interaktywnych stanów hover/focus
- Używaj głęboko fioletowych sekcji dla dramatycznych przerw wizualnych i prezentacji produktów
- Stosuj wersaliki + śledzenie w CohereMono dla etykiet sekcji
- Utrzymuj fotografię odpowiednią dla przedsiębiorstw z różnorodną tematyką

### Zakazy
- Nie używaj promienia obramowania innego niż 22px na głównych kartach — sygnaturowy promień ma znaczenie
- Nie wprowadzaj ciepłych kolorów — paleta jest ściśle chłodnotonalna
- Nie używaj mocnych cieni — głębia pochodzi z kontrastu kolorów i obramowań
- Nie używaj grubości pogrubionej (700+) dla tekstu treści — zakres to 400–500
- Nie pomijaj hierarchii szeryfowo/bezszeryfowej — CohereText dla nagłówków, Unica77 dla treści
- Nie używaj fioletu jako koloru powierzchni kart — fiolet zarezerwowany jest dla pełnoszerokościowych sekcji
- Nie redukuj odstępów sekcji poniżej 40px — układy enterprise potrzebują przestrzeni do oddychania
- Nie dodawaj dekoracji do przycisków domyślnie — ghost/przezroczysty to stan bazowy

## 8. Zachowanie Responsywne

### Punkty Przełamania
| Nazwa | Szerokość | Kluczowe Zmiany |
|-------|-----------|-----------------|
| Małe Mobile | <425px | Kompaktowy układ, minimalne odstępy |
| Mobile | 425–640px | Jedna kolumna, karty układane w stos |
| Duże Mobile | 640–768px | Drobne korekty odstępów |
| Tablet | 768–1024px | Rozpoczynają się siatki 2-kolumnowe |
| Desktop | 1024–1440px | Pełny układ wielokolumnowy |
| Duży Desktop | 1440–2560px | Maksymalna szerokość kontenera |

*Wykryto 26 punktów przełamania — jedna z najbardziej granularnie responsywnych witryn w zbiorze danych.*

### Cele Dotykowe
- Przyciski odpowiednio zwymiarowane dla interakcji dotykowej
- Linki nawigacji z komfortowymi odstępami
- Powierzchnie kart jako cele dotykowe

### Strategia Zwijania
- **Nawigacja**: Pełna nawigacja zwija się do hamburgera
- **Siatki funkcji**: Wielokolumnowy → 2-kolumnowy → jedna kolumna
- **Tekst hero**: 72px → 48px → 32px progresywne skalowanie
- **Sekcje fioletowe**: Utrzymują pełną szerokość, treść układana w stos
- **Siatki kart**: 3 → 2 → 1 kolumna

### Zachowanie Obrazów
- Fotografia skaluje się proporcjonalnie wewnątrz kontenerów z promieniem 22px
- Zrzuty ekranu produktu zachowują proporcje
- Sekcje fioletowe skalują tło proporcjonalnie

## 9. Przewodnik po Promptach dla Agenta

### Szybkie Odniesienie do Kolorów
- Tekst Główny: „Czerń Cohere (#000000)"
- Tło Strony: „Czysta Biel (#ffffff)"
- Tekst Drugorzędny: „Prawie Czerń (#212121)"
- Akcent Hover: „Błękit Interakcji (#1863dc)"
- Stonowany Tekst: „Stonowany Łupek (#93939f)"
- Obramowania Kart: „Najjaśniejsza Szarość (#f2f2f2)"
- Obramowania Sekcji: „Chłodne Obramowanie (#d9d9dd)"

### Przykładowe Prompty Komponentów
- „Utwórz sekcję hero na Czystej Bieli (#ffffff) z CohereText przy 72px grubości 400, line-height 1.0, letter-spacing -1.44px. Tekst w Czerni Cohere. Podtytuł w Unica77 przy 18px grubości 400, line-height 1.4."
- „Zaprojektuj kartę funkcji z promieniem obramowania 22px, obramowaniem 1px solid Najjaśniejszej Szarości (#f2f2f2) na białym tle. Tytuł w Unica77 przy 32px, letter-spacing -0.32px. Treść w Unica77 przy 16px, Stonowany Łupek (#93939f)."
- „Zbuduj przycisk ghost: przezroczyste tło, tekst w Czerni Cohere w Unica77 przy 16px. Na hover tekst zmienia się na Błękit Interakcji (#1863dc) z kryciem 0.8. Focus: obrys 2px solid Błękit Interakcji."
- „Utwórz głęboko fioletową pełnoszerokościową sekcję z białym tekstem. CohereText przy 60px dla nagłówka. Zrzut ekranu produktu unosi się wewnątrz z promieniem obramowania 22px."
- „Zaprojektuj etykietę sekcji używając CohereMono przy 14px, wersaliki, letter-spacing 0.28px. Tekst w Stonowanym Łupku (#93939f)."

### Przewodnik po Iteracji
1. Skup się na JEDNYM komponencie na raz
2. Zawsze używaj promienia 22px dla głównych kart — „zaokrąglenie kart Cohere"
3. Określaj krój pisma — CohereText dla nagłówków, Unica77 dla treści, CohereMono dla etykiet
4. Elementy interaktywne używają Błękitu Interakcji (#1863dc) wyłącznie na hover
5. Utrzymuj białe powierzchnie z chłodnymi szarymi obramowaniami — bez ciepłych tonów
6. Fiolet jest przeznaczony dla pełnoszerokościowych sekcji, nigdy dla teł kart
