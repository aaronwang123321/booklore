import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Socket } from 'socket.io';

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  peakConnections: number;
  averageConnectionDuration: number;
  messagesPerSecond: number;
  errorRate: number;
  lastResetTime: Date;
}

export interface MessageQueueItem {
  id: string;
  userId: number;
  socketId: string;
  message: any;
  priority: 'high' | 'medium' | 'low';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
  lastAttemptAt?: Date;
}

export interface ConnectionPoolConfig {
  maxConnectionsPerUser: number;
  maxTotalConnections: number;
  connectionTimeout: number;
  heartbeatInterval: number;
  messageQueueSize: number;
  retryAttempts: number;
  retryDelay: number;
}

@Injectable()
export class WebSocketPerformanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketPerformanceService.name);

  // 连接池管理
  private readonly connectionPool = new Map<string, Socket>(); // socketId -> Socket
  private readonly userConnections = new Map<number, Set<string>>(); // userId -> Set<socketId>
  private readonly connectionMetrics = new Map<
    string,
    {
      connectedAt: Date;
      lastActivity: Date;
      messageCount: number;
      errorCount: number;
    }
  >();

  // 消息队列
  private readonly messageQueue = new Map<string, MessageQueueItem>(); // messageId -> MessageQueueItem
  private readonly priorityQueues = {
    high: [] as MessageQueueItem[],
    medium: [] as MessageQueueItem[],
    low: [] as MessageQueueItem[],
  };

  // 性能指标
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    peakConnections: 0,
    averageConnectionDuration: 0,
    messagesPerSecond: 0,
    errorRate: 0,
    lastResetTime: new Date(),
  };

  // 配置
  private readonly config: ConnectionPoolConfig = {
    maxConnectionsPerUser: 5,
    maxTotalConnections: 10000,
    connectionTimeout: 30000, // 30秒
    heartbeatInterval: 25000, // 25秒
    messageQueueSize: 1000,
    retryAttempts: 3,
    retryDelay: 1000, // 1秒
  };

  // 消息统计
  private messageStats = {
    sent: 0,
    failed: 0,
    queued: 0,
    lastSecondMessages: 0,
    lastSecondTime: Date.now(),
  };

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    this.logger.log('WebSocket Performance Service initialized');
    this.startPerformanceMonitoring();
  }

  async onModuleDestroy() {
    this.logger.log('WebSocket Performance Service destroyed');
    this.stopPerformanceMonitoring();
  }

  // 连接管理
  async addConnection(socket: Socket, userId: number): Promise<boolean> {
    const socketId = socket.id;

    // 检查连接限制
    if (!this.canAcceptConnection(userId)) {
      this.logger.warn(`Connection rejected for user ${userId}: limits exceeded`);
      return false;
    }

    // 添加到连接池
    this.connectionPool.set(socketId, socket);

    // 更新用户连接映射
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socketId);

    // 记录连接指标
    this.connectionMetrics.set(socketId, {
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      errorCount: 0,
    });

    // 更新统计
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    this.metrics.peakConnections = Math.max(
      this.metrics.peakConnections,
      this.metrics.activeConnections,
    );

    // 设置心跳检测
    this.setupHeartbeat(socket);

    this.logger.log(`Connection added: ${socketId} for user ${userId}`);
    return true;
  }

  async removeConnection(socketId: string, userId?: number): Promise<void> {
    const socket = this.connectionPool.get(socketId);
    if (!socket) {
      return;
    }

    // 从连接池移除
    this.connectionPool.delete(socketId);

    // 从用户连接映射移除
    if (userId) {
      const userSockets = this.userConnections.get(userId);
      if (userSockets) {
        userSockets.delete(socketId);
        if (userSockets.size === 0) {
          this.userConnections.delete(userId);
        }
      }
    }

    // 计算连接持续时间
    const connectionMetric = this.connectionMetrics.get(socketId);
    if (connectionMetric) {
      const duration = Date.now() - connectionMetric.connectedAt.getTime();
      this.updateAverageConnectionDuration(duration);
      this.connectionMetrics.delete(socketId);
    }

    // 更新统计
    this.metrics.activeConnections--;

    // 清理该连接的待发送消息
    this.cleanupSocketMessages(socketId);

    this.logger.log(`Connection removed: ${socketId}`);
  }

  // 消息队列管理
  async queueMessage(
    userId: number,
    socketId: string,
    message: any,
    priority: 'high' | 'medium' | 'low' = 'medium',
  ): Promise<string> {
    const messageId = `${socketId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const queueItem: MessageQueueItem = {
      id: messageId,
      userId,
      socketId,
      message,
      priority,
      attempts: 0,
      maxAttempts: this.config.retryAttempts,
      createdAt: new Date(),
    };

    // 检查队列大小限制
    if (this.messageQueue.size >= this.config.messageQueueSize) {
      // 移除最旧的低优先级消息
      this.evictOldMessages();
    }

    this.messageQueue.set(messageId, queueItem);
    this.priorityQueues[priority].push(queueItem);
    this.messageStats.queued++;

    // 立即尝试发送
    await this.processMessage(queueItem);

    return messageId;
  }

  async processMessage(queueItem: MessageQueueItem): Promise<boolean> {
    const socket = this.connectionPool.get(queueItem.socketId);

    if (!socket || !socket.connected) {
      // 连接不存在或已断开，延迟重试
      return this.scheduleRetry(queueItem);
    }

    try {
      queueItem.attempts++;
      queueItem.lastAttemptAt = new Date();

      // 发送消息
      socket.emit('message', queueItem.message);

      // 更新统计
      this.updateConnectionActivity(queueItem.socketId);
      this.messageStats.sent++;
      this.updateMessagesPerSecond();

      // 从队列中移除
      this.removeFromQueue(queueItem);

      return true;
    } catch (error) {
      this.logger.error(`Failed to send message ${queueItem.id}: ${error.message}`);

      // 更新错误统计
      this.updateConnectionError(queueItem.socketId);
      this.messageStats.failed++;

      // 重试或放弃
      if (queueItem.attempts < queueItem.maxAttempts) {
        return this.scheduleRetry(queueItem);
      } else {
        this.removeFromQueue(queueItem);
        this.logger.warn(`Message ${queueItem.id} exceeded max attempts, discarding`);
        return false;
      }
    }
  }

  // 批量发送消息
  async broadcastMessage(
    userIds: number[],
    message: any,
    priority: 'high' | 'medium' | 'low' = 'medium',
  ): Promise<{ sent: number; queued: number; failed: number }> {
    const results = { sent: 0, queued: 0, failed: 0 };

    for (const userId of userIds) {
      const userSockets = this.userConnections.get(userId);
      if (userSockets) {
        for (const socketId of userSockets) {
          try {
            await this.queueMessage(userId, socketId, message, priority);
            results.queued++;
          } catch (error) {
            results.failed++;
          }
        }
      }
    }

    return results;
  }

  // 性能监控
  private startPerformanceMonitoring(): void {
    // 每秒更新消息速率
    setInterval(() => {
      this.updateMessagesPerSecond();
    }, 1000);

    // 每分钟更新错误率
    setInterval(() => {
      this.updateErrorRate();
    }, 60000);
  }

  private stopPerformanceMonitoring(): void {
    // 清理定时器会在模块销毁时自动处理
  }

  private updateMessagesPerSecond(): void {
    const now = Date.now();
    const timeDiff = now - this.messageStats.lastSecondTime;

    if (timeDiff >= 1000) {
      this.metrics.messagesPerSecond = this.messageStats.lastSecondMessages;
      this.messageStats.lastSecondMessages = 0;
      this.messageStats.lastSecondTime = now;
    } else {
      this.messageStats.lastSecondMessages++;
    }
  }

  private updateErrorRate(): void {
    const totalMessages = this.messageStats.sent + this.messageStats.failed;
    this.metrics.errorRate = totalMessages > 0 ? this.messageStats.failed / totalMessages : 0;
  }

  private updateAverageConnectionDuration(duration: number): void {
    const currentAvg = this.metrics.averageConnectionDuration;
    const totalConnections = this.metrics.totalConnections;

    this.metrics.averageConnectionDuration =
      (currentAvg * (totalConnections - 1) + duration) / totalConnections;
  }

  // 辅助方法
  private canAcceptConnection(userId: number): boolean {
    // 检查总连接数限制
    if (this.metrics.activeConnections >= this.config.maxTotalConnections) {
      return false;
    }

    // 检查用户连接数限制
    const userSockets = this.userConnections.get(userId);
    if (userSockets && userSockets.size >= this.config.maxConnectionsPerUser) {
      return false;
    }

    return true;
  }

  private setupHeartbeat(socket: Socket): void {
    const heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping');
      } else {
        clearInterval(heartbeatTimer);
      }
    }, this.config.heartbeatInterval);

    socket.on('disconnect', () => {
      clearInterval(heartbeatTimer);
    });
  }

  private scheduleRetry(queueItem: MessageQueueItem): boolean {
    const delay = this.config.retryDelay * Math.pow(2, queueItem.attempts - 1); // 指数退避
    queueItem.scheduledAt = new Date(Date.now() + delay);

    setTimeout(() => {
      this.processMessage(queueItem);
    }, delay);

    return false;
  }

  private removeFromQueue(queueItem: MessageQueueItem): void {
    this.messageQueue.delete(queueItem.id);

    const priorityQueue = this.priorityQueues[queueItem.priority];
    const index = priorityQueue.findIndex(item => item.id === queueItem.id);
    if (index !== -1) {
      priorityQueue.splice(index, 1);
    }
  }

  private evictOldMessages(): void {
    // 优先移除低优先级的旧消息
    const lowPriorityQueue = this.priorityQueues.low;
    if (lowPriorityQueue.length > 0) {
      const oldestMessage = lowPriorityQueue.shift()!;
      this.messageQueue.delete(oldestMessage.id);
      return;
    }

    // 然后移除中等优先级的旧消息
    const mediumPriorityQueue = this.priorityQueues.medium;
    if (mediumPriorityQueue.length > 0) {
      const oldestMessage = mediumPriorityQueue.shift()!;
      this.messageQueue.delete(oldestMessage.id);
      return;
    }
  }

  private cleanupSocketMessages(socketId: string): void {
    const messagesToRemove: string[] = [];

    for (const [messageId, queueItem] of this.messageQueue) {
      if (queueItem.socketId === socketId) {
        messagesToRemove.push(messageId);
      }
    }

    for (const messageId of messagesToRemove) {
      const queueItem = this.messageQueue.get(messageId)!;
      this.removeFromQueue(queueItem);
    }
  }

  private updateConnectionActivity(socketId: string): void {
    const metric = this.connectionMetrics.get(socketId);
    if (metric) {
      metric.lastActivity = new Date();
      metric.messageCount++;
    }
  }

  private updateConnectionError(socketId: string): void {
    const metric = this.connectionMetrics.get(socketId);
    if (metric) {
      metric.errorCount++;
    }
  }

  // 定时任务
  @Cron(CronExpression.EVERY_MINUTE)
  async processQueuedMessages(): Promise<void> {
    const now = new Date();
    const messagesToProcess: MessageQueueItem[] = [];

    // 收集需要重试的消息
    for (const queueItem of this.messageQueue.values()) {
      if (queueItem.scheduledAt && queueItem.scheduledAt <= now) {
        messagesToProcess.push(queueItem);
      }
    }

    // 按优先级处理消息
    messagesToProcess.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    for (const queueItem of messagesToProcess) {
      await this.processMessage(queueItem);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleConnections(): Promise<void> {
    const now = Date.now();
    const staleConnections: string[] = [];

    for (const [socketId, metric] of this.connectionMetrics) {
      const timeSinceActivity = now - metric.lastActivity.getTime();

      if (timeSinceActivity > this.config.connectionTimeout) {
        staleConnections.push(socketId);
      }
    }

    for (const socketId of staleConnections) {
      const socket = this.connectionPool.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
      await this.removeConnection(socketId);
    }

    if (staleConnections.length > 0) {
      this.logger.log(`Cleaned up ${staleConnections.length} stale connections`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async resetMetrics(): Promise<void> {
    this.messageStats.sent = 0;
    this.messageStats.failed = 0;
    this.metrics.lastResetTime = new Date();

    this.logger.log('Performance metrics reset');
  }

  // 公共API
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  getConnectionCount(): number {
    return this.metrics.activeConnections;
  }

  getUserConnectionCount(userId: number): number {
    const userSockets = this.userConnections.get(userId);
    return userSockets ? userSockets.size : 0;
  }

  getQueueStats() {
    return {
      total: this.messageQueue.size,
      high: this.priorityQueues.high.length,
      medium: this.priorityQueues.medium.length,
      low: this.priorityQueues.low.length,
      messageStats: { ...this.messageStats },
    };
  }

  isUserOnline(userId: number): boolean {
    const userSockets = this.userConnections.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  getUserSockets(userId: number): Socket[] {
    const userSockets = this.userConnections.get(userId);
    if (!userSockets) {
      return [];
    }

    return Array.from(userSockets)
      .map(socketId => this.connectionPool.get(socketId))
      .filter(socket => socket !== undefined) as Socket[];
  }

  // 配置管理
  updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('WebSocket performance config updated');
  }

  getConfig(): ConnectionPoolConfig {
    return { ...this.config };
  }
}
