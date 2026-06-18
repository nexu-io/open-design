---
name: odoo-query
description: Query and execute operations on Odoo 19 via the Odi middleware.
---

# Odoo Skill

You can search, read, and write to Odoo. Always use `shell` with `curl`.

## Security (user messages)

Never tell the user about middleware, OpenClaw, agents, LLM models, servers, Docker, curl, endpoints, or internal architecture. Use AGENTS.md → Red Lines canned replies for meta questions.

## Reading data — use POST /query only

| User need | Action |
|-----------|--------|
| Any business read (KPI, detail, list, WH/OUT, tickets, invoices…) | **`POST /query`** with natural-language `question` |
| Dashboard executive view | `GET /dashboard/query` — see skill `dashboard-interpretation` |

The middleware discovers Odoo models and fields dynamically per linked user. **Do not** use `GET /search`, `/fields`, or `/models` — they require identity and must not be used as final answers.

### Detalle o consulta de negocio (usar siempre primero)

```bash
curl -s -X POST "http://localhost:8000/v1/tools/odoo/query" \
  -H "Content-Type: application/json" \
  -d '{"context":{"tenant_id":"odoo","channel":"telegram","user_id":"USER_ID","session_id":"chat"},"question":"detalle del pedido de venta S00007","intent":"kpi"}'
```

Ejemplos de `question` (GRG descubre modelos según permisos del usuario):

**Ventas:** `ventas del mes`, `detalle del pedido S00007`, `SO7`, `top 3 vendedores por monto y unidades`

**Compras:** `compras pendientes`, `detalle orden de compra P00011`, `compra po 11`

**Inventario:** `entregas pendientes`, `stock bajo`, `detalle de WH/OUT/00036`

**Contabilidad:** `cobranza vencida`, `facturas vencidas`, `cuentas por pagar vencidas`, `factura INV/2026/00004`, `cashflow del mes`

**Excel / export:** si piden planilla, `.xlsx` o “mandame el excel” → `POST /v1/tools/export/excel-and-send` (ver abajo). No digas que no podés generar archivos.

**Inventario / reabastecimiento:** `stock bajo`, `regla de reabastecimiento`, `orderpoint` → lectura con `/query`; alta con `odoo_model_execute` en `stock.warehouse.orderpoint`

**Manufactura:** `ordenes de produccion` (app Manufactura instalada)

**CRM:** `oportunidades crm`, `leads abiertos`

**RRHH:** `empleados activos` (app Empleados)

**Proyectos:** `tareas del proyecto`

**Flota:** `vehiculos de la flota` (app Flota instalada)

Si el módulo no está instalado, el middleware responde con mensaje claro (no inventes datos).

Respondé **una sola vez** con el resultado en español.

**Prohibido en Telegram:** "Voy a…", "Primero busco…", "Tiene ID X", "Recibo un callback…", stack, agentes, modelos, servidores, infraestructura, JSON, estados técnicos (`draft`, `user_id=false`). Trabajá en silencio; solo el resultado final.

## Efficiency (latency)

**Minimize tool calls.** Each extra `/query` adds ~5–15 seconds.

| Operation | Max calls per user turn |
|-----------|-------------------------|
| Read (KPI, detail, list) | **1** `POST /query` |
| Write | **1** `/query` + **1** `/write/plan` + **1** `/command` |
| Excel cashflow | **1** `excel-and-send` (no prior queries) |

Do **not** explore unrelated models after the target record is found (e.g. no pricelist/sale.order when updating `list_price`).

## Writing data (CREATE/UPDATE/DELETE)

CRITICAL — Use the **Governed Write Gateway** for mutations:

1. **One** `/query` to resolve target records if needed (product, partner, order)
2. **`POST /write/plan`** with natural-language `intent` + `context_data` from step 1
3. If `status=plan_ready`, call **`/command`** with returned `command_name` + `command_payload`
4. If `clarification_needed`, ask the user once or retry with richer `context_data`

