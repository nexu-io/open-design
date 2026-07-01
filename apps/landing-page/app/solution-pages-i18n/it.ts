import type { SolutionLocaleCopy } from './types';

export const IT: SolutionLocaleCopy = {
  aiWireframeGenerator: {
    title: 'Generatore di wireframe AI — dal prompt al wireframe con Open Design',
    description:
      'Un generatore di wireframe AI gratuito e open-source che trasforma un prompt in wireframe modificabili e multi-schermata — e li porta fino al codice consegnato. Open Design gira dentro l’agente di programmazione che già usi, così il wireframe e il prodotto reale condividono un’unica fonte.',
    breadcrumb: 'Generatore di wireframe AI',
    label: 'Strumento · Generatore di wireframe AI',
    heading: 'Wireframe alla velocità di un prompt',
    lead: 'Descrivi la schermata o il flusso e lascia che il tuo agente generi un wireframe pulito e modificabile — layout coerente, componenti reali, più schermate. Poi continua: lo stesso artefatto diventa un prototipo curato nello stile e codice consegnato, nell’agente che già esegui.',
    heroImageAlt:
      'Illustrazione editoriale di un prompt che si trasforma in un wireframe modificabile e poi in una UI finita, incorniciata da un riquadro di selezione verde',
    tldrTitle: 'In una riga',
    tldrBody:
      'La maggior parte dei generatori di wireframe AI ti consegna un’immagine che poi ricostruisci. Open Design genera il wireframe dentro il tuo agente di programmazione e lo porta dal prompt al codice consegnato — senza passaggio di esportazione, senza divario di consegna, senza contatore per postazione.',
    stepsTitle: 'Come funziona il generatore di wireframe AI',
    steps: [
      {
        title: 'Descrivi la schermata',
        body: 'Spiega al tuo agente cosa mettere a wireframe in linguaggio semplice — «una dashboard con una barra laterale, una riga di statistiche e una tabella delle attività recenti». Open Design carica la skill di wireframe così l’agente imposta struttura e gerarchia, non solo una singola immagine statica.',
        imageAlt: 'Illustrazione di una descrizione di schermata in linguaggio semplice digitata in un terminale',
      },
      {
        title: 'Genera wireframe modificabili',
        body: 'L’agente applica pattern di layout e componenti da un design system riutilizzabile, così ogni schermata condivide spaziatura, griglia e struttura. Ottieni wireframe modificabili e coerenti — più schermate come un insieme, non riquadri scollegati.',
        imageAlt: 'Illustrazione di più schermate di wireframe che compaiono con una griglia di layout coerente',
      },
      {
        title: 'Alza la fedeltà',
        body: 'Chiedi all’agente di portare il wireframe a un prototipo curato nello stile e cliccabile — tipografia, colore, interazioni reali. Lo stesso artefatto guadagna fedeltà invece di essere ridisegnato, così nulla va sprecato tra lo-fi e hi-fi.',
        imageAlt: 'Illustrazione di un wireframe a bassa fedeltà che si trasforma in una schermata rifinita ad alta fedeltà',
      },
      {
        title: 'Consegna il codice di cui sei proprietario',
        body: 'Poiché l’artefatto vive nel tuo progetto, il wireframe e il codice finale condividono un’unica fonte di verità. Itera parlando con l’agente; l’output è HTML/codice di cui sei proprietario e che puoi consegnare — nessun vincolo a un fornitore.',
        imageAlt: 'Illustrazione di un wireframe che confluisce nel codice consegnato, racchiuso in un riquadro di selezione verde',
      },
    ],
    tableTitle: 'Open Design rispetto ai tipici generatori di wireframe AI',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Tipici generatori di wireframe AI',
    tableRows: [
      {
        capability: 'Generare da un prompt',
        withOd: 'Un prompt nell’agente che hai già aperto',
        without: 'Registrarsi a uno strumento web separato, generare nel loro cloud',
      },
      {
        capability: 'Più schermate collegate',
        withOd: 'Generate come insieme con layout e componenti condivisi',
        without: 'Spesso una schermata alla volta',
      },
      {
        capability: 'Da lo-fi a hi-fi',
        withOd: 'Lo stesso artefatto guadagna fedeltà — wireframe → prototipo → codice',
        without: 'Il wireframe è un vicolo cieco; si ricostruisce per hi-fi e per il codice',
      },
      {
        capability: 'Possedere l’output',
        withOd: 'File e codice semplici nel tuo repo, completamente tuoi',
        without: 'Modificabile solo dentro la loro app; esportazione limitata',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, porta le tue chiavi, gira in locale',
        without: 'Abbonamento per postazione o per credito, ospitato dal fornitore',
      },
    ],
    featuresTitle: 'Cosa puoi mettere a wireframe',
    features: [
      {
        title: 'Schermate di web app',
        body: 'Dashboard, impostazioni, flussi multi-schermata — messi a wireframe come insieme coerente, poi portati al codice.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Flussi di app mobile',
        body: 'Percorsi mobile schermata per schermata con struttura e stati coerenti.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landing page SaaS',
        body: 'Layout di landing marketing e SaaS che puoi mettere a wireframe, stilizzare e consegnare.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Onboarding e form',
        body: 'Onboarding multi-passaggio, registrazione e flussi di form impostati con una gerarchia chiara.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: 'Qualsiasi gusto visivo',
        body: 'Parti lo-fi, poi porta uno stile coerente dall’inizio alla fine — editoriale, morbido o audace.',
        thumb: 'example-gamified-app',
      },
      {
        title: 'Landing e conversione',
        body: 'Layout di hero, prezzi e lista d’attesa cablati e in linea col brand fin dal primo passaggio.',
        thumb: 'example-kami-landing',
      },
    ],
    galleryTitle: 'Wireframe creati con Open Design',
    galleryLead:
      'Ognuno è partito come un prompt e si è renderizzato in un artefatto modificabile e cliccabile. Scegli un template vicino alla tua idea, descrivi la tua variazione e l’agente lo adatta — dal wireframe al codice consegnato.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'App web di incontri — wireframe multi-schermata' },
      { thumb: 'example-hr-onboarding', caption: 'Flusso di onboarding HR' },
      { thumb: 'example-kami-landing', caption: 'Layout di landing di prodotto' },
      { thumb: 'example-web-prototype-taste-soft', caption: 'Wireframe web in stile morbido' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ sul generatore di wireframe AI',
    faq: [
      {
        q: 'Il generatore di wireframe AI è gratuito?',
        a: 'Sì. Open Design è open source e gira dentro l’agente di programmazione che già usi con le tue chiavi di provider — non c’è alcun contatore per postazione o per credito sul generatore di wireframe stesso.',
      },
      {
        q: 'I wireframe sono modificabili o solo immagini?',
        a: 'Modificabili. L’output è HTML e codice reali, così puoi affinare layout, componenti e contenuto parlando con l’agente — non pixel cotti in un’immagine che dovresti ricostruire.',
      },
      {
        q: 'Un wireframe può diventare un prototipo hi-fi e codice reale?',
        a: 'È proprio il punto. Lo stesso artefatto guadagna fedeltà — dal wireframe al prototipo curato nello stile al codice consegnato — perché vive nel tuo progetto, invece di essere ridisegnato a ogni fase.',
      },
      {
        q: 'Con quali agenti funziona?',
        a: 'Open Design funziona con Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi di provider; nulla è ospitato per te.',
      },
    ],
    ctaTitle: 'Genera il tuo primo wireframe stasera',
    ctaBody:
      'Metti una stella al repo, installa Open Design e trasforma la tua prossima idea di schermata in un wireframe modificabile — e poi in codice consegnato — nell’agente che già usi.',
    relatedTitle: 'Strumenti e guide correlati',
    related: [
      { href: '/solutions/ai-ui-generator/', label: 'Generatore di UI AI' },
      { href: '/solutions/design-to-code/', label: 'Dal design al codice con Open Design' },
      { href: '/blog/design-to-code-tools/', label: 'I migliori strumenti dal design al codice' },
      { href: '/solutions/prototype/', label: 'Prototipazione con Open Design' },
    ],
  },
  aiUiGenerator: {
    title: 'Generatore di UI AI — dal prompt alla UI di produzione con Open Design',
    description:
      'Un generatore di UI AI gratuito e open-source che trasforma un prompt in un’interfaccia reale, basata su componenti — e la porta fino al codice consegnato. Open Design gira dentro l’agente di programmazione che già usi, così la UI generata e il codice di produzione sono lo stesso artefatto.',
    breadcrumb: 'Generatore di UI AI',
    label: 'Strumento · Generatore di UI AI',
    heading: 'Genera UI che puoi davvero consegnare',
    lead: 'Descrivi l’interfaccia e lascia che il tuo agente generi una UI reale, basata su componenti — design system coerente, layout responsivo, stati funzionanti. Poi continua: lo stesso artefatto diventa codice consegnato, nell’agente che già esegui.',
    heroImageAlt:
      'Illustrazione editoriale di un prompt che si trasforma in una UI basata su componenti e poi in codice di produzione, incorniciata da un riquadro di selezione verde',
    tldrTitle: 'In una riga',
    tldrBody:
      'La maggior parte dei generatori di UI AI ti dà un mockup o uno snippet React usa e getta. Open Design genera la UI dentro il tuo agente di programmazione e la porta dal prompt al codice consegnato — componenti reali, il tuo design system, senza passaggio di esportazione, senza contatore per postazione.',
    stepsTitle: 'Come funziona il generatore di UI AI',
    steps: [
      {
        title: 'Descrivi l’interfaccia',
        body: 'Spiega al tuo agente cosa costruire in linguaggio semplice — «una pagina di impostazioni con una barra laterale, sezioni a schede e una barra di salvataggio». Open Design carica la skill di UI così l’agente attinge a componenti reali e a un design system, non a una schermata isolata.',
        imageAlt: 'Illustrazione di una descrizione di UI in linguaggio semplice digitata in un terminale',
      },
      {
        title: 'Genera una UI basata su componenti',
        body: 'L’agente assembla l’interfaccia da componenti riutilizzabili e token di design, così spaziatura, scala tipografica e colore restano coerenti su ogni schermata. Ottieni una UI coerente — non un cumulo di stili inline da districare.',
        imageAlt: 'Illustrazione di una UI che si assembla da blocchi di componenti riutilizzabili su una griglia',
      },
      {
        title: 'Affina parlando',
        body: 'Regola layout, stati e tema in conversazione — «stringi la spaziatura», «aggiungi uno stato vuoto», «rendilo scuro di default». L’artefatto si aggiorna sul posto invece di essere rigenerato da zero.',
        imageAlt: 'Illustrazione di una UI che viene affinata via chat, con sottili stati prima/dopo',
      },
      {
        title: 'Consegna il codice di cui sei proprietario',
        body: 'Poiché la UI vive nel tuo progetto, il design e il codice di produzione condividono un’unica fonte di verità. L’output è HTML/codice di cui sei proprietario e che puoi consegnare — nessun vincolo a un fornitore, nessun ridisegno tra design e build.',
        imageAlt: 'Illustrazione di una UI generata che confluisce nel codice consegnato, racchiusa in un riquadro di selezione verde',
      },
    ],
    tableTitle: 'Open Design rispetto ai tipici generatori di UI AI',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Tipici generatori di UI AI',
    tableRows: [
      {
        capability: 'Generare da un prompt',
        withOd: 'Un prompt nell’agente che hai già aperto',
        without: 'Registrarsi a uno strumento web separato, generare nel loro cloud',
      },
      {
        capability: 'Componenti reali',
        withOd: 'Costruiti da un design system riutilizzabile, coerenti su tutte le schermate',
        without: 'Markup isolato o stili inline che rifattorizzi dopo',
      },
      {
        capability: 'Dal design al codice',
        withOd: 'Lo stesso artefatto diventa codice consegnato — nessun ridisegno',
        without: 'Il mockup della UI è un vicolo cieco; si ricostruisce per la produzione',
      },
      {
        capability: 'Possedere l’output',
        withOd: 'File e codice semplici nel tuo repo, completamente tuoi',
        without: 'Modificabile solo dentro la loro app; esportazione limitata',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, porta le tue chiavi, gira in locale',
        without: 'Abbonamento per postazione o per credito, ospitato dal fornitore',
      },
    ],
    featuresTitle: 'Cosa puoi generare',
    features: [
      {
        title: 'Interfacce di web app',
        body: 'Dashboard, impostazioni, tabelle dati — generate come insieme coerente di componenti, poi portate al codice.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'UI di app mobile',
        body: 'Interfacce mobile schermata per schermata con componenti e stati coerenti.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Pagine SaaS e marketing',
        body: 'UI di landing, prezzi e marketing che puoi generare, applicare un tema e consegnare.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Form e flussi',
        body: 'Form multi-passaggio, onboarding e flussi di autenticazione con gerarchia e stati chiari.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: 'Design system',
        body: 'Genera UI che rispetta un design system condiviso — token, componenti, spaziatura.',
        thumb: 'example-gamified-app',
      },
      {
        title: 'Qualsiasi gusto visivo',
        body: 'Editoriale, morbido o audace — porta uno stile coerente dall’inizio alla fine.',
        thumb: 'example-kami-landing',
      },
    ],
    galleryTitle: 'UI create con Open Design',
    galleryLead:
      'Ognuna è partita come un prompt e si è renderizzata in un artefatto reale, basato su componenti. Scegli un template vicino alla tua idea, descrivi la tua variazione e l’agente lo adatta — dalla UI al codice consegnato.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'App web di incontri — UI basata su componenti' },
      { thumb: 'example-hr-onboarding', caption: 'Flusso di onboarding HR' },
      { thumb: 'example-kami-landing', caption: 'UI di landing di prodotto' },
      { thumb: 'example-web-prototype-taste-soft', caption: 'UI web in stile morbido' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ sul generatore di UI AI',
    faq: [
      {
        q: 'Il generatore di UI AI è gratuito?',
        a: 'Sì. Open Design è open source e gira dentro l’agente di programmazione che già usi con le tue chiavi di provider — non c’è alcun contatore per postazione o per credito sul generatore di UI stesso.',
      },
      {
        q: 'Genera componenti reali o solo un mockup?',
        a: 'Componenti reali. L’output è HTML e codice costruiti da un design system riutilizzabile, così affini layout, stati e tema parlando con l’agente invece di ricostruire un mockup piatto.',
      },
      {
        q: 'La UI generata può diventare codice di produzione?',
        a: 'È il punto. Lo stesso artefatto diventa codice consegnato perché vive nel tuo progetto — non c’è ridisegno né divario di consegna tra la UI generata e ciò che distribuisci.',
      },
      {
        q: 'Con quali agenti funziona?',
        a: 'Open Design funziona con Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi di provider; nulla è ospitato per te.',
      },
    ],
    ctaTitle: 'Genera la tua prima UI stasera',
    ctaBody:
      'Metti una stella al repo, installa Open Design e trasforma la tua prossima idea di interfaccia in una UI reale, basata su componenti — e poi in codice consegnato — nell’agente che già usi.',
    relatedTitle: 'Strumenti e guide correlati',
    related: [
      { href: '/solutions/ai-wireframe-generator/', label: 'Generatore di wireframe AI' },
      { href: '/solutions/design-to-code/', label: 'Dal design al codice con Open Design' },
      { href: '/blog/best-ai-design-tools/', label: 'I migliori strumenti di design AI' },
      { href: '/solutions/designer/', label: 'Open Design per i designer' },
    ],
  },
  designToCode: {
    title: 'Dal design al codice — trasforma un design in codice consegnato con Open Design',
    description:
      'Un flusso di lavoro dal design al codice gratuito e open-source che trasforma un prompt o un design in codice reale e modificabile — dentro l’agente di programmazione che già usi. Niente esportazione, niente consegna: il design e il codice di produzione sono un unico artefatto di cui sei proprietario e che consegni.',
    breadcrumb: 'Dal design al codice',
    label: 'Strumento · Dal design al codice',
    heading: 'Dal design al codice, senza passaggio di consegna',
    lead: 'Descrivi la schermata, o porta un design, e lascia che il tuo agente lo trasformi in codice pulito e basato su componenti — layout responsivo, stati reali, il tuo stack. Il design e il codice sono lo stesso artefatto, così nulla si perde nella traduzione.',
    heroImageAlt:
      'Illustrazione editoriale di un design che si trasforma in codice di produzione pulito, incorniciato da un riquadro di selezione verde',
    tldrTitle: 'In una riga',
    tldrBody:
      'La maggior parte degli strumenti dal design al codice esporta un’istantanea una tantum che poi devi accudire. Open Design mantiene il design e il codice come un unico artefatto vivo dentro il tuo agente — itera parlando, consegna codice di cui sei proprietario, senza contatore per postazione.',
    stepsTitle: 'Come funziona il passaggio dal design al codice',
    steps: [
      {
        title: 'Parti da un prompt o da un design',
        body: 'Descrivi la schermata in linguaggio semplice, o indica al tuo agente una direzione di design. Open Design carica la skill giusta così l’agente costruisce struttura e componenti, non una conversione fragile e isolata.',
        imageAlt: 'Illustrazione di un design e di un prompt che confluiscono in un terminale',
      },
      {
        title: 'Genera codice basato su componenti',
        body: 'L’agente produce codice pulito e leggibile costruito da componenti riutilizzabili e token di design — spaziatura, tipografia e colore coerenti — invece di un muro di markup generato che dovresti rifattorizzare.',
        imageAlt: 'Illustrazione di un design che si converte in codice strutturato e basato su componenti',
      },
      {
        title: 'Itera in conversazione',
        body: 'Affina layout, stati e comportamento parlando — «rendilo responsivo», «cabla il form», «allinea ai nostri token». Il codice si aggiorna sul posto; il design resta sincronizzato perché sono un unico artefatto.',
        imageAlt: 'Illustrazione di codice che viene affinato via chat mentre il design resta sincronizzato',
      },
      {
        title: 'Consegna il codice di cui sei proprietario',
        body: 'L’output è HTML/codice nel tuo repo, completamente tuo — senza passaggio di esportazione, senza editor vincolato a un fornitore, senza ridisegno tra design e build. Consegnalo, poi continua a evolverlo nell’agente.',
        imageAlt: 'Illustrazione di codice finito racchiuso in un riquadro di selezione verde, pronto da consegnare',
      },
    ],
    tableTitle: 'Open Design rispetto ai tipici strumenti dal design al codice',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Tipici strumenti dal design al codice',
    tableRows: [
      {
        capability: 'Avviare la conversione',
        withOd: 'Un prompt nell’agente che hai già aperto',
        without: 'Installare un plugin o caricare su uno strumento web separato',
      },
      {
        capability: 'Qualità del codice',
        withOd: 'Codice pulito e basato su componenti da un design system',
        without: 'Markup a posizionamento assoluto o isolato che riscrivi',
      },
      {
        capability: 'Sincronizzazione design ↔ codice',
        withOd: 'Un unico artefatto — design e codice non divergono mai',
        without: 'Un’esportazione una tantum che invecchia dopo la prima modifica',
      },
      {
        capability: 'Possedere l’output',
        withOd: 'File e codice semplici nel tuo repo, completamente tuoi',
        without: 'Vincolato al loro editor o alla loro libreria di componenti',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, porta le tue chiavi, gira in locale',
        without: 'Abbonamento per postazione o per credito, ospitato dal fornitore',
      },
    ],
    featuresTitle: 'Cosa puoi convertire',
    features: [
      {
        title: 'Dal prompt al codice',
        body: 'Descrivi una schermata e ottieni codice pulito e basato su componenti nel tuo stack.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Dal wireframe al codice',
        body: 'Porta un wireframe generato fino al codice consegnato — stesso artefatto.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Dalla UI alla produzione',
        body: 'Trasforma una UI generata in codice di produzione responsivo e con stati reali.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Landing page',
        body: 'Sezioni di hero, prezzi e lista d’attesa convertite in codice pulito e in linea col brand.',
        thumb: 'example-kami-landing',
      },
      {
        title: 'Form e flussi',
        body: 'Form multi-passaggio e onboarding cablati con validazione e stati reali.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: 'Qualsiasi gusto visivo',
        body: 'Editoriale, morbido o audace — il codice porta uno stile coerente dall’inizio alla fine.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Consegnato dal design con Open Design',
    galleryLead:
      'Ognuno è partito come un prompt o un design ed è diventato codice che puoi consegnare. Scegli un template vicino alla tua idea, descrivi la tua variazione e l’agente lo converte — dal design al codice, senza passaggio di consegna.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'App web di incontri — dal design al codice' },
      { thumb: 'example-hr-onboarding', caption: 'Flusso di onboarding HR' },
      { thumb: 'example-kami-landing', caption: 'Landing di prodotto in codice' },
      { thumb: 'example-web-prototype-taste-soft', caption: 'Build web in stile morbido' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ sul passaggio dal design al codice',
    faq: [
      {
        q: 'Il flusso di lavoro dal design al codice è gratuito?',
        a: 'Sì. Open Design è open source e gira dentro l’agente di programmazione che già usi con le tue chiavi di provider — non c’è alcun contatore per postazione o per credito sul flusso di lavoro dal design al codice stesso.',
      },
      {
        q: 'Che tipo di codice produce?',
        a: 'HTML e codice puliti e basati su componenti costruiti da un design system riutilizzabile, così puoi leggerlo, affinarlo e consegnarlo — non markup a posizionamento assoluto che dovresti riscrivere.',
      },
      {
        q: 'Il design e il codice restano sincronizzati?',
        a: 'Sì — sono un unico artefatto. Poiché il design e il codice vivono insieme nel tuo progetto, non c’è un’esportazione una tantum che invecchia dopo la tua prima modifica.',
      },
      {
        q: 'Con quali agenti funziona?',
        a: 'Open Design funziona con Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi di provider; nulla è ospitato per te.',
      },
    ],
    ctaTitle: 'Trasforma il tuo prossimo design in codice stasera',
    ctaBody:
      'Metti una stella al repo, installa Open Design e trasforma la tua prossima schermata — prompt, wireframe o design — in codice pulito e pronto da consegnare nell’agente che già usi.',
    relatedTitle: 'Strumenti e guide correlati',
    related: [
      { href: '/solutions/ai-wireframe-generator/', label: 'Generatore di wireframe AI' },
      { href: '/solutions/ai-ui-generator/', label: 'Generatore di UI AI' },
      { href: '/blog/design-to-code-tools/', label: 'I migliori strumenti dal design al codice' },
      { href: '/solutions/engineering/', label: 'Open Design per l’ingegneria' },
    ],
  },
  prototype: {
    title: 'Crea prototipi interattivi con Open Design + Claude Code',
    description:
      'Trasforma un prompt in un prototipo cliccabile e multi-schermata senza uscire dal terminale. Open Design fornisce al tuo agente di programmazione le competenze di design, i template e il design system per consegnare prototipi reali che apri nel browser.',
    breadcrumb: 'Prototipo',
    label: 'Caso d’uso · Prototipo',
    heading: 'Prototipa alla velocità di un prompt',
    lead: 'Descrivi il flusso che hai in mente e lascia che il tuo agente assembli un prototipo reale e cliccabile — più schermate, stili condivisi e interazioni dal vivo — renderizzato direttamente in HTML che puoi aprire, condividere e consegnare al team di ingegneria.',
    heroImageAlt:
      'Illustrazione editoriale di una mano che abbozza un wireframe che si trasforma in un prototipo di app cliccabile e multi-schermata',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design è il livello di design per l’agente di programmazione che già usi. Per la prototipazione significa passare da un’idea di un paragrafo a un prototipo navigabile e curato nello stile in una sola sessione — senza strumento di design, senza passaggio di esportazione, senza divario di consegna.',
    stepsTitle: 'Come funziona la prototipazione con Open Design',
    steps: [
      {
        title: 'Descrivi il flusso',
        body: 'Spiega al tuo agente cosa stai costruendo in linguaggio semplice — «un flusso di onboarding con una schermata di benvenuto, un selettore di piani e una conferma». Open Design carica la skill di prototipo così l’agente sa di dover produrre schermate, non una singola pagina.',
        imageAlt:
          'Illustrazione di una persona che digita in un terminale una descrizione in linguaggio semplice del flusso di un’app',
      },
      {
        title: 'Genera schermate curate nello stile',
        body: 'L’agente applica un design system e i template di prototipo di Open Design, così ogni schermata condivide tipografia, spaziatura e componenti invece di sembrare una bozza. Ottieni un insieme coerente di schermate, non mockup scollegati.',
        imageAlt:
          'Illustrazione di più schermate di app che compaiono in sequenza, tutte con un unico stile visivo coerente',
      },
      {
        title: 'Collega le interazioni',
        body: 'I pulsanti navigano, le schede cambiano, i modali si aprono. Il prototipo viene renderizzato in HTML autonomo, così si comporta come il prodotto reale in qualsiasi browser — non serve un account in uno strumento di prototipazione per visualizzarlo.',
        imageAlt:
          'Illustrazione di un cursore che clicca tra schermate collegate con frecce che mostrano la navigazione tra di esse',
      },
      {
        title: 'Itera e consegna',
        body: 'Affina parlando con l’agente — «metti il selettore di piani su un layout a tre colonne». Poiché l’artefatto vive nel tuo progetto, il design e il codice finale condividono un’unica fonte di verità, colmando il consueto divario di consegna tra designer e ingegnere.',
        imageAlt:
          'Illustrazione di un prototipo che viene revisionato e poi passato a un ingegnere, con design e codice che si fondono in un unico file',
      },
    ],
    tableTitle: 'Prototipazione con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Strumenti di prototipazione tradizionali',
    tableRows: [
      {
        capability: 'Passare dall’idea alla prima schermata',
        withOd: 'Un prompt nell’agente che hai già aperto',
        without: 'Aprire uno strumento separato, avviare un file, trascinare i riquadri a mano',
      },
      {
        capability: 'Più schermate collegate',
        withOd: 'Generate come insieme con stili condivisi e navigazione funzionante',
        without: 'Ogni schermata disegnata e collegata manualmente',
      },
      {
        capability: 'Sistema visivo coerente',
        withOd: 'Preso da un design system riutilizzabile che l’agente applica',
        without: 'Ricreato per ogni file o mantenuto a mano',
      },
      {
        capability: 'Risultato condivisibile',
        withOd: 'HTML autonomo — si apre in qualsiasi browser, senza account',
        without: 'Chi visualizza ha bisogno di una licenza o di un link di condivisione nello strumento del fornitore',
      },
      {
        capability: 'Percorso verso il codice reale',
        withOd: 'L’artefatto vive nel tuo repository; design e codice condividono una fonte',
        without: 'Ricostruito da zero dopo una consegna separata',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Abbonamento a postazione, ospitato dal fornitore, esportazione limitata',
      },
    ],
    featuresTitle: 'Cosa puoi prototipare',
    features: [
      {
        title: 'App web multi-schermata',
        body: 'Flussi completi con navigazione condivisa — onboarding, dashboard, impostazioni — non singole pagine.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Flussi di app mobili',
        body: 'Percorsi mobili schermata per schermata con transizioni e stati dal sapore nativo.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landing page',
        body: 'Pagine di marketing e landing SaaS che puoi percorrere e pubblicare.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Qualsiasi gusto visivo',
        body: 'Editoriale, soft o brutalista — il prototipo porta uno stile coerente dall’inizio alla fine.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista d’attesa e prezzi',
        body: 'Superfici di conversione — liste d’attesa, tabelle prezzi — collegate e in linea con il brand.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Giocoso e gamificato',
        body: 'Concept ricchi di interazione dove movimento e stato fanno parte della proposta.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototipi che le persone hanno creato con Open Design',
    galleryLead:
      'Ognuno di questi è partito come un prompt ed è stato renderizzato in un artefatto cliccabile. Scegli un template vicino alla tua idea, descrivi la tua variante e l’agente lo adatta.',
    gallery: [
      { thumb: "example-dating-web", caption: "App web di incontri — flusso multi-schermata" },
      { thumb: "example-hr-onboarding", caption: "Flusso di onboarding HR" },
      { thumb: "example-kami-landing", caption: "Landing page di prodotto" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototipo web in stile soft" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di prototipo',
    faqTitle: 'FAQ sulla prototipazione',
    faq: [
      {
        q: 'Mi serve uno strumento di design come Figma per prototipare con Open Design?',
        a: 'No. Open Design gira dentro il tuo agente di programmazione e renderizza i prototipi in HTML. Descrivi il flusso a parole; l’agente produce le schermate. Non c’è uno strumento di canvas separato da imparare o pagare.',
      },
      {
        q: 'I prototipi sono interattivi o solo mockup statici?',
        a: 'Interattivi. Navigazione, schede e modali funzionano perché l’output è HTML e CSS reali. Puoi percorrerli in qualsiasi browser esattamente come farebbe un utente.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Open Design funziona con Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi del provider; nulla viene ospitato per te.',
      },
      {
        q: 'Un prototipo può diventare il prodotto reale?',
        a: 'È proprio questo il punto. L’artefatto vive nel tuo progetto, così lo stesso design system e i componenti proseguono nel codice di produzione invece di essere buttati via dopo una consegna.',
      },
    ],
    ctaTitle: 'Prototipa la tua prossima idea stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma il tuo prossimo «e se...» in qualcosa che puoi cliccare — nell’agente che già usi.',
  },
  dashboard: {
    title: 'Genera dashboard di dati con Open Design + Claude Code',
    description:
      'Descrivi le metriche che monitori e lascia che il tuo agente di programmazione costruisca una dashboard curata nello stile e responsive — grafici, schede KPI e tabelle renderizzate in HTML che ospiti ovunque. Senza postazione di uno strumento di BI, senza costruttore drag-and-drop.',
    breadcrumb: 'Dashboard',
    label: 'Caso d’uso · Dashboard',
    heading: 'Dashboard da una descrizione, non da un costruttore drag-and-drop',
    lead: 'Di’ al tuo agente cosa mostrare e che effetto deve fare. Open Design fornisce i pattern dei grafici, il sistema di layout e il linguaggio visivo così ottieni una dashboard coerente e presentabile — non un muro di widget con lo stile predefinito.',
    heroImageAlt:
      'Illustrazione editoriale di numeri grezzi a sinistra che confluiscono in una dashboard pulita di grafici e schede KPI a destra',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma una specifica in linguaggio semplice delle tue metriche in una dashboard curata nello stile che il tuo agente renderizza in HTML — versionata nel tuo repository, ospitabile ovunque, senza abbonamento di BI a postazione.',
    stepsTitle: 'Come funzionano le dashboard con Open Design',
    steps: [
      {
        title: 'Descrivi le metriche',
        body: 'Elenca cosa conta — «utenti attivi settimanali, ricavi per piano, abbandono e un trend a 30 giorni». L’agente carica la skill di dashboard così sa di dover disporre schede KPI, grafici e una tabella invece di un singolo blocco di testo.',
        imageAlt: 'Illustrazione di una persona che elenca le metriche a cui tiene',
      },
      {
        title: 'Scegli i pattern dei grafici',
        body: 'Open Design include template di grafico e layout, così i trend diventano grafici a linee, le suddivisioni diventano barre e i rapporti la visualizzazione giusta — tipografia e spaziatura coerenti ovunque invece di impostazioni predefinite disomogenee.',
        imageAlt: 'Illustrazione di vari tipi di grafico disposti in una griglia coerente',
      },
      {
        title: 'Collega i tuoi dati',
        body: 'Punta la dashboard a un CSV, a un endpoint JSON o incolla righe di esempio. Si renderizza in HTML autonomo che si aggiorna quando lo fanno i dati — aprila in qualsiasi browser, mettila su qualsiasi hosting statico.',
        imageAlt: 'Illustrazione di un file di dati che si collega a una dashboard con aggiornamento dal vivo',
      },
      {
        title: 'Affina e pubblica',
        body: 'Regola parlando con l’agente — «raggruppa i ricavi per regione, sposta la riga dei KPI in alto». L’artefatto vive nel tuo progetto, così la dashboard è revisionabile e versionabile come qualsiasi altro codice.',
        imageAlt: 'Illustrazione di una dashboard che viene affinata e poi distribuita',
      },
    ],
    tableTitle: 'Dashboard con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Strumenti di BI / scritto a mano',
    tableRows: [
      {
        capability: 'Passare dalla lista delle metriche al layout',
        withOd: 'Un prompt; l’agente dispone schede, grafici e tabelle',
        without: 'Trascinare i widget uno per uno, o scrivere il codice dei grafici da zero',
      },
      {
        capability: 'Sistema visivo coerente',
        withOd: 'Pattern dei grafici e spaziatura da un design system riutilizzabile',
        without: 'Stili widget predefiniti, o stile a mano per ogni grafico',
      },
      {
        capability: 'Collegare i dati',
        withOd: 'CSV / JSON / righe incollate, renderizzato in HTML dal vivo',
        without: 'Connettori del fornitore o impianti dati su misura',
      },
      {
        capability: 'Hosting e condivisione',
        withOd: 'HTML autonomo su qualsiasi hosting statico, senza account',
        without: 'Chi visualizza ha bisogno di una postazione nel fornitore di BI',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'Vive nel tuo repository; confrontabile come codice',
        without: 'Bloccato dentro il fornitore, senza diff reale',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Abbonamento a postazione, ospitato dal fornitore',
      },
    ],
    featuresTitle: "Cosa puoi costruire",
    features: [
      { title: "Analytics di prodotto", body: "Utenti attivi, funnel, retention — le metriche in cui vive un team di prodotto.", thumb: "example-dashboard" },
      { title: "Metriche di repository e dev", body: "Stelle, PR, salute della CI — dashboard di ingegneria dai tuoi stessi dati.", thumb: "example-github-dashboard" },
      { title: "Report finanziari", body: "Ricavi, burn e autonomia di cassa disposti come un report da condividere.", thumb: "example-finance-report" },
      { title: "Operazioni dal vivo", body: "Metriche in tempo reale che si aggiornano man mano che i dati sottostanti si muovono.", thumb: "example-live-dashboard" },
      { title: "Social e marketing", body: "Performance dei canali e monitoraggio delle campagne in un’unica vista.", thumb: "example-social-media-dashboard" },
      { title: "Report di settore", body: "Report strutturati per qualsiasi ambito — dal clinico al trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboard che le persone hanno creato con Open Design',
    galleryLead:
      'Dashboard reali renderizzate da un prompt e da una fonte di dati. Parti da una vicina alla tua e descrivi le metriche che monitori.',
    gallery: [
      { thumb: "example-data-report", caption: "Report di dati" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard di operazioni dal vivo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard di analisi del trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafico dati editoriale" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di dashboard',
    faqTitle: 'FAQ sulle dashboard',
    faq: [
      {
        q: 'Mi serve uno strumento di BI come Tableau o Looker?',
        a: 'No. Open Design renderizza le dashboard in HTML dentro il tuo agente di programmazione. Descrivi le metriche e lo punti ai tuoi dati; non c’è una piattaforma di BI separata da licenziare o imparare.',
      },
      {
        q: 'Da dove vengono i dati?',
        a: 'Da un CSV, da un endpoint JSON o da righe che incolli. La dashboard è HTML e JavaScript puri, così controlli esattamente da dove legge — nulla passa attraverso un servizio ospitato.',
      },
      {
        q: 'I colleghi non tecnici possono visualizzarla?',
        a: 'Sì. L’output è una pagina web autonoma. Chiunque abbia il link o il file può aprirla in un browser — senza account, senza postazione.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Costruisci la tua dashboard stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma le tue metriche in una dashboard che puoi ospitare ovunque — nell’agente che già usi.',
  },
  slides: {
    title: 'Genera presentazioni con Open Design + Claude Code',
    description:
      'Trasforma una scaletta in una presentazione progettata e in linea con il brand senza aprire un’app di presentazioni. Open Design fornisce al tuo agente di programmazione template di slide e un sistema visivo, renderizzando le slide in HTML che puoi presentare, esportare o condividere.',
    breadcrumb: 'Slide',
    label: 'Caso d’uso · Slide',
    heading: 'Presentazioni dall’aria progettata, scritte da un prompt',
    lead: 'Consegna al tuo agente una scaletta e un tono. Open Design applica un template di presentazione e un sistema visivo così ogni slide è impaginata, composta e in linea con il brand — non un elenco puntato su uno sfondo vuoto.',
    heroImageAlt:
      'Illustrazione editoriale di una scaletta a sinistra che si trasforma in una sequenza di slide di presentazione progettate a destra',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma una scaletta in una presentazione HTML progettata che il tuo agente renderizza in una sola sessione — presentala nel browser, esportala in PDF o PPTX e conserva la fonte nel tuo repository.',
    stepsTitle: 'Come funzionano le presentazioni con Open Design',
    steps: [
      {
        title: 'Dagli la scaletta',
        body: 'Incolla i tuoi punti chiave o una struttura approssimativa. L’agente carica la skill di presentazione così produce una sequenza di slide impaginate, non un unico documento lungo.',
        imageAlt: 'Illustrazione di una scaletta testuale consegnata a un agente',
      },
      {
        title: 'Scegli uno stile di presentazione',
        body: 'Open Design include template di presentazione — editoriale, svizzero-internazionale, tecnico scuro e altri. L’agente ne applica uno così tipografia, griglia e accenti restano coerenti su ogni slide.',
        imageAlt: 'Illustrazione di varie opzioni di stile di presentazione disposte una accanto all’altra',
      },
      {
        title: 'Genera le slide',
        body: 'Ogni punto diventa una slide progettata con la giusta gerarchia — titoli, supporti visivi, evidenze di dati. Si renderizza in HTML, così si presenta a schermo intero in qualsiasi browser.',
        imageAlt: 'Illustrazione di una sequenza di slide finite con uno stile coerente',
      },
      {
        title: 'Presenta, esporta, itera',
        body: 'Presenta dal browser, o esporta in PDF / PPTX per condividere. Affina parlando con l’agente — «stringi la slide dei dati, aggiungi una call to action di chiusura». La fonte della presentazione resta nel tuo progetto.',
        imageAlt: 'Illustrazione di una presentazione che viene presentata ed esportata in più formati',
      },
    ],
    tableTitle: 'Presentazioni con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'PowerPoint / Keynote / strumenti di IA per slide',
    tableRows: [
      {
        capability: 'Passare dalla scaletta alle slide',
        withOd: 'Un prompt; l’agente impagina ogni slide',
        without: 'Costruire ogni slide a mano, o lottare con un template',
      },
      {
        capability: 'Design coerente',
        withOd: 'Template di presentazione con una vera griglia e un sistema tipografico',
        without: 'Deriva del tema, allineamento manuale, impostazioni fuori brand',
      },
      {
        capability: 'Dati e diagrammi',
        withOd: 'Grafici ed evidenze renderizzati come parte della slide',
        without: 'Incollare immagini statiche o rifare i grafici ogni volta',
      },
      {
        capability: 'Formati di esportazione',
        withOd: 'HTML per presentare, più esportazione in PDF / PPTX',
        without: 'Vincolato al formato di una singola app',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'La fonte vive nel tuo repository, confrontabile',
        without: 'File binario, senza diff significativo',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Licenza dell’app o add-on di IA a postazione',
      },
    ],
    featuresTitle: "Cosa puoi presentare",
    features: [
      { title: "Pitch deck", body: "Presentazioni per investitori e vendite con una narrazione forte e slide di dati pulite.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Svizzero / editoriale", body: "Presentazioni tipografiche guidate dalla griglia che sembrano curate da un art director.", thumb: "example-deck-swiss-international" },
      { title: "Moduli di corso", body: "Presentazioni didattiche con passaggi chiari, evidenze e ritmo.", thumb: "example-html-ppt-course-module" },
      { title: "Presentazioni con grafici di dati", body: "Presentazioni scure e incentrate sui grafici per analytics e revisioni.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Modalità presentatore", body: "Presentazioni in stile Reveal create per presentare dal vivo nel browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Progetti tecnici", body: "Presentazioni di architettura e conoscenza che mappano sistemi complessi.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Presentazioni che le persone hanno creato con Open Design',
    galleryLead:
      'Presentazioni reali renderizzate da una scaletta. Scegli uno stile vicino al tuo intervento e descrivi il contenuto.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Presentazione in stile rivista editoriale" },
      { thumb: "example-guizang-ppt", caption: "Keynote illustrato" },
      { thumb: "example-deck-open-slide-canvas", caption: "Presentazione su canvas di slide aperto" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Presentazione con tema sfumato" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di presentazione',
    faqTitle: 'FAQ sulle slide',
    faq: [
      {
        q: 'Mi servono PowerPoint o Keynote?',
        a: 'No. Open Design renderizza le presentazioni in HTML dentro il tuo agente di programmazione e può esportare in PDF o PPTX. Presenti dal browser o consegni un file — non serve un’app di presentazioni per crearla.',
      },
      {
        q: 'Sono solo elenchi puntati generati dall’IA?',
        a: 'No. L’agente applica un vero template di presentazione con griglia, scala tipografica e gerarchia visiva, così le slide sembrano progettate invece che riempite automaticamente.',
      },
      {
        q: 'Posso esportare in PowerPoint per un cliente?',
        a: 'Sì. Le presentazioni si esportano in PPTX e PDF oltre all’HTML da cui presenti, così si adattano a qualsiasi cosa si aspetti il pubblico.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Costruisci la tua prossima presentazione stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma la tua scaletta in una presentazione progettata — nell’agente che già usi.',
  },
  image: {
    title: 'Genera grafiche in linea con il brand con Open Design + Claude Code',
    description:
      'Produci card social, copertine di articoli e grafiche di marketing da un prompt — impaginate con tipografia reale e il tuo sistema di brand, renderizzate in HTML nitido che esporti in PNG. Senza app di design, senza abbonamento ai template.',
    breadcrumb: 'Immagine',
    label: 'Caso d’uso · Immagine',
    heading: 'Grafiche in linea con il brand, generate e impaginate per te',
    lead: 'Descrivi la card o la copertina che ti serve. Open Design la compone con tipografia, griglia e i colori del tuo brand reali — poi la renderizza in HTML che puoi esportare come immagine, invece di combattere con un’app di design o un template generico.',
    heroImageAlt:
      'Illustrazione editoriale di un prompt che si trasforma in un insieme di card social e copertine di articoli impaginate',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma un prompt in una grafica composta e in linea con il brand che il tuo agente renderizza in HTML ed esporta in PNG — ripetibile, versionata e libera da strumenti di design a postazione.',
    stepsTitle: 'Come funzionano le grafiche con Open Design',
    steps: [
      {
        title: 'Descrivi la grafica',
        body: 'Di’ cos’è — «una card di Twitter per il nostro lancio con il titolo e una citazione». L’agente carica la skill giusta così compone una grafica impaginata, non un semplice blocco di testo.',
        imageAlt: 'Illustrazione di una persona che descrive una card social di cui ha bisogno',
      },
      {
        title: 'Applica il sistema di brand',
        body: 'Open Design preleva i tuoi colori, la tipografia e la spaziatura da un design system riutilizzabile, così ogni card si abbina al resto del tuo brand invece di sembrare un’occasione isolata.',
        imageAlt: 'Illustrazione di colori e tipografia del brand applicati al layout di una card',
      },
      {
        title: 'Renderizza ed esporta',
        body: 'La grafica si renderizza in HTML alle dimensioni esatte che ti servono — card social, copertina, banner — poi si esporta in PNG. Testo nitido, layout reale, senza ritocchi manuali.',
        imageAlt: 'Illustrazione di una grafica che si renderizza e si esporta in un file immagine',
      },
      {
        title: 'Riusa la ricetta',
        body: 'Poiché è un template, la grafica successiva è a un prompt di distanza — cambia il titolo, mantieni il layout. Le serie di card restano perfettamente coerenti.',
        imageAlt: 'Illustrazione di un template di card che produce una serie coerente di grafiche',
      },
    ],
    tableTitle: 'Grafiche con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'App di design / template generici',
    tableRows: [
      {
        capability: 'Passare dall’idea alla grafica impaginata',
        withOd: 'Un prompt; l’agente compone tipografia e layout',
        without: 'Aprire un’app, posizionare ogni elemento a mano',
      },
      {
        capability: 'Restare in linea con il brand',
        withOd: 'Colori e tipografia da un design system riutilizzabile',
        without: 'Riscegliere gli stili di brand per ogni file, o sbandare fuori brand',
      },
      {
        capability: 'Serie coerente',
        withOd: 'Stesso template, nuovo testo — un insieme perfettamente allineato',
        without: 'Riallineare ogni variante manualmente',
      },
      {
        capability: 'Esportazione',
        withOd: 'HTML alle dimensioni esatte, esportato in PNG',
        without: 'Dimensionamento del canvas e impostazioni di esportazione manuali',
      },
      {
        capability: 'Ripetibile',
        withOd: 'Una ricetta guidata da prompt nel tuo repository',
        without: 'Un file isolato che ricrei ogni volta',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Strumento di design a postazione o marketplace di template',
      },
    ],
    featuresTitle: "Cosa puoi creare",
    features: [
      { title: "Card social", body: "Card per X / Twitter composte con il tuo titolo e il tuo brand.", thumb: "example-card-twitter" },
      { title: "Copertine di articoli", body: "Copertine editoriali, in stile rivista, per post e newsletter.", thumb: "example-article-magazine" },
      { title: "Card Xiaohongshu", body: "Card in stile RedNote calibrate per quel feed.", thumb: "example-card-xiaohongshu" },
      { title: "Grafiche hero", body: "Visual hero liquidi e sfumati per siti e lanci.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Caroselli", body: "Caroselli social multi-slide che restano coerenti tra i fotogrammi.", thumb: "example-social-carousel" },
      { title: "Mockup di UI", body: "Cornici di notifica e di dispositivo per raccontare il prodotto.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafiche che le persone hanno creato con Open Design',
    galleryLead:
      'Card e copertine reali renderizzate da un prompt. Scegline una vicina a ciò che ti serve e sostituisci il tuo testo.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Card social pastello" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Poster editoriale a tre tonalità" },
      { thumb: "example-magazine-poster", caption: "Poster in stile rivista" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Copertina editoriale audace" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di grafica',
    faqTitle: 'FAQ sulle immagini',
    faq: [
      {
        q: 'È un generatore di immagini IA come Midjourney?',
        a: 'No. Open Design compone grafiche con layout e tipografia reali — il tuo titolo, il tuo brand, dimensioni esatte — e le renderizza in HTML che esporti come PNG. È composizione di design, non generazione di pixel.',
      },
      {
        q: 'Posso creare una serie coerente di card?',
        a: 'Sì. Poiché ogni grafica è un template, mantieni il layout e cambi il testo, così un’intera serie resta perfettamente allineata e in linea con il brand.',
      },
      {
        q: 'Che dimensioni può produrre?',
        a: 'Qualsiasi — la grafica si renderizza alle dimensioni esatte che specifichi, da una card social quadrata a un banner largo, poi si esporta in PNG.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Crea la tua prossima grafica stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma un prompt in una grafica in linea con il brand — nell’agente che già usi.',
  },
  video: {
    title: 'Genera motion graphics e video brevi con Open Design + Claude Code',
    description:
      'Trasforma una sceneggiatura in fotogrammi animati e video di formato breve — title card, sfondi in movimento e chiusure composti con il tuo sistema di brand e renderizzati da HTML. Senza suite di motion graphics, senza scrubbing sulla timeline.',
    breadcrumb: 'Video',
    label: 'Caso d’uso · Video',
    heading: 'Motion graphics da una sceneggiatura, non da una timeline',
    lead: 'Descrivi il momento che vuoi — una comparsa del titolo, un’animazione di dati, una chiusura con logo. Open Design compone fotogrammi animati con il tuo sistema di brand e li renderizza in video, senza suite di motion graphics.',
    heroImageAlt:
      'Illustrazione editoriale di una sceneggiatura che si trasforma in una sequenza di fotogrammi video animati',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma una sceneggiatura in fotogrammi animati e in linea con il brand che il tuo agente renderizza in video di formato breve — composti da HTML, versionati nel tuo repository, senza editor di timeline da imparare.',
    stepsTitle: 'Come funziona il movimento con Open Design',
    steps: [
      {
        title: 'Descrivi il momento',
        body: 'Di’ cosa deve succedere — «un titolo con glitch che si risolve nel nostro logo, poi una card di chiusura». L’agente carica la skill di movimento così produce fotogrammi animati, non un’immagine statica.',
        imageAlt: 'Illustrazione di una persona che descrive una sequenza di movimento',
      },
      {
        title: 'Applica il brand e lo stile di movimento',
        body: 'Open Design fornisce template di fotogramma — light leak cinematografici, titoli con glitch, chiusure con logo — e applica i tuoi colori e la tua tipografia, così il movimento appare intenzionale e in linea con il brand.',
        imageAlt: 'Illustrazione di stile di brand applicato a fotogrammi animati',
      },
      {
        title: 'Renderizza i fotogrammi in video',
        body: 'I fotogrammi sono composti in HTML e renderizzati in video, così tempi e layout sono precisi e ripetibili — senza keyframing manuale su una timeline.',
        imageAlt: 'Illustrazione di fotogrammi HTML che si renderizzano in una clip video',
      },
      {
        title: 'Itera ed esporta',
        body: 'Affina parlando con l’agente — «rallenta la comparsa del titolo, aggiungi una didascalia». Esporta clip di formato breve per i social o il prodotto. La fonte resta nel tuo progetto.',
        imageAlt: 'Illustrazione di una clip video che viene affinata ed esportata per i social',
      },
    ],
    tableTitle: 'Movimento con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'After Effects / suite di motion',
    tableRows: [
      {
        capability: 'Passare dalla sceneggiatura ai fotogrammi animati',
        withOd: 'Un prompt; l’agente compone la sequenza',
        without: 'Fare keyframe di ogni elemento su una timeline a mano',
      },
      {
        capability: 'Restare in linea con il brand',
        withOd: 'Template di fotogramma + i tuoi colori e la tua tipografia',
        without: 'Ricostruire lo stile di brand per ogni progetto',
      },
      {
        capability: 'Tempi precisi e ripetibili',
        withOd: 'Composto in HTML, renderizzato in modo deterministico',
        without: 'Scrubbing manuale, difficile da riprodurre',
      },
      {
        capability: 'Esportare per i social',
        withOd: 'Clip di formato breve renderizzate in video',
        without: 'Preset di esportazione e gestione dei codec',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'La fonte dei fotogrammi vive nel tuo repository, confrontabile',
        without: 'File di progetto binario, senza diff reale',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Suite costosa, curva di apprendimento ripida',
      },
    ],
    featuresTitle: "Cosa puoi animare",
    features: [
      { title: "Hyperframes", body: "Sequenze di movimento fotogramma per fotogramma composte da HTML.", thumb: "example-video-hyperframes" },
      { title: "Formato breve per social", body: "Clip verticali pensate per i feed social.", thumb: "example-video-shortform" },
      { title: "Set di fotogrammi di movimento", body: "Fotogrammi animati riutilizzabili che componi in una clip.", thumb: "example-motion-frames" },
      { title: "Light leak cinematografici", body: "Transizioni filmiche e sfondi atmosferici.", thumb: "example-frame-light-leak-cinema" },
      { title: "Titoli con glitch", body: "Comparse di titolo con movimento e texture.", thumb: "example-frame-glitch-title" },
      { title: "Chiusure con logo", body: "Animazioni di chiusura brandizzate per qualsiasi clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Movimento che le persone hanno creato con Open Design',
    galleryLead:
      'Fotogrammi e clip animati reali renderizzati da un prompt. Scegline uno vicino alla tua idea e descrivi il movimento.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Sequenza di Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Sfondo in movimento liquido" },
      { thumb: "example-frame-macos-notification", caption: "Fotogramma di UI animato" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafico dati animato" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di movimento',
    faqTitle: 'FAQ sui video',
    faq: [
      {
        q: 'Mi servono After Effects o una suite di motion graphics?',
        a: 'No. Open Design compone fotogrammi animati in HTML e li renderizza in video dentro il tuo agente di programmazione. Non c’è un editor di timeline da imparare o licenziare.',
      },
      {
        q: 'Per che tipo di video va bene?',
        a: 'Movimento di formato breve — title card, animazioni di dati, chiusure con logo, clip social. È pensato per il movimento di brand e prodotto, non per il montaggio di lungometraggi.',
      },
      {
        q: 'I tempi sono riproducibili?',
        a: 'Sì. Poiché i fotogrammi sono composti nel codice e renderizzati in modo deterministico, ottieni lo stesso risultato ogni volta e puoi ritoccarlo con precisione tramite un prompt.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Anima la tua prossima idea stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma una sceneggiatura in movimento — nell’agente che già usi.',
  },
  designSystem: {
    title: 'Costruisci e applica un design system con Open Design + Claude Code',
    description:
      'Cattura il tuo brand come un design system riutilizzabile che il tuo agente di programmazione applica a ogni artefatto — colori, tipografia, componenti e tono in un unico DESIGN.md. Definiscilo una volta; ogni prototipo, presentazione e dashboard resta in linea con il brand.',
    breadcrumb: 'Design system',
    label: 'Caso d’uso · Design system',
    heading: 'Un design system, applicato a tutto ciò che il tuo agente crea',
    lead: 'Definisci il tuo brand una volta e Open Design lo porta in ogni output — prototipi, presentazioni, dashboard, grafiche. Il sistema vive nel tuo repository come un DESIGN.md che l’agente legge, così la coerenza è automatica, non manuale.',
    heroImageAlt:
      'Illustrazione editoriale di un singolo design system che si irradia in molti artefatti in linea con il brand',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design cattura il tuo brand come un design system portabile che il tuo agente applica a ogni artefatto — definito una volta nel tuo repository, applicato ovunque, senza uno strumento di design centrale che faccia da controllore.',
    stepsTitle: 'Come funzionano i design system con Open Design',
    steps: [
      {
        title: 'Cattura il sistema',
        body: 'Descrivi il tuo brand — colori, tipografia, spaziatura, voce — oppure punta l’agente a un sito esistente per estrarlo. Open Design lo scrive in un DESIGN.md che vive nel tuo progetto.',
        imageAlt: 'Illustrazione di un brand catturato in un unico file di design system',
      },
      {
        title: 'Parti da una base collaudata',
        body: 'Open Design include oltre 140 design system di riferimento — da Apple e Linear a quelli editoriali e brutalisti. Fai il fork di uno vicino al tuo brand invece di partire da una pagina bianca.',
        imageAlt: 'Illustrazione di una galleria di design system di riferimento mentre viene sfogliata',
      },
      {
        title: 'Applicalo ovunque',
        body: 'Ogni altra skill legge lo stesso sistema, così un prototipo, una presentazione e una dashboard condividono un unico linguaggio visivo — senza che tu lo debba rispecificare ogni volta.',
        imageAlt: 'Illustrazione di un sistema applicato in modo coerente a molti tipi di artefatto',
      },
      {
        title: 'Fallo evolvere in un solo posto',
        body: 'Cambia il sistema e il render successivo lo riflette ovunque. Poiché è un file nel tuo repository, le decisioni di design sono revisionate e versionate come codice.',
        imageAlt: 'Illustrazione di un design system che viene aggiornato e si propaga a tutti gli output',
      },
    ],
    tableTitle: 'Design system con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Librerie di strumenti di design / guide di stile',
    tableRows: [
      {
        capability: 'Definire il sistema',
        withOd: 'Un DESIGN.md che l’agente legge, forkato da oltre 140 riferimenti',
        without: 'Una guida di stile statica o una libreria legata a uno strumento',
      },
      {
        capability: 'Applicare a diversi tipi di artefatto',
        withOd: 'Lo stesso sistema alimenta prototipi, presentazioni, dashboard, grafiche',
        without: 'Reimplementato per ogni strumento e ogni file',
      },
      {
        capability: 'Mantenere tutto coerente',
        withOd: 'Automatico — ogni skill legge un’unica fonte',
        without: 'Disciplina manuale; sbanda nel tempo',
      },
      {
        capability: 'Far evolvere il brand',
        withOd: 'Modifica una volta; il render successivo si aggiorna ovunque',
        without: 'Cerca e sostituisci tra file e strumenti',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'Vive nel tuo repository, confrontabile come codice',
        without: 'Sepolto in uno strumento di design, difficile da verificare',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, portabile, gira in locale',
        without: 'Vincolato a un abbonamento di uno strumento di design',
      },
    ],
    featuresTitle: "Sistemi da cui puoi partire",
    features: [
      { title: "Apple", body: "Estetica pulita, sobria, con font di sistema.", thumb: "design-system-apple" },
      { title: "Linear", body: "Aspetto nitido da strumento di prodotto con spaziatura compatta.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Morbido, incentrato sui documenti, accogliente.", thumb: "design-system-notion" },
      { title: "Figma", body: "Energia giocosa, colorata, da strumento creativo.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimale, neutra, di livello ricerca.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Densa, tecnica, nativa per sviluppatori.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Design system in Open Design',
    galleryLead:
      'Alcuni degli oltre 140 sistemi di riferimento di cui puoi fare il fork come punto di partenza. Scegline uno vicino al tuo brand e adattalo.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistema in stile Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistema in stile Vercel" },
      { thumb: "design-system-stripe", caption: "Sistema in stile Stripe" },
      { thumb: "design-system-spotify", caption: "Sistema in stile Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Sfoglia i design system',
    faqTitle: 'FAQ sul design system',
    faq: [
      {
        q: 'Cos’è esattamente il design system qui?',
        a: 'Un file DESIGN.md nel tuo repository che cattura colori, tipografia, spaziatura, componenti e voce. Ogni skill di Open Design lo legge, così il tuo brand viene applicato automaticamente a qualsiasi cosa l’agente produca.',
      },
      {
        q: 'Devo partire da zero?',
        a: 'No. Open Design include oltre 140 design system di riferimento di cui puoi fare il fork — da Apple e Linear a quelli editoriali e brutalisti — per poi adattarli al tuo brand.',
      },
      {
        q: 'Come resta coerente tra presentazioni, dashboard e prototipi?',
        a: 'Perché tutte quelle skill leggono lo stesso DESIGN.md. Definisci il sistema una volta e la coerenza è automatica invece di qualcosa che controlli a mano.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Definisci il tuo design system stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e dai al tuo agente un unico brand da applicare ovunque — nell’agente che già usi.',
  },
  roleSoloBuilder: {
    title: 'Open Design per solo builder e indie hacker',
    description:
      'Spedisci come un team di una persona sola. Open Design trasforma il tuo agente di coding nella metà di design della tua startup: prototipi, landing page, dashboard e visual di brand, tutto da un prompt, tutto in linea con il brand, tutto nel tuo repository.',
    breadcrumb: 'Solo builder',
    label: 'Per · Solo builder',
    heading: 'Il tuo team di design è l’agente che già usi',
    lead: 'Niente designer, niente budget, niente passaggi di consegna. Descrivi ciò che ti serve e il tuo agente lo renderizza: una landing page stamattina, una dashboard nel pomeriggio, card social prima di lanciare, tutto con un unico design system che hai definito una volta sola.',
    heroImageAlt:
      'Illustrazione editoriale di una persona alla scrivania circondata da una landing page, un’app, una dashboard e card social, tutto in uno stile coerente',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design è il reparto di design che un fondatore solitario non ha mai avuto: dal prompt all’artefatto su ogni superficie di cui il tuo prodotto ha bisogno, in un unico brand, con zero passaggi di consegna e nessuno strumento in più.',
    stepsTitle: 'Come un solo builder usa Open Design',
    steps: [
      {
        title: 'Definisci il tuo brand una volta sola',
        body: 'Cattura colori, tipografia e voce in un DESIGN.md (oppure fai il fork di uno degli oltre 140 sistemi di riferimento). Ogni artefatto che generi dopo è automaticamente in linea con il brand.',
        imageAlt: 'Illustrazione di un singolo file di definizione del brand',
      },
      {
        title: 'Genera ciò che ti serve dopo',
        body: 'Prototipo, landing page, dashboard, pitch deck, card social: stesso agente, stesso brand, un prompt per ciascuno. Senza cambiare strumento né ricomprare licenze.',
        imageAlt: 'Illustrazione di molti tipi di artefatto che nascono da un solo prompt',
      },
      {
        title: 'Spediscilo: è già reale',
        body: 'Tutto viene renderizzato in HTML / codice nel tuo repository, così il prototipo diventa il prodotto e la landing page va online. Niente mockup usa e getta.',
        imageAlt: 'Illustrazione di un artefatto che passa dritto dal prompt all’online',
      },
    ],
    tableTitle: 'Costruire in solitaria con Open Design vs. farlo nel modo difficile',
    tableColCapability: 'Ciò che ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Da solo oggi',
    tableRows: [
      { capability: 'Coprire ogni superficie di design', withOd: 'Un agente fa prototipo, landing, dashboard e brand', without: 'Cucire insieme cinque strumenti SaaS e tutorial' },
      { capability: 'Restare in linea con il brand', withOd: 'Un DESIGN.md applicato ovunque automaticamente', without: 'Ricreare l’aspetto per ogni strumento; deriva nel tempo' },
      { capability: 'Muoverti a velocità solo', withOd: 'Dall’idea all’artefatto in un prompt', without: 'Imparare uno strumento di design per cui non hai tempo' },
      { capability: 'Spedire, non mockare', withOd: 'HTML / codice nel tuo repository, pronto al deploy', without: 'Un mockup che qualcuno deve ancora costruire' },
      { capability: 'Costo', withOd: 'Open source, porti le tue chiavi, gira in locale', without: 'Una pila di abbonamenti a postazione' },
    ],
    featuresTitle: 'Cosa può spedire un solo builder',
    features: [
      { title: 'Landing page', body: 'Landing di marketing e SaaS, navigabili e online.', thumb: 'example-saas-landing' },
      { title: 'Prototipi di prodotto', body: 'App web multischermata per validare l’idea.', thumb: 'example-web-prototype' },
      { title: 'Dashboard', body: 'Metriche e viste di amministrazione per il tuo prodotto.', thumb: 'example-dashboard' },
      { title: 'Grafiche di brand', body: 'Copertine e poster in linea con il tuo brand.', thumb: 'example-magazine-poster' },
      { title: 'Flussi mobile', body: 'Schermate di app quando vai oltre il web.', thumb: 'example-mobile-app' },
      { title: 'Card social', body: 'Card di lancio e aggiornamento per ogni canale.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Costruito in solitaria con Open Design',
    galleryLead:
      'Ogni superficie di cui ha bisogno una startup di una persona sola, da un prompt. Scegline una vicina alla tua prossima mossa e descrivila.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page SaaS' },
      { thumb: 'example-web-prototype', caption: 'Prototipo di prodotto' },
      { thumb: 'example-dashboard', caption: 'Dashboard di prodotto' },
      { thumb: 'example-card-twitter', caption: 'Card social di lancio' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ del solo builder',
    faq: [
      { q: 'Non sono un designer: posso davvero usarlo?', a: 'Sì. Descrivi ciò che vuoi in linguaggio naturale; l’agente applica un design system e lo renderizza. L’abilità sta nello scrivere il prompt, non nello spostare pixel.' },
      { q: 'Copre tutto o solo una cosa?', a: 'Tutto ciò che serve a un prodotto piccolo: prototipi, landing page, dashboard, deck e grafiche, dallo stesso agente e dallo stesso brand.' },
      { q: 'In cosa si trasformano i risultati?', a: 'HTML / codice reale nel tuo repository, così un prototipo può diventare il prodotto e una landing page può andare online, invece di un mockup da buttare.' },
      { q: 'Quali agenti posso usare?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi di provider.' },
    ],
    ctaTitle: 'Costruisci tutto il tuo progetto stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e lascia che un agente sia il tuo team di design, dentro l’agente che già usi.',
  },
  roleDesigner: {
    title: 'Open Design per designer',
    description:
      'Dedica il tuo tempo al gusto, non alla fatica. Open Design lascia che il tuo agente gestisca il lavoro di produzione ripetitivo — varianti, stati, interi design system — mentre tu dirigi l’aspetto e mantieni l’ultima parola.',
    breadcrumb: 'Designer',
    label: 'Per · Designer',
    heading: 'Dirigi il design: lascia la produzione all’agente',
    lead: 'Tu imposti il sistema e lo standard; l’agente renderizza le schermate, gli stati, le varianti, i comp ad alta fedeltà. Meno spostare rettangoli, più decidere com’è fatto ciò che è buono.',
    heroImageAlt:
      'Illustrazione editoriale di un designer che dirige mentre un agente completa schermate, varianti e un design system',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design è l’assistente di produzione che non si stanca mai: tu definisci il design system e dai il gusto; l’agente genera il resto, in linea con il sistema, nel tuo repository.',
    stepsTitle: 'Come un designer usa Open Design',
    steps: [
      {
        title: 'Codifica il tuo sistema',
        body: 'Trasforma il tuo brand in un DESIGN.md: scala tipografica, colore, spaziatura, componenti, voce. È la fonte di verità a cui l’agente obbedisce.',
        imageAlt: 'Illustrazione di un design system catturato come file',
      },
      {
        title: 'Genera la coda lunga',
        body: 'Ogni schermata, stato e variante che altrimenti costruiresti a mano: l’agente li renderizza in linea con il sistema, così il noioso 80% è fatto in pochi minuti.',
        imageAlt: 'Illustrazione di molte schermate in linea con il sistema generate in una volta',
      },
      {
        title: 'Dirigi e rifinisci',
        body: 'Critica a parole: «stringi la spaziatura, rendi più caldo lo stato vuoto». L’ultima parola è tua; l’agente fa le iterazioni.',
        imageAlt: 'Illustrazione di un designer che dà indicazioni mentre il design si aggiorna',
      },
    ],
    tableTitle: 'Progettare con Open Design vs. il modo manuale',
    tableColCapability: 'Ciò che ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Strumenti di design manuali',
    tableRows: [
      { capability: 'Costruire un design system', withOd: 'Un DESIGN.md che l’agente applica ovunque', without: 'Una libreria che mantieni a mano per ogni strumento' },
      { capability: 'Produrre varianti e stati', withOd: 'Generati in linea con il sistema da un prompt', without: 'Duplicare i frame e ritoccarli uno per uno' },
      { capability: 'Comp ad alta fedeltà', withOd: 'Renderizzati in HTML reale, non un mockup piatto', without: 'Lavoro al pixel che l’engineering ricostruisce comunque' },
      { capability: 'Restare coerenti', withOd: 'Un sistema, applicato automaticamente', without: 'Disciplina manuale; deriva nel tempo' },
      { capability: 'Passaggio di consegna', withOd: 'L’artefatto è codice: nessun divario di traduzione', without: 'Documenti di specifica e redline' },
    ],
    featuresTitle: 'Cosa può dirigere un designer',
    features: [
      { title: 'Layout editoriali', body: 'Composizioni con art direction, guidate dalla griglia.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Copertine di articolo', body: 'Copertine e feature in stile rivista.', thumb: 'example-article-magazine' },
      { title: 'Poster', body: 'Poster tipografici decisi e in linea con il brand.', thumb: 'example-magazine-poster' },
      { title: 'Set social', body: 'Caroselli multi-frame coerenti.', thumb: 'example-social-carousel' },
      { title: 'Schermate di app', body: 'Schermate mobile e web ad alta fedeltà.', thumb: 'example-mobile-app' },
      { title: 'Dashboard', body: 'Interfacce dati che rispettano il tuo sistema.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Diretto con Open Design',
    galleryLead:
      'Lavoro ad alta fedeltà e in linea con il sistema, prodotto dall’agente sulla base della tua direzione. Scegline uno vicino al tuo stile e rifiniscilo.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Layout editoriale' },
      { thumb: 'example-article-magazine', caption: 'Copertina da rivista' },
      { thumb: 'example-social-carousel', caption: 'Carosello social' },
      { thumb: 'example-magazine-poster', caption: 'Poster tipografico' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ del designer',
    faq: [
      { q: 'Mi sostituisce?', a: 'No: sostituisce la fatica. Tu imposti il sistema e il gusto; l’agente fa la produzione ripetitiva, così dedichi il tempo alle decisioni che solo tu puoi prendere.' },
      { q: 'Come mantengo il controllo dell’aspetto?', a: 'Il tuo DESIGN.md è il contratto. L’agente renderizza al suo interno e tu critichi a parole finché non è giusto.' },
      { q: 'L’output è modificabile / reale?', a: 'È HTML/CSS reale, non un export piatto, quindi va dritto in produzione invece di essere ricostruito.' },
      { q: 'Quali agenti posso usare?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi di provider.' },
    ],
    ctaTitle: 'Dirigi il tuo prossimo design stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e lascia che l’agente gestisca la produzione mentre tu dai il gusto, dentro l’agente che già usi.',
  },
  roleEngineering: {
    title: 'Open Design per ingegneri',
    description:
      'Salta il passaggio di consegna del design. Open Design trasforma un DESIGN.md in front-end reale che il tuo agente di coding scrive direttamente: UI in linea con il sistema, prototipi e dashboard, nel repository, senza andata e ritorno su Figma.',
    breadcrumb: 'Ingegneria',
    label: 'Per · Ingegneria',
    heading: 'Dalla specifica al front-end, senza passaggi di consegna nel mezzo',
    lead: 'Punta il tuo agente su un DESIGN.md e una descrizione; scrive codice front-end reale e in linea con il sistema — componenti, schermate, dashboard — dritto nel tuo progetto. Niente redline, niente «in attesa del design».',
    heroImageAlt:
      'Illustrazione editoriale di un DESIGN.md che confluisce direttamente in codice front-end e UI renderizzata, saltando un passaggio di consegna',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design chiude il divario tra designer e ingegnere rendendo il design system leggibile dalla macchina: lo stesso agente che scrive il tuo codice applica il sistema e renderizza UI reale.',
    stepsTitle: 'Come un ingegnere usa Open Design',
    steps: [
      {
        title: 'Leggi il sistema, non una redline',
        body: 'Il DESIGN.md vive nel repository. Il tuo agente lo legge come legge il resto della codebase: nessuna specifica esportata da interpretare.',
        imageAlt: 'Illustrazione di un agente che legge un DESIGN.md accanto al codice',
      },
      {
        title: 'Genera UI in linea con il sistema',
        body: 'Descrivi la schermata o il componente; l’agente scrive front-end che già combacia con il sistema. Prototipi, dashboard di amministrazione, strumenti interni: in pochi minuti.',
        imageAlt: 'Illustrazione di codice UI generato per combaciare con un design system',
      },
      {
        title: 'È già il tuo codice',
        body: 'L’output è HTML / codice di framework nel tuo repository, revisionabile in una PR. Nessun passaggio di traduzione tra «il design» e «la build».',
        imageAlt: 'Illustrazione di UI generata che arriva come una PR revisionabile',
      },
    ],
    tableTitle: 'Front-end con Open Design vs. il modo con passaggio di consegna',
    tableColCapability: 'Ciò che ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Passaggio da design a dev',
    tableRows: [
      { capability: 'Avere un design da cui partire', withOd: 'Un DESIGN.md che il tuo agente legge direttamente', without: 'Un file Figma che reinterpreti a mano' },
      { capability: 'Combaciare con il sistema', withOd: 'Applicato automaticamente al momento della generazione', without: 'Confronto a occhio con una specifica; la deriva si insinua' },
      { capability: 'Costruire strumenti interni / dashboard', withOd: 'Prompt → front-end in linea con il sistema nel repository', without: 'Aspettare un designer e poi costruirlo due volte' },
      { capability: 'Revisione', withOd: 'È codice: fai il diff in una PR', without: 'Confronto pixel per pixel con un mockup' },
      { capability: 'Costo e lock-in', withOd: 'Open source, nel tuo repository, gira in locale', without: 'Uno strumento di design che tutto il team deve licenziare' },
    ],
    featuresTitle: 'Cosa può generare un ingegnere',
    features: [
      { title: 'UI di app web', body: 'Front-end multischermata da una descrizione.', thumb: 'example-web-prototype' },
      { title: 'Dashboard di dev', body: 'Dashboard di repository, CI e metriche.', thumb: 'example-github-dashboard' },
      { title: 'Report di dati', body: 'Report strutturati a partire dai tuoi dati.', thumb: 'example-data-report' },
      { title: 'Dashboard di amministrazione', body: 'Strumenti interni e viste di amministrazione.', thumb: 'example-dashboard' },
      { title: 'Landing page', body: 'Pagine di marketing senza aspettare il design.', thumb: 'example-saas-landing' },
      { title: 'Kanban / board', body: 'Interfacce di flusso di lavoro interne.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Costruito dagli ingegneri con Open Design',
    galleryLead:
      'Front-end reale e in linea con il sistema, generato dritto nel repository. Scegline uno vicino a ciò che stai costruendo e descrivilo.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'UI di app web' },
      { thumb: 'example-github-dashboard', caption: 'Dashboard di dev' },
      { thumb: 'example-data-report', caption: 'Report di dati' },
      { thumb: 'example-kanban-board', caption: 'UI di board interna' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ di ingegneria',
    faq: [
      { q: 'Mi serve ancora un designer?', a: 'Per brand e direzione, sì. Ma per costruire UI in linea con il sistema e strumenti interni, l’agente legge il DESIGN.md e scrive il front-end, senza andata e ritorno di consegna.' },
      { q: 'Cosa produce?', a: 'HTML / codice di framework reale nel tuo repository, revisionabile in una PR, non un mockup da reimplementare.' },
      { q: 'Come resta in linea con il sistema?', a: 'Il DESIGN.md è la fonte di verità; l’agente lo applica al momento della generazione, così l’output combacia senza controllo manuale al pixel.' },
      { q: 'Quali agenti posso usare?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi di provider.' },
    ],
    ctaTitle: 'Genera la tua prossima UI stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma un DESIGN.md in front-end, dentro l’agente che già usi.',
  },
  roleProductManagers: {
    title: 'Open Design per product manager',
    description:
      'Smetti di aspettare la banda di design per comunicare un’idea. Open Design permette a un PM di trasformare un prompt in un prototipo cliccabile o in un wireframe, per allineare gli stakeholder e fare il brief al team, senza un ticket di design.',
    breadcrumb: 'Product Manager',
    label: 'Per · Product Manager',
    heading: 'Rendi l’idea cliccabile prima del kickoff',
    lead: 'Descrivi il flusso e il tuo agente renderizza un prototipo reale e cliccabile che puoi mettere davanti agli stakeholder già oggi, così le review discutono la cosa vera, non un paragrafo in un documento.',
    heroImageAlt:
      'Illustrazione editoriale di un PM che trasforma un’idea scritta in un prototipo cliccabile mostrato agli stakeholder',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design dà al PM un modo senza design di rendere tangibili le idee: dal prompt al prototipo per allineamento e brief, senza spendere il budget di design del team.',
    stepsTitle: 'Come un PM usa Open Design',
    steps: [
      {
        title: 'Descrivi il flusso',
        body: 'Scrivi il percorso utente in linguaggio naturale: le schermate, gli stati, l’happy path. Nessuno strumento di wireframing richiesto.',
        imageAlt: 'Illustrazione di un PM che descrive un flusso utente',
      },
      {
        title: 'Ottieni un prototipo cliccabile',
        body: 'L’agente renderizza schermate navigabili che puoi davvero cliccare: molto più chiaro di una slide o di un documento per una review con gli stakeholder.',
        imageAlt: 'Illustrazione di un prototipo cliccabile prodotto da una descrizione',
      },
      {
        title: 'Allinea e passa la consegna',
        body: 'Condividi il link, raccogli feedback sulla cosa vera, poi passa il prototipo a design/eng come punto di partenza preciso e condiviso.',
        imageAlt: 'Illustrazione di un prototipo condiviso per allineamento e poi passato al team',
      },
    ],
    tableTitle: 'Lavoro del PM con Open Design vs. aspettare il design',
    tableColCapability: 'Ciò che ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Senza, oggi',
    tableRows: [
      { capability: 'Rendere tangibile un’idea', withOd: 'Prompt → prototipo cliccabile da solo', without: 'Aprire un ticket di design e aspettare la banda' },
      { capability: 'Allineare gli stakeholder', withOd: 'Cliccano il flusso vero', without: 'Leggono un documento e lo immaginano in modo diverso' },
      { capability: 'Fare il brief al team', withOd: 'Un prototipo concreto come specifica', without: 'Un muro di testo e botta e risposta' },
      { capability: 'Iterare prima della build', withOd: 'Cambialo in un prompt, ricondividi', without: 'Un altro giro nella coda di design' },
      { capability: 'Costo', withOd: 'Open source, dentro l’agente che già usi', without: 'Ore di design spese su concept usa e getta' },
    ],
    featuresTitle: 'Cosa un PM può mettere davanti alle persone',
    features: [
      { title: 'Flussi mobile', body: 'Percorsi di app end-to-end, cliccabili.', thumb: 'example-mobile-app' },
      { title: 'Flussi di onboarding', body: 'Benvenuto → setup → primo avvio.', thumb: 'example-mobile-onboarding' },
      { title: 'Board e flussi di lavoro', body: 'Kanban e interfacce di processo per le specifiche.', thumb: 'example-kanban-board' },
      { title: 'Dashboard', body: 'Viste di metriche per inquadrare il problema.', thumb: 'example-dashboard' },
      { title: 'Prototipi web', body: 'Flussi web multischermata da rivedere.', thumb: 'example-web-prototype' },
      { title: 'Viste di trend', body: 'Snapshot a 30 giorni e di trend per dare contesto.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Prototipato dai PM con Open Design',
    galleryLead:
      'Flussi cliccabili renderizzati da una descrizione, pronti per una review con gli stakeholder. Scegline uno vicino alla tua idea e descrivilo.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Flusso mobile' },
      { thumb: 'example-mobile-onboarding', caption: 'Flusso di onboarding' },
      { thumb: 'example-kanban-board', caption: 'Board di flusso di lavoro' },
      { thumb: 'example-web-prototype', caption: 'Prototipo web' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ del product manager',
    faq: [
      { q: 'Non so progettare: fa per me?', a: 'Sì. Descrivi il flusso a parole; l’agente lo rende cliccabile. Serve a comunicare e allineare, senza bisogno di uno strumento di design.' },
      { q: 'È un prototipo reale o un mockup?', a: 'Reale e cliccabile: navigazione e stati funzionano, così gli stakeholder reagiscono all’esperienza vera.' },
      { q: 'Sostituisce il design?', a: 'No: dà a design ed engineering un punto di partenza preciso e condiviso invece di una specifica testuale, e risparmia la banda di design per il lavoro che ne ha bisogno.' },
      { q: 'Quali agenti posso usare?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi di provider.' },
    ],
    ctaTitle: 'Rendi la tua idea cliccabile stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma la tua prossima specifica in qualcosa su cui le persone possono cliccare, dentro l’agente che già usi.',
  },
  roleMarketing: {
    title: 'Open Design per i team di marketing',
    description:
      'Spedisci campagne alla velocità dei contenuti. Open Design permette al tuo agente di produrre landing page, card social e visual di campagna da un prompt: in linea con il brand, su richiesta, senza mettersi in coda dal design.',
    breadcrumb: 'Marketing',
    label: 'Per · Marketing',
    heading: 'Visual di campagna alla velocità di un prompt',
    lead: 'Landing page, card social, copertine, grafiche di annuncio: descritti a parole, renderizzati in linea con il brand, spediti lo stesso giorno. Nessun ticket di design, nessuna lotta con i template.',
    heroImageAlt:
      'Illustrazione editoriale di un marketer che trasforma un brief in una landing page e in un set di card social in linea con il brand',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design è la risorsa di design sempre attiva per il marketing: dal prompt all’asset per landing page e social, in linea con il brand, così le campagne escono alla velocità con cui scrivi i testi.',
    stepsTitle: 'Come un team di marketing usa Open Design',
    steps: [
      {
        title: 'Blocca il brand',
        body: 'Il tuo DESIGN.md contiene colori, tipografia e voce. Ogni asset che l’agente crea è automaticamente in linea con il brand, senza ristilizzare asset per asset.',
        imageAlt: 'Illustrazione di un sistema di brand applicato agli asset di marketing',
      },
      {
        title: 'Genera la campagna',
        body: 'Landing page, card social, copertine, grafiche di annuncio: un prompt per ciascuno, un set coerente su ogni canale.',
        imageAlt: 'Illustrazione di un set completo di campagna generato dai prompt',
      },
      {
        title: 'Spedisci e itera',
        body: 'Le landing page vengono renderizzate in HTML che puoi mettere in deploy; le grafiche si esportano in PNG. Cambia il titolo, ri-renderizza il set, senza aspettare in coda.',
        imageAlt: 'Illustrazione di asset di campagna spediti e iterati rapidamente',
      },
    ],
    tableTitle: 'Marketing con Open Design vs. la solita corsa',
    tableColCapability: 'Ciò che ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Senza, oggi',
    tableRows: [
      { capability: 'Lanciare una landing page', withOd: 'Prompt → pagina in linea con il brand, deployabile', without: 'Fare il brief al design o litigare con un website builder' },
      { capability: 'Un set social coerente', withOd: 'Stesso template, testo nuovo, perfettamente allineato', without: 'Riallineare ogni card a mano' },
      { capability: 'Restare in linea con il brand', withOd: 'Un DESIGN.md applicato a ogni asset', without: 'Sperare che ogni asset rispetti le linee guida' },
      { capability: 'Muoverti a velocità di campagna', withOd: 'Asset in un prompt, lo stesso giorno', without: 'Metterti in coda dietro al backlog di design' },
      { capability: 'Costo', withOd: 'Open source, nessuno strumento di design a postazione', without: 'Abbonamenti più ore di design' },
    ],
    featuresTitle: 'Cosa può spedire un team di marketing',
    features: [
      { title: 'Landing page', body: 'Landing di campagna e prodotto, deployabili.', thumb: 'example-saas-landing' },
      { title: 'Card social', body: 'Card X / Twitter in linea con il brand.', thumb: 'example-card-twitter' },
      { title: 'Caroselli', body: 'Set social multi-slide, coerenti.', thumb: 'example-social-carousel' },
      { title: 'Poster', body: 'Poster di annuncio ed evento.', thumb: 'example-magazine-poster' },
      { title: 'Copertine di articolo', body: 'Copertine per blog e newsletter.', thumb: 'example-article-magazine' },
      { title: 'Pagine web', body: 'Microsite e pagine di campagna.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Spedito dal marketing con Open Design',
    galleryLead:
      'Asset di campagna in linea con il brand renderizzati da un prompt. Scegline uno vicino alla tua campagna e sostituisci il testo con il tuo.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page di campagna' },
      { thumb: 'example-card-twitter', caption: 'Card social' },
      { thumb: 'example-social-carousel', caption: 'Carosello social' },
      { thumb: 'example-magazine-poster', caption: 'Poster di annuncio' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template',
    faqTitle: 'FAQ di marketing',
    faq: [
      { q: 'Ci serve un designer per ogni asset?', a: 'No. L’agente renderizza landing page e asset social in linea con il brand da un prompt, così il team spedisce il lavoro di campagna di routine senza mettersi in coda dal design.' },
      { q: 'Come restano in linea con il brand gli asset?', a: 'Il tuo DESIGN.md viene applicato a tutto automaticamente: colori, tipografia e voce si propagano su ogni asset.' },
      { q: 'Le landing page possono davvero andare online?', a: 'Sì: vengono renderizzate in HTML che puoi mettere in deploy e le grafiche si esportano in PNG. Sono asset pronti da spedire, non mockup.' },
      { q: 'Quali agenti posso usare?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi di provider.' },
    ],
    ctaTitle: 'Spedisci la tua prossima campagna stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma i brief in asset in linea con il brand, dentro l’agente che già usi.',
  },
};
