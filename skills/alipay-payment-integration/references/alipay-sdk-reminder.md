
# Alipay-SDK Reminder

## 快速沙箱应用私钥格式

- Node.js 和 Python 选择快速沙箱配置返回的 `appPrivatePkcsKey`（PKCS#1 格式的私钥）

## SDK 对待两类 API 的处理方式不同
开放平台提供了支持主流开发语言的 SDK 接入的方式。对于页面跳转类 API，SDK 不会也无法像系统调用类 API 一样自动请求支付宝并获得结果，而是在接受 request 请求对象后，为开发者生成前台页面请求需要的完整 form 表单的 html（包含自动提交脚本），商家直接将这个表单的 String 输出到 http response 中即可。

## 第三方 SDK 正确导入方式

### nodejs
```javascript
// ✅ 正确方式 1：查看 package.json 的 exports 字段
// 先执行以下命令查看：
// cat node_modules/alipay-sdk/package.json | grep -A 20 '"exports"'

// ✅ 正确方式 2：从子路径直接导入（推荐）
import AlipaySdk from 'alipay-sdk/alipay';

// ✅ 正确方式 3：如果上述都不行，尝试解构导入
import { AlipaySdk } from 'alipay-sdk';

// ❌ 错误方式：默认导入（通常会失败）
import AlipaySdk from 'alipay-sdk';
```

## alipay.trade.page.pay 优先使用 pageExecute() 方法并直接获取支付链接

### nodejs
```javascript
// ============================================
// pageExecute() - 返回可直接提交的 HTML 表单
// 适用场景：电脑网站支付、手机网站支付
// 返回值可以直接渲染到页面并提交
// ============================================
const payResult = await alipayClient.pageExecute('alipay.trade.page.pay', {
  bizContent: {
    out_trade_no: '订单号',
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: '10.00',
    subject: '商品名称',
  },
});
```

## 时间戳格式化（支付宝要求格式）

### nodejs
```javascript
// ============================================
// 支付宝要求的时间戳格式：yyyy-MM-dd HH:mm:ss
// 注意：是空格分隔，不是 T
// ============================================

// ✅ 方式 1：手动补零（推荐，性能好）
function formatAlipayTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// ✅ 方式 2：使用 toLocaleString（简单但可能有 locale 问题）
function formatAlipayTimestamp2(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
}

// ❌ 错误方式：ISO 格式（支付宝不认）
new Date().toISOString();           // 2026-04-29T14:30:00.000Z
new Date().toString();              // Wed Apr 29 2026 22:30:00 GMT+0800
date.toLocaleDateString();          // 2026/4/29
```