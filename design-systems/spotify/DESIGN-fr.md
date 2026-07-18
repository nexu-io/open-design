# Système de Design Inspiré de Spotify

> Category: Médias & Grand public
> Streaming musical. Vert vif sur fond sombre, typographie affirmée, sublimé par les pochettes d'albums.

## 1. Thème Visuel & Atmosphère

L'interface web de Spotify est un lecteur de musique sombre et immersif qui enveloppe les auditeurs dans un cocon quasi-noir (`#121212`, `#181818`, `#1f1f1f`) où les pochettes d'albums et le contenu deviennent la principale source de couleur. La philosophie de design est la « noirceur au service du contenu » — l'UI s'efface dans l'ombre pour que la musique, les podcasts et les playlists puissent rayonner. Chaque surface est une nuance de gris anthracite, créant un environnement semblable à une salle de cinéma où la seule vraie couleur provient du Vert Spotify iconique (`#1ed760`) et des pochettes d'albums elles-mêmes.

La typographie utilise SpotifyMixUI et SpotifyMixUITitle — des polices propriétaires de la famille CircularSp (Circular par Lineto, personnalisée pour Spotify) avec une pile de repli étendue incluant l'arabe, l'hébreu, le cyrillique, le grec, le dévanagari et les polices CJK, reflétant la portée mondiale de Spotify. Le système typographique est compact et fonctionnel : 700 (gras) pour l'emphase et la navigation, 600 (semi-gras) pour l'emphase secondaire, et 400 (normal) pour le corps de texte. Les boutons utilisent des majuscules avec un espacement positif des lettres (1.4px–2px) pour un aspect systématique, à la manière d'une étiquette.

Ce qui distingue Spotify, c'est sa géométrie en pilule et en cercle. Les boutons principaux utilisent un rayon de 500px à 9999px (pilule complète), les boutons de lecture circulaires utilisent un rayon de 50 %, et les champs de recherche sont des pilules de 500px. Combiné à de lourdes ombres (`rgba(0,0,0,0.5) 0px 8px 24px`) sur les éléments surélevés et un unique combo bordure-ombre en incrustation (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), il en résulte une interface qui ressemble à un appareil audio premium — tactile, arrondie et conçue pour le toucher.

