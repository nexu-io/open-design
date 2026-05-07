# 会话生命周期

这个模块聚焦项目内聊天会话的生命周期：

- 新建会话
- 切换会话
- 刷新恢复
- 删除会话
- 后续可扩展重命名等场景

## 当前用例

### `conversation-persistence`

- 状态：已自动化
- 对应 flow：`conversation-persistence`
- 目标：覆盖会话创建、刷新恢复、历史切换
- 核心步骤：
  1. 在第一个会话里发送 prompt
  2. 新建第二个会话
  3. 在第二个会话里发送新的 prompt
  4. 刷新页面
  5. 校验当前会话内容仍在
  6. 打开历史菜单切回第一个会话

### `conversation-delete-recovery`

- 状态：已自动化
- 对应 flow：`conversation-delete-recovery`
- 目标：覆盖删除当前活跃会话后的回退逻辑
- 核心步骤：
  1. 创建两个会话
  2. 删除当前活跃会话
  3. 校验界面自动回退到剩余会话
  4. 校验项目仍然保有可用会话

### `question-form-selection-limit`

- 状态：已自动化
- 对应 flow：`question-form-selection-limit`
- 目标：覆盖快速确认里 checkbox 多选上限约束
- 核心步骤：
  1. 创建项目并发送一条 prompt
  2. mock 返回带 `maxSelections: 2` 的 question form
  3. 连续点击三个视觉风格选项
  4. 校验始终只有两个选项处于选中态
  5. 校验第三个选项不会被错误选中

### `question-form-submit-persistence`

- 状态：已自动化
- 对应 flow：`question-form-submit-persistence`
- 目标：覆盖 question form 提交后的用户回答落盘、锁定态与刷新回填
- 核心步骤：
  1. mock 返回一个带必填项的 question form
  2. 选择答案并点击提交
  3. 校验会话里写入了用户回答消息
  4. 校验原表单进入 answered / locked 状态
  5. 刷新页面后再次确认锁定态和已选答案仍然正确

## 推荐后续补充

- 会话重命名
- 删除最后一个会话后的自动重建
- 历史菜单关闭/重新打开后的状态一致性
- 长会话列表滚动与选中态
- 多轮对话后的会话标题生成或更新策略
