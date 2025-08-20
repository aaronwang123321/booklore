import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from './notification.service';
import { PaymentRetryStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface CreatePaymentRetryData {
  invoiceId: string;
  userId: number;
  errorMessage?: string;
  nextRetryAt?: Date;
}

@Injectable()
export class PaymentRetryService {
  private readonly logger = new Logger(PaymentRetryService.name);
  private readonly maxRetryAttempts = 3;
  private readonly retryIntervals = [1, 3, 7]; // days

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 创建支付重试记录
   */
  async createPaymentRetry(data: CreatePaymentRetryData) {
    try {
      // 检查是否已存在重试记录
      const existingRetry = await this.prisma.paymentRetryAttempt.findFirst({
        where: {
          invoiceId: data.invoiceId,
          status: PaymentRetryStatus.PENDING,
        },
        orderBy: {
          attemptNumber: 'desc',
        },
      });

      let attemptNumber = 1;
      if (existingRetry) {
        attemptNumber = existingRetry.attemptNumber + 1;
      }

      // 如果超过最大重试次数，标记为失败
      if (attemptNumber > this.maxRetryAttempts) {
        await this.markAllRetriesAsFailed(data.invoiceId);
        await this.notificationService.createPaymentFailedNotification(
          data.userId,
          'Subscription Plan', // planName
          0, // amount will be fetched from invoice
          'USD',
        );
        return null;
      }

      // 计算下次重试时间
      const nextRetryAt = data.nextRetryAt || this.calculateNextRetryTime(attemptNumber);

      const retryAttempt = await this.prisma.paymentRetryAttempt.create({
        data: {
          invoiceId: data.invoiceId,
          userId: data.userId,
          attemptNumber,
          status: PaymentRetryStatus.PENDING,
          errorMessage: data.errorMessage,
          nextRetryAt,
        },
      });

      this.logger.log(
        `Created payment retry attempt ${attemptNumber} for invoice ${data.invoiceId}`,
      );

      return retryAttempt;
    } catch (error) {
      this.logger.error('Failed to create payment retry:', error);
      throw error;
    }
  }

  /**
   * 获取待重试的支付记录
   */
  async getPendingRetries() {
    try {
      const now = new Date();
      return await this.prisma.paymentRetryAttempt.findMany({
        where: {
          status: PaymentRetryStatus.PENDING,
          nextRetryAt: {
            lte: now,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: {
          nextRetryAt: 'asc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to get pending retries:', error);
      throw error;
    }
  }

  /**
   * 标记重试为成功
   */
  async markRetryAsSuccessful(retryId: string) {
    try {
      const updated = await this.prisma.paymentRetryAttempt.update({
        where: { id: retryId },
        data: {
          status: PaymentRetryStatus.SUCCESS,
        },
      });

      // 标记同一发票的其他待处理重试为取消
      await this.prisma.paymentRetryAttempt.updateMany({
        where: {
          invoiceId: updated.invoiceId,
          id: { not: retryId },
          status: PaymentRetryStatus.PENDING,
        },
        data: {
          status: PaymentRetryStatus.ABANDONED,
        },
      });

      this.logger.log(`Marked retry ${retryId} as successful`);
      return updated;
    } catch (error) {
      this.logger.error('Failed to mark retry as successful:', error);
      throw error;
    }
  }

  /**
   * 标记重试为失败
   */
  async markRetryAsFailed(retryId: string, errorMessage?: string) {
    try {
      const updated = await this.prisma.paymentRetryAttempt.update({
        where: { id: retryId },
        data: {
          status: PaymentRetryStatus.FAILED,
          errorMessage,
        },
      });

      this.logger.log(`Marked retry ${retryId} as failed`);
      return updated;
    } catch (error) {
      this.logger.error('Failed to mark retry as failed:', error);
      throw error;
    }
  }

  /**
   * 标记发票的所有重试为失败
   */
  async markAllRetriesAsFailed(invoiceId: string) {
    try {
      await this.prisma.paymentRetryAttempt.updateMany({
        where: {
          invoiceId,
          status: PaymentRetryStatus.PENDING,
        },
        data: {
          status: PaymentRetryStatus.FAILED,
        },
      });

      this.logger.log(`Marked all retries for invoice ${invoiceId} as failed`);
    } catch (error) {
      this.logger.error('Failed to mark all retries as failed:', error);
      throw error;
    }
  }

  /**
   * 获取用户的重试历史
   */
  async getUserRetryHistory(
    userId: number,
    options: {
      limit?: number;
      offset?: number;
      status?: PaymentRetryStatus;
    } = {},
  ) {
    try {
      const { limit = 20, offset = 0, status } = options;

      const where: any = { userId };
      if (status) {
        where.status = status;
      }

      return await this.prisma.paymentRetryAttempt.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      this.logger.error('Failed to get user retry history:', error);
      throw error;
    }
  }

  /**
   * 定时任务：处理待重试的支付
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processRetries() {
    this.logger.log('Starting payment retry processing...');

    try {
      const pendingRetries = await this.getPendingRetries();
      this.logger.log(`Found ${pendingRetries.length} pending retries`);

      for (const retry of pendingRetries) {
        try {
          // 这里应该调用实际的支付处理逻辑
          // 暂时模拟处理结果
          const success = await this.processPaymentRetry(retry);

          if (success) {
            await this.markRetryAsSuccessful(retry.id);
            await this.notificationService.createPaymentSuccessNotification(
              retry.userId,
              'Subscription Plan', // planName
              0, // amount will be fetched from invoice
              'USD',
            );
          } else {
            // 如果是最后一次重试，标记为失败
            if (retry.attemptNumber >= this.maxRetryAttempts) {
              await this.markRetryAsFailed(retry.id, '重试次数已达上限');
              await this.notificationService.createPaymentFailedNotification(
                retry.userId,
                'Subscription Plan', // planName
                0,
                'USD',
              );
            } else {
              // 创建下一次重试
              await this.createPaymentRetry({
                invoiceId: retry.invoiceId,
                userId: retry.userId,
                errorMessage: '重试失败',
              });
              await this.markRetryAsFailed(retry.id, '重试失败，已安排下次重试');
            }
          }
        } catch (error) {
          this.logger.error(`Failed to process retry ${retry.id}:`, error);
          await this.markRetryAsFailed(retry.id, error.message);
        }
      }

      this.logger.log('Payment retry processing completed');
    } catch (error) {
      this.logger.error('Failed to process payment retries:', error);
    }
  }

  /**
   * 计算下次重试时间
   */
  private calculateNextRetryTime(attemptNumber: number): Date {
    const days = this.retryIntervals[attemptNumber - 1] || 7;
    const nextRetry = new Date();
    nextRetry.setDate(nextRetry.getDate() + days);
    return nextRetry;
  }

  /**
   * 处理单个支付重试（需要集成实际的支付处理逻辑）
   */
  private async processPaymentRetry(retry: any): Promise<boolean> {
    // TODO: 集成实际的支付处理逻辑
    // 这里应该调用支付服务来重新处理支付
    // 返回 true 表示成功，false 表示失败

    this.logger.log(`Processing payment retry for invoice ${retry.invoiceId}`);

    // 模拟支付处理
    // 在实际实现中，这里应该调用 Stripe 或其他支付服务
    return Math.random() > 0.5; // 50% 成功率用于测试
  }

  /**
   * 清理过期的重试记录
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredRetries() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deleted = await this.prisma.paymentRetryAttempt.deleteMany({
        where: {
          createdAt: {
            lt: thirtyDaysAgo,
          },
          status: {
            in: [
              PaymentRetryStatus.SUCCESS,
              PaymentRetryStatus.FAILED,
              PaymentRetryStatus.ABANDONED,
            ],
          },
        },
      });

      this.logger.log(`Cleaned up ${deleted.count} expired retry records`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired retries:', error);
    }
  }
}
