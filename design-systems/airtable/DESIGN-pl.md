# System projektowania inspirowany Airtable

> Category: Design i Kreatywność
> Hybryda arkusza kalkulacyjnego i bazy danych. Kolorowa, przyjazna, estetyka danych strukturalnych.

## 1. Motyw wizualny i atmosfera

Strona Airtable to czysta, przyjazna dla przedsiębiorstw platforma, która komunikuje „wyrafinowaną prostotę" poprzez białe płótno z głęboko granatowym tekstem (`#181d26`) i Airtable Blue (`#1b61c9`) jako głównym interaktywnym akcentem. Rodzina fontów Haas (warianty display i text) tworzy system typograficzny w stylu szwajcarskiej precyzji z dodatnim odstępem między literami w całym serwisie.

**Kluczowe cechy:**
- Białe płótno z głęboko granatowym tekstem (`#181d26`)
- Airtable Blue (`#1b61c9`) jako główny kolor CTA i linków
- Podwójny system fontów Haas + Haas Groot Disp
- Dodatni odstęp między literami w tekście podstawowym (0.08px–0.28px)
- Przyciski z promieniem 12px, karty 16px–32px
- Wielowarstwowy cień z niebieskim odcieniem: `rgba(45,127,249,0.28) 0px 1px 3px`
- Semantyczne tokeny motywu: nazewnictwo zmiennych CSS `--theme_*`

## 2. Paleta kolorów i role

### Podstawowe
- **Głęboki granat** (`#181d26`): Tekst podstawowy
- **Airtable Blue** (`#1b61c9`): Przyciski CTA, linki
- **Biały** (`#ffffff`): Główna powierzchnia
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semantyczne
- **Zielony sukcesu** (`#006400`): `--theme_success-text`
- **Słaby tekst** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Drugorzędny aktywny** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Neutralne
- **Ciemnoszary** (`#333333`): Tekst drugorzędny
- **Niebieski średni** (`#254fad`): Wariant niebieskiego dla linków/akcentu
- **Obramowanie** (`#e0e2e6`): Obramowania kart
- **Jasna powierzchnia** (`#f8fafc`): Subtelna powierzchnia

### Cienie
- **Niebieski odcień** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Miękki** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Zasady typografii

### Rodziny fontów
- **Podstawowy**: `Haas`, zapasowe: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, zapasowy: `Haas`

### Hierarchia

| Rola | Font | Rozmiar | Grubość | Wysokość linii | Odstęp liter |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Pogrubiony | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Nagłówek sekcji | Haas | 40px | 400 | 1.25 | normal |
| Podnagłówek | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Tytuł karty | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Funkcja | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Treść | Haas | 18px | 400 | 1.35 | 0.18px |
| Treść Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Przycisk | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Podpis | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Stylizacja komponentów

### Przyciski
- **Niebieski podstawowy**: `#1b61c9`, biały tekst, padding 16px 24px, promień 12px
- **Biały**: białe tło, tekst `#181d26`, promień 12px, białe obramowanie 1px
- **Zgoda na cookies**: tło `#1b61c9`, promień 2px (ostry)

### Karty: `1px solid #e0e2e6`, promień 16px–24px
### Pola wejściowe: Standardowa stylizacja Haas

## 5. Układ
- Odstępy: 1–48px (baza 8px)
- Promień: 2px (mały), 12px (przyciski), 16px (karty), 24px (sekcje), 32px (duży), 50% (koła)

## 6. Głębia
- Wielowarstwowy system cieni z niebieskim odcieniem
- Miękkie otoczenie: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Co robić i czego unikać
### Robić: Używać Airtable Blue dla CTA, Haas z dodatnim trackingiem, przyciski z promieniem 12px
### Unikać: Pomijać dodatni odstęp między literami, używać ciężkich cieni

## 8. Zachowanie responsywne
Punkty przełamania: 425–1664px (23 punkty przełamania)

## 9. Przewodnik po promptach dla Agent
- Tekst: Głęboki granat (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Tło: Biały (`#ffffff`)
- Obramowanie: `#e0e2e6`
