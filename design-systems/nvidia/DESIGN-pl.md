# System Projektowy Inspirowany NVIDIA

> Kategoria: Media i Konsument
> Obliczenia GPU. Zielono-czarna energia, estetyka technicznej siły.

## 1. Motyw Wizualny i Atmosfera

Strona internetowa NVIDIA to doświadczenie wysokiego kontrastu, zorientowane technologicznie, które komunikuje surową moc obliczeniową poprzez powściągliwość projektową. Strona zbudowana jest na surowym fundamencie czerni (`#000000`) i bieli (`#ffffff`), urozmaiconym charakterystyczną zielenią NVIDIA (`#76b900`) -- kolorem tak specyficznym, że pełni funkcję odcisku palca marki. To nie jest soczysta zieleń natury; to elektryczna, limonkowa zieleń światła renderowanego przez GPU, kolor sytuujący się pomiędzy chartreuse a kelly green, który dla każdej osoby z branży technologicznej natychmiast sygnalizuje „NVIDIA".

Rodzina czcionek NVIDIA-EMEA (z awaryjnymi Arial i Helvetica) tworzy czysty, industrialny głos typograficzny. Nagłówki 36px pogrubione z ciasnym interlinią 1.25 tworzą gęste, autorytatywne bloki tekstu. Czcionka pozbawiona jest geometrycznej swawolności charakterystycznej dla sans-serifów z Doliny Krzemowej -- jest europejska, pragmatyczna i skoncentrowana na inżynierii. Tekst główny ma 15-16px, komfortowy do czytania, lecz nierozrzutny, co utrzymuje wrażenie, że przestrzeń ekranu jest optymalizowana jak pamięć GPU.

To, co wyróżnia projekt NVIDIA spośród innych technologicznych stron z ciemnym tłem, to zdyscyplinowane użycie zielonego akcentu. `#76b900` pojawia się w obramowaniach (`2px solid #76b900`), podkreśleniach linków (`underline 2px rgb(118, 185, 0)`) i przyciskach CTA -- lecz nigdy jako tła czy duże powierzchnie w głównej treści. Zieleń to sygnał, nie powierzchnia. W połączeniu z głębokim systemem cieni (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) i minimalnym promieniem zaokrąglenia (1-2px), całościowy efekt to precyzyjny sprzęt inżynieryjny oddany w pikselach.

**Kluczowe Cechy:**
- Zieleń NVIDIA (`#76b900`) jako czysty akcent -- wyłącznie obramowania, podkreślenia i interaktywne wyróżnienia
- Czarne (`#000000`) dominujące tło z białym (`#ffffff`) tekstem na ciemnych sekcjach
- Niestandardowa czcionka NVIDIA-EMEA z awaryjnym Arial/Helvetica -- industrialna, europejska, czysta
- Ciasne interlinie (1.25 dla nagłówków) tworzące gęste, autorytatywne bloki tekstu
- Minimalny promień zaokrąglenia (1-2px) -- ostre, inżynieryjne narożniki w całym projekcie
- Przyciski z zielonym obramowaniem (`2px solid #76b900`) jako główny wzorzec interaktywny
- System ikon Font Awesome 6 Pro/Sharp przy wadze 900 dla wyraźnej ikonografii
- Architektura wieloframeworkowa (PrimeReact, Fluent UI, Element Plus) umożliwiająca bogate komponenty interaktywne

## 2. Paleta Kolorów i Role

### Główna Marka
- **Zieleń NVIDIA** (`#76b900`): Sygnatura -- obramowania, podkreślenia linków, kontury CTA, wskaźniki aktywności. Nigdy nie używana jako duże wypełnienia powierzchni.
- **Czysta Czerń** (`#000000`): Główne tło strony, tekst na jasnych powierzchniach, dominujący ton.
- **Czysta Biel** (`#ffffff`): Tekst na ciemnych tłach, jasne tła sekcji, powierzchnie kart.

