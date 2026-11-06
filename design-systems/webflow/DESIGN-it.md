# Sistema di design ispirato a Webflow

> Category: Design e creatività
> Costruttore web visuale. Estetica di sito marketing curata con accenti blu.

## 1. Tema visivo e atmosfera

Il sito di Webflow è una piattaforma visivamente ricca e orientata agli strumenti che comunica il "design senza codice" attraverso superfici bianche pulite, il caratteristico blu Webflow（`#146ef5`）e una ricca tavolozza di colori secondari（viola, rosa, verde, arancione, giallo, rosso）. Il font personalizzato WF Visual Sans Variable crea un sistema tipografico sicuro e preciso con peso 600 per il display e 500 per il corpo del testo.

**Caratteristiche principali：**
- Canvas bianco con testo quasi nero（`#080808`）
- Blu Webflow（`#146ef5`）come colore del brand principale e interattivo
- WF Visual Sans Variable — font variabile personalizzato con peso 500–600
- Tavolozza secondaria ricca：viola `#7a3dff`, rosa `#ed52cb`, verde `#00d722`, arancione `#ff6b00`, giallo `#ffae13`, rosso `#ee1d36`
- Raggio del bordo conservativo 4px–8px — netto, non arrotondato
- Stack di ombre a più livelli（5 ombre in cascata）
- Etichette in maiuscolo：10px–15px, peso 500–600, spaziatura ampia（0,6px–1,5px）
- Animazione translate(6px) al passaggio del cursore sui pulsanti

## 2. Palette colori e ruoli

### Primario
- **Quasi Nero**（`#080808`）：Testo principale
- **Blu Webflow**（`#146ef5`）：`--_color---primary--webflow-blue`, CTA principale e link
- **Blu 400**（`#3b89ff`）：`--_color---primary--blue-400`, blu interattivo più chiaro
- **Blu 300**（`#006acc`）：`--_color---blue-300`, variante blu più scura
- **Blu hover pulsante**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Accenti secondari
- **Viola**（`#7a3dff`）：`--_color---secondary--purple`
- **Rosa**（`#ed52cb`）：`--_color---secondary--pink`
- **Verde**（`#00d722`）：`--_color---secondary--green`
- **Arancione**（`#ff6b00`）：`--_color---secondary--orange`
- **Giallo**（`#ffae13`）：`--_color---secondary--yellow`
- **Rosso**（`#ee1d36`）：`--_color---secondary--red`

### Neutro
- **Grigio 800**（`#222222`）：Testo secondario scuro
- **Grigio 700**（`#363636`）：Testo intermedio
- **Grigio 300**（`#ababab`）：Testo attenuato, segnaposto
- **Grigio medio**（`#5a5a5a`）：Testo dei link
- **Grigio bordo**（`#d8d8d8`）：Bordi, divisori
- **Bordo hover**（`#898989`）：Bordo al passaggio del cursore

### Ombre
- **Cascata a 5 livelli**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Regole tipografiche

### Font：`WF Visual Sans Variable`, alternativa：`Arial`

| Ruolo | Dimensione | Peso | Altezza riga | Spaziatura | Note |
|------|------|--------|-------------|----------------|-------|
| Hero display | 80px | 600 | 1,04 | -0,8px | |
| Intestazione sezione | 56px | 600 | 1,04 | normal | |
| Sottotitolo | 32px | 500 | 1,30 | normal | |
| Titolo funzionalità | 24px | 500–600 | 1,30 | normal | |
| Corpo | 20px | 400–500 | 1,40–1,50 | normal | |
| Corpo standard | 16px | 400–500 | 1,60 | -0,16px | |
| Pulsante | 16px | 500 | 1,60 | -0,16px | |
| Etichetta maiuscolo | 15px | 500 | 1,30 | 1,5px | uppercase |
| Didascalia | 14px | 400–500 | 1,40–1,60 | normal | |
| Badge maiuscolo | 12,8px | 550 | 1,20 | normal | uppercase |
| Micro maiuscolo | 10px | 500–600 | 1,30 | 1px | uppercase |
| Codice：Inconsolata（font monospaziato complementare）

## 4. Stile dei componenti

### Pulsanti
- Trasparente：testo `#080808`, translate(6px) al passaggio del cursore
- Cerchio bianco：raggio 50%, sfondo bianco
- Badge blu：sfondo `#146ef5`, raggio 4px, peso 550

### Schede：`1px solid #d8d8d8`, raggio 4px–8px
### Badge：sfondo con tinta blu al 10% di opacità, raggio 4px

## 5. Layout
- Spaziatura：scala frazionaria（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Raggio：2px, 4px, 8px, 50% — conservativo, netto
- Breakpoint：479px, 768px, 992px

## 6. Profondità：sistema di ombre in cascata a 5 livelli

## 7. Da fare e da evitare
- Da fare：Usare WF Visual Sans Variable con peso 500–600. Blu（`#146ef5`）per i CTA. Raggio 4px. translate(6px) al passaggio del cursore.
- Da evitare：Arrotondare gli elementi funzionali oltre 8px. Usare colori secondari sui CTA principali.

## 8. Responsivo：479px, 768px, 992px

## 9. Guida al prompt per Agent
- Testo：Quasi Nero（`#080808`）
- CTA：Blu Webflow（`#146ef5`）
- Sfondo：Bianco（`#ffffff`）
- Bordo：`#d8d8d8`
- Secondario：Viola `#7a3dff`, Rosa `#ed52cb`, Verde `#00d722`
