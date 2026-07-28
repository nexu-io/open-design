// French (fr) overrides for the Codex Slides landing copy.
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const fr: DeepPartial<CodexSlidesCopy> = {
  title: "Codex Slides — le studio de slides IA open source dans Codex · PPTX & PDF",
  description:
    "Codex Slides est un studio de slides IA open source qui vit à l'intérieur de Codex. Décrivez une présentation — ou pointez-le vers un dépôt, un PDF ou un tableur — et votre Codex local recherche, structure, met en forme, rend et exporte un vrai PPTX ainsi qu'un PDF prêt à imprimer. Chaque diapositive est une toile visuelle pleine page. 45 modèles de présentation, 73 styles communautaires, 24 scénarios guidés ; le Fast mode rend plus de 10 diapositives en 4 à 5 minutes environ. Browser-first, sous licence MIT, il fonctionne avec votre `codex login` existant, sans aucune clé API supplémentaire.",
  label: "Projet frère",
  heading: "Le studio de slides IA au cœur de votre agent de code",
  lead:
    "La plupart des générateurs de slides IA cachent le travail derrière une seule requête et vous rendent un fichier. Codex Slides garde toute la chaîne vivante dans Codex — recherche, plan, direction visuelle, rendu, édition, présentation, export — et chaque deck reste un projet durable sur votre propre disque. Approche image-native : chaque diapositive est une toile visuelle complète, pas un gabarit dont on a remplacé le texte.",
  downloadCta: "Télécharger Open Design",
  heroAlt:
    "Codex Slides — à gauche, Codex pilote le studio de slides dans le navigateur ; à droite, une diapositive de rapport de marché déjà rendue",

  glanceAria: "En un coup d'œil",
  glance: {
    stars: "Étoiles GitHub",
    templates: "Modèles de présentation",
    styles: "Styles communautaires",
    scenarios: "Scénarios guidés",
    license: "Licence",
  },

  whyTitle: "Pourquoi ce projet existe",
  whyLead:
    "Un deck n'est pas un problème de génération en un coup. C'est une suite de décisions — quoi dire, dans quel ordre, dans quel langage visuel — et chacune coûte bien moins cher à corriger avant le rendu qu'après.",
  ideas: [
    {
      headline: "Vous regardez faire au lieu d'attendre un fichier.",
      body: "Codex ouvre le studio dans son navigateur et le garde sous vos yeux. Vous validez le brief, révisez le plan et approuvez la direction visuelle avant qu'une seule page ne soit rendue — les erreurs coûteuses sont ainsi corrigées tant qu'elles sont encore bon marché.",
    },
    {
      headline: "Chaque deck est un projet durable, pas un téléchargement.",
      body: "Conversation, sources, plan, règles de marque, points de sauvegarde et pages rendues restent sur le disque. Revenez demain et continuez à éditer le même projet ; chaque commande IA et chaque retouche manuelle laisse un point de sauvegarde immuable que vous pouvez inspecter, restaurer ou exporter.",
    },
    {
      headline: "Image-native — la diapositive est la toile.",
      body: "Chaque page est composée comme une seule toile visuelle pleine page, et non comme un bloc de texte posé sur un thème : c'est pour cela que le résultat tient la comparaison avec des decks dessinés à la main. Annotez directement une diapositive et régénérez cette seule page à partir de vos annotations.",
    },
  ],

  flowTitle: "Comment ça marche",
  flowLead:
    "Un prompt en entrée, un deck prêt à présenter en sortie — avec un point de contrôle à chaque étape où votre jugement vaut mieux qu'un appel de modèle de plus.",
  flow: [
    { step: "01", headline: "Clarifier le brief", body: "Un formulaire de questions sur mesure confirme l'audience, le nombre de pages, le format d'image, la langue, la résolution et l'intention visuelle avant la moindre ligne écrite." },
    { step: "02", headline: "Vérifier les faits", body: "Une recherche web multi-tours optionnelle produit un brief Markdown sourcé, qui reste consultable et modifiable dans Design Files." },
    { step: "03", headline: "Façonner le plan", body: "Modifiez chaque titre et chaque argument, ajoutez ou supprimez des diapositives, réorganisez le récit ou demandez à l'agent de le restructurer — avant que les visuels n'existent." },
    { step: "04", headline: "Verrouiller la direction visuelle", body: "Codex Slides classe sa bibliothèque de styles en fonction de votre sujet et de votre plan. Choisissez-en un, explorez tout le catalogue ou gardez celui par défaut." },
    { step: "05", headline: "Rendre en parallèle", body: "Le Fast mode lance toutes les pages en même temps plutôt qu'une par une : un deck de plus de 10 diapositives arrive en quatre à cinq minutes environ, la direction restant verrouillée." },
    { step: "06", headline: "Éditer sur place", body: "Demandez une réécriture, entourez une zone avec des flèches et des commentaires, remplacez une image, réordonnez les pages, réglez les transitions et rédigez les notes de l'orateur." },
    { step: "07", headline: "Présenter et exporter", body: "Lancez le Presenter Mode avec une fenêtre public synchronisée et un minuteur, puis téléchargez un vrai PPTX et un PDF prêt à imprimer, notes comprises." },
  ],

  showcaseTitle: "À quoi ressemblent les decks",
  showcaseLead:
    "Chaque carte est un système visuel livré avec Codex Slides — une direction finie dont vous pouvez partir, avant d'y injecter votre sujet, votre audience ou vos fichiers.",
  showcase: [
    { alt: "Deck de rapport business et marché avec graphiques et indicateurs clés mis en avant", tag: "Rapport de marché · graphiques & KPI" },
    { alt: "Deck de tableau de bord de données avec planisphère, graphique en anneau et tuiles de mesures", tag: "Récit de données · tableau de bord" },
    { alt: "Diapositive de keynote produit cinématographique avec un titre très contrasté", tag: "Keynote · cinématographique" },
    { alt: "Deck éditorial façon magazine, titres en serif et grille d'imprimeur", tag: "Éditorial · grille d'imprimeur" },
    { alt: "Diapositive de keynote produit claire et aérée, nœuds de diagramme 3D doux et un seul accent indigo", tag: "Keynote · clean daylight" },
    { alt: "Diapositive technique en vue éclatée annotée reconstruisant un système en coupe", tag: "Technique · vue éclatée annotée" },
  ],

  insideTitle: "Le vrai produit",
  insideLead:
    "Ce sont les écrans réels que Codex pilote dans son navigateur, exactement ceux que vous utiliseriez à la main, pour pouvoir intervenir et reprendre la main à tout moment.",
  inside: [
    { alt: "Accueil de Codex Slides avec le composeur de prompt, les raccourcis de scénarios et les styles communautaires", tag: "Accueil · décrivez votre deck" },
    { alt: "Bibliothèque de scénarios avec des workflows de présentation préconfigurés", tag: "Scénarios · choisir un workflow" },
    { alt: "Plan de présentation modifiable avec titres et points clés", tag: "Plan · façonner l'histoire" },
    { alt: "Éditeur de diapositive avec la toile entière visible, barre d'outils, notes de l'orateur et vignettes", tag: "Éditeur · toile entière" },
  ],

  scenariosTitle: "Six familles de workflows",
  scenariosLead:
    "Vingt-quatre scénarios guidés, regroupés en six familles de workflows. Chaque famille apporte ses propres questions, ses emplacements de sources et sa grammaire visuelle. Partez de l'une d'elles, ou décrivez simplement ce dont vous avez besoin.",
  scenarios: [
    { name: "Créer de zéro", blurb: "Rapports d'activité, decks de levée et propositions de projet à partir d'un seul brief." },
    { name: "Transformer une source", blurb: "Embellir un PPTX, un HTML ou un PDF existant ; convertir documents, notes ou photo de tableau blanc en diapositives." },
    { name: "Données & insights", blurb: "Tableaux de bord, rapports de performance récurrents, résultats financiers et restitutions d'enquêtes." },
    { name: "Recherche & décisions", blurb: "Présentations de recherche approfondie, études de marché, analyses concurrentielles, revues de littérature." },
    { name: "Optimiser un deck", blurb: "Appliquer une charte de marque, reproduire un style de référence, traduire et localiser, condenser ou développer." },
    { name: "Formats spécialisés", blurb: "Supports de formation, keynotes de lancement, portfolios et études de cas, séries pilotées par modèle." },
  ],

  formatsTitle: "De vrais fichiers à transmettre",
  formatsLead:
    "Quand le deck est au point, exportez une vraie PowerPoint (.pptx) et un PDF prêt à imprimer, tous deux avec vos notes de l'orateur. Choisissez la qualité de rendu et le format adapté à la salle ou au feed :",
  formatsRows: [
    { label: "Formats d'export", values: "PowerPoint (.pptx) · PDF · notes de l'orateur conservées" },
    { label: "Qualité de rendu", values: "1K · 2K · 4K" },
    { label: "Formats d'image", values: "16:9 · 4:3 · 1:1 · 9:16 · 3:4" },
  ],

  duoTitle: "Rapide et sans friction",
  fastTitle: "Fast mode",
  fastLead:
    "Les pages sont rendues en parallèle — jusqu'à quatre en vol, le reste en file d'attente — au lieu de l'une après l'autre, pendant que le plan approuvé et la direction visuelle restent verrouillés. Un deck de dix diapositives arrive en général en quatre à cinq minutes, et une exécution interrompue reprend depuis l'état enregistré du projet plutôt que de tout recommencer.",
  installTitle: "Installer dans Codex",
  installLead:
    "Ajoutez le dépôt comme place de marché de plugins, installez le plugin, redémarrez Codex et lancez une nouvelle tâche. Il vous faut Codex avec la prise en charge des plugins, Node.js 20 ou plus récent et un `codex login` — aucune clé OpenAI séparée ni fichier `.env` pour le workflow par défaut.",

  finalEyebrow: "Étape suivante",
  tiebackTitle: "De la famille Open Design",
  tiebackBody:
    "Open Design est l'espace de design ouvert et local-first qui se place à l'extérieur de l'agent de code que vous utilisez déjà. Codex Slides applique la même idée aux présentations : votre agent travaille à découvert, le projet reste sur votre machine, et rien n'est enfermé derrière un abonnement. Pour la boîte à outils de design complète au-delà des slides, installez l'application Open Design.",

  schemaAlternateName: "Le studio de slides IA open source dans Codex",
  schemaWhatQuestion: "Qu'est-ce que Codex Slides ?",
  schemaWhatAnswer:
    "Codex Slides est un studio de slides IA open source, sous licence MIT, qui s'exécute comme plugin dans Codex. Il transforme un prompt, un dépôt ou un ensemble de fichiers en un deck prêt à présenter via un workflow visible — clarification, recherche optionnelle, plan, direction visuelle, rendu parallèle, édition, présentation et export PPTX/PDF — et conserve chaque deck comme un projet durable sur votre propre disque.",
  schemaKeyQuestion: "Codex Slides nécessite-t-il une clé API séparée ?",
  schemaKeyAnswer:
    "Non. Il fonctionne avec le compte ChatGPT que vous avez déjà authentifié via `codex login`. Le workflow par défaut ne demande ni clé API OpenAI séparée ni fichier `.env` ; il requiert Codex avec la prise en charge des plugins, Node.js 20 ou plus récent, et Git.",
  schemaExportQuestion: "Codex Slides peut-il exporter de vrais fichiers PowerPoint ?",
  schemaExportAnswer:
    "Oui. Codex Slides exporte un vrai PPTX et un PDF prêt à imprimer, tous deux avec les notes de l'orateur du projet, en qualité de rendu 1K/2K/4K et dans cinq formats d'image (16:9, 4:3, 1:1, 9:16, 3:4). Parce qu'il est image-native, les diapositives PPTX exportées contiennent des images pleine page plutôt que des formes PowerPoint modifiables une à une ; l'export en formes éditables figure sur la feuille de route.",
  schemaRelationQuestion: "Codex Slides est-il lié à Open Design ?",
  schemaRelationAnswer:
    "Oui. Codex Slides est un projet frère porté par l'équipe derrière Open Design — la même approche ouverte, local-first et agent-native, appliquée aux présentations plutôt qu'aux fichiers de design.",
};

export default fr;
