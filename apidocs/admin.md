# RRPay Backend — Admin API Documentation

Base URL: `{BASE_URL}` — e.g. `http://localhost:4000` (local) / your deployed backend origin.

---

## Overview

This document covers the **complete Admin API** of the RRPay backend, including:

1. **Admin Authentication** — register, login, JWT usage (`src/routes/adminAuth.js`, `src/controllers/adminAuthController.js`, `src/middleware/requireAdmin.js`)
2. **Admin Group Management** — list groups, update groups (`src/routes/admin.js`, `src/controllers/adminGroupController.js`)
3. **Admin Payin Management** — search/list payins, view details, approve payins (`src/routes/admin.js`, `src/controllers/adminPayinController.js`)

- Base path: `/admin`
- Protected endpoints require an **admin JWT** obtained from `POST /admin/auth/login`.
- Token must be sent as: `Authorization: Bearer <token>`
- Guarded by the `requireAdmin` middleware.

## Public utility endpoint

### `GET /ip`

Returns the backend's public egress IPv4 and IPv6 addresses as observed by external IP lookup services. No authentication is required.

**Response — 200 OK** (both lookups succeeded)

```json
{
  "success": true,
  "ipv4": "203.0.113.10",
  "ipv6": "2001:db8::1"
}
```

If either address family is unavailable, the endpoint returns `502` with the available address, `null` for the unavailable address, and an `errors` entry identifying the failed lookup.

---

## Admin Authentication API

### `POST /admin/auth/register`

Register a new account. New accounts are always created with the **`user`** role, so they **cannot log in** until promoted to `admin`. **Does not return a token.**

**Auth:** None (public)

**Request Body** (`Content-Type: application/json`)

| Parameter | Type   | Required | Remarks                                    |
| :-------- | :----- | :------- | :----------------------------------------- |
| mobile    | String | Yes      | Mobile number (unique, trimmed)            |
| password  | String | Yes      | Min 6 characters                          |

**Validation & Errors**

| Status | `success` | `msg`                                    |
| :----- | :-------- | :--------------------------------------- |
| 201    | true      | `Registered successfully`               |
| 400    | false     | `mobile and password are required`     |
| 400    | false     | `password must be at least 6 characters` |
| 409    | false     | `mobile already registered`             |

**Response — 201 Created**

```json
{
  "success": true,
  "msg": "Registered successfully",
  "admin": {
    "id": "507f1f77bcf86cd799439011",
    "mobile": "919876543210",
    "role": "user",
    "status": "active"
  }
}
```

> **Note:** Registration always creates a `user`. To grant admin access, promote the
> account's `role` to `admin` directly in the database (or via an admin provisioning
> script). `POST /admin/auth/login` rejects non-admin accounts with `403`.

---

### `POST /admin/auth/login`

Authenticate an admin and receive a JWT access token.

**Auth:** None (public)

**Request Body** (`Content-Type: application/json`)

| Parameter | Type   | Required | Remarks |
| :-------- | :----- | :------- | :------ |
| mobile    | String | Yes      | Admin mobile number |
| password  | String | Yes      | Admin password |

**Response — 200 OK**

```json
{
  "success": true,
  "msg": "Admin login successful",
  "token": "<JWT>",
  "admin": {
    "id": "507f1f77bcf86cd799439011",
    "mobile": "919876543210",
    "role": "admin",
    "status": "active"
  }
}
```

**Token Details**

| Item        | Value                                        |
| :---------- | :------------------------------------------- |
| Algorithm  | HS256 (JWT)                                  |
| Secret      | `process.env.JWT_SECRET` (fallback: `change_me_jwt_secret`) |
| Expiry      | `process.env.JWT_EXPIRES_IN` (fallback: `7d`) |
| Payload     | `{ userId: <adminId>, role: <adminRole> }` |

**Error Responses**

