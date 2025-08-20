import { ApiProperty } from '@nestjs/swagger';

export class VersionInfoDto {
  @ApiProperty({
    description: 'Application version',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    description: 'Build timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  buildTime: string;

  @ApiProperty({
    description: 'Git commit hash',
    example: 'abc123def456',
  })
  commitHash: string;

  @ApiProperty({
    description: 'Application name',
    example: 'BookLore',
  })
  appName: string;

  @ApiProperty({
    description: 'Environment',
    example: 'production',
  })
  environment: string;
}

export class UpdateInfoDto {
  @ApiProperty({
    description: 'Whether an update is available',
    example: true,
  })
  updateAvailable: boolean;

  @ApiProperty({
    description: 'Latest available version',
    example: '1.1.0',
  })
  latestVersion: string;

  @ApiProperty({
    description: 'Current version',
    example: '1.0.0',
  })
  currentVersion: string;

  @ApiProperty({
    description: 'Release notes for the latest version',
    example: 'Bug fixes and performance improvements',
  })
  releaseNotes: string;

  @ApiProperty({
    description: 'Download URL for the update',
    example: 'https://github.com/user/repo/releases/tag/v1.1.0',
  })
  downloadUrl: string;

  @ApiProperty({
    description: 'Release date',
    example: '2024-01-20T00:00:00Z',
  })
  releaseDate: string;
}
