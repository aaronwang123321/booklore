import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { QueueService } from './queue.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';

// Mock fs
vi.mock('fs');

describe('UploadService', () => {
  let service: UploadService;
  let queueService: QueueService;
  let configService: ConfigService;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.epub',
    encoding: '7bit',
    mimetype: 'application/epub+zip',
    size: 1024,
    buffer: Buffer.from('test file content'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, defaultValue?: any) => {
              const config = {
                UPLOAD_DIR: './uploads',
                MAX_FILE_SIZE: 100 * 1024 * 1024,
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: QueueService,
          useValue: {
            addFileProcessingJob: vi.fn().mockResolvedValue({
              id: 'test-job-id',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    queueService = module.get<QueueService>(QueueService);
    configService = module.get<ConfigService>(ConfigService);

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false); // Directory doesn't exist initially
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFile).mockImplementation((path, data, callback: any) => {
      callback(null);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const options = {
        userId: 'user-123',
        extractCover: true,
        extractChapters: true,
      };

      const result = await service.uploadFile(mockFile, options);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('test-job-id');
      expect(result.originalName).toBe('test.epub');
      expect(result.size).toBe(1024);
      expect(result.mimeType).toBe('application/epub+zip');
    });

    it('should reject file that is too large', async () => {
      const largeFile = {
        ...mockFile,
        size: 200 * 1024 * 1024, // 200MB
      };

      const options = {
        userId: 'user-123',
      };

      const result = await service.uploadFile(largeFile, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should reject unsupported file type', async () => {
      const unsupportedFile = {
        ...mockFile,
        mimetype: 'text/plain',
        originalname: 'test.txt',
      };

      const options = {
        userId: 'user-123',
      };

      const result = await service.uploadFile(unsupportedFile, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('is not supported');
    });

    it('should reject empty file', async () => {
      const emptyFile = {
        ...mockFile,
        size: 0,
        buffer: Buffer.alloc(0),
      };

      const options = {
        userId: 'user-123',
      };

      const result = await service.uploadFile(emptyFile, options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should reject file with invalid filename', async () => {
      const invalidFile = {
        ...mockFile,
        originalname: '../../../etc/passwd',
      };

      const options = {
        userId: 'user-123',
      };

      const result = await service.uploadFile(invalidFile, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('is not supported');
    });

    it('should handle file already exists', async () => {
      // Mock file exists for the specific file path
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().includes('temp') && path.toString().includes('.epub');
      });

      const options = {
        userId: 'user-123',
        overwrite: false,
      };

      const result = await service.uploadFile(mockFile, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should overwrite existing file when overwrite is true', async () => {
      // Mock file exists for the specific file path
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().includes('temp') && path.toString().includes('.epub');
      });

      const options = {
        userId: 'user-123',
        overwrite: true,
      };

      const result = await service.uploadFile(mockFile, options);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('test-job-id');
    });
  });

  describe('uploadMultipleFiles', () => {
    it('should upload multiple files successfully', async () => {
      const files = [
        mockFile,
        { ...mockFile, originalname: 'test2.epub' },
      ];

      const options = {
        userId: 'user-123',
      };

      const results = await service.uploadMultipleFiles(files, options);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      const files = [
        mockFile,
        { ...mockFile, mimetype: 'text/plain', originalname: 'test.txt' },
      ];

      const options = {
        userId: 'user-123',
      };

      const results = await service.uploadMultipleFiles(files, options);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('getSupportedFormats', () => {
    it('should return list of supported formats', () => {
      const formats = service.getSupportedFormats();

      expect(formats).toContain('application/epub+zip');
      expect(formats).toContain('application/pdf');
      expect(formats.length).toBeGreaterThan(0);
    });
  });

  describe('getMaxFileSize', () => {
    it('should return maximum file size', () => {
      const maxSize = service.getMaxFileSize();

      expect(maxSize).toBe(100 * 1024 * 1024); // 100MB
    });
  });
});