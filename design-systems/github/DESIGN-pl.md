# System projektowy inspirowany GitHub

> Category: Narzędzia deweloperskie
> Platforma zorientowana na kod. Gęstość funkcjonalna, precyzja niebieskiego na białym, fundamenty Primer.

## 1. Motyw wizualny i atmosfera

Powierzchnia GitHub jest zaprojektowana, nie ozdobiona. Każdy piksel wyraża stanowisko: to narzędzie dla osób, którym zależy na diffach, buildach i pull requestach. Tło strony to czysty `#ffffff` (jasny) lub `#0d1117` (ciemny), a treść rozmieszczona jest na gęstych prostokątnych panelach oddzielonych cienkimi ramkami zamiast pustą przestrzenią. Gęstość informacji to marka — wiersze list, linie kodu, nagłówki repozytoriów i karty powiadomień są ściśle upakowane, aby zaawansowany użytkownik mógł przeskanować sto elementów bez przewijania.

Charakterystyczne akcenty to **Primer blue** (`#0969da`) dla łączy i podstawowych akcji oraz **GitHub green** (`#1a7f37`) dla scalonych stanów, sukcesów i samego przycisku scalania. Oba wyglądają nieco stonowanie w porównaniu z niebieskim i zielonym w produktach konsumenckich — wystarczająco nasycone, by odczytywać się na tle gęstego szarego tekstu, na tyle powściągliwe, by znikać w tle, gdy kilka z nich pojawi się w jednym widoku.

Typografia używa stosu **system-ui** w całym produkcie, dzięki czemu tekst renderuje się ostro na każdym systemie operacyjnym, w parze z **SFMono / Menlo / Consolas** dla kodu. Nie ma editorial display fontu; głosem GitHub jest głos systemu, na którym już pracujesz.

**Kluczowe cechy:**
- Czysto białe płótno (`#ffffff`) lub głęboka granatowa czerń (`#0d1117`) — bez ciepła, bez odcienia
- Cienkie szare ramki (`#d0d7de`) definiują każdy panel
- Primer blue (`#0969da`) dla łączy/podstawowych; GitHub green (`#1a7f37`) dla sukcesu/scalania
- system-ui dla prozy; SFMono dla kodu — brak niestandardowego kroju pisma
- Gęste wiersze list z minimalnym paddingiem; białe przestrzenie są rzadkością
- Ikonografia Octicon w rozmiarze 16px / 24px — pojedynczy obrys, geometryczna, spójna
- Odznaki statusu w kształcie pigułki z mocną semantyką kolorów

## 2. Paleta kolorów i role

### Podstawowe
- **Canvas Default** (`#ffffff`): Główne tło strony, jasny motyw.
- **Canvas Subtle** (`#f6f8fa`): Drugorzędna powierzchnia, pasek boczny, tło pola wprowadzania, pasek nagłówka.
- **Canvas Inset** (`#eaeef2`): Tło bloku kodu, głęboko wklęsła powierzchnia.
- **Fg Default** (`#1f2328`): Podstawowy tekst, nagłówki, tusz.
- **Fg Muted** (`#656d76`): Drugorzędny tekst, podpisy, ścieżki plików.

### Akcent marki
- **Primer Blue** (`#0969da`): Łącza, główne CTA, podstawa pierścienia fokusa — uniwersalny kolor interaktywny.
- **Primer Blue Hover** (`#0550ae`): Stan najechania/wciśnięcia dla podstawowego niebieskiego.
- **Accent Subtle** (`#ddf4ff`): Delikatna niebieska powierzchnia dla wyróżnień, banerów informacyjnych.

### Semantyczne
- **Success / Merge Green** (`#1a7f37`): Scalone PR, odznaki sukcesu, przycisk scalania.
- **Success Subtle** (`#dafbe1`): Odcień powierzchni sukcesu.
- **Open Green** (`#1a7f37`): Stan „Open" dla issue/PR.
- **Closed / Danger Red** (`#cf222e`): Zamknięte PR, działanie destrukcyjne, błąd walidacji.
- **Danger Subtle** (`#ffebe9`): Powierzchnia banera błędu.
- **Attention / Warning Yellow** (`#9a6700`): Tekst ostrzeżenia na bursztynowej powierzchni.
- **Attention Subtle** (`#fff8c5`): Powierzchnia banera ostrzeżenia.
- **Done Purple** (`#8250df`): Scalone i zarchiwizowane, stan „done", odznaka premium.
- **Sponsor Pink** (`#bf3989`): Serce sponsorów, marka GitHub Sponsors.

### Ramka i separator
- **Border Default** (`#d0d7de`): Standardowa cienka ramka, obrys panelu.
- **Border Muted** (`#d8dee4`): Wewnętrzne separatory w panelu.
- **Border Subtle** (`#eaeef2`): Słabe separatory wierszy tabeli.

