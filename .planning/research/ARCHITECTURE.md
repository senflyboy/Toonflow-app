# Hybrid SaaS Architecture Research - Toonflow

## Executive Summary

This document outlines the recommended hybrid SaaS architecture for transforming Toonflow from a local-only desktop application to a commercial cloud-enabled product. The architecture supports multi-tenant user management, payment processing, data synchronization, and AI task queue processing while maintaining offline capability for the desktop client.

---

## 1. Hybrid Architecture Overview

### 1.1 Core Concept

Hybrid SaaS systems combine the performance and offline capabilities of desktop applications with the scalability and centralization of cloud services. For Toonflow, this means:

- **Desktop Client**: Rich local application with embedded Express server (existing)
- **Cloud Services**: Centralized APIs for user management, payments, sync
- **Data Synchronization**: Bidirectional sync between local SQLite and cloud database
- **Task Queue**: Cloud-based processing for AI generation jobs

### 1.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER LAYER                                         │
│  ┌─────────────────────┐              ┌─────────────────────────────────┐   │
│  │  Desktop App        │              │  Web Browser (Future)           │   │
│  │  (Electron +        │◄────────────►│  (Toonflow-web PWA)            │   │
│  │   Express local)    │              │                                 │   │
│  └─────────────────────┘              └─────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 │ HTTPS / WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLOUD SERVICES LAYER                                 │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    API Gateway (Express/NestJS)                       │   │
│  │              Port 443 (HTTPS) + WebSocket (WSS)                      │   │
│  │  ┌──────────┬──────────┬──────────┬──────────┬──────────┐           │   │
│  │  │ Auth     │ Payment  │ Project  │ Sync     │ Admin    │           │   │
│  │  │ Service  │ Service  │ Service  │ Service  │ Service  │           │   │
│  │  └──────────┴──────────┴──────────┴──────────┴──────────┘           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────┴───────────────────────────────────┐   │
│  │                    TASK QUEUE LAYER                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │  │ Redis       │  │ Bull Queue  │  │ Worker Pool │                │   │
│  │  │ (Message    │──│ (Job        │──│ (AI         │                │   │
│  │  │  Broker)    │  │  Queue)     │  │  Processing)│                │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                            │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌────────────────┐  │
│  │  PostgreSQL         │    │  Redis Cache        │    │  Object Storage│  │
│  │  (Multi-tenant      │    │  (Sessions,         │    │  (S3/MinIO)    │  │
│  │   Database)         │    │   Cache, Rate       │    │  (Images,      │  │
│  │                     │    │   Limiting)         │    │   Videos)      │  │
│  └─────────────────────┘    └─────────────────────┘    └────────────────┘  │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                        │
│  │  SQLite (Local)     │◄──►│  Sync Engine        │                        │
│  │  (Desktop Client)   │    │  (Conflict          │                        │
│  │                     │    │   Resolution)       │                        │
│  └─────────────────────┘    └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                                        │
│                                                                              │
│  OpenAI │ Anthropic │ Google │ Kling │ Vidu │ Alipay │ WeChat Pay         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 Desktop Client (Electron)

**Purpose**: Primary user interface with local processing capability

**Key Components**:
- **Electron Main Process** (`scripts/main.ts`)
  - Window management
  - System tray integration
  - Auto-update mechanism
  - Local Express server spawning

- **Local Express Server** (existing)
  - Same as current implementation
  - Runs on `localhost:60000`
  - Handles local-only operations

- **Sync Client Module** (NEW)
  - Connection state management
  - Local-to-cloud data synchronization
  - Offline queue for pending operations
  - Conflict resolution logic

**Responsibilities**:
- Provide full UI/UX for content creation
- Execute basic operations offline
- Queue sync operations when offline
- Cache frequently accessed data
- Monitor connection status

### 2.2 API Gateway

**Purpose**: Single entry point for all cloud services

**Technology**: Express.js or NestJS (recommended for scalability)

**Features**:
- Request routing to microservices
- Rate limiting per user/tier
- Authentication verification
- Request/response logging
- SSL/TLS termination
- Load balancing

