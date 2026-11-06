# Sistema de Diseño Inspirado en Cohere

> Categoría: IA y LLM
> Plataforma de IA empresarial. Gradientes vibrantes, estética de panel de datos enriquecido.

## 1. Tema Visual y Atmósfera

La interfaz de Cohere es un panel de comando empresarial pulido — seguro, limpio, y diseñado para que la IA parezca infraestructura seria en lugar de un juguete para consumidores. La experiencia se despliega sobre un lienzo blanco brillante donde el contenido se organiza en tarjetas generosamente redondeadas (22px de radio) que crean un lenguaje de contención orgánico, similar a nubes. Es un sitio que habla a CTOs y arquitectos empresariales: profesional sin ser frío, sofisticado sin resultar intimidante.

El lenguaje de diseño une dos mundos con un sistema de doble tipografía: CohereText, una serif de pantalla personalizada con tracking ajustado, otorga a los titulares la gravedad de un manifiesto tecnológico, mientras que Unica77 Cohere Web gestiona todo el texto de cuerpo e interfaz con precisión suiza geométrica. Esta combinación serif/sans crea una personalidad de "autoridad segura más claridad de ingeniería" que refleja perfectamente una plataforma de IA empresarial.

El color se utiliza con extrema contención — la interfaz es casi completamente en blanco y negro con bordes en gris frío (`#d9d9dd`, `#e5e7eb`). El púrpura-violeta aparece únicamente en bandas de héroe fotográficas, secciones con gradiente y el azul interactivo (`#1863dc`) que señala estados de hover y foco. Esta contención cromática significa que cuando el color SÍ aparece — en capturas de pantalla de productos, fotografía empresarial y la sección de púrpura profundo — tiene el máximo peso visual.

**Características Clave:**
- Lienzo blanco brillante con bordes de contención en gris frío
- Radio de borde de firma de 22px — la redondez distintiva de la "tarjeta Cohere"
- Doble tipografía personalizada: CohereText (serif de pantalla) + Unica77 (sans de cuerpo)
- Contención cromática de nivel empresarial: negro, blanco, grises fríos, acento mínimo en púrpura-azul
- Secciones héroe en púrpura profundo/violeta que proporcionan contraste dramático
- Botones fantasma/transparentes que cambian a azul al hacer hover
- Fotografía empresarial que muestra aplicaciones reales y diversas
- CohereMono para código y etiquetas técnicas con transformaciones en mayúsculas

## 2. Paleta de Colores y Roles

### Primarios
- **Cohere Black** (`#000000`): Texto de titular primario y elementos de máximo énfasis.
- **Near Black** (`#212121`): Color estándar de enlace de cuerpo — ligeramente más suave que el negro puro.
- **Deep Dark** (`#17171c`): Un negro casi azulado para navegación y texto en secciones oscuras.

### Secundarios y Acento
- **Interaction Blue** (`#1863dc`): El acento interactivo primario — aparece en el hover de botones, estados de foco y enlaces activos. El único color cromático de acción.
- **Ring Blue** (`#4c6ee6` al 50%): Color de anillo de Tailwind para indicadores de foco de teclado.
- **Focus Purple** (`#9b60aa`): Color de borde de foco de entrada — un violeta apagado.

### Superficie y Fondo
- **Pure White** (`#ffffff`): El fondo de página principal y la superficie de tarjeta.
- **Snow** (`#fafafa`): Superficies elevadas sutiles y fondos de secciones claras.
- **Lightest Gray** (`#f2f2f2`): Bordes de tarjeta y las líneas de contención más suaves.

### Neutros y Texto
- **Muted Slate** (`#93939f`): Enlaces de pie de página y texto terciario sin énfasis — un gris de tono frío con un ligero matiz azul-violeta.
- **Border Cool** (`#d9d9dd`): Bordes estándar de sección y elemento de lista — un gris frío, ligeramente teñido de púrpura.
- **Border Light** (`#e5e7eb`): Variante de borde más clara — el gray-200 estándar de Tailwind.

### Sistema de Gradientes
- **Banda Héroe Púrpura-Violeta**: Secciones con gradiente en púrpura profundo que crean contraste dramático contra el lienzo blanco. Aparecen como bandas de ancho completo que albergan capturas de pantalla de productos y mensajes clave.
- **Gradiente de Pie de Página Oscuro**: La página transiciona a través de púrpura profundo/carbón hacia el pie de página negro, creando un efecto de "atardecer".

## 3. Reglas Tipográficas

