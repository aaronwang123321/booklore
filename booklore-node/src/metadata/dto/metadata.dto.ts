import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  IsBoolean,
  IsDateString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetadataSource } from '../interfaces/metadata.interface';

export class MetadataSearchDto {
  @ApiPropertyOptional({ description: 'Book title to search for' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Author name to search for' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: 'ISBN to search for' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ description: 'Language code (e.g., en, fr, de)' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Publication year' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  year?: number;

  @ApiPropertyOptional({
    description: 'Metadata sources to search',
    enum: MetadataSource,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MetadataSource, { each: true })
  sources?: MetadataSource[];

  @ApiPropertyOptional({ description: 'Maximum number of results per source', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}

export class BookMetadataUpdateDto {
  @ApiPropertyOptional({ description: 'Book title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Author name' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: 'ISBN' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ description: 'Language code' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Publisher name' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({ description: 'Publication date' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Book description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Book genres', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @ApiPropertyOptional({ description: 'Book rating (0-5)', minimum: 0, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @ApiPropertyOptional({ description: 'Number of pages' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  pageCount?: number;

  @ApiProperty({ description: 'Metadata source', enum: MetadataSource })
  @IsEnum(MetadataSource)
  source: MetadataSource;

  @ApiPropertyOptional({ description: 'Reason for the update' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkMetadataUpdateDto {
  @ApiProperty({ description: 'Array of book IDs to update', type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  bookIds: number[];

  @ApiProperty({ description: 'Metadata updates to apply' })
  @ValidateNested()
  @Type(() => BookMetadataUpdateDto)
  updates: BookMetadataUpdateDto;

  @ApiPropertyOptional({ description: 'Template ID to apply' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  templateId?: number;
}

export class MetadataTemplateFieldDto {
  @ApiProperty({ description: 'Field name' })
  @IsString()
  fieldName: string;

  @ApiPropertyOptional({ description: 'Default value for the field' })
  @IsOptional()
  defaultValue?: any;

  @ApiProperty({ description: 'Whether the field is required' })
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional({ description: 'Validation regex pattern' })
  @IsOptional()
  @IsString()
  validation?: string;

  @ApiPropertyOptional({ description: 'Transformation rule' })
  @IsOptional()
  @IsString()
  transformation?: string;
}

export class CreateMetadataTemplateDto {
  @ApiProperty({ description: 'Template name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Template fields', type: [MetadataTemplateFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetadataTemplateFieldDto)
  fields: MetadataTemplateFieldDto[];

  @ApiProperty({ description: 'Whether the template is public' })
  @IsBoolean()
  isPublic: boolean;
}

export class UpdateMetadataTemplateDto {
  @ApiPropertyOptional({ description: 'Template name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Template fields', type: [MetadataTemplateFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetadataTemplateFieldDto)
  fields?: MetadataTemplateFieldDto[];

  @ApiPropertyOptional({ description: 'Whether the template is public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class MetadataRefreshConfigDto {
  @ApiProperty({
    description: 'Metadata sources to use for refresh',
    enum: MetadataSource,
    isArray: true,
  })
  @IsArray()
  @IsEnum(MetadataSource, { each: true })
  sources: MetadataSource[];

  @ApiProperty({ description: 'Maximum age in days before refresh is needed', minimum: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  maxAge: number;

  @ApiProperty({ description: 'Whether to enable automatic refresh' })
  @IsBoolean()
  autoRefresh: boolean;

  @ApiProperty({ description: 'Refresh interval in hours', minimum: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  refreshInterval: number;
}

export class MetadataHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Book ID to filter by' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  bookId?: number;

  @ApiPropertyOptional({ description: 'Field name to filter by' })
  @IsOptional()
  @IsString()
  fieldName?: string;

  @ApiPropertyOptional({ description: 'User ID to filter by' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({ description: 'Start date for filtering' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class RollbackMetadataDto {
  @ApiProperty({ description: 'History entry ID to rollback to' })
  @IsNumber()
  @Type(() => Number)
  historyId: number;

  @ApiPropertyOptional({ description: 'Reason for rollback' })
  @IsOptional()
  @IsString()
  reason?: string;
}