### Ciemny motyw
- **Dark Canvas** (`#0d1117`): Ciemne tło strony.
- **Dark Surface** (`#161b22`): Pasek boczny, nagłówek, drugorzędna powierzchnia.
- **Dark Border** (`#30363d`): Standardowa ramka w trybie ciemnym.
- **Dark Fg** (`#e6edf3`): Podstawowy tekst na ciemnym tle.

## 3. Zasady typografii

### Rodzina czcionek
- **Body / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hierarchia

| Rola | Czcionka | Rozmiar | Grubość | Wysokość linii | Odstęp liter | Uwagi |
|------|----------|---------|---------|----------------|--------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Nagłówek repo, hero marketingowy |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Nagłówek strony |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Nagłówek sekcji |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Podsekcja, nagłówek panelu |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Domyślny rozmiar tekstu — nie 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Podpisy, metadane pliku |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Bloki kodu, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Wbudowane fragmenty `code` |

### Zasady
- **14px body, nie 16px**: Gęstość prozy GitHub to jego tożsamość. Produkt renderuje przy 14px, by zmieścić więcej wierszy w widoku.
- **Grubość binarna**: 400 dla wszystkiego domyślnie; 600 dla nagłówków i wyróżnień. Bez 500, bez 700.
- **Zawsze czcionki systemowe**: nigdy nie ładuj webfontu dla chrome — tekst musi renderować się natychmiast przy wolnym połączeniu.

## 4. Style komponentów

### Przyciski

**Primary (Green)**
- Tło: `#1f883d`
- Tekst: `#ffffff`
- Ramka: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Cień: `0 1px 0 rgba(31,35,40,0.1)`
- Najechanie: tło `#1a7f37`
- Użycie: „Create repository", „Merge pull request"

**Default**
- Tło: `#f6f8fa`
- Tekst: `#1f2328`
- Ramka: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Najechanie: tło `#f3f4f6`, ramka `#d0d7de`

**Outline (Blue Link Style)**
- Tło: `#ffffff`
- Tekst: `#0969da`
- Ramka: 1px solid `#d0d7de`
- Najechanie: tło `#0969da`, tekst `#ffffff`

**Danger**
- Tło: `#ffffff`
- Tekst: `#cf222e`
- Ramka: 1px solid `#d0d7de`
- Najechanie: tło `#a40e26`, tekst `#ffffff`, ramka `#a40e26`

### Karty / Boksy
- Tło: `#ffffff`
- Ramka: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (nagłówek) + 16px (treść)
- Nagłówek ma pasek `#f6f8fa` z dolną ramką.

### Pola wprowadzania
- Tło: `#ffffff`
- Ramka: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Fokus: ramka `#0969da`, pierścień `0 0 0 3px rgba(9,105,218,0.3)`

### Odznaki statusu (Issue / PR)
- **Open**: tło `#1a7f37`, tekst biały, padding 4px 10px, radius 9999px.
- **Closed**: tło `#cf222e`, tekst biały.
- **Merged**: tło `#8250df`, tekst biały.
- **Draft**: tło `#6e7781`, tekst biały.

### Etykiety (tagi na Issues/PRach)
- Padding: 0 7px
- Radius: 9999px
- Czcionka: 12px / 500
- Tło i tekst są programowe (kolor etykiety → tekst obliczany dla kontrastu).

## 5. Odstępy i układ

- **Jednostka bazowa**: 4px. Skala odstępów: 4, 8, 12, 16, 24, 32, 40, 48.
- **Maksymalna szerokość strony**: 1280px (`Container-xl`).
- **Pasek boczny**: 296px na desktopie, zwija się poniżej 1012px.
- **Padding wiersza**: 16px poziomo, 12px pionowo (listy są gęste z założenia).

## 6. Ruch

- **Czas trwania**: 80ms dla najechania; 200ms dla otwarcia menu/popovers.
- **Wygładzanie**: `ease-out` dla otwarć, `ease-in` dla zamknięć.
- **Unikane**: animacje ładowania strony, parallax, trwałe mikrointerakcje. Rzeczy się pojawiają; nie performują.

## 7. Wytyczne użytkowania

- Utrzymuj gęste listy, obramowane boksy i czcionki systemowe razem; izolowane zielone przyciski nie wystarczą, by stworzyć powierzchnię produktu podobną do GitHub.
- Używaj zielonego dla konstruktywnych akcji repozytoriów, niebieskiego dla łączy i fokusa, a czerwonego/fioletowego/szarego wyłącznie dla stanów issue, PR i workflow.
- Preferuj spokojne chrome, wyraźne ramki i kompaktowe odstępy zamiast dekoracyjnych cieni lub dużych kart w stylu marketingowym.
