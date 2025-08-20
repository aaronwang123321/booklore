# BookLore SaaS Transformation - 设计文档

## Overview

BookLore后端重构项目采用Node.js 20 + NestJS 10 + TypeScript 5技术栈，实现从Java Spring Boot到现代化Node.js架构的完整迁移。系统设计遵循微服务架构原则，支持水平扩展，提供企业级的性能、安全性和可维护性。

## Architecture

### 系统架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │     CDN         │    │   File Storage  │
│    (Nginx)      │    │   (CloudFlare)  │    │     (S3/OSS)    │
└─────────┬───────┘    └─────────────────┘    └─────────────────┘
          │
┌─────────▼───────┐
│   API Gateway   │
│   (NestJS App)  │
└─────────┬───────┘
          │
┌─────────▼───────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Service  │    │  WebSocket      │    │   Task Queue    │
│   (JWT/OIDC)    │    │  (Socket.io)    │    │   (BullMQ)      │
└─────────┬───────┘    └─────────────────┘    └─────────┬───────┘
          │                                              │
┌─────────▼───────┐    ┌─────────────────┐    ┌─────────▼───────┐
│  Business Logic │    │   File Parser   │    │   Worker Pool   │
│   (Services)    │    │ (EPUB/PDF/CBX)  │    │ (Worker Threads)│
└─────────┬───────┘    └─────────────────┘    └─────────────────┘
          │
┌─────────▼───────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Layer    │    │     Cache       │    │   Monitoring    │
│   (Prisma ORM)  │    │    (Redis)      │    │ (Prometheus)    │
└─────────┬───────┘    └─────────────────┘    └─────────────────┘
          │
┌─────────▼───────┐
│   Database      │
│  (PostgreSQL)   │
└─────────────────┘
```

### 模块架构

```
src/
├── auth/                 # 认证授权模块
│   ├── guards/          # 路由守卫
│   ├── strategies/      # 认证策略
│   ├── decorators/      # 装饰器
│   └── services/        # 认证服务
├── book/                # 图书管理模块
│   ├── parsers/         # 文件解析器
│   ├── processors/      # 文件处理器
│   ├── services/        # 业务服务
│   └── controllers/     # 控制器
├── library/             # 图书馆模块
│   ├── acl/            # 访问控制
│   ├── services/       # 图书馆服务
│   └── controllers/    # 控制器
├── subscription/        # 订阅模块
│   ├── stripe/         # Stripe集成
│   ├── webhooks/       # Webhook处理
│   └── services/       # 订阅服务
├── upload/             # 文件上传模块
│   ├── multer/         # 文件上传配置
│   ├── processors/     # 上传处理器
│   └── services/       # 上传服务
├── websocket/          # WebSocket模块
│   ├── gateways/       # Socket网关
│   ├── events/         # 事件定义
│   └── services/       # Socket服务
├── opds/               # OPDS协议模块
│   ├── services/       # OPDS服务
│   ├── generators/     # XML生成器
│   └── controllers/    # OPDS控制器
├── reader/             # 阅读器模块
│   ├── cbx/           # CBX漫画阅读器
│   ├── pdf/           # PDF阅读器
│   ├── epub/          # EPUB阅读器
│   └── services/      # 阅读器服务
├── email/              # 邮件模块
│   ├── services/       # 邮件服务
│   ├── templates/      # 邮件模板
│   └── providers/      # 邮件提供商
├── bookdrop/           # BookDrop模块
│   ├── watcher/        # 文件监控
│   ├── processors/     # 文件处理器
│   └── services/       # BookDrop服务
├── metadata/           # 元数据模块
│   ├── parsers/        # 元数据解析器
│   ├── matchers/       # 匹配算法
│   └── services/       # 元数据服务
├── shared/             # 共享模块
│   ├── database/       # 数据库配置
│   ├── redis/          # Redis配置
│   ├── utils/          # 工具函数
│   └── types/          # 类型定义
└── main.ts             # 应用入口
```

## Components and Interfaces

### 1. 认证授权模块 (Auth Module)

#### 核心组件

```typescript
// JWT策略
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}

