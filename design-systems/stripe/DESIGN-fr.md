# Design System Inspiré de Stripe

> Category: Fintech & Crypto
> Infrastructure de paiement. Dégradés violets signature, élégance en grammage 300.

## 1. Thème Visuel & Atmosphère

Le site web de Stripe est la référence absolue en matière de design fintech — un système qui parvient à sembler simultanément technique et luxueux, précis et chaleureux. La page s'ouvre sur une toile blanche et épurée (`#ffffff`) avec des titres bleu marine profond (`#061b31`) et un violet signature (`#533afd`) qui fonctionne à la fois comme ancre de marque et accent interactif. Ce n'est pas le violet froid et clinique des logiciels d'entreprise ; c'est un violet riche et saturé qui dégage confiance et prestige. L'impression générale est celle d'une institution financière réinterprétée par une fonderie typographique de classe mondiale.

La police variable `sohne-var` est l'élément définissant l'identité visuelle de Stripe. Chaque élément de texte active le jeu stylistique OpenType `"ss01"`, qui modifie les formes des caractères pour un rendu géométrique et contemporain distinctif. Aux tailles d'affichage (48px–56px), sohne-var est utilisée en grammage 300 — un grammage extraordinairement léger pour des titres qui confère une autorité éthérée, presque murmurée. C'est le contrepied de la convention « titre héro en gras » ; les titres de Stripe semblent n'avoir pas besoin de crier. L'espacement négatif des lettres (−1,4px à 56px, −0,96px à 48px) compresse le texte en blocs denses et engineered. Aux tailles plus petites, le système utilise également le grammage 300 avec un crénage proportionnellement réduit, ainsi que des chiffres tabulaires via `"tnum"` pour l'affichage des données financières.

Ce qui distingue véritablement Stripe est son système d'ombres. Plutôt que l'approche plate ou mono-couche de la plupart des sites, Stripe utilise des ombres multicouches teintées de bleu : la signature `rgba(50,50,93,0.25)` combinée à `rgba(0,0,0,0.1)` crée des ombres d'une profondeur fraîche, presque atmosphérique — comme si les éléments flottaient dans un ciel crépusculaire. La teinte bleu-gris de la couleur d'ombre principale (50,50,93) renvoie directement à la palette de marque marine-violette, rendant même l'élévation cohérente avec la marque.

**Caractéristiques Clés :**
- sohne-var avec OpenType `"ss01"` sur tout le texte — un jeu stylistique personnalisé qui définit les lettres de la marque
- Grammage 300 comme grammage signature pour les titres — léger, confiant, anti-conventionnel
- Espacement négatif des lettres aux tailles d'affichage (−1,4px à 56px, relâchement progressif vers le bas)
- Ombres multicouches teintées de bleu utilisant `rgba(50,50,93,0.25)` — une élévation à la couleur de la marque
- Titres bleu marine profond (`#061b31`) plutôt que noir — chaleureux, premium, de qualité financière
- Rayon de bordure conservateur (4px–8px) — rien en forme de pilule, rien d'agressif
- Accents rubis (`#ea2261`) et magenta (`#f96bee`) pour les dégradés et éléments décoratifs
- `SourceCodePro` comme police monospace complémentaire pour le code et les étiquettes techniques

## 2. Palette de Couleurs & Rôles

### Primaires
- **Stripe Violet** (`#533afd`) : Couleur de marque principale, arrière-plans CTA, texte des liens, points forts interactifs. Un bleu-violet saturé qui ancre l'ensemble du système.
- **Bleu Marine Profond** (`#061b31`) : `--hds-color-heading-solid`. Couleur principale des titres. Ni noir, ni gris — un bleu très sombre qui apporte chaleur et profondeur au texte.
- **Blanc Pur** (`#ffffff`) : Arrière-plan de la page, surfaces des cartes, texte des boutons sur fonds sombres.

### Marque & Sombre
- **Marque Sombre** (`#1c1e54`) : `--hds-color-util-brand-900`. Indigo profond pour les sections sombres, les fonds de pied de page et les moments de marque immersifs.
- **Marine Sombre** (`#0d253d`) : `--hds-color-core-neutral-975`. Le neutre le plus sombre — presque noir avec une teinte bleue pour une profondeur maximale sans agressivité.

