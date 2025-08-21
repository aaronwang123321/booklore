import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class PdfPageQueryDto {
  @ApiProperty({
    description: 'Page number to retrieve',
    example: 1,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  page: number;

  @ApiProperty({
    description: 'Image quality (1-100)',
    example: 85,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quality?: number;

  @ApiProperty({
    description: 'Image density/resolution',
    example: 150,
    minimum: 72,
    maximum: 300,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(72)
  @Max(300)
  density?: number;
}

export class PdfMetadataResponseDto {
  @ApiProperty({
    description: 'Total number of pages in the PDF',
    example: 250,
  })
  totalPages: number;

  @ApiProperty({
    description: 'PDF title from metadata',
    example: 'The Great Gatsby',
  })
  title: string;

  @ApiProperty({
    description: 'PDF author from metadata',
    example: 'F. Scott Fitzgerald',
  })
  author: string;

  @ApiProperty({
    description: 'PDF subject/description',
    example: 'A classic American novel',
    required: false,
  })
  subject?: string;

  @ApiProperty({
    description: 'PDF creation date',
    example: '2023-01-01T00:00:00.000Z',
    required: false,
  })
  creationDate?: string;

  @ApiProperty({
    description: 'PDF file size in bytes',
    example: 1024000,
  })
  fileSize: number;
}

export class PdfPageResponseDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
  })
  pageNumber: number;

  @ApiProperty({
    description: 'Base64 encoded page image',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  imageData: string;

  @ApiProperty({
    description: 'Image width in pixels',
    example: 595,
  })
  width: number;

  @ApiProperty({
    description: 'Image height in pixels',
    example: 842,
  })
  height: number;
}

export class PdfTextExtractionDto {
  @ApiProperty({
    description: 'Page number to extract text from',
    example: 1,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  page: number;
}

export class PdfTextResponseDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
  })
  pageNumber: number;

  @ApiProperty({
    description: 'Extracted text content from the page',
    example: 'Chapter 1\n\nIn my younger and more vulnerable years...',
  })
  text: string;
}
