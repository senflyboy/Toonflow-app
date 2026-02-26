# Phase 1: 基础设施与认证 - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

实现用户注册、登录、身份验证的完整系统，包括：
- 邮箱注册和手机号注册（并行支持）
- 用户登录（密码验证）
- JWT 身份验证
- 密码重置功能
- 用户资料管理

此阶段是所有后续阶段的基础，专注于核心认证功能。

</domain>

<decisions>
## Implementation Decisions

### 注册方式
- 邮箱注册和手机号注册并行支持
- 用户可以自由选择任一方式注册
- 邮箱唯一性校验
- 手机号格式验证（11位中国大陆手机号）
- 防刷机制：同一手机号每日最多获取10次验证码

### 第三方登录
- Phase 1 暂不接入第三方登录（Google/Apple）
- 后续阶段根据需求可再添加

### JWT Token 配置
- Access token 有效期：15分钟
- Refresh token 有效期：7天
- Token 包含用户 ID 和角色信息
- Token 过期自动刷新机制

### 登录安全策略
- 密码错误连续5次后锁定账户
- 锁定时长：30分钟
- 密码错误提示友好（不区分"用户不存在"和"密码错误"）

### 短信验证码
- 有效期：5分钟
- 用于注册验证和密码重置

### 密码强度策略
- 至少8位
- 必须包含大小写字母和数字
- 符合常见安全标准

### 用户头像
- 头像存储在云端（Phase 3 实现云端服务后）
- Phase 1 阶段先支持头像上传接口，暂存本地或 Base64

### Claude's Discretion
- 验证码发送的具体频率限制实现
- 错误消息的具体文案
- 用户资料页面的 UI 布局
- API 错误码的具体定义

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- 第三方登录（Google/Apple）— 后续阶段根据需求添加
- 头像云端存储 — Phase 3 实现
- 邮箱验证链接 vs 验证码选择 — 暂定邮箱验证码

</deferred>

---

*Phase: 01-foundation-authentication*
*Context gathered: 2026-02-26*