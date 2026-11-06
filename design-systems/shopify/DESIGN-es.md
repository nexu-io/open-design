# Sistema de diseño inspirado en Shopify

> Category: Comercio electrónico y venta minorista
> Plataforma de comercio electrónico. Cinematográfico dark-first, acento verde neón, tipografía ultraligera.

## 1. Tema visual y Atmósfera

Shopify.com es un teatro digital dark-first — un sitio web que escenifica su plataforma de comercio como un estreno cinematográfico. Toda la experiencia se despliega sobre un abismo de superficies casi negras que llevan el más leve susurro de verde bosque profundo (`#02090A`, `#061A1C`, `#102620`), creando una atmósfera nocturna que parece menos una página de marketing SaaS y más una presentación exclusiva de producto en una keynote tecnológica. Esta oscuridad no es fría ni corporativa — es la oscuridad cálida y envolvente de una experiencia de lujo, como sentarse en la primera fila de un auditorio en penumbra.

La tipografía es la estrella indiscutible. NeueHaasGrotesk — un refinado descendiente de Helvetica — aparece a escala monumental (96px) con un peso imposiblemente ligero (330-400), creando titulares que parecen grabados en luz en lugar de impresos en tinta. La característica OpenType `ss03` confiere a las formas de las letras un carácter distintivo que separa la tipografía de Shopify del uso genérico de Helvetica. Por debajo de la capa de visualización, Inter Variable gestiona el texto del cuerpo con precisión quirúrgica, usando pesos variables igualmente inusuales (420, 450, 550) que se encuentran entre las paradas de peso tradicionales. Esta precisión señala a una empresa que cuida cada detalle hasta el extremo.

El color se usa con extrema contención. El acento principal es Shopify Neon Green (`#36F4A4`) — una menta eléctrica que aparece exclusivamente en anillos de foco y resaltados de acento, pulsando como una señal bioluminiscente contra el lienzo oscuro. Tonos verdes más suaves (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) proporcionan lavados atmosféricos. El blanco es el único color de texto que importa en las superficies oscuras, mientras que una escala neutral basada en zinc (`#A1A1AA` hasta `#3F3F46`) gestiona la jerarquía de la información silenciosa. El resultado es un diseño que hace que la tecnología de comercio parezca pertenecer a un futuro de ciencia ficción.

**Características clave:**
- Diseño dark-first con subtonos teal-bosque profundos (no negro puro)
- Tipografía de visualización ultraligera (peso 330) a escala monumental (96px) que crea una presencia etérea
- Neon Green (`#36F4A4`) como el único acento de alta energía contra la oscuridad
- Botones de píldora completa (radio 9999px) como la forma interactiva principal
- Box-shadows en capas múltiples que crean profundidad fotográfica
- Capturas de pantalla de productos incrustadas en contextos de interfaz oscuros, que coinciden con la oscuridad circundante
- Escala neutral basada en zinc para la jerarquía de texto — equilibrada entre cálido y frío

## 2. Paleta de colores y Roles

### Primario

- **Shopify White** (`#FFFFFF`): Texto principal en superficies oscuras, rellenos de botones, elementos de alto contraste
- **Shopify Black** (`#000000`): Fondo del cuerpo, texto de botón sobre blanco, base de contraste máximo (--color-shade-100)

### Secundario y Acento

- **Neon Green** (`#36F4A4`): El acento de firma — anillos de foco, resaltados interactivos, indicadores de estado activo. Eléctrico y bioluminiscente
- **Aloe** (`#C1FBD4`): Lavado verde suave para fondos decorativos, tarjetas atmosféricas (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): El tinte verde más claro para diferenciación sutil de superficies (--color-pistachio-10)

### Superficie y Fondo