// RBAC守卫
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) return true;
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// 订阅守卫
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    return await this.subscriptionService.hasActiveSubscription(user.id);
  }
}
```

#### 接口定义

```typescript
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  iat: number;
  exp: number;
}

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: UserDto;
}

export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  LIBRARY_ADMIN = 'library_admin',
}
```

### 2. 图书管理模块 (Book Module)

#### 文件解析器

```typescript
// EPUB解析器
@Injectable()
export class EpubParser {
  async parse(filePath: string): Promise<BookMetadata> {
    const book = await ePub(filePath);
    
    return {
      title: book.package.metadata.title,
      author: book.package.metadata.creator,
      isbn: book.package.metadata.identifier,
      language: book.package.metadata.language,
      publisher: book.package.metadata.publisher,
      publishDate: book.package.metadata.date,
      description: book.package.metadata.description,
      chapters: await this.extractChapters(book),
      coverImage: await this.extractCover(book),
    };
  }

  private async extractChapters(book: any): Promise<Chapter[]> {
    return book.spine.items.map((item, index) => ({
      id: item.idref,
      title: item.title || `Chapter ${index + 1}`,
      href: item.href,
      order: index,
    }));
  }

  private async extractCover(book: any): Promise<string | null> {
    const coverImage = book.coverImage;
    if (!coverImage) return null;
    
    const imageData = await coverImage.getBlob();
    return `data:${coverImage.mediaType};base64,${imageData.toString('base64')}`;
  }
}

// PDF解析器
@Injectable()
export class PdfParser {
  async parse(filePath: string): Promise<BookMetadata> {
    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
    const metadata = pdfDoc.getMetadata();
    
    return {
      title: metadata.title || path.basename(filePath, '.pdf'),
      author: metadata.author,
      creator: metadata.creator,
      producer: metadata.producer,
      creationDate: metadata.creationDate,
      modificationDate: metadata.modificationDate,
      pageCount: pdfDoc.getPageCount(),
      thumbnail: await this.generateThumbnail(filePath),
    };
  }

  private async generateThumbnail(filePath: string): Promise<string> {
    // 使用pdf2pic生成缩略图
    const convert = fromPath(filePath, {
      density: 100,
      saveFilename: "thumbnail",
      savePath: "/tmp",
      format: "png",
      width: 200,
      height: 300
    });
    
    const result = await convert(1);
    const imageBuffer = fs.readFileSync(result.path);
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }
}
```

#### 图书服务

```typescript
@Injectable()
export class BookService {
  constructor(
    private prisma: PrismaService,
    private epubParser: EpubParser,
    private pdfParser: PdfParser,
    private fileService: FileService,
    private queueService: QueueService,
  ) {}

  async createBook(createBookDto: CreateBookDto, file: Express.Multer.File): Promise<Book> {
    // 保存文件
    const filePath = await this.fileService.saveFile(file);
    
    // 创建数据库记录
    const book = await this.prisma.book.create({
      data: {
        ...createBookDto,
        filePath,
        status: BookStatus.PROCESSING,
      },
    });

    // 添加解析任务到队列
    await this.queueService.addParseJob({
      bookId: book.id,
      filePath,
      fileType: this.getFileType(file.originalname),
    });

    return book;
  }

  async parseBook(bookId: number, filePath: string, fileType: string): Promise<void> {
    try {
      let metadata: BookMetadata;
      
      switch (fileType) {
        case 'epub':
          metadata = await this.epubParser.parse(filePath);
          break;
        case 'pdf':
          metadata = await this.pdfParser.parse(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // 更新数据库
      await this.prisma.book.update({
        where: { id: bookId },
        data: {
          metadata: metadata as any,
          status: BookStatus.COMPLETED,
          processedAt: new Date(),
        },
      });

      // 发送WebSocket通知
      this.websocketService.notifyBookProcessed(bookId, metadata);
      
    } catch (error) {
      await this.prisma.book.update({
        where: { id: bookId },
        data: {
          status: BookStatus.FAILED,
          error: error.message,
        },
      });
      
      this.websocketService.notifyBookProcessingFailed(bookId, error.message);
    }
  }
}
```

### 3. 订阅模块 (Subscription Module)

#### Stripe集成

```typescript
@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    this.stripe = new Stripe(configService.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2023-10-16',
    });
  }

  async createCustomer(user: User): Promise<Stripe.Customer> {
    return await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: user.id.toString(),
      },
    });
  }

  async createSubscription(customerId: string, priceId: string): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async handleWebhook(signature: string, payload: Buffer): Promise<void> {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.configService.get('STRIPE_WEBHOOK_SECRET'),
    );

    switch (event.type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }
}
```

### 4. 任务队列模块 (Queue Module)

#### BullMQ配置

```typescript
@Injectable()
export class QueueService {
  private parseQueue: Queue;
  private uploadQueue: Queue;
  private emailQueue: Queue;

