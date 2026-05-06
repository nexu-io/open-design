# 通用接口说明

本文件汇总了适用于支付宝支付产品的通用接口参考文档及代码示例使用说明，供主 Skill 集成参考。

## 通用接口说明索引

下表所列文档与说明适用于所有支付宝支付产品，请结合用户集成诉求按需查阅。

| 文档名称 | 文档链接 |
| --- | --- |
| 统一收单交易查询接口 | <https://ideservice.alipay.com/cms/site/0izblf> |
| 统一收单交易退款接口 | <https://ideservice.alipay.com/cms/site/0izam4> |
| 统一收单交易退款查询接口 | <https://ideservice.alipay.com/cms/site/0izl48> |
| 收单退款冲退完成通知接口 | <https://ideservice.alipay.com/cms/site/0izofn> |
| 统一收单交易撤销接口 | <https://ideservice.alipay.com/cms/site/0izofo> |
| 查询对账单下载地址接口 | <https://ideservice.alipay.com/cms/site/0izofp> |
| 异步通知说明 | <https://ideservice.alipay.com/cms/site/0izal6> |

## 代码示例索引

各接口的代码示例按编程语言拆分了独立的代码示例文件，存放于 `references/code-examples/` 目录下。请根据用户实际使用的编程语言，查找所需接口的示例代码，**不要混用不同语言**。

表格中某语言列为空，表示该语言暂无对应接口的示例文档。此时请依据上述通用接口文档中的**公共请求参数**、**业务请求参数**及**响应参数**，获取字段名、类型、是否必填及取值规则，按照当前编程语言规范自行完成实现。

| 接口名称 | Python | Node.js |
| --- | --- | --- |
| 统一收单交易查询接口 | [示例](code-examples/python/统一收单交易查询接口代码示例.md) | [示例](code-examples/nodejs/统一收单交易查询接口代码示例.md) |
| 统一收单交易退款接口 | [示例](code-examples/python/统一收单交易退款接口代码示例.md) | [示例](code-examples/nodejs/统一收单交易退款接口代码示例.md) |
| 统一收单交易退款查询接口 | [示例](code-examples/python/统一收单交易退款查询接口代码示例.md) | [示例](code-examples/nodejs/统一收单交易退款查询接口代码示例.md) |
| 收单退款冲退完成通知接口 | [示例](code-examples/python/收单退款冲退完成通知接口代码示例.md) | [示例](code-examples/nodejs/收单退款冲退完成通知接口代码示例.md) |
| 统一收单交易撤销接口 | [示例](code-examples/python/统一收单交易撤销接口代码示例.md) | [示例](code-examples/nodejs/统一收单交易撤销接口代码示例.md) |
| 查询对账单下载地址接口 | [示例](code-examples/python/查询对账单下载地址接口代码示例.md) | [示例](code-examples/nodejs/查询对账单下载地址接口代码示例.md) |
