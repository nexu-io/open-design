# Sistema de diseño inspirado en Airbnb

> Category: Comercio electrónico y venta minorista
> Marketplace de viajes. Acento coral cálido, impulsado por la fotografía, interfaz con esquinas redondeadas.

## 1. Tema visual y atmósfera

El diseño de Airbnb en 2026 se siente como una revista de viajes que resulta ser una aplicación — lienzos de blanco inmaculado dan paso a fotografías a sangre completa, y la propia interfaz desaparece para que los alojamientos puedan respirar. El característico coral-rosa Rausch (`#ff385c`) se usa con moderación pero de forma inconfundible: CTA de búsqueda, indicador de pestaña activa, botón de acción principal, el precio o el corazón de lista de deseos ocasional. Todo lo demás es una escala de grises disciplinada, con `#222222` portando casi cada línea de texto.

Lo que hace al sistema inconfundiblemente Airbnb es la *confianza* que deposita en el contenido. Las fotos de las propiedades se muestran a escala heroica, 4:3 con tratamiento de borde a borde con radio. El cambio de categoría ocurre a través de un selector de tres pestañas (Casas / Experiencias / Servicios) que usa iconos ilustrados renderizados en 3D (una casa con techo a dos aguas, un globo aerostático, una campana de servicio) — físicos, táctiles, casi como juguetes — combinados con etiquetas nítidas de `Airbnb Cereal VF`. Es el raro producto de consumo donde los renders 3D y la interfaz puramente tipográfica coexisten sin tensión.

La superficie más nueva es la línea de productos de **Experiencias** — el mismo cromo, pero mayor densidad de tarjetas, más fotografía y un panel de reserva centrado con precio en riel derecho fijo. Las páginas de detalles de alojamientos (tanto habitaciones como experiencias) siguen una plantilla ajustada: cuadrícula de imagen hero a sangre completa → tarjeta de reserva redondeada superpuesta (fija al desplazarse) → comodidades → reseñas (los premios Guest Favorite usan un gran `4.81` centrado con un medallón de corona de laurel) → mapa → perfil del anfitrión → divulgaciones. El ritmo es consistente ya sea que estés reservando una habitación o un tour en yate.

**Características clave:**
- Coral-rosa Rausch (`#ff385c`) como color de marca de acento único, usado solo para CTA principales y el botón de búsqueda
- Fotografía a sangre completa en 4:3 / 16:9 con suave redondeo de esquinas (14–20px) como vocabulario visual principal
- Iconos de categoría renderizados en 3D combinados con pestañas tipográficas — el único lugar donde el sistema permite ilustración
- Botones de icono circulares `50%` (flecha atrás, compartir, favorito, flechas de carrusel) dispersos por toda la interfaz
- `Airbnb Cereal VF` lleva cada etiqueta, desde notas legales de 8px hasta encabezados de sección de 28px — un sistema de familia única
- Codificación de color por nivel de producto: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (púrpura profundo `#460479`), Airbnb (coral Rausch)
- Medallón de premio Guest Favorite — número de calificación gigante centrado entre dos coronas de laurel, uno de los momentos más reconocibles del sistema
- Panel de reserva fijo con una pila precio → fechas → huéspedes, anclado al riel derecho en escritorio, transformándose en una barra de «Reservar» anclada en la parte inferior en móvil
- Navegación inferior fija en móvil (Explorar / Listas de deseos / Iniciar sesión) con un tinte Rausch en estado activo

## 2. Paleta de colores y roles

### Principal
- **Rausch** (`#ff385c`): El coral-rosa característico de la marca. Variable CSS `--palette-bg-primary-core`. Usado para: botón principal «Reservar», botón de envío de búsqueda, subrayado de pestaña activa, relleno del corazón de lista de deseos, énfasis de precio. El color de mayor visibilidad en cada página.

### Secundarios y de acento
- **Deep Rausch** (`#e00b41`): Una variante más saturada. Variable CSS `--palette-bg-tertiary-core`. Usado para estados de botón presionado/activo y puntos terminales de degradado.
- **Plus Magenta** (`#92174d`): Variable CSS `--palette-bg-primary-plus`. El color de marca para el nivel de producto Airbnb Plus — una oferta de alojamientos curados de gama alta.
- **Luxe Purple** (`#460479`): Variable CSS `--palette-bg-primary-luxe`. El color de marca para el nivel de producto Airbnb Luxe — alquileres de villas y propiedades de lujo.
- **Info Blue** (`#428bff`): Variable CSS `--palette-text-legal`. Usado para enlaces legales/informativos (términos, privacidad, divulgaciones) — el único color de enlace no monocromático en el sistema.

