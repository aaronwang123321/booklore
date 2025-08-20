import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class SetupStatusDto {
  @ApiProperty({
    description: 'Whether the application setup is complete',
    example: false,
  })
  isSetupComplete: boolean;

  @ApiProperty({
    description: 'Whether any admin users exist',
    example: false,
  })
  hasAdminUsers: boolean;

  @ApiProperty({
    description: 'Total number of users in the system',
    example: 0,
  })
  totalUsers: number;
}

export class FirstUserDto {
  @ApiProperty({
    description: 'Username for the first admin user',
    example: 'admin',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @ApiProperty({
    description: 'Email address for the first admin user',
    example: 'admin@booklore.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password for the first admin user',
    example: 'securePassword123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'Display name for the first admin user',
    example: 'Administrator',
    required: false,
  })
  @IsString()
  @IsOptional()
  displayName?: string;
}

export class SetupResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'First admin user created successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Created user ID',
    example: 1,
  })
  userId: number;

  @ApiProperty({
    description: 'Whether setup is now complete',
    example: true,
  })
  setupComplete: boolean;
}