- **Void** (`#000000`): Fondo de página raíz — negro verdadero para máxima profundidad
- **Deep Teal** (`#02090A`): Superficies de tarjetas, contenedores de contenido — casi negro con subtono verde
- **Dark Forest** (`#061A1C`): Fondos de secciones con carácter verde visible
- **Forest** (`#102620`): Superficies oscuras elevadas, fondos de encabezado — el tono oscuro más cálido
- **Dark Card Border** (`#1E2C31`): Bordes de tarjetas en superficies oscuras, definición sutil de límites

### Neutros y Texto (Escala Zinc)

- **Shade-30** (`#D4D4D8`): El neutro más claro, bordes apenas perceptibles en oscuro (--color-shade-30)
- **Muted Text** (`#A1A1AA`): Texto secundario, metadatos, descripciones — la voz silenciosa
- **Shade-50** (`#71717A`): Texto terciario, marcas de tiempo, información menos importante (--color-shade-50)
- **Shade-60** (`#52525B`): Texto desactivado, neutros decorativos (--color-shade-60)
- **Shade-70** (`#3F3F46`): Divisores sutiles, límites de interfaz apenas visibles (--color-shade-70)
- **Light Border** (`#E4E4E7`): Bordes en superficies claras (raro — solo en modales de modo claro)

### Semántico y Acento

- **Link Muted** (`#9797A2`): Texto de enlace atenuado con decoración de subrayado
- **Link Sage** (`#9DABAD`): Enlaces atenuados con tinte teal
- **Link Lavender** (`#BDBDCA`): Variante de enlace más clara
- **Link Mint** (`#99B3AD`): Variante de enlace con tinte verde para secciones temáticas

### Sistema de Degradados

- **Dark Teal Wash**: Degradado radial desde `#102620` en el centro hasta `#02090A` en el borde — usado detrás de las vitrinas de productos
- **Green Atmospheric**: Degradados ambientales sutilmente teñidos de verde detrás de las secciones héroe, creando profundidad sin colores sólidos
- **Spotlight**: Área brillante enfocada que se desvanece hacia el negro — crea iluminación de presentación estilo keynote

## 3. Reglas tipográficas

### Familia de fuentes

**Visualización:** NeueHaasGrotesk (refinado descendiente de Helvetica, fuente variable)
- Alternativas: Helvetica, Arial, sans-serif
- Características OpenType: `ss03` (conjunto estilístico 3 — alternativas de formas de letras distintivas)
- Pesos disponibles: 330, 360, 400, 500, 750 (variable)
- Usado para todos los encabezados, texto héroe y elementos de visualización grandes

**Cuerpo:** Inter-Variable
- Alternativas: Helvetica, Arial, sans-serif
- Características OpenType: `ss03`
- Pesos disponibles: 400, 420, 450, 500, 550 (variable)
- Usado para texto del cuerpo, enlaces, botones, elementos de interfaz

**Mono:** ui-monospace
- Alternativas: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Usado para fragmentos de código, etiquetas de datos, contenido técnico

### Jerarquía

| Rol | Tamaño | Peso | Altura de línea | Espaciado de letras | Notas |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, titulares héroe, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, visualización de énfasis |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, visualización espaciada |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, visualización etérea |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, títulos de sección |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, subsecciones |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, títulos de funcionalidades |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, encabezados de tarjetas |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, encabezados pequeños |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, encabezados menores |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, párrafos de introducción |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, cuerpo estándar |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, cuerpo enfatizado |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, cuerpo compacto |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, ligeramente enfatizado |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, texto CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, elementos de navegación |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadatos |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, leyenda enfatizada |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, etiquetas de espaciado amplio |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, texto pequeño de espaciado estrecho |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, etiquetas en mayúsculas |
| Code | 16px | 400 | 1.50 | — | ui-monospace, mayúsculas, bloques de código |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, mayúsculas, código en línea |

### Principios

