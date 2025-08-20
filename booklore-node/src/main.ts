import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PerformanceMiddleware } from './shared/middleware/performance.middleware';
import { MemoryOptimizer } from './shared/utils/memory-optimizer';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3000;

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Security
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // Performance middleware
  app.use(app.get(PerformanceMiddleware).use.bind(app.get(PerformanceMiddleware)));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['/health', '/health/detailed', '/metrics', '/performance', '/opds'],
  });

  // Swagger documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('BookLore API')
      .setDescription(
        `
        BookLore SaaS Backend API Documentation
        
        A comprehensive digital library management system built with NestJS, featuring:
        - Multi-format book support (EPUB, PDF, CBX)
        - Advanced metadata management with multiple sources
        - Real-time file processing and progress tracking
        - Cross-library file movement with transaction support
        - OPDS protocol support for e-reader integration
        - Email sharing and BookDrop batch import
        - Subscription-based access control
        - WebSocket real-time notifications
        
        ## Authentication
        Most endpoints require JWT authentication. Include the token in the Authorization header:
        \`Authorization: Bearer <your-jwt-token>\`
        
        ## Rate Limiting
        API requests are rate-limited:
        - 10 requests per second
        - 100 requests per minute
        - 1000 requests per 15 minutes
        
        ## Error Handling
        All errors follow a consistent format with appropriate HTTP status codes.
      `,
      )
      .setVersion('1.0.0')
      .setContact('BookLore Team', 'https://booklore.app', 'support@booklore.app')
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addServer('http://localhost:3000', 'Development Server')
      .addServer('https://api.booklore.app', 'Production Server')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Health', 'Health check and system monitoring endpoints')
      .addTag('Auth', 'Authentication, authorization, and user management')
      .addTag('Books', 'Book management, parsing, and reading')
      .addTag('Libraries', 'Library management and organization')
      .addTag('Upload', 'File upload, processing, and queue management')
      .addTag('Subscription', 'Subscription management and billing')
      .addTag('WebSocket', 'Real-time notifications and progress updates')
      .addTag('OPDS', 'OPDS protocol support for e-readers')
      .addTag('Email', 'Email sharing and notification services')
      .addTag('BookDrop', 'Batch import and file monitoring')
      .addTag('Metadata', 'Advanced metadata management and matching')
      .addTag('File Management', 'Cross-library file movement and transactions')
      .addTag('CBX Reader', 'Comic book (CBX) reading functionality')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    });

    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'BookLore API Documentation',
      customfavIcon: '/favicon.ico',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #2c3e50; }
        .swagger-ui .info .description { color: #34495e; }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    });

    logger.log(`📖 Swagger UI available at: http://localhost:${port}/api/docs`);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', error => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  await app.listen(port);

  logger.log(`🚀 BookLore API is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  logger.log(`📊 Health Check: http://localhost:${port}/health`);
  logger.log(`📈 Metrics: http://localhost:${port}/metrics`);
  logger.log(`🔍 Performance Report: http://localhost:${port}/performance`);

  // Log memory usage on startup
  const memUsage = process.memoryUsage();
  logger.log(`💾 Initial Memory Usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);

  // Start memory monitoring in production
  if (process.env.NODE_ENV === 'production') {
    MemoryOptimizer.startMemoryMonitoring(30000); // Monitor every 30 seconds
    logger.log('🧠 Memory monitoring started');
  }
}

bootstrap().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
