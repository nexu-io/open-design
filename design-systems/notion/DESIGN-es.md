# Sistema de diseño inspirado en Notion

> Category: Productividad y SaaS
> Espacio de trabajo todo en uno. Minimalismo cálido, encabezados con serifa, superficies suaves.

## 1. Tema visual y atmósfera

El sitio web de Notion encarna la filosofía de la propia herramienta: un lienzo en blanco que no interfiere con tu trabajo. El sistema de diseño se construye sobre neutros cálidos en lugar de grises fríos, creando un minimalismo distintivamente accesible que evoca la sensación de papel de calidad en lugar de vidrio estéril. El lienzo de la página es blanco puro (`#ffffff`), pero el texto no es negro puro — es un negro cálido casi puro (`rgba(0,0,0,0.95)`) que suaviza imperceptiblemente la experiencia de lectura. La escala de grises cálidos (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) tiene sutiles matices amarillo-marrón, lo que le otorga a la interfaz una calidez táctil, casi analógica.

La fuente personalizada NotionInter (una Inter modificada) es la columna vertebral del sistema. En tamaños de visualización (64px), utiliza un interletraje negativo agresivo (-2.125px), creando titulares que se sienten comprimidos y precisos. El rango de pesos es más amplio que en los sistemas típicos: 400 para el cuerpo, 500 para elementos de interfaz, 600 para etiquetas seminegrita y 700 para encabezados de visualización. Las características OpenType `"lnum"` (numerales de línea) y `"locl"` (formas localizadas) están habilitadas en textos más grandes, añadiendo sofisticación tipográfica que recompensa la lectura atenta.

Lo que distingue el lenguaje visual de Notion es su filosofía de bordes. En lugar de bordes pesados o sombras, Notion utiliza bordes ultra finos `1px solid rgba(0,0,0,0.1)` — bordes que existen como susurros, líneas de división apenas perceptibles que crean estructura sin peso. El sistema de sombras es igualmente contenido: capas múltiples con opacidad acumulada que nunca supera 0.05, creando profundidad que se siente más que se ve.

**Key Characteristics:**
- NotionInter (Inter modificada) con interletraje negativo en tamaños de visualización (-2.125px a 64px)
- Paleta de neutros cálidos: los grises tienen matices amarillo-marrón (`#f6f5f4` blanco cálido, `#31302e` oscuro cálido)
- Texto casi negro mediante `rgba(0,0,0,0.95)` — no negro puro, crea micro-calidez
- Bordes ultra finos: `1px solid rgba(0,0,0,0.1)` en todo el sistema — división de peso susurrado
- Capas múltiples de sombra con opacidad menor a 0.05 para profundidad casi imperceptible
- Azul Notion (`#0075de`) como el único color de acento para CTAs y elementos interactivos
- Insignias tipo pastilla (radio 9999px) con fondos azul matizado para indicadores de estado
- Unidad de espaciado base de 8px con escala orgánica no rígida

## 2. Paleta de colores y roles

### Primario
- **Negro Notion** (`rgba(0,0,0,0.95)` / `#000000f2`): Texto principal, encabezados, cuerpo de texto. La opacidad del 95% suaviza el negro puro sin sacrificar la legibilidad.
- **Blanco puro** (`#ffffff`): Fondo de página, superficies de tarjetas, texto de botón sobre azul.
- **Azul Notion** (`#0075de`): CTA principal, color de enlace, acento interactivo — el único color saturado en la interfaz principal.

### Secundario de marca
- **Azul marino profundo** (`#213183`): Color secundario de marca, usado con moderación para énfasis y secciones oscuras de características.
- **Azul activo** (`#005bab`): Estado activo/presionado del botón — variante más oscura del Azul Notion.

### Escala de neutros cálidos
- **Blanco cálido** (`#f6f5f4`): Tinte de superficie de fondo, alternancia de secciones, relleno sutil de tarjetas. El matiz amarillo es clave.
- **Oscuro cálido** (`#31302e`): Fondo de superficie oscura, texto en secciones oscuras. Más cálido que los grises estándar.
- **Gris cálido 500** (`#615d59`): Texto secundario, descripciones, etiquetas atenuadas.
- **Gris cálido 300** (`#a39e98`): Texto de marcador de posición, estados desactivados, texto de leyenda.

