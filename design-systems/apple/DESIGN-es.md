# Sistema de diseño inspirado en Apple

> Category: Medios y consumo
> Electrónica de consumo. Espacio en blanco premium, SF Pro, imágenes cinematográficas.

## 1. Tema visual y atmósfera

El lenguaje web de Apple es un sistema editorial de precisión que alterna entre la calma de una galería y bloques de información con densidad de tienda. El tono visual se mantiene contenido: amplios lienzos neutros, cromados discretos e imágenes de producto que reciben casi todo el peso expresivo. La interfaz está diseñada para desaparecer, de modo que el hardware, los materiales y las opciones de acabado se conviertan en el primer plano narrativo.

A lo largo de las cinco páginas analizadas, el ritmo es consistente pero no monolítico. Las superficies de marketing (la página de inicio y Environment) emplean una división en capítulos cinematográfica de negro y luz, mientras que las superficies de comercio (los flujos de Store y Shop) introducen un espaciado más ajustado, más controles de utilidad y pilas de tarjetas más densas sin romper la gramática central de la marca. El resultado es un único sistema con dos marchas: modo escaparate y modo transacción.

La tipografía es el estabilizador. SF Pro Display sostiene la jerarquía de los héroes y del merchandising con interlineados compactos y un tracking controlado, mientras que SF Pro Text se encarga de los metadatos de producto, la navegación, los filtros y la densa UI de selección. La tipografía se mantiene discreta, pero el rango de escala es lo bastante amplio como para soportar tanto el mensaje hero de gran formato como las microetiquetas de utilidad.

**Key Characteristics:**
- Ritmo de secciones binario: escenas de negro profundo (`#000000`) alternando con campos neutros pálidos (`#f5f5f7`)
- Una única familia de acento azul para la semántica de acción y enlaces (`#0071e3`, `#0066cc`, `#2997ff`)
- Dos modos operativos en un mismo sistema: módulos de escaparate cinematográficos y configuradores de comercio densos
- Fuerte dependencia de la imagen y de los acabados de los materiales; el cromado de la UI permanece visualmente fino
- Métricas de titulares ajustadas (SF Pro Display, semibold) combinadas con una tipografía de cuerpo/enlace compacta (SF Pro Text)
- Geometría de píldora y cápsula como lenguaje de acción característico (de `18px` a `980px` y controles circulares)
- Profundidad usada con moderación; el contraste y la separación de superficies hacen la mayor parte del trabajo de estratificación
- Ritmo de bloques de color multipágina: capítulos hero negros -> campos de merchandising neutros pálidos -> superficies de tienda blancas de utilidad -> microsuperficies oscuras para los controles

## 2. Paleta de colores y roles

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primarios
- **Negro absoluto** (`#000000`): Lienzos hero envolventes, capítulos de producto de alto dramatismo, anclajes de UI profundos.
- **Gris Apple pálido** (`#f5f5f7`): Superficie clara principal para bandas de características, bloques de comparación y transiciones editoriales.
- **Tinta casi negra** (`#1d1d1f`): Color de texto principal y de relleno oscuro de controles sobre lienzos claros.

### Secundarios y de acento
- **Azul de acción Apple** (`#0071e3`): Relleno de acción principal y acento de marca que señaliza el foco.
- **Azul de enlace de cuerpo** (`#0066cc`): Color de enlace en línea optimizado para la legibilidad de texto largo.
- **Azul de enlace de alta luminancia** (`#2997ff`): Tratamiento de enlace brillante en escenas más oscuras donde se requiere mayor contraste.

### Superficie y fondo
- **Lienzo blanco puro** (`#ffffff`): Fondos de tienda/lista de productos y secciones transaccionales densas.
- **Superficie grafito A** (`#272729`): Capa de contexto para tarjetas oscuras y controles multimedia.
- **Superficie grafito B** (`#262629`): Capa de utilidad oscura ligeramente más profunda para agrupaciones de controles.
- **Superficie grafito C** (`#28282b`): Superficies oscuras de apoyo elevadas.
- **Superficie grafito D** (`#2a2a2c`): El escalón elevado más oscuro, usado para la separación en escenas oscuras más ricas.

