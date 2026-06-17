# System projektowania inspirowany Duolingo

> Category: Produktywność i SaaS
> Platforma do nauki języków. Jaskrawa zieleń sowy, grubaśne cienie, grywalizowana radość.

## 1. Motyw wizualny i atmosfera

Duolingo to grywalizacja jako język wizualny. Interfejs jest bezwstydnie jaskrawy, z **zielenią sowy** (`#58cc02`) jako głównym kolorem marki i grubym cieniem 4px u dołu każdego elementu interaktywnego, który wygląda jak przycisk 3D czekający na naciśnięcie. Strona jest biała (`#ffffff`) z grubymi obramowaniami 2–3px w ciemnej szarości (`#e5e5e5`), a cały system przypomina aplikację iOS z 2015 roku odrodzoną z lepszą hierarchią.

Typografia używa **Feather Bold** (niestandardowy zaokrąglony bezszeryfowy) dla chrome i **Mona Sans** (lub Inter) dla treści. Rozmiary wyświetlania są duże i pewne siebie — Duolingo nigdy nie szepcze. Nagłówki często noszą zielony podkreślony pociągnięcie lub siedzą na zielonej pigułce, a maskotka Duo (zielona sowa) pojawia się jako aktywna postać ilustracyjna, a nie statyczne logo.

Język kształtów jest przyjazny: promienie 16–20px na kartach, 12px na przyciskach, 9999px na chipach i paskach postępu. Ikonografia jest wypełniona, zaokrąglona i kodowana kolorami według umiejętności — każda powierzchnia lekcji ma natychmiast rozpoznawalną parę kolorów.