### Colores de acento semánticos
- **Verde azulado** (`#2a9d99`): Estados de éxito, indicadores positivos.
- **Verde** (`#1aae39`): Confirmación, insignias de completado.
- **Naranja** (`#dd5b00`): Estados de advertencia, indicadores de atención.
- **Rosa** (`#ff64c8`): Acento decorativo, destacados de características.
- **Morado** (`#391c57`): Características premium, acentos profundos.
- **Marrón** (`#523410`): Acento terroso, secciones de características cálidas.

### Interactivos
- **Azul enlace** (`#0075de`): Color principal de enlace con subrayado al pasar el cursor.
- **Azul enlace claro** (`#62aef0`): Variante de enlace más claro para fondos oscuros.
- **Azul foco** (`#097fe8`): Anillo de foco en elementos interactivos.
- **Fondo de insignia azul** (`#f2f9ff`): Fondo de insignia pastilla, superficie azul matizado.
- **Texto de insignia azul** (`#097fe8`): Texto de insignia pastilla, azul más oscuro para legibilidad.

### Sombras y profundidad
- **Sombra de tarjeta** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Elevación de tarjeta de capas múltiples.
- **Sombra profunda** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Elevación profunda de cinco capas para modales y contenido destacado.
- **Borde susurro** (`1px solid rgba(0,0,0,0.1)`): Borde de división estándar — tarjetas, divisores, secciones.

## 3. Reglas tipográficas

### Familia tipográfica
- **Principal**: `NotionInter`, con alternativas: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Características OpenType**: `"lnum"` (numerales de línea) y `"locl"` (formas localizadas) habilitadas en texto de visualización y encabezados.

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de línea | Interletraje | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Visualización principal | NotionInter | 64px (4.00rem) | 700 | 1.00 (compacto) | -2.125px | Compresión máxima, titulares de cartelera |
| Visualización secundaria | NotionInter | 54px (3.38rem) | 700 | 1.04 (compacto) | -1.875px | Héroe secundario, titulares de características |
| Encabezado de sección | NotionInter | 48px (3.00rem) | 700 | 1.00 (compacto) | -1.5px | Títulos de sección de características, con `"lnum"` |
| Subencabezado grande | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Encabezados de tarjeta, subsecciones de características |
| Subencabezado | NotionInter | 26px (1.63rem) | 700 | 1.23 (compacto) | -0.625px | Subtítulos de sección, encabezados de contenido |
| Título de tarjeta | NotionInter | 22px (1.38rem) | 700 | 1.27 (compacto) | -0.25px | Tarjetas de características, títulos de lista |
| Cuerpo grande | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Introducciones, descripciones de características |
| Cuerpo | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Texto de lectura estándar |
| Cuerpo medio | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Navegación, texto de interfaz enfatizado |
| Cuerpo seminegrita | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Etiquetas destacadas, estados activos |
| Cuerpo negrita | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Titulares en tamaño de cuerpo |
| Navegación / Botón | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Enlaces de navegación, texto de botón |
| Leyenda | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Metadatos, etiquetas secundarias |
| Leyenda ligera | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Leyendas de cuerpo, descripciones |
| Insignia | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Insignias pastilla, etiquetas, indicadores de estado |
| Microetiqueta | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Metadatos pequeños, marcas de tiempo |

### Principios
- **Compresión a escala**: NotionInter en tamaños de visualización usa -2.125px de interletraje a 64px, relajándose progresivamente a -0.625px a 26px y normal a 16px. La compresión crea densidad en los titulares mientras mantiene la legibilidad en tamaños de cuerpo.
- **Sistema de cuatro pesos**: 400 (cuerpo/lectura), 500 (interfaz/interactivo), 600 (énfasis/navegación), 700 (encabezados/visualización). El rango de pesos más amplio en comparación con la mayoría de los sistemas permite una jerarquía matizada.
- **Escala cálida**: La altura de línea se ajusta a medida que aumenta el tamaño — 1.50 en cuerpo (16px), 1.23-1.27 en subencabezados, 1.00-1.04 en visualización. Esto crea titulares más densos e impactantes.
- **Microrastreo de insignias**: El texto de insignia de 12px usa interletraje positivo (0.125px) — el único rastreo positivo en el sistema, creando texto pequeño más amplio y legible.

## 4. Estilos de componentes

### Botones

**Azul primario**
- Fondo: `#0075de` (Azul Notion)
- Texto: `#ffffff`
- Padding: 8px 16px
- Radio: 4px (sutil)
- Borde: `1px solid transparent`
- Hover: el fondo se oscurece a `#005bab`
- Activo: transformación scale(0.9)
- Foco: contorno `2px solid`, sombra `var(--shadow-level-200)`
- Uso: CTA principal ("Prueba Notion gratis", "Comenzar")

