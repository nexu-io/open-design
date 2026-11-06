# Sistema de Diseño Inspirado en Nike

> Category: E-Commerce & Retail
> Retail deportivo. UI monocromática, tipografía uppercase monumental, fotografía a sangre.

## 1. Tema Visual y Atmósfera

Nike.com es una catedral cinética del retail — un sitio que canaliza la energía explosiva del deporte en una experiencia de compra digital. El diseño opera bajo un principio de simplicidad radical: reducir todo a negro, blanco y gris para que la fotografía deportiva y el color del producto dominen sin competencia. El resultado parece menos un sitio web y más una editorial deportiva maquetada con la precisión de una revista de lujo. Cada píxel de espacio está vendiendo producto o dirigiendo hacia el producto.

El "Podium CDS" (el Core Design System interno de Nike) establece una base agresivamente monocromática. La UI desaparece en texto negro (`#111111`) y superficies blancas, permitiendo que la fotografía hero — atletas sudando, zapatillas en el aire, energía de estadio — cargue con el peso emocional. Cuando el color aparece en la UI, es casi exclusivamente funcional: rojo para errores, azul para enlaces, verde para éxito. El producto en sí es la historia del color. Esta contención crea una paradoja visual: las páginas más coloridas de internet se sienten las más mínimas, porque toda la vivacidad proviene de la mercancía y no de la interfaz.

El sistema tipográfico es la otra mitad de la identidad visual de Nike. Titulares uppercase monumentales en Nike Futura ND — una variante condensada personalizada de Futura con una interlineado imposiblemente ajustado (0.90) — atraviesan las imágenes hero como una onda de choque tipográfica. Debajo de los titulares, la familia Helvetica Now se encarga de todo, desde la navegación hasta las descripciones de producto, con una claridad de precisión suiza. Esta división entre tipografía display expresiva y tipografía de cuerpo funcional refleja la dualidad de marca de Nike: inspiración se encuentra con ejecución.

**Características Clave:**
- UI monocromática (negro/blanco/gris) que permite que la fotografía de producto sea la única fuente de color
- Tipografía display uppercase monumental (96px, line-height 0.90) que atraviesa las imágenes hero
- Fotografía a sangre sin border radius — las imágenes llenan cada borde disponible
- Botones en forma de píldora (30px radius) como elemento interactivo principal
- Cuadrícula de espaciado de 8px con disciplina atlética — cada medida se ajusta al sistema
- Arquitectura de compras orientada a categorías con grandes tarjetas de imagen navegacionales
- Modelo de elevación sin sombras y con bordes mínimos — diferenciación de superficie únicamente mediante cambios de gris

## 2. Paleta de Colores y Roles

### Principal

