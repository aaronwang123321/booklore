# Implementation Plan

## 核心开发任务 (19人日总工期)

### T01 - 初始化NestJS项目 & 目录规范 (0.5天)

- [x] T01 初始化NestJS项目和目录规范
  - 使用NestJS CLI创建项目，配置package.json依赖
  - 建立标准目录结构：src/{auth,book,library,subscription,upload,websocket,shared}
  - 配置TypeScript 5.5.3、ESLint、Prettier代码规范
  - 验收标准：`pnpm dev` 正常启动
  - _Requirements: 9.1_

### T02 - Prisma Schema与迁移脚本 (1天)

- [x] T02 Prisma schema与迁移脚本
  - 设计完整的数据库模型：User、Library、Book、Subscription等
  - 创建Prisma schema文件，定义所有实体关系和约束
  - 编写初始数据库迁移脚本和种子数据
  - 验收标准：`prisma migrate dev` 无错误
  - _Requirements: 5.1, 5.2_

### T03 - 用户/权限/登录模块 (1.5天)

- [x] T03 用户权限登录模块
  - 实现JWT认证服务，支持access token和refresh token
  - 创建RBAC权限系统，实现RolesGuard和权限装饰器
  - 集成Passport策略，支持本地登录和OIDC第三方认证
  - 验收标准：JWT + RBAC 单元测试通过
  - _Requirements: 1.2, 5.4, 5.5_

### T04 - Library & Book基础CRUD (1.5天)

- [x] T04 Library和Book基础CRUD
  - 实现LibraryController和BookController的所有CRUD操作
  - 创建对应的Service层业务逻辑和数据访问
  - 确保API响应格式与原Java版本100%兼容
  - 验收标准：Postman集成测试通过
  - _Requirements: 1.1, 1.4_

### T05 - epubjs集成 & 解析服务 (2天)

- [x] T05 epubjs集成和解析服务
  - 集成epubjs 0.4.2，实现EPUB文件解析
  - 提取书籍元数据：标题、作者、章节、封面图片
  - 实现PDF解析器，使用pdf-lib和pdf2pic
  - 支持大文件流式处理，避免内存溢出
  - 验收标准：解析100本EPUB文件无异常
  - _Requirements: 4.1, 4.2, 4.4_

### T06 - Multer + BullMQ上传队列 (1.5天)

- [x] T06 Multer和BullMQ上传队列
  - 配置Multer文件上传中间件，支持多种文件格式
  - 集成BullMQ 5.8.0任务队列，处理文件解析任务
  - 实现任务重试机制和错误处理
  - 配置Redis连接和队列监控
  - 验收标准：100MB文件上传不掉线
  - _Requirements: 7.1, 7.2, 7.4_

### T07 - Stripe订阅Guard & Webhook (2天)

- [x] T07 Stripe订阅Guard和Webhook
  - 集成Stripe SDK 13.7.0，配置支付网关
  - 实现SubscriptionGuard验证用户订阅状态
  - 创建Webhook端点处理Stripe事件
  - 实现订阅计划管理和14天试用期逻辑
  - 验收标准：Stripe CLI测试成功
  - _Requirements: 6.1, 6.3, 6.4, 6.5_

### T08 - WebSocket实时进度 (1天)

- [x] T08 WebSocket实时进度
  - 配置Socket.io网关，实现用户认证和房间管理
  - 集成任务进度通知系统
  - 实现文件处理进度的实时推送
  - 支持多设备同步和断线重连
  - 验收标准：浏览器同步阅读进度
  - _Requirements: 8.1, 8.2, 8.4_

### T09 - Dockerfile & CI/CD (1天)

- [x] T09 Dockerfile和CI/CD
  - 创建多阶段Dockerfile，基于node:20-alpine
  - 配置GitHub Actions CI/CD流水线
  - 优化镜像大小，排除开发依赖
  - 设置自动化测试和部署流程
  - 验收标准：镜像 < 120MB，CI状态绿色
  - _Requirements: 3.1, 3.2, 10.1, 10.2_

