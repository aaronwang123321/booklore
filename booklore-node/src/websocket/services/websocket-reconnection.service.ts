import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Socket } from 'socket.io';

export interface ReconnectionConfig {
  maxRetries: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  heartbeatInterval: number; // milliseconds
  connectionTimeout: number; // milliseconds
}

export interface ConnectionState {
  socketId: string;
  userId: number;
  isConnected: boolean;
  lastHeartbeat: Date;
  reconnectAttempts: number;
  lastReconnectAt?: Date;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'critical';
  latency: number; // milliseconds
  packetLoss: number; // percentage
}

export interface ReconnectionAttempt {
  socketId: string;
  userId: number;
  attemptNumber: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  latency?: number;
}

@Injectable()
export class WebSocketReconnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketReconnectionService.name);
  private readonly connectionStates = new Map<string, ConnectionState>();
  private readonly reconnectionQueue = new Map<string, NodeJS.Timeout>();
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly reconnectionHistory = new Map<string, ReconnectionAttempt[]>();

  private readonly config: ReconnectionConfig = {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    heartbeatInterval: 30000,
    connectionTimeout: 10000,
  };

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit() {
    this.logger.log('WebSocket Reconnection Service initialized');
    this.startConnectionMonitoring();
  }

  onModuleDestroy() {
    this.stopConnectionMonitoring();
    this.clearAllTimers();
  }

  // 注册连接状态监控
  registerConnection(socket: Socket, userId: number): void {
    const connectionState: ConnectionState = {
      socketId: socket.id,
      userId,
      isConnected: true,
      lastHeartbeat: new Date(),
      reconnectAttempts: 0,
      connectionQuality: 'excellent',
      latency: 0,
      packetLoss: 0,
    };

    this.connectionStates.set(socket.id, connectionState);
    this.setupHeartbeat(socket);
    this.setupConnectionMonitoring(socket);

    this.logger.log(`Connection registered: ${socket.id} for user ${userId}`);
  }

  // 注销连接
  unregisterConnection(socketId: string): void {
    this.connectionStates.delete(socketId);
    this.clearTimers(socketId);
    this.logger.log(`Connection unregistered: ${socketId}`);
  }

  // 处理连接断开
  handleDisconnection(socketId: string, reason: string): void {
    const state = this.connectionStates.get(socketId);
    if (!state) return;

    state.isConnected = false;
    this.logger.warn(`Connection lost: ${socketId}, reason: ${reason}`);

    // 根据断开原因决定是否尝试重连
    if (this.shouldAttemptReconnection(reason)) {
      this.scheduleReconnection(state);
    }

    // 发送连接状态事件
    this.eventEmitter.emit('websocket.connection.lost', {
      socketId,
      userId: state.userId,
      reason,
      timestamp: new Date(),
    });
  }

  // 处理重连成功
  handleReconnectionSuccess(oldSocketId: string, newSocket: Socket): void {
    const state = this.connectionStates.get(oldSocketId);
    if (!state) return;

    // 更新连接状态
    state.socketId = newSocket.id;
    state.isConnected = true;
    state.lastHeartbeat = new Date();
    state.reconnectAttempts = 0;
    state.lastReconnectAt = new Date();

    // 移除旧的连接状态，添加新的
    this.connectionStates.delete(oldSocketId);
    this.connectionStates.set(newSocket.id, state);

    // 重新设置心跳和监控
    this.setupHeartbeat(newSocket);
    this.setupConnectionMonitoring(newSocket);

    // 记录重连成功
    this.recordReconnectionAttempt(state.userId, {
      socketId: newSocket.id,
      userId: state.userId,
      attemptNumber: state.reconnectAttempts + 1,
      timestamp: new Date(),
      success: true,
    });

    this.logger.log(`Reconnection successful: ${oldSocketId} -> ${newSocket.id}`);

    // 发送重连成功事件
    this.eventEmitter.emit('websocket.reconnection.success', {
      oldSocketId,
      newSocketId: newSocket.id,
      userId: state.userId,
      timestamp: new Date(),
    });
  }

  // 设置心跳检测
  private setupHeartbeat(socket: Socket): void {
    const heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        const startTime = Date.now();

        socket.emit('ping', { timestamp: startTime });

        // 设置超时检测
        const timeoutTimer = setTimeout(() => {
          this.handleHeartbeatTimeout(socket.id);
        }, this.config.connectionTimeout);

        // 监听pong响应
        socket.once('pong', _data => {
          clearTimeout(timeoutTimer);
          const latency = Date.now() - startTime;
          this.updateConnectionMetrics(socket.id, latency);
        });
      } else {
        clearInterval(heartbeatTimer);
      }
    }, this.config.heartbeatInterval);

    this.heartbeatTimers.set(socket.id, heartbeatTimer);
  }

  // 设置连接监控
  private setupConnectionMonitoring(socket: Socket): void {
    socket.on('disconnect', reason => {
      this.handleDisconnection(socket.id, reason);
    });

    socket.on('error', error => {
      this.logger.error(`Socket error for ${socket.id}:`, error);
      this.updateConnectionQuality(socket.id, 'poor');
    });

    socket.on('connect_error', error => {
      this.logger.error(`Connection error for ${socket.id}:`, error);
      this.updateConnectionQuality(socket.id, 'critical');
    });
  }

  // 处理心跳超时
  private handleHeartbeatTimeout(socketId: string): void {
    const state = this.connectionStates.get(socketId);
    if (!state) return;

    this.logger.warn(`Heartbeat timeout for connection: ${socketId}`);
    this.updateConnectionQuality(socketId, 'critical');

    // 可能需要强制断开连接
    this.eventEmitter.emit('websocket.heartbeat.timeout', {
      socketId,
      userId: state.userId,
      timestamp: new Date(),
    });
  }

  // 更新连接指标
  private updateConnectionMetrics(socketId: string, latency: number): void {
    const state = this.connectionStates.get(socketId);
    if (!state) return;

    state.lastHeartbeat = new Date();
    state.latency = latency;

    // 根据延迟更新连接质量
    if (latency < 100) {
      state.connectionQuality = 'excellent';
    } else if (latency < 300) {
      state.connectionQuality = 'good';
    } else if (latency < 1000) {
      state.connectionQuality = 'poor';
    } else {
      state.connectionQuality = 'critical';
    }
  }

  // 更新连接质量
  private updateConnectionQuality(
    socketId: string,
    quality: 'excellent' | 'good' | 'poor' | 'critical',
  ): void {
    const state = this.connectionStates.get(socketId);
    if (state) {
      state.connectionQuality = quality;
    }
  }

  // 判断是否应该尝试重连
  private shouldAttemptReconnection(reason: string): boolean {
    const noReconnectReasons = [
      'client namespace disconnect',
      'server namespace disconnect',
      'client disconnect',
      'authentication failed',
    ];

    return !noReconnectReasons.includes(reason);
  }

  // 安排重连
  private scheduleReconnection(state: ConnectionState): void {
    if (state.reconnectAttempts >= this.config.maxRetries) {
      this.logger.error(`Max reconnection attempts reached for user ${state.userId}, giving up`);

      this.eventEmitter.emit('websocket.reconnection.failed', {
        socketId: state.socketId,
        userId: state.userId,
        attempts: state.reconnectAttempts,
        timestamp: new Date(),
      });

      return;
    }

    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, state.reconnectAttempts),
      this.config.maxDelay,
    );

    const timer = setTimeout(() => {
      this.attemptReconnection(state);
    }, delay);

    this.reconnectionQueue.set(state.socketId, timer);

    this.logger.log(
      `Scheduled reconnection for ${state.socketId} in ${delay}ms (attempt ${state.reconnectAttempts + 1}/${this.config.maxRetries})`,
    );
  }

  // 尝试重连
  private async attemptReconnection(state: ConnectionState): Promise<void> {
    state.reconnectAttempts++;

    this.logger.log(
      `Attempting reconnection for user ${state.userId} (attempt ${state.reconnectAttempts}/${this.config.maxRetries})`,
    );

    try {
      // 发送重连事件，让客户端处理重连逻辑
      this.eventEmitter.emit('websocket.reconnection.attempt', {
        socketId: state.socketId,
        userId: state.userId,
        attemptNumber: state.reconnectAttempts,
        timestamp: new Date(),
      });

      // 记录重连尝试
      this.recordReconnectionAttempt(state.userId, {
        socketId: state.socketId,
        userId: state.userId,
        attemptNumber: state.reconnectAttempts,
        timestamp: new Date(),
        success: false, // 暂时标记为失败，成功时会更新
      });
    } catch (error: any) {
      this.logger.error(`Reconnection attempt failed for ${state.socketId}:`, error);

      // 记录失败的重连尝试
      this.recordReconnectionAttempt(state.userId, {
        socketId: state.socketId,
        userId: state.userId,
        attemptNumber: state.reconnectAttempts,
        timestamp: new Date(),
        success: false,
        error: error.message,
      });

      // 安排下次重连
      this.scheduleReconnection(state);
    }
  }

  // 记录重连尝试
  private recordReconnectionAttempt(userId: number, attempt: ReconnectionAttempt): void {
    if (!this.reconnectionHistory.has(userId.toString())) {
      this.reconnectionHistory.set(userId.toString(), []);
    }

    const history = this.reconnectionHistory.get(userId.toString())!;
    history.push(attempt);

    // 保持历史记录在合理范围内
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  // 清理定时器
  private clearTimers(socketId: string): void {
    const heartbeatTimer = this.heartbeatTimers.get(socketId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      this.heartbeatTimers.delete(socketId);
    }

    const reconnectionTimer = this.reconnectionQueue.get(socketId);
    if (reconnectionTimer) {
      clearTimeout(reconnectionTimer);
      this.reconnectionQueue.delete(socketId);
    }
  }

  private clearAllTimers(): void {
    this.heartbeatTimers.forEach(timer => clearInterval(timer));
    this.reconnectionQueue.forEach(timer => clearTimeout(timer));
    this.heartbeatTimers.clear();
    this.reconnectionQueue.clear();
  }

  // 连接监控定时任务
  @Cron(CronExpression.EVERY_MINUTE)
  private startConnectionMonitoring(): void {
    // 检查所有连接的健康状态
    this.connectionStates.forEach((state, socketId) => {
      const timeSinceLastHeartbeat = Date.now() - state.lastHeartbeat.getTime();

      if (timeSinceLastHeartbeat > this.config.heartbeatInterval * 2) {
        this.logger.warn(
          `Connection ${socketId} appears stale, last heartbeat: ${state.lastHeartbeat}`,
        );
        this.updateConnectionQuality(socketId, 'critical');
      }
    });
  }

  private stopConnectionMonitoring(): void {
    // 停止监控逻辑会在模块销毁时自动处理
  }

  // 获取连接统计信息
  getConnectionStats() {
    const stats = {
      totalConnections: this.connectionStates.size,
      connectedCount: 0,
      disconnectedCount: 0,
      qualityDistribution: {
        excellent: 0,
        good: 0,
        poor: 0,
        critical: 0,
      },
      averageLatency: 0,
      reconnectionAttempts: 0,
    };

    let totalLatency = 0;
    let latencyCount = 0;

    this.connectionStates.forEach(state => {
      if (state.isConnected) {
        stats.connectedCount++;
      } else {
        stats.disconnectedCount++;
      }

      stats.qualityDistribution[state.connectionQuality]++;
      stats.reconnectionAttempts += state.reconnectAttempts;

      if (state.latency > 0) {
        totalLatency += state.latency;
        latencyCount++;
      }
    });

    if (latencyCount > 0) {
      stats.averageLatency = Math.round(totalLatency / latencyCount);
    }

    return stats;
  }

  // 获取用户重连历史
  getUserReconnectionHistory(userId: number): ReconnectionAttempt[] {
    return this.reconnectionHistory.get(userId.toString()) || [];
  }

  // 获取连接状态
  getConnectionState(socketId: string): ConnectionState | undefined {
    return this.connectionStates.get(socketId);
  }

  // 强制重连
  forceReconnection(socketId: string): void {
    const state = this.connectionStates.get(socketId);
    if (state) {
      state.reconnectAttempts = 0; // 重置重连计数
      this.scheduleReconnection(state);
    }
  }
}
