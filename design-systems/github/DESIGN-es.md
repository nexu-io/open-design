# Sistema de Diseño Inspirado en GitHub

> Category: Herramientas para Desarrolladores
> Plataforma orientada al código. Densidad funcional, precisión azul sobre blanco, fundamentos Primer.

## 1. Tema Visual y Atmósfera

La superficie de GitHub es ingenieril, no decorativa. Cada píxel proclama una postura: esta es una herramienta para personas que se preocupan por los diffs, las builds y los pull requests. El fondo de página es un limpio `#ffffff` (claro) o `#0d1117` (oscuro), con el contenido dispuesto en paneles rectangulares densos separados por bordes de un solo píxel en lugar de espacio negativo. La densidad de información es la marca — filas de listas, líneas de código, cabeceras de repositorios y tarjetas de notificaciones están todas muy juntas para que un usuario avanzado pueda recorrer cien elementos sin desplazarse.

Los acentos característicos son el **azul Primer** (`#0969da`) para los enlaces y las acciones primarias, y el **verde GitHub** (`#1a7f37`) para los estados de fusión, el éxito y el propio botón de merge. Ambos se perciben ligeramente apagados en comparación con los azules y verdes de los productos de consumo — saturados lo suficiente para leerse sobre el denso texto gris, pero contenidos lo suficiente para desaparecer en el fondo cuando varios aparecen en una misma ventana gráfica.

La tipografía usa la pila **system-ui** en todo el producto para que el texto se renderice con nitidez en cualquier sistema operativo, combinada con **SFMono / Menlo / Consolas** para el código. No hay fuente de visualización editorial; la voz de GitHub es la voz del sistema en el que ya te encuentras.

**Características Clave:**
- Lienzo blanco puro (`#ffffff`) o negro azulado oscuro (`#0d1117`) — sin calidez, sin tinte
- Bordes grises de un píxel (`#d0d7de`) definen cada panel y sección
- Azul Primer (`#0969da`) para enlaces/acciones primarias; verde GitHub (`#1a7f37`) para éxito/merge
- system-ui para prosa; SFMono para código — sin tipografía personalizada
- Filas de lista densas con relleno mínimo; el espacio en blanco es escaso
- Iconografía Octicon a 16px / 24px — trazo único, geométrica, coherente
- Insignias de estado en forma de píldora con semántica de color sólida

## 2. Paleta de Colores y Roles

### Principal
- **Canvas Default** (`#ffffff`): Fondo principal de página, tema claro.
- **Canvas Subtle** (`#f6f8fa`): Superficie secundaria, barra lateral, fondo de entrada, franja de cabecera.
- **Canvas Inset** (`#eaeef2`): Fondo de bloque de código, superficie muy hundida.
- **Fg Default** (`#1f2328`): Texto principal, titulares, tinta.
- **Fg Muted** (`#656d76`): Texto secundario, leyendas, rutas de archivos.

### Acento de Marca
- **Primer Blue** (`#0969da`): Enlaces, CTAs primarios, base del anillo de enfoque — el color interactivo universal.
- **Primer Blue Hover** (`#0550ae`): Estado hover/presionado para el azul primario.
- **Accent Subtle** (`#ddf4ff`): Superficie azul suave para avisos, banners informativos.

### Semántico
- **Success / Merge Green** (`#1a7f37`): PRs fusionados, insignias de éxito, botón de merge.
- **Success Subtle** (`#dafbe1`): Tinte de superficie de éxito.
- **Open Green** (`#1a7f37`): Estado "Abierto" de issue/PR.
- **Closed / Danger Red** (`#cf222e`): PRs cerrados, acción destructiva, error de validación.
- **Danger Subtle** (`#ffebe9`): Superficie de banner de error.
- **Attention / Warning Yellow** (`#9a6700`): Texto de advertencia sobre superficie ámbar.
- **Attention Subtle** (`#fff8c5`): Superficie de banner de advertencia.
- **Done Purple** (`#8250df`): Fusionado y archivado, estado "hecho", insignia premium.
- **Sponsor Pink** (`#bf3989`): Corazón de patrocinadores, marca de GitHub Sponsors.

