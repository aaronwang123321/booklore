# API响应时间优化与高级搜索功能完善技术方案

## 项目概述

**目标**: 将API响应时间从当前280ms优化到<200ms，同时完善高级搜索功能
**优先级**: 高优先级
**预计完成时间**: 2-3周
**验收标准**: API响应时间<200ms，高级搜索功能完整可用

---

## 1. API响应时间优化方案

### 1.1 当前性能分析

**现状**:
- 当前API平均响应时间: 280ms
- 目标响应时间: <200ms
- 需要优化幅度: 至少28.6%的性能提升

**性能瓶颈识别**:
1. 数据库查询性能 (主要瓶颈)
2. 缓存策略不完善
3. 中间件处理开销
4. 序列化/反序列化性能

### 1.2 数据库查询优化

#### 1.2.1 索引优化策略

**新增索引**:
```sql
-- 图书搜索相关索引
CREATE INDEX CONCURRENTLY idx_books_search_vector ON books USING gin(search_vector);
CREATE INDEX CONCURRENTLY idx_books_title_gin ON books USING gin(to_tsvector('english', title));
CREATE INDEX CONCURRENTLY idx_books_author_gin ON books USING gin(to_tsvector('english', author));

-- 复合索引优化
CREATE INDEX CONCURRENTLY idx_books_library_status ON books(library_id, status);
CREATE INDEX CONCURRENTLY idx_books_shelf_created ON books(shelf_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_books_author_publish_date ON books(author, publish_date DESC);

-- 用户相关索引
CREATE INDEX CONCURRENTLY idx_user_book_progress_user_book ON user_book_progress(user_id, book_id);
CREATE INDEX CONCURRENTLY idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- 订阅相关索引
CREATE INDEX CONCURRENTLY idx_subscriptions_user_status ON subscriptions(user_id, status);
```

#### 1.2.2 查询优化

**优化复杂查询**:
```typescript
// 优化前 - 多次查询
async getBookWithDetails(bookId: number) {
  const book = await this.prisma.book.findUnique({ where: { id: bookId } });
  const progress = await this.prisma.userBookProgress.findMany({ where: { bookId } });
  const reviews = await this.prisma.review.findMany({ where: { bookId } });
  return { book, progress, reviews };
}

// 优化后 - 单次查询
async getBookWithDetails(bookId: number) {
  return this.prisma.book.findUnique({
    where: { id: bookId },
    include: {
      userBookProgress: true,
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      },
      library: { select: { id: true, name: true } },
      shelf: { select: { id: true, name: true } }
    }
  });
}
```

#### 1.2.3 分页优化

**游标分页替代偏移分页**:
```typescript
// 优化前 - OFFSET分页
async getBooks(page: number, pageSize: number) {
  return this.prisma.book.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' }
  });
}

// 优化后 - 游标分页
async getBooks(cursor?: number, pageSize: number = 20) {
  return this.prisma.book.findMany({
    take: pageSize,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: 'desc' }
  });
}
```

### 1.3 缓存策略优化

#### 1.3.1 多层缓存架构

```typescript
@Injectable()
export class CacheService {
  constructor(
    private redis: RedisService,
    private nodeCache: NodeCache
  ) {}

  // L1缓存 - 内存缓存 (热点数据)
  async getFromL1<T>(key: string): Promise<T | null> {
    return this.nodeCache.get<T>(key) || null;
  }

  async setToL1<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    this.nodeCache.set(key, value, ttl);
  }

  // L2缓存 - Redis缓存 (共享数据)
  async getFromL2<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async setToL2<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttl);
  }

  // 智能缓存获取
  async get<T>(key: string): Promise<T | null> {
    // 先查L1缓存
    let result = await this.getFromL1<T>(key);
    if (result) return result;

    // 再查L2缓存
    result = await this.getFromL2<T>(key);
    if (result) {
      // 回填L1缓存
      await this.setToL1(key, result, 300);
      return result;
    }

    return null;
  }
}
```

#### 1.3.2 缓存预热策略

