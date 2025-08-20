import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VersionService } from '../version/version.service';
import { VersionInfoDto, UpdateInfoDto } from './dto/version.dto';

@ApiTags('Version')
@Controller('version')
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  @ApiOperation({
    summary: 'Get application version information',
    description: 'Returns current application version and build information',
  })
  @ApiResponse({
    status: 200,
    description: 'Version information retrieved successfully',
    type: VersionInfoDto,
  })
  async getVersionInfo(): Promise<VersionInfoDto> {
    return this.versionService.getVersionInfo();
  }

  @Get('update-info')
  @ApiOperation({
    summary: 'Get update information',
    description: 'Check for available updates and return update information',
  })
  @ApiResponse({
    status: 200,
    description: 'Update information retrieved successfully',
    type: UpdateInfoDto,
  })
  async getUpdateInfo(): Promise<UpdateInfoDto> {
    return this.versionService.getUpdateInfo();
  }

  @Get('changelog')
  @ApiOperation({
    summary: 'Get changelog',
    description: 'Returns the changelog for the current and recent versions',
  })
  @ApiResponse({
    status: 200,
    description: 'Changelog retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        changelog: {
          type: 'string',
          description: 'Markdown formatted changelog',
        },
      },
    },
  })
  async getChangelog(): Promise<{ changelog: string }> {
    return this.versionService.getChangelog();
  }
}
