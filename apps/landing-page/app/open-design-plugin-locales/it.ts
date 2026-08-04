import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const copy: OpenDesignPluginCopy = {
  metadata: {
    title: 'Open Design per Codex/ChatGPT | Installa il plugin Open Design Cloud',
    description:
      'Installa Open Design Cloud in Codex/ChatGPT e crea siti web, presentazioni, prototipi e design system dalla stessa attività.',
    keywords:
      'plugin Open Design per Codex, plugin ChatGPT desktop, installazione plugin Codex, Open Design Cloud, plugin di design Codex, Codex MCP',
  },
  hero: {
    title: 'Plugin Open Design per Codex/ChatGPT',
    leadBefore: 'Inserisci l’istruzione qui sotto in una qualsiasi attività della tua',
    chatgptLabel: 'app desktop ChatGPT',
    installAria: 'Installa Open Design Cloud in Codex/ChatGPT',
    copy: 'Copia',
    github: 'Visualizza il codice sorgente su GitHub ↗',
  },
  agentInstall: {
    howToName: 'Installa il plugin Open Design in Codex',
    howToDescription:
      'Procedura eseguibile dall’agente per installare il plugin Open Design per Codex e registrare l’MCP locale.',
    eyebrow: 'Protocollo di installazione leggibile dall’agente',
    title: 'Completa l’installazione del plugin Codex.',
    intro:
      'Se l’utente ti ha chiesto di installare Open Design, esegui questo protocollo nell’ordine indicato. La richiesta autorizza modifiche esclusivamente alla configurazione dei plugin e dell’MCP di Codex dell’utente. Mantieni invariati gli altri marketplace, plugin e server MCP, oltre al relativo stato di autenticazione.',
    downloadLabel: 'Pagina ufficiale di download di Open Design ↗',
    steps: [
      {
        title: 'Verifica preliminarmente l’ambiente supportato',
        body:
          'Richiedi Codex CLI 0.144.6 o versioni successive, Open Design 0.17.0 o versioni successive e l’accesso al repository canonico del marketplace. Non scaricare automaticamente un programma di installazione e non eseguire script di installazione non verificati. Se Open Design non è installato o è troppo datato, fermati e indirizza l’utente alla pagina di download ufficiale.',
      },
      {
        title: 'Controlla prima di modificare la configurazione',
        body:
          'Alla prima installazione è normale che l’MCP open-design sia assente. Se il nome del marketplace open-design punta a un’altra sorgente, fermati e segnala il conflitto. Se la versione attuale del plugin è già installata, mantienila.',
      },
      {
        title: 'Installa solo i componenti mancanti',
        body:
          'Esegui il comando del marketplace solo se il marketplace canonico è assente. Esegui il comando del plugin solo se open-design@open-design non è installato; mantieni l’installazione esistente. Un risultato alreadyAdded: true indica che l’operazione è riuscita. Non modificare manualmente la configurazione di Codex e non copiare i file del plugin nella directory home di Codex.',
      },
      {
        title: 'Assicura la disponibilità dell’MCP locale di Open Design',
        body:
          'Mantieni un MCP open-design esistente e abilitato. In caso contrario, esegui il programma di installazione MCP fornito dall’applicazione Open Design installata. Usa esclusivamente un binario od verificato di Open Design, non il comando macOS /usr/bin/od non correlato. Se la CLI non è disponibile nel PATH, usa Open Design Settings → MCP server oppure l’operazione firmata inclusa nell’applicazione --headless --mcp-install codex. Non ipotizzare mai una porta localhost e non eseguire codex mcp login; il login Vela appartiene a Open Design.',
      },
      {
        title: 'Verifica, comunica il risultato e avvia una nuova attività',
        body:
          'Verifica l’ID del plugin open-design@open-design e un MCP stdio abilitato denominato open-design. Il relativo comando deve essere un percorso di avvio assoluto di Open Design e non deve incorporare token bearer, chiavi API o credenziali Vela. Comunica ciò che è stato installato e gli eventuali prerequisiti ancora mancanti per Open Design o il login Vela. Avvia una nuova attività Codex in modo che carichi lo snapshot del plugin installato, quindi richiama @open-design.',
      },
    ],
  },
  demo: {
    title: 'Installa una volta. Crea da Codex/ChatGPT.',
    lead:
      'Guarda prima lo spazio di lavoro completo di Codex e Open Design, poi segui la sequenza reale dall’installazione al risultato.',
    overviewAlt:
      'Un’attività reale in Codex che usa il plugin Open Design accanto al sito completato del café Goodfield',
    overviewLabel: 'Attività reale in Codex',
    overviewCaption:
      'Il prompt, il passaggio a Open Design, i file generati e il sito completato restano visibili in un unico spazio di lavoro.',
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
          'Quando Codex ha completato l’installazione, apri il plugin Open Design appena installato nella nuova attività e scegli “Try now” per iniziare.',
        alt:
          'La schermata reale dei dettagli del plugin Open Design in Codex con il pulsante Try now',
      },
      {
        phase: 'Creazione',
        title: 'Scrivi il brief di design',
        body:
          'Menziona Open Design, quindi descrivi il risultato da creare, i contenuti, la direzione visiva e i requisiti responsive.',
        alt:
          'Un prompt reale in Codex che chiede a Open Design di creare il sito accogliente di un café di quartiere',
      },
      {
        phase: 'Creazione',
        title: 'Segui il passaggio in tempo reale',
        body:
          'Codex conferma la direzione, crea il progetto e passa il lavoro a Open Design, mentre i file compaiono in tempo reale.',
        alt:
          'Uno spazio di lavoro reale di Codex e Open Design durante la generazione del sito del café di quartiere',
      },
      {
        phase: 'Creazione',
        title: 'Esamina il risultato',
        body:
          'La stessa attività restituisce la landing page responsive del café Goodfield, le immagini generate e i file modificabili.',
        alt:
          'La landing page completata del café di quartiere Goodfield, generata tramite il plugin Open Design in Codex',
      },
    ],
  },
  use: {
    title: 'Parti dal prompt esatto.',
    lead:
      'Seleziona Open Design dal menu dei plugin di Codex, descrivi ciò che vuoi creare e continua a perfezionarlo dalla stessa attività. Codex mostra la menzione del plugin come un tag Open Design.',
    promptLabel: 'Prompt usato nell’attività Codex registrata',
    copyPrompt: 'Copia il prompt per Codex',
    galleryAria: 'Esempi creati con Open Design',
    templates: [
      {
        alt:
          'Landing page del prodotto Oryzo con una base da taglio materica e un oggetto in sughero',
        label: 'Lancio di prodotto',
      },
      {
        alt: 'Landing page dell’evento Open Design Osaka con una mappa tipografica',
        label: 'Pagina evento',
      },
      {
        alt: 'Sito editoriale scuro del prodotto Fable 5',
        label: 'Sito editoriale',
      },
      {
        alt: 'Interfaccia della cronologia dei modelli Open Design su una tela luminosa',
        label: 'Storia interattiva',
      },
    ],
    promptListAria: 'Esempi di prompt per Open Design Cloud',
    prompts: [
      { title: 'Sito web' },
      { title: 'Presentazioni' },
      { title: 'Prototipo' },
      { title: 'Design system' },
    ],
  },
  faq: {
    title: 'Domande prima dell’installazione',
    lead: 'Codex mantiene il controllo dell’attività. Open Design gestisce il flusso visivo.',
    items: [
      {
        q: 'Che cosa aggiunge il plugin a Codex?',
        a:
          'Aggiunge a Codex un flusso di lavoro Open Design per siti web, presentazioni, prototipi e design system. Il plugin si collega all’Open Design MCP locale per gestire brief, progetti e generazione degli artefatti.',
      },
      {
        q: 'Quali prodotti Codex sono supportati?',
        a:
          'Il pacchetto attuale supporta Codex Desktop e Codex CLI. Codex è il primo host supportato.',
      },
      {
        q: 'Che cosa serve prima dell’installazione?',
        a:
          'Usa Codex CLI 0.144.6 o una versione successiva e Open Design 0.17.0 o una versione successiva. Installa Open Design prima di registrare il relativo MCP locale.',
      },
      {
        q: 'Perché devo avviare una nuova attività in Codex?',
        a:
          'Codex carica le funzionalità del plugin e dell’MCP all’avvio di un’attività. Una nuova attività rileva il plugin Open Design Cloud appena installato.',
      },
      {
        q: 'La finestra di Open Design deve rimanere aperta?',
        a:
          'No. Quando serve, l’MCP locale registrato può avviare in background il runtime firmato di Open Design.',
      },
    ],
  },
  final: {
    aria: 'Installa Open Design Cloud in Codex/ChatGPT',
    title: 'Porta Open Design nella tua prossima attività Codex/ChatGPT.',
    bodyBeforeMention: 'Installa il plugin, collega l’MCP locale e richiama',
    bodyAfterMention: '.',
    copy: 'Copia',
    download: 'Scarica Open Design',
    source: 'Visualizza il codice sorgente',
  },
  clipboard: {
    copying: 'Copia in corso…',
    copied: 'Copiato',
    failed: 'Seleziona e copia',
  },
  schema: {
    pageName: 'Plugin Open Design Cloud per Codex/ChatGPT',
    applicationName: 'Plugin Open Design Cloud per Codex/ChatGPT',
  },
};

export default copy;
