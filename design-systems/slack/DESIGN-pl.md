# System Projektowania Inspirowany Slackiem

> Category: Produktywność & SaaS
> Platforma komunikacji w miejscu pracy. Aubergine jako kolor główny, wieloakcentowa paleta logo, jasne powierzchnie z ciemnym paskiem bocznym, ciepły i przystępny charakter.

## 1. Temat Wizualny & Atmosfera

Tożsamość Slacka buduje się wokół idei, że praca powinna być ludzka, a nawet trochę zabawna. Kanoniczna powierzchnia jest **jasna** — białe obszary treści z głębokim paskiem bocznym w kolorze aubergine (`#4A154B`) — co jest odwrotnością narzędzi stawiających na ciemny motyw. Ten kontrast jest zamierzony: pasek boczny to spokojna, zawsze widoczna kotwica nawigacyjna, podczas gdy obszar treści jest jasny i otwarty.

Paleta logo — niebieska, zielona, żółta, czerwona — pojawia się głównie w ikonie hashtagu i materiałach marketingowych, a nie rozrzucona po całym interfejsie. W samym produkcie Slack stosuje powściągliwy, profesjonalny system kolorów z aubergine jako jedyną kotwicą marki.

**Kluczowe Cechy:**
- Jasne powierzchnie treści: biały `#FFFFFF` i prawie biały `#F8F8F8`
- Głęboki aubergine `#4A154B` w pasku bocznym — najbardziej rozpoznawalny element UI marki
- Cztery kolory akcentowe logo (niebieski, zielony, żółty, czerwony) używane oszczędnie tylko jako wyróżniki
- Larsseit dla nagłówków (marketing), systemowy sans-serif dla UI
- Zaokrąglone, ale nie kreskówkowe: promień 4–8px w większości komponentów
- Gęsty, ale oddychający: zwarte wiersze wiadomości z wyraźną hierarchią wątków
- Ciepły i konwersacyjny ton — emoji, reakcje i ilustracje są równoprawnym elementem

---

## 2. Paleta Kolorów & Role

### Kolor Główny Marki
| Token | Hex | Rola |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Tło paska bocznego, główny kolor marki |
| `--color-aubergine-dark` | `#350d36` | Stany hover na powierzchniach aubergine |
| `--color-aubergine-light` | `#611f69` | Podświetlenie aktywnego elementu w pasku bocznym |

### Kolory Akcentowe Logo (używać oszczędnie — tylko wyróżniki, ikony, marketing)
| Token | Hex | Nazwa | Rola |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Błękitny | Ikony kanałów, linki, stany informacyjne |
| `--color-green` | `#2EB67D` | Zieleń morska | Status online, stany sukcesu |
| `--color-yellow` | `#ECB22E` | Złoty | Status nieobecności, ostrzeżenia, wyróżnienia |
| `--color-red` | `#E01E5A` | Rubinowy | Powiadomienia, błędy, badge wzmianek |

