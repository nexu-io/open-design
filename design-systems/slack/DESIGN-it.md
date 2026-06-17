# Sistema di design ispirato a Slack

> Category: Produttività e SaaS
> Piattaforma di comunicazione aziendale. Palette primaria melanzana, palette multi-accento del logo, superfici chiare con barra laterale scura, tono caldo e accessibile.

## 1. Tema visivo e atmosfera

L'identità di Slack si costruisce attorno all'idea che il lavoro debba sembrare umano e persino un po' divertente. La superficie canonica è **chiara** — aree di contenuto bianche con una profonda barra laterale melanzana (`#4A154B`) — l'opposto degli strumenti a dominante scura. Questo contrasto è intenzionale: la barra laterale è un'ancora di navigazione tranquilla e sempre presente, mentre l'area del contenuto è luminosa e aperta.

La palette del logo — blu, verde, giallo, rosso — appare principalmente nell'icona del cancelletto e nei contesti di marketing, non disseminata nell'interfaccia. Nel prodotto stesso, Slack utilizza un sistema di colori sobrio e professionale con il melanzana come unico ancoraggio del brand.

**Caratteristiche principali:**
- Superfici di contenuto prevalentemente chiare: bianco `#FFFFFF` e quasi bianco `#F8F8F8`
- Profonda barra laterale melanzana `#4A154B` — l'elemento di interfaccia più riconoscibile del brand
- Quattro colori di accento del logo (blu, verde, giallo, rosso) usati con parsimonia, solo come evidenziazioni
- Larsseit per i titoli (marketing), sans-serif di sistema per l'interfaccia
- Arrotondato ma non cartoonesco: raggio di 4–8px sulla maggior parte dei componenti
- Denso ma respirabile: righe di messaggi compatte con chiara gerarchia dei thread
- Tono caldo e conversazionale — emoji, reazioni e illustrazioni sono elementi di prima classe

---

## 2. Palette di colori e ruoli

### Colore primario del brand
| Token | Hex | Ruolo |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Sfondo della barra laterale, colore principale del brand |
| `--color-aubergine-dark` | `#350d36` | Stati di hover su superfici melanzana |
| `--color-aubergine-light` | `#611f69` | Evidenziazione dell'elemento attivo nella barra laterale |

### Colori di accento del logo (usare con parsimonia — solo evidenziazioni, icone, marketing)
| Token | Hex | Nome | Ruolo |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Azzurro cielo | Icone di canale, link, stati informativi |
| `--color-green` | `#2EB67D` | Verde acqua | Stato online, stati di successo |
| `--color-yellow` | `#ECB22E` | Oro | Stato assente, avvisi, evidenziazioni |
| `--color-red` | `#E01E5A` | Rubino | Notifiche, errori, badge menzioni |

### Superficie e sfondo
| Token | Hex | Ruolo |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Area principale dei messaggi, modali |
| `--bg-secondary` | `#F8F8F8` | Pannelli dei thread, superfici secondarie |
| `--bg-tertiary` | `#F1F1F1` | Sfondi dei campi di input, stati di hover |
| `--bg-sidebar` | `#4A154B` | Barra laterale sinistra (melanzana) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover su elemento della barra laterale |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Elemento attivo della barra laterale |
| `--bg-message-hover` | `#F8F8F8` | Hover su riga del messaggio |

### Colori del testo
| Token | Hex | Ruolo |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Testo principale del corpo (quasi nero) |
| `--text-secondary` | `#616061` | Timestamp, etichette attenuate |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Nomi dei canali nella barra laterale |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Elementi inattivi della barra laterale |
| `--text-link` | `#1264A3` | Link in linea nei messaggi |
| `--text-mention` | `#1264A3` | Colore del testo delle @menzioni |

### Colori semantici
| Token | Hex | Ruolo |
|---|---|---|
| `--color-success` | `#2EB67D` | Notifiche di successo, stati positivi |
| `--color-warning` | `#ECB22E` | Stati di avviso |
| `--color-danger` | `#E01E5A` | Stati di errore, azioni distruttive |
| `--color-info` | `#36C5F0` | Evidenziazioni informative |

