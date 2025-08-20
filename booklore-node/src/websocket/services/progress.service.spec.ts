import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ProgressService, FileProcessingEvent } from './progress.service';
import { ProgressGateway } from '../gateways/progress.gateway';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ProgressService', () => {
  let service: ProgressService;
  let progressGateway: any;

  beforeEach(async () => {
    const mockProgressGateway = {
      notifyFileProcessingStarted: vi.fn(),
      notifyFileProcessingProgress: vi.fn(),
      notifyFileProcessingCompleted: vi.fn(),
      notifyFileProcessingFailed: vi.fn(),
      notifyProgress: vi.fn(),
      getConnectionStats: vi.fn(),
      isUserConnected: vi.fn(),
      getUserSocketCount: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: ProgressGateway,
          useValue: mockProgressGateway,
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    progressGateway = module.get(ProgressGateway);

    // Mock logger to avoid console output during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleFileProcessingStarted', () => {
    it('should handle file processing started event', async () => {
      const event: FileProcessingEvent & { fileName: string } = {
        jobId: 'job-123',
        userId: '1',
        fileName: 'test.pdf',
      };

      await service.handleFileProcessingStarted(event);

      expect(progressGateway.notifyFileProcessingStarted).toHaveBeenCalledWith(
        1,
        'job-123',
        'test.pdf',
      );
    });

    it('should log the event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event: FileProcessingEvent & { fileName: string } = {
        jobId: 'job-123',
        userId: '1',
        fileName: 'test.pdf',
      };

      await service.handleFileProcessingStarted(event);

      expect(logSpy).toHaveBeenCalledWith('File processing started: job-123 for user 1');
    });
  });

  describe('handleFileProcessingProgress', () => {
    it('should handle file processing progress event', async () => {
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
        progress: 50,
      };

      await service.handleFileProcessingProgress(event);

      expect(progressGateway.notifyFileProcessingProgress).toHaveBeenCalledWith(
        1,
        'job-123',
        50,
      );
    });

    it('should handle event with undefined progress', async () => {
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
      };

      await service.handleFileProcessingProgress(event);

      expect(progressGateway.notifyFileProcessingProgress).toHaveBeenCalledWith(
        1,
        'job-123',
        0,
      );
    });

    it('should log the progress event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
        progress: 75,
      };

      await service.handleFileProcessingProgress(event);

      expect(logSpy).toHaveBeenCalledWith('File processing progress: job-123 - 75%');
    });
  });

  describe('handleFileProcessingCompleted', () => {
    it('should handle file processing completed event', async () => {
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
        result: { bookId: 1, title: 'Test Book' },
      };

      await service.handleFileProcessingCompleted(event);

      expect(progressGateway.notifyFileProcessingCompleted).toHaveBeenCalledWith(
        1,
        'job-123',
        { bookId: 1, title: 'Test Book' },
      );
    });

    it('should log the completion event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
        result: { bookId: 1 },
      };

      await service.handleFileProcessingCompleted(event);

      expect(logSpy).toHaveBeenCalledWith('File processing completed: job-123 for user 1');
    });
  });

  describe('handleFileProcessingFailed', () => {
    it('should handle file processing failed event', async () => {
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
        error: 'Invalid file format',
      };

      await service.handleFileProcessingFailed(event);

      expect(progressGateway.notifyFileProcessingFailed).toHaveBeenCalledWith(
        1,
        'job-123',
        'Invalid file format',
      );
    });

    it('should handle event with undefined error', async () => {
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
      };

      await service.handleFileProcessingFailed(event);

      expect(progressGateway.notifyFileProcessingFailed).toHaveBeenCalledWith(
        1,
        'job-123',
        'Unknown error',
      );
    });

    it('should log the error event', async () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error');
      const event: FileProcessingEvent = {
        jobId: 'job-123',
        userId: '1',
        error: 'File corrupted',
      };

      await service.handleFileProcessingFailed(event);

      expect(errorSpy).toHaveBeenCalledWith(
        'File processing failed: job-123 for user 1 - File corrupted',
      );
    });
  });

  describe('handleBookMetadataUpdated', () => {
    it('should handle book metadata updated event', async () => {
      const event = {
        bookId: 1,
        userId: 1,
        metadata: { title: 'Updated Title', author: 'New Author' },
      };

      await service.handleBookMetadataUpdated(event);

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith({
        jobId: 'metadata-1',
        userId: 1,
        progress: 100,
        status: 'completed',
        message: 'Book metadata updated',
        data: {
          bookId: 1,
          metadata: { title: 'Updated Title', author: 'New Author' },
        },
      });
    });

    it('should log the metadata update event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event = {
        bookId: 1,
        userId: 1,
        metadata: { title: 'Test' },
      };

      await service.handleBookMetadataUpdated(event);

      expect(logSpy).toHaveBeenCalledWith('Book metadata updated: 1 for user 1');
    });
  });

  describe('handleBookCoverExtracted', () => {
    it('should handle book cover extracted event', async () => {
      const event = {
        bookId: 1,
        userId: 1,
        coverUrl: 'https://example.com/cover.jpg',
      };

      await service.handleBookCoverExtracted(event);

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith({
        jobId: 'cover-1',
        userId: 1,
        progress: 100,
        status: 'completed',
        message: 'Book cover extracted',
        data: {
          bookId: 1,
          coverUrl: 'https://example.com/cover.jpg',
        },
      });
    });

    it('should log the cover extraction event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event = {
        bookId: 1,
        userId: 1,
        coverUrl: 'https://example.com/cover.jpg',
      };

      await service.handleBookCoverExtracted(event);

      expect(logSpy).toHaveBeenCalledWith('Book cover extracted: 1 for user 1');
    });
  });

  describe('handleLibraryBookAdded', () => {
    it('should handle library book added event', async () => {
      const event = {
        libraryId: 1,
        bookId: 2,
        userId: 1,
      };

      await service.handleLibraryBookAdded(event);

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          progress: 100,
          status: 'completed',
          message: 'New book added to library',
          data: {
            libraryId: 1,
            bookId: 2,
            action: 'book_added',
          },
        }),
      );
    });

    it('should generate unique jobId with timestamp', async () => {
      const event = {
        libraryId: 1,
        bookId: 2,
        userId: 1,
      };

      await service.handleLibraryBookAdded(event);

      const call = progressGateway.notifyProgress.mock.calls[0][0];
      expect(call.jobId).toMatch(/^library-update-1-\d+$/);
    });

    it('should log the library book added event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event = {
        libraryId: 1,
        bookId: 2,
        userId: 1,
      };

      await service.handleLibraryBookAdded(event);

      expect(logSpy).toHaveBeenCalledWith('Book added to library: 2 in library 1');
    });
  });

  describe('handleReadingProgressUpdated', () => {
    it('should handle reading progress updated event', async () => {
      const event = {
        bookId: 1,
        userId: 1,
        progress: 75,
        chapter: 'Chapter 5',
        position: { page: 120, offset: 0.5 },
      };

      await service.handleReadingProgressUpdated(event);

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'reading-1',
          userId: 1,
          progress: 75,
          status: 'progress',
          message: 'Reading progress synchronized',
          data: expect.objectContaining({
            bookId: 1,
            progress: 75,
            chapter: 'Chapter 5',
            position: { page: 120, offset: 0.5 },
            timestamp: expect.any(String),
          }),
        }),
      );
    });

    it('should handle reading progress without optional fields', async () => {
      const event = {
        bookId: 1,
        userId: 1,
        progress: 50,
      };

      await service.handleReadingProgressUpdated(event);

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'reading-1',
          userId: 1,
          progress: 50,
          status: 'progress',
          message: 'Reading progress synchronized',
          data: expect.objectContaining({
            bookId: 1,
            progress: 50,
            chapter: undefined,
            position: undefined,
          }),
        }),
      );
    });

    it('should log the reading progress event', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      const event = {
        bookId: 1,
        userId: 1,
        progress: 80,
      };

      await service.handleReadingProgressUpdated(event);

      expect(logSpy).toHaveBeenCalledWith(
        'Reading progress updated: 1 for user 1 - 80%',
      );
    });
  });

  describe('notifyCustomProgress', () => {
    it('should send custom progress notification', async () => {
      await service.notifyCustomProgress(
        1,
        'custom-job',
        50,
        'progress',
        'Custom message',
        { customData: 'test' },
        undefined,
      );

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith({
        jobId: 'custom-job',
        userId: 1,
        progress: 50,
        status: 'progress',
        message: 'Custom message',
        data: { customData: 'test' },
        error: undefined,
      });
    });

    it('should send custom progress notification with error', async () => {
      await service.notifyCustomProgress(
        1,
        'failed-job',
        0,
        'failed',
        'Operation failed',
        undefined,
        'Network error',
      );

      expect(progressGateway.notifyProgress).toHaveBeenCalledWith({
        jobId: 'failed-job',
        userId: 1,
        progress: 0,
        status: 'failed',
        message: 'Operation failed',
        data: undefined,
        error: 'Network error',
      });
    });
  });

  describe('utility methods', () => {
    it('should get connection statistics', () => {
      const mockStats = {
        totalConnections: 5,
        uniqueUsers: 3,
        pendingProgressUpdates: 2,
      };
      progressGateway.getConnectionStats.mockReturnValue(mockStats);

      const result = service.getConnectionStats();

      expect(result).toEqual(mockStats);
      expect(progressGateway.getConnectionStats).toHaveBeenCalled();
    });

    it('should check if user is connected', () => {
      progressGateway.isUserConnected.mockReturnValue(true);

      const result = service.isUserConnected(1);

      expect(result).toBe(true);
      expect(progressGateway.isUserConnected).toHaveBeenCalledWith(1);
    });

    it('should get user socket count', () => {
      progressGateway.getUserSocketCount.mockReturnValue(2);

      const result = service.getUserSocketCount(1);

      expect(result).toBe(2);
      expect(progressGateway.getUserSocketCount).toHaveBeenCalledWith(1);
    });
  });
});