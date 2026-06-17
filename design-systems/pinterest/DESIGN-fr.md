# Système de design inspiré de Pinterest

> Category: Médias & Grand public
> Découverte visuelle. Accent rouge, grille maçonnique, image en premier.

## 1. Thème visuel & Atmosphère

Le site de Pinterest est une toile chaude et inspirante qui traite la découverte visuelle comme un magazine lifestyle. Le design repose sur un fond blanc doux et légèrement chaud, avec le Rouge Pinterest (`#e60023`) comme seul accent de marque audacieux. Contrairement aux tons bleus froids de la plupart des plateformes tech, l'échelle de neutrals de Pinterest a un sous-ton résolument chaud — les gris tendent vers l'olive/sable (`#91918c`, `#62625b`, `#e5e5e0`) plutôt que vers l'acier froid, créant une atmosphère chaleureuse et artisanale qui invite à la navigation.

La typographie utilise Pin Sans — une police propriétaire personnalisée avec une large pile de replis incluant des polices japonaises, reflétant la portée mondiale de Pinterest. À l'échelle d'affichage (70px, graisse 600), Pin Sans crée de grands titres accueillants. À des tailles plus petites, le système est compact : boutons à 12px, légendes à 12–14px. Le système de nommage des variables CSS (`--comp-*`, `--sema-*`, `--base-*`) révèle une architecture sophistiquée de tokens de design à trois niveaux : composant, sémantique et base.

Ce qui distingue Pinterest, c'est son généreux système de rayon de bordure (12px–40px, plus 50% pour les cercles) et ses fonds de boutons teintés de chaleur. Le bouton secondaire (`#e5e5e0`) a une tonalité sable distinctement chaude plutôt que gris froid. Le bouton rouge principal utilise un rayon de 16px — arrondi mais pas en forme de pilule. Combiné avec des fonds de badges chauds (`hsla(60,20%,98%,.5)` — un léger lavis jaune-chaud) et des mises en page dominées par la photographie, le résultat est un design qui semble artisanal et personnel, pas corporate et stérile.

**Caractéristiques clés :**
- Toile blanche chaude avec des neutrals teintés olive/sable — douillet, pas clinique
- Rouge Pinterest (`#e60023`) comme seul accent audacieux — jamais subtil, toujours confiant
- Police personnalisée Pin Sans avec pile de replis mondiale (incluant CJK)
- Architecture de tokens à trois niveaux : `--comp-*` / `--sema-*` / `--base-*`
- Surfaces secondaires chaudes : gris sable (`#e5e5e0`), badge chaud (`hsla(60,20%,98%,.5)`)
- Rayon de bordure généreux : 16px standard, jusqu'à 40px pour les grands conteneurs
- Contenu photo en premier — les pins/images sont l'élément visuel principal
- Texte quasi-violet foncé (`#211922`) — chaud, avec une touche de prune

## 2. Palette de couleurs & Rôles

### Marque principale
- **Rouge Pinterest** (`#e60023`) : CTA principal, accent de marque — rouge audacieux et confiant
- **Vert 700** (`#103c25`) : `--base-color-green-700`, accent succès/nature
- **Vert 700 Survol** (`#0b2819`) : `--base-color-hover-green-700`, vert enfoncé

### Texte
- **Noir prune** (`#211922`) : Texte principal — quasi-noir chaud avec sous-ton prune
- **Noir** (`#000000`) : Texte secondaire, texte de bouton
- **Gris olive** (`#62625b`) : Descriptions secondaires, texte atténué
- **Argent chaud** (`#91918c`) : `--comp-button-color-text-transparent-disabled`, texte désactivé, bordures d'entrée
- **Blanc** (`#ffffff`) : Texte sur surfaces sombres/colorées

### Interactif
- **Bleu focus** (`#435ee5`) : `--comp-button-color-border-focus-outer-transparent`, anneaux de focus
- **Violet performance** (`#6845ab`) : `--sema-color-hover-icon-performance-plus`, fonctionnalités de performance
- **Violet recommandation** (`#7e238b`) : `--sema-color-hover-text-recommendation`, recommandation IA
- **Bleu lien** (`#2b48d4`) : Couleur du texte de lien
- **Bleu Facebook** (`#0866ff`) : `--facebook-background-color`, connexion sociale
- **Bleu enfoncé** (`#617bff`) : `--base-color-pressed-blue-200`, état enfoncé