### Superficie y fondo
- **Canvas White** (`#ffffff`): El fondo de página predeterminado. Cada tarjeta, cada contenedor, cada página de detalle comienza aquí.
- **Soft Cloud** (`#f7f7f7`): Tinte de subsuperficie sutil usado en fondos de pie de página, envolturas de vista de mapa y secciones de «todo lo demás» que quieren alejarse del blanco principal.
- **Hairline Gray** (`#dddddd`): Color de borde 1px ubicuo — separa tarjetas, filas de comodidades, paneles de reseñas, columnas de pie de página. El caballo de batalla del sistema de maquetación.

### Neutrales y texto
- **Ink Black** (`#222222`): Variable CSS `--palette-text-primary`. El casi-negro del sistema. Cada encabezado, cada párrafo de cuerpo, cada etiqueta de navegación, cada precio. Usado para ~90% de todo el texto en una página.
- **Charcoal** (`#3f3f3f`): Variable CSS `--palette-text-focused`. Usado en el texto de entrada en estado focused y en el texto de énfasis secundario.
- **Ash Gray** (`#6a6a6a`): Variable CSS `--palette-bg-tertiary-hover`. Etiquetas secundarias, texto de estilo subtítulo «Alquiler de casas de campo» bajo nombres de ciudades, enlaces de pie de página silenciados.
- **Mute Gray** (`#929292`): Variable CSS `--palette-text-link-disabled`. Botones desactivados y metadatos de baja prioridad.
- **Stone Gray** (`#c1c1c1`): Divisores terciarios, trazos de iconos, avatares de marcador de posición.

### Semánticos y de acento
- **Error Red** (`#c13515`): Variable CSS `--palette-text-primary-error`. Errores de validación de formularios, advertencias de acción destructiva.
- **Deep Error** (`#b32505`): Variable CSS `--palette-text-secondary-error-hover`. Variantes presionadas/activas de estados de error.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Variable CSS `--palette-text-material-disabled`. Etiquetas de estilo material desactivadas.

### Sistema de degradados
El degradado de marca de Airbnb aparece con moderación, normalmente solo en el logotipo y el momento de marca del botón de búsqueda:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Este barrido coral → magenta es el «momento de marca» — nunca se usa como superficie completa, solo como relleno de píldora estrecha o tratamiento de logo.

## 3. Reglas tipográficas

### Familia tipográfica
- **Airbnb Cereal VF** (principal y única): El sans-serif de peso variable propietario que lleva todo el sistema. Fuentes de reserva (en orden): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Pesos observados en los tokens extraídos: 500, 600, 700. Sin 400-regular — el peso de «cuerpo» del sistema es 500, lo que da a cada bloque de texto una densidad ligeramente mayor que se lee como confiada e intencionada.

Características OpenType: `salt` (alternativas estilísticas) se usa en las etiquetas compactas de 11px y 14px 600 — probablemente para dar forma más ajustada a números y caracteres especiales. No se observaron características de ligaduras o números fraccionarios.

### Jerarquía

| Rol | Tamaño | Peso | Altura de línea | Espaciado de letras | Notas |
|-----|--------|------|-----------------|---------------------|-------|
| Encabezado de sección | 28px / 1,75rem | 700 | 1,43 | 0 | «Inspiración para futuras escapadas» — encabezados a nivel de página |
| Encabezado de subsección | 22px / 1,38rem | 500 | 1,18 | -0,44px | «Qué ofrece este lugar», «Conoce a los anfitriones» — divisores de contenido |
| Título de tarjeta | 21px / 1,31rem | 700 | 1,43 | 0 | Encabezados de panel de reseñas, títulos principales de tarjetas |
| Título de alojamiento | 20px / 1,25rem | 600 | 1,20 | -0,18px | «Tour en yate para grupos pequeños, vino y frutas ilimitados» — titulares de alojamientos en páginas de detalles |
| Subtítulo en negrita | 16px / 1,00rem | 600 | 1,25 | 0 | Nombre del anfitrión, nombre de la ciudad |
| Cuerpo medio | 16px / 1,00rem | 500 | 1,25 | 0 | Texto de cuerpo principal en páginas de detalles |
| Botón grande | 16px / 1,00rem | 500 | 1,25 | 0 | «Reservar», «Conviértete en anfitrión» |
| Botón predeterminado | 14px / 0,88rem | 500 | 1,29 | 0 | Etiquetas de botón estándar |
| Enlace | 14px / 0,88rem | 500 | 1,43 | 0 | Enlaces de navegación, enlaces de pie de página |
| Leyenda media | 14px / 0,88rem | 500 | 1,29 | 0 | Metadatos, líneas de subtítulo («Alquiler de casas de campo», «Alquiler de villas») |
| Leyenda en negrita | 14px / 0,88rem | 600 | 1,43 | 0 | Función `salt` habilitada — estadísticas numéricas, énfasis en texto pequeño |
| Leyenda pequeña | 13px / 0,81rem | 400 | 1,23 | 0 | Fechas de reseñas, micro-metadatos |
| Micro predeterminado | 12px / 0,75rem | 400 | 1,33 | 0 | Descargos de responsabilidad del pie de página, micro-texto legal |
| Micro en negrita | 12px / 0,75rem | 700 | 1,33 | 0 | Etiquetas de píldora «NUEVO» |
| Insignia en mayúsculas | 11px / 0,69rem | 600 | 1,18 | 0 | Función `salt` — insignias compactas de categoría/estado |
| Superíndice | 8px / 0,50rem | 700 | 1,25 | 0,32px | Mayúsculas — notas al pie de precio, colas decimales |

