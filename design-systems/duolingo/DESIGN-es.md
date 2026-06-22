# Sistema de diseño inspirado en Duolingo

> Category: Productividad y SaaS
> Plataforma de aprendizaje de idiomas. Verde búho brillante, sombras gruesas, alegría gamificada.

## 1. Tema visual y atmósfera

Duolingo es la gamificación expresada como lenguaje visual. La interfaz es descaradamente brillante, con el **verde búho** (`#58cc02`) como color primario de marca y una gruesa sombra de 4px en la parte inferior de cada elemento interactivo que se lee como un botón 3D esperando ser presionado. La página es blanca (`#ffffff`) con bordes gruesos de 2–3px en gris oscuro (`#e5e5e5`), y el sistema completo se lee como una aplicación iOS de 2015 renacida con mejor jerarquía.

La tipografía usa **Feather Bold** (una sans-serif redondeada personalizada) para el chrome y **Mona Sans** (o Inter) para el cuerpo del texto. Los tamaños de visualización son grandes y seguros — Duolingo nunca susurra. Los encabezados a menudo llevan el trazo subrayado verde o se asientan sobre una pastilla verde, y la mascota Duo (un búho verde) aparece como un personaje de ilustración activo, no como un logotipo estático.

El lenguaje de formas es amigable: radios de 16–20px en tarjetas, 12px en botones, 9999px en chips y barras de progreso. La iconografía es rellena, redondeada y codificada por color según la habilidad — cada superficie de lección tiene un par de colores identificable al instante.

**Características clave:**
- Verde búho (`#58cc02`) como color de marca dominante, usado en más del 30% de la superficie
- Gruesa sombra inferior de 4px en cada botón (la affordance de "presión táctil")
- Bordes sólidos de 2–3px, nunca líneas finas
- Feather Bold (display redondeado) + Mona Sans (cuerpo)
- Texto grande y seguro — los tamaños de display comienzan en 48px y suben
- Mascota-personaje: Duo el búho aparece en el onboarding, errores, rachas
- Naranja de racha (`#ff9600`) y rosa gema (`#ce82ff`) como colores de marca secundarios

## 2. Paleta de colores y roles

### Primario
- **Verde búho** (`#58cc02`): Primario de marca, CTA principal, respuesta correcta.
- **Verde búho profundo** (`#58a700`): Color de presión/sombra para botones verdes.
- **Verde búho claro** (`#89e219`): Hover, rellenos suaves.
- **Verde búho pálido** (`#dbf8c5`): Superficie suave, banner de éxito.

### Acentos secundarios
- **Naranja de racha** (`#ff9600`): Contador de racha, icono de fuego, energía premium.
- **Naranja de racha profundo** (`#cc7a00`): Naranja presionado.
- **Rosa gema** (`#ce82ff`): Moneda gema, Super Duolingo.
- **Azul anguila** (`#1cb0f6`): Botón de pista, enlace informativo.
- **Rojo cardenal** (`#ff4b4b`): Respuesta incorrecta, vida perdida.
- **Amarillo abeja** (`#ffc800`): Insignia pro, logro.

### Superficie
- **Nieve** (`#ffffff`): Fondo principal.
- **Anguila** (`#f7f7f7`): Separación de sección, superficie secundaria.
- **Cisne** (`#e5e5e5`): Fondo desactivado, bloque incrustado.
- **Lobo** (`#777777`): Divisor oscuro, texto secundario.

### Tinta y texto
- **Negro anguila** (`#3c3c3c`): Texto principal.
- **Lobo** (`#777777`): Texto secundario, pies de foto.
- **Liebre** (`#afafaf`): Desactivado, marcador de posición.

### Borde
- **Cisne** (`#e5e5e5`): Borde estándar de 2px.
- **Liebre** (`#afafaf`): Borde enfatizado al pasar el cursor.

## 3. Reglas tipográficas

