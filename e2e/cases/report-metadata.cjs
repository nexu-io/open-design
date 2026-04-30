module.exports = {
  'prototype-basic': {
    module: '项目创建与生成',
    assertions: [
      '可以创建 prototype 项目并进入工作区',
      '发送 prompt 后会收到 mocked artifact',
      '生成文件会出现在工作区',
      '预览 iframe 中能看到期望标题',
    ],
  },
  'deck-basic': {
    module: '项目创建与生成',
    assertions: [
      '可以通过 deck tab 创建项目',
      '发送 prompt 后会收到 deck artifact',
      'deck 文件会出现在工作区',
      '预览 iframe 中能看到期望标题',
    ],
  },
  'design-system-selection': {
    module: '项目创建与生成',
    assertions: [
      '设计系统选择器可以搜索并选中目标设计系统',
      '创建项目后项目 meta 会保留设计系统名称',
      '项目成功进入工作区而不是停留在创建页',
    ],
  },
  'example-use-prompt': {
    module: '项目创建与生成',
    assertions: [
      'Examples 页的 Use this prompt 可以直接创建项目',
      '创建后的项目标题与 meta 会带上对应 skill 名称',
      '聊天输入框会预填 example prompt',
    ],
  },
  'conversation-persistence': {
    module: '会话生命周期',
    assertions: [
      '可以创建第二个会话并发送新的 prompt',
      '刷新后当前会话消息仍然存在',
      '历史菜单中可以切回旧会话',
      '切回后旧会话内容仍然正确显示',
    ],
  },
  'conversation-delete-recovery': {
    module: '会话生命周期',
    assertions: [
      '删除当前活跃会话后不会卡死在空状态',
      '界面会回退到剩余会话',
      '被删除会话的消息不会继续显示',
    ],
  },
  'question-form-selection-limit': {
    module: '会话生命周期',
    assertions: [
      'question form 中声明 maxSelections=2 的 checkbox 题目最多只能选中两个选项',
      '达到上限后新的未选项不会被选中',
      '界面中的已选数量会保持在约束范围内',
    ],
  },
  'question-form-submit-persistence': {
    module: '会话生命周期',
    assertions: [
      '提交 question form 后会写入一条用户回答消息',
      '表单会立即进入 answered / locked 状态',
      '刷新页面后表单仍会根据历史答案正确回填并保持锁定',
    ],
  },
  'generation-does-not-create-extra-file': {
    module: '项目创建与生成',
    assertions: [
      '第一次生成后项目中只出现预期的 artifact 文件',
      '在没有发送新 prompt 的情况下刷新页面不会新增文件',
      'files API 返回的文件集合在前后两次检查中保持一致',
    ],
  },
  'file-mention': {
    module: '文件链路',
    assertions: [
      '预置文件后 mention popover 可以搜索并选中文件',
      '输入框会插入 @filename',
      'staged attachment 会显示对应文件',
    ],
  },
  'file-upload-send': {
    module: '文件链路',
    assertions: [
      '聊天区 file input 可以上传文件',
      '上传后 staged attachment 会显示文件',
      '发送消息后用户消息中会保留该附件',
    ],
  },
  'deep-link-preview': {
    module: '文件链路',
    assertions: [
      '生成 artifact 后 URL 会进入文件路由',
      '离开项目文件路由后可再次通过文件路由进入',
      '重新进入后预览 iframe 仍能恢复到正确文件',
    ],
  },
  'design-files-upload': {
    module: '文件链路',
    assertions: [
      'Design Files 面板可以真实上传图片',
      '上传后文件行会出现在 Design Files 列表',
      '右侧预览面板会显示文件信息',
      '双击文件行会把文件打开成 tab',
    ],
  },
  'design-files-delete': {
    module: '文件链路',
    assertions: [
      'Design Files 行级菜单可以触发删除',
      '删除确认后文件行会从列表消失',
      '如果文件已打开，对应 tab 也会被清理',
    ],
  },
  'design-files-tab-persistence': {
    module: '文件链路',
    assertions: [
      '多个文件 tab 可以同时打开',
      '切换 active tab 后状态会被持久化',
      '刷新页面后 tab 集合会恢复',
      '刷新前选中的 active tab 仍然保持选中',
    ],
  },
};