  constructor(
    @InjectRedis() private redis: Redis,
    private configService: ConfigService,
  ) {
    const connection = {
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
      password: configService.get('REDIS_PASSWORD'),
    };

    this.parseQueue = new Queue('parse', { connection });
    this.uploadQueue = new Queue('upload', { connection });
    this.emailQueue = new Queue('email', { connection });
  }

  async addParseJob(data: ParseJobData): Promise<Job> {
    return await this.parseQueue.add('parse-book', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }

  async addUploadJob(data: UploadJobData): Promise<Job> {
    return await this.uploadQueue.add('process-upload', data, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }

  async addEmailJob(data: EmailJobData): Promise<Job> {
    return await this.emailQueue.add('send-email', data, {
      delay: 1000, // 延迟1秒发送
      attempts: 3,
    });
  }
}

// Worker处理器
@Processor('parse')
export class ParseProcessor {
  constructor(private bookService: BookService) {}

  @Process('parse-book')
  async handleParseBook(job: Job<ParseJobData>): Promise<void> {
    const { bookId, filePath, fileType } = job.data;
    
    // 更新进度
    await job.updateProgress(10);
    
    try {
      await this.bookService.parseBook(bookId, filePath, fileType);
      await job.updateProgress(100);
    } catch (error) {
      throw error; // BullMQ会自动重试
    }
  }
}
```

### 5. WebSocket模块

#### Socket.io网关

```typescript
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class BookGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private userService: UserService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const user = await this.userService.findById(payload.sub);
      
      client.data.user = user;
      client.join(`user:${user.id}`);
      
      console.log(`User ${user.email} connected`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    console.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join-library')
  async handleJoinLibrary(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { libraryId: number },
  ): Promise<void> {
    const user = client.data.user;
    
    // 验证用户是否有权限访问该图书馆
    const hasAccess = await this.libraryService.hasAccess(user.id, data.libraryId);
    if (!hasAccess) {
      client.emit('error', { message: 'Access denied' });
      return;
    }
    
    client.join(`library:${data.libraryId}`);
    client.emit('joined-library', { libraryId: data.libraryId });
  }

  // 通知图书处理进度
  notifyBookProgress(bookId: number, progress: number): void {
    this.server.emit('book-progress', { bookId, progress });
  }

  // 通知图书处理完成
  notifyBookProcessed(bookId: number, metadata: BookMetadata): void {
    this.server.emit('book-processed', { bookId, metadata });
  }

  // 通知图书处理失败
  notifyBookProcessingFailed(bookId: number, error: string): void {
    this.server.emit('book-processing-failed', { bookId, error });
  }
}

### 6. OPDS协议模块

#### OPDS服务

```typescript
@Injectable()
export class OpdsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async generateCatalogFeed(request: Request): Promise<string> {
    const baseUrl = this.getBaseUrl(request);
    const libraries = await this.prisma.library.findMany({
      where: { isPublic: true },
      include: { books: true },
    });

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${baseUrl}/opds/catalog</id>
  <title>BookLore Library</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>BookLore</name>
  </author>
  <link rel="start" href="${baseUrl}/opds/catalog" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="search" href="${baseUrl}/opds/search.opds" type="application/opensearchdescription+xml"/>
  
  ${libraries.map(library => `
  <entry>
    <title>${library.name}</title>
    <id>${baseUrl}/opds/libraries/${library.id}</id>
    <updated>${library.updatedAt.toISOString()}</updated>
    <link rel="subsection" href="${baseUrl}/opds/libraries/${library.id}" type="application/atom+xml;profile=opds-catalog"/>
    <content type="text">${library.description || ''}</content>
  </entry>
  `).join('')}
</feed>`;

    return feed;
  }

