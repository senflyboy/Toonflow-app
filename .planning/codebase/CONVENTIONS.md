# Coding Conventions - Toonflow-app

## Overview

This document outlines the coding conventions, style patterns, and error handling approaches used throughout the Toonflow-app codebase.

## Technology Stack Summary

- **Runtime**: Node.js >= 23.11.1 (recommended 24.x)
- **Language**: TypeScript 5.9.3
- **Backend**: Express.js 5.x with WebSocket support
- **Database**: SQLite via Better-SQLite3 + Knex.js
- **AI Integration**: Vercel AI SDK (ai v6)

## Code Style

### File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Route files | camelCase action+Entity | `addProject.ts`, `getOutline.ts` |
| Utility files | camelCase | `responseFormat.ts` |
| Type definitions | PascalCase + `.d.ts` | `database.d.ts` |
| Directories | lowercase with hyphens | `outlineScript/`, `ai/image/` |
| Agent files | camelCase | `generateImageTool.ts` |

### Variable Naming

```typescript
// Constants - camelCase for regular, UPPER_SNAKE_CASE for true constants
const projectId = 1;
const MAX_RETRY_COUNT = 3;

// Variables - camelCase
const novelInfo = await getNovel();

// Functions - camelCase
async function generateVideo() { }

// Classes - PascalCase
class OutlineScript { }

// Interfaces/Types - PascalCase
interface ApiResponse { }
type ProjectId = number;
```

### Import Patterns

```typescript
// Path alias using @/ for src directory
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

// Third-party imports
import express from "express";
import { z } from "zod";

// Named imports preferred for utilities
import { compressImage, mergeImages } from "@/utils/imageTools";
```

### Type Annotations

```typescript
// Interface definitions
interface ApiResponse {
  code: number;
  data: any;
  message: string;
}

// Type aliases from database
type TableName = keyof DB & string;
type RowType<TName extends TableName> = DB[TName];

// Generic type constraints
interface AIInput<T extends Record<string, z.ZodTypeAny> | undefined = undefined> {
  system?: string;
  tools?: Record<string, Tool>;
  maxStep?: number;
  output?: T;
  prompt?: string;
}
```

## Architectural Patterns

### Route Handler Pattern

All route handlers follow a consistent structure:

```typescript
import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    name: z.string(),
  }),
  async (req, res) => {
    const { projectId, name } = req.body;

    await u.db("t_project").insert({ name, projectId });

    res.status(200).send(success({ message: "Success" }));
  }
);
```

### Utility Module Pattern

The `utils.ts` file exports a unified utility object:

```typescript
export default {
  db,           // Database access
  oss,          // File storage operations
  ai: {
    text: AIText,
    image: AIImage,
    video: AIVideo,
  },
  error,        // Error normalization
  uuid,         // UUID generation
};
```

### Database Access Pattern

Using Knex.js with type-safe database access:

```typescript
// Import types from auto-generated database types
import type { DB } from "@/types/database";

// Query pattern
const data = await u.db("t_outline")
  .where("projectId", projectId)
  .select("*");

// Insert pattern
await u.db("t_project").insert({
  name,
  createTime: Date.now(),
});

// Update pattern
await u.db("t_outline")
  .where({ id })
  .update({ data: JSON.stringify(data) });
```

### AI Integration Pattern

Unified AI interface for text, image, and video generation:

```typescript
// Text generation
const { fullStream } = await u.ai.text.stream(
  {
    system: prompt,
    tools: myTools,
    messages: [{ role: "user", content: context }],
    maxStep: 100,
  },
  config
);

// Image generation
const imageUrl = await u.ai.image(input, {
  model,
  apiKey,
  baseURL,
  manufacturer,
});

// Video generation
const videoPath = await u.ai.video(input, config);
```

### Class-Based Agent Pattern

For complex AI agents, use class-based structure:

```typescript
export default class OutlineScript {
  private readonly projectId: number;
  readonly emitter = new EventEmitter();

  constructor(projectId: number) {
    this.projectId = projectId;
  }

  // Public methods
  async call(msg: string): Promise<string> {
    // Implementation
  }

  // Private helper methods
  private async findStoryline() {
    // Implementation
  }

  // Tool definitions for AI
  getStoryline = tool({
    title: "getStoryline",
    description: "Get storyline",
    inputSchema: z.object({}),
    execute: async () => {
      // Implementation
    },
  });
}
```

## Error Handling

### Error Normalization

The codebase uses a centralized error normalization utility:

```typescript
// src/utils/error.ts
export function normalizeError(error: unknown): NormalizedError {
  // Axios special handling
  if (isAxiosError(error)) {
    return {
      name: "AxiosError",
      message: error.response?.data?.message || error.message,
      status: error.response?.status,
    };
  }

  // Standard Error handling
  if (error instanceof Error) {
    const serialized = serializeError(error);
    return {
      name: serialized.name || "Error",
      message: serialized.message || "未知错误",
    };
  }

  // Unknown error types
  return {
    name: "UnknownError",
    message: String(error),
  };
}
```

### Response Format

Consistent API response format:

```typescript
// Success response
export function success<T>(data: T | null = null, message: string = "成功"): ApiResponse {
  return {
    code: 200,
    data,
    message,
  };
}

// Error response
export function error<T>(message: string = "", data: T | null = null): ApiResponse {
  return {
    code: 400,
    data,
    message,
  };
}
```

