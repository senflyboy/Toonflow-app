# Phase 1 技术调研报告：基础设施与认证

## 1. 概述

本报告针对 Phase 1（01-foundation-authentication）的技术实现进行深入调研，涵盖数据库迁移、认证系统集成、短信服务、安全实践和部署方案。

**技术栈现状：**
- Express 5.2.1 + TypeScript
- SQLite (better-sqlite3/sqlite3)
- JWT (jsonwebtoken) - 已安装
- Zod 4.3.5 - 验证库
- Knex 3.1.0 - SQL 查询构建器（可用于迁移）

---

## 2. 数据库迁移方案（SQLite → PostgreSQL）

### 2.1 推荐迁移策略

#### 方案 A：使用 Knex + pg（推荐）

项目已安装 Knex，可利用其迁移功能：

```bash
# 安装 PostgreSQL 驱动
npm install pg knex
npm install -D @types/pg
```

**迁移步骤：**

1. **数据导出**
   ```bash
   # 使用 sqlite3 命令行导出
   sqlite3 database.db ".dump" > backup.sql
   ```

2. **配置 Knex 迁移**
   ```typescript
   // knexfile.ts
   import type { Knex } from 'knex';

   export default {
     development: {
       client: 'pg',
       connection: process.env.DATABASE_URL,
       migrations: {
         directory: './src/db/migrations'
       }
     },
     production: {
       client: 'pg',
       connection: process.env.DATABASE_URL,
       pool: { min: 2, max: 10 }
     }
   } satisfies Knex.Config;
   ```

3. **执行迁移**
   ```bash
   knex migrate:latest
   ```

#### 方案 B：使用 pg-loader

对于大型数据库，使用 `pg-loader` 进行批量迁移：

```bash
# 安装 pg-loader
pip install pg-loader

# 执行迁移
pg_loader \
  --from sqlite://myapp.db \
  --to postgresql://user:pass@host/dbname
```

### 2.2 SQLite 到 PostgreSQL 语法差异适配

| SQLite 语法 | PostgreSQL 语法 | 说明 |
|------------|----------------|------|
| `AUTOINCREMENT` | `SERIAL` 或 `GENERATED ALWAYS AS IDENTITY` | 自增主键 |
| `datetime('now')` | `CURRENT_TIMESTAMP` | 时间函数 |
| `LIKE '%pattern'` | `ILIKE '%pattern'` | 大小写不敏感匹配 |
| `group_concat()` | `string_agg()` | 字符串聚合 |
| `IFNULL()` | `COALESCE()` | 空值处理 |

### 2.3 推荐的数据库架构

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(50) UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 刷新令牌表
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 短信验证码表
CREATE TABLE sms_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(20) NOT NULL, -- 'register', 'login', 'reset_password'
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 审计日志表
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

## 3. Auth.js v5 集成

### 3.1 Auth.js v5 简介

Auth.js v5（ formerly NextAuth.js）已支持 Express 框架，可以作为独立的认证解决方案。

### 3.2 安装与配置

```bash
# 安装 Auth.js v5
npm install @auth/core @auth/express bcryptjs
npm install -D @types/bcryptjs
```

### 3.3 集成方案

由于项目需要自定义的邮箱/手机号认证逻辑，建议不直接使用 Auth.js 的内置 Provider，而是利用其 JWT 和 Session 机制：

```typescript
// src/auth/config.ts
import { SvelteKitAuth } from "@auth/express";
import { expressjwt } from "express-jwt";
import { jwksRsa } from "jwks-rsa";

export const auth = SvelteKitAuth({
  secret: process.env.AUTH_SECRET,
  trustProxy: true,

  // 使用 JWT 作为会话策略
  session: {
    strategy: "jwt",
    maxAge: 15 * 60, // 15 minutes (与 access token 一致)
  },

  // 自定义 Credentials Provider
  providers: [
    // 不使用内置 provider，使用自定义逻辑
  ],
});

// JWT 中间件
export const authenticate = expressjwt({
  secret: process.env.AUTH_SECRET!,
  algorithms: ["HS256"],
  getToken: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return null;
  },
});
```

### 3.4 自定义认证逻辑