```typescript
@Injectable()
export class CacheWarmupService {
  constructor(
    private cacheService: CacheService,
    private prisma: PrismaService
  ) {}

  @Cron('0 */6 * * *') // 每6小时执行一次
  async warmupCache() {
    // 预热热门图书
    await this.warmupPopularBooks();
    
    // 预热用户偏好
    await this.warmupUserPreferences();
    
    // 预热搜索聚合数据
    await this.warmupSearchAggregations();
  }

  private async warmupPopularBooks() {
    const popularBooks = await this.prisma.book.findMany({
      take: 100,
      orderBy: { viewCount: 'desc' },
      include: {
        library: { select: { id: true, name: true } },
        shelf: { select: { id: true, name: true } }
      }
    });

    for (const book of popularBooks) {
      await this.cacheService.setToL2(`book:${book.id}`, book, 7200);
    }
  }
}
```

### 1.4 中间件性能优化

#### 1.4.1 性能监控中间件优化

```typescript
@Injectable()
export class OptimizedPerformanceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(OptimizedPerformanceMiddleware.name);
  private readonly slowRequestThreshold = 1000; // 1秒

  constructor(private readonly monitoringService: MonitoringService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = process.hrtime.bigint();
    const route = this.extractRoute(req);
    const method = req.method;

    // 轻量级请求ID生成
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    req['requestId'] = requestId;
    res.setHeader('X-Request-ID', requestId);

    // 优化响应拦截
    const originalEnd = res.end;
    res.end = (chunk?: any, encoding?: any, cb?: () => void): any => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒

      // 异步记录指标，避免阻塞响应
      setImmediate(() => {
        this.monitoringService.recordHttpRequest(
          method,
          route,
          res.statusCode,
          duration / 1000 // 转换为秒
        );

        // 只记录慢请求日志
        if (duration > this.slowRequestThreshold) {
          this.logger.warn(
            `[${requestId}] SLOW: ${method} ${route} - ${duration.toFixed(2)}ms`
          );
        }
      });

      return originalEnd.call(res, chunk, encoding, cb);
    };

    next();
  }

  private extractRoute(req: Request): string {
    if (req.route?.path) return req.route.path;
    
    // 优化路径标准化
    return req.path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9]{24}/g, '/:objectId');
  }
}
```

### 1.5 序列化优化

#### 1.5.1 响应数据优化

```typescript
@Injectable()
export class OptimizedResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  private readonly logger = new Logger(OptimizedResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map(data => {
        // 跳过不需要包装的路由
        if (this.shouldSkipTransformation(request.path)) {
          return data;
        }

        // 优化序列化
        const optimizedData = this.optimizeData(data);
        
        const apiResponse: ApiResponse<T> = {
          success: true,
          data: optimizedData,
          message: 'Success',
          timestamp: new Date().toISOString(),
          path: request.path,
        };

        // 设置缓存头
        if (this.isCacheable(request)) {
          response.setHeader('Cache-Control', 'public, max-age=300');
        }

        return apiResponse;
      })
    );
  }

  private optimizeData(data: any): any {
    if (!data) return data;

    // 移除null值以减少传输大小
    if (Array.isArray(data)) {
      return data.map(item => this.removeNullValues(item));
    }
    
    return this.removeNullValues(data);
  }

  private removeNullValues(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        cleaned[key] = typeof value === 'object' ? this.removeNullValues(value) : value;
      }
    }
    return cleaned;
  }

  private isCacheable(request: Request): boolean {
    return request.method === 'GET' && 
           !request.path.includes('/user/') &&
           !request.path.includes('/auth/');
  }

  private shouldSkipTransformation(path: string): boolean {
    const skipPaths = ['/health', '/metrics', '/api/docs'];
    return skipPaths.some(skipPath => path.startsWith(skipPath));
  }
}
```

---

## 2. 高级搜索功能完善方案

### 2.1 当前搜索功能分析

**已实现功能**:
- 基础全文搜索
- 简单过滤器 (作者、出版社、语言等)
- 搜索建议
- 搜索结果聚合

**需要完善的功能**:
- 复杂查询条件组合
- 高级过滤器组合
- 基于权限的搜索结果过滤
- 搜索性能优化
- 搜索分析和统计

### 2.2 高级搜索API设计

#### 2.2.1 高级搜索请求结构

