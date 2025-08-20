import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BookModule } from '../book/book.module';

// Controllers
import { UploadController } from './controllers/upload.controller';
import { QueueMonitorController } from './controllers/queue-monitor.controller';

// Services
import { QueueService } from './services/queue.service';
import { UploadService } from './services/upload.service';
import { UploadHealthService } from './services/upload-health.service';

// Config
import { QueueConfig } from './config/queue.config';

// Listeners
import { FileProcessingListener } from './listeners/file-processing.listener';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    BookModule, // For FileParserService
  ],
  controllers: [UploadController, QueueMonitorController],
  providers: [
    QueueConfig,
    QueueService,
    UploadService,
    UploadHealthService,
    FileProcessingListener,
  ],
  exports: [QueueService, UploadService, UploadHealthService],
})
export class UploadModule {}
