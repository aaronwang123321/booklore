# BookLore Node.js 后端技术债务修复计划

## 紧急修复项目 (P0 - 立即处理)

### 1. TypeScript 编译错误修复

#### 问题描述
- 27 个 TypeScript 编译错误阻止应用正常启动
- 主要涉及 Prisma 服务、Stripe 集成和测试文件

#### 具体错误和解决方案

**A. Prisma 服务属性冲突**
```typescript
// 文件: src/shared/database/prisma.service.ts
// 错误: metadataHistory 和 metadataTemplate 属性冲突

// 当前代码 (有问题):
export class PrismaService extends PrismaClient {
  metadataHistory: any;
  metadataTemplate: any;
}

// 修复方案:
export class PrismaService extends PrismaClient {
  // 移除这些属性，使用 getter 方法代替
  get metadataHistory() {
    return this.metadataHistory;
  }
  
  get metadataTemplate() {
    return this.metadataTemplate;
  }
}
```

**B. Stripe 类型定义问题**
```typescript
// 文件: src/subscription/controllers/webhook.controller.spec.ts
// 错误: Stripe.Subscription 类型不匹配

// 修复方案:
const mockSubscription = {
  id: 'sub_test',
  object: 'subscription',
  customer: 'cus_test',
  status: 'active',
  current_period_start: 1234567890,
  current_period_end: 1234567890 + 2592000,
  metadata: {
    userId: '1',
    plan: 'basic',
  },
  // 添加缺失的必需属性
  application: null,
  application_fee_percent: null,
  automatic_tax: { enabled: false },
  billing_cycle_anchor: 1234567890,
  // ... 其他必需属性
} as Partial<Stripe.Subscription>;
```

**C. Library 服务测试问题**
```typescript
// 文件: src/library/library.service.spec.ts
// 错误: members 属性不存在

// 修复方案: 移除不存在的 members 属性或添加到类型定义中
const mockLibrary = {
  id: 1,
  name: 'Test Library',
  description: 'Test Description',
  ownerId: 1,
  isPublic: false,
  // members: [{ userId: 1 }], // 移除或添加到类型定义
};
```

#### 修复步骤
1. 修复 Prisma 服务属性冲突
2. 更新 Stripe 类型定义
3. 修复测试文件中的类型错误
4. 运行 `npm run build` 验证修复

### 2. 监控服务修复

#### 问题描述
- `prom-client` 库兼容性问题
- `collectDefaultMetrics` 方法调用失败

#### 解决方案
```typescript
// 文件: src/shared/monitoring/monitoring.service.ts

// 当前代码 (有问题):
import promClient from 'prom-client';

// 修复方案:
import * as promClient from 'prom-client';

// 或者使用条件调用:
constructor() {
  this.register = new promClient.Registry();
  
  // 安全调用 collectDefaultMetrics
  try {
    if (promClient.collectDefaultMetrics) {
      promClient.collectDefaultMetrics({ register: this.register });
    }
  } catch (error) {
    console.warn('Failed to collect default metrics:', error.message);
  }
}
```

### 3. 数据库连接和配置

#### 问题描述
- 数据库连接配置可能不正确
- 环境变量配置缺失

#### 解决方案
1. 检查 `.env` 文件配置
2. 验证数据库连接字符串
3. 运行数据库迁移

```bash
# 检查数据库连接
npx prisma db pull
npx prisma generate
npx prisma db push
```

## 高优先级修复项目 (P1 - 本周内处理)

### 4. 错误处理改进

#### 当前问题
- 未处理的 Promise 拒绝
- `msg._implicitHeader is not a function` 错误

#### 解决方案
```typescript
// 添加全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // 记录错误但不退出进程
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // 优雅关闭应用
  process.exit(1);
});
```

### 5. 依赖版本兼容性

#### 检查和更新依赖
```bash
# 检查过时的依赖
npm outdated

# 更新兼容的依赖
npm update

# 检查安全漏洞
npm audit
npm audit fix
```

### 6. 测试套件修复

#### 修复测试配置
```typescript
// vitest.config.ts 或 jest.config.js
export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
  ],
};
```

## 中优先级改进项目 (P2 - 本月内处理)

### 7. 代码质量改进

#### ESLint 和 Prettier 配置
```json
// .eslintrc.js 更新
module.exports = {
  extends: [
    '@nestjs/eslint-config',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
  },
};
```

### 8. 性能优化

#### 数据库查询优化
```typescript
// 添加数据库索引
// prisma/schema.prisma
model Book {
  id        Int      @id @default(autoincrement())
  title     String   @db.VarChar(255)
  author    String   @db.VarChar(255)
  createdAt DateTime @default(now())
  
  @@index([title])
  @@index([author])
  @@index([createdAt])
}
```

#### 缓存策略
```typescript
// 实现 Redis 缓存
@Injectable()
export class CacheService {
  constructor(private redis: Redis) {}
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set(key: string, value: any, ttl = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

### 9. 安全性改进

#### 输入验证增强
```typescript
// 使用 class-validator 进行严格验证
export class CreateBookDto {
  @IsString()
  @Length(1, 255)
  @IsNotEmpty()
  title: string;
  
  @IsString()
  @Length(1, 255)
  @IsNotEmpty()
  author: string;
  
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
```

#### API 速率限制
```typescript
// 实现速率限制
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 100,
    }),
  ],
})
export class AppModule {}
```

## 低优先级优化项目 (P3 - 下个月处理)

### 10. 文档改进

#### API 文档完善
```typescript
// 使用 Swagger 装饰器
@ApiTags('books')
@Controller('books')
export class BookController {
  @ApiOperation({ summary: 'Create a new book' })
  @ApiResponse({ status: 201, description: 'Book created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @Post()
  async create(@Body() createBookDto: CreateBookDto) {
    // ...
  }
}
```

### 11. 监控和日志改进

#### 结构化日志
```typescript
// 使用 winston 进行结构化日志
import { Logger } from 'winston';

@Injectable()
export class LoggerService {
  private logger: Logger;
  
  constructor() {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
      ],
    });
  }
}
```

## 修复时间表

| 优先级 | 项目 | 预计时间 | 负责人 |
|--------|------|----------|--------|
| P0 | TypeScript 编译错误 | 2-3 天 | 开发团队 |
| P0 | 监控服务修复 | 1 天 | 开发团队 |
| P0 | 数据库配置 | 1 天 | DevOps |
| P1 | 错误处理改进 | 2-3 天 | 开发团队 |
| P1 | 依赖更新 | 1-2 天 | 开发团队 |
| P1 | 测试套件修复 | 3-4 天 | QA 团队 |
| P2 | 代码质量改进 | 1 周 | 开发团队 |
| P2 | 性能优化 | 2 周 | 开发团队 |
| P2 | 安全性改进 | 1 周 | 安全团队 |
| P3 | 文档改进 | 1 周 | 技术写作 |
| P3 | 监控日志改进 | 1 周 | DevOps |

## 验证和测试计划

### 修复验证步骤
1. **编译验证**: `npm run build` 无错误
2. **启动验证**: `npm run start:dev` 成功启动
3. **API 测试**: 所有端点返回正确响应
4. **单元测试**: `npm run test` 通过率 > 90%
5. **集成测试**: 端到端测试通过
6. **性能测试**: 响应时间 < 200ms

### 回归测试
- 每次修复后运行完整测试套件
- 验证现有功能未受影响
- 检查内存泄漏和性能回归

---

*计划制定时间: 2025-08-08*
*预计完成时间: 4-6 周*