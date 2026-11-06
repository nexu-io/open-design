# Sistema di design ispirato ad Apple

> Category: Media e consumo
> Elettronica di consumo. Spazio bianco premium, SF Pro, immagini cinematografiche.

## 1. Tema visivo e atmosfera

Il linguaggio web di Apple è un sistema editoriale di precisione che alterna la calma da galleria a blocchi informativi con densità da retail. Il tono visivo resta sobrio: ampie tele neutre, cromature discrete e immagini di prodotto a cui è affidato quasi tutto il peso espressivo. L'interfaccia è progettata per scomparire, così che hardware, materiali e opzioni di finitura diventino il primo piano narrativo.

Nelle cinque pagine analizzate, il ritmo è coerente ma non monolitico. Le superfici di marketing (homepage ed Environment) usano una scansione in capitoli cinematografica fatta di nero e luce, mentre le superfici commerciali (flussi Store e Shop) introducono spaziature più strette, più controlli di utilità e pile di card più dense senza rompere la grammatica di base del brand. Il risultato è un unico sistema con due marce: modalità vetrina e modalità transazione.

La tipografia è lo stabilizzatore. SF Pro Display sostiene la gerarchia hero e di merchandising con interlinee compatte e tracking controllato, mentre SF Pro Text gestisce i metadati di prodotto, la navigazione, i filtri e l'interfaccia di selezione densa. La tipografia resta misurata, ma l'intervallo di scala è abbastanza ampio da sostenere sia messaggi hero da cartellone sia micro-etichette di utilità.

**Caratteristiche chiave:**
- Ritmo di sezione binario: scene nero profondo (`#000000`) che si alternano a campi neutri chiari (`#f5f5f7`)
- Una sola famiglia di accento blu per la semantica di azione e link (`#0071e3`, `#0066cc`, `#2997ff`)
- Doppia modalità operativa in un unico sistema: moduli vetrina cinematografici e configuratori commerciali densi
- Forte affidamento su immagini e finiture dei materiali; le cromature dell'interfaccia restano visivamente sottili
- Metriche di titolo compatte (SF Pro Display, semibold) abbinate a una tipografia di corpo/link compatta (SF Pro Text)
- Geometria a pillola e a capsula come linguaggio d'azione distintivo (da `18px` a `980px` e controlli circolari)
- Profondità usata con parsimonia; contrasto e separazione delle superfici svolgono gran parte del lavoro di stratificazione
- Ritmo a blocchi di colore multipagina: capitoli hero neri -> campi di merchandising neutri chiari -> superfici retail bianche di utilità -> micro-superfici scure per i controlli

## 2. Palette colori e ruoli

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primari
- **Nero assoluto** (`#000000`): tele hero immersive, capitoli di prodotto ad alta tensione drammatica, ancoraggi UI profondi.
- **Grigio Apple pallido** (`#f5f5f7`): superficie chiara principale per fasce di funzionalità, blocchi di confronto e transizioni editoriali.
- **Inchiostro quasi nero** (`#1d1d1f`): colore del testo principale e del riempimento scuro dei controlli su tele chiare.

### Secondari e di accento
- **Blu azione Apple** (`#0071e3`): riempimento di azione primaria e accento del brand che segnala il focus.
- **Blu link di corpo** (`#0066cc`): colore dei link inline ottimizzato per la leggibilità nei testi lunghi.
- **Blu link ad alta luminosità** (`#2997ff`): trattamento dei link brillante su scene più scure dove serve un contrasto più forte.

### Superficie e sfondo
- **Tela bianco puro** (`#ffffff`): sfondi retail/elenco prodotti e sezioni transazionali dense.
- **Superficie grafite A** (`#272729`): livello di contesto per card scure e controlli multimediali.
- **Superficie grafite B** (`#262629`): livello di utilità scuro leggermente più profondo per i raggruppamenti di controlli.
- **Superficie grafite C** (`#28282b`): superfici di supporto scure rialzate.
- **Superficie grafite D** (`#2a2a2c`): gradino rialzato più scuro usato per la separazione in scene scure più ricche.

