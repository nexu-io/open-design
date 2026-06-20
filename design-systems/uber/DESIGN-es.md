# Design System Inspired by Uber

> Category: Medios y Consumo
> Plataforma de movilidad. Negro y blanco intensos, tipografía ajustada, energía urbana.

## 1. Tema Visual y Atmósfera

El lenguaje de diseño de Uber es una clase magistral de minimalismo seguro: un universo en blanco y negro donde cada píxel cumple un propósito y nada decora sin habérselo ganado. Toda la experiencia se construye sobre una dualidad radical: negro azabache (`#000000`) y blanco puro (`#ffffff`), con prácticamente ningún gris intermedio que diluya el mensaje. No es el minimalismo estéril de una startup que aún no ha terminado de diseñar, sino la contención deliberada de una marca tan consolidada que puede permitirse susurrar.

La tipografía característica, UberMove, es una sans-serif geométrica propietaria con una calidad claramente cuadrada e ingeniería. Los títulos en UberMove Bold a 52px tienen el peso de una valla publicitaria: autoritarios, directos, sin disculpas. La tipografía compañera UberMoveText gestiona el cuerpo del texto y los botones con un carácter ligeramente más suave y legible en peso medio (500). Juntas, crean un sistema tipográfico que parece un mapa de tránsito: claro, eficiente, construido para escanear a gran velocidad.

Lo que hace que el diseño de Uber sea verdaderamente distintivo es su uso de fotografías e ilustraciones a sangre completa combinadas con elementos interactivos en forma de píldora (999px de border-radius). Las chips de navegación, los botones CTA y los selectores de categoría comparten esta forma de cápsula, creando un lenguaje de interfaz táctil, amigable para el pulgar, inconfundiblemente Uber. Las ilustraciones, escenas cálidas y ligeramente estilizadas de conductores, pasajeros y paisajes urbanos, inyectan humanidad en lo que de otro modo podría ser un sistema frío y monocromático. El sitio alterna entre secciones de contenido en blanco y un pie de página totalmente negro, con diseños basados en tarjetas que usan las sombras más suaves posibles (rgba(0,0,0,0.12-0.16)) para crear una elevación sutil sin romper la estética plana.

**Características Clave:**
- Base en blanco y negro puro con prácticamente ningún gris intermedio en el cromo de la interfaz
- UberMove (títulos) + UberMoveText (cuerpo/UI): familia de sans-serif geométrica propietaria
- Todo en forma de píldora: botones, chips y elementos de navegación usan 999px de border-radius
- Ilustraciones cálidas y humanas que contrastan con la interfaz monocromática
- Diseño basado en tarjetas con sombras muy suaves (opacidad 0.12-0.16)
- Cuadrícula de espaciado de 8px con diseños compactos y de alta densidad de información
- Fotografía impactante integrada como fondos hero a ancho completo
- Pie de página negro que ancla la página en un entorno oscuro y de alto contraste

## 2. Paleta de Colores y Roles

### Primario
- **Uber Black** (`#000000`): El color de marca definitorio, usado en botones primarios, títulos, texto de navegación y el pie de página. No es "casi negro" ni "negro apagado", sino negro verdadero e inflexible.
- **Pure White** (`#ffffff`): El color de superficie principal y texto inverso. Usado en fondos de página, superficies de tarjetas y texto sobre elementos negros.

### Estados Interactivos y de Botón
- **Hover Gray** (`#e2e2e2`): Estado hover del botón blanco: un gris claro limpio y frío que proporciona retroalimentación clara sin calidez.
- **Hover Light** (`#f3f3f3`): Hover sutil para botones blancos elevados: gris apenas perceptible para una retroalimentación de interacción delicada.
- **Chip Gray** (`#efefef`): Fondo para botones secundarios/de filtro y chips de navegación: un gris neutro y ultraligero.

### Texto y Contenido
- **Body Gray** (`#4b4b4b`): Texto secundario y enlaces del pie de página: un gris medio auténtico sin sesgo cálido ni frío.
- **Muted Gray** (`#afafaf`): Texto terciario, enlaces del pie de página con menor énfasis y contenido de marcador de posición.

### Bordes y Separación
- **Border Black** (`#000000`): Bordes delgados de 1px para contención estructural, usados con moderación en separadores y contenedores de formularios.

### Sombras y Profundidad
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Elevación estándar de tarjeta: un levantamiento pluma para tarjetas de contenido.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Elevación ligeramente más fuerte para botones de acción flotantes y superposiciones.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Sombra interior para estados activos/presionados en botones secundarios.

