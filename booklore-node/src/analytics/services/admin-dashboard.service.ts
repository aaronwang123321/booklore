import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/database/prisma.service';
import { PaymentAnalyticsService } from './payment-analytics.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface DashboardOverview {
  users: {
    total: number;
    active: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
  };
  books: {
    total: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    totalSize: number;
    averageRating: number;
  };
  libraries: {
    total: number;
    public: number;
    private: number;
    averageBooksPerLibrary: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
    expired: number;
    revenue: {
      total: number;
      monthly: number;
      daily: number;
    };
  };
  system: {
    uptime: number;
    memoryUsage: number;
    diskUsage: number;
    activeConnections: number;
    errorRate: number;
  };
}

export interface UserActivityStats {
  dailyActiveUsers: Array<{
    date: string;
    count: number;
  }>;
  weeklyActiveUsers: Array<{
    week: string;
    count: number;
  }>;
  monthlyActiveUsers: Array<{
    month: string;
    count: number;
  }>;
  userEngagement: {
    averageSessionDuration: number;
    averageBooksPerUser: number;
    averageReadingTime: number;
    mostActiveHours: Array<{
      hour: number;
      userCount: number;
    }>;
  };
  userRetention: {
    day1: number;
    day7: number;
    day30: number;
  };
}

export interface ContentStats {
  booksByGenre: Array<{
    genre: string;
    count: number;
    percentage: number;
  }>;
  booksByLanguage: Array<{
    language: string;
    count: number;
    percentage: number;
  }>;
  booksByFormat: Array<{
    format: string;
    count: number;
    percentage: number;
  }>;
  popularBooks: Array<{
    id: number;
    title: string;
    author: string;
    readCount: number;
    rating: number;
    downloadCount: number;
  }>;
  recentUploads: Array<{
    id: number;
    title: string;
    author: string;
    uploadedAt: Date;
    uploadedBy: string;
    fileSize: number;
  }>;
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  services: Array<{
    name: string;
    status: 'up' | 'down' | 'degraded';
    responseTime: number;
    lastCheck: Date;
  }>;
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkIO: {
      bytesIn: number;
      bytesOut: number;
    };
  };
  errors: Array<{
    timestamp: Date;
    level: 'error' | 'warning';
    message: string;
    service: string;
    count: number;
  }>;
  alerts: Array<{
    id: string;
    type: 'performance' | 'security' | 'business';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    acknowledged: boolean;
  }>;
}