### Neutri e testo
- **Grigio neutro secondario** (`#6e6e73`): testo di corpo secondario, descrizioni di supporto, metadati terziari.
- **Grigio bordo morbido** (`#d2d2d7`): divisori, contorni sottili e contenimento di utilità attenuato.
- **Grigio bordo medio** (`#86868b`): contorni di campo più marcati nei contesti di configurazione prodotto e filtro.
- **Grigio scuro di utilità** (`#424245`): incrocio testo/superficie neutro-scuro nei contesti dello store.

### Semantici e di accento
- **Segnale di selezione/focus** (`#0071e3`): segnale condiviso di focus e stato selezionato tra i contesti di marketing e commerciali.
- **Errore/Avviso/Successo**: nessuna palette semantica distinta era costantemente visibile nell'insieme di superfici estratte.

### Sistema di gradienti
- Le pagine estratte sono dominate in modo schiacciante da superfici piatte. La ricchezza visiva proviene dalla fotografia e dal rendering delle finiture, piuttosto che da gradienti UI persistenti.

## 3. Regole tipografiche

### Famiglia di font
- **Famiglia Display:** `SF Pro Display`, fallback `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Famiglia Text:** `SF Pro Text`, fallback `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Suddivisione d'uso:** la famiglia Display gestisce i titoli hero/prodotto e le intestazioni di merchandising; la famiglia Text gestisce navigazione, controlli, etichette e testo commerciale denso.

### Gerarchia
| Ruolo | Dimensione | Peso | Interlinea | Spaziatura lettere | Note |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Scala hero Environment/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Momenti hero della homepage |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Intestazioni dei capitoli principali |
| Product Heading | 40px | 600 | 1.10 | normal | Titoli di sezione prodotto e campagna |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Callout di dispositivi e merchandising |
| Promo Display | 32px | 300-600 | 1.09-1.13 | da 0.128px a 0.352px | Sub-hero a livello di modulo |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Denominazione a livello di tile e testo chiave |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Intestazioni di configuratore e contenuti raggruppati |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Link promozionali più grandi |
| Subhead | 19px | 600 | 1.21 | 0.228px | Introduzioni di sezione compatte |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Corpo standard e descrizioni retail |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Etichette enfatizzate e valori chiave |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Pulsanti, etichette di supporto, testo di navigazione compatto |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Note in piccolo, micro-etichette |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Metadati densi e testo di supporto legale |

### Principi
- **Continuità tra tipi di pagina:** lo stesso DNA tipografico attraversa i lanci cinematografici e i flussi di acquisto del prodotto, evitando una frattura del brand tra marketing e commercio.
- **Compressione su larga scala:** i livelli Display usano interlinee strette e tracking controllato per trasmettere un senso di precisione meccanica e di centralità del prodotto.
- **Densità leggibile a profondità retail:** SF Pro Text bilancia la compattezza con un ritmo verticale sufficiente per lunghi elenchi di prodotti e matrici di opzioni.
- **Scala di pesi misurata:** 600 è il peso di enfasi dominante; 700 compare in modo selettivo; 300 è usato con parsimonia per il contrasto nelle righe più grandi.

### Nota sui sostituti dei font
- Sostituti più vicini disponibili liberamente: `Inter` per implementazioni ricche di testo e metriche simili a `SF Pro Display-like` approssimate con `Inter Tight` per i titoli.
- In caso di sostituzione, aumentare leggermente l'interlinea (+0.02 a +0.06) sulle dimensioni di corpo e ridurre l'intensità del tracking negativo per preservare la leggibilità.

## 4. Stilizzazioni dei componenti

### Pulsanti
- **Azione a riempimento primaria:** sfondo `#0071e3`, testo `#ffffff`, raggio 8px, padding orizzontale compatto (comunemente 8px 15px). Usata per azioni decisive di acquisto/avanzamento.
- **Azione a riempimento scuro:** sfondo `#1d1d1f`, testo `#ffffff`, raggio 8px. Usata quando le superfici chiare necessitano di un'azione primaria ad alto contrasto e sobria.
- **Famiglia di azioni a pillola/capsula:** azioni a capsula grandi con raggi da `18px`-`56px` e link a pillola estremi a `980px`. Stabilisce la silhouette di call-to-action di Apple, morbida ma precisa.
- **Gusci di filtro/pulsante di utilità:** gusci chiari (`#fafafc` o bianco traslucido) con bordi grigi sottili (`#d2d2d7` / `#86868b`) per contesti di configurazione densi.
- **Comportamento alla pressione:** i controlli attivi comunemente riducono la scala o spostano leggermente il riempimento per indicare la conferma della pressione fisica.

