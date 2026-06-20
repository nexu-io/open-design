# Système de Design Inspiré de Nike

> Category: E-Commerce et Commerce de Détail
> Commerce de sport. Interface monochrome, typographie massive en majuscules, photographie plein cadre.

## 1. Thème Visuel et Atmosphère

Nike.com est une cathédrale du commerce en mouvement — un site qui canalise l'énergie explosive du sport dans une expérience d'achat numérique. Le design repose sur un principe de simplicité radicale : tout ramener au noir, au blanc et au gris afin que la photographie sportive et les couleurs des produits puissent s'imposer sans concurrence. Le résultat évoque moins un site web qu'un magazine sportif éditorial mis en page avec la précision d'un magazine de luxe. Chaque pixel de surface est soit au service du produit, soit orienté vers lui.

Le « Podium CDS » (Core Design System interne de Nike) établit une fondation délibérément monochromatique. L'interface s'efface derrière le texte noir (`#111111`) et les surfaces blanches, laissant la photographie de héros — athlètes en sueur, chaussures en plein envol, énergie de stade — porter le poids émotionnel. Lorsque de la couleur apparaît dans l'interface, elle est presque exclusivement fonctionnelle : rouge pour les erreurs, bleu pour les liens, vert pour les succès. Le produit est lui-même l'histoire de couleur. Cette retenue crée un paradoxe visuel : les pages les plus colorées d'internet semblent les plus minimalistes, car toute la vivacité vient de la marchandise plutôt que de l'interface.

Le système typographique est l'autre moitié de l'identité visuelle de Nike. Des titres massifs en majuscules dans Nike Futura ND — une variante Futura condensée sur mesure avec une hauteur de ligne impossiblement serrée (0.90) — percent les visuels héros comme une onde de choc typographique. Sous les titres, la famille Helvetica Now assure tout, de la navigation aux descriptions produits, avec une clarté de précision suisse. Cette distinction entre typographie d'affichage expressive et typographie de corps fonctionnelle reflète la dualité de la marque Nike : l'inspiration rencontre l'exécution.

**Caractéristiques Clés :**
- Interface monochromatique (noir/blanc/gris) qui fait de la photographie produit la seule source de couleur
- Typographie d'affichage massive en majuscules (96px, hauteur de ligne 0.90) qui perce les images héros
- Photographie plein cadre sans rayon de bordure — les images occupent chaque bord disponible
- Boutons en forme de pilule (rayon 30px) comme principal élément interactif
- Grille d'espacement de 8px avec rigueur sportive — chaque mesure s'aligne sur le système
- Architecture de navigation par catégories avec de grandes cartes images navigables
- Modèle d'élévation sans ombres et avec un minimum de bordures — différenciation des surfaces uniquement par nuances de gris

## 2. Palette de Couleurs et Rôles

### Primaires