**Secundario / Terciario**
- Fondo: `rgba(0,0,0,0.05)` (gris cálido translúcido)
- Texto: `#000000` (casi negro)
- Padding: 8px 16px
- Radio: 4px
- Hover: el color del texto cambia, scale(1.05)
- Activo: transformación scale(0.9)
- Uso: Acciones secundarias, envíos de formularios

**Fantasma / Botón enlace**
- Fondo: transparente
- Texto: `rgba(0,0,0,0.95)`
- Decoración: subrayado al pasar el cursor
- Uso: Acciones terciarias, enlaces en línea

**Botón de insignia pastilla**
- Fondo: `#f2f9ff` (azul matizado)
- Texto: `#097fe8`
- Padding: 4px 8px
- Radio: 9999px (pastilla completa)
- Fuente: 12px peso 600
- Uso: Insignias de estado, etiquetas de características, etiquetas "Nuevo"

### Tarjetas y contenedores
- Fondo: `#ffffff`
- Borde: `1px solid rgba(0,0,0,0.1)` (borde susurro)
- Radio: 12px (tarjetas estándar), 16px (tarjetas destacadas/héroe)
- Sombra: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: intensificación sutil de la sombra
- Tarjetas con imagen: radio superior de 12px, la imagen ocupa la mitad superior

### Inputs y formularios
- Fondo: `#ffffff`
- Texto: `rgba(0,0,0,0.9)`
- Borde: `1px solid #dddddd`
- Padding: 6px
- Radio: 4px
- Foco: anillo de contorno azul
- Marcador de posición: gris cálido `#a39e98`

### Navegación
- Navegación horizontal limpia sobre blanco, no fija
- Logo de marca alineado a la izquierda (icono de 33x34px + wordmark)
- Enlaces: NotionInter 15px peso 500-600, texto casi negro
- Hover: cambio de color a `var(--color-link-primary-text-hover)`
- CTA: botón pastilla azul ("Prueba Notion gratis") alineado a la derecha
- Móvil: menú colapsable con ícono de hamburguesa
- Menús desplegables de producto con menús categorizados de múltiples niveles

### Tratamiento de imágenes
- Capturas de pantalla del producto con borde `1px solid rgba(0,0,0,0.1)`
- Imágenes con esquinas superiores redondeadas: radio `12px 12px 0px 0px`
- Las capturas de pantalla de paneles/espacio de trabajo dominan las secciones de características
- Fondos con gradientes cálidos detrás de ilustraciones héroe (ilustraciones de personajes decorativos)

### Componentes distintivos

**Tarjetas de características con ilustraciones**
- Encabezados ilustrativos grandes (La Gran Ola, capturas de pantalla de la interfaz del producto)
- Tarjeta de 12px de radio con borde susurro
- Título a 22px peso 700, descripción a 16px peso 400
- Variante de fondo blanco cálido (`#f6f5f4`) para secciones alternas

**Barra de confianza / Cuadrícula de logos**
- Logos de empresas (sección de equipos de confianza) en sus colores de marca
- Diseño de desplazamiento horizontal o cuadrícula con conteos de equipos
- Visualización de métricas: número grande + patrón de descripción

**Tarjetas de métricas**
- Visualización de números grandes (por ej., "$4,200 ROI")
- NotionInter 40px+ peso 700 para la métrica
- Descripción debajo en texto de cuerpo gris cálido
- Contenedor de tarjeta con borde susurro

## 5. Principios de maquetación

### Sistema de espaciado
- Unidad base: 8px
- Escala: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Escala orgánica no rígida con valores fraccionarios (5.6px, 6.4px) para microajustes

### Cuadrícula y contenedor
- Ancho máximo de contenido: aproximadamente 1200px
- Héroe: columna única centrada con generoso relleno superior (80-120px)
- Secciones de características: cuadrículas de 2-3 columnas para tarjetas
- Fondos de sección de ancho completo en blanco cálido (`#f6f5f4`) para alternancia
- Capturas de pantalla de código/panel contenidas con borde susurro

### Filosofía del espacio en blanco
- **Ritmo vertical generoso**: 64-120px entre secciones principales. Notion deja respirar el contenido con amplios rellenos verticales.
- **Alternancia cálida**: Las secciones blancas alternan con secciones en blanco cálido (`#f6f5f4`), creando un ritmo visual suave sin rupturas de color abruptas.
- **Densidad orientada al contenido**: Los bloques de texto del cuerpo son compactos (altura de línea 1.50), pero rodeados de márgenes amplios, creando islas de contenido legible en un mar de espacio en blanco.