### Card e contenitori
- **Card editoriali/di prodotto:** card chiare su campi `#f5f5f7` o bianchi con inquadratura minima e composizione image-first.
- **Card scure di utilità:** gradini grafite (da `#272729` a `#2a2a2c`) usati per overlay, controlli multimediali e moduli in contesto scuro.
- **Pannelli del configuratore:** contenitori arrotondati (spesso 12px-18px) con definizione del bordo chiara ma sobria.
- **Moduli carosello/spotlight:** gusci arrotondati più grandi (`28px`-`36px`) per le corsie di contenuto in evidenza.

### Input e moduli
- **Campi di input retail:** sfondi traslucidi o bianchi, testo scuro (`#1d1d1f`), contenimento guidato dal bordo (`#86868b`).
- **Controlli di selezione:** geometria di controllo circolare/a toggle compare di frequente nelle interfacce di selezione prodotto.
- **Strategia di densità:** i campi del modulo restano visivamente discreti per mantenere dominanti le immagini del dispositivo e la gerarchia dei prezzi.

### Navigazione
- **Nav globale di marketing:** barra scura traslucida compatta con link a caratteri piccoli e iconografia sobria.
- **Livelli di nav Store/Sub-shop:** barre di utilità aggiuntive, chip e controlli segmentati per restringere categorie e prodotti.
- **Gerarchia dei link:** i blu dei link restano il segnale interattivo primario, mentre il testo neutro sostiene gli insiemi di navigazione densi.

### Trattamento delle immagini
- **Fotografia object-first:** hardware e accessori sono messi in primo piano su superfici piatte controllate.
- **Rendering delle finiture ad alta fedeltà:** i dettagli riflettenti/materici sono centrali nella persuasione visiva.
- **Inquadratura mista:** scene hero a piena pagina coesistono con card retail arrotondate e miniature di merchandising ritagliate strettamente.

### Altri componenti distintivi
- **Matrice del configuratore di prodotto:** pile di opzioni e selettori che combinano chip, controlli in stile radio e blocchi contestuali di prezzo/riepilogo.
- **Punti/frecce di controllo del carosello:** vocabolario di controllo circolare in overlay attenuati per l'avanzamento della galleria.
- **Pannelli narrativi Environment:** capitoli narrativi che fondono tipografia editoriale con immagini cinematografiche di prodotto/ambiente.

## 5. Principi di layout

### Sistema di spaziatura
- L'unità di base è di fatto `8px`, ma il sistema supporta micro-passi densi per un allineamento di precisione.
- Valori di spaziatura riutilizzati frequentemente tra le pagine: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Costanti di ritmo universali visibili sia nei flussi di marketing sia in quelli retail: impalcatura con unità da `8px` e intervalli di utilità da `14-20px` per il padding dei componenti e la spaziatura degli elenchi.

### Griglia e contenitore
- **Pagine vetrina:** ampie colonne centrali con generoso respiro orizzontale e capitoli di colore a piena larghezza.
- **Pagine commerciali:** griglie di prodotto e controllo multi-colonna più strette con frequente impilamento modulare.
- **Comportamento del contenitore:** nucleo leggibile vincolato con generosi margini esterni alle larghezze desktop.

### Filosofia dello spazio bianco
- **Cadenza delle scene:** i capitoli visivi principali usano un ampio respiro superiore/inferiore.
- **Compattazione delle informazioni dove serve:** le pagine retail comprimono deliberatamente la spaziatura per esporre più informazioni azionabili per viewport.
- **Separazione guidata dal contrasto:** le transizioni di sezione si affidano più ai cambi di superficie che ai separatori decorativi.