**Kluczowe cechy:**
- Zieleń sowy (`#58cc02`) jako dominujący kolor marki, używany na ponad 30% powierzchni
- Gruby cień dolny 4px na każdym przycisku (afordancja „dotykowego naciśnięcia")
- Solidne obramowania 2–3px, nigdy cienkie linie
- Feather Bold (zaokrąglony wyświetlacz) + Mona Sans (treść)
- Duży pewny tekst — rozmiary wyświetlania zaczynają się od 48px i rosną
- Maskotka jako postać: sowa Duo pojawia się podczas onboardingu, błędów, serii
- Pomarańcz serii (`#ff9600`) i różowy klejnot (`#ce82ff`) jako drugorzędne kolory marki

## 2. Paleta kolorów i role

### Podstawowe
- **Zieleń sowy** (`#58cc02`): Główny kolor marki, podstawowe CTA, poprawna odpowiedź.
- **Głęboka zieleń sowy** (`#58a700`): Kolor naciśnięcia/cienia dla zielonych przycisków.
- **Jasna zieleń sowy** (`#89e219`): Najechanie, delikatne wypełnienia.
- **Blada zieleń sowy** (`#dbf8c5`): Delikatna powierzchnia, baner sukcesu.

### Drugorzędne akcenty
- **Pomarańcz serii** (`#ff9600`): Licznik serii, ikona ognia, energia premium.
- **Głęboka pomarańcz serii** (`#cc7a00`): Naciśnięta pomarańcz.
- **Różowy klejnot** (`#ce82ff`): Waluta klejnotów, Super Duolingo.
- **Niebieski węgorz** (`#1cb0f6`): Przycisk podpowiedzi, link informacyjny.
- **Czerwień kardynała** (`#ff4b4b`): Błędna odpowiedź, utrata życia.
- **Żółty pszczoły** (`#ffc800`): Odznaka pro, osiągnięcie.

### Powierzchnia
- **Śnieg** (`#ffffff`): Główne tło.
- **Węgorz** (`#f7f7f7`): Przerwa sekcji, drugorzędna powierzchnia.
- **Łabędź** (`#e5e5e5`): Wyłączone tło, blok wbudowany.
- **Wilk** (`#777777`): Ciemny separator, drugorzędny tekst.

### Tusz i tekst
- **Czarny węgorz** (`#3c3c3c`): Główny tekst.
- **Wilk** (`#777777`): Drugorzędny tekst, podpisy.
- **Zając** (`#afafaf`): Wyłączony, symbol zastępczy.

### Obramowanie
- **Łabędź** (`#e5e5e5`): Standardowe obramowanie 2px.
- **Zając** (`#afafaf`): Podkreślone obramowanie po najechaniu.

## 3. Zasady typografii

### Rodzina czcionek
- **Wyświetlacz / UI / Nagłówki**: `Feather Bold`, z rezerwą: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Treść / Długi tekst**: `Mona Sans`, z rezerwą: `'Helvetica Neue', system-ui, sans-serif`
- **Kod (rzadko, szkoły/admin)**: `JetBrains Mono`, z rezerwą: `ui-monospace, Menlo, monospace`

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość wiersza | Odstęp | Uwagi |
|------|------|------|--------|-------------|----------------|-------|
| Wyświetlacz | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Bohater onboardingu |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Tytuł strony |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Nagłówek sekcji |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Tytuł karty, wiersz lekcji |
| Duża treść | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Podpowiedź lekcji, instrukcja |
| Treść | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Standardowa proza |
| Podpis | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Licznik XP, metadane |
| Przycisk | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Standardowa etykieta przycisku |
| Seria | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Numer serii, na płomieniu |

### Zasady
- **800 to wartość domyślna**: Feather Bold działa na 800 na nagłówkach i przyciskach. 700 wygląda słabo w tym systemie.
- **Duży tekst**: rozmiary nagłówków są 25–40% większe niż typowe marki produktów — pewność siebie jako tożsamość.
- **Zaokrąglone kształty liter**: każdy glif ma miękkie zakończenia; ostre szeryfowe złamałyby kontrakt przyjazności.

## 4. Stylizacja komponentów

### Przyciski

**Podstawowy (Zieleń sowy)**
- Tło: `#58cc02`
- Tekst: `#ffffff`
- Wypełnienie: 14px 24px
- Promień: 16px
- Border-bottom: 4px solid `#58a700` (gruby cień)
- Najechanie: tło `#89e219`
- Aktywny: translate-y 4px, border-bottom 0 (przycisk „wciska się")
- Użycie: „Kontynuuj", „Sprawdź", główne CTA.

**Drugorzędny (Biały z dolnym cieniem)**
- Tło: `#ffffff`
- Tekst: `#777777`
- Obramowanie: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Promień: 16px
- Wypełnienie: 14px 24px
- Najechanie: tekst `#3c3c3c`, obramowanie `#afafaf`

**Pomarańcz serii**
- Tło: `#ff9600`
- Tekst: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Użycie: cel serii, „Rozpocznij serię"

**Błąd (Czerwień kardynała)**
- Tło: `#ff4b4b`
- Tekst: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Użycie: informacja zwrotna o błędnej odpowiedzi.

### Karty / Kafelki lekcji
- Tło: `#ffffff`
- Obramowanie: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Promień: 16px
- Wypełnienie: 16px
- Najechanie: unieść o 2px, cień `0 4px 0 #d7d7d7`

### Węzeł drzewa umiejętności (Bąbel lekcji)
- Rozmiar: 80×72px
- Tło: odcień koloru umiejętności (zielony dla aktywnego, szary dla zablokowanego)
- Border-bottom: 6px solid ciemniejszy wariant
- Promień: 50% (okrągły)
- Aktywny: pulsuje 1.0 → 1.05 co 1.6s

### Pola wejściowe
- Tło: `#ffffff`
- Obramowanie: 2px solid `#e5e5e5`
- Promień: 12px
- Wypełnienie: 12px 16px
- Focus: obramowanie `#1cb0f6` (niebieski węgorz), pierścień `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Pasek postępu
- Tor: `#e5e5e5`
- Wypełnienie: `#58cc02` (lub `#ff9600` dla serii)
- Promień: 9999px
- Wysokość: 16px
- Animowane wypełnienie: 320ms ease-out przy przyroście.

## 5. Odstępy i układ

- **Jednostka podstawowa**: 4px. Skala: 4, 8, 12, 16, 24, 32, 48, 64.
- **Kontener**: maks. 1080px, rynna 24px.
- **Kolumna drzewa lekcji**: 320px szerokości; wyśrodkowana na pulpicie.

## 6. Ruch

- **Czas trwania**: 180ms dla naciśnięcia przycisku; 320ms dla odblokowania węzła umiejętności; 1.6s dla pulsu aktywnego węzła.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, lekkie przekroczenie) dla odblokowań.
- **Maskotka**: Duo mruga co 4–6s, skacze przy kamieniach milowych serii (480ms ease-out sprężyna).

## 7. Wytyczne użytkowania

- Zachowaj razem mocno nasyconą zieleń sowy, grube dolne cienie i zaokrągloną geometrię lekcji; same płaskie zielone przyciski nie brzmią jak Duolingo.
- Zarezerwuj duży pogrubiony tekst dla momentów lekcji, serii i postępu, w których produkt potrzebuje zachęty lub informacji zwrotnej.
- Używaj żywiołowego ruchu oszczędnie przy zmianach stanu postępu, unikając generycznych odbijających się animacji na każdym kontrolce.
