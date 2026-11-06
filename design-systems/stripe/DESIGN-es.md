# Sistema de Diseño Inspirado en Stripe

> Category: Fintech y Cripto
> Infraestructura de pagos. Gradientes morados característicos, elegancia en peso 300.

## 1. Tema Visual y Atmósfera

El sitio web de Stripe es el estándar de oro del diseño fintech — un sistema que logra sentirse simultáneamente técnico y lujoso, preciso y cálido. La página abre sobre un lienzo blanco limpio (`#ffffff`) con encabezados azul marino profundo (`#061b31`) y un morado característico (`#533afd`) que funciona tanto como ancla de marca como acento interactivo. No es el morado frío y clínico del software empresarial; es un violeta rico y saturado que transmite confianza y distinción. La impresión general es la de una institución financiera rediseñada por una fundidora tipográfica de clase mundial.

La fuente variable personalizada `sohne-var` es el elemento definitorio de la identidad visual de Stripe. Cada elemento de texto habilita el conjunto estilístico OpenType `"ss01"`, que modifica las formas de los caracteres para lograr una sensación decididamente geométrica y moderna. En tamaños de visualización (48px-56px), sohne-var corre con peso 300 — un peso extraordinariamente ligero para titulares que crea una autoridad etérea, casi susurrada. Esto es lo opuesto a la convención del "titular de héroe en negrita"; los titulares de Stripe se sienten tan seguros que no necesitan peso para ser autoritarios. El espaciado de letras negativo (-1.4px a 56px, -0.96px a 48px) comprime el texto en bloques densos y bien construidos. En tamaños más pequeños, el sistema también usa peso 300 con tracking proporcionalmente reducido, y numerales tabulares mediante `"tnum"` para la presentación de datos financieros.

Lo que verdaderamente distingue a Stripe es su sistema de sombras. En lugar del enfoque plano o de una sola capa de la mayoría de los sitios, Stripe usa sombras multicapa con tinte azul: el característico `rgba(50,50,93,0.25)` combinado con `rgba(0,0,0,0.1)` crea sombras con una profundidad fría, casi atmosférica — como si los elementos flotaran en un cielo crepuscular. El matiz azul-grisáceo del color de sombra primario (50,50,93) se vincula directamente con la paleta de marca azul marino-morado, haciendo que incluso la elevación se sienta acorde con la marca.

**Características Clave:**
- sohne-var con OpenType `"ss01"` en todo el texto — un conjunto estilístico personalizado que define las formas tipográficas de la marca
- Peso 300 como peso de titular característico — ligero, seguro, anticonvencional
- Espaciado de letras negativo en tamaños de visualización (-1.4px a 56px, relajación progresiva hacia abajo)
- Sombras multicapa con tinte azul usando `rgba(50,50,93,0.25)` — elevación que se siente con color de marca
- Encabezados azul marino profundo (`#061b31`) en lugar de negro — cálido, premium, de grado financiero
- Radio de borde conservador (4px-8px) — nada en forma de pastilla, nada brusco
- Acentos rubí (`#ea2261`) y magenta (`#f96bee`) para elementos de gradiente y decorativos
- `SourceCodePro` como tipografía monoespaciada complementaria para código y etiquetas técnicas

## 2. Paleta de Colores y Roles

### Primarios
- **Morado Stripe** (`#533afd`): Color primario de marca, fondos de CTA, texto de enlaces, resaltados interactivos. Un azul-violeta saturado que ancla todo el sistema.
- **Azul Marino Profundo** (`#061b31`): `--hds-color-heading-solid`. Color primario de encabezados. No negro, no gris — un azul muy oscuro que añade calidez y profundidad al texto.
- **Blanco Puro** (`#ffffff`): Fondo de página, superficies de tarjeta, texto de botón sobre fondos oscuros.

### Marca y Oscuros
- **Marca Oscuro** (`#1c1e54`): `--hds-color-util-brand-900`. Índigo profundo para secciones oscuras, fondos de pie de página y momentos de marca inmersivos.
- **Azul Marino Oscuro** (`#0d253d`): `--hds-color-core-neutral-975`. El neutro más oscuro — casi negro con un matiz azul para máxima profundidad sin dureza.

