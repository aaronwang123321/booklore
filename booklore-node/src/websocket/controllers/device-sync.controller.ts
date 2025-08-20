import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  DeviceSyncService,
  DeviceInfo,
  SyncConflict,
  CrossDeviceActivity,
} from '../services/device-sync.service';

export class RegisterDeviceDto {
  deviceId: string;
  deviceType: 'web' | 'mobile' | 'tablet' | 'desktop';
  deviceName?: string;
  userAgent?: string;
  location?: {
    ip?: string;
    country?: string;
    city?: string;
  };
}

export class UpdateDeviceStatusDto {
  currentBook?: {
    bookId: number;
    title: string;
    progress: number;
    lastReadAt: Date;
  };
  location?: {
    ip?: string;
    country?: string;
    city?: string;
  };
}

export class ResolveConflictDto {
  resolution: 'device_a' | 'device_b' | 'merge' | 'manual';
  resolvedData?: any;
}

export class RecordActivityDto {
  activityType:
    | 'reading_started'
    | 'reading_paused'
    | 'reading_resumed'
    | 'bookmark_added'
    | 'note_created';
  bookId: number;
  deviceId: string;
  data?: any;
}

@ApiTags('Device Sync')
@Controller('device-sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeviceSyncController {
  constructor(private readonly deviceSyncService: DeviceSyncService) {}

  @Post('register')
  @ApiOperation({ summary: '注册设备' })
  @ApiResponse({ status: 201, description: '设备注册成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async registerDevice(
    @Request() req: any,
    @Body() registerDeviceDto: RegisterDeviceDto,
  ): Promise<{ message: string; deviceInfo: DeviceInfo }> {
    try {
      const userId = req.user.id;

      const deviceInfo: DeviceInfo = {
        ...registerDeviceDto,
        userId,
        lastSeen: new Date(),
        isOnline: true,
      };

      await this.deviceSyncService.registerDevice(deviceInfo);

      return {
        message: '设备注册成功',
        deviceInfo,
      };
    } catch (error) {
      throw new HttpException(`设备注册失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':deviceId')
  @ApiOperation({ summary: '注销设备' })
  @ApiResponse({ status: 200, description: '设备注销成功' })
  @ApiResponse({ status: 404, description: '设备不存在' })
  async unregisterDevice(
    @Request() req: any,
    @Param('deviceId') deviceId: string,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.id;
      await this.deviceSyncService.unregisterDevice(userId, deviceId);

      return {
        message: '设备注销成功',
      };
    } catch (error) {
      throw new HttpException(`设备注销失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':deviceId/status')
  @ApiOperation({ summary: '更新设备状态' })
  @ApiResponse({ status: 200, description: '设备状态更新成功' })
  @ApiResponse({ status: 404, description: '设备不存在' })
  async updateDeviceStatus(
    @Param('deviceId') deviceId: string,
    @Body() updateStatusDto: UpdateDeviceStatusDto,
  ): Promise<{ message: string }> {
    try {
      await this.deviceSyncService.updateDeviceStatus(deviceId, updateStatusDto);

      return {
        message: '设备状态更新成功',
      };
    } catch (error) {
      throw new HttpException(`设备状态更新失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('devices')
  @ApiOperation({ summary: '获取用户的所有设备' })
  @ApiResponse({ status: 200, description: '获取设备列表成功' })
  async getUserDevices(
    @Request() req: any,
    @Query('online_only') onlineOnly?: boolean,
  ): Promise<{ devices: DeviceInfo[]; total: number }> {
    try {
      const userId = req.user.id;

      const devices = onlineOnly
        ? this.deviceSyncService.getOnlineDevices(userId)
        : this.deviceSyncService.getUserDevices(userId);

      return {
        devices,
        total: devices.length,
      };
    } catch (error) {
      throw new HttpException(
        `获取设备列表失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('devices/:deviceId/status')
  @ApiOperation({ summary: '检查设备状态' })
  @ApiResponse({ status: 200, description: '获取设备状态成功' })
  @ApiResponse({ status: 404, description: '设备不存在' })
  async getDeviceStatus(
    @Request() req: any,
    @Param('deviceId') deviceId: string,
  ): Promise<{ device: DeviceInfo | null; isOnline: boolean }> {
    try {
      const userId = req.user.id;
      const devices = this.deviceSyncService.getUserDevices(userId);
      const device = devices.find(d => d.deviceId === deviceId);

      if (!device) {
        throw new HttpException('设备不存在', HttpStatus.NOT_FOUND);
      }

      return {
        device,
        isOnline: device.isOnline,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `获取设备状态失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('devices/:deviceId/heartbeat')
  @ApiOperation({ summary: '发送设备心跳' })
  @ApiResponse({ status: 200, description: '心跳发送成功' })
  async sendHeartbeat(
    @Param('deviceId') deviceId: string,
  ): Promise<{ message: string; timestamp: string }> {
    try {
      await this.deviceSyncService.updateDeviceStatus(deviceId, {
        // 只更新最后活跃时间
      });

      return {
        message: '心跳发送成功',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(`心跳发送失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('conflicts')
  @ApiOperation({ summary: '获取未解决的同步冲突' })
  @ApiResponse({ status: 200, description: '获取冲突列表成功' })
  async getUnresolvedConflicts(
    @Request() req: any,
  ): Promise<{ conflicts: SyncConflict[]; total: number }> {
    try {
      const userId = req.user.id;
      const conflicts = this.deviceSyncService.getUnresolvedConflicts(userId);

      return {
        conflicts,
        total: conflicts.length,
      };
    } catch (error) {
      throw new HttpException(
        `获取冲突列表失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('conflicts/:conflictId/resolve')
  @ApiOperation({ summary: '解决同步冲突' })
  @ApiResponse({ status: 200, description: '冲突解决成功' })
  @ApiResponse({ status: 404, description: '冲突不存在' })
  async resolveConflict(
    @Param('conflictId') conflictId: string,
    @Body() resolveDto: ResolveConflictDto,
  ): Promise<{ message: string }> {
    try {
      await this.deviceSyncService.resolveSyncConflict(
        conflictId,
        resolveDto.resolution,
        resolveDto.resolvedData,
      );

      return {
        message: '冲突解决成功',
      };
    } catch (error) {
      throw new HttpException(`冲突解决失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('activity')
  @ApiOperation({ summary: '记录跨设备活动' })
  @ApiResponse({ status: 201, description: '活动记录成功' })
  async recordActivity(
    @Request() req: any,
    @Body() activityDto: RecordActivityDto,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.id;

      const activity: CrossDeviceActivity = {
        ...activityDto,
        userId,
        timestamp: new Date(),
      };

      await this.deviceSyncService.recordCrossDeviceActivity(activity);

      return {
        message: '活动记录成功',
      };
    } catch (error) {
      throw new HttpException(`活动记录失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('activity')
  @ApiOperation({ summary: '获取用户活动历史' })
  @ApiResponse({ status: 200, description: '获取活动历史成功' })
  async getActivityHistory(
    @Request() req: any,
    @Query('limit') limit?: number,
  ): Promise<{ activities: CrossDeviceActivity[]; total: number }> {
    try {
      const userId = req.user.id;
      const activities = this.deviceSyncService.getUserActivityHistory(userId, limit || 50);

      return {
        activities,
        total: activities.length,
      };
    } catch (error) {
      throw new HttpException(
        `获取活动历史失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('force-sync')
  @ApiOperation({ summary: '强制同步所有设备' })
  @ApiResponse({ status: 200, description: '强制同步成功' })
  async forceSyncAllDevices(
    @Request() req: any,
  ): Promise<{ message: string; deviceCount: number }> {
    try {
      const userId = req.user.id;
      const onlineDevices = this.deviceSyncService.getOnlineDevices(userId);

      await this.deviceSyncService.forceSyncAllDevices(userId);

      return {
        message: '强制同步成功',
        deviceCount: onlineDevices.length,
      };
    } catch (error) {
      throw new HttpException(`强制同步失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats')
  @ApiOperation({ summary: '获取同步统计信息' })
  @ApiResponse({ status: 200, description: '获取统计信息成功' })
  async getSyncStats(@Request() req: any): Promise<{
    userStats: {
      totalDevices: number;
      onlineDevices: number;
      unresolvedConflicts: number;
      recentActivities: number;
    };
    globalStats: {
      totalDevices: number;
      onlineDevices: number;
      activeUsers: number;
      unresolvedConflicts: number;
      totalActivities: number;
    };
  }> {
    try {
      const userId = req.user.id;

      // 用户统计
      const userDevices = this.deviceSyncService.getUserDevices(userId);
      const userOnlineDevices = this.deviceSyncService.getOnlineDevices(userId);
      const userConflicts = this.deviceSyncService.getUnresolvedConflicts(userId);
      const userActivities = this.deviceSyncService.getUserActivityHistory(userId, 10);

      // 全局统计
      const globalStats = this.deviceSyncService.getStats();

      return {
        userStats: {
          totalDevices: userDevices.length,
          onlineDevices: userOnlineDevices.length,
          unresolvedConflicts: userConflicts.length,
          recentActivities: userActivities.length,
        },
        globalStats,
      };
    } catch (error) {
      throw new HttpException(
        `获取统计信息失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
