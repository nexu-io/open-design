# Douvery Design System

Paquete reutilizable para crear interfaces de comercio claras, confiables y tranquilas.

## Fuente y alcance

- Fuente pública: https://douvery.com/
- Registro: `user:douvery-com`
- Paleta principal: `#1F6266` Quiet Teal para acciones y `#006366` Operational Teal para estructura.
- Estados: éxito `#16A34A`, advertencia `#F59E0B`, error `#EF4444`, información `#3B82F6`, inactivo `#98A2B3`.

## Archivos clave

- `brand.json`: contrato editable y seed persistente.
- `brand-spec.md`: tokens OKLCH, tipografía y postura resumida.
- `DESIGN.md`: contrato visual completo.
- `BRAND.md`: voz, imaginería y reglas de contenido.
- `SKILL.md`: guía operativa para nuevos diseños.
- `system/kit.html`: showcase de componentes, estados y densidad.
- `system/kit.dark.html`: variante oscura.
- `system/artifacts/`: ejemplos de landing, deck, poster, email, newsletter y formulario.

## Regeneración

Editar `brand.json` y ejecutar `od brand preview douvery-c9ffd9` para revisar. Ejecutar `od brand finalize douvery-c9ffd9` solo cuando los valores estén validados; genera tokens, kits y artefactos en el mismo registro, nunca un duplicado.

## Reglas rápidas

- Una acción principal por sección.
- No usar emojis en UI ni copy de marca.
- No usar azul como baño visual; reservar `#0567FF` para señales puntuales.
- Combinar color con texto, icono o forma para cada estado.
- Mantener radio 8px, borde 1px y escala de 8px.