### Familia de Fuentes
- **Pantalla**: `CohereText`, con fallbacks: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Cuerpo / UI**: `Unica77 Cohere Web`, con fallbacks: `Inter, Arial, ui-sans-serif, system-ui`
- **Código**: `CohereMono`, con fallbacks: `Arial, ui-sans-serif, system-ui`
- **Iconos**: `CohereIconDefault` (fuente de iconos personalizada)

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Espaciado de Letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Pantalla / Héroe | CohereText | 72px (4.5rem) | 400 | 1.00 (ajustado) | -1.44px | Máximo impacto, autoridad serif |
| Pantalla Secundaria | CohereText | 60px (3.75rem) | 400 | 1.00 (ajustado) | -1.2px | Títulos de secciones grandes |
| Encabezado de Sección | Unica77 | 48px (3rem) | 400 | 1.20 (ajustado) | -0.48px | Títulos de secciones de características |
| Subtítulo | Unica77 | 32px (2rem) | 400 | 1.20 (ajustado) | -0.32px | Encabezados de tarjeta, nombres de características |
| Título de Característica | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Títulos de secciones menores |
| Cuerpo Grande | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Párrafos introductorios |
| Cuerpo / Botón | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Cuerpo estándar, texto de botón |
| Botón Mediano | Unica77 | 14px (0.88rem) | 500 | 1.71 (relajado) | normal | Botones más pequeños, etiquetas con énfasis |
| Leyenda | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Metadatos, descripciones |
| Etiqueta en Mayúsculas | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Etiquetas de sección en mayúsculas |
| Pequeño | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Texto más pequeño, enlaces de pie de página |
| Código Micro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Etiquetas de código en mayúsculas diminutas |

### Principios
- **Serif para declaración, sans para utilidad**: CohereText lleva la voz de la marca a escala de pantalla — sus remates serif otorgan a los titulares la autoridad de una investigación publicada. Unica77 gestiona todo lo funcional con neutralidad suizo-geométrica.
- **Tracking negativo a escala**: CohereText usa espaciado de letras de -1.2px a -1.44px a 60–72px, creando bloques de texto densos e impactantes.
- **Peso único de cuerpo**: Casi todo el uso de Unica77 es peso 400. El peso 500 aparece únicamente para pequeños énfasis en botones. El sistema se basa en tamaño y espaciado, no en contraste de peso.
- **Etiquetas de código en mayúsculas**: CohereMono usa mayúsculas con espaciado de letras positivo (0.16–0.28px) para etiquetas técnicas y marcadores de sección.

## 4. Estilos de Componentes

### Botones

**Fantasma / Transparente**
- Fondo: transparente (`rgba(255, 255, 255, 0)`)
- Texto: Cohere Black (`#000000`)
- Sin borde visible
- Hover: el texto cambia a Interaction Blue (`#1863dc`), opacidad 0.8
- Foco: contorno sólido de 2px en Interaction Blue
- El estilo de botón principal — invisible hasta que se interactúa con él

**Sólido Oscuro**
- Fondo: oscuro/negro
- Texto: Pure White
- Para CTA en superficies claras
- Con forma de píldora o radio estándar

**Contorneado**
- Contención basada en borde
- Usado en acciones secundarias

### Tarjetas y Contenedores
- Fondo: Pure White (`#ffffff`)
- Borde: sólido fino en Lightest Gray (`1px solid #f2f2f2`) para tarjetas sutiles; Border Cool (`#d9d9dd`) para énfasis
- Radio: **22px** — el radio firma de Cohere para tarjetas primarias, imágenes y contenedores de diálogo. También 4px, 8px, 16px, 20px para elementos más pequeños
- Sombra: mínima — Cohere se apoya en el color de fondo y los bordes en lugar de sombras
- Especial: radio `0px 0px 22px 22px` (redondeo solo en la parte inferior) para contenedores de sección
- Diálogo: radio de 8px para cajas modales/de diálogo

### Entradas y Formularios
- Texto: blanco sobre entrada oscura, negro sobre entrada clara
- Borde de foco: Focus Purple (`#9b60aa`) con `1px solid`
- Sombra de foco: anillo rojo (`rgb(179, 0, 0) 0px 0px 0px 2px`) — probablemente para indicación de estado de error
- Contorno de foco: Interaction Blue sólido 2px

### Navegación
- Navegación horizontal limpia sobre fondo blanco u oscuro
- Logo: marca de palabra de Cohere (SVG personalizado)
- Enlaces: texto oscuro a 16px Unica77
- CTA: botón sólido oscuro
- Móvil: colapso con menú hamburguesa

