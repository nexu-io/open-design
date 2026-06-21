# Système de Design Inspiré de GitHub

> Category: Outils de Développement
> Plateforme orientée code. Densité fonctionnelle, précision bleu sur blanc, fondations Primer.

## 1. Thème Visuel & Atmosphère

La surface de GitHub est conçue avec rigueur, non décorée. Chaque pixel affirme une posture : ceci est un outil pour ceux qui se soucient des diffs, des builds et des pull requests. L'arrière-plan de la page est un `#ffffff` épuré (clair) ou `#0d1117` (sombre), avec le contenu disposé en panneaux rectangulaires denses séparés par des bordures fines plutôt que par de l'espace négatif. La densité d'information est la marque — les lignes de liste, les lignes de code, les en-têtes de dépôts et les cartes de notifications sont toutes serrées les unes contre les autres afin qu'un utilisateur chevronné puisse parcourir une centaine d'éléments sans défiler.

Les accents caractéristiques sont le **bleu Primer** (`#0969da`) pour les liens et les actions primaires, et le **vert GitHub** (`#1a7f37`) pour les états fusionnés, le succès et le bouton de merge lui-même. Les deux paraissent légèrement atténués comparés aux bleus et verts des produits grand public — suffisamment saturés pour se lire sur le texte gris dense, suffisamment sobres pour se fondre dans l'arrière-plan lorsque plusieurs apparaissent dans un même viewport.

La typographie utilise la pile **system-ui** sur l'ensemble du produit afin que le texte s'affiche nettement sur chaque système d'exploitation, associée à **SFMono / Menlo / Consolas** pour le code. Il n'existe aucune police d'affichage éditoriale ; la voix de GitHub est la voix du système que vous utilisez déjà.

**Caractéristiques Clés :**
- Canevas blanc pur (`#ffffff`) ou bleu-noir profond (`#0d1117`) — sans chaleur, sans teinte
- Bordures grises fines (`#d0d7de`) délimitent chaque panneau et volet
- Bleu Primer (`#0969da`) pour les liens/actions primaires ; vert GitHub (`#1a7f37`) pour le succès/merge
- system-ui pour la prose ; SFMono pour le code — aucune police personnalisée
- Lignes de liste denses avec rembourrage minimal ; les espaces blancs sont rares
- Iconographie Octicon à 16px / 24px — trait unique, géométrique, cohérent
- Badges de statut en forme de pilule avec une sémantique chromatique forte

## 2. Palette de Couleurs & Rôles

### Primaire
- **Canvas Default** (`#ffffff`) : Arrière-plan de page principal, thème clair.
- **Canvas Subtle** (`#f6f8fa`) : Surface secondaire, barre latérale, arrière-plan de champ de saisie, bandeau d'en-tête.
- **Canvas Inset** (`#eaeef2`) : Arrière-plan de bloc de code, surface en retrait profond.
- **Fg Default** (`#1f2328`) : Texte principal, titres, encre.
- **Fg Muted** (`#656d76`) : Texte secondaire, légendes, chemins de fichiers.

### Accent de Marque
- **Primer Blue** (`#0969da`) : Liens, CTAs primaires, base de l'anneau de focus — la couleur interactive universelle.
- **Primer Blue Hover** (`#0550ae`) : Survol/appuyé pour le bleu primaire.
- **Accent Subtle** (`#ddf4ff`) : Surface bleu doux pour les encadrés, bannières d'information.

### Sémantique
- **Success / Merge Green** (`#1a7f37`) : PRs fusionnées, badges de succès, bouton de merge.
- **Success Subtle** (`#dafbe1`) : Teinte de surface de succès.
- **Open Green** (`#1a7f37`) : État « Ouvert » d'une issue/PR.
- **Closed / Danger Red** (`#cf222e`) : PRs fermées, action destructrice, erreur de validation.
- **Danger Subtle** (`#ffebe9`) : Surface de bannière d'erreur.
- **Attention / Warning Yellow** (`#9a6700`) : Texte d'avertissement sur surface ambrée.
- **Attention Subtle** (`#fff8c5`) : Surface de bannière d'avertissement.
- **Done Purple** (`#8250df`) : Fusionné et archivé, état « terminé », badge premium.
- **Sponsor Pink** (`#bf3989`) : Cœur des sponsors, marque GitHub Sponsors.

### Bordure & Séparateur
- **Border Default** (`#d0d7de`) : Bordure fine standard, contour de panneau.
- **Border Muted** (`#d8dee4`) : Séparateurs internes au sein d'un panneau.
- **Border Subtle** (`#eaeef2`) : Séparateurs de lignes de tableau discrets.

