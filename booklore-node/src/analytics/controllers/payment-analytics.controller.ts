import { Controller, Get, Query, UseGuards, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PaymentAnalyticsService } from '../services/payment-analytics.service';
// import { ApiResponseDto } from '../../shared/dto/api-response.dto';

@ApiTags('Payment Analytics')
@Controller('analytics/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentAnalyticsController {
  constructor(private readonly paymentAnalyticsService: PaymentAnalyticsService) {}

  @Get('revenue')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取收入统计分析' })
  @ApiResponse({
    status: 200,
    description: '收入统计数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            totalRevenue: { type: 'number', example: 125000.5 },
            monthlyRevenue: { type: 'number', example: 15000.25 },
            dailyRevenue: { type: 'number', example: 500.75 },
            yearlyRevenue: { type: 'number', example: 180000.0 },
            averageOrderValue: { type: 'number', example: 29.99 },
            revenueGrowth: {
              type: 'object',
              properties: {
                monthly: { type: 'number', example: 12.5 },
                daily: { type: 'number', example: 5.2 },
                yearly: { type: 'number', example: 25.8 },
              },
            },
            topPlans: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  planId: { type: 'string', example: '1' },
                  planName: { type: 'string', example: 'Premium Plan' },
                  revenue: { type: 'number', example: 50000.0 },
                  subscriptionCount: { type: 'number', example: 1667 },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: '开始日期 (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: '结束日期 (YYYY-MM-DD)',
  })
  async getRevenueStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      if (start && isNaN(start.getTime())) {
        throw new HttpException('Invalid start date format', HttpStatus.BAD_REQUEST);
      }
      if (end && isNaN(end.getTime())) {
        throw new HttpException('Invalid end date format', HttpStatus.BAD_REQUEST);
      }
      if (start && end && start > end) {
        throw new HttpException('Start date cannot be after end date', HttpStatus.BAD_REQUEST);
      }

      const revenueStats = await this.paymentAnalyticsService.getRevenueStats(start, end);

      return {
        success: true,
        data: revenueStats,
        message: 'Revenue statistics retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve revenue statistics',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('subscriptions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取订阅分析数据' })
  @ApiResponse({
    status: 200,
    description: '订阅分析数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            totalSubscriptions: { type: 'number', example: 5000 },
            activeSubscriptions: { type: 'number', example: 4200 },
            newSubscriptions: {
              type: 'object',
              properties: {
                today: { type: 'number', example: 25 },
                thisWeek: { type: 'number', example: 180 },
                thisMonth: { type: 'number', example: 750 },
              },
            },
            churnRate: {
              type: 'object',
              properties: {
                monthly: { type: 'number', example: 5.2 },
                weekly: { type: 'number', example: 1.3 },
              },
            },
            retentionRate: {
              type: 'object',
              properties: {
                monthly: { type: 'number', example: 94.8 },
                quarterly: { type: 'number', example: 85.5 },
                yearly: { type: 'number', example: 72.3 },
              },
            },
            subscriptionsByPlan: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  planId: { type: 'string', example: '1' },
                  planName: { type: 'string', example: 'Basic Plan' },
                  count: { type: 'number', example: 2500 },
                  percentage: { type: 'number', example: 50.0 },
                },
              },
            },
            subscriptionTrends: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', example: '2024-01-15' },
                  newSubscriptions: { type: 'number', example: 25 },
                  canceledSubscriptions: { type: 'number', example: 5 },
                  netGrowth: { type: 'number', example: 20 },
                },
              },
            },
          },
        },
      },
    },
  })
  async getSubscriptionAnalytics(): Promise<any> {
    try {
      const subscriptionAnalytics = await this.paymentAnalyticsService.getSubscriptionAnalytics();

      return {
        success: true,
        data: subscriptionAnalytics,
        message: 'Subscription analytics retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve subscription analytics',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('success-rate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取支付成功率统计' })
  @ApiResponse({
    status: 200,
    description: '支付成功率统计数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            overallSuccessRate: { type: 'number', example: 94.5 },
            successRateByPeriod: {
              type: 'object',
              properties: {
                today: { type: 'number', example: 96.2 },
                thisWeek: { type: 'number', example: 95.1 },
                thisMonth: { type: 'number', example: 94.8 },
              },
            },
            failureReasons: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reason: { type: 'string', example: 'insufficient_funds' },
                  count: { type: 'number', example: 125 },
                  percentage: { type: 'number', example: 45.5 },
                },
              },
            },
            successRateByPaymentMethod: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  method: { type: 'string', example: 'credit_card' },
                  successRate: { type: 'number', example: 95.2 },
                  totalAttempts: { type: 'number', example: 5000 },
                  successfulPayments: { type: 'number', example: 4760 },
                },
              },
            },
            retryAnalysis: {
              type: 'object',
              properties: {
                averageRetryAttempts: { type: 'number', example: 1.8 },
                retrySuccessRate: { type: 'number', example: 65.3 },
                totalRetries: { type: 'number', example: 890 },
              },
            },
          },
        },
      },
    },
  })
  async getPaymentSuccessRateStats(): Promise<any> {
    try {
      const successRateStats = await this.paymentAnalyticsService.getPaymentSuccessRateStats();

      return {
        success: true,
        data: successRateStats,
        message: 'Payment success rate statistics retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve payment success rate statistics',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('customer-lifetime-value')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取客户生命周期价值分析' })
  @ApiResponse({
    status: 200,
    description: '客户生命周期价值数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            averageLTV: { type: 'number', example: 156.75 },
            ltvByPlan: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  planId: { type: 'string', example: '1' },
                  planName: { type: 'string', example: 'Premium Plan' },
                  averageLTV: { type: 'number', example: 245.5 },
                  customerCount: { type: 'number', example: 1250 },
                },
              },
            },
            ltvDistribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  range: { type: 'string', example: '$100-$250' },
                  customerCount: { type: 'number', example: 850 },
                  percentage: { type: 'number', example: 34.2 },
                },
              },
            },
          },
        },
      },
    },
  })
  async getCustomerLifetimeValue(): Promise<any> {
    try {
      const customerLTV = await this.paymentAnalyticsService.getCustomerLifetimeValue();

      return {
        success: true,
        data: customerLTV,
        message: 'Customer lifetime value analysis retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve customer lifetime value analysis',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('trends')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取支付趋势分析' })
  @ApiResponse({
    status: 200,
    description: '支付趋势分析数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            dailyTrends: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', example: '2024-01-15' },
                  revenue: { type: 'number', example: 1250.75 },
                  transactionCount: { type: 'number', example: 45 },
                  successRate: { type: 'number', example: 95.6 },
                },
              },
            },
            monthlyTrends: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  month: { type: 'string', example: '2024-01' },
                  revenue: { type: 'number', example: 38750.25 },
                  transactionCount: { type: 'number', example: 1350 },
                  newCustomers: { type: 'number', example: 125 },
                  churnedCustomers: { type: 'number', example: 15 },
                },
              },
            },
            seasonalAnalysis: {
              type: 'object',
              properties: {
                peakMonths: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['December', 'January', 'September'],
                },
                lowMonths: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['July', 'August'],
                },
                seasonalityIndex: { type: 'number', example: 1.45 },
              },
            },
          },
        },
      },
    },
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: '分析天数 (默认30天)' })
  async getPaymentTrends(@Query('days') days: string = '30'): Promise<any> {
    try {
      const daysNum = parseInt(days) || 30;
      if (daysNum < 1 || daysNum > 365) {
        throw new HttpException('Days must be between 1 and 365', HttpStatus.BAD_REQUEST);
      }

      const paymentTrends = await this.paymentAnalyticsService.getPaymentTrends(daysNum);

      return {
        success: true,
        data: paymentTrends,
        message: 'Payment trends analysis retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve payment trends analysis',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('comprehensive-report')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取综合分析报告' })
  @ApiResponse({
    status: 200,
    description: '综合分析报告',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            generatedAt: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
            period: {
              type: 'object',
              properties: {
                startDate: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
                endDate: { type: 'string', example: '2024-01-15T23:59:59.999Z' },
              },
            },
            revenue: { type: 'object', description: '收入统计数据' },
            subscriptions: { type: 'object', description: '订阅分析数据' },
            paymentSuccessRate: { type: 'object', description: '支付成功率数据' },
            customerLifetimeValue: { type: 'object', description: '客户生命周期价值数据' },
            trends: { type: 'object', description: '趋势分析数据' },
          },
        },
      },
    },
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: '开始日期 (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: '结束日期 (YYYY-MM-DD)',
  })
  async getComprehensiveReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      if (start && isNaN(start.getTime())) {
        throw new HttpException('Invalid start date format', HttpStatus.BAD_REQUEST);
      }
      if (end && isNaN(end.getTime())) {
        throw new HttpException('Invalid end date format', HttpStatus.BAD_REQUEST);
      }
      if (start && end && start > end) {
        throw new HttpException('Start date cannot be after end date', HttpStatus.BAD_REQUEST);
      }

      const comprehensiveReport = await this.paymentAnalyticsService.generateComprehensiveReport(
        start,
        end,
      );

      return {
        success: true,
        data: comprehensiveReport,
        message: 'Comprehensive analytics report generated successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate comprehensive analytics report',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('dashboard-summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '获取管理员仪表板摘要数据' })
  @ApiResponse({
    status: 200,
    description: '仪表板摘要数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            overview: {
              type: 'object',
              properties: {
                totalRevenue: { type: 'number', example: 125000.5 },
                monthlyRevenue: { type: 'number', example: 15000.25 },
                activeSubscriptions: { type: 'number', example: 4200 },
                paymentSuccessRate: { type: 'number', example: 94.5 },
                newCustomersToday: { type: 'number', example: 25 },
                churnRateThisMonth: { type: 'number', example: 5.2 },
              },
            },
            recentTrends: {
              type: 'object',
              properties: {
                revenueGrowth: { type: 'number', example: 12.5 },
                subscriptionGrowth: { type: 'number', example: 8.3 },
                successRateChange: { type: 'number', example: 1.2 },
              },
            },
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', example: 'warning' },
                  message: { type: 'string', example: 'Payment success rate dropped below 95%' },
                  severity: { type: 'string', example: 'medium' },
                },
              },
            },
          },
        },
      },
    },
  })
  async getDashboardSummary(): Promise<any> {
    try {
      // 获取关键指标
      const [revenueStats, subscriptionAnalytics, successRateStats] = await Promise.all([
        this.paymentAnalyticsService.getRevenueStats(),
        this.paymentAnalyticsService.getSubscriptionAnalytics(),
        this.paymentAnalyticsService.getPaymentSuccessRateStats(),
      ]);

      // 生成警报
      const alerts = [];
      if (successRateStats.overallSuccessRate < 95) {
        alerts.push({
          type: 'warning',
          message: `Payment success rate (${successRateStats.overallSuccessRate.toFixed(1)}%) is below 95%`,
          severity: 'medium',
        });
      }
      if (subscriptionAnalytics.churnRate.monthly > 10) {
        alerts.push({
          type: 'error',
          message: `Monthly churn rate (${subscriptionAnalytics.churnRate.monthly.toFixed(1)}%) is above 10%`,
          severity: 'high',
        });
      }
      if (revenueStats.revenueGrowth.monthly < 0) {
        alerts.push({
          type: 'warning',
          message: `Monthly revenue growth is negative (${revenueStats.revenueGrowth.monthly.toFixed(1)}%)`,
          severity: 'high',
        });
      }

      const dashboardSummary = {
        overview: {
          totalRevenue: revenueStats.totalRevenue,
          monthlyRevenue: revenueStats.monthlyRevenue,
          activeSubscriptions: subscriptionAnalytics.activeSubscriptions,
          paymentSuccessRate: successRateStats.overallSuccessRate,
          newCustomersToday: subscriptionAnalytics.newSubscriptions.today,
          churnRateThisMonth: subscriptionAnalytics.churnRate.monthly,
        },
        recentTrends: {
          revenueGrowth: revenueStats.revenueGrowth.monthly,
          subscriptionGrowth: 0, // 需要计算订阅增长率
          successRateChange: 0, // 需要计算成功率变化
        },
        alerts,
      };

      return {
        success: true,
        data: dashboardSummary,
        message: 'Dashboard summary retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve dashboard summary',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