### Colores de Acento
- **Rubí** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Rojo-rosa cálido para iconos, alertas y elementos de acento.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Rosa-morado vívido para gradientes y resaltados decorativos.
- **Magenta Claro** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Superficie teñida para tarjetas y etiquetas con temática magenta.

### Interactivos
- **Morado Primario** (`#533afd`): Color primario de enlace, estados activos, elementos seleccionados.
- **Morado en Hover** (`#4434d4`): Morado más oscuro para estados hover sobre elementos primarios.
- **Morado Profundo** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Morado oscuro para estados hover de íconos.
- **Morado Claro** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Lavanda suave para fondos hover atenuados.
- **Morado Medio** (`#665efd`): `--hds-color-input-selector-text-range`. Selector de rango y color de resaltado de entrada.

### Escala de Neutros
- **Encabezado** (`#061b31`): Encabezados primarios, texto de navegación, etiquetas destacadas.
- **Etiqueta** (`#273951`): `--hds-color-input-text-label`. Etiquetas de formulario, encabezados secundarios.
- **Cuerpo** (`#64748d`): Texto secundario, descripciones, pies de foto.
- **Verde Éxito** (`#15be53`): Insignias de estado, indicadores de éxito (con alfa 0.2-0.4 para fondos/bordes).
- **Texto Éxito** (`#108c3d`): Color de texto para insignias de éxito.
- **Limón** (`#9b6829`): `--hds-color-core-lemon-500`. Acento de advertencia y resaltado.

### Superficies y Bordes
- **Borde Predeterminado** (`#e5edf5`): Color de borde estándar para tarjetas, divisores y contenedores.
- **Borde Morado** (`#b9b9f9`): Bordes de estado activo/seleccionado en botones y entradas.
- **Borde Morado Suave** (`#d6d9fc`): Bordes sutiles con tinte morado para elementos secundarios.
- **Borde Magenta** (`#ffd7ef`): Bordes con tinte rosa para elementos con temática magenta.
- **Borde Discontinuo** (`#362baa`): Bordes discontinuos para zonas de colocación y elementos de marcador de posición.

### Colores de Sombra
- **Sombra Azul** (`rgba(50,50,93,0.25)`): La característica — color de sombra primaria con tinte azul.
- **Sombra Azul Oscuro** (`rgba(3,3,39,0.25)`): Sombra azul más profunda para elementos elevados.
- **Sombra Negro** (`rgba(0,0,0,0.1)`): Capa de sombra secundaria para refuerzo de profundidad.
- **Sombra Ambiental** (`rgba(23,23,23,0.08)`): Sombra ambiental suave para elevación sutil.
- **Sombra Tenue** (`rgba(23,23,23,0.06)`): Sombra ambiental mínima para elevación ligera.

## 3. Reglas Tipográficas

