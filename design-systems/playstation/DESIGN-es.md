# Design System Inspired by PlayStation

> Category: Medios y consumidor
> Venta al público de consolas de videojuegos. Diseño de tres superficies en canal, tipografía de autoridad discreta, escala con hover en cian.

## 1. Tema Visual y Atmósfera

PlayStation.com se presenta como el brazo de marketing de una marca premium de electrónica de consumo que, además, vende entretenimiento. La página se organiza como un **canal vertical de superficies alternadas**: un encabezado y hero casi negro, una secuencia de paneles editoriales en blanco papel en el centro, y un pie de página en azul cobalto profundo que ancla toda la experiencia. Entre esos modos de superficie, el sitio apuesta fuerte por la fotografía y los renders 3D de productos — la consola PS5, las portadas de juegos, los mandos DualSense — dejando que el hardware realice el trabajo emocional mientras el cromo permanece contenido.

El movimiento tipográfico distintivo es **SST Light (peso 300) en tamaños grandes**. La familia SST personalizada de Sony se usa desde 22px hasta 54px en peso 300, lo que otorga a los titulares de visualización una calidad susurrada y elegante que se acerca más a un anuncio de relojes de lujo que a una tienda de videojuegos. Esa "autoridad discreta" es exactamente lo contrario a la contundencia de Manuka de The Verge o la densidad de quiosco de Wired — PlayStation quiere que la tipografía se retraiga y el producto lidere. El cuerpo y la interfaz apuestan por pesos 500–700, pero la voz de *visualización* es consistentemente fina y calmada.

El único lugar donde se rompe la contención es en la **interacción**. Cada botón principal tiene el mismo movimiento de hover: el relleno cambia a un cian eléctrico `#1eaedb`, aparece un borde blanco de 2px, un anillo exterior azul de PlayStation de 2px florece detrás de él, y el botón completo **escala hasta 1,2×**. Esa combinación de destellos de color, borde, anillo y escala de elevación es un movimiento distintivo único de Sony entre las grandes marcas — una animación de "encendido" en miniatura que el sitio repite cientos de veces a lo largo de una sola página.

**Características clave:**
- Diseño de tres superficies en canal: hero casi negro, contenido en blanco papel, pie de página en azul cobalto — alternadas, nunca mezcladas
- SST peso 300 en 22–54px para visualización — titulares de "autoridad discreta" que dejan que la fotografía del producto lidere
- PlayStation Blue `#0070cc` como ancla de marca; cian `#1eaedb` reservado exclusivamente para estados de hover/focus
- Cada elemento interactivo escala 1,2× en hover — una firma de "encendido" única de PlayStation
- Botones en píldora con radio completo de 999px; arte de tarjetas en rectángulos redondeados de 12–24px
- Commerce-orange `#d53b00` usado exclusivamente para CTAs de PlayStation Store / estado de compra
- Cobertura amplia de breakpoints hasta 2120px — el sitio escala hasta contextos de navegación en TV 4K

## 2. Paleta de Colores y Roles

### Principal (Ancla de Marca)
- **PlayStation Blue** (`#0070cc`): El color ancla de la marca. Se usa en el pie de página principal, enlaces en línea, rellenos de botones principales en superficies oscuras y cada marcador "oficial". Trátalo como inamovible — es el color que la marca más asociada en la memoria del consumidor.
- **Console Black** (`#000000`): Negro puro para el encabezado, fondos del hero y zonas de presentación de productos. PlayStation usa el negro para enmarcar el hardware como un museo usa el negro para enmarcar una escultura.

### Secundarios y de Acento
- **PlayStation Cyan** (`#1eaedb`): El color de interacción. Se aplica SOLO a estados de hover, focus y activo de botones y enlaces. Nunca aparece como fondo predeterminado ni como color de texto en reposo. Combínalo con un borde `#ffffff` de 2px y un anillo exterior `#0070cc` de 2px en hover para el tratamiento distintivo completo.
- **Link Hover Blue** (`#1883fd`): La variante más brillante usada en los hover de enlaces de texto en línea. Distinto del Cyan — este es el color de enlace, el Cyan es el color del botón.
- **Dark Link Blue** (`#0068bd`): El color de enlace en reposo sobre superficies claras — un primo ligeramente más saturado del azul de marca.

