# 驾驶员配送管理系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成覆盖角色化微信小程序、管理员电脑后台和企业微信群通知的双仓配送管理系统。

**Architecture:** 采用 TypeScript 模块化单体。NestJS API 负责身份、权限、主数据、计划、签到、定位和报表；独立 worker 使用 PostgreSQL 任务表、行锁和 Outbox 负责定位状态推进、定时通知和重试。PostgreSQL + PostGIS 保存业务数据和定位事件，Vue 3 管理后台和一个按登录角色显示不同页面的原生微信小程序通过共享契约包访问 API。

**Tech Stack:** Node.js Active LTS（启动时固定到 `.nvmrc`）、pnpm、TypeScript、NestJS、Prisma + SQL migrations、PostgreSQL/PostGIS、Vue 3/Vite/Pinia/Element Plus、原生微信小程序 TypeScript、Vitest、Supertest、Playwright、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-10-29-driver-delivery-system-design.md`

## Global Constraints

- 所有业务日期和定时任务使用 `Asia/Shanghai`；不得使用服务器本地时区推断签到或通知日期。
- 当前仓库固定为 `cq`（重庆仓）和 `east`（华东仓）；所有读写 API 都必须在服务端计算仓库权限，不能信任前端传入的仓库 ID。
- 仓库管理员只能写入绑定仓库；可以跨仓只读查看配送进度；超级管理员管理管理员账号和绑定关系。
- 司机每日签到一次；次日 `00:01` 起补签标记为逾期；签到前不启动本次配送定位。
- 门店围栏半径固定为 200 米；连续离开 3 分钟才产生离店和送达；定位未更新不能推断未送达。
- 计划导入必须经过上传、预览、校验、人工确认和结果记录；重复上传不得静默覆盖已有签到或送达事件。
- 已开始的配送使用计划和门店坐标快照；后续编辑只影响尚未开始的配送。
- 所有 API 路径统一以 `/v1` 为前缀；契约变更必须同步生成并检查三个客户端使用的类型。
- 后台定位失败时显示“定位未更新”，提示检查授权和系统设置，不自动判定送达或未送达。
- 送达纠正必须记录原因、操作者、修改前后值和时间；不得删除审计记录。
- 04:00 只检查早餐店，07:00 检查全部计划门店；同一条企业微信群消息按仓库分段且具备幂等和重试。
- 驾驶员姓名、手机号、位置和配送记录属于敏感业务数据；日志中不得输出完整手机号、定位坐标或认证凭证。

## Review Focus

- 后台定位在切后台、锁屏、拒绝授权、断网和恢复网络后的行为；必须显示可解释的状态，不能把缺失位置当作未送达。
- 00:00/00:01 跨日签到边界；测试必须覆盖前一天 23:59:59、当天 00:00:00、00:00:59 和 00:01:00。
- 同一司机多线路、相邻门店和 GPS 漂移；围栏状态必须确定性推进且不因重复/乱序定位事件提前送达。
- 同仓重复导入、计划版本和已送达记录；历史报表必须引用当时的计划/坐标快照。
- 跨仓读写权限、管理员切换仓库和超级管理员账号操作；前端隐藏控件不能替代服务端授权。

## Repository Layout

```text
apps/
  api/                    # NestJS HTTP API
  worker/                 # PostgreSQL worker、围栏推进、Outbox、定时推送
  admin-web/              # Vue 3 管理后台
  miniprogram/            # 微信小程序，登录后按角色展示驾驶员/管理员页面
packages/
  contracts/              # Zod/OpenAPI DTO、枚举、错误码
  domain/                 # 纯业务状态机、策略和类型
  config/                 # 环境变量解析与运行时配置
  test-fixtures/          # Excel、定位轨迹和权限测试数据
infra/
  docker-compose.yml      # 本地 PostgreSQL/PostGIS、MinIO
docs/
  decisions/              # ADR 和已确认业务规则
  testing/                # 真机矩阵、UAT 用例和发布检查表
