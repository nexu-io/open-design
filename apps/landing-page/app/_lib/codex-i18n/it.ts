/*
 * Testi in italiano per la raccolta curata di plugin di design per Codex.
 * Tradotti dalla versione inglese di riferimento in `../codex-i18n.ts`.
 */
import type { CodexCopyOverride } from './index';

export const it: CodexCopyOverride = {
  collectionEyebrow: 'Raccolta curata',
  collectionHeading: 'I plugin di design che fanno spedire UI vere a Codex',
  collectionLede:
    'OpenAI Codex scrive codice funzionante. Lasciato a sé stesso ripiega su font sicuri, spaziature medie e Helvetica centrato. Questi sono i plugin che gli danno gusto: skill estetiche e regole di design system. Installane uno, oppure usali tutti dentro Open Design.',
  collectionStats: [
    { value: '50', label: 'plugin selezionati' },
    { value: '13', label: 'repo di origine' },
    { value: 'Open', label: 'source e verificati' },
  ],
  collectionIntro:
    'Ogni plugin qui sotto è reale e rimanda alla propria fonte. Fanno due lavori: definire il gusto estetico prima del codice e trasformare il tuo design system in regole che l’agente rispetta.',
  collectionCategoryBlurbs: [
    'Scavalca le scelte estetiche predefinite di Codex prima che venga scritta una sola riga.',
    'Trasforma token e componenti in regole che Codex segue invece di inventare.',
  ],
  collectionCloserHeading: 'Salta il setup. Progetta con Codex dentro Open Design',
  filterAll: 'Tutti',
  collectionCloserBody:
    'Open Design è il design workspace open source e agent-native che lavora attorno a Codex. Tiene coerenti sistemi, skill e template, così l’agente consegna lavoro che ti appartiene.',
  categoryFrontend: 'Frontend e UI',
  categoryDesignSystems: 'Design system',
  ctaDownload: 'Scarica Open Design',
  ctaStarList: 'Metti una star alla lista',
  ctaBrowseAll: 'Sfoglia tutti i plugin',
  ctaViewSource: 'Vedi il sorgente',
  ctaOurRepo: 'codex-design su GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Cosa fa',
  cardCta: 'Vedi il plugin',
  detailWhatIsIt: 'Che cos’è',
  detailWhyForDesign: 'Perché conta per il design',
  detailHowWithCodex: 'Come usarlo con Codex',
  detailExampleTag: 'Quando tirarlo fuori',
  detailSource: 'Fonte',
  detailCategory: 'Categoria',
  detailMaintainer: 'Autore',
  detailTags: 'Tag',
  detailLicense: 'Licenza',
  detailCovers: 'Cosa copre',
  detailUpstream: 'Dal SKILL.md originale',
  detailCodexNote: 'Compatibile con Codex',
  detailTraction: 'Riscontro',
  detailRepo: 'Repository di origine',
  detailStars: 'Stelle',
  installHeading: 'Come installarlo',
  installRunInCodex: 'Eseguilo dentro Codex.',
  installRestart: 'Riavvia Codex così carica la nuova skill.',
  installClone: 'Clona il repository.',
  installPoint: 'Punta Codex sul file della skill.',
  installThenUse: 'Poi descrivi la UI che vuoi. Codex segue la skill.',
  installNote:
    'Ogni plugin qui è gratuito, open source e rimanda alla sua vera fonte upstream.',
  installNoteCta: 'Esplora tutta la raccolta',
  detailMoreOnList: 'Altro sulla lista codex-design',
  detailRelated: 'Altri plugin di design per Codex',
  finalEyebrow: 'Prossimo passo',
  detailCloserHeading: 'Progetta con Open Design, senza il setup',
  detailCloserBody:
    'Installa questo plugin da solo, oppure porta attorno a Codex un intero strato di design curato con Open Design. Usa la tua chiave, resta padrone dell’output.',
  skills: {
    'gpt-taste': {
      tagline:
        'Costruisce landing page da premio con motion GSAP legato allo scroll e griglie bento senza vuoti.',
      whatIsIt:
        'Una direttiva frontend che forza varietà di layout tramite selezione casuale simulata di hero, tipografia, componenti e paradigmi GSAP. Impone anche la struttura di pagina AIDA e spaziature ampie tra le sezioni.',
      whyForDesign: [
        'I titoli hero restano su due o tre righe perché i contenitori si allargano invece di spezzarsi in muri di testo.',
        'Le griglie bento usano grid-flow-dense, così nessuna cella resta vuota o spezzata.',
        'Le etichette meta di scarsa qualità sono bandite e il contrasto del testo dei bottoni viene verificato prima dell’output.',
      ],
      howWithCodex: [
        'Chiedi una pagina: la skill emette un blocco design_plan prima di qualsiasi codice UI.',
        'Rivedi le sue scelte casuali: layout dell’hero, stack di font, componenti, paradigmi GSAP.',
        'Controlla i punti di pre-flight: calcolo della larghezza dell’hero, densità della griglia, verifica delle etichette, contrasto.',
      ],
    },
    'stitch-design-taste': {
      tagline: 'Scrive un DESIGN.md che guida Google Stitch verso schermate non generiche.',
      whatIsIt:
        'Genera un file DESIGN.md ottimizzato per la generazione di schermate con Google Stitch. Codifica atmosfera, colore, tipografia, componenti, layout, movimento e un elenco esplicito di pattern vietati.',
      whyForDesign: [
        'Le schermate Stitch ereditano un unico accento sotto l’80% di saturazione, invece di gradienti viola al neon.',
        'Hero centrati e tre righe di card identiche sono vietati oltre la varietà impostata.',
        'Gli stati di caricamento e vuoti diventano scheletrici e curati, invece dei soliti spinner generici.',
      ],
      howWithCodex: [
        'Descrivi l’atmosfera del progetto: la skill imposta i punteggi di densità, varietà e movimento.',
        'Produce un DESIGN.md in sette sezioni con codici hex e ruoli funzionali del colore.',
        'Dai in pasto quel file a Stitch direttamente, oppure tramite il server MCP di Stitch.',
      ],
    },
    'image-to-code': {
      tagline: 'Genera prima immagini di design, le analizza, poi costruisce il codice frontend corrispondente.',
      whatIsIt:
        'Un flusso di lavoro image-first per compiti web visivi. L’agente genera immagini di riferimento per ogni sezione, ne estrae tipografia, spaziature, colore e componenti, poi implementa il sito di conseguenza.',
      whyForDesign: [
        'Il codice segue un vero riferimento visivo, così l’implementazione non scivola verso layout generici.',
        'Ogni sezione ha la propria immagine grande, così testo e spaziature restano analizzabili.',
        'Gli hero restano sotto le tre righe di titolo e liberi da pile di contenitori annidati.',
      ],
      howWithCodex: [
        'Indica il numero di sezioni: in Codex la skill genera un’immagine per ogni sezione.',
        'Chiedi un rendering di dettaglio più ravvicinato quando bottoni o tipografia restano illeggibili.',
        'Fai eseguire il controllo di chiarezza prima che scriva qualsiasi file di implementazione.',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: 'Genera flussi di schermate per app mobile di livello premium come immagini, non come codice.',
      whatIsIt:
        'Una skill solo immagini per concept e flussi di schermate mobile su prodotti iOS, Android e cross-platform. Presenta le schermate dentro mockup di telefono puliti e non scrive mai codice.',
      whyForDesign: [
        'Le schermate rispettano safe area e zone di sistema, invece di sembrare siti web dentro un telefono.',
        'Una design bible fissa mantiene palette, tipografia e icone coerenti su ogni schermata.',
        'I set multi-schermata formano un flusso credibile, non mockup isolati e scollegati.',
      ],
      howWithCodex: [
        'Indica la categoria dell’app e il numero di schermate: ogni schermata diventa un’immagine a sé.',
        'La skill sceglie prima una modalità piattaforma: iOS, Android, o neutra cross-platform.',
        'Chiedile di rigenerare qualsiasi schermata dove il testo è piccolo o l’inquadratura irregolare.',
      ],
    },
    'imagegen-frontend-web': {
      tagline: 'Genera un’immagine di riferimento orizzontale per ogni sezione della landing page.',
      whatIsIt:
        'Una skill di direzione immagine per riferimenti di design di siti web. Genera un’immagine orizzontale separata per ogni sezione, con un’unica palette fissa e composizioni dell’hero variate lungo il set.',
      whyForDesign: [
        'Una landing page di otto sezioni produce otto comp leggibili, non una tavola unica compressa.',
        'La composizione dell’hero varia oltre il solito schema testo a sinistra, immagine a destra.',
        'Un’unica palette, scala tipografica e famiglia di CTA regge su ogni frame generato.',
      ],
      howWithCodex: [
        'Dì quante sezioni vuoi: se non specificato, le landing page assumono sei sezioni di default.',
        'La skill annuncia il conteggio, poi etichetta ogni output con il numero di sezione.',
        'Dai parole d’atmosfera come editoriale o cinematografico per orientare scala dell’hero e sfondo.',
      ],
    },
    'minimalist-ui': {
      tagline: 'Costruisce interfacce editoriali monocromatiche e calde con griglie bento piatte.',
      whatIsIt:
        'Un protocollo frontend per interfacce minimali in stile documento. Fissa una palette monocromatica calda, una gerarchia tipografica serif e mono, card bento con bordo 1px e accenti pastello smorzati.',
      whyForDesign: [
        'Ogni card e divisore usa un unico bordo grigio chiaro da 1px con un raggio netto.',
        'Gli accenti arrivano solo da quattro pastelli slavati riservati a tag e codice inline.',
        'Le sezioni guadagnano profondità da immagini a bassa opacità, invece di sfondi vuoti e piatti.',
      ],
      howWithCodex: [
        'Chiedi una pagina: la skill stabilisce prima il macro-spazio bianco, py-24 o py-32.',
        'Vincola la larghezza del testo a max-w-4xl e applica subito le variabili monocromatiche.',
        'Le dissolvenze all’ingresso in scroll passano da IntersectionObserver, solo su transform e opacity.',
      ],
    },
    'design-taste-frontend': {
      tagline: 'Legge il brief, sceglie una direzione, consegna interfacce non da template.',
      whatIsIt:
        'Una skill frontend anti-genericità per landing page, portfolio e restyling. Dichiara una lettura di design, imposta le manopole di varietà, movimento e densità, poi esegue un lungo controllo di pre-flight.',
      whyForDesign: [
        'I brief enterprise ricevono il pacchetto ufficiale del design system, invece di CSS fatto a mano che ne imita l’aspetto.',
        'Il pre-flight vieta trattini lunghi, eyebrow con numerazione delle sezioni, indizi di scroll e CTA doppie con lo stesso intento.',
        'La ripetizione di layout è limitata: otto sezioni usano almeno quattro famiglie diverse.',
      ],
      howWithCodex: [
        'L’agente dichiara una lettura di design in una riga prima di scrivere codice.',
        'Imposta tre manopole: varietà di design, intensità del movimento e densità visiva.',
        'Ogni voce del pre-flight deve superare il controllo, altrimenti la pagina non è finita.',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: 'Costruisce interfacce rigide in stile stampa svizzera o terminale CRT, con grana analogica.',
      whatIsIt:
        'Un design system per interfacce che fondono la stampa tipografica svizzera con l’estetica dei terminali militari. Specifica griglie rigide, contrasto estremo nella scala tipografica, un unico accento rosso di pericolo e degrado analogico simulato.',
      whyForDesign: [
        'Si sceglie un unico substrato per progetto, così chiaro e scuro non si mescolano mai.',
        'border-radius è rifiutato del tutto, così ogni angolo resta a novanta gradi.',
        'Filtri di retinatura, scanline e rumore evitano che le superfici sembrino vettoriali e piatte.',
      ],
      howWithCodex: [
        'Scegli un archetipo: stampa industriale svizzera o terminale CRT da telemetria tattica.',
        'I titoli macro usano clamp con tracking negativo; i metadati usano monospace maiuscolo piccolo.',
        'Gap di griglia da 1px con sfondi in contrasto producono le linee divisorie sottilissime.',
      ],
    },
    'redesign-existing-projects': {
      tagline: 'Audita un sito esistente e lo aggiorna senza rompere le funzionalità.',
      whatIsIt:
        'Un flusso di scansione, diagnosi e correzione per progetti esistenti. Audita tipografia, colore, layout, stati, contenuti, icone e qualità del codice, poi applica miglioramenti mirati dentro lo stack esistente.',
      whyForDesign: [
        'I gradienti viola-blu da AI e le tre righe di card identiche vengono sostituiti con alternative ponderate.',
        'I bottoni nei gruppi di card si allineano su un’unica linea di base, anche con contenuti di lunghezza diversa.',
        'Gli stati mancanti di hover, focus, caricamento, vuoto ed errore vengono completati.',
      ],
      howWithCodex: [
        'Scansiona prima il codebase per identificare framework e metodo di styling.',
        'Elenca ogni pattern generico e punto debole prima di cambiare qualsiasi cosa.',
        'Le correzioni arrivano in ordine di priorità: font, colore, stati, layout, componenti, rifinitura tipografica.',
      ],
    },
    'brandkit': {
      tagline: 'Genera tavole di brand guideline, sistemi di logo e deck di identità come immagini.',
      whatIsIt:
        'Una skill di generazione immagini per tavole di brand kit. Produce sistemi di logo, pannelli colore e tipografia, mockup e immagini d’atmosfera disposti su una tavola di presentazione basata su griglia.',
      whyForDesign: [
        'Un sistema di pannelli 3x3 di default copre logo, costruzione, colore, tipografia e applicazioni.',
        'I concept di logo seguono un metodo dichiarato, come monogramma, fusione metaforica o spazio negativo.',
        'Le tavole hanno un ritmo: pannelli quieti, funzionali, emotivi e tecnici, invece di un’unica intensità uniforme.',
      ],
      howWithCodex: [
        'Dai marchio e categoria: la skill sceglie prima una modalità visiva.',
        'Di default produce una tavola 3x3, oppure un mini deck di riferimento 2x3.',
        'Tieni il testo minimo: nome del brand, un tagline, un comando, poche etichette.',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: 'Ricette Lenis più GSAP ScrollTrigger per landing page guidate dallo scroll.',
      whatIsIt:
        'Codice funzionante per preloader, reveal di split-text mascherato, reveal di sezione, scene fissate a scrub, stack di card sticky e parallasse, con Lenis e GSAP ScrollTrigger.',
      whyForDesign: [
        'I token di movimento fissano durate, sfalsamenti, offset e sfocatura così i reveal restano coerenti.',
        'Ogni effetto ha un ramo reduced-motion che tiene intatti layout e contrasto.',
        'Un ordine di build mette prima la pagina statica, poi il movimento, evitando scene di scroll ingarbugliate.',
      ],
      howWithCodex: [
        'Installa gsap e lenis, poi collega Lenis al ticker di GSAP.',
        'Marca le sezioni con i data attribute per reveal, stack e parallasse.',
        'Aggiungi per ultime le scene fissate a scrub, poi esegui la checklist di QA.',
      ],
    },
    'webgl-3d-object': {
      tagline: 'Una mesh hero Three.js illuminata con materiale PBR e ombre reali.',
      whatIsIt:
        'Una ricetta Three.js per un oggetto hero sfaccettato: geometria a icosaedro, MeshStandardMaterial, camera prospettica, luci key e rim, piano d’ombra, lenta rotazione fluttuante.',
      whyForDesign: [
        'Geometria e illuminazione reali producono bordi, riflessi e ombre che le transform CSS non possono simulare.',
        'I preset di materiale coprono look metallo premium, ceramica morbida e tech tinto di glow.',
        'Il movimento si limita a lenta rotazione e piccola oscillazione, così il testo resta primario.',
      ],
      howWithCodex: [
        'Aggiungi il guscio canvas quadrato, poi eseguici sopra l’inizializzatore Three.js.',
        'Imposta color, metalness, roughness ed emissive per intonarti all’atmosfera del brand.',
        'Conferma la gestione del resize e lo smontaggio di geometria, materiale e renderer.',
      ],
    },
    'css-border-gradient': {
      tagline: 'Aggiunge un raffinato bordo in gradiente a card, modali e superfici hero.',
      whatIsIt:
        'Una ricetta CSS per bordi in gradiente discreti che sfrutta la sovrapposizione di padding-box e border-box, più una variante con pseudo-elemento mascherato per superfici con sfondi complessi.',
      whyForDesign: [
        'Dà una definizione del bordo premium senza il glow squillante dei bordi al neon.',
        'La variante mascherata preserva uno sfondo esistente invece di sovrascriverlo.',
        'I default tengono gli stop sotto lo 0.4 di opacità, così i bordi incorniciano invece di competere.',
      ],
      howWithCodex: [
        'Punta Codex su una card o un pannello prezzi che ha bisogno di un bordo migliore.',
        'Scegli il pattern semplice per i riempimenti pieni, quello mascherato per gli sfondi complessi.',
        'Controlla i temi chiaro e scuro separatamente, dato che l’alpha di rado si trasferisce.',
      ],
    },
    'high-end-visual-design': {
      tagline: 'Blocca i default AI generici e impone layout e movimento da agenzia.',
      whatIsIt:
        'Una skill direttiva che vieta i soliti default di design AI, poi obbliga l’agente a scegliere un archetipo di atmosfera e uno di layout prima di scrivere codice UI.',
      whyForDesign: [
        'Inter, Roboto e le icone Lucide spesse sono vietate, così l’output smette di sembrare da template.',
        'Le card ottengono guscio esterno e nucleo interno annidati, dando ai contenitori una profondità lavorata reale.',
        'Il padding delle sezioni parte da py-24, così i layout respirano invece di affollarsi.',
      ],
      howWithCodex: [
        'Chiedi una pagina a Codex: prima gira in silenzio il motore di varietà.',
        'Imposta texture di sfondo e scala tipografica, poi costruisce contenitori a doppia cornice.',
        'Inietta movimento cubic-bezier su misura, poi esegue la checklist di pre-output.',
      ],
    },
    'pick-ui-library': {
      tagline: 'Abbina un compito frontend a un’unica libreria scelta con criterio.',
      whatIsIt:
        'Una skill di consultazione da invocare a mano. Mappa un compito dichiarato su un’unica libreria consigliata, da una tabella curata che copre primitive, movimento, grafici, virtualizzazione, stato e styling.',
      whyForDesign: [
        'Un consiglio per compito, così niente menù di opzioni su cui discutere.',
        'Controlla prima package.json, così riusa ciò che il progetto ha già.',
        'Individua dropdown e toast fatti a mano e li sostituisce con primitive accessibili.',
      ],
      howWithCodex: [
        'Invocala esplicitamente: non si attiva mai da sola.',
        'Dichiara il compito, non il nome della libreria, tipo «mi servono i toast».',
        'Nomina una libreria, ne spiega l’uso, poi la collega.',
      ],
    },
    'apple-design': {
      tagline: 'I principi di interfaccia fluida di Apple tradotti in molle e gesti per il web.',
      whatIsIt:
        'Conoscenza distillata dai talk di design Apple al WWDC, soprattutto Designing Fluid Interfaces, mappata su CSS, Pointer Events e librerie di molle. Copre risposta, interrompibilità, momentum, materiali, tipografia e accessibilità.',
      whyForDesign: [
        'Il feedback scatta al pointer-down, così gli elementi premuti smettono di sembrare morti.',
        'Le animazioni partono dal valore live a schermo, eliminando i salti visibili quando si interrompono.',
        'I colpi rapidi proiettano un punto d’arrivo, così i lanci finiscono dove puntava il gesto.',
      ],
      howWithCodex: [
        'Chiedi a Codex di costruire uno sheet, un drawer o un’interazione di trascinamento.',
        'Traccia 1:1 con pointer capture e registra lo storico della velocità.',
        'Al rilascio passa la velocità a una molla usando i valori di smorzamento forniti.',
      ],
    },
    'animation-vocabulary': {
      tagline: 'Trasforma una descrizione vaga di movimento nel suo termine tecnico esatto.',
      whatIsIt:
        'Un glossario a ricerca inversa. Descrivi a grandi linee un effetto di movimento e la skill restituisce il termine preciso, citato alla lettera, con alternative vicine quando più d’una calza.',
      whyForDesign: [
        'Dà al designer la parola giusta con cui istruire un agente.',
        'Disambigua coppie vicine come clip-path contro mask, pop in contro bounce.',
        'Si rifiuta di inventare termini, così la nomenclatura resta affidabile.',
      ],
      howWithCodex: [
        'Descrivi ciò che hai visto, tipo «lo scroll rubber-band di iOS».',
        'Restituisce il termine in grassetto più una definizione di glossario in una riga.',
        'Chiedi le alternative quando due termini potrebbero calzare entrambi.',
      ],
    },
    'emil-design-eng': {
      tagline: 'Le regole di Emil Kowalski per timing delle animazioni, easing e rifinitura dei componenti.',
      whatIsIt:
        'Codifica una filosofia di design engineering: un framework decisionale per le animazioni, indicazioni sulle molle, principi sui componenti, tecniche di clip-path, gestione dei gesti, regole di performance e una checklist di revisione.',
      whyForDesign: [
        'Le azioni frequenti perdono del tutto l’animazione, così le command palette restano istantanee.',
        'Gli ingressi partono da scale(0.95), mai scale(0), così niente compare dal nulla.',
        'I popover scalano dal loro trigger invece che dal centro, mantenendo il legame spaziale.',
      ],
      howWithCodex: [
        'Chiedi a Codex di rivedere il codice UI: restituisce una tabella Prima, Dopo, Perché.',
        'Per un nuovo movimento risponde se va animato, perché, con quale easing e quanto veloce.',
        'Applica la checklist, segnalando transition: all e durate oltre i 300ms.',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: 'Un unico punto d’ingresso che smista lavori di logo, identità, slide, banner e icone.',
      whatIsIt:
        'Una skill di design unificata che smista i compiti a sub-skill o moduli integrati. Gli integrati coprono generazione di logo, mockup di identità aziendale, slide HTML, banner, foto social e icone SVG tramite script Gemini.',
      whyForDesign: [
        'Logo, mockup di identità e deck nascono tutti da un unico input di brand.',
        'Le icone si generano come testo SVG, così restano modificabili, non raster.',
        'Le regole dei banner impongono zone di sicurezza, massimo due font e una sola CTA.',
      ],
      howWithCodex: [
        'Esporta prima GEMINI_API_KEY e installa google-genai e pillow.',
        'Esegui scripts/logo/search.py per un brief di design, poi generate.py per le immagini.',
        'Dai il logo in pasto a scripts/cip/generate.py per produrre mockup pronti alla consegna.',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: 'Progetta banner dimensionati in HTML, poi li esporta come PNG.',
      whatIsIt:
        'Un flusso banner in cinque passi: raccogliere i requisiti, studiare la direzione artistica, costruire il banner in HTML e CSS con visual generati, catturare lo screenshot ai pixel esatti della piattaforma, poi presentare opzioni da iterare.',
      whyForDesign: [
        'Ogni banner esce ai pixel esatti della piattaforma, così niente viene ritagliato o ridimensionato.',
        'I visual generati sono resi senza testo, così i titoli restano HTML nitido.',
        'Tre direzioni artistiche per richiesta, così il confronto precede la scelta.',
      ],
      howWithCodex: [
        'Rispondi alle domande su scopo, piattaforma, contenuto, brand, stile e quantità.',
        'Costruisce un banner HTML per direzione artistica, con le zone di sicurezza applicate.',
        'Cattura ognuno alla larghezza e altezza fissate, comprimendo i file oltre il limite.',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: 'Costruisce interfacce accessibili con componenti shadcn e utility Tailwind.',
      whatIsIt:
        'Unisce uno strato di componenti shadcn su primitive Radix, uno strato di styling con utility Tailwind e uno strato di design visivo su canvas. Include file di riferimento per theming, accessibilità, regole responsive e personalizzazione.',
      whyForDesign: [
        'Dialog e menù ereditano la gestione del focus di Radix, così l’accessibilità non è un ripensamento.',
        'I colori del tema vivono in variabili CSS, così la dark mode resta coerente.',
        'I breakpoint mobile-first fanno partire i layout in piccolo e crescere verso l’alto.',
      ],
      howWithCodex: [
        'Esegui npx shadcn@latest init per configurare framework e tema.',
        'Aggiungi componenti con npx shadcn@latest add button card dialog form.',
        'Esegui scripts/tailwind_config_gen.py per generare una config con token personalizzati.',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: 'Tiene sincronizzati brand guideline, design token e asset.',
      whatIsIt:
        'Una skill di brand identity costruita attorno a script che iniettano il contesto di brand nei prompt, validano gli asset, estraggono i colori e sincronizzano brand-guidelines.md in JSON di design token e variabili CSS.',
      whyForDesign: [
        'Un solo file markdown è la fonte di verità per token e CSS.',
        'I colori estratti vengono confrontati con la palette, cogliendo presto la deriva.',
        'Gli asset vengono controllati per nome, dimensione e formato prima dell’approvazione.',
      ],
      howWithCodex: [
        'Modifica docs/brand-guidelines.md, poi esegui scripts/sync-brand-to-tokens.cjs.',
        'Verifica con scripts/inject-brand-context.cjs --json.',
        'Controlla ogni nuovo file con scripts/validate-asset.cjs prima di spedirlo.',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: 'Costruisce deck di presentazione HTML con Chart.js e pattern di layout.',
      whatIsIt:
        'Una piccola skill di smistamento per presentazioni HTML strategiche. Interpreta un sottocomando, poi carica file di riferimento su pattern di layout, un template HTML, formule di copywriting e strategie per le slide.',
      whyForDesign: [
        'Le slide sono HTML, così tipografia e spaziatura seguono veri design token.',
        'Chart.js gestisce le slide dati, così i numeri restano live invece di immagini incollate.',
        'I pattern di layout si scelgono da un set, mantenendo il deck coerente a livello visivo.',
      ],
      howWithCodex: [
        'Invocala con il sottocomando create più un argomento e il numero di slide.',
        'Carica references/create.md e segue quel flusso di creazione.',
        'Attinge pattern di layout e formule di copywriting dai file di riferimento.',
      ],
    },
    'design-system-tokens': {
      tagline: 'Design token a tre livelli, specifiche dei componenti e generazione di slide conforme ai token.',
      whatIsIt:
        'Una skill di design system che copre i livelli di token primitivi, semantici e di componente come variabili CSS, più le specifiche di stato dei componenti e un generatore di slide che costruisce deck dagli stessi token.',
      whyForDesign: [
        'Il livello di token semantici rende il passaggio tra tema chiaro e scuro un cambio di config, non una riscrittura.',
        'Le specifiche dei componenti tabulano gli stati default, hover, active e disabled, così l’handoff non lascia ambiguità.',
        'Un validatore segnala i valori hex scritti a mano, tenendo componenti e slide sul sistema di token.',
      ],
      howWithCodex: [
        'Esegui generate-tokens.cjs su una config JSON di token per produrre il tuo file di variabili CSS.',
        'Chiedi a Codex le specifiche dei componenti, poi esegui validate-tokens.cjs su src/ per intercettare i valori grezzi.',
        'Usa search-slides.py con i flag di posizione e contesto per scegliere i layout di un deck.',
      ],
    },
    'editorial-ui-style': {
      tagline: 'Layout da rivista in serif Gelasio su una rigida griglia da 8pt.',
      whatIsIt:
        'Una skill di linee guida di design system per un look editoriale moderno: serif Gelasio sia per il corpo che per i titoli, Ubuntu Mono, quasi nero #111111 su superfici bianche e una griglia di base da 8pt.',
      whyForDesign: [
        'Titoli e corpo serif da un’unica famiglia mantengono i lunghi passaggi di lettura coerenti sul piano tipografico.',
        'Una griglia di base da 8pt impone un ritmo verticale tra titoli, corpo del testo e spaziatura.',
        'L’asticella di accessibilità include supporto reduced-motion, target touch da 44px e gestione dell’alto contrasto.',
      ],
      howWithCodex: [
        'Chiedi a Codex di riformulare l’intento di design, poi definisci i token prima di toccare i componenti.',
        'Richiedi regole di componente che coprano anatomia, varianti, stati e comportamento responsive.',
        'Chiudi con la checklist di QA così un revisore del codice può verificare l’output.',
      ],
    },
    'terracotta-ui-style': {
      tagline: 'Accento argilla su crema, titoli DM Serif Display, lettura long-form.',
      whatIsIt:
        'Una skill di linee guida per un’interfaccia editoriale color terra: superfici crema #F3E9D8, un unico accento terracotta #C56A3C, titoli DM Serif Display, JetBrains Mono. Tarata per blog e storytelling.',
      whyForDesign: [
        'Un solo colore d’accento, così l’enfasi resta rara e sono i titoli a reggere la gerarchia.',
        'Le calde superfici crema riducono l’abbagliamento negli articoli lunghi rispetto alle pagine bianco puro.',
        'I titoli serif sopra un corpo testo bruno inchiostro danno un chiaro ritmo editoriale.',
      ],
      howWithCodex: [
        'Punta Codex sui token terracotta e crema prima che scriva qualsiasi componente.',
        'Chiedi anatomia, varianti e stati per ogni componente, con i token di spaziatura nominati esplicitamente.',
        'Richiedi anti-pattern e note di migrazione quando riadatti una UI esistente incoerente.',
      ],
    },
    'dithered-ui-style': {
      tagline: 'Ombreggiatura a pattern di punti e palette limitata per schermate retrò ad alto contrasto.',
      whatIsIt:
        'Una skill di linee guida per interfacce dithered che usano pattern di punti per simulare sfumature da una palette limitata. Corpo Open Sans, titoli Space Grotesk, IBM Plex Mono, accenti blu e viola.',
      whyForDesign: [
        'I pattern di punti sostituiscono i gradienti, così l’ombreggiatura sopravvive a un set di colori volutamente ristretto.',
        'Il rendering ad alto contrasto tiene il testo leggibile anche quando le superfici portano una texture di pattern marcata.',
        'Le regole vietano il movimento decorativo, impedendo al trattamento retrò di diventare rumore visivo.',
      ],
      howWithCodex: [
        'Comunica prima a Codex il limite di palette, poi lascia che ne ricavi le regole di ombreggiatura a pattern.',
        'Chiedi gli stati vuoto, di caricamento ed errore così le superfici a pattern restano leggibili.',
        'Verifica aree di tocco e stati di focus, che questa skill segnala esplicitamente.',
      ],
    },
    'neumorphism-ui-style': {
      tagline: 'Superfici morbide estruse in grigio pietra con tipografia Space Mono.',
      whatIsIt:
        'Una skill di linee guida per UI neumorfica: ombre interne ed esterne su una superficie monocromatica pietra #E7E5E4, un accento teal #006666, Space Mono per titoli e corpo, spaziatura a densità compatta.',
      whyForDesign: [
        'Le superfici monocromatiche fanno nascere la profondità dall’ombra invece che dal contrasto di colore.',
        'La spaziatura a densità compatta si adatta a pannelli ricchi di controlli come dashboard e schermate impostazioni.',
        'Le regole vietano di mescolare metafore visive, così l’estrusione morbida resta l’unico linguaggio di profondità.',
      ],
      howWithCodex: [
        'Fai impostare a Codex i token di superficie e ombra prima di dare stile a ogni singolo controllo.',
        'Chiedi stati di focus visibili, dato che le sole ombre morbide non bastano a chi usa la tastiera.',
        'Pretendi HTML semantico prima di ARIA, come specifica questa skill.',
      ],
    },
    'bento-ui-style': {
      tagline: 'Griglia di blocchi variati su crema, tipografia Inter, scala compatta.',
      whatIsIt:
        'Una skill di linee guida per layout bento box che presentano il contenuto come blocchi a griglia di dimensioni variabili. Inter dappertutto, una scala tipografica compatta da 12 a 32, accenti pesca e blu su crema.',
      whyForDesign: [
        'Le dimensioni variabili dei blocchi reggono la gerarchia, così è la griglia stessa a ordinare.',
        'Una scala tipografica compatta da 12 a 32 fa entrare testo denso in tessere piccole.',
        'La superficie crema #FFF5E6 tiene leggibili i bordi dei blocchi senza cornici pesanti.',
      ],
      howWithCodex: [
        'Chiedi a Codex di assegnare a ogni blocco una dimensione in base alla priorità del contenuto.',
        'Definisci i token di spaziatura sulla scala da 4 a 32 prima di disporre le tessere.',
        'Richiedi la gestione di overflow ed etichette lunghe, che questa skill elenca tra i casi limite.',
      ],
    },
    'claymorphism-ui-style': {
      tagline: 'Forme 3D gonfie e arrotondate, titoli Poppins, blu su bianco.',
      whatIsIt:
        'Una skill di linee guida per UI claymorfica: forme morbide, arrotondate e gonfie che imitano l’argilla malleabile. Titoli Poppins, corpo Montserrat, un accento blu #3B82F6 e testo blu profondo su bianco.',
      whyForDesign: [
        'Le forme gonfie e arrotondate danno ai bottoni un’ovvia affordance premibile senza etichette in più.',
        'Il testo blu profondo #1C398E su bianco regge il contrasto mentre la palette resta giocosa.',
        'Le regole vietano di mescolare metafore, così la profondità argilla non si combina mai con vetro o flat.',
      ],
      howWithCodex: [
        'Chiedi prima a Codex i token di raggio e ombra, dato che definiscono il look argilla.',
        'Abbina i titoli Poppins al corpo Montserrat come specificato, non due sans simili.',
        'Controlla che gli stati focus-visible e disabled sopravvivano al trattamento a forme morbide.',
      ],
    },
    'brutalism-ui-style': {
      tagline: 'Layout ispirati al cemento grezzo, titoli Darker Grotesque, rosso e ocra.',
      whatIsIt:
        'Una skill di linee guida per UI brutalista, ispirata all’architettura in cemento grezzo degli anni ’50: spoglia, funzionale, volutamente stridente. Titoli Darker Grotesque, rosso #DD614C e ocra #DAA144 su bianco.',
      whyForDesign: [
        'Elementi marcati e spogli eliminano la decorazione, così a reggere il peso sono struttura e testo.',
        'Due accenti forti, rosso e ocra, sostituiscono del tutto gradienti e ombre.',
        'L’asticella minima di accessibilità vale comunque, così i layout stridenti mantengono contrasto e focus visibile.',
      ],
      howWithCodex: [
        'Comunica a Codex che il tono è marcato e spoglio prima che scelga i componenti.',
        'Ancora ogni regola a un token o a una soglia, come richiedono i controlli di qualità.',
        'Abbina a ogni regola di cosa fare un esempio concreto di cosa non fare quando rivedi l’output.',
      ],
    },
    'hallmark-design-skill': {
      tagline: 'Flusso di design anti-sciatteria con 58 controlli e varietà strutturale forzata.',
      whatIsIt:
        'Una skill di design per assistenti di coding AI, con un flusso di build predefinito e tre verbi: audit, redesign e study. Spinge verso la varietà strutturale così due build non condividono lo stesso ritmo di pagina.',
      whyForDesign: [
        'Le regole di diversificazione impongono macrostrutture, nav e footer diversi tra build consecutive.',
        'I token bloccati vietano valori hex o font-family inline che aggirano il blocco dei token.',
        'Ogni output viene verificato alle larghezze di 320, 375, 414 e 768 pixel.',
      ],
      howWithCodex: [
        'Lascia che la scansione di pre-flight legga prima font, palette e librerie di movimento esistenti.',
        'Rispondi ai controlli su pubblico, caso d’uso e tono, oppure dì di procedere.',
        'Esegui hallmark audit su una pagina per una lista di interventi ordinata, senza modifiche.',
      ],
    },
    'impeccable': {
      tagline: 'Due dozzine di comandi per costruire, criticare e rifinire interfacce frontend.',
      whatIsIt:
        'Una skill di design frontend con comandi raggruppati in build, evaluate, refine, enhance, fix e iterate. Legge il contesto del progetto e un riferimento di registro, poi scrive codice di livello produzione.',
      whyForDesign: [
        'La divisione per registro manda pagine marketing e UI di prodotto verso regole di design diverse.',
        'I divieti assoluti rifiutano testo in gradiente, bordi a striscia laterale ed etichette eyebrow sopra ogni sezione.',
        'Le soglie minime di contrasto sono esplicite: 4.5:1 per il corpo del testo, 3:1 per il testo grande.',
      ],
      howWithCodex: [
        'Esegui context.mjs una volta per sessione così la skill carica PRODUCT.md e DESIGN.md.',
        'Invoca un comando come critique, polish o animate con un file di destinazione.',
        'Usa la modalità live con un dev server attivo per generare varianti nel browser.',
      ],
    },
    'design-dna': {
      tagline: 'Estrae un design di riferimento in JSON strutturato, poi genera a partire da quello.',
      whatIsIt:
        'Un flusso in tre fasi che cattura l’identità di design tra token misurabili, stile qualitativo ed effetti visivi. Produce un JSON di Design DNA completo, poi applica quel JSON a nuovi contenuti.',
      whyForDesign: [
        'Trasforma uno screenshot o un URL in valori nominati di colore, tipografia e spaziatura.',
        'Registra atmosfera, composizione e voce del brand, non solo token misurabili.',
        'Cattura effetti Canvas, WebGL, shader e di scroll che il semplice CSS non può esprimere.',
      ],
      howWithCodex: [
        'Chiedi lo schema per vedere tutte e tre le dimensioni prima di analizzare qualsiasi cosa.',
        'Passa a Codex immagini di riferimento o URL e richiedi un DNA JSON popolato.',
        'Passa il JSON insieme al tuo contenuto per generare una pagina HTML autonoma.',
      ],
    },
    'material-3': {
      tagline: 'Implementa Material Design 3 di Google su Compose, Flutter e web.',
      whatIsIt:
        'Una guida a Material Design 3 che copre il namespace di token md.sys, oltre 30 componenti, layout adattivo, theming e M3 Expressive. Jetpack Compose è il target principale; Flutter e @material/web sono secondari.',
      whyForDesign: [
        'I token di colore, tipografia, forma ed elevazione sostituiscono i valori hex e di raggio scritti a mano.',
        'Le superfici tonali reggono la profondità al posto delle ombre, in linea con la spec MD3 attuale.',
        'Un audit a punteggio valuta dieci categorie ed elenca le correzioni in ordine di priorità.',
      ],
      howWithCodex: [
        'Indica la piattaforma così Codex sceglie Compose, Flutter o le CSS custom properties.',
        'Chiedi un componente e ottieni la variante corretta più il collegamento dei token.',
        'Esegui l’audit su un URL o su file sorgente per un report di conformità.',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: 'Sedici regole concrete di rifinitura UI con una checklist di revisione.',
      whatIsIt:
        'Un insieme di principi di design engineering per la rifinitura dell’interfaccia: raggi concentrici, allineamento ottico, ombre stratificate, animazioni d’ingresso sfalsate, numeri tabulari, aree di tocco e specificità delle transizioni.',
      whyForDesign: [
        'Nomina valori esatti, così lo scale alla pressione è sempre 0.96, mai a occhio.',
        'Corregge il disallineamento dei raggi annidati che fa sembrare storti gran parte dei componenti.',
        'Intercetta lo spostamento di layout dovuto ai numeri che cambiano prima che arrivi agli utenti.',
      ],
      howWithCodex: [
        'Punta Codex su un componente e chiedigli di applicare i principi.',
        'Richiedi una revisione: i riscontri tornano come tabelle Prima e Dopo.',
        'Esegui la checklist da quattordici voci prima di fare merge di qualsiasi modifica frontend.',
      ],
    },
    'visual-plan': {
      tagline: 'Trasforma piani testuali in documenti revisionabili con wireframe e prototipi.',
      whatIsIt:
        'Una modalità di pianificazione strutturata per agenti di coding. I piani diventano documenti scorribili con diagrammi inline, codice, modelli dati, domande aperte e un canvas in cima o un prototipo live opzionali.',
      whyForDesign: [
        'I piani UI si aprono con artboard di wireframe, uno per ogni stato visibile all’utente.',
        'Chi revisiona commenta su elementi ancorati invece di discutere in chat.',
        'I flussi a più passi ottengono un prototipo utilizzabile accanto ai mockup statici.',
      ],
      howWithCodex: [
        'Installala con la CLI Agent-Native, poi esegui il comando /visual-plan.',
        'Incolla un piano Codex o Markdown esistente da usare come sorgente.',
        'Leggi i feedback, correggi il piano e verifica il risultato salvato.',
      ],
    },
    'kami': {
      tagline: 'Compone curriculum, white paper, deck e landing page su un unico linguaggio di design.',
      whatIsIt:
        'Un sistema di template per documenti professionali e landing page di prodotto. Tela pergamena calda, accento blu inchiostro, gerarchia guidata dal serif, con template per nove tipi di documento più quindici primitive di diagramma.',
      whyForDesign: [
        'Un solo colore d’accento e un’unica famiglia serif tengono ogni consegna coerente sul piano visivo.',
        'Un contratto di densità segnala le pagine di corpo che risultano riempite meno della metà.',
        'Le primitive di diagramma coprono architetture, flowchart, quadranti, timeline e grafici.',
      ],
      howWithCodex: [
        'Di’ cosa ti serve: l’albero decisionale sceglie il template adatto.',
        'Lascia che Codex distilli prima il tuo contenuto grezzo in un content.json validato.',
        'Esegui lo script di build per produrre HTML, PDF e report di verifica.',
      ],
    },
    'masked-reveal': {
      tagline: 'Rivela i titoli parola per parola tramite una maschera di overflow durante lo scroll.',
      whatIsIt:
        'Un pattern GSAP ScrollTrigger che spezza un titolo in span di parole mascherate e le fa salire sfalsate quando il testo entra nel viewport. Include un pattern di cleanup per React.',
      whyForDesign: [
        'Lo sfalsamento a livello di parola risulta più calmo ed editoriale dell’animazione lettera per lettera.',
        'Gli screen reader ricevono comunque il testo completo tramite un aria-label.',
        'Chi ha reduced-motion vede testo statico senza alcuna transform applicata.',
      ],
      howWithCodex: [
        'Marca un titolo con data-masked-reveal e aggiungi le regole CSS di mask.',
        'Chiama l’helper di split, che evita il plugin a pagamento SplitText.',
        'Avvolgi in un GSAP context in React così ScrollTrigger fa pulizia al cambio di route.',
      ],
    },
    'framed-grid-layout': {
      tagline: 'Costruisce layout editoriali precisi con cornici sottili e parentesi angolari.',
      whatIsIt:
        'Un pattern di griglia a dodici colonne in cui ogni sezione si aggancia a colonne condivise dentro box con cornice da 1px. Le parentesi angolari a L sono disegnate come livelli di sfondo su una texture diagonale a bassa opacità.',
      whyForDesign: [
        'Ogni sezione condivide un colore di bordo, una dimensione di parentesi, una scala di spaziatura.',
        'Le parentesi angolari non richiedono markup in più, così la struttura resta nel CSS.',
        'Il layout resta chiaro anche se si rimuove il livello di texture.',
      ],
      howWithCodex: [
        'Chiedi una pagina tecnica o editoriale e ottieni prima la griglia madre.',
        'Assegna classi di span esplicite invece di larghezze di sezione improvvisate.',
        'Verifica che i bordi delle cornici si allineino in verticale e in orizzontale a entrambi i breakpoint.',
      ],
    },
    'container-lines': {
      tagline: 'Traccia discrete linee guida verticali ai bordi del contenitore dei contenuti.',
      whatIsIt:
        'Un pattern CSS che aggiunge linee verticali da 1px a entrambi i bordi del contenitore dei contenuti, più mini quadrati angolari opzionali. Le guide stanno dietro al contenuto e ignorano gli eventi puntatore.',
      whyForDesign: [
        'Rivela la larghezza del contenitore, così le sezioni hero sciolte guadagnano tensione strutturale.',
        'Le guide condividono max-width e padding del contenitore, così non vanno mai fuori posto.',
        'Gli eventi puntatore sono disabilitati, così le linee non bloccano mai click o selezione.',
      ],
      howWithCodex: [
        'Aggiungi la classe container-lines al guscio di layout.',
        'Metti i quadrati angolari solo sugli angoli reali di contenitore o sezione.',
        'Controlla che le linee restino discrete sia su sfondi chiari che scuri.',
      ],
    },
    'skeuomorphic-ui': {
      tagline: 'Dà a bottoni e pannelli una profondità tattile con gradienti e ombre stratificati.',
      whatIsIt:
        'Una ricetta di superficie per UI web tattile: riempimenti a gradiente verticale, un bordo in gradiente riflettente da 1px, ombre esterne e interne sovrapposte. Testo in rilievo, icone e micro texture sono opzionali.',
      whyForDesign: [
        'Gli stati sollevato e premuto invertono la profondità, così i controlli sembrano fisici.',
        'La profondità resta direzionale, con luce dall’alto e ombra sotto.',
        'Mette in guardia dal mescolare glassmorphism, neumorphism e skeuomorphism in un solo componente.',
      ],
      howWithCodex: [
        'Imposta i token di base una volta, poi regolali per brand e tema.',
        'Applica la superficie sollevata a card, bottoni, tab e alloggiamenti dei controlli.',
        'Aggiungi la variante premuta solo ai toggle attivi e alle tab selezionate.',
      ],
    },
    'beautiful-shadows': {
      tagline: 'Tre utility d’ombra Tailwind pronte all’uso per un’elevazione neutra e stratificata.',
      whatIsIt:
        'Un set di classi Tailwind di ombra arbitraria esatte in tre intensità. Ognuna sovrappone più livelli neutri a bassa opacità invece della scala d’ombra predefinita di Tailwind.',
      whyForDesign: [
        'L’elevazione resta neutra, senza glow colorato che tinge la superficie sottostante.',
        'Tre intensità fisse corrispondono rispettivamente a controlli, card e media hero.',
        'I livelli sovrapposti a bassa opacità sembrano profondità reale invece di una singola ombra netta.',
      ],
      howWithCodex: [
        'Chiedi a Codex di applicare l’utility md a card, pannelli e popover.',
        'Riserva l’utility lg ai media hero e ai contenitori tipo modale.',
        'Abbina ogni ombra a un riempimento di superficie pulito e a un raggio coerente.',
      ],
    },
    'dither-background': {
      tagline: 'Sfondo canvas con dithering Bayer 4x4 visibile e pixel quadrati.',
      whatIsIt:
        'Una ricetta canvas che rende un campo procedurale quasi nero da value noise, FBM e una soglia Bayer 4x4, disegnato come celle quadrate ingrandite.',
      whyForDesign: [
        'Le celle ingrandite tengono leggibile la matrice di dithering invece di collassare in grana di pellicola.',
        'Una palette monocromatica a sei passi tiene leggibile la tipografia in primo piano senza un overlay pesante.',
        'Vignettatura e massa fuori asse danno un’unica area focale luminosa, non una luminosità uniforme.',
      ],
      howWithCodex: [
        'Metti il canvas fisso dietro al contenuto e imposta pointer-events a none.',
        'Regola cellSize tra 5px e 10px per la leggibilità della matrice.',
        'Regola i valori di wave, cloud, ridge e vignette per modellare la massa.',
      ],
    },
    'webgl-laser': {
      tagline: 'Fascio shader a schermo intero con nucleo incandescente e foschia tinta di brand.',
      whatIsIt:
        'Un fragment shader WebGL grezzo che disegna un laser verticale sottile su un quad a schermo intero. Il nucleo resta quasi bianco; alone e fumo FBM seguono il tuo accento.',
      whyForDesign: [
        'Alone e fumo derivano dal tuo accento di brand invece che da un blu scritto a mano.',
        'Larghezze separate per nucleo e glow tengono il fascio una lama, non una barra.',
        'Il fumo si concentra vicino al fascio e si dissolve verso l’esterno, proteggendo il contrasto del testo.',
      ],
      howWithCodex: [
        'Imposta una custom property --brand-accent, che lo shader converte in RGB.',
        'Metti il canvas fisso dietro al contenuto con pointer-events none.',
        'Regola coreWidth, glowWidth, smokeDensity e xOffset per posizionare il fascio.',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: 'Sistema blu notte quasi nero con un campo mesh dentro un guscio hero.',
      whatIsIt:
        'Una direzione blu scuro con token di colore CSS, un guscio hero a bordo in gradiente, un campo mesh su canvas, una nav pill in vetro, nodi fluttuanti, binari e CTA in coppia.',
      whyForDesign: [
        'Il mesh sta dentro il guscio hero, così guida la composizione invece di decorarla.',
        'Token nominati fissano i valori di sfondo, guscio, linea, testo e accento su tutta la pagina.',
        'Binari, quadrati angolari e pill dei nodi danno al guscio minimale una struttura tecnica.',
      ],
      howWithCodex: [
        'Incolla il blocco di token, poi costruisci le fondamenta della pagina e il guscio hero.',
        'Aggiungi il canvas mesh dentro il guscio, dietro al contenuto del guscio.',
        'Metti qualche nodo, binario e marcatore, poi tieni lenti i loop di drift.',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: 'Griglia editoriale multicolonna con titoli fuori scala e minuscole etichette maiuscole.',
      whatIsIt:
        'Una direzione di layout per siti d’agenzia: gusci di griglia ampi, titoli display fuori scala, piccoli metadati maiuscoli in colonne adiacenti e blocchi immagine architettonici.',
      whyForDesign: [
        'Una collocazione rigida delle colonne fa sembrare intenzionale la posizione di ogni elemento.',
        'Il contrasto di scala tra titoli display e metadati minuscoli regge la gerarchia.',
        'Lo spazio negativo viene preservato invece di riempito, mantenendo la pagina editoriale.',
      ],
      howWithCodex: [
        'Imposta prima un guscio ampio a max-width con divisioni di colonna visibili.',
        'Ancora un titolo hero su gran parte delle colonne, il testo di supporto in una colonna laterale.',
        'Costruisci le righe dei servizi come elenchi multicolonna con minuscole etichette di metadati.',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: 'Superfici scure smerigliate costruite attorno a un quadrante di calibrazione circolare.',
      whatIsIt:
        'Una direzione dark glass incentrata su un quadrante simile a un orologio: base quasi nera con griglie a fasci, capsule di nav smerigliate e un elemento centrale a anelli e tacche stratificato.',
      whyForDesign: [
        'Un quadrante dominante ancora il layout invece di stare lì come widget decorativo.',
        'Linee a fascio e mirini si allineano al quadrante, rinforzando la logica di calibrazione.',
        'La palette monocromatica fa nascere la luminosità dai riflessi del vetro, non da accenti saturi.',
      ],
      howWithCodex: [
        'Parti da una base quasi nera più deboli guide a griglia e a fascio.',
        'Costruisci nav, pill e bottoni come capsule di vetro scuro con wrapper di riflesso da 1px.',
        'Stratifica il quadrante: anello esterno, tacche, etichette rotanti, emblema centrale.',
      ],
    },
    'gsap-skills': {
      tagline: 'Set ufficiale di animazione GSAP, dai tween di base a ScrollTrigger e React.',
      whatIsIt:
        'Il set di skill ufficiale di GreenSock per costruire animazione web con GSAP. Otto moduli coprono l’API di base, le timeline, ScrollTrigger, i plugin, React, altri framework, performance e utility.',
      whyForDesign: [
        'Il movimento segue la vera API di GSAP invece di far indovinare la sintassi all’agente.',
        'ScrollTrigger e timeline vengono sequenziati come si deve, non impilati alla buona.',
        'Le regole di performance tengono l’animazione fluida invece che a scatti durante lo scroll.',
      ],
      howWithCodex: [
        'Installa il set di skill GSAP così Codex può caricare il modulo giusto.',
        'Chiedi il movimento che vuoi: il modulo giusto gestisce l’API.',
        'Usa il modulo React o quello dei framework dentro un albero di componenti.',
      ],
    },
    'animation-review': {
      tagline: 'Trova, migliora e revisiona il movimento rispetto a un’asticella di qualità senior.',
      whatIsIt:
        'Tre skill di movimento di Emil Kowalski che lavorano come un unico ciclo: trovare i punti che dovrebbero animarsi, migliorare il movimento esistente e revisionare il codice di animazione rispetto a un’alta asticella di qualità.',
      whyForDesign: [
        'Fa emergere la UI che dovrebbe muoversi e non lo fa, e scarta il movimento che non dovrebbe esserci.',
        'Trasforma il vago «rendilo più piacevole» in un audit del movimento con priorità.',
        'Tiene l’animazione a un’asticella di qualità dichiarata, non al gusto personale.',
      ],
      howWithCodex: [
        'Esegui il passaggio di ricerca per individuare le opportunità di movimento nella tua UI.',
        'Applica il passaggio di miglioramento per rilavorare il codice di animazione esistente.',
        'Esegui il passaggio di revisione prima di spedire per intercettare il movimento di scarsa qualità.',
      ],
    },
  },
};
