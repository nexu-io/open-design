# Système de design inspiré d'Airbnb

> Category: E-Commerce et vente au détail
> Marketplace de voyage. Accent corail chaleureux, axé sur la photographie, interface aux coins arrondis.

## 1. Thème visuel et atmosphère

Le design d'Airbnb en 2026 ressemble à un magazine de voyage qui serait devenu une application — des toiles d'un blanc immaculé laissent place à des photographies plein cadre, et l'interface elle-même s'efface pour laisser respirer les annonces. La couleur corail-rose Rausch caractéristique (`#ff385c`) est utilisée avec parcimonie mais de façon reconnaissable : CTA de recherche, indicateur d'onglet actif, bouton d'action principale, prix ou cœur de liste de souhaits à l'occasion. Tout le reste est un camaïeu de gris discipliné, avec `#222222` portant presque chaque ligne de texte.

Ce qui rend le système inconfondablement Airbnb, c'est la *confiance* qu'il place dans le contenu. Les photos des propriétés sont affichées à l'échelle héroïque, en 4:3 avec un traitement bords-à-bords arrondi. La navigation par catégorie s'effectue via un sélecteur à trois onglets (Logements / Expériences / Services) utilisant des icônes illustrées en rendu 3D (une maison à toit en pente, une montgolfière, une cloche de service) — physiques, tactiles, presque jouets — associées à des étiquettes `Airbnb Cereal VF` nettes. C'est le rare produit grand public où des rendus 3D et une interface purement typographique coexistent sans tension.

La nouvelle surface est la gamme de produits **Expériences** — même chrome, mais densité de cartes plus riche, plus de photographie, et un panneau de réservation centré avec un rail droit sticky. Les pages de détail des annonces (chambres et expériences) suivent un gabarit rigide : grille d'images héros plein cadre → carte de réservation arrondie superposée (sticky au défilement) → équipements → avis (les récompenses Guest Favorite utilisent un grand `4,81` centré avec un médaillon de couronne de laurier) → carte → profil de l'hôte → informations légales. Le rythme est cohérent que vous réserviez une chambre ou une excursion en yacht.

**Caractéristiques clés :**
- Corail-rose Rausch (`#ff385c`) comme couleur de marque à accent unique, utilisée uniquement pour les CTA principaux et le bouton de recherche
- Photographie plein cadre en 4:3 / 16:9 avec des coins légèrement arrondis (14–20px) comme vocabulaire visuel principal
- Icônes de catégorie en rendu 3D associées à des onglets typographiques — le seul endroit où le système autorise l'illustration
- Boutons icônes circulaires `50%` (flèche retour, partager, favori, flèches de carrousel) dispersés partout
- `Airbnb Cereal VF` porte chaque étiquette, de la note légale en 8px au titre de section en 28px — un système à famille unique
- Codage couleur par niveau de produit : Airbnb Plus (magenta `#92174d`), Airbnb Luxe (violet profond `#460479`), Airbnb (corail Rausch)
- Médaillon de récompense Guest Favorite — grand numéro de note centré entre deux couronnes de laurier, l'un des moments les plus reconnaissables du système
- Panneau de réservation sticky avec un empilement prix → dates → voyageurs, ancré au rail droit sur ordinateur, se transformant en barre de réservation ancrée en bas sur mobile
- Navigation mobile fixe en bas (Explorer / Listes de souhaits / Se connecter) avec une teinte Rausch à l'état actif

## 2. Palette de couleurs et rôles

### Primaire
- **Rausch** (`#ff385c`) : Le corail-rose signature de la marque. Variable CSS `--palette-bg-primary-core`. Utilisé pour : le bouton principal "Réserver", le bouton de soumission de recherche, le soulignement d'onglet actif, le remplissage du cœur de liste de souhaits, la mise en évidence des prix. La couleur la plus visible sur chaque page.

### Secondaire et accent
- **Deep Rausch** (`#e00b41`) : Une variante plus saturée. Variable CSS `--palette-bg-tertiary-core`. Utilisé pour les états de bouton pressé/actif et les points terminaux de dégradé.
- **Plus Magenta** (`#92174d`) : Variable CSS `--palette-bg-primary-plus`. La couleur de marque pour le niveau de produit Airbnb Plus — une offre d'annonces sélectionnées haut de gamme.
- **Luxe Purple** (`#460479`) : Variable CSS `--palette-bg-primary-luxe`. La couleur de marque pour le niveau de produit Airbnb Luxe — locations de villas et propriétés de standing.
- **Info Blue** (`#428bff`) : Variable CSS `--palette-text-legal`. Utilisé pour les liens légaux/informationnels (conditions, confidentialité, informations) — la seule couleur de lien non-monochrome dans le système.

