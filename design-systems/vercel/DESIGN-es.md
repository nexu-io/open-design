# Sistema de Diseño Inspirado en Vercel

> Category: Herramientas para Desarrolladores
> Despliegue frontend. Precisión en blanco y negro, fuente Geist.

## 1. Tema Visual y Atmósfera

El sitio web de Vercel es la tesis visual de la infraestructura para desarrolladores hecha invisible: un sistema de diseño tan contenido que roza lo filosófico. La página es abrumadoramente blanca (`#ffffff`) con texto casi negro (`#171717`), creando un vacío de galería donde cada elemento justifica su píxel. Esto no es minimalismo como decoración; es minimalismo como principio de ingeniería. El sistema de diseño Geist trata la interfaz como un compilador trata el código: cada token innecesario se elimina hasta que solo queda la estructura.

La familia tipográfica Geist personalizada es la joya de la corona. Geist Sans utiliza un interletraje negativo agresivo (-2,4 px a -2,88 px en tamaños de visualización), creando titulares que se sienten comprimidos, urgentes e ingeniados, como código minificado para producción. En tamaños de cuerpo, el espaciado se relaja, pero la precisión geométrica persiste. Geist Mono completa el sistema como compañero monoespaciado para código, salida de terminal y etiquetas técnicas. Ambas fuentes habilitan `"liga"` de OpenType (ligaduras) globalmente, añadiendo una capa de sofisticación tipográfica que recompensa la lectura atenta.

Lo que distingue a Vercel de otros sistemas de diseño monocromáticos es su filosofía de sombra como borde. En lugar de los bordes CSS tradicionales, Vercel usa `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)`: una sombra de desplazamiento cero, desenfoque cero y dispersión de 1 px que crea una línea similar a un borde sin las implicaciones del modelo de caja. Esta técnica permite que los bordes existan en la capa de sombra, lo que posibilita transiciones más suaves, esquinas redondeadas sin recorte y un peso visual más sutil que los bordes tradicionales. Todo el sistema de profundidad se construye sobre pilas de sombras multicapa donde cada capa tiene un propósito específico: una para el borde, otra para la elevación suave y otra para la profundidad ambiental.

**Características Clave:**
- Geist Sans con interletraje negativo extremo (-2,4 px a -2,88 px en visualización) — el texto como infraestructura comprimida
- Geist Mono para código y etiquetas técnicas con `"liga"` de OpenType globalmente
- Técnica de sombra como borde: `box-shadow 0px 0px 0px 1px` reemplaza los bordes tradicionales en toda la interfaz
- Pilas de sombras multicapa para profundidad matizada (borde + elevación + ambiente en declaraciones únicas)
- Lienzo casi blanco puro con texto `#171717` — no del todo negro, creando una suavidad de microcontraste
- Colores de acento específicos para flujos de trabajo: Rojo Ship (`#ff5b4f`), Rosa Preview (`#de1d8d`), Azul Develop (`#0a72ef`)
- Sistema de anillo de enfoque usando `hsla(212, 100%, 48%, 1)` — un azul saturado para accesibilidad
- Insignias en forma de píldora (9999 px) con fondos teñidos como indicadores de estado

## 2. Paleta de Colores y Roles

### Primarios
- **Negro Vercel** (`#171717`): Texto principal, encabezados, fondos de superficie oscura. No es negro puro: la ligera calidez evita la dureza.
- **Blanco Puro** (`#ffffff`): Fondo de página, superficies de tarjeta, texto de botón sobre oscuro.
- **Negro Verdadero** (`#000000`): Uso secundario, `--geist-console-text-color-default`, utilizado en contextos específicos de consola/código.

### Colores de Acento para Flujos de Trabajo
- **Rojo Ship** (`#ff5b4f`): `--ship-text`, el paso de flujo "enviar a producción" — coral-rojo cálido y urgente.
- **Rosa Preview** (`#de1d8d`): `--preview-text`, el flujo de despliegue de vista previa — magenta-rosa vibrante.
- **Azul Develop** (`#0a72ef`): `--develop-text`, el flujo de desarrollo — azul brillante y enfocado.

### Colores de Consola / Código
- **Azul Consola** (`#0070f3`): `--geist-console-text-color-blue`, azul para resaltado de sintaxis.
- **Púrpura Consola** (`#7928ca`): `--geist-console-text-color-purple`, púrpura para resaltado de sintaxis.
- **Rosa Consola** (`#eb367f`): `--geist-console-text-color-pink`, rosa para resaltado de sintaxis.

