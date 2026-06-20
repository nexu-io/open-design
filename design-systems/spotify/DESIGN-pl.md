# System Projektowania Inspirowany Spotify

> Kategoria: Media i Konsument
> Streaming muzyczny. Intensywna zieleń na ciemnym tle, pogrubiona typografia, okładki albumów jako główne źródło koloru.

## 1. Motyw Wizualny i Atmosfera

Interfejs webowy Spotify to ciemny, wciągający odtwarzacz muzyczny, który otacza słuchacza niemal czarnym kokonem (`#121212`, `#181818`, `#1f1f1f`), w którym okładki albumów i treści stają się głównym źródłem koloru. Filozofia projektowania to „ciemność treści na pierwszym miejscu" — interfejs użytkownika ustępuje w cień, by muzyka, podcasty i playlisty mogły się wyróżnić. Każda powierzchnia jest odcieniem węgla, tworząc teatralne środowisko, w którym jedynym prawdziwym kolorem jest charakterystyczna Zieleń Spotify (`#1ed760`) oraz okładki albumów.

Typografia korzysta z fontów SpotifyMixUI i SpotifyMixUITitle — zastrzeżonych krojów z rodziny CircularSp (Circular firmy Lineto, dostosowany dla Spotify), z rozbudowanym zestawem czcionek zastępczych obejmującym fonty arabskie, hebrajskie, cyrylicę, grec, dewanagari i CJK, co odzwierciedla globalny zasięg Spotify. System typograficzny jest kompaktowy i funkcjonalny: 700 (pogrubiony) do wyróżnień i nawigacji, 600 (półpogrubiony) do drugorzędnych wyróżnień oraz 400 (zwykły) do treści. Przyciski stosują tekst pisany wielkimi literami z dodatnim odstępem między znakami (1,4px–2px), nadając im systematyczny, etykietowy charakter.

To, co wyróżnia Spotify, to geometria pigułek i kół. Główne przyciski mają promień 500px–9999px (pełna pigułka), okrągłe przyciski odtwarzania mają promień 50%, a pola wyszukiwania to pigułki 500px. W połączeniu z wyraźnymi cieniami (`rgba(0,0,0,0.5) 0px 8px 24px`) na uniesionych elementach i unikalną kombinacją cieniu obramowania wewnętrznego (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), efektem jest interfejs przypominający luksuriosowe urządzenie audio — dotykowy, zaokrąglony i stworzony do obsługi dotykiem.

