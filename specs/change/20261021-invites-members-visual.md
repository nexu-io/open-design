# 客户端邀请视觉还原

## Alignment status: READY

- 用户指定从 integration/seats-phase1（600c8881c5）创建 fix/seats-phase1-members-visual-acceptance。
- 参考本次提供的客户端全部状态HTML；只把附件当视觉证据。
- 修复普通邀请重复说明、标题区高度、内容间距、hover及窄屏布局；保留真实邀请、角色和失败恢复逻辑。
- 用户2026-10-21决定：成员加入不限席位。客户端现有邀请入口及提交不依赖剩余席位，API端以AMR实现和测试为准；加入成员不增加额度。
- 报告：https://powerformer.feishu.cn/wiki/WPDdwnwUci5eXOk6yyQcMQCvnU1 。参考/修改前/修改后/结果分别呈现，未验证不算通过。
- 验证：visual-members-reference 9项邀请浏览器用例，InviteDialog.members 19项组件用例；guard通过。工作区typecheck被基线中EntryNavRail.top-tier-upgrade.test.tsx已移除的amrProfile属性阻断，非本轮修改。

### 2026-10-22 注册邀请子状态
- 新增 B04–B08 同状态浏览器取证，受控注册凭据与邀请 API，仅作为视觉与交互证据。
- 修复错误行多余 grid gap/margin 导致的 14px 高度增加及内容 7px 上移；错误行保持20px，位置相对下移2px。
- 按稿使用注册角色16px实心箭头、24px删除按钮与17px × 字形、主按钮21px行高。
- 保留真实输入校验、后端错误映射和发送中禁用；不将测试通过记为最终视觉通过。

### 2026-10-22 注册邀请结果页
- 全部成功：仅接口确认成功后展示勾选、成功标题、累计人数、进入按钮与3秒倒计时；手动/自动完成共用一次性保护，身份切换或卸载时清理计时器。
- 全部失败/部分失败：保留未发送输入与角色，汇总位于主按钮之前；重试不会重新发送成功项。
- 新文案按仓库规则补齐19种语言；主验收语言为简体中文。
- 当前全量Web类型检查只剩原分支 EntryNavRail.top-tier-upgrade.test.tsx 的 amrProfile 旧属性错误，未计为通过。

### 2026-10-22 注册邀请退出与首页反馈
- B13/B18/B19：通过真实注册邀请Host完成未发送跳过、全部成功主动进入、部分成功跳过，验证刷新后的横条持久化与实际累计成功人数。
- 邀请横条移到HomeHero标题之前；隐藏时保留36px行高与14px底部留白，防止标题跳动。按原稿应用top:-56px、400字重、20px分隔线及原SVG关闭字形。
- 仅邀请成功Toast在桌面按参考left:calc(50% + 134px)定位；保留原稿实际4秒生命周期、关闭与账号/工作空间校验。未依据文档内过时的3.2秒说明修改时间。
- 首页创作内容不在此组三项视觉比较范围；窄屏仍需独立比对，不因桌面局部一致计作全项通过。

### 2026-10-22 常规邀请角色与结果状态
- B03/B27：固定成员角色使用参考的normal行高；管理员与成员均无角色下拉。
- B10/B23/B25：受控接口验证成功后关闭、累计实际人数、已有成员行内错误、全部失败保留输入及重试成功。
- 将注册/常规全批失败的保留输入提示统一为submitFailedPreserved，19语言定义同步；普通会话无效提示仍保持原语义。
- 相关组件测试58项通过；全量Web类型检查仍只报告基线EntryNavRail测试amrProfile旧属性。

