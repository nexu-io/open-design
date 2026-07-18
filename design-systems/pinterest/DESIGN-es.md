# Sistema de diseño inspirado en Pinterest

> Category: Medios y consumidor
> Descubrimiento visual. Acento rojo, cuadrícula de mampostería, imagen primero.

## 1. Tema visual y atmósfera

El sitio web de Pinterest es un lienzo cálido e inspirador que trata el descubrimiento visual como una revista de estilo de vida. El diseño opera sobre un fondo blanco suave y ligeramente cálido con el Rojo Pinterest (`#e60023`) como el único y audaz acento de marca. A diferencia de los azules fríos de la mayoría de las plataformas tecnológicas, la escala de neutros de Pinterest tiene un subtono claramente cálido — los grises tienden hacia el oliva/arena (`#91918c`, `#62625b`, `#e5e5e0`) en lugar del acero frío, creando una atmósfera acogedora y artesanal que invita a explorar.

La tipografía usa Pin Sans — una fuente propietaria personalizada con una amplia pila de respaldo que incluye fuentes japonesas, lo que refleja el alcance global de Pinterest. A escala de display (70px, peso 600), Pin Sans crea titulares grandes e invitadores. En tamaños más pequeños, el sistema es compacto: botones a 12px, subtítulos a 12–14px. El sistema de nomenclatura de variables CSS (`--comp-*`, `--sema-*`, `--base-*`) revela una sofisticada arquitectura de tokens de diseño de tres niveles: nivel de componente, nivel semántico y nivel base.

Lo que distingue a Pinterest es su generoso sistema de radio de borde (12px–40px, más 50% para círculos) y los fondos de botones con matiz cálido. El botón secundario (`#e5e5e0`) tiene un tono arena claramente cálido en lugar de gris frío. El botón rojo primario usa un radio de 16px — redondeado pero no en forma de píldora. Combinado con fondos de insignias cálidos (`hsla(60,20%,98%,.5)` — un sutil lavado amarillo cálido) y diseños dominados por la fotografía, el resultado es un diseño que se siente artesanal y personal, no corporativo y estéril.

**Características clave:**
- Lienzo blanco cálido con neutros en tono oliva/arena — acogedor, no clínico
- Rojo Pinterest (`#e60023`) como único acento audaz — nunca sutil, siempre seguro
- Fuente personalizada Pin Sans con pila de respaldo global (incluye CJK)
- Arquitectura de tokens de tres niveles: `--comp-*` / `--sema-*` / `--base-*`
- Superficies secundarias cálidas: gris arena (`#e5e5e0`), insignia cálida (`hsla(60,20%,98%,.5)`)
- Radio de borde generoso: 16px estándar, hasta 40px para contenedores grandes
- Contenido con fotografía primero — los pines/imágenes son el elemento visual principal
- Texto casi violeta oscuro (`#211922`) — cálido, con un toque de ciruela

## 2. Paleta de colores y roles

### Marca principal
- **Rojo Pinterest** (`#e60023`): CTA principal, acento de marca — rojo audaz y seguro
- **Verde 700** (`#103c25`): `--base-color-green-700`, acento de éxito/naturaleza
- **Verde 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, verde presionado

### Texto
- **Negro ciruela** (`#211922`): Texto principal — casi negro cálido con subtono ciruela
- **Negro** (`#000000`): Texto secundario, texto de botón
- **Gris oliva** (`#62625b`): Descripciones secundarias, texto tenue
- **Plateado cálido** (`#91918c`): `--comp-button-color-text-transparent-disabled`, texto deshabilitado, bordes de entrada
- **Blanco** (`#ffffff`): Texto sobre superficies oscuras/de color

### Interactivo
- **Azul foco** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, anillos de foco
- **Morado rendimiento** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, características de rendimiento
- **Morado recomendación** (`#7e238b`): `--sema-color-hover-text-recommendation`, recomendación IA
- **Azul enlace** (`#2b48d4`): Color de texto de enlace
- **Azul Facebook** (`#0866ff`): `--facebook-background-color`, inicio de sesión social
- **Azul presionado** (`#617bff`): `--base-color-pressed-blue-200`, estado presionado

### Superficie y borde
- **Gris arena** (`#e5e5e0`): Fondo de botón secundario — cálido, artesanal
- **Claro cálido** (`#e0e0d9`): Fondos de botones circulares, insignias
- **Lavado cálido** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, fondo de insignia cálido sutil
- **Neblina** (`#f6f6f3`): Superficie clara (al 50% de opacidad)
- **Borde deshabilitado** (`#c8c8c1`): `--sema-color-border-disabled`, bordes deshabilitados
- **Gris hover** (`#bcbcb3`): `--base-color-hover-grayscale-150`, borde al pasar el cursor
- **Superficie oscura** (`#33332e`): Fondos de secciones oscuras

