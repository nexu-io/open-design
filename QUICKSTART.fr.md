# Quickstart

<p align="center"><a href="QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <b>Français</b> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a></p>

Exécutez le produit complet localement.

## Prérequis

- **Node.js :** `~24` (Node 24.x). Le repo l’impose via `package.json#engines`.
- **pnpm :** `10.33.x`. Le repo fixe `pnpm@10.33.2` via `packageManager` ; utilisez Corepack pour que la bonne version soit sélectionnée automatiquement.
- **OS :** macOS, Linux et WSL2 sont les environnements principaux pris en charge. Windows natif devrait fonctionner pour la plupart des workflows, mais WSL2 reste l’option la plus fiable.
- **CLI d’agent locale optionnelle :** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, GitHub Copilot CLI, etc. Si aucune n’est installée, utilisez le mode BYOK API depuis Settings.

`nvm` / `fnm` sont des outils de confort optionnels, pas une étape obligatoire de la configuration du projet. Si vous en utilisez un, installez/sélectionnez Node 24 avant de lancer pnpm :

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Activez ensuite Corepack et laissez le repo sélectionner pnpm :

```bash
corepack enable
corepack pnpm --version   # doit afficher 10.33.2
```

## Démarrage rapide (mode dev)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # démarre daemon + web au premier plan
# ouvrez l’URL web affichée par tools-dev
```

Pour le shell desktop et tous les sidecars gérés en arrière-plan :

```bash
pnpm tools-dev # démarre daemon + web + desktop en arrière-plan
```

Au premier chargement, l’app détecte votre CLI de coding agent installée (Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen), la sélectionne automatiquement, puis utilise par défaut le Skill `web-prototype` et le Design System `Neutral Modern`. Tapez un prompt et cliquez sur **Send**. Les sorties de l’agent s’affichent en streaming dans le panneau gauche ; la balise `<artifact>` est extraite et le HTML s’affiche en direct à droite. Une fois la génération terminée, cliquez sur **Save to disk** pour enregistrer l’artifact sous `./.od/artifacts/<timestamp>-<slug>/index.html`.

Le menu déroulant **Design System** charge les Design Systems depuis `design-systems/*/DESIGN.md` : starters écrits à la main, product systems intégrés et design skills normalisés. Choisissez-en un pour habiller chaque prototype dans l’esthétique de cette marque.

Le menu déroulant **Skill** regroupe les entrées par `mode` / `surface` et affiche le Skill par défaut de chaque mode avec un suffixe `· default`. Le catalogue live vient de [`skills/`](skills/) et couvre les workflows web, deck, Design System, image, vidéo et audio. Exemples inclus :

- **Prototype** — `web-prototype` (générique), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck` (swipe horizontal single-file) et `magazine-web-ppt` (le bundle `guizang-ppt` depuis [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill), par défaut en mode deck, avec ses propres assets/template + 4 références). Les Skills avec side files reçoivent automatiquement un préambule "Skill root (absolute)" pour que l’agent puisse résoudre `assets/template.html` et `references/*.md` depuis le vrai chemin disque au lieu de son CWD.
- **Médias et Design System** — par exemple `image-poster`, `video-shortform`, `audio-jingle`, `hyperframes` et `design-brief`.

Associez un Skill, un Design System et un seul prompt : vous obtenez un prototype, un deck ou un rendu adapté au mode / à la surface choisie.

## Autres scripts

```bash
pnpm tools-dev                 # daemon + web + desktop en arrière-plan
pnpm tools-dev start web       # daemon + web en arrière-plan
pnpm tools-dev run web         # daemon + web au premier plan (e2e/dev server)
pnpm tools-dev restart         # redémarre daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # inspecte les runtimes gérés
pnpm tools-dev logs            # affiche les logs daemon/web/desktop
pnpm tools-dev check           # statut + logs récents + diagnostics courants
pnpm tools-dev stop            # arrête les runtimes gérés
pnpm --filter @open-design/daemon build  # build apps/daemon/dist/cli.js pour `od`
pnpm --filter @open-design/web build     # build du paquet web si nécessaire
pnpm typecheck                 # typecheck du workspace
```

`pnpm tools-dev` est le seul point d’entrée du lifecycle local. N’utilisez pas les anciens alias root supprimés (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

Pendant le développement local, `tools-dev` démarre d’abord le daemon, transmet son port à `apps/web`, puis `apps/web/next.config.ts` réécrit `/api/*`, `/artifacts/*` et `/frames/*` vers ce port daemon. L’app App Router peut ainsi parler au processus Express voisin sans configuration CORS.

## Checks de génération média / agent dispatcher

Les Skills image, vidéo, audio et HyperFrames appellent la CLI locale `od` via des variables d’environnement injectées par le daemon lorsqu’il lance un agent :

- `OD_BIN` — chemin absolu vers `apps/daemon/dist/cli.js`.
- `OD_DAEMON_URL` — URL du daemon en cours d’exécution.
- `OD_PROJECT_ID` — id du projet actif.
- `OD_PROJECT_DIR` — dossier de fichiers du projet actif.

Si la génération média échoue avec `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` manquant, ou `failed to reach daemon at http://127.0.0.1:0`, rebuildez la CLI daemon et redémarrez le runtime géré :

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

Ouvrez ensuite de nouveau le projet depuis l’app Open Design au lieu de reprendre une ancienne session agent dans le terminal. Un agent lancé par le daemon devrait voir des valeurs comme :

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` doit être un vrai port daemon comme `http://127.0.0.1:7457`, pas `http://127.0.0.1:0`. La valeur `:0` est seulement une indication interne "choisir un port libre" au lancement et ne doit pas se retrouver dans les sessions agent.

En mode production daemon-only, le daemon sert lui-même l’export static Next.js à `http://localhost:7456`; aucun reverse proxy n’est impliqué.

Si vous placez nginx devant le daemon, gardez les routes SSE non bufferisées et non compressées. Un échec courant : la console navigateur affiche `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` après 80-90 secondes, parce que `gzip on` dans nginx bufferise les réponses SSE chunked même quand le daemon envoie `X-Accel-Buffering: no`.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;

    proxy_buffering off;
    gzip off;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Deux modes d’exécution

| Mode | Valeur du picker | Flux d’une requête |
|---|---|---|
| **Local CLI** (par défaut quand le daemon détecte un agent) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → parser `<artifact>` → preview |
| **Mode API** (fallback / aucune CLI) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → SSE provider normalisé en `delta/end/error` → parser `<artifact>` → preview |

Les deux modes alimentent le **même** parser `<artifact>` et la **même** iframe sandboxée. Seuls le transport et la livraison du system prompt changent : les CLI locales n’ont pas de canal système séparé, donc le prompt composé est intégré au message utilisateur.

## Composition du prompt

À chaque envoi, l’app construit un system prompt à partir de trois couches et l’envoie au provider :

```
BASE_SYSTEM_PROMPT   (contrat de sortie : wrap in <artifact>, no code fences)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Changez le Skill ou le Design System dans la barre supérieure : le prochain envoi utilise le nouveau stack. Les contenus sont mis en cache en mémoire par session, donc un choix ne coûte qu’un fetch daemon.

## File map

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express — spawn les agents locaux + sert les APIs
│   │   └── src/
│   │       ├── cli.ts             # entrée bin `od`
│   │       ├── server.ts          # /api/* + static serving
│   │       ├── agents.ts          # scanner PATH + adapters CLI de coding agents
│   │       ├── skills.ts          # loader SKILL.md (frontmatter parser)
│   │       └── design-systems.ts  # loader DESIGN.md
│   │   ├── sidecar/           # wrapper sidecar daemon pour tools-dev
│   │   └── tests/             # tests du package daemon
│   ├── web/                   # Next.js 16 App Router + client React
│       ├── app/               # entrypoints App Router
│       ├── src/               # modules client/runtime React + TypeScript
│       │   ├── App.tsx        # orchestre mode / skill / DS pickers + send
│       │   ├── providers/     # transports daemon + BYOK API
│       │   ├── prompts/       # system, discovery, directions, deck framework
│       │   ├── artifacts/     # parser <artifact> streaming + manifests
│       │   ├── runtime/       # iframe srcdoc, markdown, helpers d’export
│       │   └── state/         # localStorage + état projet persisté par le daemon
│       ├── sidecar/           # wrapper sidecar web pour tools-dev
│       └── next.config.ts     # rewrites tools-dev + config export prod apps/web/out
│   └── desktop/               # runtime Electron, lancé/inspecté par tools-dev
├── packages/
│   ├── contracts/             # contrats app partagés web/daemon
│   ├── sidecar-proto/         # contrat du protocole sidecar Open Design
│   ├── sidecar/               # primitives runtime sidecar génériques
│   └── platform/              # primitives process/platform génériques
├── tools/dev/                 # lifecycle `pnpm tools-dev` et inspect CLI
├── e2e/                       # UI Playwright + harness intégration externe/Vitest
├── skills/                    # SKILL.md — drop-in depuis n’importe quel repo Claude Code skill
│   ├── web-prototype/         # prototype single-screen générique (défaut du mode prototype)
│   ├── saas-landing/          # page marketing (hero / features / pricing / CTA)
│   ├── dashboard/             # dashboard admin / analytics
│   ├── pricing-page/          # pricing autonome + comparaison
│   ├── docs-page/             # layout documentation 3 colonnes
│   ├── blog-post/             # long-form éditorial
│   ├── mobile-app/            # écran unique dans phone frame
│   ├── simple-deck/           # deck minimal à swipe horizontal
│   └── guizang-ppt/           # magazine-web-ppt — deck/PPT par défaut inclus
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,components,checklist}.md
├── design-systems/            # DESIGN.md — schéma 9 sections (awesome-claude-design)
│   ├── default/               # Neutral Modern (starter)
│   ├── warm-editorial/        # Warm Editorial (starter)
│   ├── README.md              # aperçu du catalogue
│   └── …systems               # starters · product systems · design skills normalisés
├── scripts/sync-design-systems.ts    # réimport depuis le tarball getdesign upstream
├── docs/                      # vision produit + spec
├── .od/                       # données runtime (gitignored, auto-créées)
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   rendus ponctuels "Save to disk"
│   └── projects/<id>/          #   dossier de travail par projet + cwd de l’agent
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # scripts qualité root + bin `od`
```

## Dépannage

- **"no agents found on PATH"** — installez une CLI compatible, par exemple `claude`, `codex`, `gemini`, `opencode`, `cursor-agent`, `qwen` ou `copilot`. La liste exacte des adapters détectés vit dans `apps/daemon/src/agents.ts`. Ou passez au mode API/BYOK dans la barre supérieure et collez une clé dans **Settings**.
- **daemon 500 sur /api/chat** — vérifiez la fin de stderr dans le terminal daemon ; la CLI a généralement rejeté ses args. Les CLIs n’acceptent pas toutes la même forme d’argv ; consultez `apps/daemon/src/agents.ts` `buildArgs` si vous devez ajuster.
- **la génération média dit que `OD_BIN` manque ou que l’URL daemon vaut `:0`** — exécutez les checks du dispatcher média ci-dessus. Ne reprenez pas l’ancienne session CLI ; rouvrez le projet depuis l’app Open Design pour que le daemon injecte des variables `OD_*` fraîches.
- **Codex charge trop de contexte plugin** — démarrez Open Design avec `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` pour que les processus Codex lancés par le daemon tournent avec `--disable plugins`.
- **l’artifact ne rend jamais** — le modèle a produit du texte sans wrapper `<artifact>`. Vérifiez que le system prompt passe bien (log daemon) et envisagez un modèle plus capable ou un Skill plus strict.

## Retour à la vision

Ce Quickstart est la graine exécutable de la spec dans [`docs/`](docs/). La spec décrit vers quoi le projet grandit (voir [`docs/roadmap.md`](docs/roadmap.md)). Points clés :

- `docs/architecture.md` décrit le stack livré : Next.js 16 App Router devant, daemon local derrière, et rewrites `apps/web/next.config.ts` en dev pour que le navigateur parle toujours à la même surface `/api`.
- `docs/skills-protocol.md` décrit le schéma `od:` complet. Le daemon lit les métadonnées runtime utiles depuis `SKILL.md` pour router les Skills, composer le prompt, afficher les exemples et configurer les surfaces web / image / vidéo / audio ; le protocole reste la référence pour les champs avancés.
- `docs/agent-adapters.md` anticipe un dispatch plus riche (capability detection, streaming tool-calls). Notre `apps/daemon/src/agents.ts` est un dispatcher minimal : suffisant pour prouver le câblage.
- `docs/modes.md` décrit les workflows prototype / deck / template / design-system. Le catalogue runtime peut aussi exposer des Skills pour les surfaces image, vidéo et audio ; le picker filtre les entrées par `mode` et `surface`.
