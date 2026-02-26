# SaaS 转型技术栈研究

## 研究概述

将现有桌面应用 (Electron + Express + SQLite) 转型为 SaaS 产品，需要重新架构以支持：
- 多用户认证
- 云端数据存储
- 订阅支付
- 云端 + 桌面混合部署

---

## 技术选型

### 1. 认证系统

| 方案 | 置信度 | 原因 |
|------|--------|------|
| Auth.js (NextAuth) v5 | 高 | 全栈标准方案 |
| JWT + 手动实现 | 中 | 维护成本高 |
| Clerk | 中 | 功能强大但付费 |

**推荐**: Auth.js (NextAuth) v5.x

**原因**:
- 开箱即用的 OAuth/邮件认证
- 支持 JWT 持久化
- 集成会话管理
- 活跃维护

**不推荐**:
- Clerk: 功能全但免费版限制多，迁移锁定
- 手动 JWT: 需要自行处理 token 刷新、黑名单、CSRF 等

---

### 2. 数据库

| 方案 | 置信度 | 原因 |
|------|--------|------|
| PostgreSQL + Prisma | 高 | SaaS 标准 |
| MySQL + Prisma | 中 | 功能类似 |
| MongoDB | 低 | 不适合多表关联 |
| SQLite (云端) | 不推荐 | 并发能力弱 |

**推荐**: PostgreSQL 17.x + Prisma 6.x

**原因**:
- 成熟的 SaaS 标配，外键约束完整
- Prisma 与 Next.js 集成优秀，类型安全
- JSON 支持，适合存储 AI 生成内容

**不推荐**:
- MongoDB: 不适合复杂的表关联查询
- SQLite 云端: 并发能力有限，不适合多用户场景

---

### 3. 支付订阅

| 方案 | 置信度 | 原因 |
|------|--------|------|
| Stripe | 高 | 国际标准 |
| Paddle | 中 | 欧洲隐私友好 |
| 支付宝/微信支付 | 低 | 需要另行集成 |

**推荐**: Stripe v15.x

**原因**:
- 完整的订阅管理（试用期、阶梯定价、升级/降级）
- 内置退款、发票、税务合规
- 与 Auth.js 集成示例丰富

**不推荐**:
- 纯支付宝/微信: 需要分开集成，无法管理国际用户
- 自建支付: 风险高，不合规

---

### 4. 前端框架

| 方案 | 置信度 | 原因 |
|------|--------|------|
| Next.js 15.x | 高 | 全栈标准 |
| Remix | 中 | 功能相似 |
| React + Vite | 低 | 需要自行处理 SSR/SEO |

**推荐**: Next.js 15.x + React 19.x

**原因**:
- App Router 架构清晰
- Server Actions 简化 API 调用
- 与 Auth.js/Stripe 集成成熟

**不推荐**:
- 纯 Vite: 需要自行实现 SSR
- Remix: 生态比 Next.js 小

---

### 5. 桌面应用

| 方案 | 置信度 | 原因 |
|------|--------|------|
| Tauri 2.x | 高 | 轻量安全 |
| Electron 40.x | 中 | 保持现状 |
| Flutter | 低 | 非 Web 技术 |

**推荐**: Tauri 2.x + React 19.x

**原因**:
- 二进制体积比 Electron 小 5-10 倍
- Rust 后端，内存安全
- 支持离线模式

**不推荐**:
- Electron: 体积大，内存占用高
- Flutter: 非 Web 技术，无法复用前端代码

---

### 6. 云服务部署

| 方案 | 置信度 | 原因 |
|------|--------|------|
| Vercel + Neon | 高 | 零配置部署 |
| AWS (EC2 + RDS) | 中 | 完全控制 |
| 自建服务器 | 低 | 维护成本高 |

**推荐**: Vercel (前端 + API) + Neon (PostgreSQL)

**原因**:
- Next.js 官方支持
- 冷启动快，按量计费
- Neon 提供免费层

---

## 架构变更

### 当前架构
```
用户 → Electron 桌面应用 → Express (本地) → SQLite (本地)
```