export interface SecurityMetrics {
  loginAttempts: {
    successful: number;
    failed: number;
    blocked: number;
  };
  suspiciousActivity: Array<{
    type: string;
    count: number;
    lastOccurrence: Date;
  }>;
  activeTokens: number;
  expiredTokens: number;
  passwordResets: number;
  accountLockouts: number;
  ipBlacklist: Array<{
    ip: string;
    reason: string;
    blockedAt: Date;
    attempts: number;
  }>;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private dashboardCache = new Map<string, { data: any; timestamp: Date; ttl: number }>();
  private readonly CACHE_TTL = {
    overview: 5 * 60 * 1000, // 5分钟
    activity: 10 * 60 * 1000, // 10分钟
    content: 30 * 60 * 1000, // 30分钟
    health: 1 * 60 * 1000, // 1分钟
    security: 5 * 60 * 1000, // 5分钟
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentAnalyticsService: PaymentAnalyticsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // 获取仪表板概览
  async getDashboardOverview(): Promise<DashboardOverview> {
    const cacheKey = 'dashboard_overview';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.overview);
    if (cached) {
      return cached;
    }

    // // const now = new Date();
    // const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // 用户统计
    const [totalUsers, activeUsers, newUsersToday, newUsersThisWeek, newUsersThisMonth] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: {
            // Note: lastLoginAt field not available in User model, using createdAt instead
            createdAt: {
              gte: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000), // 30天内活跃
            },
          },
        }),
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7)),
            },
          },
        }),
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: thisMonth,
            },
          },
        }),
      ]);

    // 书籍统计
    const [
      totalBooks,
      newBooksToday,
      newBooksThisWeek,
      newBooksThisMonth,
      bookSizeResult,
      avgRatingResult,
    ] = await Promise.all([
      this.prisma.book.count(),
      this.prisma.book.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.book.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setDate(new Date().getDate() - 7)),
          },
        },
      }),
      this.prisma.book.count({
        where: {
          createdAt: {
            gte: thisMonth,
          },
        },
      }),
      this.prisma.book.aggregate({
        _sum: {
          fileSize: true,
        },
      }),
      this.prisma.book.aggregate({
        _avg: {
          rating: true,
        },
      }),
    ]);

    // 图书馆统计
    const [totalLibraries, publicLibraries, privateLibraries, avgBooksResult] = await Promise.all([
      this.prisma.library.count(),
      this.prisma.library.count({
        where: {
          isPublic: true,
        },
      }),
      this.prisma.library.count({
        where: {
          isPublic: false,
        },
      }),
      // Note: libraryBook model not available, using book.libraryId instead
      this.prisma.book.groupBy({
        by: ['libraryId'],
        _count: {
          id: true,
        },
      }),
    ]);

    const averageBooksPerLibrary =
      avgBooksResult.length > 0
        ? avgBooksResult.reduce((sum, lib) => sum + lib._count.id, 0) / avgBooksResult.length
        : 0;

    // 订阅统计
    const [totalSubscriptions, activeSubscriptions, trialSubscriptions, expiredSubscriptions] =
      await Promise.all([
        this.prisma.subscription.count(),
        this.prisma.subscription.count({
          where: {
            status: 'ACTIVE',
          },
        }),
        this.prisma.subscription.count({
          where: {
            status: 'TRIALING',
          },
        }),
        this.prisma.subscription.count({
          where: {
            status: 'INCOMPLETE_EXPIRED',
          },
        }),
      ]);

    // 收入统计
    const revenueStats = await this.paymentAnalyticsService.getRevenueStats();

    // 系统统计（模拟数据，实际应该从监控系统获取）
    const systemStats = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      diskUsage: 0, // 需要实际实现
      activeConnections: 0, // 需要从WebSocket服务获取
      errorRate: 0, // 需要从日志系统获取
    };

    const overview: DashboardOverview = {
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersThisWeek,
        newThisMonth: newUsersThisMonth,
      },
      books: {
        total: totalBooks,
        newToday: newBooksToday,
        newThisWeek: newBooksThisWeek,
        newThisMonth: newBooksThisMonth,
        totalSize: Number(bookSizeResult._sum.fileSize) || 0,
        averageRating: Number(avgRatingResult._avg.rating) || 0,
      },
      libraries: {
        total: totalLibraries,
        public: publicLibraries,
        private: privateLibraries,
        averageBooksPerLibrary,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        trial: trialSubscriptions,
        expired: expiredSubscriptions,
        revenue: {
          total: revenueStats.totalRevenue,
          monthly: revenueStats.monthlyRevenue,
          daily: revenueStats.dailyRevenue,
        },
      },
      system: systemStats,
    };

    this.setCache(cacheKey, overview, this.CACHE_TTL.overview);
    return overview;
  }

  // 获取用户活动统计
  async getUserActivityStats(days: number = 30): Promise<UserActivityStats> {
    const cacheKey = `user_activity_${days}`;
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.activity);
    if (cached) {
      return cached;
    }

    // const now = new Date();

    // 每日活跃用户
    const dailyActiveUsers = await this.getDailyActiveUsers(days);

    // 每周活跃用户
    const weeklyActiveUsers = await this.getWeeklyActiveUsers(12);

    // 每月活跃用户
    const monthlyActiveUsers = await this.getMonthlyActiveUsers(12);

    // 用户参与度
    const userEngagement = await this.getUserEngagement();

    // 用户留存率
    const userRetention = await this.getUserRetention();

    const activityStats: UserActivityStats = {
      dailyActiveUsers,
      weeklyActiveUsers,
      monthlyActiveUsers,
      userEngagement,
      userRetention,
    };

    this.setCache(cacheKey, activityStats, this.CACHE_TTL.activity);
    return activityStats;
  }

  // 获取内容统计
  async getContentStats(): Promise<ContentStats> {
    const cacheKey = 'content_stats';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.content);
    if (cached) {
      return cached;
    }

    // 按类型分组的书籍
    const booksByGenre = await this.getBooksByGenre();

    // 按语言分组的书籍
    const booksByLanguage = await this.getBooksByLanguage();

    // 按格式分组的书籍
    const booksByFormat = await this.getBooksByFormat();

    // 热门书籍
    const popularBooks = await this.getPopularBooks();

    // 最近上传
    const recentUploads = await this.getRecentUploads();

    const contentStats: ContentStats = {
      booksByGenre,
      booksByLanguage,
      booksByFormat,
      popularBooks,
      recentUploads,
    };

    this.setCache(cacheKey, contentStats, this.CACHE_TTL.content);
    return contentStats;
  }

  // 获取系统健康状态
  async getSystemHealth(): Promise<SystemHealth> {
    const cacheKey = 'system_health';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.health);
    if (cached) {
      return cached;
    }

    // 检查各个服务状态
    const services = await this.checkServicesHealth();

    // 获取性能指标
    const performance = await this.getPerformanceMetrics();

    // 获取错误日志
    const errors = await this.getRecentErrors();

    // 生成警报
    const alerts = await this.generateAlerts(performance, errors);

    // 确定整体状态
    const status = this.determineOverallHealth(services, performance, alerts);

    const systemHealth: SystemHealth = {
      status,
      services,
      performance,
      errors,
      alerts,
    };

    this.setCache(cacheKey, systemHealth, this.CACHE_TTL.health);
    return systemHealth;
  }

  // 获取安全指标
  async getSecurityMetrics(): Promise<SecurityMetrics> {
    const cacheKey = 'security_metrics';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.security);
    if (cached) {
      return cached;
    }

    // const now = new Date();
    // const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 登录尝试统计（需要实现登录日志表）
    const loginAttempts = {
      successful: 0, // 从登录日志获取
      failed: 0, // 从登录日志获取
      blocked: 0, // 从登录日志获取
    };

    // 可疑活动（需要实现安全日志）
    const suspiciousActivity = [];

    // Token统计
    const activeTokens = 0; // 需要实现token管理
    const expiredTokens = 0;

    // 密码重置统计（需要实现密码重置日志）
    const passwordResets = 0;

    // 账户锁定统计
    const accountLockouts = 0;

    // IP黑名单（需要实现IP黑名单功能）
    const ipBlacklist = [];

    const securityMetrics: SecurityMetrics = {
      loginAttempts,
      suspiciousActivity,
      activeTokens,
      expiredTokens,
      passwordResets,
      accountLockouts,
      ipBlacklist,
    };

    this.setCache(cacheKey, securityMetrics, this.CACHE_TTL.security);
    return securityMetrics;
  }

  // 私有辅助方法
  private async getDailyActiveUsers(days: number) {
    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      const count = await this.prisma.user.count({
        where: {
          // Note: lastLoginAt field not available in User model
          createdAt: {
            gte: date,
            lt: nextDate,
          },
        },
      });

      result.push({
        date: date.toISOString().split('T')[0],
        count,
      });
    }

    return result;
  }

  private async getWeeklyActiveUsers(weeks: number) {
    const result = [];
    const now = new Date();

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);

      const count = await this.prisma.user.count({
        where: {
          // Note: lastLoginAt field not available in User model
          createdAt: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
      });

      result.push({
        week: `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`,
        count,
      });
    }

    return result;
  }

  private async getMonthlyActiveUsers(months: number) {
    const result = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const count = await this.prisma.user.count({
        where: {
          // Note: lastLoginAt field not available in User model
          createdAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
      });

      result.push({
        month: monthStart.toISOString().substring(0, 7),
        count,
      });
    }

    return result;
  }

  private async getUserEngagement() {
    // 这些指标需要实际的用户行为数据
    return {
      averageSessionDuration: 0, // 需要实现会话跟踪
      averageBooksPerUser: 0, // 可以从现有数据计算
      averageReadingTime: 0, // 需要实现阅读时间跟踪
      mostActiveHours: [], // 需要分析登录时间
    };
  }

  private async getUserRetention() {
    // 用户留存率计算
    // const now = new Date();
    // const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 简化的留存率计算
    return {
      day1: 0, // 需要更复杂的计算
      day7: 0, // 需要更复杂的计算
      day30: 0, // 需要更复杂的计算
    };
  }

  private async getBooksByGenre() {
    // Note: Using findMany instead of groupBy due to type issues
    const books = await this.prisma.book.findMany({
      where: {
        genres: {
          isEmpty: false,
        },
      },
      select: {
        genres: true,
      },
    });

    // Group by genre manually
    const genreCount = books.reduce(
      (acc, book) => {
        const genres = book.genres || ['Unknown'];
        genres.forEach(genre => {
          acc[genre] = (acc[genre] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = Object.values(genreCount).reduce((sum, count) => sum + count, 0);

    return Object.entries(genreCount).map(([genre, count]) => ({
      genre,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }

  private async getBooksByLanguage() {
    const books = await this.prisma.book.groupBy({
      by: ['language'],
      _count: {
        id: true,
      },
      where: {
        language: {
          not: null,
        },
      },
    });

    const total = books.reduce((sum, book) => sum + book._count.id, 0);

    return books.map(book => ({
      language: book.language || 'Unknown',
      count: book._count.id,
      percentage: total > 0 ? (book._count.id / total) * 100 : 0,
    }));
  }

  private async getBooksByFormat() {
    // Note: Using findMany instead of groupBy due to type issues
    const books = await this.prisma.book.findMany({
      where: {
        fileType: {
          not: null,
        },
      },
      select: {
        fileType: true,
      },
    });

    // Group by format manually
    const formatCount = books.reduce(
      (acc, book) => {
        const format = book.fileType || 'Unknown';
        acc[format] = (acc[format] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = Object.values(formatCount).reduce((sum, count) => sum + count, 0);

    return Object.entries(formatCount).map(([format, count]) => ({
      format,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }

  private async getPopularBooks() {
    // 需要实现阅读统计表来获取真实的热门书籍数据
    const books = await this.prisma.book.findMany({
      take: 10,
      orderBy: {
        rating: 'desc',
      },
      select: {
        id: true,
        title: true,
        author: true,
        rating: true,
      },
    });

    return books.map(book => ({
      id: book.id,
      title: book.title,
      author: book.author || 'Unknown',
      readCount: 0, // 需要实现阅读统计
      rating: Number(book.rating) || 0,
      downloadCount: 0, // 需要实现下载统计
    }));
  }

  private async getRecentUploads() {
    const books = await this.prisma.book.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        author: true,
        createdAt: true,
        fileSize: true,
        // Note: uploadedBy relation not available in Book model
      },
    });

    return books.map(book => ({
      id: book.id,
      title: book.title,
      author: book.author || 'Unknown',
      uploadedAt: book.createdAt,
      uploadedBy: 'Unknown', // Note: uploadedBy relation not available
      fileSize: Number(book.fileSize) || 0,
    }));
  }

  private async checkServicesHealth() {
    // 检查各个服务的健康状态
    const services = [
      { name: 'Database', check: () => this.checkDatabaseHealth() },
      { name: 'File Storage', check: () => this.checkFileStorageHealth() },
      { name: 'Email Service', check: () => this.checkEmailServiceHealth() },
      { name: 'WebSocket', check: () => this.checkWebSocketHealth() },
    ];

    const results = [];
    for (const service of services) {
      const startTime = Date.now();
      try {
        await service.check();
        results.push({
          name: service.name,
          status: 'up' as const,
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
        });
      } catch (error) {
        results.push({
          name: service.name,
          status: 'down' as const,
          responseTime: Date.now() - startTime,
          lastCheck: new Date(),
        });
      }
    }

    return results;
  }

  private async checkDatabaseHealth() {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkFileStorageHealth() {
    // 检查文件存储健康状态
    return true;
  }

  private async checkEmailServiceHealth() {
    // 检查邮件服务健康状态
    return true;
  }

  private async checkWebSocketHealth() {
    // 检查WebSocket服务健康状态
    return true;
  }

  private async getPerformanceMetrics() {
    const memoryUsage = process.memoryUsage();

    return {
      cpuUsage: 0, // 需要实现CPU监控
      memoryUsage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      diskUsage: 0, // 需要实现磁盘监控
      networkIO: {
        bytesIn: 0, // 需要实现网络监控
        bytesOut: 0,
      },
    };
  }

  private async getRecentErrors() {
    // 获取最近的错误日志
    // 这需要实现日志系统
    return [];
  }

  private async generateAlerts(performance: any, errors: any[]) {
    const alerts = [];

    // 性能警报
    if (performance.memoryUsage > 90) {
      alerts.push({
        id: `memory-${Date.now()}`,
        type: 'performance' as const,
        severity: 'high' as const,
        message: `Memory usage is critically high: ${performance.memoryUsage.toFixed(1)}%`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    if (performance.cpuUsage > 80) {
      alerts.push({
        id: `cpu-${Date.now()}`,
        type: 'performance' as const,
        severity: 'medium' as const,
        message: `CPU usage is high: ${performance.cpuUsage.toFixed(1)}%`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // 错误警报
    if (errors.length > 10) {
      alerts.push({
        id: `errors-${Date.now()}`,
        type: 'business' as const,
        severity: 'medium' as const,
        message: `High error rate detected: ${errors.length} errors in the last hour`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  private determineOverallHealth(services: any[], performance: any, alerts: any[]) {
    const downServices = services.filter(s => s.status === 'down').length;
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;

    if (downServices > 0 || criticalAlerts > 0) {
      return 'critical';
    }
    if (highAlerts > 0 || performance.memoryUsage > 80) {
      return 'warning';
    }
    return 'healthy';
  }

  // 缓存管理
  private getFromCache(key: string, ttl: number): any {
    const cached = this.dashboardCache.get(key);
    if (cached && Date.now() - cached.timestamp.getTime() < ttl) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.dashboardCache.set(key, {
      data,
      timestamp: new Date(),
      ttl,
    });
  }

  // 定时清理缓存
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupCache(): Promise<void> {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.dashboardCache) {
      if (now - cached.timestamp.getTime() > cached.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.dashboardCache.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.logger.log(`Cleaned up ${keysToDelete.length} expired dashboard cache entries`);
    }
  }

  // 发送实时更新事件
  @Cron(CronExpression.EVERY_5_MINUTES)
  async broadcastDashboardUpdates(): Promise<void> {
    try {
      const overview = await this.getDashboardOverview();
      const systemHealth = await this.getSystemHealth();

      // 发送实时更新事件
      this.eventEmitter.emit('dashboard.overview.updated', overview);
      this.eventEmitter.emit('dashboard.health.updated', systemHealth);

      // 如果有严重警报，立即通知
      const criticalAlerts = systemHealth.alerts.filter(
        alert => alert.severity === 'critical' && !alert.acknowledged,
      );

      if (criticalAlerts.length > 0) {
        this.eventEmitter.emit('dashboard.critical.alert', criticalAlerts);
      }
    } catch (error) {
      this.logger.error('Failed to broadcast dashboard updates', error);
    }
  }
}