### T10 - 性能压测(k6) & 调优 (2天)

- [x] T10 性能压测和调优
  - 使用k6进行压力测试，验证性能指标
  - 实现Redis缓存策略，优化数据库查询
  - 配置应用监控和性能指标收集
  - 优化内存使用和垃圾回收
  - 验收标准：1500并发 P99 < 200ms
  - _Requirements: 2.1, 2.2, 2.3_

### T11 - OPDS协议支持 (1天)

- [x] T11 OPDS协议支持
  - 实现OPDS 1.2协议，生成标准ATOM XML目录
  - 支持图书搜索和下载功能
  - 集成HTTP Basic认证
  - 实现OPDS用户管理和权限控制
  - 验收标准：标准OPDS阅读器可正常访问
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

### T12 - CBX漫画阅读器 (1.5天)

- [x] T12 CBX漫画阅读器
  - 实现CBX文件解析，支持ZIP/RAR/7Z格式
  - 创建页面图像提取和优化服务
  - 实现页面列表API和图像流式传输
  - 集成图像缓存和压缩功能
  - 验收标准：CBX文件可正常在线阅读
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

### T13 - 邮件分享功能 (1天)

- [x] T13 邮件分享功能
  - 集成SMTP邮件服务，支持多种邮件提供商
  - 实现图书邮件发送和收件人管理
  - 创建邮件模板和附件处理
  - 集成邮件发送队列和重试机制
  - 验收标准：图书可通过邮件成功分享
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

### T14 - BookDrop批量导入 (1.5天)

- [x] T14 BookDrop批量导入
  - 实现文件监控服务，检测新增文件
  - 创建文件预处理和元数据提取
  - 实现批量导入确认和文件移动
  - 集成导入进度通知和错误处理
  - 验收标准：文件夹中的图书可批量导入
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

### T15 - 高级元数据管理 (2天)

- [x] T15 高级元数据管理
  - 集成多个元数据源API（Google Books、Goodreads、Amazon）
  - 实现智能元数据匹配和选择算法
  - 创建批量元数据编辑和模板功能
  - 实现元数据变更历史和回滚
  - 验收标准：元数据可从多源获取并智能匹配
  - _Requirements: 16.1, 16.2, 16.3, 16.4_

### T16 - 文件移动和管理 (1天)

- [x] T16 文件移动和管理
  - 实现跨图书库文件移动功能
  - 创建文件路径更新和权限验证
  - 实现事务性文件操作和回滚
  - 集成移动进度通知和状态同步
  - 验收标准：图书可在图书库间安全移动
  - _Requirements: 15.1, 15.2, 15.3, 15.4_

### T17 - 文档 & README (0.5天)

- [x] T17 文档和README
  - 生成Swagger/OpenAPI文档
  - 编写完整的README和部署指南
  - 创建快速启动脚本和开发环境配置
  - 提供API使用示例和故障排除指南
  - 验收标准：Swagger/OpenAPI在线可访问
  - _Requirements: 9.4_

## 快速启动脚本

```bash
# 克隆项目
git clone git@github.com:booklore-app/booklore-node.git
cd booklore-node

# 环境配置
cp .env.example .env

# 启动依赖服务
docker compose up -d

# 安装依赖并初始化数据库
pnpm i && pnpm prisma migrate dev && pnpm dev
```

## 详细实施阶段

## 阶段一：项目基础设施搭建 (Week 1-2)

- [ ] 1. 项目初始化和基础配置
  - 创建NestJS项目结构，配置TypeScript、ESLint、Prettier
  - 设置Vitest测试框架和覆盖率配置
  - 配置Docker开发环境和docker-compose.yml
  - 设置GitHub Actions CI/CD流水线
  - _Requirements: 9.1, 9.4, 10.1, 10.2_

