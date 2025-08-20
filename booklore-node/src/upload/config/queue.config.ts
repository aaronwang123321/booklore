import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueOptions } from 'bullmq';

@Injectable()
export class QueueConfig {
  constructor(private configService: ConfigService) {}

  getRedisConnection() {
    return {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
    };
  }

  getDefaultQueueOptions(): QueueOptions {
    return {
      connection: this.getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    };
  }

  getFileProcessingQueueOptions(): QueueOptions {
    return {
      ...this.getDefaultQueueOptions(),
      defaultJobOptions: {
        ...this.getDefaultQueueOptions().defaultJobOptions,
        attempts: 5, // More attempts for file processing
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        delay: 1000, // 1 second delay before processing
      },
    };
  }
}
