# External Integrations - Toonflow-app

## Overview

Toonflow integrates with multiple external AI services for text, image, and video generation. All AI integrations are managed through the Vercel AI SDK (`ai` v6) with provider-specific packages.

## AI Service Providers

### Text Generation (LLM)

| Provider | Package | Models |
|----------|---------|--------|
| OpenAI | @ai-sdk/openai | GPT-4, GPT-3.5-turbo |
| Anthropic | @ai-sdk/anthropic | Claude 3.5/4 Sonnet, Opus |
| Google | @ai-sdk/google | Gemini Pro, Gemini 1.5 |
| DeepSeek | @ai-sdk/deepseek | DeepSeek V2/V3 |
| xAI | @ai-sdk/xai | Grok-1.5, Grok-2 |
| Alibaba | qwen-ai-provider | Qwen 2.5 |
| Zhipu | zhipu-ai-provider | GLM-4 |

### Image Generation

| Provider | Location | Models |
|----------|----------|--------|
| Kling AI | `src/utils/ai/image/owned/kling.ts` | Kling Image v1 |
| Google Gemini | `src/utils/ai/image/owned/gemini.ts` | Imagen 3 |
| APIMart | `src/utils/ai/image/owned/apimart.ts` | Multiple providers |

### Video Generation

| Provider | Models |
|----------|--------|
| Sora | OpenAI Sora |
| Vidu | Vidu Studio |
| RunningHub | Various video models |
| Volcengine | Doubao Video |
| Wan | Wan 2.1 |
| Zhipu | CogVideo |

## Integration Pattern

### Unified AI Interface

All AI services are accessed through `src/utils.ts`:

```typescript
import u from "@/utils";

// Text generation
const { fullStream } = await u.ai.text.stream(input, config);

// Image generation
const imageUrl = await u.ai.image(input, config);

// Video generation
const videoPath = await u.ai.video(input, config);
```

### Configuration Storage

AI model configurations stored in database:

```sql
-- t_aiModelMap table
id | taskType | provider | model | apiKey | baseURL | isEnabled
---|----------|----------|-------|--------|---------|----------
1  | outline  | anthropic | claude-sonnet | *** | https://... | 1
2  | image    | kling    | kling-v1 | *** | https://... | 1
3  | video    | vidu     | vidu-v1 | *** | https://... | 1
```

Loaded via `/setting/getAiModelMap` endpoint.

## Authentication Methods

### API Key Authentication

Most providers use API key auth:

```typescript
// Environment variables
process.env.OPENAI_API_KEY
process.env.ANTHROPIC_API_KEY
process.env.GEMINI_API_KEY
process.env.KLING_API_KEY
```

### JWT Token

User authentication for app access:

```typescript
// Token stored in t_setting
const setting = await u.db("t_setting")
  .where("id", 1)
  .select("tokenKey")
  .first();

const decoded = jwt.verify(token, setting.tokenKey);
```

## Database Integration

### SQLite (Embedded)

```typescript
import u from "@/utils";

// Knex.js query builder
const data = await u.db("t_project")
  .where({ userId })
  .select("*");
```

### Connection Configuration

```typescript
// src/lib/initDB.ts
const db = knex({
  client: 'better-sqlite3',
  connection: {
    filename: './data/app.db'
  },
  useNullAsDefault: true
});
```

## File Storage

### Local File System (OSS)

```typescript
// src/utils.ts - oss module
await u.oss.saveFile(buffer, filePath);
await u.oss.getImageBase64(filePath);
await u.oss.fileExists(filePath);
```

### Path Security

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

## HTTP Client

### Axios with Retry

```typescript
import axios from "axios";
import axiosRetry from "axios-retry";

const client = axios.create({
  baseURL: "https://api.provider.com",
  timeout: 30000,
});

axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});
```

## WebSocket Integration

### express-ws

```typescript
import expressWs from "express-ws";

const app = express();
expressWs(app);

// WebSocket route
app.ws("/ws", (ws, req) => {
  ws.on("message", (msg) => {
    // Handle message
  });
});
```

## Environment Variables

### Required Variables

```bash
# AI Provider Keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
KLING_API_KEY=
VIDU_API_KEY=

# Database
DATABASE_PATH=./data/app.db

# JWT
JWT_SECRET=

# Server
PORT=60000
NODE_ENV=dev
```

### Auto-Generated Variables

`src/env.ts` auto-creates environment files:

```typescript
const isElectron = typeof process.versions?.electron !== "undefined";
const env = process.env.NODE_ENV ?? (isPackaged ? "prod" : "dev");
// Creates .env.dev or .env.prod
```

## API Endpoints

### External AI APIs

| Service | Base URL | Purpose |
|---------|----------|---------|
| OpenAI | https://api.openai.com/v1 | GPT models |
| Anthropic | https://api.anthropic.com/v1 | Claude models |
| Google | https://generativelanguage.googleapis.com | Gemini/Imagen |
| Kling | https://api.kwai-pro.com | Kling AI |
| DeepSeek | https://api.deepseek.com | DeepSeek models |

### Internal API Routes

Express server runs on port 60000:

| Route Module | Endpoints |
|--------------|-----------|
| `/project/*` | /add, /get, /update, /del |
| `/novel/*` | /add, /get, /update, /del |
| `/outline/*` | /add, /get, /update, /del, /agentsOutline |
| `/storyboard/*` | /generate, /save, /chat |
| `/video/*` | /generate, /get, /addConfig |
| `/assets/*` | /add, /get, /save |
| `/setting/*` | /getSetting, /getAiModelMap |
| `/other/*` | /login, /getCaptcha, /testAI |

## Rate Limiting

AI provider rate limits handled via axios-retry:

```typescript
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000; // Exponential backoff
  },
  retryCondition: (error) => {
    return error.response?.status === 429; // Rate limited
  },
});
```

## Error Handling

### AI Call Errors

```typescript
try {
  const result = await u.ai.text.invoke(input, config);
} catch (error) {
  const normalized = u.error(error);
  // { name, message, status, ... }
}
```

### Provider-Specific Errors

```typescript
// Axios errors (network/API issues)
if (error.response?.status === 401) {
  throw new Error("API key invalid");
}
if (error.response?.status === 429) {
  throw new Error("Rate limit exceeded");
}
if (error.response?.status === 500) {
  throw new Error("Provider server error");
}
```

## Model Configuration UI

Settings managed via `/setting` routes:

- `addModel.ts` - Add new AI model
- `delModel.ts` - Remove model
- `updateModel.ts` - Update model config
- `getAiModelMap.ts` - Get all model mappings
- `getVideoModelList.ts` - Get available video models
- `configurationModel.ts` - Configure model settings

## Security Considerations

### API Key Storage

- Keys stored in environment variables or database
- Never logged or exposed in responses
- Encrypted at rest (recommended for production)

### JWT Token

```typescript
const token = jwt.sign({ userId }, secretKey, { expiresIn: "7d" });
```

### CORS Configuration

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
```