- [ ] 1.1 创建项目骨架和开发环境
  - 使用NestJS CLI创建项目，配置package.json依赖
  - 设置TypeScript 5.5.3配置，启用严格模式和装饰器
  - 配置ESLint和Prettier代码规范
  - _Requirements: 9.1_

- [ ] 1.2 配置测试框架和质量保证
  - 集成Vitest 2.0.3测试框架，配置单元测试和E2E测试
  - 设置代码覆盖率阈值≥80%，配置测试报告
  - 配置pre-commit hooks确保代码质量
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 1.3 设置容器化开发环境
  - 创建多阶段Dockerfile，基于node:20-alpine
  - 配置docker-compose.yml包含PostgreSQL、Redis服务
  - 优化镜像大小，确保最终镜像≤120MB
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 1.4 建立CI/CD流水线
  - 配置GitHub Actions工作流，包含测试、构建、部署步骤
  - 设置自动化测试触发和代码质量检查
  - 配置镜像构建和推送到容器仓库
  - _Requirements: 10.1, 10.2, 10.3_

## 阶段二：数据库和ORM配置 (Week 2-3)

- [ ] 2. 数据库架构设计和Prisma配置
  - 设计PostgreSQL数据库schema，定义所有实体关系
  - 配置Prisma ORM 5.17.0，生成类型安全的客户端
  - 创建数据库迁移脚本和种子数据
  - 实现数据库连接池和事务管理
  - _Requirements: 1.1, 5.1, 5.2, 5.3_

- [ ] 2.1 设计数据库模型和关系
  - 创建Prisma schema文件，定义User、Library、Book等核心实体
  - 设计多对多关系表，实现用户-图书馆权限映射
  - 定义枚举类型和约束条件，确保数据完整性
  - _Requirements: 5.1, 5.2_

- [ ] 2.2 配置Prisma ORM和数据库连接
  - 安装和配置Prisma Client，设置数据库连接字符串
  - 配置连接池参数，优化数据库性能
  - 实现数据库健康检查和错误处理
  - _Requirements: 2.2, 2.3_

- [ ] 2.3 创建数据库迁移和种子脚本
  - 编写初始数据库迁移文件，创建所有表结构
  - 创建种子数据脚本，用于开发和测试环境
  - 实现数据库版本管理和回滚机制
  - _Requirements: 5.1, 5.2_

- [ ] 2.4 实现数据访问层和仓储模式
  - 创建PrismaService作为数据库访问的统一入口
  - 实现事务管理和批量操作支持
  - 编写数据访问层的单元测试
  - _Requirements: 9.2_

## 阶段三：认证授权系统 (Week 3-4)

- [ ] 3. JWT认证和RBAC权限系统
  - 实现JWT token生成、验证和刷新机制
  - 设计基于角色的访问控制(RBAC)系统
  - 集成OIDC第三方认证支持
  - 实现API路由守卫和权限装饰器
  - _Requirements: 1.2, 5.1, 5.4, 5.5_

- [ ] 3.1 实现JWT认证服务
  - 创建AuthService处理用户登录、注册和token管理
  - 实现JWT策略和Passport集成
  - 支持access token和refresh token机制
  - _Requirements: 1.2, 5.4_

- [ ] 3.2 设计RBAC权限系统
  - 定义用户角色和权限枚举
  - 实现RolesGuard路由守卫，验证用户权限
  - 创建权限装饰器，简化控制器权限声明
  - _Requirements: 5.1, 5.4, 5.5_

- [ ] 3.3 集成OIDC第三方认证
  - 配置OAuth2策略，支持Google、GitHub等提供商
  - 实现第三方登录回调处理
  - 处理用户信息同步和账户绑定
  - _Requirements: 1.2_

- [ ] 3.4 实现认证中间件和守卫
  - 创建JwtAuthGuard保护需要认证的路由
  - 实现SubscriptionGuard验证用户订阅状态
  - 编写认证相关的单元测试和E2E测试
  - _Requirements: 6.4, 9.2, 9.3_

