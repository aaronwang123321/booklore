import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { QueueConfig } from '../config/queue.config';
import { FileParserService } from '../../book/services/file-parser.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface FileProcessingJob {
  filePath: string;
  originalName: string;
  mimeType: string;
  size: number;
  userId: string;
  libraryId?: string;
  options?: {
    extractCover?: boolean;
    extractChapters?: boolean;
  };
}

export interface FileProcessingResult {
  success: boolean;
  metadata?: any;
  error?: string;
  filePath: string;
  processingTime: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private fileProcessingQueue: Queue;
  private fileProcessingWorker: Worker;

  constructor(
    private readonly queueConfig: QueueConfig,
    private readonly fileParserService: FileParserService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.initializeQueues();
    await this.initializeWorkers();
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  private async initializeQueues() {
    this.logger.log('Initializing queues...');

    this.fileProcessingQueue = new Queue(
      'file-processing',
      this.queueConfig.getFileProcessingQueueOptions(),
    );

    // Add queue event listeners
    this.fileProcessingQueue.on('error', error => {
      this.logger.error('Queue error:', error);
    });

    // Note: Queue events are handled by BullMQ internally
    // For custom event handling, we use the EventEmitter2 in the worker

    this.logger.log('Queues initialized successfully');
  }

  private async initializeWorkers() {
    this.logger.log('Initializing workers...');

    this.fileProcessingWorker = new Worker(
      'file-processing',
      async (job: Job<FileProcessingJob>) => {
        return await this.processFileJob(job);
      },
      {
        connection: this.queueConfig.getRedisConnection(),
        concurrency: 3, // Process up to 3 files concurrently
        limiter: {
          max: 10, // Max 10 jobs per duration
          duration: 60000, // 1 minute
        },
      },
    );

    // Add worker event listeners
    this.fileProcessingWorker.on('completed', (job, result) => {
      this.logger.log(`Worker completed job ${job.id}`);
      this.eventEmitter.emit('file.processing.completed', {
        jobId: job.id,
        userId: job.data.userId,
        result,
      });
    });

    this.fileProcessingWorker.on('failed', (job, error) => {
      this.logger.error(`Worker failed job ${job?.id}:`, error);
      this.eventEmitter.emit('file.processing.failed', {
        jobId: job?.id,
        userId: job?.data?.userId,
        error: error.message,
      });
    });

    this.fileProcessingWorker.on('progress', (job, progress) => {
      this.logger.log(`Job ${job.id} progress: ${progress}%`);
      this.eventEmitter.emit('file.processing.progress', {
        jobId: job.id,
        userId: job.data.userId,
        progress,
      });
    });

    this.logger.log('Workers initialized successfully');
  }

  private async processFileJob(job: Job<FileProcessingJob>): Promise<FileProcessingResult> {
    const startTime = Date.now();
    const { filePath, originalName, userId, options } = job.data;

    this.logger.log(`Processing file: ${originalName} for user: ${userId}`);

    try {
      // Update progress
      await job.updateProgress(10);

      // Validate file exists
      const fs = await import('fs');
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      await job.updateProgress(20);

      // Parse file using FileParserService
      const parseResult = await this.fileParserService.parseFile(filePath, {
        extractCover: options?.extractCover ?? true,
        extractChapters: options?.extractChapters ?? true,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        timeout: 300000, // 5 minutes
      });

      await job.updateProgress(80);

      if (!parseResult.success) {
        throw new Error(parseResult.error || 'File parsing failed');
      }

      await job.updateProgress(100);

      const processingTime = Date.now() - startTime;

      this.logger.log(`Successfully processed file: ${originalName} in ${processingTime}ms`);

      return {
        success: true,
        metadata: parseResult.metadata,
        filePath,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error(`Failed to process file: ${originalName}`, error);

      return {
        success: false,
        error: error.message,
        filePath,
        processingTime,
      };
    }
  }

  async addFileProcessingJob(jobData: FileProcessingJob): Promise<Job<FileProcessingJob>> {
    this.logger.log(`Adding file processing job for: ${jobData.originalName}`);

    const job = await this.fileProcessingQueue.add('process-file', jobData, {
      priority: this.getJobPriority(jobData.size),
      delay: 0, // Process immediately
    });

    this.logger.log(`File processing job added with ID: ${job.id}`);

    // Emit event for WebSocket notification
    this.eventEmitter.emit('file.processing.started', {
      jobId: job.id,
      userId: jobData.userId,
      fileName: jobData.originalName,
    });

    return job;
  }

  private getJobPriority(fileSize: number): number {
    // Smaller files get higher priority
    if (fileSize < 1024 * 1024) return 10; // < 1MB
    if (fileSize < 10 * 1024 * 1024) return 5; // < 10MB
    return 1; // >= 10MB
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.fileProcessingQueue.getJob(jobId);
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
    const waiting = await this.fileProcessingQueue.getWaiting();
    const active = await this.fileProcessingQueue.getActive();
    const completed = await this.fileProcessingQueue.getCompleted();
    const failed = await this.fileProcessingQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  async pauseQueue(): Promise<void> {
    await this.fileProcessingQueue.pause();
    this.logger.log('Queue paused');
  }

  async resumeQueue(): Promise<void> {
    await this.fileProcessingQueue.resume();
    this.logger.log('Queue resumed');
  }

  async cleanQueue(): Promise<void> {
    await this.fileProcessingQueue.clean(24 * 60 * 60 * 1000, 100); // Clean jobs older than 24 hours
    this.logger.log('Queue cleaned');
  }

  private async cleanup(): Promise<void> {
    this.logger.log('Cleaning up queue service...');

    if (this.fileProcessingWorker) {
      await this.fileProcessingWorker.close();
    }

    if (this.fileProcessingQueue) {
      await this.fileProcessingQueue.close();
    }

    this.logger.log('Queue service cleanup completed');
  }
}