**Endpoints Structure**:
```
/api/v1/
├── /auth/           # Authentication endpoints
│   ├── POST /register
│   ├── POST /login
│   ├── POST /logout
│   ├── POST /refresh-token
│   └── POST /forgot-password
│
├── /user/           # User management
│   ├── GET /profile
│   ├── PUT /profile
│   ├── PUT /password
│   └── DELETE /account
│
├── /billing/        # Payment & subscription
│   ├── GET /subscription
│   ├── POST /subscription
│   ├── GET /usage
│   ├── GET /invoices
│   └── POST /payment-method
│
├── /projects/       # Cloud project sync
│   ├── GET /        # List user's projects
│   ├── POST /       # Create project
│   ├── GET /:id     # Get project
│   └── DELETE /:id
│
├── /sync/           # Data synchronization
│   ├── POST /push   # Upload local changes
│   ├── POST /pull   # Download cloud changes
│   └── GET  /status # Sync status
│
├── /tasks/          # Task queue management
│   ├── POST /submit # Submit AI generation task
│   ├── GET /:id     # Get task status
│   └── GET /list    # List user's tasks
│
└── /webhooks/       # External webhooks
    ├── POST /payment
    └── POST /ai-callback
```

### 2.3 Authentication Service

**Purpose**: Handle user identity and access control

**Features**:
- JWT-based authentication
- Multi-factor authentication (optional)
- OAuth integration (Google, WeChat)
- Session management
- Token refresh mechanism
- Password reset flow

**Architecture**:
```typescript
// Authentication Flow
1. User submits credentials
   │
   ▼
2. Auth Service validates against database
   │
   ▼
3. Generate JWT access token (15min) + refresh token (7 days)
   │
   ▼
4. Return tokens to client
   │
   ▼
5. Client includes access token in Authorization header
   │
   ▼
6. API Gateway verifies token on each request
   │
   ▼
7. Refresh token when expired (automatic)
```

**Security Considerations**:
- Store password hashes using bcrypt (cost factor 12)
- Implement account lockout after 5 failed attempts
- Use HTTPS exclusively
- Implement CSRF protection
- Rate limit login attempts

### 2.4 Payment & Billing Service

**Purpose**: Manage subscriptions, payments, and usage tracking

**Features**:
- Subscription management (monthly/yearly)
- Usage-based billing
- Payment processing (Alipay, WeChat Pay)
- Invoice generation
- Usage metering and tracking
- Quota management

**Subscription Tiers** (Example):
```typescript
interface SubscriptionPlan {
  id: string;
  name: string;           // "Free", "Pro", "Enterprise"
  price: number;          // Monthly price in CNY
  features: {
    projects: number;     // Max projects (0 = unlimited)
    storageGB: number;    // Cloud storage limit
    textGeneration: number; // Text credits/month
    imageGeneration: number; // Image credits/month
    videoGeneration: number; // Video credits/month
    prioritySupport: boolean;
    apiAccess: boolean;
  };
  limits: {
    concurrentTasks: number;
    maxFileSizeMB: number;
  };
}
```

**Usage Tracking**:
```typescript
interface UsageRecord {
  userId: string;
  timestamp: Date;
  resourceType: 'text' | 'image' | 'video';
  amount: number;         // Number of units consumed
  cost: number;           // Cost in CNY
  taskId: string;         // Related task
  metadata: {
    model: string;
    duration?: number;    // For video generation
  };
}
```

### 2.5 Project Sync Service

**Purpose**: Synchronize project data between desktop client and cloud

**Features**:
- Bidirectional sync
- Conflict detection and resolution
- Delta synchronization (only changes)
- Large file handling (chunked upload)
- Sync status monitoring

**Sync Strategy**:
```typescript
// Sync Protocol
1. Desktop Client connects to Sync Service
   │
   ▼
2. Client sends local changes (lastSyncTimestamp)
   │
   ▼
3. Server detects conflicts
   │
   ├── If no conflict: Apply changes
   │
   └── If conflict: Use conflict resolution strategy
       ├── Last-write-wins (default)
       ├── Manual resolution (for critical data)
       └── Merge (for non-conflicting fields)
   │
   ▼
4. Server sends cloud changes to client
   │
   ▼
5. Client applies changes to local SQLite
   │
   ▼
6. Update lastSyncTimestamp
```

**Conflict Resolution Rules**:
| Data Type | Strategy | Rationale |
|-----------|----------|-----------|
| Project metadata | Last-write-wins | User intent is paramount |
| Content (novel, script) | Last-write-wins | Avoid complex merging |
| Settings | Server-wins | Standardize defaults |
| Assets (images, videos) | Server-wins | Cloud is master |
| Generated files | Download from cloud | Local copy is cache |

