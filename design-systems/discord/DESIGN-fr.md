# Design System Inspired by Discord

> Category: Productivité & SaaS
> Plateforme de messagerie et de chat vocal. Blurple profond, surfaces prioritairement sombres, moments d'accent enjoués.

## 1. Visual Theme & Atmosphere

Le produit Discord est conçu pour les soirées, les raids et les sessions de chat vocal en groupe — l'ensemble de la surface est donc prioritairement sombre. Le canevas par défaut est le profond `Background Primary` (`#313338` thème clair, `#1e1f22` thème sombre), avec des colonnes de chat superposées sur des teintes légèrement plus claires ou plus foncées pour distinguer les canaux, les fils de discussion et les panneaux latéraux. Le **Blurple** signature (`#5865f2`) est réservé à la marque, aux CTA principaux, aux mentions et à l'affordance « vous » — utilisé avec parcimonie pour qu'il ressorte sur les neutres atténués.

La typographie utilise **gg sans** (le Whitney-replacement personnalisé de Discord) pour le corps du texte et l'interface, avec des formes géométriques arrondies qui paraissent accueillantes tout en restant lisibles aux petites tailles qu'exige un client de messagerie. Les titres augmentent progressivement ; les lignes de chat sont serrées (4–8px entre les groupes de messages) pour que des heures de défilement restent facilement parcourables.

Le langage des formes est arrondi sans être excessivement doux : rayons de 8px sur les cartes, 4px sur les champs de saisie, pilules complètes sur les badges de statut et les étiquettes. Les serveurs sont des avatars carrés arrondis de 48px qui se transforment en cercles au survol — un détail d'animation qui fait désormais partie de l'identité de la marque.

**Key Characteristics:**
- Surfaces prioritairement sombres : `#1e1f22` / `#2b2d31` / `#313338` (profondeur en 3 niveaux)
- Blurple `#5865f2` comme seul accent saturé dans la surface de chat
- gg sans (style Whitney) pour tous les textes — convivial, géométrique, neutre
- Avatars de serveur en carré arrondi (rayon 16px) qui se transforment en cercles au survol
- Espacement serré entre les lignes de chat, rembourrage généreux dans les panneaux latéraux
- Points de statut : vert en ligne, jaune inactif, rouge ne pas déranger, gris hors ligne
- Séparateurs de 1px alignés sur la grille de pixels, en blanc cassé à faible opacité

## 2. Color Palette & Roles

### Primary
- **Blurple** (`#5865f2`): Couleur principale de la marque, CTA principal, mise en évidence des mentions.
- **Blurple Hover** (`#4752c4`): Survol/actif pour le blurple.
- **Blurple Soft** (`#7289da`): Blurple hérité, accent secondaire dans le marketing.

### Surface (Dark Theme — default)
- **Background Tertiary** (`#1e1f22`): Rail de la liste des serveurs, arrière-plan le plus profond.
- **Background Secondary** (`#2b2d31`): Barre latérale des canaux, barre latérale des paramètres.
- **Background Primary** (`#313338`): Surface de chat, colonne des messages.
- **Background Floating** (`#111214`): Popovers flottants, infobulles, autocomplétion.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Superposition de survol sur les lignes.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Ligne active.

### Surface (Light Theme)
- **Light Bg Primary** (`#ffffff`): Surface de chat en thème clair.
- **Light Bg Secondary** (`#f2f3f5`): Barre latérale en thème clair.
- **Light Bg Tertiary** (`#e3e5e8`): Surface claire la plus profonde.

### Text
- **Header Primary** (`#f2f3f5`): En-têtes de canaux, titres de modales en thème sombre.
- **Header Secondary** (`#b5bac1`): En-têtes atténués.
- **Text Normal** (`#dbdee1`): Corps du texte en thème sombre — légèrement plus froid que le blanc pur.
- **Text Muted** (`#949ba4`): Horodatages, noms de serveurs, métadonnées secondaires.
- **Text Link** (`#00a8fc`): Hyperliens dans les messages — bleu ciel, distinct du blurple.
- **Channels Default** (`#80848e`): Nom du canal inactif dans la barre latérale.

### Status & Semantic
- **Status Online** (`#23a55a`): Point en ligne, états de succès.
- **Status Idle** (`#f0b232`): Point inactif, absent.
- **Status DND** (`#f23f43`): Ne pas déranger, sert également de rouge destructif.
- **Status Streaming** (`#593695`): Violet « En direct ».
- **Status Offline** (`#80848e`): Gris hors ligne.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Légère teinte blurple sur les lignes de @mention.