```typescript
export interface AdvancedSearchRequest {
  // 基础查询
  query?: string;
  
  // 过滤器组 - 支持复杂逻辑组合
  filterGroups?: FilterGroup[];
  
  // 全文搜索配置
  fullTextSearch?: {
    fields: string[]; // 搜索字段
    operator: 'AND' | 'OR'; // 字段间逻辑
    fuzzy?: boolean; // 模糊搜索
    boost?: Record<string, number>; // 字段权重
  };
  
  // 元数据搜索
  metadataSearch?: {
    conditions: MetadataCondition[];
    operator: 'AND' | 'OR';
  };
  
  // 排序
  sort?: SortOption[];
  
  // 分页
  pagination: {
    type: 'offset' | 'cursor';
    page?: number;
    pageSize?: number;
    cursor?: string;
  };
  
  // 聚合选项
  aggregations?: {
    enabled: boolean;
    fields: string[];
  };
  
  // 权限上下文
  context?: {
    userId: number;
    libraryIds?: number[];
    roles?: string[];
  };
}

export interface FilterGroup {
  operator: 'AND' | 'OR';
  filters: FilterCondition[];
  nested?: FilterGroup[];
}

export interface FilterCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith' | 'between' | 'exists';
  value: any;
  caseSensitive?: boolean;
}

export interface MetadataCondition {
  path: string; // JSON路径
  operator: 'eq' | 'ne' | 'contains' | 'exists';
  value?: any;
}

export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
  nullsFirst?: boolean;
}
```

#### 2.2.2 高级搜索服务实现

