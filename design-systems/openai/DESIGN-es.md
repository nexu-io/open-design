# Design System Inspired by OpenAI

> Category: IA y LLM
> Sistema casi monocromático y sereno, anclado en un negro-azulado profundo con generoso espacio en blanco y tipografía editorial.

## 1. Visual Theme & Atmosphere

La superficie de producto de OpenAI evoca un laboratorio de investigación vestido para el público: clínica, contenida, deliberadamente silenciosa. El fondo de página es un blanco puro (`#ffffff`) superpuesto sobre una tinta casi negra (`#0d0d0d`) con un sutil matiz azulado, de modo que incluso el texto se percibe ligeramente frío en lugar de agresivamente oscuro. El resultado es una neutralidad cromática que pone el primer plano en la salida del modelo, el código y la prosa, no en el entorno que los rodea.

El movimiento característico es el uso de **Söhne** (o su sustituto del sistema `inter`) con pesos contenidos — 400 para el cuerpo, 500 para navegación y etiquetas, 600 para énfasis — emparejado con **Signifier**, una serif contemporánea reservada para los titulares editoriales. Mientras la mayoría de las marcas de IA se inclinan por lo futurista, los titulares con serif de OpenAI le otorgan al producto un tono literario y discreto, como si cada anuncio fuera un ensayo.

El sistema de formas es uniformemente suave: radios de 8px–12px, píldoras de 9999px para etiquetas y chips, sin ángulos duros en ningún lugar. Las transiciones entre secciones se marcan con espacios en blanco en lugar de separadores; cuando aparecen bordes son líneas de `#e5e5e5` tan finas que se perciben como ausencia de color más que como presencia.

**Características Clave:**
- Lienzo blanco puro (`#ffffff`) con tinta negro-azulada profunda (`#0d0d0d`)
- Söhne / Inter a pesos modestos (400, 500, 600) — contención antes que asertividad
- Signifier serif para titulares editoriales de presentación
- Radios suaves de 8–12px en todas partes; píldoras de 9999px para chips
- Bordes de línea fina (`#e5e5e5`) usados con moderación; el espacio en blanco como divisor principal
- Ilustraciones de un solo color en azulado profundo — sin degradados en las marcas
- Altura de línea generosa (1.55–1.65) y tracking cercano a cero

## 2. Color Palette & Roles

### Primary
- **Pure White** (`#ffffff`): Fondo principal, superficie de tarjeta, fondo de botón.
- **Ink Black** (`#0d0d0d`): Texto principal, marca, CTA primario.
- **Soft Black** (`#1a1a1a`): Encabezado secundario, tinta alternativa para texto no crítico.

### Surface & Background
- **Mist** (`#fafafa`): Fondo de separación de sección, superficie de pie de página.
- **Pearl** (`#f5f5f5`): Superficie de tarjeta, panel elevado.
- **Cloud** (`#ececec`): Fondo desactivado, tinte divisor.

### Brand Accent
- **OpenAI Teal** (`#10a37f`): Primario de marca, enlace, insignia destacada — el único color en un sistema por lo demás neutro.
- **Teal Deep** (`#0a7a5e`): Estado hover y presionado del color de marca.
- **Teal Soft** (`#e8f5f0`): Tinte de superficie para insignias de éxito y destacados.

### Neutrals & Text
- **Graphite** (`#3c3c3c`): Texto del cuerpo, color de lectura predeterminado.
- **Slate** (`#6e6e6e`): Texto secundario, pies de foto, metadatos.
- **Ash** (`#9b9b9b`): Texto terciario, marcador de posición, etiqueta desactivada.
- **Stone** (`#c4c4c4`): Divisores decorativos, iconos tenues.

