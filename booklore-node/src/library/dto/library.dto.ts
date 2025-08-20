import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLibraryDto {
  @ApiProperty({ description: 'Library name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Library description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Is library public', default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Library settings' })
  @IsOptional()
  @IsObject()
  settings?: any;
}

export class UpdateLibraryDto {
  @ApiPropertyOptional({ description: 'Library name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Library description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Is library public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Library settings' })
  @IsOptional()
  @IsObject()
  settings?: any;
}

export class LibraryResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  isPublic: boolean;

  @ApiPropertyOptional()
  settings?: any;

  @ApiProperty()
  ownerId: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  owner?: {
    id: number;
    name: string;
    email: string;
  };

  @ApiPropertyOptional()
  _count?: {
    books: number;
    shelves: number;
    members: number;
  };
}
