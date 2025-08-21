import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMagicShelfDto {
  @ApiProperty({ description: 'Magic shelf name', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Magic shelf description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Query string for magic shelf logic' })
  @IsNotEmpty()
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: 'Library ID' })
  @IsOptional()
  @IsNumber()
  libraryId?: number;
}

export class UpdateMagicShelfDto {
  @ApiPropertyOptional({ description: 'Magic shelf name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Magic shelf description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Query string for magic shelf logic' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: 'Library ID' })
  @IsOptional()
  @IsNumber()
  libraryId?: number;
}

export class SmartRecommendationDto {
  @ApiPropertyOptional({ description: 'Library ID for recommendations' })
  @IsOptional()
  @IsNumber()
  libraryId?: number;
}
