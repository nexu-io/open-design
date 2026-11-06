# System Projektowania Inspirowany Discord

> Category: Produktywność i SaaS
> Platforma głosowa i czatowa. Głęboki blurple, ciemne powierzchnie jako baza, żywe akcenty.

## 1. Temat Wizualny i Atmosfera

Produkt Discord jest stworzony na wieczorne sesje, rajdy i grupowe rozmowy głosowe — dlatego cała powierzchnia jest ciemna od podstaw. Domyślne tło to głęboki `Background Primary` (`#313338` jasny motyw, `#1e1f22` ciemny motyw), a kolumny czatu są nakładane na nieco jaśniejsze lub ciemniejsze odcienie, by oznaczać kanały, wątki i boczne panele. Charakterystyczny **Blurple** (`#5865f2`) jest zarezerwowany dla znaku marki, głównych CTA, wzmianek i elementu „ty" — stosowany oszczędnie, by wyróżniał się na tle stonowanych neutralów.

Typografia opiera się na **gg sans** (własnej czcionce Discord zastępującej Whitney) do treści i interfejsu, z zaokrąglonymi geometrycznymi kształtami, które sprawiają wrażenie przyjaznych, a zarazem czytelnych w małych rozmiarach wymaganych przez klienta czatu. Nagłówki rosną stopniowo; wiersze czatu są ścisłe (4–8px między grupami wiadomości), dzięki czemu godziny przewijania historii są łatwe do przeglądania.

Język kształtów jest zaokrąglony, lecz nie balonowo miękki: promień 8px na kartach, 4px na polach wejściowych, pełne pigułki na odznakach statusu i tagach. Serwery mają awatary w kształcie zaokrąglonych kwadratów o rozmiarze 48px, które po najechaniu kursorem zamieniają się w koła — drobny element animacji, który stał się częścią tożsamości marki.

**Kluczowe Cechy:**
- Ciemne powierzchnie jako baza: `#1e1f22` / `#2b2d31` / `#313338` (3-poziomowa głębia)
- Blurple `#5865f2` jako jedyny nasycony akcent na powierzchni czatu
- gg sans (styl Whitney) do wszystkich tekstów — przyjazna, geometryczna, neutralna
- Awatary serwerów w kształcie zaokrąglonych kwadratów (promień 16px) przeskakujące w koła po najechaniu
- Ścisłe odstępy wierszy czatu, hojne wypełnienie bocznych paneli
- Kropki statusu: zielona online, żółta idle, czerwona dnd, szara offline
- Rozdzielniki 1px wyrównane do piksela w subtelnej bieli przy niskiej przezroczystości

## 2. Paleta Kolorów i Role

### Główne
- **Blurple** (`#5865f2`): Główny kolor marki, główne CTA, podświetlenie wzmianki.
- **Blurple Hover** (`#4752c4`): Hover/aktywny dla blurple.
- **Blurple Soft** (`#7289da`): Stary blurple, drugorzędny akcent w marketingu.

### Powierzchnie (Ciemny Motyw — domyślny)
- **Background Tertiary** (`#1e1f22`): Listwa z listą serwerów, najgłębsze tło.
- **Background Secondary** (`#2b2d31`): Pasek boczny kanałów, pasek boczny ustawień.
- **Background Primary** (`#313338`): Powierzchnia czatu, kolumna wiadomości.
- **Background Floating** (`#111214`): Pływające popovers, podpowiedzi, autouzupełnianie.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Nakładka hover na wierszach.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Aktywny wiersz.

### Powierzchnie (Jasny Motyw)
- **Light Bg Primary** (`#ffffff`): Powierzchnia czatu w jasnym motywie.
- **Light Bg Secondary** (`#f2f3f5`): Pasek boczny w jasnym motywie.
- **Light Bg Tertiary** (`#e3e5e8`): Najgłębsza jasna powierzchnia.

### Tekst
- **Header Primary** (`#f2f3f5`): Nagłówki kanałów, tytuły modali w ciemnym motywie.
- **Header Secondary** (`#b5bac1`): Wyciszone nagłówki.
- **Text Normal** (`#dbdee1`): Tekst główny w ciemnym motywie — nieco chłodniejszy niż czysta biel.
- **Text Muted** (`#949ba4`): Znaczniki czasu, nazwy serwerów, drugorzędne metadane.
- **Text Link** (`#00a8fc`): Hiperłącza w wiadomościach — błękitny, odróżniający się od blurple.
- **Channels Default** (`#80848e`): Nieaktywna nazwa kanału na pasku bocznym.

### Status i Znaczenie
- **Status Online** (`#23a55a`): Kropka online, stany sukcesu.
- **Status Idle** (`#f0b232`): Kropka idle, niedostępny.
- **Status DND** (`#f23f43`): Nie przeszkadzać, służy też jako czerwień destrukcyjna.
- **Status Streaming** (`#593695`): Fioletowy „Streaming".
- **Status Offline** (`#80848e`): Szary offline.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Delikatna warstwa blurple na wierszach z @wzmianką.

### Obramowania i Rozdzielniki
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Standardowy rozdzielnik w ciemnym motywie.
- **Border Subtle** (`#3f4147`): Jednolity rozdzielnik dla kart.

## 3. Zasady Typografii

