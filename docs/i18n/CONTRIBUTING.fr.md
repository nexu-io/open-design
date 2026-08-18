# Contribuer à Open Design

Merci d'envisager de contribuer. OD reste volontairement petit : l'essentiel
de la valeur vit dans des **fichiers** (Skills, Design Systems, morceaux de
prompt) plutôt que dans du code de framework. Les contributions les plus utiles
sont donc souvent un dossier, un fichier Markdown ou un petit adapter qui tient
dans une PR.

Ce guide indique où intervenir pour chaque type de contribution et quel niveau
une PR doit atteindre avant d’être mergée.

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <b>Français</b> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <a href="CONTRIBUTING.ko.md">한국어</a> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a></p>

---

## Trois contributions faisables en un après-midi

| Si vous voulez… | Vous ajoutez en réalité | Où cela vit | Taille |
|---|---|---|---|
| Faire générer à OD un nouveau type d'artifact (facture, écran iOS Settings, one-pager…) | un **template de design** | [`design-templates/<your-template>/`](../../design-templates/) | un dossier avec `SKILL.md` et ses assets de rendu |
| Ajouter une capacité fonctionnelle invoquée par les agents pendant une tâche | un **Skill** | [`skills/<your-skill>/`](../../skills/) | un dossier avec `SKILL.md` et des ressources optionnelles |
| Faire parler à OD le langage visuel d'une nouvelle marque | un **Design System** | [`design-systems/<brand>/`](../../design-systems/) | un paquet : `manifest.json`, `DESIGN.md` et `tokens.css` |
| Brancher une nouvelle CLI de coding agent | un **Agent adapter** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | une définition et une entrée de registre |
| Ajouter une feature, corriger un bug, reprendre un pattern UX de [`open-codesign`][ocod] | du code | `apps/web/src/`, `apps/daemon/` | PR classique |
| Améliorer la doc, porter une section en Français / Deutsch / 中文, corriger une faute | documentation | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | une PR |

