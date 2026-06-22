# System Projektowy Inspirowany OpenAI

> Category: AI i LLM
> Spokojny, niemal monochromatyczny system zakotwiczony w głębokiej czerni z odcieniem teal, obfitymi białymi przestrzeniami i typografią o charakterze redakcyjnym.

## 1. Motyw Wizualny i Atmosfera

Warstwa produktowa OpenAI wygląda jak laboratorium badawcze przygotowane na spotkanie z publicznością — kliniczna, powściągliwa, celowo cicha. Tło strony to czysta biel (`#ffffff`) nałożona na niemal czarny atrament (`#0d0d0d`) z subtelnym odcieniem teal, dzięki czemu nawet tekst sprawia wrażenie chłodniejszego, a nie agresywnie ciemnego. Efektem jest chromatyczna neutralność, która wysuwa na pierwszy plan wyniki modeli, kod i prozę — a nie oprawę wokół nich.

Charakterystycznym zabiegiem jest zastosowanie **Söhne** (lub systemowego odpowiednika `inter`) w umiarkowanych grubościach — 400 dla treści, 500 dla nawigacji i etykiet, 600 dla wyróżnień — w połączeniu z **Signifier**, współczesnym szeryfem używanym do redakcyjnych nagłówków wyróżniających. Podczas gdy większość marek AI skłania się ku futuryzmowi, szeryfowe nagłówki OpenAI nadają produktowi spokojnie literacki ton, jakby każde ogłoszenie było esejem.

System kształtów jest jednolicie miękki: promienie 8px–12px, pigułki 9999px dla tagów i chipów, bez ostrych narożników. Przejścia między sekcjami są zaznaczone białą przestrzenią, a nie separatorami; gdy pojawiają się obramowania, są to linie `#e5e5e5` grubości włosa, które wyglądają raczej jak nieobecność koloru niż jego obecność.

**Kluczowe Cechy:**
- Czyste białe płótno (`#ffffff`) z głębokim atramentowym czarnym z odcieniem teal (`#0d0d0d`)
- Söhne / Inter w skromnych grubościach (400, 500, 600) — powściągliwość ponad asertywność
- Szeryfowy Signifier do redakcyjnych nagłówków wyróżniających
- Miękkie promienie 8–12px wszędzie; pigułki 9999px dla chipów
- Obramowania grubości włosa (`#e5e5e5`) używane oszczędnie; biała przestrzeń jako główny separator
- Jednokolorowe ilustracje w głębokim kolorze teal — bez gradientów w znakach
- Hojny line-height (1.55–1.65) i tracking bliski zeru

## 2. Paleta Kolorów i Role

### Podstawowe
- **Czysta Biel** (`#ffffff`): Główne tło, powierzchnia kart, tło przycisków.
- **Czarny Atrament** (`#0d0d0d`): Główny tekst, znak firmowy, główne CTA.
- **Miękka Czerń** (`#1a1a1a`): Drugorzędne nagłówki, alternatywny atrament dla mniej istotnego tekstu.

### Powierzchnia i Tło
- **Mgła** (`#fafafa`): Tło przerwy sekcji, powierzchnia stopki.
- **Perła** (`#f5f5f5`): Powierzchnia kart, podwyższony panel.
- **Chmura** (`#ececec`): Tło elementów wyłączonych, odcień separatora.

### Akcent Marki
- **OpenAI Teal** (`#10a37f`): Główny kolor marki, linki, wyróżnione odznaki — jedyny kolor w skądinąd neutralnym systemie.
- **Teal Głęboki** (`#0a7a5e`): Stan najechania i wciśnięcia dla koloru marki.
- **Teal Miękki** (`#e8f5f0`): Odcień powierzchni dla odznak sukcesu, wyróżnionych objaśnień.

### Neutralne i Tekstowe
- **Grafit** (`#3c3c3c`): Tekst treści, domyślny kolor do czytania.
- **Łupek** (`#6e6e6e`): Tekst drugorzędny, podpisy, metadane.
- **Popiół** (`#9b9b9b`): Tekst trzeciorzędny, placeholder, wyłączona etykieta.
- **Kamień** (`#c4c4c4`): Dekoracyjne separatory, delikatne ikony.

### Semantyczne i Obramowania
- **Obramowanie Włos** (`#e5e5e5`): Standardowy separator grubości włosa.
- **Obramowanie Miękkie** (`#ededed`): Kontur karty na białej powierzchni.
- **Błąd** (`#ef4146`): Walidacja, akcja destrukcyjna.
- **Ostrzeżenie** (`#f5a623`): Miękki bursztyn dla stanów doradczych.
- **Informacja** (`#2563eb`): Ton linku informacyjnego (używany oszczędnie; teal nadal dominuje).

