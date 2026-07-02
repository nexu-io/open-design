# 特效提取的证据纪律 + Baseline 闸门（WebGL/Canvas 逆向分支强化）

`reverse-engineering.md` 讲"怎么读懂渲染架构"；本篇讲**逆向特效时怎么不骗自己**，
以及找不到真源码时的兜底路线。三件套：**证据分级 → no-compensation → baseline-first 闸门**。

> 纪律范式受 [lixiaolin94/skills · web-shader-extractor](https://github.com/lixiaolin94/skills) 启发（该仓库无 LICENSE，
> 默认保留所有权利——这里**只借方法概念、全部用本 skill 自己的话重写，未复制其代码或原文**）。
> 它和 web-clone 头号铁律「真源码至上」同魂，只是把"标行号"升级成了系统化的证据制度。

## 一、证据分级（每条结论都打标签）

写 TEARDOWN 时，渲染管线的每个关键事实都标一个级别，**默认按最低级算**：

| 标签 | 含义 | 例子 |
|---|---|---|
| `SOURCE` | 直接、绑定到目标的硬证据 | 公开真源码行、source-map 还原的模块、运行时对象 dump、抓到的 shader/WGSL 文本、帧捕获、带 hash 的网络响应体 |
| `PARTIAL` | 下一步探针的把手，还不够定论 | 类/函数/字段名、minified bundle 切片、框架对象、拿到 shader 但缺 uniform/pass/输入状态 |
| `GUESS` | 没有直接证据的重建值 | 视觉拟合、命名推断、套用默认值、手调魔数、任何"看起来对"的行为复原 |

- **未标 = 当 GUESS。** 别让没证据的东西混进"已知"。
- 这是把 marbles 教训（"AI 把解析求交臆造成 ray-marching"）制度化：**凡是 GUESS 级的实现，照抄前必须先升级到 SOURCE。**

## 二、no-compensation（不靠调参掩盖不懂）

> **严禁**为了让画面"看起来对"，去改亮度 / 速度 / 位置 / 噪声值，来掩盖时序、颜色、FBO、资源、坐标系或状态模型上的真错误。

- 拟合出来的某个常数让输出更像了 → **它仍是 GUESS**，并写明"要拿到什么证据才能升级"。
- 接线类事实（pass 顺序、坐标变换、时间单位、输入耦合）**不会因为画面像了就算对**，必须独立追到证据为止。
- 对应 web-clone 老规矩：验证不了的如实写，**别伪造"拖动成功"**。

## 三、baseline-first 闸门（先复现，再重构）

逆向特效时**最容易犯的错**是边抠边重写边美化，最后既不像原站也说不清哪步错了。改成分闸：

```
定位渲染面 → 捕获最小真相 → RAW REPLAY（原样最小复现）→ ✅BASELINE 逐帧比对通过
                                                              ↓ 通过后才允许
                                                        PROJECTIZE（重构成可编辑工程）→ PACKAGE
```

- **RAW REPLAY**：用抓到的真实 draw call / shader / uniform / 顶点数据，做一个**尽量小、尽量原样**的可运行复现，不优化、不换框架、不改参数。
- **BASELINE 闸门**：RAW REPLAY 必须和原站逐帧（或多帧采样）视觉一致，才算过。**没过这道闸，不准进重构。**
- 过闸后再 PROJECTIZE：换成可维护写法（raw WebGL / Three.js TSL / Babylon 等），每处仍标证据级别。
- 收尾三态，如实标注：`DONE_BASELINE_VERIFIED`（复现且验证）/ `DONE_PROJECTIZED`（已工程化）/ `DONE_BASELINE_WITH_GAPS`（复现但有记录在案的缺口）。

## 四、找不到真源码时——运行时捕获兜底

web-clone 第一动作永远是"去 GitHub / source-map 找真源码"。但**特效站经常无源、minified 到底**。
这时不要退回"看着像就照着写"（那是 GUESS），而是去**渲染边界抓运行时真相**：

- 在 WebGL/WebGPU 上下文拦截：实际的 draw call、绑定的 program、编译过的 shader 源、uniform 值、FBO/纹理尺寸、blend/depth 状态。
- 工具方向：spector.js 式的帧捕获、`WebGLRenderingContext` 原型打补丁记录调用、`getShaderSource` 拿编译后的 shader、preload script 在页面脚本前注入钩子。
- 抓到的这些算 `SOURCE` 级——它们就是新的"真源码"，喂给 baseline-first 流程。

## 五、什么时候委托 web-shader-extractor

如果你已经装了 `web-shader-extractor`（`npx skills add lixiaolin94/skills` 里的那个 skill），
**遇到下面情况直接把特效那一段委托给它，web-clone 只当总入口**：

- 站是 WebGL/WebGPU/重 Canvas 特效，且 GitHub + source-map 都找不到真源码；
- 需要运行时帧捕获、逐帧比对、shader/uniform 级别的抠取；
- 想要"先 baseline 复现、再独立工程化"的完整带闸流程。

委托产物（最小可复现的 baseline + 证据包）拿回来后，**再并入 `当前项目目录/`**，
按 web-clone 的产物规范补 NOTES/TEARDOWN，并继续走 Step 5 验证 + Step 6 替换。

没装它也不影响：上面四节的纪律本身就能照着做，web-shader-extractor 只是把第四节的捕获机器做成了现成工具。

## 与既有产物的衔接

- TEARDOWN.md 的"A. 真实技术拆解"每条加证据标签（`SOURCE`/`PARTIAL`/`GUESS`）。
- "B. 二手分析校验表"本来就是在抓 GUESS 冒充 SOURCE，口径一致。
- baseline 复现物建议留在 `<站名>-clone/RECON/baseline/`，和原始截图一起作为"验证过"的铁证。
