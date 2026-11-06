# Sistema de Diseño Inspirado en Starbucks

> Category: E-Commerce & Retail
> Marca global de venta minorista de café. Sistema de cuatro niveles de verde, lienzo crema cálido, botones de píldora completa.

## 1. Tema Visual y Atmósfera

El sistema de diseño de Starbucks es una **insignia retail cálida y segura** que viste el verde de su delantal en cada superficie. El lienzo alterna entre un crema neutro cálido (`#f2f0eb`) y un blanco roto cerámico (`#edebe9`) — colores que hacen referencia a los materiales reales de las tiendas: las servilletas de papel, las paredes del café, los acabados en madera — mientras que el emblemático **Starbucks Green** (`#006241`) ancla el momento de marca en bandas hero, CTAs y la experiencia de Rewards. Los verdes se presentan en cuatro tonalidades calibradas (Starbucks, Accent, House, Uplift), cada una asignada a un rol de superficie específico, y el dorado (`#cba258`) aparece únicamente en la ceremonia de estado de Rewards, no como acento de propósito general.

La tipografía lleva gran parte de la voz de la marca. La tipografía propietaria **SoDoSans** (exclusiva de Starbucks) aparece en casi todas las superficies con un interletraje ajustado de `-0.16px` — transmite confianza y amabilidad, no la severidad de una revista de moda. Algo inusual: la página de Rewards cambia a una serif cálida (`"Lander Tall", "Iowan Old Style", Georgia`) en momentos de titular específicos, evocando sutilmente la nostalgia de una pizarra de cafetería. Y las páginas de Careers utilizan un script manuscrito (`"Kalam", "Comic Sans MS", cursive`) para los toques personales del nombre en el vaso. Tres tipografías, tres contextos — el sistema es disciplinado sobre cuándo aparece cada una.

Las superficies respiran a través de una geometría redondeada. Cada botón es una píldora completa de 50px. Las tarjetas tienen un rectángulo redondeado de 12px. El CTA flotante "Frap" — un botón de orden circular de 56px en Green Accent (`#00754A`) — es el movimiento de profundidad característico del producto: flota en la esquina inferior derecha con una pila de sombras en capas (`0 0 6px rgba(0,0,0,0.24)` base + `0 8px 12px rgba(0,0,0,0.14)` ambiental) y se comprime mediante `scale(0.95)` al presionar. Las elevaciones son por lo demás contenidas — las sombras de las tarjetas permanecen en un alfa susurrado de `0.14/0.24`, la navegación global tiene una pila de sombras suave de tres capas. Todo el sistema se siente como la señalética limpia de un café: legible, cálida y sin estridencias.

**Características Clave:**
- Sistema de marca de cuatro niveles de verde (Starbucks / Accent / House / Uplift), cada uno asignado a un rol de superficie distinto — no un único "verde de marca"
- El dorado está reservado únicamente para los momentos de ceremonia de estado de Rewards; nunca es un acento de propósito general
- Lienzo neutro cálido (`#f2f0eb` / `#edebe9`) en lugar de blanco frío — hace referencia a los materiales del café
- Tipografía propietaria personalizada (SoDoSans) con interletraje ajustado `-0.16px` como voz universal
- Cambios tipográficos según el contexto: serif (Lander Tall) para Rewards, script (Kalam) para los nombres en vasos de Careers
- Botones de píldora completa (radio `50px`) universales, `scale(0.95)` en la pulsación activa como microinteracción característica
- CTA circular flotante "Frap" (`56px`, relleno Green Accent, pila de sombras en capas) — el elemento de elevación característico del producto
- Las superficies de tarjetas de regalo están diseñadas como **producto físico fotografiado** — cada tarjeta es una fotografía ilustrada distinta en lugar de un gráfico generado
- Radio de tarjeta de 12px + sombras extremadamente suaves mantienen las tarjetas de contenido con un aspecto plano con ligero levantamiento
- Escala de espaciado basada en rem anclada en 1.6rem (~16px) = `--space-3`, escalando hasta 6.4rem (~64px)

**Ritmo de página en bloques de color:** Hero crema → Secciones de contenido blanco → Banda feature verde oscuro (`#1E3932`) con texto blanco → Zona utilitaria crema → Pie de página verde oscuro (`#1E3932`) con texto dorado/blanco — un remate color espresso oscuro alrededor del cuerpo luminoso.

## 2. Paleta de Colores y Roles

**Páginas fuente analizadas:** página de inicio, rewards, tarjetas de regalo, detalle de producto (Pink Energy Drink), nutrición del producto (Cold Brew).

### Primarios

- **Starbucks Green** (`#006241`): El verde histórico de la marca. Se usa en los encabezados h1, en los encabezados de sección principales en la página de Rewards, y como señal de marca principal donde se necesita un color dominante único.
- **Green Accent** (`#00754A`): Un verde ligeramente más brillante y luminoso. El color principal del CTA relleno ("Explore our afternoon menu", "See the spring menu") y el relleno del botón circular flotante Frap.
- **House Green** (`#1E3932`): El verde de marca profundo casi negro. Superficie del pie de página, fondos de bandas feature, superficies oscuras de estado de recompensa, y la banda hero "Free coffee is just the beginning" en Rewards.
- **Green Uplift** (`#2b5148`): Un verde de nivel medio-oscuro secundario utilizado con moderación en acentos decorativos y momentos de degradado oscuro.
- **Green Light** (`#d4e9e2`): Un lavado menta pálido utilizado para tintes de estado de formulario válido y superficies utilitarias verde claro.

### Secundarios y Acentos

