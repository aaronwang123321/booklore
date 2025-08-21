import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsArray, Min, IsHexColor } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateShelfDto {
  @ApiProperty({ description: 'Shelf name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Shelf description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Shelf color (hex format)' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiProperty({ description: 'Library ID' })
  @IsInt()
  @Type(() => Number)
  libraryId: number;

  @ApiPropertyOptional({ description: 'Shelf order', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number;
}

export class UpdateShelfDto {
  @ApiPropertyOptional({ description: 'Shelf name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Shelf description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Shelf color (hex format)' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ description: 'Shelf order', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number;
}

export class ShelfResponseDto {
  @ApiProperty({ description: 'Shelf ID' })
  id: number;

  @ApiProperty({ description: 'Shelf name' })
  name: string;

  @ApiPropertyOptional({ description: 'Shelf description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Shelf color' })
  color?: string;

  @ApiProperty({ description: 'Shelf order' })
  order: number;

  @ApiProperty({ description: 'Library ID' })
  libraryId: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Number of books in shelf' })
  bookCount?: number;

  @ApiPropertyOptional({ description: 'Library information' })
  library?: {
    id: number;
    name: string;
  };
}

export class AddBooksToShelfDto {
  @ApiProperty({ description: 'Array of book IDs to add to shelf', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  bookIds: number[];
}

export class RemoveBooksFromShelfDto {
  @ApiProperty({ description: 'Array of book IDs to remove from shelf', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  bookIds: number[];
}

export class ReorderShelfDto {
  @ApiProperty({ description: 'New order position', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  newOrder: number;
}