### Estados de Enlace
- **Default Link Blue** (`#0000ee`): Azul estándar del navegador para enlaces de texto con subrayado, usado en contenido de cuerpo.
- **Link White** (`#ffffff`): Enlaces en superficies oscuras, usados en el pie de página y secciones oscuras.
- **Link Black** (`#000000`): Enlaces en superficies claras con decoración de subrayado.

### Sistema de Degradados
- El diseño de Uber es **completamente libre de degradados**. La dualidad negro/blanco y los bloques de color plano crean toda la jerarquía visual. No aparece ningún degradado en ninguna parte del sistema: cada superficie es un color sólido, cada transición es un borde duro o una sombra.

## 3. Reglas Tipográficas

### Familia Tipográfica
- **Título / Display**: `UberMove`, con alternativas: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Cuerpo / UI**: `UberMoveText`, con alternativas: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Nota: UberMove y UberMoveText son tipografías propietarias. Para implementaciones externas, usa `system-ui` o Inter como el sustituto disponible más cercano. El carácter geométrico y de proporciones cuadradas de UberMove puede aproximarse con Inter o DM Sans.*

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Notas |
|------|------|------|--------|-------------|-------|
| Display / Hero | UberMove | 52px (3.25rem) | 700 | 1.23 (ajustado) | Máximo impacto, presencia de valla publicitaria |
| Encabezado de Sección | UberMove | 36px (2.25rem) | 700 | 1.22 (ajustado) | Anclas de secciones principales |
| Título de Tarjeta | UberMove | 32px (2rem) | 700 | 1.25 (ajustado) | Encabezados de tarjetas y características |
| Subencabezado | UberMove | 24px (1.5rem) | 700 | 1.33 | Encabezados de sección secundarios |
| Encabezado Pequeño | UberMove | 20px (1.25rem) | 700 | 1.40 | Encabezados compactos, títulos de listas |
| Nav / UI Grande | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Enlaces de navegación, texto de UI prominente |
| Cuerpo / Botón | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Texto de cuerpo estándar, etiquetas de botones |
| Leyenda | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Metadatos, descripciones, enlaces pequeños |
| Micro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (relajado) | Letra pequeña, texto legal |

### Principios
- **Títulos en negrita, cuerpo en peso medio**: Los títulos con UberMove son exclusivamente de peso 700 (negrita): cada título impacta con fuerza de valla publicitaria. El cuerpo y el texto de UI con UberMoveText usan 400-500, creando una jerarquía visual clara mediante el contraste de peso.
- **Alturas de línea ajustadas en títulos**: Todos los títulos usan alturas de línea entre 1.22-1.40: compactos y contundentes, diseñados para escanear en lugar de leer.
- **Tipografía funcional**: No hay ningún tratamiento tipográfico decorativo. Sin espaciado de letras, sin text-transform, sin tamaños ornamentales. Cada elemento de texto cumple un propósito de comunicación directo.
- **Dos fuentes, roles estrictos**: UberMove es exclusivamente para títulos. UberMoveText es exclusivamente para cuerpo, botones, enlaces y UI. La frontera nunca se cruza.

## 4. Estilos de Componentes

### Botones

**Negro Primario (CTA)**
- Fondo: Uber Black (`#000000`)
- Texto: Pure White (`#ffffff`)
- Relleno: 10px 12px
- Radio: 999px (píldora completa)
- Contorno: ninguno
- Foco: anillo interior `rgb(255,255,255) 0px 0px 0px 2px`
- El botón de acción principal: audaz, de alto contraste, imposible de ignorar

**Blanco Secundario**
- Fondo: Pure White (`#ffffff`)
- Texto: Uber Black (`#000000`)
- Relleno: 10px 12px
- Radio: 999px (píldora completa)
- Hover: el fondo cambia a Hover Gray (`#e2e2e2`)
- Foco: el fondo cambia a Hover Gray, aparece el anillo interior
- Usado en superficies oscuras o como acción secundaria junto al Negro Primario

**Chip / Filtro**
- Fondo: Chip Gray (`#efefef`)
- Texto: Uber Black (`#000000`)
- Relleno: 14px 16px
- Radio: 999px (píldora completa)
- Activo: sombra interior `rgba(0,0,0,0.08)`
- Chips de navegación, selectores de categoría, controles de filtro

**Acción Flotante**
- Fondo: Pure White (`#ffffff`)
- Texto: Uber Black (`#000000`)
- Relleno: 14px
- Radio: 999px (píldora completa)
- Sombra: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` desplazamiento leve
- Hover: el fondo cambia a `#f3f3f3`
- Controles de mapa, volver arriba, CTAs flotantes

