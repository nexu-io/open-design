# Sistema de Diseño Inspirado en Spotify

> Category: Medios y Consumo
> Streaming de música. Verde vibrante sobre fondo oscuro, tipografía audaz, impulsado por el arte de álbumes.

## 1. Tema Visual y Atmósfera

La interfaz web de Spotify es un reproductor de música oscuro e inmersivo que envuelve al oyente en un capullo casi negro (`#121212`, `#181818`, `#1f1f1f`) donde el arte de álbumes y el contenido se convierten en la fuente principal de color. La filosofía de diseño es "oscuridad con el contenido en primer plano" — la UI se retira hacia las sombras para que la música, los podcasts y las listas de reproducción puedan brillar. Cada superficie es un tono de carbón, creando un entorno similar a un teatro donde el único color verdadero proviene del icónico Verde Spotify (`#1ed760`) y de la propia portada de los álbumes.

La tipografía utiliza SpotifyMixUI y SpotifyMixUITitle — fuentes propietarias de la familia CircularSp (Circular de Lineto, personalizada para Spotify) con una extensa pila de respaldo que incluye fuentes en árabe, hebreo, cirílico, griego, devanagari y CJK, lo que refleja el alcance global de Spotify. El sistema tipográfico es compacto y funcional: 700 (negrita) para énfasis y navegación, 600 (seminegrita) para énfasis secundario, y 400 (regular) para el cuerpo. Los botones usan mayúsculas con espaciado de letras positivo (1.4px–2px) para una calidad sistemática, similar a etiquetas.

Lo que distingue a Spotify es su geometría de píldoras y círculos. Los botones principales usan radio de 500px–9999px (píldora completa), los botones circulares de reproducción usan radio del 50%, y los campos de búsqueda son píldoras de 500px. Combinado con sombras pesadas (`rgba(0,0,0,0.5) 0px 8px 24px`) en elementos elevados y una combinación única de borde con sombra insertada (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), el resultado es una interfaz que se siente como un dispositivo de audio premium — táctil, redondeada y diseñada para el tacto.