| Status | `success` | `msg`                                        |
| :----- | :-------- | :------------------------------------------- |
| 400    | false     | `mobile and password are required`          |
| 400    | false     | `Invalid credentials`                       |
| 403    | false     | `Access denied: not an admin`              |
| 403    | false     | `Access denied: account is <status>`      |
| 404    | false     | `Admin not found`                           |

---

### Using the Admin Token

All protected admin endpoints require the JWT in the **Bearer** format:

```
Authorization: Bearer <token>
```

If the token is missing / malformed → `401 Unauthorized`. If invalid / expired → `401 Unauthorized`. If the admin no longer exists, is not an `admin`, or is not `active` → `401` / `403` accordingly.

---

### Environment Variables (Admin Auth)

| Variable           | Default                   | Description                          |
| :----------------- | :------------------------ | :----------------------------------- |
| JWT_SECRET         | `change_me_jwt_secret`   | Secret used to sign the admin JWT   |
| JWT_EXPIRES_IN     | `7d`                      | JWT token expiry                    |

---

## Admin API — Group Management

### `GET /admin/groups`

List payment groups. Results are paginated by default.

**Auth:** Required (Bearer token)

**Request**

- Method: `GET`
- URL: `/admin/groups`

**Query Parameters** (all optional)

| Parameter | Type | Remarks |
| :-------- | :--- | :------ |
| uid | String | Exact group UID |
| groupId | Number | Exact Telegram/group ID |
| status | String | `active` \| `suspended` \| `banned` |
| includeTotal | Boolean | `true` (default): include `count` + `totalPages`. `false`: skip the count query (faster) — `count`/`totalPages` are omitted |
| page | Number | Page number (default: `1`) |
| limit | Number | Page size (default: `20`, max: `100`) |

**Response — 200 OK**

```json
{
  "success": true,
  "count": 1,
  "totalPages": 1,
  "hasMore": false,
  "page": 1,
  "limit": 20,
  "groups": [
    {
      "uid": "merchant-uid-123",
      "groupId": 1001,
      "groupName": "Payroll Group",
      "exchangeRate": null,
      "status": "active",
      "remark": "",
      "balance": "0",
      "createdAt": "2026-11-16T10:00:00.000Z",
      "updatedAt": "2026-11-16T10:00:00.000Z"
    }
  ]
}
```

**Response with `includeTotal=false` — 200 OK**

```json
{
  "success": true,
  "hasMore": true,
  "page": 1,
  "limit": 20,
  "groups": [ ... ]
}
```

> **Notes:**
> - Global search (`q` / `search`) and group-name prefix search are **not supported** — use the exact `uid`, `groupId`, or `status` filters.
> - `hasMore` is `true` when the current page is full (`groups.length === limit`), useful for "load more" pagination.
> - When `includeTotal=false`, `count` and `totalPages` are omitted from the response for speed.
**Group Fields**

| Field         | Type   | Remarks                                        |
| :------------ | :----- | :--------------------------------------------- |
| uid           | String | Merchant group UID (unique)                   |
| groupId      | Number | Merchant group ID (unique)                    |
| groupName    | String | Group display name                            |
| exchangeRate | Number \| null | Exchange rate applied to the group (`null` until set) |
| status       | String | `active` \| `suspended` \| `banned`          |
| remark       | String | Admin remark                                  |
| balance      | String | Decimal128 balance                             |
| createdAt / updatedAt | String | ISO timestamps                        |

---

### `PATCH /admin/groups/:id`

Update an existing payment group (status, remark, exchange rate, group name).

**Auth:** Required (Bearer token)

**Request**

- Method: `PATCH`
- URL: `/admin/groups/:id`

**Path Parameters**

| Parameter | Type   | Required | Remarks                                        |
| :-------- | :----- | :------- | :--------------------------------------------- |
| id        | String | Yes      | MongoDB `_id` of the group, or numeric `groupId` |

**Request Body** (`Content-Type: application/json`) — all fields optional