### Surface & Bordure
- **Gris sable** (`#e5e5e0`) : Fond bouton secondaire — chaud, artisanal
- **Lumière chaude** (`#e0e0d9`) : Fonds de boutons circulaires, badges
- **Lavis chaud** (`hsla(60, 20%, 98%, 0.5)`) : `--comp-badge-color-background-wash-light`, fond de badge chaud subtil
- **Brume** (`#f6f6f3`) : Surface claire (à 50% d'opacité)
- **Bordure désactivée** (`#c8c8c1`) : `--sema-color-border-disabled`, bordures désactivées
- **Gris survol** (`#bcbcb3`) : `--base-color-hover-grayscale-150`, bordure au survol
- **Surface sombre** (`#33332e`) : Fonds de sections sombres

### Sémantique
- **Rouge erreur** (`#9e0a0a`) : États d'erreur case à cocher/formulaire

## 3. Règles typographiques

### Famille de polices
- **Principale** : `Pin Sans`, replis : `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement des lettres | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Héros display | Pin Sans | 70px (4,38rem) | 600 | normal | normal | Impact maximal |
| Titre de section | Pin Sans | 28px (1,75rem) | 700 | normal | -1,2px | Tracking négatif |
| Corps | Pin Sans | 16px (1,00rem) | 400 | 1,40 | normal | Lecture standard |
| Légende gras | Pin Sans | 14px (0,88rem) | 700 | normal | normal | Métadonnées fortes |
| Légende | Pin Sans | 12px (0,75rem) | 400–500 | 1,50 | normal | Petit texte, tags |
| Bouton | Pin Sans | 12px (0,75rem) | 400 | normal | normal | Libellés de bouton |

### Principes
- **Échelle typographique compacte** : La plage est 12px–70px avec un saut dramatique — la plupart du texte fonctionnel est à 12–16px, créant une hiérarchie d'information dense, similaire à une application.
- **Distribution de graisse chaude** : 600–700 pour les titres, 400–500 pour le corps. Pas de graisses ultra-légères — le texte semble toujours substantiel.
- **Tracking négatif sur les titres** : -1,2px sur les titres de 28px crée des titres de section confortables et intimes.
- **Famille de polices unique** : Pin Sans gère tout — aucune police d'affichage secondaire ou monospace détectée.

## 4. Styles de composants

### Boutons

**Rouge principal**
- Fond : `#e60023` (Rouge Pinterest)
- Texte : `#000000` (noir — choix inhabituel pour le contraste sur rouge)
- Rembourrage : 6px 14px
- Rayon : 16px (généreusement arrondi, pas en pilule)
- Bordure : `2px solid rgba(255, 255, 255, 0)` (transparent)
- Focus : bordure sémantique + contour via variables CSS

**Sable secondaire**
- Fond : `#e5e5e0` (gris sable chaud)
- Texte : `#000000`
- Rembourrage : 6px 14px
- Rayon : 16px
- Focus : même système de bordure sémantique

**Action circulaire**
- Fond : `#e0e0d9` (lumière chaude)
- Texte : `#211922` (noir prune)
- Rayon : 50% (cercle)
- Utilisation : actions de pin, contrôles de navigation

**Fantôme / Transparent**
- Fond : transparent
- Texte : `#000000`
- Pas de bordure
- Utilisation : actions tertiaires

### Cartes & Conteneurs
- Cartes de pin photo en premier avec rayon généreux (12px–20px)
- Pas d'ombre de boîte traditionnelle sur la plupart des cartes
- Fonds blancs ou brume chaude
- Bordure épaisse blanche de 8px sur certains conteneurs d'image

### Champs de saisie
- Saisie d'e-mail : fond blanc, bordure `1px solid #91918c`, rayon 16px, rembourrage 11px 15px
- Focus : système de bordure sémantique + contour via variables CSS

### Navigation
- En-tête épuré sur fond blanc ou chaud
- Logo Pinterest + barre de recherche centrés
- Pin Sans 16px pour les liens de navigation
- Accents Rouge Pinterest pour les états actifs

### Traitement des images
- Grille maçonnique style pin (mise en page signature de Pinterest)
- Coins arrondis : 12px–20px sur les images
- Photographie comme contenu principal — chaque pin est une image
- Bordures blanches épaisses (8px) sur les conteneurs d'images en vedette

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px
- Échelle : 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Grands sauts : 32px → 80px → 100px pour l'espacement des sections

### Grille & Conteneur
- Grille maçonnique pour le contenu des pins (mise en page signature)
- Sections de contenu centrées avec une largeur maximale généreuse
- Pied de page sombre pleine largeur
- Barre de recherche comme élément de navigation principal

### Philosophie des espaces blancs
- **Densité d'inspiration** : La grille maçonnique entasse les pins serré — la densité du contenu EST la proposition de valeur. L'espace blanc existe entre les sections, pas dans la grille.
- **Respiration en haut, densité en bas** : Les sections héros/featured reçoivent un rembourrage généreux ; la grille de pins est compacte et immersive.

### Échelle de rayon de bordure
- Standard (12px) : Petites cartes, liens
- Bouton (16px) : Boutons, entrées, cartes moyennes
- Confortable (20px) : Cartes featured
- Grand (28px) : Grands conteneurs
- Section (32px) : Éléments d'onglet, grands panneaux
- Héros (40px) : Conteneurs héros, grands blocs featured
- Cercle (50%) : Boutons d'action, indicateurs d'onglet

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Plat (Niveau 0) | Pas d'ombre | Par défaut — les pins s'appuient sur le contenu, pas l'ombre |
| Subtil (Niveau 1) | Ombre minimale (depuis les tokens) | Superpositions élevées, menus déroulants |
| Focus (Accessibilité) | Anneau `--sema-color-border-focus-outer-default` | États de focus |

**Philosophie des ombres** : Pinterest utilise des ombres minimales. La grille maçonnique s'appuie sur le contenu (photographie) pour créer de l'intérêt visuel plutôt que des effets d'élévation. La profondeur vient de la chaleur des couleurs de surface et de l'arrondi généreux des conteneurs.

## 7. À faire et à ne pas faire

### À faire
- Utiliser des neutrals chauds (`#e5e5e0`, `#e0e0d9`, `#91918c`) — le ton olive/sable chaud est l'identité
- Appliquer le Rouge Pinterest (`#e60023`) uniquement pour les CTAs principaux — il est audacieux et unique
- Utiliser Pin Sans exclusivement — une police pour tout
- Appliquer un rayon de bordure généreux : 16px pour les boutons/saisies, 20px+ pour les cartes
- Garder la grille maçonnique dense — la densité du contenu est la valeur
- Utiliser des fonds de badge chauds (`hsla(60,20%,98%,.5)`) pour des lavis chauds subtils
- Utiliser `#211922` (noir prune) pour le texte principal — plus chaud que le noir pur

### À ne pas faire
- Ne pas utiliser de neutrals gris froids — toujours chaud/olive
- Ne pas utiliser le noir pur (`#000000`) comme texte principal — utiliser le noir prune (`#211922`)
- Ne pas utiliser de boutons en forme de pilule — le rayon 16px est arrondi mais pas en pilule
- Ne pas ajouter d'ombres lourdes — Pinterest est plat par conception, la profondeur vient du contenu
- Ne pas utiliser un petit rayon de bordure (<12px) sur les cartes — l'arrondi généreux est essentiel
- Ne pas introduire de couleurs de marque supplémentaires — rouge + neutrals chauds est la palette complète
- Ne pas utiliser de graisses de police légères — Pin Sans au minimum 400

## 8. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Mobile | <576px | Colonne unique, mise en page compacte |
| Grand mobile | 576–768px | Grille de pins à 2 colonnes |
| Tablette | 768–890px | Grille étendue |
| Petit bureau | 890–1312px | Grille maçonnique standard |
| Bureau | 1312–1440px | Mise en page complète |
| Grand bureau | 1440–1680px | Colonnes de grille étendues |
| Ultra-large | >1680px | Densité de grille maximale |

### Stratégie de réduction
- Grille de pins : 5+ colonnes → 3 → 2 → 1
- Navigation : barre de recherche + icônes → navigation mobile simplifiée
- Sections featured : côte à côte → empilées
- Héros : 70px → réduit proportionnellement
- Pied de page : multicolonne sombre → empilé

## 9. Guide de prompt pour agents

### Référence rapide des couleurs
- Marque : Rouge Pinterest (`#e60023`)
- Fond : Blanc (`#ffffff`)
- Texte : Noir prune (`#211922`)
- Texte secondaire : Gris olive (`#62625b`)
- Surface de bouton : Gris sable (`#e5e5e0`)
- Bordure : Argent chaud (`#91918c`)
- Focus : Bleu focus (`#435ee5`)

### Exemples de prompts de composants
- « Créer un héros : fond blanc. Titre à 70px Pin Sans graisse 600, noir prune (#211922). Bouton CTA rouge (#e60023, rayon 16px, rembourrage 6px 14px). Bouton sable secondaire (#e5e5e0, rayon 16px). »
- « Concevoir une carte pin : fond blanc, rayon 16px, pas d'ombre. La photographie remplit le haut, description 16px Pin Sans graisse 400 en dessous en #62625b. »
- « Construire un bouton d'action circulaire : fond #e0e0d9, rayon 50%, icône #211922. »
- « Créer un champ de saisie : fond blanc, 1px solid #91918c, rayon 16px, rembourrage 11px 15px. Focus : contour bleu via tokens sémantiques. »
- « Concevoir le pied de page sombre : fond #33332e. Logo script Pinterest en blanc. Liens 12px Pin Sans en #91918c. »

### Guide d'itération
1. Neutrals chauds partout — gris olive/sable, jamais acier froid
2. Rouge Pinterest pour les CTAs uniquement — audacieux et unique
3. Rayon 16px sur les boutons/saisies, 20px+ sur les cartes — généreux mais pas en pilule
4. Pin Sans est la seule police — compact à 12px pour l'interface, 70px pour l'affichage
5. La photographie porte le design — l'interface reste chaude et minimale
6. Noir prune (#211922) pour le texte — plus chaud que le noir pur