### 2.6 Task Queue Service

**Purpose**: Manage AI generation jobs asynchronously

**Technology Stack**:
- **Message Broker**: Redis
- **Queue System**: Bull (Node.js)
- **Workers**: Node.js worker processes

**Task Types**:
```typescript
enum TaskType {
  TEXT_GENERATION = 'text',      // Outline, script generation
  IMAGE_GENERATION = 'image',    // Storyboard images
  VIDEO_GENERATION = 'video',    // Final video synthesis
  TEXT_TO_SPEECH = 'tts',        // Audio generation
  EXPORT = 'export',             // Project export
}

enum TaskStatus {
  QUEUED = 'queued',             // Waiting in queue
  PROCESSING = 'processing',     // Currently being worked on
  COMPLETED = 'completed',       // Successfully completed
  FAILED = 'failed',             // Failed with error
  CANCELLED = 'cancelled',       // Cancelled by user
}
```

**Queue Architecture**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  API        │     │  Redis      │     │  Worker     │
│  Server     │────▶│  Queue      │────▶│  Pool       │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           │ Job Status         │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Task       │     │  AI         │
                    │  Status     │     │  Providers  │
                    │  Updates    │     └─────────────┘
                    └─────────────┘
```

**Task Processing Flow**:
```typescript
// 1. User submits task from desktop app
POST /api/v1/tasks/submit
{
  type: 'image',
  projectId: 'xxx',
  parameters: { prompt: '...', model: 'kling' },
  priority: 'normal'
}
│
▼
// 2. API validates user quota
Check user.usage.textGeneration > 0
│
▼
// 3. Create task record in database
INSERT INTO t_task (userId, type, status, parameters)
│
▼
// 4. Add to Bull queue
await taskQueue.add('image-generation', { taskId: 'xxx' })
│
▼
// 5. Worker picks up task
async function processImageTask(job) {
  // Call AI provider
  const result = await ai.image.generate(params);

  // Update task status
  await updateTaskStatus(taskId, 'completed', result);

  // Deduct user quota
  await deductUserQuota(userId, 'image', 1);

  return result;
}
│
▼
// 6. Desktop client polls for status
GET /api/v1/tasks/:id
│
▼
// 7. Client downloads result
GET /api/v1/tasks/:id/download
```

### 2.7 Admin Service

**Purpose**: Backend management for administrators

**Features**:
- User management (view, suspend, delete)
- Subscription management
- Usage analytics and reporting
- System configuration
- Content moderation
- Audit logs

**Endpoints**:
```
/api/v1/admin/
├── /users/              # User management
│   ├── GET /list
│   ├── GET /:id
│   ├── PUT /:id/suspend
│   └── DELETE /:id
│
├── /subscriptions/      # Subscription management
│   ├── GET /list
│   ├── PUT /:id/cancel
│   └── POST /:id/refund
│
├── /analytics/          # Usage analytics
│   ├── GET /usage
│   ├── GET /revenue
│   └── GET /active-users
│
├── /system/             # System configuration
│   ├── GET /config
│   └── PUT /config
│
└── /audit-logs/         # Audit logs
    └── GET /list
```

---

## 3. Data Architecture

### 3.1 Multi-Tenant Database Design

**Strategy**: Row-level isolation with tenant_id column

**Rationale**:
- Efficient resource utilization (shared database)
- Simple to implement and maintain
- Good performance for most use cases
- Easier backup and migration

**Schema Structure**:
```sql
-- Users table (tenants)
CREATE TABLE t_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Subscription fields
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_expires_at TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- All other tables include tenant_id
CREATE TABLE t_project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES t_user(id),

  -- Existing fields
  name VARCHAR(255),
  status VARCHAR(50),
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Sync metadata
  sync_version BIGINT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,

  -- Constraints
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES t_user(id)
);

CREATE INDEX idx_project_user ON t_project(user_id);
CREATE INDEX idx_project_sync ON t_project(user_id, sync_version);

-- Similar pattern for all other tables
CREATE TABLE t_novel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES t_user(id),
  project_id UUID REFERENCES t_project(id),
  -- ... existing fields
);

CREATE TABLE t_outline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES t_user(id),
  project_id UUID REFERENCES t_project(id),
  -- ... existing fields
);

