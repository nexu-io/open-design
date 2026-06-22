# Sistema de diseño inspirado en Airtable

> Category: Diseño y Creatividad
> Híbrido de hoja de cálculo y base de datos. Estética de datos estructurados, colorida y amigable.

## 1. Tema visual y atmósfera

El sitio web de Airtable es una plataforma limpia y adecuada para empresas que transmite "simplicidad sofisticada" mediante un lienzo blanco con texto azul marino profundo (`#181d26`) y Airtable Blue (`#1b61c9`) como acento interactivo principal. La familia tipográfica Haas (variantes display y text) crea un sistema tipográfico de precisión suiza con espaciado de letras positivo en todo el sitio.

**Características clave:**
- Lienzo blanco con texto azul marino profundo (`#181d26`)
- Airtable Blue (`#1b61c9`) como color principal para CTA y enlaces
- Sistema de doble fuente Haas + Haas Groot Disp
- Espaciado positivo de letras en el texto del cuerpo (0.08px–0.28px)
- Botones con radio de 12px, tarjetas de 16px–32px
- Sombra multicapa con tono azul: `rgba(45,127,249,0.28) 0px 1px 3px`
- Tokens de tema semánticos: nomenclatura de variables CSS `--theme_*`

## 2. Paleta de colores y roles

### Primario
- **Azul marino profundo** (`#181d26`): Texto principal
- **Airtable Blue** (`#1b61c9`): Botones CTA, enlaces
- **Blanco** (`#ffffff`): Superficie principal
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semántico
- **Verde éxito** (`#006400`): `--theme_success-text`
- **Texto débil** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Secundario activo** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Neutral
- **Gris oscuro** (`#333333`): Texto secundario
- **Azul medio** (`#254fad`): Variante de azul para enlaces/acento
- **Borde** (`#e0e2e6`): Bordes de tarjeta
- **Superficie clara** (`#f8fafc`): Superficie sutil

### Sombras
- **Con tono azul** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Suave** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Reglas tipográficas

### Familias tipográficas
- **Principal**: `Haas`, respaldos: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, respaldo: `Haas`

### Jerarquía

| Rol | Fuente | Tamaño | Peso | Altura de línea | Espaciado |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Negrita | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Encabezado de sección | Haas | 40px | 400 | 1.25 | normal |
| Subtítulo | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Título de tarjeta | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Característica | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Cuerpo | Haas | 18px | 400 | 1.35 | 0.18px |
| Cuerpo Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Botón | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Pie de foto | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Estilos de componentes

### Botones
- **Azul principal**: `#1b61c9`, texto blanco, relleno 16px 24px, radio 12px
- **Blanco**: fondo blanco, texto `#181d26`, radio 12px, borde blanco 1px
- **Consentimiento de cookies**: fondo `#1b61c9`, radio 2px (agudo)

### Tarjetas: `1px solid #e0e2e6`, radio 16px–24px
### Entradas: Estilo Haas estándar

## 5. Diseño
- Espaciado: 1–48px (base 8px)
- Radio: 2px (pequeño), 12px (botones), 16px (tarjetas), 24px (secciones), 32px (grande), 50% (círculos)

## 6. Profundidad
- Sistema de sombra multicapa con tono azul
- Ambiente suave: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Qué hacer y qué no hacer
### Hacer: Usar Airtable Blue para CTA, Haas con tracking positivo, botones de radio 12px
### No hacer: Omitir el espaciado positivo de letras, usar sombras pesadas

## 8. Comportamiento responsive
Puntos de quiebre: 425–1664px (23 puntos de quiebre)

## 9. Guía de prompts para Agent
- Texto: Azul marino profundo (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Fondo: Blanco (`#ffffff`)
- Borde: `#e0e2e6`