- **Gold** (`#cba258`): Reservado casi exclusivamente para la ceremonia de estado de Rewards — llamadas al nivel Gold, insignias de asociación (SkyMiles, Bonvoy) y acentos de apariencia premium. Nunca es un color de marca de propósito general.
- **Gold Light** (`#dfc49d`): Dorado más suave para fondos en secciones de nivel Gold.
- **Gold Lightest** (`#faf6ee`): Lavado crema-dorado de superficie de página utilizado bajo las secciones de asociación en la página de Rewards — conecta el acento dorado de vuelta al sistema neutro cálido.

### Superficie y Fondo

- **White** (`#ffffff`): Superficie principal de tarjetas y modales. También relleno de tarjetas en los mosaicos de tarjetas de regalo.
- **Neutral Cool** (`#f9f9f9`): Superficie gris frío sutil usada en menús desplegables (desplegable "Account"), envoltorios de tarjetas de formulario y contenedores utilitarios discretos.
- **Neutral Warm** (`#f2f0eb`): El **lienzo de página principal** crema cálido para zonas utilitarias de Rewards y bandas hero.
- **Ceramic** (`#edebe9`): Una crema ligeramente más cálida/oscura para separadores de zonas, lavados suaves de secciones de página y la banda de asociación de Rewards.
- **Black** (`#000000`): Tinta profunda reservada para la tira de CTA superior de página ("Join now") y los botones de inicio de sesión de navegación superior de alto contraste.

### Neutrales y Texto

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Color principal de encabezado y cuerpo de texto en superficies claras. No negro puro — un negro al 87% de opacidad que se lee más cálido.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Texto secundario/metadata en superficies claras.
- **Text White** (`rgba(255, 255, 255, 1)`): Texto principal de encabezado/cuerpo en superficies verde oscuro.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Texto secundario en superficies verde oscuro — descripciones de enlaces del pie de página, texto de leyenda.
- **Rewards Green** (`#33433d`): Un verde pizarroso y apagado dedicado exclusivamente a los bloques de texto de la página de Rewards — un color de lectura ligeramente más "apagado" que Text Black que señala "superficie de recompensa" sin usar el Starbucks Green completo.

### Semánticos y Acentos

- **Red** (`#c82014`): Estado de error y destructivo (formulario inválido, acciones destructivas).
- **Yellow** (`#fbbc05`): Estado de advertencia, toque de marca heredado.
- **Green Light** (`#d4e9e2` al 33% de opacidad = `hsl(160 32% 87% / 33%)`): Fondo de tinte de campo de formulario válido.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Tinte de campo inválido en formularios.

### Escalas Alpha de Negro/Blanco

Dos escalas translúcidas paralelas para superposición y uso de texto secundario:
- `rgba(0,0,0,0.06)` hasta `rgba(0,0,0,0.90)` en pasos del 10% — para superposiciones oscuras en superficies claras
- `rgba(255,255,255,0.10)` hasta `rgba(255,255,255,0.90)` en pasos del 10% — para superposiciones claras en superficies oscuras

### Sistema de Degradados

No se observaron tokens de degradado estructurales. La jerarquía de superficies es completamente en bloques de color sólido — el sistema se apoya en su paleta de superficies de cinco niveles crema/verde en lugar de degradados.

## 3. Reglas Tipográficas

### Familia de Fuentes

- **Primaria:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — la tipografía corporativa propietaria de Starbucks, usada en prácticamente todas las superficies
- **Respaldo de carga:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — lo que ven los usuarios antes de que cargue SoDoSans
- **Serif de Rewards:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — usada en momentos de titular específicos de la página de Rewards para un tono editorial cálido
- **Script de Careers:** `"Kalam", "Comic Sans MS", cursive` — usada exclusivamente para los toques decorativos del "nombre en el vaso" en las páginas de Careers, en referencia a los nombres escritos a mano en los vasos de Starbucks

No se activan explícitamente conjuntos estilísticos OpenType en `:root`.

### Jerarquía

| Rol | Tamaño | Peso | Altura de línea | Espaciado de letra | Notas |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | Display más grande de Rewards/hero |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Encabezados hero secundarios |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Titulares de sección de landing |
| H1 | 24px | 600 | 36px | -0.16px | Encabezado principal Starbucks-Green |
| H2 | 24px | 400 | 36px | -0.16px | Título de sección con peso regular en Text Black |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Texto introductorio hero, cuerpo de banda feature |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Cuerpo de texto predeterminado |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Etiqueta de botón, metadata, etiquetas de formulario |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Estado activo de etiqueta flotante, micro-copia de leyenda |
| Button Label | 14–16px | 400–600 | 1.2 | -0.01em | Todas las etiquetas de botones de píldora |

**Tokens de interletraje:**
- `letterSpacingNormal`: `-0.01em` (predeterminado — ajustado, característico)
- `letterSpacingLoose`: `0.1em` (mayúsculas enfatizadas)
- `letterSpacingLooser`: `0.15em` (etiquetas en estilo mayúsculas, énfasis extremo)

**Tokens de altura de línea:**
- `lineHeightNormal`: `1.5` (cuerpo)
- `lineHeightCompact`: `1.2` (display/botones)

### Principios

- El **tracking negativo ajustado (`-0.01em`)** se aplica casi universalmente — todo el producto se lee ligeramente comprimido, lo que le da a SoDoSans su presencia segura sin sentirse apretado.
- **Los cambios de peso llevan la jerarquía, no los cambios de tamaño.** H1 y H2 comparten el mismo tamaño de 24px/36px; solo el peso (600 vs 400) y el color (Starbucks-Green vs Text Black) los diferencian.
- **Los tokens de tamaño usan rem, anclados a `1rem = 10px`** en este sitio (mediante un truco `font-size: 62.5%` en la raíz). Así, `1.6rem` = 16px, `2.4rem` = 24px, etc. La escala es semántica (textSize-1 a textSize-10), no valores de píxeles arbitrarios.
- **Los cambios de tipografía según el contexto** — serif en Rewards, script en Careers — son deliberados y localizados. Nunca deben mezclarse con la sans principal dentro de la misma superficie.
- **El texto de cuerpo nunca es negro puro** — se sitúa en `rgba(0,0,0,0.87)` para igualar la temperatura del lienzo neutro cálido.