### Surface et arrière-plan
- **Canvas White** (`#ffffff`) : L'arrière-plan de page par défaut. Chaque carte, chaque conteneur, chaque page de détail commence ici.
- **Soft Cloud** (`#f7f7f7`) : Teinte de sous-surface subtile utilisée sur les arrière-plans de pied de page, les enveloppes de vue cartographique et les sections "tout le reste" qui souhaitent se détacher du blanc principal.
- **Hairline Gray** (`#dddddd`) : Couleur de bordure 1px omniprésente — sépare les cartes, les rangées d'équipements, les panneaux d'avis, les colonnes de pied de page. Le cheval de labour du système de mise en page.

### Neutres et texte
- **Ink Black** (`#222222`) : Variable CSS `--palette-text-primary`. Le quasi-noir du système. Chaque titre, chaque paragraphe, chaque étiquette de navigation, chaque prix. Utilisé pour ~90% de tout le texte d'une page.
- **Charcoal** (`#3f3f3f`) : Variable CSS `--palette-text-focused`. Utilisé dans le texte de saisie à l'état focused et le texte d'accentuation secondaire.
- **Ash Gray** (`#6a6a6a`) : Variable CSS `--palette-bg-tertiary-hover`. Étiquettes secondaires, texte de style sous-titre "Location de cottages" sous les noms de ville, liens de pied de page atténués.
- **Mute Gray** (`#929292`) : Variable CSS `--palette-text-link-disabled`. Boutons désactivés et métadonnées basse priorité.
- **Stone Gray** (`#c1c1c1`) : Séparateurs tertiaires, traits d'icônes, avatars de substitution.

### Sémantique et accent
- **Error Red** (`#c13515`) : Variable CSS `--palette-text-primary-error`. Erreurs de validation de formulaire, avertissements d'action destructive.
- **Deep Error** (`#b32505`) : Variable CSS `--palette-text-secondary-error-hover`. Variantes pressées/actives des états d'erreur.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`) : Variable CSS `--palette-text-material-disabled`. Étiquettes de style matériel désactivées.

### Système de dégradé
Le dégradé de marque d'Airbnb apparaît avec parcimonie, généralement uniquement sur le logotype et le moment de marque du bouton de recherche :

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Ce passage corail → magenta est le "moment de marque" — jamais utilisé comme surface complète, uniquement comme remplissage d'une pilule étroite ou traitement de logo.

## 3. Règles typographiques

