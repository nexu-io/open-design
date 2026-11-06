# Design System Inspired by IBM

> Category: Media & Consumer
> Tecnología empresarial. Sistema de diseño Carbon, paleta de azules estructurada.

## 1. Tema Visual y Atmósfera

El sitio web de IBM es la encarnación digital de la autoridad corporativa construida sobre el Carbon Design System — un lenguaje de diseño tan metódicamente estructurado que se lee como una especificación de ingeniería renderizada como página web. La página opera sobre una dualidad marcada: un lienzo en blanco puro (`#ffffff`) con texto casi negro (`#161616`), puntuado por un único acento inmutable — IBM Blue 60 (`#0f62fe`). Esto no es el minimalismo juguetón de una startup tecnológica; es precisión corporativa destilada en píxeles. Cada elemento existe dentro de la rígida cuadrícula 2x de Carbon, cada color se corresponde con un token semántico, cada valor de espaciado se alinea a la unidad base de 8px.

La familia tipográfica IBM Plex es la columna vertebral del sistema. IBM Plex Sans en peso ligero (300) para titulares de presentación crea una calidad inesperadamente aérea, casi delicada a tamaños grandes — un contrapunto deliberado a la gravedad corporativa de IBM. En tamaños de cuerpo, el peso regular (400) con un interletraje de 0.16px en textos de 14px introduce el micro-tracking meticuloso que hace que el texto Carbon parezca ingenierado más que diseñado. IBM Plex Mono sirve para código, datos y etiquetas técnicas, completando la trinidad de la familia junto al raramente empleado IBM Plex Serif.

Lo que define la identidad visual de IBM más allá del monocromático-más-azul es la dependencia del sistema de tokens de componentes de Carbon. Cada estado interactivo se corresponde con una propiedad personalizada CSS con el prefijo `--cds-` (Carbon Design System). Los botones no tienen colores codificados de forma fija; referencian `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Esta arquitectura tokenizada significa que toda la capa visual es una delgada capa sobre una base profundamente sistemática — el equivalente en diseño de una API bien tipada.

**Características Clave:**
- IBM Plex Sans en peso 300 (Light) para presentación — gravedad corporativa a través de la contención tipográfica
- IBM Plex Mono para código y contenido técnico con interletraje constante de 0.16px en tamaños pequeños
- Color de acento único: IBM Blue 60 (`#0f62fe`) — cada elemento interactivo, cada CTA, cada enlace
- Sistema de tokens Carbon (`--cds-*`) que gobierna todos los colores semánticos, permitiendo el cambio de tema a nivel de variable
- Cuadrícula de espaciado de 8px con adherencia estricta — sin valores arbitrarios, todo se alinea
- Tarjetas planas sin borde sobre superficie Gray 10 `#f4f4f4` — profundidad mediante capas de color de fondo, no sombras
- Inputs con borde inferior (no recuadros) — el patrón de formulario característico de Carbon
- Radio de borde 0px en botones primarios — rectangulares sin concesiones, sin suavizados

## 2. Paleta de Colores y Roles

### Primarios
- **IBM Blue 60** (`#0f62fe`): El único color interactivo. Botones primarios, enlaces, estados de foco, indicadores activos. Es el único matiz cromático en la paleta principal de la interfaz.
- **White** (`#ffffff`): Fondo de página, superficies de tarjetas, texto de botones sobre azul, `--cds-background`.
- **Gray 100** (`#161616`): Texto principal, encabezados, fondos de superficie oscura, barra de navegación, pie de página. `--cds-text-primary`.

### Escala Neutral (Familia de Grises)
- **Gray 100** (`#161616`): Texto principal, encabezados, cromo oscuro de la interfaz, fondo del pie de página.
- **Gray 90** (`#262626`): Superficies oscuras secundarias, estados hover sobre fondos oscuros.
- **Gray 80** (`#393939`): Oscuro terciario, estados activos.
- **Gray 70** (`#525252`): Texto secundario, texto de ayuda, descripciones. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Texto de marcador de posición, texto deshabilitado.
- **Gray 50** (`#8d8d8d`): Iconos deshabilitados, etiquetas atenuadas.
- **Gray 30** (`#c6c6c6`): Bordes, líneas divisorias, bordes inferiores de inputs. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Bordes sutiles, contornos de tarjetas.
- **Gray 10** (`#f4f4f4`): Fondo de superficie secundaria, rellenos de tarjetas, filas alternas. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Estado hover para superficies Gray 10.