Si vous ne savez pas dans quelle catégorie tombe votre idée, [ouvrez d'abord
une discussion ou une issue](https://github.com/nexu-io/open-design/issues/new)
et nous vous orienterons vers la bonne surface.

---

## Configuration locale

Le setup complet en une page se trouve dans [`QUICKSTART.fr.md`](QUICKSTART.fr.md).
TL;DR pour contribuer :

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # sélectionne la version de pnpm définie par packageManager
pnpm install
pnpm tools-dev run web    # boucle daemon + web au premier plan
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # build du paquet web si nécessaire
```

Node `~24` et pnpm `10.33.x` sont requis. `nvm` / `fnm` sont optionnels ;
utilisez `nvm install 24 && nvm use 24` ou `fnm install 24 && fnm use 24` si
vous gérez Node comme cela. macOS, Linux et WSL2 sont les environnements
principaux pris en charge.
Windows natif est supporté ; voir [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)
pour les pièges de configuration les plus courants.

Vous n'avez pas besoin d'une CLI d'agent dans votre `PATH` pour développer OD.
Le daemon indiquera "no agents found" ; utilisez alors le mode API/BYOK
(Anthropic, OpenAI, Azure OpenAI ou Google Gemini), qui est souvent la boucle
de dev la plus rapide.

---

## Ajouter un nouveau template de design

Un template de design est un dossier sous [`design-templates/`](../../design-templates/)
avec un `SKILL.md` à la racine. Il suit la convention Claude Code
[`SKILL.md`][skill], plus notre extension optionnelle `od:`, et regroupe la
forme et les ressources de rendu d'un artifact affiché dans la galerie Templates.

### → Voir [`docs/skills-contributing.md`](../../docs/skills-contributing.md) pour le guide complet

### Structure d'un dossier de template

```text
design-templates/your-template/
├── SKILL.md                    # requis
├── assets/template.html        # optionnel mais recommandé — seed file
├── references/                 # optionnel — fichiers de connaissance lus par l'agent
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # fortement recommandé — vrai exemple construit à la main
```

### Frontmatter de `SKILL.md`

Les trois premières clés sont la spec Claude Code de base : `name`,
`description`, `triggers`. Tout ce qui est sous `od:` est spécifique à OD et
optionnel, mais **`od.mode`** décide dans quel groupe le template apparaît. La
valeur est extensible ; les modes courants incluent Prototype, Deck, Image,
Video, Audio, Design system et Utility.

```yaml
---
name: your-template
description: |
  One-paragraph elevator pitch. The agent reads this verbatim to decide
  if the user's brief matches. Be concrete: surface, audience, what's in
  the artifact, what's not.
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"
od:
  mode: prototype           # prototype | deck | image | video | audio | design-system | utility
  platform: desktop         # desktop | mobile
  scenario: marketing       # free-form tag for grouping
  featured: 1               # any positive integer surfaces it under "Showcase examples"
  preview:
    type: html              # html | jsx | pptx | markdown
  design_system:
    requires: true          # does the template read the active DESIGN.md?
  craft:
    requires: [typography, color, anti-ai-slop]
  example_prompt: "A copy-pastable prompt that nicely shows what this template does."
---

# Your Template

Body is free-form Markdown describing the workflow the agent should follow…
```

La grammaire active complète (`od.mode`, `od.surface`, `od.craft.requires`,
`od.critique.policy`, les indices de galerie, etc.) se trouve dans
[`docs/skills-protocol.md`](../../docs/skills-protocol.md). D'anciens champs
portables comme `od.inputs`, `od.parameters` et `od.capabilities_required`
peuvent encore apparaître dans des bundles externes, mais le registre des
skills/templates ne les consomme pas.

### Critères de merge pour un nouveau template

Nous sommes exigeants sur les templates parce qu'ils constituent une partie
visible pour l'utilisateur. Un nouveau template doit :

1. **Livrer un vrai `example.html`.** Construit à la main, ouvrable directement
   depuis le disque, avec un niveau qu'un designer pourrait réellement livrer.
   Pas de lorem ipsum, pas de hero placeholder en `<svg><rect/></svg>`. Si vous
   ne pouvez pas construire l'exemple vous-même, le template n'est probablement
   pas prêt.
2. **Passer l'anti-AI-slop checklist** dans le body. Pas de gradients violets,
   pas d'icônes emoji génériques, pas de carte arrondie avec accent en bord
   gauche, pas d'Inter comme fonte *display*, pas de statistiques inventées.
   Lisez la section **Anti-AI-slop machinery** du README pour la liste complète.
3. **Utiliser des placeholders honnêtes.** Si l'agent n'a pas de vraie donnée,
   écrivez `—` ou un bloc gris libellé, pas "10× faster".
4. **Avoir un `references/checklist.md`** avec au moins les gates P0, c'est-à-dire
   ce que l'agent doit vérifier avant d'émettre `<artifact>`. Reprenez le format
   de [`design-templates/guizang-ppt/references/checklist.md`](../../design-templates/guizang-ppt/) ou
   [`design-templates/dating-web/references/checklist.md`](../../design-templates/dating-web/).
5. **Ajouter une capture** sous `docs/screenshots/skills/<skill>.png` si le template
   est featured. PNG, environ 1024×640 retina, capturé depuis le vrai
   `example.html` avec un zoom navigateur adapté.
6. **Rester dans un dossier autonome.** Pas d'import CDN au-delà de ce que les
   autres templates utilisent déjà ; pas de fonte sans licence ; pas d'image de
   plus d'environ 250 KB.

Si vous forkez un template existant (par exemple partir de `dating-web` pour en
faire `recruiting-web`), conservez la LICENSE et l'attribution d'auteur dans
`references/`, et mentionnez-le dans la description de la PR.

### Templates existants à imiter

- Prototype visuel single-screen : [`design-templates/dating-web/`](../../design-templates/dating-web/),
  [`design-templates/digital-eguide/`](../../design-templates/digital-eguide/)
- Flow mobile multi-frame : [`design-templates/mobile-onboarding/`](../../design-templates/mobile-onboarding/),
  [`design-templates/gamified-app/`](../../design-templates/gamified-app/)
- Document / template sans Design System requis : [`design-templates/pm-spec/`](../../design-templates/pm-spec/),
  [`design-templates/weekly-update/`](../../design-templates/weekly-update/)
- Deck mode : [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) (bundle repris tel
  quel depuis [op7418/guizang-ppt-skill][guizang]) et
  [`design-templates/simple-deck/`](../../design-templates/simple-deck/)

---

## Ajouter un Skill fonctionnel

Un Skill fonctionnel est une capacité que l'agent invoque pendant une tâche pour travailler sur les entrées de l'utilisateur. Consultez [`skills/README.md`](../../skills/README.md) pour la frontière de responsabilité, [`skills/AGENTS.md`](../../skills/AGENTS.md) pour le contrat du dossier et [`docs/skills-protocol.md`](../../docs/skills-protocol.md) pour la grammaire `SKILL.md` partagée. Le scanner paresseux du daemon parcourt les racines de Skills à la prochaine requête `/api/skills` : aucun rebuild ni redémarrage du daemon n'est nécessaire en local.

---

## Ajouter un nouveau Design System

Un nouveau design system du dépôt est un package sous
[`design-systems/<slug>/`](../../design-systems/), pas un fichier Markdown isolé.
Les 151 systèmes fournis utilisent désormais le contrat de package ci-dessous.
Le daemon accepte encore les dossiers contenant uniquement `DESIGN.md` pour la
compatibilité avec les contenus anciens ou installés par l'utilisateur, mais ce
n'est pas la cible d'authoring. Le catalogue est rescanné à chaque requête
`/api/design-systems` : rafraîchissez la surface Design System après une
modification, sans redémarrer le daemon.

### Structure minimale du package

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json` porte l'id stable, le nom affiché, la catégorie, la description,
la provenance et les chemins déclarés. `DESIGN.md` explique l'intention aux
agents ; `tokens.css` est la feuille de tokens sémantiques compilée canonique.
Le contrat complet se trouve dans [`docs/design-systems.md`](../../docs/design-systems.md)
et [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md).

### Forme de `DESIGN.md`

```markdown
# YourBrand Design System

## Visual Theme
…

## Color Roles
…

## Typography
…

## Layout and Spacing
## Components and States
## Motion and Interaction
## Accessibility
## Anti-patterns
```

Il n'existe pas de schéma fixe à neuf sections. Le guard de qualité exige au
moins sept sections H2 substantielles, sans imposer leurs noms, leur ordre ou
leur numérotation. Utilisez des titres adaptés au système réel.

### Critères de merge pour un nouveau Design System

1. **Livrer les trois fichiers requis.** Le slug du dossier et `manifest.id`
   correspondent et utilisent un ASCII normalisé (`linear.app` → `linear-app`,
   `x.ai` → `x-ai`).
2. **Écrire au moins sept H2 substantielles.** N'ajoutez pas de titres vides
   uniquement pour atteindre le compte.
3. **Garder prose et tokens cohérents.** Couleurs, typo, espacement et motion
   décrits dans `DESIGN.md` doivent correspondre à `tokens.css`, qui doit passer
   les guards de tokens partagés.
4. **Utiliser des preuves réelles et une provenance claire.** Échantillonnez le
   produit ou site source et consignez la source dans le manifest ou les preuves
   du package.
5. **Rédiger une copie catalogue utile.** `manifest.name`, `category` et
   `description` sont les métadonnées principales du picker ; évitez le fluff.

Les product systems dérivés de l'upstream sont importés depuis [`VoltAgent/awesome-design-md`][acd2]
via [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts). Si votre
marque appartient à cet upstream, **envoyez d'abord la PR là-bas** : OD le
récupérera au prochain sync. Le dossier `design-systems/` contient aussi des
ajouts propres au projet qui ne rentrent pas upstream.

---

## Ajouter une nouvelle CLI de coding agent

Brancher un nouvel agent (par exemple une CLI `foo-coder`) revient à ajouter
une définition dans [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) et une entrée dans `runtimes/registry.ts` :

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
} satisfies RuntimeAgentDef;
```

Importez la définition dans [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts)
et ajoutez-la à `BASE_AGENT_DEFS` ; le moteur partagé la détecte alors dans le
`PATH`, l'affiche dans le picker et construit son invocation. Réutilisez un
`streamFormat` existant lorsque la forme du wire correspond. Un format wire
réellement nouveau exige aussi un parser sous [`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/)
ou [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/),
des tests de parser et une branche de dispatch correspondante dans
[`server.ts`](../../apps/daemon/src/server.ts).

