import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationType } from '@prisma/client';

// Re-export NotificationType for use in controllers
export { NotificationType };

export interface CreateNotificationData {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  data?: Record<string, any>;
  expiresAt?: Date;
}

export interface NotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  paymentNotifications: boolean;
  subscriptionNotifications: boolean;
  systemNotifications: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {}

  async createNotification(data: CreateNotificationData) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          actionUrl: data.actionUrl,
          actionText: data.actionText,
          data: data.data || {},
          expiresAt: data.expiresAt,
          isRead: false,
        },
      });

      this.logger.log(`Created notification ${notification.id} for user ${data.userId}`);
      return notification;
    } catch (error) {
      this.logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  async getUserNotifications(
    userId: number,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      types?: NotificationType[];
    } = {},
  ) {
    const { limit = 20, offset = 0, unreadOnly = false, types } = options;

    const where: any = {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    if (types && types.length > 0) {
      where.type = { in: types };
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      total,
      hasMore: offset + notifications.length < total,
    };
  }

  async markAsRead(notificationId: string, userId: number) {
    try {
      const notification = await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          isRead: true,
        },
      });

      if (notification.count === 0) {
        throw new Error('Notification not found or access denied');
      }

      this.logger.log(`Marked notification ${notificationId} as read for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  async markAllAsRead(userId: number, types?: NotificationType[]) {
    try {
      const where: any = {
        userId,
        isRead: false,
      };

      if (types && types.length > 0) {
        where.type = { in: types };
      }

      const result = await this.prisma.notification.updateMany({
        where,
        data: {
          isRead: true,
        },
      });

      this.logger.log(`Marked ${result.count} notifications as read for user ${userId}`);
      return result.count;
    } catch (error) {
      this.logger.error('Failed to mark all notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId: string, userId: number) {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (result.count === 0) {
        throw new Error('Notification not found or access denied');
      }

      this.logger.log(`Deleted notification ${notificationId} for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete notification:', error);
      throw error;
    }
  }

  async getUnreadCount(userId: number, types?: NotificationType[]) {
    try {
      const where: any = {
        userId,
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      };

      if (types && types.length > 0) {
        where.type = { in: types };
      }

      const count = await this.prisma.notification.count({ where });
      return count;
    } catch (error) {
      this.logger.error('Failed to get unread count:', error);
      return 0;
    }
  }

  async getUserPreferences(userId: number): Promise<NotificationPreferences> {
    try {
      const preferences = await this.prisma.notificationPreference.findUnique({
        where: { userId },
      });

      if (!preferences) {
        // Return default preferences
        return {
          emailNotifications: true,
          pushNotifications: true,
          paymentNotifications: true,
          subscriptionNotifications: true,
          systemNotifications: true,
        };
      }

      return {
        emailNotifications: preferences.emailNotifications,
        pushNotifications: preferences.pushNotifications,
        paymentNotifications: preferences.paymentNotifications,
        subscriptionNotifications: preferences.subscriptionNotifications,
        systemNotifications: preferences.systemNotifications,
      };
    } catch (error) {
      this.logger.error('Failed to get user notification preferences:', error);
      // Return default preferences on error
      return {
        emailNotifications: true,
        pushNotifications: true,
        paymentNotifications: true,
        subscriptionNotifications: true,
        systemNotifications: true,
      };
    }
  }

  async updateUserPreferences(userId: number, preferences: Partial<NotificationPreferences>) {
    try {
      const updated = await this.prisma.notificationPreference.upsert({
        where: { userId },
        update: preferences,
        create: {
          userId,
          emailNotifications: preferences.emailNotifications ?? true,
          pushNotifications: preferences.pushNotifications ?? true,
          paymentNotifications: preferences.paymentNotifications ?? true,
          subscriptionNotifications: preferences.subscriptionNotifications ?? true,
          systemNotifications: preferences.systemNotifications ?? true,
        },
      });

      this.logger.log(`Updated notification preferences for user ${userId}`);
      return updated;
    } catch (error) {
      this.logger.error('Failed to update notification preferences:', error);
      throw error;
    }
  }

  async cleanupExpiredNotifications() {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} expired notifications`);
      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired notifications:', error);
      return 0;
    }
  }

  // Helper methods for specific notification types
  async createPaymentFailedNotification(
    userId: number,
    planName: string,
    amount: number,
    currency: string,
    retryDate?: Date,
  ): Promise<void> {
    await this.createNotification({
      userId,
      type: NotificationType.PAYMENT_FAILED,
      title: '支付失败',
      message: `您的${planName}订阅支付失败（${amount / 100} ${currency.toUpperCase()}）${retryDate ? `，将在${retryDate.toLocaleDateString()}重试` : ''}`,
      data: {
        planName,
        amount,
        currency,
        retryDate: retryDate?.toISOString(),
      },
    });
  }

  async createPaymentSuccessNotification(
    userId: number,
    planName: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    await this.createNotification({
      userId,
      type: NotificationType.PAYMENT_SUCCESS,
      title: '支付成功',
      message: `您的${planName}订阅支付成功（${amount / 100} ${currency.toUpperCase()}），感谢您的支持！`,
      data: {
        planName,
        amount,
        currency,
      },
    });
  }

  async createTrialEndingNotification(userId: number, trialEndDate: Date): Promise<void> {
    const now = new Date();
    const daysRemaining = Math.ceil(
      (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    await this.createNotification({
      userId,
      type: NotificationType.TRIAL_ENDING,
      title: '试用期即将结束',
      message: `您的试用期将在${daysRemaining}天后结束（${trialEndDate.toLocaleDateString()}），请及时升级订阅以继续享受服务。`,
      actionUrl: '/subscription/upgrade',
      actionText: '立即升级',
      data: {
        trialEndDate: trialEndDate.toISOString(),
        daysRemaining,
      },
    });
  }

  async createSubscriptionExpiredNotification(userId: number, planName: string) {
    const title = '订阅已过期';
    const message = `您的 ${planName} 订阅已过期。请续费以继续享受服务。`;

    return this.createNotification({
      userId,
      type: NotificationType.SUBSCRIPTION_EXPIRED,
      title,
      message,
      actionUrl: '/dashboard/billing',
      actionText: '立即续费',
      data: {
        planName,
      },
    });
  }
}