## 阶段四：文件处理和解析系统 (Week 4-6)

- [ ] 4. 文件上传和多格式解析引擎
  - 配置Multer文件上传中间件，支持多种文件格式
  - 实现EPUB解析器，提取元数据和章节信息
  - 实现PDF解析器，生成缩略图和提取文档信息
  - 集成文件存储服务，支持本地和云存储
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 4.1 配置文件上传系统
  - 集成Multer中间件，配置文件大小和类型限制
  - 实现文件验证和安全检查
  - 支持多文件批量上传功能
  - _Requirements: 4.3, 4.4_

- [ ] 4.2 实现EPUB解析器
  - 使用epubjs 0.4.2解析EPUB文件
  - 提取书籍元数据：标题、作者、ISBN、出版信息
  - 解析章节结构和目录信息
  - 提取封面图片和内嵌图像
  - _Requirements: 4.1, 4.2_

- [ ] 4.3 实现PDF解析器
  - 集成pdf-lib处理PDF文件
  - 提取PDF元数据和文档信息
  - 使用pdf2pic生成缩略图
  - 支持大文件流式处理
  - _Requirements: 4.1, 4.2, 4.4_

- [ ] 4.4 实现文件存储服务
  - 创建FileService统一文件存储接口
  - 支持本地文件系统和S3兼容的云存储
  - 实现文件去重和版本管理
  - 配置CDN加速静态文件访问
  - _Requirements: 4.4_

- [ ] 4.5 集成图像处理功能
  - 使用Sharp库处理图像压缩和格式转换
  - 生成多种尺寸的缩略图
  - 实现图像优化和WebP格式支持
  - _Requirements: 4.1, 4.2_

## 阶段五：任务队列和异步处理 (Week 5-6)

- [ ] 5. BullMQ任务队列和Worker系统
  - 配置Redis连接和BullMQ队列管理
  - 实现文件解析任务的异步处理
  - 设计任务重试机制和错误处理
  - 集成WebSocket实时进度通知
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_

- [ ] 5.1 配置BullMQ任务队列系统
  - 安装和配置BullMQ 5.8.0，连接Redis服务
  - 创建多个队列：解析队列、上传队列、邮件队列
  - 配置队列监控和管理界面
  - _Requirements: 7.1_

- [ ] 5.2 实现文件解析Worker
  - 创建ParseProcessor处理文件解析任务
  - 实现任务进度跟踪和状态更新
  - 配置Worker并发数和资源限制
  - _Requirements: 7.1, 7.4, 8.2_

- [ ] 5.3 设计任务重试和错误处理机制
  - 配置指数退避重试策略
  - 实现死信队列处理失败任务
  - 记录任务执行日志和错误信息
  - _Requirements: 7.2, 7.5_

- [ ] 5.4 集成任务进度通知系统
  - 通过WebSocket实时推送任务进度
  - 实现任务完成和失败通知
  - 支持任务取消和暂停功能
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

## 阶段六：WebSocket实时通信 (Week 6-7)

- [ ] 6. Socket.io实时通信网关
  - 配置Socket.io服务器和客户端连接管理
  - 实现用户认证和房间管理
  - 设计实时事件系统和消息广播
  - 集成任务进度和状态同步
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 6.1 配置Socket.io网关
  - 创建WebSocket网关，配置CORS和认证
  - 实现连接管理和用户会话跟踪
  - 设置心跳检测和断线重连机制
  - _Requirements: 8.1, 8.5_

- [ ] 6.2 实现用户认证和房间管理
  - 集成JWT认证到WebSocket连接
  - 实现用户加入图书馆房间的权限验证
  - 管理用户在线状态和连接池
  - _Requirements: 8.1, 5.4_

- [ ] 6.3 设计实时事件系统
  - 定义事件类型和消息格式
  - 实现点对点和广播消息机制
  - 支持事件订阅和取消订阅
  - _Requirements: 8.2, 8.3_

