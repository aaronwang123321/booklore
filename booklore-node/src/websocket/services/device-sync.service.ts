import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationGateway } from '../gateways/notification.gateway';

export interface DeviceInfo {
  deviceId: string;
  userId: number;
  deviceType: 'web' | 'mobile' | 'tablet' | 'desktop';
  deviceName?: string;
  userAgent?: string;
  lastSeen: Date;
  isOnline: boolean;
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

export interface SyncConflict {
  id: string;
  userId: number;
  bookId: number;
  conflictType: 'progress' | 'bookmark' | 'note';
  deviceA: {
    deviceId: string;
    data: any;
    timestamp: Date;
  };
  deviceB: {
    deviceId: string;
    data: any;
    timestamp: Date;
  };
  resolvedAt?: Date;
  resolution?: 'device_a' | 'device_b' | 'merge' | 'manual';
}

export interface CrossDeviceActivity {
  userId: number;
  activityType:
    | 'reading_started'
    | 'reading_paused'
    | 'reading_resumed'
    | 'bookmark_added'
    | 'note_created';
  bookId: number;
  deviceId: string;
  timestamp: Date;
  data?: any;
}

@Injectable()
export class DeviceSyncService {
  private readonly logger = new Logger(DeviceSyncService.name);
  private readonly deviceRegistry = new Map<string, DeviceInfo>(); // deviceId -> DeviceInfo
  private readonly userDeviceMap = new Map<number, Set<string>>(); // userId -> Set<deviceId>
  private readonly syncConflicts = new Map<string, SyncConflict>(); // conflictId -> SyncConflict
  private readonly activityHistory = new Map<number, CrossDeviceActivity[]>(); // userId -> activities

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  // 注册设备
  async registerDevice(deviceInfo: DeviceInfo): Promise<void> {
    const { deviceId, userId } = deviceInfo;

    // 更新设备注册表
    this.deviceRegistry.set(deviceId, {
      ...deviceInfo,
      lastSeen: new Date(),
      isOnline: true,
    });

    // 更新用户设备映射
    if (!this.userDeviceMap.has(userId)) {
      this.userDeviceMap.set(userId, new Set());
    }
    this.userDeviceMap.get(userId)!.add(deviceId);

    // 通知其他设备有新设备上线
    await this.broadcastDeviceStatus(userId, deviceId, 'online');

    // 发送设备列表更新
    await this.sendDeviceListUpdate(userId);

    this.logger.log(`Device registered: ${deviceId} for user ${userId}`);
  }

  // 注销设备
  async unregisterDevice(userId: number, deviceId: string): Promise<void> {
    const device = this.deviceRegistry.get(deviceId);
    if (device) {
      device.isOnline = false;
      device.lastSeen = new Date();
    }

    // 从用户设备映射中移除
    const userDevices = this.userDeviceMap.get(userId);
    if (userDevices) {
      userDevices.delete(deviceId);
      if (userDevices.size === 0) {
        this.userDeviceMap.delete(userId);
      }
    }

    // 通知其他设备有设备下线
    await this.broadcastDeviceStatus(userId, deviceId, 'offline');

    // 发送设备列表更新
    await this.sendDeviceListUpdate(userId);

    this.logger.log(`Device unregistered: ${deviceId} for user ${userId}`);
  }

  // 更新设备状态
  async updateDeviceStatus(deviceId: string, updates: Partial<DeviceInfo>): Promise<void> {
    const device = this.deviceRegistry.get(deviceId);
    if (device) {
      Object.assign(device, updates, { lastSeen: new Date() });

      // 如果更新了当前阅读的书籍，通知其他设备
      if (updates.currentBook) {
        await this.broadcastCurrentBookUpdate(device.userId, deviceId, updates.currentBook);
      }
    }
  }

