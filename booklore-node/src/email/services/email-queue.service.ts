import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailJobData, EmailJobResult } from '../dto/email.dto';
import { EmailService } from './email.service';

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private emailQueue: Queue;
  private emailWorker: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.initializeQueue();
    await this.initializeWorker();
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  private async initializeQueue() {
    this.logger.log('Initializing email queue...');

    const redisConnection = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
    };

    this.emailQueue = new Queue('email-sending', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.emailQueue.on('error', error => {
      this.logger.error('Email queue error:', error);
    });

    this.logger.log('Email queue initialized successfully');
  }

  private async initializeWorker() {
    this.logger.log('Initializing email worker...');

    const redisConnection = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
    };

    this.emailWorker = new Worker(
      'email-sending',
      async (job: Job<EmailJobData>) => {
        return await this.processEmailJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 2, // Process up to 2 emails concurrently
        limiter: {
          max: 10, // Max 10 emails per duration
          duration: 60000, // 1 minute
        },
      },
    );

    // Add worker event listeners
    this.emailWorker.on('completed', (job, result: EmailJobResult) => {
      this.logger.log(`Email job ${job.id} completed successfully`);
      this.eventEmitter.emit('email.sent', {
        jobId: job.id,
        userId: job.data.userId,
        bookId: job.data.bookId,
        recipients: result.sentTo,
        success: true,
      });
    });

    this.emailWorker.on('failed', (job, error) => {
      this.logger.error(`Email job ${job?.id} failed:`, error);
      this.eventEmitter.emit('email.failed', {
        jobId: job?.id,
        userId: job?.data?.userId,
        bookId: job?.data?.bookId,
        error: error.message,
        success: false,
      });
    });

    this.emailWorker.on('progress', (job, progress) => {
      this.logger.log(`Email job ${job.id} progress: ${progress}%`);
      this.eventEmitter.emit('email.progress', {
        jobId: job.id,
        userId: job.data.userId,
        progress,
      });
    });

    this.logger.log('Email worker initialized successfully');
  }

  private async processEmailJob(job: Job<EmailJobData>): Promise<EmailJobResult> {
    const startTime = Date.now();
    const { bookId, recipients, subject, message, userId, providerId } = job.data;

    this.logger.log(`Processing email job for book ${bookId} to ${recipients.length} recipients`);

    try {
      // Update progress
      await job.updateProgress(10);

      // Send email using EmailService
      const result = await this.emailService.sendBookByEmail({
        bookId,
        recipients,
        subject,
        message,
        userId,
        providerId,
      });

      await job.updateProgress(100);

      const processingTime = Date.now() - startTime;

      this.logger.log(`Successfully sent email for book ${bookId} in ${processingTime}ms`);

      return {
        success: true,
        messageId: result.messageId,
        sentTo: recipients,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error(`Failed to send email for book ${bookId}:`, error);

      return {
        success: false,
        error: error.message,
        sentTo: [],
        processingTime,
      };
    }
  }

  async addEmailJob(jobData: EmailJobData): Promise<Job<EmailJobData>> {
    this.logger.log(
      `Adding email job for book ${jobData.bookId} to ${jobData.recipients.length} recipients`,
    );

    const job = await this.emailQueue.add('send-book-email', jobData, {
      priority: 5, // Medium priority
      delay: 1000, // 1 second delay to allow for any immediate cancellations
    });

    this.logger.log(`Email job added with ID: ${job.id}`);

    // Emit event for WebSocket notification
    this.eventEmitter.emit('email.queued', {
      jobId: job.id,
      userId: jobData.userId,
      bookId: jobData.bookId,
      recipients: jobData.recipients,
    });

    return job;
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.emailQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      attemptsMade: job.attemptsMade,
      opts: job.opts,
    };
  }

  async getQueueStats(): Promise<any> {
    const waiting = await this.emailQueue.getWaiting();
    const active = await this.emailQueue.getActive();
    const completed = await this.emailQueue.getCompleted();
    const failed = await this.emailQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  async pauseQueue(): Promise<void> {
    await this.emailQueue.pause();
    this.logger.log('Email queue paused');
  }

  async resumeQueue(): Promise<void> {
    await this.emailQueue.resume();
    this.logger.log('Email queue resumed');
  }

  async cleanQueue(): Promise<void> {
    await this.emailQueue.clean(24 * 60 * 60 * 1000, 100); // Clean jobs older than 24 hours
    this.logger.log('Email queue cleaned');
  }

  private async cleanup(): Promise<void> {
    this.logger.log('Cleaning up email queue service...');

    if (this.emailWorker) {
      await this.emailWorker.close();
    }

    if (this.emailQueue) {
      await this.emailQueue.close();
    }

    this.logger.log('Email queue service cleanup completed');
  }
}