### Bordo e divisore
| Token | Hex | Ruolo |
|---|---|---|
| `--border-default` | `#DDDDDD` | Divisori standard, bordi delle schede |
| `--border-subtle` | `#F1F1F1` | Separatori sottili tra le righe |
| `--border-focus` | `#1264A3` | Colore dell'anello di focus |

---

## 3. Regole tipografiche

### Caratteri tipografici
| Ruolo | Ufficiale | Alternativa web |
|---|---|---|
| Titoli di visualizzazione / Marketing | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| Interfaccia / Corpo / Chrome | Slack Lato (personalizzato) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Codice / Monospaziato | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack usa **Larsseit** per i titoli di marketing e una variante personalizzata di Lato per l'interfaccia del prodotto. Per l'uso web, `system-ui` è l'alternativa più sicura.

### Scala tipografica

| Livello | Dimensione | Peso | Altezza di riga | Spaziatura lettere | Utilizzo |
|---|---|---|---|---|---|
| Visualizzazione XL | 48px | 800 | 1.1 | -1px | Titoli hero di marketing |
| Visualizzazione L | 36px | 700 | 1.15 | -0.5px | Hero di sezione |
| Titolo 1 | 28px | 700 | 1.25 | normal | Titoli di modali, intestazioni di pagina |
| Titolo 2 | 22px | 700 | 1.3 | normal | Titoli di schede, sezioni delle impostazioni |
| Titolo 3 | 18px | 700 | 1.35 | normal | Intestazioni di sottosezione |
| Corpo L | 16px | 400 | 1.5 | normal | Testo dei messaggi, descrizioni |
| Corpo | 15px | 400 | 1.46667 | normal | Testo di interfaccia predefinito (dimensione base di Slack) |
| Corpo SM | 13px | 400 | 1.38462 | normal | Metadati secondari |
| Didascalia | 12px | 400 | 1.33 | normal | Timestamp, suggerimenti |
| Codice | 12px | 400 | 1.5 | normal | Codice in linea, blocchi di codice |

### Regole tipografiche
- La dimensione di corpo base di Slack è **15px** — leggermente inferiore a 16px per maggiore densità
- Canali non letti: peso 700 — il grassetto è il principale indicatore di non letto
- Timestamp: 12px `--text-secondary`, mostrati solo al passaggio del cursore
- Blocchi di codice: sfondo `#F8F8F8`, bordo `1px solid #DDDDDD`, border-radius 4px
- Non usare mai dimensioni di font inferiori a 12px
- Titoli di marketing: spaziatura lettere `-1px` per le grandi dimensioni di visualizzazione

---

## 4. Stili dei componenti

### Pulsanti

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

### Campi di input
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

### Elemento di canale nella barra laterale
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

### Badge messaggi non letti
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

### Allegati messaggi / Schede
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reazioni
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

## 5. Principi di layout

### Layout a tre colonne
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Sistema di spaziatura (base 4px)
| Token | Valore | Utilizzo |
|---|---|---|
| `--space-1` | 4px | Spazi ridotti |
| `--space-2` | 8px | Padding del componente |
| `--space-3` | 12px | Padding dei campi di input |
| `--space-4` | 16px | Padding standard |
| `--space-6` | 24px | Padding delle schede |
| `--space-8` | 32px | Spazi tra sezioni |

