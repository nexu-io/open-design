# 项目创建与生成

这个模块聚焦主入口链路：

- 创建项目
- 进入工作区
- 发送 prompt
- 生成 artifact
- 打开预览

## 当前用例

### `prototype-basic`

- 状态：已自动化
- 对应 flow：`standard`
- 目标：覆盖 prototype 项目的主 happy path
- 核心步骤：
  1. 创建 `prototype` 项目
  2. 输入 prompt
  3. mock `/api/chat` SSE 返回 HTML artifact
  4. 校验生成文件出现在工作区
  5. 校验 iframe 预览正常

### `deck-basic`

- 状态：已自动化
- 对应 flow：`standard`
- 目标：覆盖 deck 项目创建分支
- 核心步骤：
  1. 切换到 `deck` 创建 tab
  2. 创建项目
  3. 发送 prompt
  4. mock 返回 deck artifact
  5. 校验预览正常

### `design-system-selection`

- 状态：已自动化
- 对应 flow：`design-system-selection`
- 目标：覆盖设计系统选择后创建项目，并确认项目元信息保留了该选择
- 核心步骤：
  1. mock 设计系统列表
  2. 打开设计系统选择器
  3. 搜索并选择指定设计系统
  4. 创建项目
  5. 校验项目页 meta 中出现设计系统名称

### `example-use-prompt`

- 状态：已自动化
- 对应 flow：`example-use-prompt`
- 目标：覆盖 Examples 页的快捷创建链路
- 核心步骤：
  1. mock skills 列表，提供一个示例卡片
  2. 切到 Examples 页
  3. 点击 `Use this prompt`
  4. 校验项目被直接创建
  5. 校验聊天输入框预填了 example prompt

### `generation-does-not-create-extra-file`

- 状态：已自动化
- 对应 flow：`generation-does-not-create-extra-file`
- 目标：覆盖“没有新 prompt 却自己多生成一个 HTML 文件”的回归风险
- 核心步骤：
  1. 生成一个 mocked artifact
  2. 通过 files API 记录当前项目文件集合
  3. 刷新页面但不发送新 prompt
  4. 再次读取 files API
  5. 校验文件集合没有变化，也没有新增 HTML 文件

## 推荐后续补充

### `deck-pagination-next-prev-correctness`

- 状态：待自动化
- 对应 flow：`deck-pagination-next-prev-correctness`
- 目标：覆盖 deck 预览上一页 / 下一页按钮的方向正确性
- 核心步骤：
  1. 打开多页 deck HTML
  2. 进入中间页
  3. 点击上一页并校验页码递减
  4. 点击下一页并校验页码递增

- template 项目创建
- 创建项目后的刷新恢复
- 创建失败或必填校验
