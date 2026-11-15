import { env } from '../config/env.js';
import { CURRENCIES } from '../config/paymentTypes.js';

// Example merchant comes from .env so Swagger matches the seeded merchant.
const exampleMerchantNo = env.merchantNo ?? 'RRPAY0000000001';

const payinRequired = [
  'merNo',
  'currencyCode',
  'payType',
  'randomNo',
  'outTradeNo',
  'totalAmount',
  'notifyUrl',
  'sign',
  'payCardNo',
  'payBankCode',
  'payName',
  'payEmail',
  'payPhone',
  'pay',
];

const payinProperties = {
  merNo: { type: 'string', maxLength: 32, example: exampleMerchantNo, description: 'Merchant ID' },
  currencyCode: {
    type: 'string',
    maxLength: 16,
    enum: Object.keys(CURRENCIES),
    example: 'INR',
  },
  payType: {
    type: 'string',
    maxLength: 16,
    example: 'INRT',
    description:
      'Must belong to currencyCode: INR -> INRO/INRT/SCAN, INRTWO -> SCANTWO, MXN -> MXN01, ' +
      'PKR -> Jazzcash/Easypaisa/Jazzcash_Direct/Easypaisa_Direct/Easypaisa_QR/Jazzcash_QR/Jazzcash_ZZ, ' +
      'VND -> BANKSCAN, IDR -> QR/DANA/VA, BDT -> NAGAD/BKASH/ROCKET/BANK, PHP -> GCASH, BRL -> PIX',
  },
  randomNo: { type: 'string', maxLength: 14, example: '12345678901234' },
  outTradeNo: {
    type: 'string',
    maxLength: 20,
    example: 'RRPAY-TEST-1001',
    description: 'Unique per merchant',
  },
  totalAmount: {
    type: 'string',
    maxLength: 9,
    pattern: '^\\d+(\\.\\d{1,2})?$',
    example: '150.00',
    description: 'Up to two decimals; normalized to two decimals',
  },
  notifyUrl: {
    type: 'string',
    format: 'uri',
    maxLength: 128,
    example: 'https://example.com/payin/notify',
  },
  sign: {
    type: 'string',
    maxLength: 32,
    example: '<paste sign from POST /payin/sign>',
    description:
      'Uppercase MD5 of (params sorted by ASCII, compact JSON) + merchant secret. ' +
      'In dev use POST /payin/sign to generate it.',
  },
  payCardNo: { type: 'string', maxLength: 32, example: '123456' },
  payBankCode: { type: 'string', maxLength: 32, example: 'PAY' },
  payName: { type: 'string', maxLength: 32, example: 'xiaoming' },
  payEmail: { type: 'string', format: 'email', maxLength: 32, example: 'xiaoming@email.com' },
  payPhone: {
    type: 'string',
    maxLength: 32,
    example: '+917123456789',
    description: 'INR/INRTWO require +91 + 10 digits (6-9 start); other currencies accept +<8-15 digits>',
  },
  payIp: {
    type: 'string',
    format: 'ipv4',
    maxLength: 32,
    example: '103.21.244.5',
    description: 'Payer IP. 0.0.0.0, 127.* and ::1 are rejected',
  },
  payViewUrl: {
    type: 'string',
    format: 'uri',
    maxLength: 128,
    example: 'https://example.com/pay/result',
    description: 'Optional redirect after payment',
  },
};

const payinExample = {
  merNo: exampleMerchantNo,
  currencyCode: 'INR',
  payType: 'INRT',
  randomNo: '12345678901234',
  outTradeNo: 'RRPAY-TEST-1001',
  totalAmount: '150.00',
  notifyUrl: 'https://example.com/payin/notify',
  payCardNo: '123456',
  payBankCode: 'PAY',
  payName: 'xiaoming',
  payEmail: 'xiaoming@email.com',
  payPhone: '+917123456789',
  payIp: '103.21.244.5',
  sign: '<paste sign from POST /payin/sign>',
};

