import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SettingRequestDto {
  @ApiProperty({
    description: 'Setting key name',
    example: 'all_books',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Setting value (JSON string)',
    example: '{"refreshCovers": true, "mergeCategories": true}',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class AppSettingDto {
  @ApiProperty({
    description: 'Setting ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Setting key',
    example: 'all_books',
  })
  key: string;

  @ApiProperty({
    description: 'Setting value',
    example: { refreshCovers: true, mergeCategories: true },
  })
  value: any;

  @ApiProperty({
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
  })
  updatedAt: Date;
}

export class AppSettingsResponseDto {
  @ApiProperty({
    description: 'List of application settings',
    type: [AppSettingDto],
  })
  settings: AppSettingDto[];

  @ApiProperty({
    description: 'Total count of settings',
    example: 5,
  })
  total: number;
}

export class UpdateAppSettingsDto {
  @ApiProperty({
    description: 'List of settings to update',
    type: [SettingRequestDto],
  })
  settings: SettingRequestDto[];
}
