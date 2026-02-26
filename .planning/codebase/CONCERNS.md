# Technical Concerns - Toonflow-app

## Overview

This document identifies technical debt, known issues, security considerations, performance concerns, and fragile areas in the Toonflow-app codebase.

## Security Concerns

### High Priority

#### 1. API Key Storage

**Issue**: API keys stored in environment variables and potentially in database without encryption.

**Current State**:
```typescript
// Keys loaded from environment
const apiKey = process.env.KLING_API_KEY;

// Potentially stored in t_aiModelMap
await u.db("t_aiModelMap").insert({ apiKey: providerKey });
```

**Risk**: If database is compromised, all AI provider keys are exposed.

**Recommendation**:
- Encrypt sensitive values before database storage
- Use environment variables or secret management service
- Implement key rotation mechanism

#### 2. JWT Secret Management

**Issue**: JWT secret stored in `t_setting` table.

**Current State**:
```typescript
const setting = await u.db("t_setting")
  .where("id", 1)
  .select("tokenKey")
  .first();
```

**Risk**: Database access = ability to forge JWT tokens.

**Recommendation**:
- Move JWT secret to environment variable
- Implement secret rotation

#### 3. Path Traversal Protection

**Issue**: File operations rely on `resolveSafeLocalPath()` but may not be consistently applied.

**Current State**:
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

**Recommendation**:
- Audit all file system operations
- Ensure consistent use of safe path resolution
- Add integration tests for path traversal attacks

### Medium Priority

#### 4. CORS Configuration

**Issue**: CORS may be configured with permissive defaults.

**Recommendation**:
```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL, // Specific origin
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
```

#### 5. Input Validation Gaps

**Issue**: Not all routes may use `validateFields()` middleware.

**Recommendation**:
- Audit all route handlers for validation
- Add validation to any missing endpoints
- Consider schema validation at database level

## Performance Concerns

### High Priority

#### 1. Database Query Optimization

**Issue**: No indexes defined, potential N+1 queries.

**Current State**:
```typescript
// No explicit indexes
const projects = await u.db("t_project")
  .where("userId", userId)
  .select("*");
```

**Recommendation**:
- Add indexes on frequently queried columns (userId, projectId, createTime)
- Use query analysis to identify slow queries
- Consider query caching for read-heavy operations

#### 2. Large File Handling

**Issue**: Image/video files loaded entirely into memory.

**Current State**:
```typescript
const imageBase64 = await u.oss.getImageBase64(filePath);
```

**Risk**: Memory exhaustion with large files.

**Recommendation**:
- Use streaming for large file operations
- Implement file size limits
- Add memory monitoring

#### 3. AI API Rate Limiting

**Issue**: No client-side rate limiting for AI APIs.

**Current State**:
```typescript
// Direct API calls without throttling
const result = await u.ai.text.invoke(input);
```

**Risk**: API rate limits, service disruption.

**Recommendation**:
- Implement request queue with rate limiting
- Add exponential backoff for retries
- Cache frequent AI responses

### Medium Priority

#### 4. Build Bundle Size

**Issue**: esbuild configuration doesn't minify production builds.

**Current State**:
```typescript
const appBuildConfig: esbuild.BuildOptions = {
  minify: false,  // Not minified
  // ...
};
```

**Recommendation**:
- Enable minification for production builds
- Implement code splitting
- Audit dependencies for tree-shaking

#### 5. Database Connection Management

**Issue**: Single SQLite connection, no connection pooling.

**Recommendation**:
- For high-traffic scenarios, consider connection pooling
- Implement query timeout handling
- Add connection health monitoring

## Technical Debt

### High Priority

#### 1. No Test Coverage

**Issue**: Zero automated tests in codebase.

**Current State**:
```json
{
  "test": "cross-env NODE_ENV=prod node build/app.js"
}
```

This runs the production app, not tests.

**Impact**:
- No regression protection
- Manual testing required for all changes
- High risk of introducing bugs

**Recommendation**:
- Add Vitest or Jest framework
- Write tests for critical utilities first
- Implement CI/CD with automated testing

#### 2. Auto-Generated Files

**Issue**: `router.ts` and `database.d.ts` are auto-generated but committed.