### Famille de polices
- **Airbnb Cereal VF** (principale et unique) : Le sans-serif à graisse variable propriétaire qui porte l'ensemble du système. Polices de secours (dans l'ordre) : `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Graisses observées dans les tokens extraits : 500, 600, 700. Pas de 400-regular — la graisse "corps" du système est 500, ce qui donne à chaque bloc de texte une densité légèrement supérieure qui se lit comme confiante et délibérée.

Fonctionnalités OpenType : `salt` (alternats stylistiques) est utilisé sur les étiquettes compactes en 11px et 14px 600 — probablement pour un mise en forme plus serrée des chiffres et des caractères spéciaux. Aucune fonctionnalité de ligatures ou de chiffres fractionnaires observée.

### Hiérarchie

| Rôle | Taille | Graisse | Hauteur de ligne | Espacement des lettres | Notes |
|------|--------|---------|------------------|------------------------|-------|
| Titre de section | 28px / 1,75rem | 700 | 1,43 | 0 | "Inspiration pour de futurs séjours" — titres de niveau page |
| Titre de sous-section | 22px / 1,38rem | 500 | 1,18 | -0,44px | "Ce que ce logement propose", "Rencontrez les hôtes" — séparateurs de contenu |
| Titre de carte | 21px / 1,31rem | 700 | 1,43 | 0 | Titres de panneau d'avis, titres principaux de carte |
| Titre d'annonce | 20px / 1,25rem | 600 | 1,20 | -0,18px | "Excursion en petit groupe en yacht, vin et fruits à volonté" — titres d'annonces sur les pages de détail |
| Sous-titre gras | 16px / 1,00rem | 600 | 1,25 | 0 | Nom de l'hôte, nom de la ville |
| Corps moyen | 16px / 1,00rem | 500 | 1,25 | 0 | Texte de corps principal sur les pages de détail |
| Bouton large | 16px / 1,00rem | 500 | 1,25 | 0 | "Réserver", "Devenir hôte" |
| Bouton par défaut | 14px / 0,88rem | 500 | 1,29 | 0 | Étiquettes de bouton standard |
| Lien | 14px / 0,88rem | 500 | 1,43 | 0 | Liens de navigation, liens de pied de page |
| Légende moyenne | 14px / 0,88rem | 500 | 1,29 | 0 | Métadonnées, lignes de sous-titre ("Location de cottages", "Location de villas") |
| Légende grasse | 14px / 0,88rem | 600 | 1,43 | 0 | Fonctionnalité `salt` activée — statistiques numériques, accentuation petit texte |
| Petite légende | 13px / 0,81rem | 400 | 1,23 | 0 | Dates d'avis, micro-métadonnées |
| Micro par défaut | 12px / 0,75rem | 400 | 1,33 | 0 | Clauses de non-responsabilité de pied de page, micro-texte légal |
| Micro gras | 12px / 0,75rem | 700 | 1,33 | 0 | Étiquettes de pilule "NOUVEAU" |
| Badge majuscule | 11px / 0,69rem | 600 | 1,18 | 0 | Fonctionnalité `salt` — badges compacts de catégorie/statut |
| Exposant | 8px / 0,50rem | 700 | 1,25 | 0,32px | Majuscules — notes de bas de page de prix, décimales |

### Principes
- **Une famille, plusieurs graisses.** Airbnb Cereal VF gère tout, des mentions légales en 8px aux titres de page en 28px — l'identité visuelle vient de la famille elle-même, pas du mélange de polices.
- **500 est le nouveau 400.** La graisse "normale" du système est 500, donnant à chaque paragraphe une texture légèrement plus confiante que la valeur par défaut du web.
- **Tracking négatif uniquement pour les types d'affichage.** Les titres de 20px et plus compriment le tracking de -0,18 à -0,44px pour un aspect ciselé ; les tailles de corps restent à un tracking de 0 pour la lisibilité.
- **Hauteurs de ligne serrées pour les titres, généreuses pour le corps.** Le texte d'affichage tourne à 1,18–1,25 (serré) ; le corps et les légendes s'ouvrent à 1,43 pour le confort longue lecture.
- **Pas de majuscules sauf à 8px.** La seule transformation en majuscules dans le système est l'exposant en 8px — partout ailleurs, la casse de phrase avec des variations de graisse subtiles fait le travail.

### Note sur les substituts de polices
Airbnb Cereal VF est propriétaire. Le substitut open source le plus proche est **Circular Std** (toujours commercial) ou **Inter** (gratuit, Google Fonts) avec un letter-spacing réduit de -0,01em aux tailles d'affichage. Pour une fidélité stricte à la marque, la chaîne de secours documentée (`Circular, -apple-system, system-ui`) s'affiche correctement sur macOS/iOS où `system-ui` se résout en San Francisco, qui a des proportions similaires.

## 4. Styles des composants

### Boutons

**CTA principal** ("Réserver", "Rechercher", "Ajouter des dates")
- Arrière-plan : Rausch `#ff385c`
- Texte : Canvas White `#ffffff`, Airbnb Cereal 500, 16px
- Rembourrage : ~14px vertical, 24px horizontal
- Rayon : 8px (rectangulaire) ou 50% (variante icône circulaire)
- Bordure : aucune
- Actif/pressé : `transform: scale(0.92)` plus un anneau de focus de 2px `#222222` à `0 0 0 2px`

**Bouton secondaire** ("Devenir hôte", actions tertiaires en contour)
- Arrière-plan : `#ffffff`
- Texte : Ink Black `#222222`, Airbnb Cereal 500, 14–16px
- Rembourrage : 10px 16px
- Rayon : 20px (pilule) ou 8px (rectangulaire)
- Bordure : 1px solid Hairline Gray `#dddddd`

**Bouton circulaire icône uniquement** (flèche retour, partager, favori, contrôles de carrousel)
- Arrière-plan : `#f2f2f2` (légèrement blanc cassé) ou blanc avec bordure noire translucide 1px
- Icône : trait de contour `#222222`, 16–20px
- Taille : diamètre 32–44px
- Rayon : 50%
- Actif/pressé : `transform: scale(0.92)` ; anneau blanc subtil de 4px `0 0 0 4px rgb(255,255,255)` pour se séparer des arrière-plans photographiques colorés

**Bouton désactivé**
- Arrière-plan : `#f2f2f2`
- Texte : Stone Gray `#c1c1c1`
- Opacité : 0,5

**Bouton onglet pilule** (sélecteur de catégorie "Logements / Expériences / Services")
- Arrière-plan : transparent
- Texte : Ink Black `#222222`, Airbnb Cereal 500, 16px
- Rembourrage : 8px 14px
- État actif : soulignement Ink Black de 2px sous l'étiquette
- Associé à une icône illustrée en rendu 3D de 36–48px au-dessus de l'étiquette

### Cartes et conteneurs