### Nota sobre Sustitutos de Fuentes

SoDoSans es propietaria de Starbucks (licenciada de House Industries, no disponible públicamente). Sustitutos razonables de código abierto:
- **Inter** (Google Fonts) — proporciones geométricas humanistas similares, amplia gama de pesos
- **Manrope** — ligeramente más redondeada, sensación segura similar
- **Nunito Sans** — más cálida, buena como sustituto de marca de "café"

Si se sustituye, verificar que el tracking ajustado `-0.01em` / `-0.16px` siga leyéndose bien; algunas fuentes de código abierto necesitan `-0.005em` en su lugar.

Lander Tall (la serif de Rewards) es personalizada — sustitutos de código abierto: **Iowan Old Style** (ya incluida como respaldo), **Lora** o **Source Serif Pro**. Kalam (el script de Careers) está disponible directamente en Google Fonts.

## 4. Estilos de Componentes

### Botones

**1. Primario Relleno — "Explore our afternoon menu / Sign up for free"**
- Background: `#00754A` (Green Accent)
- Texto: `#ffffff`
- Borde: `1px solid #00754A`
- Radio: `50px` (píldora completa)
- Padding: `7px 16px`
- Fuente: SoDoSans, 16px, peso 600, letter-spacing `-0.01em`
- Estado activo: `transform: scale(0.95)` mediante `--buttonActiveScale`
- Transición: `all 0.2s ease`

**2. Primario Delineado — "Give them a try / Start an order"**
- Background: transparente
- Texto: `#00754A` (Green Accent)
- Borde: `1px solid #00754A`
- Mismo radio/padding/activo/transición que el Primario Relleno

**3. Negro Relleno — "Join now"**
- Background: `#000000`
- Texto: `#ffffff`
- Borde: `1px solid #000000`
- Radio: `50px`, Padding: `7px 16px`
- Fuente: 14px, peso 600
- Usado en la tira de incorporación de la parte superior de la página y momentos de conversión similares

**4. Oscuro Delineado — "Sign in"**
- Background: transparente
- Texto: `rgba(0, 0, 0, 0.87)` (Text Black)
- Borde: `1px solid rgba(0, 0, 0, 0.87)`
- Radio: `50px`, Padding: `7px 16px`
- Fuente: 14px, peso 600

**5. Verde sobre Verde Invertido — "See the spring menu"**
- Background: `#ffffff`
- Texto: `#00754A`
- Borde: `1px solid #ffffff`
- Usado cuando la superficie detrás del botón es la banda verde oscuro House Green — botón blanco con texto verde en lugar de una píldora verde rellena sobre fondo verde

**6. Delineado sobre Oscuro — "Learn more / Order now"**
- Background: transparente
- Texto: `#ffffff`
- Borde: `1px solid #ffffff`
- Usado en bandas feature verde oscuro para la acción secundaria emparejada con un CTA blanco relleno

**7. Consent Agree (variante verde oscuro)**
- Background: `rgb(0, 130, 72)` (una variante verde específica usada en el módulo de consentimiento de cookies)
- Texto: `#ffffff`
- Sin borde, radio `50px`, padding `7px 16px`, 14px / peso 400
- Ligeramente más brillante que Green Accent — reservado para la acción de Agree del banner de consentimiento

**8. Frap — Botón de Orden Circular Flotante**
- Background: `#00754A` (Green Accent)
- Icono: `#ffffff`
- Tamaño: `5.6rem / 56px` (estándar), `4rem / 40px` (variante mini)
- Radio: `50%` (círculo completo)
- Posición fija en la esquina inferior derecha, desplazamiento táctil de `-0.8rem` para mayor comodidad al tocar
- Pila de sombras: base `0 0 6px rgba(0,0,0,0.24)` + ambiental `0 8px 12px rgba(0,0,0,0.14)`
- Estado activo: la sombra ambiental se desvanece a `0 8px 12px rgba(0,0,0,0)`
- Este es el elemento de elevación característico del producto — flota sobre cada superficie desplazada

**9. Pestaña de Feedback de Ancho Completo — "Provide feedback"**
- Background: `#00754A`
- Texto: `#ffffff`
- Radio: `12px 12px 0px 0px` (solo la parte superior redondeada)
- Padding: `8px 16px`
- Fuente: 14px, peso 400
- Posicionado fijo en la parte inferior derecha interior, adosado al borde del viewport

### Tarjetas y Contenedores

**Tarjeta de Contenido (predeterminada)**
- Background: `#ffffff` (`--cardBackgroundColor`)
- Radio: `12px` (`--cardBorderRadius`)
- Sombra: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Usada para: tarjetas feature, mosaicos de elementos de menú, paneles de estado de recompensa

