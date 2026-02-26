# Directory Structure - Toonflow-app

## Root Level

```
Toonflow-app/
├── .planning/              # GSD planning documents
├── build/                  # Compiled output (generated)
├── data/                   # SQLite database storage
├── docker/                 # Docker deployment configs
├── logs/                   # Application logs
├── public/                 # Static assets
├── scripts/                # Build and entry scripts
├── src/                    # Main source code
├── .gitignore
├── CLAUDE.md               # Claude Code instructions
├── package.json
├── tsconfig.json
└── yarn.lock
```

## Source Directory (src/)

```
src/
├── agents/                 # AI agent modules
│   ├── outlineScript/      # Novel-to-outline agent
│   │   └── index.ts        # OutlineScript class
│   └── storyboard/         # Storyboard generation
│       ├── index.ts        # Main storyboard agent
│       ├── generateImagePromptsTool.ts
│       ├── generateImageTool.ts
│       └── imageSplitting.ts
│
├── lib/                    # Shared libraries
│   ├── fixDB.ts           # Database fix utilities
│   ├── initDB.ts          # Database initialization
│   └── responseFormat.ts  # Response format helpers
│
├── middleware/             # Express middleware
│   └── middleware.ts      # validateFields, auth, etc.
│
├── routes/                 # API route handlers
│   ├── assets/            # Asset management (8 files)
│   ├── novel/             # Novel management (4 files)
│   ├── outline/           # Outline & script (11 files)
│   ├── project/           # Project CRUD (6 files)
│   ├── script/            # Script generation (3 files)
│   ├── storyboard/        # Storyboard ops (11 files)
│   ├── video/             # Video generation (13 files)
│   ├── prompt/            # Prompt templates (2 files)
│   ├── setting/           # App settings (9 files)
│   ├── task/              # Task queue (2 files)
│   ├── user/              # User management (1 file)
│   ├── other/             # Misc endpoints (6 files)
│   └── index/             # API index (1 file)
│
├── types/                  # TypeScript types
│   └── database.d.ts      # Auto-generated DB types
│
├── utils/                  # Utility functions
│   └── ai/                # AI utilities
│       ├── text/          # Text generation
│       │   └── index.ts
│       ├── image/         # Image generation
│       │   ├── index.ts
│       │   ├── modelList.ts
│       │   └── owned/     # Provider implementations
│       └── video/         # Video generation
│           └── index.ts
│
├── app.ts                  # Express app entry
├── core.ts                 # Core initialization
├── env.ts                  # Environment handling
├── err.ts                  # Error handling
├── logger.ts               # Custom logger
├── router.ts               # Auto-generated router
└── utils.ts                # Main utilities export
```

## Key File Locations

### Entry Points

| File | Purpose |
|------|---------|
| `src/app.ts` | Express app creation and configuration |
| `scripts/main.ts` | Electron main process entry |
| `src/core.ts` | Process-level initialization |

### Configuration

| File | Purpose |
|------|---------|
| `src/env.ts` | Environment detection and loading |
| `package.json` | Dependencies and npm scripts |
| `tsconfig.json` | TypeScript configuration |

### Core Infrastructure

| File | Purpose |
|------|---------|
| `src/router.ts` | Auto-generated route registration |
| `src/utils.ts` | Centralized utility exports |
| `src/logger.ts` | Custom logging system |
| `src/err.ts` | Error normalization |

### Database

| File | Purpose |
|------|---------|
| `src/lib/initDB.ts` | Database initialization |
| `src/lib/fixDB.ts` | Database migration/fixes |
| `src/types/database.d.ts` | Auto-generated type definitions |

### AI Integration

| Directory | Purpose |
|-----------|---------|
| `src/utils/ai/text/` | LLM text generation |
| `src/utils/ai/image/` | Image generation (Kling, Gemini, etc.) |
| `src/utils/ai/video/` | Video generation (Sora, Vidu, etc.) |

## Route Handler Naming Convention

Files follow `action + Entity` pattern:

