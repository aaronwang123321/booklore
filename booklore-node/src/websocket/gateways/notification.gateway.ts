import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from '../../shared/services/notification.service';
import { NotificationType } from '@prisma/client';
import { WebSocketReconnectionService } from '../services/websocket-reconnection.service';
import { WebSocketRateLimitService } from '../services/websocket-rate-limit.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private jwtService: JwtService,
    private notificationService: NotificationService,
    private reconnectionService: WebSocketReconnectionService,
    private rateLimitService: WebSocketRateLimitService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake auth or query
      const token = client.handshake.auth?.token || client.handshake.query?.token;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.user = payload;

      // Add to connected users map
      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId).add(client.id);

      // Join user-specific room
      await client.join(`user:${client.userId}`);

      // Register connection for reconnection monitoring
      this.reconnectionService.registerConnection(client, parseInt(client.userId));

      this.logger.log(`User ${client.userId} connected with socket ${client.id}`);

      // Send initial unread count
      const unreadCount = await this.notificationService.getUnreadCount(parseInt(client.userId));
      client.emit('unread_count', { count: unreadCount });

      // Send recent notifications
      const recentNotifications = await this.notificationService.getUserNotifications(
        parseInt(client.userId),
        { limit: 10, unreadOnly: false },
      );
      client.emit('recent_notifications', recentNotifications);
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
        }
      }

      // Unregister connection from reconnection service
      this.reconnectionService.unregisterConnection(client.id);

      this.logger.log(`User ${client.userId} disconnected socket ${client.id}`);
    }
  }

  @SubscribeMessage('mark_notification_read')
  async handleMarkNotificationRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { notificationId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      // Check rate limit
      const rateLimitResult = await this.rateLimitService.checkRateLimit(
        client,
        'mark_notification_read',
        parseInt(client.userId),
      );

      if (!rateLimitResult.allowed) {
        this.logger.warn(`Rate limit exceeded for user ${client.userId} on mark_notification_read`);
        return { error: 'Rate limit exceeded', retryAfter: rateLimitResult.info?.msBeforeNext };
      }

      await this.notificationService.markAsRead(data.notificationId, parseInt(client.userId));

      // Send updated unread count
      const unreadCount = await this.notificationService.getUnreadCount(parseInt(client.userId));
      client.emit('unread_count', { count: unreadCount });

      // Record successful request
      this.rateLimitService.recordRequest(
        client,
        'mark_notification_read',
        true,
        parseInt(client.userId),
      );

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to mark notification as read:', error);

      // Record failed request
      this.rateLimitService.recordRequest(
        client,
        'mark_notification_read',
        false,
        parseInt(client.userId),
      );

      return { error: 'Failed to mark notification as read' };
    }
  }

  @SubscribeMessage('mark_all_notifications_read')
  async handleMarkAllNotificationsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { types?: NotificationType[] },
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      // Check rate limit
      const rateLimitResult = await this.rateLimitService.checkRateLimit(
        client,
        'mark_all_notifications_read',
        parseInt(client.userId),
      );

      if (!rateLimitResult.allowed) {
        this.logger.warn(
          `Rate limit exceeded for user ${client.userId} on mark_all_notifications_read`,
        );
        return { error: 'Rate limit exceeded', retryAfter: rateLimitResult.info?.msBeforeNext };
      }

      const markedCount = await this.notificationService.markAllAsRead(
        parseInt(client.userId),
        data.types,
      );

      // Send updated unread count
      const unreadCount = await this.notificationService.getUnreadCount(parseInt(client.userId));
      client.emit('unread_count', { count: unreadCount });

      // Record successful request
      this.rateLimitService.recordRequest(
        client,
        'mark_all_notifications_read',
        true,
        parseInt(client.userId),
      );

      return { success: true, markedCount };
    } catch (error) {
      this.logger.error('Failed to mark all notifications as read:', error);

      // Record failed request
      this.rateLimitService.recordRequest(
        client,
        'mark_all_notifications_read',
        false,
        parseInt(client.userId),
      );

      return { error: 'Failed to mark all notifications as read' };
    }
  }

  @SubscribeMessage('get_notifications')
  async handleGetNotifications(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      types?: NotificationType[];
    },
  ) {
    try {
      if (!client.userId) {
        return { error: 'Not authenticated' };
      }

      // Check rate limit
      const rateLimitResult = await this.rateLimitService.checkRateLimit(
        client,
        'get_notifications',
        parseInt(client.userId),
      );

      if (!rateLimitResult.allowed) {
        this.logger.warn(`Rate limit exceeded for user ${client.userId} on get_notifications`);
        return { error: 'Rate limit exceeded', retryAfter: rateLimitResult.info?.msBeforeNext };
      }

      const notifications = await this.notificationService.getUserNotifications(
        parseInt(client.userId),
        data,
      );

      // Record successful request
      this.rateLimitService.recordRequest(
        client,
        'get_notifications',
        true,
        parseInt(client.userId),
      );

      return { success: true, data: notifications };
    } catch (error) {
      this.logger.error('Failed to get notifications:', error);

      // Record failed request
      this.rateLimitService.recordRequest(
        client,
        'get_notifications',
        false,
        parseInt(client.userId),
      );

      return { error: 'Failed to get notifications' };
    }
  }

  // Method to send notification to specific user
  async sendNotificationToUser(userId: string, notification: any) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets && userSockets.size > 0) {
      this.server.to(`user:${userId}`).emit('new_notification', notification);

      // Also send updated unread count
      const unreadCount = await this.notificationService.getUnreadCount(parseInt(userId));
      this.server.to(`user:${userId}`).emit('unread_count', { count: unreadCount });

      this.logger.log(`Sent notification to user ${userId} on ${userSockets.size} socket(s)`);
      return true;
    }
    return false;
  }

  // Method to send notification to all connected users
  async broadcastNotification(notification: any) {
    this.server.emit('broadcast_notification', notification);
    this.logger.log('Broadcasted notification to all connected users');
  }

  // Method to send payment-related notifications
  async sendPaymentNotification(userId: string, type: 'success' | 'failed' | 'retry', data: any) {
    const notification = {
      type: `payment_${type}`,
      data,
      timestamp: new Date().toISOString(),
    };

    await this.sendNotificationToUser(userId, notification);
  }

  // Method to send subscription-related notifications
  async sendSubscriptionNotification(
    userId: string,
    type: 'renewed' | 'expired' | 'changed',
    data: any,
  ) {
    const notification = {
      type: `subscription_${type}`,
      data,
      timestamp: new Date().toISOString(),
    };

    await this.sendNotificationToUser(userId, notification);
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Get total socket connections count
  getTotalConnectionsCount(): number {
    let total = 0;
    this.connectedUsers.forEach(sockets => {
      total += sockets.size;
    });
    return total;
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  // Get online users list
  getOnlineUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  async sendTrialEndingNotification(
    userId: string,
    data: {
      trialEndDate: Date;
      daysRemaining: number;
    },
  ): Promise<void> {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets && userSockets.size > 0) {
      this.server.to(`user:${userId}`).emit('trial_ending', {
        type: 'trial_ending',
        data,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