### Thème Sombre
- **Dark Canvas** (`#0d1117`) : Arrière-plan de page sombre.
- **Dark Surface** (`#161b22`) : Barre latérale, en-tête, surface secondaire.
- **Dark Border** (`#30363d`) : Bordure standard en mode sombre.
- **Dark Fg** (`#e6edf3`) : Texte principal sur fond sombre.

## 3. Règles Typographiques

### Famille de Polices
- **Corps / UI** : `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono** : `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji** : `"Apple Color Emoji", "Segoe UI Emoji"`

### Hiérarchie

| Rôle | Police | Taille | Graisse | Interligne | Espacement des lettres | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | En-tête de dépôt, hero marketing |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Titre de page |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Titre de section |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Sous-section, en-tête de panneau |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Taille de texte par défaut — pas 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Légendes, métadonnées de fichier |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Blocs de code, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Spans `code` en ligne |

### Principes
- **Corps à 14px, pas 16px** : La densité de la prose de GitHub est son identité. Le produit se lit à 14px pour afficher plus de lignes dans un viewport.
- **Graisse binaire** : 400 pour tout par défaut ; 600 pour les titres et l'emphase. Ni 500, ni 700.
- **Polices système toujours** : ne jamais charger une webfont pour le chrome — le texte doit s'afficher instantanément sur les connexions lentes.

## 4. Styles de Composants

### Boutons

**Primaire (Vert)**
- Background : `#1f883d`
- Texte : `#ffffff`
- Bordure : 1px solid `rgba(31, 35, 40, 0.15)`
- Rembourrage : 5px 16px
- Rayon : 6px
- Ombre : `0 1px 0 rgba(31,35,40,0.1)`
- Survol : background `#1a7f37`
- Utilisation : « Créer un dépôt », « Fusionner la pull request »

**Par Défaut**
- Background : `#f6f8fa`
- Texte : `#1f2328`
- Bordure : 1px solid `#d0d7de`
- Rembourrage : 5px 16px
- Rayon : 6px
- Survol : background `#f3f4f6`, bordure `#d0d7de`

**Contour (Style Lien Bleu)**
- Background : `#ffffff`
- Texte : `#0969da`
- Bordure : 1px solid `#d0d7de`
- Survol : background `#0969da`, texte `#ffffff`

**Danger**
- Background : `#ffffff`
- Texte : `#cf222e`
- Bordure : 1px solid `#d0d7de`
- Survol : background `#a40e26`, texte `#ffffff`, bordure `#a40e26`

### Cartes / Boîtes
- Background : `#ffffff`
- Bordure : 1px solid `#d0d7de`
- Rayon : 6px
- Rembourrage : 16px (en-tête) + 16px (corps)
- L'en-tête comporte un bandeau `#f6f8fa` avec une bordure inférieure.

### Champs de Saisie
- Background : `#ffffff`
- Bordure : 1px solid `#d0d7de`
- Rayon : 6px
- Rembourrage : 5px 12px
- Focus : bordure `#0969da`, anneau `0 0 0 3px rgba(9,105,218,0.3)`

### Pilules de Statut (Issue / PR)
- **Ouvert** : background `#1a7f37`, texte blanc, rembourrage 4px 10px, rayon 9999px.
- **Fermé** : background `#cf222e`, texte blanc.
- **Fusionné** : background `#8250df`, texte blanc.
- **Brouillon** : background `#6e7781`, texte blanc.

### Labels (Étiquettes sur Issues/PRs)
- Rembourrage : 0 7px
- Rayon : 9999px
- Police : 12px / 500
- Le background et le texte sont calculés dynamiquement (couleur du label → texte calculé pour le contraste).

## 5. Espacement & Mise en Page

- **Unité de base** : 4px. Échelle d'espacement : 4, 8, 12, 16, 24, 32, 40, 48.
- **Largeur max de page** : 1280px (`Container-xl`).
- **Barre latérale** : 296px sur bureau, réduite en dessous de 1012px.
- **Rembourrage de ligne** : 16px horizontal, 12px vertical (les listes sont denses par conception).

## 6. Mouvement

- **Durée** : 80ms pour le survol ; 200ms pour l'ouverture d'un menu/popover.
- **Accélération** : `ease-out` pour les ouvertures, `ease-in` pour les fermetures.
- **À éviter** : animation au chargement de page, parallaxe, micro-interactions persistantes. Les éléments apparaissent ; ils ne se mettent pas en scène.

## 7. Garde-fous d'Utilisation

- Conservez les listes denses, les boîtes avec bordures et la typographie système ensemble ; des boutons verts isolés ne suffisent pas à créer une surface produit semblable à GitHub.
- Utilisez le vert pour les actions constructives sur les dépôts, le bleu pour les liens et le focus, et le rouge/violet/gris uniquement pour les états des issues, PRs et workflows.
- Préférez un chrome discret, des bordures explicites et un espacement compact plutôt que des ombres décoratives ou de grandes cartes de style marketing.