### Principios
- **Una familia, muchos pesos.** Airbnb Cereal VF maneja todo, desde el texto legal de 8px hasta los encabezados de página de 28px — la identidad visual proviene de la familia en sí, no de la mezcla de tipografías.
- **500 es el nuevo 400.** El peso «regular» del sistema es 500, dando a cada párrafo una textura ligeramente más confiada que el estándar web.
- **Tracking negativo solo para tipos de visualización.** Los encabezados de 20px y más comprimen el tracking en -0,18 a -0,44px para un aspecto cincelado; los tamaños de cuerpo se mantienen en un tracking de 0 para legibilidad.
- **Alturas de línea ajustadas para titulares, generosas para cuerpo.** El tipo de visualización funciona a 1,18–1,25 (ajustado); el cuerpo y las leyendas se abren a 1,43 para la comodidad de lectura larga.
- **Sin mayúsculas excepto a 8px.** La única transformación en mayúsculas en el sistema es el superíndice de 8px — en cualquier otro lugar, la capitalización de oración con cambios sutiles de peso hace el trabajo.

### Nota sobre sustitutos de fuentes
Airbnb Cereal VF es propietaria. El sustituto de código abierto más cercano es **Circular Std** (todavía comercial) o **Inter** (gratis, Google Fonts) con espaciado de letras reducido en -0,01em en tamaños de visualización. Para estricta fidelidad de marca, la cadena de respaldo documentada (`Circular, -apple-system, system-ui`) se renderiza aceptablemente en macOS/iOS donde `system-ui` se resuelve en San Francisco, que tiene proporciones similares.

## 4. Estilos de componentes

### Botones

**CTA principal** («Reservar», «Buscar», «Agregar fechas»)
- Fondo: Rausch `#ff385c`
- Texto: Canvas White `#ffffff`, Airbnb Cereal 500, 16px
- Relleno: ~14px vertical, 24px horizontal
- Radio: 8px (rectangular) o 50% (variante de icono circular)
- Borde: ninguno
- Activo/presionado: `transform: scale(0.92)` más un anillo de foco de 2px `#222222` en `0 0 0 2px`

**Botón secundario** («Conviértete en anfitrión», acciones terciarias delineadas)
- Fondo: `#ffffff`
- Texto: Ink Black `#222222`, Airbnb Cereal 500, 14–16px
- Relleno: 10px 16px
- Radio: 20px (píldora) o 8px (rectangular)
- Borde: 1px solid Hairline Gray `#dddddd`

**Botón circular solo con icono** (flecha atrás, compartir, favorito, controles de carrusel)
- Fondo: `#f2f2f2` (ligeramente fuera de blanco) o blanco con borde negro translúcido de 1px
- Icono: trazo de contorno `#222222`, 16–20px
- Tamaño: diámetro 32–44px
- Radio: 50%
- Activo/presionado: `transform: scale(0.92)`; anillo blanco sutil de 4px `0 0 0 4px rgb(255,255,255)` para separar de fondos fotográficos coloridos

**Botón desactivado**
- Fondo: `#f2f2f2`
- Texto: Stone Gray `#c1c1c1`
- Opacidad: 0,5

**Botón de pestaña en píldora** (selector de categoría «Casas / Experiencias / Servicios»)
- Fondo: transparente
- Texto: Ink Black `#222222`, Airbnb Cereal 500, 16px
- Relleno: 8px 14px
- Estado activo: subrayado Ink Black de 2px debajo de la etiqueta
- Combinado con un icono ilustrado renderizado en 3D de 36–48px encima de la etiqueta

### Tarjetas y contenedores

**Tarjeta de alojamiento** (cuadrícula de página de inicio, resultados de búsqueda)
- Fondo: `#ffffff`
- Radio: 14px en la imagen, el texto se sitúa directamente debajo sobre fondo transparente
- Imagen: relación de aspecto 4:3, a sangra completa, redondeada con el mismo radio de 14px
- Relleno: ninguno en el contenedor externo; 12px de espacio entre la imagen y las filas de metadatos
- Sombra: ninguna — la separación proviene del espacio en blanco y el radio intrínseco de la fotografía
- Patrón de metadatos: ciudad/región en línea 1 (16px 600), distancia/duración en línea 2 (14px 500 Ash Gray), rango de fechas en línea 3, fila de precio con «por noche» en la parte inferior