```
src/routes/
├── project/
│   ├── addProject.ts       # POST /project/add
│   ├── getProject.ts       # POST /project/get
│   ├── getSingleProject.ts # POST /project/getSingle
│   ├── updateProject.ts    # POST /project/update
│   ├── delProject.ts       # POST /project/del
│   └── getProjectCount.ts  # POST /project/getCount
│
├── novel/
│   ├── addNovel.ts         # POST /novel/add
│   ├── getNovel.ts         # POST /novel/get
│   ├── updateNovel.ts      # POST /novel/update
│   └── delNovel.ts         # POST /novel/del
│
├── outline/
│   ├── addOutline.ts       # POST /outline/add
│   ├── getOutline.ts       # POST /outline/get
│   ├── updateOutline.ts    # POST /outline/update
│   ├── delOutline.ts       # POST /outline/del
│   ├── agentsOutline.ts    # POST /outline/agentsOutline (AI)
│   ├── getStoryline.ts     # POST /outline/getStoryline
│   ├── updateStoryline.ts  # POST /outline/updateStoryline
│   └── getPartScript.ts    # POST /outline/getPartScript
│
└── ... (similar patterns for other modules)
```

## Route Registration Pattern

Routes are auto-registered in `src/router.ts`:

```typescript
// Auto-generated section
import addProject from "@/routes/project/addProject";
import getProject from "@/routes/project/getProject";
// ... more imports

// Route mounting
router.use("/project/add", addProject);
router.use("/project/get", getProject);
// ... more routes
```

## AI Agent Structure

### outlineScript Agent

```
src/agents/outlineScript/
└── index.ts
    ├── class OutlineScript
    │   ├── constructor(projectId: number)
    │   ├── async call(msg: string): Promise<string>
    │   ├── async getNovelInfo(): Promise<NovelData>
    │   ├── async findStoryline(): Promise<StorylineData>
    │   └── tools: {
    │       getStoryline: tool(...)
    │       createOutline: tool(...)
    │       // ... more AI tools
    │   }
```

### storyboard Agent

```
src/agents/storyboard/
├── index.ts                    # Main agent class
├── generateImagePromptsTool.ts # Tool: Generate image prompts
├── generateImageTool.ts        # Tool: Generate images via AI
└── imageSplitting.ts           # Utility: Split images
```

## Utility Module Exports

`src/utils.ts` exports unified utility object:

```typescript
import u from "@/utils";

// Database
u.db("t_project").select("*");

// AI
await u.ai.text.stream(...);
await u.ai.image(...);
await u.ai.video(...);

// File storage
await u.oss.saveFile(...);

// Error handling
u.error(err);

// Utilities
const id = u.uuid();
```

## Type Definitions

### Database Types (`src/types/database.d.ts`)

Auto-generated from SQLite schema:

```typescript
interface DB {
  t_project: {
    id: number;
    name: string;
    intro: string;
    type: string;
    artStyle: string;
    videoRatio: string;
    createTime: number;
    updateTime: number;
  };
  // ... 15 more tables
}

type TableName = keyof DB & string;
type RowType<TName extends TableName> = DB[TName];
```

## Scripts Directory

```
scripts/
├── build.ts              # esbuild configuration
├── main.ts               # Electron main process
└── web/                  # Pre-built frontend assets
    ├── index.html
    ├── assets/
    └── ...
```

## Docker Configuration

```
docker/
├── docker-compose.yml         # Production deployment
├── docker-compose.local.yml   # Local development
├── Dockerfile                 # Container definition
└── config/                    # Container configs
```

## Build Output

```
build/
├── app.js                # Bundled Express app
├── main.js               # Bundled Electron main
└── web/                  # Frontend assets
    ├── index.html
    └── assets/
```

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Route files | camelCase action+Entity | `addProject.ts`, `getOutline.ts` |
| Utility files | camelCase | `responseFormat.ts`, `normalizeUserPath.ts` |
| Type definitions | PascalCase | `database.d.ts` |
| Agent files | camelCase | `index.ts`, `generateImageTool.ts` |
| Directories | lowercase with hyphens | `outlineScript/`, `ai/image/` |

## Path Alias

`@/` maps to `src/` directory:

```typescript
import u from "@/utils";           // src/utils.ts
import { success } from "@/lib/responseFormat"; // src/lib/responseFormat.ts
```