```typescript
@Injectable()
export class AdvancedSearchService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private permissionService: PermissionService,
    private fullTextSearchService: FullTextSearchService
  ) {}

  async advancedSearch(request: AdvancedSearchRequest): Promise<AdvancedSearchResponse> {
    const startTime = Date.now();
    
    // 生成缓存键
    const cacheKey = this.generateCacheKey(request);
    
    // 尝试从缓存获取
    const cached = await this.cacheService.get<AdvancedSearchResponse>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // 构建查询条件
    const whereClause = await this.buildAdvancedWhereClause(request);
    
    // 应用权限过滤
    const permissionFilters = await this.buildPermissionFilters(request.context);
    const finalWhereClause = {
      AND: [whereClause, permissionFilters].filter(Boolean)
    };

    // 构建排序
    const orderBy = this.buildOrderBy(request.sort);

    // 执行搜索
    const [results, totalCount, aggregations] = await Promise.all([
      this.executeSearch(finalWhereClause, orderBy, request.pagination),
      this.getTotalCount(finalWhereClause),
      request.aggregations?.enabled ? this.getAggregations(finalWhereClause, request.aggregations.fields) : null
    ]);

    const response: AdvancedSearchResponse = {
      results: results.map(result => this.mapToSearchResult(result)),
      totalCount,
      aggregations,
      searchTime: Date.now() - startTime,
      pagination: this.buildPaginationInfo(request.pagination, totalCount),
      fromCache: false
    };

    // 缓存结果
    await this.cacheService.setToL2(cacheKey, response, 600); // 10分钟缓存

    return response;
  }

  private async buildAdvancedWhereClause(request: AdvancedSearchRequest): Promise<Prisma.BookWhereInput> {
    const conditions: Prisma.BookWhereInput[] = [];

    // 处理基础查询
    if (request.query) {
      if (request.fullTextSearch) {
        conditions.push(await this.buildFullTextCondition(request.query, request.fullTextSearch));
      } else {
        conditions.push(this.buildBasicTextSearch(request.query));
      }
    }

    // 处理过滤器组
    if (request.filterGroups?.length) {
      for (const group of request.filterGroups) {
        const groupCondition = this.buildFilterGroupCondition(group);
        if (groupCondition) {
          conditions.push(groupCondition);
        }
      }
    }

    // 处理元数据搜索
    if (request.metadataSearch) {
      conditions.push(this.buildMetadataCondition(request.metadataSearch));
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private async buildFullTextCondition(
    query: string, 
    config: AdvancedSearchRequest['fullTextSearch']
  ): Promise<Prisma.BookWhereInput> {
    const searchTerms = query.split(' ').filter(term => term.length > 0);
    
    if (config?.fuzzy) {
      // 使用PostgreSQL的模糊搜索
      return {
        OR: config.fields.map(field => ({
          [field]: {
            search: searchTerms.join(' & '),
            mode: 'insensitive'
          }
        }))
      };
    }

    // 使用全文搜索向量
    return {
      searchVector: {
        search: searchTerms.join(' & ')
      }
    };
  }

  private buildFilterGroupCondition(group: FilterGroup): Prisma.BookWhereInput | null {
    if (!group.filters?.length && !group.nested?.length) return null;

    const conditions: Prisma.BookWhereInput[] = [];

    // 处理直接过滤条件
    for (const filter of group.filters || []) {
      const condition = this.buildSingleFilterCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }

    // 处理嵌套过滤器组
    for (const nestedGroup of group.nested || []) {
      const nestedCondition = this.buildFilterGroupCondition(nestedGroup);
      if (nestedCondition) {
        conditions.push(nestedCondition);
      }
    }

    if (conditions.length === 0) return null;

    return group.operator === 'OR' 
      ? { OR: conditions } 
      : { AND: conditions };
  }

  private buildSingleFilterCondition(filter: FilterCondition): Prisma.BookWhereInput | null {
    const { field, operator, value, caseSensitive = false } = filter;

    switch (operator) {
      case 'eq':
        return { [field]: { equals: value, mode: caseSensitive ? undefined : 'insensitive' } };
      
      case 'ne':
        return { [field]: { not: value } };
      
      case 'gt':
        return { [field]: { gt: value } };
      
      case 'gte':
        return { [field]: { gte: value } };
      
      case 'lt':
        return { [field]: { lt: value } };
      
      case 'lte':
        return { [field]: { lte: value } };
      
      case 'in':
        return { [field]: { in: Array.isArray(value) ? value : [value] } };
      
      case 'nin':
        return { [field]: { notIn: Array.isArray(value) ? value : [value] } };
      
      case 'contains':
        return { [field]: { contains: value, mode: caseSensitive ? undefined : 'insensitive' } };
      
      case 'startsWith':
        return { [field]: { startsWith: value, mode: caseSensitive ? undefined : 'insensitive' } };
      
      case 'endsWith':
        return { [field]: { endsWith: value, mode: caseSensitive ? undefined : 'insensitive' } };
      
      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          return { [field]: { gte: value[0], lte: value[1] } };
        }
        return null;
      
      case 'exists':
        return { [field]: value ? { not: null } : null };
      
      default:
        return null;
    }
  }

  private async buildPermissionFilters(context?: AdvancedSearchRequest['context']): Promise<Prisma.BookWhereInput> {
    if (!context?.userId) {
      // 未认证用户只能看到公开内容
      return {
        library: {
          isPublic: true
        }
      };
    }

    // 获取用户权限
    const userPermissions = await this.permissionService.getUserPermissions(context.userId);
    
    const libraryConditions: Prisma.BookWhereInput[] = [];

    // 公开图书馆
    libraryConditions.push({
      library: { isPublic: true }
    });

    // 用户有权限的图书馆
    if (userPermissions.libraryIds.length > 0) {
      libraryConditions.push({
        libraryId: { in: userPermissions.libraryIds }
      });
    }

    // 用户拥有的图书馆
    if (userPermissions.ownedLibraryIds.length > 0) {
      libraryConditions.push({
        libraryId: { in: userPermissions.ownedLibraryIds }
      });
    }

    return {
      OR: libraryConditions
    };
  }
}
```

### 2.3 搜索权限控制

#### 2.3.1 权限服务实现

```typescript
@Injectable()
export class SearchPermissionService {
  constructor(private prisma: PrismaService) {}

  async getUserPermissions(userId: number): Promise<UserSearchPermissions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        libraryMembers: {
          include: {
            library: { select: { id: true, isPublic: true } }
          }
        },
        ownedLibraries: {
          select: { id: true }
        }
      }
    });

    if (!user) {
      return {
        libraryIds: [],
        ownedLibraryIds: [],
        canViewPrivate: false,
        maxResults: 20
      };
    }

    const libraryIds = user.libraryMembers.map(member => member.library.id);
    const ownedLibraryIds = user.ownedLibraries.map(lib => lib.id);

    return {
      libraryIds,
      ownedLibraryIds,
      canViewPrivate: user.role === 'ADMIN' || ownedLibraryIds.length > 0,
      maxResults: user.role === 'PREMIUM' ? 100 : 20
    };
  }

  async filterSearchResults(
    results: SearchResult[], 
    userId?: number
  ): Promise<SearchResult[]> {
    if (!userId) {
      // 未认证用户只能看到公开内容
      return results.filter(result => result.library.isPublic);
    }

    const permissions = await this.getUserPermissions(userId);
    const allowedLibraryIds = new Set([
      ...permissions.libraryIds,
      ...permissions.ownedLibraryIds
    ]);

    return results.filter(result => 
      result.library.isPublic || 
      allowedLibraryIds.has(result.library.id)
    );
  }
}

interface UserSearchPermissions {
  libraryIds: number[];
  ownedLibraryIds: number[];
  canViewPrivate: boolean;
  maxResults: number;
}
```