**Panel de reserva de página de detalles** (riel derecho fijo en páginas de habitación/experiencia)
- Fondo: `#ffffff`
- Radio: 14–20px
- Borde: 1px solid Hairline Gray `#dddddd`
- Sombra: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — una elevación sutil de tres capas apiladas
- Relleno: 24px
- Anchura: ~370px, anclado 120–140px debajo de la parte superior de la ventana gráfica
- Contenido: titular de precio → selector de fechas → desplegable de huéspedes → CTA principal → nota al pie «No se te cobrará aún»

**Tarjeta de cuadrícula de comodidades** (en páginas de detalles de alojamientos)
- Fondo: `#ffffff`
- Borde: 1px solid Hairline Gray `#dddddd` a nivel de fila (no por elemento)
- Relleno: 16px vertical por fila de comodidad
- Patrón icono + etiqueta: icono de contorno 24px a la izquierda, etiqueta 16px 500 a la derecha

**Tarjeta de reseña** (reseña individual en páginas de detalles)
- Fondo: `#ffffff`, sin borde
- Relleno: 0 (se basa en espacios de cuadrícula)
- Contenido: avatar circular 40px + nombre 16px 600 + fecha 14px 400 Ash Gray en una fila, luego párrafo de cuerpo 14px 500 debajo

### Entradas y formularios

**Barra de búsqueda** (página de inicio principal)
- Fondo: `#ffffff`
- Borde: 1px solid Hairline Gray `#dddddd` envolviendo los tres segmentos (Dónde / Cuándo / Quién)
- Radio: 32px (píldora completa)
- Sombra: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — sensación de flotación sutil
- Estructura: tres segmentos divididos por delgados divisores verticales, cada segmento tiene una etiqueta 12px 500 encima de un marcador de posición 14px 500
- Envío: botón de icono circular Rausch en el borde derecho, diámetro 48px

**Entrada de texto** (formularios genéricos)
- Fondo: `#ffffff`
- Borde: 1px solid Hairline Gray `#dddddd`
- Radio: 8px
- Relleno: 14px 16px
- Foco: el borde cambia a Ink Black, agrega anillo externo negro `0 0 0 2px`
- Error: el borde cambia a `#c13515` (Error Red), el texto de ayuda usa el mismo color

**Selector de fechas**
- Cuadrícula de calendario: disposición de 7 columnas, celdas de días circulares `50%` de 40–44px de ancho
- Rango seleccionado: fondo Ink Black `#222222` con números en blanco
- Anclas de inicio/fin: círculos rellenos más grandes; las fechas intermedias usan el tinte Soft Cloud `#f7f7f7`

### Navegación

**Navegación superior (Escritorio)**
- Altura: ~80px
- Fondo: `#ffffff`
- Izquierda: logotipo de Airbnb en Rausch (102×32px)
- Centro: selector de categoría de tres pestañas (Casas / Experiencias / Servicios) con iconos 3D de 36–48px apilados sobre etiquetas 16px 500; la pestaña activa tiene un subrayado Ink Black de 2px
- Derecha: enlace de texto «Conviértete en anfitrión», luego globo circular 32px (idioma), luego menú hamburguesa de avatar 36px
- Border-bottom: 1px solid Hairline Gray `#dddddd`

**Navegación superior (Móvil)**
- Píldora de búsqueda en una sola fila ocupa todo el ancho: marcador de posición «Empieza tu búsqueda» con un pequeño icono de lupa
- Debajo: el selector de categoría de tres pestañas persiste (Casas / Experiencias / Servicios) — los iconos ilustrados se reducen a ~28px
- Barra de pestañas fija en la parte inferior: Explorar (estado activo Rausch) / Listas de deseos / Iniciar sesión — iconos 24px sobre etiquetas 12px

**Navegación secundaria de página de detalles de alojamiento**
- Desplazamiento horizontal fijo de enlaces de anclaje (Fotos · Comodidades · Reseñas · Ubicación · Anfitrión) aparece al desplazarse más allá de la imagen hero
- Altura: 56px
- Border-bottom: 1px solid Hairline Gray

### Tratamiento de imágenes

