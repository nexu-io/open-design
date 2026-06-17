# Système de design inspiré de Cohere

> Catégorie : IA & LLM
> Plateforme d'IA d'entreprise. Dégradés vibrants, esthétique tableau de bord riche en données.

## 1. Thème visuel et atmosphère

L'interface de Cohere est un poste de commande d'entreprise soigné — confiant, épuré, et conçu pour donner à l'IA l'image d'une infrastructure sérieuse plutôt que d'un jouet grand public. L'expérience repose sur un canevas blanc lumineux où le contenu est organisé en cartes généreusement arrondies (rayon de 22px) qui créent un langage de containment organique, semblable à des nuages. Ce site s'adresse aux DSI et aux architectes d'entreprise : professionnel sans être froid, sophistiqué sans être intimidant.

Le langage de design crée un pont entre deux univers grâce à un système à double police : CohereText, un serif d'affichage personnalisé au crénage serré, confère aux titres la gravité d'un manifeste technologique, tandis que Unica77 Cohere Web gère tous les textes de corps et d'interface avec une précision géométrique suisse. Ce duo serif/sans crée une personnalité d'« autorité confiante rencontrant la clarté de l'ingénierie », qui reflète parfaitement une plateforme d'IA d'entreprise.

La couleur est utilisée avec une retenue extrême — l'interface est presque entièrement en noir et blanc avec des bordures gris froid (`#d9d9dd`, `#e5e7eb`). Le violet-mauve n'apparaît que dans les bandes hero photographiques, les sections en dégradé et le bleu interactif (`#1863dc`) qui signale les états de survol et de focus. Cette retenue chromatique signifie que lorsque la couleur apparaît EFFECTIVEMENT — dans les captures d'écran produit, la photographie d'entreprise et la section violet foncé — elle porte un poids visuel maximal.