- [ ] 6.4 集成任务进度同步
  - 实现文件处理进度的实时推送
  - 同步图书状态变更通知
  - 支持多设备同步和状态一致性
  - _Requirements: 8.2, 8.4, 8.5_

## 阶段七：订阅计费系统 (Week 7-8)

- [ ] 7. Stripe支付和订阅管理
  - 集成Stripe SDK，配置支付网关
  - 实现订阅计划管理和用户升级降级
  - 处理Webhook事件和支付状态同步
  - 设计试用期和计费周期管理
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 7.1 集成Stripe支付网关
  - 配置Stripe SDK 13.7.0和API密钥
  - 创建StripeService处理支付相关操作
  - 实现客户创建和支付方法管理
  - _Requirements: 6.3, 6.4_

- [ ] 7.2 实现订阅计划管理
  - 定义订阅计划和价格策略
  - 实现用户订阅创建和管理
  - 支持订阅升级、降级和取消
  - _Requirements: 6.2, 6.5_

- [ ] 7.3 处理Stripe Webhook事件
  - 创建Webhook端点处理Stripe事件
  - 实现支付成功、失败和订阅变更处理
  - 确保事件处理的幂等性和可靠性
  - _Requirements: 6.4, 6.5_

- [ ] 7.4 设计试用期和计费管理
  - 实现14天免费试用期逻辑
  - 自动处理试用期到期和转换
  - 生成发票和计费历史记录
  - _Requirements: 6.1, 6.2_

- [ ] 7.5 实现订阅状态守卫
  - 创建SubscriptionGuard验证用户订阅状态
  - 限制免费用户的功能访问
  - 实现优雅的功能降级机制
  - _Requirements: 6.4, 6.5_

## 阶段八：图书馆和权限管理 (Week 8-9)

- [ ] 8. 多租户图书馆系统
  - 实现图书馆创建和管理功能
  - 设计用户邀请和权限分配系统
  - 实现书架组织和图书分类
  - 集成访问控制和审计日志
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 8.1 实现图书馆管理服务
  - 创建LibraryService处理图书馆CRUD操作
  - 实现图书馆设置和配置管理
  - 支持图书馆公开和私有模式
  - _Requirements: 5.1, 5.2_

- [ ] 8.2 设计用户邀请和权限系统
  - 实现用户邀请链接生成和验证
  - 创建权限分配界面和API
  - 支持角色继承和权限组合
  - _Requirements: 5.2, 5.4, 5.5_

- [ ] 8.3 实现书架和分类系统
  - 创建ShelfService管理书架结构
  - 支持书架嵌套和拖拽排序
  - 实现图书分类和标签系统
  - _Requirements: 5.1, 5.3_

- [ ] 8.4 集成访问控制和审计
  - 实现细粒度的权限检查
  - 记录用户操作和访问日志
  - 提供权限变更历史查询
  - _Requirements: 5.4, 5.5_

## 阶段九：REST API兼容层 (Week 9-10)

- [ ] 9. 100%兼容原有REST API
  - 分析原Java API的所有端点和响应格式
  - 实现完全兼容的控制器和DTO
  - 确保HTTP状态码和错误格式一致
  - 进行API兼容性测试和验证
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 9.1 分析和映射原有API端点
  - 详细分析原Java版本的所有REST API
  - 创建API兼容性映射表
  - 定义DTO和响应格式规范
  - _Requirements: 1.1, 1.4_

- [ ] 9.2 实现图书管理API
  - 创建BookController实现所有图书相关端点
  - 确保响应格式与原API完全一致
  - 实现文件上传和下载API
  - _Requirements: 1.1, 1.3_

- [ ] 9.3 实现用户和认证API
  - 创建AuthController和UserController
  - 保持JWT token格式和认证流程一致
  - 实现用户管理和权限API
  - _Requirements: 1.2, 1.5_