- **Relaciones de aspecto principales**: 4:3 para cuadrículas de alojamientos de página de inicio, 16:9 para fotografía hero de experiencias, 1:1 para avatares
- **Radio**: 14px en imágenes de cuadrícula de alojamientos, 20px en marcos de fotos hero de páginas de detalles, `50%` en avatares
- **Cuadrícula de imágenes en páginas de detalles**: cuadrícula de cinco fotos con una imagen grande a la izquierda (50% de ancho) y cuatro fotos más pequeñas en una cuadrícula 2×2 a la derecha, todas compartiendo el contenedor redondeado exterior de 20px
- **Carga diferida**: uso intensivo de `loading="lazy"` con vistas previas de marcador de posición borrosas
- **Carrusel**: botones de flecha circulares de 32px superpuestos a la imagen, centrados verticalmente; los indicadores de puntos se sitúan a 12px sobre el borde inferior

### Componentes firma

**Medallón de premio Guest Favorite** (destacado en páginas de detalles de alojamientos muy valorados)
- Número de calificación centrado renderizado a 44–56px 700
- Dos ilustraciones SVG de corona de laurel dibujadas a mano flanqueando izquierda y derecha a ~48px de altura
- Debajo: etiqueta «Guest Favorite» a 12px 700 en mayúsculas con tracking de `0,32px`, y una sub-etiqueta corta a 14px 500 Ash Gray
- Bloque de ancho completo, sin borde de contenedor — se sitúa directamente sobre el lienzo blanco

**Selector de categoría de tres pestañas** (aparece en la parte superior de cada superficie de exploración)
- Tres pestañas: Casas / Experiencias / Servicios
- Cada pestaña: icono ilustrado renderizado en 3D (~48px de altura) sobre una etiqueta 16px 500
- Experiencias y Servicios llevan actualmente una pequeña píldora azul marino «NUEVO» (texto blanco 12px 700 sobre fondo azul oscuro) flotando en la parte superior derecha del icono
- Pestaña activa: subrayado Ink Black de 2px debajo de la etiqueta

**Cuadrícula de ciudades de inspiración** (página de inicio «Inspiración para futuras escapadas»)
- Cuadrícula de 6 columnas de enlaces de destino en escritorio, 2 columnas en móvil
- Cada celda: nombre de ciudad 16px 600 en línea 1, subtítulo de tipo de alquiler 14px 500 Ash Gray en línea 2 («Alquiler de casas de campo», «Alquiler de villas»)
- Sin imágenes — cuadrícula solo de texto
- Tabulada arriba por categoría (Popular / Arte y cultura / Playa / Montañas / Aire libre / Actividades / Consejos de viaje e inspiración / Apartamentos aptos para Airbnb) — la pestaña activa tiene subrayado de 2px y cambio de peso

**Tarjeta fija de reserva** (páginas de detalles de alojamientos)
- Permanece fija a 120px debajo de la parte superior de la ventana gráfica en escritorio mientras el usuario se desplaza más allá del hero
- Se colapsa a una barra de ancho completo en la parte inferior en móvil con una etiqueta «Desde X€ / noche» y una píldora Rausch «Reservar»
- Siempre muestra: titular de precio → visualización de fechas → selector de huéspedes → CTA Rausch → descargo «No se te cobrará aún»

**Tarjeta de anfitrión de experiencia** (páginas de detalles de experiencias)
- Contenedor redondeado de ancho completo con una fotografía de portada 3:2 en la parte superior
- Avatar del anfitrión (circular, 56px) superponiéndose al borde inferior de la portada en un 50%
- Debajo del solapamiento: nombre del anfitrión a 16px 700, antigüedad del anfitrión a 14px 500 Ash Gray, pequeño botón de píldora Rausch «Enviar mensaje al anfitrión»
- Usado como transición entre reseñas y el bloque de comodidades/ubicación

**Franja «Cosas que debes saber»** (páginas de detalles de alojamientos)
- Cuadrícula de 3 columnas de bloques de reglas/políticas (Normas de la casa, Seguridad y propiedad, Política de cancelación)
- Cada columna: icono en la parte superior, encabezado 16px 600, cuerpo 14px 500 Ash Gray, enlace «Mostrar más» subrayado en Ink Black
- Separador: bordes superior e inferior Hairline Gray 1px en toda la franja

## 5. Principios de maquetación

### Sistema de espaciado
- **Unidad base**: 8px
- **Escala extraída**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32px — fino granulado con unos pocos valores fuera de cuadrícula para alineación de iconos perfecta al píxel
- **Relleno de sección**: ~48–64px arriba/abajo en escritorio, 24–32px en móvil
- **Relleno interno de tarjeta**: 24px en paneles de reserva y tarjetas grandes, 16px en filas de comodidades, 12px en metadatos de tarjeta de alojamiento
- **Canal entre tarjetas de alojamiento**: 24px escritorio, 16px móvil
- **Entre filas de texto apiladas**: 4–8px (muy ajustado — refuerza la sensación de «información densa» de los alojamientos de viajes)