### Couleurs d'Accent
- **Rubis** (`#ea2261`) : `--hds-color-accentColorMode-ruby-icon-solid`. Rose-rouge chaud pour les icônes, les alertes et les éléments d'accent.
- **Magenta** (`#f96bee`) : `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Rose-violet vif pour les dégradés et les points forts décoratifs.
- **Magenta Clair** (`#ffd7ef`) : `--hds-color-util-accent-magenta-100`. Surface teintée pour les cartes et badges à thème magenta.

### Interactif
- **Violet Primaire** (`#533afd`) : Couleur principale des liens, états actifs, éléments sélectionnés.
- **Violet au Survol** (`#4434d4`) : Violet plus sombre pour les états de survol des éléments principaux.
- **Violet Profond** (`#2e2b8c`) : `--hds-color-button-ui-iconHover`. Violet sombre pour les états de survol des icônes.
- **Violet Clair** (`#b9b9f9`) : `--hds-color-action-bg-subduedHover`. Lavande douce pour les arrière-plans de survol atténués.
- **Violet Moyen** (`#665efd`) : `--hds-color-input-selector-text-range`. Couleur du sélecteur de plage et de mise en évidence des champs de saisie.

### Échelle de Neutres
- **Titre** (`#061b31`) : Titres principaux, texte de navigation, étiquettes fortes.
- **Étiquette** (`#273951`) : `--hds-color-input-text-label`. Étiquettes de formulaires, titres secondaires.
- **Corps** (`#64748d`) : Texte secondaire, descriptions, légendes.
- **Vert Succès** (`#15be53`) : Badges de statut, indicateurs de succès (avec alpha 0,2–0,4 pour les arrière-plans/bordures).
- **Texte Succès** (`#108c3d`) : Couleur du texte des badges de succès.
- **Citron** (`#9b6829`) : `--hds-color-core-lemon-500`. Accent d'avertissement et de mise en évidence.

### Surfaces & Bordures
- **Bordure Par Défaut** (`#e5edf5`) : Couleur de bordure standard pour les cartes, séparateurs et conteneurs.
- **Bordure Violette** (`#b9b9f9`) : Bordures d'état actif/sélectionné sur les boutons et champs de saisie.
- **Bordure Violet Doux** (`#d6d9fc`) : Bordures légèrement teintées de violet pour les éléments secondaires.
- **Bordure Magenta** (`#ffd7ef`) : Bordures rosées pour les éléments à thème magenta.
- **Bordure Pointillée** (`#362baa`) : Bordures en pointillés pour les zones de dépôt et éléments d'espace réservé.

### Couleurs d'Ombres
- **Ombre Bleue** (`rgba(50,50,93,0.25)`) : La signature — couleur d'ombre principale teintée de bleu.
- **Ombre Bleu Foncé** (`rgba(3,3,39,0.25)`) : Ombre bleue plus profonde pour les éléments en élévation.
- **Ombre Noire** (`rgba(0,0,0,0.1)`) : Couche d'ombre secondaire pour renforcer la profondeur.
- **Ombre Ambiante** (`rgba(23,23,23,0.08)`) : Ombre ambiante douce pour une élévation subtile.
- **Ombre Légère** (`rgba(23,23,23,0.06)`) : Ombre ambiante minimale pour un léger relief.

## 3. Règles Typographiques

### Famille de Polices
- **Principale** : `sohne-var`, avec repli : `SF Pro Display`
- **Monospace** : `SourceCodePro`, avec repli : `SFMono-Regular`
- **Fonctionnalités OpenType** : `"ss01"` activé globalement sur tout le texte sohne-var ; `"tnum"` pour les chiffres tabulaires sur les données financières et les légendes.

### Hiérarchie