### Interactivos
- **Azul de Enlace** (`#0072f5`): Color de enlace principal con decoración de subrayado.
- **Azul de Enfoque** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, anillo de enfoque en elementos interactivos.
- **Azul de Anillo** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, utilidad de anillo de Tailwind.

### Escala de Neutros
- **Gris 900** (`#171717`): Texto principal, encabezados, texto de navegación.
- **Gris 600** (`#4d4d4d`): Texto secundario, copia descriptiva.
- **Gris 500** (`#666666`): Texto terciario, enlaces silenciados.
- **Gris 400** (`#808080`): Texto de marcador de posición, estados deshabilitados.
- **Gris 100** (`#ebebeb`): Bordes, contornos de tarjeta, separadores.
- **Gris 50** (`#fafafa`): Tinte de superficie sutil, resaltado de sombra interior.

### Superficie y Superposición
- **Telón de Superposición** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, telón de modal/diálogo.
- **Texto de Selección** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, resaltado de selección de texto.
- **Fondo Insignia Azul** (`#ebf5ff`): Fondo de insignia en píldora, superficie azul teñida.
- **Texto Insignia Azul** (`#0068d6`): Texto de insignia en píldora, azul más oscuro para legibilidad.

### Sombras y Profundidad
- **Sombra de Borde** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): La firma — reemplaza los bordes tradicionales.
- **Elevación Sutil** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Elevación mínima para tarjetas.
- **Pila de Tarjeta** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Sombra de tarjeta multicapa completa.
- **Borde de Anillo** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Borde de anillo gris claro para pestañas e imágenes.

## 3. Reglas Tipográficas

### Familia Tipográfica
- **Primaria**: `Geist`, con alternativas: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monoespaciada**: `Geist Mono`, con alternativas: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Características OpenType**: `"liga"` habilitado globalmente en todo el texto Geist; `"tnum"` para números tabulares en epígrafes específicos.

### Jerarquía

| Rol | Fuente | Tamaño | Grosor | Altura de Línea | Espaciado de Letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Hero de Visualización | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (ajustado) | -2.4px a -2.88px | Máxima compresión, impacto de cartelera |
| Encabezado de Sección | Geist | 40px (2.50rem) | 600 | 1.20 (ajustado) | -2.4px | Títulos de sección de características |
| Subencabezado Grande | Geist | 32px (2.00rem) | 600 | 1.25 (ajustado) | -1.28px | Encabezados de tarjeta, subsecciones |
| Subencabezado | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Subencabezados más ligeros |
| Título de Tarjeta | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Tarjetas de características |
| Título de Tarjeta Ligero | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Encabezados de tarjeta secundarios |
| Cuerpo Grande | Geist | 20px (1.25rem) | 400 | 1.80 (relajado) | normal | Introducciones, descripciones de características |
| Cuerpo | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Texto de lectura estándar |
| Cuerpo Pequeño | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Texto de interfaz estándar |
| Cuerpo Medio | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Navegación, texto enfatizado |
| Cuerpo Seminegrita | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Etiquetas fuertes, estados activos |
| Botón / Enlace | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Botones, enlaces, epígrafes |
| Botón Pequeño | Geist | 14px (0.88rem) | 400 | 1.00 (ajustado) | normal | Botones compactos |
| Epígrafe | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Metadatos, etiquetas |
| Mono Cuerpo | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Bloques de código |
| Mono Epígrafe | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Etiquetas de código |
| Mono Pequeño | Geist Mono | 12px (0.75rem) | 500 | 1.00 (ajustado) | normal | `text-transform: uppercase`, etiquetas técnicas |
| Micro Insignia | Geist | 7px (0.44rem) | 700 | 1.00 (ajustado) | normal | `text-transform: uppercase`, insignias diminutas |

### Principios
- **La compresión como identidad**: Geist Sans en tamaños de visualización usa de -2,4 px a -2,88 px de interletraje — el espaciado negativo más agresivo de cualquier sistema de diseño importante. Esto crea texto que se siente _minificado_, como código optimizado para producción. El espaciado se relaja progresivamente a medida que el tamaño disminuye: -1,28 px a 32 px, -0,96 px a 24 px, -0,32 px a 16 px y normal a 14 px.
- **Ligaduras en todas partes**: Todo elemento de texto Geist habilita `"liga"` de OpenType. Las ligaduras no son decorativas: son estructurales, creando combinaciones de glifos más compactas y eficientes.
- **Tres grosores, roles estrictos**: 400 (cuerpo/lectura), 500 (interfaz/interactivo), 600 (encabezados/énfasis). Sin negrita (700) excepto para micro-insignias diminutas. Este rango estrecho de grosores crea jerarquía a través del tamaño y el espaciado, no del grosor.
- **Mono para la identidad**: Geist Mono en mayúsculas con `"tnum"` o `"liga"` sirve como la voz de "consola para desarrolladores" — etiquetas técnicas compactas que conectan el sitio de marketing con el producto.