### Superficie y Fondo
- **Paper White** (`#ffffff`): Lienzo de contenido principal para paneles editoriales entre el encabezado y el pie de página.
- **Ice Mist** (`#f5f7fa`): El punto final atmosférico del degradado de sección claro. Se usa sutilmente detrás de ciertos paneles para elevarlos del blanco puro.
- **Divider Tint** (`#f3f3f3`): El color de separación horizontal discreta entre filas de contenido.
- **Masthead Black** (`#000000`): Barra de navegación superior y lienzo del hero — reservado para zonas orientadas al producto.
- **Shadow Black** (`#121314`): El ancla inicial del degradado de sección oscura cuando un panel necesita profundidad atmosférica.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Fondo translúcido usado detrás de barras de filtro fijas — el único momento de "glassmorfismo" en el sitio.

### Neutros y Texto
- **Display Ink** (`#000000`): Titulares de visualización principales sobre superficies blancas.
- **Deep Charcoal** (`#1f1f1f`): Titulares de cuerpo y color de enlace en reposo — ligeramente más suave que el negro puro para reducir el halo visual en bloques grandes.
- **Body Gray** (`#6b6b6b`): Texto de cuerpo secundario y metadatos.
- **Mute Gray** (`#cccccc`): Etiquetas terciarias, estados deshabilitados.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Texto de marcador de posición en formularios — negro al 60%, no un valor de gris separado.
- **Inverse White** (`#ffffff`): Texto principal sobre superficies oscuras y azules.
- **Dark-Link Blue** (`#53b1ff`): El color de enlace en reposo sobre superficies oscuras/negras — una variante más clara y etérea de PlayStation Blue para legibilidad sobre negro.

### Semánticos y de Comercio
- **Commerce Orange** (`#d53b00`): Reservado para CTAs de estado de compra en PlayStation Store, indicadores de precio y emblemas de "en oferta". El único color cálido del sitio — úsalo con moderación y nunca fuera de un contexto de comercio.
- **Commerce Orange Active** (`#aa2f00`): El estado presionado/activo de los botones de comercio.
- **Warning Red** (`#c81b3a`): Errores de formulario y advertencias de acciones destructivas.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): El velo dramático usado detrás del texto del hero sobre fotografía de producto.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Anillo de elevación de bajo peso en tarjetas.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Elevación de tarjeta muy ligera — apenas visible pero separa los paneles blancos del fondo blanco.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): La sombra más ligera del sistema.

### Sistema de Degradados
PlayStation usa **dos degradados de sección** y nada más:
- **Degradado de Sección Claro**: de `#ffffff` → `#f5f7fa` — un lavado casi imperceptible que eleva sutilmente un panel del lienzo.
- **Degradado de Sección Oscuro**: de `#121314` → `#000000` — un lavado vertical corto que da a los paneles del hero una viñeta sutil sin introducir ningún cambio de tono.

Ambos degradados se usan **solo como fondos de sección**, nunca dentro de componentes. No hay botones con degradado, ni texto con degradado, ni halos luminosos. La marca es azul — no azul a morado, no azul a cian.

## 3. Reglas Tipográficas

### Familia de Fuentes
- **SST** / **Playstation SST** (Sony, propietario) — fallback: `Arial`, `Helvetica`. La tipografía global personalizada de Sony, diseñada por Toshi Omagari y Akira Kobayashi. Cubre pesos 300 / 500 / 600 / 700 en la página de inicio. El peso **300 en 22–54px** es la firma tipográfica de PlayStation.
- **SST (condensada / alternativa)** — fallback: `helvetica`, `arial`. Una variante comprimida usada en un puñado de módulos de interfaz donde el ancho importa.
- **Arial** — fallback de utilidad para la variante de botón excepcional que se renderiza en sans del sistema.

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Espaciado de Letras | Notas |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | El mayor momento SST en la página — titular de lujo de peso suave |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Titulares secundarios del hero |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Titulares de panel de características |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Encabezados de sección |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Títulos de módulo — aún en peso 300 ligero |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Subtítulo promocional |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Encabezados de interfaz ajustados |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Etiqueta de botón principal |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTAs de mayor énfasis (comprar, suscribirse) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Etiqueta de botón secundario |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Cuerpo de lectura estándar |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Texto de enlace en línea |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini CTAs en tarjetas |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Leyendas, etiquetas de etiqueta |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Metadatos estándar |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Leyenda enfatizada |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Leyenda seminegrita |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Botón de interfaz con interlineado ajustado |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Etiqueta de pestaña/píldora |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Leyenda de interfaz más pequeña |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Microcopia del pie de página, texto legal |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Texto micro enfatizado |

