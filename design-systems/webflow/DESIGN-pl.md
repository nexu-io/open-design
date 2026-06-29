# System projektowania inspirowany Webflow

> Category: Design i kreatywność
> Wizualny kreator stron. Dopracowana estetyka strony marketingowej z niebieskimi akcentami.

## 1. Motyw wizualny i atmosfera

Strona Webflow to bogata wizualnie, narzędziowa platforma, która komunikuje "design bez kodu" przez czyste białe powierzchnie, charakterystyczny niebieski Webflow（`#146ef5`）i bogatą drugorzędną paletę kolorów（fioletowy, różowy, zielony, pomarańczowy, żółty, czerwony）. Niestandardowa czcionka WF Visual Sans Variable tworzy pewny i precyzyjny system typografii z wagą 600 dla nagłówków i 500 dla treści.

**Kluczowe cechy：**
- Biały kanwas z tekstem niemal czarnym（`#080808`）
- Niebieski Webflow（`#146ef5`）jako główny kolor marki i interakcji
- WF Visual Sans Variable — niestandardowa czcionka zmienna z wagą 500–600
- Bogata paleta drugorzędna：fioletowy `#7a3dff`, różowy `#ed52cb`, zielony `#00d722`, pomarańczowy `#ff6b00`, żółty `#ffae13`, czerwony `#ee1d36`
- Konserwatywny promień krawędzi 4px–8px — ostry, nieokrągły
- Wielowarstwowe stosy cieni（5-warstwowe kaskadowe cienie）
- Etykiety z dużych liter：10px–15px, waga 500–600, szerokie odstępy（0,6px–1,5px）
- Animacja translate(6px) przy najechaniu na przyciski

## 2. Paleta kolorów i role

### Podstawowy
- **Niemal Czarny**（`#080808`）：Tekst główny
- **Niebieski Webflow**（`#146ef5`）：`--_color---primary--webflow-blue`, główne CTA i linki
- **Niebieski 400**（`#3b89ff`）：`--_color---primary--blue-400`, jaśniejszy niebieski interaktywny
- **Niebieski 300**（`#006acc`）：`--_color---blue-300`, ciemniejszy wariant niebieskiego
- **Niebieski hover przycisku**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Akcenty drugorzędne
- **Fioletowy**（`#7a3dff`）：`--_color---secondary--purple`
- **Różowy**（`#ed52cb`）：`--_color---secondary--pink`
- **Zielony**（`#00d722`）：`--_color---secondary--green`
- **Pomarańczowy**（`#ff6b00`）：`--_color---secondary--orange`
- **Żółty**（`#ffae13`）：`--_color---secondary--yellow`
- **Czerwony**（`#ee1d36`）：`--_color---secondary--red`

### Neutralny
- **Szary 800**（`#222222`）：Ciemny tekst drugorzędny
- **Szary 700**（`#363636`）：Tekst środkowy
- **Szary 300**（`#ababab`）：Wyciszony tekst, symbol zastępczy
- **Szary środkowy**（`#5a5a5a`）：Tekst linku
- **Szary krawędzi**（`#d8d8d8`）：Krawędzie, rozdzielacze
- **Krawędź hover**（`#898989`）：Krawędź przy najechaniu

### Cienie
- **Kaskada 5-warstwowa**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Zasady typografii

### Czcionka：`WF Visual Sans Variable`, zapasowa：`Arial`

| Rola | Rozmiar | Waga | Wysokość wiersza | Odstęp liter | Uwagi |
|------|------|--------|-------------|----------------|-------|
| Hero wyświetlacza | 80px | 600 | 1,04 | -0,8px | |
| Nagłówek sekcji | 56px | 600 | 1,04 | normal | |
| Podtytuł | 32px | 500 | 1,30 | normal | |
| Tytuł funkcji | 24px | 500–600 | 1,30 | normal | |
| Treść | 20px | 400–500 | 1,40–1,50 | normal | |
| Standardowa treść | 16px | 400–500 | 1,60 | -0,16px | |
| Przycisk | 16px | 500 | 1,60 | -0,16px | |
| Etykieta wielkich liter | 15px | 500 | 1,30 | 1,5px | uppercase |
| Podpis | 14px | 400–500 | 1,40–1,60 | normal | |
| Odznaka wielkich liter | 12,8px | 550 | 1,20 | normal | uppercase |
| Mikro wielkich liter | 10px | 500–600 | 1,30 | 1px | uppercase |
| Kod：Inconsolata（towarzysząca czcionka o stałej szerokości）

## 4. Stylizacja komponentów

### Przyciski
- Przezroczysty：tekst `#080808`, translate(6px) przy najechaniu
- Biały okrąg：promień 50%, białe tło
- Niebieska odznaka：tło `#146ef5`, promień 4px, waga 550

### Karty：`1px solid #d8d8d8`, promień 4px–8px
### Odznaki：tło z niebieskim odcieniem przy 10% kryciu, promień 4px

## 5. Układ
- Odstępy：skala ułamkowa（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Promień：2px, 4px, 8px, 50% — konserwatywny, ostry
- Punkty przerwania：479px, 768px, 992px

## 6. Głębia：5-warstwowy kaskadowy system cieni

## 7. Co robić i czego unikać
- Robić：Używać WF Visual Sans Variable z wagą 500–600. Niebieski（`#146ef5`）dla CTA. Promień 4px. translate(6px) przy najechaniu.
- Unikać：Zaokrąglać elementy funkcjonalne powyżej 8px. Używać kolorów drugorzędnych na głównych CTA.

## 8. Responsywny：479px, 768px, 992px

## 9. Przewodnik po promptach dla Agent
- Tekst：Niemal Czarny（`#080808`）
- CTA：Niebieski Webflow（`#146ef5`）
- Tło：Biały（`#ffffff`）
- Krawędź：`#d8d8d8`
- Drugorzędny：Fioletowy `#7a3dff`, Różowy `#ed52cb`, Zielony `#00d722`