### Tratamiento de Imágenes
- Fotografía empresarial con sujetos y entornos diversos
- Fotografía héroe teñida de púrpura para secciones dramáticas
- Capturas de pantalla de la UI del producto sobre superficies oscuras
- Imágenes con radio de 22px que coincide con el sistema de tarjetas
- Secciones de gradiente púrpura a sangre completa

### Componentes Distintivos

**Sistema de Tarjetas de 22px**
- El radio de borde de 22px es la firma visual de Cohere
- Todas las tarjetas, imágenes y contenedores primarios utilizan este radio
- Crea una suavidad orgánica similar a nubes, distintiva frente a los típicos 8–12px

**Barra de Confianza Empresarial**
- Logotipos de empresas mostrados en una franja horizontal
- Demuestra adopción empresarial
- Tratamiento de logotipo limpio y monocromático

**Bandas Héroe Púrpura**
- Secciones en púrpura profundo de ancho completo que albergan exhibiciones de productos
- Crean rupturas visuales dramáticas en el flujo de página blanco
- Las capturas de pantalla del producto flotan dentro del entorno púrpura

**Etiquetas de Código en Mayúsculas**
- CohereMono en mayúsculas con espaciado de letras
- Usadas como marcadores de sección y etiquetas de categorización
- Crea una jerarquía de información técnica y estructurada

## 5. Principios de Maquetación

### Sistema de Espaciado
- Unidad base: 8px
- Escala: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- El padding de los botones varía según la variante
- Padding interno de tarjeta: aproximadamente 24–32px
- Espaciado vertical de sección: generoso (56–60px entre secciones)

### Cuadrícula y Contenedor
- Ancho máximo del contenedor: hasta 2560px (muy amplio) con escalado responsivo
- Héroe: centrado con tipografía dramática
- Secciones de características: cuadrículas de tarjetas multicolumna
- Secciones empresariales: bandas púrpura de ancho completo
- 26 breakpoints detectados — sistema responsivo extremadamente granular

### Filosofía de Espacio en Blanco
- **Claridad empresarial**: Cada sección presenta una proposición clara con espacio para respirar entre ellas.
- **La fotografía como héroe**: Las grandes secciones fotográficas proporcionan interés visual sin requerir elementos de diseño decorativos.
- **Agrupación en tarjetas**: El contenido relacionado se agrupa en tarjetas redondeadas a 22px, creando agrupaciones naturales de información.

### Escala de Radio de Borde
- Nítido (4px): Elementos de navegación, etiquetas pequeñas, paginación
- Cómodo (8px): Cajas de diálogo, contenedores secundarios, tarjetas pequeñas
- Generoso (16px): Contenedores destacados, tarjetas medianas
- Grande (20px): Tarjetas de características grandes
- Firma (22px): Tarjetas primarias, imágenes héroe, contenedores principales — EL radio Cohere
- Píldora (9999px): Botones, etiquetas, indicadores de estado

## 6. Profundidad y Elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra, sin borde | Fondo de página, bloques de texto |
| Con Borde (Nivel 1) | `1px solid #f2f2f2` o `#d9d9dd` | Tarjetas estándar, separadores de lista |
| Banda Púrpura (Nivel 2) | Fondo púrpura oscuro de ancho completo | Secciones héroe, exhibiciones de características |

**Filosofía de Sombras**: Cohere es casi totalmente libre de sombras. La profundidad se comunica a través del **contraste de color de fondo** (tarjetas blancas sobre bandas púrpura, superficie blanca sobre nieve), la **contención por bordes** (bordes en gris frío) y la dramática **alternancia de secciones de claro a oscuro**. Cuando los elementos necesitan elevación, la consiguen siendo blancos sobre oscuro, en lugar de mediante proyección de sombras.

## 7. Qué Hacer y Qué Evitar

