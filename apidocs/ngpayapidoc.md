编码：UTF-8
请求方式：POST
数据格式：application/json
参数名称和参数说明中规定的固定值必须与列表中完全一致（大小写敏感）

#### 通用请求头

| 请求头          | 说明       | 默认  | 可用值                                            |
| :-------------- | :--------- | :---- | ------------------------------------------------- |
| Accept-Language | 国际化语言 | zh-CN | zh-CN(简体中文)/en(英文) /ur(乌尔都语)/hi(印地语) |

# 数据格式

- 所有请求和返回都采用POST，数据格式都是JSON。
- 服务器返回的数据格式为：

```
{
   "code":xx,  //表示成功或者失败，200表示处理成功，非200表示失败，
   "msg":xxx, //成功返回success，失败返回失败原因
   "data":xxx  //真正有用的交互数据，是一个JSON对象，异步通知时会带上签名sign，只有data里面的数据参与签名。
 }
```

# 签名(大写)

- 对所有参数{key1=value2&key2=value2}采用字典序ASCII 码排序，然后以&符号拼接成一个字符串signContent，空值和空字符串和sign不参与签名，最后拼上秘钥&key={api_key}。<font color="red">sign必须大写</font>
- 对于异步通知的回调，<font color="red">请勿采用写死参数的方式来验证签名</font>，由于系统的更新，可能会有参数的增减，请对所有参数进行动态排序再签名。异步通知时会带上签名sign（注：sign不参与签名），只有data里面的数据参与签名。
- 商户秘钥在商户后台获取。

- 示例待签名参数：

```json
{
  "merchantNo": "NG2000",
  "merchantOrderNo": "123456",
  "amount": "100.00",
  "coinUnit": "PKR",
  "extend": ""
}
```

- 例如:`api_key=111222`
- 签名：

```
signContent="amount=100.00&coinUnit=PKR&merchantNo=NG2000&merchantOrderNo=123456" + "&key=" + api_key
signContent="amount=100.00&coinUnit=PKR&merchantNo=NG2000&merchantOrderNo=123456&key=111222"
sign=MD5(signContent)="3829D149F2F5480328040170B90F1BE6"
```

| 错误码 | 错误解释 |
| ------ | -------- |
| 500    | 业务异常 |

| 日期       | 涉及接口 | 修改内容 |
| ---------- | -------- | -------- |
| 2025/01/01 |          | 接口定义 |

##### 简要描述

- 代收/支付订单请求

##### 请求URL

- `https://xxx/api/pay`

##### 请求方式

- **Method**: POST
- **Content-Type**: ["application/json"]

##### 参数

