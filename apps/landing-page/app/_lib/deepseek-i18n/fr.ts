/*
 * Textes français de la collection design DeepSeek Harness.
 * Traduits depuis la version anglaise de référence.
 */
import type { DeepseekCopyOverride } from './index';

export const fr: DeepseekCopyOverride = {
  collectionEyebrow: 'Sélection éditoriale',
  collectionHeading: 'Les plugins DeepSeek Harness pour le design',
  collectionLede:
    'Une sélection de plugins dsh pour le design : des ponts de vision qui lisent les captures d’écran, des canevas et de l’UI générative où l’agent peut dessiner, des outils de revue de design et des workbenches qui prévisualisent le tout. DeepSeek Harness lit le même format SKILL.md que Claude Code et Codex : votre bibliothèque de skills design vous suit.',
  collectionStats: [
    { value: '19', label: 'plugins dsh sélectionnés' },
    { value: '19', label: 'dépôts sources' },
    { value: 'SKILL.md', label: 'partagé avec Claude Code & Codex' },
  ],
  collectionIntro:
    'Chaque plugin dsh ci-dessous existe vraiment, est natif DeepSeek Harness, se découvre via le topic dsh-plugin sur GitHub et renvoie à sa source. Ils remplissent quatre rôles : donner la vision au harness purement textuel, lui donner des surfaces de design où dessiner, câbler la revue de design dans la boucle, et transformer son UI web en workspace de design.',
  collectionCategoryBlurbs: [
    'Transformez captures d’écran, maquettes et graphiques en preuves structurées qu’un modèle purement textuel peut exploiter.',
    'Donnez à l’agent des surfaces où dessiner : canvas vectoriels éditables, cartes d’UI vivantes, slides.',
    'Bouclez la boucle : annotez de vraies pages, compilez des assets de motion, emportez votre bibliothèque de skills.',
    'Faites du harness lui-même un workspace de design : panneaux d’aperçu, workbenches et boards à côté du chat.',
  ],
  collectionCloserHeading: 'Passez la config. Designez avec DeepSeek Harness dans OpenDesign',
  filterAll: 'Tout',
  collectionCloserBody:
    'OpenDesign est le workspace de design open source et agent-native qui tourne autour de DeepSeek Harness. Il garde vos systèmes, vos skills et vos templates cohérents pour que l’agent livre un travail qui vous appartient.',

  categoryVision: 'Vision & entrée',
  categoryCanvas: 'Canvas & UI générative',
  categoryWorkflow: 'Workflow de design',
  categoryWorkspace: 'Workspace & aperçu',

  ctaDownload: 'Télécharger OpenDesign',
  ctaStarList: 'Star DeepSeek Harness',
  ctaGuide: 'Comment designer avec DeepSeek Harness',
  ctaBrowseAll: 'Parcourir tous les plugins',
  ctaViewSource: 'Voir la source',
  ctaOurRepo: 'deepseek-harness sur GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Ce qu’il fait',
  cardCta: 'Voir le plugin',

  detailWhatIsIt: 'De quoi il s’agit',
  detailWhyForDesign: 'Pourquoi ça compte pour le design',
  detailHowWithAgent: 'Comment le faire tourner avec DeepSeek Harness',
  detailExampleTag: 'Quand y avoir recours',
  detailSource: 'Source',
  detailCategory: 'Catégorie',
  detailMaintainer: 'Auteur',
  detailTags: 'Tags',
  detailLicense: 'Licence',
  detailCovers: 'Ce que ça couvre',
  detailUpstream: 'Depuis le README en amont',
  detailAgentNote: 'Compatible DeepSeek Harness',
  detailTraction: 'Traction',
  detailRepo: 'Dépôt source',
  detailStars: 'Stars',

  installHeading: 'Comment l’installer',
  installRunInAgent: 'Lancez ceci dans un terminal.',
  installRestart: 'Redémarrez dsh web pour qu’il charge le plugin.',
  installClone: 'Clonez le dépôt.',
  installPoint: 'Pointez DeepSeek Harness sur le fichier du skill.',
  installThenUse: 'Décrivez ensuite le design voulu. Le harness récupère les outils du plugin.',

  installNote:
    'Chaque plugin présenté ici est gratuit à installer et renvoie à sa vraie source amont.',
  installNoteCta: 'Parcourir toute la collection',
  detailMoreOnList: 'Plus dans le dépôt DeepSeek Harness',
  detailRelated: 'Autres plugins design pour DeepSeek Harness',
  finalEyebrow: 'Prochaine étape',
  detailCloserHeading: 'Designez avec OpenDesign, sans la config',
  detailCloserBody:
    'Installez ce plugin vous-même, ou faites tourner toute une couche design sélectionnée autour de DeepSeek Harness avec OpenDesign. Apportez votre clé, gardez la main sur ce que vous produisez.',

  skills: {
    modlens: {
      tagline: 'Donne aux modèles DeepSeek purement textuels une vision par plugin : collez une capture, obtenez des preuves structurées.',
      whatIsIt:
        'Un pont visuel pour les agents de code purement textuels. Collez une image dans le chat et modlens la convertit en preuves JSON structurées — transcription complète, régions de mise en page dans l’ordre de lecture, entités et relations — au lieu d’une supposition du modèle.',
      whyForDesign: [
        'Les captures d’UI deviennent des parcours élément par élément sur lesquels l’agent peut agir.',
        'Les graphiques denses et les visualisations de données sont lus intégralement : axes, échelles, palettes, zones mises en avant.',
        'Collez plusieurs références à la fois : il identifie la famille visuelle commune avant de décrire chacune.',
      ],
      howWithAgent: [
        'Installez le plugin ; le sélecteur de modèles gagne des variantes DeepSeek-V4 avec la vision modlens.',
        'Collez une capture, une maquette ou un graphique directement dans la conversation.',
        'Posez vos questions de design sur les preuves structurées au lieu de redécrire l’image.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline: 'Dix outils de vision pour la restauration d’UI, le grounding et la vérification par pixel diff.',
      whatIsIt:
        'Un bundle natif DeepSeek Harness de dix outils de vision : questions-réponses sur image, grounding et détection avec coordonnées en pixels, OCR de captures longues, recadrage, extraction de couleurs, captures HTML et pixel diff. Les outils se montent progressivement via un skill vision-tools.',
      whyForDesign: [
        'La restauration d’UI boucle avec des chiffres : un workflow versionné fait passer une reconstruction de 6,04 % d’écart pixel à 0 %.',
        'Grounding et détection renvoient des boîtes en pixels de l’image d’origine : l’agent agit sur des coordonnées au lieu d’analyser de la prose.',
        'Les infographies et les croquis à main levée deviennent des interfaces HTML/CSS éditables.',
      ],
      howWithAgent: [
        'Ajoutez le plugin à votre profil web ou headless et définissez un identifiant de vision pour les outils distants.',
        'Activez le toolkit ; le skill vision-tools monte les dix schémas d’outils.',
        'Reconstruisez une référence, puis vérifiez avec vision_html_screenshot et vision_pixel_diff.',
      ],
    },
    'dsh-ui-spec': {
      tagline: 'Transforme des captures d’UI en specs prêtes à implémenter : tokens, échelle d’espacement, grille de mise en page.',
      whatIsIt:
        'Un unique outil analyze_ui_image qui convertit une capture ou une maquette en spec frontend structurée. Une couche géométrique déterministe mesure dimensions exactes, palette, design tokens suggérés, grille de mise en page et échelle d’espacement ; un modèle de vision optionnel ajoute la sémantique par-dessus.',
      whyForDesign: [
        'Coordonnées en pixels, échelles d’espacement et palettes de tokens sont calculées de façon déterministe, pas devinées par un modèle de vision.',
        'Les champs de la spec se mappent droit sur l’implémentation : tokens suggérés vers design tokens, échelle d’espacement vers le CSS.',
        'Les rôles sémantiques fournissent l’intention, la géométrie fournit le placement, le tout fusionné en une seule spec JSON + Markdown.',
      ],
      howWithAgent: [
        'Ajoutez le plugin ; la couche géométrique fonctionne hors ligne, sans aucune configuration.',
        'Pointez au besoin la couche sémantique vers n’importe quel endpoint de vision compatible OpenAI.',
        'Donnez une capture à l’agent et construisez à partir de la spec renvoyée plutôt que de l’image.',
      ],
    },
    'dsh-media-skills': {
      tagline: 'Des yeux gratuits et un pinceau gratuit : lecture d’images collées et génération d’images sans filigrane.',
      whatIsIt:
        'Deux skills SKILL.md et une route de modèle de vision gratuite pour le harness : vision-review lit les captures et attrape les bugs visuels, media-tools génère illustrations, avatars, fonds et bannières — le tout sur des modèles en offre gratuite.',
      whyForDesign: [
        'Attrape les bugs visuels d’UI qu’un agent textuel ne peut pas voir : chevauchement, débordement, désalignement.',
        'Génère des assets de design sans filigrane sur une offre gratuite : l’exploration ne coûte rien.',
        'Ajoute un bouton « Add image » aux sessions purement textuelles ; les images collées sont décrites au modèle courant.',
      ],
      howWithAgent: [
        'Ajoutez le plugin et déposez les clés API gratuites dans le magasin d’identifiants du harness.',
        'Redémarrez dsh web ; le sélecteur de modèles gagne une route de vision gratuite.',
        'Demandez la revue d’une capture, ou un nouvel asset, en langage naturel.',
      ],
    },
    'dsh-openpencil': {
      tagline: 'L’agent designe sur un vrai canvas vectoriel éditable au lieu de renvoyer des images statiques.',
      whatIsIt:
        'Connecte le harness à OpenPencil, un outil de design vectoriel open source et AI-native. Cinq outils permettent à l’agent de créer, éditer, rendre et inspecter des documents .op design-as-code via des lots transactionnels, avec des aperçus multi-frames et un éditeur managé pour la reprise en main humaine.',
      whyForDesign: [
        'Une seule boucle du besoin au canvas : l’agent édite le vrai document et les aperçus rendent des frames fidèles au design.',
        'Les lots transactionnels ne publient qu’en cas de succès et n’écrasent jamais les éditions externes — les conflits remontent au lieu de disparaître.',
        'Un éditeur managé avec sélection, calques, propriétés et undo permet à un humain de reprendre la sortie de l’agent à tout moment.',
      ],
      howWithAgent: [
        'Installez OpenPencil, puis ajoutez le plugin à votre profil web.',
        'Décrivez le design ; l’agent pilote openpencil_create et openpencil_edit par lots.',
        'Ouvrez l’aperçu rendu ou l’éditeur managé et continuez d’itérer sur place.',
      ],
    },
    'dsh-visualize': {
      tagline: 'Le modèle dessine des cartes HTML interactives directement dans le fil de conversation.',
      whatIsIt:
        'Un outil visualize et son skill compagnon : le modèle écrit un fragment HTML et le monte en carte interactive sandboxée dans le chat — simulateurs, graphiques, panneaux de comparaison et mockups d’UI, avec aperçu en streaming et style accordé au thème.',
      whyForDesign: [
        'Les mockups d’UI vivent dans la conversation et se cliquent, au lieu d’être seulement décrits.',
        'Les cartes suivent le thème clair/sombre et la palette de l’hôte : les aperçus paraissent natifs.',
        'Chaque carte tourne dans une iframe sandboxée avec une CSP stricte — un fragment cassé ne peut pas casser la session.',
      ],
      howWithAgent: [
        'Ajoutez le plugin et redémarrez dsh web.',
        'Demandez un mockup ou une comparaison ; le modèle appelle visualize avec son propre HTML.',
        'Rejouez la session plus tard — les cartes sont restaurées depuis le résultat d’outil persisté.',
      ],
    },
    'dsh-genui': {
      tagline: 'Plus de trente composants interactifs rendus en ligne dans les réponses, avec une boucle d’actions vers le modèle.',
      whatIsIt:
        'Le modèle décrit une interface en JSON dans une fence dsh-ui ; un moteur de rendu côté navigateur la transforme en composants vivants dans la réponse — cartes, tableaux, graphiques, formulaires, onglets, chronologies, diffs, mermaid, scènes 3D — qui apparaissent au fil du streaming.',
      whyForDesign: [
        'Les réponses deviennent des interfaces : panneaux de données, graphiques et formulaires se rendent là où se joue l’explication.',
        'Les composants interactifs renvoient des actions au modèle, qui met l’UI à jour en retour.',
        'Une liste blanche de composants et un garde de spec : un graphique cassé n’atteint jamais l’écran.',
      ],
      howWithAgent: [
        'Ajoutez le plugin depuis GitHub et redémarrez dsh web.',
        'Demandez un dashboard, un quiz ou un formulaire ; le modèle écrit lui-même la fence dsh-ui.',
        'Interagissez avec le résultat — les actions locales répondent instantanément, les actions modèle bouclent vers lui.',
      ],
    },
    'dsh-openmaic': {
      tagline: 'Slides, widgets interactifs et leçons jouables complètes, rendus depuis du JSON écrit par l’agent.',
      whatIsIt:
        'Quatre outils et un skill d’enseignement socratique du groupe THU-MAIC : l’agent écrit du JSON de slides façon PPTist rendu par le moteur officiel OpenMAIC, streame des widgets interactifs en cartes sandboxées, et peut soumettre une requête d’une ligne qui revient sous forme de salle de classe jouable.',
      whyForDesign: [
        'Des decks de slides avec texte, formes, images, tableaux, graphiques, formules et code — écrits en JSON dans la conversation.',
        'Les simulations interactives et les jeux se rendent sur place en cartes sandboxées.',
        'Une leçon complète avec contenu visuel tient en une requête, renvoyée sous forme de lien jouable.',
      ],
      howWithAgent: [
        'Ajoutez le plugin depuis GitHub ; il est livré compilé, donc aucune étape de build.',
        'Redémarrez dsh web et demandez un deck ou un widget.',
        'Pour des leçons entières, openmaic_generate interroge le service OpenMAIC et renvoie le lien de la classe.',
      ],
    },
    'dsh-web-review': {
      tagline: 'Pointez des éléments sur une page live, annotez visuellement, et l’agent édite la source.',
      whatIsIt:
        'Un navigateur intégré à l’UI web du harness : survolez et sélectionnez des éléments comme dans un outil de design, attachez des notes et essayez des ajustements visuels en direct — texte, couleur, typo, taille, espacement, bordures, effets. Les annotations embarquent sélecteurs et indices de source pour que l’agent retrouve et corrige le code.',
      whyForDesign: [
        'Pointer et annoter visuellement remplace la description des problèmes d’UI avec des mots.',
        'Les ajustements en direct prévisualisent un changement sur la page avant de toucher au moindre code.',
        'Livré avec huit skills de design intégrés, de better-typography à interface-review, utilisables depuis l’éditeur d’annotations.',
      ],
      howWithAgent: [
        'Ajoutez le plugin et lancez dsh web.',
        'Ouvrez votre app en cours d’exécution dans l’onglet Web Preview et annotez ce qui doit changer.',
        'Envoyez — l’agent reçoit sélecteurs, notes et valeurs essayées, puis édite la source du workspace.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline: 'Compile chemins SVG et keyframes en animations Lottie autonomes, depuis la conversation.',
      whatIsIt:
        'Deux outils qui transforment des données de design en assets de motion : lottie_compile_shape convertit un chemin SVG en valeurs de forme Lottie, et lottie_compile assemble un JSON Lottie complet à partir d’une spec de calques compacte — rectangles, dégradés, chemins, images embarquées et texte, avec animation par keyframes calque par calque.',
      whyForDesign: [
        'Décrivez une animation de chargement en langage naturel et obtenez un .lottie.json qui tourne sur iOS, Android et le web.',
        'Les tangentes bézier in/out et l’easing des keyframes sont compilés, pas écrits à la main.',
        'Zéro étape de build et ESM pur : ce qui est publié est exactement ce qui tourne.',
      ],
      howWithAgent: [
        'Ajoutez le plugin depuis npm, ou verrouillez un commit depuis GitHub.',
        'Décrivez le mouvement : calques, timing, easing, décalages.',
        'Déposez le .lottie.json compilé dans LottieWeb, lottie-ios ou lottie-android.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline: 'Vos skills, votre mémoire et vos instructions globales Claude Code, disponibles dans le harness sans la moindre migration.',
      whatIsIt:
        'Lit directement les emplacements de fichiers standard de Claude Code — pas de scripts de migration, pas de copie, pas de symlinks. Les skills de ~/.claude/skills rejoignent le catalogue de skills du harness, la mémoire projet est injectée en contexte à chaque requête, et les instructions globales CLAUDE.md suivent.',
      whyForDesign: [
        'Les skills de design que vous utilisez déjà dans Claude Code fonctionnent ici sans déplacer un seul fichier.',
        'La mémoire projet est relue à chaque requête : les nouvelles notes prennent effet immédiatement.',
        'Instructions globales et préférences de collaboration sont préservées d’un agent à l’autre.',
      ],
      howWithAgent: [
        'Ajoutez le plugin à votre profil ; il fonctionne sans aucune configuration.',
        'Pointez-le au besoin vers des dossiers de skills supplémentaires comme ~/.agents/skills.',
        'Invoquez vos skills existants par leur nom, comme vous le feriez dans Claude Code.',
      ],
    },
    'dsh-web-ui': {
      tagline: 'Le plus gros kit d’UI de l’écosystème : task board, panneau d’aperçu, graphe Git et centre de skins.',
      whatIsIt:
        'Une collection de plugins et de skins pour l’UI web du harness : un task board à cinq colonnes dont les cartes exécutent de vraies sessions d’agent, un panneau latéral droit avec arborescence de fichiers et aperçus multi-onglets, un graphe Git, un contrôle à distance mobile et un centre de skins à essayer avant d’appliquer.',
      whyForDesign: [
        'Le panneau latéral droit prévisualise Markdown, HTML, diffs, CSV, PDF, fichiers Office et images à côté de la conversation.',
        'Le task board transforme les todos de design en cartes qu’une vraie session d’agent dsh exécute avant de rendre compte.',
        'La largeur du panneau se règle à la souris et persiste par projet : le workspace reste tel que vous l’avez arrangé.',
      ],
      howWithAgent: [
        'Ajoutez le package agrégé à votre profil web pour tout installer d’un coup.',
        'Ouvrez le panneau latéral droit et épinglez les fichiers et aperçus sur lesquels vous travaillez.',
        'Déposez vos tâches de design sur le board et laissez les cartes s’exécuter dans de vraies sessions d’agent.',
      ],
    },
    'dsh-better-sidebar': {
      tagline: 'Un workbench complet dans la sidebar : explorateur de fichiers, aperçus riches, terminal, Git et navigateur.',
      whatIsIt:
        'Un workbench à double panneau pour l’UI web du harness : un explorateur de fichiers à chargement paresseux avec édition CodeMirror, des aperçus intégrés pour images, Markdown, HTML, PDF et fichiers Office, un vrai terminal, un panneau Git avec des diffs façon VS Code, un navigateur sandboxé embarqué et des onglets en split-pane repositionnables.',
      whyForDesign: [
        'Prévisualisez le HTML, les images et les documents produits par l’agent sans quitter la conversation.',
        'Un navigateur sandboxé embarqué ouvre votre prototype en cours d’exécution dans un onglet à côté du chat.',
        'Les plugins tiers peuvent enregistrer leurs propres onglets et prévisualiseurs de fichiers via son API de services.',
      ],
      howWithAgent: [
        'Installez avec le script en une ligne, ou ajoutez le package npm à votre profil web.',
        'Ouvrez le workbench et répartissez les onglets entre la sidebar droite et le panneau du bas.',
        'Passez en revue ce que l’agent a construit, sur place : aperçus, diffs, terminal et onglets de navigateur.',
      ],
    },
    'dsh-vision-router': {
      tagline: 'Des yeux gratuits et sans clé pour les agents purement textuels : une chaîne de vision intégrée plus onze outils au pixel près.',
      whatIsIt:
        'Un routeur de vision qui garde les pixels d’origine côté modèle de vision et DeepSeek côté raisonnement. Choisissez un groupe de modèles « + Auto Vision », collez une image, et l’agent pilote onze outils au pixel près — grounding, recadrage, pixel diff, palette, OCR, vectorisation SVG, détourage, captures HTML — sur une chaîne de repli de vision anonyme et gratuite, sans compte ni clé.',
      whyForDesign: [
        'Une boucle pixel vérifiable pour la restauration d’UI : référence → capture → pixel diff avec heatmap rouge → correction → répéter jusqu’à convergence de l’écart.',
        'Grounding et détection renvoient des boîtes en pixels de l’image d’origine, et son README documente une reconstruction vérifiée jusqu’à un diff final de 2,54 %.',
        'Extraction de palette, vectorisation SVG des icônes et détourage de fond couvrent les petites corvées de design autour d’une reconstruction.',
      ],
      howWithAgent: [
        'Ajoutez le plugin à votre profil web ; son patch de composition câble tout sans la moindre édition manuelle de fichier.',
        'Ouvrez le sélecteur de modèles et choisissez un groupe marqué « + Auto Vision » avant d’envoyer des images.',
        'Collez une capture et laissez l’agent enchaîner vision_ground, vision_crop, vision_describe et vision_pixel_diff.',
      ],
    },
    'dsh-diagram': {
      tagline: 'Transformez n’importe quel article de la session en canvas Excalidraw éditable, pas en image jetable.',
      whatIsIt:
        'Un canvas Excalidraw dans le harness : l’agent appelle diagram_create pour construire un organigramme, un schéma d’architecture, une chronologie, une hiérarchie ou une comparaison à partir d’une spec sémantique compacte, et un onglet Canvas ouvre l’éditeur complet pour affiner texte, nœuds et connexions directement dans la session.',
      whyForDesign: [
        'Éditable, pas jetable : continuez à travailler dans un vrai canvas vectoriel au lieu d’accepter une image générée statique.',
        'L’autosauvegarde compare-and-set basée sur les révisions empêche un éditeur périmé d’écraser silencieusement un travail plus récent.',
        'Exporte en .excalidraw, SVG ou PNG, et vos éditions manuelles n’atteignent l’agent que lorsque vous lui demandez d’appeler diagram_read.',
      ],
      howWithAgent: [
        'Ajoutez le plugin à votre profil web et redémarrez dsh web.',
        'Demandez un diagramme clair de l’article présent dans la session ; l’agent appelle diagram_create.',
        'Ouvrez l’onglet Canvas, éditez directement, puis exportez ou laissez l’agent relire vos modifications.',
      ],
    },
    'deepseek-harness-genui': {
      tagline: 'La tâche fait pousser une interface React ciblée — et ce que vous y choisissez revient à l’agent.',
      whatIsIt:
        'Une couche d’interface à l’exécution pour les tâches d’agent : quand le texte devient un obstacle, l’agent écrit une petite app React + TypeScript — affichée en ligne, dans Canvas, en plein écran ou sur localhost — pour expliquer une relation difficile, recueillir une décision complexe ou piloter un outil connecté après approbation limitée à la tâche.',
      whyForDesign: [
        'Les interfaces sont du React code-first : layouts, contrôles et diagrammes sont de vrais composants, pas des captures d’écran.',
        'Sélections, saisies et brouillons sauvegardés reviennent dans la tâche pour que les tours suivants de l’agent puissent les lire.',
        'Un système DESIGN.md avec quatre profils visuels garde les apps générées dans un seul langage de design.',
      ],
      howWithAgent: [
        'Exécutez la commande d’installation — elle ajoute le plugin, puis installe le Chromium dont Playwright a besoin.',
        'Demandez une interface quand l’interaction aide : un sélecteur, un modèle explorable, un explorateur de chemins de code.',
        'Interagissez, puis enchaînez — l’agent lit ce que vous avez sélectionné au lieu de vous demander de le répéter.',
      ],
    },
    'dsh-annotate': {
      tagline: 'Pointez des éléments du navigateur et envoyez à l’agent des faits structurés, pas des descriptions vagues.',
      whatIsIt:
        'Du feedback visuel dans le navigateur via une extension Chrome compagnon : /annotate passe en mode sélection, et chaque élément cliqué apporte un sélecteur, des faits DOM, les styles calculés saillants, des données d’accessibilité, votre commentaire et une capture optionnelle du viewport au tour suivant de l’agent.',
      whyForDesign: [
        'Le feedback visuel reste attaché à l’élément de la page au lieu de devenir une description vague ou une capture collée.',
        'Styles calculés et données d’accessibilité arrivent comme des faits structurés sur lesquels l’agent peut agir directement.',
        'Un pont WebSocket en loopback restreint par hôte, origine et ID d’extension garde le canal local.',
      ],
      howWithAgent: [
        'Clonez le dépôt et ajoutez le projet à un profil du harness, puis chargez son dossier browser-extension comme extension décompressée depuis chrome://extensions.',
        'Lancez /annotate, cliquez des éléments sur la page et attachez un commentaire à chacun.',
        'Envoyez — les faits capturés et la capture du viewport arrivent dans le tour suivant de l’agent.',
      ],
    },
    'dsh-hyperframes': {
      tagline: 'HyperFrames by HeyGen, porté : cinq skills officiels qui transforment le HTML en vidéo finie.',
      whatIsIt:
        'Une seule installation enregistre dans le harness les cinq skills officiels HyperFrames by HeyGen : composition vidéo HTML avec styles visuels, palettes, sous-titres et transitions audio-réactives, la CLI hyperframes, le registre de composants, un pipeline site-vers-vidéo et une référence d’animation GSAP.',
      whyForDesign: [
        'Le motion design dans le médium où vous travaillez déjà : HTML et CSS deviennent de la vidéo rendue.',
        'Un pipeline site-vers-vidéo en sept étapes transforme une URL en clip produit.',
        'Les skills utilisent le format ouvert SKILL.md : le même jeu se transporte vers Claude Code, Cursor et Codex.',
      ],
      howWithAgent: [
        'Ajoutez le plugin à votre profil web et redémarrez.',
        'Dites « transforme cette URL en vidéo HyperFrames » pour déclencher le pipeline.',
        'Rendez via la CLI hyperframes ; Node 22+ et FFmpeg sont les seules dépendances.',
      ],
    },
    'dsh-web-preview': {
      tagline: 'Un panneau latéral effet verre qui prévisualise le workspace, exécute le projet et annote les éléments.',
      whatIsIt:
        'Un panneau latéral d’aperçu web pour l’UI web du harness : les fichiers du workspace sont servis pour l’aperçu — Markdown rendu, code avec numéros de ligne, images et HTML tels quels — les projets détectent leur type automatiquement (Cargo, package.json, go.mod, Python) et s’exécutent avec des logs en direct, et un mode marquage renvoie les annotations d’éléments dans la conversation.',
      whyForDesign: [
        'Le prototype que l’agent vient d’écrire s’ouvre à côté du chat, barre d’adresse synchronisée et largeur de panneau réglable à la souris.',
        'Le mode marquage surligne les éléments au survol, capture un sélecteur et un instantané HTML, et envoie votre note dans la conversation.',
        'Liens, chemins de fichiers et fichiers déposés s’ouvrent tous dans le panneau : la revue ne quitte jamais la session.',
      ],
      howWithAgent: [
        'Installez le package dans le dossier de votre profil web, puis montez-le en ajoutant une entrée insert nommée dsh-web-preview-panel dans le cordis.patch.yml de ce profil.',
        'Redémarrez dsh web et ouvrez le bouton d’aperçu ▶ en haut à droite de la conversation.',
        'Exécutez le projet depuis le panneau, annotez des éléments et envoyez logs ou notes directement à l’agent.',
      ],
    },
  },
};
