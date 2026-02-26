# Testing Patterns - Toonflow-app

## Current State

**Important**: The Toonflow-app codebase does not currently have a dedicated testing framework or test files. All test-related files found in the repository are from third-party dependencies in `node_modules/`.

## Testing Infrastructure Gap

### Missing Components

1. **No Test Framework**: No Jest, Mocha, Vitest, or other testing framework configured
2. **No Test Files**: No `.test.ts`, `.spec.ts`, or `__tests__` directories in `src/`
3. **No Test Scripts**: The `package.json` `"test"` script runs the production build, not tests
4. **No Mocking Utilities**: No testing utilities for mocking AI APIs, database, or file system

### Current Test Script

```json
{
  "test": "cross-env NODE_ENV=prod node build/app.js"
}
```

This script runs the production application, not actual tests.

## Recommended Testing Strategy

### Suggested Test Framework: Vitest

Given the existing TypeScript and esbuild setup, **Vitest** is recommended:

```json
{
  "devDependencies": {
    "vitest": "^1.x",
    "@vitest/coverage-v8": "^1.x"
  },
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui"
  }
}
```

### Suggested vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/types/', 'build/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

## Test Structure Recommendations

### Unit Tests

Test individual utility functions:

```typescript
// src/utils/error.test.ts
import { describe, it, expect } from 'vitest';
import normalizeError from './error';
import { AxiosError } from 'axios';

describe('normalizeError', () => {
  it('should handle standard Error', () => {
    const error = new Error('Test error');
    const result = normalizeError(error);

    expect(result.name).toBe('Error');
    expect(result.message).toBe('Test error');
  });

  it('should handle AxiosError with response', () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 404,
        data: { message: 'Not found' }
      }
    } as AxiosError;

    const result = normalizeError(axiosError);

    expect(result.name).toBe('AxiosError');
    expect(result.status).toBe(404);
  });

  it('should handle unknown error types', () => {
    const result = normalizeError('string error');

    expect(result.name).toBe('UnknownError');
    expect(result.message).toBe('string error');
  });
});
```

### Integration Tests

Test database operations:

```typescript
// src/utils/db.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from './db';

describe('Database Operations', () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    // Cleanup test database
  });

  it('should insert and retrieve project', async () => {
    const testData = {
      name: 'Test Project',
      intro: 'Test',
      type: 'test',
      createTime: Date.now(),
    };

    await db('t_project').insert(testData);

    const project = await db('t_project')
      .where('name', 'Test Project')
      .first();

    expect(project).toBeDefined();
    expect(project?.name).toBe('Test Project');
  });
});
```

### Route Handler Tests

Test API endpoints:

```typescript
// src/routes/project/addProject.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import addProject from './addProject';

describe('POST /project', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/project', addProject);
  });

  it('should create a new project with valid data', async () => {
    const response = await request(app)
      .post('/project')
      .send({
        name: 'Test Project',
        intro: 'Test intro',
        type: 'drama',
        artStyle: 'anime',
        videoRatio: '16:9',
      });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe(200);
    expect(response.body.data.message).toContain('新增项目成功');
  });

  it('should return 400 for invalid data', async () => {
    const response = await request(app)
      .post('/project')
      .send({ name: 'Missing fields' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('参数错误');
  });
});
```

### AI Integration Tests (Mocked)

Test AI utilities with mocks:

```typescript
// src/utils/ai/text/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ai from './index';

// Mock the ai SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

describe('AI Text Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate text with valid config', async () => {
    const mockResult = { text: 'Generated content' };
    vi.mocked(generateText).mockResolvedValue(mockResult);

    const result = await ai.invoke(
      { prompt: 'Test prompt' },
      { model: 'test-model', apiKey: 'test-key', manufacturer: 'openai' }
    );

    expect(result).toEqual(mockResult);
  });

  it('should throw error for invalid config', async () => {
    await expect(
      ai.invoke({ prompt: 'test' }, {})
    ).rejects.toThrow('请检查模型配置是否正确');
  });
});
```

## Test File Organization

### Recommended Structure