| Rôle | Police | Taille | Grammage | Hauteur de Ligne | Espacement | Fonctionnalités | Notes |
|------|--------|--------|----------|------------------|------------|-----------------|-------|
| Héro Affichage | sohne-var | 56px (3.50rem) | 300 | 1.03 (serré) | -1.4px | ss01 | Taille maximale, autorité murmurée |
| Affichage Large | sohne-var | 48px (3.00rem) | 300 | 1.15 (serré) | -0.96px | ss01 | Titres héro secondaires |
| Titre de Section | sohne-var | 32px (2.00rem) | 300 | 1.10 (serré) | -0.64px | ss01 | Titres de sections de fonctionnalités |
| Sous-titre Large | sohne-var | 26px (1.63rem) | 300 | 1.12 (serré) | -0.26px | ss01 | Titres de cartes, sous-sections |
| Sous-titre | sohne-var | 22px (1.38rem) | 300 | 1.10 (serré) | -0.22px | ss01 | Titres de sections plus petites |
| Corps Large | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Descriptions de fonctionnalités, texte d'introduction |
| Corps | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Texte de lecture standard |
| Bouton | sohne-var | 16px (1.00rem) | 400 | 1.00 (serré) | normal | ss01 | Texte du bouton principal |
| Bouton Petit | sohne-var | 14px (0.88rem) | 400 | 1.00 (serré) | normal | ss01 | Boutons secondaires/compacts |
| Lien | sohne-var | 14px (0.88rem) | 400 | 1.00 (serré) | normal | ss01 | Liens de navigation |
| Légende | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Petites étiquettes, métadonnées |
| Légende Petite | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | Petits caractères, horodatages |
| Légende Tabulaire | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Données financières, chiffres |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (serré) | 0.1px | ss01 | Très petites étiquettes, marqueurs d'axe |
| Micro Tabulaire | sohne-var | 10px (0.63rem) | 300 | 1.15 (serré) | -0.3px | tnum | Données de graphiques, petits chiffres |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (serré) | normal | ss01 | Étiquettes les plus petites |
| Code Corps | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (aéré) | normal | -- | Blocs de code, syntaxe |
| Code Gras | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (aéré) | normal | -- | Code en gras, mots-clés |
| Étiquette Code | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (aéré) | normal | majuscules | Étiquettes techniques |
| Code Micro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (serré) | normal | ss01 | Petites annotations de code |

### Principes
- **Grammage léger comme signature** : Le grammage 300 aux tailles d'affichage est le choix typographique le plus distinctif de Stripe. Là où d'autres utilisent 600–700 pour attirer l'attention, Stripe utilise la légèreté comme luxe — le texte est si confiant qu'il n'a pas besoin de poids pour faire autorité.
- **ss01 partout** : Le jeu stylistique `"ss01"` est incontournable. Il modifie des glyphes spécifiques (vraisemblablement des formes alternatives de `a`, `g`, `l`) pour créer un rendu plus géométrique et contemporain sur tout le texte sohne-var.
- **Deux modes OpenType** : `"ss01"` pour le texte d'affichage/corps, `"tnum"` pour les chiffres tabulaires dans les données financières. Ces modes ne se chevauchent jamais — un chiffre dans un paragraphe utilise ss01, un chiffre dans un tableau de données utilise tnum.
- **Crénage progressif** : L'espacement des lettres se resserre proportionnellement avec la taille : −1,4px à 56px, −0,96px à 48px, −0,64px à 32px, −0,26px à 26px, normal à 16px et en dessous.
- **Simplicité en deux grammages** : Principalement 300 (corps et titres) et 400 (interface/boutons). Pas de gras (700) dans la police principale — SourceCodePro utilise 500/700 pour le contraste du code.

## 4. Styles des Composants

### Boutons

**Violet Primaire**
- Arrière-plan : `#533afd`
- Texte : `#ffffff`
- Rembourrage : 8px 16px
- Rayon : 4px
- Police : 16px sohne-var grammage 400, `"ss01"`
- Survol : arrière-plan `#4434d4`
- Utilisation : CTA principal (« Commencer maintenant », « Contacter les ventes »)

**Fantôme / Contouré**
- Arrière-plan : transparent
- Texte : `#533afd`
- Rembourrage : 8px 16px
- Rayon : 4px
- Bordure : `1px solid #b9b9f9`
- Police : 16px sohne-var grammage 400, `"ss01"`
- Survol : arrière-plan passe à `rgba(83,58,253,0.05)`
- Utilisation : Actions secondaires

**Info Transparent**
- Arrière-plan : transparent
- Texte : `#2874ad`
- Rembourrage : 8px 16px
- Rayon : 4px
- Bordure : `1px solid rgba(43,145,223,0.2)`
- Utilisation : Actions tertiaires/niveau info

**Fantôme Neutre**
- Arrière-plan : transparent (`rgba(255,255,255,0)`)
- Texte : `rgba(16,16,16,0.3)`
- Rembourrage : 8px 16px
- Rayon : 4px
- Contour : `1px solid rgb(212,222,233)`
- Utilisation : Actions désactivées ou atténuées