### Rozszerzona Paleta Marki
- **Jasna Zieleń NVIDIA** (`#bff230`): Jasny limonkowy akcent dla wyróżnień i stanów hover.
- **Pomarańcz 400** (`#df6500`): Ciepły akcent dla alertów, wyróżnionych odznak lub kontekstów związanych z energią.
- **Żółty 300** (`#ef9100`): Drugorzędny ciepły akcent, wyróżnienia kategorii produktów.
- **Żółty 050** (`#feeeb2`): Jasna ciepła powierzchnia dla teł wyróżnień.

### Stany i Semantyka
- **Czerwony 500** (`#e52020`): Stany błędów, działania destrukcyjne, alerty krytyczne.
- **Czerwony 800** (`#650b0b`): Głęboka czerwień dla teł poważnych ostrzeżeń.
- **Zielony 500** (`#3f8500`): Stany sukcesu, pozytywne wskaźniki (ciemniejszy niż zieleń marki).
- **Niebieski 700** (`#0046a4`): Akcenty informacyjne, alternatywny hover linków.

### Dekoracyjne
- **Fioletowy 800** (`#4d1368`): Głęboki fiolet dla końców gradientów, kontekstów premium/AI.
- **Fioletowy 100** (`#f9d4ff`): Jasny fioletowy odcień powierzchni.
- **Fuksjowy 700** (`#8c1c55`): Bogaty akcent dla specjalnych promocji lub wyróżnionych treści.

### Skala Neutralna
- **Szary 300** (`#a7a7a7`): Stonowany tekst, wyłączone etykiety.
- **Szary 400** (`#898989`): Drugorzędny tekst, metadane.
- **Szary 500** (`#757575`): Trzeciorzędny tekst, symbole zastępcze, stopki.
- **Szary Obramowania** (`#5e5e5e`): Subtelne obramowania, linie podziałowe.
- **Prawie Czarny** (`#1a1a1a`): Ciemne powierzchnie, tła kart na czarnych stronach.

### Stany Interaktywne
- **Link Domyślny (ciemne tło)** (`#ffffff`): Białe linki na ciemnych tłach.
- **Link Domyślny (jasne tło)** (`#000000`): Czarne linki z zielonym podkreśleniem na jasnych tłach.
- **Hover Linku** (`#3860be`): Przesunięcie w niebieską stronę przy hover dla wszystkich wariantów linków.
- **Hover Przycisku** (`#1eaedb`): Turkusowe wyróżnienie dla stanów hover przycisków.
- **Aktywny Przycisk** (`#007fff`): Jaskrawy niebieski dla aktywnych/wciśniętych stanów przycisków.
- **Pierścień Focusu** (`#000000 solid 2px`): Czarny kontur dla focusu klawiatury.

### Cienie i Głębia
- **Cień Karty** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Subtelny cień otoczenia dla podniesionych kart.

## 3. Zasady Typografii

### Rodzina Czcionek
- **Główna**: `NVIDIA-EMEA`, z awaryjnymi: `Arial, Helvetica, sans-serif`
- **Czcionka Ikon**: `Font Awesome 6 Pro` (waga 900 dla ikon wypełnionych, 700 dla regularnych)
- **Ikony Sharp**: `Font Awesome 6 Sharp` (waga 300 dla lekkich ikon, 400 dla regularnych)

### Hierarchia