### Principios
- **El peso 300 en tamaños grandes es la voz.** PlayStation es la única gran marca de consolas que usa tipografía de visualización de peso ligero para sus titulares del hero. Resiste la tentación de "mejorar" el tipo de visualización a 500 o 700 — la quietud es la personalidad.
- **Los saltos de peso se producen en la capa de interfaz.** Por debajo de 18px el sistema cambia a 500–700 para la legibilidad. El gradiente de peso de 300 (visualización) → 400 (cuerpo) → 500 (leyendas) → 700 (botones) es la jerarquía.
- **El espaciado de letras es casi imperceptible.** La mayoría de los valores son 0,1–0,45px, ya sea positivos o ligeramente negativos. El `-0.1px` en el hero de 54px comprime el tipo de visualización lo justo para que se lea como "diseñado" sin convertirse en una declaración tipográfica.
- **Dos carcasas SST.** "SST" y "Playstation SST" son funcionalmente la misma familia con conjuntos de métricas ligeramente diferentes (Playstation SST es más ajustado en tamaños pequeños). Trátalos como intercambiables para propósitos ajenos a la licencia interna de Sony.
- **Sin mayúsculas.** A diferencia de The Verge o Wired, PlayStation raramente usa etiquetas en MAYÚSCULAS. Los kickers y las etiquetas se mantienen en mayúscula inicial o minúsculas — otro movimiento de "autoridad discreta".
- **Sin serif en ningún lugar.** El sistema completo es sans. No hay contrapunto de voz impresa.

## 4. Estilos de Componentes

### Botones