  // 检测并处理同步冲突
  async detectSyncConflict(
    userId: number,
    bookId: number,
    conflictType: 'progress' | 'bookmark' | 'note',
    deviceAData: { deviceId: string; data: any; timestamp: Date },
    deviceBData: { deviceId: string; data: any; timestamp: Date },
  ): Promise<SyncConflict> {
    const conflictId = `${userId}-${bookId}-${conflictType}-${Date.now()}`;

    const conflict: SyncConflict = {
      id: conflictId,
      userId,
      bookId,
      conflictType,
      deviceA: deviceAData,
      deviceB: deviceBData,
    };

    this.syncConflicts.set(conflictId, conflict);

    // 通知用户有同步冲突
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'sync_conflict',
      data: {
        conflictId,
        conflictType,
        bookId,
        devices: [deviceAData.deviceId, deviceBData.deviceId],
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.warn(`Sync conflict detected: ${conflictId}`);
    return conflict;
  }

  // 解决同步冲突
  async resolveSyncConflict(
    conflictId: string,
    resolution: 'device_a' | 'device_b' | 'merge' | 'manual',
    resolvedData?: any,
  ): Promise<void> {
    const conflict = this.syncConflicts.get(conflictId);
    if (!conflict) {
      throw new Error('Conflict not found');
    }

    conflict.resolvedAt = new Date();
    conflict.resolution = resolution;

    let finalData: any;
    switch (resolution) {
      case 'device_a':
        finalData = conflict.deviceA.data;
        break;
      case 'device_b':
        finalData = conflict.deviceB.data;
        break;
      case 'merge':
        finalData = this.mergeConflictData(conflict);
        break;
      case 'manual':
        finalData = resolvedData;
        break;
    }

    // 广播解决方案到所有设备
    await this.broadcastConflictResolution(conflict.userId, {
      conflictId,
      resolution,
      finalData,
      bookId: conflict.bookId,
      conflictType: conflict.conflictType,
    });

    // 清理已解决的冲突
    this.syncConflicts.delete(conflictId);

    this.logger.log(`Sync conflict resolved: ${conflictId} with ${resolution}`);
  }

  // 记录跨设备活动
  async recordCrossDeviceActivity(activity: CrossDeviceActivity): Promise<void> {
    const { userId } = activity;

    if (!this.activityHistory.has(userId)) {
      this.activityHistory.set(userId, []);
    }

    const userActivities = this.activityHistory.get(userId)!;
    userActivities.push(activity);

    // 保持最近100条活动记录
    if (userActivities.length > 100) {
      userActivities.splice(0, userActivities.length - 100);
    }

    // 广播活动到其他设备
    await this.broadcastActivity(userId, activity);
  }

  // 获取用户的所有设备
  getUserDevices(userId: number): DeviceInfo[] {
    const deviceIds = this.userDeviceMap.get(userId) || new Set();
    return Array.from(deviceIds)
      .map(deviceId => this.deviceRegistry.get(deviceId))
      .filter(device => device !== undefined) as DeviceInfo[];
  }

  // 获取在线设备
  getOnlineDevices(userId: number): DeviceInfo[] {
    return this.getUserDevices(userId).filter(device => device.isOnline);
  }

  // 获取用户的活动历史
  getUserActivityHistory(userId: number, limit: number = 50): CrossDeviceActivity[] {
    const activities = this.activityHistory.get(userId) || [];
    return activities.slice(-limit);
  }

  // 获取未解决的冲突
  getUnresolvedConflicts(userId: number): SyncConflict[] {
    return Array.from(this.syncConflicts.values()).filter(
      conflict => conflict.userId === userId && !conflict.resolvedAt,
    );
  }

  // 强制同步所有设备
  async forceSyncAllDevices(userId: number): Promise<void> {
    const devices = this.getOnlineDevices(userId);

    if (devices.length === 0) {
      return;
    }

    // 获取最新的阅读数据
    const latestReadingData = await this.getLatestReadingData(userId);

    // 广播到所有设备
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'force_sync',
      data: {
        readingData: latestReadingData,
        timestamp: new Date().toISOString(),
        deviceCount: devices.length,
      },
    });

    this.logger.log(`Force sync initiated for user ${userId} across ${devices.length} devices`);
  }