| Rola | Czcionka | Rozmiar | Waga | Interlinia | Odstęp Liter | Uwagi |
|------|------|------|--------|-------------|----------------|-------|
| Wyświetlacz Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (ciasna) | normal | Nagłówki o maksymalnym wpływie |
| Nagłówek Sekcji | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (ciasna) | normal | Tytuły sekcji, nagłówki kart |
| Podnagłówek | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (rozluźniona) | normal | Opisy funkcji, podtytuły |
| Tytuł Karty | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (ciasna) | normal | Nagłówki kart i modułów |
| Duże Ciało | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (rozluźniona) | normal | Wyróżnione ciało tekstu, akapity wiodące |
| Ciało | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Standardowy tekst do czytania |
| Pogrubione Ciało | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Mocne etykiety, elementy nawigacji |
| Małe Ciało | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (rozluźniona) | normal | Treści drugorzędne, opisy |
| Małe Pogrubione Ciało | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Wyróżnione treści drugorzędne |
| Duży Przycisk | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (ciasna) | normal | Główne przyciski CTA |
| Przycisk | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (ciasna) | normal | Standardowe przyciski |
| Kompaktowy Przycisk | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (ciasna) | 0.144px | Małe/kompaktowe przyciski |
| Link | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Linki nawigacyjne |
| Link Wielkie Litery | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, etykiety nawigacji |
| Podpis | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Metadane, znaczniki czasu |
| Mały Podpis | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (ciasna) | normal | Drobny druk, informacje prawne |
| Mikro Etykieta | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, małe odznaki |
| Mikro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (ciasna) | normal | Najmniejszy tekst interfejsu |

### Zasady
- **Pogrubienie jako domyślny głos**: NVIDIA mocno opiera się na wadze 700 dla nagłówków, przycisków, linków i etykiet. Waga 400 zarezerwowana jest dla tekstu głównego i opisów -- wszystko inne jest pogrubione, projeku­jąc pewność siebie i autorytet.
- **Ciasne nagłówki, rozluźnione ciało**: Interlinia nagłówków konsekwentnie wynosi 1.25 (ciasna), podczas gdy tekst główny rozluźnia się do 1.50-1.67. Ten kontrast tworzy wizualną gęstość na górze bloków treści i komfortową czytelność w akapitach.
- **Wielkie litery dla nawigacji**: Etykiety linków używają `text-transform: uppercase` z wagą 700, tworząc głos nawigacyjny czytany jak etykiety specyfikacji sprzętowej.
- **Brak dekoracyjnego odstępu**: Odstęp liter jest normalny w całym projekcie, z wyjątkiem kompaktowych przycisków (0.144px). Sama czcionka niesie industrialny charakter bez żadnych manipulacji.

## 4. Style Komponentów

### Przyciski

**Główny (Zielone Obramowanie)**
- Tło: `transparent`
- Tekst: `#000000`
- Padding: 11px 13px
- Obramowanie: `2px solid #76b900`
- Promień: 2px
- Czcionka: 16px waga 700
- Hover: tło `#1eaedb`, tekst `#ffffff`
- Aktywny: tło `#007fff`, tekst `#ffffff`, obramowanie `1px solid #003eff`, scale(1)
- Focus: tło `#1eaedb`, tekst `#ffffff`, kontur `#000000 solid 2px`, opacity 0.9
- Użycie: Główne CTA ("Learn More", "Explore Solutions")

**Drugorzędny (Cienkie Zielone Obramowanie)**
- Tło: transparent
- Obramowanie: `1px solid #76b900`
- Promień: 2px
- Użycie: Akcje drugorzędne, alternatywne CTA

**Kompaktowy / Wbudowany**
- Czcionka: 14.4px waga 700
- Odstęp liter: 0.144px
- Interlinia: 1.00
- Użycie: Wbudowane CTA, kompaktowa nawigacja

### Karty i Kontenery
- Tło: `#ffffff` (jasne) lub `#1a1a1a` (ciemne sekcje)
- Obramowanie: brak (czyste krawędzie) lub `1px solid #5e5e5e`
- Promień: 2px
- Cień: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` dla podniesionych kart
- Hover: wzmocnienie cienia
- Padding: 16-24px wewnętrzny

### Linki
- **Na Ciemnym Tle**: `#ffffff`, bez podkreślenia, hover przesuwa się do `#3860be`
- **Na Jasnym Tle**: `#000000` lub `#1a1a1a`, podkreślenie `2px solid #76b900`, hover przesuwa się do `#3860be`, podkreślenie usuwane
- **Zielone Linki**: `#76b900`, hover przesuwa się do `#3860be`
- **Stonowane Linki**: `#666666`, hover przesuwa się do `#3860be`