### 2.4 搜索性能优化

#### 2.4.1 搜索结果缓存策略

```typescript
@Injectable()
export class SearchCacheService {
  constructor(
    private cacheService: CacheService,
    private redis: RedisService
  ) {}

  async getCachedSearchResults(cacheKey: string): Promise<AdvancedSearchResponse | null> {
    // 先尝试L1缓存 (内存)
    const l1Result = await this.cacheService.getFromL1<AdvancedSearchResponse>(cacheKey);
    if (l1Result) {
      return l1Result;
    }

    // 再尝试L2缓存 (Redis)
    const l2Result = await this.cacheService.getFromL2<AdvancedSearchResponse>(cacheKey);
    if (l2Result) {
      // 回填L1缓存
      await this.cacheService.setToL1(cacheKey, l2Result, 300);
      return l2Result;
    }

    return null;
  }

  async cacheSearchResults(
    cacheKey: string, 
    results: AdvancedSearchResponse, 
    ttl: number = 600
  ): Promise<void> {
    // 根据结果大小决定缓存策略
    const resultSize = JSON.stringify(results).length;
    
    if (resultSize < 50000) { // 50KB以下缓存到L1
      await this.cacheService.setToL1(cacheKey, results, Math.min(ttl, 300));
    }
    
    // 总是缓存到L2
    await this.cacheService.setToL2(cacheKey, results, ttl);
  }

  generateCacheKey(request: AdvancedSearchRequest): string {
    // 标准化请求对象
    const normalized = {
      query: request.query?.toLowerCase().trim(),
      filterGroups: this.normalizeFilterGroups(request.filterGroups),
      sort: request.sort,
      pagination: {
        type: request.pagination.type,
        page: request.pagination.page,
        pageSize: request.pagination.pageSize
      },
      context: {
        userId: request.context?.userId,
        libraryIds: request.context?.libraryIds?.sort()
      }
    };

    const keyString = JSON.stringify(normalized);
    return `search:${Buffer.from(keyString).toString('base64').substring(0, 200)}`;
  }

  private normalizeFilterGroups(groups?: FilterGroup[]): FilterGroup[] | undefined {
    if (!groups) return undefined;
    
    return groups.map(group => ({
      ...group,
      filters: group.filters.sort((a, b) => a.field.localeCompare(b.field))
    }));
  }
}
```

---

## 3. 实施计划

### 3.1 第一周：API响应时间优化

**Day 1-2: 数据库优化**
- 添加必要的数据库索引
- 优化复杂查询语句
- 实施查询性能监控

**Day 3-4: 缓存策略实施**
- 实现多层缓存架构
- 配置缓存预热机制
- 优化缓存键生成策略

**Day 5-7: 中间件和序列化优化**
- 优化性能监控中间件
- 实施响应数据优化
- 配置HTTP缓存头

### 3.2 第二周：高级搜索功能实现

**Day 8-10: 高级搜索API开发**
- 实现复杂查询条件解析
- 开发过滤器组合逻辑
- 实现元数据搜索功能

**Day 11-12: 权限控制集成**
- 实现搜索权限服务
- 集成权限过滤逻辑
- 测试权限控制功能

**Day 13-14: 搜索性能优化**
- 实施搜索结果缓存
- 优化搜索查询性能
- 配置搜索监控指标

### 3.3 第三周：测试和优化

**Day 15-17: 功能测试**
- 单元测试编写
- 集成测试执行
- 性能测试验证

**Day 18-19: 性能调优**
- 根据测试结果调优
- 优化缓存策略
- 调整数据库配置

