# Architecture - Toonflow-app

## System Overview

Toonflow 采用 Electron + Express 的混合架构，实现了桌面应用与后端 API 服务器的无缝集成。

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Pre-built Web Frontend                    │  │
│  │           (Toonflow-web project assets)                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ IPC / Local HTTP
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Express.js Backend API Server                   │
│                    (Port 60000)                              │
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐ │
│  │   Routes    │   Agents    │  Utilities  │   Database   │ │
│  │  (15 modules)│ (AI agents) │  (@/utils)  │   (SQLite)   │ │
│  └─────────────┴─────────────┴─────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External AI Services                      │
│   OpenAI │ Anthropic │ Google │ Kling │ Vidu │ More...      │
└─────────────────────────────────────────────────────────────┘
```

## Core Layers

### 1. Entry Points

**Express App (`src/app.ts`)**
- Main Express application
- Middleware registration
- Route mounting
- Error handling

**Electron Main (`scripts/main.ts`)**
- Electron app lifecycle
- Window management
- IPC handlers
- Spawns Express server

**Core Init (`src/core.ts`)**
- Process-level error handlers
- Unhandled rejection catching
- Logger initialization

### 2. Router Layer (`src/router.ts`)

Auto-generated router that scans `src/routes/` directory:

```typescript
// Auto-generated pattern
import addProject from "@/routes/project/addProject";
import getProject from "@/routes/project/getProject";

router.use("/project/add", addProject);
router.use("/project/get", getProject);
// ...
```

**Route Modules (15):**
| Module | Files | Purpose |
|--------|-------|---------|
| `index` | 1 | API index/health |
| `project` | 6 | Project CRUD |
| `novel` | 4 | Novel management |
| `outline` | 11 | Story outline & script |
| `script` | 3 | Script generation |
| `storyboard` | 11 | Storyboard creation |
| `video` | 13 | Video generation |
| `assets` | 8 | Asset management |
| `prompt` | 2 | Prompt templates |
| `setting` | 9 | App settings & AI models |
| `task` | 2 | Task queue |
| `user` | 1 | User management |
| `other` | 6 | Login, captcha, test APIs |

### 3. Agent Layer (`src/agents/`)

AI agents for complex multi-step workflows:

**outlineScript Agent**
- Class-based AI agent (`class OutlineScript`)
- Converts novels to story outlines
- Uses tool-based AI interaction
- EventEmitter for progress updates

**storyboard Agent**
- Generates image prompts from scripts
- Creates storyboard images via AI
- Handles image splitting
- Chat-based storyboard refinement

### 4. Utility Layer (`src/utils.ts`)

Centralized utility export:

```typescript
export default {
  db,           // Knex database instance
  oss,          // File storage operations
  ai: {
    text: AIText,    // Text generation
    image: AIImage,  // Image generation
    video: AIVideo,  // Video generation
  },
  error,        // Error normalization
  uuid,         // UUID generation
  // ... other utilities
};
```

**Usage pattern:**
```typescript
import u from "@/utils";

const data = await u.db("t_project").select("*");
const result = await u.ai.text.stream({ prompt: "..." });
```

### 5. Database Layer

**Schema (`src/types/database.d.ts`)**
Auto-generated TypeScript types from SQLite schema:

```typescript
interface DB {
  t_project: ProjectRow;
  t_novel: NovelRow;
  t_outline: OutlineRow;
  // ... 13 more tables
}

type TableName = keyof DB & string;
type RowType<TName extends TableName> = DB[TName];
```

**Query Pattern:**
```typescript
// Select
const projects = await u.db("t_project")
  .where("userId", userId)
  .select("*");

// Insert
await u.db("t_outline").insert({
  projectId,
  data: JSON.stringify(outline),
  createTime: Date.now(),
});

// Update
await u.db("t_novel")
  .where({ id: novelId })
  .update({ title: newTitle });

// Delete
await u.db("t_video")
  .where({ id: videoId })
  .del();
```

### 6. AI Integration Layer (`src/utils/ai/`)

Unified AI interface supporting multiple providers:

```
src/utils/ai/
├── text/           # LLM text generation
│   └── index.ts    # stream() and invoke()
├── image/          # Image generation
│   ├── index.ts    # Main image AI interface
│   ├── modelList.ts # Available models
│   └── owned/      # Provider-specific implementations
│       ├── kling.ts
│       ├── gemini.ts
│       └── apimart.ts
└── video/          # Video generation
    └── index.ts    # Video generation interface