### 2026-10-22 顶部常驻邀请按钮
- 公共ghost变体覆盖了局部视觉样式，造成入口显示为纯文字；改用默认Button及有效的button.trigger选择器，保持原点击和权限逻辑。
- 根据原稿实测70×28、系统字体13px/600、11px水平内距、1px边框，修正默认/hover和蓝色1px焦点轮廓。
- 专项浏览器校验按钮尺寸、三状态截图与点击打开邀请框；焦点截图保留外侧4px，避免将轮廓裁掉。
- 尚待窄屏及与其他顶部入口的相对位置核对，不把局部截图通过等同A05全部通过。

### 2026-10-22 工作空间菜单
- 原稿实测212×192，列表行32px，动作行34px，分割线6px/4px外距；按最终级联修正原34px列表行与5px分割线留白。
- 动作SVG按稿flex:0 0 auto，移除继承19px图标占位带来的4px文案右偏；只作用于工作空间菜单动作行。
- 默认、hover、键盘焦点截图及Enter打开邀请框复验；正常与50个空间上限两项浏览器检查通过，6项目录组件测试与guard通过。
- A06仍需窄屏与工作空间切换的完整视觉最终复验，不据此增加通过状态数。
- 后续同状态像素辅助定位：头像行高16.8px及选中勾图形修正后，三状态超过8色阶差异均由157降至54像素，剩余集中在选中勾；未据像素比例判最终通过。

### 2026-10-22 菜单选中标记基线
- 测量确认参考勾SVG位于span文字行盒内（13px/18.2px），原直接flex子项在133px居中，参考130.40625px；按参考增加文字容器及自动靠右，未用像素translate补偿。
- 桌面默认/hover/focus菜单212×192，辅助像素比较最大色阶差1、超过8色阶像素0；三态交互和50空间上限浏览器检查通过，6组件测试通过。
- 768px/390px时当前导航隐藏侧栏，菜单截图被裁断，与原稿不一致；此为未解决缺陷，未将A06标记最终通过，后续需完成窄屏真实可达入口与同状态截图。

### 2026-10-22 B01 交互及窄屏复验
- 默认桌面接近原稿，但新增六状态同视口截图揭示角色菜单、焦点和窄屏明显差异，保持未通过。
- 依据原稿测量：注册角色菜单360px，偏移8px、内边距6px、选项14px/22px、说明13px/19.5px；单独onboardingMenu隔离普通邀请，保留原权限与API。
- 窄屏标题按稿24px/32.4px；为输入和角色保留原稿尾部列，修正输入及角色标签列宽。
- B01默认/添加hover/邮箱focus/角色菜单/390px/390px菜单浏览器流程通过；22项角色菜单及成员组件测试通过，guard通过。仍有约8px纵向位置、hover/focus描边与字形细节差异，不能据此计视觉通过。

### 2026-10-22 B01 位置与焦点修正
- 原稿窄屏底部版权语言区60px、间距32px、底部32px，当前保留110px不足，修正为124px；标题32.4px改用原稿1.35倍行高，消除整体约7px下移。
- 邮箱正常焦点维持原稿边框，不覆盖错误边框；角色键盘焦点按稿1px #888、offset2px，展开箭头旋转。
- 角色菜单按原稿strong标题21px行高、正文19.5px及12px图标间距重建；勾选使用原稿SVG。菜单差异明显收敛，仍有焦点边缘与hover剩余细节，保持待复验。
- B01/B05浏览器复验通过、22项组件测试通过；最新添加按钮hover色修正已重跑B01浏览器并截图复验；桌面默认、添加hover、邮箱focus均仅剩相同外缘差异，窄屏角色焦点边缘仍待核对。

### 2026-10-22 B01 窄屏文字复验
- 原稿实测角色按钮移动端padding0 10px、跳过按钮13px/1.4行高，已修正；默认窄屏明显差异像素由756降至19，剩余落在底部版权字形。
- 角色选中标题按稿#202020修正，未改变说明文字或业务行为。六组默认/hover/focus/角色菜单/窄屏证据已重采集；guard通过。仍需补齐发送与跳过按钮hover、菜单选项交互，整项保持待复验。