| Parameter     | Type   | Required | Remarks                                              |
| :------------ | :----- | :------- | :--------------------------------------------------- |
| status        | String | No        | `active` \| `suspended` \| `banned`                 |
| remark        | String | No*       | Required when changing `status`                     |
| exchangeRate  | Number | No        | Must be a finite number > 0                         |
| groupName     | String | No        | New group name                                       |

\* `remark` is required when `status` is being changed.

**Validation & Errors**

| Status | `success` | `msg`                                        |
| :----- | :-------- | :------------------------------------------- |
| 200    | true      | `Group updated`                             |
| 400    | false     | `Invalid status`                             |
| 400    | false     | `Remark is required when changing status`   |
| 400    | false     | `Invalid exchangeRate`                       |
| 404    | false     | `Group not found`                            |

**Response — 200 OK**

```json
{
  "success": true,
  "msg": "Group updated",
  "group": { }
}
```

---

## Admin API — Payin Management

### `GET /admin/payins`

Search and list payins with filters and pagination.

**Auth:** Required (Bearer token)

**Query Parameters** (all optional)

| Parameter | Type | Remarks |
| :-------- | :--- | :------ |
| groupId | Number | Filter by Telegram/group ID |
| orderId / payOrderNo | String | Filter by pay order number |
| outTradeNo | String | Filter by merchant out trade number |
| uid | String | Filter by group UID |
| amount | String | Filter by exact amount (`deeplinkAmount` or `totalAmount`) |
| status | String | `pending` \| `success` \| `failed` \| `expired` |
| payState | String | Provider pay state code |
| currencyCode | String | Currency code |
| payType | String | Payment type |
| merNo | String | Merchant number filter (filter only — `merNo` is not returned in results) |
| createdFrom / from | Date/String | Created at >= value (`YYYY-MM-DD` or ISO datetime) |
| createdTo / to | Date/String | Created at <= value (`YYYY-MM-DD` treated as end-of-day) |
| updatedFrom | Date/String | Updated at >= value |
| updatedTo | Date/String | Updated at <= value |
| includeTotal | Boolean | `true` (default): include `total` + `totalPages`. `false`: skip the count query (faster) — `total`/`totalPages` are omitted |
| page | Number | Page number (default: `1`) |
| limit | Number | Page size (default: `20`, max: `200`) |

**Response — 200 OK**

```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1,
  "hasMore": false,
  "payins": [
    {
      "_id": "664f1f77bcf86cd799439011",
      "payOrderNo": "OR16112026000066794",
      "outTradeNo": "PI2611161303134809",
      "uid": "49526",
      "groupId": -5526650022,
      "upiId": "merchant@bank",
      "totalAmount": "100.00",
      "deeplinkAmount": "100.00",
      "currencyCode": "INR",
      "payType": "UPI",
      "status": "pending",
      "payState": null,
      "payURL": "https://...",
      "utrCode": null,
      "paidAt": null,
      "createdAt": "2026-11-16T10:00:00.000Z",
      "updatedAt": "2026-11-16T10:00:00.000Z",
      "group": {
        "groupId": -5526650022,
        "groupName": "test"
      }
    }
  ]
}
```

**Response with `includeTotal=false` — 200 OK**

```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "hasMore": true,
  "payins": [ ... ]
}
```

**Payin Fields Returned in Search Results**

| Field | Type | Remarks |
| :---- | :--- | :------ |
| _id | String | MongoDB `_id` of the payin |
| payOrderNo | String | Our system's payment order number: `OR` + `ddmmyyyy` + 9-digit time-of-day seconds (e.g. `OR16112026000066794`) |
| outTradeNo | String | Merchant's own order/reference number |
| uid | String | Group UID |
| groupId | Number | Telegram/group ID |
| upiId | String \| null | Extracted UPI/VPA |
| totalAmount | String (Decimal128) | Payin amount |
| deeplinkAmount | String \| null | Amount from deeplink/QR |
| currencyCode | String | Currency code |
| payType | String | Payment type |
| status | String | `pending` \| `success` \| `failed` \| `expired` |
| payState | String \| null | Provider pay state code |
| payURL | String | Pay URL |
| utrCode | String \| null | UTR/reference code |
| paidAt | String \| null | Paid timestamp |
| createdAt / updatedAt | String | ISO timestamps |
| group | Object \| null | Populated group summary: `{ groupId, groupName }` only |