**Carte d'annonce** (grille de page d'accueil, résultats de recherche)
- Arrière-plan : `#ffffff`
- Rayon : 14px sur l'image, le texte se trouve directement en dessous sur fond transparent
- Image : ratio d'aspect 4:3, plein cadre, arrondie avec le même rayon de 14px
- Rembourrage : aucun sur le conteneur externe ; 12px d'espacement entre l'image et les rangées de métadonnées
- Ombre : aucune — la séparation vient de l'espace blanc et du rayon intrinsèque de la photographie
- Modèle de métadonnées : ville/région en ligne 1 (16px 600), distance/durée en ligne 2 (14px 500 Ash Gray), plage de dates en ligne 3, rangée de prix avec "par nuit" en bas

**Panneau de réservation de page de détail** (rail droit sticky sur les pages de chambre/expérience)
- Arrière-plan : `#ffffff`
- Rayon : 14–20px
- Bordure : 1px solid Hairline Gray `#dddddd`
- Ombre : `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — une élévation subtile à trois couches empilées
- Rembourrage : 24px
- Largeur : ~370px, ancré 120–140px sous le haut de la fenêtre
- Contenu : titre de prix → sélecteur de dates → menu déroulant des voyageurs → CTA principal → note de bas de page "Vous ne serez pas débité maintenant"

**Carte de grille d'équipements** (sur les pages de détail des annonces)
- Arrière-plan : `#ffffff`
- Bordure : 1px solid Hairline Gray `#dddddd` au niveau de la rangée (pas par élément)
- Rembourrage : 16px vertical par rangée d'équipement
- Modèle icône + étiquette : icône de contour 24px à gauche, étiquette 16px 500 à droite

**Carte d'avis** (avis individuel sur les pages de détail)
- Arrière-plan : `#ffffff`, pas de bordure
- Rembourrage : 0 (repose sur les espaces de grille)
- Contenu : avatar circulaire 40px + nom en 16px 600 + date en 14px 400 Ash Gray sur une rangée, puis paragraphe de corps en 14px 500 en dessous

### Saisies et formulaires

**Barre de recherche** (page d'accueil principale)
- Arrière-plan : `#ffffff`
- Bordure : 1px solid Hairline Gray `#dddddd` enveloppant les trois segments (Où / Quand / Qui)
- Rayon : 32px (pilule complète)
- Ombre : `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — sentiment de flottement subtil
- Structure : trois segments divisés par de fins séparateurs verticaux, chaque segment a une étiquette 12px 500 au-dessus d'un espace réservé 14px 500
- Soumission : bouton icône circulaire Rausch au bord droit, diamètre 48px

**Saisie de texte** (formulaires génériques)
- Arrière-plan : `#ffffff`
- Bordure : 1px solid Hairline Gray `#dddddd`
- Rayon : 8px
- Rembourrage : 14px 16px
- Focus : la bordure passe à Ink Black, ajoute un anneau extérieur noir `0 0 0 2px`
- Erreur : la bordure passe à `#c13515` (Error Red), le texte d'aide utilise la même couleur

**Sélecteur de dates**
- Grille de calendrier : mise en page à 7 colonnes, cellules de jours circulaires `50%` de 40–44px de large
- Plage sélectionnée : arrière-plan Ink Black `#222222` avec chiffres blancs
- Ancres de début/fin : cercles remplis plus grands ; les dates intermédiaires utilisent la teinte Soft Cloud `#f7f7f7`

### Navigation

**Nav supérieure (Ordinateur)**
- Hauteur : ~80px
- Arrière-plan : `#ffffff`
- Gauche : logotype + logo Airbnb en Rausch (102×32px)
- Centre : sélecteur de catégorie à trois onglets (Logements / Expériences / Services) avec des icônes 3D de 36–48px empilées au-dessus d'étiquettes 16px 500 ; l'onglet actif a un soulignement Ink Black de 2px
- Droite : lien textuel "Devenir hôte", puis globe circulaire 32px (langue), puis menu avatar hamburger 36px
- Border-bottom : 1px solid Hairline Gray `#dddddd`

**Nav supérieure (Mobile)**
- Pilule de recherche en rangée unique occupant toute la largeur : espace réservé "Commencer votre recherche" avec une petite icône loupe
- En dessous : le sélecteur de catégorie à trois onglets persiste (Logements / Expériences / Services) — les icônes illustrées rétrécissent à ~28px
- Barre d'onglets fixe en bas : Explorer (état actif Rausch) / Listes de souhaits / Se connecter — icônes 24px au-dessus d'étiquettes 12px

**Nav secondaire de page de détail d'annonce**
- Défilement horizontal sticky de liens d'ancrage (Photos · Équipements · Avis · Localisation · Hôte) apparaissant au défilement au-delà de l'image héros
- Hauteur : 56px
- Border-bottom : 1px solid Hairline Gray

### Traitement des images

- **Ratios d'aspect principaux** : 4:3 pour les grilles d'annonces de la page d'accueil, 16:9 pour la photographie héros des expériences, 1:1 pour les avatars
- **Rayon** : 14px sur les images de grille d'annonces, 20px sur les cadres de photos héros de page de détail, `50%` sur les avatars
- **Grille d'images sur les pages de détail** : grille de cinq photos avec une grande image unique à gauche (50% de largeur) et quatre photos plus petites dans une grille 2×2 à droite, toutes partageant le conteneur arrondi externe de 20px
- **Chargement différé** : utilisation intensive de `loading="lazy"` avec des aperçus de substitution flous
- **Carrousel** : boutons fléchés circulaires de 32px superposés à l'image, centrés verticalement ; les indicateurs de points se trouvent à 12px du bord inférieur

### Composants signature

**Médaillon de récompense Guest Favorite** (mis en évidence sur les pages de détail des annonces très bien notées)
- Numéro de note centré rendu en 44–56px 700
- Deux illustrations SVG de couronne de laurier dessinées à la main flanquant gauche et droite à ~48px de hauteur
- En dessous : étiquette "Guest Favorite" en 12px 700 majuscules avec un tracking de `0,32px`, et une courte sous-étiquette en 14px 500 Ash Gray
- Bloc pleine largeur, sans bordure de conteneur — se trouve directement sur la toile blanche

**Sélecteur de catégorie à trois onglets** (apparaît en haut de chaque surface de navigation)
- Trois onglets : Logements / Expériences / Services
- Chaque onglet : icône illustrée en rendu 3D (~48px de hauteur) au-dessus d'une étiquette 16px 500
- Les Expériences et Services portent actuellement une petite pilule "NOUVEAU" bleu marine (texte blanc 12px 700 sur fond bleu foncé) flottant en haut à droite de l'icône
- Onglet actif : soulignement Ink Black de 2px sous l'étiquette

**Grille de villes d'inspiration** (page d'accueil "Inspiration pour de futurs séjours")
- Grille à 6 colonnes de liens de destination sur ordinateur, 2 colonnes sur mobile
- Chaque cellule : nom de ville en 16px 600 en ligne 1, sous-titre de type de location en 14px 500 Ash Gray en ligne 2 ("Location de cottages", "Location de villas")
- Pas d'images — grille uniquement textuelle
- Tabulée ci-dessus par catégorie (Populaire / Arts & culture / Plage / Montagnes / Plein air / Activités / Conseils de voyage et inspiration / Appartements Airbnb-friendly) — l'onglet actif a un soulignement de 2px et un changement de graisse

