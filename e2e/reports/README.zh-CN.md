# UI 测试报告

这个目录存放 UI 自动化测试的运行结果和可读报告。

## 目录说明

- `latest.md`：最近一次测试运行的 Markdown 汇总报告
- `ui-test-report.html`：给人直接打开的 HTML 报告入口
- `playwright-html-report/`：Playwright 原生 HTML 报告目录，内部入口仍是 `index.html`
- `results.json`：Playwright JSON 原始结果
- `junit.xml`：JUnit 格式结果，方便接 CI
- `test-results/`：失败用例的截图、trace、error-context 等原始附件

每次执行 `pnpm -C e2e test:ui` 前，系统会先自动清理旧的：

- `e2e/.od-data/`
- `e2e/reports/test-results/`
- `e2e/reports/playwright-html-report/`
- `e2e/reports/results.json`
- `e2e/reports/junit.xml`
- `e2e/reports/latest.md`

这样报告和测试数据默认只反映最近一次执行结果，不会把上一次残留混进来。

## 怎么看

如果你想快速判断“这次到底测了什么、有没有过”，先看：

- [latest.md](/Users/mac/open-design/open-design/e2e/reports/latest.md)
- [ui-test-report.html](/Users/mac/open-design/open-design/e2e/reports/ui-test-report.html)

它会包含：

- 本次执行时间
- 总用例数、通过数、失败数
- 每条 case 的结果、耗时、重试次数
- 失败时对应的错误摘要和附件路径

如果你想看更细的失败上下文，再看：

- `e2e/reports/playwright-html-report/`
- `e2e/reports/test-results/`

## 和用例库的关系

- `e2e/cases/`：定义“应该测什么”
- `e2e/reports/`：记录“这次实际测了什么、结果如何”

这两层分开以后，既能看覆盖设计，也能看真实执行结果。