**Caractéristiques clés :**
- Canevas blanc lumineux avec des bordures de containment gris froid
- Rayon de bordure signature de 22px — l'arrondi distinctif de la « carte Cohere »
- Double police personnalisée : CohereText (serif d'affichage) + Unica77 (sans-serif de corps)
- Retenue chromatique de niveau entreprise : noir, blanc, gris froids, accent bleu-violet minimal
- Sections hero violet foncé / mauve créant un contraste dramatique
- Boutons fantôme / transparents qui passent au bleu au survol
- Photographie d'entreprise montrant des applications réelles et diversifiées
- CohereMono pour le code et les libellés techniques avec transformations en majuscules

## 2. Palette de couleurs et rôles

### Primaires
- **Cohere Black** (`#000000`) : Texte de titre principal et éléments à emphase maximale.
- **Near Black** (`#212121`) : Couleur de lien de corps standard — légèrement plus douce que le noir pur.
- **Deep Dark** (`#17171c`) : Un quasi-noir teinté de bleu pour la navigation et le texte des sections sombres.

### Secondaires et accentuation
- **Interaction Blue** (`#1863dc`) : L'accent interactif principal — apparaît au survol des boutons, aux états de focus et sur les liens actifs. La seule couleur d'action chromatique.
- **Ring Blue** (`#4c6ee6` à 50 %) : Couleur de ring Tailwind pour les indicateurs de focus clavier.
- **Focus Purple** (`#9b60aa`) : Couleur de bordure de focus des champs de saisie — un violet atténué.

### Surfaces et arrière-plans
- **Pure White** (`#ffffff`) : L'arrière-plan de page principal et la surface des cartes.
- **Snow** (`#fafafa`) : Surfaces légèrement surélevées et arrière-plans de sections claires.
- **Lightest Gray** (`#f2f2f2`) : Bordures de cartes et lignes de containment les plus subtiles.

### Neutres et texte
- **Muted Slate** (`#93939f`) : Liens de pied de page désaccentués et texte tertiaire — un gris à tonalité froide avec une légère teinte bleu-violet.
- **Border Cool** (`#d9d9dd`) : Bordures de sections et d'éléments de liste standard — un gris froid légèrement teinté de violet.
- **Border Light** (`#e5e7eb`) : Variante de bordure plus claire — le gray-200 standard de Tailwind.

### Système de dégradés
- **Bande hero violet-mauve** : Sections à dégradé violet foncé créant un contraste dramatique face au canevas blanc. Elles apparaissent comme des bandes pleine largeur accueillant des captures d'écran produit et des messages clés.
- **Dégradé de pied de page sombre** : La page effectue une transition à travers un violet foncé / charbon vers le pied de page noir, créant un effet « crépuscule ».

## 3. Règles typographiques

### Familles de polices
- **Affichage** : `CohereText`, avec replis : `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Corps / Interface** : `Unica77 Cohere Web`, avec replis : `Inter, Arial, ui-sans-serif, system-ui`
- **Code** : `CohereMono`, avec replis : `Arial, ui-sans-serif, system-ui`
- **Icônes** : `CohereIconDefault` (police d'icônes personnalisée)

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement | Notes |
|------|--------|--------|---------|-----------------|------------|-------|
| Affichage / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (serré) | -1.44px | Impact maximal, autorité serif |
| Affichage secondaire | CohereText | 60px (3.75rem) | 400 | 1.00 (serré) | -1.2px | Grands titres de section |
| Titre de section | Unica77 | 48px (3rem) | 400 | 1.20 (serré) | -0.48px | Titres de sections de fonctionnalités |
| Sous-titre | Unica77 | 32px (2rem) | 400 | 1.20 (serré) | -0.32px | Titres de cartes, noms de fonctionnalités |
| Titre de fonctionnalité | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Titres de sections plus petites |
| Corps grand | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Paragraphes d'introduction |
| Corps / Bouton | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Corps standard, texte de bouton |
| Bouton moyen | Unica77 | 14px (0.88rem) | 500 | 1.71 (détendu) | normal | Boutons plus petits, libellés accentués |
| Légende | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Métadonnées, descriptions |
| Libellé majuscule | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Libellés de sections en majuscules |
| Petit | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Texte le plus petit, liens de pied de page |
| Code micro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Minuscules libellés de code en majuscules |

### Principes
- **Serif pour la déclaration, sans pour l'utilité** : CohereText porte la voix de la marque à l'échelle d'affichage — ses terminaisons serif donnent aux titres l'autorité d'une recherche publiée. Unica77 gère tout ce qui est fonctionnel avec une neutralité géométrique suisse.
- **Crénage négatif à grande taille** : CohereText utilise de -1.2px à -1.44px d'espacement des lettres à 60–72px, créant des blocs de texte denses et percutants.
- **Graisse de corps unique** : Presque toute l'utilisation d'Unica77 est à la graisse 400. La graisse 500 n'apparaît que pour l'emphase sur les petits boutons. Le système repose sur la taille et l'espacement, non sur le contraste de graisse.
- **Libellés de code en majuscules** : CohereMono utilise les majuscules avec un espacement positif (0.16–0.28px) pour les balises techniques et les marqueurs de sections.

## 4. Styles des composants

### Boutons

**Fantôme / Transparent**
- Arrière-plan : transparent (`rgba(255, 255, 255, 0)`)
- Texte : Cohere Black (`#000000`)
- Aucune bordure visible
- Survol : le texte passe à Interaction Blue (`#1863dc`), opacité 0.8
- Focus : contour solide de 2px en Interaction Blue
- Le style de bouton principal — invisible tant qu'on n'interagit pas avec

**Solide sombre**
- Arrière-plan : sombre / noir
- Texte : Pure White
- Pour les CTA sur surfaces claires
- Forme pill ou rayon standard

**Contouré**
- Containment à base de bordure
- Utilisé pour les actions secondaires

### Cartes et conteneurs
- Arrière-plan : Pure White (`#ffffff`)
- Bordure : fin trait plein Lightest Gray (`1px solid #f2f2f2`) pour les cartes subtiles ; Cool Border (`#d9d9dd`) pour les cartes accentuées
- Rayon : **22px** — le rayon signature Cohere pour les cartes principales, les images et les conteneurs de dialogue. Aussi 4px, 8px, 16px, 20px pour les éléments plus petits
- Ombre : minimale — Cohere s'appuie sur la couleur d'arrière-plan et les bordures plutôt que sur les ombres
- Spécial : rayon `0px 0px 22px 22px` (arrondi uniquement en bas) pour les conteneurs de sections
- Dialogue : rayon de 8px pour les boîtes modales / de dialogue

### Champs de saisie et formulaires
- Texte : blanc sur saisie sombre, noir sur saisie claire
- Bordure de focus : Focus Purple (`#9b60aa`) avec `1px solid`
- Ombre de focus : ring rouge (`rgb(179, 0, 0) 0px 0px 0px 2px`) — probablement pour l'indication d'état d'erreur
- Contour de focus : Interaction Blue solide 2px

### Navigation
- Nav horizontale épurée sur fond blanc ou sombre
- Logo : wordmark Cohere (SVG personnalisé)
- Liens : texte sombre à 16px Unica77
- CTA : bouton solide sombre
- Mobile : réduction en hamburger

### Traitement des images
- Photographie d'entreprise avec des sujets et environnements diversifiés
- Photographie hero teintée de violet pour les sections dramatiques
- Captures d'écran de l'interface produit sur surfaces sombres
- Images avec rayon de 22px correspondant au système de cartes
- Sections à dégradé violet pleine largeur

### Composants distinctifs

**Système de cartes à 22px**
- Le rayon de bordure de 22px est la signature visuelle de Cohere
- Toutes les cartes, images et conteneurs principaux utilisent ce rayon
- Crée une douceur organique, semblable à des nuages, distinctive par rapport aux 8–12px typiques

**Barre de confiance entreprise**
- Logos d'entreprises affichés en bandeau horizontal
- Démontre l'adoption par les entreprises
- Traitement des logos épuré et monochrome

**Bandes hero violettes**
- Sections violet foncé pleine largeur accueillant des présentations produit
- Créent des ruptures visuelles dramatiques dans le flux de la page blanche
- Les captures d'écran produit flottent dans l'environnement violet

**Balises de code en majuscules**
- CohereMono en majuscules avec espacement des lettres
- Utilisées comme marqueurs de sections et libellés de catégorisation
- Crée une hiérarchie d'information technique et structurée

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px
- Échelle : 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Le rembourrage des boutons varie selon la variante
- Rembourrage interne des cartes : environ 24–32px
- Espacement vertical des sections : généreux (56–60px entre les sections)

### Grille et conteneur
- Largeur maximale du conteneur : jusqu'à 2560px (très large) avec mise à l'échelle responsive
- Hero : centré avec une typographie dramatique
- Sections de fonctionnalités : grilles de cartes multi-colonnes
- Sections entreprise : bandes violettes pleine largeur
- 26 points de rupture détectés — système responsive extrêmement granulaire

### Philosophie des espaces blancs
- **Clarté entreprise** : Chaque section présente une proposition claire avec de l'espace autour.
- **La photographie comme hero** : Les grandes sections photographiques apportent de l'intérêt visuel sans nécessiter d'éléments de design décoratifs.
- **Regroupement en cartes** : Le contenu lié est regroupé dans des cartes arrondies à 22px, créant des clusters d'information naturels.

### Échelle des rayons de bordure
- Aigu (4px) : Éléments de navigation, petites balises, pagination
- Confortable (8px) : Boîtes de dialogue, conteneurs secondaires, petites cartes
- Généreux (16px) : Conteneurs mis en avant, cartes moyennes
- Grand (20px) : Grandes cartes de fonctionnalités
- Signature (22px) : Cartes principales, images hero, conteneurs principaux — LE rayon Cohere
- Pill (9999px) : Boutons, balises, indicateurs de statut

## 6. Profondeur et élévation

| Niveau | Traitement | Utilisation |
|--------|-----------|-------------|
| Plat (Niveau 0) | Pas d'ombre, pas de bordure | Arrière-plan de page, blocs de texte |
| Contouré (Niveau 1) | `1px solid #f2f2f2` ou `#d9d9dd` | Cartes standard, séparateurs de listes |
| Bande violette (Niveau 2) | Arrière-plan violet foncé pleine largeur | Sections hero, vitrines de fonctionnalités |

**Philosophie des ombres** : Cohere est pratiquement sans ombre. La profondeur est exprimée par le **contraste de couleur d'arrière-plan** (cartes blanches sur bandes violettes, surface blanche sur snow), le **containment par bordures** (bordures gris froid) et l'**alternance dramatique sections claires-sombres**. Lorsque les éléments ont besoin d'élévation, ils l'obtiennent en étant blanc-sur-sombre plutôt que par projection d'ombres.

## 7. À faire et à ne pas faire

### À faire
- Utiliser un rayon de bordure de 22px sur toutes les cartes et conteneurs principaux — c'est la signature visuelle
- Utiliser CohereText pour les titres d'affichage (72px, 60px) avec un crénage négatif
- Utiliser Unica77 pour tout le texte de corps et d'interface à la graisse 400
- Conserver la palette en noir et blanc avec des bordures gris froid
- Utiliser Interaction Blue (#1863dc) uniquement pour les états interactifs de survol / focus
- Utiliser des sections violet foncé pour les ruptures visuelles dramatiques et les présentations produit
- Appliquer majuscules + espacement des lettres sur CohereMono pour les libellés de sections
- Maintenir une photographie adaptée à l'entreprise avec des sujets diversifiés

### À ne pas faire
- Ne pas utiliser un rayon de bordure autre que 22px sur les cartes principales — le rayon signature est important
- Ne pas introduire de couleurs chaudes — la palette est strictement à tonalité froide
- Ne pas utiliser d'ombres lourdes — la profondeur vient du contraste de couleurs et des bordures
- Ne pas utiliser une graisse forte (700+) sur le texte de corps — la plage 400–500 est la référence
- Ne pas sauter la hiérarchie serif/sans — CohereText pour les titres, Unica77 pour le corps
- Ne pas utiliser le violet comme couleur de surface pour les cartes — le violet est réservé aux sections pleine largeur
- Ne pas réduire l'espacement des sections en dessous de 40px — les mises en page entreprise ont besoin d'espace
- Ne pas utiliser de décoration sur les boutons par défaut — le fantôme/transparent est l'état de base

## 8. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|-----|---------|-----------------|
| Petit mobile | <425px | Mise en page compacte, espacement minimal |
| Mobile | 425–640px | Colonne unique, cartes empilées |
| Grand mobile | 640–768px | Ajustements d'espacement mineurs |
| Tablette | 768–1024px | Les grilles à 2 colonnes commencent |
| Bureau | 1024–1440px | Mise en page multi-colonnes complète |
| Grand bureau | 1440–2560px | Largeur de conteneur maximale |

*26 points de rupture détectés — l'un des sites les plus granulairement responsives du jeu de données.*

### Cibles tactiles
- Boutons dimensionnés de manière adéquate pour l'interaction tactile
- Liens de navigation avec un espacement confortable
- Surfaces de cartes comme cibles tactiles

### Stratégie de réduction
- **Navigation** : Nav complète réduite en hamburger
- **Grilles de fonctionnalités** : Multi-colonnes → 2 colonnes → colonne unique
- **Texte hero** : 72px → 48px → 32px mise à l'échelle progressive
- **Sections violettes** : Maintien pleine largeur, le contenu s'empile
- **Grilles de cartes** : 3 → 2 → 1 colonne

### Comportement des images
- La photographie se met à l'échelle proportionnellement dans les conteneurs à rayon de 22px
- Les captures d'écran produit maintiennent le ratio d'aspect
- Les sections violettes mettent l'arrière-plan à l'échelle proportionnellement

## 9. Guide des prompts pour agents

### Référence rapide des couleurs
- Texte principal : « Cohere Black (#000000) »
- Arrière-plan de page : « Pure White (#ffffff) »
- Texte secondaire : « Near Black (#212121) »
- Accent de survol : « Interaction Blue (#1863dc) »
- Texte atténué : « Muted Slate (#93939f) »
- Bordures de cartes : « Lightest Gray (#f2f2f2) »
- Bordures de sections : « Border Cool (#d9d9dd) »

### Exemples de prompts de composants
- « Crée une section hero sur Pure White (#ffffff) avec CohereText à 72px graisse 400, line-height 1.0, letter-spacing -1.44px. Texte Cohere Black. Sous-titre en Unica77 à 18px graisse 400, line-height 1.4. »
- « Conçois une carte de fonctionnalité avec un rayon de bordure de 22px, une bordure 1px solid Lightest Gray (#f2f2f2) sur blanc. Titre en Unica77 à 32px, letter-spacing -0.32px. Corps en Unica77 à 16px, Muted Slate (#93939f). »
- « Construis un bouton fantôme : arrière-plan transparent, texte Cohere Black en Unica77 à 16px. Au survol, le texte passe à Interaction Blue (#1863dc) avec une opacité de 0.8. Focus : contour solide Interaction Blue de 2px. »
- « Crée une section pleine largeur violet foncé avec du texte blanc. CohereText à 60px pour le titre. La capture d'écran produit flotte à l'intérieur avec un rayon de bordure de 22px. »
- « Conçois un libellé de section en CohereMono à 14px, majuscules, letter-spacing 0.28px. Texte Muted Slate (#93939f). »

### Guide d'itération
1. Se concentrer sur UN composant à la fois
2. Toujours utiliser un rayon de 22px pour les cartes principales — « l'arrondi de carte Cohere »
3. Spécifier la police — CohereText pour les titres, Unica77 pour le corps, CohereMono pour les libellés
4. Les éléments interactifs utilisent Interaction Blue (#1863dc) uniquement au survol
5. Conserver les surfaces en blanc avec des bordures gris froid — pas de tonalités chaudes
6. Le violet est pour les sections pleine largeur, jamais pour les arrière-plans de cartes
