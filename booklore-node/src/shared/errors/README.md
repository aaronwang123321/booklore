# 统一错误处理系统

本项目实现了一套完整的统一错误处理机制，包括全局异常过滤器、自定义异常类、响应拦截器和错误工具类。

## 核心组件

### 1. 全局异常过滤器 (GlobalExceptionFilter)

自动捕获和处理所有未处理的异常，提供统一的错误响应格式。

**特性：**
- 处理 HTTP 异常
- 处理 Prisma 数据库错误
- 处理限流异常
- 处理验证错误
- 统一的错误日志记录
- 生产环境下隐藏敏感信息

### 2. 自定义异常类

提供业务相关的异常类型，便于精确的错误处理。

**可用异常：**
- `ResourceNotFoundException` - 资源未找到
- `ResourceAlreadyExistsException` - 资源已存在
- `InvalidOperationException` - 无效操作
- `InsufficientPermissionsException` - 权限不足
- `ResourceLimitExceededException` - 资源限制超出
- `FileProcessingException` - 文件处理错误
- `ExternalServiceException` - 外部服务错误
- `SubscriptionRequiredException` - 需要订阅
- `RateLimitExceededException` - 速率限制超出
- `DataValidationException` - 数据验证错误
- `ConfigurationException` - 配置错误
- `MaintenanceModeException` - 维护模式

### 3. 响应拦截器 (ResponseInterceptor)

标准化成功响应的格式，提供一致的 API 响应结构。

**响应格式：**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { /* 实际数据 */ },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "path": "/api/v1/books",
    "method": "GET",
    "requestId": "req-123",
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10
    }
  }
}
```

### 4. 错误工具类 (ErrorUtils)

提供便捷的方法来抛出标准化的异常。

## 使用示例

### 在控制器中使用

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { ErrorUtils } from '../shared/errors';

@Controller('books')
export class BookController {
  @Get(':id')
  async getBook(@Param('id') id: string) {
    const book = await this.bookService.findById(id);
    
    // 使用 ErrorUtils 进行断言
    ErrorUtils.assertExists(book, 'Book', id);
    
    return book;
  }
  
  @Post()
  async createBook(@Body() createBookDto: CreateBookDto) {
    // 检查权限
    ErrorUtils.assertPermission(
      await this.authService.hasPermission(user, 'create:book'),
      'create book'
    );
    
    // 检查是否已存在
    const existing = await this.bookService.findByTitle(createBookDto.title);
    if (existing) {
      ErrorUtils.alreadyExists('Book', createBookDto.title);
    }
    
    return this.bookService.create(createBookDto);
  }
}
```

### 在服务中使用

```typescript
import { Injectable } from '@nestjs/common';
import { ErrorUtils } from '../shared/errors';

@Injectable()
export class BookService {
  async processFile(file: Express.Multer.File) {
    try {
      // 文件处理逻辑
      return await this.parseEpub(file);
    } catch (error) {
      ErrorUtils.fileProcessing(
        file.originalname,
        'parse EPUB',
        error.message
      );
    }
  }
  
  async updateBook(id: string, updateData: UpdateBookDto) {
    return ErrorUtils.wrapAsync(
      () => this.prisma.book.update({
        where: { id },
        data: updateData
      }),
      {
        resource: 'Book',
        operation: 'update',
        identifier: id
      }
    );
  }
}
```

### 抛出自定义异常

```typescript
import { 
  ResourceNotFoundException,
  InsufficientPermissionsException,
  ResourceLimitExceededException 
} from '../shared/errors';

// 直接抛出异常
throw new ResourceNotFoundException('Book', bookId);

// 带详细信息的异常
throw new InsufficientPermissionsException(
  'delete book',
  'Book',
  { requiredRole: 'admin', userRole: 'user' }
);

// 资源限制异常
throw new ResourceLimitExceededException(
  'Books per library',
  100,
  currentCount
);
```

### 使用 ErrorUtils 快捷方法

```typescript
import { ErrorUtils } from '../shared/errors';

// 快捷方法
ErrorUtils.notFound('Book', bookId);
ErrorUtils.forbidden('delete book', 'Book');
ErrorUtils.limitExceeded('Books per library', 100, currentCount);
ErrorUtils.fileProcessing(filename, 'upload', 'Invalid format');
ErrorUtils.subscriptionRequired('Premium features', 'Pro Plan');

// 断言方法
ErrorUtils.assertExists(user, 'User', userId);
ErrorUtils.assertPermission(hasPermission, 'access resource');

// 包装异步操作
const result = await ErrorUtils.wrapAsync(
  () => this.externalService.fetchData(),
  { resource: 'External Data', operation: 'fetch' }
);
```

## 错误响应格式

### 成功响应
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": { /* 实际数据 */ },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "path": "/api/v1/books",
    "method": "GET",
    "requestId": "req-123"
  }
}
```

### 错误响应
```json
{
  "statusCode": 404,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/books/123",
  "method": "GET",
  "message": "Book with identifier '123' not found",
  "error": "RESOURCE_NOT_FOUND",
  "details": {
    "resource": "Book",
    "identifier": "123"
  },
  "requestId": "req-123"
}
```

## 配置

错误处理系统已在 `AppModule` 中全局注册：

```typescript
{
  provide: APP_FILTER,
  useClass: GlobalExceptionFilter,
},
{
  provide: APP_INTERCEPTOR,
  useClass: ResponseInterceptor,
}
```

## 最佳实践

1. **使用 ErrorUtils**: 优先使用 `ErrorUtils` 的快捷方法而不是直接抛出异常
2. **提供上下文**: 在错误中包含足够的上下文信息帮助调试
3. **使用断言**: 使用 `assertExists` 和 `assertPermission` 进行常见检查
4. **包装外部调用**: 使用 `wrapAsync` 包装可能失败的外部服务调用
5. **避免敏感信息**: 不要在错误消息中包含密码、令牌等敏感信息
6. **一致的错误码**: 使用预定义的错误码便于前端处理

## 日志记录

- 5xx 错误：记录为 ERROR 级别，包含完整堆栈信息
- 4xx 错误：记录为 WARN 级别
- 其他错误：记录为 DEBUG 级别

所有错误日志都包含请求 ID、路径、方法等上下文信息，便于问题追踪。