### Interactivos
- **Blue 60** (`#0f62fe`): Interactivo primario — botones, enlaces, foco. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Estado hover de enlace. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Estado activo/presionado para elementos azules.
- **Blue 10** (`#edf5ff`): Superficie de tinte azul, fondo de fila seleccionada.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — borde inset de 2px en elementos enfocados.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — anillo interior blanco para foco sobre fondos oscuros.

### Soporte y Estado
- **Red 60** (`#da1e28`): Error, peligro. `--cds-support-error`.
- **Green 50** (`#24a148`): Éxito. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Advertencia. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informativo. `--cds-support-info`.

### Tema Oscuro (Tema Gray 100)
- **Fondo**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Superficies de tarjetas y contenedores.
- **Layer 02**: Gray 80 (`#393939`). Superficies elevadas.
- **Texto Principal**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Texto Secundario**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Borde Sutil**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interactivo**: Blue 40 (`#78a9ff`). Los enlaces y elementos interactivos se vuelven más claros para mantener el contraste.

## 3. Reglas Tipográficas

### Familia Tipográfica
- **Principal**: `IBM Plex Sans`, con alternativas: `Helvetica Neue, Arial, sans-serif`
- **Monoespaciada**: `IBM Plex Mono`, con alternativas: `Menlo, Courier, monospace`
- **Serif** (uso limitado): `IBM Plex Serif`, para contextos editoriales/expresivos
- **Fuente de Iconos**: `ibm_icons` — glifos de iconos propietarios a 20px

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Interletraje | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Máximo impacto, peso ligero para elegancia |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Hero secundario, alternativa responsiva |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Encabezado expresivo |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Encabezados de sección |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Títulos de subsección |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Títulos de tarjetas, encabezados de características |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Encabezados de tarjetas más ligeros |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Texto de lectura estándar |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Cuerpo enfatizado, etiquetas |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Cuerpo compacto, pies de foto |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Pies de foto en negrita, elementos de navegación |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadatos, marcas de tiempo |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Código en línea, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Bloques de código |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Hero mono decorativo |

### Principios
- **Peso ligero en tamaños de presentación**: El conjunto tipográfico expresivo de Carbon utiliza peso 300 (Light) a partir de 42px. Esto crea una tensión distintiva — el contenido habla con autoridad corporativa mientras las letras susurran con ligereza tipográfica.
- **Micro-tracking en tamaños pequeños**: 0.16px de interletraje a 14px y 0.32px a 12px. Estos valores aparentemente insignificantes son el arma secreta de Carbon para la legibilidad en tamaños compactos — abren las apretadas letras de IBM Plex justo lo suficiente.
- **Tres pesos funcionales**: 300 (presentación/expresivo), 400 (cuerpo/lectura), 600 (énfasis/etiquetas de interfaz). El peso 700 está intencionalmente ausente de la escala tipográfica de producción.
- **Productivo vs. Expresivo**: Los conjuntos productivos utilizan alturas de línea más ajustadas (1.29) para interfaces densas. Los expresivos respiran más (1.40-1.50) para contenido de marketing y editorial.

## 4. Estilos de Componentes

### Botones

**Botón Primario (Azul)**
- Fondo: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Texto: `#ffffff` (White)
- Relleno: 14px 63px 14px 15px (asimétrico — espacio para icono al final)
- Borde: 1px solid transparent
- Radio de borde: 0px (rectángulo nítido — la firma de Carbon)
- Altura: 48px (predeterminado), 40px (compacto), 64px (expresivo)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Activo: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Foco: `2px solid #0f62fe` inset + `1px solid #ffffff` interior

**Botón Secundario (Gris)**
- Fondo: `#393939` (Gray 80)
- Texto: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Activo: `#6f6f6f` (Gray 60)
- Mismo relleno/radio que el primario

**Botón Terciario (Ghost Azul)**
- Fondo: transparent
- Texto: `#0f62fe` (Blue 60)
- Borde: 1px solid `#0f62fe`
- Hover: texto `#0353e9` + tinte de fondo Blue 10
- Radio de borde: 0px

**Botón Ghost**
- Fondo: transparent
- Texto: `#0f62fe` (Blue 60)
- Relleno: 14px 16px
- Borde: none
- Hover: tinte de fondo `#e8e8e8`

**Botón de Peligro**
- Fondo: `#da1e28` (Red 60)
- Texto: `#ffffff`
- Hover: `#b81921` (Red 70)