### Struttura della barra laterale
```
[Workspace Name ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### Compositore di messaggi
- Fissato in fondo all'area dei messaggi
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Barra degli strumenti: emoji, allegato, formato, pulsante di invio

---

## 6. Profondità ed elevazione

Slack usa ombre leggere su una superficie chiara:

| Livello | Utilizzo | Ombra |
|---|---|---|
| Piatto | Righe dei messaggi, elementi della barra laterale | none |
| Basso | Schede, campi di input | `0 1px 3px rgba(0,0,0,0.08)` |
| Medio | Menu a discesa, popover | `0 4px 12px rgba(0,0,0,0.12)` |
| Alto | Modali, finestre di dialogo | `0 8px 24px rgba(0,0,0,0.15)` |
| Sovrapposizione | Sfondi delle modali | `rgba(0,0,0,0.5)` |

---

## 7. Cosa fare e cosa non fare

### ✅ Fare
- Usare il melanzana `#4A154B` per la barra laterale — è l'elemento di interfaccia più iconico di Slack
- Mantenere l'area di contenuto principale bianca e chiara
- Usare `#1D1C1D` (quasi nero) per tutto il testo del corpo, non il nero puro
- Mettere in grassetto i nomi dei canali per indicare lo stato non letto — il peso è l'indicatore
- Usare i quattro colori di accento solo per ruoli semantici (successo, avviso, pericolo, informazione)
- Applicare `border-left: 4px` agli allegati e alle incorporazioni dei messaggi
- Mostrare i timestamp solo al passaggio del cursore
- Usare `#1264A3` per link e stati di focus
- Mantenere gli elementi della barra laterale compatti: altezza 28px, border-radius 6px

### ❌ Non fare
- Non usare un'area di contenuto principale scura — Slack è prevalentemente chiaro
- Non disseminare blu/verde/giallo/rosso come accenti decorativi
- Non usare il nero puro `#000000` per il testo
- Non usare fumetti — i messaggi sono righe piatte
- Non fare pulsanti con raggio grande — 4px è lo standard
- Non mostrare i timestamp in modo permanente
- Non usare MAIUSCOLO per i nomi dei canali
- Non usare dimensioni di font inferiori a 12px

---

## 8. Comportamento responsivo

### Breakpoint
| Breakpoint | Larghezza | Layout |
|---|---|---|
| Mobile | < 768px | Pannello singolo, barra laterale come cassetto sinistro |
| Tablet | 768–1024px | Solo barra laterale + area messaggi |
| Desktop | > 1024px | Layout completo a tre colonne |

### Adattamenti per mobile
- Barra laterale: cassetto sinistro, scorrere a destra per aprire
- Barra delle schede inferiore: Home, MD, Attività, Tu
- Pannello thread: sovrapposizione a schermo intero
- Compositore: fissato sopra la tastiera
- Elementi dell'elenco canali: altezza del target di tocco 44px
- Barra dell'intestazione melanzana superiore mantenuta su mobile

---

## 9. Guida ai prompt per agente

Quando si generano design in stile Slack, seguire questo approccio:

**Applicazione dei colori:**
> Impostare `background: #FFFFFF` come tela principale. Usare `#4A154B` (melanzana) per la barra laterale. Tutto il testo principale è `#1D1C1D`. Link e anelli di focus usano `#1264A3`. I quattro colori del logo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — sono esclusivamente semantici: informazione, successo, avviso, pericolo.

**Tipografia:**
> Usare `system-ui, -apple-system, sans-serif` per tutta l'interfaccia. La dimensione base è 15px. Canali non letti: peso 700. Testo del corpo: peso 400. Timestamp: 12px `#616061`, solo al passaggio del cursore. Codice: `Monaco, Menlo, monospace`, 12px, sfondo `#F8F8F8`.

**Layout:**
> Tre colonne: barra laterale melanzana da 240px + area messaggi bianca flessibile + pannello thread opzionale da 400px. Elementi della barra laterale: altezza 28px, raggio 6px, grassetto quando non letti. Compositore: fissato in basso, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Componenti:**
> Pulsanti: raggio 4px, altezza 36px, melanzana primario. Campi di input: bordo `1px solid #DDDDDD`, anello di focus `#1264A3`. Righe dei messaggi: piatte, senza fumetti, avatar circolare da 36px. Reazioni: pillola `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Tono:**
> Slack è caldo, professionale e umano. Gli stati vuoti usano illustrazioni amichevoli. Le chiamate all'azione sono dirette: «Invia messaggio», «Inizia». I messaggi di errore sono chiari e utili. Mai allarmante.

**Antipattern da evitare:**
> Nessuna area di contenuto scura. Nessun fumetto. Nessun testo nero puro. Nessun accento multicolore disseminato. Nessun nome di canale in MAIUSCOLO. Nessun font inferiore a 12px. Nessun raggio di pulsante grande.