La tipografía de Shopify es una clase magistral de precisión con fuentes variables. La capa de visualización vive casi exclusivamente en pesos 330-400 — texto ligero como una pluma que parece flotar sobre el fondo oscuro como luz proyectada. Esto es lo opuesto al enfoque en negrita y pesado que adoptan la mayoría de los sitios SaaS: donde otros gritan, Shopify susurra a gran escala. Los titulares de 96px con peso 330 crean una paradoja de tamaño enorme y trazo delicado que se siente a la vez monumental y frágil. La característica OpenType `ss03` activa un conjunto estilístico que da a caracteres específicos (probablemente 'a', 'g' y ciertos números) una apariencia más refinada, distinguiendo la tipografía de Shopify del uso estándar de Helvetica Neue. Inter Variable gestiona la capa del cuerpo con precisión quirúrgica, usando pesos como 420 y 550 que existen entre las paradas tradicionales — cada pieza de texto tiene exactamente el peso visual que necesita.

## 4. Estilos de componentes

### Botones

**Primario (Relleno blanco)**
- Fondo: Blanco (`#FFFFFF`)
- Texto: Negro (`#000000`)
- Borde: 2px solid transparent
- Radio de borde: píldora completa (9999px)
- Relleno: 12px 26px 12px 16px (asimétrico — más relleno derecho para equilibrio visual)
- Hover: ligera reducción de opacidad o cambio de fondo
- Foco: anillo de contorno `#36F4A4` (Neon Green) de 2px
- Transición: all 200ms ease

**Secundario (Fantasma/Contorneado)**
- Fondo: transparent
- Texto: Blanco (`#FFFFFF`)
- Borde: 2px solid Blanco (`#FFFFFF`)
- Radio de borde: píldora completa (9999px)
- Relleno: 12px 26px 12px 16px
- Hover: se rellena con fondo blanco y texto negro
- Foco: contorno `#36F4A4` de 2px

**Badge/Etiqueta (Relleno neutro)**
- Fondo: `rgba(255, 255, 255, 0.2)` (vidrio esmerilado)
- Texto: Blanco (`#FFFFFF`)
- Borde: ninguno
- Radio de borde: ligeramente redondeado (4px)
- Relleno: 12px 16px
- Fuente: 16px regular

### Tarjetas y Contenedores

- Fondo: Deep Teal (`#02090A`) en páginas oscuras
- Borde: 1px solid `#1E2C31` (Dark Card Border) — límite apenas visible
- Radio de borde: 8px para tarjetas estándar, 12px para tarjetas destacadas, 20px 20px 0 0 para tarjetas redondeadas en la parte superior
- Sombra: Sistema multicapa:
  - En reposo: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - El resaltado blanco insertado crea un sutil resplandor en el borde superior
- Hover: la sombra se expande, la tarjeta puede iluminarse ligeramente
- Transición: box-shadow 300ms ease, transform 200ms ease

### Entradas y Formularios

- Fondo: transparent o Dark Forest (`#061A1C`)
- Texto: Blanco (`#FFFFFF`)
- Borde: 1px solid `#3F3F46` (Shade-70)
- Radio de borde: 8px
- Relleno: 12px 16px
- Foco: 2px solid `#36F4A4` (anillo de foco Neon Green)
- Marcador de posición: Shade-50 (`#71717A`)
- Transición: border-color 200ms ease

### Navegación

- Fondo: transparent (superpuesto sobre el héroe oscuro), se convierte en Forest (`#102620`) al desplazarse
- Altura: ~64px
- Izquierda: logotipo de marca verbal Shopify (SVG, blanco sobre oscuro)
- Centro/Derecha: enlaces de navegación en 18px/500 NeueHaasGrotesk, blanco, espaciado de letras 0.72px
- CTA: Botón de píldora blanca "Start for free" (derecha)
- CTA secundaria: Botón fantasma con borde blanco
- Hover: los enlaces cambian a Muted Text (`#A1A1AA`) o ganan subrayado
- Móvil: menú hamburguesa, superposición oscura a pantalla completa
- Transición: background 300ms ease al desplazarse

### Tratamiento de imágenes

