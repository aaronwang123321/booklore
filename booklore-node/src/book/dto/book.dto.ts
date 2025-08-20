import { IsString, IsOptional, IsNumber, IsDateString, IsObject, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookStatus } from '@prisma/client';

export class CreateBookDto {
  @ApiProperty({ description: 'Book title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Book author' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: 'Book ISBN' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ description: 'Book language' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Book publisher' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({ description: 'Book publish date' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Book description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Library ID' })
  @IsNumber()
  libraryId: number;

  @ApiPropertyOptional({ description: 'Shelf ID' })
  @IsOptional()
  @IsNumber()
  shelfId?: number;

  @ApiPropertyOptional({ description: 'Book metadata' })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class UpdateBookDto {
  @ApiPropertyOptional({ description: 'Book title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Book author' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: 'Book ISBN' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ description: 'Book language' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Book publisher' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({ description: 'Book publish date' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Book description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Shelf ID' })
  @IsOptional()
  @IsNumber()
  shelfId?: number;

  @ApiPropertyOptional({ description: 'Book metadata' })
  @IsOptional()
  @IsObject()
  metadata?: any;

  @ApiPropertyOptional({ description: 'Book status' })
  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;
}

export class BookResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  author?: string;

  @ApiPropertyOptional()
  isbn?: string;

  @ApiPropertyOptional()
  language?: string;

  @ApiPropertyOptional()
  publisher?: string;

  @ApiPropertyOptional()
  publishDate?: Date;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  filePath: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  fileSize: number;

  @ApiProperty()
  fileType: string;

  @ApiProperty()
  mimeType: string;

  @ApiPropertyOptional()
  coverImage?: string;

  @ApiPropertyOptional()
  metadata?: any;

  @ApiProperty({ enum: BookStatus })
  status: BookStatus;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  processedAt?: Date;

  @ApiProperty()
  libraryId: number;

  @ApiPropertyOptional()
  shelfId?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  library?: {
    id: number;
    name: string;
  };

  @ApiPropertyOptional()
  shelf?: {
    id: number;
    name: string;
  };

  @ApiPropertyOptional()
  chapters?: Array<{
    id: number;
    title: string;
    href: string;
    order: number;
  }>;
}