Critères de merge :

1. **Une vraie session fonctionne end-to-end** avec le nouvel agent. Collez le
   log daemon dans la description de la PR pour montrer qu'il a streamé un artifact.
2. **`docs/agent-adapters.md`** documente les particularités de la CLI : fichier
   de clé requis, support de l'image, flag non interactif, etc.
3. **La table "Supported coding agents" du README** reçoit une ligne.

---

## Mettre à jour les métadonnées `max_tokens` des modèles

En mode API, le chat envoie `max_tokens` au provider upstream à chaque requête.
Le client web choisit ce nombre avec une lookup à trois niveaux dans
[`apps/web/src/state/maxTokens.ts`](../../apps/web/src/state/maxTokens.ts) :

1. L'override explicite de l'utilisateur dans Settings, s'il existe.
2. Sinon, la valeur par modèle dans [`apps/web/src/state/litellm-models.json`](../../apps/web/src/state/litellm-models.json),
   un extrait vendored du `model_prices_and_context_window.json` de
   [BerriAI/litellm][litellm] (MIT). Il couvre environ 2k modèles chat chez
   Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock,
   Vertex, OpenRouter et autres.
3. Sinon, `FALLBACK_MAX_TOKENS = 8192`.

Pour récupérer un modèle nouvellement lancé, régénérez le JSON vendored :

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

