import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './database/prisma.service';
import { EmailService } from './services/email.service';
import { NotificationService } from './services/notification.service';
import { WebSocketNotificationService } from './services/websocket-notification.service';
import { PaymentRetryService } from './services/payment-retry.service';
import { NotificationController } from './controllers/notification.controller';
import { RedisModule } from './redis/redis.module';
import { MonitoringService } from './monitoring/monitoring.service';

@Module({
  imports: [ConfigModule, RedisModule],
  controllers: [NotificationController],
  providers: [
    PrismaService,
    EmailService,
    NotificationService,
    WebSocketNotificationService,
    PaymentRetryService,
    MonitoringService,
  ],
  exports: [
    PrismaService,
    EmailService,
    NotificationService,
    WebSocketNotificationService,
    PaymentRetryService,
    RedisModule,
    MonitoringService,
  ],
})
export class SharedModule {}
