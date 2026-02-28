# Phase 2: 支付与计费 - 实施上下文

> 本文档记录 Phase 2 的所有关键决策，供下游代理（研究、规划、开发）使用。
> 创建时间: 2026-02-28
> 决策状态: 已确认

---

## 1. 支付渠道决策

### 1.1 支付服务商选择
- **决策**: 使用 **Ping++** 作为主要支付服务商
- **理由**:
  - **国内支付**: 支付宝、微信支付官方合作伙伴，一套 API 同时支持多种国内支付方式
  - **国际支付**: 支持支付宝国际、跨境微信支付以及 PayPal，覆盖跨境电商、海淘、跨境出游线下消费等业务场景
  - **统一接口**: 一套 API 同时覆盖国内和国际支付渠道，大幅降低开发和维护成本
  - **国内合规性强**: 资金结算速度快（T+1），完善的文档和技术支持
  - **费率合理**: 支持阶梯定价，国内外渠道费率透明

### 1.2 支付渠道覆盖

#### 国内支付渠道
| 渠道 | 支持状态 | 费率参考 | 适用场景 |
|-----|---------|---------|---------|
| 支付宝 | ✅ 原生支持 | ~0.6% - 1.0% | 国内个人用户首选 |
| 微信支付 | ✅ 原生支持 | ~0.6% - 1.0% | 移动端、微信生态 |
| 银联云闪付 | ✅ 可选接入 | ~0.6% | 银行用户、大额支付 |
| 对公转账 | 🔶 预留接口 | 企业版后期支持 | B2B 企业客户 |

#### 国际支付渠道
| 渠道 | 支持状态 | 费率参考 | 适用场景 |
|-----|---------|---------|---------|
| 支付宝国际 | ✅ 支持 | ~1.2% - 2.0% | 海外华人、出境游 |
| 跨境微信支付 | ✅ 支持 | ~1.2% - 2.0% | 海外华人、跨境电商 |
| PayPal | ✅ 支持 | ~2.9% + 30¢ | 国际用户、欧美市场 |
| 国际信用卡 | 🔶 通过 PayPal | ~2.9% + 30¢ | 海外用户备用方案 |

> **说明**: 国际支付渠道通过 Ping++ 统一接入，无需单独对接各渠道 API，开发效率大幅提升。

---

## 2. 计费架构设计

### 2.1 核心原则
- **完全解耦**: 成本计算 → 定价计算 → 积分消耗，三层独立
- **模型差异化**: 不同 AI 模型可独立配置成本参数
- **毛利率可调**: 通过配置参数动态调整，无需改代码

### 2.2 三层架构

```
┌─────────────────────────────────────┐
│ Layer 3: 用户积分消耗 (CR)           │
│ 用户看到的最终价格，整数易理解        │
│ 例如：25 CR, 45 CR                   │
└─────────────────────────────────────┘
                  ▲
                  │ CR = USD × 200
┌─────────────────────────────────────┐
│ Layer 2: 美元定价 ($)                │
│ 内部成本 + 毛利率 = 目标美元售价       │
│ 例如：$0.125, $0.225                 │
└─────────────────────────────────────┘
                  ▲
                  │ Price = Cost / (1 - Margin)
┌─────────────────────────────────────┐
│ Layer 1: 基础成本计算                 │
│ 模型调用成本 × 风险系数                │
│ 例如：$0.09 × 1.15 = $0.1035        │
└─────────────────────────────────────┘
```

### 2.3 可配置参数表

```typescript
// 模型定价配置表 t_model_pricing
interface ModelPricing {
  model_id: string;              // "kling-video-5s-720p"
  model_type: "text" | "image" | "video";

  // Layer 1: 基础成本
  base_cost_usd: number;         // $0.09
  risk_factor: number;           // 1.15 (15%失败/启动开销)

  // Layer 2: 毛利率调节
  target_margin_percent: number; // 20, 30, 40...

  // Layer 3: 积分转换
  cr_per_usd: number;            // 200 (固定)

  // 计算属性(自动)
  calculated_cost_usd: number;    // base × risk
  calculated_price_usd: number;  // cost / (1 - margin)
  calculated_price_cr: number;   // ceil(price × cr_per_usd)
}
```

### 2.4 定价示例（短视频 5s 720p）