**Principal — Píldora PlayStation Blue**
- Fondo: `#0070cc` (PlayStation Blue)
- Texto: `#ffffff`, SST 18px / 500 / 0,4px tracking
- Borde: ninguno en reposo
- Radio de borde: `999px` — píldora completa
- Relleno: ~`12px 24px` (variable según clase de tamaño)
- Contorno: `rgb(255, 255, 255) none 0px` en reposo
- **Hover (movimiento distintivo)**:
  - El fondo se rellena a `#1eaedb` (PlayStation Cyan)
  - El texto permanece `#ffffff`
  - Aparece un borde `#ffffff` de 2px
  - Un anillo exterior `#0070cc` de 2px florece con sombra (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — el botón realmente crece un 20%
- Activo: `opacity: 0.6` — un atenuado rápido para señalar la pulsación
- Focus: igual que hover, pero el anillo se convierte en sombra de focus `rgb(0, 114, 206) 0px 0px 0px 2px`
- Transición: ~180ms ease sobre fondo, transform y sombra

**Secundario — Contorno Blanco sobre Oscuro**
- Fondo: `#ffffff`
- Texto: `#0172ce` (variante PlayStation Blue)
- Borde: `2px outset #000000` — un borde `outset` genuino, extremadamente raro en CSS moderno
- Radio: varía (a menudo `999px` o `36px`)
- Relleno: `16px 20px`
- Hover: mismo relleno cian distintivo + scale(1.2) + tratamiento de anillo
- Focus: mismo tratamiento de anillo

**Commerce Orange**
- Fondo: `#d53b00` (Commerce Orange)
- Texto: `#ffffff`, SST 18px / 700 / 0,45px tracking
- Radio de borde: `999px` — píldora
- Usado solo en CTAs de PS Store / Comprar / Suscribirse Plus
- Activo: el fondo se oscurece a `#aa2f00`
- Hover: sigue la regla de inversión a cian como todos los demás botones (NO un hover específico de naranja)

**Ghost Transparente**
- Fondo: transparente
- Texto: `#1f1f1f` (Deep Charcoal)
- Borde: `1px solid #dedede`
- Relleno: `0 10px` (ajustado, optimizado para navegación)
- Hover: relleno cian, texto blanco, borde blanco de 2px, scale(1.2)
- Activo: el texto cambia a `#0072ce`, opacidad 0,6

**Círculo de Icono**
- Fondo: `rgba(0, 0, 0, 0.2)` sobre fotografía; `#ffffff` sobre superficies claras
- Radio de borde: `100%` — círculo perfecto
- Usado para las flechas anterior/siguiente del carrusel y botones de compartir
- Hover: se aclara a `var(--color-role-backgrounds-primary-link-hover)` (aproximadamente `#e5e5e5` sobre claro)

**Mini CTA (En tarjeta)**
- SST 14px / 700 / 0,324px tracking
- Relleno ~8px 16px
- Radio: `999px`
- Usado dentro de tarjetas de juegos para mini CTAs de "Comprar ahora" / "Añadir al carrito"

### Tarjetas y Contenedores

**Tarjeta Hero (Característica de Juego)**
- Fondo: fotografía/render — generalmente anclado en negro
- Radio de borde: `24px` o `19px` para tarjetas de características
- Relleno: interior de 32–48px
- Sombra: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — una sombra proyectada dramática usada solo cuando una tarjeta se superpone a la fotografía del hero
- Hover: transformación de escala sutil, el contorno cian aparece en la CTA principal

**Mosaico de Portada de Juego**
- Fondo: arte de portada del juego, sin relleno
- Radio de borde: `12px` o `13px` (imágenes) / `19px` (marco de tarjeta)
- Sombra: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — elevación de peso ligero
- Hover: la CTA principal de la tarjeta se ilumina en cian, la tarjeta en sí puede escalar 1,02×
- Transición: 200ms ease sobre transform

**Panel de Contenido (Blanco)**
- Fondo: `#ffffff` o el degradado de sección claro `#ffffff → #f5f7fa`
- Borde: normalmente ninguno; separado de los vecinos por espaciado y sombras sutiles
- Radio: `12px`–`24px` según la jerarquía del panel
- Sombra: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — la más ligera del sistema

**Tarjeta Oscura sobre Oscuro**
- Fondo: `rgba(0, 0, 0, 0.2)` sobre fotografía
- Radio de borde: `6px` (compacto) o `24px` (característica)
- Usado para incrustaciones de "kit de prensa" o "bloque de estadísticas" sobre video del hero

### Entradas y Formularios
- **Predeterminado**: fondo `#ffffff`, borde `1px solid #cccccc`, radio de borde `3px` (más ajustado que el resto del sistema — las entradas son el único lugar donde PlayStation se vuelve genuinamente compacto), texto SST 16px en `#1f1f1f`, marcador de posición `rgba(0, 0, 0, 0.6)`.
- **Focus**: anillo de focus `#0070cc` de 2px mediante `box-shadow: 0 0 0 2px #0070cc`. Sin cambio de color de borde — el anillo hace el trabajo.
- **Error**: el borde y el texto cambian a `#c81b3a` (Warning Red), texto de error en línea debajo en el mismo rojo.
- **Transición**: ~180ms ease sobre borde y sombra.

### Navegación

- **Barra de navegación superior**: franja de ancho completo negra (`#000000`) con el logotipo de PlayStation (blanco) alineado a la izquierda, enlaces de categoría centrados en SST 14–16px / 500, y un pequeño CTA "Iniciar sesión" alineado a la derecha.
- **Hover en enlace de navegación**: el color transita de `#ffffff` a `#1883fd` (Link Hover Blue), sin subrayado.
- **Sección activa**: marcada por un subrayado sutil de 2px en `#0070cc`.
- **Móvil**: la navegación se colapsa en un cajón hamburguesa. Dentro del cajón, los enlaces se apilan verticalmente con gaps de 16px y un relleno horizontal de 20px.
- **Comportamiento fijo**: la navegación permanece fija en la parte superior al desplazarse; cuando entra en una zona de superficie clara **no se invierte** — permanece con fondo negro en todo momento.

### Tratamiento de Imágenes

- **Relaciones de aspecto**: video/fotografía del hero 16:9, renders de consola 1:1, arte de portada de juego 3:4, imágenes de estilo de vida 4:3.
- **Esquinas**: redondeadas a `12px`, `13px` o `24px` según el contexto de la tarjeta. Las portadas de juegos reciben `6–12px`, las imágenes del hero reciben `24px`.
- **A sangre**: solo en el hero del encabezado y los banners promocionales del pie de página. Todo lo demás se asienta dentro de una columna de contenido con relleno.
- **Sombra**: sombra proyectada dramática `rgba(0, 0, 0, 0.8) 0 5px 9px 0` en heroes, ligera `rgba(0, 0, 0, 0.06) 0 5px 9px 0` en mosaicos de cuadrícula.
- **Hover**: la imagen permanece estática, el marco de la tarjeta y la CTA principal responden.
- **Carga diferida**: `loading="lazy"` en todo lo que está debajo del pliegue, `eager` en el hero del encabezado.

### Píldora de Tienda de Juegos (Distintiva)
- Fondo: `#ffffff`
- Texto: `#000000`, SST 14px / 500
- Relleno: `14px 18px`
- Radio: `9999px` — píldora completa
- Una etiqueta de píldora neutra que se asienta junto a las portadas de juegos para etiquetar la plataforma ("PS5", "PS4", "PSVR2"). Contraste blanco sobre oscuro.

## 5. Principios de Diseño

### Sistema de Espaciado
- **Unidad base**: 8px.
- **Escala**: 1, 2, 3, 4,5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Relleno de sección**: 48–96px vertical entre paneles principales. Las transiciones de hero a contenido usan el extremo mayor.
- **Relleno de tarjeta**: interior de 20–32px. Las tarjetas de hero de características pueden expandirse a 48px.
- **Espaciado en línea**: 8–12px entre titular y subtítulo, 12–16px entre subtítulo y CTA.
- **Microescala**: Los valores 1/2/3/4,5/5/9/10/12 se usan para el relleno de píldoras, el espaciado de leyendas y los desplazamientos de borde — no para el ritmo editorial.

### Cuadrícula y Contenedor
- **Ancho máximo**: ~1920px (breakpoints detectados por dembrandt hasta 2120px). Los topes del contenedor son típicamente alrededor de `1280–1920px` según el panel.
- **Patrones de columnas**: cuadrícula responsiva de 12 columnas que se resuelve en filas de mosaicos de juegos de 3/4/6 columnas según la jerarquía. Las zonas de hero a menudo abarcan 12 columnas; los mosaicos destacados se asientan en configuraciones 6+3+3 o 4+4+4.
- **Relleno exterior**: 16px móvil → 48px tableta → 64–96px escritorio.
- **Canaletas**: 16–24px entre columnas, más ajustadas (8–12px) dentro de grupos de mosaicos.

### Filosofía del Espacio en Blanco
PlayStation trata el espacio en blanco como una marca de lujo trata la iluminación de una tienda — como una señal premium. Hay notablemente más espacio de respiración vertical entre módulos que en cualquier otro sitio de venta al público importante, y los paneles editoriales blancos a menudo contienen solo un titular + una imagen + una CTA con relleno a escala de hero. El efecto es un "ritmo de galería" donde cada producto obtiene su propia sala en lugar de competir en una cuadrícula de miniaturas.

### Escala de Radio de Borde
- **2px** — botones de banner de cookies y pequeña interfaz de administración
- **3px** — entradas de formulario, paneles de pestañas (más ajustado que todo lo demás — una señal deliberada de "interfaz funcional")
- **6px** — botones compactos e imágenes en línea
- **12px** — imágenes estándar de portadas de juegos e imágenes de contenido
- **13px** — ciertos envoltorios de figuras (un desplazamiento de 1px respecto a 12px para anidamiento)
- **19px** — tarjetas de características
- **20px** — tramos de etiquetas en línea
- **24px** — tarjetas del hero, marcos de características principales
- **36px** — variantes de navegación de píldora completa y botones secundarios
- **48px** — botones de características grandes
- **999px / 100%** — botones principales de píldora completa y botones de icono circulares

Once valores de radio discretos — uno de los sistemas de radio más ricos de cualquier sitio en este catálogo. El rango existe porque PlayStation usa deliberadamente radios diferentes para diferentes *jerarquías*: 3px para utilidad, 12px para medios, 24px para características, 999px para CTAs.

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|---|---|---|
| 0 | Sin sombra | Contenido predeterminado sobre `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Elevación ligera de panel editorial |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Elevación estándar de mosaico de cuadrícula |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Tarjeta enfatizada (hover o activa) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Sombra de superposición del hero — sombra proyectada dramática sobre fotografía |
| 5 | `0 0 0 2px #0070cc` (anillo de focus) | Estado de focus del botón principal |
| 6 | `0 0 0 2px #000000` (anillo de hover) | Anillo de hover del botón secundario |
| 7 | Degradado de sección `#121314 → #000000` | Profundidad atmosférica en paneles de hero oscuros |

La filosofía de profundidad de PlayStation es **capas pero contenida**. La escala de sombras va de 0,06 a 0,16 para estados normales, luego salta a 0,8 para sombras del hero — no hay un punto intermedio de 0,2, 0,3, 0,4. El efecto es que la mayor parte de la página se asienta casi plana, pero cuando una tarjeta del hero necesita flotar sobre la fotografía, genuinamente *flota*. La elevación o se susurra o se grita, nunca se murmura.

### Profundidad Decorativa
- **Degradados de sección** (oscuro y claro, ambos descritos anteriormente) — usados solo como fondos de sección
- **Anillos de focus/hover** de 2px, siempre azules o cian según el estado
- **Sin destellos, desenfoque ni efectos atmosféricos** más allá de los dos degradados de sección
- **Sin botones o texto con degradado** — el sistema visual son bloques de color sólido en todas partes excepto en las transiciones de sección

## 7. Qué Hacer y Qué Evitar

### Qué Hacer
- **Usa** PlayStation Blue (`#0070cc`) como relleno principal de CTA y el ancla del pie de página. Es el color ancla de la marca.
- **Usa** SST peso 300 para cada titular de visualización de 22px o más. El titular de peso suave es la voz.
- **Aplica** la firma de hover completa a cada botón principal: relleno cian + borde blanco de 2px + anillo exterior azul de 2px + `scale(1.2)`.
- **Usa** radio de píldora completa (`999px`) en botones principales y de comercio.
- **Reserva** PlayStation Cyan (`#1eaedb`) exclusivamente para estados de hover, focus y activo — nunca como fondo en reposo.
- **Usa** Commerce Orange (`#d53b00`) solo en CTAs de PlayStation Store / compra y llamadas de precio.
- **Alterna** paneles de hero oscuros con paneles de contenido blancos y ancla con un pie de página azul profundo — el diseño de canal de tres superficies es el ritmo de la página.
- **Usa** sombras proyectadas dramáticas `rgba(0, 0, 0, 0.8)` del hero cuando una tarjeta se superpone a fotografía del producto.
- **Mantén** la barra de navegación superior negra en cada posición de desplazamiento — no se invierte a blanco sobre paneles claros.

### Qué Evitar
- **No pongas en negrita** los titulares de visualización. El peso 300 en 22–54px es la voz de PlayStation. El tipo de visualización en peso 700 se lee como "otra tienda de videojuegos".
- **No uses** etiquetas o kickers en MAYÚSCULAS. PlayStation raramente usa mayúsculas — es una marca de autoridad discreta, no una de cinta de advertencia.
- **No uses** botones, texto o fondos con degradado fuera de los dos degradados de sección declarados.
- **No introduzcas** colores cálidos fuera de Commerce Orange. Sin CTAs rojas, sin resaltados amarillos, sin píldoras de éxito verdes.
- **No uses** esquinas cuadradas en botones o medios. El sistema tiene once radios — elige uno, pero nunca `0`.
- **No omitas** el movimiento de hover `scale(1.2)` en los botones principales. La escala de elevación es una firma de interacción de marca.
- **No uses** tipo serif. El sistema es 100% SST sans.
- **No permitas** que el cian `#1eaedb` aparezca como color de texto o fondo en reposo. Solo existe en movimiento.
- **No diseñes** paneles que compitan por la atención. El ritmo de espacio en blanco de PlayStation da a cada módulo su propia "sala de galería".

## 8. Comportamiento Responsivo

### Breakpoints

| Nombre | Ancho | Cambios Clave |
|---|---|---|
| Small Mobile | <400px | Columna única, la navegación se colapsa a hamburguesa, el hero SST escala a ~28px |
| Mobile | 400–599px | Columna única, los mosaicos se apilan a ancho completo, el relleno se abre a 16px |
| Large Mobile | 600–767px | Sigue siendo columna única pero opción de mosaico de 2 columnas en módulos seleccionados |
| Tablet Portrait | 768–1023px | Cuadrícula de juegos de 2 columnas, navegación aún condensada |
| Tablet Landscape | 1024–1279px | Cuadrícula de 3–4 columnas, navegación completa restaurada |
| Desktop | 1280–1599px | Cuadrícula editorial completa, escala máxima de visualización del hero (44–54px) |
| Large Desktop | 1600–1919px | El contenedor tope en 1600px, los márgenes se expanden |
| 4K / Big-Screen | ≥1920px | El contenedor se expande hasta 1920px máx, el contenido del hero escala para adaptarse a la distancia de visualización del televisor |
| Ultra-Wide | ≥2120px | Breakpoint extremo — la página permanece anclada, los márgenes exteriores absorben el ancho extra |

El barrido de dembrandt detectó 30 breakpoints entre 320px y 2120px — un rango responsivo inusualmente amplio. PlayStation sintoniza específicamente para **contextos de pantalla grande** (1920–2120px) porque los propietarios de PS5 frecuentemente navegan el sitio en televisores a través del navegador de la consola o mediante transmisión al televisor desde un teléfono. La mayoría de los sitios de venta al público dejan de sintonizar en 1440px; PlayStation continúa sintonizando hasta 4K.

### Objetivos Táctiles
- Los botones de píldora principales tienen ~48–56px de altura (texto SST de 18px + ~12–16px de relleno vertical) — cómodamente WCAG AAA.
- Los enlaces de navegación son más pequeños (~32–40px de altura) en escritorio; en móvil se rellenan a 48px+ dentro del cajón.
- Los botones de círculo de icono tienen 40–48px — aptos para el tacto.

### Estrategia de Colapso
- **Navegación**: navegación completa → condensada → cajón hamburguesa a medida que la ventana se estrecha. El logotipo permanece fijo a la izquierda; la CTA permanece fija a la derecha.
- **Cuadrícula**: 6 col → 4 col → 3 col → 2 col → 1 col. Las tarjetas de mosaicos de juegos se reorganizan sin recortar el arte de la portada.
- **Espaciado**: el relleno de sección se ajusta de 96px → 64px → 48px → 32px → 24px a medida que la ventana se estrecha.
- **Tipografía**: el hero SST escala de 54px → 44px → 35px → 28px → 22px. El peso 300 ligero se preserva en cada tamaño.
- **Fotografía del hero**: intercambio con dirección de arte — el escritorio usa recortes anchos 16:9, el móvil usa recortes 4:3 o 1:1 con el producto centrado.

### Comportamiento de Imágenes
- Raster responsivo (`srcset` + `<picture>` con dirección de arte), relaciones de aspecto preservadas por breakpoint.
- Listo para 4K: el sitio sirve imágenes de alta densidad en 1920px+ para evitar el escalado en la navegación desde TV.
- `loading="lazy"` en todo lo que está debajo del pliegue; el hero es `eager` con un hint de precarga.

## 9. Guía de Prompts para Agentes

### Referencia Rápida de Colores
- **CTA Principal**: "PlayStation Blue (`#0070cc`)"
- **Acento de Hover / Focus**: "PlayStation Cyan (`#1eaedb`)"
- **Fondo (Superficie Blanca)**: "Paper White (`#ffffff`)"
- **Fondo (Superficie Oscura)**: "Console Black (`#000000`)"
- **Texto de Encabezado sobre Blanco**: "Display Ink (`#000000`)"
- **Texto de Cuerpo sobre Blanco**: "Deep Charcoal (`#1f1f1f`)"
- **Texto de Cuerpo sobre Negro**: "Inverse White (`#ffffff`)"
- **Acento de Comercio / Compra**: "Commerce Orange (`#d53b00`)"
- **Ancla del Pie de Página**: "PlayStation Blue (`#0070cc`)"

### Prompts de Componentes de Ejemplo
1. *"Crea un botón CTA principal con relleno PlayStation Blue `#0070cc`, texto blanco en SST 18px / 500 / 0,4px tracking, radio de borde de 999px, relleno de 12px × 24px. En hover, el fondo transita a `#1eaedb` PlayStation Cyan, aparece un borde `#ffffff` de 2px, un anillo exterior `#0070cc` de 2px florece mediante box-shadow, y el botón completo escala 1,2× — todo en una transición de 180ms ease."*
2. *"Diseña un panel hero sobre un lienzo Console Black `#000000` con un titular SST peso 300 de 54px en `#ffffff` con -0,1px de espaciado de letras y 1,25 de altura de línea. Coloca una única CTA principal debajo con el tratamiento de hover estándar de PlayStation. Sin etiquetas en MAYÚSCULAS en ningún lugar."*
3. *"Construye un mosaico de portada de juego: imagen de relación de aspecto 3:4 con radio de borde de 12px, sombra proyectada de peso ligero `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, un título SST 700 de 14px debajo, una etiqueta de plataforma SST 500 de 12px, y una mini CTA principal de 14px / 700 / 0,324px tracking en PlayStation Blue."*
4. *"Crea un botón de píldora de comercio para una compra en PlayStation Store: relleno Commerce Orange `#d53b00`, texto `#ffffff` en SST 18px / 700 / 0,45px tracking, radio de 999px, relleno de 12px × 28px. El estado activo se oscurece a `#aa2f00`. El hover sigue la inversión estándar a cian con escala 1,2×."*
5. *"Diseña un panel de contenido blanco entre secciones de hero oscuras: fondo `#ffffff` con el sutil degradado de sección claro `#ffffff → #f5f7fa`, radio de borde de 24px, relleno interior de 48px, elevación de peso ligero `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, un titular SST 300 de 35px, un párrafo de cuerpo de 18px y una única CTA principal."*

### Guía de Iteración
Al refinar pantallas existentes generadas con este sistema de diseño:
1. **Audita el peso de visualización.** Cada titular de 22px o más debería ser SST peso 300. Si ves peso 500 o 700 a escala de hero, has perdido la voz de PlayStation.
2. **Audita el tratamiento de hover.** Cada botón principal debe escalar 1,2× en hover con la combinación relleno-cian + borde-blanco + anillo-azul. Si falta cualquiera de esos cuatro, la firma de interacción se rompe.
3. **Audita las esquinas.** Cada contenedor y botón debería aterrizar en 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 o 999px / 100%. Las esquinas cuadradas rompen la voz.
4. **Audita la dispersión de color.** Solo PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`) y los grises/negros/blancos declarados deberían aparecer en el cromo. Si ves cualquier otro tono, corrígelo.
5. **Audita la alternancia de superficies.** La página debería alternar hero oscuro → contenido blanco → hero oscuro → contenido blanco → pie de página azul. Si dos paneles de la misma superficie son adyacentes, inserta una transición.
6. **Audita la capitalización.** Solo mayúscula inicial y primera letra de cada palabra. Sin etiquetas, botones o kickers en MAYÚSCULAS. Si ves mayúsculas, conviértelas.
7. **Audita el peso de la sombra.** La opacidad de la sombra debería aterrizar en 0,06 / 0,08 / 0,16 / 0,8 — nada en medio. Si ves sombras proyectadas de 0,1, 0,2, 0,3, 0,5, corrígelas al nivel declarado más cercano.
8. **Audita el espacio en blanco.** Si dos módulos se sienten "competitivos" (luchando por la atención), añade 48–96px de espacio de respiración vertical. El ritmo de galería de PlayStation no es negociable.
