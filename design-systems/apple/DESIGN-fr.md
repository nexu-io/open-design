# Système de design inspiré d'Apple

> Category: Médias & Grand public
> Électronique grand public. Espaces blancs premium, SF Pro, imagerie cinématographique.

## 1. Thème visuel & atmosphère

Le langage web d'Apple est un système éditorial de précision qui alterne entre un calme proche de la galerie et des blocs d'information à densité commerciale. Le ton visuel reste sobre : de larges toiles neutres, un chrome discret et une imagerie produit à laquelle est confiée presque tout le poids expressif. L'interface est conçue pour s'effacer afin que le matériel, les matières et les options de finition deviennent le premier plan narratif.

À travers les cinq pages analysées, le rythme est cohérent sans être monolithique. Les surfaces marketing (page d'accueil et Environnement) recourent à un chapitrage cinématographique noir-et-lumière, tandis que les surfaces commerciales (parcours Store et Shop) introduisent un espacement plus serré, davantage de contrôles utilitaires et des piles de cartes plus denses sans rompre la grammaire de marque fondamentale. Le résultat est un seul système à deux régimes : mode vitrine et mode transaction.

La typographie est le stabilisateur. SF Pro Display porte la hiérarchie hero et merchandising avec des interlignes compacts et un crénage maîtrisé, tandis que SF Pro Text gère les métadonnées produit, la navigation, les filtres et l'UI de sélection dense. La typographie reste discrète, mais l'amplitude d'échelle est suffisamment large pour soutenir aussi bien le message hero de type affiche que les micro-libellés utilitaires.

**Key Characteristics:**
- Rythme binaire des sections : scènes noires profondes (`#000000`) alternant avec des champs neutres pâles (`#f5f5f7`)
- Une seule famille d'accent bleu pour la sémantique d'action et de lien (`#0071e3`, `#0066cc`, `#2997ff`)
- Deux modes de fonctionnement dans un même système : modules de vitrine cinématographique et configurateurs commerciaux denses
- Forte dépendance à l'imagerie et aux finitions de matières ; le chrome d'UI reste visuellement mince
- Métriques de titre serrées (SF Pro Display, semibold) associées à une typographie de corps/lien compacte (SF Pro Text)
- Géométrie en pilule et en capsule comme langage d'action signature (`18px` à `980px` et contrôles circulaires)
- Profondeur employée avec parcimonie ; le contraste et la séparation des surfaces font l'essentiel du travail de superposition
- Rythme multi-pages par blocs de couleur : chapitres hero noirs -> champs merchandising neutres pâles -> surfaces commerciales blanches utilitaires -> micro-surfaces sombres pour les contrôles

## 2. Palette de couleurs & rôles

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primaires
- **Noir absolu** (`#000000`) : Toiles hero immersives, chapitres produit à forte dramaturgie, ancrages d'UI profonds.
- **Gris Apple pâle** (`#f5f5f7`) : Surface claire principale pour les bandes de fonctionnalités, les blocs de comparaison et les transitions éditoriales.
- **Encre quasi-noire** (`#1d1d1f`) : Couleur de texte principal et de contrôle à remplissage sombre sur les toiles claires.

### Secondaires & accent
- **Bleu d'action Apple** (`#0071e3`) : Remplissage d'action principal et accent de marque signalant le focus.
- **Bleu de lien de corps** (`#0066cc`) : Couleur de lien en ligne optimisée pour la lisibilité des textes longs.
- **Bleu de lien à haute luminance** (`#2997ff`) : Traitement de lien lumineux sur les scènes plus sombres lorsqu'un contraste plus marqué est requis.

### Surface & arrière-plan
- **Toile blanc pur** (`#ffffff`) : Arrière-plans de listes commerce/produit et sections transactionnelles denses.
- **Surface graphite A** (`#272729`) : Couche de contexte des cartes sombres et des contrôles multimédias.
- **Surface graphite B** (`#262629`) : Couche utilitaire sombre légèrement plus profonde pour les regroupements de contrôles.
- **Surface graphite C** (`#28282b`) : Surfaces sombres de support surélevées.
- **Surface graphite D** (`#2a2a2c`) : Le palier surélevé le plus sombre, utilisé pour la séparation dans les scènes sombres plus riches.

### Neutres & texte
- **Gris neutre secondaire** (`#6e6e73`) : Texte secondaire de corps, descriptions d'aide, métadonnées tertiaires.
- **Gris de bordure doux** (`#d2d2d7`) : Séparateurs, contours subtils et confinement utilitaire atténué.
- **Gris de bordure intermédiaire** (`#86868b`) : Contours de champ plus marqués dans les contextes de configuration produit et de filtre.
- **Gris foncé utilitaire** (`#424245`) : Croisement texte/surface neutre-sombre dans les contextes store.

### Sémantique & accent
- **Signal de sélection/focus** (`#0071e3`) : Signal partagé de focus et d'état sélectionné à travers les contextes marketing et commerce.
- **Erreur/Avertissement/Succès** : Aucune palette sémantique distincte n'était visible de manière cohérente dans l'ensemble de surfaces extrait.

### Système de dégradés
- Les pages extraites sont très majoritairement pilotées par des surfaces pleines. La richesse visuelle vient de la photographie et du rendu des finitions plutôt que de dégradés d'UI persistants.

## 3. Règles typographiques

### Famille de police
- **Famille Display :** `SF Pro Display`, replis `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Famille Text :** `SF Pro Text`, replis `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Répartition d'usage :** La famille Display gère les titres hero/produit et les titres merchandising ; la famille Text gère la navigation, les contrôles, les libellés et le texte commerce dense.

### Hiérarchie
| Rôle | Taille | Graisse | Interligne | Espacement des lettres | Notes |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Échelle hero Environnement/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Moments hero de la page d'accueil |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Titres de chapitre majeurs |
| Product Heading | 40px | 600 | 1.10 | normal | Titres de section produit et campagne |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Accroches appareil et merchandising |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px à 0.352px | Sous-heros au niveau module |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Nommage au niveau tuile et texte clé |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | En-têtes de configurateur et de contenu groupé |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Liens promotionnels plus grands |
| Subhead | 19px | 600 | 1.21 | 0.228px | Introductions de section compactes |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Corps standard et descriptions commerce |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Libellés mis en avant et valeurs clés |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Boutons, libellés d'aide, texte de nav compact |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Mentions fines, micro-libellés |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Métadonnées denses et texte de support légal |

### Principes
- **Continuité entre types de page :** Le même ADN typographique couvre les lancements cinématographiques et les parcours d'achat produit, évitant une scission de marque entre marketing et commerce.
- **Compression à grande échelle :** Les paliers Display utilisent un interlignage serré et un crénage maîtrisé pour donner une impression usinée et axée produit.
- **Densité lisible à profondeur commerce :** SF Pro Text équilibre compacité et rythme vertical suffisant pour les longues listes produit et les matrices d'options.
- **Échelle de graisses mesurée :** 600 est la graisse d'emphase dominante ; 700 apparaît de manière sélective ; 300 est utilisé avec parcimonie pour le contraste dans les lignes plus grandes.

### Note sur les substituts de police
- Substituts librement disponibles les plus proches : `Inter` pour une implémentation riche en texte et des métriques de type `SF Pro Display-like` approchées avec `Inter Tight` pour les titres.
- Lors d'une substitution, augmentez légèrement l'interligne (+0.02 à +0.06) sur les tailles de corps et réduisez l'intensité du crénage négatif pour préserver la lisibilité.

## 4. Styles des composants

### Boutons
- **Action à remplissage primaire :** fond `#0071e3`, texte `#ffffff`, rayon de 8px, padding horizontal compact (couramment 8px 15px). Utilisé pour les actions décisives d'achat/progression.
- **Action à remplissage sombre :** fond `#1d1d1f`, texte `#ffffff`, rayon de 8px. Utilisé lorsque les surfaces claires nécessitent un primaire sobre à fort contraste.
- **Famille d'actions en pilule/capsule :** grandes actions en capsule à rayons de `18px`-`56px` et liens en pilule extrême à `980px`. Établit la silhouette d'appel à l'action douce mais précise d'Apple.
- **Coques de filtre/bouton utilitaires :** coques claires (`#fafafc` ou blanc translucide) avec des bordures grises subtiles (`#d2d2d7` / `#86868b`) pour les contextes de configuration denses.
- **Comportement enfoncé :** les contrôles actifs réduisent couramment l'échelle ou décalent légèrement le remplissage pour signaler une confirmation d'appui physique.

### Cartes & conteneurs
- **Cartes éditoriales/produit :** cartes claires sur des champs `#f5f5f7` ou blancs, avec un cadrage minimal et une composition axée image.
- **Cartes utilitaires sombres :** paliers graphite (`#272729` à `#2a2a2c`) utilisés pour les superpositions, les contrôles multimédias et les modules à contexte sombre.
- **Panneaux de configurateur :** conteneurs arrondis (souvent 12px-18px) avec une définition de bordure claire mais sobre.
- **Modules carrousel/spotlight :** coques arrondies plus grandes (`28px`-`36px`) pour les couloirs de contenu mis en avant.

### Champs & formulaires
- **Champs de saisie commerce :** arrière-plans translucides ou blancs, texte sombre (`#1d1d1f`), confinement piloté par la bordure (`#86868b`).
- **Contrôles de sélection :** une géométrie de contrôle de type circulaire/interrupteur apparaît fréquemment dans les interfaces de sélection produit.
- **Stratégie de densité :** les champs de formulaire restent visuellement discrets pour laisser dominer l'imagerie d'appareil et la hiérarchie de prix.

### Navigation
- **Nav marketing globale :** barre sombre translucide compacte avec des liens de petite taille et une iconographie sobre.
- **Couches de nav Store/sous-boutique :** barres utilitaires supplémentaires, puces et contrôles segmentés pour affiner par catégorie et produit.
- **Hiérarchie des liens :** les bleus de lien restent le signal interactif principal tandis que le texte neutre soutient les ensembles de navigation denses.

### Traitement des images
- **Photographie axée objet :** le matériel et les accessoires sont mis au premier plan sur des surfaces pleines maîtrisées.
- **Rendu de finition haute fidélité :** les détails réfléchissants/de matière sont centraux dans la persuasion visuelle.
- **Cadrage mixte :** les scènes hero pleine page coexistent avec des cartes commerce arrondies et des vignettes merchandising serrées.

### Autres composants distinctifs
- **Matrice de configurateur produit :** piles d'options et sélecteurs combinant puces, contrôles de type radio et blocs contextuels de prix/résumé.
- **Points/flèches de contrôle de carrousel :** vocabulaire de contrôle circulaire dans des superpositions atténuées pour la progression de la galerie.
- **Panneaux narratifs Environnement :** chapitres narratifs qui mêlent typographie éditoriale et visuels produit/environnement cinématographiques.

## 5. Principes de mise en page

### Système d'espacement
- L'unité de base est effectivement `8px`, mais le système prend en charge des micro-paliers denses pour un alignement de précision.
- Valeurs d'espacement fréquemment réutilisées à travers les pages : `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Constantes de rythme universelles visibles dans les parcours marketing comme commerce : échafaudage par unité de `8px` avec des intervalles utilitaires de `14-20px` pour le padding des composants et l'espacement des listes.

### Grille & conteneur
- **Pages vitrine :** grandes colonnes centrales avec une large respiration horizontale et des chapitres de couleur pleine largeur.
- **Pages commerce :** grilles de produits et de contrôles multi-colonnes plus serrées avec un empilement modulaire fréquent.
- **Comportement du conteneur :** noyau lisible contraint avec de généreuses marges extérieures aux largeurs desktop.

### Philosophie de l'espace blanc
- **Cadence des scènes :** les chapitres visuels majeurs utilisent une large respiration haut/bas.
- **Compaction de l'information au besoin :** les pages commerce compriment délibérément l'espacement pour exposer davantage d'informations actionnables par fenêtre d'affichage.
- **Séparation pilotée par le contraste :** les transitions de section reposent davantage sur les changements de surface que sur des séparateurs décoratifs.

### Échelle des rayons de bordure
- **5px :** liens/étiquettes utilitaires minuscules et petites coques mineures.
- **8px-12px :** contrôles standard et champs compacts.
- **16px-18px :** cartes, cadres de module et panneaux commerce.
- **28px-36px :** conteneurs de module et de spotlight plus grands.
- **56px / 100px / 980px :** capsules, grandes pilules et formes de CTA allongées signatures.
- **50% :** contrôles multimédias et de sélection circulaires.

## 6. Profondeur & élévation

| Niveau | Traitement | Usage |
|------|-----------|-----|
| Niveau 0 | Surfaces neutres plates (`#ffffff`, `#f5f5f7`, `#000000`) | Scènes narratives et produit principales |
| Niveau 1 | Confinement subtil par bordure (`#d2d2d7`, `#86868b`) | Filtres, champs de saisie, cartes utilitaires |
| Niveau 2 | Ombre douce (`rgba(0,0,0,0.08)` à `rgba(0,0,0,0.22)` lorsqu'elle est présente) | Cartes mises en avant et modules merchandising surélevés |
| Niveau 3 | Échelonnement de surface sombre (`#272729` -> `#2a2a2c`) | Superpositions, contrôles multimédias, grappes utilitaires sombres |
| Accessibilité | Signal de focus bleu (`#0071e3`) | Emphase clavier et sélection |

La profondeur est volontairement sobre. Apple privilégie le contraste tonal, l'échelonnement de surface et la hiérarchie compositionnelle plutôt que de lourdes piles d'ombres.

### Profondeur décorative
- La profondeur décorative est principalement créée par le réalisme photographique et le rendu des matières, et non par des effets d'UI synthétiques.
- Les superpositions translucides et les barres utilitaires de type verre apportent une légère stratification atmosphérique dans la navigation et les contrôles.

## 7. À faire et à éviter

### À faire
- Utilisez la triade neutre (`#000000`, `#f5f5f7`, `#ffffff`) comme fondation structurelle.
- Réservez les accents bleus à une véritable sémantique d'action et de navigation.
- Gardez la typographie serrée et délibérée, surtout aux échelles Display.
- Maintenez le langage géométrique capsule/cercle pour les contrôles et les actions clés.
- Laissez l'imagerie produit porter la dramaturgie visuelle ; gardez le chrome discret.
- Utilisez un confinement piloté par la bordure dans les contextes commerce denses plutôt qu'un ornement de carte lourd.
- Préservez une séparation claire entre les modules vitrine et les modules transactionnels tout en gardant les tokens fondamentaux partagés.

### À éviter
- N'introduisez pas de larges palettes d'accent secondaires qui rivalisent avec le bleu Apple.
- N'abusez pas des ombres, des effets de lueur ou des dégradés décoratifs dans le chrome d'UI fondamental.
- Ne mélangez pas des familles de police sans rapport et ne relâchez pas le crénage sans discernement.
- N'aplatissez pas tous les coins à un rayon unique ; Apple utilise des paliers de rayon intentionnels.
- Ne surchargez pas les modules commerce de bordures épaisses ou d'effets visuels tapageurs.
- Ne supprimez pas la cadence de contraste neutre entre les chapitres sombres et clairs.
- Ne traitez pas les parcours marketing et d'achat comme des systèmes de design distincts.

## 8. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Small Mobile | 374px et moins | Contrôles commerce resserrés, piles produit en une colonne |
| Mobile | 375px-640px | Modules en une colonne, rangées d'action compactes, sélecteurs condensés |
| Tablet | 641px-833px | Cartes élargies et transitions mixtes 1-2 colonnes |
| Tablet Wide | 834px-1023px | Merchandising multi-colonnes plus stable, blocs de texte plus grands |
| Desktop | 1024px-1240px | Mises en page commerce complètes et structures de comparaison produit |
| Desktop Wide | 1241px-1440px | Expansion du hero marketing et espacement de section plus large |
| Large Desktop | 1441px+ | Respiration de chapitre maximale et composition éditoriale large |

### Zones tactiles
- Les actions primaires et secondaires sont généralement présentées dans des géométries pilule/bouton adaptées au tap.
- Les contrôles multimédias et de sélection circulaires s'alignent sur une intention tactile minimale dans les contextes mobiles.
- L'UI commerce dense utilise des libellés compacts mais maintient des zones de contact claires via le padding de forme environnant.

### Stratégie de repliement
- La typographie du hero marketing se réduit en paliers discrets tout en préservant le contraste de hiérarchie.
- Les grilles produit et commerce passent du multi-colonnes à des cartes empilées avec une visibilité persistante des sélecteurs.
- La navigation utilitaire se comprime en regroupements de liens/contrôles plus simples tout en préservant les actions clés.
- Les grappes d'options/configuration deviennent séquencées verticalement pour garder le parcours d'achat linéaire sur les petits écrans.

### Comportement des images
- L'imagerie produit préserve le ratio et la centralité à travers les points de rupture.
- Les visuels hero restent dominants sur mobile, le texte étant repositionné autour de la priorité au média.
- Les vignettes commerce restent lisibles grâce à une logique de recadrage plus serrée et un empilement de cartes plus dense.
- Les modules axés image continuent d'ancrer le rythme à mesure que la densité de mise en page augmente.

## 9. Guide de prompt pour agent

### Référence rapide des couleurs
- Bleu d'action principal : **Bleu d'action Apple** (`#0071e3`)
- Bleu de lien en ligne : **Bleu de lien de corps** (`#0066cc`)
- Toile de chapitre sombre : **Noir absolu** (`#000000`)
- Toile de chapitre clair : **Gris Apple pâle** (`#f5f5f7`)
- Texte principal sur fond clair : **Encre quasi-noire** (`#1d1d1f`)
- Texte secondaire : **Gris neutre secondaire** (`#6e6e73`)
- Bordure commerce douce : **Gris de bordure doux** (`#d2d2d7`)
- Bordure commerce marquée : **Gris de bordure intermédiaire** (`#86868b`)

### Exemples de prompts de composant
- « Concevoir un hero produit de style Apple sur une toile noire (`#000000`) avec un titre SF Pro Display semibold (48-56px), un texte de support concis et deux CTA en capsule utilisant `#0071e3` et `#1d1d1f`. »
- « Créer un panneau de configuration commerce sur blanc (`#ffffff`) avec des cartes arrondies de 18px, des champs à bordure `#86868b`, un corps SF Pro Text de 17px et des sélecteurs d'options compacts. »
- « Construire une grille de cartes merchandising alternant des surfaces `#f5f5f7` et blanches, avec des cartes axées image, des ombres sobres et des métadonnées SF Pro Text de 14-17px. »
- « Générer une grappe de contrôles de carrousel utilisant des boutons circulaires (rayon de 50%), des superpositions gris atténué et un retour d'état actif clair pour la navigation dans la galerie. »
- « Composer un rythme de page mixte marketing + commerce : chapitre vitrine sombre -> chapitre de fonctionnalité clair -> module de liste produit dense tout en réservant les accents bleus aux seules actions et liens. »

### Guide d'itération
1. Verrouillez d'abord la fondation neutre (`#000000`, `#f5f5f7`, `#ffffff`) avant de régler les accents.
2. Gardez les accents bleus rares et intentionnels ; si tout est bleu, la hiérarchie s'effondre.
3. Réglez la typographie dans cet ordre : échelle Display, lisibilité du corps, puis micro-libellés.
4. Faites correspondre le rayon à la classe de composant (champ, carte, capsule, cercle) plutôt qu'un arrondi unique pour tout.
5. Augmentez la densité progressivement lors du passage des sections vitrine aux sections commerce.
6. Vérifiez que l'imagerie produit demeure la couche visuelle la plus forte après chaque révision.

### Lacunes connues
- Des couleurs d'état sémantiques distinctes (erreur/avertissement/succès) n'étaient pas visibles de manière cohérente dans l'ensemble de pages extrait.
- Certains micro-états d'interaction varient selon le module et ne sont pas représentés comme des tokens système universels.
- Quelques modules commerce exposent des surcharges typographiques spécifiques au contexte qui n'apparaissent pas sur les cinq pages.