### Semántico
- **Rojo error** (`#9e0a0a`): Estados de error de casilla/formulario

## 3. Reglas tipográficas

### Familia de fuentes
- **Principal**: `Pin Sans`, respaldos: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de línea | Espaciado de letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Pin Sans | 70px (4,38rem) | 600 | normal | normal | Máximo impacto |
| Encabezado de sección | Pin Sans | 28px (1,75rem) | 700 | normal | -1,2px | Tracking negativo |
| Cuerpo | Pin Sans | 16px (1,00rem) | 400 | 1,40 | normal | Lectura estándar |
| Subtítulo negrita | Pin Sans | 14px (0,88rem) | 700 | normal | normal | Metadatos fuertes |
| Subtítulo | Pin Sans | 12px (0,75rem) | 400–500 | 1,50 | normal | Texto pequeño, etiquetas |
| Botón | Pin Sans | 12px (0,75rem) | 400 | normal | normal | Etiquetas de botón |

### Principios
- **Escala de tipo compacta**: El rango es 12px–70px con un salto dramático — la mayoría del texto funcional está en 12–16px, creando una jerarquía de información densa, similar a una aplicación.
- **Distribución de peso cálida**: 600–700 para encabezados, 400–500 para cuerpo. Sin pesos ultraligeros — el tipo siempre se siente sustancial.
- **Tracking negativo en encabezados**: -1,2px en encabezados de 28px crea títulos de sección acogedores e íntimos.
- **Familia de fuentes única**: Pin Sans maneja todo — no se detectó fuente de display secundaria ni monoespaciada.

## 4. Estilos de componentes

### Botones

**Rojo primario**
- Fondo: `#e60023` (Rojo Pinterest)
- Texto: `#000000` (negro — elección inusual para contraste sobre rojo)
- Relleno: 6px 14px
- Radio: 16px (generosamente redondeado, no en píldora)
- Borde: `2px solid rgba(255, 255, 255, 0)` (transparente)
- Foco: borde semántico + contorno via variables CSS

**Arena secundario**
- Fondo: `#e5e5e0` (gris arena cálido)
- Texto: `#000000`
- Relleno: 6px 14px
- Radio: 16px
- Foco: mismo sistema de borde semántico

**Acción circular**
- Fondo: `#e0e0d9` (claro cálido)
- Texto: `#211922` (negro ciruela)
- Radio: 50% (círculo)
- Uso: acciones de pin, controles de navegación

**Fantasma / Transparente**
- Fondo: transparente
- Texto: `#000000`
- Sin borde
- Uso: acciones terciarias

### Tarjetas y contenedores
- Tarjetas de pin con fotografía primero y radio generoso (12px–20px)
- Sin sombra de caja tradicional en la mayoría de las tarjetas
- Fondos blancos o de neblina cálida
- Borde blanco grueso de 8px en algunos contenedores de imagen

### Entradas
- Entrada de correo: fondo blanco, borde `1px solid #91918c`, radio 16px, relleno 11px 15px
- Foco: sistema de borde semántico + contorno via variables CSS

### Navegación
- Encabezado limpio sobre fondo blanco o cálido
- Logo Pinterest + barra de búsqueda centrados
- Pin Sans 16px para enlaces de navegación
- Acentos Rojo Pinterest para estados activos

### Tratamiento de imágenes
- Cuadrícula de mampostería estilo pin (diseño característico de Pinterest)
- Esquinas redondeadas: 12px–20px en imágenes
- Fotografía como contenido principal — cada pin es una imagen
- Bordes blancos gruesos (8px) en contenedores de imágenes destacadas

## 5. Principios de diseño

### Sistema de espaciado
- Unidad base: 8px
- Escala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Saltos grandes: 32px → 80px → 100px para espaciado de secciones

### Cuadrícula y contenedor
- Cuadrícula de mampostería para contenido de pines (diseño característico)
- Secciones de contenido centradas con ancho máximo generoso
- Pie de página oscuro de ancho completo
- Barra de búsqueda como elemento de navegación principal

### Filosofía del espacio en blanco
- **Densidad de inspiración**: La cuadrícula de mampostería empaqueta los pines apretados — la densidad del contenido ES la propuesta de valor. El espacio en blanco existe entre secciones, no dentro de la cuadrícula.
- **Respira arriba, densidad abajo**: Las secciones hero/featured reciben relleno generoso; la cuadrícula de pines es compacta e inmersiva.

### Escala de radio de borde
- Estándar (12px): Tarjetas pequeñas, enlaces
- Botón (16px): Botones, entradas, tarjetas medianas
- Cómodo (20px): Tarjetas featured
- Grande (28px): Contenedores grandes
- Sección (32px): Elementos de pestaña, paneles grandes
- Hero (40px): Contenedores hero, bloques featured grandes
- Círculo (50%): Botones de acción, indicadores de pestaña

## 6. Profundidad y elevación

