import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface RateLimitConfig {
  windowMs: number; // 时间窗口（毫秒）
  maxRequests: number; // 最大请求数
  skipSuccessfulRequests: boolean; // 是否跳过成功请求
  skipFailedRequests: boolean; // 是否跳过失败请求
  keyGenerator?: (socket: Socket) => string; // 自定义key生成器
  onLimitReached?: (socket: Socket, info: RateLimitInfo) => void; // 限制达到时的回调
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsInWindow: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInWindow: boolean;
}

export interface RateLimitRule {
  name: string;
  config: RateLimitConfig;
  events?: string[]; // 应用到的事件列表
}

export interface ClientRateLimit {
  socketId: string;
  userId?: number;
  requests: RequestRecord[];
  blocked: boolean;
  blockedUntil?: Date;
  totalRequests: number;
  violationCount: number;
  lastViolation?: Date;
}

export interface RequestRecord {
  timestamp: Date;
  event: string;
  success: boolean;
  ip?: string;
}

@Injectable()
export class WebSocketRateLimitService {
  private readonly logger = new Logger(WebSocketRateLimitService.name);
  private readonly clientLimits = new Map<string, ClientRateLimit>();
  private readonly rules = new Map<string, RateLimitRule>();
  private readonly cleanupInterval: NodeJS.Timeout;

