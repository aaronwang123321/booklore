import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProgressGateway } from './gateways/progress.gateway';
import { NotificationGateway } from './gateways/notification.gateway';
import { MainGateway } from './gateways/main.gateway';
import { ProgressService } from './services/progress.service';
import { ReadingSyncService } from './services/reading-sync.service';
import { ReadingSyncController } from './controllers/reading-sync.controller';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';
import { DeviceSyncService } from './services/device-sync.service';
import { DeviceSyncController } from './controllers/device-sync.controller';
import { WebSocketPerformanceService } from './services/websocket-performance.service';
import { WebSocketReconnectionService } from './services/websocket-reconnection.service';
import { WebSocketRateLimitService } from './services/websocket-rate-limit.service';

@Module({
  imports: [
    AuthModule,
    SharedModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ReadingSyncController, DeviceSyncController],
  providers: [
    MainGateway,
    ProgressGateway,
    NotificationGateway,
    ProgressService,
    ReadingSyncService,
    WsJwtGuard,
    DeviceSyncService,
    WebSocketPerformanceService,
    WebSocketReconnectionService,
    WebSocketRateLimitService,
  ],
  exports: [
    MainGateway,
    ProgressGateway,
    NotificationGateway,
    ProgressService,
    ReadingSyncService,
    DeviceSyncService,
    WebSocketPerformanceService,
    WebSocketReconnectionService,
    WebSocketRateLimitService,
  ],
})
export class WebsocketModule {}
