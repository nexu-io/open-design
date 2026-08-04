# 测试效率与确定性

本文记录当前测试实现与评审应遵守的效率规则。目标是在不降低隔离性、
覆盖强度和诊断质量的前提下，减少无意义的真实等待、重复初始化与重试。

## 当前策略

- 当前不以统一耗时分档或 guard 拒绝测试变更。
- 优先修复有重复 CI 证据的异常用例，再用收敛后的数据建立耗时基线。
- 测试超时是失败预算，不是测试预期需要消耗的时长。
- CI retry 只用于保留诊断机会；首次失败、重试通过仍视为待修复信号。
- 优化不得通过共享可变运行时、串行化用例或削弱断言来换取速度。
- 覆盖放在能证明行为的最窄测试层；只有跨层连接本身是独立合同且没有其他
  用例见证时，才保留昂贵的浏览器到 daemon 全链路。

## 等待业务完成信号

测试必须等待后续动作真正依赖的完成信号，不能把中间 UI 状态当作持久化
完成。

例如，上传后立即 reload、切换项目或访问深链接时：

1. 在触发上传前注册对应的 response waiter。
2. 精确匹配请求方法和业务路径。
3. 断言响应成功。
4. 再验证 UI，并执行 reload 或导航。

```ts
const uploaded = page.waitForResponse((response) => {
  const url = new URL(response.url());
  return response.request().method() === 'POST'
    && url.pathname.endsWith('/upload');
});

await input.setInputFiles(file);
expect((await uploaded).ok()).toBe(true);
await page.reload();
```

仅等待标签、按钮、toast 或乐观列表项出现是不充分的，除非该状态本身就是
用例的最终业务结果，且后续步骤不依赖服务端持久化。

## 时钟驱动逻辑

polling、retry、backoff、debounce、throttle、TTL 和自动关闭等逻辑默认使用
虚拟时钟测试。

- 在定时器被创建前调用 `vi.useFakeTimers()`。
- 通过 React `act` 推进时钟并等待异步回调完成。
- 同时断言边界两侧，例如 `2999ms` 尚未执行、再推进 `1ms` 后执行。
- 在 `afterEach` 中恢复真实时钟，避免污染同文件的其他用例。
- 不用扩大 test timeout 代替虚拟时钟。

```ts
vi.useFakeTimers();

await act(async () => {
  await vi.advanceTimersByTimeAsync(2_999);
});
expect(retry).not.toHaveBeenCalled();

await act(async () => {
  await vi.advanceTimersByTimeAsync(1);
});
expect(retry).toHaveBeenCalledTimes(1);
```

虚拟时钟必须保持被测并发语义。若一个用例专门验证浏览器事件循环、React
提交和未决 I/O 之间的交错，而 fake timer 会把这些阶段合并进同一个
`act`，应保留真实时钟并在代码旁说明该等待保护的语义。

## 真实等待

不要使用 `setTimeout` 或固定 sleep 等待普通异步状态“应该已经完成”。
优先选择：

- 等待网络 response、SSE 终止事件或进程退出；
- 等待可观察的持久化数据；
- 等待明确的 UI actionability 或稳定状态；
- 控制并解决 deferred promise；
- 推进虚拟时钟。

确实需要真实时间时，等待必须对应无法由测试控制的运行时边界，并使用仓库
已有的超时常量。评审时应能从用例名称、断言或邻近注释看出该真实等待保护
的具体行为。

## 隔离与生命周期

- 每个用例独立建立自己依赖的项目、配置、mock 和运行状态。
- 不依赖同文件前序用例或同 worker 前序文件遗留的数据。
- 只有验证首页、项目创建表单或创建后的路由行为时，才通过对应 UI 建立项目。
  其他浏览器用例应先注入首屏所需配置，通过 API 建立独立项目，再直达目标
  路由，避免把无关的首页渲染、modal 交互和 reload 纳入每条测试链路。
- 不为了摊薄启动成本共享可变 daemon、浏览器上下文或数据目录。
- 不用 serial group 隐藏竞争条件。
- 嵌套资源按后创建、先关闭的顺序释放：page、browser context 和 browser
  必须在提供它们所连接服务的 runtime、server 或临时目录之前关闭。优先使用
  资源原生的异步释放协议或局部 `try/finally`，不要把消费方清理推迟到外层
  `afterEach`。
- 只有在生命周期成本已经被证明为主要瓶颈，且隔离模型仍然明确时，才调整
  harness 的预热或复用策略。

## 优化顺序

处理慢测试时按以下顺序判断：

1. 消除固定 sleep 和真实业务计时。
2. 删除已经由更窄测试层分别见证的重复全链路覆盖。
3. 用精确完成信号替换轮询式等待。
4. 减少重复 render、启动和 fixture 构造，但保持用例隔离。
5. 收紧过宽的查询、事件和断言范围。
6. 确认单文件仍是关键路径后，再考虑拆文件或调整 shard。
7. 只有生命周期本身占主导时，才评估 harness 级改动。

大文件名、用例数量或文件总耗时只能用于定位，不能单独证明拆分有收益。
文件拆分如果没有减少执行工作量，通常只会改变调度形状。

## 验证要求

优化后的测试至少满足：

- 聚焦用例重复运行通过；
- 所在测试文件完整通过；
- 相关 package typecheck 通过；
- `pnpm guard` 与根级 `pnpm typecheck` 通过；
- UI 竞态修复在对应 merge lane 的运行模型下验证；
- 记录优化前后的可比测试体耗时，区分测试体、文件和 CI job wall time。

任何 retry-only pass、首次失败或明显偏离基线的耗时都需要解释，不能只报告
最终绿色状态。