```typescript
const shortVideoPricing = {
  model_id: "kling-video-5s-720p",
  base_cost_usd: 0.09,
  risk_factor: 1.15,
  target_margin_percent: 20,  // 可动态调整！
  cr_per_usd: 200,

  // 自动计算:
  // cost = 0.09 × 1.15 = $0.1035
  // price = 0.1035 / 0.80 = $0.129 ≈ $0.125 (手动微调)
  // cr = ceil(0.125 × 200) = 25 CR
};
```

### 2.5 毛利率动态调节策略

```typescript
enum BusinessPhase {
  LAUNCH = "launch",         // 20% 毛利，抢市场
  GROWTH = "growth",         // 30% 毛利，正常经营
  MATURE = "mature",         // 40% 毛利，优化利润
  PROMOTION = "promotion",   // 15% 毛利，促销活动
}

// 动态调整（通过管理后台）
async function adjustPricing(phase: BusinessPhase) {
  const marginMap = {
    [BusinessPhase.LAUNCH]: 20,
    [BusinessPhase.GROWTH]: 30,
    [BusinessPhase.MATURE]: 40,
    [BusinessPhase.PROMOTION]: 15,
  };

  await db.models.ModelPricing.update(
    { target_margin_percent: marginMap[phase] },
    { where: {} }
  );

  await recalculateAllPrices();
}
```

---

## 3. 订阅套餐设计

### 3.1 套餐档位

| 套餐 | 价格 | 月额度 | 单次视频成本 | 适用人群 |
|-----|------|-------|-------------|---------|
| **免费版** | ¥0 | 500 CR | - | 体验用户 |
| **专业版** | ¥99/月 | 8,000 CR | ~¥1.24 | 个人创作者 |
| **企业版** | ¥499/月 | 45,000 CR | ~¥1.11 | 工作室 |

### 3.2 功能权限区分

| 功能 | 免费版 | 专业版 | 企业版 |
|-----|-------|-------|-------|
| 视频分辨率 | 720p | 1080p | 4K |
| 水印 | 有 | 无 | 无 |
| 队列优先级 | 低 | 高 | 最高 |
| 并行任务 | 1 | 3 | 10 |
| 多成员管理 | ❌ | ❌ | ✅ |
| API 访问 | ❌ | ❌ | ✅ |

### 3.3 套餐切换逻辑

| 场景 | 策略 |
|-----|------|
| **升级** | 立即生效，按比例计费（剩余天数补差价） |
| **降级** | 当前周期结束后生效，不退款 |
| **退订** | 到期后失效，数据保留 30 天 |
| **重新订阅** | 新用户同价，无特殊优惠 |

---

## 4. 额度包设计（非订阅用户）

### 4.1 额度包档位

| 额度包 | 价格 | 获得 CR | 赠送比例 | 单次视频成本 |
|-------|------|--------|---------|-------------|
| 体验包 | ¥9.9 | 275 CR | 0% | ¥0.90 |
| 标准包 | ¥49 | 1,360 CR | 10% | ¥0.90 |
| 超值包 | ¥99 | 2,750 CR | 20% | ¥0.90 |
| 专业包 | ¥299 | 8,300 CR | 30% | ¥0.90 |
| 企业包 | ¥999 | 27,750 CR | 40% | ¥0.90 |

### 4.2 新用户策略

- **注册赠送**：500 CR（约 ¥18，可生成 20 个短视频）
- **首充双倍**：首次充值金额双倍返还（最高 ¥100 封顶）
- **每日签到**：连续签到奖励递增（第1天 10 CR → 第7天 50 CR）

### 4.3 额度不足提醒策略

| 剩余额度 | 提醒方式 | 行动引导 |
|---------|---------|---------|
| < 50% | Toast 通知 | 显示剩余额度 |
| < 20% | 弹窗提醒 | 充值入口 + 了解详情 |
| < 5% | 操作阻断 | 必须充值才能继续 |
| = 0 | 功能锁定 | 仅保留查看/导出历史 |

---

## 5. 发票与财务管理

### 5.1 发票申请

| 项目 | 配置 |
|-----|------|
| **开票门槛** | 满 ¥200 可申请 |
| **发票类型** | 增值税普通发票（默认）/ 专用发票（企业）|
| **申请方式** | 订单历史中勾选订单 → 填写发票信息 → 提交 |
| **开票时效** | 提交后 3 个工作日内 |
| **交付方式** | 电子发票（邮件+站内信）/ 纸质发票（到付，限专票）|

### 5.2 消费记录与对账

- **消费明细**：每笔扣费记录（时间、类型、CR消耗、剩余CR、关联订单）
- **月度账单**：每月 1 号自动生成上月账单（充值/消费/剩余汇总）
- **导出功能**：支持 CSV/PDF 导出（方便企业财务对账）

