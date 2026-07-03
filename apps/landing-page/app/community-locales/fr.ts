import type { DeepPartial, CommunityCopy } from '../community-i18n';

const fr: DeepPartial<CommunityCopy> = {
  hub: {
    title: "Communauté — Open Design",
    desc: "La communauté Open Design : des contributeurs qui livrent en public, des ambassadeurs qui animent des ateliers locaux et des modérateurs qui gardent le Discord chaleureux.",
    heroTitle: "L'open design <em>prend forme</em><br/>quand vous le livrez.",
    heroLead:
      "Open Design est construit par des personnes, en public. Skills, systèmes DESIGN.md, plugins, docs : chaque commit est un coup de pinceau. Choisissez une porte ci-dessous, trouvez votre salle.",
    cardMetaH: "Frappée automatiquement au premier merge",
    cardMetaS: "PNG · partagée sur X",
    cardHeroAlt:
      "Carte d'honneur d'un contributeur Open Design — @dev-kp-eloper, top 99,9 %, palier Giotto",
    cards: [
      {
        ord: "I",
        title: "Contributeurs",
        sub: "Les mains qui <em>livrent</em> le travail.",
        body: "Les mainteneurs, les classements hebdomadaires, le palmarès de tous les temps et les issues ouvertes que vous pouvez réclamer dès aujourd'hui. Plus le chemin sans code pour que les non-développeurs envoient leur première pièce dans le registre.",
      },
      {
        ord: "II",
        title: "Ambassadeurs",
        sub: "La <em>voix</em> d'Open Design dans votre ville.",
        body: "Ouvrez un atelier local. Organisez les rencontres, les démos, les critiques nocturnes. Soutenu par un budget, du matériel et un canal privé vers l'équipe centrale.",
      },
      {
        ord: "III",
        title: "Modérateurs",
        sub: "La salle où se retrouvent les <em>contributeurs</em>.",
        body: "La première ligne de l'ère du design par agent. Discord est l'endroit où se rassemblent les designers IA-natifs les plus affûtés du monde. Rencontrez les gardiens qui gardent la salle chaleureuse.",
      },
    ],
  },
  contributors: {
    title: "Contributeurs — Open Design",
    desc: "Contribuez à Open Design : mainteneurs, classements hebdomadaires et de tous les temps, good first issues et un chemin sans code pour livrer votre première pièce.",
    heroTitle: "Les mains qui <em>livrent</em> le travail.",
    heroLead:
      "Open Design est construit par des personnes, en public. Skills, systèmes DESIGN.md, plugins, docs : chaque commit est un coup de pinceau. Choisissez une issue, envoyez une PR et gagnez une carte d'honneur unique dès l'instant où vous êtes mergé.",
    showcase: {
      kicker: "Tout devient un plugin",
      h2: "Open Design comme une scène. <em>Votre travail</em> comme le spectacle.",
      intro:
        "L'atelier est aussi une galerie. Vous aider à faire le travail n'est que la moitié de l'adresse ; s'assurer que la salle vienne le regarder est l'autre. Chaque pièce que vous livrez n'atterrit pas dans un coffre mais sur un mur, où le monde peut la trouver.",
      tenets: [
        {
          h3: "Tout <em>peut devenir un plugin</em>.",
          body: "Tout ce que produit le studio (un contenu, un produit fini, un template, un Skill, un workflow) peut être replié dans un plugin. Le registre accepte n'importe quelle forme ; la porte ne garde aucun gardien.",
        },
        {
          h3: "Votre première pièce, votre <em>intronisation</em>.",
          body: "Le jour où votre première pièce atterrit dans le registre, votre nom rejoint le mur. Pas un badge de visiteur. Une ligne permanente sur la liste des contributeurs, à côté de tous ceux qui sont arrivés avant.",
        },
        {
          h3: "Une fois dedans, <em>elle voyage</em>.",
          body: "Le registre à <a href=\"https://open-design.ai/plugins/\" target=\"_blank\" rel=\"noopener\">open-design.ai/plugins</a> n'est que le seuil. De là, les pièces les plus fortes sont portées vers l'extérieur : vers X, vers le <span class=\"num\">#showcase</span> de Discord, vers la newsletter, vers les bobines vidéo. Chaque relais élargit la salle ; le monde rencontre votre main.",
        },
        {
          h3: "Besoin d'un <em>premier coup de pinceau</em> ?",
          body: "Parcourez le <a href=\"https://open-design.ai/plugins/\" target=\"_blank\" rel=\"noopener\">registre de plugins</a>. Les œuvres qui y sont accrochées sont le petit bois pour les vôtres. Empruntez l'étincelle, puis faites la pièce que seule votre main pouvait faire.",
        },
      ],
      pane: {
        kicker: "Le skill",
        h3: "Laissez l'<em>agent</em> livrer pour vous.",
        lede: "Pour les créateurs qui préfèrent ne pas toucher au code. Toute la contribution tient dans un seul skill, formulé en langage clair. Le travail de pinceau revient à l'agent.",
        copy: "Copier",
        copied: "Copié",
        steps: [
          {
            h4: "Confiez la ligne à l'agent",
            body: "Collez la commande ci-dessus dans l'agent au sein d'Open Design, ou dans celui que vous gardez déjà sous la main : Claude Code, Codex, Cursor. Il s'installe tout seul.",
          },
          {
            h4: "Réveillez le skill",
            body: "Tapez <code>/od-contribute</code>, ou dites simplement à l'agent d'exécuter ce que vous venez d'installer. L'une ou l'autre formule ouvre la porte.",
          },
          {
            h4: "Une demi-minute jusqu'à la galerie",
            body: "L'agent parcourt le reste. Votre pièce part vers le dépôt open-source en une trentaine de secondes ; nous relisons à la première occasion, et dès qu'elle atterrit, la salle rencontre votre main.",
          },
        ],
      },
    },
    maintainers: {
      kicker: "À la barre du navire",
      h2: "Les <em>mainteneurs</em>.",
      intro:
        "Les mainteneurs protègent la direction et la qualité d'Open Design : ils relisent les contributions, maintiennent la cohérence du standard et font de la place pour que davantage de contributeurs gagnent leur place dans le projet.",
      role: "Mainteneur",
      bios: {
        'Nagendhra-web':
          "Nagendhra apporte l'instinct d'un ingénieur des données pour la vérité en production : trouver la panne, mesurer le cas limite et le corriger correctement. Dans Open Design, cela se traduit par le travail de préparation des déploiements, le durcissement de l'empaquetage des assets et des correctifs Windows qui rendent le projet digne de confiance quand les contributeurs livrent.",
        'Sid-Qin':
          "Sid est l'ingénieur généraliste doté de l'œil d'un designer pour le détail : le genre de mainteneur qui remarque à la fois le chemin CLI cassé et l'affordance d'interaction de travers. Dans Open Design, Sid garde les flux d'export, les actions de plugins, les shims Windows, la gestion des MIME et la tuyauterie des agents assez nets pour qu'une communauté puisse bâtir dessus.",
      },
    },
    allTime: {
      kicker: "Signal de tous les temps",
      h2: "Les contributeurs aux <em>racines profondes</em>.",
      intro:
        "Un registre au long cours de contributeurs talentueux qui continuent de transformer idées, correctifs et savoir-faire en standard Open Design partagé.",
      rankLabel: "Contributeur de tous les temps",
      week: "Historique du dépôt",
      quote:
        "La longue traîne compte : les systèmes de design, les correctifs de docs, les exemples et les petites réparations sont ce qui rend un langage d'open design fiable.",
      handleSuffix: "· signal de contributeur profond",
      statCommits: "Commits",
      statExternalRank: "Rang externe",
      headContributor: "Contributeur",
      headCommits: "Commits",
      headRank: "Rang",
    },
    weekly: {
      kicker: "Le signal de cette semaine",
      h2: "Dix contributeurs en tête <em>cette semaine</em>.",
      intro:
        "Un instantané de contributeurs affûtés qui livrent des PR, améliorent le produit et rendent Open Design vivant.",
      rankLabel: "Leader de cette semaine",
      week: "7 derniers jours",
      handleSuffix: "· en tête cette semaine",
      blurbTemplate:
        "{name} donne le rythme cette semaine avec {prs} PR mergées et ce savoir-faire régulier qui fait avancer Open Design.",
      statRank: "Rang",
      statPrs: "PR · 7 j",
      headContributor: "Contributeur",
      headPrs: "PR",
      headRank: "Rang",
    },
    issues: {
      kicker: "Choisissez votre première contribution",
      h2: "Issues ouvertes, <em>étiquetées pour vous</em>.",
      intro:
        "En direct depuis <span class=\"num\">label:&ldquo;good first issue&rdquo;</span> sur le dépôt Open Design. Commentez une issue pour la réclamer, et un mainteneur vous l'assignera dans la journée.",
      loading: "good first issue",
      foot: "Affichage des <span class=\"num\" id=\"issue-count\">—</span> premières good-first-issues ouvertes",
      seeAll: "Tout voir sur GitHub",
      empty: "Aucune good-first-issue ouverte pour l'instant. Revenez demain, ou ouvrez-en une vous-même",
      rateLimited:
        "Limite de débit GitHub atteinte en aperçu. Ouvrez la recherche good-first-issue en direct sur GitHub.",
    },
    onboard: {
      kicker: "Quatre étapes · tous niveaux",
      h2: "De zéro à <em>mergé</em>, en une après-midi.",
      intro:
        "Que vous soyez designer, rédacteur, ingénieur ou simplement quelqu'un qui a repéré une coquille, il y a une forme de contribution pour vous. Voici le chemin.",
      steps: [
        {
          n: "Étape 01",
          h3: "Trouvez une <em>étincelle</em>.",
          body: "Parcourez la liste des good-first-issues ci-dessus, ou ouvrez une nouvelle issue décrivant quelque chose que vous amélioreriez. Designers : les systèmes DESIGN.md sont l'entrée la plus facile.",
        },
        {
          n: "Étape 02",
          h3: "Ouvrez une PR en <em>brouillon</em>.",
          body: "Forkez, branchez, poussez. Marquez-la en brouillon. Cela signale que vous voulez un retour tôt. Mentionnez quelle issue elle ferme. La CI est rapide ; les bot-cards restent sur leur propre branche.",
        },
        {
          n: "Étape 03",
          h3: "Relisez avec <em>un humain</em>.",
          body: "Un mainteneur relit dans les 24 h. Nous sommes bienveillants, précis, et ne faisons jamais de gatekeeping. Si vous êtes bloqué, déposez le lien de la PR dans le Discord #help.",
        },
        {
          n: "Étape 04",
          h3: "Merge → <em>carte</em>.",
          body: "Le bot frappe votre carte d'honneur dès l'instant où vous êtes mergé et la pousse sur la branche bot-cards. Partagez-la sur X avec #OpenDesign, et nous republions les meilleures.",
        },
      ],
      cta: "Lire le guide de contribution",
    },
  },
  ambassadors: {
    title: "Ambassadeurs — Open Design",
    desc: "Devenez ambassadeur Open Design : ouvrez un atelier local, animez des rencontres et des critiques, et obtenez un budget, du matériel et un canal privé vers l'équipe centrale.",
    heroTitle: "Soyez la <em>voix</em> d'Open Design dans votre ville.",
    heroLead:
      "Ouvrez un atelier local. Organisez les rencontres, les démos, les critiques nocturnes. Nous vous soutenons avec un budget, du matériel et un canal privé vers l'équipe centrale.",
    program: {
      kicker: "Le programme",
      h2: "Vocation, <em>mécénat</em>, alliance.",
      applyCta: "Postuler via Google Form",
      applyNote:
        "Les ambassadeurs transforment Open Design d'un dépôt en quelque chose que les contributeurs peuvent rencontrer dans une salle, avec de l'encre sur la table et le café refroidi.",
      cols: [
        {
          n: "I · Vocation",
          h3: "Peintres de <em>la scène locale</em>.",
          lede: "Designers, développeurs, organisateurs : le genre de personnes qui rassemblent déjà les autres. Nous donnons un drapeau au rassemblement.",
          items: [
            "<b>Hôte d'atelier local :</b> vous maintenez en vie une rencontre récurrente, un groupe d'étude ou un hack nocturne.",
            "<b>Animateur de communauté en ligne :</b> Discord, WeChat, Telegram, espaces X.",
            "<b>Contributeur ou évangéliste en exercice :</b> vous livrez déjà du travail, publiez votre savoir-faire, accompagnez les nouveaux venus.",
            "<b>À l'aise pour porter le nom :</b> lié au Code de conduite, soucieux de la marque.",
          ],
        },
        {
          n: "II · Mécénat",
          h3: "Ce que l'<em>atelier</em> offre.",
          lede: "Pas un badge de bénévole. Un lien de travail, avec budget, statut et accès.",
          items: [
            "<b>Une page sur le site :</b> portrait, ville, biographie, réseaux sociaux, la chronique de vos événements.",
            "<b>Première vue :</b> fonctionnalités bêta, aperçus de la feuille de route interne, sorties avant la file d'attente.",
            "<b>Le kit d'atelier :</b> affiches, présentations, pièces de démo, goodies ; une bourse pour le lieu, les boissons et la photographie.",
            "<b>Une ligne vers le studio :</b> canal privé, sync mensuelle, un chemin dédié pour vos retours.",
            "<b>Une voie à suivre :</b> cartes d'honneur et paliers, avec un chemin vers les rôles de responsable régional, d'intervenant ou de communauté rémunérés.",
          ],
        },
        {
          n: "III · Alliance",
          h3: "La <em>discipline</em> du studio.",
          lede: "Un engagement modeste, mais contraignant. Une absence prolongée se transforme en statut d'ancien ; le cercle reste petit et sérieux.",
          items: [
            "<b>Réunissez</b> au moins un événement par mois ou par trimestre, local ou en ligne.",
            "<b>Accueillez la nouvelle main.</b> Accompagnez les nouveaux venus dans leur première contribution.",
            "<b>Écoutez de près.</b> Recueillez des retours honnêtes auprès des utilisateurs, designers, développeurs, équipes.",
            "<b>Laissez une trace.</b> Publiez un compte rendu après chaque rassemblement : présence, photographies, liens, pistes.",
            "<b>Portez bien le nom.</b> Tenez-vous au Code de conduite ; aucun mésusage de la marque, aucun accord signé au nom du studio.",
          ],
        },
      ],
    },
    roster: {
      kicker: "Sur le terrain",
      h2: "Rencontrez les <em>ambassadeurs</em>.",
      intro:
        "Des organisateurs locaux, des créateurs et des bâtisseurs de communauté qui aident Open Design à toucher davantage de designers et d'équipes.",
      places: [
        "Sunshine Coast, Australie",
        "Kuala Lumpur, Malaisie",
        "Japon",
        "Chine",
      ],
    },
  },
  moderators: {
    title: "Modérateurs — Open Design",
    desc: "Rencontrez les modérateurs du Discord Open Design et rejoignez la salle où les designers IA-natifs livrent leur travail, ouvrent des plugins, cassent des bêtas et se débloquent mutuellement.",
    heroTitle: "La salle où se retrouvent les <em>contributeurs</em>.",
    heroLead:
      "La première ligne de l'ère du design par agent s'ouvre ici. Discord est l'endroit où se rassemblent les designers IA-natifs les plus affûtés du monde. Rencontrez les gardiens qui gardent la salle chaleureuse.",
    discord: {
      kicker: "Là où se retrouvent les contributeurs",
      h2: "Parlez aux personnes qui <em>reliront votre PR</em>.",
      body: "La première ligne de l'ère du design par agent s'ouvre ici. Notre Discord est l'endroit où se rassemblent les designers IA-natifs les plus affûtés du monde : ils livrent du travail, ouvrent des plugins, cassent des bêtas, se débloquent mutuellement. Entrez. Apportez ce que vous êtes en train de faire.",
      joinCta: "Rejoindre le Discord",
      discussionsCta: "GitHub Discussions",
      cards: [
        {
          role: "Depuis le studio",
          bio: "De l'équipe fondatrice d'Open Design. Espère que le Discord reste un bon endroit où être. Faites signe à tout moment, sur n'importe quelle question.",
        },
        {
          role: "Gardien de la salle",
          bio: "Une main aguerrie sur Discord et dans l'animation de communauté. Garde la salle chaleureuse, les portes ouvertes, la conversation fluide. Passionné par Open Design.",
        },
      ],
      channelNotes: ["travail livré", "bâtisseurs", "retours précoces", "débloqués"],
    },
  },
};

export default fr;