### Tarjetas y Contenedores
- Fondo: Pure White (`#ffffff`) en páginas blancas; sin diferenciación distinta del fondo de tarjeta
- Borde: ninguno por defecto: las tarjetas se definen por sombra, no por trazo
- Radio: 8px para tarjetas de contenido estándar; 12px para tarjetas destacadas/promocionadas
- Sombra: `rgba(0,0,0,0.12) 0px 4px 16px 0px` para elevación estándar
- Las tarjetas son densas en contenido con un relleno interno mínimo
- Las tarjetas encabezadas por imagen usan imágenes a sangre completa con texto superpuesto o debajo

### Entradas y Formularios
- Texto: Uber Black (`#000000`)
- Fondo: Pure White (`#ffffff`)
- Borde: 1px sólido Negro (`#000000`): el único lugar donde los bordes visibles aparecen de forma prominente
- Radio: 8px
- Relleno: espaciado cómodo estándar
- Foco: sin estado de foco personalizado extraído: depende del anillo de foco estándar del navegador

### Navegación
- Navegación superior fija con fondo blanco
- Logo: marca/icono de Uber en 24x24px en negro
- Enlaces: UberMoveText a 14-18px, peso 500, en Uber Black
- Chips de navegación en forma de píldora con fondo Chip Gray (`#efefef`) para la navegación por categorías ("Ride", "Drive", "Business", "Uber Eats")
- Alternador de menú: botón circular con border-radius del 50%
- Móvil: patrón de menú hamburguesa

### Tratamiento de Imágenes
- Escenas ilustradas a mano y cálidas (no fotografías para las secciones de características)
- Estilo de ilustración: personas ligeramente estilizadas, paleta de colores cálidos dentro de las ilustraciones, vibración contemporánea
- Las secciones hero usan fotografía o ilustración impactante como fondos a ancho completo
- Códigos QR para CTAs de descarga de la aplicación
- Todas las imágenes usan border-radius estándar de 8px o 12px cuando están contenidas en tarjetas

### Componentes Distintivos

**Navegación por Categorías en Píldora**
- Fila horizontal de botones en forma de píldora para la navegación de nivel superior ("Ride", "Drive", "Business", "Uber Eats", "About")
- Cada píldora: fondo Chip Gray, texto negro, radio 999px
- El estado activo se indica con fondo negro y texto blanco (inversión)

**Hero con Acción Dual**
- Hero dividido: texto/CTA a la izquierda, mapa/ilustración a la derecha
- Dos campos de entrada lado a lado para recogida/destino
- Botón CTA "See prices" en píldora negra

**Tarjetas de Planificación Anticipada**
- Tarjetas que promocionan funciones como "Uber Reserve" y la planificación de viajes
- Densas en ilustraciones con imágenes cálidas y centradas en las personas
- Botones CTA negros con texto blanco en la parte inferior

## 5. Principios de Diseño

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Relleno de botones: 10px 12px (compacto) o 14px 16px (cómodo)
- Relleno interno de tarjetas: aproximadamente 24-32px
- Espaciado vertical de secciones: generoso pero eficiente, aproximadamente 64-96px entre secciones principales

### Cuadrícula y Contenedor
- Ancho máximo del contenedor: aproximadamente 1136px, centrado
- Hero: diseño dividido con texto a la izquierda, visual a la derecha
- Secciones de características: cuadrículas de tarjetas en 2 columnas o columna única a ancho completo
- Pie de página: cuadrícula de enlaces en múltiples columnas sobre fondo negro
- Secciones a ancho completo que se extienden hasta los bordes del viewport

### Filosofía del Espacio en Blanco
- **Eficiente, no aireado**: El espacio en blanco de Uber es funcional: suficiente para separar, nunca tanto que se sienta vacío. Es el espaciado de un sistema de tránsito: compacto, claro, orientado a un propósito.
- **Tarjetas densas en contenido**: Las tarjetas empaquetan información de forma compacta con un espaciado interno mínimo, apoyándose en la sombra y el radio para definir límites.
- **Espacio de respiración entre secciones**: Las secciones principales tienen un generoso espaciado vertical, pero dentro de las secciones, los elementos están agrupados de forma estrecha.