```

## Dependency Order

```text
Task 0 -> Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5
Task 5 -> Task 6 -> Task 7 -> Task 8
Task 6 -> Task 9
Task 7/8/9 -> Task 10
Task 7/8/9/10 -> Task 11 -> Task 12
```

### Task 0: 锁定业务规则并完成后台定位 Spike

**Files:**
- Create: `docs/decisions/ADR-001-technology.md`
- Create: `docs/decisions/ADR-002-excel-template-and-versioning.md`
- Create: `docs/decisions/ADR-003-location-degradation-and-geofence.md`
- Create: `docs/decisions/ADR-004-retention-and-audit.md`
- Create: `docs/testing/location-device-matrix.md`
- Create: `.gitignore`
- Create: `spikes/location-poc/app.json`, `spikes/location-poc/app.ts`
- Create: `spikes/location-poc/pages/index/index.ts`, `spikes/location-poc/pages/index/index.wxml`
- Create: `spikes/location-poc/pages/index/index.wxss`, `spikes/location-poc/project.config.example.json`

**Interfaces:**
- Produces decisions for `WarehouseCode = 'cq' | 'east'`、`DeliveryDate`、`PlanVersionId`、`LocationSample`、`GeofencePolicy`。
- Produces a versioned Excel schema with exact Chinese column names, required fields, units, date source and quantity ranges.

- [ ] **Step 1: 初始化版本控制**

  若当前目录尚未处于 Git 仓库，执行 `git init`；加入 Node、IDE、构建产物、密钥和本地数据目录的忽略规则；基线只提交现有 `PRD.md` 和已批准的设计文档。

- [ ] **Step 2: 收集并冻结 Excel 模板**

  将 PRD 字段固定为：驾驶员姓名、线路、门店代码、餐厅名称、鲜货数量 kg、冻货数量 件、干货数量 件。上传表单显式选择配送日期；Excel 若包含日期列则必须与表单一致，否则整批拒绝。

- [ ] **Step 3: 写出导入和版本 ADR**

  规定仓库+配送日下采用版本号；第二次上传先预览，确认时若已有签到或送达事件则禁止覆盖，必须另建版本并说明生效范围。

- [ ] **Step 4: 执行真实微信定位 Spike**

  在至少一台 iOS 和一台 Android 真机、真实微信账号上验证：签到前禁止采集、授权后前台采集、切后台、锁屏、断网恢复、拒绝授权、系统关闭后台权限。记录微信版本、系统版本、授权步骤、采样间隔和 30 分钟内的到达率。

- [ ] **Step 5: 固化降级行为和围栏口径**

  记录失败时的用户提示、管理员状态、电话跟进方式；冻结跨日补签关联哪一个配送日；超时未送达按“首次签到后 120 分钟”起算并按仓库可配置，定位未更新默认 10 分钟；明确有效采样精度不超过 50 米、离店连续采样最大间隔 120 秒、服务端按事件时间排序、使用原始采样、重复事件幂等、离开计时必须连续满 180 秒。

- [ ] **Step 6: 运行 Spike 验收**

  在微信开发者工具和真机按矩阵逐项运行。Expected: `docs/testing/location-device-matrix.md` 中每个场景有 PASS/FAIL 和设备证据。若后台定位无法满足验收，暂停正式定位开发并更新 ADR。

- [ ] **Step 7: Commit**

  ```bash
  git add .gitignore PRD.md docs/superpowers/specs/2026-10-29-driver-delivery-system-design.md docs/superpowers/plans/2026-10-29-driver-delivery-system.md docs/decisions docs/testing/location-device-matrix.md spikes/location-poc
  git commit -m "docs: lock delivery rules and validate background location"
  ```

### Task 1: 建立 Monorepo、环境和质量门禁

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.editorconfig`, `.env.example`, `.nvmrc`
- Create: `apps/api`, `apps/worker`, `apps/admin-web`, `apps/miniprogram`
- Create: `packages/contracts`, `packages/domain`, `packages/config`, `packages/test-fixtures`
- Create: `infra/docker-compose.yml`, `infra/README.md`
- Create: `packages/test-fixtures/excel/plan-valid.xlsx`, `packages/test-fixtures/excel/plan-invalid.xlsx`
- Create: `packages/test-fixtures/location/route-basic.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:fixtures`, `pnpm dev`。
- Produces `packages/contracts` as the only shared DTO and enum source。

- [ ] **Step 1: 创建工作区和应用入口**

  生成上述目录、最小启动文件和统一 TypeScript 配置；API、worker、web 和角色化小程序必须能独立构建。

- [ ] **Step 2: 配置本地依赖**

  `docker-compose.yml` 提供 PostgreSQL/PostGIS 和 MinIO；worker 的待办任务、租约、重试和通知 Outbox 存于 PostgreSQL；`.env.example` 只放变量名和示例值，不提交真实密钥。

- [ ] **Step 3: 建立质量门禁**

  CI 顺序执行格式检查、类型检查、单元测试、API e2e 和 web 构建；失败时上传测试报告和数据库迁移日志。

- [ ] **Step 4: 验证脚手架**

  Run: `docker compose -f infra/docker-compose.yml up -d && pnpm lint && pnpm typecheck && pnpm test`

  Expected: 容器健康检查通过，所有包无类型错误，测试命令能执行，即使业务测试为空也必须有 smoke test。

- [ ] **Step 5: Commit**

  ```bash
  git add package.json pnpm-workspace.yaml turbo.json .editorconfig .env.example .nvmrc apps packages infra .github
  git commit -m "chore: bootstrap delivery management workspace"
  ```

