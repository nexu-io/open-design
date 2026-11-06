# 首页新增 E2E 覆盖点

本分支：`test/home-entry-coverage`

目标是把首页入口区这两块高频交互补成独立、可 review 的页面级 E2E：

- 顶部入口条
- 首页 Hero 模式 rail 与 Example/preset 回填

## 新增测试文件

- [e2e/ui/entry-topbar.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/entry-topbar.test.ts)
- [e2e/ui/home-hero-rail.test.ts](/Users/mac/open-design/open-design-home-entry/e2e/ui/home-hero-rail.test.ts)

## 新增用例

### entry-topbar.test.ts

1. `home topbar shows the new entry chips and links`
   - 校验顶部 `Star / Join Discord / execution pill / Use everywhere / settings` 可见
   - 校验 `Star` 和 `Join Discord` 链接存在

2. `home topbar execution pill reflects the selected Local CLI agent and opens the switcher`
   - 校验顶部 execution pill 展示当前 `Local CLI`
   - 校验当前 agent 文案正确
   - 点击后可展开切换器

3. `home topbar star and discord badges expose the current external-link contract`
   - 校验 `Star` 入口保持新标签安全外链契约
   - 校验 `Join Discord` 入口的当前链接与可访问性文案

4. `home topbar Use everywhere navigates to Integrations with the tab selected`
   - 校验点击 `Use everywhere` 后会进入 `Integrations`
   - 校验 `Use everywhere` tab 保持选中

5. `home topbar settings button opens settings and closes the execution popover`
   - 校验点击右上角 settings 后会打开设置弹窗
   - 校验打开设置时 execution pill 的 popover 会自动关闭

6. `clicking the top-left logo from another entry view returns to the home hero`
   - 校验从其他入口页面点击左上角 logo 后会回到首页
   - 校验首页 Hero 输入区、顶部入口和模式 rail 都重新可见

### home-hero-rail.test.ts

3. `home hero rail shows the current creation chips and More shortcuts`
   - 校验首页 Hero rail 显示：
     - `原型`
     - `实时制品`
     - `幻灯片`
     - `图片`
     - `视频`
     - `HyperFrames`
     - `音频`
   - 校验 `More` 打开后能看到快捷入口

4. `home hero rail switches non-media modes without surfacing media-only footer options`
   - 校验 `prototype / live-artifact / deck` 模式切换正常
   - 校验不会误出现媒体专属 footer option

5. `home hero rail exposes media footer options for image, video, hyperframes, and audio`
   - 校验媒体模式切换正常：
     - `image`
     - `video`
     - `hyperframes`
     - `audio`
   - 校验对应 footer option 联动正确

6. `home hero example presets update the composer input for prototype and live artifact`
   - 校验 `prototype` 的 Example/preset 会把 prompt 回填到输入框
   - 校验 `live artifact` 的 Example/preset 会把 prompt 回填到输入框

7. `home hero deck example preset updates the composer input`
   - 校验 `deck` 的 Example/preset 会把 prompt 回填到输入框

8. `clearing the active hero chip restores the rail and clears preset chrome`
   - 校验删除当前已选模式后，首页 rail 会恢复可选状态
   - 校验旧模式的 preset 区和 footer option 会一起清掉

9. `after clearing one mode, selecting another example updates the composer without leaking prior mode state`
   - 校验先删除当前模式，再切换到另一模式并选择 Example
   - 校验输入框回填为新模式 prompt，不残留上一模式的状态

10. `closing the selected example chip clears the example state while preserving the current mode chip`
   - 校验点击上方已选 Example 的关闭按钮后，Example 选中态被清除
   - 校验当前模式 chip 仍然保留，不会把模式一起清掉

11. `after closing one example chip, selecting another example updates the composer input`
   - 校验关闭一个已选 Example 后，可以继续选择另一个 Example
   - 校验输入框会更新为新的 Example prompt

## 运行命令

```bash
cd /Users/mac/open-design/open-design-home-entry/e2e
pnpm exec playwright test -c playwright.config.ts \
  ui/entry-topbar.test.ts \
  ui/home-hero-rail.test.ts
```

## 备注

- 这批用例已经从 AMR helper 依赖中拆出来，适合单独跟首页改动一起 review。
- `home-hero-rail.test.ts` 运行依赖首页真实 fixture：
  - bundled scenario plugins
  - prompt templates
- 因此这条测试不是最轻量的 smoke，但已经收敛到首页交互本身，不再混入 AMR 登录态语义。
