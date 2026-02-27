# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Toonflow** is an AI-powered short drama/video production desktop application that automatically converts novels into scripted video content. It provides a complete workflow: character generation → script generation → storyboard creation → video synthesis.

Application type: Electron desktop app with embedded Express backend API server.

## Common Commands

```bash
# Install dependencies
yarn install

# Development - Backend API only (port 60000)
yarn dev

# Development - Backend + Electron desktop app
yarn dev:gui

# Production build
yarn build

# Package for distribution
yarn dist:win    # Windows (NSIS installer)
yarn dist:mac    # macOS (DMG)
yarn dist:linux  # Linux (AppImage/deb)

# Type checking
yarn lint
```

## Architecture

### Technology Stack

- **Runtime**: Node.js >= 23.11.1 (recommended 24.x)
- **Package Manager**: Yarn 1.x
- **Language**: TypeScript 5.9.3
- **Backend**: Express.js 5.x with WebSocket (express-ws)
- **Desktop**: Electron 40.x + electron-builder
- **Database**: SQLite via Better-SQLite3 + Knex.js query builder
- **AI Integration**: Vercel AI SDK (ai v6) with multiple providers

### Multi-Provider AI Support

The codebase integrates multiple AI providers through @ai-sdk:
- OpenAI, Anthropic, Google, DeepSeek, xAI
- Custom providers: Kling (image), Vidu (video), RunningHub, Volcengine, Wan, Zhipu

AI utilities are located in `src/utils/ai/`:
- `text/` - LLM text generation
- `image/` - Image generation (Kling, Gemini, etc.)
- `video/` - Video generation (Sora, Vidu, etc.)

### Main Directories

- `src/` - Main source code (Express backend)
- `src/routes/` - API route handlers (15 modules: assets, novel, outline, script, storyboard, video, project, prompt, setting, task, user, other, index)
- `src/agents/` - AI agent modules (outlineScript, storyboard)
- `src/lib/` - Shared libraries
- `src/types/` - TypeScript type definitions including database schema
- `scripts/` - Build scripts and entry points
- `docker/` - Docker deployment configurations

### Database Schema

SQLite database with 16 tables: t_project, t_novel, t_outline, t_script, t_storyline, t_assets, t_image, t_video, t_videoConfig, t_config, t_aiModelMap, t_setting, t_user, t_prompts, t_taskList, t_chatHistory

### API Server

Express server runs on port 60000. Routes are auto-generated from files in `src/routes/` using the core.ts router system.

### Frontend

The frontend is a separate project (Toonflow-web). The desktop app bundles pre-compiled web assets from `scripts/web/`.