```typescript
// src/routes/auth/login.post.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { findUserByEmail, findUserByPhone, createRefreshToken, createAuditLog } from "../../db";
import { auth } from "../../auth/config";

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/).optional(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

router.post("/auth/login", auth(), async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { email, phone, password } = result.data;

  // 查找用户
  const user = email
    ? await findUserByEmail(email)
    : await findUserByPhone(phone);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // 检查账户锁定
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({
      error: "Account locked",
      locked_until: user.locked_until
    });
  }

  // 验证密码
  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    // 增加失败次数
    const failedAttempts = user.failed_login_attempts + 1;
    const shouldLock = failedAttempts >= 5;

    await updateUserFailedAttempts(user.id, failedAttempts, shouldLock);

    // 记录审计日志
    await createAuditLog({
      user_id: user.id,
      action: "LOGIN_FAILED",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    return res.status(401).json({
      error: shouldLock
        ? "Account locked due to multiple failed attempts"
        : "Invalid credentials"
    });
  }

  // 重置失败次数
  await updateUserFailedAttempts(user.id, 0, false);

  // 生成 tokens
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, phone: user.phone },
    process.env.JWT_SECRET!,
    { expiresIn: "15m", algorithm: "HS256" }
  );

  const refreshToken = jwt.sign(
    { sub: user.id, type: "refresh" },
    process.env.JWT_SECRET!,
    { expiresIn: "7d", algorithm: "HS256" }
  );

  // 存储 refresh token
  await createRefreshToken({
    user_id: user.id,
    token_hash: await bcrypt.hash(refreshToken, 12),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // 记录审计日志
  await createAuditLog({
    user_id: user.id,
    action: "LOGIN_SUCCESS",
    ip_address: req.ip,
    user_agent: req.headers["user-agent"],
  });

  res.json({ accessToken, refreshToken });
});
```

---

## 4. 短信验证码服务

### 4.1 服务商对比

| 服务商 | 价格（约） | 优点 | 缺点 |
|--------|-----------|------|------|
| 阿里云短信 | ¥0.045/条 | 稳定、覆盖广、文档完善 | 需企业认证 |
| 腾讯云短信 | ¥0.05/条 | 接入简单、套餐灵活 | 模板审核较严 |
| 极光短信 | ¥0.04/条 | 验证码专用通道 | 知名度较低 |
| 容联云通讯 | ¥0.04/条 | 支持国际短信 | 文档较旧 |

### 4.2 推荐：阿里云短信服务

```bash
# 安装阿里云 SDK
npm install @alibabacloud/dysmsapi20170525
```

```typescript
// src/services/sms.ts
import Dysmsapi20170525 from '@alibabacloud/dysmsapi20170525';
import { DefaultAcsClient } from '@alibabacloud/tea-util';

class SMSService {
  private client: DefaultAcsClient;

  constructor() {
    this.client = new DefaultAcsClient({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID!,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET!,
      endpoint: 'dysmsapi.aliyuncs.com',
      apiVersion: '2017-05-25',
    });
  }

  async sendVerificationCode(phone: string, code: string): Promise<boolean> {
    try {
      const sendRequest = new Dysmsapi20170525.SendSmsRequest({
        phoneNumbers: phone,
        signName: process.env.SMS_SIGN_NAME!,
        templateCode: process.env.SMS_TEMPLATE_CODE!,
        templateParam: JSON.stringify({ code }),
      });

      const response = await this.client.sendSms(sendRequest);
      return response.body.code === 'OK';
    } catch (error) {
      console.error('SMS send failed:', error);
      return false;
    }
  }
}

export const smsService = new SMSService();
```

### 4.3 验证码频率限制实现

```typescript
// src/middleware/rate-limit.ts
import rateLimit from "express-rate-limit";

// 短信验证码发送限制
export const smsRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 10, // 每小时最多 10 条
  message: { error: "Too many SMS requests, please try again later" },
  keyGenerator: (req) => req.body.phone,
  standardHeaders: true,
  legacyHeaders: false,
});

// 单个手机号每分钟限制
export const smsPerPhoneLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 1, // 每分钟最多 1 条
  message: { error: "Please wait 1 minute before requesting another code" },
  keyGenerator: (req) => `sms:${req.body.phone}`,
  standardHeaders: true,
  legacyHeaders: false,
});

// 验证码有效期：5分钟
const SMS_CODE_EXPIRY = 5 * 60 * 1000;

// 验证码生成
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 验证流程
async function verifyCode(phone: string, code: string, purpose: string): Promise<boolean> {
  const record = await findSmsCode(phone, purpose);

  if (!record || record.used) return false;
  if (new Date(record.expires_at) < new Date()) return false;
  if (record.code !== code) return false;

  await markCodeAsUsed(record.id);
  return true;
}
```

---

## 5. 安全最佳实践

### 5.1 密码存储

```typescript
// src/utils/password.ts
import bcrypt from "bcryptjs";

// bcrypt cost factor 12 (根据需求)
const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// 密码强度验证 (Zod)
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number");
```

### 5.2 API 限流