- [ ] 9.4 实现图书馆和设置API
  - 创建LibraryController和SettingsController
  - 确保所有配置和管理API兼容
  - 实现OPDS协议支持
  - _Requirements: 1.1, 1.4_

- [ ] 9.5 进行API兼容性测试
  - 编写E2E测试验证API兼容性
  - 使用原前端应用进行集成测试
  - 修复发现的兼容性问题
  - _Requirements: 1.5, 9.3_

## 阶段十：性能优化和监控 (Week 10-11)

- [ ] 10. 性能优化和监控系统
  - 实现Redis缓存策略和查询优化
  - 配置应用监控和性能指标收集
  - 进行压力测试和性能调优
  - 实现日志管理和错误追踪
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 10.1 实现缓存策略
  - 配置Redis缓存，缓存热点数据
  - 实现查询结果缓存和失效策略
  - 优化数据库查询和索引
  - _Requirements: 2.2, 2.3_

- [ ] 10.2 配置性能监控
  - 集成Prometheus指标收集
  - 配置应用性能监控(APM)
  - 实现健康检查和存活探针
  - _Requirements: 2.4, 10.4_

- [ ] 10.3 进行性能测试和优化
  - 使用Artillery进行压力测试
  - 验证1500并发和P99 < 200ms指标
  - 优化内存使用和垃圾回收
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 10.4 实现日志和错误追踪
  - 配置Winston日志系统
  - 集成Sentry错误追踪
  - 实现结构化日志和查询
  - _Requirements: 2.4, 10.4_

## 阶段十一：部署和运维 (Week 11-12)

- [ ] 11. 生产部署和运维配置
  - 优化Docker镜像构建和多阶段构建
  - 配置Kubernetes部署清单和服务发现
  - 实现自动化部署和回滚机制
  - 设置监控告警和日志聚合
  - _Requirements: 3.1, 3.2, 3.3, 10.1, 10.2, 10.3, 10.5_

- [ ] 11.1 优化Docker镜像
  - 实现多阶段构建减少镜像大小
  - 配置.dockerignore排除不必要文件
  - 确保镜像大小≤120MB
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 11.2 配置Kubernetes部署
  - 创建Deployment、Service和Ingress配置
  - 配置ConfigMap和Secret管理
  - 实现水平自动扩缩容(HPA)
  - _Requirements: 10.1, 10.3_

- [ ] 11.3 实现CI/CD自动化
  - 完善GitHub Actions部署流水线
  - 实现蓝绿部署和金丝雀发布
  - 配置自动回滚和健康检查
  - _Requirements: 10.1, 10.2, 10.5_

- [ ] 11.4 设置监控和告警
  - 配置Grafana仪表板
  - 设置关键指标告警规则
  - 实现日志聚合和分析
  - _Requirements: 10.4, 10.5_

## 阶段十二：测试和文档 (Week 12)

- [ ] 12. 完整测试覆盖和文档
  - 完善单元测试达到80%覆盖率
  - 编写完整的E2E测试套件
  - 创建API文档和部署指南
  - 进行最终的集成测试和验收
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 12.1 完善测试覆盖率
  - 补充缺失的单元测试用例
  - 确保代码覆盖率达到80%阈值
  - 优化测试执行速度和稳定性
  - _Requirements: 9.1, 9.2_

- [ ] 12.2 编写E2E测试套件
  - 创建完整的用户流程测试
  - 测试API兼容性和功能完整性
  - 实现自动化测试数据管理
  - _Requirements: 9.3, 9.5_

- [ ] 12.3 创建项目文档
  - 编写API文档和使用指南
  - 创建部署和运维文档
  - 提供开发环境搭建指南
  - _Requirements: 9.4_

- [ ] 12.4 最终集成测试
  - 进行完整的系统集成测试
  - 验证所有功能需求和性能指标
  - 修复发现的问题和缺陷
  - _Requirements: 1.5, 2.5, 9.5_
