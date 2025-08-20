import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { NotificationGateway } from '../../websocket/gateways/notification.gateway';
import { PaymentRetryService } from '../../subscription/services/payment-retry.service';

@Injectable()
export class WebSocketNotificationService implements OnModuleInit {
  private readonly logger = new Logger(WebSocketNotificationService.name);
  private notificationGateway: NotificationGateway;
  private paymentRetryService: PaymentRetryService;

  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    try {
      // Get references to the gateways and services
      this.notificationGateway = this.moduleRef.get(NotificationGateway, { strict: false });
      this.paymentRetryService = this.moduleRef.get(PaymentRetryService, { strict: false });

      // Set up the gateway reference in payment retry service
      if (this.paymentRetryService && this.notificationGateway) {
        this.paymentRetryService.setNotificationGateway(this.notificationGateway);
        this.logger.log('WebSocket notification integration initialized successfully');
      }
    } catch (error) {
      this.logger.warn('Failed to initialize WebSocket notification integration:', error.message);
    }
  }

  /**
   * Send payment success notification via WebSocket
   */
  async sendPaymentSuccessNotification(
    userId: string,
    data: {
      planName: string;
      amount: number;
      currency: string;
      nextBillingDate?: Date;
    },
  ) {
    if (this.notificationGateway) {
      await this.notificationGateway.sendPaymentNotification(userId, 'success', data);
    }
  }

  /**
   * Send trial ending notification via WebSocket
   */
  async sendTrialEndingNotification(
    userId: string,
    data: {
      trialEndDate: Date;
      daysRemaining: number;
    },
  ) {
    if (this.notificationGateway) {
      await this.notificationGateway.sendTrialEndingNotification(userId, data);
    }
  }

  /**
   * Send payment failure notification via WebSocket
   */
  async sendPaymentFailureNotification(
    userId: string,
    data: {
      planName: string;
      amount: number;
      currency: string;
      failureReason?: string;
      isLastAttempt?: boolean;
    },
  ) {
    if (this.notificationGateway) {
      await this.notificationGateway.sendPaymentNotification(userId, 'failed', data);
    }
  }

  /**
   * Send subscription renewal notification via WebSocket
   */
  async sendSubscriptionRenewalNotification(
    userId: string,
    data: {
      planName: string;
      amount: number;
      currency: string;
      nextBillingDate: Date;
    },
  ) {
    if (this.notificationGateway) {
      await this.notificationGateway.sendSubscriptionNotification(userId, 'renewed', data);
    }
  }

  /**
   * Send subscription expiration notification via WebSocket
   */
  async sendSubscriptionExpirationNotification(
    userId: string,
    data: {
      planName: string;
      expiredAt: Date;
    },
  ) {
    if (this.notificationGateway) {
      await this.notificationGateway.sendSubscriptionNotification(userId, 'expired', data);
    }
  }

  /**
   * Send subscription plan change notification via WebSocket
   */
  async sendSubscriptionChangeNotification(
    userId: string,
    data: {
      oldPlanName: string;
      newPlanName: string;
      effectiveDate: Date;
    },
  ) {
    if (this.notificationGateway) {
      await this.notificationGateway.sendSubscriptionNotification(userId, 'changed', data);
    }
  }

  /**
   * Broadcast system announcement to all connected users
   */
  async broadcastSystemAnnouncement(data: {
    title: string;
    message: string;
    type: 'info' | 'warning' | 'maintenance';
    actionUrl?: string;
  }) {
    if (this.notificationGateway) {
      await this.notificationGateway.broadcastNotification({
        type: 'system_announcement',
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.notificationGateway ? this.notificationGateway.getConnectedUsersCount() : 0;
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.notificationGateway ? this.notificationGateway.isUserOnline(userId) : false;
  }

  /**
   * Get list of online users
   */
  getOnlineUsers(): string[] {
    return this.notificationGateway ? this.notificationGateway.getOnlineUsers() : [];
  }

  /**
   * Get WebSocket connection statistics
   */
  getConnectionStats() {
    if (!this.notificationGateway) {
      return {
        connectedUsers: 0,
        totalConnections: 0,
        isAvailable: false,
      };
    }

    return {
      connectedUsers: this.notificationGateway.getConnectedUsersCount(),
      totalConnections: this.notificationGateway.getTotalConnectionsCount(),
      isAvailable: true,
    };
  }
}
