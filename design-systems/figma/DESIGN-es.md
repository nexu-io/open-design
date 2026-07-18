# Sistema de Diseño Inspirado en Figma

> Category: Diseño y Creatividad
> Herramienta de diseño colaborativo. Multicolor vibrante, lúdica pero profesional.

## 1. Tema Visual y Atmósfera

La interfaz de Figma es la herramienta de diseño que se diseñó a sí misma — una clase magistral de sofisticación tipográfica donde una fuente variable personalizada (figmaSans) modula entre ultra-fina (weight 320) y negrita (weight 700) con pasos intermedios inusuales (330, 340, 450, 480, 540) que la mayoría de los sistemas tipográficos nunca exploran. Este control granular del peso otorga a cada elemento de texto un peso visual calibrado con precisión, creando jerarquía mediante micro-diferencias en lugar del instrumento contundente de "regular vs negrita".

La página presenta una dualidad fascinante: el cromo de la interfaz es estrictamente en blanco y negro (literalmente solo `#000000` y `#ffffff` detectados como colores), mientras que la sección hero y las presentaciones de producto estallan con vibrantes degradados multicolor — verdes eléctricos, amarillos brillantes, púrpuras profundos, rosas intensos. Esta separación significa que el sistema de diseño en sí mismo es incoloro, tratando la colorida salida del producto como el contenido protagonista. La página de marketing de Figma es esencialmente una galería de paredes blancas que exhibe arte colorido.

Lo que hace distintiva a Figma más allá de la fuente variable es su geometría de círculos y píldoras. Los botones usan un radio de 50px (píldora) o 50% (círculo perfecto para botones de icono), creando una sensación orgánica similar a una paleta de herramientas. El indicador de foco de contorno discontinuo (`dashed 2px`) es una elección de diseño deliberada que evoca los manejadores de selección en el propio editor de Figma — el lenguaje visual del sitio web hace referencia al lenguaje visual del producto.

**Características Clave:**
- Fuente variable personalizada (figmaSans) con pasos de peso inusuales: 320, 330, 340, 450, 480, 540, 700
- Cromo de interfaz estrictamente en blanco y negro — el color existe únicamente en el contenido del producto
- figmaMono para etiquetas técnicas en mayúsculas con amplio espaciado entre letras
- Geometría de botones en píldora (50px) y circular (50%)
- Contornos de foco discontinuos que evocan los manejadores de selección del editor de Figma
- Vibrantes degradados multicolor en el hero (verde, amarillo, púrpura, rosa)
- Función OpenType `"kern"` habilitada globalmente
- Espaciado entre letras negativo en todo el sitio — incluso el texto de cuerpo a -0.14px o -0.26px

## 2. Paleta de Colores y Roles

### Primario
- **Negro Puro** (`#000000`): Todo el texto, todos los botones sólidos, todos los bordes. El único "color" de la interfaz.
- **Blanco Puro** (`#ffffff`): Todos los fondos, botones blancos, texto sobre superficies oscuras. La otra mitad del binario.

*Nota: El sitio de marketing de Figma utiliza ÚNICAMENTE estos dos colores para su capa de interfaz. Todos los colores vibrantes aparecen exclusivamente en capturas de pantalla del producto, degradados del hero y contenido incrustado.*

### Superficies y Fondos
- **Blanco Puro** (`#ffffff`): Fondo principal de página y superficies de tarjeta.
- **Negro Cristal** (`rgba(0, 0, 0, 0.08)`): Superposición oscura sutil para botones circulares secundarios y efectos de cristal.
- **Blanco Cristal** (`rgba(255, 255, 255, 0.16)`): Superposición de cristal esmerilado para botones sobre superficies oscuras o de color.

### Sistema de Degradados
- **Degradado Hero**: Un vibrante degradado de múltiples pasos con verde eléctrico, amarillo brillante, púrpura profundo y rosa intenso. Este degradado es la firma visual de la sección hero — representa las posibilidades creativas de la herramienta.
- **Degradados de Sección de Producto**: Las áreas individuales del producto (Design, Dev Mode, Prototyping) pueden usar temas de color distintos en sus presentaciones.

## 3. Reglas Tipográficas

