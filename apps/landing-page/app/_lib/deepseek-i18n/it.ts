/*
 * Testi in italiano per la raccolta di design DeepSeek Harness.
 * Tradotti dalla versione inglese di riferimento.
 */
import type { DeepseekCopyOverride } from './index';

export const it: DeepseekCopyOverride = {
  collectionEyebrow: 'Raccolta curata',
  collectionHeading: 'Plugin DeepSeek Harness per il design',
  collectionLede:
    'Una raccolta curata di plugin dsh per il design: bridge di visione che leggono screenshot, canvas e UI generativa su cui l’agente può disegnare, strumenti di design review e workbench che fanno l’anteprima di tutto. DeepSeek Harness legge lo stesso formato SKILL.md di Claude Code e Codex, così la tua libreria di skill di design ti segue.',
  collectionStats: [
    { value: '13', label: 'plugin dsh selezionati' },
    { value: '13', label: 'repo di origine' },
    { value: 'SKILL.md', label: 'condiviso con Claude Code e Codex' },
  ],
  collectionIntro:
    'Ogni plugin dsh qui sotto è reale, nativo di DeepSeek Harness, individuabile tramite il topic dsh-plugin su GitHub, e rimanda alla propria fonte. Fanno quattro lavori: dare la vista all’harness solo testuale, dargli superfici di design su cui disegnare, inserire la design review nel ciclo e trasformare la sua web UI in un design workspace.',
  collectionCategoryBlurbs: [
    'Trasforma screenshot, mockup e grafici in evidenze strutturate su cui un modello solo testuale può agire.',
    'Dà all’agente superfici su cui disegnare: tele vettoriali modificabili, card UI live, slide.',
    'Chiude il ciclo: annota pagine reali, compila asset di motion, trasferisce la tua libreria di skill.',
    'Rendi l’harness stesso un design workspace: pannelli di anteprima, workbench e board accanto alla chat.',
  ],
  collectionCloserHeading: 'Salta il setup. Progetta con DeepSeek Harness dentro Open Design',
  filterAll: 'Tutti',
  collectionCloserBody:
    'Open Design è il design workspace open source e agent-native che lavora attorno a DeepSeek Harness. Tiene coerenti sistemi, skill e template, così l’agente consegna lavoro che ti appartiene.',

  categoryVision: 'Visione e input',
  categoryCanvas: 'Canvas e generative UI',
  categoryWorkflow: 'Workflow di design',
  categoryWorkspace: 'Workspace e anteprima',

  ctaDownload: 'Scarica Open Design',
  ctaStarList: 'Metti una star a DeepSeek Harness',
  ctaGuide: 'Come fare design con DeepSeek Harness',
  ctaBrowseAll: 'Sfoglia tutti i plugin',
  ctaViewSource: 'Vedi il sorgente',
  ctaOurRepo: 'deepseek-harness su GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Cosa fa',
  cardCta: 'Vedi il plugin',

  detailWhatIsIt: 'Che cos’è',
  detailWhyForDesign: 'Perché conta per il design',
  detailHowWithAgent: 'Come usarlo con DeepSeek Harness',
  detailExampleTag: 'Quando tirarlo fuori',
  detailSource: 'Fonte',
  detailCategory: 'Categoria',
  detailMaintainer: 'Autore',
  detailTags: 'Tag',
  detailLicense: 'Licenza',
  detailCovers: 'Cosa copre',
  detailUpstream: 'Dal README upstream',
  detailAgentNote: 'Compatibile con DeepSeek Harness',
  detailTraction: 'Riscontro',
  detailRepo: 'Repository di origine',
  detailStars: 'Stelle',

  installHeading: 'Come installarlo',
  installRunInAgent: 'Eseguilo in un terminale.',
  installRestart: 'Riavvia dsh web così carica il plugin.',
  installClone: 'Clona il repository.',
  installPoint: 'Punta DeepSeek Harness sul file della skill.',
  installThenUse: 'Poi descrivi il design che vuoi. L’harness attiva gli strumenti del plugin.',

  installNote:
    'Ogni plugin qui è gratuito da installare e rimanda alla sua vera fonte upstream.',
  installNoteCta: 'Esplora tutta la raccolta',
  detailMoreOnList: 'Altro nel repo di DeepSeek Harness',
  detailRelated: 'Altri plugin di design per DeepSeek Harness',
  finalEyebrow: 'Prossimo passo',
  detailCloserHeading: 'Progetta con Open Design, senza il setup',
  detailCloserBody:
    'Installa questo plugin da solo, oppure porta attorno a DeepSeek Harness un intero strato di design curato con Open Design. Usa la tua chiave, resta padrone dell’output.',

  skills: {
    modlens: {
      tagline:
        'Dà ai modelli DeepSeek solo testuali una vista plug-in: incolla uno screenshot, ottieni evidenze strutturate.',
      whatIsIt:
        'Un bridge di visione per coding agent solo testuali. Incolla un’immagine nella chat e modlens la converte in evidenze JSON strutturate — trascrizione completa, regioni di layout in ordine di lettura, entità e relazioni — invece della supposizione di un modello.',
      whyForDesign: [
        'Gli screenshot di UI diventano walkthrough elemento per elemento su cui l’agente può agire.',
        'Grafici densi e visualizzazioni dati vengono letti per intero: assi, scale, palette, regioni evidenziate.',
        'Incolla più riferimenti insieme e identifica la famiglia visiva condivisa prima di descrivere ciascuno.',
      ],
      howWithAgent: [
        'Installa il plugin; il selettore dei modelli guadagna varianti DeepSeek-V4 con la visione di modlens.',
        'Incolla uno screenshot, un mockup o un grafico direttamente nella conversazione.',
        'Fai domande di design sulle evidenze strutturate invece di ri-descrivere l’immagine.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline:
        'Dieci strumenti di visione per il ripristino di UI, grounding e verifica pixel-diff.',
      whatIsIt:
        'Un bundle nativo di DeepSeek Harness con dieci strumenti di visione: Q&A su immagini, grounding e detection con coordinate pixel, OCR di screenshot lunghi, ritaglio, estrazione dei colori, screenshot HTML e pixel diff. Gli strumenti si montano progressivamente tramite una skill vision-tools.',
      whyForDesign: [
        'Il ripristino di UI chiude il ciclo con i numeri: un workflow versionato itera una ricostruzione dal 6,04% di differenza pixel fino allo 0%.',
        'Grounding e detection restituiscono box in pixel dell’immagine originale, così l’agente agisce su coordinate invece di interpretare prosa.',
        'Infografiche e schizzi disegnati a mano diventano interfacce HTML/CSS modificabili.',
      ],
      howWithAgent: [
        'Aggiungi il plugin al tuo profilo web o headless e imposta una credenziale di visione per gli strumenti remoti.',
        'Attiva il toolkit; la skill vision-tools monta gli schemi di tutti e dieci gli strumenti.',
        'Ricostruisci un riferimento, poi verifica con vision_html_screenshot e vision_pixel_diff.',
      ],
    },
    'dsh-ui-spec': {
      tagline:
        'Trasforma screenshot di UI in spec pronte per l’implementazione: token, scala di spaziatura, griglia di layout.',
      whatIsIt:
        'Un singolo strumento analyze_ui_image che converte uno screenshot o un mockup in una spec frontend strutturata. Un livello geometrico deterministico misura dimensioni esatte, palette, design token suggeriti, griglia di layout e scala di spaziatura; un modello di visione opzionale aggiunge la semantica sopra.',
      whyForDesign: [
        'Coordinate pixel, scale di spaziatura e palette di token sono calcolate in modo deterministico, non indovinate da un modello di visione.',
        'I campi della spec mappano dritti sull’implementazione: i token suggeriti sui design token, la scala di spaziatura sul CSS.',
        'I ruoli semantici forniscono l’intento mentre la geometria fornisce il posizionamento, fusi in un’unica spec JSON + Markdown.',
      ],
      howWithAgent: [
        'Aggiungi il plugin; il livello geometrico funziona offline con zero configurazione.',
        'Facoltativamente punta il livello semantico su qualsiasi endpoint di visione compatibile OpenAI.',
        'Consegna all’agente uno screenshot e costruisci dalla spec restituita invece che dall’immagine.',
      ],
    },
    'dsh-media-skills': {
      tagline:
        'Occhi gratis e un pennello gratis: lettura di immagini incollate più generazione di immagini senza watermark.',
      whatIsIt:
        'Due skill SKILL.md e una rotta gratuita verso un modello di visione per l’harness: vision-review legge gli screenshot e coglie i bug visivi, media-tools genera illustrazioni, avatar, sfondi e banner — entrambe su modelli free-tier.',
      whyForDesign: [
        'Coglie i bug visivi di UI che un agente testuale non può vedere: sovrapposizioni, overflow, disallineamenti.',
        'Genera asset di design senza watermark su un piano gratuito, così esplorare non costa nulla.',
        'Aggiunge un bottone «Add image» alle sessioni solo testuali; le immagini incollate vengono descritte al modello corrente.',
      ],
      howWithAgent: [
        'Aggiungi il plugin e inserisci le API key gratuite nel credential store dell’harness.',
        'Riavvia dsh web; il selettore dei modelli guadagna una rotta di visione gratuita.',
        'Chiedi la review di uno screenshot, o un nuovo asset, in linguaggio naturale.',
      ],
    },
    'dsh-openpencil': {
      tagline:
        'L’agente progetta su una vera tela vettoriale modificabile invece di restituire immagini statiche.',
      whatIsIt:
        'Collega l’harness a OpenPencil, uno strumento di design vettoriale open source e AI-native. Cinque strumenti permettono all’agente di creare, modificare, renderizzare e ispezionare documenti .op design-as-code tramite batch transazionali, con anteprime multi-frame e un editor gestito per il subentro umano.',
      whyForDesign: [
        'Un unico ciclo dal requisito alla tela: l’agente modifica il documento reale e le anteprime rendono frame fedeli al design.',
        'I batch transazionali pubblicano solo in caso di successo e non sovrascrivono mai le modifiche esterne — i conflitti emergono invece di sparire.',
        'Un editor gestito con selezione, livelli, proprietà e undo permette a un umano di subentrare sull’output dell’agente in qualsiasi momento.',
      ],
      howWithAgent: [
        'Installa OpenPencil, poi aggiungi il plugin al tuo profilo web.',
        'Descrivi il design; l’agente guida openpencil_create e openpencil_edit in batch.',
        'Apri l’anteprima renderizzata o l’editor gestito e continua a iterare sul posto.',
      ],
    },
    'dsh-visualize': {
      tagline:
        'Il modello disegna card HTML interattive direttamente nel flusso della conversazione.',
      whatIsIt:
        'Uno strumento visualize più una skill di accompagnamento: il modello scrive un frammento HTML e lo monta come card interattiva sandboxed dentro la chat — simulatori, grafici, pannelli di confronto e mockup di UI, con anteprima in streaming e stile abbinato al tema.',
      whyForDesign: [
        'I mockup di UI vivono nella conversazione e si possono cliccare, non solo descrivere.',
        'Le card seguono il tema chiaro/scuro e la palette dell’host, così le anteprime sembrano native.',
        'Ogni card gira in un iframe sandboxed con una CSP rigorosa — un frammento rotto non può rompere la sessione.',
      ],
      howWithAgent: [
        'Aggiungi il plugin e riavvia dsh web.',
        'Chiedi un mockup o un confronto; il modello chiama visualize con il proprio HTML.',
        'Riproduci la sessione più tardi — le card vengono ripristinate dal risultato dello strumento persistito.',
      ],
    },
    'dsh-genui': {
      tagline:
        'Più di trenta componenti interattivi renderizzati inline nelle risposte, con un ciclo di azioni verso il modello.',
      whatIsIt:
        'Il modello descrive un’interfaccia come JSON in un fence dsh-ui; un renderer lato browser la trasforma in componenti live dentro la risposta — card, tabelle, grafici, form, tab, timeline, diff, mermaid, scene 3D — che compaiono mentre la risposta arriva in streaming.',
      whyForDesign: [
        'Le risposte diventano interfacce: pannelli dati, grafici e form si renderizzano dove avviene la spiegazione.',
        'I componenti interattivi rimandano azioni al modello, che a sua volta aggiorna la UI.',
        'Una whitelist di componenti e una guardia sulla spec fanno sì che un grafico rotto non arrivi mai a schermo.',
      ],
      howWithAgent: [
        'Aggiungi il plugin da GitHub e riavvia dsh web.',
        'Chiedi una dashboard, un quiz o un form; il modello scrive da sé il fence dsh-ui.',
        'Interagisci con il risultato — le azioni locali rispondono all’istante, quelle del modello tornano in ciclo.',
      ],
    },
    'dsh-openmaic': {
      tagline:
        'Slide, widget interattivi e intere lezioni giocabili, renderizzati da JSON scritto dall’agente.',
      whatIsIt:
        'Quattro strumenti e una skill di insegnamento socratico dal gruppo THU-MAIC: l’agente scrive JSON di slide in stile PPTist renderizzato dal renderer ufficiale di OpenMAIC, trasmette widget interattivi come card sandboxed e può inviare una richiesta di una riga che torna come aula giocabile.',
      whyForDesign: [
        'Deck di slide con testo, forme, immagini, tabelle, grafici, formule e codice — scritti come JSON nella conversazione.',
        'Simulazioni interattive e giochi si renderizzano sul posto come card sandboxed.',
        'Una lezione completa con contenuti visivi dista una sola richiesta, restituita come link giocabile.',
      ],
      howWithAgent: [
        'Aggiungi il plugin da GitHub; arriva già compilato, quindi nessun passaggio di build.',
        'Riavvia dsh web e chiedi un deck o un widget.',
        'Per le lezioni intere, openmaic_generate interroga il servizio OpenMAIC e restituisce il link dell’aula.',
      ],
    },
    'dsh-web-review': {
      tagline:
        'Punta gli elementi su una pagina live, annota visivamente, e l’agente modifica il sorgente.',
      whatIsIt:
        'Un browser integrato per la web UI dell’harness: evidenzia al passaggio e seleziona gli elementi come in uno strumento di design, allega note e prova regolazioni visive live — testo, colore, tipografia, dimensioni, spaziatura, bordi, effetti. Le annotazioni portano selettori e indizi sul sorgente così l’agente può trovare e correggere il codice.',
      whyForDesign: [
        'Puntare e annotare visivamente sostituisce il descrivere a parole i problemi di UI.',
        'Le regolazioni live mostrano in anteprima una modifica sulla pagina prima che venga toccato qualsiasi codice.',
        'Include otto skill di design integrate, da better-typography a interface-review, usabili dall’editor di annotazioni.',
      ],
      howWithAgent: [
        'Aggiungi il plugin e avvia dsh web.',
        'Apri la tua app in esecuzione nella tab Web Preview e annota cosa deve cambiare.',
        'Invia — l’agente riceve selettori, note e valori provati, e modifica il sorgente del workspace.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline:
        'Compila path SVG e keyframe in animazioni Lottie autonome dalla conversazione.',
      whatIsIt:
        'Due strumenti che trasformano i dati di design in asset di motion: lottie_compile_shape converte un path SVG in valori di forma Lottie, e lottie_compile assembla un JSON Lottie completo da una spec compatta di livelli — rettangoli, gradienti, path, immagini incorporate e testo, con animazione a keyframe per livello.',
      whyForDesign: [
        'Descrivi un’animazione di caricamento in linguaggio naturale e ottieni un .lottie.json che gira su iOS, Android e web.',
        'Le tangenti bezier in/out e l’easing dei keyframe vengono compilati, non scritti a mano.',
        'Zero passaggi di build e puro ESM: ciò che viene pubblicato è esattamente ciò che gira.',
      ],
      howWithAgent: [
        'Aggiungi il plugin da npm, oppure blocca un commit da GitHub.',
        'Descrivi il movimento: livelli, timing, easing, sfalsamento.',
        'Trascina il .lottie.json compilato in LottieWeb, lottie-ios o lottie-android.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline:
        'Le tue skill, la memoria e le istruzioni globali di Claude Code, disponibili nell’harness con zero migrazione.',
      whatIsIt:
        'Legge direttamente le posizioni standard dei file di Claude Code — niente script di migrazione, niente copie, niente symlink. Le skill di ~/.claude/skills entrano nel catalogo skill dell’harness, la memoria di progetto viene iniettata come contesto a ogni richiesta e le istruzioni globali di CLAUDE.md si trasferiscono.',
      whyForDesign: [
        'Le skill di design che già usi in Claude Code funzionano qui senza spostare un file.',
        'La memoria di progetto viene riletta a ogni richiesta, così le nuove note hanno effetto immediato.',
        'Istruzioni globali e preferenze di collaborazione vengono preservate tra gli agenti.',
      ],
      howWithAgent: [
        'Aggiungi il plugin al tuo profilo; funziona con zero configurazione.',
        'Facoltativamente puntalo su directory di skill aggiuntive come ~/.agents/skills.',
        'Invoca le tue skill esistenti per nome, come faresti in Claude Code.',
      ],
    },
    'dsh-web-ui': {
      tagline:
        'Il kit UI più grande dell’ecosistema: task board, pannello di anteprima, grafo Git e uno skin center.',
      whatIsIt:
        'Una raccolta di plugin e skin per la web UI dell’harness: una task board a cinque colonne le cui card eseguono vere sessioni agent, un pannello laterale destro con albero dei file e anteprime multi-tab, un grafo Git, controllo remoto da mobile e uno skin center per provare i temi prima di applicarli.',
      whyForDesign: [
        'Il pannello laterale destro mostra in anteprima Markdown, HTML, diff, CSV, PDF, file Office e immagini accanto alla conversazione.',
        'La task board trasforma i todo di design in card che una vera sessione agent dsh esegue e su cui riferisce.',
        'La larghezza del pannello è trascinabile e persiste per progetto, così il workspace resta come l’hai sistemato.',
      ],
      howWithAgent: [
        'Aggiungi il pacchetto aggregato al tuo profilo web per installare tutto in una volta.',
        'Apri il pannello laterale destro e fissa i file e le anteprime su cui stai lavorando.',
        'Metti i task di design sulla board e lascia che le card vengano eseguite in vere sessioni agent.',
      ],
    },
    'dsh-better-sidebar': {
      tagline:
        'Un workbench completo nella sidebar: esplora file, anteprime ricche, terminale, Git e un browser.',
      whatIsIt:
        'Un workbench a doppio pannello per la web UI dell’harness: un esplora file a caricamento lazy con editing CodeMirror, anteprime inline per immagini, Markdown, HTML, PDF e file Office, un vero terminale, un pannello Git con diff in stile VS Code, un browser sandboxed integrato e tab a pannelli divisibili trascinabili.',
      whyForDesign: [
        'Guarda in anteprima HTML, immagini e documenti prodotti dall’agente senza lasciare la conversazione.',
        'Un browser sandboxed integrato apre il tuo prototipo in esecuzione in una tab accanto alla chat.',
        'I plugin di terze parti possono registrare le proprie tab e i propri visualizzatori di file tramite la sua API di servizio.',
      ],
      howWithAgent: [
        'Installa con lo script di una riga, oppure aggiungi il pacchetto npm al tuo profilo web.',
        'Apri il workbench e disponi le tab tra la sidebar destra e il pannello inferiore.',
        'Rivedi sul posto ciò che l’agente ha costruito: anteprime, diff, terminale e tab del browser.',
      ],
    },
  },
};