### Tarjetas y Contenedores
- Fondo: `#ffffff` en tema claro, `#f4f4f4` (Gray 10) para tarjetas elevadas
- Borde: none (diseño plano — sin borde ni sombra en la mayoría de tarjetas)
- Radio de borde: 0px (coherente con la estética rectangular de los botones)
- Hover: el fondo cambia a `#e8e8e8` (Gray 10 Hover) para tarjetas clicables
- Relleno de contenido: 16px
- Separación: capas de color de fondo (blanco → gray 10 → blanco) en lugar de sombras

### Inputs y Formularios
- Fondo: `#f4f4f4` (Gray 10) — `--cds-field`
- Texto: `#161616` (Gray 100)
- Relleno: 0px 16px (solo horizontal)
- Altura: 40px (predeterminado), 48px (grande)
- Borde: sin bordes en los lados/parte superior — `2px solid transparent` en la parte inferior
- Borde inferior activo: `2px solid #161616` (Gray 100)
- Foco: `2px solid #0f62fe` (Blue 60) borde inferior — `--cds-focus`
- Error: `2px solid #da1e28` (Red 60) borde inferior
- Etiqueta: 12px IBM Plex Sans, interletraje 0.32px, Gray 70
- Texto de ayuda: 12px, Gray 60
- Marcador de posición: Gray 60 (`#6f6f6f`)
- Radio de borde: 0px (parte superior) — los inputs tienen esquinas nítidas

### Navegación
- Fondo: `#161616` (Gray 100) — masthead oscuro a ancho completo
- Altura: 48px
- Logo: logo IBM de 8 barras, blanco sobre oscuro, alineado a la izquierda
- Enlaces: 14px IBM Plex Sans, peso 400, `#c6c6c6` (Gray 30) predeterminado
- Hover de enlace: texto `#ffffff`
- Enlace activo: `#ffffff` con indicador de borde inferior
- Selector de plataforma: pestañas horizontales alineadas a la izquierda
- Búsqueda: campo de búsqueda desplegable activado por icono
- Móvil: hamburguesa con panel deslizante desde la izquierda

### Enlaces
- Predeterminado: `#0f62fe` (Blue 60) sin subrayado
- Hover: `#0043ce` (Blue 70) con subrayado
- Visitado: permanece Blue 60 (sin cambio de estado visitado)
- Enlaces en línea: subrayados por defecto en el cuerpo del texto

### Componentes Distintivos

**Bloque de Contenido (Hero/Destacado)**
- Bandas de fondo alternas blanco/gray-10 a ancho completo
- Titular alineado a la izquierda con tipo de presentación de 60px o 48px
- CTA como botón primario azul con icono de flecha
- Imagen/ilustración alineada a la derecha o debajo en móvil

**Tile (Tarjeta Clicable)**
- Fondo: `#f4f4f4` o `#ffffff`
- Borde inferior a ancho completo o cambio de fondo en hover
- Icono de flecha en la esquina inferior derecha al hacer hover
- Sin sombra — la planitud es la identidad

**Tag / Etiqueta**
- Fondo: color contextual al 10% de opacidad (ej., Blue 10, Red 10)
- Texto: color correspondiente de grado 60
- Relleno: 4px 8px
- Radio de borde: 24px (píldora — excepción a la regla de 0px)
- Fuente: 12px peso 400

**Banner de Notificación**
- Barra a ancho completo, normalmente con fondo Blue 60 o Gray 100
- Texto blanco, 14px
- Icono de cierre/desestimar alineado a la derecha

## 5. Principios de Maquetación

### Sistema de Espaciado
- Unidad base: 8px (cuadrícula 2x de Carbon)
- Escala de espaciado de componentes: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Escala de espaciado de maquetación: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Mini unidad: 8px (espaciado mínimo utilizable)
- Relleno dentro de componentes: típicamente 16px
- Separación entre tarjetas/tiles: 1px (línea de pelo) o 16px (estándar)

### Cuadrícula y Contenedor
- Cuadrícula de 16 columnas (sistema de cuadrícula 2x de Carbon)
- Ancho máximo de contenido: 1584px (punto de quiebre máximo)
- Canales de columna: 32px (16px en móvil)
- Margen: 16px (móvil), 32px (tablet+)
- El contenido abarca típicamente 8-12 columnas para longitudes de línea legibles
- Las secciones a sangrado completo alternan con contenido contenido