### Neutros y texto
- **Gris neutro secundario** (`#6e6e73`): Texto secundario de cuerpo, descripciones de ayuda, metadatos terciarios.
- **Gris de borde suave** (`#d2d2d7`): Divisores, contornos sutiles y contención de utilidad atenuada.
- **Gris de borde medio** (`#86868b`): Contornos de campo más marcados en contextos de configuración de producto y filtros.
- **Gris oscuro de utilidad** (`#424245`): Cruce de texto/superficie neutro oscuro en contextos de tienda.

### Semánticos y de acento
- **Señal de selección/foco** (`#0071e3`): Señal compartida de foco y de estado seleccionado en los contextos de marketing y comercio.
- **Error/Advertencia/Éxito**: No se observó una paleta semántica distinta de forma consistente en el conjunto de superficies extraído.

### Sistema de gradientes
- Las páginas extraídas se basan abrumadoramente en superficies sólidas. La riqueza visual proviene de la fotografía y del renderizado de los acabados, no de gradientes persistentes en la UI.

## 3. Reglas tipográficas

### Familia de fuentes
- **Familia de display:** `SF Pro Display`, alternativas `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Familia de texto:** `SF Pro Text`, alternativas `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Reparto de uso:** La familia de display se encarga de los titulares hero/de producto y de los encabezados de merchandising; la familia de texto se encarga de la navegación, los controles, las etiquetas y el texto denso de comercio.

### Jerarquía
| Rol | Tamaño | Peso | Interlineado | Espaciado entre letras | Notas |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Escala hero de Environment/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Momentos hero de la página de inicio |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Encabezados de capítulo principales |
| Product Heading | 40px | 600 | 1.10 | normal | Títulos de sección de producto y campaña |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Destacados de dispositivo y merchandising |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px a 0.352px | Subhéroes a nivel de módulo |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Nomenclatura a nivel de tarjeta y texto clave |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Encabezados de configurador y de contenido agrupado |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Enlaces promocionales más grandes |
| Subhead | 19px | 600 | 1.21 | 0.228px | Introducciones de sección compactas |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Cuerpo estándar y descripciones de tienda |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Etiquetas enfatizadas y valores clave |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Botones, etiquetas de ayuda, texto de navegación compacto |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Letra pequeña, microetiquetas |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Metadatos densos y texto legal de apoyo |

### Principios
- **Continuidad entre tipos de página:** El mismo ADN tipográfico abarca los lanzamientos cinematográficos y los flujos de compra de producto, evitando una división de marca entre marketing y comercio.
- **Compresión a gran escala:** Los niveles de display usan un interlineado ajustado y un tracking controlado para transmitir una sensación maquinada y centrada en el producto.
- **Densidad legible a profundidad de tienda:** SF Pro Text equilibra la compacidad con suficiente ritmo vertical para listas de producto largas y matrices de opciones.
- **Escala de pesos mesurada:** 600 es el peso de énfasis dominante; 700 aparece de forma selectiva; 300 se usa con moderación para contraste en líneas más grandes.

### Nota sobre sustitutos de fuente
- Sustitutos más cercanos disponibles de forma libre: `Inter` para una implementación con mucho texto y métricas `SF Pro Display-like` aproximadas con `Inter Tight` para los titulares.
- Al sustituir, aumenta ligeramente el interlineado (+0.02 a +0.06) en los tamaños de cuerpo y reduce la intensidad del tracking negativo para preservar la legibilidad.

## 4. Estilos de componentes

### Botones
- **Acción de relleno principal:** fondo `#0071e3`, texto `#ffffff`, radio de 8px, padding horizontal compacto (comúnmente 8px 15px). Se usa para acciones decisivas de compra/avance.
- **Acción de relleno oscuro:** fondo `#1d1d1f`, texto `#ffffff`, radio de 8px. Se usa cuando las superficies claras necesitan un primario de alto contraste contenido.
- **Familia de acción píldora/cápsula:** acciones de cápsula grandes con radios de `18px`-`56px` y enlaces de píldora extrema a `980px`. Establece la silueta de llamada a la acción suave pero precisa de Apple.
- **Carcasas de filtro/botón de utilidad:** carcasas claras (`#fafafc` o blanco translúcido) con bordes grises sutiles (`#d2d2d7` / `#86868b`) para contextos de configuración densa.
- **Comportamiento al presionar:** los controles activos suelen reducir la escala o desplazar ligeramente el relleno para indicar la confirmación física de la pulsación.

