# Design System Inspired by NVIDIA

> Categoría: Medios y Consumo
> Computación GPU. Energía verde-negra, estética de poder técnico.

## 1. Tema Visual y Atmósfera

El sitio web de NVIDIA es una experiencia de alto contraste y orientada a la tecnología que comunica potencia computacional bruta a través de la contención en el diseño. La página se construye sobre una base austera de negro (`#000000`) y blanco (`#ffffff`), puntuada por el verde característico de NVIDIA (`#76b900`): un color tan específico que funciona como una huella dactilar de marca. No es el verde exuberante de la naturaleza; es el verde eléctrico y desplazado hacia el lima de la luz renderizada por GPU, un color que se sitúa entre el chartreuse y el verde kelly, y que cualquier persona del mundo tecnológico identifica de inmediato como "NVIDIA".

La familia tipográfica personalizada NVIDIA-EMEA (con Arial y Helvetica como alternativas) crea una voz tipográfica limpia e industrial. Los títulos a 36px en negrita con interlineado ajustado de 1.25 generan bloques de texto densos y autoritativos. La fuente carece de la jugosidad geométrica de las sans-serif del Valle del Silicio: es europea, pragmática y orientada a la ingeniería. El cuerpo de texto va de 15 a 16px, cómodo para la lectura pero sin generosidad excesiva, manteniendo la sensación de que el espacio en pantalla se optimiza como la memoria de una GPU.

Lo que distingue el diseño de NVIDIA de otros sitios tecnológicos con fondo oscuro es el uso disciplinado del acento verde. El `#76b900` aparece en bordes (`2px solid #76b900`), subrayados de enlaces (`underline 2px rgb(118, 185, 0)`) y llamadas a la acción, pero nunca como fondo ni como grandes superficies en el contenido principal. El verde es una señal, no una superficie. Combinado con un sistema de sombras profundas (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) y un radio de borde mínimo (1-2px), el efecto general es el de hardware de ingeniería de precisión renderizado en píxeles.

**Características Clave:**
- Verde NVIDIA (`#76b900`) como acento puro: solo en bordes, subrayados y destacados interactivos
- Fondo negro (`#000000`) dominante con texto blanco (`#ffffff`) en secciones oscuras
- Fuente personalizada NVIDIA-EMEA con alternativa Arial/Helvetica: industrial, europea, limpia
- Interlineados ajustados (1.25 en títulos) que crean bloques de texto densos y autoritativos
- Radio de borde mínimo (1-2px): esquinas afiladas y técnicas en todo el sitio
- Botones con borde verde (`2px solid #76b900`) como patrón interactivo principal
- Sistema de iconos Font Awesome 6 Pro/Sharp a peso 900 para iconografía nítida
- Arquitectura multi-framework (PrimeReact, Fluent UI, Element Plus) que habilita componentes interactivos enriquecidos

## 2. Paleta de Colores y Roles

### Marca Principal
- **Verde NVIDIA** (`#76b900`): La firma: bordes, subrayados de enlaces, contornos de CTA, indicadores activos. Nunca se usa como relleno de grandes superficies.
- **Negro Puro** (`#000000`): Fondo principal de la página, texto sobre superficies claras, tono dominante.
- **Blanco Puro** (`#ffffff`): Texto sobre fondos oscuros, fondos de secciones claras, superficies de tarjetas.

### Paleta de Marca Extendida
- **Verde NVIDIA Claro** (`#bff230`): Acento lima brillante para destacados y estados hover.
- **Naranja 400** (`#df6500`): Acento cálido para alertas, insignias destacadas o contextos relacionados con la energía.
- **Amarillo 300** (`#ef9100`): Acento cálido secundario, destacados de categorías de productos.
- **Amarillo 050** (`#feeeb2`): Superficie cálida clara para fondos de bloques de llamada.

### Estado y Semántica
- **Rojo 500** (`#e52020`): Estados de error, acciones destructivas, alertas críticas.
- **Rojo 800** (`#650b0b`): Rojo profundo para fondos de advertencias graves.
- **Verde 500** (`#3f8500`): Estados de éxito, indicadores positivos (más oscuro que el verde de marca).
- **Azul 700** (`#0046a4`): Acentos informativos, alternativa hover para enlaces.