- **Nike Black** (`#111111`): La base — texto principal, fondos de botones, texto de nav, overlays hero. Deliberadamente no negro puro (#000000), creando una experiencia de lectura ligeramente más suave
- **Nike White** (`#FFFFFF`): Lienzo principal de página, texto de botón sobre fondo oscuro, superficies de tarjeta, fondo de barra de nav

### Superficie y Fondo

- **Snow** (`#FAFAFA`): Superficie más clara, diferenciación sutil casi blanca (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Fondo secundario, relleno de input de búsqueda, placeholder de imagen, skeleton de carga (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Fondo de estado hover, relleno de botón desactivado (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Fondo principal en secciones oscuras/invertidas (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Fondo principal inverso, superficie no negra más oscura (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Estado hover sobre fondos oscuros (--podium-cds-color-grey-700)

### Neutros y Texto

- **Primary Text** (`#111111`): Texto de cuerpo principal, encabezados, enlaces de nav (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Texto descriptivo, metadatos, marcas de tiempo, etiquetas de precio (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Elementos inactivos, opciones no disponibles (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Texto desactivado sobre fondos oscuros (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Color de borde estándar, coincide con el texto secundario
- **Border Secondary** (`#CACACB`): Bordes sutiles, bordes de input, líneas divisoras (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Estado de borde inactivo
- **Border Active** (`#111111`): Borde activo/enfocado, coincide con el texto principal

### Semántico y Acento

- **Nike Red** (`#D30005`): Errores críticos, insignias de oferta, notificaciones urgentes (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, rojo ligeramente más claro para énfasis
- **Nike Orange Badge** (`#D33918`): Texto de insignia, llamadas promocionales (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Acento naranja expresivo (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Confirmación, disponibilidad, estados positivos (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Éxito sobre fondos oscuros (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Enlaces de texto, destacados informativos (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Enlaces sobre fondos oscuros (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Fondos de advertencia, banners de atención (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Anillo indicador de foco de teclado

### Espectro de Color Extendido (Podium CDS)

Cada rampa de color va de 50 a 900 para uso expresivo en campañas y páginas de producto:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Sistema de Gradientes

Nike evita los gradientes de UI. Cuando aparecen gradientes, son fotográficos — aplicados a fondos hero de producto (p. ej., una zapatilla roja sobre un gradiente de rojo a rojo más profundo). El sistema de diseño en sí mismo es únicamente de color plano.

## 3. Reglas Tipográficas

### Familia de Fuentes

**Display:** Nike Futura ND (variante condensada personalizada de Futura exclusiva de Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Usada exclusivamente para titulares display uppercase de gran tamaño
- Interlineado característicamente ajustado (0.90) y transformación uppercase

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Usada para encabezados de sección y títulos de producto de 24–32px

**Body Medium:** Helvetica Now Text Medium (weight 500)
- Fallbacks: Helvetica, Arial
- Usada para enlaces, botones, leyendas, texto de cuerpo enfatizado

**Body:** Helvetica Now Text (weight 400)
- Fallbacks: Helvetica, Arial
- Usada para texto de cuerpo estándar, descripciones, metadatos

**Arabic:** Neue Frutiger Arabic — alternativa específica por locale

### Jerarquía

| Rol | Tamaño | Weight | Line Height | Letter Spacing | Notas |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, uppercase, titulares hero |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, títulos de sección |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, subsecciones |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, títulos de tarjeta |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, descripciones de producto |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, texto enfatizado |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, enlaces de navegación |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, enlaces de pie/utilidad |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, texto CTA |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, botones secundarios |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, etiquetas de precio |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, marcas de tiempo |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, texto legal |

### Principios

La tipografía de Nike es un estudio de tensión. La capa display — Nike Futura ND a 96px con un devastador interlineado de 0.90 — está diseñada para sentirse como el marcador de un estadio: masiva, condensada, uppercase, imposible de ignorar. Transforma los titulares en gritos de batalla. Por debajo de la capa display, Helvetica Now aporta un contrapunto clínico: legibilidad de precisión suiza con generoso interlineado de 1.75 para una navegación de producto cómoda. El weight 500 (Medium) domina en todo el texto de cuerpo, dando a la prosa de Nike una ligera asertividad sin la pesadez de la negrita — cada frase se lee como una recomendación confiada, no como un grito.

## 4. Estilos de Componentes

### Botones

**Primario**
- Background: Nike Black (`#111111`)
- Text: White (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Border: none
- Border radius: píldora completamente redondeada (30px)
- Padding: ~12px 24px
- Hover: el background cambia a Grey-500 (`#707072`), color de texto en hover
- Active: efecto ripple scale(0) con opacity 0.5
- Focus: anillo box-shadow de 2px en `rgba(39, 93, 197, 1)`
- Transition: background 200ms ease

**Primario sobre Oscuro**
- Background: White (`#FFFFFF`)
- Text: Black (`#111111`)
- Hover: el background cambia a Grey-300 (`#CACACB`)

**Secundario (Delineado)**
- Background: transparent
- Text: Nike Black (`#111111`)
- Border: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: el borde se oscurece a `#707072`, el background a grey-200

**Desactivado**
- Background: Grey-200 (`#E5E5E5`)
- Text: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Botón de Icono**
- Background: Grey-100 (`#F5F5F5`)
- Shape: 30px radius (o 50% para circular)
- Padding: 6px
- Hover: fondo Grey-500

### Tarjetas y Contenedores

- Background: White (`#FFFFFF`) — sin límite de tarjeta visible en la mayoría de los casos
- Border radius: 0px para tarjetas de imagen de producto (imágenes de borde a borde), 20px para contenedores interactivos
- Shadow: none — Nike no utiliza sombras en tarjetas en absoluto
- Hover: sin efecto de elevación en tarjetas de producto; subrayado en enlaces de texto dentro de las tarjetas
- Tarjetas de producto: imagen arriba (sin radius), metadatos de texto debajo con 12px de separación
- Tarjetas de categoría: fotografía a sangre con texto superpuesto sobre gradiente oscuro
- Transition: opacity 200ms ease para intercambio de imágenes en hover

### Inputs y Formularios

- Background: Grey-100 (`#F5F5F5`)
- Border: 1px solid `#CACACB` cuando es visible, o sin borde en búsqueda
- Border radius: 24px (inputs de búsqueda), 8px (inputs de formulario)
- Font: Helvetica Now Text, 16px
- Focus: el borde cambia a `#111111` (border-active), anillo de foco de 2px en `rgba(39, 93, 197, 1)`
- Error: borde `#D30005` (crítico)
- Placeholder: Grey-500 (`#707072`)
- Transition: border-color 200ms ease

### Navegación

- Background: White (`#FFFFFF`), sticky
- Height: ~60px escritorio
- Izquierda: logo Nike Swoosh (24x24px SVG)
- Centro: enlaces de categoría (New & Featured, Men, Women, Kids, Sale) en 16px/500 Helvetica Now Text Medium
- Derecha: iconos de Search (input de 24px radius), Favorites, Cart
- Hover: el color de texto cambia a Grey-500 (`#707072`)
- Móvil: menú hamburguesa, overlay de pantalla completa
- Banner superior: barra de mensaje promocional con fondo oscuro (#111111) y texto blanco

### Tratamiento de Imágenes

- Imágenes hero: a sangre, sin border radius, de borde a borde
- Cuadrícula de producto: proporción cuadrada (1:1) o 4:3, sin border radius
- Tarjetas de categoría: 16:9 o 4:3, a sangre con texto superpuesto
- Placeholder de imagen: fondo sólido Grey-100 (`#F5F5F5`)
- Carga diferida: loading="lazy" nativo, el skeleton usa fondo #F5F5F5
- Hover de producto: intercambio de imagen secundaria (vista frontal → lateral)

### Banners Promocionales

- Fondo oscuro (`#111111`) a ancho completo con texto blanco
- Padding ajustado (8-12px vertical)
- Texto centrado, 12px/500 Helvetica Now Text Medium
- Usados para promociones de envío, beneficios para miembros, anuncios de ofertas

## 5. Principios de Layout

### Sistema de Espaciado

Unidad base: 4px (la cuadrícula primaria es múltiplos de 8px)

| Token | Valor | Uso |
|-------|-------|-----|
| space-1 | 4px | Separaciones de icono ajustadas, espaciado inline |
| space-2 | 8px | Unidad base, separaciones de icono en botón |
| space-3 | 12px | Padding interno de tarjeta, márgenes ajustados |
| space-4 | 16px | Padding estándar, espaciado de nav |
| space-5 | 20px | Separaciones de tarjeta de producto |
| space-6 | 24px | Padding interno de sección, separaciones de cuadrícula |
| space-7 | 32px | Saltos de sección |
| space-8 | 48px | Padding de sección principal |
| space-9 | 64px | Padding de sección hero |
| space-10 | 80px | Espaciado de sección grande |

### Cuadrícula y Contenedor

- Ancho máximo del contenedor: 1920px
- Ancho de contenido estándar: ~1440px con padding horizontal
- Cuadrícula de producto: 3 columnas en escritorio, 2 columnas en tablet, 1 columna en móvil
- Cuadrícula de categoría: 3 columnas con imágenes a sangre
- Separación de cuadrícula: 4-12px entre tarjetas de producto (intencionalmente ajustado)
- Padding horizontal: 48px escritorio, 24px tablet, 16px móvil

### Filosofía del Espacio en Blanco

La estrategia de espacio en blanco de Nike es deliberadamente agresiva — no de la manera lujosa y respirable de una marca de moda, sino de forma comprimida y de alta densidad que llena cada píxel con contenido o ausencia intencional. Las cuadrículas de producto usan separaciones mínimas (4-12px) para crear una sensación de abundancia y elección. Los saltos de sección son generosos (48-80px) para separar los contextos de compra. El efecto general es el de una tienda que se siente repleta de producto pero sigue siendo navegable — como un gran almacén deportivo bien organizado.

### Escala de Border Radius

| Valor | Contexto |
|-------|---------|
| 0px | Imágenes de producto, fotografía hero (bordes nítidos) |
| 8px | Inputs de formulario (no de búsqueda) |
| 18px | Elementos interactivos pequeños |
| 20px | Contenedores, tarjetas con contenido de UI |
| 24px | Inputs de búsqueda, píldoras medianas |
| 30px | Botones, etiquetas, filtros (píldora completa) |
| 50% | Botones de icono circulares, placeholders de avatar |

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Flat | Sin sombra, sin borde | Estado por defecto para todo |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Línea inset sutil entre secciones |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Anillo de foco de teclado |
| Overlay | Velo oscuro sobre fotografía | Legibilidad de texto sobre imagen |

La filosofía de elevación de Nike es radicalmente plana. No hay sombras en tarjetas, ni elevaciones en hover, ni elementos flotantes. La profundidad se comunica exclusivamente a través del color — las secciones oscuras retroceden, las claras avanzan, los cambios de gris indican cambios de estado. Esta planitud refuerza la personalidad de marca atlética y sin rodeos: sin adornos visuales, solo comunicación directa. La única "sombra" en todo el sistema es una línea divisora inset de 1px y el anillo de foco requerido por accesibilidad.

### Profundidad Decorativa

- **Overlays de fotografía hero**: Velos de gradiente oscuro sobre fotografía a sangre para legibilidad del texto
- **Gradientes de fondo de producto**: Fondos de color detrás de las tomas hero de producto (p. ej., zapatilla roja sobre gradiente rojo)
- **Barras de banner**: Franjas promocionales sólidas oscuras (#111111) en la parte superior de la página

## 7. Lo que Se Debe y No Se Debe Hacer

### Se Debe

- Usar Nike Black (#111111) para todo el texto principal — nunca el puro #000000
- Mantener los botones en forma de píldora (30px radius) y limitados a variantes primaria/secundaria
- Usar fotografía a sangre de borde a borde para las secciones hero — sin border radius en las imágenes
- Dejar que la fotografía de producto aporte toda la vivacidad del color; mantener la UI monocromática
- Usar Nike Futura ND en uppercase ÚNICAMENTE para titulares display (96px+)
- Mantener separaciones de cuadrícula de producto ajustadas (4-12px) para una sensación densa y abundante
- Usar Grey-100 (#F5F5F5) para todos los fondos de input y placeholder
- Reservar el color exclusivamente para significado semántico (rojo=error, verde=éxito, azul=enlace)
- Usar weight 500 (Medium) para todos los elementos de texto interactivos

### No Se Debe

- No añadir sombras a las tarjetas — el modelo de elevación de Nike es completamente plano
- No usar border radius en la imagen de producto — solo los elementos de UI obtienen esquinas redondeadas
- No introducir colores de marca más allá de la escala de grises para elementos de UI
- No usar Nike Futura ND por debajo de 24px — es exclusivamente una fuente display
- No añadir efectos de elevación en hover — las tarjetas de Nike no se animan en hover
- No usar weight regular (400) para botones o enlaces — usar siempre 500
- No colocar fondos de color detrás de elementos de UI — el color está reservado para contextos de producto
- No usar más de dos niveles de jerarquía de texto por tarjeta (título + cuerpo)
- No añadir divisores decorativos — el inset de 1px es el único patrón de divisor
- No suavizar el contraste — el diseño de Nike deliberadamente lleva el negro sobre blanco al máximo

## 8. Comportamiento Responsivo

### Breakpoints

| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Mobile | <640px | Columna única, nav hamburguesa, el texto display se reduce, padding ajustado de 16px |
| Small Tablet | 640-768px | Comienza la cuadrícula de producto de 2 columnas, nav sigue colapsada |
| Tablet | 768-960px | Cuadrículas de 2 columnas, las tarjetas de categoría se escalan, padding horizontal 24px |
| Small Desktop | 960-1024px | La nav se expande a horizontal completo, cuadrícula de producto de 3 columnas |
| Desktop | 1024-1440px | Layout completo, nav expandida, cuadrículas de 3 columnas, padding 48px |
| Large Desktop | >1440px | Contenedor de ancho máximo centrado, márgenes aumentados, imágenes hero a sangre |

### Objetivos Táctiles

- Objetivo táctil mínimo: 44x44px (WCAG AAA)
- Iconos de nav móvil: área táctil de 48x48px
- Tarjetas de producto: toda la superficie es tappable
- Píldoras de filtro: altura mínima de 36px con 12px de padding

### Estrategia de Colapso

- **Navegación**: enlaces de categoría completos → menú hamburguesa por debajo de 960px; los iconos de búsqueda, favoritos y carrito permanecen visibles
- **Cuadrículas de producto**: 3-col → 2-col a 960px → 1-col a 640px
- **Secciones hero**: el texto display se escala de 96px → 64px → 48px; las imágenes hero permanecen a sangre en todos los tamaños
- **Tarjetas de categoría**: 3-col → 2-col → 1-col manteniendo la imagen a sangre
- **Padding de sección**: 80px → 48px → 32px → 24px a medida que el viewport se estrecha
- **Banner promocional**: el texto se ajusta o se trunca, mantiene el fondo oscuro

### Comportamiento de Imagen

- Imágenes responsivas a través de Nike CDN (`c.static-nike.com`) con parámetros de ancho
- Imágenes de producto: srcset con múltiples resoluciones (w_320, w_640, w_960, w_1920)
- Imágenes hero: a sangre en todos los breakpoints, la proporción cambia (16:9 escritorio → 4:3 móvil)
- Carga diferida: loading="lazy" nativo, placeholder grey-100 durante la carga
- Dirección de arte: los recortes hero cambian entre composiciones de escritorio y móvil

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Color

- CTA principal: Nike Black (`#111111`)
- Fondo: White (`#FFFFFF`)
- Superficie secundaria: Light Gray (`#F5F5F5`)
- Texto de encabezado: Nike Black (`#111111`)
- Texto de cuerpo / hover: Secondary Text (`#707072`)
- Borde: Border Secondary (`#CACACB`)
- Error: Nike Red (`#D30005`)
- Enlace: Link Blue (`#1151FF`)

### Prompts de Componente de Ejemplo

- "Crea una sección hero de producto con fotografía a sangre de borde a borde, sin border radius, un overlay de gradiente oscuro para el texto, y un titular uppercase monumental de 96px/500 en estilo Nike Futura con interlineado 0.90 y un botón píldora Nike Black (#111111) (30px radius)"
- "Diseña una cuadrícula de tarjetas de producto de 3 columnas con imágenes cuadradas (sin border radius), separación de 4px entre tarjetas, nombre del producto en 16px/500 Nike Black (#111111), precio en 14px/500, y texto secundario en Grey-500 (#707072)"
- "Construye una barra de navegación blanca sticky con logo alineado a la izquierda, enlaces de categoría centrados en 16px/500 (#111111) con color hover #707072, e iconos de búsqueda alineados a la derecha (24px radius, fondo #F5F5F5), favoritos y carrito"
- "Crea una franja de banner promocional con fondo #111111, texto centrado blanco 12px/500, y 8px de padding vertical — ancho completo, sin border radius"
- "Diseña un botón secundario delineado con fondo transparent, borde #CACACB de 1.5px, píldora de 30px radius, texto #111111 16px/500, borde en hover oscureciéndose a #707072"

### Guía de Iteración

Al refinar pantallas existentes generadas con este sistema de diseño:
1. Concéntrate en UN componente a la vez
2. Referencia los nombres de color específicos y los códigos hex de este documento
3. Recuerda: la fotografía de producto es el color — la UI se mantiene monocromática
4. Usa la escala de grises para los cambios de estado: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Si algo se siente demasiado colorido en la UI, probablemente lo está — Nike mantiene la UI en escala de grises
6. La tipografía display (Nike Futura) SIEMPRE debe estar en uppercase y nunca por debajo de 24px
7. La tipografía de cuerpo (Helvetica Now) casi siempre debe tener weight 500 para elementos interactivos
