import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR, APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { BookModule } from './book/book.module';
import { LibraryModule } from './library/library.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { UploadModule } from './upload/upload.module';
import { WebsocketModule } from './websocket/websocket.module';
import { OpdsModule } from './opds/opds.module';
import { EmailModule } from './email/email.module';
import { BookdropModule } from './bookdrop/bookdrop.module';
import { MetadataModule } from './metadata/metadata.module';
import { FileManagementModule } from './file-management/file-management.module';
import { SearchModule } from './search/search.module';
import { AppSettingModule } from './app-setting/app-setting.module';
import { VersionModule } from './version/version.module';
import { SetupModule } from './setup/setup.module';
import { UserModule } from './user/user.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PathModule } from './path/path.module';
import { I18nConfigModule } from './i18n/i18n.module';
import { HealthController } from './health.controller';
import { PerformanceMiddleware } from './shared/middleware/performance.middleware';
import { SecurityMiddleware } from './shared/middleware/security.middleware';
import { SecurityHeadersMiddleware } from './shared/middleware/security-headers.middleware';
import { InputValidationGuard } from './shared/guards/input-validation.guard';
import { CacheInterceptor } from './shared/cache/cache.interceptor';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { MonitoringService } from './shared/monitoring/monitoring.service';
import { SecurityConfigService } from './shared/services/security-config.service';
import { SecurityLoggerService } from './shared/services/security-logger.service';
import { SecurityScannerService } from './shared/services/security-scanner.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting with performance considerations
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 900000, // 15 minutes
        limit: 1000, // 1000 requests per 15 minutes
      },
    ]),

    // Event system
    EventEmitterModule.forRoot({
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Scheduling for security scans
    ScheduleModule.forRoot(),

    // Core modules
    SharedModule,
    AuthModule,
    BookModule,
    LibraryModule,
    SubscriptionModule,
    UploadModule,
    WebsocketModule,
    OpdsModule,
    EmailModule,
    BookdropModule,
    MetadataModule,
    FileManagementModule,
    SearchModule,
    AppSettingModule,
    VersionModule,
    SetupModule,
    UserModule,
    AnalyticsModule,
    PathModule,
    I18nConfigModule,
  ],
  controllers: [HealthController],
  providers: [
    // Middleware
    PerformanceMiddleware,
    SecurityMiddleware,
    SecurityHeadersMiddleware,

    // Services
    MonitoringService,
    SecurityConfigService,
    SecurityLoggerService,
    SecurityScannerService,

    // Global filters
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },

    // Global interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },

    // Global guards
    {
      provide: APP_GUARD,
      useClass: InputValidationGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityHeadersMiddleware)
      .forRoutes('*')
      .apply(SecurityMiddleware)
      .forRoutes('*')
      .apply(PerformanceMiddleware)
      .forRoutes('*');
  }
}