| 参数名          | 必选 | 类型        | 说明                                                                                                                   | 示例值                                          |
| :-------------- | :--- | :---------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| merchantNo      | 是   | string      | 商户号(商户后台获取)                                                                                                   | NG26020744015                                   |
| merchantOrderNo | 是   | string(64)  | 商户订单号                                                                                                             | 20260127170859                                  |
| amount          | 是   | string      | 金额                                                                                                                   | 100 / 100.00                                    |
| coinUnit        | 是   | string      | 币种                                                                                                                   | PKR                                             |
| payType         | 是   | string      | 支付类型([参考支付类型](https://www.showdoc.com.cn/2598849309982183/11559060626633975 "参考支付类型")或者商户后台获取) | EASYPAISA                                       |
| productNo       | 是   | string      | 产品编号(商户后台获取)                                                                                                 | 66666                                           |
| productTitle    | 是   | string(64)  | 商品标题                                                                                                               | 测试                                            |
| notifyUrl       | 是   | string(128) | 通知地址                                                                                                               | https://xxxxx/notify                            |
| viewUrl         | 选填 | string(128) | 回显地址                                                                                                               | https://xxxxx/view                              |
| clientIp        | 是   | string      | 客户端IP（支持IPv4/IPv6，请上传真实用户IP，非商户服务器IP）                                                            | 182.239.127.137                                 |
| timestamp       | 是   | string(13)  | 时间戳(毫秒)                                                                                                           | 1769504939591                                   |
| extend          | 选填 | string      | 扩展（根据[支付类型](https://www.showdoc.com.cn/2598849309982183/11559060626633975 "支付类型")，额外参数通过扩展转递)  | {"email":"xx@gmail.com","mobile":"03123456789"} |
| sign            | 是   | string      | 签名(大写)                                                                                                             | 749502BBB7D9BC06B3846A9C215D8285                |

##### 请求示例

```
{
    "amount": "10000",
    "clientIp": "182.239.127.137",
    "coinUnit": "PKR",
    "extend": "",
    "merchantNo": "NG26020744015",
    "merchantOrderNo": "20260207154500",
    "notifyUrl": "https://127.0.0.1/notify",
    "payType": "JAZZ_CASH",
    "productNo": "20260125214",
    "productTitle": "测试",
    "sign": "521F874F63FA78AEE1A229265A13B866",
    "timestamp": "1770450300230",
    "viewUrl": ""
}
```

##### 返回示例

```
{
    "code": 200,
    "data": {
        "merchantNo": "NG26020744015",
        "merchantOrderNo": "20260207154500",
        "orderNo": "20260207154501001P",
        "payUrl": "https://127.0.0.1/pay",
		"payContent": "",
        "sign": "E27E21AE5417A60F827F944BDC9E9A76"
    },
    "msg": "操作成功"
}
```

##### 返回参数说明

| 参数名 | 类型   | 说明                             |
| :----- | :----- | -------------------------------- |
| code   | int    | 状态码(200代表成功,其他则为失败) |
| msg    | string | 响应消息                         |
| data   | json   | 响应数据                         |

##### data-参数说明

<span style="color:red">注：查询返回字段可能会在后续版本中扩展，请勿将字段参与签名逻辑写死，以免新增字段导致验签失败</span>

| 参数名          | 类型   | 说明             |
| :-------------- | :----- | ---------------- |
| merchantNo      | string | 商户号           |
| merchantOrderNo | string | 商户订单号       |
| orderNo         | string | 系统订单号       |
| payUrl          | string | 支付地址         |
| payContent      | string | 支付内容(二维码) |
| sign            | string | 签名             |

##### 简要描述

- 代收/支付订单查询，订单详情

##### 请求URL

- `https://xxx/api/pay/query`

##### 请求方式

- **Method**: POST
- **Content-Type**: ["application/json"]

##### 参数

| 参数名          | 必选                        | 类型       | 说明                 | 示例值                           |
| :-------------- | :-------------------------- | :--------- | -------------------- | -------------------------------- |
| merchantNo      | 是                          | string     | 商户号(商户后台获取) | NG26020744015                    |
| merchantOrderNo | 选填(orderNo选其一)         | string(64) | 商户订单号           | 20260207154500                   |
| orderNo         | 选填(merchantOrderNo选其一) | string(64) | 系统订单号           | 20260207154501001P               |
| timestamp       | 是                          | string(13) | 时间戳(毫秒)         | 1769508947995                    |
| sign            | 是                          | string     | 签名(大写)           | B46735A521B54CF0825913BACA4A092E |

##### 请求示例

```
{
    "merchantNo": "NG26020744015",
    "merchantOrderNo": "20260207154500",
    "orderNo": "",
    "sign": "B46735A521B54CF0825913BACA4A092E",
    "timestamp": "1770450434379"
}
```

##### 返回示例

```
{
    "code": 200,
    "msg": "操作成功",
    "data": {
        "merchantNo": "NG26020744015",
        "merchantOrderNo": "20260207154500",
        "orderNo": "20260207154501001P",
        "transactionReference": null,
        "payType": "JAZZ_CASH",
        "status": 2,
        "coinUnit": "PKR",
        "amount": "10000",
        "completedTime": null,
        "createTime": 1770450302000,
        "sign": "CAB9D33120E1C6FFAB63C0F95A79A950"
    }
}
```

##### 返回参数说明

| 参数名 | 类型   | 说明                             |
| :----- | :----- | -------------------------------- |
| code   | int    | 状态码(200代表成功,其他则为失败) |
| msg    | string | 响应消息                         |
| data   | json   | 响应数据                         |

##### data-参数说明

<span style="color:red">注：查询返回字段可能会在后续版本中扩展，请勿将字段参与签名逻辑写死，以免新增字段导致验签失败</span>

| 参数名               | 类型    | 说明                                                       |
| :------------------- | :------ | ---------------------------------------------------------- |
| merchantNo           | string  | 商户号                                                     |
| merchantOrderNo      | string  | 商户订单号                                                 |
| orderNo              | string  | 系统订单号                                                 |
| transactionReference | string  | 交易凭证(UTR/UPI等)                                        |
| payType              | string  | 支付方式                                                   |
| status               | int     | 订单状态(0=成功/1=失败/2和3=待支付/99=退款,支付成功后退款) |
| coinUnit             | string  | 币种                                                       |
| amount               | string  | 金额                                                       |
| completedTime        | int(13) | 完成时间戳(毫秒)，完成后才有值，默认null                   |
| createTime           | int(13) | 创建时间搓(毫秒)                                           |
| sign                 | string  | 签名                                                       |

##### 简要描述

- 当订单完成，根据订单参数{notifyUrl}，将通知此地址，请确保notifyUrl外网可进行访问
- 收到请求后请返回字符串"SUCCESS"，代表通知成功，否则将每分钟重复进行通知，最多通知6次

##### 注意事项

- <span style="color:red">收到通知需做幂等性处理，判断订单状态，防止重复执行。返回 SUCCESS 则不再通知。</span>
- <span style="color:red">回调通知字段可能会在后续版本中扩展，请勿将字段参与签名逻辑写死，以免新增字段导致验签失败</span>

##### 请求URL

- ` 由商户提供，订单参数{notifyUrl}`

##### 请求方式

- **Method**: POST
- **Content-Type**: ["application/json"]

##### 参数

| 参数名               | 必选 | 类型       | 说明                                                       | 示例值                           |
| :------------------- | :--- | :--------- | ---------------------------------------------------------- | -------------------------------- |
| merchantNo           | 是   | string     | 商户号(商户后台获取)                                       | Mer20250502001                   |
| merchantOrderNo      | 是   | string(64) | 商户订单号                                                 | 20260123112515                   |
| orderNo              | 是   | string(64) | 系统订单号                                                 | 20260123112516001P               |
| transactionReference | 否   | string     | 交易凭证(UTR/UPI等)                                        |                                  |
| payType              | 是   | string     | 支付类型                                                   | EASYPAISA                        |
| status               | 是   | int        | 订单状态(0=成功/1=失败/2和3=待支付/99=退款,支付成功后退款) | 0                                |
| coinUnit             | 是   | string     | 币种                                                       | PKR                              |
| amount               | 是   | string     | 金额                                                       | 100                              |
| productTitle         | 是   | string     | 商品标题                                                   | 测试                             |
| completedTime        | 否   | int(13)    | 完成时间戳(毫秒)                                           | null                             |
| createTime           | 是   | int(13)    | 创建时间戳(毫秒)                                           | 1769138717000                    |
| sign                 | 是   | string     | 签名(大写)                                                 | CF609F5B94C995E70625A9A62135ECCF |

##### 请求示例

```
{
    "merchantNo": "NG26020744015",
    "merchantOrderNo": "20260207154500",
    "orderNo": "20260207154501001P",
    "transactionReference": null,
    "payType": "JAZZ_CASH",
    "status": 0,
    "coinUnit": "PKR",
    "amount": "10000",
    "productTitle": "测试",
    "completedTime": null,
    "createTime": 1770450302000,
    "sign": "A21CBCA744B55CBC05BECA39FF2DC524"
}
```

##### 返回示例

```
SUCCESS
```

##### 印度：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| INR                       | 印度                      |

##### 巴基斯坦：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| PKR                       | 巴基斯坦                  |

##### 越南：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| VND                       | 越南盾                    |

##### 印尼：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| IDR                       | 印尼盾                    |

##### 巴西：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| BRL                       | 巴西雷亚尔                |

##### 菲律宾：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| PHP                       | 菲律宾比索                |

##### 阿根廷：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| ARS                       | 阿根廷比索                |

##### 墨西哥：一类

| <center>币种编码</center> | <center>币种名称</center> |
| :------------------------ | ------------------------- |
| MXN                       | 墨西哥比索                |

# 支付类型(payType)

| 编码               | 名称                | 币种 | 扩展参数                                                                  | 示例                          |
| :----------------- | :------------------ | :--- | :------------------------------------------------------------------------ | :---------------------------- |
| JAZZ_CASH          | JazzCash            | PKR  | - mobile(选填,建议上传可提高成功率):03开头11位手机号码                    |                               |
| EASYPAISA          | Easypaisa           | PKR  | - mobile(选填,建议上传可提高成功率):03开头11位手机号码                    |                               |
| JAZZ_CASH_QR       | JazzCash扫码        | PKR  |                                                                           |                               |
| EASYPAISA_QR       | Easypaisa扫码       | PKR  |                                                                           |                               |
| JAZZ_CASH_TRANSFER | JazzCash转账        | PKR  |                                                                           |                               |
| JAZZ_CASH_DIRECT   | JazzCash直连        | PKR  | - mobile(必填):03开头11位手机号码                                         | {"mobile":"03123456789"}      |
| EASYPAISA_DIRECT   | Easypaisa直连       | PKR  | - mobile(必填):03开头11位手机号码                                         | {"mobile":"03123456789"}      |
| ONLINE_BANKING     | 网银扫码            | VND  |                                                                           |                               |
| UPI_INRO           | 印度UPI原生         | INR  |                                                                           |                               |
| UPI_DIRECT         | 印度UPI唤醒         | INR  |                                                                           |                               |
| UPI_SCAN           | 印度UPI扫码         | INR  |                                                                           |                               |
| DANA               | 印尼DANA钱包        | IDR  |                                                                           |                               |
| QRIS               | 印尼QRIS电子钱包    | IDR  |                                                                           |                               |
| ONLINE_BANKING     | 印尼网银            | IDR  | - bankCode(必填):银行编码                                                 | {"bankCode":"IDRBANK001"}     |
| PIX                | 巴西PIX即时支付     | BRL  | - CPF(选填):个人税号<br/> - mobile(选填):手机号码<br/> - email(选填):邮箱 |                               |
| CARD               | 银行卡(Visa/Master) | CLP  |                                                                           |                               |
| WALLET             | 智利钱包            | CLP  |                                                                           |                               |
| BANK               | 智利银行转账        | CLP  |                                                                           |                               |
| GCASH              | GCash原生           | PHP  |                                                                           |                               |
| MAYA               | MAYA                | PHP  |                                                                           |                               |
| CVU                | CVU转账             | ARS  | - documentNumber(必填):阿根廷证件号，支持8位DNI或11位CUIT，暂不支持CUIL   | {"documentNumber":"12345678"} |
| CASH               | 现金（Pay Cash）    | MXN  |                                                                           |                               |
| OXXO_DIRECT        | OXXO直连            | MXN  |                                                                           |                               |
| SPEI_DIRECT        | SPEI直连            | MXN  |                                                                           |                               |
| CODI               | CODI扫码            | MXN  |                                                                           |                               |
| SPEI               | SPEI                | MXN  |                                                                           |                               |
| OXXO               | OXXO                | MXN  |                                                                           |                               |

- 备注：无

# 代付类型(payType)

| 编码      | 名称              | 币种 | 扩展参数                                                                                                                                          | 示例                     |
| :-------- | :---------------- | :--- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------- |
| JAZZ_CASH | JazzCash          | PKR  | - mobile(选填,与出款账号一致):03开头11位手机号码                                                                                                  |                          |
| EASYPAISA | Easypaisa         | PKR  | - mobile(选填,与出款账号一致):03开头11位手机号码                                                                                                  |                          |
| BANK      | 巴基斯坦银行      | PKR  | - mobile(必填):03开头11位手机号码                                                                                                                 | {"mobile":"03123456789"} |
| BANK      | 越南银行          | VND  |                                                                                                                                                   |                          |
| IMPS      | IMPS银行卡转账    | INR  |                                                                                                                                                   |                          |
| UPI       | 印度UPI转账       | INR  |                                                                                                                                                   |                          |
| BANK      | 印度银行          | IDR  |                                                                                                                                                   |                          |
| OVO       | 印尼OVO电子钱包   | IDR  |                                                                                                                                                   |                          |
| DANA      | 印尼DANA钱包      | IDR  |                                                                                                                                                   |                          |
| LINKAJA   | 印尼LINKAJA钱包   | IDR  |                                                                                                                                                   |                          |
| SHOPEEPAY | 印尼SHOPEEPAY钱包 | IDR  |                                                                                                                                                   |                          |
| GOPAY     | 印尼GOPAY钱包     | IDR  |                                                                                                                                                   |                          |
| PIX       | 巴西PIX即时支付   | BRL  | - CPF(必填):个人税号<br/>- mobile(选填):手机号码<br/> - email(选填):邮箱                                                                          |                          |
| BANK      | 智利银行转账      | CLP  | - accountType(必填):账户类型<br/>- documentType(必填):证件类型<br/>- documentId(必填):证件号码<br/>- mobile(必填):手机号码<br/>- email(必填):邮箱 |                          |
| GCASH     | GCash原生         | PHP  |                                                                                                                                                   |                          |
| MAYA      | MAYA              | PHP  |                                                                                                                                                   |                          |
| BANK      | 菲律宾银行        | PHP  |                                                                                                                                                   |                          |
| CVU       | CVU转账           | ARS  |                                                                                                                                                   |                          |
| CBU       | CBU转账           | ARS  |                                                                                                                                                   |                          |
| BANK      | 墨西哥银行转账    | MXN  | - bankCode(必填):银行编码<br>- 收款账号支持16位银行卡号或18位CLABE                                                                                |                          |

# 账户类型(accountType) - 智利CLP

| 编码  | 描述                |
| :---- | :------------------ |
| CA    | 活期账户            |
| DE    | 储蓄账户            |
| VISTA | 借记账户            |
| RUT   | BancoEstado RUT账户 |
| SA    | 工资账户            |

# 证件类型(documentType) - 智利CLP

| 编码 | 描述         |
| :--- | :----------- |
| RUT  | 智利税号     |
| CE   | 外国人居留卡 |
| PASS | 护照         |

```java
package com.demo;

import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.TypeReference;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.ObjectUtils;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * NGPay java示例
 * 接口文档(中文)： https://www.showdoc.com.cn/2598849309982183 密码：ngpay
 *
 * @author ngpay
 * @version 1.0.0
 * @update_date 2024-12-01
 */
public class NgpayApiDemo {


    // 不参与签名字段
    private static final String[] NOT_SIGN_KEY = new String[]{"sign"};

    // ========================================== 请更换正式环境 ==========================================

    // 商户号 TODO 请更换正式商户
    private static final String MERCHANT_NO = "";
    // 商户秘钥 TODO 请更换正式商户
    private static final String API_KEY = "";
    // 产品编号 TODO 请联系客服获取
    private static final String PRODUCT_NO = "";

    // {请联系官方人员获取正式环境地址}
    private static final String REQ_URL = "";
    // 代收/支付请求地址
    private static final String PAY_URL = REQ_URL + "/api/pay";
    // 代收查询地址
    private static final String PAY_QUERY_URL = REQ_URL + "/api/pay/query";

    // 代付/提现请求地址
    private static final String REMIT_URL = REQ_URL + "/api/remit";
    // 代付查询地址
    private static final String REMIT_QUERY_URL = REQ_URL + "/api/remit/query";
    // 余额查询地址
    private static final String BALANCE_QUERY_URL = REQ_URL + "/api/balance/query";


    public static void main(String[] args) throws InterruptedException {
//        pay();// 支付
//        remit();// 下发
//        payQuery();// 支付查询
//        remitQuery();// 下发查询
//        balanceQuery();// 余额查询
    }


    /**
     * 支付接口、充值接口、会员充值、会员支付
     */
    public static void pay() {
        Map<String, String> params = new TreeMap<>();
        // 时间戳【必填】
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        // 商户号【必填】
        params.put("merchantNo", MERCHANT_NO);

        // 产品编号【必填】
        params.put("productNo", PRODUCT_NO);
        // 金额【必填】
        params.put("amount", "1000");
        // 商户订单号【必填】
        params.put("merchantOrderNo", String.valueOf(System.currentTimeMillis()));
        // 币种【必填】
        params.put("coinUnit", "PKR");
        // 支付类型【必填】
        params.put("payType", "JAZZ_CASH");
        // 商户标题【必填】
        params.put("productTitle", "测试");
        // 通知地址【必填】
        params.put("notifyUrl", "http://127.0.0.1/api/callback");
        // 回显地址【选填】
        params.put("viewUrl", "");
        // 客户端ip【必填】
        params.put("clientIp", "48.251.156.230");
        // 扩展参数【选填】
        JSONObject extend = new JSONObject();
        extend.put("email", "test@gmail.com");
        extend.put("mobile", "03154517111");
        params.put("extend", extend.toJSONString());

        // 签名
        String signContent = getSignContent(params, API_KEY);
        System.out.println("待签名串：" + signContent);
        params.put("sign", MD5Util.MD5(signContent));
        System.out.println("请求地址:" + PAY_URL);
        String body = JSONObject.toJSONString(params);
        System.out.println("请求数据:" + body);
        String result = HttpUtil.postJson(PAY_URL, body);
        System.out.println("请求返回:" + result);
        JSONObject resultJson = JSONObject.parseObject(result);
        if (resultJson.getInteger("code") != 200) {
            System.err.println("请求失败，原因：" + resultJson.getString("msg"));
            return;
        }
        JSONObject dataJson = resultJson.getJSONObject("data");
        String resSign = (String) dataJson.remove("sign");
        String checkSignContent = getSignContent(dataJson, API_KEY);
        System.out.println("待验签签名串：" + checkSignContent);
        String checkSign = MD5Util.MD5(checkSignContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, checkSignContent);
            return;
        }
        System.out.println("ngpay平台订单号：" + dataJson.getString("orderNo") + "，支付链接：" + dataJson.getString("payUrl"));
    }

    /**
     * 下发接口、代付接口、会员提现
     */
    public static void remit() {
        Map<String, String> params = new TreeMap<>();
        // 时间戳【必填】
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        // 商户号【必填】
        params.put("merchantNo", MERCHANT_NO);

        // 产品编号【必填】
        params.put("productNo", PRODUCT_NO);
        // 金额【必填】
        params.put("amount", "200");
        // 商户订单号【必填】
        params.put("merchantOrderNo", String.valueOf(System.currentTimeMillis()));
        // 币种【必填】
        params.put("coinUnit", "PKR");
        // 支付类型【必填】
        params.put("payType", "BANK");
        // 银行编码【必填】
        params.put("bankCode", "HABBPKKA");
        // 通知地址【必填】
        params.put("notifyUrl", "https://127.0.0.1/notify");
        // 银行账号【必填】
        params.put("bankAccountNo", "6982729306714123151");
        // 银行账号名字【必填】英文逗号分隔firstName,lastName
        params.put("bankAccountName", "USAMA IQBAL");
        // 扩展参数【选填】
        JSONObject extend = new JSONObject();
        extend.put("email", "test@gmail.com");
        extend.put("mobile", "0344404086");
        params.put("extend", extend.toJSONString());

        // 签名
        String signContent = getSignContent(params, API_KEY);
        System.out.println("待签名串：" + signContent);
        params.put("sign", MD5Util.MD5(signContent));
        System.out.println("请求地址:" + PAY_URL);
        String body = JSONObject.toJSONString(params);
        System.out.println("请求数据:" + body);
        String result = HttpUtil.postJson(REMIT_URL, body);
        System.out.println("请求返回:" + result);
        JSONObject resultJson = JSONObject.parseObject(result);
        if (resultJson.getInteger("code") != 200) {
            System.err.println("请求失败，原因：" + resultJson.getString("msg"));
            return;
        }
        JSONObject dataJson = resultJson.getJSONObject("data");
        String resSign = (String) dataJson.remove("sign");
        String checkSignContent = getSignContent(dataJson, API_KEY);
        System.out.println("待验签签名串：" + checkSignContent);
        String checkSign = MD5Util.MD5(checkSignContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, checkSignContent);
            return;
        }
        System.out.println("ngpay平台订单号：" + dataJson.getString("orderNo"));
    }

    /**
     * 支付查询
     */
    public static void payQuery() {
        Map<String, String> params = new TreeMap<>();
        // 时间戳【必填】
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        // 商户号【必填】
        params.put("merchantNo", MERCHANT_NO);

        // 商户订单号【orderNo必填其中一项】
        params.put("merchantOrderNo", "20260207154500");
        // 系统订单号【merchantOrderNo必填其中一项】
        params.put("orderNo", "");


        // 签名
        String signContent = getSignContent(params, API_KEY);
        System.out.println("待签名串：" + signContent);
        params.put("sign", MD5Util.MD5(signContent));
        System.out.println("请求地址:" + PAY_QUERY_URL);
        String body = JSONObject.toJSONString(params);
        System.out.println("请求数据:" + body);
        String result = HttpUtil.postJson(PAY_QUERY_URL, body);
        System.out.println("请求返回:" + result);
        JSONObject resultJson = JSONObject.parseObject(result);
        if (resultJson.getInteger("code") != 200) {
            System.err.println("请求失败，原因：" + resultJson.getString("msg"));
            return;
        }
        JSONObject dataJson = resultJson.getJSONObject("data");
        String resSign = (String) dataJson.remove("sign");
        String checkSignContent = getSignContent(dataJson, API_KEY);
        System.out.println("待验签签名串：" + signContent);
        String checkSign = MD5Util.MD5(checkSignContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, checkSignContent);
            return;
        }
        // 订单状态(0=成功/1=失败/2和3=待支付/99=退款,支付成功后退款)
        Integer status = dataJson.getInteger("status");
        if (status == 0) {
            System.out.println("支付成功,完成时间：" + timestampToStr(ZoneId.of("Asia/Shanghai"), dataJson.getLongValue("completedTime"), "yyyy-MM-dd HH:mm:ss"));
        }
    }

    /**
     * 下发查询
     */
    public static void remitQuery() {
        Map<String, String> params = new TreeMap<>();
        // 时间戳【必填】
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        // 商户号【必填】
        params.put("merchantNo", MERCHANT_NO);

        // 商户订单号【orderNo必填其中一项】
        params.put("merchantOrderNo", "20260207154500");
        // 系统订单号【merchantOrderNo必填其中一项】
        params.put("orderNo", "");


        // 签名
        String signContent = getSignContent(params, API_KEY);
        System.out.println("待签名串：" + signContent);
        params.put("sign", MD5Util.MD5(signContent));
        System.out.println("请求地址:" + REMIT_QUERY_URL);
        String body = JSONObject.toJSONString(params);
        System.out.println("请求数据:" + body);
        String result = HttpUtil.postJson(REMIT_QUERY_URL, body);
        System.out.println("请求返回:" + result);
        JSONObject resultJson = JSONObject.parseObject(result);
        if (resultJson.getInteger("code") != 200) {
            System.err.println("请求失败，原因：" + resultJson.getString("msg"));
            return;
        }
        JSONObject dataJson = resultJson.getJSONObject("data");
        String resSign = (String) dataJson.remove("sign");
        String checkSignContent = getSignContent(dataJson, API_KEY);
        System.out.println("待验签签名串：" + signContent);
        String checkSign = MD5Util.MD5(checkSignContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, checkSignContent);
            return;
        }
        // 订单状态(0=成功,1=失败,2和3或其他状态=处理中,99=已退款)
        Integer status = dataJson.getInteger("status");
        if (status == 0) {
            System.out.println("代付成功,完成时间：" + timestampToStr(ZoneId.of("Asia/Shanghai"), dataJson.getLongValue("completedTime"), "yyyy-MM-dd HH:mm:ss"));
        }
    }


    /**
     * 余额查询
     */
    public static void balanceQuery() {
        Map<String, String> params = new TreeMap<>();
        // 时间戳【必填】
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        // 商户号【必填】
        params.put("merchantNo", MERCHANT_NO);
        // 币种
        params.put("coinUnit", "PKR");

        // 签名
        String signContent = getSignContent(params, API_KEY);
        System.out.println("待签名串：" + signContent);
        params.put("sign", MD5Util.MD5(signContent));
        System.out.println("请求地址:" + BALANCE_QUERY_URL);
        String body = JSONObject.toJSONString(params);
        System.out.println("请求数据:" + body);
        String result = HttpUtil.postJson(BALANCE_QUERY_URL, body);
        System.out.println("请求返回:" + result);
        JSONObject resultJson = JSONObject.parseObject(result);
        if (resultJson.getInteger("code") != 200) {
            System.err.println("请求失败，原因：" + resultJson.getString("msg"));
            return;
        }
        JSONObject dataJson = resultJson.getJSONObject("data");
        String resSign = (String) dataJson.remove("sign");
        String checkSignContent = getSignContent(dataJson, API_KEY);
        System.out.println("待验签签名串：" + signContent);
        String checkSign = MD5Util.MD5(checkSignContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, checkSignContent);
            return;
        }
        System.out.println("余额：" + dataJson.getBigDecimal("balance"));
        System.out.println("总余额：" + dataJson.getBigDecimal("totalBalance"));
    }

    /**
     * 获取签名内容 空值和sign不参与签名
     * 参数字段按照Ascii码方式进行升序排序
     * 用=符号连接参数名和参数值，用&符号连接各参数
     * key1=value1&key2=value2&key=apiKey
     *
     * @param object
     * @param apiKey
     * @return
     */
    public static String getSignContent(Object object, String apiKey) {
        Map<String, Object> dataMap;
        if (object instanceof String) {
            dataMap = JSONObject.parseObject((String) object, new TypeReference<TreeMap<String, Object>>() {
            });
        } else if (object instanceof TreeMap) {
            dataMap = (Map<String, Object>) object;
        } else if (object instanceof JSONObject) {
            dataMap = ((JSONObject) object).toJavaObject(new TypeReference<TreeMap<String, Object>>() {
            });
        } else {
            dataMap = JSONObject.parseObject(JSONObject.toJSONString(object), new TypeReference<TreeMap<String, Object>>() {
            });
        }
        // 排除空内容 不参与签名字段
        return dataMap.entrySet().stream()
                .filter(item -> ObjectUtils.isNotEmpty(item.getValue()) && !StringUtils.equalsAny(item.getKey(), NOT_SIGN_KEY))
                .map(item -> item.getKey().concat(StringConstant.EQUALS).concat(String.valueOf(item.getValue())))
                .collect(Collectors.joining(StringConstant.AMPERSAND)) + "&key=" + apiKey;
    }

    /**
     * 时间戳转时间字符串
     *
     * @param zoneId    时区
     * @param timestamp 时间戳
     * @param format    格式
     * @return
     */
    public static String timestampToStr(ZoneId zoneId, long timestamp, String format) {
        ZonedDateTime zonedDateTime = Instant.ofEpochMilli(timestamp).atZone(zoneId);
        return zonedDateTime.format(DateTimeFormatter.ofPattern(format));
    }

    /**
     * 支付订单结果回调
     * 模拟controller 回调地址 接收参数
     * TODO 实际接收等请根据自行业务进行处理
     * application/x-www-form-urlencoded
     *
     * @param body 请求体
     * @return
     */
    // @PostMapping("/payCallback") 模拟接收回调数据
    public String payCallback(String body) {
        JSONObject bodyJson = JSONObject.parseObject(body);
        String resSign = (String) bodyJson.remove("sign");
        String signContent = getSignContent(bodyJson, API_KEY);
        System.out.println("待验签签名串：" + signContent);
        String checkSign = MD5Util.MD5(signContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, signContent);
            return "SIGN_ERROR";
        }
        // 订单状态(0=成功/1=失败/2和3=待支付/99=退款,支付成功后退款)
        Integer status = bodyJson.getInteger("status");
        // TODO 处理相应业务
        if (status == 0) {
            System.out.println("支付成功,完成时间：" + timestampToStr(ZoneId.of("Asia/Shanghai"), bodyJson.getLongValue("completedTime"), "yyyy-MM-dd HH:mm:ss"));
        }
        // TODO 务必返回success代表已接收处理成功
        return "SUCCESS";
    }

    /**
     * 下发订单结果回调
     * 模拟controller 回调地址 接收参数
     * TODO 实际接收等请根据自行业务进行处理
     * application/x-www-form-urlencoded
     *
     * @param body 请求体
     * @return
     */
    // @PostMapping("/remitCallback") 模拟接收回调数据
    public String remitCallback(String body) {
        JSONObject bodyJson = JSONObject.parseObject(body);
        String resSign = (String) bodyJson.remove("sign");
        String signContent = getSignContent(bodyJson, API_KEY);
        System.out.println("待验签签名串：" + signContent);
        String checkSign = MD5Util.MD5(signContent);
        if (!checkSign.equals(resSign)) {
            System.err.printf("验证签名失败,%s==%s,签名串:%s\n", checkSign, resSign, signContent);
            return "SIGN_ERROR";
        }
        // 订单状态(0=成功,1=失败,2和3或其他状态=处理中,99=已退款)
        Integer status = bodyJson.getInteger("status");
        // TODO 处理相应业务
        if (status == 0) {
            System.out.println("代付成功,完成时间：" + timestampToStr(ZoneId.of("Asia/Shanghai"), bodyJson.getLongValue("completedTime"), "yyyy-MM-dd HH:mm:ss"));
        }
        // TODO 务必返回success代表已接收处理成功
        return "SUCCESS";
    }

    /**
     * Http请求工具类
     * 这边使用spring提供的RestTemplate进行http请求，只是简单示例避免引入额外jar包
     * 可替换熟悉的http框架，例如Okhttp、HttpClient
     */
    static class HttpUtil {

        private static RestTemplate restTemplate = null;

        static {
            // 设置连接超时时间、读取超时时间
            SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
            requestFactory.setConnectTimeout(30000);
            requestFactory.setReadTimeout(30000);
            // 如使用okhttp可直接替换 new RestTemplate(new OkHttp3ClientHttpRequestFactory());
            restTemplate = new RestTemplate(requestFactory);
            restTemplate.getMessageConverters().set(1, new StringHttpMessageConverter(StandardCharsets.UTF_8));
        }


        /**
         * post json请求
         *
         * @param url 请求url
         * @return
         */
        public static String postJson(String url, String params) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> requestEntity = new HttpEntity<>(params, headers);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, requestEntity, String.class);
            return response.getBody();
        }

    }

    /**
     * MD5加密工具
     */
    static class MD5Util {

        /**
         * 16进制
         */
        private static final char[] HEX_DIGITS = {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'};

        /**
         * MD5签名方法 默认utf-8
         *
         * @param s 加密数据
         * @return
         */
        public static String MD5(String s) {
            return MD5(s, StandardCharsets.UTF_8.name());
        }

        /**
         * MD5签名方法
         *
         * @param s        加密数据
         * @param encoding 编码
         * @return
         */
        public static String MD5(String s, String encoding) {
            try {
                byte[] btInput = s.getBytes(encoding);
                // 获得MD5摘要算法的 MessageDigest 对象
                MessageDigest mdInst = MessageDigest.getInstance("MD5");
                // 使用指定的字节更新摘要
                mdInst.update(btInput);
                // 获得密文
                byte[] md = mdInst.digest();
                // 把密文转换成十六进制的字符串形式
                int j = md.length;
                char[] str = new char[j * 2];
                int k = 0;
                for (byte byte0 : md) {
                    str[k++] = HEX_DIGITS[byte0 >>> 4 & 0xf];
                    str[k++] = HEX_DIGITS[byte0 & 0xf];
                }
                return new String(str);
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }
    }
}

```