### Powierzchnia & Tło
| Token | Hex | Rola |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Główny obszar wiadomości, okna modalne |
| `--bg-secondary` | `#F8F8F8` | Panele wątków, powierzchnie pomocnicze |
| `--bg-tertiary` | `#F1F1F1` | Tła pól wejściowych, stany hover |
| `--bg-sidebar` | `#4A154B` | Lewy pasek boczny (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover elementu paska bocznego |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Aktywny element paska bocznego |
| `--bg-message-hover` | `#F8F8F8` | Hover wiersza wiadomości |

### Kolory Tekstu
| Token | Hex | Rola |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Główny tekst treści (prawie czarny) |
| `--text-secondary` | `#616061` | Znaczniki czasu, wyciszone etykiety |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Nazwy kanałów w pasku bocznym |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Nieaktywne elementy paska bocznego |
| `--text-link` | `#1264A3` | Linki inline w wiadomościach |
| `--text-mention` | `#1264A3` | Kolor tekstu @wzmianki |

### Kolory Semantyczne
| Token | Hex | Rola |
|---|---|---|
| `--color-success` | `#2EB67D` | Toasty sukcesu, stany pozytywne |
| `--color-warning` | `#ECB22E` | Stany ostrzeżeń |
| `--color-danger` | `#E01E5A` | Stany błędów, destrukcyjne akcje |
| `--color-info` | `#36C5F0` | Wyróżnienia informacyjne |

### Obramowanie & Linia Podziału
| Token | Hex | Rola |
|---|---|---|
| `--border-default` | `#DDDDDD` | Standardowe linie podziału, obramowania kart |
| `--border-subtle` | `#F1F1F1` | Subtelne separatory między wierszami |
| `--border-focus` | `#1264A3` | Kolor pierścienia fokusowania |

---

## 3. Zasady Typografii

### Kroje Pisma
| Rola | Oficjalny | Zamiennik Web |
|---|---|---|
| Nagłówki Display / Marketing | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / Treść / Chrome | Slack Lato (własny) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Kod / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack używa **Larsseit** do nagłówków marketingowych i własnego wariantu Lato dla UI wewnątrz produktu. W zastosowaniach webowych `system-ui` jest najbezpieczniejszym zamiennikiem.

### Skala Typograficzna

| Poziom | Rozmiar | Grubość | Wysokość Linii | Odstęp Liter | Zastosowanie |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | Nagłówki hero w marketingu |
| Display L | 36px | 700 | 1.15 | -0.5px | Hero sekcji |
| Nagłówek 1 | 28px | 700 | 1.25 | normal | Tytuły okien modalnych, nagłówki stron |
| Nagłówek 2 | 22px | 700 | 1.3 | normal | Tytuły kart, sekcje ustawień |
| Nagłówek 3 | 18px | 700 | 1.35 | normal | Nagłówki podsekcji |
| Treść L | 16px | 400 | 1.5 | normal | Tekst wiadomości, opisy |
| Treść | 15px | 400 | 1.46667 | normal | Domyślny tekst UI (bazowy rozmiar Slacka) |
| Treść SM | 13px | 400 | 1.38462 | normal | Metadane pomocnicze |
| Podpis | 12px | 400 | 1.33 | normal | Znaczniki czasu, podpowiedzi |
| Kod | 12px | 400 | 1.5 | normal | Kod inline, bloki kodu |

### Zasady Typograficzne
- Bazowy rozmiar treści Slacka to **15px** — nieco mniejszy niż 16px dla większej gęstości
- Nieprzeczytane kanały: grubość 700 — pogrubienie jest głównym wskaźnikiem nieprzeczytania
- Znaczniki czasu: 12px `--text-secondary`, widoczne tylko po najechaniu
- Bloki kodu: tło `#F8F8F8`, obramowanie `1px solid #DDDDDD`, border-radius 4px
- Nigdy nie używać rozmiarów czcionki poniżej 12px
- Nagłówki marketingowe: letter-spacing `-1px` dla dużych rozmiarów display

---

## 4. Style Komponentów

### Przyciski

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Pola Wejściowe
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Element Kanału w Pasku Bocznym
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Badge Nieprzeczytanych
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Załączniki Wiadomości / Karty
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reakcje
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Zasady Układu

### Układ Trójkolumnowy
```
┌──────────────┬──────────────────────────────┬─────────────┐
│  Pasek Boczny│        Obszar Wiadomości      │   Wątek     │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │ opcjonalny  │
└──────────────┴──────────────────────────────┴─────────────┘
```

### System Odstępów (baza 4px)
| Token | Wartość | Zastosowanie |
|---|---|---|
| `--space-1` | 4px | Ciasne odstępy |
| `--space-2` | 8px | Padding komponentów |
| `--space-3` | 12px | Padding pól wejściowych |
| `--space-4` | 16px | Standardowy padding |
| `--space-6` | 24px | Padding kart |
| `--space-8` | 32px | Odstępy sekcji |

### Struktura Paska Bocznego
```
[Nazwa Obszaru Roboczego ▼]
────────────────────
Wątki
Wszystkie DM
Szkice i Wysłane
────────────────────
▼ Kanały
  # general
  # random
  # design  ● (nieprzeczytane)
────────────────────
▼ Wiadomości Bezpośrednie
  John Doe
  Jane Smith
```

### Kompozytor Wiadomości
- Przypięty do dołu obszaru wiadomości
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Pasek narzędzi: emoji, załącz, formatuj, przycisk wyślij

---

## 6. Głębia & Elewacja

Slack używa lekkich cieni na jasnej powierzchni:

| Poziom | Zastosowanie | Cień |
|---|---|---|
| Płaski | Wiersze wiadomości, elementy paska bocznego | none |
| Niski | Karty, pola wejściowe | `0 1px 3px rgba(0,0,0,0.08)` |
| Średni | Listy rozwijane, popovery | `0 4px 12px rgba(0,0,0,0.12)` |
| Wysoki | Okna modalne, dialogi | `0 8px 24px rgba(0,0,0,0.15)` |
| Nakładka | Tła okien modalnych | `rgba(0,0,0,0.5)` |

---

## 7. Zalecenia i Przestrogi

### ✅ Zalecane
- Używaj aubergine `#4A154B` dla paska bocznego — to najbardziej ikoniczny element UI Slacka
- Utrzymuj główny obszar treści biały i jasny
- Używaj `#1D1C1D` (prawie czarny) dla całego tekstu treści, nie czystej czerni
- Pogrubiaj nazwy kanałów, aby pokazać status nieprzeczytania — grubość jest wskaźnikiem
- Używaj czterech kolorów akcentowych tylko dla ról semantycznych (sukces, ostrzeżenie, niebezpieczeństwo, informacja)
- Stosuj `border-left: 4px` na załącznikach wiadomości i osadzonych elementach
- Pokazuj znaczniki czasu tylko po najechaniu
- Używaj `#1264A3` dla linków i stanów fokusowania
- Utrzymuj elementy paska bocznego zwarte: wysokość 28px, border-radius 6px

### ❌ Niezalecane
- Nie używaj ciemnego głównego obszaru treści — Slack preferuje jasny motyw
- Nie rozrzucaj niebieskich/zielonych/żółtych/czerwonych jako dekoracyjnych akcentów
- Nie używaj czystej czerni `#000000` dla tekstu
- Nie używaj dymków mowy — wiadomości to płaskie wiersze
- Nie nadawaj przyciskom dużego promienia — 4px to standard
- Nie pokazuj znaczników czasu na stałe
- Nie używaj WIELKICH LITER dla nazw kanałów
- Nie używaj rozmiarów czcionki poniżej 12px

---

## 8. Zachowanie Responsywne

### Punkty Przełamania
| Punkt Przełamania | Szerokość | Układ |
|---|---|---|
| Mobile | < 768px | Pojedynczy panel, pasek boczny jako lewy drawer |
| Tablet | 768–1024px | Tylko pasek boczny + obszar wiadomości |
| Desktop | > 1024px | Pełny układ trójkolumnowy |

### Adaptacje Mobilne
- Pasek boczny: lewy drawer, przeciągnij w prawo, aby otworzyć
- Dolny pasek zakładek: Dom, DM, Aktywność, Ty
- Panel wątku: nakładka pełnoekranowa
- Kompozytor: przypięty nad klawiaturą
- Elementy listy kanałów: wysokość obszaru dotykowego 44px
- Aubergine górny pasek nagłówka zachowany na urządzeniach mobilnych

---

## 9. Przewodnik po Promptach Agenta

Generując projekty w stylu Slacka, stosuj następujące podejście:

**Zastosowanie kolorów:**
> Ustaw `background: #FFFFFF` jako główne płótno. Użyj `#4A154B` (aubergine) dla paska bocznego. Cały tekst główny to `#1D1C1D`. Linki i pierścienie fokusowania używają `#1264A3`. Cztery kolory logo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — są wyłącznie semantyczne: informacja, sukces, ostrzeżenie, niebezpieczeństwo.

**Typografia:**
> Używaj `system-ui, -apple-system, sans-serif` dla całego UI. Rozmiar bazowy to 15px. Nieprzeczytane kanały: grubość 700. Tekst treści: grubość 400. Znaczniki czasu: 12px `#616061`, tylko po najechaniu. Kod: `Monaco, Menlo, monospace`, 12px, tło `#F8F8F8`.

**Układ:**
> Trzy kolumny: aubergine pasek boczny 240px + elastyczny biały obszar wiadomości + opcjonalny panel wątku 400px. Elementy paska bocznego: wysokość 28px, promień 6px, pogrubienie gdy nieprzeczytane. Kompozytor: przypięty na dole, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Komponenty:**
> Przyciski: promień 4px, wysokość 36px, aubergine jako główny. Pola wejściowe: obramowanie `1px solid #DDDDDD`, pierścień fokusowania `#1264A3`. Wiersze wiadomości: płaskie, bez dymków, okrągły awatar 36px. Reakcje: pill `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Ton:**
> Slack jest ciepły, profesjonalny i ludzki. Puste stany używają przyjaznych ilustracji. CTA są bezpośrednie: "Wyślij wiadomość", "Zacznij". Komunikaty o błędach są jasne i pomocne. Nigdy nie alarmujące.

**Antywzorce do unikania:**
> Brak ciemnego obszaru treści. Brak dymków mowy. Brak czystego czarnego tekstu. Brak rozproszonych wielokolorowych akcentów. Brak WIELKICH LITER w nazwach kanałów. Brak czcionki poniżej 12px. Brak dużego promienia przycisku.