| Nivel | Tratamiento | Uso |
|-------|-----------|-----|
| Plano (Nivel 0) | Sin sombra | Por defecto — los pines dependen del contenido, no de la sombra |
| Sutil (Nivel 1) | Sombra mínima (de tokens) | Superposiciones elevadas, menús desplegables |
| Foco (Accesibilidad) | Anillo `--sema-color-border-focus-outer-default` | Estados de foco |

**Filosofía de sombras**: Pinterest usa sombras mínimas. La cuadrícula de mampostería depende del contenido (fotografía) para crear interés visual en lugar de efectos de elevación. La profundidad proviene de la calidez de los colores de superficie y el generoso redondeado de los contenedores.

## 7. Qué hacer y qué no hacer

### Hacer
- Usar neutros cálidos (`#e5e5e0`, `#e0e0d9`, `#91918c`) — el tono cálido oliva/arena es la identidad
- Aplicar Rojo Pinterest (`#e60023`) solo para CTAs principales — es audaz y singular
- Usar Pin Sans exclusivamente — una fuente para todo
- Aplicar radio de borde generoso: 16px para botones/entradas, 20px+ para tarjetas
- Mantener la cuadrícula de mampostería densa — la densidad del contenido es el valor
- Usar fondos de insignia cálidos (`hsla(60,20%,98%,.5)`) para lavados cálidos sutiles
- Usar `#211922` (negro ciruela) para texto principal — más cálido que el negro puro

### No hacer
- No usar neutros grises fríos — siempre cálido/tono oliva
- No usar negro puro (`#000000`) como texto principal — usar negro ciruela (`#211922`)
- No usar botones en forma de píldora — el radio de 16px es redondeado pero no píldora
- No agregar sombras pesadas — Pinterest es plano por diseño, la profundidad viene del contenido
- No usar radio de borde pequeño (<12px) en tarjetas — el redondeado generoso es esencial
- No introducir colores de marca adicionales — rojo + neutros cálidos es la paleta completa
- No usar pesos de fuente finos — Pin Sans mínimo 400

## 8. Comportamiento responsive

### Puntos de interrupción
| Nombre | Ancho | Cambios clave |
|------|-------|-------------|
| Móvil | <576px | Columna única, diseño compacto |
| Móvil grande | 576–768px | Cuadrícula de pines de 2 columnas |
| Tablet | 768–890px | Cuadrícula expandida |
| Escritorio pequeño | 890–1312px | Cuadrícula de mampostería estándar |
| Escritorio | 1312–1440px | Diseño completo |
| Escritorio grande | 1440–1680px | Columnas de cuadrícula expandidas |
| Ultra ancho | >1680px | Densidad máxima de cuadrícula |

### Estrategia de colapso
- Cuadrícula de pines: 5+ columnas → 3 → 2 → 1
- Navegación: barra de búsqueda + iconos → nav móvil simplificada
- Secciones featured: lado a lado → apilado
- Hero: 70px → escala proporcionalmente hacia abajo
- Pie de página: oscuro multicolumna → apilado

## 9. Guía de prompts para agentes

### Referencia rápida de colores
- Marca: Rojo Pinterest (`#e60023`)
- Fondo: Blanco (`#ffffff`)
- Texto: Negro ciruela (`#211922`)
- Texto secundario: Gris oliva (`#62625b`)
- Superficie de botón: Gris arena (`#e5e5e0`)
- Borde: Plateado cálido (`#91918c`)
- Foco: Azul foco (`#435ee5`)

### Ejemplos de prompts de componentes
- "Crear un hero: fondo blanco. Titular a 70px Pin Sans peso 600, negro ciruela (#211922). Botón CTA rojo (#e60023, radio 16px, relleno 6px 14px). Botón arena secundario (#e5e5e0, radio 16px)."
- "Diseñar una tarjeta pin: fondo blanco, radio 16px, sin sombra. La fotografía llena la parte superior, descripción 16px Pin Sans peso 400 debajo en #62625b."
- "Construir un botón de acción circular: fondo #e0e0d9, radio 50%, icono #211922."
- "Crear un campo de entrada: fondo blanco, 1px solid #91918c, radio 16px, relleno 11px 15px. Foco: contorno azul via tokens semánticos."
- "Diseñar el pie de página oscuro: fondo #33332e. Logo script Pinterest en blanco. Enlaces 12px Pin Sans en #91918c."

### Guía de iteración
1. Neutros cálidos en todas partes — grises oliva/arena, nunca acero frío
2. Rojo Pinterest solo para CTAs — audaz y singular
3. Radio de 16px en botones/entradas, 20px+ en tarjetas — generoso pero no píldora
4. Pin Sans es la única fuente — compacto a 12px para interfaz, 70px para display
5. La fotografía lleva el diseño — la interfaz se mantiene cálida y minimal
6. Negro ciruela (#211922) para texto — más cálido que el negro puro