**Day 20-21: 文档和部署**
- 更新API文档
- 准备部署配置
- 生产环境验证

---

## 4. 验收标准

### 4.1 API响应时间优化验收标准

**性能指标**:
- [ ] API平均响应时间 < 200ms (P95)
- [ ] 数据库查询时间 < 50ms (P95)
- [ ] 缓存命中率 > 80%
- [ ] 内存使用增长 < 20%

**功能验收**:
- [ ] 所有现有API功能正常
- [ ] 缓存失效机制正确
- [ ] 监控指标准确记录
- [ ] 错误处理机制完善

### 4.2 高级搜索功能验收标准

**功能验收**:
- [ ] 复杂查询条件组合正确执行
- [ ] 过滤器逻辑组合(AND/OR)正确
- [ ] 元数据搜索功能正常
- [ ] 权限控制准确有效
- [ ] 搜索结果排序正确
- [ ] 分页功能完整

**性能验收**:
- [ ] 搜索响应时间 < 300ms
- [ ] 复杂查询响应时间 < 500ms
- [ ] 搜索缓存命中率 > 70%
- [ ] 并发搜索性能稳定

**安全验收**:
- [ ] 权限控制无漏洞
- [ ] 输入验证完整
- [ ] SQL注入防护有效
- [ ] 敏感数据不泄露

---

## 5. 测试计划

### 5.1 性能测试

#### 5.1.1 API响应时间测试

```javascript
// 性能测试脚本
const loadTest = {
  target: 'http://localhost:3000',
  phases: [
    { duration: '2m', arrivalRate: 10 }, // 预热
    { duration: '5m', arrivalRate: 50 }, // 负载测试
    { duration: '2m', arrivalRate: 100 }, // 压力测试
  ],
  scenarios: [
    {
      name: 'API Response Time Test',
      weight: 100,
      flow: [
        {
          get: {
            url: '/api/v1/books',
            expect: [
              { statusCode: 200 },
              { responseTime: { max: 200 } }
            ]
          }
        },
        {
          get: {
            url: '/api/v1/search?q=test',
            expect: [
              { statusCode: 200 },
              { responseTime: { max: 300 } }
            ]
          }
        }
      ]
    }
  ]
};
```

#### 5.1.2 搜索功能测试

```typescript
// 搜索功能测试用例
describe('Advanced Search API', () => {
  describe('Complex Query Conditions', () => {
    it('should handle AND/OR filter combinations', async () => {
      const searchRequest: AdvancedSearchRequest = {
        filterGroups: [
          {
            operator: 'AND',
            filters: [
              { field: 'author', operator: 'contains', value: 'Smith' },
              { field: 'publishDate', operator: 'gte', value: '2020-01-01' }
            ]
          },
          {
            operator: 'OR',
            filters: [
              { field: 'language', operator: 'eq', value: 'en' },
              { field: 'language', operator: 'eq', value: 'zh' }
            ]
          }
        ],
        pagination: { type: 'offset', page: 1, pageSize: 20 }
      };

      const response = await request(app)
        .post('/api/v1/search/advanced')
        .send(searchRequest)
        .expect(200);

      expect(response.body.data.results).toBeDefined();
      expect(response.body.data.searchTime).toBeLessThan(500);
    });

    it('should respect permission filters', async () => {
      const searchRequest: AdvancedSearchRequest = {
        query: 'test',
        context: { userId: 1, libraryIds: [1, 2] },
        pagination: { type: 'offset', page: 1, pageSize: 20 }
      };

      const response = await request(app)
        .post('/api/v1/search/advanced')
        .set('Authorization', `Bearer ${userToken}`)
        .send(searchRequest)
        .expect(200);

      // 验证返回的结果只包含用户有权限的图书馆
      const results = response.body.data.results;
      results.forEach(result => {
        expect([1, 2]).toContain(result.library.id);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle large result sets efficiently', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/v1/search/advanced')
        .send({
          query: 'a', // 广泛搜索
          pagination: { type: 'offset', page: 1, pageSize: 100 }
        })
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500);
      expect(response.body.data.results.length).toBeLessThanOrEqual(100);
    });

    it('should utilize cache effectively', async () => {
      const searchRequest = {
        query: 'cached search test',
        pagination: { type: 'offset', page: 1, pageSize: 20 }
      };

      // 第一次请求
      const response1 = await request(app)
        .post('/api/v1/search/advanced')
        .send(searchRequest)
        .expect(200);

      // 第二次请求应该更快(来自缓存)
      const startTime = Date.now();
      const response2 = await request(app)
        .post('/api/v1/search/advanced')
        .send(searchRequest)
        .expect(200);
      const cachedResponseTime = Date.now() - startTime;

      expect(cachedResponseTime).toBeLessThan(50); // 缓存响应应该很快
      expect(response2.body.data.fromCache).toBe(true);
    });
  });
});
```