**Características Clave:**
- Tema oscuro e inmersivo casi negro (`#121212`–`#1f1f1f`) — la UI desaparece detrás del contenido
- Verde Spotify (`#1ed760`) como acento de marca singular — nunca decorativo, siempre funcional
- Familia tipográfica SpotifyMixUI/CircularSp con soporte para escrituras globales
- Botones en forma de píldora (500px–9999px) y controles circulares (50%) — redondeados, optimizados para el tacto
- Etiquetas de botón en mayúsculas con amplio espaciado de letras (1.4px–2px)
- Sombras pesadas en elementos elevados (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Colores semánticos: rojo negativo (`#f3727f`), naranja de advertencia (`#ffa42b`), azul de anuncio (`#539df5`)
- El arte del álbum como fuente principal de color — la UI es acromática por diseño

## 2. Paleta de Colores y Roles

### Marca Principal
- **Verde Spotify** (`#1ed760`): Acento de marca principal — botones de reproducción, estados activos, CTAs
- **Negro Profundo** (`#121212`): Superficie de fondo más oscura
- **Superficie Oscura** (`#181818`): Tarjetas, contenedores, superficies elevadas
- **Oscuro Medio** (`#1f1f1f`): Fondos de botones, superficies interactivas

### Texto
- **Blanco** (`#ffffff`): `--text-base`, texto principal
- **Plateado** (`#b3b3b3`): Texto secundario, etiquetas atenuadas, navegación inactiva
- **Casi Blanco** (`#cbcbcb`): Texto secundario ligeramente más brillante
- **Claro** (`#fdfdfd`): Blanco casi puro para máximo énfasis

### Semántico
- **Rojo Negativo** (`#f3727f`): `--text-negative`, estados de error
- **Naranja de Advertencia** (`#ffa42b`): `--text-warning`, estados de advertencia
- **Azul de Anuncio** (`#539df5`): `--text-announcement`, estados informativos

### Superficie y Borde
- **Tarjeta Oscura** (`#252525`): Superficie de tarjeta elevada
- **Tarjeta Media** (`#272727`): Superficie de tarjeta alternativa
- **Gris de Borde** (`#4d4d4d`): Bordes de botones sobre fondos oscuros
- **Borde Claro** (`#7c7c7c`): Bordes de botones con contorno, enlaces atenuados
- **Separador** (`#b3b3b3`): Líneas divisoras
- **Superficie Clara** (`#eeeeee`): Botones en modo claro (poco frecuente)
- **Borde Verde Spotify** (`#1db954`): Variante de borde con acento verde

### Sombras
- **Pesada** (`rgba(0,0,0,0.5) 0px 8px 24px`): Diálogos, menús, paneles elevados
- **Media** (`rgba(0,0,0,0.3) 0px 8px 8px`): Tarjetas, menús desplegables
- **Borde Insertado** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Combinación de borde con sombra para campos de entrada

## 3. Reglas Tipográficas

### Familias Tipográficas
- **Título**: `SpotifyMixUITitle`, respaldos: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Cuerpo**: `SpotifyMixUI`, misma pila de respaldo

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de línea | Espaciado de letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Título de sección | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Peso de título en negrita |
| Encabezado destacado | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (compacto) | normal | Encabezados de sección en seminegrita |
| Cuerpo en negrita | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Texto con énfasis |
| Cuerpo | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Cuerpo estándar |
| Botón en mayúsculas | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (compacto) | 1.4px–2px | `text-transform: uppercase` |
| Botón | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Botón estándar |
| Enlace de nav en negrita | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navegación |
| Enlace de nav | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Navegación inactiva |
| Subtítulo en negrita | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Metadatos en negrita |
| Subtítulo | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadatos |
| Pequeño en negrita | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Etiquetas, contadores |
| Pequeño | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Texto de nota al pie |
| Insignia | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Texto más pequeño |

### Principios
- **Binario negrita/regular**: La mayor parte del texto es 700 (negrita) o 400 (regular), con 600 usado de forma moderada. Esto crea una jerarquía visual clara mediante el contraste de peso en lugar de la variación de tamaño.
- **Botones en mayúsculas como sistema**: Las etiquetas de botón usan mayúsculas + amplio espaciado de letras (1.4px–2px), creando una voz de "etiqueta" sistemática que se distingue del texto de contenido.
- **Tamaños compactos**: El rango va de 10px a 24px — más estrecho que la mayoría de los sistemas. La tipografía de Spotify es compacta y funcional, diseñada para explorar listas de reproducción, no para leer artículos.
- **Soporte para escrituras globales**: La extensa pila de respaldo (árabe, hebreo, cirílico, griego, devanagari, CJK) refleja el alcance de Spotify en más de 180 mercados.

## 4. Estilos de Componentes

### Botones

**Píldora Oscura**
- Background: `#1f1f1f`
- Texto: `#ffffff` o `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (píldora completa)
- Uso: Píldoras de navegación, acciones secundarias

**Píldora Oscura Grande**
- Background: `#181818`
- Texto: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Uso: Botones de navegación principal de la app

**Píldora Clara**
- Background: `#eeeeee`
- Texto: `#181818`
- Radius: 500px
- Uso: CTAs en modo claro (consentimiento de cookies, marketing)

**Píldora con Contorno**
- Background: transparent
- Texto: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (asimétrico para icono)
- Radius: 9999px
- Uso: Botones de seguir, acciones secundarias

**Reproducción Circular**
- Background: `#1f1f1f`
- Texto: `#ffffff`
- Padding: 12px
- Radius: 50% (círculo)
- Uso: Controles de reproducción/pausa

### Tarjetas y Contenedores
- Background: `#181818` o `#1f1f1f`
- Radius: 6px–8px
- Sin bordes visibles en la mayoría de las tarjetas
- Al pasar el cursor: ligero aclaramiento del fondo
- Sombra: `rgba(0,0,0,0.3) 0px 8px 8px` en elevados

### Campos de Entrada
- Campo de búsqueda: fondo `#1f1f1f`, texto `#ffffff`
- Radius: 500px (píldora)
- Padding: 12px 96px 12px 48px (adaptado para icono)
- Foco: el borde se convierte en `#000000`, contorno `1px solid`

### Navegación
- Barra lateral oscura con SpotifyMixUI 14px peso 700 para activo, 400 para inactivo
- Color atenuado `#b3b3b3` para elementos inactivos, `#ffffff` para activos
- Botones de icono circulares (radio 50%)
- Logotipo de Spotify en la esquina superior izquierda en verde

## 5. Principios de Maquetación

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Cuadrícula y Contenedor
- Barra lateral (fija) + área de contenido principal
- Tarjetas de álbumes/listas de reproducción basadas en cuadrícula
- Barra de reproducción actual a ancho completo en la parte inferior
- El área de contenido responsiva ocupa el espacio restante

### Filosofía del Espacio en Blanco
- **Compresión oscura**: Spotify empaqueta el contenido de forma densa — las cuadrículas de listas de reproducción, las listas de pistas y la navegación están todas muy juntas. El fondo oscuro proporciona descanso visual entre elementos sin necesidad de grandes espacios.
- **Densidad de contenido sobre espacio para respirar**: Esto es una app, no un sitio de marketing. Cada píxel sirve a la experiencia de escucha.

### Escala de Radio de Bordes
- Mínimo (2px): Insignias, etiquetas explícitas
- Sutil (4px): Campos de entrada, elementos pequeños
- Estándar (6px): Contenedores de arte de álbum, tarjetas
- Cómodo (8px): Secciones, diálogos
- Medio (10px–20px): Paneles, elementos superpuestos
- Grande (100px): Botones de píldora grandes
- Píldora (500px): Botones principales, campo de búsqueda
- Píldora completa (9999px): Píldoras de navegación, búsqueda
- Círculo (50%): Botones de reproducción, avatares, iconos

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Base (Nivel 0) | Fondo `#121212` | Capa más profunda, fondo de página |
| Superficie (Nivel 1) | `#181818` o `#1f1f1f` | Tarjetas, barra lateral, contenedores |
| Elevado (Nivel 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Menús desplegables, tarjetas al pasar el cursor |
| Diálogo (Nivel 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modales, superposiciones, menús |
| Insertado (Borde) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Bordes de campos de entrada |

**Filosofía de Sombras**: Spotify utiliza sombras notablemente pesadas para una app de tema oscuro. La sombra de opacidad 0.5 con desenfoque de 24px crea un dramático efecto de "flotando en la oscuridad" para diálogos y menús, mientras que la opacidad 0.3 con desenfoque de 8px proporciona un levantamiento de tarjeta más sutil. La combinación única de borde con sombra insertada en los campos de entrada crea una calidad táctil y empotrada.

## 7. Lo que Debes y No Debes Hacer

### Debes
- Usar fondos casi negros (`#121212`–`#1f1f1f`) — profundidad mediante variación de tonos
- Aplicar Verde Spotify (`#1ed760`) únicamente en controles de reproducción, estados activos y CTAs principales
- Usar forma de píldora (500px–9999px) en todos los botones — circular (50%) para controles de reproducción
- Aplicar mayúsculas + amplio espaciado de letras (1.4px–2px) en las etiquetas de botón
- Mantener la tipografía compacta (rango 10px–24px) — esto es una app, no una revista
- Usar sombras pesadas (`opacidad 0.3–0.5`) para elementos elevados sobre fondos oscuros
- Dejar que el arte del álbum aporte el color — la UI en sí misma es acromática

### No Debes
- No usar Verde Spotify de forma decorativa ni en fondos — es únicamente funcional
- No usar fondos claros para superficies principales — la inmersión oscura es fundamental
- No omitir la geometría de píldora/círculo en los botones — los botones cuadrados rompen la identidad
- No usar sombras finas/sutiles — sobre fondos oscuros, las sombras deben ser pesadas para ser visibles
- No agregar colores de marca adicionales — verde + grises acromáticos es la paleta completa
- No usar alturas de línea relajadas — la tipografía de Spotify es compacta y densa
- No exponer bordes grises sin procesar — usa bordes basados en sombras o insertados

## 8. Comportamiento Responsivo

### Puntos de Quiebre
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil pequeño | <425px | Maquetación móvil compacta |
| Móvil | 425–576px | Móvil estándar |
| Tableta | 576–768px | Cuadrícula de 2 columnas |
| Tableta grande | 768–896px | Maquetación expandida |
| Escritorio pequeño | 896–1024px | Barra lateral visible |
| Escritorio | 1024–1280px | Maquetación de escritorio completa |
| Escritorio grande | >1280px | Cuadrícula expandida |

### Estrategia de Colapso
- Barra lateral: completa → colapsada → oculta
- Cuadrícula de álbumes: 5 columnas → 3 → 2 → 1
- Barra de reproducción actual: mantenida en todos los tamaños
- Búsqueda: campo en píldora mantenido, el ancho se ajusta
- Navegación: barra lateral → barra inferior en móvil

## 9. Guía de Prompts para el Agente

### Referencia Rápida de Colores
- Background: Negro Profundo (`#121212`)
- Superficie: Tarjeta Oscura (`#181818`)
- Texto: Blanco (`#ffffff`)
- Texto secundario: Plateado (`#b3b3b3`)
- Acento: Verde Spotify (`#1ed760`)
- Borde: `#4d4d4d`
- Error: Rojo Negativo (`#f3727f`)

### Ejemplos de Prompts de Componentes
- "Crea una tarjeta oscura: fondo #181818, radio 8px. Título en 16px SpotifyMixUI peso 700, texto blanco. Subtítulo en 14px peso 400, #b3b3b3. Sombra rgba(0,0,0,0.3) 0px 8px 8px al pasar el cursor."
- "Diseña un botón de píldora: fondo #1f1f1f, texto blanco, radio 9999px, padding 8px 16px. 14px SpotifyMixUI peso 700, mayúsculas, espaciado de letras 1.4px."
- "Construye un botón de reproducción circular: fondo Verde Spotify (#1ed760), icono #000000, radio 50%, padding 12px."
- "Crea un campo de búsqueda: fondo #1f1f1f, texto blanco, radio 500px, padding 12px 48px. Borde insertado: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Diseña una barra lateral de navegación: fondo #121212. Elementos activos: 14px peso 700, blanco. Inactivos: 14px peso 400, #b3b3b3."

### Guía de Iteración
1. Empieza con #121212 — todo vive en la oscuridad casi negra
2. Verde Spotify solo para destacados funcionales (reproducción, activo, CTA)
3. Píldora en todo — 500px para grande, 9999px para pequeño, 50% para circular
4. Mayúsculas + amplio tracking en botones — la voz de etiqueta sistemática
5. Sombras pesadas (opacidad 0.3–0.5) para elevación — las sombras ligeras son invisibles sobre fondos oscuros
6. El arte del álbum aporta todo el color — la UI se mantiene acromática