### Escala de radio de bordes
- Micro (4px): Botones, inputs, elementos interactivos funcionales
- Sutil (5px): Enlaces, elementos de lista, elementos de menú
- Estándar (8px): Tarjetas pequeñas, contenedores, elementos en línea
- Cómodo (12px): Tarjetas estándar, contenedores de características, partes superiores de imágenes
- Grande (16px): Tarjetas héroe, contenido destacado, bloques promocionales
- Pastilla completa (9999px): Insignias, pastillas, indicadores de estado
- Círculo (100%): Indicadores de pestaña, avatares

## 6. Profundidad y elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra, sin borde | Fondo de página, bloques de texto |
| Susurro (Nivel 1) | `1px solid rgba(0,0,0,0.1)` | Bordes estándar, contornos de tarjeta, divisores |
| Tarjeta suave (Nivel 2) | Pila de sombras de 4 capas (opacidad máx. 0.04) | Tarjetas de contenido, bloques de características |
| Tarjeta profunda (Nivel 3) | Pila de sombras de 5 capas (opacidad máx. 0.05, desenfoque 52px) | Modales, paneles destacados, elementos héroe |
| Foco (Accesibilidad) | Contorno `2px solid var(--focus-color)` | Foco de teclado en todos los elementos interactivos |

**Filosofía de sombras**: El sistema de sombras de Notion usa múltiples capas con opacidad individual extremadamente baja (0.01 a 0.05) que se acumulan en una elevación suave y de aspecto natural. La sombra de tarjeta de 4 capas abarca desde 1.04px hasta 18px de desenfoque, creando un gradiente de profundidad en lugar de una sombra dura única. La sombra profunda de 5 capas se extiende a 52px de desenfoque con opacidad 0.05, produciendo una oclusión ambiental que se siente como luz natural en lugar de profundidad generada por computadora. Este enfoque en capas hace que los elementos se sientan integrados en la página en lugar de flotando sobre ella.

### Profundidad decorativa
- Sección héroe: ilustraciones de personajes decorativos (estilo lúdico, dibujado a mano)
- Alternancia de secciones: cambios de fondo de blanco a blanco cálido (`#f6f5f4`)
- Sin bordes de sección duros — la separación proviene de cambios de color de fondo y espaciado

## 7. Comportamiento responsivo

### Puntos de quiebre
| Nombre | Ancho | Cambios clave |
|------|-------|-------------|
| Móvil pequeño | <400px | Columna única ajustada, relleno mínimo |
| Móvil | 400-600px | Móvil estándar, maquetación apilada |
| Tablet pequeña | 600-768px | Comienzan las cuadrículas de 2 columnas |
| Tablet | 768-1080px | Cuadrículas de tarjetas completas, relleno expandido |
| Escritorio pequeño | 1080-1200px | Maquetación de escritorio estándar |
| Escritorio | 1200-1440px | Maquetación completa, ancho máximo de contenido |
| Escritorio grande | >1440px | Centrado, márgenes generosos |

### Objetivos táctiles
- Los botones usan relleno cómodo (8px-16px vertical)
- Los enlaces de navegación a 15px con espaciado adecuado
- Las insignias pastilla tienen 8px de relleno horizontal para áreas táctiles
- El botón de menú móvil usa el botón de hamburguesa estándar

### Estrategia de colapso
- Héroe: visualización de 64px -> escala a 40px -> 26px en móvil, mantiene el interletraje proporcional
- Navegación: enlaces horizontales + CTA azul -> menú de hamburguesa
- Tarjetas de características: 3 columnas -> 2 columnas -> columna única apilada
- Capturas de pantalla del producto: mantienen la relación de aspecto con imágenes responsivas
- Logos de la barra de confianza: cuadrícula -> desplazamiento horizontal en móvil
- Pie de página: múltiples columnas -> columna única apilada
- Espaciado de sección: 80px+ -> 48px en móvil

### Comportamiento de imágenes
- Las capturas de pantalla del espacio de trabajo mantienen el borde susurro en todos los tamaños
- Las ilustraciones héroe se escalan proporcionalmente
- Las capturas de pantalla del producto usan imágenes responsivas con radio de borde consistente
- Las secciones de blanco cálido de ancho completo mantienen el tratamiento de borde a borde