### 2026-10-22 B01 九组交互补齐
- 完成发送、跳过及管理员选项hover取证，按原稿computed与像素修正发送#353535/#fafafa并叠加brightness1.05、跳过#888、选项#202020。
- 最新B01九组状态浏览器复验通过；22项组件测试及guard通过，diff检查通过。版权字形与外缘最终复核仍保留，整体不提前计通过。

### 2026-10-22 B01 最终通过
- 版权字体与边界实测完全一致，剩余19像素来自JSX分段文本的浏览器绘制；统一为单个模板字符串后，390px默认与菜单截图差异为0。桌面只剩11个插画透明圆角边缘像素，表单内容无差异。
- 九组状态（默认、添加hover、邮箱focus、角色菜单、发送hover、跳过hover、管理员hover、390px及390px菜单）全部完成对照与真实浏览器复验。B01记通过，总计12/48，剩36项。
- B04–B08桌面也完成本轮受影响回归，6项注册浏览器流程通过；这些状态仍需各自窄屏与交互复验，不提前计通过。

### 2026-10-22 B04–B08 窄屏对齐
- 390px下删除按钮定位回预留操作列；行级错误提示按原稿保留306px宽度，避免输入列缩为186px后额外折行，恢复整体纵向居中。
- 五种状态浏览器复验通过，桌面与390px同状态截图已更新；390px图像比较B04/B05/B06/B07/B08均为0个明显差异像素。22项相关组件测试通过。
- 独有删除hover、错误修正与发送中交互仍需最终证据，五项不提前计通过。

### 2026-10-22 B04–B08 最终通过
- 新增删除按钮桌面/390px hover、错误邮箱focus取证，逐图对照表单内容无明显差异；桌面只剩同一插画透明圆角背景混合差异，390px为0。
- 实际操作断言：删除后剩1行；格式/重复/已是成员错误在修改邮箱后清除且发送可用；发送中输入和所有操作按钮禁用。五项浏览器测试全部通过。
- B04/B05/B06/B07/B08更新为通过，总计17/48（35.42%），剩31项（64.58%）；34张参考/实际配图及总进度同步飞书。

### 2026-10-22 B09/B11/B12 最终通过
- 更新本轮结果页默认、成功按钮hover/focus、失败重试hover及390px同状态截图。三项表单内容均与参考一致，390px差异为0；桌面仅同一插画透明圆角11像素背景混合差异。
- 成功3→2秒及自动退出流程通过；失败重试两行、部分失败仅重试lee邮箱，记录请求内容确保不重复发送mika成功项；两种重试的最终回执均正确累计2位。
- 三项浏览器测试通过，追加两项累计人数测试通过。B09/B11/B12记通过，总计20/48（41.67%），剩28项。采用受控API，不声称真实邮件发送。

### 2026-10-22 B13/B18 退出通过，B19窄屏待确认
- 原稿窄屏横条邀请分隔左padding10px，修正旧12px；hover固定分隔线颜色，避免共享Button清掉边框。桌面默认/hover/focus/关闭hover截图对齐，390px尺寸和位置一致。
- B13验证无邀请提交、跳过后横条刷新保留、真实打开邀请、关闭弹窗、关闭横条及刷新持久化。B18成功进入后无横条/注册邀请/额外Toast，刷新仍保持，邀请仅提交1次。两项记通过，总计22/48（45.83%），剩26项。
- B19桌面Toast截图一致，累计1人、4秒自动消失、刷新无注册邀请均验证。原稿390pxToast挤成竖排并偏右，当前横向居中；已发异步选择题，未获答复前保留待确认，不计通过，不影响其他项继续。
- 退出三项浏览器通过，B13新增完整持久化链复验通过；7项HomeInviteSurface组件测试及guard通过。