### Familia de Fuentes
- **Principal**: `figmaSans`, con alternativas: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monoespaciado / Etiquetas**: `figmaMono`, con alternativas: `figmaMono Fallback, SF Mono, menlo`

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Espaciado de Letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (ajustado) | -1.72px | Máximo impacto, tracking extremo |
| Encabezado de Sección | figmaSans | 64px (4rem) | 400 | 1.10 (ajustado) | -0.96px | Títulos de sección de funciones |
| Subencabezado | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Texto de sección enfatizado |
| Subencabezado Light | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Texto de sección de peso ligero |
| Título de Función | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Encabezados de tarjeta en negrita |
| Cuerpo Grande | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px a -0.14px | Descripciones, introducciones |
| Cuerpo / Botón | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px a normal | Cuerpo estándar, nav, botones |
| Cuerpo Light | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px a normal | Texto de cuerpo de peso ligero |
| Etiqueta Mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (ajustado) | 0.54px | Etiquetas de sección en mayúsculas |
| Mono Pequeño | figmaMono | 12px (0.75rem) | 400 | 1.00 (ajustado) | 0.6px | Etiquetas diminutas en mayúsculas |

### Principios
- **Precisión de fuente variable**: figmaSans usa pesos que la mayoría de los sistemas nunca utilizan — 320, 330, 340, 450, 480, 540. Esto crea jerarquía mediante diferencias sutiles de peso en lugar de saltos dramáticos. La diferencia entre 330 y 340 es casi imperceptible, pero estructuralmente significativa.
- **El peso ligero como base**: La mayor parte del texto de cuerpo usa 320–340 (más ligero que el "regular" 400 típico), creando una experiencia de lectura etérea y aireada que se corresponde con la estética de herramienta de diseño.
- **Kern en todas partes**: Cada elemento de texto habilita la función OpenType `"kern"` — el kerning no es opcional, es estructural.
- **Tracking negativo por defecto**: Incluso el texto de cuerpo usa -0.1px a -0.26px de espaciado entre letras, creando texto universalmente comprimido. El texto de display se comprime aún más a -0.96px y -1.72px.
- **Mono para la estructura**: figmaMono en mayúsculas con espaciado positivo entre letras (0.54px–0.6px) crea etiquetas de señalización técnica.

## 4. Estilos de Componentes

### Botones

**Sólido Negro (Píldora)**
- Fondo: Negro Puro (`#000000`)
- Texto: Blanco Puro (`#ffffff`)
- Radio: círculo (50%) para botones de icono
- Foco: contorno discontinuo de 2px
- Máximo énfasis

**Píldora Blanca**
- Fondo: Blanco Puro (`#ffffff`)
- Texto: Negro Puro (`#000000`)
- Padding: 8px 18px 10px (vertical asimétrico)
- Radio: píldora (50px)
- Foco: contorno discontinuo de 2px
- CTA estándar sobre superficies oscuras o de color

**Cristal Oscuro**
- Fondo: `rgba(0, 0, 0, 0.08)` (superposición oscura sutil)
- Texto: Negro Puro
- Radio: círculo (50%)
- Foco: contorno discontinuo de 2px
- Acción secundaria sobre superficies claras

**Cristal Claro**
- Fondo: `rgba(255, 255, 255, 0.16)` (cristal esmerilado)
- Texto: Blanco Puro
- Radio: círculo (50%)
- Foco: contorno discontinuo de 2px
- Acción secundaria sobre superficies oscuras o de color

### Tarjetas y Contenedores
- Fondo: Blanco Puro
- Borde: ninguno o mínimo
- Radio: 6px (contenedores pequeños), 8px (imágenes, tarjetas, diálogos)
- Sombra: efectos de elevación de sutil a medio
- Capturas de pantalla del producto como contenido de tarjeta

### Navegación
- Nav horizontal limpio sobre fondo blanco
- Logo: wordmark de Figma en negro
- Pestañas de producto: navegación por pestañas en forma de píldora (50px)
- Enlaces: texto negro, decoración de subrayado de 1px
- CTA: botón en píldora negra
- Hover: color de texto mediante variable CSS

### Componentes Distintivos

**Barra de Pestañas de Producto**
- Pestañas horizontales en forma de píldora (radio 50px)
- Cada pestaña representa un área de producto de Figma (Design, Dev Mode, Prototyping, etc.)
- Pestaña activa resaltada

**Sección de Degradado Hero**
- Fondo de degradado multicolor vibrante a ancho completo
- Superposición de texto blanco con encabezado de display de 86px
- Capturas de pantalla del producto flotando dentro del degradado

**Indicadores de Foco Discontinuos**
- Todos los elementos interactivos usan contorno `dashed 2px` al recibir foco
- Hace referencia a los manejadores de selección del editor de Figma
- Una elección de meta-diseño que conecta el sitio web con el producto

## 5. Principios de Maquetación

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Cuadrícula y Contenedor
- Ancho máximo del contenedor: hasta 1920px
- Hero: degradado a ancho completo con contenido centrado
- Secciones de producto: presentaciones alternas
- Pie de página: sección oscura a ancho completo
- Responsivo desde 559px hasta 1920px