### Filosofía de Espacio en Blanco
- **Densidad funcional**: Carbon favorece la densidad productiva sobre el espacio en blanco expansivo. Las secciones están más compactadas que en los sistemas de diseño para consumo — esto refleja el ADN empresarial de IBM.
- **Zonificación por color de fondo**: En lugar de un gran relleno entre secciones, IBM utiliza colores de fondo alternos (blanco → gray 10 → blanco) para crear separación visual con un mínimo de espacio vertical.
- **Ritmo constante de 48px**: Las transiciones entre secciones principales utilizan 48px de espaciado vertical. Las secciones hero pueden usar 80px–96px.

### Escala de Radio de Borde
- **0px**: Botones primarios, inputs, tiles, tarjetas — el tratamiento dominante. Carbon es fundamentalmente rectangular.
- **2px**: Ocasionalmente en pequeños elementos interactivos (etiquetas)
- **24px**: Tags/etiquetas (forma de píldora — la única excepción redondeada)
- **50%**: Círculos de avatar, contenedores de iconos

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra, fondo `#ffffff` | Superficie de página predeterminada |
| Layer 01 | Sin sombra, fondo `#f4f4f4` | Tarjetas, tiles, secciones alternas |
| Layer 02 | Sin sombra, fondo `#e0e0e0` | Paneles elevados dentro de Layer 01 |
| Elevado | `0 2px 6px rgba(0,0,0,0.3)` | Desplegables, tooltips, menús adicionales |
| Superposición | `0 2px 6px rgba(0,0,0,0.3)` + velo oscuro | Diálogos modales, paneles laterales |
| Foco | `2px solid #0f62fe` inset + `1px solid #ffffff` | Anillo de foco con teclado |
| Borde inferior | `2px solid #161616` en el borde inferior | Input activo, indicador de pestaña activa |

**Filosofía de Sombras**: Carbon es deliberadamente reacio a las sombras. IBM logra profundidad principalmente mediante capas de color de fondo — apilando superficies de grises progresivamente más oscuros en lugar de agregar box-shadows. Esto crea una estética plana, inspirada en la imprenta, donde la jerarquía se comunica a través del valor del color, no de la luz simulada. Las sombras se reservan exclusivamente para elementos flotantes (desplegables, tooltips, modales) donde el elemento realmente superpone contenido. Esta contención otorga a la escasa sombra un impacto significativo — cuando algo flota en Carbon, importa.

## 7. Lo Que Se Debe y No Se Debe Hacer

### Hacer
- Usar IBM Plex Sans en peso 300 para tamaños de presentación (42px+) — la ligereza es intencional
- Aplicar 0.16px de interletraje en texto de cuerpo de 14px y 0.32px en pies de foto de 12px
- Usar radio de borde 0px en botones, inputs, tarjetas y tiles — los rectángulos son el sistema
- Referenciar los nombres de token `--cds-*` al implementar (ej., `--cds-button-primary`, `--cds-text-primary`)
- Usar capas de color de fondo (blanco → gray 10 → gray 20) para la profundidad en lugar de sombras
- Usar borde inferior (no recuadro) para los indicadores de campos de input
- Mantener la altura de botón predeterminada de 48px y el relleno asimétrico para acomodar iconos
- Aplicar Blue 60 (`#0f62fe`) como único acento — un solo azul para gobernarlos a todos

### No Hacer
- No redondear las esquinas de los botones — el radio 0px es la identidad de Carbon
- No usar sombras en tarjetas o tiles — la planitud es el punto
- No introducir colores de acento adicionales — el sistema de IBM es monocromático + azul
- No usar peso 700 (Bold) — la escala se detiene en 600 (Semibold)
- No agregar interletraje al texto de tamaño de presentación — el tracking es solo para 14px e inferiores
- No recuadrar los inputs con bordes completos — los inputs de Carbon usan solo borde inferior
- No usar fondos degradados — las superficies de IBM son colores planos y sólidos
- No desviarse de la cuadrícula de espaciado de 8px — cada valor debe ser divisible por 8 (con 2px y 4px para micro-ajustes)

## 8. Comportamiento Responsivo

### Puntos de Quiebre
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Small (sm) | 320px | Columna única, navegación hamburguesa, márgenes de 16px |
| Medium (md) | 672px | Comienzan cuadrículas de 2 columnas, contenido expandido |
| Large (lg) | 1056px | Navegación completa visible, cuadrículas de 3-4 columnas |
| X-Large (xlg) | 1312px | Densidad máxima de contenido, maquetaciones anchas |
| Max | 1584px | Ancho máximo de contenido, centrado con márgenes |