> **Notes:**
> - `merNo` is **not** returned in payin search results (it remains available as a filter).
> - The nested `group` object returns **only** `groupId` and `groupName` (no `_id`, `uid`, `status`, or `exchangeRate`).
> - Heavy/internal fields such as `rawRequest`, `rawResponse`, `notifyUrl`, and `payViewUrl` are **not** included in search results.
> - `hasMore` is `true` when the current page is full (`payins.length === limit`), useful for "load more" pagination.
> - When `includeTotal=false`, `total` and `totalPages` are omitted from the response for speed.

---

### `GET /admin/payins/:id`

Get a single payin by MongoDB `_id` or `payOrderNo`.

**Auth:** Required (Bearer token)

**Path Parameters**

| Parameter | Type | Remarks |
| :-------- | :--- | :------ |
| id | String | MongoDB `_id` or `payOrderNo` |

**Response — 200 OK**

```json
{
  "success": true,
  "payin": {
    "_id": "664f1f77bcf86cd799439011",
    "payOrderNo": "OR16112026000066794",
    "merchant": "664e...",
    "outTradeNo": "PI2611161303134809",
    "currencyCode": "INR",
    "payType": "UPI",
    "randomNo": "…",
    "totalAmount": "100.00",
    "notifyUrl": "https://merchant.example/notify",
    "payViewUrl": null,
    "payCardNo": "…",
    "payBankCode": "…",
    "payName": "…",
    "payEmail": "…",
    "payPhone": "…",
    "payIp": "…",
    "payURL": "https://...",
    "group": {
      "uid": "49526",
      "groupId": -5526650022,
      "groupName": "test",
      "status": "active",
      "exchangeRate": null,
      "balance": "0"
    },
    "groupId": -5526650022,
    "uid": "49526",
    "payParams": null,
    "upiId": "merchant@bank",
    "deeplinkAmount": "100.00",
    "telegramChatId": -5526650022,
    "telegramMessageId": null,
    "depositExpiresAt": null,
    "depositMessageStatus": null,
    "status": "pending",
    "payState": null,
    "paidAt": null,
    "utrCode": null,
    "createdAt": "2026-11-16T10:00:00.000Z",
    "updatedAt": "2026-11-16T10:00:00.000Z"
  }
}
```

**Field Notes**

| Field | Remarks |
| :---- | :------ |
| merNo | **Not returned** (removed from admin responses) |
| rawRequest / rawResponse | **Not returned** (heavy internal provider payloads excluded) |
| group | Populated summary: `uid`, `groupId`, `groupName`, `status`, `exchangeRate`, `balance` — group `_id` is not returned |

**Errors**

| Status | `success` | `msg` |
| :----- | :-------- | :---- |
| 404 | false | `Payin not found` |

---

### `PATCH /admin/payins/:id/approve`

Manually approve a payin (admin action). Sets status to `success`, sets `paidAt` if missing, stores `utrCode` if provided, and credits the linked group's balance/transaction once (idempotent). Double/concurrent approvals are safe: only one request performs the approval and credit.

**Auth:** Required (Bearer token)

**Path Parameters**

| Parameter | Type | Remarks |
| :-------- | :--- | :------ |
| id | String | MongoDB `_id` or `payOrderNo` |

**Request Body** (`Content-Type: application/json`) — optional

| Parameter | Type | Required | Remarks |
| :-------- | :--- | :------- | :------ |
| utrCode | String | No | UTR/reference code to store on approval |