```
src/
├── utils/
│   ├── error.ts
│   ├── error.test.ts          # Unit tests for error.ts
│   ├── db.ts
│   └── db.test.ts             # Integration tests for db.ts
├── routes/
│   ├── project/
│   │   ├── addProject.ts
│   │   └── addProject.test.ts # Route handler tests
│   └── ...
├── agents/
│   └── outlineScript/
│       ├── index.ts
│       └── index.test.ts      # Agent class tests
└── __tests__/
    ├── setup.ts               # Global test setup
    ├── mocks.ts               # Shared mock utilities
    └── helpers.ts             # Test helper functions
```

## Mocking Strategies

### Database Mocking

```typescript
// src/__tests__/mocks.ts
export const createMockDB = () => {
  const mockData = new Map<string, any[]>();

  return {
    table: vi.fn((tableName: string) => ({
      where: vi.fn((field: string, value: any) => ({
        first: vi.fn().mockResolvedValue(
          mockData.get(tableName)?.find((r) => r[field] === value)
        ),
        select: vi.fn().mockResolvedValue(
          mockData.get(tableName)?.filter((r) => r[field] === value)
        ),
        update: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1),
      })),
      insert: vi.fn().mockResolvedValue([1]),
    })),
    seed: (table: string, data: any[]) => mockData.set(table, data),
  };
};
```

### File System Mocking

```typescript
import { vi } from 'vitest';
import { fs } from 'memfs';

// Mock fs for file operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
}));
```

### AI Service Mocking

```typescript
// Mock external AI API calls
export const mockAITextGeneration = (response: string) => {
  vi.mocked(u.ai.text.stream).mockImplementation(async () => ({
    fullStream: (async function* () {
      yield { type: 'text-delta', text: response };
    })(),
  }));
};
```

## Coverage Goals

### Recommended Coverage Thresholds

```typescript
// vitest.config.ts
coverage: {
  thresholds: {
    global: {
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70,
    },
  },
}
```

### Critical Modules for Testing

Priority modules that should have comprehensive test coverage:

1. **Error Handling** (`src/utils/error.ts`) - 100% coverage
2. **Validation** (`src/middleware/middleware.ts`) - 100% coverage
3. **Database Utilities** (`src/utils/db.ts`) - 90% coverage
4. **AI Integration** (`src/utils/ai/`) - 80% coverage
5. **Route Handlers** (`src/routes/`) - 70% coverage
6. **Agents** (`src/agents/`) - 70% coverage

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: yarn install
      - run: yarn lint
      - run: yarn test --coverage
      - uses: codecov/codecov-action@v3
```

## Testing Best Practices for Toonflow

### 1. Test AI Integration Carefully

AI calls should always be mocked in unit tests:

```typescript
it('should handle AI generation failure', async () => {
  vi.mocked(u.ai.text.invoke).mockRejectedValue(new Error('API Error'));

  await expect(agent.call('test')).rejects.toThrow();
});
```

### 2. Test Database Operations in Isolation

Use in-memory SQLite for database tests:

```typescript
const testDb = knex({
  client: 'sqlite3',
  connection: {
    filename: ':memory:',
  },
  useNullAsDefault: true,
});
```

### 3. Test Error Scenarios

Always test both success and failure paths:

```typescript
it('should handle file not found', async () => {
  vi.mocked(u.oss.fileExists).mockResolvedValue(false);

  const response = await request(app).post('/video/generate').send({
    filePath: ['/nonexistent.jpg'],
    // ... other fields
  });

  expect(response.status).toBe(400);
  expect(response.body.message).toContain('文件不存在');
});
```

### 4. Test Edge Cases

```typescript
it('should handle empty image list', async () => {
  await expect(mergeImages([])).rejects.toThrow('图片列表不能为空');
});

it('should handle invalid size format', async () => {
  await expect(parseSize('invalid')).rejects.toThrow('无效的大小格式');
});
```

## Current Testing Debt

### Immediate Actions Needed

1. Add Vitest or Jest as dev dependency
2. Create test configuration file
3. Add test scripts to package.json
4. Create `__tests__` directory structure
5. Write initial tests for critical utilities
6. Set up CI/CD integration for tests

### Long-term Goals

1. Achieve 70%+ code coverage
2. Add integration tests for all route handlers
3. Add E2E tests for critical user flows
4. Set up automated regression testing
