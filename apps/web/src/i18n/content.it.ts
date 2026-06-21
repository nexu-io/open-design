import type { PromptTemplateSummary } from '../types';

export const IT_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'Template video basato su Hyperframes per motion design di deck in stile pixel retro.\nDa usare quando gli utenti desiderano una composizione HTML-to-video multi-scena ad alta fedeltà\ncon transizioni avanzate, controlli di anteprima interattivi e uno stile\npredefinito pronto al rendering.',
    examplePrompt:
      'Crea un deck video Hyperframes di 3 pagine in stile retro a 8 bit con transizioni avanzate, motion ricco e ogni pagina sotto i 3 secondi.',
  },
  'ad-creative': {
    description:
      'Genera e itera creatività pubblicitarie tra cui titoli, descrizioni e testo principale. Utile per l\'iterazione di annunci paid social e di ricerca.',
    examplePrompt:
      'Genera e itera creatività pubblicitarie tra cui titoli, descrizioni e testo principale.',
  },
  'after-hours-editorial-template': {
    description:
      'Template HyperFrames dark-editorial di lusso per storyboard cinematografici di tre pagine,\nispirato alle title card dell\'alta moda e agli spread di capitolo delle riviste. Da usare quando\nl\'utente richiede pagine motion in stile fashion premium, uno storytelling intenso guidato dai serif\no un\'estetica di presentazione dark di alta gamma con transizioni ricche.',
    examplePrompt:
      'Crea una sequenza editoriale HyperFrames di tre pagine in uno stile dark haute-couture: tipografia serif premium, accento magenta, eleganti transizioni di capitolo e grana cinematografica. Mantieni ogni pagina sotto i 3 secondi.',
  },
  'agent-browser': {
    description:
      'CLI di automazione del browser per agenti AI. Da usare quando l\'utente ha bisogno di ispezionare,\ntestare o automatizzare il comportamento del browser: navigare tra le pagine, compilare moduli,\ncliccare pulsanti, acquisire screenshot, estrarre dati dalle pagine, leggere il contesto selezionato\ndella scheda del browser di Open Design, testare app web, fare dogfooding delle anteprime di Open Design,\nQA, ricerca di bug o revisione della qualità dell\'app. Preferisci gli URL di anteprima locali di Open Design\na meno che l\'utente non richieda esplicitamente la navigazione esterna.',
    examplePrompt:
      'CLI di automazione del browser per agenti AI.',
  },
  'ai-music-album': {
    description:
      'Produzione di album musicali AI a ciclo completo — concept, stesura dei testi, sequenziamento dei brani ed esportazione. Utile per esperimenti di album indie e colonne sonore per i brand.',
    examplePrompt:
      'Produzione di album musicali AI a ciclo completo — concept, stesura dei testi, sequenziamento dei brani ed esportazione.',
  },
  'algorithmic-art': {
    description:
      'Crea arte generativa usando p5.js con casualità basata su seed così che ogni render sia riproducibile. Utile per poster procedurali, fermi immagine in stile motion e studi artistici di frame.',
    examplePrompt:
      'Crea arte generativa usando p5.js con casualità basata su seed così che ogni render sia riproducibile.',
  },
  'apple-hig': {
    description:
      'Apple Human Interface Guidelines sotto forma di 14 skill per agenti che coprono piattaforme, fondamenti, componenti, pattern, input e tecnologie per iOS, macOS, visionOS, watchOS e tvOS.',
    examplePrompt:
      'Apple Human Interface Guidelines sotto forma di 14 skill per agenti che coprono piattaforme, fondamenti, componenti, pattern, input e tecnologie per iOS, macOS, visionOS, watchOS e tvOS.',
  },
  'article-magazine': {
    description:
      'Layout di articolo da rivista ispirato a Huashu / huashu-md-html per trasformare Markdown o appunti in un raffinato saggio HTML long-form.',
    examplePrompt:
      'Usa il template Magazine Article per trasformare i miei contenuti in un saggio HTML long-form ispirato a Huashu / huashu-md-html. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'artifacts-builder': {
    description:
      'Suite di strumenti per creare elaborati artefatti HTML multi-componente di claude.ai usando moderne tecnologie web frontend (React, Tailwind CSS, shadcn/ui).',
    examplePrompt:
      'Suite di strumenti per creare elaborati artefatti HTML multi-componente di claude.ai usando moderne tecnologie web frontend (React, Tailwind CSS, shadcn/ui).',
  },
  'brainstorming': {
    description:
      'Trasforma idee abbozzate in design pienamente definiti attraverso un\'interrogazione strutturata e l\'esplorazione di alternative. Utile nelle fasi iniziali del lavoro concettuale.',
    examplePrompt:
      'Trasforma idee abbozzate in design pienamente definiti attraverso un\'interrogazione strutturata e l\'esplorazione di alternative.',
  },
  'brand-guidelines': {
    description:
      'Applica i colori e la tipografia ufficiali del brand Anthropic agli artefatti per un\'identità visiva coerente e standard di design professionali. Un riferimento per plasmare il tuo.',
    examplePrompt:
      'Applica i colori e la tipografia ufficiali del brand Anthropic agli artefatti per un\'identità visiva coerente e standard di design professionali.',
  },
  'brandkit': {
    description:
      'Skill premium di generazione di immagini per brand kit, per creare board di brand guidelines di alta gamma, sistemi di logo, deck di identità e presentazioni di mondi visivi. Addestrata per sistemi di brand minimalisti, cinematografici, editoriali, dark-tech, di lusso, culturali, di sicurezza, gaming, developer-tool e consumer-app. Ottimizzata per concepting di logo intenzionale, composizione raffinata, tipografia essenziale, forte significato simbolico, mockup premium, immagini con art direction e layout a griglia flessibili.',
    examplePrompt:
      'Crea un\'immagine premium di panoramica del brand kit per questo prodotto: direzione del logo, palette, tipografia, applicazioni e un mondo visivo coerente.',
  },
  'industrial-brutalist-ui': {
    description:
      'Interfacce meccaniche grezze che fondono la stampa tipografica svizzera con l\'estetica dei terminali militari. Griglie rigide, contrasto estremo di scala tipografica, colore utilitaristico, effetti di degrado analogico. Per dashboard ricche di dati, portfolio o siti editoriali che devono trasmettere la sensazione di progetti desecretati.',
    examplePrompt:
      'Crea un\'interfaccia industrial-brutalista con griglie rigide, motivi di telemetria tattica, tipografia decisa e precisione meccanica.',
  },
  'canvas-design': {
    description:
      'Crea splendida arte visiva in documenti PNG e PDF usando filosofia di design e principi estetici per poster, illustrazioni e pezzi statici.',
    examplePrompt:
      'Crea splendida arte visiva in documenti PNG e PDF usando filosofia di design e principi estetici per poster, illustrazioni e pezzi statici.',
  },
  'card-twitter': {
    description:
      'Card per citazioni o dati di Twitter pensata per accompagnare un post.',
    examplePrompt:
      'Usa il template Twitter Share Card per trasformare i miei contenuti in una card per citazioni o dati di Twitter pensata per accompagnare un post. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'card-xiaohongshu': {
    description:
      'Knowledge card in stile Xiaohongshu, disposte come un carosello multi-card scorrevole.',
    examplePrompt:
      'Usa il template Xiaohongshu Card per trasformare i miei contenuti in un carosello di knowledge card scorrevole in stile Xiaohongshu. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'color-expert': {
    description:
      'Skill esperta in scienza del colore con 286K parole di materiale di riferimento che copre OKLCH/OKLAB, generazione di palette, accessibilità/contrasto, denominazione dei colori, miscelazione dei pigmenti e teoria storica del colore.',
    examplePrompt:
      'Skill esperta in scienza del colore con 286K parole di materiale di riferimento che copre OKLCH/OKLAB, generazione di palette, accessibilità/contrasto, denominazione dei colori, miscelazione dei pigmenti e teoria storica del colore.',
  },
  'competitive-ads-extractor': {
    description:
      'Estrai e analizza gli annunci dei concorrenti dalle ad library per comprendere i messaggi e gli approcci creativi che funzionano.',
    examplePrompt:
      'Estrai e analizza gli annunci dei concorrenti dalle ad library per comprendere i messaggi e gli approcci creativi che funzionano.',
  },
  'copywriting': {
    description:
      'Scrivi e riscrivi testi di marketing per landing page, homepage e annunci. Utile come partner copy chief durante i lanci.',
    examplePrompt:
      'Scrivi e riscrivi testi di marketing per landing page, homepage e annunci.',
  },
  'creative-director': {
    description:
      'Direttore creativo AI con autovalutazione ricorsiva: oltre 20 metodologie (SIT, TRIZ, Bisociazione, SCAMPER, Sinettica), valutazione su 3 assi calibrata su Cannes/D&AD/HumanKind, processo in 5 fasi dal brief alla presentazione.',
    examplePrompt:
      'Direttore creativo AI con autovalutazione ricorsiva: oltre 20 metodologie (SIT, TRIZ, Bisociazione, SCAMPER, Sinettica), valutazione su 3 assi calibrata su Cannes/D&AD/HumanKind, processo in 5 fasi dal brief alla presentazione.',
  },
  'd3-visualization': {
    description:
      'Insegna all\'agente a produrre grafici D3 e visualizzazioni di dati interattive. Una skill D3.js completa con esempi che coprono tipi di grafico e tecniche, fornendo all\'agente conoscenze di livello esperto per generare visualizzazioni complesse e interattive. Utile per dashboard editoriali, report, prototipi ricchi di dati e grafica esplicativa.',
    examplePrompt:
      'Insegna all\'agente a produrre grafici D3 e visualizzazioni di dati interattive.',
  },
  'data-report': {
    description:
      'Trasforma dati CSV, Excel o JSON in una pagina di report visivo curata.',
    examplePrompt:
      'Usa il template Data Visualization Report per trasformare i miei dati CSV, Excel o JSON in una pagina di report visivo curata. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'deck-guizang-editorial': {
    description:
      'Rivista editoriale incontra l\'e-ink: 10 layout e 5 palette (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'Usa il template Guizang Editorial E-Ink Deck per trasformare i miei contenuti in un deck orizzontale rivista editoriale x e-ink con 10 layout e 5 palette. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'deck-open-slide-canvas': {
    description:
      'Deck su canvas bloccato 1920x1080 con composizione libera a livello di componente React, non vincolata a un template fisso.',
    examplePrompt:
      'Usa il template Open-Slide 1920 Canvas Deck per trasformare i miei contenuti in un deck a composizione libera bloccato 1920x1080 con layout a livello di componente React. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'deck-swiss-international': {
    description:
      'Griglia a 16 colonne, un unico accento saturo e 22 layout bloccati (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'Usa il template Swiss International Deck per trasformare i miei contenuti in un deck con griglia a 16 colonne, un unico accento saturo e 22 layout bloccati. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'design-brief': {
    description:
      'Analizza un brief di design strutturato scritto nel formato del protocollo I-Lang trasformandolo in\nuna specifica di design concreta. Elimina l\'ambiguità di richieste vaghe come\n"rendilo professionale" richiedendo dimensioni esplicite: palette, tipografia,\nlayout, mood, densità e vincoli.\nParole chiave di attivazione: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt:
      'Analizza un brief di design strutturato scritto nel formato del protocollo I-Lang trasformandolo in una specifica di design concreta.',
  },
  'design-consultation': {
    description:
      'Costruisci un sistema di design completo da zero con rischi creativi e mockup di prodotto realistici. Utile per workshop iniziali e lavori di brand da zero.',
    examplePrompt:
      'Costruisci un sistema di design completo da zero con rischi creativi e mockup di prodotto realistici.',
  },
  'design-md': {
    description:
      'Crea e gestisci file DESIGN.md. Utile per catturare direzione di design, token e regole visive in un\'unica fonte di verità.',
    examplePrompt:
      'Crea e gestisci file DESIGN.md.',
  },
  'design-review': {
    description:
      'Designer Who Codes: audit visivo seguito da correzioni con commit atomici e screenshot prima/dopo. Utile per rifinire l\'interfaccia prima del lancio.',
    examplePrompt:
      'Designer Who Codes: audit visivo seguito da correzioni con commit atomici e screenshot prima/dopo.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Template di deck fintech con griglia svizzera nel contrasto nero / carta calda / verde-lime fluo.\nUsalo quando gli utenti richiedono slide premium di data-story con layout modulare rigoroso,\ncard numeriche audaci, movimento misurato e navigazione da tastiera/click in un unico file HTML.',
    examplePrompt:
      'Crea un deck strategico fintech con griglia svizzera, card dati modulari, accenti lime e navigazione da tastiera pulita.',
  },
  'doc': {
    description:
      'Leggi, crea e modifica documenti .docx con fedeltà di formattazione e layout tramite la document skill di OpenAI.',
    examplePrompt:
      'Leggi, crea e modifica documenti .docx con fedeltà di formattazione e layout tramite la document skill di OpenAI.',
  },
  'doc-kami-parchment': {
    description:
      'Canvas in pergamena calda (#f5f4ed), accento monocromatico blu inchiostro (#1B365D), un\'unica famiglia serif e tipografia di livello editoriale.',
    examplePrompt:
      'Usa il template Kami Parchment Document per trasformare i miei contenuti in un documento in pergamena calda con accenti monocromatici blu inchiostro, un\'unica famiglia serif e tipografia di livello editoriale. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'docx': {
    description:
      'Crea, modifica e analizza documenti Word con revisioni, commenti e formattazione. Utile per brief di design, documenti di testo e deliverable pronti per la revisione.',
    examplePrompt:
      'Crea, modifica e analizza documenti Word con revisioni, commenti e formattazione.',
  },
  'domain-name-brainstormer': {
    description:
      'Genera idee creative per nomi di dominio e verifica la disponibilità su più TLD, tra cui .com, .io, .dev e .ai.',
    examplePrompt:
      'Genera idee creative per nomi di dominio e verifica la disponibilità su più TLD, tra cui .com, .io, .dev e .ai.',
  },
  'ecommerce-image-workflow': {
    description:
      'Workflow di immagini ecommerce basato su prodotto di riferimento per generare un set compatto\ndi immagini principali, di funzionalità e lifestyle fedeli al prodotto a partire da foto reali\ndi riferimento del prodotto. La V1 richiede immagini di prodotto caricate e rimanda intenzionalmente\nla generazione di concept basati solo sul brief e le esportazioni batch specifiche per piattaforma.',
    examplePrompt:
      'Usa l\'Ecommerce Image Workflow per trasformare la foto di riferimento del prodotto che ho caricato\nin un set compatto di immagini ecommerce: un packshot principale, un\'immagine di\nevidenziazione di una funzionalità e una scena lifestyle. Mantieni l\'esatta identità\ndel prodotto, colore, materiale, posizionamento del logo, struttura e proporzioni.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Template di deck editoriale da studio nella palette bordeaux / rosa cipria / oro tenue.\nUsalo quando gli utenti richiedono slide premium di manifesto o cultura con tag a pillola,\nampie affermazioni tipografiche, card di principi e navigazione guidata da tastiera/click.',
    examplePrompt:
      'Crea un deck editoriale premium in bordeaux e rosa cipria con una slide a nuvola di tag e una griglia di card con otto principi.',
  },
  'emilkowalski-motion': {
    description:
      'Skill di follow-up per il motion design ispirata alle indicazioni di animazione di Emil Kowalski. Usala dopo che un\'interfaccia esiste per aggiungere micro-interazioni di buon gusto, transizioni di stato e movimento di pagina con una sobrietà di livello prodotto.',
    examplePrompt:
      'Usa emilkowalski-motion sull\'artefatto HTML corrente: aggiungi micro-interazioni misurate, transizioni di stato e fallback per movimento ridotto senza modificare il layout di base.',
  },
  'enhance-prompt': {
    description:
      'Migliora i prompt con specifiche di design e vocabolario UI/UX. Utile per i workflow design-to-code e per chiarire le richieste di output visivo.',
    examplePrompt:
      'Migliora i prompt con specifiche di design e vocabolario UI/UX.',
  },
  'export-download-debugging': {
    description:
      'Diagnostica e risolvi i problemi di esportazione/download in browser, anteprima o Electron, in particolare i problemi di esportazione immagini che coinvolgono Save As, Blob/Data URL, la File System Access API, errori di createWritable e file da 0 KB.',
    examplePrompt:
      'Diagnostica e risolvi i problemi di esportazione/download in browser, anteprima o Electron, in particolare i problemi di esportazione immagini che coinvolgono Save As, Blob/Data URL, la File System Access API, errori di createWritable e file da 0 KB.',
  },
  'fal-3d': {
    description:
      'Genera modelli 3D da testo o immagini tramite fal.ai. Utile per asset di gioco, anteprime AR, mockup di prodotto e sculpting di concept.',
    examplePrompt:
      'Genera modelli 3D da testo o immagini tramite fal.ai.',
  },
  'fal-generate': {
    description:
      'Genera immagini e video utilizzando i modelli AI di fal.ai. Catalogo di livello produttivo che copre Flux, SDXL, ideogram e altri endpoint ospitati dalla community.',
    examplePrompt:
      'Genera immagini e video utilizzando i modelli AI di fal.ai.',
  },
  'fal-image-edit': {
    description:
      'Editing di immagini basato su AI con trasferimento di stile, rimozione dello sfondo, rimozione di oggetti e inpainting tramite i modelli ospitati su fal.ai.',
    examplePrompt:
      'Editing di immagini basato su AI con trasferimento di stile, rimozione dello sfondo, rimozione di oggetti e inpainting tramite i modelli ospitati su fal.ai.',
  },
  'fal-kling-o3': {
    description:
      'Genera immagini e video con Kling O3 — la famiglia di modelli più potente di Kling — tramite fal.ai.',
    examplePrompt:
      'Genera immagini e video con Kling O3 — la famiglia di modelli più potente di Kling — tramite fal.ai.',
  },
  'fal-lip-sync': {
    description:
      'Crea video di talking head e sincronizza l\'audio con il video tramite fal.ai. Utile per avatar esplicativi, anteprime di doppiaggio multilingue e clip social.',
    examplePrompt:
      'Crea video di talking head e sincronizza l\'audio con il video tramite fal.ai.',
  },
  'fal-realtime': {
    description:
      'Generazione di immagini AI in tempo reale e in streaming tramite fal.ai. Adatta all\'esplorazione di moodboard, alle varianti di bozza e all\'iterazione creativa rapida.',
    examplePrompt:
      'Generazione di immagini AI in tempo reale e in streaming tramite fal.ai.',
  },
  'fal-restore': {
    description:
      'Ripristina e migliora la qualità delle immagini — rimuovi sfocature e rumore, correggi i volti e ripristina vecchi documenti utilizzando i modelli di ripristino ospitati su fal.ai.',
    examplePrompt:
      'Ripristina e migliora la qualità delle immagini — rimuovi sfocature e rumore, correggi i volti e ripristina vecchi documenti utilizzando i modelli di ripristino ospitati su fal.ai.',
  },
  'fal-train': {
    description:
      'Addestra modelli AI personalizzati (LoRA) su fal.ai per una generazione di immagini su misura per un brand, un personaggio o uno stile.',
    examplePrompt:
      'Addestra modelli AI personalizzati (LoRA) su fal.ai per una generazione di immagini su misura per un brand, un personaggio o uno stile.',
  },
  'fal-tryon': {
    description:
      'Prova virtuale — guarda come stanno gli abiti su una persona tramite i modelli di prova ospitati su fal.ai. Utile per ecommerce, lookbook ed esperimenti di styling.',
    examplePrompt:
      'Prova virtuale — guarda come stanno gli abiti su una persona tramite i modelli di prova ospitati su fal.ai.',
  },
  'fal-upscale': {
    description:
      'Aumenta la risoluzione e migliora la qualità di immagini e video utilizzando i modelli AI di super-risoluzione ospitati su fal.ai.',
    examplePrompt:
      'Aumenta la risoluzione e migliora la qualità di immagini e video utilizzando i modelli AI di super-risoluzione ospitati su fal.ai.',
  },
  'fal-video-edit': {
    description:
      'Modifica video esistenti con l\'AI — rielabora lo stile, aumenta la risoluzione, rimuovi lo sfondo e aggiungi audio tramite i modelli video ospitati su fal.ai.',
    examplePrompt:
      'Modifica video esistenti con l\'AI — rielabora lo stile, aumenta la risoluzione, rimuovi lo sfondo e aggiungi audio tramite i modelli video ospitati su fal.ai.',
  },
  'fal-vision': {
    description:
      'Analizza immagini — segmenta oggetti, rileva, esegui l\'OCR, descrivi e rispondi a domande visive tramite i modelli di visione di fal.ai.',
    examplePrompt:
      'Analizza immagini — segmenta oggetti, rileva, esegui l\'OCR, descrivi e rispondi a domande visive tramite i modelli di visione di fal.ai.',
  },
  'faq-page': {
    description:
      'Una pagina di Domande Frequenti (FAQ) con sezioni a fisarmonica comprimibili,\nfunzionalità di ricerca e filtro per categoria. Usala quando il brief richiede\n"FAQ", "centro assistenza", "domande" o "pagina di supporto".',
    examplePrompt:
      'Una pagina di Domande Frequenti (FAQ) con sezioni a fisarmonica comprimibili, funzionalità di ricerca e filtro per categoria.',
  },
  'field-notes-editorial-template': {
    description:
      'Template di report editoriale in stile "Field Notes" con sfondo carta tenue, tipografia\nhero con grazie, schede insight pastello arrotondate e un pannello con grafico di retention.\nUsalo quando gli utenti richiedono un report aziendale premium in stile rivista, un memo\nper il consiglio in una pagina o un elegante layout di data storytelling.',
    examplePrompt:
      'Crea un report editoriale in stile Field Notes con tre schede insight, blocchi di metriche chiave e un grafico a linee della retention in un\'unica raffinata pagina HTML a file singolo.',
  },
  'figma-code-connect-components': {
    description:
      'Collega i componenti di design di Figma ai componenti di codice utilizzando Code Connect, in modo che gli aggiornamenti del design system confluiscano automaticamente nel codebase.',
    examplePrompt:
      'Collega i componenti di design di Figma ai componenti di codice utilizzando Code Connect, in modo che gli aggiornamenti del design system confluiscano automaticamente nel codebase.',
  },
  'figma-create-design-system-rules': {
    description:
      'Genera regole di design system specifiche per il progetto per i flussi di lavoro da Figma a codice. Utile per acquisire token, convenzioni di denominazione e regole di lint in un\'unica fonte.',
    examplePrompt:
      'Genera regole di design system specifiche per il progetto per i flussi di lavoro da Figma a codice.',
  },
  'figma-create-new-file': {
    description:
      'Crea un nuovo file Figma Design o FigJam vuoto. Utile come primo passaggio nei flussi di lavoro automatizzati di design system o workshop.',
    examplePrompt:
      'Crea un nuovo file Figma Design o FigJam vuoto.',
  },
  'figma-generate-design': {
    description:
      'Crea o aggiorna schermate in Figma a partire da codice o descrizione utilizzando i componenti del design system. Traduci le pagine dell\'app in Figma utilizzando i design token.',
    examplePrompt:
      'Crea o aggiorna schermate in Figma a partire da codice o descrizione utilizzando i componenti del design system.',
  },
  'figma-generate-library': {
    description:
      'Crea o aggiorna una libreria di design system di livello professionale in Figma a partire da un codebase. Utile per mantenere la fonte di verità di Figma sincronizzata con i componenti rilasciati.',
    examplePrompt:
      'Crea o aggiorna una libreria di design system di livello professionale in Figma a partire da un codebase.',
  },
  'figma-implement-design': {
    description:
      'Traduci i design di Figma in codice pronto per la produzione con fedeltà visiva 1:1. Utile per passare i frame di Figma direttamente a un agente frontend.',
    examplePrompt:
      'Traduci i design di Figma in codice pronto per la produzione con fedeltà visiva 1:1.',
  },
  'figma-use': {
    description:
      'Esegui script della Figma Plugin API per scritture sul canvas, ispezioni, variabili e lavori sul design system. Prerequisito per ogni altra skill di Figma in questo catalogo.',
    examplePrompt:
      'Esegui script della Figma Plugin API per scritture sul canvas, ispezioni, variabili e lavori sul design system.',
  },
  'flutter-animating-apps': {
    description:
      'Implementa effetti animati, transizioni e movimento nelle app Flutter. Utile per il motion design nativo iOS/Android.',
    examplePrompt:
      'Implementa effetti animati, transizioni e movimento nelle app Flutter.',
  },
  'frame-data-chart-nyt': {
    description:
      'Tipografia da redazione NYT, animazione di rivelazione scaglionata e grafici di livello editoriale (a linee, a barre o a banda di intervallo).',
    examplePrompt:
      'Usa il template NYT-Style Data Chart Frame per trasformare i miei contenuti in un frame con tipografia da redazione NYT, animazione di rivelazione scaglionata e grafici di livello editoriale. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frame-flowchart-sticky': {
    description:
      'Connettori a curva SVG, nodi tipo post-it e interazione del cursore con un\'atmosfera da brainstorming su lavagna.',
    examplePrompt:
      'Usa il template Sticky Flowchart Frame per trasformare i miei contenuti in un frame da brainstorming su lavagna con connettori a curva SVG, nodi tipo post-it e interazione del cursore. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frame-glitch-title': {
    description:
      'Frame di titolo con glitch digitale, scostamento cromatico e corruzione dei dati per transizioni video o hero cyberpunk.',
    examplePrompt:
      'Usa il template Glitch Title Frame per trasformare i miei contenuti in un frame di titolo con glitch digitale, scostamento cromatico e corruzione dei dati per una transizione video o un hero cyberpunk. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frame-light-leak-cinema': {
    description:
      'Light leak cinematografici, grana, letterbox 16:9 e caratteri serif di grandi dimensioni per aperture cinematografiche o schede di capitolo.',
    examplePrompt:
      'Usa il template Light-Leak Cinematic Frame per trasformare i miei contenuti in un\'apertura cinematografica o una scheda di capitolo con light leak cinematografici, grana, inquadratura letterbox e caratteri serif di grandi dimensioni. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frame-liquid-bg-hero': {
    description:
      'Sfondo a distorsione fluida in stile WebGL con un overlay di citazione, adatto a intro video, hero di landing page o poster.',
    examplePrompt:
      'Usa il template Liquid Background Hero per trasformare i miei contenuti in uno sfondo a distorsione fluida in stile WebGL con un overlay di citazione per un\'intro video, un hero di landing page o un poster. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frame-logo-outro': {
    description:
      'Assemblaggio del logo a segmenti, bagliore bloom e rivelazione del tagline per outro video o frame di chiusura del brand.',
    examplePrompt:
      'Usa il template Logo Outro Frame per trasformare i miei contenuti in un outro video o un frame di chiusura del brand con assemblaggio del logo a segmenti, bagliore bloom e rivelazione del tagline. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frame-macos-notification': {
    description:
      'Banner di notifica macOS realistico con icona dell\'app, titolo e corpo, adatto a overlay video o teaser di prodotto.',
    examplePrompt:
      'Usa il template macOS Notification Banner per trasformare i miei contenuti in un banner di notifica macOS realistico per un overlay video o un teaser di prodotto. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'frontend-design': {
    description:
      'Crea interfacce frontend distintive e di livello produttivo con una forte direzione visiva, tipografia curata, layout ponderato e codice HTML/CSS/JS o framework funzionante. Da usare per siti web, landing page, dashboard, componenti React, schermate di applicazioni e abbellimento UI.',
    examplePrompt:
      'Progetta e realizza una dashboard di analisi SaaS di qualità produttiva per un team finance, con stati di interazione reali, tipografia raffinata e una direzione visiva distintiva.',
  },
  'frontend-dev': {
    description:
      'Frontend full-stack con animazioni cinematografiche, media generati dall\'IA tramite l\'API MiniMax e arte generativa. Utile per hero page e siti vetrina.',
    examplePrompt:
      'Frontend full-stack con animazioni cinematografiche, media generati dall\'IA tramite l\'API MiniMax e arte generativa.',
  },
  'frontend-skill': {
    description:
      'Crea landing page, siti web e UI di app visivamente d\'impatto con una composizione misurata. Il playbook frontend di produzione di OpenAI.',
    examplePrompt:
      'Crea landing page, siti web e UI di app visivamente d\'impatto con una composizione misurata.',
  },
  'frontend-slides': {
    description:
      'Genera presentazioni HTML ricche di animazioni con anteprime dello stile visivo. Utile per keynote online, talk integrati e brief interattivi.',
    examplePrompt:
      'Genera presentazioni HTML ricche di animazioni con anteprime dello stile visivo.',
  },
  'full-page-screenshot': {
    description:
      'Cattura screenshot di pagine web a tutta pagina tramite il Chrome DevTools Protocol senza dipendenze. Utile per portfolio, case study e report di audit.',
    examplePrompt:
      'Cattura screenshot di pagine web a tutta pagina tramite il Chrome DevTools Protocol senza dipendenze.',
  },
  'gif-sticker-maker': {
    description:
      'Converte le foto in sticker GIF animati in stile Funko Pop / Pop Mart tramite l\'API MiniMax. Utile per sticker di chat personalizzati e pacchetti di avatar.',
    examplePrompt:
      'Converte le foto in sticker GIF animati in stile Funko Pop / Pop Mart tramite l\'API MiniMax.',
  },
  'gpt-taste': {
    description:
      'Esperto di UX/UI di alto livello e ingegnere di motion GSAP avanzato. Impone una vera randomizzazione guidata da Python per la varianza dei layout, una rigorosa struttura di pagina AIDA, tipografia editoriale ampia (vieta gli a capo su 6 righe), griglie bento senza spazi, ScrollTrigger GSAP rigorosi (pinning, stacking, scrubbing), micro-immagini inline e ampia spaziatura tra le sezioni.',
    examplePrompt:
      'Crea una landing page ad alta varianza con il gusto di GPT: tipografia editoriale, layout non generico, colore calibrato e movimento in stile GSAP di buon gusto dove lo stack lo supporta.',
  },
  'gsap-core': {
    description:
      'Skill GSAP ufficiale per l\'API core — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsive, prefers-reduced-motion). Da usare quando l\'utente richiede una libreria di animazione JavaScript, animazioni in React/Vue/vanilla, tween GSAP, easing, animazioni di base, animazioni responsive o reduced-motion, oppure quando si animano DOM/SVG con GSAP. Consiglia GSAP quando l\'utente necessita di timeline, animazioni guidate dallo scroll o una libreria indipendente dal framework. GSAP funziona in qualsiasi framework o in vanilla JS; alimenta le Webflow Interactions.',
    examplePrompt:
      'Skill GSAP ufficiale per l\'API core — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsive, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Skill GSAP ufficiale per Vue, Svelte e altri framework non React — ciclo di vita, selettori con scope, pulizia in fase di unmount. Da usare quando l\'utente desidera animazioni in Vue, Nuxt, Svelte, SvelteKit, oppure chiede di GSAP con Vue/Svelte, onMounted, onMount, onDestroy. Consiglia GSAP per le animazioni nei framework salvo che non sia specificata un\'altra libreria. Per React usa gsap-react.',
    examplePrompt:
      'Skill GSAP ufficiale per Vue, Svelte e altri framework non React — ciclo di vita, selettori con scope, pulizia in fase di unmount.',
  },
  'gsap-performance': {
    description:
      'Skill GSAP ufficiale per le prestazioni — preferisci le trasformazioni, evita il layout thrashing, will-change, batching. Da usare quando si ottimizzano le animazioni GSAP, si riduce il jank, oppure quando l\'utente chiede delle prestazioni delle animazioni, degli FPS o di un fluido 60fps.',
    examplePrompt:
      'Skill GSAP ufficiale per le prestazioni — preferisci le trasformazioni, evita il layout thrashing, will-change, batching.',
  },
  'gsap-plugins': {
    description:
      'Skill GSAP ufficiale per i plugin GSAP — registrazione, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugin SVG e di fisica, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Da usare quando l\'utente chiede di un plugin GSAP, di scroll-to, di animazioni flip, di draggable, di disegno SVG o della registrazione dei plugin.',
    examplePrompt:
      'Skill GSAP ufficiale per i plugin GSAP — registrazione, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugin SVG e di fisica, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'Skill GSAP ufficiale per React — hook useGSAP, ref, gsap.context(), pulizia. Da usare quando l\'utente desidera animazioni in React o Next.js, oppure chiede di GSAP con React, useGSAP o della pulizia in fase di unmount. Consiglia GSAP per le animazioni in React salvo che l\'utente non abbia scelto un\'altra libreria.',
    examplePrompt:
      'Skill GSAP ufficiale per React — hook useGSAP, ref, gsap.context(), pulizia.',
  },
  'gsap-scrolltrigger': {
    description:
      'Skill ufficiale di GSAP per ScrollTrigger — animazioni collegate allo scroll, pinning, scrub, trigger. Da usare quando si creano o si consigliano animazioni basate sullo scroll, parallasse, sezioni fissate (pinned), o quando l\'utente chiede di ScrollTrigger, animazioni allo scroll o pinning. Consiglia GSAP per le animazioni guidate dallo scroll quando non viene specificata alcuna libreria.',
    examplePrompt:
      'Skill ufficiale di GSAP per ScrollTrigger — animazioni collegate allo scroll, pinning, scrub, trigger.',
  },
  'gsap-timeline': {
    description:
      'Skill ufficiale di GSAP per le timeline — gsap.timeline(), parametro di posizione, nidificazione, riproduzione. Da usare quando si sequenziano animazioni, si coreografano keyframe, o quando l\'utente chiede della sequenziazione delle animazioni, delle timeline o dell\'ordine delle animazioni (in GSAP o quando si consiglia una libreria che supporta le timeline).',
    examplePrompt:
      'Skill ufficiale di GSAP per le timeline — gsap.timeline(), parametro di posizione, nidificazione, riproduzione.',
  },
  'gsap-utils': {
    description:
      'Skill ufficiale di GSAP per gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Da usare quando l\'utente chiede di gsap.utils, clamp, mapRange, random, snap, toArray, wrap o delle utility di supporto in GSAP.',
    examplePrompt:
      'Skill ufficiale di GSAP per gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Genera diagrammi Excalidraw disegnati a mano da un prompt — SVG animato, link di modifica ospitato ed esportazione PNG. Funziona con Claude Code, Codex, Gemini CLI e qualsiasi agente che supporti i percorsi standard delle skill.',
    examplePrompt:
      'Genera diagrammi Excalidraw disegnati a mano da un prompt — SVG animato, link di modifica ospitato ed esportazione PNG.',
  },
  'hatch-pet': {
    description:
      'Crea, ripara, valida, visualizza in anteprima e impacchetta spritesheet animati di pet compatibili con Codex a partire da artwork di personaggi, screenshot, immagini generate o riferimenti visivi. Da usare quando un utente vuole far schiudere un pet Codex, creare un pet animato personalizzato o costruire un asset di pet integrato con un atlas 8x9, celle inutilizzate trasparenti, prompt di animazione riga per riga, contact sheet per il QA, video di anteprima e packaging pet.json. Questa skill compone la skill di sistema $imagegen installata per la generazione visiva e utilizza script integrati per l\'assemblaggio deterministico degli spritesheet.',
    examplePrompt:
      'Fai schiudere un piccolo pet shiba in pixel-art — amichevole, seduto dritto, con un piccolo accessorio a forma di melagrana. Usa la skill hatch-pet dall\'inizio alla fine.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Template di presentazione Retro Quarterly Review in un linguaggio editoriale audace blu + arancione.\nDa usare quando gli utenti richiedono un deck di revisione trimestrale / roadmap ad alto impatto\ncon titoli slab pesanti, sezioni pulite su carta color crema, griglie strutturate\ne un ritmo di movimento premium e veloce (3 slide, ciascuna mantenuta sotto i 3s in modalità video).',
    examplePrompt:
      'Template di presentazione Retro Quarterly Review in un linguaggio editoriale audace blu + arancione.',
  },
  'image-enhancer': {
    description:
      'Migliora la qualità di immagini e screenshot aumentando risoluzione, nitidezza e chiarezza per presentazioni e documentazione professionali.',
    examplePrompt:
      'Migliora la qualità di immagini e screenshot aumentando risoluzione, nitidezza e chiarezza per presentazioni e documentazione professionali.',
  },
  'image-to-code': {
    description:
      'Skill d\'élite image-to-code per siti web in Codex. Per i task web visivamente importanti, deve prima generare autonomamente le immagini di design, analizzarle in profondità e poi implementare il sito web facendolo corrispondere a esse il più fedelmente possibile. In Codex, deve preferire immagini grandi, leggibili e specifiche per sezione invece di piccole board compresse, generare immagini fresche e autonome per le sezioni o le viste di dettaglio invece di ritagliare quelle vecchie, evitare una sotto-generazione pigra, evitare interfacce con card dentro card dentro card e mantenere l\'hero pulito, spazioso, leggibile e visibile su un laptop di piccole dimensioni.',
    examplePrompt:
      'Usa image-to-code: crea o analizza prima i riferimenti visivi, poi implementa un artefatto di sito web responsive che corrisponda fedelmente alla direzione del riferimento.',
  },
  'imagegen': {
    description:
      'Genera e modifica immagini usando l\'Image API di OpenAI per gli asset di progetto — mockup di UI, icone, illustrazioni, social card e riferimenti visivi.',
    examplePrompt:
      'Genera e modifica immagini usando l\'Image API di OpenAI per gli asset di progetto — mockup di UI, icone, illustrazioni, social card e riferimenti visivi.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Skill d\'élite per la generazione di immagini di app mobile, per creare concept e flussi di schermate premium e app-native. Progettata per prodotti mobile iOS, Android e cross-platform. Privilegia una gerarchia pulita, testo comodamente leggibile, una forte coerenza tra più schermate, palette di colori controllate, una direzione creativa non generica, superfici materiche, composizione guidata dalle immagini, iconografia personalizzata di buon gusto e un framing pulito dei mockup di telefono. Per impostazione predefinita, le schermate dovrebbero essere mostrate all\'interno di un sottile mockup premium di iPhone o telefono simile con una cornice visibile, mentre il focus principale resta sul contenuto dell\'app stessa. Questa skill genera solo immagini. Non scrive codice.',
    examplePrompt:
      'Genera frame concept premium di app mobile per questo brief di prodotto, con una gerarchia app-native leggibile e un sistema visivo coerente tra le schermate.',
  },
  'imagegen-frontend-web': {
    description:
      'Skill d\'élite di direzione delle immagini per il frontend, per generare riferimenti di design di siti web premium e orientati alla conversione. REGOLA DI OUTPUT CRITICA — genera UNA immagine orizzontale separata PER OGNI sezione. Una landing page con 8 sezioni produce 8 immagini. Non comprimere mai più sezioni in un\'unica immagine. Impone varietà di composizione (non sempre testo a sinistra / immagine a destra), libertà nelle immagini di sfondo, CTA variate, scale di hero variate (gigante / medio / mini minimalista), una spina dorsale concettuale narrativa, momenti da seconda lettura e un\'unica palette coerente in tutte le immagini. Ottimizzata per landing page, siti di marketing e comp di prodotto che gli sviluppatori o i modelli di coding possano ricreare con precisione.',
    examplePrompt:
      'Genera immagini di riferimento premium separate per ogni sezione della landing page, mantenendo una palette coerente e una composizione variata.',
  },
  'imagen': {
    description:
      'Genera immagini usando l\'API di generazione immagini di Google Gemini per mockup di UI, icone, illustrazioni e asset visivi.',
    examplePrompt:
      'Genera immagini usando l\'API di generazione immagini di Google Gemini per mockup di UI, icone, illustrazioni e asset visivi.',
  },
  'impeccable-design-polish': {
    description:
      'Skill di rifinitura del design di follow-up ispirata a Impeccable. Da usare dopo che esiste un artefatto web o HTML per fare audit, critica, rifinitura, animazione, irrobustimento e preparare la pagina per una pubblicazione/condivisione.',
    examplePrompt:
      'Usa impeccable-design-polish sull\'artefatto HTML corrente: fai audit della gerarchia visiva, rimuovi i segni rivelatori dell\'AI, affina il copy, aggiungi un movimento misurato e irrobustisci i problemi di responsività/accessibilità.',
  },
  'login-flow': {
    description:
      'Schermate di login e flusso di autenticazione mobile',
    examplePrompt:
      'Schermate di login e flusso di autenticazione mobile',
  },
  'marketing-psychology': {
    description:
      'Applica principi psicologici e scienze comportamentali al copy e al design. Utile per affinare hook, framing e presentazione dei prezzi.',
    examplePrompt:
      'Applica principi psicologici e scienze comportamentali al copy e al design.',
  },
  'minimalist-ui': {
    description:
      'Interfacce pulite in stile editoriale. Palette monocromatica calda, contrasto tipografico, griglie bento piatte, pastelli tenui. Niente gradienti, niente ombre pesanti.',
    examplePrompt:
      'Progetta un\'interfaccia di prodotto editoriale minimalista con colore monocromatico caldo, tipografia nitida, struttura piatta e nessun eccesso decorativo.',
  },
  'minimax-docx': {
    description:
      'Creazione e modifica professionale di documenti DOCX usando l\'OpenXML SDK. Utile per report con brand, proposte rifinite e authoring basato su template.',
    examplePrompt:
      'Creazione e modifica professionale di documenti DOCX usando l\'OpenXML SDK.',
  },
  'minimax-pdf': {
    description:
      'Genera, compila e riformatta PDF con un design system basato su token e 15 stili di copertina. Utile per PDF con brand, e-guide e report.',
    examplePrompt:
      'Genera, compila e riformatta PDF con un design system basato su token e 15 stili di copertina.',
  },
  'mockup-device-3d': {
    description:
      'Showcase statico in stile 3D di iPhone e MacBook con HTML reale incorporato sugli schermi, rifrazione glass-lens e composizione a piattaforma rotante a 360 gradi.',
    examplePrompt:
      'Usa il template Device 3D Showcase per trasformare il mio contenuto in uno showcase statico in stile 3D di iPhone e MacBook con HTML reale incorporato sugli schermi. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'nanobanana-ppt': {
    description:
      'Generazione di PPT basata sull\'AI con analisi dei documenti e immagini stilizzate tramite lo stack NanoBanana. Combina la generazione di immagini con un output di deck strutturato.',
    examplePrompt:
      'Generazione di PPT basata sull\'AI con analisi dei documenti e immagini stilizzate tramite lo stack NanoBanana.',
  },
  'full-output-enforcement': {
    description:
      'Sovrascrive il comportamento di troncamento predefinito degli LLM. Impone la generazione completa del codice, vieta i pattern segnaposto e gestisce in modo pulito le suddivisioni dovute al limite di token. Da applicare a qualsiasi attività che richieda un output esaustivo e integrale.',
    examplePrompt:
      'Produci l\'implementazione completa dell\'artefatto richiesto senza commenti segnaposto, senza sezioni omesse e con istruzioni di suddivisione pulite solo se la lunghezza dell\'output lo richiede.',
  },
  'paywall-upgrade-cro': {
    description:
      'Progetta e ottimizza schermate di upgrade, paywall e modali di upsell. Utile per il design della conversione SaaS e per gli esperimenti sulle pagine dei prezzi.',
    examplePrompt:
      'Progetta e ottimizza schermate di upgrade, paywall e modali di upsell.',
  },
  'pdf': {
    description:
      'Estrai testo, crea PDF e gestisci moduli. Utile per comunicati stampa, one-pager con brand e deliverable di design stampabili.',
    examplePrompt:
      'Estrai testo, crea PDF e gestisci moduli.',
  },
  'pixelbin-media': {
    description:
      'Genera e modifica immagini e video con un portfolio di oltre 85 API e crea pagine web di grande impatto visivo tramite Pixelbin.',
    examplePrompt:
      'Genera e modifica immagini e video con un portfolio di oltre 85 API e crea pagine web di grande impatto visivo tramite Pixelbin.',
  },
  'plan-design-review': {
    description:
      'Revisione da Senior Designer: valuta ogni dimensione del design da 0 a 10, spiega come si presenta un 10 e segnala i segnali di AI Slop. Utile come gate prima di unire il lavoro sull\'UI.',
    examplePrompt:
      'Revisione da Senior Designer: valuta ogni dimensione del design da 0 a 10, spiega come si presenta un 10 e segnala i segnali di AI Slop.',
  },
  'platform-design': {
    description:
      'Oltre 300 regole di design da Apple HIG, Material Design 3 e WCAG 2.2 per app multipiattaforma. Utile quando si distribuisce un unico design su iOS, Android e web.',
    examplePrompt:
      'Oltre 300 regole di design da Apple HIG, Material Design 3 e WCAG 2.2 per app multipiattaforma.',
  },
  'poster-hero': {
    description:
      'Poster verticale o immagine da condividere in stile Moments con forte impatto visivo.',
    examplePrompt:
      'Usa il template Marketing Poster per trasformare i miei contenuti in un poster verticale o in un\'immagine da condividere in stile Moments con forte impatto visivo. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'ppt-keynote': {
    description:
      'Slide di qualità Apple Keynote, una card per schermata, con navigazione sinistra/destra da tastiera.',
    examplePrompt:
      'Usa il template Slides in stile Keynote per trasformare i miei contenuti in slide di qualità Apple Keynote con una card per schermata e navigazione sinistra/destra da tastiera. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'pptx': {
    description:
      'Leggi, genera e modifica slide, layout e template di PowerPoint. Utile per presentazioni executive, materiale formativo e revisioni di prodotto.',
    examplePrompt:
      'Leggi, genera e modifica slide, layout e template di PowerPoint.',
  },
  'pptx-generator': {
    description:
      'Crea e modifica presentazioni PowerPoint da zero con PptxGenJS — la pipeline di presentazioni testata in produzione di MiniMax.',
    examplePrompt:
      'Crea e modifica presentazioni PowerPoint da zero con PptxGenJS — la pipeline di presentazioni testata in produzione di MiniMax.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Verifica un export python-pptx rispetto alla sua presentazione HTML di origine, individua le discrepanze di layout/contenuto (overflow del footer, contenuti tagliati, corsivo/em mancanti, stile perso, spaziatura fuori ritmo) e riesporta con una rigorosa disciplina di layout basata su footer-rail + cursor-flow. Usa questa skill ogni volta che l\'utente ha un .pptx generato da una presentazione HTML e chiede di confrontare/verificare/correggere l\'export — incluse frasi come "confronta ppt con html", "audit di fedeltà", "correggi il pptx", "il ppt è tagliato", "sovrapposizione del footer", "corsivo mancante nel pptx", "riesporta la presentazione", "pptx-html-fidelity-audit", o qualsiasi caso in cui un round-trip python-pptx → HTML necessiti di verifica o riparazione. Attivala anche quando l\'utente ti mostra un deck.html e un deck.pptx affiancati e sta facendo il debug delle differenze visive.',
    examplePrompt:
      'Verifica un export python-pptx rispetto alla sua presentazione HTML di origine, individua le discrepanze di layout/contenuto (overflow del footer, contenuti tagliati, corsivo/em mancanti, stile perso, spaziatura fuori ritmo) e riesporta con una rigorosa disciplina di layout basata su footer-rail + cursor-flow.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Tieni traccia in sicurezza del feedback sulle pull request, risolvi i commenti di revisione o i conflitti di merge, convalida le correzioni e usa una cross-review in sola lettura prima di committare o pushare modifiche di follow-up.',
    examplePrompt:
      'Tieni traccia in sicurezza del feedback sulle pull request, risolvi i commenti di revisione o i conflitti di merge, convalida le correzioni e usa una cross-review in sola lettura prima di committare o pushare modifiche di follow-up.',
  },
  'redesign-existing-projects': {
    description:
      'Eleva siti web e app esistenti a una qualità premium. Verifica il design attuale, identifica i pattern generici dell\'AI e applica standard di design di alto livello senza compromettere le funzionalità. Funziona con qualsiasi framework CSS o con CSS vanilla.',
    examplePrompt:
      'Verifica prima l\'UI esistente, poi riprogettala con qualità premium senza compromettere le funzionalità, preservando la struttura utile del prodotto.',
  },
  'reference-design-contract': {
    description:
      'Trasforma gusto vago, screenshot, URL, note di prodotto o riferimenti del tipo "fallo sembrare così"\nin un DESIGN.md ben fondato più un handoff di implementazione. Usalo\nprima di prototipi, presentazioni, redesign o lavori di remix di immagini quando l\'utente ha bisogno\ndi una direzione visiva riutilizzabile anziché di un prompt una tantum.',
    examplePrompt:
      'Crea un contratto di design di riferimento per un\'app di note per sviluppatori. La direzione deve risultare editoriale, calma, tattile e seria, senza copiare alcun prodotto specifico. Produci DESIGN.md e un handoff di implementazione.',
  },
  'release-notes-one-pager': {
    description:
      'Note di rilascio in una pagina HTML con highlight, Aggiunto, Corretto, Modifiche che rompono la compatibilità,\nProblemi noti e Nota sull\'aggiornamento. Scrive sezioni esplicite in stile "Nessuno"\nogni volta che l\'utente non fornisce dettagli.',
    examplePrompt:
      'Scrivi le note di rilascio per la v2.3.1 con Aggiunto, Corretto, Modifiche che rompono la compatibilità, Problemi noti e una Nota sull\'aggiornamento.',
  },
  'remotion': {
    description:
      'Creazione programmatica di video con React. Utile per explainer con brand, clip per i social, dashboard trasformate in video e motion graphics riproducibili.',
    examplePrompt:
      'Creazione programmatica di video con React.',
  },
  'replicate': {
    description:
      'Scopri, confronta ed esegui modelli AI usando l\'API di Replicate. Ideale per pipeline di generazione di immagini, audio e video che cambiano modello di frequente.',
    examplePrompt:
      'Scopri, confronta ed esegui modelli AI usando l\'API di Replicate.',
  },
  'research-decision-room': {
    description:
      'Trasforma note disordinate di ricerca utente, interviste, ticket di supporto, sondaggi e\ncontesto di prodotto in una sala decisionale supportata da evidenze: un singolo artefatto HTML con\nun registro delle evidenze, una mappa dei temi, una heatmap di confidenza, una matrice delle opportunità, un\nmemo decisionale e una coda di esperimenti. Usalo quando i team devono passare dai\nsegnali qualitativi alle decisioni di prodotto o di design senza fabbricare certezze.',
    examplePrompt:
      'Sintetizza 8 note di intervista, 24 ticket di supporto e le metriche di attivazione recenti in una sala decisionale di ricerca per stabilire se un\'app di project management debba aggiungere una checklist di onboarding o suggerimenti contestuali inline.',
  },
  'resume-modern': {
    description:
      'Curriculum minimale e moderno, singola pagina A4, pronto per la stampa o l\'export in PDF.',
    examplePrompt:
      'Usa il template Modern Resume per trasformare i miei contenuti in un curriculum minimale e moderno su singola pagina A4, pronto per la stampa o l\'export in PDF. Preserva la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'screenshot': {
    description:
      'Cattura il desktop, le finestre delle app o regioni di pixel su diverse piattaforme OS. Utile per screenshot di marketing, revisioni di design e segnalazioni di bug.',
    examplePrompt:
      'Cattura il desktop, le finestre delle app o regioni di pixel su diverse piattaforme OS.',
  },
  'screenshots-marketing': {
    description:
      'Genera screenshot di marketing con Playwright. Utile per hero shot di landing page, screenshot per l\'App Store e visual per changelog.',
    examplePrompt:
      'Genera screenshot di marketing con Playwright.',
  },
  'shadcn-ui': {
    description:
      'Crea componenti UI con shadcn/ui. Si abbina al loop di design Stitch per realizzare rapidamente componenti strutturati e accessibili.',
    examplePrompt:
      'Crea componenti UI con shadcn/ui.',
  },
  'shader-dev': {
    description:
      'Tecniche di shader GLSL per ray marching, simulazione di fluidi, sistemi di particelle e generazione procedurale. Utili per hero visual e fermo immagine in movimento.',
    examplePrompt:
      'Tecniche di shader GLSL per ray marching, simulazione di fluidi, sistemi di particelle e generazione procedurale.',
  },
  'slack-gif-creator': {
    description:
      'Crea GIF animate ottimizzate per Slack con validatori per i vincoli di dimensione e primitive di animazione componibili.',
    examplePrompt:
      'Crea GIF animate ottimizzate per Slack con validatori per i vincoli di dimensione e primitive di animazione componibili.',
  },
  'slides': {
    description:
      'Crea e modifica presentazioni .pptx con PptxGenJS. Utile per deck di vendita, brief di kickoff e showcase di design system.',
    examplePrompt:
      'Crea e modifica presentazioni .pptx con PptxGenJS.',
  },
  'social-reddit-card': {
    description:
      'Card realistica di un post Reddit con barra dei voti e numero di commenti, adatta a overlay video o condivisione di storie.',
    examplePrompt:
      'Usa il template Reddit Post Card per trasformare i miei contenuti in una card realistica di un post Reddit con barra dei voti e numero di commenti per un overlay video o la condivisione di una storia. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'social-spotify-card': {
    description:
      'Card in stile Spotify Now Playing con copertina dell\'album, barra di avanzamento e controlli di riproduzione, adatta a overlay video o homepage personali.',
    examplePrompt:
      'Usa il template Spotify Now-Playing Card per trasformare i miei contenuti in una card in stile Spotify Now Playing con copertina dell\'album, barra di avanzamento e controlli di riproduzione per un overlay video o una homepage personale. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'social-x-post-card': {
    description:
      'Card realistica di un post X con metriche di engagement (like, repost, visualizzazioni), adatta a overlay video o card immagine condivisibili.',
    examplePrompt:
      'Usa il template X / Twitter Post Card per trasformare i miei contenuti in una card realistica di un post X con metriche di engagement per un overlay video o una card immagine condivisibile. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'high-end-visual-design': {
    description:
      'Insegna all\'IA a progettare come un\'agenzia di alto livello. Definisce i font, le spaziature, le ombre, le strutture delle card e le animazioni esatte che fanno percepire un sito come costoso. Blocca tutte le impostazioni predefinite più comuni che fanno apparire i design dell\'IA economici o generici.',
    examplePrompt:
      'Crea una landing page sobria e di alto livello con tipografia raffinata, contrasto morbido, spaziatura premium, profondità sottile e movimento misurato.',
  },
  'sora': {
    description:
      'Genera, remixa e gestisci brevi clip video tramite l\'API Sora di OpenAI. Utile per riprese cinematografiche, b-roll e iterazione rapida di video concept.',
    examplePrompt:
      'Genera, remixa e gestisci brevi clip video tramite l\'API Sora di OpenAI.',
  },
  'speech': {
    description:
      'Genera audio parlato dal testo usando l\'API di OpenAI con voci integrate. Utile per spiegazioni narrate, audio di lezioni e tracce di voiceover rapide.',
    examplePrompt:
      'Genera audio parlato dal testo usando l\'API di OpenAI con voci integrate.',
  },
  'stitch-loop': {
    description:
      'Loop di feedback iterativo dal design al codice. Ciclo critica → modifica → rilascio per affinare la fedeltà visiva tra il brief e l\'UI realizzata.',
    examplePrompt:
      'Loop di feedback iterativo dal design al codice.',
  },
  'stitch-design-taste': {
    description:
      'Skill di Semantic Design System per Google Stitch. Genera file DESIGN.md adatti agli agenti che impongono standard UI premium e anti-generici — tipografia rigorosa, colori calibrati, layout asimmetrici, micro-movimento perpetuo e prestazioni accelerate via hardware.',
    examplePrompt:
      'Genera un file DESIGN.md adatto agli agenti per questo prodotto con standard UI premium e anti-generici, tipografia, colori, layout, movimento e indicazioni sui prompt.',
  },
  'swiftui-design': {
    description:
      'Skill di 前端设计 SwiftUI — regole anti AI-slop, advisor per la direzione di design, protocollo per gli asset di brand e revisione a cinque dimensioni. Funziona con Claude Code, Cursor, Codex e OpenCode.',
    examplePrompt:
      'Skill di 前端设计 SwiftUI — regole anti AI-slop, advisor per la direzione di design, protocollo per gli asset di brand e revisione a cinque dimensioni.',
  },
  'swiss-creative-mode-template': {
    description:
      'Skill di template per presentazioni in modalità creativa di ispirazione svizzera con tipografia editoriale audace,\ncard geometriche ad alto contrasto, navigazione interattiva tra slide,\ncambio di tema, overlay con hotspot e coreografia delle palette in un singolo\nartefatto HTML. Usala quando gli utenti chiedono una landing premium in stile presentazione,\nun look da deck svizzero/brutalista o una pagina di lancio creativa con interazioni ricche.',
    examplePrompt:
      'Skill di template per presentazioni in modalità creativa di ispirazione svizzera con tipografia editoriale audace, card geometriche ad alto contrasto, navigazione interattiva tra slide, cambio di tema, overlay con hotspot e coreografia delle palette in un singolo artefatto HTML.',
  },
  'swiss-user-research-video-template': {
    description:
      'Template narrativo per ricerca utente in stile svizzero con un\'estetica editoriale dai toni caldi della carta.\nUsalo quando gli utenti chiedono un deck di ricerca premium o un artefatto live story-first con\ntipografia minimalista, layout ad alta chiarezza, movimento sottile, grafici a ciambella\ne navigazione tramite tastiera/click tra le slide in un singolo file HTML.',
    examplePrompt:
      'Crea un deck di sintesi di ricerca utente in stile svizzero con tipografia minimalista premium, tono caldo della carta, un grafico a ciambella dei partecipanti e sottili interazioni editoriali.',
  },
  'design-taste-frontend': {
    description:
      'Skill frontend anti-slop per landing page, portfolio e redesign. L\'agente legge il brief, deduce la giusta direzione di design e realizza interfacce che non sembrano basate su template. Design system reali quando applicabili, audit-first nei redesign, controllo pre-flight rigoroso.',
    examplePrompt:
      'Crea una landing page premium che segue design-taste-frontend: deduci la lettura del design, imposta i parametri, evita i pattern AI-slop e produci un artefatto HTML responsive e curato.',
  },
  'design-taste-frontend-v1': {
    description:
      'La skill di taste originale v1, conservata per i progetti che dipendono dal suo comportamento esatto. L\'impostazione predefinita attuale è `design-taste-frontend` (v2 sperimentale), che è una riscrittura sostanziale. Usa questo nome di installazione v1 solo se hai bisogno di una compatibilità retroattiva esatta.',
    examplePrompt:
      'Crea una pagina di marketing curata usando design-taste-frontend-v1 con tipografia, spaziatura e movimento incisivi e guardrail anti-slop.',
  },
  'theme-factory': {
    description:
      'Applica temi professionali di font e colori agli artefatti, inclusi slide, documenti, report e landing page HTML. Include 10 temi preimpostati.',
    examplePrompt:
      'Applica temi professionali di font e colori agli artefatti, inclusi slide, documenti, report e landing page HTML.',
  },
  'threejs': {
    description:
      'Skill di Three.js per creare elementi 3D ed esperienze interattive nel browser — scene, materiali, controlli e post-processing.',
    examplePrompt:
      'Skill di Three.js per creare elementi 3D ed esperienze interattive nel browser — scene, materiali, controlli e post-processing.',
  },
  'ui-skills': {
    description:
      'Vincoli opinionati ed evolutivi per guidare gli agenti nella costruzione di interfacce. Utili per mantenere coerente l\'output tra molti piccoli elementi di UI.',
    examplePrompt:
      'Vincoli opinionati ed evolutivi per guidare gli agenti nella costruzione di interfacce.',
  },
  'ui-ux-pro-max': {
    description:
      'Voce UI/UX Pro Max solo a catalogo. I template upstream completi, i dati e il flusso di ricerca non sono inclusi in Open Design.',
    examplePrompt:
      'Voce UI/UX Pro Max solo a catalogo.',
  },
  'venice-audio-music': {
    description:
      'Endpoint di accodamento, recupero e completamento per la generazione musicale tramite Venice.ai. Adatto a jingle, loop di sottofondo e colonne sonore prototipo.',
    examplePrompt:
      'Endpoint di accodamento, recupero e completamento per la generazione musicale tramite Venice.ai.',
  },
  'venice-audio-speech': {
    description:
      'Modelli text-to-speech, voci, formati e streaming tramite Venice.ai. Utile per narrazione, voiceover e voci di agenti conversazionali.',
    examplePrompt:
      'Modelli text-to-speech, voci, formati e streaming tramite Venice.ai.',
  },
  'venice-image-edit': {
    description:
      'Modifica delle immagini, upscaling e rimozione dello sfondo tramite l\'API di Venice.ai.',
    examplePrompt:
      'Modifica delle immagini, upscaling e rimozione dello sfondo tramite l\'API di Venice.ai.',
  },
  'venice-image-generate': {
    description:
      'Endpoint per la generazione di immagini e stili disponibili tramite l\'API di Venice.ai.',
    examplePrompt:
      'Endpoint per la generazione di immagini e stili disponibili tramite l\'API di Venice.ai.',
  },
  'venice-video': {
    description:
      'Flussi di lavoro per la generazione e la trascrizione di video tramite l\'API di Venice.ai.',
    examplePrompt:
      'Flussi di lavoro per la generazione e la trascrizione di video tramite l\'API di Venice.ai.',
  },
  'vfx-text-cursor': {
    description:
      'Scia luminosa del cursore, raggi cromatici e bagliori direzionali per rivelazioni di citazioni parola per parola nelle intro video.',
    examplePrompt:
      'Usa il template VFX Text Cursor per trasformare i miei contenuti in una rivelazione di citazione per intro video con scie luminose del cursore, raggi cromatici e bagliori direzionali. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'video-downloader': {
    description:
      'Scarica video da YouTube e altre piattaforme per la visione offline, il montaggio o l\'archiviazione, con supporto per vari formati e opzioni di qualità.',
    examplePrompt:
      'Scarica video da YouTube e altre piattaforme per la visione offline, il montaggio o l\'archiviazione, con supporto per vari formati e opzioni di qualità.',
  },
  'video-hyperframes': {
    description:
      'Animazione a frame continui compatibile con Hyperframes / Remotion con supporto per la riproduzione automatica.',
    examplePrompt:
      'Usa il template Hyperframes Video per trasformare i miei contenuti in un\'animazione a frame continui compatibile con Hyperframes / Remotion con supporto per la riproduzione automatica. Mantieni la firma visiva del template, usa contenuti e dati reali ed evita lorem ipsum o immagini segnaposto.',
  },
  'web-artifacts-builder': {
    description:
      'Crea artefatti HTML complessi per claude.ai con React e Tailwind. Il flusso di lavoro di riferimento di Anthropic per distribuire artefatti ricchi e incorporabili.',
    examplePrompt:
      'Crea artefatti HTML complessi per claude.ai con React e Tailwind.',
  },
  'web-design-guidelines': {
    description:
      'Linee guida e standard di web design del team di ingegneria di Vercel. Copre layout, tipografia, colore, movimento e accessibilità per le UI di prodotto.',
    examplePrompt:
      'Linee guida e standard di web design del team di ingegneria di Vercel.',
  },
  'weread-year-in-review-video-template': {
    description:
      'Template video HyperFrames ispirato a WeRead per report di lettura annuali verticali,\ndashboard di lettura personali, riepiloghi di note sui libri e storie di year-in-review\ncondivisibili. Da usare quando gli utenti vogliono un report di lettura HTML-to-MP4 in 9:16 con calda\ntexture di carta, tipografia editoriale cinese, metafore delle pagine dei libri, dati in evidenza\ne movimento deterministico.',
    examplePrompt:
      'Crea un video di report di lettura annuale HyperFrames in stile WeRead in 9:16 con 12 scene, calda texture di carta, transizioni tra pagine di libro, statistiche di lettura, note, parole chiave e una scheda finale del profilo di lettore.',
  },
  'wpds': {
    description:
      'Design System di WordPress. Applica i design token ufficiali, la tipografia e i pattern dei componenti di WordPress a temi e siti.',
    examplePrompt:
      'Design System di WordPress.',
  },
  'youtube-clipper': {
    description:
      'Generazione e montaggio di clip da YouTube con flussi di lavoro automatizzati: importa il video sorgente, ritaglia i momenti salienti, aggiungi i sottotitoli ed esporta.',
    examplePrompt:
      'Generazione e montaggio di clip da YouTube con flussi di lavoro automatizzati: importa il video sorgente, ritaglia i momenti salienti, aggiungi i sottotitoli ed esporta.',
  },
};

export const IT_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Interfaccia AI-first conversazionale con controlli minimi, risultati chiari e flussi di attività delegati per i flussi di lavoro agentici.',
  'airbnb': 'Marketplace di viaggi. Caldo accento corallo, guidato dalla fotografia, UI arrotondata.',
  'airtable': 'Ibrido foglio di calcolo-database. Estetica dei dati colorata, amichevole e strutturata.',
  'ant': 'Design system strutturato e orientato all\'enterprise che enfatizza chiarezza, coerenza ed efficienza per applicazioni web ad alta densità di dati.',
  'apple': 'Elettronica di consumo. Spazi bianchi premium, SF Pro, immagini cinematografiche.',
  'application': 'Dashboard applicativa con estetica a tema viola, navigazione nella barra superiore, layout basati su card e flussi di lavoro developer-first.',
  'arc': '"Il browser che naviga al posto tuo." Superfici traslucide, calore dei gradienti, layout sidebar-first.',
  'artistic': 'Stile espressivo ad alto contrasto con tipografia creativa e scelte cromatiche audaci per interfacce di forte impatto visivo.',
  'atelier-zero': 'Un sistema visivo di livello editoriale, guidato dal collage: tela di carta calda, immagini surreali\ndi gesso e architettura, caratteri display sovradimensionati, linee sottilissime,\nmarcatori di sezione in numeri romani e minuscole annotazioni editoriali.\nIspirato alla produzione v',
  'bento': 'Layout a griglia modulare con blocchi simili a card, gerarchia chiara, spaziatura morbida e contrasto visivo sottile per interfacce ordinate e facili da scorrere.',
  'binance': 'Exchange di criptovalute. Audace accento giallo su monocromia, l\'urgenza della sala di trading.',
  'bmw': 'Automotive di lusso. Superfici premium scure, estetica dell\'ingegneria tedesca di precisione.',
  'bmw-m': 'Sotto-marchio per le performance da competizione. Superfici cockpit quasi nere, accenti tricolore BMW M, geometria ingegneristica netta.',
  'bold': 'Forte presenza visiva con tipografia di grande peso, colori ad alto contrasto e layout di carattere autorevole.',
  'brutalism': 'Estetica grezza e anti-design ispirata all\'architettura in cemento, con elementi spogli, layout stridenti e minimalismo funzionale.',
  'bugatti': 'Marchio di hypercar. Tela nero cinema, austerità monocromatica, tipografia display monumentale.',
  'cafe': 'Interfaccia ispirata a un caffè accogliente, con tonalità calde, tipografia morbida e layout puliti per un\'esperienza di navigazione rilassata.',
  'cal': 'Pianificazione open-source. UI neutra e pulita, semplicità orientata agli sviluppatori.',
  'canva': 'Piattaforma di creazione visiva. Vivido gradiente viola-blu, spaziatura generosa, geometria amichevole.',
  'cisco': 'Marchio di infrastrutture enterprise. Superfici scure che ispirano fiducia, segnale Cisco Blue, chiarezza tecnica.',
  'claude': 'L\'assistente AI di Anthropic. Caldo accento terracotta, layout editoriale pulito.',
  'clay': 'Agenzia creativa. Forme organiche, gradienti morbidi, layout con direzione artistica.',
  'claymorphism': 'Forme morbide e arrotondate, simili a 3D, che imitano l\'argilla malleabile con elementi giocosi e gonfi e superfici colorate.',
  'clean': 'Design incentrato sulla semplicità, con ampio spazio bianco, tipografia leggibile e una palette di colori limitata per ridurre il disordine visivo.',
  'clickhouse': 'Database analitico veloce. Stile di documentazione tecnica con accenti gialli.',
  'cohere': 'Piattaforma AI enterprise. Gradienti vivaci, estetica da dashboard ricca di dati.',
  'coinbase': 'Exchange di criptovalute. Identità blu pulita, incentrata sulla fiducia, dal carattere istituzionale.',
  'colorful': 'Palette e gradienti vivaci e ad alto contrasto per esperienze utente coinvolgenti, memorabili e moderne.',
  'composio': 'Piattaforma di integrazione di strumenti. Dark moderno con icone di integrazione colorate.',
  'contemporary': 'Design minimalista contemporaneo con griglie bento, supporto alla modalità dark e layout accessibili ad alte prestazioni.',
  'corporate': 'Design professionale e allineato al brand, con griglie strutturate, layout minimalisti e pattern enterprise coerenti.',
  'cosmic': 'Estetica sci-fi futuristica con temi scuri, vivaci accenti al neon ed elementi spaziali immersivi.',
  'creative': 'Design giocoso e guidato dai personaggi, con tipografia espressiva e grafiche audaci per landing page e progetti creativi.',
  'cursor': 'Editor di codice AI-first. Interfaccia dark elegante, accenti a gradiente.',
  'dashboard': 'Estetica da cloud-platform a tema scuro, con griglie modulari, pannelli simili al vetro e una forte gerarchia dei dati per dashboard di produttività.',
  'default': 'Un default pulito e orientato al prodotto per strumenti B2B, dashboard e pagine di utilità.',
  'discord': 'Piattaforma voce / chat. Blu-viola profondo, superfici dark-first, momenti d\'accento giocosi.',
  'dithered': 'Tecnica di rendering a pattern di punti che simula le sfumature con una palette limitata, per visual nostalgici, retro e ad alto contrasto.',
  'doodle': 'Stile disegnato a mano, simile a uno schizzo, con scarabocchi, font scritti a mano e linee imperfette per un\'atmosfera giocosa e informale.',
  'dramatic': 'Design teatrale ad alto contrasto, con layout audaci, visual immersivi e composizioni non convenzionali che catturano l\'attenzione.',
  'duolingo': 'Piattaforma per l\'apprendimento delle lingue. Verde gufo brillante, ombre marcate, gioia in chiave gamificata.',
  'editorial': 'Layout editoriale ispirato alle riviste, con raffinata tipografia serif, griglie strutturate ed eleganti esperienze di lettura.',
  'elegant': 'Estetica aggraziata e raffinata, con tipografia delicata, palette minimali e layout curati che trasmettono sofisticatezza.',
  'elevenlabs': 'Piattaforma vocale AI. UI cinematografica scura, estetica delle forme d\'onda audio.',
  'energetic': 'Stile dinamico e vivace, con bordi spessi, forme geometriche, colori ad alto contrasto e tipografia espressiva che trasmette movimento e vitalità.',
  'enterprise': 'Design enterprise pulito e ad alto contrasto per flussi di lavoro guidati dai dati, con intuitivi pattern di drag-and-drop e layout strutturati.',
  'expo': 'Piattaforma React Native. Tema scuro, spaziatura ridotta tra le lettere, incentrata sul codice.',
  'expressive': 'Design vivace e ricco di personalità, con colori audaci, grafiche giocose e layout dinamici che bilanciano creatività e struttura.',
  'fantasy': 'Estetica fantasy ispirata ai videogiochi, con visual audaci e premium, palette di colori ricche ed elementi tematici immersivi.',
  'ferrari': 'Automotive di lusso. Editoriale in chiaroscuro, accenti Ferrari Red, nero cinematografico.',
  'figma': 'Strumento di design collaborativo. Multicolore vivace, giocoso ma professionale.',
  'flat': 'Stile minimalista bidimensionale con colori vivaci, tipografia pulita e nessun effetto 3D per interfacce rapide e intuitive.',
  'framer': 'Website builder. Nero e blu audaci, movimento al primo posto, orientato al design.',
  'friendly': 'Design accessibile e intuitivo con elementi arrotondati, ampio spazio bianco e palette di colori pastello tenui.',
  'futuristic': 'Design proiettato al futuro con tipografia di ispirazione tech, layout moderni ed un\'estetica elegante e guidata dall\'innovazione.',
  'github': 'Piattaforma orientata al codice. Densità funzionale, precisione blu su bianco, fondamenta Primer.',
  'glassmorphism': 'Effetto vetro smerigliato con strati traslucidi, sfocatura sottile e bordi luminosi per profondità ed eleganza moderna.',
  'gradient': 'Transizioni di colore fluide e superfici ricche di gradienti per interfacce moderne e giocose con profondità visiva.',
  'hashicorp': 'Automazione dell\'infrastruttura. Pulizia enterprise, bianco e nero.',
  'hud': 'Head-up display di jet da combattimento / elicottero. Verde fosforo su quasi-nero, sovrapposizioni di dati in maiuscolo, geometria angolare. Zero ambiguità ad alta velocità e quota.',
  'huggingface': 'Hub della community ML. Accento giallo solare, identità monospace, allegro e denso.',
  'ibm': 'Tecnologia enterprise. Carbon design system, palette blu strutturata.',
  'intercom': 'Messaggistica clienti. Palette blu amichevole, pattern di UI conversazionale.',
  'kami': 'Sistema editoriale cartaceo: tela in pergamena calda, accento blu inchiostro, gerarchia guidata dai serif. Pensato per curriculum, one-pager, white paper, portfolio, presentazioni — tutto ciò che deve dare la sensazione di una stampa di alta qualità anziché di una UI. Multilingue per de',
  'kraken': 'Trading di criptovalute. UI scura con accenti viola, dashboard ricche di dati.',
  'lamborghini': 'Brand di supercar. Superfici nero assoluto, accenti oro, tipografia maiuscola d\'impatto.',
  'levels': 'Design orientato alla conversione che elimina gli attriti e guida gli utenti verso l\'azione attraverso chiarezza, fiducia e velocità.',
  'linear-app': 'Gestione progetti. Ultra-minimale, preciso, accento viola.',
  'lingo': 'Design giocoso e minimale con colori brillanti, forme arrotondate, bordi 3D tattili e illustrazioni amichevoli per interfacce accessibili.',
  'loom': 'Video asincroni Loom. Viola primario, superfici amichevoli, layout incentrato sul video. Pulito e professionale senza essere aziendale.',
  'lovable': 'Builder full-stack con AI. Gradienti giocosi, estetica dev amichevole.',
  'luxury': 'Estetica scura di alta gamma con titoli audaci, palette monocromatica e sensazione premium per esperienze di brand di lusso.',
  'mastercard': 'Rete di pagamenti globale. Tela crema calda, forme a pillola orbitali, calore editoriale.',
  'material': 'Material Design di Google con superfici a strati, theming dinamico, movimento integrato e pattern responsive cross-platform.',
  'meta': 'Negozio di tecnologia retail. Fotografia al primo posto, superfici binarie chiaro/scuro, CTA in Meta Blue.',
  'minimal': 'Design essenziale che enfatizza lo spazio bianco, una tipografia pulita e un uso contenuto del colore per la massima chiarezza e concentrazione.',
  'minimax': 'Fornitore di modelli AI. Interfaccia scura e audace con accenti neon.',
  'mintlify': 'Piattaforma di documentazione. Pulita, con accenti verdi, ottimizzata per la lettura.',
  'miro': 'Collaborazione visiva. Accento giallo brillante, estetica a tela infinita.',
  'mission-control': 'Monitoraggio di missioni spaziali/aerospaziali. Centro di comando scuro, telemetria ambra, precisione monospace. Chiarezza funzionale prima di ogni altra cosa.',
  'mistral-ai': 'Fornitore di LLM open-weight. Minimalismo di ingegneria francese, tonalità viola.',
  'modern': 'Stile editoriale contemporaneo con tipografia serif, palette minimali e layout puliti per prodotti digitali raffinati.',
  'mongodb': 'Database documentale. Branding a foglia verde, focus sulla documentazione per sviluppatori.',
  'mono': 'Design guidato dal monospace e ispirato a Matrix con elementi ad alto contrasto, densità compatta e un\'estetica hacker-chic.',
  'neobrutalism': 'Reinterpretazione moderna del brutalismo con bordi audaci, colori d\'accento vividi e layout grezzi ad alto contrasto su superfici calde.',
  'neon': 'Effetti di bagliore neon elettrico con abbinamenti di colore ad alto contrasto per interfacce audaci e accattivanti.',
  'neumorphism': 'Elementi UI morbidi ed estrusi con ombre interne ed esterne su superfici monocromatiche per un aspetto tattile e incassato.',
  'nike': 'Retail sportivo. UI monocromatica, caratteri maiuscoli enormi, fotografia a tutta pagina.',
  'notion': 'Workspace all-in-one. Minimalismo caldo, titoli serif, superfici morbide.',
  'nvidia': 'Computing su GPU. Energia verde-nero, estetica di potenza tecnica.',
  'ollama': 'Esegui LLM in locale. Terminal-first, semplicità monocromatica.',
  'openai': 'Sistema sobrio e quasi monocromatico ancorato a un teal-nero profondo, con ampi spazi bianchi e tipografia editoriale.',
  'opencode-ai': 'Piattaforma di coding AI. Tema scuro pensato per gli sviluppatori.',
  'pacman': 'Design ispirato alle sale giochi retrò con font pixel, bordi punteggiati, colori giocosi ad alto contrasto ed estetica dei giochi a 8 bit.',
  'paper': 'Design dalla texture cartacea, ispirato alla stampa, con colori essenziali, tipografia pulita serif/sans e qualità tattili delle superfici.',
  'perplexity': 'Motore di ricerca AI conversazionale. Tela profondamente scura, tipografia netta, singolo accento viola, gerarchia delle informazioni densa.',
  'perspective': 'Design con profondità spaziale, viste isometriche, punti di fuga ed elementi stratificati che guidano l\'attenzione attraverso un realismo simile al 3D.',
  'pinterest': 'Scoperta visiva. Accento rosso, griglia a mattoncini, image-first.',
  'playstation': 'Vendita al dettaglio di console da gioco. Layout a canale su tre superfici, display type dall\'autorità discreta, scala in hover ciano.',
  'posthog': 'Analisi di prodotto. Branding giocoso con riccio, UI scura pensata per gli sviluppatori.',
  'premium': 'Estetica premium ispirata ad Apple con spaziature precise, tipografia moderna e un linguaggio visivo raffinato e curato.',
  'professional': 'Design curato e pronto per il business con tipografia moderna, layout strutturati e un\'identità visiva affidabile.',
  'publication': 'Linguaggio visivo ispirato alla stampa per libri, riviste e report, con griglie editoriali e tipografia espressiva.',
  'raycast': 'Launcher per la produttività. Chrome scuro ed elegante, accenti gradiente vivaci.',
  'refined': 'Stile minimal moderno e accuratamente selezionato, con elegante tipografia serif e palette sobrie e sofisticate.',
  'renault': 'Automotive francese. Gradienti aurora vivaci, tipografia NouvelR, energia decisa.',
  'replicate': 'Esegui modelli ML tramite API. Tela bianca pulita, orientata al codice.',
  'resend': 'API per email. Tema scuro essenziale, accenti monospace.',
  'retro': 'Design nostalgico con tipografia vintage, palette retrò ad alto contrasto ed elementi visivi che richiamano il passato.',
  'revolut': 'Banking digitale. Interfaccia scura ed elegante, carte sfumate, precisione fintech.',
  'runwayml': 'Generazione video AI. UI scura cinematografica, layout ricco di media.',
  'sanity': 'CMS headless. Accento rosso, layout editoriale content-first.',
  'sentry': 'Monitoraggio degli errori. Dashboard scura, densa di dati, accento rosa-viola.',
  'shadcn': 'Design ispirato a Shadcn/ui con componenti minimali e puliti, palette monocromatica e pattern utility-first.',
  'shopify': 'Piattaforma e-commerce. Cinematografica dark-first, accento verde neon, tipografia ultra-light.',
  'simple': 'Design diretto e senza fronzoli con tipografia pulita, colori neutri e layout intuitivi che restano in secondo piano.',
  'skeumorphism': 'Mimesi del mondo reale con superfici materiche, effetti 3D e metafore fisiche familiari per interfacce digitali intuitive.',
  'slack': 'Piattaforma di comunicazione sul lavoro. Melanzana come colore primario, palette del logo multi-accento, superfici chiare con sidebar scura, calda e accogliente.',
  'sleek': 'Estetica minimalista moderna con linee pulite, palette di colori intenzionale, interazioni sottili e spaziature coerenti.',
  'spacex': 'Tecnologia spaziale. Bianco e nero netti, immagini a tutto campo, futuristica.',
  'spacious': 'Ampi spazi bianchi, padding coerente e layout su griglia per interfacce pulite, leggibili e ariose.',
  'spotify': 'Streaming musicale. Verde vivace su scuro, tipografia decisa, guidata dalle copertine degli album.',
  'starbucks': 'Marchio globale di caffè al dettaglio. Sistema di verdi a quattro livelli, tela crema calda, pulsanti a pillola intera.',
  'storytelling': 'Design narrativo che usa elementi visivi, testi e interazione per guidare gli utenti attraverso percorsi coinvolgenti ed emotivamente risonanti.',
  'stripe': 'Infrastruttura di pagamento. Gradienti viola distintivi, eleganza weight-300.',
  'supabase': 'Alternativa open-source a Firebase. Tema smeraldo scuro, code-first.',
  'superhuman': 'Client email veloce. UI scura premium, keyboard-first, bagliore viola.',
  'tesla': 'Automotive elettrico. Sottrazione radicale, fotografia a tutto viewport, UI quasi inesistente.',
  'tetris': 'Design ispirato al classico gioco a blocchi con colori giocosi, font display decisi e layout compatti ed energici.',
  'theverge': 'Media editoriale tech. Accenti verde acido e ultravioletto, display Manuka, tessere narrative in stile volantino rave.',
  'together-ai': 'Infrastruttura AI open-source. Design tecnico, in stile blueprint.',
  'totality-festival': 'Un sistema cosmico-premium e glassmorfico in dark mode che cattura lo stupore viscerale di un\'eclissi solare — superfici di ossidiana, riflessi "corona" ambrati e accenti atmosferici ciano.',
  'trading-terminal': 'Terminale di trading finanziario in stile Bloomberg. Solo dark, denso di dati, segnali di acquisto/vendita ciano/corallo. Tutto leggibile a colpo d\'occhio da due metri di distanza.',
  'uber': 'Piattaforma di mobilità. Bianco e nero deciso, tipografia compatta, energia urbana.',
  'urdu': 'Esperienze digitali urdu-first con supporto RTL nativo, tipografia Nastaliq e armonia bilingue.',
  'vercel': 'Deployment frontend. Precisione in bianco e nero, font Geist.',
  'vibrant': 'Design vivace e colorato con tipografia audace e giocosa, accenti caldi ed energia visiva dinamica.',
  'vintage': 'Nostalgia anni \'50-\'90 con tocchi scheuomorfici, texture granulose, palette di colori retrò e tipografia in stile pixel.',
  'vodafone': 'Brand globale delle telecomunicazioni. Display monumentale in maiuscolo, fasce di sezione in Vodafone Red.',
  'voltagent': 'Framework per agenti AI. Canvas nero-vuoto, accento smeraldo, terminal-native.',
  'warm-editorial': 'Un\'estetica da rivista guidata dai serif. Accento terracotta su carta avorio calda —\nideale per long-form, contenuti editoriali e pagine di marketing brand-led.',
  'warp': 'Terminale moderno. Interfaccia scura simile a un IDE, UI dei comandi basata su blocchi.',
  'webex': 'Piattaforma di collaborazione. Tipografia Momentum, sistema di azioni in blu, spettro di accenti multi-utente.',
  'webflow': 'Visual web builder. Estetica da sito di marketing curata, con accenti blu.',
  'wechat': 'Linguaggio visivo del brand per Mini Programmi WeChat, account ufficiali ed estensioni dell\'ecosistema aperto.',
  'wired': 'Rivista tech. Densità da broadsheet bianco carta, display serif personalizzato, kicker mono, link blu inchiostro.',
  'wise': 'Trasferimento di denaro. Accento verde brillante, amichevole e chiaro.',
  'x-ai': 'Il laboratorio AI di Elon Musk. Monocromia essenziale, minimalismo futuristico.',
  'xiaohongshu': 'Piattaforma social di UGC lifestyle. Rosso del brand unico, raggi generosi, content-first.',
  'zapier': 'Piattaforma di automazione. Arancione caldo, amichevole e guidata dalle illustrazioni.',
};

export const IT_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'AI & LLM',
  'Automotive': 'Automotive',
  'Backend & Data': 'Backend & Dati',
  'Bold & Expressive': 'Audace & Espressivo',
  'Creative & Artistic': 'Creativo & Artistico',
  'Design & Creative': 'Design & Creatività',
  'Developer Tools': 'Strumenti per Sviluppatori',
  'E-Commerce & Retail': 'E-Commerce & Retail',
  'Editorial & Print': 'Editoriale & Stampa',
  'Editorial / Personal / Publication': 'Editoriale / Personale / Pubblicazione',
  'Editorial · Studio': 'Editoriale · Studio',
  'Fintech & Crypto': 'Fintech & Crypto',
  'Layout & Structure': 'Layout & Struttura',
  'Media & Consumer': 'Media & Consumer',
  'Modern & Minimal': 'Moderno & Minimal',
  'Morphism & Effects': 'Morfismo & Effetti',
  'Productivity & SaaS': 'Produttività & SaaS',
  'Professional & Corporate': 'Professionale & Corporate',
  'Retro & Nostalgic': 'Retrò & Nostalgico',
  'Social & Messaging': 'Social & Messaggistica',
  'Starter': 'Per iniziare',
  'Themed & Unique': 'A tema e unici',
};

export const IT_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Pubblicità',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'Design di app / web',
  'Branding': 'Branding',
  'Cinematic': 'Cinematografico',
  'Data': 'Dati',
  'Game UI': 'UI di gioco',
  'General': 'Generale',
  'Illustration': 'Illustrazione',
  'Infographic': 'Infografica',
  'Live Artifact': 'Artifact live',
  'Marketing': 'Marketing',
  'Motion Graphics': 'Motion graphics',
  'Product': 'Prodotto',
  'Profile / Avatar': 'Profilo / Avatar',
  'Short Form': 'Formato breve',
  'Social / Meme': 'Social / Meme',
  'Social Media Post': 'Post sui social media',
  'Travel': 'Viaggi',
  'VFX / Fantasy': 'VFX / Fantasy',
  'VFX / HTML-in-Canvas': 'VFX / HTML-in-Canvas',
};

export const IT_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': 'render-3d',
  'action': 'azione',
  'ancient-china': 'cina-antica',
  'anime': 'anime',
  'app-showcase': 'vetrina-app',
  'archery': 'tiro-con-larco',
  'arpg': 'arpg',
  'audio-reactive': 'audio-reattivo',
  'boss-fight': 'boss-fight',
  'brand': 'brand',
  'branding': 'branding',
  'captions': 'sottotitoli',
  'cavalry': 'cavalleria',
  'chart': 'grafico',
  'childlike': 'infantile',
  'choreography': 'coreografia',
  'cinematic': 'cinematografico',
  'cinematic-romance': 'romanticismo-cinematografico',
  'combat': 'combattimento',
  'combo': 'combo',
  'companion-to-image': 'companion-immagine',
  'counter': 'contatore',
  'crayon': 'pastello',
  'cyberpunk': 'cyberpunk',
  'dance': 'danza',
  'dashboard': 'dashboard',
  'data': 'dati',
  'data-viz': 'visualizzazione-dati',
  'destruction': 'distruzione',
  'displacement': 'displacement',
  'editorial': 'editoriale',
  'elden-ring': 'elden-ring',
  'endcard': 'endcard',
  'escort': 'scorta',
  'escort-mission': 'missione-scorta',
  'fantasy': 'fantasy',
  'fashion': 'moda',
  'fighting-game': 'picchiaduro',
  'food': 'cibo',
  'game-cinematic': 'cinematica-di-gioco',
  'game-ui': 'interfaccia-di-gioco',
  'grid-sheet': 'foglio-griglia',
  'guanyu': 'guanyu',
  'hand-drawn': 'disegnato-a-mano',
  'hero': 'hero',
  'html-in-canvas': 'html-in-canvas',
  'hud': 'hud',
  'hud-safe': 'hud-safe',
  'hype': 'hype',
  'hyperframes': 'hyperframes',
  'idol': 'idol',
  'illustration': 'illustrazione',
  'image-to-image': 'image-to-image',
  'infographic': 'infografica',
  'iphone': 'iphone',
  'japanese': 'giapponese',
  'karaoke': 'karaoke',
  'key-visual': 'key visual',
  'keynote': 'keynote',
  'kinetic-typography': 'tipografia cinetica',
  'linear-style': 'stile Linear',
  'liquid': 'liquido',
  'liquid-glass': 'vetro liquido',
  'live-artifact': 'artefatto live',
  'logo': 'logo',
  'lyubu': 'lyubu',
  'macbook': 'macbook',
  'magnetic': 'magnetico',
  'map': 'mappa',
  'marketing': 'marketing',
  'minimal': 'minimal',
  'mmo': 'mmo',
  'mobile': 'mobile',
  'money': 'denaro',
  'mounted-combat': 'combattimento a cavallo',
  'nature': 'natura',
  'open-world': 'mondo aperto',
  'otaku-dance': 'danza otaku',
  'outro': 'outro',
  'overlay': 'overlay',
  'particles': 'particelle',
  'pipeline': 'pipeline',
  'portal': 'portale',
  'portrait': 'ritratto',
  'pose-reference': 'riferimento di posa',
  'product': 'prodotto',
  'product-demo': 'demo del prodotto',
  'product-promo': 'promo del prodotto',
  'rework': 'rielaborazione',
  'route': 'percorso',
  'saas': 'saas',
  'sequence': 'sequenza',
  'shader': 'shader',
  'shatter': 'frantumazione',
  'sizzle': 'sizzle',
  'social': 'social',
  'storyboard': 'storyboard',
  'street-fighter': 'street-fighter',
  'style-transfer': 'style-transfer',
  'tekken': 'tekken',
  'text': 'testo',
  'three-kingdoms': 'tre-regni',
  'tiktok': 'tiktok',
  'title-card': 'title-card',
  'transform': 'trasforma',
  'travel': 'viaggi',
  'tts': 'tts',
  'typography': 'tipografia',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'verticale',
  'video-reference': 'video-reference',
  'vs-screen': 'vs-screen',
  'webgl': 'webgl',
  'website-to-video': 'website-to-video',
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const IT_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: 'Infografica 3D dell\'Evoluzione su Scala di Pietra',
    summary:
      'Trasforma una piatta linea temporale evolutiva in un\'infografica realistica 3D a forma di scala di pietra, con rendering dettagliati degli organismi e pannelli laterali strutturati.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Illustrazione di Battaglia di Arti Marziali in Stile Anime',
    summary:
      'Genera un\'illustrazione anime dinamica e di forte impatto di due personaggi femminili che combattono in un dojo tradizionale con effetti di energia elementale.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'Mockup dell\'Interfaccia Live Stream per E-commerce',
    summary:
      'Genera un\'interfaccia realistica di live stream per social media sovrapposta a un ritratto, con messaggi di chat personalizzabili, popup di regali e una scheda di acquisto del prodotto.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Screenshot di Gioco - Picchiaduro Anime: Capitano Ryuuga vs Kaze Renshin',
    summary:
      'Una key visual / screenshot di combattimento in-game di un picchiaduro nello stile dell\'arte introduttiva di Street Fighter 6 o Tekken 8. Due guerrieri maschili in stile anime si affrontano al centro di un drammatico cortile di un tempio cinese notturno: a sinistra un pirata a torso nudo con cappello di paglia avvolto da una calda aura di fuoco arancione-rossa, e a destra un artista marziale dai capelli a punta in un gi arancione che carica un\'enorme sfera crepitante di energia di fulmine blu. Include un HUD completo da picchiaduro (doppie barre della salute, timer del round, pannelli ritratto P1/P2 con lottatori nominati ed emblemi, contatori di combo e gauge massimi per ogni lato). La gradazione cromatica divisa arancione caldo vs blu freddo rispetta la convenzione dei lottatori rivali del genere. Ottimizzato per gpt-image-2 in 16:9.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Screenshot di Gioco - ARPG dei Tre Regni: Guan Yu Uccide Yan Liang',
    summary:
      'Uno screenshot di un action-RPG in-game dell\'iconica scena dei Tre Regni in cui Guan Yu cavalca il suo destriero da guerra Lepre Rossa attraverso un campo di battaglia sotto una pioggia torrenziale e carica contro il generale nemico Yan Liang. Reso nello stile cinematografico fotorealistico di Black Myth: Wukong, Unreal Engine 5, telecamera di inseguimento in terza persona da dietro e a sinistra dell\'eroe a cavallo. Un HUD completo da boss-fight (ritratto, minimappa con fitti punti nemici, barra delle abilità con prompt di mossa finale, barra HP fluttuante del boss sul generale nemico) trasforma la scena in un momento di combattimento ARPG AAA. Ottimizzato per gpt-image-2 in 16:9.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Screenshot di Gioco - ARPG dei Tre Regni: il Tiro con l\'Arco di Lü Bu allo Yuanmen',
    summary:
      'Uno screenshot di un action-RPG in-game della celebre scena dei Tre Regni in cui Lü Bu abbatte con una freccia una lontana alabarda alla porta dell\'accampamento per fermare una battaglia. Reso nello stile cinematografico fotorealistico di Black Myth: Wukong, Unreal Engine 5 Nanite/Lumen, telecamera di gameplay in terza persona sopra la spalla. Un overlay HUD in-game completo (barre HP + qi, minimappa, barra delle abilità, indicatore di lock-on del bersaglio con lettura della distanza dalla lontana alabarda) lo fa apparire come una vera acquisizione ARPG di nuova generazione anziché una cutscene. Ottimizzato per gpt-image-2 in 16:9.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Screenshot di Gioco - ARPG dei Tre Regni: la Fuga con il Neonato di Zhao Yun a Changbanpo',
    summary:
      'Uno screenshot di un action-RPG in-game della leggendaria scena dei Tre Regni in cui Zhao Yun culla il neonato Liu Chan con un braccio e si fa strada combattendo tra le linee nemiche con una lancia nell\'altro a Changbanpo. Reso nello stile cinematografico fotorealistico di Black Myth: Wukong combinato con Elden Ring, Unreal Engine 5 con pieno Nanite, ray-tracing Lumen e raggi di luce volumetrici. Il nucleo emotivo - un braccio che protegge il bambino fasciato, un braccio che lotta per la vita - è rafforzato da un overlay HUD completo che include una barra di protezione ESCORT dedicata per il neonato, un contatore di combo e popup di numeri di danno a mezz\'aria sui nemici scagliati. Ottimizzato per gpt-image-2 in 16:9.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'UI di Gioco - HUD di un MMO Open-World dell\'Antica Cina',
    summary:
      'Genera un mockup di screenshot HUD in-game per un MMO open-world AAA ambientato nell\'antica Cina, nello stile cinematografico fotorealistico di Black Myth: Wukong. Una bellissima spadaccina protagonista ancora il centro dell\'inquadratura in una scena di antico santuario montano avvolto dalla nebbia, circondata da un HUD MMO completo: in alto a sinistra ritratto del personaggio con barre HP/MP/stamina e icone di buff, al centro in basso barra delle abilità con icone in calligrafia cinese, in alto a destra minimappa con marcatori di missione, sulla destra pannello tracker delle missioni, in basso a sinistra finestra di chat scorrevole, targhette fluttuanti degli NPC nello spazio di gioco e punto esclamativo di missione. Reso come uno screenshot realistico da monitor, 16:9, adatto a pitch deck, key art in stile gamescom e teaser di gioco per Xiaohongshu/bilibili.',
  },
  'illustrated-city-food-map': {
    title: 'Mappa Gastronomica Illustrata della Città',
    summary:
      'Genera una mappa turistica disegnata a mano in stile acquerello con specialità gastronomiche locali numerate, punti di riferimento e una legenda.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Illustrazione - Rielaborazione di un Disegno Infantile a Pastello',
    summary:
      'Un prompt di trasferimento di stile che rielabora qualsiasi immagine di riferimento (foto di prodotto, screenshot, ritratto, mockup di UI) in un\'illustrazione disegnata a mano con i pastelli, come se fosse stata fatta da un bambino di 10 anni. Sostituisce la palette originale con colori a pastello vivaci e giocosi su carta bianca pulita, e cosparge la scena di fantasia infantile — castelli, caramelle, stelle, nuvole, arcobaleni — per amplificare l\'atmosfera innocente da libro illustrato. Funziona come modifica image-to-image in GPT-image-2 (richiede il caricamento di un\'immagine di riferimento insieme al prompt); particolarmente adatto a screenshot di siti web, key art di brand, foto di prodotto e ritratti.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'Infografica - Scomposizione della coreografia di danza otaku (Gokuraku Jodo, 16 pannelli)',
    summary:
      'Un singolo poster verticale 2:3 composto come una griglia 4×4 di 16 pannelli quadrati collegati, che formano una tabella completa di scomposizione della coreografia per la celebre canzone di danza otaku giapponese 極楽浄土 (Gokuraku Jodo). Ogni pannello mostra la stessa graziosa idol anime semi-realistica (codini rosa, uniforme da school-idol con colletto alla marinara) che esegue una posa caratteristica della danza, a figura intera, su uno sfondo rosa pastello con una piccola fascia di didascalia in giapponese in basso e un cerchio numerato in alto a sinistra. Concepito esplicitamente come scheda di RIFERIMENTO POSE per la generazione di video con IA — ogni silhouette è nitida e inequivocabile, senza linee di movimento o disordine sullo sfondo. Ottimizzato per gpt-image-2, formato 2:3. Categoria: Infografica.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Slide esplicativa di Momotaro in stile ibrido',
    summary:
      'Un prompt che combina l\'estetica semplice e calda delle illustrazioni Irasutoya con l\'alta densità di informazioni caratteristica delle slide governative giapponesi.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Dashboard di team in stile Notion (Artifact dal vivo)',
    summary:
      'Mockup di una dashboard di team nativa di Notion a schermata singola — griglia di KPI, sparkline a 7 giorni, feed di attività e tabella di task con database collegato. Complemento visivo per la skill live-artifact; abbinala a quest\'ultima per esecuzioni aggiornabili / con connettori, oppure usala da sola come mockup statico.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profilo / Avatar - Da ragazza anime a foto cinematografica',
    summary:
      'Questo prompt trasforma un\'illustrazione di riferimento di un personaggio in un realistico ritratto d\'interni vintage dai toni caldi, preservando l\'abbigliamento, la posa e il gatto originali.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profilo / Avatar - Servizio fotografico di moda casual su griglia',
    summary:
      'Un prompt JSON strutturato per un collage di 4 foto di un servizio fotografico di moda casual con parametri dettagliati su soggetto e illuminazione.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profilo / Avatar - Ritratto cinematografico di uomo sud-asiatico con avvoltoi',
    summary:
      'Un dettagliato ritratto cinematografico di un giovane uomo sud-asiatico in un\'ambientazione dark fantasy e cupa, circondato da avvoltoi e corvi.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profilo / Avatar - Ritratto anime cyberpunk con testo al neon sul volto',
    summary:
      'Un elegante ritratto anime immerso nei neon, per poster, arte per i social media o visual di branding futuristico.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profilo / Avatar - Elegante ragazza fantasy in un giardino viola',
    summary:
      'Questo prompt genera un raffinato ritratto fantasy in stile anime di una donna elegante con capelli lucidi e acconciati, ornati abiti viola-neri e un\'ambientazione di giardino magico pieno di fiori, ideale per personaggi',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profilo / Avatar - Eterea ritratto fantasy dai capelli blu',
    summary:
      'Questo prompt genera un morbido e luminoso ritratto di personaggio fantasy in stile anime, ideale per creare eleganti key art verticali o illustrazioni di personaggi con capelli fluenti e una sognante atmosfera primaverile.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profilo / Avatar - Ritratto di donna affascinante in nero',
    summary:
      'Questo prompt genera un ritratto fotorealistico in stile lusso di una donna elegante con un abito nero dalla scollatura profonda, ideale per fashion editorial o immagini beauty.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profilo / Avatar - Prompt iper-realistici per texture da selfie',
    summary:
      'Frammenti di prompt dettagliati per generare texture della pelle realistiche e un\'inquadratura autentica da selfie con il telefono, con attenzione ai pori visibili e all\'illuminazione naturale.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profilo / Avatar - Ritratto di maga fantasy color lavanda',
    summary:
      'Questo prompt genera un raffinato ritratto fantasy in stile anime di un\'elegante principessa maga con capelli biondi e lucidi, fiori viola e ornati abiti di cristallo, ideale per character art o illustrazioni magiche',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profilo / Avatar - Ritratto monocromatico in studio',
    summary:
      'Un prompt di fotografia commerciale di alto livello per un ritratto monocromatico con un caratteristico sfondo diviso e una drammatica illuminazione da studio.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profilo / Avatar - Restauro di vecchia foto in ritratto reflex',
    summary:
      'Questo prompt restaura una vecchia foto di famiglia danneggiata con 4 persone trasformandola in un ritratto realistico pulito, colorato e ad alta risoluzione, per la riparazione e il miglioramento delle foto.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profilo / Avatar - Ritratto di donna poetica in giardino',
    summary:
      'Questo prompt genera un realistico ritratto in stile editoriale di una giovane donna amante dei libri in un giardino soleggiato, ideale per fotografia lifestyle, branding letterario o eleganti immagini di personaggi.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profilo / Avatar - Wallpaper per ritratto identitario professionale',
    summary:
      'Genera un wallpaper premium ad alta risoluzione con un soggetto in abbigliamento professionale, attività legate alla carriera e testo.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profilo / Avatar - Selfie con IA realisticamente imperfetto',
    summary:
      'Un prompt creativo da usare con GPT Image 2 per generare un selfie \'venuto male\' che sembri uno scatto accidentale e di bassa qualità fatto con lo smartphone.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profilo / Avatar - Ritratto a pennarello firmato su shikishi',
    summary:
      'Questo genera un vivace ritratto firmato in stile pennarello su una tavola shikishi quadrata, utile per autografi di fan-art, post di illustrazioni commemorative e visual di ringraziamento personalizzati.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profilo / Avatar - Ritratto dell\'imperatrice coniglio delle nevi',
    summary:
      'Un prompt per un ritratto fantasy realistico per generare una regale donna a tema coniglio in un ornato hanfu invernale, in piedi in un tempio di montagna innevato.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profilo / Avatar - Ritratto in hanfu con maschera di coniglio delle nevi',
    summary:
      'Questo prompt genera un ritratto cinematografico fantasy invernale di una donna mascherata in un Hanfu bianco a tema coniglio, ideale per character art elegante e immagini atmosferiche da vetrina AI.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profilo / Avatar - Ritratto Hanfu Coniglio Innevato',
    summary:
      'Questo prompt genera un ritratto di bellezza fantasy ultra-dettagliato di una donna con orecchie da coniglio in hanfu ricamato, ideale per character art elegante, costume design o vetrine di ritratti cinematografici AI.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profilo / Avatar - Ritratto dello Spirito del Coniglio Innevato',
    summary:
      'Questo prompt genera un sereno ritratto fantasy di una donna anonima con orecchie da coniglio in inverno, ideale per character art atmosferica e illustrazioni di profilo stilizzate.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profilo / Avatar - Ritratto Hanfu della Dinastia Song',
    summary:
      'Un prompt ottimizzato per generare un ritratto dettagliato e realistico di una bellezza in Hanfu tradizionale della Dinastia Song all\'interno di un antico cortile.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Post sui Social Media - Poster Teaser Anime di Outfit del Negozio Pokémon',
    summary:
      'Questo prompt genera un poster di annuncio fashion anime dai toni pastello tenui con protagonista una ragazza dal volto sfocato in un abito blu all\'interno di un negozio Pokémon, ideale per teaser di reveal di outfit e visual promozionali di personaggi.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Post sui Social Media - Scena Cinematografica in Ascensore',
    summary:
      'Un prompt per generare una scena cinematografica e suggestiva di una donna all\'interno di un ascensore metallico con illuminazione e riflessi realistici.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Post sui Social Media - Ragazza Elfa Confusa a una Scrivania Pastello',
    summary:
      'Questo prompt genera un\'illustrazione anime dai toni pastello tenui di una ragazza elfa che digita al computer in un accogliente spazio di lavoro kawaii, ideale per post sui social, sfondi o arte a tema streamer.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Post sui Social Media - Fotografia di Moda Editoriale',
    summary:
      'Un prompt suggestivo e incentrato sulla moda per una scena minimalista in studio con illuminazione tenue e toni caldi.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Post sui Social Media - Collage di Moda Editoriale',
    summary:
      'Un prompt per un collage fotografico 2x2 altamente dettagliato per scatti di moda editoriale, incentrato su uno styling coerente, un\'illuminazione specifica e tratti del viso da una foto di riferimento.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Post sui Social Media - Poster di Annuncio del Trasferimento al PSG',
    summary:
      'Un poster d\'ingaggio calcistico audace e professionale per annunciare il trasferimento di un giocatore al Paris Saint-Germain su social media o grafiche promozionali sportive.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Post sui Social Media - Storyboard di Danza di una Ragazza Sensazionale (8 Inquadrature)',
    summary:
      'Un set completo di prompt per uno storyboard di 8 inquadrature per generare una sequenza di danza coerente fotogramma per fotogramma di un personaggio elegante. Include token di stile globale condivisi, un negative prompt riutilizzabile e otto prompt per inquadratura (posa di apertura, ancheggiamento, onda del corpo, torsione del busto sul beat-drop, oscillazione laterale dei fianchi, movimento dei capelli, posa di forza, posa finale). Ottimizzato per modelli di livello GPT-Image-2: vocabolario conciso, nessuna formulazione sensibile, inquadratura e linguaggio dell\'illuminazione coerenti tra le inquadrature in modo che i fotogrammi sembrino un\'unica coreografia continua.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Post sui Social Media - Copertina di Rivista di Cultura Retrò del Giorno Showa',
    summary:
      'Una calda pagina di approfondimento in stile editoriale dedicata a una festività giapponese, che combina character art anime, immagini nostalgiche di strade dell\'era Showa e un layout informativo in stile rivista per promozioni culturali stagionali.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Post sui Social Media - Generazione di Outfit di Moda per i Social Media',
    summary:
      'Un prompt per generare una settimana di consigli di outfit in stile fashion blogger basati su un profilo di personaggio, completi di etichette e prezzi dei capi.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Post sui Social Media - Prompt per Collage di Istantanee di Viaggio',
    summary:
      'Un prompt dettagliato per creare un collage nostalgico di 12 fotogrammi di foto di viaggio in stile smartphone che raffigurano un viaggio in solitaria.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Post sui Social Media - Schizzo Vintage da Pittore di Insegne',
    summary:
      'Genera uno schizzo a pennarello disegnato a mano su carta con dettagli realistici come linee di grafite e sbavature d\'inchiostro, perfetto per stili di lettering vintage.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'Poster con Vista Esplosa del Visore VR',
    summary:
      'Genera un diagramma high-tech con vista esplosa di un visore VR con didascalie dettagliate dei componenti e testo promozionale.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Bambino che Costruisce con i Lego in Animazione 3D',
    summary:
      'Un prompt video multi-inquadratura in stile animazione 3D che descrive un bambino mentre assembla con cura pezzi di Lego in una stanza, con effetti time-lapse.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Un Decennio di Trasformazione e Crescita',
    summary:
      'Un prompt di trasformazione per Seedance 2.0 che mostra la transizione di un uomo da un ambiente casual del 2016 a un lussuoso stile di vita a Dubai nel 2026 mantenendo la coerenza del personaggio.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Salvataggio dell\'Antico Drago Guardiano',
    summary:
      'Un prompt cinematografico multi-inquadratura dettagliato per una storia su una ragazza in un villaggio sotto la pioggia salvata da un drago che emerge, incentrato su VFX e suono atmosferico.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Video FPV di un Antico Regno Indiano',
    summary:
      'Un prompt cinematografico in stile drone FPV dal ritmo serrato che raffigura un mistico regno indiano con templi e giungle.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt di trasferimento dell\'animazione e tracciamento della camera',
    summary:
      'Un prompt tecnico per Seedance 2.0 che applica un riferimento di movimento specifico a un personaggio mantenendo un tracking della camera fisso.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Danza con Trasformazione dell\'Outfit Sincronizzata al Ritmo',
    summary:
      'Un prompt per Seedance 2.0 che coordina la danza di un personaggio seguendo i breakdown frame mentre esegue un cambio d\'outfit sincronizzato al ritmo.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Sequenza di Motion Graphics per la Presentazione dei Personaggi',
    summary:
      'Un prompt di motion graphics complesso e multifase per presentare un team di personaggi con specifici overlay UI e transizioni, progettato per il modello Seedance 2.0.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Sequenza Cinematografica di Festa di Compleanno',
    summary:
      'Un prompt video multi-inquadratura estremamente dettagliato per una sequenza di compleanno, incentrato sulla coerenza dei personaggi e sullo storytelling emotivo.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Interazione e Volo Cinematografico con il Drago',
    summary:
      'Un prompt dettagliato in stile storyboard per un video che presenta l\'interazione emotiva di una donna con un drago, seguita da una sequenza di volo cinematografica.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Danza delle Mani Cinematografica di una Donna dell\'Asia Orientale',
    summary:
      'Un prompt video cinematografico multi-inquadratura estremamente dettagliato per una danza delle mani stilizzata, con istruzioni con timecode per il movimento della camera e le azioni del personaggio.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Primo Piano Cinematografico di un Volto Emotivo',
    summary:
      'Un prompt tecnico estremamente dettagliato per Seedance 2.0 incentrato su texture della pelle realistiche e su una serie di complesse transizioni facciali emotive.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Esplorazione Cinematografica di una Biologa Marina',
    summary:
      'Un prompt video cinematografico dettagliato per una scena subacquea con una biologa marina che scopre un antico relitto in una barriera corallina.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Podcast Musicale Cinematografico e Tecnica Chitarristica',
    summary:
      'Un prompt cinematografico avanzato per generare un video podcast musicale in 4K, con particolare attenzione alla tecnica chitarristica, ai pinch harmonics e all\'estetica da studio.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Guida di Navigazione del Percorso Cinematografica',
    summary:
      'Un prompt strutturato multi-scena progettato per Seedance per creare un video di navigazione a piedi coerente con un personaggio guida turistica ricorrente e transizioni fluide tra luoghi del mondo reale.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Sequenza Cinematografica di Corsa Clandestina per Seedance 2',
    summary:
      'Un prompt dettagliato e multi-inquadratura progettato per Seedance 2 per generare una sequenza cinematografica di corsa clandestina di notte, incentrata sull\'intensa concentrazione del pilota, su un lavoro di camera dinamico e su accelerazioni esplosive, strutt',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Sequenza cinematografica di combattimento tra vampiri nel vicolo',
    summary:
      'Un prompt d\'azione completo per una scena di cortometraggio che coinvolge movimenti di camera dinamici e combattimento ad alta velocità in un vicolo illuminato al neon.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Sequenza Cinematografica Sci-Fi Crimson Horizon',
    summary:
      'Una sequenza video cinematografica completa a 9 inquadrature per un film di fantascienza intitolato \'Crimson Horizon\', che descrive tutto, dal lancio di un razzo a un inquietante incontro alieno su Marte.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Script per Trailer di Gioco Cyberpunk',
    summary:
      'Un prompt esteso per la generazione video di un trailer di gioco cyberpunk, che descrive il design dei personaggi, le animazioni dell\'interfaccia UI e le transizioni ambientali da un vuoto bianco a una favela.',
  },
  'forbidden-city-cat-satire': {
    title: 'Satira del Gatto della Città Proibita',
    summary:
      'Un prompt complesso di commedia nera per Seedance 2.0 con un gatto arancione funzionario e un imperatore iena in un\'ambientazione satirica della dinastia Qing.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Prompt Video Fantasy di Alta Moda Hollywoodiana',
    summary:
      'Un prompt dettagliato e multi-scena per la generazione video con Seedance 2.0, progettato per creare un film fantasy di alta moda hollywoodiana. Il prompt specifica lo stile, la risoluzione (8K), il motore di rendering (Unreal Engin',
  },
  'hunched-character-animation': {
    title: 'Animazione di Personaggio Curvo',
    summary:
      'Istruzione per Seedance 2 per creare un\'animazione di camminata sul posto per un riferimento di personaggio specifico.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: Demo di Prodotto 3D iPhone + MacBook',
    summary:
      'Una demo di prodotto di 15 secondi in cui un vero iPhone 15 Pro Max GLTF e un MacBook Pro fluttuano su un palco pulito con la reale interfaccia UI dell\'app renderizzata dal vivo sui loro schermi tramite drawElementImage. Lens flare di vetro che si trasforma + giradischi a 360°. Costruito sul catalog block vfx-iphone-device.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: Rivelazione Cinematografica del Testo con Cursore',
    summary:
      'Una rivelazione del testo drammatica di 8 secondi con bagliore del cursore, raggi d\'ombra cromatici e illuminazione direzionale su un palco nero. Tipografia DOM reale sotto post-processing shader dal vivo. Costruito sul catalog block vfx-text-cursor.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: Outro con Vetro in Frantumi',
    summary:
      'Un outro HTML in frantumi di 12 secondi — una vera pagina di prodotto o card dei prezzi si ferma per un attimo, poi esplode in frammenti di vetro rifrangenti con sfocatura di profondità e dispersione cromatica. Costruito sul catalog block vfx-shatter. Si abbina come end-card dopo una composizione più lunga.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: Hero con Sfondo Liquido',
    summary:
      'Una hero di 12 secondi con contenuto HTML che fluttua sopra una superficie liquida organica — piano suddiviso con vertici spostati, dinamiche delle onde in tempo reale, il DOM catturato scorre in cima nitido e leggibile. Costruita sul blocco di catalogo vfx-liquid-background.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: Liquid Glass Landing Reveal',
    summary:
      'Un reveal di 20 secondi in stile voronoi liquid-glass di una vera landing page di prodotto — il DOM viene catturato in tempo reale tramite drawElementImage, frantumato in celle di vetro rifrangenti, per poi assestarsi in una pulita inquadratura hero. Costruito sul blocco di catalogo vfx-liquid-glass.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: Magnetic Field Visualisation',
    summary:
      'Una visualizzazione di particelle in campo magnetico di 15 secondi che reagisce a una heatmap o a un grafico DOM in tempo reale — le particelle tracciano linee di campo che si curvano attorno all\'HTML catturato, ideale per prodotti ML/dati. Costruita sul blocco di catalogo vfx-magnetic.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: Portal Reveal Dashboard',
    summary:
      'Un portale dimensionale di 10 secondi si apre su una dashboard di dati in tempo reale — DOM catturato in tempo reale, fuoriuscita di luce volumetrica, particelle ai bordi del portale. Costruito sul blocco di catalogo vfx-portal. Pensato per inquadrature hero di dati in stile keynote.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: Hype del contatore di denaro da $0 → $10K (9:16)',
    summary:
      'Una clip hype HyperFrames verticale 1080×1920 di 6 secondi — contatore in stile Apple da $0 → $10.000 con flash verde, particelle di esplosione di denaro, icona di pila di contanti, titolo kicker. Costruita sul blocco di catalogo HyperFrames `apple-money-count`.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: Showcase di app di 12 secondi — Tre telefoni fluttuanti',
    summary:
      'Una composizione showcase di app 16:9 di 12 secondi — tre schermi iPhone fluttuanti sospesi nello spazio 3D, ognuno ruota a turno per mostrare una funzionalità diversa, callout testuali sincronizzati al beat, lockup del logo finale. Costruita direttamente sul blocco di catalogo HyperFrames `app-showcase`.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: Sizzle reel di brand di 30 secondi',
    summary:
      'Un sizzle reel HyperFrames 16:9 di 30 secondi — tagli rapidi, tipografia cinetica sincronizzata al beat, scala audio-reattiva sulle parole in evidenza, transizioni shader tra cinque scene, end-card con bloom del logo. Modellato sull\'archetipo aisoc-hype dello student kit.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: Promo di prodotto SaaS di 30 secondi (in stile Linear)',
    summary:
      'Una composizione HyperFrames di 30 secondi modellata su film di prodotto in stile Linear/ClickUp — reveal 3D dell\'interfaccia, tipografia cinetica sincronizzata al beat, screenshot animati dell\'interfaccia, end-card con outro del logo. Costruita da blocchi di catalogo HF (ui-3d-reveal, app-showcase, logo-outro) più transizioni shader tra le scene.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: Outro cinematografico del logo di 4 secondi',
    summary:
      'Un outro del logo 16:9 di 4 secondi — assemblaggio del wordmark pezzo per pezzo con bloom, scia di shimmer sul lockup finale, sovrapposizione di grana soffusa, CTA su una sola riga. Costruito sui blocchi HyperFrames `logo-outro`, `shimmer-sweep` e `grain-overlay`.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: Reveal di prodotto minimale di 5 secondi',
    summary:
      'Una composizione HyperFrames di 5 secondi per un reveal di prodotto di alta gamma — canvas scuro, un unico accento caldo, title card con lento push-in, riga kicker cinetica, movimento sobrio. L\'agente esegue il rendering dell\'MP4 da HTML+GSAP tramite puppeteer; nessun filmato stock necessario.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: Stack di overlay social 9:16 (X · Reddit · Spotify · Instagram)',
    summary:
      'Una composizione HyperFrames verticale 1080×1920 di 15 secondi che impila quattro card social animate su un loop face-cam — un post su X, una reazione su Reddit, una card now-playing di Spotify e una CTA di follow su Instagram alla fine. Ogni card è un blocco di catalogo HyperFrames; la coreografia è il valore aggiunto.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: Talking-head TikTok 9:16 con sottotitoli karaoke',
    summary:
      'Un short HyperFrames verticale 1080×1920 — talking-head con narrazione TTS su un loop face-cam, con sottotitoli sincronizzati parola per parola in stile karaoke, lower third animato e un overlay di follow su tiktok alla fine. Rispecchia l\'archetipo may-shorts-19 dello student kit di HyperFrames.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: Bar-Chart Race animata (in stile NYT)',
    summary:
      'Un\'infografica di dati 16:9 di 12 secondi — grafico a barre + linee animato con reveal scaglionato delle categorie, titolo serif in stile NYT, fonte in nota a piè di pagina, etichette di valore cinetiche. Costruita direttamente sul blocco di catalogo HyperFrames `data-chart`.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Mappa di volo in stile Apple (Origine → Destinazione)',
    summary:
      'Una mappa cinematografica di rotta di volo 16:9 di 8 secondi — zoom realistico sul terreno, aereo animato che plana dall\'origine alla destinazione lungo un percorso curvo, città etichettate, contatore cinetico della distanza. Costruita direttamente sul blocco di catalogo HyperFrames `nyc-paris-flight`, riutilizzabile per qualsiasi coppia di città.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: Pipeline da sito web a video (montaggio marketing di 15 secondi)',
    summary:
      'Una composizione HyperFrames 16:9 di 15 secondi che cattura un sito web dal vivo a tre dimensioni di viewport, per poi animarsi tra di esse con uno split radiale cromatico tra le scene. Rispecchia l\'archetipo hyperframes-sizzle dello student kit in cui il sito è l\'asset sorgente.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Adattamento anime live-action: Duello tra Respirazione dell\'Acqua e Respirazione del Tuono',
    summary:
      'Un prompt estremamente dettagliato di 15 secondi per generare un adattamento live-action di un duello in stile anime, con la \'Respirazione dell\'Acqua\' (drago d\'acqua blu) contro la \'Respirazione del Tuono\' (fulmine dorato). Il p',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Narrazione cinematografica di supercar di lusso',
    summary:
      'Un prompt cinematografico multi-inquadratura estremamente dettagliato per Seedance 2.0 che coinvolge un uomo elegante, dei Dobermann e una supercar d\'epoca in un\'ambientazione montana e nebbiosa.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Sequenza storyboard dell\'Accademia Magica',
    summary:
      'Un prompt dettagliato in stile storyboard per una sequenza cinematografica che ritrae una ragazza magica in un\'accademia, coprendo l\'arrivo, la scoperta del potere e un duello magico.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Prompt video per cortometraggio rilassante in stile Modern Rural Aesthetics',
    summary:
      'Un prompt dettagliato a tre inquadrature per Seedance 2.0 per generare un cortometraggio cinematografico e rilassante nello stile Modern Rural Aesthetics. Specifica lo stile (Cinematic Commercial, 4K/8K, Extreme Macro, nat',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Animazione atmosferica di volantino per nightclub',
    summary:
      'Un prompt di animazione sottile per Seedance 2.0 per dare vita agli elementi di sfondo e di illuminazione mantenendo il soggetto fisso',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Estetica del film wuxia di Hong Kong retrò',
    summary:
      'Un prompt video complesso e multi-parte che ricrea l\'estetica dei film Wuxia di Hong Kong degli anni \'80-\'90, con la trasformazione di un personaggio da gatto a essere umano attraverso inquadrature stilizzate.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: cortometraggio cinematografico romantico giapponese di 15 secondi',
    summary:
      'Un prompt multi-scena estremamente dettagliato di 15 secondi per Seedance 2.0, progettato per generare un cortometraggio cinematografico e ultra-realistico di puro amore tra studenti di liceo giapponese. Il prompt specifica l\'ambientazione della scena (vuota',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: MV di una rapper di 80 anni',
    summary:
      'Un prompt dettagliato di 15 secondi per Seedance 2.0 per generare un video musicale (MV) di street rap orizzontale 16:9 con protagonista una donna di 80 anni. Il prompt specifica lo stile (toni freddi viola/blu al neon, esp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Istruzioni di sequenza e movimento per video di arti marziali',
    summary:
      'Un prompt video per Seedance 2.0 che istruisce il modello ad animare una sequenza basata su un character sheet, concentrandosi su movimenti e passaggi specifici.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Sequenza magica di scambio di anime allo specchio',
    summary:
      'Un prompt video narrativo che descrive un evento magico di scambio di anime davanti a uno specchio, con istruzioni specifiche per la camera e spunti emotivi per ogni segmento.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Jumpscare del tostapane razzo',
    summary:
      'Un prompt per un\'inquadratura in stile home-video realistico di un anziano spaventato da un tostapane che lancia il pane come un razzo.',
  },
  'traditional-dance-performance': {
    title: 'Spettacolo di danza tradizionale',
    summary:
      'Un prompt video completo per Seedance 2.0 per generare un\'elegante danza tradizionale basata su coreografia e immagini di riferimento dell\'identità.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Video - ARPG dei Tre Regni - Guan Yu uccide Yan Liang (Seedance 2.0)',
    summary:
      'Una sequenza d\'azione cinematografica in-engine di circa 10s che dà vita al template di immagine companion game-screenshot-three-kingdoms-guanyu-slaying-yanliang. Guan Yu (关羽) cavalca il suo cavallo Lepre Rossa dritto nella linea di battaglia nemica, solleva la Lama a Mezzaluna del Drago Verde ed esegue un singolo fendente netto sul generale avversario Yan Liang. Ottimizzato per Seedance 2.0 — disciplina di camera serrata, un singolo colpo decisivo, fisica pulita di cavallo e lama, illuminazione fotorealistica, assolutamente nessuna scena cruenta a schermo (il colpo è suggerito da un lampo dorato di qi, non da alcun sangue). Progettato come diretto companion video del template di immagine corrispondente, così che il fermo immagine e la clip possano essere serviti in coppia. Immagine di riferimento: il template screenshot di Guan Yu che uccide Yan Liang.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Video - ARPG dei Tre Regni - Lyu Bu, il tiro con l\'arco alla porta dell\'accampamento (Seedance 2.0)',
    summary:
      'Una sequenza d\'azione cinematografica in-engine di circa 10s che dà vita al template di immagine companion game-screenshot-three-kingdoms-lyubu-yuanmen-archery. Lyu Bu (吕布) si erge al centro di un polveroso accampamento militare tra due eserciti contrapposti, tende un arco lungo laccato di rosso, mantiene la trazione con la freccia incoccata, poi scocca una singola freccia luminosa dorata imbevuta di qi lungo il campo verso un\'alabarda piantata a terra in lontananza. Ottimizzato per Seedance 2.0 — disciplina di camera serrata, un singolo battito decisivo, inquadratura nitida HUD-safe, fisica pulita di arco/freccia, movimento di vento + polvere + stendardi e color grading da screenshot in-game. Progettato come diretto companion video del template di immagine corrispondente, così che il fermo immagine e la clip possano essere serviti in coppia. Immagine di riferimento: il template screenshot di Lyu Bu al tiro con l\'arco alla porta dell\'accampamento.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Video - ARPG dei Tre Regni - Zhao Yun, la fuga con il neonato (Seedance 2.0)',
    summary:
      'Una sequenza d\'azione cinematografica in-engine di circa 12s che dà vita al template di immagine companion game-screenshot-three-kingdoms-zhaoyun-cradle-escape. Zhao Yun (赵云) cavalca il suo destriero attraverso il devastato campo di battaglia di Changban, cullando l\'erede neonato A Dou nell\'incavo del braccio sinistro e impugnando la lancia con il destro, parando un colpo in arrivo con una singola SCHIVATA PERFETTA e scavalcando un carro da guerra caduto per aprirsi un varco. Ottimizzato per Seedance 2.0 — disciplina di camera serrata, un singolo battito continuo, credibile manovra della lancia con un solo braccio, fisica pulita del cavallo e assolutamente nessun danno visibile al neonato. Progettato come diretto companion video del template di immagine corrispondente, così che il fermo immagine e la clip possano essere serviti in coppia. Immagine di riferimento: il template screenshot della fuga di Zhao Yun con il neonato.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Animazione di un coccodrillo pirata in stile Disney vintage',
    summary:
      'Un prompt narrativo multi-scena per un\'animazione classica in stile Disney vintage con protagonisti un coccodrillo pirata e uccelli pirati su una nave.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Coreografia di danza K-pop virale',
    summary:
      'Un prompt dettagliato per Seedance 2.0 per animare un personaggio che esegue una danza basata su uno storyboard di riferimento a 16 pannelli.',
  },
  'wasteland-factory-chase': {
    title: 'Inseguimento nella fabbrica delle terre desolate',
    summary:
      'Un prompt cinematografico per una scena ad alta velocità in una landa desertica desolata con protagonisti una fabbrica industriale in movimento su zampe e l\'inseguimento di una moto ribelle.',
  },
};
