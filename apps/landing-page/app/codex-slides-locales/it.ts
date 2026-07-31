// Italian (it) overrides for the Codex Slides landing copy.
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const it: DeepPartial<CodexSlidesCopy> = {
  title: "Codex Slides — lo studio di slide AI open source dentro Codex",
  description:
    "Codex Slides è uno studio di slide con IA open source che vive dentro Codex. Descrivi una presentazione — oppure puntala su un repository, un PDF o un foglio di calcolo — e il tuo Codex locale fa ricerca, costruisce la scaletta, definisce lo stile, renderizza ed esporta un PPTX vero e un PDF pronto per la stampa. Ogni slide è una tela visiva intera. 45 template di presentazione, 73 stili della community, 24 scenari guidati; il Fast mode renderizza oltre 10 slide in circa 4–5 minuti. Browser-first, licenza MIT, funziona con il codex login che hai già e senza chiavi API aggiuntive.",
  label: "Progetto gemello",
  heading: "Lo studio di slide con IA dentro il tuo coding agent",
  lead:
    "Quasi tutti i generatori di slide con IA nascondono il lavoro dietro un'unica richiesta e ti restituiscono un file. Codex Slides tiene viva l'intera catena dentro Codex — ricerca, scaletta, direzione visiva, render, editing, presentazione, export — e ogni presentazione resta un progetto duraturo sul tuo disco. Image-native: ogni slide è una tela visiva intera, non un template a cui è stato cambiato il testo.",
  downloadCta: "Scarica Open Design",
  heroAlt:
    "Codex Slides — a sinistra Codex che guida lo studio di slide nel browser, a destra una slide renderizzata di report di mercato",

  glanceAria: "In breve",
  glance: {
    stars: "Stelle su GitHub",
    templates: "Template di presentazione",
    styles: "Stili della community",
    scenarios: "Scenari guidati",
    license: "Licenza",
  },

  whyTitle: "Perché esiste",
  whyLead:
    "Una presentazione non è un problema di generazione in un colpo solo. È una serie di decisioni — cosa dire, in che ordine, in quale linguaggio visivo — e ognuna costa meno se la correggi prima del render invece che dopo.",
  ideas: [
    {
      headline: "Lo guardi accadere invece di aspettare un file.",
      body: "Codex apre lo studio nel suo Browser e lo tiene in vista. Confermi il brief, rivedi la scaletta e approvi la direzione visiva prima che venga renderizzata una sola pagina, così gli errori costosi vengono intercettati quando costano ancora poco.",
    },
    {
      headline: "Ogni presentazione è un progetto duraturo, non un download.",
      body: "Conversazione, fonti, scaletta, regole di brand, checkpoint e pagine renderizzate restano tutti su disco. Torna domani e continui a lavorare sullo stesso progetto: ogni comando dell'IA e ogni modifica manuale lascia un checkpoint immutabile che puoi ispezionare, ripristinare o esportare.",
    },
    {
      headline: "Image-native: la slide è la tela.",
      body: "Ogni pagina è composta come un'unica tela visiva intera e non come una casella di testo appoggiata su un tema: per questo il risultato regge il confronto con presentazioni disegnate a mano. Annota una slide direttamente e rigenera solo quella pagina partendo dai tuoi segni.",
    },
  ],

  flowTitle: "Come funziona",
  flowLead:
    "Entra un prompt, esce una presentazione pronta per il palco — con un punto di controllo a ogni passaggio in cui il tuo giudizio vale più di un'altra chiamata al modello.",
  flow: [
    { step: '01', headline: "Chiarisci il brief", body: "Un modulo di domande su misura conferma pubblico, numero di pagine, formato, lingua, risoluzione e intento visivo prima che inizi la scrittura." },
    { step: '02', headline: "Verifica i fatti", body: "Una ricerca web opzionale a più giri produce un brief in Markdown sostenuto dalle fonti, che resta ispezionabile e modificabile nei Design Files." },
    { step: '03', headline: "Dai forma alla scaletta", body: "Modifica ogni titolo e ogni punto chiave, aggiungi o togli slide, riordina il racconto oppure chiedi all'agente di ristrutturarlo — prima che esistano le grafiche." },
    { step: '04', headline: "Fissa la direzione visiva", body: "Codex Slides ordina la sua libreria di stili in base al tuo tema e alla tua scaletta. Scegline uno, cerca nell'intero catalogo o tieni quello predefinito." },
    { step: '05', headline: "Renderizza in parallelo", body: "Il Fast mode lancia tutte le pagine insieme invece che una alla volta, così una presentazione da oltre 10 slide arriva in circa quattro o cinque minuti con la direzione visiva bloccata." },
    { step: '06', headline: "Modifica sul posto", body: "Chiedi una riscrittura, segna un'area con frecce e commenti, sostituisci un'immagine, riordina le pagine, imposta le transizioni e scrivi le note del relatore." },
    { step: '07', headline: "Presenta ed esporta", body: "Avvia il Presenter Mode con finestra pubblico sincronizzata e timer, poi scarica un PPTX vero e un PDF pronto per la stampa con le note conservate." },
  ],

  showcaseTitle: "Che aspetto hanno le presentazioni",
  showcaseLead:
    "Ogni card è un sistema visivo incluso in Codex Slides: una direzione già finita da cui partire, per poi inserirci il tuo tema, il tuo pubblico o i tuoi file.",
  showcase: [
    { alt: "Presentazione di report aziendale e di mercato con grafici e KPI in evidenza", tag: "Report di mercato · grafici e KPI" },
    { alt: "Presentazione dashboard di dati con mappamondo, grafico ad anello e riquadri di metriche", tag: "Racconto dei dati · dashboard" },
    { alt: "Slide di keynote di prodotto cinematografica con un titolo ad alto contrasto", tag: "Keynote · cinematografico" },
    { alt: "Presentazione in stile rivista editoriale con titoli serif e griglia tipografica", tag: "Editoriale · griglia tipografica" },
    { alt: "Slide di keynote di prodotto luminosa e ariosa, con morbidi nodi diagramma 3D e un unico accento indaco", tag: "Keynote · luce del giorno pulita" },
    { alt: "Slide tecnica in vista esplosa annotata che ricostruisce un sistema come sezione trasversale", tag: "Tecnico · spaccato annotato" },
  ],

  insideTitle: "Il prodotto vero",
  insideLead:
    "Sono le schermate reali che Codex guida nel suo Browser, le stesse che useresti a mano, così puoi entrare e prendere il controllo in qualsiasi momento.",
  inside: [
    { alt: "Home di Codex Slides con il compositore di prompt, le scorciatoie agli scenari e gli stili della community", tag: "Home · descrivi la presentazione" },
    { alt: "Libreria di scenari con workflow di presentazione preconfigurati", tag: "Scenari · scegli un workflow" },
    { alt: "Scaletta della presentazione modificabile con titoli e punti chiave", tag: "Scaletta · dai forma alla storia" },
    { alt: "Editor delle slide con la tela intera in vista, barra strumenti, note del relatore e miniature", tag: "Editor · tela intera" },
  ],

  scenariosTitle: "Sei gruppi di flussi",
  scenariosLead:
    "Ventiquattro scenari guidati, raccolti in sei gruppi di flussi. Ogni gruppo porta con sé le proprie domande, i propri slot per le fonti e la propria grammatica visiva. Parti da uno oppure descrivi semplicemente ciò che ti serve.",
  scenarios: [
    { name: "Creare da zero", blurb: "Report aziendali, pitch deck e proposte di progetto a partire da un solo brief." },
    { name: "Trasformare una fonte", blurb: "Abbellisci un PPTX, un HTML o un PDF esistente; trasforma documenti, appunti o la foto di una lavagna in slide." },
    { name: "Dati e insight", blurb: "Dashboard, report periodici di performance, risultati finanziari e letture di sondaggi." },
    { name: "Ricerca e decisioni", blurb: "Presentazioni di deep research, studi di mercato, analisi competitive, rassegne della letteratura." },
    { name: "Ottimizzare una presentazione", blurb: "Applica un sistema di brand, ricrea uno stile di riferimento, traduci e localizza, comprimi o espandi." },
    { name: "Output specializzati", blurb: "Materiali di formazione, keynote di lancio, portfolio e case study, lotti generati da template." },
  ],

  formatsTitle: "File veri che puoi consegnare",
  formatsLead:
    "Quando il deck è come vuoi, esporta un vero PowerPoint (.pptx) e un PDF pronto per la stampa, entrambi con le tue note del relatore. Scegli la qualità di render e il formato adatto alla sala o al feed:",
  formatsRows: [
    { label: "Formati di export", values: "PowerPoint (.pptx) · PDF · note del relatore conservate" },
    { label: "Qualità di render", values: "1K · 2K · 4K" },
    { label: "Formati", values: "16:9 · 4:3 · 1:1 · 9:16 · 3:4" },
  ],

  duoTitle: "Veloce e senza attriti",
  fastTitle: "Fast mode",
  fastLead:
    "Le pagine vengono renderizzate in parallelo — fino a quattro alla volta, le altre in coda — invece che una dopo l'altra, mentre la scaletta approvata e la direzione visiva restano bloccate. Una presentazione da dieci slide di solito arriva in circa quattro o cinque minuti, e un'esecuzione interrotta riprende dallo stato salvato del progetto invece di ripartire da capo.",
  installTitle: "Installa in Codex",
  installLead:
    "Aggiungi il repository come marketplace di plugin, installa il plugin, riavvia Codex e apri una nuova attività. Ti servono Codex con il supporto ai plugin, Node.js 20 o superiore e un `codex login`: nessuna chiave OpenAI separata e nessun file `.env` per il flusso predefinito.",

  finalEyebrow: "Prossimo passo",
  tiebackTitle: "Dalla famiglia Open Design",
  tiebackBody:
    "Open Design è lo spazio di design aperto e local-first che sta fuori dal coding agent che già usi. Codex Slides è la stessa idea puntata sulle presentazioni: il tuo agente lavora allo scoperto, il progetto resta sulla tua macchina e nulla finisce chiuso dietro un abbonamento. Per l'intero toolkit di design oltre le slide, scarica l'app Open Design.",

  schemaAlternateName: "Lo studio di slide con IA open source dentro Codex",
  schemaWhatQuestion: "Che cos'è Codex Slides?",
  schemaWhatAnswer:
    "Codex Slides è uno studio di slide con IA open source, con licenza MIT, che gira come plugin dentro Codex. Trasforma un prompt, un repository o un insieme di file in una presentazione pronta per il palco attraverso un flusso visibile — chiarimento, ricerca opzionale, scaletta, direzione visiva, render in parallelo, editing, presentazione ed export PPTX/PDF — e conserva ogni presentazione come progetto duraturo sul tuo disco.",
  schemaKeyQuestion: "Codex Slides richiede una chiave API separata?",
  schemaKeyAnswer:
    "No. Funziona con l'account ChatGPT con cui ti sei già autenticato tramite `codex login`. Il flusso predefinito non richiede una chiave API OpenAI separata né un file `.env`; servono Codex con il supporto ai plugin, Node.js 20 o superiore e Git.",
  schemaExportQuestion: "Codex Slides può esportare file PowerPoint veri?",
  schemaExportAnswer:
    "Sì. Codex Slides esporta un PPTX vero e un PDF pronto per la stampa, entrambi con le note del relatore del progetto conservate, con qualità di render 1K/2K/4K su cinque formati (16:9, 4:3, 1:1, 9:16, 3:4). Essendo image-native, le slide del PPTX esportato contengono immagini a pagina intera invece di forme PowerPoint modificabili una per una; l'export con forme modificabili è in roadmap.",
  schemaRelationQuestion: "Codex Slides ha a che fare con Open Design?",
  schemaRelationAnswer:
    "Sì. Codex Slides è un progetto gemello nato dal team dietro Open Design: lo stesso approccio aperto, local-first e agent-native applicato alle presentazioni invece che ai file di design.",
};

export default it;
