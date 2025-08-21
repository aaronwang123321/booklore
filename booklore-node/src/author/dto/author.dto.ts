import { IsString, IsOptional, IsDateString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuthorDto {
  @ApiProperty({ description: 'Author name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Author biography' })
  @IsOptional()
  @IsString()
  biography?: string;

  @ApiPropertyOptional({ description: 'Author birth date' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ description: 'Author death date' })
  @IsOptional()
  @IsDateString()
  deathDate?: string;

  @ApiPropertyOptional({ description: 'Author nationality' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'Author website' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: 'Author image URL' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}

export class UpdateAuthorDto {
  @ApiPropertyOptional({ description: 'Author name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Author biography' })
  @IsOptional()
  @IsString()
  biography?: string;

  @ApiPropertyOptional({ description: 'Author birth date' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ description: 'Author death date' })
  @IsOptional()
  @IsDateString()
  deathDate?: string;

  @ApiPropertyOptional({ description: 'Author nationality' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'Author website' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: 'Author image URL' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}

export class AddAuthorToBookDto {
  @ApiProperty({ description: 'Author ID' })
  authorId: number;

  @ApiPropertyOptional({ description: 'Author role', default: 'author' })
  @IsOptional()
  @IsString()
  role?: string;
}
