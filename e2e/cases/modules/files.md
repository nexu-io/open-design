# 文件链路

这个模块聚焦项目文件相关的主链路：

- 文件上传
- 文件 mention
- staged attachment
- 文件路由打开
- 预览恢复

## 当前用例

### `file-mention`

- 状态：已自动化
- 对应 flow：`file-mention`
- 目标：覆盖 `@` mention 选择文件并加入 staged attachment
- 核心步骤：
  1. 通过项目文件 API 预置 `reference.txt`
  2. 在聊天输入框中输入 `@ref`
  3. 选择 mention popover 里的文件
  4. 校验输入框中插入 `@reference.txt`
  5. 校验 staged attachment 显示正确

### `file-upload-send`

- 状态：已自动化
- 对应 flow：`file-upload-send`
- 目标：覆盖聊天区真实上传文件并发送
- 核心步骤：
  1. 通过 composer 的隐藏 file input 上传文件
  2. 校验 staged attachment 出现
  3. 发送 prompt
  4. 校验用户消息里带上上传文件

### `deep-link-preview`

- 状态：已自动化
- 对应 flow：`deep-link-preview`
- 目标：覆盖文件路由直达和预览恢复
- 核心步骤：
  1. 生成 artifact
  2. 校验 URL 进入 `/projects/:id/files/:name`
  3. 离开项目文件路由
  4. 再次通过文件路由进入
  5. 校验预览 iframe 正常恢复

### `design-files-upload`

- 状态：已自动化
- 对应 flow：`design-files-upload`
- 目标：覆盖 Design Files 面板真实上传、预览与打开
- 核心步骤：
  1. 通过 Design Files 面板的上传入口选择图片
  2. 校验文件行出现在列表中
  3. 校验右侧预览信息出现
  4. 双击文件行
  5. 校验文件以 tab 形式打开

### `design-files-delete`

- 状态：已自动化
- 对应 flow：`design-files-delete`
- 目标：覆盖 Design Files 面板删除文件以及打开 tab 的清理
- 核心步骤：
  1. 先上传一张图片
  2. 回到 Design Files 面板
  3. 打开文件行菜单并执行删除
  4. 确认文件行从列表中消失
  5. 确认对应文件 tab 也被清理

### `design-files-tab-persistence`

- 状态：已自动化
- 对应 flow：`design-files-tab-persistence`
- 目标：覆盖多个打开文件 tab 在刷新后的恢复
- 核心步骤：
  1. 先上传两张图片
  2. 确认两张图片都打开为 tab
  3. 切换当前 active tab
  4. 刷新页面
  5. 确认两个 tab 都被恢复
  6. 确认刷新前的 active tab 仍然是 active

## 推荐后续补充

### `deck-pagination-per-file-isolated`

- 状态：待自动化
- 对应 flow：`deck-pagination-per-file-isolated`
- 目标：覆盖多个 deck HTML 之间的分页状态隔离
- 核心步骤：
  1. 打开两个多页 deck 文件
  2. 分别停留在不同页码
  3. 来回切换文件 tab
  4. 校验每个文件维持自己的页码

### `uploaded-image-renders-in-preview`

- 状态：待自动化
- 对应 flow：`uploaded-image-renders-in-preview`
- 目标：覆盖上传图片参与生成后，预览中的图片真实可加载
- 核心步骤：
  1. 上传图片作为参考素材
  2. 生成引用该图片的 HTML artifact
  3. 进入预览 iframe
  4. 校验对应 `img` 的 `src` 可解析且不是 broken image

### `python-source-preview`

- 状态：待自动化
- 对应 flow：`python-source-preview`
- 目标：覆盖 `.py` 文件在主工作区中的源码预览能力
- 核心步骤：
  1. 通过项目文件 API 预置一个 `.py` 文件
  2. 在主工作区打开该文件
  3. 校验文件查看器进入源码/文本预览模式
  4. 校验能看到 Python 源码内容，而不是空白或不支持状态

- 图片文件上传与缩略图展示
- 刷新后 staged attachment 清理策略