## 4. Estilos de Componentes

### Botones

**Blanco Primario (con borde de sombra)**
- Fondo: `#ffffff`
- Texto: `#171717`
- Relleno: 0px 6px (mínimo — ancho determinado por el contenido)
- Radio: 6px (suavemente redondeado)
- Sombra: `rgb(235, 235, 235) 0px 0px 0px 1px` (borde de anillo)
- Al pasar el cursor: el fondo cambia a `var(--ds-gray-1000)` (oscuro)
- Enfoque: contorno `2px solid var(--ds-focus-color)` + sombra `var(--ds-focus-ring)`
- Uso: Botón secundario estándar

**Oscuro Primario (deducido del sistema Geist)**
- Fondo: `#171717`
- Texto: `#ffffff`
- Relleno: 8px 16px
- Radio: 6px
- Uso: CTA principal ("Start Deploying", "Get Started")

**Botón Píldora / Insignia**
- Fondo: `#ebf5ff` (azul teñido)
- Texto: `#0068d6`
- Relleno: 0px 10px
- Radio: 9999px (píldora completa)
- Fuente: 12px grosor 500
- Uso: Insignias de estado, etiquetas, etiquetas de características

**Píldora Grande (Navegación)**
- Fondo: transparente o `#171717`
- Radio: 64px–100px
- Uso: Navegación por pestañas, selectores de sección

### Tarjetas y Contenedores
- Fondo: `#ffffff`
- Borde: mediante sombra — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Radio: 8px (estándar), 12px (tarjetas destacadas/de imagen)
- Pila de sombra: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Tarjetas de imagen: `1px solid #ebebeb` con radio superior de 12px
- Al pasar el cursor: intensificación sutil de la sombra

### Entradas y Formularios
- Radio: estilo estándar con fondo `var(--ds-gray-200)` al enfocar
- Sombra de enfoque: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Contorno de enfoque: `2px solid var(--ds-focus-color)` — anillo de enfoque azul consistente
- Borde: mediante técnica de sombra, no borde tradicional

### Navegación
- Navegación horizontal limpia sobre blanco, fija
- Logotipo de Vercel alineado a la izquierda, 262x52px
- Enlaces: Geist 14px grosor 500, texto `#171717`
- Activo: grosor 600 o subrayado
- CTA: botones oscuros en píldora ("Start Deploying", "Contact Sales")
- Móvil: colapso con menú hamburguesa
- Menús desplegables de producto con menús multinivel

### Tratamiento de Imágenes
- Capturas de pantalla del producto con borde `1px solid #ebebeb`
- Imágenes redondeadas en la parte superior: radio `12px 12px 0px 0px`
- Las capturas de pantalla de paneles de control/vista previa de código dominan las secciones de características
- Fondos de gradiente suave detrás de las imágenes hero (pastel multicolor)

### Componentes Distintivos

**Flujo de Trabajo en Cadena**
- Cadena horizontal de tres pasos: Develop → Preview → Ship
- Cada paso tiene su propio color de acento: Azul → Rosa → Rojo
- Conectados con líneas/flechas
- La metáfora visual de la propuesta de valor central de Vercel

**Barra de Confianza / Cuadrícula de Logos**
- Logos de empresas (Perplexity, ChatGPT, Cursor, etc.) en escala de grises
- Desplazamiento horizontal o diseño en cuadrícula
- Separación sutil con borde `#ebebeb`

**Tarjetas de Métricas**
- Visualización de número grande (p. ej., "10x faster")
- Geist 48px grosor 600 para la métrica
- Descripción a continuación en texto de cuerpo gris
- Contenedor de tarjeta con borde de sombra

## 5. Principios de Diseño

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Salto notable: de 16px a 32px — sin 20px ni 24px en la escala primaria

### Cuadrícula y Contenedor
- Ancho máximo de contenido: aproximadamente 1200px
- Hero: columna única centrada con generoso relleno superior
- Secciones de características: cuadrículas de 2 a 3 columnas para tarjetas
- Separadores de ancho completo usando `border-bottom: 1px solid #171717`
- Capturas de pantalla de código/panel de control a ancho completo o contenidas con borde