### Familia tipográfica
- **Display / UI / Encabezados**: `Feather Bold`, con respaldo: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Cuerpo / Texto largo**: `Mona Sans`, con respaldo: `'Helvetica Neue', system-ui, sans-serif`
- **Código (raro, escuelas/admin)**: `JetBrains Mono`, con respaldo: `ui-monospace, Menlo, monospace`

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de línea | Espaciado | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Héroe de onboarding |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Título de página |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Encabezado de sección |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Título de tarjeta, fila de lección |
| Cuerpo grande | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Consigna de lección, instrucción |
| Cuerpo | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Prosa estándar |
| Pie de foto | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Contador XP, metadatos |
| Botón | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Etiqueta estándar de botón |
| Racha | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Número de racha, sobre la llama |

### Principios
- **800 es el predeterminado**: Feather Bold funciona a 800 en encabezados y botones. 700 se ve débil en este sistema.
- **Texto grande**: los tamaños de encabezado son 25–40% más grandes que las marcas de productos típicas — la confianza como identidad.
- **Letras redondeadas**: cada glifo tiene terminaciones suaves; los serif afilados romperían el contrato de amabilidad.

## 4. Estilos de componentes

### Botones

**Primario (Verde búho)**
- Fondo: `#58cc02`
- Texto: `#ffffff`
- Relleno: 14px 24px
- Radio: 16px
- Border-bottom: 4px solid `#58a700` (la sombra gruesa)
- Hover: fondo `#89e219`
- Activo: translate-y 4px, border-bottom 0 (el botón se "presiona")
- Uso: "Continuar", "Comprobar", CTA principal.

**Secundario (Blanco con sombra inferior)**
- Fondo: `#ffffff`
- Texto: `#777777`
- Borde: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radio: 16px
- Relleno: 14px 24px
- Hover: texto `#3c3c3c`, borde `#afafaf`

**Naranja de racha**
- Fondo: `#ff9600`
- Texto: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Uso: objetivo de racha, "Iniciar racha"

**Error (Rojo cardenal)**
- Fondo: `#ff4b4b`
- Texto: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Uso: retroalimentación de respuesta incorrecta.

### Tarjetas / Mosaicos de lección
- Fondo: `#ffffff`
- Borde: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radio: 16px
- Relleno: 16px
- Hover: elevar 2px, sombra `0 4px 0 #d7d7d7`

### Nodo del árbol de habilidades (Burbuja de lección)
- Tamaño: 80×72px
- Fondo: tintado con color de habilidad (verde para activo, gris para bloqueado)
- Border-bottom: 6px solid variante más oscura
- Radio: 50% (circular)
- Activo: pulsa 1.0 → 1.05 cada 1.6s

### Entradas
- Fondo: `#ffffff`
- Borde: 2px solid `#e5e5e5`
- Radio: 12px
- Relleno: 12px 16px
- Foco: borde `#1cb0f6` (azul anguila), anillo `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Barra de progreso
- Pista: `#e5e5e5`
- Relleno: `#58cc02` (o `#ff9600` para racha)
- Radio: 9999px
- Altura: 16px
- Relleno animado: 320ms ease-out al incrementar.

## 5. Espaciado y diseño

- **Unidad base**: 4px. Escala: 4, 8, 12, 16, 24, 32, 48, 64.
- **Contenedor**: máx. 1080px, canaleta de 24px.
- **Columna del árbol de lecciones**: 320px de ancho; centrada en escritorio.

## 6. Movimiento

- **Duración**: 180ms para presionar botón; 320ms para desbloqueo de nodo de habilidad; 1.6s para pulso de nodo activo.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, ligero rebase) para desbloqueos.
- **Mascota**: Duo parpadea cada 4–6s, salta en hitos de racha (480ms ease-out resorte).

## 7. Directrices de uso

- Mantenga juntos el verde búho de alta saturación, las gruesas sombras inferiores y la geometría redondeada de las lecciones; los botones verdes planos solos no se leen como Duolingo.
- Reserve el texto en negrita de gran tamaño para los momentos de lección, racha y progreso donde el producto necesita aliento o retroalimentación.
- Use el movimiento lúdico con moderación alrededor de los cambios de estado de progreso, evitando animaciones genéricas de rebote en cada control.