**Caractéristiques Clés :**
- Thème sombre quasi-noir immersif (`#121212`–`#1f1f1f`) — l'UI disparaît derrière le contenu
- Vert Spotify (`#1ed760`) comme accent de marque singulier — jamais décoratif, toujours fonctionnel
- Famille de polices SpotifyMixUI/CircularSp avec prise en charge des scripts mondiaux
- Boutons en pilule (500px–9999px) et contrôles circulaires (50 %) — arrondis, optimisés pour le tactile
- Libellés de boutons en majuscules avec large espacement des lettres (1.4px–2px)
- Ombres prononcées sur les éléments surélevés (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Couleurs sémantiques : rouge négatif (`#f3727f`), orange d'avertissement (`#ffa42b`), bleu d'annonce (`#539df5`)
- Les pochettes d'albums comme principale source de couleur — l'UI est achromatique par conception

## 2. Palette de Couleurs & Rôles

### Marque Principale
- **Vert Spotify** (`#1ed760`) : Accent de marque principal — boutons de lecture, états actifs, CTA
- **Quasi-Noir** (`#121212`) : Surface de fond la plus profonde
- **Surface Sombre** (`#181818`) : Cartes, conteneurs, surfaces surélevées
- **Sombre Moyen** (`#1f1f1f`) : Fonds de boutons, surfaces interactives

### Texte
- **Blanc** (`#ffffff`) : `--text-base`, texte principal
- **Argent** (`#b3b3b3`) : Texte secondaire, libellés atténués, navigation inactive
- **Blanc Cassé** (`#cbcbcb`) : Texte secondaire légèrement plus lumineux
- **Clair** (`#fdfdfd`) : Quasi-blanc pour l'emphase maximale

### Sémantique
- **Rouge Négatif** (`#f3727f`) : `--text-negative`, états d'erreur
- **Orange d'Avertissement** (`#ffa42b`) : `--text-warning`, états d'avertissement
- **Bleu d'Annonce** (`#539df5`) : `--text-announcement`, états d'information

### Surface & Bordure
- **Carte Sombre** (`#252525`) : Surface de carte surélevée
- **Carte Moyenne** (`#272727`) : Surface de carte alternative
- **Gris Bordure** (`#4d4d4d`) : Bordures de boutons sur fond sombre
- **Bordure Claire** (`#7c7c7c`) : Bordures de boutons contournés, liens atténués
- **Séparateur** (`#b3b3b3`) : Lignes de séparation
- **Surface Claire** (`#eeeeee`) : Boutons en mode clair (rare)
- **Bordure Vert Spotify** (`#1db954`) : Variante de bordure accent vert

### Ombres
- **Prononcée** (`rgba(0,0,0,0.5) 0px 8px 24px`) : Dialogues, menus, panneaux surélevés
- **Moyenne** (`rgba(0,0,0,0.3) 0px 8px 8px`) : Cartes, menus déroulants
- **Bordure en Incrustation** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`) : Combo bordure-ombre pour les champs de saisie

## 3. Règles Typographiques

### Familles de Polices
- **Titre** : `SpotifyMixUITitle`, replis : `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Corps** : `SpotifyMixUI`, même pile de repli

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement des lettres | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Titre de section | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Graisse de titre gras |
| En-tête principal | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (serré) | normal | En-têtes de section semi-gras |
| Corps Gras | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Texte mis en emphase |
| Corps | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Corps standard |
| Bouton Majuscule | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (serré) | 1.4px–2px | `text-transform: uppercase` |
| Bouton | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Bouton standard |
| Lien Nav Gras | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navigation |
| Lien Nav | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Navigation inactive |
| Légende Gras | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Métadonnées en gras |
| Légende | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Métadonnées |
| Petit Gras | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Étiquettes, compteurs |
| Petit | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Texte fin |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Texte le plus petit |

### Principes
- **Binaire gras/normal** : La plupart des textes sont soit en 700 (gras) soit en 400 (normal), avec le 600 utilisé avec parcimonie. Cela crée une hiérarchie visuelle claire par contraste de graisse plutôt que par variation de taille.
- **Boutons en majuscules comme système** : Les libellés de boutons utilisent les majuscules + un large espacement des lettres (1.4px–2px), créant une « voix d'étiquette » systématique distincte du texte de contenu.
- **Taille compacte** : La plage va de 10px à 24px — plus étroite que la plupart des systèmes. La typographie de Spotify est compacte et fonctionnelle, conçue pour parcourir des playlists, pas pour lire des articles.
- **Prise en charge des scripts mondiaux** : La pile de repli étendue (arabe, hébreu, cyrillique, grec, dévanagari, CJK) reflète la présence de Spotify sur 180+ marchés.

## 4. Styles des Composants

### Boutons

**Pilule Sombre**
- Fond : `#1f1f1f`
- Texte : `#ffffff` ou `#b3b3b3`
- Rembourrage : 8px 16px
- Rayon : 9999px (pilule complète)
- Utilisation : Pilules de navigation, actions secondaires

**Grande Pilule Sombre**
- Fond : `#181818`
- Texte : `#ffffff`
- Rembourrage : 0px 43px
- Rayon : 500px
- Utilisation : Boutons de navigation principale de l'application

**Pilule Claire**
- Fond : `#eeeeee`
- Texte : `#181818`
- Rayon : 500px
- Utilisation : CTA en mode clair (consentement aux cookies, marketing)

**Pilule Contournée**
- Fond : transparent
- Texte : `#ffffff`
- Bordure : `1px solid #7c7c7c`
- Rembourrage : 4px 16px 4px 36px (asymétrique pour l'icône)
- Rayon : 9999px
- Utilisation : Boutons Suivre, actions secondaires

**Lecture Circulaire**
- Fond : `#1f1f1f`
- Texte : `#ffffff`
- Rembourrage : 12px
- Rayon : 50 % (cercle)
- Utilisation : Contrôles lecture/pause

### Cartes & Conteneurs
- Fond : `#181818` ou `#1f1f1f`
- Rayon : 6px–8px
- Pas de bordures visibles sur la plupart des cartes
- Survol : légère clarification du fond
- Ombre : `rgba(0,0,0,0.3) 0px 8px 8px` sur les éléments surélevés

### Champs de Saisie
- Champ de recherche : fond `#1f1f1f`, texte `#ffffff`
- Rayon : 500px (pilule)
- Rembourrage : 12px 96px 12px 48px (tenant compte de l'icône)
- Focus : la bordure devient `#000000`, contour `1px solid`

### Navigation
- Barre latérale sombre avec SpotifyMixUI 14px graisse 700 pour actif, 400 pour inactif
- `#b3b3b3` couleur atténuée pour les éléments inactifs, `#ffffff` pour les actifs
- Boutons d'icônes circulaires (rayon 50 %)
- Logo Spotify en haut à gauche en vert

## 5. Principes de Mise en Page

### Système d'Espacement
- Unité de base : 8px
- Échelle : 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Grille & Conteneur
- Barre latérale (fixe) + zone de contenu principale
- Cartes d'albums/playlists en grille
- Barre de lecture en cours pleine largeur en bas
- La zone de contenu responsive occupe l'espace restant

### Philosophie des Espaces Blancs
- **Compression sombre** : Spotify condense le contenu de façon dense — les grilles de playlists, les listes de pistes et la navigation sont toutes très rapprochées. Le fond sombre offre un repos visuel entre les éléments sans nécessiter de grands espaces.
- **Densité de contenu plutôt qu'espace de respiration** : C'est une application, pas un site marketing. Chaque pixel est au service de l'expérience d'écoute.

### Échelle des Rayons de Bordure
- Minimal (2px) : Badges, étiquettes explicites
- Subtil (4px) : Champs de saisie, petits éléments
- Standard (6px) : Conteneurs de pochettes d'albums, cartes
- Confortable (8px) : Sections, dialogues
- Moyen (10px–20px) : Panneaux, éléments superposés
- Large (100px) : Grands boutons en pilule
- Pilule (500px) : Boutons principaux, champ de recherche
- Pilule Complète (9999px) : Pilules de navigation, recherche
- Cercle (50 %) : Boutons de lecture, avatars, icônes

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Base (Niveau 0) | Fond `#121212` | Couche la plus profonde, fond de page |
| Surface (Niveau 1) | `#181818` ou `#1f1f1f` | Cartes, barre latérale, conteneurs |
| Surélevé (Niveau 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Menus déroulants, cartes au survol |
| Dialogue (Niveau 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modales, superpositions, menus |
| Incrustation (Bordure) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Bordures de champs de saisie |

**Philosophie des Ombres** : Spotify utilise des ombres particulièrement prononcées pour une application à thème sombre. L'ombre à opacité 0.5 avec 24px de flou crée un effet dramatique de « flottement dans l'obscurité » pour les dialogues et menus, tandis que l'opacité 0.3 à 8px de flou offre un soulèvement de carte plus subtil. La combinaison unique bordure-ombre en incrustation sur les champs de saisie crée une qualité tactile et encastrée.

## 7. À Faire & À Éviter

### À Faire
- Utiliser des fonds quasi-noirs (`#121212`–`#1f1f1f`) — profondeur par variation de teinte
- Appliquer le Vert Spotify (`#1ed760`) uniquement pour les contrôles de lecture, les états actifs et les CTA principaux
- Utiliser la forme en pilule (500px–9999px) pour tous les boutons — circulaire (50 %) pour les contrôles de lecture
- Appliquer les majuscules + large espacement des lettres (1.4px–2px) sur les libellés de boutons
- Garder la typographie compacte (plage 10px–24px) — c'est une application, pas un magazine
- Utiliser des ombres prononcées (opacité 0.3–0.5) pour les éléments surélevés sur fonds sombres
- Laisser les pochettes d'albums apporter la couleur — l'UI elle-même est achromatique

### À Éviter
- Ne pas utiliser le Vert Spotify de façon décorative ou en fond — il est uniquement fonctionnel
- Ne pas utiliser de fonds clairs pour les surfaces principales — l'immersion sombre est fondamentale
- Ne pas ignorer la géométrie pilule/cercle sur les boutons — les boutons carrés brisent l'identité
- Ne pas utiliser des ombres fines/subtiles — sur fonds sombres, les ombres doivent être prononcées pour être visibles
- Ne pas ajouter de couleurs de marque supplémentaires — vert + gris achromatiques est la palette complète
- Ne pas utiliser des interlignes souples — la typographie de Spotify est compacte et dense
- Ne pas exposer des bordures grises brutes — utiliser des bordures à base d'ombres ou en incrustation

## 8. Comportement Responsive

### Points de Rupture
| Nom | Largeur | Changements Clés |
|------|-------|-------------|
| Mobile Petit | <425px | Mise en page mobile compacte |
| Mobile | 425–576px | Mobile standard |
| Tablette | 576–768px | Grille à 2 colonnes |
| Grande Tablette | 768–896px | Mise en page élargie |
| Petit Bureau | 896–1024px | Barre latérale visible |
| Bureau | 1024–1280px | Mise en page bureau complète |
| Grand Bureau | >1280px | Grille élargie |

### Stratégie de Réduction
- Barre latérale : complète → réduite → masquée
- Grille d'albums : 5 colonnes → 3 → 2 → 1
- Barre de lecture en cours : maintenue à toutes les tailles
- Recherche : champ en pilule maintenu, la largeur s'adapte
- Navigation : barre latérale → barre inférieure sur mobile

## 9. Guide de Prompt pour Agent

### Référence Rapide des Couleurs
- Fond : Quasi-Noir (`#121212`)
- Surface : Carte Sombre (`#181818`)
- Texte : Blanc (`#ffffff`)
- Texte secondaire : Argent (`#b3b3b3`)
- Accent : Vert Spotify (`#1ed760`)
- Bordure : `#4d4d4d`
- Erreur : Rouge Négatif (`#f3727f`)

### Exemples de Prompts de Composants
- "Créer une carte sombre : fond `#181818`, rayon 8px. Titre en SpotifyMixUI 16px graisse 700, texte blanc. Sous-titre en 14px graisse 400, `#b3b3b3`. Ombre `rgba(0,0,0,0.3) 0px 8px 8px` au survol."
- "Concevoir un bouton en pilule : fond `#1f1f1f`, texte blanc, rayon 9999px, rembourrage 8px 16px. SpotifyMixUI 14px graisse 700, majuscules, espacement des lettres 1.4px."
- "Construire un bouton de lecture circulaire : fond Vert Spotify (`#1ed760`), icône `#000000`, rayon 50 %, rembourrage 12px."
- "Créer un champ de recherche : fond `#1f1f1f`, texte blanc, rayon 500px, rembourrage 12px 48px. Bordure en incrustation : `rgb(124,124,124) 0px 0px 0px 1px inset`."
- "Concevoir une barre latérale de navigation : fond `#121212`. Éléments actifs : 14px graisse 700, blanc. Inactifs : 14px graisse 400, `#b3b3b3`."

### Guide d'Itération
1. Commencer avec `#121212` — tout vit dans l'obscurité quasi-noire
2. Vert Spotify uniquement pour les éléments fonctionnels (lecture, actif, CTA)
3. Mettre en pilule tout — 500px pour les grands, 9999px pour les petits, 50 % pour les circulaires
4. Majuscules + large tracking sur les boutons — la voix d'étiquette systématique
5. Ombres prononcées (opacité 0.3–0.5) pour l'élévation — les ombres légères sont invisibles sur fond sombre
6. Les pochettes d'albums apportent toute la couleur — l'UI reste achromatique
