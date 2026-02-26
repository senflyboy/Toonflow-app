# Tech Stack - Toonflow-app

## Overview

Toonflow 是一款 AI 短剧/视频制作桌面应用，能够利用 AI 技术将小说自动转化为剧本，并结合 AI 生成的图片和视频实现高效的短剧创作。

**应用类型**: Electron 桌面应用 + 嵌入式 Express 后端 API 服务器

## Core Technology Stack

### Runtime & Language

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | >= 23.11.1 (recommended 24.x) | Runtime environment |
| TypeScript | 5.9.3 | Primary language |
| Yarn | 1.x | Package manager |

### Backend Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Express.js | 5.2.1 | Web framework |
| express-ws | 5.0.2 | WebSocket support |
| cors | 2.8.5 | CORS middleware |
| morgan | 1.10.1 | HTTP request logger |

### Desktop Application

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 40.x | Desktop app framework |
| electron-builder | 26.4.0 | App packaging |
| electronmon | 2.0.4 | Electron hot reload |

### Database

| Technology | Version | Purpose |
|------------|---------|---------|
| SQLite | - | Embedded database |
| better-sqlite3 | 12.6.2 | SQLite driver |
| knex | 3.1.0 | SQL query builder |
| @rmp135/sql-ts | 2.2.0 | Database type generator |

### AI Integration (Vercel AI SDK)

| Package | Version | Provider |
|---------|---------|----------|
| ai | 6.0.67 | Core AI SDK |
| @ai-sdk/openai | 3.0.25 | OpenAI models |
| @ai-sdk/anthropic | 3.0.35 | Anthropic Claude |
| @ai-sdk/google | 3.0.20 | Google Gemini |
| @ai-sdk/deepseek | 2.0.17 | DeepSeek models |
| @ai-sdk/xai | 3.0.47 | xAI (Grok) |
| @ai-sdk/openai-compatible | 2.0.27 | OpenAI-compatible APIs |
| qwen-ai-provider | 0.1.1 | Alibaba Qwen |
| zhipu-ai-provider | 0.2.2 | Zhipu AI |

### Utilities & Tools

| Package | Version | Purpose |
|---------|---------|---------|
| axios | 1.13.2 | HTTP client |
| axios-retry | 4.5.0 | Axios retry logic |
| zod | 4.3.5 | Schema validation |
| jsonwebtoken | 9.0.3 | JWT authentication |
| sharp | 0.34.5 | Image processing |
| form-data | 4.0.5 | FormData for uploads |
| fast-glob | 3.3.3 | File pattern matching |
| uuid | 13.0.0 | UUID generation |
| js-md5 | 0.8.3 | MD5 hashing |
| dotenv | 17.2.3 | Environment variables |
| cors | 2.8.5 | CORS handling |
| serialize-error | 13.0.1 | Error serialization |
| best-effort-json-parser | 1.2.1 | Lenient JSON parsing |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| tsx | 4.21.0 | TypeScript execution |
| nodemon | 3.1.11 | Development auto-reload |
| cross-env | 10.1.0 | Cross-platform env vars |
| @types/* | - | TypeScript type definitions |

## Directory Structure

```
Toonflow-app/
├── src/                      # Main source code
│   ├── agents/               # AI agent modules
│   │   ├── outlineScript/    # Outline/script generation agent
│   │   └── storyboard/       # Storyboard generation agent
│   ├── lib/                  # Shared libraries
│   ├── middleware/           # Express middleware
│   ├── routes/               # API route handlers (15 modules)
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Utility functions
│   │   └── ai/               # AI utilities
│   │       ├── text/         # Text generation
│   │       ├── image/        # Image generation
│   │       └── video/        # Video generation
│   ├── app.ts                # Express app entry
│   ├── core.ts               # Core initialization
│   ├── env.ts                # Environment handling
│   ├── err.ts                # Error handling
│   ├── logger.ts             # Custom logger
│   ├── utils.ts              # Main utilities export
│   └── router.ts             # Auto-generated router
├── scripts/                  # Build scripts
│   ├── build.ts              # Build configuration
│   └── main.ts               # Electron main process
├── docker/                   # Docker deployment configs
└── package.json
```

## Build Configuration

### Build Script (scripts/build.ts)

Uses esbuild for bundling:

```typescript
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

### Path Alias

`@/` alias configured for `src/` directory in esbuild and tsx.

## npm Scripts

```json
{
  "dev": "nodemon --inspect --exec tsx src/app.ts",
  "dev:gui": "electronmon -r tsx scripts/main.ts",
  "lint": "tsc --noEmit",
  "build": "cross-env NODE_ENV=prod tsx scripts/build.ts",
  "dist": "electron-builder",
  "dist:win": "electron-builder --win",
  "dist:mac": "electron-builder --mac",
  "dist:linux": "electron-builder --linux",
  "test": "cross-env NODE_ENV=prod node build/app.js",
  "docker:build": "docker-compose -f docker/docker-compose.yml up -d --build",
  "docker:local": "docker-compose -f docker/docker-compose.local.yml up -d --build",
  "debug:ai": "npx @ai-sdk/devtools",
  "license": "bun run scripts/license.ts"
}
```

## AI Providers Configuration

The app integrates multiple AI providers through a unified interface in `src/utils/ai/`:

### Text Generation (LLM)
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- DeepSeek
- xAI (Grok)
- Alibaba Qwen
- Zhipu AI

### Image Generation
- Kling AI
- Google Gemini
- Custom providers via openai-compatible

### Video Generation
- Sora
- Vidu
- RunningHub
- Volcengine
- Wan
- Zhipu

## Database Schema

16 tables managed via Knex.js:

| Table | Purpose |
|-------|---------|
| t_project | Project management |
| t_novel | Novel source storage |
| t_outline | Story outlines |
| t_script | Scripts |
| t_storyline | Story lines |
| t_assets | Asset management |
| t_image | Generated images |
| t_video | Generated videos |
| t_videoConfig | Video configurations |
| t_config | App configurations |
| t_aiModelMap | AI model mappings |
| t_setting | User settings |
| t_user | User accounts |
| t_prompts | Prompt templates |
| t_taskList | Task queue |
| t_chatHistory | Chat history |

## Environment Configuration

Environment files auto-created by `src/env.ts`:
- `.env.dev` - Development environment
- `.env.prod` - Production/Electron environment

Auto-detection based on `process.versions.electron` and `app.isPackaged`.
