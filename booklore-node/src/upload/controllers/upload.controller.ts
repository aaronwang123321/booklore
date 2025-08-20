import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
  UseGuards,
  Param,
  Query,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { UploadService, UploadOptions } from '../services/upload.service';
import { QueueService } from '../services/queue.service';
import * as multer from 'multer';

// Configure multer for memory storage
const multerOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10, // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/epub+zip',
      'application/pdf',
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-cbz',
      'application/x-cbr',
      'application/x-cb7',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error(`Unsupported file type: ${file.mimetype}`) as any;
      cb(error, false);
    }
  },
};

@ApiTags('Upload')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly queueService: QueueService,
  ) {}

  @Post('file')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  @ApiOperation({ summary: 'Upload a single file for processing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        libraryId: {
          type: 'string',
          description: 'Target library ID',
        },
        extractCover: {
          type: 'boolean',
          description: 'Extract cover image',
          default: true,
        },
        extractChapters: {
          type: 'boolean',
          description: 'Extract chapter information',
          default: true,
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing file',
          default: false,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async uploadFile(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body('libraryId') libraryId?: string,
    @Body('extractCover') extractCover?: string,
    @Body('extractChapters') extractChapters?: string,
    @Body('overwrite') overwrite?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const options: UploadOptions = {
      userId: user.id.toString(),
      libraryId,
      extractCover: extractCover === 'true',
      extractChapters: extractChapters === 'true',
      overwrite: overwrite === 'true',
    };

    const result = await this.uploadService.uploadFile(file, options);

    return {
      success: result.success,
      message: result.success ? 'File uploaded successfully' : 'File upload failed',
      data: result.success
        ? {
            jobId: result.jobId,
            originalName: result.originalName,
            size: result.size,
            mimeType: result.mimeType,
          }
        : null,
      error: result.error,
    };
  }

  @Post('files')
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions))
  @ApiOperation({ summary: 'Upload multiple files for processing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        libraryId: {
          type: 'string',
          description: 'Target library ID',
        },
        extractCover: {
          type: 'boolean',
          description: 'Extract cover image',
          default: true,
        },
        extractChapters: {
          type: 'boolean',
          description: 'Extract chapter information',
          default: true,
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing files',
          default: false,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Files uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid files or upload error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async uploadFiles(
    @CurrentUser() user: User,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('libraryId') libraryId?: string,
    @Body('extractCover') extractCover?: string,
    @Body('extractChapters') extractChapters?: string,
    @Body('overwrite') overwrite?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const options: UploadOptions = {
      userId: user.id.toString(),
      libraryId,
      extractCover: extractCover === 'true',
      extractChapters: extractChapters === 'true',
      overwrite: overwrite === 'true',
    };

    const results = await this.uploadService.uploadMultipleFiles(files, options);

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    return {
      success: successCount > 0,
      message: `${successCount} files uploaded successfully, ${failedCount} failed`,
      data: {
        total: results.length,
        successful: successCount,
        failed: failedCount,
        results: results.map(result => ({
          success: result.success,
          jobId: result.jobId,
          originalName: result.originalName,
          size: result.size,
          mimeType: result.mimeType,
          error: result.error,
        })),
      },
    };
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Get job status' })
  @ApiResponse({ status: 200, description: 'Job status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const jobStatus = await this.queueService.getJobStatus(jobId);

    if (!jobStatus) {
      throw new BadRequestException('Job not found');
    }

    return {
      success: true,
      data: jobStatus,
    };
  }

  @Get('queue/stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  @ApiResponse({ status: 200, description: 'Queue statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getQueueStats() {
    const stats = await this.queueService.getQueueStats();

    return {
      success: true,
      data: stats,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get upload statistics' })
  @ApiResponse({ status: 200, description: 'Upload statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUploadStats() {
    const stats = await this.uploadService.getUploadStats();

    return {
      success: true,
      data: stats,
    };
  }

  @Get('formats')
  @ApiOperation({ summary: 'Get supported file formats' })
  @ApiResponse({ status: 200, description: 'Supported formats retrieved successfully' })
  async getSupportedFormats() {
    const formats = this.uploadService.getSupportedFormats();
    const maxFileSize = this.uploadService.getMaxFileSize();

    return {
      success: true,
      data: {
        supportedFormats: formats,
        maxFileSize,
        maxFileSizeFormatted: `${Math.round(maxFileSize / (1024 * 1024))}MB`,
      },
    };
  }

  @Post('queue/pause')
  @ApiOperation({ summary: 'Pause the processing queue' })
  @ApiResponse({ status: 200, description: 'Queue paused successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async pauseQueue() {
    await this.queueService.pauseQueue();

    return {
      success: true,
      message: 'Queue paused successfully',
    };
  }

  @Post('queue/resume')
  @ApiOperation({ summary: 'Resume the processing queue' })
  @ApiResponse({ status: 200, description: 'Queue resumed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resumeQueue() {
    await this.queueService.resumeQueue();

    return {
      success: true,
      message: 'Queue resumed successfully',
    };
  }

  @Post('queue/clean')
  @ApiOperation({ summary: 'Clean old jobs from the queue' })
  @ApiResponse({ status: 200, description: 'Queue cleaned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cleanQueue() {
    await this.queueService.cleanQueue();

    return {
      success: true,
      message: 'Queue cleaned successfully',
    };
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Cleanup old uploaded files' })
  @ApiResponse({ status: 200, description: 'Files cleaned up successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cleanupFiles(@Query('maxAgeHours') maxAgeHours?: string) {
    const maxAge = maxAgeHours ? parseInt(maxAgeHours, 10) : 24;
    await this.uploadService.cleanupOldFiles(maxAge);

    return {
      success: true,
      message: `Files older than ${maxAge} hours cleaned up successfully`,
    };
  }
}