-- Task queue table
CREATE TABLE t_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES t_user(id),
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'queued',
  parameters JSONB,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES t_user(id)
);

CREATE INDEX idx_task_user ON t_task(user_id);
CREATE INDEX idx_task_status ON t_task(status);

-- Usage tracking
CREATE TABLE t_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES t_user(id),
  resource_type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  cost DECIMAL(10, 4),
  period VARCHAR(7),  -- YYYY-MM for monthly aggregation
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES t_user(id)
);

CREATE INDEX idx_usage_user_period ON t_usage(user_id, period);

-- Payments
CREATE TABLE t_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES t_user(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CNY',
  payment_method VARCHAR(50),
  provider_transaction_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES t_user(id)
);
```

### 3.2 Local Database Schema (SQLite)

**Purpose**: Desktop client local storage with sync capability

**Migration Strategy**:
```typescript
// Local SQLite schema updates
// 1. Add user_id column to existing tables
ALTER TABLE t_project ADD COLUMN user_id INTEGER;
ALTER TABLE t_novel ADD COLUMN user_id INTEGER;
ALTER TABLE t_outline ADD COLUMN user_id INTEGER;
ALTER TABLE t_script ADD COLUMN user_id INTEGER;
ALTER TABLE t_storyline ADD COLUMN user_id INTEGER;
ALTER TABLE t_assets ADD COLUMN user_id INTEGER;
ALTER TABLE t_image ADD COLUMN user_id INTEGER;
ALTER TABLE t_video ADD COLUMN user_id INTEGER;

// 2. Add sync metadata
ALTER TABLE t_project ADD COLUMN sync_version INTEGER DEFAULT 0;
ALTER TABLE t_project ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE t_project ADD COLUMN last_synced_at INTEGER;

// 3. Create sync tracking table
CREATE TABLE t_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name VARCHAR(50) NOT NULL,
  record_id INTEGER NOT NULL,
  operation VARCHAR(10) NOT NULL,  -- INSERT, UPDATE, DELETE
  timestamp INTEGER NOT NULL,
  synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_sync_log ON t_sync_log(synced, timestamp);
```

### 3.3 Data Flow Patterns

**Pattern 1: User Creates Project (Online)**
```
Desktop App                          Cloud Service
    │                                        │
    │  1. Create project locally             │
    │     INSERT t_project                   │
    │                                        │
    │  2. Queue sync operation               │
    │     INSERT t_sync_log                  │
    │                                        │
    │  3. [When online] Push to cloud        │
    │     POST /api/v1/sync/push             │
    │     { changes: [...] }                 │
    │                                        │
    │                                        │  4. Validate & apply
    │                                        │     INSERT t_project
    │                                        │
    │                                        │  5. Return sync version
    │     { syncVersion: 1234 }              │◄─
    │◄───────────────────────────────────────┤
    │                                        │
    │  6. Update local sync status           │
    │     UPDATE t_project                   │
    │     SET sync_version = 1234            │
```

**Pattern 2: AI Task Processing (Async)**
```
Desktop App                          Cloud Service                    AI Provider
    │                                        │                               │
    │  1. Submit generation task             │                               │
    │     POST /api/v1/tasks/submit          │                               │
    │     { type: 'image', prompt: '...' }   │                               │
    │                                        │                               │
    │                                        │  2. Validate quota            │
    │                                        │     Check t_usage             │
    │                                        │                               │
    │                                        │  3. Create task               │
    │                                        │     INSERT t_task             │
    │                                        │                               │
    │                                        │  4. Add to queue              │
    │                                        │     Redis lpush               │
    │                                        │                               │
    │  5. Poll task status                   │                               │
    │     GET /api/v1/tasks/:id              │                               │
    │                                        │                               │
    │                                        │  6. Worker picks up job       │
    │                                        │     BRPOP queue               │
    │                                        │                               │
    │                                        │  7. Call AI provider          │
    │                                        │     ──────────────────────►   │
    │                                        │                               │ 8. Generate
    │                                        │◄──────────────────────────────┤
    │                                        │                               │
    │                                        │  9. Save result to storage   │
    │                                        │     Upload to S3              │
    │                                        │                               │
    │                                        │  10. Update task status       │
    │                                        │     UPDATE t_task             │
    │                                        │                               │
    │     { status: 'completed',             │                               │
    │       result: { url: '...' } }         │◄─
    │◄───────────────────────────────────────┤
    │                                        │
    │  11. Download result                   │
    │      GET /api/v1/tasks/:id/download    │