- Capturas de pantalla de productos: incrustadas en contextos de interfaz oscuros, coincidiendo con la oscuridad circundante
- Vistas previas de la interfaz de administración: mostradas en fondos oscuros con bordes de tarjetas sutiles
- Proporciones de aspecto: variadas — las imágenes héroe son amplias (aprox. 16:9), las tomas de funcionalidades son flexibles
- Todas las imágenes encajan al ras dentro de contenedores oscuros — sin bordes ni marcos brillantes
- Carga diferida con superficies de marcadores de posición oscuras

### Indicadores de confianza

- Estadísticas mostradas de forma prominente: "15+" (años), "150M+" (compradores)
- Números a escala de visualización en NeueHaasGrotesk
- Secciones de llamada a la acción del ecosistema de socios/desarrolladores
- Testimonios con temática oscura integrados en el flujo de la página

## 5. Principios de maquetación

### Sistema de espaciado

Unidad base: 8px

| Token | Valor | Uso |
|-------|-------|-----|
| space-1 | 4px | Separaciones en línea ajustadas |
| space-2 | 8px | Unidad base, separaciones de iconos |
| space-3 | 12px | Relleno de tarjeta, márgenes ajustados |
| space-4 | 16px | Relleno de elemento estándar |
| space-5 | 24px | Separaciones de tarjetas, relleno de sección |
| space-6 | 28px | Espaciado de sección medio |
| space-7 | 32px | Saltos de sección |
| space-8 | 36px | Relleno grande |
| space-9 | 40px | Relleno de sección principal |
| space-10 | 64px | Relleno de sección héroe, separaciones grandes |

### Cuadrícula y Contenedor

- Ancho máximo del contenedor: ~1280px (centrado)
- Héroe: ancho completo, fondo oscuro de borde a borde con texto centrado
- Secciones de funcionalidades: maquetaciones de 2 columnas con texto y capturas de pantalla de productos
- Secciones de estadísticas: maquetación horizontal con números grandes
- Relleno horizontal: 64px escritorio, 32px tableta, 16px móvil
- Separación de cuadrícula: 24-32px entre bloques de contenido principales

### Filosofía del espacio en blanco

La estrategia de espacio en blanco de Shopify es teatral. Las secciones están separadas por vastas extensiones de espacio oscuro — 80px a 120px de puro espacio negro para respirar — que crean el ritmo de una presentación, no de una página web. Cada bloque de contenido es su propia "diapositiva" en un desplazamiento estilo keynote. Dentro de las secciones, el espaciado es más apretado y deliberado, creando densidad focal contra el vacío expansivo. El contraste entre el vacío a nivel macro y la precisión a nivel micro es lo que le da al sitio su cadencia cinematográfica.

### Escala de radio de borde

| Valor | Contexto |
|-------|---------|
| 4px | Etiquetas, badges, micro-elementos |
| 8px | Tarjetas estándar, entradas, contenedores de vídeo |
| 12px | Tarjetas destacadas, contenedores de imágenes, botones (no píldora) |
| 20px | Tarjetas redondeadas en la parte superior (20px 20px 0 0), encabezados de modal |
| 340px | Grandes elementos decorativos redondeados |
| 9999px | Botones píldora, badges píldora, elementos de navegación |

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Base | Sin sombra, superficie oscura | Fondo de página predeterminado |
| Sutil | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + resplandor blanco insertado | Tarjetas en reposo |
| Medio | Multicapa: anillo 1px + 2px + 4px + pila de sombras 8px | Tarjetas elevadas, secciones destacadas |
| Alto | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modales, desplegables, superposiciones |
| Foco | `0px 0px 0px 2px #36F4A4` | Anillo de foco de teclado (Neon Green) |

