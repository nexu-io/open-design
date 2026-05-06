# 使用示例

## 创建匿名沙箱

### 全类型

```
帮我创建一个匿名沙箱
```

```bash
alipay-cli mcp call alipay-anonymous-sandbox.createAnonymousSandbox --data '{"request":{"appType":"all"}}' 
```

### 小程序

```
帮我创建一个小程序沙箱
```

```bash
alipay-cli mcp call alipay-anonymous-sandbox.createAnonymousSandbox --data '{"request":{"appType":"TINYAPP"}}' 
```

### 网页应用

```
帮我创建一个网页应用的匿名沙箱
```

```bash
alipay-cli mcp call alipay-anonymous-sandbox.createAnonymousSandbox --data '{"request":{"appType":"PUBLICAPP"}}' 
```

### AI 服务应用

```
帮我创建一个 AI 服务应用的匿名沙箱
```

```bash
alipay-cli mcp call alipay-anonymous-sandbox.createAnonymousSandbox --data '{"request":{"appType":"AISERVICEAPP"}}' 
```

### 返回示例（appType 为 all 时返回三个应用）

```json
{
  "appIds": [
    {
      "alipayPublicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "appId": "9021000162691374",
      "appPrivateKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...",
      "appPrivatePkcsKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...",
      "appPublicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "pid": "2088721100529696",
      "type": "TINYAPP",
      "uid": null
    },
    {
      "alipayPublicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "appId": "9021000162691375",
      "appPrivateKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...",
      "appPrivatePkcsKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...",
      "appPublicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "pid": "2088721100529696",
      "type": "PUBLICAPP",
      "uid": null
    },
    {
      "alipayPublicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "appId": "9021000162691376",
      "appPrivateKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...",
      "appPrivatePkcsKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...",
      "appPublicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "pid": "2088721100529696",
      "type": "AISERVICEAPP",
      "uid": null
    }
  ],
  "isClaimed": false,
  "sandboxAccounts": {
    "partner": {
      "accountDesc": "商家账号",
      "acctrans": "1000000.00",
      "email": "xxxxx@sandbox.com",
      "merchantId": "221187076",
      "userId": "2088721100529696"
    },
    "user": {
      "accountDesc": "买家账号",
      "acctrans": "1000000.00",
      "email": "xxxxx@sandbox.com",
      "userName": "xxxxx",
      "userId": "2088722100508485",
      "logonPassword": "111111",
      "payPassword": "111111",
      "certNo": "195109197300184083",
      "certType": "IDENTITY_CARD"
    }
  },
  "sandboxId": "al1458801837b7495b",
  "sandboxName": "匿名沙箱-al1458801837b7495b"
}
```

## 生成认领链接

### 创建后立即认领

```
帮我创建一个匿名沙箱，然后给我认领链接
```

认领链接：`https://open-main-site-pre.alipay.com/develop/ai/ai-resource-center/sandbox/{sandboxId}/auth`

### 通过 sandboxId 认领

```
帮我认领沙箱
```

### 追加认领

```
> 帮我创建一个匿名沙箱    (第一轮)
> 帮我认领这个沙箱          (第二轮)
```

自动使用上一轮的 sandboxId 拼接认领链接。