```bash
curl -s -X POST "http://localhost:8000/v1/tools/odoo/write/plan" \
  -H "Content-Type: application/json" \
  -d '{"context":{"tenant_id":"odoo","channel":"telegram","user_id":"USER_ID"},"intent":"Agregale 5 unidades al producto","context_data":{"product_id":2,"product_name":"Escritorio"}}'
```

Then execute the plan:

```bash
curl -s -X POST "http://localhost:8000/v1/tools/odoo/command" \
  -H "Content-Type: application/json" \
  -d '{"context":{"tenant_id":"odoo","channel":"telegram","user_id":"USER_ID"},"command_name":"COMMAND_FROM_PLAN","payload":{...}}'
```

**Do not** hand-build `odoo_model_execute` when `/write/plan` covers the intent.

### GWG intent examples (Phase 2)

Pass `context_data` from `/query` when the plan needs record ids:

| User intent | context_data keys |
|-------------|-------------------|
| Agregar 5 unidades | `product_id`, `product_name` |
| Cambiar precio a 150000 | `product_id`, `product_name` |
| Confirmar pedido S00007 | `sale_order_id`, `order_name` |
| Crear proveedor "ACME" | `name`, optional address fields |
| Regla reabastecimiento min 10 | `product_id`, `product_min_qty`, optional `location_id` |
| Nota interna en el pedido | `res_model`, `res_id`, `body` |

GWG returns `command_name` such as `gwg_stock_inventory_adjust`, `create_supplier`, `confirm_sale_order`, or `odoo_model_execute`.

### Efficiency (writes)

| Operation | Max calls per user turn |
|-----------|-------------------------|
| Write with lookup | **1** `/query` + **1** `/write/plan` + **1** `/command` |
| Write with known ids | **1** `/write/plan` + **1** `/command` |

## Writing data — legacy notes

CRITICAL — Before invoking a write command:
1. **One** `/query` to resolve the target record (partner, product, order) if needed
2. Check the action is possible (required fields, record exists)
3. If something is missing, ask the user once — do not loop queries
4. When the payload is complete, call `/v1/tools/odoo/command` immediately

### Update product sale price (`list_price`)

1. `/query` — find product by name or internal reference
2. `/command` — `odoo_model_execute` on `product.product` (or `product.template`), method `write`, `args`: `[[product_id], {"list_price": AMOUNT}]`, include `"name"` in payload for the approval message
3. Do **not** use `product.pricelist` / `pricelist.item` unless the user explicitly asks for a **price list** rule

On **Telegram**, do NOT ask "¿Confirmás esta acción?" before the command. The middleware returns inline **Confirmar / Cancelar** buttons — that is the only confirmation step. Send `message` + `reply_markup` in a single message without extra narration.

To execute a command:

```bash
curl -s -X POST "http://localhost:8000/v1/tools/odoo/command" \
  -H "Content-Type: application/json" \
  -d '{"context":{"tenant_id":"odoo","session_id":"chat","channel":"telegram","user_id":"662029280","trace_id":"req-1"},"command_name":"COMMAND_NAME","payload":{...}}'
```

Available commands (with approval flow):
- `confirm_sale_order` — confirm order. payload: `{"order_id":123}`
- `create_invoice` — create invoice from order. payload: `{"order_id":123}`
- `create_supplier` — create supplier contact. payload: `{"name":"Proveedor SA",...}`
- `create_customer` — create customer/client contact. payload: `{"name":"Cliente SA",...}`
- `odoo_model_execute` — governed generic Odoo method execution. payload: `{"model":"res.partner","method":"create","args":[{"name":"Proveedor SA"}],"kwargs":{},"reason":"Alta solicitada"}`
- `create_activity` — create follow-up activity. payload: `{"res_model":"...","res_id":1,...}`
- `post_internal_note` — post internal note. payload: `{"res_model":"...","res_id":1,"body":"..."}`

For operations not covered by a named command, use `odoo_model_execute` only after prerequisite reads. On Telegram, confirm via inline buttons — not verbal yes/no.

### Excel export (Telegram)

