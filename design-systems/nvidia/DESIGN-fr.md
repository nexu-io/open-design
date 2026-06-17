# Système de design inspiré de NVIDIA

> Catégorie : Médias & Grand public
> Calcul GPU. Énergie vert-noir, esthétique de puissance technique.

## 1. Thème visuel & atmosphère

Le site de NVIDIA est une expérience technologique à fort contraste qui exprime une puissance de calcul brute par la retenue du design. La page repose sur une base austère noir (`#000000`) et blanc (`#ffffff`), ponctuée par le vert signature de NVIDIA (`#76b900`) — une couleur si précise qu'elle fonctionne comme une empreinte de marque. Ce n'est pas le vert luxuriant de la nature ; c'est le vert électrique et tirant sur le citron des lumières rendues par GPU, une couleur qui se situe entre le chartreuse et le vert vif, et qui évoque immédiatement « NVIDIA » à tout acteur du secteur technologique.

La famille de polices NVIDIA-EMEA (avec Arial et Helvetica en alternatives) crée une voix typographique nette et industrielle. Des titres en gras à 36px avec un interligne serré de 1.25 forment des blocs de texte denses et autoritaires. La police n'a pas la fantaisie géométrique des sans-serif de la Silicon Valley — elle est européenne, pragmatique et orientée ingénierie. Le corps de texte est à 15-16px, confortable à la lecture mais sans excès, maintenant l'impression que l'espace écran est optimisé comme la mémoire GPU.

Ce qui distingue le design NVIDIA des autres sites tech à fond sombre, c'est l'utilisation disciplinée de l'accent vert. Le `#76b900` apparaît dans les bordures (`2px solid #76b900`), les soulignements de liens (`underline 2px rgb(118, 185, 0)`) et les CTA — mais jamais comme arrière-plan ou grande surface dans le contenu principal. Le vert est un signal, pas une surface. Associé à un système d'ombres profondes (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) et un rayon de bordure minimal (1-2px), l'effet global est celui d'un matériel d'ingénierie de précision rendu en pixels.

**Caractéristiques clés :**
- Vert NVIDIA (`#76b900`) comme accent pur — bordures, soulignements et surlignages interactifs uniquement
- Arrière-plan dominant noir (`#000000`) avec texte blanc (`#ffffff`) sur les sections sombres
- Police personnalisée NVIDIA-EMEA avec alternative Arial/Helvetica — industrielle, européenne, nette
- Interlignes serrés (1.25 pour les titres) créant des blocs de texte denses et autoritaires
- Rayon de bordure minimal (1-2px) — coins nets et travaillés dans tout le design
- Boutons à bordure verte (`2px solid #76b900`) comme motif interactif principal
- Système d'icônes Font Awesome 6 Pro/Sharp à graisse 900 pour une iconographie précise
- Architecture multi-framework (PrimeReact, Fluent UI, Element Plus) permettant des composants interactifs riches

## 2. Palette de couleurs & rôles

### Marque principale
- **Vert NVIDIA** (`#76b900`) : La signature — bordures, soulignements de liens, contours de CTA, indicateurs actifs. Jamais utilisé comme grand fond de surface.
- **Noir pur** (`#000000`) : Arrière-plan de page principal, texte sur surfaces claires, ton dominant.
- **Blanc pur** (`#ffffff`) : Texte sur fonds sombres, arrière-plans de sections claires, surfaces de cartes.

### Palette de marque étendue
- **Vert NVIDIA clair** (`#bff230`) : Accent citron vif pour les surlignages et états de survol.
- **Orange 400** (`#df6500`) : Accent chaud pour les alertes, badges mis en avant ou contextes liés à l'énergie.
- **Jaune 300** (`#ef9100`) : Accent chaud secondaire, mise en avant des catégories de produits.
- **Jaune 050** (`#feeeb2`) : Surface chaude claire pour les arrière-plans de blocs d'appel.

### États & sémantique
- **Rouge 500** (`#e52020`) : États d'erreur, actions destructives, alertes critiques.
- **Rouge 800** (`#650b0b`) : Rouge profond pour les arrière-plans d'avertissement sévères.
- **Vert 500** (`#3f8500`) : États de succès, indicateurs positifs (plus foncé que le vert de marque).
- **Bleu 700** (`#0046a4`) : Accents informatifs, alternative de survol pour les liens.