### Semantic & Border
- **Border Hairline** (`#e5e5e5`): Separador estándar de línea fina.
- **Border Soft** (`#ededed`): Contorno de tarjeta sobre superficie blanca.
- **Error** (`#ef4146`): Validación, acción destructiva.
- **Warning** (`#f5a623`): Ámbar suave para estados de aviso.
- **Info** (`#2563eb`): Tono de enlace informativo (usado con moderación; el azulado sigue siendo prioritario).

## 3. Typography Rules

### Font Family
- **Display / Editorial**: `Signifier`, con fallback: `'Source Serif Pro', Georgia, serif`
- **Body / UI**: `Söhne`, con fallback: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono**: `Söhne Mono`, con fallback: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Héroe editorial, títulos de anuncio |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Encabezado de página |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Encabezado de sección |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Subsección |
| Body Large | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Párrafos de introducción |
| Body | Söhne | 16px (1rem) | 400 | 1.65 | normal | Texto de lectura estándar |
| Body Small | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Cuerpo de tarjeta, UI densa |
| Caption | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadatos, insignias |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Supratítulo, enlaces de navegación en mayúsculas |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Bloques de código, salida de terminal |

### Principles
- **La contención como identidad**: los pesos tienen un tope de 600; 700+ resulta ajeno a la marca. La jerarquía se establece mediante tamaño y color, no mediante peso.
- **Serif para el alma, sans para el sistema**: Signifier aparece únicamente en momentos editoriales de presentación. La UI del producto es exclusivamente sans.
- **Tracking negativo en display**: -0.02em en tamaños de presentación; el tracking vuelve a cero a partir de 16px.

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#0d0d0d`
- Text: `#ffffff`
- Padding: 10px 18px
- Radius: 9999px (píldora completa) en chips, 12px en CTAs rectangulares
- Hover: fondo `#1a1a1a`
- Use: CTA principal, "Try ChatGPT", "Sign in"

**Secondary**
- Background: `#ffffff`
- Text: `#0d0d0d`
- Border: 1px solid `#e5e5e5`
- Padding: 10px 18px
- Radius: 12px
- Hover: fondo `#fafafa`, border `#d4d4d4`

**Brand Accent**
- Background: `#10a37f`
- Text: `#ffffff`
- Padding: 10px 18px
- Radius: 12px
- Hover: `#0a7a5e`
- Use: CTA de actualización destacado, ruta de éxito

### Cards
- Background: `#ffffff`
- Border: 1px solid `#ededed`
- Radius: 16px
- Padding: 24px–32px
- Shadow: ninguna por defecto; en hover `0 4px 16px rgba(13,13,13,0.06)`

### Inputs
- Background: `#ffffff`
- Border: 1px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 14px
- Focus: border `#10a37f`, ring `0 0 0 3px rgba(16,163,127,0.12)`

### Pills & Tags
- Background: `#f5f5f5`
- Text: `#3c3c3c`
- Padding: 4px 10px
- Radius: 9999px
- Font: 12px / 500

## 5. Spacing & Layout

- **Base unit**: 4px. Escala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Container**: max-width 1200px, gutter de 24px en móvil, 48px en escritorio.
- **Section rhythm**: 96–128px verticales entre secciones principales; 64px en móvil.
- **Grid**: 12 columnas en escritorio, 4 columnas en móvil, gap de 24px.

## 6. Motion

- **Duration**: 150–220ms para hover; 280–360ms para transiciones de diseño.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (salida suave) para entradas.
- **Restraint**: sin paralaje ni scroll-jacking. Solo fade y translate sutiles.

## 7. Usage Guardrails

- Preservar juntos la sobriedad editorial neutral, el radio suave y el uso escaso del acento; los acentos verdes por sí solos no crean una superficie al estilo de OpenAI.
- Usar los momentos de presentación al estilo Signifier solo para jerarquías editoriales o de anuncio, manteniendo los controles del producto en el sistema sans.
- Evitar la animación ornamental, las sombras pesadas y las tarjetas decorativas sobredimensionadas; el sistema debe transmitir calma, legibilidad y deliberación.