```typescript
// src/middleware/rate-limit.ts
import rateLimit from "express-rate-limit";

// 通用 API 限流
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 最多 100 请求
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 认证相关限流
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 登录/注册 15 分钟内最多 20 次
  message: { error: "Too many authentication attempts" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 应用于认证路由
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
```

### 5.3 审计日志方案

```typescript
// src/services/audit.ts
import { createClient } from "@libsql/client";

interface AuditLog {
  user_id?: string;
  action: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(log: AuditLog): Promise<void> {
  // 使用异步队列避免阻塞主请求
  queue.add(async () => {
    await db.insert(auditLogs).values({
      ...log,
      created_at: new Date(),
    });
  });
}

// 审计日志动作类型
export const AuditActions = {
  // 认证
  REGISTER: "REGISTER",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",

  // 账户安全
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED: "ACCOUNT_UNLOCKED",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  PHONE_VERIFIED: "PHONE_VERIFIED",

  // 令牌
  REFRESH_TOKEN_CREATED: "REFRESH_TOKEN_CREATED",
  REFRESH_TOKEN_REVOKED: "REFRESH_TOKEN_REVOKED",
  ACCESS_TOKEN_ISSUED: "ACCESS_TOKEN_ISSUED",
} as const;
```

### 5.4 安全响应头

```typescript
// src/middleware/security.ts
import helmet from "helmet";

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
  },
}));

// CORS 配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

---

## 6. 部署方案

### 6.1 Vercel + Neon PostgreSQL

**Neon PostgreSQL 特点：**
- Serverless PostgreSQL，按量计费
- 自动分支，适合开发/测试
- 免费额度：0.5GB 存储

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

**环境变量配置：**
```env
# Database
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require

# Auth
AUTH_SECRET=your-secret-key
JWT_SECRET=your-jwt-secret

# SMS
ALIYUN_ACCESS_KEY_ID=xxx
ALIYUN_ACCESS_KEY_SECRET=xxx
SMS_SIGN_NAME=xxx
SMS_TEMPLATE_CODE=xxx
```

### 6.2 Redis 会话存储（可选）

对于 Vercel Serverless 环境，推荐使用 Upstash Redis：

```bash
# 安装 Redis 客户端
npm install @upstash/redis
```

```typescript
// src/services/redis.ts
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 存储 refresh token 黑名单
export async function blacklistRefreshToken(
  token: string,
  ttl: number
): Promise<void> {
  const tokenHash = await hash(token);
  await redis.set(`blacklist:${tokenHash}`, "1`, `ex`: ttl);
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const tokenHash = await hash(token);
  return (await redis.get(`blacklist:${tokenHash}`)) !== null;
}
```

### 6.3 Vercel 配置

```json
// vercel.json
{
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/src/index.ts"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

```typescript
// src/index.ts
import express from "express";
import { createServer } from "http";

const app = express();
const server = createServer(app);

// 你的 Express 路由配置...

// Vercel Serverless Function 导出
export default server;
```

---

## 7. 实现计划

### 7.1 任务拆分

1. **数据库设置**
   - [ ] 配置 Neon PostgreSQL
   - [ ] 创建 Knex 迁移文件
   - [ ] 运行迁移

2. **认证核心**
   - [ ] 实现用户注册 API（邮箱/手机号）
   - [ ] 实现用户登录 API
   - [ ] 实现 JWT 令牌生成和验证
   - [ ] 实现 Refresh Token 机制

3. **安全功能**
   - [ ] 实现密码强度验证
   - [ ] 实现账户锁定机制
   - [ ] 配置 rate limiting
   - [ ] 集成审计日志

4. **短信服务**
   - [ ] 集成阿里云短信服务
   - [ ] 实现验证码发送和验证

5. **部署**
   - [ ] 配置 Vercel 部署
   - [ ] 设置环境变量

---

## 8. 推荐依赖

```json
{
  "dependencies": {
    "@auth/core": "^5.0.0",
    "@auth/express": "^0.5.0",
    "@alibabacloud/dysmsapi20170525": "^2.0.0",
    "@upstash/redis": "^1.0.0",
    "bcryptjs": "^2.4.3",
    "express-rate-limit": "^7.0.0",
    "helmet": "^7.0.0",
    "jwks-rsa": "^3.0.0",
    "express-jwt": "^8.0.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.0"
  }
}
```

---

## 9. 参考资料

- [Auth.js v5 官方文档](https://authjs.dev/)
- [Knex.js 迁移文档](https://knexjs.org/guide/migrations.html)
- [阿里云短信服务文档](https://help.aliyun.com/document_detail/55284.html)
- [Neon PostgreSQL 文档](https://neon.tech/docs)
- [Express Rate Limit](https://github.com/express-rate-limit/express-rate-limit)