### 目标架构
```
用户 → 桌面端 (Tauri) ←→ 云端 API (Next.js) ←→ PostgreSQL (Neon)
         ↓
    离线模式 (本地 SQLite)
```

**混合模式说明**:
- 桌面端同时包含本地模式和云端模式
- 用户在线时自动同步数据
- 离线时使用本地 SQLite，云端同步延迟

---

## 迁移路径

### 第一阶段：后端 API 云端化 (4-6 周)
1. 创建 Next.js 项目，初始化 Prisma
2. 将 Express 路由迁移到 Next.js App Router
3. 添加 Auth.js 认证（用户登录/注册）
4. PostgreSQL 数据迁移（手动或脚本）

### 第二阶段：前端重构 (4-6 周)
1. 创建 Next.js 前端页面
2. 实现 UI 组件库（推荐 shadcn/ui）
3. 集成 Auth.js 登录状态
4. 实现项目/大纲/脚本管理界面

### 第三阶段：支付集成 (2-3 周)
1. Stripe 账户配置
2. 创建订阅套餐（免费/专业/企业）
3. 实现余额管理（按量付费）
4. 集成支付页面

### 第四阶段：桌面端迁移 (3-4 周)
1. Tauri 2.x 项目初始化
2. 嵌入 Next.js WebView
3. 实现离线模式（本地 SQLite + 同步队列）
4. 打包发布

---

## 关键依赖版本

```json
{
  // 核心框架
  "next": "^15.1.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",

  // 认证
  "auth": "^5.0.0",
  "@auth/prisma-adapter": "^2.0.0",

  // 数据库
  "prisma": "^6.0.0",
  "@prisma/client": "^6.0.0",

  // 支付
  "stripe": "^15.0.0",
  "@stripe/stripe-js": "^4.0.0",

  // 桌面
  "tauri": "^2.0.0",

  // UI
  "tailwindcss": "^4.0.0",
  "shadcn": "^1.0.0",
  "lucide-react": "^0.500.0",

  // 工具
  "zod": "^4.0.0",
  "axios": "^1.8.0"
}
```

---

## 数据模型迁移

### 当前: SQLite (16 张表)
```
t_user (用户)
t_project (项目)
t_novel (小说)
t_outline (大纲)
t_script (脚本)
t_storyline (分镜)
t_image (图片)
t_video (视频)
...
```

### 目标: PostgreSQL
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  plan      Plan     @default(FREE)
  credits   Int      @default(100)
  projects  Project[]
  orders    Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Project {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  novel     Novel?
  outline   Outline?
  scripts   Script[]
  status    ProjectStatus @default(DRAFT)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model CreditTransaction {
  id        String   @id @default(cuid())
  userId    String
  amount    Int      // 正数=充值，负数=消耗
  type      CreditType
  orderId   String?
  createdAt DateTime @default(now())
}

// 保持现有表结构，仅添加 userId 外键
```

---

## 决策矩阵

| 项目 | 决策 | 置信度 | 原因 |
|------|------|--------|------|
| 认证 | Auth.js v5 | 高 | 全栈标准，维护成本低 |
| 数据库 | PostgreSQL + Prisma | 高 | SaaS 标配，类型安全 |
| 支付 | Stripe | 高 | 功能完整，合规可靠 |
| 前端 | Next.js 15 | 高 | 生态完整，SSR 支持 |
| 桌面 | Tauri 2.x | 高 | 轻量安全，Rust 后端 |
| 部署 | Vercel + Neon | 中 | 免费层够用，快速启动 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Tauri WebView 兼容性 | 使用系统 WebView2 (Windows) / WKWebView (macOS) |
| Stripe 国内支付 | 后续集成支付宝/微信（需要企业资质） |
| 数据迁移 | 使用 Prisma migrate + 种子脚本 |
| 离线同步冲突 | 使用 CRDT 或时间戳合并策略 |

---

## 推荐阅读

- [Next.js 15 文档](https://nextjs.org/docs)
- [Auth.js 官方指南](https://authjs.dev/)
- [Prisma 入门](https://www.prisma.io/docs)
- [Stripe 订阅文档](https://stripe.com/docs/billing/subscriptions)
- [Tauri 2.x 迁移指南](https://tauri.app/start/migrate/)