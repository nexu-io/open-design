# Système de design inspiré par OpenAI

> Category: IA & LLM
> Système calme, quasi-monochrome, ancré dans un noir tirant sur le sarcelle profond, avec de généreux espaces blancs et une typographie éditoriale.

## 1. Thème visuel & atmosphère

La surface produit d'OpenAI évoque un laboratoire de recherche habillé pour le grand public — clinique, retenu, délibérément silencieux. Le fond de page est un blanc pur (`#ffffff`) superposé à un encre presque noire (`#0d0d0d`) avec une subtile nuance sarcelle, si bien que même le texte paraît légèrement refroidi plutôt qu'agressivement sombre. Il en résulte une neutralité chromatique qui met au premier plan la sortie du modèle, le code et la prose — et non le chrome qui les entoure.

La signature stylistique repose sur l'utilisation de **Söhne** (ou son substitut système `inter`) à des graisses mesurées — 400 pour le corps, 500 pour la navigation et les étiquettes, 600 pour l'emphase — associée à **Signifier**, une serif contemporaine réservée à l'affichage éditorial. Là où la plupart des marques IA s'orientent vers le futurisme, les titres en serif d'OpenAI confèrent au produit un ton discrètement littéraire, comme si chaque annonce était un essai.

Le système de formes est uniformément doux : rayons de 8px à 12px, pilules à 9999px pour les étiquettes et puces, aucun angle vif nulle part. Les transitions entre sections sont marquées par des espaces blancs plutôt que des séparateurs ; lorsque des bordures apparaissent, ce sont des liserés `#e5e5e5` qui se lisent comme une absence de couleur plutôt que comme sa présence.

**Caractéristiques clés :**
- Canevas blanc pur (`#ffffff`) avec encre noir-sarcelle profond (`#0d0d0d`)
- Söhne / Inter à des graisses modestes (400, 500, 600) — retenue plutôt qu'affirmation
- Serif Signifier pour les titres d'affichage éditoriaux
- Rayons doux de 8–12px partout ; pilules à 9999px pour les puces
- Bordures en liseré (`#e5e5e5`) utilisées avec parcimonie ; l'espace blanc est le séparateur principal
- Illustrations monochrome en sarcelle profond — aucun dégradé dans les symboles
- Interlignage généreux (1,55–1,65) et espacement des lettres proche de zéro

## 2. Palette de couleurs & rôles

### Primaire
- **Blanc pur** (`#ffffff`) : Fond principal, surface des cartes, fond des boutons.
- **Noir encre** (`#0d0d0d`) : Texte principal, marque, CTA principal.
- **Noir doux** (`#1a1a1a`) : Titre secondaire, encre alternative pour les textes non critiques.

### Surface & Fond
- **Brume** (`#fafafa`) : Fond de rupture de section, surface du pied de page.
- **Perle** (`#f5f5f5`) : Surface des cartes, panneau surélevé.
- **Nuage** (`#ececec`) : Fond désactivé, teinte de séparateur.

### Accent de marque
- **Sarcelle OpenAI** (`#10a37f`) : Marque principale, lien, badge de mise en évidence — la seule couleur dans un système autrement neutre.
- **Sarcelle profond** (`#0a7a5e`) : État de survol et d'appui pour la couleur de marque.
- **Sarcelle doux** (`#e8f5f0`) : Teinte de surface pour les badges de succès, les encadrés de mise en évidence.

### Neutres & Texte
- **Graphite** (`#3c3c3c`) : Texte de corps, couleur de lecture par défaut.
- **Ardoise** (`#6e6e6e`) : Texte secondaire, légendes, métadonnées.
- **Cendre** (`#9b9b9b`) : Texte tertiaire, espace réservé, étiquette désactivée.
- **Pierre** (`#c4c4c4`) : Séparateurs décoratifs, icônes discrètes.

### Sémantique & Bordure
- **Bordure liseré** (`#e5e5e5`) : Séparateur liseré standard.
- **Bordure douce** (`#ededed`) : Contour de carte sur surface blanche.
- **Erreur** (`#ef4146`) : Validation, action destructrice.
- **Avertissement** (`#f5a623`) : Ambre doux pour les états consultatifs.
- **Information** (`#2563eb`) : Ton de lien informatif (utilisé avec parcimonie ; le sarcelle reste prioritaire).

## 3. Règles typographiques