  // 私有方法
  private async broadcastDeviceStatus(
    userId: number,
    deviceId: string,
    status: 'online' | 'offline',
  ): Promise<void> {
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'device_status_change',
      data: {
        deviceId,
        status,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async sendDeviceListUpdate(userId: number): Promise<void> {
    const devices = this.getUserDevices(userId);
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'device_list_update',
      data: {
        devices: devices.map(device => ({
          deviceId: device.deviceId,
          deviceType: device.deviceType,
          deviceName: device.deviceName,
          isOnline: device.isOnline,
          lastSeen: device.lastSeen,
          currentBook: device.currentBook,
        })),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async broadcastCurrentBookUpdate(
    userId: number,
    deviceId: string,
    currentBook: any,
  ): Promise<void> {
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'current_book_update',
      data: {
        deviceId,
        currentBook,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async broadcastConflictResolution(userId: number, resolutionData: any): Promise<void> {
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'conflict_resolved',
      data: resolutionData,
    });
  }

  private async broadcastActivity(userId: number, activity: CrossDeviceActivity): Promise<void> {
    await this.notificationGateway.sendNotificationToUser(userId.toString(), {
      type: 'cross_device_activity',
      data: activity,
    });
  }

  private mergeConflictData(conflict: SyncConflict): any {
    // 简单的合并策略：使用最新的时间戳
    const deviceATime = conflict.deviceA.timestamp.getTime();
    const deviceBTime = conflict.deviceB.timestamp.getTime();

    return deviceATime > deviceBTime ? conflict.deviceA.data : conflict.deviceB.data;
  }

  private async getLatestReadingData(userId: number): Promise<any> {
    // 从数据库获取最新的阅读数据
    const progress = await this.prisma.userBookProgress.findMany({
      where: { userId },
      orderBy: { lastReadAt: 'desc' },
      take: 10,
    });

    // 暂时注释，等待bookmark表创建
    // const bookmarks = await this.prisma.bookmark.findMany({
    //   where: { userId },
    //   orderBy: { createdAt: 'desc' },
    //   take: 50,
    // });
    const bookmarks: any[] = []; // 临时空数组

    return {
      progress,
      bookmarks,
    };
  }

  // 定时清理离线设备
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupOfflineDevices(): Promise<void> {
    const now = new Date();
    const offlineThreshold = 5 * 60 * 1000; // 5分钟
    const devicesToCleanup: string[] = [];

    for (const [deviceId, device] of this.deviceRegistry) {
      const timeSinceLastSeen = now.getTime() - device.lastSeen.getTime();

      if (device.isOnline && timeSinceLastSeen > offlineThreshold) {
        device.isOnline = false;
        devicesToCleanup.push(deviceId);

        // 通知用户设备离线
        await this.broadcastDeviceStatus(device.userId, deviceId, 'offline');
      }
    }

    if (devicesToCleanup.length > 0) {
      this.logger.log(`Marked ${devicesToCleanup.length} devices as offline`);
    }
  }

  // 定时清理旧的活动记录
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldActivities(): Promise<void> {
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    const now = new Date();
    let cleanedCount = 0;

    for (const [userId, activities] of this.activityHistory) {
      const filteredActivities = activities.filter(
        activity => now.getTime() - activity.timestamp.getTime() < maxAge,
      );

      if (filteredActivities.length !== activities.length) {
        this.activityHistory.set(userId, filteredActivities);
        cleanedCount += activities.length - filteredActivities.length;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} old activity records`);
    }
  }

  // 事件监听器
  @OnEvent('device.registered')
  async handleDeviceRegistered(event: DeviceInfo): Promise<void> {
    await this.registerDevice(event);
  }

  @OnEvent('device.unregistered')
  async handleDeviceUnregistered(event: { userId: number; deviceId: string }): Promise<void> {
    await this.unregisterDevice(event.userId, event.deviceId);
  }

  @OnEvent('device.activity')
  async handleDeviceActivity(event: CrossDeviceActivity): Promise<void> {
    await this.recordCrossDeviceActivity(event);
  }

  // 获取统计信息
  getStats() {
    const totalDevices = this.deviceRegistry.size;
    const onlineDevices = Array.from(this.deviceRegistry.values()).filter(
      device => device.isOnline,
    ).length;
    const activeUsers = this.userDeviceMap.size;
    const unresolvedConflicts = Array.from(this.syncConflicts.values()).filter(
      conflict => !conflict.resolvedAt,
    ).length;

    return {
      totalDevices,
      onlineDevices,
      activeUsers,
      unresolvedConflicts,
      totalActivities: Array.from(this.activityHistory.values()).reduce(
        (total, activities) => total + activities.length,
        0,
      ),
    };
  }
}