### Décoratif
- **Violet 800** (`#4d1368`) : Violet profond pour les fins de dégradé, contextes premium/IA.
- **Violet 100** (`#f9d4ff`) : Teinte de surface violette claire.
- **Fuchsia 700** (`#8c1c55`) : Accent riche pour les promotions spéciales ou contenus mis en avant.

### Gamme de neutres
- **Gris 300** (`#a7a7a7`) : Texte atténué, étiquettes désactivées.
- **Gris 400** (`#898989`) : Texte secondaire, métadonnées.
- **Gris 500** (`#757575`) : Texte tertiaire, espaces réservés, pieds de page.
- **Gris bordure** (`#5e5e5e`) : Bordures subtiles, lignes de séparation.
- **Quasi-noir** (`#1a1a1a`) : Surfaces sombres, arrière-plans de cartes sur pages noires.

### États interactifs
- **Lien par défaut (fond sombre)** (`#ffffff`) : Liens blancs sur fonds sombres.
- **Lien par défaut (fond clair)** (`#000000`) : Liens noirs avec soulignement vert sur fonds clairs.
- **Survol de lien** (`#3860be`) : Glissement vers le bleu au survol pour toutes les variantes de liens.
- **Survol de bouton** (`#1eaedb`) : Surlignage sarcelle pour les états de survol de boutons.
- **Bouton actif** (`#007fff`) : Bleu vif pour les états de bouton actif/appuyé.
- **Anneau de focus** (`#000000 solid 2px`) : Contour noir pour le focus clavier.

### Ombres & profondeur
- **Ombre de carte** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`) : Ombre ambiante subtile pour les cartes surélevées.

## 3. Règles typographiques

### Famille de polices
- **Principale** : `NVIDIA-EMEA`, avec alternatives : `Arial, Helvetica, sans-serif`
- **Police d'icônes** : `Font Awesome 6 Pro` (graisse 900 pour les icônes pleines, 700 pour les régulières)
- **Icônes Sharp** : `Font Awesome 6 Sharp` (graisse 300 pour les icônes légères, 400 pour les régulières)

### Hiérarchie

| Rôle | Police | Taille | Graisse | Interligne | Espacement lettres | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Héro d'affichage | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (serré) | normal | Titres à impact maximal |
| Titre de section | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (serré) | normal | Titres de sections, en-têtes de cartes |
| Sous-titre | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (détendu) | normal | Descriptions de fonctionnalités, sous-titres |
| Titre de carte | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (serré) | normal | En-têtes de cartes et modules |
| Corps large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (détendu) | normal | Corps mis en avant, paragraphes d'introduction |
| Corps | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Texte de lecture standard |
| Corps gras | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Étiquettes fortes, éléments de navigation |
| Corps petit | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (détendu) | normal | Contenu secondaire, descriptions |
| Corps petit gras | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Contenu secondaire mis en avant |
| Bouton large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (serré) | normal | Boutons CTA principaux |
| Bouton | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (serré) | normal | Boutons standard |
| Bouton compact | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (serré) | 0.144px | Boutons petits/compacts |
| Lien | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Liens de navigation |
| Lien en majuscules | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, étiquettes de navigation |
| Légende | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Métadonnées, horodatages |
| Petite légende | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (serré) | normal | Mentions légales, texte en petits caractères |
| Micro-étiquette | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, petits badges |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (serré) | normal | Plus petit texte d'interface |

### Principes
- **Le gras comme voix par défaut** : NVIDIA s'appuie fortement sur la graisse 700 pour les titres, boutons, liens et étiquettes. La graisse 400 est réservée au texte courant et aux descriptions — tout le reste est en gras, projetant confiance et autorité.
- **Titres serrés, corps détendu** : L'interligne des titres est constamment à 1.25 (serré), tandis que le texte courant se détend à 1.50-1.67. Ce contraste crée une densité visuelle en haut des blocs de contenu et une lisibilité confortable dans les paragraphes.
- **Majuscules pour la navigation** : Les étiquettes de liens utilisent `text-transform: uppercase` avec une graisse 700, créant une voix de navigation qui ressemble aux étiquettes de spécifications matérielles.
- **Pas de crénage décoratif** : L'espacement des lettres est normal partout, sauf pour les boutons compacts (0.144px). La police elle-même porte le caractère industriel sans manipulation.

## 4. Styles de composants

### Boutons

**Principal (bordure verte)**
- Arrière-plan : `transparent`
- Texte : `#000000`
- Rembourrage : 11px 13px
- Bordure : `2px solid #76b900`
- Rayon : 2px
- Police : 16px graisse 700
- Survol : arrière-plan `#1eaedb`, texte `#ffffff`
- Actif : arrière-plan `#007fff`, texte `#ffffff`, bordure `1px solid #003eff`, scale(1)
- Focus : arrière-plan `#1eaedb`, texte `#ffffff`, contour `#000000 solid 2px`, opacité 0.9
- Utilisation : CTA principal ("Learn More", "Explore Solutions")