### Decorativo
- **Púrpura 800** (`#4d1368`): Púrpura profundo para extremos de degradados, contextos premium o de IA.
- **Púrpura 100** (`#f9d4ff`): Tinte de superficie púrpura claro.
- **Fucsia 700** (`#8c1c55`): Acento rico para promociones especiales o contenido destacado.

### Escala de Neutros
- **Gris 300** (`#a7a7a7`): Texto atenuado, etiquetas deshabilitadas.
- **Gris 400** (`#898989`): Texto secundario, metadatos.
- **Gris 500** (`#757575`): Texto terciario, marcadores de posición, pies de página.
- **Borde Gris** (`#5e5e5e`): Bordes sutiles, líneas divisorias.
- **Casi Negro** (`#1a1a1a`): Superficies oscuras, fondos de tarjetas sobre páginas negras.

### Estados Interactivos
- **Enlace por defecto (fondo oscuro)** (`#ffffff`): Enlaces blancos sobre fondos oscuros.
- **Enlace por defecto (fondo claro)** (`#000000`): Enlaces negros con subrayado verde sobre fondos claros.
- **Enlace Hover** (`#3860be`): Cambio a azul al pasar el cursor en todas las variantes de enlace.
- **Botón Hover** (`#1eaedb`): Destacado teal para estados hover de botones.
- **Botón Activo** (`#007fff`): Azul brillante para estados activo/presionado de botones.
- **Anillo de Foco** (`#000000 solid 2px`): Contorno negro para el foco de teclado.

### Sombras y Profundidad
- **Sombra de Tarjeta** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Sombra ambiental sutil para tarjetas elevadas.

## 3. Reglas Tipográficas

### Familia Tipográfica
- **Principal**: `NVIDIA-EMEA`, con alternativas: `Arial, Helvetica, sans-serif`
- **Fuente de Iconos**: `Font Awesome 6 Pro` (peso 900 para iconos sólidos, 700 para regular)
- **Icono Afilado**: `Font Awesome 6 Sharp` (peso 300 para iconos ligeros, 400 para regular)

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Interlineado | Espaciado entre letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (ajustado) | normal | Titulares de máximo impacto |
| Título de Sección | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (ajustado) | normal | Títulos de sección, encabezados de tarjeta |
| Subtítulo | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (relajado) | normal | Descripciones de funcionalidades, subtítulos |
| Título de Tarjeta | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (ajustado) | normal | Encabezados de tarjetas y módulos |
| Cuerpo Grande | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (relajado) | normal | Cuerpo enfatizado, párrafos de introducción |
| Cuerpo | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Texto de lectura estándar |
| Cuerpo Negrita | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Etiquetas en negrita, elementos de navegación |
| Cuerpo Pequeño | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (relajado) | normal | Contenido secundario, descripciones |
| Cuerpo Pequeño Negrita | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Contenido secundario enfatizado |
| Botón Grande | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (ajustado) | normal | Botones CTA principales |
| Botón | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (ajustado) | normal | Botones estándar |
| Botón Compacto | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (ajustado) | 0.144px | Botones pequeños/compactos |
| Enlace | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Enlaces de navegación |
| Enlace Mayúsculas | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, etiquetas de navegación |
| Leyenda | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Metadatos, marcas de tiempo |
| Leyenda Pequeña | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (ajustado) | normal | Letra pequeña, avisos legales |
| Micro Etiqueta | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, insignias pequeñas |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (ajustado) | normal | Texto de interfaz más pequeño |

