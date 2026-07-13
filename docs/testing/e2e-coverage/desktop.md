# 桌面端模块

## 覆盖范围

- 受环境变量控制的 mac 桌面端 smoke
- mac 打包产物安装/启动/探活生命周期
- 从 desktop shell 进入设置页的关键路径

## 对应测试文件

- `e2e/specs/mac.spec.ts`

## 已自动化

### Desktop shell smoke

| ID | 场景 | Gate | 来源 |
| --- | --- | --- | --- |
| DESK-001 | Desktop shell 可以打开当前 API 配置，并展示正确的 provider/model | `OD_DESKTOP_SMOKE=1` | `mac.spec.ts` |
| DESK-002 | 在桌面端设置里切换 API protocol 时，legacy provider tracking 保持一致 | `OD_DESKTOP_SMOKE=1` | `mac.spec.ts` |
| DESK-003 | 桌面端外观设置里预览 Dark 模式，并在保存后持久化 | `OD_DESKTOP_SMOKE=1` | `mac.spec.ts` |

### 打包运行时 smoke

| ID | 场景 | Gate | 来源 |
| --- | --- | --- | --- |
| DESK-101 | 构建出的 mac 安装包可以完成安装、启动、健康检查、停止和卸载 | `OD_PACKAGED_E2E_MAC=1` | `mac.spec.ts` |

## 自动化候选

| ID | 场景 | 原因 |
| --- | --- | --- |
| DESK-C01 | Windows desktop smoke | 值得补，但要等对应平台 smoke 文件和执行基础设施准备好 |
| DESK-C02 | 更多桌面端设置分区，例如 notifications、language、connectors | 有自动化价值，但当前先保留高 ROI 核心路径 |
| DESK-C03 | 更深入的 packaged runtime 校验 | 成本较高，适合在发布链路更稳定后逐步扩展 |

## 手工保留

| ID | 场景 | 原因 |
| --- | --- | --- |
| DESK-M01 | 真机安装体验、系统权限弹窗体验 | 强依赖真实机器环境和人工判断 |
| DESK-M02 | 不同 macOS 版本下的界面细节与交互质感 | 自动化覆盖成本高，更适合人工回归 |

## 说明

- 桌面端 smoke 有意折叠进 `e2e/specs/mac.spec.ts`，这样可执行覆盖仍然留在现有平台 smoke 层里。
- `e2e/lib/desktop/**` 只放 helper，不放独立可执行用例。