const successExample = {
  resultCode: '0000',
  stateInfo: 'success',
  merNo: exampleMerchantNo,
  outTradeNo: 'RRPAY-TEST-1001',
  totalAmount: '150.00',
  payURL: 'https://api.rrpay.ai/pay/PI20261115000001',
  payOrderNo: 'PI20261115000001',
  sign: '7C1E2F...UPPERCASE_MD5',
};

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'RRPAY Gateway API',
    version: '1.0.0',
    description:
      'Merchant-facing deposit (payin) API.\n\n' +
      '**Signing rule:** drop `sign` and empty values, sort keys by ASCII, build a compact JSON string, ' +
      'append the merchant key directly, then MD5 and uppercase.\n\n' +
      '**Quick start:** `POST /payin/order` with only `{ "amount": "150.00" }`. The server generates ' +
      '`randomNo`, `outTradeNo` and `sign`, fills the remaining fields, calls RRPay and returns ' +
      "RRPay's exact response (same status code and body).\n\n" +
      '**Manual flow:** call `POST /payin/sign` with the request body (no sign), copy the `sign` into ' +
      '`POST /payin/create`, then execute.',
  },
  servers: [
    { url: 'https://rrpayback.onrender.com', description: 'Production (Render)' },
    { url: `http://localhost:${env.port}`, description: 'Local server' },
  ],
  tags: [
    { name: 'Payin', description: 'Deposit orders' },
    { name: 'Payin (dev)', description: 'Development helpers' },
    { name: 'Payment page', description: 'Hosted pay URL target' },
    { name: 'System' },
    { name: 'Admin', description: 'Admin authentication and group management' },
    { name: 'Groups', description: 'Group registration and lookup' },
  ],
  paths: {
    '/payin/create': {
      post: {
        tags: ['Payin'],
        summary: 'Create a deposit order',
        description:
          'Validates the merchant, signature and parameters, stores a pending Payin, ' +
          'and returns the payment URL plus the platform order number.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PayinCreateRequest' },
              example: payinExample,
            },
          },
        },
        responses: {
          200: {
            description: 'Gateway response (resultCode 0000 = success, anything else = failure)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PayinCreateResponse' },
                examples: {
                  success: { summary: 'Created', value: successExample },
                  invalidSign: {
                    summary: 'Bad signature',
                    value: {
                      resultCode: '9999',
                      stateInfo: 'Invalid sign',
                      sign: 'D41D8CD98F00B204E9800998ECF8427E',
                    },
                  },
                  duplicate: {
                    summary: 'Duplicate outTradeNo',
                    value: {
                      resultCode: '9999',
                      stateInfo: 'Duplicate outTradeNo!',
                      sign: 'D41D8CD98F00B204E9800998ECF8427E',
                    },
                  },
                  missingParam: {
                    summary: 'Missing parameter',
                    value: { resultCode: '9999', stateInfo: 'Missing parameters totalAmount!' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/payin/order': {
      post: {
        tags: ['Payin'],
        summary: 'Create a deposit order from an amount only',
        description:
          'Provide just `amount`. The server generates `randomNo` and `outTradeNo`, applies the ' +
          "configured defaults, signs the request, forwards it to RRPay's `/payin/create`, and " +
          'mirrors RRPay\'s response byte-for-byte (status code and body). Optional fields below ' +
          'override the defaults.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PayinOrderRequest' },
              example: { amount: '150.00' },
              examples: {
                amountOnly: { summary: 'Amount only (recommended)', value: { amount: '150.00' } },
                withOverrides: {
                  summary: 'With optional overrides',
                  value: {
                    amount: '150.00',
                    currencyCode: 'INR',
                    payType: 'SCAN',
                    payName: 'xiaoming',
                    payEmail: 'xiaoming@email.com',
                    payPhone: '+917123456789',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "RRPay's exact response. `resultCode` `0000` means the order was created; any other " +
              'value means RRPay rejected it and `stateInfo` explains why.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PayinCreateResponse' },
                examples: {
                  created: { summary: 'Order created upstream', value: successExample },
                  upstreamRejected: {
                    summary: 'RRPay rejected the request',
                    value: {
                      resultCode: '9999',
                      stateInfo: 'Duplicate outTradeNo!',
                      sign: 'D41D8CD98F00B204E9800998ECF8427E',
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Local validation failed (nothing was sent to RRPay)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PayinOrderValidationError' },
                examples: {
                  missingAmount: {
                    summary: 'No amount',
                    value: { error: 'amount is required', example: { amount: '150.00' } },
                  },
                  badAmount: {
                    summary: 'Bad amount',
                    value: {
                      error: 'Invalid amount',
                      received: 'abc',
                      expected: 'positive number, max 2 decimals, max 9 characters (e.g. 150.00)',
                    },
                  },
                  badPayType: {
                    summary: 'Pay type not valid for the currency',
                    value: {
                      error: 'Invalid payType',
                      received: 'PIX',
                      currencyCode: 'INR',
                      supported: ['INRO', 'INRT', 'SCAN'],
                    },
                  },
                },
              },
            },
          },
          502: {
            description: 'Could not reach RRPay (network, DNS or timeout)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PayinOrderNetworkError' },
                example: {
                  error: 'RRPay request failed',
                  message: 'fetch failed',
                  code: 'ENOTFOUND',
                  cause: 'getaddrinfo ENOTFOUND api.rrpay.ai',
                  url: 'https://api.rrpay.ai/payin/create',
                  durationMs: 34,
                  request: { merNo: exampleMerchantNo, totalAmount: '150.00' },
                },
              },
            },
          },
        },
      },
    },
    ...(env.nodeEnv !== 'production'
      ? {
          '/payin/sign': {
            post: {
              tags: ['Payin (dev)'],
              summary: 'Generate the sign for a payin/create body (dev only)',
              description:
                'Convenience endpoint for Swagger testing: computes the uppercase MD5 using the ' +
                "merchant's secret from the database. Disabled when NODE_ENV=production.",
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/PayinSignRequest' },
                    example: { ...payinExample, sign: undefined },
                  },
                },
              },
              responses: {
                200: {
                  description: 'Computed signature',
                  content: {
                    'application/json': {
                      schema: { type: 'object', properties: { sign: { type: 'string' } } },
                      example: { sign: '4F3D2A1B9C8E7F60A1B2C3D4E5F60718' },
                    },
                  },
                },
                400: { description: 'merNo missing' },
                404: { description: 'Merchant not found' },
              },
            },
          },
        }
      : {}),
    '/pay/{payOrderNo}': {
      get: {
        tags: ['Payment page'],
        summary: 'Read the order behind a payURL',
        parameters: [
          {
            name: 'payOrderNo',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'PI20261115000001',
          },
        ],
        responses: {
          200: {
            description: 'Order summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    payOrderNo: { type: 'string' },
                    merNo: { type: 'string' },
                    outTradeNo: { type: 'string' },
                    totalAmount: { type: 'string' },
                    currencyCode: { type: 'string' },
                    payType: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'success', 'failed', 'expired'] },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          404: { description: 'Order not found' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Server and database status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    db: { type: 'string', example: 'connected' },
                    uptime: { type: 'number', example: 42.1 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/auth/register': {
      post: {
        tags: ['Admin'],
        summary: 'Register an admin (mobile + password)',
        description: 'Creates an admin account. No JWT is returned; use /admin/auth/login to obtain a token. Role defaults to admin.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminRegisterRequest' },
              example: { mobile: '9999999999', password: 'secret123' },
            },
          },
        },
        responses: {
          201: { description: 'Registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminAuthResponse' } } } },
          400: { description: 'Validation error' },
          409: { description: 'Mobile already registered' },
        },
      },
    },
    '/admin/auth/login': {
      post: {
        tags: ['Admin'],
        summary: 'Admin login (JWT issued only for admin role)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminLoginRequest' },
              example: { mobile: '9999999999', password: 'secret123' },
            },
          },
        },
        responses: {
          200: { description: 'Login successful, returns JWT', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminLoginResponse' } } } },
          400: { description: 'Invalid credentials' },
          403: { description: 'Not an admin or disabled' },
          404: { description: 'Admin not found' },
        },
      },
    },
    '/admin/groups': {
      get: {
        tags: ['Admin'],
        summary: 'List groups (paginated, filterable)',
        description: 'Query params: page, limit, uid, groupId, status, search.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'uid', in: 'query', schema: { type: 'string' } },
          { name: 'groupId', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'suspended', 'banned'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated group list', content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupListResponse' } } } },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/admin/groups/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Update a group (status, remark, exchangeRate, groupName)',
        description: 'id can be the Mongo _id, uid, or groupId.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GroupUpdateRequest' },
              example: { status: 'suspended', remark: 'spam', exchangeRate: 85 },
            },
          },
        },
        responses: {
          200: { description: 'Updated' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' },
          404: { description: 'Group not found' },
        },
      },
    },
    '/groups/{id}': {
      get: {
        tags: ['Groups'],
        summary: 'Get a group by _id, uid, or groupId',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Group found' },
          404: { description: 'Group not found' },
        },
      },
    },
    '/groups/register': {
      post: {
        tags: ['Groups'],
        summary: 'Register a group',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GroupRegisterRequest' },
              example: { groupId: -1001234567890, groupName: 'My Group' },
            },
          },
        },
        responses: { 201: { description: 'Registered' }, 400: { description: 'Bad request' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      PayinCreateRequest: {
        type: 'object',
        required: payinRequired,
        properties: payinProperties,
      },
      PayinSignRequest: {
        type: 'object',
        required: payinRequired.filter((field) => field !== 'sign'),
        properties: { ...payinProperties, sign: undefined },
      },
      PayinOrderRequest: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: {
            type: 'string',
            maxLength: 9,
            pattern: '^\\d+(\\.\\d{1,2})?$',
            example: '150.00',
            description: 'Amount to charge. Up to two decimals; normalized to two decimals.',
          },
          currencyCode: {
            type: 'string',
            enum: Object.keys(CURRENCIES),
            example: 'INR',
            description: 'Optional. Defaults to INR.',
          },
          payType: {
            type: 'string',
            example: 'INRT',
            description: 'Optional. Defaults to SCAN; must belong to currencyCode.',
          },
          notifyUrl: {
            type: 'string',
            format: 'uri',
            maxLength: 128,
            description: 'Optional. Overrides the built-in payment callback URL.',
          },
          payViewUrl: {
            type: 'string',
            format: 'uri',
            maxLength: 128,
            description: 'Optional redirect after payment.',
          },
          payName: { type: 'string', maxLength: 32, example: 'xiaoming' },
          payEmail: { type: 'string', format: 'email', maxLength: 32, example: 'xiaoming@email.com' },
          payPhone: {
            type: 'string',
            maxLength: 32,
            example: '+917123456789',
            description: 'INR/INRTWO: +91 + 10 digits starting 6-9. Others: +<8-15 digits>.',
          },
          payIp: {
            type: 'string',
            format: 'ipv4',
            maxLength: 32,
            description: 'Optional payer IP. Private/reserved addresses fall back to the server default.',
          },
          payCardNo: { type: 'string', maxLength: 32, example: '123456' },
          payBankCode: { type: 'string', maxLength: 32, example: 'PAY' },
        },
      },
      PayinOrderValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invalid amount' },
          received: { description: 'The rejected value' },
          expected: { type: 'string' },
          currencyCode: { type: 'string' },
          supported: { type: 'array', items: { type: 'string' } },
          example: { type: 'object' },
        },
      },
      PayinOrderNetworkError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'RRPay request failed' },
          message: { type: 'string', example: 'fetch failed' },
          code: { type: 'string', example: 'ENOTFOUND' },
          cause: { type: 'string' },
          url: { type: 'string', example: 'https://api.rrpay.ai/payin/create' },
          durationMs: { type: 'number', example: 34 },
          request: {
            type: 'object',
            description: 'The exact signed payload sent to RRPay',
            additionalProperties: true,
          },
          stack: { type: 'string', description: 'Only outside production' },
        },
      },
      AdminRegisterRequest: {
        type: 'object',
        required: ['mobile', 'password'],
        properties: {
          mobile: { type: 'string', example: '9999999999' },
          password: { type: 'string', minLength: 6, example: 'secret123' },
        },
      },
      AdminLoginRequest: {
        type: 'object',
        required: ['mobile', 'password'],
        properties: {
          mobile: { type: 'string', example: '9999999999' },
          password: { type: 'string', example: 'secret123' },
        },
      },
      AdminAuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          msg: { type: 'string' },
          admin: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mobile: { type: 'string' },
              role: { type: 'string', enum: ['admin', 'user'] },
              status: { type: 'string', enum: ['active', 'disabled'] },
            },
          },
        },
      },
      AdminLoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          msg: { type: 'string' },
          token: { type: 'string', description: 'JWT, valid for 7d' },
          admin: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mobile: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
      GroupRegisterRequest: {
        type: 'object',
        required: ['groupId'],
        properties: {
          groupId: { type: 'integer', example: -1001234567890 },
          groupName: { type: 'string', example: 'My Group' },
          uid: { type: 'string', description: 'Optional 5-digit uid; auto-generated if omitted' },
        },
      },
      GroupUpdateRequest: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'suspended', 'banned'] },
          remark: { type: 'string' },
          groupName: { type: 'string' },
          exchangeRate: { type: 'number', example: 85 },
        },
      },
      GroupListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
          groups: { type: 'array', items: { $ref: '#/components/schemas/Group' } },
        },
      },
      Group: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          uid: { type: 'string', description: '5-digit group uid' },
          groupId: { type: 'integer', description: 'Telegram chat id' },
          groupName: { type: 'string' },
          status: { type: 'string', enum: ['active', 'suspended', 'banned'] },
          remark: { type: 'string' },
          exchangeRate: { type: 'number' },
          balance: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      PayinCreateResponse: {
        type: 'object',
        properties: {
          resultCode: { type: 'string', example: '0000' },
          stateInfo: { type: 'string', example: 'success' },
          merNo: { type: 'string' },
          outTradeNo: { type: 'string' },
          totalAmount: { type: 'string', example: '150.00' },
          payURL: { type: 'string', example: 'http://localhost:4000/pay/PI20261115000001' },
          payOrderNo: { type: 'string', example: 'PI20261115000001' },
          payParams: { type: 'string', description: 'Returned only for channels that need it' },
          sign: { type: 'string' },
        },
      },
    },
  },
};

export default openApiSpec;