**Secondaire (bordure verte fine)**
- Arrière-plan : transparent
- Bordure : `1px solid #76b900`
- Rayon : 2px
- Utilisation : Actions secondaires, CTA alternatifs

**Compact / Intégré**
- Police : 14.4px graisse 700
- Espacement des lettres : 0.144px
- Interligne : 1.00
- Utilisation : CTA intégrés, navigation compacte

### Cartes & conteneurs
- Arrière-plan : `#ffffff` (clair) ou `#1a1a1a` (sections sombres)
- Bordure : aucune (bords nets) ou `1px solid #5e5e5e`
- Rayon : 2px
- Ombre : `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` pour les cartes surélevées
- Survol : intensification de l'ombre
- Rembourrage : 16-24px interne

### Liens
- **Sur fond sombre** : `#ffffff`, sans soulignement, le survol passe à `#3860be`
- **Sur fond clair** : `#000000` ou `#1a1a1a`, soulignement `2px solid #76b900`, le survol passe à `#3860be`, soulignement supprimé
- **Liens verts** : `#76b900`, le survol passe à `#3860be`
- **Liens atténués** : `#666666`, le survol passe à `#3860be`

### Navigation
- Fond noir foncé (`#000000`)
- Logo aligné à gauche, marque verbale NVIDIA bien visible
- Liens : NVIDIA-EMEA 14px graisse 700 majuscules, `#ffffff`
- Survol : changement de couleur, pas de modification du soulignement
- Menus déroulants mega-menu pour les catégories de produits
- Fixe au défilement avec fond flou

### Traitement des images
- Rendus produit/GPU comme images héroïques, souvent pleine largeur
- Images de capture d'écran avec ombre subtile pour la profondeur
- Superpositions de dégradé vert sur les sections héroïques sombres
- Conteneurs d'avatar circulaires avec rayon 50%

### Composants distinctifs

**Cartes produit**
- Carte blanche nette ou sombre avec rayon minimal (2px)
- Bordure ou soulignement vert en accent sur le titre
- Motif titre en gras + description plus légère
- CTA avec bordure verte en bas

**Tableaux de spécifications techniques**
- Mises en page en grille industrielle
- Arrière-plans de rangées alternés (légère variation grise)
- Étiquettes en gras, valeurs en régulier
- Surlignages verts pour les métriques clés

**Bannière de cookies/consentement**
- Positionnement fixe en bas
- Boutons arrondis (rayon 2px)
- Traitements de bordure gris

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px
- Échelle : 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Valeurs de rembourrage principales : 8px, 11px, 13px, 16px, 24px, 32px
- Espacement de section : 48-80px de rembourrage vertical

### Grille & conteneur
- Largeur maximale du contenu : environ 1200px (contenu)
- Sections héroïques pleine largeur avec texte contenu
- Sections de fonctionnalités : grilles à 2-3 colonnes pour les cartes produit
- Colonne unique pour le contenu d'article/blog
- Mises en page avec barre latérale pour la documentation