```

**AI Call Pattern:**
```typescript
// Text generation with streaming
const { fullStream } = await u.ai.text.stream(
  {
    system: "You are a story writer",
    tools: [getStoryline, createOutline],
    messages: [{ role: "user", content: novel }],
    maxStep: 100,
  },
  { model: "claude-sonnet-4-20250514" }
);

// Image generation
const imageUrl = await u.ai.image(
  { prompt: "anime character, blue hair" },
  {
    model: "kling-model",
    apiKey: process.env.KLING_KEY,
    manufacturer: "kling",
  }
);
```

## Data Flow

### Novel to Video Workflow

```
1. User imports novel
   └─> POST /novel/addNovel
       └─> INSERT t_novel

2. Generate outline
   └─> POST /outline/agentsOutline
       └─> OutlineScript.call(novel)
           └─> u.ai.text.stream()
               └─> AI generates outline
       └─> INSERT t_outline

3. Generate storyboard
   └─> POST /storyboard/generateStoryboardApi
       └─> storyboard agent
           └─> u.ai.image() for each scene
       └─> INSERT t_assets (images)

4. Generate video
   └─> POST /video/generateVideo
       └─> u.ai.video() with storyboard images
       └─> INSERT t_video
```

## Middleware Chain

```typescript
// Request flow
Request
  │
  ▼
cors()                    // CORS handling
  │
  ▼
express.json()            // Body parsing
  │
  ▼
validateFields()          // Zod validation (per-route)
  │
  ▼
Route Handler             // Business logic
  │
  ▼
Response Format           // success() / error()
  │
  ▼
Response
```

## Error Handling Architecture

```typescript
// Global error handler (app.ts)
app.use((err, _, res, next) => {
  res.locals.message = err.message;
  res.locals.error = err;
  console.error(err);
  res.status(err.status || 500).send(err);
});

// Process-level handlers (core.ts)
process.on('unhandledRejection', (reason) => {
  logger.error('[未处理的 Promise 拒绝]', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('[未捕获的异常]', error);
});
```

## Class-Based Agent Pattern

```typescript
export default class OutlineScript {
  private readonly projectId: number;
  readonly emitter = new EventEmitter();

  constructor(projectId: number) {
    this.projectId = projectId;
  }

  // Public API
  async call(msg: string): Promise<string> {
    // Multi-step AI workflow
  }

  // Tool definitions for AI
  getStoryline = tool({
    title: "getStoryline",
    description: "获取故事线",
    inputSchema: z.object({}),
    execute: async () => {
      const data = await u.db("t_storyline")
        .where("projectId", this.projectId)
        .first();
      return data;
    },
  });
}
```

## Configuration Flow

1. **Environment Loading (`src/env.ts`)**
   ```typescript
   const isElectron = typeof process.versions?.electron !== "undefined";
   const env = process.env.NODE_ENV ?? (isPackaged ? "prod" : "dev");
   // Auto-creates .env.dev or .env.prod
   ```

2. **Database Initialization**
   ```typescript
   // src/lib/initDB.ts
   const db = knex({
     client: 'better-sqlite3',
     connection: { filename: './data/app.db' },
     useNullAsDefault: true,
   });
   ```

3. **AI Model Configuration**
   - Stored in `t_aiModelMap` table
   - Loaded via `/setting/getAiModelMap`
   - Applied per AI call based on task type

## Security Architecture

### Path Traversal Prevention
```typescript
function resolveSafeLocalPath(userPath: string, rootDir: string): string {
  const safePath = normalizeUserPath(userPath);
  const absPath = path.join(rootDir, safePath);
  if (!isPathInside(absPath, rootDir)) {
    throw new Error("路径不在安全范围内");
  }
  return absPath;
}
```

### JWT Authentication
```typescript
// Token verification middleware
const setting = await u.db("t_setting")
  .where("id", 1)
  .select("tokenKey")
  .first();

const decoded = jwt.verify(token, tokenKey);
(req as any).user = decoded;
```

## Logging Architecture

Custom logger (`src/logger.ts`) that intercepts console methods:

```typescript
class Logger {
  init(): this {
    // Creates logs/app.log
    // Hijacks console.log, console.error, etc.
    return this;
  }

  private write(level: LogLevel, args: unknown[]): void {
    // Format: [2026-02-26 14:30:45.123] [INFO] Message
    // Writes to file and console
  }
}
```

## Build Output Structure

```
build/
├── app.js           # Bundled Express app
├── main.js          # Electron main process
└── web/             # Frontend assets (pre-built)
    ├── index.html
    ├── assets/
    └── ...
```
