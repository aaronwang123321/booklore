import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  ReadingSyncService,
  ReadingPosition,
  BookmarkData,
  ReadingSession,
} from '../services/reading-sync.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@ApiTags('Reading Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reading-sync')
export class ReadingSyncController {
  constructor(
    private readonly readingSyncService: ReadingSyncService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('progress')
  @ApiOperation({ summary: 'Update reading progress' })
  @ApiResponse({ status: 200, description: 'Reading progress updated successfully' })
  async updateReadingProgress(
    @Request() req: any,
    @Body()
    updateData: {
      bookId: number;
      currentPage?: number;
      progress: number;
      chapter?: string;
      position?: any;
      deviceId?: string;
      deviceType?: 'web' | 'mobile' | 'tablet' | 'desktop';
    },
  ) {
    try {
      const userId = req.user.id;
      const readingPosition: ReadingPosition = {
        ...updateData,
        userId,
        lastReadAt: new Date(),
      };

      // 触发阅读进度更新事件
      await this.eventEmitter.emitAsync('reading.progress.updated', readingPosition);

      // 更新设备活动时间
      if (updateData.deviceId) {
        this.readingSyncService.updateDeviceActivity(userId, updateData.deviceId);
      }

      return {
        success: true,
        message: 'Reading progress updated and synced across devices',
        data: {
          bookId: updateData.bookId,
          progress: updateData.progress,
          syncedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to update reading progress',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('bookmark')
  @ApiOperation({ summary: 'Create and sync bookmark' })
  @ApiResponse({ status: 201, description: 'Bookmark created and synced successfully' })
  async createBookmark(
    @Request() req: any,
    @Body()
    bookmarkData: {
      bookId: number;
      page?: number;
      position?: any;
      note?: string;
      deviceId?: string;
    },
  ) {
    try {
      const userId = req.user.id;
      const bookmark: BookmarkData = {
        ...bookmarkData,
        userId,
        createdAt: new Date(),
      };

      // 触发书签创建事件
      await this.eventEmitter.emitAsync('bookmark.created', bookmark);

      return {
        success: true,
        message: 'Bookmark created and synced across devices',
        data: bookmark,
      };
    } catch (error) {
      throw new HttpException('Failed to create bookmark', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('session/start')
  @ApiOperation({ summary: 'Start reading session' })
  @ApiResponse({ status: 200, description: 'Reading session started successfully' })
  async startReadingSession(
    @Request() req: any,
    @Body()
    sessionData: {
      bookId: number;
      deviceId: string;
      deviceType: 'web' | 'mobile' | 'tablet' | 'desktop';
    },
  ) {
    try {
      const userId = req.user.id;
      const session: ReadingSession = {
        userId,
        bookId: sessionData.bookId,
        deviceId: sessionData.deviceId,
        deviceType: sessionData.deviceType,
        startTime: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      // 触发设备会话开始事件
      await this.eventEmitter.emitAsync('device.session.started', session);

      return {
        success: true,
        message: 'Reading session started',
        data: {
          sessionId: `${userId}-${sessionData.deviceId}`,
          startTime: session.startTime,
        },
      };
    } catch (error) {
      throw new HttpException('Failed to start reading session', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('session/end')
  @ApiOperation({ summary: 'End reading session' })
  @ApiResponse({ status: 200, description: 'Reading session ended successfully' })
  async endReadingSession(
    @Request() req: any,
    @Body()
    sessionData: {
      deviceId: string;
    },
  ) {
    try {
      const userId = req.user.id;

      // 触发设备会话结束事件
      await this.eventEmitter.emitAsync('device.session.ended', {
        userId,
        deviceId: sessionData.deviceId,
      });

      return {
        success: true,
        message: 'Reading session ended',
        data: {
          endTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException('Failed to end reading session', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get user active devices' })
  @ApiResponse({ status: 200, description: 'Active devices retrieved successfully' })
  async getUserDevices(@Request() req: any) {
    try {
      const userId = req.user.id;
      const devices = this.readingSyncService.getUserDevices(userId);
      const sessions = this.readingSyncService.getUserActiveSessions(userId);

      return {
        success: true,
        data: {
          deviceCount: devices.size,
          devices: Array.from(devices),
          activeSessions: sessions.map(session => ({
            deviceId: session.deviceId,
            deviceType: session.deviceType,
            bookId: session.bookId,
            startTime: session.startTime,
            lastActivity: session.lastActivity,
            isActive: session.isActive,
          })),
        },
      };
    } catch (error) {
      throw new HttpException('Failed to get user devices', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('device/:deviceId/status')
  @ApiOperation({ summary: 'Check device online status' })
  @ApiResponse({ status: 200, description: 'Device status retrieved successfully' })
  async getDeviceStatus(@Request() req: any, @Param('deviceId') deviceId: string) {
    try {
      const userId = req.user.id;
      const isOnline = this.readingSyncService.isDeviceOnline(userId, deviceId);

      return {
        success: true,
        data: {
          deviceId,
          isOnline,
          checkedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException('Failed to get device status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('device/:deviceId/heartbeat')
  @ApiOperation({ summary: 'Send device heartbeat' })
  @ApiResponse({ status: 200, description: 'Heartbeat received successfully' })
  async deviceHeartbeat(@Request() req: any, @Param('deviceId') deviceId: string) {
    try {
      const userId = req.user.id;
      this.readingSyncService.updateDeviceActivity(userId, deviceId);

      return {
        success: true,
        message: 'Heartbeat received',
        data: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException('Failed to process heartbeat', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get reading sync statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(@Request() req: any) {
    try {
      const userId = req.user.id;
      const userDevices = this.readingSyncService.getUserDevices(userId);
      const userSessions = this.readingSyncService.getUserActiveSessions(userId);
      const globalStats = this.readingSyncService.getStats();

      return {
        success: true,
        data: {
          user: {
            deviceCount: userDevices.size,
            activeSessionCount: userSessions.length,
          },
          global: globalStats,
        },
      };
    } catch (error) {
      throw new HttpException('Failed to get statistics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('sync/force')
  @ApiOperation({ summary: 'Force sync reading data across all devices' })
  @ApiResponse({ status: 200, description: 'Force sync completed successfully' })
  async forceSync(
    @Request() req: any,
    @Body()
    syncData: {
      bookId?: number;
      includeBookmarks?: boolean;
      includeProgress?: boolean;
    },
  ) {
    try {
      const userId = req.user.id;
      const devices = this.readingSyncService.getUserDevices(userId);

      if (devices.size === 0) {
        return {
          success: true,
          message: 'No active devices to sync',
          data: { deviceCount: 0 },
        };
      }

      // 这里可以实现强制同步逻辑
      // 例如：重新发送最新的阅读进度和书签数据到所有设备

      return {
        success: true,
        message: 'Force sync initiated',
        data: {
          deviceCount: devices.size,
          syncedAt: new Date().toISOString(),
          syncOptions: syncData,
        },
      };
    } catch (error) {
      throw new HttpException('Failed to force sync', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