  async generateSearchResults(request: Request, query: string): Promise<string> {
    const books = await this.prisma.book.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { author: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { library: true },
    });

    const baseUrl = this.getBaseUrl(request);
    
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${baseUrl}/opds/search?q=${encodeURIComponent(query)}</id>
  <title>Search Results for "${query}"</title>
  <updated>${new Date().toISOString()}</updated>
  
  ${books.map(book => `
  <entry>
    <title>${book.title}</title>
    <id>${baseUrl}/opds/books/${book.id}</id>
    <updated>${book.updatedAt.toISOString()}</updated>
    <author><name>${book.author || 'Unknown'}</name></author>
    <link rel="http://opds-spec.org/acquisition" 
          href="${baseUrl}/opds/${book.id}/download" 
          type="${book.mimeType}"/>
    ${book.coverImage ? `<link rel="http://opds-spec.org/image/thumbnail" 
          href="${baseUrl}/api/v1/books/${book.id}/cover" 
          type="image/jpeg"/>` : ''}
    <content type="text">${book.description || ''}</content>
  </entry>
  `).join('')}
</feed>`;

    return feed;
  }

  private getBaseUrl(request: Request): string {
    return `${request.protocol}://${request.get('host')}`;
  }
}
```

### 7. CBX阅读器模块

#### CBX阅读器服务

```typescript
@Injectable()
export class CbxReaderService {
  constructor(
    private prisma: PrismaService,
    private fileService: FileService,
  ) {}