### Borde y Divisor
- **Border Default** (`#d0d7de`): Borde estándar de un píxel, contorno de panel.
- **Border Muted** (`#d8dee4`): Divisores internos dentro de un panel.
- **Border Subtle** (`#eaeef2`): Divisores tenues de filas de tabla.

### Tema Oscuro
- **Dark Canvas** (`#0d1117`): Fondo de página oscuro.
- **Dark Surface** (`#161b22`): Barra lateral, cabecera, superficie secundaria.
- **Dark Border** (`#30363d`): Borde estándar en modo oscuro.
- **Dark Fg** (`#e6edf3`): Texto principal sobre fondo oscuro.

## 3. Reglas Tipográficas

### Familia de Fuentes
- **Cuerpo / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Código / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de línea | Espaciado de letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Cabecera de repositorio, hero de marketing |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Encabezado de página |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Encabezado de sección |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Subsección, cabecera de panel |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Tamaño de texto por defecto — no 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Leyendas, metadatos de archivos |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Bloques de código, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Fragmentos de `code` en línea |

### Principios
- **Cuerpo a 14px, no 16px**: La densidad de prosa de GitHub es su identidad. El producto se lee a 14px para encajar más filas en una ventana gráfica.
- **Peso binario**: 400 para todo por defecto; 600 para titulares y énfasis. Sin 500, sin 700.
- **Fuentes del sistema siempre**: nunca cargar una webfont para el cromo — el texto debe renderizarse al instante en conexiones lentas.

## 4. Estilos de Componentes

### Botones

**Primario (Verde)**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- Uso: "Crear repositorio", "Fusionar pull request"

**Por Defecto**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`, border `#d0d7de`

**Contorno (Estilo Enlace Azul)**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`, text `#ffffff`

**Peligro**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`, text `#ffffff`, border `#a40e26`

### Tarjetas / Cajas
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (cabecera) + 16px (cuerpo)
- La cabecera tiene una franja `#f6f8fa` con borde inferior.

### Entradas
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: border `#0969da`, ring `0 0 0 3px rgba(9,105,218,0.3)`

### Píldoras de Estado (Issue / PR)
- **Abierto**: background `#1a7f37`, texto blanco, padding 4px 10px, radius 9999px.
- **Cerrado**: background `#cf222e`, texto blanco.
- **Fusionado**: background `#8250df`, texto blanco.
- **Borrador**: background `#6e7781`, texto blanco.

### Etiquetas (Tags en Issues/PRs)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- El fondo y el texto son programáticos (color de etiqueta → texto calculado para contraste).

## 5. Espaciado y Maquetación

- **Unidad base**: 4px. Escala de espaciado: 4, 8, 12, 16, 24, 32, 40, 48.
- **Ancho máximo de página**: 1280px (`Container-xl`).
- **Barra lateral**: 296px en escritorio, se colapsa por debajo de 1012px.
- **Relleno de fila**: 16px horizontal, 12px vertical (las listas son densas por diseño).

## 6. Movimiento

- **Duración**: 80ms para hover; 200ms para la apertura de menús/popovers.
- **Easing**: `ease-out` para aperturas, `ease-in` para cierres.
- **Evitado**: animación de carga de página, parallax, micro-interacciones persistentes. Las cosas aparecen; no actúan.

## 7. Restricciones de Uso

- Mantén juntas las listas densas, los cuadros con bordes y la tipografía del sistema; los botones verdes aislados no son suficientes para crear una superficie de producto similar a GitHub.
- Usa el verde para las acciones constructivas del repositorio, el azul para los enlaces y el enfoque, y el rojo/morado/gris únicamente para los estados de issues, PRs y flujos de trabajo.
- Prefiere el cromo discreto, los bordes explícitos y el espaciado compacto frente a sombras decorativas o tarjetas de gran tamaño estilo marketing.