### 5.3 企业版扩展（预留接口）

- 多项目分账（不同项目独立核算）
- 部门预算管控（设置月度消费上限）
- 子账号消费汇总（主账号查看所有子账号）

---

## 6. 数据库表设计

### 6.1 模型定价表 `t_model_pricing`

```sql
CREATE TABLE t_model_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id VARCHAR(64) NOT NULL UNIQUE,  -- "kling-video-5s-720p"
  model_type VARCHAR(16) NOT NULL,       -- "text" | "image" | "video"

  -- Layer 1: 基础成本
  base_cost_usd DECIMAL(10,6) NOT NULL,  -- $0.09
  risk_factor DECIMAL(4,2) NOT NULL DEFAULT 1.15,  -- 1.15

  -- Layer 2: 毛利率调节
  target_margin_percent INTEGER NOT NULL DEFAULT 30,  -- 30

  -- Layer 3: 积分转换
  cr_per_usd INTEGER NOT NULL DEFAULT 200,  -- 200

  -- 计算属性（自动更新）
  calculated_cost_usd DECIMAL(10,6),      -- base × risk
  calculated_price_usd DECIMAL(10,6),     -- cost / (1 - margin)
  calculated_price_cr INTEGER,             -- ceil(price × cr_per_usd)

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 订阅套餐表 `t_subscription_plans`

```sql
CREATE TABLE t_subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id VARCHAR(32) NOT NULL UNIQUE,  -- "free" | "pro" | "enterprise"
  name VARCHAR(64) NOT NULL,              -- "免费版" | "专业版" | "企业版"

  -- 定价
  price_monthly INTEGER,                 -- 月付价格（分）
  price_yearly INTEGER,                  -- 年付价格（分）

  -- 额度
  monthly_credits INTEGER,               -- 每月 CR 额度

  -- 功能限制
  max_resolution VARCHAR(16),            -- "720p" | "1080p" | "4K"
  watermark BOOLEAN DEFAULT TRUE,          -- 是否带水印
  priority INTEGER DEFAULT 1,              -- 队列优先级（1=低, 2=高, 3=最高）
  max_concurrent INTEGER DEFAULT 1,        -- 并行任务数

  -- 企业功能（预留）
  team_members INTEGER DEFAULT 1,          -- 成员数（企业版支持多成员）
  api_access BOOLEAN DEFAULT FALSE,        -- API 访问权限

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.3 额度包表 `t_credit_packs`