### Tarjetas y contenedores
- **Tarjetas editoriales/de producto:** tarjetas claras sobre campos `#f5f5f7` o blancos con un encuadre mínimo y una composición que prioriza la imagen.
- **Tarjetas de utilidad oscuras:** escalones de grafito (`#272729` a `#2a2a2c`) usados para superposiciones, controles multimedia y módulos en contexto oscuro.
- **Paneles de configurador:** contenedores redondeados (a menudo de 12px-18px) con una definición de borde clara pero contenida.
- **Módulos de carrusel/destacados:** carcasas redondeadas más grandes (`28px`-`36px`) para los carriles de contenido destacado.

### Campos de entrada y formularios
- **Campos de entrada de tienda:** fondos translúcidos o blancos, texto oscuro (`#1d1d1f`), contención guiada por borde (`#86868b`).
- **Controles de selección:** la geometría de control circular/tipo toggle aparece con frecuencia en las interfaces de selección de producto.
- **Estrategia de densidad:** los campos de formulario permanecen visualmente discretos para que la imagen del dispositivo y la jerarquía de precios sigan siendo dominantes.

### Navegación
- **Navegación de marketing global:** barra oscura translúcida compacta con enlaces de tipografía pequeña e iconografía contenida.
- **Capas de navegación de Store/subtienda:** barras de utilidad adicionales, chips y controles segmentados para acotar categorías y productos.
- **Jerarquía de enlaces:** los azules de enlace siguen siendo la señal interactiva principal mientras el texto neutro da soporte a conjuntos de navegación densos.

### Tratamiento de la imagen
- **Fotografía que prioriza el objeto:** el hardware y los accesorios se colocan en primer plano sobre superficies sólidas controladas.
- **Renderizado de acabados de alta fidelidad:** los detalles reflectantes/de material son centrales para la persuasión visual.
- **Encuadre mixto:** las escenas hero a sangre completa coexisten con tarjetas de tienda redondeadas y miniaturas de merchandising recortadas con precisión.

### Otros componentes distintivos
- **Matriz de configurador de producto:** pilas de opciones y selectores que combinan chips, controles de tipo radio y bloques contextuales de precio/resumen.
- **Puntos/flechas de control de carrusel:** vocabulario de control circular en superposiciones atenuadas para el avance de la galería.
- **Paneles narrativos de Environment:** capítulos narrativos que combinan tipografía editorial con imágenes cinematográficas de producto/entorno.

## 5. Principios de maquetación

### Sistema de espaciado
- La unidad base es efectivamente `8px`, pero el sistema admite micropasos densos para una alineación de precisión.
- Valores de espaciado reutilizados con frecuencia entre páginas: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Constantes de ritmo universales visibles tanto en los flujos de marketing como de tienda: andamiaje de unidad de `8px` con intervalos de utilidad de `14-20px` para el padding de componentes y el espaciado de listas.

### Cuadrícula y contenedor
- **Páginas de escaparate:** columnas centrales grandes con amplio respiro horizontal y capítulos de color a ancho completo.
- **Páginas de comercio:** cuadrículas de producto y control multicolumna más ajustadas con apilamiento modular frecuente.
- **Comportamiento del contenedor:** núcleo legible restringido con márgenes exteriores generosos en anchos de escritorio.

### Filosofía del espacio en blanco
- **Cadencia de escenas:** los capítulos visuales principales usan un amplio respiro superior/inferior.
- **Compactación de información donde es necesario:** las páginas de tienda comprimen deliberadamente el espaciado para exponer más información accionable por viewport.
- **Separación guiada por el contraste:** las transiciones de sección se apoyan más en los cambios de superficie que en separadores decorativos.