### Áreas de Toque
- Altura de botón: 48px predeterminado, mínimo 40px (compacto)
- Enlaces de navegación: altura de fila de 48px para toque
- Altura de input: 40px predeterminado, 48px grande
- Botones de icono: área de toque cuadrada de 48px
- Elementos del menú móvil: filas a ancho completo de 48px

### Estrategia de Colapso
- Hero: presentación de 60px → 42px → encabezado de 32px a medida que el viewport se estrecha
- Navegación: masthead horizontal completo → hamburguesa con panel deslizante
- Cuadrícula: 4 columnas → 2 columnas → columna única
- Tiles/tarjetas: cuadrícula horizontal → pila vertical
- Imágenes: mantener proporción de aspecto, max-width 100%
- Pie de página: grupos de enlaces multicolumna → columna única apilada
- Relleno de sección: 48px → 32px → 16px

### Comportamiento de Imágenes
- Imágenes responsivas con `max-width: 100%`
- Las ilustraciones de productos se escalan proporcionalmente
- Las imágenes hero pueden pasar de lado a lado a apiladas debajo
- Las visualizaciones de datos mantienen la proporción de aspecto con desplazamiento horizontal en móvil

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Colores
- CTA principal: IBM Blue 60 (`#0f62fe`)
- Fondo: White (`#ffffff`)
- Texto de encabezado: Gray 100 (`#161616`)
- Texto de cuerpo: Gray 100 (`#161616`)
- Texto secundario: Gray 70 (`#525252`)
- Superficie/Tarjeta: Gray 10 (`#f4f4f4`)
- Borde: Gray 30 (`#c6c6c6`)
- Enlace: Blue 60 (`#0f62fe`)
- Hover de enlace: Blue 70 (`#0043ce`)
- Anillo de foco: Blue 60 (`#0f62fe`)
- Error: Red 60 (`#da1e28`)
- Éxito: Green 50 (`#24a148`)

### Ejemplos de Prompts de Componentes
- "Crea una sección hero sobre fondo blanco. Titular a 60px IBM Plex Sans peso 300, line-height 1.17, color #161616. Subtítulo a 16px peso 400, line-height 1.50, color #525252, max-width 640px. Botón CTA azul (fondo #0f62fe, texto #ffffff, border-radius 0px, altura 48px, relleno 14px 63px 14px 15px)."
- "Diseña un tile de tarjeta: fondo #f4f4f4, border-radius 0px, relleno 16px. Título a 20px IBM Plex Sans peso 600, line-height 1.40, color #161616. Cuerpo a 14px peso 400, letter-spacing 0.16px, line-height 1.29, color #525252. Hover: el fondo cambia a #e8e8e8."
- "Construye un campo de formulario: fondo #f4f4f4, border-radius 0px, altura 40px, relleno horizontal 16px. Etiqueta arriba a 12px peso 400, letter-spacing 0.32px, color #525252. Borde inferior: 2px solid transparent por defecto, 2px solid #0f62fe en foco. Marcador de posición: #6f6f6f."
- "Crea una barra de navegación oscura: fondo #161616, altura 48px. Logo de IBM en blanco alineado a la izquierda. Enlaces a 14px IBM Plex Sans peso 400, color #c6c6c6. Hover: texto #ffffff. Activo: #ffffff con borde inferior de 2px."
- "Construye un componente de tag: fondo Blue 10 (#edf5ff), texto Blue 60 (#0f62fe), relleno 4px 8px, border-radius 24px, 12px IBM Plex Sans peso 400."

### Guía de Iteración
1. Usar siempre border-radius 0px en botones, inputs y tarjetas — esto no es negociable en Carbon
2. Interletraje solo en tamaños pequeños: 0.16px a 14px, 0.32px a 12px — nunca en texto de presentación
3. Tres pesos: 300 (presentación), 400 (cuerpo), 600 (énfasis) — sin negrita
4. Blue 60 es el único color de acento — no introducir matices de acento secundarios
5. La profundidad proviene de capas de color de fondo (blanco → `#f4f4f4` → `#e0e0e0`), no de sombras
6. Los inputs tienen solo borde inferior, nunca completamente recuadrados
7. Usar el prefijo `--cds-` para nombrar tokens y mantener compatibilidad con Carbon
8. 48px es la altura universal para elementos interactivos