### Escala de Radio de Borde
- Agudo (0px): No se usan esquinas cuadradas en elementos interactivos
- Estándar (8px): Tarjetas de contenido, campos de entrada, listboxes
- Cómodo (12px): Tarjetas destacadas, contenedores más grandes, tarjetas de enlace
- Píldora Completa (999px): Todos los botones, chips, elementos de navegación, píldoras
- Círculo (50%): Imágenes de avatar, contenedores de iconos, controles circulares

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra, fondo sólido | Fondo de página, contenido en línea, secciones de texto |
| Sutil (Nivel 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Tarjetas de contenido estándar, bloques de características |
| Medio (Nivel 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Tarjetas elevadas, elementos de superposición |
| Flotante (Nivel 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Botones de acción flotantes, controles de mapa |
| Presionado (Nivel 4) | `rgba(0,0,0,0.08) inset` (extensión 999px) | Estados de botón activo/presionado |
| Anillo de Foco | `rgb(255,255,255) 0px 0px 0px 2px inset` | Indicadores de foco de teclado |

**Filosofía de Sombras**: Uber usa las sombras únicamente como herramienta estructural, nunca de forma decorativa. Las sombras siempre son negras a una opacidad muy baja (0.08-0.16), creando el levantamiento mínimo necesario para separar las capas de contenido. Los radios de desenfoque son moderados (8-16px): suficientes para sentirse naturales, pero nunca dramáticos. No hay sombras de colores, pilas de sombras en capas ni efectos de resplandor ambiental. La profundidad se comunica más a través del contraste de sección negro/blanco que a través de la elevación de sombras.

## 7. Qué Hacer y Qué No Hacer

### Hacer
- Usar negro verdadero (`#000000`) y blanco puro (`#ffffff`) como la paleta principal: el contraste marcado ES Uber
- Usar 999px de border-radius para todos los botones, chips y elementos de navegación en forma de píldora
- Mantener todos los títulos en UberMove Bold (700) para un impacto de nivel de valla publicitaria
- Usar sombras muy suaves (opacidad 0.12-0.16) para la elevación de tarjetas: apenas visibles
- Mantener el estilo de diseño compacto y de alta densidad de información: Uber prioriza la eficiencia sobre lo aireado
- Usar ilustraciones cálidas y centradas en las personas para suavizar la interfaz monocromática
- Aplicar radio de 8px para tarjetas de contenido y 12px para contenedores destacados
- Usar UberMoveText en peso 500 para la navegación y el texto de UI prominente
- Combinar botones primarios negros con botones secundarios blancos para diseños de acción dual

### No Hacer
- No introducir color en el cromo de la interfaz: la interfaz de Uber es estrictamente negro, blanco y gris
- No usar esquinas redondeadas de menos de 999px en los botones: la forma de píldora completa es un elemento de identidad central
- No aplicar sombras pesadas o de proyección con alta opacidad: la profundidad es sutilísima
- No usar tipografías serif en ningún lugar: la tipografía de Uber es exclusivamente sans-serif geométrica
- No crear diseños aireados y espaciosos con excesivo espacio en blanco: la densidad de Uber es intencional
- No usar degradados ni superposiciones de color: cada superficie es un color plano y sólido
- No mezclar UberMove en el texto del cuerpo ni UberMoveText en los títulos: la jerarquía es estricta
- No usar bordes decorativos: los bordes son funcionales (entradas, separadores) o están ausentes
- No suavizar el contraste negro/blanco con blancos apagados o negros casi puros: la dualidad es deliberada

## 8. Comportamiento Responsive

### Puntos de Quiebre
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil Pequeño | 320px | Diseño mínimo, columna única, entradas apiladas, tipografía compacta |
| Móvil | 600px | Móvil estándar, diseño apilado, nav hamburguesa |
| Tablet Pequeña | 768px | Las cuadrículas de dos columnas comienzan, diseños de tarjeta expandidos |
| Tablet | 1119px | Diseño completo de tablet, contenido hero en paralelo |
| Escritorio Pequeño | 1120px | La cuadrícula de escritorio se activa, pills de nav horizontales |
| Escritorio | 1136px | Diseño completo de escritorio, ancho máximo del contenedor, hero dividido |

### Objetivos Táctiles
- Todos los botones en forma de píldora: altura mínima de 44px (relleno vertical de 10-14px + altura de línea)
- Chips de navegación: relleno generoso de 14px 16px para toques cómodos con el pulgar
- Controles circulares (menú, cerrar): el radio del 50% garantiza objetivos grandes y fáciles de pulsar
- Las superficies de tarjeta sirven como objetivos táctiles de área completa en móvil

### Estrategia de Colapso
- **Navegación**: La nav de pills horizontal colapsa a menú hamburguesa con alternador circular
- **Hero**: El diseño dividido (texto + mapa/visual) se apila en columna única: texto arriba, visual abajo
- **Campos de entrada**: Las entradas de recogida/destino en paralelo se apilan verticalmente
- **Tarjetas de características**: La cuadrícula de 2 columnas colapsa a tarjetas apiladas a ancho completo
- **Títulos**: El display de 52px escala hacia abajo a través de 36px, 32px, 24px, 20px
- **Pie de página**: La cuadrícula de enlaces en múltiples columnas colapsa a acordeón o columna única apilada
- **Chips de categoría**: Desplazamiento horizontal con overflow en pantallas más pequeñas

### Comportamiento de Imágenes
- Las ilustraciones se escalan proporcionalmente dentro de sus contenedores
- Las imágenes hero mantienen la relación de aspecto y pueden recortarse en pantallas más pequeñas
- Las secciones de código QR se ocultan en móvil (la descarga de la aplicación cambia a enlaces directos a la tienda)
- Las imágenes de tarjeta mantienen el border-radius de 8-12px en todos los tamaños

## 9. Guía para Prompts de Agente

### Referencia Rápida de Colores
- Botón Primario: "Uber Black (#000000)"
- Fondo de Página: "Pure White (#ffffff)"
- Texto del Botón (sobre negro): "Pure White (#ffffff)"
- Texto del Botón (sobre blanco): "Uber Black (#000000)"
- Texto Secundario: "Body Gray (#4b4b4b)"
- Texto Terciario: "Muted Gray (#afafaf)"
- Fondo de Chip: "Chip Gray (#efefef)"
- Estado Hover: "Hover Gray (#e2e2e2)"
- Sombra de Tarjeta: "rgba(0,0,0,0.12) 0px 4px 16px"
- Fondo del Pie de Página: "Uber Black (#000000)"

### Ejemplos de Prompts para Componentes
- "Crea una sección hero sobre Pure White (#ffffff) con un título a 52px UberMove Bold (700), line-height 1.23. Usa texto Uber Black (#000000). Añade un subtítulo en Body Gray (#4b4b4b) a 16px UberMoveText peso 400 con line-height 1.50. Coloca un botón CTA en forma de píldora Uber Black (#000000) con texto Pure White, radio 999px, relleno 10px 12px."
- "Diseña una barra de navegación por categorías con botones en forma de píldora horizontales. Cada píldora: fondo Chip Gray (#efefef), texto Uber Black (#000000), relleno 14px 16px, border-radius 999px. La píldora activa invierte a fondo Uber Black con texto Pure White. Usa UberMoveText a 14px peso 500."
- "Construye una tarjeta de característica sobre Pure White (#ffffff) con border-radius de 8px y sombra rgba(0,0,0,0.12) 0px 4px 16px. Título en UberMove a 24px peso 700, descripción en Body Gray (#4b4b4b) a 16px UberMoveText. Añade un botón CTA en forma de píldora negra en la parte inferior."
- "Crea un pie de página oscuro sobre Uber Black (#000000) con texto de encabezado Pure White (#ffffff) en UberMove a 20px peso 700. Enlaces del pie de página en Muted Gray (#afafaf) a 14px UberMoveText. Los enlaces cambian a Pure White al hacer hover. Diseño de cuadrícula en múltiples columnas."
- "Diseña un botón de acción flotante con fondo Pure White (#ffffff), radio 999px, relleno 14px y sombra rgba(0,0,0,0.16) 0px 2px 8px. Al hacer hover, el fondo cambia a #f3f3f3. Úsalo para volver arriba o controles de mapa."

### Guía de Iteración
1. Céntrate en UN componente a la vez
2. Referencia la paleta estricta de negro/blanco: "usa Uber Black (#000000)" en lugar de "hazlo oscuro"
3. Especifica siempre 999px de radio para botones y píldoras: esto no es negociable para la identidad de Uber
4. Describe la familia tipográfica explícitamente: "UberMove Bold para el título, UberMoveText Medium para la etiqueta"
5. Para las sombras, usa "sombra susurro (rgba(0,0,0,0.12) 0px 4px 16px)": nunca sombras de proyección pesadas
6. Mantén los diseños compactos y de alta densidad de información: Uber es eficiente, no aireado
7. Las ilustraciones deben ser cálidas y humanas: describe "personas estilizadas en tonos cálidos" en lugar de formas abstractas
8. Combina CTAs negros con secundarios blancos para diseños de acción dual equilibrados