**Kluczowe Cechy:**
- Niemal czarny, wciągający ciemny motyw (`#121212`–`#1f1f1f`) — interfejs znika za treścią
- Zieleń Spotify (`#1ed760`) jako jedyny akcent marki — nigdy dekoracyjny, zawsze funkcjonalny
- Rodzina czcionek SpotifyMixUI/CircularSp z obsługą globalnych systemów pisma
- Przyciski w kształcie pigułki (500px–9999px) i okrągłe elementy sterowania (50%) — zaokrąglone, zoptymalizowane pod dotyk
- Etykiety przycisków pisane wielkimi literami z szerokim odstępem między znakami (1,4px–2px)
- Wyraźne cienie na uniesionych elementach (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Kolory semantyczne: czerwony negatywny (`#f3727f`), pomarańczowy ostrzegawczy (`#ffa42b`), niebieski informacyjny (`#539df5`)
- Okładki albumów jako główne źródło koloru — interfejs jest z założenia achromatyczny

## 2. Paleta Kolorów i Role

### Główna Marka
- **Zieleń Spotify** (`#1ed760`): Główny akcent marki — przyciski odtwarzania, stany aktywne, CTA
- **Niemal Czarny** (`#121212`): Najgłębsza powierzchnia tła
- **Ciemna Powierzchnia** (`#181818`): Karty, kontenery, uniesione powierzchnie
- **Średnio Ciemny** (`#1f1f1f`): Tła przycisków, interaktywne powierzchnie

### Tekst
- **Biały** (`#ffffff`): `--text-base`, tekst główny
- **Srebrny** (`#b3b3b3`): Tekst drugorzędny, wyciszone etykiety, nieaktywna nawigacja
- **Niemal Biały** (`#cbcbcb`): Nieco jaśniejszy tekst drugorzędny
- **Jasny** (`#fdfdfd`): Niemal czysty biały dla maksymalnego wyróżnienia

### Semantyczne
- **Czerwony Negatywny** (`#f3727f`): `--text-negative`, stany błędów
- **Pomarańczowy Ostrzegawczy** (`#ffa42b`): `--text-warning`, stany ostrzeżeń
- **Niebieski Informacyjny** (`#539df5`): `--text-announcement`, stany informacyjne

### Powierzchnie i Obramowania
- **Ciemna Karta** (`#252525`): Uniesiona powierzchnia karty
- **Średnia Karta** (`#272727`): Alternatywna powierzchnia karty
- **Szare Obramowanie** (`#4d4d4d`): Obramowania przycisków na ciemnym tle
- **Jasne Obramowanie** (`#7c7c7c`): Obramowania przycisków z konturem, wyciszone linki
- **Separator** (`#b3b3b3`): Linie podziału
- **Jasna Powierzchnia** (`#eeeeee`): Przyciski trybu jasnego (rzadko stosowane)
- **Obramowanie w Zieleni Spotify** (`#1db954`): Wariant akcentu zielonego obramowania

### Cienie
- **Wyraźny** (`rgba(0,0,0,0.5) 0px 8px 24px`): Okna dialogowe, menu, uniesione panele
- **Średni** (`rgba(0,0,0,0.3) 0px 8px 8px`): Karty, rozwijane listy
- **Wewnętrzne Obramowanie** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Kombinacja cień–obramowanie dla pól wejściowych

## 3. Zasady Typografii

### Rodziny Czcionek
- **Tytuł**: `SpotifyMixUITitle`, czcionki zastępcze: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Treść**: `SpotifyMixUI`, ten sam zestaw czcionek zastępczych

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość linii | Odstęp liter | Uwagi |
|------|----------|---------|---------|----------------|--------------|-------|
| Tytuł sekcji | SpotifyMixUITitle | 24px (1.50rem) | 700 | normalny | normalny | Pogrubiony nagłówek |
| Nagłówek wyróżniony | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (ciasny) | normalny | Półpogrubione nagłówki sekcji |
| Treść pogrubiona | SpotifyMixUI | 16px (1.00rem) | 700 | normalny | normalny | Wyróżniony tekst |
| Treść | SpotifyMixUI | 16px (1.00rem) | 400 | normalny | normalny | Standardowa treść |
| Przycisk wielkie litery | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (ciasny) | 1.4px–2px | `text-transform: uppercase` |
| Przycisk | SpotifyMixUI | 14px (0.88rem) | 700 | normalny | 0.14px | Standardowy przycisk |
| Nawigacja pogrubiona | SpotifyMixUI | 14px (0.88rem) | 700 | normalny | normalny | Nawigacja |
| Nawigacja | SpotifyMixUI | 14px (0.88rem) | 400 | normalny | normalny | Nieaktywna nawigacja |
| Podpis pogrubiony | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normalny | Pogrubione metadane |
| Podpis | SpotifyMixUI | 14px (0.88rem) | 400 | normalny | normalny | Metadane |
| Mały pogrubiony | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normalny | Tagi, liczniki |
| Mały | SpotifyMixUI | 12px (0.75rem) | 400 | normalny | normalny | Drobny druk |
| Znacznik | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normalny | `text-transform: capitalize` |
| Mikro | SpotifyMixUI | 10px (0.63rem) | 400 | normalny | normalny | Najmniejszy tekst |

### Zasady
- **Dychotomia pogrubiony/zwykły**: Większość tekstu ma grubość 700 (pogrubiony) lub 400 (zwykły), a 600 stosowany jest oszczędnie. Tworzy to wyraźną hierarchię wizualną przez kontrast grubości, a nie rozmiarów.
- **Wielkie litery na przyciskach jako system**: Etykiety przycisków stosują wielkie litery + szeroki odstęp między znakami (1,4px–2px), nadając im systematyczny, „etykietowy" głos odróżniający się od tekstu treści.
- **Kompaktowe rozmiary**: Zakres to 10px–24px — węższy niż w większości systemów. Typografia Spotify jest kompaktowa i funkcjonalna, zaprojektowana do skanowania playlist, nie czytania artykułów.
- **Obsługa globalnych systemów pisma**: Rozbudowany zestaw czcionek zastępczych (arabski, hebrajski, cyrylica, grecki, dewanagari, CJK) odzwierciedla zasięg Spotify obejmujący ponad 180 rynków.

## 4. Style Komponentów

### Przyciski

**Ciemna Pigułka**
- Tło: `#1f1f1f`
- Tekst: `#ffffff` lub `#b3b3b3`
- Wypełnienie: 8px 16px
- Promień: 9999px (pełna pigułka)
- Zastosowanie: Pigułki nawigacyjne, drugorzędne akcje

**Duża Ciemna Pigułka**
- Tło: `#181818`
- Tekst: `#ffffff`
- Wypełnienie: 0px 43px
- Promień: 500px
- Zastosowanie: Główne przyciski nawigacji aplikacji

**Jasna Pigułka**
- Tło: `#eeeeee`
- Tekst: `#181818`
- Promień: 500px
- Zastosowanie: CTA trybu jasnego (zgoda na pliki cookie, marketing)

**Konturowa Pigułka**
- Tło: przezroczyste
- Tekst: `#ffffff`
- Obramowanie: `1px solid #7c7c7c`
- Wypełnienie: 4px 16px 4px 36px (asymetryczne dla ikony)
- Promień: 9999px
- Zastosowanie: Przyciski obserwowania, drugorzędne akcje

**Okrągły Odtwarzacz**
- Tło: `#1f1f1f`
- Tekst: `#ffffff`
- Wypełnienie: 12px
- Promień: 50% (okrąg)
- Zastosowanie: Elementy sterowania odtwarzaniem/pauzą

### Karty i Kontenery
- Tło: `#181818` lub `#1f1f1f`
- Promień: 6px–8px
- Brak widocznych obramowań na większości kart
- Najechanie: niewielkie rozjaśnienie tła
- Cień: `rgba(0,0,0,0.3) 0px 8px 8px` na uniesionych elementach

### Pola Wejściowe
- Pole wyszukiwania: tło `#1f1f1f`, tekst `#ffffff`
- Promień: 500px (pigułka)
- Wypełnienie: 12px 96px 12px 48px (z uwzględnieniem ikony)
- Fokus: obramowanie zmienia się na `#000000`, kontur `1px solid`

### Nawigacja
- Ciemny pasek boczny ze SpotifyMixUI 14px, grubość 700 dla aktywnych i 400 dla nieaktywnych
- `#b3b3b3` wyciszony kolor dla nieaktywnych elementów, `#ffffff` dla aktywnych
- Okrągłe przyciski ikonowe (promień 50%)
- Logo Spotify w lewym górnym rogu w kolorze zielonym

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Siatka i Kontener
- Pasek boczny (stały) + główny obszar treści
- Karty albumów/playlist oparte na siatce
- Pasek aktualnie odtwarzanego na pełną szerokość u dołu
- Responsywny obszar treści wypełniający pozostałą przestrzeń

### Filozofia Białej Przestrzeni
- **Ciemna kompresja**: Spotify zagęszcza treści — siatki playlist, listy utworów i nawigacja są ciasno rozmieszczone. Ciemne tło zapewnia wizualny odpoczynek między elementami bez konieczności stosowania dużych odstępów.
- **Gęstość treści zamiast oddechu**: To aplikacja, nie strona marketingowa. Każdy piksel służy doświadczeniu słuchania.

### Skala Promieni Narożników
- Minimalny (2px): Znaczniki, tagi eksplicytne
- Subtelny (4px): Pola wejściowe, małe elementy
- Standardowy (6px): Kontenery okładek albumów, karty
- Komfortowy (8px): Sekcje, okna dialogowe
- Średni (10px–20px): Panele, elementy nakładkowe
- Duży (100px): Duże przyciski w kształcie pigułki
- Pigułka (500px): Główne przyciski, pole wyszukiwania
- Pełna Pigułka (9999px): Pigułki nawigacyjne, wyszukiwanie
- Koło (50%): Przyciski odtwarzania, awatary, ikony

## 6. Głębia i Uniesienie

| Poziom | Zastosowanie | Użycie |
|--------|-------------|--------|
| Baza (Poziom 0) | Tło `#121212` | Najgłębsza warstwa, tło strony |
| Powierzchnia (Poziom 1) | `#181818` lub `#1f1f1f` | Karty, pasek boczny, kontenery |
| Uniesiony (Poziom 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Rozwijane menu, karty po najechaniu |
| Okno Dialogowe (Poziom 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modale, nakładki, menu |
| Wewnętrzny (Obramowanie) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Obramowania pól wejściowych |

**Filozofia Cieni**: Spotify stosuje wyjątkowo wyraźne cienie jak na aplikację z ciemnym motywem. Cień o kryciu 0,5 i rozmyciu 24px tworzy dramatyczny efekt „unoszenia się w ciemności" dla okien dialogowych i menu, podczas gdy krycie 0,3 i rozmycie 8px zapewnia subtelniejsze uniesienie kart. Unikalna kombinacja wewnętrznego cienia obramowania w polach wejściowych nadaje im wgłębiony, dotykowy charakter.

## 7. Należy i Nie Należy

### Należy
- Używać niemal czarnych teł (`#121212`–`#1f1f1f`) — głębia przez wariacje odcienia
- Stosować Zieleń Spotify (`#1ed760`) wyłącznie do elementów sterowania odtwarzaniem, stanów aktywnych i głównych CTA
- Używać kształtu pigułki (500px–9999px) dla wszystkich przycisków — okrągłego (50%) dla elementów sterowania odtwarzaniem
- Stosować wielkie litery + szeroki odstęp między znakami (1,4px–2px) na etykietach przycisków
- Utrzymywać typografię kompaktową (zakres 10px–24px) — to aplikacja, nie magazyn
- Używać wyraźnych cieni (krycie 0,3–0,5) dla uniesionych elementów na ciemnym tle
- Pozwolić okładkom albumów dostarczać koloru — sam interfejs jest achromatyczny

### Nie Należy
- Nie używać Zieleni Spotify dekoracyjnie ani na tłach — służy wyłącznie funkcjom
- Nie używać jasnych teł dla głównych powierzchni — ciemne zanurzenie jest kluczowe
- Nie pomijać geometrii pigułek/kół na przyciskach — kwadratowe przyciski niszczą tożsamość marki
- Nie używać cienkich/subtelnych cieni — na ciemnym tle cienie muszą być wyraźne, by były widoczne
- Nie dodawać dodatkowych kolorów marki — zieleń + achromatyczne szarości to kompletna paleta
- Nie używać luźnych wysokości linii — typografia Spotify jest kompaktowa i gęsta
- Nie eksponować surowych szarych obramowań — zamiast tego używać obramowań opartych na cieniach lub wewnętrznych

## 8. Zachowanie Responsywne

### Punkty Przełamania
| Nazwa | Szerokość | Kluczowe Zmiany |
|-------|-----------|-----------------|
| Mały Mobilny | <425px | Kompaktowy układ mobilny |
| Mobilny | 425–576px | Standardowy mobilny |
| Tablet | 576–768px | Siatka 2-kolumnowa |
| Duży Tablet | 768–896px | Rozszerzony układ |
| Mały Desktop | 896–1024px | Widoczny pasek boczny |
| Desktop | 1024–1280px | Pełny układ desktopowy |
| Duży Desktop | >1280px | Rozszerzona siatka |

### Strategia Składania
- Pasek boczny: pełny → zwinięty → ukryty
- Siatka albumów: 5 kolumn → 3 → 2 → 1
- Pasek aktualnie odtwarzanego: zachowany we wszystkich rozmiarach
- Wyszukiwanie: pole pigułkowe zachowane, szerokość dostosowywana
- Nawigacja: pasek boczny → dolny pasek na urządzeniach mobilnych

## 9. Przewodnik po Promptach Agenta

### Szybka Paleta Kolorów
- Tło: Niemal Czarny (`#121212`)
- Powierzchnia: Ciemna Karta (`#181818`)
- Tekst: Biały (`#ffffff`)
- Tekst drugorzędny: Srebrny (`#b3b3b3`)
- Akcent: Zieleń Spotify (`#1ed760`)
- Obramowanie: `#4d4d4d`
- Błąd: Czerwony Negatywny (`#f3727f`)

### Przykładowe Prompty do Komponentów
- "Utwórz ciemną kartę: tło #181818, promień 8px. Tytuł 16px SpotifyMixUI grubość 700, biały tekst. Podtytuł 14px grubość 400, #b3b3b3. Cień rgba(0,0,0,0.3) 0px 8px 8px po najechaniu."
- "Zaprojektuj przycisk pigułkę: tło #1f1f1f, biały tekst, promień 9999px, wypełnienie 8px 16px. SpotifyMixUI 14px grubość 700, wielkie litery, odstęp między znakami 1.4px."
- "Zbuduj okrągły przycisk odtwarzania: tło Zieleń Spotify (#1ed760), ikona #000000, promień 50%, wypełnienie 12px."
- "Utwórz pole wyszukiwania: tło #1f1f1f, biały tekst, promień 500px, wypełnienie 12px 48px. Wewnętrzne obramowanie: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Zaprojektuj nawigacyjny pasek boczny: tło #121212. Aktywne elementy: 14px grubość 700, biały. Nieaktywne: 14px grubość 400, #b3b3b3."

### Przewodnik po Iteracjach
1. Zacznij od #121212 — wszystko żyje w niemal czarnej ciemności
2. Zieleń Spotify tylko do funkcjonalnych wyróżnień (odtwarzanie, aktywne, CTA)
3. Pigułkuj wszystko — 500px dla dużych, 9999px dla małych, 50% dla okrągłych
4. Wielkie litery + szeroki tracking na przyciskach — systematyczny głos etykiety
5. Wyraźne cienie (krycie 0,3–0,5) do uniesienia — jasne cienie są niewidoczne na ciemnym tle
6. Okładki albumów dostarczają całego koloru — interfejs pozostaje achromatyczny