### 5.2 集成测试

```typescript
// 端到端集成测试
describe('Search Integration Tests', () => {
  beforeEach(async () => {
    // 准备测试数据
    await setupTestData();
  });

  afterEach(async () => {
    // 清理测试数据
    await cleanupTestData();
  });

  it('should complete full search workflow', async () => {
    // 1. 获取搜索建议
    const suggestionsResponse = await request(app)
      .get('/api/v1/search/suggestions?q=test')
      .expect(200);

    expect(suggestionsResponse.body.data.suggestions.length).toBeGreaterThan(0);

    // 2. 执行高级搜索
    const searchResponse = await request(app)
      .post('/api/v1/search/advanced')
      .send({
        query: 'test',
        aggregations: { enabled: true, fields: ['author', 'language'] },
        pagination: { type: 'offset', page: 1, pageSize: 20 }
      })
      .expect(200);

    expect(searchResponse.body.data.results).toBeDefined();
    expect(searchResponse.body.data.aggregations).toBeDefined();

    // 3. 获取搜索统计
    const statsResponse = await request(app)
      .get('/api/v1/search/stats')
      .expect(200);

    expect(statsResponse.body.data.totalSearches).toBeGreaterThan(0);
  });
});
```

---

## 6. 监控和维护

### 6.1 性能监控指标

```typescript
// 性能监控服务扩展
@Injectable()
export class SearchPerformanceMonitor {
  constructor(private monitoringService: MonitoringService) {}

  recordSearchMetrics(searchType: string, duration: number, resultCount: number) {
    // 记录搜索响应时间
    this.monitoringService.recordSearchDuration(searchType, duration);
    
    // 记录搜索结果数量
    this.monitoringService.recordSearchResultCount(searchType, resultCount);
    
    // 记录搜索频率
    this.monitoringService.incrementSearchCounter(searchType);
  }

  recordCacheMetrics(operation: string, hit: boolean) {
    this.monitoringService.recordCacheOperation(
      operation,
      hit ? 'hit' : 'miss'
    );
  }

  recordDatabaseMetrics(operation: string, duration: number) {
    this.monitoringService.recordDbQueryDuration(
      operation,
      'books',
      duration
    );
  }
}
```

### 6.2 告警配置

```yaml
# Prometheus告警规则
groups:
  - name: api_performance
    rules:
      - alert: HighAPIResponseTime
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API响应时间过高"
          description: "API P95响应时间超过200ms，当前值: {{ $value }}s"

      - alert: LowCacheHitRate
        expr: cache_hit_rate < 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "缓存命中率过低"
          description: "缓存命中率低于80%，当前值: {{ $value }}"

  - name: search_performance
    rules:
      - alert: SlowSearchQueries
        expr: histogram_quantile(0.95, search_duration_seconds_bucket) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "搜索查询响应时间过高"
          description: "搜索P95响应时间超过500ms，当前值: {{ $value }}s"
```

---

## 7. 总结

本技术方案通过系统性的优化策略，预期能够实现以下目标：

**API响应时间优化**:
- 通过数据库索引优化，预期查询性能提升40-60%
- 通过多层缓存策略，预期整体响应时间提升30-50%
- 通过中间件优化，预期减少10-20%的处理开销

**高级搜索功能完善**:
- 支持复杂的查询条件组合和嵌套逻辑
- 实现基于权限的搜索结果过滤
- 提供高性能的搜索缓存和优化策略

**质量保证**:
- 完整的测试覆盖，包括单元测试、集成测试和性能测试
- 全面的监控和告警机制
- 详细的文档和维护指南

通过这些优化措施，预期能够将API响应时间从280ms优化到<200ms，同时提供功能完整、性能优异的高级搜索功能。