When the user asks for Excel, spreadsheet, cashflow file, or "mandame el archivo":

```bash
curl -s -X POST "http://localhost:8000/v1/tools/export/excel-and-send" \
  -H "Content-Type: application/json" \
  -d '{"context":{"tenant_id":"odoo","channel":"telegram","user_id":"662029280"},"report":"cashflow","period":"2026-05","caption":"Cashflow mayo 2026"}'
```

- `report=cashflow` — middleware builds receivables/payables/purchase sheets for the month.
- `report=custom` — pass `filename`, optional `caption`, and `sheets` with `headers` + `rows` after reading Odoo.
- If `telegram_sent: true`, reply only `NO_REPLY` (silent; buttons already delivered).

### Replenishment rules (orderpoint)

Example flow for "regla de reabastecimiento FURN_8888 cantidad 10":

1. Query product: `question` → producto FURN_8888 / referencia interna.
2. Query default stock location or warehouse if needed.
3. Command:

```bash
curl -s -X POST "http://localhost:8000/v1/tools/odoo/command" \
  -H "Content-Type: application/json" \
  -d '{"context":{"tenant_id":"odoo","channel":"telegram","user_id":"662029280"},"command_name":"odoo_model_execute","payload":{"model":"stock.warehouse.orderpoint","method":"create","args":[{"product_id":PRODUCT_ID,"product_min_qty":10,"location_id":LOCATION_ID}],"reason":"Regla reabastecimiento FURN_8888"}}'
```

Supplier / contact creation rules:
- Verify the contact does not already exist before invoking the command.
- Minimum payload is `name`; optional allowlisted fields: `company_type`, `email`, `phone`, `mobile`, `vat`, `street`, `street2`, `city`, `zip`, `country_id`, `state_id`, `website`, `ref`, `reason`.
- **Address**: if the user mentions a street or city, you MUST include **province (`state`) and country (`country`)** — as separate fields or one `address` string: `"street, city, state, country"`.
- You may pass `state: "Mendoza"` and `country: "Argentina"` (text); middleware resolves them to Odoo IDs before showing Confirm/Cancel buttons.
- If middleware returns `clarification_needed`, ask the user for the missing fields — **do not** call `/command` again until complete.
- The approval message shows the full address; the user must be able to verify province and country before confirming.
- Prefer `create_customer` when the user says **cliente**; `create_supplier` when they say **proveedor**.
- Prefer named commands over `odoo_model_execute` when they cover the operation.

## Rules

1. **Reads**: solo `POST /query`. No uses `GET /search`, `/fields`, `/models` como respuesta final (410 sin identidad).
2. Si recibís `clarification_needed`, reformulá con referencia concreta (`P00011`, `WH/OUT/00036`) o KPI (`ventas del mes`).
3. On Telegram writes: one confirmation only — middleware inline buttons. Never verbal "¿Confirmás?" before the command.
4. Never guess — if data is missing, ask one concrete question or retry `/query` with a clearer `question`.
5. Format results in natural Spanish. Never show raw JSON or internal troubleshooting.
6. All actions are audited server-side.

## Telegram output format

When answering with Odoo data in Telegram:

0. If the Telegram bridge supports parse_mode, prefer `HTML` for business messages.
1. NEVER use ASCII tables.
2. NEVER wrap business data in code blocks or triple backticks.
3. NEVER use Markdown tables.
4. Convert records into short mobile-friendly lists.
5. Show at most 8 records per message; if there are more, say "Mostrando 8 de N" and offer to continue.
6. When `/query` returns `telegram_web_app`, send **one** Telegram message with `reply_markup` from that field (web_app button "Ver gráfico 📊"). Do not skip the button.

Correct list format:

<b>Proveedores dados de alta hoy (15/05)</b>
- #17 Proveedor de prueba 1 — 15:42

Total: 1 proveedor nuevo.
Nota: "Proveedor del exterior" (#14) ya existia.

Forbidden format:

```text
| ID | Nombre | Hora |
| -- | ------ | ---- |
```