### Familia de Fuentes
- **Primaria**: `sohne-var`, con fallback: `SF Pro Display`
- **Monoespaciada**: `SourceCodePro`, con fallback: `SFMono-Regular`
- **Características OpenType**: `"ss01"` habilitado globalmente en todo el texto sohne-var; `"tnum"` para números tabulares en datos financieros y pies de foto.

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Espaciado de Letras | Características | Notas |
|------|------|------|--------|-------------|----------------|----------|-------|
| Héroe de Visualización | sohne-var | 56px (3.50rem) | 300 | 1.03 (ajustado) | -1.4px | ss01 | Tamaño máximo, autoridad de peso susurro |
| Visualización Grande | sohne-var | 48px (3.00rem) | 300 | 1.15 (ajustado) | -0.96px | ss01 | Titulares de héroe secundarios |
| Encabezado de Sección | sohne-var | 32px (2.00rem) | 300 | 1.10 (ajustado) | -0.64px | ss01 | Títulos de sección de características |
| Subencabezado Grande | sohne-var | 26px (1.63rem) | 300 | 1.12 (ajustado) | -0.26px | ss01 | Encabezados de tarjeta, subsecciones |
| Subencabezado | sohne-var | 22px (1.38rem) | 300 | 1.10 (ajustado) | -0.22px | ss01 | Encabezados de sección más pequeños |
| Cuerpo Grande | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Descripciones de características, texto introductorio |
| Cuerpo | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Texto de lectura estándar |
| Botón | sohne-var | 16px (1.00rem) | 400 | 1.00 (ajustado) | normal | ss01 | Texto de botón primario |
| Botón Pequeño | sohne-var | 14px (0.88rem) | 400 | 1.00 (ajustado) | normal | ss01 | Botones secundarios/compactos |
| Enlace | sohne-var | 14px (0.88rem) | 400 | 1.00 (ajustado) | normal | ss01 | Enlaces de navegación |
| Pie de Foto | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Etiquetas pequeñas, metadatos |
| Pie de Foto Pequeño | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | Letra pequeña, marcas de tiempo |
| Pie de Foto Tabular | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Datos financieros, números |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (ajustado) | 0.1px | ss01 | Etiquetas diminutas, marcadores de eje |
| Micro Tabular | sohne-var | 10px (0.63rem) | 300 | 1.15 (ajustado) | -0.3px | tnum | Datos de gráficos, números pequeños |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (ajustado) | normal | ss01 | Las etiquetas más pequeñas |
| Código Cuerpo | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (relajado) | normal | -- | Bloques de código, sintaxis |
| Código Negrita | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (relajado) | normal | -- | Código en negrita, palabras clave |
| Etiqueta de Código | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (relajado) | normal | mayúsculas | Etiquetas técnicas |
| Código Micro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (ajustado) | normal | ss01 | Anotaciones de código diminutas |

### Principios
- **Peso ligero como firma**: El peso 300 en tamaños de visualización es la elección tipográfica más distintiva de Stripe. Donde otros usan 600-700 para captar atención, Stripe usa la ligereza como lujo — el texto está tan seguro de sí mismo que no necesita peso para ser autoritario.
- **ss01 en todas partes**: El conjunto estilístico `"ss01"` no es negociable. Modifica glifos específicos (probablemente formas alternativas de `a`, `g`, `l`) para crear una sensación más geométrica y contemporánea en todo el texto sohne-var.
- **Dos modos OpenType**: `"ss01"` para texto de visualización/cuerpo, `"tnum"` para numerales tabulares en datos financieros. Estos nunca se superponen — un número en un párrafo usa ss01, un número en una tabla de datos usa tnum.
- **Tracking progresivo**: El espaciado de letras se ajusta proporcionalmente con el tamaño: -1.4px a 56px, -0.96px a 48px, -0.64px a 32px, -0.26px a 26px, normal a 16px y menos.
- **Simplicidad de dos pesos**: Principalmente 300 (cuerpo y encabezados) y 400 (UI/botones). Sin negrita (700) en la fuente primaria — SourceCodePro usa 500/700 para contraste en código.

## 4. Estilos de Componentes

### Botones

**Morado Primario**
- Fondo: `#533afd`
- Texto: `#ffffff`
- Relleno: 8px 16px
- Radio: 4px
- Fuente: 16px sohne-var peso 400, `"ss01"`
- Hover: fondo `#4434d4`
- Uso: CTA primario ("Comenzar ahora", "Contactar ventas")

**Fantasma / Delineado**
- Fondo: transparente
- Texto: `#533afd`
- Relleno: 8px 16px
- Radio: 4px
- Borde: `1px solid #b9b9f9`
- Fuente: 16px sohne-var peso 400, `"ss01"`
- Hover: el fondo cambia a `rgba(83,58,253,0.05)`
- Uso: Acciones secundarias

**Informativo Transparente**
- Fondo: transparente
- Texto: `#2874ad`
- Relleno: 8px 16px
- Radio: 4px
- Borde: `1px solid rgba(43,145,223,0.2)`
- Uso: Acciones terciarias/de nivel informativo

**Fantasma Neutro**
- Fondo: transparente (`rgba(255,255,255,0)`)
- Texto: `rgba(16,16,16,0.3)`
- Relleno: 8px 16px
- Radio: 4px
- Contorno: `1px solid rgb(212,222,233)`
- Uso: Acciones deshabilitadas o silenciadas