```

**Pattern 3: Subscription Purchase**
```
Desktop App                          Cloud Service                    Payment Provider
    │                                        │                               │
    │  1. Initiate payment                   │                               │
    │     POST /api/v1/billing/subscribe     │                               │
    │     { planId: 'pro', method: 'alipay'} │                               │
    │                                        │                               │
    │                                        │  2. Create payment record    │
    │                                        │     INSERT t_payment         │
    │                                        │                               │
    │                                        │  3. Get payment URL          │
    │                                        │     ──────────────────────►   │
    │                                        │                               │ 4. Return URL
    │     { paymentUrl: 'https://...' }      │◄─────────────────────────────┤
    │◄───────────────────────────────────────┤
    │                                        │
    │  5. Open payment page (in app)         │
    │     webview.loadURL(paymentUrl)        │
    │                                        │
    │                                        │  6. User completes payment   │
    │                                        │◄──────────────────────────────
    │                                        │                               │
    │                                        │  7. Webhook notification     │
    │     [Webhook] POST /api/v1/webhooks/payment │
    │◄───────────────────────────────────────┤
    │                                        │
    │  8. Verify & update subscription       │
    │     UPDATE t_user                      │
    │     SET subscription_tier = 'pro'      │
    │                                        │
    │     { status: 'active' }               │◄─
    │◄───────────────────────────────────────┤
```

---

## 4. Multi-Tenancy Implementation

### 4.1 Tenant Isolation Strategy

**Row-Level Isolation**:
```typescript
// Every query automatically includes tenant_id
class TenantService {
  private getTenantId(req: Request): string {
    return req.user.tenantId;  // From JWT
  }

  // Database query middleware
  async query<T>(table: string, req: Request): QueryBuilder {
    const tenantId = this.getTenantId(req);
    return db(table).where('user_id', tenantId);
  }
}

// Usage in routes
router.get('/projects', async (req, res) => {
  const projects = await tenantService
    .query('t_project', req)
    .select('*');

  res.success(projects);
});
```

### 4.2 Data Privacy

**Encryption at Rest**:
- Use PostgreSQL built-in encryption or pgcrypto extension
- Encrypt sensitive fields (PII) using AES-256

**Encryption in Transit**:
- Enforce SSL/TLS for all connections
- HSTS headers on API responses

**Data Access Control**:
```typescript
// Middleware to ensure users can only access their own data
const dataAccessControl = (table: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user.id;
    const resourceId = req.params.id;

    const exists = await db(table)
      .where({ id: resourceId, user_id: userId })
      .first();

    if (!exists) {
      return res.error('Resource not found or access denied', 403);
    }

    next();
  };
};

// Apply to routes
router.get('/projects/:id',
  authenticate,
  dataAccessControl('t_project'),
  getProjectHandler
);
```

---

## 5. Offline Capability Strategy

### 5.1 Offline-First Architecture

**Core Principles**:
1. All operations work offline first
2. Sync when connection is available
3. User sees immediate feedback
4. Conflicts are handled transparently

**Implementation**:
```typescript
// Sync Service in Desktop App
class SyncService {
  private isOnline: boolean = true;
  private pendingOperations: SyncOperation[] = [];

  constructor() {
    // Monitor network status
    this.monitorNetworkStatus();

    // Process pending operations on reconnect
    this.processQueue();
  }

  async saveProject(project: Project): Promise<void> {
    // Always save locally first
    await this.localDB.insert('t_project', project);

    // Queue for sync if offline
    if (!this.isOnline) {
      await this.queueOperation({
        type: 'CREATE',
        table: 't_project',
        data: project
      });
    } else {
      // Push immediately
      await this.pushToCloud([project]);
    }
  }

  private async queueOperation(op: SyncOperation): Promise<void> {
    await this.localDB.insert('t_sync_queue', {
      ...op,
      createdAt: Date.now(),
      attempts: 0
    });
  }