  async getAvailablePages(bookId: number): Promise<number[]> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
    });

    if (!book || !book.filePath.endsWith('.cbz') && !book.filePath.endsWith('.cbr')) {
      throw new Error('Not a CBX file');
    }

    const pages = await this.extractPageList(book.filePath);
    return pages.map((_, index) => index + 1);
  }

  async streamPageImage(bookId: number, pageNumber: number, outputStream: any): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
    });

    const imageBuffer = await this.extractPageImage(book.filePath, pageNumber);
    
    // 优化图像
    const optimizedImage = await sharp(imageBuffer)
      .jpeg({ quality: 85 })
      .resize(1200, 1600, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();

    outputStream.write(optimizedImage);
  }

  private async extractPageList(filePath: string): Promise<string[]> {
    if (filePath.endsWith('.cbz')) {
      return this.extractFromZip(filePath);
    } else if (filePath.endsWith('.cbr')) {
      return this.extractFromRar(filePath);
    }
    throw new Error('Unsupported CBX format');
  }

  private async extractFromZip(filePath: string): Promise<string[]> {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    
    return entries
      .filter(entry => this.isImageFile(entry.entryName))
      .map(entry => entry.entryName)
      .sort();
  }

  private async extractFromRar(filePath: string): Promise<string[]> {
    // 使用node-rar或其他RAR解压库
    // 实现RAR文件解压逻辑
    throw new Error('RAR support not implemented yet');
  }

  private isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  private async extractPageImage(filePath: string, pageNumber: number): Promise<Buffer> {
    const pages = await this.extractPageList(filePath);
    const targetPage = pages[pageNumber - 1];
    
    if (!targetPage) {
      throw new Error('Page not found');
    }

    if (filePath.endsWith('.cbz')) {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry(targetPage);
      return entry.getData();
    }
    
    throw new Error('Unsupported format');
  }
}
```

### 8. 邮件模块

#### 邮件服务

```typescript
@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private queueService: QueueService,
  ) {
    this.transporter = nodemailer.createTransporter({
      host: configService.get('SMTP_HOST'),
      port: configService.get('SMTP_PORT'),
      secure: configService.get('SMTP_SECURE'),
      auth: {
        user: configService.get('SMTP_USER'),
        pass: configService.get('SMTP_PASS'),
      },
    });
  }

  async emailBook(request: SendBookByEmailRequest): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: request.bookId },
    });

    if (!book) {
      throw new Error('Book not found');
    }

    // 添加到邮件队列
    await this.queueService.addEmailJob({
      bookId: book.id,
      recipients: request.recipients,
      subject: `BookLore: ${book.title}`,
      message: request.message,
    });
  }

  async sendBookEmail(data: EmailJobData): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { id: data.bookId },
    });

    const mailOptions = {
      from: this.configService.get('SMTP_FROM'),
      to: data.recipients.join(', '),
      subject: data.subject,
      html: this.generateEmailTemplate(book, data.message),
      attachments: [
        {
          filename: `${book.title}.${this.getFileExtension(book.filePath)}`,
          path: book.filePath,
        },
      ],
    };

    await this.transporter.sendMail(mailOptions);
  }

  private generateEmailTemplate(book: any, message: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>📚 ${book.title}</h2>
        <p><strong>作者:</strong> ${book.author || 'Unknown'}</p>
        <p><strong>描述:</strong> ${book.description || 'No description available'}</p>
        ${message ? `<p><strong>消息:</strong> ${message}</p>` : ''}
        <hr>
        <p style="color: #666; font-size: 12px;">
          This book was shared from BookLore Library
        </p>
      </div>
    `;
  }

  private getFileExtension(filePath: string): string {
    return filePath.split('.').pop() || '';
  }
}
```

### 9. BookDrop模块

#### BookDrop服务

```typescript
@Injectable()
export class BookDropService {
  constructor(
    private prisma: PrismaService,
    private fileWatcher: FileWatcherService,
    private metadataService: MetadataService,
  ) {}

  async startWatching(): Promise<void> {
    const bookdropPath = this.configService.get('BOOKDROP_PATH');
    
    this.fileWatcher.watch(bookdropPath, {
      ignored: /[\/\\]\./,
      persistent: true,
    });

    this.fileWatcher.on('add', (filePath: string) => {
      this.handleNewFile(filePath);
    });
  }

  private async handleNewFile(filePath: string): Promise<void> {
    if (!this.isSupportedFile(filePath)) {
      return;
    }

    try {
      // 提取基本元数据
      const metadata = await this.extractBasicMetadata(filePath);
      
      // 创建BookDrop记录
      await this.prisma.bookdropFile.create({
        data: {
          filePath,
          fileName: path.basename(filePath),
          fileSize: fs.statSync(filePath).size,
          status: 'PENDING',
          metadata: metadata as any,
        },
      });

      // 发送WebSocket通知
      this.websocketService.notifyBookDropFileAdded(filePath);
      
    } catch (error) {
      console.error('Error processing BookDrop file:', error);
    }
  }

  async getFileNotificationSummary(): Promise<BookdropFileNotification> {
    const pendingCount = await this.prisma.bookdropFile.count({
      where: { status: 'PENDING' },
    });

    const processingCount = await this.prisma.bookdropFile.count({
      where: { status: 'PROCESSING' },
    });

    return {
      pendingFiles: pendingCount,
      processingFiles: processingCount,
      hasNewFiles: pendingCount > 0,
    };
  }

  async finalizeImport(request: BookdropFinalizeRequest): Promise<BookdropFinalizeResult> {
    const results = [];
    
    for (const item of request.items) {
      try {
        const bookdropFile = await this.prisma.bookdropFile.findUnique({
          where: { id: item.bookdropId },
        });

        if (!bookdropFile) continue;

        // 移动文件到目标位置
        const targetPath = this.generateTargetPath(item.libraryId, item.shelfId, bookdropFile.fileName);
        await fs.promises.rename(bookdropFile.filePath, targetPath);

        // 创建图书记录
        const book = await this.prisma.book.create({
          data: {
            title: item.title || bookdropFile.metadata.title,
            author: item.author || bookdropFile.metadata.author,
            libraryId: item.libraryId,
            shelfId: item.shelfId,
            filePath: targetPath,
            fileName: bookdropFile.fileName,
            fileSize: bookdropFile.fileSize,
            fileType: this.getFileType(bookdropFile.fileName),
            status: 'PROCESSING',
          },
        });

        // 删除BookDrop记录
        await this.prisma.bookdropFile.delete({
          where: { id: item.bookdropId },
        });

        // 添加解析任务
        await this.queueService.addParseJob({
          bookId: book.id,
          filePath: targetPath,
          fileType: this.getFileType(bookdropFile.fileName),
        });

        results.push({
          bookdropId: item.bookdropId,
          bookId: book.id,
          success: true,
        });

      } catch (error) {
        results.push({
          bookdropId: item.bookdropId,
          success: false,
          error: error.message,
        });
      }
    }

    return { results };
  }

  private isSupportedFile(filePath: string): boolean {
    const supportedExtensions = ['.epub', '.pdf', '.cbz', '.cbr'];
    return supportedExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  private async extractBasicMetadata(filePath: string): Promise<any> {
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // 简单的文件名解析
    const parts = fileName.split(' - ');
    const title = parts.length > 1 ? parts[1] : fileName;
    const author = parts.length > 1 ? parts[0] : null;

    return {
      title,
      author,
      extractedFromFileName: true,
    };
  }

  private generateTargetPath(libraryId: number, shelfId: number, fileName: string): string {
    const libraryPath = this.configService.get(`LIBRARY_${libraryId}_PATH`);
    return path.join(libraryPath, 'shelves', shelfId.toString(), fileName);
  }

  private getFileType(fileName: string): string {
    return path.extname(fileName).substring(1).toLowerCase();
  }
}
```

## Data Models

### Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                Int                 @id @default(autoincrement())
  email             String              @unique
  name              String?
  password          String?
  avatar            String?
  role              Role                @default(USER)
  isActive          Boolean             @default(true)
  emailVerified     Boolean             @default(false)
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  
  // 关系
  ownedLibraries    Library[]           @relation("LibraryOwner")
  libraryMembers    LibraryMember[]
  subscriptions     Subscription[]
  bookProgress      UserBookProgress[]
  refreshTokens     RefreshToken[]
  
  @@map("users")
}