### Principios
- **Negrita como voz predeterminada**: NVIDIA apuesta con fuerza por el peso 700 en títulos, botones, enlaces y etiquetas. El peso 400 se reserva para el cuerpo del texto y las descripciones: todo lo demás va en negrita, proyectando confianza y autoridad.
- **Títulos ajustados, cuerpo relajado**: El interlineado de los títulos es consistentemente 1.25 (ajustado), mientras que el texto del cuerpo se relaja hasta 1.50-1.67. Este contraste crea densidad visual en la parte superior de los bloques de contenido y una lectura cómoda en los párrafos.
- **Mayúsculas en la navegación**: Las etiquetas de enlace usan `text-transform: uppercase` con peso 700, creando una voz de navegación que se lee como etiquetas de especificaciones de hardware.
- **Sin tracking decorativo**: El espaciado entre letras es normal en todo el sitio, excepto en los botones compactos (0.144px). La fuente en sí aporta el carácter industrial sin necesidad de manipulación.

## 4. Estilos de Componentes

### Botones

**Principal (Borde Verde)**
- Fondo: `transparent`
- Texto: `#000000`
- Relleno: 11px 13px
- Borde: `2px solid #76b900`
- Radio: 2px
- Fuente: 16px peso 700
- Hover: fondo `#1eaedb`, texto `#ffffff`
- Activo: fondo `#007fff`, texto `#ffffff`, borde `1px solid #003eff`, scale(1)
- Foco: fondo `#1eaedb`, texto `#ffffff`, contorno `#000000 solid 2px`, opacidad 0.9
- Uso: CTA principal ("Más información", "Explorar soluciones")

**Secundario (Borde Verde Fino)**
- Fondo: transparent
- Borde: `1px solid #76b900`
- Radio: 2px
- Uso: Acciones secundarias, CTAs alternativos

**Compacto / En Línea**
- Fuente: 14.4px peso 700
- Espaciado entre letras: 0.144px
- Interlineado: 1.00
- Uso: CTAs en línea, navegación compacta

### Tarjetas y Contenedores
- Fondo: `#ffffff` (claro) o `#1a1a1a` (secciones oscuras)
- Borde: ninguno (bordes limpios) o `1px solid #5e5e5e`
- Radio: 2px
- Sombra: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` para tarjetas elevadas
- Hover: intensificación de la sombra
- Relleno: 16-24px interno

### Enlaces
- **Sobre fondo oscuro**: `#ffffff`, sin subrayado, hover cambia a `#3860be`
- **Sobre fondo claro**: `#000000` o `#1a1a1a`, subrayado `2px solid #76b900`, hover cambia a `#3860be` y se elimina el subrayado
- **Enlaces verdes**: `#76b900`, hover cambia a `#3860be`
- **Enlaces atenuados**: `#666666`, hover cambia a `#3860be`

### Navegación
- Fondo negro oscuro (`#000000`)
- Logo alineado a la izquierda, wordmark de NVIDIA prominente
- Enlaces: NVIDIA-EMEA 14px peso 700 en mayúsculas, `#ffffff`
- Hover: cambio de color, sin cambio de subrayado
- Menús desplegables mega-menú para categorías de productos
- Fijo al hacer scroll con fondo de soporte

### Tratamiento de Imágenes
- Renders de producto/GPU como imágenes hero, a menudo a ancho completo
- Imágenes de captura de pantalla con sombra sutil para dar profundidad
- Superposiciones de degradado verde en secciones hero oscuras
- Contenedores de avatar circulares con radio 50%

### Componentes Distintivos

**Tarjetas de Producto**
- Tarjeta blanca o oscura limpia con radio mínimo (2px)
- Borde o subrayado verde en el título
- Patrón de encabezado en negrita más descripción más ligera
- CTA con borde verde en la parte inferior

**Tablas de Especificaciones Técnicas**
- Disposiciones en cuadrícula industrial
- Fondos de fila alternos (cambio de gris sutil)
- Etiquetas en negrita, valores en regular
- Destacados verdes para métricas clave

**Banner de Cookies/Consentimiento**
- Posicionamiento fijo en la parte inferior
- Botones redondeados (radio 2px)
- Tratamientos con borde gris

## 5. Principios de Maquetación

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Valores de relleno principales: 8px, 11px, 13px, 16px, 24px, 32px
- Espaciado de secciones: 48-80px de relleno vertical

### Cuadrícula y Contenedor
- Ancho máximo de contenido: aproximadamente 1200px (contenido)
- Secciones hero a ancho completo con texto contenido
- Secciones de funcionalidades: cuadrículas de 2-3 columnas para tarjetas de producto
- Una sola columna para contenido de artículo/blog
- Maquetaciones con barra lateral para documentación