### Qué Hacer
- Usar radio de borde de 22px en todas las tarjetas y contenedores primarios — es la firma visual
- Usar CohereText para encabezados de pantalla (72px, 60px) con espaciado de letras negativo
- Usar Unica77 para todo el texto de cuerpo e interfaz con peso 400
- Mantener la paleta en blanco y negro con bordes en gris frío
- Usar Interaction Blue (#1863dc) únicamente para estados interactivos de hover/foco
- Usar secciones en púrpura profundo para rupturas visuales dramáticas y exhibiciones de productos
- Aplicar mayúsculas + espaciado de letras en CohereMono para etiquetas de sección
- Mantener fotografía apropiada para el ámbito empresarial con sujetos diversos

### Qué Evitar
- No usar radio de borde distinto de 22px en tarjetas primarias — el radio firma importa
- No introducir colores cálidos — la paleta es estrictamente de tono frío
- No usar sombras pesadas — la profundidad proviene del contraste de color y los bordes
- No usar peso negrita (700+) en texto de cuerpo — el rango es 400–500
- No omitir la jerarquía serif/sans — CohereText para titulares, Unica77 para cuerpo
- No usar el púrpura como color de superficie para tarjetas — el púrpura está reservado para secciones de ancho completo
- No reducir el espaciado de sección por debajo de 40px — los diseños empresariales necesitan espacio para respirar
- No usar decoración en los botones por defecto — el estado base es fantasma/transparente

## 8. Comportamiento Responsivo

### Breakpoints
| Nombre | Ancho | Cambios Clave |
|------|-------|-------------|
| Móvil Pequeño | <425px | Maquetación compacta, espaciado mínimo |
| Móvil | 425–640px | Una sola columna, tarjetas apiladas |
| Móvil Grande | 640–768px | Ajustes menores de espaciado |
| Tableta | 768–1024px | Comienzan las cuadrículas de 2 columnas |
| Escritorio | 1024–1440px | Maquetación completa multicolumna |
| Escritorio Grande | 1440–2560px | Ancho máximo del contenedor |

*26 breakpoints detectados — uno de los sitios con mayor granularidad responsiva en el conjunto de datos.*

### Objetivos Táctiles
- Botones adecuadamente dimensionados para interacción táctil
- Enlaces de navegación con espaciado cómodo
- Superficies de tarjeta como objetivos táctiles

### Estrategia de Colapso
- **Navegación**: La navegación completa colapsa en menú hamburguesa
- **Cuadrículas de características**: Multicolumna → 2 columnas → columna única
- **Texto héroe**: 72px → 48px → 32px escalado progresivo
- **Secciones púrpura**: Mantienen ancho completo, el contenido se apila
- **Cuadrículas de tarjetas**: 3 → 2 → 1 columna

### Comportamiento de Imágenes
- La fotografía escala proporcionalmente dentro de contenedores con radio de 22px
- Las capturas de pantalla del producto mantienen la relación de aspecto
- Las secciones púrpura escalan el fondo proporcionalmente

## 9. Guía de Prompts para Agente

### Referencia Rápida de Colores
- Texto Principal: "Cohere Black (#000000)"
- Fondo de Página: "Pure White (#ffffff)"
- Texto Secundario: "Near Black (#212121)"
- Acento Hover: "Interaction Blue (#1863dc)"
- Texto Atenuado: "Muted Slate (#93939f)"
- Bordes de Tarjeta: "Lightest Gray (#f2f2f2)"
- Bordes de Sección: "Border Cool (#d9d9dd)"

### Ejemplos de Prompts para Componentes
- "Crea una sección héroe sobre Pure White (#ffffff) con CohereText a 72px peso 400, line-height 1.0, letter-spacing -1.44px. Texto en Cohere Black. Subtítulo en Unica77 a 18px peso 400, line-height 1.4."
- "Diseña una tarjeta de característica con border-radius de 22px, borde de 1px sólido en Lightest Gray (#f2f2f2) sobre blanco. Título en Unica77 a 32px, letter-spacing -0.32px. Cuerpo en Unica77 a 16px, Muted Slate (#93939f)."
- "Construye un botón fantasma: fondo transparente, texto Cohere Black en Unica77 a 16px. En hover, el texto cambia a Interaction Blue (#1863dc) con opacidad 0.8. Foco: contorno sólido de 2px en Interaction Blue."
- "Crea una sección de ancho completo en púrpura profundo con texto blanco. CohereText a 60px para el encabezado. La captura de pantalla del producto flota dentro usando border-radius de 22px."
- "Diseña una etiqueta de sección usando CohereMono a 14px, en mayúsculas, letter-spacing 0.28px. Texto en Muted Slate (#93939f)."

### Guía de Iteración
1. Centrarse en UN componente a la vez
2. Usar siempre radio de 22px para tarjetas primarias — "la redondez de la tarjeta Cohere"
3. Especificar la tipografía — CohereText para titulares, Unica77 para cuerpo, CohereMono para etiquetas
4. Los elementos interactivos usan Interaction Blue (#1863dc) solo en hover
5. Mantener las superficies blancas con bordes en gris frío — sin tonos cálidos
6. El púrpura es para secciones de ancho completo, nunca para fondos de tarjetas