model Library {
  id          Int             @id @default(autoincrement())
  name        String
  description String?
  isPublic    Boolean         @default(false)
  settings    Json?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  
  // 关系
  ownerId     Int
  owner       User            @relation("LibraryOwner", fields: [ownerId], references: [id])
  members     LibraryMember[]
  shelves     Shelf[]
  books       Book[]
  
  @@map("libraries")
}

model LibraryMember {
  id        Int           @id @default(autoincrement())
  role      LibraryRole   @default(READER)
  joinedAt  DateTime      @default(now())
  
  // 关系
  userId    Int
  libraryId Int
  user      User          @relation(fields: [userId], references: [id])
  library   Library       @relation(fields: [libraryId], references: [id])
  
  @@unique([userId, libraryId])
  @@map("library_members")
}

model Shelf {
  id          Int       @id @default(autoincrement())
  name        String
  description String?
  color       String?
  order       Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // 关系
  libraryId   Int
  library     Library   @relation(fields: [libraryId], references: [id])
  books       Book[]
  
  @@map("shelves")
}

model Book {
  id            Int               @id @default(autoincrement())
  title         String
  author        String?
  isbn          String?
  language      String?
  publisher     String?
  publishDate   DateTime?
  description   String?
  filePath      String
  fileName      String
  fileSize      Int
  fileType      String
  mimeType      String
  coverImage    String?
  metadata      Json?
  status        BookStatus        @default(PROCESSING)
  error         String?
  processedAt   DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  
  // 关系
  libraryId     Int
  shelfId       Int?
  library       Library           @relation(fields: [libraryId], references: [id])
  shelf         Shelf?            @relation(fields: [shelfId], references: [id])
  chapters      Chapter[]
  userProgress  UserBookProgress[]
  
  @@map("books")
}

model Chapter {
  id        Int      @id @default(autoincrement())
  title     String
  href      String
  order     Int
  content   String?
  
  // 关系
  bookId    Int
  book      Book     @relation(fields: [bookId], references: [id])
  
  @@map("chapters")
}

model UserBookProgress {
  id            Int      @id @default(autoincrement())
  progress      Float    @default(0) // 0-100
  currentPage   Int?
  currentChapter Int?
  lastReadAt    DateTime @default(now())
  
  // 关系
  userId        Int
  bookId        Int
  user          User     @relation(fields: [userId], references: [id])
  book          Book     @relation(fields: [bookId], references: [id])
  
  @@unique([userId, bookId])
  @@map("user_book_progress")
}