### Philosophie des espaces blancs
- **Densité intentionnelle** : NVIDIA utilise un espacement plus serré que les sites SaaS typiques, reflétant la densité du contenu technique. L'espace blanc existe pour séparer les concepts, pas pour créer un vide luxueux.
- **Rythme des sections** : Les sections sombres alternent avec les sections blanches, utilisant la couleur d'arrière-plan (pas seulement l'espacement) pour séparer les blocs de contenu.
- **Densité des cartes** : Les cartes produit sont rapprochées avec des espaces de 16-20px, créant une sensation de catalogue plutôt que de galerie.

### Échelle de rayon de bordure
- Micro (1px) : Balises inline, petits éléments
- Standard (2px) : Boutons, cartes, conteneurs, champs — la valeur par défaut pour presque tout
- Cercle (50%) : Images d'avatar, indicateurs d'onglets circulaires

## 6. Profondeur & élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Plat (Niveau 0) | Pas d'ombre | Arrière-plans de page, texte inline |
| Subtil (Niveau 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Cartes standard, modales |
| Bordure (Niveau 1b) | `1px solid #5e5e5e` | Séparateurs de contenu, bordures de section |
| Accent vert (Niveau 2) | `2px solid #76b900` | Éléments actifs, CTA, éléments sélectionnés |
| Focus (Accessibilité) | Contour `2px solid #000000` | Anneau de focus clavier |

**Philosophie des ombres** : Le système de profondeur de NVIDIA est minimal et utilitaire. Il n'y a essentiellement qu'une seule valeur d'ombre — un flou ambiant de 5px à 30% d'opacité — utilisée avec parcimonie pour les cartes et les modales. Le signal de profondeur principal n'est pas l'ombre mais _le contraste de couleur_ : fonds noirs à côté de sections blanches, bordures vertes sur surfaces noires. Cela crée une superposition visuelle rappelant le matériel, où la profondeur vient de la différence de matière, et non d'une lumière simulée.

### Profondeur décorative
- Lavages de dégradé vert derrière le contenu héroïque
- Dégradés du sombre au plus sombre (noir au quasi-noir) pour les transitions de section
- Pas de glassmorphisme ni d'effets de flou — clarté plutôt qu'atmosphère

## 7. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Mobile petit | <375px | Colonne unique compacte, rembourrage réduit |
| Mobile | 375-425px | Mise en page mobile standard |
| Grand mobile | 425-600px | Mobile élargi, quelques indications à 2 colonnes |
| Petite tablette | 600-768px | Les grilles à 2 colonnes commencent |
| Tablette | 768-1024px | Grilles de cartes complètes, navigation étendue |
| Bureau | 1024-1350px | Mise en page bureau standard |
| Grand bureau | >1350px | Largeur de contenu maximale, marges généreuses |

### Cibles tactiles
- Les boutons utilisent un rembourrage de 11px 13px pour des cibles tactiles confortables
- Liens de navigation à 14px en majuscules avec espacement adéquat
- Les boutons à bordure verte fournissent des cibles tactiles à fort contraste sur les fonds sombres
- Mobile : menu hamburger replié avec superposition plein écran

### Stratégie de réduction
- Héros : le titre à 36px se réduit proportionnellement
- Navigation : la navigation horizontale complète se replie en menu hamburger à ~1024px
- Cartes produit : de 3 colonnes à 2 colonnes puis à une seule colonne empilée
- Pied de page : la grille multi-colonnes se replie en une seule colonne empilée
- Espacement des sections : 64-80px se réduit à 32-48px sur mobile
- Images : maintien du rapport d'aspect, mise à l'échelle selon la largeur du conteneur

### Comportement des images
- Les rendus GPU/produit maintiennent une haute résolution à toutes les tailles
- Les images héroïques s'adaptent proportionnellement à la fenêtre d'affichage
- Les images de cartes utilisent des rapports d'aspect cohérents
- Les sections sombres pleine page maintiennent un traitement bord à bord

## 8. Comportement responsive (étendu)

### Mise à l'échelle typographique
- L'affichage à 36px passe à ~24px sur mobile
- Les titres de section à 24px passent à ~20px sur mobile
- Le texte courant se maintient à 15-16px sur tous les points de rupture
- Le texte des boutons se maintient à 16px pour des cibles tactiles cohérentes

### Stratégie sections sombres/claires
- Les sections sombres (fond noir, texte blanc) alternent avec les sections claires (fond blanc, texte noir)
- L'accent vert reste cohérent sur les deux types de surface
- Sur fond sombre : les liens sont blancs, les soulignements sont verts
- Sur fond clair : les liens sont noirs, les soulignements sont verts
- Cette alternance crée un rythme de défilement naturel et un regroupement du contenu

## 9. Guide de prompt pour agents

### Référence rapide des couleurs
- Accent principal : Vert NVIDIA (`#76b900`)
- Arrière-plan sombre : Noir pur (`#000000`)
- Arrière-plan clair : Blanc pur (`#ffffff`)
- Texte de titre (fond sombre) : Blanc (`#ffffff`)
- Texte de titre (fond clair) : Noir (`#000000`)
- Texte courant (fond clair) : Noir (`#000000`) ou Quasi-noir (`#1a1a1a`)
- Texte courant (fond sombre) : Blanc (`#ffffff`) ou Gris 300 (`#a7a7a7`)
- Survol de lien : Bleu (`#3860be`)
- Bordure accent : `2px solid #76b900`
- Survol de bouton : Sarcelle (`#1eaedb`)

### Exemples de prompts de composants
- "Créer une section héroïque sur fond noir. Titre à 36px NVIDIA-EMEA graisse 700, interligne 1.25, couleur #ffffff. Sous-titre à 18px graisse 400, interligne 1.67, couleur #a7a7a7. Bouton CTA avec fond transparent, bordure 2px solid #76b900, rayon 2px, rembourrage 11px 13px, texte #ffffff. Survol : arrière-plan #1eaedb, texte blanc."
- "Concevoir une carte produit : fond blanc, border-radius 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Titre à 20px NVIDIA-EMEA graisse 700, interligne 1.25, couleur #000000. Corps à 15px graisse 400, interligne 1.67, couleur #757575. Accent soulignement vert sur le titre : border-bottom 2px solid #76b900."
- "Construire une barre de navigation : arrière-plan #000000, fixe en haut. Logo NVIDIA aligné à gauche. Liens à 14px NVIDIA-EMEA graisse 700 en majuscules, couleur #ffffff. Survol : couleur #3860be. Bouton CTA à bordure verte aligné à droite."
- "Créer une section de fonctionnalité sombre : arrière-plan #000000. Étiquette de section à 14px graisse 700 en majuscules, couleur #76b900. Titre à 24px graisse 700, couleur #ffffff. Description à 16px graisse 400, couleur #a7a7a7. Trois cartes produit en ligne avec un espacement de 20px."
- "Concevoir un pied de page : arrière-plan #000000. Mise en page multi-colonnes avec groupes de liens. Liens à 14px graisse 400, couleur #a7a7a7. Survol : couleur #76b900. Barre inférieure avec texte légal à 12px, couleur #757575."

### Guide d'itération
1. Toujours utiliser `#76b900` comme accent, jamais comme fond de surface — c'est une couleur de signal pour les bordures, soulignements et surlignages
2. Les boutons sont transparents avec des bordures vertes par défaut — les fonds remplis n'apparaissent qu'aux états de survol/actif
3. La graisse 700 est la voix dominante pour tous les éléments interactifs et les titres ; la graisse 400 est réservée uniquement aux paragraphes de corps
4. Le rayon de bordure est de 2px pour tout — cet arrondi net et minimal est au cœur de l'esthétique industrielle
5. Les sections sombres utilisent du texte blanc ; les sections claires utilisent du texte noir — l'accent vert fonctionne de manière identique sur les deux
6. Le survol de lien est toujours `#3860be` (bleu) quelle que soit la couleur par défaut du lien
7. Interligne 1.25 pour les titres, 1.50-1.67 pour le corps — maintenir ce contraste pour la hiérarchie visuelle
8. La navigation utilise des majuscules 14px gras — cette typographie en style d'étiquette matérielle fait partie de la voix de la marque