### Cartes & Conteneurs
- Arrière-plan : `#ffffff`
- Bordure : `1px solid #e5edf5` (standard) ou `1px solid #061b31` (accent sombre)
- Rayon : 4px (serré), 5px (standard), 6px (confortable), 8px (mis en avant)
- Ombre (standard) : `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Ombre (ambiante) : `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Survol : l'ombre s'intensifie, ajoutant souvent la couche teintée de bleu

### Badges / Étiquettes / Pilules
**Pilule Neutre**
- Arrière-plan : `#ffffff`
- Texte : `#000000`
- Rembourrage : 0px 6px
- Rayon : 4px
- Bordure : `1px solid #f6f9fc`
- Police : 11px grammage 400

**Badge Succès**
- Arrière-plan : `rgba(21,190,83,0.2)`
- Texte : `#108c3d`
- Rembourrage : 1px 6px
- Rayon : 4px
- Bordure : `1px solid rgba(21,190,83,0.4)`
- Police : 10px grammage 300

### Champs de Saisie & Formulaires
- Bordure : `1px solid #e5edf5`
- Rayon : 4px
- Focus : `1px solid #533afd` ou anneau violet
- Étiquette : `#273951`, 14px sohne-var
- Texte : `#061b31`
- Texte indicatif : `#64748d`

### Navigation
- Navigation horizontale épurée sur fond blanc, fixe avec flou en arrière-plan
- Logotype de marque aligné à gauche
- Liens : sohne-var 14px grammage 400, texte `#061b31` avec `"ss01"`
- Rayon : 6px sur le conteneur de navigation
- CTA : bouton violet aligné à droite (« Se connecter », « Commencer maintenant »)
- Mobile : bouton hamburger avec rayon 6px

### Éléments Décoratifs
**Bordures Pointillées**
- `1px dashed #362baa` (violet) pour les zones de dépôt/espace réservé
- `1px dashed #ffd7ef` (magenta) pour les bordures décoratives à thème magenta

**Accents de Dégradé**
- Dégradés rubis vers magenta (`#ea2261` vers `#f96bee`) pour les décorations héro
- Les sections sombres de marque utilisent des arrière-plans `#1c1e54` avec du texte blanc

## 5. Principes de Mise en Page

### Système d'Espacement
- Unité de base : 8px
- Échelle : 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- À noter : L'échelle est dense pour les petites valeurs (tous les 2px de 4 à 12), reflétant l'interface orientée précision de Stripe pour les données financières

### Grille & Conteneur
- Largeur maximale du contenu : environ 1080px
- Héro : colonne unique centrée avec un rembourrage généreux, titres légers
- Sections de fonctionnalités : grilles à 2–3 colonnes pour les cartes de fonctionnalités
- Sections sombres pleine largeur avec arrière-plan `#1c1e54` pour l'immersion dans la marque
- Aperçus de code/tableau de bord sous forme de cartes contenues avec des ombres teintées de bleu

### Philosophie des Espaces Blancs
- **Espacement précis** : Contrairement au vide immense des systèmes minimalistes, Stripe utilise des espaces blancs mesurés et délibérés. Chaque écart est un choix typographique intentionnel.
- **Données denses, chrome généreux** : Les affichages de données financières (tableaux, graphiques) sont compacts, mais l'interface autour d'eux est généreusement espacée. Cela crée une sensation de densité maîtrisée — comme une feuille de calcul bien organisée dans un beau cadre.
- **Rythme des sections** : Les sections blanches alternent avec des sections de marque sombres (`#1c1e54`), créant une cadence dramatique clair/sombre qui prévient la monotonie sans introduire de couleur arbitraire.