  private async processQueue(): Promise<void> {
    const pending = await this.localDB
      .select('*')
      .from('t_sync_queue')
      .where('attempts', '<', 3);

    for (const op of pending) {
      try {
        await this.pushToCloud([op.data]);
        await this.localDB.delete('t_sync_queue', op.id);
      } catch (error) {
        await this.localDB.update('t_sync_queue', {
          attempts: op.attempts + 1,
          lastError: error.message
        }, op.id);
      }
    }
  }
}
```

### 5.2 Offline Data Limits

**Sync Constraints**:
- Maximum offline time: 30 days
- Maximum pending operations: 100
- Maximum storage usage: 500MB (configurable)
- Auto-cleanup of synced data after 90 days

---

## 6. Build Order & Dependencies

### 6.1 Recommended Phase Structure

**Phase 1: Foundation (Weeks 1-4)**
- Set up cloud infrastructure
- Implement authentication service
- Create multi-tenant database schema
- Build API gateway skeleton

**Dependencies**: None (base infrastructure)

**Deliverables**:
- [ ] Cloud database (PostgreSQL) provisioned
- [ ] Redis cluster for caching and queues
- [ ] Basic authentication (email/password)
- [ ] User registration and login APIs

**Phase 2: Core Services (Weeks 5-8)**
- Payment & billing service
- Project sync service
- Task queue system

**Dependencies**: Phase 1 complete

**Deliverables**:
- [ ] Payment integration (Alipay, WeChat)
- [ ] Subscription management
- [ ] Usage tracking
- [ ] Project CRUD APIs with sync
- [ ] Task submission and status APIs
- [ ] Worker pool for AI tasks

**Phase 3: Desktop Integration (Weeks 9-12)**
- Sync client module for desktop
- Offline capability
- Auto-update mechanism

**Dependencies**: Phase 1 & 2 complete

**Deliverables**:
- [ ] Desktop sync module
- [ ] Conflict resolution logic
- [ ] Connection status monitoring
- [ ] Background sync when online

**Phase 4: Admin & Analytics (Weeks 13-16)**
- Admin dashboard
- Usage analytics
- System monitoring

**Dependencies**: Phase 1-3 complete

**Deliverables**:
- [ ] Admin panel for user management
- [ ] Revenue and usage dashboards
- [ ] System health monitoring

### 6.2 Component Dependency Graph

```
                    ┌─────────────────────┐
                    │  Cloud Infrastructure│
                    │  (PostgreSQL, Redis, │
                    │   S3, Load Balancer) │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │     API Gateway      │
                    │  (Authentication,    │
                    │   Routing, Rate      │
                    │   Limiting)          │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Auth Service   │  │ Billing Service │  │ Sync Service    │
│  - JWT          │  │ - Subscriptions │  │ - Push/Pull     │
│  - OAuth        │  │ - Payments      │  │ - Conflicts     │
│  - Sessions     │  │ - Usage         │  │ - Versioning    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Task Queue       │
                    │  - Bull + Redis   │
                    │  - Worker Pool    │
                    └─────────┬─────────┘
                              │
                    ┌─────────┴─────────┐
                    │   AI Providers     │
                    │ (OpenAI, Kling,    │
                    │  Vidu, etc.)       │
                    └────────────────────┘

Desktop Client Integration:
┌─────────────────┐
│  Desktop App    │
│  - Sync Module  │◄──────────────┐
│  - Offline      │               │
│    Capability   │               │
└────────┬────────┘               │
         │                        │
         │         ┌──────────────┴──────────────┐
         │         │   Data Synchronization       │
         │         │   (Cloud ◄► Local SQLite)   │
         └─────────►                               │
                   └──────────────────────────────┘
```

---

## 7. Migration Strategy

### 7.1 Migration from Local-Only Architecture

**Step 1: Database Schema Migration**
- Add user_id to all existing tables
- Add sync metadata columns
- Create new tables for SaaS features (t_user, t_task, t_usage, t_payment)
- Create indexes for tenant isolation

**Step 2: API Layer Migration**
- Add authentication middleware to existing routes
- Add tenant_id to all database queries
- Implement rate limiting per user
- Add new cloud-specific endpoints

**Step 3: Desktop Client Updates**
- Implement sync client module
- Add connection status UI
- Implement offline queue
- Add auto-update functionality

**Step 4: Data Migration**
- Create initial admin user
- Migrate existing local users to cloud (optional)
- Sync historical projects to cloud
- Validate data integrity

### 7.2 Backward Compatibility

**Strategy**: Support both local-only and cloud modes

```typescript
// Desktop app modes
enum AppMode {
  LOCAL_ONLY = 'local',      // No cloud, works offline
  HYBRID = 'hybrid',         // Cloud sync enabled
  CLOUD_ONLY = 'cloud'       // Web-only (future)
}