### Tarjetas y Contenedores
- Fondo: `#ffffff`
- Borde: `1px solid #e5edf5` (estándar) o `1px solid #061b31` (acento oscuro)
- Radio: 4px (ajustado), 5px (estándar), 6px (cómodo), 8px (destacado)
- Sombra (estándar): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Sombra (ambiental): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: la sombra se intensifica, a menudo añadiendo la capa con tinte azul

### Insignias / Etiquetas / Píldoras
**Píldora Neutra**
- Fondo: `#ffffff`
- Texto: `#000000`
- Relleno: 0px 6px
- Radio: 4px
- Borde: `1px solid #f6f9fc`
- Fuente: 11px peso 400

**Insignia de Éxito**
- Fondo: `rgba(21,190,83,0.2)`
- Texto: `#108c3d`
- Relleno: 1px 6px
- Radio: 4px
- Borde: `1px solid rgba(21,190,83,0.4)`
- Fuente: 10px peso 300

### Entradas y Formularios
- Borde: `1px solid #e5edf5`
- Radio: 4px
- Foco: `1px solid #533afd` o anillo morado
- Etiqueta: `#273951`, 14px sohne-var
- Texto: `#061b31`
- Marcador de posición: `#64748d`

### Navegación
- Navegación horizontal limpia sobre blanco, fija con fondo desenfocado
- Logotipo de marca alineado a la izquierda
- Enlaces: sohne-var 14px peso 400, texto `#061b31` con `"ss01"`
- Radio: 6px en el contenedor de navegación
- CTA: botón morado alineado a la derecha ("Iniciar sesión", "Comenzar ahora")
- Móvil: botón de menú hamburguesa con radio de 6px

### Elementos Decorativos
**Bordes Discontinuos**
- `1px dashed #362baa` (morado) para zonas de marcador de posición/colocación
- `1px dashed #ffd7ef` (magenta) para bordes decorativos con temática magenta

**Acentos de Gradiente**
- Gradientes de rubí a magenta (`#ea2261` a `#f96bee`) para decoraciones de héroe
- Las secciones oscuras de marca usan fondos `#1c1e54` con texto blanco

## 5. Principios de Diseño

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Notable: La escala es densa en el extremo pequeño (cada 2px de 4 a 12), lo que refleja la UI orientada a la precisión de Stripe para datos financieros

### Cuadrícula y Contenedor
- Ancho máximo del contenido: aproximadamente 1080px
- Héroe: columna única centrada con relleno generoso, titulares ligeros
- Secciones de características: cuadrículas de 2-3 columnas para tarjetas de características
- Secciones oscuras de ancho completo con fondo `#1c1e54` para inmersión de marca
- Vistas previas de código/panel como tarjetas contenidas con sombras con tinte azul

### Filosofía del Espacio en Blanco
- **Espaciado de precisión**: A diferencia del vasto vacío de los sistemas minimalistas, Stripe usa un espacio en blanco medido y deliberado. Cada espacio es una elección tipográfica intencional.
- **Datos densos, cromado generoso**: Las pantallas de datos financieros (tablas, gráficos) están empaquetadas de forma ajustada, pero el cromado de la UI alrededor de ellas tiene un espaciado generoso. Esto crea una sensación de densidad controlada — como una hoja de cálculo bien organizada en un marco hermoso.
- **Ritmo de sección**: Las secciones blancas alternan con secciones oscuras de marca (`#1c1e54`), creando una cadencia dramática de claro/oscuro que evita la monotonía sin introducir color arbitrario.