### Nawigacja
- Ciemnoczarne tło (`#000000`)
- Logo wyrównane do lewej, wyraźny wordmark NVIDIA
- Linki: NVIDIA-EMEA 14px waga 700 wielkie litery, `#ffffff`
- Hover: zmiana koloru, brak zmiany podkreślenia
- Rozwijane mega-menu dla kategorii produktów
- Przylepione podczas przewijania z tłem

### Obróbka Obrazów
- Renderingi produktów/GPU jako obrazy hero, często na pełną szerokość
- Obrazy zrzutów ekranu z subtelnym cieniem dla głębi
- Zielone nakładki gradientowe na ciemnych sekcjach hero
- Okrągłe kontenery awatarów z promieniem 50%

### Charakterystyczne Komponenty

**Karty Produktów**
- Czysta biała lub ciemna karta z minimalnym promieniem (2px)
- Zielony akcent obramowania lub podkreślenie tytułu
- Wzorzec pogrubionego nagłówka i lżejszego opisu
- CTA z zielonym obramowaniem na dole

**Tabele Specyfikacji Technicznych**
- Industrialne układy siatki
- Naprzemienne tła wierszy (subtelna zmiana szarości)
- Pogrubione etykiety, regularne wartości
- Zielone wyróżnienia dla kluczowych metryk

**Baner Cookie/Zgody**
- Stałe pozycjonowanie na dole
- Zaokrąglone przyciski (promień 2px)
- Szare obramowania

## 5. Zasady Układu

### System Odstępów
- Jednostka bazowa: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Główne wartości paddingu: 8px, 11px, 13px, 16px, 24px, 32px
- Odstępy sekcji: 48-80px pionowego paddingu

### Siatka i Kontener
- Maksymalna szerokość treści: około 1200px (zamknięta)
- Sekcje hero na pełną szerokość z zamkniętym tekstem
- Sekcje funkcji: siatki 2-3 kolumn dla kart produktów
- Jedna kolumna dla treści artykułów/blogów
- Układy z paskiem bocznym dla dokumentacji

### Filozofia Białej Przestrzeni
- **Celowa gęstość**: NVIDIA stosuje ciaśniejsze odstępy niż typowe strony SaaS, odzwierciedlając gęstość treści technicznych. Biała przestrzeń istnieje, by oddzielać koncepcje, a nie tworzyć luksusową pustkę.
- **Rytm sekcji**: Ciemne sekcje naprzemiennie przeplatają się z białymi, używając koloru tła (nie tylko odstępów) do separacji bloków treści.
- **Gęstość kart**: Karty produktów siedzą blisko siebie z odstępami 16-20px, tworząc poczucie katalogu, a nie galerii.

### Skala Promienia Zaokrąglenia
- Mikro (1px): Wbudowane rozpiętości, małe elementy
- Standard (2px): Przyciski, karty, kontenery, pola wprowadzania -- domyślne dla prawie wszystkiego
- Okrąg (50%): Obrazy awatarów, okrągłe wskaźniki zakładek

## 6. Głębia i Elewacja