### Famille de polices
- **Affichage / Éditorial** : `Signifier`, avec repli : `'Source Serif Pro', Georgia, serif`
- **Corps / UI** : `Söhne`, avec repli : `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono** : `Söhne Mono`, avec repli : `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hiérarchie

| Rôle | Police | Taille | Graisse | Interlignage | Espacement | Notes |
|------|--------|--------|---------|--------------|------------|-------|
| Affichage | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Héros éditorial, titres d'annonce |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Titre de page |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Titre de section |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Sous-section |
| Corps large | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Paragraphes d'accroche |
| Corps | Söhne | 16px (1rem) | 400 | 1.65 | normal | Texte de lecture standard |
| Corps petit | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Corps des cartes, UI dense |
| Légende | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Métadonnées, badges |
| Étiquette | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Sourcils, liens de navigation en majuscules |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Blocs de code, sortie terminal |

### Principes
- **La retenue comme identité** : les graisses plafonnent à 600 ; 700 et au-delà paraissent hors-marque. La hiérarchie passe par la taille et la couleur, non par la graisse.
- **La serif pour l'âme, la sans-serif pour le système** : Signifier n'apparaît que dans les moments d'affichage éditorial. L'UI produit est exclusivement en sans-serif.
- **Crénage négatif en affichage** : -0.02em pour les grandes tailles ; le crénage revient à zéro à partir de 16px.

## 4. Styles des composants

### Boutons

**Principal**
- Fond : `#0d0d0d`
- Texte : `#ffffff`
- Rembourrage : 10px 18px
- Rayon : 9999px (pilule complète) pour les puces, 12px pour les CTA rectangulaires
- Survol : fond `#1a1a1a`
- Utilisation : CTA principal, « Essayer ChatGPT », « Se connecter »

**Secondaire**
- Fond : `#ffffff`
- Texte : `#0d0d0d`
- Bordure : 1px solid `#e5e5e5`
- Rembourrage : 10px 18px
- Rayon : 12px
- Survol : fond `#fafafa`, bordure `#d4d4d4`

**Accent de marque**
- Fond : `#10a37f`
- Texte : `#ffffff`
- Rembourrage : 10px 18px
- Rayon : 12px
- Survol : `#0a7a5e`
- Utilisation : CTA de mise à niveau mis en avant, parcours de succès

### Cartes
- Fond : `#ffffff`
- Bordure : 1px solid `#ededed`
- Rayon : 16px
- Rembourrage : 24px–32px
- Ombre : aucune par défaut ; au survol `0 4px 16px rgba(13,13,13,0.06)`

### Champs de saisie
- Fond : `#ffffff`
- Bordure : 1px solid `#e5e5e5`
- Rayon : 12px
- Rembourrage : 12px 14px
- Focus : bordure `#10a37f`, anneau `0 0 0 3px rgba(16,163,127,0.12)`

### Pilules & Étiquettes
- Fond : `#f5f5f5`
- Texte : `#3c3c3c`
- Rembourrage : 4px 10px
- Rayon : 9999px
- Police : 12px / 500

## 5. Espacement & Mise en page

- **Unité de base** : 4px. Échelle : 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Conteneur** : largeur maximale 1200px, gouttière de 24px sur mobile, 48px sur bureau.
- **Rythme des sections** : 96–128px en vertical entre les sections principales ; 64px sur mobile.
- **Grille** : 12 colonnes sur bureau, 4 colonnes sur mobile, gouttière de 24px.

## 6. Mouvement

- **Durée** : 150–220ms pour le survol ; 280–360ms pour les transitions de mise en page.
- **Accélération** : `cubic-bezier(0.16, 1, 0.3, 1)` (sortie fluide) pour les entrées.
- **Retenue** : pas de parallaxe, pas de scroll-jacking. Fondu et translation subtils uniquement.

## 7. Garde-fous d'utilisation

- Préserver ensemble la retenue éditoriale neutre, le rayon doux et l'usage parcimonieux de l'accent ; les accents verts seuls ne créent pas une surface évocatrice d'OpenAI.
- Réserver les moments d'affichage de style Signifier aux hiérarchies éditoriales ou d'annonce, en maintenant les contrôles produit dans le système sans-serif.
- Éviter les animations ornementales, les ombres lourdes et les cartes décoratives surdimensionnées ; le système doit paraître calme, lisible et délibéré.