### Scala dei raggi di bordo
- **5px:** piccoli link/tag di utilità e gusci minori.
- **8px-12px:** controlli standard e campi compatti.
- **16px-18px:** card, cornici di modulo e pannelli commerciali.
- **28px-36px:** contenitori di modulo e spotlight più grandi.
- **56px / 100px / 980px:** capsule, pillole grandi e forme CTA allungate distintive.
- **50%:** controlli multimediali e di selezione circolari.

## 6. Profondità ed elevazione

| Livello | Trattamento | Uso |
|------|-----------|-----|
| Livello 0 | Superfici neutre piatte (`#ffffff`, `#f5f5f7`, `#000000`) | Palcoscenico narrativo e di prodotto principale |
| Livello 1 | Contenimento sottile con bordo (`#d2d2d7`, `#86868b`) | Filtri, campi di input, card di utilità |
| Livello 2 | Ombra morbida (`rgba(0,0,0,0.08)` a `rgba(0,0,0,0.22)` dove presente) | Card evidenziate e moduli di merchandising rialzati |
| Livello 3 | Gradini su superficie scura (`#272729` -> `#2a2a2c`) | Overlay, controlli multimediali, cluster scuri di utilità |
| Accessibilità | Segnale di focus blu (`#0071e3`) | Enfasi da tastiera e selezione |

La profondità è intenzionalmente sobria. Apple predilige contrasto tonale, gradini di superficie e gerarchia compositiva rispetto a pesanti accumuli di ombre.

### Profondità decorativa
- La profondità decorativa è creata principalmente dal realismo fotografico e dal rendering dei materiali, non da effetti UI sintetici.
- Overlay traslucidi e barre di utilità simili al vetro forniscono una lieve stratificazione atmosferica nella navigazione e nei controlli.

## 7. Cosa fare e cosa non fare

### Da fare
- Usare la triade neutra (`#000000`, `#f5f5f7`, `#ffffff`) come fondamento strutturale.
- Riservare gli accenti blu a una semantica autentica di azione e navigazione.
- Mantenere la tipografia stretta e deliberata, specialmente alle scale display.
- Mantenere il linguaggio geometrico a capsula/cerchio per controlli e azioni chiave.
- Lasciare che le immagini di prodotto reggano la drammaticità visiva; mantenere la cromatura sobria.
- Usare il contenimento guidato dal bordo nei contesti retail densi invece di una pesante ornamentazione delle card.
- Preservare una chiara separazione tra moduli vetrina e moduli transazionali, mantenendo condivisi i token di base.

### Da non fare
- Non introdurre ampie palette di accento secondario che competano con il blu Apple.
- Non abusare di ombre, effetti glow o gradienti decorativi nella cromatura UI di base.
- Non mescolare famiglie di font non correlate né allentare il tracking in modo indiscriminato.
- Non appiattire tutti gli angoli su un unico raggio; Apple usa livelli di raggio intenzionali.
- Non sovraccaricare i moduli commerciali con bordi spessi o effetti visivi vistosi.
- Non rimuovere la cadenza di contrasto neutro tra capitoli scuri e chiari.
- Non trattare i flussi di marketing e di acquisto come sistemi di design separati.

## 8. Comportamento responsive

### Breakpoint
| Nome | Larghezza | Cambiamenti chiave |
|------|-------|-------------|
| Small Mobile | 374px e inferiore | Controlli retail ristretti, pile di prodotti a colonna singola |
| Mobile | 375px-640px | Moduli a una colonna, righe di azione compatte, selettori condensati |
| Tablet | 641px-833px | Card espanse e transizioni miste a 1-2 colonne |
| Tablet Wide | 834px-1023px | Merchandising multi-colonna più stabile, blocchi di testo più grandi |
| Desktop | 1024px-1240px | Layout retail completi e strutture di confronto prodotti |
| Desktop Wide | 1241px-1440px | Espansione hero di marketing e spaziatura di sezione più ampia |
| Large Desktop | 1441px+ | Massimo respiro dei capitoli e ampia composizione editoriale |

