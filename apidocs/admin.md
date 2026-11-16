# RRPay Backend — Admin API Documentation

Base URL: `{BASE_URL}` — e.g. `http://localhost:4000` (local) / your deployed backend origin.

---

## Overview

This document covers the **complete Admin API** of the RRPay backend, including:

1. **Admin Authentication** — register, login, JWT usage (`src/routes/adminAuth.js`, `src/controllers/adminAuthController.js`, `src/middleware/requireAdmin.js`)
2. **Admin Group Management** — list groups, update groups (`src/routes/admin.js`, `src/controllers/adminGroupController.js`)

- Base path: `/admin`
- Protected endpoints require an **admin JWT** obtained from `POST /admin/auth/login`.
- Token must be sent as: `Authorization: Bearer <token>`
- Guarded by the `requireAdmin` middleware.

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

List all payment groups.

**Auth:** Required (Bearer token)

**Request**

- Method: `GET`
- URL: `/admin/groups`

**Response — 200 OK**

```json
{
  "success": true,
  "count": 1,
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

## Summary of Admin Endpoints

| Method   | URL                        | Auth | Description                 |
| :------- | :------------------------- | :--- | :-------------------------- |
| POST     | `/admin/auth/register`    | No   | Register a user account     |
| POST     | `/admin/auth/login`       | No   | Admin login → returns JWT  |
| GET      | `/admin/groups`           | Yes  | List all groups            |
| PATCH    | `/admin/groups/:id`       | Yes  | Update a group             |

---

## See Also

- [RRPay API — Merchant/Payin](../apidocs/rrpayapidoc.md) — merchant payment API docs