### 2026-10-22 B02 final verification
- Ordinary invitation hover colors, tooltip text and mobile gutters now follow the client reference. Tooltip placement uses the actual fractional height and the stable reference position after animation; the browser regression asserts a 10px visible gap.
- Ten paired states include default, send hover, input focus, add/cancel/close hover, 390px and complete tooltip arrows. Transparent edges retain the previously documented background exclusion. Role expansion is tracked separately in B20.
- B02 browser checks and the added placement assertion passed, along with 22 component tests, guard and diff checks. B02 is accepted: 23/48 passed; 23 await repair or verification and 2 await a responsive-reference decision.

### 2026-10-22 B20 accepted
- Fixed real mobile click-through: the invitation inherited pointer-events:none from the collapsed navigation rail. The dialog root now explicitly receives pointer events; navigation behavior is unchanged.
- Restored the reference's fixed 14px check slot, expanded arrow, unselected option text, keyboard-active trigger, and 24px remove button with its reference foreground/hover background.
- ResizeObserver follows trigger/root layout changes, fixing stale coordinates after responsive layout. Browser assertions verify left alignment and the 6px gap before reopening for a comparable pointer state.
- Actual ArrowDown/Enter role selection, pointer role selection and row deletion passed. Six paired visual states have no internal control-content difference; transparent rounded edges retain the existing scoped background exclusion.
- Owner/member/admin browser regressions passed for the pointer fix, registration B01 passed for the shared menu lifecycle, final B20 passed with geometry and keyboard assertions, and 22 component tests plus guard passed.
- B20 accepted: 24/48 (50%) passed, 22 remain under repair/review and 2 responsive-reference decisions remain pending.

### 2026-10-22 B21/B22/B23 accepted
- Fresh desktop, invalid-input focus and 390px comparisons match the client reference. Internal control content has no visible difference; only previously scoped transparent-edge background differences remain.
- Invalid and duplicate submissions issue zero invitation requests, including after editing. Both remain editable, preserve their rows, clear feedback on correction and enable sending.
- The existing-member case issues one rejected request; editing clears its error without sending. An explicit retry submits only corrected@example.com, receives the controlled success result and closes the dialog.
- Three focused browser tests with the added request assertions passed; guard and diff checks passed. No new product style changes were needed in this slice.
- B21/B22/B23 accepted: 27/48 (56.25%) passed, 19 under repair/review and 2 responsive-reference decisions pending. The Feishu report includes 18 paired-state images.

### 2026-10-22 B24/B25/B26 accepted
- Desktop and 390px rendering match the supplied invitation states, including retry hover, retained failure rows and inline error/summary layout. B26 panel and send button have identical measured geometry; four low-amplitude curved-edge raster pixels do not change visible control geometry.
- Pending form controls remain disabled while reference help/close stay available. Close aborts client observation and invalidates late responses; it does not retract a server-side invitation.
- Partial success still dispatches the confirmed success event and retains banner dismissal, but suppresses the extra success toast until all remaining recipients succeed. Retry sends only failed recipients and reports cumulative success of two.
- Added late-response race coverage and cumulative browser assertion. 31 related component tests, guard and diff checks passed. Final three-state browser run passed; prior compatibility run passed B10 and B18/B19, while its obsolete B25 top-toast expectation failed and was removed in favor of the source-derived inline error and retry case.
- Accepted count: 30/48 (62.50%); 16 await repair/final review and 2 responsive-reference decisions remain pending.

## 当前交付边界（2026-10-22）

- 整体验收未通过，旧受控接口截图的通过率撤回；最终验收必须使用真实账号、API与数据库。
- 390px成功提示按用户决定严格复现原稿竖排和右侧位置。
- 当前客户端邀请表单、角色、重试、累计人数与关闭等56项相关组件测试通过，guard通过；真实客户端全量复验尚未完成。
- A01窄屏独立登录入口实现已纳入当前改动，最终真实浏览器复验仍未通过；不得把此提交表述为100%视觉还原。
- 飞书报告只保留最终结论，继续修复与验收。
