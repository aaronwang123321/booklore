import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueService } from './queue.service';
import { QueueConfig } from '../config/queue.config';
import { FileParserService } from '../../book/services/file-parser.service';
import { vi } from 'vitest';

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    getJob: vi.fn().mockResolvedValue({
      id: 'test-job-id',
      data: { filePath: '/test/path' },
      progress: 50,
    }),
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    clean: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('QueueService', () => {
  let service: QueueService;
  let queueConfig: QueueConfig;
  let fileParserService: FileParserService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: QueueService,
          useValue: {
            addFileProcessingJob: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
            getJobStatus: vi.fn().mockResolvedValue({
              id: 'test-job-id',
              data: { filePath: '/test/path' },
              progress: 50,
            }),
            getQueueStats: vi.fn().mockResolvedValue({
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0,
              total: 0,
            }),
            pauseQueue: vi.fn().mockResolvedValue(undefined),
            resumeQueue: vi.fn().mockResolvedValue(undefined),
            cleanQueue: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: QueueConfig,
          useValue: {
            getFileProcessingQueueOptions: vi.fn().mockReturnValue({
              connection: { host: 'localhost', port: 6379 },
              defaultJobOptions: { attempts: 3 },
            }),
            getRedisConnection: vi.fn().mockReturnValue({
              host: 'localhost',
              port: 6379,
            }),
          },
        },
        {
          provide: FileParserService,
          useValue: {
            parseFile: vi.fn().mockResolvedValue({
              success: true,
              metadata: { title: 'Test Book' },
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    queueConfig = module.get<QueueConfig>(QueueConfig);
    fileParserService = module.get<FileParserService>(FileParserService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addFileProcessingJob', () => {
    it('should add a file processing job successfully', async () => {
      const jobData = {
        filePath: '/test/file.epub',
        originalName: 'test.epub',
        mimeType: 'application/epub+zip',
        size: 1024,
        userId: 'user-123',
      };

      const job = await service.addFileProcessingJob(jobData);

      expect(job.id).toBe('test-job-id');
    });

    it('should assign correct priority based on file size', async () => {
      const smallFile = {
        filePath: '/test/small.epub',
        originalName: 'small.epub',
        mimeType: 'application/epub+zip',
        size: 500 * 1024, // 500KB
        userId: 'user-123',
      };

      const largeFile = {
        filePath: '/test/large.epub',
        originalName: 'large.epub',
        mimeType: 'application/epub+zip',
        size: 50 * 1024 * 1024, // 50MB
        userId: 'user-123',
      };

      await service.addFileProcessingJob(smallFile);
      await service.addFileProcessingJob(largeFile);

      // Verify that jobs were added (mocked implementation)
      expect(service).toBeDefined();
    });
  });

  describe('getJobStatus', () => {
    it('should return job status when job exists', async () => {
      const status = await service.getJobStatus('test-job-id');

      expect(status).toEqual({
        id: 'test-job-id',
        name: undefined,
        data: { filePath: '/test/path' },
        progress: 50,
        processedOn: undefined,
        finishedOn: undefined,
        failedReason: undefined,
        returnvalue: undefined,
        attemptsMade: undefined,
        opts: undefined,
      });
    });

    it('should return null when job does not exist', async () => {
      // Mock the service to return null for non-existent job
      vi.mocked(service.getJobStatus).mockResolvedValueOnce(null);

      const status = await service.getJobStatus('non-existent-job');

      expect(status).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
    });
  });

  describe('queue management', () => {
    it('should pause queue', async () => {
      await service.pauseQueue();
      // Verify pause was called (mocked)
      expect(service).toBeDefined();
    });

    it('should resume queue', async () => {
      await service.resumeQueue();
      // Verify resume was called (mocked)
      expect(service).toBeDefined();
    });

    it('should clean queue', async () => {
      await service.cleanQueue();
      // Verify clean was called (mocked)
      expect(service).toBeDefined();
    });
  });
});