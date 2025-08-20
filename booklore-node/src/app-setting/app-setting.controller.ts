import { Controller, Get, Put, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '@prisma/client';
import { AppSettingService } from '../app-setting/app-setting.service';
import { AppSettingsResponseDto, SettingRequestDto } from './dto/app-setting.dto';

@ApiTags('App Settings')
@Controller('settings')
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Get public application settings' })
  @ApiResponse({
    status: 200,
    description: 'Public application settings retrieved successfully',
    type: AppSettingsResponseDto,
  })
  async getPublicAppSettings(): Promise<AppSettingsResponseDto> {
    return await this.appSettingService.getAppSettings();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all application settings' })
  @ApiResponse({
    status: 200,
    description: 'Application settings retrieved successfully',
    type: AppSettingsResponseDto,
  })
  @Roles(Role.ADMIN)
  async getAppSettings(): Promise<AppSettingsResponseDto> {
    return await this.appSettingService.getAppSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update application settings' })
  @ApiResponse({
    status: 200,
    description: 'Application settings updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid setting data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @Roles(Role.ADMIN)
  async updateSettings(@Body() settingRequests: SettingRequestDto[]): Promise<void> {
    await this.appSettingService.updateSettings(settingRequests);
  }
}