### Border & Divider
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Séparateur standard en thème sombre.
- **Border Subtle** (`#3f4147`): Séparateur solide pour les cartes.

## 3. Typography Rules

### Font Family
- **Body / UI / Headings**: `gg sans`, avec repli : `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (legacy / Whitney)**: `Whitney`, avec repli : `gg sans`
- **Code / Mono**: `"gg mono"`, avec repli : `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero marketing |
| Page Heading | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Titres paramètres/profil |
| Channel Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, en-tête de canal |
| Message Body | gg sans | 16px (1rem) | 400 | 1.375 | normal | Texte de chat standard |
| Username | gg sans | 16px (1rem) | 500 | 1.25 | normal | Auteur d'un message |
| Timestamp | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | « Aujourd'hui à 16:32 » |
| Sidebar Channel | gg sans | 16px (1rem) | 500 | 1.25 | normal | Lignes de la liste des canaux |
| Server Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | En-tête du serveur |
| Caption / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Texte de statut, balise modifiée |
| Code Inline | gg mono | 0.875em | 400 | inherit | normal | `code` en ligne |
| Code Block | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Bloc ```triple-backtick``` |

### Principles
- **Géométrie conviviale** : gg sans remplace Whitney avec des terminaisons arrondies sur a/g/s — la marque recherche la chaleur sans sacrifier la lisibilité.
- **Contraste par les graisses plutôt que par les couleurs** : la hiérarchie repose sur les paliers de graisse 400→500→600→700→800 ; la surface reste neutre.
- **Corps à 16px** : les messages de chat ne descendent pas en dessous de 16px. La densité vient de l'interligne (1.375), pas de la taille de police.

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#5865f2`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- Utilisation : CTA principaux, « Continuer », « Rejoindre le serveur »

**Secondary**
- Background: `#4e5058`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**Tertiary / Subtle (Link-style)**
- Background: transparent
- Text: `#dbdee1`
- Hover: texte souligné, pas de changement d'arrière-plan

**Danger**
- Background: `#da373c`
- Text: `#ffffff`
- Hover: `#a12d2f`

### Inputs
- Background: `#1e1f22`
- Text: `#dbdee1`
- Border: 1px solid `#1e1f22`
- Radius: 4px
- Padding: 10px 12px
- Focus: border `#5865f2`

### Server Avatars
- Size: 48×48px
- Radius: 16px (carré arrondi) par défaut ; passe à 50% au survol et à l'état actif.
- État actif : pilule blanche de 4px sur le bord gauche de la colonne d'icônes.

### Status Dots
- Size: 10×10px
- Border: 3px solid background-tertiary (crée l'effet d'« encoche »)
- Position: en bas à droite de l'avatar.

### Cards / Embeds
- Background: `#2b2d31` (sombre) ou `#f2f3f5` (clair)
- Bordure gauche: 4px solid couleur d'accent de l'embed.
- Radius: 4px
- Padding: 8px 16px

### Mention Pill
- Background: `rgba(88, 101, 242, 0.3)`
- Text: `#c9cdfb`
- Padding: 0 2px
- Radius: 3px

## 5. Spacing & Layout

- **Unité de base** : 4px. Échelle : 4, 8, 12, 16, 20, 24, 32, 40.
- **Rail des serveurs** : 72px de large, fixe.
- **Barre latérale des canaux** : 240px de large.
- **Liste des membres** : 240px de large sur ordinateur de bureau.
- **Colonne de chat** : fluide, minimum 380px.

## 6. Motion

- **Durée** : 200ms pour le survol ; 350ms pour la morphose avatar en cercle ; 80ms pour l'apparition de l'infobulle.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` pour la morphose de l'avatar (départ vif puis stabilisation).
- **Impulsion de notification** : 1.4s ease-in-out infinite sur l'indicateur de mention non lue.

## 7. Usage Guardrails

- Conserver ensemble l'enveloppe sombre, la densité compacte et la hiérarchie d'actions en blurple ; utiliser le blurple sur une mise en page marketing à fond clair rompt l'identité produit de Discord.
- Structurer les surfaces à forte navigation autour de rails, de barres latérales et de colonnes de chat plutôt que de cartes décoratives isolées.
- Utiliser le langage avatar carré arrondi et point de statut pour représenter des personnes, des serveurs ou une présence active.