### Cuadrícula y contenedor
- **Ancho máximo de contenido**: 1760–1920px en ultra-ancho (Airbnb deja que la cuadrícula respire más que la mayoría de los sitios); 1280px en la mayoría de páginas de detalles
- **Cuadrícula de alojamientos de página de inicio**: 6 columnas en ≥1760px, 5 en ≥1440px, 4 en ≥1128px, 3 en ≥800px, 2 en ≥550px, 1 por debajo
- **Página de detalles**: 2 columnas asimétricas — contenido principal ~58%, panel de reserva fijo ~36% a la derecha, ~6% canal
- **Pie de página**: 3 columnas Soporte / Hosting / Airbnb

### Filosofía del espacio en blanco
Airbnb es densamente informativo pero nunca apretado. El espacio en blanco se usa para *agrupar* — las tarjetas de alojamiento tienen 24px de canal para que cada fotografía se lea como un objeto distinto, pero los metadatos debajo de cada tarjeta usan espacios de 4–8px para que el precio/ciudad/fecha se sienta como una unidad. El panel de reserva de la página de detalles tiene 24px de relleno interno, pero las filas dentro (selector de fechas, selector de huéspedes, CTA) se apilan a 12px — el límite entre la tarjeta y la página hace más trabajo de separación que el contenido dentro.

### Escala de radio de borde
| Radio | Uso |
|-------|-----|
| 4px | Etiquetas de anclaje en línea, chips de etiquetas |
| 8px | Botones de texto, desplegables, botones utilitarios pequeños |
| 14px | Fotografía de tarjetas de alojamiento, contenedores de contenido genérico, insignias |
| 20px | Botones redondeados principales (forma de píldora), imágenes grandes, panel de reserva |
| 32px | Píldora de la barra de búsqueda, contenedores extra grandes |
| 50% | Todos los botones de icono circulares, todos los avatares, corazones de lista de deseos — la geometría redonda firma del sistema |

## 6. Profundidad y elevación

| Nivel | Tratamiento | Uso |
|-------|-------------|-----|
| 0 | Sin sombra | Tarjetas de alojamiento, contenido de cuerpo, secciones solo de texto |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Botones de icono activos/presionados (ej. atrás, compartir, favorito) — elevación sutil para indicar interacción |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Tarjeta fija del panel de reserva, modales, menús desplegables — la elevación de tres capas firma del sistema |
| Anillo de foco | `0 0 0 2px #222222` | Botones en estado activo, entrada de búsqueda enfocada |
| Anillo separador blanco | `rgb(255, 255, 255) 0 0 0 4px` | Botones circulares superpuestos sobre fotografías — un anillo blanco de 4px separa limpiamente el botón de fondos de imagen coloridos |

Filosofía de sombras: Airbnb usa **sombras en capas apiladas** en lugar de una sola sombra de caída. La sombra de tres capas del panel de reserva se lee como una elevación cohesiva pero en realidad son tres sombras separadas con diferentes valores de opacidad/desenfoque — creando un suavizado sutil en el perímetro de la sombra que se siente premium sin ser pesado.

### Profundidad decorativa
- **La fotografía como profundidad**: el sistema se apoya fuertemente en fotografía a sangra completa para crear profundidad visual; las sombras y los degradados se usan con moderación para que las fotografías hagan el trabajo pesado
- **Medallón de corona de laurel**: el premio Guest Favorite usa dos ilustraciones SVG de laurel que dan al número de calificación de otro modo plano una presencia ceremonial, como un trofeo
- **Iconos de categoría renderizados en 3D**: los iconos Casas/Experiencias/Servicios tienen su propia iluminación interna suave y sutiles sombras proyectadas integradas en la ilustración — el único lugar donde la marca permite ilustración «dimensional»

## 7. Qué hacer y qué no hacer

### Hacer
- Reservar Rausch `#ff385c` para acciones principales y el indicador de pestaña activa — nunca diluirlo con usos decorativos.
- Dejar que la fotografía respire — recortes 4:3 con esquinas redondeadas 14–20px, sin texto superpuesto, sin velos de degradado.
- Usar Ink Black `#222222` para cada capa de texto debajo de Rausch — este es el casi-negro del sistema, nunca el verdadero `#000000`.
- Combinar los iconos ilustrados 3D del selector de categoría de tres pestañas con tipografía plana — no mezclar estilos de ilustración dentro de una única superficie.
- Apilar tres sombras de baja opacidad (~2%, 4%, 10%) para crear la elevación firma del panel de reserva.
- Usar bordes Hairline Gray `#dddddd` de 1px para cada divisor tarjeta a tarjeta y fila a fila.
- Tratar el panel de reserva como fijo en escritorio, colapsándose a una barra de reserva anclada en la parte inferior en móvil.
- Usar espaciado de 4–8px dentro de grupos de metadatos y 24px entre tarjetas — la densidad de información es intencional.