  // 默认规则配置
  private readonly defaultRules: RateLimitRule[] = [
    {
      name: 'general',
      config: {
        windowMs: 60 * 1000, // 1分钟
        maxRequests: 100, // 每分钟最多100个请求
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
    },
    {
      name: 'notification',
      events: ['mark_notification_read', 'mark_all_notifications_read', 'get_notifications'],
      config: {
        windowMs: 60 * 1000, // 1分钟
        maxRequests: 50, // 通知相关操作限制更严格
        skipSuccessfulRequests: false,
        skipFailedRequests: true,
      },
    },
    {
      name: 'progress',
      events: ['join_library', 'leave_library', 'get_progress'],
      config: {
        windowMs: 30 * 1000, // 30秒
        maxRequests: 30, // 进度相关操作
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
    },
    {
      name: 'auth',
      events: ['authenticate', 'join_room', 'leave_room'],
      config: {
        windowMs: 5 * 60 * 1000, // 5分钟
        maxRequests: 10, // 认证相关操作限制最严格
        skipSuccessfulRequests: true,
        skipFailedRequests: false,
      },
    },
  ];

  constructor(private readonly eventEmitter: EventEmitter2) {
    // 初始化默认规则
    this.defaultRules.forEach(rule => {
      this.rules.set(rule.name, rule);
    });

    // 定期清理过期数据
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredData();
      },
      5 * 60 * 1000,
    ); // 每5分钟清理一次

    this.logger.log('WebSocket Rate Limit Service initialized');
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  // 检查请求是否被限制
  async checkRateLimit(
    socket: Socket,
    event: string,
    userId?: number,
  ): Promise<{ allowed: boolean; info?: RateLimitInfo; rule?: string }> {
    const clientKey = this.generateClientKey(socket, userId);
    const applicableRule = this.getApplicableRule(event);

    if (!applicableRule) {
      return { allowed: true };
    }

    const clientLimit = this.getOrCreateClientLimit(clientKey, socket, userId);

    // 检查是否被阻止
    if (clientLimit.blocked && clientLimit.blockedUntil && clientLimit.blockedUntil > new Date()) {
      const msBeforeNext = clientLimit.blockedUntil.getTime() - Date.now();
      return {
        allowed: false,
        info: {
          totalHits: clientLimit.totalRequests,
          totalHitsInWindow: this.getRequestsInWindow(clientLimit, applicableRule.config.windowMs),
          remainingPoints: 0,
          msBeforeNext,
          isFirstInWindow: false,
        },
        rule: applicableRule.name,
      };
    }

    // 计算当前窗口内的请求数
    const windowStart = new Date(Date.now() - applicableRule.config.windowMs);
    const requestsInWindow = clientLimit.requests.filter(
      req => req.timestamp >= windowStart,
    ).length;

    const isFirstInWindow = requestsInWindow === 0;
    const remainingPoints = Math.max(0, applicableRule.config.maxRequests - requestsInWindow);
    const allowed = requestsInWindow < applicableRule.config.maxRequests;

    const info: RateLimitInfo = {
      totalHits: clientLimit.totalRequests,
      totalHitsInWindow: requestsInWindow,
      remainingPoints,
      msBeforeNext: allowed
        ? 0
        : this.calculateResetTime(clientLimit, applicableRule.config.windowMs),
      isFirstInWindow,
    };

    if (!allowed) {
      await this.handleRateLimitExceeded(socket, event, clientLimit, applicableRule, info);
    }

    return { allowed, info, rule: applicableRule.name };
  }

  // 记录请求
  recordRequest(socket: Socket, event: string, success: boolean, userId?: number): void {
    const clientKey = this.generateClientKey(socket, userId);
    const clientLimit = this.getOrCreateClientLimit(clientKey, socket, userId);

    const applicableRule = this.getApplicableRule(event);
    if (!applicableRule) return;

    // 根据规则配置决定是否记录此请求
    const shouldRecord =
      (!applicableRule.config.skipSuccessfulRequests || !success) &&
      (!applicableRule.config.skipFailedRequests || success);

    if (shouldRecord) {
      const request: RequestRecord = {
        timestamp: new Date(),
        event,
        success,
        ip: socket.handshake.address,
      };

      clientLimit.requests.push(request);
      clientLimit.totalRequests++;

      // 清理旧请求记录
      this.cleanupOldRequests(clientLimit, applicableRule.config.windowMs);
    }
  }

  // 处理速率限制超出
  private async handleRateLimitExceeded(
    socket: Socket,
    event: string,
    clientLimit: ClientRateLimit,
    rule: RateLimitRule,
    info: RateLimitInfo,
  ): Promise<void> {
    clientLimit.violationCount++;
    clientLimit.lastViolation = new Date();

    // 根据违规次数决定阻止时间
    const blockDuration = this.calculateBlockDuration(clientLimit.violationCount);
    clientLimit.blocked = true;
    clientLimit.blockedUntil = new Date(Date.now() + blockDuration);

    this.logger.warn(
      `Rate limit exceeded for socket ${socket.id} (user: ${clientLimit.userId}) ` +
        `on event '${event}' using rule '${rule.name}'. ` +
        `Violation count: ${clientLimit.violationCount}, blocked for ${blockDuration}ms`,
    );

    // 发送限制通知给客户端
    socket.emit('rate_limit_exceeded', {
      event,
      rule: rule.name,
      info,
      blockedUntil: clientLimit.blockedUntil,
      violationCount: clientLimit.violationCount,
    });

    // 发送内部事件
    this.eventEmitter.emit('websocket.rate_limit.exceeded', {
      socketId: socket.id,
      userId: clientLimit.userId,
      event,
      rule: rule.name,
      info,
      violationCount: clientLimit.violationCount,
      timestamp: new Date(),
    });

    // 执行规则的自定义回调
    if (rule.config.onLimitReached) {
      rule.config.onLimitReached(socket, info);
    }

    // 严重违规时断开连接
    if (clientLimit.violationCount >= 5) {
      this.logger.error(`Disconnecting socket ${socket.id} due to repeated rate limit violations`);

      socket.emit('rate_limit_ban', {
        reason: 'Repeated rate limit violations',
        violationCount: clientLimit.violationCount,
        banDuration: blockDuration,
      });

      socket.disconnect(true);

      this.eventEmitter.emit('websocket.rate_limit.ban', {
        socketId: socket.id,
        userId: clientLimit.userId,
        violationCount: clientLimit.violationCount,
        timestamp: new Date(),
      });
    }
  }

  // 生成客户端唯一标识
  private generateClientKey(socket: Socket, userId?: number): string {
    // 优先使用用户ID，其次使用IP地址
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${socket.handshake.address}`;
  }

  // 获取适用的规则
  private getApplicableRule(event: string): RateLimitRule | null {
    // 首先查找事件特定的规则
    for (const rule of this.rules.values()) {
      if (rule.events && rule.events.includes(event)) {
        return rule;
      }
    }

    // 如果没有找到特定规则，使用通用规则
    return this.rules.get('general') || null;
  }

  // 获取或创建客户端限制记录
  private getOrCreateClientLimit(
    clientKey: string,
    socket: Socket,
    userId?: number,
  ): ClientRateLimit {
    if (!this.clientLimits.has(clientKey)) {
      this.clientLimits.set(clientKey, {
        socketId: socket.id,
        userId,
        requests: [],
        blocked: false,
        totalRequests: 0,
        violationCount: 0,
      });
    }

    return this.clientLimits.get(clientKey)!;
  }

  // 获取窗口内的请求数
  private getRequestsInWindow(clientLimit: ClientRateLimit, windowMs: number): number {
    const windowStart = new Date(Date.now() - windowMs);
    return clientLimit.requests.filter(req => req.timestamp >= windowStart).length;
  }

  // 计算重置时间
  private calculateResetTime(clientLimit: ClientRateLimit, windowMs: number): number {
    if (clientLimit.requests.length === 0) return 0;

    const oldestRequest = clientLimit.requests[0];
    const resetTime = oldestRequest.timestamp.getTime() + windowMs;
    return Math.max(0, resetTime - Date.now());
  }

  // 计算阻止时间
  private calculateBlockDuration(violationCount: number): number {
    // 指数退避：1分钟 -> 5分钟 -> 15分钟 -> 30分钟 -> 1小时
    const baseDuration = 60 * 1000; // 1分钟
    const multipliers = [1, 5, 15, 30, 60];
    const multiplier = multipliers[Math.min(violationCount - 1, multipliers.length - 1)];
    return baseDuration * multiplier;
  }

  // 清理旧请求记录
  private cleanupOldRequests(clientLimit: ClientRateLimit, windowMs: number): void {
    const cutoff = new Date(Date.now() - windowMs);
    clientLimit.requests = clientLimit.requests.filter(req => req.timestamp >= cutoff);
  }

  // 清理过期数据
  private cleanupExpiredData(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, clientLimit] of this.clientLimits.entries()) {
      // 清理过期的阻止状态
      if (clientLimit.blocked && clientLimit.blockedUntil && clientLimit.blockedUntil <= now) {
        clientLimit.blocked = false;
        clientLimit.blockedUntil = undefined;
      }

      // 清理长时间未活动的客户端记录
      const lastActivity =
        clientLimit.requests.length > 0
          ? clientLimit.requests[clientLimit.requests.length - 1].timestamp
          : new Date(0);

      const inactiveTime = now.getTime() - lastActivity.getTime();
      const maxInactiveTime = 24 * 60 * 60 * 1000; // 24小时

      if (inactiveTime > maxInactiveTime) {
        this.clientLimits.delete(key);
        cleanedCount++;
      } else {
        // 清理旧请求记录
        const maxAge = 60 * 60 * 1000; // 1小时
        this.cleanupOldRequests(clientLimit, maxAge);
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} inactive client rate limit records`);
    }
  }

  // 添加自定义规则
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.name, rule);
    this.logger.log(`Added rate limit rule: ${rule.name}`);
  }

  // 移除规则
  removeRule(ruleName: string): boolean {
    const removed = this.rules.delete(ruleName);
    if (removed) {
      this.logger.log(`Removed rate limit rule: ${ruleName}`);
    }
    return removed;
  }

  // 更新规则
  updateRule(ruleName: string, config: Partial<RateLimitConfig>): boolean {
    const rule = this.rules.get(ruleName);
    if (rule) {
      rule.config = { ...rule.config, ...config };
      this.logger.log(`Updated rate limit rule: ${ruleName}`);
      return true;
    }
    return false;
  }

  // 获取客户端状态
  getClientStatus(socket: Socket, userId?: number): ClientRateLimit | null {
    const clientKey = this.generateClientKey(socket, userId);
    return this.clientLimits.get(clientKey) || null;
  }

  // 重置客户端限制
  resetClientLimit(socket: Socket, userId?: number): boolean {
    const clientKey = this.generateClientKey(socket, userId);
    const deleted = this.clientLimits.delete(clientKey);
    if (deleted) {
      this.logger.log(`Reset rate limit for client: ${clientKey}`);
    }
    return deleted;
  }

  // 获取统计信息
  getStats() {
    const stats = {
      totalClients: this.clientLimits.size,
      blockedClients: 0,
      totalRequests: 0,
      totalViolations: 0,
      activeRules: this.rules.size,
      ruleNames: Array.from(this.rules.keys()),
    };

    for (const clientLimit of this.clientLimits.values()) {
      if (clientLimit.blocked) {
        stats.blockedClients++;
      }
      stats.totalRequests += clientLimit.totalRequests;
      stats.totalViolations += clientLimit.violationCount;
    }

    return stats;
  }

  // 获取规则列表
  getRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  // 手动阻止客户端
  blockClient(socket: Socket, duration: number, reason: string, userId?: number): void {
    const clientKey = this.generateClientKey(socket, userId);
    const clientLimit = this.getOrCreateClientLimit(clientKey, socket, userId);

    clientLimit.blocked = true;
    clientLimit.blockedUntil = new Date(Date.now() + duration);
    clientLimit.violationCount++;

    socket.emit('rate_limit_manual_block', {
      reason,
      duration,
      blockedUntil: clientLimit.blockedUntil,
    });

    this.logger.warn(`Manually blocked client ${clientKey} for ${duration}ms. Reason: ${reason}`);
  }

  // 解除客户端阻止
  unblockClient(socket: Socket, userId?: number): boolean {
    const clientKey = this.generateClientKey(socket, userId);
    const clientLimit = this.clientLimits.get(clientKey);

    if (clientLimit && clientLimit.blocked) {
      clientLimit.blocked = false;
      clientLimit.blockedUntil = undefined;

      socket.emit('rate_limit_unblocked', {
        timestamp: new Date(),
      });

      this.logger.log(`Unblocked client: ${clientKey}`);
      return true;
    }

    return false;
  }
}