```sql
CREATE TABLE t_credit_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id VARCHAR(32) NOT NULL UNIQUE,     -- "starter" | "standard" | "value" | "pro" | "enterprise"
  name VARCHAR(64) NOT NULL,                -- "体验包" | "标准包" | "超值包" | "专业包" | "企业包"

  -- 定价
  price_cny INTEGER NOT NULL,               -- 人民币价格（分）

  -- CR 数量
  base_credits INTEGER NOT NULL,            -- 基础 CR 数
  bonus_credits INTEGER DEFAULT 0,           -- 赠送 CR 数
  total_credits INTEGER,                    -- 总 CR 数（base + bonus，自动计算）

  -- 赠送比例（用于展示）
  bonus_percent INTEGER,                    -- 赠送比例 %

  -- 状态
  is_active BOOLEAN DEFAULT TRUE,           -- 是否上架
  sort_order INTEGER DEFAULT 0,             -- 排序

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.4 用户订阅表 `t_user_subscriptions`

```sql
CREATE TABLE t_user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id VARCHAR(32) NOT NULL,             -- 关联 t_subscription_plans

  -- 订阅周期
  billing_cycle VARCHAR(16) NOT NULL,        -- "monthly" | "yearly"

  -- 价格（记录实际支付价格，支持促销）
  price_paid INTEGER NOT NULL,              -- 实际支付金额（分）

  -- 时间
  started_at DATETIME NOT NULL,             -- 订阅开始时间
  expires_at DATETIME NOT NULL,             -- 订阅到期时间

  -- 状态
  status VARCHAR(16) DEFAULT "active",      -- "active" | "cancelled" | "expired"
  cancelled_at DATETIME,                    -- 取消时间（降级/退订用）

  -- 支付信息
  pingxx_subscription_id VARCHAR(128),      -- Ping++ 订阅 ID（如使用订阅功能）
  pingxx_user_id VARCHAR(128),          -- Ping++ 用户标识

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES t_user(id),
  FOREIGN KEY (plan_id) REFERENCES t_subscription_plans(plan_id)
);
```

### 6.5 用户额度表 `t_user_credits`

```sql
CREATE TABLE t_user_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,           -- 用户 ID

  -- 当前额度
  balance INTEGER DEFAULT 0,                  -- 当前剩余 CR

  -- 累计统计
  total_earned INTEGER DEFAULT 0,             -- 累计获得（充值+赠送）
  total_consumed INTEGER DEFAULT 0,           -- 累计消耗

  -- 订阅相关（如果是订阅用户）
  monthly_quota INTEGER DEFAULT 0,            // 每月订阅额度
  monthly_used INTEGER DEFAULT 0,             // 本月已用
  monthly_reset_at DATETIME,                  // 下次重置时间

  // 免费额度
  free_credits_remaining INTEGER DEFAULT 0,   // 注册赠送剩余

  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES t_user(id)
);
```

### 6.6 额度交易记录表 `t_credit_transactions`

```sql
CREATE TABLE t_credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,

  -- 交易类型
  type VARCHAR(32) NOT NULL,                  // "purchase" | "consumption" | "refund" | "bonus" | "subscription" | "signin" | "register"

  -- CR 变动
  amount INTEGER NOT NULL,                    // 变动数量（正数增加，负数减少）
  balance_after INTEGER NOT NULL,             // 变动后余额

  // 关联信息
  related_order_id INTEGER,                   // 关联订单（充值/退款）
  related_task_id INTEGER,                    // 关联任务（消耗）
  related_model_id VARCHAR(64),                 // 使用的模型（消耗时）

  // 描述
  description VARCHAR(255),                   // 描述

  // 元数据（JSON）
  metadata TEXT,                              // 额外信息（如签到天数）

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES t_user(id)
);
```

### 6.7 支付订单表 `t_payment_orders`

```sql
CREATE TABLE t_payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,

  // 订单信息
  order_no VARCHAR(64) NOT NULL UNIQUE,       // 订单号（系统生成）
  order_type VARCHAR(16) NOT NULL,              // "credits" | "subscription"

  // 商品信息
  pack_id VARCHAR(32),                          // 额度包 ID（credits 类型）
  plan_id VARCHAR(32),                          // 套餐 ID（subscription 类型）
  billing_cycle VARCHAR(16),                    // "monthly" | "yearly"

  // 金额
  amount_cny INTEGER NOT NULL,                  // 应付金额（分）
  amount_paid INTEGER DEFAULT 0,                // 实付金额（分）
  discount_amount INTEGER DEFAULT 0,            // 优惠金额（分）

  // Ping++ 支付信息
  pingxx_charge_id VARCHAR(128),        // Ping++ 支付凭据 ID
  pingxx_user_id VARCHAR(128),              // Ping++ 用户标识

  // 状态流转
  status VARCHAR(16) DEFAULT "pending",         // "pending" | "processing" | "success" | "failed" | "cancelled" | "refunded"

  // 时间
  paid_at DATETIME,                             // 支付成功时间
  expired_at DATETIME,                          // 订单过期时间（30分钟）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES t_user(id)
);
```

---

## 7. 发票与财务管理

### 7.1 发票配置

| 项目 | 配置 |
|-----|------|
| **开票门槛** | 满 ¥200 可申请 |
| **发票类型** | 增值税普通发票（默认）/ 专用发票（企业） |
| **申请方式** | 订单历史中勾选 → 填写信息 → 提交 |
| **开票时效** | 提交后 3 个工作日内 |
| **交付方式** | 电子发票（邮件+站内信）/ 纸质发票（到付） |

### 7.2 消费记录

- **消费明细**：每笔扣费记录（时间、类型、CR消耗、剩余CR、关联订单）
- **月度账单**：每月 1 号自动生成上月账单（充值/消费/剩余汇总）
- **导出功能**：支持 CSV/PDF 导出（方便企业财务对账）

### 7.3 企业版扩展（预留接口）

- 多项目分账（不同项目独立核算）
- 部门预算管控（设置月度消费上限）
- 子账号消费汇总（主账号查看所有子账号）

---

## 8. 关键业务流程

### 8.1 额度充值流程

```
用户选择额度包
      ↓
生成支付订单 (t_payment_orders)
      ↓
调起 Ping++ 支付
      ↓
支付成功回调
      ↓