**Response — 200 OK**

```json
{
  "success": true,
  "msg": "Payin approved",
  "payin": {
    "_id": "664f1f77bcf86cd799439011",
    "payOrderNo": "OR16112026000066794",
    "status": "success",
    "payState": "0000",
    "paidAt": "2026-11-16T10:05:00.000Z",
    "utrCode": "UTR123456789",
    "group": {
      "uid": "49526",
      "groupId": -5526650022,
      "groupName": "test",
      "status": "active",
      "exchangeRate": null,
      "balance": "100.00"
    }
  }
}
```

If already successful:

```json
{
  "success": true,
  "msg": "Payin already approved",
  "payin": { }
}
```

**Notes**
- `merNo`, `rawRequest`, and `rawResponse` are **not** returned in the approve response (same rules as detail).
- The group balance and credit transaction are applied **once** per payin.
- If the post-approval bot notification fails, the approval still succeeds (error is logged only).

**Errors**

| Status | `success` | `msg` |
| :----- | :-------- | :---- |
| 404 | false | `Payin not found` |

---

## Admin API — Transaction Search

### `GET /admin/transactions`

Search a group/user's transaction ledger by UID / group ID with date filters and pagination.

**Auth:** Required (Bearer token)

**Query Parameters** (all optional)

| Parameter | Type | Remarks |
| :-------- | :--- | :------ |
| uid | String | Exact group UID |
| groupId | Number | Exact Telegram/group ID |
| type | String | `credit` \| `debit` |
| coType | String | `payin` \| `payout` \| `bonus` \| `adjustment` \| `other` |
| payin | String | MongoDB `_id` of a payin |
| date | Date/String | Single day filter (`YYYY-MM-DD`), applied to `createdAt` |
| createdFrom / from | Date/String | Created at >= value (`YYYY-MM-DD` or ISO datetime) |
| createdTo / to | Date/String | Created at <= value (`YYYY-MM-DD` treated as end-of-day) |
| amountFrom / minAmount | Number/String | Minimum amount (inclusive) |
| amountTo / maxAmount | Number/String | Maximum amount (inclusive) |
| includeTotal | Boolean | `true` (default): include `total` + `totalPages`. `false`: skip the count query (faster) |
| page | Number | Page number (default: `1`) |
| limit | Number | Page size (default: `20`, max: `200`) |

**Response — 200 OK**

```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1,
  "hasMore": false,
  "transactions": [
    {
      "_id": "6650aabbccddeeff00112233",
      "uid": "49526",
      "groupId": -5526650022,
      "amount": "100.00",
      "type": "credit",
      "coType": "payin",
      "payin": {
        "_id": "664f1f77bcf86cd799439011",
        "payOrderNo": "OR16112026000066794",
        "status": "success"
      },
      "balanceAfter": "100.00",
      "remark": "Payin OR16112026000066794 approved",
      "createdAt": "2026-11-16T10:05:00.000Z",
      "updatedAt": "2026-11-16T10:05:00.000Z"
    }
  ]
}
```

**Response with `includeTotal=false` — 200 OK**

```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "hasMore": true,
  "transactions": [ ... ]
}
```

**Transaction Fields**

| Field | Type | Remarks |
| :---- | :--- | :------ |
| _id | String | MongoDB `_id` of the transaction |
| uid | String | Group UID |
| groupId | Number | Telegram/group ID |
| amount | String (Decimal128) | Transaction amount |
| type | String | `credit` \| `debit` |
| coType | String | `payin` \| `payout` \| `bonus` \| `adjustment` \| `other` |
| payin | Object \| null | Linked payin summary: `{ _id, payOrderNo, status }` |
| balanceAfter | String \| null | Group balance after this transaction (`null` for older records created before this field existed) |
| remark | String | Human-readable note (e.g. `Payin <payOrderNo> approved`) |
| createdAt / updatedAt | String | ISO timestamps |