Le script récupère le catalogue LiteLLM, filtre les entrées `mode: 'chat'`,
projette chacune vers son `max_output_tokens` (ou fallback `max_tokens`), puis
écrit un snapshot trié. Commitez le `litellm-models.json` régénéré avec la PR
qui motive cette mise à jour.

La table `OVERRIDES` dans `maxTokens.ts` est réservée aux rares cas où LiteLLM
est absent ou incorrect pour un model id réellement utilisé, par exemple
`mimo-v2.5-pro`. Gardez-la petite ; tout ce que LiteLLM sait déjà correctement
doit rester upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Maintenance des localisations

Les PR de locale doivent traduire le chrome UI, la documentation cœur et les
métadonnées display-only de galerie dans `apps/web/src/i18n/content*.ts`, mais
ne doivent pas traduire `skills/`, `design-systems/` ni les prompt bodies que
les agents exécutent. Ces prompts source sont des entrées de workflow ; garder
une langue source commune évite de multiplier la QA de prompts sur toutes les
locales. Lorsqu'un Skill, un Design System ou un prompt template est ajouté ou
renommé, mettez à jour les métadonnées display de la locale concernée et lancez
`pnpm --filter @open-design/web test` ; `content.test.ts` échoue si la coverage
couverture des métadonnées d'affichage d'une locale déclarée dérive. Les erreurs daemon, noms de fichiers
d'export et textes d'artifact générés par agent restent des limites connues,
sauf si une PR les inclut explicitement.

Pour les étapes détaillées d'ajout d'une locale (dictionnaire UI, README,
language switcher, terminologie régionale), voir [`TRANSLATIONS.md`](../../TRANSLATIONS.md).

---

## Style de code

Nous ne sommes pas maniaques du formatting (Prettier on save est très bien),
mais deux règles ne sont pas négociables parce qu'elles apparaissent dans le
prompt stack et l'API visible :

1. **Single quotes en JS/TS.** Les strings utilisent des single quotes sauf si
   l'échappement les rend illisibles. La codebase est déjà cohérente ; suivez-la.
2. **Commentaires en anglais.** Même si une PR traduit quelque chose en français,
   allemand ou chinois, les commentaires de code restent en anglais afin de
   garder une référence greppable unique.

Au-delà de ça :

- **Ne racontez pas l'évidence.** Pas de `// import the module`, pas de
  `// loop through items`. Si le code se lit déjà, le commentaire est du bruit.
  Gardez les commentaires pour l'intention non évidente ou les contraintes que
  le code ne peut pas exprimer.
- **TypeScript** pour le code source de `apps/web/src/` et `apps/daemon/src/`.
  Le JavaScript généré appartient aux dossiers `dist/`; les nouveaux fichiers
  `.js`, `.mjs` ou `.cjs` doivent avoir une raison générée, vendored ou
  compatibility explicite.
- **Pas de nouvelle dépendance top-level** sans paragraphe dans la description
  de la PR expliquant ce qu'elle apporte et combien d'octets elle coûte. La liste
  des dépendances dans [`package.json`](../../package.json) est petite volontairement.
- **Lancez `pnpm typecheck`** avant de push. CI le lance aussi ; s'il échoue,
  vous aurez un commentaire "please fix".

---

## Commits et Pull Requests

- **Un seul sujet par PR.** Ajouter un Skill, refactorer le parser et bumper une
  dépendance : ce sont trois PR.
- **Titre impératif + scope.** `add dating-web skill`,
  `fix daemon SSE backpressure when CLI hangs`, `docs: clarify storage contract`.
