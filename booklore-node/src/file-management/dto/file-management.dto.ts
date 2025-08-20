import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MoveFileDto {
  @ApiProperty({ description: 'Book ID to move' })
  @IsNumber()
  @Type(() => Number)
  bookId: number;

  @ApiProperty({ description: 'Target library ID' })
  @IsNumber()
  @Type(() => Number)
  targetLibraryId: number;

  @ApiPropertyOptional({ description: 'Target shelf ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  targetShelfId?: number;

  @ApiPropertyOptional({ description: 'Reason for moving the file' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkMoveFilesDto {
  @ApiProperty({ description: 'Array of book IDs to move', type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  bookIds: number[];

  @ApiProperty({ description: 'Target library ID' })
  @IsNumber()
  @Type(() => Number)
  targetLibraryId: number;

  @ApiPropertyOptional({ description: 'Target shelf ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  targetShelfId?: number;

  @ApiPropertyOptional({ description: 'Reason for moving the files' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RollbackTransactionDto {
  @ApiProperty({ description: 'Transaction ID to rollback' })
  @IsString()
  transactionId: string;

  @ApiPropertyOptional({ description: 'Reason for rollback' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class FileMovementProgressDto {
  @ApiProperty({ description: 'Transaction ID' })
  @IsString()
  transactionId: string;

  @ApiProperty({ description: 'Total number of files' })
  @IsNumber()
  totalFiles: number;

  @ApiProperty({ description: 'Number of processed files' })
  @IsNumber()
  processedFiles: number;

  @ApiPropertyOptional({ description: 'Current file being processed' })
  @IsOptional()
  @IsString()
  currentFile?: string;

  @ApiProperty({ description: 'Movement status' })
  @IsString()
  status: string;

  @ApiProperty({ description: 'Start time' })
  startTime: Date;

  @ApiPropertyOptional({ description: 'Estimated completion time' })
  @IsOptional()
  estimatedCompletion?: Date;
}

export class ValidateFileMovementDto {
  @ApiProperty({ description: 'Book ID to validate' })
  @IsNumber()
  @Type(() => Number)
  bookId: number;

  @ApiProperty({ description: 'Target library ID' })
  @IsNumber()
  @Type(() => Number)
  targetLibraryId: number;

  @ApiPropertyOptional({ description: 'Target shelf ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  targetShelfId?: number;
}

export class FilePermissionCheckDto {
  @ApiProperty({ description: 'Book ID to check permissions for' })
  @IsNumber()
  @Type(() => Number)
  bookId: number;

  @ApiProperty({ description: 'Library ID to check permissions in' })
  @IsNumber()
  @Type(() => Number)
  libraryId: number;
}

export class FileTransactionQueryDto {
  @ApiPropertyOptional({ description: 'User ID to filter by' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({ description: 'Transaction status to filter by' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Transaction type to filter by' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Start date for filtering' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;
}