## 8. Accesibilidad y estados

### Sistema de foco
- Todos los elementos interactivos reciben indicadores de foco visibles
- Contorno de foco: `2px solid` con color de foco + nivel de sombra 200
- Navegación con teclado compatible en todos los componentes interactivos
- Texto de alto contraste: casi negro sobre blanco supera WCAG AAA (relación >14:1)

### Estados interactivos
- **Predeterminado**: Apariencia estándar con bordes susurro
- **Hover**: Cambio de color en texto, scale(1.05) en botones, subrayado en enlaces
- **Activo/Presionado**: Transformación scale(0.9), variante de fondo más oscuro
- **Foco**: Anillo de contorno azul con refuerzo de sombra
- **Desactivado**: Texto en gris cálido (`#a39e98`), opacidad reducida

### Contraste de colores
- Texto principal (rgba(0,0,0,0.95)) sobre blanco: relación ~18:1
- Texto secundario (#615d59) sobre blanco: relación ~5.5:1 (WCAG AA)
- CTA azul (#0075de) sobre blanco: relación ~4.6:1 (WCAG AA para texto grande)
- Texto de insignia (#097fe8) sobre fondo de insignia (#f2f9ff): relación ~4.5:1 (WCAG AA para texto grande)

## 9. Guía de prompts para agentes

### Referencia rápida de colores
- CTA principal: Azul Notion (`#0075de`)
- Fondo: Blanco puro (`#ffffff`)
- Fondo alternativo: Blanco cálido (`#f6f5f4`)
- Texto de encabezado: Casi negro (`rgba(0,0,0,0.95)`)
- Texto de cuerpo: Casi negro (`rgba(0,0,0,0.95)`)
- Texto secundario: Gris cálido 500 (`#615d59`)
- Texto atenuado: Gris cálido 300 (`#a39e98`)
- Borde: `1px solid rgba(0,0,0,0.1)`
- Enlace: Azul Notion (`#0075de`)
- Anillo de foco: Azul foco (`#097fe8`)

### Ejemplos de prompts para componentes
- "Crea una sección héroe sobre fondo blanco. Titular a 64px NotionInter peso 700, line-height 1.00, letter-spacing -2.125px, color rgba(0,0,0,0.95). Subtítulo a 20px peso 600, line-height 1.40, color #615d59. Botón CTA azul (#0075de, radio 4px, padding 8px 16px, texto blanco) y botón fantasma (fondo transparente, texto casi negro, subrayado al hover)."
- "Diseña una tarjeta: fondo blanco, borde 1px solid rgba(0,0,0,0.1), radio 12px. Usa pila de sombras: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Título a 22px NotionInter peso 700, letter-spacing -0.25px. Cuerpo a 16px peso 400, color #615d59."
- "Construye una insignia pastilla: fondo #f2f9ff, texto #097fe8, radio 9999px, padding 4px 8px, 12px NotionInter peso 600, letter-spacing 0.125px."
- "Crea navegación: encabezado blanco. NotionInter 15px peso 600 para los enlaces, texto casi negro. CTA pastilla azul 'Prueba Notion gratis' alineado a la derecha (fondo #0075de, texto blanco, radio 4px)."
- "Diseña una maquetación de sección alterna: secciones blancas alternan con secciones en blanco cálido (#f6f5f4). Cada sección tiene 64-80px de relleno vertical, max-width 1200px centrado. Encabezado de sección a 48px peso 700, line-height 1.00, letter-spacing -1.5px."

### Guía de iteración
1. Usa siempre neutros cálidos — los grises de Notion tienen matices amarillo-marrón (#f6f5f4, #31302e, #615d59, #a39e98), nunca azul-gris
2. El interletraje escala con el tamaño de fuente: -2.125px a 64px, -1.875px a 54px, -0.625px a 26px, normal a 16px
3. Cuatro pesos: 400 (leer), 500 (interactuar), 600 (enfatizar), 700 (anunciar)
4. Los bordes son susurros: 1px solid rgba(0,0,0,0.1) — nunca más pesados
5. Las sombras usan 4-5 capas con opacidad individual que nunca supera 0.05
6. El fondo de sección en blanco cálido (#f6f5f4) es esencial para el ritmo visual
7. Insignias pastilla (9999px) para estado/etiquetas, radio 4px para botones e inputs
8. El Azul Notion (#0075de) es el único color saturado en la interfaz principal — úsalo con moderación para CTAs y enlaces