### Target tattili
- Le azioni primarie e secondarie sono generalmente presentate in geometrie a pillola/pulsante adatte al tap.
- I controlli multimediali e di selezione circolari si allineano all'intento di toccabilità minima nei contesti mobile.
- L'interfaccia commerciale densa usa etichette compatte ma mantiene aree di tocco chiare tramite il padding della forma circostante.

### Strategia di collasso
- La tipografia hero di marketing si rimpicciolisce per livelli discreti preservando il contrasto della gerarchia.
- Le griglie di prodotto e commerciali collassano da multi-colonna a card impilate con visibilità persistente del selettore.
- La navigazione di utilità si comprime in raggruppamenti di link/controllo più semplici preservando le azioni chiave.
- I cluster di opzione/configurazione diventano sequenziati verticalmente per mantenere lineare il flusso d'acquisto sugli schermi piccoli.

### Comportamento delle immagini
- Le immagini di prodotto preservano proporzioni e centralità attraverso i breakpoint.
- Le immagini hero restano dominanti su mobile, con il testo riposizionato attorno alla priorità dell'immagine.
- Le miniature retail restano leggibili tramite una logica di ritaglio più stretta e un impilamento di card più denso.
- I moduli guidati dalle immagini continuano ad ancorare il ritmo man mano che la densità del layout aumenta.

## 9. Guida ai prompt per l'agente

### Riferimento rapido dei colori
- Blu di azione primaria: **Blu azione Apple** (`#0071e3`)
- Blu link inline: **Blu link di corpo** (`#0066cc`)
- Tela del capitolo scuro: **Nero assoluto** (`#000000`)
- Tela del capitolo chiaro: **Grigio Apple pallido** (`#f5f5f7`)
- Testo primario su chiaro: **Inchiostro quasi nero** (`#1d1d1f`)
- Testo secondario: **Grigio neutro secondario** (`#6e6e73`)
- Bordo retail morbido: **Grigio bordo morbido** (`#d2d2d7`)
- Bordo retail marcato: **Grigio bordo medio** (`#86868b`)

### Esempi di prompt per componenti
- "Progetta un hero di prodotto in stile Apple su una tela nera (`#000000`) con titolo SF Pro Display semibold (48-56px), testo di supporto conciso e due CTA a capsula che usano `#0071e3` e `#1d1d1f`."
- "Crea un pannello di configurazione commerciale su bianco (`#ffffff`) con card arrotondate da 18px, campi con bordo `#86868b`, testo di corpo SF Pro Text da 17px e selettori di opzione compatti."
- "Costruisci una griglia di card di merchandising che alterna superfici `#f5f5f7` e bianche, con card image-first, ombre sobrie e metadati SF Pro Text da 14-17px."
- "Genera un cluster di controlli per carosello usando pulsanti circolari (raggio 50%), overlay grigi attenuati e un chiaro feedback attivo per la navigazione della galleria."
- "Componi un ritmo di pagina misto marketing + retail: capitolo vetrina scuro -> capitolo di funzionalità chiaro -> modulo denso di elenco prodotti, mantenendo gli accenti blu solo per azioni e link."

### Guida all'iterazione
1. Fissa per primo il fondamento neutro (`#000000`, `#f5f5f7`, `#ffffff`) prima di regolare gli accenti.
2. Mantieni gli accenti blu scarsi e intenzionali; se tutto è blu, la gerarchia collassa.
3. Regola la tipografia in quest'ordine: scala display, leggibilità del corpo, poi micro-etichette.
4. Abbina il raggio per classe di componente (campo, card, capsula, cerchio) invece di un arrotondamento uguale per tutti.
5. Aumenta la densità gradualmente passando dalle sezioni vetrina alle sezioni commerciali.
6. Verifica che le immagini di prodotto restino il livello visivo più forte dopo ogni revisione.

### Lacune note
- Colori di stato semantici distinti (errore/avviso/successo) non erano costantemente visibili nell'insieme di pagine estratte.
- Alcuni micro-stati di interazione variano per modulo e non sono rappresentati come token di sistema universali.
- Alcuni moduli retail espongono override tipografici specifici del contesto che non compaiono in tutte e cinque le pagine.