El sistema de sombras de Shopify es inusualmente sofisticado. En lugar de valores de sombra de una sola capa, las tarjetas utilizan un enfoque apilado y multicapa: un anillo de 1px para la definición de límites, desenfoque progresivo de 2px/4px/8px para la caída natural de la luz, y un delicado resplandor blanco insertado (`rgba(255,255,255,0.03)`) que simula una superficie de vidrio iluminada desde arriba. Sobre fondos oscuros, las sombras oscurecen desde superficies ya oscuras, por lo que las sombras funcionan más como "oclusión ambiental" que como elevación tradicional — la tarjeta parece hundirse ligeramente en la superficie en lugar de flotar sobre ella.

### Profundidad decorativa

- **Degradados teal oscuros**: Lavados radiales ambientales detrás de las secciones héroe y las vitrinas de productos
- **Efectos de foco de luz**: Áreas brillantes centradas que se desvanecen hacia el negro, creando iluminación teatral estilo keynote
- **Resplandor de borde**: Sutiles bordes de colores claros en tarjetas oscuras mediante box-shadow insertada
- **Halos atmosféricos verdes**: Tintes verdes tenues en los degradados de fondo, haciendo eco del acento de marca

## 7. Lo que se debe y no se debe hacer

### Se debe

- Usar la jerarquía de superficies teal-negro oscuro (Void → Deep Teal → Dark Forest → Forest) para profundidad
- Mantener la tipografía de visualización en peso 330-400 — la ligereza etérea es la firma del diseño
- Usar Neon Green (`#36F4A4`) exclusivamente para estados de foco y resaltados de acento críticos
- Aplicar radio de 9999px a todos los botones CTA principales — la píldora completa es innegociable
- Usar el sistema de sombras multicapa para la elevación de tarjetas — las sombras simples parecen planas
- Mantener la característica OpenType `ss03` en todo el texto — es parte de la identidad tipográfica
- Usar Inter Variable para el texto del cuerpo y NeueHaasGrotesk para los encabezados — nunca intercambiar sus roles
- Crear espaciado teatral entre secciones (80px+) para un ritmo cinematográfico

### No se debe

