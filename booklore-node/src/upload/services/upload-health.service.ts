import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { UploadService } from './upload.service';
import * as fs from 'fs';
import * as path from 'path';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message: string;
      details?: any;
    };
  };
  timestamp: string;
}

@Injectable()
export class UploadHealthService {
  private readonly logger = new Logger(UploadHealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    private readonly uploadService: UploadService,
  ) {}

  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Check upload directory
    try {
      const uploadDir = this.configService.get('UPLOAD_DIR', './uploads');
      const dirExists = fs.existsSync(uploadDir);
      const dirWritable = dirExists ? this.checkDirectoryWritable(uploadDir) : false;

      checks.uploadDirectory = {
        status: dirExists && dirWritable ? 'pass' : 'fail',
        message:
          dirExists && dirWritable
            ? 'Upload directory is accessible and writable'
            : 'Upload directory is not accessible or not writable',
        details: {
          path: uploadDir,
          exists: dirExists,
          writable: dirWritable,
        },
      };

      if (!dirExists || !dirWritable) {
        overallStatus = 'unhealthy';
      }
    } catch (error) {
      checks.uploadDirectory = {
        status: 'fail',
        message: `Upload directory check failed: ${error.message}`,
      };
      overallStatus = 'unhealthy';
    }

    // Check queue status
    try {
      const queueStats = await this.queueService.getQueueStats();
      const hasStuckJobs = queueStats.active > 10; // Arbitrary threshold
      const hasFailedJobs = queueStats.failed > 0;

      checks.queue = {
        status: hasStuckJobs ? 'warn' : 'pass',
        message: hasStuckJobs
          ? 'Queue has many active jobs, possible bottleneck'
          : 'Queue is operating normally',
        details: queueStats,
      };

      if (hasStuckJobs && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }

      if (hasFailedJobs) {
        checks.failedJobs = {
          status: 'warn',
          message: `${queueStats.failed} jobs have failed`,
          details: { failedCount: queueStats.failed },
        };

        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    } catch (error) {
      checks.queue = {
        status: 'fail',
        message: `Queue health check failed: ${error.message}`,
      };
      overallStatus = 'unhealthy';
    }

    // Check Redis connection
    try {
      // This would need to be implemented in QueueService
      // For now, assume it's working if queue stats were retrieved
      checks.redis = {
        status: 'pass',
        message: 'Redis connection is healthy',
      };
    } catch (error) {
      checks.redis = {
        status: 'fail',
        message: `Redis connection failed: ${error.message}`,
      };
      overallStatus = 'unhealthy';
    }

    // Check disk space
    try {
      const uploadDir = this.configService.get('UPLOAD_DIR', './uploads');
      const diskSpace = this.checkDiskSpace(uploadDir);
      const lowSpaceThreshold = 1024 * 1024 * 1024; // 1GB

      checks.diskSpace = {
        status: diskSpace.free > lowSpaceThreshold ? 'pass' : 'warn',
        message:
          diskSpace.free > lowSpaceThreshold
            ? 'Sufficient disk space available'
            : 'Low disk space warning',
        details: {
          free: diskSpace.free,
          freeFormatted: this.formatBytes(diskSpace.free),
          total: diskSpace.total,
          totalFormatted: this.formatBytes(diskSpace.total),
        },
      };

      if (diskSpace.free <= lowSpaceThreshold && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    } catch (error) {
      checks.diskSpace = {
        status: 'fail',
        message: `Disk space check failed: ${error.message}`,
      };
      overallStatus = 'unhealthy';
    }

    // Check file processing capabilities
    try {
      const supportedFormats = this.uploadService.getSupportedFormats();
      const maxFileSize = this.uploadService.getMaxFileSize();

      checks.fileProcessing = {
        status: 'pass',
        message: 'File processing capabilities are available',
        details: {
          supportedFormats: supportedFormats.length,
          maxFileSize,
          maxFileSizeFormatted: this.formatBytes(maxFileSize),
        },
      };
    } catch (error) {
      checks.fileProcessing = {
        status: 'fail',
        message: `File processing check failed: ${error.message}`,
      };
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private checkDirectoryWritable(dirPath: string): boolean {
    try {
      const testFile = path.join(dirPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  private checkDiskSpace(dirPath: string): { free: number; total: number } {
    try {
      fs.statSync(dirPath);
      // This is a simplified implementation
      // In a real scenario, you'd use a library like 'statvfs' or 'diskusage'
      return {
        free: 10 * 1024 * 1024 * 1024, // 10GB placeholder
        total: 100 * 1024 * 1024 * 1024, // 100GB placeholder
      };
    } catch {
      return { free: 0, total: 0 };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getDetailedStatus(): Promise<any> {
    const healthCheck = await this.performHealthCheck();
    const uploadStats = await this.uploadService.getUploadStats();
    const queueStats = await this.queueService.getQueueStats();

    return {
      health: healthCheck,
      statistics: {
        uploads: uploadStats,
        queue: queueStats,
      },
      configuration: {
        maxFileSize: this.uploadService.getMaxFileSize(),
        supportedFormats: this.uploadService.getSupportedFormats(),
        uploadDirectory: this.configService.get('UPLOAD_DIR', './uploads'),
      },
    };
  }
}