model Subscription {
  id                String            @id @default(cuid())
  stripeCustomerId  String?
  stripeSubscriptionId String?
  stripePriceId     String?
  status            SubscriptionStatus @default(TRIAL)
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?
  trialStart        DateTime?
  trialEnd          DateTime?
  cancelAtPeriodEnd Boolean           @default(false)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  
  // 关系
  userId            Int               @unique
  user              User              @relation(fields: [userId], references: [id])
  
  @@map("subscriptions")
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  // 关系
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
  
  @@map("refresh_tokens")
}

// 枚举类型
enum Role {
  ADMIN
  USER
}

enum LibraryRole {
  ADMIN
  EDITOR
  READER
}

enum BookStatus {
  PROCESSING
  COMPLETED
  FAILED
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
}
```

## Error Handling

### 全局异常处理

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        code = (exceptionResponse as any).code || code;
      }
    } else if (exception instanceof PrismaClientKnownRequestError) {
      // 处理Prisma错误
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Unique constraint violation';
          code = 'DUPLICATE_ENTRY';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          code = 'NOT_FOUND';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Database error';
          code = 'DATABASE_ERROR';
      }
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      code,
    };

    this.logger.error(
      `${request.method} ${request.url}`,
      JSON.stringify(errorResponse),
      exception instanceof Error ? exception.stack : 'Unknown error',
    );

    response.status(status).json(errorResponse);
  }
}
```

### 自定义异常

```typescript
export class BookNotFoundException extends HttpException {
  constructor(bookId: number) {
    super(
      {
        message: `Book with ID ${bookId} not found`,
        code: 'BOOK_NOT_FOUND',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InsufficientPermissionException extends HttpException {
  constructor(action: string) {
    super(
      {
        message: `Insufficient permission to ${action}`,
        code: 'INSUFFICIENT_PERMISSION',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class SubscriptionRequiredException extends HttpException {
  constructor() {
    super(
      {
        message: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
```

## Testing Strategy

### 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  plugins: [swc.vite()],
});
```

### 单元测试示例

```typescript
// book.service.spec.ts
describe('BookService', () => {
  let service: BookService;
  let prisma: PrismaService;
  let epubParser: EpubParser;
  let queueService: QueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: PrismaService,
          useValue: {
            book: {
              create: vi.fn(),
              update: vi.fn(),
              findUnique: vi.fn(),
            },
          },
        },
        {
          provide: EpubParser,
          useValue: {
            parse: vi.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            addParseJob: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookService>(BookService);
    prisma = module.get<PrismaService>(PrismaService);
    epubParser = module.get<EpubParser>(EpubParser);
    queueService = module.get<QueueService>(QueueService);
  });

  describe('createBook', () => {
    it('should create a book and add parse job', async () => {
      const createBookDto = {
        title: 'Test Book',
        libraryId: 1,
      };
      
      const file = {
        originalname: 'test.epub',
        buffer: Buffer.from('test'),
        mimetype: 'application/epub+zip',
      } as Express.Multer.File;

      const expectedBook = {
        id: 1,
        ...createBookDto,
        status: BookStatus.PROCESSING,
      };

      vi.mocked(prisma.book.create).mockResolvedValue(expectedBook as any);
      vi.mocked(queueService.addParseJob).mockResolvedValue({} as any);

      const result = await service.createBook(createBookDto, file);

      expect(result).toEqual(expectedBook);
      expect(prisma.book.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ...createBookDto,
          status: BookStatus.PROCESSING,
        }),
      });
      expect(queueService.addParseJob).toHaveBeenCalled();
    });
  });
});
```

### E2E测试示例

```typescript
// book.e2e-spec.ts
describe('BookController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    
    await app.init();
  });

  beforeEach(async () => {
    // 清理数据库
    await prisma.book.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/books (POST)', () => {
    it('should create a book', async () => {
      // 创建测试用户
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      // 获取JWT token
      const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET);

      return request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', 'test/fixtures/sample.epub')
        .field('title', 'Test Book')
        .field('libraryId', '1')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.title).toBe('Test Book');
          expect(res.body.status).toBe('PROCESSING');
        });
    });
  });
});
```

这个设计文档涵盖了系统的核心架构、主要组件、数据模型、错误处理和测试策略。接下来我将创建详细的任务拆解文档。