// Detect mode at startup
function detectAppMode(): AppMode {
  if (process.env.CLOUD_API_URL) {
    return AppMode.HYBRID;
  }

  if (process.env.FORCE_CLOUD === 'true') {
    return AppMode.CLOUD_ONLY;
  }

  return AppMode.LOCAL_ONLY;
}

// Handle local-only mode
async function initLocalMode() {
  // Start local Express server only
  // Disable sync features
  // Skip authentication
}
```

---

## 8. Security Considerations

### 8.1 Authentication & Authorization

**JWT Configuration**:
```typescript
const jwtConfig = {
  accessToken: {
    secret: process.env.JWT_ACCESS_SECRET,
    expiresIn: '15m',
    issuer: 'toonflow'
  },
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: '7d',
    issuer: 'toonflow'
  }
};
```

**Token Refresh Flow**:
- Access token expires every 15 minutes
- Refresh token allows获取新的 access token
- Refresh token rotation on each use (recommended)
- Invalidate refresh token on password change or logout

### 8.2 API Security

**Rate Limiting**:
```typescript
const rateLimit = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window per user
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later'
};
```

**Input Validation**:
- Validate all inputs using Zod
- Sanitize user-generated content
- Prevent SQL injection (use parameterized queries)
- Implement CSRF protection

### 8.3 Data Protection

**Sensitive Data Handling**:
- Encrypt user passwords (bcrypt)
- Never log sensitive information
- Mask credit card information
- Comply with data retention policies

---

## 9. Scalability Considerations

### 9.1 Horizontal Scaling

**API Gateway**:
- Deploy behind load balancer (Nginx, HAProxy)
- Run multiple instances
- Use sticky sessions for WebSocket

**Task Queue**:
- Scale worker processes independently
- Use priority queues for different task types
- Implement dead letter queue for failed tasks

**Database**:
- Use connection pooling
- Implement read replicas for queries
- Consider database sharding for large tenants

### 9.2 Caching Strategy

**Redis Use Cases**:
- User sessions
- API response caching
- Rate limiting counters
- Task queue metadata
- Frequently accessed configuration

**Cache Invalidation**:
- TTL-based for user sessions (24h)
- Event-based for user data (on update)
- Manual for admin operations

---

## 10. Monitoring & Observability

### 10.1 Key Metrics

**Business Metrics**:
- Active users (DAU/MAU)
- Subscription conversion rate
- Revenue per user
- Task completion rate
- Average task processing time

**Technical Metrics**:
- API response time (p50, p95, p99)
- Error rate by endpoint
- Database query performance
- Queue backlog size
- Cloud infrastructure costs

### 10.2 Logging Strategy

**Log Levels**:
- ERROR: System failures requiring attention
- WARN: Potential issues (rate limits, retries)
- INFO: Key business events (user actions, task status)
- DEBUG: Detailed debugging information

**Log Aggregation**:
- Use structured JSON logging
- Centralize logs (ELK stack, Datadog, etc.)
- Implement log retention policies

---

## 11. Summary

### Key Architecture Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Multi-tenancy** | Row-level isolation | Cost-effective, simple to manage |
| **Database** | PostgreSQL | Rich features, good JSON support, proven scalability |
| **Task Queue** | Bull + Redis | Native Node.js support, reliable |
| **Authentication** | JWT with refresh tokens | Stateless, scalable, secure |
| **Payment** | Alipay + WeChat Pay | Target market requirements |
| **Sync Strategy** | Offline-first with delta sync | Best user experience |
| **Offline Support** | Local SQLite + queue | Maintain existing functionality |

### Success Criteria

1. Users can sign up, subscribe, and pay
2. Desktop app works seamlessly online and offline
3. AI tasks process reliably in the cloud
4. Admin can manage users and view analytics
5. System scales to support 10,000+ concurrent users
6. 99.9% uptime for cloud services

### Next Steps

1. Finalize cloud infrastructure requirements
2. Prototype authentication service
3. Design detailed database migration plan
4. Create desktop sync module specification
5. Estimate cloud infrastructure costs

---

*Document Version: 1.0*
*Last Updated: 2026-02-26*
*Author: Claude Research*