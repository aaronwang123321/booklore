import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/database/prisma.service';

export interface RevenueStats {
  totalRevenue: number;
  monthlyRevenue: number;
  dailyRevenue: number;
  yearlyRevenue: number;
  averageOrderValue: number;
  revenueGrowth: {
    monthly: number;
    daily: number;
    yearly: number;
  };
  topPlans: Array<{
    planId: string;
    planName: string;
    revenue: number;
    subscriptionCount: number;
  }>;
}

export interface SubscriptionAnalytics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  newSubscriptions: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  churnRate: {
    monthly: number;
    weekly: number;
  };
  retentionRate: {
    monthly: number;
    quarterly: number;
    yearly: number;
  };
  subscriptionsByPlan: Array<{
    planId: string;
    planName: string;
    count: number;
    percentage: number;
  }>;
  subscriptionTrends: Array<{
    date: string;
    newSubscriptions: number;
    canceledSubscriptions: number;
    netGrowth: number;
  }>;
}

export interface PaymentSuccessRateStats {
  overallSuccessRate: number;
  successRateByPeriod: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  failureReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  successRateByPaymentMethod: Array<{
    method: string;
    successRate: number;
    totalAttempts: number;
    successfulPayments: number;
  }>;
  retryAnalysis: {
    averageRetryAttempts: number;
    retrySuccessRate: number;
    totalRetries: number;
  };
}

export interface CustomerLifetimeValue {
  averageLTV: number;
  ltvByPlan: Array<{
    planId: string;
    planName: string;
    averageLTV: number;
    customerCount: number;
  }>;
  ltvDistribution: Array<{
    range: string;
    customerCount: number;
    percentage: number;
  }>;
}

export interface PaymentTrends {
  dailyTrends: Array<{
    date: string;
    revenue: number;
    transactionCount: number;
    successRate: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    revenue: number;
    transactionCount: number;
    newCustomers: number;
    churnedCustomers: number;
  }>;
  seasonalAnalysis: {
    peakMonths: string[];
    lowMonths: string[];
    seasonalityIndex: number;
  };
}

@Injectable()
export class PaymentAnalyticsService {
  private readonly logger = new Logger(PaymentAnalyticsService.name);

  // 缓存分析结果
  private analyticsCache = new Map<string, { data: any; timestamp: Date; ttl: number }>();
  private readonly CACHE_TTL = {
    revenue: 5 * 60 * 1000, // 5分钟
    subscriptions: 10 * 60 * 1000, // 10分钟
    success_rate: 5 * 60 * 1000, // 5分钟
    trends: 30 * 60 * 1000, // 30分钟
  };

  constructor(private readonly prisma: PrismaService) {}

  // 收入统计分析
  async getRevenueStats(startDate?: Date, endDate?: Date): Promise<RevenueStats> {
    const cacheKey = `revenue_stats_${startDate?.getTime()}_${endDate?.getTime()}`;
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.revenue);
    if (cached) {
      return cached;
    }

    // const now = new Date();
    // Date variables removed as they are not used in current implementation
    // const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // const thisYear = new Date(now.getFullYear(), 0, 1);
    // const lastYear = new Date(now.getFullYear() - 1, 0, 1);

    // 总收入
    // Note: Payment model not available in current schema
    const totalRevenueResult = { _sum: { amount: 0 } };

    // 月收入
    // Note: Payment model not available in current schema
    const monthlyRevenueResult = { _sum: { amount: 0 } };

    // 日收入
    // Note: Payment model not available in current schema
    const dailyRevenueResult = { _sum: { amount: 0 } };

    // 年收入
    // Note: Payment model not available in current schema
    const yearlyRevenueResult = { _sum: { amount: 0 } };

    // 上月收入（用于计算增长率）
    // const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Note: Payment model not available in current schema
    const lastMonthRevenueResult = { _sum: { amount: 0 } };

    // 去年收入（用于计算增长率）
    // Note: Payment model not available in current schema
    const lastYearRevenueResult = { _sum: { amount: 0 } };

    // 平均订单价值
    // Note: Payment model not available in current schema
    const avgOrderValueResult = { _avg: { amount: 0 } };

    // 按计划统计收入
    // Note: Payment model not available in current schema
    // const topPlansResult = await this.prisma.subscription.groupBy({
    //   by: ['plan'],
    //   _count: {
    //     id: true,
    //   },
    //   orderBy: {
    //     _count: {
    //       id: 'desc',
    //     },
    //   },
    //   take: 5,
    // });

    // 获取订阅计划信息
    // const subscriptionIds = topPlansResult.map(plan => plan.subscriptionId).filter(Boolean);
    // Note: plan relation not available in subscription model
    // const subscriptions = [];

    // Note: plan relation not available in subscription model
    const topPlans = [];

