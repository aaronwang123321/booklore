import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PathService } from './path.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('path')
@Controller('path')
@UseGuards(JwtAuthGuard)
export class PathController {
  constructor(private readonly pathService: PathService) {}

  @Get()
  @ApiOperation({ summary: 'Get folders at specified path' })
  @ApiQuery({ name: 'path', description: 'Directory path to scan for folders' })
  @ApiResponse({ status: 200, description: 'List of folder names', type: [String] })
  async getFolders(@Query('path') path: string): Promise<string[]> {
    return this.pathService.getFoldersAtPath(path);
  }
}