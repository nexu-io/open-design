# Motion 效果扩展的职责边界

模板能力包含 Motion 的两条链路：参考视频转可编辑模板（`video-to-template`，不提问，由 Agent 自行决定并记录取舍）、模板转视频（`template-to-video`，面向用户，缺事实或素材时可以提问）。video-to-template 只承接可复用模板交付；普通参考视频复刻进入 motion-recreate（一期随包分发，重建与测量规则在其自身目录内，不依赖 video-to-template），不默认先转模板。已有模板的修改由 template-to-video 处理。底层工程沿用 HyperFrames；模板是可携带源码、素材、预览和编辑说明。视觉接受程度由用户判断，技术检查不代替人类验收。

## 通用行为恢复

- `motion_get_workflow` 保留研发原有 `start/intake/templates/production/verification`。恢复其依赖的研发工作流文档，不再将默认入口改成复刻流程。
- `template-to-video` 实现默认模板路线及画廊 builtin/registry 指引；旧 `workflow=template` 返回同源真实正文，原 motion-template 占位移除。`video-to-template` 独立提供视频转模板入口及同源 MCP 文档，不接管普通复刻或默认原创路线。两者复用共享上下文、修改与托管工程 revision 保护。
- 模板列表、详情、应用和封面 API 恢复研发行为，不再扫描本机自定义 `template.json` 或将其混入画廊。移除扩展的 `motion_save_template` 管理工具；既有目录不删除、不重写，仍是可直接使用的原生工程。
- `motion_compare_video` 仅作为可选效果诊断工具，使用实际视频文件路径或 `latest-export`；工程须先导出视频再比较，执行失败保留原生错误与修复建议；不依赖模板入库、ID、版本系统，也不作视觉验收裁决。

## 不改底座

插件名、MCP 服务名、安装脚本、用户数据目录和 Studio 端口沿用研发主干，本扩展不修改。安装路径、端口和数据目录变化必须独立验证，不能由内容 Skill 隐式修改。

## 验证边界

- 默认入口保持薄路由，模板专业入口指向真实 Skill；增加用户模板文件不得改变默认目录结果。
- 自有两条 Skill 和可选诊断工具仍可用，历史模板文件保持可读取。
- 模板入口接入与视频转模板职责分开验证，不以既有视频外观结果代替新版本的运行验证；普通视频复刻由 motion-recreate 实现，实测记录见需求记录中的 REQ-20261105-RECREATE-005。
- 不修改实验成品、生成素材或用户工程；扩展的合入沿用仓库 PR 与 CI 流程。