### Express Error Handling

Global error handling middleware:

```typescript
// 404 handler
app.use((_, res, next: NextFunction) => {
  return res.status(404).send({ message: "Not Found" });
});

// Error handler
app.use((err: any, _: Request, res: Response, __: NextFunction) => {
  res.locals.message = err.message;
  res.locals.error = err;
  console.error(err);
  res.status(err.status || 500).send(err);
});
```

### Process-Level Error Handling

Unhandled rejection and exception handlers:

```typescript
// src/core.ts
process.on('unhandledRejection', (reason, promise) => {
  console.error('[未处理的 Promise 拒绝]');
});

process.on('uncaughtException', (error) => {
  console.error('[未捕获的异常]');
});
```

## Validation

### Schema Validation with Zod

All input validation uses Zod schemas:

```typescript
import { z } from "zod";
import { zhCN } from "zod/locales";

z.config(zhCN());

// Middleware validation
export function validateFields(
  shape: Record<string, ZodTypeAny>,
  source: "body" | "query" | "params" = "body",
) {
  const schema = z.object(shape);

  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) =>
        `字段 ${issue.path.join(".")} ${issue.message}`
      );
      return res.status(400).json({ message: "参数错误", errors });
    }
    next();
  };
}
```

### Complex Schema Examples

```typescript
const episodeSchema = z.object({
  episodeIndex: z.number().describe("集数索引"),
  title: z.string().describe("8 字内标题"),
  chapterRange: z.array(z.number()).describe("关联章节号数组"),
  scenes: z.array(sceneItemSchema).describe("场景列表"),
  keyEvents: z.array(z.string()).length(4).describe("4 个元素：[起，承，转，合]"),
});
```

## Logging

### Custom Logger

The codebase uses a custom logger that hijacks console methods:

```typescript
// src/logger.ts
class Logger {
  init(): this {
    // Creates log file in logs/app.log
    // Hijacks console.log, console.error, etc.
    return this;
  }

  private write(level: LogLevel, args: unknown[]): void {
    // Format: [2026-02-26 14:30:45.123] [INFO] Message
  }
}

const logger = new Logger().init();
export default logger;
```

## Async Patterns

### Async/Await Usage

Consistent use of async/await:

```typescript
// Async function declaration
async function generateVideoAsync(...) {
  try {
    const data = await u.db("t_project").first();
    const results = await Promise.all(
      fileUrl.map(async (path) => u.oss.getImageBase64(path))
    );
    return results;
  } catch (err) {
    console.error("Error:", err);
    throw err;
  }
}
```

### Promise Handling

```typescript
// Parallel execution
const [novelInfo, storyline, outlineCount] = await Promise.all([
  this.getNovelInfo(true),
  this.findStoryline(),
  u.db("t_outline").count().first(),
]);

// Sequential with Promise.all for independent operations
const results = await Promise.allSettled(
  ids.map((id) => u.deleteOutline(id, this.projectId))
);
```

## Comments and Documentation

### JSDoc Style

```typescript
/**
 * 压缩多张图片到指定大小以内
 * @param imageBase64 - base64 编码的图片
 * @param maxSize - 最大输出大小
 * @returns 压缩后的图片 base64 字符串
 */
```

### Section Dividers

Large files use section dividers:

```typescript
// ==================== 类型定义 ====================

// ==================== Schema 定义 ====================

// ==================== 常量配置 ====================

// ==================== 主类 ====================

// ==================== 公共方法 ====================

// ==================== 私有工具方法 ====================
```

### Inline Comments

Chinese comments are used throughout for consistency:

```typescript
// 从 header 或 query 参数获取 token
// 白名单路径
// 异步生成视频
```

## Build and Deployment

### Environment Variables

```typescript
// src/env.ts handles environment loading
const isElectron = typeof process.versions?.electron !== "undefined";
const isPackaged = isElectron ? app.isPackaged : false;
const env = process.env.NODE_ENV ?? (isPackaged ? "prod" : "dev");
```

### Build Configuration

```typescript
// scripts/build.ts uses esbuild
const appBuildConfig: esbuild.BuildOptions = {
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: false,
  format: "cjs",
  outfile: `build/app.js`,
  platform: "node",
  target: "esnext",
  alias: { "@": "./src" },
  external: ["electron", "sqlite3", "better-sqlite3"],
};
```

## Security Considerations

### Path Traversal Prevention

```typescript
function resolveSafeLocalPath(userPath: string, rootDir: string): string {
  const safePath = normalizeUserPath(userPath);
  const absPath = path.join(rootDir, safePath);
  if (!isPathInside(absPath, rootDir)) {
    throw new Error(`${userPath} 不在 OSS 根目录内`);
  }
  return absPath;
}
```

### JWT Authentication

```typescript
const setting = await u.db("t_setting")
  .where("id", 1)
  .select("tokenKey")
  .first();

const decoded = jwt.verify(token, tokenKey as string);
(req as any).user = decoded;
```

## Code Generation

### Auto-Generated Files

Some files are auto-generated and should not be manually edited:

- `src/types/database.d.ts` - Generated from SQLite schema
- `src/router.ts` - Generated from routes directory

Both files include hash markers to detect changes:

```typescript
// @db-hash 5a633f2d45df5d971905dd32c0ac9880
// 该文件由脚本自动生成，请勿手动修改
```