### No hacer
- No introducir colores de acento secundarios fuera de la paleta de niveles de producto Rausch / Plus Magenta / Luxe Purple.
- No colocar texto dentro de las fotografías — los pies de foto siempre se sitúan debajo de la imagen, nunca superpuestos.
- No usar etiquetas en mayúsculas excepto el único rol de superíndice de 8px.
- No redondear botones de icono a nada más que 50% — el circular es la geometría firma del sistema.
- No agregar sombras de caída a las tarjetas de alojamiento — se sitúan sobre lienzo blanco sin elevación.
- No usar fondos de degradado — el único degradado en el sistema es un barrido estrecho Rausch → magenta en el logotipo.
- No usar el peso tipográfico 400-regular — el peso de cuerpo de Airbnb Cereal es 500.
- No reemplazar Airbnb Cereal VF con una tipografía de visualización diferente — el sistema es intencionalmente de familia única.

## 8. Comportamiento responsive

### Puntos de quiebre

Airbnb declara ~60 puntos de quiebre (artefacto de diseño de su biblioteca de componentes), pero los cambios de maquetación significativos ocurren en un conjunto mucho más pequeño:

| Nombre | Ancho | Cambios clave |
|--------|-------|---------------|
| Ultra-ancho | ≥1760px | Cuadrícula de alojamientos de 6 columnas, ancho máximo de contenido 1760–1920px |
| Escritorio XL | 1440–1759px | Cuadrícula de 5 columnas, nav completa visible, panel de reserva fijo en riel derecho |
| Escritorio | 1128–1439px | Cuadrícula de 4 columnas, panel de reserva fijo persiste |
| Portátil | 1024–1127px | Cuadrícula de 3–4 columnas, nav de categoría permanece horizontal |
| Tableta | 800–1023px | Cuadrícula de 3 columnas, la búsqueda global puede colapsar a una píldora de fila única |
| Tableta pequeña | 550–799px | Cuadrícula de 2 columnas, el panel de reserva cae a bloque en línea de ancho completo |
| Móvil | 375–549px | Maquetación apilada de 1 columna, aparece la barra de pestañas fija inferior (Explorar / Listas de deseos / Iniciar sesión) |
| Móvil pequeño | <375px | El relleno de borde se ajusta a 16px; los iconos del selector de categoría se reducen a ~28px |

### Objetivos táctiles
Todos los elementos interactivos cumplen o superan los 44×44px. La familia de botones de icono circulares está específicamente dimensionada a 32–44px con 8–12px de relleno de área de toque extendido. El botón principal Rausch «Reservar» tiene ~48px de altura. El área de toque del selector de categoría de tres pestañas es el rectángulo completo de etiqueta-más-icono (típicamente ~64×80px por pestaña).

### Estrategia de colapso
- **Nav**: La nav superior mantiene el logotipo Airbnb + selector de tres pestañas en tableta y superior; en móvil el selector se desliza justo debajo de la píldora de búsqueda, y los controles de globo/avatar se mueven a una barra de pestañas anclada en la parte inferior.
- **Barra de búsqueda**: Píldora de tres segmentos (Dónde / Cuándo / Quién) con un botón de envío circular Rausch en escritorio; se colapsa a una píldora de fila única «Empieza tu búsqueda» en móvil, tocando la cual se abre una hoja de búsqueda a pantalla completa.
- **Panel de reserva**: Riel derecho fijo en ≥1128px; en línea dentro de la columna de contenido principal entre 800–1127px; píldora «Reservar» fija en la parte inferior en <800px.
- **Cuadrícula de alojamientos**: Se reforma 6 → 5 → 4 → 3 → 2 → 1 columnas a través de los puntos de quiebre.
- **Cuadrícula de imágenes de página de detalles**: Maquetación de cinco imágenes (1 grande + 4 pequeñas) en escritorio; se convierte en un carrusel a sangra completa deslizable en móvil con indicadores de puntos de página.
- **Pie de página**: La maquetación de 3 columnas se colapsa a una sola columna apilada en <800px.