- **Nike Black** (`#111111`) : La fondation — texte principal, arrière-plans des boutons, texte de navigation, superpositions héros. Délibérément différent du noir pur (#000000), pour une expérience de lecture légèrement plus douce
- **Nike White** (`#FFFFFF`) : Canvas principal des pages, texte des boutons sur fond sombre, surfaces des cartes, arrière-plan de la barre de navigation

### Surfaces et Arrière-plans

- **Snow** (`#FAFAFA`) : Surface la plus claire, différenciation subtile quasi-blanche (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`) : Arrière-plan secondaire, remplissage des champs de recherche, espace réservé aux images, squelette de chargement (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`) : Arrière-plan de l'état de survol, remplissage des boutons désactivés (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`) : Arrière-plan principal sur les sections sombres/inversées (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`) : Arrière-plan primaire inversé, surface la plus sombre hors noir pur (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`) : État de survol sur les arrière-plans sombres (--podium-cds-color-grey-700)

### Neutres et Texte

- **Primary Text** (`#111111`) : Texte de corps principal, titres, liens de navigation (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`) : Texte descriptif, métadonnées, horodatages, étiquettes de prix (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`) : Éléments inactifs, options indisponibles (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`) : Texte désactivé sur fond sombre (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`) : Couleur de bordure standard, correspondant au texte secondaire
- **Border Secondary** (`#CACACB`) : Bordures subtiles, bordures de champs de saisie, lignes de séparation (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`) : État de bordure inactive
- **Border Active** (`#111111`) : Bordure active/focalisée, correspondant au texte primaire

### Sémantiques et Accentuées

- **Nike Red** (`#D30005`) : Erreurs critiques, badges de promotion, notifications urgentes (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`) : Red-500, rouge légèrement plus clair pour l'emphase
- **Nike Orange Badge** (`#D33918`) : Texte de badge, mentions promotionnelles (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`) : Accent orange expressif (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`) : Confirmation, disponibilité, états positifs (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`) : Succès sur fond sombre (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`) : Liens textuels, mises en valeur informatives (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`) : Liens sur fond sombre (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`) : Arrière-plans d'avertissement, bannières d'attention (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`) : Anneau indicateur de focus clavier

### Spectre de Couleurs Étendu (Podium CDS)

Chaque rampe de couleur va de 50 à 900 pour un usage expressif dans les campagnes et les pages produits :

- **Red** : `#FFE5E5` → `#EE0005` → `#530300`
- **Orange** : `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow** : `#FEF087` → `#FCA600` → `#99470A`
- **Green** : `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal** : `#D4FFFB` → `#008E98` → `#043441`
- **Blue** : `#D6EEFF` → `#1151FF` → `#020664`
- **Purple** : `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink** : `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Système de Dégradés

Nike évite les dégradés dans l'interface. Lorsqu'ils apparaissent, ils sont photographiques — appliqués aux arrière-plans des héros produits (par ex., une chaussure rouge sur un dégradé rouge vers rouge plus sombre). Le système de design lui-même n'utilise que des couleurs unies.

## 3. Règles Typographiques

### Familles de Polices

**Affichage :** Nike Futura ND (variante Futura condensée sur mesure, exclusive à Nike)
- Substituts : Helvetica Now Text Medium, Helvetica, Arial
- Utilisée exclusivement pour les grands titres d'affichage en majuscules
- Hauteur de ligne caractéristiquement serrée (0.90) et transformation en majuscules

**Titres :** Helvetica Now Display Medium
- Substituts : Helvetica, Arial
- Utilisée pour les titres de sections et les titres produits entre 24 et 32px

**Corps Medium :** Helvetica Now Text Medium (graisse 500)
- Substituts : Helvetica, Arial
- Utilisée pour les liens, boutons, légendes et texte de corps mis en valeur

**Corps :** Helvetica Now Text (graisse 400)
- Substituts : Helvetica, Arial
- Utilisée pour le texte de corps standard, les descriptions et les métadonnées

**Arabe :** Neue Frutiger Arabic — alternative spécifique à la locale

### Hiérarchie

| Rôle | Taille | Graisse | Hauteur de ligne | Espacement | Notes |
|------|--------|---------|------------------|------------|-------|
| Affichage | 96px | 500 | 0.90 | — | Nike Futura ND, majuscules, titres héros |
| Titre 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, titres de sections |
| Titre 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, sous-sections |
| Titre 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, titres de cartes |
| Corps | 16px | 400 | 1.75 | — | Helvetica Now Text, descriptions produits |
| Corps Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, texte mis en valeur |
| Lien | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, liens de navigation |
| Lien Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, liens de pied de page/utilitaires |
| Bouton | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, texte CTA |
| Bouton Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, boutons secondaires |
| Légende | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, étiquettes de prix |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, horodatages |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, textes légaux |

### Principes

La typographie de Nike est une étude des contrastes. La couche d'affichage — Nike Futura ND à 96px avec une hauteur de ligne de 0.90 — est conçue pour ressembler à un tableau d'affichage de stade : massive, condensée, en majuscules, impossible à ignorer. Elle transforme les titres en cris de bataille. Sous la couche d'affichage, Helvetica Now offre un contrepoint clinique : lisibilité de précision suisse avec une hauteur de ligne généreuse de 1.75 pour une navigation produit confortable. La graisse 500 (Medium) domine dans tout le texte de corps, conférant à la prose de Nike une légère assurance sans la lourdeur du gras — chaque phrase se lit comme une recommandation confiante, non comme un cri.

## 4. Styles des Composants

### Boutons

**Primaire**
- Arrière-plan : Nike Black (`#111111`)
- Texte : blanc (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Bordure : aucune
- Rayon de bordure : pilule entièrement arrondie (30px)
- Rembourrage : ~12px 24px
- Survol : l'arrière-plan passe à Grey-500 (`#707072`), couleur de texte au survol
- Actif : effet de ripple scale(0) avec opacité 0.5
- Focus : anneau box-shadow 2px en `rgba(39, 93, 197, 1)`
- Transition : arrière-plan 200ms ease

**Primaire sur Fond Sombre**
- Arrière-plan : blanc (`#FFFFFF`)
- Texte : noir (`#111111`)
- Survol : l'arrière-plan passe à Grey-300 (`#CACACB`)

**Secondaire (Contouré)**
- Arrière-plan : transparent
- Texte : Nike Black (`#111111`)
- Bordure : 1.5px solid `#CACACB` (grey-300)
- Rayon de bordure : 30px
- Survol : la bordure s'assombrit vers `#707072`, l'arrière-plan vers grey-200

**Désactivé**
- Arrière-plan : Grey-200 (`#E5E5E5`)
- Texte : Grey-400 (`#9E9EA0`)
- Curseur : not-allowed

**Bouton Icône**
- Arrière-plan : Grey-100 (`#F5F5F5`)
- Forme : rayon 30px (ou 50% pour circulaire)
- Rembourrage : 6px
- Survol : arrière-plan Grey-500

### Cartes et Conteneurs

- Arrière-plan : blanc (`#FFFFFF`) — aucune limite de carte visible dans la plupart des cas
- Rayon de bordure : 0px pour les cartes d'images produits (imagerie bord à bord), 20px pour les conteneurs interactifs
- Ombre : aucune — Nike n'utilise absolument aucune ombre sur les cartes
- Survol : pas d'effet de soulèvement sur les cartes produits ; soulignement sur les liens textuels dans les cartes
- Cartes produits : image en haut (sans rayon), métadonnées textuelles en dessous avec un espacement de 12px
- Cartes de catégories : photographie plein cadre avec superposition de texte sur dégradé sombre
- Transition : opacité 200ms ease pour l'échange d'image au survol

### Champs de Saisie et Formulaires

- Arrière-plan : Grey-100 (`#F5F5F5`)
- Bordure : 1px solid `#CACACB` si visible, ou sans bordure pour la recherche
- Rayon de bordure : 24px (champs de recherche), 8px (champs de formulaire)
- Police : Helvetica Now Text, 16px
- Focus : la bordure passe à `#111111` (border-active), anneau de focus 2px en `rgba(39, 93, 197, 1)`
- Erreur : bordure `#D30005` (critique)
- Placeholder : Grey-500 (`#707072`)
- Transition : border-color 200ms ease

### Navigation

- Arrière-plan : blanc (`#FFFFFF`), fixe
- Hauteur : ~60px bureau
- Gauche : logo Nike Swoosh (SVG 24x24px)
- Centre : liens de catégories (Nouveautés & Tendances, Homme, Femme, Enfant, Soldes) en 16px/500 Helvetica Now Text Medium
- Droite : icônes recherche (champ 24px de rayon), favoris, panier
- Survol : la couleur du texte passe à Grey-500 (`#707072`)
- Mobile : menu hamburger, superposition plein écran
- Bandeau supérieur : barre de message promotionnel avec fond sombre (#111111) et texte blanc

### Traitement des Images

- Images héros : plein cadre, sans rayon de bordure, bord à bord
- Grille produits : format carré (1:1) ou 4:3, sans rayon de bordure
- Cartes de catégories : 16:9 ou 4:3, plein cadre avec superposition de texte
- Espace réservé aux images : fond uni Grey-100 (`#F5F5F5`)
- Chargement différé : loading="lazy" natif, le squelette utilise #F5F5F5 comme arrière-plan
- Survol produit : échange vers l'image secondaire (vue de face → vue de côté)

### Bannières Promotionnelles

- Arrière-plan sombre pleine largeur (`#111111`) avec texte blanc
- Rembourrage vertical serré (8-12px)
- Texte centré, 12px/500 Helvetica Now Text Medium
- Utilisées pour les promotions de livraison, les avantages membres, les annonces de ventes

## 5. Principes de Mise en Page

### Système d'Espacement

Unité de base : 4px (la grille principale est en multiples de 8px)

| Jeton | Valeur | Usage |
|-------|--------|-------|
| space-1 | 4px | Espacement serré des icônes, espacement en ligne |
| space-2 | 8px | Unité de base, espacement des icônes de boutons |
| space-3 | 12px | Rembourrage interne des cartes, marges serrées |
| space-4 | 16px | Rembourrage standard, espacement de navigation |
| space-5 | 20px | Espacement entre cartes produits |
| space-6 | 24px | Rembourrage interne de section, espacements de grille |
| space-7 | 32px | Séparations de sections |
| space-8 | 48px | Rembourrage de sections importantes |
| space-9 | 64px | Rembourrage des sections héros |
| space-10 | 80px | Grand espacement de section |

### Grille et Conteneur

- Largeur maximale du conteneur : 1920px
- Largeur de contenu standard : ~1440px avec rembourrage horizontal
- Grille produits : 3 colonnes sur bureau, 2 colonnes sur tablette, 1 colonne sur mobile
- Grille de catégories : 3 colonnes avec images plein cadre
- Espacement de grille : 4-12px entre les cartes produits (intentionnellement serré)
- Rembourrage horizontal : 48px bureau, 24px tablette, 16px mobile

### Philosophie des Espaces Blancs

La stratégie d'espacement de Nike est délibérément agressive — non pas à la manière luxueuse et aérée d'une marque de mode, mais dans un sens compact et haute densité qui remplit chaque pixel de contenu ou d'absence intentionnelle. Les grilles produits utilisent des espaces minimaux (4-12px) pour créer un sentiment d'abondance et de choix. Les séparations de sections sont généreuses (48-80px) pour distinguer les contextes d'achat. L'effet d'ensemble est un magasin qui semble déborder de produits tout en restant navigable — comme un superstore sportif bien organisé.

### Échelle des Rayons de Bordure

| Valeur | Contexte |
|--------|---------|
| 0px | Images produits, photographie héros (bords francs) |
| 8px | Champs de formulaire (hors recherche) |
| 18px | Petits éléments interactifs |
| 20px | Conteneurs, cartes avec contenu d'interface |
| 24px | Champs de recherche, pilules moyennes |
| 30px | Boutons, étiquettes, filtres (pilule pleine) |
| 50% | Boutons icônes circulaires, espaces réservés aux avatars |

## 6. Profondeur et Élévation

| Niveau | Traitement | Usage |
|--------|-----------|-------|
| Plat | Pas d'ombre, pas de bordure | État par défaut pour tout |
| Séparateur | `0px -1px 0px 0px #E5E5E5 inset` | Fine ligne en retrait entre les sections |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Anneau de focus clavier |
| Superposition | Voile sombre sur la photographie | Lisibilité du texte sur image |

La philosophie d'élévation de Nike est radicalement plate. Pas d'ombres sur les cartes, pas de soulèvement au survol, pas d'éléments flottants. La profondeur est communiquée exclusivement par la couleur — les sections sombres reculent, les sections claires avancent, les nuances de gris indiquent les changements d'état. Cette platitude renforce la personnalité sportive et directe de la marque : pas d'ornements visuels, juste une communication sans détour. La seule « ombre » dans l'ensemble du système est une ligne de séparation en retrait de 1px et l'anneau de focus requis pour l'accessibilité.

### Profondeur Décorative

- **Superpositions sur photographie héros** : voiles dégradés sombres sur la photographie plein cadre pour la lisibilité du texte
- **Dégradés d'arrière-plan produit** : arrière-plans colorés derrière les visuels héros produits (par ex., chaussure rouge sur dégradé rouge)
- **Barres de bannières** : bandeaux promotionnels unis sombres (#111111) en haut des pages

## 7. À Faire et À Éviter

### À Faire

- Utiliser Nike Black (#111111) pour tout le texte principal — jamais le noir pur #000000
- Garder les boutons en forme de pilule (rayon 30px), limités aux variantes primaire/secondaire
- Utiliser une photographie plein cadre, bord à bord, pour les sections héros — pas de rayon de bordure sur les images
- Laisser la photographie produit apporter toute la vivacité colorée ; garder l'interface monochromatique
- Utiliser Nike Futura ND en majuscules UNIQUEMENT pour les titres d'affichage (96px et plus)
- Maintenir des espaces serrés dans la grille produits (4-12px) pour un rendu dense et abondant
- Utiliser Grey-100 (#F5F5F5) pour tous les arrière-plans de champs et d'espaces réservés
- Réserver la couleur exclusivement aux significations sémantiques (rouge=erreur, vert=succès, bleu=lien)
- Utiliser la graisse 500 (Medium) pour tous les éléments de texte interactifs

### À Éviter

- Ne pas ajouter d'ombres aux cartes — le modèle d'élévation de Nike est entièrement plat
- Ne pas utiliser de rayon de bordure sur les images produits — seuls les éléments d'interface ont des coins arrondis
- Ne pas introduire de couleurs de marque au-delà de l'échelle de gris pour les éléments d'interface
- Ne pas utiliser Nike Futura ND en dessous de 24px — c'est exclusivement une police d'affichage
- Ne pas ajouter d'effets de soulèvement au survol — les cartes Nike ne s'animent pas au survol
- Ne pas utiliser la graisse régulière (400) pour les boutons ou les liens — toujours utiliser 500
- Ne pas placer d'arrière-plans colorés derrière les éléments d'interface — la couleur est réservée aux contextes produits
- Ne pas utiliser plus de deux niveaux de hiérarchie de texte par carte (titre + corps)
- Ne pas ajouter de séparateurs décoratifs — le retrait de 1px est le seul motif de séparation
- Ne pas adoucir le contraste — le design de Nike pousse délibérément le noir sur blanc au maximum

## 8. Comportement Responsive

### Points de Rupture

| Nom | Largeur | Changements Clés |
|-----|---------|-----------------|
| Mobile | <640px | Colonne unique, navigation hamburger, texte d'affichage réduit, rembourrage serré de 16px |
| Small Tablet | 640-768px | Grille produits 2 colonnes, navigation encore réduite |
| Tablet | 768-960px | Grilles 2 colonnes, mise à l'échelle des cartes de catégories, rembourrage horizontal 24px |
| Small Desktop | 960-1024px | Navigation déployée en horizontal complet, grille produits 3 colonnes |
| Desktop | 1024-1440px | Mise en page complète, navigation déployée, grilles 3 colonnes, rembourrage 48px |
| Large Desktop | >1440px | Conteneur centré à largeur maximale, marges augmentées, images héros plein cadre |

### Zones de Toucher

- Zone de toucher minimale : 44x44px (WCAG AAA)
- Icônes de navigation mobile : zone de toucher 48x48px
- Cartes produits : toute la surface est tactile
- Pilules de filtre : hauteur minimale de 36px avec rembourrage de 12px

### Stratégie de Réduction

- **Navigation** : liens de catégories complets → menu hamburger en dessous de 960px ; les icônes recherche, favoris, panier restent visibles
- **Grilles produits** : 3 col → 2 col à 960px → 1 col à 640px
- **Sections héros** : le texte d'affichage passe de 96px → 64px → 48px ; les images héros restent plein cadre à toutes les tailles
- **Cartes de catégories** : 3 col → 2 col → 1 col avec imagerie plein cadre maintenue
- **Rembourrage de section** : 80px → 48px → 32px → 24px à mesure que la fenêtre d'affichage se réduit
- **Bannière promotionnelle** : le texte passe à la ligne ou est tronqué, l'arrière-plan sombre est maintenu

### Comportement des Images

- Images responsive via le CDN Nike (`c.static-nike.com`) avec paramètres de largeur
- Images produits : srcset avec plusieurs résolutions (w_320, w_640, w_960, w_1920)
- Images héros : plein cadre à tous les points de rupture, le ratio change (16:9 bureau → 4:3 mobile)
- Chargement différé : loading="lazy" natif, espace réservé grey-100 pendant le chargement
- Direction artistique : les cadrages héros changent entre les compositions bureau et mobile

## 9. Guide de Prompt pour Agent

### Référence Rapide des Couleurs

- CTA principal : Nike Black (`#111111`)
- Arrière-plan : blanc (`#FFFFFF`)
- Surface secondaire : Light Gray (`#F5F5F5`)
- Texte de titre : Nike Black (`#111111`)
- Texte de corps / survol : Secondary Text (`#707072`)
- Bordure : Border Secondary (`#CACACB`)
- Erreur : Nike Red (`#D30005`)
- Lien : Link Blue (`#1151FF`)

### Exemples de Prompts de Composants

- « Crée une section héros produit avec une photographie plein cadre bord à bord, sans rayon de bordure, un voile dégradé sombre pour le texte, et un titre massif en majuscules 96px/500 dans le style Nike Futura avec une hauteur de ligne de 0.90 et un bouton pilule Nike Black (#111111) (rayon 30px) »
- « Conçois une grille de cartes produits en 3 colonnes avec des images carrées (sans rayon de bordure), un espacement de 4px entre les cartes, le nom du produit en 16px/500 Nike Black (#111111), le prix en 14px/500, et le texte secondaire en Grey-500 (#707072) »
- « Construis une barre de navigation blanche fixe avec un logo aligné à gauche, des liens de catégories centrés en 16px/500 (#111111) avec la couleur de survol #707072, et des icônes de recherche (rayon 24px, arrière-plan #F5F5F5), favoris et panier alignés à droite »
- « Crée une bannière promotionnelle pleine largeur avec arrière-plan #111111, texte blanc centré en 12px/500, et rembourrage vertical de 8px — pleine largeur, sans rayon de bordure »
- « Conçois un bouton secondaire contouré avec arrière-plan transparent, bordure #CACACB de 1.5px, rayon en pilule de 30px, texte #111111 en 16px/500, bordure s'assombrissant vers #707072 au survol »

### Guide d'Itération

Lors de l'affinement des écrans existants générés avec ce système de design :
1. Se concentrer sur UN composant à la fois
2. Référencer les noms de couleurs spécifiques et les codes hexadécimaux de ce document
3. Se rappeler : la photographie produit est la couleur — l'interface reste monochromatique
4. Utiliser l'échelle de gris pour les changements d'état : #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Si quelque chose semble trop coloré dans l'interface, c'est probablement le cas — Nike maintient l'interface en niveaux de gris
6. La typographie d'affichage (Nike Futura) doit TOUJOURS être en majuscules et ne jamais descendre en dessous de 24px
7. La typographie de corps (Helvetica Now) doit presque toujours être en graisse 500 pour les éléments interactifs