### Escala de radio de borde
- **5px:** enlaces/etiquetas de utilidad diminutos y carcasas pequeñas menores.
- **8px-12px:** controles estándar y campos compactos.
- **16px-18px:** tarjetas, marcos de módulo y paneles de comercio.
- **28px-36px:** contenedores de módulo y de destacados más grandes.
- **56px / 100px / 980px:** cápsulas, píldoras grandes y formas de CTA alargadas características.
- **50%:** controles multimedia y de selección circulares.

## 6. Profundidad y elevación

| Nivel | Tratamiento | Uso |
|------|-----------|-----|
| Nivel 0 | Superficies neutras planas (`#ffffff`, `#f5f5f7`, `#000000`) | Escenarios narrativos y de producto principales |
| Nivel 1 | Contención sutil por borde (`#d2d2d7`, `#86868b`) | Filtros, campos de entrada, tarjetas de utilidad |
| Nivel 2 | Sombra suave (`rgba(0,0,0,0.08)` a `rgba(0,0,0,0.22)` donde aparece) | Tarjetas destacadas y módulos de merchandising elevados |
| Nivel 3 | Escalonado de superficie oscura (`#272729` -> `#2a2a2c`) | Superposiciones, controles multimedia, agrupaciones de utilidad oscuras |
| Accesibilidad | Señal de foco azul (`#0071e3`) | Énfasis de teclado y de selección |

La profundidad es intencionadamente contenida. Apple prefiere el contraste tonal, el escalonado de superficies y la jerarquía compositiva por encima de las pilas de sombras pesadas.

### Profundidad decorativa
- La profundidad decorativa se crea principalmente mediante el realismo fotográfico y el renderizado de materiales, no con efectos de UI sintéticos.
- Las superposiciones translúcidas y las barras de utilidad tipo cristal aportan una leve estratificación atmosférica en la navegación y los controles.

## 7. Lo que se debe y no se debe hacer

### Lo que se debe hacer
- Usa la tríada neutra (`#000000`, `#f5f5f7`, `#ffffff`) como base estructural.
- Reserva los acentos azules para una semántica genuina de acción y navegación.
- Mantén la tipografía ajustada y deliberada, especialmente en las escalas de display.
- Mantén el lenguaje geométrico de cápsula/círculo para los controles y las acciones clave.
- Deja que la imagen de producto cargue con el dramatismo visual; mantén el cromado discreto.
- Usa la contención guiada por borde en contextos de tienda densos en lugar de una ornamentación de tarjeta pesada.
- Preserva una separación clara entre los módulos de escaparate y los módulos transaccionales manteniendo compartidos los tokens centrales.

### Lo que no se debe hacer
- No introduzcas amplias paletas de acento secundarias que compitan con el azul de Apple.
- No abuses de las sombras, los efectos de brillo o los gradientes decorativos en el cromado central de la UI.
- No mezcles familias de fuentes no relacionadas ni aflojes el tracking de forma indiscriminada.
- No aplanes todas las esquinas a un único radio; Apple usa niveles de radio con propósito.
- No sobrecargues los módulos de comercio con bordes gruesos o efectos visuales estridentes.
- No elimines la cadencia de contraste neutro entre los capítulos oscuros y claros.
- No trates los flujos de marketing y de compra como sistemas de diseño separados.

## 8. Comportamiento responsivo

### Puntos de quiebre
| Nombre | Ancho | Cambios clave |
|------|-------|-------------|
| Móvil pequeño | 374px o menos | Controles de tienda ajustados, pilas de producto en una sola columna |
| Móvil | 375px-640px | Módulos de una columna, filas de acción compactas, selectores condensados |
| Tablet | 641px-833px | Tarjetas ampliadas y transiciones mixtas de 1-2 columnas |
| Tablet ancha | 834px-1023px | Merchandising multicolumna más estable, bloques de texto más grandes |
| Escritorio | 1024px-1240px | Maquetaciones de tienda completas y estructuras de comparación de productos |
| Escritorio ancho | 1241px-1440px | Expansión del hero de marketing y mayor espaciado de secciones |
| Escritorio grande | 1441px+ | Máximo respiro de capítulos y composición editorial amplia |