### Rodzina Czcionek
- **Treść / UI / Nagłówki**: `gg sans`, z fallbackiem: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Wyświetlanie (legacy / Whitney)**: `Whitney`, z fallbackiem: `gg sans`
- **Kod / Mono**: `"gg mono"`, z fallbackiem: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość linii | Odstęp liter | Uwagi |
|------|----------|---------|---------|----------------|--------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero marketingowy |
| Nagłówek strony | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Tytuły ustawień/profilu |
| Nazwa kanału | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, nagłówek kanału |
| Treść wiadomości | gg sans | 16px (1rem) | 400 | 1.375 | normal | Standardowy tekst czatu |
| Nazwa użytkownika | gg sans | 16px (1rem) | 500 | 1.25 | normal | Autor wiadomości |
| Znacznik czasu | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | „Dzisiaj o 16:32" |
| Kanał paska bocznego | gg sans | 16px (1rem) | 500 | 1.25 | normal | Wiersze listy kanałów |
| Nazwa serwera | gg sans | 16px (1rem) | 600 | 1.25 | normal | Nagłówek serwera |
| Podpis / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Tekst statusu, tag edycji |
| Kod wbudowany | gg mono | 0.875em | 400 | inherit | normal | Wbudowany `code` |
| Blok kodu | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Blok ```potrójnym ogrodzeniem``` |

### Zasady
- **Przyjazna geometria**: gg sans zastępuje Whitney zaokrąglonymi zakończeniami liter a/g/s — marka chce ciepła bez utraty czytelności.
- **Kontrast grubości ponad kontrast koloru**: hierarchia pochodzi ze stopni grubości 400→500→600→700→800; powierzchnia pozostaje neutralna.
- **Treść 16px**: wiadomości czatu nie zmniejszają się poniżej 16px. Gęstość pochodzi z wysokości linii (1.375), nie z rozmiaru czcionki.

## 4. Style Komponentów

### Przyciski

**Główny**
- Tło: `#5865f2`
- Tekst: `#ffffff`
- Wypełnienie: 8px 16px
- Promień: 4px
- Hover: `#4752c4`
- Użycie: Główne CTA, „Kontynuuj", „Dołącz do serwera"

**Drugorzędny**
- Tło: `#4e5058`
- Tekst: `#ffffff`
- Wypełnienie: 8px 16px
- Promień: 4px
- Hover: `#6d6f78`

**Trzeciorzędny / Subtelny (styl linku)**
- Tło: transparent
- Tekst: `#dbdee1`
- Hover: tekst podkreślony, brak zmiany tła

**Destrukcyjny**
- Tło: `#da373c`
- Tekst: `#ffffff`
- Hover: `#a12d2f`

### Pola wejściowe
- Tło: `#1e1f22`
- Tekst: `#dbdee1`
- Obramowanie: 1px solid `#1e1f22`
- Promień: 4px
- Wypełnienie: 10px 12px
- Fokus: obramowanie `#5865f2`

### Awatary Serwerów
- Rozmiar: 48×48px
- Promień: 16px (zaokrąglony kwadrat) domyślnie; przechodzi do 50% przy hover i aktywnym stanie.
- Stan aktywny: biała pigułka 4px na lewej krawędzi kolumny ikon.

### Kropki Statusu
- Rozmiar: 10×10px
- Obramowanie: 3px solid background-tertiary (tworzy efekt „wycięcia")
- Pozycja: prawy dolny róg awatara.

### Karty / Osadzenia
- Tło: `#2b2d31` (ciemny) lub `#f2f3f5` (jasny)
- Lewe obramowanie: 4px solid kolor akcentu osadzenia.
- Promień: 4px
- Wypełnienie: 8px 16px

### Pigułka Wzmianki
- Tło: `rgba(88, 101, 242, 0.3)`
- Tekst: `#c9cdfb`
- Wypełnienie: 0 2px
- Promień: 3px

## 5. Odstępy i Układ

- **Jednostka bazowa**: 4px. Skala: 4, 8, 12, 16, 20, 24, 32, 40.
- **Listwa serwerów**: szerokość 72px, stała.
- **Pasek boczny kanałów**: szerokość 240px.
- **Lista członków**: szerokość 240px na pulpicie.
- **Kolumna czatu**: płynna, min 380px.

## 6. Ruch

- **Czas trwania**: 200ms dla hover; 350ms dla morfowania awatara w koło; 80ms dla zanikania podpowiedzi.
- **Przyspieszenie**: `cubic-bezier(0.215, 0.61, 0.355, 1)` dla morfowania awatara (szybkie, potem ustabilizowanie).
- **Pulsowanie powiadomień**: 1.4s ease-in-out infinite na wskaźniku nieprzeczytanej wzmianki.

## 7. Ograniczenia Użytkowania

- Zachowaj ciemną powłokę, zwartą gęstość i hierarchię działań blurple razem; użycie blurple na jasnym układzie w stylu marketingowym niszczy klimat produktu Discord.
- Utrzymuj powierzchnie o dużej nawigacji zorganizowane wokół listew, pasków bocznych i kolumn czatu, a nie izolowanych dekoracyjnych kart.
- Używaj języka zaokrąglonych kwadratowych awatarów i kropek statusu przy reprezentowaniu osób, serwerów lub aktywnej obecności.