- **Utilisez le template de PR.** Remplissez chaque section de
  [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — Why,
  What users will see, Surface area, Screenshots (si UI), Bug fix verification
  (si correctif), Validation. Les sections vides recevront un commentaire
  « please fill in ».
- **Le body explique le pourquoi.** Le diff montre souvent le quoi ; le pourquoi
  est rarement évident.
- **Référencez une issue** s'il y en a une. S'il n'y en a pas et que la PR est
  non trivial, ouvrez-en d'abord une pour valider que le changement est souhaité.
- **Pas de squash pendant la review.** Poussez des fixups ; les maintainers
  squashent au merge.
- **Pas de force-push sur une branche partagée** sauf si un reviewer le demande.

Nous n'imposons pas de CLA. Apache-2.0 couvre le projet ; votre contribution
est licenciée sous la même licence.

---

## Signaler un bug

Ouvrez une issue avec :

- La commande exacte lancée (`pnpm tools-dev ...`).
- La CLI d'agent sélectionnée, ou le fait que vous étiez sur le chemin BYOK.
- La paire Skill + Design System qui a déclenché le problème.
- La **fin du stderr du daemon** concerné. La plupart des rapports "l'artifact
  n'a jamais rendu" se diagnostiquent en 30 secondes si on voit `spawn ENOENT`
  ou l'erreur réelle de la CLI.
- Une capture d'écran si le problème touche l'UI.

Pour les bugs de prompt stack ("l'agent a généré un hero violet alors que la
blacklist slop devait l'interdire"), incluez le **message assistant complet**
afin de voir si la violation vient du modèle ou du prompt.

---

## Poser des questions

- Question d'architecture, question de design, "bug ou mauvaise utilisation ?" →
  [GitHub Discussions](https://github.com/nexu-io/open-design/discussions)
  (préféré, car searchable pour la personne suivante).
- "Comment écrire un Skill qui fait X ?" → ouvrez une discussion. Nous y
  répondrons et transformerons la réponse en ajout dans
  [`docs/skills-protocol.md`](../../docs/skills-protocol.md) si c'est un pattern manquant.

---

## Ce que nous n'acceptons pas

Pour garder le projet focalisé, merci de ne pas ouvrir de PR qui :

- **Vendor un runtime de modèle.** Tout le pari d'OD est "votre CLI existante
  suffit". Nous ne livrons pas `pi-ai`, de clés OpenAI ou de model loaders.
- **Réécrit le frontend hors de la stack actuelle sans discussion préalable.**
  Next.js 16 App Router + React 18 + TS est la ligne. Pas de réécriture Astro,
  Solid, Svelte ou autre framework sauf si les maintainers veulent explicitement
  cette migration.
- **Remplace le daemon par une fonction serverless.** Le rôle du daemon est de
  posséder un vrai `cwd` et de spawn une vraie CLI. Déployer la SPA sur Vercel
  est très bien ; le daemon reste un daemon.
- **Ajoute de la télémétrie ou une collecte externe hors du contrat de
  confidentialité.** Les analytics produit et le replay de session masqué sont
  soumis au consentement ; la télémétrie nettoyée de sécurité/fiabilité reste
  active dans les builds configurés. Tout nouvel événement, champ ou
  destinataire doit respecter les limites de consentement, minimisation et
  nettoyage décrites dans [`PRIVACY.md`](../../PRIVACY.md).
- **Bundle un binaire** sans fichier de licence ni attribution d'auteur à côté.

Si vous n'êtes pas sûr que votre idée rentre dans le projet, ouvrez une
discussion avant d'écrire le code.

---

<!-- Machine-translated section; native-speaker review welcome via PR. -->
## Devenir Mainteneur

Si vous contribuez régulièrement et que vous souhaitez savoir à quoi
ressemble le chemin pour devenir Mainteneur, les règles se trouvent dans
**[`MAINTAINERS.md`](../../MAINTAINERS.md)**. La version courte :

- Un Mainteneur peut examiner, approuver et fermer des issues. Le bouton
  de merge reste à la Core Team — votre approbation compte tout de même
  comme l'approbation requise pour le merge.
- Le seuil est de **≥ 20 merged PRs** plus une vérification publiée de la
  qualité du compte (anti-bot, anti-sock-puppet) plus un jugement de la
  Core Team sur la qualité des contributions. Il n'y a pas de formulaire
  de candidature ; la Core Team identifie les candidats en interne et
  prend contact.
- Il n'y a **aucun quota, aucun SLAs, et aucun mandat fixe.** Se retirer
  est facile et réversible (Emeritus → retour quand la vie se calme).
- Tous les seuils, le flux de nomination, les règles de retrait et la
  dérogation pour les projets en phase initiale se trouvent dans
  [`MAINTAINERS.md`](../../MAINTAINERS.md). Lisez ce document si l'un des
  points ci-dessus vous intéresse.

Le tl;dr : livrez de bonnes PR, faites des reviews réfléchies, traînez
dans les [Discussions][discussions] / sur [Discord][discord], et le reste
se fait tout seul.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## Licence

En contribuant, vous acceptez que votre contribution soit licenciée sous la
[licence Apache-2.0](../../LICENSE) de ce repo, à l'exception des fichiers dans
[`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/), qui conservent leur licence MIT
originale et l'attribution d'auteur à [op7418](https://github.com/op7418).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
