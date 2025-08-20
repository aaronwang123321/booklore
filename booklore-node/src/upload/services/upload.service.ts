import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { QueueService, FileProcessingJob } from './queue.service';

export interface UploadResult {
  success: boolean;
  jobId?: string;
  filePath?: string;
  originalName?: string;
  size?: number;
  mimeType?: string;
  error?: string;
}

export interface UploadOptions {
  userId: string;
  libraryId?: string;
  extractCover?: boolean;
  extractChapters?: boolean;
  overwrite?: boolean;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {
    this.uploadDir = this.configService.get('UPLOAD_DIR', './uploads');
    this.maxFileSize = this.configService.get('MAX_FILE_SIZE', 100 * 1024 * 1024); // 100MB
    this.allowedMimeTypes = [
      'application/epub+zip',
      'application/pdf',
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-cbz',
      'application/x-cbr',
      'application/x-cb7',
    ];

    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }

    // Create subdirectories
    const subdirs = ['temp', 'processed', 'failed'];
    subdirs.forEach(subdir => {
      const dirPath = path.join(this.uploadDir, subdir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  async uploadFile(file: Express.Multer.File, options: UploadOptions): Promise<UploadResult> {
    try {
      this.logger.log(`Starting file upload: ${file.originalname} (${file.size} bytes)`);

      // Validate file
      this.validateFile(file);

      // Generate unique filename
      const fileHash = this.generateFileHash(file.buffer);
      const fileExtension = path.extname(file.originalname);
      const uniqueFilename = `${fileHash}${fileExtension}`;
      const tempFilePath = path.join(this.uploadDir, 'temp', uniqueFilename);

      // Check if file already exists
      if (fs.existsSync(tempFilePath) && !options.overwrite) {
        this.logger.warn(`File already exists: ${uniqueFilename}`);
        return {
          success: false,
          error: 'File already exists. Use overwrite option to replace.',
        };
      }

      // Save file to temp directory
      await this.saveFile(file.buffer, tempFilePath);

      this.logger.log(`File saved to: ${tempFilePath}`);

      // Create processing job
      const jobData: FileProcessingJob = {
        filePath: tempFilePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        userId: options.userId,
        libraryId: options.libraryId,
        options: {
          extractCover: options.extractCover,
          extractChapters: options.extractChapters,
        },
      };

      const job = await this.queueService.addFileProcessingJob(jobData);

      this.logger.log(`File processing job created: ${job.id}`);

      return {
        success: true,
        jobId: job.id,
        filePath: tempFilePath,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      this.logger.error(`File upload failed: ${file.originalname}`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async uploadMultipleFiles(
    files: Express.Multer.File[],
    options: UploadOptions,
  ): Promise<UploadResult[]> {
    this.logger.log(`Starting batch upload of ${files.length} files`);

    const results: UploadResult[] = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(file, options);
        results.push(result);

        // Add small delay between uploads to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          success: false,
          error: `Error uploading ${file.originalname}: ${error.message}`,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(`Batch upload completed: ${successCount}/${files.length} files successful`);

    return results;
  }

  private validateFile(file: Express.Multer.File): void {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size (${file.size} bytes) exceeds maximum allowed size (${this.maxFileSize} bytes)`,
      );
    }

    // Check MIME type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not supported. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }

    // Check file extension
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.epub', '.pdf', '.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];

    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        `File extension ${extension} is not supported. Allowed extensions: ${allowedExtensions.join(', ')}`,
      );
    }

    // Basic file content validation
    if (file.size === 0) {
      throw new BadRequestException('File is empty');
    }

    // Check for potential security issues
    if (
      file.originalname.includes('..') ||
      file.originalname.includes('/') ||
      file.originalname.includes('\\')
    ) {
      throw new BadRequestException('Invalid filename');
    }
  }

  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  private async saveFile(buffer: Buffer, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, buffer, error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async getUploadStats(): Promise<any> {
    const tempDir = path.join(this.uploadDir, 'temp');
    const processedDir = path.join(this.uploadDir, 'processed');
    const failedDir = path.join(this.uploadDir, 'failed');

    const getDirectoryStats = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) {
        return { count: 0, totalSize: 0 };
      }

      const files = fs.readdirSync(dirPath);
      let totalSize = 0;

      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      });

      return { count: files.length, totalSize };
    };

    const tempStats = getDirectoryStats(tempDir);
    const processedStats = getDirectoryStats(processedDir);
    const failedStats = getDirectoryStats(failedDir);

    return {
      temp: tempStats,
      processed: processedStats,
      failed: failedStats,
      total: {
        count: tempStats.count + processedStats.count + failedStats.count,
        totalSize: tempStats.totalSize + processedStats.totalSize + failedStats.totalSize,
      },
    };
  }

  async cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();

    const cleanDirectory = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;

      const files = fs.readdirSync(dirPath);
      let deletedCount = 0;

      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && now - stats.mtime.getTime() > maxAge) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (error) {
            this.logger.error(`Failed to delete old file: ${filePath}`, error);
          }
        }
      });

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old files from ${dirPath}`);
      }
    };

    // Clean temp and failed directories
    cleanDirectory(path.join(this.uploadDir, 'temp'));
    cleanDirectory(path.join(this.uploadDir, 'failed'));

    this.logger.log('File cleanup completed');
  }

  getSupportedFormats(): string[] {
    return this.allowedMimeTypes;
  }

  getMaxFileSize(): number {
    return this.maxFileSize;
  }
}