**Current State**:
```typescript
// @db-hash 5a633f2d45df5d971905dd32c0ac9880
// 该文件由脚本自动生成，请勿手动修改
```

**Risk**: Manual edits may be accidentally committed.

**Recommendation**:
- Add generation step to build process
- Consider git hooks to prevent committing generated files
- Document generation process clearly

### Medium Priority

#### 3. Error Handling Inconsistency

**Issue**: Some routes use try/catch, others rely on global handler.

**Recommendation**:
- Standardize error handling pattern
- Create error handling utility for routes
- Document error handling expectations

#### 4. Logging Configuration

**Issue**: Custom logger hijacks console methods, may interfere with debugging.

**Current State**:
```typescript
class Logger {
  init(): this {
    // Hijacks console.log, console.error, etc.
    return this;
  }
}
```

**Recommendation**:
- Consider using established logging library (winston, pino)
- Add log levels configuration
- Implement log rotation

#### 5. Environment Detection Complexity

**Issue**: Environment detection logic in `env.ts` is complex.

**Current State**:
```typescript
const isElectron = typeof process.versions?.electron !== "undefined";
const isPackaged = isElectron ? app.isPackaged : false;
const env = process.env.NODE_ENV ?? (isPackaged ? "prod" : "dev");
```

**Recommendation**:
- Simplify environment detection
- Document all environment scenarios
- Add environment validation on startup

## Fragile Areas

### High Priority

#### 1. AI Provider Dependencies

**Issue**: Heavy coupling to specific AI provider APIs.

**Current State**:
```typescript
// Provider-specific implementations
import { klingImage } from "@/utils/ai/image/owned/kling";
import { geminiImage } from "@/utils/ai/image/owned/gemini";
```

**Risk**: Provider API changes break functionality.

**Recommendation**:
- Abstract provider interfaces further
- Add provider health monitoring
- Implement fallback providers

#### 2. Database Schema Changes

**Issue**: Schema changes require manual migration.

**Recommendation**:
- Implement schema versioning
- Add migration system
- Document schema change process

#### 3. Frontend-Backend Coupling

**Issue**: Frontend assets bundled from separate project.

**Risk**: Version mismatch between frontend and backend.

**Recommendation**:
- Version frontend assets
- Add compatibility checking
- Document version requirements

### Medium Priority

#### 4. File Path Assumptions

**Issue**: Hardcoded paths for data, logs directories.

**Current State**:
```typescript
const dbPath = "./data/app.db";
const logPath = "./logs/app.log";
```

**Risk**: Deployment issues on different platforms.

**Recommendation**:
- Use platform-appropriate paths
- Make paths configurable
- Handle missing directories gracefully

#### 5. EventEmitter Memory Leaks

**Issue**: Agents use EventEmitter without cleanup.

**Current State**:
```typescript
export default class OutlineScript {
  readonly emitter = new EventEmitter();
  // No cleanup on destroy
}
```

**Recommendation**:
- Add cleanup/dispose methods
- Use `once()` instead of `on()` where appropriate
- Monitor event listener count

## Known Issues

### Documented Issues

| Issue | Impact | Status |
|-------|--------|--------|
| No automated tests | High | Known |
| API keys in database | High | Known |
| No rate limiting | Medium | Known |
| Memory-intensive file ops | Medium | Known |
| No schema migrations | Medium | Known |

## Recommendations Summary

### Immediate Actions (Next Sprint)

1. **Security**: Move JWT secret to environment variable
2. **Security**: Encrypt API keys in database
3. **Testing**: Add Vitest framework and write critical tests
4. **Performance**: Add database indexes

### Short-term (Next Month)

1. Implement rate limiting for AI APIs
2. Add streaming for large file operations
3. Set up CI/CD with automated testing
4. Implement schema migration system

### Long-term (Next Quarter)

1. Achieve 70%+ test coverage
2. Migrate to established logging library
3. Implement comprehensive monitoring
4. Document all error scenarios and handling

## Monitoring Recommendations

### Metrics to Track

- API response times (p50, p95, p99)
- AI API call success/failure rates
- Database query performance
- Memory usage patterns
- File operation sizes

### Alerting Thresholds

- Error rate > 1%
- Response time p95 > 2s
- Memory usage > 80%
- AI API failure rate > 5%
