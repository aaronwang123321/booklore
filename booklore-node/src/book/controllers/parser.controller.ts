import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileParserService } from '../services/file-parser.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { ParseResult } from '../interfaces/book-metadata.interface';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedExtensions = ['.epub', '.pdf'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        `Unsupported file type: ${fileExtension}. Allowed types: ${allowedExtensions.join(', ')}`,
      ),
      false,
    );
  }
};

@ApiTags('File Parser')
@Controller('parser')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ParserController {
  constructor(private readonly fileParserService: FileParserService) {}

  @Post('parse')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter,
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
      },
    }),
  )
  @ApiOperation({ summary: 'Parse uploaded book file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File parsed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or parsing error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async parseFile(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body('extractCover') extractCover?: string,
    @Body('extractChapters') extractChapters?: string,
  ): Promise<ParseResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      const options = {
        extractCover: extractCover === 'true',
        extractChapters: extractChapters === 'true',
        maxFileSize: 100 * 1024 * 1024, // 100MB
        timeout: 60000, // 60 seconds
      };

      const result = await this.fileParserService.parseFile(file.path, options);

      // Clean up temporary file
      this.cleanupTempFile(file.path);

      return result;
    } catch (error) {
      // Clean up temporary file on error
      this.cleanupTempFile(file.path);
      throw error;
    }
  }

  @Post('validate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter,
      limits: {
        fileSize: 100 * 1024 * 1024,
      },
    }),
  )
  @ApiOperation({ summary: 'Validate uploaded book file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File validation result' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async validateFile(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ valid: boolean; fileInfo?: any; error?: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      const isValid = await this.fileParserService.validateFile(file.path);

      let fileInfo = null;
      if (isValid) {
        fileInfo = await this.fileParserService.getFileInfo(file.path);
      }

      // Clean up temporary file
      this.cleanupTempFile(file.path);

      return {
        valid: isValid,
        fileInfo: isValid ? fileInfo : undefined,
        error: isValid ? undefined : 'File validation failed',
      };
    } catch (error) {
      // Clean up temporary file on error
      this.cleanupTempFile(file.path);

      return {
        valid: false,
        error: error.message,
      };
    }
  }

  @Get('supported-formats')
  @ApiOperation({ summary: 'Get supported file formats' })
  @ApiResponse({ status: 200, description: 'List of supported formats' })
  getSupportedFormats(): { formats: string[] } {
    return {
      formats: this.fileParserService.getSupportedFormats(),
    };
  }

  @Get('file-type/:filename')
  @ApiOperation({ summary: 'Get file type from filename' })
  @ApiResponse({ status: 200, description: 'File type information' })
  getFileType(@Param('filename') filename: string): { type: string; supported: boolean } {
    const type = this.fileParserService.getFileType(filename);
    const supported = this.fileParserService.getSupportedFormats().includes(type);

    return {
      type,
      supported,
    };
  }

  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error.message);
    }
  }
}
