# Sistema de Diseño Inspirado en Discord

> Categoría: Productividad y SaaS
> Plataforma de voz y chat. Blurple profundo, superficies oscuras de base, momentos de acento lúdicos.

## 1. Tema Visual y Atmósfera

El producto de Discord está diseñado para las noches, las incursiones y las llamadas grupales, por lo que toda la interfaz es oscura de base. El lienzo predeterminado es el profundo `Background Primary` (`#313338` tema claro, `#1e1f22` tema oscuro), con columnas de chat superpuestas en tonos ligeramente más claros u oscuros para diferenciar canales, hilos y paneles laterales. El icónico **Blurple** (`#5865f2`) está reservado para el logotipo de la marca, los CTAs primarios, las menciones y el indicador de "tú" — usado con moderación para que resalte sobre los neutros apagados.

La tipografía usa **gg sans** (el reemplazo personalizado de Whitney de Discord) para el texto de la interfaz, con formas geométricas redondeadas que resultan accesibles sin perder legibilidad en los tamaños pequeños que exige un cliente de chat. Los encabezados aumentan de forma incremental; las filas del chat son compactas (4–8px entre grupos de mensajes) para que horas de historial resulten fáciles de escanear.

El lenguaje de formas es redondeado pero no globoso: radios de 8px en las tarjetas, 4px en los campos, píldoras completas en las insignias de estado y etiquetas. Los servidores son avatares cuadrados redondeados de 48px que se convierten en círculos al pasar el cursor — un pequeño detalle de movimiento que se ha convertido en parte de la identidad de la marca.

**Características Clave:**
- Superficies oscuras de base: `#1e1f22` / `#2b2d31` / `#313338` (profundidad en 3 niveles)
- Blurple `#5865f2` como único acento saturado en la superficie del chat
- gg sans (estilo Whitney) para todo el texto — amigable, geométrico y neutro
- Avatares de servidor cuadrados redondeados (radio 16px) que se convierten en círculos al pasar el cursor
- Espaciado compacto en las filas del chat, relleno generoso en los paneles laterales
- Puntos de estado: verde para conectado, amarillo para ausente, rojo para no molestar, gris para desconectado
- Divisores de 1px alineados al píxel en blanco apagado con baja opacidad

## 2. Paleta de Colores y Roles

### Primario
- **Blurple** (`#5865f2`): Primario de marca, CTA principal, resaltado de menciones.
- **Blurple Hover** (`#4752c4`): Estado hover/activo del blurple.
- **Blurple Soft** (`#7289da`): Blurple heredado, acento secundario en marketing.

### Superficie (Tema Oscuro — predeterminado)
- **Background Tertiary** (`#1e1f22`): Barra de servidores, fondo más profundo.
- **Background Secondary** (`#2b2d31`): Barra lateral de canales, barra lateral de ajustes.
- **Background Primary** (`#313338`): Superficie del chat, columna de mensajes.
- **Background Floating** (`#111214`): Popovers flotantes, tooltips, autocompletar.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Superposición hover en filas.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Fila activa.

### Superficie (Tema Claro)
- **Light Bg Primary** (`#ffffff`): Superficie del chat en tema claro.
- **Light Bg Secondary** (`#f2f3f5`): Barra lateral en tema claro.
- **Light Bg Tertiary** (`#e3e5e8`): Superficie clara más profunda.

### Texto
- **Header Primary** (`#f2f3f5`): Encabezados de canal, títulos de modal en tema oscuro.
- **Header Secondary** (`#b5bac1`): Encabezados apagados.
- **Text Normal** (`#dbdee1`): Texto de cuerpo en tema oscuro — ligeramente más frío que el blanco puro.
- **Text Muted** (`#949ba4`): Marcas de tiempo, nombres de servidor, metadatos secundarios.
- **Text Link** (`#00a8fc`): Hipervínculos en mensajes — azul cielo, diferenciado del blurple.
- **Channels Default** (`#80848e`): Nombre de canal inactivo en la barra lateral.

### Estado y Semántica
- **Status Online** (`#23a55a`): Punto de conectado, estados de éxito.
- **Status Idle** (`#f0b232`): Punto de ausente, alejado.
- **Status DND** (`#f23f43`): No molestar, también funciona como rojo destructivo.
- **Status Streaming** (`#593695`): Morado de "transmitiendo".
- **Status Offline** (`#80848e`): Gris de desconectado.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Suave tono blurple en filas con @mención.

### Borde y Divisor
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Divisor estándar en oscuro.
- **Border Subtle** (`#3f4147`): Divisor sólido para tarjetas.

## 3. Reglas Tipográficas