### Task 2: 数据模型、认证和仓库权限

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/0001_extensions/migration.sql`, `apps/api/prisma/migrations/0002_core_tables/migration.sql`
- Create: `apps/api/src/modules/auth/*`
- Create: `apps/api/src/modules/access/*`
- Create: `packages/contracts/src/auth.ts`, `packages/contracts/src/access.ts`
- Test: `apps/api/src/modules/access/access.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- `POST /v1/auth/wechat-login -> { accessToken, user: UserSummary }`
- `POST /v1/driver-applications -> DriverApplicationSummary`
- `POST /v1/admin/auth/login { username, password } -> AdminSession`
- `GET /v1/me -> UserSummary`
- `WarehouseScopeService.assertRead(user, warehouseId)` and `assertWrite(user, warehouseId)`。
- Core tables: `users`, `drivers`, `driver_applications`, `warehouses`, `admin_warehouse_roles`, `restaurants`, `restaurant_versions`, `plans`, `plan_versions`, `plan_routes`, `plan_stops`, `attendance`, `tracking_sessions`, `location_samples`, `delivery_stops`, `delivery_events`, `announcements`, `import_batches`, `audit_logs`, `worker_jobs`, `outbox_messages`。

- [ ] **Step 1: 写权限失败测试**

  覆盖普通驾驶员、重庆仓管理员、华东仓管理员、超级管理员：跨仓写入返回 `403 WAREHOUSE_WRITE_FORBIDDEN`；仓库管理员跨仓读配送进度允许；驾驶员不能读取其他驾驶员数据。

- [ ] **Step 2: 定义数据模型和迁移**

  所有主表使用 UUID；业务表携带 `warehouse_id`；位置采样同时保存微信/高德 GCJ-02 原始坐标和转换后的 WGS-84 PostGIS geography 点，并保存 `event_at`、`received_at`、设备/会话标识和幂等键；配送记录保存计划/餐厅坐标快照。

- [ ] **Step 3: 实现认证**

  微信登录映射到用户；驾驶员必须绑定审核通过的 driver；网页管理员凭超级管理员创建的账号登录，小程序管理员将微信身份绑定到该账号；密码使用 Argon2id 哈希。统一错误格式为 `{ code, message, requestId, details }`。

- [ ] **Step 4: 实现服务端仓库守卫**

  所有 controller 进入 service 前调用 `assertRead/assertWrite`；禁止仅用前端传入的 warehouseId 拼查询条件。

- [ ] **Step 5: 验证**

  Run: `pnpm --filter api test -- access.spec.ts auth.e2e-spec.ts`

  Expected: 权限矩阵、登录、过期 token、跨仓读写和审计字段测试全部 PASS。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api packages/contracts apps/api/prisma
  git commit -m "feat: add identity and warehouse access control"
  ```

### Task 3: 驾驶员注册审核、管理员账号和餐厅主数据

**Files:**
- Create: `apps/api/src/modules/drivers/*`
- Create: `apps/api/src/modules/admins/*`
- Create: `apps/api/src/modules/restaurants/*`
- Create: `apps/admin-web/src/views/drivers/*`, `apps/admin-web/src/views/restaurants/*`
- Create: `apps/admin-web/src/views/super-admin/admins/*`
- Create: `apps/miniprogram/src/pages/driver/register/*`, `apps/miniprogram/src/pages/driver/profile/*`
- Test: `apps/api/src/modules/drivers/drivers.spec.ts`, `apps/api/src/modules/admins/admins.spec.ts`, `apps/api/src/modules/restaurants/restaurants.spec.ts`

**Interfaces:**
- `POST /v1/driver-applications { realName, phone, warehouseCode }`
- `POST /v1/admin/drivers/:id/approve`, `POST /v1/admin/drivers/:id/reject`, `PATCH /v1/admin/drivers/:id/phone`
- `POST /v1/super-admin/admins`, `PATCH /v1/super-admin/admins/:id/warehouses`
- `GET/POST/PATCH /v1/admin/restaurants`
- `RestaurantVersion { restaurantId, code, name, latitude, longitude, coordinateSystem: 'GCJ-02', isBreakfast, effectiveFrom }`。

- [ ] **Step 1: 写注册和主数据测试**

  验证实名必填、手机号格式、仓库必选、重复申请、同仓门店代码唯一、GCJ-02 坐标范围和跨仓写入拒绝；修改手机号必须写审计日志。

- [ ] **Step 2: 实现审核和账号服务**

  注册状态为 `pending/approved/rejected`; 只有 approved driver 才能签到。管理员创建和仓库绑定只允许超级管理员。登录后依据 `/me` 返回的角色加载相应页面，不提供客户端角色选择。

- [ ] **Step 3: 实现餐厅版本化 CRUD**

  修改坐标/代码/名称/早餐店标记生成新版本；已开始配送保留旧快照，未开始配送读取最新有效版本。

- [ ] **Step 4: 实现后台和小程序页面**

  网页提供申请审核、手机号修改、餐厅列表/新增/编辑；超级管理员页面创建管理员并绑定仓库；司机“我的”展示实名、最新手机号、仓库、审核和定位权限状态。

- [ ] **Step 5: 验证**

  Run: `pnpm test -- drivers admins restaurants && pnpm --filter admin-web build`

  Expected: API 测试 PASS；管理员页面能完成审核、手机号更新、餐厅版本编辑；司机端未审核账号不能进入配送页。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api apps/admin-web apps/miniprogram packages/contracts
  git commit -m "feat: add driver review and restaurant management"
  ```

### Task 4: 配送计划 Excel 导入闭环

**Files:**
- Create: `packages/contracts/src/import.ts`
- Create: `apps/api/src/modules/imports/*`
- Create: `apps/api/src/modules/plans/*`
- Create: `apps/admin-web/src/views/plans/*`
- Create: `apps/admin-web/src/components/import/*`
- Test: `apps/api/src/modules/imports/imports.spec.ts`, `apps/api/test/plan-import.e2e-spec.ts`

**Interfaces:**
- `POST /v1/admin/imports` multipart upload + `warehouseCode` + `deliveryDate -> ImportBatchSummary`
- `GET /v1/admin/imports/:id/preview -> { columns, validRows, invalidRows, warnings }`
- `POST /v1/admin/imports/:id/confirm -> PlanVersionSummary`
- `GET /v1/admin/imports/:id/result -> ImportResult`
- `GET /v1/admin/plans?date=&warehouse=` only returns one selected warehouse per response。

- [ ] **Step 1: 写 fixture 驱动的失败测试**

  覆盖缺列、空姓名、未知司机、未知门店、同名司机、负数数量、鲜货超过 3 位小数、冻货/干货非整数、非法日期、线路为空、重复门店、同一司机跨线路重复门店、跨仓门店和重复导入。

- [ ] **Step 2: 实现解析和校验器**

  只接受 `.xlsx`，最大 10 MB；使用 ExcelJS 和版本化 schema，不执行公式；鲜货存为 `numeric(10,3)` kg，冻货/干货存为非负整数件；保留原始行号和原始文本；所有错误返回行号、字段、错误码和修复建议。

- [ ] **Step 3: 实现预览和确认事务**

  上传先写对象存储和 `import_batches`; 预览不产生正式计划；确认在一个数据库事务中创建 `plan_version`、线路和 `plan_stops`，失败时整批回滚。

- [ ] **Step 4: 实现版本和影响提示**

  若该仓库/日期已有签到、定位或送达记录，确认按钮必须显示影响范围并阻止覆盖；未开始配送可建立新版本并把版本号写入后续状态。

- [ ] **Step 5: 实现网页工作流**

  页面顺序固定为选择日期/文件、预览、异常行、影响提示、确认、结果和历史版本；禁止通过刷新重复提交确认。

- [ ] **Step 6: 验证**

  Run: `pnpm --filter api test -- imports.spec.ts plan-import.e2e-spec.ts`

  Expected: valid fixture 生成计划；invalid fixture 逐行提示；重复确认幂等；跨仓文件被拒绝；已有配送记录时不会覆盖历史状态。

- [ ] **Step 7: Commit**

  ```bash
  git add apps/api apps/admin-web packages/contracts packages/test-fixtures
  git commit -m "feat: add versioned delivery plan imports"
  ```

### Task 5: 每日签到、司机今日数据和小程序基础流程

**Files:**
- Create: `apps/api/src/modules/attendance/*`
- Create: `apps/api/src/modules/driver-dashboard/*`
- Create: `apps/miniprogram/src/pages/driver/home/*`
- Create: `apps/miniprogram/src/pages/driver/delivery/*`
- Create: `apps/miniprogram/src/pages/driver/data/*`
- Create: `apps/miniprogram/src/pages/driver/mine/*`
- Create: `apps/miniprogram/src/services/api.ts`, `apps/miniprogram/src/services/location.ts`, `apps/miniprogram/src/router/role-router.ts`
- Test: `apps/api/src/modules/attendance/attendance.spec.ts`, `apps/miniprogram/src/pages/driver/home/home.spec.ts`

**Interfaces:**
- `POST /v1/driver/attendance/sign-in -> AttendanceSummary`
- `GET /v1/driver/today -> { attendance, routes, stops, counts, announcements, weather }`
- `GET /v1/driver/delivery?date= -> RouteProgress[]`
- `GET /v1/driver/location-status -> LocationStatus`

- [ ] **Step 1: 写跨日签到测试**

  使用 fake clock 覆盖 23:59:59、00:00:00、00:00:59、00:01:00；同一天重复签到返回原记录而不创建第二条；未审核司机和无当日计划司机按产品规则返回明确错误。

- [ ] **Step 2: 实现签到服务**

  保存签到时间、位置、设备会话；签到成功后创建 `tracking_session`，但不在服务端伪造定位点。

- [ ] **Step 3: 实现今日聚合 API**

  根据计划版本返回线路、门店、货物数量和当前状态；同一司机多线路分组展示，不提供选择线路参数。

- [ ] **Step 4: 实现司机小程序四个 Tab**

  同一小程序的驾驶员角色显示四个 Tab：首页显示仓库、天气、签到、定位授权、线路/门店/送达计数和公告；配送页按线路显示门店；数据页先接入日期筛选契约；我的页展示身份和联系电话。

- [ ] **Step 5: 验证**

  Run: `pnpm test -- attendance driver-dashboard && pnpm --filter miniprogram test`

  Expected: 签到边界、重复签到、未签到提醒和多线路展示测试 PASS；小程序页面能在模拟数据下完整渲染。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api apps/miniprogram packages/contracts
  git commit -m "feat: add driver attendance and daily delivery views"
  ```

### Task 6: 定位采集、围栏状态机和配送时长

**Files:**
- Create: `packages/domain/src/geofence/*`
- Create: `packages/domain/src/geo/coordinate-converter.ts`
- Create: `packages/domain/src/delivery-state/*`
- Create: `packages/contracts/src/location.ts`, `packages/contracts/src/delivery.ts`
- Create: `apps/api/src/modules/locations/*`
- Create: `apps/worker/src/jobs/geofence-reducer.ts`, `apps/worker/src/jobs/location-expiry.ts`
- Modify: `apps/miniprogram/src/services/location.ts`
- Test: `packages/domain/src/geo/coordinate-converter.spec.ts`, `packages/domain/src/geofence/geofence.spec.ts`, `packages/domain/src/delivery-state/delivery-state.spec.ts`, `apps/api/test/location.e2e-spec.ts`

**Interfaces:**
- `POST /v1/driver/location-samples/batch { sessionId, samples: LocationSample[] } -> IngestResult`
- `LocationSample { clientEventId, eventAt, latitude, longitude, coordinateSystem: 'GCJ-02', accuracyMeters, provider, sequence }`
- `GeofenceReducer.reduce(stopSnapshot, orderedSamples, policy) -> DeliveryStateTransition[]`
- `GET /v1/admin/drivers/:id/live-location -> LiveLocationSummary`

- [ ] **Step 1: 写纯函数状态机测试**

  覆盖首次进入 200 米、范围内持续采样、短暂离开少于 180 秒、连续离开达到 180 秒、超过 50 米精度阈值、超 120 秒采样间隔、漂移、无序事件、重复事件、相邻/重叠门店、缺少精度和跨线路点位；重叠候选距离差不超过 `max(accuracyMeters, 20m)` 时不得自动关联门店。

- [ ] **Step 2: 实现事件接收和幂等**

  以 `sessionId + clientEventId` 去重；保存客户端事件时间和服务端接收时间及 GCJ-02 原始坐标；转换为 WGS-84 后写入 PostGIS；精度大于 50 米的样本保存但不推进状态；迟到/重复事件保留但不重复产生状态迁移；未经签到的事件拒绝。

- [ ] **Step 3: 实现围栏状态机**

  状态固定为 `pending/location_tracking/delivering/delivered`; 首次有效入围栏写 `arrivedAt`；离开计时从第一次确认超出 200 米开始，只有后续有效样本间隔不超过 120 秒且连续覆盖 180 秒才确认离开，写 `departedAt`、`deliveredAt` 和 `durationSeconds`；内围栏样本或超长采样间隔重置离开候选。

- [ ] **Step 4: 实现 worker 推进和过期**

  worker 周期性处理未完成门店和定位过期；位置长时间未更新只写 `locationStatus=stale` 和异常，不改变门店送达状态。

- [ ] **Step 5: 接入小程序后台定位**

  签到后请求授权并启动后台定位；封装切后台、锁屏、断网重试和恢复上报；前台恢复时补传本地未发送批次。不得把客户端本地时间直接作为服务器当前时间。

- [ ] **Step 6: 验证**

  Run: `pnpm test -- coordinate-converter geofence delivery-state && pnpm --filter api test -- location.e2e-spec.ts`

  Expected: 所有状态机测试 PASS；轨迹回放能重现到店、短暂离开不送达、连续离开 3 分钟送达；重复/乱序事件不改变最终结果。

- [ ] **Step 7: Commit**

  ```bash
  git add packages/domain apps/api apps/worker apps/miniprogram packages/contracts
  git commit -m "feat: track location and derive delivery states"
  ```

### Task 7: 管理员总览、驾驶员列表和详情

**Files:**
- Create: `apps/api/src/modules/admin-dashboard/*`
- Create: `apps/admin-web/src/views/overview/*`, `apps/admin-web/src/views/driver-detail/*`
- Create: `apps/miniprogram/src/pages/admin/overview/*`, `apps/miniprogram/src/pages/admin/drivers/*`, `apps/miniprogram/src/pages/admin/driver-detail/*`
- Create: `apps/admin-web/src/stores/warehouse.ts`, `apps/miniprogram/src/stores/warehouse.ts`
- Test: `apps/api/src/modules/admin-dashboard/admin-dashboard.spec.ts`, `apps/admin-web/tests/warehouse-scope.spec.ts`, `apps/miniprogram/src/pages/admin/overview/overview.spec.ts`

**Interfaces:**
- `GET /v1/admin/overview?warehouseCode=&date= -> OverviewCounts`
- `GET /v1/admin/drivers?warehouseCode=&status=&date= -> DriverProgressPage`
- `GET /v1/admin/drivers/:id?date= -> DriverDetail`
- `POST /v1/admin/delivery-stops/:id/corrections { reason, status, arrivedAt?, departedAt? } -> CorrectionSummary`
- `POST /v1/admin/drivers/:id/call-intent -> { phoneMasked, telUri }`（后端返回最新手机号，不在日志中记录完整号码）

- [ ] **Step 1: 写仓库和异常测试**

  覆盖切换仓库后所有统计/列表/地图只含当前仓库；定位未更新显示 stale；不得因 stale 自动进入未送达；状态筛选支持未签到、已签到、逾期、配送中、已完成、定位未更新和超时待处理。配送纠正验证操作者、原因、修改前后值和审计时间。

- [ ] **Step 2: 实现聚合查询**

  服务端按日期和仓库查询计划、签到、定位、门店状态；一次响应不混合两个仓库。地图点位使用最新有效定位和时间。

- [ ] **Step 3: 实现网页后台**

  完成顶部仓库切换、今日总览卡片、驾驶员列表、筛选、详情、线路进度、门店时间和电话按钮；写操作仍通过绑定仓库守卫。

- [ ] **Step 4: 实现管理员小程序**

  同一小程序的管理员角色显示总览、名单、详情、地图位置、异常提示和拨号；配送记录纠正必须填写原因；不在小程序实现 Excel 批量上传。

- [ ] **Step 5: 验证**

  Run: `pnpm test -- admin-dashboard && pnpm --filter admin-web test && pnpm --filter miniprogram test`

  Expected: 权限、仓库切换、异常状态和页面交互测试 PASS；详情可展示每条线路和每家门店的到店/离店/时长。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api apps/admin-web apps/miniprogram packages/contracts
  git commit -m "feat: add admin monitoring and delivery corrections"
  ```

### Task 8: 公告、天气和驾驶员对账报表

**Files:**
- Create: `apps/api/src/modules/announcements/*`
- Create: `apps/api/src/modules/weather/*`
- Create: `apps/api/src/modules/reports/*`
- Create: `apps/admin-web/src/views/announcements/*`, `apps/admin-web/src/views/reports/*`
- Modify: `apps/miniprogram/src/pages/driver/home/*`, `apps/miniprogram/src/pages/driver/data/*`
- Test: `apps/api/src/modules/reports/reports.spec.ts`, `apps/api/src/modules/weather/weather.spec.ts`

**Interfaces:**
- `POST/PATCH /v1/admin/announcements`, `GET /v1/driver/announcements`
- `GET /v1/weather?warehouseCode=` via provider adapter and cache
- `GET /v1/driver/reports?startDate=&endDate=`
- `GET /v1/admin/reports?startDate=&endDate=&driverId=&routeCode=&restaurantId=`
- `ReportRow { deliveryDate, driver, route, restaurant, freshKg, frozenCases, dryCases, arrivedAt, departedAt, durationSeconds, status }`

- [ ] **Step 1: 写报表口径测试**

  验证按日期、司机、线路、门店筛选；鲜货用 kg 汇总，冻货/干货用件汇总；历史记录引用计划和坐标快照；未送达门店不伪造离店时间。

- [ ] **Step 2: 实现公告 CRUD 和有效期**

  仓库管理员只能维护绑定仓库公告；公告有标题、正文、开始/结束时间、启停状态；司机首页只读有效公告。

- [ ] **Step 3: 实现天气适配器**

  每仓配置一个代表城市；服务端缓存天气并提供供应商失败时的最近成功值和降级文案；雨天返回安全提醒标志。

- [ ] **Step 4: 实现报表 API 和页面**

  管理员网页支持日期、司机、线路、餐厅查询；司机数据页支持日期范围、按天/线路/门店展开；所有汇总从已完成的配送事实表计算。

- [ ] **Step 5: 验证**

  Run: `pnpm test -- reports weather && pnpm --filter admin-web build`

  Expected: 报表数字与 fixture 逐项一致；天气缓存和失败降级测试 PASS；页面能展示空数据、部分送达和跨日范围。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api apps/admin-web apps/miniprogram packages/contracts
  git commit -m "feat: add reports weather and announcements"
  ```

### Task 9: 企业微信群 04:00/07:00 定时推送

**Files:**
- Create: `apps/worker/src/jobs/notification-scheduler.ts`
- Create: `apps/worker/src/notifications/wecom-client.ts`
- Create: `apps/worker/src/notifications/delivery-summary.ts`
- Create: `apps/api/src/modules/notifications/*`
- Create: `apps/admin-web/src/views/notifications/*`
- Test: `apps/worker/src/notifications/delivery-summary.spec.ts`, `apps/worker/src/notifications/wecom-client.spec.ts`

**Interfaces:**
- `buildDeliveryMessage({ date, cutoff, warehouses }) -> string`
- `NotificationOutbox.enqueue({ type, businessDate, cutoff, snapshotHash }) -> OutboxMessage`
- `WeComClient.sendMarkdown(message) -> SendResult`
- `GET /v1/admin/notifications/runs?date=`

- [ ] **Step 1: 写消息快照测试**

  04:00 只包含早餐店；07:00 包含全部门店；全部送达和未送达都必须有结果；一次只生成一条同时含重庆仓、华东仓分段的消息；空仓有明确“无计划”语义；超长消息按企业微信限制拆分并在每段保留仓库名和批次号。

- [ ] **Step 2: 实现 Outbox 和幂等**

  唯一键为 `businessDate + cutoff`; 状态为 pending/sending/sent/retryable_failure/unknown；发送前保存包含两仓的不可变消息快照和 `snapshotHash`，重试使用原快照。企业微信已接收但响应超时的结果为 `unknown`，暂停自动重发并要求管理员核对，避免不确定状态下重复发送。

- [ ] **Step 3: 实现定时调度和退避**

  worker 使用 `Asia/Shanghai` 触发 04:00 和 07:00 任务；使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 领取整条双仓消息任务；明确失败响应采用有限次数指数退避并记录最后错误，网络超时等发送结果不确定时转为 `unknown`，等待管理员核对后决定是否重发。

- [ ] **Step 4: 实现管理端运行记录**

  后台显示最近执行时间、消息摘要、发送结果和失败原因；Webhook 秘钥不可回显。

- [ ] **Step 5: 验证**

  Run: `pnpm test -- delivery-summary wecom-client`

  Expected: 消息格式、时间边界、重复调度、确定失败重试、unknown 结果处理和双仓分段测试 PASS；同一业务日/时段不会重复创建 Outbox 消息。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api apps/worker apps/admin-web packages/contracts
  git commit -m "feat: add scheduled warehouse notifications"
  ```

### Task 10: 审计、安全、可观测性和数据生命周期

**Files:**
- Create: `apps/api/src/modules/audit/*`
- Create: `apps/api/src/common/logging/*`, `apps/api/src/common/metrics/*`
- Create: `apps/worker/src/maintenance/retention-job.ts`
- Create: `docs/operations/runbook.md`, `docs/operations/backup-restore.md`
- Modify: `apps/api/src/modules/*` to emit audit events
- Test: `apps/api/src/modules/audit/audit.spec.ts`, `apps/worker/src/maintenance/retention-job.spec.ts`

**Interfaces:**
- `AuditService.record({ actorId, action, resourceType, resourceId, warehouseId, before, after, reason, requestId })`
- Metrics: `location_ingest_total`, `location_stale_total`, `geofence_transition_total`, `import_failure_total`, `notification_failure_total`
- Retention policy defaults: raw location 90 days, delivery/import/audit 2 years；自动删除在业务确认保留期限前默认关闭。

- [ ] **Step 1: 写审计和脱敏测试**

  覆盖审批、手机号修改、餐厅/计划修改、人工送达纠正、管理员账号绑定和通知重试；日志中不得出现完整手机号、token、Webhook URL 或原始坐标。

- [ ] **Step 2: 实现统一审计拦截**

  关键写接口必须记录请求 ID、操作者、仓库、前后值和原因；审计记录只增不改。

- [ ] **Step 3: 实现指标和告警**

  暴露 API、worker、定位过期、导入失败、通知失败和数据库连接指标；为连续定位未更新、导入失败率和通知失败配置告警阈值。

- [ ] **Step 4: 实现备份和保留任务**

  先提供 dry-run；确认保留期限后再启用删除；数据库备份恢复演练必须能恢复计划、配送状态和审计链。

- [ ] **Step 5: 验证**

  Run: `pnpm test -- audit retention && pnpm lint && pnpm typecheck`

  Expected: 审计、脱敏、dry-run 和指标测试 PASS；runbook 记录备份、恢复、密钥轮换和异常处置步骤。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api apps/worker docs/operations
  git commit -m "feat: add audit observability and retention controls"
  ```

### Task 11: 端到端测试、真机验收和试运行

**Files:**
- Create: `apps/api/test/e2e/full-flow.e2e-spec.ts`
- Create: `apps/admin-web/tests/e2e/*.spec.ts`
- Create: `docs/testing/uat-cases.md`
- Create: `docs/testing/real-device-acceptance.md`
- Create: `docs/release/checklist.md`
- Create: `scripts/seed-demo-data.ts`, `scripts/replay-location-track.ts`

**Interfaces:**
- Seed data contains both warehouses, two admins, one super admin, multi-route driver, adjacent restaurants, breakfast restaurants, valid/invalid imports and stale location cases.
- Replay script accepts `track.json`, `sessionId`, `speed` and expected transitions.

- [ ] **Step 1: 建立全链路 fixture**

  从司机注册、管理员审核、餐厅维护、Excel 导入、签到、位置回放到送达、报表和通知，使用固定数据生成可重复环境。

- [ ] **Step 2: 编写 API 全链路测试**

  验证两个仓库隔离、跨仓只读、司机多线路、签到边界、200 米/3 分钟状态、重复定位、计划版本和通知幂等。

- [ ] **Step 3: 编写 Web Playwright 测试**

  覆盖登录、仓库切换、导入预览/确认、审核、餐厅编辑、总览筛选、详情和报表查询；每个写操作验证审计记录。

- [ ] **Step 4: 执行真实设备验收**

  在目标 iOS/Android/微信版本执行签到后切后台、锁屏、断网恢复、相邻门店、GPS 漂移和定位拒绝场景；将设备信息、视频/日志、结果写入验收文档。

- [ ] **Step 5: 试运行**

  先选一个仓库、有限司机和 3-5 个配送日；每日核对自动状态、人工纠正、报表数量和 04:00/07:00 消息，连续通过后再开放第二仓库。

- [ ] **Step 6: 验证**

  Run: `docker compose -f infra/docker-compose.yml up -d && pnpm test:e2e && pnpm --filter admin-web test:e2e`

  Expected: 自动化链路全绿；真机矩阵没有未解释的 FAIL；发布检查表、回滚步骤、客服/管理员操作手册齐全。

- [ ] **Step 7: Commit**

  ```bash
  git add apps docs/testing docs/release scripts
  git commit -m "test: validate end-to-end delivery workflows"
  ```

### Task 12: 生产发布和交接

**Files:**
- Create: `infra/docker/api.Dockerfile`, `infra/docker/worker.Dockerfile`, `infra/docker/web.Dockerfile`
- Create: `infra/deploy/production.example.yml`
- Create: `docs/operations/admin-guide.md`, `docs/operations/driver-guide.md`
- Modify: `.github/workflows/ci.yml` for migration and release gates

**Interfaces:**
- Release artifact includes API, worker, admin web, one role-based mini-program build, migration bundle, environment variable manifest, smoke-test script and rollback image tags。

- [ ] **Step 1: 固化部署配置**

  API 和 worker 分开进程；数据库迁移在发布前单独执行；对象存储和 Webhook 密钥只通过部署环境注入。

- [ ] **Step 2: 编写发布前 smoke test**

  依次检查登录、仓库权限、导入 preview、签到、位置上报、状态查询、报表、Webhook dry-run 和备份可用性。

- [ ] **Step 3: 执行灰度发布**

  先发布后端和管理端，再发布包含司机/管理员角色页的小程序审核版本；灰度仓库只启用确认过的管理员和司机；保留上一版本回滚镜像。

- [ ] **Step 4: 完成交接**

  交付管理员/司机操作手册、异常处理 runbook、数据字典、API 契约、真机验收记录和已知限制；明确谁负责每天检查通知与定位异常。

- [ ] **Step 5: 最终验证**

  Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`

  Expected: CI 全绿；数据库迁移可重复执行；生产 smoke test 通过；发布清单由产品、技术和仓库管理员签字。

- [ ] **Step 6: Commit**

  ```bash
  git add infra docs/operations .github/workflows/ci.yml
  git commit -m "chore: prepare production release and handoff"
  ```

## MVP Cut Line

首个可试运行版本必须包含 Task 0-7 的完整链路、Task 8 的司机对账和天气/公告、Task 9 的两次推送，以及 Task 10-11 的审计、自动化测试和真机验收。可以延后的是复杂报表导出、通知历史可视化和多城市天气，但不能延后后台定位 Spike、仓库权限、计划版本、围栏状态机、定位过期语义和通知幂等。

## Self-Review

- PRD 的入口（一个角色化小程序、电脑后台）、三个角色、两仓隔离、注册审核、签到、定位、围栏、Excel、餐厅、公告、报表、电话和企业微信推送均已映射到 Task 2-12。
- 关键接口和跨模块契约集中在 `packages/contracts`；计划版本与餐厅坐标快照贯穿导入、定位、报表和通知，避免历史结果被后续编辑重算。
- 五类高风险输入已写入 Review Focus，并分别在 Task 2、4、5、6、7、11 中设置测试。
- 计划不依赖尚不存在的代码；每个任务的文件、接口、步骤和验证命令均可交给工程师独立执行。