### Filosofía del Espacio en Blanco
- **Vacío de galería**: Enorme relleno vertical entre secciones (80px–120px+). El espacio en blanco ES el diseño — comunica que Vercel no tiene nada que demostrar ni nada que ocultar.
- **Texto comprimido, espacio expandido**: El agresivo interletraje negativo en los titulares se contrarresta con generoso espacio en blanco circundante. El texto es denso; el espacio a su alrededor es vasto.
- **Ritmo de sección**: Las secciones blancas se alternan con secciones blancas — no hay variación de color entre secciones. La separación proviene únicamente de los bordes (bordes de sombra) y el espaciado.

### Escala de Radio de Borde
- Micro (2px): Fragmentos de código en línea, tramos pequeños
- Sutil (4px): Contenedores pequeños
- Estándar (6px): Botones, enlaces, elementos funcionales
- Cómodo (8px): Tarjetas, elementos de lista
- Imagen (12px): Tarjetas destacadas, contenedores de imagen (redondeados arriba)
- Grande (64px): Píldoras de navegación por pestañas
- XL (100px): Enlaces de navegación grandes
- Píldora Completa (9999px): Insignias, píldoras de estado, etiquetas
- Círculo (50%): Botón de alternancia de menú, contenedores de avatar

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra | Fondo de página, bloques de texto |
| Anillo (Nivel 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Sombra como borde para la mayoría de elementos |
| Anillo Claro (Nivel 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Anillo más claro para pestañas e imágenes |
| Tarjeta Sutil (Nivel 2) | Anillo + `rgba(0,0,0,0.04) 0px 2px 2px` | Tarjetas estándar con elevación mínima |
| Tarjeta Completa (Nivel 3) | Anillo + Sutil + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + anillo interior `#fafafa` | Tarjetas destacadas, paneles resaltados |
| Enfoque (Accesibilidad) | Contorno `2px solid hsla(212, 100%, 48%, 1)` | Enfoque de teclado en todos los elementos interactivos |

**Filosofía de las Sombras**: Vercel tiene posiblemente el sistema de sombras más sofisticado en el diseño web moderno. En lugar de usar sombras para la elevación en el sentido tradicional del Material Design, Vercel usa pilas de sombras multicapa donde cada capa tiene un propósito arquitectónico distinto: una crea el "borde" (0px dispersión, 1px), otra añade suavidad ambiental (2px desenfoque), otra maneja la profundidad a distancia (8px desenfoque con dispersión negativa), y un anillo interior (`#fafafa`) crea el resaltado sutil que hace que la tarjeta "brille" desde adentro. Este enfoque en capas hace que las tarjetas se sientan construidas, no flotantes.

### Profundidad Decorativa
- Gradiente hero: lavado de gradiente multicolor suave y pastel detrás del contenido hero (apenas visible, atmosférico)
- Bordes de sección: `1px solid #171717` (línea oscura completa) entre las secciones principales
- Sin variación de color de fondo — la profundidad proviene enteramente del apilamiento de sombras y el contraste de bordes

## 7. Lo que se debe y no se debe hacer

### Hacer
- Usar Geist Sans con interletraje negativo agresivo en tamaños de visualización (-2,4 px a -2,88 px a 48 px)
- Usar sombra como borde (`0px 0px 0px 1px rgba(0,0,0,0.08)`) en lugar de bordes CSS tradicionales
- Habilitar `"liga"` en todo el texto Geist — las ligaduras son estructurales, no opcionales
- Usar el sistema de tres grosores: 400 (cuerpo), 500 (interfaz), 600 (encabezados)
- Aplicar los colores de acento de flujo de trabajo (Rojo/Rosa/Azul) solo en su contexto de flujo de trabajo
- Usar pilas de sombras multicapa para tarjetas (borde + elevación + ambiente + resaltado interior)
- Mantener la paleta de colores acromática — los grises de `#171717` a `#ffffff` son el sistema
- Usar `#171717` en lugar de `#000000` para el texto principal — el microcalidez importa

### No hacer
- No usar interletraje positivo en Geist Sans — siempre es negativo o cero
- No usar grosor 700 (negrita) en el texto de cuerpo — 600 es el máximo, usado solo para encabezados
- No usar `border` CSS tradicional en las tarjetas — usar la técnica de borde de sombra
- No introducir colores cálidos (naranjas, amarillos, verdes) en el cromo de la interfaz
- No aplicar los colores de acento de flujo de trabajo (Rojo Ship, Rosa Preview, Azul Develop) de forma decorativa
- No usar sombras pesadas (opacidad > 0,1) — el sistema de sombras es de nivel susurro
- No aumentar el interletraje del texto de cuerpo — Geist está diseñado para ejecutarse de forma ajustada
- No usar radio de píldora (9999 px) en botones de acción principal — las píldoras son solo para insignias/etiquetas
- No omitir el anillo interior `#fafafa` en las sombras de tarjeta — es el brillo que hace que el sistema funcione

## 8. Comportamiento Responsivo

### Puntos de Interrupción
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil Pequeño | <400px | Columna única ajustada, relleno mínimo |
| Móvil | 400–600px | Móvil estándar, diseño apilado |
| Tableta Pequeña | 600–768px | Comienzan las cuadrículas de 2 columnas |
| Tableta | 768–1024px | Cuadrículas de tarjetas completas, relleno expandido |
| Escritorio Pequeño | 1024–1200px | Diseño de escritorio estándar |
| Escritorio | 1200–1400px | Diseño completo, ancho máximo de contenido |
| Escritorio Grande | >1400px | Centrado, márgenes generosos |

### Objetivos Táctiles
- Los botones usan relleno cómodo (8px–16px vertical)
- Los enlaces de navegación de 14px con espaciado adecuado
- Las insignias en píldora tienen 10px de relleno horizontal para objetivos táctiles
- El botón de alternancia del menú móvil usa un botón circular de radio 50%

### Estrategia de Colapso
- Hero: 48 px de visualización → se escala hacia abajo, manteniendo el espaciado negativo proporcionalmente
- Navegación: enlaces horizontales + CTA → menú hamburguesa
- Tarjetas de características: 3 columnas → 2 columnas → columna única apilada
- Capturas de pantalla de código: mantener la relación de aspecto, puede desplazarse horizontalmente
- Logos de barra de confianza: cuadrícula → desplazamiento horizontal
- Pie de página: multicolumna → columna única apilada
- Espaciado de sección: 80px+ → 48px en móvil

### Comportamiento de Imágenes
- Las capturas de pantalla del panel de control mantienen el tratamiento de borde en todos los tamaños
- El gradiente hero se suaviza/simplifica en móvil
- Las capturas de pantalla del producto usan imágenes responsivas con radio de borde consistente
- Las secciones de ancho completo mantienen el tratamiento de borde a borde

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Colores
- CTA principal: Negro Vercel (`#171717`)
- Fondo: Blanco Puro (`#ffffff`)
- Texto de encabezado: Negro Vercel (`#171717`)
- Texto de cuerpo: Gris 600 (`#4d4d4d`)
- Borde (sombra): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Enlace: Azul de Enlace (`#0072f5`)
- Anillo de enfoque: Azul de Enfoque (`hsla(212, 100%, 48%, 1)`)

### Ejemplos de Prompts de Componentes
- "Crea una sección hero sobre fondo blanco. Titular a 48px Geist grosor 600, line-height 1.00, letter-spacing -2.4px, color #171717. Subtítulo a 20px Geist grosor 400, line-height 1.80, color #4d4d4d. Botón CTA oscuro (#171717, radio 6px, relleno 8px 16px) y botón fantasma (blanco, borde de sombra rgba(0,0,0,0.08) 0px 0px 0px 1px, radio 6px)."
- "Diseña una tarjeta: fondo blanco, sin borde CSS. Usa pila de sombra: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Radio 8px. Título a 24px Geist grosor 600, letter-spacing -0.96px. Cuerpo a 16px grosor 400, #4d4d4d."
- "Construye una insignia en píldora: fondo #ebf5ff, texto #0068d6, radio 9999px, relleno 0px 10px, 12px Geist grosor 500."
- "Crea navegación: encabezado blanco fijo. Geist 14px grosor 500 para enlaces, texto #171717. CTA oscuro en píldora 'Start Deploying' alineado a la derecha. Borde de sombra inferior: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Diseña una sección de flujo de trabajo mostrando tres pasos: Develop (color de texto #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Cada paso: etiqueta Geist Mono 14px en mayúsculas + título Geist 24px grosor 600 + descripción 16px grosor 400 en #4d4d4d."

### Guía de Iteración
1. Usar siempre sombra como borde en lugar de border CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` es la base
2. El interletraje escala con el tamaño de fuente: -2,4 px a 48 px, -1,28 px a 32 px, -0,96 px a 24 px, normal a 14 px
3. Solo tres grosores: 400 (leer), 500 (interactuar), 600 (anunciar)
4. El color es funcional, nunca decorativo — los colores de flujo de trabajo (Rojo/Rosa/Azul) marcan solo las etapas de la cadena
5. El anillo interior `#fafafa` en las sombras de tarjeta es lo que da a las tarjetas de Vercel su sutil brillo interior
6. Geist Mono en mayúsculas para etiquetas técnicas, Geist Sans para todo lo demás