### Familia de Fuentes
- **Cuerpo / UI / Encabezados**: `gg sans`, con fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (heredado / Whitney)**: `Whitney`, con fallback: `gg sans`
- **Código / Mono**: `"gg mono"`, con fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de Línea | Espaciado de Letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero de marketing |
| Encabezado de Página | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Títulos de ajustes/perfil |
| Nombre de Canal | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, encabezado del canal |
| Cuerpo del Mensaje | gg sans | 16px (1rem) | 400 | 1.375 | normal | Texto estándar del chat |
| Nombre de Usuario | gg sans | 16px (1rem) | 500 | 1.25 | normal | Autor de un mensaje |
| Marca de Tiempo | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Hoy a las 4:32 PM" |
| Canal de Barra Lateral | gg sans | 16px (1rem) | 500 | 1.25 | normal | Filas de la lista de canales |
| Nombre del Servidor | gg sans | 16px (1rem) | 600 | 1.25 | normal | Encabezado del servidor |
| Leyenda / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Texto de estado, etiqueta editado |
| Código en Línea | gg mono | 0.875em | 400 | inherit | normal | `code` en línea |
| Bloque de Código | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Bloque ```con triple acento grave``` |

### Principios
- **Geometría amigable**: gg sans reemplaza a Whitney con terminales redondeados en a/g/s — la marca busca calidez sin sacrificar la legibilidad.
- **Contraste de peso sobre contraste de color**: la jerarquía proviene de los pasos de peso 400→500→600→700→800; la superficie permanece neutral.
- **Cuerpo de 16px**: los mensajes del chat no se reducen por debajo de 16px. La densidad proviene de la altura de línea (1.375), no del tamaño de fuente.

## 4. Estilos de Componentes

### Botones

**Primario**
- Fondo: `#5865f2`
- Texto: `#ffffff`
- Relleno: 8px 16px
- Radio: 4px
- Hover: `#4752c4`
- Uso: CTAs primarios, "Continuar", "Unirse al Servidor"

**Secundario**
- Fondo: `#4e5058`
- Texto: `#ffffff`
- Relleno: 8px 16px
- Radio: 4px
- Hover: `#6d6f78`

**Terciario / Sutil (estilo enlace)**
- Fondo: transparent
- Texto: `#dbdee1`
- Hover: texto subrayado, sin cambio de fondo

**Destructivo**
- Fondo: `#da373c`
- Texto: `#ffffff`
- Hover: `#a12d2f`

### Campos de Entrada
- Fondo: `#1e1f22`
- Texto: `#dbdee1`
- Borde: 1px solid `#1e1f22`
- Radio: 4px
- Relleno: 10px 12px
- Foco: borde `#5865f2`

### Avatares de Servidor
- Tamaño: 48×48px
- Radio: 16px (cuadrado redondeado) por defecto; transiciona a 50% en hover y activo.
- Estado activo: píldora blanca de 4px en el borde izquierdo de la columna de iconos.

### Puntos de Estado
- Tamaño: 10×10px
- Borde: 3px solid background-tertiary (crea el efecto de "muesca")
- Posición: esquina inferior derecha del avatar.

### Tarjetas / Embeds
- Fondo: `#2b2d31` (oscuro) o `#f2f3f5` (claro)
- Borde izquierdo: 4px solid color de acento del embed.
- Radio: 4px
- Relleno: 8px 16px

### Píldora de Mención
- Fondo: `rgba(88, 101, 242, 0.3)`
- Texto: `#c9cdfb`
- Relleno: 0 2px
- Radio: 3px

## 5. Espaciado y Maquetación

- **Unidad base**: 4px. Escala: 4, 8, 12, 16, 20, 24, 32, 40.
- **Barra de servidores**: 72px de ancho, fija.
- **Barra lateral de canales**: 240px de ancho.
- **Lista de miembros**: 240px de ancho en escritorio.
- **Columna de chat**: fluida, mínimo 380px.

## 6. Movimiento

- **Duración**: 200ms para hover; 350ms para la transformación de avatar a círculo; 80ms para el desvanecimiento del tooltip.
- **Aceleración**: `cubic-bezier(0.215, 0.61, 0.355, 1)` para la transformación del avatar (rápida al inicio, luego se asienta).
- **Pulso de notificación**: 1.4s ease-in-out infinite en el indicador de mención no leída.

## 7. Restricciones de Uso

- Mantén juntos la carcasa oscura, la densidad compacta y la jerarquía de acción en blurple; usar blurple en una maquetación de marketing con fondo claro rompe la sensación del producto Discord.
- Mantén las superficies con mucha navegación estructuradas alrededor de barras, barras laterales y columnas de chat en lugar de tarjetas decorativas aisladas.
- Usa el avatar cuadrado redondeado y el lenguaje de puntos de estado cuando representes personas, servidores o presencia activa.