### Escala de Radio de Borde
- Micro (1px): Elementos de grano fino, redondeo sutil
- Estándar (4px): Botones, entradas, insignias, tarjetas — el caballo de batalla
- Cómodo (5px): Contenedores de tarjeta estándar
- Relajado (6px): Navegación, elementos interactivos más grandes
- Grande (8px): Tarjetas destacadas, elementos de héroe
- Compuesto: `0px 0px 6px 6px` para contenedores redondeados en la parte inferior (paneles de pestañas, pies de menú desplegable)

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra | Fondo de página, texto en línea |
| Ambiental (Nivel 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Elevación sutil de tarjeta, indicaciones de hover |
| Estándar (Nivel 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Tarjetas estándar, paneles de contenido |
| Elevado (Nivel 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Tarjetas destacadas, menús desplegables, popovers |
| Profundo (Nivel 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modales, paneles flotantes |
| Anillo (Accesibilidad) | Contorno `2px solid #533afd` | Anillo de foco de teclado |

**Filosofía de Sombras**: El sistema de sombras de Stripe se construye sobre un principio de profundidad cromática. Donde la mayoría de los sistemas de diseño usan sombras de gris neutro o negro, el color de sombra primario de Stripe (`rgba(50,50,93,0.25)`) es un azul-gris profundo que se hace eco de la paleta azul marino de la marca. Esto crea sombras que no solo añaden profundidad — añaden atmósfera de marca. El enfoque multicapa empareja esta sombra con tinte azul con una capa secundaria de negro puro (`rgba(0,0,0,0.1)`) a un desplazamiento diferente, creando una profundidad de tipo paralaje donde la sombra de marca se sitúa más lejos del elemento y la sombra neutra se sitúa más cerca. Los valores de extensión negativos (-30px, -18px) aseguran que las sombras no se extiendan más allá de la huella horizontal del elemento, manteniendo la elevación vertical y controlada.

### Profundidad Decorativa
- Las secciones oscuras de marca (`#1c1e54`) crean profundidad inmersiva mediante contraste de color de fondo
- Superposiciones de gradiente con transiciones de rubí a magenta para decoraciones de héroe
- Color de sombra `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) para sombras de borde superior en elementos fijos

## 7. Lo que Se Debe y No Se Debe Hacer

### Se Debe
- Usar sohne-var con `"ss01"` en cada elemento de texto — el conjunto estilístico ES la marca
- Usar peso 300 para todos los titulares y texto del cuerpo — la ligereza es la firma
- Aplicar sombras con tinte azul (`rgba(50,50,93,0.25)`) para todos los elementos elevados
- Usar `#061b31` (azul marino profundo) para los encabezados en lugar de `#000000` — la calidez importa
- Mantener el radio de borde entre 4px-8px — el redondeo conservador es intencional
- Usar `"tnum"` para cualquier presentación de números tabulares/financieros
- Superponer sombras: tinte azul lejano + neutro cercano para paralaje de profundidad
- Usar el morado `#533afd` como color interactivo/CTA primario

### No Se Debe
- No usar peso 600-700 para titulares sohne-var — el peso 300 es la voz de la marca
- No usar radio de borde grande (12px+, formas de pastilla) en tarjetas o botones — Stripe es conservador
- No usar sombras grises neutras — siempre teñir con azul (`rgba(50,50,93,...)`)
- No omitir `"ss01"` en ningún texto sohne-var — los glifos alternativos definen la personalidad
- No usar negro puro (`#000000`) para los encabezados — siempre `#061b31` azul marino profundo
- No usar colores de acento cálidos (naranja, amarillo) para elementos interactivos — el morado es primario
- No aplicar espaciado de letras positivo en tamaños de visualización — Stripe ajusta apretado
- No usar los acentos magenta/rubí para botones o enlaces — son solo decorativos/de gradiente

## 8. Comportamiento Responsivo

### Puntos de Quiebre
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil | <640px | Columna única, tamaños de encabezado reducidos, tarjetas apiladas |
| Tableta | 640-1024px | Cuadrículas de 2 columnas, relleno moderado |
| Escritorio | 1024-1280px | Diseño completo, cuadrículas de características de 3 columnas |
| Escritorio Grande | >1280px | Contenido centrado con márgenes generosos |

### Objetivos Táctiles
- Los botones usan relleno cómodo (8px-16px vertical)
- Los enlaces de navegación a 14px con espaciado adecuado
- Las insignias tienen un relleno horizontal mínimo de 6px para objetivos de toque
- Botón de alternar de navegación móvil con radio de 6px

### Estrategia de Colapso
- Héroe: 56px de visualización -> 32px en móvil, peso 300 mantenido
- Navegación: enlaces horizontales + CTAs -> alternar hamburguesa
- Tarjetas de características: 3 columnas -> 2 columnas -> columna única apilada
- Secciones oscuras de marca: mantener tratamiento de ancho completo, reducir relleno interno
- Tablas de datos financieros: desplazamiento horizontal en móvil
- Espaciado de sección: 64px+ -> 40px en móvil
- La escala tipográfica se comprime: tamaños de héroe 56px -> 48px -> 32px en los puntos de quiebre

### Comportamiento de Imágenes
- Las capturas de pantalla del panel/producto mantienen la sombra con tinte azul en todos los tamaños
- Las decoraciones de gradiente del héroe se simplifican en móvil
- Los bloques de código mantienen el tratamiento `SourceCodePro`, pueden desplazarse horizontalmente
- Las imágenes de tarjeta mantienen un radio de borde consistente de 4px-6px

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Colores
- CTA primario: Morado Stripe (`#533afd`)
- Hover de CTA: Morado Oscuro (`#4434d4`)
- Fondo: Blanco Puro (`#ffffff`)
- Texto de encabezado: Azul Marino Profundo (`#061b31`)
- Texto del cuerpo: Pizarra (`#64748d`)
- Texto de etiqueta: Pizarra Oscura (`#273951`)
- Borde: Azul Suave (`#e5edf5`)
- Enlace: Morado Stripe (`#533afd`)
- Sección oscura: Marca Oscura (`#1c1e54`)
- Éxito: Verde (`#15be53`)
- Acento decorativo: Rubí (`#ea2261`), Magenta (`#f96bee`)

### Prompts de Componentes de Ejemplo
- "Crea una sección de héroe sobre fondo blanco. Titular a 48px sohne-var peso 300, line-height 1.15, letter-spacing -0.96px, color #061b31, font-feature-settings 'ss01'. Subtítulo a 18px peso 300, line-height 1.40, color #64748d. Botón CTA morado (#533afd, radio 4px, relleno 8px 16px, texto blanco) y botón fantasma (transparente, 1px solid #b9b9f9, texto #533afd, radio 4px)."
- "Diseña una tarjeta: fondo blanco, borde 1px solid #e5edf5, radio 6px. Sombra: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Título a 22px sohne-var peso 300, letter-spacing -0.22px, color #061b31, 'ss01'. Cuerpo a 16px peso 300, #64748d."
- "Construye una insignia de éxito: fondo rgba(21,190,83,0.2), texto #108c3d, radio 4px, relleno 1px 6px, 10px sohne-var peso 300, borde 1px solid rgba(21,190,83,0.4)."
- "Crea navegación: encabezado fijo blanco con backdrop-filter blur(12px). sohne-var 14px peso 400 para enlaces, texto #061b31, 'ss01'. CTA morado 'Comenzar ahora' alineado a la derecha (fondo #533afd, texto blanco, radio 4px). Contenedor de nav radio 6px."
- "Diseña una sección oscura de marca: fondo #1c1e54, texto blanco. Titular 32px sohne-var peso 300, letter-spacing -0.64px, 'ss01'. Cuerpo 16px peso 300, rgba(255,255,255,0.7). Las tarjetas internas usan borde rgba(255,255,255,0.1) con radio 6px."

### Guía de Iteración
1. Siempre habilitar `font-feature-settings: "ss01"` en el texto sohne-var — este es el ADN tipográfico de la marca
2. El peso 300 es el predeterminado; usar 400 solo para botones/enlaces/navegación
3. Fórmula de sombra: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` donde Y1/B1 son más grandes (sombra lejana) y Y2/B2 son más pequeños (sombra cercana)
4. El color del encabezado es `#061b31` (azul marino profundo), el cuerpo es `#64748d` (pizarra), las etiquetas son `#273951` (pizarra oscura)
5. El radio de borde se mantiene en el rango de 4px-8px — nunca usar formas de pastilla o redondeo grande
6. Usar `"tnum"` para cualquier número en tablas, gráficos o pantallas financieras
7. Las secciones oscuras usan `#1c1e54` — no negro, no gris, sino un índigo de marca profundo
8. SourceCodePro para código a 12px/500 con line-height de 2.00 (muy generoso para legibilidad)