### Filosofía del Espacio en Blanco
- **Ritmo de galería**: El espaciado generoso permite que cada sección de producto respire como su propia exhibición.
- **Secciones de color como respiro visual**: El hero con degradado y las presentaciones de producto ofrecen alivio cromático entre las secciones monocromas de la interfaz.

### Escala de Radio de Borde
- Mínimo (2px): Elementos de enlace pequeños
- Sutil (6px): Contenedores pequeños, divisores
- Cómodo (8px): Tarjetas, imágenes, diálogos
- Píldora (50px): Botones de pestaña, CTAs
- Círculo (50%): Botones de icono, elementos circulares

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra | Fondo de página, la mayor parte del texto |
| Superficie (Nivel 1) | Tarjeta blanca sobre sección degradada/oscura | Tarjetas, presentaciones de producto |
| Elevado (Nivel 2) | Sombra sutil | Tarjetas flotantes, estados hover |

**Filosofía de Sombras**: Figma usa las sombras con moderación. Los principales mecanismos de profundidad son el **contraste de fondo** (contenido blanco sobre secciones coloridas/oscuras) y la dimensionalidad inherente de las propias capturas de pantalla del producto.

## 7. Lo Que Debes y No Debes Hacer

### Debes Hacer
- Usar figmaSans con pesos variables precisos (320–540) — el control granular del peso ES el diseño
- Mantener la interfaz estrictamente en blanco y negro — el color proviene únicamente del contenido del producto
- Usar geometría de píldora (50px) y circular (50%) para todos los elementos interactivos
- Aplicar contornos de foco discontinuos de 2px — el patrón de accesibilidad distintivo
- Habilitar la función `"kern"` en todo el texto
- Usar figmaMono en mayúsculas con espaciado positivo entre letras para etiquetas
- Aplicar espaciado entre letras negativo en todo el sitio (-0.1px a -1.72px)

### No Debes Hacer
- No añadir colores a la interfaz — la paleta monocroma es absoluta
- No usar pesos de fuente estándar (400, 500, 600, 700) — usa los pasos únicos de la fuente variable (320, 330, 340, 450, 480, 540)
- No usar esquinas afiladas en los botones — únicamente geometría de píldora y circular
- No usar contornos de foco sólidos — el discontinuo es el distintivo
- No aumentar el peso de la fuente del cuerpo por encima de 450 — la estética de peso ligero es fundamental
- No usar espaciado positivo entre letras en el texto de cuerpo — siempre es negativo

## 8. Comportamiento Responsivo

### Puntos de Quiebre
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil Pequeño | <560px | Maquetación compacta, apilada |
| Tablet | 560–768px | Ajustes menores |
| Escritorio Pequeño | 768–960px | Maquetaciones de 2 columnas |
| Escritorio | 960–1280px | Maquetación estándar |
| Escritorio Grande | 1280–1440px | Expandido |
| Ultra-ancho | 1440–1920px | Ancho máximo |

### Estrategia de Colapso
- Texto del hero: 86px → 64px → 48px
- Pestañas de producto: desplazamiento horizontal en móvil
- Secciones de función: columna única apilada
- Pie de página: multicolumna → apilado

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Colores
- Todo: "Negro Puro (#000000)" y "Blanco Puro (#ffffff)"
- Cristal Oscuro: "rgba(0, 0, 0, 0.08)"
- Cristal Claro: "rgba(255, 255, 255, 0.16)"

### Ejemplos de Prompts para Componentes
- "Crea un hero sobre un degradado multicolor vibrante (verde, amarillo, púrpura, rosa). Titular a 86px figmaSans weight 400, line-height 1.0, letter-spacing -1.72px. Texto blanco. Botón CTA en píldora blanca (radio 50px, padding 8px 18px)."
- "Diseña una barra de pestañas de producto con botones en forma de píldora (radio 50px). Activo: fondo negro, texto blanco. Inactivo: transparente, texto negro. figmaSans a 20px weight 480."
- "Construye una etiqueta de sección: figmaMono 18px, mayúsculas, letter-spacing 0.54px, texto negro. Kern habilitado."
- "Crea texto de cuerpo a 20px figmaSans weight 330, line-height 1.40, letter-spacing -0.14px. Negro Puro sobre blanco."

### Guía de Iteración
1. Usa los pasos de peso de la fuente variable con precisión: 320, 330, 340, 450, 480, 540, 700
2. La interfaz siempre es negro + blanco — nunca añadas colores al cromo
3. Contornos de foco discontinuos, no sólidos
4. El espaciado entre letras siempre es negativo en el cuerpo, siempre positivo en las etiquetas mono
5. Píldora (50px) para botones/pestañas, círculo (50%) para botones de icono
