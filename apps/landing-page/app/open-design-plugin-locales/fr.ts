import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const copy: OpenDesignPluginCopy = {
  metadata: {
    title: 'Open Design pour Codex/ChatGPT | Installer le plugin Open Design Cloud',
    description:
      'Installez Open Design Cloud dans Codex/ChatGPT et créez des sites web, des présentations, des prototypes et des systèmes de design depuis la même tâche.',
    keywords:
      'plugin Open Design pour Codex, plugin ChatGPT desktop, installation plugin Codex, Open Design Cloud, plugin design Codex, Codex MCP',
  },
  hero: {
    title: 'Plugin Open Design pour Codex/ChatGPT',
    leadBefore: 'Saisissez l’instruction ci-dessous dans n’importe quelle tâche de votre',
    chatgptLabel: 'application de bureau ChatGPT',
    installAria: 'Installer Open Design Cloud dans Codex/ChatGPT',
    copy: 'Copier',
    github: 'Voir le code source sur GitHub ↗',
  },
  agentInstall: {
    howToName: 'Installer le plugin Open Design dans Codex',
    howToDescription:
      'Étapes exécutables par un agent pour installer le plugin Open Design pour Codex et enregistrer son MCP local.',
    eyebrow: 'Protocole d’installation lisible par les agents',
    title: 'Effectuez l’installation complète du plugin Codex.',
    intro:
      'Si l’utilisateur vous a demandé d’installer Open Design, exécutez ce protocole dans l’ordre. Cette demande autorise uniquement les modifications de la configuration des plugins Codex et du MCP de l’utilisateur. Préservez les autres marketplaces, plugins, serveurs MCP et l’état d’authentification.',
    downloadLabel: 'Page officielle de téléchargement de Open Design ↗',
    steps: [
      {
        title: 'Vérifier au préalable l’environnement pris en charge',
        body:
          'Lisez plugin.minimumCodexCliVersion et plugin.minimumOpenDesignVersion dans release-manifest.json. Avant toute modification de la configuration, exigez le respect de ces deux minimums. Acceptez la version du runtime Open Design uniquement si elle provient de la CLI Open Design interrogée ou de CFBundleShortVersionString dans un bundle d’application macOS signé qui réussit les vérifications de signature de code et de Gatekeeper. Si od est introuvable ou masqué par un autre exécutable dans le PATH, notamment /usr/bin/od, ou si le daemon est arrêté, passez à la vérification du bundle signé. Si aucune des deux vérifications fiables n’est disponible, arrêtez-vous avant toute modification, dirigez l’utilisateur vers Open Design Settings → MCP server pour copier l’extrait propre au client contenant le chemin absolu, puis réessayez. Ne dirigez l’utilisateur vers la page officielle de téléchargement que si l’application est absente ou trop ancienne ; ne téléchargez jamais silencieusement un programme d’installation et n’exécutez jamais de script non vérifié.',
      },
      {
        title: 'Inspecter avant de modifier la configuration',
        body:
          'Lisez dans release-manifest.json le sélecteur et la version requis, puis comparez-les à l’état de Codex que vous avez inspecté. Inspectez l’état du MCP uniquement au moyen de l’instantané MCP filtré produit à partir de codex mcp list --json. N’émettez que name, enabled, transport.type et command ; supprimez les champs args, env, env_vars, headers et token avant toute sortie. L’absence d’un résultat open-design est attendue et non bloquante. N’affichez et ne communiquez jamais la liste brute ni la sortie de codex mcp get open-design --json, car les valeurs de transport peuvent contenir des informations d’authentification. Si le nom de marketplace open-design pointe vers une autre source, arrêtez-vous et signalez le conflit. Ne conservez open-design@open-design que si sa version installée correspond à la version déclarée dans release-manifest.json.',
      },
      {
        title: 'Installer uniquement les composants manquants',
        body:
          'Exécutez la commande de la marketplace uniquement si la marketplace canonique est absente. Exécutez la commande du plugin si open-design@open-design est manquant. Si une autre version est installée, demandez confirmation à l’utilisateur avant de la mettre à jour ou de la réinstaller ; ne sautez l’étape d’installation que si la version exacte requise est présente. Un résultat alreadyAdded: true indique une réussite. Ne modifiez pas manuellement la configuration de Codex et ne copiez pas les fichiers du plugin dans le répertoire d’accueil de Codex.',
      },
      {
        title: 'Garantir la disponibilité du MCP Open Design local',
        body:
          'Conservez tout MCP open-design existant et activé. Sinon, exécutez le programme d’installation du MCP fourni par l’application Open Design installée. Sur les systèmes POSIX, n’exécutez le chemin od résolu qu’après que sa vérification a renvoyé open-design-cli:mcp-install:v1. Si ce chemin est absent, masqué par /usr/bin/od ou si son exécution ne peut pas aboutir, utilisez /usr/bin/open avec le bundle d’application macOS signé et vérifié ainsi que --headless --mcp-install codex, puis interrogez uniquement l’instantané MCP filtré. Si aucun lanceur vérifié n’est disponible, arrêtez-vous, dirigez l’utilisateur vers Open Design Settings → MCP server pour copier l’extrait propre au client contenant le chemin absolu, puis réessayez cette étape. Ne devinez jamais un port localhost et n’exécutez jamais codex mcp login ; la connexion à Vela s’effectue dans Open Design.',
      },
      {
        title: 'Vérifier, rendre compte et démarrer une nouvelle tâche',
        body:
          'Vérifiez l’identifiant de plugin open-design@open-design, confirmez que sa version installée correspond exactement à plugin.version dans release-manifest.json, puis utilisez l’instantané MCP filtré pour confirmer la présence d’un stdio MCP activé nommé open-design. N’inspectez que name, enabled, transport.type et command ; les valeurs brutes de args, env, env_vars, headers, token, bearer token, API key et des informations d’authentification Vela ne doivent jamais apparaître dans les sorties ni dans les rapports. Le champ command doit être un chemin de lancement absolu de Open Design. Indiquez ce qui a été installé ainsi que tout prérequis restant lié à Open Design ou à la connexion à Vela. Démarrez une nouvelle tâche Codex afin qu’elle charge l’instantané du plugin installé, puis invoquez @open-design.',
      },
    ],
  },
  demo: {
    title: 'Installez-le une fois. Créez depuis Codex/ChatGPT.',
    lead:
      'Découvrez d’abord l’espace de travail complet entre Codex et Open Design, puis suivez le parcours réel, de l’installation au résultat.',
    overviewAlt:
      'Une véritable tâche Codex utilisant le plugin Open Design à côté du site web final du café Goodfield',
    overviewLabel: 'Véritable tâche Codex',
    overviewCaption:
      'Le prompt, le transfert vers Open Design, les fichiers générés et le site final restent visibles dans un même espace de travail.',
    stepListAria: 'Les cinq étapes du véritable parcours du plugin dans Codex',
    installPhase: 'Installation',
    installTitle: 'Demandez à Codex de l’installer',
    installBody:
      'Collez cette instruction dans une tâche Codex. Codex ajoute la source Git canonique de la marketplace, installe le plugin uniquement s’il est absent et finalise la configuration du MCP local sans nécessiter de référencement dans un catalogue public.',
    installNote:
      'Collez-la une seule fois dans Codex : les détails de l’installation sont pris en charge pour vous.',
    steps: [
      {
        phase: 'Utilisation',
        title: 'Démarrez une nouvelle tâche Codex',
        body:
          'Une fois l’installation terminée par Codex, ouvrez le plugin Open Design installé dans la nouvelle tâche et choisissez « Try now » pour commencer.',
        alt:
          'L’écran réel du plugin Open Design dans Codex, avec le bouton Try now',
      },
      {
        phase: 'Création',
        title: 'Rédigez le brief créatif',
        body:
          'Mentionnez Open Design, puis décrivez le livrable, le contenu, la direction visuelle et les exigences de responsive design.',
        alt:
          'Un véritable prompt Codex demandant à Open Design de créer le site web chaleureux d’un café de quartier',
      },
      {
        phase: 'Création',
        title: 'Suivez le transfert en direct',
        body:
          'Codex confirme la direction, crée le projet et transmet le travail à Open Design pendant que les fichiers apparaissent en direct.',
        alt:
          'Un véritable espace de travail Codex et Open Design pendant la génération du site web du café de quartier',
      },
      {
        phase: 'Création',
        title: 'Examinez le résultat',
        body:
          'La même tâche renvoie la landing page responsive du café Goodfield, ainsi que ses images générées et ses fichiers modifiables.',
        alt:
          'La landing page finale du café de quartier Goodfield générée dans Codex avec le plugin Open Design',
      },
    ],
  },
  use: {
    title: 'Commencez avec le prompt exact.',
    lead:
      'Sélectionnez Open Design dans le menu des plugins de Codex, décrivez le livrable, puis continuez à l’affiner dans la même tâche. Codex affiche la mention du plugin sous forme de pastille Open Design.',
    promptLabel: 'Prompt utilisé dans la tâche Codex enregistrée',
    copyPrompt: 'Copier le prompt Codex',
    galleryAria: 'Exemples créés avec Open Design',
    templates: [
      {
        alt:
          'Landing page du produit Oryzo avec un tapis de découpe tactile et un objet en liège',
        label: 'Lancement de produit',
      },
      {
        alt:
          'Landing page de l’événement Open Design Osaka avec une carte typographique',
        label: 'Page événementielle',
      },
      {
        alt: 'Site produit éditorial sombre de Fable 5',
        label: 'Site éditorial',
      },
      {
        alt:
          'Interface chronologique des modèles Open Design sur une toile lumineuse',
        label: 'Récit interactif',
      },
    ],
    promptListAria: 'Exemples de prompts Open Design Cloud',
    prompts: [
      { title: 'Site web' },
      { title: 'Présentations' },
      { title: 'Prototype' },
      { title: 'Système de design' },
    ],
  },
  faq: {
    title: 'Vos questions avant l’installation',
    lead:
      'Codex garde le contrôle de la tâche. Open Design prend en charge le workflow visuel.',
    items: [
      {
        q: 'Qu’apporte le plugin à Codex ?',
        a:
          'Il ajoute à Codex un workflow Open Design pour les sites web, les présentations, les prototypes et les systèmes de design. Le plugin se connecte à Open Design MCP en local pour gérer les briefs, les projets et la génération des livrables.',
      },
      {
        q: 'Quels environnements Codex sont pris en charge ?',
        a:
          'Le package actuel prend en charge Codex Desktop et Codex CLI. Codex est le premier hôte pris en charge.',
      },
      {
        q: 'De quoi ai-je besoin avant l’installation ?',
        a:
          'Utilisez Codex CLI 0.144.6 ou une version ultérieure, ainsi que Open Design 0.17.0 ou une version ultérieure. Installez Open Design avant d’enregistrer son MCP local.',
      },
      {
        q: 'Pourquoi dois-je créer une nouvelle tâche Codex ?',
        a:
          'Codex charge les fonctionnalités du plugin et du MCP au démarrage d’une tâche. Une nouvelle tâche détecte le plugin Open Design Cloud fraîchement installé.',
      },
      {
        q: 'La fenêtre Open Design doit-elle rester ouverte ?',
        a:
          'Non. Le MCP local enregistré peut démarrer l’environnement Open Design signé en mode headless lorsqu’il en a besoin.',
      },
    ],
  },
  final: {
    aria: 'Installer Open Design Cloud dans Codex/ChatGPT',
    title: 'Ajoutez Open Design à votre prochaine tâche Codex/ChatGPT.',
    bodyBeforeMention: 'Installez le plugin, connectez le MCP local et invoquez',
    bodyAfterMention: '.',
    copy: 'Copier',
    download: 'Télécharger Open Design',
    source: 'Voir le code source',
  },
  clipboard: {
    copying: 'Copie…',
    copied: 'Copié',
    failed: 'Sélectionner et copier',
  },
  schema: {
    pageName: 'Plugin Open Design Cloud pour Codex/ChatGPT',
    applicationName: 'Plugin Open Design Cloud pour Codex/ChatGPT',
  },
};

export default copy;
