# Inventory Backend Handoff

## Quick handoff

ถ้าทีม backend จะเริ่มทันที ให้ยึด 4 เรื่องนี้ก่อน:

1. ทำ lookup endpoints ให้ dropdown ทุก popup ใช้ข้อมูลจริงได้
2. ทำ `products + locations + stock_balances + stock_lots`
3. ทำ `stock_requests + stock_request_items + status transition`
4. ทำ response shape ที่ frontend อ่านสถานะ `loading / empty / error / success` ได้ตรงกันทุกหน้า

ถ้าทำครบ 4 ข้อนี้ หน้า prototype ปัจจุบันจะเริ่มผูก API ได้โดยไม่ต้องรื้อ flow

## Status

Frontend prototype พร้อมส่งต่อ backend แล้วในขอบเขตนี้:

- stock list + stock filters
- request / transfer flow with multiple line items
- inbound
- damage
- supplier
- branch
- warehouse
- dashboard + report aggregates

ขอบเขตนี้อ้างอิงจากหน้า:

- `inventory-dashboard.html`
- `inventory-stock.html`
- `inventory-requests.html`
- `inventory-inbound.html`
- `inventory-damages.html`
- `inventory-suppliers.html`
- `inventory-branches.html`
- `inventory-warehouses.html`
- `inventory-reports.html`

## P0 data model

### 1. `products`

ใช้เป็น master ของ dropdown และหน้า stock

Fields:

- `sku` string, primary key
- `name` string
- `category` enum: `food_beverage | cleaning | safety | office`
- `supplier_id` string, nullable
- `default_location_id` string, nullable
- `unit` enum: `piece | pack | ream | set | cloth`
- `minimum_stock` integer
- `expiry_tracking` boolean
- `note` text, nullable
- `active` boolean

### 2. `locations`

รวมทั้งสาขาและคลังไว้ใน table เดียว ลด code ฝั่ง backend

Fields:

- `id` string, primary key
- `type` enum: `branch | warehouse`
- `name` string
- `manager_name` string
- `status` string
- `parent_warehouse_id` string, nullable
- `capacity_text` string, nullable
- `stock_query_name` string
- `note` text, nullable

Rules:

- `branch` ใช้ `parent_warehouse_id`
- `warehouse` ใช้ `capacity_text`
- `stock_query_name` ใช้เป็นค่าที่ frontend ส่งต่อไปหน้าสต็อกใน flow ดูสต็อก

### 3. `stock_balances`

ยอดคงเหลือระดับ `sku x location`

Fields:

- `id` uuid/string
- `sku` string
- `location_id` string
- `total_qty` integer
- `usable_qty` integer
- `minimum_qty` integer
- `health` enum: `normal | low | expiry | hold`
- `note` text, nullable
- `updated_at` datetime

Unique key:

- `(sku, location_id)`

### 4. `stock_lots`

ต้องมี เพราะ UI มี lot, expiry, FEFO, usable qty

Fields:

- `id` uuid/string
- `sku` string
- `location_id` string
- `lot_code` string
- `expiry_date` date, nullable
- `qty_total` integer
- `qty_usable` integer
- `status` enum: `normal | hold | expired`

### 5. `stock_requests`

รองรับทั้งใบเบิกและใบโอน

Fields:

- `id` string, primary key
- `request_type` enum: `request | transfer`
- `destination_text` string
- `requester_name` string
- `status` enum: `pending_approval | approved | picking | in_transit | delivered | closed | cancelled`
- `status_note` text, nullable
- `request_note` text, nullable
- `created_at` datetime
- `updated_at` datetime

Status label mapping used by frontend:

- `pending_approval` -> `รออนุมัติ`
- `approved` -> `อนุมัติแล้ว`
- `picking` -> `รอจ่าย`
- `in_transit` -> `กำลังส่ง`
- `delivered` -> `รอยืนยันรับ`
- `closed` -> `ปิดงาน`
- `cancelled` -> `ยกเลิก`

### 6. `stock_request_items`

Fields:

- `id` uuid/string
- `request_id` string
- `sku` string
- `product_name` string
- `quantity` integer

### 7. `inbound_receipts`

UI ตอนนี้เป็น 1 แถวต่อ 1 SKU ต่อ 1 receipt

Fields:

- `id` string, primary key
- `supplier_id` string, nullable
- `supplier_name` string
- `sku` string
- `product_name` string
- `quantity` integer
- `lot_code` string, nullable
- `expiry_date` date, nullable
- `status` enum: `scheduled | receiving | awaiting_document | closed`
- `note` text, nullable
- `created_at` datetime

### 8. `damage_reports`

Fields:

- `id` string, primary key
- `sku` string
- `product_name` string
- `location_id` string, nullable
- `location_name` string
- `quantity` integer
- `reason` enum/string
- `status` enum: `pending_review | approved_writeoff | closed`
- `note` text, nullable
- `created_at` datetime

### 9. `suppliers`

Fields:

- `id` string, primary key
- `name` string
- `category` enum: `food_beverage | cleaning | safety | office`
- `contact` string
- `status` enum: `active | follow_up | suspended`
- `note` text, nullable

## Required lookups

ต้องมี endpoint กลุ่มนี้ก่อน เพราะหลาย popup ใช้ dropdown จากข้อมูลระบบ:

- `products`
- `suppliers`
- `locations`
- `location branches`
- `location warehouses`
- `requesters / managers`

แนะนำ endpoint:

- `GET /api/inventory/lookups/products`
- `GET /api/inventory/lookups/suppliers`
- `GET /api/inventory/lookups/locations`
- `GET /api/inventory/lookups/users`

Lookup response ควรคืนทั้ง `id` และ `label` ที่พร้อมใช้ใน select ทันที เช่น:

```json
{
  "items": [
    { "id": "PPE-004", "label": "PPE-004 · ถุงมือไนไตรล์ M", "name": "ถุงมือไนไตรล์ M" }
  ]
}
```

## Shared response contract

ใช้ shape กลางเดียวกันเพื่อลด logic หน้าเว็บ:

### Success

```json
{
  "data": {},
  "meta": {
    "requestId": "req_01",
    "updatedAt": "2026-07-17T10:30:00+07:00"
  }
}
```

### List

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "pageSize": 20
  }
}
```

### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อมูลไม่ถูกต้อง",
    "fieldErrors": {
      "items.0.quantity": "จำนวนต้องมากกว่า 0"
    }
  }
}
```

Rules:

- validation error ใช้ `400`
- not found ใช้ `404`
- conflict เช่น stock ไม่พอ ใช้ `409`
- unexpected server error ใช้ `500`
- mutation response ควรคืน record ล่าสุดกลับมาเสมอ ไม่ให้ frontend เดาสถานะเอง

## P0 endpoints

### Dashboard

- `GET /api/inventory/dashboard`
  - return KPI cards
  - return low stock alerts
  - return location stock overview
  - return request summary
  - return notification items for dashboard topbar

### Stock

- `GET /api/inventory/stocks`
  - query: `query`, `lot`, `expiry`, `warehouse`, `health`
- `GET /api/inventory/stocks/:sku`
- `PATCH /api/inventory/stocks/:sku`
- `POST /api/inventory/products`
- `PATCH /api/inventory/products/:sku`
- `DELETE /api/inventory/products/:sku`

Notes:

- `GET /stocks` ต้องรองรับการ drill-down จาก `?query=คลังกลาง` และ `?query=สาขาหาดใหญ่`
- response ควรคืน `location_name`, `warehouse_key`, `health_key` เพื่อให้ filter ไม่ต้องเดา

### Requests / transfers

- `GET /api/inventory/requests`
  - query: `query`, `status`
- `GET /api/inventory/requests/:id`
- `POST /api/inventory/requests`
- `PATCH /api/inventory/requests/:id`
- `PATCH /api/inventory/requests/:id/status`
- `DELETE /api/inventory/requests/:id`

Body for `POST /requests`:

```json
{
  "request_type": "request",
  "destination_text": "สาขาหาดใหญ่",
  "requester_name": "กมลชนก",
  "request_note": "ใช้สำหรับงานอบรมวันที่ 20 ก.ค.",
  "items": [
    { "sku": "PPE-004", "quantity": 4 },
    { "sku": "FNB-012", "quantity": 2 }
  ]
}
```

Body for `PATCH /requests/:id/status`:

```json
{
  "status": "picking",
  "status_note": "จ่ายบางส่วน 2 จาก 4 รายการ"
}
```

### Inbound

- `GET /api/inventory/inbounds`
- `GET /api/inventory/inbounds/:id`
- `POST /api/inventory/inbounds`
- `PATCH /api/inventory/inbounds/:id`
- `DELETE /api/inventory/inbounds/:id`