### Objetivos táctiles
- Las acciones primarias y secundarias se presentan generalmente en geometrías de píldora/botón fáciles de tocar.
- Los controles multimedia y de selección circulares se alinean con la intención táctil mínima en contextos móviles.
- La UI de comercio densa usa etiquetas compactas pero mantiene regiones de impacto claras mediante el padding de la forma circundante.

### Estrategia de colapso
- La tipografía hero de marketing se reduce en niveles discretos preservando el contraste de jerarquía.
- Las cuadrículas de producto y comercio colapsan de multicolumna a tarjetas apiladas con visibilidad persistente del selector.
- La navegación de utilidad se comprime en agrupaciones de enlaces/controles más simples preservando las acciones clave.
- Los conjuntos de opciones/configuración se secuencian verticalmente para mantener lineal el flujo de compra en pantallas pequeñas.

### Comportamiento de la imagen
- La imagen de producto conserva su proporción y centralidad a través de los puntos de quiebre.
- Las imágenes hero siguen siendo dominantes en móvil, con el texto reposicionado en torno a la prioridad del medio.
- Las miniaturas de tienda se mantienen legibles mediante una lógica de recorte más ajustada y un apilamiento de tarjetas más denso.
- Los módulos guiados por imagen siguen anclando el ritmo a medida que aumenta la densidad de la maquetación.

## 9. Guía de prompts para agentes

### Referencia rápida de color
- Azul de acción principal: **Azul de acción Apple** (`#0071e3`)
- Azul de enlace en línea: **Azul de enlace de cuerpo** (`#0066cc`)
- Lienzo de capítulo oscuro: **Negro absoluto** (`#000000`)
- Lienzo de capítulo claro: **Gris Apple pálido** (`#f5f5f7`)
- Texto principal sobre claro: **Tinta casi negra** (`#1d1d1f`)
- Texto secundario: **Gris neutro secundario** (`#6e6e73`)
- Borde de tienda suave: **Gris de borde suave** (`#d2d2d7`)
- Borde de tienda fuerte: **Gris de borde medio** (`#86868b`)

### Ejemplos de prompts de componentes
- "Diseña un hero de producto estilo Apple sobre un lienzo negro (`#000000`) con un titular SF Pro Display semibold (48-56px), texto de apoyo conciso y dos CTA de cápsula usando `#0071e3` y `#1d1d1f`."
- "Crea un panel de configuración de comercio sobre blanco (`#ffffff`) con tarjetas redondeadas de 18px, campos con borde `#86868b`, texto de cuerpo SF Pro Text de 17px y selectores de opciones compactos."
- "Construye una cuadrícula de tarjetas de merchandising que alterne superficies `#f5f5f7` y blancas, con tarjetas que priorizan la imagen, sombras contenidas y metadatos SF Pro Text de 14-17px."
- "Genera un grupo de controles de carrusel usando botones circulares (radio del 50%), superposiciones grises atenuadas y un feedback de estado activo claro para la navegación por la galería."
- "Compón un ritmo de página mixto de marketing + tienda: capítulo de escaparate oscuro -> capítulo de características claro -> módulo de lista de producto denso, manteniendo los acentos azules solo para acciones y enlaces."

### Guía de iteración
1. Fija primero la base neutra (`#000000`, `#f5f5f7`, `#ffffff`) antes de afinar los acentos.
2. Mantén los acentos azules escasos y con propósito; si todo es azul, la jerarquía colapsa.
3. Afina la tipografía en este orden: escala de display, legibilidad del cuerpo y luego microetiquetas.
4. Asigna el radio por clase de componente (campo, tarjeta, cápsula, círculo) en lugar de un redondeo único para todo.
5. Aumenta la densidad gradualmente al pasar de las secciones de escaparate a las de comercio.
6. Valida que la imagen de producto siga siendo la capa visual más fuerte después de cada revisión.

### Carencias conocidas
- No se observaron de forma consistente colores de estado semánticos distintos (error/advertencia/éxito) en el conjunto de páginas extraído.
- Algunos microestados de interacción varían según el módulo y no están representados como tokens universales del sistema.
- Algunos módulos de tienda exponen anulaciones tipográficas específicas de contexto que no aparecen en las cinco páginas.
