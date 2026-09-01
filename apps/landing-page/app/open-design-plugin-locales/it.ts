import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const copy: OpenDesignPluginCopy = {
  metadata: {
    title: 'OpenDesign per Codex/ChatGPT | Installa il plugin OpenDesign Cloud',
    description:
      'Installa OpenDesign Cloud in Codex/ChatGPT e crea siti web, presentazioni, prototipi e design system dalla stessa attività.',
    keywords:
      'plugin OpenDesign per Codex, plugin ChatGPT desktop, installazione plugin Codex, OpenDesign Cloud, plugin di design Codex, Codex MCP',
  },
  hero: {
    title: 'Plugin OpenDesign per Codex/ChatGPT',
    leadBefore: 'Inserisci l’istruzione qui sotto in una qualsiasi attività della tua',
    chatgptLabel: 'app desktop ChatGPT',
    installAria: 'Installa OpenDesign Cloud in Codex/ChatGPT',
    copy: 'Copia',
    github: 'Apri la guida all’installazione su GitHub ↗',
  },
  demo: {
    title: 'Installa una volta. Crea da Codex/ChatGPT.',
    lead:
      'Guarda prima lo spazio di lavoro completo di Codex e OpenDesign, poi segui la sequenza reale dall’installazione al risultato.',
    overviewAlt:
      'Un’attività reale in Codex che usa il plugin OpenDesign accanto al sito completato del café Goodfield',
    overviewLabel: 'Attività reale in Codex',
    overviewCaption:
      'Il prompt, il passaggio a OpenDesign, i file generati e il sito completato restano visibili in un unico spazio di lavoro.',
    stepListAria: 'Le cinque fasi dell’esecuzione reale del plugin in Codex',
    installPhase: 'Installazione',
    installTitle: 'Chiedi a Codex di installarlo',
    installBody:
      'Incolla questa istruzione in un’attività di Codex. Codex aggiunge la sorgente Git canonica del marketplace, installa il plugin solo se non è già presente e completa la configurazione dell’MCP locale senza richiedere che sia elencato in un catalogo pubblico.',
    installNote:
      'Incollala una sola volta in Codex: i dettagli dell’installazione verranno gestiti automaticamente.',
    steps: [
      {
        phase: 'Utilizzo',
        title: 'Avvia una nuova attività in Codex',
        body:
          'Quando Codex ha completato l’installazione, apri il plugin OpenDesign appena installato nella nuova attività e scegli “Try now” per iniziare.',
        alt:
          'La schermata reale dei dettagli del plugin OpenDesign in Codex con il pulsante Try now',
      },
      {
        phase: 'Creazione',
        title: 'Scrivi il brief di design',
        body:
          'Menziona OpenDesign, quindi descrivi il risultato da creare, i contenuti, la direzione visiva e i requisiti responsive.',
        alt:
          'Un prompt reale in Codex che chiede a OpenDesign di creare il sito accogliente di un café di quartiere',
      },
      {
        phase: 'Creazione',
        title: 'Segui il passaggio in tempo reale',
        body:
          'Codex conferma la direzione, crea il progetto e passa il lavoro a OpenDesign, mentre i file compaiono in tempo reale.',
        alt:
          'Uno spazio di lavoro reale di Codex e OpenDesign durante la generazione del sito del café di quartiere',
      },
      {
        phase: 'Creazione',
        title: 'Esamina il risultato',
        body:
          'La stessa attività restituisce la landing page responsive del café Goodfield, le immagini generate e i file modificabili.',
        alt:
          'La landing page completata del café di quartiere Goodfield, generata tramite il plugin OpenDesign in Codex',
      },
    ],
  },
  use: {
    title: 'Parti dal prompt esatto.',
    lead:
      'Seleziona OpenDesign dal menu dei plugin di Codex, descrivi ciò che vuoi creare e continua a perfezionarlo dalla stessa attività. Codex mostra la menzione del plugin come un tag OpenDesign.',
    promptLabel: 'Prompt usato nell’attività Codex registrata',
    copyPrompt: 'Copia il prompt per Codex',
    galleryAria: 'Esempi creati con OpenDesign',
    templates: [
      {
        alt:
          'Landing page del prodotto Oryzo con una base da taglio materica e un oggetto in sughero',
        label: 'Lancio di prodotto',
      },
      {
        alt: 'Landing page dell’evento OpenDesign Osaka con una mappa tipografica',
        label: 'Pagina evento',
      },
      {
        alt: 'Sito editoriale scuro del prodotto Fable 5',
        label: 'Sito editoriale',
      },
      {
        alt: 'Interfaccia della cronologia dei modelli OpenDesign su una tela luminosa',
        label: 'Storia interattiva',
      },
    ],
    promptListAria: 'Esempi di prompt per OpenDesign Cloud',
    prompts: [
      { title: 'Sito web' },
      { title: 'Presentazioni' },
      { title: 'Prototipo' },
      { title: 'Design system' },
    ],
  },
  faq: {
    title: 'Domande prima dell’installazione',
    lead: 'Codex mantiene il controllo dell’attività. OpenDesign gestisce il flusso visivo.',
    items: [
      {
        q: 'Che cosa aggiunge il plugin a Codex?',
        a:
          'Aggiunge a Codex un flusso di lavoro OpenDesign per siti web, presentazioni, prototipi e design system. Il plugin si collega all’OpenDesign MCP locale per gestire brief, progetti e generazione degli artefatti.',
      },
      {
        q: 'Quali prodotti Codex sono supportati?',
        a:
          'Il pacchetto attuale supporta Codex Desktop e Codex CLI. Codex è il primo host supportato.',
      },
      {
        q: 'Che cosa serve prima dell’installazione?',
        a:
          'Usa Codex CLI 0.144.6 o una versione successiva e OpenDesign 0.17.0 o una versione successiva. Installa OpenDesign prima di registrare il relativo MCP locale.',
      },
      {
        q: 'Perché devo avviare una nuova attività in Codex?',
        a:
          'Codex carica le funzionalità del plugin e dell’MCP all’avvio di un’attività. Una nuova attività rileva il plugin OpenDesign Cloud appena installato.',
      },
      {
        q: 'La finestra di OpenDesign deve rimanere aperta?',
        a:
          'No. Quando serve, l’MCP locale registrato può avviare in background il runtime firmato di OpenDesign.',
      },
    ],
  },
  final: {
    aria: 'Installa OpenDesign Cloud in Codex/ChatGPT',
    title: 'Porta OpenDesign nella tua prossima attività Codex/ChatGPT.',
    bodyBeforeMention: 'Installa il plugin, collega l’MCP locale e richiama',
    bodyAfterMention: '.',
    copy: 'Copia',
    download: 'Scarica OpenDesign',
    source: 'Visualizza il codice sorgente',
  },
  clipboard: {
    copying: 'Copia in corso…',
    copied: 'Copiato',
    failed: 'Seleziona e copia',
  },
  schema: {
    pageName: 'Plugin OpenDesign Cloud per Codex/ChatGPT',
    applicationName: 'Plugin OpenDesign Cloud per Codex/ChatGPT',
  },
};

export default copy;