> **Notes:**
> - Results are sorted newest first (`createdAt`, then `_id`).
> - `balanceAfter` is captured at transaction creation time; transactions created before this field was added may return `null`.
> - `hasMore` is `true` when the current page is full (`transactions.length === limit`).

---

### `POST /admin/transactions`

Manually create a `credit` or `debit` transaction for any group/user by UID. Updates the group balance atomically and records the ledger entry with the resulting balance.

**Auth:** Required (Bearer token)

**Request Body** (`Content-Type: application/json`)

| Parameter | Type | Required | Remarks |
| :-------- | :--- | :------- | :------ |
| uid | String | Yes | Group UID (must exist) |
| type | String | Yes | `credit` \| `debit` |
| amount | Number/String | Yes | Positive amount, up to 2 decimals (e.g. `100.50`) |
| remark | String | No | Note stored on the transaction (default: `Manual <type> by admin`) |

**Example Request**

```json
{
  "uid": "49526",
  "type": "credit",
  "amount": 100.5,
  "remark": "Manual bonus"
}
```

**Response — 201 Created**

```json
{
  "success": true,
  "msg": "Transaction credited",
  "group": {
    "uid": "49526",
    "groupId": -5526650022,
    "balance": "200.50"
  },
  "transaction": {
    "_id": "6650aabbccddeeff00112244",
    "uid": "49526",
    "groupId": -5526650022,
    "amount": "100.50",
    "type": "credit",
    "coType": "adjustment",
    "balanceAfter": "200.50",
    "remark": "Manual bonus",
    "createdAt": "2026-11-16T10:10:00.000Z",
    "updatedAt": "2026-11-16T10:10:00.000Z"
  }
}
```

**Behavior**
- `credit` adds the amount to the group balance.
- `debit` subtracts the amount; the debit is rejected if the balance is insufficient (no negative balance).
- The balance update is atomic, and the transaction stores `coType: "adjustment"` plus the `balanceAfter` snapshot.
- A **Telegram bot notification** is sent to the group chat (`groupId`) after the transaction is saved:
  ```
  Manual credit 🔻

  Type: CREDIT🔻
  Amount: ₹100.50
  Balance: ₹200.50
  Remark: Manual bonus
  By: 919876543210
  ```
  (Use `Manual debit 🔺` / `DEBIT🔺` for debits.) If the bot is unavailable or sending fails, the transaction still succeeds — the failure is only logged.

**Errors**

| Status | `success` | `msg` |
| :----- | :-------- | :---- |
| 400 | false | `uid is required` |
| 400 | false | `type must be credit or debit` |
| 400 | false | `amount must be a positive number with up to 2 decimals` |
| 400 | false | `amount must be greater than 0` |
| 400 | false | `Insufficient balance for debit` |
| 404 | false | `Group not found` |

---

## Summary of Admin Endpoints

| Method   | URL                           | Auth | Description                                  |
| :------- | :---------------------------- | :--- | :------------------------------------------- |
| POST     | `/admin/auth/register`       | No   | Register a user account                      |
| POST     | `/admin/auth/login`          | No   | Admin login → returns JWT                   |
| GET      | `/admin/groups`              | Yes  | List all groups                              |
| PATCH    | `/admin/groups/:id`          | Yes  | Update a group                               |
| GET      | `/admin/payins`              | Yes  | Search/list payins (filters + pagination)    |
| GET      | `/admin/payins/:id`          | Yes  | Get payin details                            |
| PATCH    | `/admin/payins/:id/approve`  | Yes  | Approve payin (admin action)                 |
| GET      | `/admin/transactions`        | Yes  | Search transactions by uid/groupId + dates   |
| POST     | `/admin/transactions`        | Yes  | Create manual credit/debit transaction       |

---

## See Also

- [RRPay API — Merchant/Payin](../apidocs/rrpayapidoc.md) — merchant payment API docs
