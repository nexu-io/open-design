# Sistema di design ispirato ad Airtable

> Category: Design e Creatività
> Ibrido tra foglio di calcolo e database. Estetica dei dati strutturati: colorata, amichevole e organizzata.

## 1. Tema visivo e atmosfera

Il sito di Airtable è una piattaforma pulita e adatta alle aziende che comunica una "semplicità sofisticata" attraverso una tela bianca con testo blu navy profondo (`#181d26`) e Airtable Blue (`#1b61c9`) come accento interattivo principale. La famiglia tipografica Haas (varianti display e text) crea un sistema tipografico di precisione svizzera con spaziatura positiva tra le lettere su tutto il sito.

**Caratteristiche principali:**
- Tela bianca con testo blu navy profondo (`#181d26`)
- Airtable Blue (`#1b61c9`) come colore principale per CTA e link
- Sistema a doppio font Haas + Haas Groot Disp
- Spaziatura positiva tra le lettere nel testo del corpo (0.08px–0.28px)
- Raggio dei pulsanti 12px, card 16px–32px
- Ombra multistrato con tonalità blu: `rgba(45,127,249,0.28) 0px 1px 3px`
- Token di tema semantici: nomenclatura delle variabili CSS `--theme_*`

## 2. Palette di colori e ruoli

### Primario
- **Blu navy profondo** (`#181d26`): Testo principale
- **Airtable Blue** (`#1b61c9`): Pulsanti CTA, link
- **Bianco** (`#ffffff`): Superficie principale
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semantico
- **Verde successo** (`#006400`): `--theme_success-text`
- **Testo debole** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Secondario attivo** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Neutro
- **Grigio scuro** (`#333333`): Testo secondario
- **Blu medio** (`#254fad`): Variante di blu per link/accento
- **Bordo** (`#e0e2e6`): Bordi delle card
- **Superficie chiara** (`#f8fafc`): Superficie sottile

### Ombre
- **Tonalità blu** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Morbida** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Regole tipografiche

### Famiglie di font
- **Principale**: `Haas`, fallback: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, fallback: `Haas`

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza di riga | Spaziatura |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Grassetto | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Intestazione di sezione | Haas | 40px | 400 | 1.25 | normal |
| Sottotitolo | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Titolo della card | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Funzionalità | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Corpo | Haas | 18px | 400 | 1.35 | 0.18px |
| Corpo Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Pulsante | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Didascalia | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Stili dei componenti

### Pulsanti
- **Blu principale**: `#1b61c9`, testo bianco, padding 16px 24px, raggio 12px
- **Bianco**: sfondo bianco, testo `#181d26`, raggio 12px, bordo bianco 1px
- **Consenso cookie**: sfondo `#1b61c9`, raggio 2px (netto)

### Card: `1px solid #e0e2e6`, raggio 16px–24px
### Input: Stile Haas standard

## 5. Layout
- Spaziatura: 1–48px (base 8px)
- Raggio: 2px (piccolo), 12px (pulsanti), 16px (card), 24px (sezioni), 32px (grande), 50% (cerchi)

## 6. Profondità
- Sistema di ombra multistrato con tonalità blu
- Ambiente morbido: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Cosa fare e cosa non fare
### Fare: Usare Airtable Blue per le CTA, Haas con tracking positivo, pulsanti con raggio 12px
### Non fare: Omettere la spaziatura positiva tra le lettere, usare ombre pesanti

## 8. Comportamento responsive
Breakpoint: 425–1664px (23 breakpoint)

## 9. Guida ai prompt per Agent
- Testo: Blu navy profondo (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Sfondo: Bianco (`#ffffff`)
- Bordo: `#e0e2e6`