**Mosaico de Tarjeta de Regalo**
- Background: fotografía ilustrada que ocupa toda la tarjeta (sin fondo sólido)
- Radio: similar a las tarjetas (`~12px`, ligeramente más ajustado en las esquinas)
- Sombra: más ligera que la tarjeta predeterminada — se tratan como tarjetas físicas sobre el lienzo
- Etiquetadas por categoría sobre la cuadrícula de tarjetas (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Tarjetas de Estado de Rewards (firma de la página de Rewards)**
- Cuadrícula de tres columnas: Bronze / Gold / Silver-ish — cada una es un panel verde oscuro (`#1E3932`) con:
  - Anillo de encabezado con color/degradado de color
  - Insignia numerada "Level"
  - Título de estado en SoDoSans grande peso 600
  - Estrellas / lista de beneficios en texto blanco/blanco translúcido
  - Leyenda inferior de progresión "As you earn more stars…"

**Tarjeta de Asociación (Rewards)**
- Background: `#faf6ee` (Gold Lightest) superficie crema cálida
- Contenido: logotipos de socios ("SkyMiles", "Bonvoy") centrados, con texto descriptivo debajo
- El radio y la sombra siguen las especificaciones de la tarjeta predeterminada

**Menú Desplegable (desplegable de Account, navegación superior)**
- Background: `#f9f9f9` (Neutral Cool)
- Elementos del menú a `24px / peso 400` en Text Black
- Sin borde — solo cambio de superficie de fondo contra la navegación blanca

**Modal**
- Padding: `2.4rem` (`--modalPadding`)
- Padding superior: `8.8rem` (`--modalTopPadding`) — deja espacio para el botón de cierre / encabezado
- Padding vertical combinado: `11.2rem`
- El radio se hereda de las especificaciones de tarjeta (`12px`)

### Entradas y Formularios

**Entrada con Etiqueta Flotante**
- La etiqueta flota sobre el borde de la entrada cuando está enfocada/completada
- Tamaño de fuente de etiqueta en escritorio: `1.9rem` predeterminado, se anima a `1.4rem` cuando está activa
- Tamaño de fuente de etiqueta en móvil: `1.6rem` predeterminado, se anima a `1.3rem` activo
- Desplazamiento horizontal de la etiqueta: `12px` desde la izquierda
- Traducción activa de la etiqueta: hasta `-12px` con traducción Y de `-50%`
- Padding del campo: `12px`
- Padding horizontal del formulario: `1.6rem`
- Validación: el campo válido obtiene un tinte `rgba(green-light, 0.33)`; el campo inválido obtiene un tinte `rgba(red, 0.05)`
- Transición: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` en la entrada marcada

**Icono de Opción (checkbox/radio)**
- Padding: `3px` interior
- Usa la animación cubic-bezier de entrada marcada anterior (una curva de sobrepasamiento ligeramente "elástica" de 2.32)

### Navegación

**Navegación Global (barra superior)**
- Posición fija con alturas progresivas: `64px` xs → `72px` móvil → `83px` tablet → `99px` escritorio
- Pila de sombras: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — elevación suave de tres capas
- Izquierda: logotipo wordmark de Starbucks, con desplazamiento de `99px` (md) / `131px` (lg) desde el borde izquierdo
- Enlaces principales en línea en SoDoSans peso 400–600: Menu · Rewards · Gift Cards
- Derecha: enlace Find a store + Sign in (delineado) + Join now (negro relleno)

**Sub-navegación (segunda barra, p. ej., interna de Rewards)**
- Altura: `53px` (subnav global) / `48px` (subnav interno)
- Típicamente un grupo de pestañas horizontal bajo la navegación global

**Navegación Móvil**
- Colapsa en un cajón hamburguesa por debajo del breakpoint de tablet
- El botón flotante Frap persiste en la esquina inferior derecha independientemente del estado de la navegación

### Tratamiento de Imágenes

- **Fotografía hero**: Las fotos de productos (bebidas en vasos transparentes con fondos de colores — coral, salvia, ámbar cálido) ocupan ~40vw de un diseño hero dividido; el texto ocupa el otro 60vw (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Ilustraciones de tarjetas de regalo**: Cada tarjeta es una fotografía ilustrada distinta (aspecto pintado, dibujado a mano, paleta de colores cálidos). Nunca son gráficos generados genéricos.
- **Imágenes de ceremonia de Rewards**: Fotografías de pantallas de la app Starbucks Rewards sostenidas en la mano, composiciones anguladas — fotografía de producto en contexto.
- **Miniaturas del menú**: Fotografía de producto cuadrada o 4:3 con fondos blancos/crema limpios, ligera sombra suave alrededor del vaso.
- **Fundido de imagen**: Transición `opacity 0.3s ease-in` al cargar la imagen (`--imageFadeTransition`).

### Banda Feature (tira hero verde oscuro)

Banda de ancho completo `#1E3932` (House Green) con:
- Izquierda: titular blanco + subtítulo + fila de CTA
- Derecha: fotografía de producto o ilustración
- Proporción dividida ~40/60 o 50/50 según la sección
- Texto blanco en toda la superficie con `rgba(255,255,255,0.70)` para texto secundario
- Los CTAs siguen el patrón Verde sobre Verde Invertido (blanco relleno) + Delineado sobre Oscuro (contorno blanco)

### Expandidor / Acordeón

- Duración: `300ms` (`--expanderDuration`)
- Curva de temporización: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — una ease-out medida
- Usado para secciones de preguntas frecuentes en Rewards y la página de tarjetas de regalo

### Módulo de Consentimiento de Cookies

Tarjeta modal verde oscuro en la parte superior de la página con botones "Agree" (verde relleno) y "Manage preferences" (delineado). Aparece en la primera visita; se puede descartar.

### Componentes de Detalle de Producto (clúster característico del PDP)

Un clúster de componentes recurrente utilizado en las páginas de producto del menú (p. ej., `/menu/product/40498/iced` para el detalle de una bebida, `/menu/product/.../nutrition` para la información nutricional). Estos amplían el inventario de componentes sin cambiar los tokens.

**Selector de Opciones de Tamaño**
- Fila horizontal de 4 botones con icono de vaso (Tall / Grande / Venti / Trenta)
- Cada elemento: icono de silueta de vaso en la parte superior, nombre del tamaño abajo (16/700 en Starbucks-Green), leyenda de onzas líquidas (13/400 en Text Black Soft)
- Estado activo: un anillo de contorno circular verde (`2px solid #00754A`) alrededor del icono de vaso seleccionado
- Inactivo: sin anillo, misma tipografía
- Fila de ancho completo, espaciado uniforme
- Radio del contenedor: `12px` o plano; los iconos individuales son circulares `50%`
- Padding: `16px 24px` interior

**Selección de Add-in / Leche (rectángulo delineado)**
- Background: `#ffffff`
- Borde: `1px solid #d6dbde` (Input Border)
- Radio: `4px`
- Ancho completo en su columna
- Etiqueta flotante sobre el borde superior: "Add-ins" / "Milk" / "Add-ins" — 13/700 en Text Black, mayúsculas, `0.325px` de interletraje
- Valor mostrado centrado (p. ej., "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Icono de chevron hacia abajo en el lado derecho en Text Black Soft
- Enfoque: el borde cambia a Green Accent (`#00754A`)

**Stepper Numérico**
- Integrado dentro de una fila de Add-in cuando se requiere una cantidad (p. ej., dosis de Strawberry Fruit Inclusions)
- Botón `−` menos + número de cantidad + botón `+` más, todos en línea a la derecha de la etiqueta
- Botones: circulares `32×32px` con borde `1px solid #d6dbde`, icono gris neutro
- Número de cantidad: 16/700 Text Black centrado

**Botón de Personalización**
- Background: `#ffffff`
- Texto: `#00754A` (Green Accent)
- Borde: `1.5px solid #00754A`
- Radio: `50px` (píldora completa)
- Padding: `14px 40px` (generosamente más grande que las píldoras predeterminadas — esta es una acción primaria secundaria)
- Etiqueta: "Customize" con un icono de destellos dorados ✨ a la izquierda
- Usado para: iniciar el flujo de personalización de bebida después de seleccionar el tamaño/leche

**Botón Add to Order (PDP)**
- Background: `#00754A` (Green Accent)
- Texto: `#ffffff`
- Radio: `50px`
- Padding: `14px 32px`
- Anclado en la parte superior derecha de la tarjeta de producto y/o alineado a la derecha dentro de la banda de disponibilidad en tienda
- Mismo comportamiento activo scale(0.95) que otros CTAs primarios

**Píldora de Costo de Rewards — "200★ item"**
- Background: transparente
- Borde: `1px solid #cba258` (Gold)
- Texto: `#cba258` (Gold)
- Radio: `50px` (píldora completa)
- Padding: `4px 12px`
- Contenido: "200★ item" donde `★` es un glifo de estrella rellena pequeño — indica las Rewards Stars necesarias para canjear este artículo
- Fuente: Proxima Nova 13/700 con `0.5px` de interletraje
- Usado solo en productos canjeables con Rewards

**Banda de Descripción del Producto**
- Banda verde oscuro de ancho completo (`#1E3932` House Green)
- Contiene de arriba a abajo:
  1. Píldora de Costo de Rewards (dorada) si aplica
  2. Descripción del producto en blanco (16/400/1.5)
  3. Resumen nutricional en línea ("140 calories, 25g sugar, 2.5g fat") con tooltip de icono de información — 14/700 blanco
  4. Botón de píldora blanco delineado sobre verde "Full nutrition &amp; ingredients list"
- Padding: `32px` vertical
- Aparece debajo de la banda principal del encabezado del producto

**Tabla de Ingredientes / Nutrición**
- Diseño de dos columnas en la página de Nutrición
- Columna izquierda: encabezado "Ingredients" + lista o texto de marcador de posición "Not available for this item" con un párrafo explicativo en Text Black Soft 14/400
- Columna derecha: encabezado "Nutrition" + filas de etiqueta/valor
- Cada fila: etiqueta de nutriente (Proxima Nova 14/400) a la izquierda, valor (p. ej., "140 calories", "25g", "205 mg**") a la derecha, separados por una línea de `1px solid #e7e7e7` debajo
- Nota a pie de página para marcadores de cafeína/asterisco en 13/400 Text Black Soft al final
- Patrón reutilizable para tablas de información nutricional que cumplen la normativa

**Selector de Disponibilidad en Tienda**
- Aparece en la banda feature verde oscuro sobre la fila de opciones de tamaño
- Rectángulo redondeado de ancho completo con interior blanco transparente
- Texto: "For item availability, choose a store" en blanco, 14/400
- Lado derecho: indicador de chevron hacia abajo + icono SVG de bolsa de compras en contorno blanco
- Radio: `4px`
- Altura: ~48px

**Migas de Pan del PDP**
- Ruta "Menu / Refreshers / Pink Energy Drink" sobre el título del producto
- Separador: carácter `/` barra en Text Black Soft
- La página actual no tiene enlace; las páginas anteriores son enlaces subrayados en verde acento
- Fuente: 14/400 Proxima Nova
- Aparece en todas las páginas del PDP

**Enlace de Chevron Atrás (sub-páginas de nutrición/detalle del PDP)**
- Enlace de texto "← Back" sobre los encabezados de sección en la página de nutrición
- Texto en Green Accent (`#00754A`) 14/700 Proxima Nova
- Chevron izquierdo `<` del mismo verde
- Alternativa al migas de pan completo en sub-páginas profundas

## 5. Principios de Diseño

### Sistema de Espaciado

Escala semántica basada en rem (anclada `1rem = 10px`):

| Token | Rem | Píxeles | Uso típico |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Padding en línea más ajustado |
| `--space-2` | `0.8rem` | 8px | Espacio pequeño, padding vertical de botón |
| `--space-3` | `1.6rem` | 16px | Predeterminado — padding de tarjeta, canaleta exterior xs |
| `--space-4` | `2.4rem` | 24px | Espaciado interior de sección, canaleta exterior md |
| `--space-5` | `3.2rem` | 32px | Espaciado mayor entre secciones |
| `--space-6` | `4rem` | 40px | Espacios grandes, canaleta exterior lg, canaleta de encabezado |
| `--space-7` | `4.8rem` | 48px | Espaciado de sección a sección |
| `--space-8` | `5.6rem` | 56px | Respiración muy amplia — altura del Frap |
| `--space-9` | `6.4rem` | 64px | Padding de sección más amplio |

**Tokens de canaleta:**
- `--outerGutter: 1.6rem` (16px, predeterminado / móvil)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, escritorio)

**Constante de ritmo universal:** `1.6rem` (16px) aparece en todas las páginas como la canaleta exterior predeterminada, la base del padding de tarjeta y el texto de cuerpo tamaño 3 — la unidad de espaciado más frecuente del sistema.

### Cuadrícula y Contenedor

- Escala de ancho de columna: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- La cuadrícula de tarjetas de regalo usa una cuadrícula responsive de 3 a 5 columnas con mosaicos de `~343px`
- Sección de estado de Rewards: 3 paneles verde oscuro en breakpoints `lg+`
- Hero: división asimétrica 40% (imagen) / 60% (contenido) mediante `--headerCrateProportion` / `--contentCrateProportion`

### Filosofía del Espacio en Blanco

El espacio en blanco transmite la sensación de "amplio espacio en el café". El padding de sección tiende a ser generoso (40–64px). Los bloques de contenido están separados por espacio en blanco en lugar de divisores. El lienzo crema (`#f2f0eb`) es en sí mismo un respiro visual entre las tarjetas blancas y las bandas feature verdes.

### Escala de Radio de Borde

| Valor | Uso |
|-------|-----|
| `12px` | Tarjetas, modales, mosaicos de elementos de menú (`--cardBorderRadius`) |
| `12px 12px 0 0` | Pestaña de feedback de ancho completo (solo parte superior redondeada) |
| `50px` | Todos los botones — radio de píldora completa (`--buttonBorderRadius`) |
| `50%` | Iconos circulares, botón flotante Frap, miniaturas de avatar |
| Especialidad | `3.3333%/5.298%` elíptico para maquetas de Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Tarjeta | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Tarjetas de contenido predeterminadas — sombra doble muy suave |
| Navegación Global | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Elevación suave de triple capa en la barra superior fija |
| Frap Base | `0 0 6px rgba(0,0,0,0.24)` | Halo base alrededor del CTA circular flotante |
| Frap Ambiental | `0 8px 12px rgba(0,0,0,0.14)` | Ambiental direccional apilada — hace flotar el Frap hacia adelante |
| Tarjeta de Regalo | Sombra suave alrededor de la fotografía ilustrada | Sensación de tarjeta física para los mosaicos de regalo |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Sombras SVG apiladas para las visuales de la Starbucks Card |

**Filosofía de sombras:** Susurradas y en capas sobre colores sólidos — el sistema nunca recurre a una única sombra pesada. En cambio, apila 2–3 sombras de alfa bajo con diferentes desplazamientos para simular la iluminación ambiental + directa del mundo real. El botón Frap es el elemento más elevado de cualquier página.

### Profundidad Decorativa

- **Sin sistema de degradados** — las superficies son bloques de color sólido
- **Las bandas en bloques de color** llevan la profundidad percibida (las bandas verde oscuro se leen como "zonas feature rehundidas" entre el cuerpo crema/blanco)
- **Las sombras de filtro SVG** en las visuales de la Starbucks Card añaden una ligera fisicalidad 3D sin una box-shadow

## 7. Lo Que Hay Que Hacer y Evitar

### Hacer
- Usar Neutral Warm (`#f2f0eb`) o Ceramic (`#edebe9`) como lienzo de página en lugar de blanco puro — el crema cálido es la firma
- Asignar los niveles de verde a su rol de superficie previsto — Starbucks Green para los encabezados, Green Accent para los CTAs, House Green para las bandas profundas, Uplift para los decorativos
- Mantener el tracking ajustado en `-0.01em` / `-0.16px` en SoDoSans en todo el sistema
- Usar el radio de píldora completa de 50px en cada botón sin excepción
- Aplicar `transform: scale(0.95)` como estado activo universal de los botones
- Reservar el Gold exclusivamente para los momentos de ceremonia de estado de Rewards
- Usar SoDoSans para casi todo; cambiar a la serif Lander Tall solo para los titulares editoriales de Rewards; reservar el script Kalam para los momentos de "nombre en el vaso" en Careers
- Apilar 2–3 sombras de alfa bajo en lugar de una sombra más pesada para la elevación
- Usar el CTA circular Frap como punto de entrada de orden flotante persistente en todas las superficies de compra
- Dejar que el lienzo crema respire entre tarjetas de contenido — usar espacio en blanco, no divisores

### No Hacer
- No usar blanco puro como lienzo de página — la temperatura del crema cálido es fundamental
- No elegir "un verde de marca" — el sistema de cuatro verdes es intencional; usar solo `#006241` en todos lados aplana la marca
- No usar Gold como acento de propósito general — es solo una señal de Rewards
- No cuadrar las esquinas de los botones — la píldora de 50px es universal
- No introducir rellenos con degradados — el sistema es completamente en bloques de color
- No diferenciar h1 y h2 por tamaño — la jerarquía viene del peso + color (600 Starbucks-Green vs 400 Text Black)
- No usar negro puro para el texto de cuerpo — `rgba(0,0,0,0.87)` iguala el lienzo cálido
- No omitir el feedback activo `scale(0.95)` en los botones — es una microinteracción característica
- No apilar sombras pesadas únicas; siempre capas de 2–3 de alfa bajo
- No introducir serifs o scripts en el flujo de compra principal — pertenecen a los contextos de Rewards y Careers respectivamente

## 8. Comportamiento Responsive

### Breakpoints

Inferidos de los tokens de ancho de componente y las alturas progresivas de la navegación:

| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| xs | < 480px | Navegación global 64px; menú hamburguesa; diseños de una columna; botones de píldora de ancho completo |
| Mobile | 480–767px | Navegación global 72px; cuadrícula de tarjetas de regalo 2 columnas; el padding de tarjeta se ajusta |
| Tablet | 768–1023px | Navegación global 83px; cuadrícula de tarjetas de regalo 3 columnas; comienza a aparecer la división hero |
| Desktop | 1024–1439px | Navegación global 99px; cuadrícula de tarjetas de regalo 4 columnas; hero asimétrico completo 40/60 |
| XLarge | 1440px+ | El contenido se limita a `--columnWidthXLarge`; cuadrícula de tarjetas de regalo 5 columnas; margen crema extra |

### Objetivos Táctiles

- Los botones de píldora con padding `7px 16px` miden ~32px de altura — por debajo del mínimo WCAG AAA de 44px para superficies solo táctiles. En móvil, el padding del botón puede expandirse visualmente para cumplir el mínimo.
- El botón circular flotante Frap de `56px` está muy por encima del mínimo.
- El Frap usa `--frapTouchOffset: calc(-1 * .8rem)` para extender el área de toque 8px más allá del borde visual.
- Las entradas de formulario con etiqueta flotante aumentan el tamaño de fuente de la etiqueta en móvil (base 1.6rem vs 1.9rem en escritorio) — más fácil de tocar y leer a distancia.

### Estrategia de Colapso

- **La altura de la navegación global escala progresivamente**: 64 → 72 → 83 → 99px en los breakpoints, no un único valor
- **La división hero se colapsa**: la división asimétrica 40/60 → apilada (imagen arriba, contenido abajo) en móvil
- **Cuadrícula de tarjetas de regalo**: 5 columnas → 4 → 3 → 2 → 1 en los breakpoints con anchos de tarjeta ajustados
- **Bandas feature**: Permanecen de ancho completo pero el texto + las imágenes se apilan verticalmente en móvil
- **La canaleta exterior escala**: 16px → 24px → 40px a medida que crece el viewport
- **Paneles de estado de Rewards de 3 columnas**: Se colapsan a una sola columna en móvil

### Comportamiento de Imágenes

- La fotografía hero de productos se recorta más verticalmente en móvil; el contenido se convierte en el ancla visual
- Las ilustraciones de tarjetas de regalo preservan la relación de aspecto; la cuadrícula de tarjetas se reorganiza
- Transición de fundido `opacity 0.3s ease-in` al cargar la imagen (evita una aparición brusca)
- La fotografía de la app de Rewards escalada proporcionalmente; nunca se estira

## 9. Guía de Prompts para el Agente

### Referencia Rápida de Colores

- CTA principal: "Green Accent (`#00754A`)"
- Texto del CTA principal: "White (`#ffffff`)"
- Encabezado de marca: "Starbucks Green (`#006241`)"
- Banda feature / pie de página: "House Green (`#1E3932`)"
- Lienzo de página: "Neutral Warm (`#f2f0eb`)"
- Lienzo de tarjeta: "White (`#ffffff`)"
- Texto de encabezado sobre claro: "Text Black (`rgba(0,0,0,0.87)`)"
- Texto de cuerpo sobre claro: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Texto de cuerpo sobre verde oscuro: "Text White Soft (`rgba(255,255,255,0.70)`)"
- Acento de Rewards: "Gold (`#cba258`)"
- Texto de Rewards: "Rewards Green (`#33433d`)"
- Destructivo: "Red (`#c82014`)"

### Ejemplos de Prompts de Componentes

1. "Crea un botón de píldora CTA principal de Starbucks con fondo Green Accent (`#00754A`), texto blanco 'Explore our afternoon menu', fuente SoDoSans a 16px peso 600 con interletraje `-0.01em`, `50px` border-radius (píldora completa), padding `7px 16px`. Aplica `transform: scale(0.95)` como estado activo con una transición `0.2s ease`."

2. "Diseña una tarjeta de contenido con fondo White (`#ffffff`) a `12px` border-radius, sombra en capas `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Rellena el contenido con `16–24px` (`--space-3` a `--space-4`). Colócala sobre un lienzo de página Neutral Warm (`#f2f0eb`) con `16px` de separación a los elementos adyacentes."

3. "Construye el botón de orden circular flotante Frap — `56px` de diámetro, relleno Green Accent (`#00754A`), icono de bolsa de compras blanca centrado. Sombra en capas: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Posición fija en la esquina inferior derecha con desplazamiento táctil de `-0.8rem`. El estado activo colapsa la sombra ambiental a `0 8px 12px rgba(0,0,0,0)` con `scale(0.95)`."

4. "Construye una banda feature verde oscuro — sección de ancho completo con fondo House Green (`#1E3932`). Columna izquierda: h2 SoDoSans blanco a 24px peso 600, seguido de un párrafo de cuerpo Text White Soft (`rgba(255,255,255,0.70)`) y una fila de CTA con dos botones (blanco relleno con texto Green Accent para el primario, Delineado sobre Oscuro contorno blanco para el secundario). Columna derecha: fotografía de producto. Proporción dividida 40/60, apilada verticalmente por debajo de `768px`."

5. "Crea una tarjeta de estado de Rewards — panel House Green (`#1E3932`) con `12px` border-radius, franja superior con degradado de color (nivel Bronze/Silver/Gold). Título en SoDoSans 24px peso 600 en blanco. Lista de beneficios como viñetas blancas con leyendas secundarias `rgba(255,255,255,0.70)`. Texto de progresión inferior en Text White Soft. Apila 3 paneles en una cuadrícula en `lg+`, una sola columna en móvil."

6. "Diseña un mosaico de tarjeta de regalo — el radio de la tarjeta coincide con `12px`, se rellena con una fotografía ilustrada (estilo acuarela pintada a mano) como superficie completa. Una sutil sombra la hace sentir como una tarjeta física sobre el lienzo crema. Agrúpala bajo una etiqueta de categoría ('Spring', 'Thank You', 'Birthday') en SoDoSans 24px peso 400 sobre la cuadrícula."

7. "Crea un encabezado de detalle de producto de Starbucks — banda House Green (`#1E3932`) con migas de pan 'Menu / Refreshers / Pink Energy Drink' en 14/400 blanco sobre el título del producto en SoDoSans 32/700 mayúsculas blancas. Fotografía del producto centrada bajo el título. Bajo la foto: una fila de selector de tamaño de 4 elementos — cada botón muestra una silueta de vaso vertical, nombre del tamaño ('Tall' / 'Grande' / 'Venti' / 'Trenta') en 16/700 blanco, y las onzas líquidas en 13/400 Text White Soft. El tamaño seleccionado envuelve el icono del vaso en un anillo circular `2px solid #00754A`."

8. "Construye un flujo de personalización de Starbucks — bajo el selector de tamaño, 3 filas de entrada de rectángulo delineado apiladas (fondo blanco, borde `1px solid #d6dbde`, radio `4px`). Cada una tiene una etiqueta flotante ('Add-ins', 'Milk', 'Add-ins') sobre el borde superior en 13/700 Text Black mayúsculas. Valor centrado (p. ej., 'Ice', 'Coconut'). Lado derecho: chevron hacia abajo en Text Black Soft. Para la fila de dosis, incrusta un stepper numérico (`−` `1` `+` con botones circulares `32px` delineados). Bajo los tres campos: píldora verde delineada 'Customize' con icono de destellos dorados, radio `50px`, padding `14px 40px`. Empareja con una píldora 'Add to Order' rellena Green Accent en la misma fila."

9. "Diseña una banda de descripción de producto de Starbucks — House Green (`#1E3932`) de ancho completo bajo el encabezado del producto. Arriba: una Píldora de Costo de Rewards '200★ item' con contorno dorado (radio `50px`, padding `4px 12px`, borde y texto dorado `#cba258`). Abajo: descripción del producto en blanco 16/400/1.5. Resumen nutricional en línea en blanco 14/700 ('140 calories, 25g sugar, 2.5g fat') con tooltip de icono de información. Botón de píldora blanco delineado sobre verde 'Full nutrition &amp; ingredients list'. Padding vertical de 32px."

10. "Crea una tabla de información nutricional de Starbucks — diseño de dos columnas dentro de una tarjeta blanca. Columna izquierda: encabezado 'Ingredients' (24/400 Text Black), seguido de la lista de ingredientes o párrafo de marcador de posición 'Not available for this item' en 14/400 Text Black Soft. Columna derecha: encabezado 'Nutrition', luego filas de etiqueta/valor (nombre del nutriente a la izquierda, valor a la derecha) separadas por líneas `1px solid #e7e7e7`. Tipografía: etiquetas en 14/400 Text Black, valores en 14/700 Text Black alineados a la derecha. Notas a pie de página con asterisco en 13/400 Text Black Soft al final."

### Guía de Iteración

Al refinar pantallas existentes generadas con este sistema de diseño:
1. Enfocarse en UN componente a la vez
2. Hacer referencia a los nombres de colores específicos y códigos hex de este documento
3. Usar descripciones en lenguaje natural ("lienzo crema cálido", "sistema de cuatro verdes") junto con valores exactos
4. Preservar la píldora de 50px + el estado activo `scale(0.95)` universalmente
5. Verificar que los verdes estén asignados a su rol correcto (Green Accent para CTA, Starbucks Green para encabezado, House Green para banda)
6. No introducir degradados — el sistema es en bloques de color
7. Mantener el tracking de SoDoSans en `-0.01em` / `-0.16px` en todo el sistema

### Lagunas Conocidas

- SoDoSans es una tipografía propietaria no disponible en Google Fonts — al implementar públicamente, usar Inter o Manrope como sustituto y documentar el cambio
- Lander Tall (la serif de Rewards) también es personalizada — sustituir con Iowan Old Style, Lora o Source Serif Pro
- Los tiempos de animación específicos por componente más allá de los pocos documentados (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) no están capturados para cada superficie interactiva
- El estilo completo del estado de error de formulario (peso del borde rojo, colocación del icono) visible en el token de tinte pero no extraído exhaustivamente
- Los componentes específicos de la página de Careers (tarjeta de nombre en el vaso, cuadrícula de radio de búsqueda) se mencionan en los nombres de los tokens pero no están cubiertos por esta extracción
- Las especificaciones detalladas de la maqueta de la Starbucks Visa Card / Starbucks-Card (SVC) están sugeridas por los tokens `--svcRoundedCorners` y `--svcShadowFilter` pero no están completamente documentadas