    const totalRevenue = Number(totalRevenueResult._sum.amount) || 0;
    const monthlyRevenue = Number(monthlyRevenueResult._sum.amount) || 0;
    const dailyRevenue = Number(dailyRevenueResult._sum.amount) || 0;
    const yearlyRevenue = Number(yearlyRevenueResult._sum.amount) || 0;
    const lastMonthRevenue = Number(lastMonthRevenueResult._sum.amount) || 0;
    const lastYearRevenue = Number(lastYearRevenueResult._sum.amount) || 0;

    const revenueStats: RevenueStats = {
      totalRevenue,
      monthlyRevenue,
      dailyRevenue,
      yearlyRevenue,
      averageOrderValue: Number(avgOrderValueResult._avg.amount) || 0,
      revenueGrowth: {
        monthly:
          lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0,
        daily: 0, // 需要昨天的数据来计算
        yearly:
          lastYearRevenue > 0 ? ((yearlyRevenue - lastYearRevenue) / lastYearRevenue) * 100 : 0,
      },
      topPlans,
    };

    this.setCache(cacheKey, revenueStats, this.CACHE_TTL.revenue);
    return revenueStats;
  }

  // 订阅分析
  async getSubscriptionAnalytics(): Promise<SubscriptionAnalytics> {
    const cacheKey = 'subscription_analytics';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.subscriptions);
    if (cached) {
      return cached;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    // 总订阅数
    const totalSubscriptions = await this.prisma.subscription.count();

    // 活跃订阅数
    const activeSubscriptions = await this.prisma.subscription.count({
      where: {
        status: 'ACTIVE',
      },
    });

    // 新订阅统计
    const newSubscriptionsToday = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: today,
        },
      },
    });

    const newSubscriptionsThisWeek = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: thisWeek,
        },
      },
    });

    const newSubscriptionsThisMonth = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: thisMonth,
        },
      },
    });

    // 流失率计算

    const canceledThisMonth = await this.prisma.subscription.count({
      where: {
        status: 'CANCELED',
        updatedAt: {
          gte: thisMonth,
        },
      },
    });

    const canceledThisWeek = await this.prisma.subscription.count({
      where: {
        status: 'CANCELED',
        updatedAt: {
          gte: thisWeek,
        },
      },
    });

    const activeAtStartOfMonth = await this.prisma.subscription.count({
      where: {
        createdAt: {
          lt: thisMonth,
        },
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'CANCELED',
            updatedAt: {
              gte: thisMonth,
            },
          },
        ],
      },
    });

    // 留存率计算
    const subscriptionsFromThreeMonthsAgo = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: threeMonthsAgo,
          lt: thisMonth,
        },
      },
    });

    const stillActiveFromThreeMonthsAgo = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: threeMonthsAgo,
          lt: thisMonth,
        },
        status: 'ACTIVE',
      },
    });

    const subscriptionsFromOneYearAgo = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: oneYearAgo,
          lt: new Date(oneYearAgo.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const stillActiveFromOneYearAgo = await this.prisma.subscription.count({
      where: {
        createdAt: {
          gte: oneYearAgo,
          lt: new Date(oneYearAgo.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        status: 'ACTIVE',
      },
    });

    // 按计划分组的订阅
    // Note: planId field not available in subscription model
    // const subscriptionsByPlan = [];

    // Note: subscriptionPlan model not available in current schema
    // const plans = [];

    // Note: subscriptionPlan model not available in current schema
    const subscriptionsByPlanWithNames = [];

    // 订阅趋势（最近30天）
    const subscriptionTrends = await this.getSubscriptionTrends(30);

    const analytics: SubscriptionAnalytics = {
      totalSubscriptions,
      activeSubscriptions,
      newSubscriptions: {
        today: newSubscriptionsToday,
        thisWeek: newSubscriptionsThisWeek,
        thisMonth: newSubscriptionsThisMonth,
      },
      churnRate: {
        monthly: activeAtStartOfMonth > 0 ? (canceledThisMonth / activeAtStartOfMonth) * 100 : 0,
        weekly: activeSubscriptions > 0 ? (canceledThisWeek / activeSubscriptions) * 100 : 0,
      },
      retentionRate: {
        monthly: 0, // 需要更复杂的计算
        quarterly:
          subscriptionsFromThreeMonthsAgo > 0
            ? (stillActiveFromThreeMonthsAgo / subscriptionsFromThreeMonthsAgo) * 100
            : 0,
        yearly:
          subscriptionsFromOneYearAgo > 0
            ? (stillActiveFromOneYearAgo / subscriptionsFromOneYearAgo) * 100
            : 0,
      },
      subscriptionsByPlan: subscriptionsByPlanWithNames,
      subscriptionTrends,
    };

    this.setCache(cacheKey, analytics, this.CACHE_TTL.subscriptions);
    return analytics;
  }

  // 支付成功率统计
  async getPaymentSuccessRateStats(): Promise<PaymentSuccessRateStats> {
    const cacheKey = 'payment_success_rate_stats';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.success_rate);
    if (cached) {
      return cached;
    }

    // const now = new Date();
    // const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 总体成功率
    // Note: Payment model not available in current schema
    const totalPayments = 0;
    // Note: Payment model not available in current schema
    const successfulPayments = 0;

    // 按时间段的成功率
    // Note: Payment model not available in current schema
    const todayTotal = 0;

    // Note: Payment model not available in current schema
    const todaySuccessful = 0;

    // Note: Payment model not available in current schema
    const thisWeekTotal = 0;

    // Note: Payment model not available in current schema
    const thisWeekSuccessful = 0;

    // Note: Payment model not available in current schema
    const thisMonthTotal = 0;

    // Note: Payment model not available in current schema
    const thisMonthSuccessful = 0;

    // 失败原因分析
    // Note: Payment model not available in current schema
    // const failureReasons = [];

    // const totalFailures = 0; // Payment model not available
    const topFailureReasons = []; // Payment model not available

    // 按支付方式的成功率
    // Note: Payment model not available in current schema
    // const paymentMethodStats = [];

    // Note: Payment model not available in current schema
    const successRateByPaymentMethod = [];

    // 重试分析
    // Note: Payment model not available in current schema
    const retriedPayments = [];

    const totalRetries = 0; // Payment model not available
    const successfulRetries = 0; // Payment model not available
    const averageRetryAttempts = 0; // Payment model not available

    const stats: PaymentSuccessRateStats = {
      overallSuccessRate: totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0,
      successRateByPeriod: {
        today: todayTotal > 0 ? (todaySuccessful / todayTotal) * 100 : 0,
        thisWeek: thisWeekTotal > 0 ? (thisWeekSuccessful / thisWeekTotal) * 100 : 0,
        thisMonth: thisMonthTotal > 0 ? (thisMonthSuccessful / thisMonthTotal) * 100 : 0,
      },
      failureReasons: topFailureReasons,
      successRateByPaymentMethod,
      retryAnalysis: {
        averageRetryAttempts,
        retrySuccessRate:
          retriedPayments.length > 0 ? (successfulRetries / retriedPayments.length) * 100 : 0,
        totalRetries,
      },
    };

    this.setCache(cacheKey, stats, this.CACHE_TTL.success_rate);
    return stats;
  }

  // 客户生命周期价值分析
  async getCustomerLifetimeValue(): Promise<CustomerLifetimeValue> {
    const cacheKey = 'customer_lifetime_value';
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.trends);
    if (cached) {
      return cached;
    }

    // 计算每个用户的LTV
    // Note: Payment model not available in current schema
    const userLTVs = [];

    // const totalLTV = 0; // Payment model not available
    const averageLTV = 0; // Payment model not available

    // 按计划分组的LTV
    const ltvByPlan = await this.getLTVByPlan();

    // LTV分布
    const ltvDistribution = this.calculateLTVDistribution(userLTVs);

    const clv: CustomerLifetimeValue = {
      averageLTV,
      ltvByPlan,
      ltvDistribution,
    };

    this.setCache(cacheKey, clv, this.CACHE_TTL.trends);
    return clv;
  }

  // 支付趋势分析
  async getPaymentTrends(days: number = 30): Promise<PaymentTrends> {
    const cacheKey = `payment_trends_${days}`;
    const cached = this.getFromCache(cacheKey, this.CACHE_TTL.trends);
    if (cached) {
      return cached;
    }

    const dailyTrends = await this.getDailyTrends(days);
    const monthlyTrends = await this.getMonthlyTrends(12);
    const seasonalAnalysis = await this.getSeasonalAnalysis();

    const trends: PaymentTrends = {
      dailyTrends,
      monthlyTrends,
      seasonalAnalysis,
    };

    this.setCache(cacheKey, trends, this.CACHE_TTL.trends);
    return trends;
  }

  // 私有辅助方法
  private async getSubscriptionTrends(days: number) {
    const trends = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      // const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      const newSubscriptions = await this.prisma.subscription.count({
        where: {
          createdAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      const canceledSubscriptions = await this.prisma.subscription.count({
        where: {
          status: 'CANCELED',
          updatedAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      trends.push({
        date: date.toISOString().split('T')[0],
        newSubscriptions,
        canceledSubscriptions,
        netGrowth: newSubscriptions - canceledSubscriptions,
      });
    }

    return trends;
  }

  private async getLTVByPlan() {
    // Note: SubscriptionPlan model not available in current schema
    const plans = [];
    const ltvByPlan = [];

    for (const plan of plans) {
      const subscriptions = await this.prisma.subscription.findMany({
        where: { plan: plan.name },
        // Note: payments relation not available in current schema
      });

      const totalRevenue = subscriptions.reduce((sum, _sub) => {
        // Note: payments calculation not available without payments relation
        return sum;
      }, 0);

      const averageLTV = subscriptions.length > 0 ? totalRevenue / subscriptions.length : 0;

      ltvByPlan.push({
        planId: plan.id.toString(),
        planName: plan.name,
        averageLTV,
        customerCount: subscriptions.length,
      });
    }

    return ltvByPlan;
  }

  private calculateLTVDistribution(userLTVs: any[]) {
    const ranges = [
      { min: 0, max: 50, label: '$0-$50' },
      { min: 50, max: 100, label: '$50-$100' },
      { min: 100, max: 250, label: '$100-$250' },
      { min: 250, max: 500, label: '$250-$500' },
      { min: 500, max: 1000, label: '$500-$1000' },
      { min: 1000, max: Infinity, label: '$1000+' },
    ];

    const distribution = ranges.map(range => {
      const count = userLTVs.filter(user => {
        const ltv = Number(user._sum.amount || 0);
        return ltv >= range.min && ltv < range.max;
      }).length;

      return {
        range: range.label,
        customerCount: count,
        percentage: userLTVs.length > 0 ? (count / userLTVs.length) * 100 : 0,
      };
    });

    return distribution;
  }

  private async getDailyTrends(days: number) {
    const trends = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      // const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      // Note: Payment model not available in current schema
      const dayPayments = [];

      const revenue = 0; // Payment model not available

      const transactionCount = dayPayments.length;
      const successfulCount = dayPayments.filter(p => p.status === 'completed').length;
      const successRate = transactionCount > 0 ? (successfulCount / transactionCount) * 100 : 0;

      trends.push({
        date: date.toISOString().split('T')[0],
        revenue,
        transactionCount,
        successRate,
      });
    }

    return trends;
  }

  private async getMonthlyTrends(months: number) {
    const trends = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      // const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      // Note: Payment model not available in current schema
      const monthPayments = [];

      const revenue = 0; // Payment model not available

      const newCustomers = await this.prisma.user.count({
        where: {
          createdAt: {
            gte: date,
            lt: new Date(now.getFullYear(), now.getMonth() - i + 1, 1),
          },
        },
      });

      const churnedCustomers = await this.prisma.subscription.count({
        where: {
          status: 'CANCELED',
          updatedAt: {
            gte: date,
            lt: new Date(now.getFullYear(), now.getMonth() - i + 1, 1),
          },
        },
      });

      trends.push({
        month: date.toISOString().substring(0, 7),
        revenue,
        transactionCount: monthPayments.length,
        newCustomers,
        churnedCustomers,
      });
    }

    return trends;
  }

  private async getSeasonalAnalysis() {
    // 简化的季节性分析
    const monthlyRevenue = await this.getMonthlyTrends(12);
    const revenues = monthlyRevenue.map(m => m.revenue);
    const avgRevenue = revenues.reduce((sum, r) => sum + r, 0) / revenues.length;

    const monthlyVariance = monthlyRevenue.map((m, index) => ({
      month: index + 1,
      variance: m.revenue - avgRevenue,
    }));

    const peakMonths = monthlyVariance
      .filter(m => m.variance > avgRevenue * 0.1)
      .map(m => new Date(2023, m.month - 1).toLocaleString('default', { month: 'long' }));

    const lowMonths = monthlyVariance
      .filter(m => m.variance < -avgRevenue * 0.1)
      .map(m => new Date(2023, m.month - 1).toLocaleString('default', { month: 'long' }));

    const seasonalityIndex = Math.max(...revenues) / Math.min(...revenues);

    return {
      peakMonths,
      lowMonths,
      seasonalityIndex,
    };
  }

  // 缓存管理
  private getFromCache(key: string, ttl: number): any {
    const cached = this.analyticsCache.get(key);
    if (cached && Date.now() - cached.timestamp.getTime() < ttl) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.analyticsCache.set(key, {
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

    for (const [key, cached] of this.analyticsCache) {
      if (now - cached.timestamp.getTime() > cached.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.analyticsCache.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.logger.log(`Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  // 生成综合报告
  async generateComprehensiveReport(startDate?: Date, endDate?: Date) {
    const [revenueStats, subscriptionAnalytics, successRateStats, customerLTV, paymentTrends] =
      await Promise.all([
        this.getRevenueStats(startDate, endDate),
        this.getSubscriptionAnalytics(),
        this.getPaymentSuccessRateStats(),
        this.getCustomerLifetimeValue(),
        this.getPaymentTrends(),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      period: {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      },
      revenue: revenueStats,
      subscriptions: subscriptionAnalytics,
      paymentSuccessRate: successRateStats,
      customerLifetimeValue: customerLTV,
      trends: paymentTrends,
    };
  }
}