| Poziom | Obróbka | Użycie |
|-------|-----------|-----|
| Płaski (Poziom 0) | Brak cienia | Tła stron, tekst wbudowany |
| Subtelny (Poziom 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Standardowe karty, modale |
| Obramowanie (Poziom 1b) | `1px solid #5e5e5e` | Podziałki treści, obramowania sekcji |
| Zielony akcent (Poziom 2) | `2px solid #76b900` | Aktywne elementy, CTA, wybrane pozycje |
| Focus (Dostępność) | kontur `2px solid #000000` | Pierścień focusu klawiatury |

**Filozofia Cieni**: System głębi NVIDIA jest minimalny i utylitarny. Istnieje zasadniczo jedna wartość cienia -- 5px rozmycie otoczenia przy 30% kryciu -- używana oszczędnie dla kart i modali. Głównym sygnałem głębi nie jest cień, lecz _kontrast kolorów_: czarne tła obok białych sekcji, zielone obramowania na czarnych powierzchniach. Tworzy to wizualną warstwowość podobną do sprzętu, gdzie głębia pochodzi z różnicy materiałów, a nie symulowanego światła.

### Dekoracyjna Głębia
- Zielone przejścia gradientowe za treściami hero
- Gradienty od ciemnego do ciemniejszego (czarny do prawie czarnego) dla przejść między sekcjami
- Brak efektów glassmorphism ani rozmycia -- klarowność ponad atmosferę

## 7. Zachowanie Responsywne

### Punkty Przełamania
| Nazwa | Szerokość | Kluczowe Zmiany |
|------|-------|-------------|
| Mały Mobilny | <375px | Kompaktowa pojedyncza kolumna, zredukowany padding |
| Mobilny | 375-425px | Standardowy układ mobilny |
| Duży Mobilny | 425-600px | Szerszy mobilny, niektóre wskazówki 2-kol. |
| Mały Tablet | 600-768px | Zaczynają się siatki 2-kolumnowe |
| Tablet | 768-1024px | Pełne siatki kart, rozszerzona nawigacja |
| Desktop | 1024-1350px | Standardowy układ desktopowy |
| Duży Desktop | >1350px | Maksymalna szerokość treści, hojne marginesy |

### Cele Dotykowe
- Przyciski używają paddingu 11px 13px dla komfortowych celów dotykowych
- Linki nawigacyjne w 14px wielkie litery z odpowiednim odstępem
- Przyciski z zielonym obramowaniem zapewniają wysokich kontrastów cele dotykowe na ciemnych tłach
- Mobilny: menu hamburgerowe zwijane z nakładką na pełny ekran

### Strategia Zwijania
- Hero: nagłówek 36px skaluje się proporcjonalnie w dół
- Nawigacja: pełna pozioma nawigacja zwija się do menu hamburgerowego przy ~1024px
- Karty produktów: 3 kolumny → 2 kolumny → pojedyncza układana kolumna
- Stopka: wielokolumnowa siatka zwija się do pojedynczej ułożonej kolumny
- Odstępy sekcji: 64-80px redukuje się do 32-48px na urządzeniach mobilnych
- Obrazy: zachowują proporcje, skalują się do szerokości kontenera

### Zachowanie Obrazów
- Renderingi GPU/produktów zachowują wysoką rozdzielczość we wszystkich rozmiarach
- Obrazy hero skalują się proporcjonalnie z oknem przeglądarki
- Obrazy kart używają spójnych proporcji
- Ciemne sekcje na pełne krwawienie zachowują obróbkę krawędź do krawędzi

## 8. Zachowanie Responsywne (Rozszerzone)

### Skalowanie Typografii
- Wyświetlacz 36px skaluje się do ~24px na urządzeniach mobilnych
- Nagłówki sekcji 24px skalują się do ~20px na urządzeniach mobilnych
- Tekst główny zachowuje 15-16px we wszystkich punktach przełamania
- Tekst przycisku zachowuje 16px dla spójnych celów dotykowych

### Strategia Ciemnych/Jasnych Sekcji
- Ciemne sekcje (czarne tło, biały tekst) naprzemiennie przeplatają się z jasnymi sekcjami (białe tło, czarny tekst)
- Zielony akcent pozostaje spójny w obu typach powierzchni
- Na ciemnym: linki są białe, podkreślenia są zielone
- Na jasnym: linki są czarne, podkreślenia są zielone
- To naprzemienne przechodzenie tworzy naturalny rytm przewijania i grupowanie treści

## 9. Przewodnik po Promptach Agenta

### Szybka Referencja Kolorów
- Główny akcent: Zieleń NVIDIA (`#76b900`)
- Ciemne tło: Czysta Czerń (`#000000`)
- Jasne tło: Czysta Biel (`#ffffff`)
- Tekst nagłówka (ciemne tło): Biały (`#ffffff`)
- Tekst nagłówka (jasne tło): Czarny (`#000000`)
- Tekst główny (jasne tło): Czarny (`#000000`) lub Prawie Czarny (`#1a1a1a`)
- Tekst główny (ciemne tło): Biały (`#ffffff`) lub Szary 300 (`#a7a7a7`)
- Hover linku: Niebieski (`#3860be`)
- Akcent obramowania: `2px solid #76b900`
- Hover przycisku: Turkus (`#1eaedb`)

### Przykładowe Prompty Komponentów
- "Utwórz sekcję hero na czarnym tle. Nagłówek 36px NVIDIA-EMEA waga 700, interlinia 1.25, kolor #ffffff. Podtytuł 18px waga 400, interlinia 1.67, kolor #a7a7a7. Przycisk CTA z przezroczystym tłem, obramowaniem 2px solid #76b900, promieniem 2px, paddingiem 11px 13px, tekst #ffffff. Hover: tło #1eaedb, tekst biały."
- "Zaprojektuj kartę produktu: białe tło, promień obramowania 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Tytuł 20px NVIDIA-EMEA waga 700, interlinia 1.25, kolor #000000. Ciało 15px waga 400, interlinia 1.67, kolor #757575. Zielony akcent podkreślenia tytułu: border-bottom 2px solid #76b900."
- "Zbuduj pasek nawigacyjny: tło #000000, przylepione na górze. Logo NVIDIA wyrównane do lewej. Linki 14px NVIDIA-EMEA waga 700 wielkie litery, kolor #ffffff. Hover: kolor #3860be. Przycisk CTA z zielonym obramowaniem wyrównany do prawej."
- "Utwórz ciemną sekcję funkcji: tło #000000. Etykieta sekcji 14px waga 700 wielkie litery, kolor #76b900. Nagłówek 24px waga 700, kolor #ffffff. Opis 16px waga 400, kolor #a7a7a7. Trzy karty produktów w rzędzie z odstępem 20px."
- "Zaprojektuj stopkę: tło #000000. Wielokolumnowy układ z grupami linków. Linki 14px waga 400, kolor #a7a7a7. Hover: kolor #76b900. Dolny pasek z tekstem prawnym 12px, kolor #757575."

### Przewodnik po Iteracji
1. Zawsze używaj `#76b900` jako akcentu, nigdy jako wypełnienia tła -- to kolor sygnałowy dla obramowań, podkreśleń i wyróżnień
2. Przyciski są domyślnie przezroczyste z zielonymi obramowaniami -- wypełnione tła pojawiają się tylko w stanach hover/aktywnym
3. Waga 700 to dominujący głos dla wszystkich elementów interaktywnych i nagłówków; 400 jest tylko dla akapitów treści głównej
4. Promień obramowania wynosi 2px dla wszystkiego -- to ostre, minimalne zaokrąglenie jest kluczowe dla industrialnej estetyki
5. Ciemne sekcje używają białego tekstu; jasne sekcje używają czarnego tekstu -- zielony akcent działa identycznie na obu
6. Hover linku to zawsze `#3860be` (niebieski) niezależnie od domyślnego koloru linku
7. Interlinia 1.25 dla nagłówków, 1.50-1.67 dla tekstu głównego -- utrzymuj ten kontrast dla hierarchii wizualnej
8. Nawigacja używa wielkich liter 14px pogrubione -- ta typografia etykiet sprzętowych jest częścią głosu marki