### Filosofía del Espacio en Blanco
- **Densidad intencionada**: NVIDIA utiliza un espaciado más ajustado que los sitios SaaS típicos, reflejando la densidad del contenido técnico. El espacio en blanco existe para separar conceptos, no para crear un vacío de lujo.
- **Ritmo de secciones**: Las secciones oscuras alternan con secciones blancas, usando el color de fondo (no solo el espaciado) para separar los bloques de contenido.
- **Densidad de tarjetas**: Las tarjetas de producto se sitúan próximas entre sí con separaciones de 16-20px, creando una sensación de catálogo en lugar de galería.

### Escala de Radio de Borde
- Micro (1px): Spans en línea, elementos diminutos
- Estándar (2px): Botones, tarjetas, contenedores, entradas: el valor predeterminado para casi todo
- Círculo (50%): Imágenes de avatar, indicadores de pestaña circulares

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra | Fondos de página, texto en línea |
| Sutil (Nivel 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Tarjetas estándar, modales |
| Borde (Nivel 1b) | `1px solid #5e5e5e` | Divisores de contenido, bordes de sección |
| Acento verde (Nivel 2) | `2px solid #76b900` | Elementos activos, CTAs, elementos seleccionados |
| Foco (Accesibilidad) | contorno `2px solid #000000` | Anillo de foco de teclado |

**Filosofía de Sombras**: El sistema de profundidad de NVIDIA es mínimo y utilitario. En esencia existe un único valor de sombra: un desenfoque ambiental de 5px al 30% de opacidad, usado con moderación en tarjetas y modales. La señal principal de profundidad no es la sombra sino el _contraste de color_: fondos negros junto a secciones blancas, bordes verdes sobre superficies negras. Esto crea una estratificación visual de tipo hardware donde la profundidad proviene de la diferencia material, no de la luz simulada.

### Profundidad Decorativa
- Lavados de degradado verde detrás del contenido hero
- Degradados de oscuro a más oscuro (negro a casi negro) para transiciones de sección
- Sin glassmorfismo ni efectos de desenfoque: claridad sobre atmósfera

## 7. Comportamiento Responsivo

### Puntos de Ruptura
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil Pequeño | <375px | Columna única compacta, relleno reducido |
| Móvil | 375-425px | Maquetación móvil estándar |
| Móvil Grande | 425-600px | Móvil más ancho, algunos indicios de 2 columnas |
| Tableta Pequeña | 600-768px | Comienzan las cuadrículas de 2 columnas |
| Tableta | 768-1024px | Cuadrículas completas de tarjetas, navegación expandida |
| Escritorio | 1024-1350px | Maquetación de escritorio estándar |
| Escritorio Grande | >1350px | Ancho máximo de contenido, márgenes generosos |

### Objetivos Táctiles
- Los botones usan relleno 11px 13px para objetivos táctiles cómodos
- Los enlaces de navegación a 14px en mayúsculas con espaciado adecuado
- Los botones con borde verde proporcionan objetivos táctiles de alto contraste sobre fondos oscuros
- Móvil: colapso del menú hamburguesa con superposición a pantalla completa

### Estrategia de Colapso
- Hero: el título de 36px se reduce proporcionalmente
- Navegación: la nav horizontal completa colapsa a menú hamburguesa en ~1024px
- Tarjetas de producto: de 3 columnas a 2 columnas a columna única apilada
- Pie de página: la cuadrícula multicolumna colapsa a columna única apilada
- Espaciado de secciones: 64-80px se reduce a 32-48px en móvil
- Imágenes: mantienen la relación de aspecto, se escalan al ancho del contenedor

### Comportamiento de Imágenes
- Los renders de GPU/producto mantienen alta resolución en todos los tamaños
- Las imágenes hero se escalan proporcionalmente con el viewport
- Las imágenes de tarjeta usan relaciones de aspecto consistentes
- Las secciones oscuras a sangre mantienen el tratamiento de borde a borde

## 8. Comportamiento Responsivo (Extendido)

### Escalado Tipográfico
- El display de 36px se reduce a ~24px en móvil
- Los títulos de sección de 24px se reducen a ~20px en móvil
- El cuerpo de texto se mantiene en 15-16px en todos los puntos de ruptura
- El texto de botón se mantiene en 16px para objetivos táctiles consistentes

### Estrategia de Secciones Oscuras/Claras
- Las secciones oscuras (fondo negro, texto blanco) alternan con secciones claras (fondo blanco, texto negro)
- El acento verde permanece consistente en ambos tipos de superficie
- En oscuro: los enlaces son blancos, los subrayados son verdes
- En claro: los enlaces son negros, los subrayados son verdes
- Esta alternancia crea un ritmo de desplazamiento natural y una agrupación de contenido

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Colores
- Acento principal: Verde NVIDIA (`#76b900`)
- Fondo oscuro: Negro Puro (`#000000`)
- Fondo claro: Blanco Puro (`#ffffff`)
- Texto de título (fondo oscuro): Blanco (`#ffffff`)
- Texto de título (fondo claro): Negro (`#000000`)
- Texto de cuerpo (fondo claro): Negro (`#000000`) o Casi Negro (`#1a1a1a`)
- Texto de cuerpo (fondo oscuro): Blanco (`#ffffff`) o Gris 300 (`#a7a7a7`)
- Hover de enlace: Azul (`#3860be`)
- Acento de borde: `2px solid #76b900`
- Hover de botón: Teal (`#1eaedb`)

### Ejemplos de Prompts para Componentes
- "Crea una sección hero sobre fondo negro. Titular a 36px NVIDIA-EMEA peso 700, interlineado 1.25, color #ffffff. Subtítulo a 18px peso 400, interlineado 1.67, color #a7a7a7. Botón CTA con fondo transparente, borde 2px solid #76b900, radio 2px, relleno 11px 13px, texto #ffffff. Hover: fondo #1eaedb, texto blanco."
- "Diseña una tarjeta de producto: fondo blanco, border-radius 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Título a 20px NVIDIA-EMEA peso 700, interlineado 1.25, color #000000. Cuerpo a 15px peso 400, interlineado 1.67, color #757575. Acento de subrayado verde en el título: border-bottom 2px solid #76b900."
- "Construye una barra de navegación: fondo #000000, fija en la parte superior. Logo de NVIDIA alineado a la izquierda. Enlaces a 14px NVIDIA-EMEA peso 700 en mayúsculas, color #ffffff. Hover: color #3860be. Botón CTA con borde verde alineado a la derecha."
- "Crea una sección de funcionalidades oscura: fondo #000000. Etiqueta de sección a 14px peso 700 en mayúsculas, color #76b900. Título a 24px peso 700, color #ffffff. Descripción a 16px peso 400, color #a7a7a7. Tres tarjetas de producto en fila con 20px de separación."
- "Diseña un pie de página: fondo #000000. Maquetación multicolumna con grupos de enlaces. Enlaces a 14px peso 400, color #a7a7a7. Hover: color #76b900. Barra inferior con texto legal a 12px, color #757575."

### Guía de Iteración
1. Usa siempre `#76b900` como acento, nunca como relleno de fondo: es un color de señal para bordes, subrayados y destacados
2. Los botones son transparentes con bordes verdes por defecto; los fondos rellenos aparecen solo en los estados hover/activo
3. El peso 700 es la voz dominante para todos los elementos interactivos y títulos; el 400 es solo para párrafos de cuerpo
4. El radio de borde es 2px para todo: este redondeado afilado y mínimo es fundamental para la estética industrial
5. Las secciones oscuras usan texto blanco; las secciones claras usan texto negro: el acento verde funciona igual en ambas
6. El hover de enlace es siempre `#3860be` (azul) independientemente del color predeterminado del enlace
7. Interlineado 1.25 para títulos, 1.50-1.67 para texto de cuerpo: mantén este contraste para la jerarquía visual
8. La navegación usa 14px negrita en mayúsculas: esta tipografía de etiqueta de hardware es parte de la voz de marca