- No usar negro puro (#000000) para el texto en fondos oscuros — usar solo blanco (#FFFFFF)
- No introducir colores cálidos (naranja, rojo, amarillo) — la paleta es estrictamente fría (verdes, teales, neutros)
- No usar pesos de fuente superiores a 500 para el texto del cuerpo en NeueHaasGrotesk — los pesos pesados rompen la sensación etérea
- No aplicar acentos verdes a superficies grandes — Neon Green es solo para resaltados pequeños y precisos
- No usar esquinas afiladas (radio 0px) en elementos interactivos — todo se redondea
- No agregar fondos brillantes — el tema oscuro es fundamental, no opcional
- No usar box-shadows de una sola capa — el enfoque apilado es el sistema
- No establecer altura de línea superior a 1.56 para el texto del cuerpo — el texto de Shopify es relativamente compacto
- No mezclar NeueHaasGrotesk e Inter en el mismo tamaño/rol — sus escalas de peso difieren
- No usar espaciado de letras negativo para los encabezados — los encabezados de Shopify tienen seguimiento neutro o positivo

## 8. Comportamiento responsivo

### Puntos de quiebre

| Nombre | Ancho | Cambios clave |
|------|-------|-------------|
| Móvil | <640px | Columna única, navegación hamburguesa, texto de visualización se reduce a 48px, relleno 16px |
| Tableta | 640-1024px | Comienzan las cuadrículas de 2 columnas, texto de visualización a 70px, relleno 32px |
| Escritorio | 1024-1440px | Maquetación completa, navegación expandida, visualización 96px, relleno 64px |
| Escritorio grande | >1440px | Contenedor de ancho máximo centrado, espaciado de sección aumentado |

### Objetivos táctiles

- Objetivo táctil mínimo: 44x44px (WCAG AAA)
- Botones píldora: altura mínima de 48px con generoso relleno horizontal
- Enlaces de navegación: área táctil de 44px
- Superficies de tarjetas: toda la tarjeta es tappable donde está vinculada

### Estrategia de colapso

- **Navegación**: Enlaces horizontales completos → menú hamburguesa por debajo de 1024px; el logotipo y el botón CTA permanecen visibles
- **Sección héroe**: Visualización 96px → 70px en tableta → 48px en móvil; mantiene la alineación centrada de una sola columna
- **Secciones de funcionalidades**: 2 columnas texto+imagen → columna única apilada por debajo de 768px
- **Estadísticas**: Fila horizontal → apilado verticalmente en móvil
- **Relleno de sección**: 64px → 40px → 24px → 16px a medida que el viewport se estrecha
- **Tarjetas**: Cuadrícula → pila, manteniendo el ancho completo en móvil

### Comportamiento de imágenes

- Capturas de pantalla de productos: responsivas dentro de contenedores oscuros, mantienen la proporción de aspecto
- Imágenes héroe: ancho completo en todos los puntos de quiebre, carga diferida con marcadores de posición oscuros
- Vistas previas de la interfaz de administración: escala proporcional, pueden recortarse en móvil
- Todas las imágenes usan CDN (`cdn.shopify.com`) con srcset responsivo

## 9. Guía de prompts para agentes

### Referencia rápida de colores

- CTA principal: Shopify White (`#FFFFFF`)
- Fondo de página: Void Black (`#000000`)
- Superficie de tarjeta: Deep Teal (`#02090A`)
- Fondo de sección: Dark Forest (`#061A1C`)
- Fondo elevado: Forest (`#102620`)
- Acento: Neon Green (`#36F4A4`)
- Texto del cuerpo: Blanco (`#FFFFFF`)
- Texto atenuado: Muted (`#A1A1AA`)
- Borde oscuro: Dark Card Border (`#1E2C31`)

### Ejemplos de prompts de componentes

- "Crear una sección héroe sobre fondo negro verdadero (#000000) con un titular NeueHaasGrotesk 96px/330 en blanco, un subtítulo 20px/500 en #A1A1AA, y dos botones píldora: blanco relleno (radio 9999px) y fantasma con borde blanco de 2px"
- "Diseñar una tarjeta de funcionalidad sobre Deep Teal (#02090A) con borde #1E2C31 de 1px, radio 12px, sombra multicapa (anillo 1px + desenfoque 2px/4px/8px al 10% de negro), que contenga un encabezado blanco 32px/360 y texto del cuerpo #A1A1AA 18px/400"
- "Construir una sección de estadísticas sobre Dark Forest (#061A1C) con números blancos 96px/750 (NeueHaasGrotesk), etiquetas descriptivas #A1A1AA 16px/400, y generoso espaciado de 64px entre bloques de estadísticas"
- "Crear una nav fija con fondo transparente (se convierte en #102620 al desplazarse), logotipo blanco de Shopify a la izquierda, enlaces de nav blancos 18px/500 con espaciado de letras 0.72px, y un botón píldora blanco 'Start for free' a la derecha"
- "Diseñar una etiqueta/badge con fondo de vidrio esmerilado rgba(255,255,255,0.2), radio 4px, relleno 12px 16px, texto blanco de 16px — flotando sobre una superficie de tarjeta oscura"

### Guía de iteración

Al refinar pantallas existentes generadas con este sistema de diseño:
1. Centrarse en UN componente a la vez
2. Hacer referencia a nombres de colores específicos y códigos hex de este documento
3. Recordar: este es un diseño DARK-FIRST — las superficies claras son la excepción, no la regla
4. El texto de visualización siempre debe parecer ligero como una pluma (peso 330-400) — si parece pesado, reducir el peso
5. Neon Green (#36F4A4) es precioso — usar con moderación solo para foco y acento
6. La jerarquía de superficies oscuras (negro → deep teal → dark forest → forest) crea profundidad sutil
7. Las sombras son multicapa — un solo valor `box-shadow` no capturará la sensación de la tarjeta de Shopify
8. La característica OpenType `ss03` debe estar activa en todo el texto para la coherencia tipográfica