### Échelle des Rayons de Bordure
- Micro (1px) : Éléments fins, arrondi subtil
- Standard (4px) : Boutons, champs de saisie, badges, cartes — le plus courant
- Confortable (5px) : Conteneurs de cartes standard
- Détendu (6px) : Navigation, éléments interactifs plus grands
- Grand (8px) : Cartes mises en avant, éléments héro
- Composé : `0px 0px 6px 6px` pour les conteneurs arrondis en bas (panneaux d'onglets, pieds de menus déroulants)

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|--------|------------|-------------|
| Plat (Niveau 0) | Pas d'ombre | Arrière-plan de la page, texte en ligne |
| Ambiant (Niveau 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Légère élévation de carte, indications de survol |
| Standard (Niveau 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Cartes standard, panneaux de contenu |
| Élevé (Niveau 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Cartes mises en avant, menus déroulants, popovers |
| Profond (Niveau 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modales, panneaux flottants |
| Anneau (Accessibilité) | contour `2px solid #533afd` | Anneau de focus clavier |

**Philosophie des Ombres** : Le système d'ombres de Stripe repose sur un principe de profondeur chromatique. Là où la plupart des systèmes de design utilisent des ombres gris neutre ou noires, la couleur d'ombre principale de Stripe (`rgba(50,50,93,0.25)`) est un bleu-gris profond qui fait écho à la palette marine de la marque. Cela crée des ombres qui n'ajoutent pas seulement de la profondeur — elles ajoutent une atmosphère de marque. L'approche multicouche associe cette ombre teintée de bleu à une couche secondaire noire pure (`rgba(0,0,0,0.1)`) à un décalage différent, créant une profondeur de type parallaxe où l'ombre de marque se situe plus loin de l'élément et l'ombre neutre plus près. Les valeurs de diffusion négatives (−30px, −18px) garantissent que les ombres ne dépassent pas l'empreinte horizontale de l'élément, maintenant l'élévation verticale et contrôlée.

### Profondeur Décorative
- Les sections sombres de marque (`#1c1e54`) créent une profondeur immersive grâce au contraste de couleur d'arrière-plan
- Superpositions de dégradés avec des transitions rubis vers magenta pour les décorations héro
- Couleur d'ombre `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) pour les ombres en bord supérieur sur les éléments fixes

## 7. À Faire & À Éviter

### À Faire
- Utiliser sohne-var avec `"ss01"` sur chaque élément de texte — le jeu stylistique EST la marque
- Utiliser le grammage 300 pour tous les titres et textes de corps — la légèreté est la signature
- Appliquer des ombres teintées de bleu (`rgba(50,50,93,0.25)`) pour tous les éléments en élévation
- Utiliser `#061b31` (bleu marine profond) pour les titres plutôt que `#000000` — la chaleur compte
- Maintenir le rayon de bordure entre 4px–8px — l'arrondi conservateur est intentionnel
- Utiliser `"tnum"` pour tout affichage de nombres tabulaires/financiers
- Superposer les ombres : teintée de bleu en profondeur + neutre en surface pour la parallaxe
- Utiliser le violet `#533afd` comme couleur interactive/CTA principale

### À Éviter
- Ne pas utiliser le grammage 600–700 pour les titres sohne-var — le grammage 300 est la voix de la marque
- Ne pas utiliser un grand rayon de bordure (12px+, formes en pilule) sur les cartes ou boutons — Stripe est conservateur
- Ne pas utiliser des ombres gris neutre — toujours teinter de bleu (`rgba(50,50,93,...)`)
- Ne pas omettre `"ss01"` sur le texte sohne-var — les glyphes alternatifs définissent la personnalité
- Ne pas utiliser le noir pur (`#000000`) pour les titres — toujours `#061b31` bleu marine profond
- Ne pas utiliser des couleurs d'accent chaudes (orange, jaune) pour les éléments interactifs — le violet est primaire
- Ne pas appliquer d'espacement positif des lettres aux tailles d'affichage — Stripe crène serré
- Ne pas utiliser les accents magenta/rubis pour les boutons ou liens — ils sont décoratifs/dégradés uniquement

## 8. Comportement Responsive

### Points de Rupture
| Nom | Largeur | Changements Clés |
|-----|---------|------------------|
| Mobile | <640px | Colonne unique, tailles de titres réduites, cartes empilées |
| Tablette | 640-1024px | Grilles à 2 colonnes, rembourrage modéré |
| Bureau | 1024-1280px | Mise en page complète, grilles de fonctionnalités à 3 colonnes |
| Grand Bureau | >1280px | Contenu centré avec marges généreuses |

### Cibles Tactiles
- Les boutons utilisent un rembourrage confortable (8px–16px vertical)
- Liens de navigation à 14px avec espacement adéquat
- Les badges ont un rembourrage horizontal minimum de 6px pour les cibles de toucher
- Bouton hamburger de navigation mobile avec rayon 6px

### Stratégie de Réduction
- Héro : affichage 56px -> 32px sur mobile, grammage 300 maintenu
- Navigation : liens horizontaux + CTAs -> bouton hamburger
- Cartes de fonctionnalités : 3 colonnes -> 2 colonnes -> colonne unique empilée
- Sections sombres de marque : traitement pleine largeur maintenu, rembourrage interne réduit
- Tableaux de données financières : défilement horizontal sur mobile
- Espacement des sections : 64px+ -> 40px sur mobile
- L'échelle typographique se compresse : tailles héro 56px -> 48px -> 32px selon les points de rupture

### Comportement des Images
- Les captures d'écran des tableaux de bord/produits maintiennent l'ombre teintée de bleu à toutes les tailles
- Les décorations de dégradé héro se simplifient sur mobile
- Les blocs de code maintiennent le traitement `SourceCodePro`, peuvent défiler horizontalement
- Les images des cartes maintiennent un rayon de bordure cohérent de 4px–6px

## 9. Guide de Prompt pour Agent

### Référence Rapide des Couleurs
- CTA Principal : Stripe Violet (`#533afd`)
- Survol CTA : Violet Sombre (`#4434d4`)
- Arrière-plan : Blanc Pur (`#ffffff`)
- Texte des titres : Bleu Marine Profond (`#061b31`)
- Texte du corps : Ardoise (`#64748d`)
- Texte des étiquettes : Ardoise Sombre (`#273951`)
- Bordure : Bleu Doux (`#e5edf5`)
- Lien : Stripe Violet (`#533afd`)
- Section sombre : Marque Sombre (`#1c1e54`)
- Succès : Vert (`#15be53`)
- Accent décoratif : Rubis (`#ea2261`), Magenta (`#f96bee`)

### Exemples de Prompts pour Composants
- "Créer une section héro sur fond blanc. Titre à 48px sohne-var grammage 300, line-height 1.15, letter-spacing -0.96px, color #061b31, font-feature-settings 'ss01'. Sous-titre à 18px grammage 300, line-height 1.40, color #64748d. Bouton CTA violet (#533afd, rayon 4px, rembourrage 8px 16px, texte blanc) et bouton fantôme (transparent, 1px solid #b9b9f9, texte #533afd, rayon 4px)."
- "Concevoir une carte : fond blanc, bordure 1px solid #e5edf5, rayon 6px. Ombre : rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Titre à 22px sohne-var grammage 300, letter-spacing -0.22px, color #061b31, 'ss01'. Corps à 16px grammage 300, #64748d."
- "Construire un badge de succès : fond rgba(21,190,83,0.2), texte #108c3d, rayon 4px, rembourrage 1px 6px, 10px sohne-var grammage 300, bordure 1px solid rgba(21,190,83,0.4)."
- "Créer une navigation : en-tête blanc fixe avec backdrop-filter blur(12px). sohne-var 14px grammage 400 pour les liens, texte #061b31, 'ss01'. CTA violet 'Commencer maintenant' aligné à droite (fond #533afd, texte blanc, rayon 4px). Conteneur de navigation rayon 6px."
- "Concevoir une section sombre de marque : fond #1c1e54, texte blanc. Titre 32px sohne-var grammage 300, letter-spacing -0.64px, 'ss01'. Corps 16px grammage 300, rgba(255,255,255,0.7). Les cartes à l'intérieur utilisent une bordure rgba(255,255,255,0.1) avec rayon 6px."

### Guide d'Itération
1. Toujours activer `font-feature-settings: "ss01"` sur le texte sohne-var — c'est l'ADN typographique de la marque
2. Le grammage 300 est la valeur par défaut ; utiliser 400 uniquement pour les boutons/liens/navigation
3. Formule d'ombre : `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` où Y1/B1 sont plus grands (ombre lointaine) et Y2/B2 plus petits (ombre proche)
4. La couleur des titres est `#061b31` (bleu marine profond), le corps est `#64748d` (ardoise), les étiquettes sont `#273951` (ardoise sombre)
5. Le rayon de bordure reste dans la plage 4px–8px — ne jamais utiliser des formes en pilule ou un grand arrondi
6. Utiliser `"tnum"` pour les chiffres dans les tableaux, graphiques ou affichages financiers
7. Les sections sombres utilisent `#1c1e54` — ni noir, ni gris, mais un indigo de marque profond
8. SourceCodePro pour le code à 12px/500 avec une hauteur de ligne de 2.00 (très généreuse pour la lisibilité)