### Comportamiento de imágenes
- `loading="lazy"` universal, con vistas previas de marcador de posición borrosas con parámetro `im_w=` de URL servidas primero
- Las imágenes responsive usan la CDN `muscache.com` de Airbnb con el parámetro de consulta `im_w` para entrega basada en ancho (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Sin recortes de dirección de arte — la misma imagen se escala arriba/abajo a través de los puntos de quiebre
- Los carruseles ajustan automáticamente la altura de la foto para mantener una relación 4:3 constante independientemente del aspecto de la fuente

## 9. Guía de prompts para agentes

### Referencia rápida de colores
- CTA principal: «Rausch (#ff385c)»
- Fondo de página: «Canvas White (#ffffff)»
- Subsuperficie: «Soft Cloud (#f7f7f7)»
- Texto de encabezado / cuerpo: «Ink Black (#222222)»
- Texto secundario: «Ash Gray (#6a6a6a)»
- Borde / divisor: «Hairline Gray (#dddddd)»
- Error: «Error Red (#c13515)»
- Enlace informativo: «Info Blue (#428bff)»
- Acento de nivel Luxe: «Luxe Purple (#460479)»
- Acento de nivel Plus: «Plus Magenta (#92174d)»

### Ejemplos de prompts de componentes
- «Crea un botón principal Reservar: fondo Rausch (#ff385c), etiqueta blanca Airbnb Cereal 500 a 16px, relleno 14px × 24px, radio de borde 8px, sin sombra. En activo/presionado agrega `transform: scale(0.92)` con un anillo de foco Ink Black de 2px (`0 0 0 2px #222222`).»
- «Construye una tarjeta de alojamiento con una fotografía 4:3 a sangra completa con radio de borde 14px, sin sombra de contenedor; debajo de la imagen apila tres filas de texto con espacios de 4px: nombre de ciudad a 16px 600 Ink Black, tipo de alquiler a 14px 500 Ash Gray (#6a6a6a), y rango de precio a 16px 500 Ink Black con un sufijo `por noche` de 14px.»
- «Diseña un panel de reserva fijo: fondo blanco, radio de borde 14px, borde Hairline Gray (#dddddd) de 1px, sombra de elevación de 3 capas (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), relleno 24px, ancho 370px, anclado a 120px debajo de la parte superior de la ventana gráfica en escritorio. Contenido: titular de precio, selector de fechas, desplegable de huéspedes, CTA principal Rausch y un descargo Ash Gray de 12px `No se te cobrará aún`.»
- «Crea un selector de categoría de tres pestañas: tres pestañas de igual ancho etiquetadas Casas, Experiencias, Servicios; cada pestaña tiene un icono ilustrado renderizado en 3D (~48px de altura) (casa, globo, campana) sobre una etiqueta 16px 500 Ink Black; la pestaña activa obtiene un subrayado Ink Black de 2px; agrega una pequeña píldora de 12px 700 blanca `NUEVO` sobre fondo azul marino oscuro en la parte superior derecha de los iconos de Experiencias y Servicios.»
- «Renderiza el medallón de premio Guest Favorite: un número de calificación centrado a 52px 700 Ink Black, flanqueado izquierda y derecha por coronas de laurel SVG dibujadas a mano a ~48px de altura; debajo, una etiqueta de 12px 700 en mayúsculas `GUEST FAVORITE` con tracking de 0,32px; sub-etiqueta a 14px 500 Ash Gray; bloque de ancho completo situado directamente sobre el lienzo blanco sin borde de contenedor.»

### Guía de iteración
Al refinar pantallas existentes generadas con este sistema de diseño:
1. Enfocarse en UN componente a la vez.
2. Referenciar nombres de colores específicos y códigos hexadecimales de este documento (ej. «Ink Black #222222», no «gris oscuro»).
3. Usar descripciones en lenguaje natural junto con medidas («elevación sutil de tres capas» en lugar de una larga cadena de sombras).
4. Describir el «sentimiento» deseado («estilo de revista, fotografía en primer lugar» vs «utilidad densa»).
5. Usar siempre por defecto Airbnb Cereal VF 500 para cuerpo y 600–700 para énfasis — nunca 400.
6. Mantener el rosa Rausch escaso — si aparece más de un elemento de color Rausch por ventana gráfica, considerar si uno debería neutralizarse.

### Brechas conocidas
- **Tarjetas de cuadrícula de alojamientos de página de inicio**: la cuadrícula principal de tarjetas de propiedad (la superficie visual principal de airbnb.com) no fue capturada completamente en las capturas de pantalla de página de inicio extraídas — el contenido se cargó solo parcialmente. Las especificaciones de tarjeta de alojamiento anteriores se infieren de la estructura de la cuadrícula de inspiración y las convenciones más amplias de Airbnb; confirmar relaciones de aspecto exactas y jerarquía de metadatos contra el sitio en vivo antes del uso en producción.
- **Iconos de categoría de Experiencias**: los iconos ilustrados 3D para Casas / Experiencias / Servicios se sirven como activos ráster; sus especificaciones exactas de archivos fuente (SVG vs PNG, dimensiones de píxeles renderizados) no están documentadas aquí.
- **Tiempos de animación y transición**: no capturados — alcance de extracción estática.
- **Modo oscuro**: Airbnb no incluye un modo oscuro nativo en las superficies de producto extraídas; este documento describe el único tema de modo claro.