## 3. Zasady Typografii

### Rodzina Czcionek
- **Wyróżniająca / Redakcyjna**: `Signifier`, z awaryjną: `'Source Serif Pro', Georgia, serif`
- **Treść / UI**: `Söhne`, z awaryjną: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Kod / Mono**: `Söhne Mono`, z awaryjną: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Line Height | Letter Spacing | Uwagi |
|------|----------|---------|---------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Redakcyjne hero, tytuły ogłoszeń |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Nagłówek strony |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Nagłówek sekcji |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Podsekcja |
| Body Large | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Akapity wprowadzające |
| Body | Söhne | 16px (1rem) | 400 | 1.65 | normal | Standardowy tekst do czytania |
| Body Small | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Treść kart, gęsty UI |
| Caption | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadane, odznaki |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Eyebrow, linki nawigacji pisane wersalikami |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Bloki kodu, wyjście terminala |

### Zasady
- **Powściągliwość jako tożsamość**: grubości nie przekraczają 600; 700+ wygląda niezgodnie z marką. Hierarchia wynika z rozmiaru i koloru, a nie grubości.
- **Szeryfowy dla duszy, bezszeryfowy dla systemu**: Signifier pojawia się wyłącznie w redakcyjnych momentach wyróżniających. UI produktu jest wyłącznie bezszeryfowe.
- **Ujemny tracking w display**: -0.02em dla rozmiarów display; tracking wraca do zera przy 16px.

## 4. Style Komponentów

### Przyciski

**Główny**
- Tło: `#0d0d0d`
- Tekst: `#ffffff`
- Padding: 10px 18px
- Radius: 9999px (pełna pigułka) dla chipów, 12px dla prostokątnych CTA
- Najechanie: tło `#1a1a1a`
- Zastosowanie: Główne CTA, "Wypróbuj ChatGPT", "Zaloguj się"

**Drugorzędny**
- Tło: `#ffffff`
- Tekst: `#0d0d0d`
- Obramowanie: 1px solid `#e5e5e5`
- Padding: 10px 18px
- Radius: 12px
- Najechanie: tło `#fafafa`, obramowanie `#d4d4d4`

**Akcent Marki**
- Tło: `#10a37f`
- Tekst: `#ffffff`
- Padding: 10px 18px
- Radius: 12px
- Najechanie: `#0a7a5e`
- Zastosowanie: Wyróżnione CTA uaktualnienia, ścieżka sukcesu

### Karty
- Tło: `#ffffff`
- Obramowanie: 1px solid `#ededed`
- Radius: 16px
- Padding: 24px–32px
- Cień: brak domyślnie; przy najechaniu `0 4px 16px rgba(13,13,13,0.06)`

### Pola Wprowadzania
- Tło: `#ffffff`
- Obramowanie: 1px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 14px
- Fokus: obramowanie `#10a37f`, pierścień `0 0 0 3px rgba(16,163,127,0.12)`

### Pigułki i Tagi
- Tło: `#f5f5f5`
- Tekst: `#3c3c3c`
- Padding: 4px 10px
- Radius: 9999px
- Czcionka: 12px / 500

## 5. Odstępy i Układ

- **Jednostka bazowa**: 4px. Skala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Kontener**: max-width 1200px, guttera 24px na urządzeniach mobilnych, 48px na komputerach.
- **Rytm sekcji**: 96–128px w pionie między głównymi sekcjami; 64px na urządzeniach mobilnych.
- **Siatka**: 12 kolumn na komputerze, 4 kolumny na urządzeniach mobilnych, przerwa 24px.

## 6. Ruch

- **Czas trwania**: 150–220ms dla najechania; 280–360ms dla przejść układu.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (płynne wyjście) dla wejść.
- **Powściągliwość**: bez paralaksy, bez scroll-jacking. Jedynie subtelne zanikanie i przesunięcie.

## 7. Wytyczne Użytkowania

- Zachowaj razem neutralną powściągliwość redakcyjną, miękki radius i rzadkie użycie akcentu; same zielone akcenty nie tworzą powierzchni w stylu OpenAI.
- Używaj momentów wyróżniających w stylu Signifier wyłącznie dla hierarchii redakcyjnej lub ogłoszeń, pozostawiając kontrolki produktu w systemie bezszeryfowym.
- Unikaj ozdobnego ruchu, ciężkich cieni i przesadnie dużych dekoracyjnych kart; system powinien sprawiać wrażenie spokojnego, czytelnego i przemyślanego.