**Carte sticky de réservation** (pages de détail des annonces)
- Reste fixe à 120px sous le haut de la fenêtre sur ordinateur lors du défilement au-delà du héros
- Se replie en une barre pleine largeur en bas sur mobile avec une étiquette "À partir de X€ / nuit" et une pilule Rausch "Réserver"
- Affiche toujours : titre de prix → affichage des dates → sélecteur de voyageurs → CTA Rausch → clause de non-responsabilité "Vous ne serez pas débité maintenant"

**Carte d'hôte d'expérience** (pages de détail des expériences)
- Conteneur arrondi pleine largeur avec une photographie de couverture 3:2 en haut
- Avatar de l'hôte (circulaire, 56px) chevauchant le bord inférieur de la couverture de 50%
- Sous le chevauchement : nom de l'hôte en 16px 700, ancienneté de l'hôte en 14px 500 Ash Gray, petit bouton pilule Rausch "Contacter l'hôte"
- Utilisé comme transition entre les avis et le bloc équipements/localisation

**Bande "Bon à savoir"** (pages de détail des annonces)
- Grille à 3 colonnes de blocs de règles/politiques (Règles du logement, Sécurité et propriété, Politique d'annulation)
- Chaque colonne : icône en haut, titre en 16px 600, corps en 14px 500 Ash Gray, lien "Afficher plus" souligné en Ink Black
- Séparateur : bordures supérieure et inférieure Hairline Gray 1px sur l'ensemble de la bande

## 5. Principes de mise en page

### Système d'espacement
- **Unité de base** : 8px
- **Échelle extraite** : 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32px — finement granulé avec quelques valeurs hors grille utilisées pour un alignement d'icônes au pixel près
- **Rembourrage de section** : ~48–64px haut/bas sur ordinateur, 24–32px sur mobile
- **Rembourrage interne des cartes** : 24px sur les panneaux de réservation et les grandes cartes, 16px sur les rangées d'équipements, 12px sur les métadonnées des cartes d'annonce
- **Gouttière entre les cartes d'annonce** : 24px ordinateur, 16px mobile
- **Entre les rangées de texte empilées** : 4–8px (très serré — renforce la sensation "information dense" des annonces de voyage)

### Grille et conteneur
- **Largeur maximale du contenu** : 1760–1920px en ultra-large (Airbnb laisse la grille respirer plus loin que la plupart des sites) ; 1280px sur la plupart des pages de détail
- **Grille d'annonces de la page d'accueil** : 6 colonnes à ≥1760px, 5 à ≥1440px, 4 à ≥1128px, 3 à ≥800px, 2 à ≥550px, 1 en dessous
- **Page de détail** : 2 colonnes asymétriques — contenu principal ~58%, panneau de réservation sticky ~36% à droite, ~6% de gouttière
- **Pied de page** : 3 colonnes Support / Hébergement / Airbnb

### Philosophie de l'espace blanc
Airbnb est richement informatif mais jamais à l'étroit. L'espace blanc est utilisé pour *regrouper* — les cartes d'annonce ont 24px de gouttière pour que chaque photographie soit lue comme un objet distinct, mais les métadonnées sous chaque carte utilisent des espaces de 4–8px pour que le prix/ville/date ressemble à une unité unique. Le panneau de réservation de page de détail a 24px de rembourrage interne, mais les rangées à l'intérieur (sélecteur de dates, sélecteur de voyageurs, CTA) sont empilées à 12px — la frontière entre la carte et la page fait plus de travail de séparation que le contenu à l'intérieur.

### Échelle des rayons de bordure
| Rayon | Utilisation |
|-------|-------------|
| 4px | Balises d'ancrage en ligne, puces de tags |
| 8px | Boutons de texte, menus déroulants, petits boutons utilitaires |
| 14px | Photographie des cartes d'annonce, conteneurs de contenu génériques, badges |
| 20px | Boutons arrondis principaux (forme pilule), grandes images, panneau de réservation |
| 32px | Pilule de la barre de recherche, conteneurs extra-larges |
| 50% | Tous les boutons icônes circulaires, tous les avatars, cœurs de liste de souhaits — la géométrie ronde signature du système |

## 6. Profondeur et élévation

| Niveau | Traitement | Utilisation |
|--------|------------|-------------|
| 0 | Pas d'ombre | Cartes d'annonce, contenu corporel, sections uniquement textuelles |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Boutons icônes actifs/pressés (ex. : retour, partager, favori) — légère élévation pour indiquer l'interaction |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Carte sticky du panneau de réservation, modales, menus déroulants — l'élévation signature à trois couches du système |
| Anneau de focus | `0 0 0 2px #222222` | Boutons à l'état actif, saisie de recherche focalisée |
| Anneau séparateur blanc | `rgb(255, 255, 255) 0 0 0 4px` | Boutons circulaires superposés sur des photographies — un anneau blanc de 4px sépare proprement le bouton des arrière-plans d'images colorés |

Philosophie des ombres : Airbnb utilise des **ombres en couches empilées** plutôt qu'une seule ombre portée. L'ombre à trois couches du panneau de réservation se lit comme une seule élévation cohérente mais est en réalité trois ombres séparées à différentes valeurs d'opacité/flou — créant un anti-crénelage subtil au périmètre de l'ombre qui semble premium sans être lourd.

### Profondeur décorative
- **La photographie comme profondeur** : le système s'appuie fortement sur la photographie plein cadre pour créer de la profondeur visuelle ; les ombres et les dégradés sont utilisés avec parcimonie pour que les photographies fassent le gros du travail
- **Médaillon de couronne de laurier** : la récompense Guest Favorite utilise deux illustrations SVG de laurier qui donnent au numéro de note autrement plat une présence cérémonielle, semblable à un trophée
- **Icônes de catégorie en rendu 3D** : les icônes Logements/Expériences/Services ont leur propre éclairage interne doux et des ombres portées subtiles intégrées dans l'œuvre — le seul endroit où la marque autorise l'illustration "dimensionnelle"

## 7. Ce qu'il faut faire et ne pas faire

### À faire
- Réserver Rausch `#ff385c` pour les actions principales et l'indicateur d'onglet actif — ne jamais le diluer avec des utilisations décoratives.
- Laisser respirer la photographie — recadrages 4:3 avec des coins arrondis 14–20px, pas de texte superposé, pas de voiles de dégradé.
- Utiliser Ink Black `#222222` pour chaque couche de texte sous Rausch — c'est le quasi-noir du système, jamais le vrai `#000000`.
- Associer les icônes illustrées 3D du sélecteur de catégorie à trois onglets à une typographie plate — ne pas mélanger les styles d'illustration sur une même surface.
- Empiler trois ombres à faible opacité (~2%, 4%, 10%) pour créer l'élévation signature du panneau de réservation.
- Utiliser des bordures Hairline Gray `#dddddd` 1px pour chaque séparateur carte-à-carte et rangée-à-rangée.
- Traiter le panneau de réservation comme sticky sur ordinateur, se repliant en une barre de réservation ancrée en bas sur mobile.
- Utiliser un espacement de 4–8px dans les groupes de métadonnées et de 24px entre les cartes — la densité d'information est intentionnelle.

### À ne pas faire
- Ne pas introduire de couleurs d'accent secondaires en dehors de la palette de niveaux de produits Rausch / Plus Magenta / Luxe Purple.
- Ne pas placer de texte dans les photographies — les légendes se trouvent toujours sous l'image, jamais superposées.
- Ne pas utiliser de labels en majuscules sauf pour le rôle d'exposant en 8px.
- Ne pas arrondir les boutons icônes à autre chose que 50% — le circulaire est la géométrie signature du système.
- Ne pas ajouter d'ombres portées aux cartes d'annonce — elles se trouvent sur une toile blanche sans élévation.
- Ne pas utiliser d'arrière-plans de dégradé — le seul dégradé dans le système est un passage étroit Rausch → magenta sur le logotype.
- Ne pas utiliser la graisse 400-regular — la graisse de corps d'Airbnb Cereal est 500.
- Ne pas remplacer Airbnb Cereal VF par une police d'affichage différente — le système est intentionnellement à famille unique.

## 8. Comportement responsive

### Points de rupture

Airbnb déclare ~60 points de rupture (artefact de conception provenant de leur bibliothèque de composants), mais les changements de mise en page significatifs se produisent à un ensemble beaucoup plus restreint :

| Nom | Largeur | Changements clés |
|-----|---------|-----------------|
| Ultra-large | ≥1760px | Grille d'annonces à 6 colonnes, largeur max de contenu 1760–1920px |
| Ordinateur XL | 1440–1759px | Grille à 5 colonnes, nav entière visible, panneau de réservation sticky au rail droit |
| Ordinateur | 1128–1439px | Grille à 4 colonnes, panneau de réservation sticky persiste |
| Portable | 1024–1127px | Grille à 3–4 colonnes, nav de catégorie reste horizontale |
| Tablette | 800–1023px | Grille à 3 colonnes, la recherche globale peut se replier en une pilule sur une seule rangée |
| Petite tablette | 550–799px | Grille à 2 colonnes, le panneau de réservation tombe en bloc en ligne pleine largeur |
| Mobile | 375–549px | Mise en page empilée à 1 colonne, la barre d'onglets fixe en bas apparaît (Explorer / Listes de souhaits / Se connecter) |
| Petit mobile | <375px | Le rembourrage de bord se resserre à 16px ; les icônes du sélecteur de catégorie rétrécissent à ~28px |

### Cibles tactiles
Tous les éléments interactifs satisfont ou dépassent 44×44px. La famille de boutons icônes circulaires est spécifiquement dimensionnée à 32–44px avec 8–12px de rembourrage étendu de zone de frappe. Le bouton principal Rausch Réserver fait ~48px de hauteur. La zone de frappe du sélecteur de catégorie à trois onglets est le rectangle complet étiquette-plus-icône (généralement ~64×80px par onglet).

### Stratégie de repli
- **Nav** : La nav supérieure conserve le logotype Airbnb + le sélecteur à trois onglets sur tablette et au-dessus ; sur mobile, le sélecteur glisse juste sous la pilule de recherche, et les contrôles globe/avatar se déplacent vers une barre d'onglets ancrée en bas.
- **Barre de recherche** : Pilule à trois segments (Où / Quand / Qui) avec un bouton de soumission circulaire Rausch sur ordinateur ; se replie en une pilule "Commencer votre recherche" sur une seule rangée sur mobile, dont le toucher ouvre une feuille de recherche plein écran.
- **Panneau de réservation** : Rail droit sticky à ≥1128px ; en ligne dans la colonne de contenu principal entre 800–1127px ; pilule "Réserver" fixe en bas à <800px.
- **Grille d'annonces** : Reflow 6 → 5 → 4 → 3 → 2 → 1 colonnes selon les points de rupture.
- **Grille d'images de page de détail** : Mise en page à cinq images (1 grande + 4 petites) sur ordinateur ; devient un carrousel plein cadre glissable sur mobile avec des indicateurs de points de page.
- **Pied de page** : La mise en page à 3 colonnes se replie en une seule colonne empilée à <800px.

### Comportement des images
- `loading="lazy"` universel, avec des aperçus de substitution flous paramétrés `im_w=` servis en premier
- Les images responsive utilisent le CDN `muscache.com` d'Airbnb avec le paramètre de requête `im_w` pour la livraison basée sur la largeur (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Pas de recadrages directionnels d'art — la même image est agrandie/réduite selon les points de rupture
- Les carrousels ajustent automatiquement la hauteur des photos pour maintenir un ratio 4:3 cohérent quelle que soit l'orientation de la source

## 9. Guide de prompts pour agents

### Référence rapide des couleurs
- CTA principal : "Rausch (#ff385c)"
- Arrière-plan de page : "Canvas White (#ffffff)"
- Sous-surface : "Soft Cloud (#f7f7f7)"
- Texte de titre / corps : "Ink Black (#222222)"
- Texte secondaire : "Ash Gray (#6a6a6a)"
- Bordure / séparateur : "Hairline Gray (#dddddd)"
- Erreur : "Error Red (#c13515)"
- Lien info : "Info Blue (#428bff)"
- Accent de niveau Luxe : "Luxe Purple (#460479)"
- Accent de niveau Plus : "Plus Magenta (#92174d)"

### Exemples de prompts de composants
- "Créer un bouton principal Réserver : arrière-plan Rausch (#ff385c), étiquette blanche Airbnb Cereal 500 en 16px, rembourrage 14px × 24px, rayon de bordure 8px, sans ombre. En actif/pressé ajouter `transform: scale(0.92)` avec un anneau de focus Ink Black de 2px (`0 0 0 2px #222222`)."
- "Construire une carte d'annonce avec une photographie plein cadre 4:3 à rayon de bordure 14px, sans ombre de conteneur ; sous l'image empiler trois rangées de texte avec des espaces de 4px : nom de ville en 16px 600 Ink Black, type de location en 14px 500 Ash Gray (#6a6a6a), et fourchette de prix en 16px 500 Ink Black avec un suffixe `par nuit` en 14px."
- "Concevoir un panneau de réservation sticky : arrière-plan blanc, rayon de bordure 14px, bordure Hairline Gray (#dddddd) 1px, ombre d'élévation à 3 couches (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), rembourrage 24px, largeur 370px, ancré à 120px sous le haut de la fenêtre sur ordinateur. Contenu : titre de prix, sélecteur de dates, menu déroulant des voyageurs, CTA principal Rausch, et une clause de non-responsabilité Ash Gray 12px `Vous ne serez pas débité maintenant`."
- "Créer un sélecteur de catégorie à trois onglets : trois onglets de largeur égale étiquetés Logements, Expériences, Services ; chaque onglet a une icône illustrée en rendu 3D (~48px de hauteur) (maison, montgolfière, cloche) au-dessus d'une étiquette 16px 500 Ink Black ; l'onglet actif obtient un soulignement Ink Black de 2px ; ajouter une petite pilule 12px 700 blanche `NOUVEAU` sur fond bleu marine foncé en haut à droite des icônes Expériences et Services."
- "Rendre le médaillon de récompense Guest Favorite : un numéro de note centré en 52px 700 Ink Black, flanqué à gauche et à droite par des couronnes de laurier SVG dessinées à la main à ~48px de hauteur ; en dessous, une étiquette 12px 700 majuscules `GUEST FAVORITE` avec un tracking de 0,32px ; sous-étiquette en 14px 500 Ash Gray ; bloc pleine largeur se trouvant directement sur la toile blanche sans bordure de conteneur."

### Guide d'itération
Lors du raffinement des écrans existants générés avec ce système de design :
1. Se concentrer sur UN composant à la fois.
2. Référencer les noms de couleurs spécifiques et les codes hexadécimaux de ce document (ex. : "Ink Black #222222", pas "gris foncé").
3. Utiliser des descriptions en langage naturel à côté des mesures ("élévation subtile à trois couches" plutôt qu'une longue chaîne d'ombres).
4. Décrire le "ressenti" souhaité ("style magazine, photographie en premier" vs "utilitaire dense").
5. Toujours utiliser par défaut Airbnb Cereal VF 500 pour le corps et 600–700 pour l'accentuation — jamais 400.
6. Garder le rose Rausch rare — si plus d'un élément de couleur Rausch apparaît par fenêtre, envisager si l'un devrait être neutralisé.

### Lacunes connues
- **Cartes de la grille d'annonces de la page d'accueil** : la grille principale de cartes de propriété (la surface visuelle principale d'airbnb.com) n'a pas été entièrement capturée dans les captures d'écran de la page d'accueil extraites — le contenu ne s'est chargé que partiellement. Les spécifications des cartes d'annonce ci-dessus sont déduites de la structure de la grille d'inspiration et des conventions plus larges d'Airbnb ; confirmez les ratios d'aspect exacts et la hiérarchie des métadonnées sur le site en direct avant utilisation en production.
- **Icônes de catégorie Expériences** : les icônes illustrées 3D pour Logements / Expériences / Services sont servies comme des ressources raster ; leurs spécifications exactes de fichiers source (SVG vs PNG, dimensions en pixels rendus) ne sont pas documentées ici.
- **Timings d'animation et de transition** : non capturés — portée d'extraction statique.
- **Mode sombre** : Airbnb ne propose pas de mode sombre natif dans les surfaces de produits extraites ; ce document décrit le thème en mode clair unique uniquement.