更新订单状态 → 增加用户额度 (t_user_credits)
      ↓
记录交易明细 (t_credit_transactions)
      ↓
发送通知（站内信 + 邮件）
```

### 8.2 额度消耗流程

```
用户发起 AI 任务
      ↓
计算所需 CR（根据模型配置）
      ↓
检查用户额度余额
      ↓
  ├─ 余额不足 → 提示充值
  ↓
扣除额度（预扣）
      ↓
执行任务
      ↓
  ├─ 成功 → 确认扣款，记录交易
  ├─ 失败 → 退还额度，记录失败
  ↓
通知用户结果
```

### 8.3 订阅开通流程

```
用户选择订阅套餐
      ↓
生成订阅订单
      ↓
调起 Ping++ 订阅（如使用订阅功能）
      ↓
订阅成功
      ↓
创建订阅记录 (t_user_subscriptions)
      ↓
立即生效：更新用户额度（月度配额）
      ↓
设置月度自动扣款
      ↓
Ping++ Webhook 监听支付成功/失败/退款
```

---

## 9. 风险评估与缓解

### 9.1 支付风险

| 风险 | 缓解措施 |
|-----|---------|
| 支付失败率高 | Ping++ 多渠道智能路由 + 失败重试机制 + 用户友好提示 |
| 欺诈支付 | Ping++ 风控系统 + 大额订单人工审核 |
| 退款纠纷 | 明确退款政策 + 7天无理由（未使用额度）|

### 9.2 额度风险

| 风险 | 缓解措施 |
|-----|---------|
| 额度超发 | 预扣机制 + 事务保证 + 每日对账 |
| 恶意消耗 | 频率限制 + 异常检测 + 人工审核 |
| 汇率波动 | CR 锚定人民币，定期调整成本参数 |

### 9.3 合规风险

| 风险 | 缓解措施 |
|-----|---------|
| 税务合规 | 每笔订单记录完整 + 月度对账 + 年度审计 |
| 发票合规 | 电子发票对接税局系统 + 发票号码唯一性 |
| 数据安全 | 支付信息 PCI DSS 合规 + 敏感数据加密 |

---

## 10. 成功指标

### 10.1 关键指标（KPIs）

| 指标 | 目标 | 监测周期 |
|-----|------|---------|
| 付费转化率 | > 5% | 月度 |
| 首充金额 | > ¥50 | 月度 |
| 月度复购率 | > 30% | 月度 |
| 订阅续费率 | > 70% | 季度 |
| 平均客单价 | > ¥80 | 月度 |
| 退款率 | < 3% | 月度 |

### 10.2 健康度指标

| 指标 | 预警阈值 | 危险阈值 |
|-----|---------|---------|
| 毛利率 | < 20% 预警 | < 10% 危险 |
| 失败率 | > 10% 预警 | > 20% 危险 |
| 投诉率 | > 1% 预警 | > 5% 危险 |

---

## 11. 附录

### 11.1 术语表

| 术语 | 定义 |
|-----|------|
| **CR** | Credit，平台积分单位，1 CR = ¥0.036 |
| **Base Cost** | 模型调用的基础成本（美元）|
| **Risk Factor** | 风险系数，覆盖失败率和启动开销（默认 1.15）|
| **Target Margin** | 目标毛利率百分比 |
| **Ping++** | 聚合支付服务商，支持支付宝/微信支付 |
| **Ping++** | 聚合支付服务商，支持国内外主流支付渠道 |

### 11.2 外部依赖

| 依赖 | 用途 | 接入方式 |
|-----|------|---------|
| Ping++ | 支付处理 | 官方 SDK (pingpp-node) |
| Ping++ | 国内支付聚合 | REST API |
| 发票服务商 | 电子发票开具 | 待定（推荐：百望云/航信） |

### 11.3 相关文档

- [REQUIREMENTS.md](../../REQUIREMENTS.md) - 项目需求文档
- [ROADMAP.md](../../ROADMAP.md) - 项目路线图
- [01-CONTEXT.md](../01-foundation-authentication/01-CONTEXT.md) - Phase 1 上下文

---

## 文档信息

| 项目 | 内容 |
|-----|------|
| **文档版本** | v1.0.0 |
| **创建日期** | 2026-02-28 |
| **决策状态** | 已确认 |
| **负责代理** | discuss-phase |
| **下游代理** | research-phase → plan-phase → execute-phase |

---

*本文档由 GSD (Get Shit Done) 框架自动生成，所有决策均已通过用户确认。*
