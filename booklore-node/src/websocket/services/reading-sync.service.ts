import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { ProgressGateway } from '../gateways/progress.gateway';

export interface ReadingPosition {
  bookId: number;
  userId: number;
  currentPage?: number;
  progress: number;
  chapter?: string;
  position?: {
    x?: number;
    y?: number;
    selector?: string;
    offset?: number;
  };
  lastReadAt: Date;
  deviceId?: string;
  deviceType?: 'web' | 'mobile' | 'tablet' | 'desktop';
}

export interface BookmarkData {
  id?: string;
  bookId: number;
  userId: number;
  page?: number;
  position?: any;
  note?: string;
  createdAt: Date;
  deviceId?: string;
}

export interface ReadingSession {
  userId: number;
  bookId: number;
  deviceId: string;
  deviceType: 'web' | 'mobile' | 'tablet' | 'desktop';
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
}

@Injectable()
export class ReadingSyncService {
  private readonly logger = new Logger(ReadingSyncService.name);
  private readonly activeSessions = new Map<string, ReadingSession>(); // sessionKey -> session
  private readonly userDevices = new Map<number, Set<string>>(); // userId -> deviceIds

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    private readonly progressGateway: ProgressGateway,
  ) {}

  // 同步阅读进度到所有设备
  async syncReadingProgress(position: ReadingPosition): Promise<void> {
    try {
      // 更新数据库中的阅读进度
      await this.updateReadingProgressInDB(position);

      // 获取用户的所有活跃设备
      const userDevices = this.getUserDevices(position.userId);

      // 通过WebSocket广播到用户的所有设备
      await this.broadcastToUserDevices(position.userId, 'reading_progress_sync', {
        bookId: position.bookId,
        progress: position.progress,
        currentPage: position.currentPage,
        chapter: position.chapter,
        position: position.position,
        lastReadAt: position.lastReadAt,
        syncedFromDevice: position.deviceId,
      });

      // 发送进度更新通知
      await this.progressGateway.notifyProgress({
        jobId: `reading-sync-${position.bookId}`,
        userId: position.userId,
        progress: position.progress,
        status: 'progress',
        message: 'Reading progress synchronized across devices',
        data: {
          bookId: position.bookId,
          progress: position.progress,
          deviceCount: userDevices.size,
          timestamp: new Date().toISOString(),
        },
      });

      this.logger.log(
        `Reading progress synced for user ${position.userId}, book ${position.bookId}: ${position.progress}%`,
      );
    } catch (error) {
      this.logger.error('Failed to sync reading progress:', error);
      throw error;
    }
  }

  // 同步书签到所有设备 - 暂时注释，等待bookmark表创建
  async syncBookmark(bookmark: BookmarkData): Promise<void> {
    try {
      // 保存书签到数据库 - 暂时注释
      // const savedBookmark = await this.saveBookmarkToDB(bookmark);

      // 广播书签更新到用户的所有设备
      await this.broadcastToUserDevices(bookmark.userId, 'bookmark_sync', {
        ...bookmark, // 使用原始数据而不是保存后的数据
        syncedFromDevice: bookmark.deviceId,
      });

      this.logger.log(`Bookmark synced for user ${bookmark.userId}, book ${bookmark.bookId}`);
    } catch (error) {
      this.logger.error('Failed to sync bookmark:', error);
      throw error;
    }
  }

  // 注册设备会话
  async registerDeviceSession(session: ReadingSession): Promise<void> {
    const sessionKey = `${session.userId}-${session.deviceId}`;
    this.activeSessions.set(sessionKey, {
      ...session,
      lastActivity: new Date(),
      isActive: true,
    });

    // 添加到用户设备列表
    if (!this.userDevices.has(session.userId)) {
      this.userDevices.set(session.userId, new Set());
    }
    this.userDevices.get(session.userId)!.add(session.deviceId);

    // 通知其他设备有新设备上线
    await this.broadcastToUserDevices(
      session.userId,
      'device_online',
      {
        deviceId: session.deviceId,
        deviceType: session.deviceType,
        timestamp: new Date().toISOString(),
      },
      session.deviceId,
    ); // 排除当前设备

    this.logger.log(`Device session registered: ${session.deviceId} for user ${session.userId}`);
  }

  // 注销设备会话
  async unregisterDeviceSession(userId: number, deviceId: string): Promise<void> {
    const sessionKey = `reading_session:${userId}:${deviceId}`;
    this.activeSessions.delete(sessionKey);

    // 从用户设备列表中移除
    const userDeviceSet = this.userDevices.get(userId);
    if (userDeviceSet) {
      userDeviceSet.delete(deviceId);
      if (userDeviceSet.size === 0) {
        this.userDevices.delete(userId);
      }
    }

    // 通知其他设备有设备下线
    await this.broadcastToUserDevices(userId, 'device_offline', {
      deviceId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Device session unregistered: ${deviceId} for user ${userId}`);
  }

  // 获取设备会话信息
  async getDeviceSession(userId: number, deviceId: string): Promise<any> {
    const sessionKey = `reading_session:${userId}:${deviceId}`;
    return this.activeSessions.get(sessionKey) || null;
  }

  // 获取用户的活跃设备
  getUserDevices(userId: number): Set<string> {
    return this.userDevices.get(userId) || new Set();
  }

  // 获取用户的活跃会话
  getUserActiveSessions(userId: number): ReadingSession[] {
    const sessions: ReadingSession[] = [];
    for (const [, session] of this.activeSessions) {
      if (session.userId === userId && session.isActive) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  // 检查设备是否在线
  isDeviceOnline(userId: number, deviceId: string): boolean {
    const sessionKey = `reading_session:${userId}:${deviceId}`;
    const session = this.activeSessions.get(sessionKey);
    return session?.isActive || false;
  }

  // 更新设备活动时间
  updateDeviceActivity(userId: number, deviceId: string): void {
    const sessionKey = `reading_session:${userId}:${deviceId}`;
    const session = this.activeSessions.get(sessionKey);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  // 广播消息到用户的所有设备
  private async broadcastToUserDevices(
    userId: number,
    event: string,
    data: any,
    excludeDeviceId?: string,
  ): Promise<void> {
    try {
      // 通过NotificationGateway发送到用户房间
      await this.notificationGateway.sendNotificationToUser(userId.toString(), {
        type: event,
        data: {
          ...data,
          excludeDeviceId,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to broadcast to user devices:', error);
    }
  }

  // 更新数据库中的阅读进度
  private async updateReadingProgressInDB(position: ReadingPosition): Promise<void> {
    await this.prisma.userBookProgress.upsert({
      where: {
        userId_bookId: {
          userId: position.userId,
          bookId: position.bookId,
        },
      },
      update: {
        currentPage: position.currentPage,
        progress: position.progress,
        lastReadAt: position.lastReadAt,
      },
      create: {
        userId: position.userId,
        bookId: position.bookId,
        currentPage: position.currentPage || 1,
        progress: position.progress,
        lastReadAt: position.lastReadAt,
      },
    });
  }

  // 保存书签到数据库 - 暂时注释，等待bookmark表创建
  // private async saveBookmarkToDB(bookmark: BookmarkData): Promise<any> {
  //   return await this.prisma.bookmark.create({
  //     data: {
  //       userId: bookmark.userId,
  //       bookId: bookmark.bookId,
  //       chapterId: bookmark.chapterId,
  //       position: bookmark.position,
  //       note: bookmark.note,
  //       createdAt: new Date(),
  //     },
  //   });
  // }

  // 事件监听器
  @OnEvent('reading.progress.updated')
  async handleReadingProgressUpdated(event: ReadingPosition): Promise<void> {
    await this.syncReadingProgress(event);
  }

  @OnEvent('bookmark.created')
  async handleBookmarkCreated(event: BookmarkData): Promise<void> {
    await this.syncBookmark(event);
  }

  @OnEvent('device.session.started')
  async handleDeviceSessionStarted(event: ReadingSession): Promise<void> {
    await this.registerDeviceSession(event);
  }

  @OnEvent('device.session.ended')
  async handleDeviceSessionEnded(event: { userId: number; deviceId: string }): Promise<void> {
    await this.unregisterDeviceSession(event.userId, event.deviceId);
  }

  // 清理过期会话
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionKey, session] of this.activeSessions) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      const isExpired = timeSinceLastActivity > 30 * 60 * 1000; // 30分钟无活动

      if (isExpired) {
        expiredSessions.push(sessionKey);
        await this.unregisterDeviceSession(session.userId, session.deviceId);
      }
    }

    if (expiredSessions.length > 0) {
      this.logger.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  // 获取统计信息
  getStats() {
    return {
      activeSessions: this.activeSessions.size,
      activeUsers: this.userDevices.size,
      totalDevices: Array.from(this.userDevices.values()).reduce(
        (total, devices) => total + devices.size,
        0,
      ),
    };
  }
}