### Damage

- `GET /api/inventory/damages`
- `GET /api/inventory/damages/:id`
- `POST /api/inventory/damages`
- `PATCH /api/inventory/damages/:id`
- `DELETE /api/inventory/damages/:id`

### Suppliers

- `GET /api/inventory/suppliers`
- `GET /api/inventory/suppliers/:id`
- `POST /api/inventory/suppliers`
- `PATCH /api/inventory/suppliers/:id`
- `DELETE /api/inventory/suppliers/:id`

### Locations

- `GET /api/inventory/branches`
- `POST /api/inventory/branches`
- `PATCH /api/inventory/branches/:id`
- `DELETE /api/inventory/branches/:id`

- `GET /api/inventory/warehouses`
- `POST /api/inventory/warehouses`
- `PATCH /api/inventory/warehouses/:id`
- `DELETE /api/inventory/warehouses/:id`

### Reports

- `GET /api/inventory/reports/location-stock`
- `GET /api/inventory/reports/replenishment-alerts`
- `GET /api/inventory/reports/usage-summary`
- `GET /api/inventory/reports/stock-health`
- `POST /api/inventory/reports/export`

## UI state contract that backend must support

ส่วนนี้เติมจาก behavior จริงใน prototype เพื่อให้หน้าเว็บไม่ต้องตีความเอง

### Loading states

- ทุก list endpoint ต้องตอบได้เร็วพอสำหรับ first paint หรือมี pagination ชัดเจน
- ทุก mutation endpoint ควรตอบ body ของ record ล่าสุดกลับมา เพื่อปิด popup แล้วอัปเดตแถวได้ทันที
- export endpoint ควรรองรับ async job ถ้าไฟล์ใช้เวลาสร้างนาน

### Empty states

หน้าที่มี empty/filter empty อยู่แล้วใน prototype:

- requests
- stock
- inbound
- damages
- suppliers
- branches
- warehouses

Backend requirement:

- list endpoint ต้องคืน `data: []` ได้ปกติ ไม่ใช้ `404`
- ถ้าไม่มีข้อมูลจริง ให้ meta ยังครบ เช่น `total: 0`

### Error states

ต้องรองรับอย่างน้อย:

- สร้างใบเบิกแต่ไม่มี item
- quantity <= 0
- stock ไม่พอสำหรับเปลี่ยนสถานะไป `picking`
- lot ไม่มี / lot หมดอายุ / lot usable = 0
- duplicate SKU
- duplicate branch / warehouse / supplier code
- delete record ที่ถูกอ้างอิงอยู่

### Button / action states

Frontend มี action button เปลี่ยนตาม state อยู่แล้ว Backend ต้องคืน state ที่ชัดเจนพอให้ map ต่อได้:

- request: `pending_approval | approved | picking | in_transit | delivered | closed | cancelled`
- inbound: `scheduled | receiving | awaiting_document | closed`
- damage: `pending_review | approved_writeoff | closed`
- supplier: `active | follow_up | suspended`
- location branch: `active | paused`
- location warehouse: `active | maintenance`

หมายเหตุ:

- label ไทยใน UI ไม่ควรเป็น source of truth
- source of truth ควรเป็น enum อังกฤษ แล้วให้ frontend map label

## Frontend field mapping

### `inventory-requests.html`

Create/edit request fields:

- `data-request-create-destination` -> `destination_text`
- request item `sku` -> `items[].sku`
- request item `quantity` -> `items[].quantity`
- `data-request-create-note` -> `request_note`
- `data-request-status-field` -> `status`
- `data-pick-note` -> `status_note`
- `data-pick-next-status` -> next workflow state

Frontend expectation:

- create request ต้องคืน `id`, `status`, `items_count`
- update status ต้องคืน `status`, `status_note`, `updated_at`

### `inventory-stock.html`

Stock detail fields:

- `id` -> `sku`
- `name` -> `product_name`
- `location` -> `location_name` or `location_id`
- `quantity` -> `total_qty`
- `minimum` -> `minimum_qty`
- `status` -> `health`
- `note` -> `note`

Frontend expectation:

- stock detail response ควรมี lot list แยก ไม่ใช่ string เดียว
- list row ควรมีทั้ง `total_qty` และ `usable_qty`
- `warehouse_key` และ `health_key` ควรคืนจาก backend โดยตรง

Stock filters:

- `query`
- `lot`
- `expiry`
- `warehouse`
- `health`

### `inventory-inbound.html`

- `secondary` -> `supplier_name` or `supplier_id`
- `name` -> `sku/product`
- `quantity`
- `lot`
- `expiry`
- `status`
- `note`

Frontend expectation:

- ถ้าสถานะเป็น `closed` backend ต้องคืน lot ที่เพิ่งสร้างหรืออัปเดตกลับมา

### `inventory-damages.html`

- `name` -> `sku/product`
- `location`
- `quantity`
- `reason`
- `status`
- `note`

Frontend expectation:

- ถ้าเปลี่ยนเป็น write-off สำเร็จ ควรคืน stock impact summary ด้วย

### `inventory-suppliers.html`

- `id`
- `name`
- `category`
- `contact`
- `status`
- `note`

### `inventory-branches.html`

- `id`
- `name`
- `responsible`
- `warehouse`
- `status`
- `note`
- `stock_query_name`

Frontend expectation:

- ปุ่ม `ดูสต็อก` ใช้ `stock_query_name` หรือ query token จาก backend

### `inventory-warehouses.html`

- `id`
- `name`
- `responsible`
- `capacity`
- `status`
- `note`
- `stock_query_name`

Frontend expectation:

- ถ้าชื่อคลังถูกแก้ ระบบต้องยัง resolve drill-down ไปหน้าสต็อกได้

## Accessibility and validation contract

แม้ backend ไม่ render UI เอง แต่ต้องส่งข้อมูลในรูปที่ช่วยให้ form accessible ได้:

- field error ต้องอ้าง key เดิมของ form ได้ เช่น `name`, `quantity`, `items.0.sku`
- enum values ต้อง stable ไม่เปลี่ยน casing ไปมา
- empty success ต้องใช้ `[]` ไม่ใช่ `null`
- numeric fields ต้องคืนเป็น number จริง ไม่ใช่ formatted string
- dates ต้องคืน ISO date/date-time เสมอ

## Workflow rules backend must own

### Request flow

Allowed transitions:

- `pending_approval -> approved`
- `approved -> picking`
- `picking -> in_transit`
- `in_transit -> delivered`
- `delivered -> closed`
- `pending_approval -> cancelled`

Recommended hard stop:

- ห้าม `closed -> *`
- ห้าม `cancelled -> *`
- ห้ามข้ามจาก `pending_approval -> in_transit`
- ห้าม `picking` ถ้า usable stock ไม่พอ

Backend rules:

- request must have at least 1 item
- each item quantity must be `>= 1`
- `closed` request must be immutable except note/audit
- when moving to `picking` or later, backend should validate usable stock

### FEFO / lot usage

UI already expects FEFO behavior in text flow even if prototype is static.
Backend should allocate by earliest expiry first for lots with usable qty.

Minimum response on allocation:

```json
{
  "data": {
    "requestId": "REQ-260717-008",
    "pickedLots": [
      { "sku": "FNB-012", "lotCode": "B2406", "quantity": 2 }
    ]
  }
}
```

### Inbound close

When inbound status becomes `closed`:

- create or upsert lot
- increase stock balance
- recompute stock health

### Damage approve

When damage status becomes `approved_writeoff` or `closed`:

- deduct stock from usable or total according to business rule
- write movement log

## Known frontend assumptions to preserve

- request create currently defaults requester เป็น `กมลชนก` ถ้ายังไม่มี auth จริง
- branch / warehouse drill-down ใช้ query string ไปหน้า stock
- report tables ใช้ aggregate numbers ไม่ได้แก้แถว stock โดยตรง
- toast ใน prototype แปลว่า mutation สำเร็จทันที ดังนั้น backend response ไม่ควรเป็น delayed write แบบเงียบ

## Derived data backend should compute

Do not persist these as source of truth if avoidable:

- dashboard KPIs
- stock health summary
- low stock counts
- usable qty summary by location
- report rows

## Recommended implementation order

1. lookup endpoints
2. products + locations + stock balances + lots
3. requests + request items + status transitions
4. inbound posting into lots/balances
5. damage write-off
6. dashboard aggregates
7. reports/export

## Ready-to-build note

ถ้า backend ทำครบ P0 ตามไฟล์นี้ จะต่อ frontend prototype ปัจจุบันได้โดยไม่ต้องตีความ flow ใหม่อีกรอบ
